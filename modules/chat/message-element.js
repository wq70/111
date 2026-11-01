  async function createMessageElement(msg, chat) {

    // 【主屏幕QQ undefined过滤】如果是AI消息且内容为空或undefined，直接返回null不显示
    if (msg.role === 'assistant' && msg.type !== 'recalled_message' && msg.type !== 'post_deleted_notice' &&
      msg.type !== 'narration' && msg.type !== 'pat_message' && !msg.type?.startsWith('waimai_') &&
      msg.type !== 'red_packet' && msg.type !== 'transfer' && msg.type !== 'poll' && msg.type !== 'gift' &&
      msg.type !== 'kinship_request' && msg.type !== 'synth_music' && msg.type !== 'naiimag' && msg.type !== 'realimag' && msg.type !== 'googleimag' && msg.type !== 'openaiimag' &&
      msg.type !== 'ai_image' && msg.type !== 'user_photo' && msg.type !== 'couple_invite' && msg.type !== 'couple_invite_response' &&
      msg.type !== 'thought_chain_block' && msg.type !== 'mcp_activity') {
      const displayContent = msg.type === 'offline_text'
        ? (msg.content || `${msg.dialogue || ''} ${msg.description || ''}`)
        : msg.content;
      const contentStr = String(displayContent || '').trim().toLowerCase();
      if (contentStr === '' || contentStr === 'undefined') {
        console.log('[QQ Undefined过滤] 已过滤空消息或undefined消息:', msg);
        return null;
      }
    }

    if (msg.type === 'recalled_message') {
      const wrapper = document.createElement('div');
      wrapper.className = 'message-wrapper system-pat';
      wrapper.dataset.timestamp = msg.timestamp;
      const bubble = document.createElement('div');
      bubble.className = 'message-bubble recalled-message-placeholder';
      bubble.dataset.timestamp = msg.timestamp;
      bubble.textContent = msg.content;
      wrapper.appendChild(bubble);
      addLongPressListener(wrapper, () => showMessageActions(msg.timestamp));
      wrapper.addEventListener('click', () => {
        if (isSelectionMode) {
          toggleMessageSelection(msg.timestamp);
        }
      });
      return wrapper;
    } else if (msg.type === 'post_deleted_notice') {
      const wrapper = document.createElement('div');
      wrapper.className = 'message-wrapper system-pat';
      wrapper.dataset.timestamp = msg.timestamp;
      const bubble = document.createElement('div');
      bubble.className = 'message-bubble post-deleted-placeholder';
      bubble.dataset.postId = msg.postId;
      bubble.textContent = msg.content;
      wrapper.appendChild(bubble);
      addLongPressListener(wrapper, () => showMessageActions(msg.timestamp));
      wrapper.addEventListener('click', () => {
        if (isSelectionMode) {
          toggleMessageSelection(msg.timestamp);
        }
      });
      return wrapper;
    }

    if (msg.isHidden && msg.type !== 'mcp_activity' && !chat.settings.showHiddenMessages) {
      return null;
    }
    if (msg.type === 'narration') {
      const wrapper = document.createElement('div');
      wrapper.className = 'message-wrapper system-pat'; // 复用系统消息样式(居中灰色)
      wrapper.dataset.timestamp = msg.timestamp; // 关键：必须有时间戳才能编辑/删除

      const bubble = document.createElement('div');
      bubble.className = 'message-bubble system-bubble';
      // 可以加个图标让它和普通拍一拍区分开，也可以不加
      bubble.innerHTML = `<span style="font-style:italic; opacity: 0.9;">${msg.content}</span>`;
      bubble.dataset.timestamp = msg.timestamp;

      wrapper.appendChild(bubble);

      // 【关键】添加长按监听，实现删除/编辑功能
      addLongPressListener(wrapper, () => showMessageActions(msg.timestamp));

      // 支持多选
      wrapper.addEventListener('click', () => {
        if (isSelectionMode) toggleMessageSelection(msg.timestamp);
      });

      return wrapper;
    }
    if (msg.type === 'pat_message') {
      const wrapper = document.createElement('div');
      wrapper.className = 'message-wrapper system-pat';
      const bubble = document.createElement('div');
      bubble.className = 'message-bubble system-bubble';
      bubble.dataset.timestamp = msg.timestamp;
      bubble.textContent = msg.content;
      wrapper.appendChild(bubble);
      addLongPressListener(wrapper, () => showMessageActions(msg.timestamp));
      wrapper.addEventListener('click', () => {
        if (isSelectionMode) toggleMessageSelection(msg.timestamp);
      });
      return wrapper;
    }


    const isUser = msg.role === 'user';
    const myNickname = chat.settings.myNickname || '我';
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${isUser ? 'user' : 'ai'}`;
    if (msg.actorType === 'pet') wrapper.classList.add('pet-message');
    if (msg.isHidden) {
      wrapper.classList.add('hidden-revealed');
    }
    if (msg.isExcluded) {
      wrapper.classList.add('msg-excluded');
    }
    if ((chat.isGroup && !isUser) || (!isUser && msg.actorType === 'pet')) {
      const member = chat.isGroup
        ? (chat.members.find(m => m.originalName === msg.senderName)
          || chat.members.find(m => m.groupNickname === msg.senderName))
        : null;
      const senderNameDiv = document.createElement('div');
      senderNameDiv.className = 'sender-name';
      senderNameDiv.textContent = msg.actorType === 'pet'
        ? (msg.senderName || chat.sharedPet?.name || '小精灵')
        : (member ? member.groupNickname : (msg.senderName || '未知成员'));
      wrapper.appendChild(senderNameDiv);
    }

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isUser ? 'user' : 'ai'}`;
    bubble.dataset.timestamp = msg.timestamp;

    const timestampEl = document.createElement('span');
    timestampEl.className = 'timestamp';
    timestampEl.textContent = formatTimestamp(msg.timestamp, chat.id);

    let avatarSrc, avatarFrameSrc = '';
    if (isUser) {
      avatarSrc = chat.settings.myAvatar || (chat.isGroup ? defaultMyGroupAvatar : defaultAvatar);
      avatarFrameSrc = chat.settings.myAvatarFrame || '';
    } else {
      if (msg.actorType === 'pet') {
        avatarSrc = msg.avatarSnapshot || chat.sharedPet?.avatar || defaultAvatar;
        avatarFrameSrc = '';
      } else if (chat.isGroup) {
        const member = chat.members.find(m => m.originalName === msg.senderName)
                    || chat.members.find(m => m.groupNickname === msg.senderName);
        if (member) {
          const characterProfile = state.chats[member.id];
          avatarSrc = member.avatar || (characterProfile ? characterProfile.settings.aiAvatar : defaultGroupMemberAvatar);
          avatarFrameSrc = member.avatarFrame || (characterProfile ? characterProfile.settings.aiAvatarFrame : '');
        } else {
          avatarSrc = defaultGroupMemberAvatar;
          avatarFrameSrc = '';
        }
      } else {
        avatarSrc = chat.settings.aiAvatar || defaultAvatar;
        avatarFrameSrc = chat.settings.aiAvatarFrame || '';
      }
    }

    let avatarHtml;
    if (avatarFrameSrc) {
      avatarHtml = `<div class="avatar-with-frame"><img src="${avatarSrc}" class="avatar-img"><img src="${avatarFrameSrc}" class="avatar-frame"></div>`;
    } else {
      avatarHtml = `<img src="${avatarSrc}" class="avatar">`;
    }
    const hasFrameClass = avatarFrameSrc ? 'has-frame' : '';
    const avatarGroupHtml = `<div class="avatar-group ${hasFrameClass}">${avatarHtml}</div>`;

    let contentHtml;
    let quoteHtml = '';
    if (msg.quote) {
      const quotedSenderDisplayName = getDisplayNameInGroup(chat, msg.quote.senderName);
      const fullQuotedContent = String(msg.quote.content || '');
      quoteHtml = `
                    <div class="quoted-message" data-original-timestamp="${msg.quote.timestamp}" style="cursor: pointer;">
                        <div class="quoted-sender">回复 ${quotedSenderDisplayName}:</div>
                        <div class="quoted-content">${fullQuotedContent}</div>
                    </div>
                `;
    }






    let rawContent = msg.content;

    if (msg.type === 'mcp_activity' && window.mcpManager && typeof window.mcpManager.renderMessageCard === 'function') {
      bubble.classList.add('is-card-like', 'is-mcp-activity');
      contentHtml = window.mcpManager.renderMessageCard(msg);
    } else if (typeof rawContent === 'string' && rawContent.trim().startsWith('<') && rawContent.trim().endsWith('>')) {
      contentHtml = rawContent;
      bubble.classList.add('is-raw-html');
    } else if (msg.type === 'offline_text' || msg.type === 'share_link' || msg.type === 'share_card' || msg.type === 'location_share' || msg.type === 'ai_image' || msg.type === 'user_photo' || msg.type === 'voice_message' || msg.type === 'transfer' || msg.type === 'waimai_request' || msg.type === 'waimai_order' || msg.type === 'red_packet' || msg.type === 'poll' || msg.type === 'gift' || msg.type === 'realimag' || msg.type === 'naiimag' || msg.type === 'googleimag' || msg.type === 'openaiimag' || msg.type === 'kinship_request' || msg.type === 'forwarded_email' || msg.type === 'reddit_share' || msg.type === 'playlist_share' || msg.type === 'couple_invite' || msg.type === 'couple_invite_response') {

      if (msg.type === 'offline_text') {

        const originalText = msg.content || `${msg.dialogue || ''} ${msg.description || ''}`.trim();
        const renderedOfflineText = await applyRenderingRulesDetailed(originalText, chat.id, { messageId: msg.id ?? msg.timestamp, timestamp: msg.timestamp, role: msg.role, type: msg.type, field: 'content', isGroup: !!chat.isGroup });
        const combinedText = renderedOfflineText.content;
        if (renderedOfflineText.excluded) wrapper.hidden = true;

        const useContinuousLayout = chat && chat.settings && chat.settings.offlineContinuousLayout;

        if (renderedOfflineText.isHtml && !renderedOfflineText.inlineOnly && combinedText !== originalText) {
          contentHtml = combinedText;
          if (!renderedOfflineText.inlineOnly) bubble.classList.add('is-card-like');
        } else if (useContinuousLayout) {
          // 连续排版模式：整体渲染，对话部分只加样式不拆段
          const dialogueRegex = /(「.*?」|".*?")/gs;
          let lastIndex = 0;
          let htmlParts = [];
          let match;
          while ((match = dialogueRegex.exec(combinedText)) !== null) {
            // 对话前的描写部分
            if (match.index > lastIndex) {
              const desc = combinedText.slice(lastIndex, match.index);
              if (desc.trim()) {
                htmlParts.push(parseMarkdown(desc).replace(/\n/g, '<br>'));
              }
            }
            // 对话部分
            htmlParts.push('<span class="offline-dialogue">' + parseMarkdown(match[0]) + '</span>');
            lastIndex = dialogueRegex.lastIndex;
          }
          // 剩余的描写部分
          if (lastIndex < combinedText.length) {
            const remaining = combinedText.slice(lastIndex);
            if (remaining.trim()) {
              htmlParts.push(parseMarkdown(remaining).replace(/\n/g, '<br>'));
            }
          }
          contentHtml = '<div class="offline-continuous">' + htmlParts.join('') + '</div>';
        } else {
          // 原有逻辑：对话和描写分块显示
          const regex = /(「.*?」|".*?")/g;
          const parts = combinedText.split(regex).filter(part => part);

          contentHtml = parts.map(part => {
            if (part.startsWith('「') || part.startsWith('"')) {
              return '<span class="offline-dialogue">' + parseMarkdown(part) + '</span>';
            } else {
              return '<span class="offline-description">' + parseMarkdown(part.trim()).replace(/\n/g, '<br>') + '</span>';
            }
          }).join('');
        }
      } else if (msg.type === 'share_link') {
        bubble.classList.add('is-link-share', 'is-card-like');
        contentHtml = `<div class="link-share-card" data-timestamp="${msg.timestamp}"><div class="title">${msg.title || '无标题'}</div><div class="description">${msg.description || '点击查看详情...'}</div><div class="footer"><svg class="footer-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg><span>${msg.source_name || '链接分享'}</span></div></div>`;
      } else if (msg.type === 'forwarded_email') {
        bubble.classList.add('is-card-like'); // 去除气泡默认背景
        const data = msg.emailData || {};

        // 将完整数据存入 dataset，以便点击时读取
        const fullDataJson = encodeURIComponent(JSON.stringify(data));

        contentHtml = `
            <div class="email-share-card" data-email-json="${fullDataJson}">
                <div class="email-card-top">
                    <div class="email-icon-box">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                    </div>
                    <div class="email-card-header-text">
                        <div class="email-card-subject">${escapeHTML(data.subject)}</div>
                        <div class="email-card-sender">${escapeHTML(data.sender)}</div>
                    </div>
                </div>
                <div class="email-card-preview">${escapeHTML(data.preview)}...</div>
                <div class="email-card-footer">
                    <span>Mail 邮件快照</span>
                    <span>查看详情 ›</span>
                </div>
            </div>
        `;
      } else if (msg.type === 'reddit_share') {
        bubble.classList.add('is-card-like', 'is-reddit-card'); // 确保添加这些类名
        const data = msg.redditData;

        // 处理分数的显示 (12.5k)
        const scoreDisplay = data.score > 1000 ? (data.score / 1000).toFixed(1) + 'k' : data.score;

        contentHtml = `
    <div class="reddit-share-card">
        <div class="reddit-card-header">
                    <img src="https://www.redditinc.com/assets/images/site/reddit-logo.png" class="reddit-card-logo">
                    <span class="reddit-card-sub">${data.subreddit}</span>
                    <span class="reddit-card-user">• u/${data.author}</span>
                </div>
                <div class="reddit-card-body">
                    <div class="reddit-card-title">${escapeHTML(data.title)}</div>
                    ${data.image ? `<img src="${data.image}" class="reddit-card-img" loading="lazy">` : ''}
                    ${data.selftext ? `<div style="font-size:12px;color:#555;max-height:60px;overflow:hidden;">${escapeHTML(data.selftext)}</div>` : ''}
                </div>
                <div class="reddit-card-footer">
                    <span>⬆ ${scoreDisplay} 赞</span>
                    <span>💬 ${data.num_comments} 评论</span>
                </div>
            </div>
        `;
      } else if (msg.type === 'share_card') {
        bubble.classList.add('is-link-share', 'is-card-like');
        contentHtml = `<div class="link-share-card" style="cursor: pointer;" data-timestamp="${msg.timestamp}"><div class="title">${msg.payload.title}</div><div class="description">共 ${msg.payload.sharedHistory.length} 条消息</div><div class="footer"><svg class="footer-icon" ...>...</svg><span>聊天记录</span></div></div>`;
      } else if (msg.type === 'location_share') {
        bubble.classList.add('is-location-share', 'is-card-like');
        let finalImageUrl;


        if (msg.imageUrl) {
          finalImageUrl = msg.imageUrl;
        } else if (state.globalSettings.enableAiDrawing && msg.image_prompt) {
          finalImageUrl = getPollinationsImageUrl(msg.image_prompt);
        } else {
          finalImageUrl = 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1756262526935_qdqqd_4uque3.jpeg';
        }

        const mapAreaStyle = `style="background-image: url('${finalImageUrl}');"`;
        contentHtml = `<div class="location-share-card"><div class="card-text-area"><div class="card-text-primary">${msg.content}</div><div class="card-text-secondary">位置分享</div></div><div class="card-map-area" ${mapAreaStyle}><div class="card-pin-icon"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 11.5C11.1716 11.5 10.5 10.8284 10.5 10C10.5 9.17157 11.1716 8.5 12 8.5C12.8284 8.5 13.5 9.17157 13.5 10C13.5 10.8284 12.8284 11.5 12 11.5Z"></path><path d="M12 2C7.92134 2 4.5 5.42134 4.5 9.5C4.5 14.5312 11.2188 21.4375 11.5938 21.8125C11.7954 22.014 12.2046 22.014 12.4062 21.8125C12.7812 21.4375 19.5 14.5312 19.5 9.5C19.5 5.42134 16.0787 2 12 2ZM12 12.5C10.6193 12.5 9.5 11.3807 9.5 10C9.5 8.61929 10.6193 7.5 12 7.5C13.3807 7.5 14.5 8.61929 14.5 10C14.5 11.3807 13.3807 12.5 12 12.5Z"></path></svg></div></div></div>`;
      } else if (msg.type === 'user_photo' || msg.type === 'ai_image') {
        bubble.classList.add('is-ai-image', 'is-card-like');
        const altText = msg.type === 'user_photo' ? "用户描述的照片" : "AI生成的图片";


        const imageUrl = state.globalSettings.enableAiDrawing && msg.image_prompt ?
          getPollinationsImageUrl(msg.image_prompt) :
          'https://i.postimg.cc/KYr2qRCK/1.jpg';


        contentHtml = `<img src="${imageUrl}" class="ai-generated-image" alt="${altText}" data-description="${msg.content}">`;
      } else if (msg.type === 'naiimag') {

        bubble.classList.add('is-realimag', 'is-card-like');
        contentHtml = `
                        <div class="nai-image-wrapper">
                            <img src="${escapeHTML(msg.imageUrl || '')}" class="realimag-image" alt="NovelAI图片分享" loading="lazy" onerror="this.src='https://i.postimg.cc/KYr2qRCK/1.jpg'; this.alt='图片加载失败';" title="${escapeHTML(msg.fullPrompt || msg.prompt || 'NovelAI生成')}">
                            
                            <div class="bubble-image-controls"> 
                                <button class="nai-save-local-btn" title="下载图片">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                                <button class="nai-upload-imgbb-btn" title="上传图床" style="display: none;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
                                        <polyline points="17 8 12 3 7 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
                                        <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></line>
                                    </svg>
                                </button>
                                <button class="nai-regenerate-btn" title="重新生成">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
                                        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
                                    </svg>
                                </button>
                                
                                
                            </div>
                        </div>
                    `;
      } else if (msg.type === 'googleimag') {
        bubble.classList.add('is-realimag', 'is-card-like');
        contentHtml = `
                        <div class="nai-image-wrapper">
                            <img src="${escapeHTML(msg.imageUrl || '')}" class="realimag-image" alt="Google Imagen图片分享" loading="lazy" onerror="this.src='https://i.postimg.cc/KYr2qRCK/1.jpg'; this.alt='图片加载失败';" title="${escapeHTML(msg.fullPrompt || msg.prompt || 'Google Imagen生成')}">
                            
                            <div class="bubble-image-controls"> 
                                <button class="nai-save-local-btn" title="下载图片">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                                <button class="nai-upload-imgbb-btn" title="上传图床" style="display: none;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
                                        <polyline points="17 8 12 3 7 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
                                        <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></line>
                                    </svg>
                                </button>
                                <button class="nai-regenerate-btn" title="重新生成">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
                                        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `;
      } else if (msg.type === 'openaiimag') {
        bubble.classList.add('is-realimag', 'is-card-like');
        contentHtml = `
                        <div class="nai-image-wrapper">
                            <img src="${escapeHTML(msg.imageUrl || '')}" class="realimag-image" alt="GPT 图片分享" loading="lazy" onerror="this.src='https://i.postimg.cc/KYr2qRCK/1.jpg'; this.alt='图片加载失败';" title="${escapeHTML(msg.fullPrompt || msg.prompt || 'GPT 图片生成')}">
                            <div class="bubble-image-controls">
                                <button class="nai-save-local-btn" title="下载图片">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="7 10 12 15 17 10"></polyline>
                                        <line x1="12" y1="15" x2="12" y2="3"></line>
                                    </svg>
                                </button>
                                <button class="nai-upload-imgbb-btn" title="上传图床" style="display:none;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
                                        <polyline points="17 8 12 3 7 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
                                        <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></line>
                                    </svg>
                                </button>
                                <button class="nai-regenerate-btn" title="重新生成">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
                                        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `;
      } else if (msg.type === 'voice_message') {
        bubble.classList.add('is-voice-message', 'is-card-like');

        // 【双语模式语音处理】如果启用了双语模式且是AI消息
        let voiceContent = msg.content;
        let voicePlayContent = voiceContent;  // 用于播放的内容
        
        if (!isUser && chat.settings.enableBilingualMode) {
          // 预处理：清理和规范化
          voiceContent = voiceContent
            .replace(/[\u200B-\u200D\uFEFF]/g, '')  // 清理零宽字符
            .replace(/【/g, '〖').replace(/】/g, '〗');  // 统一符号
          
          // 默认保持旧行为；用户也可以选择朗读译文或依次朗读两者。
          voicePlayContent = window.languagePolicy
            ? window.languagePolicy.getTtsText(voiceContent, chat)
            : voiceContent.replace(/[〖【][^〗】]*[〗】]/g, '');
        }

        // 优先使用真实音频时长，否则根据文字内容估算
        let duration;
        if (msg.audioDuration) {
          duration = msg.audioDuration;
        } else {
          duration = Math.max(1, Math.round((voicePlayContent || '').length / 5));
        }
        const durationFormatted = `0:${String(duration).padStart(2, '0')}''`;
        const waveformHTML = '<div></div><div></div><div></div><div></div><div></div>';

        if (isUser) {
          // 用户的语音消息
          const audioDataAttr = msg.audioData ? `data-audio="${encodeURIComponent(msg.audioData)}"` : '';
          const audioMimeAttr = msg.audioMimeType ? `data-audio-mime="${msg.audioMimeType}"` : '';

          contentHtml = `
            <div class="voice-message-body" data-text="${encodeURIComponent(msg.content)}" ${audioDataAttr} ${audioMimeAttr}>
                <div class="voice-waveform">${waveformHTML}</div>
                <span class="voice-duration">${durationFormatted}</span>
            </div>
            <div class="voice-transcript"></div>
        `;
        } else {
          // AI的语音消息（通常使用TTS）
          const canPlayTTS = !chat.isGroup && chat.settings.enableTts !== false;
          const voiceId = window.ttsProvider.provider(chat) !== 'minimax'
            ? window.ttsProvider.voiceId(chat) : chat.settings.minimaxVoiceId || 'female-shaonv-jingpin';
          const voiceIdAttribute = canPlayTTS ? `data-tts-provider="${window.ttsProvider.provider(chat)}" data-voice-id="${String(voiceId).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char])}"` : '';
          
          // 【双语模式】保存原始内容和播放内容
          const originalContentAttr = chat.settings.enableBilingualMode ? 
            `data-original-content="${encodeURIComponent(voiceContent)}" data-showing-translation="false"` : '';

          contentHtml = `
            <div class="voice-message-body" 
                 data-text="${encodeURIComponent(voicePlayContent)}" 
                 ${voiceIdAttribute}
                 ${originalContentAttr}>
                <div class="voice-waveform">${waveformHTML}</div>
                <div class="loading-spinner"></div>
                <span class="voice-duration">${durationFormatted}</span>
            </div>
            <div class="voice-transcript"></div>
        `;
        }
      } else if (msg.type === 'transfer') {
        bubble.classList.add('is-transfer', 'is-card-like');
        let titleText, noteText;
        const myNickname = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
        const senderDisplayName = getDisplayNameInGroup(chat, msg.senderName);
        const receiverDisplayName = getDisplayNameInGroup(chat, msg.receiverName || chat.name);
        if (isUser) {
          if (msg.isRefund) {
            titleText = `退款给 ${receiverDisplayName}`;
            noteText = '已拒收对方转账';
          } else if (msg.isReceived) {
            titleText = `已收款`;
            noteText = '已存入余额';
          } else {
            titleText = `转账给 ${receiverDisplayName}`;
            if (msg.status === 'accepted') noteText = '对方已收款';
            else if (msg.status === 'declined') noteText = '对方已拒收';
            else noteText = msg.note || '等待对方处理...';
          }
        } else {
          if (msg.isReceived) {
            titleText = `已收款`;
            noteText = '已存入金库'; // 或者 '已存入余额'
          }
          // ★★★ 新增结束 ★★★
          else if (msg.isRefund) {
            titleText = `退款来自 ${senderDisplayName}`;
            noteText = '转账已被拒收';
          } else if (msg.receiverName === myNickname) {
            titleText = `转账给 ${myNickname}`;
            if (msg.status === 'accepted') noteText = '你已收款';
            else if (msg.status === 'declined') noteText = '你已拒收';
            else {
              bubble.style.cursor = 'pointer';
              bubble.dataset.status = 'pending';
              noteText = msg.note || '点击处理';
            }
          } else {
            titleText = `转账: ${senderDisplayName} → ${receiverDisplayName}`;
            noteText = msg.note || '群聊内转账';
          }
        }
        const heartIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: middle;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`;

        // 根据发送方决定货币显示
        let currencySymbol = '¥'; // 默认人民币
        if (!isUser) {
          // 角色发送的转账，显示角色的货币
          const currency = getCurrencyForChat(chat);
          currencySymbol = currency.symbol;
        }
        // 用户发送的转账始终显示人民币

        contentHtml = `<div class="transfer-card"><div class="transfer-title">${heartIcon} ${titleText}</div><div class="transfer-amount">${currencySymbol} ${Number(msg.amount).toFixed(2)}</div><div class="transfer-note">${noteText}</div></div>`;
      } else if (msg.type === 'waimai_request') {
        bubble.classList.add('is-waimai-request', 'is-card-like');
        if (msg.status === 'paid' || msg.status === 'rejected') bubble.classList.add(`status-${msg.status}`);
        const senderDisplayName = getDisplayNameInGroup(chat, msg.senderName);
        const requestTitle = `来自 ${senderDisplayName} 的代付请求`;
        let actionButtonsHtml = '';
        if (msg.status === 'pending' && !isUser) {
          actionButtonsHtml = `<div class="waimai-user-actions"><button class="waimai-decline-btn" data-choice="rejected">残忍拒绝</button><button class="waimai-pay-btn" data-choice="paid">为Ta买单</button></div>`;
        }
        contentHtml = `<div class="waimai-card"><div class="waimai-header"><img src="https://files.catbox.moe/mq179k.png" class="icon" alt="Meituan Icon"><div class="title-group"><span class="brand">美团外卖</span><span class="separator">|</span><span>外卖美食</span></div></div><div class="waimai-catchphrase">Hi，你和我的距离只差一顿外卖～</div><div class="waimai-main"><div class="request-title">${requestTitle}</div><div class="payment-box"><div class="payment-label">需付款</div><div class="amount">¥${Number(msg.amount).toFixed(2)}</div><div class="countdown-label">剩余支付时间<div class="countdown-timer" id="waimai-timer-${msg.timestamp}"></div></div></div><button class="waimai-details-btn">查看详情</button></div>${actionButtonsHtml}</div>`;
        setTimeout(() => {
          if (msg.status === 'pending') {
            const timerElement = document.getElementById(`waimai-timer-${msg.timestamp}`);
            if (timerElement) {
              const timerId = startWaimaiCountdown(timerElement, msg.countdownEndTime);

              waimaiTimers[msg.timestamp] = timerId;
            }
          }
        }, 0);
      } else if (msg.type === 'waimai_order') {
        bubble.classList.add('is-waimai-request', 'is-card-like');
        const senderDisplayName = getDisplayNameInGroup(chat, msg.senderName);

        let recipientDisplayName = '你';
        if (chat.isGroup) {

          recipientDisplayName = getDisplayNameInGroup(chat, msg.recipientName);
        }

        contentHtml = `
        <div class="waimai-card">
            <div class="waimai-header">
                <img src="https://files.catbox.moe/mq179k.png" class="icon" alt="Meituan Icon">
                <div class="title-group"><span class="brand">美团外卖</span><span class="separator">|</span><span>外卖美食</span></div>
            </div>
            <div class="waimai-main">
                <div class="request-title" style="margin-bottom: 12px;">${senderDisplayName} 已为${recipientDisplayName}下单，请慢用～</div>
                <div class="payment-box">
                    <div class="payment-label" style="font-size: 18px; font-weight: 600;">${msg.productInfo}</div>
                    <div class="amount" style="margin-top: 8px;">¥${Number(msg.amount).toFixed(2)}</div>
                </div>
                <button class="waimai-details-btn">查看订单详情</button>
            </div>
        </div>
    `;
      } else if (msg.type === 'red_packet') {
        bubble.classList.add('is-red-packet', 'is-card-like');
        const myOriginalName = state.qzoneSettings.nickname || '{{user}}';
        const isFinished = msg.isFullyClaimed;
        const hasClaimed = msg.claimedBy && msg.claimedBy[myOriginalName];
        let cardClass = '',
          claimedInfoHtml = '',
          typeText = '拼手气红包';
        if (isFinished) {
          cardClass = 'opened';
        }
        if (msg.packetType === 'direct') {
          const receiverDisplayName = getDisplayNameInGroup(chat, msg.receiverName);
          typeText = `专属红包: 给 ${receiverDisplayName}`;
          if (Object.keys(msg.claimedBy || {}).length > 0) cardClass = 'opened';
        }
        if (hasClaimed) {
          const myClaimedAmount = msg.claimedBy[myOriginalName] || 0;
          claimedInfoHtml = `<div class="rp-claimed-info">你领取了红包，金额 ${myClaimedAmount.toFixed(2)} 元</div>`;
        } else if (isFinished) {
          claimedInfoHtml = `<div class="rp-claimed-info">红包已被领完</div>`;
        } else if (msg.packetType === 'direct' && Object.keys(msg.claimedBy || {}).length > 0) {
          const receiverDisplayName = getDisplayNameInGroup(chat, msg.receiverName);
          claimedInfoHtml = `<div class="rp-claimed-info">已被 ${receiverDisplayName} 领取</div>`;
        }
        contentHtml = `<div class="red-packet-card ${cardClass}"><div class="rp-header"><img src="https://files.catbox.moe/lo9xhc.png" class="rp-icon"><span class="rp-greeting">${msg.greeting || '恭喜发财，大吉大利！'}</span></div><div class="rp-type">${typeText}</div>${claimedInfoHtml}</div>`;
      } else if (msg.type === 'poll') {
        bubble.classList.add('is-poll', 'is-card-like');
        const pollQuestionText = msg.question || msg.content || '(无标题投票)';
        let totalVotes = 0;
        const voteCounts = {};
        for (const option in msg.votes) {
          const count = msg.votes[option].length;
          voteCounts[option] = count;
          totalVotes += count;
        }
        const myOriginalName = state.qzoneSettings.nickname || '{{user}}';
        let myVote = null;
        for (const option in msg.votes) {
          if (msg.votes[option].includes(myOriginalName)) {
            myVote = option;
            break;
          }
        }
        let optionsHtml = '<div class="poll-options-list">';
        msg.options.forEach(optionText => {
          const count = voteCounts[optionText] || 0;
          const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
          const isVotedByMe = myVote === optionText;
          optionsHtml += `<div class="poll-option-item ${isVotedByMe ? 'voted' : ''}" data-option="${optionText}"><div class="poll-option-bar" style="width: ${percentage}%;"></div><div class="poll-option-content"><span class="poll-option-text">${optionText}</span><span class="poll-option-votes">${count} 票</span></div></div>`;
        });
        optionsHtml += '</div>';
        let footerHtml = msg.isClosed ? `<div class="poll-footer"><span class="poll-total-votes">共 ${totalVotes} 人投票</span><button class="poll-action-btn">查看结果</button></div>` : `<div class="poll-footer"><span class="poll-total-votes">共 ${totalVotes} 人投票</span><button class="poll-action-btn">结束投票</button></div>`;
        contentHtml = `<div class="poll-card ${msg.isClosed ? 'closed' : ''}" data-poll-timestamp="${msg.timestamp}"><div class="poll-question">${pollQuestionText}</div>${optionsHtml}${footerHtml}</div>`;
      } else if (msg.type === 'gift') {
        bubble.classList.add('is-gift', 'is-card-like');
        let headerText;
        const myNicknameForGift = chat.settings.myNickname || '我';
        if (chat.isGroup) {
          if (msg.recipients && msg.recipients.length > 0) {
            const recipientDisplayNames = msg.recipients.map(originalName => getDisplayNameInGroup(chat, originalName));
            if (recipientDisplayNames.length === 1) {
              headerText = `送给 ${recipientDisplayNames[0]} 的礼物`;
            } else {
              headerText = `送给 ${recipientDisplayNames.slice(0, 2).join('、')}等人的礼物`;
            }
          } else {
            headerText = `送给大家的礼物`;
          }
        } else {
          if (isUser) {
            headerText = `送给 ${chat.name} 的礼物`;
          } else {
            const recipientDisplayName = chat.settings.myNickname || '你';
            headerText = `送给 ${recipientDisplayName} 的礼物`;
          }
        }
        const previewItems = msg.items.slice(0, 3);
        let previewHtml = '';
        previewItems.forEach(item => {
          previewHtml += `<div class="gift-preview-item"><img src="${item.imageUrl}" class="gift-preview-img"><span class="gift-preview-name">${item.name}</span><span class="gift-preview-quantity">x${item.quantity}</span></div>`;
        });
        let moreItemsText = '';
        if (msg.items.length > 3) {
          moreItemsText = ` 等${msg.items.length}件商品`;
        }
        contentHtml = `<div class="gift-card"><div class="gift-header"><svg class="gift-header-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-2.18a4 4 0 0 0-7.64 0H8a4 4 0 0 0-4 4v2h20V10a4 4 0 0 0-4-4zM8 4a2 2 0 1 1-2 2a2 2 0 0 1 2-2zm12 0a2 2 0 1 1-2 2a2 2 0 0 1 2-2zM4 14v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6H4z"></path></svg><span class="gift-header-text">${headerText}</span></div><div class="gift-items-preview">${previewHtml}</div><div class="gift-footer">共${msg.items.length}件商品${moreItemsText}，点击查看</div></div>`;
      } else if (msg.type === 'kinship_request') {
        bubble.classList.add('is-kinship-request', 'is-card-like');

        let statusText = '';
        let statusKey = '';

        if (msg.status === 'pending') {
          statusText = '等待对方确认...';
          statusKey = 'pending';
        } else if (msg.status === 'accepted') {
          statusText = '已开通';
          statusKey = 'accepted';
        } else {
          statusText = '已失效';
          statusKey = 'rejected';
        }

        contentHtml = `
            <div class="kinship-invite-card">
                <div class="kinship-invite-header">
                    <div class="kinship-title">亲属卡邀请</div>
                    <div class="kinship-subtitle">对方消费 我买单</div>
                </div>
                <div class="kinship-invite-body">
                    <div class="kinship-limit-label">每月消费额度</div>
                    <div class="kinship-limit-amount">¥${msg.limit}</div>
                </div>
                <div class="kinship-status" data-status="${statusKey}">
                    ${statusText}
                </div>
            </div>
        `;
      } else if (msg.type === 'playlist_share') {
        bubble.classList.add('is-playlist-share', 'is-card-like');
        const songsData = msg.songs || [];
        const songCount = songsData.length;
        const previewSongs = songsData.slice(0, 3);
        let songListHtml = previewSongs.map((s, i) => 
          `<div class="playlist-song-item"><span class="playlist-song-index">${i + 1}</span><div class="playlist-song-info"><span class="playlist-song-name">${s.name}</span><span class="playlist-song-artist">${s.artist}</span></div></div>`
        ).join('');
        if (songCount > 3) {
          songListHtml += `<div class="playlist-song-more">等共${songCount}首歌曲</div>`;
        }
        contentHtml = `
          <div class="playlist-share-card">
            <div class="playlist-share-header">
              <svg class="playlist-share-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
              <span class="playlist-share-title">${msg.playlistName || '歌单'}</span>
            </div>
            <div class="playlist-share-songs">${songListHtml}</div>
            <div class="playlist-share-footer">
              <span>歌单分享 · ${songCount}首</span>
            </div>
          </div>
        `;
      } else if (msg.type === 'couple_invite' || msg.type === 'couple_invite_response') {
        bubble.classList.add('is-couple-invite', 'is-card-like');
        const isResponse = msg.type === 'couple_invite_response';
        let statusText = '';
        let statusKey = '';
        if (isResponse) {
          if (msg.decision === 'accept') {
            statusText = '已接受邀请';
            statusKey = 'accepted';
          } else {
            statusText = '已拒绝邀请';
            statusKey = 'rejected';
          }
        } else {
          if (msg.status === 'pending') {
            statusText = '等待对方确认...';
            statusKey = 'pending';
          } else if (msg.status === 'accepted') {
            statusText = '已开启情侣空间';
            statusKey = 'accepted';
          } else {
            statusText = '邀请已被拒绝';
            statusKey = 'rejected';
          }
        }
        const isPendingAiInvite = (!isResponse && msg.status === 'pending' && !isUser);
        const actionAttrs = isPendingAiInvite ? ` data-pending-invite="true" data-timestamp="${msg.timestamp}" style="cursor: pointer;"` : '';
        const tapHint = isPendingAiInvite ? '<div class="couple-invite-hint" style="font-size: 11px; color: var(--theme-color, #ff4d4f); text-align: center; margin-top: 8px; font-weight: 500;">点击处理邀请</div>' : '';

        contentHtml = `
          <div class="couple-invite-card" data-status="${statusKey}"${actionAttrs}>
            <div class="couple-invite-header">
              <div class="couple-invite-title">情侣空间邀请</div>
            </div>
            <div class="couple-invite-body">
              <div class="couple-invite-desc">${isResponse ? (msg.decision === 'accept' ? '已同意开启情侣空间' : '已拒绝情侣空间邀请') : '邀请你一起开启情侣空间'}</div>
            </div>
            <div class="couple-invite-status" data-status="${statusKey}">
              ${statusText}
            </div>
            ${tapHint}
          </div>
        `;
      }
    } else if (msg.type === 'synth_music') {
      bubble.classList.add('is-card-like', 'is-music-synth');

      // 获取乐器类型，默认为 piano
      const instrumentType = msg.instrument || 'piano';

      contentHtml = `
        <div class="synth-music-card">
            <div class="synth-icon">🎹</div>
            <div class="synth-info">
                <div class="synth-title">♪ ${msg.title}</div>
                <div class="synth-reason" style="font-size:11px; opacity:0.8;">
                    ${msg.reason} (${instrumentType})
                </div>
            </div>
            <button class="synth-play-btn">
                ▶
            </button>
        </div>
    `;
    } else if (msg.type === 'thought_chain_block') {
      // 根据全局设置决定是否在聊天界面直接显示
      if (state.globalSettings.showThoughtChainInChat === false) {
          return null; // 隐藏，直接返回 null
      }
      
      const wrapper = document.createElement('div');
      wrapper.className = 'message-wrapper thought-chain-wrapper'; // 使用新的专门居中排版
      wrapper.dataset.timestamp = msg.timestamp;

      const bubble = document.createElement('div');
      bubble.className = 'message-bubble is-thought-chain-block'; // 移除 system-bubble 以消除灰色背景
      bubble.dataset.timestamp = msg.timestamp;
      
      // 注意这里使用了较弱的颜色，去掉了系统消息原有的灰色背景等
      bubble.innerHTML = `
        <details class="thought-chain-details">
            <summary class="thought-chain-summary" title="点击展开/折叠思考过程">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: -2px; opacity: 0.6;"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                <span style="opacity: 0.6; font-size: 11px;">深度思考</span>
            </summary>
            <div class="thought-chain-content">
                ${parseMarkdown(processMentions(
                  typeof ThoughtChainManager !== 'undefined'
                    ? ThoughtChainManager.escapeHtml(String(msg.content))
                    : String(msg.content).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
                  chat
                )).replace(/\n/g, '<br>')}
            </div>
        </details>
      `;

      wrapper.appendChild(bubble);

      addLongPressListener(wrapper, () => showMessageActions(msg.timestamp));
      wrapper.addEventListener('click', () => {
        if (isSelectionMode) toggleMessageSelection(msg.timestamp);
      });
      return wrapper;
    } else {
      const processedContent = String(rawContent);
      const renderedText = await applyRenderingRulesDetailed(processedContent, chat.id, { messageId: msg.id ?? msg.timestamp, timestamp: msg.timestamp, role: msg.role, type: msg.type, field: 'content', isGroup: !!chat.isGroup });
      const processedByRule = renderedText.content;
      if (renderedText.excluded) wrapper.hidden = true;
      if (renderedText.isHtml && processedByRule !== processedContent) {
        contentHtml = processedByRule;
        if (!renderedText.inlineOnly) bubble.classList.add('is-card-like');
      } else {


        if (Array.isArray(msg.content) && msg.content[0]?.type === 'image_url') {
          const imageUrl = msg.content[0].image_url.url;

          contentHtml = `
      <div class="bubble-image-wrapper user-image-wrapper">
          <img src="${imageUrl}" class="chat-image">
          <div class="bubble-image-controls user-controls">
              <button class="user-upload-imgbb-btn" title="上传图床" style="display: none;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
                      <polyline points="17 8 12 3 7 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
                      <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></line>
                  </svg>
              </button>
          </div>
      </div>
    `;
        } else if (STICKER_REGEX.test(processedByRule)) {
          bubble.classList.add('is-sticker', 'is-card-like');
          contentHtml = `<img src="${processedByRule}" alt="${msg.meaning || 'Sticker'}" class="sticker-image">`;
        } else {
          let plainText = processMentions(processedByRule, chat);
          // 【主屏幕QQ undefined过滤】应用undefined过滤器（仅对非用户消息）
          if (!isUser && typeof qqUndefinedFilter !== 'undefined') {
            plainText = qqUndefinedFilter(plainText);
          }
          
          // 【双语模式处理】如果启用了双语模式且是AI消息
          if (!isUser && chat.settings.enableBilingualMode && msg.type !== 'voice_message') {
            // 预处理：清理和规范化
            let cleanedContent = plainText
              .replace(/[\u200B-\u200D\uFEFF]/g, '')  // 清理零宽字符
              .replace(/【/g, '〖').replace(/】/g, '〗');  // 统一符号
            
            // 保存原始内容（包含〖〗）
            bubble.dataset.originalContent = cleanedContent;
            bubble.dataset.showingTranslation = 'false';
            
            // 默认隐藏〖〗部分，只显示外语
            plainText = cleanedContent.replace(/[〖【][^〗】]*[〗】]/g, '');
          }
          
          contentHtml = typeof window.renderSafeRichText === 'function'
            ? window.renderSafeRichText(plainText)
            : parseMarkdown(plainText).replace(/\n/g, '<br>');
        }
      }
    }


    bubble.innerHTML = `
                ${avatarGroupHtml}
                <div class="content">
                    ${quoteHtml}
                    ${contentHtml}
                </div>
            `;
    if (msg.type === 'synth_music') {
      const playButton = bubble.querySelector('.synth-play-btn');
      if (playButton) {
        playButton.addEventListener('click', () =>
          window.playSynthScore(playButton, msg.notes, msg.instrument || 'piano'));
      }
    }
    if ((msg.type === 'naiimag' || msg.type === 'googleimag' || msg.type === 'openaiimag') && msg.imageUrl && msg.imageUrl.startsWith('data:image')) {
      if (state.apiConfig.imgbbEnable && state.apiConfig.imgbbApiKey) {

        const uploadBtn = bubble.querySelector('.nai-upload-imgbb-btn');
        if (uploadBtn) {
          uploadBtn.style.display = 'flex';
        }
      }
    }
    if (msg.role === 'user' && Array.isArray(msg.content) && msg.content[0]?.type === 'image_url') {
      const imageUrl = msg.content[0].image_url.url;
      if (imageUrl && imageUrl.startsWith('data:image')) {
        if (state.apiConfig.imgbbEnable && state.apiConfig.imgbbApiKey) {
          const uploadBtn = bubble.querySelector('.user-upload-imgbb-btn');
          if (uploadBtn) {
            // uploadBtn.style.display = 'flex'; // 显示上传按钮
          }
        }
      }
    }
    
    // 创建消息内容行容器（包含bubble和timestamp）
    const contentRow = document.createElement('div');
    contentRow.className = 'message-content-row';
    contentRow.appendChild(bubble);
    contentRow.appendChild(timestampEl);
    
    wrapper.appendChild(contentRow);

    addLongPressListener(wrapper, () => showMessageActions(msg.timestamp));
    wrapper.addEventListener('click', () => {
      if (isSelectionMode) toggleMessageSelection(msg.timestamp);
    });

    if (!isUser) {
      const avatarGroupEl = wrapper.querySelector('.avatar-group');
      if (avatarGroupEl) {
        avatarGroupEl.style.cursor = 'pointer';
        if (!chat.isGroup) {
          avatarGroupEl.addEventListener('click', (e) => {
            e.stopPropagation();
            showCharacterProfileModal(chat.id);
          });
        } else {
          avatarGroupEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            handleUserPat(chat.id, msg.senderName);
          });
        }
      }
    } else {
      // USER头像点击事件 - 修改在线状态
      const avatarGroupEl = wrapper.querySelector('.avatar-group');
      if (avatarGroupEl) {
        avatarGroupEl.style.cursor = 'pointer';
        avatarGroupEl.addEventListener('click', (e) => {
          e.stopPropagation();
          showUserStatusModal(chat.id);
        });
      }
    }
    return wrapper;
  }


