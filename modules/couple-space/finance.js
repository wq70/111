// ========== Finance (记账) AI Integration ==========

function logCoupleSpaceFinanceError(label, error) {
  // 移动端控制台会将 Error 对象序列化为 {}，显式输出错误信息。
  const detail = error && error.message ? `${error.name || 'Error'}: ${error.message}` : String(error);
  console.error(label, detail);
}

function createCoupleSpaceFinanceReply(charId) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return null;
  const targetWindow = iframe.contentWindow;
  const source = iframe.src;
  const isCurrent = () => {
    const screen = document.getElementById('couple-space-screen');
    return iframe.isConnected && document.getElementById('couple-space-iframe') === iframe &&
      iframe.contentWindow === targetWindow && iframe.src === source &&
      source.includes(COUPLE_SPACE_IFRAME_PATH) &&
      localStorage.getItem('coupleSpaceLastId') === charId && screen && screen.classList.contains('active');
  };
  if (!isCurrent()) return null;

  return message => {
    // await 期间可能已退出、重进或切换角色，只允许回复原来的有效页面。
    if (!isCurrent()) return false;
    try {
      targetWindow.postMessage(message, '*');
      return true;
    } catch (error) {
      // 发送失败不再向同一窗口补发错误，避免二次异常。
      logCoupleSpaceFinanceError('Finance result delivery error:', error);
      return false;
    }
  };
}

function handleCoupleSpaceFinanceChanged(data) {
  localStorage.setItem('coupleFinance_' + data.charId, JSON.stringify(data.items || []));
}

function handleCoupleSpaceFinanceSettingsChanged(data) {
  saveCoupleSpaceSettingsWithSchedule(data, 'coupleFinanceSettings_', ['coupleFinanceAutoLast_'], ['autoEnabled', 'autoTime']);
  console.log(`[情侣空间] ⚙️ 已保存 记账 设置并重新初始化定时器`);
  setupCoupleSpaceFinanceAutoTimer();
}

async function handleCoupleSpaceFinanceAiRequest(data) {
  const reply = createCoupleSpaceFinanceReply(data.charId);
  if (!reply) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    reply({ type: 'coupleSpaceFinanceAiResult', error: true });
    return;
  }
  try {
    const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
    if (!proxyUrl || !model) {
      reply({ type: 'coupleSpaceFinanceAiResult', error: true });
      return;
    }
    const result = await generateCoupleSpaceFinanceAi(chat, data);
    reply({
      type: 'coupleSpaceFinanceAiResult',
      finType: result.type,
      amount: result.amount,
      category: result.category,
      title: result.title,
      note: result.note
    });
  } catch(err) {
    logCoupleSpaceFinanceError('Finance AI error:', err);
    reply({ type: 'coupleSpaceFinanceAiResult', error: true });
  }
}

async function handleCoupleSpaceFinanceCommentRequest(data) {
  const reply = createCoupleSpaceFinanceReply(data.charId);
  if (!reply) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    reply({ type: 'coupleSpaceFinanceCommentResult', itemId: data.itemId, error: true });
    return;
  }
  try {
    const comment = await generateCoupleSpaceFinanceComment(chat, data);
    reply({
      type: 'coupleSpaceFinanceCommentResult',
      itemId: data.itemId,
      comment: comment
    });
  } catch(err) {
    logCoupleSpaceFinanceError('Finance comment AI error:', err);
    reply({ type: 'coupleSpaceFinanceCommentResult', itemId: data.itemId, error: true });
  }
}

async function handleCoupleSpaceFinanceHeartRequest(data) {
  const reply = createCoupleSpaceFinanceReply(data.charId);
  if (!reply) return;
  const chat = state.chats[data.charId];
  if (!chat) return;
  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
    if (!proxyUrl || !model) return;
    const typeLabel = data.itemType === 'income' ? '收入' : '支出';
    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"记了一笔${typeLabel}："${data.itemTitle}"，金额¥${data.itemAmount}，并点了爱心。
你会不会也想给这条记录点爱心？考虑你的性格和你们的关系。
请只回答 "yes" 或 "no"，不要其他内容。`;
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '你要点爱心吗？' }]);
      response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: getCoupleSpaceRequestHeaders(apiKey),
        body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: '你要点爱心吗？' }], temperature: 0.7 })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const answer = getGeminiResponseText(respData).trim().toLowerCase();
    reply({
      type: 'coupleSpaceFinanceHeartResult',
      itemId: data.itemId,
      liked: answer.includes('yes')
    });
  } catch(e) {
    logCoupleSpaceFinanceError('Finance heart AI error:', e);
  }
}

async function generateCoupleSpaceFinanceAi(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const finSettings = data.financeSettings || {};
  const maxCharVisible = finSettings.visibleCharItems ?? 10;
  const maxUserVisible = finSettings.visibleUserItems ?? 10;
  const items = data.existingItems || [];
  const charItems = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userItems = items.filter(i => i.author === 'user').slice(-maxUserVisible);

  // Build dynamic category list from user's custom categories
  const customCats = data.customCategories || [];
  let categoryListText = '(用户未创建分类，请自行选择一个合理的分类名称作为category)';
  if (customCats.length > 0) {
    categoryListText = customCats.map(c => c.id + '(' + c.label + ')').join(' ');
  }

  let existingCharItemsText = '';
  if (charItems.length > 0) {
    existingCharItemsText = charItems.map(i =>
      '- [' + i.type + '] ' + i.category + ' ¥' + i.amount + ' "' + i.title + '"' +
      (i.note ? ' — ' + i.note : '')
    ).join('\n');
  }
  let existingUserItemsText = '';
  if (userItems.length > 0) {
    existingUserItemsText = userItems.map(i =>
      '- [' + i.type + '] ' + i.category + ' ¥' + i.amount + ' "' + i.title + '"' +
      (i.note ? ' — ' + i.note : '')
    ).join('\n');
  }

  let systemPrompt;
  if (finSettings.enableCustomPrompt && finSettings.customPrompt) {
    systemPrompt = finSettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{existingCharItems\}\}/g, existingCharItemsText ? '# 你之前记的账（避免重复）\n' + existingCharItemsText : '')
      .replace(/\{\{existingUserItems\}\}/g, existingUserItemsText ? '# 伴侣记的账（参考）\n' + existingUserItemsText : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{categoryList\}\}/g, categoryListText)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间的记账本里记一笔和伴侣"${ctx.myNickname}"相关的花销或收入。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}
- 人设: ${ctx.myPersona}

${ctx.worldBook ? '# 世界观\n' + ctx.worldBook : ''}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

${ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : ''}

${ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : ''}

${ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : ''}

${ctx.financeContext ? '# 最近的账目\n' + ctx.financeContext : ''}

${existingCharItemsText ? '# 你之前记的账（避免重复）\n' + existingCharItemsText : ''}

${existingUserItemsText ? '# 伴侣记的账（参考）\n' + existingUserItemsText : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"type": "expense或income", "amount": 金额数字, "category": "分类ID", "title": "这笔账的简短描述", "note": "为什么花这笔钱/你的感受"}

分类ID可选值: ${categoryListText}

# 要求
- 基于你的记忆和最近的对话来记账，不要凭空编造金额
- 如果最近聊天提到了吃饭、买东西、看电影等消费场景，就记录下来
- 金额要合理，符合日常消费水平
- note 要像真人说话，体现你的性格，可以撒娇、吐槽、感慨
- 不要和已有记录重复
- 字数控制在 10-60 字
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '记一笔账吧。' }];

  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
  } else {
    const requestBody = JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: state.globalSettings.apiTemperature || 0.8,
              top_p: state.globalSettings.apiTopP !== undefined ? state.globalSettings.apiTopP : 1.0,
              presence_penalty: state.globalSettings.apiPresencePenalty !== undefined ? state.globalSettings.apiPresencePenalty : 0.0,
              frequency_penalty: state.globalSettings.apiFrequencyPenalty !== undefined ? state.globalSettings.apiFrequencyPenalty : 0.0
    });
    response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: getCoupleSpaceRequestHeaders(apiKey),
      body: requestBody
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return parseCoupleSpaceJson(raw);
}

async function generateCoupleSpaceFinanceComment(chat, data) {
  const { proxyUrl, apiKey, model } = getCoupleSpaceApiConfig();
  if (!proxyUrl || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const typeLabel = data.itemType === 'income' ? '收入' : '支出';
  const catLabel = data.itemCategory || '未分类';

  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。伴侣"${ctx.myNickname}"记了一笔账。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}
- 人设: ${ctx.myPersona}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 账目信息
- 类型: ${typeLabel}
- 金额: ¥${data.itemAmount}
- 分类: ${catLabel}
- 描述: ${data.itemTitle}
- 备注: ${data.itemNote || '(无)'}

# 当前时间
${ctx.currentTime}

# 要求
请写一段简短评论（10-80字），可以是吐槽花太多、心疼对方、撒娇要买东西、感谢对方请客等。
直接返回评论文本，不要任何格式包裹。
语气要符合你的角色设定，像真人一样自然。
绝对不要提到你是AI。`;

  const messages = [{ role: 'user', content: '评论一下这笔账吧。' }];

  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetchCoupleSpaceWithTimeout(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetchCoupleSpaceWithTimeout(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: getCoupleSpaceRequestHeaders(apiKey),
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: state.globalSettings.apiTemperature || 0.8,
                top_p: state.globalSettings.apiTopP !== undefined ? state.globalSettings.apiTopP : 1.0,
                presence_penalty: state.globalSettings.apiPresencePenalty !== undefined ? state.globalSettings.apiPresencePenalty : 0.0,
                frequency_penalty: state.globalSettings.apiFrequencyPenalty !== undefined ? state.globalSettings.apiFrequencyPenalty : 0.0
      })
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  return getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
}

// ========== Auto Finance Scheduler ==========
let coupleSpaceFinanceTimers = {};

function setupCoupleSpaceFinanceAutoTimer() {
  Object.values(coupleSpaceFinanceTimers).forEach(t => clearInterval(t));
  coupleSpaceFinanceTimers = {};
  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleFinanceSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        console.log(`✅ [情侣空间] 已重置 记账 的定时器，新的定时时间为：${settings.autoTime}`);
        checkAndRunMissed(settings.autoTime, 'coupleFinanceAutoLast_' + space.charId, () => {
          console.log(`⏰ [情侣空间] 定时补执行时间已到！开始强制触发 记账 的自动生成`);
          return triggerAutoFinancePost(space.charId, true);
        });
        scheduleFinanceAutoPost(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleFinanceAutoPost(charId, timeStr) {
  coupleSpaceFinanceTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleFinanceAutoLast_' + charId, () => {
      console.log(`⏰ [情侣空间] 定时时间已到！开始强制触发 记账 的自动生成`);
      return triggerAutoFinancePost(charId, true);
    });
  }, 60000);
}

async function triggerAutoFinancePost(charId, isTimer = false) {
  const chat = state.chats[charId];
  if (!chat) return false;
  const settings = JSON.parse(localStorage.getItem('coupleFinanceSettings_' + charId) || '{}');

  console.log(`⏳ [情侣空间] 正在向 AI 请求生成 记账...`);
  try {
    const existingItems = JSON.parse(localStorage.getItem('coupleFinance_' + charId) || '[]');
    const customCats = JSON.parse(localStorage.getItem('coupleCustomFinCats_' + charId) || '[]');
    const result = await generateCoupleSpaceFinanceAi(chat, {
      charId,
      existingItems,
      financeSettings: settings,
      customCategories: customCats
    });
    const newItem = {
      id: 'fin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      type: result.type || 'expense',
      amount: result.amount || 0,
      category: result.category || '',
      title: result.title || '',
      note: result.note || '',
      date: getCoupleSpaceLocalDateKey(),
      author: 'char',
      createdAt: Date.now(),
      hearts: { char: true },
      comments: []
    };
    const saved = sendOrSaveCoupleSpaceData(charId, {
      type: 'coupleSpaceFinanceAutoResult',
      item: newItem
    }, 'coupleFinance_', newItem);
    return saved;
  } catch(err) {
    console.error('Auto finance post failed:', err);
    return false;
  }
}

// Initialize finance timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceFinanceAutoTimer, 13000);
}
