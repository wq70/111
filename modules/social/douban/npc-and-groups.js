  let editingGroupId = null;

  // ========== NPC头像管理功能 ==========
  let selectedNpcAvatars = new Set();

  async function openNpcAvatarsModal() {
    const modal = document.getElementById('npc-avatars-modal');
    selectedNpcAvatars.clear();
    await renderNpcAvatarsList();
    initNpcAvatarDropZone();
    initBatchNpcAvatarUrlModal();
    modal.classList.add('visible');
  }

  async function renderNpcAvatarsList() {
    const grid = document.getElementById('npc-avatars-grid');
    const toolbar = document.getElementById('npc-avatars-toolbar');
    const totalBadge = document.getElementById('npc-avatars-total-badge');
    const selectAllCheckbox = document.getElementById('select-all-npc-avatars');
    const npcAvatars = state.globalSettings.npcAvatars || [];
    
    // 更新数量徽章
    if (totalBadge) {
      if (npcAvatars.length > 0) {
        totalBadge.style.display = 'inline-block';
        totalBadge.textContent = `${npcAvatars.length} 张`;
      } else {
        totalBadge.style.display = 'none';
      }
    }

    if (npcAvatars.length === 0) {
      if (toolbar) toolbar.style.display = 'none';
      grid.innerHTML = `
        <div class="npc-empty-clean-wrap">
          <div class="npc-empty-clean-icon">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="4" ry="4"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </div>
          <div class="npc-empty-clean-title">暂无自定义 NPC 头像</div>
          <div class="npc-empty-clean-desc">点击右上角按钮添加，或直接拖拽多张图片至此处</div>
        </div>
      `;
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
      updateNpcAvatarDeleteButton();
      return;
    }

    // 有头像时显示现代轻量全选栏
    if (toolbar) toolbar.style.display = 'flex';

    grid.innerHTML = npcAvatars.map((avatar, index) => {
      const isChecked = selectedNpcAvatars.has(index);
      return `
        <div class="npc-avatar-card ${isChecked ? 'is-selected' : ''}" data-index="${index}">
          <div class="npc-avatar-check-badge">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div class="npc-avatar-img-wrap">
            <img src="${avatar}" alt="NPC头像" onerror="this.onerror=null; this.src=defaultAvatar;" loading="lazy">
          </div>
        </div>
      `;
    }).join('');

    // 点击卡片直接切换选中状态
    grid.querySelectorAll('.npc-avatar-card').forEach(card => {
      card.addEventListener('click', () => {
        const index = parseInt(card.dataset.index);
        if (selectedNpcAvatars.has(index)) {
          selectedNpcAvatars.delete(index);
          card.classList.remove('is-selected');
        } else {
          selectedNpcAvatars.add(index);
          card.classList.add('is-selected');
        }
        updateNpcAvatarDeleteButton();
      });
    });

    updateNpcAvatarDeleteButton();
  }

  function updateNpcAvatarDeleteButton() {
    const deleteBtn = document.getElementById('delete-selected-npc-avatars-btn');
    const deleteText = document.getElementById('delete-selected-npc-avatars-text');
    const selectAllCheckbox = document.getElementById('select-all-npc-avatars');
    const selectText = document.getElementById('npc-avatars-select-text');
    const npcAvatars = state.globalSettings.npcAvatars || [];

    if (selectAllCheckbox) {
      selectAllCheckbox.checked = npcAvatars.length > 0 && selectedNpcAvatars.size === npcAvatars.length;
    }

    if (selectText) {
      if (selectedNpcAvatars.size > 0) {
        selectText.innerHTML = `全选 <span style="font-weight:600; color: #00B51D;">· 已选 ${selectedNpcAvatars.size}</span>`;
      } else {
        selectText.textContent = `全选所有`;
      }
    }

    if (deleteBtn) {
      if (selectedNpcAvatars.size > 0) {
        deleteBtn.style.display = 'inline-flex';
        if (deleteText) deleteText.textContent = `删除 (${selectedNpcAvatars.size})`;
      } else {
        deleteBtn.style.display = 'none';
      }
    }
  }

  // 批量URL多图导入功能
  function openBatchNpcAvatarUrlModal() {
    const modal = document.getElementById('npc-avatar-batch-url-modal');
    if (!modal) return;
    const textarea = document.getElementById('npc-avatar-batch-urls-input');
    const hint = document.getElementById('npc-avatar-url-count-hint');
    if (textarea) textarea.value = '';
    if (hint) hint.textContent = '识别到 0 个有效链接';
    modal.classList.add('visible');
    setTimeout(() => textarea?.focus(), 100);
  }

  function parseUrlsFromInput(text) {
    if (!text) return [];
    return text
      .split(/[\n,;\s]+/)
      .map(u => u.trim())
      .filter(u => u && (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:image/')));
  }

  let batchUrlModalInitialized = false;
  function initBatchNpcAvatarUrlModal() {
    if (batchUrlModalInitialized) return;
    batchUrlModalInitialized = true;

    const modal = document.getElementById('npc-avatar-batch-url-modal');
    const textarea = document.getElementById('npc-avatar-batch-urls-input');
    const hint = document.getElementById('npc-avatar-url-count-hint');
    const cancelBtn = document.getElementById('cancel-batch-npc-avatar-url-btn');
    const confirmBtn = document.getElementById('confirm-batch-npc-avatar-url-btn');

    if (textarea && hint) {
      textarea.addEventListener('input', () => {
        const urls = parseUrlsFromInput(textarea.value);
        hint.textContent = `识别到 ${urls.length} 个有效图片链接`;
        hint.style.color = urls.length > 0 ? '#00B51D' : '#8e8e93';
      });
    }

    if (cancelBtn && modal) {
      cancelBtn.addEventListener('click', () => {
        modal.classList.remove('visible');
      });
    }

    if (confirmBtn && modal && textarea) {
      confirmBtn.addEventListener('click', async () => {
        const urls = parseUrlsFromInput(textarea.value);
        if (urls.length === 0) {
          showToast('请输入至少一个有效的图片URL', 'warning');
          return;
        }

        if (!state.globalSettings.npcAvatars) {
          state.globalSettings.npcAvatars = [];
        }

        urls.forEach(url => {
          state.globalSettings.npcAvatars.push(url);
        });

        await db.globalSettings.put(state.globalSettings);
        modal.classList.remove('visible');
        await renderNpcAvatarsList();
        showToast(`成功批量添加 ${urls.length} 张头像`, 'success');
      });
    }
  }

  // 点击 URL 按钮统一打开批量弹窗
  async function addNpcAvatarFromURL() {
    openBatchNpcAvatarUrlModal();
  }

  async function addNpcAvatarFromLocal() {
    const input = document.getElementById('npc-avatar-local-input');
    if (input) input.click();
  }

  let npcAvatarDropZoneInitialized = false;
  function initNpcAvatarDropZone() {
    if (npcAvatarDropZoneInitialized) return;
    npcAvatarDropZoneInitialized = true;

    const modalBody = document.getElementById('npc-avatars-modal-body');
    if (!modalBody) return;

    ['dragenter', 'dragover'].forEach(eventName => {
      modalBody.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        modalBody.classList.add('douban-drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      modalBody.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        modalBody.classList.remove('douban-drag-over');
      }, false);
    });

    modalBody.addEventListener('drop', async (e) => {
      const dt = e.dataTransfer;
      const files = dt ? dt.files : null;
      if (files && files.length > 0) {
        await processNpcAvatarFiles(files);
      }
    }, false);
  }

  async function processNpcAvatarFiles(files) {
    if (!files || files.length === 0) return;

    try {
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type || !file.type.startsWith('image/')) {
          failCount++;
          continue;
        }

        try {
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          if (!state.globalSettings.npcAvatars) {
            state.globalSettings.npcAvatars = [];
          }

          state.globalSettings.npcAvatars.push(base64);
          successCount++;
        } catch (error) {
          console.error(`上传文件 ${file.name} 失败:`, error);
          failCount++;
        }
      }

      await db.globalSettings.put(state.globalSettings);
      await renderNpcAvatarsList();
      
      if (failCount === 0) {
        showToast(`成功上传 ${successCount} 个头像`, 'success');
      } else {
        showToast(`成功上传 ${successCount} 个，跳过 ${failCount} 个非图片/失败项`, 'warning');
      }
    } catch (error) {
      console.error('批量上传头像失败:', error);
      showToast('上传失败', 'error');
    }
  }

  async function handleNpcAvatarLocalUpload(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
      await processNpcAvatarFiles(files);
    }
    // 清空input
    event.target.value = '';
  }

  async function deleteSelectedNpcAvatars() {
    if (selectedNpcAvatars.size === 0) return;

    const confirmed = await showCustomConfirm(
      '确认删除',
      `确定要删除选中的 ${selectedNpcAvatars.size} 个头像吗？`,
      { confirmText: '删除', cancelText: '取消' }
    );

    if (!confirmed) return;

    const npcAvatars = state.globalSettings.npcAvatars || [];
    const indicesToDelete = Array.from(selectedNpcAvatars).sort((a, b) => b - a);
    
    indicesToDelete.forEach(index => {
      npcAvatars.splice(index, 1);
    });

    state.globalSettings.npcAvatars = npcAvatars;
    await db.globalSettings.put(state.globalSettings);
    
    selectedNpcAvatars.clear();
    await renderNpcAvatarsList();
    showToast('删除成功', 'success');
  }

  function toggleSelectAllNpcAvatars() {
    const selectAllCheckbox = document.getElementById('select-all-npc-avatars');
    const npcAvatars = state.globalSettings.npcAvatars || [];
    
    if (selectAllCheckbox.checked) {
      selectedNpcAvatars.clear();
      npcAvatars.forEach((_, index) => selectedNpcAvatars.add(index));
    } else {
      selectedNpcAvatars.clear();
    }

    renderNpcAvatarsList();
  }

  // 获取NPC头像（用于豆瓣生成）
  function getNpcAvatarForCharacter(npcName) {
    const npcAvatars = state.globalSettings.npcAvatars || [];
    const enableAiAvatar = state.globalSettings.doubanEnableAiAvatar !== false;
    
    // 如果没有自定义头像或开启了AI生图，返回null（使用AI生成）
    if (npcAvatars.length === 0 || enableAiAvatar) {
      return null;
    }

    // 初始化当前批次的头像分配记录
    if (!window.currentDoubanAvatarAssignments) {
      window.currentDoubanAvatarAssignments = {};
    }

    // 如果这个NPC在当前批次已经分配过头像，返回已分配的
    if (window.currentDoubanAvatarAssignments[npcName]) {
      return window.currentDoubanAvatarAssignments[npcName];
    }

    // 获取当前批次已使用的头像
    const usedAvatars = Object.values(window.currentDoubanAvatarAssignments);
    const availableAvatars = npcAvatars.filter(avatar => !usedAvatars.includes(avatar));
    
    // 如果还有未使用的头像，随机选择一个
    if (availableAvatars.length > 0) {
      const selectedAvatar = availableAvatars[Math.floor(Math.random() * availableAvatars.length)];
      window.currentDoubanAvatarAssignments[npcName] = selectedAvatar;
      return selectedAvatar;
    }
    
    // 如果所有头像都被使用了，返回null使用默认头像
    return null;
  }

  // 重置当前批次的头像分配（在生成新帖子时调用）
  function resetDoubanAvatarAssignments() {
    window.currentDoubanAvatarAssignments = {};
  }

  // ========== 自定义小组管理功能 ==========

  async function openCustomGroupsModal() {
    const modal = document.getElementById('custom-groups-modal');
    await renderCustomGroupsList();
    modal.classList.add('visible');
  }

  async function renderCustomGroupsList() {
    const listEl = document.getElementById('custom-groups-list');
    listEl.innerHTML = '';

    // 初始化自定义小组数组（如果不存在）
    if (!state.globalSettings.customDoubanGroups) {
      state.globalSettings.customDoubanGroups = [];
    }

    const groups = state.globalSettings.customDoubanGroups;

    if (groups.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; color:#8a8a8a; padding: 28px 16px; font-size: 14px; line-height: 1.6;">暂无自定义小组，点击上方"+ 添加小组"开始创建</div>';
      return;
    }

    groups.forEach((group, index) => {
      const groupItem = document.createElement('div');
      groupItem.className = 'custom-group-item';
      groupItem.style.cssText = `
        background: #f8f9fa;
        border-radius: 12px;
        padding: 15px;
        margin-bottom: 12px;
        border: 2px solid ${group.enabled ? '#4CAF50' : '#ddd'};
      `;

      const promptPreview = group.prompt.length > 60 ? group.prompt.substring(0, 60) + '...' : group.prompt;

      groupItem.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div style="flex: 1;">
            <div style="font-weight: 600; font-size: 15px; color: #333; margin-bottom: 5px;">
              ${escapeHTML(group.name || '')}
              ${group.enabled ? '<span style="background: #4CAF50; color: white; font-size: 11px; padding: 2px 8px; border-radius: 10px; margin-left: 8px;">已启用</span>' : '<span style="background: #999; color: white; font-size: 11px; padding: 2px 8px; border-radius: 10px; margin-left: 8px;">未启用</span>'}
            </div>
            <div style="font-size: 13px; color: #666; line-height: 1.4;">${escapeHTML(promptPreview)}</div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 10px;">
          <button class="edit-group-btn" data-index="${index}" style="flex: 1; padding: 8px; background: #2196F3; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px;">编辑</button>
          <button class="delete-group-btn" data-index="${index}" style="flex: 1; padding: 8px; background: #f44336; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px;">删除</button>
        </div>
      `;

      listEl.appendChild(groupItem);
    });

    // 绑定编辑按钮事件
    listEl.querySelectorAll('.edit-group-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        openEditGroupModal(index);
      });
    });

    // 绑定删除按钮事件
    listEl.querySelectorAll('.delete-group-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const index = parseInt(e.target.dataset.index);
        const group = state.globalSettings.customDoubanGroups[index];
        
        const confirmed = await showCustomConfirm(
          '确认删除？',
          `确定要删除小组"${group.name}"吗？此操作无法恢复！`,
          { confirmButtonClass: 'btn-danger', confirmText: '确认删除' }
        );

        if (confirmed) {
          state.globalSettings.customDoubanGroups.splice(index, 1);
          await db.globalSettings.put(state.globalSettings);
          await renderCustomGroupsList();
          await showCustomAlert('删除成功', '小组已删除');
        }
      });
    });
  }

  function openEditGroupModal(index = null) {
    const modal = document.getElementById('edit-custom-group-modal');
    const titleEl = document.getElementById('edit-group-modal-title');
    const nameInput = document.getElementById('custom-group-name-input');
    const promptInput = document.getElementById('custom-group-prompt-input');
    const enabledInput = document.getElementById('custom-group-enabled-input');

    editingGroupId = index;

    if (index === null) {
      // 添加新小组
      titleEl.textContent = '添加新小组';
      nameInput.value = '';
      promptInput.value = '';
      enabledInput.checked = true;
    } else {
      // 编辑现有小组
      titleEl.textContent = '编辑小组';
      const group = state.globalSettings.customDoubanGroups[index];
      nameInput.value = group.name;
      promptInput.value = group.prompt;
      enabledInput.checked = group.enabled !== false;
    }

    modal.classList.add('visible');
  }

  async function saveEditGroup() {
    const nameInput = document.getElementById('custom-group-name-input');
    const promptInput = document.getElementById('custom-group-prompt-input');
    const enabledInput = document.getElementById('custom-group-enabled-input');

    const name = nameInput.value.trim();
    const prompt = promptInput.value.trim();
    const enabled = enabledInput.checked;

    if (!name) {
      alert('请输入小组名称');
      return;
    }

    if (!prompt) {
      alert('请输入小组提示词');
      return;
    }

    const groupData = { name, prompt, enabled };

    if (!state.globalSettings.customDoubanGroups) {
      state.globalSettings.customDoubanGroups = [];
    }

    if (editingGroupId === null) {
      // 添加新小组
      state.globalSettings.customDoubanGroups.push(groupData);
    } else {
      // 更新现有小组
      state.globalSettings.customDoubanGroups[editingGroupId] = groupData;
    }

    await db.globalSettings.put(state.globalSettings);

    document.getElementById('edit-custom-group-modal').classList.remove('visible');
    await renderCustomGroupsList();
    await showCustomAlert('保存成功', editingGroupId === null ? '小组已添加' : '小组已更新');
  }
  // ========== 自定义小组管理功能结束 ==========
