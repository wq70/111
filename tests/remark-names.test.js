const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function fixture() {
  const chat = { id: 'a', name: '小白', originalName: '白', settings: {}, history: [] };
  const context = vm.createContext({ window: {}, chat, console, Date,
    document: { getElementById: () => ({ value: '用户备注' }) },
    state: { qzoneSettings: { nickname: '林晓' } },
    appendMessage() {}, async syncCharacterNameInGroups() {} });
  vm.runInContext(source('modules/chat/remark-names.js'), context);
  vm.runInContext(source('modules/memory/extraction-support.js'), context);
  context.support = context.window.MemoryExtractionSupport;
  return { chat, context, names: context.window.RemarkNames };
}

test('角色、用户交替修改：保留本名、来源和旧备注；保存并清空历史后来源仍在', () => {
  const { chat, names } = fixture();
  const first = names.recordChange(chat, ' 小狐狸 ', 'character', 10);
  assert.equal(first.remarkChange.oldName, '小白');
  assert.equal(first.remarkChange.newName, '小狐狸');
  assert.equal(first.isHidden, undefined);
  assert.match(first.content, /^白将自己的聊天备注/);
  names.recordChange(chat, '乖狐狸', 'user', 20);
  assert.match(names.buildContext(chat), /最近一次修改.*林晓将白的聊天备注.*执行者：玩家/);
  names.recordChange(chat, '大狐狸', 'character', 30);
  assert.equal(chat.originalName, '白');
  assert.deepEqual(Array.from(chat.nameHistory), ['小白', '小狐狸', '乖狐狸']);
  const reloaded = JSON.parse(JSON.stringify(chat));
  reloaded.history = Array.from({ length: 50 }, (_, i) => ({ role: 'user', content: '闲聊', timestamp: 100 + i }));
  assert.equal(names.getCurrentChange(reloaded).actor, 'character');
  assert.match(names.buildContext(reloaded, reloaded.history.slice(-2)), /从 "乖狐狸" 修改为 "大狐狸"/);
  // 用户在系统时钟回拨后改名，不能被较晚时间戳的旧历史覆盖。
  names.recordChange(chat, '乖狐狸', 'user', 5);
  assert.equal(names.getCurrentChange(chat).actor, 'user');
});

test('空值、非字符串、重复备注和群聊不生成事件或覆盖来源', () => {
  const { chat, names } = fixture();
  names.recordChange(chat, '新备注', 'character', 1);
  for (const value of ['', '  ', null, {}, '新备注']) assert.equal(names.recordChange(chat, value, 'user', 2), null);
  assert.equal(chat.history.length, 1);
  assert.equal(chat.lastRemarkChange.actor, 'character');
  chat.isGroup = true;
  assert.equal(names.recordChange(chat, '群名', 'user'), null);
  assert.equal(names.buildContext(chat), '');
});

test('旧版明确事件恢复来源并去重；过期记录、普通对话和昵称修改不推断来源', () => {
  const { chat, names } = fixture();
  chat.name = '小狐狸';
  chat.history = [
    { role: 'system', type: 'pat_message', content: '“白” 将备注修改为 “小狐狸”', timestamp: 10 },
    { role: 'system', isHidden: true, content: '[系统提示：你刚刚成功将自己的备注名修改为了“小狐狸”。请自然地接受这个新名字，不要对此感到惊讶。]', timestamp: 11 }
  ];
  const context = names.buildContext(chat, chat.history);
  assert.equal(names.getCurrentChange(chat).actor, 'character');
  assert.equal((context.match(/^- 时间戳/gm) || []).length, 1);
  chat.history = [];
  assert.equal(names.getCurrentChange(chat).actor, 'character');
  chat.name = '用户在旧版手动改的名字';
  assert.match(names.buildContext(chat), /修改来源未知/);
  delete chat.lastRemarkChange;
  chat.name = '小狐狸';
  chat.history = [
    { role: 'user', content: '“白” 将备注修改为 “小狐狸”' },
    { role: 'system', isHidden: true, content: '[系统提示：你刚刚成功将对用户的称呼修改为了“小狐狸”。]' }
  ];
  assert.equal(names.getCurrentChange(chat), null);
});

test('两处实际角色指令处理都保存来源、同步群聊，只生成一条系统事件', async () => {
  for (const file of ['media-preprocessing', 'response-actions']) {
    const { chat, context } = fixture();
    let synced = 0;
    context.syncCharacterNameInGroups = async target => { assert.equal(target, chat); synced++; };
    const text = source(`src/js-bundles/trigger-response/${file}.jsfrag`);
    const start = text.indexOf("          case 'change_remark_name':");
    const end = file === 'media-preprocessing' ? text.indexOf('            continue;', start) : text.length;
    const block = text.slice(start, end);
    await vm.runInContext(`(async () => {
      let messageTimestamp = 10; const isViewingThisChat = false;
      for (const msgData of [{type:'change_remark_name',new_name:'小狐狸'}, {type:'change_remark_name',new_name:'小狐狸'}, {type:'change_remark_name',new_name:{}}]) {
        switch (msgData.type) { ${block} }
      }
    })()`, context);
    assert.equal(chat.lastRemarkChange.actor, 'character');
    assert.equal(chat.history.length, 1);
    assert.equal(synced, 1);
  }
});

test('实际设置入口记录用户改名；仅保存设置不产生重复事件', async () => {
  const { chat, context } = fixture();
  const text = source('src/js-bundles/event-bindings-a/chat-settings-and-members.jsfrag');
  const start = text.indexOf("      const newName = document.getElementById('chat-name-input')");
  const end = text.indexOf('      // 保存角色国籍', start);
  const run = () => vm.runInContext(`(async () => { ${text.slice(start, end)} })()`, context);
  await run();
  await run();
  assert.equal(chat.name, '用户备注');
  assert.equal(chat.lastRemarkChange.actor, 'user');
  assert.equal(chat.history.length, 1);
});

test('历史收款和退款按实际动作和角色本名进入上下文', () => {
  const { chat, context } = fixture();
  chat.settings.myNickname = '对话称呼';
  vm.runInContext(source('modules/chat-input.js'), context);
  const { formatChatTransferEvent, formatLegacyTransferNotice } = context.window;
  assert.match(formatChatTransferEvent(chat, { role: 'user', isReceived: true, amount: 5 }), /林晓收下了白的转账/);
  assert.match(formatChatTransferEvent(chat, { role: 'assistant', isReceived: true, amount: 5 }), /白收下了林晓的转账/);
  assert.match(formatChatTransferEvent(chat, { role: 'assistant', isRefund: true, amount: 5 }), /白退还了林晓的转账/);
  assert.match(formatLegacyTransferNotice(chat, '[系统提示：你接受了"小白"的转账。]'), /林晓收下了白的转账/);
});

test('实际线上与线下消息转换将备注事件移入系统上下文，保留普通用户发言', () => {
  for (const offline of [false, true]) {
    const { chat, context, names } = fixture();
    names.recordChange(chat, '狐狸', 'character', 1);
    context.filteredHistory = [...chat.history, { role: 'user', type: 'text', content: '你好', timestamp: 2 }];
    const text = source('modules/ai/trigger-response.js');
    const anchor = 'messagesPayload = filteredHistory.map(msg => {';
    const start = offline ? text.indexOf(anchor, text.indexOf('let historySliceStrOffline')) : text.lastIndexOf(anchor);
    const end = text.indexOf('}).filter(Boolean);', start) + '}).filter(Boolean);'.length;
    context.myNickname = '用户';
    const payload = vm.runInContext(`(() => { let messagesPayload; ${text.slice(start, end)} return messagesPayload; })()`, context);
    assert.equal(payload.length, 1);
    assert.equal(payload[0].role, 'user');
    assert.match(payload[0].content, /你好/);
    context.systemPrompt = '用户自定义提示词';
    const addition = source('src/js-bundles/trigger-response/todo-diary-and-album-context.jsfrag')
      .match(/systemPrompt \+= window\.RemarkNames\.buildContext\(chat, filteredHistory\);/)[0];
    vm.runInContext(addition, context);
    assert.match(context.systemPrompt, /^用户自定义提示词/);
    assert.match(context.systemPrompt, /最近一次修改.*白将自己的聊天备注.*执行者：角色本人/);
  }
});

test('四种实际记忆格式化入口明确保留系统事件修改者和旧新备注', () => {
  for (const file of ['summary-orchestration', 'structured-summary-menu', 'structured-memory-conversion', 'variable-memory-summary']) {
    const { chat, context, names } = fixture();
    names.recordChange(chat, '狐狸', 'character', 1);
    names.recordChange(chat, '用户备注', 'user', 2);
    context.messages = context.messagesToSummarize = chat.history;
    const text = source(`modules/memory/${file === 'variable-memory-summary' ? 'extraction-runner' : file}.js`);
    const start = text.indexOf('  const formattedHistory = ');
    const end = text.indexOf(".join('\\n');", start) + ".join('\\n');".length;
    const result = vm.runInContext(`(() => { ${text.slice(start, end)} return formattedHistory; })()`, context);
    assert.match(result, /\[系统事件；时间戳：1\] 白将自己的聊天备注从 "小白" 修改为 "狐狸"/);
    assert.match(result, /\[系统事件；时间戳：2\] 林晓将白的聊天备注从 "狐狸" 修改为 "用户备注"/);
  }
});
