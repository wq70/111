  const getGlobalState = () => (typeof state !== 'undefined' && state) ? state : (window.state || {});

  async function openDeleteDoubanPostsModal() {
    const modal = document.getElementById('delete-douban-posts-modal');
    const listEl = document.getElementById('delete-douban-posts-list');
    if (!modal || !listEl) {
      console.warn("未找到 delete-douban-posts-modal 或 delete-douban-posts-list 元素");
      return;
    }
    // 帖子管理是豆瓣设置的子页面，避免两个弹窗同时显示造成内容和按钮重叠。
    document.getElementById('douban-settings-modal')?.classList.remove('visible');
    listEl.innerHTML = '';

    // 获取所有豆瓣帖子
    const posts = await db.doubanPosts.orderBy('timestamp').reverse().toArray();

    if (posts.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color:#8a8a8a; padding: 50px 0;">暂无豆瓣帖子</p>';
      modal.classList.add('visible');
      return;
    }

    // 渲染帖子列表
    posts.forEach(post => {
      const item = document.createElement('div');
      item.className = 'clear-posts-item';
      item.dataset.postId = post.id;

      // 获取作者头像
      let authorAvatar = 'https://i.postimg.cc/Pq2xJN1g/IMG-7301.jpg'; // 默认豆瓣头像
      const appState = getGlobalState();
      const character = appState.chats ? appState.chats[post.authorId] : null;
      if (character) {
        authorAvatar = character.settings.aiAvatar;
      } else if (post.authorId === 'user') {
        authorAvatar = appState.qzoneSettings?.avatar || 'https://i.postimg.cc/Pq2xJN1g/IMG-7301.jpg';
      }

      const postContent = post.content.length > 50 ? post.content.substring(0, 50) + '...' : post.content;
      const timeStr = formatTimeAgo(post.timestamp);

      item.innerHTML = `
        <div class="checkbox"></div>
        <div style="flex: 1; display: flex; align-items: center; gap: 10px;">
          <img src="${escapeHTML(post.authorAvatar || authorAvatar)}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;" onerror="this.onerror=null; this.src=defaultAvatar;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 500; font-size: 14px; margin-bottom: 2px;">${escapeHTML(post.postTitle || '')}</div>
            <div style="font-size: 12px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHTML(postContent)}</div>
            <div style="font-size: 11px; color: #bbb; margin-top: 2px;">${escapeHTML(post.authorName || '')} · ${timeStr}</div>
          </div>
        </div>
      `;
      listEl.appendChild(item);
    });

    // 重置全选状态
    const selectAllCb = document.getElementById('select-all-douban-posts');
    if (selectAllCb) {
      selectAllCb.checked = false;
    }

    modal.classList.add('visible');
  }


  async function handleConfirmDeleteDoubanPosts() {
    const selectedItems = document.querySelectorAll('#delete-douban-posts-list .clear-posts-item.selected');
    if (selectedItems.length === 0) {
      alert("请至少选择一个要删除的帖子。");
      return;
    }

    const postIds = Array.from(selectedItems).map(item => parseInt(item.dataset.postId));

    const confirmMessage = `确定要删除选中的 ${postIds.length} 个帖子吗？此操作无法恢复！`;

    const confirmed = await showCustomConfirm(
      '确认删除？',
      confirmMessage, {
      confirmButtonClass: 'btn-danger',
      confirmText: '确认删除'
    }
    );

    if (!confirmed) return;

    try {
      // 删除选中的帖子
      await db.doubanPosts.bulkDelete(postIds);

      // 关闭模态框
      document.getElementById('delete-douban-posts-modal').classList.remove('visible');
      document.getElementById('douban-settings-modal')?.classList.add('visible');

      // 如果当前在豆瓣页面，刷新列表
      const appState = getGlobalState();
      if (appState.currentScreen === 'douban-screen') {
        await renderDoubanScreen();
      }

      await showCustomAlert('操作成功', `已删除 ${postIds.length} 个豆瓣帖子。`);

    } catch (error) {
      console.error("删除豆瓣帖子失败:", error);
      alert("删除失败，请稍后再试。");
    }
  }

  // ========== 全局暴露 ==========
  window.toggleDoubanSelectMode = toggleDoubanSelectMode;
  window.toggleDoubanDetailSelectMode = toggleDoubanDetailSelectMode;
  window.forwardSelectedDoubanPosts = async function() {
    if (selectedDoubanPosts.size === 0) return;
    const posts = await db.doubanPosts.toArray();
    const selectedData = posts.filter(p => selectedDoubanPosts.has(p.id));
    
    let htmlContent = '<div class="douban-forward-card"><div class="douban-forward-card-header"><svg class="douban-logo-icon" viewBox="0 0 1024 1024"><path d="M170.666667 170.666667h128v682.666666h-128zM426.666667 170.666667h170.666666v682.666666h-170.666666zM725.333333 170.666667h128v682.666666h-128z"></path></svg><span class="douban-forward-card-title">转发的豆瓣帖子</span></div><div class="douban-forward-card-body">';
    
    selectedData.forEach(p => {
        const textContent = escapeHTML(p.content.replace(/<br>/g, '\n'));
        htmlContent += `<div class="douban-forward-item"><div class="douban-forward-item-header"><span class="douban-forward-tag">${escapeHTML(p.groupName || '')}</span><span class="douban-forward-author">${escapeHTML(p.authorName || '')}</span></div><div class="douban-forward-post-title">${escapeHTML(p.postTitle || '')}</div><div class="douban-forward-text">${textContent}</div></div>`;
    });
    
    htmlContent += '</div></div>';
    forwardDoubanContent(htmlContent);
  };
  
  window.deleteSelectedDoubanPosts = async function() {
    if (selectedDoubanPosts.size === 0) return;
    const confirmed = await showCustomConfirm(
      '确认删除？',
      `确定要删除选中的 ${selectedDoubanPosts.size} 个帖子吗？`,
      { confirmButtonClass: 'btn-danger', confirmText: '确认删除' }
    );
    if (!confirmed) return;
    
    const postIds = Array.from(selectedDoubanPosts);
    await db.doubanPosts.bulkDelete(postIds);
    await showCustomAlert('删除成功', `已成功删除 ${postIds.length} 个帖子。`);
    
    if (isDoubanSelectMode) toggleDoubanSelectMode();
    await renderDoubanScreen();
  };
  
  window.deleteSelectedDoubanComments = async function() {
    if (selectedDoubanComments.size === 0) return;
    const post = await db.doubanPosts.get(activeDoubanPostId);
    if (!post) return;
    
    // 如果勾选了楼主（即整个帖子），直接走删除整个帖子逻辑
    if (selectedDoubanComments.has('post_body')) {
      const confirmed = await showCustomConfirm(
        '确认删除？',
        `您选中了楼主内容，这将会删除整篇帖子，确定要删除吗？`,
        { confirmButtonClass: 'btn-danger', confirmText: '确认删除' }
      );
      if (!confirmed) return;
      await db.doubanPosts.delete(activeDoubanPostId);
      if (isDoubanDetailSelectMode) toggleDoubanDetailSelectMode();
      showScreen('douban-screen');
      await renderDoubanScreen();
      await showCustomAlert('删除成功', '该帖子已被删除。');
      return;
    }
    
    // 否则仅删除选中的回应
    const confirmed = await showCustomConfirm(
      '确认删除？',
      `确定要删除选中的 ${selectedDoubanComments.size} 个回应吗？`,
      { confirmButtonClass: 'btn-danger', confirmText: '确认删除' }
    );
    if (!confirmed) return;
    
    if (post.comments) {
        const appState = getGlobalState();
        const myNickname = appState.globalSettings?.doubanUserNickname || appState.qzoneSettings?.nickname || '我';
        const newComments = [];
        post.comments.forEach(comment => {
            const isUserComment = comment.isUser || comment.commenter === '我' || comment.commenter === appState.qzoneSettings?.nickname || comment.commenter === appState.globalSettings?.doubanUserNickname;
            const displayCommenterName = comment.commenterDisplayName || (isUserComment ? myNickname : comment.commenter);
            const commentId = btoa(unescape(encodeURIComponent(displayCommenterName + comment.text))).replace(/[^a-zA-Z0-9]/g, '');
            if (!selectedDoubanComments.has(commentId)) {
                newComments.push(comment);
            }
        });
        post.comments = newComments;
        post.commentsCount = newComments.length;
        await db.doubanPosts.put(post);
    }
    
    if (isDoubanDetailSelectMode) toggleDoubanDetailSelectMode();
    await openDoubanPostDetail(activeDoubanPostId);
    await showCustomAlert('删除成功', `已成功删除 ${selectedDoubanComments.size} 个回应。`);
  };

  window.forwardSelectedDoubanComments = async function() {
    if (selectedDoubanComments.size === 0) return;
    const post = await db.doubanPosts.get(activeDoubanPostId);
    if (!post) return;
    
    let htmlContent = `<div class="douban-forward-card"><div class="douban-forward-card-header"><svg class="douban-logo-icon" viewBox="0 0 1024 1024"><path d="M170.666667 170.666667h128v682.666666h-128zM426.666667 170.666667h170.666666v682.666666h-170.666666zM725.333333 170.666667h128v682.666666h-128z"></path></svg><span class="douban-forward-card-title">《${escapeHTML(post.postTitle || '')}》的回应</span></div><div class="douban-forward-card-body">`;
    
    if (selectedDoubanComments.has('post_body')) {
        const textContent = escapeHTML(post.content.replace(/<br>/g, '\n'));
        htmlContent += `<div class="douban-forward-item"><div class="douban-forward-item-header"><span class="douban-forward-tag">楼主</span><span class="douban-forward-author">${escapeHTML(post.authorName || '')}</span></div><div class="douban-forward-text">${textContent}</div></div>`;
    }
    
    if (post.comments) {
        const appState = getGlobalState();
        const myNickname = appState.globalSettings?.doubanUserNickname || appState.qzoneSettings?.nickname || '我';
        post.comments.forEach(comment => {
            const isUserComment = comment.isUser || comment.commenter === '我' || comment.commenter === appState.qzoneSettings?.nickname || comment.commenter === appState.globalSettings?.doubanUserNickname;
            const displayCommenterName = comment.commenterDisplayName || (isUserComment ? myNickname : comment.commenter);
            const commentId = btoa(unescape(encodeURIComponent(displayCommenterName + comment.text))).replace(/[^a-zA-Z0-9]/g, '');
            if (selectedDoubanComments.has(commentId)) {
                htmlContent += `<div class="douban-forward-item"><div class="douban-forward-item-header"><span class="douban-forward-tag">回应</span><span class="douban-forward-author">${escapeHTML(displayCommenterName || '')}</span></div><div class="douban-forward-text">${escapeHTML(comment.text || '')}</div></div>`;
            }
        });
    }
    
    htmlContent += '</div></div>';
    forwardDoubanContent(htmlContent);
  };
  
  async function forwardDoubanContent(content) {
    if (typeof openForwardTargetPicker === 'function') {
        await openForwardTargetPicker({
            customHandler: async (selectedTargetIds) => {
                if (!selectedTargetIds || selectedTargetIds.length === 0) return alert("请选择要转发到的聊天。");

                const doubanMsg = {
                    role: 'user',
                    type: 'html',
                    timestamp: Date.now(),
                    content: content
                };

                const appState = getGlobalState();
                for (const targetId of selectedTargetIds) {
                    const targetChat = appState.chats ? appState.chats[targetId] : null;
                    if (targetChat) {
                        targetChat.history.push(doubanMsg);

                        targetChat.history.push({
                            role: 'system',
                            content: `[系统提示：用户向你分享了豆瓣上的帖子/评论。请根据你的人设，对这些内容发表你的看法或吐槽。]`,
                            timestamp: Date.now() + 1,
                            isHidden: true
                        });

                        await db.chats.put(targetChat);
                    }
                }

                await showCustomAlert("转发成功", "豆瓣内容已成功转发到选定聊天。");

                if (isDoubanSelectMode) toggleDoubanSelectMode();
                if (isDoubanDetailSelectMode) toggleDoubanDetailSelectMode();

                // 如果当前在被转发的聊天界面，触发AI回复
                if (appState.activeChatId && selectedTargetIds.includes(appState.activeChatId)) {
                    if (typeof renderChatInterface === 'function') {
                        renderChatInterface(appState.activeChatId);
                    }
                    if (typeof triggerAiResponse === 'function') {
                        triggerAiResponse();
                    } else if (window.triggerAiResponse) {
                        window.triggerAiResponse();
                    }
                }
            }
        });
    }
  }

  // Bind UI events
  document.addEventListener('DOMContentLoaded', () => {
      const doubanUserAvatarResetBtn = document.getElementById('douban-user-avatar-reset-btn');
      if (doubanUserAvatarResetBtn) {
          doubanUserAvatarResetBtn.addEventListener('click', () => {
              const avatarPreview = document.getElementById('douban-user-avatar-preview');
              if (avatarPreview) {
                  avatarPreview.src = 'https://i.postimg.cc/nMbyyt1t/D7CD735A73F5FD1D7B8407E0EB8BBAC0.png';
              }
              const nicknameInput = document.getElementById('douban-user-nickname-input');
              if (nicknameInput) {
                  nicknameInput.value = '';
              }
          });
      }

      const doubanSelectBtn = document.getElementById('douban-select-btn');
      if (doubanSelectBtn) doubanSelectBtn.addEventListener('click', toggleDoubanSelectMode);
      
      const cancelDoubanSelectBtn = document.getElementById('cancel-douban-select-btn');
      if (cancelDoubanSelectBtn) cancelDoubanSelectBtn.addEventListener('click', toggleDoubanSelectMode);
      
      const forwardDoubanBtn = document.getElementById('forward-selected-douban-btn');
      if (forwardDoubanBtn) forwardDoubanBtn.addEventListener('click', forwardSelectedDoubanPosts);
      
      const selectAllDoubanCb = document.getElementById('select-all-douban-checkbox');
      if (selectAllDoubanCb) {
          selectAllDoubanCb.addEventListener('change', (e) => {
              const isChecked = e.target.checked;
              document.querySelectorAll('.douban-post-item').forEach(item => {
                  const postId = parseInt(item.dataset.postId);
                  if (isChecked) {
                      item.classList.add('selected');
                      selectedDoubanPosts.add(postId);
                  } else {
                      item.classList.remove('selected');
                      selectedDoubanPosts.delete(postId);
                  }
              });
              updateDoubanForwardButton();
          });
      }
      
      const doubanDetailSelectBtn = document.getElementById('douban-detail-select-btn');
      if (doubanDetailSelectBtn) doubanDetailSelectBtn.addEventListener('click', toggleDoubanDetailSelectMode);
      
      const cancelDoubanDetailSelectBtn = document.getElementById('cancel-douban-detail-select-btn');
      if (cancelDoubanDetailSelectBtn) cancelDoubanDetailSelectBtn.addEventListener('click', toggleDoubanDetailSelectMode);
      
      const forwardDoubanDetailBtn = document.getElementById('forward-selected-douban-detail-btn');
      if (forwardDoubanDetailBtn) forwardDoubanDetailBtn.addEventListener('click', forwardSelectedDoubanComments);
      
      const deleteDoubanBtn = document.getElementById('delete-selected-douban-btn');
      if (deleteDoubanBtn) deleteDoubanBtn.addEventListener('click', deleteSelectedDoubanPosts);
      
      const deleteDoubanDetailBtn = document.getElementById('delete-selected-douban-detail-btn');
      if (deleteDoubanDetailBtn) deleteDoubanDetailBtn.addEventListener('click', deleteSelectedDoubanComments);
      
      const selectAllDoubanDetailCb = document.getElementById('select-all-douban-detail-checkbox');
      if (selectAllDoubanDetailCb) {
          selectAllDoubanDetailCb.addEventListener('change', (e) => {
              const isChecked = e.target.checked;
              const postBody = document.getElementById('douban-post-detail-body');
              if (postBody) {
                  if(isChecked) {
                      postBody.classList.add('selected');
                      selectedDoubanComments.add('post_body');
                  } else {
                      postBody.classList.remove('selected');
                      selectedDoubanComments.delete('post_body');
                  }
              }
              document.querySelectorAll('.douban-comment-item').forEach(item => {
                  const commentId = item.dataset.commentId;
                  if (isChecked) {
                      item.classList.add('selected');
                      selectedDoubanComments.add(commentId);
                  } else {
                      item.classList.remove('selected');
                      selectedDoubanComments.delete(commentId);
                  }
              });
              updateDoubanDetailForwardButton();
          });
      }
  });

  window.openDoubanPostDetail = openDoubanPostDetail;
  window.openDoubanSettingsModal = openDoubanSettingsModal;
  window.openDeleteDoubanPostsModal = openDeleteDoubanPostsModal;
  window.renderDoubanScreen = renderDoubanScreen;
  window.invalidateDoubanRender = () => { doubanRenderVersion += 1; };
  window.saveDoubanSettings = saveDoubanSettings;
  window.addNpcAvatarFromURL = addNpcAvatarFromURL;
  window.addNpcAvatarFromLocal = addNpcAvatarFromLocal;
  window.handleNpcAvatarLocalUpload = handleNpcAvatarLocalUpload;
  window.deleteSelectedNpcAvatars = deleteSelectedNpcAvatars;
  window.toggleSelectAllNpcAvatars = toggleSelectAllNpcAvatars;
  window.handleGenerateDoubanPosts = handleGenerateDoubanPosts;
  window.handleIncrementalGenerateDoubanPosts = () => handleGenerateDoubanPosts(true);
  window.handleConfirmDeleteDoubanPosts = handleConfirmDeleteDoubanPosts;
  window.handleDoubanWaitReply = handleDoubanWaitReply;
  window.handleSendDoubanComment = handleSendDoubanComment;
  window.openNpcAvatarsModal = openNpcAvatarsModal;
  window.openCustomGroupsModal = openCustomGroupsModal;
  window.openEditGroupModal = openEditGroupModal;
  window.saveEditGroup = saveEditGroup;
  window.openDoubanPersonaSelector = openDoubanPersonaSelector;
  window.saveDoubanPersonaSelection = saveDoubanPersonaSelection;
  window.openDoubanWorldBookSelector = openDoubanWorldBookSelector;
  window.saveDoubanWorldBookSelection = saveDoubanWorldBookSelection;

  // ========== 从 script.js 迁移：handleConfirmClearPosts ==========
  async function handleConfirmClearPosts() {
    const selectedItems = document.querySelectorAll('#clear-posts-list .clear-posts-item.selected');
    if (selectedItems.length === 0) {
      alert("请至少选择一个要清空的范围。");
      return;
    }

    const targetIds = Array.from(selectedItems).map(item => item.dataset.targetId);

    let targetNames = [];
    const appState = getGlobalState();
    if (targetIds.includes('all')) {
      targetNames.push('所有动态');
    } else {
      if (targetIds.includes('user')) {
        targetNames.push(`"${appState.qzoneSettings?.nickname || '我'}"`);
      }
      targetIds.forEach(id => {
        const character = appState.chats ? appState.chats[id] : null;
        if (character) {
          targetNames.push(`"${character.name}"`);
        }
      });
    }
    const confirmMessage = `此操作将永久删除 ${targetNames.join('、 ')} 的所有动态，且无法恢复！`;

    const confirmed = await showCustomConfirm(
      '确认清空动态？',
      confirmMessage, {
      confirmButtonClass: 'btn-danger',
      confirmText: '确认清空'
    }
    );

    if (!confirmed) return;

    try {
      if (targetIds.includes('all')) {
        await db.qzonePosts.clear();
      } else {
        await db.qzonePosts.where('authorId').anyOf(targetIds).delete();
      }

      qzonePostsCache = await db.qzonePosts.orderBy('timestamp').reverse().toArray();
      qzonePostsRenderCount = 0;
      await renderQzonePosts();

      document.getElementById('clear-posts-modal').classList.remove('visible');
      await showCustomAlert('操作成功', '选定范围内的动态已被清空。');

    } catch (error) {
      console.error("清空动态时出错:", error);
      await showCustomAlert('操作失败', `清空动态时发生错误: ${error.message}`);
    }
  }
  window.handleConfirmClearPosts = handleConfirmClearPosts;
