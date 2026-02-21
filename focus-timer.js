// focus-timer.js - 番茄钟专注陪伴功能

/**
 * 全局变量
 */
let focusTimer = null;
let focusStartTime = null;
let focusDuration = 25 * 60; // 默认25分钟（秒）
let focusElapsed = 0;
let focusIsRunning = false;
let focusIsBreak = false;
let focusCompanionId = null;
let focusSessionId = null;

/**
 * 安全显示提示
 */
function showFocusToast(message, type = 'info') {
  if (typeof showToast === 'function') {
    showToast(message, type);
  } else {
    alert(message);
  }
}

/**
 * 安全的 HTML 转义
 */
function escapeFocusHTML(str) {
  if (typeof escapeHTML === 'function') {
    return escapeHTML(str);
  }
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 打开番茄钟应用
 */
async function openFocusTimer() {
  console.log('打开番茄钟应用...');
  showScreen('focus-timer-screen');
  
  // 加载保存的陪伴角色
  const savedCompanionId = localStorage.getItem('focusCompanionId');
  if (savedCompanionId) {
    focusCompanionId = parseInt(savedCompanionId);
    await renderFocusCompanion();
  }
  
  // 渲染界面
  await renderFocusTimer();
  
  // 加载今日统计
  await updateFocusStats();
}

/**
 * 渲染番茄钟主界面
 */
async function renderFocusTimer() {
  const container = document.getElementById('focus-timer-content');
  if (!container) return;
  
  const stats = await getFocusStats();
  
  let html = `
    <div class="focus-timer-main">
      <div class="focus-companion-section">
        <div class="focus-companion-label">陪伴角色</div>
        <div id="focus-companion-display" class="focus-companion-display" onclick="selectFocusCompanion()">
          ${focusCompanionId ? '' : '<div class="focus-no-companion">点击选择陪伴角色</div>'}
        </div>
      </div>
      
      <div class="focus-timer-display">
        <svg class="focus-timer-circle" viewBox="0 0 200 200">
          <circle class="focus-timer-bg" cx="100" cy="100" r="90" />
          <circle class="focus-timer-progress" cx="100" cy="100" r="90" 
                  id="focus-progress-circle" />
        </svg>
        <div class="focus-timer-time" id="focus-timer-time">25:00</div>
      </div>
      
      <div class="focus-controls">
        <button class="focus-btn focus-btn-primary" id="focus-start-btn" onclick="toggleFocus()">
          开始专注
        </button>
        <button class="focus-btn focus-btn-secondary" onclick="resetFocus()">
          重置
        </button>
        <button class="focus-btn focus-btn-secondary" onclick="showFocusSettings()">
          设置
        </button>
      </div>
      
      <div class="focus-stats">
        <div class="focus-stat-item">
          <div class="focus-stat-label">今日完成</div>
          <div class="focus-stat-value">${stats.todayCount}个</div>
        </div>
        <div class="focus-stat-item">
          <div class="focus-stat-label">连续天数</div>
          <div class="focus-stat-value">${stats.streakDays}天</div>
        </div>
        <div class="focus-stat-item">
          <div class="focus-stat-label">总计</div>
          <div class="focus-stat-value">${stats.totalCount}个</div>
        </div>
      </div>
      
      <div class="focus-messages-section">
        <div class="focus-messages-header">
          <span>角色消息</span>
          <button class="focus-call-btn" onclick="callFocusCompanion()" 
                  ${!focusCompanionId ? 'disabled' : ''}>
            呼叫TA
          </button>
        </div>
        <div class="focus-messages-list" id="focus-messages-list">
          <div class="focus-no-messages">暂无消息</div>
        </div>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // 如果有陪伴角色，渲染角色信息
  if (focusCompanionId) {
    await renderFocusCompanion();
  }
  
  // 加载历史消息
  await loadFocusMessages();
}

/**
 * 渲染陪伴角色信息
 */
async function renderFocusCompanion() {
  if (!focusCompanionId) return;
  
  const chat = await db.chats.get(focusCompanionId);
  if (!chat) return;
  
  const display = document.getElementById('focus-companion-display');
  if (!display) return;
  
  display.innerHTML = `
    <div class="focus-companion-card" onclick="selectFocusCompanion()">
      <img src="${chat.settings?.aiAvatar || 'https://i.postimg.cc/qRqpK5kP/anime-avatar.jpg'}" 
           class="focus-companion-avatar">
      <div class="focus-companion-info">
        <div class="focus-companion-name">${chat.name}</div>
        <div class="focus-companion-status">点击更换</div>
      </div>
    </div>
  `;
}

/**
 * 选择陪伴角色
 */
async function selectFocusCompanion() {
  const characters = await db.chats.filter(chat => !chat.isGroup).toArray();
  
  console.log('[selectFocusCompanion] 角色列表:', characters);
  
  if (characters.length === 0) {
    alert('您还没有创建任何角色，请先在聊天中创建角色');
    return;
  }
  
  // 显示角色选择弹窗
  const modal = document.getElementById('focus-companion-modal');
  const list = document.getElementById('focus-companion-list');
  
  let html = '';
  for (const char of characters) {
    const isSelected = char.id === focusCompanionId;
    console.log('[selectFocusCompanion] 角色:', char.name, 'ID:', char.id, '类型:', typeof char.id);
    html += `
      <div class="focus-companion-item ${isSelected ? 'selected' : ''}" 
           data-chat-id="${char.id}">
        <img src="${char.settings?.aiAvatar || 'https://i.postimg.cc/qRqpK5kP/anime-avatar.jpg'}" 
             class="focus-companion-item-avatar">
        <div class="focus-companion-item-info">
          <div class="focus-companion-item-name">${char.name}</div>
          <div class="focus-companion-item-desc">${char.originalName}</div>
        </div>
        ${isSelected ? '<div class="focus-companion-item-check">当前</div>' : ''}
      </div>
    `;
  }
  
  list.innerHTML = html;
  
  // 绑定点击事件
  const items = list.querySelectorAll('.focus-companion-item');
  items.forEach(item => {
    item.addEventListener('click', function() {
      const chatIdStr = this.getAttribute('data-chat-id');
      console.log('[selectFocusCompanion] 点击角色，data-chat-id:', chatIdStr, '类型:', typeof chatIdStr);
      
      // 尝试解析 ID
      let chatId;
      if (chatIdStr.includes('_')) {
        // 如果是字符串 ID，直接使用
        chatId = chatIdStr;
      } else {
        // 如果是数字，转换为数字
        chatId = parseInt(chatIdStr);
      }
      
      console.log('[selectFocusCompanion] 解析后的 chatId:', chatId, '类型:', typeof chatId);
      confirmFocusCompanion(chatId);
    });
  });
  
  modal.style.display = 'flex';
}

/**
 * 确认选择陪伴角色
 */
async function confirmFocusCompanion(chatId) {
  console.log('[confirmFocusCompanion] 选择角色 ID:', chatId);
  
  focusCompanionId = chatId;
  localStorage.setItem('focusCompanionId', chatId);
  
  console.log('[confirmFocusCompanion] 已更新 focusCompanionId:', focusCompanionId);
  
  // 关闭弹窗
  document.getElementById('focus-companion-modal').style.display = 'none';
  
  // 重新渲染
  await renderFocusCompanion();
  
  // 更新呼叫按钮状态
  const callBtn = document.querySelector('.focus-call-btn');
  if (callBtn) {
    callBtn.disabled = false;
    console.log('[confirmFocusCompanion] 已启用呼叫按钮');
  }
  
  showFocusToast('已选择陪伴角色');
}

/**
 * 关闭角色选择弹窗
 */
function closeFocusCompanionModal() {
  document.getElementById('focus-companion-modal').style.display = 'none';
}

/**
 * 开始/暂停专注
 */
async function toggleFocus() {
  console.log('[toggleFocus] focusCompanionId:', focusCompanionId);
  
  if (!focusCompanionId) {
    alert('请先选择陪伴角色');
    await selectFocusCompanion();
    return;
  }
  
  const btn = document.getElementById('focus-start-btn');
  
  if (focusIsRunning) {
    // 暂停
    pauseFocus();
    btn.textContent = '继续';
  } else {
    // 开始或继续
    if (focusElapsed === 0) {
      // 首次开始
      await startFocus();
      btn.textContent = '暂停';
    } else {
      // 继续
      resumeFocus();
      btn.textContent = '暂停';
    }
  }
}

/**
 * 开始专注
 */
async function startFocus() {
  focusIsRunning = true;
  focusStartTime = Date.now();
  focusElapsed = 0;
  
  // 创建会话记录
  focusSessionId = await db.focusSessions.add({
    companionId: focusCompanionId,
    startTime: new Date().toISOString(),
    duration: focusDuration,
    completed: false,
    stage: 'running'
  });
  
  // 启动计时器
  focusTimer = setInterval(updateFocusTimer, 1000);
  
  // 调用角色鼓励
  await callFocusCompanionAuto('start');
}

/**
 * 暂停专注
 */
function pauseFocus() {
  focusIsRunning = false;
  if (focusTimer) {
    clearInterval(focusTimer);
    focusTimer = null;
  }
}

/**
 * 继续专注
 */
function resumeFocus() {
  focusIsRunning = true;
  focusStartTime = Date.now() - (focusElapsed * 1000);
  focusTimer = setInterval(updateFocusTimer, 1000);
}

/**
 * 重置专注
 */
async function resetFocus() {
  if (focusIsRunning && focusElapsed > 0) {
    if (!confirm('确定要放弃当前专注吗？')) {
      return;
    }
    
    // 调用角色安慰
    await callFocusCompanionAuto('giveup');
  }
  
  // 停止计时器
  if (focusTimer) {
    clearInterval(focusTimer);
    focusTimer = null;
  }
  
  focusIsRunning = false;
  focusElapsed = 0;
  
  // 更新显示
  updateFocusDisplay(focusDuration);
  
  // 更新按钮
  const btn = document.getElementById('focus-start-btn');
  if (btn) {
    btn.textContent = '开始专注';
  }
  
  // 更新进度圈
  updateFocusProgress(0);
}

/**
 * 更新计时器
 */
function updateFocusTimer() {
  if (!focusIsRunning) return;
  
  focusElapsed = Math.floor((Date.now() - focusStartTime) / 1000);
  
  const remaining = focusDuration - focusElapsed;
  
  if (remaining <= 0) {
    // 完成
    onFocusComplete();
    return;
  }
  
  // 更新显示
  updateFocusDisplay(remaining);
  
  // 更新进度
  const progress = (focusElapsed / focusDuration) * 100;
  updateFocusProgress(progress);
  
  // 中途提醒（10分钟和20分钟）
  if (focusElapsed === 10 * 60 || focusElapsed === 20 * 60) {
    callFocusCompanionAuto('during');
  }
}

/**
 * 更新时间显示
 */
function updateFocusDisplay(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  
  const display = document.getElementById('focus-timer-time');
  if (display) {
    display.textContent = timeStr;
  }
}

/**
 * 更新进度圈
 */
function updateFocusProgress(percent) {
  const circle = document.getElementById('focus-progress-circle');
  if (!circle) return;
  
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  
  circle.style.strokeDasharray = `${circumference} ${circumference}`;
  circle.style.strokeDashoffset = offset;
}

/**
 * 完成专注
 */
async function onFocusComplete() {
  // 停止计时器
  if (focusTimer) {
    clearInterval(focusTimer);
    focusTimer = null;
  }
  
  focusIsRunning = false;
  
  // 更新会话记录
  if (focusSessionId) {
    await db.focusSessions.update(focusSessionId, {
      endTime: new Date().toISOString(),
      completed: true,
      stage: 'completed'
    });
  }
  
  // 更新统计
  await incrementFocusStats();
  
  // 重新加载统计
  await updateFocusStats();
  
  // 调用角色庆祝
  await callFocusCompanionAuto('complete');
  
  // 重置界面
  focusElapsed = 0;
  updateFocusDisplay(focusDuration);
  updateFocusProgress(0);
  
  const btn = document.getElementById('focus-start-btn');
  if (btn) {
    btn.textContent = '开始专注';
  }
  
  // 询问是否休息
  setTimeout(() => {
    if (confirm('完成一个番茄钟！是否开始5分钟休息？')) {
      startBreak();
    }
  }, 1000);
}

/**
 * 开始休息
 */
async function startBreak() {
  focusIsBreak = true;
  focusDuration = 5 * 60; // 5分钟休息
  focusElapsed = 0;
  
  await startFocus();
  
  // 调用角色提醒休息
  await callFocusCompanionAuto('break');
}

/**
 * 获取角色的世界书内容
 */
async function getWorldBookContentForFocus(chat) {
  try {
    let worldBookContent = '';
    
    // 获取所有应该使用的世界书ID
    let allWorldBookIds = [...(chat.settings.linkedWorldBookIds || [])];
    
    // 添加全局世界书
    const allWorldBooks = await db.worldBooks.toArray();
    allWorldBooks.forEach(wb => {
      if (wb.isGlobal && !allWorldBookIds.includes(wb.id)) {
        allWorldBookIds.push(wb.id);
      }
    });
    
    if (allWorldBookIds.length > 0) {
      const linkedBooks = await db.worldBooks.where('id').anyOf(allWorldBookIds).toArray();
      const linkedContents = linkedBooks.map(wb => {
        if (!wb.entries || wb.entries.length === 0) return '';
        return wb.entries.map(entry => entry.content).join('\n\n');
      }).filter(Boolean).join('\n\n');
      
      if (linkedContents) {
        worldBookContent = linkedContents;
      }
    }
    
    return worldBookContent;
  } catch (error) {
    console.error('获取世界书失败:', error);
    return '';
  }
}

/**
 * 构建番茄钟提示词
 */
async function buildFocusPrompt(stage, focusData) {
  const chat = await db.chats.get(focusCompanionId);
  if (!chat) return null;
  
  const myNickname = localStorage.getItem('myNickname') || '我';
  
  // 获取世界书
  const worldBookContent = await getWorldBookContentForFocus(chat);
  
  // 获取长期记忆
  const longTermMemoryText = chat.longTermMemory && chat.longTermMemory.length > 0 
    ? chat.longTermMemory.map(mem => `- ${mem.content}`).join('\n') 
    : '- (暂无)';
  
  // 获取最近聊天记录
  const recentMessages = await getRecentMessagesForFocus(chat, 20);
  const chatHistoryText = recentMessages.map(msg => {
    const sender = msg.sender === 'user' ? myNickname : chat.name;
    return `${sender}: ${msg.content}`;
  }).join('\n');
  
  // 根据阶段构建情景描述
  let stagePrompt = '';
  
  switch(stage) {
    case 'start':
      stagePrompt = `# 【当前情景】
${myNickname} 刚刚开启了一个 ${focusData.duration}分钟 的番茄钟专注计时。
- 今日已完成: ${focusData.todayCount} 个番茄钟
- 连续天数: ${focusData.streakDays} 天
${focusData.isFirstTime ? '- 这是TA第一次使用番茄钟功能！' : ''}

# 【你的任务】
给 ${myNickname} 加油打气，鼓励TA开始专注。

按照你的性格，想说什么就说什么。`;
      break;
      
    case 'during':
      stagePrompt = `# 【当前情景】
${myNickname} 正在专注中，已经过去了 ${focusData.elapsedMinutes}分钟，还剩 ${focusData.remainingMinutes}分钟。

# 【你的任务】
TA正在专注，你想对TA说点什么吗？

按照你的性格，想说什么就说什么，或者不说也行。`;
      break;
      
    case 'complete':
      stagePrompt = `# 【当前情景】
${myNickname} 刚刚完成了一个 ${focusData.duration}分钟 的番茄钟！
- 今日已完成: ${focusData.todayCount} 个番茄钟
- 连续天数: ${focusData.streakDays} 天
${focusData.isNewRecord ? '- 这是TA的新纪录！' : ''}
${focusData.isMultipleComplete ? `- 连续完成了 ${focusData.consecutiveCount} 个番茄钟！` : ''}

# 【你的任务】
${myNickname} 完成了番茄钟，对此做出反应。

按照你的性格，想说什么就说什么。`;
      break;
      
    case 'giveup':
      stagePrompt = `# 【当前情景】
${myNickname} 在专注了 ${focusData.elapsedMinutes}分钟 后选择了放弃。

# 【你的任务】
对 ${myNickname} 放弃专注做出反应。

按照你的性格，想说什么就说什么。`;
      break;
      
    case 'break':
      stagePrompt = `# 【当前情景】
${myNickname} 刚刚完成了一个番茄钟，现在进入 ${focusData.breakDuration}分钟 的休息时间。

# 【你的任务】
提醒 ${myNickname} 休息。

按照你的性格，想说什么就说什么。`;
      break;
  }
  
  // 组装完整提示词
  const fullPrompt = `# 【番茄钟专注陪伴模式】

# 【你是谁】
**你的真实身份是：${chat.originalName}**

## 你的核心设定 (Persona)
${chat.settings.aiPersona}

## 世界观法则 (World Book)
${worldBookContent || '(当前无特殊世界观设定，以现实逻辑为准)'}

## 你的长期记忆
${longTermMemoryText}

## 关键关系
- **你的本名**: "${chat.originalName}"
- **我对你的备注**: "${chat.name}"
- **我的昵称**: "${myNickname}"
- **我的人设**: ${chat.settings.myPersona || '普通用户'}

---

${stagePrompt}

---

# 【最近的聊天记录】（供参考）
${chatHistoryText || '(暂无最近聊天记录)'}

---

现在，作为 **${chat.originalName}**，回复吧：`;

  return fullPrompt;
}

/**
 * 获取最近聊天记录
 */
async function getRecentMessagesForFocus(chat, limit = 20) {
  try {
    // 消息存储在 chat.history 中
    if (!chat.history || chat.history.length === 0) {
      return [];
    }
    
    // 获取最近的消息
    const recentHistory = chat.history.slice(-limit);
    
    return recentHistory;
  } catch (error) {
    console.error('获取聊天记录失败:', error);
    return [];
  }
}

/**
 * 自动调用角色（系统触发）
 */
async function callFocusCompanionAuto(stage) {
  if (!focusCompanionId) return;
  
  const stats = await getFocusStats();
  const focusData = {
    duration: Math.floor(focusDuration / 60),
    todayCount: stats.todayCount,
    streakDays: stats.streakDays,
    totalCount: stats.totalCount,
    isFirstTime: stats.totalCount === 0,
    elapsedMinutes: Math.floor(focusElapsed / 60),
    remainingMinutes: Math.floor((focusDuration - focusElapsed) / 60),
    isNewRecord: false, // TODO: 判断是否新纪录
    isMultipleComplete: false, // TODO: 判断是否连续完成
    consecutiveCount: 0,
    breakDuration: 5
  };
  
  const prompt = await buildFocusPrompt(stage, focusData);
  if (!prompt) return;
  
  try {
    // 调用 API
    const response = await callFocusAPI(prompt);
    
    // 保存消息
    await saveFocusMessage(stage, response);
    
    // 显示消息
    displayFocusMessage(response);
    
  } catch (error) {
    console.error('调用角色失败:', error);
  }
}

/**
 * 手动呼叫角色（用户点击按钮）
 */
async function callFocusCompanion() {
  console.log('[callFocusCompanion] focusCompanionId:', focusCompanionId);
  
  if (!focusCompanionId) {
    alert('请先选择陪伴角色');
    return;
  }
  
  const stats = await getFocusStats();
  const stage = focusIsRunning ? 'during' : 'idle';
  
  const focusData = {
    duration: Math.floor(focusDuration / 60),
    todayCount: stats.todayCount,
    streakDays: stats.streakDays,
    totalCount: stats.totalCount,
    isFirstTime: stats.totalCount === 0,
    elapsedMinutes: Math.floor(focusElapsed / 60),
    remainingMinutes: Math.floor((focusDuration - focusElapsed) / 60),
    isNewRecord: false,
    isMultipleComplete: false,
    consecutiveCount: 0,
    breakDuration: 5
  };
  
  const prompt = await buildFocusPrompt(stage, focusData);
  if (!prompt) return;
  
  try {
    showFocusToast('正在呼叫...');
    
    // 调用 API
    const response = await callFocusAPI(prompt);
    
    // 保存消息
    await saveFocusMessage('manual', response);
    
    // 显示消息
    displayFocusMessage(response);
    
  } catch (error) {
    console.error('呼叫角色失败:', error);
    showFocusToast('呼叫失败，请重试', 'error');
  }
}

/**
 * 调用 API
 */
async function callFocusAPI(prompt) {
  try {
    // 从 IndexedDB 获取 API 配置
    if (!window.db) {
      throw new Error('数据库未初始化');
    }
    
    const apiConfig = await window.db.apiConfig.get('main');
    
    if (!apiConfig) {
      throw new Error('请先在设置中配置 API');
    }
    
    const proxyUrl = apiConfig.proxyUrl;
    const apiKey = apiConfig.apiKey;
    const model = apiConfig.model;
    
    if (!proxyUrl || !apiKey || !model) {
      throw new Error('请先在设置中配置 API');
    }
    
    console.log('[callFocusAPI] 使用配置:', { proxyUrl, model });
    
    const response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.8
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[callFocusAPI] API 错误:', errorText);
      throw new Error(`API 调用失败: ${response.status}`);
    }
    
    const data = await response.json();
    
    // 处理不同的响应格式
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    }
    
    throw new Error('API 返回格式错误');
  } catch (error) {
    console.error('[callFocusAPI] 错误:', error);
    throw error;
  }
}

/**
 * 保存消息
 */
async function saveFocusMessage(stage, message) {
  await db.focusMessages.add({
    sessionId: focusSessionId,
    companionId: focusCompanionId,
    stage: stage,
    message: message,
    timestamp: new Date().toISOString()
  });
}

/**
 * 显示消息
 */
function displayFocusMessage(message) {
  const list = document.getElementById('focus-messages-list');
  if (!list) return;
  
  // 移除"暂无消息"提示
  const noMsg = list.querySelector('.focus-no-messages');
  if (noMsg) {
    noMsg.remove();
  }
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'focus-message-item';
  msgDiv.innerHTML = `
    <div class="focus-message-time">${new Date().toLocaleTimeString()}</div>
    <div class="focus-message-content">${escapeFocusHTML(message)}</div>
  `;
  
  list.appendChild(msgDiv);
  list.scrollTop = list.scrollHeight;
}

/**
 * 加载历史消息
 */
async function loadFocusMessages() {
  if (!focusCompanionId) return;
  
  const messages = await db.focusMessages
    .where('companionId')
    .equals(focusCompanionId)
    .reverse()
    .limit(10)
    .toArray();
  
  const list = document.getElementById('focus-messages-list');
  if (!list) return;
  
  if (messages.length === 0) {
    list.innerHTML = '<div class="focus-no-messages">暂无消息</div>';
    return;
  }
  
  list.innerHTML = '';
  messages.reverse().forEach(msg => {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'focus-message-item';
    msgDiv.innerHTML = `
      <div class="focus-message-time">${new Date(msg.timestamp).toLocaleTimeString()}</div>
      <div class="focus-message-content">${escapeFocusHTML(msg.message)}</div>
    `;
    list.appendChild(msgDiv);
  });
}

/**
 * 获取统计数据
 */
async function getFocusStats() {
  let stats = await db.focusStats.get('main');
  
  if (!stats) {
    stats = {
      id: 'main',
      todayCount: 0,
      totalCount: 0,
      streakDays: 0,
      lastFocusDate: null
    };
    await db.focusStats.add(stats);
  }
  
  // 检查日期，如果不是今天则重置今日计数
  const today = new Date().toDateString();
  if (stats.lastFocusDate !== today) {
    stats.todayCount = 0;
  }
  
  return stats;
}

/**
 * 更新统计显示
 */
async function updateFocusStats() {
  const stats = await getFocusStats();
  
  const statItems = document.querySelectorAll('.focus-stat-value');
  if (statItems.length >= 3) {
    statItems[0].textContent = `${stats.todayCount}个`;
    statItems[1].textContent = `${stats.streakDays}天`;
    statItems[2].textContent = `${stats.totalCount}个`;
  }
}

/**
 * 增加统计计数
 */
async function incrementFocusStats() {
  const stats = await getFocusStats();
  const today = new Date().toDateString();
  
  stats.todayCount++;
  stats.totalCount++;
  
  // 更新连续天数
  if (stats.lastFocusDate) {
    const lastDate = new Date(stats.lastFocusDate);
    const todayDate = new Date(today);
    const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      stats.streakDays++;
    } else if (diffDays > 1) {
      stats.streakDays = 1;
    }
  } else {
    stats.streakDays = 1;
  }
  
  stats.lastFocusDate = today;
  
  await db.focusStats.put(stats);
}

/**
 * 显示设置弹窗
 */
function showFocusSettings() {
  const modal = document.getElementById('focus-settings-modal');
  
  // 加载当前设置
  document.getElementById('focus-duration-input').value = focusDuration / 60;
  
  modal.style.display = 'flex';
}

/**
 * 关闭设置弹窗
 */
function closeFocusSettings() {
  document.getElementById('focus-settings-modal').style.display = 'none';
}

/**
 * 保存设置
 */
function saveFocusSettings() {
  const duration = parseInt(document.getElementById('focus-duration-input').value);
  
  if (duration < 1 || duration > 120) {
    alert('请输入1-120之间的数字');
    return;
  }
  
  focusDuration = duration * 60;
  localStorage.setItem('focusDuration', focusDuration);
  
  // 更新显示
  updateFocusDisplay(focusDuration);
  
  closeFocusSettings();
  showFocusToast('设置已保存');
}

// 初始化：加载保存的时长设置
const savedDuration = localStorage.getItem('focusDuration');
if (savedDuration) {
  focusDuration = parseInt(savedDuration);
}
