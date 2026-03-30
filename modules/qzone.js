// ============================================================
// qzone.js
// 来源：script.js 第 5156~5935 行 + 26917~26930 行 + 28677~28720 行
//       （DOMContentLoaded 内部）
// 功能：QQ空间动态系统 —— renderQzoneScreen、saveQzoneSettings、
//       createOrUpdatePostElement、renderQzonePosts、loadMoreQzonePosts、
//       openQzoneStickerPanel、closeQzoneStickerPanel、sendQzoneStickerComment、
//       openRepostModal、hideRepostModal、handleConfirmRepost、
//       displayFilteredFavorites、renderFavoritesScreen、resetCreatePostModal、
//       clearQzoneReplyContext、filterVisiblePostsForAI、
//       updateSinglePostInDOM、formatPostTimestamp
// ============================================================

(function () {
  // state 通过全局作用域访问（window.state，由 init-and-state.js 初始化）

  // 暴露到 window，供 init-event-bindingsB.js / init-features.js 跨文件访问
  window.qzonePostsRenderCount = window.qzonePostsRenderCount || 0;
  window.qzonePostsCache = window.qzonePostsCache || [];

  const QZONE_RENDER_WINDOW = 10;

  // qzoneStickerPanelState 在 init-and-state.js 中赋值 panelEl/gridEl
  // 这里先确保 window 上有该对象，供本模块函数使用
  if (!window.qzoneStickerPanelState) {
    window.qzoneStickerPanelState = {
      isOpen: false,
      activePostId: null,
      panelEl: null,
      gridEl: null
    };
  }
  const qzoneStickerPanelState = window.qzoneStickerPanelState;

  window.isLoadingMorePosts = window.isLoadingMorePosts || false;

  let repostTargetId = null;

  // ========== 来源：script.js 第 5151~5155 行 ==========
  function renderXSocialScreen() {
    console.log("渲染X社交页面");
  }
  window.renderXSocialScreenProxy = renderXSocialScreen;
  window.renderXSocialScreen = renderXSocialScreen;

  // ========== 来源：script.js 第 5156~5165 行 ==========

  function renderQzoneScreen() {
    if (state && state.qzoneSettings) {
      const settings = state.qzoneSettings;
      document.getElementById('qzone-nickname').textContent = settings.nickname;
      document.getElementById('qzone-avatar-img').src = settings.avatar;
      document.getElementById('qzone-banner-img').src = settings.banner;
    }
  }
  window.renderQzoneScreenProxy = renderQzoneScreen;

  async function saveQzoneSettings() {
    if (db && state.qzoneSettings) {
      await db.qzoneSettings.put(state.qzoneSettings);
    }
  }

  function formatPostTimestamp(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const date = new Date(timestamp);
    const diffSeconds = Math.floor((now - date) / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffMinutes < 1) return '刚刚';
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    if (now.getFullYear() === year) {
      return `${month}-${day} ${hours}:${minutes}`;
    } else {
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    }
  }



















  async function createOrUpdatePostElement(post) {
    const existingPostContainer = document.querySelector(`.qzone-post-container[data-post-id="${post.id}"]`);
    const isUpdating = !!existingPostContainer;

    const postContainer = isUpdating ? existingPostContainer : document.createElement('div');
    if (!isUpdating) {
      postContainer.className = 'qzone-post-container';
      postContainer.dataset.postId = post.id;
    }

    const postEl = isUpdating ? postContainer.querySelector('.qzone-post-item') : document.createElement('div');
    if (!isUpdating) {
      postEl.className = 'qzone-post-item';
    }

    let authorAvatar = '',
      authorNickname = '',
      commentAvatar = state.qzoneSettings.avatar;


    if (post.authorId === 'user') {
      authorAvatar = state.qzoneSettings.avatar;
      authorNickname = state.qzoneSettings.nickname;
    } else if (state.chats[post.authorId]) {
      const authorChat = state.chats[post.authorId];
      authorAvatar = authorChat.settings.aiAvatar || defaultAvatar;
      authorNickname = authorChat.name;
    } else if (String(post.authorId).startsWith('npc_')) {

      const npcId = parseInt(String(post.authorId).replace('npc_', ''));
      if (!isNaN(npcId)) {
        const npc = await db.npcs.get(npcId);
        if (npc) {
          authorAvatar = npc.avatar || defaultGroupMemberAvatar;
          authorNickname = npc.name;
        } else {
          authorNickname = post.authorOriginalName || '未知NPC';
          authorAvatar = defaultGroupMemberAvatar;
        }
      }
    } else {

      authorNickname = getDisplayNameByOriginalName(post.authorOriginalName);
      authorAvatar = defaultAvatar;
    }


    function renderOriginalPostContent(targetPost) {
      let innerContentHtml = '';
      const publicTextHtml = targetPost.publicText ? `<div class="post-content">${parseMarkdown(targetPost.publicText).replace(/\n/g, '<br>')}</div>` : '';

      if (targetPost.type === 'shuoshuo') {
        innerContentHtml = `<div class="post-content" style="margin-bottom: 10px;">${parseMarkdown(targetPost.content).replace(/\n/g, '<br>')}</div>`;
      } else if (targetPost.type === 'image_post' && targetPost.imageUrl) {

        innerContentHtml = publicTextHtml ? `${publicTextHtml}<div style="margin-top:10px;"><img src="${targetPost.imageUrl}" class="chat-image"></div>` : `<img src="${targetPost.imageUrl}" class="chat-image">`;
      } else if (targetPost.type === 'text_image') {

        const postImageUrl = state.globalSettings.enableAiDrawing && targetPost.image_prompt ? getPollinationsImageUrl(targetPost.image_prompt) : 'https://i.postimg.cc/KYr2qRCK/1.jpg';
        innerContentHtml = publicTextHtml ? `${publicTextHtml}<div style="margin-top:10px;"><img src="${postImageUrl}" class="chat-image" style="cursor: pointer;" data-hidden-text="${targetPost.hiddenContent}"></div>` : `<img src="${postImageUrl}" class="chat-image" style="cursor: pointer;" data-hidden-text="${targetPost.hiddenContent}">`;
      } else if (targetPost.type === 'naiimag' || targetPost.type === 'googleimag') {

        const imageUrls = targetPost.imageUrls || (targetPost.imageUrl ? [targetPost.imageUrl] : []);

        if (imageUrls.length > 0) {
          const imageCount = imageUrls.length;
          let imagesHtml = '';

          // 使用统一的多图布局（包括单张图片）
          imagesHtml = `<div class="post-images-grid grid-${imageCount}">`;
          imageUrls.forEach((url, index) => {
            imagesHtml += `<img src="${url}" class="naiimag-image" alt="图片${index + 1}" loading="lazy" onerror="this.src='https://i.postimg.cc/KYr2qRCK/1.jpg'; this.alt='图片加载失败';">`;
          });
          imagesHtml += '</div>';

          innerContentHtml = publicTextHtml ? `${publicTextHtml}${imagesHtml}` : imagesHtml;
        }
      }
      // 兜底：未知类型但有 content 或 publicText 时，显示文字内容
      if (!innerContentHtml) {
        const fallbackText = targetPost.content || targetPost.publicText || '';
        if (fallbackText) {
          innerContentHtml = `<div class="post-content" style="margin-bottom: 10px;">${parseMarkdown(fallbackText).replace(/\n/g, '<br>')}</div>`;
        }
      }
      return innerContentHtml;
    }

    let mainContentHtml;

    if (post.type === 'repost') {
      const repostCommentHtml = post.repostComment ? `<div class="post-content">${post.repostComment.replace(/\n/g, '<br>')}</div>` : '';
      let originalAuthorAvatar = defaultAvatar;
      let originalAuthorNickname = '原作者';
      if (post.originalPost.authorId === 'user') {
        originalAuthorAvatar = state.qzoneSettings.avatar;
        originalAuthorNickname = state.qzoneSettings.nickname;
      } else {
        const originalAuthorChat = state.chats[post.originalPost.authorId];
        if (originalAuthorChat) {
          originalAuthorAvatar = originalAuthorChat.settings.aiAvatar || defaultAvatar;
        }
        originalAuthorNickname = getDisplayNameByOriginalName(post.originalPost.authorOriginalName);
      }
      mainContentHtml = `
                    ${repostCommentHtml}
                    <div class="reposted-content-wrapper">
                        <div class="post-header">
                            <img src="${originalAuthorAvatar}" class="post-avatar">
                            <div class="post-info">
                                <span class="post-nickname">@${originalAuthorNickname}</span>
                                <span class="post-timestamp">${formatPostTimestamp(post.originalPost.timestamp)}</span>
                            </div>
                        </div>
                        <div class="post-main-content">${renderOriginalPostContent(post.originalPost)}</div>
                    </div>
                `;
    } else {
      mainContentHtml = `<div class="post-main-content">${renderOriginalPostContent(post)}</div>`;
    }

    let likesHtml = '';
    if (post.likes && post.likes.length > 0) {
      const displayLikes = post.likes.map(name => getDisplayNameByOriginalName(name)).join('、');
      likesHtml = `<div class="post-likes-section"><svg class="like-icon" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg><span>${displayLikes} 觉得很赞</span></div>`;
    }


    let commentsHtml = '';
    if (post.comments && post.comments.length > 0) {
      commentsHtml = '<div class="post-comments-container">';
      post.comments.forEach((comment, index) => {

        if (typeof comment === 'object' && comment !== null && comment.commenterName) {
          const commenterOriginalName = comment.commenterName;

          const commenterDisplayName = getDisplayNameByOriginalName(commenterOriginalName);

          let innerCommentContent;
          if (STICKER_REGEX.test(comment.text)) {
            innerCommentContent = `<img src="${comment.text}" class="comment-sticker" alt="sticker">`;
          } else {
            innerCommentContent = parseMarkdown(comment.text);
          }

          let commentLineHtml = '';

          if (comment.replyTo) {
            const repliedToDisplayName = getDisplayNameByOriginalName(comment.replyTo);
            commentLineHtml = `<span class="commenter-name">${commenterDisplayName}</span> 回复 <span class="commenter-name">${repliedToDisplayName}</span>: ${innerCommentContent}`;
          } else {
            commentLineHtml = `<span class="commenter-name">${commenterDisplayName}</span>: ${innerCommentContent}`;
          }

          commentsHtml += `<div class="comment-item" data-post-id="${post.id}" data-commenter-original-name="${commenterOriginalName}" data-commenter-display-name="${commenterDisplayName}">
                                            <div class="comment-text">${commentLineHtml}</div>
                                            <span class="comment-delete-btn" data-comment-index="${index}">×</span>
                                         </div>`;

        } else {

          commentsHtml += `<div class="legacy-comment-item">
                                            <span class="comment-text">${String(comment)}</span>
                                         </div>`;
        }
      });
      commentsHtml += '</div>';
    }


    const userOriginalName = state.qzoneSettings.nickname;
    const isLikedByUser = post.likes && post.likes.includes(userOriginalName);
    const isFavoritedByUser = state.favoritedPostIds && state.favoritedPostIds.has(post.id);

    let repostIconHtml = '';
    if (post.type !== 'repost') {
      repostIconHtml = `
                    <span class="action-icon repost">
                        <svg viewBox="0 0 24 24"><path d="M17 2.1l4 4-4 4 M3 11.5v-3a4 4 0 0 1 4-4h13 M7 21.9l-4-4 4-4 M21 12.5v3a4 4 0 0 1-4 4H4"></path></svg>
                    </span>`;
    }

    postEl.innerHTML = `
                <div class="post-header">
                    <img src="${authorAvatar}" class="post-avatar" data-author-id="${post.authorId}">
                    <div class="post-info">
                        <span class="post-nickname">${authorNickname}</span>
                        <span class="post-timestamp">${formatPostTimestamp(post.timestamp)}</span>
                    </div>
                    <div class="post-actions-btn">…</div>
                </div>
                ${mainContentHtml}
                <div class="post-feedback-icons">
                    ${repostIconHtml}
                    <span class="action-icon like ${isLikedByUser ? 'active' : ''}"><svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg></span>
                    <span class="action-icon favorite ${isFavoritedByUser ? 'active' : ''}"><svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg></span>
                </div>
                ${likesHtml}
                ${commentsHtml}
                <div class="post-footer">
                    <div class="comment-section">
                        <img src="${commentAvatar}" class="comment-avatar">
                        <input type="text" class="comment-input" placeholder="友善的评论是交流的起点">
                        <button class="comment-sticker-btn">
        <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M8 14 Q 12 16 16 14"></path>
            <line x1="9" y1="9" x2="9.01" y2="9"></line>
            <line x1="15" y1="9" x2="15.01" y2="9"></line>
        </svg>
        </button>
                        <div class="at-mention-popup"></div>
                    </div>
                    <button class="comment-send-btn">发送</button>
                </div>
            `;

    if (!isUpdating) {
      const deleteAction = document.createElement('div');
      deleteAction.className = 'qzone-post-delete-action';
      deleteAction.innerHTML = '<span>删除</span>';
      postContainer.appendChild(postEl);
      postContainer.appendChild(deleteAction);
    }

    return postContainer;
  }


  async function updateSinglePostInDOM(postId) {
    const postData = await db.qzonePosts.get(postId);
    if (!postData) {

      const postContainer = document.querySelector(`.qzone-post-container[data-post-id="${postId}"]`);
      if (postContainer) {
        postContainer.remove();
      }
      return;
    }


    const cacheIndex = window.qzonePostsCache.findIndex(p => p.id === postId);
    if (cacheIndex > -1) {
      window.qzonePostsCache[cacheIndex] = postData;
    }


    const favorites = await db.favorites.where('type').equals('qzone_post').toArray();
    state.favoritedPostIds = new Set(favorites.map(fav => fav.content.id));


    await createOrUpdatePostElement(postData);
  }





  async function renderQzonePosts() {
    const postsListEl = document.getElementById('qzone-posts-list');
    if (!postsListEl) return;

    const [postsFromDb, favorites] = await Promise.all([
      db.qzonePosts.orderBy('timestamp').reverse().filter(post => !post.isDeleted).toArray(),
      db.favorites.where('type').equals('qzone_post').toArray()
    ]);
    window.qzonePostsCache = postsFromDb;
    state.favoritedPostIds = new Set(favorites.map(fav => fav.content.id));

    postsListEl.innerHTML = '';
    window.qzonePostsRenderCount = 0;

    if (window.qzonePostsCache.length === 0) {
      postsListEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 30px 0;">这里空空如也，快来发布第一条说说吧！</p>';
      return;
    }


    loadMoreQzonePosts();
  }




  async function loadMoreQzonePosts() {
    if (window.isLoadingMorePosts) return;
    window.isLoadingMorePosts = true;

    const postsListEl = document.getElementById('qzone-posts-list');
    if (!postsListEl) {
      window.isLoadingMorePosts = false;
      return;
    }

    showLoader(postsListEl, 'bottom');


    setTimeout(async () => {
      hideLoader(postsListEl);

      const nextSliceStart = window.qzonePostsRenderCount;
      const nextSliceEnd = window.qzonePostsRenderCount + QZONE_RENDER_WINDOW;
      const postsToAppend = window.qzonePostsCache.slice(nextSliceStart, nextSliceEnd);

      const fragment = document.createDocumentFragment();
      for (const post of postsToAppend) {
        const postElement = await createOrUpdatePostElement(post);
        fragment.appendChild(postElement);
      }
      postsListEl.appendChild(fragment);

      window.qzonePostsRenderCount += postsToAppend.length;

      window.isLoadingMorePosts = false;
    }, 500);
  }



  function openQzoneStickerPanel(postId, buttonElement) {
    const panel = qzoneStickerPanelState.panelEl;
    const grid = qzoneStickerPanelState.gridEl;


    grid.innerHTML = '';
    if (state.userStickers.length === 0) {
      grid.innerHTML = '<p style="text-align:center; color: var(--text-secondary); grid-column: 1 / -1; padding-top: 20px;">请先在聊天界面的<br>表情面板中添加表情包</p>';
    } else {
      state.userStickers.forEach(sticker => {
        const item = document.createElement('div');
        item.className = 'sticker-item';
        item.style.backgroundImage = `url(${sticker.url})`;
        item.title = sticker.name;
        grid.appendChild(item);
      });
    }




    const btnRect = buttonElement.getBoundingClientRect();
    const phoneScreenRect = document.getElementById('phone-screen').getBoundingClientRect();

    panel.style.display = 'flex';
    const panelRect = panel.getBoundingClientRect();
    const panelHeight = panelRect.height;
    const panelWidth = panelRect.width;


    panel.style.top = `${btnRect.top - panelHeight - 5 - phoneScreenRect.top}px`;


    const desiredLeftPosition = btnRect.left - phoneScreenRect.left;


    if (desiredLeftPosition + panelWidth > phoneScreenRect.width) {

      panel.style.left = 'auto';
      panel.style.right = '5px';
    } else {

      panel.style.left = `${desiredLeftPosition}px`;
      panel.style.right = 'auto';
    }




    qzoneStickerPanelState.isOpen = true;
    qzoneStickerPanelState.activePostId = postId;
  }



  function closeQzoneStickerPanel() {

    if (qzoneStickerPanelState.isOpen) {

      qzoneStickerPanelState.panelEl.style.display = 'none';


      qzoneStickerPanelState.isOpen = false;
      qzoneStickerPanelState.activePostId = null;
    }
  }







  async function sendQzoneStickerComment(postId, sticker) {
    if (!sticker || !sticker.url) return;

    const post = await db.qzonePosts.get(postId);
    if (!post) {
      console.error("sendQzoneStickerComment: 找不到帖子:", postId);
      return;
    }

    if (!post.comments) {
      post.comments = [];
    }

    const newComment = {
      commenterName: state.qzoneSettings.nickname,
      text: sticker.url,
      meaning: sticker.name,
      timestamp: Date.now()
    };

    post.comments.push(newComment);

    await db.qzonePosts.update(postId, {
      comments: post.comments
    });

    closeQzoneStickerPanel();
    await renderQzonePosts();

    const postSummary = (post.publicText || post.content || `[图片动态]`).substring(0, 30);


    for (const chatId in state.chats) {
      const chat = state.chats[chatId];
      if (!chat.isGroup) {
        const intelligentPrompt = `[系统提示：'${state.qzoneSettings.nickname}' 在你的动态(ID: ${postId}, 内容摘要: "${postSummary}")下发送了一个表情评论，意思是："${sticker.name}"。请你对此作出回应。]`;

        const historyMessage = {
          role: 'system',
          content: intelligentPrompt,
          timestamp: Date.now(),
          isHidden: true
        };
        chat.history.push(historyMessage);
        await db.chats.put(chat);
      }
    }

  }







  function openRepostModal(postId) {
    repostTargetId = postId;
    document.getElementById('repost-comment-input').value = '';
    document.getElementById('repost-modal').classList.add('visible');
  }


  function hideRepostModal() {
    document.getElementById('repost-modal').classList.remove('visible');
    repostTargetId = null;
  }


  async function handleConfirmRepost() {
    if (!repostTargetId) return;

    const comment = document.getElementById('repost-comment-input').value.trim();
    const originalPost = await db.qzonePosts.get(repostTargetId);

    if (!originalPost) {
      alert("错误：找不到要转发的原始动态。");
      hideRepostModal();
      return;
    }

    const newPost = {
      type: 'repost',
      timestamp: Date.now(),
      authorId: 'user',
      repostComment: comment,
      originalPost: originalPost,
      visibleGroupIds: null
    };

    await db.qzonePosts.add(newPost);
    hideRepostModal();
    await renderQzonePosts();
    alert('转发成功！');
  }





  function displayFilteredFavorites(items) {
    const listEl = document.getElementById('favorites-list');
    listEl.innerHTML = '';

    if (items.length === 0) {
      const searchTerm = document.getElementById('favorites-search-input').value;
      const message = searchTerm ? '未找到相关收藏' : '你的收藏夹是空的，<br>快去动态或聊天中收藏喜欢的内容吧！';
      listEl.innerHTML = `<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">${message}</p>`;
      return;
    }

    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'favorite-item-card';
      card.dataset.favid = item.id;

      let headerHtml = '',
        contentHtml = '',
        sourceText = '',
        footerHtml = '';

      if (item.type === 'qzone_post') {
        const post = item.content;
        sourceText = '来自动态';
        let authorAvatar = defaultAvatar,
          authorNickname = '未知用户';

        if (post.authorId === 'user') {
          authorAvatar = state.qzoneSettings.avatar;
          authorNickname = state.qzoneSettings.nickname;
        } else if (state.chats[post.authorId]) {
          authorAvatar = state.chats[post.authorId].settings.aiAvatar;
          authorNickname = state.chats[post.authorId].name;
        }

        headerHtml = `<img src="${authorAvatar}" class="avatar"><div class="info"><div class="name">${authorNickname}</div></div>`;

        const publicTextHtml = post.publicText ? `<div class="post-content">${post.publicText.replace(/\n/g, '<br>')}</div>` : '';
        if (post.type === 'shuoshuo') {
          contentHtml = `<div class="post-content">${post.content.replace(/\n/g, '<br>')}</div>`;
        } else if (post.type === 'image_post' && post.imageUrl) {
          const postImageUrl = state.globalSettings.enableAiDrawing && post.image_prompt ? getPollinationsImageUrl(post.image_prompt) : 'https://i.postimg.cc/KYr2qRCK/1.jpg';
          contentHtml = publicTextHtml ? `${publicTextHtml}<div style="margin-top:10px;"><img src="${postImageUrl}" class="chat-image"></div>` : `<img src="${postImageUrl}" class="chat-image">`;
        } else if (post.type === 'text_image') {
          const postImageUrl = state.globalSettings.enableAiDrawing && post.image_prompt ? getPollinationsImageUrl(post.image_prompt) : 'https://i.postimg.cc/KYr2qRCK/1.jpg';
          contentHtml = publicTextHtml ? `${publicTextHtml}<div style="margin-top:10px;"><img src="${postImageUrl}" class="chat-image" style="cursor: pointer;" data-hidden-text="${post.hiddenContent}"></div>` : `<img src="${postImageUrl}" class="chat-image" style="cursor: pointer;" data-hidden-text="${post.hiddenContent}">`;
        }




        let likesHtml = '';

        if (post.likes && post.likes.length > 0) {

          likesHtml = `
                            <div class="post-likes-section">
                                <svg class="like-icon" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                                <span>${post.likes.join('、')} 觉得很赞</span>
                            </div>`;
        }



        let commentsHtml = '';
        if (post.comments && post.comments.length > 0) {
          commentsHtml = '<div class="post-comments-container">';
          post.comments.forEach((comment, index) => {

            if (typeof comment === 'object' && comment !== null && comment.commenterName) {

              const commenterOriginalName = comment.commenterName;
              const commenterDisplayName = getDisplayNameByOriginalName(commenterOriginalName);

              let innerCommentContent;
              if (STICKER_REGEX.test(comment.text)) {
                innerCommentContent = `<img src="${comment.text}" class="comment-sticker" alt="sticker">`;
              } else {
                innerCommentContent = comment.text;
              }

              let commentLineHtml = '';
              if (comment.replyTo) {
                const repliedToDisplayName = getDisplayNameByOriginalName(comment.replyTo);
                commentLineHtml = `<span class="commenter-name">${commenterDisplayName}</span> 回复 <span class="commenter-name">${repliedToDisplayName}</span>: ${innerCommentContent}`;
              } else {
                commentLineHtml = `<span class="commenter-name">${commenterDisplayName}</span>: ${innerCommentContent}`;
              }

              commentsHtml += `<div class="comment-item" data-post-id="${post.id}" data-commenter-original-name="${commenterOriginalName}" data-commenter-display-name="${commenterDisplayName}">
                                        <div class="comment-text">${commentLineHtml}</div>
                                        <span class="comment-delete-btn" data-comment-index="${index}">×</span>
                                     </div>`;

            } else {


              commentsHtml += `<div class="legacy-comment-item">
                                        <span class="comment-text">${String(comment)}</span>
                                     </div>`;
            }
          });
          commentsHtml += '</div>';
        }



        footerHtml = `${likesHtml}${commentsHtml}`;



      } else if (item.type === 'chat_message') {
        const msg = item.content;
        const chat = state.chats[item.chatId];
        if (!chat) continue;

        sourceText = `来自与 ${chat.name} 的聊天`;
        const isUser = msg.role === 'user';
        let senderName, senderAvatar;

        if (isUser) {

          senderName = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
          senderAvatar = chat.settings.myAvatar || (chat.isGroup ? defaultMyGroupAvatar : defaultAvatar);
        } else {
          if (chat.isGroup) {


            const member = chat.members.find(m => m.originalName === msg.senderName);


            senderName = msg.senderName;

            senderAvatar = member ? member.avatar : defaultGroupMemberAvatar;
          } else {

            senderName = chat.name;
            senderAvatar = chat.settings.aiAvatar || defaultAvatar;
          }
        }


        headerHtml = `<img src="${senderAvatar}" class="avatar"><div class="info"><div class="name">${senderName}</div></div>`;

        if (typeof msg.content === 'string' && STICKER_REGEX.test(msg.content)) {
          contentHtml = `<img src="${msg.content}" class="sticker-image" style="max-width: 80px; max-height: 80px;">`;
        } else if (Array.isArray(msg.content) && msg.content[0]?.type === 'image_url') {
          contentHtml = `<img src="${msg.content[0].image_url.url}" class="chat-image">`;
        } else {
          contentHtml = String(msg.content || '').replace(/\n/g, '<br>');
        }
      } else if (item.type === 'char_diary') {
        const diary = item.content;
        sourceText = `来自 ${diary.characterName} 的日记`;

        const charChat = state.chats[diary.characterId];
        const authorAvatar = charChat ? charChat.settings.aiAvatar : defaultAvatar;

        headerHtml = `<img src="${authorAvatar}" class="avatar"><div class="info"><div class="name">${diary.characterName}</div></div>`;


        const fullDiaryContent = diary.content || '';

        const formattedContent = parseMarkdown(fullDiaryContent).replace(/\n/g, '<br>');


        contentHtml = `
                <span class="diary-title">${diary.title}</span>
                <div class="fav-card-content-full">${formattedContent}</div>
            `;
      } else if (item.type === 'char_browser_article') {
        const article = item.content;
        sourceText = `来自 ${article.characterName} 的浏览记录`;

        const charChat = state.chats[article.characterId];
        const authorAvatar = charChat ? charChat.settings.aiAvatar : defaultAvatar;

        headerHtml = `<img src="${authorAvatar}" class="avatar"><div class="info"><div class="name">${article.characterName}</div></div>`;


        contentHtml = `
            <span class="diary-title">${article.title}</span>
            <div class="memo-content-preview">${(article.content || '').replace(/\n/g, '<br>')}</div>
        `;
      } else if (item.type === 'char_memo') {
        const memo = item.content;
        sourceText = `来自 ${memo.characterName} 的备忘录`;

        const charChat = state.chats[memo.characterId];
        const authorAvatar = charChat ? charChat.settings.aiAvatar : defaultAvatar;

        headerHtml = `<img src="${authorAvatar}" class="avatar"><div class="info"><div class="name">${memo.characterName}</div></div>`;


        contentHtml = `
        <span class="memo-title">${memo.title}</span>
        <div class="memo-content-preview">${memo.content.replace(/\n/g, '<br>')}</div>
    `;
      }


      card.innerHTML = `
                    <div class="fav-card-header">${headerHtml}<div class="source">${sourceText}</div></div>
                    <div class="fav-card-content">${contentHtml}</div>
                    ${footerHtml}`;

      listEl.appendChild(card);
    }
  }




  async function renderFavoritesScreen() {

    allFavoriteItems = await db.favorites.orderBy('timestamp').reverse().toArray();


    const searchInput = document.getElementById('favorites-search-input');
    const clearBtn = document.getElementById('favorites-search-clear-btn');
    searchInput.value = '';
    clearBtn.style.display = 'none';


    displayFilteredFavorites(allFavoriteItems);
  }



  function resetCreatePostModal() {
    document.getElementById('post-public-text').value = '';
    document.getElementById('post-image-preview').src = '';
    document.getElementById('post-image-description').value = '';
    document.getElementById('post-image-preview-container').classList.remove('visible');
    document.getElementById('post-image-desc-group').style.display = 'none';
    document.getElementById('post-local-image-input').value = '';
    document.getElementById('post-hidden-text').value = '';
    document.getElementById('switch-to-image-mode').click();
  }

  // ========== 来源：script.js 第 26917~26930 行 ==========

  function clearQzoneReplyContext(postContainer) {
    currentQzoneReplyContext = null;
    if (postContainer) {

      const input = postContainer.querySelector('.comment-input');
      if (input) {
        input.placeholder = '友善的评论是交流的起点';
      }
    }
  }

  // ========== 来源：script.js 第 28677~28720 行 ==========

  function filterVisiblePostsForAI(allPosts, viewerChat) {
    if (!viewerChat || !viewerChat.id) return [];

    const viewerGroupId = viewerChat.groupId;
    const viewerId = viewerChat.id;

    return allPosts.filter(post => {

      if (post.authorId === 'user') {
        if (post.visibleGroupIds && post.visibleGroupIds.length > 0) {
          return viewerGroupId && post.visibleGroupIds.includes(viewerGroupId);
        }
        return true;
      }




      if (String(post.authorId).startsWith('npc_')) {

        if (Array.isArray(post.visibleTo)) {
          return post.visibleTo.includes(viewerId);
        }

        return false;
      }




      const authorChat = state.chats[post.authorId];
      if (!authorChat) {
        return false;
      }
      const authorGroupId = authorChat.groupId;

      const inSameGroup = authorGroupId && viewerGroupId && authorGroupId === viewerGroupId;
      const bothUnGrouped = !authorGroupId && !viewerGroupId;

      return inSameGroup || bothUnGrouped;
    });
  }

  // ========== 全局暴露（供 script.js 中其他模块调用） ==========

  window.renderQzoneScreen = renderQzoneScreen;
  window.saveQzoneSettings = saveQzoneSettings;
  window.formatPostTimestamp = formatPostTimestamp;
  window.createOrUpdatePostElement = createOrUpdatePostElement;
  window.updateSinglePostInDOM = updateSinglePostInDOM;
  window.renderQzonePosts = renderQzonePosts;
  window.loadMoreQzonePosts = loadMoreQzonePosts;
  window.openQzoneStickerPanel = openQzoneStickerPanel;
  window.closeQzoneStickerPanel = closeQzoneStickerPanel;
  window.sendQzoneStickerComment = sendQzoneStickerComment;
  window.openRepostModal = openRepostModal;
  window.hideRepostModal = hideRepostModal;
  window.handleConfirmRepost = handleConfirmRepost;
  window.displayFilteredFavorites = displayFilteredFavorites;
  window.renderFavoritesScreen = renderFavoritesScreen;
  window.resetCreatePostModal = resetCreatePostModal;
  window.clearQzoneReplyContext = clearQzoneReplyContext;
  window.filterVisiblePostsForAI = filterVisiblePostsForAI;
  window.openClearPostsSelectorModal = openClearPostsSelectorModal;
  window.handleConfirmClearPosts = handleConfirmClearPosts;

  // ========== 清空动态选择器 ==========

  async function openClearPostsSelectorModal() {
    const modal = document.getElementById('clear-posts-modal');
    const listEl = document.getElementById('clear-posts-list');
    listEl.innerHTML = '';

    const options = [];

    options.push({
      text: '清空所有动态 (危险)',
      value: 'all',
      isDanger: true
    });

    const myNickname = state.qzoneSettings.nickname || '我';
    options.push({
      text: `仅清空 ${myNickname} 的动态 (用户)`,
      value: 'user'
    });

    Object.values(state.chats).forEach(chat => {
      if (!chat.isGroup) {
        options.push({
          text: `仅清空 ${chat.name} 的动态 (角色)`,
          value: chat.id
        });
      }
    });

    try {
      const npcs = await db.npcs.toArray();
      if (npcs.length > 0) {
        options.push({
          isSeparator: true,
          text: 'NPC 列表'
        });
        npcs.forEach(npc => {
          options.push({
            text: `仅清空 ${npc.name} 的动态 (NPC)`,
            value: `npc_${npc.id}`
          });
        });
      }
    } catch (e) {
      console.error("加载NPC列表失败:", e);
    }

    options.forEach(opt => {
      if (opt.isSeparator) {
        const separator = document.createElement('div');
        separator.textContent = opt.text;
        separator.style.cssText = `
                padding: 10px 18px 5px;
                font-size: 13px;
                font-weight: 500;
                color: var(--text-secondary);
                background-color: #f0f2f5;
                border-top: 1px solid var(--border-color);
                border-bottom: 1px solid var(--border-color);
                margin-top: 5px;
            `;
        listEl.appendChild(separator);
        return;
      }

      const item = document.createElement('div');
      item.className = 'clear-posts-item';
      if (opt.isDanger) {
        item.classList.add('danger-option');
      }
      item.dataset.targetId = opt.value;
      item.innerHTML = `
            <div class="checkbox"></div>
            <span class="name">${opt.text}</span>
        `;
      listEl.appendChild(item);
    });

    modal.classList.add('visible');
  }

  async function handleConfirmClearPosts() {
    const selectedItems = document.querySelectorAll('#clear-posts-list .clear-posts-item.selected');
    if (selectedItems.length === 0) {
      alert("请至少选择一个要清空的范围。");
      return;
    }

    const targetIds = Array.from(selectedItems).map(item => item.dataset.targetId);

    let targetNames = [];
    if (targetIds.includes('all')) {
      targetNames.push('所有动态');
    } else {
      if (targetIds.includes('user')) {
        targetNames.push(`"${state.qzoneSettings.nickname}"`);
      }
      targetIds.forEach(id => {
        const character = state.chats[id];
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
    });

    if (!confirmed) return;

    try {
      if (targetIds.includes('all')) {
        await db.qzonePosts.clear();
      } else {
        await db.qzonePosts.where('authorId').anyOf(targetIds).delete();
      }

      window.qzonePostsCache = await db.qzonePosts.orderBy('timestamp').reverse().toArray();
      window.qzonePostsRenderCount = 0;
      await renderQzonePosts();

      document.getElementById('clear-posts-modal').classList.remove('visible');
      await showCustomAlert('操作成功', '选定范围内的动态已被清空。');

    } catch (error) {
      console.error("清空动态时出错:", error);
      await showCustomAlert('操作失败', `清空动态时发生错误: ${error.message}`);
    }
  }

})();
