// ============================================================
// chat-input.js
// 聊天输入模块：sendSticker、sendUserTransfer、sendWaimaiOrderForAI、
// sendLocationShare、enterSelectionMode、exitSelectionMode、
// toggleMessageSelection、addLongPressListener、startReplyToMessage、
// cancelReplyMode、showTransferActionModal、hideTransferActionModal
// 从 script.js 第 19174~19471 + 30934~31012 行拆分
// ============================================================

  async function sendSticker(sticker) {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    const msg = {
      role: 'user',
      content: sticker.url,
      meaning: sticker.name,
      timestamp: Date.now()
    };
    chat.history.push(msg);
    await db.chats.put(chat);
    appendMessage(msg, chat);
    renderChatList();
    document.getElementById('sticker-panel').classList.remove('visible');
  }

  // --- 修复版V2：转账 (修复ID解析bug，确保扣款和记账) ---
  async function sendUserTransfer() {
    if (!state.activeChatId) return;
    const amountInput = document.getElementById('transfer-amount');
    const noteInput = document.getElementById('transfer-note');
    const amount = parseFloat(amountInput.value);
    const note = noteInput.value.trim();

    if (isNaN(amount) || amount <= 0) {
      document.getElementById('custom-modal-overlay').style.zIndex = 3002;
      await showCustomAlert('提示', '请输入有效的转账金额(必须大于0)！');
      document.getElementById('custom-modal-overlay').style.zIndex = '';
      return;
    }

    const chat = state.chats[state.activeChatId];
    const senderName = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
    const receiverName = chat.isGroup ? '群聊' : chat.name;

    // 1. 获取钱包数据
    const wallet = await db.userWallet.get('main') || { balance: 0, kinshipCards: [] };
    const balance = wallet.balance || 0;
    const kinshipCards = wallet.kinshipCards || [];

    // 2. 构建支付选项 UI
    const paymentOptions = [];
    const iconWallet = `<div class="pay-opt-icon" style="background:#1677ff; display:flex; align-items:center; justify-content:center; color:white; font-size:14px; border-radius:4px;">支</div>`;
    const iconKinship = `<div class="pay-opt-icon" style="background:linear-gradient(135deg, #ff5252, #ff1744); display:flex; align-items:center; justify-content:center; color:white; font-size:14px; border-radius:4px;">亲</div>`;

    // 选项：余额
    if (balance >= amount) {
      paymentOptions.push({
        text: `<div class="pay-opt-left">${iconWallet}<div class="pay-opt-info"><span class="pay-opt-title">账户余额</span><span class="pay-opt-desc">剩余 ¥${balance.toFixed(2)}</span></div></div>`,
        value: 'balance'
      });
    }

    // 选项：亲属卡
    for (const card of kinshipCards) {
      const remaining = card.limit - (card.spent || 0);
      if (remaining >= amount) {
        const providerChat = state.chats[card.chatId];
        const providerName = providerChat ? providerChat.name : '未知角色';
        paymentOptions.push({
          text: `<div class="pay-opt-left">${iconKinship}<div class="pay-opt-info"><span class="pay-opt-title">亲属卡 - ${providerName}</span><span class="pay-opt-desc">剩余额度 ¥${remaining.toFixed(2)}</span></div></div>`,
          value: `kinship_${card.chatId}` // 格式如: kinship_chat_172839...
        });
      }
    }

    if (paymentOptions.length === 0) {
      document.getElementById('custom-modal-overlay').style.zIndex = 3002;
      await showCustomAlert('支付失败', `余额或亲属卡额度不足！\n需要: ¥${amount.toFixed(2)}`);
      document.getElementById('custom-modal-overlay').style.zIndex = '';
      return;
    }

    // 3. 弹出选择
    const modalOverlay = document.getElementById('custom-modal-overlay');
    modalOverlay.style.zIndex = 3002;
    const paymentMethod = await showChoiceModal(`转账 ¥${amount.toFixed(2)}`, paymentOptions);
    modalOverlay.style.zIndex = '';

    if (!paymentMethod) return;

    // 4. 执行扣款和记账
    if (paymentMethod === 'balance') {
      const success = await processTransaction(amount, 'expense', `转账给-${receiverName}`);
      if (!success) return;
    } else if (paymentMethod.startsWith('kinship_')) {
      // 【修复重点】：使用 replace 提取完整 ID，而不是 split
      // 之前的 split('_')[1] 会把 'chat_123' 截断成 'chat'，导致找不到卡片
      const cardChatId = paymentMethod.replace('kinship_', '');

      const cardIndex = wallet.kinshipCards.findIndex(c => c.chatId === cardChatId);

      if (cardIndex > -1) {
        // A. 扣减额度
        wallet.kinshipCards[cardIndex].spent = (wallet.kinshipCards[cardIndex].spent || 0) + amount;
        await db.userWallet.put(wallet); // 保存回数据库

        // B. 写入账单
        await db.userTransactions.add({
          timestamp: Date.now(),
          type: 'expense',
          amount: amount,
          description: `亲属卡转账-给${receiverName}`
        });

        // C. 通知金主 (系统消息)
        const providerChat = state.chats[cardChatId];
        if (providerChat) {
          let notifyContent = (cardChatId === chat.id)
            ? `[消费通知：用户使用你的亲属卡向【你】转账了 ¥${amount.toFixed(2)}。]`
            : `[消费通知：用户使用你的亲属卡向【${receiverName}】转账了 ¥${amount.toFixed(2)}。]`;

          providerChat.history.push({ role: 'system', content: notifyContent, timestamp: Date.now(), isHidden: true });
          await db.chats.put(providerChat);
        }
      } else {
        alert("系统错误：找不到对应的亲属卡记录，支付取消。");
        return;
      }
    }

    // 5. 消息上屏
    const msg = {
      role: 'user',
      type: 'transfer',
      amount: amount,
      note: note,
      senderName,
      receiverName,
      timestamp: Date.now()
    };
    chat.history.push(msg);
    await db.chats.put(chat);
    appendMessage(msg, chat);
    renderChatList();

    document.getElementById('transfer-modal').classList.remove('visible');
    amountInput.value = '';
    noteInput.value = '';
  }


  async function sendWaimaiOrderForAI() {
    if (!state.activeChatId) return;

    const productInfoInput = document.getElementById('waimai-product-info');
    const amountInput = document.getElementById('waimai-amount');

    const productInfo = productInfoInput.value.trim();
    const amount = parseFloat(amountInput.value);

    // 1. 校验金额必须大于0
    if (!productInfo || isNaN(amount) || amount <= 0) {
      // 临时提升弹窗层级，防止被外卖弹窗遮挡
      document.getElementById('custom-modal-overlay').style.zIndex = 3002;
      await showCustomAlert('提示', '请填写有效的商品信息和金额(必须大于0)！');
      document.getElementById('custom-modal-overlay').style.zIndex = '';
      return;
    }

    const chat = state.chats[state.activeChatId];
    const now = Date.now();
    const myNickname = chat.isGroup ? (chat.settings.myNickname || '我') : '我';

    // 【新增】执行扣款逻辑
    // 同样需要处理弹窗层级，防止"余额不足"提示被遮挡
    const modalOverlay = document.getElementById('custom-modal-overlay');
    modalOverlay.style.zIndex = 3002; // 比 waimai-request-modal 高

    const success = await processTransaction(amount, 'expense', `为TA点外卖-${productInfo}`);

    modalOverlay.style.zIndex = ''; // 恢复层级

    if (!success) return; // 余额不足，停止执行

    const visibleMessage = {
      role: 'user',
      senderName: myNickname,
      type: 'waimai_order',
      productInfo: productInfo,
      amount: amount,
      timestamp: now
    };
    chat.history.push(visibleMessage);


    const hiddenMessage = {
      role: 'system',
      content: `[系统提示：用户(${myNickname})为你点了一份外卖作为【礼物】。外卖内容是"${productInfo}"，价值${amount}元。这不是一个代付请求，而是用户已经为你支付了。请你对此表示感谢。]`,
      timestamp: now + 1,
      isHidden: true
    };
    chat.history.push(hiddenMessage);


    await db.chats.put(chat);
    appendMessage(visibleMessage, chat);
    renderChatList();


    productInfoInput.value = '';
    amountInput.value = '';
    document.getElementById('waimai-request-modal').classList.remove('visible');
  }

  async function sendLocationShare() {
    if (!state.activeChatId) return;


    const locationName = await showCustomPrompt("共享位置", "你现在在哪里呀？", "");


    if (!locationName || !locationName.trim()) return;



    const hardcodedImageUrl = 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1756262526935_qdqqd_4uque3.jpeg';

    const chat = state.chats[state.activeChatId];


    const msg = {
      role: 'user',
      type: 'location_share',
      content: locationName.trim(),
      imageUrl: hardcodedImageUrl,
      timestamp: Date.now()
    };


    chat.history.push(msg);
    await db.chats.put(chat);
    appendMessage(msg, chat);
    renderChatList();
  }


  function enterSelectionMode(initialMsgTimestamp) {
    if (isSelectionMode) return;
    isSelectionMode = true;
    document.getElementById('chat-interface-screen').classList.add('selection-mode');
    toggleMessageSelection(initialMsgTimestamp);
  }

  function exitSelectionMode() {
    cleanupWaimaiTimers();
    if (!isSelectionMode) return;
    isSelectionMode = false;
    document.getElementById('chat-interface-screen').classList.remove('selection-mode');
    selectedMessages.forEach(ts => {
      const bubble = document.querySelector(`.message-bubble[data-timestamp="${ts}"]`);
      if (bubble) bubble.classList.remove('selected');
    });
    selectedMessages.clear();
  }


  function toggleMessageSelection(timestamp) {

    const elementToSelect = document.querySelector(
      `.message-bubble[data-timestamp="${timestamp}"]`
    );

    if (!elementToSelect) return;

    if (selectedMessages.has(timestamp)) {
      selectedMessages.delete(timestamp);
      elementToSelect.classList.remove('selected');
    } else {
      selectedMessages.add(timestamp);
      elementToSelect.classList.add('selected');
    }

    document.getElementById('selection-count').textContent = `已选 ${selectedMessages.size} 条`;

    if (selectedMessages.size === 0) {
      exitSelectionMode();
    }
  }


  function addLongPressListener(element, callback) {
    let pressTimer;
    const startPress = (e) => {
      if (isSelectionMode) return;
      e.preventDefault();
      pressTimer = window.setTimeout(() => callback(e), 500);
    };
    const cancelPress = () => clearTimeout(pressTimer);
    element.addEventListener('mousedown', startPress);
    element.addEventListener('mouseup', cancelPress);
    element.addEventListener('mouseleave', cancelPress);
    element.addEventListener('touchstart', startPress, {
      passive: true
    });
    element.addEventListener('touchend', cancelPress);
    element.addEventListener('touchmove', cancelPress);
  }

  function startReplyToMessage() {
    if (!activeMessageTimestamp) return;

    const chat = state.chats[state.activeChatId];
    const message = chat.history.find(m => m.timestamp === activeMessageTimestamp && !m.isHidden);
    if (!message) return;


    let senderDisplayName;
    if (message.role === 'user') {
      senderDisplayName = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
    } else {
      if (chat.isGroup) {

        senderDisplayName = getDisplayNameInGroup(chat, message.senderName);
      } else {

        senderDisplayName = chat.name;
      }
    }


    const fullContent = String(message.content || '');
    let previewSnippet = '';

    if (typeof message.content === 'string' && STICKER_REGEX.test(message.content)) {
      previewSnippet = '[表情]';
    } else if (message.type === 'ai_image' || message.type === 'user_photo') {
      previewSnippet = '[图片]';
    } else if (message.type === 'voice_message') {
      previewSnippet = '[语音]';
    } else {
      previewSnippet = fullContent.substring(0, 50) + (fullContent.length > 50 ? '...' : '');
    }

    currentReplyContext = {
      timestamp: message.timestamp,
      senderName: senderDisplayName,
      content: fullContent,
    };

    const previewBar = document.getElementById('reply-preview-bar');
    previewBar.querySelector('.sender').textContent = `回复 ${currentReplyContext.senderName}:`;
    previewBar.querySelector('.text').textContent = previewSnippet;
    previewBar.style.display = 'block';

    hideMessageActions();
    document.getElementById('chat-input').focus();
  }

  function cancelReplyMode() {
    currentReplyContext = null;
    document.getElementById('reply-preview-bar').style.display = 'none';
  }





  // activeTransferTimestamp 已在 utils.js 中声明为全局变量


  function showTransferActionModal(timestamp) {
    activeTransferTimestamp = timestamp;

    const chat = state.chats[state.activeChatId];
    const message = chat.history.find(m => m.timestamp === timestamp);
    if (message) {

      document.getElementById('transfer-sender-name').textContent = message.senderName;
    }
    document.getElementById('transfer-actions-modal').classList.add('visible');
  }


  function hideTransferActionModal() {
    document.getElementById('transfer-actions-modal').classList.remove('visible');
    activeTransferTimestamp = null;
  }

// ========== 转账响应处理（从 script.js 补充拆分，原第 26814~26917 行） ==========

  async function handleUserTransferResponse(choice) {
    if (!activeTransferTimestamp) return;

    const timestamp = activeTransferTimestamp;
    const chat = state.chats[state.activeChatId];
    const messageIndex = chat.history.findIndex(m => m.timestamp === timestamp);
    if (messageIndex === -1) return;

    const originalMessage = chat.history[messageIndex];

    // 防止重复点击
    if (originalMessage.status && originalMessage.status !== 'pending') {
      hideTransferActionModal();
      return;
    }

    let transferAmount = parseFloat(originalMessage.amount);
    if (isNaN(transferAmount)) {
      console.warn("消息中 amount 字段无效，尝试修复...");
      transferAmount = 0;
    }

    originalMessage.status = choice;
    let systemContent;

    if (choice === 'declined') {
      const refundMessage = {
        role: 'user',
        type: 'transfer',
        isRefund: true,
        amount: transferAmount,
        note: '已拒收对方转账',
        timestamp: Date.now()
      };
      chat.history.push(refundMessage);
      systemContent = `[系统提示：你拒绝并退还了"${originalMessage.senderName}"的转账。]`;

    } else {
      if (transferAmount > 0) {
        const senderCurrency = getCurrencyForChat(chat);
        const cnyAmount = convertToCNY(transferAmount, senderCurrency);

        const success = await processTransaction(cnyAmount, 'income', `收到转账-${originalMessage.senderName}`);

        if (success) {
          let alertMessage;
          if (senderCurrency.code !== 'CNY') {
            alertMessage = `已收款 ${senderCurrency.symbol}${transferAmount.toFixed(2)}\n汇率: 1 ${senderCurrency.code} = ${senderCurrency.rate} CNY\n\n已存入余额：¥${cnyAmount.toFixed(2)}`;
          } else {
            alertMessage = `已存入余额：+ ¥${cnyAmount.toFixed(2)}`;
          }
          await showCustomAlert("收款成功", alertMessage);

          const receivedMessage = {
            role: 'user',
            type: 'transfer',
            isReceived: true,
            amount: transferAmount,
            note: '已收款',
            senderName: '我',
            receiverName: originalMessage.senderName,
            timestamp: Date.now()
          };
          chat.history.push(receivedMessage);
        } else {
          alert("警告：金额入账失败，请检查控制台日志！");
        }
      } else {
        alert("无法收款：该转账金额无效 (0元或数据损坏)。");
      }

      systemContent = `[系统提示：你接受了"${originalMessage.senderName}"的转账。]`;
    }

    const hiddenMessage = {
      role: 'system',
      content: systemContent,
      timestamp: Date.now() + 1,
      isHidden: true
    };
    chat.history.push(hiddenMessage);

    await db.chats.put(chat);
    hideTransferActionModal();
    renderChatInterface(state.activeChatId);
    renderChatList();
  }

  // ========== 全局暴露 ==========
  window.cancelReplyMode = cancelReplyMode;
  window.startReplyToMessage = startReplyToMessage;
