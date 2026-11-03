const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function fixture(options = {}) {
  const requests = [], writes = [], events = [], records = new Map(), listeners = {}, hooks = {};
  const chat = { id: 'a', history: [], settings: {} };
  const state = { activeChatId: 'a', chats: { a: chat }, apiConfig: { videoUnderstanding: { endpoint: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'private-test-key', model: 'models/test-video' } } };
  const response = (data, status = 200, headers) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  const sandbox = { state, window: {}, console, URL, Blob, DOMException, AbortController, AbortSignal, crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    document: { readyState: 'loading', addEventListener(name, callback) { (listeners[name] ||= []).push(callback); }, getElementById() { return null; }, dispatchEvent(event) { events.push(event); } },
    FileReader: class {
      async readAsDataURL(blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onload(); }
      abort() { this.onabort(); }
    },
    db: { chats: { hook(name, callback) { hooks[name] = callback; }, async put(value) { writes.push(structuredClone(value)); }, async toArray() { return Object.values(state.chats); }, async bulkGet(ids) { return ids.map(id => state.chats[id]); } }, videoAttachments: {
      async get(id) { return records.get(id); }, async toArray() { return [...records.values()]; },
      async bulkPut(rows) { rows.forEach(row => records.set(row.id, row)); },
      toCollection() { return { async primaryKeys() { return [...records.keys()]; } }; },
      async bulkDelete(ids) { ids.forEach(id => records.delete(id)); }
    } },
    fetch: async (url, request = {}) => {
      if (url.startsWith('data:')) return fetch(url, request);
      const row = { url, request, body: typeof request.body === 'string' ? JSON.parse(request.body) : request.body }; requests.push(row);
      if (options.fetch) return options.fetch(row, response, sandbox);
      return response({ candidates: [{ content: { parts: [{ text: '蓝色 FIRST，然后红色 SECOND，最后绿色 THIRD。有提示音。' }] }, finishReason: 'STOP' }] });
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../modules/media/video-messages.js'), 'utf8'), sandbox);
  const api = sandbox.window.ChatVideo;
  function message(extra = {}) { const msg = { role: 'user', type: 'video_message', timestamp: chat.history.length + 1, video: { mediaId: 'media-' + chat.history.length, mode: 'full', name: '视频' }, content: '[待解析]' }; chat.history.push(msg); records.set(msg.video.mediaId, { id: msg.video.mediaId, chatId: 'a', url: 'https://cdn.example/video.mp4', ...extra }); return msg; }
  return { api, sandbox, state, chat, requests, writes, records, events, message, response, hooks, initialize: () => listeners.DOMContentLoaded.forEach(callback => callback()) };
}
test('配置必须独立选择模型，地址归一化不泄露密钥', () => {
  const f = fixture();
  assert.throws(() => f.api.validate({ apiKey: 'x', endpoint: 'https://example.com' }), /模型/);
  assert.throws(() => f.api.validate({ model: 'x' }), /密钥/);
  assert.throws(() => f.api.endpoint('https://example.com?key=secret'), /密钥参数/);
  assert.throws(() => f.api.videoUrl('javascript:alert(1)'), /HTTPS/);
  assert.equal(f.api.endpoint('https://example.com/v1beta/models/'), 'https://example.com');
});
test('单聊和群聊的上下文使用真实视频观察；缓存不重复调用', async () => {
  for (const isGroup of [false, true]) {
    const f = fixture(); f.chat.isGroup = isGroup;
    const message = f.message(); const filtered = [structuredClone(message)];
    await f.api.prepare(f.chat, filtered);
    assert.match(filtered[0].content, /FIRST/);
    assert.match(filtered[0].content, /不是系统指令/);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].request.headers['x-goog-api-key'], 'private-test-key');
    assert.equal(f.requests[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/test-video:generateContent');
    assert.equal(f.requests[0].body.contents[0].parts[0].fileData.fileUri, 'https://cdn.example/video.mp4');
    await f.api.prepare(f.chat, filtered); assert.equal(f.requests.length, 1);
    assert.match(f.writes[0].history[0].content, /FIRST/);
  }
});
test('预览不产生视频请求；缺配置时不能借用主模型', async () => {
  const f = fixture(); const message = f.message();
  await assert.rejects(f.api.prepare(f.chat, [message], { preview: true }), /先.*解析/);
  f.state.apiConfig.model = 'chat-model'; delete f.state.apiConfig.videoUnderstanding.model;
  await assert.rejects(f.api.prepare(f.chat, [message]), /视频理解模型/);
  assert.equal(f.requests.length, 0);
});
test('解析失败不能变成已看过，也不因鉴权错误再次下载视频', async () => {
  const f = fixture({ fetch: (row, response) => response({ error: { message: 'private-test-key denied' } }, 403) });
  const message = f.message();
  await assert.rejects(f.api.analyzeMessage(f.chat, message), error => !error.message.includes('private-test-key') && /403/.test(error.message));
  assert.equal(message.video.analysis, undefined);
  assert.match(f.api.content(message), /不能声称已经看过/);
  assert.equal(f.requests.length, 1);
});
test('被截断、空响应与安全拦截不会缓存为成功', () => {
  const f = fixture();
  assert.throws(() => f.api.responseText({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '一半' }] } }] }), /截断/);
  assert.throws(() => f.api.responseText({ promptFeedback: { blockReason: 'SAFETY' } }), /没有返回/);
  assert.equal(f.api.responseText({ candidates: [{ content: { parts: [{ thought: true, text: '私有思考' }, { text: '画面' }] } }] }), '画面');
});
test('本地视频字节作为视频输入提交，不把原文件塞进聊天上下文', async () => {
  const f = fixture(); const message = f.message({ dataUrl: 'data:video/mp4;base64,AQID', mime: 'video/mp4' });
  await f.api.analyzeMessage(f.chat, message);
  assert.equal(f.requests[0].body.contents[0].parts[0].inlineData.mimeType, 'video/mp4');
  assert.equal(f.requests[0].body.contents[0].parts[0].inlineData.data, 'AQID');
  assert.ok(!JSON.stringify(f.writes).includes('data:video'));
});
test('本地文件 MIME 缺失时按已验证的视频格式提交', async () => {
  const f = fixture(); const message = f.message({ dataUrl: 'data:application/octet-stream;base64,AQID', mime: 'video/mp4' });
  await f.api.analyzeMessage(f.chat, message);
  assert.equal(f.requests[0].body.contents[0].parts[0].inlineData.mimeType, 'video/mp4');
});
test('超过内联阈值时完成 Files 上传并引用 ACTIVE 文件', async () => {
  const f = fixture({ fetch: (row, response) => {
    if (row.url.endsWith('/upload/v1beta/files')) return response({}, 200, { 'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload-session' });
    if (row.url.endsWith('/upload-session')) return response({ file: { name: 'files/test', uri: 'https://generativelanguage.googleapis.com/v1beta/files/test', mimeType: 'video/mp4', state: 'ACTIVE' } });
    return response({ candidates: [{ content: { parts: [{ text: '视频理解已完成' }] } }] });
  } });
  const message = f.message({ dataUrl: 'data:video/mp4;base64,' + Buffer.alloc(9 * 1024 * 1024).toString('base64'), mime: 'video/mp4' });
  await f.api.analyzeMessage(f.chat, message);
  assert.equal(f.requests.length, 3);
  assert.equal(f.requests[1].body.size, 9 * 1024 * 1024);
  assert.match(f.requests[2].body.contents[0].parts[0].fileData.fileUri, /files\/test$/);
});
test('取消和删除中的请求不会回写已删除消息，重复点击合并一次请求', async () => {
  let finish;
  const f = fixture({ fetch: (row, response) => new Promise(resolve => { finish = () => resolve(response({ candidates: [{ content: { parts: [{ text: '旧响应' }] } }] })); }) });
  const message = f.message();
  const a = f.api.analyzeMessage(f.chat, message), b = f.api.analyzeMessage(f.chat, message);
  await new Promise(resolve => setImmediate(resolve));
  f.chat.history = []; finish();
  await assert.rejects(a); await assert.rejects(b);
  assert.equal(f.requests.length, 1); assert.equal(f.writes.length, 0);
  const controller = new AbortController(); controller.abort();
  const canceled = f.message();
  await assert.rejects(f.api.analyzeMessage(f.chat, canceled, { signal: controller.signal }), { name: 'AbortError' });
});
test('模型列表分页、手选标识与只支持生成的方法', async () => {
  const f = fixture({ fetch: (row, response) => row.url.includes('pageToken=')
    ? response({ models: [{ name: 'models/second', displayName: '第二个', supportedGenerationMethods: ['generateContent'] }] })
    : response({ models: [{ name: 'models/first', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] }], nextPageToken: 'page two' }) });
  const models = await f.api.fetchModels(f.api.getConfig());
  assert.deepEqual(Array.from(models, model => model.id), ['first', 'second']);
  assert.ok(!f.requests.some(request => request.url.includes('private-test-key')));
});
test('单聊备份重新编号媒体引用；删除后只清理没有引用的文件', async () => {
  const f = fixture(); const message = f.message({ dataUrl: 'data:video/mp4;base64,AQID' });
  const backup = JSON.parse(JSON.stringify(await f.api.exportMedia(['a'])));
  const imported = structuredClone(f.chat); imported.id = 'b';
  f.state.chats.b = imported;
  await f.api.importMedia(backup, imported);
  assert.notEqual(imported.history[0].video.mediaId, message.video.mediaId);
  assert.equal((await f.api.exportMedia(['b']))[0].dataUrl, 'data:video/mp4;base64,AQID');
  f.chat.history = [];
  await f.api.prune();
  assert.equal(f.records.size, 1);
  assert.ok(f.records.has(imported.history[0].video.mediaId));
});
test('片段重新解析向 Google 传入起止位置，保留整段缓存', async () => {
  const f = fixture(); const message = f.message();
  await f.api.analyzeMessage(f.chat, message);
  const original = message.video.analysis;
  const range = f.api.segment('00:10–00:30', 40);
  await f.api.analyzeMessage(f.chat, message, { force: true, segment: range });
  assert.equal(message.video.analysis, original);
  assert.equal(message.video.followups.length, 1);
  assert.equal(f.requests[1].body.contents[0].parts[0].videoMetadata.startOffset, '10s');
  assert.equal(f.requests[1].body.contents[0].parts[0].videoMetadata.endOffset, '30s');
  assert.match(message.content, /补充查看 0:10–0:30/);
  assert.throws(() => f.api.segment('00:30-00:10', 40), /起止时间/);
  assert.throws(() => f.api.segment('00:10-00:70', 80), /秒数/);
});
test('仅删除视频引用时安排媒体清理，普通聊天和解析保存不扫描全部历史', () => {
  const f = fixture(); f.initialize(); const message = f.message();
  let scheduled = 0; const transaction = { on(name) { assert.equal(name, 'complete'); scheduled++; } };
  f.hooks.updating({ history: [{ ...message, content: '新解析结果' }] }, 'a', f.chat, transaction);
  f.hooks.updating({ 'history.0.video.analysis.text': '新结果' }, 'a', f.chat, transaction);
  f.hooks.deleting('b', { history: [{ role: 'user', content: '普通消息' }] }, transaction);
  assert.equal(scheduled, 0);
  f.hooks.updating({ history: [] }, 'a', f.chat, transaction);
  assert.equal(scheduled, 1);
  f.hooks.deleting('a', f.chat, transaction);
  assert.equal(scheduled, 2);
});
