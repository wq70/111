// ============================================================
// notification-battery.js
// 从 script.js 拆分出来的通知、水印功能模块
// 包含：聊天内通知、系统级通知、截图水印
// 原始行范围：8891~8960, 36475~36490, 36608~37175, 37178~37448
// ============================================================

// --- 依赖说明 ---
// 需要 window.state (来自 script.js DOMContentLoaded 内部)
// 需要 DEFAULT_NOTIFICATION_SOUND (来自 script.js DOMContentLoaded 内部)
// 需要 notificationTimeout (来自 script.js DOMContentLoaded 内部)
// 需要 defaultAvatar (来自 script.js DOMContentLoaded 内部)
// 需要 openChat, updateBackButtonUnreadCount, playNotificationSound, showCustomAlert (来自 script.js)

// ========== 聊天内通知 ==========
// 原始位置：script.js 第 36475~36490 行
  function playNotificationSound() {
    const player = document.getElementById('notification-sound-player');

    const soundUrl = state.globalSettings.notificationSoundUrl || DEFAULT_NOTIFICATION_SOUND;


    if (soundUrl && soundUrl.trim()) {
      player.src = soundUrl;
      // 应用音量设置
      player.volume = state.globalSettings.notificationVolume !== undefined ? state.globalSettings.notificationVolume : 1.0;

      player.play().catch(error => console.log("播放被中断，这是正常行为:", error));
    }
  }

// 原始位置：script.js 第 8891~8960 行
  function showNotification(chatId, messageContent) {
    const chat = state.chats[chatId];
    if (!chat) return;

    // 检查是否禁用内部弹窗通知
    const disableInternalNotification = state.globalSettings.systemNotification?.disableInternalNotification || false;

    // 如果未禁用内部弹窗，则显示内部弹窗
    if (!disableInternalNotification) {
      playNotificationSound();

      clearTimeout(notificationTimeout);

      const bar = document.getElementById('notification-bar');

      document.getElementById('notification-avatar').src = chat.settings.aiAvatar || chat.settings.groupAvatar || defaultAvatar;
      document.getElementById('notification-content').querySelector('.name').textContent = chat.name;
      document.getElementById('notification-content').querySelector('.message').textContent = messageContent;

      bar.classList.remove('visible');

      void bar.offsetWidth;

      bar.classList.add('visible');

      const newBar = bar.cloneNode(true);
      bar.parentNode.replaceChild(newBar, bar);
      newBar.addEventListener('click', () => {
        openChat(chatId);
        newBar.classList.remove('visible');
      });

      notificationTimeout = setTimeout(() => {
        newBar.classList.remove('visible');
      }, 4000);
      updateBackButtonUnreadCount();
    }

    // 新增：触发系统级通知
    console.log('[系统通知调试] showNotification 被调用:', {
      chatId,
      messageContent,
      systemNotificationEnabled: state.globalSettings.systemNotification?.enabled,
      disableInternalNotification: disableInternalNotification,
      notificationPermission: typeof Notification !== 'undefined' ? Notification.permission : 'N/A'
    });

    if (state.globalSettings.systemNotification?.enabled) {
      console.log('[系统通知调试] 准备调用 handleSystemNotification');
      handleSystemNotification(chatId, messageContent);
    } else {
      console.log('[系统通知调试] 系统通知未启用或配置不存在');
    }
  }

  // 新增：在聊天页面也触发系统级通知（如果启用了相应选项）
  function triggerSystemNotificationInChatPage(chatId, messageContent) {
    // 检查是否启用了"在聊天页面也发送通知"选项
    const notifyInChatPage = state.globalSettings.systemNotification?.notifyInChatPage || false;

    if (notifyInChatPage && state.globalSettings.systemNotification?.enabled) {
      console.log('[系统通知调试] 在聊天页面触发系统级通知:', {
        chatId,
        messageContent
      });
      handleSystemNotification(chatId, messageContent);
    }
  }

// ========== 系统级通知功能 ==========
// 原始位置：script.js 第 36608~37175 行

  // 初始化系统通知
  function initSystemNotification() {
    if (!('Notification' in window)) {
      console.warn('此浏览器不支持系统通知');
      return;
    }

    updateNotificationPermissionStatus();
    bindSystemNotificationEvents();
    loadSystemNotificationSettings(); // 🔥 修复：页面加载时恢复所有设置和子菜单显示状态

    // 定时检查权限状态变化（兼容不支持 permissions.onchange 的浏览器）
    setInterval(() => {
      updateNotificationPermissionStatus();
    }, 3000);
  }

  // 更新权限状态显示
  async function updateNotificationPermissionStatus() {
    const statusEl = document.getElementById('permission-status-text');
    const statusContainer = document.getElementById('notification-permission-status');

    if (!statusEl) return;

    // 直接用 Notification.permission，这是最可靠的实时权限状态
    const permission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';

    if (permission === 'granted') {
      statusEl.textContent = '已授权';
      statusEl.style.color = '#4cd964';
      if (window.notificationManager) {
        window.notificationManager.permissionGranted = true;
      }
    } else if (permission === 'denied') {
      statusEl.textContent = '已拒绝';
      statusEl.style.color = '#ff3b30';
    } else if (permission === 'default') {
      statusEl.textContent = '未请求';
      statusEl.style.color = '#999';
    } else {
      statusEl.textContent = '不支持';
      statusEl.style.color = '#999';
    }

    if (statusContainer) {
      statusContainer.style.display = state.globalSettings.systemNotification?.enabled ? 'flex' : 'none';
    }
  }

  // 请求通知权限 - iOS优化版
  async function requestNotificationPermission() {
    // 检测是否为iOS设备
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // iOS特殊检查：是否在PWA模式下运行
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isIOS && !isStandalone) {
      alert('iOS设备需要先将网页添加到主屏幕才能使用系统通知功能\n\n' +
        '操作步骤：\n' +
        '1. 点击 Safari 分享按钮\n' +
        '2. 选择"添加到主屏幕"\n' +
        '3. 从主屏幕打开应用');
      return false;
    }

    if (!('Notification' in window)) {
      alert(isIOS ?
        'iOS设备需要将网页添加到主屏幕后才能使用通知功能' :
        '您的浏览器不支持系统通知');
      return false;
    }

    try {
      // 直接用 Notification.permission（最可靠，兼容所有浏览器包括 iOS）
      let currentPermission = Notification.permission;

      if (currentPermission === 'granted') {
        if (window.notificationManager) {
          window.notificationManager.permissionGranted = true;
        }
        updateNotificationPermissionStatus();
        return true;
      }

      if (currentPermission === 'denied') {
        alert(isIOS ?
          '通知权限已被拒绝\n\n请在 iPhone 设置 > 通知 中手动开启' :
          '通知权限已被拒绝，请在浏览器设置中手动开启');
        return false;
      }

      // 请求权限（必须通过 Notification API）
      if (typeof Notification.requestPermission === 'function') {
        const permission = await Notification.requestPermission();
        await updateNotificationPermissionStatus();

        if (permission !== 'granted') {
          alert(isIOS ?
            '未授予通知权限\n\n如需开启，请在 iPhone 设置 > 通知 中手动开启' :
            '未授予通知权限，系统通知功能将无法使用');
          const switchEl = document.getElementById('system-notification-enabled-switch');
          if (switchEl) switchEl.checked = false;
          state.globalSettings.systemNotification.enabled = false;
          return false;
        }

        return true;
      } else {
        alert('您的浏览器不支持请求通知权限');
        return false;
      }
    } catch (error) {
      console.error('[权限请求] 失败:', error);
      alert(isIOS ?
        '请求通知权限失败\n\n请确保已将网页添加到主屏幕' :
        '请求通知权限失败: ' + error.message);
      return false;
    }
  }

  // 震动设备
  function vibrateDevice() {
    if (!('vibrate' in navigator)) {
      return;
    }

    const patterns = {
      short: [200],
      medium: [200, 100, 200],
      long: [400, 100, 400, 100, 400]
    };

    const pattern = state.globalSettings.systemNotification?.vibration?.pattern || 'short';
    navigator.vibrate(patterns[pattern]);
  }

  // 播放系统通知提示音
  function playSystemNotificationSound() {
    const soundConfig = state.globalSettings.systemNotification?.sound;

    if (!soundConfig || !soundConfig.enabled) {
      return;
    }

    let soundUrl;
    if (soundConfig.useGlobalSound) {
      soundUrl = state.globalSettings.notificationSoundUrl || DEFAULT_NOTIFICATION_SOUND;
    } else {
      soundUrl = soundConfig.customSoundUrl || DEFAULT_NOTIFICATION_SOUND;
    }

    if (soundUrl && soundUrl.trim()) {
      const audio = new Audio(soundUrl);
      // 应用音量设置
      audio.volume = state.globalSettings.notificationVolume !== undefined ? state.globalSettings.notificationVolume : 1.0;
      audio.play().catch(err => console.log('播放提示音失败:', err));
    }
  }

  // 显示系统通知（每条消息独立通知）- iOS优化版
  async function showSystemNotification(chatId, messageContent, options = {}) {
    console.log('[系统通知调试] showSystemNotification 被调用:', {
      chatId,
      messageContent,
      options,
      enabled: state.globalSettings.systemNotification?.enabled
    });

    if (!state.globalSettings.systemNotification?.enabled) {
      console.log('[系统通知调试] 系统通知未启用');
      return;
    }

    // 直接用 Notification.permission 检查权限（最可靠，兼容所有浏览器）
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      console.log('[系统通知调试] 通知权限未授予:', typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
      return;
    }

    const chat = state.chats[chatId];
    if (!chat) {
      console.log('[系统通知调试] 找不到聊天:', chatId);
      return;
    }

    const appName = state.globalSettings.systemNotification.appName || 'EPhone';
    const title = options.title || `${appName} - ${chat.name}`;
    const body = messageContent;
    const icon = chat.settings.aiAvatar || chat.settings.groupAvatar || 'https://i.postimg.cc/nMbyyt1t/D7CD735A73F5FD1D7B8407E0EB8BBAC0.png';

    // 每条消息使用唯一的 tag，确保每条都显示
    const uniqueTag = `chat-${chatId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log('[系统通知调试] 准备创建通知:', {
      title,
      body,
      icon,
      tag: uniqueTag
    });

    try {
      // 检测是否为iOS设备
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      // iOS友好的通知配置（简化版）
      const notifyOptions = {
        body: body,
        icon: icon,
        badge: icon,
        tag: uniqueTag,
        data: { chatId }
      };

      // Android/桌面端可以使用更多特性
      if (!isIOS) {
        notifyOptions.requireInteraction = true; // iOS不支持
        notifyOptions.renotify = true;
        notifyOptions.actions = [ // iOS不支持操作按钮
          { action: 'reply', title: '回复' },
          { action: 'dismiss', title: '关闭' }
        ];
      }

      // 优先使用 Service Worker（Android/桌面端/iOS PWA）
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const registration = await navigator.serviceWorker.ready;
        console.log('[系统通知调试] Service Worker 已就绪');

        await registration.showNotification(title, notifyOptions);
        console.log('[系统通知调试] 通知创建成功（通过ServiceWorker）');
      } else if ('Notification' in window && Notification.permission === 'granted') {
        // Fallback 到 Notification API（iOS Safari可能需要）
        console.log('[系统通知调试] 使用 Notification API fallback');
        new Notification(title, notifyOptions);
      } else {
        console.warn('[系统通知调试] 无可用的通知方式');
        return;
      }

      // 播放提示音
      if (state.globalSettings.systemNotification.sound?.enabled) {
        console.log('[系统通知调试] 播放提示音');
        playSystemNotificationSound();
      }

      // 触发震动（使用通用的Vibration API）
      if (state.globalSettings.systemNotification.vibration?.enabled) {
        console.log('[系统通知调试] 触发震动');
        if (navigator.vibrate) {
          // iOS只支持简单震动模式，Android支持复杂模式
          const vibratePattern = isIOS ? 200 : [200, 100, 200, 100, 200];
          navigator.vibrate(vibratePattern);
        } else {
          // 使用原有的vibrateDevice()作为fallback
          vibrateDevice();
        }
      }
    } catch (error) {
      console.error('[系统通知调试] 创建通知失败:', error);
      // iOS友好的错误提示
      if (error.name === 'TypeError' && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
        console.warn('[系统通知调试] iOS设备：请确保已将网页添加到主屏幕');
      }
    }
  }

  // 处理系统通知（每条消息单独通知，不合并）
  async function handleSystemNotification(chatId, messageContent) {
    console.log('[系统通知调试] handleSystemNotification 被调用:', {
      chatId,
      messageContent,
      config: state.globalSettings.systemNotification
    });

    const config = state.globalSettings.systemNotification;

    if (!config || !config.enabled) {
      console.log('[系统通知调试] 配置检查失败:', {
        configExists: !!config,
        enabled: config?.enabled
      });
      return;
    }

    // 直接用 Notification.permission 检查权限（最可靠，兼容所有浏览器）
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      console.log('[系统通知调试] 通知权限未授予:', typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
      return;
    }

    console.log('[系统通知调试] 检查通过，准备显示通知');

    // 每条消息都单独显示通知，不使用合并逻辑
    console.log('[系统通知调试] 直接显示单条通知');
    showSystemNotification(chatId, messageContent);
  }

  // 发送测试通知
  async function sendTestNotification() {
    console.log('[系统通知调试] sendTestNotification 被调用');

    // 直接用 Notification.permission 检查权限（最可靠，兼容所有浏览器）
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      console.log('[系统通知调试] 权限状态:', typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
      alert('请先开启系统通知权限');
      return;
    }

    const appName = state.globalSettings.systemNotification?.appName || 'EPhone';
    console.log('[系统通知调试] 准备创建测试通知, appName:', appName);

    try {
      // 检测是否为iOS设备
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      // iOS友好的测试通知配置
      const testNotifyOptions = {
        body: '这是一条测试通知 🎉',
        icon: 'https://i.postimg.cc/nMbyyt1t/D7CD735A73F5FD1D7B8407E0EB8BBAC0.png',
        badge: 'https://i.postimg.cc/nMbyyt1t/D7CD735A73F5FD1D7B8407E0EB8BBAC0.png',
        tag: 'test-notification'
      };

      // 优先使用 Service Worker（Android/桌面端/iOS PWA）
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const registration = await navigator.serviceWorker.ready;
        console.log('[系统通知调试] Service Worker 已就绪');

        await registration.showNotification(appName, testNotifyOptions);
      } else if ('Notification' in window && Notification.permission === 'granted') {
        // Fallback 到 Notification API（iOS Safari可能需要）
        console.log('[系统通知调试] 使用 Notification API fallback');
        new Notification(appName, testNotifyOptions);
      } else {
        alert(isIOS ?
          '请确保已将网页添加到主屏幕，并在系统设置中允许通知' :
          '您的浏览器不支持系统通知功能');
        return;
      }

      console.log('[系统通知调试] 测试通知创建成功');

      if (state.globalSettings.systemNotification?.sound?.enabled) {
        playSystemNotificationSound();
      }

      if (state.globalSettings.systemNotification?.vibration?.enabled) {
        vibrateDevice();
      }
    } catch (error) {
      console.error('[系统通知调试] 创建测试通知失败:', error);
      alert('创建测试通知失败: ' + error.message);
    }
  }

  // 绑定系统通知相关事件
  function bindSystemNotificationEvents() {
    const enabledSwitch = document.getElementById('system-notification-enabled-switch');
    const detailsDiv = document.getElementById('system-notification-details');
    const appNameInput = document.getElementById('system-notification-app-name');
    const testBtn = document.getElementById('test-system-notification-btn');

    const pushServerSwitch = document.getElementById('push-server-enabled-switch');
    const pushServerDetails = document.getElementById('push-server-details');
    const pushServerUrl = document.getElementById('push-server-url');
    const pushServerApiKey = document.getElementById('push-server-api-key');

    const vibrationSwitch = document.getElementById('notification-vibration-enabled-switch');
    const vibrationSelector = document.getElementById('vibration-pattern-selector');
    const vibrationPattern = document.getElementById('vibration-pattern-select');

    const soundSwitch = document.getElementById('notification-sound-enabled-switch');
    const soundDetails = document.getElementById('notification-sound-details');
    const useGlobalSound = document.getElementById('use-global-sound-switch');
    const customSoundWrapper = document.getElementById('custom-sound-input-wrapper');
    const customSoundUrl = document.getElementById('custom-notification-sound-url');

    if (enabledSwitch) {
      enabledSwitch.addEventListener('change', async () => {
        if (enabledSwitch.checked) {
          const granted = await requestNotificationPermission();
          if (granted) {
            state.globalSettings.systemNotification.enabled = true;
            detailsDiv.style.display = 'block';
            updateNotificationPermissionStatus();
          } else {
            enabledSwitch.checked = false;
          }
        } else {
          state.globalSettings.systemNotification.enabled = false;
          detailsDiv.style.display = 'none';
          updateNotificationPermissionStatus();
        }
      });
    }

    if (appNameInput) {
      appNameInput.addEventListener('input', () => {
        state.globalSettings.systemNotification.appName = appNameInput.value.trim() || 'EPhone';
      });
    }

    if (testBtn) {
      testBtn.addEventListener('click', sendTestNotification);
    }

    if (pushServerSwitch) {
      pushServerSwitch.addEventListener('change', () => {
        state.globalSettings.systemNotification.pushServer.enabled = pushServerSwitch.checked;
        pushServerDetails.style.display = pushServerSwitch.checked ? 'block' : 'none';
      });
    }

    if (pushServerUrl) {
      pushServerUrl.addEventListener('input', () => {
        state.globalSettings.systemNotification.pushServer.serverUrl = pushServerUrl.value.trim();
      });
    }

    if (pushServerApiKey) {
      pushServerApiKey.addEventListener('input', () => {
        state.globalSettings.systemNotification.pushServer.apiKey = pushServerApiKey.value.trim();
      });
    }

    if (vibrationSwitch) {
      vibrationSwitch.addEventListener('change', () => {
        state.globalSettings.systemNotification.vibration.enabled = vibrationSwitch.checked;
        vibrationSelector.style.display = vibrationSwitch.checked ? 'block' : 'none';
      });
    }

    if (vibrationPattern) {
      vibrationPattern.addEventListener('change', () => {
        state.globalSettings.systemNotification.vibration.pattern = vibrationPattern.value;
      });
    }

    if (soundSwitch) {
      soundSwitch.addEventListener('change', () => {
        state.globalSettings.systemNotification.sound.enabled = soundSwitch.checked;
        soundDetails.style.display = soundSwitch.checked ? 'block' : 'none';
      });
    }

    if (useGlobalSound) {
      useGlobalSound.addEventListener('change', () => {
        state.globalSettings.systemNotification.sound.useGlobalSound = useGlobalSound.checked;
        customSoundWrapper.style.display = useGlobalSound.checked ? 'none' : 'block';
      });
    }

    if (customSoundUrl) {
      customSoundUrl.addEventListener('input', () => {
        state.globalSettings.systemNotification.sound.customSoundUrl = customSoundUrl.value.trim();
      });
    }

    // 在聊天页面也发送通知
    const notifyInChatPageSwitch = document.getElementById('notify-in-chat-page-switch');
    if (notifyInChatPageSwitch) {
      notifyInChatPageSwitch.addEventListener('change', () => {
        state.globalSettings.systemNotification.notifyInChatPage = notifyInChatPageSwitch.checked;
      });
    }

    // 禁用内部弹窗
    const disableInternalNotificationSwitch = document.getElementById('disable-internal-notification-switch');
    if (disableInternalNotificationSwitch) {
      disableInternalNotificationSwitch.addEventListener('change', () => {
        state.globalSettings.systemNotification.disableInternalNotification = disableInternalNotificationSwitch.checked;
      });
    }
  }

  // 加载系统通知设置到UI
  function loadSystemNotificationSettings() {
    const config = state.globalSettings.systemNotification;
    if (!config) return;

    const enabledSwitch = document.getElementById('system-notification-enabled-switch');
    const detailsDiv = document.getElementById('system-notification-details');
    const appNameInput = document.getElementById('system-notification-app-name');

    const pushServerSwitch = document.getElementById('push-server-enabled-switch');
    const pushServerDetails = document.getElementById('push-server-details');
    const pushServerUrl = document.getElementById('push-server-url');
    const pushServerApiKey = document.getElementById('push-server-api-key');

    const vibrationSwitch = document.getElementById('notification-vibration-enabled-switch');
    const vibrationSelector = document.getElementById('vibration-pattern-selector');
    const vibrationPattern = document.getElementById('vibration-pattern-select');

    const soundSwitch = document.getElementById('notification-sound-enabled-switch');
    const soundDetails = document.getElementById('notification-sound-details');
    const useGlobalSound = document.getElementById('use-global-sound-switch');
    const customSoundWrapper = document.getElementById('custom-sound-input-wrapper');
    const customSoundUrl = document.getElementById('custom-notification-sound-url');

    // 加载主开关状态
    if (enabledSwitch) {
      enabledSwitch.checked = config.enabled || false;
      detailsDiv.style.display = config.enabled ? 'block' : 'none';
    }

    if (appNameInput) {
      appNameInput.value = config.appName || 'EPhone';
    }

    // 加载推送服务器设置
    if (pushServerSwitch) {
      pushServerSwitch.checked = config.pushServer?.enabled || false;
      pushServerDetails.style.display = config.pushServer?.enabled ? 'block' : 'none';
    }

    if (pushServerUrl) {
      pushServerUrl.value = config.pushServer?.serverUrl || '';
    }

    if (pushServerApiKey) {
      pushServerApiKey.value = config.pushServer?.apiKey || '';
    }

    // 加载震动设置
    if (vibrationSwitch) {
      vibrationSwitch.checked = config.vibration?.enabled || false;
      vibrationSelector.style.display = config.vibration?.enabled ? 'block' : 'none';
    }

    if (vibrationPattern) {
      vibrationPattern.value = config.vibration?.pattern || 'short';
    }

    // 加载声音设置
    if (soundSwitch) {
      soundSwitch.checked = config.sound?.enabled || false;
      soundDetails.style.display = config.sound?.enabled ? 'block' : 'none';
    }

    if (useGlobalSound) {
      useGlobalSound.checked = config.sound?.useGlobalSound !== false;
      customSoundWrapper.style.display = config.sound?.useGlobalSound !== false ? 'none' : 'block';
    }

    if (customSoundUrl) {
      customSoundUrl.value = config.sound?.customSoundUrl || '';
    }

    // 加载在聊天页面也发送通知设置
    const notifyInChatPageSwitch = document.getElementById('notify-in-chat-page-switch');
    if (notifyInChatPageSwitch) {
      notifyInChatPageSwitch.checked = config.notifyInChatPage || false;
    }

    // 加载禁用内部弹窗设置
    const disableInternalNotificationSwitch = document.getElementById('disable-internal-notification-switch');
    if (disableInternalNotificationSwitch) {
      disableInternalNotificationSwitch.checked = config.disableInternalNotification || false;
    }

    updateNotificationPermissionStatus();
  }

  // ========== 系统级通知功能结束 ==========

  // ========== 截图水印功能开始 ==========
  // 原始位置：script.js 第 37178~37448 行

  // 水印配置
  let watermarkConfig = {
    enabled: false,
    text: '保密内容 请勿外传',
    layout: 'diagonal', // diagonal, grid, sparse, dense
    color: '#000000',
    opacity: 0.1,
    fontSize: 20,
    fontFamily: "'Microsoft YaHei', sans-serif"
  };

  // 创建水印层
  function createWatermarkLayer() {
    // 移除已存在的水印层
    const existingWatermark = document.getElementById('screenshot-watermark-layer');
    if (existingWatermark) {
      existingWatermark.remove();
    }

    if (!watermarkConfig.enabled) return;

    const watermarkLayer = document.createElement('div');
    watermarkLayer.id = 'screenshot-watermark-layer';
    watermarkLayer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 999999;
      overflow: hidden;
    `;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // 根据布局方式设置canvas大小
    let canvasWidth, canvasHeight;
    switch (watermarkConfig.layout) {
      case 'diagonal':
        canvasWidth = 400;
        canvasHeight = 200;
        break;
      case 'grid':
        canvasWidth = 300;
        canvasHeight = 150;
        break;
      case 'sparse':
        canvasWidth = 600;
        canvasHeight = 300;
        break;
      case 'dense':
        canvasWidth = 250;
        canvasHeight = 125;
        break;
      default:
        canvasWidth = 400;
        canvasHeight = 200;
    }

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // 绘制水印文字
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.font = `${watermarkConfig.fontSize}px ${watermarkConfig.fontFamily}`;
    ctx.fillStyle = watermarkConfig.color;
    ctx.globalAlpha = watermarkConfig.opacity;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (watermarkConfig.layout === 'diagonal') {
      // 斜向排列
      ctx.translate(canvasWidth / 2, canvasHeight / 2);
      ctx.rotate(-25 * Math.PI / 180);
      ctx.fillText(watermarkConfig.text, 0, 0);
    } else if (watermarkConfig.layout === 'grid') {
      // 网格排列（水平）
      ctx.fillText(watermarkConfig.text, canvasWidth / 2, canvasHeight / 2);
    } else if (watermarkConfig.layout === 'sparse' || watermarkConfig.layout === 'dense') {
      // 稀疏/密集排列（斜向）
      ctx.translate(canvasWidth / 2, canvasHeight / 2);
      ctx.rotate(-30 * Math.PI / 180);
      ctx.fillText(watermarkConfig.text, 0, 0);
    }

    // 将canvas转换为背景图片
    const dataURL = canvas.toDataURL('image/png');
    watermarkLayer.style.backgroundImage = `url(${dataURL})`;
    watermarkLayer.style.backgroundRepeat = 'repeat';
    
    document.body.appendChild(watermarkLayer);
  }

  // 加载水印设置
  function loadWatermarkSettings() {
    const savedConfig = localStorage.getItem('watermarkConfig');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        watermarkConfig = { ...watermarkConfig, ...parsed };
      } catch (e) {
        console.error('加载水印配置失败:', e);
      }
    }

    // 更新UI
    const enabledSwitch = document.getElementById('watermark-enabled-switch');
    const textInput = document.getElementById('watermark-text');
    const layoutSelect = document.getElementById('watermark-layout');
    const colorInput = document.getElementById('watermark-color');
    const opacityInput = document.getElementById('watermark-opacity');
    const fontSizeInput = document.getElementById('watermark-font-size');
    const fontFamilySelect = document.getElementById('watermark-font-family');
    const settingsContainer = document.getElementById('watermark-settings-container');

    if (enabledSwitch) enabledSwitch.checked = watermarkConfig.enabled;
    if (textInput) textInput.value = watermarkConfig.text;
    if (layoutSelect) layoutSelect.value = watermarkConfig.layout;
    if (colorInput) colorInput.value = watermarkConfig.color;
    if (opacityInput) opacityInput.value = watermarkConfig.opacity;
    if (fontSizeInput) fontSizeInput.value = watermarkConfig.fontSize;
    if (fontFamilySelect) fontFamilySelect.value = watermarkConfig.fontFamily;
    if (settingsContainer) settingsContainer.style.display = watermarkConfig.enabled ? 'block' : 'none';

    // 更新显示值
    updateWatermarkDisplayValues();

    // 如果启用，创建水印层
    if (watermarkConfig.enabled) {
      createWatermarkLayer();
    }
  }

  // 保存水印设置
  function saveWatermarkSettings() {
    localStorage.setItem('watermarkConfig', JSON.stringify(watermarkConfig));
  }

  // 更新显示值
  function updateWatermarkDisplayValues() {
    const colorDisplay = document.getElementById('watermark-color-display');
    const opacityDisplay = document.getElementById('watermark-opacity-display');
    const fontSizeDisplay = document.getElementById('watermark-font-size-display');

    if (colorDisplay) colorDisplay.textContent = watermarkConfig.color;
    if (opacityDisplay) opacityDisplay.textContent = Math.round(watermarkConfig.opacity * 100) + '%';
    if (fontSizeDisplay) fontSizeDisplay.textContent = watermarkConfig.fontSize + 'px';
  }

  // 绑定水印设置事件
  function bindWatermarkEvents() {
    const enabledSwitch = document.getElementById('watermark-enabled-switch');
    const textInput = document.getElementById('watermark-text');
    const layoutSelect = document.getElementById('watermark-layout');
    const colorInput = document.getElementById('watermark-color');
    const opacityInput = document.getElementById('watermark-opacity');
    const fontSizeInput = document.getElementById('watermark-font-size');
    const fontFamilySelect = document.getElementById('watermark-font-family');
    const previewBtn = document.getElementById('watermark-preview-btn');
    const settingsContainer = document.getElementById('watermark-settings-container');

    // 启用/禁用水印
    if (enabledSwitch) {
      enabledSwitch.addEventListener('change', function() {
        watermarkConfig.enabled = this.checked;
        if (settingsContainer) {
          settingsContainer.style.display = this.checked ? 'block' : 'none';
        }
        saveWatermarkSettings();
        createWatermarkLayer();
      });
    }

    // 水印文字
    if (textInput) {
      textInput.addEventListener('input', function() {
        watermarkConfig.text = this.value || '保密内容 请勿外传';
        saveWatermarkSettings();
        if (watermarkConfig.enabled) {
          createWatermarkLayer();
        }
      });
    }

    // 布局方式
    if (layoutSelect) {
      layoutSelect.addEventListener('change', function() {
        watermarkConfig.layout = this.value;
        saveWatermarkSettings();
        if (watermarkConfig.enabled) {
          createWatermarkLayer();
        }
      });
    }

    // 颜色
    if (colorInput) {
      colorInput.addEventListener('input', function() {
        watermarkConfig.color = this.value;
        updateWatermarkDisplayValues();
        saveWatermarkSettings();
        if (watermarkConfig.enabled) {
          createWatermarkLayer();
        }
      });
    }

    // 透明度
    if (opacityInput) {
      opacityInput.addEventListener('input', function() {
        watermarkConfig.opacity = parseFloat(this.value);
        updateWatermarkDisplayValues();
        saveWatermarkSettings();
        if (watermarkConfig.enabled) {
          createWatermarkLayer();
        }
      });
    }

    // 字体大小
    if (fontSizeInput) {
      fontSizeInput.addEventListener('input', function() {
        watermarkConfig.fontSize = parseInt(this.value);
        updateWatermarkDisplayValues();
        saveWatermarkSettings();
        if (watermarkConfig.enabled) {
          createWatermarkLayer();
        }
      });
    }

    // 字体
    if (fontFamilySelect) {
      fontFamilySelect.addEventListener('change', function() {
        watermarkConfig.fontFamily = this.value;
        saveWatermarkSettings();
        if (watermarkConfig.enabled) {
          createWatermarkLayer();
        }
      });
    }

    // 预览按钮
    if (previewBtn) {
      previewBtn.addEventListener('click', function() {
        // 临时显示水印3秒
        const wasEnabled = watermarkConfig.enabled;
        watermarkConfig.enabled = true;
        createWatermarkLayer();
        
        // 显示提示
        showCustomAlert('预览水印', '水印效果已显示，将在3秒后自动隐藏');
        
        setTimeout(() => {
          watermarkConfig.enabled = wasEnabled;
          createWatermarkLayer();
        }, 3000);
      });
    }
  }

  // 在页面加载时初始化
  setTimeout(() => {
    loadWatermarkSettings();
    bindWatermarkEvents();
  }, 500);

  // ========== 截图水印功能结束 ==========

// ========== 电池管理（遗漏的函数，原 script.js DOMContentLoaded 闭包内） ==========

  let lastKnownBatteryLevel = 1;
  let alertFlags = {
    hasShown40: false,
    hasShown20: false,
    hasShown10: false
  };
  let batteryAlertTimeout;

  function showBatteryAlert(imageUrl, text) {
    const batteryAlertModal = document.getElementById('battery-alert-modal');
    if (!batteryAlertModal) return;
    clearTimeout(batteryAlertTimeout);
    document.getElementById('battery-alert-image').src = imageUrl;
    document.getElementById('battery-alert-text').textContent = text;
    batteryAlertModal.classList.add('visible');
    const closeAlert = () => {
      batteryAlertModal.classList.remove('visible');
      batteryAlertModal.removeEventListener('click', closeAlert);
    };
    batteryAlertModal.addEventListener('click', closeAlert);
    batteryAlertTimeout = setTimeout(closeAlert, 2000);
  }

  function updateBatteryDisplay(battery) {
    const batteryContainer = document.getElementById('status-bar-battery');
    if (!batteryContainer) return;
    const batteryLevelEl = batteryContainer.querySelector('.battery-level');
    const batteryTextEl = batteryContainer.querySelector('.battery-text');
    const level = Math.floor(battery.level * 100);
    batteryLevelEl.style.width = `${level}%`;
    batteryTextEl.textContent = `${level}%`;
    if (battery.charging) {
      batteryContainer.classList.add('charging');
    } else {
      batteryContainer.classList.remove('charging');
    }
  }

  function handleBatteryChange(battery) {
    updateBatteryDisplay(battery);
    const level = battery.level;
    if (!battery.charging) {
      if (level <= 0.4 && lastKnownBatteryLevel > 0.4 && !alertFlags.hasShown40) {
        showBatteryAlert('https://i.postimg.cc/T2yKJ0DV/40.jpg', '有点饿了，可以去找充电器惹');
        alertFlags.hasShown40 = true;
      }
      if (level <= 0.2 && lastKnownBatteryLevel > 0.2 && !alertFlags.hasShown20) {
        showBatteryAlert('https://i.postimg.cc/qB9zbKs9/20.jpg', '赶紧的充电，要饿死了');
        alertFlags.hasShown20 = true;
      }
      if (level <= 0.1 && lastKnownBatteryLevel > 0.1 && !alertFlags.hasShown10) {
        showBatteryAlert('https://i.postimg.cc/ThMMVfW4/10.jpg', '已阵亡，还有30秒爆炸');
        alertFlags.hasShown10 = true;
      }
    }
    if (level > 0.4) alertFlags.hasShown40 = false;
    if (level > 0.2) alertFlags.hasShown20 = false;
    if (level > 0.1) alertFlags.hasShown10 = false;
    lastKnownBatteryLevel = level;
  }

  async function initBatteryManager() {
    if ('getBattery' in navigator) {
      try {
        const battery = await navigator.getBattery();
        lastKnownBatteryLevel = battery.level;
        handleBatteryChange(battery);
        battery.addEventListener('levelchange', () => handleBatteryChange(battery));
        battery.addEventListener('chargingchange', () => {
          handleBatteryChange(battery);
          if (battery.charging) {
            showBatteryAlert('https://i.postimg.cc/3NDQ0dWG/image.jpg', '窝爱泥，电量吃饱饱');
          }
        });
      } catch (err) {
        console.error("无法获取电池信息:", err);
        const batteryText = document.querySelector('.battery-text');
        if (batteryText) batteryText.textContent = 'ᗜωᗜ';
      }
    } else {
      console.log("浏览器不支持电池状态API。");
      const batteryText = document.querySelector('.battery-text');
      if (batteryText) batteryText.textContent = 'ᗜωᗜ';
    }
  }

  // ========== 全局暴露 ==========
  window.initSystemNotification = initSystemNotification;
  window.initBatteryManager = initBatteryManager;

  // ========== 从 script.js 迁移：updateUnreadIndicator ==========
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
      if (indicator) indicator.style.display = 'none';
    }
    if (typeof updateBackButtonUnreadCount === 'function') updateBackButtonUnreadCount();
  }
  window.updateUnreadIndicator = updateUnreadIndicator;
