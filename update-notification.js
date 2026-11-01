// 更新弹窗管理器
class UpdateNotification {
  constructor() {
    this.storageKey = 'update_notification_dismissed';
    this.currentVersion = '11.1-20261101'; // 当前更新版本号
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
      <div class="update-divider">11.1 更新日志</div>
      <div class="update-item important-note">新增与完善</div>
      <div class="update-item">1.新增 Fish Audio 语音，支持角色语音消息、语音／视频通话朗读，可独立设置模型、音色和声音参数。</div>
      <div class="update-item">2.Fish 支持音色搜索、收藏、示例试听及私有音色管理，兼容部分中转接口；新增 Fish 录音转文字选项。</div>
      <div class="update-item">3.NovelAI 生图支持自定义官网、公益站及中转站接口，新增模型拉取、搜索、手动填写和连接保存，完善多种图片返回格式的兼容。</div>
      <div class="update-item">4.新增全局统一向量 API。角色可选择跟随全局、单独配置或使用原有默认方式，各角色的记忆仍然独立。</div>
      <div class="update-item">5.新增向量记忆“AI 整合”，可整理全部七类记忆或单独一类，支持预览、反馈重写，确认后再替换。</div>
      <div class="update-item">6.完善向量模型切换处理，避免新旧模型的向量混用；旧记忆正文保留，可手动补全或重建向量。</div>
      <div class="update-item">7.新增随机头部与自定义宏规则，可用于预设、世界书和提示词，支持固定文字、随机候选、参数模板及高级脚本。</div>
      <div class="update-item">8.宏规则支持排序、独立启停、导入导出和发送内容预览，可设置关闭后保留原文或跳过对应条目。</div>
      <div class="update-item">9.新增“模型路由观察”，可对照请求模型与接口返回的模型标识，查看近期记录，不增加额外模型请求。</div>
      <div class="update-item">10.完善时区搜索，支持中文城市名和英文时区；新增根据角色人设及所选世界书推荐时区，确认后使用。</div>
      <div class="update-item">11.调整角色时间判断：未设置角色时区时按人设与剧情判断；也可明确选择跟随用户或指定时区。</div>
      <div class="update-item">12.语言与翻译新增“强制指定语言”模式，加强指定语言的输出要求；译文和旁白仍可分别设置。</div>
      <div class="update-item">13.新增聊天顶栏、多选工具栏和长按消息菜单排序，支持拖动调整、自动保存及恢复默认。</div>
      <div class="update-item">14.长按消息菜单新增“删除（通知 AI）”和“彻底删除”，无需先进入多选。</div>
      <div class="update-item">15.新增锁定界面缩放，可单独允许图片预览缩放，减少操作时误放大整个页面。</div>
      <div class="update-item">16.升级手机调试控制台，新增搜索、日志分类、请求状态与耗时查看，支持复制和导出 TXT／JSON。</div>
      <div class="update-item">17.完善服务器消息推送，支持自定义请求方式、鉴权、请求头和消息模板，新增测试入口及返回结果查看。</div>
      <div class="update-item">18.新增模型搜索选择窗口，主、副、后台、识图及情侣空间 API 的模型可按名称搜索；修复重新拉取模型后选中值不正确的问题。</div>
      <div class="update-item important-note">问题修复与体验优化</div>
      <div class="update-item">19.修复角色火花中断后无法正常恢复的问题，完善恢复期限、扣卡和保存失败处理，新增自定义恢复卡数量。</div>
      <div class="update-item">20.修复从聊天列表打开火花详情或切换角色后，可能操作到其他角色的问题。</div>
      <div class="update-item">21.恢复聊天乐谱卡片的演奏功能，兼容原有八种音色，完善重复点击和播放失败提示。</div>
      <div class="update-item">22.修复情侣空间记账生成、评论和点赞请求在退出或切换角色后，结果可能发往错误页面的问题。</div>
      <div class="update-item">23.优化多选工具栏的手机布局，补充文字标签，按钮可随屏幕宽度换行；调整音乐播放器“多人同步”按钮位置。</div>
      <div class="update-item">24.自定义小组件的管理按钮改为仅在桌面编辑状态下显示，日常使用和截图时不再遮挡内容。</div>
      <div class="update-item">25.移除聊天页的“回复守护”提示横幅，保留后台任务记录及相关设置。</div>
      <div class="update-item">26.完善新增配置的保存与恢复，包括 Fish 配置、NovelAI 连接和按钮排序等。</div>
      <div class="update-item important-note">使用说明</div>
      <div class="update-item tips">• Fish 需自行配置 Key；额度及免费资格以服务账号为准，录音转文字独立计费。</div>
      <div class="update-item tips">• 第三方语音、生图接口的可用功能取决于站点支持情况。</div>
      <div class="update-item tips">• 模型观察依据接口自报标识，只供参考，不能据此确认上游实际模型。</div>
      <div class="update-item tips">• AI 记忆整合和向量重建会产生 API 用量。</div>
      <div class="update-divider">共同更新 · 反馈中心试用</div>
      <div class="update-item">新增私密反馈和公开反馈入口，可提交建议、报错并附带截图；公开内容经审核后展示。作者回复后，可回到原浏览器查看并继续交流。</div>
      <div class="update-item tips">反馈投稿需要联网完成安全验证。中国大陆网络下，验证可能无法加载，投稿暂不保证稳定可用；遇到问题可稍后重试，或继续使用原有反馈渠道。</div>
    `;

    return `
      <div id="update-notification-overlay">
        <div id="update-notification-modal">
          <img src="https://img.baibai.cv/f/mwOEhK/retouch-2026013121094970.png" class="update-decoration-img">
          <div class="update-notification-header">
            <div class="update-title">11.1 更新</div>
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
