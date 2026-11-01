// ========== 壁纸/外观屏幕渲染 ==========

  async function renderWallpaperScreen(forcePresetId = null) {
    window.renderInterfaceZoomSettings?.();
    console.log('[声音预设DEBUG] renderWallpaperScreen 被调用');
    loadCssPresetsDropdown();
    // 这里传入 forcePresetId
    loadAppearancePresetsDropdown(forcePresetId);

    const ephonePreview = document.getElementById('wallpaper-preview');

    if (newWallpaperBase64) {
      ephonePreview.style.backgroundImage = `url("${newWallpaperBase64}")`;
      ephonePreview.textContent = '';
    } else {
      const ephoneBg = state.globalSettings.wallpaper;
      if (ephoneBg && ephoneBg.trim() !== '') {
        ephonePreview.style.backgroundImage = `url("${ephoneBg}")`;
        ephonePreview.textContent = '';
      } else {
        ephonePreview.style.backgroundImage = 'none';
        ephonePreview.style.backgroundColor = '#ffffff';
        ephonePreview.textContent = '点击下方上传';
      }
    }

    const cphonePreview = document.getElementById('cphone-wallpaper-preview');
    const cphoneBg = state.globalSettings.cphoneWallpaper;
    if (cphoneBg) {
      cphonePreview.style.backgroundImage = `url("${cphoneBg}")`;
      cphonePreview.textContent = '';
    } else {
      cphonePreview.style.backgroundImage = 'none';
      cphonePreview.style.backgroundColor = '#ffffff';
      cphonePreview.textContent = '当前为白色';
    }

    const myphonePreview = document.getElementById('myphone-wallpaper-preview');
    const myphoneBg = state.globalSettings.myphoneWallpaper;
    if (myphoneBg) {
      myphonePreview.style.backgroundImage = `url("${myphoneBg}")`;
      myphonePreview.textContent = '';
    } else {
      myphonePreview.style.backgroundImage = 'none';
      myphonePreview.style.backgroundColor = '#ffffff';
      myphonePreview.textContent = '当前为白色';
    }

    const globalBgPreview = document.getElementById('global-bg-preview');
    const globalBg = state.globalSettings.globalChatBackground;
    if (globalBg) {
      globalBgPreview.style.backgroundImage = `url(${globalBg})`;
      globalBgPreview.textContent = '';
    } else {
      globalBgPreview.style.backgroundImage = 'none';
      globalBgPreview.style.backgroundColor = '#ffffff';
      globalBgPreview.textContent = '点击下方上传';
    }

    renderIconSettings();
    renderCPhoneIconSettings();
    renderMyPhoneIconSettings();
    document.getElementById('global-css-input').value = state.globalSettings.globalCss || '';
    document.getElementById('notification-sound-url-input').value = state.globalSettings.notificationSoundUrl || '';

    // 初始化音量滑动条
    const volumeValue = (state.globalSettings.notificationVolume !== undefined ? state.globalSettings.notificationVolume : 1.0) * 100;
    document.getElementById('notification-volume-slider').value = volumeValue;
    document.getElementById('notification-volume-label').textContent = Math.round(volumeValue) + '%';

    if (typeof renderSoundPresets === 'function') {
      console.log('[声音预设DEBUG] 准备调用 renderSoundPresets');
      await renderSoundPresets(); // 渲染提示音预设列表
      console.log('[声音预设DEBUG] renderSoundPresets 调用完成');
    } else {
      console.error('[声音预设DEBUG] renderSoundPresets 函数不存在！');
    }
    document.getElementById('status-bar-toggle-switch').checked = state.globalSettings.showStatusBar || false;
    document.getElementById('global-show-seconds-switch').checked = state.globalSettings.showSeconds || false;
    document.getElementById('phone-frame-toggle-switch').checked = state.globalSettings.showPhoneFrame || false;
    document.getElementById('minimal-chat-ui-switch').checked = state.globalSettings.enableMinimalChatUI || false;
    document.getElementById('dynamic-island-music-toggle-switch').checked = state.globalSettings.alwaysShowMusicIsland || false;
    document.getElementById('detach-status-bar-switch').checked = state.globalSettings.detachStatusBar || false;
    document.getElementById('clean-chat-detail-switch').checked = state.globalSettings.cleanChatDetail || false;
    document.getElementById('clean-api-settings-switch').checked = state.globalSettings.cleanApiSettings || false;
    document.getElementById('api-style-beautify-switch').checked = state.globalSettings.apiStyleBeautify || false;
    document.getElementById('dropdown-popup-mode-switch').checked = state.globalSettings.dropdownPopupMode || false;
    document.getElementById('global-show-thought-chain-switch').checked = state.globalSettings.showThoughtChainInChat !== false;
    document.getElementById('lock-screen-toggle').checked = state.globalSettings.lockScreenEnabled || false; // 锁屏回显
    document.getElementById('lock-screen-bypass-toggle').checked = state.globalSettings.lockScreenBypassEnabled || false; // 锁屏跳过回显
    document.getElementById('lock-screen-password-input').value = state.globalSettings.lockScreenPassword || ''; // 密码回显

    // 锁屏壁纸回显
    const lockPreview = document.getElementById('lock-wallpaper-preview');
    if (state.globalSettings.lockScreenWallpaper) {
      lockPreview.style.backgroundImage = `url(${state.globalSettings.lockScreenWallpaper})`;
      lockPreview.textContent = '';
    } else {
      lockPreview.style.backgroundImage = 'linear-gradient(135deg, #1c1c1e, #3a3a3c)';
      lockPreview.textContent = '默认壁纸';
    }

    renderButtonOrderEditor();
    initializeButtonOrderEditor();
    applyButtonOrder();

    // 加载系统通知设置
    loadSystemNotificationSettings();
  }

  window.renderWallpaperScreenProxy = renderWallpaperScreen;

  function applyGlobalWallpaper() {
    const homeScreen = document.getElementById('home-screen');
    const wallpaper = state.globalSettings.wallpaper;
    if (wallpaper) {

      homeScreen.style.backgroundImage = `url("${wallpaper}")`;
      homeScreen.style.backgroundColor = '';
    } else {

      homeScreen.style.backgroundImage = 'none';
      homeScreen.style.backgroundColor = '#ffffff';
    }
  }


