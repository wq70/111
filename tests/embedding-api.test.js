const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const globalConfig = () => ({ enabled: true, endpoint: 'https://vectors.invalid/v1', apiKey: 'vector-secret', model: 'bge-m3' });

function fixture() {
  const nodes = new Map(), requests = [], writes = [], alerts = [];
  function element() {
    return { value: '', checked: false, hidden: false, style: {}, dataset: {}, children: [], listeners: {},
      textContent: '', classList: { add() {}, remove() {} },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      async emit(type) { for (const fn of this.listeners[type] || []) await fn({ target: this }); },
      appendChild(node) { this.children.push(node); }, replaceChildren() { this.children = []; },
      removeAttribute() {}, setAttribute() {}, dispatchEvent() {}, click() {},
      get innerHTML() { return String(this.textContent).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
    };
  }
  const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const state = { apiConfig: { id: 'main', proxyUrl: 'https://chat.invalid', apiKey: 'chat-secret', model: 'chat-model',
    secondaryProxyUrl: 'https://summary.invalid', secondaryApiKey: 'summary-secret', secondaryModel: 'summary-model' },
    globalSettings: { safeRenderMode: false }, chats: {} };
  const c = { state, URL, console: { log() {}, warn() {}, error() {} }, AbortController,
    document: { getElementById: get, createElement: element, querySelectorAll: () => [], addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} }, CustomEvent: class {},
    setTimeout, clearTimeout,
    db: { apiConfig: { async put(value) { writes.push(clone(value)); } }, globalSettings: { async put() {} },
      chats: { async put(value) { writes.push(clone(value)); } }, apiPresets: { async get() { return { model: 'new-chat', proxyUrl: 'https://new.invalid', apiKey: 'new-key' }; } } },
    async fetch(url, request) {
      requests.push({ url, ...request, body: request.body ? JSON.parse(request.body) : undefined });
      return { ok: true, json: async () => url.endsWith('/models')
        ? { data: [{ id: 'chat-model' }, { id: 'bge-m3' }] }
        : { data: [{ embedding: [1, 0, 0] }] } };
    },
    showCustomAlert: async (...args) => alerts.push(args), showToast() {},
    stopBackgroundSimulation() {}, stopAutoBackupTimer() {}, saveGoogleImagenSettings() {}, saveOpenAIImageSettings() {},
    ttsSettings: { readApi: () => ({}) }, ttsProvider: { apiFields: () => ({}) }
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(source('modules/memory/extraction-support.js'), c);
  vm.runInContext(source('modules/memory/vector-memory.js'), c);
  vm.runInContext(source('modules/settings/embedding-api.js'), c);
  const manager = c.vectorMemoryManager;
  const chat = id => state.chats[id] ||= { id, settings: { memoryMode: 'vector' }, history: [] };
  function draft(config = globalConfig()) {
    c.EmbeddingApiSettings.render();
    for (const [field, key] of [['endpoint', 'endpoint'], ['apikey', 'apiKey'], ['model', 'model']]) get(`global-embedding-${field}`).value = config[key];
    get('global-embedding-enabled').checked = config.enabled;
  }
  function bindSave() {
    for (const file of ['novelai-connection.js', 'novelai-settings.js', 'generation-providers.js']) {
      vm.runInContext(source('modules/media/image/' + file), c);
    }
    const text = source('src/js-bundles/event-bindings-a/wallpaper-and-chat-input.jsfrag');
    vm.runInContext(text.slice(text.indexOf('    const saveApiSettingsButton ='), text.indexOf("    const ApiKeyInput =")), c);
  }
  return { c, get, nodes, state, manager, chat, requests, writes, alerts, draft, bindSave };
}

test('旧角色默认不变；全局共享、角色独立与原有默认方式互不覆盖', () => {
  const f = fixture(), a = f.chat('a'), b = f.chat('b'), custom = f.chat('custom');
  assert.equal(f.manager._embeddingConfig(a).source, 'legacy');
  assert.equal(f.manager._embeddingConfig(a).endpoint, 'https://summary.invalid');
  const own = f.manager.getVariableMemory(custom).settings;
  Object.assign(own, { useCustomEmbedding: true, embeddingEndpoint: 'https://own.invalid', embeddingApiKey: 'own-secret', embeddingModel: 'own-embed' });
  const before = clone(own);
  f.state.apiConfig.embeddingConfig = globalConfig();
  assert.equal(f.manager._embeddingConfig(a).source, 'global');
  assert.equal(f.manager._embeddingConfig(b).model, 'bge-m3');
  assert.equal(f.manager._embeddingConfig(custom).model, 'own-embed');
  assert.deepEqual(clone(f.manager.getVariableMemory(custom).settings), before);
  f.manager.getVariableMemory(b).settings.embeddingSource = 'legacy';
  assert.equal(f.manager._embeddingConfig(b).endpoint, 'https://summary.invalid');
  f.state.apiConfig.embeddingConfig.enabled = false;
  assert.equal(f.manager._embeddingConfig(a).endpoint, 'https://summary.invalid');
  assert.equal(f.manager._embeddingConfig(custom).apiKey, 'own-secret');
  f.state.apiConfig.secondaryApiKey = '';
  assert.equal(f.manager._embeddingConfig(a).endpoint, 'https://chat.invalid');
  f.manager.getVariableMemory(custom).settings.embeddingApiKey = '';
  assert.equal(f.manager._embeddingConfig(custom).apiKey, 'chat-secret');
  f.manager.getVariableMemory(custom).settings.embeddingEndpoint = '';
  assert.equal(f.manager._embeddingConfig(custom).source, 'legacy');
  assert.equal(f.requests.length, 0);
});

test('真实向量请求共用配置和缓存，但角色记忆独立，Key 不复制进角色或记忆导出', async () => {
  const f = fixture(), a = f.chat('a'), b = f.chat('b');
  f.state.apiConfig.embeddingConfig = globalConfig();
  await f.manager.getEmbedding('同一查询', a);
  await f.manager.getEmbedding('同一查询', b);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, 'https://vectors.invalid/v1/embeddings');
  assert.equal(f.requests[0].headers.Authorization, 'Bearer vector-secret');
  assert.equal(f.requests[0].body.model, 'bge-m3');
  f.manager.createFragment(a, { content: '甲角色独有的记忆', category: 'E' });
  assert.equal(f.manager.getVariableMemory(b).fragments.length, 0);
  assert.doesNotMatch(JSON.stringify(a), /vector-secret/);
  assert.doesNotMatch(f.manager.exportMemory(a), /vector-secret/);
  assert.equal(f.state.apiConfig.model, 'chat-model');
  assert.equal(f.state.apiConfig.secondaryModel, 'summary-model');
});

test('全局配置缺失或接口失败使用本地检索，不把主 Key 发给全局地址', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = { ...globalConfig(), apiKey: '' };
  f.manager.createFragment(a, { category: 'U', content: '我喜欢草莓蛋糕' });
  const rows = await f.manager.retrieveRelevant(a, '草莓蛋糕');
  assert.equal(f.requests.length, 0);
  assert.ok(rows.length > 0);
  f.state.apiConfig.embeddingConfig.apiKey = 'vector-secret';
  f.c.fetch = async () => ({ ok: false, status: 401, text: async () => 'Unauthorized' });
  assert.equal(await f.manager.getEmbedding('失败查询', a), null);
  assert.match(a.variableMemory.stats.embeddingStatusDetail, /HTTP 401/);
  assert.equal(a.variableMemory.fragments.length, 1);
});

test('接口或 Key 变化使查询及检索结果缓存失效，旧模型向量不会混算', async () => {
  const f = fixture(), a = f.chat('a');
  f.manager.createFragment(a, { category: 'E', content: '我们去海边旅行', embedding: [1, 0, 0] });
  const frag = a.variableMemory.fragments[0];
  assert.equal(f.manager._hasCurrentEmbedding(a, frag), true);
  await f.manager.retrieveRelevant(a, '海边旅行');
  const initial = f.requests.length;
  await f.manager.retrieveRelevant(a, '海边旅行');
  assert.equal(f.requests.length, initial);
  f.state.apiConfig.embeddingConfig = globalConfig();
  assert.equal(f.manager._hasCurrentEmbedding(a, frag), false);
  await f.manager.retrieveRelevant(a, '海边旅行');
  assert.equal(f.requests.length, initial + 1);
  const scored = f.manager._scoreFragments(a, '海边旅行', [1, 0, 0]);
  assert.equal(scored[0].semanticScore, 0);
  f.state.apiConfig.embeddingConfig.apiKey = 'changed-secret';
  await f.manager.retrieveRelevant(a, '海边旅行');
  assert.equal(f.requests.length, initial + 2);
  assert.equal(f.requests.at(-1).headers.Authorization, 'Bearer changed-secret');
  assert.deepEqual(clone(frag.embedding), [1, 0, 0]);
  f.state.apiConfig.embeddingConfig.enabled = false;
  assert.equal(f.manager._hasCurrentEmbedding(a, frag), true);
});

test('切换中的旧请求不会被当作新模型结果；重建停止并保留旧向量', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig();
  f.manager.createFragment(a, { category: 'E', content: '旧记忆', embedding: [0, 1, 0], embeddingSignature: 'old|old' });
  let release;
  f.c.fetch = async () => { await new Promise(resolve => { release = resolve; }); return { ok: true, json: async () => ({ data: [{ embedding: [1, 0, 0] }] }) }; };
  const rebuilding = f.manager.rebuildEmbeddings(a);
  await new Promise(resolve => setImmediate(resolve));
  f.state.apiConfig.embeddingConfig.model = 'new-embedding';
  release();
  await assert.rejects(rebuilding, /向量设置已变化/);
  assert.deepEqual(clone(a.variableMemory.fragments[0].embedding), [0, 1, 0]);
  assert.equal(f.manager.embeddingCache.size, 0);
});

test('角色表单切换来源保留独立配置；测试和拉取遵循草稿来源但不修改设置', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig();
  const settings = f.manager.getVariableMemory(a).settings;
  Object.assign(settings, { useCustomEmbedding: true, embeddingEndpoint: 'https://own.invalid', embeddingApiKey: 'own-key', embeddingModel: 'own-model' });
  for (const [id, value] of [['vm-auto-interval', '20'], ['vm-embedding-endpoint', 'https://own.invalid'],
    ['vm-embedding-apikey', 'own-key'], ['vm-embedding-model-input', 'own-model']]) f.get(id).value = value;
  f.get('vm-embedding-source').value = 'global';
  const before = clone(a.variableMemory);
  assert.equal(await f.manager.testEmbeddingConnection(a, true), 3);
  await f.manager.fetchAvailableModels(a);
  assert.equal(f.requests[0].url, 'https://vectors.invalid/v1/embeddings');
  assert.equal(f.requests[1].url, 'https://vectors.invalid/v1/models');
  assert.deepEqual(clone(a.variableMemory), before);
  f.manager.saveSettingsFromUI(a);
  assert.equal(a.variableMemory.settings.useCustomEmbedding, false);
  assert.equal(a.variableMemory.settings.embeddingApiKey, 'own-key');
  assert.equal(f.manager._embeddingConfig(a).source, 'global');
  f.get('vm-embedding-source').value = 'legacy';
  f.manager.saveSettingsFromUI(a);
  assert.equal(f.manager._embeddingConfig(a).source, 'legacy');
  f.get('vm-embedding-source').value = 'custom';
  f.manager.saveSettingsFromUI(a);
  assert.equal(f.manager._embeddingConfig(a).apiKey, 'own-key');
});

test('全局表单可反复打开、拉取和测试，未保存时不会改变运行配置或角色记忆', async () => {
  const f = fixture();
  f.c.EmbeddingApiSettings.render();
  assert.equal(f.get('global-embedding-enabled').checked, false);
  assert.equal(f.get('global-embedding-fields').hidden, true);
  f.draft();
  await f.get('global-embedding-enabled').emit('change');
  assert.equal(f.get('global-embedding-fields').hidden, false);
  await f.get('global-embedding-fetch').emit('click');
  assert.equal(f.get('global-embedding-models').children[1].value, 'bge-m3');
  f.get('global-embedding-models').value = 'bge-m3';
  await f.get('global-embedding-models').emit('change');
  await f.get('global-embedding-test').emit('click');
  assert.match(f.get('global-embedding-status').textContent, /接口正常.*3 维/);
  assert.equal(f.state.apiConfig.embeddingConfig, undefined);
  assert.equal(f.writes.length, 0);
  assert.equal(Object.keys(f.state.chats).length, 0);
  f.c.EmbeddingApiSettings.render();
  assert.equal(f.get('global-embedding-test').listeners.click.length, 1);
  assert.equal(f.get('global-embedding-model').value, 'text-embedding-3-small');
});

test('连接测试总是实际请求，旧缓存不会掩盖接口故障；坏模型列表有清楚反馈', async () => {
  const f = fixture();
  f.draft();
  await f.get('global-embedding-test').emit('click');
  f.c.fetch = async () => ({ ok: false, status: 403, text: async () => 'Forbidden' });
  await f.get('global-embedding-test').emit('click');
  assert.match(f.get('global-embedding-status').textContent, /测试失败.*403/);
  assert.equal(f.get('global-embedding-test').disabled, false);
  f.c.fetch = async () => ({ ok: true, json: async () => ({ data: 'invalid' }) });
  await f.get('global-embedding-fetch').emit('click');
  assert.match(f.get('global-embedding-status').textContent, /返回格式异常/);
});

test('通过现有完成按钮保存，刷新可恢复，保存不产生向量请求；失败保留原配置', async () => {
  const f = fixture();
  f.draft(); f.bindSave();
  f.c.db.apiConfig.put = async () => { throw Error('quota'); };
  await f.get('save-api-settings-btn').emit('click');
  assert.equal(f.state.apiConfig.embeddingConfig, undefined);
  assert.match(f.alerts.at(-1)[0], /未保存/);
  f.c.db.apiConfig.put = async value => f.writes.push(clone(value));
  await f.get('save-api-settings-btn').emit('click');
  assert.deepEqual(clone(f.state.apiConfig.embeddingConfig), globalConfig());
  assert.deepEqual(f.writes[0].embeddingConfig, globalConfig());
  assert.equal(f.requests.length, 0);
  const restarted = fixture();
  restarted.state.apiConfig = clone(f.writes[0]);
  restarted.c.EmbeddingApiSettings.render();
  assert.equal(restarted.get('global-embedding-enabled').checked, true);
  assert.equal(restarted.get('global-embedding-model').value, 'bge-m3');
  assert.equal(restarted.manager._embeddingConfig(restarted.chat('a')).source, 'global');
});

test('全局未启用时允许保存未填完的草稿；启用后拦截缺少地址、Key 或模型', async () => {
  const f = fixture(); f.bindSave();
  for (const missing of ['endpoint', 'apiKey', 'model']) {
    f.draft({ ...globalConfig(), [missing]: '' });
    await f.get('save-api-settings-btn').emit('click');
    assert.equal(f.writes.length, 0);
    assert.equal(f.state.apiConfig.embeddingConfig, undefined);
  }
  f.draft({ enabled: false, endpoint: '', apiKey: '', model: '' });
  await f.get('save-api-settings-btn').emit('click');
  assert.equal(f.writes.length, 1);
  assert.equal(f.state.apiConfig.embeddingConfig.enabled, false);
});

test('完成按钮同时保存NovelAI地址、模型和Key，向量设置仍独立保存', async () => {
  const f = fixture(); f.draft(); f.bindSave();
  f.c.NovelAISettings.load();
  f.get('novelai-endpoint').value = 'https://relay.invalid/v1';
  f.get('novelai-model').value = '[站点]nai-diffusion-5-full';
  f.get('novelai-api-key').value = 'image-test-key';
  f.get('novelai-switch').checked = true;
  await f.get('save-api-settings-btn').emit('click');
  assert.equal(f.writes[0].novelaiSettings.endpoint, 'https://relay.invalid/v1');
  assert.equal(f.writes[0].novelaiModel, '[站点]nai-diffusion-5-full');
  assert.equal(f.writes[0].novelaiApiKey, 'image-test-key');
  assert.deepEqual(f.writes[0].embeddingConfig, globalConfig());
  assert.equal(f.requests.length, 0);
});

test('现有完成按钮保存宏规则与路由开关；全局存储失败保留旧设置，不发额外请求', async () => {
  const f = fixture(), records = [];
  f.draft(); f.bindSave();
  const config = { enabled: true, offMode: 'omit', scopes: { presets: true, worldbooks: true, prompts: true },
    rules: [{name:'greeting',enabled:true,type:'template',value:'你好 ${1}'}] };
  f.c.PromptMacroSettings = { read: () => config, renderObservations() {} };
  f.get('model-route-enabled').checked = true;
  f.c.db.globalSettings.put = async () => { throw Error('存储失败'); };
  await f.get('save-api-settings-btn').emit('click');
  assert.equal(f.state.globalSettings.promptMacros, undefined);
  assert.equal(f.state.globalSettings.modelRouteObservation, undefined);
  f.c.db.globalSettings.put = async row => records.push(clone(row));
  await f.get('save-api-settings-btn').emit('click');
  assert.deepEqual(clone(f.state.globalSettings.promptMacros), config);
  assert.equal(f.state.globalSettings.modelRouteObservation, true);
  assert.deepEqual(records.at(-1).promptMacros, config);
  assert.equal(records.at(-1).modelRouteObservation, true);
  assert.equal(f.requests.length, 0);
});

test('两处真实 API 预设切换都保留全局向量配置', async () => {
  const f = fixture();
  f.state.apiConfig.embeddingConfig = globalConfig();
  vm.runInContext(source('modules/settings/api-presets.js'), f.c);
  vm.runInContext('renderApiSettings = () => {};', f.c);
  f.get('api-preset-select').value = '1';
  await f.c.handlePresetSelectionChange();
  assert.deepEqual(clone(f.state.apiConfig.embeddingConfig), globalConfig());
  // 悬浮球方法位于私有闭包中，执行其原函数体验证真实配置组装。
  const ball = source('modules/floating-ball.js');
  vm.runInContext(ball.slice(ball.indexOf('  async function switchApiPreset('), ball.indexOf('  // 保存当前 API 配置为预设')), f.c);
  await f.c.switchApiPreset(1);
  assert.deepEqual(f.writes.at(-1).embeddingConfig, globalConfig());
});

test('旧 vectorMemory 设置迁移后仍优先独立接口，完整备份和记忆导入不覆盖全局配置', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig();
  a.vectorMemory = { fragments: [], settings: { useCustomEmbedding: true, embeddingEndpoint: 'https://old.invalid', embeddingApiKey: 'old-key', embeddingModel: 'old-model' } };
  assert.equal(f.manager._embeddingConfig(a).endpoint, 'https://old.invalid');
  const exported = f.manager.exportMemory(a);
  assert.doesNotMatch(exported, /old-key|vector-secret/);
  const b = f.chat('b');
  await f.manager.importMemory(b, exported, 'replace');
  assert.equal(f.state.apiConfig.embeddingConfig.apiKey, 'vector-secret');
  const backup = clone(f.state.apiConfig);
  const restored = fixture(); restored.state.apiConfig = backup;
  assert.equal(restored.manager._embeddingConfig(restored.chat('a')).model, 'bge-m3');
});

test('全局启用时总结提取仍使用原副 API，不使用向量模型做聊天请求', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig();
  vm.runInContext(source('modules/memory/extraction-runner.js'), f.c);
  f.c.fetch = async (url, request) => {
    f.requests.push({ url, body: JSON.parse(request.body) });
    return { ok: true, json: async () => ({ choices: [{ message: { content: '[]' }, finish_reason: 'stop' }] }) };
  };
  await f.c.executeVectorExtraction(a, [{ id: 'm1', role: 'user', content: '今天去了海边', timestamp: Date.now() }]);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, 'https://summary.invalid/v1/chat/completions');
  assert.equal(f.requests[0].body.model, 'summary-model');
});

test('整合期间更换全局模型会停止覆盖，原记忆和提取进度保留', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig();
  const id = f.manager.createFragment(a, { category: 'U', content: '喜欢草莓' });
  const snapshot = f.manager.captureConsolidation(a);
  const rows = f.manager.parseConsolidationResult(JSON.stringify([{ sourceIds: [id], category: 'U', content: '用户喜欢草莓' }]), snapshot);
  const before = clone(a.variableMemory.fragments);
  f.c.fetch = async () => {
    f.state.apiConfig.embeddingConfig.model = 'changed-model';
    return { ok: true, json: async () => ({ data: [{ embedding: [1, 0, 0] }] }) };
  };
  await assert.rejects(f.manager.saveConsolidation(a, snapshot, rows), /向量设置已变化/);
  assert.deepEqual(clone(a.variableMemory.fragments), before);
  assert.equal(a.variableMemory.settings.lastExtractedMsgIndex, -1);
});

function seedVector(f, chat, content = '我们去海边旅行', vector = [1, 0, 0]) {
  const id = f.manager.createFragment(chat, { category: 'E', content, embedding: vector,
    embeddingSignature: f.manager._embeddingSignature(chat) });
  const fragment = f.manager.getFragment(chat, id);
  fragment.embeddingTextHash = f.manager._embeddingTextHashFor(chat, fragment);
  return fragment;
}

test('真实完成入口：用户选择沿用，换端点和分类前缀不重建、不丢失语义召回', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig();
  const fragment = seedVector(f, a);
  const old = clone(fragment.embedding);
  let prompts = 0;
  f.c.showChoiceModal = async () => { prompts++; return 'reuse'; };
  f.bindSave();
  f.draft({ ...globalConfig(), endpoint: 'https://relay.invalid/v1', model: '分类/bge-m3' });
  await f.get('save-api-settings-btn').emit('click');
  const saved = a.variableMemory.fragments[0];
  assert.equal(prompts, 1);
  assert.equal(f.requests.length, 0);
  assert.equal(f.manager._hasCurrentEmbedding(a, saved), true);
  assert.deepEqual(clone(saved.embedding), old);
  assert.equal(f.manager._scoreFragments(a, '旅行', [1, 0, 0])[0].semanticScore, 1);
  assert.ok(f.writes.some(row => row.id === 'a' && row.variableMemory.embeddingProfiles.length === 2));
});

test('全局取消切换：运行配置、向量、兼容设置和持久化记录均不变', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig();
  seedVector(f, a);
  const before = clone(a), config = clone(f.state.apiConfig);
  f.c.showChoiceModal = async () => 'cancel';
  f.bindSave(); f.draft({ ...globalConfig(), model: 'prefix/bge-m3' });
  await f.get('save-api-settings-btn').emit('click');
  assert.deepEqual(clone(f.state.apiConfig), config);
  assert.deepEqual(clone(a), before);
  assert.equal(f.writes.length, 0);
  assert.equal(f.requests.length, 0);
  assert.equal(f.get('save-api-settings-btn').dataset.saving, 'false');
});

test('不同模型分别重建，切回旧模型从历史向量计算语义分数，刷新后仍可用', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig();
  const original = seedVector(f, a);
  const oldSignature = original.embeddingSignature;
  f.c.showChoiceModal = async () => 'new';
  await f.manager.saveApiConfiguration({ ...f.state.apiConfig, embeddingConfig: { ...globalConfig(), model: 'other-model' } });
  f.c.fetch = async () => ({ ok: true, json: async () => ({ data: [{ embedding: [0, 1, 0] }] }) });
  const result = await f.manager.rebuildEmbeddings(a);
  assert.equal(result.completed, 1);
  assert.deepEqual(clone(a.variableMemory.fragments[0].embedding), [0, 1, 0]);
  assert.ok(a.variableMemory.fragments[0].embeddingVersions.some(record => record.signature === oldSignature && record.embedding[0] === 1));
  const restarted = fixture();
  restarted.state.apiConfig = clone(f.state.apiConfig);
  restarted.state.chats.a = clone(a);
  restarted.c.showChoiceModal = async () => 'restore';
  await restarted.manager.saveApiConfiguration({ ...restarted.state.apiConfig, embeddingConfig: globalConfig() });
  const restored = restarted.chat('a');
  assert.equal(restarted.manager._scoreFragments(restored, '旅行', [1, 0, 0])[0].semanticScore, 1);
  assert.equal(restarted.requests.length, 0);
  const reused = await restarted.manager.rebuildEmbeddings(restored);
  assert.equal(reused.completed, 0);
  assert.equal(reused.skipped, 1);
  assert.equal(restarted.requests.length, 0);
});

test('已停用的旧向量也能选择沿用，不要求反馈者先切回旧地址', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig();
  const fragment = seedVector(f, a);
  const oldSignature = fragment.embeddingSignature;
  // 模拟升级前已经更换接口、页面全显示 BM25 的用户。
  f.state.apiConfig.embeddingConfig.model = '已改名/bge-m3';
  assert.equal(f.manager._hasCurrentEmbedding(a, fragment), false);
  f.c.showChoiceModal = async (_, options) => options.find(option => option.value.startsWith('reuse-from:')).value;
  await f.manager.saveApiConfiguration({ ...f.state.apiConfig, embeddingConfig: { ...globalConfig(), model: '新前缀/bge-m3' } });
  assert.equal(f.manager._hasCurrentEmbedding(a, a.variableMemory.fragments[0]), true);
  assert.equal(a.variableMemory.fragments[0].embeddingSignature, oldSignature);
  assert.equal(f.requests.length, 0);
});

test('重建逐条保存；停止后刷新继续，只请求尚未完成的记忆', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig();
  for (const content of ['记忆一', '记忆二', '记忆三']) f.manager.createFragment(a, { category: 'E', content });
  const result = await f.manager.rebuildEmbeddings(a, () => f.manager.cancelEmbeddingRebuild(a));
  assert.equal(result.cancelled, true);
  assert.equal(result.completed, 1);
  const persisted = f.writes.filter(row => row.id === 'a').at(-1);
  assert.ok(persisted.variableMemory.fragments[0].embedding);
  assert.equal(persisted.variableMemory.fragments[1].embedding, null);
  const restarted = fixture();
  restarted.state.apiConfig = clone(f.state.apiConfig);
  restarted.state.chats.a = persisted;
  const continued = await restarted.manager.rebuildEmbeddings(restarted.chat('a'));
  assert.equal(continued.completed, 2);
  assert.equal(continued.skipped, 1);
  assert.equal(restarted.requests.length, 2);
  assert.ok(restarted.requests.every(request => !request.body.input.includes('记忆一')));
});

test('部分接口失败后继续，只重试失败项，不覆盖已成功向量', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig();
  for (const content of ['记忆一', '记忆二', '记忆三']) f.manager.createFragment(a, { category: 'E', content });
  let failSecond = true, requested = [];
  f.c.fetch = async (_, request) => {
    const text = JSON.parse(request.body).input; requested.push(text);
    if (text.includes('记忆二') && failSecond) return { ok: false, status: 503, text: async () => '暂不可用' };
    return { ok: true, json: async () => ({ data: [{ embedding: [1, 0, 0] }] }) };
  };
  const first = await f.manager.rebuildEmbeddings(a);
  assert.equal(first.completed, 2); assert.equal(first.failed, 1);
  failSecond = false; requested = [];
  const second = await f.manager.rebuildEmbeddings(a);
  assert.equal(second.completed, 1); assert.equal(second.skipped, 2);
  assert.equal(requested.length, 1); assert.match(requested[0], /记忆二/);
});

test('修改正文或标签只使对应记忆失效，旧正文向量不能用于新内容', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig();
  const first = seedVector(f, a), second = seedVector(f, a, '另一次旅行');
  f.manager.editFragment(a, first.id, { content: '完全不同的事情' });
  assert.equal(f.manager._hasCurrentEmbedding(a, first), false);
  assert.equal(f.manager._hasCurrentEmbedding(a, second), true);
  assert.ok(first.embeddingVersions.length);
  const result = await f.manager.rebuildEmbeddings(a);
  assert.equal(result.completed, 1); assert.equal(result.skipped, 1);
  assert.equal(f.requests.length, 1);
  f.manager.editFragment(a, first.id, { tags: ['新标签'] });
  assert.equal(f.manager._hasCurrentEmbedding(a, first), false);
});

test('用户沿用但维度不匹配：明确提示、不混算；可改为新模型后重建并保留旧套', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig(); seedVector(f, a);
  f.c.showChoiceModal = async () => 'reuse';
  await f.manager.saveApiConfiguration({ ...f.state.apiConfig, embeddingConfig: { ...globalConfig(), model: 'alias-model' } });
  f.c.fetch = async () => ({ ok: true, json: async () => ({ data: [{ embedding: [1, 0] }] }) });
  const diagnosis = await f.manager.diagnoseRetrieval(a, '海边旅行');
  assert.equal(diagnosis[0].semanticScore, 0);
  assert.match(f.manager.embeddingStatusText(a), /维度.*不匹配/);
  assert.equal(a.variableMemory.fragments[0].embedding.length, 3);
  await f.manager.useCurrentInterfaceAsNewModel(a);
  const result = await f.manager.rebuildEmbeddings(a);
  assert.equal(result.completed, 1);
  assert.equal(a.variableMemory.fragments[0].embedding.length, 2);
  assert.ok(a.variableMemory.fragments[0].embeddingVersions.some(record => record.embedding.length === 3));
});

test('完整及部分记忆导出导入保留多模型向量和别名关系，不带出 Key', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig(); const fragment = seedVector(f, a);
  f.c.showChoiceModal = async () => 'reuse';
  await f.manager.saveApiConfiguration({ ...f.state.apiConfig, embeddingConfig: { ...globalConfig(), model: 'alias-model' } });
  const full = f.manager.exportMemory(a);
  const partial = f.manager.exportSelected(a, [{ id: fragment.id }]);
  for (const [id, data] of [['full', full], ['partial', partial]]) {
    assert.doesNotMatch(data, /vector-secret|chat-secret|summary-secret/);
    const target = f.chat(id);
    await f.manager.importMemory(target, data, id === 'full' ? 'replace' : 'merge');
    assert.equal(f.manager._hasCurrentEmbedding(target, target.variableMemory.fragments[0]), true);
    assert.ok(target.variableMemory.fragments[0].embeddingVersions.length);
  }
});

test('角色独立配置切换可沿用；取消或存储失败不会改变设置和向量', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig(); seedVector(f, a);
  f.get('vm-auto-interval').value = '20';
  f.get('vm-embedding-source').value = 'custom';
  f.get('vm-embedding-endpoint').value = 'https://own.invalid';
  f.get('vm-embedding-apikey').value = 'own-secret';
  f.get('vm-embedding-model-input').value = 'alias-model';
  const before = clone(a);
  f.c.showChoiceModal = async () => 'cancel';
  assert.equal(await f.manager.saveSettingsWithEmbeddingChoice(a), false);
  assert.deepEqual(clone(a), before);
  f.c.showChoiceModal = async () => 'reuse';
  f.c.db.chats.put = async () => { throw new Error('写入失败'); };
  await assert.rejects(f.manager.saveSettingsWithEmbeddingChoice(a), /写入失败/);
  assert.deepEqual(clone(a), before);
  f.c.db.chats.put = async () => {};
  assert.equal(await f.manager.saveSettingsWithEmbeddingChoice(a), true);
  assert.equal(f.manager._hasCurrentEmbedding(a, a.variableMemory.fragments[0]), true);
  assert.equal(f.requests.length, 0);
});

test('多个角色的全局切换只问一次，独立接口的角色不受影响；事务失败不切换', async () => {
  const f = fixture(), a = f.chat('a'), b = f.chat('b'), custom = f.chat('custom');
  f.state.apiConfig.embeddingConfig = globalConfig(); seedVector(f, a); seedVector(f, b);
  Object.assign(f.manager.getVariableMemory(custom).settings, { useCustomEmbedding: true, embeddingEndpoint: 'https://own.invalid', embeddingModel: 'own' });
  const own = clone(custom), before = clone(a), config = clone(f.state.apiConfig);
  let prompts = 0;
  f.c.showChoiceModal = async () => { prompts++; return 'reuse'; };
  f.c.db.transaction = async () => { throw new Error('事务失败'); };
  const next = { ...f.state.apiConfig, embeddingConfig: { ...globalConfig(), model: 'alias-model' } };
  await assert.rejects(f.manager.saveApiConfiguration(next), /事务失败/);
  assert.deepEqual(clone(a), before); assert.deepEqual(clone(f.state.apiConfig), config);
  f.c.db.transaction = async (...args) => args.at(-1)();
  await f.manager.saveApiConfiguration(next);
  assert.equal(prompts, 2);
  assert.deepEqual(clone(custom), own);
  assert.equal(f.manager._hasCurrentEmbedding(a, a.variableMemory.fragments[0]), true);
  assert.equal(f.manager._hasCurrentEmbedding(b, b.variableMemory.fragments[0]), true);
});

test('已显示 BM25 的用户可直接选择旧向量，无须再修改模型或地址', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig(); seedVector(f, a);
  f.state.apiConfig.embeddingConfig.model = '分类/bge-m3';
  f.c.showChoiceModal = async (_, options) => options.find(option => option.value.startsWith('reuse-from:')).value;
  assert.equal(await f.manager.chooseSavedEmbeddings(a), true);
  assert.equal(f.manager._hasCurrentEmbedding(a, a.variableMemory.fragments[0]), true);
  assert.equal(f.requests.length, 0);
});

test('接口名称未变也能显式建立新的一套，已有向量仍可选择恢复', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig(); seedVector(f, a);
  await f.manager.getEmbedding(f.manager._embeddingTextFor(a, a.variableMemory.fragments[0]), a);
  assert.equal(f.requests.length, 1);
  await f.manager.useCurrentInterfaceAsNewModel(a);
  assert.equal(f.manager._hasCurrentEmbedding(a, a.variableMemory.fragments[0]), false);
  assert.equal((await f.manager.rebuildEmbeddings(a)).completed, 1);
  assert.equal(f.requests.length, 2);
  assert.equal(a.variableMemory.fragments[0].embeddingVersions.length, 2);
  f.c.showChoiceModal = async (_, options) => options.find(option => option.value.startsWith('reuse-from:')).value;
  await f.manager.chooseSavedEmbeddings(a);
  assert.equal(f.manager._hasCurrentEmbedding(a, a.variableMemory.fragments[0]), true);
});

test('请求中停止不写成接口故障；正在重建的记忆不能被并发提取或设置切换覆盖', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig();
  f.manager.createFragment(a, { category: 'E', content: '待生成的记忆' });
  let started;
  const pending = new Promise(resolve => { started = resolve; });
  f.c.fetch = async (_, request) => {
    started();
    return new Promise((resolve, reject) => request.signal.addEventListener('abort', () => reject(new Error('signal is aborted without reason')), { once: true }));
  };
  const rebuilding = f.manager.rebuildEmbeddings(a);
  await pending;
  assert.equal(f.manager._extractionLocks.get(a).type, 'embedding-rebuild');
  await assert.rejects(f.manager.saveApiConfiguration({ ...f.state.apiConfig, embeddingConfig: { ...globalConfig(), model: 'different' } }), /结束正在运行的记忆任务/);
  f.manager.cancelEmbeddingRebuild(a);
  const result = await rebuilding;
  assert.equal(result.cancelled, true);
  assert.notEqual(a.variableMemory.stats.embeddingStatus, 'error');
  assert.equal(f.manager._extractionLocks.has(a), false);
});

test('重建请求返回前正文已修改，不保存与新内容不符的结果', async () => {
  const f = fixture(), a = f.chat('a');
  f.state.apiConfig.embeddingConfig = globalConfig();
  const id = f.manager.createFragment(a, { category: 'E', content: '原内容' });
  let release, started;
  const pending = new Promise(resolve => { started = resolve; });
  f.c.fetch = async () => { started(); await new Promise(resolve => { release = resolve; }); return { ok: true, json: async () => ({ data: [{ embedding: [1, 0, 0] }] }) }; };
  const rebuilding = f.manager.rebuildEmbeddings(a);
  await pending;
  f.manager.editFragment(a, id, { content: '新内容' });
  release();
  const result = await rebuilding;
  assert.equal(result.completed, 0); assert.equal(result.failed, 1);
  assert.equal(a.variableMemory.fragments[0].embedding, null);
});

test('主、副和悬浮球预设切换都可取消；原有默认向量接口不会被静默替换', async () => {
  for (const entry of ['main', 'secondary', 'floating']) {
    const f = fixture(), a = f.chat('a'); seedVector(f, a);
    const original = clone(f.state.apiConfig), memory = clone(a);
    let prompts = 0;
    f.c.showChoiceModal = async () => { prompts++; return 'cancel'; };
    f.c.db.apiPresets.toArray = async () => [];
    if (entry === 'main') {
      vm.runInContext(source('modules/settings/api-presets.js'), f.c);
      f.get('api-preset-select').value = '1';
      await f.c.handlePresetSelectionChange();
    } else if (entry === 'secondary') {
      f.c.db.secondaryApiPresets = { async get() { return { secondaryProxyUrl: 'https://changed.invalid', secondaryApiKey: 'changed', secondaryModel: 'chat' }; }, async toArray() { return []; } };
      const script = source('modules/settings/secondary-api-presets.js');
      vm.runInContext(script.slice(0, script.indexOf('  async function saveSecondaryApiPreset()')), f.c);
      f.get('secondary-api-preset-select').value = '1';
      await f.c.handleSecondaryApiPresetSelectionChange();
    } else {
      const script = source('modules/floating-ball.js');
      vm.runInContext(script.slice(script.indexOf('  async function switchApiPreset('), script.indexOf('  // 保存当前 API 配置为预设')), f.c);
      await f.c.switchApiPreset(1);
    }
    assert.equal(prompts, 1, entry);
    assert.deepEqual(clone(f.state.apiConfig), original, entry);
    assert.deepEqual(clone(a), memory, entry);
    assert.equal(f.writes.length, 0, entry);
  }
});
