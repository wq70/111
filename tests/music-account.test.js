const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function fixture(handler = () => ({ code: 801 })) {
  const nodes = new Map(), storage = new Map(), timers = new Map(), requests = [], saved = [], alerts = [];
  let now = 0, timerId = 0;
  function element() {
    const classes = new Set();
    return { hidden: false, disabled: false, textContent: '', children: [], style: {}, dataset: {}, listeners: {},
      classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
      set innerHTML(value) { this.html = value; this.children = []; }, get innerHTML() { return this.html || ''; },
      append(...children) { this.children.push(...children); }, appendChild(child) { this.children.push(child); },
      addEventListener(event, fn) { this.listeners[event] = fn; }, querySelector() { return null; }, querySelectorAll() { return []; }
    };
  }
  const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const window = { state: { chats: {} }, musicState: { playlist: [], playlists: [], currentIndex: -1, totalElapsedTime: 0 } };
  const context = vm.createContext({ window, URL, URLSearchParams, AbortController, console,
    Date: class extends Date { static now() { return now; } }, navigator: {},
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, due: now + ms }); return id; },
    clearTimeout: id => timers.delete(id), setInterval: () => 10000, clearInterval() {}, addLongPressListener() {},
    document: { hidden: false, getElementById: get, createElement: element, querySelector: () => get('icon'), querySelectorAll: () => [] },
    showCustomConfirm: async () => true, showCustomAlert: async (...args) => alerts.push(args),
    db: { musicLibrary: { put: async row => saved.push(JSON.parse(JSON.stringify(row))) } },
    fetch: async (url, options) => {
      const pathname = new URL(url).pathname, params = new URLSearchParams(options.body);
      requests.push({ url, pathname, options, params });
      let value;
      if (pathname === '/login/qr/key') value = { code: 200, data: { unikey: `qr-${requests.length}` } };
      else if (pathname === '/login/qr/create') value = { code: 200, data: { qrimg: 'data:image/png;base64,AA==', qrurl: `https://music.163.com/login?codekey=${params.get('key')}&chainId=synthetic-web-chain` } };
      else value = await handler(pathname, params, options);
      if (value?.httpStatus) return { ok: false, status: value.httpStatus };
      return { ok: true, json: async () => value };
    }
  });
  vm.runInContext(read('modules/music-online-services.js'), context);
  vm.runInContext(read('modules/music-player.js'), context);
  return { window, context, get, requests, timers, saved, alerts, storage, account: window.MusicOnlineServices.account,
    async tick(ms) {
      const target = now + ms;
      for (;;) {
        const next = [...timers].filter(([, t]) => t.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        now = next[1].due; timers.delete(next[0]); await next[1].fn();
      }
      now = target;
    }, setNow(value) { now = value; }
  };
}
const profile = { userId: 42, nickname: '测试账号' };
const loggedIn = f => f.account.acceptQrLogin({ code: 803, cookie: 'MUSIC_U=synthetic' });

test('扫码成功后账号请求失败：保留会话、停止扫码轮询，可单独重试账号并导入歌曲', async () => {
  let failProfile = true;
  const f = fixture(pathname => {
    if (pathname === '/login/qr/check') return { code: 803, cookie: 'MUSIC_U=synthetic' };
    if (pathname === '/login/status') { if (failProfile) throw new TypeError('fetch failed'); return { code: 200, data: { profile } }; }
    if (pathname === '/user/playlist') return { code: 200, playlist: [{ id: 5, name: '歌单', trackCount: 1 }] };
    return { code: 200, songs: [{ id: 1, name: '测试歌曲', ar: [{ name: '歌手' }] }] };
  });
  await f.window.startNeteaseQrLogin();
  assert.ok(f.account.loadSession());
  assert.match(f.get('netease-account-status').textContent, /扫码已确认.*读取账号/);
  assert.equal(f.get('netease-account-retry-btn').hidden, false);
  assert.equal(f.timers.size, 0);
  failProfile = false;
  await f.window.refreshNeteaseAccountView();
  assert.equal(f.get('netease-profile-name').textContent, '测试账号');
  assert.equal(f.get('netease-account-status').textContent, '已登录');
  assert.equal(f.get('netease-playlists-list').children.length, 1);
  const button = f.get('netease-playlists-list').children[0].children[1];
  await button.listeners.click();
  assert.equal(f.saved.length, 1);
  assert.equal(f.saved[0].playlist[0].name, '测试歌曲');
  await button.listeners.click();
  assert.equal(f.saved[1].playlist.length, 1, '重复导入不应重复添加歌曲');
  assert.match(button.textContent, /已是最新/);
});

test('连续网络失败三次后停止，并提供重新生成二维码入口', async () => {
  const f = fixture(() => { throw new TypeError('offline'); });
  await f.window.startNeteaseQrLogin();
  assert.match(f.get('netease-qr-message').textContent, /1\/3/);
  await f.tick(6000);
  assert.equal(f.requests.filter(r => r.pathname === '/login/qr/check').length, 3);
  assert.equal(f.timers.size, 0);
  assert.equal(f.get('netease-login-btn').disabled, false);
  assert.equal(f.get('netease-qr-image').hidden, true);
  assert.match(f.get('netease-account-status').textContent, /查询扫码状态.*无法连接/);
});

test('等待扫码整体超时和服务端二维码过期均停止等待', async () => {
  const f = fixture(); await f.window.startNeteaseQrLogin();
  await f.tick(180000);
  assert.match(f.get('netease-account-status').textContent, /超时/);
  assert.equal(f.timers.size, 0);
  const expired = fixture(() => ({ code: 800 }));
  await expired.window.startNeteaseQrLogin();
  assert.match(expired.get('netease-account-status').textContent, /二维码已过期/);
  assert.equal(expired.timers.size, 0);
});

test('查询请求未结束时不再启动下一个请求，关闭后迟到的扫码成功不会保存会话', async () => {
  const pending = deferred();
  const f = fixture(() => pending.promise);
  const start = f.window.startNeteaseQrLogin();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.requests.filter(r => r.pathname === '/login/qr/check').length, 1);
  f.window.closeMusicAccountCenter();
  pending.resolve({ code: 803, cookie: 'MUSIC_U=late' });
  await start;
  assert.equal(f.account.loadSession(), null);
  assert.equal(f.timers.size, 0);
});

test('退出后迟到的账号响应不会恢复登录或改变界面', async () => {
  const pending = deferred(); const f = fixture(() => pending.promise); loggedIn(f);
  const refresh = f.window.refreshNeteaseAccountView();
  await f.window.logoutNeteaseMusic();
  pending.resolve({ code: 200, data: { profile } }); await refresh;
  assert.equal(f.account.loadSession(), null);
  assert.equal(f.get('netease-profile').hidden, true);
  assert.match(f.get('netease-account-status').textContent, /未登录/);
});

test('服务端错误、成功但没有登录凭证、成功但账号资料缺失都不伪装成登录成功', async () => {
  for (const response of [{ httpStatus: 403 }, { code: 503 }, { code: 803 }, { code: 200 }]) {
    const f = fixture(() => response); await f.window.startNeteaseQrLogin();
    await f.tick(10000);
    assert.equal(f.account.loadSession(), null);
    assert.equal(f.get('netease-login-btn').disabled, false);
    assert.notEqual(f.get('netease-account-status').textContent, '已登录');
    assert.equal(f.timers.size, 0);
  }
  const f = fixture(() => ({ code: 200, data: {} })); loggedIn(f);
  await f.window.refreshNeteaseAccountView();
  assert.ok(f.account.loadSession());
  assert.match(f.get('netease-account-status').textContent, /尚未取得账号信息/);
  assert.equal(f.get('netease-account-retry-btn').hidden, false);
});

test('歌单请求失败与空歌单明确区分，账号成功后重试无需重新扫码', async () => {
  let playlists = { code: 502 };
  const f = fixture(pathname => pathname === '/login/status' ? { code: 200, data: { profile } } : playlists);
  loggedIn(f); await f.window.refreshNeteaseAccountView();
  assert.equal(f.get('netease-account-status').textContent, '已登录');
  assert.equal(f.get('netease-playlists-retry-btn').hidden, false);
  assert.match(f.get('netease-playlists-loading').textContent, /读取歌单.*502/);
  playlists = { code: 200, playlist: [] };
  await f.window.refreshNeteaseAccountView();
  assert.equal(f.get('netease-playlists-loading').textContent, '账号中没有可导入的歌单');
  assert.equal(f.get('netease-playlists-retry-btn').hidden, true);
});

test('只有明确登录过期才清除会话；请求中的凭证放在 POST 正文而非 URL', async () => {
  const f = fixture(() => ({ code: 301 })); loggedIn(f);
  await f.window.refreshNeteaseAccountView();
  assert.equal(f.account.loadSession(), null);
  assert.match(f.get('netease-account-status').textContent, /登录已失效/);
  assert.equal(f.get('netease-account-retry-btn').hidden, true);
  const request = f.requests[0];
  assert.equal(request.options.method, 'POST');
  assert.equal(request.params.get('cookie'), 'MUSIC_U=synthetic');
  assert.equal(new URL(request.url).searchParams.has('cookie'), false);
  assert.equal(request.options.credentials, 'omit');
});

test('超过一千首的歌单分页读取，服务端返回错误不能当作空歌曲列表', async () => {
  const f = fixture((pathname, params) => {
    assert.equal(pathname, '/playlist/track/all');
    return { code: 200, songs: Array.from({ length: params.get('offset') === '0' ? 1000 : 2 }, (_, i) => ({ id: Number(params.get('offset')) + i, name: '歌曲' })) };
  }); loggedIn(f);
  assert.equal((await f.account.getUserPlaylistTracks(5)).length, 1002);
  const failed = fixture(() => ({ code: 200 })); loggedIn(failed);
  await assert.rejects(failed.account.getUserPlaylistTracks(5), /未返回歌曲列表/);
});

test('新版网页二维码必须使用 web 参数与 chainId，noCookie 同时传入 URL', async () => {
  const f = fixture(); const qr = await f.account.createQrLogin();
  assert.ok(new URL(qr.qrurl).searchParams.get('chainId'));
  assert.equal(f.requests[1].params.get('platform'), 'web');
  assert.equal(new URL(f.requests[1].url).searchParams.get('noCookie'), 'true');
});

test('保留旧节点已登录会话，旧凭证不能发送到新节点', async () => {
  const f = fixture(() => ({ code: 200, data: { profile } }));
  f.storage.set('music_netease_public_session', JSON.stringify({ node: 'https://ncm-api.vercel.app', cookie: 'MUSIC_U=legacy', profile }));
  await f.account.getLoginStatus();
  assert.equal(new URL(f.requests[0].url).origin, 'https://ncm-api.vercel.app');
  assert.equal(f.account.loadSession().node, 'https://ncm-api.vercel.app');
  await f.account.createQrLogin();
  assert.equal(new URL(f.requests[1].url).origin, f.account.node);
  assert.equal(f.requests[1].params.has('cookie'), false);
});

test('HTTP 成功但明确返回空登录账号时清除失效会话', async () => {
  const f = fixture(() => ({ data: { code: 200, account: null, profile: null } })); loggedIn(f);
  await f.window.refreshNeteaseAccountView();
  assert.equal(f.account.loadSession(), null);
  assert.match(f.get('netease-account-status').textContent, /登录已失效/);
});
