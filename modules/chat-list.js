// ============================================================
// chat-list.js
// 聊天列表模块：showScreen、switchToChatListView、renderChatList、
// createChatListItem、createChatGroupContainer、loadMoreChats、
// showChatListActions、appendLoadMoreChatsButton
// 从 script.js 第 4990~5150 + 9862~10275 + 28318~28356 行拆分
// ============================================================

  var isFavoritesSelectionMode = false;

  function showScreen(screenId) {
    // 检查是否从你画我猜屏幕离开
    const currentActiveScreen = document.querySelector('.screen.active');
    if (currentActiveScreen && currentActiveScreen.id === 'draw-guess-screen' && screenId !== 'draw-guess-screen') {
      // 正在离开你画我猜屏幕
      if (drawGuessState.isActive && drawGuessState.partnerId && drawGuessState.history.length > 1) {
        // 有游戏记录，将其发送到聊天历史
        (async () => {
          try {
            const chat = state.chats[drawGuessState.partnerId];
            if (chat) {
              const userNickname = chat.settings.myNickname || '我';

              // 构建游戏记录摘要
              let gameRecord = `[系统提示：刚刚你们玩了你画我猜游戏。以下是游戏的对话记录]\n\n`;

              drawGuessState.history.forEach(msg => {
                gameRecord += `${msg.sender}: ${msg.content}\n`;
              });

              // 添加为灰色系统消息和隐藏调试层
              const gameLog = {
                role: 'system',
                content: gameRecord,
                timestamp: Date.now(),
                isHidden: true,
                isGrayNotice: true
              };

              chat.history.push(gameLog);
              await db.chats.put(chat);

              console.log(`[你画我猜记录] 已将游戏记录添加到 ${chat.name} 的聊天历史中`);
            }
          } catch (error) {
            console.error('[你画我猜记录] 保存游戏记录失败:', error);
          }
        })();
      }
    }

    // 离开聊天界面时停止聊天语音条TTS（通话TTS在独立播放器上，不受影响）
    if (currentActiveScreen && currentActiveScreen.id === 'chat-interface-screen' && screenId !== 'chat-interface-screen' && screenId !== 'voice-call-screen' && screenId !== 'video-call-screen') {
      if (typeof stopChatMessageTtsOnly === 'function') stopChatMessageTtsOnly();
    }

    if (screenId === 'chat-list-screen') {
      renderChatList();
      switchToChatListView('messages-view');
      // 检查是否有购物车清空通知
      checkPendingCartNotifications();
    }
    if (screenId === 'api-settings-screen') {
      window.renderApiSettingsProxy();
      if (state.globalSettings.cleanApiSettings && typeof window.openCleanApiSettings === 'function') {
        // 整洁模式：先让原有回显完成，再构建Tab界面
        setTimeout(() => window.openCleanApiSettings(), 50);
      }
    }
    if (screenId === 'wallpaper-screen') window.renderWallpaperScreenProxy();
    if (screenId === 'world-book-screen') window.renderWorldBookScreenProxy();
    if (screenId === 'x-social-screen') window.renderXSocialScreenProxy();
    if (screenId === 'douban-screen') renderDoubanScreen();
    if (screenId === 'online-app-screen' && typeof onlineChatManager !== 'undefined') {
      onlineChatManager.renderChatList();
      onlineChatManager.showView('online-app-list-view');
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screenToShow = document.getElementById(screenId);
    if (screenToShow) screenToShow.classList.add('active');
    if (screenId === 'chat-interface-screen') window.updateListenTogetherIconProxy(state.activeChatId);
    if (screenId === 'font-settings-screen') {
      loadFontPresetsDropdown();
      document.getElementById('font-url-input').value = state.globalSettings.fontUrl || '';
      applyCustomFont(state.globalSettings.fontUrl || '', true);
      // 初始化本地字体 UI
      const hasLocalFont = !!state.globalSettings.fontLocalData;
      document.getElementById('font-local-filename').textContent = hasLocalFont ? '已加载本地字体' : '';
      document.getElementById('font-local-clear-btn').style.display = hasLocalFont ? 'inline-block' : 'none';
      if (hasLocalFont) {
        document.getElementById('font-url-input').disabled = true;
        document.getElementById('font-url-input').placeholder = '已使用本地字体，清除后可输入URL';
      } else {
        document.getElementById('font-url-input').disabled = false;
        document.getElementById('font-url-input').placeholder = 'https://..../font.ttf';
      }
      // 初始化字体大小滑动条
      const fontSize = state.globalSettings.globalFontSize || 16;
      document.getElementById('font-size-slider').value = fontSize;
      document.getElementById('font-size-value').textContent = fontSize;
      // 初始化字体应用范围 UI
      const scope = state.globalSettings.fontScope || { all: true };
      const allCb = document.getElementById('font-scope-all');
      const scopeList = document.getElementById('font-scope-list');
      allCb.checked = !!scope.all;
      scopeList.style.display = scope.all ? 'none' : 'flex';
      document.querySelectorAll('#font-scope-list input[data-scope]').forEach(cb => {
        cb.checked = scope[cb.dataset.scope] !== false;
      });
    }
  }
  window.updateListenTogetherIconProxy = () => { };

  function switchToChatListView(viewId) {
    const chatListScreen = document.getElementById('chat-list-screen');
    const views = {
      'messages-view': document.getElementById('messages-view'),
      'qzone-screen': document.getElementById('qzone-screen'),
      'favorites-view': document.getElementById('favorites-view'),
      'memories-view': document.getElementById('memories-view'),
      'npc-list-view': document.getElementById('npc-list-view')
    };
    const mainHeader = document.getElementById('main-chat-list-header');
    const mainBottomNav = document.getElementById('chat-list-bottom-nav');

    if (isFavoritesSelectionMode) {
      document.getElementById('favorites-edit-btn').click();
    }


    Object.values(views).forEach(v => v.classList.remove('active'));

    if (views[viewId]) {
      views[viewId].classList.add('active');
    }


    document.querySelectorAll('#chat-list-bottom-nav .nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewId);
    });


    if (viewId === 'messages-view') {
      mainHeader.style.display = 'flex';
      mainBottomNav.style.display = 'flex';
    } else {
      mainHeader.style.display = 'none';
      mainBottomNav.style.display = 'none';
    }


    if (viewId !== 'memories-view') {
      activeCountdownTimers.forEach(timerId => clearInterval(timerId));
      activeCountdownTimers = [];
    }


    switch (viewId) {
      case 'qzone-screen':
        views['qzone-screen'].style.backgroundColor = '#f0f2f5';
        updateUnreadIndicator(0);
        renderQzoneScreen();
        renderQzonePosts();
        break;
      case 'favorites-view':
        views['favorites-view'].style.backgroundColor = '#f9f9f9';
        renderFavoritesScreen();
        break;
      case 'messages-view':

        break;
      case 'npc-list-view':
        renderNpcListScreen();
        break;
    }
  }



  let chatListRenderCount = 0;




  // createChatGroupContainer 和 loadMoreChats 的旧版已删除
  // 保留下方的改进版（loadMoreChats 使用全局 sortedChatListItems，有防重复加载等）

  async function renderChatList() {
    const chatListEl = document.getElementById('chat-list');
    chatListEl.innerHTML = '';


    const allChats = Object.values(state.chats).filter(chat => {
      // 过滤掉联机好友（已迁移到独立的连接APP）
      if (chat.isOnlineFriend || chat.isGroupChat) return false;
      return true;
    }).sort((a, b) => {
      const pinDiff = (b.isPinned || false) - (a.isPinned || false);
      if (pinDiff !== 0) return pinDiff;
      return (b.history.slice(-1)[0]?.timestamp || 0) - (a.history.slice(-1)[0]?.timestamp || 0);
    });

    const allGroups = await db.qzoneGroups.toArray();

    if (allChats.length === 0) {
      chatListEl.innerHTML = '<p style="text-align:center; color: #8a8a8a; margin-top: 50px;">点击右上角 "+" 或群组图标添加聊天</p>';
      return;
    }

    allGroups.forEach(group => {
      const latestChatInGroup = allChats.find(chat => chat.groupId === group.id);
      group.latestTimestamp = latestChatInGroup ? (latestChatInGroup.history.slice(-1)[0]?.timestamp || 0) : 0;
    });
    allGroups.sort((a, b) => b.latestTimestamp - a.latestTimestamp);


    sortedChatListItems = [];
    const processedChatIds = new Set();


    allChats.forEach(chat => {
      if (chat.isPinned) {
        sortedChatListItems.push({
          type: 'chatItem',
          chat
        });
        processedChatIds.add(chat.id);
      }
    });


    allGroups.forEach(group => {

      const groupChats = allChats.filter(chat =>
        !chat.isPinned &&
        !chat.isGroup &&
        chat.groupId === group.id
      );


      if (groupChats.length > 0) {
        sortedChatListItems.push({
          type: 'groupHeader',
          group
        });

        groupChats.forEach(chat => {
          sortedChatListItems.push({
            type: 'chatItem',
            chat
          });
          processedChatIds.add(chat.id);
        });
      }
    });


    allChats.forEach(chat => {
      if (!processedChatIds.has(chat.id)) {
        sortedChatListItems.push({
          type: 'chatItem',
          chat
        });
        processedChatIds.add(chat.id);
      }
    });


    chatListRenderCount = 0;
    loadMoreChats();
  }




  function createChatGroupContainer(group) {
    const groupContainer = document.createElement('div');
    groupContainer.className = 'chat-group-container';
    groupContainer.innerHTML = `
                <div class="chat-group-header">
                    <span class="arrow">▼</span>
                    <span class="group-name">${group.name}</span>
                </div>
                <div class="chat-group-content"></div>
            `;
    return groupContainer;
  }

  function appendLoadMoreChatsButton(container, sortedItems) {
    const button = document.createElement('button');
    button.id = 'load-more-chats-btn';
    button.textContent = '加载更早的会话';
    button.className = 'load-more-btn';


    button.addEventListener('click', () => loadMoreChats(sortedItems), {
      once: true
    });

    container.prepend(button);
  }


  function loadMoreChats() {
    if (isLoadingMoreChats) return;

    const chatListEl = document.getElementById('chat-list');
    const scrollContainer = document.getElementById('messages-view');
    if (!chatListEl || !scrollContainer) return;
    if (chatListRenderCount >= sortedChatListItems.length) return;

    isLoadingMoreChats = true;


    const isInitialLoad = chatListRenderCount === 0;


    const renderContent = () => {
      hideLoader(chatListEl);

      const renderWindow = state.globalSettings.chatListRenderWindow || 30;
      const nextSliceStart = chatListRenderCount;
      const nextSliceEnd = chatListRenderCount + renderWindow;
      const itemsToAppend = sortedChatListItems.slice(nextSliceStart, nextSliceEnd);

      const fragment = document.createDocumentFragment();
      let currentGroupContent = chatListEl.querySelector('.chat-group-content:last-of-type');

      itemsToAppend.forEach(item => {
        if (item.type === 'groupHeader') {
          const groupContainer = createChatGroupContainer(item.group);
          fragment.appendChild(groupContainer);
          currentGroupContent = groupContainer.querySelector('.chat-group-content');
        } else if (item.type === 'chatItem') {
          const listItem = createChatListItem(item.chat);
          // 安全渲染：跳过渲染失败的项，防止一个错误导致整个列表崩溃
          if (!listItem) return;
          if (item.chat.groupId && currentGroupContent) {
            currentGroupContent.appendChild(listItem);
          } else {
            fragment.appendChild(listItem);
            if (!item.chat.groupId) currentGroupContent = null;
          }
        }
      });

      chatListEl.appendChild(fragment);
      chatListRenderCount += itemsToAppend.length;

      chatListEl.querySelectorAll('.chat-group-header:not([data-has-listener="true"])').forEach(header => {
        header.dataset.hasListener = "true";
        header.addEventListener('click', () => {
          header.classList.toggle('collapsed');
          header.nextElementSibling.classList.toggle('collapsed');
        });
      });

      isLoadingMoreChats = false;

      if (scrollContainer.scrollHeight <= scrollContainer.clientHeight && chatListRenderCount < sortedChatListItems.length) {
        loadMoreChats();
      }
    };


    if (isInitialLoad) {

      renderContent();
    } else {

      showLoader(chatListEl, 'bottom');
      setTimeout(renderContent, 500);
    }
  }

  function createChatListItem(chat) {

    try {
      const lastMsgObj = chat.history.filter(msg => !msg.isHidden).slice(-1)[0] || {};
      let lastMsgDisplay;

      if (!chat.isGroup && chat.relationship?.status === 'pending_user_approval') {
        lastMsgDisplay = `<span style="color: #ff8c00;">[好友申请] ${chat.relationship.applicationReason || '请求添加你为好友'}</span>`;
      } else if (!chat.isGroup && chat.relationship?.status === 'blocked_by_ai') {
        lastMsgDisplay = `<span style="color: #dc3545;">[你已被对方拉黑]</span>`;
      } else if (chat.isGroup) {
        if (lastMsgObj.type === 'pat_message') {
          lastMsgDisplay = `[系统消息] ${lastMsgObj.content}`;
        } else if (lastMsgObj.type === 'transfer') {
          lastMsgDisplay = '[转账]';
        } else if (lastMsgObj.type === 'ai_image' || lastMsgObj.type === 'user_photo' || lastMsgObj.type === 'naiimag' || lastMsgObj.type === 'googleimag') {
          lastMsgDisplay = '[照片]';
        } else if (lastMsgObj.type === 'voice_message') {
          lastMsgDisplay = '[语音]';
        } else if (typeof lastMsgObj.content === 'string' && STICKER_REGEX.test(lastMsgObj.content)) {
          lastMsgDisplay = lastMsgObj.meaning ? `[表情: ${lastMsgObj.meaning}]` : '[表情]';
        } else if (Array.isArray(lastMsgObj.content)) {
          lastMsgDisplay = `[图片]`;
        } else {
          lastMsgDisplay = String(lastMsgObj.content || '...').substring(0, 20);
        }

        if (lastMsgObj.senderName && lastMsgObj.type !== 'pat_message') {
          const senderDisplayName = getDisplayNameInGroup(chat, lastMsgObj.senderName);
          lastMsgDisplay = `${senderDisplayName}: ${lastMsgDisplay}`;
        }
      } else {
        const statusText = chat.status?.text || '在线';
        lastMsgDisplay = `[${statusText}]`;
      }

      const item = document.createElement('div');
      item.className = 'chat-list-item';
      item.dataset.chatId = chat.id;
      if (chat.isPinned) {
        item.classList.add('pinned');
      }

      const avatar = chat.isGroup ? chat.settings.groupAvatar : chat.settings.aiAvatar;
      const avatarFrameSrc = chat.isGroup ? '' : (chat.settings.aiAvatarFrame || '');
      let avatarHtml;
      if (avatarFrameSrc) {
        avatarHtml = `<div class="avatar-with-frame"><img src="${avatar || defaultAvatar}" class="avatar-img"><img src="${avatarFrameSrc}" class="avatar-frame"></div>`;
      } else {
        avatarHtml = `<img src="${avatar || defaultAvatar}" class="avatar">`;
      }
      const hasFrameClass = avatarFrameSrc ? 'has-frame' : '';
      const avatarGroupHtml = `<div class="avatar-group ${hasFrameClass}">${avatarHtml}</div>`;

      item.innerHTML = `
            ${avatarGroupHtml}
            <div class="info">
                <div class="name-line">
                    <span class="name">${chat.name}</span>
                    ${chat.isGroup ? '<span class="group-tag">群聊</span>' : ''}
                </div>
                <div class="last-msg" style="color: ${chat.isGroup ? 'var(--text-secondary)' : '#b5b5b5'}; font-style: italic;">${lastMsgDisplay}</div>
            </div>
            <div class="unread-count-wrapper">
                <span class="unread-count" style="display: none;">0</span>
            </div>
        `;

      const unreadCount = chat.unreadCount || 0;
      const unreadEl = item.querySelector('.unread-count');
      if (unreadCount > 0) {
        unreadEl.textContent = unreadCount > 99 ? '99+' : unreadCount;
        unreadEl.style.display = 'inline-flex';
      } else {
        unreadEl.style.display = 'none';
      }

      const avatarGroupEl = item.querySelector('.avatar-group');
      if (avatarGroupEl) {
        avatarGroupEl.style.cursor = 'pointer';
        avatarGroupEl.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          const nameToPat = chat.isGroup ? chat.name : chat.originalName;
          handleUserPat(chat.id, nameToPat);
        });
      }

      const infoEl = item.querySelector('.info');
      if (infoEl) {
        infoEl.addEventListener('click', () => openChat(chat.id));
      }

      addLongPressListener(item, async (e) => {
        const action = await showChatListActions(chat);
        switch (action) {
          case 'pin':
            chat.isPinned = !chat.isPinned;
            await db.chats.put(chat);
            renderChatList();
            break;
          case 'delete':
            const deleteConfirmed = await showCustomConfirm('删除对话', `确定要删除与 "${chat.name}" 的整个对话吗？此操作不可撤销。`, {
              confirmButtonClass: 'btn-danger'
            });
            if (deleteConfirmed) {
              if (musicState.isActive && musicState.activeChatId === chat.id) {
                await endListenTogetherSession(false);
              }
              delete state.chats[chat.id];
              if (state.activeChatId === chat.id) state.activeChatId = null;
              await db.chats.delete(chat.id);
              renderChatList();
            }
            break;
          default:
            break;
        }
      });
      return item;

    } catch (error) {
      console.error(`渲染聊天项 [${chat.name || '未知'}] (ID: ${chat.id}) 时出错:`, error);
      
      // 安全渲染模式：返回错误占位符而不是 null，让用户知道哪个聊天项有问题
      if (state.globalSettings.safeRenderMode) {
        const errorItem = document.createElement('div');
        errorItem.className = 'chat-list-item chat-list-item-error';
        errorItem.dataset.chatId = chat.id;
        errorItem.innerHTML = `
          <div class="avatar-group">
            <div style="width: 50px; height: 50px; border-radius: 10px; background: #ffebee; display: flex; align-items: center; justify-content: center; color: #c62828; font-size: 20px;">⚠</div>
          </div>
          <div class="info">
            <div class="name-line">
              <span class="name" style="color: #c62828;">${chat.name || '未知聊天'}</span>
            </div>
            <div class="last-msg" style="color: #e57373; font-size: 11px;">渲染失败，点击尝试修复</div>
          </div>
        `;
        errorItem.addEventListener('click', async () => {
          if (confirm(`聊天项 "${chat.name}" 渲染失败。\n\n可能的原因：数据损坏或格式不兼容。\n\n是否尝试打开此聊天？（如果打开后仍有问题，可以在聊天设置中尝试修复）`)) {
            try {
              await openChat(chat.id);
            } catch (e) {
              alert('打开聊天失败：' + e.message);
            }
          }
        });
        return errorItem;
      }
      
      return null;
    }
  }



  function showChatListActions(chat) {
    return new Promise(resolve => {
      const modal = document.getElementById('chat-list-actions-modal');
      const pinBtn = document.getElementById('chat-list-action-pin');
      const deleteBtn = document.getElementById('chat-list-action-delete');
      const cancelBtn = document.getElementById('chat-list-action-cancel');


      pinBtn.textContent = chat.isPinned ? '取消置顶' : '置顶聊天';


      const newPinBtn = pinBtn.cloneNode(true);
      pinBtn.parentNode.replaceChild(newPinBtn, pinBtn);
      newPinBtn.onclick = () => {
        modal.classList.remove('visible');
        resolve('pin');
      };

      const newDeleteBtn = deleteBtn.cloneNode(true);
      deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
      newDeleteBtn.onclick = () => {
        modal.classList.remove('visible');
        resolve('delete');
      };

      const newCancelBtn = cancelBtn.cloneNode(true);
      cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
      newCancelBtn.onclick = () => {
        modal.classList.remove('visible');
        resolve(null);
      };

      modal.classList.add('visible');
    });
  }

  // ========== 全局暴露 ==========
  window.renderChatList = renderChatList;
  window.loadMoreChats = loadMoreChats;
  window.switchToChatListView = switchToChatListView;
