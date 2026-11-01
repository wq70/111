// ==================== 结构化记忆 - 总结菜单 ====================

// 打开总结模式选择菜单
async function openStructuredSummaryMenu(chat) {
  const debugInfo = window.structuredMemoryManager.getDebugInfo(chat);
  
  return new Promise(resolve => {
    window._modalResolve = (result) => {
      resolve(result);
    };
    
    window._modalTitle.textContent = '选择总结模式';
    
    const options = [
      {
        id: 'new-messages',
        title: '新消息总结',
        description: '总结上次之后的新消息',
        info: `待处理消息：${debugInfo.messagesAfterTimestamp} 条`
      },
      {
        id: 'range',
        title: '范围总结',
        description: '指定消息范围进行总结',
        info: `总消息数：${debugInfo.totalMessages} 条`
      },
      {
        id: 'reset',
        title: '重置时间戳',
        description: '重置后下次对话重新总结',
        info: `上次更新：${debugInfo.lastDate}`
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

    // 重建footer
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
            await handleNewMessagesSummary(chat);
            break;
          case 'range':
            await handleRangeSummary(chat);
            break;
          case 'reset':
            await handleResetTimestamp(chat);
            break;
        }
      } else {
        showToast('请选择一个模式', 'info');
      }
    };
    
    cancelBtn.onclick = () => {
      hideCustomModal();
    };
    
    showCustomModal();
  });
}

// 模式1：新消息总结
async function handleNewMessagesSummary(chat) {
  const lastTimestamp = chat.lastStructuredMemoryTimestamp || 0;
  const newMessages = (chat.history || []).filter(m => Number(m?.timestamp) > lastTimestamp && (!m?.isHidden || (m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('内心独白'))));

  if (newMessages.length === 0) {
    showToast('暂无新消息需要总结', 'info');
    return;
  }

  if (newMessages.length < 5) {
    const confirmed = await showCustomConfirm(
      '消息较少',
      `只有 ${newMessages.length} 条新消息，建议至少5条以上才能进行有意义的总结。\n\n是否继续？`
    );
    if (!confirmed) return;
  }

  showToast(`正在总结 ${newMessages.length} 条新消息...`, 'info');

  try {
    await executeStructuredSummary(chat, newMessages, true);
    renderStructuredMemoryView();
    showToast(`成功总结 ${newMessages.length} 条消息`, 'success');
  } catch (error) {
    console.error('[新消息总结] 错误:', error);
    showToast('总结失败：' + error.message, 'error');
  }
}

// 模式2：范围总结
async function handleRangeSummary(chat) {
  const totalMessages = chat.history.length;
  
  return new Promise(resolve => {
    window._modalResolve = resolve;
    window._modalTitle.textContent = '范围总结';
    
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
            <span>更新时间戳（勾选后将更新到结束消息的时间）</span>
          </label>
        </div>
      </div>
    `;

    // 重建footer
    const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');
    if (modalFooter) {
      modalFooter.style.flexDirection = 'row';
      modalFooter.style.justifyContent = 'flex-end';
      modalFooter.innerHTML = `
        <button id="custom-modal-cancel">取消</button>
        <button id="custom-modal-confirm" class="confirm-btn">开始总结</button>
      `;
    }

    const confirmBtn = document.getElementById('custom-modal-confirm');
    const cancelBtn = document.getElementById('custom-modal-cancel');

    cancelBtn.style.display = 'block';

    confirmBtn.onclick = async () => {
      const startInput = document.getElementById('range-start');
      const endInput = document.getElementById('range-end');
      const updateTimestampCheckbox = document.getElementById('update-timestamp');
      
      const start = parseInt(startInput.value);
      const end = parseInt(endInput.value);
      const updateTimestamp = updateTimestampCheckbox.checked;

      // 验证范围
      if (isNaN(start) || isNaN(end) || start < 1 || end > totalMessages || start > end) {
        showToast('无效的消息范围', 'error');
        return;
      }

      hideCustomModal();

      const rangeMessages = chat.history.slice(start - 1, end);
      const validMessages = rangeMessages.filter(m => !m?.isHidden || (m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('内心独白')));

      if (validMessages.length === 0) {
        showToast('选定范围内没有有效消息', 'info');
        return;
      }

      showToast(`正在总结第 ${start}-${end} 条消息...`, 'info');

      try {
        await executeStructuredSummary(chat, validMessages, updateTimestamp);
        renderStructuredMemoryView();
        showToast(`成功总结第 ${start}-${end} 条消息`, 'success');
      } catch (error) {
        console.error('[范围总结] 错误:', error);
        showToast('总结失败：' + error.message, 'error');
      }
    };
    
    cancelBtn.onclick = () => {
      hideCustomModal();
    };
    
    showCustomModal();
  });
}

// 模式3：重置时间戳
async function handleResetTimestamp(chat) {
  const debugInfo = window.structuredMemoryManager.getDebugInfo(chat);
  
  const message = `当前状态：
- 上次更新：${debugInfo.lastDate}
- 总消息数：${debugInfo.totalMessages}
- 待处理消息：${debugInfo.messagesAfterTimestamp}

重置后下次对话将重新提取所有未处理的消息。

确定要重置吗？`;

  const confirmed = await showCustomConfirm('确认重置', message);
  
  if (confirmed) {
    window.structuredMemoryManager.resetTimestamp(chat);
    await db.chats.put(chat);
    showToast('已重置，下次对话将重新提取记忆', 'success');
  }
}

// 核心总结执行函数（被三种模式复用）
async function executeStructuredSummary(chat, messages, updateTimestamp = false) {
  if (!messages || messages.length === 0) {
    throw new Error('没有消息需要总结');
  }

  const userNickname = chat.settings.myNickname || (state.qzoneSettings.nickname || '用户');
  const startMsg = messages[0];
  const endMsg = messages[messages.length - 1];

  const formatDateTime = (ts) => new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const timeRangeStr = `${formatDateTime(startMsg.timestamp)} 至 ${formatDateTime(endMsg.timestamp)}`;

  // 格式化对话历史
  const formattedHistory = messages.map(msg => {
    return window.MemoryExtractionSupport.formatMessage(msg, chat);
  }).filter(Boolean).join('\n');

  const systemPrompt = await (window.structuredMemoryManager.buildSummaryPromptForRequest || window.structuredMemoryManager.buildSummaryPrompt).call(window.structuredMemoryManager, chat, formattedHistory, timeRangeStr);

  // 调用API
  const useSecondaryApi = state.apiConfig.secondaryProxyUrl && state.apiConfig.secondaryApiKey && state.apiConfig.secondaryModel;
  const { proxyUrl, apiKey, model } = useSecondaryApi
    ? { proxyUrl: state.apiConfig.secondaryProxyUrl, apiKey: state.apiConfig.secondaryApiKey, model: state.apiConfig.secondaryModel }
    : state.apiConfig;

  if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');

  let isGemini = proxyUrl.includes('generativelanguage');
  let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, [{ role: 'user', content: '请提取结构化记忆。' }]);

  const response = isGemini
    ? await fetch(geminiConfig.url, geminiConfig.data)
    : await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: '请提取结构化记忆。' }],
          temperature: 0.3
        })
      });

  if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

  const data = await response.json();
  let rawContent = isGemini ? getGeminiResponseText(data) : data.choices[0].message.content;
  rawContent = rawContent.replace(/^```[a-z]*\s*/g, '').replace(/```$/g, '').trim();

  // 解析并合并
  const entries = window.structuredMemoryManager.parseMemoryEntries(rawContent, chat);
  
  if (entries.length > 0) {
    window.structuredMemoryManager.mergeEntries(chat, entries);
    console.log(`[结构化记忆] 成功提取并合并 ${entries.length} 条记忆条目`);
  } else {
    console.warn('[结构化记忆] AI 未返回有效的记忆条目');
    console.log('[结构化记忆] AI原始返回:', rawContent);
  }

  // 根据参数决定是否更新时间戳
  if (updateTimestamp && entries.length > 0) {
    const newTimestamp = endMsg.timestamp;
    chat.lastStructuredMemoryTimestamp = newTimestamp;
    console.log(`[结构化记忆] 时间戳已更新到: ${newTimestamp}`);
  }

  await db.chats.put(chat);
}

// 新增：打开手动总结弹窗
function openManualSummaryModal() {
  const chat = state.chats[state.activeChatId];
  if (!chat) return;

  // 日记模式：直接总结上次总结之后的所有消息
  if (chat.settings.enableDiaryMode) {
    handleDiaryModeSummary();
    return;
  }

  const modal = document.getElementById('manual-summary-modal');
  const totalCount = document.getElementById('manual-summary-total-count');
  const startInput = document.getElementById('manual-summary-start');
  const endInput = document.getElementById('manual-summary-end');

  // 计算可用消息总数（排除隐藏消息）
  const availableMessages = (chat.history || []).filter(m => !m?.isHidden || (m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('内心独白')));
  const totalMessages = availableMessages.length;

  totalCount.textContent = totalMessages;
  startInput.max = totalMessages;
  endInput.max = totalMessages;
  endInput.value = Math.min(20, totalMessages);

  modal.style.display = 'flex';
}

// 日记模式：总结上次总结之后的所有未总结消息
async function handleDiaryModeSummary() {
  const chat = state.chats[state.activeChatId];
  if (!chat) return;

  const lastSummaryTimestamp = chat.lastMemorySummaryTimestamp || 0;
  const unsummarizedMessages = (chat.history || []).filter(m => Number(m?.timestamp) > lastSummaryTimestamp && (!m?.isHidden || (m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('内心独白'))));

  if (unsummarizedMessages.length < 5) {
    const confirmed = await showCustomConfirm(
      '新消息较少', 
      `上次总结之后只有 ${unsummarizedMessages.length} 条新消息。如果您是对刚生成的总结不满意（或误删）想要重新生成，请点击"继续"，系统将自动提取最近的历史消息进行重写。\n\n确定要继续吗？`
    );
    if (!confirmed) return;
  } else {
    const confirmed = await showCustomConfirm('日记模式总结', `将总结上次总结之后的所有消息（共 ${unsummarizedMessages.length} 条），会消耗API额度。确定要继续吗？`);
    if (!confirmed) return;
  }

  if (true) {
    const memoryMode = chat.settings.memoryMode || 'diary';
    if (memoryMode === 'vector' && window.vectorMemoryManager) {
      await triggerVectorMemorySummary(state.activeChatId, true);
    } else {
      await triggerAutoSummary(state.activeChatId, true);
      if ((memoryMode === 'structured' || chat.settings.enableStructuredMemory) && window.structuredMemoryManager) {
        const structuredCount = await triggerStructuredMemorySummary(state.activeChatId, true);
        if (structuredCount > 0) showToast(`结构化记忆已同步更新（${structuredCount} 条）`, 'success');
        else if (structuredCount === 0) showToast('结构化记忆检查完成，没有需要新增的内容', 'info');
      }
    }
  }
}

// 新增：关闭手动总结弹窗
function closeManualSummaryModal() {
  const modal = document.getElementById('manual-summary-modal');
  modal.style.display = 'none';
}

// 新增：执行手动总结
async function executeManualSummary() {
  const startInput = document.getElementById('manual-summary-start');
  const endInput = document.getElementById('manual-summary-end');

  const start = parseInt(startInput.value);
  const end = parseInt(endInput.value);

  if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
    await showCustomAlert('输入错误', '请输入有效的消息范围（起始位置必须小于等于结束位置）');
    return;
  }

  const chat = state.chats[state.activeChatId];
  const availableMessages = (chat.history || []).filter(m => !m?.isHidden || (m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('内心独白')));

  if (end > availableMessages.length) {
    await showCustomAlert('范围超出', `结束位置不能超过总消息数（${availableMessages.length}）`);
    return;
  }

  if (end - start + 1 < 5) {
    await showCustomAlert('消息太少', '选择的消息数量太少（至少需要5条），无法进行有意义的总结');
    return;
  }

  closeManualSummaryModal();

  const confirmed = await showCustomConfirm('确认操作', `将总结第 ${start} 到第 ${end} 条消息（共 ${end - start + 1} 条），会消耗API额度。确定要继续吗？`);
  if (confirmed) {
    await triggerAutoSummary(state.activeChatId, false, { start, end });
  }
}


async function handleExportLongTermMemory() {
  const chat = state.chats[state.activeChatId];
  if (!chat || !chat.longTermMemory || chat.longTermMemory.length === 0) {
    showToast('当前没有可以导出的记忆', 'warning');
    return;
  }

  const format = await showChoiceModal('导出记忆', [
    { text: '导出为 JSON', value: 'json' },
    { text: '导出为纯文字 (TXT)', value: 'txt' },
    { text: '隐藏此按钮 (三击屏幕唤醒)', value: 'hide' }
  ]);

  if (format === 'hide') {
    const btn = document.getElementById('export-original-memory-btn');
    if (btn) {
      btn.classList.add('hidden');
      const state = JSON.parse(localStorage.getItem('export-memory-btn-state') || '{}');
      state.hidden = true;
      localStorage.setItem('export-memory-btn-state', JSON.stringify(state));
      showToast('按钮已隐藏，在屏幕上快速点击三次即可唤醒');
    }
    return;
  }

  if (!format) return;

  let contentStr = '';
  let filename = '';
  let type = '';

  const dateStr = new Date().toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).replace(/[/:]/g, '-').replace(' ', '_');

  if (format === 'json') {
    contentStr = JSON.stringify(chat.longTermMemory, null, 2);
    filename = `memory_${chat.name || chat.originalName}_${dateStr}.json`;
    type = 'application/json';
  } else if (format === 'txt') {
    contentStr = chat.longTermMemory.map(mem => {
      const time = new Date(mem.timestamp).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
      return `[${time}] ${mem.content}`;
    }).join('\n\n');
    filename = `memory_${chat.name || chat.originalName}_${dateStr}.txt`;
    type = 'text/plain';
  }

  try {
    const blob = new Blob([contentStr], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('导出成功', 'success');
  } catch (error) {
    console.error('导出长期记忆失败:', error);
    showToast('导出失败', 'error');
  }
}

