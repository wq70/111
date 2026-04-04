// ============================================================
// persona-library.js
// 来源：script.js 第 20214~20640 行（DOMContentLoaded 内部）
// 功能：人设预设库 —— openPersonaLibrary、renderPersonaLibrary、
//       togglePresetSelection、applyPersonaPreset、
//       openPersonaEditorForCreate/Edit、savePersonaPreset、
//       importTavernPersonas、showTavernPersonaSelector、confirmTavernImport
// ============================================================

(function () {
  // state 通过全局作用域访问（window.state，由 init-and-state.js 初始化）

  const personaLibraryModal = document.getElementById('persona-library-modal');
  const personaEditorModal = document.getElementById('persona-editor-modal');
  const presetActionsModal = document.getElementById('preset-actions-modal');

  let editingPersonaPresetId = null;
  let isManageMode = false;
  let selectedPresetIds = new Set();
  let pendingTavernPersonas = [];

  // 显示人设操作选择弹窗
  let currentPersonaActionId = null;

  // ========== 来源：script.js 第 20218~20640 行 ==========

  function openPersonaLibrary() {
    renderPersonaLibrary();
    personaLibraryModal.classList.add('visible');
  }

  function closePersonaLibrary() {
    personaLibraryModal.classList.remove('visible');
  }

  function renderPersonaLibrary() {
    const grid = document.getElementById('persona-library-grid');
    grid.innerHTML = '';
    if (state.personaPresets.length === 0) {
      grid.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1 / -1; text-align: center; margin-top: 20px;">空空如也~ 点击右上角"添加"来创建你的第一个人设预设吧！</p>';
      return;
    }
    state.personaPresets.forEach(preset => {
      const item = document.createElement('div');
      item.className = 'persona-preset-item';
      if (isManageMode) {
        item.classList.add('manage-mode');
        if (selectedPresetIds.has(preset.id)) {
          item.classList.add('selected');
        }
      }
      item.style.backgroundImage = `url(${preset.avatar})`;
      item.dataset.presetId = preset.id;

      if (isManageMode) {
        item.addEventListener('click', () => togglePresetSelection(preset.id));
      } else {
        item.addEventListener('click', () => showPersonaActionModal(preset.id));
        addLongPressListener(item, () => showPresetActions(preset.id));
      }

      grid.appendChild(item);
    });
  }

  function togglePresetSelection(presetId) {
    if (selectedPresetIds.has(presetId)) {
      selectedPresetIds.delete(presetId);
    } else {
      selectedPresetIds.add(presetId);
    }
    renderPersonaLibrary();
  }

  function enterManageMode() {
    isManageMode = true;
    selectedPresetIds.clear();
    document.getElementById('add-persona-preset-btn').style.display = 'none';
    document.getElementById('manage-persona-preset-btn').style.display = 'none';
    document.getElementById('import-tavern-persona-btn').style.display = 'none';
    document.getElementById('close-persona-library-btn').style.display = 'none';
    document.getElementById('persona-manage-actions').style.display = 'flex';
    renderPersonaLibrary();
  }

  function exitManageMode() {
    isManageMode = false;
    selectedPresetIds.clear();
    document.getElementById('add-persona-preset-btn').style.display = 'block';
    document.getElementById('manage-persona-preset-btn').style.display = 'block';
    document.getElementById('import-tavern-persona-btn').style.display = 'block';
    document.getElementById('close-persona-library-btn').style.display = 'block';
    document.getElementById('persona-manage-actions').style.display = 'none';
    renderPersonaLibrary();
  }

  function selectAllPresets() {
    if (selectedPresetIds.size === state.personaPresets.length) {
      selectedPresetIds.clear();
    } else {
      selectedPresetIds = new Set(state.personaPresets.map(p => p.id));
    }
    renderPersonaLibrary();
  }

  async function deleteSelectedPresets() {
    if (selectedPresetIds.size === 0) {
      alert('请先选择要删除的预设');
      return;
    }

    const confirmed = await showCustomConfirm(
      '删除预设',
      `确定要删除选中的 ${selectedPresetIds.size} 个人设预设吗？此操作不可恢复。`,
      { confirmButtonClass: 'btn-danger' }
    );

    if (confirmed) {
      for (const presetId of selectedPresetIds) {
        await db.personaPresets.delete(presetId);
      }
      state.personaPresets = state.personaPresets.filter(p => !selectedPresetIds.has(p.id));
      selectedPresetIds.clear();
      renderPersonaLibrary();
    }
  }

  function showPresetActions(presetId) {
    editingPersonaPresetId = presetId;
    presetActionsModal.classList.add('visible');
  }

  function hidePresetActions() {
    presetActionsModal.classList.remove('visible');
    editingPersonaPresetId = null;
  }

  function showPersonaActionModal(presetId) {
    currentPersonaActionId = presetId;
    const modal = document.getElementById('persona-action-modal');
    modal.classList.add('visible');
  }

  // 隐藏人设操作弹窗
  function hidePersonaActionModal() {
    const modal = document.getElementById('persona-action-modal');
    modal.classList.remove('visible');
    currentPersonaActionId = null;
  }

  // 直接应用人设
  function applyPersonaPresetDirect() {
    if (!currentPersonaActionId) return;
    const preset = state.personaPresets.find(p => p.id === currentPersonaActionId);
    if (preset) {
      document.getElementById('my-avatar-preview').src = preset.avatar;
      document.getElementById('my-persona').value = preset.persona;
    }
    hidePersonaActionModal();
    closePersonaLibrary();
  }

  // 编辑后应用人设
  function editPersonaThenApply() {
    if (!currentPersonaActionId) return;
    editingPersonaPresetId = currentPersonaActionId;
    const preset = state.personaPresets.find(p => p.id === editingPersonaPresetId);
    if (!preset) return;

    // 保存原始内容，用于后续比较是否修改
    window.originalPersonaContent = preset.persona;

    document.getElementById('persona-editor-title').textContent = '编辑人设预设';
    document.getElementById('preset-avatar-preview').src = preset.avatar;
    document.getElementById('preset-persona-input').value = preset.persona;

    hidePersonaActionModal();
    personaEditorModal.classList.add('visible');
  }

  // 旧版本保留（用于兼容性）
  function applyPersonaPreset(presetId) {
    const preset = state.personaPresets.find(p => p.id === presetId);
    if (preset) {
      document.getElementById('my-avatar-preview').src = preset.avatar;
      document.getElementById('my-persona').value = preset.persona;
    }
    closePersonaLibrary();
  }

  function openPersonaEditorForCreate() {
    editingPersonaPresetId = null;
    document.getElementById('persona-editor-title').textContent = '添加人设预设';
    document.getElementById('preset-avatar-preview').src = defaultAvatar;
    document.getElementById('preset-persona-input').value = '';
    personaEditorModal.classList.add('visible');
  }

  function openPersonaEditorForEdit() {
    const preset = state.personaPresets.find(p => p.id === editingPersonaPresetId);
    if (!preset) return;
    document.getElementById('persona-editor-title').textContent = '编辑人设预设';
    document.getElementById('preset-avatar-preview').src = preset.avatar;
    document.getElementById('preset-persona-input').value = preset.persona;
    presetActionsModal.classList.remove('visible');
    personaEditorModal.classList.add('visible');
  }

  async function deletePersonaPreset() {
    const confirmed = await showCustomConfirm('删除预设', '确定要删除这个人设预设吗？此操作不可恢复。', {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed && editingPersonaPresetId) {
      await db.personaPresets.delete(editingPersonaPresetId);
      state.personaPresets = state.personaPresets.filter(p => p.id !== editingPersonaPresetId);
      hidePresetActions();
      renderPersonaLibrary();
    }
  }

  function closePersonaEditor() {
    personaEditorModal.classList.remove('visible');
    editingPersonaPresetId = null;
  }

  async function savePersonaPreset() {
    const avatar = document.getElementById('preset-avatar-preview').src;
    const persona = document.getElementById('preset-persona-input').value.trim();
    if (avatar === defaultAvatar && !persona) {
      alert("头像和人设不能都为空哦！");
      return;
    }

    if (editingPersonaPresetId) {
      const preset = state.personaPresets.find(p => p.id === editingPersonaPresetId);
      if (preset) {
        const oldPersona = preset.persona;
        const personaChanged = oldPersona !== persona;

        // 如果人设内容有修改，询问是否同步
        if (personaChanged && window.originalPersonaContent && window.originalPersonaContent !== persona) {
          const shouldSync = await showCustomConfirm(
            '同步更新',
            `检测到人设内容已修改。\n\n原内容：${oldPersona.substring(0, 50)}${oldPersona.length > 50 ? '...' : ''}\n新内容：${persona.substring(0, 50)}${persona.length > 50 ? '...' : ''}\n\n是否同步更新到所有使用此人设的地方？`,
            {
              confirmText: '同步更新',
              cancelText: '仅更新预设'
            }
          );

          if (shouldSync) {
            // 同步到全局设置（如果当前使用的是这个人设）
            const currentPersona = document.getElementById('my-persona')?.value;
            if (currentPersona === oldPersona) {
              document.getElementById('my-persona').value = persona;
              document.getElementById('my-avatar-preview').src = avatar;

              // 保存到全局设置
              const globalSettings = await db.globalSettings.get('main');
              if (globalSettings) {
                globalSettings.myPersona = persona;
                globalSettings.myAvatar = avatar;
                await db.globalSettings.put(globalSettings);
              }
            }

            // 同步到所有角色的单独人设配置
            for (const chatId in state.chats) {
              const chat = state.chats[chatId];
              if (chat.customPersona === oldPersona) {
                chat.customPersona = persona;
                await db.chats.put(chat);
              }
            }

            // 同步到绿江作品设置中的User Persona
            const stories = await db.grStories.toArray();
            for (const story of stories) {
              if (story.settings && story.settings.userPersonaId === editingPersonaPresetId) {
                // 绿江中使用的是预设ID，不需要额外同步
              }
            }

            await showCustomAlert('同步完成', '已成功同步更新到所有使用此人设的地方！');
          }
        }

        preset.avatar = avatar;
        preset.persona = persona;
        await db.personaPresets.put(preset);

        // 如果是"编辑后应用"模式，直接应用到当前
        if (window.originalPersonaContent) {
          document.getElementById('my-avatar-preview').src = avatar;
          document.getElementById('my-persona').value = persona;
        }
      }
    } else {
      const newPreset = {
        id: 'preset_' + Date.now(),
        avatar: avatar,
        persona: persona
      };
      await db.personaPresets.add(newPreset);
      state.personaPresets.push(newPreset);
    }

    // 清除原始内容标记
    window.originalPersonaContent = null;

    renderPersonaLibrary();
    closePersonaEditor();
    closePersonaLibrary();
  }

  async function importTavernPersonas() {
    const input = document.getElementById('import-tavern-persona-input');
    input.click();
  }

  async function handleTavernPersonaImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.personas || !data.persona_descriptions) {
        await showCustomAlert('导入失败', '文件格式不正确，请确保是酒馆AI导出的USER预设文件。');
        event.target.value = '';
        return;
      }

      const personas = data.personas;
      const descriptions = data.persona_descriptions;
      pendingTavernPersonas = [];

      for (const [imageKey, name] of Object.entries(personas)) {
        const desc = descriptions[imageKey];
        if (!desc || !desc.description) continue;

        pendingTavernPersonas.push({
          name: name,
          description: desc.description,
          imageKey: imageKey
        });
      }

      event.target.value = '';

      if (pendingTavernPersonas.length === 0) {
        await showCustomAlert('导入失败', '文件中没有找到有效的预设数据。');
        return;
      }

      const importAll = await showCustomConfirm(
        '导入预设',
        `检测到 ${pendingTavernPersonas.length} 个预设。是否全部导入？\n\n选择"确定"全部导入\n选择"取消"手动选择要导入的预设`,
        { confirmText: '全部导入', cancelText: '手动选择' }
      );

      if (importAll) {
        await importSelectedTavernPersonas(pendingTavernPersonas);
      } else {
        showTavernPersonaSelector();
      }
    } catch (error) {
      console.error('导入酒馆AI预设失败:', error);
      await showCustomAlert('导入失败', '文件解析失败，请检查文件格式是否正确。');
      event.target.value = '';
    }
  }

  function showTavernPersonaSelector() {
    const modal = document.getElementById('tavern-persona-selector-modal');
    const listEl = document.getElementById('tavern-persona-selector-list');
    listEl.innerHTML = '';

    pendingTavernPersonas.forEach((persona, index) => {
      const item = document.createElement('div');
      item.className = 'contact-picker-item';
      item.style.padding = '15px 20px';
      item.style.borderBottom = '1px solid var(--border-color)';

      const previewText = persona.description.length > 100
        ? persona.description.substring(0, 100) + '...'
        : persona.description;

      item.innerHTML = `
        <input type="checkbox" class="tavern-persona-checkbox" data-index="${index}" checked style="margin-right: 15px;">
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 5px;">${escapeHTML(persona.name)}</div>
          <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.4;">${escapeHTML(previewText)}</div>
        </div>
      `;
      listEl.appendChild(item);
    });

    modal.classList.add('visible');
  }

  function closeTavernPersonaSelector() {
    document.getElementById('tavern-persona-selector-modal').classList.remove('visible');
    pendingTavernPersonas = [];
  }

  async function confirmTavernImport() {
    const selectedIndices = Array.from(document.querySelectorAll('.tavern-persona-checkbox:checked'))
      .map(cb => parseInt(cb.dataset.index));

    if (selectedIndices.length === 0) {
      await showCustomAlert('提示', '请至少选择一个预设进行导入。');
      return;
    }

    const selectedPersonas = selectedIndices.map(i => pendingTavernPersonas[i]);
    closeTavernPersonaSelector();
    await importSelectedTavernPersonas(selectedPersonas);
  }

  async function importSelectedTavernPersonas(personas) {
    let importCount = 0;

    for (const persona of personas) {
      const newPreset = {
        id: 'preset_tavern_' + Date.now() + '_' + importCount,
        avatar: defaultAvatar,
        persona: `名字：${persona.name}\n\n${persona.description}`
      };

      await db.personaPresets.add(newPreset);
      state.personaPresets.push(newPreset);
      importCount++;

      await new Promise(resolve => setTimeout(resolve, 10));
    }

    renderPersonaLibrary();
    await showCustomAlert('导入成功', `成功导入 ${importCount} 个人设预设！`);
  }

  // ========== 全局暴露 ==========

  window.openPersonaLibrary = openPersonaLibrary;
  window.closePersonaLibrary = closePersonaLibrary;
  window.renderPersonaLibrary = renderPersonaLibrary;
  window.togglePresetSelection = togglePresetSelection;
  window.enterManageMode = enterManageMode;
  window.exitManageMode = exitManageMode;
  window.selectAllPresets = selectAllPresets;
  window.deleteSelectedPresets = deleteSelectedPresets;
  window.showPresetActions = showPresetActions;
  window.hidePresetActions = hidePresetActions;
  window.showPersonaActionModal = showPersonaActionModal;
  window.hidePersonaActionModal = hidePersonaActionModal;
  window.applyPersonaPresetDirect = applyPersonaPresetDirect;
  window.editPersonaThenApply = editPersonaThenApply;
  window.applyPersonaPreset = applyPersonaPreset;
  window.openPersonaEditorForCreate = openPersonaEditorForCreate;
  window.openPersonaEditorForEdit = openPersonaEditorForEdit;
  window.deletePersonaPreset = deletePersonaPreset;
  window.closePersonaEditor = closePersonaEditor;
  window.savePersonaPreset = savePersonaPreset;
  window.importTavernPersonas = importTavernPersonas;
  window.handleTavernPersonaImport = handleTavernPersonaImport;
  window.showTavernPersonaSelector = showTavernPersonaSelector;
  window.closeTavernPersonaSelector = closeTavernPersonaSelector;
  window.confirmTavernImport = confirmTavernImport;

})();
