// ========== 后台活动模块 ==========
// 来源：script.js 第 21043~21384, 37449~37788, 47205~47250 行
// 功能：后台模拟活动、NPC行动生成、后台保活、页面可见性处理
// 包含：startBackgroundSimulation, stopBackgroundSimulation, runBackgroundSimulationTick,
//       generateNpcActions, simulateBackgroundActivity, initializeBackgroundKeepAlive,
//       startBackgroundKeepAlive, stopBackgroundKeepAlive, handleVisibilityChange,
//       bindBackgroundKeepAliveEvents, loadBackgroundKeepAliveSettings

  function startBackgroundSimulation() {
    if (simulationIntervalId) return;
    const intervalSeconds = state.globalSettings.backgroundActivityInterval || 60;

    simulationIntervalId = setInterval(runBackgroundSimulationTick, intervalSeconds * 1000);
    playSilentAudio();
  }

  function stopBackgroundSimulation() {
    if (simulationIntervalId) {
      clearInterval(simulationIntervalId);
      simulationIntervalId = null;
    }
    stopSilentAudio();
  }




  async function runBackgroundSimulationTick() {
    console.log("模拟器心跳 Tick...");
    if (!state.globalSettings.enableBackgroundActivity) {
      stopBackgroundSimulation();
      return;
    }


    const allSingleChats = Object.values(state.chats).filter(chat => !chat.isGroup);
    allSingleChats.forEach(chat => {
      if (chat.relationship?.status === 'blocked_by_user') {
        const blockedTimestamp = chat.relationship.blockedTimestamp;
        if (!blockedTimestamp) return;
        const blockedDuration = Date.now() - blockedTimestamp;
        const cooldownMilliseconds = (state.globalSettings.blockCooldownHours || 1) * 60 * 60 * 1000;
        if (blockedDuration > cooldownMilliseconds) {
          chat.relationship.status = 'pending_system_reflection';
          triggerAiFriendApplication(chat.id);
        }
      } else if (chat.relationship?.status === 'friend' && chat.id !== state.activeChatId) {
        if (chat.settings.enableBackgroundActivity === false) {
          console.log(`角色 "${chat.name}" 的独立后台活动开关已关闭，本次跳过。`);
          return;
        }
        if (Math.random() < 0.20) {
          console.log(`角色 "${chat.name}" 被唤醒，准备独立行动...`);
          triggerInactiveAiAction(chat.id);
        }
        // 检查是否可以帮助用户清空购物车
        checkAndClearShoppingCart(chat.id);
        // 情侣空间 AI 自主决定模式 - 后台触发
        if (typeof triggerCoupleSpaceAiDecide === 'function') {
          try { triggerCoupleSpaceAiDecide(chat.id, 'background'); } catch(e) {}
        }
      }
    });


    const allGroupChats = Object.values(state.chats).filter(chat => chat.isGroup);
    allGroupChats.forEach(chat => {
      if (chat.settings.enableBackgroundActivity === false) {
        console.log(`群聊 "${chat.name}" 的后台活动开关已关闭，本次跳过。`);
        return;
      }
      if (chat.id !== state.activeChatId && Math.random() < 0.10) {
        console.log(`群聊 "${chat.name}" 被唤醒，准备独立行动...`);
        triggerGroupAiAction(chat.id);
      }
    });



    try {
      const allNpcs = await db.npcs.toArray();
      if (allNpcs.length === 0) return;

      const allRecentPosts = await db.qzonePosts.orderBy('timestamp').reverse().limit(10).toArray();

      for (const npc of allNpcs) {
        if (npc.enableBackgroundActivity === false) continue;
        const cooldownMinutes = npc.actionCooldownMinutes || 15;
        if (npc.lastActionTimestamp) {
          const minutesSinceLastAction = (Date.now() - npc.lastActionTimestamp) / (1000 * 60);
          if (minutesSinceLastAction < cooldownMinutes) {
            continue;
          }
        }
        if (Math.random() > 0.3) continue;


        const tasks = [];
        for (const post of allRecentPosts) {

          if (post.authorId === `npc_${npc.id}`) continue;


          const isRepliedTo = post.comments?.some(c => c.replyTo === npc.name);


          const lastCommenter = post.comments?.slice(-1)[0]?.commenterName;
          if (lastCommenter === npc.name) continue;

          let isVisible = false;


          if (post.authorId === 'user' || post.authorId.startsWith('chat_')) {
            if (npc.associatedWith.includes(post.authorId)) {
              isVisible = true;
            }
          } else if (post.authorId.startsWith('npc_')) {
            const authorNpcId = parseInt(post.authorId.replace('npc_', ''));
            const authorNpc = await db.npcs.get(authorNpcId);


            if (authorNpc) {
              const npc1_group = npc.npcGroupId;
              const npc2_group = authorNpc.npcGroupId;


              if (npc1_group && npc2_group && npc1_group === npc2_group) {
                isVisible = true;
              }
            }
          }

          if (isVisible || isRepliedTo) {
            tasks.push(post);
          }
        }



        if (tasks.length > 0 || Math.random() < 0.2) {
          console.log(`NPC "${npc.name}" 触发行动决策...`);
          const generatedActions = await generateNpcActions(npc, tasks);

          if (generatedActions && generatedActions.length > 0) {
            for (const action of generatedActions) {
              if (action.type === 'qzone_comment') {

                const post = await db.qzonePosts.get(action.postId);
                if (post) {
                  if (!post.comments) post.comments = [];
                  post.comments.push({
                    commenterName: npc.name,
                    text: action.commentText,
                    replyTo: action.replyTo || null,
                    timestamp: Date.now() + Math.random()
                  });
                  await db.qzonePosts.update(action.postId, {
                    comments: post.comments
                  });
                  updateUnreadIndicator(unreadPostsCount + 1);
                }
              } else if (action.type === 'qzone_post') {

                const newPost = {
                  type: action.postType || 'shuoshuo',
                  content: action.content,
                  timestamp: Date.now(),
                  authorId: `npc_${npc.id}`,
                  authorOriginalName: npc.name,
                  visibleTo: npc.associatedWith,
                  likes: [],
                  comments: [],
                  isDeleted: false
                };
                await db.qzonePosts.add(newPost);
                console.log(`NPC "${npc.name}" 成功发布了一条新动态。`);
                updateUnreadIndicator(unreadPostsCount + 1);
              }
            }
            await db.npcs.update(npc.id, {
              lastActionTimestamp: Date.now()
            });
            if (document.getElementById('qzone-screen').classList.contains('active')) {
              await renderQzonePosts();
            }
          }
        }
      }
    } catch (error) {
      console.error("处理NPC后台活动时出错:", error);
    }
  }

  async function generateNpcActions(npc, tasks) {
    // 优先使用后台API，如果未配置则使用主API
    const useBackgroundApi = state.apiConfig.backgroundProxyUrl && state.apiConfig.backgroundApiKey && state.apiConfig.backgroundModel;
    const {
      proxyUrl,
      apiKey,
      model
    } = useBackgroundApi
      ? {
          proxyUrl: state.apiConfig.backgroundProxyUrl,
          apiKey: state.apiConfig.backgroundApiKey,
          model: state.apiConfig.backgroundModel
        }
      : state.apiConfig;
    
    if (!proxyUrl || !apiKey || !model) {
      console.error("NPC行动失败：API未配置。");
      return null;
    }


    let charactersContext = "# 你的互动对象 (用户和其他角色)\n";
    const userNickname = state.qzoneSettings.nickname || '我';
    const userPersona = state.chats[Object.keys(state.chats)[0]]?.settings.myPersona || '(未设置)';
    charactersContext += `- **${userNickname} (用户)**: ${userPersona}\n`;
    if (npc.associatedWith && npc.associatedWith.length > 0) {
      npc.associatedWith.forEach(charId => {
        const char = state.chats[charId];
        if (char && !char.isGroup) {
          charactersContext += `- **${char.name} (本名: ${char.originalName})**: ${char.settings.aiPersona}\n`;
        }
      });
    }

    const tasksString = (await Promise.all(tasks.map(async post => {
      let authorDisplayName = '未知作者';
      if (post.authorId === 'user') {
        authorDisplayName = state.qzoneSettings.nickname || '用户';
      } else if (post.authorId.startsWith('chat_')) {
        authorDisplayName = getDisplayNameByOriginalName(post.authorOriginalName || post.authorId);
      } else if (post.authorId.startsWith('npc_')) {
        const authorNpcId = parseInt(post.authorId.replace('npc_', ''));
        const authorNpc = await db.npcs.get(authorNpcId);
        if (authorNpc) {
          authorDisplayName = authorNpc.name;
        }
      }

      const commentsString = (post.comments || [])
        .map(c => {
          if (typeof c === 'object' && c.commenterName) {
            const commenterDisplayName = getDisplayNameByOriginalName(c.commenterName);
            return `- **${commenterDisplayName}**: ${c.text}`;
          }
          return `- ${c}`;
        }).join('\n');
      return `
---
### 帖子ID: ${post.id}
- **作者**: ${authorDisplayName}
- **内容摘要**: ${(post.content || post.publicText || '').substring(0, 150)}...
- **已有评论**:
${commentsString || '(暂无评论)'}
---
`;
    }))).join('\n');





    const npcAuthorId = `npc_${npc.id}`;
    const twelveHoursAgo = Date.now() - (12 * 60 * 60 * 1000);
    const recentNpcPosts = await db.qzonePosts
      .where('authorId').equals(npcAuthorId)
      .and(post => post.timestamp > twelveHoursAgo)
      .toArray();


    let postingCooldownInstruction = '';
    if (recentNpcPosts.length > 0) {
      postingCooldownInstruction = `
# 【行为倾向指令 (高优先级)】
**你最近已经发布过动态了。** 为了让社区互动更自然，你本次行动的【唯一任务】就是**评论**或**回复**下面"待处理的帖子列表"中的内容。
你【绝对禁止】再次发布新动态，除非你收到了直接的指令或有一个对剧情发展至关重要的、紧急的新想法。
`;
    }


    const systemPrompt = `
# 你的任务
你是一个虚拟社区的AI。你的核心任务是扮演角色"${npc.name}"，并根据其人设，通过【发布新动态】或【评论/回复帖子】来参与社区互动。

${postingCooldownInstruction}

# 核心规则
1.  **【角色扮演】**: 你的所有行为都【必须】严格符合你的角色设定。
2.  **【互动逻辑】**: 你的首要任务是检查"待处理的帖子列表"。如果列表中有你可以回应的帖子（特别是那些有新评论或提到你的），你【必须】优先进行评论或回复，而不是发布新动态。
3.  **【格式铁律 (最高优先级)】**: 
    -   你的回复【必须且只能】是一个JSON数组格式的字符串。
    -   数组中可以包含【一个或多个】行动对象。
    -   每个行动对象的格式【必须】是以下两种之一：
      -   **发布新动态**: \`{"type": "qzone_post", "postType": "shuoshuo", "content": "你的新动态内容。"}\`
      -   **发表评论**: \`{"type": "qzone_comment", "postId": 123, "commentText": "你的新评论内容。"}\` 或 \`{"type": "qzone_comment", "postId": 123, "replyTo": "被回复者的【本名】", "commentText": "你的回复内容。"}\`
4.  **【行为组合指南】**:
    -   你可以自由组合不同的行动，例如，先发布一条自己的动态，再去评论别人的动态。
    -   为了模拟真实行为，你本次生成的行动数量建议在【1到3个】之间。

# 你的角色设定
- **昵称**: ${npc.name}
- **人设**: ${npc.persona}

${charactersContext} 

# 待处理的帖子列表 (如果你选择评论)
${tasksString}

现在，请严格遵守所有规则，选择并执行你的行动。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，开始你的行动。"
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
            temperature: state.globalSettings.apiTemperature || 0.9
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch) throw new Error("AI返回的行动中未找到有效的JSON数组。");

      return JSON.parse(jsonMatch[0]);

    } catch (error) {
      console.error(`为NPC "${npc.name}" 生成行动失败:`, error);
      return null;
    }
  }



  // ========== 后台保活功能开始 ==========

  let keepAliveInterval = null;
  let keepAliveAudio = null;
  let wakeLock = null;
  let keepAliveWorker = null;
  let keepAliveSharedWorker = null;
  let keepAliveBroadcast = null;
  let keepAliveAnimationFrame = null;
  let keepAliveAudioContext = null;
  let keepAliveMultiTimers = [];
  let keepAliveWebRTC = null;
  let keepAliveAudioPlayer = null; // 用于显示的音频播放器

  // 初始化后台保活
  async function initializeBackgroundKeepAlive() {
    if (!state.globalSettings.backgroundKeepAlive) {
      state.globalSettings.backgroundKeepAlive = {
        enabled: false
      };
    }
  }

  // 启动后台保活
  async function startBackgroundKeepAlive() {
    console.log('[后台保活] 启动后台保活（音频播放器模式）...');

    // 显示保活音频配置按钮
    const audioBtnContainer = document.getElementById('keep-alive-audio-btn-container');
    if (audioBtnContainer) {
      audioBtnContainer.style.display = 'flex';
    }

    // 监听页面可见性变化（用于音频恢复）
    // ★ 先移除再添加，防止叠加
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    updateKeepAliveStatus('运行中（音频播放器）');
    console.log('[后台保活] ✅ 后台保活已启动');
    console.log('[后台保活] 💪 使用音频播放器进行强力保活');
  }

  // 停止后台保活
  function stopBackgroundKeepAlive() {
    console.log('[后台保活] 停止后台保活...');

    // 停止音频播放器并隐藏按钮
    const audioBtnContainer = document.getElementById('keep-alive-audio-btn-container');
    const audioPlayer = document.getElementById('keep-alive-audio-player');
    const audioModal = document.getElementById('keep-alive-audio-modal');

    if (audioPlayer && keepAliveAudioPlayer) {
      try {
        const oldSrc = audioPlayer.src;
        audioPlayer.pause();
        audioPlayer.src = '';
        // 释放URL对象（如果是blob URL）
        if (oldSrc && oldSrc.startsWith('blob:')) {
          URL.revokeObjectURL(oldSrc);
        }
        keepAliveAudioPlayer = null;
        console.log('[后台保活] 保活音频已停止');
      } catch (error) {
        console.warn('[后台保活] 停止保活音频失败:', error);
      }
    }

    if (audioBtnContainer) {
      audioBtnContainer.style.display = 'none';
    }

    if (audioModal) {
      audioModal.style.display = 'none';
    }

    // 移除事件监听
    document.removeEventListener('visibilitychange', handleVisibilityChange);

    updateKeepAliveStatus('未启用');
    console.log('[后台保活] ✅ 后台保活已停止');
  }

  // 处理页面可见性变化
  // 页面可见性变化处理（简化版）
  async function handleVisibilityChange() {
    if (document.hidden) {
      console.log('[后台保活] 🔄 页面进入后台');
    } else {
      console.log('[后台保活] ✅ 页面返回前台');
      
      // 页面返回前台时，重新播放用户配置的保活音频
      if (state.globalSettings.backgroundKeepAlive?.enabled && keepAliveAudioPlayer && keepAliveAudioPlayer.src) {
        try {
          await keepAliveAudioPlayer.play();
          console.log('[后台保活] 保活音频已重新播放');
        } catch (error) {
          console.warn('[后台保活] 重新播放保活音频失败:', error);
        }
      }
    }
  }

  // 空的处理函数（保留以避免事件监听器错误）
  function handleStorageChange(event) {}
  function handlePageFreeze() {}
  function handlePageResume() {}

  // 更新保活状态显示
  function updateKeepAliveStatus(statusText) {
    const statusElement = document.getElementById('keep-alive-status-text');
    if (statusElement) {
      statusElement.textContent = statusText;

      // 根据状态设置颜色
      if (statusText.includes('运行中')) {
        statusElement.style.color = '#4CAF50';
      } else {
        statusElement.style.color = '#999';
      }
    }
  }

  // 绑定后台保活开关事件
  function bindBackgroundKeepAliveEvents() {
    const keepAliveSwitch = document.getElementById('background-keep-alive-switch');
    const statusDiv = document.getElementById('keep-alive-status');
    const audioBtnContainer = document.getElementById('keep-alive-audio-btn-container');
    const audioBtn = document.getElementById('keep-alive-audio-btn');
    const audioModal = document.getElementById('keep-alive-audio-modal');
    const audioMinimize = document.getElementById('keep-alive-audio-minimize');
    const audioClose = document.getElementById('keep-alive-audio-close');
    const audioFile = document.getElementById('keep-alive-audio-file');
    const audioUrl = document.getElementById('keep-alive-audio-url');
    const audioLoadUrl = document.getElementById('keep-alive-audio-load-url');
    const audioPlayer = document.getElementById('keep-alive-audio-player');

    if (keepAliveSwitch) {
      keepAliveSwitch.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        state.globalSettings.backgroundKeepAlive.enabled = enabled;
        await db.globalSettings.put(state.globalSettings);

        // 显示/隐藏状态和音频按钮容器
        if (statusDiv) {
          statusDiv.style.display = enabled ? 'flex' : 'none';
        }

        if (enabled) {
          await startBackgroundKeepAlive();
          // 恢复之前保存的音频URL
          const savedUrl = state.globalSettings.backgroundKeepAlive.audioUrl;
          if (savedUrl) {
            const ap = document.getElementById('keep-alive-audio-player');
            const au = document.getElementById('keep-alive-audio-url');
            if (ap) {
              ap.src = savedUrl;
              ap.loop = true;
              ap.play().then(() => {
                keepAliveAudioPlayer = ap;
                console.log('[后台保活] 开关开启，已恢复保存的音频URL');
              }).catch(err => {
                console.warn('[后台保活] 恢复音频播放失败:', err);
              });
            }
            if (au) au.value = savedUrl;
          }
        } else {
          stopBackgroundKeepAlive();
        }
      });
    }

    // 打开音频配置面板
    if (audioBtn && audioModal) {
      audioBtn.addEventListener('click', () => {
        audioModal.style.display = 'flex';
      });
    }

    // 最小化音频配置面板（只隐藏弹窗，音频继续播放）
    if (audioMinimize && audioModal) {
      audioMinimize.addEventListener('click', () => {
        audioModal.style.display = 'none';
        console.log('[后台保活] 播放器已最小化，音频继续播放');
      });
    }

    // 关闭音频配置面板（停止音频并隐藏）
    if (audioClose && audioModal && audioPlayer) {
      audioClose.addEventListener('click', async () => {
        // 停止音频播放
        if (keepAliveAudioPlayer) {
          try {
            const oldSrc = audioPlayer.src;
            audioPlayer.pause();
            audioPlayer.src = '';
            // 释放URL对象（如果是blob URL）
            if (oldSrc && oldSrc.startsWith('blob:')) {
              URL.revokeObjectURL(oldSrc);
            }
            keepAliveAudioPlayer = null;
            // 清除保存的音频URL
            if (state.globalSettings.backgroundKeepAlive) {
              delete state.globalSettings.backgroundKeepAlive.audioUrl;
              await db.globalSettings.put(state.globalSettings);
            }
            console.log('[后台保活] 播放器已关闭，音频已停止，已清除保存的URL');
          } catch (error) {
            console.warn('[后台保活] 停止音频失败:', error);
          }
        }
        audioModal.style.display = 'none';
      });
    }

    // 点击背景最小化（只隐藏弹窗，音频继续播放）
    if (audioModal) {
      audioModal.addEventListener('click', (e) => {
        if (e.target === audioModal) {
          audioModal.style.display = 'none';
          console.log('[后台保活] 播放器已最小化，音频继续播放');
        }
      });
    }

    // 处理本地文件上传
    if (audioFile && audioPlayer) {
      audioFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          try {
            // 释放之前的URL
            if (audioPlayer.src && audioPlayer.src.startsWith('blob:')) {
              URL.revokeObjectURL(audioPlayer.src);
            }

            const fileUrl = URL.createObjectURL(file);
            audioPlayer.src = fileUrl;
            audioPlayer.loop = true;
            audioPlayer.play().then(() => {
              keepAliveAudioPlayer = audioPlayer;
              console.log('[后台保活] 本地音频已加载并播放');
            }).catch(err => {
              console.warn('[后台保活] 音频播放失败:', err);
            });
          } catch (error) {
            console.error('[后台保活] 加载本地音频失败:', error);
            alert('加载音频文件失败，请重试');
          }
        }
      });
    }

    // 处理URL加载
    if (audioLoadUrl && audioUrl && audioPlayer) {
      audioLoadUrl.addEventListener('click', async () => {
        const url = audioUrl.value.trim();
        if (!url) {
          alert('请输入音频URL');
          return;
        }

        try {
          // 释放之前的URL
          if (audioPlayer.src && audioPlayer.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioPlayer.src);
          }

          audioPlayer.src = url;
          audioPlayer.loop = true;
          audioPlayer.play().then(async () => {
            keepAliveAudioPlayer = audioPlayer;
            console.log('[后台保活] URL音频已加载并播放');
            // 保存URL到设置中，刷新后可恢复
            state.globalSettings.backgroundKeepAlive.audioUrl = url;
            await db.globalSettings.put(state.globalSettings);
            console.log('[后台保活] 音频URL已保存');
          }).catch(err => {
            console.warn('[后台保活] 音频播放失败:', err);
            alert('音频播放失败，可能是URL无效或跨域问题');
          });
        } catch (error) {
          console.error('[后台保活] 加载URL音频失败:', error);
          alert('加载音频URL失败，请检查URL是否正确');
        }
      });
    }
  }

  // 加载后台保活设置到UI
  function loadBackgroundKeepAliveSettings() {
    const config = state.globalSettings.backgroundKeepAlive;
    if (!config) return;

    const keepAliveSwitch = document.getElementById('background-keep-alive-switch');
    const statusDiv = document.getElementById('keep-alive-status');
    const audioBtnContainer = document.getElementById('keep-alive-audio-btn-container');

    if (keepAliveSwitch) {
      keepAliveSwitch.checked = config.enabled || false;

      if (statusDiv) {
        statusDiv.style.display = config.enabled ? 'flex' : 'none';
      }

      // 如果之前是开启状态，重新启动保活
      if (config.enabled) {
        startBackgroundKeepAlive();

        // 恢复之前保存的音频URL
        if (config.audioUrl) {
          const audioPlayer = document.getElementById('keep-alive-audio-player');
          const audioUrl = document.getElementById('keep-alive-audio-url');
          if (audioPlayer) {
            audioPlayer.src = config.audioUrl;
            audioPlayer.loop = true;
            audioPlayer.play().then(() => {
              keepAliveAudioPlayer = audioPlayer;
              console.log('[后台保活] 已恢复保存的音频URL并播放');
            }).catch(err => {
              console.warn('[后台保活] 恢复音频播放失败（可能需要用户交互）:', err);
            });
          }
          // 恢复URL输入框的值
          if (audioUrl) {
            audioUrl.value = config.audioUrl;
          }
        }
      } else {
        // 如果是关闭状态，确保音频按钮容器隐藏
        if (audioBtnContainer) {
          audioBtnContainer.style.display = 'none';
        }
      }
    }
  }

  // ========== 后台保活功能结束 ==========


  async function simulateBackgroundActivity(minutesOffline) {
    console.log(`检测到应用离线了 ${minutesOffline.toFixed(1)} 分钟，开始模拟后台活动...`);


    const activeCharacters = Object.values(state.chats).filter(chat =>
      !chat.isGroup &&
      chat.settings.enableBackgroundActivity &&
      chat.relationship?.status === 'friend'
    );

    if (activeCharacters.length === 0) {
      console.log("没有配置为后台活跃的角色，跳过模拟。");
      return;
    }


    for (const char of activeCharacters) {

      const cooldownMinutes = char.settings.actionCooldownMinutes || 15;
      const timeSinceLastAction = char.lastActionTimestamp ?
        (Date.now() - char.lastActionTimestamp) / (1000 * 60) :
        Infinity;


      if (minutesOffline > cooldownMinutes && timeSinceLastAction > cooldownMinutes) {



        if (Math.random() < 0.3) {
          console.log(`角色 "${char.name}" 触发了后台行动！`);


          if (Math.random() < 0.7) {

            await triggerInactiveAiAction(char.id);
          } else {

            console.log(`角色 "${char.name}" 决定去发一条动态... (此处为模拟)`);
          }
        }
      }
    }
  }

  // ========== 全局暴露 ==========
  window.simulateBackgroundActivity = simulateBackgroundActivity;
  window.startBackgroundSimulation = startBackgroundSimulation;
  window.stopBackgroundSimulation = stopBackgroundSimulation;
  window.initializeBackgroundKeepAlive = initializeBackgroundKeepAlive;
  window.bindBackgroundKeepAliveEvents = bindBackgroundKeepAliveEvents;
  window.loadBackgroundKeepAliveSettings = loadBackgroundKeepAliveSettings;
