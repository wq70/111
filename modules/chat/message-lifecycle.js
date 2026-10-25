  async function prependMessage(msg, chat) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageEl = await createMessageElement(msg, chat);


    if (!messageEl) return;
    chatMessageReferences.set(messageEl, msg);

    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
      messagesContainer.insertBefore(messageEl, loadMoreBtn.nextSibling);
    } else {
      messagesContainer.prepend(messageEl);
    }
  }



  async function appendMessage(msg, chat, isInitialLoad = false) {

    if (!isInitialLoad && state.activeChatId === chat.id) window.refreshAppearanceVariables?.(chat);

    if (!isInitialLoad) window.MemoryWorldTime?.capture(msg, chat);

    const messagesContainer = document.getElementById('chat-messages');
    const typingIndicator = document.getElementById('typing-indicator');
    const renderVersion = chatRenderVersion;

    let lastMessage = null;
    for (let index = chat.history.length - 1; index >= 0; index--) {
      if (!chat.history[index].isHidden) {
        lastMessage = chat.history[index];
        break;
      }
    }


    if (lastMessage && (msg.timestamp - lastMessage.timestamp > 600000)) {
      const timestampEl = createSystemTimestampElement(msg.timestamp);
      messagesContainer.insertBefore(timestampEl, typingIndicator);
    }

    const messageEl = await createMessageElement(msg, chat);
    if (!messageEl) return;
    chatMessageReferences.set(messageEl, msg);


    if (msg.role === 'assistant' && !isInitialLoad) {
      playNotificationSound();
    }

    // 消息仍保存在原聊天中、通知仍照常播放；只阻止旧聊天 DOM 写入当前聊天页面。
    if (!messagesContainer || !typingIndicator || renderVersion !== chatRenderVersion || state.activeChatId !== chat.id) return;

    if (!isInitialLoad) {
      messageEl.classList.add('animate-in');
      if (state.activeChatId === chat.id) {
        currentRenderedCount++;
      }
    }

    messagesContainer.insertBefore(messageEl, typingIndicator);

    const scrollToBottom = () => {
      if (!isInitialLoad && renderVersion === chatRenderVersion && state.activeChatId === chat.id) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    };


    const images = messageEl.querySelectorAll('img.sticker-image, img.chat-image, img.ai-generated-image, img.realimag-image, .naiimag-image, .ai-generated-image, .char-photo-item');

    if (images.length > 0) {
      const imageLoadPromises = [];
      images.forEach(img => {
        if (!img.complete) {
          imageLoadPromises.push(waitForChatImage(img));
        }
      });


      Promise.all(imageLoadPromises).then(() => {
        console.log(`${images.length} 张新图片加载完成，滚动到底部。`);
        scrollToBottom();
      });
    } else {

      scrollToBottom();
    }
    const MAX_DOM_NODES = 60;
    const bubbles = messagesContainer.querySelectorAll('.message-wrapper');

    if (bubbles.length > MAX_DOM_NODES) {
      // 移除最上面的元素（除了加载更多按钮）
      // 注意：如果你有"加载更多"按钮在第一个位置，要从第二个开始删
      const itemsToRemove = bubbles.length - MAX_DOM_NODES;
      for (let i = 0; i < itemsToRemove; i++) {
        // 确保不删除 load-more-btn
        if (!bubbles[i].id && !bubbles[i].classList.contains('load-more-btn')) {
          bubbles[i].querySelectorAll('img').forEach(img => {
            const settlePendingLoad = pendingChatImageLoads.get(img);
            if (typeof settlePendingLoad === 'function') {
              settlePendingLoad();
            }
            img.onload = null;
            img.onerror = null;
            img.removeAttribute('src');
          });
          bubbles[i].querySelectorAll('video, audio').forEach(media => {
            try { media.pause(); } catch (error) { }
            media.removeAttribute('src');
            try { if (media.load) media.load(); } catch (error) { }
          });
          bubbles[i].remove();
          // 同时修正 currentRenderedCount，防止加载逻辑错乱
          // (这一步取决于你的 loadMoreMessages 逻辑，通常不需要手动减，因为它是基于 slice 计算的)
        }
      }
    }
  }

  // 【新增】暴露 appendMessage 到 window，供联机功能使用
  window.appendMessage = appendMessage;


  async function openChat(chatId) {
    state.activeChatId = chatId;
    // 播放器已隔离：聊天TTS用tts-audio-player，通话TTS用call-tts-audio-player
    // 切聊天时只需停聊天语音条，通话TTS在独立播放器上不受影响
    if (typeof stopChatMessageTtsOnly === 'function') {
      stopChatMessageTtsOnly();
    }
    const chat = state.chats[chatId];
    if (!chat) return;
    if (window.CharacterBond && !chat.isGroup) {
      window.CharacterBond.ensureChat(chat);
      window.CharacterBond.reconcile(chat);
      await db.chats.put(chat);
    }

    // 检查是否有待处理的购物车清空通知
    if (chat.pendingCartClearNotification && !chat.isGroup) {
      const notification = chat.pendingCartClearNotification;
      const itemCount = notification.items.reduce((sum, item) => sum + item.quantity, 0);
      
      // 构建物品列表
      const itemsList = notification.items.map(item => 
        `${item.name} x${item.quantity} (¥${(item.price * item.quantity).toFixed(2)})`
      ).join('\n');
      
      await showCustomAlert(
        `${chat.name} 帮你清空了购物车！`,
        `${chat.name} 已经用自己的钱帮你购买了购物车中的所有商品！\n\n共 ${itemCount} 件商品，总价 ¥${notification.totalCost.toFixed(2)}\n\n${itemsList}\n\n所有物品都在路上啦~`
      );
      
      // 清除通知标记
      delete chat.pendingCartClearNotification;
      await db.chats.put(chat);
    }

    if (chat.unreadCount > 0) {
      chat.unreadCount = 0;
      await db.chats.put(chat);
    }
    applyLyricsBarPosition(chat);
    renderChatInterface(chatId);
    showScreen('chat-interface-screen');
    window.updateListenTogetherIconProxy(state.activeChatId);


    const isGroup = chat.isGroup || false;


    toggleCallButtons(isGroup);


    document.getElementById('show-announcement-board-btn').style.display = isGroup ? 'flex' : 'none';


    const patBtn = document.getElementById('pat-btn');
    if (patBtn) {
      patBtn.style.display = isGroup ? 'none' : 'flex';
    }
    const propelBtn = document.getElementById('propel-btn');


    const shoppingBtn = document.getElementById('open-shopping-btn');
    const gomokuBtn = document.getElementById('gomoku-btn');
    const werewolfBtn = document.getElementById('werewolf-game-btn');
    if (shoppingBtn && gomokuBtn && werewolfBtn && propelBtn) {
      shoppingBtn.style.display = 'flex';
      gomokuBtn.style.display = isGroup ? 'none' : 'flex';
      werewolfBtn.style.display = isGroup ? 'flex' : 'none';


      propelBtn.style.display = isGroup ? 'none' : 'flex';
    }

    updateBackButtonUnreadCount();

    if (!chat.isGroup && chat.relationship?.status === 'pending_ai_approval') {
      console.log(`检测到好友申请待处理状态，为角色 "${chat.name}" 自动触发AI响应...`);
      triggerAiResponse();
    }

    document.getElementById('send-poll-btn').style.display = isGroup ? 'flex' : 'none';
    document.body.classList.remove('chat-actions-expanded');
  }








  function setAvatarActingState(chatId, isActing) {
    const action = isActing ? 'add' : 'remove';
    const classListAction = (element) => {
      if (element) {
        element.classList[action]('is-acting');
      }
    };


    const listAvatar = document.querySelector(`.chat-list-item[data-chat-id="${chatId}"] .avatar`);
    classListAction(listAvatar);


    const qzoneAvatars = document.querySelectorAll(`.post-avatar[data-author-id="${chatId}"]`);
    qzoneAvatars.forEach(classListAction);


    const callAvatar = document.querySelector(`.participant-avatar[data-participant-id="${chatId}"]`);
    classListAction(callAvatar);


  }

  // ========== 全局暴露 ==========
  window.openChat = openChat;
  window.renderChatInterface = renderChatInterface;
  window.renderChatContext = renderChatContext;
  window.loadMoreMessages = loadMoreMessages;
  window.scrollToOriginalMessage = scrollToOriginalMessage;
  window.disposeChatMessageDom = disposeChatMessageDom;
  window.setAvatarActingState = setAvatarActingState;

  // ========== 从 script.js 迁移：openChatSettings ==========
