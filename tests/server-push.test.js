const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const turn = () => new Promise(resolve => setImmediate(resolve));

function runtime(overrides = {}) {
  const requests = [], local = [], logs = [], alerts = [], timers = new Map(), elements = new Map();
  let timerId = 0;
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', checked: false, hidden: true, disabled: false, textContent: '', style: {}, listeners: {},
      addEventListener(event, fn) { this.listeners[event] = fn; }
    });
    return elements.get(id);
  };
  const config = {
    enabled: true, appName: 'EPhone', notifyInChatPage: false, disableInternalNotification: true,
    pushServer: { enabled: true, serverUrl: 'https://push.example/api', apiKey: 'test-secret', ...overrides }
  };
  const chat = { name: '角色', settings: { aiAvatar: 'https://img.example/avatar.png' }, history: [] };
  const c = {
    window: {}, state: { chats: { c: chat }, globalSettings: { systemNotification: config } },
    URL, Headers, TextEncoder, AbortController,
    console: { log: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    document: { hidden: false, visibilityState: 'visible', getElementById: get },
    Notification: { permission: 'granted' },
    navigator: { userAgent: 'Android', serviceWorker: { ready: Promise.resolve({ showNotification: async (...args) => local.push(args) }) } },
    setTimeout(fn, ms) { const id = ++timerId; if (ms < 3000) fn(); else timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    alert: text => alerts.push(text),
    fetch: async (url, request) => { requests.push({ url, request }); return { ok: true, status: 200, text: async () => '{"accepted":true}' }; },
    appendMessage() {}
  };
  vm.createContext(c);
  const source = read('modules/notification-battery.js');
  vm.runInContext(source.slice(0, source.indexOf('  // ========== 截图水印功能开始 ==========')), c);
  return { c, config, chat, requests, local, logs, alerts, timers, get };
}

test('旧配置默认发送 POST JSON，正确转义消息且密钥可选', async () => {
  const r = runtime();
  const message = '中文 "引号"\n& / {{apiKey}}';
  await r.c.handleSystemNotification('c', message);
  await turn();
  assert.equal(r.requests.length, 1);
  assert.equal(r.local.length, 1);
  const { url, request } = r.requests[0];
  assert.equal(url, 'https://push.example/api');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.get('Authorization'), 'Bearer test-secret');
  assert.equal(request.keepalive, true);
  assert.equal(request.credentials, 'omit');
  const body = JSON.parse(request.body);
  assert.equal(body.title, 'EPhone - 角色');
  assert.equal(body.body, message);
  assert.equal(body.data.chatId, 'c');
  assert.equal(r.timers.size, 0);
  assert.ok(!JSON.stringify(r.logs).includes('test-secret'));
  r.config.pushServer.apiKey = '';
  await r.c.sendPushServerNotification('c', '无密钥');
  assert.equal(r.requests[1].request.headers.has('Authorization'), false);
});

test('主开关、服务器开关与本机权限互不误触发', async () => {
  const r = runtime({ enabled: false });
  await r.c.handleSystemNotification('c', '本机通知'); await turn();
  assert.equal(r.requests.length, 0); assert.equal(r.local.length, 1);
  r.config.pushServer.enabled = true; r.config.enabled = false;
  await r.c.handleSystemNotification('c', '关闭全部'); await turn();
  assert.equal(r.requests.length, 0); assert.equal(r.local.length, 1);
  r.config.enabled = true; r.c.Notification.permission = 'denied';
  await r.c.handleSystemNotification('c', '仍发服务器');
  assert.equal(r.requests.length, 1); assert.equal(r.local.length, 1);
  delete r.c.Notification;
  await r.c.handleSystemNotification('c', '无通知 API');
  assert.equal(r.requests.length, 2);
});

test('聊天页前台沿用开关，后台只补服务器；开启聊天通知不重复推送', async () => {
  const r = runtime();
  r.c.triggerSystemNotificationInChatPage('c', '前台'); await turn();
  assert.equal(r.requests.length, 0); assert.equal(r.local.length, 0);
  r.c.document.hidden = true; r.c.document.visibilityState = 'hidden';
  r.c.triggerSystemNotificationInChatPage('c', '后台'); await turn();
  assert.equal(r.requests.length, 1); assert.equal(r.local.length, 0);
  r.config.notifyInChatPage = true;
  r.c.triggerSystemNotificationInChatPage('c', '后台允许本机'); await turn();
  assert.equal(r.requests.length, 2); assert.equal(r.local.length, 1);
});

test('GET/HEAD 地址参数编码、不同鉴权头、JSON/表单/纯文本模板', async () => {
  const r = runtime({ requestMethod: 'GET', serverUrl: 'https://push.example/{{apiKey}}?text={{body}}', headersTemplate: '{"X-Token":"{{apiKey}}"}', bodyTemplate: 'invalid JSON' });
  const message = '你 & "好"\n/';
  await r.c.sendPushServerNotification('c', message);
  assert.equal(new URL(r.requests[0].url).searchParams.get('text'), message);
  assert.equal(r.requests[0].request.headers.get('X-Token'), 'test-secret');
  assert.equal(r.requests[0].request.body, undefined);
  r.config.pushServer.requestMethod = 'HEAD';
  await r.c.sendPushServerNotification('c', message);
  assert.equal(r.requests[1].request.body, undefined);
  Object.assign(r.config.pushServer, { requestMethod: 'PUT', headersTemplate: '{"Content-Type":"application/json","Authorization":"Basic static-token"}', bodyTemplate: '{"content":"{{body}}","nested":["{{title}}"],"count":1}' });
  await r.c.sendPushServerNotification('c', message);
  assert.equal(JSON.parse(r.requests[2].request.body).content, message);
  assert.equal(JSON.parse(r.requests[2].request.body).count, 1);
  assert.equal(r.requests[2].request.headers.get('Authorization'), 'Basic static-token');
  Object.assign(r.config.pushServer, { headersTemplate: '{"Content-Type":"application/x-www-form-urlencoded"}', bodyTemplate: 'title={{title}}&content={{body}}&token={{apiKey}}' });
  await r.c.sendPushServerNotification('c', message);
  assert.equal(new URLSearchParams(r.requests[3].request.body).get('content'), message);
  Object.assign(r.config.pushServer, { headersTemplate: '{"Content-Type":"text/plain"}', bodyTemplate: '{{body}}' });
  await r.c.sendPushServerNotification('c', message);
  assert.equal(r.requests[4].request.body, message);
});

test('无效地址、请求头、请求体及占位符在发送前明确反馈', async () => {
  for (const [override, expected] of [
    [{ serverUrl: '' }, /请填写/], [{ serverUrl: 'bad url' }, /地址格式/], [{ serverUrl: 'javascript:alert(1)' }, /HTTP/],
    [{ headersTemplate: '[]' }, /JSON 对象/], [{ headersTemplate: '{' }, /JSON/], [{ headersTemplate: '{"X-Count":1}' }, /字符串/],
    [{ bodyTemplate: '{' }, /JSON 请求体/], [{ bodyTemplate: '{"body":"{{missing}}"}' }, /未知占位符/]
  ]) {
    const r = runtime(override);
    const result = await r.c.sendPushServerNotification('c', '回复');
    assert.equal(result.ok, false); assert.match(result.error, expected); assert.equal(r.requests.length, 0);
    assert.equal(r.timers.size, 0);
  }
});

test('服务器卡住或失败不阻塞本机通知，超时取消且不自动重复发送', async () => {
  const r = runtime(); let signal;
  r.c.fetch = (url, request) => {
    r.requests.push({ url, request }); signal = request.signal;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('带密钥地址 test-secret'))));
  };
  await r.c.handleSystemNotification('c', '回复'); await turn();
  assert.equal(r.local.length, 1); assert.equal(r.requests.length, 1);
  const abort = [...r.timers.values()][0]; abort(); await turn();
  assert.equal(signal.aborted, true); assert.equal(r.timers.size, 0);
  assert.ok(!JSON.stringify(r.logs).includes('test-secret'));
  r.c.fetch = async () => { throw new Error('https://push.example/test-secret'); };
  const result = await r.c.sendPushServerNotification('c', '回复');
  assert.match(result.error, /网络请求失败/); assert.ok(!result.error.includes('test-secret'));
});

test('服务器测试展示 HTTP 和返回内容，文字不会作为 HTML 执行且密钥隐藏', async () => {
  const r = runtime();
  r.c.fetch = async () => ({ ok: false, status: 401, text: async () => '<img onerror=alert(1)> test-secret' });
  await r.c.testPushServerNotification();
  const result = r.get('push-server-test-result');
  assert.equal(result.hidden, false); assert.match(result.textContent, /HTTP 401/);
  assert.match(result.textContent, /<img/); assert.ok(!result.textContent.includes('test-secret'));
  assert.equal(r.get('test-push-server-btn').disabled, false);
  r.config.pushServer.serverUrl = '';
  await r.c.testPushServerNotification(); assert.match(result.textContent, /请填写/);
  r.config.pushServer.serverUrl = 'https://push.example/api';
  r.c.fetch = (url, request) => new Promise((resolve, reject) => request.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const testing = r.c.testPushServerNotification();
  [...r.timers.values()][0](); await testing;
  assert.match(result.textContent, /超时/); assert.equal(r.get('test-push-server-btn').disabled, false);
});

test('连续调试避免重复请求，上方旧测试按钮仍发送本机通知', async () => {
  const r = runtime(); let finish;
  r.c.fetch = async (url, request) => {
    r.requests.push({ url, request }); await new Promise(resolve => { finish = resolve; });
    return { ok: true, status: 200, text: async () => 'ok' };
  };
  const testing = r.c.testPushServerNotification();
  await r.c.testPushServerNotification();
  assert.equal(r.requests.length, 1); assert.equal(r.get('test-push-server-btn').disabled, true);
  finish(); await testing;
  await r.c.sendTestNotification();
  assert.equal(r.local.length, 1); assert.equal(r.requests.length, 2);
  finish(); await turn();
});

test('设置加载、编辑、保存数据形状保持兼容，GET 禁用请求体但保留内容', () => {
  const r = runtime(); r.c.bindSystemNotificationEvents(); r.c.loadSystemNotificationSettings();
  assert.equal(r.get('push-server-request-method').value, 'POST');
  assert.match(r.get('push-server-body-template').value, /{{body}}/);
  const bodyBefore = r.get('push-server-body-template').value;
  r.get('push-server-request-method').value = 'GET'; r.get('push-server-request-method').listeners.change();
  assert.equal(r.config.pushServer.requestMethod, 'GET'); assert.equal(r.get('push-server-body-template').disabled, true);
  assert.equal(r.get('push-server-body-template').value, bodyBefore);
  r.get('push-server-headers-template').value = '{}'; r.get('push-server-headers-template').listeners.input();
  r.get('push-server-body-template').value = ''; r.get('push-server-body-template').listeners.input();
  r.config.pushServer = JSON.parse(JSON.stringify(r.config.pushServer)); r.c.loadSystemNotificationSettings();
  assert.equal(r.get('push-server-headers-template').value, '{}'); assert.equal(r.get('push-server-body-template').value, '');
  assert.equal(r.config.notifyInChatPage, false); assert.equal(r.config.disableInternalNotification, true);
});

test('使用真实回复通知分支，每轮多气泡只推送一次，下一轮继续推送', async () => {
  const r = runtime();
  const source = read('src/js-bundles/trigger-response/finalization.jsfrag');
  const start = source.indexOf('        if (aiMessage) {\n          if (chat.settings.enableBilingualMode');
  assert.ok(start >= 0);
  const branch = source.slice(start, source.indexOf('\n      if (callHasBeenHandled', start));
  vm.runInContext(`async function deliver(messages, isViewingThisChat) {
    const chatId = 'c', chat = state.chats.c; let notificationShown = false;
    for (const aiMessage of messages) { ${branch} }`, r.c);
  const messages = [{ type: 'text', content: '第一条' }, { type: 'text', content: '第二条' }];
  await r.c.deliver(messages, false); await turn();
  assert.equal(r.requests.length, 1); assert.equal(r.local.length, 1); assert.equal(r.chat.unreadCount, 2);
  await r.c.deliver(messages, false); await turn();
  assert.equal(r.requests.length, 2); assert.equal(r.chat.unreadCount, 4);
  r.c.document.hidden = true;
  await r.c.deliver(messages, true); await turn();
  assert.equal(r.requests.length, 3); assert.equal(r.local.length, 2);
  assert.equal(r.chat.unreadCount, 4); assert.equal(r.chat.history.length, 6);
});
