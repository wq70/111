// ==================== 长期记忆管理（原始行范围约 28811~30930）====================

function initExportMemoryButton() {
  const btn = document.getElementById('export-original-memory-btn');
  if (!btn) return;
  if (btn.dataset.memoryTransferReady === 'true') return;
  btn.dataset.memoryTransferReady = 'true';
  btn.title = '记忆导入导出';
  btn.setAttribute('aria-label', '打开记忆导入导出');
  // 按钮原本位于“原始记忆”容器内，切到结构化/向量页会被父容器一起隐藏。
  // 移到记忆页面根节点后仍保持 fixed 布局和原交互，三个记忆页签都可使用。
  const memoryScreen = document.getElementById('long-term-memory-screen');
  if (memoryScreen && btn.parentElement !== memoryScreen) memoryScreen.appendChild(btn);
  
  // 1. 读取保存的位置并应用
  const savedState = localStorage.getItem('export-memory-btn-state');
  if (savedState) {
    try {
      const state = JSON.parse(savedState);
      if (state.position) {
        btn.style.left = state.position.x + 'px';
        btn.style.top = state.position.y + 'px';
      }
      if (state.hidden) {
        btn.classList.add('hidden');
      }
    } catch (e) {
      console.error('Failed to parse export button state', e);
    }
  }

  function getBounds() {
    const rect = document.getElementById('long-term-memory-screen')?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) return rect;
    return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  }

  function clampPosition(position) {
    const bounds = getBounds();
    const x = Number(position.x);
    const y = Number(position.y);
    return {
      x: Math.max(bounds.left, Math.min(bounds.right - 50, Number.isFinite(x) ? x : bounds.right - 65)),
      y: Math.max(bounds.top, Math.min(bounds.bottom - 50, Number.isFinite(y) ? y : bounds.bottom - 75))
    };
  }

  const initialPosition = clampPosition({ x: parseFloat(btn.style.left), y: parseFloat(btn.style.top) });
  btn.style.left = initialPosition.x + 'px';
  btn.style.top = initialPosition.y + 'px';

  // 2. 拖拽逻辑（直接复用 floating-ball.js 的逻辑）
  let isDragging = false;
  let hasMoved = false;
  let dragStart = { x: 0, y: 0 };
  let currentPos = { 
    x: initialPosition.x,
    y: initialPosition.y
  };
  let longPressTimer = null;

  btn.addEventListener('mousedown', handleMouseDown);
  btn.addEventListener('touchstart', handleTouchStart, { passive: false });

  function handleMouseDown(e) {
    if (e.button !== 0) return; // 只响应左键
    e.preventDefault();
    hasMoved = false;
    
    longPressTimer = setTimeout(() => {
      startDrag(e.clientX, e.clientY);
    }, 200);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  function handleTouchStart(e) {
    e.preventDefault();
    hasMoved = false;
    const touch = e.touches[0];
    
    longPressTimer = setTimeout(() => {
      startDrag(touch.clientX, touch.clientY);
    }, 200);

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  }

  function startDrag(x, y) {
    isDragging = true;
    dragStart = {
      x: x - currentPos.x,
      y: y - currentPos.y
    };
    btn.classList.add('dragging');
  }

  function handleMouseMove(e) {
    if (isDragging) {
      hasMoved = true;
      moveBtn(e.clientX, e.clientY);
    }
  }

  function handleTouchMove(e) {
    if (isDragging) {
      e.preventDefault();
      hasMoved = true;
      const touch = e.touches[0];
      moveBtn(touch.clientX, touch.clientY);
    }
  }

  function moveBtn(x, y) {
    currentPos.x = x - dragStart.x;
    currentPos.y = y - dragStart.y;
    
    currentPos = clampPosition(currentPos);
    
    btn.style.left = currentPos.x + 'px';
    btn.style.top = currentPos.y + 'px';
  }

  function handleMouseUp() {
    clearTimeout(longPressTimer);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    
    if (isDragging) {
      endDrag();
    } else if (!hasMoved) {
      // 点击事件
      openMemoryTransferMenu();
    }
  }

  function handleTouchEnd() {
    clearTimeout(longPressTimer);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
    
    if (isDragging) {
      endDrag();
    } else if (!hasMoved) {
      // 点击事件
      openMemoryTransferMenu();
    }
  }

  function endDrag() {
    isDragging = false;
    btn.classList.remove('dragging');
    // 保存位置
    const state = JSON.parse(localStorage.getItem('export-memory-btn-state') || '{}');
    state.position = currentPos;
    localStorage.setItem('export-memory-btn-state', JSON.stringify(state));
  }

  function openMemoryTransferMenu() {
    const chat = state.chats[state.activeChatId];
    if (window.EPhoneMemoryTransfer?.open) window.EPhoneMemoryTransfer.open(chat);
    else if (typeof handleExportLongTermMemory === 'function') handleExportLongTermMemory();
  }

  window.hideMemoryTransferButton = function () {
    btn.classList.add('hidden');
    const saved = JSON.parse(localStorage.getItem('export-memory-btn-state') || '{}');
    saved.hidden = true;
    localStorage.setItem('export-memory-btn-state', JSON.stringify(saved));
    showToast('按钮已隐藏，在记忆页面快速点击三次即可唤醒');
  };

  window.ensureMemoryTransferButtonPosition = () => {
    currentPos = clampPosition(currentPos);
    btn.style.left = currentPos.x + 'px';
    btn.style.top = currentPos.y + 'px';
  };
  window.addEventListener('resize', window.ensureMemoryTransferButtonPosition);

  // 3. 三击唤醒逻辑
  let tapCount = 0;
  let tapTimer = null;
  const container = document.getElementById('long-term-memory-screen');
  if (container) {
    container.addEventListener('click', (e) => {
      // 忽略按钮本身的点击
      if (e.target.closest('#export-original-memory-btn')) return;
      
      tapCount++;
      if (tapCount === 1) {
        tapTimer = setTimeout(() => {
          tapCount = 0;
        }, 500);
      }
      
      if (tapCount === 3) {
        clearTimeout(tapTimer);
        tapCount = 0;
        if (btn.classList.contains('hidden')) {
          btn.classList.remove('hidden');
          const state = JSON.parse(localStorage.getItem('export-memory-btn-state') || '{}');
          state.hidden = false;
          localStorage.setItem('export-memory-btn-state', JSON.stringify(state));
          if (typeof showToast === 'function') showToast('导出记忆按钮已唤醒');
        }
      }
    });
  }
}

// 在页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 延迟初始化以确保DOM已就绪
    setTimeout(initExportMemoryButton, 500);
});


function openLongTermMemoryScreen() {
  if (!state.activeChatId) return;
  const chat = state.chats[state.activeChatId];
  if (window.GroupMemory?.independent(chat)) return window.GroupMemoryUI.open(chat);
  
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
  requestAnimationFrame(() => window.ensureMemoryTransferButtonPosition?.());
}

// 切换记忆 Tab
function switchMemoryTab(tabName) {
  const originalContainer = document.getElementById('original-memory-container') || document.getElementById('original-memory-list'); // 兼容旧版
  const structuredContainer = document.getElementById('structured-memory-container');
  const vectorContainer = document.getElementById('vector-memory-container');
  const tabs = document.querySelectorAll('#memory-tab-bar .sm-tab');
  
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  
  if (tabName === 'original') {
    originalContainer.style.display = 'block';
    structuredContainer.style.display = 'none';
    if (vectorContainer) vectorContainer.style.display = 'none';
    renderLongTermMemoryList();
  } else if (tabName === 'structured') {
    originalContainer.style.display = 'none';
    structuredContainer.style.display = 'block';
    if (vectorContainer) vectorContainer.style.display = 'none';
    renderStructuredMemoryView();
  } else if (tabName === 'vector') {
    originalContainer.style.display = 'none';
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
            mode = await showChoiceModal('导入模式', [
              { text: '合并导入（保留现有记忆）', value: 'merge' },
              { text: '替换导入（清空现有记忆）', value: 'replace' }
            ]);
            if (!mode) return;
          }
          const backup = JSON.parse(JSON.stringify(chat.structuredMemory || null));
          const backupTimestamp = chat.lastStructuredMemoryTimestamp;
          const count = window.structuredMemoryManager.importMemory(chat, text, mode);
          try {
            await db.chats.put(chat);
          } catch (error) {
            chat.structuredMemory = backup;
            chat.lastStructuredMemoryTimestamp = backupTimestamp;
            throw error;
          }
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
      let currentContent = row.querySelector('.sm-item-content').textContent;
      
      // 优先使用保存的原始文本（如E分类去除了前缀年月的文本）
      if (btn.hasAttribute('data-raw')) {
        currentContent = btn.getAttribute('data-raw');
        // 将可能存在的转移字符转回
        currentContent = currentContent.replace(/"/g, '"').replace(/&#39;/g, "'");
      }
      
      const newContent = await showCustomPrompt('编辑记忆条目', '修改内容：', currentContent, 'textarea', '', { allowFullscreen: true });
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



