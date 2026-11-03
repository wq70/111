  const directRegenerationPending = new Set();
  async function handleRegenerateResponse() {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;
    if (directRegenerationPending.has(chat.id) || window.GenerationAdjustments?.isBusy(chat.id)) return;
    directRegenerationPending.add(chat.id);
    try {

    const lastUserMsgIndex = chat.history.findLastIndex(msg => msg.role === 'user' && !msg.isHidden);

    if (lastUserMsgIndex === -1) {
      alert("没有可供重新生成回复的用户消息。");
      return;
    }

    const lastAiMsgIndex = chat.history.findLastIndex(msg => msg.role === 'assistant');
    if (lastAiMsgIndex < lastUserMsgIndex) {
      alert("AI 尚未对您的最后一条消息做出回应，无法重新生成。");
      return;
    }

    const previousHistory = chat.history;
    chat.history = chat.history.slice(0, lastUserMsgIndex + 1);
    const regenerationBase = JSON.stringify(chat.history);

    await db.chats.put(chat);
    if (state.activeChatId === chat.id) await renderChatInterface(chat.id);

    await triggerAiResponse({ chatId: chat.id, manual: true });
    // 无配置、停止或请求失败且没有新消息时，恢复被截去的原回复。
    if (JSON.stringify(chat.history) === regenerationBase) {
      chat.history = previousHistory;
      await db.chats.put(chat);
      if (state.activeChatId === chat.id) await renderChatInterface(chat.id);
    }
    } finally { directRegenerationPending.delete(chat.id); }
  }

  async function handleRegenerateCallResponse() {
    if (!videoCallState.isActive) return;

    const lastUserSpeechIndex = videoCallState.callHistory.findLastIndex(msg => msg.role === 'user');

    if (lastUserSpeechIndex === -1) {
      alert("通话中还没有你的发言，无法重新生成回应。");
      return;
    }

    videoCallState.callHistory.splice(lastUserSpeechIndex + 1);

    const callFeed = document.getElementById('video-call-main');
    callFeed.innerHTML = '';
    videoCallState.callHistory.forEach(msg => {
      const bubble = document.createElement('div');

      const speechClass = msg.role === 'assistant' ? 'ai-speech' : 'user-speech';
      bubble.className = `call-message-bubble ${speechClass}`;

      bubble.dataset.timestamp = msg.timestamp;
      if (msg.role === 'user') {
        bubble.textContent = msg.content;
      } else {
        bubble.innerHTML = msg.content;
      }
      addLongPressListener(bubble, () => showCallMessageActions(msg.timestamp));
      callFeed.appendChild(bubble);
    });
    callFeed.scrollTop = callFeed.scrollHeight;

    triggerAiInCallAction(null);
  }

  async function handlePropelAction() {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;
    const chatId = state.activeChatId;

    let thoughtChainContextHead = '';
    let thoughtChainContextMiddle = '';
    if (typeof ThoughtChainManager !== 'undefined' && ThoughtChainManager.enabled) {
        const chunks = ThoughtChainManager.getPayloadChunks();
        thoughtChainContextHead = chunks.head.map(c => c.content).join('\n');
        thoughtChainContextMiddle = chunks.middle.map(c => c.content).join('\n');
    }

    setAvatarActingState(chat.id, true);
    const chatHeaderTitle = document.getElementById('chat-header-title');
    if (!chat.isGroup) {
      chatHeaderTitle.style.opacity = 0;
      setTimeout(() => {
        chatHeaderTitle.textContent = '对方正在输入...';
        chatHeaderTitle.classList.add('typing-status');
        chatHeaderTitle.style.opacity = 1;
      }, 200);
    }

    try {
      const {
        proxyUrl,
        apiKey,
        model
      } = state.apiConfig;
      if (!proxyUrl || !apiKey || !model) {
        throw new Error('API未配置');
      }

      const maxMemory = parseInt(chat.settings.maxMemory) || 10;
      const historySlice = chat.history.filter(m => !m.isExcluded && m.type !== 'thought_chain_block').slice(-maxMemory);
      const filteredHistory = await filterHistoryWithDoNotSendRules(historySlice, chatId);

      const now = new Date();
      const chinaTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (3600000 * 8));
      const perceptionClock = window.TimeAwareness?.getClockInfo?.(chat, now.getTime());
      const currentTime = perceptionClock?.currentTime || chinaTime.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        dateStyle: 'full',
        timeStyle: 'short'
      });
      const timeOfDayGreeting = perceptionClock?.timeOfDayGreeting || getTimeOfDayGreeting(chinaTime);
      const myNickname = chat.settings.myNickname || '我';

      const macroSession = window.PromptMacros?.session();
      const renderMacroEntry = (text, scope) => macroSession ? macroSession.render(text, scope) : Promise.resolve(text);
      const routeObservation = window.ModelRouteObserver?.start(model);
      let worldBookContent = '';
      let allWorldBookIds = [...(chat.settings.linkedWorldBookIds || [])];
      state.worldBooks.forEach(wb => {
        if (wb.isGlobal && !allWorldBookIds.includes(wb.id)) {
          allWorldBookIds.push(wb.id);
        }
      });

      if (allWorldBookIds.length > 0) {
        const linkedContents = (await Promise.all(allWorldBookIds.map(async bookId => {
          const worldBook = state.worldBooks.find(wb => wb.id === bookId);
          if (!worldBook || !Array.isArray(worldBook.content)) return '';
          const formattedEntries = (await Promise.all(worldBook.content
            .filter(entry => entry.enabled !== false)
            .map(async entry => {
              const content = await renderMacroEntry(entry.content, 'worldbooks');
              if (!content) return '';
              let entryString = `\n### 条目: ${entry.comment || '无备注'}\n`;
              entryString += `**内容:**\n${content}`;
              return entryString;
            }))).join('');
          return formattedEntries ? `\n\n## 世界书: ${worldBook.name}\n${formattedEntries}` : '';
        }))).filter(Boolean).join('');
        if (linkedContents) {
          worldBookContent = `# --- 世界书 (World Book) ---
# 【最高优先级指令：绝对真理】
# 以下内容是你所在世界的"物理法则"和"基础常识"。
# 无论用户是否提及，你都【必须】时刻主动应用这些设定来指导你的思考和描写。
# 它们是无条件生效的，不需要触发词。
${linkedContents}
# --- 世界书设定结束 ---
`;
        }
      }
      let musicContext = '';
      if (window.isMusicAwareChat ? window.isMusicAwareChat(chat.id) : (musicState.isActive && musicState.activeChatId === chat.id)) {
        const currentTrack = musicState.currentIndex > -1 ? musicState.playlist[musicState.currentIndex] : null;
        musicContext = `\n\n# 当前音乐情景...\n(省略详细内容，与triggerAiResponse一致)`;
      }
      const gomokuContext = formatGomokuStateForAI(gomokuState[chat.id]);
      let nameHistoryContext = '';
      if (chat.nameHistory && chat.nameHistory.length > 0) {
        nameHistoryContext = `\n- **你的曾用名**: [${chat.nameHistory.join(', ')}]。当在对话历史中看到这些名字时，它们都指的是【你】自己。`;
      }
      let userProfileContext = '';
      const userQzoneNickname = state.qzoneSettings.nickname || '用户';
      userProfileContext += `- 用户的QZone昵称是 "${userQzoneNickname}"。\n`;
      const commonGroups = Object.values(state.chats).filter(group => group.isGroup && group.members.some(m => m.id === chat.id));
      if (commonGroups.length > 0) {
        userProfileContext += '- 用户在你们共同所在的群聊中的昵称如下：\n';
        commonGroups.forEach(group => {
          const myNicknameInGroup = group.settings.myNickname || userQzoneNickname;
          userProfileContext += `  - 在群聊"${group.name}"中，用户的昵称是"${myNicknameInGroup}"。\n`;
        });
      }
      userProfileContext += '当你在任何系统提示、动态评论或挂载的群聊记忆中看到这些名字时，它们都指代的是【你的聊天对象】。';
      const stickerContext = getStickerContextForPrompt(chat);

      // 根据记忆模式构建记忆上下文
      let memoryContextForPrompt = '';
      const memoryMode = chat.settings.memoryMode || (chat.settings.enableStructuredMemory ? 'structured' : 'diary');
      if (memoryMode === 'vector' && window.vectorMemoryManager) {
        // 向量记忆模式：异步检索相关记忆
        // 构建检索query：根据用户设置的检索策略
        const vm = window.vectorMemoryManager.getVariableMemory(chat);
        const retrievalStrategy = vm.settings.retrievalStrategy || 'user-only';
        const userMsgCount = vm.settings.retrievalUserMsgCount || 3;
        
        let queryText = '';
        if (retrievalStrategy === 'user-only') {
          // 只用用户的最近N条消息
          const userMessages = filteredHistory.filter(m => m.role === 'user').slice(-userMsgCount);
          queryText = userMessages.map(m => typeof m.content === 'string' ? m.content : '').join(' ');
        } else if (retrievalStrategy === 'user-weighted') {
          // 用户消息权重高，角色消息权重低
          const recentMsgs = filteredHistory.slice(-10);
          const userMsgs = recentMsgs.filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : '').join(' ');
          const aiMsgs = recentMsgs.filter(m => m.role === 'assistant').slice(-2).map(m => typeof m.content === 'string' ? m.content : '').join(' ');
          queryText = userMsgs + ' ' + aiMsgs;
        } else {
          // 混合模式（兼容旧版）
          queryText = filteredHistory.slice(-5).map(m => typeof m.content === 'string' ? m.content : '').join(' ');
        }
        
        memoryContextForPrompt = await window.vectorMemoryManager.serializeForPrompt(chat, queryText);
      } else if (memoryMode === 'structured' && window.structuredMemoryManager) {
        memoryContextForPrompt = '# 长期记忆 (必须严格遵守)\n' + window.structuredMemoryManager.serializeForPrompt(chat);
      } else {
        memoryContextForPrompt = '# 长期记忆 (必须严格遵守)\n' + (getMemoryContextForPrompt(chat));
      }

      let aiAgeContext = getDynamicAgeContext(chat);
      let currencyExchangeContext = chat.settings.enableDynamicCurrency ? getCurrencyExchangeContext() : '';

      let systemPromptTemplate = window.getActiveChatPrompt ? window.getActiveChatPrompt(chat.isGroup && chat.settings.isOfflineMode ? 'group_offline' : 'single') : '';
      
      const contextMapPropel = {
        'thoughtChainContextHead': thoughtChainContextHead,
        'thoughtChainContextMiddle': thoughtChainContextMiddle,
        'aiAgeContext': aiAgeContext,
        'currencyExchangeContext': currencyExchangeContext,
        'char_avatar': chat.isGroup ? (chat.settings.groupAvatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg') : (chat.settings.aiAvatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'),
        'user_avatar': chat.settings.myAvatar || (state.qzoneSettings && state.qzoneSettings.avatar) || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg',
        'char_name': chat.originalName,
        'char_remark': chat.name,
        'user_name': (state.qzoneSettings && state.qzoneSettings.nickname) || '用户',
        'user_nickname': myNickname,
        'chat.originalName': chat.originalName,
        'aiPersona': chat.settings.aiPersona,
        'latestThoughtContext': '', // 推进时通常没有上一轮思考，故留空
        'worldBookContent': worldBookContent || '(当前无特殊世界观设定，以现实逻辑为准)',
        'memoryContextForPrompt': memoryContextForPrompt,
        'multiLayeredSummaryContext': '',
        'todoListContext': '',
        'periodSummaryContext': '',
        'chat.name': chat.name,
        'myNickname': myNickname,
        'myPersona': chat.settings.myPersona || '普通用户',
        'userStatus': chat.settings.userStatus ? chat.settings.userStatus.text : '在线' + (chat.settings.userStatus && chat.settings.userStatus.isBusy ? '(忙碌中)' : ''),
        'userProfileContext': userProfileContext,
        'nameHistoryContext': nameHistoryContext,
        'timePerceptionContext': chat.settings.enableTimePerception ? (typeof window.TimeAwareness?.buildLocalContext === 'function' ? window.TimeAwareness.buildLocalContext(chat) : `- **当前时间**: ${currentTime} (${timeOfDayGreeting})`) : '',
        'weatherContext': '', // 推进时省略天气
        'timeContext': '',
        'musicContextStr': musicContext ? '你们正在一起听歌，' + musicContext : '你们没有在听歌。',
        'readingContextStr': '你们没有在读书。',
        'contactsList': '',
        'postsContext': '',
        'groupContext': '',
        'gomokuContext': gomokuContext,
        'sharedContext': '',
        'callTranscriptContext': '',
        'synthMusicInstruction': '',
        'narratorInstruction': '',
        'kinshipContext': '',
        'coupleSpaceContext': '',
        'bilingualModeContext': '',
        'thoughtsPrompt': '',
        'bilingualAlertText': '',
        'bilingualAlertVoice': '',
        'novelAiImageContext': '',
        'googleImagenContext': '',
        'qzoneActionsPrompt': '',
        'viewMyPhonePrompt': '',
        'crossChatInstruction': '',
        'todoInstruction': '',
        'stickerContext': stickerContext,
        'aiAvatarLibrary': chat.settings.aiAvatarLibrary && chat.settings.aiAvatarLibrary.length > 0 ? chat.settings.aiAvatarLibrary.map(avatar => `- ${avatar.name}`).join('\n') : '- (空)',
        'myAvatarLibrary': chat.settings.myAvatarLibrary && chat.settings.myAvatarLibrary.length > 0 ? chat.settings.myAvatarLibrary.map(avatar => `- ${avatar.name}`).join('\n') : '- (空)'
      };

      let systemPrompt = replaceTemplateVars(macroSession ? await macroSession.prompt(systemPromptTemplate, chat.isGroup && chat.settings.isOfflineMode ? 'group_offline' : 'single') : systemPromptTemplate, contextMapPropel);
      if (contextMapPropel.timePerceptionContext && !systemPrompt.includes(contextMapPropel.timePerceptionContext)) {
        systemPrompt += `\n\n${contextMapPropel.timePerceptionContext}`;
      }

      systemPrompt = processPromptWithSettings(systemPrompt, chat.isGroup && chat.settings.isOfflineMode ? 'group_offline' : 'single', chat);

      systemPrompt += window.RemarkNames.buildContext(chat, filteredHistory);
      systemPrompt += window.CharacterIdentity.buildContext(chat);
      let messagesForApi = filteredHistory.filter(msg => !window.RemarkNames.getEvent(msg, chat)).map(msg => ({
        role: msg.role,
        content: String(msg.content)
      }));

      messagesForApi.push({
        role: 'user',
        content: `[系统指令：用户按下了"推进"按钮，现在轮到你主动行动了，请继续对话。]`
      });

      if (typeof ThoughtChainManager !== 'undefined' && ThoughtChainManager.enabled) {
          messagesForApi = ThoughtChainManager.injectIntoMessages(messagesForApi);
      }

      let isGemini = proxyUrl === GEMINI_API_URL;
      const propelGuidance = window.GenerationAdjustments ? await window.GenerationAdjustments.prepare(chat, { manual: true }) : null;
      if (propelGuidance) systemPrompt += propelGuidance.block;
      if (window.SmsEngine && !chat.isGroup) systemPrompt += await window.SmsEngine.qqContext(chat);
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);

      let reqBody = {
            model: model,
            messages: [{
              role: 'system',
              content: systemPrompt
            }, ...messagesForApi],
            temperature: state.globalSettings.apiTemperature || 0.8,
            ...(state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined ? { top_p: state.globalSettings.apiTopP } : {}),
            ...(state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens !== undefined ? { max_tokens: state.globalSettings.apiMaxTokens } : {}),
            ...(state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined ? { presence_penalty: state.globalSettings.apiPresencePenalty } : {}),
            ...(state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined ? { frequency_penalty: state.globalSettings.apiFrequencyPenalty } : {})
      };
      const response = isGemini ?
        await fetch(geminiConfig.url, geminiConfig.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(reqBody)
        });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API 请求失败: ${errorData.error.message}`);
      }

      const data = await response.json();
      routeObservation?.observe(data);
      window.ModelRouteObserver?.record(chat, routeObservation);

      const aiResponseContent = getGeminiResponseText(data);

      const messagesArray = parseAiResponse(aiResponseContent);
      const processedActions = [];
      for (const action of messagesArray) {
        if (action.type === 'text' && typeof action.content === 'string' && action.content.includes('\n')) {
          const lines = action.content.split(/\n+/).filter(line => line.trim());
          lines.forEach(line => {
            processedActions.push({
              ...action,
              content: line
            });
          });
        } else {
          processedActions.push(action);
        }
      }

      let messageTimestamp = Date.now();
      for (const msgData of processedActions) {
        if (!await window.CharacterIdentity.prepare(chat, msgData, state.activeChatId === chat.id)) continue;
        if (window.SmsEngine && await window.SmsEngine.qqAction(chat, msgData)) continue;
        const aiMessage = {
          role: 'assistant',
          senderName: msgData.name || chat.originalName,
          senderId: msgData.actorId || null,
          timestamp: messageTimestamp++,
          content: msgData.content || msgData.message,
          type: msgData.type || 'text',
        };
        if (msgData.type === 'update_thoughts') {
          if (!chat.isGroup) {
            if (msgData.heartfelt_voice) chat.heartfeltVoice = String(msgData.heartfelt_voice);
            if (msgData.random_jottings) chat.randomJottings = String(msgData.random_jottings);
            
            // 推进时也动态收集自定义心声变量
            if (!chat.customThoughts) {
              chat.customThoughts = {};
            }
            for (const key in msgData) {
              if (!['type', 'heartfelt_voice', 'random_jottings', 'actorId', 'senderId', 'name'].includes(key)) {
                chat.customThoughts[key] = String(msgData[key]);
              }
            }
          }
          continue;
        }
        chat.history.push(aiMessage);
        appendMessage(aiMessage, chat);
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 800));
      }

      await db.chats.put(chat);
      renderChatList();
      if (propelGuidance) await window.GenerationAdjustments.consume(propelGuidance);

    } catch (error) {
      console.error("推进剧情失败:", error);
      await showCustomAlert('操作失败', `无法推进剧情: ${error.message}`);
    } finally {
      setAvatarActingState(chat.id, false);
      if (!chat.isGroup && document.getElementById('chat-header-title')) {
        const titleEl = document.getElementById('chat-header-title');
        titleEl.style.opacity = 0;
        setTimeout(() => {
          titleEl.textContent = chat.name;
          titleEl.classList.remove('typing-status');
          titleEl.style.opacity = 1;
        }, 200);
      }
    }
  }

  // ========== 全局暴露 ==========
  window.triggerAiResponse = triggerAiResponse;
  window.silentlyUpdateDbUrl = silentlyUpdateDbUrl;
  window.handleRegenerateResponse = handleRegenerateResponse;
  window.handleRegenerateCallResponse = handleRegenerateCallResponse;
  window.handlePropelAction = handlePropelAction;
