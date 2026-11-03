  // ========== 从 script.js 迁移：手动总结相关 ==========
  async function handleManualSummary() {
    const confirmed = await showCustomConfirm('确认操作', '这将提取最近的对话内容发送给AI进行总结，会消耗API额度。确定要继续吗？');
    if (confirmed) {
      const chat = state.chats[state.activeChatId];
      const memoryMode = chat ? (chat.settings.memoryMode || 'diary') : 'diary';
      if (memoryMode === 'vector' && window.vectorMemoryManager) {
        await triggerVectorMemorySummary(state.activeChatId, true);
      } else {
        await triggerAutoSummary(state.activeChatId, true);
        if ((memoryMode === 'structured' || (chat && chat.settings.enableStructuredMemory)) && window.structuredMemoryManager) {
          const structuredCount = await triggerStructuredMemorySummary(state.activeChatId, true);
          if (structuredCount > 0) showToast(`结构化记忆已同步更新（${structuredCount} 条）`, 'success');
          else if (structuredCount === 0) showToast('结构化记忆检查完成，没有需要新增的内容', 'info');
        }
      }
    }
  }

  function openManualSummaryModal() {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;
    if (window.GroupMemory?.independent(chat)) return window.GroupMemoryUI.open(chat);
    if (chat.settings.enableDiaryMode) {
      if (typeof handleDiaryModeSummary === 'function') handleDiaryModeSummary();
      return;
    }
    const modal = document.getElementById('manual-summary-modal');
    const totalCount = document.getElementById('manual-summary-total-count');
    const startInput = document.getElementById('manual-summary-start');
    const endInput = document.getElementById('manual-summary-end');
    const availableMessages = (chat.history || []).filter(m => !m?.isHidden || (m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('内心独白')));
    const totalMessages = availableMessages.length;
    totalCount.textContent = totalMessages;
    startInput.max = totalMessages;
    endInput.max = totalMessages;
    endInput.value = Math.min(20, totalMessages);
    modal.style.display = 'flex';
  }

  function closeManualSummaryModal() {
    const modal = document.getElementById('manual-summary-modal');
    modal.style.display = 'none';
  }

  window.handleManualSummary = handleManualSummary;
  window.openManualSummaryModal = openManualSummaryModal;
  window.closeManualSummaryModal = closeManualSummaryModal;

  // ========== 自定义小组管理功能已移至 douban.js ==========

