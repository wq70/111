// 更新弹窗管理器
class UpdateNotification {
  constructor() {
    this.storageKey = 'update_notification_dismissed';
    this.currentVersion = '11.3-20261103'; // 当前更新版本号
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
      <div style="margin-bottom: 15px;"><button id="update-clear-global-css-btn" style="width: 100%; padding: 10px; background: #ff4d4f; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">清除全局自定义CSS (防错位)</button></div>
      <div class="update-item important-note">新手必看：DC解答区 <a href="https://discord.com/channels/1379304008157499423/1443544486796853248" target="_blank" style="color: #4A9EFF;">点击前往</a></div>
      <div class="update-item important-note">强烈建议：安装到主屏幕以获得最佳体验</div>
      <div class="update-item important-note">注意：首次打开最好使用魔法</div>
      <div class="update-item tips">有任何问题请通过DC私信联系 <a href="https://discord.com/users/1353222930875551804" target="_blank" style="color: #4A9EFF;">点击前往</a>，其他渠道可能无法及时回复</div>
      <div class="update-item important-note">使用提示：请留意 API 设置页面的小人菜单，新增功能入口都在这里哦。</div>
      <div class="update-divider">11.3 更新日志</div>
      <div class="update-item important-note">新增功能</div>
      <div class="update-item">1. <strong>桌面新增「信息」App</strong>。可以和角色交换虚拟号码、发短信和照片，也可以遇见有独立人设的陌生人，熟悉后再交换 QQ 联系方式。支持为每个联系人设置独立提示词和 API，并选择短信与 QQ 的上下文互通方向及记忆方式。「信息」默认关闭，可在 App 内开启。</div>
      <div class="update-item">2. <strong>聊天支持发送视频</strong>。可发送本地 MP4、WebM 或 HTTPS 视频直链。配置 Gemini 视频理解接口后，可让角色参考视频内容回复，也可以在卡片上单独解析整段或指定片段。支持「画面与声音」和「仅画面」两种模式。</div>
      <div class="update-item">3. <strong>群聊新增独立记忆</strong>。每个群可单独选择共享或独立模式。独立模式按群和成员分别保存日记式、结构化和向量记忆。支持选择成员和历史消息范围补建旧记忆，也可以单独管理、导入或导出本群记忆。旧群默认沿用原设置。</div>
      <div class="update-item">4. <strong>聊天记录支持按日期分段备份</strong>。单聊和群聊都可以选日期导出，消息中的本地照片、语音和视频会随备份保存。导入前可以预览新增和重复数量，分段可以乱序导入，重复消息会自动跳过。</div>
      <div class="update-item">5. <strong>豆瓣支持独立备份和迁移</strong>。可按需选择帖子、评论、小组、设置和关联资料，导入时可选合并或覆盖恢复。</div>
      <div class="update-item">6. <strong>绿江新增独立短篇模式</strong>。除了连载长篇，可以把独立短篇收在同一本书里，也可以每篇单独成书。延长短篇时只参考当前篇目，是否参考角色的聊天语气也可以单独设置。</div>
      <div class="update-item">7. <strong>新增 Char 待办</strong>。可以按角色人设推断作息，也可以自己填写。支持手动生成，或在当天第一次聊天时生成。角色之后可以在聊天中自然参考当天的安排。</div>
      <div class="update-item important-note">功能优化与修复</div>
      <div class="update-item">8. <strong>同名角色可以单独区分</strong>。可为角色添加「校园线」「成年线」等区分标签。群聊发言、动态、评论、点赞和跨聊天投递按角色身份区分。旧评论归属不明确时，可以手动确认。</div>
      <div class="update-item">9. <strong>聊天设置模板支持默认和批量套用</strong>。可按需保存旁白、语言与翻译、回复偏好等设置，分别指定新建单聊和群聊的默认模板，也可一次应用到多个已有聊天。</div>
      <div class="update-item">10. <strong>完善向量模型切换和重建</strong>。更换接口或模型时，可选择沿用已有向量、为新模型单独建立一套，或恢复以前保存的向量。重建可以中途停止，已完成的进度会保存，下次可接着处理。</div>
      <div class="update-item">11. <strong>向量记忆更方便整理</strong>。新增手动添加记忆、修改分类和指定时间线。AI 整合可按组重试或原样保留，新旧记忆可对照原文和日期后手动合并，也可撤销上次整合并保留之后的修改。</div>
      <div class="update-item">12. <strong>快捷回复、表情和消息编辑更好用</strong>。快捷回复支持编辑、按分类全选和批量删除。匹配表情可以切换分页或横向滑动，浏览全部结果。长消息可以放大到全屏编辑。</div>
      <div class="update-item">13. <strong>新增「限制线下见面」开关</strong>。可在全局设置中调整，也可为单个角色单独设置。默认开启，关闭后会移除线上聊天中关于见面和站外联系的内置限制。</div>
      <div class="update-item">14. <strong>修复网易云音乐扫码和歌单读取问题</strong>。扫码成功后如果账号资料或歌单加载失败，可以单独重试。大型歌单支持分页读取。</div>
      <div class="update-item">15. <strong>优化聊天中的人物和事件识别</strong>。模型能更清楚地区分角色本名、聊天备注和对玩家的称呼，以及是谁修改了备注。旁白和转账记录也会更明确地交代谁做了什么。</div>
      <div class="update-item tips"><a href="update-log.html#release-20261103" target="_blank" rel="noopener">查看完整更新日志</a></div>
      <div class="update-divider">共同更新 · 反馈中心试用</div>
      <div class="update-item">新增私密反馈和公开反馈入口，可提交建议、报错并附带截图；公开内容经审核后展示。作者回复后，可回到原浏览器查看并继续交流。</div>
      <div class="update-item tips">反馈投稿需要联网完成安全验证。中国大陆网络下，验证可能无法加载，投稿暂不保证稳定可用；遇到问题可稍后重试，或继续使用原有反馈渠道。</div>
    `;

    return `
      <div id="update-notification-overlay">
        <div id="update-notification-modal">
          <img src="https://img.baibai.cv/f/mwOEhK/retouch-2026013121094970.png" class="update-decoration-img">
          <div class="update-notification-header">
            <div class="update-title">11.3 更新</div>
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
