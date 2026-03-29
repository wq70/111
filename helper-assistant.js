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
    // 如果已有旧的 observer，先断开
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new MutationObserver(() => {
      this.checkAndShow();
    });

    this.observer.observe(document.body, {
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
        <div class="helper-menu-item" data-action="declaration">
          <span class="helper-menu-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </span>
          <span class="helper-menu-text">声明</span>
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

    // ★ 具名引用，存到 this 上，方便移除
    this._onMouseMove = (e) => this.drag(e);
    this._onTouchMove = (e) => this.drag(e);
    this._onMouseUp = (e) => this.dragEnd(e);
    this._onTouchEnd = (e) => this.dragEnd(e);
    this._onDocClick = () => { if (this.menuVisible) this.hideMenu(); };

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('touchmove', this._onTouchMove, { passive: false });
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('touchend', this._onTouchEnd);
    document.addEventListener('click', this._onDocClick);

    menu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  unbindEvents() {
    if (this._onMouseMove) {
      document.removeEventListener('mousemove', this._onMouseMove);
      document.removeEventListener('touchmove', this._onTouchMove);
      document.removeEventListener('mouseup', this._onMouseUp);
      document.removeEventListener('touchend', this._onTouchEnd);
      document.removeEventListener('click', this._onDocClick);
      this._onMouseMove = null;
      this._onTouchMove = null;
      this._onMouseUp = null;
      this._onTouchEnd = null;
      this._onDocClick = null;
    }
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
      case 'declaration':
        this.showDeclaration();
        break;
      case 'hide':
        this.hideAssistant();
        break;
      default:
        break;
    }
  }

  // 显示声明弹窗
  showDeclaration() {
    // 检查是否已存在弹窗
    if (document.getElementById('declaration-modal-overlay')) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'declaration-modal-overlay';
    overlay.innerHTML = `
      <div class="declaration-modal">
        <div class="declaration-header">
          <h2>项目声明</h2>
          <button class="declaration-close-btn" onclick="this.closest('#declaration-modal-overlay').remove()">×</button>
        </div>
        <div class="declaration-content">
          <div class="declaration-section">
            <h3>📜 版权说明</h3>
            <p>本项目由EE老师原创，后经JCY老师、KUKU老师、330老师等多位老师共同改版发展。</p>
            <p>本人在各位老师的基础上进行了进一步的调整。</p>
            <p style="font-size: 13px; color: #999; margin-top: 10px;">（可能还有其他贡献者未能一一列出，在此一并致谢）</p>
          </div>
          
          <div class="declaration-section">
            <h3>⚠️ 免责声明</h3>
            <p>本项目中涉及的所有音乐、影视等内容的版权归原作者所有。</p>
            <p>本项目仅供学习交流使用，不得用于商业用途。</p>
            <p>使用本项目产生的任何法律责任由使用者自行承担，与开发者无关。</p>
          </div>
          
          <div class="declaration-section">
            <h3>🔒 隐私声明</h3>
            <p>本项目不会收集、存储或传播任何用户的个人信息。</p>
            <p>所有数据均存储在用户本地浏览器中。</p>
          </div>
          
          <div class="declaration-footer">
            <p>感谢所有为本项目做出贡献的老师们！</p>
            <p style="margin-top: 10px; font-size: 12px; color: #999;">最后更新：2026年2月</p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // 添加动画
    setTimeout(() => {
      overlay.classList.add('show');
    }, 10);

    // 点击遮罩层关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
      }
    });
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
    // ★ 断开 MutationObserver
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    // ★ 移除 document 级事件监听器
    this.unbindEvents();
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
    // ★ 重新启动观察
    if (!this.observer) {
      this.init();
    }
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

  /* 声明弹窗样式 */
  #declaration-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  #declaration-modal-overlay.show {
    opacity: 1;
  }

  .declaration-modal {
    background: white;
    border-radius: 20px;
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    transform: scale(0.9);
    transition: transform 0.3s ease;
  }

  #declaration-modal-overlay.show .declaration-modal {
    transform: scale(1);
  }

  .declaration-header {
    background: linear-gradient(135deg, #FFB7C5 0%, #FF9AA2 100%);
    padding: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: white;
  }

  .declaration-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }

  .declaration-close-btn {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    font-size: 28px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    line-height: 1;
  }

  .declaration-close-btn:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: rotate(90deg);
  }

  .declaration-content {
    padding: 25px;
    overflow-y: auto;
    max-height: calc(80vh - 80px);
  }

  .declaration-section {
    margin-bottom: 25px;
  }

  .declaration-section:last-child {
    margin-bottom: 0;
  }

  .declaration-section h3 {
    color: #FF69B4;
    font-size: 16px;
    margin: 0 0 12px 0;
    font-weight: 600;
  }

  .declaration-section p {
    color: #555;
    line-height: 1.6;
    margin: 8px 0;
    font-size: 14px;
  }

  .declaration-section ul {
    margin: 10px 0;
    padding-left: 20px;
  }

  .declaration-section li {
    color: #555;
    line-height: 1.8;
    margin: 5px 0;
    font-size: 14px;
  }

  .declaration-section li strong {
    color: #FF69B4;
  }

  .declaration-footer {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #f0f0f0;
    text-align: center;
  }

  .declaration-footer p {
    color: #FF69B4;
    font-weight: 500;
    margin: 5px 0;
  }

  /* 暗黑模式适配 - 声明弹窗 */
  @media (prefers-color-scheme: dark) {
    .declaration-modal {
      background: #2D2D2D;
    }

    .declaration-section p,
    .declaration-section li {
      color: #e0e0e0;
    }

    .declaration-footer {
      border-top-color: #444;
    }
  }
`;
document.head.appendChild(style);

// 创建实例并初始化
const helperAssistant = new HelperAssistant();
helperAssistant.init();
