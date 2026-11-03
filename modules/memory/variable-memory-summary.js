// ===== 变量记忆总结模式选择菜单 =====
async function openVectorSummaryMenu(chat) {
  const vm = window.vectorMemoryManager.getVariableMemory(chat);
  const lastIdx = vm.settings.lastExtractedMsgIndex !== undefined ? vm.settings.lastExtractedMsgIndex : -1;
  const historyLen = chat.history ? chat.history.length : 0;
  const newMessagesCount = (chat.history || []).slice(lastIdx + 1).filter(window.MemoryExtractionSupport.eligible).length;
  const totalMessages = historyLen;

  return new Promise(resolve => {
    window._modalResolve = (result) => { resolve(result); };
    window._modalTitle.textContent = '选择总结模式';

    const options = [
      {
        id: 'new-messages',
        title: '新消息提取',
        description: '提取上次之后的新消息',
        info: `待处理消息：${newMessagesCount} 条`
      },
      {
        id: 'range',
        title: '范围提取',
        description: '指定消息范围进行提取',
        info: `总消息数：${totalMessages} 条`
      },
      {
        id: 'reset',
        title: '重置提取进度',
        description: '重置后下次对话将从头提取',
        info: `当前进度索引：${lastIdx}`
      },
      {
        id: 'repair-dates', title: '修复记忆日期',
        description: '按原文日期修复；无依据的标为时间不明。修复前保存备份。',
        info: '本地处理，不调用模型'
      },
      {
        id: 'restore-dates', title: '撤销上次日期修复',
        description: '恢复上次修复前的日期，不删除后来新增的记忆',
        info: vm.dateRepairBackups?.length ? '有可恢复备份' : '暂无修复备份'
      }
    ];

    const optionsHtml = options.map(opt => `
      <label class="summary-mode-option">
        <input type="radio" name="summary-mode" value="${opt.id}">
        <div class="option-content">
          <div class="option-title">${opt.title}</div>
          <div class="option-description">${opt.description}</div>
          <div class="option-info">${opt.info}</div>
        </div>
      </label>
    `).join('');

    window._modalBody.innerHTML = `<div class="summary-mode-selector">${optionsHtml}</div>`;

    const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');
    if (modalFooter) {
      modalFooter.style.flexDirection = 'row';
      modalFooter.style.justifyContent = 'flex-end';
      modalFooter.innerHTML = `
        <button id="custom-modal-cancel">取消</button>
        <button id="custom-modal-confirm" class="confirm-btn">确定</button>
      `;
    }

    const confirmBtn = document.getElementById('custom-modal-confirm');
    const cancelBtn = document.getElementById('custom-modal-cancel');
    cancelBtn.style.display = 'block';

    confirmBtn.onclick = async () => {
      const selectedMode = document.querySelector('input[name="summary-mode"]:checked');
      if (selectedMode) {
        hideCustomModal();
        const mode = selectedMode.value;
        switch (mode) {
          case 'new-messages':
            await handleVectorNewMessagesSummary(chat);
            break;
          case 'range':
            await handleVectorRangeSummary(chat);
            break;
          case 'reset':
            await handleVectorResetTimestamp(chat);
            break;
          case 'repair-dates':
            await handleVectorDateRepair(chat);
            break;
          case 'restore-dates':
            await handleVectorDateRestore(chat);
            break;
        }
      } else {
        showToast('请选择一个模式', 'info');
      }
    };

    cancelBtn.onclick = () => { hideCustomModal(); };
    showCustomModal();
  });
}

// ===== 变量记忆 - 新消息提取 =====
async function handleVectorNewMessagesSummary(chat) {
  const vm = window.vectorMemoryManager.getVariableMemory(chat);
  const lastIdx = vm.settings.lastExtractedMsgIndex !== undefined ? vm.settings.lastExtractedMsgIndex : -1;
  const historyLen = chat.history ? chat.history.length : 0;
  
  if (lastIdx + 1 >= historyLen) {
    showToast('暂无新消息需要提取', 'info');
    return;
  }

  const newMessages = chat.history.slice(lastIdx + 1).filter(m => !m?.isHidden || (m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('内心独白')));

  if (newMessages.length < 5) {
    const confirmed = await showCustomConfirm(
      '消息较少',
      `只有 ${newMessages.length} 条新消息，建议至少5条以上才能进行有意义的提取。\n\n是否继续？`
    );
    if (!confirmed) return;
  }

  showToast(`正在提取 ${newMessages.length} 条新消息...`, 'info');
  try {
    await executeVectorExtractionInBatches(chat, newMessages, true);
  } catch (error) {
    console.error('[变量记忆-新消息提取] 错误:', error);
    showToast('提取失败：' + error.message, 'error');
  }
}

// ===== 变量记忆 - 范围提取 =====
async function handleVectorRangeSummary(chat) {
  const totalMessages = chat.history.length;

  return new Promise(resolve => {
    window._modalResolve = resolve;
    window._modalTitle.textContent = '范围提取（变量记忆）';

    window._modalBody.innerHTML = `
      <div class="range-summary-form">
        <p style="margin-bottom: 15px; color: var(--text-secondary, #666);">
          当前共有 ${totalMessages} 条消息
        </p>
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 5px; font-size: 13px;">起始消息序号：</label>
          <input type="number" id="range-start" min="1" max="${totalMessages}" value="1" 
                 style="width: 100%; padding: 8px; border: 1px solid var(--border-color, #ddd); border-radius: 8px;">
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 5px; font-size: 13px;">结束消息序号：</label>
          <input type="number" id="range-end" min="1" max="${totalMessages}" value="${totalMessages}" 
                 style="width: 100%; padding: 8px; border: 1px solid var(--border-color, #ddd); border-radius: 8px;">
        </div>
        <div style="margin-top: 15px;">
          <label style="display: flex; align-items: center; font-size: 13px; cursor: pointer;">
            <input type="checkbox" id="update-timestamp" style="margin-right: 8px;">
            <span>更新提取进度（勾选后将覆盖当前提取进度）</span>
          </label>
        </div>
      </div>
    `;

    const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');
    if (modalFooter) {
      modalFooter.style.flexDirection = 'row';
      modalFooter.style.justifyContent = 'flex-end';
      modalFooter.innerHTML = `
        <button id="custom-modal-cancel">取消</button>
        <button id="custom-modal-confirm" class="confirm-btn">开始提取</button>
      `;
    }

    const confirmBtn = document.getElementById('custom-modal-confirm');
    const cancelBtn = document.getElementById('custom-modal-cancel');
    cancelBtn.style.display = 'block';

    confirmBtn.onclick = async () => {
      const start = parseInt(document.getElementById('range-start').value);
      const end = parseInt(document.getElementById('range-end').value);
      const updateTimestamp = document.getElementById('update-timestamp').checked;

      if (isNaN(start) || isNaN(end) || start < 1 || end > totalMessages || start > end) {
        showToast('无效的消息范围', 'error');
        return;
      }

      hideCustomModal();

      const rangeMessages = chat.history.slice(start - 1, end);
      const validMessages = rangeMessages.filter(m => !m.isHidden || (m.role === 'system' && m.content && m.content.includes('内心独白')));

      if (validMessages.length === 0) {
        showToast('选定范围内没有有效消息', 'info');
        return;
      }

      showToast(`正在提取第 ${start}-${end} 条消息...`, 'info');
      try {
        await executeVectorExtractionInBatches(chat, validMessages, updateTimestamp);
      } catch (error) {
        console.error('[变量记忆-范围提取] 错误:', error);
        showToast('提取失败：' + error.message, 'error');
      }
    };

    cancelBtn.onclick = () => { hideCustomModal(); };
    showCustomModal();
  });
}

// ===== 变量记忆 - 重置进度 =====
async function handleVectorResetTimestamp(chat) {
  if (window.vectorMemoryManager._extractionLocks.get(chat)) { showToast('请先暂停或取消当前提取', 'info'); return; }
  const vm = window.vectorMemoryManager.getVariableMemory(chat);
  const lastIdx = vm.settings.lastExtractedMsgIndex !== undefined ? vm.settings.lastExtractedMsgIndex : -1;
  const totalMessages = chat.history.length;
  const newMessagesCount = Math.max(0, totalMessages - 1 - lastIdx);

  const message = `当前状态：
- 当前进度索引：${lastIdx}
- 总消息数：${totalMessages}
- 待处理消息：${newMessagesCount}

重置后下次对话将从头重新提取所有消息。

确定要重置吗？`;

  const confirmed = await showCustomConfirm('确认重置', message);
  if (confirmed) {
    vm.settings.lastExtractedMsgIndex = -1;
    vm.settings.lastExtractedSourceKey = '';
    vm.settings.extractionProgressError = '';
    vm.settings.autoExtractionBlocked = false;
    vm.settings.autoExtractionPending = false;
    if (vm.extractionTask) vm.extractionTask.status = 'cancelled';
    await db.chats.put(chat);
    showToast('已重置进度，下次将重新提取', 'success');
  }
}

async function handleVectorDateRepair(chat) {
  const manager = window.vectorMemoryManager;
  if (manager._extractionLocks.get(chat)) { showToast('请先结束当前提取', 'info'); return; }
  const vm = manager.getVariableMemory(chat);
  const changes = window.MemoryExtractionSupport.repairDates(vm.fragments, chat.history);
  if (!changes.length) { showToast('没有需要修复的日期', 'info'); return; }
  const unknown = changes.filter(change => change.memoryTime === null).length;
  const preview = changes.slice(0, 5).map(change => {
    const fragment = vm.fragments.find(item => item.id === change.id);
    return `${fragment.content.slice(0, 60)}\n${window.MemoryExtractionSupport.formatTime(fragment)} → ${window.MemoryExtractionSupport.formatTime(change)}`;
  }).join('\n\n');
  const confirmed = await showCustomConfirm('修复记忆日期', `将修复${changes.length}条，其中${unknown}条没有可靠日期，将标为时间不明。修复前会保存日期备份，可在本菜单撤销。\n\n${preview}`);
  if (!confirmed) return;
  const fields = ['memoryTime', 'memoryTimeEnd', 'timeBasis', 'timePrecision', 'timeEvidence', 'eventTimeText'];
  const backup = { createdAt: Date.now(), dates: vm.fragments.map(fragment => ({ id: fragment.id, ...Object.fromEntries(fields.map(field => [field, fragment[field] ?? null])) })) };
  const previous = JSON.parse(JSON.stringify(vm));
  vm.dateRepairBackups = [...(vm.dateRepairBackups || []), backup];
  changes.forEach(change => Object.assign(vm.fragments.find(fragment => fragment.id === change.id), change));
  vm._retrievalCache = manager._emptyRetrievalCache();
  try { await db.chats.put(chat); }
  catch (error) { chat.variableMemory = previous; showToast('修复未保存：' + error.message, 'error'); return; }
  refreshVectorExtraction(chat);
  showToast(`已修复${changes.length}条日期，备份已保存`, 'success');
}

async function handleVectorDateRestore(chat) {
  const manager = window.vectorMemoryManager;
  if (manager._extractionLocks.get(chat)) { showToast('请先结束当前提取', 'info'); return; }
  const vm = manager.getVariableMemory(chat);
  const backup = vm.dateRepairBackups?.[vm.dateRepairBackups.length - 1];
  if (!backup) { showToast('暂无日期修复备份', 'info'); return; }
  if (!await showCustomConfirm('撤销日期修复', '恢复上次修复前的日期；后来新增的记忆保留。')) return;
  const previous = JSON.parse(JSON.stringify(vm));
  backup.dates.forEach(date => {
    const fragment = vm.fragments.find(item => item.id === date.id);
    if (fragment) Object.assign(fragment, date);
  });
  vm.dateRepairBackups.pop();
  vm._retrievalCache = manager._emptyRetrievalCache();
  try { await db.chats.put(chat); }
  catch (error) { chat.variableMemory = previous; showToast('恢复未保存：' + error.message, 'error'); return; }
  refreshVectorExtraction(chat);
  showToast('已撤销上次日期修复', 'success');
}

// ===== 兼容旧的自动总结调用 =====
async function triggerVectorMemorySummary(chatId, force = false) {
  const chat = state.chats[chatId];
  if (!chat || !window.vectorMemoryManager) return;
  if (window.GroupMemory?.independent(chat)) return force ? window.GroupMemory.summarize(chat) : window.GroupMemory.auto(chat);
  try {
    const vm = window.vectorMemoryManager.getVariableMemory(chat);
    const lastIdx = vm.settings.lastExtractedMsgIndex !== undefined ? vm.settings.lastExtractedMsgIndex : -1;
    const historyLen = chat.history ? chat.history.length : 0;

    let messagesToProcess;
    if (force) {
      const autoInterval = vm.settings.autoExtractionMsgInterval || 20;
      messagesToProcess = chat.history.filter(m => !m?.isHidden || (m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('内心独白'))).slice(-autoInterval);
    } else {
      if (lastIdx + 1 >= historyLen) return;
      messagesToProcess = chat.history.slice(lastIdx + 1).filter(m => !m?.isHidden || (m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('内心独白')));
    }

    if (messagesToProcess.length === 0) {
      if (!force && vm.settings.autoExtractionPending) {
        vm.settings.autoExtractionPending = false;
        await db.chats.put(chat);
      }
      if (force) showToast('没有新的对话需要提取', 'info');
      return;
    }

    await executeVectorExtractionInBatches(chat, messagesToProcess, !force);
    if (!force) {
      vm.settings.autoExtractionPending = false;
      await db.chats.put(chat);
    }
  } catch (e) {
    console.error('[变量记忆] 提取失败:', e);
    showToast('变量记忆提取失败: ' + e.message, 'error');
  }
}

window.triggerVectorMemorySummary = triggerVectorMemorySummary;

// 1. 修改 renderLongTermMemoryList (只负责准备数据和重置)
function renderLongTermMemoryList() {
  const container = document.getElementById('original-memory-list') || document.getElementById('memory-list-container');
  const chat = state.chats[state.activeChatId];
  window.normalMemoryManager?.renderEntry(chat);
  container.innerHTML = '';

  let memoriesToDisplay = [];

  if (chat.isGroup) {
    chat.members.forEach(member => {
      const memberChat = state.chats[member.id];
      if (memberChat && memberChat.longTermMemory) {
        const memberMemories = memberChat.longTermMemory.map(mem => ({
          ...mem,
          authorName: member.groupNickname,
          authorChatId: member.id,
          authorAvatar: member.avatar || (memberChat.settings.aiAvatar || defaultAvatar)
        }));
        memoriesToDisplay.push(...memberMemories);
      }
    });
  } else {
    if (chat.longTermMemory) {
      memoriesToDisplay = chat.longTermMemory.map(mem => ({
        ...mem,
        authorName: chat.name,
        authorChatId: chat.id,
        authorAvatar: chat.settings.aiAvatar || defaultAvatar
      }));
    }
  }

  if (memoriesToDisplay.length === 0) {
    container.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 50px;">这里还没有任何长期记忆。</p>';
    return;
  }

  // 按时间倒序
  memoriesToDisplay.sort((a, b) => b.timestamp - a.timestamp);

  // --- 核心修改：存入缓存，重置计数，调用分批加载 ---
  memoryCache = memoriesToDisplay;
  memoryRenderCount = 0;
  loadMoreMemories();
}

// 2. 新增 loadMoreMemories (负责分批渲染)
// 2. 新增 loadMoreMemories (负责分批渲染) - [修复版]
function loadMoreMemories() {
  // 1. 防止重复加载
  if (isLoadingMoreMemories) return;

  const container = document.getElementById('original-memory-list') || document.getElementById('memory-list-container');
  if (!container) return;

  // 2. 如果所有数据都已经渲染完了，直接返回
  if (memoryRenderCount >= memoryCache.length) return;

  // 加锁
  isLoadingMoreMemories = true;

  try {
    // 每次加载 20 条
    const BATCH_SIZE = 20;
    const nextSliceEnd = memoryRenderCount + BATCH_SIZE;
    const itemsToRender = memoryCache.slice(memoryRenderCount, nextSliceEnd);

    const fragment = document.createDocumentFragment();

    itemsToRender.forEach(memory => {
      const item = document.createElement('div');
      item.className = 'favorite-item-card';
      item.style.cursor = 'default';

      const date = new Date(memory.timestamp);
      const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      const avatarUrl = memory.authorAvatar || defaultAvatar;

      item.innerHTML = `
              <div class="fav-card-header">
                  <img src="${avatarUrl}" class="avatar" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">
                  <div class="info">
                      <div class="name" style="font-size: 15px;">${memory.authorName}</div>
                      <div class="source" style="font-size: 12px; color: #999;">${dateString}</div>
                  </div>
                  
                  <div style="display: flex; gap: 8px;">
                      ${memory.source === 'refined' && memory.originalMemories ? `
                      <button class="memory-action-btn restore-memory-btn" data-author-id="${memory.authorChatId}" data-memory-timestamp="${memory.timestamp}" data-normal-memory-id="${memory.normalMemoryId || ''}" title="还原旧记忆">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px; stroke: #28a745;">
                              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                              <path d="M3 3v5h5"></path>
                          </svg>
                      </button>
                      ` : ''}
                      <button class="memory-action-btn edit-memory-btn" data-author-id="${memory.authorChatId}" data-memory-timestamp="${memory.timestamp}" data-normal-memory-id="${memory.normalMemoryId || ''}" title="编辑">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                          </svg>
                      </button>
                      <button class="memory-action-btn delete-memory-btn" data-author-id="${memory.authorChatId}" data-memory-timestamp="${memory.timestamp}" data-normal-memory-id="${memory.normalMemoryId || ''}" title="删除">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px; stroke:#ff3b30;">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                      </button>
                  </div>
              </div>
              <div class="fav-card-content" style="margin-top: 5px;">${memory.content.replace(/\n/g, '<br>')}</div>
          `;
      fragment.appendChild(item);
    });

    container.appendChild(fragment);
    memoryRenderCount += itemsToRender.length;

    // 【修复关键点】：检查是否填满屏幕
    // 如果容器的内容高度 <= 容器可见高度（说明没有出现滚动条），且还有剩余数据
    // 立即请求加载下一页，直到填满屏幕出现滚动条为止
    if (container.scrollHeight <= container.clientHeight && memoryRenderCount < memoryCache.length) {
      isLoadingMoreMemories = false; // 临时解锁以便递归调用
      loadMoreMemories(); // 递归加载
      return; // 退出当前函数，由递归调用接管锁
    }

  } catch (error) {
    console.error("渲染长期记忆出错:", error);
  } finally {
    // 3. 无论成功还是出错，一定要解锁
    isLoadingMoreMemories = false;
  }
}


async function handleAddManualMemory() {
  const chat = state.chats[state.activeChatId];
  if (!chat) return;
  let targetChatForMemory = chat;
  if (chat.isGroup) {
    const memberOptions = chat.members.map(member => ({
      text: `为"${member.groupNickname}"添加记忆`,
      value: member.id
    }));
    const selectedMemberId = await showChoiceModal('选择记忆所属角色', memberOptions);
    if (!selectedMemberId) return;
    targetChatForMemory = state.chats[selectedMemberId];
    if (!targetChatForMemory) {
      alert("错误：找不到该成员的个人档案。");
      return;
    }
  }
  const content = await showCustomPrompt(`为"${targetChatForMemory.name}"添加记忆`, '请输入要添加的记忆要点：', '', 'textarea');
  if (content && content.trim()) {
    if (!targetChatForMemory.longTermMemory) targetChatForMemory.longTermMemory = [];
    const addedMemory = {
      content: content.trim(),
      timestamp: Date.now(),
      source: 'manual'
    };
    targetChatForMemory.longTermMemory.push(addedMemory);
    await db.chats.put(targetChatForMemory);
    window.normalMemoryManager?.afterSummary(targetChatForMemory, addedMemory, null, targetChatForMemory).catch(error => console.warn('[普通记忆]', error));
    renderLongTermMemoryList();
  }
}



async function handleEditMemory(authorChatId, memoryTimestamp, normalMemoryId = null) {
  const authorChat = state.chats[authorChatId];
  if (!authorChat || !authorChat.longTermMemory) return;
  const memoryIndex = authorChat.longTermMemory.findIndex(m => normalMemoryId ? m.normalMemoryId === normalMemoryId : m.timestamp === memoryTimestamp);
  if (memoryIndex === -1) return;
  const memory = authorChat.longTermMemory[memoryIndex];
  const newContent = await showCustomPrompt('编辑记忆', '请修改记忆要点：', memory.content, 'textarea');
  if (newContent && newContent.trim()) {
    memory.content = newContent.trim();
    await db.chats.put(authorChat);
    renderLongTermMemoryList();
  }
}

async function handleDeleteMemory(authorChatId, memoryTimestamp, normalMemoryId = null) {
  const confirmed = await showCustomConfirm('确认删除', '确定要删除这条长期记忆吗？', {
    confirmButtonClass: 'btn-danger'
  });
  if (confirmed) {
    const authorChat = state.chats[authorChatId];
    if (!authorChat || !authorChat.longTermMemory) return;
    authorChat.longTermMemory = authorChat.longTermMemory.filter(m => normalMemoryId ? m.normalMemoryId !== normalMemoryId : m.timestamp !== memoryTimestamp);
    await db.chats.put(authorChat);
    renderLongTermMemoryList();
  }
}



async function handleManualSummary() {
  const confirmed = await showCustomConfirm('确认操作', '这将提取最近的对话内容发送给AI进行总结，会消耗API额度。确定要继续吗？');
  if (confirmed) {
    const chat = state.chats[state.activeChatId];
    const memoryMode = chat ? (chat.settings.memoryMode || 'diary') : 'diary';
    
    if (memoryMode === 'vector' && window.vectorMemoryManager) {
      await triggerVectorMemorySummary(state.activeChatId, true);
    } else {
      await triggerAutoSummary(state.activeChatId, true);
      // 结构化模式或兼容旧开关
      if ((memoryMode === 'structured' || chat.settings.enableStructuredMemory) && window.structuredMemoryManager) {
        const structuredCount = await triggerStructuredMemorySummary(state.activeChatId, true);
        if (structuredCount > 0) showToast(`结构化记忆已同步更新（${structuredCount} 条）`, 'success');
        else if (structuredCount === 0) showToast('结构化记忆检查完成，没有需要新增的内容', 'info');
      }
    }
  }
}

