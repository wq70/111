const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const framePath = 'archive/330--main/index.html';
const request = { charId: 'a', itemId: 'item1', itemType: 'expense', itemTitle: '午饭', itemAmount: 20 };
const aiResult = { type: 'expense', amount: 20, category: 'food', title: '午饭', note: '一起吃饭' };
const plain = value => JSON.parse(JSON.stringify(value));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function runtime() {
  const sent = [], errors = [], scheduled = [], writes = [];
  const storage = new Map([['coupleSpaceLastId', 'a']]);
  const screen = { active: true, classList: { contains: () => screen.active } };
  const frame = {
    src: `https://example.test/${framePath}`, isConnected: true,
    contentWindow: { postMessage(message) { sent.push(plain(message)); } }
  };
  let currentFrame = frame;
  const context = {
    COUPLE_SPACE_IFRAME_PATH: framePath,
    document: { getElementById: id => id === 'couple-space-iframe' ? currentFrame : id === 'couple-space-screen' ? screen : null },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem(key, value) { writes.push(key); storage.set(key, String(value)); }
    },
    state: { chats: { a: { name: 'A' }, b: { name: 'B' } }, globalSettings: {} },
    console: { log() {}, error: (...args) => errors.push(args) },
    setTimeout: (fn, delay) => scheduled.push({ fn, delay }),
    getCoupleSpaceApiConfig: () => ({ proxyUrl: 'https://api.example.test', model: 'test-model' }),
    buildDiaryAiContext: () => ({ charName: 'A', myNickname: '我', currentTime: '2026-10-21' }),
    GEMINI_API_URL: 'https://gemini.example.test',
    getCoupleSpaceRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
    getGeminiResponseText: data => data.text,
    parseCoupleSpaceJson: JSON.parse
  };
  vm.createContext(context);
  vm.runInContext(read('modules/couple-space/finance.js'), context);
  const pending = deferred();
  let calls = 0;
  const wait = () => { calls++; return pending.promise; };
  context.generateCoupleSpaceFinanceAi = wait;
  context.generateCoupleSpaceFinanceComment = wait;
  context.fetchCoupleSpaceWithTimeout = wait;
  return {
    context, frame, screen, sent, errors, storage, writes, scheduled, pending, calls: () => calls,
    replaceFrame() {
      frame.isConnected = false;
      frame.contentWindow = null;
      currentFrame = { ...frame, isConnected: true, contentWindow: { postMessage: message => sent.push(plain(message)) } };
    },
    removeFrame() { frame.isConnected = false; frame.contentWindow = null; currentFrame = null; }
  };
}

const handlers = [
  { name: '记账', handler: 'handleCoupleSpaceFinanceAiRequest', value: aiResult,
    result: { type: 'coupleSpaceFinanceAiResult', finType: 'expense', amount: 20, category: 'food', title: '午饭', note: '一起吃饭' } },
  { name: '评论', handler: 'handleCoupleSpaceFinanceCommentRequest', value: '记得吃饱',
    result: { type: 'coupleSpaceFinanceCommentResult', itemId: 'item1', comment: '记得吃饱' } },
  { name: '点赞', handler: 'handleCoupleSpaceFinanceHeartRequest', value: { ok: true, json: async () => ({ text: 'yes' }) },
    result: { type: 'coupleSpaceFinanceHeartResult', itemId: 'item1', liked: true } }
];

for (const spec of handlers) {
  test(`${spec.name}正常返回时，只发送一次原有格式的结果`, async () => {
    const r = runtime();
    const job = r.context[spec.handler](request);
    r.pending.resolve(spec.value);
    await job;
    assert.deepEqual(r.sent, [spec.result]);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.writes, []);
  });

  const transitions = {
    '关闭空间': r => { r.frame.src = 'https://example.test/'; r.screen.active = false; },
    '移除页面': r => r.removeFrame(),
    '重新进入同一角色': r => r.replaceFrame(),
    '切换到另一角色': r => { r.replaceFrame(); r.storage.set('coupleSpaceLastId', 'b'); },
    '只改变当前角色': r => r.storage.set('coupleSpaceLastId', 'b'),
    '进入角色选择页': r => { r.screen.active = false; },
    '原窗口失效': r => { r.frame.contentWindow = null; },
    '页面导航': r => { r.frame.src = 'about:blank'; }
  };
  for (const [name, transition] of Object.entries(transitions)) {
    test(`${spec.name}等待期间${name}，成功和失败均安全结束且不写入存储`, async () => {
      for (const failed of [false, true]) {
        const r = runtime();
        const job = r.context[spec.handler](request);
        transition(r);
        if (failed) r.pending.reject(new Error('API请求失败: 500'));
        else r.pending.resolve(spec.value);
        await job;
        assert.deepEqual(r.sent, []);
        assert.deepEqual(r.writes, []);
        assert.equal(r.errors.length, failed ? 1 : 0);
        if (failed) assert.match(r.errors[0][1], /API请求失败: 500/);
      }
    });
  }

  test(`${spec.name}发送失败只记录一次发送错误，不补发也不误报为 AI 错误`, async () => {
    const r = runtime();
    let attempts = 0;
    r.frame.contentWindow.postMessage = () => { attempts++; throw new Error('窗口已关闭'); };
    const job = r.context[spec.handler](request);
    r.pending.resolve(spec.value);
    await job;
    assert.equal(attempts, 1);
    assert.deepEqual(r.errors, [['Finance result delivery error:', 'Error: 窗口已关闭']]);
  });

  test(`${spec.name}API 失败或超时保留具体原因，错误通知不再抛出异常`, async () => {
    for (const reason of ['API请求失败: 500', '情侣空间 API 请求超时']) {
      const r = runtime();
      const job = r.context[spec.handler](request);
      r.pending.reject(new Error(reason));
      await job;
      assert.equal(r.errors.length, 1);
      assert.equal(r.errors[0][1], `Error: ${reason}`);
      assert.ok(r.errors[0].every(value => typeof value === 'string'));
      assert.equal(r.sent.length, spec.name === '点赞' ? 0 : 1);
      if (r.sent.length) assert.equal(r.sent[0].error, true);
    }
    const r = runtime();
    let attempts = 0;
    r.frame.contentWindow.postMessage = () => { attempts++; throw new Error('发送失败'); };
    const job = r.context[spec.handler](request);
    r.pending.reject(new Error('原始 API 错误'));
    await job;
    assert.equal(attempts, spec.name === '点赞' ? 0 : 1);
    assert.equal(r.errors[0][1], 'Error: 原始 API 错误');
  });

  test(`${spec.name}收到无效页面或其他角色的请求时不调用 AI`, async () => {
    for (const invalidate of [r => r.removeFrame(), r => { r.screen.active = false; }, r => r.storage.set('coupleSpaceLastId', 'b')]) {
      const r = runtime();
      invalidate(r);
      await r.context[spec.handler](request);
      assert.equal(r.calls(), 0);
      assert.deepEqual(r.sent, []);
    }
  });
}

test('缺少角色或 API 配置时保留原来的错误返回行为', async () => {
  for (const spec of handlers) {
    const r = runtime();
    delete r.context.state.chats.a;
    await r.context[spec.handler](request);
    assert.equal(r.calls(), 0);
    assert.equal(r.sent.length, spec.name === '点赞' ? 0 : 1);
    if (r.sent.length) assert.equal(r.sent[0].error, true);
  }
  const r = runtime();
  r.context.getCoupleSpaceApiConfig = () => ({});
  await r.context.handleCoupleSpaceFinanceAiRequest(request);
  assert.equal(r.calls(), 0);
  assert.deepEqual(r.sent, [{ type: 'coupleSpaceFinanceAiResult', error: true }]);
});

function connectFinancePage(r) {
  const html = read(framePath);
  let onMessage;
  const page = {
    currentCharId: 'a', currentViewingFinId: null, csCharName: 'A', aiWritingFin: false,
    localStorage: r.context.localStorage,
    window: { addEventListener: (_, fn) => { onMessage = fn; }, parent: { postMessage: data => r.context.handleCoupleSpaceFinanceChanged(data) } },
    renderFinList() {}, showFinToast() {}, openFinDetail() {}, closeFinWrite() {}, closeFinDetail() {},
    confirm: () => true
  };
  vm.createContext(page);
  const between = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
  vm.runInContext(between('function getFinItems()', '// --- Summary ---'), page);
  vm.runInContext(between('function saveFinItem()', 'function editCurrentFin()'), page);
  vm.runInContext(between('function deleteFinFromDetail()', 'function toggleFinHeart('), page);
  vm.runInContext(between('// --- Finance message handlers ---', '</script>'), page);
  r.frame.contentWindow.postMessage = data => onMessage({ data });
  return { page, receive: data => onMessage({ data }) };
}

test('真实页面接收正常记账、评论和点赞结果，原有数据保留且只保存一条评论', async () => {
  const r = runtime();
  connectFinancePage(r);
  r.storage.set('coupleFinance_a', JSON.stringify([{ id: 'item1', title: '原账目', amount: 20, comments: [{ author: 'user', content: '用户评论' }], hearts: { user: true } }]));
  r.context.generateCoupleSpaceFinanceAi = async () => aiResult;
  r.context.generateCoupleSpaceFinanceComment = async () => '记得吃饱';
  r.context.fetchCoupleSpaceWithTimeout = async () => handlers[2].value;
  for (const spec of handlers) {
    await r.context[spec.handler](request);
  }
  const items = JSON.parse(r.storage.get('coupleFinance_a'));
  assert.equal(items.length, 2);
  assert.equal(items[0].title, '原账目');
  assert.equal(items[0].amount, 20);
  assert.deepEqual(items[0].comments.map(item => item.content), ['用户评论', '记得吃饱']);
  assert.deepEqual(items[0].hearts, { user: true, char: true });
  assert.equal(items[1].title, '午饭');
  assert.deepEqual(r.errors, []);
});

test('等待评论期间编辑或删除账目，返回结果不覆盖修改也不恢复删除的账目', async () => {
  for (const remove of [false, true]) {
    const r = runtime();
    const { page } = connectFinancePage(r);
    r.storage.set('coupleFinance_a', JSON.stringify([{ id: 'item1', title: '原账目', amount: 20, comments: [] }]));
    const job = r.context.handleCoupleSpaceFinanceCommentRequest(request);
    if (remove) {
      page.currentViewingFinId = 'item1';
      page.deleteFinFromDetail();
    } else {
      page.editingFinId = 'item1'; page.editingFinCat = 'food'; page.editingFinType = 'expense';
      const inputs = { amount: '35', title: '修改后的账目', note: '已修改', date: '2026-10-21' };
      page.document = { getElementById: id => ({ value: inputs[id.replace('fin-write-', '')] }) };
      page.saveFinItem();
    }
    r.pending.resolve('收到');
    await job;
    const items = JSON.parse(r.storage.get('coupleFinance_a'));
    assert.equal(items.length, remove ? 0 : 1);
    if (!remove) {
      assert.equal(items[0].title, '修改后的账目');
      assert.equal(items[0].amount, 35);
      assert.equal(items[0].comments[0].content, '收到');
    }
  }
});

test('自动记账继续通过原有保存工具执行，初始化时间和调度不变', async () => {
  const r = runtime();
  assert.equal(r.scheduled.length, 1);
  assert.equal(r.scheduled[0].delay, 13000);
  r.screen.active = false;
  const saved = [];
  r.context.getCoupleSpaceLocalDateKey = () => '2026-10-21';
  r.context.sendOrSaveCoupleSpaceData = (...args) => { saved.push(plain(args)); return true; };
  const job = r.context.triggerAutoFinancePost('a', true);
  r.pending.resolve(aiResult);
  assert.equal(await job, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0][0], 'a');
  assert.equal(saved[0][1].type, 'coupleSpaceFinanceAutoResult');
  assert.equal(saved[0][2], 'coupleFinance_');
  assert.equal(saved[0][3].title, '午饭');
  assert.deepEqual(r.errors, []);
});
