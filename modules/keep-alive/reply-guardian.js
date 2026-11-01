// ============================================================
// reply-guardian.js — 回复守护总控、生命周期恢复、诊断与用户入口
// ============================================================
(function () {
  'use strict';

  let initialized = false;
  let eventsBound = false;

  function settings() {
    if (!window.state || !window.state.globalSettings) return { enabled: true, completionNotifications: true };
    const current = window.state.globalSettings.replyGuardian || {};
    return {
      enabled: current.enabled !== false,
      completionNotifications: current.completionNotifications !== false
    };
  }

  async function saveSettings(patch) {
    if (!window.state || !window.state.globalSettings) return;
    window.state.globalSettings.replyGuardian = {
      ...settings(),
      ...patch
    };
    await window.db.globalSettings.put(window.state.globalSettings);
  }

  function detectCapabilities() {
    const ua = navigator.userAgent || '';
    const isiOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = !!navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    const pip = !!(window.ReplyGuardianPiP && window.ReplyGuardianPiP.isSupported());
    return {
      isiOS,
      isStandalone,
      wakeLock: 'wakeLock' in navigator,
      serviceWorker: 'serviceWorker' in navigator,
      notification: 'Notification' in window,
      notificationPermission: 'Notification' in window ? Notification.permission : 'unsupported',
      mediaSession: 'mediaSession' in navigator,
      pip,
      backgroundSync: 'serviceWorker' in navigator && 'SyncManager' in window,
      online: navigator.onLine
    };
  }

  function capabilitySummary(capabilities) {
    const available = [];
    if (capabilities.wakeLock) available.push('屏幕锁');
    available.push('任务记录');
    if (capabilities.mediaSession) available.push('媒体会话');
    if (capabilities.pip) available.push('等待小窗');
    if (capabilities.notification && capabilities.notificationPermission === 'granted') available.push('完成通知');
    const environment = capabilities.isiOS
      ? (capabilities.isStandalone ? 'iOS PWA' : 'iOS 网页')
      : (capabilities.isStandalone ? '安卓/移动端 PWA' : '移动端网页');
    return `${environment} · ${available.join('、')}`;
  }

  async function refreshDiagnostics() {
    const capabilities = detectCapabilities();
    const capabilityElement = document.getElementById('reply-guardian-capability-summary');
    if (capabilityElement) capabilityElement.textContent = capabilitySummary(capabilities);
    const taskElement = document.getElementById('reply-guardian-task-summary');
    if (taskElement && window.ReplyTaskStore) {
      const tasks = await window.ReplyTaskStore.listRecoverable();
      if (!tasks.length) {
        taskElement.textContent = '暂无未完成回复记录';
      } else {
        const interrupted = tasks.filter(task => task.status === 'interrupted' || task.status === 'failed').length;
        taskElement.textContent = interrupted
          ? `${interrupted} 条回复有中断或失败记录`
          : `${tasks.length} 条回复正在守护`;
      }
    }
    return capabilities;
  }

  async function notifyCompleted(task) {
    if (!task || !settings().completionNotifications || document.visibilityState === 'visible') return;
    const globalSettings = window.state && window.state.globalSettings;
    if (!globalSettings || !globalSettings.systemNotification || !globalSettings.systemNotification.enabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!window.notificationManager) return;
    if (typeof window.notificationManager.notifyReplyComplete === 'function') {
      await window.notificationManager.notifyReplyComplete(task.chatName, task.chatId);
    } else {
      await window.notificationManager.notifyNewMessage(task.chatName, '回复已经完成，点击查看。', task.chatId);
    }
  }

  async function handleTaskChange(event) {
    const task = event.detail && event.detail.task;
    if (!task) return;
    await refreshDiagnostics();
    if (task.status === 'completed') {
      if (window.ReplyGuardianPiP) window.ReplyGuardianPiP.markCompleted();
      await notifyCompleted(task);
    }
  }

  function bindUi() {
    if (eventsBound) return;
    eventsBound = true;
    const enabledSwitch = document.getElementById('reply-guardian-enabled-switch');
    const notificationSwitch = document.getElementById('reply-guardian-notification-switch');
    const refreshButton = document.getElementById('reply-guardian-refresh-btn');

    if (enabledSwitch) {
      enabledSwitch.checked = settings().enabled;
      enabledSwitch.addEventListener('change', async event => {
        await saveSettings({ enabled: event.target.checked });
        await refreshDiagnostics();
      });
    }
    if (notificationSwitch) {
      notificationSwitch.checked = settings().completionNotifications;
      notificationSwitch.addEventListener('change', async event => {
        await saveSettings({ completionNotifications: event.target.checked });
      });
    }
    if (refreshButton) refreshButton.addEventListener('click', refreshDiagnostics);
  }

  function bindLifecycle() {
    document.addEventListener('visibilitychange', async () => {
      if (!window.ReplyTaskStore) return;
      if (document.hidden) {
        await window.ReplyTaskStore.markBackgrounded();
      } else {
        await refreshDiagnostics();
      }
    });
    window.addEventListener('pagehide', () => {
      if (window.ReplyTaskStore) window.ReplyTaskStore.markBackgrounded().catch(() => {});
    });
    document.addEventListener('freeze', () => {
      if (window.ReplyTaskStore) window.ReplyTaskStore.markBackgrounded().catch(() => {});
    });
    window.addEventListener('online', refreshDiagnostics);
    window.addEventListener('offline', refreshDiagnostics);
    window.addEventListener('replyguardian:taskchange', handleTaskChange);
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    if (!window.state || !window.db || !window.ReplyTaskStore) return;

    window.state.globalSettings.replyGuardian = settings();
    bindUi();
    bindLifecycle();
    await window.ReplyTaskStore.recoverPreviousSession();
    await window.ReplyTaskStore.cleanup();
    await refreshDiagnostics();
    // 快速重载时旧页面心跳可能仍短暂存在；租约过期后再检查一次。
    window.setTimeout(async () => {
      await window.ReplyTaskStore.recoverPreviousSession();
      await refreshDiagnostics();
    }, 12500);
  }

  window.ReplyGuardian = {
    init,
    settings,
    detectCapabilities,
    refreshDiagnostics
  };
})();
