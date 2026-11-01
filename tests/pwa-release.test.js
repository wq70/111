const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');

function fixture(broken = false) {
  const scope = 'https://app.example/111/';
  const files = { 'index.html': '<html>app</html>', 'modules/a.js': '\ufeffwindow.a=1;', 'generated/head.js': 'head', 'manifest.json': '{}' };
  const release = { version: 'test-release', assets: Object.entries(files).map(([file, body]) => ({ path: file, url: `${file}?v=test-release`, sha256: sha(body) })) };
  const stores = new Map([['ephone-cache-old', new Map([['old', new Response('old')]])], ['other-application', new Map()]]);
  const handlers = {}, requests = [];
  let skips = 0;
  const key = value => typeof value === 'string' ? value : value.url;
  const caches = {
    keys: async () => [...stores.keys()], delete: async name => stores.delete(name),
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return { match: async request => store.get(key(request))?.clone(), put: async (request, response) => store.set(key(request), response.clone()),
        keys: async () => [...store.keys()], delete: async request => store.delete(key(request)) };
    },
    async match(request) { for (const store of stores.values()) if (store.has(key(request))) return store.get(key(request)).clone(); }
  };
  const self = { __EPHONE_RELEASE: release, registration: { scope }, clients: { matchAll: async () => [] }, skipWaiting: async () => { skips++; },
    addEventListener: (name, fn) => { (handlers[name] ||= []).push(fn); } };
  const c = { self, caches, URL, Response, TextEncoder, TextDecoder, Uint8Array, AbortController, setTimeout, clearTimeout,
    crypto: crypto.webcrypto, console: { log() {}, warn() {} }, importScripts() {},
    async fetch(url) {
      requests.push(key(url));
      const pathname = new URL(key(url)).pathname.replace('/111/', '');
      return new Response(broken && pathname === 'modules/a.js' ? 'wrong-release' : files[pathname] || 'media', { status: 200 });
    } };
  vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), c);
  async function lifecycle(name) { let pending; handlers[name][0]({ waitUntil(value) { pending = value; } }); return pending; }
  async function request(url, destination = 'script', method = 'GET', cache = 'default', header = false) {
    let response; const pending = [];
    handlers.fetch[0]({ request: { url, destination, method, cache, mode: destination === 'document' ? 'navigate' : 'cors', headers: { has: () => header, get: () => null } },
      respondWith(value) { response = value; }, waitUntil(value) { pending.push(value); } });
    const result = await response; await Promise.all(pending); return result;
  }
  return { stores, requests, self, release, lifecycle, request, handlers, skips: () => skips };
}

test('完整下载且校验后安装；不强制接管活动页面，网页和 PWA 共用一致资源', async () => {
  const f = fixture(); await f.lifecycle('install');
  assert.equal(f.requests.length, f.release.assets.length); assert.equal(f.skips(), 0);
  assert.equal(await (await f.request('https://app.example/111/modules/a.js?v=test-release')).text(), 'window.a=1;');
  assert.equal(await (await f.request('https://app.example/111/', 'document')).text(), '<html>app</html>');
  assert.equal(f.requests.length, 4);
  await f.lifecycle('activate');
  assert.ok(f.stores.has('other-application')); assert.ok(f.stores.has('ephone-cache-old'));
});

test('下载到错误版本则安装失败并保留旧缓存；不会把新代码交给旧页面', async () => {
  const f = fixture(true); await assert.rejects(f.lifecycle('install'), /发布文件尚未一致/);
  assert.ok(f.stores.has('ephone-cache-old')); assert.equal(f.stores.has('ephone-cache-test-release'), false);
  const good = fixture(); await good.lifecycle('install');
  assert.equal((await good.request('https://app.example/111/modules/a.js?v=old')).type, 'error');
  assert.equal(await good.request('https://app.example/111/api', '', 'POST'), undefined);
  assert.equal(await good.request('https://api.example/voice', 'font', 'GET', 'default', true), undefined);
});

test('媒体缓存与发布资源分离；字体重新加载不使用旧缓存，离线外部依赖可复用', async () => {
  const f = fixture(); const url = 'https://fonts.example/font.woff2';
  await f.request(url, 'font'); await f.request(url, 'font'); assert.equal(f.requests.length, 1);
  await f.request(url, 'font', 'GET', 'reload'); assert.equal(f.requests.length, 2);
  await f.request('https://cdn.example/dexie.js', 'script'); await f.request('https://cdn.example/dexie.js', 'script');
  assert.equal(f.requests.length, 3); assert.ok(f.stores.has('ephone-dependency-cache'));
});

test('多窗口更新不能强行切换，单窗口请求才允许激活', async () => {
  const f = fixture(); let answer, pending;
  f.self.clients.matchAll = async () => [{}, {}];
  // Exercise the handler registered by the real worker, independent of CRLF/LF and source formatting.
  const handler = f.handlers.message[0];
  const event = { data: { type: 'ACTIVATE_UPDATE' }, ports: [{ postMessage(value) { answer = value; } }], waitUntil(value) { pending = value; } };
  handler(event); await pending; assert.equal(answer.ok, false); assert.equal(f.skips(), 0);
  f.self.clients.matchAll = async () => [{}]; handler(event); await pending; assert.equal(answer.ok, true); assert.equal(f.skips(), 1);
});

test('构建的每个发布文件与校验值一致，入口和全部片段都带版本', () => {
  const c = { self: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'generated/pwa-assets.js'), 'utf8'), c);
  const release = c.self.__EPHONE_RELEASE;
  for (const asset of release.assets) {
    let bytes = fs.readFileSync(path.join(root, asset.path));
    if (/\.(?:js|css|html|json)$/.test(asset.path)) bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    assert.equal(sha(bytes), asset.sha256, asset.path);
    assert.ok(asset.url.endsWith(`?v=${release.version}`), asset.path);
  }
  assert.ok(release.assets.some(asset => asset.path === 'modules/rendering-rule-worker.js'));
  assert.ok(release.assets.some(asset => asset.path === 'js/time-system.js'));
});
