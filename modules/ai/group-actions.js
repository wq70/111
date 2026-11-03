  async function triggerGroupAiAction(chatId) {
    const chat = state.chats[chatId];
    if (!chat || !chat.isGroup) return;
    if (window.TimeAwareness?.isBackgroundPaused(chat)) {
      console.log(`群聊 "${chat.name}" 的后台活动当前已暂停。`);
      return;
    }

    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.filter(m => !m.isHidden && !m.isExcluded).slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, chatId);
    const groupActionCooldownMinutes = chat.settings.actionCooldownMinutes || 10;

    if (chat.lastActionTimestamp) {
      const minutesSinceLastAction = (Date.now() - chat.lastActionTimestamp) / (1000 * 60);

      if (minutesSinceLastAction < groupActionCooldownMinutes) {
        console.log(`群聊 "${chat.name}" 处于行动冷却中，本次独立行动跳过。`);
        return;
      }
    }


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
    
    if (!proxyUrl || !apiKey || !model) return;

    const myNickname = chat.settings.myNickname || '我';
    const now = new Date();


    let systemPrompt;


    const recentHistory = chat.history.filter(m => !m.isHidden).slice(-5);
    const unclaimedPacket = recentHistory.find(m => m.type === 'red_packet' && !m.isFullyClaimed);


    if (unclaimedPacket) {
      const senderDisplayName = getDisplayNameInGroup(chat, unclaimedPacket.senderName);
      console.log(`检测到群聊 "${chat.name}" 中有未领完的红包，正在生成抢红包指令...`);

      systemPrompt = `
        # 你的【【【最高优先级任务】】】
        群聊中刚刚出现了一个由"${senderDisplayName}"发送的、尚未领完的红包（时间戳: ${unclaimedPacket.timestamp}）。
        你的任务是：选择【一个或多个】符合人设的角色，让他们【立刻】使用 'open_red_packet' 指令去尝试领取这个红包。
        # 指令格式
        你的回复【必须】是一个JSON数组，格式如下：
        '[{"type": "open_red_packet", "name": "角色本名", "packet_timestamp": ${unclaimedPacket.timestamp}}]'
        
        你可以让多个角色同时尝试，只需在返回的JSON数组中包含多个这样的对象即可。
        现在，请立即执行抢红包操作！
        `;
    } else {

      let timeContextText = '';

      // 判断是否使用自定义时间
      let currentTime, localizedDate;
      const customTimeInfo2 = window.getCustomTime ? window.getCustomTime(chat) : null;
      const customTimeEnabled = customTimeInfo2 && customTimeInfo2.enabled;
      
      const perceptionClock = window.TimeAwareness?.getClockInfo?.(chat, now.getTime());
      if (perceptionClock) {
        ({ currentTime, localizedDate } = perceptionClock);
      } else if (customTimeEnabled) {
        const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        const weekDay = weekDays[customTimeInfo2.date.getDay()];
        currentTime = `${customTimeInfo2.year}年${customTimeInfo2.month}月${customTimeInfo2.day}日${weekDay} ${String(customTimeInfo2.hour).padStart(2, '0')}:${String(customTimeInfo2.minute).padStart(2, '0')}`;
        localizedDate = customTimeInfo2.date;
      } else {
        // 使用时间感知（真实时间+时区）
        const selectedTimeZone = chat.settings.timeZone || 'Asia/Shanghai';
        currentTime = now.toLocaleString('zh-CN', {
          timeZone: selectedTimeZone,
          dateStyle: 'full',
          timeStyle: 'short'
        });
        localizedDate = new Date(now.toLocaleString('en-US', {
          timeZone: selectedTimeZone
        }));
      }

      if (chat.settings.enableTimePerception) {
        if (window.TimeAwareness) {
          const result = window.TimeAwareness.buildContext({
            chat,
            history: chat.history,
            mode: 'groupBackground',
            currentTime,
            localizedDate,
            timeOfDayGreeting: perceptionClock?.timeOfDayGreeting || getTimeOfDayGreeting(localizedDate),
            isGroup: true
          });
          timeContextText = result.context || result.timeContextText;
        } else {
          const lastMessage = chat.history.filter(m => !m.isHidden).slice(-1)[0];
          timeContextText = lastMessage ? `群里在${Math.floor((Date.now() - lastMessage.timestamp) / 60000)}分钟前有人聊过。` : '群里还没有任何消息。';
        }
      }
      let recentContextSummary = "你们最近没有有效聊天记录。";

      if (filteredHistory.length > 0) {
        recentContextSummary = "这是你们最近的对话：\n" + filteredHistory.map(msg => {
          const sender = msg.role === 'user' ? myNickname : getDisplayNameInGroup(chat, msg.senderName, msg.senderId);
          const content = String(msg.content || msg.message || '').substring(0, 50);
          return `${sender}: ${content}...`;
        }).join('\n');
      }

      const membersList = chat.members.map(m => `- **${m.groupNickname}** (本名: ${m.originalName}, actorId: ${JSON.stringify(String(m.id))}): ${m.persona}`).join('\n');

      let longTermMemoryContext = '# 长期记忆 (最高优先级，这是群内已经确立的事实，所有角色必须严格遵守)\n';
      let collectedMemories = false;

      const queryTextForVector = filteredHistory.slice(-5).map(m => typeof m.content === 'string' ? m.content : '').join(' ');

      if (window.GroupMemory?.independent(chat)) {
          longTermMemoryContext = await window.GroupMemory.context(chat, queryTextForVector);
        } else {
        for (const member of chat.members) {
        const memberChat = state.chats[member.id];
        if (memberChat) {
          const memMode = memberChat.settings?.memoryMode || (memberChat.settings?.enableStructuredMemory ? 'structured' : 'diary');
          let memberMemContent = '';
          
          if (memMode === 'vector' && window.vectorMemoryManager) {
            memberMemContent = await window.vectorMemoryManager.serializeForPrompt(memberChat, queryTextForVector);
          } else if (memMode === 'structured' && window.structuredMemoryManager) {
            memberMemContent = window.structuredMemoryManager.serializeForPrompt(memberChat);
          } else if (memberChat.longTermMemory && memberChat.longTermMemory.length > 0) {
            memberMemContent = getMemoryContextForPrompt(memberChat);
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
        const linkedContents = allWorldBookIds.map(bookId => {
          const worldBook = state.worldBooks.find(wb => wb.id === bookId);
          if (!worldBook || !Array.isArray(worldBook.content)) return '';


          const formattedEntries = worldBook.content
            .filter(entry => entry.enabled !== false)
            .map(entry => {
              let entryString = `\n### 条目: ${entry.comment || '无备注'}\n`;

              entryString += `**内容:**\n${entry.content}`;
              return entryString;
            }).join('');

          return formattedEntries ? `\n\n## 世界书: ${worldBook.name}\n${formattedEntries}` : '';
        }).filter(Boolean).join('');

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


      let linkedMemoryContext = '';
      const memoryCount = chat.settings.linkedMemoryCount || 10;
      if (chat.settings.linkedMemoryChatIds && chat.settings.linkedMemoryChatIds.length > 0) {
        const linkedChatsWithTimestamps = (window.GroupMemory ? window.GroupMemory.mountIds(chat) : chat.settings.linkedMemoryChatIds).map(id => {
          const linkedChat = state.chats[id];
          if (!linkedChat) return null;
          const lastMsg = linkedChat.history.slice(-1)[0];
          return {
            chat: linkedChat,
            latestTimestamp: lastMsg ? lastMsg.timestamp : 0
          };
        }).filter(Boolean);

        linkedChatsWithTimestamps.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
        linkedMemoryContext += `\n\n# 参考记忆 (至关重要！群内角色必须【主动】将这些参考记忆中的【关键信息和事件】，自然地融入到当前的对话中，以体现你们拥有完整的共同记忆。)\n`;
        for (const item of linkedChatsWithTimestamps) {
          const linkedChat = item.chat;
          const prefix = linkedChat.isGroup ? '[群聊]' : '[私聊]';
          const timeAgo = item.latestTimestamp > 0 ? ` (最后互动于 ${formatTimeAgo(item.latestTimestamp)})` : '';
          linkedMemoryContext += `\n## --- 来自${prefix}"${linkedChat.name}"的参考记忆${timeAgo} ---\n`;
          const recentHistory = linkedChat.history.slice(-memoryCount);
          const filteredHistory = recentHistory.filter(msg => !String(msg.content).includes('已被用户删除'));
          if (filteredHistory.length > 0) {
            filteredHistory.forEach(msg => {

              const sender = msg.role === 'user' ? (linkedChat.settings.myNickname || '我') : (getDisplayNameInGroup(linkedChat, msg.senderName, msg.senderId) || linkedChat.name);

              let prefix = "";

              if (msg.quote && msg.quote.content) {
                const quotedSenderDisplayName = getDisplayNameInGroup(linkedChat, msg.quote.senderName);
                let quoteContentPreview = String(msg.quote.content).substring(0, 30);
                if (quoteContentPreview.length === 30) quoteContentPreview += "...";

                prefix = `[回复 ${quotedSenderDisplayName}: "${quoteContentPreview}"] `;
              }

              let contentText = '';

              if (msg.type === 'ai_image' || msg.type === 'user_photo') {
                contentText = `[发送了一张图片，描述为：${msg.content}]`;
              } else if (msg.type === 'voice_message') {
                contentText = `[发送了一条语音，内容是：${msg.content}]`;
              } else if (msg.type === 'sticker') {
                contentText = `[表情: ${msg.meaning || 'sticker'}]`;
              } else if (msg.type === 'transfer') {
                contentText = `[转账: ${msg.amount}元]`;
              } else if (Array.isArray(msg.content)) {
                contentText = `[图片]`;
              } else {
                contentText = String(msg.content);
              }


              linkedMemoryContext += `${sender}: ${prefix}${contentText}\n`;
            });
          } else {
            linkedMemoryContext += "(暂无有效聊天记录)\n";
          }
        }
      }
      const allRecentPosts = await db.qzonePosts.orderBy('timestamp').reverse().limit(5).toArray();
      let dynamicContext = "";

      const visiblePostsForGroup = new Set();
      for (const member of chat.members) {
        const memberChat = state.chats[member.id];
        if (memberChat) {
          const visibleForMember = filterVisiblePostsForAI(allRecentPosts, memberChat);
          visibleForMember.forEach(post => visiblePostsForGroup.add(post));
        }
      }

      const unInteractedPostsForGroup = [...visiblePostsForGroup].filter(post => {
        const hasBeenLikedByGroup = chat.members.some(member => window.CharacterIdentity.likedBy(post, member.id));
        const hasBeenCommentedByGroup = post.comments && post.comments.some(comment => typeof comment === 'object' && chat.members.some(member => String(member.id) === String(window.CharacterIdentity.resolve(comment.commenterId, comment.commenterName)?.id)));
        return !hasBeenLikedByGroup && !hasBeenCommentedByGroup;
      });

      if (unInteractedPostsForGroup.length > 0) {
        let postsContext = "\n\n# 最近的动态列表 (供群内角色参考和评论):\n";
        for (const post of unInteractedPostsForGroup) {
          let authorName = post.authorId === 'user' ? myNickname : (state.chats[post.authorId]?.name || '一位朋友');
          let contentSummary;
          if (post.type === 'repost') {
            const repostComment = post.repostComment ? `并评论说："${post.repostComment}"` : '';
            let originalAuthorName = '原作者';
            const originalAuthorId = post.originalPost.authorId;
            if (originalAuthorId === 'user') {
              originalAuthorName = state.qzoneSettings.nickname;
            } else if (state.chats[originalAuthorId]) {
              originalAuthorName = state.chats[originalAuthorId].name;
            }
            let originalContentSummary;
            const originalPost = post.originalPost;
            if (originalPost.type === 'text_image') {
              originalContentSummary = `[文字图] ${originalPost.publicText || ''} (图片描述: "${(originalPost.hiddenContent || '').substring(0, 40)}...")`;
            } else if (originalPost.type === 'image_post') {
              originalContentSummary = `[图片] ${originalPost.publicText || ''} (图片描述: "${(originalPost.imageDescription || '').substring(0, 40)}...")`;
            } else {
              originalContentSummary = `"${(originalPost.content || '').substring(0, 40)}..."`;
            }
            contentSummary = `转发了 @${originalAuthorName} 的动态 ${repostComment}【原动态内容: ${originalContentSummary}】`;
          } else if (post.type === 'text_image') {
            contentSummary = `[一张图片，其隐藏文字为："${post.hiddenContent}"] ${post.publicText || ''}`.substring(0, 50) + '...';
          } else if (post.type === 'image_post') {
            contentSummary = `[一张图片，描述为："${post.imageDescription}"] ${post.publicText || ''}`.substring(0, 50) + '...';
          } else {

            contentSummary = String(post.publicText || post.content || "一条动态").substring(0, 50) + '...';
          }
          postsContext += `- (ID: ${post.id}) 作者: ${authorName}, 内容: "${contentSummary}"\n`;
          if (post.comments && post.comments.length > 0) {
            for (const comment of post.comments) {
              if (typeof comment === 'object' && comment.commenterName) {
                const commenterDisplayName = window.CharacterIdentity.commentContext(comment);
                let commentText = comment.meaning ? `[表情: '${comment.meaning}']` : comment.text;
                postsContext += `  - 评论: ${commenterDisplayName} (本名: ${comment.commenterName}): ${commentText}\n`;
              }
            }
          }
        }
        dynamicContext = postsContext;
      }

      const summary3Hours_group = generateSummaryForTimeframe(chat, 3, 'hours');
      const summary6Hours_group = generateSummaryForTimeframe(chat, 6, 'hours');
      const summary9Hours_group = generateSummaryForTimeframe(chat, 9, 'hours');
      const summaryToday_group = generateSummaryForTimeframe(chat, 1, 'days');
      const summary3Days_group = generateSummaryForTimeframe(chat, 3, 'days');
      const summary7Days_group = generateSummaryForTimeframe(chat, 7, 'days');

      let multiLayeredSummaryContext_group = '';
      if (summary3Hours_group || summary6Hours_group || summary9Hours_group || summaryToday_group || summary3Days_group || summary7Days_group) {
        multiLayeredSummaryContext_group += `\n# 智能总结 (基于不同时间维度的群聊回顾)\n`;
        if (summary3Hours_group) multiLayeredSummaryContext_group += summary3Hours_group;
        if (summary6Hours_group) multiLayeredSummaryContext_group += summary6Hours_group;
        if (summary9Hours_group) multiLayeredSummaryContext_group += summary9Hours_group;

        if (summary3Hours_group || summary6Hours_group || summary9Hours_group) multiLayeredSummaryContext_group += '\n';

        if (summaryToday_group) multiLayeredSummaryContext_group += summaryToday_group;
        if (summary3Days_group) multiLayeredSummaryContext_group += summary3Days_group;
        if (summary7Days_group) multiLayeredSummaryContext_group += summary7Days_group;
      }
      const stickerContext = getGroupStickerContextForPrompt(chat);
      systemPrompt = `
        # 你的任务
        你是一个群聊AI导演。你现在控制着一个名为"${chat.name}"的群聊。
        ${chat.settings.enableTimePerception ? (typeof window.TimeAwareness?.buildLocalContext === 'function' ? window.TimeAwareness.buildLocalContext(chat) : `当前时间是 ${currentTime}。`) : ''}
        ${timeContextText ? `${timeContextText} ` : ''}你的任务是根据群成员的性格、世界观、参考记忆、最近的动态和当前情景，【选择一个或多个角色】，让他们主动发起一段对话，打破沉默，让群聊重新活跃起来。
# 【交互铁律：角色间必须互动！】
1.  你的核心任务是**导演一场生动的群聊**，而不仅仅是让角色轮流发言。
2.  当有多个角色在同一轮发言时，他们的对话【必须】有逻辑上的前后关联。后面的角色应该**回应、反驳、或补充**前面角色的发言。
3.  模拟真实的聊天节奏。可以是一个角色提出问题，另一个角色立刻回答；或者一个角色开玩笑，另一个角色吐槽。
4.  你【绝对不能】生成几段毫无关联的独白。这会让对话显得非常机械和不真实。        
${longTermMemoryContext}
        
        # 核心规则
        你的回复【必须】是一个JSON数组，可以包含一个或多个行动对象。每个对象的 "name" 字段【必须】是角色的【本名】。你【绝对不能】生成 "name" 字段为 "${myNickname}" 的消息。严格遵守每个角色的设定，禁止出戏。
-请根据当前情景和你的情绪，从列表中【选择一个最合适的】表情含义来使用 "sticker" 指令。尽量让你的表情丰富多样，避免重复。        
        # 你的可选行动指令:
        -   **发送文本**: '{"type": "text", "name": "角色本名", "content": "文本内容"}'
        -   **发送表情**: '{"type": "sticker", "name": "角色本名", "meaning": "表情的含义(从可用表情列表选择)"}'
        -   **发送图片**: '{"type": "ai_image", "name": "角色本名", "description": "图片的详细【中文】描述", "image_prompt": "图片的【英文】关键词, 用%20分隔, 风格为风景/动漫/插画/二次元等, 禁止真人"}'
        -   **发起投票**: '{"type": "poll", "name": "角色本名", "question": "...", "options": "..."}'
        -   **发起群视频**: '{"type": "group_call_request", "name": "角色本名"}'
        -如何正确使用"引用回复"功能：
- 当你想明确地针对群内【任何成员】（包括用户或其他AI角色）之前的某一句具体的话进行回复时，你就应该使用这个功能。
- 这会让你的回复上方出现一个灰色的小框，里面是被你引用的那句话，这样对话就不会乱了。
- 指令格式: '{"type": "quote_reply", "target_timestamp": (你想引用的那句话的时间戳), "reply_content": "你的回复内容"}'

        # 当前群聊信息
        - **群名称**: ${chat.name}
        ${worldBookContent}
        # 长期记忆 (最高优先级，这是群内已经确立的事实，所有角色必须严格遵守)
        ${(() => {
          if (window.GroupMemory?.independent(chat)) return '';
          const memMode = chat.settings?.memoryMode || (chat.settings?.enableStructuredMemory ? 'structured' : 'diary');
          if (memMode === 'vector') return '(群聊自身的变量记忆 - 由检索引擎动态注入)';
          if (memMode === 'structured' && window.structuredMemoryManager) return window.structuredMemoryManager.serializeForPrompt(chat);
          return getMemoryContextForPrompt(chat);
        })()}       
        ${multiLayeredSummaryContext_group}
        ${linkedMemoryContext}
        
        # 群成员列表及人设
        ${membersList}
        # 可用表情包
- 当你需要发送表情时，你【必须】从下面的列表中【精确地选择一个】含义（meaning）。
- 【绝对禁止】使用任何不在列表中的表情含义！
        ${stickerContext}        
        # 用户的角色
        - **${myNickname}**: ${chat.settings.myPersona}
        - **${myNickname}的当前状态**: ${chat.settings.userStatus ? chat.settings.userStatus.text : '在线'} ${chat.settings.userStatus && chat.settings.userStatus.isBusy ? '(忙碌中)' : ''}
        
        # 最近的对话摘要 (供你参考)
        ${recentContextSummary}
        
        # 最近的动态列表 (供你参考和评论)
        ${dynamicContext}
        
        现在，请开始你的导演工作，让群聊再次热闹起来吧！
        `;
    }
    systemPrompt += window.CharacterIdentity.buildContext(chat);
    const recentHistoryForPayload = chat.history.filter(m => !m.isHidden).slice(-10);
    const messagesPayload = [{
      role: 'system',
      content: systemPrompt
    },

    ...filteredHistory.map(msg => {
      const sender = msg.role === 'user' ? myNickname : getDisplayNameInGroup(chat, msg.senderName, msg.senderId);
      let content = msg.content;

      if (msg.type === 'ai_image' || msg.type === 'user_photo') {
        content = `[发送了一张图片，描述为：'${msg.content}']`;
      } else if (msg.type === 'voice_message') {
        content = `[发送了一条语音，内容是：'${msg.content}']`;
      } else if (typeof content !== 'string') {
        content = '[发送了一条复杂消息，如卡片或转账]';
      }

      return {
        role: 'user',
        content: `${sender}: ${content}`
      };
    })
    ];

    try {
      const messagesPayload = [{
        role: 'user',
        content: systemPrompt
      }];
      let isGemini = proxyUrl === GEMINI_API_URL;
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesPayload);

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
            messages: messagesPayload,
            temperature: state.globalSettings.apiTemperature || 0.9,
          })
        });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try { const errData = await response.json(); errMsg = errData?.error?.message || errData?.message || errData?.detail || JSON.stringify(errData); } catch(e) { errMsg += ` (${response.statusText})`; }
        throw new Error(`API失败: ${errMsg}`);
      }

      const data = await response.json();
      const aiResponseContent = isGemini ? data.candidates[0].content.parts[0].text : data.choices[0].message.content;
      const responseArray = parseAiResponse(aiResponseContent);

      if (!responseArray || responseArray.length === 0) {
        console.warn(`群聊 "${chat.name}" 的独立行动API返回为空或格式不正确，本次跳过。`);
        return;
      }

      let actionTimestamp = Date.now();

      let hasPerformedMajorAction = false;
      let notificationContent = '';
      let notificationSender = '';

      const processedActions = [];
      for (const action of responseArray) {
        const contentStr = String(action.content || '');

        const isRawHtml = contentStr.trim().startsWith('<') && contentStr.trim().endsWith('>');


        if (action.type === 'text' && !isRawHtml && contentStr.includes('\n')) {
          const lines = contentStr.split(/\n+/).filter(line => line.trim());
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
      for (const action of processedActions) {
        if (!action || !action.type) continue;
        if (!await window.CharacterIdentity.prepare(chat, action)) continue;

        const senderDisplayName = getDisplayNameInGroup(chat, action.name, action.actorId);
        let visibleSystemMessage = null;

        let aiMessage = null;
        const baseMessage = {
          role: 'assistant',
          senderName: action.name,
          senderId: action.actorId || null,
          timestamp: actionTimestamp++
        };


        if (action.type === 'open_red_packet') {
          const packetToOpen = chat.history.find(m => m.timestamp === action.packet_timestamp);

          if (packetToOpen && !packetToOpen.isFullyClaimed && !(packetToOpen.claimedBy && packetToOpen.claimedBy[action.name])) {

            let claimedAmountAI = 0;
            const remainingAmount = packetToOpen.totalAmount - Object.values(packetToOpen.claimedBy || {}).reduce((sum, val) => sum + val, 0);
            const remainingCount = packetToOpen.count - Object.keys(packetToOpen.claimedBy || {}).length;

            if (remainingCount > 0) {

              if (packetToOpen.packetType === 'direct') {
                claimedAmountAI = packetToOpen.totalAmount;
              }
              else if (packetToOpen.unclaimedAmounts && packetToOpen.unclaimedAmounts.length > 0) {

                claimedAmountAI = packetToOpen.unclaimedAmounts.pop();
              }

              else {
                console.warn("检测到旧版红包，回退到旧的（不公平）随机算法 (triggerGroupAiAction)");
                const remainingAmount = packetToOpen.totalAmount - Object.values(packetToOpen.claimedBy || {}).reduce((sum, val) => sum + val, 0);
                if (remainingCount === 1) {
                  claimedAmountAI = remainingAmount;
                } else {
                  const min = 0.01;
                  const max = remainingAmount - (remainingCount - 1) * min;
                  claimedAmountAI = Math.random() * (max - min) + min;
                }
              }

              claimedAmountAI = parseFloat(claimedAmountAI.toFixed(2));
              if (!packetToOpen.claimedBy) packetToOpen.claimedBy = {};
              packetToOpen.claimedBy[action.name] = claimedAmountAI;


              chat.history.push({
                role: 'system',
                type: 'pat_message',
                content: `${senderDisplayName} 领取了 ${getDisplayNameInGroup(chat, packetToOpen.senderName)} 的红包`,
                timestamp: actionTimestamp++
              });


              let hiddenContentForAI = `[系统提示：你 (${senderDisplayName}) 成功抢到了 ${claimedAmountAI.toFixed(2)} 元。`;
              if ((packetToOpen.unclaimedAmounts && packetToOpen.unclaimedAmounts.length === 0) || (Object.keys(packetToOpen.claimedBy).length >= packetToOpen.count)) {
                packetToOpen.isFullyClaimed = true;

                chat.history.push({
                  role: 'system',
                  type: 'pat_message',
                  content: `${getDisplayNameInGroup(chat, packetToOpen.senderName)} 的红包已被领完`,
                  timestamp: actionTimestamp++
                });

                let luckyKing = {
                  name: '',
                  amount: -1
                };
                Object.entries(packetToOpen.claimedBy).forEach(([name, amount]) => {
                  if (amount > luckyKing.amount) {
                    luckyKing = {
                      name,
                      amount
                    };
                  }
                });
                if (luckyKing.name) {
                  const luckyKingDisplayName = getDisplayNameInGroup(chat, luckyKing.name);
                  hiddenContentForAI += ` 红包已被领完，手气王是 ${luckyKingDisplayName}！`;
                }
              }
              hiddenContentForAI += ' 请根据这个结果发表你的评论。]';
              chat.history.push({
                role: 'system',
                content: hiddenContentForAI,
                timestamp: actionTimestamp++,
                isHidden: true
              });
            }
          }
          hasPerformedMajorAction = true;
          continue;
        }


        switch (action.type) {
          case 'quote_reply': {
            let originalMessage = null;


            if (msgData.target_content) {
              originalMessage = [...chat.history].reverse().find(m =>
                !m.isHidden &&
                (
                  m.content === msgData.target_content ||
                  (typeof m.content === 'string' && m.content.trim() === msgData.target_content.trim())
                )
              );

              if (!originalMessage) {
                console.warn(`[本轮引用失败] AI ${msgData.name} 尝试引用内容 "${(msgData.target_content || '').substring(0, 20)}..."，但在本轮历史中未找到。`);
              }
            }


            else if (msgData.target_timestamp) {
              originalMessage = chat.history.find(m => m.timestamp === msgData.target_timestamp);
            }


            if (originalMessage) {


              let quotedSenderDisplayName;

              if (originalMessage.role === 'user') {

                quotedSenderDisplayName = chat.settings.myNickname || '我';
              } else {

                if (chat.isGroup) {

                  quotedSenderDisplayName = getDisplayNameInGroup(chat, originalMessage.senderName, originalMessage.senderId);
                } else {

                  quotedSenderDisplayName = chat.name;
                }
              }

              const quoteContext = {
                timestamp: originalMessage.timestamp,
                senderName: quotedSenderDisplayName,
                senderId: originalMessage.role === 'user' ? 'user' : originalMessage.senderId,

                content: String(originalMessage.content || '').substring(0, 50)
              };


              aiMessage = {
                ...baseMessage,
                content: msgData.reply_content,
                quote: quoteContext
              };
            } else {

              console.warn(`引用回复失败: 找不到目标消息 (Content: ${msgData.target_content}, TS: ${msgData.target_timestamp})`);
              aiMessage = {
                ...baseMessage,
                content: msgData.reply_content
              };
            }
            break;
          }
          case 'sticker':
            if (action.meaning) {
              const sticker = findBestStickerMatch(action.meaning, state.userStickers);
              if (sticker) {
                aiMessage = {
                  ...baseMessage,
                  type: 'sticker',
                  content: sticker.url,
                  meaning: sticker.name
                };
              } else {
                console.warn(`AI (群聊后台) 尝试使用一个不存在的表情: "${action.meaning}"`);
                aiMessage = null;
              }
            } else {
              console.warn("AI (群聊后台) 发送了一个没有 'meaning' 的 sticker 指令。", action);
              aiMessage = {
                ...baseMessage,
                type: 'sticker',
                content: action.url,
                meaning: '未知表情'
              };
            }
            break;
          case 'qzone_post':
            const newPost = {
              type: action.postType || 'shuoshuo',
              content: action.content,
              timestamp: Date.now(),
              authorId: action.actorId,
              authorOriginalName: action.name,
              visibleGroupIds: null
            };
            await db.qzonePosts.add(newPost);
            updateUnreadIndicator(unreadPostsCount + 1);
            visibleSystemMessage = {
              content: `[${senderDisplayName} 发布了一条新动态]`
            };
            break;
          case 'qzone_comment':
            const postToComment = await db.qzonePosts.get(parseInt(action.postId));
            if (postToComment) {
              if (!postToComment.comments) postToComment.comments = [];
              const qzCommenterName = action.name;
              postToComment.comments.push({
                ...window.CharacterIdentity.commentFields(action),
                commenterName: qzCommenterName,
                replyTo: action.replyTo || null,
                text: action.commentText,
                timestamp: Date.now()
              });
              await db.qzonePosts.update(postToComment.id, {
                comments: postToComment.comments
              });
              updateUnreadIndicator(unreadPostsCount + 1);
              visibleSystemMessage = {
                content: `[${senderDisplayName} 评论了动态]`
              };
            }
            break;
          case 'qzone_like':
            const postToLike = await db.qzonePosts.get(parseInt(action.postId));
            if (postToLike) {
              if (!postToLike.likes) postToLike.likes = [];
              if (window.CharacterIdentity.addLike(postToLike, action.actorId, action.name)) {
                await db.qzonePosts.update(postToLike.id, {
                  likes: postToLike.likes,
                  likeActors: postToLike.likeActors
                });
                updateUnreadIndicator(unreadPostsCount + 1);
                visibleSystemMessage = {
                  content: `[${senderDisplayName} 点赞了动态]`
                };
              }
            }
            break;
          case 'ai_image':
            aiMessage = {
              ...baseMessage,
              type: 'ai_image',
              content: action.description,
              image_prompt: msgData.image_prompt
            };
            break;
          default:
            if (action.type === 'poll') {
              const pollOptions = typeof action.options === 'string' ?
                action.options.split('\n').filter(opt => opt.trim()) :
                (Array.isArray(action.options) ? action.options : []);
              if (pollOptions.length < 2) continue;
              aiMessage = {
                ...baseMessage,
                ...action,
                options: pollOptions,
                votes: {},
                isClosed: false
              };
            } else {
              const messageContent = action.content || action.message;
              aiMessage = {
                ...baseMessage,
                ...action
              };
              if (messageContent) aiMessage.content = messageContent;
            }
            break;
        }

        if (visibleSystemMessage) {
          chat.history.push({
            role: 'system',
            type: 'pat_message',
            content: visibleSystemMessage.content,
            timestamp: actionTimestamp++
          });
        } else if (aiMessage) {
          chat.history.push(aiMessage);
          if (!notificationSender) {
            notificationSender = senderDisplayName;
            notificationContent = aiMessage.type === 'ai_image' ? '[图片]' : (aiMessage.content || `[${aiMessage.type}]`);
          }
        }
        hasPerformedMajorAction = true;
      }

      if (hasPerformedMajorAction) {
        chat.lastActionTimestamp = Date.now();
        chat.unreadCount = (chat.unreadCount || 0) + responseArray.filter(a => a.type !== 'qzone_post' && a.type !== 'qzone_comment' && a.type !== 'qzone_like').length;
        if (notificationSender && notificationContent) {
          showNotification(chatId, `${notificationSender}: ${notificationContent}`);
        }
        await db.chats.put(chat);
      }

    } catch (error) {
      console.error(`群聊 "${chat.name}" 的独立行动失败:`, error);
    } finally {
      renderChatList();
    }
  }
