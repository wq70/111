// Service Worker 文件 (sw.js)
// 【强制网络优先策略】- 始终从服务器获取最新版本，不使用缓存

// 缓存版本号（强制更新策略）
const CACHE_VERSION = 'v0.0.5';
const CACHE_NAME = `ephone-cache-${CACHE_VERSION}`;

// 需要被缓存的文件列表（仅用于离线访问）
const URLS_TO_CACHE = [
  './index.html',
  './style.css',
  './script.js',
  'https://unpkg.com/dexie/dist/dexie.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://phoebeboo.github.io/mewoooo/pp.js',
  'https://cdn.jsdelivr.net/npm/streamsaver@2.0.6/StreamSaver.min.js',
  'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1758510900942_qdqqd_djw0z2.jpeg',
  'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1756312261242_qdqqd_g0eriz.jpeg'
];

// 1. 安装事件：当 Service Worker 首次被注册时触发
self.addEventListener('install', event => {
  console.log('[SW] 正在安装 Service Worker (网络优先策略)...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] 缓存已打开，正在缓存核心文件（用于离线访问）...');
        return cache.addAll(URLS_TO_CACHE);
      })
      .then(() => {
        console.log('[SW] 所有核心文件已缓存成功！');
        return self.skipWaiting();
      })
  );
});

// 2. 激活事件：当 Service Worker 被激活时触发
self.addEventListener('activate', event => {
  console.log('[SW] 正在激活 Service Worker...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] 正在删除旧的缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('[SW] Service Worker 已激活！使用网络优先策略。');
        return self.clients.claim();
    })
  );
});

// 3. 拦截网络请求事件：使用【强制网络优先策略 - 不使用缓存】
self.addEventListener('fetch', event => {
  // 只对 GET 请求进行处理
  if (event.request.method !== 'GET') {
    return;
  }

  // 排除 API 请求，让它们不受 Service Worker 干扰
  const url = event.request.url;
  const isApiRequest = url.includes('generativelanguage.googleapis.com') || 
                       url.includes('/v1/models') || 
                       url.includes('/v1/chat/completions') ||
                       url.includes('gemini.beijixingxing.com') ||
                       url.includes('api.imgbb.com') ||
                       url.includes(':generateContent');
  
  if (isApiRequest) {
    // API 请求直接透传，不做任何处理
    return;
  }

  event.respondWith(
    // 【强制网络优先】始终从网络获取最新版本
    fetch(event.request, {
      cache: 'no-store'
    })
      .then(response => {
        // 网络请求成功，直接返回，不缓存
        console.log('[SW] 从网络获取最新版本:', event.request.url);
        return response;
      })
      .catch(() => {
        // 如果网络请求失败（离线或网络错误），则使用缓存作为后备
        console.log('[SW] 网络请求失败，使用缓存作为后备:', event.request.url);
        return caches.match(event.request);
      })
  );
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
    icon: data.icon || 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1758510900942_qdqqd_djw0z2.jpeg',
    badge: data.badge || 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1758510900942_qdqqd_djw0z2.jpeg',
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
