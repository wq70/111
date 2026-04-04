// ========================================
// 豆瓣功能模块
// 来源: script.js 第 46304 ~ 47013 行 + 第 50008 ~ 50500 行
// 包含: renderDoubanScreen, handleGenerateDoubanPosts, openDoubanPostDetail,
//       handleSendDoubanComment, handleDoubanWaitReply, openDoubanCastSelector,
//       saveDoubanCastSelection, openDoubanSettingsModal, saveDoubanSettings,
//       openNpcAvatarsModal, renderNpcAvatarsList, updateNpcAvatarDeleteButton,
//       addNpcAvatarFromURL, addNpcAvatarFromLocal, handleNpcAvatarLocalUpload,
//       deleteSelectedNpcAvatars, toggleSelectAllNpcAvatars, getNpcAvatarForCharacter,
//       resetDoubanAvatarAssignments, openCustomGroupsModal, renderCustomGroupsList,
//       openEditGroupModal, saveEditGroup, openDeleteDoubanPostsModal,
//       handleConfirmDeleteDoubanPosts
// ========================================

  async function renderDoubanScreen() {
    const listEl = document.getElementById('douban-posts-list');
    listEl.innerHTML = '';

    const posts = await db.doubanPosts.orderBy('timestamp').reverse().toArray();

    if (posts.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">这里空空如也，<br>点击右上角刷新按钮，看看大家都在聊什么吧！</p>';
      return;
    }

    posts.forEach(post => {
      let avatarUrl;


      const authorChatByOriginalName = post.authorOriginalName ?
        Object.values(state.chats).find(c => !c.isGroup && c.name === post.authorOriginalName) :
        null;

      if (authorChatByOriginalName) {

        avatarUrl = authorChatByOriginalName.settings.aiAvatar;
      } else {

        const authorChatByName = Object.values(state.chats).find(c => !c.isGroup && c.name === post.authorName);
        if (authorChatByName) {
          avatarUrl = authorChatByName.settings.aiAvatar;
        } else {
          // 优先使用自定义头像
          const customAvatar = getNpcAvatarForCharacter(post.authorName);
          if (customAvatar) {
            avatarUrl = customAvatar;
          } else if (post.authorAvatarPrompt && state.globalSettings.doubanEnableAiAvatar !== false) {
            avatarUrl = getPollinationsImageUrl(post.authorAvatarPrompt);
          } else {
            avatarUrl = defaultAvatar;
          }
        }
      }


      const itemEl = document.createElement('div');
      itemEl.className = 'douban-post-item';
      itemEl.onclick = () => openDoubanPostDetail(post.id);

      itemEl.innerHTML = `
            <div class="douban-post-header">
                <img src="${avatarUrl}" class="douban-post-avatar">
                <div class="douban-author-info">
                    <div class="douban-author-name">${post.authorName}</div>
                    <div class="douban-group-name">来自 ${post.groupName}</div>
                </div>
            </div>
            <div class="douban-post-title">${post.postTitle}</div>
            <div class="douban-post-content">${post.content.replace(/\n/g, '<br>')}</div>
            <div class="douban-post-footer">
                 <div class="douban-post-actions">
                    <span><svg viewBox="0 0 1024 1024"><path d="M170.666667 170.666667h128v682.666666h-128zM426.666667 170.666667h170.666666v682.666666h-170.666666zM725.333333 170.666667h128v682.666666h-128z"></path></svg> ${post.likesCount}</span>
                    <span><svg viewBox="0 0 1024 1024"><path d="M853.333333 85.333333H170.666667c-46.933333 0-85.333333 38.4-85.333334 85.333334v512c0 46.933333 38.4 85.333333 85.333334 85.333333h512l170.666667 170.666667V170.666667c0-46.933333-38.4-85.333333-85.333334-85.333334z m-42.666666 554.666667H170.666667V170.666667h640v469.333333zM256 384h512v85.333333H256V384z m0-170.666667h512v85.333334H256v-85.333334z"></path></svg> ${post.commentsCount}</span>
                </div>
                <span class="douban-post-timestamp">${formatTimeAgo(post.timestamp)}</span>
            </div>
        `;
      listEl.appendChild(itemEl);
    });
  }



  async function handleGenerateDoubanPosts() {
    const activeCharacterIds = state.globalSettings.doubanActiveCharacterIds || [];

    if (activeCharacterIds.length === 0) {
      await showCustomAlert("请先选择角色", "请点击右上角的\u201C角色选择\u201D按钮，选择至少一个参与豆瓣互动的角色。");
      return;
    }

    // 重置当前批次的头像分配
    resetDoubanAvatarAssignments();

    await showCustomAlert("请稍候...", `正在为您选择的 ${activeCharacterIds.length} 位角色生成豆瓣动态...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const allLinkedBookIds = new Set();
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

    const doubanWorldBook = state.worldBooks.find(wb => wb.name === '豆瓣设定');
    let doubanSettingContext = '';
    let npcCharacters = [];
    if (doubanWorldBook) {
      doubanWorldBook.content.forEach(entry => {
        if (entry.comment.includes('小组风格')) {
          doubanSettingContext += `\n# 豆瓣社区风格设定 (来自世界书)\n${entry.content}`;
        }
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

    const userNickname = state.qzoneSettings.nickname || '我';
    const userPersona = activeCharacterIds.length > 0 && state.chats[activeCharacterIds[0]] ?
      state.chats[activeCharacterIds[0]].settings.myPersona :
      '(未设置)';

    let charactersContext = '';
    activeCharacterIds.forEach(charId => {
      const c = state.chats[charId];
      if (c) {
        const longTermMemory = c.longTermMemory && c.longTermMemory.length > 0 ? c.longTermMemory.map(m => m.content).join('; ') : '无';
        const recentHistory = c.history.slice(-10).map(msg =>
          `${msg.role === 'user' ? userNickname : c.name}: ${String(msg.content).substring(0, 30)}...`
        ).join('\n');

        charactersContext += `
<character>
  <name>${c.name}</name>
  <persona>${c.settings.aiPersona}</persona>
  <memory>${longTermMemory}</memory>
  <recent_dialogue_with_user>${recentHistory}</recent_dialogue_with_user>
</character>
`;
      }
    });
    npcCharacters.forEach(npc => {
      charactersContext += `
<character>
  <name>${npc.name}</name>
  <persona>${npc.persona}</persona>
</character>
`;
    });

    const now = new Date();
    const currentTimeString = now.toLocaleString('zh-CN', {
      dateStyle: 'full',
      timeStyle: 'short'
    });
    const minPosts = state.globalSettings.doubanMinPosts || 12;
    const maxPosts = state.globalSettings.doubanMaxPosts || 20;
    
    // 获取启用的自定义小组
    const customGroups = state.globalSettings.customDoubanGroups || [];
    const enabledGroups = customGroups.filter(g => g.enabled !== false);
    
    // 构建自定义小组提示词
    let customGroupsContext = '';
    if (enabledGroups.length > 0) {
      customGroupsContext = '\n\n# 自定义小组列表\n以下是用户自定义的豆瓣小组，你生成的帖子【必须】优先从这些小组中选择：\n\n';
      enabledGroups.forEach((group, index) => {
        customGroupsContext += `${index + 1}. **${group.name}**\n   ${group.prompt}\n\n`;
      });
      customGroupsContext += '\n【重要】：你生成的帖子中，至少有 60% 应该来自上述自定义小组。剩余的帖子可以来自其他豆瓣小组。\n';
    }
    
    const systemPrompt = `
# 你的任务
你是一个虚拟社区内容生成器。你的任务是根据下面提供的【统一角色列表】，虚构出【${minPosts}到${maxPosts}篇】他们最近可能会在各种豆瓣小组中发布的帖子和评论。

# 核心规则
1.  **【时间感知】**:
    -   你【必须】意识到当前是 **${currentTimeString}**。
    -   你的帖子和评论内容【必须】自然地体现出对【当前真实时间】的感知。
2.  **【禁止扮演用户 (最最最高优先级！！！)】**:
    -   用户的昵称是"${userNickname}"。
    -   你【绝对不能】生成 authorName 或 commenter 字段为 "${userNickname}" 的帖子或评论。你的任务是扮演【除了用户以外】的所有角色。
3.  **【身份 (最高优先级！)】**: 
    -   \`authorName\`: 你可以为主要角色起一个符合情景的、临时的【发帖昵称】，也可以直接使用他们的本名。
    -   \`authorOriginalName\`: 如果发帖者是【主要角色】，你【必须】在这里填上TA在角色列表里的【原始备注名】，这是程序的"身份证"。
    -   如果发帖者是【路人NPC】，则【省略】\`authorOriginalName\` 字段。
4.  **【作者平衡】**: 帖子的作者【必须】从下面的 \`<character>\` 列表中【均匀地、多样化地】选择。你【必须】确保帖子列表中【至少有 70% 的帖子是由路人NPC发布的】，以营造一个真实的社区氛围。
    - "comments": 一个包含【7到12条】评论的数组。评论者可以是路人，也可以是角色列表中的其他角色，以体现互动性。
5.  **【角色扮演】**: 帖子的作者和内容【必须】深度结合该角色的<persona>, <memory>, 和 <worldview>。
6.  **【"豆瓣味"内容风格指南】**: 帖子风格必须多样化且充满生活气息！你需要生成包括但不限于：情感树洞、生活吐槽、吃瓜八卦、兴趣分享、无用良品等各种类型的帖子。
7.  **【头像生成 (最高优先级！)】**:
    -   为每一个【首次出现】的路人NPC（无论是发帖还是评论），你都【必须】为其添加一个 \`avatar_prompt\` 字段。
    -   这个字段的内容是用于生成该NPC头像的、简洁的【英文】关键词。
    -   不同的NPC【必须】有不同的头像指令，以确保他们的头像是独一无二的。
8.  **【头像一致性 (至关重要！)】**:
    -   如果一个路人NPC在同一个帖子中多次出现（例如，既是发帖人又是评论者，或多次评论），你【必须】为TA的所有出现都使用【完全相同】的 \`avatar_prompt\`。这至关重要！
9.  **【格式 (最高优先级)】**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 你的回复必须以 \`[\` 开始，并以 \`]\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记 (如 \`\`\`json)。
    - 数组中的每个元素都是一篇帖子，格式【必须】如下:
    \`\`\`json
    [
      {
        "groupName": "一个生动有趣的小组名称",
        "postTitle": "一个引人-注目的帖子标题",
        "authorName": "发帖角色的【备注名】",
        "authorOriginalName": "(仅当发帖者是主要角色时【必须】提供) TA的原始备注名",
        "authorAvatarPrompt": "(仅当发帖者是路人NPC时【必须】提供) 一段用于生成该NPC头像的【英文】关键词。风格为 anime style, simple background",
        "content": "帖子的详细正文，必须支持换行符\\n。",
        "likesCount": 152,
        "commentsCount": 38,
        "comments": [
            { "commenter": "路人甲", "text": "这是一个路人评论。", "avatar_prompt": "cute cat avatar, simple, flat" },
            { "commenter": "另一个角色名", "commenterOriginalName": "(如果评论者是主要角色，必须提供其本名)", "text": "这是一个来自其他角色的互动评论。" }
        ]
      }
    ]
    \`\`\`
    - **comments**: 
        -   评论者可以是路人，也可以是角色列表中的其他角色。评论区【必须】体现出互动性。
        -   【评论身份】: 如果评论者是【主要角色】，你【必须】为其添加 \`commenterOriginalName\` 字段，并填入其本名。如果是路人NPC，则省略此字段。

# 供你参考的上下文
${customGroupsContext}
${doubanSettingContext}
${sharedWorldBookContext}

# 当前情景
- **当前真实时间**: ${currentTimeString}

# 【你的聊天对象（用户）的身份档案】
- **昵称**: ${userNickname}
- **人设**: ${userPersona}

# 统一角色列表 (你扮演的角色 + 路人NPC)
${charactersContext}

现在，请严格遵守所有规则，特别是【时间感知】和【禁止扮演用户】的铁律，开始生成这组生动、多样且充满"豆瓣味"的小组帖子。`;

    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据角色列表，生成豆瓣小组帖子。"
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
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      const jsonMatch = aiResponseContent.match(/\[[\s\S]*\]/);

      if (!jsonMatch) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }

      const simulatedPosts = JSON.parse(jsonMatch[0]);
      await db.doubanPosts.clear();
      await db.doubanPosts.bulkAdd(simulatedPosts.map(p => ({
        ...p,
        timestamp: Date.now() - Math.random() * 100000
      })));

      await renderDoubanScreen();

    } catch (error) {
      console.error("生成豆瓣帖子失败:", error);
      await showCustomAlert("生成失败", `无法生成内容，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }


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


    document.getElementById('douban-detail-avatar').src = authorAvatar;
    document.getElementById('douban-detail-author').textContent = authorDisplayName;
    document.getElementById('douban-detail-group').textContent = `来自 ${post.groupName}`;
    document.getElementById('douban-detail-post-title').textContent = post.postTitle;
    document.getElementById('douban-detail-content').innerHTML = post.content.replace(/\n/g, '<br>');
    document.getElementById('douban-my-comment-avatar').src = state.qzoneSettings.avatar;
    document.getElementById('douban-comment-input').value = '';

    const commentsListEl = document.getElementById('douban-detail-comments-list');
    commentsListEl.innerHTML = '';


    if (post.comments && post.comments.length > 0) {

      const commenterAvatarMap = new Map();

      post.comments.forEach(comment => {
        let commenterAvatar = defaultAvatar;
        const myNickname = state.qzoneSettings.nickname || '我';
        const commenterName = comment.commenter;

        if (commenterAvatarMap.has(commenterName)) {

          commenterAvatar = commenterAvatarMap.get(commenterName);
        } else {

          if (commenterName === myNickname) {
            commenterAvatar = state.qzoneSettings.avatar;
          } else if (commenterName === post.authorName) {
            commenterAvatar = authorAvatar;
          } else {
            const commenterChatByOriginalName = comment.commenterOriginalName ?
              Object.values(state.chats).find(c => !c.isGroup && c.originalName === comment.commenterOriginalName) :
              null;

            if (commenterChatByOriginalName) {
              commenterAvatar = commenterChatByOriginalName.settings.aiAvatar;
            } else {
              const commenterChatByName = Object.values(state.chats).find(c => !c.isGroup && c.name === commenterName);
              if (commenterChatByName) {
                commenterAvatar = commenterChatByName.settings.aiAvatar;
              } else {
                // 优先使用自定义头像
                const customAvatar = getNpcAvatarForCharacter(commenterName);
                if (customAvatar) {
                  commenterAvatar = customAvatar;
                } else if (comment.avatar_prompt && state.globalSettings.doubanEnableAiAvatar !== false) {
                  commenterAvatar = getPollinationsImageUrl(comment.avatar_prompt);
                }
              }
            }
          }

          commenterAvatarMap.set(commenterName, commenterAvatar);
        }

        const commentEl = document.createElement('div');
        commentEl.className = 'douban-comment-item';
        commentEl.innerHTML = `
                <img src="${commenterAvatar}" class="douban-comment-avatar">
                <div class="douban-comment-body">
                    <div class="douban-comment-author">${commenterName}</div>
                    <div class="douban-comment-text">${comment.text.replace(/\n/g, '<br>')}</div>
                </div>
            `;
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

    const myNickname = state.qzoneSettings.nickname || '我';

    post.comments.push({
      commenter: myNickname,
      text: commentText
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

      const userNickname = state.qzoneSettings.nickname || '我';
      const userPersona = state.chats[Object.keys(state.chats)[0]]?.settings.myPersona || '(未设置)';

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
      const activeCharacterIds = state.globalSettings.doubanActiveCharacterIds || [];
      activeCharacterIds.forEach(charId => {
        const c = state.chats[charId];
        if (c) {
          const longTermMemory = c.longTermMemory && c.longTermMemory.length > 0 ? c.longTermMemory.map(m => m.content).join('; ') : '无';
          const recentHistory = c.history.slice(-10).map(msg => `${msg.role === 'user' ? userNickname : c.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
          charactersContext += `\n- ${c.name}: ${c.settings.aiPersona.substring(0, 50)}... [记忆: ${longTermMemory}] [最近对话: ${recentHistory}]`;
        }
      });
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
${post.comments.map(c => `- ${c.commenter}: ${c.text}`).join('\n')}

${existingNpcContext}

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
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);
      const cleanedJson = aiResponseContent.replace(/^```json\s*/, '').replace(/```$/, '');
      const newComments = JSON.parse(cleanedJson);

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



  async function openDoubanCastSelector() {
    const modal = document.getElementById('douban-cast-modal');
    const listEl = document.getElementById('douban-cast-list');
    listEl.innerHTML = '';

    const allCharacters = Object.values(state.chats).filter(c => !c.isGroup);

    const activeIds = new Set(state.globalSettings.doubanActiveCharacterIds || []);

    if (allCharacters.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color:#8a8a8a; padding: 50px 0;">还没有可以参与的角色。</p>';
    } else {
      allCharacters.forEach(char => {
        const item = document.createElement('div');
        item.className = 'contact-picker-item';
        item.innerHTML = `
                <input type="checkbox" class="douban-cast-checkbox" data-chat-id="${char.id}" ${activeIds.has(char.id) ? 'checked' : ''} style="margin-right: 15px;">
                <img src="${char.settings.aiAvatar || defaultAvatar}" class="avatar">
                <span class="name">${char.name}</span>
            `;
        listEl.appendChild(item);
      });
    }
    modal.classList.add('visible');
  }


  async function saveDoubanCastSelection() {
    const selectedCheckboxes = document.querySelectorAll('#douban-cast-list .douban-cast-checkbox:checked');
    const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.chatId);


    state.globalSettings.doubanActiveCharacterIds = selectedIds;
    await db.globalSettings.put(state.globalSettings);

    document.getElementById('douban-cast-modal').classList.remove('visible');


    await handleGenerateDoubanPosts();
  }



  document.getElementById('douban-cast-select-btn').addEventListener('click', openDoubanCastSelector);
  document.getElementById('cancel-douban-cast-btn').addEventListener('click', () => {
    document.getElementById('douban-cast-modal').classList.remove('visible');
  });
  document.getElementById('save-douban-cast-btn').addEventListener('click', saveDoubanCastSelection);

  document.getElementById('douban-cast-list').addEventListener('click', (e) => {
    const item = e.target.closest('.contact-picker-item');
    if (item) {
      const checkbox = item.querySelector('.douban-cast-checkbox');
      if (checkbox && e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
      }
    }
  });


  function openDoubanSettingsModal() {
    const modal = document.getElementById('douban-settings-modal');


    document.getElementById('douban-min-posts-input').value = state.globalSettings.doubanMinPosts || 12;
    document.getElementById('douban-max-posts-input').value = state.globalSettings.doubanMaxPosts || 20;
    document.getElementById('douban-enable-ai-avatar-checkbox').checked = state.globalSettings.doubanEnableAiAvatar !== false;

    modal.classList.add('visible');
  }


  async function saveDoubanSettings() {
    const minInput = document.getElementById('douban-min-posts-input');
    const maxInput = document.getElementById('douban-max-posts-input');
    const enableAiAvatarCheckbox = document.getElementById('douban-enable-ai-avatar-checkbox');

    const min = parseInt(minInput.value);
    const max = parseInt(maxInput.value);


    if (isNaN(min) || isNaN(max) || min < 1 || max < 1) {
      alert("请输入有效的正整数！");
      return;
    }
    if (min > max) {
      alert("最小帖子数不能大于最大帖子数！");
      return;
    }


    state.globalSettings.doubanMinPosts = min;
    state.globalSettings.doubanMaxPosts = max;
    state.globalSettings.doubanEnableAiAvatar = enableAiAvatarCheckbox.checked;
    await db.globalSettings.put(state.globalSettings);


    document.getElementById('douban-settings-modal').classList.remove('visible');
    await showCustomAlert('保存成功', '豆瓣设置已更新！下次重新生成时将生效。');
  }

  // ========== 自定义小组管理功能 ==========
  let editingGroupId = null;

  // ========== NPC头像管理功能 ==========
  let selectedNpcAvatars = new Set();

  async function openNpcAvatarsModal() {
    const modal = document.getElementById('npc-avatars-modal');
    await renderNpcAvatarsList();
    modal.classList.add('visible');
  }

  async function renderNpcAvatarsList() {
    const grid = document.getElementById('npc-avatars-grid');
    const npcAvatars = state.globalSettings.npcAvatars || [];
    
    if (npcAvatars.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #999; padding: 40px;">暂无自定义NPC头像<br>点击上方按钮添加</div>';
      return;
    }

    grid.innerHTML = npcAvatars.map((avatar, index) => `
      <div class="npc-avatar-item" data-index="${index}" style="position: relative; cursor: pointer;">
        <input type="checkbox" class="npc-avatar-checkbox" data-index="${index}" 
          style="position: absolute; top: 5px; left: 5px; z-index: 10; width: 18px; height: 18px; cursor: pointer;"
          ${selectedNpcAvatars.has(index) ? 'checked' : ''}>
        <img src="${avatar}" alt="NPC头像" 
          style="width: 100%; height: 100px; object-fit: cover; border-radius: 8px; border: 2px solid #ddd;">
      </div>
    `).join('');

    // 绑定复选框事件
    document.querySelectorAll('.npc-avatar-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        if (e.target.checked) {
          selectedNpcAvatars.add(index);
        } else {
          selectedNpcAvatars.delete(index);
        }
        updateNpcAvatarDeleteButton();
      });
    });

    updateNpcAvatarDeleteButton();
  }

  function updateNpcAvatarDeleteButton() {
    const deleteBtn = document.getElementById('delete-selected-npc-avatars-btn');
    if (selectedNpcAvatars.size > 0) {
      deleteBtn.style.display = 'block';
      deleteBtn.textContent = `删除选中 (${selectedNpcAvatars.size})`;
    } else {
      deleteBtn.style.display = 'none';
    }
  }

  async function addNpcAvatarFromURL() {
    const url = await showCustomPrompt('添加NPC头像', '请输入头像图片URL：', '', 'text');
    if (!url) return;

    if (!state.globalSettings.npcAvatars) {
      state.globalSettings.npcAvatars = [];
    }

    state.globalSettings.npcAvatars.push(url);
    await db.globalSettings.put(state.globalSettings);
    await renderNpcAvatarsList();
    showToast('头像添加成功', 'success');
  }

  async function addNpcAvatarFromLocal() {
    const input = document.getElementById('npc-avatar-local-input');
    input.click();
  }

  async function handleNpcAvatarLocalUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        try {
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          if (!state.globalSettings.npcAvatars) {
            state.globalSettings.npcAvatars = [];
          }

          state.globalSettings.npcAvatars.push(base64);
          successCount++;
        } catch (error) {
          console.error(`上传文件 ${file.name} 失败:`, error);
          failCount++;
        }
      }

      await db.globalSettings.put(state.globalSettings);
      await renderNpcAvatarsList();
      
      if (failCount === 0) {
        showToast(`成功上传 ${successCount} 个头像`, 'success');
      } else {
        showToast(`成功上传 ${successCount} 个，失败 ${failCount} 个`, 'warning');
      }
    } catch (error) {
      console.error('批量上传头像失败:', error);
      showToast('上传失败', 'error');
    }

    // 清空input
    event.target.value = '';
  }

  async function deleteSelectedNpcAvatars() {
    if (selectedNpcAvatars.size === 0) return;

    const confirmed = await showCustomConfirm(
      '确认删除',
      `确定要删除选中的 ${selectedNpcAvatars.size} 个头像吗？`,
      { confirmText: '删除', cancelText: '取消' }
    );

    if (!confirmed) return;

    const npcAvatars = state.globalSettings.npcAvatars || [];
    const indicesToDelete = Array.from(selectedNpcAvatars).sort((a, b) => b - a);
    
    indicesToDelete.forEach(index => {
      npcAvatars.splice(index, 1);
    });

    state.globalSettings.npcAvatars = npcAvatars;
    await db.globalSettings.put(state.globalSettings);
    
    selectedNpcAvatars.clear();
    await renderNpcAvatarsList();
    showToast('删除成功', 'success');
  }

  function toggleSelectAllNpcAvatars() {
    const selectAllCheckbox = document.getElementById('select-all-npc-avatars');
    const npcAvatars = state.globalSettings.npcAvatars || [];
    
    if (selectAllCheckbox.checked) {
      selectedNpcAvatars.clear();
      npcAvatars.forEach((_, index) => selectedNpcAvatars.add(index));
    } else {
      selectedNpcAvatars.clear();
    }

    renderNpcAvatarsList();
  }

  // 获取NPC头像（用于豆瓣生成）
  function getNpcAvatarForCharacter(npcName) {
    const npcAvatars = state.globalSettings.npcAvatars || [];
    const enableAiAvatar = state.globalSettings.doubanEnableAiAvatar !== false;
    
    // 如果没有自定义头像或开启了AI生图，返回null（使用AI生成）
    if (npcAvatars.length === 0 || enableAiAvatar) {
      return null;
    }

    // 初始化当前批次的头像分配记录
    if (!window.currentDoubanAvatarAssignments) {
      window.currentDoubanAvatarAssignments = {};
    }

    // 如果这个NPC在当前批次已经分配过头像，返回已分配的
    if (window.currentDoubanAvatarAssignments[npcName]) {
      return window.currentDoubanAvatarAssignments[npcName];
    }

    // 获取当前批次已使用的头像
    const usedAvatars = Object.values(window.currentDoubanAvatarAssignments);
    const availableAvatars = npcAvatars.filter(avatar => !usedAvatars.includes(avatar));
    
    // 如果还有未使用的头像，随机选择一个
    if (availableAvatars.length > 0) {
      const selectedAvatar = availableAvatars[Math.floor(Math.random() * availableAvatars.length)];
      window.currentDoubanAvatarAssignments[npcName] = selectedAvatar;
      return selectedAvatar;
    }
    
    // 如果所有头像都被使用了，返回null使用默认头像
    return null;
  }

  // 重置当前批次的头像分配（在生成新帖子时调用）
  function resetDoubanAvatarAssignments() {
    window.currentDoubanAvatarAssignments = {};
  }

  // ========== 自定义小组管理功能 ==========

  async function openCustomGroupsModal() {
    const modal = document.getElementById('custom-groups-modal');
    await renderCustomGroupsList();
    modal.classList.add('visible');
  }

  async function renderCustomGroupsList() {
    const listEl = document.getElementById('custom-groups-list');
    listEl.innerHTML = '';

    // 初始化自定义小组数组（如果不存在）
    if (!state.globalSettings.customDoubanGroups) {
      state.globalSettings.customDoubanGroups = [];
    }

    const groups = state.globalSettings.customDoubanGroups;

    if (groups.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color:#8a8a8a; padding: 50px 0;">暂无自定义小组，点击上方"+ 添加小组"开始创建</p>';
      return;
    }

    groups.forEach((group, index) => {
      const groupItem = document.createElement('div');
      groupItem.className = 'custom-group-item';
      groupItem.style.cssText = `
        background: #f8f9fa;
        border-radius: 12px;
        padding: 15px;
        margin-bottom: 12px;
        border: 2px solid ${group.enabled ? '#4CAF50' : '#ddd'};
      `;

      const promptPreview = group.prompt.length > 60 ? group.prompt.substring(0, 60) + '...' : group.prompt;

      groupItem.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div style="flex: 1;">
            <div style="font-weight: 600; font-size: 15px; color: #333; margin-bottom: 5px;">
              ${group.name}
              ${group.enabled ? '<span style="background: #4CAF50; color: white; font-size: 11px; padding: 2px 8px; border-radius: 10px; margin-left: 8px;">已启用</span>' : '<span style="background: #999; color: white; font-size: 11px; padding: 2px 8px; border-radius: 10px; margin-left: 8px;">未启用</span>'}
            </div>
            <div style="font-size: 13px; color: #666; line-height: 1.4;">${promptPreview}</div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 10px;">
          <button class="edit-group-btn" data-index="${index}" style="flex: 1; padding: 8px; background: #2196F3; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px;">编辑</button>
          <button class="delete-group-btn" data-index="${index}" style="flex: 1; padding: 8px; background: #f44336; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px;">删除</button>
        </div>
      `;

      listEl.appendChild(groupItem);
    });

    // 绑定编辑按钮事件
    listEl.querySelectorAll('.edit-group-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        openEditGroupModal(index);
      });
    });

    // 绑定删除按钮事件
    listEl.querySelectorAll('.delete-group-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const index = parseInt(e.target.dataset.index);
        const group = state.globalSettings.customDoubanGroups[index];
        
        const confirmed = await showCustomConfirm(
          '确认删除？',
          `确定要删除小组"${group.name}"吗？此操作无法恢复！`,
          { confirmButtonClass: 'btn-danger', confirmText: '确认删除' }
        );

        if (confirmed) {
          state.globalSettings.customDoubanGroups.splice(index, 1);
          await db.globalSettings.put(state.globalSettings);
          await renderCustomGroupsList();
          await showCustomAlert('删除成功', '小组已删除');
        }
      });
    });
  }

  function openEditGroupModal(index = null) {
    const modal = document.getElementById('edit-custom-group-modal');
    const titleEl = document.getElementById('edit-group-modal-title');
    const nameInput = document.getElementById('custom-group-name-input');
    const promptInput = document.getElementById('custom-group-prompt-input');
    const enabledInput = document.getElementById('custom-group-enabled-input');

    editingGroupId = index;

    if (index === null) {
      // 添加新小组
      titleEl.textContent = '添加新小组';
      nameInput.value = '';
      promptInput.value = '';
      enabledInput.checked = true;
    } else {
      // 编辑现有小组
      titleEl.textContent = '编辑小组';
      const group = state.globalSettings.customDoubanGroups[index];
      nameInput.value = group.name;
      promptInput.value = group.prompt;
      enabledInput.checked = group.enabled !== false;
    }

    modal.classList.add('visible');
  }

  async function saveEditGroup() {
    const nameInput = document.getElementById('custom-group-name-input');
    const promptInput = document.getElementById('custom-group-prompt-input');
    const enabledInput = document.getElementById('custom-group-enabled-input');

    const name = nameInput.value.trim();
    const prompt = promptInput.value.trim();
    const enabled = enabledInput.checked;

    if (!name) {
      alert('请输入小组名称');
      return;
    }

    if (!prompt) {
      alert('请输入小组提示词');
      return;
    }

    const groupData = { name, prompt, enabled };

    if (!state.globalSettings.customDoubanGroups) {
      state.globalSettings.customDoubanGroups = [];
    }

    if (editingGroupId === null) {
      // 添加新小组
      state.globalSettings.customDoubanGroups.push(groupData);
    } else {
      // 更新现有小组
      state.globalSettings.customDoubanGroups[editingGroupId] = groupData;
    }

    await db.globalSettings.put(state.globalSettings);

    document.getElementById('edit-custom-group-modal').classList.remove('visible');
    await renderCustomGroupsList();
    await showCustomAlert('保存成功', editingGroupId === null ? '小组已添加' : '小组已更新');
  }
  // ========== 自定义小组管理功能结束 ==========


  async function openDeleteDoubanPostsModal() {
    const modal = document.getElementById('delete-douban-posts-modal');
    const listEl = document.getElementById('delete-douban-posts-list');
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
      const character = state.chats[post.authorId];
      if (character) {
        authorAvatar = character.settings.aiAvatar;
      } else if (post.authorId === 'user') {
        authorAvatar = state.qzoneSettings.avatar;
      }

      const postContent = post.content.length > 50 ? post.content.substring(0, 50) + '...' : post.content;
      const timeStr = formatTimeAgo(post.timestamp);

      item.innerHTML = `
        <div class="checkbox"></div>
        <div style="flex: 1; display: flex; align-items: center; gap: 10px;">
          <img src="${authorAvatar}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 500; font-size: 14px; margin-bottom: 2px;">${post.postTitle}</div>
            <div style="font-size: 12px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${postContent}</div>
            <div style="font-size: 11px; color: #bbb; margin-top: 2px;">${post.authorName} · ${timeStr}</div>
          </div>
        </div>
      `;
      listEl.appendChild(item);
    });

    // 重置全选状态
    document.getElementById('select-all-douban-posts').checked = false;

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

      // 如果当前在豆瓣页面，刷新列表
      if (state.currentScreen === 'douban-screen') {
        await renderDoubanScreen();
      }

      await showCustomAlert('操作成功', `已删除 ${postIds.length} 个豆瓣帖子。`);

    } catch (error) {
      console.error("删除豆瓣帖子失败:", error);
      alert("删除失败，请稍后再试。");
    }
  }

  // ========== 全局暴露 ==========
  window.openDoubanPostDetail = openDoubanPostDetail;
  window.openDoubanSettingsModal = openDoubanSettingsModal;
  window.openDeleteDoubanPostsModal = openDeleteDoubanPostsModal;
  window.renderDoubanScreen = renderDoubanScreen;
  window.saveDoubanSettings = saveDoubanSettings;
  window.addNpcAvatarFromURL = addNpcAvatarFromURL;
  window.addNpcAvatarFromLocal = addNpcAvatarFromLocal;
  window.handleNpcAvatarLocalUpload = handleNpcAvatarLocalUpload;
  window.deleteSelectedNpcAvatars = deleteSelectedNpcAvatars;
  window.toggleSelectAllNpcAvatars = toggleSelectAllNpcAvatars;
  window.handleGenerateDoubanPosts = handleGenerateDoubanPosts;
  window.handleConfirmDeleteDoubanPosts = handleConfirmDeleteDoubanPosts;
  window.handleDoubanWaitReply = handleDoubanWaitReply;
  window.handleSendDoubanComment = handleSendDoubanComment;
  window.openNpcAvatarsModal = openNpcAvatarsModal;
  window.openCustomGroupsModal = openCustomGroupsModal;
  window.openEditGroupModal = openEditGroupModal;
  window.saveEditGroup = saveEditGroup;

  // ========== 从 script.js 迁移：handleConfirmClearPosts ==========
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
