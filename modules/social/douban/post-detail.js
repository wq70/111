  async function openDoubanPostDetail(postId) {
    showScreen('douban-post-detail-screen');
    activeDoubanPostId = postId;
    const post = await db.doubanPosts.get(postId);
    if (!post) {
      showScreen('douban-screen');
      return;
    }

    document.getElementById('douban-post-detail-title').textContent = '帖子详情';


    let authorAvatar = defaultAvatar;
    let authorDisplayName = post.authorName;

    const authorChatByOriginalName = post.authorOriginalName ?
      Object.values(state.chats).find(c => !c.isGroup && c.originalName === post.authorOriginalName) :
      null;

    if (authorChatByOriginalName) {
      authorAvatar = authorChatByOriginalName.settings.aiAvatar;
    } else {
      const authorChatByName = Object.values(state.chats).find(c => !c.isGroup && c.name === post.authorName);
      if (authorChatByName) {
        authorAvatar = authorChatByName.settings.aiAvatar;
      } else {
        // 优先使用自定义头像
        const customAvatar = getNpcAvatarForCharacter(post.authorName);
        if (customAvatar) {
          authorAvatar = customAvatar;
        } else if (post.authorAvatarPrompt && state.globalSettings.doubanEnableAiAvatar !== false) {
          authorAvatar = getPollinationsImageUrl(post.authorAvatarPrompt);
        }
      }
    }


    if (post.authorAvatar) authorAvatar = post.authorAvatar;
    const detailAvatar = document.getElementById('douban-detail-avatar');
    if (detailAvatar) {
        detailAvatar.src = authorAvatar;
        detailAvatar.onerror = function() { this.onerror=null; this.src=defaultAvatar; };
    }
    document.getElementById('douban-detail-author').textContent = authorDisplayName;
    document.getElementById('douban-detail-group').textContent = `来自 ${post.groupName}`;
    document.getElementById('douban-detail-post-title').textContent = post.postTitle;
    document.getElementById('douban-detail-content').innerHTML = escapeHTML(post.content || '').replace(/\n/g, '<br>');
    
    const postBodyEl = document.getElementById('douban-post-detail-body');
    postBodyEl.onclick = (e) => {
        if (isDoubanDetailSelectMode) {
            const isSelected = postBodyEl.classList.contains('selected');
            if (isSelected) {
                postBodyEl.classList.remove('selected');
                selectedDoubanComments.delete('post_body');
            } else {
                postBodyEl.classList.add('selected');
                selectedDoubanComments.add('post_body');
            }
            updateDoubanDetailForwardButton();
        }
    };
    
    if (!postBodyEl.querySelector('.douban-checkbox')) {
        postBodyEl.style.position = 'relative';
        const cb = document.createElement('div');
        cb.className = 'douban-checkbox';
        cb.style.cssText = 'display: none; position: absolute; top: 15px; right: 15px; z-index: 2; pointer-events: none;';
        postBodyEl.appendChild(cb);
    }
    const myCommentAvatar = document.getElementById('douban-my-comment-avatar');
    if (myCommentAvatar) {
        myCommentAvatar.src = state.globalSettings.doubanUserAvatar || state.qzoneSettings.avatar || defaultAvatar;
        myCommentAvatar.onerror = function() { this.onerror=null; this.src=defaultAvatar; };
    }
    document.getElementById('douban-comment-input').value = '';

    const commentsListEl = document.getElementById('douban-detail-comments-list');
    commentsListEl.innerHTML = '';


    if (post.comments && post.comments.length > 0) {

      const commenterAvatarMap = new Map();

      post.comments.forEach(comment => {
        let commenterAvatar = defaultAvatar;
        const myNickname = state.globalSettings.doubanUserNickname || state.qzoneSettings.nickname || '我';
        const isUserComment = comment.isUser || comment.commenter === '我' || comment.commenter === state.qzoneSettings.nickname || comment.commenter === state.globalSettings.doubanUserNickname;
        const displayCommenterName = comment.commenterDisplayName || (isUserComment ? myNickname : comment.commenter);

        if (commenterAvatarMap.has(displayCommenterName)) {

          commenterAvatar = commenterAvatarMap.get(displayCommenterName);
        } else {

          if (isUserComment) {
            commenterAvatar = state.globalSettings.doubanUserAvatar || state.qzoneSettings.avatar || defaultAvatar;
          } else if (displayCommenterName === post.authorName) {
            commenterAvatar = authorAvatar;
          } else {
            const commenterChatByOriginalName = comment.commenterOriginalName ?
              Object.values(state.chats).find(c => !c.isGroup && c.originalName === comment.commenterOriginalName) :
              null;

            if (commenterChatByOriginalName) {
              commenterAvatar = commenterChatByOriginalName.settings.aiAvatar;
            } else {
              const commenterChatByName = Object.values(state.chats).find(c => !c.isGroup && c.name === displayCommenterName);
              if (commenterChatByName) {
                commenterAvatar = commenterChatByName.settings.aiAvatar;
              } else {
                // 优先使用自定义头像
                const customAvatar = getNpcAvatarForCharacter(displayCommenterName);
                if (customAvatar) {
                  commenterAvatar = customAvatar;
                } else if (comment.avatar_prompt && state.globalSettings.doubanEnableAiAvatar !== false) {
                  commenterAvatar = getPollinationsImageUrl(comment.avatar_prompt);
                }
              }
            }
          }

          commenterAvatarMap.set(displayCommenterName, commenterAvatar);
        }

        if (comment.commenterAvatar) commenterAvatar = comment.commenterAvatar;
        const commentEl = document.createElement('div');
        commentEl.className = 'douban-comment-item';
        
        const commentId = btoa(unescape(encodeURIComponent(displayCommenterName + comment.text))).replace(/[^a-zA-Z0-9]/g, '');
        commentEl.dataset.commentId = commentId;
        commentEl.innerHTML = `
                <div class="douban-checkbox" style="display: none; margin-right: 10px; align-self: center; flex-shrink: 0; pointer-events: none;"></div>
                <img src="${escapeHTML(commenterAvatar || '')}" class="douban-comment-avatar" onerror="this.onerror=null; this.src=defaultAvatar;">
                <div class="douban-comment-body">
                    <div class="douban-comment-author">${escapeHTML(displayCommenterName || '')}</div>
                    <div class="douban-comment-text">${escapeHTML(comment.text || '').replace(/\n/g, '<br>')}</div>
                </div>
            `;
            
        commentEl.onclick = (e) => {
            if (isDoubanDetailSelectMode) {
                const isSelected = commentEl.classList.contains('selected');
                if (isSelected) {
                    commentEl.classList.remove('selected');
                    selectedDoubanComments.delete(commentId);
                } else {
                    commentEl.classList.add('selected');
                    selectedDoubanComments.add(commentId);
                }
                updateDoubanDetailForwardButton();
            }
        };
        commentsListEl.appendChild(commentEl);
      });
    } else {
      commentsListEl.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px;">还没有回应</p>';
    }

    const contentWrapper = document.getElementById('douban-detail-content-wrapper');
    if (contentWrapper) contentWrapper.scrollTop = 0;
  }


  async function handleSendDoubanComment() {
    if (!activeDoubanPostId) return;

    const input = document.getElementById('douban-comment-input');
    const commentText = input.value.trim();
    if (!commentText) return;

    const post = await db.doubanPosts.get(activeDoubanPostId);
    if (!post) return;

    if (!post.comments) {
      post.comments = [];
    }

    const myNickname = state.globalSettings.doubanUserNickname || state.qzoneSettings.nickname || '我';

    post.comments.push({
      commenter: myNickname,
      text: commentText,
      isUser: true
    });
    post.commentsCount++;

    await db.doubanPosts.put(post);
    input.value = '';


    await openDoubanPostDetail(activeDoubanPostId);


  }


  async function handleDoubanWaitReply() {
    if (!activeDoubanPostId) return;

    const postId = activeDoubanPostId;
    const post = await db.doubanPosts.get(postId);
    if (!post) return;

    const lastComment = post.comments && post.comments.slice(-1)[0];
    if (!lastComment) {
      alert("还没有任何评论，无法等待回复。");
      return;
    }

    await showCustomAlert("请稍候...", "正在请求AI角色们加入讨论...");

    try {
      const {
        proxyUrl,
        apiKey,
        model
      } = state.apiConfig;
      if (!proxyUrl || !apiKey || !model) {
        throw new Error('API未配置，无法生成内容。');
      }

      const userNickname = state.globalSettings.doubanUserNickname || state.qzoneSettings.nickname || '我';
      
      // --- 等待回复时同样读取人设 ---
      let userPersona = '(未设置)';
      const activePersonaIds = state.globalSettings.doubanActivePersonaIds || [];
      if (activePersonaIds.length > 0 && state.personaPresets) {
          const selectedPersonas = state.personaPresets.filter(p => activePersonaIds.includes(p.id));
          if (selectedPersonas.length > 0) {
              userPersona = selectedPersonas[0].persona;
          }
      } else {
          // 后备逻辑
          userPersona = state.chats[Object.keys(state.chats)[0]]?.settings.myPersona || '(未设置)';
      }
      
      const allLinkedBookIds = new Set();
      const activeCharacterIds = state.globalSettings.doubanActiveCharacterIds || [];
      activeCharacterIds.forEach(charId => {
        const c = state.chats[charId];
        if (c && c.settings.linkedWorldBookIds) {
          c.settings.linkedWorldBookIds.forEach(bookId => allLinkedBookIds.add(bookId));
        }
      });
  
      // 添加所有全局世界书
      state.worldBooks.forEach(wb => {
        if (wb.isGlobal) {
          allLinkedBookIds.add(wb.id);
        }
      });
      
      // 添加豆瓣专属关联的世界书
      const doubanActiveWorldBookIds = state.globalSettings.doubanActiveWorldBookIds || [];
      doubanActiveWorldBookIds.forEach(wbId => {
          allLinkedBookIds.add(wbId);
      });
  
      let sharedWorldBookContext = '';
      if (allLinkedBookIds.size > 0) {
        sharedWorldBookContext += '\n\n# 统一世界观设定 (以下设定适用于所有参与角色)\n';
        allLinkedBookIds.forEach(bookId => {
          const book = state.worldBooks.find(wb => wb.id === bookId);
          if (book) {
            const enabledEntries = book.content
              .filter(e => e.enabled !== false)
              .map(e => `- ${e.content}`)
              .join('\n');
            if (enabledEntries) {
              sharedWorldBookContext += `\n## 来自《${book.name}》:\n${enabledEntries}`;
            }
          }
        });
      }

      const existingNpcs = new Map();
      if (post.comments) {
        post.comments.forEach(comment => {
          const isMainCharacter = (state.globalSettings.doubanActiveCharacterIds || []).some(id => state.chats[id]?.name === comment.commenter);
          if (!isMainCharacter && comment.avatar_prompt) {
            existingNpcs.set(comment.commenter, comment.avatar_prompt);
          }
        });
      }

      let existingNpcContext = "# 已有路人NPC头像指令 (必须遵守！)\n";
      if (existingNpcs.size > 0) {
        existingNpcContext += "如果以下任何一位NPC再次评论，你【必须】使用我们提供的、完全相同的`avatar_prompt`，以保持头像一致性。\n";
        existingNpcs.forEach((prompt, name) => {
          existingNpcContext += `- **${name}**: "${prompt}"\n`;
        });
      } else {
        existingNpcContext += "（当前帖子还没有路人NPC发表评论。）\n";
      }

      const doubanWorldBook = state.worldBooks.find(wb => wb.name === '豆瓣设定');
      let npcCharacters = [];
      if (doubanWorldBook) {
        doubanWorldBook.content.forEach(entry => {
          if (entry.comment.includes('NPC人设')) {
            const lines = entry.content.split('\n');
            lines.forEach(line => {
              const match = line.match(/- \*\*昵称\*\*:\s*(.*?)\s*\*\*人设\*\*:\s*(.*)/);
              if (match) {
                npcCharacters.push({
                  name: match[1].trim(),
                  persona: match[2].trim()
                });
              }
            });
          }
        });
      }

      let charactersContext = '';
      for (const charId of activeCharacterIds) {
        const c = state.chats[charId];
        if (c) {
          const longTermMemory = getMemoryContextForPrompt(c) || '无';
          const recentHistory = c.history.slice(-10).map(msg => `${msg.role === 'user' ? userNickname : c.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
          charactersContext += `\n- ${c.name}: ${c.settings.aiPersona.substring(0, 50)}... [记忆: ${longTermMemory}] [最近对话: ${recentHistory}]`;
        }
      }
      npcCharacters.forEach(npc => {
        charactersContext += `\n- ${npc.name}: ${npc.persona}`;
      });


      const now = new Date();
      const currentTimeString = now.toLocaleString('zh-CN', {
        dateStyle: 'full',
        timeStyle: 'short'
      });


      const systemPrompt = `
# 你的任务
你是一个虚拟社区的AI导演。下面的"帖子摘要"和"已有评论"来自于一个豆瓣小组的帖子。用户"${userNickname}"刚刚对最后一条评论点击了"等待回复"，TA希望看到更多角色参与讨论。
你的任务是：根据所有角色的设定，选择【10到20位】最适合参与讨论的角色，让他们针对已有评论，发表【全新的、符合人设的】回应。

# 核心规则
1.  **【时间感知】**:
    -   你【必须】意识到当前是 **${currentTimeString}**。
    -   你的评论内容【必须】自然地体现出对【当前真实时间】的感知。
2.  **【禁止扮演用户 (最最最高优先级！！！)】**:
    -   用户的昵称是"${userNickname}"。
    -   你【绝对不能】生成 commenter 字段为 "${userNickname}" 的评论。你的任务是扮演【除了用户以外】的所有角色。
3.  **【互动】**: 新生成的评论【必须】是针对【已有评论】的延续或回应，让讨论能继续下去。
4.  **【头像一致性 (最高优先级！)】**: 你【必须】参考下面的"已有路人NPC头像指令"列表。如果一个已有的NPC再次发言，【必须】复用它旧的头像指令。只有在创造一个【全新的、从未出现过的】NPC时，才为其生成新的头像指令。
5.  **【格式】**: 你的回复【必须且只能】是一个JSON数组，数组中的每个元素都代表一条新评论，格式【必须】如下:
    \`\`\`json
    [
      { "commenter": "角色A的名字", "text": "角色A的新评论内容。", "avatar_prompt": "(可选)如果评论者是【全新的】NPC,提供头像指令" },
      { "commenter": "角色B的名字", "text": "角色B对角色A或楼主的看法。" }
    ]
    \`\`\`

# 上下文
- **帖子标题**: 《${post.postTitle}》
- **发帖人**: ${post.authorName}
- **帖子内容摘要**: ${post.content.substring(0, 100)}...
- **已有评论**:
${post.comments.map(c => {
  const isUserComment = c.isUser || c.commenter === '我' || c.commenter === state.qzoneSettings.nickname || c.commenter === state.globalSettings.doubanUserNickname;
  const displayName = isUserComment ? userNickname : c.commenter;
  return `- ${displayName}: ${c.text}`;
}).join('\n')}

${existingNpcContext}
${sharedWorldBookContext}

# 当前情景
- **当前真实时间**: ${currentTimeString}

# 【你的聊天对象（用户）的人设】
- **昵称**: ${userNickname}
- **人设**: ${userPersona}

# 你的角色库 (你可以从中选择【任何角色】进行评论，并参考他们的记忆和对话)
${charactersContext}

现在，请生成新的评论。`;

      const messagesForApi = [{
        role: 'user',
        content: "请根据以上情景，生成新的评论。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);

      const response = isGemini ?
        await fetch(geminiConfig.url, geminiConfig.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{
              role: 'system',
              content: systemPrompt
            }, ...messagesForApi],
            temperature: state.globalSettings.apiTemperature || 1.0,
            ...(state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined ? { top_p: state.globalSettings.apiTopP } : {}),
            ...(state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens !== undefined ? { max_tokens: state.globalSettings.apiMaxTokens } : {}),
            ...(state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined ? { presence_penalty: state.globalSettings.apiPresencePenalty } : {}),
            ...(state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined ? { frequency_penalty: state.globalSettings.apiFrequencyPenalty } : {})
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);
      
      let newComments;
      try {
        let textToParse = aiResponseContent;
        const codeBlockMatch = textToParse.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            textToParse = codeBlockMatch[1];
        } else {
            const firstBracket = textToParse.indexOf('[');
            const lastBracket = textToParse.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket !== -1 && lastBracket >= firstBracket) {
                textToParse = textToParse.substring(firstBracket, lastBracket + 1);
            }
        }
        newComments = JSON.parse(textToParse.trim());
      } catch (parseError) {
        throw new Error(`解析JSON失败: ${parseError.message}\n原始返回内容: ${aiResponseContent}`);
      }

      if (Array.isArray(newComments) && newComments.length > 0) {
        post.comments.push(...newComments);
        post.commentsCount += newComments.length;
        await db.doubanPosts.put(post);
      }

      await openDoubanPostDetail(postId);

      hideCustomModal();

    } catch (error) {
      console.error("等待回复失败:", error);
      await showCustomAlert("操作失败", `无法获取AI回复，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }



