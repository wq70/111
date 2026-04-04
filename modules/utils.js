// ========== 从 script.js 第 1~185 行 + 第 682~1061 行提取 ==========
// DOMContentLoaded 之前的全局工具函数（不含 translations 部分）

// ============================================================
// 全局工具函数：生成 Pollinations 图片 URL
// ============================================================
function getPollinationsImageUrl(prompt) {
  const key = localStorage.getItem('pollinations-api-key') || '';
  const model = localStorage.getItem('pollinations-model') || 'flux';
  const encoded = encodeURIComponent(prompt);
  let url = `https://gen.pollinations.ai/image/${encoded}?model=${model}&nologo=true`;
  if (key) url += `&key=${encodeURIComponent(key)}`;
  return url;
}

const ACTIVATION_PIN_URL = 'https://gist.githubusercontent.com/cx3300-1/f04ec50b5e8f2d88365d17ff35efffcf/raw/cd28d8825c5c34ea10bda8a4518a1a6a1f5a7d13/pin.txt';

// ========== QQ主屏幕Undefined过滤器（外链功能） ==========
/**
 * 过滤消息内容中的undefined文本
 * 用于主屏幕QQ聊天，当角色输出undefined时自动过滤
 * @param {string} content - 原始消息内容
 * @returns {string} - 过滤后的消息内容
 */
function qqUndefinedFilter(content) {
  if (!content || typeof content !== 'string') {
    return content;
  }

  // 过滤各种形式的undefined
  let filtered = content
    // 过滤单独的undefined（前后可能有空格、换行等）
    .replace(/^\s*undefined\s*$/gi, '')
    // 过滤句子开头的undefined
    .replace(/^\s*undefined\s+/gi, '')
    // 过滤句子结尾的undefined
    .replace(/\s+undefined\s*$/gi, '')
    // 过滤句子中间的undefined（两边有空格）
    .replace(/\s+undefined\s+/gi, ' ')
    // 过滤连续多个undefined
    .replace(/undefined\s*undefined/gi, '')
    // 过滤undefined后面跟标点符号的情况
    .replace(/undefined([,，.。!！?？;；:：])/gi, '$1')
    // 过滤标点符号后面跟undefined的情况
    .replace(/([,，.。!！?？;；:：])\s*undefined/gi, '$1');

  // 如果过滤后只剩空白字符，返回空字符串
  filtered = filtered.trim();

  // 如果整个内容都是undefined，返回空字符串
  if (filtered === '' || filtered.toLowerCase() === 'undefined') {
    return '';
  }

  return filtered;
}
// ========== QQ主屏幕Undefined过滤器结束 ==========

// ========== 货币映射配置 ==========
const CURRENCY_MAP = {
  'China': { symbol: '¥', name: '人民币', code: 'CNY', rate: 1.0 },
  'USA': { symbol: '$', name: '美元', code: 'USD', rate: 7.25 },
  'Japan': { symbol: '¥', name: '日元', code: 'JPY', rate: 0.05 },
  'UK': { symbol: '£', name: '英镑', code: 'GBP', rate: 9.15 },
  'Europe': { symbol: '€', name: '欧元', code: 'EUR', rate: 7.8 },
  'Austria': { symbol: '€', name: '欧元', code: 'EUR', rate: 7.8 },
  'Korea': { symbol: '₩', name: '韩元', code: 'KRW', rate: 0.0054 },
  'Russia': { symbol: '₽', name: '卢布', code: 'RUB', rate: 0.075 },
  'India': { symbol: '₹', name: '卢比', code: 'INR', rate: 0.086 },
  'Canada': { symbol: 'C$', name: '加元', code: 'CAD', rate: 5.15 },
  'Australia': { symbol: 'A$', name: '澳元', code: 'AUD', rate: 4.65 },
  'Singapore': { symbol: 'S$', name: '新加坡元', code: 'SGD', rate: 5.38 },
  'Thailand': { symbol: '฿', name: '泰铢', code: 'THB', rate: 0.21 },
  'Vietnam': { symbol: '₫', name: '越南盾', code: 'VND', rate: 0.0003 },
  'None': { symbol: '¥', name: '人民币', code: 'CNY', rate: 1.0 } // 无国籍默认人民币
};

// 获取角色的货币信息
function getCurrencyForChat(chat) {
  if (!chat || !chat.country) {
    return CURRENCY_MAP['China']; // 默认中国
  }
  return CURRENCY_MAP[chat.country] || CURRENCY_MAP['China'];
}

// 获取角色的记忆上下文（自动判断记忆模式）
function getMemoryContextForPrompt(chat, options = {}) {
  const { includeTimestamp = false } = options;
  const memoryMode = chat.settings?.memoryMode;
  
  // 向量记忆模式：返回空（向量记忆在ai-response中异步处理）
  if (memoryMode === 'vector') {
    return '(向量记忆模式 - 由检索引擎动态注入)';
  }
  
  // 结构化记忆模式（或兼容旧开关）
  if ((memoryMode === 'structured' || chat.settings?.enableStructuredMemory) && window.structuredMemoryManager) {
    return window.structuredMemoryManager.serializeForPrompt(chat);
  }
  
  // 日记模式（默认）
  if (!chat.longTermMemory || chat.longTermMemory.length === 0) {
    return '- (暂无)';
  }
  
  // 新增：如果开启了限制，只取最近的 N 条
  let memoriesToUse = chat.longTermMemory;
  if (chat.settings?.limitLongTermMemory && chat.settings?.longTermMemoryLimit) {
    const limit = parseInt(chat.settings.longTermMemoryLimit);
    if (limit > 0 && limit < chat.longTermMemory.length) {
      memoriesToUse = chat.longTermMemory.slice(-limit);
    }
  }
  
  if (includeTimestamp) {
    // formatTimeAgo 在 DOMContentLoaded 内部定义，这里用简单的时间格式替代
    return memoriesToUse.map(mem => {
      const d = new Date(mem.timestamp);
      const dateStr = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      return `- (${dateStr}) ${mem.content}`;
    }).join('\n');
  }
  return memoriesToUse.map(mem => `- ${mem.content}`).join('\n');
}

// 外币换算成人民币
function convertToCNY(amount, currency) {
  if (!currency || !currency.rate) {
    return amount; // 默认不换算
  }
  return amount * currency.rate;
}
// ========== 货币映射配置结束 ==========

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function (match) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[match];
  });
}
function generateRandomPacketAmounts(totalAmount, count) {
  let remainingAmount = totalAmount;
  let remainingCount = count;
  const amounts = [];
  const min = 0.01;

  for (let i = 0; i < count - 1; i++) {

    const avg = remainingAmount / remainingCount;
    const absoluteMax = remainingAmount - (remainingCount - 1) * min;

    let max = Math.min(avg * 2, absoluteMax);
    if (max < min) {
      max = min;
    }

    let amount = Math.random() * (max - min) + min;
    amount = parseFloat(amount.toFixed(2));

    amounts.push(amount);
    remainingAmount -= amount;
    remainingCount--;
  }


  amounts.push(parseFloat(remainingAmount.toFixed(2)));

  for (let i = amounts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [amounts[i], amounts[j]] = [amounts[j], amounts[i]];
  }

  console.log(`[红包生成]: 总金额 ${totalAmount}, 数量 ${count}. 分配结果:`, amounts);
  return amounts;
}

function getDeviceId() {
  let deviceId = localStorage.getItem('ephoneDeviceId');
  if (!deviceId) {

    deviceId = ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
    localStorage.setItem('ephoneDeviceId', deviceId);
  }
  return deviceId;
}


const EPHONE_DEVICE_ID = getDeviceId();
console.log(`EPhone 设备ID: ${EPHONE_DEVICE_ID}`);

// 全局 API 调用控制器
let currentApiController = null;

let isPinActivated = localStorage.getItem('ephonePinActivated') === 'true';


// ========== 从 script.js 第 682~1061 行提取 ==========

(function () {
  'use strict';


  function downloadImage(imageSrc, filename) {
    try {

      const link = document.createElement('a');
      link.href = imageSrc;
      link.download = filename;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();


      setTimeout(() => {
        document.body.removeChild(link);
      }, 100);

      console.log('✅ [NAI下载] 开始下载图片:', filename);

      // 显示下载提示
      showDownloadToast();
    } catch (error) {
      console.error('❌ [NAI下载] 下载失败:', error);
      showDownloadToast('下载失败，请重试', 'error');
    }
  }

  // showDownloadToast 已移至 ui-modals.js，此处不再重复定义

  function generateFilename(imgElement) {

    const title = imgElement.getAttribute('title') || imgElement.getAttribute('alt') || '';


    let cleanTitle = title
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 30);

    if (!cleanTitle) {
      cleanTitle = 'NAI_Image';
    }


    const timestamp = new Date().toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .split('.')[0];


    return `${cleanTitle}_${timestamp}.png`;
  }


  function addVisualFeedback(imgElement) {
    const originalTransform = imgElement.style.transform || '';
    const originalTransition = imgElement.style.transition || '';


    imgElement.style.transition = 'transform 0.15s ease';
    imgElement.style.transform = 'scale(0.95)';

    setTimeout(() => {
      imgElement.style.transform = originalTransform;
      setTimeout(() => {
        imgElement.style.transition = originalTransition;
      }, 150);
    }, 150);
  }
  window.downloadImage = downloadImage;     // 把下载函数暴露给全局
  window.generateFilename = generateFilename; // 把文件名生成暴露给全局
  window.addVisualFeedback = addVisualFeedback;

  let clickCount = 0;
  let clickTimer = null;
  let lastClickedElement = null;



  document.addEventListener('click', function (e) {
    const target = e.target;


    if (target.tagName === 'IMG' &&
      (target.classList.contains('realimag-image') ||
        target.classList.contains('naiimag-image'))) {


      if (target === lastClickedElement) {
        clickCount++;
      } else {

        clickCount = 1;
        lastClickedElement = target;
      }

      // 清除之前的定时器
      if (clickTimer) {
        clearTimeout(clickTimer);
      }


      if (clickCount === 3) {

        clickCount = 0;
        lastClickedElement = null;


        e.preventDefault();
        e.stopPropagation();

        console.log('🖼️ [NAI下载] 检测到三击NAI图片');


        addVisualFeedback(target);


        const imageSrc = target.src;

        if (!imageSrc || imageSrc === 'about:blank') {
          console.warn('⚠️ [NAI下载] 图片源为空，无法下载');
          showDownloadToast('图片加载中，请稍后重试', 'error');
          return;
        }


        const filename = generateFilename(target);


        downloadImage(imageSrc, filename);
      } else {

        clickTimer = setTimeout(() => {
          clickCount = 0;
          lastClickedElement = null;
        }, 500);
      }
    }
  }, true);

  console.log('✅ [NAI下载] 三击下载功能已初始化');
  console.log('💡 [NAI下载] 提示：三击任意NAI图片即可下载');
})();


if ('serviceWorker' in navigator) {

  window.addEventListener('load', () => {

    navigator.serviceWorker.register('./sw.js')
      .then(registration => {

        console.log('ServiceWorker 注册成功，作用域为: ', registration.scope);
      })
      .catch(error => {

        console.log('ServiceWorker 注册失败: ', error);
      });
  });
}

if (!Array.prototype.findLastIndex) {
  Object.defineProperty(Array.prototype, 'findLastIndex', {
    value: function (predicate) {
      if (this == null) {
        throw new TypeError('Cannot read property \'findLastIndex\' of null or undefined');
      }
      if (typeof predicate !== 'function') {
        throw new TypeError('predicate must be a function');
      }
      let o = Object(this);
      let len = o.length >>> 0;
      let thisArg = arguments[1];
      let k = len - 1;
      while (k >= 0) {
        let kValue = o[k];
        if (predicate.call(thisArg, kValue, k, o)) {
          return k;
        }
        k--;
      }
      return -1;
    },
    configurable: true,
    writable: true
  });
}

const dynamicIslandContent = document.getElementById('dynamic-island-content');
const islandAlbumArt = document.getElementById('island-album-art');
const islandLyricContainer = document.getElementById('island-lyric-container');
const islandLyricText = document.getElementById('island-lyric-text');
const phoneScreenForIsland = document.getElementById('phone-screen');

let activeMessageTimestamp = null;
let activeTransferTimestamp = null;

let lastRawAiResponse = '';
let lastResponseTimestamps = [];
let lastPrivateMessagesSent = [];
let lastGroupMessagesSent = [];
let currentQzoneReplyContext = null;
let editingNpcId = null;
let pendingBackupData = null;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
function findBestStickerMatch(meaning, availableStickers) {
  if (!meaning || !availableStickers || availableStickers.length === 0) {
    return null;
  }

  const SIMILARITY_THRESHOLD = 0.7;
  const candidates = [];
  let highestScore = 0;

  const getTokens = (str) => [...new Set(str.replace(/\s+/g, ''))];
  const meaningTokens = getTokens(meaning);

  availableStickers.forEach(sticker => {
    if (!sticker.name) return;

    const stickerNameTokens = getTokens(sticker.name);
    const intersection = stickerNameTokens.filter(token => meaningTokens.includes(token));
    // Jaccard Similarity Score
    const score = intersection.length / (stickerNameTokens.length + meaningTokens.length - intersection.length);


    if (score > highestScore) {
      highestScore = score;
    }


    if (score >= SIMILARITY_THRESHOLD) {
      candidates.push({ sticker, score });
    }
  });

  if (candidates.length > 0) {

    const bestCandidates = candidates.filter(c => c.score === highestScore);


    const randomIndex = Math.floor(Math.random() * bestCandidates.length);
    const chosenSticker = bestCandidates[randomIndex].sticker;

    console.log(`[模糊随机匹配成功] AI含义: "${meaning}", 匹配到 ${bestCandidates.length} 个最佳选项, 随机选中: "${chosenSticker.name}", 相似度: ${highestScore.toFixed(2)}`);
    return chosenSticker;
  }

  console.log(`[模糊随机匹配失败] AI含义: "${meaning}", 最高相似度为 ${highestScore.toFixed(2)}，未达到阈值 ${SIMILARITY_THRESHOLD}。`);
  return null;
}
function getRandomValue(str) {

  if (str.includes(',')) {

    const arr = str.split(',').map(item => item.trim());

    const randomIndex = Math.floor(Math.random() * arr.length);

    return arr[randomIndex];
  }

  return str;
}

function isImage(content) {
  if (content.image_url && content.image_url.url) {
    let currentImageData = content.image_url.url

    const base64Data = currentImageData.split(',')[1];

    const mimeType = currentImageData.match(/^data:(.*);base64/)[1];
    return [{
      text: '用户向你发送了一张图片'
    },
    {
      inline_data: {
        mime_type: mimeType,
        data: base64Data
      }
    }
    ]
  }
  return []
}



function getGeminiResponseText(data) {


  if (data.choices && Array.isArray(data.choices) && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
    return data.choices[0].message.content;
  }


  if (data.candidates && Array.isArray(data.candidates) && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts) {
    return data.candidates[0].content.parts[0].text;
  }


  console.error("API返回了非预期的格式:", data);
  let errorReason = "AI返回了空内容或未知格式。";


  if (data.candidates && Array.isArray(data.candidates) && data.candidates.length > 0 && data.candidates[0].finishReason === 'SAFETY') {
    const safetyRatings = data.candidates[0].safetyRatings;
    const blockedCategories = safetyRatings
      .filter(r => r.probability !== 'NEGLIGIBLE' && r.probability !== 'LOW')
      .map(r => `${r.category} (概率: ${r.probability})`)
      .join(', ');
    errorReason = `内容因安全策略被屏蔽。触发类别: ${blockedCategories || '未知'}`;
  }

  else if (data.promptFeedback?.blockReason) {
    const reason = data.promptFeedback.blockReason;
    const details = data.promptFeedback.safetyRatings?.map(r => `${r.category}: ${r.probability}`).join(', ');
    errorReason = `内容因安全策略被屏蔽 (原因: ${reason})。详情: ${details || '无'}`;
  }

  else if (data.error?.message) {
    errorReason = `API错误: ${data.error.message}`;
  }

  else if (data.message) {
    errorReason = `API错误: ${data.message}`;
  }

  else if (data.detail) {
    errorReason = `API错误: ${data.detail}`;
  }

  else if (data.error && typeof data.error === 'string') {
    errorReason = `API错误: ${data.error}`;
  }

  throw new Error(errorReason);
}


// ========== 共享变量定义（原 script.js DOMContentLoaded 闭包内，拆分后需全局可访问） ==========

const DEFAULT_APP_ICONS = {
    'qq': 'https://i.postimg.cc/MTC3Tkw8/IMG-6436.jpg',
    'world-book': 'https://i.postimg.cc/HWf1JKzn/IMG-6435.jpg',
    'wallpaper': 'https://i.postimg.cc/T1j03pQr/IMG-6440.jpg',
    'renderer': 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1756312261242_qdqqd_g0eriz.jpeg',
    'api-settings': 'https://i.postimg.cc/MK8rJ8t7/IMG-6438.jpg',
    'font': 'https://i.postimg.cc/pXxk1JXk/IMG-6442.jpg',

    'char-phone': 'https://i.postimg.cc/pXj9h20L/IMG-7275.jpg',
    'douban': 'https://i.postimg.cc/Pq2xJN1g/IMG-7301.jpg',

    'preset': 'https://i.postimg.cc/nMbyyt1t/D7CD735A73F5FD1D7B8407E0EB8BBAC0.png',

    'tutorial': 'https://i.postimg.cc/d10GjC4g/IMG-7302.jpg',
    'werewolf': 'https://i.postimg.cc/k401K5g7/IMG-7304.jpg',

    'x': 'https://i.postimg.cc/Y9d3BztC/1.png',
    'alipay': 'https://i.postimg.cc/Hs7BLh76/alipay.png',
    'auction': 'https://i.postimg.cc/Hs7BLh76/alipay.png',
    'green-river': 'https://i.postimg.cc/0j55Pj1L/green-river-icon.png',
    'mail': 'https://i.postimg.cc/PfR7f37x/mail.png',
    'period-tracker': 'https://i.postimg.cc/RVGt0yMN/calendar-pink.png',
    'focus-timer': 'https://i.postimg.cc/Kz8d9YJy/tomato-timer.png',

    // 第三页的APP
    'myphone': 'https://i.postimg.cc/MTC3Tkw8/IMG-6436.jpg',
    'draw-guess': 'https://i.postimg.cc/k5dG3B4p/draw-guess-icon.png',
    'char-generator': 'https://i.postimg.cc/nzGYM8qb/character-gen.jpg',
    'online-app': 'https://i.postimg.cc/MTC3Tkw8/IMG-6436.jpg',
    'forum': 'https://i.postimg.cc/MTC3Tkw8/IMG-6436.jpg',
    'new-world': 'https://i.postimg.cc/MTC3Tkw8/IMG-6436.jpg'
  };


  const DEFAULT_CPHONE_ICONS = {
    'qq': 'https://i.postimg.cc/MTC3Tkw8/IMG-6436.jpg',
    'album': 'https://i.postimg.cc/HWf1JKzn/IMG-6435.jpg',
    'browser': 'https://i.postimg.cc/KzC2gTq6/IMG-7276.jpg',
    'taobao': 'https://i.postimg.cc/L6R7x16R/IMG-7278.jpg',
    'memo': 'https://i.postimg.cc/J0b6Nym4/IMG-7279.jpg',
    'diary': 'https://i.postimg.cc/DZ541sbt/IMG-7280.jpg',
    'amap': 'https://i.postimg.cc/Jz2Tz0dw/IMG-7281.jpg',
    'usage': 'https://i.postimg.cc/WbF8kzz9/IMG-7282.jpg',
    'music': 'https://is1-ssl.mzstatic.com/image/thumb/Purple112/v4/64/9d/21/649d21e8-a151-6136-3914-256e54f15d9a/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png',
    'bilibili': 'https://i.postimg.cc/Wz5gV0jB/bilibili-icon.png',
    'reddit': 'https://www.redditinc.com/assets/images/site/reddit-logo.png',
    'ephone': 'https://i.postimg.cc/pXj9h20L/IMG-7275.jpg'
  };

  const DEFAULT_MYPHONE_ICONS = {
    'qq': 'https://i.postimg.cc/MTC3Tkw8/IMG-6436.jpg',
    'album': 'https://i.postimg.cc/HWf1JKzn/IMG-6435.jpg',
    'browser': 'https://i.postimg.cc/KzC2gTq6/IMG-7276.jpg',
    'taobao': 'https://i.postimg.cc/L6R7x16R/IMG-7278.jpg',
    'memo': 'https://i.postimg.cc/J0b6Nym4/IMG-7279.jpg',
    'diary': 'https://i.postimg.cc/DZ541sbt/IMG-7280.jpg',
    'amap': 'https://i.postimg.cc/Jz2Tz0dw/IMG-7281.jpg',
    'usage': 'https://i.postimg.cc/WbF8kzz9/IMG-7282.jpg',
    'music': 'https://is1-ssl.mzstatic.com/image/thumb/Purple112/v4/64/9d/21/649d21e8-a151-6136-3914-256e54f15d9a/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.png',
    'settings': 'https://i.postimg.cc/hvFpZYjJ/IMG-7283.jpg',
    'records': 'https://i.postimg.cc/fyXNLqYL/IMG-7284.jpg',
    'ephone': 'https://i.postimg.cc/pXj9h20L/IMG-7275.jpg'
  };

  const STICKER_REGEX = /(^https:\/\/i\.postimg\.cc\/.+|^https:\/\/files\.catbox\.moe\/.+|^https?:\/\/sharkpan\.xyz\/.+|^data:image|\.(png|jpg|jpeg|gif|webp)\?.*$|\.(png|jpg|jpeg|gif|webp)$)/i;

  var currentRenderedCount = 0;
  var activeCountdownTimers = [];

  var dynamicFontStyle = document.createElement('style');
  dynamicFontStyle.id = 'dynamic-font-style';
  document.head.appendChild(dynamicFontStyle);

// ========== 跨模块共享变量（原 script.js DOMContentLoaded 闭包内） ==========
// 这些变量被多个模块引用，需要在全局作用域中声明

const defaultAvatar = 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg';
const defaultMyGroupAvatar = 'https://i.postimg.cc/cLPP10Vm/4.jpg';
const defaultGroupMemberAvatar = 'https://i.postimg.cc/VkQfgzGJ/1.jpg';
const defaultGroupAvatar = 'https://i.postimg.cc/gc3QYCDy/1-NINE7-Five.jpg';
const DEFAULT_NOTIFICATION_SOUND = 'https://www.myinstants.com/media/sounds/notification-sound-2.mp3';

let notificationTimeout;
let simulationIntervalId = null;
let currentReplyContext = null;
let activePostId = null;
let currentNaiPresetId = null;
let drawGuessState = {
  isActive: false,
  partnerId: null,
  history: [],
  isAiResponding: false,
  mode: 'online',
  messageManager: {
    isOpen: false,
    mode: null,
    selectedTimestamps: new Set()
  }
};
let originalChatMessagesPaddingTop = null;

// 记忆分页状态（被 memory-summary.js 和 init-and-state.js 共享）
var memoryCache = [];
var memoryRenderCount = 0;
var isLoadingMoreMemories = false;

// 待办事项分页状态（被 init-and-state.js 内部使用）
var todoCache = [];
var todoRenderCount = 0;
var isLoadingMoreTodos = false;

// ========== 更多跨模块共享变量（原 script.js DOMContentLoaded 闭包内） ==========

// 选择模式相关
var isSelectionMode = false;
var selectedMessages = new Set();

// 编辑状态
var editingMemberId = null;
var editingWorldBookId = null;
var editingMemoId = null;
var editingDiaryId = null;

// 加载状态
var isLoadingMoreChats = false;
var isLoadingMoreMessages = false;
var isLoadingMoreThoughts = false;

// 聊天列表
var sortedChatListItems = [];

// 外卖定时器
var waimaiTimers = {};

// 旁观模式
var currentSpectatorMode = 'group';

// CPhone 相关
var activeCharacterId = null;
var cphoneRenderedCount = 0;
var cphoneActiveConversationType = null;
var isLoadingMoreCphoneMessages = false;

// MyPhone 相关
var myphoneRenderedCount = 0;
var myphoneActiveConversationIndex = null;
var isLoadingMoreMyPhoneMessages = false;

// 查看状态
var activeDiaryForViewing = null;
var activeArticleForViewing = null;
var activeMemoForViewing = null;

// 豆瓣相关
var activeDoubanPostId = null;
var unreadPostsCount = 0;

// 照片查看器
var photoViewerState = {
  isOpen: false,
  photos: [],
  currentIndex: -1,
};

// 壁纸
var newWallpaperBase64 = null;

// 快捷回复
var activeQuickReplyCategoryId = 'all';

// 音频播放器（全局引用）
var audioPlayer = document.getElementById('audio-player');

// 音乐播放器状态
var musicState = {
  isActive: false,
  activeChatId: null,
  isPlaying: false,
  playlist: [],
  currentIndex: -1,
  playMode: 'order',
  totalElapsedTime: 0,
  timerId: null,
  parsedLyrics: [],
  currentLyricIndex: -1,
  playlists: [{ id: 'default', name: '默认', createdAt: Date.now() }],
  activePlaylistId: 'default'
};

// ========== 遗漏的全局函数（原 script.js DOMContentLoaded 闭包内） ==========

function updateUnreadIndicator(count) {
  unreadPostsCount = count;
  localStorage.setItem('unreadPostsCount', count);

  const navItem = document.querySelector('.nav-item[data-view="qzone-screen"]');
  if (!navItem) return;

  const targetSpan = navItem.querySelector('span');
  let indicator = navItem.querySelector('.unread-indicator');

  if (count > 0) {
    if (!indicator) {
      indicator = document.createElement('span');
      indicator.className = 'unread-indicator';
      targetSpan.style.position = 'relative';
      targetSpan.appendChild(indicator);
    }
    indicator.textContent = count > 99 ? '99+' : count;
    indicator.style.display = 'block';
  } else {
    if (indicator) {
      indicator.style.display = 'none';
    }
  }
}

// 心声历史分页
var thoughtsHistoryRenderCount = 0;
const THOUGHTS_RENDER_WINDOW = 15;

// ========== Token 计算函数（从 script.js 补充拆分，原第 55823~55975 行） ==========

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 1.5);
}

async function calculateCurrentContextTokens() {
  if (!state.activeChatId) return 0;
  const chat = state.chats[state.activeChatId];
  if (!chat) return 0;

  const maxMemory = parseInt(document.getElementById('max-memory').value) || 10;
  const linkedMemoryCount = parseInt(document.getElementById('linked-memory-count').value) || 10;
  const isOfflineMode = document.getElementById('offline-mode-toggle').checked;
  const aiPersona = document.getElementById('ai-persona').value;
  const myPersona = document.getElementById('my-persona').value;

  let fullContextString = '';

  const linkedBookIds = Array.from(document.querySelectorAll('#world-book-checkboxes-container input:checked')).map(cb => cb.value.replace('book_', ''));
  const globalBookIds = state.worldBooks.filter(wb => wb.isGlobal).map(wb => wb.id);
  const allBookIds = [...new Set([...linkedBookIds, ...globalBookIds])];

  if (allBookIds.length > 0) {
    const linkedContents = allBookIds.map(bookId => {
      const worldBook = state.worldBooks.find(wb => wb.id === bookId);
      if (!worldBook || !Array.isArray(worldBook.content)) return '';
      return worldBook.content.filter(e => e.enabled !== false).map(e => e.content).join('\n');
    }).filter(Boolean).join('\n');
    fullContextString += linkedContents;
  }

  const memMode = chat.settings.memoryMode || (chat.settings.enableStructuredMemory ? 'structured' : 'diary');
  if (memMode === 'vector' && window.vectorMemoryManager) {
    // 向量记忆：估算核心记忆 + topN片段的token
    fullContextString += window.vectorMemoryManager.serializeCoreMemories(chat);
    const topN = chat.vectorMemory?.settings?.topN || 8;
    const frags = [...(chat.vectorMemory?.fragments || [])].sort((a, b) => (b.importance || 5) - (a.importance || 5)).slice(0, topN);
    fullContextString += frags.map(f => f.content).join('\n');
  } else if ((memMode === 'structured' || chat.settings.enableStructuredMemory) && window.structuredMemoryManager) {
    fullContextString += window.structuredMemoryManager.serializeForPrompt(chat);
  } else if (chat.longTermMemory && chat.longTermMemory.length > 0) {
    fullContextString += getMemoryContextForPrompt(chat);
  }

  const linkedMemoryToggle = document.getElementById('link-memory-toggle').checked;
  if (linkedMemoryToggle) {
    const linkedChatIds = Array.from(document.querySelectorAll('#linked-chats-checkboxes-container input:checked')).map(cb => cb.value);
    for (const linkedId of linkedChatIds) {
      const linkedChat = state.chats[linkedId];
      if (linkedChat && linkedChat.history.length > 0) {
        fullContextString += linkedChat.history.slice(-linkedMemoryCount).map(msg => String(msg.content)).join('\n');
      }
    }
  }

  if (chat.isGroup) {
    chat.members.forEach(member => {
      fullContextString += member.persona;
    });
  } else {
    fullContextString += aiPersona;
  }
  fullContextString += myPersona;

  fullContextString += getStickerContextForPrompt(chat);
  if (chat.isGroup) {
    fullContextString += getGroupStickerContextForPrompt(chat);
  }

  if (!chat.isGroup && isOfflineMode) {
    const offlinePresetId = document.getElementById('offline-preset-select').value;
    if (offlinePresetId) {
      const preset = state.presets.find(p => p.id === offlinePresetId);
      if (preset) {
        fullContextString += preset.content.filter(e => e.enabled !== false).map(e => e.content).join('\n');
      }
    }
  }

  const historySlice = chat.history.filter(msg => !msg.isExcluded).slice(-maxMemory);
  fullContextString += historySlice.map(msg => {
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) return msg.content.map(p => p.text).join(' ');
    return '';
  }).join('\n');

  return estimateTokens(fullContextString);
}

function debounce(func, delay) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

const updateTokenCountDisplay = debounce(async () => {
  const tokenValueEl = document.getElementById('token-count-value');
  const msgValueEl = document.getElementById('message-count-value');

  if (!tokenValueEl) return;

  const chat = state.activeChatId ? state.chats[state.activeChatId] : null;
  if (msgValueEl) {
    if (chat && chat.history) {
      const visibleCount = chat.history.filter(m => !m.isHidden).length;
      msgValueEl.textContent = `${visibleCount} 条`;
      msgValueEl.style.color = "#000000";
    } else {
      msgValueEl.textContent = "--";
    }
  }

  // 更新已排除消息数
  const excludedCountEl = document.getElementById('excluded-count-value');
  if (excludedCountEl) {
    if (chat && chat.history) {
      const excludedCount = chat.history.filter(m => m.isExcluded).length;
      excludedCountEl.textContent = excludedCount > 0 ? `${excludedCount} 条` : '0 条';
      excludedCountEl.style.color = excludedCount > 0 ? 'var(--accent-color)' : '#8a8a8a';
    } else {
      excludedCountEl.textContent = '--';
    }
  }

  tokenValueEl.textContent = "计算中...";
  try {
    const tokenCount = await calculateCurrentContextTokens();
    tokenValueEl.textContent = `${tokenCount} Tokens`;
    tokenValueEl.style.color = "#000000";

    if (document.body.classList.contains('dark-mode') || document.getElementById('phone-screen').classList.contains('dark-mode')) {
      if (msgValueEl) msgValueEl.style.color = "#ffffff";
      tokenValueEl.style.color = "#ffffff";
    }

  } catch (error) {
    console.error("Token calculation error:", error);
    tokenValueEl.textContent = "Error";
  }
}, 300);
