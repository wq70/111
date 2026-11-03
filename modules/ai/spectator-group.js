  async function triggerSpectatorGroupAiAction() {
    if (!state.activeChatId) return;
    const chatId = state.activeChatId;
    const chat = state.chats[chatId];
    
    let thoughtChainContextHead = '';
    let thoughtChainContextMiddle = '';
    if (typeof ThoughtChainManager !== 'undefined' && ThoughtChainManager.enabled) {
        const chunks = ThoughtChainManager.getPayloadChunks();
        thoughtChainContextHead = chunks.head.map(c => c.content).join('\n');
        thoughtChainContextMiddle = chunks.middle.map(c => c.content).join('\n');
    }
    
    lastRawAiResponse = '';
    lastResponseTimestamps = [];
    const propelBtn = document.getElementById('spectator-propel-btn');
    if (propelBtn) {
      propelBtn.disabled = true;
      propelBtn.textContent = '思考中...';
    }
    setAvatarActingState(chatId, true);

    try {
      // 获取API配置（优先使用角色独立配置）
      let apiConfig = state.apiConfig;
      if (chat.apiOverride && chat.apiOverride.enabled) {
        apiConfig = {
          proxyUrl: chat.apiOverride.proxyUrl || state.apiConfig.proxyUrl,
          apiKey: chat.apiOverride.apiKey || state.apiConfig.apiKey,
          model: chat.apiOverride.model || state.apiConfig.model
        };
      }
      
      const {
        proxyUrl,
        apiKey,
        model
      } = apiConfig;
      
      if (!proxyUrl || !apiKey || !model) {
        throw new Error('API未配置，无法生成对话。');
      }






      const maxMemory = parseInt(chat.settings.maxMemory) || 10;
      const historySlice = chat.history.filter(m => !m.isExcluded && m.type !== 'thought_chain_block').slice(-maxMemory);
      const filteredHistory = await filterHistoryWithDoNotSendRules(historySlice, chatId);

      const macroSession = window.PromptMacros?.session();
      const renderMacroEntry = (text, scope) => macroSession ? macroSession.render(text, scope) : Promise.resolve(text);
      const routeObservation = window.ModelRouteObserver?.start(model);
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


      let longTermMemoryContext = '# 长期记忆 (最高优先级，这是群内已经确立的事实，所有角色必须严格遵守)\n';
      let collectedMemories = false;
      const includeUserMemoryIds = chat.settings.spectatorIncludeUserMemoryForMemberIds;
      const allowMemberMemory = (member) => !includeUserMemoryIds || includeUserMemoryIds.includes(member.id);

      // 构建用于向量检索的查询词（如果有）
      const queryTextForVector = filteredHistory.slice(-5).map(m => typeof m.content === 'string' ? m.content : '').join(' ');

      if (window.GroupMemory?.independent(chat)) {
          longTermMemoryContext = await window.GroupMemory.context(chat, queryTextForVector);
        } else {
        for (const member of chat.members) {
        if (!allowMemberMemory(member)) continue;
        const memberChat = state.chats[member.id];
        if (memberChat) {
          const memMode = memberChat.settings?.memoryMode || (memberChat.settings?.enableStructuredMemory ? 'structured' : 'diary');
          let memberMemContent = '';
          
          if (memMode === 'vector' && window.vectorMemoryManager) {
            memberMemContent = await window.vectorMemoryManager.serializeForPrompt(memberChat, queryTextForVector);
          } else if (memMode === 'structured' && window.structuredMemoryManager) {
            memberMemContent = window.structuredMemoryManager.serializeForPrompt(memberChat);
          } else if (memberChat.longTermMemory && memberChat.longTermMemory.length > 0) {
            memberMemContent = getMemoryContextForPrompt(memberChat, { includeTimestamp: true });
          }

          if (memberMemContent && memberMemContent.trim() !== '') {
            longTermMemoryContext += `\n## --- 关于"${member.groupNickname}"的记忆 ---\n`;
            longTermMemoryContext += memberMemContent;
            collectedMemories = true;
          }
        }
      }

      if (!collectedMemories) {
        longTermMemoryContext += '- (暂无)';
      }


      
        }

        let linkedMemoryContext = '';
      const memoryCount = chat.settings.linkedMemoryCount || 10;
      if (chat.settings.linkedMemoryChatIds && chat.settings.linkedMemoryChatIds.length > 0) {

      }

      const membersList = chat.members.map(m => `- **${m.groupNickname}** (本名: ${m.originalName}, actorId: ${JSON.stringify(String(m.id))}): ${m.persona}`).join('\n');
      const stickerContext = getGroupStickerContextForPrompt(chat);
      let aiAgeContext = getDynamicAgeContext(chat);
      let currencyExchangeContext = chat.settings.enableDynamicCurrency ? getCurrencyExchangeContext() : '';

      let systemPromptTemplate = window.getActiveChatPrompt ? window.getActiveChatPrompt('spectator') : '';
      
      const contextMap = {
        'thoughtChainContextHead': thoughtChainContextHead,
        'thoughtChainContextMiddle': thoughtChainContextMiddle,
        'aiAgeContext': aiAgeContext,
        'currencyExchangeContext': currencyExchangeContext,
        'char_avatar': chat.isGroup ? (chat.settings.groupAvatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg') : (chat.settings.aiAvatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'),
        'user_avatar': chat.settings.myAvatar || (state.qzoneSettings && state.qzoneSettings.avatar) || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg',
        'char_name': chat.originalName,
        'char_remark': chat.name,
        'user_name': (state.qzoneSettings && state.qzoneSettings.nickname) || '用户',
        'user_nickname': chat.settings.myNickname || '我',
        'chat.name': chat.name,
        'longTermMemoryContext': longTermMemoryContext,
        'worldBookContent': worldBookContent,
        'linkedMemoryContext': linkedMemoryContext,
        'historySliceStr': historySlice.map(msg => `${getDisplayNameInGroup(chat, msg.senderName, msg.senderId)}: ${msg.content}`).join('\n'),
        'membersList': membersList,
        'stickerContext': stickerContext
      };
      
      systemPrompt = replaceTemplateVars(macroSession ? await macroSession.prompt(systemPromptTemplate, 'spectator') : systemPromptTemplate, contextMap);

      systemPrompt = processPromptWithSettings(systemPrompt, 'spectator');

      if (chat.settings.isOfflineMode) {
        const participantNames = chat.members.map(m => m.groupNickname || m.originalName).join('、');
        const minLength = chat.settings.offlineMinLength || 100;
        const maxLength = chat.settings.offlineMaxLength || 300;
        systemPrompt += `\n# 【【【线下聚会模式 (最高优先级)】】】\n- **当前情景**: 你们现在正处于【线下现实聚会】状态，不在网络群聊中！大家正面对面聚在一起。\n- **现场人员**: 现场有【${participantNames}】（注意：本次聚会用户不在场）。\n- **行为规范**: \n  - 你们可以产生互相的肢体接触、观察对方的神态、注意周围的环境。\n  - 请在发言的文本内容中，像小说一样自然地加入动作、神态、环境描写（建议将动作描写用括号或星号包裹，比如：*喝了一口咖啡*）。\n  - 绝不能表现出"正在用手机打字群聊"的状态！\n  - **【重要字数要求】**: 每个角色的单次回复文本长度必须在 ${minLength} 到 ${maxLength} 字之间。\n  - **绝对注意**: 这个字数限制是针对【每一个发言的角色】单独计算的，绝不是所有人的字数总和！请确保每个人的描写都足够充实。\n`;
      }

      systemPrompt += window.CharacterIdentity.buildContext(chat);
      let messagesPayload = filteredHistory.map(msg => ({
        role: 'user',
        content: `${getDisplayNameInGroup(chat, msg.senderName, msg.senderId)}: ${msg.content}`
      }));

      if (typeof ThoughtChainManager !== 'undefined' && ThoughtChainManager.enabled) {
          messagesPayload = ThoughtChainManager.injectIntoMessages(messagesPayload);
      }

      let isGemini = proxyUrl.includes('generativelanguage.googleapis.com');
      let response;

      if (isGemini) {
        let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesPayload);
        response = await fetch(geminiConfig.url, geminiConfig.data);
      } else {
      let reqBody = {
            model: model,
            messages: [{
              role: 'system',
              content: systemPrompt
            }, ...messagesPayload],
            temperature: state.globalSettings.apiTemperature || 0.9
        };
        if (state.globalSettings.apiTopPEnabled && state.globalSettings.apiTopP !== undefined) reqBody.top_p = state.globalSettings.apiTopP;
        if (state.globalSettings.apiMaxTokensEnabled && state.globalSettings.apiMaxTokens > 0) reqBody.max_tokens = state.globalSettings.apiMaxTokens;
        if (state.globalSettings.apiPresencePenaltyEnabled && state.globalSettings.apiPresencePenalty !== undefined) reqBody.presence_penalty = state.globalSettings.apiPresencePenalty;
        if (state.globalSettings.apiFrequencyPenaltyEnabled && state.globalSettings.apiFrequencyPenalty !== undefined) reqBody.frequency_penalty = state.globalSettings.apiFrequencyPenalty;
        response = await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(reqBody)
        });
      }





      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: {
            message: response.statusText
          }
        }));
        throw new Error(`API 请求失败: ${response.status} - ${errorData.error?.message || '未知错误'}`);
      }

      const data = await response.json();
      routeObservation?.observe(data);
      window.ModelRouteObserver?.record(chat, routeObservation);
      const aiResponseContent = getGeminiResponseText(data);
      lastRawAiResponse = aiResponseContent;
      const messagesArray = parseAiResponse(aiResponseContent);






      let messageTimestamp = Date.now();
      for (const msgData of messagesArray) {

        if (!msgData || !msgData.type) continue;
        if (!await window.CharacterIdentity.prepare(chat, msgData, true)) continue;

        let aiMessage = null;
        const currentMessageTimestamp = messageTimestamp++;
        lastResponseTimestamps.push(currentMessageTimestamp);
        const baseMessage = {
          role: 'assistant',
          senderName: msgData.name,
          senderId: msgData.actorId || null,
          timestamp: currentMessageTimestamp
        };

        if (msgData.type === 'ai_image') {
          if (localStorage.getItem('novelai-enabled') === 'true') {
            msgData.type = 'naiimag';
            msgData.prompt = msgData.image_prompt || msgData.description || 'a beautiful scene';
          } else if (localStorage.getItem('google-imagen-enabled') === 'true') {
            msgData.type = 'googleimag';
            msgData.prompt = msgData.image_prompt || msgData.description || 'a beautiful scene';
          } else if (localStorage.getItem('openai-image-enabled') === 'true') {
            msgData.type = 'openaiimag';
            msgData.prompt = msgData.image_prompt || msgData.description || 'A beautiful scene';
          }
        }

        switch (msgData.type) {
          case 'thought_chain_block':
            aiMessage = {
              ...baseMessage,
              type: 'thought_chain_block',
              content: msgData.content
            };
            break;
          case 'text':
            aiMessage = {
              ...baseMessage,
              content: msgData.content
            };
            break;
          case 'sticker':
            if (msgData.meaning) {
              const sticker = findBestStickerMatch(msgData.meaning, state.userStickers);
              if (sticker) {
                aiMessage = {
                  ...baseMessage,
                  type: 'sticker',
                  content: sticker.url,
                  meaning: sticker.name
                };
              } else {
                console.warn(`旁观模式AI尝试使用不存在的表情: "${msgData.meaning}"`);
                aiMessage = null;
              }
            } else {
              console.warn("旁观模式AI发送了一个没有 'meaning' 的 sticker 指令。", msgData);
            }
            break;
          case 'ai_image':

            aiMessage = {
              ...baseMessage,
              type: 'ai_image',
              content: msgData.description,
              image_prompt: msgData.image_prompt
            };
            break;
          case 'naiimag':
            try {
              const naiResult = await generateNaiImageFromPrompt(msgData.prompt, chat.id);
              aiMessage = {
                ...baseMessage,
                type: 'naiimag',
                imageUrl: naiResult.imageUrl,
                prompt: msgData.prompt,
                fullPrompt: naiResult.fullPrompt
              };
            } catch (error) {
              console.error('旁观模式生成 NovelAI 图片失败:', error);
              aiMessage = { ...baseMessage, content: `[图片生成失败: ${error.message}]` };
            }
            break;
          case 'googleimag':
            try {
              const googleResult = await generateGoogleImagenFromPrompt(msgData.prompt);
              aiMessage = {
                ...baseMessage,
                type: 'googleimag',
                imageUrl: googleResult.imageUrl,
                prompt: msgData.prompt,
                fullPrompt: googleResult.fullPrompt
              };
            } catch (error) {
              console.error('旁观模式生成 Google Imagen 图片失败:', error);
              aiMessage = { ...baseMessage, content: `[图片生成失败: ${error.message}]` };
            }
            break;
          case 'openaiimag':
            try {
              const openAIResult = await generateOpenAIImageFromPrompt(msgData.prompt);
              aiMessage = {
                ...baseMessage,
                type: 'openaiimag',
                imageUrl: openAIResult.imageUrl,
                prompt: msgData.prompt,
                fullPrompt: openAIResult.fullPrompt,
                model: openAIResult.model,
                mimeType: openAIResult.mimeType,
                requestId: openAIResult.requestId
              };
            } catch (error) {
              console.error('旁观模式生成 GPT 图片失败:', error);
              aiMessage = { ...baseMessage, content: `[图片生成失败: ${error.message}]` };
            }
            break;
          case 'voice_message':

            aiMessage = {
              ...baseMessage,
              type: 'voice_message',
              content: msgData.content
            };
            break;
          case 'quote_reply':

            const originalMessage = chat.history.find(m => m.timestamp === msgData.target_timestamp);
            if (originalMessage) {
              aiMessage = {
                ...baseMessage,
                content: msgData.reply_content,
                quote: {
                  timestamp: originalMessage.timestamp,
                  senderName: originalMessage.senderName,
                  content: String(originalMessage.content || '').substring(0, 50)
                }
              };
            } else {

              aiMessage = {
                ...baseMessage,
                content: msgData.reply_content
              };
            }
            break;
          default:
            console.warn("旁观模式收到未知指令类型:", msgData.type);
            continue;
        }

        if (aiMessage) {
          chat.history.push(aiMessage);
          appendMessage(aiMessage, chat);
          await new Promise(resolve => setTimeout(resolve, Math.random() * 1200 + 800));
        }
      }




      await db.chats.put(chat);
      renderChatList();

    } catch (error) {
      console.error("旁观模式推进剧情失败:", error);
      await showCustomAlert('操作失败', `无法推进剧情: ${error.message}`);
    } finally {
      if (propelBtn) {
        propelBtn.disabled = false;
        propelBtn.textContent = '🎬 推进剧情';
      }
      setAvatarActingState(chatId, false);
    }
  }

