// ============================================================
// ui-loaders.js
// 来源：script.js（DOMContentLoaded 内部）
// 功能：加载器、时间格式化、Markdown 解析、时钟更新等 UI 工具函数
//       showLoader、hideLoader、formatTimestamp、formatTimeAgo、
//       formatTimestampForAI、formatSystemTimestamp、
//       createSystemTimestampElement、parseMarkdown、updateClock、
//       getTimeOfDayGreeting
// ============================================================

(function () {
  // state 通过全局作用域访问（window.state，由 init-and-state.js 初始化）

  function formatTimestamp(timestamp, chatId = null) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    // 判断是否显示秒数
    let showSeconds = false;

    // 如果提供了 chatId，检查单个角色设置（优先级最高）
    if (chatId && state.chats[chatId] && state.chats[chatId].settings) {
      if (state.chats[chatId].settings.showSeconds !== undefined) {
        showSeconds = state.chats[chatId].settings.showSeconds;
      } else {
        // 如果角色没有单独设置，使用全局设置
        showSeconds = state.globalSettings.showSeconds || false;
      }
    } else {
      // 没有 chatId 时，使用全局设置
      showSeconds = state.globalSettings.showSeconds || false;
    }

    return showSeconds ? `${hours}:${minutes}:${seconds}` : `${hours}:${minutes}`;
  }

  function formatTimeAgo(timestamp) {
    const now = Date.now();
    const seconds = Math.floor((now - timestamp) / 1000);

    if (seconds < 60) return '刚刚';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟前`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}天前`;

    const months = Math.floor(days / 30);
    if (months < 12) return `大约${months}个月前`;

    const years = Math.floor(days / 365);
    return `大约${years}年前`;
  }

  function formatTimestampForAI(timestamp) {
    if (!timestamp) return '';

    const now = new Date();
    const date = new Date(timestamp);

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const timeString = `${hours}:${minutes}`;


    if (now.toDateString() === date.toDateString()) {
      return `今天 ${timeString}`;
    }


    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (yesterday.toDateString() === date.toDateString()) {
      return `昨天 ${timeString}`;
    }


    if (now.getFullYear() === date.getFullYear()) {
      const month = String(date.getMonth() + 1);
      const day = String(date.getDate());
      return `${month}月${day}日 ${timeString}`;
    }


    const year = date.getFullYear();
    const month = String(date.getMonth() + 1);
    const day = String(date.getDate());
    return `${year}年${month}月${day}日 ${timeString}`;
  }


  function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const dateString = now.toLocaleDateString('zh-CN', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });


    document.getElementById('status-bar-time').textContent = timeString;

  }


  function getTimeOfDayGreeting(date = new Date()) {
    const hour = date.getHours();
    if (hour >= 0 && hour < 5) {
      return "凌晨";
    } else if (hour >= 5 && hour < 9) {
      return "早上";
    } else if (hour >= 9 && hour < 13) {
      return "上午";
    } else if (hour >= 13 && hour < 18) {
      return "下午";
    } else if (hour >= 18 && hour < 24) {
      return "晚上";
    }
    return "现在";
  }


  function parseMarkdown(text) {
    if (!text || typeof text !== 'string') return '';


    text = text.replace(/!h\{(.*?)\}/g, '<span class="diary-highlight">$1</span>');
    text = text.replace(/!u\{(.*?)\}/g, '<span class="diary-underline">$1</span>');
    text = text.replace(/!e\{(.*?)\}/g, '<span class="diary-emphasis">$1</span>');
    text = text.replace(/!w\{(.*?)\}/g, '<span class="diary-handwritten">$1</span>');
    text = text.replace(/!m\{(.*?)\}/g, '<span class="diary-messy">$1</span>');



    text = text.replace(/\|\|(.*?)\|\|/g, '<span class="spoiler">$1</span>');



    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\~\~(.*?)\~\~/g, '<s>$1</s>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

    return text;
  }


  function formatSystemTimestamp(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const date = new Date(timestamp);

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const timeString = `${hours}:${minutes}`;


    if (now.toDateString() === date.toDateString()) {
      return timeString;
    }


    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (yesterday.toDateString() === date.toDateString()) {
      return `昨天 ${timeString}`;
    }


    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    if (now.getFullYear() === year) {
      return `${month}月${day}日 ${timeString}`;
    } else {
      return `${year}年${month}月${day}日 ${timeString}`;
    }
  }


  function createSystemTimestampElement(timestamp) {
    const wrapper = document.createElement('div');

    wrapper.className = 'message-wrapper system-pat';

    const bubble = document.createElement('div');

    bubble.className = 'message-bubble system-bubble';
    bubble.textContent = formatSystemTimestamp(timestamp);

    wrapper.appendChild(bubble);
    return wrapper;
  }


  function showLoader(container, position = 'top') {

    if (container.querySelector('.loader-container')) return;
    const loader = document.createElement('div');
    loader.className = 'loader-container';
    loader.innerHTML = '<div class="spinner"></div>';

    if (position === 'bottom') {
      container.appendChild(loader);
    } else {
      container.prepend(loader);
    }
  }


  function hideLoader(container) {
    const loader = container.querySelector('.loader-container');
    if (loader) {
      loader.remove();
    }
  }


  // 导出到全局作用域
  window.formatTimestamp = formatTimestamp;
  window.formatTimeAgo = formatTimeAgo;
  window.formatTimestampForAI = formatTimestampForAI;
  window.updateClock = updateClock;
  window.getTimeOfDayGreeting = getTimeOfDayGreeting;
  window.parseMarkdown = parseMarkdown;
  window.formatSystemTimestamp = formatSystemTimestamp;
  window.createSystemTimestampElement = createSystemTimestampElement;
  window.showLoader = showLoader;
  window.hideLoader = hideLoader;
})();
