// API设置页面可拖动助手
class HelperAssistant {
  constructor() {
    this.imageUrl = 'https://i.postimg.cc/nryMr5SQ/retouch-2026020222230989.png';
    this.discordHelpUrl = 'https://discord.com/channels/1379304008157499423/1443544486796853248';
    this.discordDmUrl = 'https://discord.com/users/1353222930875551804';
    this.storageKey = 'helper_assistant_position';
    this.hiddenStorageKey = 'helper_assistant_hidden';
    this.isDragging = false;
    this.currentX = 0;
    this.currentY = 0;
    this.initialX = 0;
    this.initialY = 0;
    this.xOffset = 0;
    this.yOffset = 0;
    this.menuVisible = false;
  }

  // 初始化
  init() {
    // 监听页面切换
    const observer = new MutationObserver(() => {
      this.checkAndShow();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });

    // 初始检查
    setTimeout(() => {
      this.checkAndShow();
    }, 500);
  }

  // 检查是否在API设置页面
  isApiSettingsPage() {
    const apiSettingsScreen = document.getElementById('api-settings-screen');
    return apiSettingsScreen && apiSettingsScreen.classList.contains('active');
  }

  // 检查并显示/隐藏助手
  checkAndShow() {
    const existingAssistant = document.getElementById('helper-assistant');
    const existingWakeBtn = document.getElementById('helper-wake-btn');
    const isHidden = this.isAssistantHidden();
    
    if (this.isApiSettingsPage()) {
      if (isHidden) {
        // 隐藏小人，显示唤起按钮
        if (existingAssistant) {
          existingAssistant.remove();
        }
        if (!existingWakeBtn) {
          this.createWakeButton();
        }
      } else {
        // 显示小人，隐藏唤起按钮
        if (!existingAssistant) {
          this.createAssistant();
        }
        if (existingWakeBtn) {
          existingWakeBtn.remove();
        }
      }
    } else {
      // 不在API设置页面，移除所有元素
      if (existingAssistant) {
        existingAssistant.remove();
      }
      if (existingWakeBtn) {
        existingWakeBtn.remove();
      }
    }
  }

  // 创建助手元素
  createAssistant() {
    const assistant = document.createElement('div');
    assistant.id = 'helper-assistant';
    assistant.className = 'helper-assistant';
    
    // 加载保存的位置
    const savedPosition = this.loadPosition();
    if (savedPosition) {
      this.xOffset = savedPosition.x;
      this.yOffset = savedPosition.y;
    } else {
      // 默认位置：右下角
      this.xOffset = window.innerWidth - 120;
      this.yOffset = window.innerHeight - 120;
    }

    assistant.innerHTML = `
      <img src="${this.imageUrl}" class="helper-image" draggable="false">
      <div class="helper-menu" id="helper-menu">
        <div class="helper-menu-item" data-action="help">
          <span class="helper-menu-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
          </span>
          <span class="helper-menu-text">新手解答区</span>
        </div>
        <div class="helper-menu-item" data-action="dm">
          <span class="helper-menu-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
          </span>
          <span class="helper-menu-text">私信作者</span>
        </div>
        <div class="helper-menu-item helper-menu-disabled">
          <span class="helper-menu-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </span>
          <span class="helper-menu-text">下次更新</span>
        </div>
        <div class="helper-menu-item" data-action="hide">
          <span class="helper-menu-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
          </span>
          <span class="helper-menu-text">隐藏</span>
        </div>
      </div>
    `;

    document.body.appendChild(assistant);

    this.setTranslate(this.xOffset, this.yOffset, assistant);
    this.bindEvents(assistant);
  }

  // 绑定事件
  bindEvents(element) {
    const image = element.querySelector('.helper-image');
    const menu = element.querySelector('.helper-menu');
    const menuItems = element.querySelectorAll('.helper-menu-item:not(.helper-menu-disabled)');

    // 图片点击事件
    image.addEventListener('click', (e) => {
      if (!this.isDragging) {
        this.toggleMenu();
      }
      e.stopPropagation();
    });

    // 菜单项点击事件
    menuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const action = item.getAttribute('data-action');
        this.handleMenuAction(action);
        e.stopPropagation();
      });
    });

    // 拖动事件
    image.addEventListener('mousedown', (e) => this.dragStart(e));
    image.addEventListener('touchstart', (e) => this.dragStart(e), { passive: false });

    document.addEventListener('mousemove', (e) => this.drag(e));
    document.addEventListener('touchmove', (e) => this.drag(e), { passive: false });

    document.addEventListener('mouseup', (e) => this.dragEnd(e));
    document.addEventListener('touchend', (e) => this.dragEnd(e));

    // 点击页面其他地方关闭菜单
    document.addEventListener('click', () => {
      if (this.menuVisible) {
        this.hideMenu();
      }
    });

    menu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // 拖动开始
  dragStart(e) {
    const element = document.getElementById('helper-assistant');
    
    if (e.type === 'touchstart') {
      this.initialX = e.touches[0].clientX - this.xOffset;
      this.initialY = e.touches[0].clientY - this.yOffset;
    } else {
      this.initialX = e.clientX - this.xOffset;
      this.initialY = e.clientY - this.yOffset;
    }

    this.isDragging = true;
    element.style.cursor = 'grabbing';
  }

  // 拖动中
  drag(e) {
    if (this.isDragging) {
      e.preventDefault();
      
      const element = document.getElementById('helper-assistant');
      
      if (e.type === 'touchmove') {
        this.currentX = e.touches[0].clientX - this.initialX;
        this.currentY = e.touches[0].clientY - this.initialY;
      } else {
        this.currentX = e.clientX - this.initialX;
        this.currentY = e.clientY - this.initialY;
      }

      this.xOffset = this.currentX;
      this.yOffset = this.currentY;

      this.setTranslate(this.currentX, this.currentY, element);
    }
  }

  // 拖动结束
  dragEnd(e) {
    if (this.isDragging) {
      this.initialX = this.currentX;
      this.initialY = this.currentY;
      this.isDragging = false;

      const element = document.getElementById('helper-assistant');
      element.style.cursor = 'grab';

      // 保存位置
      this.savePosition(this.xOffset, this.yOffset);
    }
  }

  // 设置位置
  setTranslate(xPos, yPos, el) {
    el.style.transform = `translate(${xPos}px, ${yPos}px)`;
  }

  // 切换菜单显示
  toggleMenu() {
    if (this.menuVisible) {
      this.hideMenu();
    } else {
      this.showMenu();
    }
  }

  // 显示菜单
  showMenu() {
    const menu = document.getElementById('helper-menu');
    if (menu) {
      menu.classList.add('show');
      this.menuVisible = true;
    }
  }

  // 隐藏菜单
  hideMenu() {
    const menu = document.getElementById('helper-menu');
    if (menu) {
      menu.classList.remove('show');
      this.menuVisible = false;
    }
  }

  // 处理菜单操作
  handleMenuAction(action) {
    this.hideMenu();

    switch (action) {
      case 'help':
        window.open(this.discordHelpUrl, '_blank');
        break;
      case 'dm':
        window.open(this.discordDmUrl, '_blank');
        break;
      case 'hide':
        this.hideAssistant();
        break;
      default:
        break;
    }
  }

  // 保存位置到localStorage
  savePosition(x, y) {
    localStorage.setItem(this.storageKey, JSON.stringify({ x, y }));
  }

  // 从localStorage加载位置
  loadPosition() {
    const saved = localStorage.getItem(this.storageKey);
    return saved ? JSON.parse(saved) : null;
  }

  // 检查助手是否被隐藏（默认不隐藏）
  isAssistantHidden() {
    const hiddenState = localStorage.getItem(this.hiddenStorageKey);
    // 如果没有设置过，默认为false（不隐藏）
    if (hiddenState === null) {
      return false;
    }
    return hiddenState === 'true';
  }

  // 隐藏助手
  hideAssistant() {
    localStorage.setItem(this.hiddenStorageKey, 'true');
    const assistant = document.getElementById('helper-assistant');
    if (assistant) {
      assistant.remove();
    }
    this.createWakeButton();
  }

  // 显示助手
  showAssistant() {
    localStorage.setItem(this.hiddenStorageKey, 'false');
    const wakeBtn = document.getElementById('helper-wake-btn');
    if (wakeBtn) {
      wakeBtn.remove();
    }
    this.createAssistant();
  }

  // 创建唤起按钮
  createWakeButton() {
    // 避免重复创建
    if (document.getElementById('helper-wake-btn')) {
      return;
    }

    // 找到"初始化所有内容"按钮
    const factoryResetBtn = document.getElementById('factory-reset-btn');
    if (!factoryResetBtn) {
      return;
    }

    const wakeBtn = document.createElement('button');
    wakeBtn.id = 'helper-wake-btn';
    wakeBtn.className = 'settings-full-btn';
    wakeBtn.textContent = '唤起小人';
    
    wakeBtn.addEventListener('click', () => {
      this.showAssistant();
    });

    // 在"初始化所有内容"按钮后面插入
    factoryResetBtn.parentNode.insertBefore(wakeBtn, factoryResetBtn.nextSibling);
  }
}

// 添加样式
const style = document.createElement('style');
style.textContent = `
  .helper-assistant {
    position: fixed;
    top: 0;
    left: 0;
    width: auto;
    height: auto;
    z-index: 9999;
    cursor: grab;
    user-select: none;
  }

  .helper-assistant:active {
    cursor: grabbing;
  }

  .helper-image {
    display: block;
    width: 80px;
    height: auto;
    filter: drop-shadow(1px 2px 3px rgba(0,0,0,0.1));
    pointer-events: auto;
  }

  .helper-menu {
    position: absolute;
    bottom: 100%;
    left: 50%;
    margin-bottom: 15px;
    transform: translateX(-50%) scale(0);
    background: #ffffff;
    border: 2px solid #FFB7C5;
    border-radius: 20px;
    padding: 10px;
    box-shadow: 0 4px 15px rgba(255, 183, 197, 0.3);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: none;
    min-width: 160px;
  }

  .helper-menu.show {
    transform: translateX(-50%) scale(1);
    opacity: 1;
    pointer-events: auto;
  }

  .helper-menu::after {
    content: '';
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%) rotate(45deg);
    width: 12px;
    height: 12px;
    background: #ffffff;
    border-right: 2px solid #FFB7C5;
    border-bottom: 2px solid #FFB7C5;
  }

  .helper-menu-item {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
    gap: 10px;
    color: #444;
  }

  .helper-menu-item:hover {
    background-color: #FFF0F5;
    color: #FF69B4;
    transform: translateX(2px);
  }

  .helper-menu-item.helper-menu-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .helper-menu-item.helper-menu-disabled:hover {
    background-color: transparent;
    color: #999;
    transform: none;
  }

  .helper-menu-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #FFB7C5;
    transition: color 0.2s;
  }

  .helper-menu-item:hover .helper-menu-icon {
    color: #FF69B4;
  }

  .helper-menu-text {
    font-size: 14px;
    font-weight: 500;
  }

  .helper-menu-item.helper-menu-disabled .helper-menu-text {
    color: #999;
  }

  /* 暗黑模式适配 */
  @media (prefers-color-scheme: dark) {
    .helper-menu {
      background: #2D2D2D;
      border-color: #FFB7C5;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    }

    .helper-menu::after {
      background: #2D2D2D;
      border-right: 2px solid #FFB7C5;
      border-bottom: 2px solid #FFB7C5;
    }

    .helper-menu-item {
      color: #e0e0e0;
    }

    .helper-menu-item:hover {
      background-color: rgba(255, 183, 197, 0.15);
      color: #FFB7C5;
    }

    .helper-menu-item.helper-menu-disabled .helper-menu-text {
      color: #666;
    }
  }
`;
document.head.appendChild(style);

// 创建实例并初始化
const helperAssistant = new HelperAssistant();
helperAssistant.init();
