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

  // ========== 豆瓣多选相关状态 ==========
  let isDoubanSelectMode = false;
  let selectedDoubanPosts = new Set();
  
  let isDoubanDetailSelectMode = false;
  let selectedDoubanComments = new Set();
  let doubanRenderVersion = 0;

  function toggleDoubanSelectMode() {
    isDoubanSelectMode = !isDoubanSelectMode;
    const listEl = document.getElementById('douban-posts-list');
    const actionBar = document.getElementById('douban-action-bar');
    const selectBtn = document.getElementById('douban-select-btn');
    
    if (isDoubanSelectMode) {
      listEl.classList.add('selection-mode');
      actionBar.style.display = 'flex';
      selectBtn.style.display = 'none';
      selectedDoubanPosts.clear();
      const selectAllCb = document.getElementById('select-all-douban-checkbox');
      if (selectAllCb) selectAllCb.checked = false;
      updateDoubanForwardButton();
    } else {
      listEl.classList.remove('selection-mode');
      actionBar.style.display = 'none';
      selectBtn.style.display = 'block';
      selectedDoubanPosts.clear();
      document.querySelectorAll('.douban-post-item.selected').forEach(el => el.classList.remove('selected'));
    }
  }

  function toggleDoubanDetailSelectMode() {
    isDoubanDetailSelectMode = !isDoubanDetailSelectMode;
    const commentsListEl = document.getElementById('douban-detail-comments-list');
    const actionBar = document.getElementById('douban-detail-action-bar');
    const selectBtn = document.getElementById('douban-detail-select-btn');
    const postBody = document.getElementById('douban-post-detail-body');
    
    if (isDoubanDetailSelectMode) {
      if(commentsListEl) commentsListEl.classList.add('selection-mode');
      if(postBody) postBody.classList.add('selection-mode');
      actionBar.style.display = 'flex';
      selectBtn.style.display = 'none';
      selectedDoubanComments.clear();
      const selectAllCb = document.getElementById('select-all-douban-detail-checkbox');
      if (selectAllCb) selectAllCb.checked = false;
      updateDoubanDetailForwardButton();
    } else {
      if(commentsListEl) commentsListEl.classList.remove('selection-mode');
      if(postBody) postBody.classList.remove('selection-mode');
      actionBar.style.display = 'none';
      selectBtn.style.display = 'block';
      selectedDoubanComments.clear();
      document.querySelectorAll('.douban-comment-item.selected, #douban-post-detail-body.selected').forEach(el => el.classList.remove('selected'));
    }
  }

  function updateDoubanForwardButton() {
    const btn = document.getElementById('forward-selected-douban-btn');
    const deleteBtn = document.getElementById('delete-selected-douban-btn');
    if (btn) {
      btn.textContent = `转发 (${selectedDoubanPosts.size})`;
      btn.disabled = selectedDoubanPosts.size === 0;
    }
    if (deleteBtn) {
      deleteBtn.textContent = `删除 (${selectedDoubanPosts.size})`;
      deleteBtn.disabled = selectedDoubanPosts.size === 0;
    }
  }
  
  function updateDoubanDetailForwardButton() {
    const btn = document.getElementById('forward-selected-douban-detail-btn');
    const deleteBtn = document.getElementById('delete-selected-douban-detail-btn');
    if (btn) {
      btn.textContent = `转发 (${selectedDoubanComments.size})`;
      btn.disabled = selectedDoubanComments.size === 0;
    }
    if (deleteBtn) {
      deleteBtn.textContent = `删除 (${selectedDoubanComments.size})`;
      deleteBtn.disabled = selectedDoubanComments.size === 0;
    }
  }

  async function renderDoubanScreen() {
    const renderVersion = ++doubanRenderVersion;
    const listEl = document.getElementById('douban-posts-list');
    listEl.innerHTML = '';

    const posts = await db.doubanPosts.orderBy('timestamp').reverse().toArray();
    if (renderVersion !== doubanRenderVersion) return;

    if (posts.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">这里空空如也，<br>点击右上角刷新按钮，看看大家都在聊什么吧！</p>';
      return;
    }

    posts.forEach(post => {
      if (renderVersion !== doubanRenderVersion) return;
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


      if (post.authorAvatar) avatarUrl = post.authorAvatar;
      const itemEl = document.createElement('div');
      itemEl.className = 'douban-post-item';
      itemEl.dataset.postId = post.id;
      itemEl.onclick = (e) => {
        if (isDoubanSelectMode) {
          e.preventDefault();
          e.stopPropagation();
          const checkbox = itemEl.querySelector('.douban-checkbox');
          if (checkbox) {
             const isSelected = itemEl.classList.contains('selected');
             if (isSelected) {
               itemEl.classList.remove('selected');
               selectedDoubanPosts.delete(post.id);
             } else {
               itemEl.classList.add('selected');
               selectedDoubanPosts.add(post.id);
             }
             updateDoubanForwardButton();
             const selectAllCb = document.getElementById('select-all-douban-checkbox');
             if (selectAllCb) {
                selectAllCb.checked = document.querySelectorAll('.douban-post-item').length === selectedDoubanPosts.size;
             }
          }
        } else {
          openDoubanPostDetail(post.id);
        }
      };

      itemEl.innerHTML = `
            <div class="douban-checkbox" style="display: none;"></div>
            <div style="flex: 1; min-width: 0;">
            <div class="douban-post-header">
                <img src="${escapeHTML(avatarUrl || '')}" class="douban-post-avatar" onerror="this.onerror=null; this.src=defaultAvatar;">
                <div class="douban-author-info">
                    <div class="douban-author-name">${escapeHTML(post.authorName || '')}</div>
                    <div class="douban-group-name">来自 ${escapeHTML(post.groupName || '')}</div>
                </div>
            </div>
            <div class="douban-post-title">${escapeHTML(post.postTitle || '')}</div>
            <div class="douban-post-content">${escapeHTML(post.content || '').replace(/\n/g, '<br>')}</div>
            <div class="douban-post-footer">
                 <div class="douban-post-actions">
                    <span class="douban-action-likes"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"></path><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.5L12 3a2 2 0 0 1 3 2.88z"></path></svg> <span>${post.likesCount}</span></span>
                    <span class="douban-action-comments"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> <span>${post.commentsCount}</span></span>
                </div>
                <span class="douban-post-timestamp">${formatTimeAgo(post.timestamp)}</span>
            </div>
            </div>
        `;
      listEl.appendChild(itemEl);
    });
  }



  async function handleGenerateDoubanPosts(isIncremental = false) {
    const activeCharacterIds = state.globalSettings.doubanActiveCharacterIds || [];

    if (activeCharacterIds.length === 0) {
      await showCustomAlert("请先选择角色", "请点击右上角的\u201C角色选择\u201D按钮，选择至少一个参与豆瓣互动的角色。");
      return;
    }

    // 重置当前批次的头像分配
    resetDoubanAvatarAssignments();

    const loadingMsg = isIncremental ? `正在为您选择的 ${activeCharacterIds.length} 位角色追加生成豆瓣动态...` : `正在为您选择的 ${activeCharacterIds.length} 位角色生成豆瓣动态...`;
    await showCustomAlert("请稍候...", loadingMsg);

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

    const userNickname = state.globalSettings.doubanUserNickname || state.qzoneSettings.nickname || '我';
    
    // --- 动态拼接豆瓣人设 ---
    let userPersona = '(未设置)';
    const activePersonaIds = state.globalSettings.doubanActivePersonaIds || [];
    if (activePersonaIds.length > 0 && state.personaPresets) {
        const selectedPersonas = state.personaPresets.filter(p => activePersonaIds.includes(p.id));
        if (selectedPersonas.length > 0) {
            userPersona = selectedPersonas[0].persona;
        }
    } else if (activeCharacterIds.length > 0 && state.chats[activeCharacterIds[0]]) {
        // 后备：如果没有选择人设，使用原来的逻辑
        userPersona = state.chats[activeCharacterIds[0]].settings.myPersona || '(未设置)';
    }

    let charactersContext = '';
    for (const charId of activeCharacterIds) {
      const c = state.chats[charId];
      if (c) {
        const longTermMemory = getMemoryContextForPrompt(c) || '无';
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
    }
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
            ...(state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined ? { top_p: state.globalSettings.apiTopP } : {}),
            ...(state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens !== undefined ? { max_tokens: state.globalSettings.apiMaxTokens } : {}),
            ...(state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined ? { presence_penalty: state.globalSettings.apiPresencePenalty } : {}),
            ...(state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined ? { frequency_penalty: state.globalSettings.apiFrequencyPenalty } : {})
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      let simulatedPosts;
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
        simulatedPosts = JSON.parse(textToParse.trim());
      } catch (parseError) {
        throw new Error(`解析JSON失败: ${parseError.message}\n原始返回内容: ${aiResponseContent}`);
      }

      if (!isIncremental) {
        await db.doubanPosts.clear();
      }
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
