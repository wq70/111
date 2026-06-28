// 更新弹窗管理器
class UpdateNotification {
  constructor() {
    this.storageKey = 'update_notification_dismissed';
    this.currentVersion = '0.0.35'; // 当前更新版本号
    this.countdownSeconds = 5;
    this.countdownInterval = null;
  }

  // 检查是否应该显示弹窗
  shouldShow() {
    const dismissedVersion = localStorage.getItem(this.storageKey);
    // 如果没有记录或者记录的版本不是当前版本，则显示弹窗
    return !dismissedVersion || dismissedVersion !== this.currentVersion;
  }

  // 创建弹窗HTML
  createNotificationHTML() {
    const updateContent = `
      <div style="margin-bottom: 15px;"><button id="update-clear-global-css-btn" style="width: 100%; padding: 10px; background: #ff4d4f; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">🧹 清除全局自定义CSS (防错位)</button></div>
      <div class="update-item important-note">新手必看：DC解答区 <a href="https://discord.com/channels/1379304008157499423/1443544486796853248" target="_blank" style="color: #4A9EFF;">点击前往</a></div>
      <div class="update-item important-note">强烈建议：安装到主屏幕以获得最佳体验</div>
      <div class="update-item important-note">注意：首次打开最好使用魔法</div>
      <div class="update-item tips">有任何问题请通过DC私信联系 <a href="https://discord.com/users/1353222930875551804" target="_blank" style="color: #4A9EFF;">点击前往</a>，其他渠道可能无法及时回复</div>
      <div class="update-divider">本次更新内容</div>
      <div class="update-item">1. 新增绿江可以导出TXT</div>
      <div class="update-item">2. 删除作者追更这个功能</div>
      <div class="update-item">3. 新增豆瓣可以选择绑定USER人设</div>
      <div class="update-item">4. 新增豆瓣可以选择绑定世界书</div>
      <div class="update-item">5. 优化豆瓣生成报错的功能</div>
      <div class="update-item">6. 优化了一下豆瓣如果生图失败会恢复默认头像，新增USER可以设置自己的头像/昵称</div>
      <div class="update-item">7. 新增豆瓣可以增量生成/新增豆瓣可以删除</div>
      <div class="update-item">8. 新增导出记录可以为TXT和HTML，HTML主要用于观赏</div>
      <div class="update-item">9. 新增美化没保存的时候切换或者覆盖会显示提醒弹窗</div>
      <div class="update-item">10. 新增优化群聊双语可以选择</div>
      <div class="update-item">11. 优化查找聊天记录过多转跳不过去的BUG，现在可以实时转跳了，点击按钮可以回到最新</div>
      <div class="update-item" style="color: #ff4757; font-weight: bold; background: #ffeaa7; padding: 5px; border-radius: 4px; line-height: 1.4;">12. 新增思维链，感谢 <a href="https://discord.com/channels/1291925535324110879/1436589419074424882" target="_blank" style="color: #0984e3; text-decoration: underline;">老师们的指导</a>，思维链功能灵感来源1900老师，感谢授权。默认预设是330老师写在提示词里面的思维链，我提取出来做成符合当前版本的了。</div>
    `;

    return `
      <div id="update-notification-overlay">
        <div id="update-notification-modal">
          <img src="https://i.postimg.cc/hGh6rJ5r/retouch-2026013121094970.png" class="update-decoration-img">
          <div class="update-notification-header">
            <div class="update-title">6.27更新</div>
          </div>
          
          <div class="update-notification-body">
            <div class="update-content">
              ${updateContent}
            </div>
          </div>
          
          <div class="update-notification-footer">
            <button id="update-btn-got-it" class="update-btn update-btn-primary" disabled>
              我知道了 (<span id="countdown">${this.countdownSeconds}</span>s)
            </button>
            <button id="update-btn-dont-show" class="update-btn update-btn-secondary" disabled>
              下次不要提示
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // 开始倒计时
  startCountdown() {
    let timeLeft = this.countdownSeconds;
    const countdownElement = document.getElementById('countdown');
    const btnGotIt = document.getElementById('update-btn-got-it');
    const btnDontShow = document.getElementById('update-btn-dont-show');

    this.countdownInterval = setInterval(() => {
      timeLeft--;
      if (countdownElement) {
        countdownElement.textContent = timeLeft;
      }

      if (timeLeft <= 0) {
        clearInterval(this.countdownInterval);
        // 启用按钮
        if (btnGotIt) {
          btnGotIt.disabled = false;
          btnGotIt.innerHTML = '我知道了';
          btnGotIt.classList.add('enabled');
        }
        if (btnDontShow) {
          btnDontShow.disabled = false;
          btnDontShow.classList.add('enabled');
        }
      }
    }, 1000);
  }

  // 关闭弹窗
  closeNotification() {
    const overlay = document.getElementById('update-notification-overlay');
    if (overlay) {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.remove();
      }, 300);
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  // 点击"我知道了"
  handleGotIt() {
    // 不保存任何内容，下次刷新还会显示
    this.closeNotification();
  }

  // 点击"下次不要提示"
  handleDontShow() {
    // 保存当前版本号，下次不再显示
    localStorage.setItem(this.storageKey, this.currentVersion);
    this.closeNotification();
  }

  // 绑定事件
  bindEvents() {
    const btnGotIt = document.getElementById('update-btn-got-it');
    const btnDontShow = document.getElementById('update-btn-dont-show');

    if (btnGotIt) {
      btnGotIt.addEventListener('click', () => {
        if (!btnGotIt.disabled) {
          this.handleGotIt();
        }
      });
    }

    if (btnDontShow) {
      btnDontShow.addEventListener('click', () => {
        if (!btnDontShow.disabled) {
          this.handleDontShow();
        }
      });
    }

    // 清除全局 CSS 按钮事件
    const clearCssBtn = document.getElementById('update-clear-global-css-btn');
    if (clearCssBtn) {
      clearCssBtn.addEventListener('click', () => {
        // 1. 更新内存状态
        if (window.state && window.state.globalSettings) {
          window.state.globalSettings.globalCss = '';
          // 2. 更新数据库
          if (window.db && window.db.globalSettings) {
            window.db.globalSettings.put({ id: 1, ...window.state.globalSettings }).catch(console.error);
          }
        }
        // 3. 更新输入框（如果存在）
        const globalCssInput = document.getElementById('global-css-input');
        if (globalCssInput) globalCssInput.value = '';
        // 4. 清除页面上的样式标签
        const styleEl = document.getElementById('global-custom-style');
        if (styleEl) styleEl.textContent = '';
        
        // 5. 调用 applyGlobalCss 确保应用空样式
        if (typeof window.applyGlobalCss === 'function') {
          window.applyGlobalCss('');
        }
        
        // 6. 重新渲染聊天消息 (如果有激活的聊天)，确保气泡等恢复默认
        if (window.state && window.state.activeChatId && typeof window.renderMessages === 'function') {
            const chat = window.state.chats[window.state.activeChatId];
            if (chat) window.renderMessages(chat);
        }

        clearCssBtn.textContent = '✅ 已清除全局CSS';
        clearCssBtn.style.background = '#52c41a';
      });
    }

    // 防止点击弹窗内容时关闭
    const modal = document.getElementById('update-notification-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // 🎯 紧急跳过功能：连续点击3次屏幕跳过弹窗
    this.setupEmergencySkip();
  }

  // 紧急跳过功能实现
  setupEmergencySkip() {
    const overlay = document.getElementById('update-notification-overlay');
    if (!overlay) return;

    let clickCount = 0;
    let clickTimer = null;

    overlay.addEventListener('click', (e) => {
      // 只在点击遮罩层时触发（不是点击弹窗内容）
      if (e.target !== overlay) return;

      clickCount++;

      // 清除之前的定时器
      if (clickTimer) {
        clearTimeout(clickTimer);
      }

      // 如果2秒内点击3次，触发跳过
      if (clickCount >= 3) {
        console.log('[UpdateNotification] 检测到紧急跳过手势');
        this.emergencySkip();
        clickCount = 0;
        return;
      }

      // 2秒后重置计数
      clickTimer = setTimeout(() => {
        clickCount = 0;
      }, 2000);
    });
  }

  // 紧急跳过方法
  emergencySkip() {
    // 显示跳过提示（可选）
    const modal = document.getElementById('update-notification-modal');
    if (modal) {
      const skipHint = document.createElement('div');
      skipHint.textContent = '已跳过更新通知';
      skipHint.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(255, 184, 197, 0.95);
        color: white;
        padding: 12px 24px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10;
        animation: skipHintAnim 0.4s ease;
      `;
      modal.appendChild(skipHint);

      // 添加动画样式
      if (!document.querySelector('#skip-hint-style')) {
        const style = document.createElement('style');
        style.id = 'skip-hint-style';
        style.textContent = `
          @keyframes skipHintAnim {
            from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
            to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          }
        `;
        document.head.appendChild(style);
      }
    }

    // 0.5秒后关闭弹窗
    setTimeout(() => {
      this.closeNotification();
    }, 500);
  }

  // 显示弹窗
  show() {
    if (!this.shouldShow()) {
      return;
    }

    // 创建弹窗
    const notificationHTML = this.createNotificationHTML();
    document.body.insertAdjacentHTML('beforeend', notificationHTML);

    // 绑定事件
    this.bindEvents();

    // 开始倒计时
    this.startCountdown();

    // 添加显示动画
    setTimeout(() => {
      const overlay = document.getElementById('update-notification-overlay');
      if (overlay) {
        overlay.classList.add('show');
      }
    }, 100);
  }

  // 初始化
  init() {
    // 等待DOM加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.show();
      });
    } else {
      this.show();
    }
  }
}

// 创建实例并初始化
const updateNotification = new UpdateNotification();
updateNotification.init();
