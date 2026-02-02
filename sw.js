// Service Worker 文件 (sw.js)
// 【智能缓存策略】- 根据资源类型使用不同的缓存策略，优化加载速度

// 缓存版本号（智能缓存策略）
const CACHE_VERSION = 'v0.0.8';
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
  console.log('[SW] 正在安装 Service Worker (智能缓存策略)...');
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
        console.log('[SW] Service Worker 已激活！使用智能缓存策略。');
        return self.clients.claim();
    })
  );
});

// 3. 拦截网络请求事件：使用【智能缓存策略】
self.addEventListener('fetch', event => {
  // 只对 GET 请求进行处理
  if (event.request.method !== 'GET') {
    return;
  }

  const url = event.request.url;

  // 排除 API 请求，让它们不受 Service Worker 干扰
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

  // 识别资源类型
  const isImage = /\.(png|jpg|jpeg|gif|webp|svg|ico)(\?|$)/i.test(url) ||
                  url.includes('postimg.cc') ||
                  url.includes('catbox.moe') ||
                  url.includes('sharkpan.xyz') ||
                  url.includes('meituan.net');
  
  const isFont = /\.(woff|woff2|ttf|otf|eot)(\?|$)/i.test(url);
  
  const isCDNResource = url.includes('unpkg.com') ||
                        url.includes('cdnjs.cloudflare.com') ||
                        url.includes('cdn.jsdelivr.net') ||
                        url.includes('phoebeboo.github.io');

  const isHTMLPage = url.includes('.html') || 
                     (!url.includes('.') && !url.includes('?')) ||
                     url.endsWith('/');

  // 策略 1：图片、字体、CDN 资源 → 缓存优先（加载快，减少流量）
  if (isImage || isFont || isCDNResource) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          console.log('[SW] 从缓存加载:', url);
          return cachedResponse;
        }
        // 缓存未命中，从网络获取并缓存
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            return caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, response.clone());
              console.log('[SW] 已缓存资源:', url);
              return response;
            });
          }
          return response;
        }).catch(() => {
          // 网络失败，尝试返回缓存
          return caches.match(event.request);
        });
      })
    );
  }
  // 策略 2：HTML 页面 → 网络优先（保证内容最新）
  else if (isHTMLPage) {
    event.respondWith(
      fetch(event.request, {
        cache: 'no-cache' // 允许验证缓存，不是完全禁用
      })
      .then(response => {
        // 更新缓存
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, response.clone());
          });
        }
        return response;
      })
      .catch(() => {
        // 网络失败，使用缓存
        console.log('[SW] 网络失败，使用缓存的 HTML:', url);
        return caches.match(event.request);
      })
    );
  }
  // 策略 3：CSS/JS → 缓存优先，但允许后台更新
  else {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request).then(response => {
          // 后台更新缓存
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, response.clone());
            });
          }
          return response;
        }).catch(() => null);

        // 如果有缓存，立即返回缓存，同时后台更新
        if (cachedResponse) {
          console.log('[SW] 从缓存加载（后台更新）:', url);
          return cachedResponse;
        }
        // 没有缓存，等待网络请求
        return fetchPromise;
      })
    );
  }
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
