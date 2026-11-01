// ========== 外观预设管理 ==========

  // 找到这个函数并替换
  async function loadAppearancePresetsDropdown(forceSelectedId = null) {
    const selectEl = document.getElementById('appearance-preset-select');
    if (!selectEl) return; // 防御性检查：元素不存在时直接返回
    selectEl.innerHTML = '<option value="">-- 选择一个预设 --</option>';

    const presets = await db.appearancePresets.where('type').equals('appearance').toArray();
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      selectEl.appendChild(option);
    });

    // 如果传入了强制选中的ID，直接选中它，不再进行复杂的对比
    if (forceSelectedId) {
      selectEl.value = forceSelectedId;
      return;
    }

    // 只有在没有强制选中时，才执行原来的自动匹配逻辑
    const currentSettings = {
      wallpaper: state.globalSettings.wallpaper,
      cphoneWallpaper: state.globalSettings.cphoneWallpaper,
      globalChatBackground: state.globalSettings.globalChatBackground,
      appIcons: state.globalSettings.appIcons,
      cphoneAppIcons: state.globalSettings.cphoneAppIcons,
      myphoneAppIcons: state.globalSettings.myphoneAppIcons,
      chatActionButtonsOrder: state.globalSettings.chatActionButtonsOrder,
      chatHeaderButtonsOrder: state.globalSettings.chatHeaderButtonsOrder,
      chatSelectionButtonsOrder: state.globalSettings.chatSelectionButtonsOrder,
      messageActionsOrder: state.globalSettings.messageActionsOrder,
      theme: localStorage.getItem('ephone-theme') || 'light',
      showStatusBar: state.globalSettings.showStatusBar,
      notificationSoundUrl: state.globalSettings.notificationSoundUrl,
      widgetData: state.globalSettings.widgetData
    };

    let matchingPresetId = null;

    for (const preset of presets) {
      if (JSON.stringify(preset.value) === JSON.stringify(currentSettings)) {
        matchingPresetId = preset.id;
        break;
      }
    }

    if (matchingPresetId) {
      selectEl.value = matchingPresetId;
    } else {
      selectEl.value = '';
    }
  }



  // 找到这个函数并替换
  async function handleAppearancePresetSelectionChange() {
    const selectEl = document.getElementById('appearance-preset-select');
    const selectedId = parseInt(selectEl.value);
    if (isNaN(selectedId)) return;

    const preset = await db.appearancePresets.get(selectedId);
    if (preset && preset.value) {
      const data = preset.value;

      // 1. 智能合并图标（保留上一轮的修复）
      const mergedAppIcons = {
        ...DEFAULT_APP_ICONS,
        ...(data.appIcons || {})
      };
      const mergedCPhoneIcons = {
        ...DEFAULT_CPHONE_ICONS,
        ...(data.cphoneAppIcons || {})
      };
      const mergedMyPhoneIcons = {
        ...DEFAULT_MYPHONE_ICONS,
        ...(data.myphoneAppIcons || {})
      };

      Object.assign(state.globalSettings, data);
      state.globalSettings.appIcons = mergedAppIcons;
      state.globalSettings.cphoneAppIcons = mergedCPhoneIcons;
      state.globalSettings.myphoneAppIcons = mergedMyPhoneIcons;

      applyTheme(data.theme || 'light');
      await db.globalSettings.put(state.globalSettings);

      applyGlobalWallpaper();
      applyCPhoneWallpaper();
      applyMyPhoneWallpaper();
      renderIconSettings();
      renderCPhoneIconSettings();
      renderMyPhoneIconSettings();
      applyAppIcons();
      applyCPhoneAppIcons();
      applyMyPhoneAppIconsGlobal();
      applyStatusBarVisibility();
      applyWidgetData();

      renderButtonOrderEditor();
      applyButtonOrder();

      // 【关键修改】：调用 renderWallpaperScreen 时传入 selectedId
      // 这样下拉框就会被强制设置为当前选中的预设，而不会跳回"请选择"
      renderWallpaperScreen(selectedId);

      alert(`已成功加载外观预设："${preset.name}"\n(缺失的新App图标已自动重置为默认)`);
    }
  }


  async function saveAppearancePreset() {
    const name = await showCustomPrompt('保存外观预设', '请输入预设名称');
    if (!name || !name.trim()) return;


    const appearanceData = {
      wallpaper: state.globalSettings.wallpaper,
      cphoneWallpaper: state.globalSettings.cphoneWallpaper,
      globalChatBackground: state.globalSettings.globalChatBackground,
      appIcons: state.globalSettings.appIcons,
      cphoneAppIcons: state.globalSettings.cphoneAppIcons,
      myphoneAppIcons: state.globalSettings.myphoneAppIcons,
      chatActionButtonsOrder: state.globalSettings.chatActionButtonsOrder,
      chatHeaderButtonsOrder: state.globalSettings.chatHeaderButtonsOrder,
      chatSelectionButtonsOrder: state.globalSettings.chatSelectionButtonsOrder,
      messageActionsOrder: state.globalSettings.messageActionsOrder,
      theme: localStorage.getItem('ephone-theme') || 'light',
      showStatusBar: state.globalSettings.showStatusBar,
      notificationSoundUrl: state.globalSettings.notificationSoundUrl,
      widgetData: state.globalSettings.widgetData
    };


    const existingPreset = await db.appearancePresets.where({
      name: name.trim(),
      type: 'appearance'
    }).first();
    if (existingPreset) {
      const confirmed = await showCustomConfirm('覆盖预设', `名为 "${name.trim()}" 的预设已存在。要覆盖它吗？`, {
        confirmButtonClass: 'btn-danger'
      });
      if (!confirmed) return;

      await db.appearancePresets.update(existingPreset.id, {
        value: appearanceData
      });
    } else {
      await db.appearancePresets.add({
        name: name.trim(),
        type: 'appearance',
        value: appearanceData
      });
    }


    await loadAppearancePresetsDropdown();
    alert('外观预设已保存！');
  }


  async function deleteAppearancePreset() {
    const selectEl = document.getElementById('appearance-preset-select');
    const selectedId = parseInt(selectEl.value);

    if (isNaN(selectedId)) {
      alert('请先从下拉框中选择一个要删除的预设。');
      return;
    }

    const preset = await db.appearancePresets.get(selectedId);
    if (!preset) return;

    const confirmed = await showCustomConfirm('删除预设', `确定要删除预设 "${preset.name}" 吗？`, {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.appearancePresets.delete(selectedId);
      await loadAppearancePresetsDropdown();
      alert('预设已删除。');
    }
  }


