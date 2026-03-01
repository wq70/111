// 更新弹窗管理器
class UpdateNotification {
  constructor() {
    this.storageKey = 'update_notification_dismissed';
    this.currentVersion = '0.0.28'; // 当前更新版本号
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
      <div class="update-item important-note">新手必看：DC解答区 <a href="https://discord.com/channels/1379304008157499423/1443544486796853248" target="_blank" style="color: #4A9EFF;">点击前往</a></div>
      <div class="update-item important-note">强烈建议：安装到主屏幕以获得最佳体验</div>
      <div class="update-item important-note">注意：首次打开最好使用魔法</div>
      <div class="update-item tips">有任何问题请通过DC私信联系 <a href="https://discord.com/users/1353222930875551804" target="_blank" style="color: #4A9EFF;">点击前往</a>，其他渠道可能无法及时回复</div>
      <div class="update-divider">本次更新内容</div>
      <div class="update-item">1.修复群聊幻觉拦截问题</div>
      <div class="update-item">2.新增旁观群聊可以选择角色是否记得用户，降低用户被艾特的风险</div>
      <div class="update-item">3.修复追更老失败的BUG，包括勾选了追更无法创建的BUG，哦对了现在绿江有很多文风了张爱玲、冰心、林语堂、巴金等等那些，可以尝试一下，都好好吃</div>
      <div class="update-item">4.新增绿江可以看到读者评论了！谁说生活没有观众！（不喜欢的可以不用打开，这个是默认关闭的）</div>
      <div class="update-item">5.修复群聊没有表情包匹配，MYPHONE我的APP使用记录重复的问题</div>
      <div class="update-item">6.修复长期记忆修改读取数量后TOKEN没有变化的情况</div>
      <div class="update-item">7.新增真心话（群聊版）</div>
      <div class="update-item">8.优化了小组件部分</div>
      <div class="update-divider">遇到页面卡住、无法操作？</div>
      <div class="update-item tips" style="margin-bottom: 6px;">可先在此备份本站数据，再清除浏览器中「本网站」的缓存/存储；清除后重新打开，到 设置→导入备份文件 恢复即可。</div>
      <button type="button" id="update-btn-export-backup" class="update-btn update-btn-secondary" style="margin-bottom: 12px;">
        📤 备份本站数据（清除缓存前请先备份）
      </button>
    `;

    return `
      <div id="update-notification-overlay">
        <div id="update-notification-modal">
          <img src="https://i.postimg.cc/hGh6rJ5r/retouch-2026013121094970.png" class="update-decoration-img">
          <div class="update-notification-header">
            <div class="update-title">2.28 更新</div>
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

    // 防止点击弹窗内容时关闭
    const modal = document.getElementById('update-notification-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // 备份本站数据（清除缓存前可从此入口导出）
    const btnExportBackup = document.getElementById('update-btn-export-backup');
    if (btnExportBackup) {
      btnExportBackup.addEventListener('click', async () => {
        if (btnExportBackup.disabled) return;
        const fn = window.ephoneExportBackupFromPopup;
        if (typeof fn !== 'function') {
          alert('导出功能尚未就绪，请稍候几秒再试。');
          return;
        }
        btnExportBackup.disabled = true;
        btnExportBackup.textContent = '请选择备份方式...';
        try {
          const ok = await fn();
          if (ok) {
            btnExportBackup.textContent = '✓ 已触发下载，请保存好文件后再清除缓存';
          } else {
            btnExportBackup.disabled = false;
            btnExportBackup.textContent = '📤 备份本站数据（清除缓存前请先备份）';
          }
        } catch (e) {
          btnExportBackup.disabled = false;
          btnExportBackup.textContent = '📤 备份本站数据（清除缓存前请先备份）';
        }
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
