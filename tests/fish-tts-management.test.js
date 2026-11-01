const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture(respond = () => ({ items: [] })) {
  const requests = [], c = { URL, URLSearchParams, FormData, Blob, Set, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => { requests.push({ url, options }); return new Response(JSON.stringify(respond(url, options)), { headers: { 'Content-Type': 'application/json' } }); } };
  c.window = c; vm.createContext(c); vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../modules/fish-tts-provider.js'), 'utf8'), c);
  return { api: c.fishTts, requests, config: { fishApiKey: 'test-only', fishBaseUrl: 'https://api.fish.audio' } };
}
test('Fish 公开搜索、私有音色分页、详情使用独立鉴权且不写入 HTTP 缓存', async () => {
  const f = fixture();
  await f.api.listVoices(f.config, { search: '中文 声音', page: 2, mine: true, language: 'zh' });
  const url = new URL(f.requests[0].url);
  assert.equal(url.pathname, '/model'); assert.equal(url.searchParams.get('title'), '中文 声音');
  assert.equal(url.searchParams.get('page_number'), '2'); assert.equal(url.searchParams.get('self'), 'true');
  assert.equal(f.requests[0].options.headers.Authorization, 'Bearer test-only'); assert.equal(f.requests[0].options.cache, 'no-store');
  await f.api.getVoice(f.config, 'voice-id'); assert.equal(new URL(f.requests[1].url).pathname, '/model/voice-id');
});
test('Fish 网关路径查询保留；完整兼容前缀不会重复', () => {
  const f = fixture();
  for (const base of ['https://proxy.example/fish', 'https://proxy.example/fish/compat/v1', 'https://proxy.example/fish/v1',
    'https://proxy.example/fish/compat', 'https://proxy.example/fish/compat/api/v1', 'https://proxy.example/fish/compat/openai/v1',
    'https://proxy.example/fish/compat/v1/audio/speech']) {
    assert.equal(f.api.endpoint(base + '?route=fish', '/compat/v1/audio/speech'), 'https://proxy.example/fish/compat/v1/audio/speech?route=fish');
  }
  assert.throws(() => f.api.endpoint('file:///secret', '/model'), /HTTP/);
  assert.equal(f.api.voiceId('https://fish.audio/m/voice-id/?ref=share'), 'voice-id');
  assert.throws(() => f.api.voiceId('https://other.example/m/voice-id'), /Fish/);
});
test('创建音色使用 multipart，明确私有，参考录音和文字一一对应', async () => {
  const f = fixture(() => ({ _id: 'created' }));
  const audio = Object.assign(new Blob([Uint8Array.of(1, 2)], { type: 'audio/wav' }), { name: 'reference.wav' });
  const result = await f.api.createVoice(f.config, { title: ' 我的音色 ', files: [audio], texts: ['你好'] });
  assert.equal(result._id, 'created'); const r = f.requests[0]; assert.equal(r.options.method, 'POST');
  assert.equal(r.options.headers['Content-Type'], undefined); assert.ok(r.options.body instanceof FormData);
  assert.equal(r.options.body.get('visibility'), 'private'); assert.equal(r.options.body.get('title'), '我的音色');
  assert.equal(r.options.body.get('voices').size, 2); assert.deepEqual(r.options.body.getAll('texts'), ['你好']);
  await assert.rejects(f.api.createVoice(f.config, { title: 'bad', files: [audio], texts: ['one', 'two'] }), /对应/);
  assert.equal(f.requests.length, 1);
});
test('Fish 修改删除使用对应资源；账户检查不使用公开模型列表冒充鉴权', async () => {
  const f = fixture(); await f.api.updateVoice(f.config, 'voice-id', { title: '新名字' });
  assert.equal(f.requests[0].options.method, 'PATCH'); assert.deepEqual(JSON.parse(f.requests[0].options.body), { title: '新名字' });
  await f.api.deleteVoice(f.config, 'voice-id'); assert.equal(f.requests[1].options.method, 'DELETE');
  await f.api.check(f.config); assert.equal(new URL(f.requests[2].url).pathname, '/wallet/self/api-credit');
});
test('Fish 模型获取过滤转写模型，所有配置字段能进入 API 预设与备份', async () => {
  const f = fixture(() => ({ data: [{ id: 'fish-audio/s2.1-pro-free' }, { id: 'fish-audio/transcribe-1' }] }));
  const rows = await f.api.listModels(f.config); assert.equal(rows.length, 1);
  assert.equal(f.api.defaults.fishModel, 'fish-audio/s2.1-pro-free');
  for (const field of ['fishVoiceId', 'fishModel', 'fishVoiceSettings', 'fishTtsSpeed']) {
    for (const name of ['modules/chat-settings-presets.js', 'src/js-bundles/event-bindings-b/memory-and-api-history.jsfrag']) assert.ok(fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8').includes(field));
  }
});

test('Fish 录音转写直连兼容接口、复用独立 Key、不复制 Key 到角色设置', async () => {
  const f = fixture(() => ({ text: '  你好  ' })), blob = new Blob([Uint8Array.of(1)], { type: 'audio/wav' });
  assert.equal(await f.api.transcribe(f.config, blob), '你好');
  const r = f.requests[0]; assert.equal(new URL(r.url).pathname, '/compat/v1/audio/transcriptions');
  assert.equal(r.options.headers.Authorization, 'Bearer test-only'); assert.equal(r.options.headers['Content-Type'], undefined);
  assert.equal(r.options.body.get('model'), 'fish-audio/transcribe-1'); assert.equal(r.options.body.get('file').name, 'recording.wav');
  assert.equal(r.options.body.has('language'), false);
  await assert.rejects(f.api.transcribe(f.config, new Blob([])), /非空/);
});

test('中转 OpenAI 地址与模型原名保留，默认只发送标准合成字段', () => {
  const f = fixture(), api = { ...f.config, fishBaseUrl: 'https://relay.example/gateway/v1?tenant=a', fishProtocol: 'openai', fishModel: 'custom-fish-tts' };
  const config = { ...f.api.resolve({ fishVoiceId: 'voice' }, api, 'chat'), speed: 1 };
  const r = f.api.request(config, '你好');
  assert.equal(r.url, 'https://relay.example/gateway/v1/audio/speech?tenant=a');
  assert.equal(r.body.model, 'custom-fish-tts'); assert.equal(r.body.input, '你好');
  assert.equal(r.body.voice, 'voice'); assert.equal(r.body.provider, undefined); assert.equal(r.headers.model, undefined);
  assert.equal(f.api.metadataEndpoint(api, '/compat/v1/models'), 'https://relay.example/gateway/v1/models?tenant=a');
});

test('Fish 原生中转使用 model 请求头及原生 body，完整地址不会重复拼接', () => {
  const f = fixture(), api = { ...f.config, fishProtocol: 'native', fishBaseUrl: 'https://relay.example/proxy/v1/tts?tenant=a', fishModel: 's2-relay' };
  const config = { ...f.api.resolve({ fishVoiceId: 'voice', fishVoiceSettings: { temperature: 0.4 } }, api, 'call'), speed: 1.2 };
  const r = f.api.request(config, '原生测试');
  assert.equal(r.url, api.fishBaseUrl); assert.equal(r.headers.model, 's2-relay'); assert.equal(r.body.text, '原生测试');
  assert.equal(r.body.reference_id, 'voice'); assert.equal(r.body.prosody.speed, 1.2); assert.equal(r.body.temperature, 0.4);
  assert.equal(r.body.format, 'mp3'); assert.equal(r.body.input, undefined);
  assert.equal(f.api.metadataEndpoint(api, '/compat/v1/models'), 'https://relay.example/proxy/v1/models?tenant=a');
  assert.equal(f.api.metadataEndpoint(api, '/model?page_size=1'), 'https://relay.example/proxy/model?tenant=a&page_size=1');
});

test('中转特殊路径精确使用；音色管理可独立指定且不回落到官网', async () => {
  const f = fixture(), api = { ...f.config, fishProtocol: 'openai', fishSpeechUrl: 'https://relay.example/custom/speak?route=fish', fishModel: 'alias', fishManagementBaseUrl: 'https://relay.example/manage' };
  const config = { ...f.api.resolve({}, api, 'chat'), speed: 1 };
  assert.equal(f.api.request(config, '测试').url, api.fishSpeechUrl);
  await f.api.listVoices(api, { search: '中文' });
  assert.equal(new URL(f.requests[0].url).pathname, '/manage/model');
  assert.equal(f.requests[0].options.headers.Authorization, 'Bearer test-only');
  const local = { ...api, fishBaseUrl: 'https://relay.example/v1/audio/speech', fishManagementBaseUrl: '' };
  assert.equal(f.api.metadataEndpoint(local, '/model'), 'https://relay.example/model');
});

test('中转模型目录保留别名；连接检查不访问官网钱包', async () => {
  const f = fixture(() => ({ data: [{ id: 'fish-alias' }, { id: 'fish-audio/transcribe-1' }] }));
  const api = { ...f.config, fishProtocol: 'openai', fishBaseUrl: 'https://relay.example/v1' };
  const rows = await f.api.listModels(api); assert.equal(rows.length, 1); assert.equal(rows[0].id, 'fish-alias');
  await f.api.check(api); assert.equal(f.requests[1].url, 'https://relay.example/v1/models');
  await assert.rejects(f.api.transcribe(api, new Blob([Uint8Array.of(1)], { type: 'audio/wav' })), /未返回文字/);
  assert.equal(f.requests[2].url, 'https://relay.example/v1/audio/transcriptions');
});

test('切回官网后保留的中转地址不参与合成或音色管理请求', () => {
  const f = fixture(), api = { ...f.config, fishProtocol: 'fish', fishSpeechUrl: 'https://relay.example/speak', fishManagementBaseUrl: 'https://relay.example/manage' };
  const config = { ...f.api.resolve({}, api, 'chat'), speed: 1 };
  assert.equal(f.api.request(config, '官网').url, 'https://api.fish.audio/compat/v1/audio/speech');
  assert.equal(f.api.metadataEndpoint(api, '/model'), 'https://api.fish.audio/model');
});
