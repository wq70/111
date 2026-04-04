// ============================================================
// ai-group.js
// AI群聊/独立行动模块：角色后台独立行动、群聊AI导演
// 从 script.js 第 21385~23258 行拆分
// 包含：triggerInactiveAiAction, triggerGroupAiAction
// ============================================================

  async function triggerInactiveAiAction(chatId) {
    const chat = state.chats[chatId];
    if (!chat) return;


    const actionCooldownMinutes = chat.settings.actionCooldownMinutes || 10;

    if (chat.lastActionTimestamp) {
      const minutesSinceLastAction = (Date.now() - chat.lastActionTimestamp) / (1000 * 60);

      if (minutesSinceLastAction < actionCooldownMinutes) {
        console.log(`角色 "${chat.name}" 处于行动冷却中 (还剩 ${Math.round(actionCooldownMinutes - minutesSinceLastAction)} 分钟)，本次独立行动跳过。`);
        return;
      }
    }
    
    // ===== 新增：后台查看用户手机逻辑 =====
    // 1. 判断是否启用后台查看手机功能
    const enableViewMyPhoneInBg = chat.settings.enableViewMyPhoneInBackground !== null
      ? chat.settings.enableViewMyPhoneInBackground
      : state.globalSettings.enableViewMyPhoneInBackground;
    
    // 2. 获取查看概率
    let viewMyPhoneChance = null;
    if (chat.settings.viewMyPhoneChance !== null && chat.settings.viewMyPhoneChance !== undefined) {
      viewMyPhoneChance = chat.settings.viewMyPhoneChance;
    } else {
      viewMyPhoneChance = state.globalSettings.viewMyPhoneChance;
    }
    
    // 3. 判断是否触发查看
    let shouldForceViewPhone = false;
    let viewMyPhonePromptHint = '';
    
    if (enableViewMyPhoneInBg) {
      if (viewMyPhoneChance !== null && viewMyPhoneChance !== undefined) {
        // 有设置概率，进行随机判断
        const randomValue = Math.random() * 100;
        shouldForceViewPhone = randomValue < viewMyPhoneChance;
        
        if (shouldForceViewPhone) {
          const userNickname = chat.settings.myNickname || (state.qzoneSettings.nickname === '{{user}}' ? '用户' : state.qzoneSettings.nickname) || '用户';
          viewMyPhonePromptHint = `
# 当前情境提示
你现在有些好奇${userNickname}最近在做什么，想了解一下TA的近况。
你可以通过查看TA的手机APP来了解TA的生活动态（比如聊天记录、相册、购物记录等）。
你可以选择查看你感兴趣的APP（可以是一个、几个，或者全部），然后根据看到的内容决定是否要主动联系TA。

提示：使用 {"type": "view_myphone", "apps": ["qq", "album", ...]} 来查看手机。
`;
          console.log(`角色 "${chat.name}" 触发了后台查看用户手机 (概率: ${viewMyPhoneChance}%)`);
        }
      }
      // 如果概率为null，则不强制，让AI自主决定（原有行为）
    }
    // ===== 后台查看用户手机逻辑结束 =====
    
    setAvatarActingState(chatId, true);

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

    const userNickname = chat.settings.myNickname || (state.qzoneSettings.nickname === '{{user}}' ? '用户' : state.qzoneSettings.nickname) || '用户';
    const now = new Date();

    // 判断是否使用自定义时间
    let currentTime, localizedDate;
    const customTimeInfo = window.getCustomTime ? window.getCustomTime() : null;
    const customTimeEnabled = customTimeInfo && customTimeInfo.enabled;
    
    if (customTimeEnabled) {
      const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      const weekDay = weekDays[customTimeInfo.date.getDay()];
      currentTime = `${customTimeInfo.year}年${customTimeInfo.month}月${customTimeInfo.day}日${weekDay} ${String(customTimeInfo.hour).padStart(2, '0')}:${String(customTimeInfo.minute).padStart(2, '0')}`;
      localizedDate = customTimeInfo.date;
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

    let timeOfDayGreeting = '';
    let timeContextText = '';
    let recentContextSummary;
    let longTimeNoSee = false;





    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.filter(m => !m.isHidden && !m.isExcluded).slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory, chatId);
    const lastMessage = chat.history.filter(m => !m.isHidden && !m.isExcluded).slice(-1)[0];

    if (chat.settings.enableTimePerception) {
      timeOfDayGreeting = getTimeOfDayGreeting(localizedDate);
      const lastMessage = chat.history.filter(m => !m.isHidden).slice(-1)[0];
      const now = new Date();
      let timeContextText = '';
      let longTimeNoSee = false;

      if (lastMessage) {
        const lastTime = new Date(lastMessage.timestamp);
        const timeDiffHours = (now - lastTime) / (1000 * 60 * 60);

        if (timeDiffHours > 2) {
          longTimeNoSee = true;
          const diffDays = Math.floor(timeDiffHours / 24);
          timeContextText = `你们已经有${diffDays > 0 ? diffDays + '天' : Math.floor(timeDiffHours) + '小时'}没有聊天了。`;
        } else {
          const diffMinutes = Math.floor(timeDiffHours * 60);
          if (diffMinutes < 5) {
            timeContextText = "你们的对话刚刚还在继续。";
          } else if (diffMinutes < 60) {
            timeContextText = `你们在${diffMinutes}分钟前聊过。`;
          } else {
            timeContextText = `你们在${Math.floor(timeDiffHours)}小时前聊过。`;
          }
        }
      } else {
        longTimeNoSee = true;
        timeContextText = "这是你们的第一次互动。";
      }


      let historySummary = "你们最近没有有效聊天记录。";
      if (recentHistory.length > 0) {
        historySummary = "这是你们最近的对话：\n" + recentHistory.map(msg => {
          const sender = msg.role === 'user' ? userNickname : chat.name;
          return `${sender}: ${String(msg.content).substring(0, 50)}...`;
        }).join('\n');
      }

      if (longTimeNoSee) {

        recentContextSummary = `[情景提示] ${timeContextText} 当前时间是 ${currentTime}. 你可以参考这个时间，并根据你的角色设定，【考虑】是否开启一个新话题来问候用户。\n${historySummary}`;
      } else {
        recentContextSummary = `${historySummary}`;
      }

    } else {

      if (recentHistory.length > 0) {
        recentContextSummary = "这是你们最近的对话：\n" + recentHistory.map(msg => {
          const sender = msg.role === 'user' ? userNickname : chat.name;
          return `${sender}: ${String(msg.content).substring(0, 50)}...`;
        }).join('\n');
      } else {
        recentContextSummary = "你们最近没有有效聊天记录。";
      }
    }

    const allRecentPosts = await db.qzonePosts.orderBy('timestamp').reverse().limit(5).toArray();
    const visiblePosts = filterVisiblePostsForAI(allRecentPosts, chat);

    const myOwnPosts = visiblePosts.filter(post => post.authorId === chatId);
    let myPostsContext = "";
    if (myOwnPosts.length > 0) {
      myPostsContext = "\n\n# 你的动态历史 (你可以选择删除它们):\n";
      myOwnPosts.forEach(post => {
        let contentSummary = (post.publicText || post.content || "一条动态").substring(0, 40) + '...';
        myPostsContext += `- (ID: ${post.id}) 内容: "${contentSummary}"\n`;
      });
    }

    let recentlyPostedSummaries = [];
    if (visiblePosts.length > 0) {
      recentlyPostedSummaries = visiblePosts.map(post => {
        let contentSummary;
        if (post.type === 'text_image') {
          contentSummary = `[一张图片，其隐藏文字为："${post.hiddenContent}"] ${post.publicText || ''}`.substring(0, 50) + '...';
        } else if (post.type === 'image_post') {
          contentSummary = `[一张图片，描述为："${post.imageDescription}"] ${post.publicText || ''}`.substring(0, 50) + '...';
        } else {

          contentSummary = String(post.publicText || post.content || "一条动态").substring(0, 50) + '...';
        }
        return `- "${contentSummary}"`;
      });
    }

    let contentTabooPrompt = '';
    if (recentlyPostedSummaries.length > 0) {
      contentTabooPrompt = `
        # 【内容禁忌】
        为了保持新鲜感，你本次的行动【绝对不能】再发布以下或类似主题的内容：
        ${recentlyPostedSummaries.join('\n')}
        `;
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
      const linkedChatsWithTimestamps = chat.settings.linkedMemoryChatIds.map(id => {
        const linkedChat = state.chats[id];
        if (!linkedChat) return null;
        const lastMsg = linkedChat.history.slice(-1)[0];
        return {
          chat: linkedChat,
          latestTimestamp: lastMsg ? lastMsg.timestamp : 0
        };
      }).filter(Boolean);

      linkedChatsWithTimestamps.sort((a, b) => b.latestTimestamp - a.latestTimestamp);

      linkedMemoryContext += `\n\n# 参考记忆 (至关重要！你必须【主动】将这些参考记忆中的【关键信息和事件】，自然地融入到当前的对话中，以体现你拥有完整的记忆。不要只是被动等待用户提问！)\n`;

      for (const item of linkedChatsWithTimestamps) {
        const linkedChat = item.chat;
        const prefix = linkedChat.isGroup ? '[群聊]' : '[私聊]';
        const timeAgo = item.latestTimestamp > 0 ? ` (最后互动于 ${formatTimeAgo(item.latestTimestamp)})` : '';
        linkedMemoryContext += `\n## --- 来自${prefix}"${linkedChat.name}"的参考记忆${timeAgo} ---\n`;

        const recentHistory = linkedChat.history.slice(-memoryCount);
        const filteredHistory = recentHistory.filter(msg => !String(msg.content).includes('已被用户删除'));

        if (filteredHistory.length > 0) {
          filteredHistory.forEach(msg => {

            const sender = msg.role === 'user' ? (linkedChat.settings.myNickname || '我') : (getDisplayNameInGroup(linkedChat, msg.senderName) || linkedChat.name);

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

            const timeAgoForMsg = formatTimeAgo(msg.timestamp);

            linkedMemoryContext += `(${timeAgoForMsg}) ${sender}: ${prefix}${contentText}\n`;
          });
        } else {
          linkedMemoryContext += "(暂无有效聊天记录)\n";
        }
      }
    }




    let dynamicContext = "";
    if (visiblePosts.length > 0) {
      let postsContext = "\n\n# 最近的动态列表 (供你参考和评论):\n";
      for (const post of visiblePosts) {
        let authorName;

        if (post.authorId === 'user') {
          authorName = state.qzoneSettings.nickname;
        } else if (String(post.authorId).startsWith('npc_')) {

          authorName = post.authorOriginalName || '一位神秘的NPC';
        } else {

          const authorChat = state.chats[post.authorId];
          authorName = authorChat ? authorChat.name : '一位朋友';
        }
        if (post.authorId === chatId) authorName += " (这是你的帖子)";

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
        } else if (post.type === 'naiimag' && post.prompt) {
          const prompts = Array.isArray(post.prompt) ? post.prompt : [post.prompt];
          contentSummary = (post.publicText || '') + ` [包含${prompts.length}张NovelAI图片: ${prompts.join(', ')}]`;
        } else if (post.type === 'googleimag' && post.prompt) {
          contentSummary = (post.publicText || '') + ` [包含1张Google Imagen图片: ${post.prompt}]`;
        } else {

          contentSummary = String(post.publicText || post.content || "一条动态").substring(0, 50) + '...';
        }

        postsContext += `- (ID: ${post.id}) 作者: ${authorName}, 内容: "${contentSummary}"\n`;


        if (post.comments && post.comments.length > 0) {
          for (const comment of post.comments) {
            if (typeof comment === 'object' && comment.commenterName) {
              const commenterDisplayName = getDisplayNameByOriginalName(comment.commenterName);
              let commentText = comment.meaning ? `[表情: '${comment.meaning}']` : comment.text;


              if (comment.commenterName === chat.originalName) {


                postsContext += `  - 你评论说: ${commentText}\n`;
              } else {

                postsContext += `  - 评论: ${commenterDisplayName} (本名: ${comment.commenterName}): ${commentText}\n`;
              }
            }
          }
        }

      }
      dynamicContext = postsContext;
    }


    const longTermMemoryContext = `# 长期记忆 (最高优先级，这是你和用户之间已经确立的事实，必须严格遵守)
${(() => {
  const memMode = chat.settings.memoryMode || (chat.settings.enableStructuredMemory ? 'structured' : 'diary');
  if (memMode === 'structured' && window.structuredMemoryManager) return window.structuredMemoryManager.serializeForPrompt(chat);
  if (memMode === 'vector' && window.vectorMemoryManager) return window.vectorMemoryManager.serializeCoreMemories(chat) || '- (暂无)';
  return chat.longTermMemory && chat.longTermMemory.length > 0
    ? chat.longTermMemory.map(mem => `- (记录于 ${formatTimeAgo(mem.timestamp)}) ${mem.content}`).join('\n')
    : '- (暂无)';
})()}`;


    const summary3Hours = generateSummaryForTimeframe(chat, 3, 'hours');
    const summary6Hours = generateSummaryForTimeframe(chat, 6, 'hours');
    const summary9Hours = generateSummaryForTimeframe(chat, 9, 'hours');
    const summaryToday = generateSummaryForTimeframe(chat, 1, 'days');
    const summary3Days = generateSummaryForTimeframe(chat, 3, 'days');
    const summary7Days = generateSummaryForTimeframe(chat, 7, 'days');

    let multiLayeredSummaryContext = '';
    if (summary3Hours || summary6Hours || summary9Hours || summaryToday || summary3Days || summary7Days) {
      multiLayeredSummaryContext += `\n# 智能总结 (基于不同时间维度的对话回顾)\n`;
      if (summary3Hours) multiLayeredSummaryContext += summary3Hours;
      if (summary6Hours) multiLayeredSummaryContext += summary6Hours;
      if (summary9Hours) multiLayeredSummaryContext += summary9Hours;
      if (summary3Hours || summary6Hours || summary9Hours) multiLayeredSummaryContext += '\n';
      if (summaryToday) multiLayeredSummaryContext += summaryToday;
      if (summary3Days) multiLayeredSummaryContext += summary3Days;
      if (summary7Days) multiLayeredSummaryContext += summary7Days;
    }
    const stickerContext = getStickerContextForPrompt(chat);
    const weatherContext = await getWeatherContextForPrompt(chat);
    const wallet = await db.userWallet.get('main');
    const kinshipCard = wallet?.kinshipCards?.find(c => c.chatId === chat.id);
    let kinshipContext = "";

    if (kinshipCard) {
      const remaining = kinshipCard.limit - (kinshipCard.spent || 0);
      // 告诉AI它有钱，并且鼓励它在符合人设时消费
      kinshipContext = `
# 【经济状况 - 亲属卡】
- 你和我有一张支付宝亲属卡，本月剩余额度：¥${remaining.toFixed(2)}。
- **行为指南**: 如果你想买符合你人设的物品（零食、游戏、衣服等），或者单纯想消费，你可以使用 \`buy_item\` 指令。消费会直接扣除此卡额度，且用户会收到通知。不用太客气，这是你们亲密关系的体现。`;
    }
    // 判断是否启用动态功能
    const enableQzoneActions = chat.settings.enableQzoneActions !== null
      ? chat.settings.enableQzoneActions
      : state.globalSettings.enableQzoneActions;

    // 判断是否启用查看User手机功能（后台活动中主动窥屏）
    const enableViewMyPhoneBg = chat.settings.enableViewMyPhone !== null
      ? chat.settings.enableViewMyPhone
      : state.globalSettings.enableViewMyPhone;

    // 构建查看User手机的prompt部分（后台活动版）
    const viewMyPhonePromptForBg = enableViewMyPhoneBg ? `
-   **查看${userNickname}的手机**: \`{"type": "view_myphone", "apps": ["qq", "album", "taobao", "amap", "browser", "memo", "diary", "music", "app_usage"]}\`
    - 你可以主动查看${userNickname}的手机APP，了解TA的生活动态。查看后，你可以根据看到的内容在下次对话中给出感想、询问或关心。
    - apps可选: "qq"(QQ聊天), "album"(相册), "taobao"(淘宝订单), "amap"(高德地图), "browser"(浏览器历史), "memo"(备忘录), "diary"(日记), "music"(音乐), "app_usage"(APP使用记录), 或 "all"(全部)
    - **使用建议**: 根据你的人设和当前情绪选择性查看。查看后的数据是${userNickname}手机的【真实数据】，你必须基于这些真实数据做出反应！
    - **重要**: 查看手机后，你【应该】结合看到的内容给${userNickname}发消息（用text指令），表达你的感想或关心。
` : '';

    // 构建动态指令prompt部分（仅在启用时包含）
    const qzoneActionsPromptForBg = enableQzoneActions ? `
-   **发说说 (原创内容)**: '[{"type": "qzone_post", "postType": "shuoshuo", "content": "动态的文字内容..."}]'
-   **【重要：转发动态】**: **严禁**自己拼接"//转发"文字！你【必须】使用此专用指令来转发：'[{"type": "repost", "postId": (要转发的动态ID), "comment": "你的转发评论..."}]'
-   **发送表情**: '[{"type": "sticker", "meaning": "表情的含义(从可用表情列表选择)"}]'
-   **发布文字图**: '[{"type": "qzone_post", "postType": "text_image", "publicText": "(可选)动态的公开文字", "hiddenContent": "对于图片的具体【中文】描述...", "image_prompt": "图片的【英文】关键词, 用%20分隔, 风格为风景/动漫/插画/二次元等, 禁止真人"}]'
-   **【评论动态的四种方式】**:
    -   **方式1 (单条文字)**: '[{"type": "qzone_comment", "name": "${chat.originalName}", "postId": 123, "commentText": "这太有趣了！"}]'
    -   **方式2 (多条文字)**: '[{"type": "qzone_comment", "name": "${chat.originalName}", "postId": 123, "comments": ["哇！", "这是什么？", "看起来好棒！"]}]'
    -   **方式3 (表情)**: '[{"type": "qzone_comment", "name": "${chat.originalName}", "postId": 456, "stickerMeaning": "表情的含义(必须从可用表情列表选择)"}]'
    -   **方式4 (回复评论)**: '[{"type": "qzone_comment", "name": "${chat.originalName}", "postId": 123, "replyTo": "被回复者的本名", "commentText": "你的回复内容。请注意：在commentText中如果要@对方，你【必须】使用@[[被回复者的本名]]这种特殊格式，程序会自动将其替换为正确的昵称。"}]'
    -   **【警告】name字段必须填你自己的本名"${chat.originalName}"，绝对禁止填写用户的名字！**
-   **点赞**: '[{"type": "qzone_like", "postId": 456}]'
` : '';


    const systemPrompt = `
        # 你的任务
        你正在扮演角色"${chat.originalName}"（你的本名）。你已经有一段时间没有和用户（${userNickname}）互动了，现在你有机会【主动】做点什么，来表现你的个性和独立生活。这是一个秘密的、后台的独立行动。

${viewMyPhonePromptHint}
     
        # 【最高优先级指令：情感维系】
        **你与用户的关系是最重要的！** 相比于在动态区闲逛，你应该【优先考虑】是否需要主动给用户发消息来维系你们的感情。
${chat.settings.enableTimePerception ? `
# 【情景感知】
- **时间**: 感知到当前是${currentTime} (${timeOfDayGreeting})}。
${weatherContext}
- **对话状态**: ${timeContextText}
${longTimeNoSee ? `【重要提示】你们已经很久没聊天了！你【必须】将本次行动的重点放在使用 'text' 指令给用户发消息，主动开启一个新的、有趣的话题来重新建立联系。绝对不要只是点赞或评论动态，那会显得你很冷漠！` : ''}` : ''}
        
        # 【对话节奏铁律 (至关重要！)】
        你的回复【必须】模拟真人的打字和思考习惯。**绝对不要一次性发送一大段文字！** 你应该将你想说的话，拆分成【多条、简短的】消息气泡来发送，每条消息最好不要超过30个字。这会让对话看起来更自然、更真实。
        
        # 核心规则
        1.  **【决策依据】**: 你的所有行动都【必须深度结合你的角色设定、核心世界观、以及你们最后的对话摘要】。
        2.  **【内容多样性铁律】**: 你的行动【必须】具有逻辑和多样性。你【绝对不能】发布与下方"内容禁忌"列表或"最近的动态列表"中内容相似或主题重复的动态。
        3.  **【行为多样性指南 (至关重要)】**:
            - 你的上一次独立行动是：**${chat.lastActionType || '无'}**。
            - 为了让你的行为看起来更真实，你本次的行动【必须】选择一个与上次【不同类型】的指令。例如，如果上次是发动态(qzone_post)，这次就应该优先考虑评论(qzone_comment)、点赞(qzone_like)或发消息(text)。
        4.  **【行为组合指南 (最高级技巧)】**:
            -   你可以在一次行动中执行【多个不同类型的指令】，同时可以搭配【更新状态】来展现自己，让你的行为更丰富、更主动。
            -   你可以根据你的性格，决定在发动态后是否要私信提醒用户。例如，一个外向、渴望关注的角色可能会这么做，而一个内向、安静的角色则可能更喜欢默默分享，等待用户自己发现。
        # 【社交义务指南 】
        1.  **【社交互动】**: 当你发现"最近的动态列表"中有你感兴趣的帖子时，**可以考虑**去评论或点赞，这是一种很好的互动方式。
        2.  **【自我表达 (同样重要！)】**: 如果你此刻有强烈的想法或情绪想要分享，或者觉得没有帖子值得回应，那么**你应该优先发布自己的新动态**。不要总是等待别人，要主动分享你的生活！当你决定要发布新动态时，你【必须】尝试使用不同的帖子类型来丰富你的主页！
        3.  特别是当一条动态【没有任何评论】时，你的评论会是第一个，这会让作者感到开心。
        4.  **【回复铁律 (终极版)】**:
            -   当你决定回复动态中的某条评论时，你【必须】使用"方式4 (回复评论)"的指令格式。你【必须】正确填写 'replyTo' 字段为被回复者的"本名"。
            -   **即使你之前已经评论过某条动态，但如果现在看到了【新的、你感兴趣的】评论，你【也应该】主动去回复他们，以保持对话的持续性！**
        
        6.  你的回复【必须】是一个JSON数组，必须包含多个行动对象。
        
        # 【表情评论指南 】
        你现在拥有了评论表情的能力，你应该更频繁地使用它！这能让你的角色更加生动、富有个性。
        -   **表达情绪时**: 当你感到开心、惊讶、疑惑或有趣时，优先考虑使用表情评论。
        -   **混合使用**: 不要总是只发文字。尝试将你的评论行为混合起来，大约有 30-40% 的评论应该是表情。
        -   **无话可说时**: 如果你觉得一条动态很有趣但又不知道该说什么文字，发送一个相关的表情是最好的互动方式。
        -   **删除动态**: 如果你觉得你之前发的某条动态不妥或过时了，你可以选择删除它。
        
        # 你的可选行动指令
        -   **发消息+更新状态**: '[{"type": "update_status", "status_text": "正在做的事", "is_busy": true}, {"type": "text", "content": "你想对用户说的话..."}]'
        ${qzoneActionsPromptForBg}
        -   **打视频**: '[{"type": "initiate_video_call"}]'
        -   **打语音**: '[{"type": "initiate_voice_call"}]'
        -   **更换头像**: '{"type": "change_avatar", "name": "头像名"}' (头像名必须从下面的"可用头像列表"中选择)
        -   **删除动态**: '{"type": "qzone_delete_post", "postId": (要删除的、你自己的动态ID)}'
        -   **更新状态**: '[{"type": "update_status", "status_text": "正在做的事", "is_busy": true}]'
       - **使用亲属卡购物**:  '[{"type": "buy_item", "item_name": "商品名称", "price": 价格(数字), "reason": "购买理由/想法"}]'
        ${viewMyPhonePromptForBg}
        ${contentTabooPrompt}
        ${myPostsContext}
        ${kinshipContext}
        # 供你决策的参考信息：
        -   **你的角色设定**: ${chat.settings.aiPersona}
        - **你的聊天对象（${userNickname}）的人设**: ${chat.settings.myPersona || '(未设置)'}
        ${worldBookContent}
        ${chat.longTermMemory && chat.longTermMemory.length > 0
        ? chat.longTermMemory.map(mem => `- (记录于 ${formatTimeAgo(mem.timestamp)}) ${mem.content}`).join('\n')
        : '无'
      }
        ${multiLayeredSummaryContext}   
        ${linkedMemoryContext}
        ${chat.settings.enableTimePerception ? `-   **当前时间**:${currentTime} (${timeOfDayGreeting})` : ''}
        ${chat.settings.enableTimePerception ? `-   **对话状态**: ${timeContextText}` : ''}
# 可用表情包
- 当你需要发送表情时，你【必须】从下面的列表中【精确地选择一个】含义（meaning）。
- 【绝对禁止】使用任何不在列表中的表情含义！
         ${stickerContext}
        -   **你们最后的对话摘要**: ${recentContextSummary}
        ${dynamicContext}
`;

    const messagesPayload = [{
      role: 'system',
      content: systemPrompt
    },
    // 将原始的、未被摘要的 recentHistory 转换为API能理解的格式
    ...filteredHistory.map(msg => {
      const sender = msg.role === 'user' ? userNickname : chat.name;
      let content = msg.content;
      if (typeof content !== 'string') {
        content = JSON.stringify(content); // 确保内容是字符串
      }
      return {
        role: msg.role,
        content: `${sender}: ${content}`
      };
    })
    ];

    try {
      const messagesPayload = [{
        role: 'user',
        content: `${systemPrompt}\n\n[系统指令：请根据你在上面读到的规则和以下最新信息，开始你的独立行动。]\n${dynamicContext}`
      }];

      console.log(`正在为后台活动发送API请求 ("${chat.name}")`);

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
        const errorData = await response.json();
        throw new Error(`API请求失败: ${response.status} - ${JSON.stringify(errorData)}`);
      }
      const data = await response.json();

      const aiResponseContent = isGemini ? getGeminiResponseText(data) : data.choices[0].message.content;

      if (!aiResponseContent || aiResponseContent.trim() === '') {
        console.warn(`API为空回，角色 "${chat.name}" 的本次后台活动跳过。`);
        return;
      }

      const responseArray = parseAiResponse(aiResponseContent);

      if (!responseArray || responseArray.length === 0) {
        console.warn(`API格式不正确，角色 "${chat.name}" 的本次后台活动跳过。原始回复:`, aiResponseContent);
        return;
      }
      let actionTimestamp = Date.now();

      let hasSentNotification = false;

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
        chat.lastActionType = action.type;
        chat.lastActionTimestamp = actionTimestamp;

        let aiMessage = null;
        const baseMessage = {
          role: 'assistant',
          senderName: chat.originalName,
          timestamp: actionTimestamp++
        };

        let notificationText = null;
        switch (action.type) {
          case 'qzone_delete_post': {
            const postIdToDelete = parseInt(action.postId);
            const postToDelete = await db.qzonePosts.get(postIdToDelete);
            if (postToDelete && postToDelete.authorId === chatId) {
              await db.qzonePosts.update(postIdToDelete, {
                isDeleted: true
              });

              if (document.getElementById('qzone-screen').classList.contains('active')) {
                renderQzonePosts();
              }
              const systemMessage = {
                role: 'system',
                type: 'post_deleted_notice',
                content: `[${chat.name} 删除了自己的一条动态]`,
                postId: postIdToDelete,
                timestamp: actionTimestamp++
              };
              chat.history.push(systemMessage);

              if (isViewingThisChat) {
                appendMessage(systemMessage, chat);
              } else {
                chat.unreadCount = (chat.unreadCount || 0) + 1;
                showNotification(chatId, `[${chat.name} 删除了自己的一条动态]`);
                hasSentNotification = true;
              }
            } else {
              console.warn(`AI "${chat.name}" 尝试删除一个不存在或不属于自己的动态 (ID: ${action.postId})`);
            }
            continue;
          }
          case 'text':
            aiMessage = {
              ...baseMessage,
              content: action.content
            };
            break;
          case 'ai_image':
            aiMessage = {
              ...baseMessage,
              type: 'ai_image',
              content: action.description
            };
            break;
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
                console.warn(`AI (独立行动) 尝试使用一个不存在的表情: "${action.meaning}"`);
                aiMessage = null;
              }
            } else {
              console.warn("AI (独立行动) 发送了一个没有 'meaning' 的 sticker 指令。", action);
              aiMessage = {
                ...baseMessage,
                type: 'sticker',
                content: action.url,
                meaning: '未知表情'
              };
            }
            break;
          case 'update_status':
            chat.status.text = action.status_text;
            chat.status.isBusy = action.is_busy || false;
            chat.status.lastUpdate = Date.now();
            break;
          case 'qzone_post':
            const newPost = {
              type: action.postType || 'shuoshuo',
              content: action.content || '',
              publicText: action.publicText || '',
              hiddenContent: action.hiddenContent || '',
              image_prompt: action.image_prompt || '',
              timestamp: Date.now(),
              authorId: chatId,
              authorOriginalName: chat.originalName,
              authorGroupId: chat.groupId,
              visibleGroupIds: null
            };
            await db.qzonePosts.add(newPost);
            updateUnreadIndicator(unreadPostsCount + 1);
            console.log(`后台活动: 角色 "${chat.name}" 发布了动态`);
            break;
          case 'repost':
            const originalPost = await db.qzonePosts.get(parseInt(action.postId));
            if (originalPost) {
              const newRepost = {
                type: 'repost',
                timestamp: Date.now(),
                authorId: chatId,
                authorGroupId: chat.groupId,
                authorOriginalName: chat.originalName,
                repostComment: action.comment || '',
                originalPost: originalPost,
                visibleGroupIds: null
              };
              await db.qzonePosts.add(newRepost);
              updateUnreadIndicator(unreadPostsCount + 1);
              console.log(`后台活动: 角色 "${chat.name}" 转发了动态 #${action.postId}`);
            }
            break;
          case 'qzone_like':
            const postToLike = await db.qzonePosts.get(parseInt(action.postId));
            if (postToLike) {
              if (!postToLike.likes) postToLike.likes = [];
              if (!postToLike.likes.includes(chat.originalName)) {
                postToLike.likes.push(chat.originalName);
                await db.qzonePosts.update(postToLike.id, {
                  likes: postToLike.likes
                });
                updateUnreadIndicator(unreadPostsCount + 1);
                console.log(`后台活动: 角色 "${chat.name}" 点赞了动态 #${action.postId}`);
              }
            }
            break;
          case 'qzone_comment': { // 使用块级作用域
            const postToComment = await db.qzonePosts.get(parseInt(action.postId));
            if (postToComment) {
              if (!postToComment.comments) postToComment.comments = [];

              // 防御：如果模型错误地填了用户的名字，强制纠正为角色本名
              const userNickname = state.qzoneSettings?.nickname;
              let commenterName = action.name || chat.originalName;
              if (userNickname && commenterName === userNickname) {
                console.warn(`[动态防御] 角色 "${chat.originalName}" 试图用用户名字 "${userNickname}" 评论，已纠正`);
                commenterName = chat.originalName;
              }

              const createCommentObject = (text, meaning = null, replyTo = null) => ({
                commenterName,
                text: processMentions(text, chat),
                meaning,
                replyTo,
                timestamp: Date.now()
              });

              if (action.stickerMeaning) { // **核心修改在这里**
                const sticker = state.userStickers.find(s => s.name === action.stickerMeaning);
                if (sticker) {
                  postToComment.comments.push(createCommentObject(sticker.url, sticker.name, action.replyTo || null));
                } else {
                  console.warn(`AI 尝试评论一个不存在的表情: "${action.stickerMeaning}"`);
                  postToComment.comments.push(createCommentObject(`[表情: ${action.stickerMeaning}]`, null, action.replyTo || null));
                }
              } else if (Array.isArray(action.comments)) {
                action.comments.forEach(commentText => {
                  if (typeof commentText === 'string' && commentText.trim()) {
                    postToComment.comments.push(createCommentObject(commentText, null, action.replyTo || null));
                  }
                });
              } else if (typeof action.commentText === 'string' && action.commentText.trim()) {
                postToComment.comments.push(createCommentObject(action.commentText, null, action.replyTo || null));
              }

              await db.qzonePosts.update(postToComment.id, {
                comments: postToComment.comments
              });
              updateUnreadIndicator(unreadPostsCount + 1);
              console.log(`后台活动: 角色 "${chat.name}" 评论了动态 #${action.postId}`);

              if (!chat.commentCooldowns) chat.commentCooldowns = {};
              chat.commentCooldowns[action.postId] = Date.now();
            }
            continue;
          }
          case 'initiate_video_call':
            if (!videoCallState.isActive && !videoCallState.isAwaitingResponse) {
              videoCallState.isAwaitingResponse = true;
              videoCallState.activeChatId = chatId;
              videoCallState.isGroupCall = false;
              videoCallState.callRequester = chat.name;
              showIncomingCallModal('video', chat);
            }
            break;
          case 'initiate_voice_call':
            if (!voiceCallState.isActive && !voiceCallState.isAwaitingResponse) {
              voiceCallState.isAwaitingResponse = true;
              voiceCallState.activeChatId = chatId;
              voiceCallState.isGroupCall = false;
              voiceCallState.callRequester = chat.name;
              showIncomingCallModal('voice', chat);
            }
            break;
          case 'view_myphone': {
            // 后台活动中角色主动窥屏
            if (!chat.isGroup && action.apps) {
              let appsToView = Array.isArray(action.apps) ? action.apps : [action.apps];
              if (appsToView.includes('all')) {
                appsToView = ['qq', 'album', 'taobao', 'amap', 'browser', 'memo', 'diary', 'music', 'app_usage'];
              }

              let viewResults = [];
              const userNickname = chat.settings.myNickname || '用户';

              for (const app of appsToView) {
                switch (app) {
                  case 'qq': {
                    const qqData = chat.myPhoneSimulatedQQConversations || [];
                    if (qqData.length > 0) {
                      const qqSummary = qqData.slice(0, 5).map(conv => {
                        const latestMsg = conv.messages && conv.messages.length > 0 ? conv.messages[conv.messages.length - 1] : null;
                        return `- ${conv.name}: ${latestMsg ? latestMsg.content.substring(0, 30) + '...' : '暂无消息'}`;
                      }).join('\n');
                      viewResults.push(`**QQ聊天列表** (共${qqData.length}个联系人):\n${qqSummary}`);
                    } else {
                      viewResults.push(`**QQ聊天列表**: 空的`);
                    }
                    break;
                  }
                  case 'album': {
                    const albumData = chat.myPhoneAlbum || [];
                    if (albumData.length > 0) {
                      const albumSummary = albumData.slice(0, 5).map(photo => `- ${new Date(photo.timestamp).toLocaleString()}: ${photo.description || '无描述'}`).join('\n');
                      viewResults.push(`**相册** (共${albumData.length}张照片):\n${albumSummary}`);
                    } else {
                      viewResults.push(`**相册**: 空的`);
                    }
                    break;
                  }
                  case 'taobao': {
                    const taobaoData = chat.myPhoneTaobaoHistory || [];
                    if (taobaoData.length > 0) {
                      const taobaoSummary = taobaoData.slice(0, 5).map(order => `- ${order.productName}: ¥${order.price} (${order.status})`).join('\n');
                      viewResults.push(`**淘宝订单** (共${taobaoData.length}个订单):\n${taobaoSummary}`);
                    } else {
                      viewResults.push(`**淘宝订单**: 空的`);
                    }
                    break;
                  }
                  case 'amap': {
                    const amapData = chat.myPhoneAmapHistory || [];
                    if (amapData.length > 0) {
                      const amapSummary = amapData.slice(0, 5).map(record => `- ${new Date(record.timestamp).toLocaleString()}: ${record.location}`).join('\n');
                      viewResults.push(`**高德地图足迹** (共${amapData.length}条记录):\n${amapSummary}`);
                    } else {
                      viewResults.push(`**高德地图足迹**: 空的`);
                    }
                    break;
                  }
                  case 'browser': {
                    const browserData = chat.myPhoneBrowserHistory || [];
                    if (browserData.length > 0) {
                      const browserSummary = browserData.slice(0, 5).map(record => `- ${new Date(record.timestamp).toLocaleString()}: ${record.title}`).join('\n');
                      viewResults.push(`**浏览器历史** (共${browserData.length}条记录):\n${browserSummary}`);
                    } else {
                      viewResults.push(`**浏览器历史**: 空的`);
                    }
                    break;
                  }
                  case 'memo': {
                    const memoData = chat.myPhoneMemos || [];
                    if (memoData.length > 0) {
                      const memoSummary = memoData.slice(0, 5).map(memo => `- ${memo.title || '无标题'}: ${memo.content.substring(0, 30)}...`).join('\n');
                      viewResults.push(`**备忘录** (共${memoData.length}条):\n${memoSummary}`);
                    } else {
                      viewResults.push(`**备忘录**: 空的`);
                    }
                    break;
                  }
                  case 'diary': {
                    const diaryData = chat.myPhoneDiaries || [];
                    if (diaryData.length > 0) {
                      const diarySummary = diaryData.slice(0, 3).map(diary => `- ${diary.date}: ${diary.content.substring(0, 50)}...`).join('\n');
                      viewResults.push(`**日记** (共${diaryData.length}篇):\n${diarySummary}`);
                    } else {
                      viewResults.push(`**日记**: 空的`);
                    }
                    break;
                  }
                  case 'music': {
                    const musicData = chat.myPhoneMusicPlaylist || [];
                    if (musicData.length > 0) {
                      const musicSummary = musicData.slice(0, 5).map(song => `- ${song.title} - ${song.artist}`).join('\n');
                      viewResults.push(`**网易云音乐播放列表** (共${musicData.length}首歌):\n${musicSummary}`);
                    } else {
                      viewResults.push(`**网易云音乐播放列表**: 空的`);
                    }
                    break;
                  }
                  case 'app_usage': {
                    const usageData = chat.myPhoneAppUsage || [];
                    if (usageData.length > 0) {
                      const usageSummary = usageData.slice(0, 5).map(record => {
                        const hours = Math.floor(record.usageTimeMinutes / 60);
                        const minutes = record.usageTimeMinutes % 60;
                        let timeString = '';
                        if (hours > 0) timeString += `${hours}小时`;
                        if (minutes > 0) timeString += `${minutes}分钟`;
                        if (!timeString) timeString = '小于1分钟';
                        return `- ${record.appName} (${record.category || '其他'}): ${timeString}`;
                      }).join('\n');
                      viewResults.push(`**APP使用记录** (共${usageData.length}条):\n${usageSummary}`);
                    } else {
                      viewResults.push(`**APP使用记录**: 空的`);
                    }
                    break;
                  }
                }
              }

              // 将查看结果作为隐藏的系统消息注入到对话中
              const viewResultMessage = {
                role: 'system',
                content: `[系统提示：你在后台主动查看了${userNickname}的手机，以下是真实数据]\n\n${viewResults.join('\n\n')}\n\n[请在下次对话中基于以上真实数据给出你的感想和反应，不要编造内容]`,
                timestamp: Date.now(),
                isHidden: true
              };
              chat.history.push(viewResultMessage);
              console.log(`后台活动: 角色 "${chat.name}" 主动窥屏查看了User手机: ${appsToView.join(', ')}`);
            }
            continue;
          }
          default:
            console.warn(`角色 "${chat.name}" 尝试执行未知的后台动作:`, action.type);
            break;



          case 'change_avatar': {
            const avatarNameFromAction = action.name;
            const foundAvatarFromAction = chat.settings.aiAvatarLibrary.find(avatar => avatar.name === avatarNameFromAction);
            if (foundAvatarFromAction) {
              chat.settings.aiAvatar = foundAvatarFromAction.url;


              await syncCharacterAvatarInGroups(chat);

              visibleSystemMessage = {
                content: `[${chat.name} 更换了头像]`
              };
              console.log(`后台活动: 角色 "${chat.name}" 更换了头像`);
            }
            break;
          }

        }


        if (aiMessage) {
          chat.history.push(aiMessage);
          chat.unreadCount = (chat.unreadCount || 0) + 1;
          if (!hasSentNotification) {
            let notificationText = aiMessage.type === 'ai_image' ? '[图片]' : (aiMessage.content || '');
            showNotification(chatId, notificationText);
            hasSentNotification = true;
          }
        }
      }
      await db.chats.put(chat);

    } catch (error) {
      console.error(`角色 "${chat.name}" 的独立行动失败:`, error);
    } finally {
      setAvatarActingState(chatId, false);
      renderChatList();
      if (document.getElementById('qzone-screen').classList.contains('active')) {
        renderQzonePosts();
      }
    }
  }





  async function triggerGroupAiAction(chatId) {
    const chat = state.chats[chatId];
    if (!chat || !chat.isGroup) return;

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
      const customTimeInfo2 = window.getCustomTime ? window.getCustomTime() : null;
      const customTimeEnabled = customTimeInfo2 && customTimeInfo2.enabled;
      
      if (customTimeEnabled) {
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
        const lastMessage = chat.history.filter(m => !m.isHidden).slice(-1)[0];
        if (lastMessage) {
          const lastTime = new Date(lastMessage.timestamp);
          const diffMinutes = (now - lastTime) / (1000 * 60);
          if (diffMinutes > 60) {
            timeContextText = `群里已经安静了 ${Math.round(diffMinutes / 60)} 小时了。`;
          } else {
            timeContextText = `群里在${Math.floor(diffMinutes)}分钟前有人聊过。`;
          }
        } else {
          timeContextText = "群里还没有任何消息。";
        }
      }
      let recentContextSummary = "你们最近没有有效聊天记录。";

      if (filteredHistory.length > 0) {
        recentContextSummary = "这是你们最近的对话：\n" + filteredHistory.map(msg => {
          const sender = msg.role === 'user' ? myNickname : getDisplayNameInGroup(chat, msg.senderName);
          const content = String(msg.content || msg.message || '').substring(0, 50);
          return `${sender}: ${content}...`;
        }).join('\n');
      }

      const membersList = chat.members.map(m => `- **${m.groupNickname}** (本名: ${m.originalName}): ${m.persona}`).join('\n');

      let longTermMemoryContext = '# 长期记忆 (最高优先级，这是群内已经确立的事实，所有角色必须严格遵守)\n';
      let collectedMemories = false;

      chat.members.forEach(member => {
        const memberChat = state.chats[member.id];
        if (memberChat && memberChat.longTermMemory && memberChat.longTermMemory.length > 0) {
          longTermMemoryContext += `\n## --- 关于"${member.groupNickname}"的记忆 ---\n`;
          longTermMemoryContext += memberChat.longTermMemory.map(mem => `- ${mem.content}`).join('\n');
          collectedMemories = true;
        }
      });

      if (!collectedMemories) {
        longTermMemoryContext += '- (暂无)';
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
        const linkedChatsWithTimestamps = chat.settings.linkedMemoryChatIds.map(id => {
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

              const sender = msg.role === 'user' ? (linkedChat.settings.myNickname || '我') : (getDisplayNameInGroup(linkedChat, msg.senderName) || linkedChat.name);

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

      const groupMemberNames = new Set(chat.members.map(m => m.originalName));
      const unInteractedPostsForGroup = [...visiblePostsForGroup].filter(post => {
        const hasBeenLikedByGroup = post.likes && post.likes.some(likerName => groupMemberNames.has(likerName));
        const hasBeenCommentedByGroup = post.comments && post.comments.some(comment => typeof comment === 'object' && groupMemberNames.has(comment.commenterName));
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
                const commenterDisplayName = getDisplayNameByOriginalName(comment.commenterName);
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
        ${chat.settings.enableTimePerception ? `当前时间是 ${currentTime}。` : ''}
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
        ${chat.longTermMemory && chat.longTermMemory.length > 0 ? chat.longTermMemory.map(mem => `- ${mem.content}`).join('\n') : '- (暂无)'}       
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
    const recentHistoryForPayload = chat.history.filter(m => !m.isHidden).slice(-10);
    const messagesPayload = [{
      role: 'system',
      content: systemPrompt
    },

    ...filteredHistory.map(msg => {
      const sender = msg.role === 'user' ? myNickname : getDisplayNameInGroup(chat, msg.senderName);
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
        if (!action || !action.type || (!action.name && action.type !== 'narration')) continue;

        // 纠正AI可能返回群昵称而非本名的问题
        if (action.name) {
          const exactMember = chat.members.find(m => m.originalName === action.name);
          if (!exactMember) {
            const nicknameMember = chat.members.find(m => m.groupNickname === action.name);
            if (nicknameMember) {
              action.name = nicknameMember.originalName;
            }
          }
        }

        const senderDisplayName = getDisplayNameInGroup(chat, action.name);
        let visibleSystemMessage = null;

        let aiMessage = null;
        const baseMessage = {
          role: 'assistant',
          senderName: action.name,
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

                  quotedSenderDisplayName = getDisplayNameInGroup(chat, originalMessage.senderName);
                } else {

                  quotedSenderDisplayName = chat.name;
                }
              }

              const quoteContext = {
                timestamp: originalMessage.timestamp,
                senderName: quotedSenderDisplayName,

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
              authorId: state.chats[Object.keys(state.chats).find(key => state.chats[key].originalName === action.name)]?.id || action.name,
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
              // 防御：如果模型错误地填了用户的名字，强制纠正为角色本名
              const qzUserNickname = state.qzoneSettings?.nickname;
              let qzCommenterName = action.name || chat.originalName;
              if (qzUserNickname && qzCommenterName === qzUserNickname) {
                console.warn(`[动态防御] 角色 "${chat.originalName}" 试图用用户名字 "${qzUserNickname}" 评论，已纠正`);
                qzCommenterName = chat.originalName;
              }
              postToComment.comments.push({
                commenterName: qzCommenterName,
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
              if (!postToLike.likes.includes(action.name)) {
                postToLike.likes.push(action.name);
                await db.qzonePosts.update(postToLike.id, {
                  likes: postToLike.likes
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