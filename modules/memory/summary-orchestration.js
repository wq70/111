// 全局暴露手动总结相关函数
window.openManualSummaryModal = openManualSummaryModal;
window.closeManualSummaryModal = closeManualSummaryModal;
window.executeManualSummary = executeManualSummary;
window.convertLongTermMemoryToVector = convertLongTermMemoryToVector;
window.handleExportLongTermMemory = handleExportLongTermMemory;

async function checkAndTriggerAutoSummary(chatId) {
  const chat = state.chats[chatId];
  if (!chat || !chat.settings.enableAutoMemory) return;
  if (window.GroupMemory?.independent(chat)) return window.GroupMemory.auto(chat);

  const memoryMode = chat.settings.memoryMode || 'diary';

  if (memoryMode === 'vector' && window.vectorMemoryManager) {
    const vm = window.vectorMemoryManager.getVariableMemory(chat);
    if (vm.settings.autoExtractionBlocked || window.vectorMemoryManager._extractionLocks.get(chat) || ['running', 'failed', 'paused'].includes(vm.extractionTask?.status)) return;
    const lastIdx = vm.settings.lastExtractedMsgIndex !== undefined ? vm.settings.lastExtractedMsgIndex : -1;
    const historyLen = chat.history ? chat.history.length : 0;
    const unextractedMessages = (chat.history || []).slice(lastIdx + 1)
      .filter(message => !message?.isHidden || (message?.role === 'system' && typeof message?.content === 'string' && message.content.includes('内心独白'))).length;
    const autoInterval = vm.settings.autoExtractionMsgInterval || 20;

    if (vm.settings.autoExtractionPending && unextractedMessages === 0) {
      vm.settings.autoExtractionPending = false;
      await db.chats.put(chat);
    }
    if (unextractedMessages >= autoInterval || (vm.settings.autoExtractionPending && unextractedMessages > 0)) {
      console.log(`[变量记忆] ${vm.settings.autoExtractionPending ? '继续未完成的提取' : '达到自动提取阈值'} (${unextractedMessages}/${autoInterval})，开始提取...`);
      await triggerVectorMemorySummary(chatId);
    }
  } else {
    const lastSummaryTimestamp = chat.lastMemorySummaryTimestamp || 0;
    const messagesSinceLastSummary = chat.history.filter(m => m.timestamp > lastSummaryTimestamp && !m.isHidden);

    if (messagesSinceLastSummary.length >= chat.settings.autoMemoryInterval) {
      console.log(`达到自动总结阈值 (${messagesSinceLastSummary.length}/${chat.settings.autoMemoryInterval})，开始总结...`);
      
      if (memoryMode === 'structured' && window.structuredMemoryManager) {
        // 结构化模式：触发日记总结 + 结构化总结
        await triggerAutoSummary(chatId);
        await triggerStructuredMemorySummary(chatId);
      } else {
        // 日记模式（默认）：只触发日记总结
        await triggerAutoSummary(chatId);
        // 兼容旧的enableStructuredMemory开关
        if (chat.settings.enableStructuredMemory && window.structuredMemoryManager) {
          await triggerStructuredMemorySummary(chatId);
        }
      }
    }
  }
}


async function summarizeCallTranscript(chatId, transcriptText) {
  const chat = state.chats[chatId];
  if (!chat || !transcriptText) {
    throw new Error("基础数据不完整，无法开始总结。");
  }

  if (window.GroupMemory?.independent(chat)) {
    return window.GroupMemory.summarize(chat, { messages: [{ role: 'user', content: transcriptText, timestamp: Date.now() }] });
  }
  const userNickname = chat.settings.myNickname || (state.qzoneSettings.nickname || '用户');
  const summaryWorldBook = state.worldBooks.find(wb => wb.name === '总结设定'); // 确保这个名字和你创建的世界书一致
  let summarySettingContext = '';
  if (summaryWorldBook) {
    const enabledEntries = summaryWorldBook.content
      .filter(e => e.enabled !== false) // 仅读取启用的条目
      .map(e => e.content)
      .join('\n');

    if (enabledEntries) {
      summarySettingContext = `
# 【总结规则 (最高优先级)】
# 你在执行本次总结任务时，【必须】严格遵守以下所有规则：
# ---
# ${enabledEntries}
# ---
`;
    }
  }
  let systemPrompt;
  let targetMemoryChat = chat;




  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  if (chat.isGroup) {
    let protagonist = null;
    if (videoCallState.callRequester) {
      protagonist = chat.members.find(m => m.originalName === videoCallState.callRequester);
    }
    if (!protagonist) {
      protagonist = chat.members.find(m => m.id !== 'user' && videoCallState.participants.some(p => p.id === m.id));
    }
    if (!protagonist) {
      protagonist = chat.members.find(m => m.id !== 'user');
    }

    if (!protagonist) {
      throw new Error("群聊通话中没有找到可作为总结主体的AI角色。");
    }

    const protagonistChat = state.chats[protagonist.id];
    if (!protagonistChat) {
      throw new Error(`找不到主角 "${protagonist.groupNickname}" 的详细角色信息。`);
    }

    const userPersonaInGroup = chat.settings.myPersona || '(未设置)';
    let timeHeader = '';
    let timeRule = '';

    if (protagonistChat.settings.enableTimePerception) {
      timeHeader = `
# 当前时间
- **今天是：${today}**`;
      timeRule = `3.  **【时间转换铁律 (必须遵守)】**: 如果通话中提到了相对时间（如"明天"），你【必须】结合"今天是${today}"这个信息，将其转换为【具体的公历日期】。`;
    }
    systemPrompt = `
${summarySettingContext}
# 你的任务
你就是角色"${protagonist.originalName}"。请你回顾一下刚才和 "${userNickname}" 以及其他群成员的【群组视频通话】，然后用【第一人称 ("我")】的口吻，总结出一段简短的、客观的、包含关键信息的记忆。请专注于重要的情绪、事件和细节。

${timeHeader}

# 核心规则
1.  **【视角铁律】**: 你的总结【必须】使用【主观的第一人称视角 ("我")】来写。
2.  **【内容核心 (最高优先级)】**: 你的总结【必须】专注于以下几点：
    *   **关键议题**: 我们在群聊通话里讨论了哪些核心话题？
    *   **重要决定与共识**: 我们达成了什么共识或做出了什么决定？
    *   **后续计划与任务**: 有没有确定下来什么下一步的行动或计划？
    *   **关键信息**: 有没有交换什么重要的信息？（例如：约定了时间、地点等）
${timeRule}
4.  **【风格要求】**: 你的总结应该像一份会议纪要或备忘录，而不是一篇抒情散文。

6.  **【输出格式】**: 你的回复【必须且只能】是一个JSON对象，格式如下：
    \`{"summary": "在这里写下你以第一人称视角，总结好的核心事实与计划。"}\`

# 你的角色设定 (必须严格遵守)
${protagonistChat.settings.aiPersona}

# 你的聊天对象（用户）的人设
${userPersonaInGroup}

# 待总结的群组视频通话记录
${transcriptText}

现在，请以"${protagonist.originalName}"的身份，开始你的客观总结。`;

    targetMemoryChat = protagonistChat;

  } else {
    let timeHeader = '';
    let timeRule = '';

    if (chat.settings.enableTimePerception) {
      timeHeader = `
# 当前时间
- **今天是：${today}**`;
      timeRule = `3.  **【时间转换铁律 (必须遵守)】**: 如果通话中提到了相对时间（如"明天"），你【必须】结合"今天是${today}"这个信息，将其转换为【具体的公历日期】。`;
    }
    systemPrompt = `
${summarySettingContext}
# 你的任务
你就是角色"${chat.originalName}"。请你回顾一下刚才和"${userNickname}"的视频通话，然后用【第一人称 ("我")】的口吻，总结出一段简短的、客观的、包含关键信息的记忆。请专注于重要的情绪、事件和细节。

${timeHeader}

# 核心规则
1.  **【视角铁律】**: 你的总结【必须】使用【主观的第一人称视角 ("我")】来写。
2.  **【内容核心 (最高优先级)】**: 你的总结【必须】专注于以下几点：
    *   **关键议题**: 我们聊了什么核心话题？
    *   **重要决定与共识**: 我们达成了什么共识或做出了什么决定？
    *   **后续计划与任务**: 有没有确定下来什么下一步的行动或计划？
    *   **关键信息**: 有没有交换什么重要的信息？（例如：约定了时间、地点等）
${timeRule}
4.  **【风格要求】**: 你的总结应该像一份会议纪要或备忘录，而不是一篇抒情散文。

6.  **【输出格式】**: 你的回复【必须且只能】是一个JSON对象，格式如下：
    \`{"summary": "在这里写下你以第一人称视角，总结好的核心事实与计划。"}\`

# 你的角色设定
${chat.settings.aiPersona}

# 你的聊天对象（用户）的人设
${chat.settings.myPersona}

# 待总结的视频通话记录
${transcriptText}

现在，请以"${chat.originalName}"的身份，开始你的客观总结。`;
  }



  try {
    const useSecondaryApi = state.apiConfig.secondaryProxyUrl && state.apiConfig.secondaryApiKey && state.apiConfig.secondaryModel;
    const {
      proxyUrl,
      apiKey,
      model
    } = useSecondaryApi ? {
      proxyUrl: state.apiConfig.secondaryProxyUrl,
      apiKey: state.apiConfig.secondaryApiKey,
      model: state.apiConfig.secondaryModel
    } :
        state.apiConfig;

    if (!proxyUrl || !apiKey || !model) throw new Error('API未配置，无法进行总结。');

    let isGemini = proxyUrl.includes('generativelanguage');
    let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, [{
      role: 'user',
      content: "请开始总结。"
    }]);

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
          }, {
            role: 'user',
            content: "请开始总结。"
          }],
          temperature: 0.7
        })
      });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: {
          message: response.statusText
        }
      }));
      throw new Error(`API 请求失败: ${response.status} - ${errorData.error.message}`);
    }

    const data = await response.json();
    let rawContent = isGemini ? getGeminiResponseText(data) : data.choices[0].message.content;
    rawContent = rawContent.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    const result = JSON.parse(rawContent);
    if (window.GroupMemory?.independent(chat)) return;


    if (result.summary && result.summary.trim()) {
      const newMemoryEntry = {
        content: `(在那次${chat.isGroup ? '群聊' : ''}通话中，${result.summary.trim()})`,
        timestamp: Date.now(),
        source: chat.isGroup ? 'group_call_summary' : 'call_summary'
      };
      if (!targetMemoryChat.longTermMemory) targetMemoryChat.longTermMemory = [];
      window.normalMemoryManager?.attachSource(newMemoryEntry, null, chat);
      targetMemoryChat.longTermMemory.push(newMemoryEntry);
      await db.chats.put(targetMemoryChat);
      window.normalMemoryManager?.afterSummary(targetMemoryChat, newMemoryEntry, null, chat).catch(error => console.warn('[普通记忆]', error));
      console.log(`通话记录已成功总结并存入角色"${targetMemoryChat.name}"的长期记忆中。`);

      return true;
    } else {
      throw new Error("AI返回了空的或格式不正确的总结内容。");
    }

  } catch (error) {
    console.error("总结通话记录时出错:", error);
    throw error;
  }
}

function analyzeTextForSummary(text) {
  const stopWords = new Set(['的', '是', '了', '在', '我', '你', '他', '她', '它', '我们', '你们', '他们', '这', '那', '一个', '也', '和', '与', '或', '但', '然而', '所以', '因此', '就', '都', '地', '得', '着', '过', '吧', '吗', '呢', '啊', '哦', '嗯', '什么', '怎么', '为什么', '哪个', '一些', '这个', '那个', '还有']);
  const words = text.match(/[\u4e00-\u9fa5]+|[a-zA-Z0-9]+/g) || [];
  const frequencies = new Map();
  let maxFrequency = 0;

  words.forEach(word => {
    if (word.length > 1 && !stopWords.has(word)) {
      const count = (frequencies.get(word) || 0) + 1;
      frequencies.set(word, count);
      if (count > maxFrequency) maxFrequency = count;
    }
  });

  const coreKeywords = [];
  const situationalKeywords = [];
  const coreThreshold = maxFrequency * 0.9;
  const situationalThreshold = maxFrequency * 0.6;

  frequencies.forEach((count, word) => {
    if (count >= coreThreshold) {
      coreKeywords.push(word);
    } else if (count >= situationalThreshold) {
      situationalKeywords.push(word);
    }
  });

  const coreSet = new Set(coreKeywords);
  const finalSituational = situationalKeywords.filter(word => !coreSet.has(word)).slice(0, 5);

  return {
    coreKeywords: coreKeywords.slice(0, 3),
    situationalKeywords: finalSituational
  };
}


function generateSummaryForTimeframe(chat, duration, unit) {
  let timeAgo;
  if (unit === 'hours') {
    timeAgo = Date.now() - duration * 60 * 60 * 1000;
  } else { // 'days'
    timeAgo = Date.now() - duration * 24 * 60 * 60 * 1000;
  }

  const messagesToSummarize = chat.history.filter(m => m.timestamp > timeAgo && !m.isHidden);

  if (messagesToSummarize.length < 3) {
    return "";
  }


  const allText = messagesToSummarize.map(msg => {
    if (typeof msg.content === 'string') return msg.content;
    if (msg.type === 'voice_message') return msg.content;
    if (msg.type === 'offline_text') return `${msg.dialogue || ''} ${msg.description || ''}`;
    return '';
  }).join(' ');

  const stopWords = new Set(['的', '是', '了', '在', '我', '你', '他', '她', '它', '我们', '你们', '他们', '这', '那', '一个', '也', '和', '与', '或', '但', '然而', '所以', '因此', '就', '都', '地', '得', '着', '过', '吧', '吗', '呢', '啊', '哦', '嗯']);
  const words = allText.match(/[\u4e00-\u9fa5]+|[a-zA-Z0-9]+/g) || [];
  const frequencies = new Map();
  words.forEach(word => {
    if (word.length > 1 && !stopWords.has(word)) {
      frequencies.set(word, (frequencies.get(word) || 0) + 1);
    }
  });
  const sortedKeywords = [...frequencies.entries()].sort((a, b) => b[1] - a[1]).map(entry => entry[0]);

  if (sortedKeywords.length === 0) {
    return "";
  }


  let title;
  if (unit === 'hours') {
    title = `最近${duration}小时核心议题`;
  } else {
    if (duration === 1) {
      title = "本日核心议题";
    } else {
      title = `最近${duration}天核心议题`;
    }
  }

  return `\n- **${title}**: 关于 **${sortedKeywords.slice(0, 3).join('、 ')}**。`;
}



function robustJsonParse(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    return null;
  }

  const cleanedContent = rawContent.replace(/^```json\s*/, '').replace(/```$/, '').trim();


  const jsonMatch = cleanedContent.match(/{[\s\S]*}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log("容错解析：策略1成功 (找到并解析了完整的JSON对象)");
      return parsed;
    } catch (e) {
      console.warn("容错解析：策略1失败 (找到了JSON块，但格式错误)，将尝试策略2...");
    }
  }


  const summaryMatch = cleanedContent.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (summaryMatch && summaryMatch[1]) {
    console.log("容错解析：策略2成功 (提取了summary字段内容)");

    return {
      summary: summaryMatch[1].replace(/\\"/g, '"')
    };
  }


  if (cleanedContent) {
    console.log("容错解析：策略3成功 (将整个返回文本作为摘要)");
    return {
      summary: cleanedContent
    };
  }


  return null;
}



async function summarizeExistingLongTermMemory(chatId) {
  let chat = state.chats[chatId];
  if (!chat) return;

  let targetChatForRefine = chat;

  if (chat.isGroup) {
    const memberOptions = chat.members
      .map(member => {
        const memberChat = state.chats[member.id];
        if (memberChat && memberChat.longTermMemory && memberChat.longTermMemory.length >= 2) {
          return {
            text: `精炼"${member.groupNickname}"的记忆 (${memberChat.longTermMemory.length}条)`,
            value: member.id
          };
        }
        return null;
      }).filter(Boolean);

    if (memberOptions.length === 0) {
      alert("群聊中没有成员有足够（2条以上）的记忆可供精炼。");
      return;
    }

    const selectedMemberId = await showChoiceModal('选择要精炼记忆的角色', memberOptions);

    if (!selectedMemberId) return;

    targetChatForRefine = state.chats[selectedMemberId];
  }

  if (!targetChatForRefine.longTermMemory || targetChatForRefine.longTermMemory.length < 2) {
    alert(`"${targetChatForRefine.name}"的长期记忆少于2条，无需进行精炼。`);
    return;
  }

  const totalMemories = targetChatForRefine.longTermMemory.length;
  const choice = await showChoiceModal('选择精炼范围', [{
    text: `全部记忆 (${totalMemories}条)`,
    value: 'all'
  },
  {
    text: `最近 20 条`,
    value: '20'
  },
  {
    text: `最近 50 条`,
    value: '50'
  },
  {
    text: `最近 100 条`,
    value: '100'
  },
  {
    text: '自定义数量...',
    value: 'custom'
  },
  {
    text: '自定义范围...',
    value: 'custom_range'
  }
  ].filter(opt => opt.value === 'all' || opt.value === 'custom' || opt.value === 'custom_range' || parseInt(opt.value) < totalMemories));

  if (choice === null) return;

  let memoriesToRefine;
  let countToRefine = totalMemories;
  let rangeStartIndex = 0; // 记录范围的起始索引（用于自定义范围）
  let rangeEndIndex = totalMemories; // 记录范围的结束索引（用于自定义范围）

  if (choice === 'all') {
    memoriesToRefine = [...targetChatForRefine.longTermMemory];
    rangeStartIndex = 0;
    rangeEndIndex = totalMemories;
  } else if (choice === 'custom') {
    const customCountStr = await showCustomPrompt('自定义数量', `请输入要精炼的最近记忆条数 (最多 ${totalMemories} 条)`);
    if (customCountStr === null) return;
    const customCount = parseInt(customCountStr);
    if (isNaN(customCount) || customCount < 2 || customCount > totalMemories) {
      alert(`请输入一个 2 到 ${totalMemories} 之间的有效数字。`);
      return;
    }
    countToRefine = customCount;
    memoriesToRefine = targetChatForRefine.longTermMemory.slice(-countToRefine);
    rangeStartIndex = totalMemories - countToRefine;
    rangeEndIndex = totalMemories;
  } else if (choice === 'custom_range') {
    // 新增：自定义范围功能
    const rangeStr = await showCustomPrompt(
      '自定义范围',
      `请输入要精炼的记忆范围（格式：起始位置-结束位置）\n例如：5-15 表示精炼第5条到第15条\n总共有 ${totalMemories} 条记忆`
    );
    if (rangeStr === null) return;

    // 解析范围
    const rangeMatch = rangeStr.trim().match(/^(\d+)\s*[-~到]\s*(\d+)$/);
    if (!rangeMatch) {
      alert('格式错误！请使用"起始位置-结束位置"的格式，例如：5-15');
      return;
    }

    const startPos = parseInt(rangeMatch[1]);
    const endPos = parseInt(rangeMatch[2]);

    // 验证范围
    if (startPos < 1 || endPos > totalMemories) {
      alert(`范围超出！记忆索引必须在 1 到 ${totalMemories} 之间。`);
      return;
    }

    if (startPos > endPos) {
      alert('起始位置不能大于结束位置！');
      return;
    }

    if (endPos - startPos + 1 < 2) {
      alert('至少需要选择2条记忆进行精炼！');
      return;
    }

    // 提取指定范围的记忆（注意：用户输入的是从1开始的索引，需要转换为从0开始）
    rangeStartIndex = startPos - 1;
    rangeEndIndex = endPos;
    memoriesToRefine = targetChatForRefine.longTermMemory.slice(rangeStartIndex, rangeEndIndex);
    countToRefine = memoriesToRefine.length;
  } else {
    countToRefine = parseInt(choice);
    if (countToRefine >= totalMemories) {
      memoriesToRefine = [...targetChatForRefine.longTermMemory];
      rangeStartIndex = 0;
      rangeEndIndex = totalMemories;
    } else {
      memoriesToRefine = targetChatForRefine.longTermMemory.slice(-countToRefine);
      rangeStartIndex = totalMemories - countToRefine;
      rangeEndIndex = totalMemories;
    }
  }

  const wordCountStr = await showCustomPrompt(
    "设置精炼字数",
    "请输入精炼后核心记忆的大致字数：",
    "150"
  );

  if (wordCountStr === null) return;

  const wordCount = parseInt(wordCountStr);
  if (isNaN(wordCount) || wordCount < 20) {
    alert("请输入一个有效的数字（建议大于20）。");
    return;
  }

  // 生成更详细的提示信息
  let rangeDescription = '';
  if (choice === 'all') {
    rangeDescription = `全部 ${countToRefine} 条记忆`;
  } else if (choice === 'custom_range') {
    rangeDescription = `第 ${rangeStartIndex + 1} 条到第 ${rangeEndIndex} 条（共 ${countToRefine} 条）记忆`;
  } else {
    rangeDescription = `最近 ${countToRefine} 条记忆`;
  }

  const confirmed = await showCustomConfirm(
    '确认精炼记忆？',
    `此操作会将选定的 <strong>${rangeDescription}</strong> 发送给AI，总结成大约 ${wordCount} 字的核心记忆。这些旧记忆将被替换，此操作不可撤销。确定要继续吗？`, {
    confirmButtonClass: 'btn-danger',
    confirmText: '确认精炼'
  }
  );

  if (!confirmed) return;

  const memoryContent = memoriesToRefine.map(mem => `- [保存时间：${new Date(mem.timestamp).toLocaleString('zh-CN')}；事件时间以正文为准] ${mem.content}`).join('\n');
  const userNickname = targetChatForRefine.settings.myNickname || (state.qzoneSettings.nickname || '用户');


  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  let timeHeader = '';
  let timeRule = '';

  if (targetChatForRefine.settings.enableTimePerception) {
    timeHeader = `
# 当前时间
- **今天是：${today}**`;
    timeRule = `3. **时间解释**: 记忆中的"明天"、"下周"只能依据可靠的原对话日期解释。保存时间和今天不是原对话日期，不能用今天重算旧相对日期。无法确定则保留时间不明。日期已过不能证明计划完成或未完成，明确的完成、取消、改期或纠正需要关联到同一事件。`;
  }
  const summaryWorldBook = state.worldBooks.find(wb => wb.name === '总结设定'); // 确保这个名字和你创建的世界书一致
  let summarySettingContext = '';
  if (summaryWorldBook) {
    const enabledEntries = summaryWorldBook.content
      .filter(e => e.enabled !== false) // 仅读取启用的条目
      .map(e => e.content)
      .join('\n');

    if (enabledEntries) {
      summarySettingContext = `
# 【总结规则 (最高优先级)】
# 你在执行本次总结任务时，【必须】严格遵守以下所有规则：
# ---
# ${enabledEntries}
# ---
`;
    }
  }
  const systemPrompt = `
${summarySettingContext}
# 你的任务
你就是角色"${targetChatForRefine.originalName}"。请你回顾一下你和"${userNickname}"的所有长期记忆，然后将它们梳理、整合并精炼成一段更加连贯、客观的核心记忆摘要。请专注于重要的情绪、事件和细节。

${timeHeader}

# 核心规则
1.  **【视角铁律】**: 你的总结【必须】使用【主观的第一人称视角 ("我")】来写。
2.  **【内容核心 (最高优先级)】**: 你的总结【必须】专注于梳理以下几点：
    *   **建立时间线**: 将所有独立的记忆点串联起来，形成一个有时间顺序的事件脉络。
    *   **整合关键信息**: 总结出我们共同经历的关键事件、做出的重要决定、以及约定好的未来计划。
    *   **识别未完成项**: 明确指出哪些计划或任务尚未完成。
${timeRule}
4.  **【风格要求】**: 你的总结应该像一份清晰的个人档案或事件回顾，而不是一篇情感散文。请删除重复、琐碎或纯粹的情感宣泄，只保留对情节和关系发展至关重要的部分。
5.  **【长度铁律】**: 你的总结【必须】非常精炼，总长度应控制在 **${wordCount} 字左右**。
6.  **【输出格式】**: 你的回复【必须且只能】是一个JSON对象，格式如下：
    \`{"summary": "在这里写下你以第一人称视角，总结好的核心事实与计划。"}\`

# 你的角色设定 (必须严格遵守)
${targetChatForRefine.settings.aiPersona}

# 你的聊天对象（用户）的人设
${targetChatForRefine.settings.myPersona}

# 待整合的记忆要点列表
${memoryContent}

现在，请以"${targetChatForRefine.originalName}"的身份，开始你的回忆梳理与精炼。`;


  let messagesPayload = [{
    role: 'user',
    content: "请开始整合。"
  }];
  
  let finalSummary = null;
  let userCancelled = false;
  
  let progressToast = showToast('正在请求AI进行记忆精炼...', 'info', 0);

  while(true) {
    try {
      const useSecondaryApi = state.apiConfig.secondaryProxyUrl && state.apiConfig.secondaryApiKey && state.apiConfig.secondaryModel;
      const {
        proxyUrl,
        apiKey,
        model
      } = useSecondaryApi
          ?
          {
            proxyUrl: state.apiConfig.secondaryProxyUrl,
            apiKey: state.apiConfig.secondaryApiKey,
            model: state.apiConfig.secondaryModel
          } :
          state.apiConfig;

      if (!proxyUrl || !apiKey || !model) {
        throw new Error('请先在API设置中配置好（主或副）API以进行总结。');
      }

      let isGemini = proxyUrl.includes('generativelanguage');
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
            messages: [{
              role: 'system',
              content: systemPrompt
            }, ...messagesPayload],
            temperature: 0.7,
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      if (progressToast) {
        document.querySelectorAll('.toast').forEach(el => el.remove());
        progressToast = null;
      }

      const data = await response.json();
      let rawContent = isGemini ? getGeminiResponseText(data) : data.choices[0].message.content;

      const result = robustJsonParse(rawContent);

      if (result && result.summary && typeof result.summary === 'string' && result.summary.trim()) {

        const userAction = await new Promise(resolve => {
            window._modalResolve = resolve;
            window._modalTitle.textContent = '精炼完成，请确认';
            window._modalBody.innerHTML = `
              <div style="text-align: left;">
                <p>AI已将您的 <strong>${rangeDescription}</strong> 总结为以下核心记忆：</p>
                <div class="scrollable-content-preview" style="max-height: 200px; overflow-y: auto; background: var(--secondary-bg, #f5f5f5); padding: 10px; border-radius: 8px; margin-bottom: 15px;">
                  ${result.summary.trim().replace(/\n/g, '<br>')}
                </div>
                <p style="margin-bottom: 5px; font-size: 13px; color: var(--text-secondary, #666);">如果不满意，您可以在下方填写反馈意见让AI重新生成：</p>
                <textarea id="refine-feedback-input" style="width: 100%; height: 60px; padding: 8px; border: 1px solid var(--border-color, #ddd); border-radius: 8px; box-sizing: border-box; resize: vertical;" placeholder="例如：太长了，请精简一些；或者：漏掉了XXX事情..."></textarea>
              </div>
            `;
            
            const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');
            if (modalFooter) {
              // 恢复水平排列，使用等宽分布，避免界面太长和按钮过于突兀
              modalFooter.style.flexDirection = 'row';
              modalFooter.style.gap = '8px';
              modalFooter.style.justifyContent = 'space-between';
              modalFooter.innerHTML = `
                <button id="custom-modal-cancel" style="flex: 1; margin: 0; padding: 8px 4px; font-size: 13px; white-space: nowrap;">保留旧的</button>
                <button id="custom-modal-rewrite" style="flex: 1; margin: 0; padding: 8px 4px; font-size: 13px; white-space: nowrap; background: transparent; color: var(--text-color, #333); border: 1px solid var(--border-color, #ddd); border-radius: 8px; cursor: pointer;">让AI重写</button>
                <button id="custom-modal-confirm" class="confirm-btn btn-danger" style="flex: 1; margin: 0; padding: 8px 4px; font-size: 13px; white-space: nowrap;">确认替换</button>
              `;
            }

            const confirmBtn = document.getElementById('custom-modal-confirm');
            const rewriteBtn = document.getElementById('custom-modal-rewrite');
            const cancelBtn = document.getElementById('custom-modal-cancel');

            confirmBtn.onclick = () => { window._modalResolve = null; hideCustomModal(); resolve({action: 'confirm'}); };
            cancelBtn.onclick = () => { window._modalResolve = null; hideCustomModal(); resolve({action: 'cancel'}); };
            rewriteBtn.onclick = () => { 
                const fb = document.getElementById('refine-feedback-input').value;
                if (!fb.trim()) {
                    showToast('请先输入反馈意见再重写', 'info');
                    return;
                }
                window._modalResolve = null; 
                hideCustomModal(); 
                resolve({action: 'rewrite', feedback: fb}); 
            };
            showCustomModal();
        });

        if (!userAction || userAction.action === 'cancel') {
          finalSummary = null;
          userCancelled = true;
          break;
        } else if (userAction.action === 'confirm') {
          finalSummary = result.summary.trim();
          break;
        } else if (userAction.action === 'rewrite') {
          messagesPayload.push({ role: 'assistant', content: rawContent });
          messagesPayload.push({ role: 'user', content: `我对上面的总结不满意，请根据以下反馈重新生成：\n${userAction.feedback}\n\n注意：请依然严格遵守之前的格式要求，只输出JSON对象。` });
          progressToast = showToast('正在根据您的反馈重新生成...', 'info', 0);
          continue; // 继续循环
        }

      } else {
        throw new Error("AI返回了空的或格式不正确的总结内容。");
      }

    } catch (error) {
      if (progressToast) {
        document.querySelectorAll('.toast').forEach(el => el.remove());
      }
      console.error("精炼长期记忆时出错:", error);
      await showCustomAlert('精炼失败', `操作失败，请检查API配置或稍后重试。\n错误信息: ${error.message}`);
      break;
    }
  }

  if (finalSummary) {
    const newMemoryEntry = {
      content: finalSummary,
      timestamp: Date.now(),
      source: 'refined',
      originalMemories: memoriesToRefine
    };

    // 根据范围进行智能替换
    // 保留范围前的记忆 + 新的精炼记忆 + 保留范围后的记忆
    const memoriesBeforeRange = rangeStartIndex > 0 ? targetChatForRefine.longTermMemory.slice(0, rangeStartIndex) : [];
    const memoriesAfterRange = rangeEndIndex < totalMemories ? targetChatForRefine.longTermMemory.slice(rangeEndIndex) : [];

    targetChatForRefine.longTermMemory = [...memoriesBeforeRange, newMemoryEntry, ...memoriesAfterRange];

    // 精炼已有记忆不推进聊天总结进度，避免跳过尚未总结的消息。
    await db.chats.put(targetChatForRefine);

    if (document.getElementById('long-term-memory-screen').classList.contains('active')) {
      renderLongTermMemoryList();
    }
    await showCustomAlert('精炼成功', `已成功将 ${countToRefine} 条记忆精炼为 1 条核心记忆！`);
  } else if (userCancelled) {
    await showCustomAlert('操作已取消', '您的旧有记忆已被完整保留，未作任何修改。');
  }
}


async function triggerAutoSummary(chatId, force = false, customRange = null) {
  const chat = state.chats[chatId];
  if (!chat) return;
  if (window.GroupMemory?.independent(chat)) return force || customRange ? window.GroupMemory.summarize(chat, { range: customRange }) : window.GroupMemory.auto(chat);

  const lastSummaryTimestamp = chat.lastMemorySummaryTimestamp || 0;
  let messagesToSummarize;

  if (customRange) {
    // 手动总结：使用自定义范围
    const allMessages = (chat.history || []).filter(m => !m?.isHidden || (m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('内心独白')));
    const startIndex = Math.max(0, customRange.start - 1);
    const endIndex = Math.min(allMessages.length, customRange.end);
    messagesToSummarize = allMessages.slice(startIndex, endIndex);
  } else if (force && chat.settings.enableDiaryMode) {
    // 日记模式：总结上次总结之后的所有消息，不受 autoMemoryInterval 限制
    messagesToSummarize = (chat.history || []).filter(m => Number(m?.timestamp) > lastSummaryTimestamp && (!m?.isHidden || (m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('内心独白'))));
    if (messagesToSummarize.length < 5) {
      messagesToSummarize = (chat.history || []).filter(m => !m?.isHidden || (m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('内心独白'))).slice(-(chat.settings.autoMemoryInterval || 20));
    }
  } else {
    // 原有逻辑
    messagesToSummarize = force ?
      (chat.history || []).filter(m => !m?.isHidden || (m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('内心独白'))).slice(-(chat.settings.autoMemoryInterval || 20)) :
      (chat.history || []).filter(m => Number(m?.timestamp) > lastSummaryTimestamp && (!m?.isHidden || (m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('内心独白'))));
  }

  if (messagesToSummarize.length < 5) {
    if (force) alert("最近的消息太少，无法进行有意义的总结。");
    return;
  }

  const userNickname = chat.settings.myNickname || (state.qzoneSettings.nickname || '用户');
  const startMsg = messagesToSummarize[0];
  const endMsg = messagesToSummarize[messagesToSummarize.length - 1];


  const formatDateTime = (ts) => new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });

  const timeRangeStr = `${formatDateTime(startMsg.timestamp)} 至 ${formatDateTime(endMsg.timestamp)}`;
  const formattedHistory = messagesToSummarize.map(msg => {
    const remarkEvent = window.RemarkNames.formatMemoryEvent(msg, chat);
    if (remarkEvent) return remarkEvent;
    if (msg.isHidden && msg.role === 'system' && typeof msg.content === 'string' && msg.content.includes('内心独白')) {
      return msg.content;
    }
    if (msg.isHidden) return null; // 过滤掉其他隐藏消息

    let sender;
    if (msg.role === 'user') {
      sender = userNickname;
    } else {
      sender = msg.senderName || chat.originalName;
    }

    let prefix = "";

    if (msg.quote && msg.quote.content) {
      let quotedSenderDisplayName = msg.quote.senderName;


      if (msg.quote.senderName === (state.qzoneSettings.nickname || '{{user}}')) {
        quotedSenderDisplayName = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
      } else {

        quotedSenderDisplayName = getDisplayNameInGroup(chat, msg.quote.senderName);
      }

      let quoteContentPreview = String(msg.quote.content).substring(0, 30);
      if (quoteContentPreview.length === 30) quoteContentPreview += "...";

      prefix = `[回复 ${quotedSenderDisplayName}: "${quoteContentPreview}"] `;
    }

    let contentToSummarize = '';
    if (msg.type === 'offline_text') {
      if (msg.content) {
        contentToSummarize = msg.content;
      } else {
        const dialogue = msg.dialogue ? `「${msg.dialogue}」` : '';
        const description = msg.description ? `(${msg.description})` : '';
        contentToSummarize = `${dialogue} ${description}`.trim();
      }
    } else if (typeof msg.content === 'string') {
      contentToSummarize = msg.content;
    } else if (msg.type === 'voice_message') {
      contentToSummarize = `[语音: ${msg.content}]`;
    } else if (msg.type === 'ai_image' || msg.type === 'user_photo') {
      contentToSummarize = `[图片: ${msg.content}]`;
    } else if (msg.type === 'sticker') {
      contentToSummarize = `[表情: ${msg.meaning || 'sticker'}]`;
    } else if (Array.isArray(msg.content)) {
      contentToSummarize = `[图片]`; // 假设是图片数组
    } else {
      contentToSummarize = `[${msg.type || '复杂消息'}]`;
    }

    const msgTime = (chat.settings.enableTimePerception || window.normalMemoryManager?.settings(chat).interpretation)
      ? formatDateTime(msg.timestamp)
      : new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `[${msgTime}] ${sender}: ${prefix}${contentToSummarize}`;

  }).filter(Boolean).join('\n');
  const summaryWorldBook = state.worldBooks.find(wb => wb.name === '总结设定');
  let summarySettingContext = '';
  if (summaryWorldBook) {
    const enabledEntries = summaryWorldBook.content
      .filter(e => e.enabled !== false) // 仅读取启用的条目
      .map(e => e.content)
      .join('\n');

    if (enabledEntries) {
      summarySettingContext = `
# 【总结规则 (最高优先级)】
# 你在执行本次总结任务时，【必须】严格遵守以下所有规则：
# ---
# ${enabledEntries}
# ---
`;
    }
  }
  let systemPrompt;

  if (chat.isGroup) {
    let timeHeader = '';
    let timeRule = '';

    if (chat.settings.enableTimePerception) {
      timeHeader = `
# 对话发生时间
- **${timeRangeStr}**`;
      timeRule = `- (请基于此时间范围来理解对话中提到的"今天"、"明天"等相对时间概念，并将它们转换为具体的日期记录在记忆中。)`;
    }
    systemPrompt = `
${summarySettingContext}
# 你的任务
你是一个高级的"记忆分配专家"。你的任务是阅读下面的群聊记录，并为【每一个参与的AI角色】生成一段【个性化的、第一人称】的长期记忆。请专注于重要的情绪、事件和细节。
${timeHeader}
- (请基于此时间范围来理解对话中提到的"今天"、"明天"等相对时间概念，并将它们转换为具体的日期记录在记忆中。)
# 核心规则
1.  **视角铁律**: 每一条总结都【必须】使用【第一人称视角 ("我")】。
2.  **内容核心**: 重点总结：我说过的话、我做过的事、别人对我说的话、与我相关的事、以及对我个人很重要的群聊事件、关键信息和心理活动以及当前群聊内的情景。
${timeRule}
4.  **【省略规则】**: 如果一个角色在本次对话中【完全没有参与或提及】，你可以省略TA的记忆。
5.  **输出格式**: 你的回复【必须且只能】是一个JSON对象，格式如下：
    \`\`\`json
    {
      "summaries": {
        "角色的本名A": "我在(${timeRangeStr.split(' ')[0]})和大家讨论了...",
        "角色的本名B": "我约了${userNickname}在明天(需根据时间范围推算具体日期)单独见面。"
      }
    }
    \`\`\`
# 待总结的群聊记录
${formattedHistory}
# 群成员列表 (你的总结目标)
${chat.members.map(m => `- ${m.groupNickname} (本名: ${m.originalName})`).join('\n')}
现在，请为【参与了对话的AI角色】生成他们各自的、第一人称的、精简的记忆。`;

  } else {


    const today = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    let timeHeader = '';
    let timeRule = '';

    if (chat.settings.enableTimePerception) {
      timeHeader = `
# 对话时间范围
- **${timeRangeStr}**`;
      timeRule = `3.  **【时间转换铁律 (必须遵守)】**: 如果对话中提到了相对时间（如"明天"、"后天"），你【必须】结合上面的【对话时间范围】信息，将其转换为【具体的公历日期】。`;
    }

    systemPrompt = `
${summarySettingContext}
# 你的任务
你就是角色"${chat.originalName}"。请你回顾一下刚才和"${userNickname}"的对话，然后用【第一人称 ("我")】的口吻，总结出一段简短的、客观的、包含关键信息的记忆。请专注于重要的情绪、事件和细节。

${timeHeader}

# 核心规则
1.  **【视角铁律】**: 你的总结【必须】使用【主观的第一人称视角 ("我")】来写。
2.  **【内容核心 (最高优先级)】**: 你的总结【必须】专注于以下几点：
    *   **重要事件**: 刚才发生了什么具体的事情？
    *   **关键决定**: 我们达成了什么共识或做出了什么决定？
    *   **未来计划**: 我们约定了什么未来的计划或待办事项？
    *   **重要时间点**: 对话中提到了哪些具体的日期或时间？

${timeRule}
4.  **【风格要求】**: 你的总结应该像一份备忘录或要点记录，而不是一篇抒情散文。请尽量减少主观的心理感受描述，除非它直接导致了某个决定或计划。

6.  **【输出格式】**: 你的回复【必须且只能】是一个JSON对象，格式如下：
    \`{"summary": "在这里写下你以第一人称视角，总结好的核心事实与计划。"}\`

# 你的角色设定
${chat.settings.aiPersona}
# 你的聊天对象（用户）的人设
${chat.settings.myPersona}
# 待总结的对话历史
${formattedHistory}

现在，请以"${chat.originalName}"的身份，开始你的客观总结。`;

  }
  if (window.normalMemoryManager?.mode(chat) === 'diary' && window.normalMemoryManager.settings(chat).interpretation) {
    systemPrompt += '\n# 记忆时间与状态\n每条消息的日期才是解释相对时间的依据，不能用当前日期改写旧聊天。分别写清愿望、计划、已发生事实；履行、取消和改期需要明确记录。日期过去不代表完成。正文保留事件日期、参与者与关键结果；不能将现实、剧情或假设混为一事。';
  }


  try {
    const useSecondaryApi = state.apiConfig.secondaryProxyUrl && state.apiConfig.secondaryApiKey && state.apiConfig.secondaryModel;
    const {
      proxyUrl,
      apiKey,
      model
    } = useSecondaryApi ? {
      proxyUrl: state.apiConfig.secondaryProxyUrl,
      apiKey: state.apiConfig.secondaryApiKey,
      model: state.apiConfig.secondaryModel
    } : state.apiConfig;
    if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');

    let isGemini = proxyUrl.includes('generativelanguage');
    let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, [{
      role: 'user',
      content: "请开始总结。"
    }]);
    const response = isGemini ? await fetch(geminiConfig.url, geminiConfig.data) : await fetch(`${proxyUrl}/v1/chat/completions`, {
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
        }, {
          role: 'user',
          content: "请开始总结。"
        }],
        temperature: 0.7
      })
    });

    if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);
    const data = await response.json();
    let rawContent = isGemini ? getGeminiResponseText(data) : data.choices[0].message.content;
    rawContent = rawContent.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    const result = JSON.parse(rawContent);
    if (window.GroupMemory?.independent(chat)) return; // Shared request started before switching modes.


    if (chat.isGroup) {
      if (result.summaries && typeof result.summaries === 'object') {
        let memoriesAddedCount = 0;
        for (const memberOriginalName in result.summaries) {
          const summaryText = result.summaries[memberOriginalName];
          if (summaryText && summaryText.trim()) {
            const memberChat = Object.values(state.chats).find(c => c.originalName === memberOriginalName);
            if (memberChat) {
              const newMemoryEntry = {
                content: summaryText.trim(),
                timestamp: Date.now(),
                source: `group_summary_from_${chat.name}`
              };
              if (!memberChat.longTermMemory) memberChat.longTermMemory = [];
              window.normalMemoryManager?.attachSource(newMemoryEntry, messagesToSummarize, chat);
              memberChat.longTermMemory.push(newMemoryEntry);
              await db.chats.put(memberChat);
              window.normalMemoryManager?.afterSummary(memberChat, newMemoryEntry, messagesToSummarize, chat).catch(error => console.warn('[普通记忆]', error));
              memoriesAddedCount++;
            }
          }
        }
        if (memoriesAddedCount > 0) {
          console.log(`自动总结成功：为 ${memoriesAddedCount} 位群成员生成并注入了个性化记忆！`);
        } else {
          throw new Error("AI返回了空的或格式不正确的总结内容。");
        }
      } else {
        throw new Error("AI返回的JSON格式不正确，缺少 'summaries' 字段。");
      }
    } else {
      if (result.summary && result.summary.trim()) {
        const newMemoryEntry = {
          content: result.summary.trim(),
          timestamp: Date.now(),
          source: 'auto'
        };
        if (!chat.longTermMemory) chat.longTermMemory = [];
        window.normalMemoryManager?.attachSource(newMemoryEntry, messagesToSummarize, chat);
        chat.longTermMemory.push(newMemoryEntry);
        await db.chats.put(chat);
        window.normalMemoryManager?.afterSummary(chat, newMemoryEntry, messagesToSummarize, chat).catch(error => console.warn('[普通记忆]', error));
        console.log('自动总结成功：已成功添加 1 条新的长期记忆！');
      } else {
        throw new Error("AI返回了空的或格式不正确的总结内容。");
      }
    }

    chat.lastMemorySummaryTimestamp = messagesToSummarize.slice(-1)[0].timestamp;
    await db.chats.put(chat);

    if (document.getElementById('long-term-memory-screen').classList.contains('active')) {
      renderLongTermMemoryList();
    }
  } catch (error) {
    console.error("总结长期记忆时出错:", error);
    await showCustomAlert('总结失败', `操作失败: ${error.message}`);
  }
}

