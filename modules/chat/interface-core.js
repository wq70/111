// ============================================================

  // 参考并改写自 yxlforever/YYY：
  // https://github.com/yxlforever/YYY/commit/ece2d6bec633ced55c89af3871f96c97ebf3aa7e
  // 用途：切换聊天/离开聊天后让旧异步渲染失效，并断开已离屏媒体 DOM 的资源引用。
  // 不删除 chat.history，不改变消息窗口数量、历史加载、通知或任何聊天数据。
  let chatRenderVersion = 0;
  let chatScrollRestoreVersion = null;
  const pendingChatImageLoads = new WeakMap();
  const chatMessageReferences = new WeakMap();

  function captureChatScrollPosition(chatId) {
    const container = document.getElementById('chat-messages');
    if (!container || container.dataset.chatId !== String(chatId) ||
        !document.getElementById('chat-interface-screen').classList.contains('active')) return null;
    const top = container.getBoundingClientRect().top + container.clientTop;
    const anchors = Array.from(container.querySelectorAll('.message-wrapper'), element => ({
      message: chatMessageReferences.get(element),
      timestamp: Number(element.dataset.timestamp ?? element.querySelector('.message-bubble[data-timestamp]')?.dataset.timestamp),
      offset: element.getBoundingClientRect().top - top,
      bottom: element.getBoundingClientRect().bottom - top
    }));
    if (!anchors.length) return null;
    return {
      atBottom: container.scrollHeight - container.clientHeight - container.scrollTop <= 40,
      anchors,
      visibleIndex: Math.max(0, anchors.findIndex(anchor => anchor.bottom > 0)),
      historyMode: state.isViewingHistoryMode,
      historyCenterTimestamp: state.historyCenterTimestamp
    };
  }

  function waitForChatImage(img) {
    return new Promise(resolve => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        pendingChatImageLoads.delete(img);
        if (img.onload === settle) img.onload = null;
        if (img.onerror === settle) img.onerror = null;
        resolve();
      };
      pendingChatImageLoads.set(img, settle);
      img.onload = settle;
      img.onerror = settle;
    });
  }

  function disposeChatMessageDom() {
    chatRenderVersion++;
    chatScrollRestoreVersion = null;
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    messagesContainer.querySelectorAll('img, video, audio').forEach(media => {
      // 先结束仍在等待的图片加载 Promise，避免已移除节点被旧渲染闭包长期引用。
      const settlePendingLoad = pendingChatImageLoads.get(media);
      if (typeof settlePendingLoad === 'function') {
        settlePendingLoad();
      }
      media.onload = null;
      media.onerror = null;
      if (media.tagName !== 'IMG') {
        try { media.pause(); } catch (error) { }
        media.removeAttribute('src');
        try { if (media.load) media.load(); } catch (error) { }
      } else {
        media.removeAttribute('src');
      }
    });
    messagesContainer.replaceChildren();
    delete messagesContainer.dataset.chatId;
  }
// chat-interface.js
// 聊天界面模块：renderChatInterface、loadMoreMessages、
// scrollToOriginalMessage、createMessageElement、prependMessage、
// appendMessage、openChat、setAvatarActingState
// 从 script.js 第 10276~10560 + 12670~13710 行拆分
// ============================================================

  // 根据本名查找显示名称（非群聊场景）
  function getDisplayNameByOriginalName(nameIdentifier) {
    if (!nameIdentifier) return '';

    if (state.qzoneSettings && nameIdentifier === state.qzoneSettings.nickname) {
      return state.qzoneSettings.nickname;
    }

    let characterChat = Object.values(state.chats).find(chat => !chat.isGroup && chat.originalName === nameIdentifier);
    if (characterChat) {
      return characterChat.name;
    }

    characterChat = Object.values(state.chats).find(chat =>
      !chat.isGroup &&
      (chat.nameHistory && chat.nameHistory.includes(nameIdentifier))
    );
    if (characterChat) {
      return characterChat.name;
    }

    return nameIdentifier;
  }

  // 处理消息中的 @[[originalName]] 提及，替换为显示昵称
  function processMentions(text, chat = null) {
    if (!text || typeof text !== 'string' || !text.includes('@[[')) {
      return text;
    }

    const petProcessedText = window.CharacterBond ? window.CharacterBond.displayMentions(text, chat) : text;
    return petProcessedText.replace(/@\[\[([^\]]+)\]\]/g, (match, originalName) => {
      const trimmedOriginalName = originalName.trim();
      let displayName;

      if (chat && chat.isGroup) {
        displayName = getDisplayNameInGroup(chat, trimmedOriginalName);
      } else {
        displayName = getDisplayNameByOriginalName(trimmedOriginalName);
      }

      return `@${displayName}`;
    });
  }

  // 更新聊天界面返回按钮上的未读消息总数指示器
  function updateBackButtonUnreadCount() {
    const totalChatUnread = Object.values(state.chats).reduce((sum, chat) => {
      if (chat.id === state.activeChatId) {
        return sum;
      }
      return sum + (chat.unreadCount || 0);
    }, 0);

    const totalQzoneUnread = unreadPostsCount || 0;

    const totalUnread = totalChatUnread + totalQzoneUnread;

    const backBtn = document.getElementById('back-to-list-btn');
    if (!backBtn) return;

    let indicator = backBtn.querySelector('.unread-indicator');
    if (!indicator) {
      indicator = document.createElement('span');
      indicator.className = 'unread-indicator';
      backBtn.appendChild(indicator);
    }

    // 清除旧的 back-btn-indicator
    let qzoneIndicator = backBtn.querySelector('.unread-indicator.back-btn-indicator');
    if (qzoneIndicator) {
      qzoneIndicator.remove();
    }

    if (totalUnread > 0) {
      indicator.textContent = totalUnread > 99 ? '99+' : totalUnread;
      indicator.style.display = 'block';
      indicator.style.zIndex = '20';
      indicator.style.transform = 'scale(0.8)';
    } else {
      indicator.style.display = 'none';
    }
  }

  // ======= 新增：渲染上下文（历史模式） =======
  async function renderChatContext(chatId, targetTimestamp) {
    state.isViewingHistoryMode = true;
    state.historyCenterTimestamp = targetTimestamp;
    
    // 显示返回最新按钮
    const returnBtn = document.getElementById('return-to-latest-btn');
    if (returnBtn) returnBtn.style.display = 'block';

    const chat = state.chats[chatId];
    if (!chat) return;
    if (window.CharacterBond) {
      window.CharacterBond.ensureChat(chat);
      window.CharacterBond.reconcile(chat);
      window.CharacterBond.refreshVisibleUi(chat);
    }
    if (window.voiceRecording?.refreshAvailability) window.voiceRecording.refreshAvailability(chat);

    const messagesContainer = document.getElementById('chat-messages');
    disposeChatMessageDom();
    const renderVersion = chatRenderVersion;
    messagesContainer.dataset.chatId = chatId;
    showLoader(messagesContainer, 'center'); // 临时显示加载

    // 寻找目标消息索引
    const targetIndex = chat.history.findIndex(m => m.timestamp === targetTimestamp);
    if (targetIndex === -1) {
      hideLoader(messagesContainer);
      alert('未找到该消息的上下文');
      return;
    }

    // 计算切片范围
    const renderWindow = state.globalSettings.chatRenderWindow || 50;
    const halfWindow = Math.floor(renderWindow / 2);
    
    let startIndex = Math.max(0, targetIndex - halfWindow);
    let endIndex = Math.min(chat.history.length, targetIndex + halfWindow + 1);
    
    // 如果靠近开头或结尾，补齐数量
    if (endIndex - startIndex < renderWindow) {
      if (startIndex === 0) {
        endIndex = Math.min(chat.history.length, startIndex + renderWindow);
      } else if (endIndex === chat.history.length) {
        startIndex = Math.max(0, endIndex - renderWindow);
      }
    }

    const messagesToRender = chat.history.slice(startIndex, endIndex);
    currentRenderedCount = endIndex - startIndex; // 在历史模式下，这个变量的意义可能需要调整，但目前用于保持兼容性
    
    // 隐藏加载动画
    hideLoader(messagesContainer);

    const fragment = document.createDocumentFragment();
    let lastTimestamp = 0;

    for (const msg of messagesToRender) {
      if (!msg.isHidden) {
        if (lastTimestamp > 0 && (msg.timestamp - lastTimestamp > 600000)) {
          fragment.appendChild(createSystemTimestampElement(msg.timestamp));
        }
        lastTimestamp = msg.timestamp;
      }
      const messageEl = await createMessageElement(msg, chat, true);

      if (renderVersion !== chatRenderVersion || state.activeChatId !== chatId) return;
      if (messageEl) {
        chatMessageReferences.set(messageEl, msg);
        fragment.appendChild(messageEl);
      }
    }

    if (renderVersion !== chatRenderVersion || state.activeChatId !== chatId) return;
    messagesContainer.appendChild(fragment);

    // 滚动定位到目标消息
    setTimeout(() => {
      if (renderVersion === chatRenderVersion && state.activeChatId === chatId) {
        scrollToOriginalMessage(targetTimestamp);
      }
    }, 100);
  }

  async function renderChatInterface(chatId, options = {}) {
    const scrollPosition = options.preserveScroll ? captureChatScrollPosition(chatId) : null;
    const preserveHistoryMode = scrollPosition && !scrollPosition.atBottom && scrollPosition.historyMode;
    if (window.ReplyGuardian && typeof window.ReplyGuardian.renderChatBanner === 'function') {
      window.ReplyGuardian.renderChatBanner(chatId).catch(error => {
        console.warn('[回复守护] 更新聊天状态条失败:', error);
      });
    }
    state.isViewingHistoryMode = !!preserveHistoryMode;
    state.historyCenterTimestamp = preserveHistoryMode ? scrollPosition.historyCenterTimestamp : null;
    const returnBtn = document.getElementById('return-to-latest-btn');
    if (returnBtn) returnBtn.style.display = preserveHistoryMode ? 'block' : 'none';

    applyButtonOrder();
    cleanupWaimaiTimers();
    const chat = state.chats[chatId];
    if (!chat) return;
    if (window.CharacterBond) {
      window.CharacterBond.ensureChat(chat);
      window.CharacterBond.reconcile(chat);
      window.CharacterBond.refreshVisibleUi(chat);
    }

    exitSelectionMode();

    const messagesContainer = document.getElementById('chat-messages');
    const chatInputArea = document.getElementById('chat-input-area');
    const lockOverlay = document.getElementById('chat-lock-overlay');
    const lockContent = document.getElementById('chat-lock-content');

    messagesContainer.dataset.theme = chat.settings.theme || 'default';
    
    // 如果是自定义主题，动态注入自定义颜色的 CSS 变量
    if (chat.settings.theme && chat.settings.theme.startsWith('custom_')) {
      try {
        const savedThemesStr = localStorage.getItem('custom_bubble_themes');
        if (savedThemesStr) {
          const customThemes = JSON.parse(savedThemesStr);
          const currentCustomTheme = customThemes.find(t => t.id === chat.settings.theme);
          if (currentCustomTheme) {
            messagesContainer.style.setProperty('--custom-user-bg', currentCustomTheme.userColor);
            messagesContainer.style.setProperty('--custom-ai-bg', currentCustomTheme.aiColor);
          }
        }
      } catch (e) {
        console.error("加载自定义气泡主题颜色失败", e);
      }
    }
    
    const fontSize = chat.settings.fontSize || 13;
    messagesContainer.style.setProperty('--chat-font-size', `${fontSize}px`);
    window.refreshAppearanceVariables?.(chat);

    document.getElementById('chat-header-title').textContent = chat.name;
    const statusContainer = document.getElementById('chat-header-status');
    const statusTextEl = statusContainer.querySelector('.status-text');

    if (chat.isGroup) {
      statusContainer.style.display = 'none';
      document.getElementById('chat-header-title-wrapper').style.justifyContent = 'center';
    } else {
      statusContainer.style.display = 'flex';
      document.getElementById('chat-header-title-wrapper').style.justifyContent = 'flex-start';
      statusTextEl.textContent = chat.status?.text || '在线';
      statusContainer.classList.toggle('busy', chat.status?.isBusy || false);
    }

    const chatScreen = document.getElementById('chat-interface-screen');
    const individualBg = chat.settings.background;
    const globalBg = state.globalSettings.globalChatBackground;
    const isDarkMode = document.getElementById('phone-screen').classList.contains('dark-mode');
    const defaultColor = isDarkMode ? '#000000' : '#f0f2f5';

    if (individualBg) {
      chatScreen.style.backgroundImage = `url("${individualBg}")`;
      chatScreen.style.backgroundColor = 'transparent';
    } else if (globalBg) {
      chatScreen.style.backgroundImage = `url("${globalBg}")`;
      chatScreen.style.backgroundColor = 'transparent';
    } else {
      chatScreen.style.backgroundImage = 'none';
      chatScreen.style.backgroundColor = defaultColor;
    }


    if (chat.isSpectatorGroup) {
      chatInputArea.style.display = 'none';
      lockOverlay.style.display = 'flex';
      lockContent.innerHTML = `
                    <span class="lock-text">正在围观AI们的群聊...</span>
                    <div class="spectator-actions-container">
                        <button id="spectator-reroll-btn" class="lock-action-btn secondary" title="重新生成上一轮对话">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4"></path>
                                <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"></path>
                            </svg>
                        </button>
                        <button id="spectator-propel-btn" class="lock-action-btn">🎬 推进剧情</button>
                        <button id="spectator-edit-btn" class="lock-action-btn secondary" title="导演剪辑室：编辑AI上一轮的响应">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path>
                                <line x1="16" y1="8" x2="2" y2="22"></line>
                                <line x1="17.5" y1="15" x2="9" y2="15"></line>
                            </svg>
                        </button>
                    </div>
                `;
      document.getElementById('spectator-propel-btn').onclick = triggerSpectatorGroupAiAction;
    } else {
      chatInputArea.style.display = 'flex';
      lockOverlay.style.display = 'none';
      lockContent.innerHTML = '';
      if (!chat.isGroup && chat.relationship.status !== 'friend') {
        lockOverlay.style.display = 'flex';
        chatInputArea.style.visibility = 'hidden';

        let lockHtml = '';
        switch (chat.relationship.status) {
          case 'blocked_by_user':
            const isSimulationRunning = simulationIntervalId !== null;
            const blockedTimestamp = chat.relationship.blockedTimestamp;
            const cooldownHours = state.globalSettings.blockCooldownHours || 1;
            const cooldownMilliseconds = cooldownHours * 60 * 60 * 1000;
            const timeSinceBlock = Date.now() - blockedTimestamp;
            const isCooldownOver = timeSinceBlock > cooldownMilliseconds;
            const timeRemainingMinutes = Math.max(0, Math.ceil((cooldownMilliseconds - timeSinceBlock) / (1000 * 60)));

            lockHtml = `
                                <span class="lock-text">你已将"${chat.name}"拉黑。</span>
                                <button id="unblock-btn" class="lock-action-btn">解除拉黑</button>
                                <div style="margin-top: 20px; padding: 10px; border: 1px dashed #ccc; border-radius: 8px; font-size: 11px; text-align: left; color: #666; background: rgba(0,0,0,0.02);">
                                    <strong style="color: #333;">【开发者诊断面板】</strong><br>
                                    - 后台活动总开关: ${state.globalSettings.enableBackgroundActivity ? '<span style="color: green;">已开启</span>' : '<span style="color: red;">已关闭</span>'}<br>
                                    - 系统心跳计时器: ${isSimulationRunning ? '<span style="color: green;">运行中</span>' : '<span style="color: red;">未运行</span>'}<br>
                                    - 当前角色状态: <strong>${chat.relationship.status}</strong><br>
                                    - 需要冷静(小时): <strong>${cooldownHours}</strong><br>
                                    - 冷静期是否结束: ${isCooldownOver ? '<span style="color: green;">是</span>' : `<span style="color: orange;">否 (还剩约 ${timeRemainingMinutes} 分钟)</span>`}<br>
                                    - 触发条件: ${isCooldownOver && state.globalSettings.enableBackgroundActivity ? '<span style="color: green;">已满足，等待下次系统心跳</span>' : '<span style="color: red;">未满足</span>'}
                                </div>
                                <button id="force-apply-check-btn" class="lock-action-btn secondary" style="margin-top: 10px;">强制触发一次好友申请检测</button>
                            `;
            break;
          case 'blocked_by_ai':
            lockHtml = `
                                <span class="lock-text">你被对方拉黑了。</span>
                                <button id="apply-friend-btn" class="lock-action-btn">重新申请加为好友</button>
                            `;
            break;
          case 'pending_user_approval':
            lockHtml = `
                                <span class="lock-text">"${chat.name}"请求添加你为好友：<br><i>"${chat.relationship.applicationReason}"</i></span>
                                <button id="accept-friend-btn" class="lock-action-btn">接受</button>
                                <button id="reject-friend-btn" class="lock-action-btn secondary">拒绝</button>
                            `;
            break;
          case 'pending_ai_approval':
            lockHtml = `<span class="lock-text">好友申请已发送，等待对方通过...</span>`;
            break;
        }
        lockContent.innerHTML = lockHtml;
      } else {
        lockOverlay.style.display = 'none';
        chatInputArea.style.visibility = 'visible';
      }
    }

    disposeChatMessageDom();
    const renderVersion = chatRenderVersion;
    chatScrollRestoreVersion = renderVersion;
    messagesContainer.dataset.chatId = chatId;
    try {
    const history = chat.history;
    currentRenderedCount = 0;
    const renderWindow = state.globalSettings.chatRenderWindow || 50;
    let startIndex = Math.max(0, history.length - renderWindow);
    let endIndex = history.length;
    if (scrollPosition && !scrollPosition.atBottom) {
      // 保留对象引用可跟随编辑时重排的时间戳；数据库重读的消息用原时间戳匹配。
      const indexes = new Map(history.map((message, index) => [message, index]));
      const timestamps = new Map(history.map((message, index) => [message.timestamp, index]));
      scrollPosition.anchors = scrollPosition.anchors.map(anchor => {
        const index = indexes.get(anchor.message) ?? timestamps.get(anchor.timestamp);
        return { ...anchor, message: index === undefined ? null : history[index], index };
      });
      const surviving = scrollPosition.anchors.filter(anchor => anchor.index !== undefined);
      if (surviving.length) {
        startIndex = Math.min(...surviving.map(anchor => anchor.index));
        if (preserveHistoryMode) endIndex = Math.min(history.length, Math.max(startIndex + renderWindow, ...surviving.map(anchor => anchor.index + 1)));
      }
    }
    const initialMessages = history.slice(startIndex, endIndex);



    const fragment = document.createDocumentFragment();
    let lastTimestamp = 0;


    for (const msg of initialMessages) {

      if (!msg.isHidden) {
        if (lastTimestamp > 0 && (msg.timestamp - lastTimestamp > 600000)) {

          fragment.appendChild(createSystemTimestampElement(msg.timestamp));
        }
        lastTimestamp = msg.timestamp;
      }


      const messageEl = await createMessageElement(msg, chat, true);
      if (renderVersion !== chatRenderVersion || state.activeChatId !== chatId) return;

      if (messageEl) {
        chatMessageReferences.set(messageEl, msg);
        fragment.appendChild(messageEl);
      }
    }


    if (renderVersion !== chatRenderVersion || state.activeChatId !== chatId) return;
    messagesContainer.appendChild(fragment);

    currentRenderedCount = initialMessages.length;

    const typingIndicator = document.createElement('div');
    typingIndicator.id = 'typing-indicator';
    typingIndicator.style.display = 'none';
    typingIndicator.textContent = '对方正在输入...';
    messagesContainer.appendChild(typingIndicator);
    const images = messagesContainer.querySelectorAll('img');
    const imageLoadPromises = [];

    images.forEach(img => {

      if (!img.complete) {

        imageLoadPromises.push(waitForChatImage(img));
      }
    });


    let restoredScrollTop = null;
    const scrollToLatest = () => {
      if (renderVersion !== chatRenderVersion || state.activeChatId !== chatId) return;
      if (!document.getElementById('chat-interface-screen').classList.contains('active')) return;
      // 图片迟到时不覆盖用户已经改变的阅读位置。
      if (restoredScrollTop !== null && Math.abs(messagesContainer.scrollTop - restoredScrollTop) > 1) return;
      let restoredAnchor = false;
      if (scrollPosition && !scrollPosition.atBottom) {
        const elements = new Map(Array.from(messagesContainer.querySelectorAll('.message-wrapper'), element => [chatMessageReferences.get(element), element]));
        const anchors = scrollPosition.anchors.slice(scrollPosition.visibleIndex).concat(scrollPosition.anchors.slice(0, scrollPosition.visibleIndex).reverse());
        for (const anchor of anchors) {
          const element = anchor.message && elements.get(anchor.message);
          if (!element) continue;
          const top = messagesContainer.getBoundingClientRect().top + messagesContainer.clientTop;
          messagesContainer.scrollTop += element.getBoundingClientRect().top - top - anchor.offset;
          restoredAnchor = true;
          break;
        }
      }
      if (!restoredAnchor) messagesContainer.scrollTop = messagesContainer.scrollHeight;
      restoredScrollTop = messagesContainer.scrollTop;
    };
    Promise.all(imageLoadPromises).then(() => {
      requestAnimationFrame(scrollToLatest);
    }).catch(err => {
      console.error("等待图片加载时出错:", err);
      requestAnimationFrame(scrollToLatest);
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      scrollToLatest();
      if (chatScrollRestoreVersion === renderVersion) chatScrollRestoreVersion = null;
    }));
    } catch (error) {
      if (chatScrollRestoreVersion === renderVersion) chatScrollRestoreVersion = null;
      throw error;
    }
  }




  async function loadMoreMessages() {
    if (isLoadingMoreMessages || chatScrollRestoreVersion === chatRenderVersion) return;
    isLoadingMoreMessages = true;

    const messagesContainer = document.getElementById('chat-messages');
    const chat = state.chats[state.activeChatId];
    const chatId = state.activeChatId;
    const renderVersion = chatRenderVersion;
    if (!chat) {
      isLoadingMoreMessages = false;
      return;
    }

    // 历史模式下暂时禁用上滑加载，或者提示用户返回最新
    if (state.isViewingHistoryMode) {
      isLoadingMoreMessages = false;
      return;
    }

    showLoader(messagesContainer, 'top');
    const oldScrollHeight = messagesContainer.scrollHeight;
    const oldScrollTop = messagesContainer.scrollTop;

    try {
    await new Promise(resolve => setTimeout(resolve, 100));

    if (renderVersion !== chatRenderVersion || state.activeChatId !== chatId) {
      isLoadingMoreMessages = false;
      return;
    }
    if (Math.abs(messagesContainer.scrollTop - oldScrollTop) > 1) {
      hideLoader(messagesContainer);
      isLoadingMoreMessages = false;
      return;
    }


    const totalMessages = chat.history.length;
    const renderWindow = state.globalSettings.chatRenderWindow || 50;
    const nextSliceStart = totalMessages - currentRenderedCount - renderWindow;
    const nextSliceEnd = totalMessages - currentRenderedCount;
    const messagesToPrepend = chat.history.slice(Math.max(0, nextSliceStart), nextSliceEnd);


    if (messagesToPrepend.length === 0) {
      hideLoader(messagesContainer);
      isLoadingMoreMessages = false;
      return;
    }

    const messageElements = [];
    for (const msg of messagesToPrepend) {
      const el = await createMessageElement(msg, chat);
      if (renderVersion !== chatRenderVersion || state.activeChatId !== chatId) {
        isLoadingMoreMessages = false;
        return;
      }
      if (el) chatMessageReferences.set(el, msg);
      messageElements.push(el);
    }



    const fragment = document.createDocumentFragment();
    const firstVisibleMessage = messagesContainer.querySelector('.message-wrapper[data-timestamp]');

    let timestampOfFirstVisible = firstVisibleMessage ? parseInt(firstVisibleMessage.dataset.timestamp) : 0;

    let lastTimestampInNewBatch = 0;


    messagesToPrepend.forEach((msg, index) => {
      if (!msg.isHidden) {

        if (lastTimestampInNewBatch > 0 && (msg.timestamp - lastTimestampInNewBatch > 600000)) {
          fragment.appendChild(createSystemTimestampElement(msg.timestamp));
        }
        lastTimestampInNewBatch = msg.timestamp;
      }

      const element = messageElements[index];
      if (element) {
        fragment.appendChild(element);
      }
    });

    if (timestampOfFirstVisible > 0 && (timestampOfFirstVisible - lastTimestampInNewBatch > 600000)) {
      fragment.appendChild(createSystemTimestampElement(timestampOfFirstVisible));
    }



    if (renderVersion !== chatRenderVersion || state.activeChatId !== chatId) {
      isLoadingMoreMessages = false;
      return;
    }
    if (Math.abs(messagesContainer.scrollTop - oldScrollTop) > 1) {
      hideLoader(messagesContainer);
      isLoadingMoreMessages = false;
      return;
    }
    hideLoader(messagesContainer);
    messagesContainer.prepend(fragment);
    currentRenderedCount += messagesToPrepend.length;


    const newScrollHeight = messagesContainer.scrollHeight;
    messagesContainer.scrollTop = oldScrollTop + newScrollHeight - oldScrollHeight;

    isLoadingMoreMessages = false;
    } finally {
      isLoadingMoreMessages = false;
      if (renderVersion === chatRenderVersion && state.activeChatId === chatId) hideLoader(messagesContainer);
    }
  }


  function scrollToOriginalMessage(originalTimestamp) {
    const selector = `.message-bubble[data-timestamp="${originalTimestamp}"]`;
    const originalMessageBubble = document.querySelector(selector);

    if (originalMessageBubble) {
      originalMessageBubble.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      originalMessageBubble.classList.add('highlighted');
      setTimeout(() => {
        if (document.body.contains(originalMessageBubble)) {
          originalMessageBubble.classList.remove('highlighted');
        }
      }, 1500);

    } else {

      alert("找不到原始消息。可能已被删除或位于更早的历史记录中。");
    }
  }
