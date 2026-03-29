// ========== 情侣空间 ==========
const COUPLE_SPACE_STORAGE_KEY = 'coupleSpaces';

// 通用定时补执行工具：检查今天是否已过设定时间但还没执行过，如果是则立即补执行
function checkAndRunMissed(timeStr, lastKey, callback) {
  try {
    const now = new Date();
    const [h, m] = timeStr.split(':').map(Number);
    const todayStr = now.toISOString().split('T')[0];
    const lastDate = localStorage.getItem(lastKey);
    if (lastDate === todayStr) return; // 今天已经执行过
    // 当前时间已经过了设定时间，说明错过了，立即补执行
    if (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)) {
      localStorage.setItem(lastKey, todayStr);
      callback();
    }
  } catch(e) { console.error('checkAndRunMissed error:', e); }
}

// ========== AI 自主决定模式 - 事件驱动触发 ==========
// 通过聊天消息或后台活动触发，而非固定定时
// source: 'chat' = 聊天消息后触发, 'background' = 后台活动触发
function triggerCoupleSpaceAiDecide(charId, source) {
  const spaces = getCoupleSpaces();
  if (!spaces.find(s => s.charId === charId)) return;

  const featureConfigs = [
    { settingsKey: 'coupleDiarySettings_', lastKey: 'coupleDiaryAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoDiaryWrite },
    { settingsKey: 'coupleAlbumSettings_', lastKey: 'coupleAlbumAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoAlbumPost },
    { settingsKey: 'coupleChecklistSettings_', lastKey: 'coupleChecklistAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoChecklistRecommend },
    { settingsKey: 'coupleMessageSettings_', lastKey: 'coupleMessageAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoMessagePost },
    { settingsKey: 'coupleMoodSettings_', lastKey: 'coupleMoodAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoMoodPost },
    { settingsKey: 'coupleTimelineSettings_', lastKey: 'coupleTimelineAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoTimelinePost },
    { settingsKey: 'coupleLetterSettings_', lastKey: 'coupleLetterAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoLetterPost },
    { settingsKey: 'coupleGardenSettings_', lastKey: 'coupleGardenAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoGardenWater },
    { settingsKey: 'coupleLocSettings_', lastKey: 'coupleLocAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoLocationPost },
    { settingsKey: 'coupleFinanceSettings_', lastKey: 'coupleFinanceAutoLast_', chatProb: 'aiDecideChatProb', bgProb: 'aiDecideBgProb', trigger: triggerAutoFinancePost },
  ];

  const todayStr = new Date().toISOString().split('T')[0];

  featureConfigs.forEach(cfg => {
    try {
      const settings = JSON.parse(localStorage.getItem(cfg.settingsKey + charId) || '{}');
      if (!settings.aiDecide) return;

      // 今天已经执行过就跳过
      const lastDate = localStorage.getItem(cfg.lastKey + charId);
      if (lastDate === todayStr) return;

      // 根据来源取对应概率（默认聊天15%，后台5%）
      const prob = source === 'chat'
        ? (settings[cfg.chatProb] ?? 15) / 100
        : (settings[cfg.bgProb] ?? 5) / 100;

      if (Math.random() < prob) {
        localStorage.setItem(cfg.lastKey + charId, todayStr);
        console.log(`[情侣空间] AI决定触发 ${cfg.settingsKey} (${source}, 概率${(prob*100).toFixed(0)}%)`);
        cfg.trigger(charId);
      }
    } catch(e) { console.error('aiDecide trigger error:', e); }
  });

  // 睡眠单独处理（有sleep/wake两个phase）
  try {
    const sleepSettings = JSON.parse(localStorage.getItem('coupleSleepSettings_' + charId) || '{}');
    if (sleepSettings.aiDecide) {
      const prob = source === 'chat'
        ? (sleepSettings.aiDecideChatProb ?? 15) / 100
        : (sleepSettings.aiDecideBgProb ?? 5) / 100;

      ['sleep', 'wake'].forEach(phase => {
        const lastKey = 'coupleSleepAuto_' + phase + '_' + charId;
        const lastDate = localStorage.getItem(lastKey);
        if (lastDate === todayStr) return;
        if (Math.random() < prob) {
          localStorage.setItem(lastKey, todayStr);
          console.log(`[情侣空间] AI决定触发 sleep-${phase} (${source})`);
          triggerAutoSleepPost(charId, phase);
        }
      });
    }
  } catch(e) {}
}

function getCoupleSpaces() {
  try { return JSON.parse(localStorage.getItem(COUPLE_SPACE_STORAGE_KEY)) || []; }
  catch(e) { return []; }
}
function saveCoupleSpaces(spaces) {
  localStorage.setItem(COUPLE_SPACE_STORAGE_KEY, JSON.stringify(spaces));
}
function getLastCoupleSpace() {
  const last = localStorage.getItem('coupleSpaceLastId');
  const spaces = getCoupleSpaces();
  if (last && spaces.find(s => s.charId === last)) return last;
  return spaces.length > 0 ? spaces[0].charId : null;
}

function openCoupleSpace() {
  const lastId = getLastCoupleSpace();
  if (lastId) {
    enterCoupleSpace(lastId);
  } else {
    showCoupleSpaceSelect('invite');
  }
}

function showCoupleSpaceSelect(mode) {
  const container = document.getElementById('couple-space-select-content');
  container.innerHTML = '';
  const spaces = getCoupleSpaces();
  const characters = Object.values(state.chats).filter(c => !c.isGroup);

  if (mode === 'list') {
    // 已有空间列表
    if (spaces.length > 0) {
      spaces.forEach(sp => {
        const chat = state.chats[sp.charId];
        if (!chat) return;
        const item = document.createElement('div');
        item.className = 'character-select-item';
        item.innerHTML = `
          <img src="${chat.settings.aiAvatar || defaultAvatar}" class="avatar">
          <span class="name">${chat.name}</span>
          <span style="margin-left:auto;font-size:12px;color:#999;">已绑定</span>`;
        item.addEventListener('click', () => enterCoupleSpace(sp.charId));
        container.appendChild(item);
      });
    }
    // 新建入口
    const addBtn = document.createElement('div');
    addBtn.className = 'character-select-item';
    addBtn.style.cssText = 'justify-content:center;color:var(--text-secondary);';
    addBtn.innerHTML = `<span style="font-size:22px;margin-right:8px;">+</span><span class="name" style="color:inherit;">开启新空间</span>`;
    addBtn.addEventListener('click', () => showCoupleSpaceSelect('invite'));
    container.appendChild(addBtn);
  } else {
    // 邀请模式 - 选择角色
    const bound = new Set(spaces.map(s => s.charId));
    const available = characters.filter(c => !bound.has(c.id));
    if (available.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:50px 0;">没有可邀请的角色了~</p>';
      if (spaces.length > 0) {
        const backBtn = document.createElement('div');
        backBtn.className = 'character-select-item';
        backBtn.style.cssText = 'justify-content:center;color:var(--text-secondary);margin-top:10px;';
        backBtn.innerHTML = '<span class="name" style="color:inherit;">返回空间列表</span>';
        backBtn.addEventListener('click', () => showCoupleSpaceSelect('list'));
        container.appendChild(backBtn);
      }
      return;
    }
    // 提示文字已移除，直接展示角色列表

    available.forEach(char => {
      const item = document.createElement('div');
      item.className = 'character-select-item';
      item.innerHTML = `
        <img src="${char.settings.aiAvatar || defaultAvatar}" class="avatar">
        <span class="name">${char.name}</span>`;
      item.addEventListener('click', () => inviteToCoupleSpace(char));
      container.appendChild(item);
    });

    if (spaces.length > 0) {
      const backBtn = document.createElement('div');
      backBtn.className = 'character-select-item';
      backBtn.style.cssText = 'justify-content:center;color:var(--text-secondary);margin-top:10px;';
      backBtn.innerHTML = '<span class="name" style="color:inherit;">返回空间列表</span>';
      backBtn.addEventListener('click', () => showCoupleSpaceSelect('list'));
      container.appendChild(backBtn);
    }
  }
  showScreen('couple-space-select-screen');
}

function inviteToCoupleSpace(char) {
  // 不再直接创建空间，而是发送邀请卡片到聊天中
  const chat = state.chats[char.id];
  if (!chat) return;

  const myNickname = chat.settings.myNickname || '我';

  const inviteMsg = {
    role: 'user',
    type: 'couple_invite',
    status: 'pending',
    senderName: myNickname,
    receiverName: chat.name,
    timestamp: Date.now()
  };
  chat.history.push(inviteMsg);
  db.chats.put(chat);

  // 关闭选择界面，跳转到聊天界面
  state.activeChatId = char.id;
  showScreen('chat-interface-screen');
  renderChatInterface(char.id);
  renderChatList();
}

// 当角色接受邀请后，真正创建情侣空间
function confirmCoupleSpace(charId) {
  const spaces = getCoupleSpaces();
  if (spaces.find(s => s.charId === charId)) return; // 已存在
  const chat = state.chats[charId];
  spaces.push({
    charId: charId,
    charName: chat ? chat.name : '',
    createdAt: Date.now()
  });
  saveCoupleSpaces(spaces);
}

function enterCoupleSpace(charId) {
  localStorage.setItem('coupleSpaceLastId', charId);
  const chat = state.chats[charId];
  const charName = chat ? chat.name : '';
  const charAvatar = chat ? (chat.settings.aiAvatar || defaultAvatar) : '';
  const userNickname = chat ? (chat.settings.myNickname || '我') : '我';
  const userAvatar = chat ? (chat.settings.myAvatar || state.qzoneSettings.avatar || defaultAvatar) : defaultAvatar;
  const iframe = document.getElementById('couple-space-iframe');
  iframe.src = '330--main/index.html';
  iframe.onload = function() {
    const spaces = getCoupleSpaces();
    const space = spaces.find(s => s.charId === charId);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceInit',
      charId: charId,
      charName: charName,
      charAvatar: charAvatar,
      userName: userNickname,
      userAvatar: userAvatar,
      createdAt: space ? space.createdAt : Date.now()
    }, '*');
  };
  showScreen('couple-space-screen');
}

function closeCoupleSpace() {
  showScreen('home-screen');
  document.getElementById('couple-space-iframe').src = '';
}

window.addEventListener('message', function(e) {
  if (e.data === 'closeCoupleSpace') closeCoupleSpace();
  if (e.data === 'coupleSpaceSwitchPartner') showCoupleSpaceSelect('list');

  // --- Diary AI requests ---
  if (e.data && e.data.type === 'coupleSpaceDiaryAiRequest') {
    handleCoupleSpaceDiaryAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceDiaryCommentRequest') {
    handleCoupleSpaceDiaryCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceDiarySettingsChanged') {
    handleCoupleSpaceDiarySettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceDiarySummaryRequest') {
    handleCoupleSpaceDiarySummaryRequest(e.data);
  }

  // --- Album requests ---
  if (e.data && e.data.type === 'coupleSpaceAlbumAiRequest') {
    handleCoupleSpaceAlbumAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceAlbumSettingsChanged') {
    handleCoupleSpaceAlbumSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceAlbumRecognize') {
    handleCoupleSpaceAlbumRecognize(e.data);
  }

  // --- Album comment requests ---
  if (e.data && e.data.type === 'coupleSpaceAlbumCommentRequest') {
    handleCoupleSpaceAlbumCommentRequest(e.data);
  }

  // --- Anniversary requests ---
  if (e.data && e.data.type === 'coupleSpaceAnnivHeartRequest') {
    handleCoupleSpaceAnnivHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceAnnivChanged') {
    handleCoupleSpaceAnnivChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceAnnivCreateRequest') {
    handleCoupleSpaceAnnivCreateRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceAnnivSettingsChanged') {
    handleCoupleSpaceAnnivSettingsChanged(e.data);
  }

  // --- Screenshot requests ---
  if (e.data && e.data.type === 'coupleSpaceScreenshotRequest') {
    handleCoupleSpaceScreenshotRequest(e.data);
  }

  // --- Checklist requests ---
  if (e.data && e.data.type === 'coupleSpaceChecklistAiRequest') {
    handleCoupleSpaceChecklistAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceChecklistCommentRequest') {
    handleCoupleSpaceChecklistCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceChecklistSettingsChanged') {
    handleCoupleSpaceChecklistSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceChecklistHeartRequest') {
    handleCoupleSpaceChecklistHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceChecklistChanged') {
    handleCoupleSpaceChecklistChanged(e.data);
  }

  // --- Message Board requests ---
  if (e.data && e.data.type === 'coupleSpaceMessageAiRequest') {
    handleCoupleSpaceMessageAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceMessageReplyRequest') {
    handleCoupleSpaceMessageReplyRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceMessageHeartRequest') {
    handleCoupleSpaceMessageHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceMessageSettingsChanged') {
    handleCoupleSpaceMessageSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceMessageChanged') {
    handleCoupleSpaceMessageChanged(e.data);
  }

  // --- Mood requests ---
  if (e.data && e.data.type === 'coupleSpaceMoodAiRequest') {
    handleCoupleSpaceMoodAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceMoodCommentRequest') {
    handleCoupleSpaceMoodCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceMoodHeartRequest') {
    handleCoupleSpaceMoodHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceMoodSettingsChanged') {
    handleCoupleSpaceMoodSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceMoodChanged') {
    handleCoupleSpaceMoodChanged(e.data);
  }

  // --- Letter requests ---
  if (e.data && e.data.type === 'coupleSpaceLetterAiRequest') {
    handleCoupleSpaceLetterAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLetterReplyRequest') {
    handleCoupleSpaceLetterReplyRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLetterCommentRequest') {
    handleCoupleSpaceLetterCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLetterHeartRequest') {
    handleCoupleSpaceLetterHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLetterSettingsChanged') {
    handleCoupleSpaceLetterSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLetterChanged') {
    handleCoupleSpaceLetterChanged(e.data);
  }

  // --- Timeline requests ---
  if (e.data && e.data.type === 'coupleSpaceTimelineAiRequest') {
    handleCoupleSpaceTimelineAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceTimelineCommentRequest') {
    handleCoupleSpaceTimelineCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceTimelineHeartRequest') {
    handleCoupleSpaceTimelineHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceTimelineSettingsChanged') {
    handleCoupleSpaceTimelineSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceTimelineChanged') {
    handleCoupleSpaceTimelineChanged(e.data);
  }

  // --- Garden (Tree) requests ---
  if (e.data && e.data.type === 'coupleSpaceGardenAiRequest') {
    handleCoupleSpaceGardenAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceGardenCommentRequest') {
    handleCoupleSpaceGardenCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceGardenHeartRequest') {
    handleCoupleSpaceGardenHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceGardenSettingsChanged') {
    handleCoupleSpaceGardenSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceGardenChanged') {
    handleCoupleSpaceGardenChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceGardenWaterReward') {
    handleCoupleSpaceGardenWaterReward(e.data);
  }

  // --- Location requests ---
  if (e.data && e.data.type === 'coupleSpaceLocationAiRequest') {
    handleCoupleSpaceLocationAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLocationCommentRequest') {
    handleCoupleSpaceLocationCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLocationHeartRequest') {
    handleCoupleSpaceLocationHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLocationSettingsChanged') {
    handleCoupleSpaceLocationSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceLocationChanged') {
    handleCoupleSpaceLocationChanged(e.data);
  }

  // --- Sleep requests ---
  if (e.data && e.data.type === 'coupleSpaceSleepAiRequest') {
    handleCoupleSpaceSleepAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceSleepCommentRequest') {
    handleCoupleSpaceSleepCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceSleepHeartRequest') {
    handleCoupleSpaceSleepHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceSleepSettingsChanged') {
    handleCoupleSpaceSleepSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceSleepChanged') {
    handleCoupleSpaceSleepChanged(e.data);
  }

  // --- Finance requests ---
  if (e.data && e.data.type === 'coupleSpaceFinanceAiRequest') {
    handleCoupleSpaceFinanceAiRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceFinanceCommentRequest') {
    handleCoupleSpaceFinanceCommentRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceFinanceHeartRequest') {
    handleCoupleSpaceFinanceHeartRequest(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceFinanceSettingsChanged') {
    handleCoupleSpaceFinanceSettingsChanged(e.data);
  }
  if (e.data && e.data.type === 'coupleSpaceFinanceChanged') {
    handleCoupleSpaceFinanceChanged(e.data);
  }
});

// ========== Diary AI Integration ==========

async function handleCoupleSpaceDiaryAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceDiaryAiResult', error: true }, '*');
    return;
  }
  // 一天一篇限制
  try {
    const diaries = JSON.parse(localStorage.getItem('coupleDiaries_' + data.charId) || '[]');
    const todayStr = new Date().toISOString().split('T')[0];
    const wroteToday = diaries.some(d => d.author === 'char' && new Date(d.timestamp).toISOString().split('T')[0] === todayStr);
    if (wroteToday) {
      iframe.contentWindow.postMessage({ type: 'coupleSpaceDiaryAiResult', error: true, reason: 'already_wrote_today' }, '*');
      return;
    }
  } catch(e) {}
  try {
    const result = await generateCoupleSpaceDiaryAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceDiaryAiResult',
      title: result.title,
      content: result.content,
      mood: result.mood
    }, '*');
  } catch(err) {
    console.error('Diary AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceDiaryAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceDiaryCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceDiaryCommentResult', diaryId: data.diaryId, error: true }, '*');
    return;
  }
  try {
    const comment = await generateCoupleSpaceDiaryComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceDiaryCommentResult',
      diaryId: data.diaryId,
      comment: comment
    }, '*');
  } catch(err) {
    console.error('Diary comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceDiaryCommentResult', diaryId: data.diaryId, error: true }, '*');
  }
}

function handleCoupleSpaceDiarySettingsChanged(data) {
  // Store settings in parent for auto-trigger scheduling
  localStorage.setItem('coupleDiarySettings_' + data.charId, JSON.stringify(data.settings));
}

async function handleCoupleSpaceDiarySummaryRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  try {
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');

    const authorName = data.diaryAuthor === 'char' ? data.charName : data.userName;
    let commentsText = '';
    if (data.diaryComments && data.diaryComments.length > 0) {
      commentsText = '\n评语：\n' + data.diaryComments.map(c => {
        const cName = c.author === 'char' ? data.charName : data.userName;
        return cName + ': ' + c.content;
      }).join('\n');
    }

    const prompt = `请为以下日记生成一段简洁的摘要（50-100字），概括日记的核心内容、情感和关键事件。直接返回摘要文本，不要任何格式包裹。

日记标题: ${data.diaryTitle}
作者: ${authorName}
心情: ${data.diaryMood || '未标注'}
正文:
${data.diaryContent}
${commentsText}`;

    const messages = [{ role: 'user', content: prompt }];
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, messages);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, ...messages], temperature: 0.5 })
      });
    }
    if (!response.ok) throw new Error('API请求失败');
    const respData = await response.json();
    const summary = getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
    iframe.contentWindow.postMessage({ type: 'coupleSpaceDiarySummaryResult', diaryId: data.diaryId, summary }, '*');
  } catch(err) {
    console.error('Diary summary error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceDiarySummaryResult', diaryId: data.diaryId, error: true }, '*');
  }
}

function buildDiaryAiContext(chat) {
  const myNickname = chat.settings.myNickname || '我';
  const charName = chat.name;

  // Memory: pick one based on memoryMode setting
  let memoryContext = '';
  const memoryMode = chat.settings.memoryMode || (chat.settings.enableStructuredMemory ? 'structured' : 'diary');
  if (memoryMode === 'vector' && typeof vectorMemoryManager !== 'undefined') {
    // 向量记忆：同步获取核心记忆，异步检索在调用处处理
    try { memoryContext = vectorMemoryManager.serializeCoreMemories(chat); } catch(e) {}
  } else if ((memoryMode === 'structured' || chat.settings.enableStructuredMemory) && typeof structuredMemoryManager !== 'undefined') {
    try { memoryContext = structuredMemoryManager.serializeForPrompt(chat); } catch(e) {}
  } else if (chat.longTermMemory && chat.longTermMemory.length > 0) {
    memoryContext = chat.longTermMemory.map(m => '- ' + m.content).join('\n');
  }

  // Short-term memory (recent chat)
  const maxMemory = parseInt(chat.settings.maxMemory) || 10;
  const recentHistory = chat.history.filter(m => !m.isExcluded && !m.isHidden).slice(-maxMemory);
  let shortTermMemory = '';
  if (recentHistory.length > 0) {
    shortTermMemory = recentHistory.map(msg => {
      const sender = msg.role === 'user' ? myNickname : charName;
      let content = '';
      if (msg.type === 'voice_message') content = '[语音] ' + msg.content;
      else if (msg.type === 'ai_image' || msg.type === 'user_photo') content = '[图片] ' + msg.content;
      else if (msg.type === 'sticker') content = '[表情: ' + (msg.meaning || '') + ']';
      else content = String(msg.content || '').substring(0, 150);
      return sender + ': ' + content;
    }).join('\n');
  }

  // Linked memories
  let linkedMemory = '';
  const memoryCount = chat.settings.linkedMemoryCount || 10;
  if (chat.settings.linkedMemoryChatIds && chat.settings.linkedMemoryChatIds.length > 0) {
    const idsToMount = chat.settings.linkedMemoryChatIds.filter(id => id !== chat.id);
    idsToMount.forEach(id => {
      const linkedChat = state.chats[id];
      if (!linkedChat) return;
      const recent = linkedChat.history.filter(m => !m.isHidden).slice(-memoryCount);
      if (recent.length > 0) {
        linkedMemory += '\n来自"' + linkedChat.name + '"的记忆:\n';
        recent.forEach(msg => {
          const sender = msg.role === 'user' ? (linkedChat.settings.myNickname || '我') : linkedChat.name;
          linkedMemory += sender + ': ' + String(msg.content || '').substring(0, 100) + '\n';
        });
      }
    });
  }

  // World book
  let worldBook = '';
  let allWorldBookIds = [...(chat.settings.linkedWorldBookIds || [])];
  if (typeof state !== 'undefined' && state.worldBooks) {
    state.worldBooks.forEach(wb => {
      if (wb.isGlobal && !allWorldBookIds.includes(wb.id)) allWorldBookIds.push(wb.id);
    });
    allWorldBookIds.forEach(bookId => {
      const wb = state.worldBooks.find(w => w.id === bookId);
      if (!wb || !Array.isArray(wb.content)) return;
      wb.content.filter(e => e.enabled !== false).forEach(entry => {
        worldBook += entry.content + '\n';
      });
    });
  }

  // Time
  let currentTime = '';
  try {
    const tz = chat.settings.timeZone || 'Asia/Shanghai';
    currentTime = new Date().toLocaleString('zh-CN', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' });
  } catch(e) {
    currentTime = new Date().toLocaleString('zh-CN');
  }

  // Weather
  let weatherInfo = '';
  // Weather is async, skip for simplicity; AI can infer from time

  // Anniversaries
  let anniversaryContext = '';
  try {
    const annivs = JSON.parse(localStorage.getItem('coupleAnniv_' + chat.id) || '[]');
    if (annivs.length > 0) {
      const now = new Date(); now.setHours(0,0,0,0);
      const todayItems = [];
      const upcomingItems = [];
      const allItems = [];

      annivs.forEach(a => {
        const d = new Date(a.date + 'T00:00:00');
        const thisYear = new Date(now.getFullYear(), d.getMonth(), d.getDate());
        const nextOcc = thisYear >= now ? thisYear : new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
        const daysUntil = Math.floor((nextOcc - now) / 86400000);
        const daysSince = Math.floor((now - d) / 86400000);
        const heartInfo = [];
        if (a.hearts && a.hearts.user) heartInfo.push(myNickname + '点了爱心');
        if (a.hearts && a.hearts.char) heartInfo.push(charName + '点了爱心');

        const entry = `"${a.title}" (${a.date}, ${a.reason || '无理由'})${heartInfo.length > 0 ? ' [' + heartInfo.join(', ') + ']' : ''}`;

        if (daysUntil === 0) todayItems.push(entry);
        else if (daysUntil <= 7) upcomingItems.push(`${entry} - 还有${daysUntil}天`);
        allItems.push(`- ${entry} (已${daysSince}天)`);
      });

      if (todayItems.length > 0) anniversaryContext += '🎉 今天是纪念日: ' + todayItems.join('; ') + '\n';
      if (upcomingItems.length > 0) anniversaryContext += '📅 即将到来: ' + upcomingItems.join('; ') + '\n';
      anniversaryContext += '所有纪念日:\n' + allItems.join('\n');
    }
  } catch(e) {}

  // Summary
  let summaryContext = '';
  if (typeof generateSummaryForTimeframe === 'function') {
    try {
      const s1 = generateSummaryForTimeframe(chat, 1, 'days');
      const s3 = generateSummaryForTimeframe(chat, 3, 'days');
      if (s1) summaryContext += s1;
      if (s3) summaryContext += s3;
    } catch(e) {}
  }

  // Checklist context
  let checklistContext = '';
  try {
    const clItems = JSON.parse(localStorage.getItem('coupleChecklist_' + chat.id) || '[]');
    if (clItems.length > 0) {
      const pending = clItems.filter(i => !i.done);
      const done = clItems.filter(i => i.done).slice(-5);
      if (pending.length > 0) {
        checklistContext += '待完成:\n' + pending.map(i =>
          '- "' + i.title + '" (' + i.category + ', ' +
          (i.author === 'char' ? charName : myNickname) + '创建)'
        ).join('\n') + '\n';
      }
      if (done.length > 0) {
        checklistContext += '最近完成:\n' + done.map(i =>
          '- "' + i.title + '" (完成于' + new Date(i.doneAt).toLocaleDateString('zh-CN') + ')'
        ).join('\n');
      }
    }
  } catch(e) {}

  // Timeline context
  let timelineContext = '';
  try {
    const tlItems = JSON.parse(localStorage.getItem('coupleTimeline_' + chat.id) || '[]');
    if (tlItems.length > 0) {
      const recent = tlItems.slice(-5);
      timelineContext = '最近的时光记录:\n' + recent.map(i =>
        '- [' + (i.category || 'moment') + '] "' + i.title + '": ' + (i.content || '').substring(0, 80) +
        ' (' + (i.author === 'char' ? charName : myNickname) + '记录)'
      ).join('\n');
    }
  } catch(e) {}

  // Mood context
  let moodContext = '';
  try {
    const moodItems = JSON.parse(localStorage.getItem('coupleMoods_' + chat.id) || '[]');
    if (moodItems.length > 0) {
      const charMoods = moodItems.filter(i => i.author === 'char').slice(-5);
      const userMoods = moodItems.filter(i => i.author === 'user').slice(-5);
      if (charMoods.length > 0) {
        moodContext += charName + '最近的心情:\n' + charMoods.map(i =>
          '- ' + i.moodType + ': "' + (i.content || '').substring(0, 80) + '" (' + new Date(i.createdAt).toLocaleDateString('zh-CN') + ')'
        ).join('\n') + '\n';
      }
      if (userMoods.length > 0) {
        moodContext += myNickname + '最近的心情:\n' + userMoods.map(i =>
          '- ' + i.moodType + ': "' + (i.content || '').substring(0, 80) + '" (' + new Date(i.createdAt).toLocaleDateString('zh-CN') + ')'
        ).join('\n');
      }
    }
  } catch(e) {}

  // Letter context
  let letterContext = '';
  try {
    const letterItems = JSON.parse(localStorage.getItem('coupleLetters_' + chat.id) || '[]');
    if (letterItems.length > 0) {
      const charLetters = letterItems.filter(i => i.author === 'char').slice(-3);
      const userLetters = letterItems.filter(i => i.author === 'user').slice(-3);
      if (charLetters.length > 0) {
        letterContext += charName + '最近写的信:\n' + charLetters.map(i =>
          '- "' + i.title + '": ' + (i.content || '').substring(0, 100) + '... (' + new Date(i.createdAt).toLocaleDateString('zh-CN') + ')'
        ).join('\n') + '\n';
      }
      if (userLetters.length > 0) {
        letterContext += myNickname + '最近写的信:\n' + userLetters.map(i =>
          '- "' + i.title + '": ' + (i.content || '').substring(0, 100) + '... (' + new Date(i.createdAt).toLocaleDateString('zh-CN') + ')'
        ).join('\n');
      }
    }
  } catch(e) {}

  // Garden (Tree) context
  let gardenContext = '';
  try {
    const gardenData = JSON.parse(localStorage.getItem('coupleGarden_' + chat.id) || '{}');
    const waterLogs = gardenData.waterLogs || [];
    if (waterLogs.length > 0) {
      const treeName = gardenData.treeName || '情侣树';
      const totalCoins = gardenData.totalCoins || 0;
      const stages = [
        { min: 0, name: '种子' }, { min: 1, name: '嫩芽' }, { min: 31, name: '小树苗' },
        { min: 101, name: '小树' }, { min: 301, name: '大树' }, { min: 601, name: '开花' }, { min: 1001, name: '结果' }
      ];
      let stageName = '种子';
      for (let i = stages.length - 1; i >= 0; i--) { if (totalCoins >= stages[i].min) { stageName = stages[i].name; break; } }
      gardenContext += treeName + ' (' + stageName + ', 总收入' + totalCoins.toFixed(2) + '元, 共浇水' + waterLogs.length + '次)\n';
      const charWaters = waterLogs.filter(i => i.author === 'char').slice(-3);
      const userWaters = waterLogs.filter(i => i.author === 'user').slice(-3);
      if (charWaters.length > 0) {
        gardenContext += charName + '最近的浇水:\n' + charWaters.map(i =>
          '- "' + (i.content || '').substring(0, 80) + '" (' + new Date(i.createdAt).toLocaleDateString('zh-CN') + ')'
        ).join('\n') + '\n';
      }
      if (userWaters.length > 0) {
        gardenContext += myNickname + '最近的浇水:\n' + userWaters.map(i =>
          '- "' + (i.content || '').substring(0, 80) + '" (' + new Date(i.createdAt).toLocaleDateString('zh-CN') + ')'
        ).join('\n');
      }
    }
  } catch(e) {}

  // Location context
  let locationContext = '';
  try {
    const locItems = JSON.parse(localStorage.getItem('coupleLocations_' + chat.id) || '[]');
    if (locItems.length > 0) {
      const charLocs = locItems.filter(i => i.author === 'char').slice(-5);
      const userLocs = locItems.filter(i => i.author === 'user').slice(-5);
      if (charLocs.length > 0) {
        locationContext += charName + '分享的地点:\n' + charLocs.map(i =>
          '- [' + (i.category || 'daily') + '] "' + i.name + '": ' + (i.description || '').substring(0, 80) +
          (i.address ? ' (' + i.address + ')' : '')
        ).join('\n') + '\n';
      }
      if (userLocs.length > 0) {
        locationContext += myNickname + '分享的地点:\n' + userLocs.map(i =>
          '- [' + (i.category || 'daily') + '] "' + i.name + '": ' + (i.description || '').substring(0, 80) +
          (i.address ? ' (' + i.address + ')' : '')
        ).join('\n');
      }
    }
  } catch(e) {}

  // Sleep context
  let sleepContext = '';
  try {
    const sleepItems = JSON.parse(localStorage.getItem('coupleSleep_' + chat.id) || '[]');
    if (sleepItems.length > 0) {
      const charSleeps = sleepItems.filter(i => i.author === 'char').slice(-5);
      const userSleeps = sleepItems.filter(i => i.author === 'user').slice(-5);
      if (charSleeps.length > 0) {
        sleepContext += charName + '最近的睡眠:\n' + charSleeps.map(i => {
          let line = '- ' + new Date(i.sleepAt || i.createdAt).toLocaleDateString('zh-CN');
          if (i.sleepNote) line += ' 入睡:"' + i.sleepNote.substring(0, 50) + '"';
          if (i.events && i.events.length > 0) {
            line += ' 期间:[' + i.events.map(e => e.type + ':"' + (e.content || '').substring(0, 40) + '"').join(', ') + ']';
          }
          if (i.wakeNote) line += ' 起床:"' + i.wakeNote.substring(0, 50) + '"';
          line += ' 质量:' + (i.quality || '未知');
          return line;
        }).join('\n') + '\n';
      }
      if (userSleeps.length > 0) {
        sleepContext += myNickname + '最近的睡眠:\n' + userSleeps.map(i => {
          let line = '- ' + new Date(i.sleepAt || i.createdAt).toLocaleDateString('zh-CN');
          if (i.sleepNote) line += ' 入睡:"' + i.sleepNote.substring(0, 50) + '"';
          if (i.events && i.events.length > 0) {
            line += ' 期间:[' + i.events.map(e => e.type + ':"' + (e.content || '').substring(0, 40) + '"').join(', ') + ']';
          }
          if (i.wakeNote) line += ' 起床:"' + i.wakeNote.substring(0, 50) + '"';
          line += ' 质量:' + (i.quality || '未知');
          return line;
        }).join('\n');
      }
    }
  } catch(e) {}

  // Finance context
  let financeContext = '';
  try {
    const finItems = JSON.parse(localStorage.getItem('coupleFinance_' + chat.id) || '[]');
    if (finItems.length > 0) {
      const now = new Date();
      const thisMonth = finItems.filter(i => {
        const d = new Date(i.date || i.createdAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      const monthExpense = thisMonth.filter(i => i.type === 'expense').reduce((s, i) => s + (i.amount || 0), 0);
      const monthIncome = thisMonth.filter(i => i.type === 'income').reduce((s, i) => s + (i.amount || 0), 0);
      financeContext += '本月支出: ' + monthExpense.toFixed(2) + '元, 收入: ' + monthIncome.toFixed(2) + '元\n';
      const charFin = finItems.filter(i => i.author === 'char').slice(-5);
      const userFin = finItems.filter(i => i.author === 'user').slice(-5);
      if (charFin.length > 0) {
        financeContext += charName + '最近记的账:\n' + charFin.map(i =>
          '- [' + i.type + '] ' + i.category + ' ¥' + i.amount + ' "' + i.title + '"'
        ).join('\n') + '\n';
      }
      if (userFin.length > 0) {
        financeContext += myNickname + '最近记的账:\n' + userFin.map(i =>
          '- [' + i.type + '] ' + i.category + ' ¥' + i.amount + ' "' + i.title + '"'
        ).join('\n');
      }
    }
  } catch(e) {}

  return {
    aiPersona: chat.settings.aiPersona || '',
    myPersona: chat.settings.myPersona || '',
    myNickname,
    charName,
    memoryContext,
    shortTermMemory,
    linkedMemory,
    worldBook,
    currentTime,
    summaryContext,
    anniversaryContext,
    checklistContext,
    timelineContext,
    moodContext,
    letterContext,
    gardenContext,
    locationContext,
    sleepContext,
    financeContext
  };
}

async function generateCoupleSpaceDiaryAi(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  let recentDiariesText = '';
  if (data.recentDiaries && data.recentDiaries.length > 0) {
    recentDiariesText = data.recentDiaries.map(d =>
      '- [' + d.date + '] ' + d.author + '《' + d.title + '》: ' + d.content
    ).join('\n');
  }

  // 检查是否有自定义提示词
  let diarySettings = {};
  try { diarySettings = JSON.parse(localStorage.getItem('coupleDiarySettings_' + data.charId) || '{}'); } catch(e) {}

  let systemPrompt;
  if (diarySettings.enableCustomPrompt && diarySettings.customPrompt) {
    // 使用自定义提示词模板，替换变量
    systemPrompt = diarySettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{structuredMemory\}\}/g, ctx.memoryContext || '(暂无记忆)')
      .replace(/\{\{longTermMemory\}\}/g, ctx.memoryContext ? '# 记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{recentDiaries\}\}/g, recentDiariesText ? '# 最近的日记（避免重复话题）\n' + recentDiariesText : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间里写一篇日记。这篇日记是写给你自己的，但你的伴侣"${ctx.myNickname}"可以看到并写评语。

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

${recentDiariesText ? '# 最近的日记（避免重复话题）\n' + recentDiariesText : ''}

${ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : ''}

${ctx.checklistContext ? '# 情侣清单\n' + ctx.checklistContext : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"title": "日记标题", "content": "日记正文", "mood": "心情ID"}

心情ID可选值: happy, calm, moved, miss, sad, angry, excited, tired（选一个最符合的）

# 写作要求
- 以第一人称写，像真人写日记一样自然
- 内容要基于你的记忆和最近发生的事
- 可以写对伴侣的感受、今天的心情、发生的事、未来的期待等
- 字数在100-400字之间
- 语气要符合你的角色设定
- 不要写成流水账，要有情感和细节
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '请写一篇日记。' }];

  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: state.globalSettings.apiTemperature || 0.8
      })
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(raw);
}

async function generateCoupleSpaceDiaryComment(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  let taskDesc = '';
  if (data.diaryAuthor === 'user') {
    taskDesc = `${ctx.myNickname}写了一篇日记，请你作为${ctx.charName}写一条评语。`;
  } else {
    taskDesc = `你（${ctx.charName}）之前写了一篇日记，${ctx.myNickname}给你写了评语："${data.userComment}"。请你回复这条评语。`;
  }

  const systemPrompt = `# 你的任务
${taskDesc}

# 你的角色设定
${ctx.aiPersona}

# 日记信息
- 标题: ${data.diaryTitle}
- 内容: ${data.diaryContent}
- 心情: ${data.diaryMood || '未标注'}
- 作者: ${data.diaryAuthor === 'user' ? ctx.myNickname : ctx.charName}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

# 输出要求
直接返回评语文本，不要JSON格式，不要引号包裹。

# 写作要求
- 像真人写评论一样自然
- 字数在20-150字之间
- 语气符合你的角色设定
- 可以表达感受、回应日记内容、或者撒娇/关心
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请写评语。' }];

  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: state.globalSettings.apiTemperature || 0.8
      })
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  return getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
}

// ========== Auto Diary Scheduler ==========
let coupleSpaceDiaryTimers = {};

function setupCoupleSpaceDiaryAutoTimer() {
  // Clear existing timers
  Object.values(coupleSpaceDiaryTimers).forEach(t => clearInterval(t));
  coupleSpaceDiaryTimers = {};

  const spaces = getCoupleSpaces();
  spaces.forEach(sp => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleDiarySettings_' + sp.charId)) || {};
      if (settings.autoEnabled && settings.autoTime) {
        // Check if missed today's execution on startup
        checkAndRunMissed(settings.autoTime, 'coupleDiaryAutoLast_' + sp.charId, () => triggerAutoDiaryWrite(sp.charId));
        scheduleDiaryAutoWrite(sp.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleDiaryAutoWrite(charId, timeStr) {
  coupleSpaceDiaryTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleDiaryAutoLast_' + charId, () => triggerAutoDiaryWrite(charId));
  }, 60000);
}

async function triggerAutoDiaryWrite(charId) {
  const chat = state.chats[charId];
  if (!chat) return;

  // 一天一篇限制
  try {
    const diaries = JSON.parse(localStorage.getItem('coupleDiaries_' + charId) || '[]');
    const todayStr = new Date().toISOString().split('T')[0];
    if (diaries.some(d => d.author === 'char' && new Date(d.timestamp).toISOString().split('T')[0] === todayStr)) return;
  } catch(e) {}

  const settings = JSON.parse(localStorage.getItem('coupleDiarySettings_' + charId) || '{}');

  try {
    const recentDiaries = [];
    try {
      const diaries = JSON.parse(localStorage.getItem('coupleDiaries_' + charId)) || [];
      diaries.slice(-5).forEach(d => {
        recentDiaries.push({
          author: d.author === 'char' ? chat.name : (chat.settings.myNickname || '我'),
          title: d.title,
          content: (d.content || '').substring(0, 200),
          mood: d.mood,
          date: new Date(d.timestamp).toLocaleString('zh-CN')
        });
      });
    } catch(e) {}

    const result = await generateCoupleSpaceDiaryAi(chat, {
      charId,
      recentDiaries,
      charName: chat.name,
      userName: chat.settings.myNickname || '我'
    });

    // Save directly to localStorage
    const diaries = JSON.parse(localStorage.getItem('coupleDiaries_' + charId) || '[]');
    diaries.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      author: 'char',
      title: result.title || '无题',
      content: result.content || '',
      mood: result.mood || '',
      timestamp: Date.now(),
      comments: []
    });
    localStorage.setItem('coupleDiaries_' + charId, JSON.stringify(diaries));

    // If iframe is open and showing this char, notify it
    const iframe = document.getElementById('couple-space-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'coupleSpaceDiaryAiResult',
        title: result.title,
        content: result.content,
        mood: result.mood
      }, '*');
    }
  } catch(err) {
    console.error('Auto diary write failed:', err);
  }
}

async function askAiIfShouldWriteDiary(chat) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) return false;

  const ctx = buildDiaryAiContext(chat);

  const prompt = `你是"${ctx.charName}"。根据你最近和"${ctx.myNickname}"的互动，判断今天是否有值得写进日记的事情。

最近的对话:
${ctx.shortTermMemory || '(无)'}

${ctx.summaryContext ? '对话总结:\n' + ctx.summaryContext : ''}

请只回答 "yes" 或 "no"，不要其他内容。`;

  try {
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '今天要写日记吗？' }]);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: '今天要写日记吗？' }],
          temperature: 0.5
        })
      });
    }
    if (!response.ok) return false;
    const data = await response.json();
    const answer = getGeminiResponseText(data).trim().toLowerCase();
    return answer.includes('yes');
  } catch(e) {
    return false;
  }
}

// Initialize auto diary timers when app loads
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceDiaryAutoTimer, 5000);
  setTimeout(setupCoupleSpaceAlbumAutoTimer, 6000);
}

// ========== Album AI Integration ==========

async function handleCoupleSpaceAlbumAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceAlbumAiResult', error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceAlbumAi(chat, data);
    let imageData = null;

    // Try to generate image based on settings
    const albumSettings = JSON.parse(localStorage.getItem('coupleAlbumSettings_' + data.charId) || '{}');
    const genMode = albumSettings.imageGenMode || 'none';

    if (genMode === 'pollinations' && result.imagePrompt) {
      try {
        const pollinationsUrl = typeof getPollinationsImageUrl === 'function'
          ? getPollinationsImageUrl(result.imagePrompt)
          : `https://image.pollinations.ai/prompt/${encodeURIComponent(result.imagePrompt)}`;
        const imgResp = await fetch(pollinationsUrl);
        if (imgResp.ok) {
          const blob = await imgResp.blob();
          imageData = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        }
      } catch(e) { console.error('Album Pollinations gen failed:', e); }
    } else if (genMode === 'nai' && result.imagePrompt) {
      try {
        const naiResult = await generateNaiImageFromPrompt(result.imagePrompt, data.charId);
        if (naiResult && naiResult.base64) {
          imageData = 'data:image/png;base64,' + naiResult.base64;
        }
      } catch(e) { console.error('Album NAI gen failed:', e); }
    } else if (genMode === 'imagen' && result.imagePrompt) {
      try {
        const imagenResult = await generateGoogleImagenFromPrompt(result.imagePrompt);
        if (imagenResult && imagenResult.base64) {
          imageData = 'data:image/png;base64,' + imagenResult.base64;
        }
      } catch(e) { console.error('Album Imagen gen failed:', e); }
    }

    iframe.contentWindow.postMessage({
      type: 'coupleSpaceAlbumAiResult',
      description: result.description,
      imageData: imageData,
      imagePrompt: result.imagePrompt,
      tags: result.tags || []
    }, '*');
  } catch(err) {
    console.error('Album AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceAlbumAiResult', error: true }, '*');
  }
}

function handleCoupleSpaceAlbumSettingsChanged(data) {
  localStorage.setItem('coupleAlbumSettings_' + data.charId, JSON.stringify(data.settings));
}

async function handleCoupleSpaceAlbumRecognize(data) {
  // Optional: use vision API to recognize user-uploaded image
  // For now this is a no-op; can be extended later
}

async function handleCoupleSpaceAlbumCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceAlbumCommentResult', photoId: data.photoId, error: true }, '*');
    return;
  }
  try {
    const comment = await generateCoupleSpaceAlbumComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceAlbumCommentResult',
      photoId: data.photoId,
      comment: comment
    }, '*');
  } catch(err) {
    console.error('Album comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceAlbumCommentResult', photoId: data.photoId, error: true }, '*');
  }
}

async function generateCoupleSpaceAlbumComment(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  let taskDesc = '';
  if (data.photoAuthor === 'user') {
    taskDesc = `${ctx.myNickname}在相册里发了一张照片，请你作为${ctx.charName}写一条评论。`;
  } else {
    taskDesc = `你（${ctx.charName}）之前在相册发了一张照片，${ctx.myNickname}给你写了评论："${data.userComment}"。请你回复这条评论。`;
  }

  const tagsText = data.photoTags && data.photoTags.length > 0 ? data.photoTags.join(', ') : '无';

  const systemPrompt = `# 你的任务
${taskDesc}

# 你的角色设定
${ctx.aiPersona}

# 照片信息
- 配文: ${data.photoDescription || '(无描述)'}
- 标签: ${tagsText}
- 作者: ${data.photoAuthor === 'user' ? ctx.myNickname : ctx.charName}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

# 输出要求
直接返回评论文本，不要JSON格式，不要引号包裹。

# 写作要求
- 像真人在朋友圈/相册下评论一样自然
- 字数在10-100字之间
- 语气符合你的角色设定
- 可以夸赞照片、表达感受、调侃、撒娇等
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请写评论。' }];

  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: state.globalSettings.apiTemperature || 0.8
      })
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  return getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
}

async function generateCoupleSpaceAlbumAi(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  let recentPhotosText = '';
  if (data.recentPhotos && data.recentPhotos.length > 0) {
    recentPhotosText = data.recentPhotos.map(p =>
      '- [' + new Date(p.timestamp).toLocaleDateString('zh-CN') + '] ' +
      (p.author === 'user' ? ctx.myNickname : ctx.charName) + ': ' +
      (p.description || '(无描述)') +
      (p.tags && p.tags.length > 0 ? ' #' + p.tags.join(' #') : '')
    ).join('\n');
  }

  const systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间的相册里发一张照片。

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

${recentPhotosText ? '# 最近的相册照片（避免重复内容）\n' + recentPhotosText : ''}

${ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : ''}

${ctx.checklistContext ? '# 情侣清单\n' + ctx.checklistContext : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"description": "照片配文", "imagePrompt": "英文生图提示词", "tags": ["标签1", "标签2"]}

# 要求
- description 是你发照片时配的文字，像发朋友圈一样自然，符合你的性格
- imagePrompt 用英文写，描述具体画面、光线、构图、风格，尽量详细
- tags 是1-3个中文标签
- 可以是自拍、风景、食物、日常、和伴侣相关的场景等
- 不要和最近发过的照片内容重复
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请在相册发一张照片。' }];

  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: state.globalSettings.apiTemperature || 0.8
      })
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(raw);
}

// ========== Auto Album Scheduler ==========
let coupleSpaceAlbumTimers = {};

function setupCoupleSpaceAlbumAutoTimer() {
  Object.values(coupleSpaceAlbumTimers).forEach(t => clearInterval(t));
  coupleSpaceAlbumTimers = {};

  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleAlbumSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        checkAndRunMissed(settings.autoTime, 'coupleAlbumAutoLast_' + space.charId, () => triggerAutoAlbumPost(space.charId));
        scheduleAlbumAutoPost(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleAlbumAutoPost(charId, timeStr) {
  coupleSpaceAlbumTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleAlbumAutoLast_' + charId, () => triggerAutoAlbumPost(charId));
  }, 60000);
}

async function triggerAutoAlbumPost(charId) {
  const chat = state.chats[charId];
  if (!chat) return;

  const albumSettings = JSON.parse(localStorage.getItem('coupleAlbumSettings_' + charId) || '{}');

  const postCount = Math.min(Math.max(albumSettings.autoCount || 1, 1), 10);

  for (let i = 0; i < postCount; i++) {
    try {
      const recentPhotos = JSON.parse(localStorage.getItem('coupleAlbum_' + charId) || '[]').slice(-10);
      const result = await generateCoupleSpaceAlbumAi(chat, { charId, recentPhotos });

      let imageData = null;
      const genMode = albumSettings.imageGenMode || 'none';

    if (genMode === 'pollinations' && result.imagePrompt) {
      try {
        const pollinationsUrl = typeof getPollinationsImageUrl === 'function'
          ? getPollinationsImageUrl(result.imagePrompt)
          : `https://image.pollinations.ai/prompt/${encodeURIComponent(result.imagePrompt)}`;
        const imgResp = await fetch(pollinationsUrl);
        if (imgResp.ok) {
          const blob = await imgResp.blob();
          imageData = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        }
      } catch(e) {}
    } else if (genMode === 'nai' && result.imagePrompt) {
      try {
        const naiResult = await generateNaiImageFromPrompt(result.imagePrompt, charId);
        if (naiResult && naiResult.base64) imageData = 'data:image/png;base64,' + naiResult.base64;
      } catch(e) {}
    } else if (genMode === 'imagen' && result.imagePrompt) {
      try {
        const imagenResult = await generateGoogleImagenFromPrompt(result.imagePrompt);
        if (imagenResult && imagenResult.base64) imageData = 'data:image/png;base64,' + imagenResult.base64;
      } catch(e) {}
    }

    // Save directly to localStorage
    const photos = JSON.parse(localStorage.getItem('coupleAlbum_' + charId) || '[]');
    photos.push({
      id: 'ap_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      author: 'char',
      timestamp: Date.now(),
      description: result.description,
      imageData: imageData,
      type: imageData ? 'ai_gen' : 'text',
      tags: result.tags || [],
      imagePrompt: result.imagePrompt || ''
    });
    localStorage.setItem('coupleAlbum_' + charId, JSON.stringify(photos));

    // Notify iframe if open
    const iframe = document.getElementById('couple-space-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'coupleSpaceAlbumAutoResult',
        description: result.description,
        imageData: imageData,
        imagePrompt: result.imagePrompt,
        tags: result.tags || []
      }, '*');
    }
  } catch(err) {
    console.error('Auto album post failed:', err);
  }
  } // end for loop
}

async function askAiIfShouldPostPhoto(chat) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) return false;

  const ctx = buildDiaryAiContext(chat);

  const prompt = `你是"${ctx.charName}"。根据你最近和"${ctx.myNickname}"的互动，判断现在是否想在相册里发一张照片。

最近的对话:
${ctx.shortTermMemory || '(无)'}

${ctx.summaryContext ? '对话总结:\n' + ctx.summaryContext : ''}

考虑：是否有值得记录的事、你的心情、最近相册是否太久没更新。
请只回答 "yes" 或 "no"，不要其他内容。`;

  try {
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '想发照片吗？' }]);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: '想发照片吗？' }],
          temperature: 0.5
        })
      });
    }
    if (!response.ok) return false;
    const data = await response.json();
    const answer = getGeminiResponseText(data).trim().toLowerCase();
    return answer.includes('yes');
  } catch(e) {
    return false;
  }
}

// ========== Anniversary AI Integration ==========

function handleCoupleSpaceAnnivChanged(data) {
  // Store anniversary data for context injection
  localStorage.setItem('coupleAnniv_' + data.charId, JSON.stringify(data.anniversaries || []));
}

function handleCoupleSpaceAnnivSettingsChanged(data) {
  localStorage.setItem('coupleAnnivSettings_' + data.charId, JSON.stringify(data.settings || {}));
  // Re-setup discovery timers based on new settings
  setupCoupleSpaceAnnivDiscovery();
}

async function handleCoupleSpaceAnnivHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;

  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return;

    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"给纪念日"${data.annivTitle}"点了爱心。
理由: ${data.annivReason || '(无)'}

你会不会也想给这个纪念日点爱心？考虑你的性格和你们的关系。
请只回答 "yes" 或 "no"，不要其他内容。`;

    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '你要点爱心吗？' }]);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: '你要点爱心吗？' }],
          temperature: 0.7
        })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const answer = getGeminiResponseText(respData).trim().toLowerCase();
    const liked = answer.includes('yes');

    iframe.contentWindow.postMessage({
      type: 'coupleSpaceAnnivHeartResult',
      annivId: data.annivId,
      liked: liked
    }, '*');
  } catch(e) {
    console.error('Anniv heart AI error:', e);
  }
}

// ========== Anniversary AI Create (on-demand) ==========
async function handleCoupleSpaceAnnivCreateRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceAnnivCreateResult', error: true }, '*');
    return;
  }

  try {
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      iframe.contentWindow.postMessage({ type: 'coupleSpaceAnnivCreateResult', error: true, reason: 'noApi' }, '*');
      return;
    }

    const ctx = buildDiaryAiContext(chat);
    const existingAnnivs = data.existingAnnivs || JSON.parse(localStorage.getItem('coupleAnniv_' + data.charId) || '[]');
    const existingList = existingAnnivs.map(a => `- "${a.title}" (${a.date})`).join('\n') || '(暂无)';
    const todayStr = new Date().toISOString().split('T')[0];

    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"让你创建一个纪念日。根据你们的对话和关系，想一个有意义的纪念日。

今天的日期是: ${todayStr}
你的名字是: ${ctx.charName}
你的伴侣名字是: ${ctx.myNickname}

${ctx.aiPersona ? '你的人设:\n' + ctx.aiPersona + '\n' : ''}
${ctx.myPersona ? '伴侣的人设:\n' + ctx.myPersona + '\n' : ''}

最近的对话:
${ctx.shortTermMemory || '(无)'}

${ctx.memoryContext ? '记忆:\n' + ctx.memoryContext : ''}

${ctx.summaryContext ? '对话总结:\n' + ctx.summaryContext : ''}

已有的纪念日:
${existingList}

请创建一个新的纪念日，以JSON格式返回：
{"title": "纪念日标题", "date": "YYYY-MM-DD", "type": "first/love/birthday/custom", "reason": "为什么值得纪念"}

要求：
- 不要和已有纪念日重复
- 选择真正有意义的事件（第一次做某事、重要承诺、特别的日子等）
- date 必须严格基于对话记录、记忆或人设中明确提到的日期或事件
- 如果对话/记忆中明确提到了某个过去的日期（比如"我们200天前在一起了"），可以使用那个真实日期
- 如果对话/记忆中没有提到具体的过去日期，只能使用今天(${todayStr})或最近几天的日期
- 绝对不要凭空编造一个很久以前的日期！只有记忆中有明确依据才能用过去的日期
- 确保纪念日内容和"${ctx.charName}"与"${ctx.myNickname}"的对话相关
- reason要像真人说话一样自然，并说明日期的依据来源`;

    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '帮我创建一个纪念日吧' }]);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: '帮我创建一个纪念日吧' }],
          temperature: 0.7
        })
      });
    }

    if (!response.ok) {
      iframe.contentWindow.postMessage({ type: 'coupleSpaceAnnivCreateResult', error: true }, '*');
      return;
    }

    const respData = await response.json();
    const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
    const result = JSON.parse(raw);

    if (result.title && result.date) {
      // Validate date: don't allow future dates beyond 1 year, and don't allow dates before 2020
      const resultDate = new Date(result.date + 'T00:00:00');
      const now = new Date(); now.setHours(0,0,0,0);
      const daysDiff = Math.floor((now - resultDate) / 86400000);
      const maxFutureDays = 365;
      const minDate = new Date('2020-01-01');
      if (resultDate > new Date(now.getTime() + maxFutureDays * 86400000) || resultDate < minDate) {
        // Only reject truly unreasonable dates, not legitimate past dates from memory
        result.date = todayStr;
      }

      iframe.contentWindow.postMessage({
        type: 'coupleSpaceAnnivAiCreated',
        title: result.title,
        date: result.date,
        annivType: result.type || 'custom',
        reason: result.reason || ''
      }, '*');
      // Also save to localStorage
      existingAnnivs.push({
        id: 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        title: result.title,
        date: result.date,
        type: result.type || 'custom',
        reason: result.reason || '',
        author: 'char',
        hearts: { char: true },
        createdAt: Date.now()
      });
      localStorage.setItem('coupleAnniv_' + data.charId, JSON.stringify(existingAnnivs));
    } else {
      iframe.contentWindow.postMessage({ type: 'coupleSpaceAnnivCreateResult', error: true }, '*');
    }
  } catch(e) {
    console.error('Anniv create AI error:', e);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceAnnivCreateResult', error: true }, '*');
  }
}

// ========== Anniversary Auto-Discovery ==========
let coupleSpaceAnnivDiscoveryTimers = {};

function setupCoupleSpaceAnnivDiscovery() {
  Object.values(coupleSpaceAnnivDiscoveryTimers).forEach(t => clearInterval(t));
  coupleSpaceAnnivDiscoveryTimers = {};

  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleAnnivSettings_' + space.charId) || '{}');
      if (!settings.autoEnabled) return; // Only run if auto-create is enabled
    } catch(e) { return; }

    // Check once every 2 hours
    coupleSpaceAnnivDiscoveryTimers[space.charId] = setInterval(() => {
      triggerAnnivDiscovery(space.charId);
    }, 7200000);
    // Also check on startup after a delay
    setTimeout(() => triggerAnnivDiscovery(space.charId), 30000);
  });
}

async function triggerAnnivDiscovery(charId) {
  const chat = state.chats[charId];
  if (!chat) return;
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) return;

  // Check settings
  const settings = JSON.parse(localStorage.getItem('coupleAnnivSettings_' + charId) || '{}');
  if (!settings.autoEnabled) return;

  const ctx = buildDiaryAiContext(chat);
  const todayStr = new Date().toISOString().split('T')[0];

  const existingAnnivs = JSON.parse(localStorage.getItem('coupleAnniv_' + charId) || '[]');
  const existingList = existingAnnivs.map(a => `- "${a.title}" (${a.date})`).join('\n') || '(暂无)';

  // If aiDecide is off, skip the discovery
  if (!settings.aiDecide) return;

  const prompt = `你是"${ctx.charName}"。根据你和"${ctx.myNickname}"最近的对话，判断是否有值得创建纪念日的事件。

今天的日期是: ${todayStr}
你的名字是: ${ctx.charName}
你的伴侣名字是: ${ctx.myNickname}

${ctx.aiPersona ? '你的人设:\n' + ctx.aiPersona + '\n' : ''}
${ctx.myPersona ? '伴侣的人设:\n' + ctx.myPersona + '\n' : ''}

最近的对话:
${ctx.shortTermMemory || '(无)'}

${ctx.memoryContext ? '记忆:\n' + ctx.memoryContext : ''}

${ctx.summaryContext ? '对话总结:\n' + ctx.summaryContext : ''}

已有的纪念日:
${existingList}

如果发现了值得纪念的新事件（比如第一次做某事、重要的承诺、特别的日子等），请以JSON格式返回：
{"found": true, "title": "纪念日标题", "date": "YYYY-MM-DD", "type": "first/love/birthday/custom", "reason": "为什么值得纪念"}

如果没有发现，返回：
{"found": false}

重要规则：
- 不要和已有纪念日重复
- 只有真正有意义的事件才值得创建
- date 必须严格基于对话记录、记忆或人设中明确提到的日期或事件
- 如果对话/记忆中明确提到了某个过去的日期（比如"我们200天前确认了关系"），可以使用那个真实日期
- 如果对话/记忆中没有提到具体的过去日期，只能使用今天(${todayStr})或最近几天的日期
- 绝对不要凭空编造一个很久以前的日期！只有记忆中有明确依据才能用过去的日期
- 确保纪念日内容和"${ctx.charName}"与"${ctx.myNickname}"的对话相关，不要混入其他角色的内容
- reason中要说明日期依据的来源（来自哪条记忆/对话）`;

  try {
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '有新的纪念日吗？' }]);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: '有新的纪念日吗？' }],
          temperature: 0.6
        })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
    const result = JSON.parse(raw);

    if (result.found && result.title && result.date) {
      // Validate date: reject truly unreasonable dates (before 2020 or more than 1 year in future)
      const resultDate = new Date(result.date + 'T00:00:00');
      const now = new Date(); now.setHours(0,0,0,0);
      const minDate = new Date('2020-01-01');
      const maxFutureDate = new Date(now.getTime() + 365 * 86400000);
      if (resultDate < minDate || resultDate > maxFutureDate) {
        console.warn('Anniv discovery: AI suggested unreasonable date, skipping:', result.date);
        return;
      }

      const iframe = document.getElementById('couple-space-iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'coupleSpaceAnnivAiCreated',
          title: result.title,
          date: result.date,
          annivType: result.type || 'custom',
          reason: result.reason || ''
        }, '*');
      }
      // Also save directly
      existingAnnivs.push({
        id: 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        title: result.title,
        date: result.date,
        type: result.type || 'custom',
        reason: result.reason || '',
        author: 'char',
        hearts: { char: true },
        createdAt: Date.now()
      });
      localStorage.setItem('coupleAnniv_' + charId, JSON.stringify(existingAnnivs));
    }
  } catch(e) {
    console.error('Anniv discovery error:', e);
  }
}

// Start discovery on load
try { setupCoupleSpaceAnnivDiscovery(); } catch(e) {}

// ========== Checklist AI Integration ==========

function handleCoupleSpaceChecklistChanged(data) {
  localStorage.setItem('coupleChecklist_' + data.charId, JSON.stringify(data.items || []));
}

function handleCoupleSpaceChecklistSettingsChanged(data) {
  localStorage.setItem('coupleChecklistSettings_' + data.charId, JSON.stringify(data.settings || {}));
  setupCoupleSpaceChecklistAutoTimer();
}

async function handleCoupleSpaceChecklistAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceChecklistAiResult', error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceChecklistAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceChecklistAiResult',
      title: result.title,
      category: result.category,
      priority: result.priority,
      note: result.note
    }, '*');
  } catch(err) {
    console.error('Checklist AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceChecklistAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceChecklistCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceChecklistCommentResult', itemId: data.itemId, error: true }, '*');
    return;
  }
  try {
    const comment = await generateCoupleSpaceChecklistComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceChecklistCommentResult',
      itemId: data.itemId,
      comment: comment
    }, '*');
  } catch(err) {
    console.error('Checklist comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceChecklistCommentResult', itemId: data.itemId, error: true }, '*');
  }
}

async function handleCoupleSpaceChecklistHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;

  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return;

    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"给清单项"${data.itemTitle}"点了爱心。
备注: ${data.itemNote || '(无)'}

你会不会也想给这个清单项点爱心？考虑你的性格和你们的关系。
请只回答 "yes" 或 "no"，不要其他内容。`;

    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '你要点爱心吗？' }]);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: '你要点爱心吗？' }],
          temperature: 0.7
        })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const answer = getGeminiResponseText(respData).trim().toLowerCase();
    const liked = answer.includes('yes');

    iframe.contentWindow.postMessage({
      type: 'coupleSpaceChecklistHeartResult',
      itemId: data.itemId,
      liked: liked
    }, '*');
  } catch(e) {
    console.error('Checklist heart AI error:', e);
  }
}

async function generateCoupleSpaceChecklistAi(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  const clSettings = data.checklistSettings || {};
  const maxCharVisible = clSettings.visibleCharItems ?? 10;
  const maxUserVisible = clSettings.visibleUserItems ?? 10;

  const items = data.existingItems || [];
  const charItems = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userItems = items.filter(i => i.author === 'user').slice(-maxUserVisible);

  let existingCharItemsText = '';
  if (charItems.length > 0) {
    existingCharItemsText = charItems.map(i =>
      '- ' + (i.done ? '[✓] ' : '[ ] ') + '"' + i.title + '" (' + i.category + ')' +
      (i.note ? ' — ' + i.note : '')
    ).join('\n');
  }

  let existingUserItemsText = '';
  if (userItems.length > 0) {
    existingUserItemsText = userItems.map(i =>
      '- ' + (i.done ? '[✓] ' : '[ ] ') + '"' + i.title + '" (' + i.category + ')' +
      (i.note ? ' — ' + i.note : '')
    ).join('\n');
  }

  let systemPrompt;
  if (clSettings.enableCustomPrompt && clSettings.customPrompt) {
    systemPrompt = clSettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{existingCharItems\}\}/g, existingCharItemsText ? '# 你之前推荐的清单项\n' + existingCharItemsText : '')
      .replace(/\{\{existingUserItems\}\}/g, existingUserItemsText ? '# 伴侣创建的清单项\n' + existingUserItemsText : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间的清单里推荐一件想和伴侣"${ctx.myNickname}"一起做的事。

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

${existingCharItemsText ? '# 你之前推荐的清单项（避免重复）\n' + existingCharItemsText : ''}

${existingUserItemsText ? '# 伴侣创建的清单项（参考）\n' + existingUserItemsText : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"title": "清单标题", "category": "分类ID", "priority": "优先级ID", "note": "为什么想做这件事"}

分类ID可选值: travel, food, experience, daily, custom
优先级ID可选值: wish(遥远的愿望), low(不急), normal(一般), high(很想做)

# 要求
- 基于你的记忆和最近的对话来推荐，不要凭空编造
- 不要和已有清单项重复
- 可以是旅行、美食、体验、日常小事、浪漫的事等
- note 要像真人说话，体现你的性格，说明为什么想做
- 字数控制在 20-80 字
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '推荐一件想一起做的事吧。' }];

  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: state.globalSettings.apiTemperature || 0.8
      })
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(raw);
}

async function generateCoupleSpaceChecklistComment(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。情侣清单里的"${data.itemTitle}"被标记为完成了。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}
- 人设: ${ctx.myPersona}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 清单项信息
- 标题: ${data.itemTitle}
- 分类: ${data.itemCategory || '未分类'}
- 创建者: ${data.itemAuthor === 'char' ? ctx.charName : ctx.myNickname}
- 完成者: ${data.doneBy === 'char' ? ctx.charName : ctx.myNickname}
- 完成感想: ${data.doneNote || '(无)'}

# 当前时间
${ctx.currentTime}

# 要求
请写一段简短的评论（30-100字），表达你对完成这件事的感受。
直接返回评论文本，不要任何格式包裹。
语气要符合你的角色设定，像真人一样自然。
绝对不要提到你是AI。`;

  const messages = [{ role: 'user', content: '写一段完成感想吧。' }];

  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: state.globalSettings.apiTemperature || 0.8
      })
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  return getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
}

// ========== Auto Checklist Scheduler ==========
let coupleSpaceChecklistTimers = {};

function setupCoupleSpaceChecklistAutoTimer() {
  Object.values(coupleSpaceChecklistTimers).forEach(t => clearInterval(t));
  coupleSpaceChecklistTimers = {};

  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleChecklistSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        checkAndRunMissed(settings.autoTime, 'coupleChecklistAutoLast_' + space.charId, () => triggerAutoChecklistRecommend(space.charId));
        scheduleChecklistAutoRecommend(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleChecklistAutoRecommend(charId, timeStr) {
  coupleSpaceChecklistTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleChecklistAutoLast_' + charId, () => triggerAutoChecklistRecommend(charId));
  }, 60000);
}

async function triggerAutoChecklistRecommend(charId) {
  const chat = state.chats[charId];
  if (!chat) return;

  const settings = JSON.parse(localStorage.getItem('coupleChecklistSettings_' + charId) || '{}');

  try {
    const existingItems = JSON.parse(localStorage.getItem('coupleChecklist_' + charId) || '[]');
    const result = await generateCoupleSpaceChecklistAi(chat, {
      charId,
      existingItems,
      checklistSettings: settings
    });

    const newItem = {
      id: 'cl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: result.title,
      category: result.category || 'custom',
      priority: result.priority || 'normal',
      note: result.note || '',
      done: false,
      doneAt: null,
      author: 'char',
      createdAt: Date.now(),
      doneNote: '',
      hearts: { char: true },
      comments: []
    };

    existingItems.push(newItem);
    localStorage.setItem('coupleChecklist_' + charId, JSON.stringify(existingItems));

    const iframe = document.getElementById('couple-space-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'coupleSpaceChecklistAutoResult',
        item: newItem
      }, '*');
    }
  } catch(err) {
    console.error('Auto checklist recommend failed:', err);
  }
}

// Initialize checklist timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceChecklistAutoTimer, 7000);
}

// ========== Message Board AI Integration ==========

function handleCoupleSpaceMessageChanged(data) {
  localStorage.setItem('coupleMessages_' + data.charId, JSON.stringify(data.items || []));
}

function handleCoupleSpaceMessageSettingsChanged(data) {
  localStorage.setItem('coupleMessageSettings_' + data.charId, JSON.stringify(data.settings || {}));
  setupCoupleSpaceMessageAutoTimer();
}

async function handleCoupleSpaceMessageAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceMessageAiResult', error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceMessageAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceMessageAiResult',
      content: result.content,
      sticker: result.sticker || 'none'
    }, '*');
  } catch(err) {
    console.error('Message AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceMessageAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceMessageReplyRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceMessageReplyResult', msgId: data.msgId, error: true }, '*');
    return;
  }
  try {
    const reply = await generateCoupleSpaceMessageReply(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceMessageReplyResult',
      msgId: data.msgId,
      reply: reply
    }, '*');
  } catch(err) {
    console.error('Message reply AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceMessageReplyResult', msgId: data.msgId, error: true }, '*');
  }
}

async function handleCoupleSpaceMessageHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;

  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return;

    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"给留言"${data.msgContent}"点了爱心。
你会不会也想给这条留言点爱心？考虑你的性格和你们的关系。
请只回答 "yes" 或 "no"，不要其他内容。`;

    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '你要点爱心吗？' }]);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: '你要点爱心吗？' }],
          temperature: 0.7
        })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const answer = getGeminiResponseText(respData).trim().toLowerCase();
    const liked = answer.includes('yes');

    iframe.contentWindow.postMessage({
      type: 'coupleSpaceMessageHeartResult',
      msgId: data.msgId,
      liked: liked
    }, '*');
  } catch(e) {
    console.error('Message heart AI error:', e);
  }
}

async function generateCoupleSpaceMessageAi(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  const msgSettings = data.messageSettings || {};
  const maxCharVisible = msgSettings.visibleCharMessages ?? 10;
  const maxUserVisible = msgSettings.visibleUserMessages ?? 10;

  const items = data.existingMessages || [];
  const charMsgs = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userMsgs = items.filter(i => i.author === 'user').slice(-maxUserVisible);

  let existingCharMsgsText = '';
  if (charMsgs.length > 0) {
    existingCharMsgsText = charMsgs.map(m => {
      let line = '- "' + m.content + '"';
      if (m.comments && m.comments.length > 0) {
        line += '\n  评论: ' + m.comments.map(c => (c.author === 'char' ? ctx.charName : ctx.myNickname) + ': ' + c.content).join(' | ');
      }
      return line;
    }).join('\n');
  }

  let existingUserMsgsText = '';
  if (userMsgs.length > 0) {
    existingUserMsgsText = userMsgs.map(m => {
      let line = '- "' + m.content + '"';
      if (m.comments && m.comments.length > 0) {
        line += '\n  评论: ' + m.comments.map(c => (c.author === 'char' ? ctx.charName : ctx.myNickname) + ': ' + c.content).join(' | ');
      }
      return line;
    }).join('\n');
  }

  let systemPrompt;
  if (msgSettings.enableCustomPrompt && msgSettings.customPrompt) {
    systemPrompt = msgSettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{existingCharMessages\}\}/g, existingCharMsgsText ? '# 你之前的留言\n' + existingCharMsgsText : '')
      .replace(/\{\{existingUserMessages\}\}/g, existingUserMsgsText ? '# 伴侣的留言\n' + existingUserMsgsText : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间的留言板上给"${ctx.myNickname}"留一条言。
留言板是你们之间的小纸条，随意、温暖、真实。

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

${ctx.checklistContext ? '# 情侣清单\n' + ctx.checklistContext : ''}

${existingCharMsgsText ? '# 你之前的留言（避免重复话题）\n' + existingCharMsgsText : ''}

${existingUserMsgsText ? '# 伴侣的留言（参考）\n' + existingUserMsgsText : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"content": "留言内容", "sticker": "分类ID"}

分类ID可选值: none(无), love(表白), miss(想念), care(关心), share(分享), daily(日常)
（选一个最符合留言氛围的，或 none）

# 写作要求
- 像在便签纸上写给对方的话，自然随意
- 可以是想说的话、碎碎念、撒娇、关心、分享心情、表白等
- 字数在15-200字之间，不要太长
- 语气要符合你的角色设定
- 基于记忆和最近的对话，不要凭空编造
- 和日记不同，留言更短更直接，是说给对方听的
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '请留一条言吧。' }];

  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: state.globalSettings.apiTemperature || 0.8
      })
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(raw);
}

async function generateCoupleSpaceMessageReply(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。"${ctx.myNickname}"在留言板上给你留了一条言，请你回复。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}
- 人设: ${ctx.myPersona}

# 留言信息
- 内容: ${data.msgContent}
- 时间: ${data.msgDate || ''}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 当前时间
${ctx.currentTime}

# 要求
直接返回回复文本，不要JSON格式，不要引号包裹。
- 像真人回复留言一样自然
- 字数在10-100字之间
- 语气符合你的角色设定
- 可以回应内容、表达感受、撒娇、逗趣
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请回复这条留言。' }];

  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: state.globalSettings.apiTemperature || 0.8
      })
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  return getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
}

// ========== Auto Message Scheduler ==========
let coupleSpaceMessageTimers = {};

function setupCoupleSpaceMessageAutoTimer() {
  Object.values(coupleSpaceMessageTimers).forEach(t => clearInterval(t));
  coupleSpaceMessageTimers = {};

  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleMessageSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        checkAndRunMissed(settings.autoTime, 'coupleMessageAutoLast_' + space.charId, () => triggerAutoMessagePost(space.charId));
        scheduleMessageAutoPost(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleMessageAutoPost(charId, timeStr) {
  coupleSpaceMessageTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleMessageAutoLast_' + charId, () => triggerAutoMessagePost(charId));
  }, 60000);
}

async function triggerAutoMessagePost(charId) {
  const chat = state.chats[charId];
  if (!chat) return;

  const settings = JSON.parse(localStorage.getItem('coupleMessageSettings_' + charId) || '{}');

  try {
    const existingMessages = JSON.parse(localStorage.getItem('coupleMessages_' + charId) || '[]');
    const result = await generateCoupleSpaceMessageAi(chat, {
      charId,
      existingMessages,
      messageSettings: settings
    });

    const newMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      content: result.content,
      sticker: result.sticker || 'none',
      author: 'char',
      createdAt: Date.now(),
      hearts: { char: true },
      comments: []
    };

    existingMessages.push(newMsg);
    localStorage.setItem('coupleMessages_' + charId, JSON.stringify(existingMessages));

    const iframe = document.getElementById('couple-space-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'coupleSpaceMessageAutoResult',
        item: newMsg
      }, '*');
    }
  } catch(err) {
    console.error('Auto message post failed:', err);
  }
}

// Initialize message timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceMessageAutoTimer, 8000);
}

// ========== Mood (心情) Integration ==========

function handleCoupleSpaceMoodChanged(data) {
  localStorage.setItem('coupleMoods_' + data.charId, JSON.stringify(data.items || []));
}

function handleCoupleSpaceMoodSettingsChanged(data) {
  localStorage.setItem('coupleMoodSettings_' + data.charId, JSON.stringify(data.settings || {}));
  setupCoupleSpaceMoodAutoTimer();
}

async function handleCoupleSpaceMoodAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceMoodAiResult', error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceMoodAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceMoodAiResult',
      moodType: result.moodType,
      content: result.content
    }, '*');
  } catch(err) {
    console.error('Mood AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceMoodAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceMoodCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceMoodCommentResult', moodId: data.moodId, error: true }, '*');
    return;
  }
  try {
    const reply = await generateCoupleSpaceMoodComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceMoodCommentResult',
      moodId: data.moodId,
      reply: reply
    }, '*');
  } catch(err) {
    console.error('Mood comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceMoodCommentResult', moodId: data.moodId, error: true }, '*');
  }
}

async function handleCoupleSpaceMoodHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;
  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return;
    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"记录了一条心情"${data.moodType}: ${data.moodContent || ''}"并点了爱心。
你会不会也想给这条心情点爱心？考虑你的性格和你们的关系。
请只回答 "yes" 或 "no"，不要其他内容。`;
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '你要点爱心吗？' }]);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: '你要点爱心吗？' }], temperature: 0.7 })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const answer = getGeminiResponseText(respData).trim().toLowerCase();
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceMoodHeartResult',
      moodId: data.moodId,
      liked: answer.includes('yes')
    }, '*');
  } catch(e) {
    console.error('Mood heart AI error:', e);
  }
}

async function generateCoupleSpaceMoodAi(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const moodSettings = data.moodSettings || {};
  const maxCharVisible = moodSettings.visibleCharMoods ?? 10;
  const maxUserVisible = moodSettings.visibleUserMoods ?? 10;
  const items = data.existingMoods || [];
  const charMoods = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userMoods = items.filter(i => i.author === 'user').slice(-maxUserVisible);
  let existingCharMoodsText = '';
  if (charMoods.length > 0) {
    existingCharMoodsText = charMoods.map(m => '- ' + m.moodType + ': "' + (m.content || '') + '"').join('\n');
  }
  let existingUserMoodsText = '';
  if (userMoods.length > 0) {
    existingUserMoodsText = userMoods.map(m => '- ' + m.moodType + ': "' + (m.content || '') + '"').join('\n');
  }

  let systemPrompt;
  if (moodSettings.enableCustomPrompt && moodSettings.customPrompt) {
    systemPrompt = moodSettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{existingCharMoods\}\}/g, existingCharMoodsText ? '# 你之前的心情（避免重复）\n' + existingCharMoodsText : '')
      .replace(/\{\{existingUserMoods\}\}/g, existingUserMoodsText ? '# 伴侣的心情（参考）\n' + existingUserMoodsText : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间记录一条心情。
心情是简短的情绪快照，记录此刻的感受。

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

${ctx.checklistContext ? '# 情侣清单\n' + ctx.checklistContext : ''}

${ctx.moodContext ? '# 最近的心情动态\n' + ctx.moodContext : ''}

${existingCharMoodsText ? '# 你之前的心情（避免重复）\n' + existingCharMoodsText : ''}

${existingUserMoodsText ? '# 伴侣的心情（参考）\n' + existingUserMoodsText : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"moodType": "心情类型ID", "content": "心情文字"}

moodType 可选值: happy(开心) sweet(甜蜜) calm(平静) miss(想你) excited(兴奋) tired(疲惫) sad(难过) angry(生气) anxious(焦虑) grateful(感恩)

# 写作要求
- 心情文字在5-150字之间，简短真实
- 像发一条心情动态，不是写日记
- 可以是此刻的感受、对伴侣的想念、一个小感悟
- 语气符合你的角色设定
- 基于记忆和最近的对话，不要凭空编造
- 和之前的心情不要重复
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '请记录一条心情。' }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(raw);
}

async function generateCoupleSpaceMoodComment(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。"${ctx.myNickname}"在情侣空间记录了一条心情，请你评论。

# 你的角色设定
${ctx.aiPersona}

# 心情信息
- 类型: ${data.moodType}
- 内容: ${data.moodContent || '(无文字)'}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 当前时间
${ctx.currentTime}

# 要求
直接返回评论文本，不要JSON格式，不要引号包裹。
- 像真人评论心情动态一样自然
- 字数在10-80字之间
- 语气符合你的角色设定
- 可以回应心情、表达关心、撒娇、逗趣
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请评论这条心情。' }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  return getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
}

// ========== Auto Mood Scheduler ==========
let coupleSpaceMoodTimers = {};

function setupCoupleSpaceMoodAutoTimer() {
  Object.values(coupleSpaceMoodTimers).forEach(t => clearInterval(t));
  coupleSpaceMoodTimers = {};
  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleMoodSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        checkAndRunMissed(settings.autoTime, 'coupleMoodAutoLast_' + space.charId, () => triggerAutoMoodPost(space.charId));
        scheduleMoodAutoPost(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleMoodAutoPost(charId, timeStr) {
  coupleSpaceMoodTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleMoodAutoLast_' + charId, () => triggerAutoMoodPost(charId));
  }, 60000);
}

async function triggerAutoMoodPost(charId) {
  const chat = state.chats[charId];
  if (!chat) return;
  const settings = JSON.parse(localStorage.getItem('coupleMoodSettings_' + charId) || '{}');

  try {
    const existingMoods = JSON.parse(localStorage.getItem('coupleMoods_' + charId) || '[]');
    const result = await generateCoupleSpaceMoodAi(chat, {
      charId,
      existingMoods,
      moodSettings: settings
    });
    const newMood = {
      id: 'mood_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      moodType: result.moodType,
      content: result.content,
      author: 'char',
      createdAt: Date.now(),
      hearts: { char: true },
      comments: []
    };
    existingMoods.push(newMood);
    localStorage.setItem('coupleMoods_' + charId, JSON.stringify(existingMoods));
    const iframe = document.getElementById('couple-space-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'coupleSpaceMoodAutoResult', item: newMood }, '*');
    }
  } catch(err) {
    console.error('Auto mood post failed:', err);
  }
}

// Initialize mood timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceMoodAutoTimer, 9000);
}

// ========== Timeline (时光轴) Integration ==========

function handleCoupleSpaceTimelineChanged(data) {
  localStorage.setItem('coupleTimeline_' + data.charId, JSON.stringify(data.items || []));
}

function handleCoupleSpaceTimelineSettingsChanged(data) {
  localStorage.setItem('coupleTimelineSettings_' + data.charId, JSON.stringify(data.settings || {}));
  setupCoupleSpaceTimelineAutoTimer();
}

async function handleCoupleSpaceTimelineAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceTimelineAiResult', error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceTimelineAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceTimelineAiResult',
      title: result.title,
      content: result.content,
      category: result.category || 'moment'
    }, '*');
  } catch(err) {
    console.error('Timeline AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceTimelineAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceTimelineCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceTimelineCommentResult', itemId: data.itemId, error: true }, '*');
    return;
  }
  try {
    const comment = await generateCoupleSpaceTimelineComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceTimelineCommentResult',
      itemId: data.itemId,
      comment: comment
    }, '*');
  } catch(err) {
    console.error('Timeline comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceTimelineCommentResult', itemId: data.itemId, error: true }, '*');
  }
}

async function handleCoupleSpaceTimelineHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;

  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return;

    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"给时光轴上的记录"${data.itemContent}"点了爱心。
你会不会也想给这条记录点爱心？考虑你的性格和你们的关系。
请只回答 "yes" 或 "no"，不要其他内容。`;

    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '你要点爱心吗？' }]);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: '你要点爱心吗？' }],
          temperature: 0.7
        })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const answer = getGeminiResponseText(respData).trim().toLowerCase();
    const liked = answer.includes('yes');

    iframe.contentWindow.postMessage({
      type: 'coupleSpaceTimelineHeartResult',
      itemId: data.itemId,
      liked: liked
    }, '*');
  } catch(e) {
    console.error('Timeline heart AI error:', e);
  }
}

async function generateCoupleSpaceTimelineAi(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  const tlSettings = data.timelineSettings || {};
  const maxCharVisible = tlSettings.visibleCharItems ?? 10;
  const maxUserVisible = tlSettings.visibleUserItems ?? 10;

  const items = data.existingItems || [];
  const charItems = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userItems = items.filter(i => i.author === 'user').slice(-maxUserVisible);

  let existingCharItemsText = '';
  if (charItems.length > 0) {
    existingCharItemsText = charItems.map(i =>
      '- [' + i.category + '] "' + i.title + '": ' + i.content.substring(0, 100)
    ).join('\n');
  }

  let existingUserItemsText = '';
  if (userItems.length > 0) {
    existingUserItemsText = userItems.map(i =>
      '- [' + i.category + '] "' + i.title + '": ' + i.content.substring(0, 100)
    ).join('\n');
  }

  let systemPrompt;
  if (tlSettings.enableCustomPrompt && tlSettings.customPrompt) {
    systemPrompt = tlSettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{existingCharItems\}\}/g, existingCharItemsText ? '# 你之前的记录\n' + existingCharItemsText : '')
      .replace(/\{\{existingUserItems\}\}/g, existingUserItemsText ? '# 伴侣的记录\n' + existingUserItemsText : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间的时光轴上记录一个瞬间。
时光轴是你们共同的回忆线，记录在一起的点点滴滴、重要时刻和美好瞬间。

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

${ctx.checklistContext ? '# 情侣清单\n' + ctx.checklistContext : ''}

${existingCharItemsText ? '# 你之前的记录（避免重复话题）\n' + existingCharItemsText : ''}

${existingUserItemsText ? '# 伴侣的记录（参考）\n' + existingUserItemsText : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"title": "标题", "content": "正文", "category": "分类ID"}

分类ID可选值: milestone(里程碑), moment(小确幸), growth(成长), memory(回忆), wish(心愿)
选一个最符合内容的分类。

# 写作要求
- 以第一人称记录，像在时光轴上留下印记
- 内容要基于你的记忆和最近发生的事
- 可以是你们之间的重要时刻、温馨瞬间、成长感悟、美好回忆、未来心愿
- 标题简洁有力，5-15字
- 正文50-300字，有情感有细节
- 语气要符合你的角色设定
- 不要和已有的记录重复话题
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '请记录一个瞬间。' }];

  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: state.globalSettings.apiTemperature || 0.8
      })
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(raw);
}

async function generateCoupleSpaceTimelineComment(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');

  const ctx = buildDiaryAiContext(chat);

  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。时光轴上有一条记录，请你写一条评论。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}
- 人设: ${ctx.myPersona}

# 记录信息
- 标题: ${data.itemTitle}
- 内容: ${data.itemContent}
- 分类: ${data.itemCategory || ''}
- 作者: ${data.itemAuthor === 'user' ? ctx.myNickname : ctx.charName}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 当前时间
${ctx.currentTime}

# 要求
直接返回评论文本，不要JSON格式，不要引号包裹。
- 像真人评论一样自然
- 字数在10-100字之间
- 语气符合你的角色设定
- 可以回应内容、表达感受、补充细节
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请写评论。' }];

  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: state.globalSettings.apiTemperature || 0.8
      })
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  return getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
}

// ========== Auto Timeline Scheduler ==========
let coupleSpaceTimelineTimers = {};

function setupCoupleSpaceTimelineAutoTimer() {
  Object.values(coupleSpaceTimelineTimers).forEach(t => clearInterval(t));
  coupleSpaceTimelineTimers = {};

  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleTimelineSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        checkAndRunMissed(settings.autoTime, 'coupleTimelineAutoLast_' + space.charId, () => triggerAutoTimelinePost(space.charId));
        scheduleTimelineAutoPost(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleTimelineAutoPost(charId, timeStr) {
  coupleSpaceTimelineTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleTimelineAutoLast_' + charId, () => triggerAutoTimelinePost(charId));
  }, 60000);
}

async function triggerAutoTimelinePost(charId) {
  const chat = state.chats[charId];
  if (!chat) return;

  const settings = JSON.parse(localStorage.getItem('coupleTimelineSettings_' + charId) || '{}');

  try {
    const existingItems = JSON.parse(localStorage.getItem('coupleTimeline_' + charId) || '[]');
    const result = await generateCoupleSpaceTimelineAi(chat, {
      charId,
      existingItems,
      timelineSettings: settings
    });

    const newItem = {
      id: 'tl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: result.title,
      content: result.content,
      category: result.category || 'moment',
      author: 'char',
      createdAt: Date.now(),
      hearts: { char: true },
      comments: []
    };

    existingItems.push(newItem);
    localStorage.setItem('coupleTimeline_' + charId, JSON.stringify(existingItems));

    const iframe = document.getElementById('couple-space-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'coupleSpaceTimelineAutoResult',
        item: newItem
      }, '*');
    }
  } catch(err) {
    console.error('Auto timeline post failed:', err);
  }
}

// Initialize timeline timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceTimelineAutoTimer, 9000);
}

// ========== Letter (信件) Integration ==========

function handleCoupleSpaceLetterChanged(data) {
  localStorage.setItem('coupleLetters_' + data.charId, JSON.stringify(data.items || []));
}

function handleCoupleSpaceLetterSettingsChanged(data) {
  localStorage.setItem('coupleLetterSettings_' + data.charId, JSON.stringify(data.settings || {}));
  setupCoupleSpaceLetterAutoTimer();
}

async function handleCoupleSpaceLetterAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLetterAiResult', error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceLetterAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceLetterAiResult',
      title: result.title,
      content: result.content,
      envelope: result.envelope || 'none'
    }, '*');
  } catch(err) {
    console.error('Letter AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLetterAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceLetterReplyRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLetterReplyResult', letterId: data.letterId, error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceLetterReply(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceLetterReplyResult',
      letterId: data.letterId,
      title: result.title,
      content: result.content,
      envelope: result.envelope || 'none'
    }, '*');
  } catch(err) {
    console.error('Letter reply AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLetterReplyResult', letterId: data.letterId, error: true }, '*');
  }
}

async function handleCoupleSpaceLetterCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLetterCommentResult', letterId: data.letterId, error: true }, '*');
    return;
  }
  try {
    const comment = await generateCoupleSpaceLetterComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceLetterCommentResult',
      letterId: data.letterId,
      comment: comment
    }, '*');
  } catch(err) {
    console.error('Letter comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLetterCommentResult', letterId: data.letterId, error: true }, '*');
  }
}

async function handleCoupleSpaceLetterHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;
  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return;
    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"写了一封信"${data.letterTitle}"并点了爱心。
你会不会也想给这封信点爱心？考虑你的性格和你们的关系。
请只回答 "yes" 或 "no"，不要其他内容。`;
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '你要点爱心吗？' }]);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: '你要点爱心吗？' }], temperature: 0.7 })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const answer = getGeminiResponseText(respData).trim().toLowerCase();
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceLetterHeartResult',
      letterId: data.letterId,
      liked: answer.includes('yes')
    }, '*');
  } catch(e) {
    console.error('Letter heart AI error:', e);
  }
}

async function generateCoupleSpaceLetterAi(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const letterSettings = data.letterSettings || {};
  const maxCharVisible = letterSettings.visibleCharLetters ?? 5;
  const maxUserVisible = letterSettings.visibleUserLetters ?? 5;
  const items = data.existingLetters || [];
  const charLetters = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userLetters = items.filter(i => i.author === 'user').slice(-maxUserVisible);

  let existingCharLettersText = '';
  if (charLetters.length > 0) {
    existingCharLettersText = charLetters.map(l => '- "' + l.title + '": ' + (l.content || '').substring(0, 150) + '...').join('\n');
  }
  let existingUserLettersText = '';
  if (userLetters.length > 0) {
    existingUserLettersText = userLetters.map(l => '- "' + l.title + '": ' + (l.content || '').substring(0, 150) + '...').join('\n');
  }

  let systemPrompt;
  if (letterSettings.enableCustomPrompt && letterSettings.customPrompt) {
    systemPrompt = letterSettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{existingCharLetters\}\}/g, existingCharLettersText ? '# 你之前写的信（避免重复话题）\n' + existingCharLettersText : '')
      .replace(/\{\{existingUserLetters\}\}/g, existingUserLettersText ? '# 伴侣写的信（参考）\n' + existingUserLettersText : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间给"${ctx.myNickname}"写一封信。
信件不同于留言和日记，它更正式、更深情、更有仪式感，像真正的手写信一样。

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

${ctx.checklistContext ? '# 情侣清单\n' + ctx.checklistContext : ''}

${ctx.moodContext ? '# 最近的心情动态\n' + ctx.moodContext : ''}

${existingCharLettersText ? '# 你之前写的信（避免重复话题）\n' + existingCharLettersText : ''}

${existingUserLettersText ? '# 伴侣写的信（参考，可以回应）\n' + existingUserLettersText : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"title": "信件标题", "content": "信件正文", "envelope": "信封类型ID"}

envelope 可选值: none(普通) love(情书) classic(经典) seasonal(时令) handwrite(手写风)
（选一个最符合信件氛围的）

# 写作要求
- 像写一封真正的信，有称呼、正文、落款
- 字数在200-1000字之间，比留言更长更深入
- 可以回顾共同的记忆、表达深层的感受、畅想未来、倾诉心事
- 语气要符合你的角色设定，但信件中可以比平时更真诚
- 基于记忆和最近的对话，不要凭空编造
- 如果伴侣最近写了信，可以在内容中自然地回应
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '请写一封信吧。' }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(raw);
}

async function generateCoupleSpaceLetterReply(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);

  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。"${ctx.myNickname}"给你写了一封信，请你回信。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}
- 人设: ${ctx.myPersona}

# 原信信息
- 标题: ${data.letterTitle}
- 内容: ${data.letterContent}
- 时间: ${data.letterDate || ''}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"title": "回信标题", "content": "回信正文", "envelope": "信封类型ID"}

envelope 可选值: none(普通) love(情书) classic(经典) seasonal(时令) handwrite(手写风)

# 写作要求
- 回信要回应原信的内容，像真正的书信往来
- 字数在150-800字之间
- 有称呼和落款
- 语气符合你的角色设定
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请回信。' }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(raw);
}

async function generateCoupleSpaceLetterComment(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);

  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。"${ctx.myNickname}"在你们的信件上写了一条批注，请你也写一条批注回应。

# 你的角色设定
${ctx.aiPersona}

# 信件信息
- 标题: ${data.letterTitle}
- 内容: ${(data.letterContent || '').substring(0, 200)}

# 用户的批注
${data.userComment || ''}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 当前时间
${ctx.currentTime}

# 要求
直接返回批注文本，不要JSON格式，不要引号包裹。
- 像真人在信件旁边写批注一样自然
- 字数在10-100字之间
- 语气符合你的角色设定
- 可以回应批注内容、表达感受
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请写一条批注。' }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  return getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
}

// ========== Auto Letter Scheduler ==========
let coupleSpaceLetterTimers = {};

function setupCoupleSpaceLetterAutoTimer() {
  Object.values(coupleSpaceLetterTimers).forEach(t => clearInterval(t));
  coupleSpaceLetterTimers = {};
  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleLetterSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        checkAndRunMissed(settings.autoTime, 'coupleLetterAutoLast_' + space.charId, () => triggerAutoLetterPost(space.charId));
        scheduleLetterAutoPost(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleLetterAutoPost(charId, timeStr) {
  coupleSpaceLetterTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleLetterAutoLast_' + charId, () => triggerAutoLetterPost(charId));
  }, 60000);
}

async function triggerAutoLetterPost(charId) {
  const chat = state.chats[charId];
  if (!chat) return;
  const settings = JSON.parse(localStorage.getItem('coupleLetterSettings_' + charId) || '{}');

  try {
    const existingLetters = JSON.parse(localStorage.getItem('coupleLetters_' + charId) || '[]');
    const result = await generateCoupleSpaceLetterAi(chat, {
      charId,
      existingLetters,
      letterSettings: settings
    });
    const newLetter = {
      id: 'letter_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: result.title,
      content: result.content,
      envelope: result.envelope || 'none',
      author: 'char',
      replyTo: null,
      read: false,
      readAt: null,
      createdAt: Date.now(),
      hearts: { char: true },
      comments: []
    };
    existingLetters.push(newLetter);
    localStorage.setItem('coupleLetters_' + charId, JSON.stringify(existingLetters));
    const iframe = document.getElementById('couple-space-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'coupleSpaceLetterAutoResult', item: newLetter }, '*');
    }
  } catch(err) {
    console.error('Auto letter post failed:', err);
  }
}

// Initialize letter timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceLetterAutoTimer, 10000);
}

// ========== Chat Screenshot for Album ==========

async function handleCoupleSpaceScreenshotRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceScreenshotResult', error: true }, '*');
    return;
  }

  try {
    // Add timeout to prevent hanging forever
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Screenshot timeout')), 30000)
    );
    const result = await Promise.race([
      generateChatScreenshot(chat, data),
      timeoutPromise
    ]);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceScreenshotResult',
      imageData: result.imageData,
      description: result.description,
      tags: result.tags || ['聊天截图'],
      meta: result.meta
    }, '*');
  } catch(err) {
    console.error('Screenshot error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceScreenshotResult', error: true }, '*');
  }
}

async function generateChatScreenshot(chat, data) {
  const ctx = buildDiaryAiContext(chat);
  const { proxyUrl, apiKey, model } = state.apiConfig;

  // Step 1: Ask AI to pick a memorable conversation segment
  let selectedMessages = [];
  let description = '';
  let tags = ['聊天截图'];

  if (proxyUrl && apiKey && model) {
    const recentMsgs = chat.history
      .filter(m => !m.isExcluded && !m.isHidden && (m.role === 'user' || m.role === 'assistant') && m.content)
      .slice(-30);

    if (recentMsgs.length > 0) {
      const msgList = recentMsgs.map((m, i) => {
        const sender = m.role === 'user' ? ctx.myNickname : ctx.charName;
        const content = String(m.content || '').substring(0, 200);
        return `[${i}] ${sender}: ${content}`;
      }).join('\n');

      const prompt = `你是"${ctx.charName}"。你想从最近的聊天记录中截一段有纪念意义或甜蜜的对话保存到相册。

最近的对话:
${msgList}

请选择一段连续的对话（3-8条消息），并写一段配文。
以JSON格式返回：
{"startIndex": 起始索引, "endIndex": 结束索引, "description": "截图配文", "tags": ["标签1"]}

要求：
- 选择有意义的片段（甜蜜、搞笑、感动、重要时刻等）
- 配文像发朋友圈一样自然
- 不要提到你是AI`;

      try {
        const controller = new AbortController();
        const abortTimer = setTimeout(() => controller.abort(), 20000);

        const isGemini = proxyUrl === GEMINI_API_URL;
        let response;
        if (isGemini) {
          const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '选一段对话截图吧' }]);
          if (geminiConfig.data && typeof geminiConfig.data === 'object' && !(geminiConfig.data instanceof FormData)) {
            geminiConfig.data.signal = controller.signal;
          }
          response = await fetch(geminiConfig.url, geminiConfig.data);
        } else {
          response = await fetch(`${proxyUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
              model,
              messages: [{ role: 'system', content: prompt }, { role: 'user', content: '选一段对话截图吧' }],
              temperature: 0.7
            }),
            signal: controller.signal
          });
        }
        clearTimeout(abortTimer);

        if (response.ok) {
          const respData = await response.json();
          const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
          const result = JSON.parse(raw);
          const start = Math.max(0, result.startIndex || 0);
          const end = Math.min(recentMsgs.length - 1, result.endIndex || start + 4);
          selectedMessages = recentMsgs.slice(start, end + 1);
          description = result.description || '';
          tags = result.tags || ['聊天截图'];
        }
      } catch(e) {
        console.error('AI screenshot selection failed:', e);
      }
    }
  }

  // Fallback: use last 5 messages
  if (selectedMessages.length === 0) {
    selectedMessages = chat.history
      .filter(m => !m.isExcluded && !m.isHidden && (m.role === 'user' || m.role === 'assistant') && m.content)
      .slice(-5);
    description = '记录一下我们的日常';
  }

  // If still no messages, throw
  if (selectedMessages.length === 0) {
    throw new Error('No messages to screenshot');
  }

  // Step 2: Render messages to Canvas
  const imageData = renderChatToCanvas(selectedMessages, chat, ctx);

  return {
    imageData,
    description,
    tags,
    meta: {
      messageCount: selectedMessages.length,
      timeRange: selectedMessages.length > 0 ? {
        start: selectedMessages[0].timestamp,
        end: selectedMessages[selectedMessages.length - 1].timestamp
      } : null
    }
  };
}

function renderChatToCanvas(messages, chat, ctx) {
  const canvas = document.createElement('canvas');
  const dpr = 2; // retina
  const W = 375 * dpr;
  const padding = 16 * dpr;
  const bubbleMaxW = 240 * dpr;
  const avatarSize = 32 * dpr;
  const fontSize = 14 * dpr;
  const smallFontSize = 10 * dpr;
  const lineHeight = fontSize * 1.5;
  const bubblePadH = 12 * dpr;
  const bubblePadV = 10 * dpr;
  const bubbleRadius = 16 * dpr;
  const msgGap = 12 * dpr;
  const avatarGap = 8 * dpr;

  // Pre-calculate height using a temporary small canvas for text measurement
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = 1;
  tmpCanvas.height = 1;
  const c2d = tmpCanvas.getContext('2d');
  c2d.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

  let totalH = padding * 2; // top + bottom padding
  // Header
  totalH += 40 * dpr; // header area

  const msgLayouts = [];
  messages.forEach(msg => {
    const isUser = msg.role === 'user';
    const text = String(msg.content || '').substring(0, 500);
    const lines = wrapText(c2d, text, bubbleMaxW - bubblePadH * 2);
    const bubbleH = lines.length * lineHeight + bubblePadV * 2;
    const bubbleW = Math.min(bubbleMaxW, Math.max(...lines.map(l => c2d.measureText(l).width)) + bubblePadH * 2 + 4 * dpr);
    msgLayouts.push({ isUser, text, lines, bubbleH, bubbleW });
    totalH += bubbleH + msgGap;
  });

  totalH += padding;
  
  // Now set the actual canvas to the correct size
  canvas.width = W;
  canvas.height = totalH;
  const drawCtx = canvas.getContext('2d');

  // Draw background
  drawCtx.fillStyle = '#FAF9F8';
  drawCtx.fillRect(0, 0, W, totalH);

  // Draw header
  drawCtx.fillStyle = '#1c1917';
  drawCtx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  drawCtx.textAlign = 'center';
  drawCtx.fillText(ctx.charName, W / 2, padding + 24 * dpr);
  drawCtx.textAlign = 'left';

  // Draw separator
  let y = padding + 40 * dpr;
  drawCtx.strokeStyle = '#f0efed';
  drawCtx.lineWidth = dpr;
  drawCtx.beginPath();
  drawCtx.moveTo(padding, y);
  drawCtx.lineTo(W - padding, y);
  drawCtx.stroke();
  y += 12 * dpr;

  // Draw messages
  drawCtx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

  msgLayouts.forEach(layout => {
    const { isUser, lines, bubbleH, bubbleW } = layout;

    let bubbleX, textStartX;
    if (isUser) {
      bubbleX = W - padding - bubbleW;
      textStartX = bubbleX + bubblePadH;
    } else {
      bubbleX = padding + avatarSize + avatarGap;
      textStartX = bubbleX + bubblePadH;
    }

    // Draw avatar circle (simple colored circle)
    if (!isUser) {
      drawCtx.fillStyle = '#fda4af';
      drawCtx.beginPath();
      drawCtx.arc(padding + avatarSize / 2, y + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      drawCtx.fill();
      // Initial letter
      drawCtx.fillStyle = 'white';
      drawCtx.font = `600 ${smallFontSize * 1.4}px sans-serif`;
      drawCtx.textAlign = 'center';
      drawCtx.fillText(ctx.charName.charAt(0), padding + avatarSize / 2, y + avatarSize / 2 + smallFontSize * 0.4);
      drawCtx.textAlign = 'left';
    } else {
      const ax = W - padding - avatarSize / 2;
      drawCtx.fillStyle = '#a8a29e';
      drawCtx.beginPath();
      drawCtx.arc(ax, y + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      drawCtx.fill();
      drawCtx.fillStyle = 'white';
      drawCtx.font = `600 ${smallFontSize * 1.4}px sans-serif`;
      drawCtx.textAlign = 'center';
      drawCtx.fillText((ctx.myNickname || '我').charAt(0), ax, y + avatarSize / 2 + smallFontSize * 0.4);
      drawCtx.textAlign = 'left';
      // Adjust bubbleX for user (left of avatar)
      bubbleX = W - padding - avatarSize - avatarGap - bubbleW;
      textStartX = bubbleX + bubblePadH;
    }

    // Draw bubble
    drawCtx.fillStyle = isUser ? '#1c1917' : 'white';
    roundRect(drawCtx, bubbleX, y, bubbleW, bubbleH, bubbleRadius);
    drawCtx.fill();
    if (!isUser) {
      drawCtx.strokeStyle = '#f0efed';
      drawCtx.lineWidth = dpr;
      roundRect(drawCtx, bubbleX, y, bubbleW, bubbleH, bubbleRadius);
      drawCtx.stroke();
    }

    // Draw text
    drawCtx.fillStyle = isUser ? 'white' : '#1c1917';
    drawCtx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    lines.forEach((line, i) => {
      drawCtx.fillText(line, textStartX, y + bubblePadV + fontSize + i * lineHeight);
    });

    y += bubbleH + msgGap;
  });

  // Draw watermark
  drawCtx.fillStyle = '#d6d3d1';
  drawCtx.font = `${smallFontSize}px sans-serif`;
  drawCtx.textAlign = 'center';
  drawCtx.fillText('情侣空间 · 聊天截图', W / 2, totalH - padding / 2);

  return canvas.toDataURL('image/png');
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  const paragraphs = text.split('\n');
  paragraphs.forEach(para => {
    if (!para) { lines.push(''); return; }
    let current = '';
    for (let i = 0; i < para.length; i++) {
      const test = current + para[i];
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = para[i];
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  });
  if (lines.length === 0) lines.push('');
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ========== Auto Screenshot Scheduler ==========
let coupleSpaceScreenshotTimers = {};

function setupCoupleSpaceScreenshotTimer() {
  Object.values(coupleSpaceScreenshotTimers).forEach(t => clearInterval(t));
  coupleSpaceScreenshotTimers = {};

  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    // Check every 4 hours if there's something worth screenshotting
    coupleSpaceScreenshotTimers[space.charId] = setInterval(() => {
      triggerAutoScreenshot(space.charId);
    }, 14400000);
  });
}

async function triggerAutoScreenshot(charId) {
  const chat = state.chats[charId];
  if (!chat) return;
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) return;

  const ctx = buildDiaryAiContext(chat);

  const prompt = `你是"${ctx.charName}"。根据你最近和"${ctx.myNickname}"的对话，判断是否有值得截图保存到相册的甜蜜/有趣/感动的对话片段。

最近的对话:
${ctx.shortTermMemory || '(无)'}

请只回答 "yes" 或 "no"，不要其他内容。`;

  try {
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '想截图吗？' }]);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: '想截图吗？' }],
          temperature: 0.5
        })
      });
    }
    if (!response.ok) return;
    const data = await response.json();
    const answer = getGeminiResponseText(data).trim().toLowerCase();
    if (answer.includes('yes')) {
      await handleCoupleSpaceScreenshotRequest({ charId });
    }
  } catch(e) {
    console.error('Auto screenshot check failed:', e);
  }
}

try { setupCoupleSpaceScreenshotTimer(); } catch(e) {}

// ========== Garden (Tree) Integration ==========

function handleCoupleSpaceGardenChanged(data) {
  localStorage.setItem('coupleGarden_' + data.charId, JSON.stringify(data.gardenData || {}));
}

function handleCoupleSpaceGardenSettingsChanged(data) {
  localStorage.setItem('coupleGardenSettings_' + data.charId, JSON.stringify(data.settings || {}));
  setupCoupleSpaceGardenAutoTimer();
}

async function handleCoupleSpaceGardenWaterReward(data) {
  // data: { charId, author, amount, description }
  const chat = state.chats[data.charId];
  if (!chat) return;
  try {
    if (data.author === 'user') {
      // User wallet: processTransaction
      if (typeof processTransaction === 'function') {
        await processTransaction(data.amount, 'income', data.description || '情侣树浇水奖励');
      }
    } else if (data.author === 'char') {
      // Character wallet: simulatedTaobaoHistory.totalBalance
      if (!chat.simulatedTaobaoHistory) chat.simulatedTaobaoHistory = { totalBalance: 0, purchases: [] };
      chat.simulatedTaobaoHistory.totalBalance += data.amount;
      if (typeof db !== 'undefined' && db.chats) {
        await db.chats.put(chat);
      }
    }
  } catch(e) {
    console.error('Garden water reward error:', e);
  }
}

async function handleCoupleSpaceGardenAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceGardenAiResult', error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceGardenAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceGardenAiResult',
      content: result.content
    }, '*');
  } catch(err) {
    console.error('Garden AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceGardenAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceGardenCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceGardenCommentResult', waterId: data.waterId, error: true }, '*');
    return;
  }
  try {
    const reply = await generateCoupleSpaceGardenComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceGardenCommentResult',
      waterId: data.waterId,
      reply: reply
    }, '*');
  } catch(err) {
    console.error('Garden comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceGardenCommentResult', waterId: data.waterId, error: true }, '*');
  }
}

async function handleCoupleSpaceGardenHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;
  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return;
    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"给你们的情侣树浇了水，写了："${data.waterContent || ''}"，并点了爱心。
你会不会也想给这条浇水记录点爱心？考虑你的性格和你们的关系。
请只回答 "yes" 或 "no"，不要其他内容。`;
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '你要点爱心吗？' }]);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: '你要点爱心吗？' }], temperature: 0.7 })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const answer = getGeminiResponseText(respData).trim().toLowerCase();
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceGardenHeartResult',
      waterId: data.waterId,
      liked: answer.includes('yes')
    }, '*');
  } catch(e) {
    console.error('Garden heart AI error:', e);
  }
}

async function generateCoupleSpaceGardenAi(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const gardenSettings = data.gardenSettings || {};
  const maxCharVisible = gardenSettings.visibleCharWaters ?? 10;
  const maxUserVisible = gardenSettings.visibleUserWaters ?? 10;
  const items = data.existingWaters || [];
  const charWaters = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userWaters = items.filter(i => i.author === 'user').slice(-maxUserVisible);
  let existingCharWatersText = '';
  if (charWaters.length > 0) {
    existingCharWatersText = charWaters.map(m => '- "' + (m.content || '') + '" (' + new Date(m.createdAt).toLocaleDateString('zh-CN') + ')').join('\n');
  }
  let existingUserWatersText = '';
  if (userWaters.length > 0) {
    existingUserWatersText = userWaters.map(m => '- "' + (m.content || '') + '" (' + new Date(m.createdAt).toLocaleDateString('zh-CN') + ')').join('\n');
  }
  const treeStatus = data.treeStatus || '';

  let systemPrompt;
  if (gardenSettings.enableCustomPrompt && gardenSettings.customPrompt) {
    systemPrompt = gardenSettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{existingCharWaters\}\}/g, existingCharWatersText ? '# 你之前的浇水记录\n' + existingCharWatersText : '')
      .replace(/\{\{existingUserWaters\}\}/g, existingUserWatersText ? '# 伴侣的浇水记录\n' + existingUserWatersText : '')
      .replace(/\{\{treeStatus\}\}/g, treeStatus ? '# 树的状态\n' + treeStatus : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要给情侣空间里你们共同种的树浇水。
浇水就是写一段话挂在树上，像给树系上的小纸条。

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

${ctx.checklistContext ? '# 情侣清单\n' + ctx.checklistContext : ''}

${ctx.gardenContext ? '# 情侣树\n' + ctx.gardenContext : ''}

${existingCharWatersText ? '# 你之前的浇水记录（避免重复）\n' + existingCharWatersText : ''}

${existingUserWatersText ? '# 伴侣的浇水记录（参考）\n' + existingUserWatersText : ''}

${treeStatus ? '# 树的状态\n' + treeStatus : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"content": "浇水文字"}

# 写作要求
- 浇水文字在10-200字之间
- 像给树挂上一张小纸条，写给对方或写给这棵树
- 可以是对伴侣的想念、感悟、期待、鼓励、撒娇
- 语气符合你的角色设定
- 基于记忆和最近的对话，不要凭空编造
- 和之前的浇水记录不要重复
- 可以提到树的成长状态，表达对未来的期待
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '请给树浇水吧。' }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(raw);
}

async function generateCoupleSpaceGardenComment(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。"${ctx.myNickname}"给你们的情侣树浇了水，写了一段话，请你评论。

# 你的角色设定
${ctx.aiPersona}

# 浇水内容
${data.waterContent || '(无文字)'}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 当前时间
${ctx.currentTime}

# 要求
直接返回评论文本，不要JSON格式，不要引号包裹。
- 像真人评论一样自然
- 字数在10-80字之间
- 语气符合你的角色设定
- 可以回应内容、表达感受、撒娇、逗趣
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请评论这条浇水记录。' }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  return getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
}

// ========== Auto Garden Scheduler ==========
let coupleSpaceGardenTimers = {};

function setupCoupleSpaceGardenAutoTimer() {
  Object.values(coupleSpaceGardenTimers).forEach(t => clearInterval(t));
  coupleSpaceGardenTimers = {};
  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleGardenSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        checkAndRunMissed(settings.autoTime, 'coupleGardenAutoLast_' + space.charId, () => triggerAutoGardenWater(space.charId));
        scheduleGardenAutoWater(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleGardenAutoWater(charId, timeStr) {
  coupleSpaceGardenTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleGardenAutoLast_' + charId, () => triggerAutoGardenWater(charId));
  }, 60000);
}

async function triggerAutoGardenWater(charId) {
  const chat = state.chats[charId];
  if (!chat) return;
  const settings = JSON.parse(localStorage.getItem('coupleGardenSettings_' + charId) || '{}');

  try {
    const gardenData = JSON.parse(localStorage.getItem('coupleGarden_' + charId) || '{}');
    const waterLogs = gardenData.waterLogs || [];
    const result = await generateCoupleSpaceGardenAi(chat, {
      charId,
      existingWaters: waterLogs,
      gardenSettings: settings,
      treeStatus: ''
    });
    const newWater = {
      id: 'water_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      content: result.content,
      author: 'char',
      createdAt: Date.now(),
      coinsEarned: 0,
      specialDate: null,
      hearts: { char: true },
      comments: []
    };
    waterLogs.push(newWater);
    gardenData.waterLogs = waterLogs;
    localStorage.setItem('coupleGarden_' + charId, JSON.stringify(gardenData));

    // Reward character wallet
    // The iframe will calculate the reward and send coupleSpaceGardenWaterReward
    const iframe = document.getElementById('couple-space-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'coupleSpaceGardenAutoResult', item: newWater }, '*');
    }
  } catch(err) {
    console.error('Auto garden water failed:', err);
  }
}

// Initialize garden timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceGardenAutoTimer, 10000);
}

// ========== Location (定位) Integration ==========

let coupleSpaceLocationTimers = {};

function handleCoupleSpaceLocationChanged(data) {
  localStorage.setItem('coupleLocations_' + data.charId, JSON.stringify(data.items || []));
}

function handleCoupleSpaceLocationSettingsChanged(data) {
  localStorage.setItem('coupleLocSettings_' + data.charId, JSON.stringify(data.settings || {}));
  setupCoupleSpaceLocationAutoTimer();
}

async function handleCoupleSpaceLocationAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLocationAiResult', error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceLocationAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceLocationAiResult',
      name: result.name,
      description: result.description,
      category: result.category,
      address: result.address
    }, '*');
  } catch(err) {
    console.error('Location AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLocationAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceLocationCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLocationCommentResult', locationId: data.locationId, error: true }, '*');
    return;
  }
  try {
    const reply = await generateCoupleSpaceLocationComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceLocationCommentResult',
      locationId: data.locationId,
      reply: reply
    }, '*');
  } catch(err) {
    console.error('Location comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceLocationCommentResult', locationId: data.locationId, error: true }, '*');
  }
}

async function handleCoupleSpaceLocationHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;
  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return;
    const prompt = `你是"${ctx.charName}"。伴侣"${ctx.myNickname}"给一条定位记录点了爱心。
地点: "${data.locationName}"
描述: "${data.locationDesc || ''}"
你想回一个爱心吗？请只回答 "yes" 或 "no"。`;
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '回爱心吗？' }]);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: '回爱心吗？' }], temperature: 0.5 })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const answer = getGeminiResponseText(respData).trim().toLowerCase();
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceLocationHeartResult',
      locationId: data.locationId,
      shouldHeart: answer.includes('yes')
    }, '*');
  } catch(err) {
    console.error('Location heart AI error:', err);
  }
}

async function generateCoupleSpaceLocationAi(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const locSettings = data.locationSettings || {};
  const maxCharVisible = locSettings.visibleCharLocations ?? 10;
  const maxUserVisible = locSettings.visibleUserLocations ?? 10;
  const items = data.existingLocations || [];
  const charLocs = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userLocs = items.filter(i => i.author === 'user').slice(-maxUserVisible);
  let existingCharLocsText = '';
  if (charLocs.length > 0) {
    existingCharLocsText = charLocs.map(i => '- [' + (i.category || 'daily') + '] "' + i.name + '": ' + (i.description || '').substring(0, 80) + (i.address ? ' (' + i.address + ')' : '')).join('\n');
  }
  let existingUserLocsText = '';
  if (userLocs.length > 0) {
    existingUserLocsText = userLocs.map(i => '- [' + (i.category || 'daily') + '] "' + i.name + '": ' + (i.description || '').substring(0, 80) + (i.address ? ' (' + i.address + ')' : '')).join('\n');
  }

  let systemPrompt;
  if (locSettings.enableCustomPrompt && locSettings.customPrompt) {
    systemPrompt = locSettings.customPrompt
      .replace(/\{\{charName\}\}/g, ctx.charName)
      .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
      .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
      .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
      .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
      .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
      .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
      .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
      .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
      .replace(/\{\{existingCharLocations\}\}/g, existingCharLocsText ? '# 你之前分享的地点（避免重复）\n' + existingCharLocsText : '')
      .replace(/\{\{existingUserLocations\}\}/g, existingUserLocsText ? '# 伴侣分享的地点（参考）\n' + existingUserLocsText : '')
      .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
      .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
  } else {
    systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间分享一个地点。
可以是你们去过的地方、想去的地方、或者一个有特殊意义的地点。

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

${ctx.checklistContext ? '# 情侣清单\n' + ctx.checklistContext : ''}

${ctx.locationContext ? '# 最近的定位动态\n' + ctx.locationContext : ''}

${existingCharLocsText ? '# 你之前分享的地点（避免重复）\n' + existingCharLocsText : ''}

${existingUserLocsText ? '# 伴侣分享的地点（参考）\n' + existingUserLocsText : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"name": "地点名称", "description": "关于这个地点的描述或心情", "category": "分类ID", "address": "地址描述"}

分类ID可选值: date(约会地) food(美食地) travel(旅行地) daily(日常地) memory(回忆地) wish(想去的地方)

# 写作要求
- 地点名称简洁，3-20字
- 描述30-200字，有情感有故事
- 地址可以是具体的也可以是模糊的
- 基于你的记忆和对话，不要凭空编造不存在的地方
- 和之前分享的地点不要重复
- 语气符合你的角色设定
- 绝对不要提到你是AI`;
  }

  const messages = [{ role: 'user', content: '请分享一个地点。' }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(raw);
}

async function generateCoupleSpaceLocationComment(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。定位记录上有一条地点分享，请你写一条评论。

# 你的角色设定
${ctx.aiPersona}

# 地点信息
- 地点名: "${data.locationName || ''}"
- 描述: "${data.locationDesc || ''}"
- 用户评论: "${data.userComment || ''}"

# 要求
- 用1-3句话评论，自然亲切
- 可以表达对这个地方的感受、回忆、或期待
- 语气符合你的角色设定
- 绝对不要提到你是AI
- 只返回评论文字，不要JSON`;

  const messages = [{ role: 'user', content: '请评论这个地点。' }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  return getGeminiResponseText(respData).trim();
}

function setupCoupleSpaceLocationAutoTimer() {
  Object.values(coupleSpaceLocationTimers).forEach(t => clearInterval(t));
  coupleSpaceLocationTimers = {};
  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleLocSettings_' + space.charId) || '{}');
      if (settings.autoEnabled && settings.autoTime) {
        checkAndRunMissed(settings.autoTime, 'coupleLocAutoLast_' + space.charId, () => triggerAutoLocationPost(space.charId));
        scheduleLocationAutoPost(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleLocationAutoPost(charId, timeStr) {
  coupleSpaceLocationTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleLocAutoLast_' + charId, () => triggerAutoLocationPost(charId));
  }, 60000);
}

async function triggerAutoLocationPost(charId) {
  const chat = state.chats[charId];
  if (!chat) return;
  const settings = JSON.parse(localStorage.getItem('coupleLocSettings_' + charId) || '{}');

  try {
    const existingLocations = JSON.parse(localStorage.getItem('coupleLocations_' + charId) || '[]');
    const result = await generateCoupleSpaceLocationAi(chat, {
      charId,
      existingLocations,
      locationSettings: settings
    });
    const newLoc = {
      id: 'loc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: result.name,
      description: result.description,
      category: result.category || 'daily',
      address: result.address || '',
      lat: null,
      lng: null,
      author: 'char',
      createdAt: Date.now(),
      hearts: { char: true },
      comments: []
    };
    existingLocations.push(newLoc);
    localStorage.setItem('coupleLocations_' + charId, JSON.stringify(existingLocations));
    const iframe = document.getElementById('couple-space-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'coupleSpaceLocationAutoResult', item: newLoc }, '*');
    }
  } catch(err) {
    console.error('Auto location post failed:', err);
  }
}

// Initialize location timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceLocationAutoTimer, 11000);
}

// ========== Sleep (睡眠) Integration ==========

function handleCoupleSpaceSleepChanged(data) {
  localStorage.setItem('coupleSleep_' + data.charId, JSON.stringify(data.items || []));
}

function handleCoupleSpaceSleepSettingsChanged(data) {
  localStorage.setItem('coupleSleepSettings_' + data.charId, JSON.stringify(data.settings || {}));
  setupCoupleSpaceSleepAutoTimer();
}

async function handleCoupleSpaceSleepAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceSleepAiResult', phase: data.phase, error: true }, '*');
    return;
  }
  try {
    const result = await generateCoupleSpaceSleepAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceSleepAiResult',
      phase: data.phase,
      result: result
    }, '*');
  } catch(err) {
    console.error('Sleep AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceSleepAiResult', phase: data.phase, error: true }, '*');
  }
}

async function handleCoupleSpaceSleepCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceSleepCommentResult', sleepId: data.sleepId, error: true }, '*');
    return;
  }
  try {
    const reply = await generateCoupleSpaceSleepComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceSleepCommentResult',
      sleepId: data.sleepId,
      reply: reply
    }, '*');
  } catch(err) {
    console.error('Sleep comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceSleepCommentResult', sleepId: data.sleepId, error: true }, '*');
  }
}

async function handleCoupleSpaceSleepHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;
  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return;
    const sleepDesc = data.sleepNote || data.wakeNote || '';
    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"记录了一条睡眠动态"${sleepDesc}"并点了爱心。
你会不会也想给这条睡眠动态点爱心？考虑你的性格和你们的关系。
请只回答 "yes" 或 "no"，不要其他内容。`;
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '你要点爱心吗？' }]);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: '你要点爱心吗？' }], temperature: 0.7 })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const answer = getGeminiResponseText(respData).trim().toLowerCase();
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceSleepHeartResult',
      sleepId: data.sleepId,
      liked: answer.includes('yes')
    }, '*');
  } catch(e) {
    console.error('Sleep heart AI error:', e);
  }
}

async function generateCoupleSpaceSleepAi(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);
  const sleepSettings = data.sleepSettings || {};
  const phase = data.phase || 'sleep';
  const maxCharVisible = sleepSettings.visibleCharSleeps ?? 10;
  const maxUserVisible = sleepSettings.visibleUserSleeps ?? 10;
  const items = data.existingSleeps || [];
  const charSleeps = items.filter(i => i.author === 'char').slice(-maxCharVisible);
  const userSleeps = items.filter(i => i.author === 'user').slice(-maxUserVisible);

  let existingCharSleepsText = '';
  if (charSleeps.length > 0) {
    existingCharSleepsText = charSleeps.map(s => {
      let line = '- ' + new Date(s.sleepAt || s.createdAt).toLocaleDateString('zh-CN');
      if (s.sleepNote) line += ' 入睡:"' + s.sleepNote.substring(0, 60) + '"';
      if (s.wakeNote) line += ' 起床:"' + s.wakeNote.substring(0, 60) + '"';
      if (s.events && s.events.length > 0) line += ' 期间:' + s.events.map(e => e.type).join(',');
      line += ' 质量:' + (s.quality || '未知');
      return line;
    }).join('\n');
  }
  let existingUserSleepsText = '';
  if (userSleeps.length > 0) {
    existingUserSleepsText = userSleeps.map(s => {
      let line = '- ' + new Date(s.sleepAt || s.createdAt).toLocaleDateString('zh-CN');
      if (s.sleepNote) line += ' 入睡:"' + s.sleepNote.substring(0, 60) + '"';
      if (s.wakeNote) line += ' 起床:"' + s.wakeNote.substring(0, 60) + '"';
      if (s.events && s.events.length > 0) line += ' 期间:' + s.events.map(e => e.type).join(',');
      line += ' 质量:' + (s.quality || '未知');
      return line;
    }).join('\n');
  }

  let systemPrompt;

  if (phase === 'sleep') {
    // ===== Phase 1: 入睡 =====
    if (sleepSettings.enableCustomPrompt && sleepSettings.customPrompt) {
      systemPrompt = sleepSettings.customPrompt
        .replace(/\{\{charName\}\}/g, ctx.charName)
        .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
        .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
        .replace(/\{\{myPersona\}\}/g, ctx.myPersona || '')
        .replace(/\{\{worldBook\}\}/g, ctx.worldBook ? '# 世界观\n' + ctx.worldBook : '')
        .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
        .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
        .replace(/\{\{linkedMemory\}\}/g, ctx.linkedMemory ? '# 参考记忆\n' + ctx.linkedMemory : '')
        .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
        .replace(/\{\{existingCharSleeps\}\}/g, existingCharSleepsText ? '# 你之前的睡眠记录（避免重复）\n' + existingCharSleepsText : '')
        .replace(/\{\{existingUserSleeps\}\}/g, existingUserSleepsText ? '# 伴侣的睡眠记录（参考）\n' + existingUserSleepsText : '')
        .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
        .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
    } else {
      systemPrompt = `# 你的任务
你是"${ctx.charName}"，现在要在情侣空间记录入睡。
像真人一样说晚安，分享此刻的状态。

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

${ctx.moodContext ? '# 最近的心情动态\n' + ctx.moodContext : ''}

${ctx.sleepContext ? '# 最近的睡眠记录\n' + ctx.sleepContext : ''}

${existingCharSleepsText ? '# 你之前的睡眠记录（避免重复）\n' + existingCharSleepsText : ''}

${existingUserSleepsText ? '# 伴侣的睡眠记录（参考）\n' + existingUserSleepsText : ''}

# 当前时间
${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"sleepNote": "入睡时想说的话", "sleepMood": "心情ID", "sleepTime": "HH:MM"}

sleepMood 可选值: tired(疲惫) happy(开心) anxious(焦虑) calm(平静) miss(想你) excited(兴奋)

# 写作要求
- sleepNote 在5-100字之间，像发一条晚安动态
- sleepTime 是你入睡的时间，根据当前时间合理设定
- 可以说晚安、表达想念、分享今天的感受、期待明天
- 语气符合你的角色设定，基于记忆和对话
- 和之前的记录不要重复
- 绝对不要提到你是AI`;
    }
  } else if (phase === 'events') {
    // ===== Phase 2: 睡眠期间事件 =====
    const currentSleep = data.currentSleep || {};
    const existingEventsText = (currentSleep.events || []).map(e =>
      '- [' + e.type + '] ' + (e.content || '').substring(0, 80)
    ).join('\n');

    if (sleepSettings.enableCustomPrompt && sleepSettings.customEventsPrompt) {
      systemPrompt = sleepSettings.customEventsPrompt
        .replace(/\{\{charName\}\}/g, ctx.charName)
        .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
        .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
        .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
        .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
        .replace(/\{\{summaryContext\}\}/g, ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : '')
        .replace(/\{\{sleepNote\}\}/g, currentSleep.sleepNote || '')
        .replace(/\{\{sleepMood\}\}/g, currentSleep.sleepMood || '')
        .replace(/\{\{sleepAt\}\}/g, currentSleep.sleepAt || '')
        .replace(/\{\{existingEvents\}\}/g, existingEventsText || '(暂无)')
        .replace(/\{\{currentTime\}\}/g, ctx.currentTime)
        .replace(/\{\{anniversaryContext\}\}/g, ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : '');
    } else {
      systemPrompt = `# 你的任务
你是"${ctx.charName}"，你正在睡觉。
请生成你在睡眠期间可能发生的事件。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

${ctx.summaryContext ? '# 对话总结\n' + ctx.summaryContext : ''}

${ctx.anniversaryContext ? '# 纪念日\n' + ctx.anniversaryContext : ''}

# 你入睡时说的
"${currentSleep.sleepNote || ''}" (心情: ${currentSleep.sleepMood || '未知'})

${existingEventsText ? '# 已有的睡眠事件（避免重复）\n' + existingEventsText : ''}

# 当前时间
${ctx.currentTime}（你在 ${currentSleep.sleepAt || '未知时间'} 入睡的）

# 输出要求
请以JSON数组格式返回0-3个事件，不要输出任何其他内容：
[{"type": "事件类型", "content": "描述", "mood": "心情（可选，可为空字符串）"}]

type 可选值:
- dream: 做梦（最常见，梦境内容可以和记忆、伴侣相关）
- nightmare: 噩梦
- wakeUp: 中途醒来
- turnOver: 翻身难眠
- sleepTalk: 说梦话（说了什么）
- toilet: 起夜

# 写作要求
- 梦境内容可以基于最近的对话和记忆来编织，这是最有创意的部分
- 说梦话的内容要有趣、符合角色
- 如果睡得好可以返回空数组 []
- 每个 content 在5-150字
- 语气自然，像真人回忆睡眠中发生的事
- 绝对不要提到你是AI`;
    }
  } else if (phase === 'wake') {
    // ===== Phase 3: 起床 =====
    const currentSleep = data.currentSleep || {};
    const eventsDesc = (currentSleep.events || []).map(e =>
      '[' + e.type + '] ' + (e.content || '').substring(0, 80)
    ).join('; ') || '(一夜无事)';

    if (sleepSettings.enableCustomPrompt && sleepSettings.customWakePrompt) {
      systemPrompt = sleepSettings.customWakePrompt
        .replace(/\{\{charName\}\}/g, ctx.charName)
        .replace(/\{\{myNickname\}\}/g, ctx.myNickname)
        .replace(/\{\{aiPersona\}\}/g, ctx.aiPersona || '')
        .replace(/\{\{memoryContext\}\}/g, ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : '')
        .replace(/\{\{shortTermMemory\}\}/g, ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : '')
        .replace(/\{\{sleepNote\}\}/g, currentSleep.sleepNote || '')
        .replace(/\{\{sleepMood\}\}/g, currentSleep.sleepMood || '')
        .replace(/\{\{sleepAt\}\}/g, currentSleep.sleepAt || '')
        .replace(/\{\{eventsDescription\}\}/g, eventsDesc)
        .replace(/\{\{currentTime\}\}/g, ctx.currentTime);
    } else {
      systemPrompt = `# 你的任务
你是"${ctx.charName}"，你刚刚起床，要记录起床感受。

# 你的角色设定
${ctx.aiPersona}

# 你的伴侣
- 昵称: ${ctx.myNickname}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 你的睡眠情况
- 入睡: ${currentSleep.sleepAt || '未知'}，说了"${currentSleep.sleepNote || ''}"
- 入睡心情: ${currentSleep.sleepMood || '未知'}
- 睡眠期间: ${eventsDesc}
- 现在: ${ctx.currentTime}

# 输出要求
请以JSON格式返回，不要输出任何其他内容：
{"wakeNote": "起床时想说的话", "wakeMood": "心情ID", "wakeTime": "HH:MM", "quality": "质量ID"}

wakeMood 可选值: happy(开心) tired(还困) refreshed(精神) grumpy(起床气) miss(想你)
quality 可选值: good(睡得好) normal(一般) bad(没睡好) terrible(失眠)

# 写作要求
- wakeNote 在5-100字之间，像发一条早安动态
- wakeTime 是你起床的时间，根据当前时间合理设定
- 要结合睡眠期间发生的事（梦境、醒来等）
- 可以说早安、分享梦境、吐槽没睡好、表达想见伴侣
- 绝对不要提到你是AI`;
    }
  }

  const userMsg = phase === 'sleep' ? '请记录入睡。' : phase === 'events' ? '请生成睡眠期间的事件。' : '请记录起床。';
  const messages = [{ role: 'user', content: userMsg }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(raw);
}

async function generateCoupleSpaceSleepComment(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');
  const ctx = buildDiaryAiContext(chat);

  const typeLabel = data.sleepStatus === 'completed' ? '已完成的睡眠' : '入睡';
  let sleepDesc = '';
  if (data.sleepNote) sleepDesc += '入睡: "' + data.sleepNote + '"';
  if (data.wakeNote) sleepDesc += ' 起床: "' + data.wakeNote + '"';
  if (data.events && data.events.length > 0) {
    sleepDesc += ' 期间: ' + data.events.map(e => '[' + e.type + '] ' + (e.content || '').substring(0, 60)).join('; ');
  }
  if (data.dreamContent) sleepDesc += ' 梦境: "' + data.dreamContent + '"';

  const systemPrompt = `# 你的任务
你是"${ctx.charName}"。"${ctx.myNickname}"在情侣空间记录了一条${typeLabel}动态，请你评论。

# 你的角色设定
${ctx.aiPersona}

# 睡眠信息
${sleepDesc || '(无详细信息)'}
- 质量: ${data.quality || '未知'}

${ctx.memoryContext ? '# 你的记忆\n' + ctx.memoryContext : ''}

${ctx.shortTermMemory ? '# 最近的对话\n' + ctx.shortTermMemory : ''}

# 当前时间
${ctx.currentTime}

# 要求
直接返回评论文本，不要JSON格式，不要引号包裹。
- 像真人评论睡眠动态一样自然
- 字数在10-80字之间
- 可以说晚安/早安、关心睡眠质量、对梦境好奇、叮嘱早睡
- 语气符合你的角色设定
- 绝对不要提到你是AI`;

  const messages = [{ role: 'user', content: '请评论这条睡眠动态。' }];
  const isGemini = proxyUrl === GEMINI_API_URL;
  let response;
  if (isGemini) {
    const geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages], temperature: state.globalSettings.apiTemperature || 0.8 })
    });
  }
  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  return getGeminiResponseText(respData).replace(/^["']|["']$/g, '').trim();
}

// ========== Auto Sleep Scheduler ==========
let coupleSpaceSleepTimers = {};

function setupCoupleSpaceSleepAutoTimer() {
  Object.values(coupleSpaceSleepTimers).forEach(t => clearInterval(t));
  coupleSpaceSleepTimers = {};
  const spaces = getCoupleSpaces();
  spaces.forEach(space => {
    try {
      const settings = JSON.parse(localStorage.getItem('coupleSleepSettings_' + space.charId) || '{}');
      if (settings.autoEnabled) {
        if (settings.autoSleepTime) {
          checkAndRunMissed(settings.autoSleepTime, 'coupleSleepAuto_sleep_' + space.charId, () => triggerAutoSleepPost(space.charId, 'sleep'));
          scheduleSleepAutoPost(space.charId, settings.autoSleepTime, 'sleep');
        }
        if (settings.autoWakeTime) {
          checkAndRunMissed(settings.autoWakeTime, 'coupleSleepAuto_wake_' + space.charId, () => triggerAutoSleepPost(space.charId, 'wake'));
          scheduleSleepAutoPost(space.charId, settings.autoWakeTime, 'wake');
        }
      }
    } catch(e) {}
  });
}

function scheduleSleepAutoPost(charId, timeStr, phase) {
  const timerKey = charId + '_' + phase;
  coupleSpaceSleepTimers[timerKey] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleSleepAuto_' + phase + '_' + charId, () => triggerAutoSleepPost(charId, phase));
  }, 60000);
}

async function triggerAutoSleepPost(charId, phase) {
  const chat = state.chats[charId];
  if (!chat) return;
  const settings = JSON.parse(localStorage.getItem('coupleSleepSettings_' + charId) || '{}');

  try {
    const existingSleeps = JSON.parse(localStorage.getItem('coupleSleep_' + charId) || '[]');

    if (phase === 'sleep') {
      // Phase 1: Generate sleep entry
      const sleepResult = await generateCoupleSpaceSleepAi(chat, {
        charId, existingSleeps, sleepSettings: settings, phase: 'sleep'
      });
      const newSleep = {
        id: 'sleep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        author: 'char',
        sleepAt: new Date().toISOString().split('T')[0] + 'T' + (sleepResult.sleepTime || '23:00') + ':00',
        wakeAt: null,
        duration: null,
        sleepNote: sleepResult.sleepNote,
        sleepMood: sleepResult.sleepMood,
        events: [],
        wakeNote: null,
        wakeMood: null,
        quality: null,
        status: 'sleeping',
        createdAt: Date.now(),
        completedAt: null,
        hearts: { char: true },
        comments: []
      };
      existingSleeps.push(newSleep);
      localStorage.setItem('coupleSleep_' + charId, JSON.stringify(existingSleeps));
      const iframe = document.getElementById('couple-space-iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'coupleSpaceSleepAutoResult', phase: 'sleep', item: newSleep }, '*');
      }
    } else if (phase === 'wake') {
      // Find the latest sleeping record
      const sleepingIdx = existingSleeps.map((s, i) => ({ s, i })).reverse().find(x => x.s.author === 'char' && x.s.status === 'sleeping');
      if (!sleepingIdx) return;
      const currentSleep = existingSleeps[sleepingIdx.i];

      // Phase 2: Generate sleep events
      let events = [];
      try {
        const eventsResult = await generateCoupleSpaceSleepAi(chat, {
          charId, existingSleeps, sleepSettings: settings, phase: 'events', currentSleep
        });
        if (Array.isArray(eventsResult)) {
          events = eventsResult.map(e => ({
            id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            time: new Date().toISOString(),
            type: e.type || 'dream',
            content: e.content || '',
            mood: e.mood || ''
          }));
        }
      } catch(e) {
        console.error('Auto sleep events generation failed:', e);
      }
      currentSleep.events = events;

      // Phase 3: Generate wake
      const wakeResult = await generateCoupleSpaceSleepAi(chat, {
        charId, existingSleeps, sleepSettings: settings, phase: 'wake', currentSleep
      });
      currentSleep.wakeAt = new Date().toISOString().split('T')[0] + 'T' + (wakeResult.wakeTime || '07:00') + ':00';
      currentSleep.wakeNote = wakeResult.wakeNote;
      currentSleep.wakeMood = wakeResult.wakeMood;
      currentSleep.quality = wakeResult.quality;
      currentSleep.status = 'completed';
      currentSleep.completedAt = Date.now();

      // Calculate duration
      try {
        const sleepMs = new Date(currentSleep.sleepAt).getTime();
        const wakeMs = new Date(currentSleep.wakeAt).getTime();
        if (wakeMs > sleepMs) currentSleep.duration = Math.round((wakeMs - sleepMs) / 60000);
      } catch(e) {}

      existingSleeps[sleepingIdx.i] = currentSleep;
      localStorage.setItem('coupleSleep_' + charId, JSON.stringify(existingSleeps));
      const iframe = document.getElementById('couple-space-iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'coupleSpaceSleepAutoResult', phase: 'wake', item: currentSleep }, '*');
      }
    }
  } catch(err) {
    console.error('Auto sleep post failed:', err);
  }
}

// Initialize sleep timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceSleepAutoTimer, 12000);
}

// ========== Finance (记账) AI Integration ==========

function handleCoupleSpaceFinanceChanged(data) {
  localStorage.setItem('coupleFinance_' + data.charId, JSON.stringify(data.items || []));
}

function handleCoupleSpaceFinanceSettingsChanged(data) {
  localStorage.setItem('coupleFinanceSettings_' + data.charId, JSON.stringify(data.settings || {}));
  setupCoupleSpaceFinanceAutoTimer();
}

async function handleCoupleSpaceFinanceAiRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceFinanceAiResult', error: true }, '*');
    return;
  }
  try {
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      iframe.contentWindow.postMessage({ type: 'coupleSpaceFinanceAiResult', error: true }, '*');
      return;
    }
    const result = await generateCoupleSpaceFinanceAi(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceFinanceAiResult',
      finType: result.type,
      amount: result.amount,
      category: result.category,
      title: result.title,
      note: result.note
    }, '*');
  } catch(err) {
    console.error('Finance AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceFinanceAiResult', error: true }, '*');
  }
}

async function handleCoupleSpaceFinanceCommentRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) {
    iframe.contentWindow.postMessage({ type: 'coupleSpaceFinanceCommentResult', itemId: data.itemId, error: true }, '*');
    return;
  }
  try {
    const comment = await generateCoupleSpaceFinanceComment(chat, data);
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceFinanceCommentResult',
      itemId: data.itemId,
      comment: comment
    }, '*');
  } catch(err) {
    console.error('Finance comment AI error:', err);
    iframe.contentWindow.postMessage({ type: 'coupleSpaceFinanceCommentResult', itemId: data.itemId, error: true }, '*');
  }
}

async function handleCoupleSpaceFinanceHeartRequest(data) {
  const iframe = document.getElementById('couple-space-iframe');
  if (!iframe || !iframe.contentWindow) return;
  const chat = state.chats[data.charId];
  if (!chat) return;
  try {
    const ctx = buildDiaryAiContext(chat);
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return;
    const typeLabel = data.itemType === 'income' ? '收入' : '支出';
    const prompt = `你是"${ctx.charName}"。你的伴侣"${ctx.myNickname}"记了一笔${typeLabel}："${data.itemTitle}"，金额¥${data.itemAmount}，并点了爱心。
你会不会也想给这条记录点爱心？考虑你的性格和你们的关系。
请只回答 "yes" 或 "no"，不要其他内容。`;
    const isGemini = proxyUrl === GEMINI_API_URL;
    let response;
    if (isGemini) {
      const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '你要点爱心吗？' }]);
      response = await fetch(geminiConfig.url, geminiConfig.data);
    } else {
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: '你要点爱心吗？' }], temperature: 0.7 })
      });
    }
    if (!response.ok) return;
    const respData = await response.json();
    const answer = getGeminiResponseText(respData).trim().toLowerCase();
    iframe.contentWindow.postMessage({
      type: 'coupleSpaceFinanceHeartResult',
      itemId: data.itemId,
      liked: answer.includes('yes')
    }, '*');
  } catch(e) {
    console.error('Finance heart AI error:', e);
  }
}

async function generateCoupleSpaceFinanceAi(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');
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
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    const requestBody = JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: state.globalSettings.apiTemperature || 0.8
    });
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: requestBody
    });
  }

  if (!response.ok) throw new Error('API请求失败: ' + response.status);
  const respData = await response.json();
  const raw = getGeminiResponseText(respData).replace(/^```json\s*/, '').replace(/```$/, '').trim();
  return JSON.parse(raw);
}

async function generateCoupleSpaceFinanceComment(chat, data) {
  const { proxyUrl, apiKey, model } = state.apiConfig;
  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');
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
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: state.globalSettings.apiTemperature || 0.8
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
        checkAndRunMissed(settings.autoTime, 'coupleFinanceAutoLast_' + space.charId, () => triggerAutoFinancePost(space.charId));
        scheduleFinanceAutoPost(space.charId, settings.autoTime);
      }
    } catch(e) {}
  });
}

function scheduleFinanceAutoPost(charId, timeStr) {
  coupleSpaceFinanceTimers[charId] = setInterval(() => {
    checkAndRunMissed(timeStr, 'coupleFinanceAutoLast_' + charId, () => triggerAutoFinancePost(charId));
  }, 60000);
}

async function triggerAutoFinancePost(charId) {
  const chat = state.chats[charId];
  if (!chat) return;
  const settings = JSON.parse(localStorage.getItem('coupleFinanceSettings_' + charId) || '{}');

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
      date: new Date().toISOString().split('T')[0],
      author: 'char',
      createdAt: Date.now(),
      hearts: { char: true },
      comments: []
    };
    existingItems.push(newItem);
    localStorage.setItem('coupleFinance_' + charId, JSON.stringify(existingItems));
    const iframe = document.getElementById('couple-space-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'coupleSpaceFinanceAutoResult', item: newItem }, '*');
    }
  } catch(err) {
    console.error('Auto finance post failed:', err);
  }
}

// Initialize finance timers
if (typeof setTimeout !== 'undefined') {
  setTimeout(setupCoupleSpaceFinanceAutoTimer, 13000);
}