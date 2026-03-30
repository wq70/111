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
  const memMode = chat.settings.memoryMode || (chat.settings.enableStructuredMemory ? 'structured' : 'diary');
  if (memMode === 'vector' && window.vectorMemoryManager) {
    memoryStr = window.vectorMemoryManager.serializeCoreMemories(chat);
    const topN = chat.vectorMemory?.settings?.topN || 8;
    const frags = [...(chat.vectorMemory?.fragments || [])].sort((a, b) => (b.importance || 5) - (a.importance || 5)).slice(0, topN);
    memoryStr += frags.map(f => f.content).join('\n');
  } else if ((memMode === 'structured' || chat.settings.enableStructuredMemory) && window.structuredMemoryManager) {
    memoryStr = window.structuredMemoryManager.serializeForPrompt(chat);
  } else if (chat.longTermMemory && chat.longTermMemory.length > 0) {
    memoryStr = getMemoryContextForPrompt(chat);
  }
  parts.push({ name: '长期记忆', tokens: estimateTokens(memoryStr) });

  // 3. 关联记忆
  let linkedStr = '';
  const linkedMemoryToggle = document.getElementById('link-memory-toggle').checked;
  if (linkedMemoryToggle) {
    const linkedChatIds = Array.from(document.querySelectorAll('#linked-chats-checkboxes-container input:checked')).map(cb => cb.value);
    for (const linkedId of linkedChatIds) {
      const linkedChat = state.chats[linkedId];
      if (linkedChat && linkedChat.history.length > 0) {
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
  const historySlice = chat.history.filter(msg => !msg.isExcluded).slice(-maxMemory);
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

// ==================== 长期记忆管理（原始行范围约 28811~30930）====================

function openLongTermMemoryScreen() {
  if (!state.activeChatId) return;
  const chat = state.chats[state.activeChatId];
  
  // 显示/隐藏 tab 栏
  const tabBar = document.getElementById('memory-tab-bar');
  const memoryMode = chat.settings.memoryMode || 'diary';
  if (chat && (chat.settings.enableStructuredMemory || memoryMode === 'structured' || memoryMode === 'vector')) {
    tabBar.style.display = 'flex';
    // 根据模式显示/隐藏对应tab
    const structuredTab = document.getElementById('memory-tab-structured');
    const vectorTab = document.getElementById('memory-tab-vector');
    if (structuredTab) structuredTab.style.display = (memoryMode === 'structured' || chat.settings.enableStructuredMemory) ? '' : 'none';
    if (vectorTab) vectorTab.style.display = (memoryMode === 'vector') ? '' : 'none';
  } else {
    tabBar.style.display = 'none';
  }
  
  // 默认显示对应模式的tab
  const defaultTab = memoryMode === 'vector' ? 'vector' : (memoryMode === 'structured' ? 'structured' : 'original');
  switchMemoryTab(defaultTab);
  showScreen('long-term-memory-screen');
}

// 切换记忆 Tab
function switchMemoryTab(tabName) {
  const originalList = document.getElementById('original-memory-list');
  const structuredContainer = document.getElementById('structured-memory-container');
  const vectorContainer = document.getElementById('vector-memory-container');
  const tabs = document.querySelectorAll('#memory-tab-bar .sm-tab');
  
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  
  if (tabName === 'original') {
    originalList.style.display = 'block';
    structuredContainer.style.display = 'none';
    if (vectorContainer) vectorContainer.style.display = 'none';
    renderLongTermMemoryList();
  } else if (tabName === 'structured') {
    originalList.style.display = 'none';
    structuredContainer.style.display = 'block';
    if (vectorContainer) vectorContainer.style.display = 'none';
    renderStructuredMemoryView();
  } else if (tabName === 'vector') {
    originalList.style.display = 'none';
    structuredContainer.style.display = 'none';
    if (vectorContainer) vectorContainer.style.display = 'block';
    renderVectorMemoryView();
  }
}

// 渲染结构化记忆视图
function renderStructuredMemoryView() {
  const container = document.getElementById('structured-memory-container');
  const chat = state.chats[state.activeChatId];
  if (!chat || !window.structuredMemoryManager) {
    container.innerHTML = '<p style="text-align:center; color:#999; margin-top:40px;">结构化记忆模块未加载</p>';
    return;
  }
  
  window.structuredMemoryManager.renderMemoryTable(chat, container);

  // ===== 批量操作状态 =====
  let smBatchMode = false;
  let smSelectedItems = []; // [{category, index}]

  function smUpdateBatchCount() {
    const countEl = container.querySelector('#sm-batch-selected-count');
    if (countEl) countEl.textContent = smSelectedItems.length;
  }

  function smToggleBatchMode(enable) {
    smBatchMode = enable;
    smSelectedItems = [];
    const batchBar = container.querySelector('#sm-batch-toolbar');
    if (batchBar) batchBar.style.display = enable ? 'flex' : 'none';
    container.querySelectorAll('.sm-batch-element').forEach(el => {
      el.style.display = enable ? 'flex' : 'none';
      el.classList.remove('checked');
    });
    container.querySelectorAll('.sm-item-row').forEach(row => row.classList.remove('selected'));
    smUpdateBatchCount();
  }

  function smIsSelected(category, index) {
    return smSelectedItems.some(i => i.category === category && i.index === parseInt(index));
  }

  function smToggleItem(category, index) {
    const idx = smSelectedItems.findIndex(i => i.category === category && i.index === parseInt(index));
    if (idx >= 0) {
      smSelectedItems.splice(idx, 1);
    } else {
      smSelectedItems.push({ category, index: parseInt(index) });
    }
    smUpdateBatchCount();
  }

  // 批量模式切换
  const batchToggleBtn = container.querySelector('#sm-batch-toggle-btn');
  if (batchToggleBtn) {
    batchToggleBtn.addEventListener('click', () => smToggleBatchMode(true));
  }
  const batchCancelBtn = container.querySelector('#sm-batch-cancel-btn');
  if (batchCancelBtn) {
    batchCancelBtn.addEventListener('click', () => smToggleBatchMode(false));
  }

  // 全选
  const batchSelectAllBtn = container.querySelector('#sm-batch-select-all-btn');
  if (batchSelectAllBtn) {
    batchSelectAllBtn.addEventListener('click', () => {
      smSelectedItems = [];
      container.querySelectorAll('.sm-item-checkbox').forEach(cb => {
        const cat = cb.dataset.category;
        const idx = parseInt(cb.dataset.index);
        smSelectedItems.push({ category: cat, index: idx });
        cb.classList.add('checked');
        const row = cb.closest('.sm-item-row');
        if (row) row.classList.add('selected');
      });
      container.querySelectorAll('.sm-section-select-all').forEach(sa => sa.classList.add('checked'));
      smUpdateBatchCount();
    });
  }

  // 复制选中
  const batchCopyBtn = container.querySelector('#sm-batch-copy-btn');
  if (batchCopyBtn) {
    batchCopyBtn.addEventListener('click', async () => {
      if (smSelectedItems.length === 0) { showToast('请先选择条目', 'info'); return; }
      const text = window.structuredMemoryManager.getSelectedItemsText(chat, smSelectedItems);
      try {
        await navigator.clipboard.writeText(text);
        showToast(`已复制 ${smSelectedItems.length} 条记忆`, 'success');
      } catch (e) {
        showToast('复制失败', 'error');
      }
    });
  }

  // 导出选中
  const batchExportBtn = container.querySelector('#sm-batch-export-btn');
  if (batchExportBtn) {
    batchExportBtn.addEventListener('click', () => {
      if (smSelectedItems.length === 0) { showToast('请先选择条目', 'info'); return; }
      const json = window.structuredMemoryManager.exportSelected(chat, smSelectedItems);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `structured-memory-selected-${chat.originalName || chat.name}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`已导出 ${smSelectedItems.length} 条记忆`, 'success');
    });
  }

  // 批量删除
  const batchDeleteBtn = container.querySelector('#sm-batch-delete-btn');
  if (batchDeleteBtn) {
    batchDeleteBtn.addEventListener('click', async () => {
      if (smSelectedItems.length === 0) { showToast('请先选择条目', 'info'); return; }
      const confirmed = await showCustomConfirm('确认批量删除', `确定要删除选中的 ${smSelectedItems.length} 条记忆吗？此操作不可撤销。`, { confirmButtonClass: 'btn-danger', confirmText: '确认删除' });
      if (confirmed) {
        window.structuredMemoryManager.batchDelete(chat, smSelectedItems);
        await db.chats.put(chat);
        renderStructuredMemoryView();
        showToast(`已删除 ${smSelectedItems.length} 条记忆`, 'success');
      }
    });
  }

  // 复选框点击
  container.querySelectorAll('.sm-item-checkbox').forEach(cb => {
    cb.addEventListener('click', () => {
      const cat = cb.dataset.category;
      const idx = cb.dataset.index;
      smToggleItem(cat, idx);
      cb.classList.toggle('checked');
      const row = cb.closest('.sm-item-row');
      if (row) row.classList.toggle('selected');
    });
  });

  // 分类全选
  container.querySelectorAll('.sm-section-select-all').forEach(sa => {
    sa.addEventListener('click', () => {
      const cat = sa.dataset.category;
      const section = sa.closest('.sm-section');
      const checkboxes = section.querySelectorAll('.sm-item-checkbox');
      const allChecked = Array.from(checkboxes).every(cb => cb.classList.contains('checked'));
      checkboxes.forEach(cb => {
        const idx = cb.dataset.index;
        if (allChecked) {
          cb.classList.remove('checked');
          const row = cb.closest('.sm-item-row');
          if (row) row.classList.remove('selected');
          const sIdx = smSelectedItems.findIndex(i => i.category === cat && i.index === parseInt(idx));
          if (sIdx >= 0) smSelectedItems.splice(sIdx, 1);
        } else {
          if (!smIsSelected(cat, idx)) {
            smSelectedItems.push({ category: cat, index: parseInt(idx) });
          }
          cb.classList.add('checked');
          const row = cb.closest('.sm-item-row');
          if (row) row.classList.add('selected');
        }
      });
      sa.classList.toggle('checked', !allChecked);
      smUpdateBatchCount();
    });
  });

  // ===== 导出全部 =====
  const smExportBtn = container.querySelector('#sm-export-btn');
  if (smExportBtn) {
    smExportBtn.addEventListener('click', () => {
      const json = window.structuredMemoryManager.exportMemory(chat);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `structured-memory-${chat.originalName || chat.name}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('导出成功', 'success');
    });
  }

  // ===== 导入 =====
  const smImportBtn = container.querySelector('#sm-import-btn');
  if (smImportBtn) {
    smImportBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          let mode = 'merge';
          if (data.type !== 'structured-memory-partial') {
            const isMerge = await showCustomConfirm('导入模式', '选择"确认"为合并模式（保留现有数据），选择"取消"为替换模式（清空现有数据）');
            mode = isMerge ? 'merge' : 'replace';
          }
          const count = window.structuredMemoryManager.importMemory(chat, text, mode);
          await db.chats.put(chat);
          renderStructuredMemoryView();
          showToast(`成功导入 ${count} 条记忆`, 'success');
        } catch (err) {
          showToast('导入失败: ' + err.message, 'error');
        }
      };
      input.click();
    });
  }
  
  // 绑定工具栏按钮
  const addCategoryBtn = container.querySelector('#sm-add-category-btn');
  if (addCategoryBtn) {
    addCategoryBtn.addEventListener('click', async () => {
      const name = await showCustomPrompt('新建自定义分类', '请输入分类名称（如：约会记录、共同爱好、吵架记录）');
      if (!name || !name.trim()) return;
      
      // 自动生成分类代码（取首字母或用序号）
      const mem = window.structuredMemoryManager.getStructuredMemory(chat);
      const existingCodes = Object.keys(window.structuredMemoryManager.getCategories(chat));
      let code = name.trim().substring(0, 2).toUpperCase();
      // 如果代码冲突，加数字后缀
      let suffix = 1;
      let finalCode = code;
      while (existingCodes.includes(finalCode)) {
        finalCode = code + suffix;
        suffix++;
      }
      
      window.structuredMemoryManager.addCustomCategory(chat, finalCode, name.trim());
      await db.chats.put(chat);
      renderStructuredMemoryView();
      showToast(`分类"${name.trim()}"已创建`, 'success');
    });
  }
  
  const addEntryBtn = container.querySelector('#sm-add-entry-btn');
  if (addEntryBtn) {
    addEntryBtn.addEventListener('click', async () => {
      const selectedCode = await showCategoryPickerModal(chat);
      if (!selectedCode) return;
      
      const categories = window.structuredMemoryManager.getCategories(chat);
      const cat = categories[selectedCode];
      if (!cat) return;
      
      let placeholder = '输入记忆内容';
      if (selectedCode === 'F') placeholder = '格式：key=value（如：用户口味=草莓+抹茶）';
      
      const content = await showCustomPrompt(`添加到"${cat.name}"`, placeholder);
      if (!content || !content.trim()) return;
      
      window.structuredMemoryManager.addManualEntry(chat, selectedCode, content.trim());
      await db.chats.put(chat);
      renderStructuredMemoryView();
      showToast('条目已添加', 'success');
    });
  }
  
  // 绑定总结按钮
  const summaryBtn = container.querySelector('#sm-summary-btn');
  if (summaryBtn) {
    summaryBtn.addEventListener('click', async () => {
      await openStructuredSummaryMenu(chat);
    });
  }
  
  // 绑定每个分类区域的"添加条目"按钮
  container.querySelectorAll('.sm-add-to-cat-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const categoryCode = btn.dataset.code;
      const categories = window.structuredMemoryManager.getCategories(chat);
      const cat = categories[categoryCode];
      if (!cat) return;
      
      let placeholder = '输入记忆内容';
      if (categoryCode === 'F') placeholder = '格式：key=value（如：用户口味=草莓+抹茶）';
      
      const content = await showCustomPrompt(`添加到"${cat.name}"`, placeholder);
      if (!content || !content.trim()) return;
      
      window.structuredMemoryManager.addManualEntry(chat, categoryCode, content.trim());
      await db.chats.put(chat);
      renderStructuredMemoryView();
      showToast('条目已添加', 'success');
    });
  });

  // 绑定编辑和删除事件
  container.querySelectorAll('.sm-edit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const category = btn.dataset.category;
      const index = parseInt(btn.dataset.index);
      const row = btn.closest('.sm-item-row');
      const currentContent = row.querySelector('.sm-item-content').textContent;
      
      const newContent = await showCustomPrompt('编辑记忆条目', '修改内容：', currentContent);
      if (newContent !== null && newContent.trim() !== '') {
        window.structuredMemoryManager.editEntry(chat, category, index, newContent.trim());
        await db.chats.put(chat);
        renderStructuredMemoryView();
      }
    });
  });
  
  container.querySelectorAll('.sm-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const category = btn.dataset.category;
      const index = parseInt(btn.dataset.index);
      const confirmed = await showCustomConfirm('确认删除', '确定要删除这条记忆吗？');
      if (confirmed) {
        window.structuredMemoryManager.deleteEntry(chat, category, index);
        await db.chats.put(chat);
        renderStructuredMemoryView();
      }
    });
  });
  
  // 绑定自定义分类的重命名和删除
  container.querySelectorAll('.sm-rename-cat-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = btn.dataset.code;
      const categories = window.structuredMemoryManager.getCategories(chat);
      const currentName = categories[code] ? categories[code].name : code;
      
      const newName = await showCustomPrompt('重命名分类', '输入新名称：', currentName);
      if (newName !== null && newName.trim() !== '') {
        window.structuredMemoryManager.renameCustomCategory(chat, code, newName.trim());
        await db.chats.put(chat);
        renderStructuredMemoryView();
      }
    });
  });
  
  container.querySelectorAll('.sm-delete-cat-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = btn.dataset.code;
      const categories = window.structuredMemoryManager.getCategories(chat);
      const catName = categories[code] ? categories[code].name : code;
      const mem = window.structuredMemoryManager.getStructuredMemory(chat);
      const itemCount = (mem._custom[code] || []).length;
      
      const confirmed = await showCustomConfirm('确认删除分类',
        `确定要删除分类"${catName}"吗？${itemCount > 0 ? `其中的 ${itemCount} 条记忆也会被删除。` : ''}此操作不可撤销。`,
        { confirmButtonClass: 'btn-danger', confirmText: '确认删除' }
      );
      if (confirmed) {
        window.structuredMemoryManager.deleteCustomCategory(chat, code);
        await db.chats.put(chat);
        renderStructuredMemoryView();
        showToast(`分类"${catName}"已删除`, 'info');
      }
    });
  });
}



// ==================== 向量记忆视图 ====================
function renderVectorMemoryView() {
  const container = document.getElementById('vector-memory-container');
  const chat = state.chats[state.activeChatId];
  if (!chat || !window.vectorMemoryManager) {
    container.innerHTML = '<p style="text-align:center; color:#999; margin-top:40px;">向量记忆模块未加载</p>';
    return;
  }

  window.vectorMemoryManager.renderMemoryUI(chat, container);
  bindVectorMemoryEvents(chat, container);
}

function bindVectorMemoryEvents(chat, container) {
  // ===== 批量操作状态 =====
  let vmBatchMode = false;
  let vmSelectedItems = []; // [{type: 'core'|'fragment', id}]

  function vmUpdateBatchCount() {
    const countEl = container.querySelector('#vm-batch-selected-count');
    if (countEl) countEl.textContent = vmSelectedItems.length;
  }

  function vmToggleBatchMode(enable) {
    vmBatchMode = enable;
    vmSelectedItems = [];
    const batchBar = container.querySelector('#vm-batch-toolbar');
    if (batchBar) batchBar.style.display = enable ? 'flex' : 'none';
    container.querySelectorAll('.vm-batch-element').forEach(el => {
      el.style.display = enable ? 'flex' : 'none';
      el.classList.remove('checked');
    });
    container.querySelectorAll('.vm-item-row').forEach(row => row.classList.remove('selected'));
    vmUpdateBatchCount();
  }

  function vmIsSelected(type, id) {
    return vmSelectedItems.some(i => i.type === type && i.id === id);
  }

  function vmToggleItem(type, id) {
    const idx = vmSelectedItems.findIndex(i => i.type === type && i.id === id);
    if (idx >= 0) {
      vmSelectedItems.splice(idx, 1);
    } else {
      vmSelectedItems.push({ type, id });
    }
    vmUpdateBatchCount();
  }

  // 批量模式切换
  const batchToggleBtn = container.querySelector('#vm-batch-toggle-btn');
  if (batchToggleBtn) {
    batchToggleBtn.addEventListener('click', () => vmToggleBatchMode(true));
  }
  const batchCancelBtn = container.querySelector('#vm-batch-cancel-btn');
  if (batchCancelBtn) {
    batchCancelBtn.addEventListener('click', () => vmToggleBatchMode(false));
  }

  // 全选
  const batchSelectAllBtn = container.querySelector('#vm-batch-select-all-btn');
  if (batchSelectAllBtn) {
    batchSelectAllBtn.addEventListener('click', () => {
      vmSelectedItems = [];
      container.querySelectorAll('.vm-item-checkbox').forEach(cb => {
        vmSelectedItems.push({ type: cb.dataset.type, id: cb.dataset.id });
        cb.classList.add('checked');
        const row = cb.closest('.vm-item-row');
        if (row) row.classList.add('selected');
      });
      container.querySelectorAll('.vm-section-select-all').forEach(sa => sa.classList.add('checked'));
      vmUpdateBatchCount();
    });
  }

  // 复制选中
  const batchCopyBtn = container.querySelector('#vm-batch-copy-btn');
  if (batchCopyBtn) {
    batchCopyBtn.addEventListener('click', async () => {
      if (vmSelectedItems.length === 0) { showToast('请先选择条目', 'info'); return; }
      const text = window.vectorMemoryManager.getSelectedItemsText(chat, vmSelectedItems);
      try {
        await navigator.clipboard.writeText(text);
        showToast(`已复制 ${vmSelectedItems.length} 条记忆`, 'success');
      } catch (e) {
        showToast('复制失败', 'error');
      }
    });
  }

  // 导出选中
  const batchExportBtn = container.querySelector('#vm-batch-export-btn');
  if (batchExportBtn) {
    batchExportBtn.addEventListener('click', () => {
      if (vmSelectedItems.length === 0) { showToast('请先选择条目', 'info'); return; }
      const json = window.vectorMemoryManager.exportSelected(chat, vmSelectedItems);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vector-memory-selected-${chat.originalName || chat.name}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`已导出 ${vmSelectedItems.length} 条记忆`, 'success');
    });
  }

  // 批量删除
  const batchDeleteBtn = container.querySelector('#vm-batch-delete-btn');
  if (batchDeleteBtn) {
    batchDeleteBtn.addEventListener('click', async () => {
      if (vmSelectedItems.length === 0) { showToast('请先选择条目', 'info'); return; }
      const confirmed = await showCustomConfirm('确认批量删除', `确定要删除选中的 ${vmSelectedItems.length} 条记忆吗？此操作不可撤销。`, { confirmButtonClass: 'btn-danger', confirmText: '确认删除' });
      if (confirmed) {
        window.vectorMemoryManager.batchDelete(chat, vmSelectedItems);
        await db.chats.put(chat);
        renderVectorMemoryView();
        showToast(`已删除 ${vmSelectedItems.length} 条记忆`, 'success');
      }
    });
  }

  // 复选框点击
  container.querySelectorAll('.vm-item-checkbox').forEach(cb => {
    cb.addEventListener('click', () => {
      const type = cb.dataset.type;
      const id = cb.dataset.id;
      vmToggleItem(type, id);
      cb.classList.toggle('checked');
      const row = cb.closest('.vm-item-row');
      if (row) row.classList.toggle('selected');
    });
  });

  // 分类全选
  container.querySelectorAll('.vm-section-select-all').forEach(sa => {
    sa.addEventListener('click', () => {
      const section = sa.closest('.vm-section');
      const checkboxes = section.querySelectorAll('.vm-item-checkbox');
      const allChecked = Array.from(checkboxes).every(cb => cb.classList.contains('checked'));
      checkboxes.forEach(cb => {
        const type = cb.dataset.type;
        const id = cb.dataset.id;
        if (allChecked) {
          cb.classList.remove('checked');
          const row = cb.closest('.vm-item-row');
          if (row) row.classList.remove('selected');
          const sIdx = vmSelectedItems.findIndex(i => i.type === type && i.id === id);
          if (sIdx >= 0) vmSelectedItems.splice(sIdx, 1);
        } else {
          if (!vmIsSelected(type, id)) {
            vmSelectedItems.push({ type, id });
          }
          cb.classList.add('checked');
          const row = cb.closest('.vm-item-row');
          if (row) row.classList.add('selected');
        }
      });
      sa.classList.toggle('checked', !allChecked);
      vmUpdateBatchCount();
    });
  });

  // 添加记忆片段
  const addFragBtn = container.querySelector('#vm-add-fragment-btn');
  if (addFragBtn) {
    addFragBtn.addEventListener('click', async () => {
      const content = await showCustomPrompt('添加记忆片段', '输入记忆内容：', '', 'textarea');
      if (!content || !content.trim()) return;
      const tags = await showCustomPrompt('添加标签', '输入关键词标签（逗号分隔）：', '');
      const tagArr = tags ? tags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];
      const embedding = await window.vectorMemoryManager.getEmbedding(content.trim(), chat);
      window.vectorMemoryManager.createFragment(chat, {
        content: content.trim(), tags: tagArr, category: 'E', importance: 5,
        emotionalWeight: 3, embedding, source: 'manual'
      });
      await db.chats.put(chat);
      renderVectorMemoryView();
      showToast('记忆片段已添加', 'success');
    });
  }

  // 添加核心记忆
  const addCoreBtn = container.querySelector('#vm-add-core-btn');
  if (addCoreBtn) {
    addCoreBtn.addEventListener('click', async () => {
      const content = await showCustomPrompt('添加核心记忆', '核心记忆会永远注入到对话中：');
      if (!content || !content.trim()) return;
      window.vectorMemoryManager.addCoreMemory(chat, content.trim());
      await db.chats.put(chat);
      renderVectorMemoryView();
      showToast('核心记忆已添加', 'success');
    });
  }

  // 设置按钮
  const settingsBtn = container.querySelector('#vm-settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      openVectorMemorySettings(chat);
    });
  }

  // 导出
  const exportBtn = container.querySelector('#vm-export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const json = window.vectorMemoryManager.exportMemory(chat);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vector-memory-${chat.originalName || chat.name}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('导出成功', 'success');
    });
  }

  // 导入
  const importBtn = container.querySelector('#vm-import-btn');
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const mode = await showCustomConfirm('导入模式', '选择"确认"为合并模式（保留现有数据），选择"取消"为替换模式（清空现有数据）');
          const importMode = mode ? 'merge' : 'replace';
          showToast('正在导入...', 'info');
          const count = await window.vectorMemoryManager.importMemory(chat, text, importMode);
          await db.chats.put(chat);
          renderVectorMemoryView();
          showToast(`成功导入 ${count} 条记忆`, 'success');
        } catch (err) {
          showToast('导入失败: ' + err.message, 'error');
        }
      };
      input.click();
    });
  }

  // 总结按钮
  const summaryBtn = container.querySelector('#vm-summary-btn');
  if (summaryBtn) {
    summaryBtn.addEventListener('click', async () => {
      await openVectorSummaryMenu(chat);
    });
  }

  // 编辑/删除核心记忆
  container.querySelectorAll('.vm-edit-core-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const mem = chat.vectorMemory.coreMemories.find(m => m.id === id);
      if (!mem) return;
      const newContent = await showCustomPrompt('编辑核心记忆', '修改内容：', mem.content);
      if (newContent !== null && newContent.trim()) {
        window.vectorMemoryManager.editCoreMemory(chat, id, newContent.trim());
        await db.chats.put(chat);
        renderVectorMemoryView();
      }
    });
  });
  container.querySelectorAll('.vm-delete-core-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await showCustomConfirm('确认删除', '确定要删除这条核心记忆吗？');
      if (confirmed) {
        window.vectorMemoryManager.deleteCoreMemory(chat, btn.dataset.id);
        await db.chats.put(chat);
        renderVectorMemoryView();
      }
    });
  });

  // 钉选/编辑/删除记忆片段
  container.querySelectorAll('.vm-pin-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      window.vectorMemoryManager.pinToCoreMemory(chat, btn.dataset.id);
      await db.chats.put(chat);
      renderVectorMemoryView();
      showToast('已钉选为核心记忆', 'success');
    });
  });
  container.querySelectorAll('.vm-edit-frag-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const frag = window.vectorMemoryManager.getFragment(chat, btn.dataset.id);
      if (!frag) return;
      const newContent = await showCustomPrompt('编辑记忆片段', '修改内容：', frag.content, 'textarea');
      if (newContent !== null && newContent.trim()) {
        window.vectorMemoryManager.editFragment(chat, btn.dataset.id, { content: newContent.trim() });
        // 重新生成embedding
        const embedding = await window.vectorMemoryManager.getEmbedding(newContent.trim(), chat);
        if (embedding) frag.embedding = embedding;
        await db.chats.put(chat);
        renderVectorMemoryView();
      }
    });
  });
  container.querySelectorAll('.vm-delete-frag-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await showCustomConfirm('确认删除', '确定要删除这条记忆片段吗？');
      if (confirmed) {
        window.vectorMemoryManager.deleteFragment(chat, btn.dataset.id);
        await db.chats.put(chat);
        renderVectorMemoryView();
      }
    });
  });
}

async function openVectorMemorySettings(chat) {
  const settingsHtml = window.vectorMemoryManager.renderSettingsPanel(chat);

  const guideHtml = `
    <div class="vm-guide">
      <div class="vm-guide-section">
        <h4>什么是向量记忆？</h4>
        <p>向量记忆是一种智能记忆系统。它不会把所有记忆都塞进对话里（太费token），而是根据当前聊天内容，自动检索出最相关的记忆注入给AI。</p>
        <p>就像人脑一样：你不会时刻想着所有事，但当有人提到某个关键词，相关的记忆就会自然浮现。</p>
      </div>
      <div class="vm-guide-section">
        <h4>三层记忆架构</h4>
        <div class="vm-guide-card">
          <div class="vm-guide-card-title">第一层：核心记忆（永久注入）</div>
          <p>最重要的信息，比如用户的名字、生日、你们的关系。每次对话都会带上，不需要检索。</p>
          <p class="vm-guide-tip">建议：只放5-10条最核心的事实，太多就失去意义了。</p>
        </div>
        <div class="vm-guide-card">
          <div class="vm-guide-card-title">第二层：记忆片段（按需检索）</div>
          <p>大量的记忆存在这里。每条记忆都有关键词标签和向量。对话时系统会自动找出最相关的几条注入。</p>
          <p class="vm-guide-tip">这是省token的关键：100条记忆可能只注入8条，但都是最相关的。</p>
        </div>
        <div class="vm-guide-card">
          <div class="vm-guide-card-title">第三层：时间线摘要</div>
          <p>自动生成的近期动态摘要，让AI知道"最近发生了什么"，保持时间连续感。</p>
        </div>
      </div>
      <div class="vm-guide-section">
        <h4>双通道检索</h4>
        <p>系统同时用两种方式搜索记忆：</p>
        <div class="vm-guide-card">
          <div class="vm-guide-card-title">通道A：语义检索（Embedding）</div>
          <p>把文字转成数字向量，通过数学计算找到意思相近的记忆。比如用户说"好想吃甜的"，能匹配到"喜欢草莓蛋糕"。</p>
          <p class="vm-guide-tip">需要API支持 /v1/embeddings 接口。如果不支持，系统会自动退化为纯关键词模式。</p>
        </div>
        <div class="vm-guide-card">
          <div class="vm-guide-card-title">通道B：关键词匹配</div>
          <p>直接匹配文字关键词。作为语义检索的兜底，确保精确提到的内容不会被遗漏。</p>
        </div>
      </div>
      <div class="vm-guide-section">
        <h4>Embedding 设置说明</h4>
        <p>Embedding就是把文字转成向量的过程。默认会用你已配置的主API自动调用。</p>
        <p>如果你的API不支持embedding接口，或者想用专门的embedding服务（更便宜），可以打开"自定义Embedding端点"单独配置。</p>
        <p class="vm-guide-tip">大部分用户不需要动这个设置。如果embedding不可用，系统会自动用纯关键词模式工作，只是检索精度稍低。</p>
      </div>
      <div class="vm-guide-section">
        <h4>评分权重说明</h4>
        <p>检索时，每条记忆的最终得分由5个因素加权计算：</p>
        <div class="vm-guide-list">
          <div><span class="vm-guide-label">语义相似度</span>向量检索的匹配程度</div>
          <div><span class="vm-guide-label">关键词匹配</span>文字关键词的命中率</div>
          <div><span class="vm-guide-label">重要度</span>记忆本身的重要程度（1-10）</div>
          <div><span class="vm-guide-label">情感权重</span>记忆的情感强度（1-10）</div>
          <div><span class="vm-guide-label">时间衰减</span>越新的记忆得分越高（半衰期30天）</div>
        </div>
        <p class="vm-guide-tip">默认权重已经过调优，一般不需要修改。如果你发现检索结果不理想，可以微调。</p>
      </div>
      <div class="vm-guide-section">
        <h4>主动回忆</h4>
        <p>除了被动检索，系统还会主动触发记忆：</p>
        <div class="vm-guide-list">
          <div><span class="vm-guide-label">日期触发</span>今天是某个记忆中提到的日期（如生日、纪念日），自动注入</div>
          <div><span class="vm-guide-label">情感触发</span>检测到对话情绪变化时，拉取过去类似情绪的记忆</div>
          <div><span class="vm-guide-label">话题触发</span>对话话题转换时，检索新话题相关的历史记忆</div>
          <div><span class="vm-guide-label">定期复习</span>定期让AI"复习"重要记忆，防止遗忘</div>
        </div>
      </div>
      <div class="vm-guide-section">
        <h4>快速上手</h4>
        <div class="vm-guide-steps">
          <div class="vm-guide-step"><span class="vm-step-num">1</span>在聊天设置中把记忆模式切换为"向量记忆"</div>
          <div class="vm-guide-step"><span class="vm-step-num">2</span>开启"自动总结长期记忆"，设置总结间隔（建议20条）</div>
          <div class="vm-guide-step"><span class="vm-step-num">3</span>正常聊天，系统会自动提取记忆并生成向量</div>
          <div class="vm-guide-step"><span class="vm-step-num">4</span>也可以手动添加核心记忆（用户的关键信息）</div>
          <div class="vm-guide-step"><span class="vm-step-num">5</span>在记忆列表中可以编辑、删除、钉选任何记忆</div>
        </div>
      </div>
      <div class="vm-guide-section">
        <h4>导入导出</h4>
        <p>向量记忆支持导出为JSON文件，方便备份和分享。导入时会自动重新生成向量，所以导出文件不包含向量数据，体积很小。</p>
        <p class="vm-guide-tip">导入支持"合并"和"替换"两种模式。合并会保留现有数据并去重，替换会清空后重新导入。</p>
      </div>
    </div>
  `;

  // 创建全屏设置面板
  let panel = document.getElementById('vm-settings-screen');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'vm-settings-screen';
  panel.className = 'vm-fullscreen-panel';
  panel.innerHTML = `
    <div class="vm-panel-header">
      <span class="vm-panel-back" id="vm-settings-back">&lsaquo;</span>
      <span class="vm-panel-title">向量记忆</span>
      <span style="width:30px;"></span>
    </div>
    <div class="vm-panel-tabs">
      <div class="vm-panel-tab active" data-tab="settings">设置</div>
      <div class="vm-panel-tab" data-tab="guide">使用教程</div>
    </div>
    <div class="vm-panel-body">
      <div class="vm-panel-content active" id="vm-tab-settings">${settingsHtml}</div>
      <div class="vm-panel-content" id="vm-tab-guide">${guideHtml}</div>
    </div>
  `;
  document.body.appendChild(panel);

  // Tab切换
  panel.querySelectorAll('.vm-panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.vm-panel-tab').forEach(t => t.classList.remove('active'));
      panel.querySelectorAll('.vm-panel-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = panel.querySelector('#vm-tab-' + tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  // 返回按钮
  panel.querySelector('#vm-settings-back').addEventListener('click', () => {
    panel.remove();
  });

  // 绑定checkbox联动
  const customEmbeddingCb = panel.querySelector('#vm-custom-embedding');
  if (customEmbeddingCb) {
    customEmbeddingCb.addEventListener('change', () => {
      const fields = panel.querySelector('#vm-custom-embedding-fields');
      if (fields) fields.style.display = customEmbeddingCb.checked ? 'block' : 'none';
    });
  }
  const periodicCb = panel.querySelector('#vm-periodic-review');
  if (periodicCb) {
    periodicCb.addEventListener('change', () => {
      const group = panel.querySelector('#vm-review-interval-group');
      if (group) group.style.display = periodicCb.checked ? 'block' : 'none';
    });
  }
  const customPromptCb = panel.querySelector('#vm-custom-prompt');
  if (customPromptCb) {
    customPromptCb.addEventListener('change', () => {
      const field = panel.querySelector('#vm-custom-prompt-field');
      if (field) field.style.display = customPromptCb.checked ? 'block' : 'none';
    });
  }

  // 重置提示词按钮
  const resetPromptBtn = panel.querySelector('#vm-reset-prompt-btn');
  if (resetPromptBtn) {
    resetPromptBtn.addEventListener('click', () => {
      const textarea = panel.querySelector('#vm-custom-prompt-text');
      if (textarea) {
        textarea.value = window.vectorMemoryManager.getDefaultExtractionPrompt();
        showToast('已重置为默认提示词', 'success');
      }
    });
  }

  // 拉取模型按钮
  const fetchModelsBtn = panel.querySelector('#vm-fetch-models-btn');
  if (fetchModelsBtn) {
    fetchModelsBtn.addEventListener('click', async () => {
      const listEl = panel.querySelector('#vm-models-list');
      if (!listEl) return;
      fetchModelsBtn.textContent = '拉取中...';
      fetchModelsBtn.disabled = true;
      try {
        const models = await window.vectorMemoryManager.fetchAvailableModels(chat);
        if (models.length === 0) {
          listEl.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-secondary,#999);font-size:13px;">未找到可用模型</div>';
        } else {
          const embeddingKeywords = ['embed', 'embedding', 'text-embedding', 'bge', 'e5', 'gte', 'jina'];
          listEl.innerHTML = models.map(m => {
            const isEmb = embeddingKeywords.some(k => m.toLowerCase().includes(k));
            return `<div class="vm-model-item${isEmb ? ' vm-model-recommended' : ''}" data-model="${m}" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border-color,#eee);font-size:13px;display:flex;justify-content:space-between;align-items:center;">
              <span>${m}</span>
              ${isEmb ? '<span style="font-size:10px;color:#007aff;background:rgba(0,122,255,0.1);padding:2px 6px;border-radius:4px;">推荐</span>' : ''}
            </div>`;
          }).join('');
        }
        listEl.style.display = 'block';

        // 点击选择模型
        listEl.querySelectorAll('.vm-model-item').forEach(item => {
          item.addEventListener('click', () => {
            const modelInput = panel.querySelector('#vm-embedding-model');
            if (modelInput) modelInput.value = item.dataset.model;
            listEl.style.display = 'none';
            showToast('已选择: ' + item.dataset.model, 'success');
          });
        });
      } catch (e) {
        showToast('拉取模型失败: ' + e.message, 'error');
      } finally {
        fetchModelsBtn.textContent = '拉取模型';
        fetchModelsBtn.disabled = false;
      }
    });
  }

  // 保存按钮
  const saveBtn = panel.querySelector('#vm-save-settings-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      window.vectorMemoryManager.saveSettingsFromUI(chat);
      await db.chats.put(chat);
      panel.remove();
      showToast('设置已保存', 'success');
    });
  }
}

// ==================== 向量记忆自动总结 ====================
// ===== 向量记忆提取核心逻辑（公共函数） =====
async function executeVectorExtraction(chat, messages, updateTimestamp = false) {
  if (messages.length === 0) {
    showToast('没有可总结的消息', 'info');
    return;
  }

  const userNickname = chat.settings.myNickname || '用户';
  const formattedHistory = messages.map(msg => {
    const sender = msg.role === 'user' ? userNickname : (msg.senderName || chat.name || chat.originalName);
    const time = new Date(msg.timestamp).toLocaleString('zh-CN');
    let content = '';
    if (msg.type === 'voice_message') content = `[语音] ${msg.content}`;
    else if (msg.type === 'ai_image') content = `[图片: ${msg.content}]`;
    else if (Array.isArray(msg.content)) content = '[图片]';
    else content = String(msg.content || '');
    return `(${time}) ${sender}: ${content}`;
  }).join('\n');

  const firstTime = new Date(messages[0].timestamp).toLocaleString('zh-CN');
  const lastTime = new Date(messages[messages.length - 1].timestamp).toLocaleString('zh-CN');
  const timeRangeStr = `${firstTime} ~ ${lastTime}`;

  const prompt = window.vectorMemoryManager.buildExtractionPrompt(chat, formattedHistory, timeRangeStr);

  showToast('正在提取向量记忆...', 'info');
  const apiConfig = window.state.apiConfig;
  const useSecondary = apiConfig.secondaryProxyUrl && apiConfig.secondaryApiKey && apiConfig.secondaryModel;
  const proxyUrl = useSecondary ? apiConfig.secondaryProxyUrl : apiConfig.proxyUrl;
  const apiKey = useSecondary ? apiConfig.secondaryApiKey : apiConfig.apiKey;
  const model = useSecondary ? apiConfig.secondaryModel : apiConfig.model;

  const isGemini = proxyUrl === window.GEMINI_API_URL;
  let response;
  if (isGemini && typeof toGeminiRequestData === 'function') {
    const geminiConfig = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '请开始提取。' }]);
    response = await fetch(geminiConfig.url, geminiConfig.data);
  } else {
    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: '请开始提取。' }], temperature: 0.3 })
    });
  }

  if (!response.ok) throw new Error(`API返回 ${response.status}`);
  const data = await response.json();
  const rawText = typeof getGeminiResponseText === 'function' ? getGeminiResponseText(data) : (data.choices?.[0]?.message?.content || '');

  const extracted = window.vectorMemoryManager.parseExtractionResult(rawText);
  if (extracted.length > 0) {
    const newIds = await window.vectorMemoryManager.mergeExtractedMemories(chat, extracted);
    if (updateTimestamp) {
      const vm = window.vectorMemoryManager.getVectorMemory(chat);
      vm.lastExtractionTimestamp = messages[messages.length - 1].timestamp;
    }
    await db.chats.put(chat);
    showToast(`成功提取 ${newIds.length} 条向量记忆`, 'success');
    if (document.getElementById('vector-memory-container')?.style.display !== 'none') {
      renderVectorMemoryView();
    }
  } else {
    showToast('未提取到新的记忆', 'info');
  }
}

// ===== 向量记忆总结模式选择菜单 =====
async function openVectorSummaryMenu(chat) {
  const vm = window.vectorMemoryManager.getVectorMemory(chat);
  const lastTimestamp = vm.lastExtractionTimestamp || 0;
  const totalMessages = chat.history.length;
  const newMessages = chat.history.filter(m => m.timestamp > lastTimestamp && (!m.isHidden || (m.role === 'system' && m.content && m.content.includes('内心独白'))));
  const lastDateStr = lastTimestamp ? new Date(lastTimestamp).toLocaleString('zh-CN') : '从未更新';

  return new Promise(resolve => {
    window._modalResolve = (result) => { resolve(result); };
    window._modalTitle.textContent = '选择总结模式';

    const options = [
      {
        id: 'new-messages',
        title: '新消息总结',
        description: '总结上次之后的新消息',
        info: `待处理消息：${newMessages.length} 条`
      },
      {
        id: 'range',
        title: '范围总结',
        description: '指定消息范围进行总结',
        info: `总消息数：${totalMessages} 条`
      },
      {
        id: 'reset',
        title: '重置时间戳',
        description: '重置后下次对话重新总结',
        info: `上次更新：${lastDateStr}`
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
        }
      } else {
        showToast('请选择一个模式', 'info');
      }
    };

    cancelBtn.onclick = () => { hideCustomModal(); };
    showCustomModal();
  });
}

// ===== 向量记忆 - 新消息总结 =====
async function handleVectorNewMessagesSummary(chat) {
  const vm = window.vectorMemoryManager.getVectorMemory(chat);
  const lastTimestamp = vm.lastExtractionTimestamp || 0;
  const newMessages = chat.history.filter(m => m.timestamp > lastTimestamp && (!m.isHidden || (m.role === 'system' && m.content && m.content.includes('内心独白'))));

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
    await executeVectorExtraction(chat, newMessages, true);
  } catch (error) {
    console.error('[向量记忆-新消息总结] 错误:', error);
    showToast('总结失败：' + error.message, 'error');
  }
}

// ===== 向量记忆 - 范围总结 =====
async function handleVectorRangeSummary(chat) {
  const totalMessages = chat.history.length;

  return new Promise(resolve => {
    window._modalResolve = resolve;
    window._modalTitle.textContent = '范围总结（向量记忆）';

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

      showToast(`正在总结第 ${start}-${end} 条消息...`, 'info');
      try {
        await executeVectorExtraction(chat, validMessages, updateTimestamp);
      } catch (error) {
        console.error('[向量记忆-范围总结] 错误:', error);
        showToast('总结失败：' + error.message, 'error');
      }
    };

    cancelBtn.onclick = () => { hideCustomModal(); };
    showCustomModal();
  });
}

// ===== 向量记忆 - 重置时间戳 =====
async function handleVectorResetTimestamp(chat) {
  const vm = window.vectorMemoryManager.getVectorMemory(chat);
  const lastTimestamp = vm.lastExtractionTimestamp || 0;
  const lastDateStr = lastTimestamp ? new Date(lastTimestamp).toLocaleString('zh-CN') : '从未更新';
  const totalMessages = chat.history.length;
  const newMessages = chat.history.filter(m => m.timestamp > lastTimestamp && (!m.isHidden || (m.role === 'system' && m.content && m.content.includes('内心独白'))));

  const message = `当前状态：
- 上次更新：${lastDateStr}
- 总消息数：${totalMessages}
- 待处理消息：${newMessages.length}

重置后下次对话将重新提取所有未处理的消息。

确定要重置吗？`;

  const confirmed = await showCustomConfirm('确认重置', message);
  if (confirmed) {
    vm.lastExtractionTimestamp = 0;
    await db.chats.put(chat);
    showToast('已重置，下次对话将重新提取记忆', 'success');
  }
}

// ===== 兼容旧的自动总结调用 =====
async function triggerVectorMemorySummary(chatId, force = false) {
  const chat = state.chats[chatId];
  if (!chat || !window.vectorMemoryManager) return;

  const vm = window.vectorMemoryManager.getVectorMemory(chat);
  const lastTimestamp = vm.lastExtractionTimestamp || 0;

  let messagesToProcess;
  if (force) {
    messagesToProcess = chat.history.filter(m => !m.isHidden || (m.role === 'system' && m.content && m.content.includes('内心独白'))).slice(-(chat.settings.autoMemoryInterval || 20));
  } else {
    messagesToProcess = chat.history.filter(m => m.timestamp > lastTimestamp && (!m.isHidden || (m.role === 'system' && m.content && m.content.includes('内心独白'))));
  }

  if (messagesToProcess.length === 0) {
    if (force) showToast('没有新的对话需要总结', 'info');
    return;
  }

  try {
    await executeVectorExtraction(chat, messagesToProcess, !force);
  } catch (e) {
    console.error('[向量记忆] 总结失败:', e);
    showToast('向量记忆总结失败: ' + e.message, 'error');
  }
}

window.triggerVectorMemorySummary = triggerVectorMemorySummary;

// 1. 修改 renderLongTermMemoryList (只负责准备数据和重置)
function renderLongTermMemoryList() {
  const container = document.getElementById('original-memory-list') || document.getElementById('memory-list-container');
  const chat = state.chats[state.activeChatId];
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
                      <button class="memory-action-btn edit-memory-btn" data-author-id="${memory.authorChatId}" data-memory-timestamp="${memory.timestamp}" title="编辑">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                          </svg>
                      </button>
                      <button class="memory-action-btn delete-memory-btn" data-author-id="${memory.authorChatId}" data-memory-timestamp="${memory.timestamp}" title="删除">
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
    targetChatForMemory.longTermMemory.push({
      content: content.trim(),
      timestamp: Date.now(),
      source: 'manual'
    });
    await db.chats.put(targetChatForMemory);
    renderLongTermMemoryList();
  }
}



async function handleEditMemory(authorChatId, memoryTimestamp) {
  const authorChat = state.chats[authorChatId];
  if (!authorChat || !authorChat.longTermMemory) return;
  const memoryIndex = authorChat.longTermMemory.findIndex(m => m.timestamp === memoryTimestamp);
  if (memoryIndex === -1) return;
  const memory = authorChat.longTermMemory[memoryIndex];
  const newContent = await showCustomPrompt('编辑记忆', '请修改记忆要点：', memory.content, 'textarea');
  if (newContent && newContent.trim()) {
    memory.content = newContent.trim();
    await db.chats.put(authorChat);
    renderLongTermMemoryList();
  }
}

async function handleDeleteMemory(authorChatId, memoryTimestamp) {
  const confirmed = await showCustomConfirm('确认删除', '确定要删除这条长期记忆吗？', {
    confirmButtonClass: 'btn-danger'
  });
  if (confirmed) {
    const authorChat = state.chats[authorChatId];
    if (!authorChat || !authorChat.longTermMemory) return;
    authorChat.longTermMemory = authorChat.longTermMemory.filter(m => m.timestamp !== memoryTimestamp);
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
        await triggerStructuredMemorySummary(state.activeChatId, true);
        showToast('结构化记忆已同步更新', 'success');
      }
    }
  }
}

// ==================== 结构化动态记忆 - 长期记忆转换 ====================
async function convertLongTermMemoryToStructured(chatId) {
  const chat = state.chats[chatId];
  if (!chat || !window.structuredMemoryManager || !chat.longTermMemory || chat.longTermMemory.length === 0) {
    showToast('没有可转换的长期记忆', 'warning');
    return;
  }

  const totalMemories = chat.longTermMemory.length;
  const BATCH_SIZE = 50; // 每批处理50条记忆
  const totalBatches = Math.ceil(totalMemories / BATCH_SIZE);

  // 估算总 token 数
  const estimatedTotalTokens = chat.longTermMemory.reduce((sum, mem) => sum + mem.content.length, 0) / 1.5;
  
  // 预检查：如果记忆过多，给出提示
  let shouldProceed = true;
  if (totalMemories > 100) {
    const message = `检测到大量长期记忆：\n\n- 记忆数量：${totalMemories} 条\n- 估算 Token：约 ${Math.ceil(estimatedTotalTokens)} tokens\n- 将分 ${totalBatches} 批转换\n- 预计耗时：${Math.ceil(totalBatches * 0.5)} 分钟\n\n继续转换？`;
    shouldProceed = await showCustomConfirm('长期记忆转换', message);
  }

  if (!shouldProceed) {
    showToast('已取消转换', 'info');
    return;
  }

  const userNickname = chat.settings.myNickname || (state.qzoneSettings.nickname || '用户');
  
  // API 配置
  const useSecondaryApi = state.apiConfig.secondaryProxyUrl && state.apiConfig.secondaryApiKey && state.apiConfig.secondaryModel;
  const { proxyUrl, apiKey, model } = useSecondaryApi
    ? { proxyUrl: state.apiConfig.secondaryProxyUrl, apiKey: state.apiConfig.secondaryApiKey, model: state.apiConfig.secondaryModel }
    : state.apiConfig;

  if (!proxyUrl || !apiKey || !model) {
    showToast('API未配置，无法转换', 'error');
    return;
  }

  // 创建进度提示
  let progressToast = null;
  let isCancelled = false;
  
  const updateProgress = (current, total, successCount) => {
    const message = `转换中... ${current}/${total} 批\n已提取 ${successCount} 条结构化记忆`;
    if (progressToast) {
      // 更新现有提示
      const toastElement = document.querySelector('.toast:last-child');
      if (toastElement) {
        toastElement.textContent = message;
      }
    } else {
      progressToast = showToast(message, 'info', 0); // 持续显示
    }
  };

  let totalEntriesExtracted = 0;
  let successfulBatches = 0;
  let failedBatches = 0;

  try {
    // 分批处理
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      if (isCancelled) {
        showToast('转换已取消', 'info');
        break;
      }

      const start = batchIndex * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, totalMemories);
      const batchMemories = chat.longTermMemory.slice(start, end);

      updateProgress(batchIndex + 1, totalBatches, totalEntriesExtracted);

      // 格式化当前批次的记忆
      const formattedMemories = batchMemories.map((mem, index) => {
        const date = new Date(mem.timestamp);
        const dateStr = date.toLocaleString('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false
        });
        return `[记忆 ${start + index + 1}] (${dateStr}) ${mem.content}`;
      }).join('\n');

      const timeRangeStr = `长期记忆库 第 ${batchIndex + 1}/${totalBatches} 批 (共 ${batchMemories.length} 条)`;
      const systemPrompt = window.structuredMemoryManager.buildSummaryPrompt(chat, formattedMemories, timeRangeStr);

      try {
        let isGemini = proxyUrl.includes('generativelanguage');
        let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, [{ role: 'user', content: '请将以上长期记忆全部提取为结构化记忆条目。' }]);

        const response = isGemini
          ? await fetch(geminiConfig.url, geminiConfig.data)
          : await fetch(`${proxyUrl}/v1/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              body: JSON.stringify({
                model,
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: '请将以上长期记忆全部提取为结构化记忆条目。' }],
                temperature: 0.3
              })
            });

        if (!response.ok) {
          console.warn(`批次 ${batchIndex + 1} API 错误: ${response.statusText}`);
          failedBatches++;
          continue;
        }

        const data = await response.json();
        let rawContent = isGemini ? getGeminiResponseText(data) : data.choices[0].message.content;
        rawContent = rawContent.replace(/^```[a-z]*\s*/g, '').replace(/```$/g, '').trim();

        // 解析并合并
        const entries = window.structuredMemoryManager.parseMemoryEntries(rawContent, chat);
        if (entries.length > 0) {
          window.structuredMemoryManager.mergeEntries(chat, entries);
          totalEntriesExtracted += entries.length;
          successfulBatches++;
          console.log(`批次 ${batchIndex + 1}/${totalBatches}: 成功提取 ${entries.length} 条记忆`);
        } else {
          console.warn(`批次 ${batchIndex + 1}/${totalBatches}: AI 未返回有效数据`);
          console.warn('AI 返回内容:', rawContent.substring(0, 500)); // 记录前500字符用于调试
          failedBatches++;
        }

        // 每批处理后保存一次
        await db.chats.put(chat);

        // 批次间延迟，避免 API 限流
        if (batchIndex < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 延迟1秒
        }

      } catch (batchError) {
        console.error(`批次 ${batchIndex + 1} 处理出错:`, batchError);
        failedBatches++;
        continue;
      }
    }

    // 清除进度提示
    if (progressToast) {
      const toastElements = document.querySelectorAll('.toast');
      toastElements.forEach(el => el.remove());
    }

    // 最终结果提示
    if (totalEntriesExtracted > 0) {
      let resultMessage = `转换完成！\n- 成功批次：${successfulBatches}/${totalBatches}\n- 提取记忆：${totalEntriesExtracted} 条`;
      if (failedBatches > 0) {
        resultMessage += `\n- 失败批次：${failedBatches}`;
      }
      showToast(resultMessage, successfulBatches === totalBatches ? 'success' : 'warning', 5000);
      console.log(`长期记忆转换完成: ${totalMemories} 条记忆 -> ${totalEntriesExtracted} 条结构化记忆 (${successfulBatches}/${totalBatches} 批成功)`);
    } else {
      showToast(`转换失败：所有批次都未能提取有效数据\n- 原记忆数：${totalMemories} 条\n- 失败批次：${failedBatches}\n\n可能原因：\n1. Token 数量仍然过多\n2. AI 返回格式不符合要求\n3. API 配置问题\n\n请查看控制台获取详细信息`, 'error', 8000);
      console.error('长期记忆转换失败：未能提取任何有效条目');
      console.error('记忆总数:', totalMemories);
      console.error('估算 tokens:', Math.ceil(estimatedTotalTokens));
    }

  } catch (error) {
    // 清除进度提示
    if (progressToast) {
      const toastElements = document.querySelectorAll('.toast');
      toastElements.forEach(el => el.remove());
    }
    
    console.error('长期记忆转换出错:', error);
    showToast(`转换失败：${error.message}\n已成功转换 ${successfulBatches} 批`, 'error', 5000);
  }
}

// ==================== 结构化动态记忆 - 自动总结 ====================
async function triggerStructuredMemorySummary(chatId, forceUpdate = false) {
  const chat = state.chats[chatId];
  if (!chat || !window.structuredMemoryManager) return;

  const lastTimestamp = chat.lastStructuredMemoryTimestamp || 0;
  const messagesToSummarize = chat.history.filter(m => m.timestamp > lastTimestamp && (!m.isHidden || (m.role === 'system' && m.content.includes('内心独白'))));

  console.log(`[结构化记忆] 检查更新: 上次时间戳=${lastTimestamp}, 待总结消息=${messagesToSummarize.length}条`);

  // 如果不是强制更新且消息太少，则跳过
  if (!forceUpdate && messagesToSummarize.length < 5) {
    console.log(`[结构化记忆] 消息数量不足(${messagesToSummarize.length}/5)，跳过本次更新`);
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

  // 格式化对话历史
  const formattedHistory = messagesToSummarize.map(msg => {
    if (msg.isHidden && msg.role === 'system' && msg.content.includes('内心独白')) return msg.content;
    if (msg.isHidden) return null;
    let sender = msg.role === 'user' ? userNickname : (msg.senderName || chat.originalName);
    let contentToSummarize = '';
    if (msg.type === 'offline_text') {
      contentToSummarize = msg.content || `${msg.dialogue || ''} ${msg.description || ''}`.trim();
    } else if (typeof msg.content === 'string') {
      contentToSummarize = msg.content;
    } else if (msg.type === 'voice_message') {
      contentToSummarize = `[语音: ${msg.content}]`;
    } else if (msg.type === 'ai_image' || msg.type === 'user_photo') {
      contentToSummarize = `[图片: ${msg.content}]`;
    } else if (msg.type === 'sticker') {
      contentToSummarize = `[表情: ${msg.meaning || 'sticker'}]`;
    } else {
      contentToSummarize = `[${msg.type || '消息'}]`;
    }
    const msgTime = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `[${msgTime}] ${sender}: ${contentToSummarize}`;
  }).filter(Boolean).join('\n');

  const systemPrompt = window.structuredMemoryManager.buildSummaryPrompt(chat, formattedHistory, timeRangeStr);

  try {
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
      const newTimestamp = endMsg.timestamp;
      chat.lastStructuredMemoryTimestamp = newTimestamp;
      await db.chats.put(chat);
      console.log(`[结构化记忆] 成功提取并合并 ${entries.length} 条记忆条目`);
      console.log(`[结构化记忆] 时间戳已更新: ${lastTimestamp} -> ${newTimestamp}`);
    } else {
      console.warn('[结构化记忆] AI 未返回有效的记忆条目，保持原时间戳不变');
      console.log('[结构化记忆] AI原始返回:', rawContent);
      // 即使没有新条目，也应该更新时间戳，避免重复处理相同消息
      if (messagesToSummarize.length > 0) {
        chat.lastStructuredMemoryTimestamp = endMsg.timestamp;
        await db.chats.put(chat);
        console.log(`[结构化记忆] 虽无有效条目，但已更新时间戳避免重复处理`);
      }
    }
  } catch (error) {
    console.error('[结构化记忆] 总结出错:', error);
    // 即使出错，也更新时间戳，避免一直卡在同一批消息上
    if (messagesToSummarize.length > 0) {
      chat.lastStructuredMemoryTimestamp = endMsg.timestamp;
      await db.chats.put(chat);
      console.log(`[结构化记忆] 虽然出错，但已更新时间戳以避免死循环`);
    }
  }
}

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
  const newMessages = chat.history.filter(m => m.timestamp > lastTimestamp && (!m.isHidden || (m.role === 'system' && m.content.includes('内心独白'))));

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
      const validMessages = rangeMessages.filter(m => !m.isHidden || (m.role === 'system' && m.content.includes('内心独白')));

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
    if (msg.isHidden && msg.role === 'system' && msg.content.includes('内心独白')) return msg.content;
    if (msg.isHidden) return null;
    let sender = msg.role === 'user' ? userNickname : (msg.senderName || chat.originalName);
    let contentToSummarize = '';
    if (msg.type === 'offline_text') {
      contentToSummarize = msg.content || `${msg.dialogue || ''} ${msg.description || ''}`.trim();
    } else if (typeof msg.content === 'string') {
      contentToSummarize = msg.content;
    } else if (msg.type === 'voice_message') {
      contentToSummarize = `[语音: ${msg.content}]`;
    } else if (msg.type === 'ai_image' || msg.type === 'user_photo') {
      contentToSummarize = `[图片: ${msg.content}]`;
    } else if (msg.type === 'sticker') {
      contentToSummarize = `[表情: ${msg.meaning || 'sticker'}]`;
    } else {
      contentToSummarize = `[${msg.type || '消息'}]`;
    }
    const msgTime = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `[${msgTime}] ${sender}: ${contentToSummarize}`;
  }).filter(Boolean).join('\n');

  const systemPrompt = window.structuredMemoryManager.buildSummaryPrompt(chat, formattedHistory, timeRangeStr);

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
  if (updateTimestamp) {
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
  const availableMessages = chat.history.filter(m => !m.isHidden || (m.role === 'system' && m.content.includes('内心独白')));
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
  const unsummarizedMessages = chat.history.filter(m => m.timestamp > lastSummaryTimestamp && (!m.isHidden || (m.role === 'system' && m.content.includes('内心独白'))));

  if (unsummarizedMessages.length < 5) {
    await showCustomAlert('消息太少', `上次总结之后只有 ${unsummarizedMessages.length} 条新消息，至少需要5条才能进行有意义的总结。`);
    return;
  }

  const confirmed = await showCustomConfirm('日记模式总结', `将总结上次总结之后的所有消息（共 ${unsummarizedMessages.length} 条），会消耗API额度。确定要继续吗？`);
  if (confirmed) {
    const memoryMode = chat.settings.memoryMode || 'diary';
    if (memoryMode === 'vector' && window.vectorMemoryManager) {
      await triggerVectorMemorySummary(state.activeChatId, true);
    } else {
      await triggerAutoSummary(state.activeChatId, true);
      if ((memoryMode === 'structured' || chat.settings.enableStructuredMemory) && window.structuredMemoryManager) {
        await triggerStructuredMemorySummary(state.activeChatId, true);
        showToast('结构化记忆已同步更新', 'success');
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
  const availableMessages = chat.history.filter(m => !m.isHidden || (m.role === 'system' && m.content.includes('内心独白')));

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


// 全局暴露手动总结相关函数
window.openManualSummaryModal = openManualSummaryModal;
window.closeManualSummaryModal = closeManualSummaryModal;
window.executeManualSummary = executeManualSummary;

async function checkAndTriggerAutoSummary(chatId) {
  const chat = state.chats[chatId];
  if (!chat || !chat.settings.enableAutoMemory) return;

  const lastSummaryTimestamp = chat.lastMemorySummaryTimestamp || 0;
  const messagesSinceLastSummary = chat.history.filter(m => m.timestamp > lastSummaryTimestamp && !m.isHidden);

  if (messagesSinceLastSummary.length >= chat.settings.autoMemoryInterval) {
    console.log(`达到自动总结阈值 (${messagesSinceLastSummary.length}/${chat.settings.autoMemoryInterval})，开始总结...`);
    
    const memoryMode = chat.settings.memoryMode || 'diary';
    
    if (memoryMode === 'vector' && window.vectorMemoryManager) {
      // 向量记忆模式：只触发向量记忆总结
      await triggerVectorMemorySummary(chatId);
    } else if (memoryMode === 'structured' && window.structuredMemoryManager) {
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


async function summarizeCallTranscript(chatId, transcriptText) {
  const chat = state.chats[chatId];
  if (!chat || !transcriptText) {
    throw new Error("基础数据不完整，无法开始总结。");
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

    if (result.summary && result.summary.trim()) {
      const newMemoryEntry = {
        content: `(在那次${chat.isGroup ? '群聊' : ''}通话中，${result.summary.trim()})`,
        timestamp: Date.now(),
        source: chat.isGroup ? 'group_call_summary' : 'call_summary'
      };
      if (!targetMemoryChat.longTermMemory) targetMemoryChat.longTermMemory = [];
      targetMemoryChat.longTermMemory.push(newMemoryEntry);
      await db.chats.put(targetMemoryChat);
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

  const memoryContent = memoriesToRefine.map(mem => `- ${mem.content}`).join('\n');
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
    timeRule = `3.  **【时间转换铁律 (必须遵守)】**: 如果记忆中提到了相对时间（如"明天"、"下周"），你【必须】结合"今天是${today}"这个信息，将其转换为【具体的公历日期】。`;
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


  await showCustomAlert("请稍候...", "正在请求AI进行记忆精炼...");

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
    let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, [{
      role: 'user',
      content: "请开始整合。"
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
            content: "请开始整合。"
          }],
          temperature: 0.7,
        })
      });

    if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

    const data = await response.json();
    let rawContent = isGemini ? getGeminiResponseText(data) : data.choices[0].message.content;

    const result = robustJsonParse(rawContent);

    if (result && result.summary && typeof result.summary === 'string' && result.summary.trim()) {

      const userConfirmedReplacement = await showCustomConfirm(
        '精炼完成，请确认',
        `AI已将您的 <strong>${rangeDescription}</strong> 总结为以下核心记忆：<br><br><div class="scrollable-content-preview">${result.summary.trim()}</div><br>是否用这条新记忆替换掉这些旧记忆？`, {
        confirmText: '确认替换',
        cancelText: '保留旧的',
        confirmButtonClass: 'btn-danger'
      }
      );

      if (userConfirmedReplacement) {
        const newMemoryEntry = {
          content: result.summary.trim(),
          timestamp: Date.now(),
          source: 'refined'
        };

        // 根据范围进行智能替换
        // 保留范围前的记忆 + 新的精炼记忆 + 保留范围后的记忆
        const memoriesBeforeRange = rangeStartIndex > 0 ? targetChatForRefine.longTermMemory.slice(0, rangeStartIndex) : [];
        const memoriesAfterRange = rangeEndIndex < totalMemories ? targetChatForRefine.longTermMemory.slice(rangeEndIndex) : [];

        targetChatForRefine.longTermMemory = [...memoriesBeforeRange, newMemoryEntry, ...memoriesAfterRange];

        targetChatForRefine.lastMemorySummaryTimestamp = Date.now();
        await db.chats.put(targetChatForRefine);

        if (document.getElementById('long-term-memory-screen').classList.contains('active')) {
          renderLongTermMemoryList();
        }
        await showCustomAlert('精炼成功', `已成功将 ${countToRefine} 条记忆精炼为 1 条核心记忆！`);
      } else {
        await showCustomAlert('操作已取消', '您的旧有记忆已被完整保留，未作任何修改。');
      }

    } else {
      throw new Error("AI返回了空的或格式不正确的总结内容。");
    }

  } catch (error) {
    console.error("精炼长期记忆时出错:", error);
    await showCustomAlert('精炼失败', `操作失败，请检查API配置或稍后重试。\n错误信息: ${error.message}`);
  }
}


async function triggerAutoSummary(chatId, force = false, customRange = null) {
  const chat = state.chats[chatId];
  if (!chat) return;

  const lastSummaryTimestamp = chat.lastMemorySummaryTimestamp || 0;
  let messagesToSummarize;

  if (customRange) {
    // 手动总结：使用自定义范围
    const allMessages = chat.history.filter(m => !m.isHidden || (m.role === 'system' && m.content.includes('内心独白')));
    const startIndex = Math.max(0, customRange.start - 1);
    const endIndex = Math.min(allMessages.length, customRange.end);
    messagesToSummarize = allMessages.slice(startIndex, endIndex);
  } else if (force && chat.settings.enableDiaryMode) {
    // 日记模式：总结上次总结之后的所有消息，不受 autoMemoryInterval 限制
    messagesToSummarize = chat.history.filter(m => m.timestamp > lastSummaryTimestamp && (!m.isHidden || (m.role === 'system' && m.content.includes('内心独白'))));
  } else {
    // 原有逻辑
    messagesToSummarize = force ?
      chat.history.filter(m => !m.isHidden || (m.role === 'system' && m.content.includes('内心独白'))).slice(-(chat.settings.autoMemoryInterval || 20)) :
      chat.history.filter(m => m.timestamp > lastSummaryTimestamp && (!m.isHidden || (m.role === 'system' && m.content.includes('内心独白'))));
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
    if (msg.isHidden && msg.role === 'system' && msg.content.includes('内心独白')) {
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

    const msgTime = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
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
              memberChat.longTermMemory.push(newMemoryEntry);
              await db.chats.put(memberChat);
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
        chat.longTermMemory.push(newMemoryEntry);
        await db.chats.put(chat);
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

  // ========== 全局暴露 ==========
  window.loadMoreMemories = loadMoreMemories;
  window.openLongTermMemoryScreen = openLongTermMemoryScreen;

  // ========== 从 script.js 迁移：renderMemoriesScreen 及辅助函数 ==========
  // activeCountdownTimers 已在 utils.js 中声明

  async function renderMemoriesScreen() {
    const listEl = document.getElementById('memories-list');
    listEl.innerHTML = '';

    const allMemories = await db.memories.orderBy('timestamp').reverse().toArray();

    if (allMemories.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">这里还没有共同的回忆和约定呢~</p>';
      return;
    }

    allMemories.sort((a, b) => {
      const aIsActiveCountdown = a.type === 'countdown' && a.targetDate > Date.now();
      const bIsActiveCountdown = b.type === 'countdown' && b.targetDate > Date.now();
      if (aIsActiveCountdown && !bIsActiveCountdown) return -1;
      if (!aIsActiveCountdown && bIsActiveCountdown) return 1;
      if (aIsActiveCountdown && bIsActiveCountdown) return a.targetDate - b.targetDate;
      return 0;
    });

    allMemories.forEach(item => {
      let card;
      if (item.type === 'countdown' && item.targetDate > Date.now()) {
        card = createCountdownCard(item);
      } else {
        card = createMemoryCard(item);
      }
      listEl.appendChild(card);
    });

    startAllCountdownTimers();
  }

  function createMemoryCard(memory) {
    const card = document.createElement('div');
    card.className = 'memory-card';
    const memoryDate = new Date(memory.timestamp);
    const dateString = `${memoryDate.getFullYear()}-${String(memoryDate.getMonth() + 1).padStart(2, '0')}-${String(memoryDate.getDate()).padStart(2, '0')} ${String(memoryDate.getHours()).padStart(2, '0')}:${String(memoryDate.getMinutes()).padStart(2, '0')}`;

    let titleHtml, contentHtml;

    if (memory.type === 'countdown' && memory.targetDate) {
      titleHtml = `[约定达成] ${memory.description}`;
      contentHtml = parseMarkdown(`在 ${new Date(memory.targetDate).toLocaleString()}，我们一起见证了这个约定。`).replace(/\n/g, '<br>');
    } else {
      let authorDisplayName = '我们的回忆';
      if (memory.authorId) {
        const authorChat = state.chats[memory.authorId];
        if (authorChat) {
          authorDisplayName = authorChat.name;
        } else {
          authorDisplayName = memory.authorName || '一位朋友';
        }
      } else if (memory.authorName) {
        authorDisplayName = memory.authorName;
      }
      titleHtml = `${authorDisplayName} 的日记`;
      contentHtml = parseMarkdown(memory.description);
    }

    card.innerHTML = `
                <div class="header">
                    <div class="date">${dateString}</div>
                    <div class="author">${titleHtml}</div>
                </div>
                <div class="content">${contentHtml}</div>
            `;
    addLongPressListener(card, async () => {
      const confirmed = await showCustomConfirm('删除记录', '确定要删除这条记录吗？', {
        confirmButtonClass: 'btn-danger'
      });
      if (confirmed) {
        await db.memories.delete(memory.id);
        renderMemoriesScreen();
      }
    });
    return card;
  }

  function createCountdownCard(countdown) {
    const card = document.createElement('div');
    card.className = 'countdown-card';
    const targetDate = new Date(countdown.targetDate);
    const targetDateString = targetDate.toLocaleString('zh-CN', {
      dateStyle: 'full',
      timeStyle: 'short'
    });

    card.innerHTML = `
                <div class="title">${countdown.description}</div>
                <div class="timer" data-target-date="${countdown.targetDate}">--天--时--分--秒</div>
                <div class="target-date">目标时间: ${targetDateString}</div>
            `;
    addLongPressListener(card, async () => {
      const confirmed = await showCustomConfirm('删除约定', '确定要删除这个约定吗？', {
        confirmButtonClass: 'btn-danger'
      });
      if (confirmed) {
        await db.memories.delete(countdown.id);
        renderMemoriesScreen();
      }
    });
    return card;
  }

  function startAllCountdownTimers() {
    activeCountdownTimers.forEach(timerId => clearInterval(timerId));
    activeCountdownTimers = [];

    document.querySelectorAll('.countdown-card .timer').forEach(timerEl => {
      const targetTimestamp = parseInt(timerEl.dataset.targetDate);
      let timerId;
      const updateTimer = () => {
        const now = Date.now();
        const distance = targetTimestamp - now;
        if (distance < 0) {
          timerEl.textContent = "约定达成！";
          clearInterval(timerId);
          setTimeout(() => renderMemoriesScreen(), 2000);
          return;
        }
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        timerEl.textContent = `${days}天 ${hours}时 ${minutes}分 ${seconds}秒`;
      };
      updateTimer();
      timerId = setInterval(updateTimer, 1000);
      activeCountdownTimers.push(timerId);
    });
  }

  window.renderMemoriesScreen = renderMemoriesScreen;
  window.summarizeExistingLongTermMemory = summarizeExistingLongTermMemory;
