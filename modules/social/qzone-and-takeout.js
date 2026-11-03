// ============================================================
// misc-features.js
// 杂项功能模块：QZone帖子操作、联系人选择器/群创建、成员管理、外卖功能等、NPC管理
// 从 script.js 第 24578~25432 行拆分
// ============================================================

  let isAddingNpcToGroup = false;

  function showPostActions(postId) {
    activePostId = postId;
    document.getElementById('post-actions-modal').classList.add('visible');
  }


  function hidePostActions() {
    document.getElementById('post-actions-modal').classList.remove('visible');
    activePostId = null;
  }


  async function openPostEditor() {
    if (!activePostId) return;

    const postIdToEdit = activePostId;
    const post = await db.qzonePosts.get(postIdToEdit);
    if (!post) return;

    hidePostActions();


    let contentForEditing;
    if (post.type === 'shuoshuo') {
      contentForEditing = post.content;
    } else {

      const postObject = {
        type: post.type,
        publicText: post.publicText || '',
      };
      if (post.type === 'image_post') {
        postObject.imageUrl = post.imageUrl;
        postObject.imageDescription = post.imageDescription;
      } else if (post.type === 'text_image') {
        postObject.hiddenContent = post.hiddenContent;
      }
      contentForEditing = JSON.stringify(postObject, null, 2);
    }


    const templates = {
      shuoshuo: "在这里输入说说的内容...",
      image: {
        type: 'image_post',
        publicText: '',
        imageUrl: 'https://...',
        imageDescription: ''
      },
      text_image: {
        type: 'text_image',
        publicText: '',
        hiddenContent: ''
      }
    };

    const helpersHtml = `
                <div class="format-helpers">
                    <button class="format-btn" data-type="text">说说</button>
                    <button class="format-btn" data-template='${JSON.stringify(templates.image)}'>图片动态</button>
                    <button class="format-btn" data-template='${JSON.stringify(templates.text_image)}'>文字图</button>
                </div>
            `;

    const newContent = await showCustomPrompt(
      '编辑动态',
      '在此修改内容...',
      contentForEditing,
      'textarea',
      helpersHtml
    );



    setTimeout(() => {
      const shuoshuoBtn = document.querySelector('#custom-modal-body .format-btn[data-type="text"]');
      if (shuoshuoBtn) {
        shuoshuoBtn.addEventListener('click', () => {
          const input = document.getElementById('custom-prompt-input');
          input.value = templates.shuoshuo;
          input.focus();
        });
      }
    }, 100);

    if (newContent !== null) {
      await saveEditedPost(postIdToEdit, newContent);
    }
  }


  async function saveEditedPost(postId, newRawContent) {
    const post = await db.qzonePosts.get(postId);
    if (!post) return;

    const trimmedContent = newRawContent.trim();


    try {
      const parsed = JSON.parse(trimmedContent);

      post.type = parsed.type || 'image_post';
      post.publicText = parsed.publicText || '';
      post.imageUrl = parsed.imageUrl || '';
      post.imageDescription = parsed.imageDescription || '';
      post.hiddenContent = parsed.hiddenContent || '';
      post.content = '';
    } catch (e) {

      post.type = 'shuoshuo';
      post.content = trimmedContent;

      post.publicText = '';
      post.imageUrl = '';
      post.imageDescription = '';
      post.hiddenContent = '';
    }

    await db.qzonePosts.put(post);
    await renderQzonePosts();
    await showCustomAlert('成功', '动态已更新！');
  }


  async function copyPostContent() {
    if (!activePostId) return;
    const post = await db.qzonePosts.get(activePostId);
    if (!post) return;

    let textToCopy = post.content || post.publicText || post.hiddenContent || post.imageDescription || "（无文字内容）";

    try {
      await navigator.clipboard.writeText(textToCopy);
      await showCustomAlert('复制成功', '动态内容已复制到剪贴板。');
    } catch (err) {
      await showCustomAlert('复制失败', '无法访问剪贴板。');
    }

    hidePostActions();
  }


  let selectedContacts = new Set();

  async function openContactPickerForGroupCreate() {

    const choice = await showChoiceModal('创建群聊', [{
      text: '创建普通群聊 (我参与)',
      value: 'normal'
    },
    {
      text: '创建旁观单聊 (2人聊天)',
      value: 'spectator_private'
    },
    {
      text: '创建旁观群聊 (多人围观)',
      value: 'spectator'
    }
    ]);

    if (choice === 'normal') {

      selectedContacts.clear();
      const confirmBtn = document.getElementById('confirm-contact-picker-btn');
      const newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
      newConfirmBtn.addEventListener('click', handleCreateGroup);
      await renderContactPicker();
      showScreen('contact-picker-screen');

    } else if (choice === 'spectator') {

      openSpectatorGroupCreator();

    } else if (choice === 'spectator_private') {

      openSpectatorPrivateCreator();
    }
  }




  async function openSpectatorGroupCreator() {
    currentSpectatorMode = 'group';
    selectedContacts.clear();


    const confirmBtn = document.getElementById('confirm-contact-picker-btn');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', handleCreateSpectatorGroup);


    await renderSpectatorContactPicker();


    showScreen('contact-picker-screen');
  }

  async function openSpectatorPrivateCreator() {
    currentSpectatorMode = 'private';
    selectedContacts.clear();

    const confirmBtn = document.getElementById('confirm-contact-picker-btn');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', handleCreateSpectatorGroup);

    await renderSpectatorContactPicker();

    showScreen('contact-picker-screen');
  }
  async function renderSpectatorContactPicker() {
    const listEl = document.getElementById('contact-picker-list');
    listEl.innerHTML = '';


    const characters = Object.values(state.chats).filter(chat => !chat.isGroup);

    const npcs = await db.npcs.toArray();

    if (characters.length === 0 && npcs.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color:#8a8a8a; margin-top:50px;">还没有任何角色或NPC可以加入群聊。</p>';
      return;
    }


    characters.forEach(contact => {
      const item = document.createElement('div');
      item.className = 'contact-picker-item';
      item.dataset.contactId = contact.id;
      item.innerHTML = `
            <div class="checkbox"></div>
            <img src="${contact.settings.aiAvatar || defaultAvatar}" class="avatar">
            <span class="name">${escapeHTML(window.CharacterIdentity.display(contact.originalName, contact.id))} <small style="color:#888;">(角色)</small></span>
        `;
      listEl.appendChild(item);
    });


    npcs.forEach(npc => {
      const item = document.createElement('div');
      item.className = 'contact-picker-item';
      item.dataset.contactId = npc.id;
      item.dataset.isNpc = "true";
      item.innerHTML = `
            <div class="checkbox"></div>
            <img src="${npc.avatar || defaultGroupMemberAvatar}" class="avatar">
            <span class="name">${npc.name} <small style="color:#007722;">(NPC)</small></span>
        `;
      listEl.appendChild(item);
    });

    updateContactPickerConfirmButton();
  }


  async function handleCreateSpectatorGroup() {

    if (currentSpectatorMode === 'private' && selectedContacts.size !== 2) {
      alert("旁观单聊必须选择【正好 2 位】成员。");
      return;
    }
    if (currentSpectatorMode === 'group' && selectedContacts.size < 2) {
      alert("旁观群聊至少需要选择 2 个成员。");
      return;
    }


    const groupName = await showCustomPrompt('设置群名', '请输入群聊的名字', 'AI们的茶话会');
    if (!groupName || !groupName.trim()) return;

    const newChatId = 'group_' + Date.now();
    const members = [];
    const allNpcs = await db.npcs.toArray();

    for (const contactId of selectedContacts) {
      const isNpc = document.querySelector(`.contact-picker-item[data-contact-id="${contactId}"]`).dataset.isNpc === "true";

      if (isNpc) {

        const npcData = allNpcs.find(n => n.id === parseInt(contactId));
        if (npcData) {
          members.push({
            id: `npc_${npcData.id}`,
            originalName: npcData.name,
            groupNickname: npcData.name,
            persona: npcData.persona,
            avatar: npcData.avatar || defaultGroupMemberAvatar,
            isNpc: true
          });
        }
      } else {

        const contactChat = state.chats[contactId];
        if (contactChat) {
          members.push({
            id: contactId,
            originalName: contactChat.originalName,
            groupNickname: contactChat.name,
            persona: contactChat.settings.aiPersona,
            avatar: contactChat.settings.aiAvatar || defaultAvatar,
            isNpc: false
          });
        }
      }
    }

    let spectatorIncludeUserMemoryForMemberIds = [];
    if (currentSpectatorMode === 'group' && members.some(m => !m.isNpc)) {
      const selected = await showSpectatorMemorySelectionModal(members);
      spectatorIncludeUserMemoryForMemberIds = selected || members.filter(m => !m.isNpc).map(m => m.id);
    }

    const newGroupChat = {
      id: newChatId,
      name: groupName.trim(),
      isGroup: true,
      isSpectatorGroup: true,
      members: members,
      settings: {
        spectatorIncludeUserMemoryForMemberIds: spectatorIncludeUserMemoryForMemberIds,
        maxMemory: 10,
        groupAvatar: defaultGroupAvatar,
        background: '',
        theme: 'default',
        fontSize: 13,
        customCss: '',
        linkedWorldBookIds: [],
      },
      history: [{
        role: 'system',
        content: '[系统指令：这是一个没有用户参与的群聊，请你们根据各自的人设自由地开始对话。]',
        timestamp: Date.now(),
        isHidden: true
      }],
      musicData: {
        totalTime: 0
      }
    };

    state.chats[newChatId] = newGroupChat;
    window.applyDefaultChatSettings?.(newGroupChat);
    await db.chats.put(newGroupChat);

    await renderChatList();
    showScreen('chat-list-screen');
    openChat(newChatId);
  }

  async function renderContactPicker() {
    const listEl = document.getElementById('contact-picker-list');
    listEl.innerHTML = '';


    const characters = Object.values(state.chats).filter(chat => !chat.isGroup);
    const npcs = await db.npcs.toArray();

    if (characters.length === 0 && npcs.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color:#8a8a8a; margin-top:50px;">还没有可以拉进群的联系人哦~</p>';
      return;
    }


    characters.forEach(contact => {
      const item = document.createElement('div');
      item.className = 'contact-picker-item';
      item.dataset.contactId = contact.id;
      item.innerHTML = `
            <div class="checkbox"></div>
            <img src="${contact.settings.aiAvatar || defaultAvatar}" class="avatar">
            <span class="name">${escapeHTML(window.CharacterIdentity.display(contact.originalName, contact.id))} <small style="color:#888;">(角色)</small></span>
        `;
      listEl.appendChild(item);
    });


    npcs.forEach(npc => {
      const item = document.createElement('div');
      item.className = 'contact-picker-item';

      item.dataset.contactId = `npc_${npc.id}`;
      item.innerHTML = `
            <div class="checkbox"></div>
            <img src="${npc.avatar || defaultGroupMemberAvatar}" class="avatar">
            <span class="name">${npc.name} <small style="color:#007722;">(NPC)</small></span>
        `;
      listEl.appendChild(item);
    });

    updateContactPickerConfirmButton();
  }

  function updateContactPickerConfirmButton() {
    const btn = document.getElementById('confirm-contact-picker-btn');

    if (currentSpectatorMode === 'private') {

      btn.textContent = `完成(${selectedContacts.size}/2)`;
      btn.disabled = selectedContacts.size !== 2;
    } else {

      btn.textContent = `完成(${selectedContacts.size})`;
      btn.disabled = selectedContacts.size < 2;
    }
  }

  async function handleCreateGroup() {
    if (selectedContacts.size < 2) {
      alert("创建群聊至少需要选择2个联系人。");
      return;
    }

    const groupName = await showCustomPrompt('设置群名', '请输入群聊的名字', '我们的群聊');
    if (!groupName || !groupName.trim()) return;

    const newChatId = 'group_' + Date.now();
    const members = [];
    const allNpcs = await db.npcs.toArray();

    for (const contactId of selectedContacts) {

      if (contactId.startsWith('npc_')) {
        const npcId = parseInt(contactId.replace('npc_', ''));
        const npcData = allNpcs.find(n => n.id === npcId);
        if (npcData) {
          members.push({
            id: contactId,
            originalName: npcData.name,
            groupNickname: npcData.name,
            persona: npcData.persona,
            avatar: npcData.avatar || defaultGroupMemberAvatar,
            isNpc: true
          });
        }
      } else {
        const contactChat = state.chats[contactId];
        if (contactChat) {
          members.push({
            id: contactId,
            originalName: contactChat.originalName,
            groupNickname: contactChat.name,
            persona: contactChat.settings.aiPersona,
            avatar: contactChat.settings.aiAvatar || defaultAvatar,
            isNpc: false
          });
        }
      }
    }

    const newGroupChat = {
      id: newChatId,
      name: groupName.trim(),
      isGroup: true,
      members: members,
      settings: {
        myPersona: '我是谁呀。',
        myNickname: '我',
        maxMemory: 10,
        groupAvatar: defaultGroupAvatar,
        myAvatar: defaultMyGroupAvatar,
        background: '',
        theme: 'default',
        fontSize: 13,
        customCss: '',
        linkedWorldBookIds: [],
      },
      history: [],
      musicData: {
        totalTime: 0
      }
    };

    state.chats[newChatId] = newGroupChat;
    window.applyDefaultChatSettings?.(newGroupChat);
    await db.chats.put(newGroupChat);

    await renderChatList();
    showScreen('chat-list-screen');
    openChat(newChatId);
  }




  function openMemberManagementScreen() {
    if (!state.activeChatId || !state.chats[state.activeChatId].isGroup) return;
    renderMemberManagementList();
    showScreen('member-management-screen');
  }

  function renderMemberManagementList() {
    const listEl = document.getElementById('member-management-list');
    const chat = state.chats[state.activeChatId];
    listEl.innerHTML = '';

    chat.members.forEach(member => {
      const item = document.createElement('div');
      item.className = 'member-management-item';

      item.innerHTML = `
                    <img src="${member.avatar}" class="avatar">
                    <span class="name">${escapeHTML(window.CharacterIdentity.display(member.originalName, member.id, chat))}</span>
                    <button class="remove-member-btn" data-member-id="${member.id}" title="移出群聊">-</button>
                `;
      listEl.appendChild(item);
    });
  }

  /**
   * 从群聊中移除一个成员
   * @param {string} memberId - 要移除的成员ID
   */
  async function removeMemberFromGroup(memberId) {
    const chat = state.chats[state.activeChatId];
    const memberIndex = chat.members.findIndex(m => m.id === memberId);

    if (memberIndex === -1) return;


    if (chat.members.length <= 2) {
      alert("群聊人数不能少于2人。");
      return;
    }

    const memberName = chat.members[memberIndex].groupNickname;
    const confirmed = await showCustomConfirm(
      '移出成员',
      `确定要将"${memberName}"移出群聊吗？`, {
      confirmButtonClass: 'btn-danger'
    }
    );

    if (confirmed) {
      chat.members.splice(memberIndex, 1);
      await db.chats.put(chat);
      renderMemberManagementList();
      document.getElementById('chat-settings-btn').click();
    }
  }


  async function openContactPickerForAddMember() {

    const confirmBtn = document.getElementById('confirm-contact-picker-btn');

    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', handleAddMembersToGroup);


    await renderUnifiedContactPicker();


    showScreen('contact-picker-screen');
  }


  async function renderUnifiedContactPicker() {
    const listEl = document.getElementById('contact-picker-list');
    listEl.innerHTML = '';
    selectedContacts.clear();

    const chat = state.chats[state.activeChatId];
    const existingMemberIds = new Set(chat.members.map(m => m.id));


    const characters = Object.values(state.chats).filter(c => !c.isGroup && !existingMemberIds.has(c.id));


    const npcs = (await db.npcs.toArray()).filter(n => !existingMemberIds.has(`npc_${n.id}`));

    if (characters.length === 0 && npcs.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color:#8a8a8a; margin-top:50px;">没有更多可以邀请的联系人了。</p>';
      document.getElementById('confirm-contact-picker-btn').style.display = 'none';
    } else {
      document.getElementById('confirm-contact-picker-btn').style.display = 'block';


      characters.forEach(contact => {
        const item = document.createElement('div');
        item.className = 'contact-picker-item';
        item.dataset.contactId = contact.id;
        item.dataset.contactType = 'character';
        item.innerHTML = `
                <div class="checkbox"></div>
                <img src="${contact.settings.aiAvatar || defaultAvatar}" class="avatar">
                <span class="name">${escapeHTML(window.CharacterIdentity.display(contact.originalName, contact.id))} <small style="color:#888;">(角色)</small></span>
            `;
        listEl.appendChild(item);
      });


      npcs.forEach(npc => {
        const item = document.createElement('div');
        item.className = 'contact-picker-item';
        item.dataset.contactId = `npc_${npc.id}`;
        item.dataset.contactType = 'npc';
        item.dataset.npcId = npc.id;
        item.innerHTML = `
                <div class="checkbox"></div>
                <img src="${npc.avatar || defaultGroupMemberAvatar}" class="avatar">
                <span class="name">${npc.name} <small style="color:#007722;">(NPC)</small></span>
            `;
        listEl.appendChild(item);
      });
    }

    updateContactPickerConfirmButton();
  }



  async function handleAddMembersToGroup() {
    if (selectedContacts.size === 0) {
      alert("请至少选择一个要添加的联系人。");
      return;
    }

    const chat = state.chats[state.activeChatId];
    const allNpcs = await db.npcs.toArray();

    for (const contactId of selectedContacts) {
      const itemEl = document.querySelector(`.contact-picker-item[data-contact-id="${contactId}"]`);
      if (!itemEl) continue;

      const contactType = itemEl.dataset.contactType;

      if (contactType === 'character') {
        const contactChat = state.chats[contactId];
        if (contactChat) {
          chat.members.push({
            id: contactId,
            originalName: contactChat.originalName,
            groupNickname: contactChat.name,
            persona: contactChat.settings.aiPersona,

            avatar: contactChat.settings.aiAvatar || defaultAvatar,
            isNpc: false
          });
        }
      } else if (contactType === 'npc') {
        const npcId = parseInt(itemEl.dataset.npcId);
        const npcData = allNpcs.find(n => n.id === npcId);
        if (npcData) {


          chat.members.push({
            id: `npc_${npcId}`,
            originalName: npcData.name,
            groupNickname: npcData.name,
            persona: npcData.persona,
            avatar: npcData.avatar || defaultGroupMemberAvatar,
            isNpc: true
          });
        }
      }
    }

    await db.chats.put(chat);


    openMemberManagementScreen();
  }



  function createNewMemberInGroup() {

    isAddingNpcToGroup = true;

    openNpcEditor(null);
  }



  function startWaimaiCountdown(element, endTime) {
    const timerId = setInterval(() => {
      const now = Date.now();
      const distance = endTime - now;

      if (distance < 0) {
        clearInterval(timerId);
        element.innerHTML = '<span>已</span><span>超</span><span>时</span>';
        return;
      }

      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      const minStr = String(minutes).padStart(2, '0');
      const secStr = String(seconds).padStart(2, '0');

      element.innerHTML = `<span>${minStr.charAt(0)}</span><span>${minStr.charAt(1)}</span> : <span>${secStr.charAt(0)}</span><span>${secStr.charAt(1)}</span>`;
    }, 1000);
    return timerId;
  }

  function cleanupWaimaiTimers() {
    for (const timestamp in waimaiTimers) {
      clearInterval(waimaiTimers[timestamp]);
    }
    waimaiTimers = {};
  }




  async function showWaimaiDetails(timestamp) {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;

    const message = chat.history.find(m => m.timestamp === timestamp);

    if (!message || !['waimai_request', 'waimai_order'].includes(message.type)) {
      console.error("showWaimaiDetails: 找不到消息或消息类型不正确", timestamp);
      return;
    }

    let detailsHtml = '';

    if (message.type === 'waimai_request') {

      let statusText;
      switch (message.status) {
        case 'paid':
          const payerName = message.paidBy || '对方';
          const payerDisplayName = typeof getDisplayNameInGroup === 'function' ? getDisplayNameInGroup(chat, payerName) : payerName;
          statusText = `由 ${payerDisplayName} 为您代付成功`;
          break;
        case 'rejected':
          statusText = '代付请求已被拒绝';
          break;
        default:
          statusText = '等待对方处理';
          break;
      }
      detailsHtml = `
            <div style="text-align: left; font-size: 15px; line-height: 1.8;">
                <strong>商品:</strong> ${message.productInfo}<br>
                <strong>金额:</strong> ¥${Number(message.amount).toFixed(2)}<br>
                <strong>状态:</strong> ${statusText}
            </div>
        `;
    } else if (message.type === 'waimai_order') {

      let senderDisplayName;
      let recipientDisplayName;

      if (chat.isGroup) {

        senderDisplayName = typeof getDisplayNameInGroup === 'function' ? getDisplayNameInGroup(chat, message.senderName) : message.senderName;
        recipientDisplayName = typeof getDisplayNameInGroup === 'function' ? getDisplayNameInGroup(chat, message.recipientName) : message.recipientName;
      } else {

        if (message.role === 'user') {

          senderDisplayName = chat.settings.myNickname || '我';
          recipientDisplayName = chat.name;
        } else {

          senderDisplayName = chat.name;
          recipientDisplayName = chat.settings.myNickname || '我';
        }
      }


      detailsHtml = `
            <div style="text-align: left; font-size: 15px; line-height: 1.8;">
                <strong>订单类型:</strong> 为TA点单<br>
                <strong>赠送方:</strong> ${senderDisplayName}<br>
                <strong>接收方:</strong> ${recipientDisplayName}<br>
                <strong>商品:</strong> ${message.productInfo}<br>
                <strong>金额:</strong> ¥${Number(message.amount).toFixed(2)}
            </div>
        `;
    }

    if (typeof showCustomAlert === 'function') {
      await showCustomAlert("订单详情", detailsHtml);
    } else {
      alert("订单详情:\n" + detailsHtml.replace(/<br>/g, '\n').replace(/<[^>]+>/g, ''));
    }
  }


  async function handleWaimaiResponse(originalTimestamp, choice) {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;

    const messageIndex = chat.history.findIndex(m => m.timestamp === originalTimestamp);
    if (messageIndex === -1) return;


    const originalMessage = chat.history[messageIndex];


    let systemContent;
    const myNickname = chat.isGroup ? (chat.settings.myNickname || '我') : '我';

    if (choice === 'paid') {
      if (typeof processTransaction === 'function') {
        const success = await processTransaction(originalMessage.amount, 'expense', `帮付外卖-${originalMessage.senderName}`);
        if (!success) return; // 余额不足，不改变状态，直接返回
      }

      originalMessage.status = choice;
      originalMessage.paidBy = myNickname;
      systemContent = `[系统提示：你 (${myNickname}) 为 ${originalMessage.senderName} 的外卖订单（时间戳: ${originalTimestamp}）完成了支付。此订单已关闭，其他成员不能再支付。]`;
    } else {
      originalMessage.status = choice;

      systemContent = `[系统提示：你 (${myNickname}) 拒绝了 ${originalMessage.senderName} 的外卖代付请求（时间戳: ${originalTimestamp}）。]`;
    }


    const systemNote = {
      role: 'system',
      content: systemContent,
      timestamp: Date.now(),
      isHidden: true
    };
    chat.history.push(systemNote);


    await db.chats.put(chat);
    
    // 即时局部更新 DOM
    const bubble = document.querySelector(`.message-bubble[data-timestamp="${originalTimestamp}"]`);
    if (bubble) {
      bubble.classList.add(`status-${choice}`);
      // 更新标题避免显示不全
      const requestTitleEl = bubble.querySelector('.request-title');
      if (requestTitleEl && choice === 'paid') {
          // 局部更新一下
          const payerDisplayName = typeof getDisplayNameInGroup === 'function' ? getDisplayNameInGroup(chat, myNickname) : myNickname;
      }
      
      const buttonsBox = bubble.querySelector('.waimai-user-actions');
      if (buttonsBox) buttonsBox.style.display = 'none';
      
      const paymentBox = bubble.querySelector('.payment-box');
      if (paymentBox) paymentBox.style.display = 'none';
      
      const detailsBtn = bubble.querySelector('.waimai-details-btn');
      if (detailsBtn && choice === 'paid') {
          detailsBtn.style.backgroundColor = '#28a745';
      } else if (detailsBtn && choice === 'rejected') {
          detailsBtn.style.display = 'none';
      }
    }
    
    if (typeof window.renderChatInterface === 'function') {
      window.renderChatInterface(state.activeChatId, { preserveScroll: true });
    }
  }


