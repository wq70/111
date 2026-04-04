// ========== 整洁聊天详情 - Tab 分页版 ==========
// 独立模块：当 state.globalSettings.cleanChatDetail 开启时，
// 将原有 chat-settings-screen 的内容按 Tab 分类展示在独立全屏面板中

(function() {
  'use strict';

  let cleanScreenEl = null;

  function openCleanChatDetail() {
    const chatId = state.activeChatId;
    if (!chatId) return;
    // 原有回显已在 chat-settings-btn handler 中完成
    buildCleanScreen();
  }

  function buildCleanScreen() {
    // 如果已存在则先清理
    if (cleanScreenEl) {
      restoreElements();
      cleanScreenEl.remove();
      cleanScreenEl = null;
    }

    const oldScreen = document.getElementById('chat-settings-screen');
    const oldContainer = oldScreen ? oldScreen.querySelector('.settings-container') : null;
    if (!oldContainer) return;

    // 隐藏原有 screen
    oldScreen.classList.remove('active');
    oldScreen.style.display = 'none';

    // 创建新的全屏容器
    cleanScreenEl = document.createElement('div');
    cleanScreenEl.id = 'clean-chat-detail-screen';

    const chat = state.chats[state.activeChatId];
    const chatName = chat ? chat.name : '聊天详情';

    // Header
    const header = document.createElement('div');
    header.className = 'ccd-header';
    header.innerHTML = '<span class="ccd-back">\u2039</span>' +
      '<span class="ccd-title">' + escapeHtml(chatName) + '</span>' +
      '<span class="ccd-save">\u4FDD\u5B58</span>';
    cleanScreenEl.appendChild(header);

    header.querySelector('.ccd-back').addEventListener('click', closeClean);

    header.querySelector('.ccd-save').addEventListener('click', () => {
      const saveBtn = document.getElementById('save-chat-settings-btn');
      if (saveBtn) saveBtn.click();
      closeClean();
    });

    // Tab 栏
    const tabBar = document.createElement('div');
    tabBar.className = 'ccd-tabs';
    cleanScreenEl.appendChild(tabBar);

    // 内容区
    const body = document.createElement('div');
    body.className = 'ccd-body';
    cleanScreenEl.appendChild(body);

    // 收集原有 sections
    const allSections = Array.from(oldContainer.children).filter(
      el => el.classList.contains('settings-section') ||
            el.id === 'weather-settings-section' ||
            el.id === 'video-call-optimization-section' ||
            el.id === 'memory-archive-section' ||
            el.id === 'api-history-section' ||
            el.id === 'message-navigation-section'
    );

    const tabPanels = buildTabs(allSections);

    tabPanels.forEach((panel, idx) => {
      const tab = document.createElement('div');
      tab.className = 'ccd-tab' + (idx === 0 ? ' active' : '');
      tab.textContent = panel.label;
      tab.dataset.tabId = panel.id;
      tab.addEventListener('click', () => switchTab(panel.id));
      tabBar.appendChild(tab);

      const panelEl = document.createElement('div');
      panelEl.className = 'ccd-panel' + (idx === 0 ? ' active' : '');
      panelEl.id = 'ccd-panel-' + panel.id;

      const inner = document.createElement('div');
      inner.className = 'settings-container';
      panel.elements.forEach(el => inner.appendChild(el));
      panelEl.appendChild(inner);
      body.appendChild(panelEl);
    });

    document.body.appendChild(cleanScreenEl);
  }

  function buildTabs(allElements) {
    // 原有 settings-container 中的子元素按顺序大致为：
    // [0] settings-section: 基础信息（名字、头像等）
    // [1] settings-section: 人设与剧情
    // [2] settings-section: 模型与智能（后台、记忆、AI行为）
    //     内部嵌套了一个 settings-section（Token统计）
    // [3] weather-settings-section
    // [4] video-call-optimization-section
    // [5] memory-archive-section
    // [6] api-history-section
    // [7] message-navigation-section
    // [8] settings-section: 高级功能（TTS、线下模式、时间、NAI）
    // [9] settings-section: 外观与视觉
    // [10] settings-section: 数据与操作
    // 注意：实际顺序可能因条件渲染略有不同，用 id 辅助判断

    const tabs = [];
    const used = new Set();

    function take(el) {
      if (el && !used.has(el)) {
        used.add(el);
        return el;
      }
      return null;
    }

    // 按 id 或特征查找
    const weatherEl = allElements.find(e => e.id === 'weather-settings-section');
    const videoEl = allElements.find(e => e.id === 'video-call-optimization-section');
    const memoryArchiveEl = allElements.find(e => e.id === 'memory-archive-section');
    const apiHistoryEl = allElements.find(e => e.id === 'api-history-section');
    const msgNavEl = allElements.find(e => e.id === 'message-navigation-section');

    // 没有 id 的 settings-section 按顺序收集
    const plainSections = allElements.filter(e =>
      e.classList.contains('settings-section') &&
      !e.id
    );

    // plainSections 顺序：基础[0], 人设[1], 智能[2], (内嵌token), 高级[3], 外观[4], 数据[5]
    // 但智能section内部嵌套了一个token统计的settings-section，
    // 那个嵌套的不会出现在 oldContainer.children 中，所以不影响

    // 基础
    if (plainSections[0]) {
      tabs.push({ id: 'basic', label: '基础', elements: [take(plainSections[0])] });
    }

    // 人设
    if (plainSections[1]) {
      tabs.push({ id: 'persona', label: '人设', elements: [take(plainSections[1])] });
    }

    // 智能（后台+AI行为+记忆）
    const aiElements = [];
    if (plainSections[2]) aiElements.push(take(plainSections[2]));
    if (weatherEl) aiElements.push(take(weatherEl));
    if (videoEl) aiElements.push(take(videoEl));
    if (aiElements.length) {
      tabs.push({ id: 'ai', label: '智能', elements: aiElements });
    }

    // 媒体/时间（高级功能：TTS、线下模式、时间、NAI）
    if (plainSections[3]) {
      tabs.push({ id: 'media', label: '功能', elements: [take(plainSections[3])] });
    }

    // 外观
    if (plainSections[4]) {
      tabs.push({ id: 'appearance', label: '外观', elements: [take(plainSections[4])] });
    }

    // 数据（记忆库+API历史+消息导航+导入导出操作）
    const dataElements = [];
    if (memoryArchiveEl) dataElements.push(take(memoryArchiveEl));
    if (apiHistoryEl) dataElements.push(take(apiHistoryEl));
    if (msgNavEl) dataElements.push(take(msgNavEl));
    if (plainSections[5]) dataElements.push(take(plainSections[5]));
    if (dataElements.length) {
      tabs.push({ id: 'data', label: '数据', elements: dataElements });
    }

    // 收集剩余未分配的
    const remaining = allElements.filter(e => !used.has(e));
    if (remaining.length) {
      tabs.push({ id: 'other', label: '其他', elements: remaining });
    }

    return tabs.filter(t => t.elements.length > 0 && t.elements[0] !== null);
  }

  function switchTab(tabId) {
    if (!cleanScreenEl) return;
    cleanScreenEl.querySelectorAll('.ccd-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tabId === tabId);
    });
    cleanScreenEl.querySelectorAll('.ccd-panel').forEach(p => {
      p.classList.toggle('active', p.id === 'ccd-panel-' + tabId);
    });
  }

  function closeClean() {
    restoreElements();
    if (cleanScreenEl) {
      cleanScreenEl.remove();
      cleanScreenEl = null;
    }
    const oldScreen = document.getElementById('chat-settings-screen');
    if (oldScreen) oldScreen.style.display = '';
    showScreen('chat-interface-screen');
  }

  function restoreElements() {
    // 把搬运的 section 还回原有 settings-container
    const oldContainer = document.querySelector('#chat-settings-screen .settings-container');
    if (!oldContainer || !cleanScreenEl) return;

    // 收集所有被搬运的元素
    const movedEls = cleanScreenEl.querySelectorAll(
      '.settings-section, #weather-settings-section, #video-call-optimization-section, ' +
      '#memory-archive-section, #api-history-section, #message-navigation-section'
    );

    // 找到底部垫高 div（最后一个子元素）
    const spacer = oldContainer.querySelector('div[style*="height: 40px"]');

    movedEls.forEach(el => {
      if (spacer) {
        oldContainer.insertBefore(el, spacer);
      } else {
        oldContainer.appendChild(el);
      }
    });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  window.openCleanChatDetail = openCleanChatDetail;
})();
