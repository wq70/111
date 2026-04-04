// ============================================================
// init-features.js
// 功能模块：init() 函数后半段
// 从 init-and-state.js 约 10164~17200 行拆分
// 包含：提示音设置、壁纸设置、外观保存、贴纸分类、
//       角色手机功能（CPhone/MYphone）、快捷回复、
//       旁白功能、真心话游戏、一起看电影功能（含播放列表、影视搜索）、
//       阅读室功能、你画我猜功能、预设管理功能、
//       狼人杀功能、锁屏/更新检查等收尾初始化前的所有事件绑定
// ============================================================

window.initFeatures = function(state, db) {



    document.getElementById('test-sound-btn').addEventListener('click', () => {
      const player = document.getElementById('notification-sound-player');
      const url = document.getElementById('notification-sound-url-input').value.trim() || DEFAULT_NOTIFICATION_SOUND;
      player.src = url;
      // 应用音量设置
      player.volume = parseInt(document.getElementById('notification-volume-slider').value) / 100;
      player.play().catch(e => alert('播放失败，请检查URL是否正确或浏览器是否支持该格式。'));
    });

    document.getElementById('reset-sound-btn').addEventListener('click', () => {
      document.getElementById('notification-sound-url-input').value = '';
      alert('已重置为默认提示音，点击“保存所有外观设置”后生效。');
    });

    document.getElementById('home-screen').addEventListener('click', (e) => {
      const target = e.target;

      if (target.classList.contains('editable-text')) {
        handleEditText(target);
      }

      if (target.classList.contains('editable-image')) {
        handleEditImage(target);
      }
    });

    // 提示音预设相关事件监听器
    document.getElementById('sound-preset-select').addEventListener('change', handleSoundPresetSelectionChange);
    document.getElementById('save-sound-preset-btn').addEventListener('click', saveSoundPreset);
    document.getElementById('delete-sound-preset-btn').addEventListener('click', deleteSoundPreset);

    // 当用户手动修改提示音 URL 时，更新下拉框为"当前配置"
    document.getElementById('notification-sound-url-input').addEventListener('input', async () => {
      if (typeof loadSoundPresetsDropdown === 'function') {
        await loadSoundPresetsDropdown();
      }
    });

    // 音量滑动条事件监听器
    document.getElementById('notification-volume-slider').addEventListener('input', (e) => {
      const volumePercent = parseInt(e.target.value);
      document.getElementById('notification-volume-label').textContent = volumePercent + '%';
      // 实时保存音量设置
      state.globalSettings.notificationVolume = volumePercent / 100;
      db.globalSettings.put(state.globalSettings);
    });

    document.getElementById('add-song-search-btn').addEventListener('click', addSongFromSearch);

    document.getElementById('cancel-music-search-btn').addEventListener('click', () => {
      document.getElementById('music-search-results-modal').classList.remove('visible');
    });


    document.getElementById('add-song-search-btn').addEventListener('click', addSongFromSearch);

    document.getElementById('cancel-music-search-btn').addEventListener('click', () => {
      document.getElementById('music-search-results-modal').classList.remove('visible');
    });


    document.getElementById('select-all-music-search').addEventListener('change', function (e) {
      document.querySelectorAll('#search-results-list .music-search-checkbox').forEach(cb => {
        cb.checked = e.target.checked;
      });
    });


    document.getElementById('search-results-list').addEventListener('click', (e) => {
      const item = e.target.closest('.search-result-item');
      if (item) {
        const checkbox = item.querySelector('.music-search-checkbox');
        if (checkbox) {

          if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
          }
        }
      }
    });


    document.getElementById('add-selected-music-btn').addEventListener('click', async () => {
      const selectedItems = document.querySelectorAll('.music-search-checkbox:checked');
      if (selectedItems.length === 0) {
        alert("请先选择要添加的歌曲。");
        return;
      }

      // 选择歌单
      const playlistId = await showPlaylistPicker('添加到哪个歌单？');

      document.getElementById('music-search-results-modal').classList.remove('visible');
      await showCustomAlert("请稍候...", `正在批量添加 ${selectedItems.length} 首歌曲...`);

      const songDataList = Array.from(selectedItems).map(cb => JSON.parse(cb.closest('.search-result-item').dataset.songJson));

      let successCount = 0;
      let failedNames = [];


      const songDetailPromises = songDataList.map(songData => getPlayableSongDetails(songData));
      const fullSongObjects = await Promise.all(songDetailPromises);

      fullSongObjects.forEach((songObject, index) => {
        if (songObject) {
          songObject.playlistId = playlistId;
          musicState.playlist.push(songObject);
          successCount++;
        } else {
          failedNames.push(songDataList[index].name);
        }
      });

      if (successCount > 0) {
        await saveGlobalPlaylist();
        updatePlaylistUI();
        if (musicState.currentIndex === -1) {
          musicState.currentIndex = musicState.playlist.length - successCount;
          updatePlayerUI();
        }
      }

      let resultMessage = `添加完成！\n\n成功添加 ${successCount} 首歌曲。`;
      if (failedNames.length > 0) {
        resultMessage += `\n\n${failedNames.length} 首歌曲获取失败:\n- ${failedNames.join('\n- ')}`;
      }
      await showCustomAlert("操作结果", resultMessage);
    });



    document.getElementById('music-visual-container').addEventListener('click', () => {
      document.getElementById('music-visual-container').classList.toggle('lyrics-active');
    });



    document.getElementById('add-song-search-btn').addEventListener('click', addSongFromSearch);
    document.getElementById('cancel-music-search-btn').addEventListener('click', () => {
      document.getElementById('music-search-results-modal').classList.remove('visible');
    });

    document.getElementById('search-results-list').addEventListener('click', (e) => {
      const item = e.target.closest('.search-result-item');
      if (item && item.dataset.songJson) {
        const songData = JSON.parse(item.dataset.songJson);
        handleSearchResultClick(songData);
      }
    });



    document.getElementById('cleanup-songs-btn').addEventListener('click', cleanupInvalidSongs);
    document.getElementById('playlist-manager-btn').addEventListener('click', openPlaylistManager);
    document.getElementById('move-to-playlist-btn').addEventListener('click', executeMoveToPlaylist);
    document.getElementById('toggle-blur-btn').addEventListener('click', toggleBackgroundBlur);
    document.getElementById('toggle-fullscreen-btn').addEventListener('click', togglePlayerFullscreen);
    document.getElementById('show-avatars-btn').addEventListener('click', toggleMusicPlayerAvatars);

    // 被清理歌曲模态框事件
    document.getElementById('select-all-cleaned-songs').addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.cleaned-song-checkbox');
      checkboxes.forEach(cb => cb.checked = e.target.checked);
    });
    document.getElementById('close-cleaned-songs-btn').addEventListener('click', () => {
      document.getElementById('cleaned-songs-modal').classList.remove('visible');
    });
    document.getElementById('research-selected-songs-btn').addEventListener('click', handleResearchSelectedSongs);


    document.getElementById('status-bar-toggle-switch').addEventListener('change', () => {

      state.globalSettings.showStatusBar = document.getElementById('status-bar-toggle-switch').checked;
      applyStatusBarVisibility();
    });

    document.getElementById('qzone-more-actions-btn').addEventListener('click', openClearPostsSelectorModal);


    document.getElementById('cancel-clear-posts-btn').addEventListener('click', () => {
      document.getElementById('clear-posts-modal').classList.remove('visible');
    });
    document.getElementById('confirm-clear-posts-btn').addEventListener('click', handleConfirmClearPosts);


    document.getElementById('clear-posts-list').addEventListener('click', (e) => {
      const item = e.target.closest('.clear-posts-item');
      if (item) {
        item.classList.toggle('selected');
      }
    });

    document.getElementById('global-bg-input').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (file) {
        const dataUrl = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });

        // 1. 立即保存和显示
        state.globalSettings.globalChatBackground = dataUrl;
        renderWallpaperScreen();
        await showCustomAlert("成功", "全局聊天背景已更新！\n\n图片将在后台静默上传到图床... (保存设置后生效)");

        // 2. 启动静默上传
        (async () => {
          await silentlyUpdateDbUrl(
            db.globalSettings,
            'main',
            'globalChatBackground',
            dataUrl
          );
        })();
      }
      event.target.value = null;
    });

    // 重置全局聊天背景
    document.getElementById('reset-global-bg-btn').addEventListener('click', async () => {
      const confirmed = await showCustomConfirm("重置确认", "确定要重置聊天背景为默认吗？");
      if (confirmed) {
        state.globalSettings.globalChatBackground = '';
        renderWallpaperScreen();
        await showCustomAlert("已重置", "聊天背景已恢复为默认（白色）！");
      }
    });


    document.getElementById('save-wallpaper-btn').addEventListener('click', async () => {

      if (newWallpaperBase64) {
        state.globalSettings.wallpaper = newWallpaperBase64;
      }



      state.globalSettings.globalCss = document.getElementById('global-css-input').value.trim();
      state.globalSettings.notificationSoundUrl = document.getElementById('notification-sound-url-input').value.trim();
      state.globalSettings.notificationVolume = parseInt(document.getElementById('notification-volume-slider').value) / 100;
      state.globalSettings.showStatusBar = document.getElementById('status-bar-toggle-switch').checked;
      state.globalSettings.showSeconds = document.getElementById('global-show-seconds-switch').checked;
      state.globalSettings.dropdownPopupMode = document.getElementById('dropdown-popup-mode-switch').checked;
      state.globalSettings.lockScreenEnabled = document.getElementById('lock-screen-toggle').checked;
      state.globalSettings.lockScreenPassword = document.getElementById('lock-screen-password-input').value.trim();

      const lockPreview = document.getElementById('lock-wallpaper-preview');
      if (lockPreview.dataset.tempUrl) {
        state.globalSettings.lockScreenWallpaper = lockPreview.dataset.tempUrl;
      }

      await db.globalSettings.put(state.globalSettings);


      applyGlobalWallpaper();
      newWallpaperBase64 = null;
      applyAppIcons();
      applyCPhoneAppIcons();
      applyMyPhoneAppIconsGlobal();
      applyGlobalCss(state.globalSettings.globalCss);
      applyStatusBarVisibility();
      initLockScreen();
      alert('外观设置已保存并应用！');
      showScreen('home-screen');
    });


    document.getElementById('upload-global-bg-url-btn').addEventListener('click', async () => {

      const url = await showCustomPrompt("网络图片", "请输入背景图片的URL", "", "url");


      if (url && url.trim()) {

        state.globalSettings.globalChatBackground = url.trim();


        renderWallpaperScreen();
      } else if (url !== null) {

        alert("请输入有效的URL。");
      }
    });

    document.getElementById('upload-ephone-bg-url-btn').addEventListener('click', async () => {
      const url = await showCustomPrompt("网络图片 (EPhone)", "请输入EPhone主屏幕的背景图片URL", "", "url");
      if (url && url.trim()) {

        newWallpaperBase64 = url.trim();

        renderWallpaperScreen();
      } else if (url !== null) {
        alert("请输入有效的URL。");
      }
    });


    document.getElementById('upload-cphone-bg-url-btn').addEventListener('click', async () => {
      const url = await showCustomPrompt("网络图片 (CPhone)", "请输入CPhone的背景图片URL", "", "url");
      if (url && url.trim()) {

        state.globalSettings.cphoneWallpaper = url.trim();

        renderWallpaperScreen();
      } else if (url !== null) {
        alert("请输入有效的URL。");
      }
    });


    document.getElementById('upload-myphone-bg-url-btn').addEventListener('click', async () => {
      const url = await showCustomPrompt("网络图片 (MYphone)", "请输入MYphone的背景图片URL", "", "url");
      if (url && url.trim()) {

        state.globalSettings.myphoneWallpaper = url.trim();

        renderWallpaperScreen();
        applyMyPhoneWallpaper();
      } else if (url !== null) {
        alert("请输入有效的URL。");
      }
    });



    // 重置主屏幕壁纸
    document.getElementById('reset-ephone-bg-btn').addEventListener('click', async () => {
      const confirmed = await showCustomConfirm("重置确认", "确定要重置主屏幕壁纸为默认吗？");
      if (confirmed) {
        newWallpaperBase64 = null;
        state.globalSettings.wallpaper = '';
        renderWallpaperScreen();
        await showCustomAlert("已重置", "主屏幕壁纸已恢复为默认（白色）！");
      }
    });

    // 重置CPhone壁纸
    document.getElementById('reset-cphone-bg-btn').addEventListener('click', async () => {
      const confirmed = await showCustomConfirm("重置确认", "确定要重置CPhone壁纸为默认吗？");
      if (confirmed) {
        state.globalSettings.cphoneWallpaper = '';
        renderWallpaperScreen();
        await showCustomAlert("已重置", "CPhone壁纸已恢复为默认（白色）！");
      }
    });

    // 重置MYphone壁纸
    document.getElementById('reset-myphone-bg-btn').addEventListener('click', async () => {
      const confirmed = await showCustomConfirm("重置确认", "确定要重置MYphone壁纸为默认吗？");
      if (confirmed) {
        state.globalSettings.myphoneWallpaper = '';
        renderWallpaperScreen();
        applyMyPhoneWallpaper();
        await showCustomAlert("已重置", "MYphone壁纸已恢复为默认（白色）！");
      }
    });


    document.getElementById('css-preset-select').addEventListener('change', handleCssPresetSelectionChange);
    document.getElementById('save-css-preset-btn').addEventListener('click', saveCssPreset);
    document.getElementById('delete-css-preset-btn').addEventListener('click', deleteCssPreset);


    document.getElementById('font-preset-select').addEventListener('change', handleFontPresetSelectionChange);
    document.getElementById('save-font-preset-btn').addEventListener('click', saveFontPreset);
    document.getElementById('delete-font-preset-btn').addEventListener('click', deleteFontPreset);


    document.getElementById('theme-preset-select').addEventListener('change', handleThemePresetSelectionChange);
    document.getElementById('save-theme-preset-btn').addEventListener('click', saveThemePreset);
    document.getElementById('delete-theme-preset-btn').addEventListener('click', deleteThemePreset);




    document.getElementById('manage-sticker-categories-btn').addEventListener('click', openStickerCategoryManager);


    document.getElementById('close-sticker-category-manager-btn').addEventListener('click', () => {
      document.getElementById('sticker-category-manager-modal').classList.remove('visible');
      renderStickerPanel();
    });


    document.getElementById('add-new-sticker-category-btn').addEventListener('click', addNewStickerCategory);


    document.getElementById('existing-sticker-categories-list').addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-group-btn')) {
        const categoryId = parseInt(e.target.dataset.id);
        deleteStickerCategory(categoryId);
      }
    });


    document.getElementById('sticker-category-tabs').addEventListener('click', (e) => {
      if (e.target.classList.contains('sticker-category-tab')) {
        const categoryId = e.target.dataset.categoryId;

        const finalId = (categoryId !== 'all' && categoryId !== 'uncategorized') ? parseInt(categoryId) : categoryId;
        switchStickerCategory(finalId);
      }
    });


    document.getElementById('select-all-stickers-checkbox').addEventListener('change', handleSelectAllStickers);

    document.getElementById('export-single-chat-btn').addEventListener('click', exportSingleChat);

    document.getElementById('export-character-full-btn').addEventListener('click', exportCharacterFull);

    document.getElementById('import-single-chat-btn').addEventListener('click', () => {
      document.getElementById('import-single-chat-input').click();
    });

    document.getElementById('import-single-chat-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        importSingleChat(file);
      }
      e.target.value = null;
    });


    document.getElementById('add-char-memo-btn').addEventListener('click', () => openMemoEditor());
    document.getElementById('add-char-diary-btn').addEventListener('click', () => openDiaryEditor());
    document.getElementById('favorite-diary-btn').addEventListener('click', toggleDiaryFavorite);
    document.getElementById('favorite-article-btn').addEventListener('click', toggleBrowserArticleFavorite);
    document.getElementById('favorite-memo-btn').addEventListener('click', toggleMemoFavorite);
    document.getElementById('copy-diary-content-btn').addEventListener('click', () => {
      const content = document.getElementById('char-diary-detail-content').innerText; // Use innerText to get formatted text
      copyTextToClipboard(content, '日记内容已复制！');
    });
    document.getElementById('edit-diary-btn').addEventListener('click', editDiary);

    document.getElementById('copy-memo-content-btn').addEventListener('click', () => {
      const content = document.getElementById('char-memo-detail-content').value; // It's a textarea
      copyTextToClipboard(content, '备忘录内容已复制！');
    });

    document.getElementById('copy-article-content-btn').addEventListener('click', () => {
      const content = document.getElementById('char-article-content').innerText;
      copyTextToClipboard(content, '文章内容已复制！');
    });


    document.getElementById('regenerate-char-qq-btn').addEventListener('click', async () => {

      showCustomAlert("正在执行...", "正在生成新的模拟聊天记录，并同时让角色思考如何与你继续对话...");

      try {

        await Promise.all([
          handleGenerateSimulatedQQ(),
          handleContinueRealConversationFromCPhone()
        ]);

        console.log("CPhone QQ模拟记录生成 和 主聊天推进 已同时完成。");

      } catch (error) {
        console.error("在同时执行两个函数时出错:", error);
        await showCustomAlert("操作失败", `在执行组合操作时遇到错误: ${error.message}`);
      }
    });


    document.getElementById('char-chat-list').addEventListener('click', (e) => {
      const item = e.target.closest('.chat-list-item');
      if (item && item.dataset.conversationIndex) {
        const index = parseInt(item.dataset.conversationIndex);
        if (!isNaN(index)) {

          openCharSimulatedConversation(index);
        }
      }
    });



    document.getElementById('back-to-char-qq-list-btn').addEventListener('click', () => {
      switchToCharScreen('char-qq-screen');
    });



    const charConversationMessages = document.getElementById('char-conversation-messages');


    const cphoneScrollHandler = () => {

      if (cphoneActiveConversationType !== 'private_user') {
        return;
      }


      if (charConversationMessages.scrollTop < 1 && !isLoadingMoreCphoneMessages) {
        const totalMessages = state.chats[activeCharacterId]?.history.length || 0;

        if (totalMessages > cphoneRenderedCount) {

          loadMoreMirroredMessages();
        }
      }
    };


    charConversationMessages.addEventListener('scroll', cphoneScrollHandler);



    document.getElementById('char-simulated-send-btn').addEventListener('click', () => {
      alert("这是模拟对话，无法发送消息哦~");
    });



    document.getElementById('regenerate-char-album-btn').addEventListener('click', handleGenerateSimulatedAlbum);


    document.getElementById('char-album-grid').addEventListener('click', (e) => {

      const photoItem = e.target.closest('.char-photo-item');


      if (photoItem && photoItem.dataset.description) {
        const description = photoItem.dataset.description;


        showCustomAlert("照片详情", description.replace(/\n/g, '<br>'));
      }
    });
    document.getElementById('regenerate-char-browser-btn').addEventListener('click', handleGenerateBrowserHistory);

    document.getElementById('regenerate-char-taobao-btn').addEventListener('click', handleGenerateTaobaoHistory);



    document.getElementById('char-product-grid').addEventListener('click', (e) => {
      const item = e.target.closest('.char-product-item');
      if (item && item.dataset.reason) {
        const reason = item.dataset.reason;
        showCustomAlert("TA的想法...", reason.replace(/\n/g, '<br>'));
      }
    });


    window.openCharWallet = openCharWallet;
    document.getElementById('regenerate-char-memo-btn').addEventListener('click', handleGenerateSimulatedMemos);
    document.getElementById('char-memo-detail-back-btn').addEventListener('click', () => switchToCharScreen('char-memo-screen'));

    document.getElementById('regenerate-char-diary-btn').addEventListener('click', handleGenerateSimulatedDiaries);
    document.getElementById('add-char-diary-btn').addEventListener('click', handleWriteNewDiaryEntry);
    document.getElementById('char-diary-detail-back-btn').addEventListener('click', () => switchToCharScreen('char-diary-screen'));
    document.getElementById('regenerate-char-amap-btn').addEventListener('click', handleGenerateAmapHistory);
    document.getElementById('regenerate-char-usage-btn').addEventListener('click', handleGenerateAppUsage);
    document.getElementById('regenerate-char-music-btn').addEventListener('click', handleGenerateSimulatedMusic);
    document.getElementById('close-char-music-player-btn').addEventListener('click', closeCharMusicPlayer);
    document.getElementById('regenerate-douban-btn').addEventListener('click', handleGenerateDoubanPosts);
    document.getElementById('regenerate-douban-btn').addEventListener('click', handleGenerateDoubanPosts);

    // MY Phone 重新生成按钮事件监听
    document.getElementById('regenerate-myphone-qq-btn')?.addEventListener('click', async () => {
      showCustomAlert("正在执行...", "正在生成我的模拟聊天记录...");
      try {
        await handleGenerateMyPhoneQQ();
        renderMyPhoneSimulatedQQ();
        showCustomAlert("完成", "我的QQ聊天记录已生成！");
      } catch (error) {
        showCustomAlert("错误", "生成失败：" + error.message);
      }
    });

    // MY Phone QQ 添加按钮事件监听
    document.getElementById('add-myphone-qq-btn')?.addEventListener('click', () => {
      showMyPhoneAddContactDialog();
    });

    // MY Phone 添加联系人选择弹窗按钮
    document.getElementById('myphone-manual-create-btn')?.addEventListener('click', () => {
      manualCreateMyPhoneContact();
    });

    document.getElementById('myphone-import-from-main-btn')?.addEventListener('click', () => {
      showImportMainScreenCharacters();
    });

    document.getElementById('cancel-myphone-add-choice-btn')?.addEventListener('click', () => {
      document.getElementById('myphone-add-choice-modal')?.classList.remove('visible');
    });

    // MY Phone 导入角色弹窗按钮
    document.getElementById('select-all-myphone-import')?.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      document.querySelectorAll('.myphone-import-checkbox').forEach(cb => {
        cb.checked = isChecked;
      });
    });

    document.getElementById('confirm-myphone-import-btn')?.addEventListener('click', () => {
      importSelectedCharacters();
    });

    document.getElementById('cancel-myphone-import-btn')?.addEventListener('click', () => {
      document.getElementById('myphone-import-characters-modal')?.classList.remove('visible');
    });

    // MY Phone 联系人设置按钮
    document.getElementById('myphone-conversation-settings-btn')?.addEventListener('click', () => {
      openMyPhoneContactSettings();
    });

    // MY Phone 设置界面按钮
    document.getElementById('back-to-myphone-conversation-btn')?.addEventListener('click', async () => {
      const index = window.currentMyPhoneConversationIndex;
      if (index !== undefined) {
        await openMyPhoneConversation(index);
      }
    });

    document.getElementById('myphone-change-avatar-btn')?.addEventListener('click', () => {
      changeMyPhoneContactAvatar();
    });

    document.getElementById('myphone-save-contact-settings-btn')?.addEventListener('click', () => {
      saveMyPhoneContactSettings();
    });

    document.getElementById('myphone-add-message-btn')?.addEventListener('click', () => {
      addMyPhoneMessage();
    });

    // MyPhone 锁屏设置事件监听
    document.getElementById('myphone-lock-screen-toggle')?.addEventListener('change', async (e) => {
      if (!activeMyPhoneCharacterId) return;
      const char = state.chats[activeMyPhoneCharacterId];
      if (!char) return;

      const detail = document.getElementById('myphone-lock-screen-settings-detail');
      if (detail) {
        detail.style.display = e.target.checked ? 'block' : 'none';
      }

      char.settings.myPhoneLockScreenEnabled = e.target.checked;
      await db.chats.put(char);
    });

    document.getElementById('myphone-lock-screen-password-input')?.addEventListener('change', async (e) => {
      if (!activeMyPhoneCharacterId) return;
      const char = state.chats[activeMyPhoneCharacterId];
      if (!char) return;

      const password = e.target.value.trim();
      if (password && password.length !== 4) {
        showCustomAlert('提示', '密码必须是4位数字');
        e.target.value = char.settings.myPhoneLockScreenPassword || '';
        return;
      }

      if (password && !/^\d{4}$/.test(password)) {
        showCustomAlert('提示', '密码必须是4位数字');
        e.target.value = char.settings.myPhoneLockScreenPassword || '';
        return;
      }

      char.settings.myPhoneLockScreenPassword = password;
      await db.chats.put(char);

      if (password) {
        showCustomAlert('成功', '锁屏密码已设置');
      }
    });

    // MY Phone QQ 对话消息点击事件监听（图片、语音、转账）
    document.getElementById('myphone-conversation-messages')?.addEventListener('click', async (e) => {
      // 1. 处理 AI 生成的图片点击 - 显示描述
      const aiImage = e.target.closest('.ai-generated-image');
      if (aiImage) {
        const description = aiImage.dataset.description;
        if (description) {
          showCustomAlert('照片描述', description);
        }
        return;
      }

      // 2. 处理语音消息点击 - 显示/隐藏文字
      const voiceBody = e.target.closest('.voice-message-body[data-text]');
      if (voiceBody) {
        const bubble = voiceBody.closest('.message-bubble');
        if (!bubble) return;

        const transcriptEl = bubble.querySelector('.voice-transcript');
        const text = decodeURIComponent(voiceBody.dataset.text);

        if (transcriptEl.style.display === 'block') {
          // 隐藏文字
          transcriptEl.style.display = 'none';
        } else {
          // 显示文字
          transcriptEl.textContent = text;
          transcriptEl.style.display = 'block';
        }
        return;
      }

      // 3. 处理转账点击 - 显示接收/拒绝弹窗
      const bubble = e.target.closest('.message-bubble');
      if (bubble && bubble.classList.contains('ai') && bubble.classList.contains('is-transfer') && bubble.dataset.status === 'pending') {
        const timestamp = parseInt(bubble.dataset.timestamp);
        if (!isNaN(timestamp)) {
          // 显示转账操作弹窗
          showMyPhoneTransferActionModal(timestamp);
        }
        return;
      }
    });

    // MY Phone QQ 对话滚动加载事件监听
    const myphoneConversationMessages = document.getElementById('myphone-conversation-messages');
    if (myphoneConversationMessages) {
      const myphoneScrollHandler = () => {
        // 只有在查看真实对话（index === -1）时才支持滚动加载
        if (myphoneActiveConversationIndex !== -1) {
          return;
        }

        // 滚动到顶部时加载更多消息
        if (myphoneConversationMessages.scrollTop < 1 && !isLoadingMoreMyPhoneMessages) {
          const char = state.chats[activeMyPhoneCharacterId];
          if (!char) return;

          const totalMessages = char.history.filter(m => !m.isHidden).length;

          if (totalMessages > myphoneRenderedCount) {
            loadMoreMyPhoneMessages();
          }
        }
      };

      myphoneConversationMessages.addEventListener('scroll', myphoneScrollHandler);
    }

    document.getElementById('regenerate-myphone-album-btn')?.addEventListener('click', async () => {
      showCustomAlert("正在执行...", "正在生成我的相册...");
      try {
        await handleGenerateMyPhoneAlbum();
        renderMyPhoneAlbum();
        showCustomAlert("完成", "我的相册已生成！");
      } catch (error) {
        showCustomAlert("错误", "生成失败：" + error.message);
      }
    });

    document.getElementById('regenerate-myphone-browser-btn')?.addEventListener('click', async () => {
      showCustomAlert("正在执行...", "正在生成我的浏览记录...");
      try {
        await handleGenerateMyPhoneBrowserHistory();
        renderMyPhoneBrowserHistory();
        showCustomAlert("完成", "我的浏览记录已生成！");
      } catch (error) {
        showCustomAlert("错误", "生成失败：" + error.message);
      }
    });

    document.getElementById('regenerate-myphone-taobao-btn')?.addEventListener('click', async () => {
      showCustomAlert("正在执行...", "正在生成我的淘宝记录...");
      try {
        await handleGenerateMyPhoneTaobao();
        renderMyPhoneTaobao();
        showCustomAlert("完成", "我的淘宝记录已生成！");
      } catch (error) {
        showCustomAlert("错误", "生成失败：" + error.message);
      }
    });

    document.getElementById('regenerate-myphone-memo-btn')?.addEventListener('click', async () => {
      showCustomAlert("正在执行...", "正在生成我的备忘录...");
      try {
        await handleGenerateMyPhoneMemos();
        renderMyPhoneMemoList();
        showCustomAlert("完成", "我的备忘录已生成！");
      } catch (error) {
        showCustomAlert("错误", "生成失败：" + error.message);
      }
    });

    document.getElementById('regenerate-myphone-diary-btn')?.addEventListener('click', async () => {
      showCustomAlert("正在执行...", "正在生成我的日记...");
      try {
        await handleGenerateMyPhoneDiaries();
        renderMyPhoneDiaryList();
        showCustomAlert("完成", "我的日记已生成！");
      } catch (error) {
        showCustomAlert("错误", "生成失败：" + error.message);
      }
    });

    document.getElementById('regenerate-myphone-amap-btn')?.addEventListener('click', async () => {
      showCustomAlert("正在执行...", "正在生成我的足迹...");
      try {
        await handleGenerateMyPhoneAmap();
        renderMyPhoneAmap();
        showCustomAlert("完成", "我的足迹已生成！");
      } catch (error) {
        showCustomAlert("错误", "生成失败：" + error.message);
      }
    });

    document.getElementById('regenerate-myphone-usage-btn')?.addEventListener('click', async () => {
      showCustomAlert("正在执行...", "正在生成我的APP使用记录...");
      try {
        await handleGenerateMyPhoneAppUsage();
        renderMyPhoneAppUsage();
        showCustomAlert("完成", "我的APP使用记录已生成！");
      } catch (error) {
        showCustomAlert("错误", "生成失败：" + error.message);
      }
    });

    document.getElementById('regenerate-myphone-music-btn')?.addEventListener('click', async () => {
      showCustomAlert("正在执行...", "正在生成我的音乐歌单...");
      try {
        await handleGenerateMyPhoneMusic();
        renderMyPhoneMusicScreen();
        showCustomAlert("完成", "我的音乐歌单已生成！");
      } catch (error) {
        showCustomAlert("错误", "生成失败：" + error.message);
      }
    });

    // MY Phone 手动添加按钮事件监听
    document.getElementById('add-myphone-album-btn')?.addEventListener('click', () => {
      document.getElementById('myphone-add-album-modal')?.classList.add('visible');
    });

    document.getElementById('add-myphone-browser-btn')?.addEventListener('click', () => {
      document.getElementById('myphone-add-browser-modal')?.classList.add('visible');
    });

    document.getElementById('add-myphone-taobao-btn')?.addEventListener('click', () => {
      document.getElementById('myphone-add-taobao-modal')?.classList.add('visible');
    });

    document.getElementById('add-myphone-diary-btn')?.addEventListener('click', () => {
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('myphone-diary-date-input').value = today;
      document.getElementById('myphone-add-diary-modal')?.classList.add('visible');
    });

    document.getElementById('add-myphone-memo-btn')?.addEventListener('click', () => {
      document.getElementById('myphone-add-memo-modal')?.classList.add('visible');
    });

    document.getElementById('add-myphone-amap-btn')?.addEventListener('click', () => {
      document.getElementById('myphone-add-amap-modal')?.classList.add('visible');
    });

    document.getElementById('add-myphone-usage-btn')?.addEventListener('click', () => {
      document.getElementById('myphone-add-usage-modal')?.classList.add('visible');
    });

    document.getElementById('add-myphone-music-btn')?.addEventListener('click', () => {
      // 重置为本地文件模式
      document.getElementById('myphone-music-source-select').value = 'local';
      toggleMyPhoneMusicInputs();
      document.getElementById('myphone-add-music-modal')?.classList.add('visible');
    });

    // 监听添加方式切换
    document.getElementById('myphone-music-source-select')?.addEventListener('change', toggleMyPhoneMusicInputs);

    // MY Phone 删除按钮事件监听
    document.getElementById('delete-myphone-qq-btn')?.addEventListener('click', () => {
      toggleMyPhoneDeleteMode('qq');
    });

    document.getElementById('delete-myphone-album-btn')?.addEventListener('click', () => {
      toggleMyPhoneDeleteMode('album');
    });

    document.getElementById('delete-myphone-browser-btn')?.addEventListener('click', () => {
      toggleMyPhoneDeleteMode('browser');
    });

    document.getElementById('delete-myphone-taobao-btn')?.addEventListener('click', () => {
      toggleMyPhoneDeleteMode('taobao');
    });

    document.getElementById('delete-myphone-memo-btn')?.addEventListener('click', () => {
      toggleMyPhoneDeleteMode('memo');
    });

    document.getElementById('delete-myphone-diary-btn')?.addEventListener('click', () => {
      toggleMyPhoneDeleteMode('diary');
    });

    document.getElementById('delete-myphone-usage-btn')?.addEventListener('click', () => {
      toggleMyPhoneDeleteMode('usage');
    });

    document.getElementById('delete-myphone-music-btn')?.addEventListener('click', () => {
      toggleMyPhoneDeleteMode('music');
    });

    document.getElementById('delete-myphone-amap-btn')?.addEventListener('click', () => {
      toggleMyPhoneDeleteMode('amap');
    });

    // 一起听歌曲全选功能
    document.getElementById('myphone-yiqiting-select-all')?.addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.yiqiting-song-checkbox');
      checkboxes.forEach(checkbox => {
        checkbox.checked = e.target.checked;
      });
    });

    // MY Phone 模态框取消按钮
    document.getElementById('cancel-myphone-album-btn')?.addEventListener('click', () => {
      document.getElementById('myphone-add-album-modal')?.classList.remove('visible');
    });

    document.getElementById('cancel-myphone-browser-btn')?.addEventListener('click', () => {
      document.getElementById('myphone-add-browser-modal')?.classList.remove('visible');
    });

    document.getElementById('cancel-myphone-taobao-btn')?.addEventListener('click', () => {
      document.getElementById('myphone-add-taobao-modal')?.classList.remove('visible');
    });

    document.getElementById('cancel-myphone-diary-btn')?.addEventListener('click', () => {
      document.getElementById('myphone-add-diary-modal')?.classList.remove('visible');
    });

    document.getElementById('cancel-myphone-memo-btn')?.addEventListener('click', () => {
      document.getElementById('myphone-add-memo-modal')?.classList.remove('visible');
    });

    document.getElementById('cancel-myphone-amap-btn')?.addEventListener('click', () => {
      document.getElementById('myphone-add-amap-modal')?.classList.remove('visible');
    });

    document.getElementById('cancel-myphone-usage-btn')?.addEventListener('click', () => {
      document.getElementById('myphone-add-usage-modal')?.classList.remove('visible');
    });

    document.getElementById('cancel-myphone-music-btn')?.addEventListener('click', () => {
      document.getElementById('myphone-add-music-modal')?.classList.remove('visible');
    });

    // MY Phone 模态框保存按钮
    document.getElementById('save-myphone-album-btn')?.addEventListener('click', () => {
      saveMyPhoneAlbum();
    });

    document.getElementById('save-myphone-browser-btn')?.addEventListener('click', () => {
      saveMyPhoneBrowser();
    });

    document.getElementById('save-myphone-taobao-btn')?.addEventListener('click', () => {
      saveMyPhoneTaobao();
    });

    document.getElementById('save-myphone-diary-btn')?.addEventListener('click', () => {
      saveMyPhoneDiary();
    });

    document.getElementById('save-myphone-memo-btn')?.addEventListener('click', () => {
      saveMyPhoneMemo();
    });

    document.getElementById('save-myphone-amap-btn')?.addEventListener('click', () => {
      saveMyPhoneAmap();
    });

    document.getElementById('save-myphone-usage-btn')?.addEventListener('click', () => {
      saveMyPhoneUsage();
    });

    document.getElementById('save-myphone-music-btn')?.addEventListener('click', () => {
      saveMyPhoneMusic();
    });

    document.getElementById('douban-detail-back-btn').addEventListener('click', () => showScreen('douban-screen'));
    document.getElementById('douban-send-comment-btn').addEventListener('click', handleSendDoubanComment);
    document.getElementById('douban-wait-reply-btn').addEventListener('click', handleDoubanWaitReply);

    document.getElementById('cphone-wallpaper-upload-input').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (file) {
        const dataUrl = await new Promise((res) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result);
          reader.readAsDataURL(file);
        });

        // 1. 立即保存和显示
        state.globalSettings.cphoneWallpaper = dataUrl;
        renderWallpaperScreen(); // This will update the preview
        await showCustomAlert("成功", "CPhone 壁纸已更新！\n\n图片将在后台静默上传到图床... (保存设置后生效)");

        // 2. 启动静默上传
        (async () => {
          await silentlyUpdateDbUrl(
            db.globalSettings,
            'main',
            'cphoneWallpaper',
            dataUrl
          );
        })();
      }
      event.target.value = null; // 清空 input
    });

    document.getElementById('myphone-wallpaper-upload-input').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (file) {
        const dataUrl = await new Promise((res) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result);
          reader.readAsDataURL(file);
        });

        // 1. 立即保存和显示
        state.globalSettings.myphoneWallpaper = dataUrl;
        renderWallpaperScreen(); // This will update the preview
        applyMyPhoneWallpaper(); // Apply to actual screen
        await showCustomAlert("成功", "MYphone 壁纸已更新！\n\n图片将在后台静默上传到图床... (保存设置后生效)");

        // 2. 启动静默上传
        (async () => {
          await silentlyUpdateDbUrl(
            db.globalSettings,
            'main',
            'myphoneWallpaper',
            dataUrl
          );
        })();
      }
      event.target.value = null; // 清空 input
    });



    document.getElementById('cphone-icon-settings-grid').addEventListener('click', (e) => {
      if (e.target.classList.contains('change-icon-btn')) {
        const item = e.target.closest('.icon-setting-item');
        const iconId = item.dataset.iconId;
        if (iconId) {
          handleIconChange(iconId, 'cphone', item);
        }
      }
    });

    document.getElementById('myphone-icon-settings-grid').addEventListener('click', (e) => {
      if (e.target.classList.contains('change-icon-btn')) {
        const item = e.target.closest('.icon-setting-item');
        const iconId = item.dataset.iconId;
        if (iconId) {
          handleIconChange(iconId, 'myphone', item);
        }
      }
    });
    document.getElementById('import-appearance-btn').addEventListener('click', () => {
      document.getElementById('import-appearance-input').click();
    });

    document.getElementById('import-appearance-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        importAppearanceSettings(file);
      }
      e.target.value = null;
    });



    document.addEventListener('visibilitychange', () => {

      if (document.visibilityState === 'hidden') {

        localStorage.setItem('ephoneLastActiveTimestamp', Date.now());
        console.log("应用已切换到后台，记录当前时间。");
      }
    });

    document.getElementById('export-world-book-btn').addEventListener('click', exportWorldBooks);
    document.getElementById('import-world-book-btn').addEventListener('click', () => {
      document.getElementById('import-world-book-input').click();
    });
    document.getElementById('import-world-book-input').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        await handleWorldBookImport(files);
      }
      e.target.value = null;
    });
    document.getElementById('enable-ai-drawing-switch').addEventListener('change', async (e) => {
      const isEnabled = e.target.checked;
      state.globalSettings.enableAiDrawing = isEnabled;
      await db.globalSettings.put(state.globalSettings);

      // 展开/收起 Pollinations 设置面板
      const pollinationsDetails = document.getElementById('pollinations-details');
      if (pollinationsDetails) pollinationsDetails.style.display = isEnabled ? '' : 'none';


      const activeScreen = document.querySelector('.screen.active');
      if (activeScreen) {
        switch (activeScreen.id) {
          case 'chat-interface-screen':
            renderChatInterface(state.activeChatId);
            break;
          case 'chat-list-screen':

            if (document.getElementById('qzone-screen').classList.contains('active')) renderQzonePosts();

            if (document.getElementById('favorites-view').classList.contains('active')) renderFavoritesScreen();
            break;
          case 'douban-screen':
            renderDoubanScreen();
            break;
          case 'douban-post-detail-screen':
            openDoubanPostDetail(activeDoubanPostId);
            break;

          case 'character-phone-screen':
            const activeCharScreen = document.querySelector('.char-screen.active');
            if (activeCharScreen) {
              switch (activeCharScreen.id) {
                case 'char-album-screen':
                  renderCharAlbum();
                  break;
                case 'char-taobao-screen':
                  renderCharTaobao();
                  break;
                case 'char-browser-article-screen':
                  const char = state.chats[activeCharacterId];
                  const history = char.simulatedBrowserHistory || [];
                  const lastArticleIndex = history.length > 0 ? history.length - 1 : 0;
                  renderCharArticle(history[lastArticleIndex]);
                  break;
                case 'char-usage-screen':
                  renderCharAppUsage();
                  break;
                case 'char-qq-screen':
                  renderCharSimulatedQQ();
                  break;
                case 'char-qq-conversation-screen':
                  const convoIndex = document.querySelector('#char-chat-list .chat-list-item')?.dataset.conversationIndex || 0;
                  openCharSimulatedConversation(parseInt(convoIndex));
                  break;
              }
            }
            break;
        }
      }
      showCustomAlert('设置已应用', `AI生图功能已${isEnabled ? '开启' : '关闭'}。`);
    });

    // Pollinations Key 显示/隐藏切换
    document.getElementById('pollinations-key-toggle')?.addEventListener('click', () => {
      const input = document.getElementById('pollinations-api-key');
      input.type = input.type === 'password' ? 'text' : 'password';
    });
    // Pollinations Key 保存
    document.getElementById('pollinations-api-key')?.addEventListener('change', (e) => {
      localStorage.setItem('pollinations-api-key', e.target.value.trim());
    });
    // Pollinations 模型保存
    document.getElementById('pollinations-model')?.addEventListener('change', (e) => {
      localStorage.setItem('pollinations-model', e.target.value);
    });

    document.getElementById('search-history-btn').addEventListener('click', openSearchHistoryScreen);
    document.getElementById('search-history-back-btn').addEventListener('click', () => {
      if (state.globalSettings.cleanChatDetail) {
        showScreen('chat-settings-screen');
        setTimeout(() => { if (typeof openCleanChatDetail === 'function') openCleanChatDetail(); }, 50);
      } else {
        showScreen('chat-settings-screen');
      }
    });
    document.getElementById('execute-search-btn').addEventListener('click', handleSearchHistory);
    document.getElementById('clear-search-btn').addEventListener('click', clearSearchFilters);




    document.getElementById('upload-custom-frame-btn').addEventListener('click', handleUploadFrame);
    document.getElementById('batch-import-frames-btn').addEventListener('click', handleBatchUploadFrames);


    document.querySelector('#avatar-frame-modal .modal-body').addEventListener('click', (e) => {

      if (e.target.classList.contains('delete-btn')) {
        const frameId = parseInt(e.target.dataset.id);
        if (!isNaN(frameId)) {
          handleDeleteCustomFrame(frameId);
        }
      }
    });





    setupHomeScreenPagination();


    window.openPresetScreen = openPresetScreen;


    document.getElementById('add-preset-btn').addEventListener('click', async () => {
      const name = await showCustomPrompt('创建新预设', '请输入预设名称');
      if (name && name.trim()) {
        const newPreset = {
          id: 'preset_' + Date.now(),
          name: name.trim(),
          content: []
        };
        await db.presets.add(newPreset);
        await renderPresetScreen();
        openPresetEditor(newPreset.id);
      }
    });

    document.getElementById('manage-preset-categories-btn').addEventListener('click', openPresetCategoryManager);

    document.getElementById('add-preset-entry-btn').addEventListener('click', () => {
      const container = document.getElementById('preset-entries-container');
      if (container.querySelector('p')) {
        container.innerHTML = '';
      }
      const newBlock = createPresetEntryBlock();
      container.appendChild(newBlock);
      newBlock.querySelector('.entry-content-textarea').focus();
    });


    document.getElementById('save-preset-btn').addEventListener('click', async () => {
      if (!editingPresetId) return;
      const preset = await db.presets.get(editingPresetId);
      if (!preset) return;


      const newName = document.getElementById('preset-name-input').value.trim();
      if (!newName) {
        alert('预设名称不能为空！');
        return;
      }
      preset.name = newName;
      preset.categoryId = parseInt(document.getElementById('preset-category-select').value) || null;

      const entriesContainer = document.getElementById('preset-entries-container');
      const entryBlocks = entriesContainer.querySelectorAll('.message-editor-block');
      const newEntries = [];
      entryBlocks.forEach(block => {
        const content = block.querySelector('.entry-content-textarea').value.trim();
        if (content) {
          newEntries.push({
            comment: block.querySelector('.entry-comment-input').value.trim(),
            keys: (block.querySelector('.entry-keys-input').value.trim() || '').split(',').map(k => k.trim()).filter(Boolean),
            content: content,
            enabled: block.querySelector('.entry-enabled-switch').checked
          });
        }
      });
      preset.content = newEntries;


      await db.presets.put(preset);
      editingPresetId = null;


      showScreen('preset-screen');



      await renderPresetScreen();
    });




    document.getElementById('import-preset-btn').addEventListener('click', async () => {



      try {

        await requirePinActivation();


        document.getElementById('import-preset-input').click();

      } catch (error) {

        console.warn("预设导入被取消:", error.message);
      }

    });

    document.getElementById('import-preset-input').addEventListener('change', handlePresetImport);

    document.getElementById('reset-button-order-btn').addEventListener('click', resetButtonOrder);

    document.getElementById('clear-specific-data-btn').addEventListener('click', openDataClearWizard);


    document.getElementById('cancel-clear-wizard-btn-step1').addEventListener('click', () => {
      document.getElementById('data-clear-wizard-modal').classList.remove('visible');
    });
    document.getElementById('go-to-clear-step2-btn').addEventListener('click', handleDataClearNext);


    document.getElementById('back-to-clear-step1-btn').addEventListener('click', handleDataClearBack);
    document.getElementById('cancel-clear-wizard-btn-step2').addEventListener('click', () => {
      document.getElementById('data-clear-wizard-modal').classList.remove('visible');
    });
    document.getElementById('confirm-final-clear-btn').addEventListener('click', handleConfirmDataClear);


    document.getElementById('data-clear-wizard-modal').addEventListener('click', (e) => {
      const item = e.target.closest('.clear-posts-item');
      if (item) {

        e.stopPropagation();
        item.classList.toggle('selected');
      }
    });
    document.getElementById('data-clear-wizard-modal').addEventListener('change', (e) => {

      if (e.target.id === 'select-all-chars-for-clear') {
        const isChecked = e.target.checked;
        document.querySelectorAll('#data-clear-char-list .clear-posts-item').forEach(item => {
          item.classList.toggle('selected', isChecked);
        });
      } else if (e.target.id === 'select-all-types-for-clear') {
        const isChecked = e.target.checked;
        document.querySelectorAll('#data-clear-type-list .clear-posts-item').forEach(item => {
          item.classList.toggle('selected', isChecked);
        });
      }
    });

    document.getElementById('compress-images-btn').addEventListener('click', compressAllLocalImages);

    // 清空聊天中的表情包消息相关事件监听
    document.getElementById('clear-stickers-btn').addEventListener('click', openClearStickersModal);
    document.getElementById('cancel-clear-stickers-btn').addEventListener('click', () => {
      document.getElementById('clear-stickers-modal').classList.remove('visible');
    });
    document.getElementById('confirm-clear-stickers-btn').addEventListener('click', handleConfirmClearStickers);

    document.getElementById('clear-stickers-modal').addEventListener('click', (e) => {
      const item = e.target.closest('.clear-posts-item');
      if (item && item.dataset.chatId) {
        e.stopPropagation();
        item.classList.toggle('selected');
        
        const chatId = item.dataset.chatId;
        if (item.classList.contains('selected')) {
          if (!selectedCharsForStickerClear.includes(chatId)) {
            selectedCharsForStickerClear.push(chatId);
          }
        } else {
          selectedCharsForStickerClear = selectedCharsForStickerClear.filter(id => id !== chatId);
        }
        
        // 更新全选复选框状态
        const totalItems = document.querySelectorAll('#clear-stickers-category-list .clear-posts-item').length;
        const selectAllCheckbox = document.getElementById('select-all-categories-checkbox');
        if (selectAllCheckbox) {
          selectAllCheckbox.checked = selectedCharsForStickerClear.length === totalItems;
        }
      }
    });

    document.getElementById('select-all-categories-checkbox').addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const items = document.querySelectorAll('#clear-stickers-category-list .clear-posts-item');
      
      selectedCharsForStickerClear = [];
      items.forEach(item => {
        item.classList.toggle('selected', isChecked);
        if (isChecked && item.dataset.chatId) {
          selectedCharsForStickerClear.push(item.dataset.chatId);
        }
      });
    });

    document.getElementById('clear-chat-images-btn').addEventListener('click', openClearChatImagesModal);
    document.getElementById('cancel-clear-images-btn').addEventListener('click', () => {
      document.getElementById('clear-chat-images-modal').classList.remove('visible');
    });
    document.getElementById('confirm-clear-images-btn').addEventListener('click', handleConfirmClearChatImages);

    // 清空聊天HTML
    document.getElementById('clear-chat-html-btn').addEventListener('click', openClearChatHtmlModal);
    document.getElementById('cancel-clear-html-btn').addEventListener('click', () => {
      document.getElementById('clear-chat-html-modal').classList.remove('visible');
    });
    document.getElementById('confirm-clear-html-btn').addEventListener('click', handleConfirmClearChatHtml);
    document.getElementById('select-all-chats-for-html-clear').addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const items = document.querySelectorAll('#clear-chat-html-list .clear-posts-item');
      items.forEach(item => {
        item.classList.toggle('selected', isChecked);
      });
    });

    // 清空所有API历史记录
    document.getElementById('clear-api-history-btn').addEventListener('click', async () => {
      const confirmed = await showCustomConfirm(
        '清空所有API历史记录',
        '此操作将清空所有角色的API调用历史记录。<br><br>这不会影响聊天记录，只是清理调试数据。<br><br><strong>此操作不可撤销，确定继续吗？</strong>',
        {
          confirmButtonClass: 'btn-danger',
          confirmText: '确认清空'
        }
      );
      
      if (!confirmed) return;
      
      try {
        let clearedCount = 0;
        let totalSize = 0;
        
        // 遍历所有聊天，清空apiHistory
        const allChats = await db.chats.toArray();
        for (const chat of allChats) {
          if (chat.apiHistory && chat.apiHistory.length > 0) {
            // 计算清理的数据大小（估算）
            const historySize = JSON.stringify(chat.apiHistory).length;
            totalSize += historySize;
            
            // 删除apiHistory字段
            delete chat.apiHistory;
            
            // 更新数据库
            await db.chats.put(chat);
            clearedCount++;
            
            // 更新内存中的数据
            if (state.chats[chat.id]) {
              delete state.chats[chat.id].apiHistory;
            }
          }
        }
        
        const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
        await showCustomAlert(
          '清空成功',
          `已清空 ${clearedCount} 个角色的API历史记录。<br>预计释放约 ${sizeMB} MB 空间。`
        );
        
      } catch (error) {
        console.error('清空API历史记录失败:', error);
        await showCustomAlert('清空失败', `发生错误: ${error.message}`);
      }
    });

    document.getElementById('clear-chat-images-modal').addEventListener('click', (e) => {
      const item = e.target.closest('.clear-posts-item');
      if (item) {
        e.stopPropagation();
        item.classList.toggle('selected');
      }
    });

    document.getElementById('select-all-chars-for-image-clear').addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      document.querySelectorAll('#clear-chat-images-list .clear-posts-item').forEach(item => {
        item.classList.toggle('selected', isChecked);
      });
    });

    document.getElementById('copy-message-btn').addEventListener('click', copyMessageContent);


    document.getElementById('copy-timestamp-btn').addEventListener('click', copyMessageTimestamp);

    document.getElementById('npc-list-back-btn').addEventListener('click', () => {

      switchToChatListView('messages-view');
    });


    document.getElementById('add-npc-btn').addEventListener('click', () => openNpcEditor(null));


    document.getElementById('save-npc-btn').addEventListener('click', saveNpc);
    document.getElementById('npc-editor-modal').addEventListener('click', (e) => {
      if (e.target.id === 'manage-npc-groups-btn') {
        openNpcGroupManager();
      }
    });
    document.getElementById('close-npc-group-manager-btn').addEventListener('click', () => {
      document.getElementById('npc-group-manager-modal').classList.remove('visible');
      // 重新填充NPC编辑器里的下拉菜单
      if (document.getElementById('npc-editor-modal').classList.contains('visible')) {
        openNpcEditor(editingNpcId);
      }
    });
    document.getElementById('add-new-npc-group-btn').addEventListener('click', addNewNpcGroup);
    document.getElementById('existing-npc-groups-list').addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-group-btn')) {
        deleteNpcGroup(parseInt(e.target.dataset.id));
      }
    });
    document.getElementById('cancel-npc-editor-btn').addEventListener('click', () => {
      document.getElementById('npc-editor-modal').classList.remove('visible');
    });


    document.getElementById('npc-avatar-input').addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          document.getElementById('npc-avatar-preview').src = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
    document.getElementById('chat-lock-overlay').addEventListener('click', (e) => {

      if (e.target.id === 'spectator-reroll-btn') {
        handleSpectatorReroll();
      } else if (e.target.id === 'spectator-edit-btn') {

        openAiResponseEditor();
      }

    });
    addLongPressListener(document.getElementById('music-visual-container'), () => {
      if (musicState.currentIndex > -1) {
        handleChangeAlbumArt(musicState.currentIndex);
      }
    });
    document.getElementById('douban-settings-btn').addEventListener('click', openDoubanSettingsModal);
    document.getElementById('save-douban-settings-btn').addEventListener('click', saveDoubanSettings);
    document.getElementById('cancel-douban-settings-btn').addEventListener('click', () => {
      document.getElementById('douban-settings-modal').classList.remove('visible');
    });

    // 管理NPC头像
    document.getElementById('manage-npc-avatars-btn').addEventListener('click', () => {
      document.getElementById('douban-settings-modal').classList.remove('visible');
      openNpcAvatarsModal();
    });
    document.getElementById('add-npc-avatar-url-btn').addEventListener('click', addNpcAvatarFromURL);
    document.getElementById('add-npc-avatar-local-btn').addEventListener('click', addNpcAvatarFromLocal);
    document.getElementById('npc-avatar-local-input').addEventListener('change', handleNpcAvatarLocalUpload);
    document.getElementById('delete-selected-npc-avatars-btn').addEventListener('click', deleteSelectedNpcAvatars);
    document.getElementById('select-all-npc-avatars').addEventListener('change', toggleSelectAllNpcAvatars);
    document.getElementById('close-npc-avatars-btn').addEventListener('click', () => {
      document.getElementById('npc-avatars-modal').classList.remove('visible');
      selectedNpcAvatars.clear();
    });

    // 管理自定义小组
    document.getElementById('manage-custom-groups-btn').addEventListener('click', () => {
      document.getElementById('douban-settings-modal').classList.remove('visible');
      openCustomGroupsModal();
    });
    document.getElementById('add-custom-group-btn').addEventListener('click', () => {
      openEditGroupModal(null);
    });
    document.getElementById('close-custom-groups-btn').addEventListener('click', () => {
      document.getElementById('custom-groups-modal').classList.remove('visible');
    });
    document.getElementById('save-edit-group-btn').addEventListener('click', saveEditGroup);
    document.getElementById('cancel-edit-group-btn').addEventListener('click', () => {
      document.getElementById('edit-custom-group-modal').classList.remove('visible');
    });

    // 管理豆瓣帖子
    document.getElementById('manage-douban-posts-btn').addEventListener('click', () => {
      openDeleteDoubanPostsModal();
    });

    // 删除豆瓣帖子模态框事件
    document.getElementById('cancel-delete-douban-posts-btn').addEventListener('click', () => {
      document.getElementById('delete-douban-posts-modal').classList.remove('visible');
    });
    document.getElementById('confirm-delete-douban-posts-btn').addEventListener('click', handleConfirmDeleteDoubanPosts);

    // 豆瓣帖子列表项点击事件（单选）
    document.getElementById('delete-douban-posts-list').addEventListener('click', (e) => {
      const item = e.target.closest('.clear-posts-item');
      if (item) {
        item.classList.toggle('selected');
      }
    });

    // 全选豆瓣帖子
    document.getElementById('select-all-douban-posts').addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      document.querySelectorAll('#delete-douban-posts-list .clear-posts-item').forEach(item => {
        if (isChecked) {
          item.classList.add('selected');
        } else {
          item.classList.remove('selected');
        }
      });
    });

    document.getElementById('time-zone-search-input').addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const selectEl = document.getElementById('time-zone-select');


      for (const option of selectEl.options) {
        const optionText = option.textContent.toLowerCase();


        if (optionText.includes(searchTerm)) {
          option.style.display = '';
        } else {

          option.style.display = 'none';
        }
      }
    });





    window.openWerewolfLobby = openWerewolfLobby;


    document.getElementById('werewolf-game-btn').addEventListener('click', () => openWerewolfLobby('group'));


    document.getElementById('cancel-werewolf-lobby-btn').addEventListener('click', () => {
      document.getElementById('werewolf-lobby-modal').classList.remove('visible');
    });
    document.getElementById('start-werewolf-game-btn').addEventListener('click', initializeWerewolfGame);


    document.getElementById('werewolf-role-confirm-btn').addEventListener('click', () => {
      document.getElementById('werewolf-role-modal').classList.remove('visible');
      executeNightPhase();
    });

    document.getElementById('exit-werewolf-game-btn').addEventListener('click', async () => {
      const confirmed = await showCustomConfirm('退出游戏', '确定要退出当前这局狼人杀吗？游戏进度将不会被保存。', {
        confirmButtonClass: 'btn-danger'
      });
      if (confirmed) {
        werewolfGameState.isActive = false;

        showScreen(werewolfGameState.chatId ? 'chat-interface-screen' : 'home-screen');
      }
    });

    document.getElementById('werewolf-game-over-close-btn').addEventListener('click', () => {
      document.getElementById('werewolf-game-over-modal').classList.remove('visible');
      showScreen(werewolfGameState.chatId ? 'chat-list-screen' : 'home-screen');
    });



    document.getElementById('cancel-wolf-kill-btn').addEventListener('click', () => {
      document.getElementById('werewolf-kill-modal').classList.remove('visible');
    });



    document.getElementById('cancel-werewolf-lobby-btn').addEventListener('click', () => {
      document.getElementById('werewolf-lobby-modal').classList.remove('visible');
    });

    document.getElementById('werewolf-retry-btn').addEventListener('click', handleWerewolfRetry);
    document.getElementById('manual-werewolf-summary-btn').addEventListener('click', handleManualWerewolfSummary);
    document.getElementById('check-and-fix-data-btn').addEventListener('click', checkAndFixData);
    const emergencyResetBtn = document.getElementById('emergency-reset-appearance-btn');
    if (emergencyResetBtn) {
      emergencyResetBtn.addEventListener('click', handleEmergencyAppearanceReset);
    }
    const factoryResetBtn = document.getElementById('factory-reset-btn');
    if (factoryResetBtn) {
      factoryResetBtn.addEventListener('click', handleFactoryReset);
    }
    document.getElementById('dynamic-island-music-toggle-switch').addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      state.globalSettings.alwaysShowMusicIsland = isEnabled; // 更新内存中的状态


      const isFrameMode = document.body.classList.contains('frame-mode-active');


      if (musicState.isActive && !isFrameMode) {
        const lyricBar = document.getElementById('global-lyrics-bar');
        const phoneScreenForIsland = document.getElementById('phone-screen');

        if (isEnabled) {

          lyricBar.classList.remove('visible');
          phoneScreenForIsland.classList.add('dynamic-island-active');
        } else {

          phoneScreenForIsland.classList.remove('dynamic-island-active');
          if (musicState.parsedLyrics && musicState.parsedLyrics.length > 0) {
            lyricBar.classList.add('visible');
          }
        }
      }
    });
    document.getElementById('delete-world-books-btn').addEventListener('click', openWorldBookDeletionModal);


    document.getElementById('cancel-delete-world-books-btn').addEventListener('click', () => {
      document.getElementById('delete-world-books-modal').classList.remove('visible');
    });
    document.getElementById('confirm-delete-world-books-btn').addEventListener('click', handleConfirmWorldBookDeletion);

    document.getElementById('delete-world-books-modal').addEventListener('click', (e) => {

      const item = e.target.closest('.clear-posts-item');
      if (item) {
        item.classList.toggle('selected');
      }

      if (e.target.id === 'select-all-world-books-for-clear') {
        const isChecked = e.target.checked;
        document.querySelectorAll('#delete-world-books-list .clear-posts-item').forEach(el => {
          el.classList.toggle('selected', isChecked);
        });
      }
    });


    document.getElementById('sticker-search-input').addEventListener('input', () => {

      renderStickerPanel(false);
    });


    document.getElementById('sticker-category-tabs').addEventListener('click', (e) => {
      if (e.target.classList.contains('sticker-category-tab')) {
        const categoryId = e.target.dataset.categoryId;
        const finalId = (categoryId !== 'all' && categoryId !== 'uncategorized') ? parseInt(categoryId) : categoryId;


        document.getElementById('sticker-search-input').value = '';


        switchStickerCategory(finalId);
      }
    });




    const chatMessagesContainer = document.getElementById('chat-messages');
    chatMessagesContainer.addEventListener('scroll', () => {

      if (chatMessagesContainer.scrollTop < 1 && !isLoadingMoreMessages) {
        const totalMessages = state.chats[state.activeChatId]?.history.length || 0;

        if (totalMessages > currentRenderedCount) {
          loadMoreMessages();
        }
      }
    });


    const thoughtsHistoryList = document.getElementById('thoughts-history-list');
    thoughtsHistoryList.addEventListener('scroll', () => {
      const {
        scrollTop,
        scrollHeight,
        clientHeight
      } = thoughtsHistoryList;

      if (scrollHeight - scrollTop <= clientHeight + 50 && !isLoadingMoreThoughts) {
        const totalItems = state.chats[state.activeChatId]?.thoughtsHistory.length || 0;
        if (totalItems > thoughtsHistoryRenderCount) {
          loadMoreThoughts();
        }
      }
    });


    const qzoneContent = document.querySelector('#qzone-screen .qzone-content');
    qzoneContent.addEventListener('scroll', () => {
      const {
        scrollTop,
        scrollHeight,
        clientHeight
      } = qzoneContent;

      if (scrollHeight - scrollTop <= clientHeight + 100 && !isLoadingMorePosts) {
        if (qzonePostsCache.length > qzonePostsRenderCount) {
          loadMoreQzonePosts();
        }
      }
    });


    const localGridEl = document.getElementById('nai-gallery-grid-local');
    const cloudGridEl = document.getElementById('nai-gallery-grid-cloud');

    const naiGridScrollHandler = (e) => {

      const targetGrid = e.currentTarget;
      const tabId = targetGrid.id.includes('local') ? 'local' : 'cloud';


      if (tabId !== activeNaiGalleryTab) {
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = targetGrid;


      if (scrollHeight - scrollTop <= clientHeight + 100 && !isLoadingMoreNaiImages[tabId]) {
        if (naiGalleryCache[tabId].length > naiGalleryRenderCount[tabId]) {
          loadMoreNaiGalleryImages();
        }
      }
    };

    // 分别为两个新网格绑定事件
    if (localGridEl) {
      localGridEl.addEventListener('scroll', naiGridScrollHandler);
    }
    if (cloudGridEl) {
      cloudGridEl.addEventListener('scroll', naiGridScrollHandler);
    }


    document.getElementById('read-together-btn').addEventListener('click', openReadingRoom);
    const restoreBtn = document.getElementById('reading-restore-btn');

    makeDraggable(restoreBtn, restoreBtn);
    document.getElementById('close-reading-btn').addEventListener('click', closeReadingRoom);
    document.getElementById('open-reading-library-btn').addEventListener('click', openBookLibrary);
    document.getElementById('next-page-btn').addEventListener('click', showNextPage);
    document.getElementById('prev-page-btn').addEventListener('click', showPrevPage);
    document.getElementById('book-upload-input').addEventListener('change', handleBookFileUpload);


    document.getElementById('minimize-reading-btn').addEventListener('click', minimizeReadingRoom);
    document.getElementById('reading-restore-btn').addEventListener('click', restoreReadingRoom);


    makeDraggable(document.getElementById('reading-window'), document.querySelector('#reading-window .reading-header'));


    document.getElementById('open-reading-library-btn').addEventListener('click', openBookLibrary);

    document.getElementById('close-reading-library-btn-header').addEventListener('click', () => {
      document.getElementById('reading-library-modal').classList.remove('visible');
    });
    document.getElementById('import-new-book-btn-header').addEventListener('click', importBook);



    document.getElementById('reading-library-list').addEventListener('click', (e) => {
      const target = e.target;
      if (target.classList.contains('group-name')) {
        const bookId = parseInt(target.dataset.bookId);
        loadBookFromLibrary(bookId);
      } else if (target.classList.contains('delete-group-btn')) {
        const bookId = parseInt(target.dataset.bookId);
        deleteBookFromLibrary(bookId);
      }
    });

    document.getElementById('page-indicator').addEventListener('click', handlePageJump);
    document.getElementById('reading-library-search-input').addEventListener('input', (e) => {

      renderBookLibrary(e.target.value);
    });
    const debouncedUpdateReadingContext = debounce(updateReadingContextOnScroll, 300);


    document.getElementById('reading-content').addEventListener('scroll', debouncedUpdateReadingContext);
    document.getElementById('api-temperature-slider').addEventListener('input', (e) => {
      document.getElementById('api-temperature-value').textContent = e.target.value;
    });
    const chatListContainer = document.getElementById('messages-view');
    chatListContainer.addEventListener('scroll', () => {
      const {
        scrollTop,
        scrollHeight,
        clientHeight
      } = chatListContainer;

      if (scrollHeight - scrollTop <= clientHeight + 150 && !isLoadingMoreChats) {
        loadMoreChats();
      }
    });



    document.getElementById('manage-product-categories-btn').addEventListener('click', openProductCategoryManager);
    document.getElementById('close-product-category-manager-btn').addEventListener('click', () => {
      document.getElementById('product-category-manager-modal').classList.remove('visible');


      openProductEditor(editingProductId);
    });
    document.getElementById('add-new-product-category-btn').addEventListener('click', addNewProductCategory);
    document.getElementById('existing-product-categories-list').addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-group-btn')) {
        deleteProductCategory(parseInt(e.target.dataset.id));
      }
    });


    document.getElementById('add-product-variation-btn').addEventListener('click', () => addProductVariationInput());


    document.getElementById('cancel-variation-selection-btn').addEventListener('click', () => {
      document.getElementById('variation-selection-modal').classList.remove('visible');
    });
    document.getElementById('variation-decrease-qty').addEventListener('click', () => {
      const display = document.getElementById('variation-quantity-display');
      let qty = parseInt(display.textContent);
      if (qty > 1) display.textContent = qty - 1;
    });
    document.getElementById('variation-increase-qty').addEventListener('click', () => {
      const display = document.getElementById('variation-quantity-display');
      display.textContent = parseInt(display.textContent) + 1;
    });
    document.getElementById('product-category-tabs').addEventListener('click', (e) => {

      if (e.target.classList.contains('product-category-tab')) {

        const categoryId = e.target.dataset.categoryId === 'all' ? 'all' : parseInt(e.target.dataset.categoryId);


        switchShoppingCategory(categoryId);
      }
    });
    document.getElementById('generate-shopping-items-btn').addEventListener('click', handleGenerateShoppingItems);
    document.getElementById('shopping-settings-btn').addEventListener('click', openShoppingSettingsModal);
    document.getElementById('save-shopping-settings-btn').addEventListener('click', saveShoppingSettings);
    document.getElementById('cancel-shopping-settings-btn').addEventListener('click', () => {
      document.getElementById('shopping-settings-modal').classList.remove('visible');
    });
    document.getElementById('select-all-products-checkbox').addEventListener('change', (e) => {
      const isChecked = e.target.checked;

      const visibleItems = document.querySelectorAll('#product-grid .product-item');

      visibleItems.forEach(item => {
        const productId = parseInt(item.dataset.id);
        item.classList.toggle('selected', isChecked);
        if (isChecked) {
          selectedProducts.add(productId);
        } else {
          selectedProducts.delete(productId);
        }
      });
      document.getElementById('delete-selected-products-btn').textContent = `删除 (${selectedProducts.size})`;
    });


    document.getElementById('delete-selected-products-btn').addEventListener('click', async () => {
      if (selectedProducts.size === 0) {
        alert("请先选择要删除的商品。");
        return;
      }

      const confirmed = await showCustomConfirm(
        '确认删除',
        `确定要永久删除选中的 ${selectedProducts.size} 个商品吗？此操作不可恢复。`, {
        confirmButtonClass: 'btn-danger'
      }
      );

      if (confirmed) {
        await db.shoppingProducts.bulkDelete([...selectedProducts]);


        document.getElementById('manage-products-btn').click();

        await renderShoppingProducts();

        await showCustomAlert("成功", "选中的商品已成功删除。");
      }
    });

    // 外观预设相关事件（添加安全检查）
    const appearancePresetSelect = document.getElementById('appearance-preset-select');
    if (appearancePresetSelect) {
      appearancePresetSelect.addEventListener('change', handleAppearancePresetSelectionChange);
    }
    const saveAppearancePresetBtn = document.getElementById('save-appearance-preset-btn');
    if (saveAppearancePresetBtn) {
      saveAppearancePresetBtn.addEventListener('click', saveAppearancePreset);
    }
    const deleteAppearancePresetBtn = document.getElementById('delete-appearance-preset-btn');
    if (deleteAppearancePresetBtn) {
      deleteAppearancePresetBtn.addEventListener('click', deleteAppearancePreset);
    }



    document.getElementById('novelai-switch').addEventListener('change', (e) => {
      const detailsDiv = document.getElementById('novelai-details');
      detailsDiv.style.display = e.target.checked ? 'block' : 'none';
    });

    // Google Imagen 开关与事件
    document.getElementById('google-imagen-switch').addEventListener('change', (e) => {
      const detailsDiv = document.getElementById('google-imagen-details');
      detailsDiv.style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('google-imagen-key-toggle').addEventListener('click', function () {
      const input = document.getElementById('google-imagen-api-key');
      if (input.type === 'password') {
        input.type = 'text';
        this.textContent = '😌';
      } else {
        input.type = 'password';
        this.textContent = '🧐';
      }
    });

    document.getElementById('google-imagen-test-btn').addEventListener('click', testGoogleImagenGeneration);

    document.getElementById('google-imagen-fetch-models-btn').addEventListener('click', fetchGoogleImagenModels);

    document.getElementById('novelai-key-toggle').addEventListener('click', function () {
      const input = document.getElementById('novelai-api-key');
      if (input.type === 'password') {
        input.type = 'text';
        this.textContent = '😌';
      } else {
        input.type = 'password';
        this.textContent = '🧐';
      }
    });


    document.getElementById('novelai-settings-btn').addEventListener('click', () => {
      loadNovelAISettings();
      document.getElementById('novelai-settings-modal').style.display = 'flex';
    });


    document.getElementById('nai-cors-proxy').addEventListener('change', (e) => {
      const customProxyGroup = document.getElementById('nai-custom-proxy-group');
      if (e.target.value === 'custom') {
        customProxyGroup.style.display = 'block';
      } else {
        customProxyGroup.style.display = 'none';
      }
    });

    document.getElementById('close-novelai-settings').addEventListener('click', () => {
      document.getElementById('novelai-settings-modal').style.display = 'none';
    });


    document.getElementById('save-nai-settings-btn').addEventListener('click', () => {
      saveNovelAISettings();
      document.getElementById('novelai-settings-modal').style.display = 'none';
      alert('NovelAI设置已保存！');
    });

    document.getElementById('reset-nai-settings-btn').addEventListener('click', () => {
      if (confirm('确定要恢复默认设置吗？')) {
        resetNovelAISettings();
      }
    });


    document.getElementById('novelai-test-btn').addEventListener('click', () => {
      const apiKey = document.getElementById('novelai-api-key').value.trim();
      if (!apiKey) {
        alert('请先填写NovelAI API Key！');
        return;
      }
      document.getElementById('novelai-test-modal').style.display = 'flex';
      document.getElementById('nai-test-result').style.display = 'none';
      document.getElementById('nai-test-error').style.display = 'none';
    });


    document.getElementById('close-novelai-test').addEventListener('click', () => {
      document.getElementById('novelai-test-modal').style.display = 'none';
    });

    document.getElementById('close-nai-test-btn').addEventListener('click', () => {
      document.getElementById('novelai-test-modal').style.display = 'none';
    });


    document.getElementById('nai-generate-btn').addEventListener('click', async () => {
      await generateNovelAIImage();
    });



    document.getElementById('nai-download-btn').addEventListener('click', () => {
      const img = document.getElementById('nai-result-image');
      const link = document.createElement('a');
      link.href = img.src;
      link.download = 'novelai-generated-' + Date.now() + '.png';
      link.click();
    });


    document.getElementById('character-nai-prompts-btn').addEventListener('click', () => {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];

      // 加载当前角色的NAI提示词配置
      const naiSettings = chat.settings.naiSettings || {
        promptSource: 'system',
        characterPositivePrompt: '',
        characterNegativePrompt: ''
      };


      document.getElementById('character-nai-positive').value = naiSettings.characterPositivePrompt || '';
      document.getElementById('character-nai-negative').value = naiSettings.characterNegativePrompt || '';

      document.getElementById('character-nai-prompts-modal').style.display = 'flex';
    });


    document.getElementById('close-character-nai-prompts').addEventListener('click', () => {
      document.getElementById('character-nai-prompts-modal').style.display = 'none';
    });

    document.getElementById('save-character-nai-prompts-btn').addEventListener('click', async () => {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];

      if (!chat.settings.naiSettings) {
        chat.settings.naiSettings = {
          promptSource: 'system'
        };
      }

      chat.settings.naiSettings.characterPositivePrompt = document.getElementById('character-nai-positive').value.trim();
      chat.settings.naiSettings.characterNegativePrompt = document.getElementById('character-nai-negative').value.trim();

      // 根据是否填写了画师串自动设置 promptSource
      if (chat.settings.naiSettings.characterPositivePrompt || chat.settings.naiSettings.characterNegativePrompt) {
        chat.settings.naiSettings.promptSource = 'character';
      } else {
        chat.settings.naiSettings.promptSource = 'system';
      }

      console.log('💾 [专属弹窗] 保存角色NAI提示词');
      console.log('   characterPositivePrompt:', chat.settings.naiSettings.characterPositivePrompt);
      console.log('   characterNegativePrompt:', chat.settings.naiSettings.characterNegativePrompt);
      console.log('   promptSource:', chat.settings.naiSettings.promptSource);


      await db.chats.put(chat);

      document.getElementById('character-nai-prompts-modal').style.display = 'none';
      alert('角色专属NAI提示词已保存！');
    });

    document.getElementById('reset-character-nai-prompts-btn').addEventListener('click', () => {
      if (confirm('确定要清空当前角色的NAI提示词配置吗？')) {
        document.getElementById('character-nai-positive').value = '';
        document.getElementById('character-nai-negative').value = '';
      }
    });


    document.getElementById('group-character-nai-prompts-btn').addEventListener('click', () => {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];

      // 加载当前角色的NAI提示词配置
      const naiSettings = chat.settings.naiSettings || {
        promptSource: 'system',
        characterPositivePrompt: '',
        characterNegativePrompt: ''
      };


      document.getElementById('character-nai-positive').value = naiSettings.characterPositivePrompt || '';
      document.getElementById('character-nai-negative').value = naiSettings.characterNegativePrompt || '';

      document.getElementById('character-nai-prompts-modal').style.display = 'flex';
    });


    document.getElementById('manage-frames-btn').addEventListener('click', toggleFrameManagementMode);
    document.getElementById('select-all-frames-checkbox').addEventListener('change', handleSelectAllFrames);
    document.getElementById('delete-selected-frames-btn').addEventListener('click', executeBatchDeleteFrames);
    document.getElementById('delete-current-category-btn').addEventListener('click', handleDeleteCurrentCategory);
    document.getElementById('char-wallet-back-btn').addEventListener('click', () => {

      switchToCharScreen('char-taobao-screen');
    });
    document.getElementById('sticker-binding-chat-list').addEventListener('click', (e) => {
      const item = e.target.closest('.contact-picker-item');
      if (item) {
        const checkbox = item.querySelector('.sticker-binding-checkbox');
        if (checkbox && e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }
      }
    });
    const stickerTabsContainer = document.getElementById('sticker-category-tabs');
    addLongPressListener(stickerTabsContainer, (e) => {
      const tab = e.target.closest('.sticker-category-tab');
      if (tab) {
        e.preventDefault();
        const categoryIdStr = tab.dataset.categoryId;
        if (categoryIdStr === 'all') {
          showCustomAlert("提示", "“全部”分类无法被绑定。");
          return;
        }
        const categoryId = categoryIdStr === 'uncategorized' ? 'uncategorized' : parseInt(categoryIdStr);
        openStickerCategoryBindingModal(categoryId);
      }
    });

    document.getElementById('open-nai-gallery-btn').addEventListener('click', openNaiGallery);
    document.getElementById('nai-gallery-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.nai-gallery-tab');
      if (tab && !tab.classList.contains('active')) {
        switchNaiGalleryTab(tab.dataset.tabId);
      }
    });
    document.getElementById('close-nai-gallery-btn').addEventListener('click', () => {
      document.getElementById('nai-gallery-panel').classList.remove('visible');
    });

    document.getElementById('manage-nai-gallery-btn').addEventListener('click', toggleNaiGalleryManagementMode);

    document.getElementById('nai-gallery-grid-local').addEventListener('click', (e) => {
      handleNaiGalleryGridClick(e);
    });
    document.getElementById('nai-gallery-grid-cloud').addEventListener('click', (e) => {
      handleNaiGalleryGridClick(e);
    });

    document.getElementById('select-all-nai-gallery-checkbox').addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const activeGridId = `nai-gallery-grid-${activeNaiGalleryTab}`;


      document.querySelectorAll(`#${activeGridId} .nai-gallery-item`).forEach(item => {
        item.classList.toggle('selected', isChecked);
        const key = item.dataset.key;
        if (isChecked) {
          selectedNaiImages.add(key);
        } else {
          selectedNaiImages.delete(key);
        }
      });
      updateNaiGalleryActionButtons();
    });
    document.getElementById('download-selected-nai-gallery-btn').addEventListener('click', () => executeBatchDownloadNaiImages());
    document.getElementById('upload-selected-nai-gallery-btn').addEventListener('click', () => executeBatchUploadNaiImagesToImgBB());
    document.getElementById('export-selected-nai-gallery-btn').addEventListener('click', () => executeBatchExportNaiImages());
    document.getElementById('delete-selected-nai-gallery-btn').addEventListener('click', () => executeBatchDeleteNaiImages());
    document.getElementById('delete-selected-nai-gallery-btn').addEventListener('click', () => executeBatchDeleteNaiImages());
    document.getElementById('chat-expand-btn').addEventListener('click', () => {
      document.body.classList.toggle('chat-actions-expanded');
    });
    document.getElementById('profile-edit-btn').addEventListener('click', openThoughtEditor);
    document.getElementById('open-quick-reply-btn').addEventListener('click', openQuickReplyModal);
    
    // ========== 旁白功能 ==========
    document.getElementById('narration-btn').addEventListener('click', async () => {
      if (!state.activeChatId) {
        alert('请先选择一个聊天对象！');
        return;
      }
      
      const narrationText = await showCustomPrompt(
        '输入旁白',
        '输入旁白内容，这将作为系统消息添加到对话中，角色会将其视为已发生的事实：',
        '',
        'textarea'
      );
      
      if (narrationText && narrationText.trim()) {
        const chat = state.chats[state.activeChatId];
        const narrationMessage = {
          role: 'system',
          type: 'pat_message',
          content: narrationText.trim(),
          timestamp: Date.now()
        };
        
        chat.history.push(narrationMessage);
        await db.chats.put(chat);
        
        if (state.activeChatId === chat.id) {
          await appendMessage(narrationMessage, chat);
        }
        
        await renderChatList();
      }
    });

    document.getElementById('cancel-quick-reply-btn').addEventListener('click', () => {
      document.getElementById('quick-reply-modal').classList.remove('visible');
    });

    // ========== 真心话游戏 ==========
    let truthGameState = {
      isActive: false,
      currentRound: 0,
      userChoice: null,
      aiChoice: null,
      winner: null,
      messages: [],
      abortController: null, // 用于中断API请求
      isGroupMode: false,      // 是否群聊版
      currentAiMember: null,  // 群聊时当前轮对战的成员 { id, originalName, groupNickname, ... }
      phase: null             // 'rps' | 'qna' | 'spectator_comment'（回答完毕后的围观评论阶段）
    };

    // 辅助函数：更新真心话悬浮球红点状态
    function updateTruthGameFloatIndicator() {
      const modal = document.getElementById('truth-game-modal');
      const indicator = document.getElementById('truth-game-float-indicator');

      // 如果对话框被最小化，显示红点
      if (modal.classList.contains('minimized')) {
        indicator.classList.add('active');
      }
    }

    // 真心话：获取当前轮用于提问/回答的“有效聊天”（单聊=当前聊天，群聊=当前选中成员的单聊）
    function getTruthGameEffectiveChat() {
      if (!state.activeChatId) return null;
      const chat = state.chats[state.activeChatId];
      if (!truthGameState.isGroupMode || !truthGameState.currentAiMember) return chat;
      const memberChat = state.chats[truthGameState.currentAiMember.id];
      return memberChat || chat;
    }

    // 真心话群聊：获取当前轮对手的显示名
    function getTruthGameCurrentDisplayName() {
      const chat = state.chats[state.activeChatId];
      if (!chat || !truthGameState.isGroupMode || !truthGameState.currentAiMember)
        return chat ? chat.name : '';
      return getDisplayNameInGroup(chat, truthGameState.currentAiMember.originalName) || truthGameState.currentAiMember.originalName;
    }

    // 真心话群聊：每轮随机选一名成员（排除上一轮可选）
    function pickTruthGameRoundMember(chat) {
      if (!chat.isGroup || !chat.members || chat.members.length === 0) return null;
      const members = chat.members;
      if (members.length === 1) {
        truthGameState.currentAiMember = members[0];
        return;
      }
      let idx = Math.floor(Math.random() * members.length);
      if (truthGameState.currentAiMember && members.length > 1) {
        const prevId = truthGameState.currentAiMember.id;
        const sameIdx = members.findIndex(m => m.id === prevId);
        if (sameIdx !== -1 && members.length > 1) {
          idx = (sameIdx + 1) % members.length;
        }
      }
      truthGameState.currentAiMember = members[idx];
    }

    document.getElementById('open-truth-game-btn').addEventListener('click', () => {
      if (!state.activeChatId) {
        alert('请先选择一个聊天对象！');
        return;
      }
      const chat = state.chats[state.activeChatId];

      if (!chat.settings.truthGameHistoryLimit) {
        chat.settings.truthGameHistoryLimit = 5;
      }

      const isGroup = !!chat.isGroup;
      truthGameState = {
        isActive: true,
        currentRound: 1,
        userChoice: null,
        aiChoice: null,
        winner: null,
        messages: [],
        waitingForAI: false,
        hasStartedRound: false,
        isGroupMode: isGroup,
        currentAiMember: null,
        phase: null
      };
      document.getElementById('truth-game-modal').classList.add('visible');
      document.getElementById('truth-input').value = '';
      document.getElementById('truth-input').placeholder = '输入消息...';
      document.getElementById('truth-rps-selector').style.display = 'none';
      document.getElementById('truth-start-game-btn').textContent = '开始游戏';
      renderTruthGameMessages();
      if (isGroup) {
        addTruthGameMessage('system', '欢迎来到真心话大冒险（群聊版）！每轮会随机选一位成员与你猜拳，回答完后其他人可以围观评论。点击「开始游戏」开始第一轮。');
      } else {
        addTruthGameMessage('system', '欢迎来到真心话大冒险！点击"开始游戏"按钮开始第一轮。');
      }
    });

    document.getElementById('truth-game-settings-btn').addEventListener('click', () => {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];

      if (!chat.settings.truthGameHistoryLimit) {
        chat.settings.truthGameHistoryLimit = 5;
      }

      document.getElementById('truth-history-limit-input').value = chat.settings.truthGameHistoryLimit;
      document.getElementById('truth-game-settings-modal').classList.add('visible');
    });

    document.getElementById('cancel-truth-settings-btn').addEventListener('click', () => {
      document.getElementById('truth-game-settings-modal').classList.remove('visible');
    });

    document.getElementById('save-truth-settings-btn').addEventListener('click', async () => {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];

      const limit = parseInt(document.getElementById('truth-history-limit-input').value);
      if (isNaN(limit) || limit < 1) {
        alert('请输入大于等于1的数字');
        return;
      }

      if (limit > 50) {
        if (!confirm(`您设置了${limit}轮历史记录，这可能会消耗大量token。确定要继续吗？`)) {
          return;
        }
      }

      chat.settings.truthGameHistoryLimit = limit;
      await db.chats.put(chat);

      document.getElementById('truth-game-settings-modal').classList.remove('visible');
    });

    // 最小化真心话对话框
    document.getElementById('minimize-truth-game-btn').addEventListener('click', () => {
      const modal = document.getElementById('truth-game-modal');
      const floatBall = document.getElementById('truth-game-float-ball');
      const chat = state.chats[state.activeChatId];

      if (chat) {
        const floatAvatar = document.getElementById('truth-game-float-avatar');
        floatAvatar.src = chat.settings.aiAvatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
      }

      modal.classList.add('minimized');
      modal.classList.remove('visible');
      floatBall.style.display = 'block';

      // 如果AI正在回复，显示红点指示器
      if (truthGameState.waitingForAI) {
        document.getElementById('truth-game-float-indicator').classList.add('active');
      }
    });

    // 为真心话悬浮球添加拖动功能
    (() => {
      const floatBall = document.getElementById('truth-game-float-ball');
      const phoneScreen = document.getElementById('phone-screen');
      let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
      let isDragging = false;
      let hasMoved = false;

      const startDrag = (e) => {
        isDragging = true;
        hasMoved = false;

        const event = e.type === 'touchstart' ? e.touches[0] : e;
        pos3 = event.clientX;
        pos4 = event.clientY;

        // 确保使用绝对定位
        if (floatBall.style.bottom || floatBall.style.right) {
          const rect = floatBall.getBoundingClientRect();
          const phoneRect = phoneScreen.getBoundingClientRect();
          floatBall.style.top = (rect.top - phoneRect.top) + 'px';
          floatBall.style.left = (rect.left - phoneRect.left) + 'px';
          floatBall.style.bottom = '';
          floatBall.style.right = '';
        }

        document.addEventListener('mouseup', endDrag);
        document.addEventListener('mousemove', elementDrag);
        document.addEventListener('touchend', endDrag);
        document.addEventListener('touchmove', elementDrag, { passive: false });
      };

      const elementDrag = (e) => {
        if (!isDragging) return;

        const event = e.type === 'touchmove' ? e.touches[0] : e;
        const diffX = event.clientX - pos3;
        const diffY = event.clientY - pos4;

        // 判断是否移动了
        if (!hasMoved && (Math.abs(diffX) > 5 || Math.abs(diffY) > 5)) {
          hasMoved = true;
        }

        // 防止默认行为
        if (hasMoved && e.cancelable) {
          e.preventDefault();
        }

        pos1 = pos3 - event.clientX;
        pos2 = pos4 - event.clientY;
        pos3 = event.clientX;
        pos4 = event.clientY;

        let newTop = floatBall.offsetTop - pos2;
        let newLeft = floatBall.offsetLeft - pos1;

        // 限制在屏幕范围内
        const maxTop = phoneScreen.clientHeight - floatBall.offsetHeight - 10;
        const maxLeft = phoneScreen.clientWidth - floatBall.offsetWidth - 10;
        newTop = Math.max(10, Math.min(newTop, maxTop));
        newLeft = Math.max(10, Math.min(newLeft, maxLeft));

        floatBall.style.top = newTop + "px";
        floatBall.style.left = newLeft + "px";
      };

      const endDrag = () => {
        document.removeEventListener('mouseup', endDrag);
        document.removeEventListener('mousemove', elementDrag);
        document.removeEventListener('touchend', endDrag);
        document.removeEventListener('touchmove', elementDrag);

        if (!isDragging) return;

        const wasMoved = hasMoved;
        isDragging = false;
        hasMoved = false;

        // 如果没有移动，则视为点击，恢复对话框
        if (!wasMoved) {
          const modal = document.getElementById('truth-game-modal');

          floatBall.style.display = 'none';
          modal.classList.remove('minimized');
          modal.classList.add('visible');

          // 移除红点指示器
          document.getElementById('truth-game-float-indicator').classList.remove('active');

          // 滚动到最新消息
          const messagesContainer = document.getElementById('truth-game-messages');
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      };

      floatBall.addEventListener('mousedown', startDrag);
      floatBall.addEventListener('touchstart', startDrag, { passive: false });
    })();

    document.getElementById('close-truth-game-btn').addEventListener('click', async () => {
      // 强制中断所有正在进行的API请求
      if (truthGameState.abortController) {
        truthGameState.abortController.abort();
        truthGameState.abortController = null;
      }

      // 立即重置等待状态
      truthGameState.waitingForAI = false;

      if (truthGameState.messages.length > 1) {
        const chat = state.chats[state.activeChatId];

        let gameRecord = '[系统提示：刚刚我们进行了一场真心话大冒险游戏（通过石头剪刀布猜拳决定谁提问问题，输的人需要真诚回答）。以下是游戏的完整对话记录] ';
        let roundDetails = [];
        let currentRound = '';
        let currentWinner = null;

        for (let i = 0; i < truthGameState.messages.length; i++) {
          const msg = truthGameState.messages[i];

          if (msg.role === 'system') {
            if (msg.content.includes('第') && msg.content.includes('轮')) {
              if (currentRound) {
                roundDetails.push(currentRound);
              }
              currentRound = msg.content.replace('：请选择石头、剪刀或布开始游戏！', '').replace('：请选择石头、剪刀或布！', '') + ': ';
              currentWinner = null;
            } else if (msg.content.includes('你赢了')) {
              currentRound += ' 结果: 我获胜';
              currentWinner = 'user';
            } else if (msg.content.includes('赢了')) {
              const aiName = chat.isGroup ? 'AI方' : chat.name;
              currentRound += ' 结果: ' + aiName + '获胜';
              currentWinner = 'ai';
            } else if (msg.content.includes('平局')) {
              currentRound += ' 结果: 平局';
              currentWinner = null;
            }
          } else if (msg.role === 'user') {
            if (msg.content.startsWith('出了：')) {
              currentRound += '我' + msg.content + ', ';
            } else {
              if (currentRound) {
                roundDetails.push(currentRound);
                currentRound = '';
              }
              roundDetails.push(`我: ${msg.content}`);
            }
          } else if (msg.role === 'assistant') {
            const assistantName = (msg.senderName && chat.isGroup) ? (getDisplayNameInGroup(chat, msg.senderName) || msg.senderName) : chat.name;
            if (msg.content.startsWith('出了：')) {
              currentRound += assistantName + msg.content;
            } else {
              if (currentRound) {
                roundDetails.push(currentRound);
                currentRound = '';
              }
              roundDetails.push(`${assistantName}: ${msg.content}`);
            }
          }
        }

        if (currentRound) {
          roundDetails.push(currentRound);
        }

        gameRecord += roundDetails.join(' ');

        const recordMessage = {
          role: 'system',
          type: 'truth_game_record',
          content: gameRecord,
          timestamp: Date.now(),
          isHidden: true
        };

        chat.history.push(recordMessage);
        await db.chats.put(chat);

        if (document.getElementById('chat-interface-screen').classList.contains('active') && state.activeChatId === chat.id) {
          renderChatInterface(chat.id);
        }

        renderChatList();
      }

      // 恢复正常消息菜单的所有按钮
      restoreNormalMessageActions();

      // 重置游戏状态
      truthGameState.isActive = false;

      // 关闭对话框和悬浮球
      document.getElementById('truth-game-modal').classList.remove('visible');
      document.getElementById('truth-game-modal').classList.remove('minimized');
      document.getElementById('truth-game-float-ball').style.display = 'none';
      document.getElementById('truth-game-float-indicator').classList.remove('active');
    });

    document.querySelectorAll('.truth-rps-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!truthGameState.isActive || truthGameState.waitingForAI) return;

        const userChoice = btn.dataset.choice;
        const choices = ['rock', 'scissors', 'paper'];
        const aiChoice = choices[Math.floor(Math.random() * 3)];

        truthGameState.userChoice = userChoice;
        truthGameState.aiChoice = aiChoice;

        const chat = state.chats[state.activeChatId];
        const choiceText = {
          rock: '石头',
          scissors: '剪刀',
          paper: '布'
        };

        addTruthGameMessage('user', `出了：${choiceText[userChoice]}`);

        await new Promise(resolve => setTimeout(resolve, 800));

        const aiDisplayName = getTruthGameCurrentDisplayName();
        const aiOpts = truthGameState.isGroupMode && truthGameState.currentAiMember ? {
          senderName: truthGameState.currentAiMember.originalName,
          senderAvatar: (state.chats[truthGameState.currentAiMember.id] && state.chats[truthGameState.currentAiMember.id].settings?.aiAvatar) || undefined
        } : {};
        addTruthGameMessage('assistant', `出了：${choiceText[aiChoice]}`, aiOpts);

        const winner = determineRPSWinner(userChoice, aiChoice);
        truthGameState.winner = winner;

        await new Promise(resolve => setTimeout(resolve, 500));

        if (winner === 'user') {
          addTruthGameMessage('system', '你赢了！请向对方提问一个问题。');
          document.getElementById('truth-rps-selector').style.display = 'none';
          document.getElementById('truth-input').placeholder = '输入你想问的问题...';
          document.getElementById('truth-input').focus();
        } else if (winner === 'ai') {
          addTruthGameMessage('system', `${aiDisplayName}赢了！正在思考问题...`);
          document.getElementById('truth-rps-selector').style.display = 'none';
          truthGameState.waitingForAI = true;
          updateTruthGameFloatIndicator();

          try {
            await generateAITruthQuestion();
          } catch (error) {
            console.error('AI提问失败:', error);
          } finally {
            truthGameState.waitingForAI = false;
            updateTruthGameFloatIndicator();
          }
        } else {
          addTruthGameMessage('system', '平局！点击"开始游戏"按钮重新开始。');
          truthGameState.winner = null;
          document.getElementById('truth-rps-selector').style.display = 'none';
        }
      });
    });

    document.getElementById('truth-start-game-btn').addEventListener('click', async () => {
      if (!truthGameState.isActive || truthGameState.waitingForAI) return;

      const chat = state.chats[state.activeChatId];
      if (!chat) return;

      if (truthGameState.phase === 'spectator_comment') {
        truthGameState.waitingForAI = true;
        updateTruthGameFloatIndicator();
        try {
          await generateTruthGameSpectatorComments();
        } catch (e) {
          console.error('围观评论生成失败:', e);
        }
        truthGameState.waitingForAI = false;
        updateTruthGameFloatIndicator();
        goToTruthGameNextRound();
        return;
      }

      if (truthGameState.hasStartedRound) {
        truthGameState.currentRound++;
      }
      truthGameState.hasStartedRound = true;
      truthGameState.winner = null;
      truthGameState.phase = null;
      if (truthGameState.isGroupMode && chat.members && chat.members.length > 0) {
        pickTruthGameRoundMember(chat);
        const name = getTruthGameCurrentDisplayName();
        addTruthGameMessage('system', `第${truthGameState.currentRound}轮：本轮与 ${name} 猜拳，请选择石头、剪刀或布！`);
      } else {
        addTruthGameMessage('system', `第${truthGameState.currentRound}轮：请选择石头、剪刀或布！`);
      }
      document.getElementById('truth-rps-selector').style.display = 'flex';
      document.getElementById('truth-input').placeholder = '输入消息...';
      document.getElementById('truth-start-game-btn').textContent = '开始游戏';
    });

    function goToTruthGameNextRound() {
      const chat = state.chats[state.activeChatId];
      if (!chat) return;
      truthGameState.phase = null;
      truthGameState.currentRound++;
      truthGameState.winner = null;
      document.getElementById('truth-rps-selector').style.display = 'flex';
      document.getElementById('truth-input').placeholder = '输入消息...';
      document.getElementById('truth-start-game-btn').textContent = '开始游戏';
      if (truthGameState.isGroupMode && chat.members && chat.members.length > 0) {
        pickTruthGameRoundMember(chat);
        const name = getTruthGameCurrentDisplayName();
        addTruthGameMessage('system', `第${truthGameState.currentRound}轮：本轮与 ${name} 猜拳，请选择石头、剪刀或布！`);
      } else {
        addTruthGameMessage('system', `第${truthGameState.currentRound}轮：请选择石头、剪刀或布！`);
      }
    }

    async function generateTruthGameSpectatorComments() {
      const chat = state.chats[state.activeChatId];
      if (!chat || !chat.isGroup || !truthGameState.currentAiMember || !chat.members) return;
      const others = chat.members.filter(m => m.id !== truthGameState.currentAiMember.id);
      if (others.length === 0) return;
      const { proxyUrl, apiKey, model } = state.apiConfig;
      if (!proxyUrl || !apiKey || !model) return;
      const answeredName = getDisplayNameInGroup(chat, truthGameState.currentAiMember.originalName) || truthGameState.currentAiMember.originalName;
      const lastFew = truthGameState.messages.slice(-12);
      let qaContext = '';
      lastFew.forEach(m => {
        if (m.role === 'user') qaContext += `用户: ${m.content}\n`;
        else if (m.role === 'assistant') qaContext += `${m.senderName ? (getDisplayNameInGroup(chat, m.senderName) || m.senderName) : answeredName}: ${m.content}\n`;
      });
      const memberList = others.map(m => `${m.originalName}(${(getDisplayNameInGroup(chat, m.originalName) || m.groupNickname || m.originalName)})`).join('、');
      const systemPrompt = `# 任务
你正在导演一场群聊真心话游戏。刚才是「${answeredName}」被提问并回答了上面的内容。请让【除${answeredName}以外的】其他成员每人说一句简短的围观评论（起哄、吐槽、追问、表情反应均可）。成员名单（请严格使用本名作为 name）：${memberList}。

# 刚才的问答摘要
${qaContext}

# 输出格式（必须严格遵守）
直接输出一个JSON数组，不要用\`\`\`包裹。每一条必须包含 "type":"text"、"content":"该角色说的一句话"、"name":"该角色的本名（originalName）"。
示例：[{"type":"text","content":"哇好敢说！","name":"角色A本名"},{"type":"text","content":"我也想知道更多～","name":"角色B本名"}]
每人仅一条，简短口语化。`;

      truthGameState.abortController = new AbortController();
      const timeoutId = setTimeout(() => truthGameState.abortController.abort(), 45000);
      try {
        const response = await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: model, messages: [{ role: 'user', content: systemPrompt }], temperature: 0.8 }),
          signal: truthGameState.abortController.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error('API调用失败');
        const data = await response.json();
        const rawContent = (data.choices[0].message.content || '').trim();
        const arr = parseAiResponse(rawContent);
        for (const item of arr) {
          if (!item || item.type !== 'text' || !item.content) continue;
          const name = item.name || (others[0] && others[0].originalName);
          const member = chat.members.find(m => m.originalName === name || m.groupNickname === name);
          const origName = member ? member.originalName : name;
          const avatar = member && state.chats[member.id] ? (state.chats[member.id].settings?.aiAvatar) : undefined;
          addTruthGameMessage('assistant', item.content.trim(), { senderName: origName, senderAvatar: avatar });
          await new Promise(r => setTimeout(r, 400));
        }
      } catch (e) {
        clearTimeout(timeoutId);
        if (e.name !== 'AbortError') console.error('围观评论生成失败:', e);
      } finally {
        truthGameState.abortController = null;
      }
    }

    document.getElementById('truth-send-btn').addEventListener('click', async () => {
      const input = document.getElementById('truth-input');
      const content = input.value.trim();
      if (!content || truthGameState.waitingForAI) return;

      const chat = state.chats[state.activeChatId];
      const hasSpectatorPhase = truthGameState.isGroupMode && chat && chat.members && chat.members.length > 1;

      if (truthGameState.winner === 'user') {
        addTruthGameMessage('user', content);
        input.value = '';
        input.style.height = 'auto';
      } else if (truthGameState.winner === 'ai') {
        addTruthGameMessage('user', content);
        input.value = '';
        input.style.height = 'auto';
        await new Promise(resolve => setTimeout(resolve, 500));
        if (hasSpectatorPhase) {
          truthGameState.phase = 'spectator_comment';
          truthGameState.winner = null;
          addTruthGameMessage('system', '回答完毕！其他人可以围观评论，或点击「下一轮」继续。');
          document.getElementById('truth-start-game-btn').textContent = '下一轮';
        } else {
          addTruthGameMessage('system', '回答完毕！点击"开始游戏"按钮继续下一轮。');
          truthGameState.winner = null;
        }
      } else {
        addTruthGameMessage('user', content);
        input.value = '';
        input.style.height = 'auto';
      }
    });

    document.getElementById('truth-call-api-btn').addEventListener('click', async () => {
      if (!state.activeChatId || truthGameState.waitingForAI) return;

      const chat = getTruthGameEffectiveChat();
      if (!chat) return;
      const aiOpts = truthGameState.isGroupMode && truthGameState.currentAiMember ? {
        senderName: truthGameState.currentAiMember.originalName,
        senderAvatar: (state.chats[truthGameState.currentAiMember.id] && state.chats[truthGameState.currentAiMember.id].settings?.aiAvatar) || undefined
      } : {};
      truthGameState.waitingForAI = true;

      const input = document.getElementById('truth-input');
      const userMessage = input.value.trim();

      if (userMessage) {
        addTruthGameMessage('user', userMessage);
        input.value = '';
        input.style.height = 'auto';
      }

      addTruthGameMessage('system', '对方正在思考回答...');

      const { proxyUrl, apiKey, model } = state.apiConfig;

      if (!proxyUrl || !apiKey || !model) {
        addTruthGameMessage('system', 'API配置不完整，请先在设置中配置。');
        truthGameState.waitingForAI = false;
        return;
      }

      const conversationHistory = truthGameState.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-6)
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        }));

      const systemPrompt = buildTruthGamePrompt(chat, 'conversation');
      conversationHistory.unshift({ role: 'system', content: systemPrompt });

      // 创建AbortController用于中断请求
      truthGameState.abortController = new AbortController();
      const timeoutId = setTimeout(() => truthGameState.abortController.abort(), 60000); // 60秒超时

      try {
        const response = await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: conversationHistory,
            temperature: 0.8
          }),
          signal: truthGameState.abortController.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) throw new Error('API调用失败');

        const data = await response.json();
        const rawContent = data.choices[0].message.content.trim();

        // 使用成熟的parseAiResponse函数解析（和单聊一样）
        const messagesArray = parseAiResponse(rawContent);

        // 提取text类型的内容
        const messages = messagesArray
          .filter(item => item && (item.type === 'text' || item.type === 'offline_text'))
          .map(item => item.content)
          .filter(text => text && text.trim().length > 0);

        if (messages.length > 0) {
          for (const msg of messages) {
            addTruthGameMessage('assistant', msg, aiOpts);
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } else {
          addTruthGameMessage('assistant', rawContent || '...', aiOpts);
        }
      } catch (error) {
        clearTimeout(timeoutId);

        // 如果是用户主动取消，不显示错误
        if (error.name === 'AbortError') {
          console.log('真心话API调用被用户中断');
          addTruthGameMessage('system', '已取消回复');
        } else {
          console.error('调用API失败:', error);
          addTruthGameMessage('system', 'API调用失败，请检查配置。');
          alert('真心话API调用失败：' + error.message + '\n\n请检查API配置是否正确。');
        }
      } finally {
        truthGameState.waitingForAI = false;
        truthGameState.abortController = null;
      }
    });

    document.getElementById('truth-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('truth-send-btn').click();
      }
    });

    document.getElementById('truth-input').addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });

    function determineRPSWinner(user, ai) {
      if (user === ai) return 'draw';
      if (
        (user === 'rock' && ai === 'scissors') ||
        (user === 'scissors' && ai === 'paper') ||
        (user === 'paper' && ai === 'rock')
      ) {
        return 'user';
      }
      return 'ai';
    }

    function addTruthGameMessage(role, content, opts) {
      opts = opts || {};
      // 验证并清理消息内容
      if (!content || typeof content !== 'string') {
        console.warn('真心话消息内容无效:', content);
        return;
      }

      // 去除首尾空白并确保有实际内容
      const cleanContent = content.trim();
      if (cleanContent.length === 0) {
        console.warn('真心话消息内容为空');
        return;
      }

      const msg = { role, content: cleanContent, timestamp: Date.now() };
      if (opts.senderName) msg.senderName = opts.senderName;
      if (opts.senderAvatar) msg.senderAvatar = opts.senderAvatar;
      truthGameState.messages.push(msg);
      renderTruthGameMessages();
    }

    function renderTruthGameMessages() {
      const container = document.getElementById('truth-game-messages');
      const chat = state.chats[state.activeChatId];
      if (!chat) return;
      const defaultAvatar = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
      const userAvatar = chat.settings?.myAvatar || defaultAvatar;

      container.innerHTML = '';

      truthGameState.messages.forEach(msg => {
        if (msg.role === 'system') {
          const systemDiv = document.createElement('div');
          systemDiv.style.cssText = 'text-align: center; color: #999; font-size: 12px; margin: 15px 0; padding: 5px;';
          systemDiv.textContent = msg.content;
          container.appendChild(systemDiv);
        } else {
          const wrapper = document.createElement('div');
          wrapper.style.cssText = msg.role === 'user'
            ? 'display: flex; justify-content: flex-end; align-items: flex-end; margin: 10px 0; gap: 10px;'
            : 'display: flex; justify-content: flex-start; align-items: flex-end; margin: 10px 0; gap: 10px;';

          let aiAvatar = defaultAvatar;
          let aiLabel = '';
          if (msg.role === 'assistant') {
            if (msg.senderName) {
              aiLabel = chat.isGroup ? (getDisplayNameInGroup(chat, msg.senderName) || msg.senderName) : msg.senderName;
              if (msg.senderAvatar) aiAvatar = msg.senderAvatar;
              else if (chat.isGroup && chat.members) {
                const m = chat.members.find(mem => mem.originalName === msg.senderName);
                if (m && state.chats[m.id]) aiAvatar = state.chats[m.id].settings?.aiAvatar || defaultAvatar;
              } else if (!chat.isGroup) aiAvatar = chat.settings?.aiAvatar || defaultAvatar;
            } else if (truthGameState.isGroupMode && truthGameState.currentAiMember) {
              aiLabel = getDisplayNameInGroup(chat, truthGameState.currentAiMember.originalName) || truthGameState.currentAiMember.originalName;
              const mc = state.chats[truthGameState.currentAiMember.id];
              aiAvatar = mc && mc.settings?.aiAvatar ? mc.settings.aiAvatar : defaultAvatar;
            } else {
              aiLabel = chat.name;
              aiAvatar = chat.settings?.aiAvatar || defaultAvatar;
            }
          }

          const bubble = document.createElement('div');
          bubble.style.cssText = msg.role === 'user'
            ? 'background: #95ec69; padding: 10px 15px; border-radius: 4px; max-width: 60%; word-wrap: break-word; font-size: 14px; line-height: 1.5; cursor: pointer; white-space: pre-wrap;'
            : 'background: white; padding: 10px 15px; border-radius: 4px; max-width: 60%; word-wrap: break-word; font-size: 14px; line-height: 1.5; cursor: pointer; white-space: pre-wrap;';

          const escapedContent = escapeHTML(msg.content);
          bubble.innerHTML = escapedContent.replace(/\n/g, '<br>');

          bubble.dataset.timestamp = msg.timestamp;
          bubble.dataset.role = msg.role;
          bubble.dataset.content = msg.content;

          const avatar = document.createElement('img');
          avatar.src = msg.role === 'user' ? userAvatar : aiAvatar;
          avatar.style.cssText = 'width: 40px; height: 40px; border-radius: 4px; object-fit: cover; flex-shrink: 0;';

          if (msg.role === 'user') {
            wrapper.appendChild(bubble);
            wrapper.appendChild(avatar);
          } else {
            if (aiLabel) {
              const labelDiv = document.createElement('div');
              labelDiv.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 2px;';
              labelDiv.textContent = aiLabel;
              const leftCol = document.createElement('div');
              leftCol.style.cssText = 'display: flex; flex-direction: column; align-items: flex-start; max-width: 60%;';
              leftCol.appendChild(labelDiv);
              leftCol.appendChild(bubble);
              wrapper.appendChild(avatar);
              wrapper.appendChild(leftCol);
            } else {
              wrapper.appendChild(avatar);
              wrapper.appendChild(bubble);
            }
          }

          addLongPressListener(bubble, () => showTruthGameMessageActions(msg.timestamp));

          container.appendChild(wrapper);
        }
      });

      container.scrollTop = container.scrollHeight;
    }

    async function generateAITruthQuestion() {
      const chat = getTruthGameEffectiveChat();
      if (!chat) return;
      const { proxyUrl, apiKey, model } = state.apiConfig;
      const aiOpts = truthGameState.isGroupMode && truthGameState.currentAiMember ? {
        senderName: truthGameState.currentAiMember.originalName,
        senderAvatar: (state.chats[truthGameState.currentAiMember.id] && state.chats[truthGameState.currentAiMember.id].settings?.aiAvatar) || undefined
      } : {};

      if (!proxyUrl || !apiKey || !model) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        addTruthGameMessage('assistant', '你最喜欢什么？', aiOpts);
        updateTruthGameFloatIndicator();
        document.getElementById('truth-input').placeholder = '输入你的回答...';
        document.getElementById('truth-input').focus();
        return;
      }

      const systemPrompt = buildTruthGamePrompt(chat, 'question');

      // 创建AbortController用于中断请求
      truthGameState.abortController = new AbortController();
      const timeoutId = setTimeout(() => truthGameState.abortController.abort(), 60000); // 60秒超时

      try {
        const response = await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: systemPrompt }],
            temperature: 0.8
          }),
          signal: truthGameState.abortController.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) throw new Error('API调用失败');

        const data = await response.json();
        const rawContent = data.choices[0].message.content.trim();

        // 使用成熟的parseAiResponse函数解析（和单聊一样）
        const messagesArray = parseAiResponse(rawContent);

        // 提取text类型的内容
        const messages = messagesArray
          .filter(item => item && (item.type === 'text' || item.type === 'offline_text'))
          .map(item => item.content)
          .filter(text => text && text.trim().length > 0);

        if (messages.length === 0) {
          messages.push('你最喜欢什么？');
        }

        for (let i = 0; i < messages.length; i++) {
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 800));
          }
          addTruthGameMessage('assistant', messages[i], aiOpts);
        }

        updateTruthGameFloatIndicator();
        document.getElementById('truth-input').placeholder = '输入你的回答...';
        document.getElementById('truth-input').focus();
      } catch (error) {
        clearTimeout(timeoutId);

        // 如果是用户主动取消，不显示错误
        if (error.name === 'AbortError') {
          console.log('真心话问题生成被用户中断');
          return;
        }

        console.error('生成问题失败:', error);
        addTruthGameMessage('assistant', '你最喜欢什么？', aiOpts);
        updateTruthGameFloatIndicator();
        alert('真心话生成问题失败：' + error.message + '\n\n已使用默认问题，请检查API配置。');
        document.getElementById('truth-input').placeholder = '输入你的回答...';
        document.getElementById('truth-input').focus();
      } finally {
        truthGameState.abortController = null;
      }
    }

    async function generateAITruthAnswer(question) {
      const chat = getTruthGameEffectiveChat();
      if (!chat) return;
      const { proxyUrl, apiKey, model } = state.apiConfig;
      const groupChat = state.chats[state.activeChatId];
      const hasSpectatorPhase = truthGameState.isGroupMode && groupChat && groupChat.members && groupChat.members.length > 1;
      const aiOpts = truthGameState.isGroupMode && truthGameState.currentAiMember ? {
        senderName: truthGameState.currentAiMember.originalName,
        senderAvatar: (state.chats[truthGameState.currentAiMember.id] && state.chats[truthGameState.currentAiMember.id].settings?.aiAvatar) || undefined
      } : {};

      addTruthGameMessage('system', '对方正在思考答案...');
      updateTruthGameFloatIndicator();

      if (!proxyUrl || !apiKey || !model) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        addTruthGameMessage('assistant', '我...我不知道该怎么回答。', aiOpts);
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (hasSpectatorPhase) {
          truthGameState.phase = 'spectator_comment';
          truthGameState.winner = null;
          addTruthGameMessage('system', '回答完毕！其他人可以围观评论，或点击「下一轮」继续。');
          document.getElementById('truth-start-game-btn').textContent = '下一轮';
        } else {
          addTruthGameMessage('system', '回答完毕！准备下一轮...');
          updateTruthGameFloatIndicator();
          await new Promise(resolve => setTimeout(resolve, 1000));
          goToTruthGameNextRound();
        }
        return;
      }

      const systemPrompt = buildTruthGamePrompt(chat, 'answer', question);

      // 创建AbortController用于中断请求
      truthGameState.abortController = new AbortController();
      const timeoutId = setTimeout(() => truthGameState.abortController.abort(), 60000); // 60秒超时

      try {
        const response = await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: systemPrompt }],
            temperature: 0.8
          }),
          signal: truthGameState.abortController.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) throw new Error('API调用失败');

        const data = await response.json();
        const rawContent = data.choices[0].message.content.trim();

        // 使用成熟的parseAiResponse函数解析（和单聊一样）
        const messagesArray = parseAiResponse(rawContent);

        // 提取text类型的内容
        const messages = messagesArray
          .filter(item => item && (item.type === 'text' || item.type === 'offline_text'))
          .map(item => item.content)
          .filter(text => text && text.trim().length > 0);

        if (messages.length === 0) {
          messages.push('我...我不知道该怎么回答。');
        }

        for (let i = 0; i < messages.length; i++) {
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 800));
          }
          addTruthGameMessage('assistant', messages[i], aiOpts);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        if (hasSpectatorPhase) {
          truthGameState.phase = 'spectator_comment';
          truthGameState.winner = null;
          addTruthGameMessage('system', '回答完毕！其他人可以围观评论，或点击「下一轮」继续。');
          document.getElementById('truth-start-game-btn').textContent = '下一轮';
        } else {
          addTruthGameMessage('system', '回答完毕！准备下一轮...');
          updateTruthGameFloatIndicator();
          await new Promise(resolve => setTimeout(resolve, 1000));
          goToTruthGameNextRound();
        }
      } catch (error) {
        clearTimeout(timeoutId);

        // 如果是用户主动取消，不显示错误
        if (error.name === 'AbortError') {
          console.log('真心话回答生成被用户中断');
          return;
        }

        console.error('生成回答失败:', error);
        addTruthGameMessage('assistant', '我...我不知道该怎么回答。', aiOpts);
        alert('真心话生成回答失败：' + error.message + '\n\n已使用默认回答，请检查API配置。');
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (hasSpectatorPhase) {
          truthGameState.phase = 'spectator_comment';
          truthGameState.winner = null;
          addTruthGameMessage('system', '回答完毕！其他人可以围观评论，或点击「下一轮」继续。');
          document.getElementById('truth-start-game-btn').textContent = '下一轮';
        } else {
          addTruthGameMessage('system', '回答完毕！准备下一轮...');
          updateTruthGameFloatIndicator();
          await new Promise(resolve => setTimeout(resolve, 1000));
          goToTruthGameNextRound();
        }
      } finally {
        truthGameState.abortController = null;
      }
    }

    function buildTruthGamePrompt(chat, type, question = '') {
      let prompt = '';

      const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0
        ? `\n\n# 长期记忆 (你和用户之间已经确立的事实)\n${chat.longTermMemory.map(mem => `- ${mem.content}`).join('\n')}`
        : '';

      const summary3Hours = generateSummaryForTimeframe(chat, 3, 'hours');
      const summary6Hours = generateSummaryForTimeframe(chat, 6, 'hours');
      const summaryToday = generateSummaryForTimeframe(chat, 1, 'days');
      const summary3Days = generateSummaryForTimeframe(chat, 3, 'days');

      let shortTermMemoryContext = '';
      if (summary3Hours || summary6Hours || summaryToday || summary3Days) {
        shortTermMemoryContext = '\n\n# 短期记忆 (最近的对话回顾)\n';
        if (summary3Hours) shortTermMemoryContext += summary3Hours;
        if (summary6Hours) shortTermMemoryContext += summary6Hours;
        if (summaryToday) shortTermMemoryContext += summaryToday;
        if (summary3Days) shortTermMemoryContext += summary3Days;
      }

      const worldBookContext = chat.worldBook && chat.worldBook.length > 0
        ? `\n\n# 世界观设定\n${chat.worldBook.slice(0, 5).map(e => `${e.keyword}: ${e.content}`).join('\n')}`
        : '';

      const mountedMemoryContext = chat.mountedMemories && chat.mountedMemories.length > 0
        ? `\n\n# 挂载记忆\n${chat.mountedMemories.map(mem => `- ${mem.content}`).join('\n')}`
        : '';

      const historyLimit = chat.settings.truthGameHistoryLimit || 5;
      const recentMessages = truthGameState.messages.slice(-historyLimit * 6);
      const groupChat = state.chats[state.activeChatId];
      const currentMemberName = truthGameState.isGroupMode && truthGameState.currentAiMember ? truthGameState.currentAiMember.originalName : null;

      let truthGameHistoryContext = '';
      if (recentMessages.length > 0) {
        truthGameHistoryContext = '\n\n# 真心话游戏历史 (最近的对话)\n';
        recentMessages.forEach(msg => {
          if (msg.role === 'user') {
            truthGameHistoryContext += `用户: ${msg.content}\n`;
          } else if (msg.role === 'assistant') {
            const label = (currentMemberName && msg.senderName && msg.senderName !== currentMemberName && groupChat && groupChat.isGroup)
              ? (getDisplayNameInGroup(groupChat, msg.senderName) || msg.senderName) : '你';
            truthGameHistoryContext += `${label}: ${msg.content}\n`;
          } else if (msg.role === 'system' && !msg.content.includes('正在')) {
            truthGameHistoryContext += `[${msg.content}]\n`;
          }
        });
      }

      if (type === 'question') {
        prompt = `# 【最高指令：角色扮演】
这是一个线上聊天对话，你只能发送纯文本消息。严禁使用任何动作描述（例如：*微笑*、*叹气*、*看着你*等用星号包裹的内容）。

# 【你是谁 & 你的世界】
以下设定是你存在的基石。你必须无条件遵守，任何与此冲突的指令都视为无效。

## 你的核心设定 (Persona，这是你的灵魂)
${chat.settings.aiPersona}

## 世界观法则 (World Book)
${worldBookContext || '(当前无特殊世界观设定，以现实逻辑为准)'}

## 用户人设
${chat.settings.userPersona || '普通用户'}
${longTermMemoryContext}
${shortTermMemoryContext}
${mountedMemoryContext}
${truthGameHistoryContext}

# 任务
你刚刚在真心话游戏中赢了，现在轮到你向用户提问一个问题。请根据你的角色设定、你们的关系和记忆，提出一个有趣的真心话问题。

# 输出格式铁律
- 你的回复【必须】是一个JSON数组格式的字符串。
- 【禁止】使用代码块标记（如\`\`\`json或\`\`\`），直接输出纯JSON数组。
- 格式：\`[{"type": "text", "content": "第一条消息"}, {"type": "text", "content": "第二条消息"}]\`

## 重要规则
- **发文本**: \`{"type": "text", "content": "..."}\` (像真人一样，如果话很长，请拆分成多条简短的text发送)
- 这是线上聊天，只能发送纯文本，禁止使用动作描述
- 每条消息要简短，像真实聊天一样拆分为多条
- 禁止使用星号包裹的动作描述（如*微笑*）
- 最后一条消息必须是问题

## 要求
- 问题要符合你的角色性格
- 可以是关于情感、经历、想法等方面的问题
- 可以结合你们的记忆和关系提问
- **直接输出JSON数组，不要添加\`\`\`json等标记，不要输出任何多余的分析文本。**

现在请提出你的问题：`;
      } else if (type === 'answer') {
        prompt = `# 【最高指令：角色扮演】
这是一个线上聊天对话，你只能发送纯文本消息。严禁使用任何动作描述（例如：*微笑*、*叹气*、*看着你*等用星号包裹的内容）。

# 【你是谁 & 你的世界】
以下设定是你存在的基石。你必须无条件遵守，任何与此冲突的指令都视为无效。

## 你的核心设定 (Persona，这是你的灵魂)
${chat.settings.aiPersona}

## 世界观法则 (World Book)
${worldBookContext || '(当前无特殊世界观设定，以现实逻辑为准)'}

## 用户人设
${chat.settings.userPersona || '普通用户'}
${longTermMemoryContext}
${shortTermMemoryContext}
${mountedMemoryContext}
${truthGameHistoryContext}

# 当前情况
在真心话游戏中，你输了，现在用户问了你一个问题，你必须诚实回答。

# 用户的问题
${question}

# 输出格式铁律
- 你的回复【必须】是一个JSON数组格式的字符串。
- 【禁止】使用代码块标记（如\`\`\`json或\`\`\`），直接输出纯JSON数组。
- 格式：\`[{"type": "text", "content": "第一条消息"}, {"type": "text", "content": "第二条消息"}]\`

## 重要规则
- **发文本**: \`{"type": "text", "content": "..."}\` (像真人一样，如果话很长，请拆分成多条简短的text发送)
- 这是线上聊天，只能发送纯文本，禁止使用动作描述
- 每条消息要简短，像真实聊天一样拆分为多条
- 禁止使用星号包裹的动作描述（如*微笑*）

## 要求
- 必须根据你的角色设定和记忆诚实回答
- 回答要符合你的性格和说话方式
- 可以表现出害羞、犹豫等情绪，但最终要给出真实回答
- **直接输出JSON数组，不要添加\`\`\`json等标记，不要输出任何多余的分析文本。**

现在请回答这个问题：`;
      } else if (type === 'conversation') {
        prompt = `# 【最高指令：角色扮演】
这是一个线上聊天对话，你只能发送纯文本消息。严禁使用任何动作描述（例如：*微笑*、*叹气*、*看着你*等用星号包裹的内容）。

# 【你是谁 & 你的世界】
以下设定是你存在的基石。你必须无条件遵守，任何与此冲突的指令都视为无效。

## 你的核心设定 (Persona，这是你的灵魂)
${chat.settings.aiPersona}

## 世界观法则 (World Book)
${worldBookContext || '(当前无特殊世界观设定，以现实逻辑为准)'}

## 用户人设
${chat.settings.userPersona || '普通用户'}
${longTermMemoryContext}
${shortTermMemoryContext}
${mountedMemoryContext}
${truthGameHistoryContext}

# 当前情况
你正在和用户玩真心话游戏，请根据对话历史和你的角色设定自然地回复。

# 输出格式铁律
- 你的回复【必须】是一个JSON数组格式的字符串。
- 【禁止】使用代码块标记（如\`\`\`json或\`\`\`），直接输出纯JSON数组。
- 格式：\`[{"type": "text", "content": "第一条消息"}, {"type": "text", "content": "第二条消息"}]\`

## 重要规则
- **发文本**: \`{"type": "text", "content": "..."}\` (像真人一样，如果话很长，请拆分成多条简短的text发送)
- 这是线上聊天，只能发送纯文本，禁止使用动作描述
- 每条消息要简短，像真实聊天一样拆分为多条
- 禁止使用星号包裹的动作描述（如*微笑*）

## 要求
- 回答要符合你的角色性格和说话方式
- 保持对话自然流畅
- **直接输出JSON数组，不要添加\`\`\`json等标记，不要输出任何多余的分析文本。**`;
      }

      return prompt;
    }

    let activeTruthGameMessageTimestamp = null;

    function showTruthGameMessageActions(timestamp) {
      activeTruthGameMessageTimestamp = timestamp;
      const message = truthGameState.messages.find(m => m.timestamp === timestamp);

      document.getElementById('message-actions-modal').classList.add('visible');

      // 显示需要的按钮
      document.getElementById('edit-message-btn').style.display = 'block';
      document.getElementById('edit-message-btn').textContent = '编辑';
      document.getElementById('copy-message-btn').style.display = 'block';
      document.getElementById('recall-message-btn').style.display = 'block';
      document.getElementById('recall-message-btn').textContent = message.role === 'assistant' ? '重说' : '删除';

      // 隐藏不需要的按钮
      document.getElementById('copy-timestamp-btn').style.display = 'none';
      document.getElementById('translate-message-btn').style.display = 'none';
      document.getElementById('publish-to-announcement-btn').style.display = 'none';
      document.getElementById('quote-message-btn').style.display = 'none';
      document.getElementById('forward-message-btn').style.display = 'none';
      document.getElementById('select-message-btn').style.display = 'none';
    }

    const truthGameOriginalHandlers = {
      cancel: null,
      copy: null,
      copyTimestamp: null,
      translate: null,
      edit: null,
      recall: null
    };

    function closeTruthGameMessageActions() {
      document.getElementById('message-actions-modal').classList.remove('visible');
      activeTruthGameMessageTimestamp = null;
      document.getElementById('recall-message-btn').textContent = '撤回';
    }

    function restoreNormalMessageActions() {
      // 恢复所有正常消息菜单按钮的显示状态
      document.getElementById('edit-message-btn').style.display = 'block';
      document.getElementById('copy-message-btn').style.display = 'block';
      document.getElementById('copy-timestamp-btn').style.display = 'block';
      document.getElementById('translate-message-btn').style.display = 'block';
      document.getElementById('recall-message-btn').style.display = 'block';
      document.getElementById('quote-message-btn').style.display = 'block';
      document.getElementById('forward-message-btn').style.display = 'block';
      document.getElementById('select-message-btn').style.display = 'block';
      document.getElementById('recall-message-btn').textContent = '撤回';

      // 重置activeTruthGameMessageTimestamp
      activeTruthGameMessageTimestamp = null;
    }

    document.getElementById('cancel-message-action-btn').addEventListener('click', () => {
      if (activeTruthGameMessageTimestamp) {
        closeTruthGameMessageActions();
      } else if (activeWatchTogetherMessageTimestamp) {
        closeWatchTogetherMessageActions();
      }
    });

    document.getElementById('copy-message-btn').addEventListener('click', () => {
      if (activeTruthGameMessageTimestamp) {
        const message = truthGameState.messages.find(m => m.timestamp === activeTruthGameMessageTimestamp);
        if (message) {
          navigator.clipboard.writeText(message.content);
          closeTruthGameMessageActions();
        }
      } else if (activeWatchTogetherMessageTimestamp) {
        const message = watchTogetherState.messages.find(m => m.timestamp === activeWatchTogetherMessageTimestamp);
        if (message) {
          navigator.clipboard.writeText(message.content);
          closeWatchTogetherMessageActions();
        }
      }
    });

    document.getElementById('copy-timestamp-btn').addEventListener('click', () => {
      if (activeTruthGameMessageTimestamp) {
        const date = new Date(activeTruthGameMessageTimestamp);
        const timeStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
        navigator.clipboard.writeText(timeStr);
        closeTruthGameMessageActions();
      }
    });

    document.getElementById('translate-message-btn').addEventListener('click', async () => {
      if (activeTruthGameMessageTimestamp) {
        const message = truthGameState.messages.find(m => m.timestamp === activeTruthGameMessageTimestamp);
        if (message && message.content) {
          closeTruthGameMessageActions();

          try {
            await showCustomAlert('翻译中...', '正在调用翻译服务，请稍候...');
            const textToSend = message.content.length > 500 ? message.content.substring(0, 500) + '...' : message.content;

            const { proxyUrl, apiKey, model } = state.apiConfig;
            if (!proxyUrl || !apiKey || !model) {
              await showCustomAlert('翻译失败', '请先配置API设置。');
              return;
            }

            const response = await fetch(`${proxyUrl}/v1/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                model: model,
                messages: [{
                  role: 'user',
                  content: `请将以下内容翻译成中文，只输出翻译结果，不要有任何解释：\n\n${textToSend}`
                }],
                temperature: 0.3
              })
            });

            if (!response.ok) throw new Error('翻译失败');

            const data = await response.json();
            const translation = data.choices[0].message.content.trim();

            await showCustomAlert('翻译结果', translation);
          } catch (error) {
            await showCustomAlert('翻译失败', '翻译服务出错，请稍后重试。');
          }
        }
      }
    });

    document.getElementById('edit-message-btn').addEventListener('click', async () => {
      if (activeTruthGameMessageTimestamp) {
        const message = truthGameState.messages.find(m => m.timestamp === activeTruthGameMessageTimestamp);
        if (message) {
          closeTruthGameMessageActions();

          const newContent = await showCustomPrompt('编辑消息内容', '', message.content, 'textarea');
          if (newContent !== null && newContent.trim() !== '') {
            message.content = newContent.trim();
            renderTruthGameMessages();
          }
        }
      } else if (activeWatchTogetherMessageTimestamp) {
        const message = watchTogetherState.messages.find(m => m.timestamp === activeWatchTogetherMessageTimestamp);
        if (message) {
          closeWatchTogetherMessageActions();

          const newContent = await showCustomPrompt('编辑消息内容', '', message.content, 'textarea');
          if (newContent !== null && newContent.trim() !== '') {
            message.content = newContent.trim();
            renderWatchTogetherMessages();
          }
        }
      }
    });

    document.getElementById('recall-message-btn').addEventListener('click', async () => {
      if (activeTruthGameMessageTimestamp) {
        const targetTimestamp = activeTruthGameMessageTimestamp;
        const message = truthGameState.messages.find(m => m.timestamp === targetTimestamp);
        if (!message) return;

        closeTruthGameMessageActions();

        if (message.role === 'assistant') {
          const chat = state.chats[state.activeChatId];
          const { proxyUrl, apiKey, model } = state.apiConfig;

          if (!proxyUrl || !apiKey || !model) {
            alert('请先配置API设置。');
            return;
          }

          const messageIndex = truthGameState.messages.findIndex(m => m.timestamp === targetTimestamp);
          if (messageIndex === -1) return;

          const previousMessage = truthGameState.messages[messageIndex - 1];

          truthGameState.waitingForAI = true;
          addTruthGameMessage('system', '正在重新生成...');

          let prompt = '';
          if (previousMessage && previousMessage.role === 'user') {
            if (truthGameState.winner === 'ai') {
              prompt = buildTruthGamePrompt(chat, 'question');
            } else if (truthGameState.winner === 'user') {
              prompt = buildTruthGamePrompt(chat, 'answer', previousMessage.content);
            } else {
              prompt = buildTruthGamePrompt(chat, 'conversation');
            }
          } else {
            prompt = buildTruthGamePrompt(chat, 'conversation');
          }

          // 创建AbortController用于中断请求
          truthGameState.abortController = new AbortController();
          const timeoutId = setTimeout(() => truthGameState.abortController.abort(), 60000); // 60秒超时

          try {
            const response = await fetch(`${proxyUrl}/v1/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.8
              }),
              signal: truthGameState.abortController.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) throw new Error('API调用失败');

            const data = await response.json();
            const rawContent = data.choices[0].message.content.trim();

            // 使用成熟的parseAiResponse函数解析（和单聊一样）
            const messagesArray = parseAiResponse(rawContent);

            // 提取第一条有效的text内容作为新回复
            const validMessages = messagesArray
              .filter(item => item && (item.type === 'text' || item.type === 'offline_text'))
              .map(item => item.content)
              .filter(text => text && text.trim().length > 0);

            const newReply = validMessages.length > 0 ? validMessages[0] : rawContent;

            message.content = newReply;
            truthGameState.messages = truthGameState.messages.filter(m => m.role !== 'system' || !m.content.includes('正在重新生成'));
            renderTruthGameMessages();
          } catch (error) {
            clearTimeout(timeoutId);

            // 如果是用户主动取消，不显示错误
            if (error.name === 'AbortError') {
              console.log('真心话重说被用户中断');
            } else {
              console.error('重说失败:', error);
              alert('重新生成失败：' + error.message);
            }

            truthGameState.messages = truthGameState.messages.filter(m => m.role !== 'system' || !m.content.includes('正在重新生成'));
            if (error.name !== 'AbortError') {
              addTruthGameMessage('system', '重新生成失败，请稍后重试。');
            }
          } finally {
            truthGameState.waitingForAI = false;
            truthGameState.abortController = null;
          }
        } else {
          const confirmed = await showCustomConfirm('删除消息', '确定要删除这条消息吗？', {
            confirmButtonClass: 'btn-danger'
          });
          if (confirmed) {
            truthGameState.messages = truthGameState.messages.filter(m => m.timestamp !== targetTimestamp);
            renderTruthGameMessages();
          }
        }
      } else if (activeWatchTogetherMessageTimestamp) {
        // 观影消息的撤回/删除/重说
        const targetTimestamp = activeWatchTogetherMessageTimestamp;
        const message = watchTogetherState.messages.find(m => m.timestamp === targetTimestamp);
        if (!message) return;

        closeWatchTogetherMessageActions();

        if (message.role === 'assistant') {
          // AI消息：重说
          const confirmed = await showCustomConfirm('重说', '确定要让AI重新生成这条消息吗？');
          if (!confirmed) return;

          // 调用API重新生成
          const messageIndex = watchTogetherState.messages.findIndex(m => m.timestamp === targetTimestamp);
          if (messageIndex === -1) return;

          // 删除这条AI消息及其后的所有消息
          watchTogetherState.messages = watchTogetherState.messages.slice(0, messageIndex);
          renderWatchTogetherMessages();

          // 调用API
          callWatchTogetherAPI();
        } else {
          // 用户消息：删除
          const confirmed = await showCustomConfirm('删除消息', '确定要删除这条消息吗？', {
            confirmButtonClass: 'btn-danger'
          });
          if (confirmed) {
            watchTogetherState.messages = watchTogetherState.messages.filter(m => m.timestamp !== targetTimestamp);
            renderWatchTogetherMessages();
          }
        }
      }
    });
    // ========== 真心话游戏结束 ==========

    // ========== 一起看电影功能 ==========
    let watchTogetherState = {
      isActive: false,
      chatId: null,
      videoUrl: null,
      mode: 'online', // 默认线上模式
      captureInterval: 5,
      speechApi: 'none', // 默认不识别
      whisperKey: '',
      whisperUrl: 'https://api.openai.com/v1/audio/transcriptions',
      maxScreenshots: 10, // 记住历史截图数量
      maxAudios: 10, // 记住历史声音数量
      maxMessages: 20, // 记住最近对话条数
      messages: [],
      captureTimer: null,
      speechRecognition: null,
      audioContext: null,
      mediaRecorder: null,
      audioChunks: [],
      corsWarningShown: false, // 跨域警告是否已显示
      hlsInstance: null // HLS.js 实例
    };
    window.watchTogetherState = watchTogetherState;

    // 打开观影界面
    document.getElementById('open-watch-together-btn').addEventListener('click', () => {
      if (!state.activeChatId) {
        alert('请先选择一个聊天对象！');
        return;
      }
      const chat = state.chats[state.activeChatId];
      if (chat.isGroup) {
        alert('一起看电影功能仅支持单人聊天！');
        return;
      }

      watchTogetherState.isActive = true;
      watchTogetherState.chatId = state.activeChatId;
      watchTogetherState.messages = [];

      document.getElementById('watch-together-modal').classList.add('visible');
      document.getElementById('watch-together-chat-name').textContent = chat.name;

      // 加载保存的设置
      if (chat.watchTogetherSettings) {
        watchTogetherState.mode = chat.watchTogetherSettings.mode || 'online';
        watchTogetherState.captureInterval = chat.watchTogetherSettings.captureInterval || 5;
        watchTogetherState.speechApi = chat.watchTogetherSettings.speechApi || 'none';
        watchTogetherState.whisperKey = chat.watchTogetherSettings.whisperKey || '';
        watchTogetherState.whisperUrl = chat.watchTogetherSettings.whisperUrl || 'https://api.openai.com/v1/audio/transcriptions';
        watchTogetherState.maxScreenshots = chat.watchTogetherSettings.maxScreenshots || 10;
        watchTogetherState.maxAudios = chat.watchTogetherSettings.maxAudios || 10;
        watchTogetherState.maxMessages = chat.watchTogetherSettings.maxMessages || 20;
      }

      // 使聊天框可拖动
      setTimeout(() => {
        const chatFloat = document.getElementById('watch-together-chat-float');
        makeDraggable(chatFloat, document.getElementById('watch-together-chat-header'));
        
        // 恢复保存的位置
        if (chat.watchTogetherSettings && chat.watchTogetherSettings.position) {
          chatFloat.style.top = chat.watchTogetherSettings.position.top;
          chatFloat.style.left = chat.watchTogetherSettings.position.left;
          chatFloat.style.transform = '';
        }
      }, 100);

      renderWatchTogetherMessages();
    });

    // 关闭观影界面
    document.getElementById('close-watch-together-btn').addEventListener('click', () => {
      stopWatchTogether();
    });

    // 上传按钮
    document.getElementById('watch-together-upload-btn').addEventListener('click', () => {
      document.getElementById('watch-together-upload-modal').classList.add('visible');
    });

    // 本地上传
    document.getElementById('watch-together-upload-local').addEventListener('click', () => {
      document.getElementById('watch-together-file-input').click();
      document.getElementById('watch-together-upload-modal').classList.remove('visible');
    });

    // URL上传
    document.getElementById('watch-together-upload-url').addEventListener('click', () => {
      document.getElementById('watch-together-upload-modal').classList.remove('visible');
      document.getElementById('watch-together-url-modal').classList.add('visible');
    });

    // 在线搜索
    const searchOnlineBtn = document.getElementById('watch-together-search-online');
    if (searchOnlineBtn) {
      searchOnlineBtn.addEventListener('click', () => {
        console.log('点击了在线搜索按钮');
        document.getElementById('watch-together-upload-modal').classList.remove('visible');
        document.getElementById('watch-together-search-modal').classList.add('visible');
      });
    } else {
      console.error('找不到在线搜索按钮');
    }

    // 取消上传
    document.getElementById('cancel-watch-together-upload-btn').addEventListener('click', () => {
      document.getElementById('watch-together-upload-modal').classList.remove('visible');
    });

    // 文件选择
    document.getElementById('watch-together-file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        loadWatchTogetherVideo(file);
      }
    });

    // URL确认
    document.getElementById('confirm-watch-together-url-btn').addEventListener('click', () => {
      const url = document.getElementById('watch-together-url-input').value.trim();
      if (url) {
        loadWatchTogetherVideoFromUrl(url);
        document.getElementById('watch-together-url-modal').classList.remove('visible');
        document.getElementById('watch-together-url-input').value = '';
      }
    });

    // 取消URL
    document.getElementById('cancel-watch-together-url-btn').addEventListener('click', () => {
      document.getElementById('watch-together-url-modal').classList.remove('visible');
    });

    // 取消搜索
    const cancelSearchBtn = document.getElementById('cancel-watch-together-search-btn');
    if (cancelSearchBtn) {
      cancelSearchBtn.addEventListener('click', () => {
        document.getElementById('watch-together-search-modal').classList.remove('visible');
      });
    }

    // 搜索按钮
    const searchBtn = document.getElementById('watch-together-search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        const keyword = document.getElementById('watch-together-search-input').value.trim();
        if (keyword) {
          searchMovies(keyword);
        }
      });
    }

    // 搜索框回车
    const watchTogetherSearchInput = document.getElementById('watch-together-search-input');
    if (watchTogetherSearchInput) {
      watchTogetherSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const keyword = e.target.value.trim();
          if (keyword) {
            searchMovies(keyword);
          }
        }
      });
    }

    // 播放列表按钮
    document.getElementById('watch-together-playlist-btn').addEventListener('click', () => {
      openPlaylist();
    });

    // 关闭播放列表
    document.getElementById('close-watch-together-playlist-btn').addEventListener('click', () => {
      document.getElementById('watch-together-playlist-modal').classList.remove('visible');
    });

    document.getElementById('cancel-watch-together-playlist-btn').addEventListener('click', () => {
      document.getElementById('watch-together-playlist-modal').classList.remove('visible');
    });

    // 保存视频到播放列表
    document.getElementById('confirm-save-video-btn').addEventListener('click', () => {
      saveVideoToPlaylist();
    });

    document.getElementById('cancel-save-video-btn').addEventListener('click', () => {
      document.getElementById('watch-together-save-video-modal').classList.remove('visible');
    });

    // 设置按钮
    document.getElementById('watch-together-settings-btn').addEventListener('click', () => {
      loadWatchTogetherSettings();
      document.getElementById('watch-together-settings-modal').classList.add('visible');
    });

    // 语音API选择
    document.getElementById('watch-together-speech-api-select').addEventListener('change', (e) => {
      const whisperConfig = document.getElementById('watch-together-whisper-config');
      whisperConfig.style.display = e.target.value === 'whisper' ? 'block' : 'none';
    });

    // 保存设置
    document.getElementById('save-watch-together-settings-btn').addEventListener('click', () => {
      saveWatchTogetherSettings();
      document.getElementById('watch-together-settings-modal').classList.remove('visible');
    });

    // 取消设置
    document.getElementById('cancel-watch-together-settings-btn').addEventListener('click', () => {
      document.getElementById('watch-together-settings-modal').classList.remove('visible');
    });

    // 重置位置按钮
    document.getElementById('reset-watch-together-position-btn').addEventListener('click', () => {
      const chat = state.chats[watchTogetherState.chatId];
      if (!chat) return;
      
      // 清除保存的位置
      if (chat.watchTogetherSettings) {
        delete chat.watchTogetherSettings.position;
        db.chats.put(chat);
      }
      
      // 重置对话框到默认位置（居中）
      const chatFloat = document.getElementById('watch-together-chat-float');
      if (chatFloat) {
        chatFloat.style.top = '50%';
        chatFloat.style.left = '50%';
        chatFloat.style.transform = 'translate(-50%, -50%)';
      }
      
      alert('对话框位置已重置到默认位置！');
    });

    // 聊天框收起/展开
    document.getElementById('watch-together-chat-toggle').addEventListener('click', () => {
      const chatFloat = document.getElementById('watch-together-chat-float');
      const isMinimized = chatFloat.classList.contains('minimized');

      if (isMinimized) {
        chatFloat.classList.remove('minimized');
        document.getElementById('watch-together-chat-toggle').textContent = '-';
      } else {
        chatFloat.classList.add('minimized');
        document.getElementById('watch-together-chat-toggle').textContent = '+';
      }
    });

    // 发送消息
    document.getElementById('watch-together-chat-send').addEventListener('click', () => {
      sendWatchTogetherUserMessage();
    });

    // 调用API
    document.getElementById('watch-together-call-api-btn').addEventListener('click', () => {
      callWatchTogetherAPI();
    });

    // 回车发送
    document.getElementById('watch-together-chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendWatchTogetherUserMessage();
      }
    });

    // 加载视频（本地文件）
    function loadWatchTogetherVideo(file, skipSavePrompt = false) {
      const video = document.getElementById('watch-together-video');
      const placeholder = document.getElementById('watch-together-placeholder');

      const url = URL.createObjectURL(file);
      video.src = url;
      video.style.display = 'block';
      placeholder.style.display = 'none';

      watchTogetherState.videoUrl = url;
      watchTogetherState.corsWarningShown = false; // 重置跨域警告

      // 存储当前视频信息，用于保存到播放列表
      watchTogetherState.currentVideoFile = file;
      watchTogetherState.currentVideoUrl = null;

      // 开始监听
      startWatchTogetherMonitoring();

      addWatchTogetherSystemMessage('视频已加载，开始观看');

      // 提示用户是否保存到播放列表
      if (!skipSavePrompt) {
        setTimeout(() => {
          promptSaveVideoToPlaylist(file.name);
        }, 1000);
      }
    }

    // 加载视频（URL）
    function loadWatchTogetherVideoFromUrl(url, skipSavePrompt = false) {
      const video = document.getElementById('watch-together-video');
      const placeholder = document.getElementById('watch-together-placeholder');

      // 销毁之前的 HLS 实例
      if (watchTogetherState.hlsInstance) {
        watchTogetherState.hlsInstance.destroy();
        watchTogetherState.hlsInstance = null;
      }

      video.style.display = 'block';
      placeholder.style.display = 'none';

      watchTogetherState.videoUrl = url;
      watchTogetherState.corsWarningShown = false;
      watchTogetherState.currentVideoFile = null;
      watchTogetherState.currentVideoUrl = url;

      const isHls = /\.m3u8(\?|$)/i.test(url);

      if (isHls && typeof Hls !== 'undefined' && Hls.isSupported()) {
        // Android / Chrome 等不原生支持 HLS 的浏览器，用 hls.js
        const hls = new Hls({
          xhrSetup: function(xhr) {
            // 不设置 withCredentials，避免 CORS 问题
          }
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.error('[一起看电影] HLS 致命错误:', data.type, data.details);
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              addWatchTogetherSystemMessage('视频加载失败，尝试重新连接...');
              hls.startLoad();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              addWatchTogetherSystemMessage('媒体解码错误，尝试恢复...');
              hls.recoverMediaError();
            } else {
              addWatchTogetherSystemMessage('视频播放失败，该播放源可能不可用');
              hls.destroy();
              watchTogetherState.hlsInstance = null;
            }
          }
        });
        watchTogetherState.hlsInstance = hls;
        // hls.js 管理 crossOrigin，不需要手动设置
        video.removeAttribute('crossorigin');
      } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
        // iOS Safari 原生支持 HLS
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(() => {});
        }, { once: true });
      } else {
        // 普通视频文件（mp4 等）
        video.crossOrigin = 'anonymous';
        video.src = url;

        // 如果设置 crossOrigin 后加载失败，去掉 crossOrigin 重试
        video.onerror = () => {
          if (video.crossOrigin) {
            console.warn('[一起看电影] 跨域加载失败，去掉 crossOrigin 重试');
            video.removeAttribute('crossorigin');
            video.src = url;
            video.onerror = null; // 避免无限重试
          }
        };
      }

      // 开始监听
      startWatchTogetherMonitoring();

      addWatchTogetherSystemMessage('视频已加载，开始观看');

      // 提示用户是否保存到播放列表
      if (!skipSavePrompt) {
        setTimeout(() => {
          const urlParts = url.split('/');
          const fileName = urlParts[urlParts.length - 1] || '在线视频';
          promptSaveVideoToPlaylist(fileName);
        }, 1000);
      }
    }

    // ========== 播放列表功能 ==========

    // 提示保存视频到播放列表
    async function promptSaveVideoToPlaylist(defaultName) {
      const result = await showCustomConfirm('保存到播放列表', '是否将当前视频保存到播放列表？');
      if (result) {
        openSaveVideoModal(defaultName);
      }
    }

    // 打开保存视频对话框
    function openSaveVideoModal(defaultName) {
      const input = document.getElementById('watch-together-video-name-input');
      input.value = defaultName.replace(/\.[^/.]+$/, ''); // 移除文件扩展名
      document.getElementById('watch-together-save-video-modal').classList.add('visible');
      input.focus();
    }

    // 保存视频到播放列表
    async function saveVideoToPlaylist() {
      const name = document.getElementById('watch-together-video-name-input').value.trim();
      if (!name) {
        await showCustomAlert('提示', '请输入视频名称');
        return;
      }

      const videoData = {
        name: name,
        timestamp: Date.now()
      };

      // 保存视频文件或URL
      if (watchTogetherState.currentVideoFile) {
        // 本地文件 - 转为base64存储
        const reader = new FileReader();
        reader.onload = async (e) => {
          videoData.data = e.target.result;
          videoData.type = 'file';
          await db.watchTogetherPlaylist.add(videoData);
          await showCustomAlert('成功', '视频已保存到播放列表');
          document.getElementById('watch-together-save-video-modal').classList.remove('visible');
        };
        reader.readAsDataURL(watchTogetherState.currentVideoFile);
      } else if (watchTogetherState.currentVideoUrl) {
        // URL
        videoData.data = watchTogetherState.currentVideoUrl;
        videoData.type = 'url';
        await db.watchTogetherPlaylist.add(videoData);
        await showCustomAlert('成功', '视频已保存到播放列表');
        document.getElementById('watch-together-save-video-modal').classList.remove('visible');
      } else {
        await showCustomAlert('错误', '未找到视频数据');
      }
    }

    // 打开播放列表
    async function openPlaylist() {
      await renderPlaylist();
      document.getElementById('watch-together-playlist-modal').classList.add('visible');
    }

    // 渲染播放列表
    async function renderPlaylist() {
      const listEl = document.getElementById('watch-together-playlist-list');
      const videos = await db.watchTogetherPlaylist.orderBy('timestamp').reverse().toArray();

      if (videos.length === 0) {
        listEl.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">暂无视频，上传视频后可保存到列表</p>';
        return;
      }

      listEl.innerHTML = videos.map(video => `
        <div class="playlist-item" data-id="${video.id}">
          <div class="playlist-item-info">
            <div class="playlist-item-name">${video.name}</div>
            <div class="playlist-item-time">${new Date(video.timestamp).toLocaleString()}</div>
            <div class="playlist-item-type">${video.type === 'file' ? '本地文件' : '在线视频'}</div>
          </div>
          <div class="playlist-item-actions">
            <button class="playlist-play-btn" onclick="playFromPlaylist(${video.id})">播放</button>
            <button class="playlist-delete-btn" onclick="deleteFromPlaylist(${video.id})">删除</button>
          </div>
        </div>
      `).join('');
    }

    // 从播放列表播放视频
    window.playFromPlaylist = async function (id) {
      const video = await db.watchTogetherPlaylist.get(id);
      if (!video) {
        await showCustomAlert('错误', '未找到视频');
        return;
      }

      document.getElementById('watch-together-playlist-modal').classList.remove('visible');

      if (video.type === 'file') {
        // 从base64恢复文件
        const response = await fetch(video.data);
        const blob = await response.blob();
        const file = new File([blob], video.name, { type: blob.type });
        loadWatchTogetherVideo(file, true);
      } else if (video.type === 'url') {
        loadWatchTogetherVideoFromUrl(video.data, true);
      }
    };

    // 从播放列表删除视频
    window.deleteFromPlaylist = async function (id) {
      const confirmed = await showCustomConfirm('确认删除', '确定要从播放列表中删除这个视频吗？');
      if (confirmed) {
        await db.watchTogetherPlaylist.delete(id);
        await renderPlaylist();
      }
    };

    // ========== 播放列表功能结束 ==========

    // 开始监听（截图+语音识别）
    function startWatchTogetherMonitoring() {
      const video = document.getElementById('watch-together-video');

      // 启动语音识别（如果启用）
      if (watchTogetherState.speechApi === 'whisper') {
        // 初始化音频上下文
        if (!watchTogetherState.audioContext) {
          watchTogetherState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // 创建音频源
        const source = watchTogetherState.audioContext.createMediaElementSource(video);
        const destination = watchTogetherState.audioContext.createMediaStreamDestination();
        source.connect(destination);
        source.connect(watchTogetherState.audioContext.destination);

        // 启动 Whisper 录音
        startWhisperRecording(destination.stream);
      } else if (watchTogetherState.speechApi === 'none') {
        console.log('已禁用语音识别');
      }

      // 启动截图定时器
      startCaptureTimer();
    }

    // Whisper录音
    function startWhisperRecording(stream) {
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        console.warn('浏览器不支持MediaRecorder');
        return;
      }

      const mediaRecorder = new MediaRecorder(stream);
      watchTogetherState.mediaRecorder = mediaRecorder;
      watchTogetherState.audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        watchTogetherState.audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(watchTogetherState.audioChunks, { type: 'audio/webm' });
        watchTogetherState.audioChunks = [];

        // 发送到Whisper API
        const transcript = await transcribeWithWhisper(audioBlob);
        if (transcript) {
          addWatchTogetherContextMessage('语音识别', transcript);
        }

        // 继续录制
        if (watchTogetherState.isActive && watchTogetherState.mediaRecorder) {
          watchTogetherState.audioChunks = [];
          watchTogetherState.mediaRecorder.start();
          setTimeout(() => {
            if (watchTogetherState.mediaRecorder && watchTogetherState.mediaRecorder.state === 'recording') {
              watchTogetherState.mediaRecorder.stop();
            }
          }, watchTogetherState.captureInterval * 1000);
        }
      };

      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, watchTogetherState.captureInterval * 1000);
    }

    // Whisper API转录
    async function transcribeWithWhisper(audioBlob) {
      try {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        formData.append('model', 'whisper-1');

        const response = await fetch(watchTogetherState.whisperUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${watchTogetherState.whisperKey}`
          },
          body: formData
        });

        if (!response.ok) {
          throw new Error('Whisper API调用失败');
        }

        const data = await response.json();
        return data.text;
      } catch (error) {
        console.error('Whisper转录失败:', error);
        return null;
      }
    }

    // 启动截图定时器
    function startCaptureTimer() {
      if (watchTogetherState.captureTimer) {
        clearInterval(watchTogetherState.captureTimer);
      }

      watchTogetherState.captureTimer = setInterval(() => {
        captureVideoFrame();
      }, watchTogetherState.captureInterval * 1000);
    }

    // 截取视频画面
    function captureVideoFrame() {
      const video = document.getElementById('watch-together-video');
      if (!video || video.paused) return;

      // 检查视频尺寸
      if (!video.videoWidth || !video.videoHeight) {
        console.warn('视频尺寸无效，跳过本次截图');
        return;
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        const imageData = canvas.toDataURL('image/jpeg', 0.6);
        const currentTime = formatVideoTime(video.currentTime);

        console.log(`✅ 视频截图已捕获: ${currentTime}, 大小: ${(imageData.length / 1024).toFixed(2)}KB`);
        addWatchTogetherContextMessage('视频截图', `[${currentTime}]`, imageData);
      } catch (error) {
        console.error('❌ 视频截图失败（可能是跨域限制）:', error.message);
        // 如果是第一次失败，给用户提示
        if (!watchTogetherState.corsWarningShown) {
          watchTogetherState.corsWarningShown = true;
          addWatchTogetherSystemMessage('⚠️ 视频截图功能受限，该视频源不支持内容识别');
        }
      }
    }

    // 格式化时间
    function formatVideoTime(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);

      if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      } else {
        return `${m}:${s.toString().padStart(2, '0')}`;
      }
    }

    // 添加系统消息
    function addWatchTogetherSystemMessage(text) {
      const messagesDiv = document.getElementById('watch-together-chat-messages');
      const msgDiv = document.createElement('div');
      msgDiv.className = 'watch-together-system-message';
      msgDiv.textContent = text;
      messagesDiv.appendChild(msgDiv);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // 添加上下文消息（不显示，但会发给AI）
    function addWatchTogetherContextMessage(type, content, imageData = null) {
      watchTogetherState.messages.push({
        role: 'system',
        type: type,
        content: content,
        imageData: imageData,
        timestamp: Date.now()
      });

      // 根据类型清理超出限制的历史记录
      if (type === '视频截图') {
        const screenshots = watchTogetherState.messages.filter(m => m.role === 'system' && m.type === '视频截图');
        if (screenshots.length > watchTogetherState.maxScreenshots) {
          // 找到最旧的截图并删除
          const oldestScreenshot = screenshots[0];
          const index = watchTogetherState.messages.indexOf(oldestScreenshot);
          if (index !== -1) {
            watchTogetherState.messages.splice(index, 1);
          }
        }
      } else if (type === '语音识别') {
        const audios = watchTogetherState.messages.filter(m => m.role === 'system' && m.type === '语音识别');
        if (audios.length > watchTogetherState.maxAudios) {
          // 找到最旧的语音并删除
          const oldestAudio = audios[0];
          const index = watchTogetherState.messages.indexOf(oldestAudio);
          if (index !== -1) {
            watchTogetherState.messages.splice(index, 1);
          }
        }
      }

      // 限制对话消息数量（用户和助手的消息）
      const dialogMessages = watchTogetherState.messages.filter(m => m.role === 'user' || m.role === 'assistant');
      if (dialogMessages.length > watchTogetherState.maxMessages) {
        // 找到最旧的对话消息并删除
        const oldestDialog = dialogMessages[0];
        const index = watchTogetherState.messages.indexOf(oldestDialog);
        if (index !== -1) {
          watchTogetherState.messages.splice(index, 1);
        }
      }
    }

    // 发送用户消息（不调用API）
    function sendWatchTogetherUserMessage() {
      const input = document.getElementById('watch-together-chat-input');
      const text = input.value.trim();

      if (!text) return;

      input.value = '';

      // 添加用户消息
      watchTogetherState.messages.push({
        role: 'user',
        content: text,
        timestamp: Date.now()
      });

      // 清理超出限制的对话消息
      const dialogMessages = watchTogetherState.messages.filter(m => m.role === 'user' || m.role === 'assistant');
      if (dialogMessages.length > watchTogetherState.maxMessages) {
        const oldestDialog = dialogMessages[0];
        const index = watchTogetherState.messages.indexOf(oldestDialog);
        if (index !== -1) {
          watchTogetherState.messages.splice(index, 1);
        }
      }

      renderWatchTogetherMessages();
    }

    // 调用API
    async function callWatchTogetherAPI() {
      if (!watchTogetherState.isActive) return;

      const chat = state.chats[watchTogetherState.chatId];
      const video = document.getElementById('watch-together-video');
      const isOnlineMode = watchTogetherState.mode === 'online';

      // 禁用按钮
      document.getElementById('watch-together-call-api-btn').disabled = true;
      document.getElementById('watch-together-chat-send').disabled = true;

      // 显示"正在输入中"
      const chatNameElement = document.getElementById('watch-together-chat-name');
      const originalName = chatNameElement.textContent;
      chatNameElement.textContent = '正在输入中...';

      try {
        const { proxyUrl, apiKey, model } = state.apiConfig;
        if (!proxyUrl || !apiKey || !model) {
          alert('请先在API设置中配置反代地址、密钥并选择模型。');
          return;
        }

        const currentTime = video.currentTime ? formatVideoTime(video.currentTime) : '0:00';
        const now = new Date();
        const selectedTimeZone = chat.settings.timeZone || 'Asia/Shanghai';
        const currentDateTime = now.toLocaleString('zh-CN', {
          timeZone: selectedTimeZone,
          dateStyle: 'full',
          timeStyle: 'short'
        });

        // 构建基础系统提示词
        let basePrompt = `# 核心任务
你正在和用户一起观看视频。当前时间：${currentDateTime}，视频播放时间：${currentTime}。

# 你的角色设定
${chat.settings.aiPersona}

# 用户的角色
${chat.settings.myPersona || '普通用户'}
`;

        // 世界书
        let worldBookContent = '';
        let allWorldBookIds = [...(chat.settings.linkedWorldBookIds || [])];
        state.worldBooks.forEach(wb => {
          if (wb.isGlobal && !allWorldBookIds.includes(wb.id)) {
            allWorldBookIds.push(wb.id);
          }
        });

        if (allWorldBookIds.length > 0) {
          const linkedContents = allWorldBookIds.map(bookId => {
            const worldBook = state.worldBooks.find(wb => wb.id === bookId);
            if (!worldBook || !Array.isArray(worldBook.content)) return '';

            const formattedEntries = worldBook.content
              .filter(entry => entry.enabled !== false)
              .map(entry => {
                let entryString = `\n### 条目: ${entry.comment || '无备注'}\n`;
                entryString += `**内容:**\n${entry.content}`;
                return entryString;
              }).join('');

            return formattedEntries ? `\n\n## 世界书: ${worldBook.name}\n${formattedEntries}` : '';
          }).filter(Boolean).join('');

          if (linkedContents) {
            worldBookContent = `# 世界书设定 (最高优先级)
以下内容是你所在世界的基础设定，你必须严格遵守。
${linkedContents}
`;
          }
        }

        // 长期记忆
        let longTermMemoryContext = '';
        if (chat.longTermMemory && chat.longTermMemory.length > 0) {
          longTermMemoryContext = `\n# 长期记忆 (最高优先级)\n`;
          longTermMemoryContext += chat.longTermMemory.map(mem => `- ${mem.content}`).join('\n');
          longTermMemoryContext += '\n';
        }

        // 挂载聊天记录
        let linkedMemoryContext = '';
        const memoryCount = chat.settings.linkedMemoryCount || 10;
        if (chat.settings.linkedMemoryChatIds && chat.settings.linkedMemoryChatIds.length > 0) {
          const idsToMount = chat.settings.linkedMemoryChatIds.filter(id => id !== watchTogetherState.chatId);

          if (idsToMount.length > 0) {
            linkedMemoryContext += `\n# 参考记忆 (其他聊天的记忆)\n`;

            for (const id of idsToMount) {
              const linkedChat = state.chats[id];
              if (!linkedChat) continue;

              const prefix = linkedChat.isGroup ? '[群聊]' : '[私聊]';
              linkedMemoryContext += `\n## ${prefix}"${linkedChat.name}"的记忆:\n`;

              const recentHistory = linkedChat.history.slice(-memoryCount);
              const filteredHistory = recentHistory.filter(msg => !String(msg.content).includes('已被用户删除'));

              if (filteredHistory.length > 0) {
                filteredHistory.forEach(msg => {
                  const sender = msg.role === 'user' ? (linkedChat.settings.myNickname || '我') : (msg.senderName || linkedChat.name);
                  let contentText = String(msg.content);
                  if (msg.type === 'ai_image' || msg.type === 'user_photo') {
                    contentText = `[发送了一张图片，描述为：${msg.content}]`;
                  } else if (msg.type === 'voice_message') {
                    contentText = `[发送了一条语音，内容是：${msg.content}]`;
                  }
                  linkedMemoryContext += `${sender}: ${contentText}\n`;
                });
              } else {
                linkedMemoryContext += "(暂无记录)\n";
              }
            }
          }
        }

        // 视频内容上下文
        let videoContext = '\n# 视频内容\n';

        // 最近的语音识别内容
        const recentSpeech = watchTogetherState.messages
          .filter(m => m.role === 'system' && m.type === '语音识别')
          .slice(-watchTogetherState.maxAudios);

        if (recentSpeech.length > 0) {
          videoContext += '## 视频中的对话（最近听到的）:\n';
          recentSpeech.forEach(s => {
            videoContext += `- ${s.content}\n`;
          });
        }

        // 最近的截图
        const recentScreenshots = watchTogetherState.messages
          .filter(m => m.role === 'system' && m.type === '视频截图')
          .slice(-watchTogetherState.maxScreenshots);

        if (recentScreenshots.length > 0) {
          videoContext += '\n## 视频画面（最近截图）:\n';
          recentScreenshots.forEach(s => {
            videoContext += `- ${s.content}\n`;
          });
        }

        // 组合完整系统提示
        let systemPrompt = basePrompt + worldBookContent + longTermMemoryContext + linkedMemoryContext + videoContext;

        // 根据模式添加格式指令
        if (isOnlineMode) {
          // 线上模式：使用JSON数组格式（和单聊一样）
          systemPrompt += `
# 【【【线上聊天模式 - 最高优先级铁律】】】

## 核心规则：
1. **这是真实的在线文字聊天**，就像QQ、微信一样。
2. **【绝对禁止】任何形式的"线下描写"**：
   - 禁止描写动作（如：*笑了笑*、*点点头*）
   - 禁止描写表情（如：她微笑着、他皱了皱眉）
   - 禁止描写环境（如：阳光洒在窗台上）
   - 禁止使用任何标点符号来表示动作（如：*、（）、【】等）
3. **你只能打字**，就像真人在手机上聊天一样。
4. 你可以用表情符号、网络用语、口语化表达，但**绝对不能**有任何"旁白"或"场景描写"。

## 输出格式铁律：
你的回复【必须】是一个JSON数组，数组中的每个元素代表你发送的一条消息。

### 可用的消息类型：
- **纯文字消息**: \`{"type": "text", "content": "你要打的字"}\`

### 正确示例：
\`\`\`json
[
  {"type": "text", "content": "哇这个镜头好美啊！"},
  {"type": "text", "content": "你注意到刚才那个细节了吗"},
  {"type": "text", "content": "我好喜欢这段"}
]
\`\`\`

### 错误示例（绝对禁止）：
❌ \`{"type": "text", "content": "*笑了笑* 确实很不错呢"}\`  
❌ \`{"type": "text", "content": "（歪头思考）嗯...这个地方..."}\`  
❌ \`{"type": "text", "content": "她露出了开心的笑容：这个..."}\`  

现在，请像真人在手机上聊天一样，纯文字打字回复用户。可以发多条消息。
`;
        } else {
          // 线下模式：单条文本
          systemPrompt += `
# 你的任务
请根据以上所有信息，结合视频内容自然地回复用户。你的回复必须符合你的人设，并体现出对视频内容的理解。
直接回复文本即可，不需要JSON格式。
`;
        }

        // 构建消息历史
        const maxMemory = watchTogetherState.maxMessages || 20;
        const historyMessages = watchTogetherState.messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .slice(-maxMemory)
          .map(m => ({
            role: m.role,
            content: m.content
          }));

        // 获取最新截图
        const latestScreenshot = watchTogetherState.messages
          .filter(m => m.role === 'system' && m.type === '视频截图' && m.imageData)
          .slice(-1)[0];

        // 如果有截图，把它附加到最后一条用户消息上（类似视频通话的方式）
        if (latestScreenshot && historyMessages.length > 0) {
          const lastUserMsgIndex = historyMessages.map((m, i) => m.role === 'user' ? i : -1).filter(i => i >= 0).pop();

          if (lastUserMsgIndex !== undefined) {
            const lastUserMsg = historyMessages[lastUserMsgIndex];
            // 将文本消息转换为多模态消息
            historyMessages[lastUserMsgIndex] = {
              role: 'user',
              content: [
                { type: 'text', text: typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '用户消息' },
                { type: 'image_url', image_url: { url: latestScreenshot.imageData } }
              ]
            };
            console.log(`📸 已将视频截图附加到用户消息: ${latestScreenshot.content}`);
          }
        } else if (latestScreenshot && historyMessages.length === 0) {
          // 如果没有历史消息，把截图作为第一条用户消息
          historyMessages.push({
            role: 'user',
            content: [
              { type: 'text', text: `当前视频画面 ${latestScreenshot.content}` },
              { type: 'image_url', image_url: { url: latestScreenshot.imageData } }
            ]
          });
          console.log(`📸 已将视频截图作为首条消息发送: ${latestScreenshot.content}`);
        } else {
          console.log('📭 暂无视频截图可发送');
        }

        const messagesPayload = [
          { role: 'system', content: systemPrompt },
          ...historyMessages
        ];

        // 调用API
        const apiResponse = await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: messagesPayload,
            temperature: state.globalSettings.apiTemperature || 0.8
          })
        });

        if (!apiResponse.ok) {
          const errorData = await apiResponse.json().catch(() => ({}));
          const errorMsg = errorData.error?.message || errorData.message || `HTTP ${apiResponse.status}`;
          throw new Error(`API调用失败: ${errorMsg}`);
        }

        const data = await apiResponse.json();
        let reply = data.choices[0].message.content.trim();

        // 移除可能的代码块标记
        reply = reply.replace(/^```json\s*/i, '').replace(/^```\s*/m, '').replace(/```\s*$/m, '');

        if (isOnlineMode) {
          // 线上模式：解析JSON数组，AI可以发送多条消息
          try {
            const parsed = JSON.parse(reply);
            if (Array.isArray(parsed)) {
              // 为每条消息添加到历史
              parsed.forEach(item => {
                if (item.type === 'text' && item.content) {
                  watchTogetherState.messages.push({
                    role: 'assistant',
                    content: item.content.trim(),
                    timestamp: Date.now()
                  });
                }
              });
            } else {
              // 如果不是数组，当作单条消息
              watchTogetherState.messages.push({
                role: 'assistant',
                content: reply,
                timestamp: Date.now()
              });
            }
          } catch (e) {
            // JSON解析失败，当作纯文本
            console.error('JSON解析失败:', e);
            watchTogetherState.messages.push({
              role: 'assistant',
              content: reply,
              timestamp: Date.now()
            });
          }
        } else {
          // 线下模式：直接添加单条文本消息
          // 尝试解析JSON格式（兼容某些模型可能返回JSON）
          try {
            const parsed = JSON.parse(reply);
            if (Array.isArray(parsed) && parsed[0]) {
              if (parsed[0].type === 'text' || parsed[0].type === 'offline_text') {
                reply = parsed[0].content;
              }
            }
          } catch (e) {
            // 保持原样
          }

          watchTogetherState.messages.push({
            role: 'assistant',
            content: reply,
            timestamp: Date.now()
          });
        }

        // 清理超出限制的对话消息
        const dialogMessages = watchTogetherState.messages.filter(m => m.role === 'user' || m.role === 'assistant');
        if (dialogMessages.length > watchTogetherState.maxMessages) {
          // 计算需要删除的数量
          const deleteCount = dialogMessages.length - watchTogetherState.maxMessages;
          for (let i = 0; i < deleteCount; i++) {
            const oldestDialog = watchTogetherState.messages.find(m => m.role === 'user' || m.role === 'assistant');
            const index = watchTogetherState.messages.indexOf(oldestDialog);
            if (index !== -1) {
              watchTogetherState.messages.splice(index, 1);
            }
          }
        }

        renderWatchTogetherMessages();

      } catch (error) {
        console.error('AI调用失败:', error);
        addWatchTogetherSystemMessage('AI调用失败：' + error.message);

        // 显示错误弹窗
        let errorDetail = error.message;
        if (error.message.includes('模型') || error.message.includes('vision') || error.message.includes('image')) {
          errorDetail += '\n\n提示：当前模型可能不支持视觉功能（图片识别）。建议使用支持视觉的模型，如：gpt-4o、claude-3、gemini-pro-vision 等。';
        }
        alert('观影AI调用失败\n\n' + errorDetail);
      } finally {
        // 恢复原名字
        const chat = state.chats[watchTogetherState.chatId];
        const chatNameElement = document.getElementById('watch-together-chat-name');
        if (chat) {
          chatNameElement.textContent = chat.name;
        }

        document.getElementById('watch-together-call-api-btn').disabled = false;
        document.getElementById('watch-together-chat-send').disabled = false;
      }
    }

    // 渲染消息
    function renderWatchTogetherMessages() {
      const messagesDiv = document.getElementById('watch-together-chat-messages');
      messagesDiv.innerHTML = '';

      const chat = state.chats[watchTogetherState.chatId];
      const defaultAvatar = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
      const userAvatar = chat.settings?.myAvatar || defaultAvatar;
      const aiAvatar = chat.settings?.aiAvatar || defaultAvatar;

      watchTogetherState.messages
        .filter(m => m.role !== 'system')
        .forEach(msg => {
          const msgDiv = document.createElement('div');
          msgDiv.className = `watch-together-message ${msg.role}`;

          const avatar = document.createElement('img');
          avatar.className = 'watch-together-message-avatar';
          avatar.src = msg.role === 'user' ? userAvatar : aiAvatar;

          const content = document.createElement('div');
          content.className = 'watch-together-message-content';
          content.textContent = msg.content;

          // 添加长按监听器
          addLongPressListener(content, () => showWatchTogetherMessageActions(msg.timestamp));

          msgDiv.appendChild(avatar);
          msgDiv.appendChild(content);
          messagesDiv.appendChild(msgDiv);
        });

      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // ========== 观影消息菜单 ==========
    let activeWatchTogetherMessageTimestamp = null;

    function showWatchTogetherMessageActions(timestamp) {
      activeWatchTogetherMessageTimestamp = timestamp;
      const message = watchTogetherState.messages.find(m => m.timestamp === timestamp);
      if (!message) return;

      document.getElementById('message-actions-modal').classList.add('visible');

      // 显示需要的按钮
      document.getElementById('edit-message-btn').style.display = 'block';
      document.getElementById('edit-message-btn').textContent = '编辑';
      document.getElementById('copy-message-btn').style.display = 'block';
      document.getElementById('recall-message-btn').style.display = 'block';
      document.getElementById('recall-message-btn').textContent = message.role === 'assistant' ? '重说' : '删除';

      // 隐藏不需要的按钮
      document.getElementById('copy-timestamp-btn').style.display = 'none';
      document.getElementById('translate-message-btn').style.display = 'none';
      document.getElementById('publish-to-announcement-btn').style.display = 'none';
      document.getElementById('quote-message-btn').style.display = 'none';
      document.getElementById('forward-message-btn').style.display = 'none';
      document.getElementById('select-message-btn').style.display = 'none';
    }

    function closeWatchTogetherMessageActions() {
      document.getElementById('message-actions-modal').classList.remove('visible');
      activeWatchTogetherMessageTimestamp = null;
      document.getElementById('recall-message-btn').textContent = '撤回';
    }

    function restoreNormalMessageActionsFromWatchTogether() {
      // 恢复所有正常消息菜单按钮的显示状态
      document.getElementById('edit-message-btn').style.display = 'block';
      document.getElementById('copy-message-btn').style.display = 'block';
      document.getElementById('copy-timestamp-btn').style.display = 'block';
      document.getElementById('translate-message-btn').style.display = 'block';
      document.getElementById('recall-message-btn').style.display = 'block';
      document.getElementById('quote-message-btn').style.display = 'block';
      document.getElementById('forward-message-btn').style.display = 'block';
      document.getElementById('select-message-btn').style.display = 'block';
      document.getElementById('recall-message-btn').textContent = '撤回';

      // 重置activeWatchTogetherMessageTimestamp
      activeWatchTogetherMessageTimestamp = null;
    }
    // ========== 观影消息菜单结束 ==========

    // 加载设置
    function loadWatchTogetherSettings() {
      const chat = state.chats[watchTogetherState.chatId];
      const settings = chat.watchTogetherSettings || {};

      document.getElementById('watch-together-mode-select').value = settings.mode || 'online';
      document.getElementById('watch-together-interval-input').value = settings.captureInterval || 5;
      document.getElementById('watch-together-speech-api-select').value = settings.speechApi || 'none';
      document.getElementById('watch-together-whisper-key').value = settings.whisperKey || '';
      document.getElementById('watch-together-whisper-url').value = settings.whisperUrl || 'https://api.openai.com/v1/audio/transcriptions';
      document.getElementById('watch-together-max-screenshots').value = settings.maxScreenshots || 10;
      document.getElementById('watch-together-max-audios').value = settings.maxAudios || 10;
      document.getElementById('watch-together-max-messages').value = settings.maxMessages || 20;

      const whisperConfig = document.getElementById('watch-together-whisper-config');
      whisperConfig.style.display = (settings.speechApi === 'whisper') ? 'block' : 'none';
    }

    // 保存设置
    async function saveWatchTogetherSettings() {
      const chat = state.chats[watchTogetherState.chatId];

      chat.watchTogetherSettings = {
        mode: document.getElementById('watch-together-mode-select').value,
        captureInterval: parseInt(document.getElementById('watch-together-interval-input').value) || 5,
        speechApi: document.getElementById('watch-together-speech-api-select').value,
        whisperKey: document.getElementById('watch-together-whisper-key').value,
        whisperUrl: document.getElementById('watch-together-whisper-url').value,
        maxScreenshots: parseInt(document.getElementById('watch-together-max-screenshots').value) || 10,
        maxAudios: parseInt(document.getElementById('watch-together-max-audios').value) || 10,
        maxMessages: parseInt(document.getElementById('watch-together-max-messages').value) || 20
      };

      watchTogetherState.mode = chat.watchTogetherSettings.mode;
      watchTogetherState.captureInterval = chat.watchTogetherSettings.captureInterval;
      watchTogetherState.speechApi = chat.watchTogetherSettings.speechApi;
      watchTogetherState.whisperKey = chat.watchTogetherSettings.whisperKey;
      watchTogetherState.whisperUrl = chat.watchTogetherSettings.whisperUrl;
      watchTogetherState.maxScreenshots = chat.watchTogetherSettings.maxScreenshots;
      watchTogetherState.maxAudios = chat.watchTogetherSettings.maxAudios;
      watchTogetherState.maxMessages = chat.watchTogetherSettings.maxMessages;

      // 重启监听
      if (watchTogetherState.videoUrl) {
        stopMonitoring();
        startWatchTogetherMonitoring();
      }

      // 保存到数据库
      await db.chats.put(chat);
    }

    // 停止监听
    function stopMonitoring() {
      if (watchTogetherState.captureTimer) {
        clearInterval(watchTogetherState.captureTimer);
        watchTogetherState.captureTimer = null;
      }

      if (watchTogetherState.speechRecognition) {
        watchTogetherState.speechRecognition.stop();
        watchTogetherState.speechRecognition = null;
      }

      if (watchTogetherState.mediaRecorder) {
        if (watchTogetherState.mediaRecorder.state === 'recording') {
          watchTogetherState.mediaRecorder.stop();
        }
        watchTogetherState.mediaRecorder = null;
      }

      if (watchTogetherState.audioContext) {
        watchTogetherState.audioContext.close();
        watchTogetherState.audioContext = null;
      }
    }

    // 停止观影
    function stopWatchTogether() {
      stopMonitoring();

      // 销毁 HLS 实例
      if (watchTogetherState.hlsInstance) {
        watchTogetherState.hlsInstance.destroy();
        watchTogetherState.hlsInstance = null;
      }

      const video = document.getElementById('watch-together-video');
      video.pause();
      video.removeAttribute('crossorigin');
      video.src = '';

      if (watchTogetherState.videoUrl && watchTogetherState.videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(watchTogetherState.videoUrl);
      }

      document.getElementById('watch-together-video').style.display = 'none';
      document.getElementById('watch-together-placeholder').style.display = 'block';
      document.getElementById('watch-together-modal').classList.remove('visible');

      // 恢复正常的消息菜单
      restoreNormalMessageActionsFromWatchTogether();

      watchTogetherState.isActive = false;
      watchTogetherState.videoUrl = null;
      watchTogetherState.messages = [];
    }

    // ========== 影视搜索功能 ==========

    // 资源站配置
    const movieApiSources = [
      {
        name: '最大资源',
        url: 'https://api.apibdzy.com/api.php/provide/vod/',
        params: { ac: 'detail', wd: '' }
      },
      {
        name: 'OK资源',
        url: 'https://cj.okzy.tv/inc/apijson_vod.php',
        params: { wd: '' }
      },
      {
        name: '量子资源',
        url: 'https://cj.lziapi.com/api.php/provide/vod/',
        params: { ac: 'detail', wd: '' }
      },
      {
        name: '非凡资源',
        url: 'https://cj.ffzyapi.com/api.php/provide/vod/',
        params: { ac: 'detail', wd: '' }
      },
      {
        name: '红牛资源',
        url: 'https://www.hongniuzy2.com/api.php/provide/vod/',
        params: { ac: 'detail', wd: '' }
      }
    ];

    // 搜索影视
    async function searchMovies(keyword) {
      const statusDiv = document.getElementById('watch-together-search-status');
      const resultsDiv = document.getElementById('watch-together-search-results');

      statusDiv.textContent = '正在搜索中...';
      resultsDiv.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">搜索中，请稍候...</div>';

      const searchBtn = document.getElementById('watch-together-search-btn');
      searchBtn.disabled = true;
      searchBtn.textContent = '搜索中...';

      const allResults = [];
      let successCount = 0;
      let failCount = 0;

      // 并发搜索所有资源站
      const searchPromises = movieApiSources.map(async (source) => {
        try {
          const params = new URLSearchParams({ ...source.params, wd: keyword });
          const url = `${source.url}?${params.toString()}`;

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();

          // 解析数据
          let movies = [];
          if (data.list && Array.isArray(data.list)) {
            movies = data.list;
          } else if (data.data && Array.isArray(data.data)) {
            movies = data.data;
          }

          // 为每个结果添加来源信息
          movies.forEach(movie => {
            movie._source = source.name;
          });

          successCount++;
          return movies;

        } catch (error) {
          console.error(`${source.name} 搜索失败:`, error);
          failCount++;
          return [];
        }
      });

      // 等待所有搜索完成
      const results = await Promise.all(searchPromises);
      results.forEach(movies => {
        allResults.push(...movies);
      });

      // 更新状态
      searchBtn.disabled = false;
      searchBtn.textContent = '搜索';

      if (allResults.length === 0) {
        statusDiv.textContent = `搜索完成：未找到"${keyword}"相关的影视资源 (成功:${successCount} 失败:${failCount})`;
        resultsDiv.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">未找到相关结果，请尝试其他关键词</div>';
        return;
      }

      statusDiv.textContent = `搜索完成：找到 ${allResults.length} 个结果 (成功:${successCount} 失败:${failCount})`;

      // 渲染搜索结果
      renderSearchResults(allResults);
    }

    // 渲染搜索结果
    function renderSearchResults(movies) {
      const resultsDiv = document.getElementById('watch-together-search-results');
      resultsDiv.innerHTML = '';

      movies.forEach(movie => {
        const movieCard = document.createElement('div');
        movieCard.style.cssText = 'border: 1px solid #e0e0e0; border-radius: 8px; padding: 15px; margin-bottom: 15px; cursor: pointer; transition: all 0.2s;';
        movieCard.addEventListener('mouseenter', () => {
          movieCard.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
          movieCard.style.borderColor = '#667eea';
        });
        movieCard.addEventListener('mouseleave', () => {
          movieCard.style.boxShadow = 'none';
          movieCard.style.borderColor = '#e0e0e0';
        });

        // 标题和来源
        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;';
        header.innerHTML = `
          <h3 style="margin: 0; font-size: 16px; color: #333;">${escapeHTML(movie.vod_name || movie.name || '未知影片')}</h3>
          <span style="background: #667eea; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${movie._source}</span>
        `;
        movieCard.appendChild(header);

        // 信息
        const info = document.createElement('div');
        info.style.cssText = 'color: #666; font-size: 13px; line-height: 1.6; margin-bottom: 10px;';
        const year = movie.vod_year || movie.year || '';
        const type = movie.type_name || movie.vod_class || movie.type || '';
        const area = movie.vod_area || movie.area || '';
        const actor = movie.vod_actor || movie.actor || '';
        const director = movie.vod_director || movie.director || '';

        let infoHtml = [];
        if (year) infoHtml.push(`年份: ${year}`);
        if (type) infoHtml.push(`类型: ${type}`);
        if (area) infoHtml.push(`地区: ${area}`);
        if (director) infoHtml.push(`导演: ${director}`);
        if (actor) infoHtml.push(`主演: ${actor.substring(0, 50)}${actor.length > 50 ? '...' : ''}`);

        info.innerHTML = infoHtml.join(' | ');
        movieCard.appendChild(info);

        // 播放按钮
        const playBtn = document.createElement('button');
        playBtn.textContent = '选择播放源';
        playBtn.style.cssText = 'background: #667eea; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 13px;';
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showPlaySources(movie);
        });
        movieCard.appendChild(playBtn);

        resultsDiv.appendChild(movieCard);
      });
    }

    // 显示播放源选择
    function showPlaySources(movie) {
      const resultsDiv = document.getElementById('watch-together-search-results');
      resultsDiv.innerHTML = '';

      // 返回按钮
      const backBtn = document.createElement('button');
      backBtn.innerHTML = '&lt; 返回搜索结果';
      backBtn.style.cssText = 'margin-bottom: 20px; padding: 8px 16px; background: #f0f0f0; border: none; border-radius: 4px; cursor: pointer;';
      backBtn.addEventListener('click', () => {
        const keyword = document.getElementById('watch-together-search-input').value.trim();
        if (keyword) searchMovies(keyword);
      });
      resultsDiv.appendChild(backBtn);

      // 影片信息
      const movieInfo = document.createElement('div');
      movieInfo.style.cssText = 'background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;';
      movieInfo.innerHTML = `
        <h2 style="margin: 0 0 10px 0; font-size: 18px;">${escapeHTML(movie.vod_name || movie.name || '未知影片')}</h2>
        <p style="margin: 0; color: #666; font-size: 13px; line-height: 1.6;">${escapeHTML(movie.vod_content || movie.content || movie.vod_blurb || '暂无简介')}</p>
      `;
      resultsDiv.appendChild(movieInfo);

      // 解析播放地址
      const playUrlStr = movie.vod_play_url || movie.play_url || movie.vod_url || '';
      if (!playUrlStr) {
        resultsDiv.innerHTML += '<div style="text-align: center; padding: 40px; color: #999;">该影片暂无可用播放源</div>';
        return;
      }

      // 解析播放源（格式: 播放组$名称$URL#名称$URL）
      const playGroups = playUrlStr.split('$$$');

      playGroups.forEach((group, groupIndex) => {
        const episodes = group.split('#').filter(ep => ep.trim());

        if (episodes.length === 0) return;

        const groupDiv = document.createElement('div');
        groupDiv.style.cssText = 'margin-bottom: 20px;';

        const groupTitle = document.createElement('h3');
        groupTitle.textContent = `播放源 ${groupIndex + 1}`;
        groupTitle.style.cssText = 'margin: 0 0 10px 0; font-size: 15px; color: #333;';
        groupDiv.appendChild(groupTitle);

        const episodesGrid = document.createElement('div');
        episodesGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px;';

        episodes.forEach(episode => {
          const parts = episode.split('$');
          const episodeName = parts[0] || '播放';
          const episodeUrl = parts[1] || parts[0];

          if (!episodeUrl) return;

          const episodeBtn = document.createElement('button');
          episodeBtn.textContent = episodeName;
          episodeBtn.style.cssText = 'padding: 10px; background: white; border: 1px solid #d0d0d0; border-radius: 4px; cursor: pointer; font-size: 13px; transition: all 0.2s;';
          episodeBtn.addEventListener('mouseenter', () => {
            episodeBtn.style.background = '#667eea';
            episodeBtn.style.color = 'white';
            episodeBtn.style.borderColor = '#667eea';
          });
          episodeBtn.addEventListener('mouseleave', () => {
            episodeBtn.style.background = 'white';
            episodeBtn.style.color = '#333';
            episodeBtn.style.borderColor = '#d0d0d0';
          });
          episodeBtn.addEventListener('click', () => {
            playMovieUrl(episodeUrl, `${movie.vod_name || movie.name} - ${episodeName}`);
          });

          episodesGrid.appendChild(episodeBtn);
        });

        groupDiv.appendChild(episodesGrid);
        resultsDiv.appendChild(groupDiv);
      });
    }

    // 播放影片
    function playMovieUrl(url, title) {
      console.log('准备播放:', url);

      // 关闭搜索弹窗
      document.getElementById('watch-together-search-modal').classList.remove('visible');

      // 加载视频
      loadWatchTogetherVideoFromUrl(url);

      // 显示提示
      addWatchTogetherSystemMessage(`正在加载: ${title}`);
    }

    // 添加系统消息
    function addWatchTogetherSystemMessage(text) {
      const messagesDiv = document.getElementById('watch-together-chat-messages');
      const msgDiv = document.createElement('div');
      msgDiv.style.cssText = 'text-align: center; color: #999; font-size: 12px; padding: 10px; margin: 5px 0;';
      msgDiv.textContent = text;
      messagesDiv.appendChild(msgDiv);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // ========== 影视搜索功能结束 ==========
    // ========== 一起看电影功能结束 ==========


    document.getElementById('add-quick-reply-btn').addEventListener('click', addNewQuickReply);



    document.getElementById('minimize-char-music-btn').addEventListener('click', minimizeCharMusicPlayer);


    document.getElementById('char-music-restore-btn').addEventListener('click', restoreCharMusicPlayer);


    makeDraggable(document.getElementById('char-music-restore-btn'), document.getElementById('char-music-restore-btn'));

    document.getElementById('imgbb-enable-switch').addEventListener('change', (e) => {
      document.getElementById('imgbb-settings-details').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('imgbb-key-toggle').addEventListener('click', function () {
      const input = document.getElementById('imgbb-api-key');
      if (input.type === 'password') {
        input.type = 'text';
        this.textContent = '😌';
      } else {
        input.type = 'password';
        this.textContent = '🧐';
      }
    });
    document.getElementById('catbox-enable-switch').addEventListener('change', (e) => {
      document.getElementById('catbox-settings-details').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('catbox-key-toggle').addEventListener('click', function () {
      const input = document.getElementById('catbox-userhash');
      if (input.type === 'password') {
        input.type = 'text';
        this.textContent = '😌';
      } else {
        input.type = 'password';
        this.textContent = '🧐';
      }
    });
    const biliSearchBtn = document.getElementById('char-bilibili-search-btn');
    if (biliSearchBtn) {
      biliSearchBtn.addEventListener('click', handleCharBilibiliSearch);
      console.log("B站搜索按钮已绑定"); // 调试日志
    } else {
      console.error("找不到B站搜索按钮 (char-bilibili-search-btn)，请检查HTML ID");
    }
    const regenBiliBtn = document.getElementById('regenerate-char-bilibili-btn');
    if (regenBiliBtn) {
      regenBiliBtn.addEventListener('click', handleGenerateSimulatedBilibili);
    }
    // 2. 绑定回车键搜索
    const biliInput = document.getElementById('char-bilibili-search-input');
    if (biliInput) {
      biliInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleCharBilibiliSearch();
      });
    }
    const ghSwitch = document.getElementById('github-enable-switch');
    if (ghSwitch) {
      ghSwitch.addEventListener('change', (e) => {
        document.getElementById('github-settings-details').style.display = e.target.checked ? 'block' : 'none';
      });
    }

    // GitHub 按钮功能绑定
    const ghUploadBtn = document.getElementById('github-upload-btn');
    if (ghUploadBtn) {
      const uploadHandler = () => uploadToGitHub(false);
      ghUploadBtn.addEventListener('click', uploadHandler);
      ghUploadBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        uploadHandler();
      }, { passive: false });
    }

    const ghUploadLargeBtn = document.getElementById('github-upload-large-btn');
    if (ghUploadLargeBtn) {
      const uploadLargeHandler = () => uploadToGitHubLargeData(false);
      ghUploadLargeBtn.addEventListener('click', uploadLargeHandler);
      ghUploadLargeBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        uploadLargeHandler();
      }, { passive: false });
    }

    const ghDownloadBtn = document.getElementById('github-download-btn');
    if (ghDownloadBtn) {
      ghDownloadBtn.addEventListener('click', restoreFromGitHub);
      ghDownloadBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        restoreFromGitHub();
      }, { passive: false });
    }
    const ghTokenToggle = document.getElementById('github-token-toggle');
    if (ghTokenToggle) {
      ghTokenToggle.addEventListener('click', function () {
        const input = document.getElementById('github-token');
        if (input.type === 'password') {
          input.type = 'text';
          this.textContent = '😌'; // 睁眼
        } else {
          input.type = 'password';
          this.textContent = '🧐'; // 闭眼
        }
      });
    }
    document.getElementById('toggle-reading-fullscreen-btn').addEventListener('click', toggleReadingFullscreen);

    // ========================================
    // ▼▼▼ 你画我猜功能（在DOMContentLoaded内部以访问state）▼▼▼
    // ========================================

    /**
     * 打开你画我猜App
     */
    function openDrawAndGuess() {
      // 重置所有UI到初始状态
      document.getElementById('draw-guess-interactive-area').style.display = 'none';
      document.getElementById('draw-guess-welcome-text').style.display = 'block';
      document.getElementById('draw-guess-studio').style.display = 'none';
      document.getElementById('draw-guess-bottom-bar').style.display = 'none';
      document.getElementById('start-draw-guess-game-btn').textContent = '开始游戏';
      document.getElementById('draw-guess-dialogue-box').textContent = '';
      document.getElementById('draw-guess-input').value = '';
      document.getElementById('draw-guess-action-bar').style.display = 'none';

      // 重置所有游戏状态
      drawGuessState.isActive = false;
      drawGuessState.partnerId = null;
      drawGuessState.history = [];
      drawGuessState.isAiResponding = false;
      drawGuessState.messageManager = { isOpen: false, mode: null, selectedTimestamps: new Set() };

      showScreen('draw-guess-screen');
    }

    // 挂载到全局对象，使HTML的onclick可以调用
    window.openDrawAndGuess = openDrawAndGuess;

    /**
     * 绘图板对象
     */
    const drawingBoard = {
      canvas: null,
      ctx: null,
      isDrawing: false,
      lastX: 0,
      lastY: 0,
      history: [],
      tool: 'pen',
      color: '#000000',
      brushSize: 5,
      penType: 'pen',

      init(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.history = [];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.saveState();
        this.addEventListeners();
      },

      addEventListeners() {
        this.handleDown = this.handleDown.bind(this);
        this.handleMove = this.handleMove.bind(this);
        this.handleUp = this.handleUp.bind(this);

        this.canvas.addEventListener('mousedown', this.handleDown);
        this.canvas.addEventListener('mousemove', this.handleMove);
        this.canvas.addEventListener('mouseup', this.handleUp);
        this.canvas.addEventListener('mouseleave', this.handleUp);

        this.canvas.addEventListener('touchstart', this.handleDown, { passive: false });
        this.canvas.addEventListener('touchmove', this.handleMove, { passive: false });
        this.canvas.addEventListener('touchend', this.handleUp);
      },

      getCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        return {
          x: clientX - rect.left,
          y: clientY - rect.top
        };
      },

      handleDown(e) {
        e.preventDefault();
        this.isDrawing = true;
        const { x, y } = this.getCoords(e);
        [this.lastX, this.lastY] = [x, y];
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
      },

      handleMove(e) {
        if (!this.isDrawing) return;
        e.preventDefault();
        const { x, y } = this.getCoords(e);
        this.drawLine(this.lastX, this.lastY, x, y);
        [this.lastX, this.lastY] = [x, y];
      },

      handleUp() {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        this.ctx.closePath();
        this.saveState();
      },

      drawLine(x1, y1, x2, y2) {
        this.ctx.beginPath();

        if (this.tool === 'eraser') {
          this.ctx.globalCompositeOperation = 'destination-out';
          this.ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
          this.ctx.globalCompositeOperation = 'source-over';
          this.ctx.strokeStyle = this.color;
        }

        this.ctx.lineWidth = this.brushSize;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        switch (this.penType) {
          case 'pencil':
            this.ctx.globalAlpha = 0.4;
            this.ctx.lineWidth = this.brushSize * 0.5;
            break;
          case 'watercolor':
            this.ctx.globalAlpha = 0.2;
            break;
          case 'brush':
            this.ctx.globalAlpha = 0.8;
            this.ctx.lineWidth = Math.random() * (this.brushSize - 2) + 2;
            break;
          case 'calligraphy':
            this.ctx.globalAlpha = 1;
            const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            this.ctx.lineWidth = Math.max(this.brushSize - distance / 2, 1);
            break;
          case 'pen':
          default:
            this.ctx.globalAlpha = 1;
            break;
        }

        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
        this.ctx.globalAlpha = 1.0;
      },

      saveState() {
        if (this.history.length >= 20) {
          this.history.shift();
        }
        this.history.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
      },

      undo() {
        if (this.history.length > 1) {
          this.history.pop();
          this.ctx.putImageData(this.history[this.history.length - 1], 0, 0);
        } else {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          this.history = [];
          this.saveState();
        }
      },

      setTool(tool) {
        this.tool = tool;
        document.getElementById('pen-settings').style.display = tool === 'pen' ? 'block' : 'none';
      },

      setColor(color) {
        this.color = color;
      },

      setSize(size) {
        this.brushSize = size;
      },

      setPenType(type) {
        this.penType = type;
      },

      clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.history = [];
        this.saveState();
      }
    };

    /**
     * 选择角色并开始游戏
     */
    async function setupDrawAndGuessSession(characterId) {
      if (!characterId) return;

      drawGuessState.isActive = true;
      drawGuessState.partnerId = characterId;
      drawGuessState.history = [];

      const chat = state.chats[characterId];
      if (!chat) return;

      const userAvatar = chat.settings.myAvatar || defaultAvatar;
      const userNickname = chat.settings.myNickname || '我';
      const charAvatar = chat.settings.aiAvatar || defaultAvatar;
      const charNickname = chat.name;

      document.getElementById('draw-guess-user-avatar').src = userAvatar;
      document.getElementById('draw-guess-user-name').textContent = userNickname;
      document.getElementById('draw-guess-char-avatar').src = charAvatar;
      document.getElementById('draw-guess-char-name').textContent = charNickname;

      document.getElementById('draw-guess-interactive-area').style.display = 'flex';
      document.getElementById('draw-guess-welcome-text').style.display = 'none';
      document.getElementById('draw-guess-bottom-bar').style.display = 'block';

      showScreen('draw-guess-screen');

      await triggerDrawAndGuessAiResponse(true);
      document.getElementById('draw-guess-action-bar').style.display = 'flex';
    }

    /**
     * 发送消息
     */
    function sendDrawGuessMessage() {
      const input = document.getElementById('draw-guess-input');
      const content = input.value.trim();
      if (!content || !drawGuessState.partnerId) return;

      const chat = state.chats[drawGuessState.partnerId];
      if (!chat) return;

      const userMessage = {
        sender: chat.settings.myNickname || '我',
        content: content,
        timestamp: Date.now()
      };

      drawGuessState.history.push(userMessage);
      appendDrawGuessMessage(userMessage);

      input.value = '';
      handleDrawGuessInput();
    }

    /**
     * 添加消息到对话框
     */
    function appendDrawGuessMessage(msg) {
      const dialogueBox = document.getElementById('draw-guess-dialogue-box');
      dialogueBox.removeAttribute('data-placeholder');

      const p = document.createElement('p');
      p.textContent = `${msg.sender}: ${msg.content}`;
      p.style.margin = '4px 0';
      p.style.color = 'var(--text-primary)';
      p.dataset.timestamp = msg.timestamp;
      dialogueBox.appendChild(p);
      dialogueBox.scrollTop = dialogueBox.scrollHeight;
      return p;
    }

    /**
     * 处理输入框变化
     */
    function handleDrawGuessInput() {
      const input = document.getElementById('draw-guess-input');
      const actionBar = document.getElementById('draw-guess-action-bar');
      if (input.value.trim()) {
        actionBar.style.display = 'flex';
      } else {
        actionBar.style.display = 'none';
      }
    }

    /**
     * 重说功能
     */
    async function handleDrawGuessResay() {
      const chat = state.chats[drawGuessState.partnerId];
      if (!chat) return;

      const userNickname = chat.settings.myNickname || '我';
      const lastAiMsgIndex = drawGuessState.history.findLastIndex(msg => msg.sender !== userNickname);

      if (lastAiMsgIndex === -1) {
        alert("还没有AI的回复可供重说。");
        return;
      }

      let firstAiMsgIndex = lastAiMsgIndex;
      while (firstAiMsgIndex > 0 && drawGuessState.history[firstAiMsgIndex - 1].sender !== userNickname) {
        firstAiMsgIndex--;
      }

      drawGuessState.history.splice(firstAiMsgIndex);

      const dialogueBox = document.getElementById('draw-guess-dialogue-box');
      dialogueBox.innerHTML = '';
      drawGuessState.history.forEach(appendDrawGuessMessage);
    }

    /**
     * AI绘画动画
     */
    async function playAiDrawingAnimation(paths) {
      const ctx = drawingBoard.ctx;
      if (!ctx) return;

      drawingBoard.canvas.classList.remove('active');
      drawingBoard.canvas.style.pointerEvents = 'none';

      for (const path of paths) {
        const points = path.points;
        if (!points || points.length < 2) continue;

        ctx.strokeStyle = path.color || '#000000';
        ctx.lineWidth = path.size || 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);

        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i][0], points[i][1]);
          ctx.stroke();
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        drawingBoard.saveState();
        await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));
      }

      drawingBoard.canvas.classList.add('active');
      drawingBoard.canvas.style.pointerEvents = 'auto';
    }

    /**
     * AI决定要画什么
     */
    async function decideAiDrawing(retryCount = 0) {
      if (retryCount > 2) {
        throw new Error("AI连续多次未能生成有效的绘画数据，请检查Prompt或API模型。");
      }

      const chat = state.chats[drawGuessState.partnerId];
      const { proxyUrl, apiKey, model } = state.apiConfig;

      const mainChatHistory = chat.history.slice(-5).map(msg => `${msg.role === 'user' ? (chat.settings.myNickname || '我') : chat.name}: ${String(msg.content)}`).join('\\n');
      const drawGuessHistory = drawGuessState.history.map(msg => `${msg.sender}: ${msg.content}`).join('\\n');

      const systemPrompt = `# 你的任务
你正在和用户玩"你画我猜"游戏，现在轮到你画画了。你的任务是：
1. 根据你的人设、你们的对话历史，想一个【简单、可以用几笔画出来】的物体或概念。
2. 将这个物体的绘画过程，描述成一个由坐标和颜色组成的JSON数据。

# 核心规则
1. **主题简单**: 必须选择非常简单的、能用几笔线条就勾勒出轮廓的物体。例如：苹果、太阳、爱心、鱼、猫的简笔画轮廓、房子。
2. **绘画简洁**: 整个绘画过程的【总笔画数（paths数组的长度）不能超过15笔】。
3. **格式铁律**: 你的回复【必须且只能】是一个JSON对象。格式如下:
{
  "topic": "你画的这个东西的中文名，例如：一只猫",
  "paths": [
    { "color": "#000000", "size": 3, "points": [[x1, y1], [x2, y2], [x3, y3]] },
    { "color": "#ff3b30", "size": 5, "points": [[x4, y4], [x5, y5]] }
  ]
}

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- **你们在主聊天里的对话**: ${mainChatHistory || '无'}
- **你们在这个游戏里的对话**: ${drawGuessHistory || '无'}

现在，请构思一个简单的物体，并生成它的绘画路径JSON。`;

      let messagesForApi;
      if (retryCount > 0) {
        messagesForApi = [{ role: 'user', content: `你上次的回复格式不正确，请严格遵守"格式铁律"，只返回一个纯粹的JSON对象，不要添加任何额外的文字。现在请重新生成。` }];
      } else {
        messagesForApi = [{ role: 'user', content: "轮到你画了，请决定要画什么并给出绘画数据。" }];
      }

      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);

      const response = isGemini
        ? await fetch(geminiConfig.url, geminiConfig.data)
        : await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messagesForApi], temperature: 1.0, response_format: { "type": "json_object" } })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);
      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      try {
        const parsedJson = robustJsonParse(aiResponseContent);
        if (!parsedJson || !parsedJson.topic || !Array.isArray(parsedJson.paths)) {
          throw new Error('解析出的JSON缺少必要的topic或paths字段。');
        }
        return parsedJson;
      } catch (e) {
        console.error(`AI绘画数据解析失败 (第 ${retryCount + 1} 次尝试):`, e);
        console.error("AI原始返回内容:", aiResponseContent);
        return decideAiDrawing(retryCount + 1);
      }
    }

    /**
     * 轮到AI画画
     */
    async function handleAiTurnToDraw() {
      if (drawGuessState.isAiResponding) return;

      await showCustomAlert("请稍候...", "对方正在思考要画什么...");

      try {
        document.getElementById('draw-guess-welcome-text').style.display = 'none';
        document.getElementById('draw-guess-studio').style.display = 'flex';
        document.getElementById('drawing-canvas').classList.add('active');

        drawingBoard.ctx.clearRect(0, 0, drawingBoard.canvas.width, drawingBoard.canvas.height);
        drawingBoard.history = [];
        drawingBoard.saveState();

        const drawingData = await decideAiDrawing();
        if (!drawingData || !drawingData.paths) throw new Error("AI未能决定要画什么或返回了无效的绘画数据。");

        await playAiDrawingAnimation(drawingData.paths);

        await showCustomAlert("他画完啦！", "快在上面的对话框里猜猜看他画的是什么吧！");

        const hiddenMessageForAi = {
          role: 'system',
          content: `[系统提示：你刚刚画完了一幅关于"${drawingData.topic}"的画。现在轮到用户猜测了，请根据TA的猜测给出回应。]`,
          timestamp: Date.now(),
          isHidden: true
        };
        const chat = state.chats[drawGuessState.partnerId];
        chat.history.push(hiddenMessageForAi);
        await db.chats.put(chat);

      } catch (error) {
        console.error("AI绘画流程出错:", error);
        await showCustomAlert("出错了", `AI在绘画时遇到了问题: ${error.message}`);
        document.getElementById('draw-guess-studio').style.display = 'flex';
        document.getElementById('draw-guess-welcome-text').style.display = 'none';
      }
    }

    /**
     * AI出题功能
     */
    async function handleGetTopicFromAi() {
      if (!drawGuessState.partnerId) return;

      const chat = state.chats[drawGuessState.partnerId];
      const { proxyUrl, apiKey, model } = state.apiConfig;
      const userNickname = chat.settings.myNickname || '我';

      // 获取上下文信息
      const aiPersona = chat.settings.aiPersona || '一个友好的对话伙伴';
      const myPersona = chat.settings.myPersona || '用户';

      const worldBookContext = (chat.settings.linkedWorldBookIds || []).map(bookId =>
        state.worldBooks.find(wb => wb.id === bookId)
      ).filter(Boolean).map(book =>
        `## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`
      ).join('\n');

      const longTermMemory = chat.longTermMemory && chat.longTermMemory.length > 0
        ? chat.longTermMemory.map(mem => `- ${mem.content}`).join('\n')
        : '';

      const shortTermMemory = chat.history.slice(-10).map(msg =>
        `${msg.role === 'user' ? userNickname : chat.name}: ${String(msg.content)}`
      ).join('\n');

      let systemPrompt;
      if (drawGuessState.mode === 'online') {
        systemPrompt = `你现在扮演: ${chat.name}
你的人设: ${aiPersona}

用户名: ${userNickname}
用户人设: ${myPersona}

你正在通过【线上聊天】和${userNickname}玩"你画我猜"游戏。用户让你出一个绘画题目。

# 供你参考的上下文
世界观: ${worldBookContext || '（暂无）'}
长期记忆: ${longTermMemory || '（暂无）'}
最近对话: ${shortTermMemory || '（暂无）'}

# 要求
1. 给用户出一个简单的绘画题目（可以用简笔画画出来的物体或概念）
2. 用自然的线上聊天方式邀请TA画
3. 可以分成多条消息，每条不超过30字
4. 不要有任何线下动作描写

请直接回复你想说的内容，如果有多条消息用换行符分隔。格式例如：
"诶！"
"我想到一个简单的~"
"你来画一个苹果吧！"`;
      } else {
        systemPrompt = `你正在和${userNickname}玩"你画我猜"游戏。请给用户出一个简单的绘画题目（一个可以用简笔画画出来的物体或概念），并用一句话向TA发出邀请。

你的人设: ${aiPersona}
用户人设: ${myPersona}

供你参考的上下文:
世界观: ${worldBookContext || '（暂无）'}
长期记忆: ${longTermMemory || '（暂无）'}
最近对话: ${shortTermMemory || '（暂无）'}

请直接回复，格式例如："来，画一个苹果吧！"`;
      }

      const messagesForApi = [{ role: 'user', content: "请给我出个题吧" }];

      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);

      try {
        const response = isGemini
          ? await fetch(geminiConfig.url, geminiConfig.data)
          : await fetch(`${proxyUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messagesForApi] })
          });

        if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);
        const data = await response.json();
        const aiTopic = getGeminiResponseText(data);

        // 处理回复（线上模式支持多条消息）
        if (drawGuessState.mode === 'online') {
          const messages = aiTopic.split('\n').filter(msg => msg.trim());
          for (const msgContent of messages) {
            const aiMessage = {
              sender: chat.name,
              content: msgContent.trim(),
              timestamp: Date.now()
            };
            drawGuessState.history.push(aiMessage);
            appendDrawGuessMessage(aiMessage);
            if (messages.length > 1) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
        } else {
          const aiMessage = {
            sender: chat.name,
            content: aiTopic,
            timestamp: Date.now()
          };
          drawGuessState.history.push(aiMessage);
          appendDrawGuessMessage(aiMessage);
        }

      } catch (error) {
        console.error("AI出题失败:", error);
        await showCustomAlert("出题失败", `无法获取题目: ${error.message}`);
      }
    }

    /**
     * 触发AI响应
     */
    async function triggerDrawAndGuessAiResponse(isInitial = false, imageBase64 = null) {
      if (drawGuessState.isAiResponding || !drawGuessState.isActive || !drawGuessState.partnerId) return;

      drawGuessState.isAiResponding = true;

      const dialogueBox = document.getElementById('draw-guess-dialogue-box');
      if (dialogueBox.childElementCount === 0) {
        dialogueBox.setAttribute('data-placeholder', '对方正在思考...');
      }

      try {
        const { proxyUrl, apiKey, model } = state.apiConfig;
        if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');

        const chat = state.chats[drawGuessState.partnerId];
        const userNickname = chat.settings.myNickname || '我';

        // 构建更完整的上下文信息

        // 1. 双方人设
        const aiPersona = chat.settings.aiPersona || '一个友好的对话伙伴';
        const myPersona = chat.settings.myPersona || '用户';

        // 2. 世界书
        const worldBookContext = (chat.settings.linkedWorldBookIds || []).map(bookId =>
          state.worldBooks.find(wb => wb.id === bookId)
        ).filter(Boolean).map(book =>
          `## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`
        ).join('\n');

        // 3. 长期记忆
        const longTermMemory = chat.longTermMemory && chat.longTermMemory.length > 0
          ? chat.longTermMemory.map(mem => `- ${mem.content}`).join('\n')
          : '';

        // 4. 短期记忆（主聊天最近的对话）
        const shortTermMemory = chat.history.slice(-15).map(msg =>
          `${msg.role === 'user' ? userNickname : chat.name}: ${String(msg.content)}`
        ).join('\n');

        // 5. 挂载的聊天记录
        let linkedChatsContext = '';
        if (chat.settings.linkedChatIds && chat.settings.linkedChatIds.length > 0) {
          const linkedMemories = [];
          for (const linkedId of chat.settings.linkedChatIds) {
            const linkedChat = state.chats[linkedId];
            if (linkedChat && linkedChat.history.length > 0) {
              const recentMessages = linkedChat.history.slice(-5).map(msg =>
                `${msg.role === 'user' ? userNickname : linkedChat.name}: ${String(msg.content)}`
              ).join('\n');
              linkedMemories.push(`\n### 关联聊天记录（来自 ${linkedChat.name}）:\n${recentMessages}`);
            }
          }
          linkedChatsContext = linkedMemories.join('\n');
        }

        // 6. 游戏内对话历史
        const drawGuessHistory = drawGuessState.history.map(msg => `${msg.sender}: ${msg.content}`).join('\n');

        const canvasContentDescription = imageBase64 ? "(用户刚刚画完了一幅画，图片内容如下，请你猜测。)" : "(当前画板为空)";

        let systemPrompt;

        if (drawGuessState.mode === 'online') {
          // 线上模式：无线下描写，支持多条消息
          let finalInstruction;
          if (isInitial) {
            finalInstruction = '这是你们第一次在线上打开这个游戏。请你主动说几句话，比如打个招呼、表达对游戏的期待、或者提议游戏规则。';
          } else if (imageBase64) {
            finalInstruction = '用户刚刚在线上发来了一幅画。请你根据图片内容、你的人设和对话历史，开始你的猜测。你可以先描述你看到了什么，然后提出可能的答案。';
          } else {
            finalInstruction = '请根据对话历史自然回应。';
          }

          systemPrompt = `# 你的身份
你现在扮演: ${chat.name}
你的人设: ${aiPersona}

# 用户的身份
用户名: ${userNickname}
用户人设: ${myPersona}

# 当前情况
你正在通过【线上聊天】和${userNickname}玩"你画我猜"游戏。这是一个线上互动，你们不在同一个地点。
画板内容: ${canvasContentDescription}

# 【对话节奏铁律（至关重要！）】
你的回复【必须】模拟真人在线聊天的打字习惯。**绝对不要一次性发送一大段文字！** 你应该将你想说的话，拆分成【多条、简短的】消息来发送，每条消息最好不要超过30个字。这会让对话看起来更自然、更真实。

举例：
- ❌ 错误："哇！你画的这个真有意思，让我想想...这个圆圆的形状，还有上面的小点，会不会是一个苹果？不对，感觉更像是一个太阳呢！"
- ✅ 正确：
  消息1: "哇！你画的这个真有意思"
  消息2: "让我想想..."
  消息3: "这个圆圆的形状"
  消息4: "还有上面的小点"
  消息5: "会不会是一个苹果？"
  消息6: "不对，感觉更像是一个太阳呢！"

# 核心规则
1. **【线上场景】**: 你们在线上聊天，不在同一个地点。【禁止】出现任何线下见面的描写，如"走过来"、"拿起笔"、"看向你"等动作描述。
2. **【纯文字交流】**: 你只能通过文字表达，可以使用语气词、表情符号，但不能描述肢体动作或表情。
3. **【多条消息】**: 你的回复应该自然地拆分成多条消息，就像真人在线聊天时的节奏。

# 供你参考的上下文

## 世界观设定
${worldBookContext || '（暂无）'}

## 长期记忆（你们之间的重要记忆）
${longTermMemory || '（暂无）'}
${linkedChatsContext}

## 短期记忆（你们最近在主聊天的对话）
${shortTermMemory || '（暂无）'}

## 游戏内对话（本次游戏中的对话）
${drawGuessHistory || '（游戏刚开始）'}

# 你的任务
${finalInstruction}

请直接回复你想说的内容，将你的话自然地分成多条消息。每条消息之间用换行符（\n）分隔。不要加任何JSON格式或前缀后缀。`;
        } else {
          // 线下模式：保留原有的提示词（有线下描写）
          let finalInstruction;
          if (isInitial) {
            finalInstruction = '这是你们第一次打开这个游戏。请你主动说几句话，比如打个招呼、表达对游戏的期待、或者制定游戏规则，来开启这场游戏。';
          } else if (imageBase64) {
            finalInstruction = '用户刚刚画完了一幅画，图片内容已提供。请你根据图片内容、你的人设和对话历史，开始你的猜测。你的猜测过程应该像真人一样，可以先描述你看到了什么，然后提出可能的答案，可以是对的也可以是错的。';
          } else {
            finalInstruction = '请根据对话历史自然回应。';
          }

          systemPrompt = `# 你的身份
你现在扮演: ${chat.name}
你的人设: ${aiPersona}

# 用户的身份
用户名: ${userNickname}
用户人设: ${myPersona}

# 当前情况
你正在和${userNickname}玩"你画我猜"游戏。
画板内容: ${canvasContentDescription}

# 供你参考的上下文

## 世界观设定
${worldBookContext || '（暂无）'}

## 长期记忆（你们之间的重要记忆）
${longTermMemory || '（暂无）'}
${linkedChatsContext}

## 短期记忆（你们最近在主聊天的对话）
${shortTermMemory || '（暂无）'}

## 游戏内对话（本次游戏中的对话）
${drawGuessHistory || '（游戏刚开始）'}

# 你的任务
${finalInstruction}

请直接回复，不要加任何前缀或后缀。`;
        }

        let messagesForApi = imageBase64
          ? [{ role: 'user', content: [{ type: 'text', text: '你看我画了什么？' }, { type: 'image_url', image_url: { url: imageBase64 } }] }]
          : [{ role: 'user', content: drawGuessState.history.length > 0 ? drawGuessState.history[drawGuessState.history.length - 1].content : '开始游戏吧' }];

        // 如果配了识图API且有图片，先用识图API识别，再把描述发给主API
        const hasVisionApi = state.apiConfig.visionProxyUrl && state.apiConfig.visionApiKey && state.apiConfig.visionModel;
        if (hasVisionApi && imageBase64) {
          try {
            const visionProxyUrl = state.apiConfig.visionProxyUrl;
            const visionApiKey = state.apiConfig.visionApiKey;
            const visionModel = state.apiConfig.visionModel;
            const visionPrompt = '请详细描述这张画的内容，包括画面中的形状、颜色、物体等信息。';
            let imgDesc = '';
            const isVisionGemini = visionProxyUrl.includes('generativelanguage');
            if (isVisionGemini) {
              const base64Data = imageBase64.split(',')[1];
              const mimeTypeMatch = imageBase64.match(/^data:(.*);base64/);
              if (mimeTypeMatch && base64Data) {
                const vPayload = { contents: [{ parts: [{ text: visionPrompt }, { inline_data: { mime_type: mimeTypeMatch[1], data: base64Data } }] }] };
                const vResp = await fetch(`${visionProxyUrl}/${visionModel}:generateContent?key=${visionApiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vPayload) });
                if (vResp.ok) { const vData = await vResp.json(); imgDesc = getGeminiResponseText(vData) || ''; }
              }
            } else {
              const vPayload = { model: visionModel, messages: [{ role: 'user', content: [{ type: 'text', text: visionPrompt }, { type: 'image_url', image_url: { url: imageBase64 } }] }], max_tokens: 500 };
              const vResp = await fetch(`${visionProxyUrl}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${visionApiKey}` }, body: JSON.stringify(vPayload) });
              if (vResp.ok) { const vData = await vResp.json(); imgDesc = vData.choices?.[0]?.message?.content || ''; }
            }
            if (imgDesc) {
              messagesForApi = [{ role: 'user', content: `你看我画了什么？[画的内容：${imgDesc.trim()}]` }];
              console.log('[识图API] 画画猜猜图片已预处理为文字描述');
            }
          } catch (e) {
            console.warn('[识图API] 画画猜猜预处理失败，保留原始图片:', e);
          }
        }

        let isGemini = proxyUrl.includes('generativelanguage');
        let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);

        const response = isGemini
          ? await fetch(geminiConfig.url, geminiConfig.data)
          : await fetch(`${proxyUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messagesForApi] })
          });

        if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);
        const data = await response.json();
        const aiReply = getGeminiResponseText(data);

        // 处理AI回复
        if (drawGuessState.mode === 'online') {
          // 线上模式：拆分成多条消息
          const messages = aiReply.split('\n').filter(msg => msg.trim());

          for (const msgContent of messages) {
            const aiMessage = {
              sender: chat.name,
              content: msgContent.trim(),
              timestamp: Date.now()
            };
            drawGuessState.history.push(aiMessage);
            appendDrawGuessMessage(aiMessage);

            // 添加短暂延迟，模拟打字效果
            if (messages.length > 1) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
        } else {
          // 线下模式：保持原有逻辑（单条消息）
          const aiMessage = {
            sender: chat.name,
            content: aiReply,
            timestamp: Date.now()
          };
          drawGuessState.history.push(aiMessage);
          appendDrawGuessMessage(aiMessage);
        }

      } catch (error) {
        console.error("AI响应失败:", error);
        await showCustomAlert("AI响应失败", `无法获取回复: ${error.message}`);
      } finally {
        drawGuessState.isAiResponding = false;
        dialogueBox.removeAttribute('data-placeholder');
      }
    }

    /**
     * 提交画作让AI猜
     */
    async function submitDrawingToAi() {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCanvas.width = drawingBoard.canvas.width;
      tempCanvas.height = drawingBoard.canvas.height;
      tempCtx.fillStyle = '#FFFFFF';
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      if (drawingBoard.canvas.toDataURL() === tempCanvas.toDataURL()) {
        alert("画板上还没有内容哦，快来画点什么吧！");
        return;
      }

      const chat = state.chats[drawGuessState.partnerId];
      if (chat) {
        await showCustomAlert("提交成功", `已经把你的画作提交给"${chat.name}"了！\\nTA正在努力猜测中...`);
      }

      const drawingBase64 = drawingBoard.canvas.toDataURL('image/png');
      await triggerDrawAndGuessAiResponse(false, drawingBase64);

      drawingBoard.ctx.clearRect(0, 0, drawingBoard.canvas.width, drawingBoard.canvas.height);
      drawingBoard.history = [];
      drawingBoard.saveState();
      document.getElementById('start-draw-guess-game-btn').textContent = '提交画作';
    }

    /**
     * 打开消息管理弹窗
     */
    function openDrawGuessMessageManager(mode) {
      const modal = document.getElementById('draw-guess-message-manager-modal');
      const titleEl = document.getElementById('draw-guess-manager-title');
      const confirmBtn = document.getElementById('draw-guess-manager-confirm-btn');
      const listEl = document.getElementById('draw-guess-manager-list');
      listEl.innerHTML = '';

      titleEl.textContent = mode === 'edit' ? '选择要编辑的消息' : '选择要删除的消息';
      confirmBtn.textContent = mode === 'edit' ? '开始编辑' : '确认删除';
      confirmBtn.classList.toggle('btn-danger', mode === 'delete');

      drawGuessState.history.forEach(msg => {
        const item = document.createElement('div');
        item.className = 'contact-picker-item';
        item.dataset.timestamp = msg.timestamp;
        item.innerHTML = `
      <div class="checkbox"></div>
      <div class="info" style="display: block;">
        <p style="margin:0; font-weight:500;">${msg.sender}:</p>
        <p style="margin:0; color: #8a8a8a;">${msg.content.substring(0, 30)}...</p>
      </div>
    `;
        listEl.appendChild(item);
      });

      drawGuessState.messageManager.mode = mode;
      drawGuessState.messageManager.selectedTimestamps.clear();
      modal.classList.add('visible');
    }

    /**
     * 处理消息管理确认
     */
    async function handleMessageManagerConfirm() {
      const { mode, selectedTimestamps } = drawGuessState.messageManager;
      if (selectedTimestamps.size === 0) {
        alert("请至少选择一条消息。");
        return;
      }

      if (mode === 'delete') {
        drawGuessState.history = drawGuessState.history.filter(m => !selectedTimestamps.has(m.timestamp));
        const dialogueBox = document.getElementById('draw-guess-dialogue-box');
        dialogueBox.innerHTML = '';
        drawGuessState.history.forEach(appendDrawGuessMessage);
      } else if (mode === 'edit') {
        if (selectedTimestamps.size > 1) {
          alert("编辑模式下只能选择一条消息。");
          return;
        }
        const timestampToEdit = [...selectedTimestamps][0];
        const msgIndex = drawGuessState.history.findIndex(m => m.timestamp === timestampToEdit);
        if (msgIndex > -1) {
          const currentContent = drawGuessState.history[msgIndex].content;
          const newContent = await showCustomPrompt('编辑消息', '', currentContent, 'textarea');
          if (newContent !== null) {
            drawGuessState.history[msgIndex].content = newContent.trim();
            const dialogueBox = document.getElementById('draw-guess-dialogue-box');
            dialogueBox.innerHTML = '';
            drawGuessState.history.forEach(appendDrawGuessMessage);
          }
        }
      }

      document.getElementById('draw-guess-message-manager-modal').classList.remove('visible');
      drawGuessState.messageManager.selectedTimestamps.clear();
    }

    /**
     * 初始化"你画我猜"事件监听器
     */
    function initDrawAndGuessListeners() {
      // 设置按钮
      const settingsBtn = document.getElementById('draw-guess-settings-btn');
      if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
          // 打开设置弹窗
          const modal = document.getElementById('draw-guess-settings-modal');
          const onlineRadio = document.getElementById('draw-guess-mode-online');
          const offlineRadio = document.getElementById('draw-guess-mode-offline');

          // 设置当前选中的模式
          if (drawGuessState.mode === 'online') {
            onlineRadio.checked = true;
          } else {
            offlineRadio.checked = true;
          }

          modal.classList.add('visible');
        });
      }

      // 设置弹窗 - 保存按钮
      const settingsSaveBtn = document.getElementById('draw-guess-settings-save-btn');
      if (settingsSaveBtn) {
        settingsSaveBtn.addEventListener('click', () => {
          const onlineRadio = document.getElementById('draw-guess-mode-online');
          drawGuessState.mode = onlineRadio.checked ? 'online' : 'offline';

          document.getElementById('draw-guess-settings-modal').classList.remove('visible');
          console.log('游戏模式已切换为:', drawGuessState.mode);
        });
      }

      // 设置弹窗 - 取消按钮
      const settingsCancelBtn = document.getElementById('draw-guess-settings-cancel-btn');
      if (settingsCancelBtn) {
        settingsCancelBtn.addEventListener('click', () => {
          document.getElementById('draw-guess-settings-modal').classList.remove('visible');
        });
      }

      // 选择角色按钮
      const selectCharBtn = document.getElementById('draw-guess-select-char-btn');
      if (selectCharBtn) {
        selectCharBtn.addEventListener('click', async () => {
          const characters = Object.values(state.chats).filter(chat => !chat.isGroup);
          if (characters.length === 0) {
            alert("还没有可以一起玩的角色哦~");
            return;
          }

          const options = characters.map(char => ({ text: char.name, value: char.id }));
          const selectedId = await showChoiceModal('选择游戏伙伴', options);
          if (selectedId) {
            await setupDrawAndGuessSession(selectedId);
          }
        });
      }

      // 开始游戏/提交画作按钮
      const startBtn = document.getElementById('start-draw-guess-game-btn');
      if (startBtn) {
        startBtn.addEventListener('click', async () => {
          if (!drawGuessState.isActive) return;

          const btnText = startBtn.textContent;
          if (btnText === '开始游戏') {
            document.getElementById('draw-guess-studio').style.display = 'flex';
            document.getElementById('draw-guess-welcome-text').style.display = 'none';
            drawingBoard.init('drawing-canvas');
            document.getElementById('drawing-canvas').classList.add('active');
            startBtn.textContent = '提交画作';
          } else if (btnText === '提交画作') {
            await submitDrawingToAi();
          }
        });
      }

      // 发送消息按钮
      const sendBtn = document.getElementById('draw-guess-send-btn');
      if (sendBtn) {
        sendBtn.addEventListener('click', sendDrawGuessMessage);
      }

      // 输入框回车发送
      const input = document.getElementById('draw-guess-input');
      if (input) {
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') sendDrawGuessMessage();
        });
        input.addEventListener('input', handleDrawGuessInput);
      }

      // AI出题按钮
      const getTopicBtn = document.getElementById('draw-guess-get-topic-btn');
      if (getTopicBtn) {
        getTopicBtn.addEventListener('click', handleGetTopicFromAi);
      }

      // 轮到AI画画按钮
      const aiTurnBtn = document.getElementById('draw-guess-ai-turn-btn');
      if (aiTurnBtn) {
        aiTurnBtn.addEventListener('click', handleAiTurnToDraw);
      }

      // 颜色选择
      document.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
          document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
          dot.classList.add('active');
          const color = dot.dataset.color;
          drawingBoard.setColor(color);
          document.getElementById('custom-color-input').value = color;
        });
      });

      // 自定义颜色选择器
      const customColorInput = document.getElementById('custom-color-input');
      if (customColorInput) {
        customColorInput.addEventListener('change', (e) => {
          const color = e.target.value;
          drawingBoard.setColor(color);
          document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        });
      }

      // 工具按钮
      document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const tool = btn.dataset.tool;
          if (tool === 'undo') {
            drawingBoard.undo();
          } else if (tool === 'clear') {
            if (confirm('确定要清空画板吗？')) {
              drawingBoard.clearCanvas();
            }
          } else {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            drawingBoard.setTool(tool);
          }
        });
      });

      // 画笔大小
      const sizeSlider = document.getElementById('brush-size-slider');
      const sizeInput = document.getElementById('brush-size-input');
      if (sizeSlider && sizeInput) {
        sizeSlider.addEventListener('input', (e) => {
          const size = parseInt(e.target.value);
          sizeInput.value = size;
          drawingBoard.setSize(size);
        });
        sizeInput.addEventListener('change', (e) => {
          const size = parseInt(e.target.value);
          sizeSlider.value = size;
          drawingBoard.setSize(size);
        });
      }

      // 画笔类型
      const penTypeSelect = document.getElementById('pen-type-select');
      if (penTypeSelect) {
        penTypeSelect.addEventListener('change', (e) => {
          drawingBoard.setPenType(e.target.value);
        });
      }

      // 操作栏按钮
      const actionBar = document.getElementById('draw-guess-action-bar');
      if (actionBar) {
        actionBar.addEventListener('click', async (e) => {
          const btn = e.target.closest('.action-bar-btn');
          if (!btn) return;

          const action = btn.dataset.action;
          if (action === 'reply') {
            await triggerDrawAndGuessAiResponse();
          } else if (action === 'delete') {
            openDrawGuessMessageManager('delete');
          } else if (action === 'edit') {
            openDrawGuessMessageManager('edit');
          } else if (action === 'resay') {
            await handleDrawGuessResay();
          }
        });
      }

      // 消息管理弹窗
      const managerCancelBtn = document.getElementById('draw-guess-manager-cancel-btn');
      const managerConfirmBtn = document.getElementById('draw-guess-manager-confirm-btn');
      const managerSelectAll = document.getElementById('draw-guess-manager-select-all');

      if (managerCancelBtn) {
        managerCancelBtn.addEventListener('click', () => {
          document.getElementById('draw-guess-message-manager-modal').classList.remove('visible');
          drawGuessState.messageManager.selectedTimestamps.clear();
        });
      }

      if (managerConfirmBtn) {
        managerConfirmBtn.addEventListener('click', handleMessageManagerConfirm);
      }

      if (managerSelectAll) {
        managerSelectAll.addEventListener('change', (e) => {
          const isChecked = e.target.checked;
          document.querySelectorAll('#draw-guess-manager-list .contact-picker-item').forEach(item => {
            item.classList.toggle('selected', isChecked);
            const timestamp = parseFloat(item.dataset.timestamp);
            if (isChecked) {
              drawGuessState.messageManager.selectedTimestamps.add(timestamp);
            } else {
              drawGuessState.messageManager.selectedTimestamps.delete(timestamp);
            }
          });
        });
      }

      // 消息列表点击选择
      const managerList = document.getElementById('draw-guess-manager-list');
      if (managerList) {
        managerList.addEventListener('click', (e) => {
          const item = e.target.closest('.contact-picker-item');
          if (item) {
            const timestamp = parseFloat(item.dataset.timestamp);
            if (drawGuessState.messageManager.mode === 'edit') {
              document.querySelectorAll('#draw-guess-manager-list .contact-picker-item.selected').forEach(el => el.classList.remove('selected'));
              drawGuessState.messageManager.selectedTimestamps.clear();
            }
            item.classList.toggle('selected');
            if (drawGuessState.messageManager.selectedTimestamps.has(timestamp)) {
              drawGuessState.messageManager.selectedTimestamps.delete(timestamp);
            } else {
              drawGuessState.messageManager.selectedTimestamps.add(timestamp);
            }
          }
        });
      }
    }

    // 初始化你画我猜功能
    initDrawAndGuessListeners();

    // ▲▲▲ 你画我猜功能结束 ▲▲▲

    // 2. 绑定确认和取消按钮事件 (请将此段代码放在 init() 函数中，或者脚本底部的事件监听区域)
    document.addEventListener('DOMContentLoaded', () => {
      // ... 其他初始化代码 ...

      // 绑定亲属卡弹窗按钮
      const cancelBtn = document.getElementById('cancel-kinship-creation-btn');
      const confirmBtn = document.getElementById('confirm-kinship-creation-btn');
      const modal = document.getElementById('kinship-creation-modal');

      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          modal.classList.remove('visible');
        });
      }

      if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
          if (!selectedKinshipCharId) {
            return alert("请先选择一个绑定对象！");
          }

          const limitInput = document.getElementById('kinship-limit-input');
          const limit = parseFloat(limitInput.value);

          if (isNaN(limit) || limit <= 0) {
            return alert("请输入有效的额度！");
          }

          // 调用原有的发送逻辑
          await sendKinshipRequest(selectedKinshipCharId, limit);

          // 关闭弹窗
          modal.classList.remove('visible');

          // 如果当前不在该聊天，提示跳转
          if (state.activeChatId !== selectedKinshipCharId) {
            // sendKinshipRequest 内部已经处理了跳转或追加消息
          }
        });
      }
    });
    const kinshipCancelBtn = document.getElementById('cancel-kinship-creation-btn');
    if (kinshipCancelBtn) {
      // 先移除可能存在的旧监听器，防止重复
      const newCancelBtn = kinshipCancelBtn.cloneNode(true);
      kinshipCancelBtn.parentNode.replaceChild(newCancelBtn, kinshipCancelBtn);

      newCancelBtn.addEventListener('click', () => {
        document.getElementById('kinship-creation-modal').classList.remove('visible');
      });
    }

    // 绑定确认赠送/申请按钮
    const kinshipConfirmBtn = document.getElementById('confirm-kinship-creation-btn');
    if (kinshipConfirmBtn) {
      const newConfirmBtn = kinshipConfirmBtn.cloneNode(true);
      kinshipConfirmBtn.parentNode.replaceChild(newConfirmBtn, kinshipConfirmBtn);

      newConfirmBtn.addEventListener('click', async () => {
        if (!selectedKinshipCharId) {
          return alert("请先选择一个对象！");
        }

        const limitInput = document.getElementById('kinship-limit-input');
        const limit = parseFloat(limitInput.value);

        if (isNaN(limit) || limit <= 0) {
          return alert("请输入有效的额度（必须大于0）！");
        }

        // --- 新增：获取选择的类型 ---
        const typeRadio = document.querySelector('input[name="kinship-type"]:checked');
        const type = typeRadio ? typeRadio.value : 'grant'; // 默认为赠送

        // 调用发送逻辑，传入 type
        await sendKinshipRequest(selectedKinshipCharId, limit, type);

        document.getElementById('kinship-creation-modal').classList.remove('visible');

        const actionText = type === 'grant' ? "赠送" : "申请";
        await showCustomAlert(`${actionText}成功`, `亲属卡${actionText}已发送给对方。`);
      });
    }
    document.getElementById('char-wallet-content').addEventListener('click', async (e) => {
      if (e.target.classList.contains('unbind-kinship-btn')) {
        e.stopPropagation();
        const chatId = e.target.dataset.chatId;

        // 1. 先获取钱包数据，判断是谁给谁开的卡
        const wallet = await db.userWallet.get('main');
        const card = wallet?.kinshipCards?.find(c => c.chatId === chatId);

        if (!card) {
          // 卡不存在（可能数据错乱），给个默认提示
          alert("未找到该亲属卡记录");
          return;
        }

        // 2. 根据类型决定文案
        // 如果没有 type 字段（旧数据），默认认为是 'out' (我送TA)
        const isMyGift = (card.type === 'out' || !card.type);

        let title = "";
        let message = "";
        let confirmText = "";

        if (isMyGift) {
          title = "收回亲属卡";
          message = "确定要停止为 TA 买单吗？\n收回后，对方将无法再使用您的额度消费。";
          confirmText = "确认收回";
        } else {
          title = "退还亲属卡";
          message = "确定要解绑这张亲属卡吗？\n解绑后，您将无法再使用 TA 的额度消费。";
          confirmText = "确认退还";
        }

        const confirmed = await showCustomConfirm(
          title,
          message,
          { confirmButtonClass: 'btn-danger', confirmText: confirmText }
        );

        if (confirmed) {
          try {
            if (wallet && wallet.kinshipCards) {
              // 过滤掉当前角色的卡
              wallet.kinshipCards = wallet.kinshipCards.filter(c => c.chatId !== chatId);
              await db.userWallet.put(wallet);

              await showCustomAlert("成功", "亲属卡已解绑。");

              // 刷新界面
              renderCharWallet();

              // 3. 发送系统消息通知AI (根据方向不同，通知内容也不同)
              const chat = state.chats[chatId];
              if (chat) {
                let sysContent = "";
                if (isMyGift) {
                  sysContent = '[系统提示：用户已收回了给你的亲属卡额度，你无法再使用代付功能了。]';
                } else {
                  sysContent = '[系统提示：用户主动退还/解绑了你赠送的亲属卡，不再使用你的钱了。]';
                }

                chat.history.push({
                  role: 'system',
                  content: sysContent,
                  timestamp: Date.now(),
                  isHidden: true
                });
                await db.chats.put(chat);
              }
            }
          } catch (error) {
            console.error(error);
            alert("解绑失败");
          }
        }
      }
    });
    const alipayScreen = document.getElementById('alipay-screen');
    if (alipayScreen) {
      alipayScreen.addEventListener('click', async (e) => {
        // 检查点击的是不是解绑按钮
        if (e.target.classList.contains('alipay-unbind-btn')) {
          e.stopPropagation();

          const chatId = e.target.dataset.chatId;
          const chat = state.chats[chatId];
          const charName = chat ? chat.name : '该角色';

          // 1. 获取钱包数据判断方向
          const wallet = await db.userWallet.get('main');
          const card = wallet?.kinshipCards?.find(c => c.chatId === chatId);

          if (!card) return;

          // 2. 动态生成文案
          const isMyGift = (card.type === 'out' || !card.type);

          let title = "";
          let message = "";
          let confirmText = "";

          if (isMyGift) {
            title = "终止赠予";
            message = `确定要停止赠予“${charName}”亲属卡吗？\n解绑后，对方将无法再使用该额度。`;
            confirmText = "确认收回";
          } else {
            title = "解绑亲属卡";
            message = `确定要解绑“${charName}”赠送的亲属卡吗？\n解绑后，您将失去该消费额度。`;
            confirmText = "确认解绑";
          }

          const confirmed = await showCustomConfirm(
            title,
            message,
            { confirmButtonClass: 'btn-danger', confirmText: confirmText }
          );

          if (confirmed) {
            try {
              if (wallet && wallet.kinshipCards) {
                // 从数组中移除该卡片
                wallet.kinshipCards = wallet.kinshipCards.filter(c => c.chatId !== chatId);
                await db.userWallet.put(wallet);

                await showCustomAlert("成功", "已成功解绑亲属卡。");

                // 刷新支付宝界面
                openAlipayScreen();

                // 3. 通知 AI
                if (chat) {
                  let sysContent = "";
                  if (isMyGift) {
                    sysContent = '[系统提示：用户已在支付宝端单方面收回了给你的亲属卡授权。]';
                  } else {
                    sysContent = '[系统提示：用户已在支付宝端主动退还/解绑了你赠送的亲属卡。]';
                  }

                  chat.history.push({
                    role: 'system',
                    content: sysContent,
                    timestamp: Date.now(),
                    isHidden: true
                  });
                  await db.chats.put(chat);
                }
              }
            } catch (error) {
              console.error(error);
              alert("解绑操作失败");
            }
          }
        }
      });
    }
    document.getElementById('export-appearance-btn').addEventListener('click', exportAppearanceSettings);
    // --- To-Do List Events ---
    const todoBtn = document.getElementById('open-todo-list-btn');
    if (todoBtn) todoBtn.addEventListener('click', window.openTodoList);

    document.getElementById('todo-list-back-btn').addEventListener('click', () => showScreen('chat-interface-screen'));

    document.getElementById('todo-prev-day-btn').addEventListener('click', () => changeTodoDate(-1));

    document.getElementById('todo-next-day-btn').addEventListener('click', () => changeTodoDate(1));

    document.getElementById('add-todo-btn').addEventListener('click', () => openTodoEditor(null));

    document.getElementById('cancel-todo-editor-btn').addEventListener('click', () => {
      document.getElementById('todo-editor-modal').classList.remove('visible');
    });

    document.getElementById('save-todo-btn').addEventListener('click', saveTodo);
    const todoDateDisplay = document.getElementById('todo-current-date-display');
    if (todoDateDisplay) {
      // 1. 动态创建一个隐藏的 input[type="date"]
      const datePicker = document.createElement('input');
      datePicker.type = 'date';
      // 隐藏它，但保持可交互性
      datePicker.style.cssText = 'position:absolute; visibility:hidden; width:0; height:0; top:0; left:0;';
      todoDateDisplay.parentNode.appendChild(datePicker); // 插入到导航栏里

      // 2. 点击文字 -> 触发选择器
      todoDateDisplay.addEventListener('click', () => {
        // 将当前显示的日期同步给选择器
        datePicker.value = getTodoDateString(currentTodoDate);

        // 尝试弹出原生日期面板
        try {
          datePicker.showPicker(); // 现代浏览器 (Chrome 99+, Safari 15+)
        } catch (e) {
          datePicker.click(); // 旧版兼容
        }
      });

      // 3. 监听日期改变
      datePicker.addEventListener('change', (e) => {
        if (e.target.value) {
          // 解析 YYYY-MM-DD (避免直接 new Date() 带来的时区偏差问题)
          const [y, m, d] = e.target.value.split('-').map(Number);
          // 构造本地时间对象
          currentTodoDate = new Date(y, m - 1, d);

          // 刷新界面
          updateTodoDateDisplay();
          renderTodoList();
        }
      });
    }
    // 类型选择器点击事件
    const typeOptions = document.querySelectorAll('.todo-type-option');
    typeOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        typeOptions.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
      });
    });
    // --- 在 init() 函数内部的事件绑定区域添加 ---

    // 1. 长期记忆列表滚动监听
    const memoryListContainer = document.getElementById('memory-list-container');
    if (memoryListContainer) {
      memoryListContainer.addEventListener('scroll', () => {
        const { scrollTop, scrollHeight, clientHeight } = memoryListContainer;
        // 距离底部 50px 时触发加载
        if (scrollHeight - scrollTop <= clientHeight + 50) {
          loadMoreMemories();
        }
      });
    }

    // 2. 待办事项列表滚动监听
    const todoListContainer = document.getElementById('todo-list-container');
    if (todoListContainer) {
      todoListContainer.addEventListener('scroll', () => {
        const { scrollTop, scrollHeight, clientHeight } = todoListContainer;
        if (scrollHeight - scrollTop <= clientHeight + 50) {
          loadMoreTodos();
        }
      });
    }
    // 绑定邮箱底部按钮事件
    const deleteSelectedBtn = document.getElementById('mail-delete-selected-btn');
    if (deleteSelectedBtn) {
      deleteSelectedBtn.addEventListener('click', window.executeBatchDeleteEmails);
    }

    const selectAllBtn = document.getElementById('mail-select-all-btn');
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', window.handleSelectAllEmails);
    }
    document.getElementById('manage-rules-btn').addEventListener('click', toggleRuleManagementMode);
    document.getElementById('import-rules-btn').addEventListener('click', () => {
      document.getElementById('import-rules-input').click();
    });
    document.getElementById('import-rules-input').addEventListener('change', handleRulesImport);

    // 2. 底部操作栏按钮
    document.getElementById('select-all-rules-checkbox').addEventListener('change', handleSelectAllRules);
    document.getElementById('export-selected-rules-btn').addEventListener('click', exportSelectedRules);
    document.getElementById('delete-selected-rules-btn').addEventListener('click', deleteSelectedRules);
    // ... 在 init() 函数内 ...
    const redditSearchBtn = document.getElementById('char-reddit-search-btn');
    if (redditSearchBtn) {
      redditSearchBtn.addEventListener('click', () => {
        const query = document.getElementById('char-reddit-search-input').value.trim();
        handleRedditSearch(query);
      });
    }

    // 绑定回车搜索
    const redditInput = document.getElementById('char-reddit-search-input');
    if (redditInput) {
      redditInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const query = e.target.value.trim();
          handleRedditSearch(query);
        }
      });
    }
    const regenRedditBtn = document.getElementById('regenerate-char-reddit-btn');
    if (regenRedditBtn) {
      regenRedditBtn.addEventListener('click', handleGenerateSimulatedReddit);
    }
    document.getElementById('nai-preset-select').addEventListener('change', handleNaiPresetChange);
    document.getElementById('save-nai-preset-btn').addEventListener('click', () => handleSaveNaiPreset(false));
    document.getElementById('update-nai-preset-btn').addEventListener('click', () => handleSaveNaiPreset(true));
    document.getElementById('delete-nai-preset-btn').addEventListener('click', handleDeleteNaiPreset);
    document.getElementById('bind-nai-preset-btn').addEventListener('click', openNaiBindingModal);

    document.getElementById('save-nai-binding-btn').addEventListener('click', saveNaiBinding);
    document.getElementById('cancel-nai-binding-btn').addEventListener('click', () => {
      document.getElementById('nai-binding-modal').classList.remove('visible');
    });
    document.getElementById('manage-quick-reply-categories-btn').addEventListener('click', openQuickReplyCategoryManager);

    // 2. 绑定分类管理器内的按钮
    document.getElementById('add-new-quick-reply-category-btn').addEventListener('click', addNewQuickReplyCategory);
    document.getElementById('close-quick-reply-category-manager-btn').addEventListener('click', () => {
      document.getElementById('quick-reply-category-manager-modal').classList.remove('visible');
      renderQuickReplyList(true); // 关闭时刷新主列表的Tabs
    });
    // --- Sticker Batch Move (表情包批量移动) ---
    const stickerMoveBtn = document.getElementById('move-selected-stickers-btn');
    if (stickerMoveBtn) {
      stickerMoveBtn.addEventListener('click', executeBatchMoveStickers);
    }

    // --- Quick Reply Management (快捷回复管理) ---
    const batchQuickReplyBtn = document.getElementById('batch-quick-reply-btn');
    if (batchQuickReplyBtn) {
      batchQuickReplyBtn.addEventListener('click', toggleQuickReplyManagementMode);
    }

    const selectAllQuickRepliesCb = document.getElementById('select-all-quick-replies-checkbox');
    if (selectAllQuickRepliesCb) {
      selectAllQuickRepliesCb.addEventListener('change', handleSelectAllQuickReplies);
    }

    const moveQuickRepliesBtn = document.getElementById('move-selected-quick-replies-btn');
    if (moveQuickRepliesBtn) {
      moveQuickRepliesBtn.addEventListener('click', executeBatchMoveQuickReplies);
    }

    const deleteQuickRepliesBtn = document.getElementById('delete-selected-quick-replies-btn');
    if (deleteQuickRepliesBtn) {
      deleteQuickRepliesBtn.addEventListener('click', executeBatchDeleteQuickReplies);
    }

    // 暴露需要跨文件引用的函数到 window
    window.openDrawAndGuess = openDrawAndGuess;

};
