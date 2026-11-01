// 一次安装对应一套完整、校验过的发布资源。活动页面不自动切换版本。
importScripts('./generated/pwa-assets.js');
const RELEASE = self.__EPHONE_RELEASE;
const CACHE_NAME = `ephone-cache-${RELEASE.version}`;
const MEDIA_CACHE_NAME = 'ephone-media-cache';
const byPath = new Map(RELEASE.assets.map(asset => [new URL(asset.path, self.registration.scope).pathname, asset]));
const assetUrl = asset => new URL(asset.url, self.registration.scope).href;

async function fetchAsset(asset) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(assetUrl(asset), { cache: 'no-store', signal: controller.signal });
    if (!response.ok || response.type === 'opaque') throw new Error(`资源加载失败: ${asset.path}`);
    let bytes = await response.clone().arrayBuffer();
    // 与构建端一致保留 UTF-8 BOM，仅统一换行。
    if (/\.(?:js|css|html|json)$/.test(asset.path)) bytes = new TextEncoder().encode(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes).replace(/\r\n/g, '\n'));
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== asset.sha256) throw new Error(`发布文件尚未一致: ${asset.path}`);
    return response;
  } finally { clearTimeout(timer); }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const existed = (await caches.keys()).includes(CACHE_NAME);
    const cache = await caches.open(CACHE_NAME);
    let next = 0, failure;
    try {
      // 限流，避免移动端同时下载数百个文件；安装不阻塞当前页面使用。
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (!failure && next < RELEASE.assets.length) {
          const asset = RELEASE.assets[next++];
          try {
            if (!await cache.match(assetUrl(asset))) await cache.put(assetUrl(asset), await fetchAsset(asset));
          } catch (error) { failure = error; }
        }
      }));
      if (failure) throw failure;
    } catch (error) {
      if (!existed) await caches.delete(CACHE_NAME);
      // 让更新入口能收到安装失败原因，旧页面仍由旧 Worker 服务。
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      windows.forEach(client => client.postMessage?.({ type: 'EPHONE_UPDATE_FAILED', message: error.message }));
      throw error;
    }
    // 不 skipWaiting：旧网页和桌面窗口继续使用完整旧版本。
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const versions = (await caches.keys()).filter(name => name.startsWith('ephone-cache-') && name !== CACHE_NAME);
    // 留下一版完整资源用于恢复；不删除其他应用缓存、媒体或 IndexedDB。
    await Promise.all(versions.slice(0, -1).map(name => caches.delete(name)));
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.headers.has('Authorization') || event.request.headers.has('xi-api-key') || event.request.headers.get('X-EPhone-Feedback') === '1') return;
  const url = new URL(event.request.url);
  const own = url.origin === new URL(self.registration.scope).origin;
  const asset = own ? byPath.get(url.pathname) : null;
  if (asset) {
    event.respondWith((async () => {
      const requestedVersion = url.searchParams.get('v');
      if (requestedVersion && requestedVersion !== RELEASE.version) {
        // 从旧页面来的资源只能使用精确旧缓存，不能悄悄返回当前代码。
        return (await caches.match(event.request)) || Response.error();
      }
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(assetUrl(asset))) || Response.error();
    })());
    return;
  }
  if (own && event.request.mode === 'navigate' && url.pathname.startsWith(new URL(self.registration.scope).pathname) && !/\.[a-z0-9]+$/i.test(url.pathname)) {
    event.respondWith(caches.open(CACHE_NAME).then(cache => cache.match(assetUrl(byPath.get(new URL('index.html', self.registration.scope).pathname)))));
    return;
  }
  // API 请求继续由页面直连；这里只缓存浏览器实际加载的图片和字体。
  if (event.request.destination === 'image' || event.request.destination === 'font' || (!own && ['script', 'style'].includes(event.request.destination))) {
    event.respondWith((async () => {
      const dependency = !own && ['script', 'style'].includes(event.request.destination);
      const cache = await caches.open(dependency ? 'ephone-dependency-cache' : MEDIA_CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached && event.request.cache !== 'reload') return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok || response.type === 'opaque') {
          event.waitUntil((async () => {
            try {
              await cache.put(event.request, response.clone());
              const keys = await cache.keys();
              await Promise.all(keys.slice(0, Math.max(0, keys.length - (dependency ? 32 : 128))).map(key => cache.delete(key)));
            } catch (_) { /* 媒体缓存不足不阻塞页面。 */ }
          })());
        }
        return response;
      } catch (error) { return cached || (await caches.match(event.request)) || Response.error(); }
    })());
  }
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'ACTIVATE_UPDATE' || !event.ports?.[0]) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.length > 1) {
      event.ports[0].postMessage({ ok: false, message: '请先关闭其他网页或桌面窗口，再刷新更新。' });
      return;
    }
    event.ports[0].postMessage({ ok: true });
    await self.skipWaiting();
  })());
});

// 4. 推送通知事件：接收服务器推送的通知
self.addEventListener('push', event => {
  console.log('[SW] 收到推送消息:', event);
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }
  
  const title = data.title || 'EPhone';
  const options = {
    body: data.body || '您有新消息',
    icon: data.icon || 'https://i.postimg.cc/nMbyyt1t/D7CD735A73F5FD1D7B8407E0EB8BBAC0.png',
    badge: data.badge || 'https://i.postimg.cc/nMbyyt1t/D7CD735A73F5FD1D7B8407E0EB8BBAC0.png',
    tag: data.tag || 'default',
    data: data.data || {},
    requireInteraction: true,
    vibrate: [200, 100, 200],
    timestamp: Date.now()
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 5. 接收来自页面的消息（用于手动触发通知）
self.addEventListener('message', event => {
  console.log('[SW] 收到页面消息:', event.data);
  
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  }
});

// 6. 通知点击事件：用户点击通知时触发
self.addEventListener('notificationclick', event => {
  console.log('[SW] 通知被点击:', event);
  
  event.notification.close();
  
  const chatId = event.notification.data?.chatId;
  const urlToOpen = chatId ? `/?openChat=${chatId}` : '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // 如果已有窗口打开，聚焦它
        for (let client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus().then(client => {
              if (chatId) {
                client.postMessage({ type: 'OPEN_CHAT', chatId });
              }
              return client;
            });
          }
        }
        // 否则打开新窗口
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
