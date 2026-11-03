const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
function fixture(options = {}) {
  const requests = [], writes = [];
  const messages = n => Array.from({ length: n }, (_, i) => ({ id: 'm' + i, role: i % 2 ? 'assistant' : 'user', senderId: i % 2 ? 'a' : 'user', senderName: i % 2 ? '杰克' : '用户', timestamp: 1791000000000 + i * 60000, content: '本群约定去看海' + i }));
  const privateChat = id => ({ id, name: id, originalName: '杰克', settings: { memoryMode: 'diary' }, history: [{ role: 'user', content: '私聊秘密', timestamp: 1 }], longTermMemory: [{ content: '私聊秘密', timestamp: 1 }] });
  const group = id => ({ id, name: id, isGroup: true, settings: { memoryMode: 'diary', enableAutoMemory: true, autoMemoryInterval: 2 }, members: [
    { id: 'a', originalName: '杰克', groupNickname: '杰克A', persona: '设定A' },
    { id: 'b', originalName: '杰克', groupNickname: '杰克B', persona: '设定B' },
    { id: 'npc_1', originalName: '路人', groupNickname: '路人', persona: '路人设定', isNpc: true }
  ], history: messages(4) });
  const chat = group('g'), other = group('g2');
  const state = { chats: { g: chat, g2: other, a: privateChat('a'), b: privateChat('b') }, activeChatId: 'g', worldBooks: [], qzoneSettings: { nickname: '用户' }, globalSettings: {}, apiConfig: { proxyUrl: 'https://mock.invalid', apiKey: 'mock', model: 'mock' } };
  const sandbox = { Date, Math, URL, Map, Set, WeakMap, WeakSet, AbortController, setTimeout, clearTimeout, state, window: { state }, console: { log() {}, warn() {}, error() {} },
    document: { createElement: () => ({ textContent: '', get innerHTML() { return this.textContent; } }), getElementById: () => null },
    showToast() {},
    db: { chats: { put: async value => { if (options.put) await options.put(value, writes.length); writes.push(copy(value)); } } },
    fetch: async (url, request) => {
      const body = JSON.parse(request.body); requests.push(body);
      if (options.respond) return options.respond(body, requests.length, sandbox);
      const mode = chat.settings.memoryMode;
      return response(mode === 'structured' ? '[261003]E:我和大家约定去看海' : mode === 'vector' ? '[{"content":"我和大家约定去看海","category":"E","sourceMessageIds":[1],"timeBasis":"message"}]' : '{"summary":"我和大家约定去看海"}');
    }
  };
  const context = vm.createContext(sandbox);
  for (const file of ['extraction-support', 'structured-memory', 'vector-memory', 'group-memory']) vm.runInContext(read(`modules/memory/${file}.js`), context);
  context.window.vectorMemoryManager.getEmbedding = async () => null;
  const manager = context.window.GroupMemory;
  const enable = async (target = chat, npcIds = []) => manager.configure(target, { mode: 'independent', npcIds });
  const data = (id = 'a', target = chat) => manager.archive(target, target.members.find(m => m.id === id));
  return { context, sandbox, state, chat, other, manager, requests, writes, enable, data, messages };
}
function response(content, finish = 'stop') { return { ok: true, json: async () => ({ choices: [{ finish_reason: finish, message: { content } }] }) }; }

test('旧群默认共享；首次开启不擅自总结旧记录，用户可选择范围补建', async () => {
  const f = fixture(); assert.equal(f.manager.independent(f.chat), false);
  await f.enable(); assert.equal(await f.manager.summarize(f.chat), 0); assert.equal(f.requests.length, 0);
  await f.manager.summarize(f.chat, { range: { start: 1, end: 4 }, memberIds: ['a'] });
  assert.equal(f.requests.length, 1); assert.equal(f.data().longTermMemory.length, 1);
  assert.equal(await f.manager.summarize(f.chat, { range: { start: 1, end: 4 }, memberIds: ['a'] }), 0);
  assert.equal(f.state.chats.a.longTermMemory[0].content, '私聊秘密');
  assert.ok(f.writes.every(c => c.id === 'g'), '成员作用域对象不能保存为新的聊天');
});

test('同名成员、不同群分别保存；三个模式的读取都不会带入私聊记忆', async () => {
  const f = fixture(); await f.enable(); await f.enable(f.other);
  for (const mode of ['diary', 'structured', 'vector']) {
    f.chat.settings.memoryMode = mode;
    await f.manager.summarize(f.chat, { range: { start: 1, end: 4 } });
    const text = await f.manager.context(f.chat, '看海');
    assert.match(text, /杰克A/); assert.match(text, /杰克B/); assert.doesNotMatch(text, /私聊秘密/);
    assert.doesNotMatch(await f.manager.context(f.other, '看海'), /我和大家约定去看海/);
    assert.doesNotMatch(f.manager.contextSync(f.chat, '看海'), /私聊秘密/);
  }
  assert.equal(f.data('a').longTermMemory.length, 1); assert.equal(f.data('b').longTermMemory.length, 1);
  assert.notEqual(f.data('a'), f.data('b'));
  assert.equal(f.data('a').variableMemory.fragments.length, 1);
});

test('严格隔离默认双向阻止挂载，主动例外只授权读取明确选择的来源', async () => {
  const f = fixture(); await f.enable();
  f.chat.settings.linkedMemoryChatIds = ['a', 'g2'];
  f.state.chats.a.settings.linkedMemoryChatIds = ['g'];
  assert.deepEqual(copy(f.manager.mountIds(f.chat)), []);
  assert.deepEqual(copy(f.manager.mountIds(f.state.chats.a)), []);
  await f.manager.configure(f.chat, { mode: 'independent', allowLinks: true });
  assert.deepEqual(copy(f.manager.mountIds(f.chat)), ['a', 'g2']);
  assert.deepEqual(copy(f.manager.mountIds(f.state.chats.a)), []);
  await f.enable(f.other);
  assert.deepEqual(copy(f.manager.mountIds(f.chat)), ['a']);
});

test('NPC默认不生成；开启后有自己的记忆，关闭后数据保留且不参与读取', async () => {
  const f = fixture(); await f.enable();
  await f.manager.summarize(f.chat, { range: { start: 1, end: 4 } });
  assert.equal(f.data('npc_1'), null);
  await f.enable(f.chat, ['npc_1']);
  await f.manager.summarize(f.chat, { range: { start: 1, end: 4 }, memberIds: ['npc_1'] });
  assert.equal(f.data('npc_1').longTermMemory.length, 1);
  assert.match(await f.manager.context(f.chat), /路人/);
  await f.enable(); assert.doesNotMatch(await f.manager.context(f.chat), /路人/);
  assert.equal(f.data('npc_1').longTermMemory.length, 1);
});

test('切回共享再开启时保留独立记忆，模式之间不自动合并或覆盖私聊', async () => {
  const f = fixture(); await f.enable();
  await f.manager.saveEntry(f.chat, 'a', '只在本群的经历');
  const before = copy(f.chat.groupMemory);
  await f.manager.configure(f.chat, { mode: 'shared' });
  await f.enable(); assert.deepEqual(copy(f.chat.groupMemory), before);
  f.chat.settings.memoryMode = 'structured';
  await f.manager.saveEntry(f.chat, 'a', '[261003]F:喜欢的饮料=茶');
  assert.equal(f.data().longTermMemory[0].content, '只在本群的经历');
  await f.manager.saveEntry(f.chat, 'a', '喜欢的饮料=咖啡', { category: 'F', index: 0 });
  assert.match(f.data().structuredMemory.facts['喜欢的饮料'], /咖啡/);
  await f.manager.saveEntry(f.chat, 'a', null, { category: 'F', index: 0 });
  assert.deepEqual(copy(f.data().structuredMemory.facts), {});
});

test('部分成功后失败保留完成批次，自动不反复重试，手动继续只处理未完成消息', async () => {
  let fail = true;
  const f = fixture({ respond: async (_body, count) => {
    if (count === 2 && fail) throw new Error('网络中断');
    return response('{"summary":"已处理的群聊经历"}');
  } });
  await f.enable();
  await assert.rejects(f.manager.summarize(f.chat, { memberIds: ['a'], range: { start: 1, end: 4 }, batchSize: 2 }), /网络中断/);
  assert.equal(f.data().longTermMemory.length, 1);
  assert.equal(f.chat.groupMemory.autoBlocked, true);
  await f.manager.auto(f.chat); assert.equal(f.requests.length, 2);
  fail = false;
  await f.manager.summarize(f.chat, { memberIds: ['a'], range: { start: 1, end: 4 }, batchSize: 2 });
  assert.equal(f.requests.length, 3); assert.equal(f.data().longTermMemory.length, 2);
  assert.equal(f.chat.groupMemory.autoBlocked, false);
});

test('错误格式和输出截断不保存记忆，也不推进处理进度', async () => {
  for (const output of [response('错误格式'), response('{"summary":"不可用"}', 'length')]) {
    const f = fixture({ respond: async () => output }); await f.enable();
    await assert.rejects(f.manager.summarize(f.chat, { range: { start: 1, end: 4 }, memberIds: ['a'] }));
    assert.equal(f.data().longTermMemory.length, 0); assert.equal(f.data().processed.diary, undefined);
  }
});

test('正在生成时停止、修改原文或切换模式，不提交过期结果', async () => {
  for (const change of [f => f.manager.stop(f.chat), f => { f.chat.history[0].content = '已修改'; }, f => { f.chat.settings.memoryMode = 'vector'; }]) {
    let f;
    f = fixture({ respond: async () => { change(f); return response('{"summary":"过期结果"}'); } });
    await f.enable();
    await assert.rejects(f.manager.summarize(f.chat, { range: { start: 1, end: 4 }, memberIds: ['a'] }));
    assert.equal(f.data().longTermMemory.length, 0);
  }
});

test('持久化失败恢复旧档案；同群任务锁阻止重复调用和设置切换', async () => {
  let fail = false;
  const f = fixture({ put: async () => { if (fail) { fail = false; throw new Error('写盘失败'); } } });
  await f.enable(); fail = true;
  await assert.rejects(f.manager.saveEntry(f.chat, 'a', '未能保存的记忆'), /写盘失败/);
  assert.equal(f.data().longTermMemory.length, 0);
  f.manager.locks.set('g', new AbortController());
  await assert.rejects(f.manager.configure(f.chat, { mode: 'shared' }), /停止/);
  await assert.rejects(f.manager.summarize(f.chat), /已有/);
  assert.equal(f.requests.length, 0);
});

test('导入导出保持成员分开、合并不重复，导出不带向量密钥', async () => {
  const f = fixture(); await f.enable();
  await f.manager.saveEntry(f.chat, 'a', '本群独有');
  f.chat.settings.memoryMode = 'vector';
  await f.manager.saveEntry(f.chat, 'a', '用于看海的向量片段');
  f.data().variableMemory.settings.embeddingApiKey = 'secret';
  const transferred = f.manager.transfer(f.chat);
  assert.doesNotMatch(JSON.stringify(transferred), /secret/);
  await f.manager.persist(f.chat, f.manager.merge(f.chat, transferred));
  assert.equal(f.data().longTermMemory.length, 1); assert.equal(f.data().variableMemory.fragments.length, 1);
  assert.equal(f.state.chats.a.longTermMemory[0].content, '私聊秘密');
});

test('真实自动、手动、向量、结构化与通话入口均转入群独立记忆，旧总结进度不变', async () => {
  const f = fixture(); await f.enable();
  const c = f.context;
  Object.assign(c, { openManualSummaryModal() {}, closeManualSummaryModal() {}, executeManualSummary() {}, convertLongTermMemoryToVector() {}, handleExportLongTermMemory() {} });
  for (const file of ['variable-memory-summary', 'summary-orchestration', 'structured-memory-conversion']) vm.runInContext(read(`modules/memory/${file}.js`), c);
  const calls = [];
  f.manager.auto = async chat => { calls.push('auto:' + chat.id); return 7; };
  f.manager.summarize = async (chat, options) => { calls.push(options?.messages ? 'call' : 'manual:' + chat.id); return 8; };
  await c.checkAndTriggerAutoSummary('g');
  await c.triggerAutoSummary('g', true);
  await c.triggerVectorMemorySummary('g', true);
  await c.triggerStructuredMemorySummary('g', true);
  await c.summarizeCallTranscript('g', '这是一段群通话记录');
  assert.deepEqual(calls, ['auto:g', 'manual:g', 'manual:g', 'manual:g', 'call']);
  assert.equal(f.chat.lastMemorySummaryTimestamp, undefined);
  assert.equal(f.chat.lastStructuredMemoryTimestamp, undefined);
  assert.equal(f.state.chats.a.longTermMemory[0].content, '私聊秘密');
});

test('同名发言附带成员ID；其他成员的隐藏内心独白不发送给当前成员', async () => {
  const f = fixture(); await f.enable();
  f.chat.history.push({ id: 'thought', role: 'system', isHidden: true, senderId: 'b', senderName: '杰克', content: '内心独白：B自己的秘密', timestamp: 1791000400000 });
  await f.manager.summarize(f.chat, { memberIds: ['a'], range: { start: 1, end: 5 } });
  const prompt = f.requests[0].messages[0].content;
  assert.match(prompt, /发言成员ID："a"/);
  assert.doesNotMatch(prompt, /B自己的秘密/);
  await f.manager.summarize(f.chat, { memberIds: ['b'], range: { start: 1, end: 5 } });
  assert.match(f.requests[1].messages[0].content, /B自己的秘密/);
});

test('自动总结只处理开启后的新消息，尊重间隔且不会重复生成', async () => {
  const f = fixture(); await f.enable();
  f.chat.history.push({ id: 'new-1', role: 'user', content: '新约定', timestamp: 1791000600000 });
  await f.manager.auto(f.chat); assert.equal(f.requests.length, 0);
  f.chat.history.push({ id: 'new-2', role: 'assistant', senderId: 'a', senderName: '杰克', content: '我记住了', timestamp: 1791000700000 });
  await f.manager.auto(f.chat); assert.equal(f.requests.length, 2);
  assert.doesNotMatch(f.requests[0].messages[0].content, /本群约定去看海0/);
  await f.manager.auto(f.chat); assert.equal(f.requests.length, 2);
});

test('群成员使用真实向量逻辑分别存储和语义召回，密钥不复制进群档案', async () => {
  const f = fixture({ respond: async body => body.input
    ? { ok: true, json: async () => ({ data: [{ embedding: [1, 0, 0] }] }) }
    : response('[{"content":"我和大家在海边散步","category":"E","sourceMessageIds":[1],"timeBasis":"message"}]') });
  await f.enable(); f.chat.settings.memoryMode = 'vector';
  f.state.apiConfig.embeddingConfig = { enabled: true, endpoint: 'https://vectors.invalid/v1', apiKey: 'vector-secret', model: 'embedding-model' };
  vm.runInContext('window.vectorMemoryManager.getEmbedding = Object.getPrototypeOf(window.vectorMemoryManager).getEmbedding;', f.context);
  await f.manager.summarize(f.chat, { range: { start: 1, end: 4 } });
  assert.deepEqual(copy(f.data('a').variableMemory.fragments[0].embedding), [1, 0, 0]);
  assert.deepEqual(copy(f.data('b').variableMemory.fragments[0].embedding), [1, 0, 0]);
  assert.match(await f.manager.context(f.chat, '海边散步'), /我和大家在海边散步/);
  assert.doesNotMatch(JSON.stringify(f.chat.groupMemory), /vector-secret/);
});

test('共享总结请求返回前切成独立模式，旧结果不会继续写回私聊', async () => {
  let f;
  f = fixture({ respond: async () => { await f.enable(); return response('{"summaries":{"杰克":"不应写到私聊"}}'); } });
  f.chat.history = f.messages(6);
  const c = f.context;
  Object.assign(c, { openManualSummaryModal() {}, closeManualSummaryModal() {}, executeManualSummary() {}, convertLongTermMemoryToVector() {}, handleExportLongTermMemory() {}, toGeminiRequestData() {} });
  c.window.RemarkNames = { formatMemoryEvent: () => '' };
  vm.runInContext(read('modules/memory/summary-orchestration.js'), c);
  await c.triggerAutoSummary('g', false, { start: 1, end: 6 });
  assert.equal(f.requests.length, 1);
  assert.equal(f.state.chats.a.longTermMemory[0].content, '私聊秘密');
  assert.equal(f.state.chats.a.longTermMemory.length, 1);
});

test('非法范围及小数批量大小在发请求前被拒绝，不跳过任何消息', async () => {
  for (const options of [{ range: { start: 0, end: 4 } }, { range: { start: 1, end: 10 } }, { range: { start: 1, end: 4 }, batchSize: 2.5 }]) {
    const f = fixture(); await f.enable();
    await assert.rejects(f.manager.summarize(f.chat, options));
    assert.equal(f.requests.length, 0); assert.equal(f.data().longTermMemory.length, 0);
  }
});
