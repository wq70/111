const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));

function fixture(options = {}) {
  const requests = [], writes = [], notices = [];
  const chat = { id: 'a', settings: { memoryMode: 'vector' }, history: [], longTermMemory: [{ content: '旧版精炼记忆' }] };
  const state = { activeChatId: 'a', chats: { a: chat }, apiConfig: { proxyUrl: 'https://mock.invalid', apiKey: 'test', model: 'chat-model' } };
  const context = vm.createContext({ Date, Map, WeakMap, Set, AbortController, setTimeout, clearTimeout, state,
    console: { log() {}, warn() {}, error() {} }, window: { state },
    document: { getElementById: () => null }, showToast: (...args) => notices.push(args),
    db: { chats: { put: async value => { writes.push(copy(value)); if (options.put) await options.put(value); } } },
    fetch: async (url, request) => {
      requests.push({ url, body: JSON.parse(request.body) });
      if (options.fetch) return options.fetch(url, request);
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(options.rows || []) }, finish_reason: options.finish || 'stop' }] }) };
    }
  });
  for (const file of ['extraction-support', 'vector-memory', 'vector-memory-view']) vm.runInContext(source(`modules/memory/${file}.js`), context);
  const manager = context.window.vectorMemoryManager;
  manager.getEmbedding = async () => [1, 0, 0];
  const add = (category, content, fields = {}) => manager.createFragment(chat, {
    category, content, memoryTime: new Date(2026, 8, 1, 12).getTime(), ...fields
  });
  const parse = (snapshot, rows) => manager.parseConsolidationResult(JSON.stringify(rows), snapshot);
  return { context, chat, state, manager, add, parse, requests, writes, notices };
}

test('七类范围跨分类合并；核心和其他分类保留，关联引用仍有效', async () => {
  const f = fixture();
  const u = f.add('U', '用户害怕打雷', { sourceMessageKeys: ['one'], sourceEvidence: [{ key: 'one', content: '我怕雷' }] });
  const m = f.add('M', '用户对雷声感到恐惧', { sourceMessageKeys: ['two'], sourceEvidence: [{ key: 'two', content: '雷声让我害怕' }] });
  const e = f.add('E', '昨晚打雷时我陪伴用户', { linkedMemories: [m] });
  const core = f.add('C', '核心灵魂不可修改', { linkedMemories: [m] });
  const other = ['A', 'L', 'custom'].map(category => f.add(category, `${category}保留`));
  const snapshot = f.manager.captureConsolidation(f.chat);
  assert.equal(snapshot.originals.length, 3);
  const rows = f.parse(snapshot, [{ sourceIds: [u, m], category: 'U', content: '用户害怕雷声', tags: ['雷声'] }, { sourceIds: [e], keep: true }]);
  const oldOther = other.map(id => copy(f.manager.getFragment(f.chat, id)));
  const oldSettings = copy(f.chat.variableMemory.settings);
  const result = await f.manager.saveConsolidation(f.chat, snapshot, rows);
  assert.deepEqual(copy(result), { before: 3, after: 2, local: 0 });
  assert.equal(f.manager.getFragment(f.chat, m), null);
  assert.equal(f.manager.getFragment(f.chat, u).content, '用户害怕雷声');
  assert.deepEqual(copy(f.manager.getFragment(f.chat, u).sourceMessageKeys), ['one', 'two']);
  assert.equal(f.manager.getFragment(f.chat, u).sourceEvidence.length, 2);
  assert.equal(f.manager.getFragment(f.chat, u).consolidationSources.length, 2);
  assert.equal(f.manager.getFragment(f.chat, e).content, '昨晚打雷时我陪伴用户');
  assert.deepEqual(copy(f.manager.getFragment(f.chat, core).linkedMemories), [u]);
  assert.deepEqual(other.map(id => copy(f.manager.getFragment(f.chat, id))), oldOther);
  assert.deepEqual(copy(f.chat.variableMemory.settings), oldSettings);
  assert.deepEqual(copy(f.chat.longTermMemory), [{ content: '旧版精炼记忆' }]);
  assert.equal(f.writes.length, 1);
});

test('单独整合关系发展；其他六类和提取进度保持原样', async () => {
  const f = fixture();
  const r1 = f.add('R', '我们正式成为恋人');
  const r2 = f.add('R', '我们确定恋爱关系');
  const others = ['U', 'E', 'I', 'P', 'T', 'M'].map(code => f.add(code, `${code}其他内容`));
  f.chat.variableMemory.settings.lastExtractedMsgIndex = 42;
  const before = others.map(id => copy(f.manager.getFragment(f.chat, id)));
  const snapshot = f.manager.captureConsolidation(f.chat, 'R');
  await f.manager.saveConsolidation(f.chat, snapshot, f.parse(snapshot, [{ sourceIds: [r1, r2], category: 'R', content: '我们正式确定恋爱关系' }]));
  assert.deepEqual(others.map(id => copy(f.manager.getFragment(f.chat, id))), before);
  assert.equal(f.chat.variableMemory.settings.lastExtractedMsgIndex, 42);
  assert.equal(f.chat.variableMemory.fragments.filter(fragment => fragment.category === 'R').length, 1);
});

test('明确手动日期、计划状态和原来源依据由程序继承，模型不能改日期', async () => {
  const f = fixture();
  const time = new Date(2026, 8, 8, 15).getTime();
  const id = f.add('P', '约好看电影', { memoryTime: time, plannedTime: time + 86400000, timeBasis: 'manual', status: 'plan', timeEvidence: '用户手动指定' });
  const snapshot = f.manager.captureConsolidation(f.chat, 'P');
  const rows = f.parse(snapshot, [{ sourceIds: [id], category: 'P', content: '我们约好一起看电影', memoryTime: 1, status: 'completed' }]);
  await f.manager.saveConsolidation(f.chat, snapshot, rows);
  const fragment = f.manager.getFragment(f.chat, id);
  assert.equal(fragment.memoryTime, time);
  assert.equal(fragment.plannedTime, time + 86400000);
  assert.equal(fragment.status, 'plan');
  assert.equal(fragment.timeEvidence, '用户手动指定');
});

test('缺失、重复、未知来源和越界分类拒绝整合；旧数据无写入', () => {
  const f = fixture();
  const one = f.add('R', '关系事实一'), two = f.add('R', '关系事实二');
  const snapshot = f.manager.captureConsolidation(f.chat, 'R');
  const before = copy(f.chat.variableMemory);
  for (const rows of [[], [{ sourceIds: [one], keep: true }], [{ sourceIds: [one, one], category: 'R', content: '重复' }],
    [{ sourceIds: ['unknown', two], category: 'R', content: '未知' }], [{ sourceIds: [one, two], category: 'U', content: '越界' }]]) {
    assert.throws(() => f.parse(snapshot, rows));
  }
  assert.deepEqual(copy(f.chat.variableMemory), before);
  assert.equal(f.writes.length, 0);
});

test('不同日期、时间线以及相反事实或计划状态不能合并', () => {
  for (const fields of [{ memoryTime: new Date(2026, 8, 2, 12).getTime() }, { clockVersion: 1, timelineId: 'other' },
    { polarity: 'negative' }, { status: 'cancelled' }]) {
    const f = fixture();
    const one = f.add('E', '电影经历', { status: 'fact' });
    const two = f.add('E', '电影经历', { status: 'fact', ...fields });
    const snapshot = f.manager.captureConsolidation(f.chat);
    assert.throws(() => f.parse(snapshot, [{ sourceIds: [one, two], category: 'E', content: '电影经历' }]));
    assert.equal(f.writes.length, 0);
  }
});

test('无效JSON和输出截断不会保存；聊天请求不发送向量', async () => {
  for (const options of [{ rows: [], finish: 'length' }, { rows: [] }]) {
    const f = fixture(options);
    f.add('U', '用户设定', { embedding: Array(100).fill(1) });
    const snapshot = f.manager.captureConsolidation(f.chat);
    await assert.rejects(f.manager.generateConsolidation(f.chat, snapshot));
    assert.equal(f.writes.length, 0);
    assert.equal(f.requests.length, 1);
    assert.doesNotMatch(f.requests[0].body.messages[0].content, /"embedding"/);
  }
  const f = fixture(); f.add('U', '事实');
  assert.throws(() => f.manager.parseConsolidationResult('[{"broken":', f.manager.captureConsolidation(f.chat)));
});

test('使用现有副API、支持反馈重写，预览前没有写入或向量请求', async () => {
  const f = fixture();
  const id = f.add('T', '不要叫错名字');
  f.state.apiConfig = { ...f.state.apiConfig, secondaryProxyUrl: 'https://secondary.invalid/v1', secondaryApiKey: 'secondary', secondaryModel: 'secondary-model' };
  const snapshot = f.manager.captureConsolidation(f.chat, 'T');
  f.context.fetch = async (url, request) => {
    f.requests.push({ url, body: JSON.parse(request.body) });
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify([{ sourceIds: [id], keep: true }]) } }] }) };
  };
  const rows = await f.manager.generateConsolidation(f.chat, snapshot, '保留名字');
  assert.equal(rows.length, 1);
  assert.equal(f.requests[0].url, 'https://secondary.invalid/v1/chat/completions');
  assert.equal(f.requests[0].body.model, 'secondary-model');
  assert.match(f.requests[0].body.messages[0].content, /保留名字/);
  assert.equal(f.writes.length, 0);
});

test('已知输入超限不发请求；空范围和非七类范围有明确错误', async () => {
  const f = fixture();
  assert.throws(() => f.manager.captureConsolidation(f.chat), /没有/);
  assert.throws(() => f.manager.captureConsolidation(f.chat, 'C'), /七类/);
  f.add('U', '事实');
  f.state.apiConfig.contextWindowTokens = 100;
  await assert.rejects(f.manager.generateConsolidation(f.chat, f.manager.captureConsolidation(f.chat)), /模型容量/);
  assert.equal(f.requests.length, 0);
});

test('取消、原记忆变更和持久化失败都不覆盖原数据', async () => {
  const f = fixture({ put: async () => { throw new Error('存储失败'); } });
  const id = f.add('U', '原记忆');
  const snapshot = f.manager.captureConsolidation(f.chat);
  const rows = f.parse(snapshot, [{ sourceIds: [id], category: 'U', content: '新记忆' }]);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.manager.saveConsolidation(f.chat, snapshot, rows, controller.signal), /取消/);
  assert.equal(f.writes.length, 0);
  const before = copy(f.chat.variableMemory);
  await assert.rejects(f.manager.saveConsolidation(f.chat, snapshot, rows), /存储失败/);
  assert.deepEqual(copy(f.chat.variableMemory), before);
  f.manager.editFragment(f.chat, id, { content: '用户刚刚修改' });
  await assert.rejects(f.manager.saveConsolidation(f.chat, snapshot, rows), /已变化/);
  assert.equal(f.manager.getFragment(f.chat, id).content, '用户刚刚修改');
});

test('向量期间新增记忆和取消不会被覆盖，任务可再次执行', async () => {
  for (const action of ['change', 'cancel']) {
    const f = fixture();
    const id = f.add('U', '原记忆');
    const snapshot = f.manager.captureConsolidation(f.chat);
    const rows = f.parse(snapshot, [{ sourceIds: [id], category: 'U', content: '整理后的记忆' }]);
    const controller = new AbortController();
    f.manager.getEmbedding = async () => { if (action === 'change') f.add('U', '新增加的记忆'); else controller.abort(); return [1, 0, 0]; };
    await assert.rejects(f.manager.saveConsolidation(f.chat, snapshot, rows, controller.signal));
    assert.equal(f.writes.length, 0);
    assert.equal(f.manager.getFragment(f.chat, id).content, '原记忆');
  }
});

test('内容变化即使沿用原id也重新生成向量；失败使用原有本地检索', async () => {
  const f = fixture();
  const id = f.add('U', '原事实', { embedding: [0, 1, 0] });
  const snapshot = f.manager.captureConsolidation(f.chat);
  const rows = f.parse(snapshot, [{ sourceIds: [id], category: 'U', content: '整理后事实' }]);
  let embeddedText;
  f.manager.getEmbedding = async text => { embeddedText = text; return null; };
  const result = await f.manager.saveConsolidation(f.chat, snapshot, rows);
  assert.match(embeddedText, /整理后事实/);
  assert.equal(f.manager.getFragment(f.chat, id).embedding, null);
  assert.equal(result.local, 1);
  assert.equal(f.chat.variableMemory._retrievalCache.resultIds.length, 0);
});

test('连续整合可执行，未修改条目复用已有向量', async () => {
  const f = fixture();
  const id = f.add('U', '事实');
  let calls = 0;
  f.manager.getEmbedding = async () => { calls++; return [1, 0, 0]; };
  for (let i = 0; i < 2; i++) {
    const snapshot = f.manager.captureConsolidation(f.chat);
    await f.manager.saveConsolidation(f.chat, snapshot, f.parse(snapshot, [{ sourceIds: [id], keep: true }]));
  }
  assert.equal(calls, 1);
  assert.equal(f.writes.length, 2);
  assert.equal(f.chat.variableMemory.fragments.length, 1);
});

test('已有任务和范围选择取消不改变数据；清理锁后可再次打开', async () => {
  const f = fixture();
  f.add('R', '事实');
  const runtime = {};
  f.manager._extractionLocks.set(f.chat, runtime);
  await f.context.openVectorConsolidation(f.chat);
  assert.equal(f.notices.length, 1);
  assert.equal(f.manager._extractionLocks.get(f.chat), runtime);
  f.manager._extractionLocks.delete(f.chat);
  let choices = 0;
  f.context.showChoiceModal = async (_, options) => { choices++; assert.equal(options[0].value, 'all'); return null; };
  await f.context.openVectorConsolidation(f.chat);
  await f.context.openVectorConsolidation(f.chat);
  assert.equal(choices, 2);
  assert.equal(f.manager._extractionLocks.has(f.chat), false);
  assert.equal(f.writes.length, 0);
});

function modalFixture(f, onOpen) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, { innerHTML: '', value: '', textContent: '', style: { cssText: '' },
        classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) } });
    }
    return nodes.get(id);
  };
  f.context.document = { getElementById: node, querySelector: () => node('footer'), createElement: () => ({
    textContent: '', get innerHTML() { return this.textContent.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
  }) };
  f.context.window._modalTitle = node('title');
  f.context.window._modalBody = node('body');
  f.context.showCustomModal = () => { Promise.resolve().then(() => onOpen(node)); };
  f.context.hideCustomModal = () => {};
  f.context.renderVectorMemoryView = () => {};
  return node;
}

test('用户链路：选择七类→分类预览→反馈重写→确认覆盖→反馈及锁清理', async () => {
  const f = fixture();
  const u = f.add('U', '用户怕雷'), m = f.add('M', '用户害怕打雷');
  let generated = 0, previews = 0;
  f.context.showChoiceModal = async () => 'all';
  f.context.fetch = async (_, request) => {
    generated++;
    if (generated === 2) assert.match(JSON.parse(request.body).messages[0].content, /保留雷声/);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify([
      { sourceIds: [u, m], category: 'U', content: '用户害怕雷声 <不能当成HTML>' }
    ]) } }] }) };
  };
  const node = modalFixture(f, nodes => {
    if (nodes('title').textContent !== '整合完成，请确认') return;
    previews++;
    assert.match(nodes('body').innerHTML, /2 条 → 1 条/);
    assert.match(nodes('body').innerHTML, /用户设定/);
    assert.doesNotMatch(nodes('body').innerHTML, /<不能当成HTML>/);
    assert.equal(f.writes.length, 0);
    if (previews === 1) { nodes('vm-consolidation-feedback').value = '保留雷声'; nodes('vm-consolidation-rewrite').onclick(); }
    else nodes('custom-modal-confirm').onclick();
  });
  await f.context.openVectorConsolidation(f.chat);
  assert.equal(generated, 2);
  assert.equal(previews, 2);
  assert.equal(f.writes.length, 1);
  assert.equal(f.chat.variableMemory.fragments.length, 1);
  assert.match(f.notices.at(-1)[0], /整合完成：2 条 → 1 条/);
  assert.equal(f.manager._extractionLocks.has(f.chat), false);
  assert.equal(node('body').classList.contains('vm-consolidation-body'), false);
  assert.equal(node('footer').classList.contains('vm-consolidation-footer'), false);
  assert.equal(f.context.window._modalResolve, null);
});

test('用户链路：取消预览保留旧记忆；请求中取消后无保存并能重新使用', async () => {
  for (const cancelAt of ['preview', 'request']) {
    const f = fixture();
    const id = f.add('R', '关系事实');
    const before = copy(f.chat.variableMemory);
    f.context.showChoiceModal = async () => 'R';
    f.context.fetch = async (_, request) => {
      if (cancelAt === 'request') return new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(new Error('已取消')), { once: true }));
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify([{ sourceIds: [id], category: 'R', content: '整理后事实' }]) } }] }) };
    };
    modalFixture(f, nodes => {
      if (cancelAt === 'request' || nodes('title').textContent === '整合完成，请确认') nodes('custom-modal-cancel').onclick();
    });
    await f.context.openVectorConsolidation(f.chat);
    assert.deepEqual(copy(f.chat.variableMemory), before);
    assert.equal(f.writes.length, 0);
    assert.equal(f.manager._extractionLocks.has(f.chat), false);
    assert.match(f.notices.at(-1)[0], /取消/);
  }
});
