// ============================================================
// floating-ball.js - 悬浮球核心逻辑
// ============================================================

(function() {
  'use strict';

  // 悬浮球状态
  let floatingBallState = {
    enabled: false,     // 总开关（默认关闭）
    visible: true,      // 当前是否可见
    position: { x: 20, y: 100 },  // 位置
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    menuOpen: false,
    submenuOpen: false,
    // 样式配置
    style: {
      type: 'default', // 'default', 'image', 'custom-css'
      imageUrl: '',
      customHTML: '',
      customCSS: ''
    }
  };

  // 三击唤起相关
  let tapCount = 0;
  let tapTimer = null;

  // DOM 元素
  let ballEl = null;
  let menuEl = null;
  let submenuEl = null;

  // 初始化
  function initFloatingBall() {
    // 从全局设置和 localStorage 读取状态
    loadState();

    // 如果未启用，直接返回
    if (!floatingBallState.enabled) {
      console.log('悬浮球未启用');
      return;
    }

    // 创建 DOM
    createFloatingBallDOM();

    // 绑定事件
    bindEvents();

    // 显示悬浮球
    if (floatingBallState.visible) {
      showBall();
    } else {
      // 隐藏状态，监听三击
      enableTripleTap();
    }
  }

  // 加载状态
  function loadState() {
    // 优先从 state.globalSettings 读取总开关
    if (typeof state !== 'undefined' && state.globalSettings) {
      floatingBallState.enabled = state.globalSettings.floatingBallEnabled === true;
    }
    
    // 从 localStorage 读取位置和可见性
    const saved = localStorage.getItem('floating-ball-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // 只读取位置和可见性，不读取 enabled（由全局设置控制）
        if (parsed.position) floatingBallState.position = parsed.position;
        if (parsed.visible !== undefined) floatingBallState.visible = parsed.visible;
        if (parsed.style) floatingBallState.style = { ...floatingBallState.style, ...parsed.style };
      } catch (e) {
        console.error('Failed to parse floating ball state:', e);
      }
    }
  }

  // 保存状态
  function saveState() {
    // 只保存位置和可见性到 localStorage
    // enabled 由 state.globalSettings 管理
    const stateToSave = {
      position: floatingBallState.position,
      visible: floatingBallState.visible,
      style: floatingBallState.style
    };
    localStorage.setItem('floating-ball-state', JSON.stringify(stateToSave));
  }

  // 创建 DOM
  function createFloatingBallDOM() {
    // 悬浮球
    ballEl = document.createElement('div');
    ballEl.id = 'floating-ball';
    ballEl.className = floatingBallState.visible ? '' : 'hidden';
    
    // 根据样式类型设置内容
    if (floatingBallState.style.type === 'image' && floatingBallState.style.imageUrl) {
      ballEl.innerHTML = `<img src="${floatingBallState.style.imageUrl}" alt="悬浮球" class="fb-custom-image">`;
    } else if (floatingBallState.style.type === 'custom-css' && floatingBallState.style.customHTML) {
      ballEl.innerHTML = floatingBallState.style.customHTML;
    } else {
      ballEl.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="4" y1="6" x2="20" y2="6"></line>
          <line x1="4" y1="12" x2="20" y2="12"></line>
          <line x1="4" y1="18" x2="20" y2="18"></line>
        </svg>
      `;
    }
    
    ballEl.style.left = floatingBallState.position.x + 'px';
    ballEl.style.top = floatingBallState.position.y + 'px';
    
    // 应用自定义CSS
    if (floatingBallState.style.type === 'custom-css' && floatingBallState.style.customCSS) {
      applyCustomCSS(floatingBallState.style.customCSS);
    }
    
    document.body.appendChild(ballEl);

    // 菜单
    menuEl = document.createElement('div');
    menuEl.id = 'floating-ball-menu';
    menuEl.innerHTML = `
      <div class="fb-menu-item" data-action="switch-api">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
        </svg>
        <span>切换API预设</span>
      </div>
      <div class="fb-menu-item" data-action="apply-template">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <span>应用设置模板</span>
      </div>
      <div class="fb-menu-item" data-action="role-api">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M12 1v6m0 6v6m5.2-13.2l-4.2 4.2m0 6l4.2 4.2M23 12h-6m-6 0H1m18.2 5.2l-4.2-4.2m0-6l4.2-4.2"></path>
        </svg>
        <span>角色API配置</span>
      </div>
      <div class="fb-menu-item" data-action="style-settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
        </svg>
        <span>样式设置</span>
      </div>
      <div class="fb-menu-divider"></div>
      <div class="fb-menu-item" data-action="hide">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
        <span>隐藏悬浮球</span>
      </div>
      <div class="fb-menu-item danger" data-action="close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        <span>关闭悬浮球</span>
      </div>
    `;
    document.body.appendChild(menuEl);

    // 子菜单
    submenuEl = document.createElement('div');
    submenuEl.id = 'floating-ball-submenu';
    document.body.appendChild(submenuEl);
  }

  // 绑定事件
  function bindEvents() {
    // 悬浮球拖动
    let longPressTimer = null;
    let hasMoved = false;

    ballEl.addEventListener('mousedown', handleMouseDown);
    ballEl.addEventListener('touchstart', handleTouchStart, { passive: false });

    function handleMouseDown(e) {
      e.preventDefault();
      hasMoved = false;
      
      longPressTimer = setTimeout(() => {
        startDrag(e.clientX, e.clientY);
      }, 200);

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    function handleTouchStart(e) {
      e.preventDefault();
      hasMoved = false;
      const touch = e.touches[0];
      
      longPressTimer = setTimeout(() => {
        startDrag(touch.clientX, touch.clientY);
      }, 200);

      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
    }

    function startDrag(x, y) {
      floatingBallState.isDragging = true;
      floatingBallState.dragStart = {
        x: x - floatingBallState.position.x,
        y: y - floatingBallState.position.y
      };
      ballEl.classList.add('dragging');
    }

    function handleMouseMove(e) {
      if (floatingBallState.isDragging) {
        hasMoved = true;
        moveBall(e.clientX, e.clientY);
      }
    }

    function handleTouchMove(e) {
      if (floatingBallState.isDragging) {
        e.preventDefault();
        hasMoved = true;
        const touch = e.touches[0];
        moveBall(touch.clientX, touch.clientY);
      }
    }

    function moveBall(x, y) {
      floatingBallState.position.x = x - floatingBallState.dragStart.x;
      floatingBallState.position.y = y - floatingBallState.dragStart.y;
      
      // 限制在屏幕内
      const maxX = window.innerWidth - 50;
      const maxY = window.innerHeight - 50;
      floatingBallState.position.x = Math.max(0, Math.min(maxX, floatingBallState.position.x));
      floatingBallState.position.y = Math.max(0, Math.min(maxY, floatingBallState.position.y));
      
      ballEl.style.left = floatingBallState.position.x + 'px';
      ballEl.style.top = floatingBallState.position.y + 'px';
    }

    function handleMouseUp() {
      clearTimeout(longPressTimer);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      if (floatingBallState.isDragging) {
        endDrag();
      } else if (!hasMoved) {
        // 点击事件
        toggleMenu();
      }
    }

    function handleTouchEnd() {
      clearTimeout(longPressTimer);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      
      if (floatingBallState.isDragging) {
        endDrag();
      } else if (!hasMoved) {
        // 点击事件
        toggleMenu();
      }
    }

    function endDrag() {
      floatingBallState.isDragging = false;
      ballEl.classList.remove('dragging');
      
      // 保存当前位置（不再强制吸附到边缘）
      saveState();
    }

    // 菜单项点击
    menuEl.addEventListener('click', (e) => {
      const item = e.target.closest('.fb-menu-item');
      if (!item) return;
      
      const action = item.dataset.action;
      handleMenuAction(action);
    });

    // 全局点击事件，用于点击外部收起菜单
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick, { passive: true });
  }

  function handleOutsideClick(e) {
    if (!floatingBallState.menuOpen && !floatingBallState.submenuOpen) return;
    
    // 检查点击区域是否在相关元素内
    if (ballEl && ballEl.contains(e.target)) return;
    if (menuEl && menuEl.contains(e.target)) return;
    if (submenuEl && submenuEl.contains(e.target)) return;
    
    // 如果有各种配置面板（如样式面板等），不处理
    if (e.target.closest('.role-api-panel') || e.target.closest('.fb-style-panel')) return;
    
    // 如果点击了外部，完全关闭
    if (floatingBallState.submenuOpen) {
      floatingBallState.submenuOpen = false;
      submenuEl.classList.remove('show');
    }
    
    if (floatingBallState.menuOpen) {
      closeMenu();
    }
  }

  // 显示悬浮球
  function showBall() {
    floatingBallState.visible = true;
    ballEl.classList.remove('hidden');
    saveState();
    disableTripleTap();
  }

  // 隐藏悬浮球
  function hideBall() {
    floatingBallState.visible = false;
    ballEl.classList.add('hidden');
    closeMenu();
    saveState();
    enableTripleTap();
    
    if (typeof showToast === 'function') {
      showToast('悬浮球已隐藏，三击屏幕可唤起');
    }
  }

  // 关闭悬浮球功能
  function closeBall() {
    floatingBallState.enabled = false;
    
    // 同步更新全局设置
    if (typeof state !== 'undefined' && state.globalSettings) {
      state.globalSettings.floatingBallEnabled = false;
    }
    
    // 同步更新API设置中的开关状态
    const floatingBallSwitch = document.getElementById('floating-ball-switch');
    if (floatingBallSwitch) {
      floatingBallSwitch.checked = false;
    }
    
    ballEl.remove();
    menuEl.remove();
    submenuEl.remove();
    saveState();
    disableTripleTap();
    
    if (typeof showToast === 'function') {
      showToast('悬浮球已关闭，可在设置中重新开启');
    }
  }

  // 切换菜单
  function toggleMenu() {
    if (floatingBallState.menuOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  // 打开菜单
  function openMenu() {
    floatingBallState.menuOpen = true;
    
    // 先临时显示菜单以获取真实尺寸（但保持透明）
    menuEl.style.visibility = 'hidden';
    menuEl.style.display = 'block';
    
    const ballRect = ballEl.getBoundingClientRect();
    const menuWidth = menuEl.offsetWidth || 200;
    const menuHeight = menuEl.offsetHeight;
    
    // 恢复显示状态
    menuEl.style.visibility = '';
    menuEl.style.display = '';
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 10;
    
    let left, top;
    
    // 计算水平位置
    if (ballRect.left < viewportWidth / 2) {
      // 悬浮球在左侧，菜单向右展开
      left = ballRect.right + padding;
      // 如果右侧空间不够，调整到左侧
      if (left + menuWidth + padding > viewportWidth) {
        left = ballRect.left - menuWidth - padding;
      }
    } else {
      // 悬浮球在右侧，菜单向左展开
      left = ballRect.left - menuWidth - padding;
      // 如果左侧空间不够，调整到右侧
      if (left < padding) {
        left = ballRect.right + padding;
      }
    }
    
    // 确保水平方向不超出屏幕
    left = Math.max(padding, Math.min(left, viewportWidth - menuWidth - padding));
    
    // 计算垂直位置
    // 优先与悬浮球顶部对齐
    top = ballRect.top;
    
    // 如果菜单会超出底部，向上调整
    if (top + menuHeight + padding > viewportHeight) {
      top = viewportHeight - menuHeight - padding;
    }
    
    // 确保不超出顶部
    top = Math.max(padding, top);
    
    menuEl.style.left = left + 'px';
    menuEl.style.top = top + 'px';
    menuEl.classList.add('show');
  }

  // 关闭菜单
  function closeMenu() {
    floatingBallState.menuOpen = false;
    menuEl.classList.remove('show');
  }

  // 打开子菜单
  function openSubmenu(type) {
    floatingBallState.submenuOpen = true;
    
    // 先关闭主菜单
    menuEl.classList.remove('show');
    
    if (type === 'api') {
      renderApiSubmenu();
    } else if (type === 'template') {
      renderTemplateSubmenu();
    }
    
    // 先临时显示子菜单以获取真实尺寸
    submenuEl.style.visibility = 'hidden';
    submenuEl.style.display = 'block';
    
    // 使用悬浮球的位置而不是菜单的位置
    const ballRect = ballEl.getBoundingClientRect();
    const submenuWidth = submenuEl.offsetWidth || 220;
    const submenuHeight = submenuEl.offsetHeight;
    
    // 恢复显示状态
    submenuEl.style.visibility = '';
    submenuEl.style.display = '';
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 10;
    
    let left, top;
    
    // 计算水平位置（基于悬浮球）
    if (ballRect.left < viewportWidth / 2) {
      // 悬浮球在左侧，子菜单在右侧
      left = ballRect.right + padding;
      // 如果右侧空间不够，调整到左侧
      if (left + submenuWidth + padding > viewportWidth) {
        left = ballRect.left - submenuWidth - padding;
      }
    } else {
      // 悬浮球在右侧，子菜单在左侧
      left = ballRect.left - submenuWidth - padding;
      // 如果左侧空间不够，调整到右侧
      if (left < padding) {
        left = ballRect.right + padding;
      }
    }
    
    // 确保水平方向不超出屏幕
    left = Math.max(padding, Math.min(left, viewportWidth - submenuWidth - padding));
    
    // 计算垂直位置（基于悬浮球）
    top = ballRect.top;
    
    // 如果子菜单会超出底部，向上调整
    if (top + submenuHeight + padding > viewportHeight) {
      top = viewportHeight - submenuHeight - padding;
    }
    
    // 确保不超出顶部
    top = Math.max(padding, top);
    
    submenuEl.style.left = left + 'px';
    submenuEl.style.top = top + 'px';
    submenuEl.classList.add('show');
  }

  // 关闭子菜单
  function closeSubmenu() {
    floatingBallState.submenuOpen = false;
    submenuEl.classList.remove('show');
    // 关闭子菜单时重新打开主菜单
    openMenu();
  }

  // 渲染 API 预设子菜单
  async function renderApiSubmenu() {
    const presets = await db.apiPresets.toArray();
    const currentConfig = state.apiConfig;
    
    // 查找当前匹配的预设
    let currentPresetId = null;
    for (const preset of presets) {
      if (
        preset.proxyUrl === currentConfig.proxyUrl &&
        preset.apiKey === currentConfig.apiKey &&
        preset.model === currentConfig.model
      ) {
        currentPresetId = preset.id;
        break;
      }
    }
    
    let html = `
      <div class="fb-submenu-header">
        <div class="fb-submenu-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          返回
        </div>
      </div>
    `;
    
    // 当前配置
    html += `
      <div class="fb-submenu-item ${currentPresetId === null ? 'active' : ''}" data-preset-id="current">
        <div class="radio"></div>
        <span>当前配置 (未保存)</span>
      </div>
    `;
    
    // 预设列表
    presets.forEach(preset => {
      html += `
        <div class="fb-submenu-item ${preset.id === currentPresetId ? 'active' : ''}" data-preset-id="${preset.id}">
          <div class="radio"></div>
          <span>${preset.name}</span>
        </div>
      `;
    });
    
    // 保存按钮
    html += `
      <div class="fb-submenu-add">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        保存当前配置
      </div>
    `;
    
    submenuEl.innerHTML = html;
    
    // 绑定事件
    submenuEl.querySelector('.fb-submenu-back').addEventListener('click', closeSubmenu);
    
    submenuEl.querySelectorAll('.fb-submenu-item').forEach(item => {
      item.addEventListener('click', async () => {
        const presetId = item.dataset.presetId;
        if (presetId === 'current') return;
        
        await switchApiPreset(parseInt(presetId));
        closeSubmenu();
        closeMenu();
      });
    });
    
    submenuEl.querySelector('.fb-submenu-add').addEventListener('click', async () => {
      await saveCurrentApiPreset();
      renderApiSubmenu(); // 刷新列表
    });
  }

  // 渲染设置模板子菜单
  async function renderTemplateSubmenu() {
    const presets = await db.chatSettingsPresets.toArray();
    
    let html = `
      <div class="fb-submenu-header">
        <div class="fb-submenu-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          返回
        </div>
      </div>
    `;
    
    if (presets.length === 0) {
      html += `
        <div class="fb-submenu-item" style="justify-content: center; color: #999; cursor: default;">
          <span>暂无模板</span>
        </div>
        <div style="padding: 20px; text-align: center; color: #888; font-size: 13px; line-height: 1.6;">
          <p style="margin: 0 0 8px 0;">💡 设置模板可以保存：</p>
          <p style="margin: 0; text-align: left;">• 回复条数、后台活动等功能设置<br>• 记忆模式、自动总结等记忆配置<br>• 主题、字体等外观设置</p>
          <p style="margin: 12px 0 0 0; color: #999; font-size: 12px;">不包括：名字、头像、人设等身份信息</p>
        </div>
      `;
    } else {
      // 模板列表
      presets.forEach(preset => {
        const description = preset.description || '无描述';
        html += `
          <div class="fb-submenu-item fb-template-item" data-preset-id="${preset.id}">
            <div class="fb-template-content">
              <div class="fb-template-name">${preset.name}</div>
              <div class="fb-template-desc">${description}</div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="fb-template-arrow">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        `;
      });
    }
    
    // 保存按钮
    html += `
      <div class="fb-submenu-add">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        保存当前设置
      </div>
    `;
    
    submenuEl.innerHTML = html;
    
    // 绑定事件
    submenuEl.querySelector('.fb-submenu-back').addEventListener('click', closeSubmenu);
    
    submenuEl.querySelectorAll('.fb-template-item[data-preset-id]').forEach(item => {
      item.addEventListener('click', async () => {
        const presetId = parseInt(item.dataset.presetId);
        await applyTemplate(presetId);
        closeSubmenu();
        closeMenu();
      });
    });
    
    submenuEl.querySelector('.fb-submenu-add').addEventListener('click', async () => {
      await saveCurrentTemplate();
      renderTemplateSubmenu(); // 刷新列表
    });
  }

  // 应用设置模板
  async function applyTemplate(presetId) {
    if (typeof applyChatSettingsPreset === 'function') {
      await applyChatSettingsPreset(presetId);
    } else {
      if (typeof showToast === 'function') {
        showToast('功能未加载，请刷新页面');
      }
    }
  }

  // 保存当前设置为模板
  async function saveCurrentTemplate() {
    const name = await showCustomPrompt('保存设置模板', '请输入模板名称');
    if (!name || !name.trim()) return;
    
    if (typeof saveCurrentChatSettingsAsPreset === 'function') {
      await saveCurrentChatSettingsAsPreset(name);
    } else {
      if (typeof showToast === 'function') {
        showToast('功能未加载，请刷新页面');
      }
    }
  }

  // 切换 API 预设
  async function switchApiPreset(presetId) {
    const preset = await db.apiPresets.get(presetId);
    if (!preset) return;
    
    // 加载预设
    state.apiConfig = {
      id: 'main',
      embeddingConfig: state.apiConfig.embeddingConfig,
      ...window.ttsProvider.apiFields({ ...state.apiConfig, ...preset }),
      proxyUrl: preset.proxyUrl,
      apiKey: preset.apiKey,
      model: preset.model,
      secondaryProxyUrl: preset.secondaryProxyUrl,
      secondaryApiKey: preset.secondaryApiKey,
      secondaryModel: preset.secondaryModel,
      backgroundProxyUrl: preset.backgroundProxyUrl,
      backgroundApiKey: preset.backgroundApiKey,
      backgroundModel: preset.backgroundModel,
      visionProxyUrl: preset.visionProxyUrl,
      visionApiKey: preset.visionApiKey,
      visionModel: preset.visionModel,
      couplespaceProxyUrl: preset.couplespaceProxyUrl,
      couplespaceApiKey: preset.couplespaceApiKey,
      couplespaceModel: preset.couplespaceModel,
      minimaxGroupId: preset.minimaxGroupId,
      minimaxApiKey: preset.minimaxApiKey,
      minimaxModel: preset.minimaxModel
    };
    
    await db.apiConfig.put(state.apiConfig);
    
    if (typeof showToast === 'function') {
      showToast(`已切换到：${preset.name}`);
    }
  }

  // 保存当前 API 配置为预设
  async function saveCurrentApiPreset() {
    const name = await showCustomPrompt('保存 API 预设', '请输入预设名称');
    if (!name || !name.trim()) return;
    
    const presetData = {
      name: name.trim(),
      proxyUrl: state.apiConfig.proxyUrl || '',
      apiKey: state.apiConfig.apiKey || '',
      model: state.apiConfig.model || '',
      secondaryProxyUrl: state.apiConfig.secondaryProxyUrl || '',
      secondaryApiKey: state.apiConfig.secondaryApiKey || '',
      secondaryModel: state.apiConfig.secondaryModel || '',
      backgroundProxyUrl: state.apiConfig.backgroundProxyUrl || '',
      backgroundApiKey: state.apiConfig.backgroundApiKey || '',
      backgroundModel: state.apiConfig.backgroundModel || '',
      visionProxyUrl: state.apiConfig.visionProxyUrl || '',
      visionApiKey: state.apiConfig.visionApiKey || '',
      visionModel: state.apiConfig.visionModel || '',
      couplespaceProxyUrl: state.apiConfig.couplespaceProxyUrl || '',
      couplespaceApiKey: state.apiConfig.couplespaceApiKey || '',
      couplespaceModel: state.apiConfig.couplespaceModel || '',
      ...window.ttsProvider.apiFields(state.apiConfig),
      minimaxGroupId: state.apiConfig.minimaxGroupId || '',
      minimaxApiKey: state.apiConfig.minimaxApiKey || '',
      minimaxModel: state.apiConfig.minimaxModel || 'speech-01'
    };
    
    const existingPreset = await db.apiPresets.where('name').equals(presetData.name).first();
    if (existingPreset) {
      const confirmed = await showCustomConfirm('覆盖预设', `名为 "${presetData.name}" 的预设已存在。要覆盖它吗？`, {
        confirmButtonClass: 'btn-danger'
      });
      if (!confirmed) return;
      presetData.id = existingPreset.id;
    }
    
    await db.apiPresets.put(presetData);
    
    if (typeof showToast === 'function') {
      showToast('API 预设已保存');
    }
  }

  // 处理菜单操作
  function handleMenuAction(action) {
    switch (action) {
      case 'switch-api':
        openSubmenu('api');
        break;
      case 'apply-template':
        openSubmenu('template');
        break;
      case 'role-api':
        closeMenu(); // 关闭菜单
        openRoleApiConfig();
        break;
      case 'style-settings':
        closeMenu(); // 关闭菜单
        openStyleSettings();
        break;
      case 'hide':
        hideBall();
        break;
      case 'close':
        closeBall();
        break;
    }
  }

  // 打开角色API配置面板
  function openRoleApiConfig() {
    const chatId = state.activeChatId;
    if (!chatId) {
      if (typeof showToast === 'function') {
        showToast('请先打开一个聊天');
      }
      return;
    }
    
    const chat = state.chats[chatId];
    if (!chat) return;
    
    // 创建配置面板
    const panel = document.createElement('div');
    panel.id = 'role-api-config-panel';
    panel.className = 'role-api-panel';
    panel.innerHTML = `
      <div class="role-api-content">
        <div class="role-api-header">
          <span class="role-api-back">‹</span>
          <span class="role-api-title">${chat.name} - API配置</span>
          <span class="role-api-save">保存</span>
        </div>
        <div class="role-api-body">
          <div class="role-api-section">
            <div class="role-api-switch-item">
              <div class="role-api-switch-left">
                <div class="role-api-switch-label">使用独立API配置</div>
                <div class="role-api-switch-desc">开启后，此角色将使用独立的API配置，不受全局设置影响</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="role-api-enable">
                <span class="slider"></span>
              </label>
            </div>
          </div>
          
          <div id="role-api-details" style="display: none;">
            <div class="role-api-section">
              <div class="role-api-field">
                <label class="role-api-label">反代地址</label>
                <input type="text" id="role-api-proxy" class="role-api-input" placeholder="https://api.openai.com/v1">
              </div>
              
              <div class="role-api-field">
                <label class="role-api-label">API Key</label>
                <input type="password" id="role-api-key" class="role-api-input" placeholder="sk-...">
              </div>
              
              <div class="role-api-field">
                <label class="role-api-label">模型</label>
                <div class="role-api-model-row">
                  <select id="role-api-model-select" class="role-api-select">
                    <option value="">选择模型</option>
                  </select>
                  <button id="role-api-fetch-models" class="role-api-fetch-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="23 4 23 10 17 10"></polyline>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    拉取
                  </button>
                </div>
                <input type="text" id="role-api-model-input" class="role-api-input" placeholder="或手动输入模型名称" style="margin-top: 8px;">
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(panel);
    
    // 回显数据
    const apiOverride = chat.apiOverride || {};
    document.getElementById('role-api-enable').checked = apiOverride.enabled || false;
    document.getElementById('role-api-proxy').value = apiOverride.proxyUrl || '';
    document.getElementById('role-api-key').value = apiOverride.apiKey || '';
    document.getElementById('role-api-model-input').value = apiOverride.model || '';
    
    const detailsDiv = document.getElementById('role-api-details');
    detailsDiv.style.display = apiOverride.enabled ? 'block' : 'none';
    
    // 绑定事件
    document.getElementById('role-api-enable').addEventListener('change', function() {
      detailsDiv.style.display = this.checked ? 'block' : 'none';
    });
    
    // 拉取模型列表
    document.getElementById('role-api-fetch-models').addEventListener('click', async function() {
      const btn = this;
      const proxyUrl = document.getElementById('role-api-proxy').value.trim();
      const apiKey = document.getElementById('role-api-key').value.trim();
      
      if (!proxyUrl || !apiKey) {
        if (typeof showToast === 'function') {
          showToast('请先填写反代地址和API Key');
        }
        return;
      }
      
      btn.disabled = true;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        拉取中...
      `;
      
      try {
        const response = await fetch(`${proxyUrl}/models`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const select = document.getElementById('role-api-model-select');
        select.innerHTML = '<option value="">选择模型</option>';
        
        if (data.data && Array.isArray(data.data)) {
          data.data.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.id;
            select.appendChild(option);
          });
          
          if (typeof showToast === 'function') {
            showToast(`成功拉取 ${data.data.length} 个模型`);
          }
        }
      } catch (error) {
        console.error('拉取模型失败:', error);
        if (typeof showToast === 'function') {
          showToast('拉取模型失败: ' + error.message);
        }
      } finally {
        btn.disabled = false;
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          拉取
        `;
      }
    });
    
    // 下拉框选择时同步到输入框
    document.getElementById('role-api-model-select').addEventListener('change', function() {
      if (this.value) {
        document.getElementById('role-api-model-input').value = this.value;
      }
    });
    
    panel.querySelector('.role-api-back').addEventListener('click', () => {
      panel.remove();
      openMenu(); // 返回时重新打开菜单
    });
    
    panel.querySelector('.role-api-save').addEventListener('click', async () => {
      await saveRoleApiConfig(chatId);
      panel.remove();
      openMenu(); // 保存后重新打开菜单
    });
    
    // 点击面板外关闭
    panel.addEventListener('click', (e) => {
      if (e.target === panel) {
        panel.remove();
        openMenu(); // 关闭后重新打开菜单
      }
    });
  }

  // 保存角色API配置
  async function saveRoleApiConfig(chatId) {
    const chat = state.chats[chatId];
    if (!chat) return;
    
    const enabled = document.getElementById('role-api-enable').checked;
    
    if (!chat.apiOverride) {
      chat.apiOverride = {};
    }
    
    chat.apiOverride.enabled = enabled;
    chat.apiOverride.proxyUrl = document.getElementById('role-api-proxy').value.trim();
    chat.apiOverride.apiKey = document.getElementById('role-api-key').value.trim();
    
    // 优先使用手动输入的模型名称
    const modelInput = document.getElementById('role-api-model-input').value.trim();
    const modelSelect = document.getElementById('role-api-model-select').value;
    chat.apiOverride.model = modelInput || modelSelect;
    
    await db.chats.put(chat);
    
    if (typeof showToast === 'function') {
      showToast(enabled ? '已启用独立API配置' : '已关闭独立API配置');
    }
  }

  // 启用三击唤起
  function enableTripleTap() {
    document.addEventListener('click', handleTripleTap);
  }

  // 禁用三击唤起
  function disableTripleTap() {
    document.removeEventListener('click', handleTripleTap);
    tapCount = 0;
    if (tapTimer) clearTimeout(tapTimer);
  }

  // 处理三击
  function handleTripleTap(e) {
    // 忽略在输入框、按钮等元素上的点击
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA') {
      return;
    }
    
    tapCount++;
    
    // 显示涟漪效果
    showTapRipple(e.clientX, e.clientY);
    
    if (tapCount === 1) {
      tapTimer = setTimeout(() => {
        tapCount = 0;
      }, 500);
    }
    
    if (tapCount === 3) {
      clearTimeout(tapTimer);
      tapCount = 0;
      showBall();
      
      if (typeof showToast === 'function') {
        showToast('悬浮球已唤起');
      }
    }
  }

  // 显示涟漪效果
  function showTapRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.className = 'tap-ripple';
    ripple.style.left = (x - 20) + 'px';
    ripple.style.top = (y - 20) + 'px';
    document.body.appendChild(ripple);
    
    setTimeout(() => {
      ripple.remove();
    }, 400);
  }

  // ========== 样式设置功能 ==========
  
  // 获取默认CSS模板
  function getDefaultCSS() {
    return `position: fixed;
width: 50px;
height: 50px;
border-radius: 50%;
background: var(--accent-color, #007aff);
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
display: flex;
align-items: center;
justify-content: center;
cursor: pointer;
z-index: 9999;
transition: opacity 0.3s, transform 0.3s;
opacity: 0.9;
user-select: none;
-webkit-user-select: none;
touch-action: none;`;
  }
  
  // 获取默认HTML模板
  function getDefaultHTML() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="4" y1="6" x2="20" y2="6"></line>
  <line x1="4" y1="12" x2="20" y2="12"></line>
  <line x1="4" y1="18" x2="20" y2="18"></line>
</svg>`;
  }
  
  // 打开样式设置面板
  function openStyleSettings() {
    
    const panel = document.createElement('div');
    panel.className = 'fb-style-panel';
    panel.innerHTML = `
      <div class="fb-style-content">
        <div class="fb-style-header">
          <span class="fb-style-back">‹</span>
          <span class="fb-style-title">悬浮球样式</span>
          <span class="fb-style-save">完成</span>
        </div>
        <div class="fb-style-body">
          <!-- 样式类型选择 -->
          <div class="fb-style-section">
            <div class="fb-style-label">样式类型</div>
            <div class="fb-style-tabs">
              <div class="fb-style-tab ${floatingBallState.style.type === 'default' ? 'active' : ''}" data-type="default">默认</div>
              <div class="fb-style-tab ${floatingBallState.style.type === 'image' ? 'active' : ''}" data-type="image">图片</div>
              <div class="fb-style-tab ${floatingBallState.style.type === 'custom-css' ? 'active' : ''}" data-type="custom-css">自定义</div>
            </div>
          </div>
          
          <!-- 默认样式 -->
          <div class="fb-style-panel-content ${floatingBallState.style.type === 'default' ? 'active' : ''}" data-panel="default">
            <div class="fb-style-section">
              <div class="fb-style-desc">使用默认的悬浮球样式（蓝色圆形，白色三条杠图标）</div>
            </div>
          </div>
          
          <!-- 图片样式 -->
          <div class="fb-style-panel-content ${floatingBallState.style.type === 'image' ? 'active' : ''}" data-panel="image">
            <div class="fb-style-section">
              <div class="fb-style-label">图片来源</div>
              <div class="fb-style-field">
                <input type="text" class="fb-style-input" id="fb-image-url" placeholder="输入图片URL（支持GIF动图）" value="${floatingBallState.style.imageUrl || ''}">
              </div>
              <div class="fb-style-upload-group">
                <label class="fb-style-upload-btn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <span>本地上传</span>
                  <input type="file" id="fb-image-file" accept="image/*,.gif" style="display:none;">
                </label>
                <button class="fb-style-preview-btn" id="fb-preview-image">预览</button>
                <button class="fb-style-reset-btn" id="fb-reset-image">重置</button>
              </div>
              <div class="fb-style-desc">上传图片完全替换悬浮球外观。例如上传猫咪图片，悬浮球就变成猫咪。支持 PNG、JPG、GIF 动图，建议尺寸 100x100px</div>
            </div>
          </div>
          
          <!-- 自定义CSS -->
          <div class="fb-style-panel-content ${floatingBallState.style.type === 'custom-css' ? 'active' : ''}" data-panel="custom-css">
            <div class="fb-style-section">
              <div class="fb-style-label">HTML结构（悬浮球内容）</div>
              <textarea class="fb-style-textarea fb-style-textarea-small" id="fb-custom-html" placeholder="输入HTML代码">${floatingBallState.style.customHTML || getDefaultHTML()}</textarea>
              <div class="fb-style-desc">修改悬浮球内部的HTML内容，可以改成任何图标、文字、Emoji或图片</div>
            </div>
            
            <div class="fb-style-section">
              <div class="fb-style-label">CSS样式（悬浮球外观）</div>
              <textarea class="fb-style-textarea" id="fb-custom-css" placeholder="输入CSS代码">${floatingBallState.style.customCSS || getDefaultCSS()}</textarea>
              <div class="fb-style-button-group">
                <button class="fb-style-action-btn" id="fb-export-css">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  导出
                </button>
                <button class="fb-style-action-btn" id="fb-import-css">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  导入
                </button>
                <button class="fb-style-action-btn" id="fb-preview-css">预览</button>
                <button class="fb-style-action-btn" id="fb-reset-css">重置</button>
              </div>
              <div class="fb-style-desc">
                <strong>提示：</strong>可以复制HTML和CSS代码，然后问AI："帮我把这个悬浮球改成🍎苹果的样子"
                <br><strong>CSS作用于：</strong>#floating-ball（悬浮球容器）
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(panel);
    
    // 绑定事件
    bindStylePanelEvents(panel);
  }
  
  // 绑定样式面板事件
  function bindStylePanelEvents(panel) {
    // 返回按钮
    panel.querySelector('.fb-style-back').addEventListener('click', () => {
      panel.remove();
      openMenu(); // 返回时重新打开菜单
    });
    
    // 完成按钮
    panel.querySelector('.fb-style-save').addEventListener('click', () => {
      saveStyleSettings(panel);
      panel.remove();
      openMenu(); // 保存后重新打开菜单
    });
    
    // 样式类型切换
    panel.querySelectorAll('.fb-style-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const type = tab.dataset.type;
        panel.querySelectorAll('.fb-style-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        panel.querySelectorAll('.fb-style-panel-content').forEach(p => p.classList.remove('active'));
        panel.querySelector(`[data-panel="${type}"]`).classList.add('active');
      });
    });
    
    // 本地上传
    const fileInput = panel.querySelector('#fb-image-file');
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          panel.querySelector('#fb-image-url').value = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
    
    // 预览图片
    panel.querySelector('#fb-preview-image').addEventListener('click', () => {
      const url = panel.querySelector('#fb-image-url').value.trim();
      if (url) {
        previewImageStyle(url);
      } else {
        if (typeof showToast === 'function') {
          showToast('请先输入或上传图片');
        }
      }
    });
    
    // 重置图片
    panel.querySelector('#fb-reset-image').addEventListener('click', () => {
      panel.querySelector('#fb-image-url').value = '';
      if (typeof showToast === 'function') {
        showToast('已清空图片设置');
      }
    });
    
    // 预览CSS
    panel.querySelector('#fb-preview-css').addEventListener('click', () => {
      const css = panel.querySelector('#fb-custom-css').value.trim();
      previewCustomCSS(css);
    });
    
    // 重置CSS
    panel.querySelector('#fb-reset-css').addEventListener('click', () => {
      panel.querySelector('#fb-custom-html').value = getDefaultHTML();
      panel.querySelector('#fb-custom-css').value = getDefaultCSS();
      if (typeof showToast === 'function') {
        showToast('已重置为默认模板');
      }
    });
    
    // 导出CSS
    panel.querySelector('#fb-export-css').addEventListener('click', () => {
      const html = panel.querySelector('#fb-custom-html').value.trim();
      const css = panel.querySelector('#fb-custom-css').value.trim();
      
      if (!html && !css) {
        if (typeof showToast === 'function') {
          showToast('没有可导出的内容');
        }
        return;
      }
      
      const content = `/* 悬浮球自定义样式 */\n\n/* HTML结构 */\n/*\n${html}\n*/\n\n/* CSS样式 */\n${css}`;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'floating-ball-custom.txt';
      a.click();
      URL.revokeObjectURL(url);
      
      if (typeof showToast === 'function') {
        showToast('样式已导出');
      }
    });
    
    // 导入CSS
    panel.querySelector('#fb-import-css').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.css,text/plain,text/css';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const content = event.target.result;
            
            // 尝试解析HTML和CSS
            const htmlMatch = content.match(/\/\*\s*HTML结构\s*\*\/\s*\/\*\s*([\s\S]*?)\s*\*\//);
            const cssMatch = content.match(/\/\*\s*CSS样式\s*\*\/\s*([\s\S]*)/);
            
            if (htmlMatch && htmlMatch[1]) {
              panel.querySelector('#fb-custom-html').value = htmlMatch[1].trim();
            }
            
            if (cssMatch && cssMatch[1]) {
              panel.querySelector('#fb-custom-css').value = cssMatch[1].trim();
            } else {
              // 如果没有找到标记，就把整个内容当作CSS
              panel.querySelector('#fb-custom-css').value = content;
            }
            
            if (typeof showToast === 'function') {
              showToast('样式已导入');
            }
          };
          reader.readAsText(file);
        }
      };
      input.click();
    });
  }
  
  // 保存样式设置
  function saveStyleSettings(panel) {
    const activeTab = panel.querySelector('.fb-style-tab.active');
    const type = activeTab.dataset.type;
    
    floatingBallState.style.type = type;
    
    if (type === 'image') {
      floatingBallState.style.imageUrl = panel.querySelector('#fb-image-url').value.trim();
    } else if (type === 'custom-css') {
      floatingBallState.style.customHTML = panel.querySelector('#fb-custom-html').value.trim();
      floatingBallState.style.customCSS = panel.querySelector('#fb-custom-css').value.trim();
    }
    
    saveState();
    applyStyle();
    
    if (typeof showToast === 'function') {
      showToast('样式已保存');
    }
  }
  
  // 应用样式
  function applyStyle() {
    if (!ballEl) return;
    
    // 清除之前的自定义样式
    removeCustomCSS();
    
    if (floatingBallState.style.type === 'image' && floatingBallState.style.imageUrl) {
      ballEl.innerHTML = `<img src="${floatingBallState.style.imageUrl}" alt="悬浮球" class="fb-custom-image">`;
    } else if (floatingBallState.style.type === 'custom-css') {
      if (floatingBallState.style.customHTML) {
        ballEl.innerHTML = floatingBallState.style.customHTML;
      } else {
        ballEl.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="6" x2="20" y2="6"></line>
            <line x1="4" y1="12" x2="20" y2="12"></line>
            <line x1="4" y1="18" x2="20" y2="18"></line>
          </svg>
        `;
      }
      if (floatingBallState.style.customCSS) {
        applyCustomCSS(floatingBallState.style.customCSS);
      }
    } else {
      ballEl.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="4" y1="6" x2="20" y2="6"></line>
          <line x1="4" y1="12" x2="20" y2="12"></line>
          <line x1="4" y1="18" x2="20" y2="18"></line>
        </svg>
      `;
    }
  }
  
  // 应用自定义CSS
  function applyCustomCSS(css) {
    removeCustomCSS();
    
    const styleEl = document.createElement('style');
    styleEl.id = 'fb-custom-style';
    styleEl.textContent = `#floating-ball { ${css} }`;
    document.head.appendChild(styleEl);
  }
  
  // 移除自定义CSS
  function removeCustomCSS() {
    const existingStyle = document.getElementById('fb-custom-style');
    if (existingStyle) {
      existingStyle.remove();
    }
  }
  
  // 预览图片样式
  function previewImageStyle(url) {
    if (!ballEl) return;
    
    const tempImg = new Image();
    tempImg.onload = () => {
      ballEl.innerHTML = `<img src="${url}" alt="悬浮球" class="fb-custom-image">`;
      if (typeof showToast === 'function') {
        showToast('预览已应用，点击完成保存');
      }
    };
    tempImg.onerror = () => {
      if (typeof showToast === 'function') {
        showToast('图片加载失败，请检查URL');
      }
    };
    tempImg.src = url;
  }
  
  // 预览自定义CSS
  function previewCustomCSS(css) {
    if (!ballEl) return;
    
    const html = document.querySelector('#fb-custom-html')?.value.trim();
    
    if (html) {
      ballEl.innerHTML = html;
    }
    
    removeCustomCSS();
    if (css) {
      applyCustomCSS(css);
    }
    
    if (typeof showToast === 'function') {
      showToast('预览已应用，点击完成保存');
    }
  }

  // 暴露全局方法
  window.initFloatingBall = initFloatingBall;
  window.toggleFloatingBall = function(enabled) {
    if (enabled && !floatingBallState.enabled) {
      floatingBallState.enabled = true;
      
      // 同步更新全局设置
      if (typeof state !== 'undefined' && state.globalSettings) {
        state.globalSettings.floatingBallEnabled = true;
      }
      
      saveState();
      
      // 直接初始化，不需要刷新页面
      initFloatingBall();
    } else if (!enabled && floatingBallState.enabled) {
      closeBall();
    }
  };

})();
