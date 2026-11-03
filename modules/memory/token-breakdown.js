// ============================================================
// 模块：memory-summary.js
// 来源：从 script.js 拆分（原始行范围约 28811~30930）
// 功能：长期记忆管理、结构化记忆、自动总结、通话记录总结等
// ============================================================

// ==================== Token 明细（原始行范围约 23644~23793）====================

window.openTokenBreakdown = async function() {
  const chat = state.chats[state.activeChatId];
  if (!chat) return;
  const body = document.getElementById('token-breakdown-body');
  body.innerHTML = '<div style="text-align:center;padding:30px;color:#8a8a8a;">计算中...</div>';
  document.getElementById('token-breakdown-modal').classList.add('visible');

  const maxMemory = parseInt(document.getElementById('max-memory').value) || 10;
  const linkedMemoryCount = parseInt(document.getElementById('linked-memory-count').value) || 10;
  const isOfflineMode = document.getElementById('offline-mode-toggle').checked;
  const aiPersona = document.getElementById('ai-persona').value;
  const myPersona = document.getElementById('my-persona').value;

  const parts = [];

  // 1. 世界书
  let worldBookStr = '';
  const linkedBookIds = Array.from(document.querySelectorAll('#world-book-checkboxes-container input:checked')).map(cb => cb.value.replace('book_', ''));
  const globalBookIds = state.worldBooks.filter(wb => wb.isGlobal).map(wb => wb.id);
  const allBookIds = [...new Set([...linkedBookIds, ...globalBookIds])];
  if (allBookIds.length > 0) {
    worldBookStr = allBookIds.map(bookId => {
      const wb = state.worldBooks.find(w => w.id === bookId);
      if (!wb || !Array.isArray(wb.content)) return '';
      return wb.content.filter(e => e.enabled !== false).map(e => e.content).join('\n');
    }).filter(Boolean).join('\n');
  }
  parts.push({ name: '世界书', tokens: estimateTokens(worldBookStr) });

  // 2. 记忆（与发请求一致：尊重「限制长期记忆读取数量」）
  let memoryStr = '';
  memoryStr = getMemoryContextForPrompt(chat);
  parts.push({ name: '长期记忆', tokens: estimateTokens(memoryStr) });

  // 3. 关联记忆
  let linkedStr = '';
  const linkedMemoryToggle = document.getElementById('link-memory-toggle').checked;
  if (linkedMemoryToggle) {
    const linkedChatIds = Array.from(document.querySelectorAll('#linked-chats-checkboxes-container input:checked')).map(cb => cb.value);
    for (const linkedId of linkedChatIds) {
      const linkedChat = state.chats[linkedId];
      if (linkedChat && (!window.GroupMemory || window.GroupMemory.canMount(chat, linkedChat)) && linkedChat.history.length > 0) {
        linkedStr += linkedChat.history.slice(-linkedMemoryCount).map(msg => String(msg.content)).join('\n');
      }
    }
  }
  parts.push({ name: '关联记忆', tokens: estimateTokens(linkedStr) });

  // 4. 人设提示词
  let personaStr = '';
  if (chat.isGroup) {
    chat.members.forEach(member => { personaStr += member.persona; });
  } else {
    personaStr += aiPersona;
  }
  personaStr += myPersona;
  parts.push({ name: '人设提示词', tokens: estimateTokens(personaStr) });

  // 5. 表情包上下文
  let stickerStr = getStickerContextForPrompt(chat);
  if (chat.isGroup) stickerStr += getGroupStickerContextForPrompt(chat);
  parts.push({ name: '表情包上下文', tokens: estimateTokens(stickerStr) });

  // 6. 离线预设
  let offlineStr = '';
  if (!chat.isGroup && isOfflineMode) {
    const offlinePresetId = document.getElementById('offline-preset-select').value;
    if (offlinePresetId) {
      const preset = state.presets.find(p => p.id === offlinePresetId);
      if (preset) {
        offlineStr = preset.content.filter(e => e.enabled !== false).map(e => e.content).join('\n');
      }
    }
  }
  parts.push({ name: '离线预设', tokens: estimateTokens(offlineStr) });

  // 7. 聊天上下文
  const historySlice = chat.history.filter(msg => !msg.isExcluded && msg.type !== 'thought_chain_block').slice(-maxMemory);
  const historyStr = historySlice.map(msg => {
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) return msg.content.map(p => p.text).join(' ');
    return '';
  }).join('\n');
  parts.push({ name: `聊天上下文 (${historySlice.length}条)`, tokens: estimateTokens(historyStr) });

  const totalTokens = parts.reduce((sum, p) => sum + p.tokens, 0);

  // 渲染
  body.innerHTML = '';
  parts.forEach(part => {
    if (part.tokens === 0) return;
    const pct = totalTokens > 0 ? Math.round(part.tokens / totalTokens * 100) : 0;
    const row = document.createElement('div');
    row.style.cssText = 'padding: 12px 15px; border-bottom: 1px solid var(--border-color, #eee);';
    row.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><span style="font-size:14px;color:var(--text-color);">${part.name}</span><span style="font-size:14px;font-weight:500;color:var(--text-color);">${part.tokens.toLocaleString()} Tokens</span></div><div style="height:6px;background:var(--secondary-bg,#f0f0f0);border-radius:3px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:var(--accent-color);border-radius:3px;transition:width 0.3s;"></div></div><div style="text-align:right;font-size:11px;color:var(--text-secondary);margin-top:2px;">${pct}%</div>`;
    body.appendChild(row);
  });
  // 总计
  const totalRow = document.createElement('div');
  totalRow.style.cssText = 'padding: 12px 15px; display:flex; justify-content:space-between; align-items:center;';
  totalRow.innerHTML = `<span style="font-size:15px;font-weight:600;color:var(--text-color);">总计</span><span style="font-size:15px;font-weight:600;color:var(--accent-color);">${totalTokens.toLocaleString()} Tokens</span>`;
  body.appendChild(totalRow);
}

window.closeTokenBreakdown = function() {
  document.getElementById('token-breakdown-modal').classList.remove('visible');
};

window.refreshTokenBreakdown = async function() {
  const body = document.getElementById('token-breakdown-body');
  const refreshBtn = document.getElementById('token-breakdown-refresh-btn');
  
  // 显示刷新中状态
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '刷新中';
  }
  
  // 立即重新计算token详情
  await window.openTokenBreakdown();
  
  // 同时更新主界面的token显示（不使用debounce）
  const tokenValueEl = document.getElementById('token-count-value');
  if (tokenValueEl) {
    try {
      const tokenCount = await calculateCurrentContextTokens();
      tokenValueEl.textContent = `${tokenCount} Tokens`;
      tokenValueEl.style.color = "#000000";
      
      if (document.body.classList.contains('dark-mode') || document.getElementById('phone-screen').classList.contains('dark-mode')) {
        tokenValueEl.style.color = "#ffffff";
      }
    } catch (error) {
      console.error("Token calculation error:", error);
    }
  }
  
  // 恢复按钮状态并显示完成提示
  if (refreshBtn) {
    refreshBtn.disabled = false;
    refreshBtn.textContent = '刷新';
  }
  
  // 显示刷新完成提示
  showToast('已刷新完成');
};

