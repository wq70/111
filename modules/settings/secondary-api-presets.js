// ========== 副API预设管理 ==========

  async function loadSecondaryApiPresetsDropdown(forceSelectedId = null) {
    const selectEl = document.getElementById('secondary-api-preset-select');
    if (!selectEl) return;
    
    selectEl.innerHTML = '<option value="current">当前配置 (未保存)</option>';

    const presets = await db.secondaryApiPresets.toArray();
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      selectEl.appendChild(option);
    });

    if (forceSelectedId) {
      selectEl.value = forceSelectedId;
      return;
    }
    
    const currentConfig = state.apiConfig;
    let matchingPresetId = null;
    for (const preset of presets) {
      if (
        preset.secondaryProxyUrl === currentConfig.secondaryProxyUrl &&
        preset.secondaryApiKey === currentConfig.secondaryApiKey &&
        preset.secondaryModel === currentConfig.secondaryModel
      ) {
        matchingPresetId = preset.id;
        break;
      }
    }

    if (matchingPresetId) {
      selectEl.value = matchingPresetId;
    } else {
      selectEl.value = 'current';
    }
  }

  async function handleSecondaryApiPresetSelectionChange() {
    const selectEl = document.getElementById('secondary-api-preset-select');
    const selectedId = parseInt(selectEl.value);

    if (isNaN(selectedId)) {
      return;
    }

    const preset = await db.secondaryApiPresets.get(selectedId);
    if (preset) {
      const nextApiConfig = { ...state.apiConfig,
        secondaryProxyUrl: preset.secondaryProxyUrl || '',
        secondaryApiKey: preset.secondaryApiKey || '',
        secondaryModel: preset.secondaryModel || '' };
      if (window.vectorMemoryManager) {
        if (!await window.vectorMemoryManager.saveApiConfiguration(nextApiConfig)) {
          await loadSecondaryApiPresetsDropdown();
          return;
        }
      } else {
        await db.apiConfig.put(nextApiConfig);
        Object.assign(state.apiConfig, nextApiConfig);
      }

      document.getElementById('secondary-proxy-url').value = state.apiConfig.secondaryProxyUrl;
      document.getElementById('secondary-api-key').value = state.apiConfig.secondaryApiKey;
      document.getElementById('secondary-model-input').value = state.apiConfig.secondaryModel;

      if (preset.secondaryProxyUrl && preset.secondaryApiKey) {
        const fetchBtn = document.getElementById('fetch-secondary-models-btn');
        if(fetchBtn) fetchBtn.click();
      }
    }
  }

  async function saveSecondaryApiPreset() {
    const name = await showCustomPrompt('保存副API预设', '请输入预设名称');
    if (!name || !name.trim()) return;

    const presetData = {
      name: name.trim(),
      secondaryProxyUrl: document.getElementById('secondary-proxy-url').value.trim(),
      secondaryApiKey: document.getElementById('secondary-api-key').value.trim(),
      secondaryModel: document.getElementById('secondary-model-input').value.trim() || document.getElementById('secondary-model-select').value
    };

    const existingPreset = await db.secondaryApiPresets.where('name').equals(presetData.name).first();
    if (existingPreset) {
      const confirmed = await showCustomConfirm('覆盖预设', `名为 "${presetData.name}" 的预设已存在。要覆盖它吗？`, {
        confirmButtonClass: 'btn-danger'
      });
      if (!confirmed) return;
      presetData.id = existingPreset.id;
    }

    await db.secondaryApiPresets.put(presetData);
    await loadSecondaryApiPresetsDropdown(presetData.id);
    alert('副API预设已保存！');
  }

  async function deleteSecondaryApiPreset() {
    const selectEl = document.getElementById('secondary-api-preset-select');
    const selectedId = parseInt(selectEl.value);

    if (isNaN(selectedId)) {
      alert('请先从下拉框中选择一个要删除的预设。');
      return;
    }

    const preset = await db.secondaryApiPresets.get(selectedId);
    if (!preset) return;

    const confirmed = await showCustomConfirm('删除预设', `确定要删除预设 "${preset.name}" 吗？`, {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.secondaryApiPresets.delete(selectedId);
      await loadSecondaryApiPresetsDropdown();
      alert('预设已删除。');
    }
  }

  window.handleSecondaryApiPresetSelectionChange = handleSecondaryApiPresetSelectionChange;
  window.saveSecondaryApiPreset = saveSecondaryApiPreset;
  window.deleteSecondaryApiPreset = deleteSecondaryApiPreset;
  window.handleSoundPresetSelectionChange = handleSoundPresetSelectionChange;
  window.saveSoundPreset = saveSoundPreset;
  window.deleteSoundPreset = deleteSoundPreset;
  window.handleCssPresetSelectionChange = handleCssPresetSelectionChange;
  window.saveCssPreset = saveCssPreset;
  window.deleteCssPreset = deleteCssPreset;
  window.handleFontPresetSelectionChange = handleFontPresetSelectionChange;
  window.saveFontPreset = saveFontPreset;
  window.deleteFontPreset = deleteFontPreset;
  window.handleAppearancePresetSelectionChange = handleAppearancePresetSelectionChange;
  window.saveAppearancePreset = saveAppearancePreset;
  window.deleteAppearancePreset = deleteAppearancePreset;
  window.handleThemePresetSelectionChange = handleThemePresetSelectionChange;
  window.saveThemePreset = saveThemePreset;
  window.deleteThemePreset = deleteThemePreset;
  window.handlePresetImport = handlePresetImport;
  window.renderPresetScreen = renderPresetScreen;
  window.renderOfflinePresetSelector = renderOfflinePresetSelector;
  window.openPresetCategoryManager = openPresetCategoryManager;
  window.applyGlobalWallpaper = applyGlobalWallpaper;
  window.loadSoundPresetsDropdown = loadSoundPresetsDropdown;
  window.loadThemePresetsDropdown = loadThemePresetsDropdown;
