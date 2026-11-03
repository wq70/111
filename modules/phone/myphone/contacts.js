  async function showMyPhoneAddContactDialog() {
    const modal = document.getElementById('myphone-add-choice-modal');
    if (!modal) return;

    modal.classList.add('visible');
  }

  // 手动创建角色
  async function manualCreateMyPhoneContact() {
    // 关闭选择弹窗
    document.getElementById('myphone-add-choice-modal')?.classList.remove('visible');

    // 第一步：输入联系人名称
    const name = await showCustomPrompt('添加联系人 (1/3)', '请输入联系人名称');
    if (!name || !name.trim()) return;

    // 第二步：输入备注（可选）
    const remark = await showCustomPrompt('添加联系人 (2/3)', '请输入备注（可选，显示在列表中）', '', 'text');

    // 第三步：选择头像方式
    const avatarChoice = await showChoiceModal('添加联系人 (3/3)', [
      { text: '使用默认头像', value: 'default' },
      { text: '上传本地图片', value: 'upload' },
      { text: '输入图片URL', value: 'url' }
    ]);

    let finalAvatar = defaultAvatar;

    if (avatarChoice === 'upload') {
      // 上传本地图片
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';

      const avatarData = await new Promise((resolve) => {
        fileInput.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.readAsDataURL(file);
          } else {
            resolve(null);
          }
        };
        fileInput.click();
      });

      if (avatarData) {
        finalAvatar = avatarData;
      }
    } else if (avatarChoice === 'url') {
      // 输入URL
      const avatarUrl = await showCustomPrompt('输入头像URL', '请输入图片URL地址');
      if (avatarUrl && avatarUrl.trim()) {
        finalAvatar = avatarUrl.trim();
      }
    }

    // 添加联系人
    await addMyPhoneContact(name.trim(), remark ? remark.trim() : '', finalAvatar);

    // 刷新列表
    renderMyPhoneSimulatedQQ();
  }

  // 显示导入主屏幕角色弹窗
  async function showImportMainScreenCharacters() {
    // 关闭选择弹窗
    document.getElementById('myphone-add-choice-modal')?.classList.remove('visible');

    if (!activeMyPhoneCharacterId) return;
    const currentChar = state.chats[activeMyPhoneCharacterId];
    if (!currentChar) return;

    // 获取所有非群组角色，排除当前角色
    const allCharacters = Object.values(state.chats).filter(chat =>
      !chat.isGroup && chat.id !== activeMyPhoneCharacterId
    );

    if (allCharacters.length === 0) {
      showCustomAlert('提示', '没有可导入的角色');
      return;
    }

    // 渲染角色列表
    const listEl = document.getElementById('myphone-import-list');
    listEl.innerHTML = '';

    allCharacters.forEach(char => {
      const item = document.createElement('div');
      item.className = 'chat-list-item';
      item.style.padding = '15px';
      item.style.borderBottom = '1px solid var(--border-color)';
      item.style.cursor = 'pointer';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '15px';

      const charAvatar = char.settings.aiAvatar || defaultAvatar;

      // 获取最后一条消息
      const lastMessages = char.history.filter(m => !m.isHidden).slice(-10);
      const lastMsg = lastMessages.slice(-1)[0];
      let lastMsgText = '暂无消息';
      if (lastMsg) {
        if (typeof lastMsg.content === 'string') {
          lastMsgText = lastMsg.content.substring(0, 30);
        } else if (Array.isArray(lastMsg.content)) {
          lastMsgText = '[图片]';
        }
      }

      item.innerHTML = `
        <input type="checkbox" class="myphone-import-checkbox" data-char-id="${char.id}" style="width: 20px; height: 20px; cursor: pointer;">
        <img src="${charAvatar}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">
        <div style="flex: 1; overflow: hidden;">
          <div style="font-weight: 500; font-size: 16px; margin-bottom: 5px;">${char.name}</div>
          <div style="font-size: 14px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${lastMsgText}</div>
        </div>
      `;

      // 点击整行切换选中状态
      item.addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox') {
          const checkbox = item.querySelector('.myphone-import-checkbox');
          checkbox.checked = !checkbox.checked;
          updateImportSelectAllState();
        }
      });

      // checkbox 单独监听
      const checkbox = item.querySelector('.myphone-import-checkbox');
      checkbox.addEventListener('change', () => {
        updateImportSelectAllState();
      });

      listEl.appendChild(item);
    });

    // 显示弹窗
    document.getElementById('myphone-import-characters-modal').classList.add('visible');
  }

  // 更新全选状态
  function updateImportSelectAllState() {
    const allCheckboxes = document.querySelectorAll('.myphone-import-checkbox');
    const selectAllCheckbox = document.getElementById('select-all-myphone-import');

    if (allCheckboxes.length === 0) return;

    const checkedCount = Array.from(allCheckboxes).filter(cb => cb.checked).length;
    selectAllCheckbox.checked = checkedCount === allCheckboxes.length;
  }

  // 导入选中的角色
  async function importSelectedCharacters() {
    if (!activeMyPhoneCharacterId) return;
    const currentChar = state.chats[activeMyPhoneCharacterId];
    if (!currentChar) return;

    // 获取选中的角色ID
    const selectedCheckboxes = Array.from(document.querySelectorAll('.myphone-import-checkbox:checked'));

    if (selectedCheckboxes.length === 0) {
      showCustomAlert('提示', '请至少选择一个角色');
      return;
    }

    const selectedCharIds = selectedCheckboxes.map(cb => cb.dataset.charId);

    // 初始化数组
    if (!currentChar.myPhoneSimulatedQQConversations) {
      currentChar.myPhoneSimulatedQQConversations = [];
    }

    // 导入每个选中的角色
    let importCount = 0;
    for (const charId of selectedCharIds) {
      const char = state.chats[charId];
      if (!char) continue;

      // 检查是否已经存在
      const existingIndex = currentChar.myPhoneSimulatedQQConversations.findIndex(
        conv => conv.importedFromCharId === charId
      );

      if (existingIndex !== -1) {
        // 已存在，跳过
        continue;
      }

      // 获取最后10条消息
      const recentMessages = char.history.filter(m => !m.isHidden).slice(-10);

      // 转换消息格式 - 保持原始格式以兼容createMessageElement
      const convertedMessages = recentMessages.map(msg => {
        const isUser = msg.role === 'user';

        // 保持原始消息结构
        const convertedMsg = {
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp || Date.now(),
          sender: isUser ? (state.qzoneSettings.nickname || '我') : char.name
        };

        // 如果有其他属性，也保留
        if (msg.type) convertedMsg.type = msg.type;
        if (msg.imageUrl) convertedMsg.imageUrl = msg.imageUrl;
        if (msg.voiceUrl) convertedMsg.voiceUrl = msg.voiceUrl;
        if (msg.voiceText) convertedMsg.voiceText = msg.voiceText;
        if (msg.duration) convertedMsg.duration = msg.duration;

        return convertedMsg;
      });

      // 获取最后一条消息文本
      let lastMessageText = '暂无消息';
      if (convertedMessages.length > 0) {
        const lastMsg = convertedMessages[convertedMessages.length - 1];
        lastMessageText = lastMsg.content.substring(0, 30);
      }

      // 创建新联系人
      const newContact = {
        name: char.name,
        originalName: char.name,
        avatar: char.settings.aiAvatar || defaultAvatar,
        lastMessage: lastMessageText,
        messages: convertedMessages,
        isImported: true,
        importedFromCharId: charId
      };

      currentChar.myPhoneSimulatedQQConversations.push(newContact);
      importCount++;
    }

    // 保存到数据库
    await db.chats.put(currentChar);

    // 关闭弹窗
    document.getElementById('myphone-import-characters-modal').classList.remove('visible');

    // 刷新列表
    renderMyPhoneSimulatedQQ();

    // 显示成功提示
    showCustomAlert('成功', `已导入 ${importCount} 个角色`);
  }

  // 添加MY Phone联系人
  async function addMyPhoneContact(name, remark, avatar) {
    if (!activeMyPhoneCharacterId) return;
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) return;

    // 初始化数组
    if (!char.myPhoneSimulatedQQConversations) {
      char.myPhoneSimulatedQQConversations = [];
    }

    // 创建新联系人
    const newContact = {
      name: remark || name,
      originalName: name,
      avatar: avatar || defaultAvatar,
      lastMessage: '暂无消息',
      messages: [],
      isManuallyAdded: true // 标记为手动添加
    };

    // 添加到列表
    char.myPhoneSimulatedQQConversations.unshift(newContact);

    // 保存到数据库
    await db.chats.put(char);

    showCustomAlert('成功', `已添加联系人：${name}`);
  }

  // 打开联系人设置界面
  function openMyPhoneContactSettings() {
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) return;

    const index = window.currentMyPhoneConversationIndex;
    if (index === -1 || index === undefined) return;

    const contact = char.myPhoneSimulatedQQConversations[index];
    if (!contact) return;

    // 填充设置界面
    document.getElementById('myphone-settings-avatar-img').src = contact.avatar || defaultAvatar;
    document.getElementById('myphone-settings-name').value = contact.originalName || contact.name;
    document.getElementById('myphone-settings-remark').value = contact.name;

    // 渲染对话列表
    renderMyPhoneContactMessages(contact);

    switchToMyPhoneScreen('myphone-contact-settings-screen');
  }

  // 渲染联系人的对话列表
  function renderMyPhoneContactMessages(contact) {
    const listEl = document.getElementById('myphone-conversation-list');
    listEl.innerHTML = '';

    if (!contact.messages || contact.messages.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">暂无对话记录</p>';
      return;
    }

    contact.messages.forEach((msg, idx) => {
      const msgEl = document.createElement('div');
      msgEl.style.cssText = 'padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 8px; background: var(--secondary-bg);';

      // 根据消息类型显示不同内容
      let contentDisplay = '';
      let typeLabel = '';

      if (msg.type === 'voice_message') {
        typeLabel = '[语音]';
        contentDisplay = msg.content;
      } else if (msg.type === 'ai_image') {
        typeLabel = '[图片]';
        contentDisplay = msg.content;
      } else if (msg.type === 'transfer') {
        typeLabel = '[转账]';
        contentDisplay = `¥${msg.amount} - ${msg.note || ''}`;
      } else {
        contentDisplay = msg.content;
      }

      msgEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
          <div>
            <span style="font-weight: 500; color: var(--text-color);">${msg.role === 'user' ? '我' : contact.name}</span>
            ${typeLabel ? `<span style="margin-left: 8px; padding: 2px 6px; background: var(--accent-color); color: white; border-radius: 4px; font-size: 11px;">${typeLabel}</span>` : ''}
          </div>
          <button onclick="deleteMyPhoneMessage(${idx})" style="padding: 4px 8px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">删除</button>
        </div>
        <div style="color: var(--text-color);">${contentDisplay}</div>
      `;
      listEl.appendChild(msgEl);
    });
  }

  // 删除对话消息
  window.deleteMyPhoneMessage = async function (msgIndex) {
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) return;

    const index = window.currentMyPhoneConversationIndex;
    const contact = char.myPhoneSimulatedQQConversations[index];
    if (!contact) return;

    contact.messages.splice(msgIndex, 1);
    await db.chats.put(char);

    renderMyPhoneContactMessages(contact);
  };

  // 保存联系人设置
  async function saveMyPhoneContactSettings() {
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) return;

    const index = window.currentMyPhoneConversationIndex;
    const contact = char.myPhoneSimulatedQQConversations[index];
    if (!contact) return;

    const newName = document.getElementById('myphone-settings-name').value.trim();
    const newRemark = document.getElementById('myphone-settings-remark').value.trim();

    if (!newName) {
      showCustomAlert('提示', '联系人名称不能为空');
      return;
    }

    contact.originalName = newName;
    contact.name = newRemark || newName;

    await db.chats.put(char);

    showCustomAlert('成功', '设置已保存');

    // 返回对话界面
    await openMyPhoneConversation(index);
  }

  // 更换联系人头像
  async function changeMyPhoneContactAvatar() {
    const avatarChoice = await showChoiceModal('选择头像方式', [
      { text: '上传本地图片', value: 'upload' },
      { text: '输入图片URL', value: 'url' }
    ]);

    let newAvatar = null;

    if (avatarChoice === 'upload') {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';

      newAvatar = await new Promise((resolve) => {
        fileInput.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.readAsDataURL(file);
          } else {
            resolve(null);
          }
        };
        fileInput.click();
      });
    } else if (avatarChoice === 'url') {
      const avatarUrl = await showCustomPrompt('输入头像URL', '请输入图片URL地址');
      if (avatarUrl && avatarUrl.trim()) {
        newAvatar = avatarUrl.trim();
      }
    }

    if (newAvatar) {
      const char = state.chats[activeMyPhoneCharacterId];
      const index = window.currentMyPhoneConversationIndex;
      const contact = char.myPhoneSimulatedQQConversations[index];

      contact.avatar = newAvatar;
      document.getElementById('myphone-settings-avatar-img').src = newAvatar;

      await db.chats.put(char);
    }
  }

  // 添加对话消息
  async function addMyPhoneMessage() {
    const role = await showChoiceModal('选择发送者', [
      { text: '我发送', value: 'user' },
      { text: `${document.getElementById('myphone-settings-name').value}发送`, value: 'assistant' }
    ]);

    if (!role) return;

    // 选择消息类型
    const msgType = await showChoiceModal('选择消息类型', [
      { text: '文字消息', value: 'text' },
      { text: '图片', value: 'image' },
      { text: '语音', value: 'voice' },
      { text: '转账', value: 'transfer' }
    ]);

    if (!msgType) return;

    const char = state.chats[activeMyPhoneCharacterId];
    const index = window.currentMyPhoneConversationIndex;
    const contact = char.myPhoneSimulatedQQConversations[index];

    if (!contact.messages) {
      contact.messages = [];
    }

    let newMessage = {
      role: role,
      timestamp: new Date().toISOString()
    };

    let lastMsgPreview = '';

    if (msgType === 'text') {
      // 文字消息
      const content = await showCustomPrompt('输入消息内容', '请输入要添加的消息', '', 'textarea');
      if (!content || !content.trim()) return;

      newMessage.content = content.trim();
      lastMsgPreview = content.trim();

    } else if (msgType === 'image') {
      // 图片消息
      const description = await showCustomPrompt('图片描述', '请输入图片的中文描述');
      if (!description || !description.trim()) return;

      const imagePrompt = await showCustomPrompt('图片提示词（可选）', '请输入英文图片生成提示词（可选，留空则不生成图片）');

      newMessage.type = 'ai_image';
      newMessage.content = description.trim();
      if (imagePrompt && imagePrompt.trim()) {
        newMessage.image_prompt = imagePrompt.trim();
      }
      lastMsgPreview = '[图片]';

    } else if (msgType === 'voice') {
      // 语音消息
      const content = await showCustomPrompt('语音内容', '请输入语音的文字内容', '', 'textarea');
      if (!content || !content.trim()) return;

      newMessage.type = 'voice_message';
      newMessage.content = content.trim();
      lastMsgPreview = '[语音]';

    } else if (msgType === 'transfer') {
      // 转账消息
      const amount = await showCustomPrompt('转账金额', '请输入转账金额（数字）');
      if (!amount || !amount.trim()) return;

      const note = await showCustomPrompt('转账备注', '请输入转账备注（可选）');

      const senderName = role === 'user' ? (char.settings.myNickname || '我') : contact.name;
      const receiverName = role === 'user' ? contact.name : (char.settings.myNickname || '我');

      newMessage.type = 'transfer';
      newMessage.amount = parseFloat(amount.trim()) || 0;
      newMessage.note = note ? note.trim() : '转账';
      newMessage.senderName = senderName;
      newMessage.receiverName = receiverName;
      newMessage.status = 'accepted';
      newMessage.content = `转账 ¥${newMessage.amount}`;
      lastMsgPreview = '[转账]';
    }

    contact.messages.push(newMessage);

    // 更新最后一条消息
    contact.lastMessage = lastMsgPreview.substring(0, 20) + (lastMsgPreview.length > 20 ? '...' : '');

    await db.chats.put(char);

    renderMyPhoneContactMessages(contact);
  }

  // My Phone 转账操作相关函数
  let activeMyPhoneTransferTimestamp = null;

  function showMyPhoneTransferActionModal(timestamp) {
    activeMyPhoneTransferTimestamp = timestamp;

    const char = state.chats[activeMyPhoneCharacterId];
    const index = window.currentMyPhoneConversationIndex;

    let message;
    if (index === -1) {
      // 与角色的真实对话
      message = char.history.find(m => m.timestamp === timestamp);
    } else {
      // 模拟对话
      const contact = char.myPhoneSimulatedQQConversations[index];
      message = contact.messages.find(m => m.timestamp === timestamp);
    }

    if (message) {
      document.getElementById('transfer-sender-name').textContent = message.senderName || '对方';
    }
    document.getElementById('transfer-actions-modal').classList.add('visible');
  }

  async function handleMyPhoneTransferResponse(choice) {
    if (!activeMyPhoneTransferTimestamp) return;

    const timestamp = activeMyPhoneTransferTimestamp;
    const char = state.chats[activeMyPhoneCharacterId];
    const index = window.currentMyPhoneConversationIndex;

    let message, messageArray;

    if (index === -1) {
      // 与角色的真实对话
      messageArray = char.history;
      message = messageArray.find(m => m.timestamp === timestamp);
    } else {
      // 模拟对话
      const contact = char.myPhoneSimulatedQQConversations[index];
      messageArray = contact.messages;
      message = messageArray.find(m => m.timestamp === timestamp);
    }

    if (!message) return;

    // 防止重复点击
    if (message.status && message.status !== 'pending') {
      hideTransferActionModal();
      return;
    }

    let transferAmount = parseFloat(message.amount);
    if (isNaN(transferAmount)) {
      transferAmount = 0;
    }

    message.status = choice;
    const names = window.RemarkNames.participantNames(char);

    if (choice === 'declined') {
      // 拒收逻辑 - 添加退款消息
      const refundMessage = {
        role: 'user',
        type: 'transfer',
        isRefund: true,
        amount: transferAmount,
        note: '已拒收对方转账',
        senderName: char.settings.myNickname || '我',
        receiverName: message.senderName,
        timestamp: Date.now(),
        status: 'accepted'
      };
      messageArray.push(refundMessage);

      // 如果是真实对话，添加隐藏系统消息
      if (index === -1) {
        const hiddenMessage = {
          role: 'system',
          content: `[系统提示：${names.user}退还了${names.character}的转账。]`,
          timestamp: Date.now() + 1,
          isHidden: true
        };
        messageArray.push(hiddenMessage);
      }
    } else {
      // 接收逻辑
      if (transferAmount > 0 && index === -1) {
        // 只有真实对话才记账
        const success = await processTransaction(transferAmount, 'income', `收到转账-${message.senderName}`);

        if (success) {
          await showCustomAlert("收款成功", `已存入余额：+ ¥${transferAmount.toFixed(2)}`);

          // 添加已收款消息
          const receivedMessage = {
            role: 'user',
            type: 'transfer',
            isReceived: true,
            amount: transferAmount,
            note: '已收款',
            senderName: '我',
            receiverName: message.senderName,
            timestamp: Date.now(),
            status: 'accepted'
          };
          messageArray.push(receivedMessage);
        } else {
          alert("警告：金额入账失败！");
        }
      }

      // 如果是真实对话，添加隐藏系统消息
      if (index === -1) {
        const hiddenMessage = {
          role: 'system',
          content: `[系统提示：${names.user}收下了${names.character}的转账。]`,
          timestamp: Date.now() + 1,
          isHidden: true
        };
        messageArray.push(hiddenMessage);
      }
    }

    // 保存更改
    await db.chats.put(char);

    // 关闭弹窗并刷新界面
    hideTransferActionModal();
    activeMyPhoneTransferTimestamp = null;

    // 重新打开对话以刷新显示
    await openMyPhoneConversation(index);
  }


  function applyMyPhoneAppIcons() {
    // 先保存所有 MyPhone 应用图标的默认 src（如果还没保存的话）
    const iconElements = document.querySelectorAll('[id^="myphone-icon-img-"]');
    iconElements.forEach(img => {
      if (!img.dataset.defaultSrc) {
        img.dataset.defaultSrc = img.src;
      }
    });

    if (!state.globalSettings.myphoneAppIcons) return;

    for (const iconId in state.globalSettings.myphoneAppIcons) {
      const imgElement = document.getElementById(`myphone-icon-img-${iconId}`);
      if (imgElement) {
        imgElement.src = state.globalSettings.myphoneAppIcons[iconId];
      }
    }
  }

  async function openMyPhoneApp(appName) {
    if (!activeMyPhoneCharacterId) return;
    const char = state.chats[activeMyPhoneCharacterId];

    // 不再自动记录APP使用，改为只能手动添加或API生成

    switch (appName) {
      case 'qq':
        renderMyPhoneSimulatedQQ();
        switchToMyPhoneScreen('myphone-qq-screen');
        break;
      case 'album':
        renderMyPhoneAlbum();
        switchToMyPhoneScreen('myphone-album-screen');
        break;
      case 'browser':
        renderMyPhoneBrowserHistory();
        switchToMyPhoneScreen('myphone-browser-screen');
        break;
      case 'taobao':
        renderMyPhoneTaobao();
        switchToMyPhoneScreen('myphone-taobao-screen');
        break;
      case 'memo':
        renderMyPhoneMemoList();
        switchToMyPhoneScreen('myphone-memo-screen');
        break;
      case 'diary':
        renderMyPhoneDiaryList();
        switchToMyPhoneScreen('myphone-diary-screen');
        break;
      case 'amap':
        renderMyPhoneAmap();
        switchToMyPhoneScreen('myphone-amap-screen');
        break;
      case 'music':
        renderMyPhoneMusicScreen();
        switchToMyPhoneScreen('myphone-music-screen');
        break;
      case 'usage':
        renderMyPhoneAppUsage();
        switchToMyPhoneScreen('myphone-usage-screen');
        break;
    }
  }

  // logMyPhoneAppUsage 函数已移除，MYphone不再自动记录APP使用
  // APP使用记录现在只能通过手动添加或API生成


