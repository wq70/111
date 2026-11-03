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
  const mutationSelectors = '#vm-add-fragment-btn, #vm-add-core-btn, #vm-import-btn, #vm-batch-delete-btn, #vm-batch-shift-time-btn, #vm-batch-undo-time-btn, .vm-edit-core-btn, .vm-delete-core-btn, .vm-pin-btn, .vm-edit-frag-btn, .vm-delete-frag-btn, .vm-category-btn, #vm-consolidate-btn, #vm-consolidate-undo';
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
  container.querySelector('#vm-consolidate-undo')?.addEventListener('click', async () => {
    if (!await showCustomConfirm('撤销上次整合', '恢复上次整合涉及的原记忆，保留之后新增或修改的条目。')) return;
    try {
      const skipped = await window.vectorMemoryManager.undoConsolidation(chat);
      renderVectorMemoryView();
      showToast(skipped ? '已撤销，保留后续修改' : '已撤销上次整合', 'success');
    } catch (error) {
      await showCustomAlert('撤销失败', window.vectorMemoryManager._escapeHtml(error.message));
    }
  });
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
      const manager = window.vectorMemoryManager;
      const draft = await showVectorMemoryAddForm(chat);
      if (!draft || manager._extractionLocks.get(chat)) return;
      const signature = manager._embeddingSignature(chat);
      const embeddingText = manager._embeddingTextFor(chat, draft);
      const runtime = { type: 'manual-edit' };
      manager._extractionLocks.set(chat, runtime);
      const memory = manager.getVariableMemory(chat);
      let id;
      try {
        const vector = await manager.getEmbedding(embeddingText, chat);
        const embedding = signature === manager._embeddingSignature(chat) ? vector : null;
        id = manager.createFragment(chat, {
          ...draft, embedding, embeddingSignature: embedding ? signature : '',
          embeddingTextHash: embedding ? manager._hashEmbeddingText(embeddingText) : '', source: 'manual'
        });
        await db.chats.put(chat);
        if (state.activeChatId === chat.id) renderVectorMemoryView();
        showToast('记忆片段已添加', 'success');
      } catch (error) {
        if (id) manager.deleteFragment(chat, id);
        await showCustomAlert('添加失败', manager._escapeHtml(error.message));
      } finally { manager._extractionLocks.delete(chat); }
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
          window.vectorMemoryManager._storeEmbedding(chat, frag, embedding);
        }
        await db.chats.put(chat);
        renderVectorMemoryView();
      }
    });
  });
  container.querySelectorAll('.vm-category-btn').forEach(button => button.addEventListener('click', async () => {
    const manager = window.vectorMemoryManager;
    const fragment = manager.getFragment(chat, button.dataset.id);
    if (!fragment) return;
    const choices = Object.entries(manager.getCategories(chat))
      .filter(([code]) => code !== 'C')
      .map(([value, item]) => ({ value, text: manager._escapeHtml(item.name) + (value === fragment.category ? '（当前）' : '') }));
    const category = await showChoiceModal('修改记忆分类', choices);
    if (!category || category === fragment.category || manager._extractionLocks.get(chat) ||
        manager.getFragment(chat, fragment.id) !== fragment) return;
    const vm = manager.getVariableMemory(chat);
    const before = { category: fragment.category, updated: vm.stats.lastUpdated, cache: vm._retrievalCache };
    manager.editFragment(chat, fragment.id, { category });
    vm._retrievalCache = manager._emptyRetrievalCache();
    try {
      await db.chats.put(chat);
      if (state.activeChatId === chat.id) renderVectorMemoryView();
      showToast('记忆分类已更新', 'success');
    } catch (error) {
      fragment.category = before.category;
      vm.stats.lastUpdated = before.updated;
      vm._retrievalCache = before.cache;
      await showCustomAlert('修改分类失败', manager._escapeHtml(error.message));
    }
  }));
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

function showVectorMemoryAddForm(chat) {
  const manager = window.vectorMemoryManager;
  const time = window.MemoryWorldTime;
  const settings = time?.config(chat);
  const timelines = settings?.timelines || [];
  const escape = value => manager._escapeHtml(String(value));
  const options = Object.entries(manager.getCategories(chat)).filter(([code]) => code !== 'C');
  return new Promise(resolve => {
    const close = setupVectorConsolidationModal('添加记忆', `
      <div class="vm-memory-form">
        <label>记忆内容<textarea id="vm-add-content" rows="4"></textarea></label>
        <label>分类<select id="vm-add-category">${options.map(([code, category], index) =>
          `<option value="${index}" ${code === 'E' ? 'selected' : ''}>${escape(category.name)}</option>`).join('')}</select></label>
        <label>标签（选填）<input id="vm-add-tags" placeholder="用逗号分隔"></label>
        ${time ? `<details><summary>日期和时间线</summary>
          <label>时间线<select id="vm-add-timeline"><option value="">当前时间线 · ${escape(settings.timelineName)}</option>
            ${timelines.filter(item => item.id !== settings.timelineId).map(item =>
              `<option value="${timelines.indexOf(item)}">${escape(item.name)}</option>`).join('')}</select></label>
          <label>日期来源<select id="vm-add-date-mode"><option value="now">当前时间</option>
            <option value="unknown">时间不明</option><option value="manual">指定时间</option></select></label>
          <div id="vm-add-date-fields" hidden>
            <label>发生时间<input id="vm-add-start" type="datetime-local"></label>
            <label>结束时间（选填）<input id="vm-add-end" type="datetime-local"></label>
          </div>
        </details>` : ''}
        <p id="vm-add-error" class="vm-memory-error" role="alert"></p>
      </div>`, '<button id="custom-modal-cancel">取消</button><button id="custom-modal-confirm" class="confirm-btn">添加</button>');
    const field = id => document.getElementById(id);
    const finish = value => { close(); resolve(value); };
    window._modalResolve = () => finish(null);
    field('custom-modal-cancel').onclick = window._modalResolve;
    if (time) field('vm-add-date-mode').onchange = event => { field('vm-add-date-fields').hidden = event.target.value !== 'manual'; };
    field('custom-modal-confirm').onclick = () => {
      try {
        const content = field('vm-add-content').value.trim();
        if (!content) throw new Error('请输入记忆内容');
        const date = time?.manualData(chat) || {};
        if (time) {
          const timelineIndex = field('vm-add-timeline').value;
          const timeline = timelineIndex ? timelines[Number(timelineIndex)] : null;
          if (timeline) Object.assign(date, { timelineId: timeline.id, timelineName: timeline.name });
          const mode = field('vm-add-date-mode').value;
          if (mode === 'unknown') Object.assign(date, { memoryTime: null, timePrecision: 'unknown' });
          if (mode === 'manual') {
            const start = field('vm-add-start').value, end = field('vm-add-end').value;
            if (!start) throw new Error('请填写发生时间');
            date.memoryTime = time.parseInput(start, date.memoryTimeZone);
            date.memoryTimeEnd = end ? time.parseInput(end, date.memoryTimeZone) : null;
            if (end && date.memoryTimeEnd < date.memoryTime) throw new Error('结束时间不能早于发生时间');
          }
        }
        const language = manager.detectLanguage(content);
        finish({ ...date, content, category: options[Number(field('vm-add-category').value)][0],
          tags: field('vm-add-tags').value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean),
          sourceLanguage: language, conversationLanguages: language === 'unknown' ? [] : [language] });
      } catch (error) { field('vm-add-error').textContent = error.message; }
    };
  });
}

function showVectorConsolidationPair(snapshot, legacy, current) {
  const manager = window.vectorMemoryManager;
  const escape = value => manager._escapeHtml(String(value));
  const describe = fragment => escape(window.MemoryExtractionSupport.formatTime(fragment));
  const sources = new Map(snapshot.originals.map(fragment => [fragment.id, fragment]));
  const showSources = row => row.sourceIds.map(id => sources.get(id)).map(source =>
    `<p>${describe(source)}<br>${escape(source.content)}</p>`).join('');
  const sourceIds = [...current.sourceIds, ...legacy.sourceIds];
  const sameDates = sourceIds.every(id => describe(sources.get(id)) === describe(current.fragment));
  const sourceOptions = sourceIds.map((id, index) => {
    const source = sources.get(id);
    const name = source.clockVersion ? source.timelineName || source.timelineId : '旧版';
    return `<option value="${index}" ${sameDates && id === current.fragment.id ? 'selected' : ''}>${escape(name)} · ${describe(source)}${current.sourceIds.length > 1 || legacy.sourceIds.length > 1
      ? ` · ${escape(source.content.slice(0, 42))}` : ''}</option>`;
  }).join('');
  const timeline = escape(current.fragment.timelineName || current.fragment.timelineId);
  const draft = [...new Set([current.fragment.content.trim(), legacy.fragment.content.trim()])].join('\n');
  return new Promise(resolve => {
    const close = setupVectorConsolidationModal('确认是同一条记忆', `
      <div class="vm-memory-form">
        <div class="vm-memory-compare">
          <div><strong>旧版记忆</strong>${showSources(legacy)}</div>
          <div><strong>${timeline}</strong>${showSources(current)}</div>
        </div>
        <p>合并后归入「${timeline}」。如果是两次不同的经历，请分别保留。</p>
        <label>合并后采用的时间<select id="vm-pair-date">
          <option value="">请选择</option>${sourceOptions}<option value="unknown">时间不明</option>
        </select></label>
        <label>合并后的正文<textarea id="vm-pair-content" rows="4">${escape(draft)}</textarea></label>
        <p id="vm-pair-error" class="vm-memory-error" role="alert"></p>
      </div>`, '<button id="custom-modal-cancel">分别保留</button><button id="custom-modal-confirm" class="confirm-btn">加入合并预览</button>');
    const finish = value => { close(); resolve(value); };
    window._modalResolve = () => finish(null);
    document.getElementById('custom-modal-cancel').onclick = window._modalResolve;
    document.getElementById('custom-modal-confirm').onclick = () => {
      try {
        const choice = document.getElementById('vm-pair-date').value;
        if (!choice) throw new Error('请选择合并后采用的时间');
        const dateId = choice === 'unknown' ? null : sourceIds[Number(choice)];
        finish(manager.confirmConsolidationPair(snapshot, legacy, current, dateId, document.getElementById('vm-pair-content').value));
      } catch (error) { document.getElementById('vm-pair-error').textContent = error.message; }
    };
  });
}

function showVectorConsolidationPreview(snapshot, rows, timelineGroups, pairs) {
  const manager = window.vectorMemoryManager;
  const escape = value => manager._escapeHtml(String(value || ''));
  const originals = new Map(snapshot.originals.map(fragment => [fragment.id, fragment]));
  const legacy = rows.filter(row => !row.preserve && !row.fragment.clockVersion);
  const current = rows.filter(row => !row.preserve && !row.approval && row.fragment.clockVersion && row.fragment.timelineId);
  const normalized = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '');
  const phrases = text => new Set(Array.from({ length: Math.max(0, Math.min(text.length, 240) - 2) }, (_, i) => text.slice(i, i + 3)));
  const byText = new Map();
  const byEvidence = new Map();
  const byPhrase = new Map();
  const sizes = [];
  for (const [index, row] of current.entries()) {
    const combined = new Set();
    for (const id of row.sourceIds) {
      const fragment = originals.get(id);
      const text = normalized(fragment.content);
      if (text.length >= 4 && !byText.has(text)) byText.set(text, index);
      for (const key of fragment.sourceMessageKeys || []) if (!byEvidence.has(key)) byEvidence.set(key, index);
      for (const phrase of phrases(text)) combined.add(phrase);
    }
    sizes[index] = combined.size;
    for (const phrase of combined) {
      if (!byPhrase.has(phrase)) byPhrase.set(phrase, []);
      const posting = byPhrase.get(phrase);
      if (posting.length < 24) posting.push(index);
    }
  }
  const suggestions = [];
  for (const [index, row] of legacy.entries()) {
    const matches = row.sourceIds.flatMap(id => {
      const fragment = originals.get(id);
      return [byText.get(normalized(fragment.content)), ...(fragment.sourceMessageKeys || []).map(key => byEvidence.get(key))];
    });
    let match = matches.find(value => value !== undefined);
    if (match === undefined) {
      const combined = new Set(row.sourceIds.flatMap(id => [...phrases(normalized(originals.get(id).content))]));
      const overlaps = new Map();
      for (const phrase of combined) {
        const posting = byPhrase.get(phrase);
        if (posting && posting.length < 24) {
          for (const candidate of posting) overlaps.set(candidate, (overlaps.get(candidate) || 0) + 1);
        }
      }
      let bestScore = 0.45;
      for (const [candidate, overlap] of overlaps) {
        const score = 2 * overlap / (combined.size + sizes[candidate]);
        if (overlap >= 3 && score >= bestScore) { bestScore = score; match = candidate; }
      }
    }
    if (match !== undefined) suggestions.push([index, match]);
    if (suggestions.length === 5) break;
  }
  const date = fragment => escape(window.MemoryExtractionSupport.formatTime(fragment));
  const timeline = fragment => escape(fragment.clockVersion ? fragment.timelineName || fragment.timelineId || '未命名时间线' : '旧版记忆');
  const options = items => items.map(({ fragment }, index) =>
    `<option value="${index}">${timeline(fragment)} · ${date(fragment)} · ${escape(fragment.content.slice(0, 110))}</option>`).join('');
  const failures = timelineGroups.map((group, index) => group.error ? `<div class="vm-memory-status">
      <strong>${escape(group.name)} · 整理失败</strong><p class="vm-memory-error">${escape(group.error)}</p>
      <div class="vm-memory-actions"><button id="vm-group-retry-${index}">只重试这一组</button>
      <button id="vm-group-keep-${index}">原样保留这一组</button></div>
    </div>` : group.kept ? `<div class="vm-memory-status">${escape(group.name)} · 原样保留</div>` : '').join('');
  const groups = manager.getConsolidationCategories(snapshot.scope).map(code => {
    const items = rows.filter(row => row.fragment.category === code);
    if (!items.length) return '';
    return `<div class="vm-consolidation-group"><div class="vm-consolidation-category">${escape(manager.DEFAULT_CATEGORIES[code].name)} (${items.length})</div>${items.map(row => {
      const sources = row.sourceIds.map(id => originals.get(id));
      const changedCategory = [...new Set(sources.filter(source => source.category !== code)
        .map(source => manager.DEFAULT_CATEGORIES[source.category].name))];
      const changed = !row.keep && !row.preserve;
      const pairIndex = pairs.findIndex(pair => pair.result === row);
      return `<div class="vm-consolidation-item">${escape(row.fragment.content)}
        <div class="vm-consolidation-note">${timeline(row.fragment)} · ${date(row.fragment)} ·
        ${row.sourceIds.length > 1 ? `合并 ${row.sourceIds.length} 条` : changed ? '已整理' : '原样保留'}
        ${changedCategory.length ? ` · 原分类 ${escape(changedCategory.join('、'))}` : ''}</div>
        ${changed ? `<details><summary>查看原记忆</summary>${sources.map(source =>
          `<p>${timeline(source)} · ${date(source)}<br>${escape(source.content)}</p>`).join('')}</details>` : ''}
        ${pairIndex >= 0 ? `<button id="vm-pair-remove-${pairIndex}">取消这组跨版本合并</button>` : ''}</div>`;
    }).join('')}</div>`;
  }).join('');
  return new Promise(resolve => {
    const hasFailures = timelineGroups.some(group => group.error);
    const close = setupVectorConsolidationModal(hasFailures ? '部分记忆需要处理' : '整合完成，请确认',
      `<p>${snapshot.scope === 'all' ? '全部七类' : escape(manager.DEFAULT_CATEGORIES[snapshot.scope].name)}：${snapshot.originals.length} 条 → ${rows.length} 条</p>
      <div class="vm-consolidation-preview">
        ${failures}
        ${legacy.length && current.length ? `<div class="vm-memory-status">
          <strong>新旧记忆默认分别保留</strong>
          ${suggestions.length ? `<p>发现内容相近或来源相同的条目，可以核对后合并。</p>
            ${suggestions.map(([left, right], index) => `<button id="vm-pair-suggestion-${index}">核对 · ${escape(legacy[left].fragment.content.slice(0, 55))}</button>`).join('')}` : ''}
          <details><summary>手动核对新旧重复记忆</summary><div class="vm-memory-form">
            <label>旧版记忆<select id="vm-pair-legacy">${options(legacy)}</select></label>
            <label>新版记忆<select id="vm-pair-current">${options(current)}</select></label>
            <button id="vm-pair-compare">对照这两条</button>
          </div></details>
        </div>` : ''}
        ${groups}
      </div>
      <p class="vm-consolidation-note">${hasFailures ? '请先重试失败的组，或选择原样保留。' : '确认后保存，可撤销本次整合。'}</p>
      ${!pairs.length && !hasFailures ? '<textarea id="vm-consolidation-feedback" aria-label="整合反馈" placeholder="选填，例如保留约定的日期"></textarea>' : ''}`,
      `<button id="custom-modal-cancel">取消</button>${!pairs.length && !hasFailures ? '<button id="vm-consolidation-rewrite">让AI重写</button>' : ''}
      <button id="custom-modal-confirm" class="confirm-btn" ${hasFailures ? 'disabled' : ''}>确认保存</button>`);
    const finish = action => { close(); resolve(action); };
    window._modalResolve = () => finish({ action: 'cancel' });
    document.getElementById('custom-modal-cancel').onclick = () => finish({ action: 'cancel' });
    document.getElementById('custom-modal-confirm').onclick = () => { if (!hasFailures) finish({ action: 'confirm' }); };
    if (!pairs.length && !hasFailures) document.getElementById('vm-consolidation-rewrite').onclick = () => {
      const feedback = document.getElementById('vm-consolidation-feedback').value.trim();
      if (!feedback) { showToast('请先填写需要调整的内容', 'info'); return; }
      finish({ action: 'rewrite', feedback });
    };
    timelineGroups.forEach((group, index) => {
      if (!group.error) return;
      document.getElementById(`vm-group-retry-${index}`).onclick = () => finish({ action: 'retry', group });
      document.getElementById(`vm-group-keep-${index}`).onclick = () => finish({ action: 'keep', group });
    });
    const compare = (left, right) => finish({ action: 'compare', legacy: legacy[left], current: current[right] });
    suggestions.forEach(([left, right], index) => {
      document.getElementById(`vm-pair-suggestion-${index}`).onclick = () => compare(left, right);
    });
    if (legacy.length && current.length) document.getElementById('vm-pair-compare').onclick = () =>
      compare(document.getElementById('vm-pair-legacy').value, document.getElementById('vm-pair-current').value);
    pairs.forEach((_, index) => {
      document.getElementById(`vm-pair-remove-${index}`).onclick = () => finish({ action: 'removePair', index });
    });
  });
}

async function openVectorConsolidation(chat) {
  const manager = window.vectorMemoryManager;
  if (manager._extractionLocks.get(chat) || manager._embeddingRebuilds.has(chat)) { showToast('请先结束当前记忆任务', 'info'); return; }
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
    const groups = manager.groupConsolidation(snapshot);
    const pairs = [];
    let feedback = '';
    const generate = async selected => {
      for (const [index, group] of selected.entries()) {
        const name = manager._escapeHtml(group.name);
        closeProgress = showVectorConsolidationProgress(runtime, `正在整理 ${name}（${index + 1}/${selected.length}）…`);
        try {
          group.rows = await manager.generateConsolidation(chat, group, feedback, runtime.controller.signal);
          group.error = '';
        } catch (error) {
          if (runtime.controller.signal.aborted) throw error;
          group.error = error.message || '整理请求失败';
          group.rows = manager.preserveConsolidationGroup(group);
        } finally { closeProgress(); closeProgress = null; }
      }
    };
    await generate(groups);
    let rows;
    while (true) {
      const paired = new Set(pairs.flatMap(pair => [pair.legacy, pair.current]));
      rows = [...groups.flatMap(group => group.rows.filter(row => !paired.has(row))), ...pairs.map(pair => pair.result)];
      const result = await showVectorConsolidationPreview(snapshot, rows, groups, pairs);
      if (!result || result.action === 'cancel') { showToast('已取消，旧记忆未修改', 'info'); return; }
      if (result.action === 'confirm') break;
      if (result.action === 'compare') {
        const { legacy, current } = result;
        const combined = await showVectorConsolidationPair(snapshot, legacy, current);
        if (combined) pairs.push({ legacy, current, result: combined });
      }
      if (result.action === 'removePair') pairs.splice(result.index, 1);
      if (result.action === 'keep') { result.group.error = ''; result.group.kept = true; }
      if (result.action === 'retry') await generate([result.group]);
      if (result.action === 'rewrite') {
        feedback = [feedback, result.feedback].filter(Boolean).join('\n');
        await generate(groups.filter(group => !group.kept));
      }
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
    closeProgress?.(); closeProgress = null;
    if (runtime.controller.signal.aborted) showToast('已取消，旧记忆未修改', 'info');
    else await showCustomAlert('整合未保存', manager._escapeHtml(error.message.replace(/提取/g, '整合')));
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
  const savePanelSettings = async () => {
    try {
      return await window.vectorMemoryManager.saveSettingsWithEmbeddingChoice(chat);
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
      if (window.vectorMemoryManager._embeddingRebuilds.has(chat)) {
        window.vectorMemoryManager.cancelEmbeddingRebuild(chat);
        reembedBtn.disabled = true;
        reembedBtn.textContent = '正在停止…';
        return;
      }
      const confirmed = await showCustomConfirm('补全/重建向量', '将为缺失或与当前模型不一致的记忆重新请求向量，会消耗 Embedding API 额度。确定继续吗？');
      if (!confirmed) return;
      if (!await savePanelSettings()) return;
      reembedBtn.textContent = '停止重建（保留进度）';
      try {
        const result = await window.vectorMemoryManager.rebuildEmbeddings(chat, (completed, failed) => {
          if (statusEl) statusEl.textContent = `处理中：成功 ${completed}，失败 ${failed}`;
        });
        const progressText = `${result.cancelled ? '已停止' : '处理完成'}：新生成 ${result.completed}，失败 ${result.failed}，已有 ${result.skipped}。进度已保存，可继续。`;
        if (statusEl) statusEl.textContent = progressText;
        showToast(progressText, result.failed || result.cancelled ? 'info' : 'success');
      } catch (error) {
        if (statusEl) statusEl.textContent = `处理失败：${error.message}`;
        showToast(`向量处理失败：${error.message}`, 'error');
      } finally {
        reembedBtn.disabled = false;
        reembedBtn.textContent = '补全/重建向量';
      }
    });
  }

  panel.querySelector('#vm-new-embedding-model-btn')?.addEventListener('click', async () => {
    if (!await showCustomConfirm('作为新模型使用', '停止沿用其他模型的向量，旧向量仍然保留。本操作不会自动请求接口；之后可手动补全/重建。')) return;
    try {
      if (!await savePanelSettings()) return;
      await window.vectorMemoryManager.useCurrentInterfaceAsNewModel(chat);
      if (statusEl) statusEl.textContent = window.vectorMemoryManager.embeddingStatusText(chat);
      showToast('已作为新模型使用，旧向量已保留', 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });

  panel.querySelector('#vm-reuse-embedding-btn')?.addEventListener('click', async () => {
    try {
      if (!await savePanelSettings()) return;
      if (!await window.vectorMemoryManager.chooseSavedEmbeddings(chat)) return;
      if (statusEl) statusEl.textContent = window.vectorMemoryManager.embeddingStatusText(chat);
      showToast('向量使用方式已保存', 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });

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
      if (!await savePanelSettings()) return;
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
    const diagnosticChat = { ...chat, variableMemory: JSON.parse(JSON.stringify(vmState)) };
    try {
      window.vectorMemoryManager.saveSettingsFromUI(diagnosticChat);
      const rows = await window.vectorMemoryManager.diagnoseRetrieval(diagnosticChat, query, 10);
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
      if (!await savePanelSettings()) return;
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

