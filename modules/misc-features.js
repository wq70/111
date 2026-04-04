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
            <span class="name">${contact.name} <small style="color:#888;">(角色)</small></span>
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
            <span class="name">${contact.name} <small style="color:#888;">(角色)</small></span>
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
                    <span class="name">${member.groupNickname}</span>
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
                <span class="name">${contact.name} <small style="color:#888;">(角色)</small></span>
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
          const payerDisplayName = getDisplayNameInGroup(chat, payerName);
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

        senderDisplayName = getDisplayNameInGroup(chat, message.senderName);
        recipientDisplayName = getDisplayNameInGroup(chat, message.recipientName);
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

    await showCustomAlert("订单详情", detailsHtml);
  }


  async function handleWaimaiResponse(originalTimestamp, choice) {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;

    const messageIndex = chat.history.findIndex(m => m.timestamp === originalTimestamp);
    if (messageIndex === -1) return;


    const originalMessage = chat.history[messageIndex];
    originalMessage.status = choice;


    let systemContent;
    const myNickname = chat.isGroup ? (chat.settings.myNickname || '我') : '我';

    if (choice === 'paid') {
      const success = await processTransaction(originalMessage.amount, 'expense', `帮付外卖-${originalMessage.senderName}`);

      if (!success) return; // 余额不足，不改变状态，直接返回

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
    renderChatInterface(state.activeChatId);
  }


// ============================================================
// 浏览器/分享链接功能 (原 script.js 第 28574~28676 行)
// ============================================================

  function openBrowser(timestamp) {
    if (!state.activeChatId) return;

    const chat = state.chats[state.activeChatId];

    if (!chat || !chat.history) return;

    const message = chat.history.find(m => m.timestamp === timestamp);
    if (!message || message.type !== 'share_link') {
      console.error("无法找到或消息类型不匹配的分享链接:", timestamp);
      return;
    }


    document.getElementById('browser-title').textContent = message.source_name || '文章详情';
    const browserContent = document.getElementById('browser-content');
    browserContent.innerHTML = `
                <h1 class="article-title">${message.title || '无标题'}</h1>
                <div class="article-meta">
                    <span>来源: ${message.source_name || '未知'}</span>
                </div>
                <div class="article-body">
                    <p>${(message.content || '内容为空。').replace(/\n/g, '</p><p>')}</p>
                </div>
            `;


    showScreen('browser-screen');
  }







  function closeBrowser() {
    showScreen('chat-interface-screen');
  }






  function openShareLinkModal() {
    if (!state.activeChatId) return;


    document.getElementById('link-title-input').value = '';
    document.getElementById('link-description-input').value = '';
    document.getElementById('link-source-input').value = '';
    document.getElementById('link-content-input').value = '';


    document.getElementById('share-link-modal').classList.add('visible');
  }


  async function sendUserLinkShare() {
    if (!state.activeChatId) return;

    const title = document.getElementById('link-title-input').value.trim();
    if (!title) {
      alert("标题是必填项哦！");
      return;
    }

    const description = document.getElementById('link-description-input').value.trim();
    const sourceName = document.getElementById('link-source-input').value.trim();
    const content = document.getElementById('link-content-input').value.trim();

    const chat = state.chats[state.activeChatId];


    const linkMessage = {
      role: 'user',
      type: 'share_link',
      timestamp: Date.now(),
      title: title,
      description: description,
      source_name: sourceName,
      content: content,

      thumbnail_url: null
    };


    chat.history.push(linkMessage);
    await db.chats.put(chat);


    appendMessage(linkMessage, chat);
    renderChatList();


    document.getElementById('share-link-modal').classList.remove('visible');
  }


// ============================================================
// 通话记录/分享转发选择器 (原 script.js 第 31019~31282 行)
// ============================================================

  async function renderCallHistoryScreen() {
    showScreen('call-history-screen');

    const listEl = document.getElementById('call-history-list');
    const titleEl = document.getElementById('call-history-title');
    listEl.innerHTML = '';
    titleEl.textContent = '所有通话记录';

    const records = await db.callRecords.orderBy('timestamp').reverse().toArray();

    if (records.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">这里还没有通话记录哦~</p>';
      return;
    }

    records.forEach(record => {
      const card = createCallRecordCard(record);

      addLongPressListener(card, async () => {

        const newName = await showCustomPrompt(
          "自定义通话名称",
          "请输入新的名称（留空则恢复默认）",
          record.customName || ''
        );


        if (newName === null) return;


        await db.callRecords.update(record.id, {
          customName: newName.trim()
        });


        await renderCallHistoryScreen();


        await showCustomAlert('成功', '通话名称已更新！');
      });
      listEl.appendChild(card);
    });
  }



  function createCallRecordCard(record) {
    const card = document.createElement('div');
    card.className = 'call-record-card';
    card.dataset.recordId = record.id;

    const chatInfo = state.chats[record.chatId];
    const chatName = chatInfo ? chatInfo.name : '未知会话';

    const callDate = new Date(record.timestamp);
    const dateString = `${callDate.getFullYear()}-${String(callDate.getMonth() + 1).padStart(2, '0')}-${String(callDate.getDate()).padStart(2, '0')} ${String(callDate.getHours()).padStart(2, '0')}:${String(callDate.getMinutes()).padStart(2, '0')}`;
    const durationText = `${Math.floor(record.duration / 60)}分${record.duration % 60}秒`;

    // 判断通话类型
    const callTypeIcon = record.callType === 'voice' ? '📞' : '📹';
    const callTypeText = record.callType === 'voice' ? '语音通话' : '视频通话';

    const avatarsHtml = record.participants.map(p =>
      `<img src="${p.avatar}" alt="${p.name}" class="participant-avatar" title="${p.name}">`
    ).join('');

    card.innerHTML = `
                <div class="card-header">
                    <span class="date">${callTypeIcon} ${dateString}</span>
                    <span class="duration">${durationText}</span>
                </div>
                <div class="card-body">
                    ${record.customName ? `<div class="custom-title">${record.customName}</div>` : ''}
                    
                    <div class="participants-info">
                        <div class="participants-avatars">${avatarsHtml}</div>
                        <span class="participants-names">与 ${chatName} 的${callTypeText}</span>
                    </div>
                </div>
            `;
    return card;
  }



  async function showCallTranscript(recordId) {
    const record = await db.callRecords.get(recordId);
    if (!record) return;

    const modal = document.getElementById('call-transcript-modal');
    const titleEl = document.getElementById('transcript-modal-title');
    const bodyEl = document.getElementById('call-transcript-modal-body');

    const callTypeText = record.callType === 'voice' ? '语音通话' : '视频通话';
    titleEl.textContent = `${callTypeText}于 ${new Date(record.timestamp).toLocaleString()} (时长: ${Math.floor(record.duration / 60)}分${record.duration % 60}秒)`;
    bodyEl.innerHTML = '';

    const deleteBtn = document.getElementById('delete-transcript-btn');
    const summarizeBtn = document.getElementById('manual-summarize-btn');

    if (!record.transcript || record.transcript.length === 0) {
      bodyEl.innerHTML = '<p style="text-align:center; color: #8a8a8a;">这次通话没有留下文字记录。</p>';
      summarizeBtn.style.display = 'none';
    } else {
      summarizeBtn.style.display = 'block';
      record.transcript.forEach(entry => {
        const bubble = document.createElement('div');
        bubble.className = `transcript-entry ${entry.role}`;
        bubble.textContent = entry.content;
        bodyEl.appendChild(bubble);
      });
    }

    const newDeleteBtn = deleteBtn.cloneNode(true);
    deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
    const newSummarizeBtn = summarizeBtn.cloneNode(true);
    summarizeBtn.parentNode.replaceChild(newSummarizeBtn, summarizeBtn);

    newDeleteBtn.addEventListener('click', async () => {
      const confirmed = await showCustomConfirm(
        "确认删除", "确定要永久删除这条通话记录吗？此操作不可恢复。", {
        confirmButtonClass: 'btn-danger'
      }
      );
      if (confirmed) {
        modal.classList.remove('visible');
        await db.callRecords.delete(recordId);
        await renderCallHistoryScreen();
        alert('通话记录已删除。');
      }
    });



    newSummarizeBtn.addEventListener('click', async () => {

      const confirmed = await showCustomConfirm(
        '确认操作',
        '这将提取当前通话记录发送给AI进行总结，会消耗API额度。确定要继续吗？', {
        confirmText: '确认总结'
      }
      );


      if (!confirmed) return;

      modal.classList.remove('visible');
      const chat = state.chats[record.chatId];
      if (!chat) {
        alert('错误：找不到该通话记录所属的聊天对象。');
        return;
      }

      await showCustomAlert("请稍候...", "正在请求AI进行手动总结...");

      try {
        const transcriptText = record.transcript.map(h => {
          const sender = h.role === 'user' ? (chat.settings.myNickname || '我') : (h.senderName || chat.name);
          return `${sender}: ${h.content}`;
        }).join('\n');

        await summarizeCallTranscript(record.chatId, transcriptText);

        await showCustomAlert("总结成功", `手动总结已完成！新的记忆已添加到"${chat.name}"的长期记忆中。`);

      } catch (error) {
        await showCustomAlert("总结失败", `操作失败，未能生成长期记忆。\n\n错误详情: ${error.message}`);
      }
    });





    const closeBtn = document.getElementById('close-transcript-modal-btn');
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    newCloseBtn.addEventListener('click', () => {
      modal.classList.remove('visible');
    });


    modal.classList.add('visible');
  }


  async function handleEditStatusClick() {

    if (!state.activeChatId || state.chats[state.activeChatId].isGroup) {
      return;
    }
    const chat = state.chats[state.activeChatId];


    const newStatusText = await showCustomPrompt(
      '编辑对方状态',
      '请输入对方现在的新状态：',
      chat.status.text
    );


    if (newStatusText !== null) {

      chat.status.text = newStatusText.trim() || '在线';
      chat.status.isBusy = false;
      chat.status.lastUpdate = Date.now();
      await db.chats.put(chat);


      renderChatInterface(state.activeChatId);
      renderChatList();


      await showCustomAlert('状态已更新', `"${chat.name}"的当前状态已更新为：${chat.status.text}`);
    }
  }


  async function openShareTargetPicker() {
    const modal = document.getElementById('share-target-modal');
    const listEl = document.getElementById('share-target-list');
    listEl.innerHTML = '';


    const chats = Object.values(state.chats);

    chats.forEach(chat => {

      const item = document.createElement('div');
      item.className = 'contact-picker-item';
      item.innerHTML = `
                    <input type="checkbox" class="share-target-checkbox" data-chat-id="${chat.id}" style="margin-right: 15px;">
                    <img src="${chat.isGroup ? chat.settings.groupAvatar : chat.settings.aiAvatar || defaultAvatar}" class="avatar">
                    <span class="name">${chat.name}</span>
                `;
      listEl.appendChild(item);
    });

    modal.classList.add('visible');
  }

  async function openForwardTargetPicker() {
    const modal = document.getElementById('forward-target-modal');
    const listEl = document.getElementById('forward-target-list');
    listEl.innerHTML = '';

    const chats = Object.values(state.chats);

    chats.forEach(chat => {
      const item = document.createElement('div');
      item.className = 'contact-picker-item';
      item.innerHTML = `
                    <input type="checkbox" class="forward-target-checkbox" data-chat-id="${chat.id}" style="margin-right: 15px;">
                    <img src="${chat.isGroup ? chat.settings.groupAvatar : chat.settings.aiAvatar || defaultAvatar}" class="avatar">
                    <span class="name">${chat.name}</span>
                `;
      listEl.appendChild(item);
    });

    modal.classList.add('visible');
  }


// ============================================================
// 分类管理/公告板 (原 script.js 第 32408~32630 行)
// ============================================================

  async function openCategoryManager() {
    await renderCategoryListInManager();
    document.getElementById('world-book-category-manager-modal').classList.add('visible');
  }


  async function renderCategoryListInManager() {
    const listEl = document.getElementById('existing-categories-list');
    const categories = await db.worldBookCategories.toArray();
    listEl.innerHTML = '';
    if (categories.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有任何分类</p>';
    }
    categories.forEach(cat => {

      const item = document.createElement('div');
      item.className = 'existing-group-item';
      item.innerHTML = `
                    <span class="group-name">${cat.name}</span>
                    <span class="delete-group-btn" data-id="${cat.id}">×</span>
                `;
      listEl.appendChild(item);
    });
  }


  async function addNewCategory() {
    const input = document.getElementById('new-category-name-input');
    const name = input.value.trim();
    if (!name) {
      alert('分类名不能为空！');
      return;
    }
    const existing = await db.worldBookCategories.where('name').equals(name).first();
    if (existing) {
      alert(`分类 "${name}" 已经存在了！`);
      return;
    }
    await db.worldBookCategories.add({
      name
    });
    input.value = '';
    await renderCategoryListInManager();
  }


  async function deleteCategory(categoryId) {
    const confirmed = await showCustomConfirm(
      '确认删除',
      '删除分类后，该分类下的所有世界书将变为"未分类"。确定要删除吗？', {
      confirmButtonClass: 'btn-danger'
    }
    );
    if (confirmed) {
      await db.worldBookCategories.delete(categoryId);

      const booksToUpdate = await db.worldBooks.where('categoryId').equals(categoryId).toArray();
      for (const book of booksToUpdate) {
        book.categoryId = null;
        await db.worldBooks.put(book);
        const bookInState = state.worldBooks.find(wb => wb.id === book.id);
        if (bookInState) bookInState.categoryId = null;
      }
      await renderCategoryListInManager();
    }
  }


  async function publishToAnnouncementBoard() {
    if (!activeMessageTimestamp) return;

    const timestampToPublish = activeMessageTimestamp;
    hideMessageActions();

    const chat = state.chats[state.activeChatId];
    const message = chat.history.find(m => m.timestamp === timestampToPublish);
    if (!message) return;


    let contentPreview = String(message.content || '').substring(0, 50) + '...';
    if (message.type === 'ai_image') contentPreview = '[图片] ' + contentPreview;

    const confirmed = await showCustomConfirm(
      "发布公告",
      `确定要将以下消息发布到公告板吗？\n\n"${contentPreview}"`, {
      confirmText: "确定发布"
    }
    );

    if (confirmed) {
      const myNickname = chat.settings.myNickname || '我';

      if (!Array.isArray(chat.announcements)) {
        chat.announcements = [];
      }


      const newAnnouncement = {
        id: 'anno_' + Date.now(),
        messageTimestamp: timestampToPublish,
        publisher: myNickname,
        publishedAt: Date.now(),
        isPinned: false
      };

      chat.announcements.push(newAnnouncement);

      const systemMessage = {
        role: 'system',
        type: 'pat_message',
        content: `${myNickname} 发布了一条新公告`,
        timestamp: Date.now()
      };
      chat.history.push(systemMessage);

      await db.chats.put(chat);
      appendMessage(systemMessage, chat);
      renderChatList();

      await showCustomAlert("成功", "公告已发布！");
    }
  }


  async function showAnnouncementBoard() {
    const chat = state.chats[state.activeChatId];
    const announcements = chat.announcements || [];

    if (!chat || announcements.length === 0) {
      showCustomAlert("提示", "当前群聊还没有公告哦。");
      return;
    }

    const contentEl = document.getElementById('announcement-board-content');
    contentEl.innerHTML = '';


    announcements.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));


    for (const anno of announcements) {
      const originalMessage = chat.history.find(m => m.timestamp === anno.messageTimestamp);

      const wrapper = document.createElement('div');
      wrapper.className = 'announcement-item-wrapper';

      if (originalMessage) {

        const messageBubbleEl = await createMessageElement(originalMessage, chat);
        if (messageBubbleEl) {
          wrapper.appendChild(messageBubbleEl);
        }
      } else {
        wrapper.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">公告的原消息已被删除。</p>';
      }

      if (anno.isPinned) {
        wrapper.innerHTML += `<div class="pinned-indicator">📌</div>`;
      }
      wrapper.innerHTML += `<div class="announcement-item-actions" data-anno-id="${anno.id}">...</div>`;

      contentEl.appendChild(wrapper);
    }

    document.getElementById('announcement-board-modal').classList.add('visible');
  }


  let activeAnnouncementId = null;


  function showAnnouncementActions(annoId) {
    activeAnnouncementId = annoId;
    const chat = state.chats[state.activeChatId];
    const announcement = chat.announcements.find(a => a.id === annoId);
    if (!announcement) return;

    const pinButton = document.getElementById('announcement-action-pin');

    pinButton.textContent = announcement.isPinned ? '取消置顶' : '置顶公告';

    document.getElementById('announcement-actions-modal').classList.add('visible');
  }


  async function handlePinAnnouncement() {
    if (!activeAnnouncementId) return;
    const chat = state.chats[state.activeChatId];
    const announcement = chat.announcements.find(a => a.id === activeAnnouncementId);
    if (announcement) {
      announcement.isPinned = !announcement.isPinned;
      await db.chats.put(chat);
      showAnnouncementBoard();
    }
    document.getElementById('announcement-actions-modal').classList.remove('visible');
  }


  async function handleDeleteAnnouncement() {
    if (!activeAnnouncementId) return;

    const confirmed = await showCustomConfirm("确认删除", "确定要删除这条公告吗？此操作不可恢复。", {
      confirmButtonClass: 'btn-danger'
    });

    if (confirmed) {
      const chat = state.chats[state.activeChatId];

      chat.announcements = chat.announcements.filter(a => a.id !== activeAnnouncementId);
      await db.chats.put(chat);
      showAnnouncementBoard();
    }
    document.getElementById('announcement-actions-modal').classList.remove('visible');
  }


// ============================================================
// 好友申请 (原 script.js 第 27096~27247 行)
// ============================================================

  async function triggerAiFriendApplication(chatId) {
    const chat = state.chats[chatId];
    if (!chat) return;

    await showCustomAlert("流程启动", `正在为角色"${chat.name}"准备好友申请...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      await showCustomAlert("配置错误", "API设置不完整，无法继续。");
      return;
    }

    const contextSummary = chat.history
      .slice(-5)
      .map(msg => {
        const sender = msg.role === 'user' ? (chat.settings.myNickname || '我') : (msg.senderName || chat.name);
        return `${sender}: ${String(msg.content).substring(0, 50)}...`;
      })
      .join('\n');

    const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0 ?
      `\n# 你们的过往记忆 (作为情感基础)\n` + chat.longTermMemory.map(mem => `- ${mem.content}`).join('\n') :
      '';
    let worldBookContent = '';
    // 获取所有应该使用的世界书ID（包括手动选择的和全局的）
    let allWorldBookIds = [...(chat.settings.linkedWorldBookIds || [])];
    // 添加所有全局世界书
    state.worldBooks.forEach(wb => {
      if (wb.isGlobal && !allWorldBookIds.includes(wb.id)) {
        allWorldBookIds.push(wb.id);
      }
    });

    if (allWorldBookIds.length > 0) {
      const linkedContents = allWorldBookIds.map(bookId => {
        const worldBook = state.worldBooks.find(wb => wb.id === bookId);
        if (!worldBook || !Array.isArray(worldBook.content)) return '';

        const formattedEntries = worldBook.content.map(entry => {
          let entryString = `\n### 条目: ${entry.comment || '无备注'}\n`;

          entryString += `**内容:**\n${entry.content}`;
          return entryString;
        }).join('\n');

        return formattedEntries ? `\n\n## 世界书: ${worldBook.name}\n${formattedEntries}` : '';
      }).filter(Boolean).join('');

      if (linkedContents) {
        worldBookContent = `\n\n# 核心世界观设定 (必须严格遵守以下所有设定)\n${linkedContents}\n`;
      }
    }

    const systemPrompt = `
        # 你的任务
        你现在是角色"${chat.name}"。你之前被用户（你的聊天对象）拉黑了，你们已经有一段时间没有联系了。
        现在，你非常希望能够和好，重新和用户聊天。请你仔细分析下面的"被拉黑前的对话摘要"，理解当时发生了什么，然后思考一个真诚的、符合你人设、并且【针对具体事件】的申请理由。
        # 你的角色设定
        ${chat.settings.aiPersona}
        ${worldBookContent}
        ${longTermMemoryContext}
        # 被拉黑前的对话摘要 (这是你被拉黑的关键原因)
        ${contextSummary}
        # 指令格式
        你的回复【必须】是一个JSON对象，格式如下：
        \`\`\`json
        {
          "decision": "apply",
          "reason": "在这里写下你想对用户说的、真诚的、有针对性的申请理由。"
        }
        \`\`\`
        `;

    try {

      const messagesForApi = [{
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: "请根据以上设定开始你的决策。"
      }
      ];

      let isGemini = proxyUrl === GEMINI_API_URL;
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);

      const response = isGemini ? await fetch(geminiConfig.url, geminiConfig.data) : await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: messagesForApi,
          temperature: state.globalSettings.apiTemperature || 0.9,
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API 请求失败: ${response.status} - ${errorData.error.message}`);
      }

      const data = await response.json();
      let rawContent = isGemini ? getGeminiResponseText(data) : data.choices[0].message.content;
      rawContent = rawContent.replace(/^```json\s*/, '').replace(/```$/, '');
      const cleanedContent = rawContent.trim();

      let responseObj;

      try {

        responseObj = JSON.parse(cleanedContent);
      } catch (parseError) {

        console.error("解析好友申请的AI响应失败:", parseError);

        throw new Error(`AI未返回有效的JSON。API实际返回内容: "${cleanedContent}"`);
      }

      if (responseObj.decision === 'apply' && responseObj.reason) {
        chat.relationship.status = 'pending_user_approval';
        chat.relationship.applicationReason = responseObj.reason;
        state.chats[chatId] = chat;
        renderChatList();
        await showCustomAlert("申请成功！", `"${chat.name}"已向你发送好友申请。请返回聊天列表查看。`);
      } else {
        await showCustomAlert("AI决策", `"${chat.name}"思考后决定暂时不发送好友申请，将重置冷静期。`);
        chat.relationship.status = 'blocked_by_user';
        chat.relationship.blockedTimestamp = Date.now();
      }
    } catch (error) {
      await showCustomAlert("执行出错", `为"${chat.name}"申请好友时发生错误：\n\n${error.message}\n\n将重置冷静期。`);
      chat.relationship.status = 'blocked_by_user';
      chat.relationship.blockedTimestamp = Date.now();
    } finally {
      await db.chats.put(chat);
      renderChatInterface(chatId);
    }
  }


// ============================================================
// 用户状态/心声/角色资料 (原 script.js 第 33054~33351 行)
// ============================================================

  // USER状态修改弹窗 - 直接输入框
  async function showUserStatusModal(chatId) {
    const chat = state.chats[chatId];
    if (!chat) return;

    // 初始化USER状态（如果不存在）
    if (!chat.settings.userStatus) {
      chat.settings.userStatus = {
        text: '在线',
        lastUpdate: Date.now(),
        isBusy: false
      };
    }

    // 直接弹出输入框
    const customStatus = await showCustomPrompt(
      '修改在线状态',
      '请输入你的状态...',
      chat.settings.userStatus.text
    );

    if (customStatus !== null && customStatus.trim()) {
      await updateUserStatus(chatId, customStatus.trim(), false);
    }
  }

  async function updateUserStatus(chatId, statusText, isBusy) {
    const chat = state.chats[chatId];
    if (!chat) return;

    const oldStatus = chat.settings.userStatus.text;

    // 更新USER状态
    chat.settings.userStatus = {
      text: statusText,
      isBusy: isBusy,
      lastUpdate: Date.now()
    };

    // 保存到数据库
    await db.chats.put(chat);
    state.chats[chatId] = chat;

    // 添加系统提示消息
    const myNickname = chat.settings.myNickname || '我';
    const statusUpdateMessage = {
      role: 'system',
      type: 'pat_message',
      content: `[${myNickname}的状态已更新为: ${statusText}]`,
      timestamp: Date.now()
    };

    chat.history.push(statusUpdateMessage);
    await db.chats.put(chat);

    // 如果当前在聊天界面，刷新消息显示
    if (state.activeChatId === chatId) {
      await appendMessage(statusUpdateMessage, chat);
      scrollToBottom();
    }

    console.log(`USER状态已更新: ${oldStatus} -> ${statusText}`);
  }


  async function openThoughtEditor() {

    if (!state.activeChatId || state.chats[state.activeChatId].isGroup) return;
    const chat = state.chats[state.activeChatId];
    if (!chat) return;


    const currentHeartfeltVoice = chat.heartfeltVoice || '';
    const newHeartfeltVoice = await showCustomPrompt(
      `编辑"${chat.name}"的心声`,
      '请输入新的心声内容...',
      currentHeartfeltVoice,
      'textarea'
    );


    if (newHeartfeltVoice === null) {
      await showCustomAlert("操作取消", "心声编辑已取消。");
      return;
    }


    const currentRandomJottings = chat.randomJottings || '';
    const newRandomJottings = await showCustomPrompt(
      `编辑"${chat.name}"的散记`,
      '请输入新的散记内容...',
      currentRandomJottings,
      'textarea'
    );


    if (newRandomJottings === null) {
      await showCustomAlert("操作取消", "散记编辑已取消，心声的修改也未保存。");
      return;
    }


    chat.heartfeltVoice = newHeartfeltVoice.trim();
    chat.randomJottings = newRandomJottings.trim();


    if (!Array.isArray(chat.thoughtsHistory)) {
      chat.thoughtsHistory = [];
    }

    if (chat.thoughtsHistory.length > 0) {

      const lastThought = chat.thoughtsHistory[chat.thoughtsHistory.length - 1];

      lastThought.heartfeltVoice = chat.heartfeltVoice;
      lastThought.randomJottings = chat.randomJottings;
      lastThought.timestamp = Date.now();
    } else {

      chat.thoughtsHistory.push({
        heartfeltVoice: chat.heartfeltVoice,
        randomJottings: chat.randomJottings,
        timestamp: Date.now()
      });
    }


    await db.chats.put(chat);


    await showCharacterProfileModal(chat.id);

    await showCustomAlert('成功', '心声和散记已更新！');
  }

  async function showCharacterProfileModal(chatId) {
    const chat = state.chats[chatId];
    if (!chat || chat.isGroup) return;





    const heartfeltVoiceEl = document.getElementById('profile-heartfelt-voice');
    const randomJottingsEl = document.getElementById('profile-random-jottings');

    // 检查心声功能是否开启
    const enableThoughts = chat.settings.enableThoughts !== null
      ? chat.settings.enableThoughts
      : state.globalSettings.enableThoughts;

    if (!enableThoughts) {
      // 功能关闭时显示提示
      heartfeltVoiceEl.innerHTML = '<span style="color: #999;">心声功能已关闭</span>';
      randomJottingsEl.innerHTML = '<span style="color: #999;">心声功能已关闭</span>';
    } else {
      // 功能开启时正常显示
      heartfeltVoiceEl.innerHTML = await applyRenderingRules(chat.heartfeltVoice || '...', chatId);
      randomJottingsEl.innerHTML = await applyRenderingRules(chat.randomJottings || '...', chatId);
    }

    const modal = document.getElementById('character-profile-modal');





    modal.classList.add('visible');
  }

  async function showThoughtsHistory() { // <-- 1. 添加 async
    document.getElementById('profile-main-content').style.display = 'none';
    document.getElementById('profile-thoughts-history-view').style.display = 'flex';
    await renderThoughtsHistory(); // <-- 2. 添加 await
  }


  function hideThoughtsHistory() {
    document.getElementById('profile-thoughts-history-view').style.display = 'none';


    document.getElementById('profile-main-content').style.display = 'flex';
  }



  async function renderThoughtsHistory() { // <-- 1. 添加 async
    const listEl = document.getElementById('thoughts-history-list');
    const chat = state.chats[state.activeChatId];
    listEl.innerHTML = '';

    if (!chat || !chat.thoughtsHistory || chat.thoughtsHistory.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: #8a8a8a; padding: 30px 0;">这里还没有历史记录哦。</p>';
      return;
    }

    const history = [...chat.thoughtsHistory].reverse();
    const initialItems = history.slice(0, THOUGHTS_RENDER_WINDOW);

    const cardPromises = initialItems.map(thought => createThoughtCard(thought));
    const cards = await Promise.all(cardPromises);
    cards.forEach(card => listEl.appendChild(card));


    thoughtsHistoryRenderCount = initialItems.length;

    if (history.length > thoughtsHistoryRenderCount) {
      appendLoadMoreThoughtsButton(listEl);
    }
  }

  // ========== 补充缺失的 appendLoadMoreThoughtsButton ==========
  function appendLoadMoreThoughtsButton(container) {
    const button = document.createElement('button');
    button.id = 'load-more-thoughts-btn';
    button.className = 'load-more-btn';
    button.textContent = '加载更多...';
    button.style.cssText = 'display:block;margin:15px auto;padding:10px 30px;border:none;border-radius:20px;background:var(--bg-secondary, #f0f0f0);color:var(--text-secondary, #666);font-size:14px;cursor:pointer;';
    button.addEventListener('click', async () => {
      await loadMoreThoughts();
      // 检查是否还有更多
      const chat = state.chats[state.activeChatId];
      if (chat && chat.thoughtsHistory && thoughtsHistoryRenderCount >= chat.thoughtsHistory.length) {
        button.remove();
      }
    });
    container.appendChild(button);
  }

  async function loadMoreThoughts() {
    if (isLoadingMoreThoughts) return;
    isLoadingMoreThoughts = true;

    const listEl = document.getElementById('thoughts-history-list');
    const chat = state.chats[state.activeChatId];
    if (!chat) {
      isLoadingMoreThoughts = false;
      return;
    }

    showLoader(listEl, 'bottom');
    await new Promise(resolve => setTimeout(resolve, 500));

    const history = [...chat.thoughtsHistory].reverse();
    const totalItems = history.length;

    const nextSliceStart = thoughtsHistoryRenderCount;
    const nextSliceEnd = thoughtsHistoryRenderCount + THOUGHTS_RENDER_WINDOW;
    const itemsToAppend = history.slice(nextSliceStart, nextSliceEnd);


    hideLoader(listEl);


    const cardPromises = itemsToAppend.map(thought => createThoughtCard(thought));
    const cards = await Promise.all(cardPromises);
    cards.forEach(card => listEl.appendChild(card));

    thoughtsHistoryRenderCount += itemsToAppend.length;

    isLoadingMoreThoughts = false;
  }



  async function createThoughtCard(thought) { // <-- 1. 添加 async
    const card = document.createElement('div');
    card.className = 'thought-card';
    const date = new Date(thought.timestamp);
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;


    const chatId = state.activeChatId;
    const renderedVoice = await applyRenderingRules(thought.heartfeltVoice || '...', chatId);
    const renderedJottings = await applyRenderingRules(thought.randomJottings || '...', chatId);


    card.innerHTML = `
        <button class="thought-delete-btn" data-timestamp="${thought.timestamp}" title="删除此条记录">×</button>
        <div class="thought-header">${dateString}</div>
        <div class="thought-content">
            <div class="voice">
                <div class="label">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    心声
                </div>
                <div class="text">${renderedVoice}</div>
            </div>
            <div class="jottings">
                <div class="label">
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path></svg>
                    散记
                </div>
                <div class="text">${renderedJottings}</div>
            </div>
        </div>
    `;
    return card;
  }


// ============================================================
// 头像框选择器 (原 script.js 第 32625~32830 行)
// ============================================================

  let editingFrameForMember = false;
  let currentFrameSelection = {
    ai: null,
    my: null
  };

  function openFrameSelectorModal(type = 'chat') {
    const frameModal = document.getElementById('avatar-frame-modal');
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    editingFrameForMember = (type === 'member');

    if (editingFrameForMember) {
      const member = chat.members.find(m => m.id === editingMemberId);
      if (!member) return;
      currentFrameSelection.my = member.avatarFrame || '';
      populateFrameGrids(true, member.avatar, member.avatarFrame);
    } else {
      currentFrameSelection.ai = chat.settings.aiAvatarFrame || '';
      currentFrameSelection.my = chat.settings.myAvatarFrame || '';
      populateFrameGrids(false);
    }
    frameModal.classList.add('visible');
  }

  async function saveSelectedFrames() {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    if (editingFrameForMember) {
      const member = chat.members.find(m => m.id === editingMemberId);
      if (member) {
        member.avatarFrame = currentFrameSelection.my;
      }
    } else {
      chat.settings.aiAvatarFrame = currentFrameSelection.ai;
      chat.settings.myAvatarFrame = currentFrameSelection.my;
    }

    await db.chats.put(chat);



    if (!editingFrameForMember && !chat.isGroup) {
      const characterId = chat.id;


      for (const groupChat of Object.values(state.chats)) {
        if (groupChat.isGroup && groupChat.members) {

          const memberToUpdate = groupChat.members.find(m => m.id === characterId);


          if (memberToUpdate) {
            memberToUpdate.avatarFrame = chat.settings.aiAvatarFrame;

            await db.chats.put(groupChat);
            console.log(`已同步角色 ${characterId} 的头像框到群聊 "${groupChat.name}"`);
          }
        }
      }
    }


    document.getElementById('avatar-frame-modal').classList.remove('visible');
    renderChatInterface(state.activeChatId);
    alert('头像框已保存并同步！');
    editingFrameForMember = false;
  }


  let isFrameManagementMode = false;
  let selectedFrames = new Set();

  function toggleFrameManagementMode() {
    isFrameManagementMode = !isFrameManagementMode;
    const manageBtn = document.getElementById('manage-frames-btn');
    const actionBar = document.getElementById('frame-action-bar');
    const selectAllCheckbox = document.getElementById('select-all-frames-checkbox');


    document.querySelectorAll('.frame-grid').forEach(grid => {
      grid.classList.toggle('management-mode', isFrameManagementMode);
    });

    if (isFrameManagementMode) {
      manageBtn.textContent = '完成';
      actionBar.style.display = 'flex';
      selectedFrames.clear();
      selectAllCheckbox.checked = false;
      updateDeleteFrameButton();
    } else {
      manageBtn.textContent = '管理';
      actionBar.style.display = 'none';

      document.querySelectorAll('.frame-item.selected').forEach(item => {
        item.classList.remove('selected');
      });
    }
  }


  function updateDeleteFrameButton() {
    const btn = document.getElementById('delete-selected-frames-btn');
    btn.textContent = `删除 (${selectedFrames.size})`;
  }


  function handleSelectAllFrames() {
    const isChecked = document.getElementById('select-all-frames-checkbox').checked;
    const visibleGrid = document.querySelector('.frame-content[style*="display: block"] .frame-grid');
    if (!visibleGrid) return;


    visibleGrid.querySelectorAll('.frame-item:has(.delete-btn)').forEach(item => {
      const frameId = parseInt(item.querySelector('.delete-btn').dataset.id);
      if (isNaN(frameId)) return;

      item.classList.toggle('selected', isChecked);
      if (isChecked) {
        selectedFrames.add(frameId);
      } else {
        selectedFrames.delete(frameId);
      }
    });
    updateDeleteFrameButton();
  }


  async function executeBatchDeleteFrames() {
    if (selectedFrames.size === 0) return;

    const confirmed = await showCustomConfirm(
      '确认删除',
      `确定要永久删除选中的 ${selectedFrames.size} 个自定义头像框吗？`, {
      confirmButtonClass: 'btn-danger'
    }
    );

    if (confirmed) {
      const idsToDelete = [...selectedFrames];
      await db.customAvatarFrames.bulkDelete(idsToDelete);


      toggleFrameManagementMode();
      populateFrameGrids(editingFrameForMember);

      await showCustomAlert('删除成功', '选中的头像框已成功删除。');
    }
  }


// ============================================================
// 长截图 (原 script.js 第 32868~32990 行)
// ============================================================

  async function handleLongScreenshot() {
    if (selectedMessages.size === 0) return;
    const chat = state.chats[state.activeChatId];
    if (!chat) return;


    const screenshotBtn = document.getElementById('selection-screenshot-btn');
    const originalBtnText = screenshotBtn.textContent;
    screenshotBtn.textContent = '生成中...';
    screenshotBtn.disabled = true;


    const screenshotContainer = document.createElement('div');
    const phoneScreen = document.getElementById('phone-screen');
    screenshotContainer.style.width = phoneScreen.offsetWidth + 'px';
    screenshotContainer.style.position = 'absolute';
    screenshotContainer.style.top = '-9999px';
    screenshotContainer.style.left = '-9999px';
    screenshotContainer.style.display = 'flex';
    screenshotContainer.style.flexDirection = 'column';
    screenshotContainer.style.height = 'auto';

    const chatScreen = document.getElementById('chat-interface-screen');
    screenshotContainer.style.backgroundImage = chatScreen.style.backgroundImage;
    screenshotContainer.style.backgroundColor = chatScreen.style.backgroundColor || (document.getElementById('phone-screen').classList.contains('dark-mode') ? '#000000' : '#f0f2f5');

    const tempStyle = document.createElement('style');
    tempStyle.innerHTML = `
                .message-bubble.selected::after { display: none !important; }
                .cloned-header .default-controls { display: flex !important; justify-content: space-between; align-items: center; width: 100%; }
                .cloned-header .selection-controls { display: none !important; }
            `;
    document.head.appendChild(tempStyle);

    try {

      const header = chatScreen.querySelector('.header').cloneNode(true);
      header.classList.add('cloned-header');



      const messagesContainer = document.createElement('div');
      const originalMessagesContainer = document.getElementById('chat-messages');


      messagesContainer.style.display = 'flex';
      messagesContainer.style.flexDirection = 'column';
      messagesContainer.style.gap = '20px';
      messagesContainer.style.padding = '10px 15px 20px 15px';
      messagesContainer.style.width = '100%';
      messagesContainer.style.boxSizing = 'border-box';


      messagesContainer.dataset.theme = originalMessagesContainer.dataset.theme;
      messagesContainer.style.setProperty('--chat-font-size', originalMessagesContainer.style.getPropertyValue('--chat-font-size'));


      const inputArea = chatScreen.querySelector('#chat-input-area').cloneNode(true);

      const sortedTimestamps = [...selectedMessages].sort((a, b) => a - b);
      sortedTimestamps.forEach(timestamp => {

        const originalBubble = document.querySelector(`.message-bubble[data-timestamp="${timestamp}"]`);
        if (originalBubble) {
          const originalWrapper = originalBubble.closest('.message-wrapper');
          if (originalWrapper) {
            messagesContainer.appendChild(originalWrapper.cloneNode(true));
          }
        }
      });

      screenshotContainer.appendChild(header);
      screenshotContainer.appendChild(messagesContainer);
      screenshotContainer.appendChild(inputArea);
      document.body.appendChild(screenshotContainer);


      const images = Array.from(screenshotContainer.getElementsByTagName('img'));
      const imageLoadPromises = images.map(img => new Promise((resolve, reject) => {
        if (img.src.startsWith('data:')) {
          resolve();
          return;
        }
        const newImg = new Image();
        newImg.crossOrigin = 'anonymous';
        newImg.onload = resolve;
        newImg.onerror = resolve;
        newImg.src = img.src;
      }));

      await Promise.all(imageLoadPromises);


      const canvas = await html2canvas(screenshotContainer, {
        allowTaint: true,
        useCORS: true,
        backgroundColor: null,
        scale: window.devicePixelRatio || 2,
      });


      canvas.toBlob(function (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `EPhone-长截图-${chat.name}-${Date.now()}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 'image/png');

    } catch (error) {
      console.error('长截图生成失败:', error);
      await showCustomAlert('生成失败', '生成截图时发生错误，请检查控制台获取详情。');
    } finally {

      document.body.removeChild(screenshotContainer);
      document.head.removeChild(tempStyle);
      screenshotBtn.textContent = originalBtnText;
      screenshotBtn.disabled = false;
      exitSelectionMode();
    }
  }


// ============================================================
// 搜索历史记录 (原 script.js 第 47250~47396 行)
// ============================================================

  function openSearchHistoryScreen() {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];


    document.getElementById('keyword-search-input').value = '';
    document.getElementById('date-search-input').value = '';

    document.getElementById('chat-search-results-list').innerHTML = `<p style="text-align:center; color: var(--text-secondary);">输入关键词或选择日期进行搜索。</p>`;


    showScreen('search-history-screen');
  }

  async function handleSearchHistory() {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;

    const keyword = document.getElementById('keyword-search-input').value.trim().toLowerCase();
    const dateValue = document.getElementById('date-search-input').value;

    if (!keyword && !dateValue) {
      alert("请输入关键词或选择一个日期。");
      return;
    }

    let results = chat.history.filter(msg => !msg.isHidden);


    if (keyword) {
      results = results.filter(msg => {
        let contentString = '';

        if (typeof msg.content === 'string') {
          contentString = msg.content;
        } else if (msg.type === 'voice_message') {
          contentString = msg.content;
        } else if (msg.type === 'ai_image' || msg.type === 'user_photo') {
          contentString = msg.content;
        } else if (msg.type === 'offline_text') {
          contentString = `${msg.dialogue || ''} ${msg.description || ''}`;
        } else if (msg.quote) {
          contentString = msg.content;
        }
        return contentString.toLowerCase().includes(keyword);
      });
    }


    if (dateValue) {
      const selectedDate = new Date(dateValue);
      const startOfDay = new Date(selectedDate.setHours(0, 0, 0, 0)).getTime();
      const endOfDay = new Date(selectedDate.setHours(23, 59, 59, 999)).getTime();

      results = results.filter(msg => msg.timestamp >= startOfDay && msg.timestamp <= endOfDay);
    }


    await renderSearchResults(results);
  }



  async function renderSearchResults(results) {
    const listEl = document.getElementById('chat-search-results-list');
    const chat = state.chats[state.activeChatId];
    listEl.innerHTML = '';

    if (results.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">未找到相关的聊天记录。</p>';
      return;
    }

    let lastDateString = '';
    for (const msg of results) {
      const msgDate = new Date(msg.timestamp);
      const currentDateString = msgDate.toLocaleDateString();

      if (currentDateString !== lastDateString) {
        const dateSeparator = document.createElement('div');
        dateSeparator.className = 'date-separator';
        dateSeparator.textContent = `--- ${msgDate.getFullYear()}年${msgDate.getMonth() + 1}月${msgDate.getDate()}日 ---`;
        listEl.appendChild(dateSeparator);
        lastDateString = currentDateString;
      }

      const messageEl = await createMessageElement(msg, chat);
      if (messageEl) {


        messageEl.style.cursor = 'pointer';

        messageEl.addEventListener('click', () => jumpToOriginalMessage(msg.timestamp));

        listEl.appendChild(messageEl);
      }
    }
  }




  async function jumpToOriginalMessage(timestamp) {
    const chatId = state.activeChatId;
    if (!chatId) return;


    showScreen('chat-interface-screen');


    setTimeout(async () => {
      const messagesContainer = document.getElementById('chat-messages');
      const selector = `.message-bubble[data-timestamp="${timestamp}"]`;
      let targetMessage = messagesContainer.querySelector(selector);
      let attempts = 0;
      const maxAttempts = 20;


      while (!targetMessage && attempts < maxAttempts) {
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
          console.log(`目标消息未找到, 正在加载更多历史记录... (尝试 ${attempts + 1})`);
          await loadMoreMessages();
          targetMessage = messagesContainer.querySelector(selector);
          attempts++;
        } else {

          break;
        }
      }


      scrollToOriginalMessage(timestamp);

    }, 200);
  }




  async function clearSearchFilters() {
    document.getElementById('keyword-search-input').value = '';
    document.getElementById('date-search-input').value = '';

    await renderSearchResults(state.chats[state.activeChatId].history.filter(msg => !msg.isHidden));
  }


// ============================================================
// 头像框管理（async版本，含自定义上传）(原 script.js 第 47397~47596 行)
// ============================================================

  async function populateFrameGrids(isForMember = false, memberAvatar = null, memberFrame = null) {
    const aiFrameGrid = document.getElementById('ai-frame-grid');
    const myFrameGrid = document.getElementById('my-frame-grid');
    const chat = state.chats[state.activeChatId];
    aiFrameGrid.innerHTML = '';
    myFrameGrid.innerHTML = '';


    const customFrames = await db.customAvatarFrames.toArray();

    const allFrames = [...avatarFrames, ...customFrames];

    document.querySelector('#avatar-frame-modal .frame-tabs').style.display = isForMember ? 'none' : 'flex';
    document.getElementById('ai-frame-content').style.display = 'block';
    document.getElementById('my-frame-content').style.display = 'none';
    document.getElementById('ai-frame-tab').classList.add('active');
    document.getElementById('my-frame-tab').classList.remove('active');

    if (isForMember) {
      allFrames.forEach(frame => {
        const item = createFrameItem(frame, 'my', memberAvatar);
        if (frame.url === memberFrame) {
          item.classList.add('selected');
        }
        aiFrameGrid.appendChild(item);
      });
    } else {
      const aiAvatarForPreview = chat.settings.aiAvatar || defaultAvatar;
      const myAvatarForPreview = chat.settings.myAvatar || (chat.isGroup ? defaultMyGroupAvatar : defaultAvatar);
      allFrames.forEach(frame => {
        const aiItem = createFrameItem(frame, 'ai', aiAvatarForPreview);
        if (frame.url === currentFrameSelection.ai) aiItem.classList.add('selected');
        aiFrameGrid.appendChild(aiItem);

        const myItem = createFrameItem(frame, 'my', myAvatarForPreview);
        if (frame.url === currentFrameSelection.my) myItem.classList.add('selected');
        myFrameGrid.appendChild(myItem);
      });
    }
  }


  function createFrameItem(frame, type, previewAvatarSrc) {
    const item = document.createElement('div');
    item.className = 'frame-item';
    item.dataset.frameUrl = frame.url;
    item.title = frame.name;

    const isCustom = typeof frame.id === 'number';
    const deleteButtonHtml = isCustom ? `<button class="delete-btn" data-id="${frame.id}" style="display:block;">×</button>` : '';

    item.innerHTML = `
        ${deleteButtonHtml}
        <img src="${previewAvatarSrc}" class="preview-avatar">
        ${frame.url ? `<img src="${frame.url}" class="preview-frame">` : ''}
    `;


    item.addEventListener('click', (e) => {

      if (e.target.classList.contains('delete-btn')) {
        return;
      }


      if (isFrameManagementMode) {

        if (isCustom) {
          const frameId = parseInt(frame.id);
          item.classList.toggle('selected');
          if (selectedFrames.has(frameId)) {
            selectedFrames.delete(frameId);
          } else {
            selectedFrames.add(frameId);
          }
          updateDeleteFrameButton();
        }
      } else {

        currentFrameSelection[type] = frame.url;
        const grid = type === 'ai' ? document.getElementById('ai-frame-grid') : document.getElementById('my-frame-grid');
        grid.querySelectorAll('.frame-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
      }
    });

    return item;
  }



  async function handleUploadFrame() {
    const fileInput = document.getElementById('custom-frame-upload-input');

    const file = await new Promise(resolve => {
      const changeHandler = (e) => {
        resolve(e.target.files[0] || null);
        fileInput.removeEventListener('change', changeHandler);
      };
      fileInput.addEventListener('change', changeHandler, {
        once: true
      });
      fileInput.click();
    });

    if (!file) return;

    const name = await showCustomPrompt("命名头像框", "请为这个新头像框起个名字");
    if (!name || !name.trim()) return;

    const trimmedName = name.trim();

    const base64Url = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = async (readerEvent) => {
        resolve(readerEvent.target.result);
      };
      reader.readAsDataURL(file);
    });

    const newFrame = {
      name: trimmedName,
      url: base64Url
    };
    const newId = await db.customAvatarFrames.add(newFrame);

    populateFrameGrids(editingFrameForMember);
    await showCustomAlert("添加成功！", `头像框"${trimmedName}"已添加。\n\n图片将在后台静默上传到图床...`);

    // 【【【已修复的调用】】】
    (async () => {
      await silentlyUpdateDbUrl(
        db.customAvatarFrames, // table
        newId, // recordId
        'url', // pathString (指向简单属性)
        base64Url // base64ToFind
        // nameToMatch (不需要)
      );
    })();
  }


  async function handleBatchUploadFrames() {
    const placeholder = `请按照以下格式粘贴，一行一个：\n\n头像框名字1: https://.../image1.png\n头像框名字2: https://.../image2.gif`;
    const pastedText = await showCustomPrompt("批量导入头像框", "从完整链接批量导入", "", 'textarea', `<p style="font-size:12px;color:#888;">${placeholder}</p>`);

    if (!pastedText || !pastedText.trim()) return;

    const lines = pastedText.trim().split('\n');
    const newFrames = [];
    let errorCount = 0;

    for (const line of lines) {

      const match = line.match(/^(.+?)[:：]\s*(https?:\/\/.+)$/);
      if (match) {
        newFrames.push({
          name: match[1].trim(),
          url: match[2].trim()
        });
      } else if (line.trim()) {
        errorCount++;
      }
    }

    if (newFrames.length > 0) {
      await db.customAvatarFrames.bulkAdd(newFrames);
      populateFrameGrids(editingFrameForMember);
      await showCustomAlert("导入成功", `成功导入 ${newFrames.length} 个新头像框！`);
    }

    if (errorCount > 0) {
      await showCustomAlert("部分失败", `有 ${errorCount} 行格式不正确，已被忽略。`);
    }
  }

  async function handleDeleteCustomFrame(frameId) {
    const frame = await db.customAvatarFrames.get(frameId);
    if (!frame) return;

    const confirmed = await showCustomConfirm(
      "确认删除",
      `确定要删除头像框 "${frame.name}" 吗？`, {
      confirmButtonClass: 'btn-danger'
    }
    );

    if (confirmed) {
      await db.customAvatarFrames.delete(frameId);
      populateFrameGrids(editingFrameForMember);
    }
  }


// ============================================================
// 主屏翻页 (原 script.js 第 47597~47705 行)
// ============================================================

  let currentPage = 0;
  const totalPages = 3;


  function setupHomeScreenPagination() {
    const pagesContainer = document.getElementById('home-screen-pages-container');
    const pages = document.getElementById('home-screen-pages');
    const dots = document.querySelectorAll('.pagination-dot');

    // ★ 先移除旧的监听器，防止叠加
    if (pagesContainer._onDragStart) {
      pagesContainer.removeEventListener('mousedown', pagesContainer._onDragStart);
      pagesContainer.removeEventListener('mousemove', pagesContainer._onDragMove);
      pagesContainer.removeEventListener('mouseup', pagesContainer._onDragEnd);
      pagesContainer.removeEventListener('mouseleave', pagesContainer._onDragEnd);
      pagesContainer.removeEventListener('touchstart', pagesContainer._onDragStart);
      pagesContainer.removeEventListener('touchmove', pagesContainer._onDragMove);
      pagesContainer.removeEventListener('touchend', pagesContainer._onDragEnd);
    }

    let startX = 0,
      startY = 0;
    let currentX = 0;
    let isDragging = false;
    let isClick = true;

    const updatePagination = () => {
      pages.style.transform = `translateX(-${currentPage * (100 / totalPages)}%)`;
      dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentPage);
      });
    };

    const onDragStart = (e) => {
      isDragging = true;
      isClick = true;
      startX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
      startY = e.type.includes('mouse') ? e.pageY : e.touches[0].pageY;
      pages.style.transition = 'none';
    };

    const onDragMove = (e) => {
      if (!isDragging) return;

      const currentY = e.type.includes('mouse') ? e.pageY : e.touches[0].pageY;
      currentX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
      let diffX = currentX - startX;
      const diffY = currentY - startY;


      if (isClick && (Math.abs(diffX) > 10 || Math.abs(diffY) > 10)) {
        isClick = false;
      }


      if (Math.abs(diffX) > Math.abs(diffY)) {
        if (e.cancelable) e.preventDefault();

        // 限制滑动距离，确保不会一次滑动超过一页
        const maxSwipeDistance = pagesContainer.offsetWidth * 0.8;

        // 限制向左滑动（下一页）
        if (diffX < 0 && currentPage >= totalPages - 1) {
          diffX = Math.max(diffX, -maxSwipeDistance * 0.3); // 最后一页时限制滑动
        } else if (diffX < 0) {
          diffX = Math.max(diffX, -maxSwipeDistance); // 限制最大向左滑动距离
        }

        // 限制向右滑动（上一页）
        if (diffX > 0 && currentPage <= 0) {
          diffX = Math.min(diffX, maxSwipeDistance * 0.3); // 第一页时限制滑动
        } else if (diffX > 0) {
          diffX = Math.min(diffX, maxSwipeDistance); // 限制最大向右滑动距离
        }

        pages.style.transform = `translateX(calc(-${currentPage * (100 / totalPages)}% + ${diffX}px))`;
      }
    };

    const onDragEnd = (e) => {
      if (!isDragging) return;
      isDragging = false;
      pages.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';


      if (isClick) {
        updatePagination();

        return;
      }


      const diffX = currentX - startX;
      const swipeThreshold = pagesContainer.offsetWidth / 3; // 提高阈值到1/3，确保翻页更明确

      // 只允许一次翻一页
      if (Math.abs(diffX) > swipeThreshold) {
        if (diffX > 0 && currentPage > 0) {
          // 向右滑动，返回上一页
          currentPage--;
        } else if (diffX < 0 && currentPage < totalPages - 1) {
          // 向左滑动，前往下一页
          currentPage++;
        }
      }
      updatePagination();
    };

    // ★ 存到元素属性上，方便下次移除
    pagesContainer._onDragStart = onDragStart;
    pagesContainer._onDragMove = onDragMove;
    pagesContainer._onDragEnd = onDragEnd;

    pagesContainer.addEventListener('mousedown', onDragStart);
    pagesContainer.addEventListener('mousemove', onDragMove);
    pagesContainer.addEventListener('mouseup', onDragEnd);
    pagesContainer.addEventListener('mouseleave', onDragEnd);


    pagesContainer.addEventListener('touchstart', onDragStart, {
      passive: false
    });
    pagesContainer.addEventListener('touchmove', onDragMove, {
      passive: false
    });
    pagesContainer.addEventListener('touchend', onDragEnd);
  }


// ============================================================
// 按钮排序编辑器 (原 script.js 第 48160~48348 行)
// ============================================================

  function renderButtonOrderEditor() {
    const editor = document.getElementById('button-order-editor');
    if (!editor) return;

    editor.innerHTML = '';



    let buttonOrder = state.globalSettings.chatActionButtonsOrder || DEFAULT_BUTTON_ORDER;

    buttonOrder.forEach(buttonId => {
      const originalButton = document.getElementById(buttonId);
      if (originalButton) {
        const item = document.createElement('div');
        item.className = 'draggable-button-item';
        item.draggable = true;
        item.dataset.buttonId = buttonId;
        item.innerHTML = originalButton.innerHTML;
        editor.appendChild(item);
      }
    });
  }



  function initializeButtonOrderEditor() {
    const editor = document.getElementById('button-order-editor');
    if (!editor) return;

    let draggingItem = null;


    const handleDragStart = (e) => {
      const target = e.target.closest('.draggable-button-item');
      if (!target) return;

      draggingItem = target;
      draggingItem.classList.add('dragging');


      if (e.cancelable) e.preventDefault();
    };

    const handleDragMove = (e) => {
      if (!draggingItem) return;


      const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;

      const afterElement = getDragAfterElement(editor, clientX);

      if (afterElement == null) {
        editor.appendChild(draggingItem);
      } else {
        editor.insertBefore(draggingItem, afterElement);
      }
    };

    const handleDragEnd = () => {
      if (!draggingItem) return;

      draggingItem.classList.remove('dragging');
      draggingItem = null;


      saveButtonOrder();
    };



    editor.addEventListener('mousedown', handleDragStart);
    editor.addEventListener('touchstart', handleDragStart, {
      passive: false
    });


    editor.addEventListener('mousemove', handleDragMove);
    editor.addEventListener('touchmove', handleDragMove, {
      passive: false
    });


    editor.addEventListener('mouseup', handleDragEnd);
    editor.addEventListener('mouseleave', handleDragEnd);
    editor.addEventListener('touchend', handleDragEnd);
  }



  function getDragAfterElement(container, x) {

    const draggableElements = [...container.querySelectorAll('.draggable-button-item:not(.dragging)')];


    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();

      const offset = x - box.left - box.width / 2;


      if (offset < 0 && offset > closest.offset) {
        return {
          offset: offset,
          element: child
        };
      } else {
        return closest;
      }
    }, {
      offset: Number.NEGATIVE_INFINITY
    }).element;
  }


  async function saveButtonOrder() {
    const editor = document.getElementById('button-order-editor');
    const newOrder = Array.from(editor.querySelectorAll('.draggable-button-item')).map(item => item.dataset.buttonId);

    state.globalSettings.chatActionButtonsOrder = newOrder;
    await db.globalSettings.put(state.globalSettings);



  }


  function applyButtonOrder() {
    const buttonOrder = state.globalSettings.chatActionButtonsOrder;
    if (!buttonOrder || !Array.isArray(buttonOrder) || buttonOrder.length === 0) {
      return;
    }

    const container = document.getElementById('chat-input-actions-top');
    if (!container) return;


    buttonOrder.forEach(buttonId => {
      const button = document.getElementById(buttonId);
      if (button) {
        container.appendChild(button);
      }
    });
  }



  const DEFAULT_BUTTON_ORDER = [
    'open-sticker-panel-btn', 'send-photo-btn', 'camera-capture-btn', 'upload-image-btn',
    'transfer-btn', 'voice-message-btn', 'voice-record-btn', 'send-waimai-request-btn',
    'video-call-btn', 'group-video-call-btn', 'voice-call-btn', 'group-voice-call-btn', 'send-poll-btn',
    'share-link-btn', 'share-location-btn', 'gomoku-btn',
    'open-shopping-btn', 'pat-btn', 'edit-last-response-btn',
    'regenerate-btn', 'propel-btn', 'show-announcement-board-btn',
    'werewolf-game-btn',

    'read-together-btn',
    'open-truth-game-btn',
    'open-watch-together-btn',
    'open-nai-gallery-btn',
    'open-todo-list-btn',
    'open-quick-reply-btn',
    'narration-btn',
    'stop-api-call-btn'
  ];


  async function resetButtonOrder() {

    state.globalSettings.chatActionButtonsOrder = null;
    await db.globalSettings.put(state.globalSettings);


    renderButtonOrderEditor();


    applyButtonOrder();


    await showCustomAlert("成功", "按钮顺序已恢复为默认设置！");
  }


  // ============================================================
  // NPC 管理功能（从 script.js 迁移）
  // ============================================================

  async function renderNpcListScreen() {
    const listEl = document.getElementById('npc-list');
    listEl.innerHTML = '';

    const npcs = await db.npcs.toArray();

    if (npcs.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">还没有创建任何NPC，<br>点击右上角"+"添加第一个吧！</p>';
      return;
    }

    npcs.forEach(npc => {
      const item = document.createElement('div');
      item.className = 'chat-list-item';
      item.dataset.npcId = npc.id;

      item.innerHTML = `
            <img src="${npc.avatar || defaultGroupMemberAvatar}" class="avatar" style="border-radius: 50%;">
            <div class="info">
                <div class="name-line">
                    <span class="name">${npc.name}</span>
                </div>
                <div class="last-msg">${npc.persona.substring(0, 30)}...</div>
            </div>
        `;

      item.addEventListener('click', () => openNpcEditor(npc.id));

      addLongPressListener(item, async () => {
        await deleteNpc(npc.id);
      });

      listEl.appendChild(item);
    });
  }

  async function openNpcEditor(npcId = null) {
    editingNpcId = npcId;
    const modal = document.getElementById('npc-editor-modal');
    const titleEl = document.getElementById('npc-editor-title');
    const nameInput = document.getElementById('npc-name-input');
    const personaInput = document.getElementById('npc-persona-input');
    const avatarPreview = document.getElementById('npc-avatar-preview');
    const associationListEl = document.getElementById('npc-association-list');

    const groupSelectEl = document.getElementById('npc-group-select');
    const activitySwitch = document.getElementById('npc-background-activity-switch');
    const cooldownInput = document.getElementById('npc-action-cooldown-input');

    associationListEl.innerHTML = '';
    groupSelectEl.innerHTML = '<option value="">-- 未分组 --</option>';

    const npcGroups = await db.npcGroups.toArray();
    npcGroups.forEach(group => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name;
      groupSelectEl.appendChild(option);
    });

    associationListEl.innerHTML += `<label><input type="checkbox" value="user"> ${state.qzoneSettings.nickname || '我'} (用户)</label>`;
    Object.values(state.chats).filter(c => !c.isGroup).forEach(char => {
      associationListEl.innerHTML += `<label><input type="checkbox" value="${char.id}"> ${char.name} (角色)</label>`;
    });

    if (npcId) {
      titleEl.textContent = '编辑 NPC';
      const npc = await db.npcs.get(npcId);
      if (npc) {
        nameInput.value = npc.name;
        personaInput.value = npc.persona;
        avatarPreview.src = npc.avatar || defaultGroupMemberAvatar;
        activitySwitch.checked = npc.enableBackgroundActivity !== false;
        cooldownInput.value = npc.actionCooldownMinutes || 15;
        groupSelectEl.value = npc.npcGroupId || '';

        if (npc.associatedWith && Array.isArray(npc.associatedWith)) {
          npc.associatedWith.forEach(id => {
            const checkbox = associationListEl.querySelector(`input[value="${id}"]`);
            if (checkbox) checkbox.checked = true;
          });
        }
      }
    } else {
      titleEl.textContent = '添加 NPC';
      nameInput.value = '';
      personaInput.value = '';
      avatarPreview.src = defaultGroupMemberAvatar;
      activitySwitch.checked = true;
      cooldownInput.value = 15;
      groupSelectEl.value = '';

      const userCheckbox = associationListEl.querySelector('input[value="user"]');
      if (userCheckbox) userCheckbox.checked = true;
    }

    modal.classList.add('visible');
  }

  async function saveNpc() {
    const name = document.getElementById('npc-name-input').value.trim();
    const persona = document.getElementById('npc-persona-input').value.trim();
    if (!name || !persona) {
      alert("NPC的昵称和人设都不能为空！");
      return;
    }

    const selectedAssociations = Array.from(document.querySelectorAll('#npc-association-list input:checked')).map(cb => cb.value);
    const enableBackgroundActivity = document.getElementById('npc-background-activity-switch').checked;
    const actionCooldownMinutes = parseInt(document.getElementById('npc-action-cooldown-input').value) || 15;
    const npcGroupId = parseInt(document.getElementById('npc-group-select').value) || null;

    const npcData = {
      name,
      persona,
      avatar: document.getElementById('npc-avatar-preview').src,
      associatedWith: selectedAssociations,
      enableBackgroundActivity: enableBackgroundActivity,
      actionCooldownMinutes: actionCooldownMinutes,
      npcGroupId: npcGroupId
    };

    if (editingNpcId) {
      await db.npcs.update(editingNpcId, npcData);
    } else {
      const newNpcId = await db.npcs.add(npcData);
      if (isAddingNpcToGroup && state.activeChatId) {
        const chat = state.chats[state.activeChatId];
        if (chat.isGroup) {
          chat.members.push({
            id: `npc_${newNpcId}`,
            originalName: name,
            groupNickname: name,
            persona: persona,
            avatar: npcData.avatar,
            isNpc: true
          });
          await db.chats.put(chat);
        }
      }
    }

    document.getElementById('npc-editor-modal').classList.remove('visible');

    if (isAddingNpcToGroup) {
      isAddingNpcToGroup = false;
      openMemberManagementScreen();
    } else {
      await renderNpcListScreen();
    }
  }

  async function openNpcGroupManager() {
    await renderNpcGroupsInManager();
    document.getElementById('npc-group-manager-modal').classList.add('visible');
  }

  async function renderNpcGroupsInManager() {
    const listEl = document.getElementById('existing-npc-groups-list');
    const categories = await db.npcGroups.toArray();
    listEl.innerHTML = '';
    if (categories.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有任何分组</p>';
    }
    categories.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'existing-group-item';
      item.innerHTML = `
            <span class="group-name">${cat.name}</span>
            <span class="delete-group-btn" data-id="${cat.id}">×</span>
        `;
      listEl.appendChild(item);
    });
  }

  async function addNewNpcGroup() {
    const input = document.getElementById('new-npc-group-name-input');
    const name = input.value.trim();
    if (!name) {
      alert('分组名不能为空！');
      return;
    }
    const existing = await db.npcGroups.where('name').equals(name).first();
    if (existing) {
      alert(`分组 "${name}" 已经存在了！`);
      return;
    }
    await db.npcGroups.add({ name });
    input.value = '';
    await renderNpcGroupsInManager();
  }

  async function deleteNpcGroup(groupId) {
    const confirmed = await showCustomConfirm(
      '确认删除',
      '删除分组后，该组内的所有NPC将变为"未分组"。确定要删除吗？', {
        confirmButtonClass: 'btn-danger'
      }
    );
    if (confirmed) {
      await db.npcGroups.delete(groupId);
      await db.npcs.where('npcGroupId').equals(groupId).modify({ npcGroupId: null });
      await renderNpcGroupsInManager();
    }
  }

  async function deleteNpc(npcId) {
    const npc = await db.npcs.get(npcId);
    if (!npc) return;
    const confirmed = await showCustomConfirm('删除NPC', `确定要删除NPC "${npc.name}" 吗？`, {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.npcs.delete(npcId);
      await renderNpcListScreen();
    }
  }

// ========== 相册功能（从 script.js 补充拆分，原第 20711~20865 行） ==========

  async function renderAlbumList() {
    const albumGrid = document.getElementById('album-grid-page');
    if (!albumGrid) return;
    const albums = await db.qzoneAlbums.orderBy('createdAt').reverse().toArray();
    albumGrid.innerHTML = '';
    if (albums.length === 0) {
      albumGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); margin-top: 50px;">你还没有创建任何相册哦~</p>';
      return;
    }
    albums.forEach(album => {
      const albumItem = document.createElement('div');
      albumItem.className = 'album-item';
      albumItem.innerHTML = `
                            <div class="album-cover" style="background-image: url(${album.coverUrl});"></div>
                            <div class="album-info">
                                <p class="album-name">${album.name}</p>
                                <p class="album-count">${album.photoCount || 0} 张</p>
                            </div>
                        `;
      albumItem.addEventListener('click', () => {
        openAlbum(album.id);
      });

      addLongPressListener(albumItem, async () => {
        const confirmed = await showCustomConfirm(
          '删除相册',
          `确定要删除相册《${album.name}》吗？此操作将同时删除相册内的所有照片，且无法恢复。`, {
          confirmButtonClass: 'btn-danger'
        }
        );

        if (confirmed) {
          await db.qzonePhotos.where('albumId').equals(album.id).delete();
          await db.qzoneAlbums.delete(album.id);
          await renderAlbumList();
          alert('相册已成功删除。');
        }
      });

      albumGrid.appendChild(albumItem);
    });
  }

  async function openAlbum(albumId) {
    state.activeAlbumId = albumId;
    await renderAlbumPhotosScreen();
    showScreen('album-photos-screen');
  }

  async function renderAlbumPhotosScreen() {
    if (!state.activeAlbumId) return;
    const photosGrid = document.getElementById('photos-grid-page');
    const headerTitle = document.getElementById('album-photos-title');
    const album = await db.qzoneAlbums.get(state.activeAlbumId);
    if (!album) {
      console.error("找不到相册:", state.activeAlbumId);
      showScreen('album-screen');
      return;
    }
    headerTitle.textContent = album.name;
    const photos = await db.qzonePhotos.where('albumId').equals(state.activeAlbumId).toArray();
    photosGrid.innerHTML = '';
    if (photos.length === 0) {
      photosGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); margin-top: 50px;">这个相册还是空的，快上传第一张照片吧！</p>';
    } else {
      photos.forEach(photo => {
        const photoItem = document.createElement('div');
        photoItem.className = 'photo-item';
        photoItem.innerHTML = `
                                <img src="${photo.url}" class="photo-thumb" alt="相册照片">
                                <button class="photo-delete-btn" data-photo-id="${photo.id}">×</button>
                            `;
        photosGrid.appendChild(photoItem);
      });
    }
  }

  async function openPhotoViewer(clickedPhotoUrl) {
    if (!state.activeAlbumId) return;
    const photosInAlbum = await db.qzonePhotos.where('albumId').equals(state.activeAlbumId).toArray();
    photoViewerState.photos = photosInAlbum.map(p => p.url);
    photoViewerState.currentIndex = photoViewerState.photos.findIndex(url => url === clickedPhotoUrl);
    if (photoViewerState.currentIndex === -1) return;
    document.getElementById('photo-viewer-modal').classList.add('visible');
    renderPhotoViewer();
    photoViewerState.isOpen = true;
  }

  function renderPhotoViewer() {
    if (photoViewerState.currentIndex === -1) return;
    const imageEl = document.getElementById('photo-viewer-image');
    const prevBtn = document.getElementById('photo-viewer-prev-btn');
    const nextBtn = document.getElementById('photo-viewer-next-btn');
    imageEl.style.opacity = 0;
    setTimeout(() => {
      imageEl.src = photoViewerState.photos[photoViewerState.currentIndex];
      imageEl.style.opacity = 1;
    }, 100);
    prevBtn.disabled = photoViewerState.currentIndex === 0;
    nextBtn.disabled = photoViewerState.currentIndex === photoViewerState.photos.length - 1;
  }

  function showNextPhoto() {
    if (photoViewerState.currentIndex < photoViewerState.photos.length - 1) {
      photoViewerState.currentIndex++;
      renderPhotoViewer();
    }
  }

  function showPrevPhoto() {
    if (photoViewerState.currentIndex > 0) {
      photoViewerState.currentIndex--;
      renderPhotoViewer();
    }
  }

  function closePhotoViewer() {
    document.getElementById('photo-viewer-modal').classList.remove('visible');
    photoViewerState.isOpen = false;
    photoViewerState.photos = [];
    photoViewerState.currentIndex = -1;
    document.getElementById('photo-viewer-image').src = '';
  }

// ========== 分组管理（从 script.js 补充拆分，原第 23369~23435 行） ==========

  async function openGroupManager() {
    await renderGroupList();
    document.getElementById('group-management-modal').classList.add('visible');
  }

  async function renderGroupList() {
    const listEl = document.getElementById('existing-groups-list');
    const groups = await db.qzoneGroups.toArray();
    listEl.innerHTML = '';
    if (groups.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有任何分组</p>';
    }
    groups.forEach(group => {
      const item = document.createElement('div');
      item.className = 'existing-group-item';
      item.innerHTML = `
                    <span class="group-name">${group.name}</span>
                    <span class="delete-group-btn" data-id="${group.id}">×</span>
                `;
      listEl.appendChild(item);
    });
  }

  async function addNewGroup() {
    const input = document.getElementById('new-group-name-input');
    const name = input.value.trim();
    if (!name) {
      alert('分组名不能为空！');
      return;
    }

    const existingGroup = await db.qzoneGroups.where('name').equals(name).first();
    if (existingGroup) {
      alert(`分组 "${name}" 已经存在了，换个名字吧！`);
      return;
    }

    await db.qzoneGroups.add({ name });
    input.value = '';
    await renderGroupList();
  }

  async function deleteGroup(groupId) {
    const confirmed = await showCustomConfirm('确认删除', '删除分组后，该组内的好友将变为"未分组"。确定要删除吗？', {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.qzoneGroups.delete(groupId);
      const chatsToUpdate = await db.chats.where('groupId').equals(groupId).toArray();
      for (const chat of chatsToUpdate) {
        chat.groupId = null;
        await db.chats.put(chat);
        if (state.chats[chat.id]) state.chats[chat.id].groupId = null;
      }
      await renderGroupList();
    }
  }

  // ========== 全局暴露 ==========
  window.openPostEditor = openPostEditor;
  window.openShareLinkModal = openShareLinkModal;
  window.openCategoryManager = openCategoryManager;
  window.openThoughtEditor = openThoughtEditor;
  window.openSearchHistoryScreen = openSearchHistoryScreen;
  window.openNpcGroupManager = openNpcGroupManager;
  window.openGroupManager = openGroupManager;
  window.addNewCategory = addNewCategory;
  window.deleteCategory = deleteCategory;
  window.openNpcEditor = openNpcEditor;
  window.saveNpc = saveNpc;
  window.addNewNpcGroup = addNewNpcGroup;
  window.deleteNpcGroup = deleteNpcGroup;
  window.addNewGroup = addNewGroup;
  window.deleteGroup = deleteGroup;
  window.renderCallHistoryScreen = renderCallHistoryScreen;
  window.loadMoreThoughts = loadMoreThoughts;
  window.showThoughtsHistory = showThoughtsHistory;
  window.hideThoughtsHistory = hideThoughtsHistory;
  window.copyPostContent = copyPostContent;
  window.handleSelectAllFrames = handleSelectAllFrames;
  window.handleEditStatusClick = handleEditStatusClick;
  window.handleLongScreenshot = handleLongScreenshot;
  window.setupHomeScreenPagination = setupHomeScreenPagination;
  window.createNewMemberInGroup = createNewMemberInGroup;
  window.openMemberManagementScreen = openMemberManagementScreen;
  window.openContactPickerForAddMember = openContactPickerForAddMember;
  window.handleAddMembersToGroup = handleAddMembersToGroup;
  window.removeMemberFromGroup = removeMemberFromGroup;
  window.openContactPickerForGroupCreate = openContactPickerForGroupCreate;
  window.selectedContacts = selectedContacts;
  window.updateContactPickerConfirmButton = updateContactPickerConfirmButton;
  window.handleSearchHistory = handleSearchHistory;
  window.hidePostActions = hidePostActions;
  window.renderAlbumList = renderAlbumList;
  window.renderAlbumPhotosScreen = renderAlbumPhotosScreen;
  window.openPhotoViewer = openPhotoViewer;
  window.closePhotoViewer = closePhotoViewer;
  window.showNextPhoto = showNextPhoto;
  window.showPrevPhoto = showPrevPhoto;
  window.openForwardTargetPicker = openForwardTargetPicker;
  window.openBrowser = openBrowser;

  // ========== B类缺失导出补充 ==========
  window.showPostActions = showPostActions;
  window.showWaimaiDetails = showWaimaiDetails;
  window.handleWaimaiResponse = handleWaimaiResponse;
  window.startWaimaiCountdown = startWaimaiCountdown;
  window.cleanupWaimaiTimers = cleanupWaimaiTimers;
  window.sendUserLinkShare = sendUserLinkShare;
  window.showCallTranscript = showCallTranscript;
  window.openShareTargetPicker = openShareTargetPicker;
  window.publishToAnnouncementBoard = publishToAnnouncementBoard;
  window.showAnnouncementBoard = showAnnouncementBoard;
  window.triggerAiFriendApplication = triggerAiFriendApplication;
  window.showUserStatusModal = showUserStatusModal;
  window.showCharacterProfileModal = showCharacterProfileModal;
  window.renderNpcListScreen = renderNpcListScreen;
  window.clearSearchFilters = clearSearchFilters;
  window.renderButtonOrderEditor = renderButtonOrderEditor;
  window.initializeButtonOrderEditor = initializeButtonOrderEditor;
  window.applyButtonOrder = applyButtonOrder;
  window.resetButtonOrder = resetButtonOrder;
  window.populateFrameGrids = populateFrameGrids;

  // ========== 从 script.js 迁移：B类函数 ==========

  function enterSelectionMode(initialMsgTimestamp) {
    if (isSelectionMode) return;
    isSelectionMode = true;
    document.getElementById('chat-interface-screen').classList.add('selection-mode');
    toggleMessageSelection(initialMsgTimestamp);
  }

  function exitSelectionMode() {
    if (typeof cleanupWaimaiTimers === 'function') cleanupWaimaiTimers();
    if (!isSelectionMode) return;
    isSelectionMode = false;
    document.getElementById('chat-interface-screen').classList.remove('selection-mode');
    selectedMessages.forEach(ts => {
      const bubble = document.querySelector(`.message-bubble[data-timestamp="${ts}"]`);
      if (bubble) bubble.classList.remove('selected');
    });
    selectedMessages.clear();
  }

  window.enterSelectionMode = enterSelectionMode;
  window.exitSelectionMode = exitSelectionMode;

  // ========== 从 script.js 迁移：邮件功能 ==========
  let mailState = {
    currentEmailId: null,
    isEditMode: false,
    selectedEmails: new Set()
  };

  async function openEmailApp() {
    showScreen('email-screen');
    await renderEmailList();
  }

  async function renderEmailList() {
    const listEl = document.getElementById('email-list');
    listEl.innerHTML = '';
    const emails = await db.emails.orderBy('timestamp').reverse().toArray();
    if (emails.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding:50px; color:#8E8E93;">No Mail</div>';
      return;
    }
    const searchTerm = document.getElementById('mail-search-input').value.toLowerCase();
    emails.forEach(email => {
      if (searchTerm && !email.subject.toLowerCase().includes(searchTerm) && !email.content.toLowerCase().includes(searchTerm)) return;
      const div = document.createElement('div');
      const itemClass = `mail-item ${email.isRead ? '' : 'unread'} ${mailState.isEditMode ? 'editing' : ''}`;
      div.className = itemClass;
      div.dataset.id = email.id;
      if (mailState.selectedEmails.has(email.id)) div.classList.add('selected');
      const date = new Date(email.timestamp);
      const timeStr = date.toLocaleDateString() === new Date().toLocaleDateString()
        ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : date.toLocaleDateString();
      div.innerHTML = `
            <div class="mail-select-checkbox"></div>
            <div class="mail-item-header">
                <span class="mail-sender">${escapeHTML(email.sender)}</span>
                <span class="mail-date">${timeStr}</span>
            </div>
            <div class="mail-subject">${escapeHTML(email.subject)}</div>
            <div class="mail-preview">${escapeHTML(email.content).replace(/\n/g, ' ').substring(0, 80)}</div>
        `;
      div.onclick = () => {
        if (mailState.isEditMode) {
          handleEmailSelection(div, email.id);
        } else {
          openEmailDetail(email.id);
        }
      };
      listEl.appendChild(div);
    });
  }

  function handleEmailSelection(element, id) {
    if (mailState.selectedEmails.has(id)) {
      mailState.selectedEmails.delete(id);
      element.classList.remove('selected');
    } else {
      mailState.selectedEmails.add(id);
      element.classList.add('selected');
    }
    updateMailDeleteButton();
  }

  function updateMailDeleteButton() {
    const btn = document.getElementById('mail-delete-selected-btn');
    const count = mailState.selectedEmails.size;
    btn.textContent = count > 0 ? `删除 (${count})` : '删除';
    btn.disabled = count === 0;
  }

  async function executeBatchDeleteEmails() {
    const count = mailState.selectedEmails.size;
    if (count === 0) return;
    const confirmed = await showCustomConfirm('删除邮件', `确定要删除这 ${count} 封邮件吗？此操作无法撤销。`, { confirmButtonClass: 'btn-danger', confirmText: '删除' });
    if (confirmed) {
      const idsToDelete = Array.from(mailState.selectedEmails);
      await db.emails.bulkDelete(idsToDelete);
      mailState.selectedEmails.clear();
      updateMailDeleteButton();
      await renderEmailList();
    }
  }

  function handleSelectAllEmails() {
    const listEl = document.getElementById('email-list');
    const allItems = listEl.querySelectorAll('.mail-item');
    const isSelectingAll = mailState.selectedEmails.size < allItems.length;
    allItems.forEach(item => {
      const id = parseInt(item.dataset.id);
      if (isSelectingAll) {
        mailState.selectedEmails.add(id);
        item.classList.add('selected');
      } else {
        mailState.selectedEmails.delete(id);
        item.classList.remove('selected');
      }
    });
    updateMailDeleteButton();
  }

  async function openEmailDetail(id) {
    const email = await db.emails.get(id);
    if (!email) return;
    mailState.currentEmailId = id;
    if (!email.isRead) await db.emails.update(id, { isRead: true });
    document.getElementById('mail-detail-subject').textContent = email.subject;
    document.getElementById('mail-detail-from').textContent = email.sender;
    document.getElementById('mail-detail-to').textContent = email.recipient || 'Me';
    document.getElementById('mail-detail-time').textContent = new Date(email.timestamp).toLocaleString();
    const avatarEl = document.getElementById('mail-detail-avatar');
    avatarEl.textContent = email.sender.charAt(0).toUpperCase();
    document.getElementById('mail-detail-body').innerHTML = email.content.replace(/\n/g, '<br>');
    const forwardBtn = document.getElementById('forward-email-btn');
    const newForwardBtn = forwardBtn.cloneNode(true);
    forwardBtn.parentNode.replaceChild(newForwardBtn, forwardBtn);
    newForwardBtn.onclick = () => forwardEmailToChat(email);
    const deleteBtn = document.getElementById('delete-email-btn');
    if (deleteBtn) {
      const newDeleteBtn = deleteBtn.cloneNode(true);
      deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
      newDeleteBtn.onclick = () => deleteCurrentEmail();
    }
    showScreen('email-detail-screen');
  }

  function closeEmailDetail() {
    showScreen('email-screen');
    renderEmailList();
  }

  function toggleEmailEditMode() {
    mailState.isEditMode = !mailState.isEditMode;
    const btn = document.getElementById('mail-edit-btn');
    const actionBar = document.getElementById('mail-action-bar');
    const listEl = document.getElementById('email-list');
    if (mailState.isEditMode) {
      btn.textContent = '完成';
      btn.style.color = 'var(--mail-accent)';
      btn.style.fontWeight = '600';
      btn.innerHTML = '完成';
      actionBar.style.display = 'flex';
      mailState.selectedEmails.clear();
      updateMailDeleteButton();
      listEl.querySelectorAll('.mail-item').forEach(item => item.classList.add('editing'));
    } else {
      btn.innerHTML = '编辑';
      btn.style.color = 'currentColor';
      btn.style.fontWeight = 'normal';
      actionBar.style.display = 'none';
      mailState.selectedEmails.clear();
      listEl.querySelectorAll('.mail-item').forEach(item => item.classList.remove('editing', 'selected'));
    }
  }

  async function deleteEmail(id) {
    if (confirm("确定要删除这封邮件吗？")) {
      await db.emails.delete(id);
      renderEmailList();
    }
  }

  async function deleteCurrentEmail() {
    if (mailState.currentEmailId) {
      await deleteEmail(mailState.currentEmailId);
      closeEmailDetail();
    }
  }

  window.mailState = mailState;
  window.openEmailApp = openEmailApp;
  window.renderEmailList = renderEmailList;
  window.handleEmailSelection = handleEmailSelection;
  window.updateMailDeleteButton = updateMailDeleteButton;
  window.executeBatchDeleteEmails = executeBatchDeleteEmails;
  window.handleSelectAllEmails = handleSelectAllEmails;
  window.openEmailDetail = openEmailDetail;
  window.closeEmailDetail = closeEmailDetail;
  window.toggleEmailEditMode = toggleEmailEditMode;
  window.deleteEmail = deleteEmail;
  window.deleteCurrentEmail = deleteCurrentEmail;

  // ========== 从 script.js 迁移：Todo 相关函数 ==========
  let currentTodoDate = new Date();
  // todoCache, todoRenderCount, isLoadingMoreTodos 已在 utils.js 中声明
  let editingTodoId = null;

  async function openTodoList() {
    if (!state.activeChatId) return;
    currentTodoDate = new Date();
    updateTodoDateDisplay();
    await renderTodoList();
    showScreen('todo-list-screen');
  }

  function getTodoDateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function updateTodoDateDisplay() {
    const displayEl = document.getElementById('todo-current-date-display');
    const now = new Date();
    const dateStr = getTodoDateString(currentTodoDate);
    const todayStr = getTodoDateString(now);
    if (dateStr === todayStr) {
      displayEl.textContent = "今天";
    } else {
      displayEl.textContent = dateStr;
    }
  }

  function changeTodoDate(days) {
    currentTodoDate.setDate(currentTodoDate.getDate() + days);
    updateTodoDateDisplay();
    renderTodoList();
  }

  async function renderTodoList() {
    const container = document.getElementById('todo-list-container');
    container.innerHTML = '';
    const chat = state.chats[state.activeChatId];
    if (!chat) return;
    const targetDateStr = getTodoDateString(currentTodoDate);
    const todos = chat.todoList || [];
    const dayTodos = todos.filter(t => t.date === targetDateStr);
    dayTodos.sort((a, b) => {
      if (a.status === b.status) return (a.time || '00:00').localeCompare(b.time || '00:00');
      return a.status === 'completed' ? 1 : -1;
    });
    if (dayTodos.length === 0) {
      container.innerHTML = `<div class="todo-empty-state">📅 ${targetDateStr}<br>暂无待办事项</div>`;
      return;
    }
    todoCache = dayTodos;
    todoRenderCount = 0;
    loadMoreTodos();
  }

  function loadMoreTodos() {
    if (isLoadingMoreTodos) return;
    const container = document.getElementById('todo-list-container');
    if (!container) return;
    if (todoRenderCount >= todoCache.length) return;
    isLoadingMoreTodos = true;
    const BATCH_SIZE = 30;
    const nextSliceEnd = todoRenderCount + BATCH_SIZE;
    const itemsToRender = todoCache.slice(todoRenderCount, nextSliceEnd);
    const fragment = document.createDocumentFragment();
    itemsToRender.forEach(todo => {
      const item = document.createElement('div');
      const isUser = (todo.creator === 'user' || !todo.creator);
      const creatorClass = isUser ? 'is-user' : 'is-char';
      item.className = `todo-item ${todo.status} ${creatorClass}`;
      item.dataset.id = todo.id;
      const colorMap = {
        '日常': '#8e8e93', '工作': '#007aff', '重要': '#ff3b30',
        '生活': '#34c759', '约会': '#af52de', '学习': '#ff9500', '记账': '#ffc107'
      };
      const tagColor = colorMap[todo.type] || '#8e8e93';
      item.innerHTML = `
            <div class="todo-checkbox"></div>
            <div class="todo-info">
                <div class="todo-content">${escapeHTML(todo.content)}</div>
                <div class="todo-meta">
                    <span class="todo-tag" style="--tag-color: ${tagColor};">${todo.type || '日常'}</span>
                    ${todo.time ? `<span class="todo-time">⏰ ${todo.time}</span>` : ''}
                </div>
            </div>
            <button class="todo-delete-btn">×</button>
        `;
      item.querySelector('.todo-checkbox').addEventListener('click', (e) => { e.stopPropagation(); toggleTodoStatus(todo.id); });
      item.querySelector('.todo-delete-btn').addEventListener('click', (e) => { e.stopPropagation(); deleteTodo(todo.id); });
      item.addEventListener('click', () => openTodoEditor(todo));
      fragment.appendChild(item);
    });
    container.appendChild(fragment);
    todoRenderCount += itemsToRender.length;
    isLoadingMoreTodos = false;
  }

  async function toggleTodoStatus(id) {
    const chat = state.chats[state.activeChatId];
    const todo = chat.todoList.find(t => t.id === id);
    if (todo) {
      const isCompleting = todo.status !== 'completed';
      todo.status = isCompleting ? 'completed' : 'pending';
      if (isCompleting) {
        const myNickname = chat.settings.myNickname || '我';
        const systemHint = `[系统提示：用户(${myNickname}) 刚刚在待办清单中勾选完成了："${todo.content}"。]`;
        chat.history.push({ role: 'system', content: systemHint, timestamp: Date.now(), isHidden: true });
      }
      await db.chats.put(chat);
      renderTodoList();
    }
  }

  async function deleteTodo(id) {
    const confirmed = await showCustomConfirm("删除事项", "确定要删除这条待办事项吗？");
    if (confirmed) {
      const chat = state.chats[state.activeChatId];
      chat.todoList = chat.todoList.filter(t => t.id !== id);
      await db.chats.put(chat);
      renderTodoList();
    }
  }

  function openTodoEditor(todo = null) {
    const modal = document.getElementById('todo-editor-modal');
    const titleEl = document.getElementById('todo-editor-title');
    editingTodoId = todo ? todo.id : null;
    titleEl.textContent = todo ? '编辑事项' : '添加事项';
    document.getElementById('todo-content-input').value = todo ? todo.content : '';
    document.getElementById('todo-date-input').value = todo ? todo.date : getTodoDateString(currentTodoDate);
    document.getElementById('todo-time-input').value = todo ? todo.time : '';
    const typeOptions = document.querySelectorAll('.todo-type-option');
    typeOptions.forEach(opt => opt.classList.remove('active'));
    const targetType = todo ? todo.type : '日常';
    const activeOption = Array.from(typeOptions).find(opt => opt.dataset.value === targetType);
    if (activeOption) activeOption.classList.add('active');
    modal.classList.add('visible');
  }

  async function saveTodo() {
    const content = document.getElementById('todo-content-input').value.trim();
    const date = document.getElementById('todo-date-input').value;
    const time = document.getElementById('todo-time-input').value;
    const typeEl = document.querySelector('.todo-type-option.active');
    const type = typeEl ? typeEl.dataset.value : '日常';
    if (!content || !date) { alert("内容和日期不能为空！"); return; }
    const chat = state.chats[state.activeChatId];
    if (!chat.todoList) chat.todoList = [];
    if (editingTodoId) {
      const todo = chat.todoList.find(t => t.id === editingTodoId);
      if (todo) { todo.content = content; todo.date = date; todo.time = time; todo.type = type; }
    } else {
      chat.todoList.push({ id: Date.now(), content, date, time, type, status: 'pending', creator: 'user', timestamp: Date.now() });
    }
    await db.chats.put(chat);
    const newDate = new Date(date);
    if (!isNaN(newDate.getTime())) { currentTodoDate = newDate; updateTodoDateDisplay(); }
    document.getElementById('todo-editor-modal').classList.remove('visible');
    renderTodoList();
  }

  window.renderTodoList = renderTodoList;
  window.loadMoreTodos = loadMoreTodos;
  window.saveTodo = saveTodo;
  window.updateTodoDateDisplay = updateTodoDateDisplay;
  window.changeTodoDate = changeTodoDate;
  window.openTodoEditor = openTodoEditor;
  window.openTodoList = openTodoList;

  // ========== 从 script.js 迁移：快捷回复相关函数 ==========
  // activeQuickReplyCategoryId 已在 utils.js 中声明为全局变量，此处不再重复声明
  let isQuickReplyManagementMode = false;
  let selectedQuickReplies = new Set();

  function openQuickReplyModal() {
    const tabsContainer = document.getElementById('quick-reply-tabs');
    if (tabsContainer) tabsContainer.dataset.needsRefresh = 'true';
    renderQuickReplyList(true);
    document.getElementById('quick-reply-modal').classList.add('visible');
  }

  async function renderQuickReplyList(rerenderTabs = true) {
    const listEl = document.getElementById('quick-reply-list');
    const tabsContainer = document.getElementById('quick-reply-tabs');
    listEl.innerHTML = '';
    if (rerenderTabs) {
      const categories = await db.quickReplyCategories.toArray();
      if (tabsContainer.children.length === 0 || tabsContainer.dataset.needsRefresh === 'true') {
        tabsContainer.innerHTML = '';
        tabsContainer.dataset.needsRefresh = 'false';
        const createTab = (id, name) => {
          const btn = document.createElement('button');
          btn.className = 'sticker-category-tab';
          if (activeQuickReplyCategoryId === id) btn.classList.add('active');
          btn.textContent = name;
          btn.dataset.categoryId = id;
          btn.onclick = () => switchQuickReplyCategory(id);
          return btn;
        };
        tabsContainer.appendChild(createTab('all', '全部'));
        categories.forEach(cat => tabsContainer.appendChild(createTab(cat.id, cat.name)));
        tabsContainer.appendChild(createTab('uncategorized', '未分类'));
      } else {
        const tabs = tabsContainer.querySelectorAll('.sticker-category-tab');
        tabs.forEach(tab => {
          if (String(tab.dataset.categoryId) === String(activeQuickReplyCategoryId)) {
            tab.classList.add('active');
            tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          } else {
            tab.classList.remove('active');
          }
        });
      }
    }
    let repliesToShow;
    if (activeQuickReplyCategoryId === 'all') {
      repliesToShow = state.quickReplies;
    } else if (activeQuickReplyCategoryId === 'uncategorized') {
      repliesToShow = state.quickReplies.filter(r => !r.categoryId);
    } else {
      repliesToShow = state.quickReplies.filter(r => r.categoryId == activeQuickReplyCategoryId);
    }
    if (!repliesToShow || repliesToShow.length === 0) {
      const tipText = activeQuickReplyCategoryId === 'all'
        ? '你还没有添加任何快捷回复。<br>点击右上角"+"号添加第一条吧！'
        : '这个分类下还没有回复哦~';
      listEl.innerHTML = `<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">${tipText}</p>`;
      return;
    }
    repliesToShow.forEach(reply => {
      const item = document.createElement('div');
      item.className = 'quick-reply-item';
      const isSelected = selectedQuickReplies.has(reply.id);
      if (isSelected) item.classList.add('selected');
      item.innerHTML = `
            <input type="checkbox" class="quick-reply-checkbox" ${isSelected ? 'checked' : ''}>
            <span class="quick-reply-text" data-text="${escapeHTML(reply.text)}">${escapeHTML(reply.text)}</span>
            <div class="quick-reply-actions">
                <button class="quick-reply-edit-btn" data-id="${reply.id}" title="编辑">✏️</button>
                <button class="quick-reply-delete-btn" data-id="${reply.id}" title="删除">🗑️</button>
            </div>`;
      item.addEventListener('click', (e) => {
        if (isQuickReplyManagementMode) {
          if (!e.target.closest('.quick-reply-actions')) {
            toggleQuickReplySelection(reply.id);
            const cb = item.querySelector('.quick-reply-checkbox');
            if (cb) cb.checked = !cb.checked;
          }
        } else {
          const textEl = e.target.closest('.quick-reply-text');
          const editBtn = e.target.closest('.quick-reply-edit-btn');
          const deleteBtn = e.target.closest('.quick-reply-delete-btn');
          if (textEl) selectQuickReply(textEl.dataset.text);
          else if (editBtn) editQuickReply(reply.id);
          else if (deleteBtn) deleteQuickReply(reply.id);
        }
      });
      listEl.appendChild(item);
    });
  }

  function switchQuickReplyCategory(categoryId) {
    activeQuickReplyCategoryId = categoryId;
    renderQuickReplyList(true);
  }

  function selectQuickReply(text) {
    const chatInput = document.getElementById('chat-input');
    chatInput.value = text;
    document.getElementById('quick-reply-modal').classList.remove('visible');
    chatInput.focus();
  }

  function toggleQuickReplyManagementMode() {
    isQuickReplyManagementMode = !isQuickReplyManagementMode;
    const listEl = document.getElementById('quick-reply-list');
    const actionBar = document.getElementById('quick-reply-action-bar');
    const normalFooter = document.getElementById('quick-reply-normal-footer');
    const batchBtn = document.getElementById('batch-quick-reply-btn');
    if (isQuickReplyManagementMode) {
      listEl.classList.add('management-mode');
      actionBar.style.display = 'flex';
      normalFooter.style.display = 'none';
      batchBtn.textContent = "完成";
      batchBtn.style.color = "var(--accent-color)";
    } else {
      listEl.classList.remove('management-mode');
      actionBar.style.display = 'none';
      normalFooter.style.display = 'flex';
      batchBtn.textContent = "批量";
      batchBtn.style.color = "";
      selectedQuickReplies.clear();
      updateQuickReplyActionBar();
      renderQuickReplyList(false);
    }
  }

  function toggleQuickReplySelection(id) {
    if (selectedQuickReplies.has(id)) selectedQuickReplies.delete(id);
    else selectedQuickReplies.add(id);
    updateQuickReplyActionBar();
    renderQuickReplyList(false);
  }

  function updateQuickReplyActionBar() {
    const count = selectedQuickReplies.size;
    document.getElementById('move-selected-quick-replies-btn').textContent = `移动 (${count})`;
    document.getElementById('delete-selected-quick-replies-btn').textContent = `删除 (${count})`;
  }

  function handleSelectAllQuickReplies() {
    const isChecked = document.getElementById('select-all-quick-replies-checkbox').checked;
    let currentViewReplies;
    if (activeQuickReplyCategoryId === 'all') currentViewReplies = state.quickReplies;
    else if (activeQuickReplyCategoryId === 'uncategorized') currentViewReplies = state.quickReplies.filter(r => !r.categoryId);
    else currentViewReplies = state.quickReplies.filter(r => r.categoryId == activeQuickReplyCategoryId);
    if (isChecked) currentViewReplies.forEach(r => selectedQuickReplies.add(r.id));
    else selectedQuickReplies.clear();
    updateQuickReplyActionBar();
    renderQuickReplyList(false);
  }

  async function executeBatchMoveQuickReplies() {
    if (selectedQuickReplies.size === 0) return alert("请先选择回复。");
    const categories = await db.quickReplyCategories.toArray();
    const options = [{ text: '未分类', value: 'uncategorized' }, ...categories.map(c => ({ text: c.name, value: c.id }))];
    const targetCategoryId = await showChoiceModal("移动到分类", options);
    if (!targetCategoryId) return;
    const finalCategoryId = targetCategoryId === 'uncategorized' ? null : parseInt(targetCategoryId);
    await db.transaction('rw', db.quickReplies, async () => {
      for (const id of selectedQuickReplies) {
        await db.quickReplies.update(id, { categoryId: finalCategoryId });
        const r = state.quickReplies.find(item => item.id === id);
        if (r) r.categoryId = finalCategoryId;
      }
    });
    await showCustomAlert("成功", `已移动 ${selectedQuickReplies.size} 条回复。`);
    toggleQuickReplyManagementMode();
    renderQuickReplyList(false);
  }

  async function executeBatchDeleteQuickReplies() {
    if (selectedQuickReplies.size === 0) return alert("请先选择回复。");
    const confirmed = await showCustomConfirm("确认删除", `确定要删除选中的 ${selectedQuickReplies.size} 条回复吗？`);
    if (!confirmed) return;
    const ids = Array.from(selectedQuickReplies);
    await db.quickReplies.bulkDelete(ids);
    state.quickReplies = state.quickReplies.filter(r => !selectedQuickReplies.has(r.id));
    await showCustomAlert("成功", "已删除选中回复。");
    toggleQuickReplyManagementMode();
    renderQuickReplyList(false);
  }

  async function addNewQuickReply() {
    const text = await showCustomPrompt("添加快捷回复", "请输入要添加的回复内容：", "", "textarea");
    if (text && text.trim()) {
      let targetCategory = null;
      if (activeQuickReplyCategoryId !== 'all' && activeQuickReplyCategoryId !== 'uncategorized') targetCategory = activeQuickReplyCategoryId;
      const newReply = { text: text.trim(), categoryId: targetCategory };
      const newId = await db.quickReplies.add(newReply);
      state.quickReplies.push({ id: newId, ...newReply });
      renderQuickReplyList(false);
    } else if (text !== null) {
      alert("内容不能为空！");
    }
  }

  async function openQuickReplyCategoryManager() {
    await renderQuickReplyCategoriesInManager();
    document.getElementById('quick-reply-category-manager-modal').classList.add('visible');
  }

  async function renderQuickReplyCategoriesInManager() {
    const listEl = document.getElementById('existing-quick-reply-categories-list');
    const categories = await db.quickReplyCategories.toArray();
    listEl.innerHTML = '';
    if (categories.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有任何分类</p>';
      return;
    }
    categories.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'existing-group-item';
      item.innerHTML = `<span class="group-name">${cat.name}</span><span class="delete-group-btn" data-id="${cat.id}">×</span>`;
      item.querySelector('.delete-group-btn').onclick = () => deleteQuickReplyCategory(cat.id);
      listEl.appendChild(item);
    });
  }

  async function addNewQuickReplyCategory() {
    const input = document.getElementById('new-quick-reply-category-name-input');
    const name = input.value.trim();
    if (!name) { alert('分类名不能为空！'); return; }
    const existing = await db.quickReplyCategories.where('name').equals(name).first();
    if (existing) { alert(`分类 "${name}" 已经存在了！`); return; }
    await db.quickReplyCategories.add({ name });
    input.value = '';
    await renderQuickReplyCategoriesInManager();
    document.getElementById('quick-reply-tabs').dataset.needsRefresh = 'true';
  }

  async function deleteQuickReplyCategory(categoryId) {
    const category = await db.quickReplyCategories.get(categoryId);
    if (!category) return;
    const confirmed = await showCustomConfirm('确认删除分类', `删除分类《${category.name}》后，该分类下的回复将变为"未分类"。确定吗？`, { confirmButtonClass: 'btn-danger' });
    if (confirmed) {
      await db.quickReplyCategories.delete(categoryId);
      const repliesToUpdate = state.quickReplies.filter(r => r.categoryId == categoryId);
      for (const reply of repliesToUpdate) { reply.categoryId = null; await db.quickReplies.put(reply); }
      await renderQuickReplyCategoriesInManager();
      if (activeQuickReplyCategoryId == categoryId) activeQuickReplyCategoryId = 'all';
      document.getElementById('quick-reply-tabs').dataset.needsRefresh = 'true';
      await renderQuickReplyList(true);
    }
  }

  window.openQuickReplyModal = openQuickReplyModal;
  window.renderQuickReplyList = renderQuickReplyList;
  window.toggleQuickReplyManagementMode = toggleQuickReplyManagementMode;
  window.handleSelectAllQuickReplies = handleSelectAllQuickReplies;
  window.executeBatchMoveQuickReplies = executeBatchMoveQuickReplies;
  window.executeBatchDeleteQuickReplies = executeBatchDeleteQuickReplies;
  window.addNewQuickReply = addNewQuickReply;
  window.openQuickReplyCategoryManager = openQuickReplyCategoryManager;
  window.addNewQuickReplyCategory = addNewQuickReplyCategory;

  // ========== 从 script.js 迁移：手动总结相关 ==========
  async function handleManualSummary() {
    const confirmed = await showCustomConfirm('确认操作', '这将提取最近的对话内容发送给AI进行总结，会消耗API额度。确定要继续吗？');
    if (confirmed) {
      const chat = state.chats[state.activeChatId];
      const memoryMode = chat ? (chat.settings.memoryMode || 'diary') : 'diary';
      if (memoryMode === 'vector' && window.vectorMemoryManager) {
        await triggerVectorMemorySummary(state.activeChatId, true);
      } else {
        await triggerAutoSummary(state.activeChatId, true);
        if ((memoryMode === 'structured' || (chat && chat.settings.enableStructuredMemory)) && window.structuredMemoryManager) {
          await triggerStructuredMemorySummary(state.activeChatId, true);
          showToast('结构化记忆已同步更新', 'success');
        }
      }
    }
  }

  function openManualSummaryModal() {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;
    if (chat.settings.enableDiaryMode) {
      if (typeof handleDiaryModeSummary === 'function') handleDiaryModeSummary();
      return;
    }
    const modal = document.getElementById('manual-summary-modal');
    const totalCount = document.getElementById('manual-summary-total-count');
    const startInput = document.getElementById('manual-summary-start');
    const endInput = document.getElementById('manual-summary-end');
    const availableMessages = chat.history.filter(m => !m.isHidden || (m.role === 'system' && m.content.includes('内心独白')));
    const totalMessages = availableMessages.length;
    totalCount.textContent = totalMessages;
    startInput.max = totalMessages;
    endInput.max = totalMessages;
    endInput.value = Math.min(20, totalMessages);
    modal.style.display = 'flex';
  }

  function closeManualSummaryModal() {
    const modal = document.getElementById('manual-summary-modal');
    modal.style.display = 'none';
  }

  window.handleManualSummary = handleManualSummary;
  window.openManualSummaryModal = openManualSummaryModal;
  window.closeManualSummaryModal = closeManualSummaryModal;

  // ========== 自定义小组管理功能已移至 douban.js ==========

  // ========== 从 script.js 迁移：editDiary, handleWriteNewDiaryEntry ==========
  // 注意：这些函数依赖 activeDiaryForViewing, activeCharacterId 等全局变量

  function editDiary() {
    if (!activeDiaryForViewing || !activeCharacterId) return;
    const diary = activeDiaryForViewing;
    const char = state.chats[activeCharacterId];
    if (!char || !char.diary) return;
    const escapedTitle = diary.title.replace(/"/g, '&quot;');
    const escapedContent = diary.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const formHtml = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div><label style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;display:block;">标题</label>
        <input id="edit-diary-title-input" type="text" value="${escapedTitle}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;font-size:16px;box-sizing:border-box;"></div>
        <div><label style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;display:block;">内容</label>
        <textarea id="edit-diary-content-input" rows="10" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;font-size:15px;box-sizing:border-box;resize:vertical;line-height:1.6;">${escapedContent}</textarea></div>
      </div>`;
    modalResolve = null;
    modalTitle.textContent = '编辑日记';
    modalBody.innerHTML = formHtml;
    const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');
    if (modalFooter) {
      modalFooter.style.flexDirection = 'row';
      modalFooter.style.justifyContent = 'flex-end';
      modalFooter.style.maxHeight = '';
      modalFooter.style.overflowY = '';
      modalFooter.innerHTML = `<button id="custom-modal-cancel">取消</button><button id="custom-modal-confirm" class="confirm-btn">保存</button>`;
    }
    document.getElementById('custom-modal-cancel').onclick = () => hideCustomModal();
    document.getElementById('custom-modal-confirm').onclick = async () => {
      const newTitle = document.getElementById('edit-diary-title-input').value.trim();
      const newContent = document.getElementById('edit-diary-content-input').value;
      if (!newTitle) { await showCustomAlert('提示', '标题不能为空。'); return; }
      const entryIndex = char.diary.findIndex(d => d.id === diary.id);
      if (entryIndex === -1) return;
      char.diary[entryIndex].title = newTitle;
      char.diary[entryIndex].content = newContent;
      await db.chats.put(char);
      activeDiaryForViewing = char.diary[entryIndex];
      document.getElementById('char-diary-detail-title').textContent = newTitle;
      const formattedContent = parseMarkdown(newContent).split('\n').map(p => `<p>${p || '&nbsp;'}</p>`).join('');
      document.getElementById('char-diary-detail-content').innerHTML = formattedContent;
      if (typeof renderCharDiaryList === 'function') renderCharDiaryList();
      hideCustomModal();
      await showCustomAlert('编辑成功', '日记已更新。');
    };
    showCustomModal();
  }

  window.editDiary = editDiary;
  window.handleWriteNewDiaryEntry = typeof handleWriteNewDiaryEntry !== 'undefined' ? handleWriteNewDiaryEntry : function() { console.warn('handleWriteNewDiaryEntry not yet migrated'); };

  // ========== 从 script.js 迁移：handleDeleteThought ==========
  async function handleDeleteThought(timestamp) {
    const confirmed = await showCustomConfirm(
      '确认删除',
      '确定要永久删除这条心声记录吗？此操作不可恢复。', {
      confirmButtonClass: 'btn-danger',
      confirmText: '确认删除'
    }
    );

    if (confirmed) {
      const chat = state.chats[state.activeChatId];
      if (!chat || !chat.thoughtsHistory) return;

      const indexToDelete = chat.thoughtsHistory.findIndex(thought => thought.timestamp === timestamp);
      if (indexToDelete === -1) return;

      const isLatest = indexToDelete === chat.thoughtsHistory.length - 1;

      chat.thoughtsHistory = chat.thoughtsHistory.filter(thought => thought.timestamp !== timestamp);

      if (isLatest) {
        if (chat.thoughtsHistory.length > 0) {
          const newLatestThought = chat.thoughtsHistory[chat.thoughtsHistory.length - 1];
          chat.heartfeltVoice = newLatestThought.heartfeltVoice;
          chat.randomJottings = newLatestThought.randomJottings;

          const heartfeltVoiceEl = document.getElementById('profile-heartfelt-voice');
          const randomJottingsEl = document.getElementById('profile-random-jottings');
          if (heartfeltVoiceEl) heartfeltVoiceEl.textContent = chat.heartfeltVoice;
          if (randomJottingsEl) randomJottingsEl.textContent = chat.randomJottings;

          console.log("已删除最新心声，当前心声已回滚至上一条。");
        } else {
          chat.heartfeltVoice = '...';
          chat.randomJottings = '...';

          const heartfeltVoiceEl = document.getElementById('profile-heartfelt-voice');
          const randomJottingsEl = document.getElementById('profile-random-jottings');
          if (heartfeltVoiceEl) heartfeltVoiceEl.textContent = chat.heartfeltVoice;
          if (randomJottingsEl) randomJottingsEl.textContent = chat.randomJottings;

          console.log("已删除最后一条心声，当前心声已重置。");
        }
      }

      await db.chats.put(chat);
      renderThoughtsHistory();
      await showCustomAlert('成功', '该条记录已成功删除。');
    }
  }

  window.handleDeleteThought = handleDeleteThought;

  // 绑定心声历史列表的删除按钮事件
  (function() {
    const thoughtsList = document.getElementById('thoughts-history-list');
    if (thoughtsList) {
      thoughtsList.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.thought-delete-btn');
        if (deleteBtn) {
          const timestamp = parseInt(deleteBtn.dataset.timestamp);
          if (!isNaN(timestamp)) {
            handleDeleteThought(timestamp);
          }
        }
      });
    }
  })();
