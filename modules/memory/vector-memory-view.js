// ==================== 向量记忆视图 ====================
function renderVectorMemoryView() {
  const container = document.getElementById('vector-memory-container');
  const chat = state.chats[state.activeChatId];
  if (!chat || !window.vectorMemoryManager) {
    container.innerHTML = '<p style="text-align:center; color:#999; margin-top:40px;">变量记忆模块未加载</p>';
    return;
  }

  window.vectorMemoryManager.renderMemoryUI(chat, container);
  bindVectorMemoryEvents(chat, container);
}

function bindVectorMemoryEvents(chat, container) {
  const mutationSelectors = '#vm-add-fragment-btn, #vm-add-core-btn, #vm-import-btn, #vm-batch-delete-btn, #vm-batch-shift-time-btn, #vm-batch-undo-time-btn, .vm-edit-core-btn, .vm-delete-core-btn, .vm-pin-btn, .vm-edit-frag-btn, .vm-delete-frag-btn, #vm-consolidate-btn';
  if (container._vmMutationGuard) container.removeEventListener('click', container._vmMutationGuard, true);
  container._vmMutationGuard = event => {
    if (window.vectorMemoryManager._extractionLocks.get(chat) && event.target.closest(mutationSelectors)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showToast(window.vectorMemoryManager._extractionLocks.get(chat).type === 'consolidation'
        ? '正在整合，请结束当前任务后修改记忆' : '正在提取，请结束当前任务后修改记忆', 'info');
    }
  };
  container.addEventListener('click', container._vmMutationGuard, true);
  container.querySelector('#vm-consolidate-btn')?.addEventListener('click', () => openVectorConsolidation(chat));
  container.querySelectorAll('[data-vm-task-action]').forEach(button => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await controlVectorExtraction(chat, button.dataset.vmTaskAction); }
      catch (error) { showToast(error.message, 'error'); }
      finally { button.disabled = false; }
    });
  });
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

  // 日期调整（原有批量操作保留）
  container.querySelector('#vm-batch-shift-time-btn')?.addEventListener('click', async () => {
    if (!vmSelectedItems.length) { showToast('请先选择记忆', 'info'); return; }
    const value = await showCustomPrompt('平移记忆日期', '输入整数天数：正数向后，负数向前；日期不明的记忆跳过。', '0');
    if (value === null) return;
    const days = Number(value);
    if (!Number.isInteger(days) || !String(value).trim()) { showToast('请填写整数天数', 'error'); return; }
    const selected = vmSelectedItems.map(item => item.id);
    if (!await showCustomConfirm('平移日期', `选中的 ${selected.length} 条记忆中，有日期的条目将${days >= 0 ? '向后' : '向前'}移动 ${Math.abs(days)} 天。可撤销本次调整。`)) return;
    try { await window.MemoryWorldTime.shiftDates(chat, selected, days); renderVectorMemoryView(); showToast('日期已调整，可在批量菜单撤销', 'success'); }
    catch (error) { showToast(error.message, 'error'); }
  });
  container.querySelector('#vm-batch-undo-time-btn')?.addEventListener('click', async () => {
    try { await window.MemoryWorldTime.shiftDates(chat, [], 0, true); renderVectorMemoryView(); showToast('已撤销上次日期调整', 'success'); }
    catch (error) { showToast(error.message, 'error'); }
  });
  container.querySelectorAll('.vm-time-source-btn').forEach(button => button.addEventListener('click', () => {
    const fragment = window.vectorMemoryManager.getFragment(chat, button.dataset.id);
    if (fragment) window.MemoryWorldTimeUI.detail(chat, fragment);
  }));

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

  // 日期选择器修改事件
  container.querySelectorAll('.vm-time-picker').forEach(picker => {
    picker.addEventListener('change', async (e) => {
      const id = picker.dataset.id;
      if (window.vectorMemoryManager._extractionLocks.get(chat)) { showToast('正在提取，请结束当前任务后修改日期', 'info'); renderVectorMemoryView(); return; }
      const newTimeStr = e.target.value;
      if (!newTimeStr) return;
      
      const fragment = window.vectorMemoryManager.getFragment(chat, id);
      let newTime;
      try { newTime = fragment?.memoryTimeZone && window.MemoryWorldTime
        ? window.MemoryWorldTime.parseInput(newTimeStr, fragment.memoryTimeZone)
        : new Date(picker.type === 'date' ? newTimeStr + 'T12:00' : newTimeStr).getTime(); }
      catch (error) { showToast(error.message, 'error'); renderVectorMemoryView(); return; }
      if (!Number.isFinite(newTime)) { showToast('请输入有效日期', 'error'); return; }
      const before = fragment?.clockVersion ? JSON.parse(JSON.stringify(fragment)) : null;
      window.vectorMemoryManager.editFragment(chat, id, { memoryTime: newTime, timePrecision: picker.type === 'date' ? 'day' : 'minute' });
      try { await db.chats.put(chat); }
      catch (error) {
        if (before) { Object.keys(fragment).forEach(key => delete fragment[key]); Object.assign(fragment, before); }
        showToast('日期保存失败，请重试', 'error'); renderVectorMemoryView(); return;
      }
      showToast('记忆时间已更新', 'success');
      // 重新渲染以排序
      renderVectorMemoryView();
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
      const draft = {
        ...(window.MemoryWorldTime?.manualData(chat) || {}),
        content: content.trim(),
        tags: tagArr,
        sourceLanguage: window.vectorMemoryManager.detectLanguage(content),
        conversationLanguages: [window.vectorMemoryManager.detectLanguage(content)].filter(language => language !== 'unknown')
      };
      const embeddingText = window.vectorMemoryManager._embeddingTextFor(chat, draft);
      const embedding = await window.vectorMemoryManager.getEmbedding(embeddingText, chat);
      window.vectorMemoryManager.createFragment(chat, {
        ...draft, category: 'E', importance: 5,
        emotionalWeight: 3, embedding,
        embeddingSignature: embedding ? window.vectorMemoryManager._embeddingSignature(chat) : '',
        embeddingTextHash: embedding ? window.vectorMemoryManager._hashEmbeddingText(embeddingText) : '',
        source: 'manual'
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
      openVectorMemorySettings(chat, 'settings');
    });
  }

  // 便携教程按钮
  const guideBtn = container.querySelector('#vm-guide-btn');
  if (guideBtn) {
    guideBtn.addEventListener('click', () => {
      openVectorMemorySettings(chat, 'guide');
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
          const importMode = await showChoiceModal('导入模式', [
            { text: '合并导入（保留现有记忆）', value: 'merge' },
            { text: '替换导入（清空现有记忆）', value: 'replace' }
          ]);
          if (!importMode) return;
          showToast('正在导入...', 'info');
          const backup = JSON.parse(JSON.stringify(chat.variableMemory || null));
          const timeConfigBackup = chat.settings.memoryTime ? JSON.parse(JSON.stringify(chat.settings.memoryTime)) : undefined;
          const count = await window.vectorMemoryManager.importMemory(chat, text, importMode);
          try {
            await db.chats.put(chat);
          } catch (error) {
            chat.variableMemory = backup;
            if (timeConfigBackup === undefined) delete chat.settings.memoryTime; else chat.settings.memoryTime = timeConfigBackup;
            throw error;
          }
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
      const vm = window.vectorMemoryManager.getVariableMemory(chat);
      const mem = vm.fragments.find(m => m.id === id && m.category === 'C');
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
        if (embedding) {
          frag.embedding = embedding;
          frag.embeddingSignature = window.vectorMemoryManager._embeddingSignature(chat);
        }
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

// 沿用现有自定义弹窗；样式只作用于本次整合的主体和按钮。
function setupVectorConsolidationModal(title, html, buttons) {
  const body = window._modalBody;
  const footer = document.querySelector('#custom-modal .custom-modal-footer');
  window._modalTitle.textContent = title;
  body.style.cssText = '';
  footer.style.cssText = '';
  body.classList.add('vm-consolidation-body');
  footer.classList.add('vm-consolidation-footer');
  body.innerHTML = html;
  footer.innerHTML = buttons;
  showCustomModal();
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    window._modalResolve = null;
    hideCustomModal();
    body.classList.remove('vm-consolidation-body');
    footer.classList.remove('vm-consolidation-footer');
  };
}

function showVectorConsolidationProgress(runtime, text, cancellable = true) {
  const close = setupVectorConsolidationModal('AI整合记忆', `<p>${text}</p><p class="vm-consolidation-note">${cancellable
    ? '旧记忆尚未修改。取消后不会保存本次结果；已发出的请求可能产生费用。' : '正在保存已确认的整合结果。'}</p>`,
    `<button id="custom-modal-cancel" ${cancellable ? '' : 'disabled'}>${cancellable ? '取消' : '保存中…'}</button>`);
  window._modalResolve = () => { if (cancellable) { runtime.controller.abort(); close(); } };
  document.getElementById('custom-modal-cancel').onclick = () => window._modalResolve?.(null);
  return close;
}

function showVectorConsolidationPreview(chat, snapshot, rows) {
  const manager = window.vectorMemoryManager;
  const escape = value => manager._escapeHtml(String(value || ''));
  const groups = manager.getConsolidationCategories(snapshot.scope).map(code => {
    const items = rows.filter(row => row.fragment.category === code);
    if (!items.length) return '';
    return `<div class="vm-consolidation-group"><div class="vm-consolidation-category">${escape(manager.DEFAULT_CATEGORIES[code].name)} (${items.length})</div>${items.map(row =>
      `<div class="vm-consolidation-item">${escape(row.fragment.content)}${row.sourceIds.length > 1 ? `<div class="vm-consolidation-note">合并了 ${row.sourceIds.length} 条原记忆</div>` : ''}</div>`).join('')}</div>`;
  }).join('');
  return new Promise(resolve => {
    const close = setupVectorConsolidationModal('整合完成，请确认',
      `<p>${snapshot.scope === 'all' ? '全部七类' : escape(manager.DEFAULT_CATEGORIES[snapshot.scope].name)}：${snapshot.originals.length} 条 → ${rows.length} 条</p>
      <div class="vm-consolidation-preview">${groups}</div>
      <p class="vm-consolidation-note">确认后替换所选范围。需要调整时，填写反馈让AI重写。</p>
      <textarea id="vm-consolidation-feedback" aria-label="整合反馈" placeholder="例如：保留那次争吵的原因，不要省略约定日期"></textarea>`,
      '<button id="custom-modal-cancel">取消</button><button id="vm-consolidation-rewrite">让AI重写</button><button id="custom-modal-confirm" class="confirm-btn btn-danger">确认替换</button>');
    const finish = action => { close(); resolve(action); };
    window._modalResolve = () => finish({ action: 'cancel' });
    document.getElementById('custom-modal-cancel').onclick = () => finish({ action: 'cancel' });
    document.getElementById('custom-modal-confirm').onclick = () => finish({ action: 'confirm' });
    document.getElementById('vm-consolidation-rewrite').onclick = () => {
      const feedback = document.getElementById('vm-consolidation-feedback').value.trim();
      if (!feedback) { showToast('请先填写需要调整的内容', 'info'); return; }
      finish({ action: 'rewrite', feedback });
    };
  });
}

async function openVectorConsolidation(chat) {
  const manager = window.vectorMemoryManager;
  if (manager._extractionLocks.get(chat)) { showToast('请先结束当前记忆任务', 'info'); return; }
  if (chat.variableMemory?._metadataEnrichmentCancelled === false) { showToast('请先结束多语言信息补全', 'info'); return; }
  const runtime = { type: 'consolidation', controller: new AbortController() };
  manager._extractionLocks.set(chat, runtime);
  let closeProgress;
  try {
    const codes = manager.getConsolidationCategories();
    const fragments = manager.getAllFragments(chat);
    const scope = await showChoiceModal('选择AI整合范围', [
      { text: `全部七类 (${fragments.filter(fragment => codes.includes(fragment.category)).length} 条)`, value: 'all' },
      ...codes.map(code => ({ text: `${manager.DEFAULT_CATEGORIES[code].name} (${fragments.filter(fragment => fragment.category === code).length} 条)`, value: code }))
    ]);
    if (!scope) return;
    const snapshot = manager.captureConsolidation(chat, scope);
    let feedback = '';
    let rows;
    while (true) {
      closeProgress = showVectorConsolidationProgress(runtime, '正在整理已有记忆…');
      rows = await manager.generateConsolidation(chat, snapshot, feedback, runtime.controller.signal);
      closeProgress(); closeProgress = null;
      const result = await showVectorConsolidationPreview(chat, snapshot, rows);
      if (!result || result.action === 'cancel') { showToast('已取消，旧记忆未修改', 'info'); return; }
      if (result.action === 'confirm') break;
      feedback = [feedback, result.feedback].filter(Boolean).join('\n');
    }
    closeProgress = showVectorConsolidationProgress(runtime, '正在更新向量…');
    const result = await manager.saveConsolidation(chat, snapshot, rows, runtime.controller.signal, () => {
      window._modalResolve = () => {};
      const cancel = document.getElementById('custom-modal-cancel');
      cancel.disabled = true;
      cancel.textContent = '保存中…';
      window._modalBody.innerHTML = '<p>正在保存已确认的整合结果…</p>';
    });
    closeProgress(); closeProgress = null;
    if (state.activeChatId === chat.id) renderVectorMemoryView();
    showToast(`整合完成：${result.before} 条 → ${result.after} 条${result.local ? `；${result.local} 条暂用本地检索，可在设置中补全向量` : ''}`, 'success');
  } catch (error) {
    showToast(runtime.controller.signal.aborted ? '已取消，旧记忆未修改' : `整合未保存：${error.message.replace(/提取/g, '整合')}`, runtime.controller.signal.aborted ? 'info' : 'error');
  } finally {
    closeProgress?.();
    if (manager._extractionLocks.get(chat) === runtime) manager._extractionLocks.delete(chat);
  }
}

async function openVectorMemorySettings(chat, defaultTab = 'settings') {
  const vm = window.vectorMemoryManager.getVariableMemory(chat);
  const settingsHtml = window.vectorMemoryManager.renderSettingsPanel(chat);

  const guideHtml = window.vectorMemoryManager.renderGuide ? window.vectorMemoryManager.renderGuide() : '<div style="padding:20px;text-align:center;">暂无教程内容</div>';

  // 创建全屏设置面板
  let panel = document.getElementById('vm-settings-screen');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'vm-settings-screen';
  panel.className = 'vm-fullscreen-panel';
  panel.innerHTML = `
    <div class="vm-panel-header">
      <span class="vm-panel-back" id="vm-settings-back">&lsaquo;</span>
      <span class="vm-panel-title">变量记忆</span>
      <span style="width:30px;"></span>
    </div>
    <div class="vm-panel-tabs">
      <div class="vm-panel-tab ${defaultTab === 'settings' ? 'active' : ''}" data-tab="settings">极客设置</div>
      <div class="vm-panel-tab ${defaultTab === 'guide' ? 'active' : ''}" data-tab="guide">便携教程</div>
    </div>
    <div class="vm-panel-body">
      <div class="vm-panel-content ${defaultTab === 'settings' ? 'active' : ''}" id="vm-tab-settings">${settingsHtml}</div>
      <div class="vm-panel-content ${defaultTab === 'guide' ? 'active' : ''}" id="vm-tab-guide">${guideHtml}</div>
    </div>
  `;
  document.body.appendChild(panel);
  window.MemoryWorldTimeUI?.bind(panel.querySelector('.memory-time-settings'), chat);
  let metadataEnrichmentRunning = false;
  const savePanelSettings = () => {
    try {
      window.vectorMemoryManager.saveSettingsFromUI(chat);
      return true;
    } catch (error) {
      showToast(error.message, 'error');
      panel.querySelector('#vm-auto-interval')?.focus();
      return false;
    }
  };

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
    if (metadataEnrichmentRunning) {
      window.vectorMemoryManager.cancelMemoryMetadataEnrichment(chat);
      showToast('正在停止多语言信息补全', 'info');
    }
    panel.remove();
  });

  // 绑定checkbox联动
  const extractionBatchCb = panel.querySelector('#vm-extraction-batch');
  extractionBatchCb?.addEventListener('change', () => {
    panel.querySelector('#vm-extraction-batch-fields').style.display = extractionBatchCb.checked ? 'block' : 'none';
  });
  const customEmbeddingCb = panel.querySelector('#vm-custom-embedding');
  const embeddingSourceSelect = panel.querySelector('#vm-embedding-source');
  if (embeddingSourceSelect) {
    embeddingSourceSelect.addEventListener('change', () => {
      if (customEmbeddingCb) customEmbeddingCb.checked = embeddingSourceSelect.value === 'custom';
      const fields = panel.querySelector('#vm-custom-embedding-fields');
      if (fields) fields.style.display = embeddingSourceSelect.value === 'custom' ? 'block' : 'none';
      const help = panel.querySelector('#vm-embedding-source-help');
      if (help) help.textContent = window.vectorMemoryManager.embeddingSourceDescription(chat, true);
      const status = panel.querySelector('#vm-embedding-status');
      if (status) status.textContent = '接口来源已修改，请测试并保存；旧记忆不会自动重建。';
    });
  }
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

  // 模型输入/下拉切换
  const toggleModelInputBtn = panel.querySelector('#vm-toggle-model-input');
  const modelInputEl = panel.querySelector('#vm-embedding-model-input');
  const modelSelectEl = panel.querySelector('#vm-embedding-model-select');
  
  if (toggleModelInputBtn && modelInputEl && modelSelectEl) {
    toggleModelInputBtn.addEventListener('click', () => {
      if (modelInputEl.style.display === 'none') {
        modelInputEl.style.display = 'block';
        modelSelectEl.style.display = 'none';
        toggleModelInputBtn.textContent = '切换为下拉选择';
      } else {
        modelInputEl.style.display = 'none';
        modelSelectEl.style.display = 'block';
        toggleModelInputBtn.textContent = '切换为手动输入';
      }
    });
  }

  // 监听下拉框变化，自动填入手写框
  if (modelSelectEl && modelInputEl) {
    modelSelectEl.addEventListener('change', (e) => {
      const selectedModel = e.target.value;
      if (selectedModel) {
        modelInputEl.value = selectedModel;
      }
    });
  }

  // 拉取模型按钮
  const fetchModelsBtn = panel.querySelector('#vm-fetch-models-btn');
  if (fetchModelsBtn) {
    fetchModelsBtn.addEventListener('click', async () => {
      if (!modelSelectEl) return;
      fetchModelsBtn.textContent = '拉取中...';
      fetchModelsBtn.disabled = true;
      try {
        const models = await window.vectorMemoryManager.fetchAvailableModels(chat);
        
        modelSelectEl.innerHTML = '';
        
        if (models.length === 0) {
           const option = document.createElement('option');
           option.value = "";
           option.textContent = "未找到可用模型";
           modelSelectEl.appendChild(option);
        } else {
          // 当前保存的模型或者输入框里的模型
          const currentModel = vm.settings.embeddingModel || 'text-embedding-3-small';
          let foundCurrent = false;

          models.forEach(modelId => {
            const option = document.createElement('option');
            option.value = modelId;
            option.textContent = modelId;
            if (modelId === currentModel) {
                option.selected = true;
                foundCurrent = true;
            }
            modelSelectEl.appendChild(option);
          });
          
          // 如果当前模型不在列表里，把它也加进去并选中
          if (!foundCurrent && currentModel) {
              const option = document.createElement('option');
              option.value = currentModel;
              option.textContent = currentModel + " (当前)";
              option.selected = true;
              modelSelectEl.insertBefore(option, modelSelectEl.firstChild);
          }
          
          // 切换到下拉框模式
          modelInputEl.style.display = 'none';
          modelSelectEl.style.display = 'block';
          if(toggleModelInputBtn) toggleModelInputBtn.textContent = '切换为手动输入';
          
          showToast('模型列表已更新', 'success');
        }
      } catch (e) {
        showToast('拉取模型失败: ' + e.message, 'error');
      } finally {
        fetchModelsBtn.textContent = '拉取模型';
        fetchModelsBtn.disabled = false;
      }
    });
  }
  const multilingualCb = panel.querySelector('#vm-multilingual-enabled');
  if (multilingualCb) {
    multilingualCb.addEventListener('change', () => {
      const fields = panel.querySelector('#vm-multilingual-fields');
      if (fields) fields.style.display = multilingualCb.checked ? 'block' : 'none';
    });
  }

  const statusEl = panel.querySelector('#vm-embedding-status');
  const testEmbeddingBtn = panel.querySelector('#vm-test-embedding-btn');
  if (testEmbeddingBtn) {
    testEmbeddingBtn.addEventListener('click', async () => {
      testEmbeddingBtn.disabled = true;
      testEmbeddingBtn.textContent = '测试中...';
      if (statusEl) statusEl.textContent = '正在请求 Embedding 接口…';
      try {
        const dimensions = await window.vectorMemoryManager.testEmbeddingConnection(chat, true);
        if (statusEl) statusEl.textContent = `接口正常，返回 ${dimensions} 维向量`;
        showToast('向量接口连接正常', 'success');
      } catch (error) {
        if (statusEl) statusEl.textContent = `接口失败：${error.message}`;
        showToast(`向量接口测试失败：${error.message}`, 'error');
      } finally {
        testEmbeddingBtn.disabled = false;
        testEmbeddingBtn.textContent = '测试向量接口';
      }
    });
  }

  const reembedBtn = panel.querySelector('#vm-reembed-btn');
  if (reembedBtn) {
    reembedBtn.addEventListener('click', async () => {
      const confirmed = await showCustomConfirm('补全/重建向量', '将为缺失或与当前模型不一致的记忆重新请求向量，会消耗 Embedding API 额度。确定继续吗？');
      if (!confirmed) return;
      if (!savePanelSettings()) return;
      reembedBtn.disabled = true;
      reembedBtn.textContent = '处理中...';
      try {
        const result = await window.vectorMemoryManager.rebuildEmbeddings(chat, (completed, failed) => {
          if (statusEl) statusEl.textContent = `处理中：成功 ${completed}，失败 ${failed}`;
        });
        await db.chats.put(chat);
        if (statusEl) statusEl.textContent = `处理完成：成功 ${result.completed}，失败 ${result.failed}`;
        showToast(`向量处理完成：成功 ${result.completed}，失败 ${result.failed}`, result.failed ? 'info' : 'success');
      } catch (error) {
        if (statusEl) statusEl.textContent = `处理失败：${error.message}`;
        showToast(`向量处理失败：${error.message}`, 'error');
      } finally {
        reembedBtn.disabled = false;
        reembedBtn.textContent = '补全/重建向量';
      }
    });
  }

  const multilingualStatusEl = panel.querySelector('#vm-multilingual-status');
  const testMultilingualBtn = panel.querySelector('#vm-test-multilingual-btn');
  if (testMultilingualBtn) {
    testMultilingualBtn.addEventListener('click', async () => {
      testMultilingualBtn.disabled = true;
      testMultilingualBtn.textContent = '测试中...';
      if (multilingualStatusEl) multilingualStatusEl.textContent = '正在比较中英文同义文本与无关文本…';
      try {
        const result = await window.vectorMemoryManager.testMultilingualEmbedding(chat, true);
        const cross = result.crossLanguageScore.toFixed(3);
        const unrelated = result.unrelatedScore.toFixed(3);
        const gap = result.crossLanguageScore - result.unrelatedScore;
        if (multilingualStatusEl) {
          multilingualStatusEl.textContent = `跨语言 ${cross}；无关对照 ${unrelated}；区分度 ${gap.toFixed(3)}`;
        }
        showToast(gap > 0.08 ? '跨语言语义区分正常' : '接口可用，但跨语言区分度偏低', gap > 0.08 ? 'success' : 'info');
      } catch (error) {
        if (multilingualStatusEl) multilingualStatusEl.textContent = `跨语言测试失败：${error.message}`;
        showToast(`跨语言测试失败：${error.message}`, 'error');
      } finally {
        testMultilingualBtn.disabled = false;
        testMultilingualBtn.textContent = '测试跨语言';
      }
    });
  }

  const enrichMetadataBtn = panel.querySelector('#vm-enrich-metadata-btn');
  if (enrichMetadataBtn) {
    enrichMetadataBtn.addEventListener('click', async () => {
      if (metadataEnrichmentRunning) {
        window.vectorMemoryManager.cancelMemoryMetadataEnrichment(chat);
        enrichMetadataBtn.disabled = true;
        enrichMetadataBtn.textContent = '正在停止...';
        return;
      }
      const coverage = window.vectorMemoryManager.getMultilingualCoverage(chat);
      if (!coverage.missing) {
        showToast('现有记忆的多语言信息已补全', 'info');
        return;
      }
      const confirmed = await showCustomConfirm('补全多语言信息', `将使用聊天模型整理 ${coverage.missing} 条待补全记忆的双语检索词，并在接口可用时重新生成向量。原记忆正文不会被覆盖，会消耗 API 额度。确定继续吗？`);
      if (!confirmed) return;
      if (!savePanelSettings()) return;
      metadataEnrichmentRunning = true;
      enrichMetadataBtn.textContent = '停止补全';
      try {
        const result = await window.vectorMemoryManager.enrichMemoryMetadata(chat, progress => {
          if (multilingualStatusEl) multilingualStatusEl.textContent = `处理中 ${progress.processed}/${progress.total}：已补全 ${progress.enriched}，失败 ${progress.failed}`;
        });
        await db.chats.put(chat);
        const stateText = result.cancelled ? '已停止' : '完成';
        if (multilingualStatusEl) multilingualStatusEl.textContent = `${stateText}：补全 ${result.enriched}/${result.total}，生成向量 ${result.embedded}，失败 ${result.failed}`;
        showToast(`多语言信息${stateText}：${result.enriched}/${result.total}`, result.failed || result.cancelled ? 'info' : 'success');
      } catch (error) {
        if (multilingualStatusEl) multilingualStatusEl.textContent = `补全失败：${error.message}`;
        showToast(`多语言信息补全失败：${error.message}`, 'error');
      } finally {
        metadataEnrichmentRunning = false;
        enrichMetadataBtn.disabled = false;
        enrichMetadataBtn.textContent = '补全现有记忆';
      }
    });
  }

  const diagnosticBtn = panel.querySelector('#vm-run-diagnostic-btn');
  const diagnosticInput = panel.querySelector('#vm-diagnostic-query');
  const diagnosticResults = panel.querySelector('#vm-diagnostic-results');
  const runDiagnostic = async () => {
    if (!diagnosticBtn) return;
    const query = diagnosticInput?.value.trim();
    if (!query) {
      showToast('请先输入测试内容', 'info');
      return;
    }
    diagnosticBtn.disabled = true;
    diagnosticBtn.textContent = '测试中...';
    if (diagnosticResults) diagnosticResults.textContent = '正在计算召回分数…';
    const vmState = window.vectorMemoryManager.getVariableMemory(chat);
    const savedSettings = {
      ...vmState.settings,
      scoreWeights: { ...(vmState.settings.scoreWeights || {}) }
    };
    const savedCache = vmState._retrievalCache;
    const savedEmbeddingSignatures = vmState.fragments.map(fragment => ({
      fragment,
      embeddingSignature: fragment.embeddingSignature
    }));
    try {
      if (!savePanelSettings()) return;
      const rows = await window.vectorMemoryManager.diagnoseRetrieval(chat, query, 10);
      diagnosticResults.innerHTML = '';
      if (!rows.length) {
        diagnosticResults.textContent = '没有可供测试的普通记忆。';
      } else {
        if (!rows.some(row => row.matched)) {
          const note = document.createElement('div');
          note.className = 'vm-setting-help';
          note.textContent = '记忆已保存，但这句话没有命中；可以查看下面的内容和检索分数。';
          diagnosticResults.appendChild(note);
        }
        rows.forEach((row, index) => {
          const item = document.createElement('div');
          item.className = `vm-diagnostic-item${row.matched ? ' matched' : ''}`;
          const title = document.createElement('div');
          title.className = 'vm-diagnostic-title';
          title.textContent = `${index + 1}. ${row.content}`;
          const scores = document.createElement('div');
          scores.className = 'vm-diagnostic-scores';
          scores.textContent = `${row.matched ? '命中' : '未过阈值'} · 总分 ${row.score.toFixed(3)} · 语义 ${row.semanticScore.toFixed(3)} · 字面 ${row.keywordScore.toFixed(3)} · 实体 ${row.entityScore.toFixed(3)} · ${row.language}`;
          item.append(title, scores);
          diagnosticResults.appendChild(item);
        });
      }
    } catch (error) {
      if (diagnosticResults) diagnosticResults.textContent = `测试失败：${error.message}`;
    } finally {
      vmState.settings = savedSettings;
      vmState._retrievalCache = savedCache;
      savedEmbeddingSignatures.forEach(item => { item.fragment.embeddingSignature = item.embeddingSignature; });
      diagnosticBtn.disabled = false;
      diagnosticBtn.textContent = '测试';
    }
  };
  if (diagnosticBtn) diagnosticBtn.addEventListener('click', runDiagnostic);
  if (diagnosticInput) diagnosticInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') runDiagnostic();
  });

  // 保存按钮
  const saveBtn = panel.querySelector('#vm-save-settings-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (!savePanelSettings()) return;
      await db.chats.put(chat);
      panel.remove();
      renderVectorMemoryView();
      showToast(`设置已保存：间隔${vm.settings.autoExtractionMsgInterval}条，${vm.settings.extractionBatchEnabled ? `每批${vm.settings.extractionBatchSize}条` : '不分批'}`, 'success');
    });
  }
  
  // 检索策略变化时显示/隐藏用户消息数量设置
  const retrievalStrategySelect = panel.querySelector('#vm-retrieval-strategy');
  if (retrievalStrategySelect) {
    retrievalStrategySelect.addEventListener('change', () => {
      const userMsgCountGroup = panel.querySelector('#vm-user-msg-count-group');
      if (userMsgCountGroup) {
        userMsgCountGroup.style.display = retrievalStrategySelect.value === 'user-only' ? 'block' : 'none';
      }
    });
  }
  
  // 检索缓存开关变化时显示/隐藏缓存间隔设置
  const retrievalCacheCb = panel.querySelector('#vm-cache-enabled');
  if (retrievalCacheCb) {
    retrievalCacheCb.addEventListener('change', () => {
      const cacheIntervalGroup = panel.querySelector('#vm-cache-interval-group');
      if (cacheIntervalGroup) {
        cacheIntervalGroup.style.display = retrievalCacheCb.checked ? 'block' : 'none';
      }
    });
  }
}

