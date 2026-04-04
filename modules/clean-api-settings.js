// ========== 整洁API设置 - Tab 分页版 ==========
// 独立模块：当 state.globalSettings.cleanApiSettings 开启时，
// 将原有 api-settings-screen 的内容按 Tab 分类展示在独立全屏面板中

(function() {
  'use strict';

  let cleanScreenEl = null;
  // 记录原始 DOM 顺序，用于还原
  let originalOrder = [];

  function openCleanApiSettings() {
    buildCleanScreen();
  }

  function buildCleanScreen() {
    // 如果已存在则先清理
    if (cleanScreenEl) {
      restoreElements();
      cleanScreenEl.remove();
      cleanScreenEl = null;
    }

    const oldScreen = document.getElementById('api-settings-screen');
    const oldContainer = oldScreen ? oldScreen.querySelector('.settings-container') : null;
    if (!oldContainer) return;

    // 记录原始子元素顺序（用于还原）
    originalOrder = Array.from(oldContainer.children);

    // 隐藏原有 screen
    oldScreen.classList.remove('active');
    oldScreen.style.display = 'none';

    // 创建新的全屏容器
    cleanScreenEl = document.createElement('div');
    cleanScreenEl.id = 'clean-api-settings-screen';

    // Header
    const header = document.createElement('div');
    header.className = 'cas-header';
    header.innerHTML = '<span class="cas-back">\u2039</span>' +
      '<span class="cas-title">\u8BBE\u7F6E</span>' +
      '<span class="cas-save">\u5B8C\u6210</span>';
    cleanScreenEl.appendChild(header);

    header.querySelector('.cas-back').addEventListener('click', closeClean);
    header.querySelector('.cas-save').addEventListener('click', () => {
      const saveBtn = document.getElementById('save-api-settings-btn');
      if (saveBtn) saveBtn.click();
      closeClean();
    });

    // Tab 栏
    const tabBar = document.createElement('div');
    tabBar.className = 'cas-tabs';
    cleanScreenEl.appendChild(tabBar);

    // 内容区
    const body = document.createElement('div');
    body.className = 'cas-body';
    cleanScreenEl.appendChild(body);

    // 收集原有 settings-container 中的所有直接子元素
    // 包括 settings-header, settings-section, settings-desc, p 等
    const allChildren = Array.from(oldContainer.children);

    // 按 settings-header 分组：每个 header 后面跟着的 section/desc 归为一组
    const groups = buildGroups(allChildren);

    // 将分组归类到 Tab
    const tabPanels = buildTabs(groups);

    tabPanels.forEach((panel, idx) => {
      const tab = document.createElement('div');
      tab.className = 'cas-tab' + (idx === 0 ? ' active' : '');
      tab.textContent = panel.label;
      tab.dataset.tabId = panel.id;
      tab.addEventListener('click', () => switchTab(panel.id));
      tabBar.appendChild(tab);

      const panelEl = document.createElement('div');
      panelEl.className = 'cas-panel' + (idx === 0 ? ' active' : '');
      panelEl.id = 'cas-panel-' + panel.id;

      const inner = document.createElement('div');
      inner.className = 'settings-container';
      panel.elements.forEach(el => inner.appendChild(el));
      panelEl.appendChild(inner);
      body.appendChild(panelEl);
    });

    document.body.appendChild(cleanScreenEl);
  }

  // 将 settings-container 的子元素按 settings-header 分组
  // 返回 [{header: '标题文本', headerEl: el|null, elements: [el, ...]}, ...]
  function buildGroups(allChildren) {
    const groups = [];
    let current = { header: '', headerEl: null, elements: [] };

    allChildren.forEach(el => {
      if (el.classList && el.classList.contains('settings-header')) {
        // 遇到新 header，保存当前组（如果有内容），开始新组
        if (current.elements.length > 0 || current.headerEl) {
          groups.push(current);
        }
        current = { header: el.textContent.trim(), headerEl: el, elements: [] };
      } else {
        current.elements.push(el);
      }
    });
    // 最后一组
    if (current.elements.length > 0 || current.headerEl) {
      groups.push(current);
    }
    return groups;
  }

  // 将分组归类到 Tab
  function buildTabs(groups) {
    const tabs = [];
    const used = new Set();

    function takeGroup(g) {
      if (g && !used.has(g)) {
        used.add(g);
        return g;
      }
      return null;
    }

    // 收集各组的元素（包括 headerEl）
    function collectElements(groupList) {
      const els = [];
      groupList.forEach(g => {
        if (g.headerEl) els.push(g.headerEl);
        g.elements.forEach(el => els.push(el));
      });
      return els;
    }

    // 用 data-lang-key 匹配（最可靠，不受语言切换影响）
    function findByKey(key) {
      return groups.find(g => !used.has(g) && g.headerEl && g.headerEl.getAttribute('data-lang-key') === key);
    }
    // 用原始文本匹配（没有 data-lang-key 的 header）
    function findByText(text) {
      return groups.find(g => !used.has(g) && g.header.includes(text));
    }
    // 按索引取（第 N 个 group）
    function findByIndex(idx) {
      return groups[idx] && !used.has(groups[idx]) ? groups[idx] : null;
    }

    // 第一个无 header 的组（语言设置），放到系统 Tab
    const langGroup = groups.find(g => !g.headerEl && g.elements.length > 0);

    // === Tab 1: API（配置预设 + 主API + 参数设置/温度） ===
    var g;
    const apiGroups = [];
    g = takeGroup(findByKey('apiPresetManagement'));  // 配置预设
    if (g) apiGroups.push(g);
    g = takeGroup(findByKey('apiPrimarySettings'));   // 主 API (对话)
    if (g) apiGroups.push(g);
    g = takeGroup(findByText('参数设置'));              // 参数设置（温度）
    if (g) apiGroups.push(g);
    if (apiGroups.length) {
      tabs.push({ id: 'api', label: 'API', elements: collectElements(apiGroups) });
    }

    // === Tab 2: AI行为（副API + 后台活动API + 识图API + 后台活动 + AI行为控制） ===
    const aiGroups = [];
    g = takeGroup(findByKey('apiSecondarySettings'));  // 副 API
    if (g) aiGroups.push(g);
    g = takeGroup(findByKey('apiBackgroundSettings')); // 后台活动 API 设置
    if (g) aiGroups.push(g);
    g = takeGroup(findByKey('apiVisionSettings'));     // 识图 API 设置
    if (g) aiGroups.push(g);
    g = takeGroup(findByKey('apiBgActivitySettings')); // 后台活动
    if (g) aiGroups.push(g);
    g = takeGroup(findByText('AI行为控制'));             // AI行为控制
    if (g) aiGroups.push(g);
    if (aiGroups.length) {
      tabs.push({ id: 'ai', label: 'AI行为', elements: collectElements(aiGroups) });
    }

    // === Tab 3: 服务（TTS + 图像生成 + 云服务） ===
    const serviceGroups = [];
    g = takeGroup(findByKey('apiTtsSettings'));        // Minimax TTS 语音
    if (g) serviceGroups.push(g);
    g = takeGroup(findByKey('apiImageGenSettings'));   // 图像生成
    if (g) serviceGroups.push(g);
    g = takeGroup(findByText('云服务'));                 // 云服务与存储
    if (g) serviceGroups.push(g);
    if (serviceGroups.length) {
      tabs.push({ id: 'service', label: '服务', elements: collectElements(serviceGroups) });
    }

    // === Tab 4: 通知（后台保活 + 系统级通知） ===
    const notifyGroups = [];
    g = takeGroup(findByText('后台保活'));
    if (g) notifyGroups.push(g);
    g = takeGroup(findByText('系统级通知'));
    if (g) notifyGroups.push(g);
    if (notifyGroups.length) {
      tabs.push({ id: 'notify', label: '通知', elements: collectElements(notifyGroups) });
    }

    // === Tab 5: 系统（语言 + 调试 + 性能 + 截图水印 + 提示词 + 更新） ===
    const sysGroups = [];
    g = takeGroup(langGroup);
    if (g) sysGroups.push(g);
    g = takeGroup(findByText('调试工具'));
    if (g) sysGroups.push(g);
    g = takeGroup(findByText('性能'));
    if (g) sysGroups.push(g);
    g = takeGroup(findByText('截图水印'));
    if (g) sysGroups.push(g);
    g = takeGroup(findByText('提示词管理'));
    if (g) sysGroups.push(g);
    g = takeGroup(findByText('应用更新'));
    if (g) sysGroups.push(g);
    if (sysGroups.length) {
      tabs.push({ id: 'system', label: '系统', elements: collectElements(sysGroups) });
    }

    // === Tab 6: 数据（数据管理 + 许愿反馈） ===
    const dataGroups = [];
    g = takeGroup(findByText('数据管理'));
    if (g) dataGroups.push(g);
    g = takeGroup(findByText('许愿'));
    if (g) dataGroups.push(g);
    if (dataGroups.length) {
      tabs.push({ id: 'data', label: '数据', elements: collectElements(dataGroups) });
    }

    // 收集剩余未分配的
    const remaining = groups.filter(g => !used.has(g));
    if (remaining.length) {
      tabs.push({ id: 'other', label: '其他', elements: collectElements(remaining) });
    }

    return tabs.filter(t => t.elements.length > 0);
  }

  function switchTab(tabId) {
    if (!cleanScreenEl) return;
    cleanScreenEl.querySelectorAll('.cas-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tabId === tabId);
    });
    cleanScreenEl.querySelectorAll('.cas-panel').forEach(p => {
      p.classList.toggle('active', p.id === 'cas-panel-' + tabId);
    });
  }

  function closeClean() {
    restoreElements();
    if (cleanScreenEl) {
      cleanScreenEl.remove();
      cleanScreenEl = null;
    }
    const oldScreen = document.getElementById('api-settings-screen');
    if (oldScreen) oldScreen.style.display = '';
    showScreen('home-screen');
  }

  function restoreElements() {
    const oldContainer = document.querySelector('#api-settings-screen .settings-container');
    if (!oldContainer || !cleanScreenEl) return;

    // 按原始顺序还原所有子元素
    originalOrder.forEach(el => {
      oldContainer.appendChild(el);
    });
  }

  window.openCleanApiSettings = openCleanApiSettings;
  window.closeCleanApiSettings = closeClean;
})();
