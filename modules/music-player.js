// ============================================================
// music-player.js
// 来源：script.js 第 19473~20210 + 31283~31535 + 38006~38870 行
//       以及散落的辅助函数（saveGlobalPlaylist、addMusicActionSystemMessage、
//       applyLyricsBarPosition、getLrcContent、togglePlaylistManagementMode、
//       handlePlaylistSelection 等）
// 功能：一起听、播放器 UI、歌单管理、播放控制、歌词解析/渲染、
//       多平台音乐搜索、添加歌曲、删除歌曲与账户歌单导入
// ============================================================

(function () {
  // 延迟获取全局变量 - 使用 Proxy 确保在访问时才从 window 获取
  // 这样可以避免模块加载时 init-and-state.js 还未执行导致的 undefined 问题
  const state = new Proxy({}, {
    get: (target, prop) => window.state?.[prop]
  });
  
  const musicState = new Proxy({}, {
    get: (target, prop) => window.musicState?.[prop],
    set: (target, prop, value) => {
      if (window.musicState) {
        window.musicState[prop] = value;
        return true;
      }
      return false;
    }
  });
  
  const audioPlayer = new Proxy({}, {
    get: (target, prop) => {
      const player = window.audioPlayer;
      if (!player) return undefined;
      const value = player[prop];
      return typeof value === 'function' ? value.bind(player) : value;
    },
    set: (target, prop, value) => {
      if (window.audioPlayer) {
        window.audioPlayer[prop] = value;
        return true;
      }
      return false;
    }
  });

  // 来源：script.js 第 3020~3060 行
  function applyLyricsBarPosition(chat) {
    const lyricsBar = document.getElementById('global-lyrics-bar');

    const settings = chat.settings.lyricsPosition || {
      vertical: 'top',
      horizontal: 'center',
      offset: 10
    };


    lyricsBar.style.top = 'auto';
    lyricsBar.style.bottom = 'auto';
    lyricsBar.style.left = 'auto';
    lyricsBar.style.right = 'auto';
    lyricsBar.style.transform = 'none';


    if (settings.vertical === 'top') {
      lyricsBar.style.top = `${settings.offset}px`;
    } else {
      lyricsBar.style.bottom = `${settings.offset}px`;
    }


    switch (settings.horizontal) {
      case 'left':
        lyricsBar.style.left = '15px';
        break;
      case 'right':
        lyricsBar.style.right = '15px';
        break;
      case 'center':
      default:
        lyricsBar.style.left = '50%';
        lyricsBar.style.transform = 'translateX(-50%)';
        break;
    }
  }

  // 来源：script.js 第 4212~4260 行
  async function getLrcContent() {

    const choice = await showChoiceModal('选择歌词导入方式', [{
      text: '📁 从本地文件 (.lrc)',
      value: 'file'
    },
    {
      text: '📋 直接粘贴歌词文本',
      value: 'paste'
    }
    ]);


    if (choice === 'file') {

      return new Promise(resolve => {
        const lrcInput = document.getElementById('lrc-upload-input');
        const lrcChangeHandler = (e) => {
          const lrcFile = e.target.files[0];
          if (lrcFile) {
            const reader = new FileReader();
            reader.onload = (readEvent) => resolve(readEvent.target.result);
            reader.onerror = () => resolve("");
            reader.readAsText(lrcFile);
          } else {
            resolve(null);
          }
          lrcInput.removeEventListener('change', lrcChangeHandler);
          lrcInput.value = '';
        };
        lrcInput.addEventListener('change', lrcChangeHandler, {
          once: true
        });
        lrcInput.click();
      });
    } else if (choice === 'paste') {

      const pastedText = await showCustomPrompt(
        '粘贴歌词',
        '请在此处粘贴完整的LRC格式歌词...',
        '',
        'textarea'
      );


      if (pastedText) {


        const formattedText = pastedText.replace(/\[/g, '\n[').trim();
        return formattedText;
      }
      return pastedText;


    } else {

      return null;
    }
  }

  // 来源：script.js 第 7588~7596 行
  async function saveGlobalPlaylist() {
    await db.musicLibrary.put({
      id: 'main',
      playlist: musicState.playlist,
      playlists: musicState.playlists,
      activePlaylistId: musicState.activePlaylistId
    });
  }

  // 来源：script.js 第 32842~32868 行
  function getMusicAwareChatIds() {
    if (!musicState.isActive) return [];
    const ids = musicState.multiSyncEnabled ? (musicState.syncedChatIds || []) : [musicState.activeChatId];
    return [...new Set(ids)].filter(id => !!state.chats[id]);
  }

  function isMusicAwareChat(chatId) {
    return getMusicAwareChatIds().includes(chatId);
  }

  function getMusicElapsedTime(chatId) {
    if (chatId === musicState.activeChatId) return musicState.totalElapsedTime;
    return musicState.syncedElapsedTimes?.[chatId] ?? state.chats[chatId]?.musicData?.totalTime ?? 0;
  }

  async function saveMusicSyncTimes() {
    for (const id of getMusicAwareChatIds()) {
      if (id === musicState.activeChatId) continue;
      const chat = state.chats[id];
      chat.musicData = chat.musicData || { totalTime: 0 };
      chat.musicData.totalTime = getMusicElapsedTime(id);
      await db.chats.put(chat);
    }
  }

  let musicSyncDraft = null;

  function closeMusicSyncSettings() {
    const modal = document.getElementById('music-sync-modal');
    if (!modal) return;
    modal.classList.remove('visible');
    musicSyncDraft = null;
    document.getElementById('music-sync-btn')?.focus();
  }

  function renderMusicSyncSettings() {
    if (!musicSyncDraft) return;
    const enabled = musicSyncDraft.enabled;
    document.getElementById('music-sync-enabled').checked = enabled;
    document.getElementById('music-sync-options').hidden = !enabled;
    const list = document.getElementById('music-sync-role-list');
    list.replaceChildren();
    const chats = Object.values(state.chats).filter(chat => !chat.isGroup || chat.id === musicState.activeChatId);
    for (const chat of chats) {
      const row = document.createElement('label');
      row.className = 'music-sync-role';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = chat.id;
      input.checked = musicSyncDraft.ids.has(chat.id);
      const avatar = document.createElement('img');
      avatar.src = chat.settings?.aiAvatar || defaultAvatar;
      avatar.alt = '';
      const name = document.createElement('span');
      name.textContent = chat.name || chat.originalName || '角色';
      name.title = name.textContent;
      row.append(input, avatar, name);
      list.appendChild(row);
    }
    document.getElementById('music-sync-count').textContent = `已选 ${chats.filter(chat => musicSyncDraft.ids.has(chat.id)).length} 位`;
    document.getElementById('music-sync-status').textContent = '';
  }

  async function applyMusicSyncSettings() {
    if (!musicSyncDraft || !musicState.isActive) return;
    const ids = [...musicSyncDraft.ids].filter(id => !!state.chats[id]);
    if (musicSyncDraft.enabled && !ids.length) {
      document.getElementById('music-sync-status').textContent = '请至少选择一个角色';
      return;
    }
    const ownerId = musicState.activeChatId;
    const draft = musicSyncDraft;
    const enabled = draft.enabled;
    const controls = document.getElementById('music-sync-modal').querySelectorAll('input, button');
    controls.forEach(control => { control.disabled = true; });
    try {
      if (musicState.multiSyncEnabled) await saveMusicSyncTimes();
      if (!musicState.isActive || musicState.activeChatId !== ownerId || musicSyncDraft !== draft) return;
      const elapsedTimes = musicState.syncedElapsedTimes || {};
      for (const id of ids) {
        if (id !== ownerId && elapsedTimes[id] === undefined) {
          elapsedTimes[id] = state.chats[id].musicData?.totalTime || 0;
        }
      }
      musicState.syncedElapsedTimes = elapsedTimes;
      musicState.syncedChatIds = ids;
      musicState.multiSyncEnabled = enabled;
      const syncBtn = document.getElementById('music-sync-btn');
      syncBtn.classList.toggle('active', enabled);
      syncBtn.setAttribute('aria-pressed', String(enabled));
      syncBtn.title = enabled ? `多人同步：${ids.length} 位角色` : '多人同步';
      updatePlayerUI();
      closeMusicSyncSettings();
    } catch (error) {
      console.error('[音乐同步] 保存失败:', error);
      document.getElementById('music-sync-status').textContent = '保存失败，请重试';
    } finally {
      controls.forEach(control => { control.disabled = false; });
    }
  }

  function openMusicSyncSettings() {
    if (!musicState.isActive) return;
    const modal = document.getElementById('music-sync-modal');
    if (!modal) return;
    if (!modal.dataset.bound) {
      modal.dataset.bound = 'true';
      document.getElementById('music-sync-enabled').addEventListener('change', e => {
        if (!musicSyncDraft) return;
        musicSyncDraft.enabled = e.target.checked;
        renderMusicSyncSettings();
      });
      document.getElementById('music-sync-role-list').addEventListener('change', e => {
        if (!musicSyncDraft || e.target.type !== 'checkbox') return;
        if (e.target.checked) musicSyncDraft.ids.add(e.target.value);
        else musicSyncDraft.ids.delete(e.target.value);
        document.getElementById('music-sync-count').textContent = `已选 ${[...musicSyncDraft.ids].filter(id => !!state.chats[id]).length} 位`;
        document.getElementById('music-sync-status').textContent = '';
      });
      document.getElementById('music-sync-select-all').addEventListener('click', () => {
        if (!musicSyncDraft?.enabled) return;
        musicSyncDraft.ids = new Set(Object.values(state.chats)
          .filter(chat => !chat.isGroup || chat.id === musicState.activeChatId).map(chat => chat.id));
        renderMusicSyncSettings();
      });
      document.getElementById('music-sync-clear-all').addEventListener('click', () => {
        if (!musicSyncDraft?.enabled) return;
        musicSyncDraft.ids.clear();
        renderMusicSyncSettings();
      });
      document.getElementById('music-sync-cancel-btn').addEventListener('click', closeMusicSyncSettings);
      document.getElementById('music-sync-apply-btn').addEventListener('click', applyMusicSyncSettings);
      modal.addEventListener('click', e => { if (e.target === modal) closeMusicSyncSettings(); });
      modal.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); closeMusicSyncSettings(); }
      });
    }
    musicSyncDraft = {
      enabled: !!musicState.multiSyncEnabled,
      ids: new Set(musicState.syncedChatIds || [musicState.activeChatId])
    };
    renderMusicSyncSettings();
    modal.classList.add('visible');
    document.getElementById('music-sync-enabled').focus();
  }

  async function addMusicActionSystemMessage(actionText, isUserAction = true) {

    for (const chatId of getMusicAwareChatIds()) {
      const chat = state.chats[chatId];


      const myNickname = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
      const fullMessage = isUserAction ? `[系统提示：用户 (${myNickname}) ${actionText}]` : `[系统提示：${actionText}]`;


      const systemMessage = {
        role: 'system',
        content: fullMessage,
        timestamp: Date.now(),
        isHidden: true
      };


      chat.history.push(systemMessage);
      await db.chats.put(chat);
    }
  }

  // ========== 主要音乐播放器功能（来自 script.js 第 19473~20210 行） ==========

  async function handleListenTogetherClick() {
    const targetChatId = state.activeChatId;
    if (!targetChatId) return;
    if (!musicState.isActive) {
      startListenTogetherSession(targetChatId);
      return;
    }
    if (musicState.activeChatId === targetChatId || isMusicAwareChat(targetChatId)) {
      document.getElementById('music-player-overlay').classList.add('visible');
    } else {
      const oldChatName = state.chats[musicState.activeChatId]?.name || '未知';
      const newChatName = state.chats[targetChatId]?.name || '当前';
      const confirmed = await showCustomConfirm('切换听歌对象', `您正和「${oldChatName}」听歌。要结束并开始和「${newChatName}」的新会话吗？`, {
        confirmButtonClass: 'btn-danger'
      });
      if (confirmed) {
        await endListenTogetherSession(true);
        await new Promise(resolve => setTimeout(resolve, 50));
        startListenTogetherSession(targetChatId);
      }
    }
  }

  async function startListenTogetherSession(chatId) {
    const chat = state.chats[chatId];
    if (!chat) return;
    musicState.totalElapsedTime = chat.musicData.totalTime || 0;
    musicState.isActive = true;
    musicState.activeChatId = chatId;
    musicState.multiSyncEnabled = false;
    musicState.syncedChatIds = [chatId];
    musicState.syncedElapsedTimes = {};
    const syncBtn = document.getElementById('music-sync-btn');
    if (syncBtn) {
      syncBtn.classList.remove('active');
      syncBtn.setAttribute('aria-pressed', 'false');
      syncBtn.title = '多人同步';
    }
    if (musicState.playlist.length > 0) {
      musicState.currentIndex = 0;
    } else {
      musicState.currentIndex = -1;
    }
    if (musicState.timerId) clearInterval(musicState.timerId);
    musicState.timerId = setInterval(() => {
      if (musicState.isPlaying) {
        const awareIds = getMusicAwareChatIds();
        if (awareIds.includes(chatId)) musicState.totalElapsedTime++;
        for (const id of awareIds) {
          if (id !== chatId) musicState.syncedElapsedTimes[id] = getMusicElapsedTime(id) + 1;
        }
        updateElapsedTimeDisplay();
      }
    }, 1000);
    updatePlayerUI();
    updatePlaylistUI();
    document.getElementById('music-player-overlay').classList.add('visible');
  }

  async function endListenTogetherSession(saveState = true) {
    if (!musicState.isActive) return;
    if (document.getElementById('music-sync-modal')?.classList.contains('visible')) closeMusicSyncSettings();
    const oldChatId = musicState.activeChatId;
    document.getElementById('global-lyrics-bar').classList.remove('visible');
    const cleanupLogic = async () => {
      if (musicState.timerId) clearInterval(musicState.timerId);
      if (musicState.isPlaying) audioPlayer.pause();
      if (saveState && musicState.multiSyncEnabled) await saveMusicSyncTimes();
      if (saveState && oldChatId && state.chats[oldChatId]) {
        const chat = state.chats[oldChatId];
        chat.musicData.totalTime = musicState.totalElapsedTime;
        await db.chats.put(chat);
      }
      musicState.isActive = false;
      musicState.multiSyncEnabled = false;
      musicState.syncedChatIds = [];
      musicState.syncedElapsedTimes = {};
      musicState.activeChatId = null;
      musicState.totalElapsedTime = 0;
      musicState.timerId = null;
      clearMusicMediaSession();
      updateListenTogetherIcon(oldChatId, true);
    };
    closeMusicPlayerWithAnimation(cleanupLogic);
  }

  function returnToChat() {
    closeMusicPlayerWithAnimation();
  }

  function updateListenTogetherIcon(chatId, forceReset = false) {
    const iconImg = document.querySelector('#listen-together-btn img');
    if (!iconImg) return;
    if (forceReset || !isMusicAwareChat(chatId)) {
      iconImg.src = 'https://i.postimg.cc/8kYShvrJ/90-UI-2.png';
      iconImg.className = '';
      return;
    }
    iconImg.src = 'https://i.postimg.cc/D0pq6qS2/E30078-DC-8-B99-4-C01-AFDA-74728-DBF7-BEA.png';
    iconImg.classList.add('rotating');
    if (musicState.isPlaying) iconImg.classList.remove('paused');
    else iconImg.classList.add('paused');
  }
  window.updateListenTogetherIconProxy = updateListenTogetherIcon;

  function updatePlayerUI() {
    updateListenTogetherIcon(musicState.multiSyncEnabled ? state.activeChatId : musicState.activeChatId);
    updateElapsedTimeDisplay();
    const titleEl = document.getElementById('music-player-song-title');
    const artistEl = document.getElementById('music-player-artist');
    const playPauseBtn = document.getElementById('music-play-pause-btn');
    if (musicState.currentIndex > -1 && musicState.playlist.length > 0) {
      const track = musicState.playlist[musicState.currentIndex];
      titleEl.textContent = track.name;
      artistEl.textContent = track.artist;
    } else {
      titleEl.textContent = '请添加歌曲';
      artistEl.textContent = '...';
    }
    if (playPauseBtn) {
      playPauseBtn.textContent = musicState.isPlaying ? '❚❚' : '▶';
    }
  }

  function updateElapsedTimeDisplay() {
    const hours = (musicState.totalElapsedTime / 3600).toFixed(1);
    document.getElementById('music-time-counter').textContent = `已经一起听了${hours}小时`;
  }

  function updateMusicMediaSession(track) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.name || '未知歌曲',
        artist: track.artist || '未知歌手',
        artwork: track.cover ? [{ src: String(track.cover).replace(/^http:\/\//i, 'https://') }] : []
      });
      navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
      navigator.mediaSession.setActionHandler('pause', () => audioPlayer.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
      navigator.mediaSession.setActionHandler('nexttrack', () => playNext(true));
    } catch (error) {
      console.warn('[音乐播放] 系统媒体控制不可用:', error.message);
    }
  }

  function clearMusicMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    } catch (_) {
      // Some browsers expose an incomplete Media Session implementation.
    }
  }

  function updatePlaylistUI() {
    const playlistBody = document.getElementById('playlist-body');
    playlistBody.innerHTML = '';

    // 渲染歌单标签栏
    renderPlaylistTabs();

    // 按当前歌单过滤
    const currentPlaylistId = musicState.activePlaylistId || 'default';
    const filteredSongs = musicState.playlist
      .map((track, originalIndex) => ({ track, originalIndex }))
      .filter(item => (item.track.playlistId || 'default') === currentPlaylistId);

    if (filteredSongs.length === 0) {
      playlistBody.innerHTML = '<p style="text-align:center; padding: 20px; color: #888;">播放列表是空的~</p>';
      return;
    }
    filteredSongs.forEach(({ track, originalIndex }) => {
      const item = document.createElement('div');
      item.className = 'playlist-item';
      if (originalIndex === musicState.currentIndex) item.classList.add('playing');

      item.dataset.index = originalIndex;

      const checkboxDisplay = isPlaylistManagementMode ? 'block' : 'none';

      item.innerHTML = `
        <input type="checkbox" class="playlist-item-checkbox" style="display: ${checkboxDisplay};" data-index="${originalIndex}">
        <div class="playlist-item-info">
            <div class="title">${escapeMusicHtml(track.name)}</div>
            <div class="artist">${escapeMusicHtml(track.artist)}</div>
        </div>
        <div class="playlist-item-actions">
            <span class="playlist-action-btn album-art-btn" data-index="${originalIndex}">专辑</span>
            <span class="playlist-action-btn lyrics-btn" data-index="${originalIndex}">词</span>
            <span class="playlist-action-btn bg-btn" data-index="${originalIndex}">背景</span>
            <span class="playlist-action-btn delete-track-btn" data-index="${originalIndex}">×</span>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (isPlaylistManagementMode) {
          if (e.target.tagName !== 'INPUT') {
            e.stopPropagation();
          }
          handlePlaylistSelection(originalIndex);
        }
      });

      const infoEl = item.querySelector('.playlist-item-info');
      if (infoEl) {
        infoEl.addEventListener('click', (e) => {
          if (!isPlaylistManagementMode) {
            e.stopPropagation();
            playSong(originalIndex, false);
          }
        });
      }

      playlistBody.appendChild(item);
    });
  }

  // 获取当前歌单的歌曲索引列表（在全局playlist中的索引）
  function getActivePlaylistIndices() {
    const pid = musicState.activePlaylistId || 'default';
    const indices = [];
    musicState.playlist.forEach((track, i) => {
      if ((track.playlistId || 'default') === pid) indices.push(i);
    });
    return indices;
  }

  // 渲染歌单标签栏
  function renderPlaylistTabs() {
    let tabsContainer = document.getElementById('playlist-tabs-container');
    if (!tabsContainer) {
      tabsContainer = document.createElement('div');
      tabsContainer.id = 'playlist-tabs-container';
      tabsContainer.className = 'playlist-tabs-container';
      const playlistBody = document.getElementById('playlist-body');
      playlistBody.parentNode.insertBefore(tabsContainer, playlistBody);
    }
    tabsContainer.innerHTML = '';
    musicState.playlists.forEach(pl => {
      const tab = document.createElement('span');
      tab.className = 'playlist-tab' + (pl.id === musicState.activePlaylistId ? ' active' : '');
      tab.textContent = pl.name;
      tab.dataset.playlistId = pl.id;
      // 统计歌曲数
      const count = musicState.playlist.filter(t => (t.playlistId || 'default') === pl.id).length;
      tab.textContent = `${pl.name} (${count})`;
      tab.addEventListener('click', () => {
        musicState.activePlaylistId = pl.id;
        updatePlaylistUI();
      });

      // 长按（手机）分享歌单给角色
      addLongPressListener(tab, () => showSharePlaylistMenu(pl.id));
      // 右键（PC）分享歌单给角色
      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showSharePlaylistMenu(pl.id);
      });

      tabsContainer.appendChild(tab);
    });
  }

  // 分享歌单给角色 - 弹出菜单
  async function showSharePlaylistMenu(playlistId) {
    const pl = musicState.playlists.find(p => p.id === playlistId);
    if (!pl) return;
    const songs = musicState.playlist.filter(t => (t.playlistId || 'default') === playlistId);
    if (songs.length === 0) {
      await showCustomAlert('提示', '这个歌单是空的，没有歌曲可以分享');
      return;
    }
    if (!musicState.isActive || !musicState.activeChatId) {
      await showCustomAlert('提示', '请先开启一起听，才能分享歌单给角色');
      return;
    }
    const activeChat = state.chats[musicState.activeChatId];
    const charName = activeChat ? activeChat.name : '角色';
    const options = [
      { text: `分享「${pl.name}」给${charName}`, value: 'share' }
    ];
    const choice = await showChoiceModal('歌单操作', options);
    if (choice === 'share') {
      await sharePlaylistToCharacter(playlistId);
    }
  }

  // 分享歌单给角色 - 发送卡片消息，不自动触发回复
  async function sharePlaylistToCharacter(playlistId) {
    const pl = musicState.playlists.find(p => p.id === playlistId);
    if (!pl) return;
    const chat = state.chats[musicState.activeChatId];
    if (!chat) return;
    const songs = musicState.playlist.filter(t => (t.playlistId || 'default') === playlistId);
    if (songs.length === 0) return;

    const charName = chat.name || '角色';
    const songList = songs.map((s, i) => `${i + 1}. ${s.name} - ${s.artist || '未知歌手'}`).join('\n');
    const shareText = `[分享歌单「${pl.name}」]\n${songList}`;

    // 作为用户消息发送，带上 playlist_share 类型
    const msg = {
      role: 'user',
      content: shareText,
      type: 'playlist_share',
      playlistName: pl.name,
      songs: songs.map(s => ({ name: s.name, artist: s.artist || '未知歌手' })),
      timestamp: Date.now()
    };
    chat.history.push(msg);
    await db.chats.put(chat);

    // 如果当前正在看这个聊天，渲染消息
    if (state.activeChatId === musicState.activeChatId) {
      appendMessage(msg, chat);
    }

    // 不自动触发AI回复，让用户可以继续补充消息

    await showCustomAlert('已分享', `已将歌单「${pl.name}」(${songs.length}首) 分享给${charName}`);
  }

  // 选择歌单弹窗（添加歌曲时用）
  async function showPlaylistPicker(title = '选择歌单') {
    const options = musicState.playlists.map(pl => ({
      text: pl.name,
      value: pl.id
    }));
    const choice = await showChoiceModal(title, options);
    return choice || 'default';
  }

  // 歌单管理面板
  async function openPlaylistManager() {
    const actions = [
      { text: '新建歌单', value: 'create' },
      { text: '删除歌单', value: 'delete' }
    ];
    const choice = await showChoiceModal('歌单管理', actions);
    if (!choice) return;

    if (choice === 'create') {
      const name = await showCustomPrompt('新建歌单', '请输入歌单名称');
      if (!name || !name.trim()) return;
      const newPlaylist = {
        id: 'pl_' + Date.now(),
        name: name.trim(),
        createdAt: Date.now()
      };
      musicState.playlists.push(newPlaylist);
      await saveGlobalPlaylist();
      updatePlaylistUI();
      await showCustomAlert('成功', `歌单「${name.trim()}」已创建`);
    } else if (choice === 'delete') {
      // 过滤掉默认歌单
      const deletable = musicState.playlists.filter(pl => pl.id !== 'default');
      if (deletable.length === 0) {
        await showCustomAlert('提示', '没有可删除的歌单（默认歌单不可删除）');
        return;
      }
      const options = deletable.map(pl => {
        const count = musicState.playlist.filter(t => (t.playlistId || 'default') === pl.id).length;
        return { text: `${pl.name} (${count}首)`, value: pl.id };
      });
      const toDelete = await showChoiceModal('选择要删除的歌单', options);
      if (!toDelete) return;
      const plName = musicState.playlists.find(p => p.id === toDelete)?.name;
      const confirmed = await showCustomConfirm('确认删除', `删除歌单「${plName}」？其中的歌曲将移回默认歌单。`, { confirmText: '确认删除' });
      if (!confirmed) return;
      // 把该歌单的歌曲移到默认
      musicState.playlist.forEach(t => {
        if (t.playlistId === toDelete) t.playlistId = 'default';
      });
      musicState.playlists = musicState.playlists.filter(pl => pl.id !== toDelete);
      if (musicState.activePlaylistId === toDelete) musicState.activePlaylistId = 'default';
      await saveGlobalPlaylist();
      updatePlaylistUI();
      await showCustomAlert('成功', `歌单「${plName}」已删除，歌曲已移回默认`);
    }
  }


  async function togglePlayPause() {
    if (audioPlayer.paused) {
      if (musicState.currentIndex === -1 && musicState.playlist.length > 0) {
        const indices = getActivePlaylistIndices();
        if (indices.length > 0) playSong(indices[0], true);
      } else if (musicState.currentIndex > -1) {
        playSong(musicState.currentIndex, true);
      }
    } else {
      audioPlayer.pause();
      // await addMusicActionSystemMessage('暂停了音乐');
    }
  }

  function playNext(isAutomatic = false) {
    const indices = getActivePlaylistIndices();
    if (indices.length === 0) return;
    const posInList = indices.indexOf(musicState.currentIndex);
    let nextIndex;
    switch (musicState.playMode) {
      case 'random':
        if (indices.length === 1) {
          nextIndex = indices[0];
        } else {
          const candidates = indices.filter(trackIndex => trackIndex !== musicState.currentIndex);
          nextIndex = candidates[Math.floor(Math.random() * candidates.length)];
        }
        break;
      case 'single':
        playSong(musicState.currentIndex, isAutomatic);
        return;
      case 'order':
      default:
        if (posInList === -1) {
          nextIndex = indices[0];
        } else {
          nextIndex = indices[(posInList + 1) % indices.length];
        }
        break;
    }
    playSong(nextIndex, isAutomatic);
  }

  function playPrev() {
    const indices = getActivePlaylistIndices();
    if (indices.length === 0) return;
    const posInList = indices.indexOf(musicState.currentIndex);
    let prevIndex;
    if (posInList === -1) {
      prevIndex = indices[indices.length - 1];
    } else {
      prevIndex = indices[(posInList - 1 + indices.length) % indices.length];
    }
    playSong(prevIndex, false);
  }

  function changePlayMode() {
    const modes = ['order', 'random', 'single'];
    const currentModeIndex = modes.indexOf(musicState.playMode);
    musicState.playMode = modes[(currentModeIndex + 1) % modes.length];
    updatePlayModeUI();
  }

  function updatePlayModeUI() {
    const modeBtn = document.getElementById('music-mode-btn');
    if (!modeBtn) return;
    const mode = musicState.playMode || 'order';
    
    if (mode === 'random') {
      modeBtn.title = '播放模式: 随机播放';
      modeBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 3 21 3 21 8"></polyline>
          <line x1="4" y1="20" x2="21" y2="3"></line>
          <polyline points="21 16 21 21 16 21"></polyline>
          <line x1="15" y1="15" x2="21" y2="21"></line>
          <line x1="4" y1="4" x2="9" y2="9"></line>
        </svg>`;
    } else if (mode === 'single') {
      modeBtn.title = '播放模式: 单曲循环';
      modeBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m17 2 4 4-4 4"></path>
          <path d="M3 11v-1a4 4 0 0 1 4-4h14"></path>
          <path d="m7 22-4-4 4-4"></path>
          <path d="M21 13v1a4 4 0 0 1-4 4H3"></path>
          <text x="12" y="15" font-size="9" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">1</text>
        </svg>`;
    } else {
      modeBtn.title = '播放模式: 顺序播放';
      modeBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m17 2 4 4-4 4"></path>
          <path d="M3 11v-1a4 4 0 0 1 4-4h14"></path>
          <path d="m7 22-4-4 4-4"></path>
          <path d="M21 13v1a4 4 0 0 1-4 4H3"></path>
        </svg>`;
    }
  }

  function parseFileNameToSongInfo(fileName) {
    let cleanName = fileName.replace(/\.[^/.]+$/, "").trim();
    let name = cleanName;
    let artist = "未知歌手";

    if (cleanName.includes(' - ')) {
      const parts = cleanName.split(' - ');
      if (parts.length >= 2) {
        artist = parts[0].trim();
        name = parts.slice(1).join(' - ').trim();
      }
    } else if (cleanName.includes('-')) {
      const parts = cleanName.split('-');
      if (parts.length >= 2) {
        artist = parts[0].trim();
        name = parts.slice(1).join('-').trim();
      }
    }
    return { name: name || cleanName || '未知歌曲', artist: artist || '未知歌手' };
  }

  async function addSongFromURL() {
    const modeChoice = await showChoiceModal("添加网络音频", [
      { text: "单首添加", value: "single" },
      { text: "批量导入 (支持多行/链接列表)", value: "batch" }
    ]);

    if (!modeChoice) return;

    if (modeChoice === "single") {
      const url = await showCustomPrompt("添加网络歌曲", "请输入歌曲的URL", "", "url");
      if (!url || !url.trim()) return;
      const name = await showCustomPrompt("歌曲信息", "请输入歌名");
      if (!name || !name.trim()) return;
      const artist = await showCustomPrompt("歌曲信息", "请输入歌手名", "未知歌手");
      if (artist === null) return;
      // 选择歌单
      const playlistId = await showPlaylistPicker('添加到哪个歌单？');
      musicState.playlist.push({
        name: name.trim(),
        artist: (artist && artist.trim()) || "未知歌手",
        src: url.trim(),
        isLocal: false,
        cover: 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1757748720126_qdqqd_1jt5sv.jpeg',
        playlistId: playlistId
      });
      await saveGlobalPlaylist();
      updatePlaylistUI();
      if (musicState.currentIndex === -1) {
        musicState.currentIndex = musicState.playlist.length - 1;
        updatePlayerUI();
      }
      showToast('歌曲已添加', 'success');
    } else if (modeChoice === "batch") {
      const batchText = await showCustomPrompt(
        "批量添加网络音频",
        "每行输入一首歌曲，支持以下格式：\n1. 音频URL\n2. 歌名, 歌手, 音频URL\n3. 歌手 - 歌名, 音频URL",
        "",
        "textarea"
      );
      if (!batchText || !batchText.trim()) return;

      const lines = batchText.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return;

      const playlistId = await showPlaylistPicker('添加到哪个歌单？');
      let count = 0;

      for (const line of lines) {
        let name = "网络音频";
        let artist = "未知歌手";
        let src = "";

        if (line.includes(',')) {
          const parts = line.split(',').map(p => p.trim());
          if (parts.length === 2) {
            name = parts[0] || "网络音频";
            src = parts[1];
          } else if (parts.length >= 3) {
            name = parts[0] || "网络音频";
            artist = parts[1] || "未知歌手";
            src = parts[2];
          }
        } else if (line.includes('，')) {
          const parts = line.split('，').map(p => p.trim());
          if (parts.length === 2) {
            name = parts[0] || "网络音频";
            src = parts[1];
          } else if (parts.length >= 3) {
            name = parts[0] || "网络音频";
            artist = parts[1] || "未知歌手";
            src = parts[2];
          }
        } else {
          src = line;
          // 尝试从 URL 路径获取文件名作为歌名
          try {
            const urlObj = new URL(src);
            const pathName = decodeURIComponent(urlObj.pathname.split('/').pop() || '');
            if (pathName) {
              const parsed = parseFileNameToSongInfo(pathName);
              name = parsed.name;
              artist = parsed.artist;
            }
          } catch (_) {
            name = `网络歌曲 ${count + 1}`;
          }
        }

        if (src && (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:'))) {
          musicState.playlist.push({
            name: name,
            artist: artist,
            src: src,
            isLocal: false,
            cover: 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1757748720126_qdqqd_1jt5sv.jpeg',
            playlistId: playlistId
          });
          count++;
        }
      }

      if (count > 0) {
        await saveGlobalPlaylist();
        updatePlaylistUI();
        if (musicState.currentIndex === -1 && musicState.playlist.length > 0) {
          musicState.currentIndex = 0;
          updatePlayerUI();
        }
        await showCustomAlert("批量导入成功", `成功批量添加了 ${count} 首网络歌曲！`);
      } else {
        await showCustomAlert("导入失败", "未识别到有效的音频链接，请检查格式后重试。");
      }
    }
  }


  async function playSong(index, isAutomatic = false, changeSource = 'user') {
    if (index < 0 || index >= musicState.playlist.length) return;

    // 自动切换到该歌曲所在的歌单
    const songPlaylistId = (musicState.playlist[index].playlistId) || 'default';
    if (musicState.activePlaylistId !== songPlaylistId) {
      musicState.activePlaylistId = songPlaylistId;
    }

    audioPlayer.pause();

    // ★ 释放旧的 Blob URL，防止内存泄漏
    if (audioPlayer.src && audioPlayer.src.startsWith('blob:')) {
      URL.revokeObjectURL(audioPlayer.src);
    }

    musicState.currentIndex = index;
    const track = musicState.playlist[index];
    const chat = state.chats[musicState.activeChatId];

    if (track.onlineSource && !track.src) {
      try {
        const resolved = await getOnlineMusicServices().resolveSong(track, {
          forceRefresh: true,
          allowCrossPlatform: true
        });
        if (!resolved?.url) throw new Error('没有可用播放地址');
        track.src = resolved.url;
        track.onlineResolvedAt = Date.now();
        track.onlineSource = getOnlineMusicServices().toPlaylistTrack(resolved.identity, resolved.url).onlineSource;
        if (!track.lrcContent) {
          track.lrcContent = await getOnlineMusicServices().loadLyrics(resolved.identity) || '';
        }
        await saveGlobalPlaylist();
      } catch (error) {
        console.error('[音乐播放] 刷新播放地址失败:', error);
        await showCustomAlert('暂时无法播放', `《${track.name}》当前没有可用音源，请稍后重试或重新搜索。`);
        updatePlaylistUI();
        updatePlayerUI();
        return;
      }
    }


    const avatarDisplay = document.getElementById('music-player-avatar-display');
    if (chat && avatarDisplay) {

      avatarDisplay.innerHTML = '';


      const charAvatarUrl = chat.isGroup ?
        (chat.members.find(m => m.originalName === track.artist)?.avatar || defaultAvatar) :
        (chat.settings.aiAvatar || defaultAvatar);
      const userAvatarUrl = chat.settings.myAvatar || defaultAvatar;


      const charAvatarEl = document.createElement('img');
      charAvatarEl.src = charAvatarUrl;
      charAvatarEl.className = 'participant-display-avatar';
      charAvatarEl.alt = 'Character Avatar';
      avatarDisplay.appendChild(charAvatarEl);


      const userAvatarEl = document.createElement('img');
      userAvatarEl.src = userAvatarUrl;
      userAvatarEl.className = 'participant-display-avatar';
      userAvatarEl.alt = 'User Avatar';
      avatarDisplay.appendChild(userAvatarEl);
    }


    const playerWindow = document.querySelector('.music-player-window');
    const toggleBtn = document.getElementById('toggle-blur-btn');

    if (playerWindow) {
      playerWindow.style.setProperty('--music-bg-image', track.background ? `url(${track.background})` : 'none');
      playerWindow.classList.toggle('bg-clear', !!track.isBgClear);
    }
    if (toggleBtn) {
      toggleBtn.classList.toggle('active', !!track.isBgClear);
    }


    document.getElementById('music-visual-container').classList.remove('lyrics-active');
    const coverEl = document.getElementById('music-player-cover');
    if (coverEl) {
      coverEl.src = track.cover || 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1757748720126_qdqqd_1jt5sv.jpeg';
    }

    musicState.parsedLyrics = parseLRC(track.lrcContent || "");

    renderLyrics();
    const singleLyricEl = document.getElementById('single-lyric-display');
    if (singleLyricEl) {
      if (!musicState.parsedLyrics || musicState.parsedLyrics.length === 0) {
        singleLyricEl.textContent = '纯音乐，请欣赏';
      } else {
        singleLyricEl.textContent = '♪ ♪ ♪';
      }
    }

    if (track.isLocal && track.src instanceof ArrayBuffer) {
      const blob = new Blob([track.src], {
        type: track.fileType || 'audio/mpeg'
      });
      audioPlayer.src = URL.createObjectURL(blob);
    } else if (track.isLocal && track.src instanceof Blob) {
      audioPlayer.src = URL.createObjectURL(track.src);
    } else if (!track.isLocal) {
      // 直接使用音频URL，不使用代理
      // 音频文件通常已经支持CORS，不需要像图片那样使用代理
      audioPlayer.src = String(track.src || '').replace(/^http:\/\//i, 'https://');
      console.log(`[音乐播放] 加载音频: ${track.name}, URL: ${track.src}`);
    } else {
      console.error('本地歌曲源错误:', track);
      return;
    }

    // 重新加载音频资源
    audioPlayer.load();
    const playPromise = audioPlayer.play();
    updateMusicMediaSession(track);
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        if (error.name === 'NotAllowedError') {
          console.warn('Autoplay was prevented by the browser.');
          audioPlayer.pause();
          showCustomAlert('可以播放了', '浏览器需要你再次点击播放按钮来开始这首歌。');
        } else if (error.name !== 'AbortError') {
          console.error('Playback error:', error);
        }
      });
    }
    if (!isAutomatic) {
      if (changeSource === 'character') addMusicActionSystemMessage(`歌曲已切换为《${track.name}》 - ${track.artist}`, false);
      else addMusicActionSystemMessage(`将歌曲切换为了《${track.name}》`);
    }
    updatePlaylistUI();
    updatePlayerUI();
    const isFrameMode = document.body.classList.contains('frame-mode-active');
    const isAlwaysIslandMode = state.globalSettings.alwaysShowMusicIsland || false;
    const lyricBar = document.getElementById('global-lyrics-bar');

    if (isFrameMode || isAlwaysIslandMode) {

      phoneScreenForIsland.classList.add('dynamic-island-active');
      islandAlbumArt.src = track.cover || 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1757748720126_qdqqd_1jt5sv.jpeg';
      lyricBar.classList.remove('visible');
    } else {

      phoneScreenForIsland.classList.remove('dynamic-island-active');
      if (musicState.parsedLyrics && musicState.parsedLyrics.length > 0) {
        lyricBar.textContent = '♪';
        lyricBar.classList.add('visible');
      } else {
        lyricBar.classList.remove('visible');
      }
    }
  }


  async function handleChangeBackground(trackIndex) {
    if (trackIndex < 0 || trackIndex >= musicState.playlist.length) return;


    const choice = await showChoiceModal("更换歌曲背景", [{
      text: '📁 从本地上传',
      value: 'local'
    },
    {
      text: '🌐 使用网络URL',
      value: 'url'
    }
    ]);

    let newBackgroundUrl = null;


    if (choice === 'local') {
      newBackgroundUrl = await uploadImageLocally();
    } else if (choice === 'url') {
      newBackgroundUrl = await showCustomPrompt("输入图片URL", "请输入新的背景图片链接", "", "url");
    }


    if (newBackgroundUrl && newBackgroundUrl.trim()) {
      musicState.playlist[trackIndex].background = newBackgroundUrl.trim();
      await saveGlobalPlaylist();


      if (musicState.currentIndex === trackIndex) {
        const playerWindow = document.querySelector('.music-player-window');
        playerWindow.style.setProperty('--music-bg-image', `url(${newBackgroundUrl.trim()})`);
      }

      await showCustomAlert("成功", "歌曲背景已更新！");
    }
  }

  async function handleChangeAlbumArt(trackIndex) {
    if (trackIndex < 0 || trackIndex >= musicState.playlist.length) return;

    const choice = await showChoiceModal("更换专辑封面", [{
      text: '📁 从本地上传',
      value: 'local'
    },
    {
      text: '🌐 使用网络URL',
      value: 'url'
    }
    ]);

    let newCoverUrl = null;

    if (choice === 'local') {
      newCoverUrl = await uploadImageLocally();
    } else if (choice === 'url') {
      newCoverUrl = await showCustomPrompt("输入图片URL", "请输入新的封面图片链接", "", "url");
    }

    if (newCoverUrl && newCoverUrl.trim()) {
      musicState.playlist[trackIndex].cover = newCoverUrl.trim();
      await saveGlobalPlaylist();


      if (musicState.currentIndex === trackIndex) {
        document.getElementById('music-player-cover').src = newCoverUrl.trim();

        const vinylCover = document.querySelector('#vinyl-view #music-player-cover');
        if (vinylCover) vinylCover.src = newCoverUrl.trim();
      }

      await showCustomAlert("成功", "专辑封面已更新！");
    }
  }

  async function addSongFromLocal(event) {
    const files = event.target.files;
    if (!files || !files.length) return;

    // 先选择歌单
    const playlistId = await showPlaylistPicker('添加到哪个歌单？');
    const isBatch = files.length > 1;

    let uploadedCount = 0;

    if (isBatch) {
      showToast(`正在批量导入 ${files.length} 首歌曲...`, 'info');
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const parsedInfo = parseFileNameToSongInfo(file.name);
      let name = parsedInfo.name;
      let artist = parsedInfo.artist;
      let lrcContent = "";

      if (!isBatch) {
        // 单个文件允许手动确认歌名、歌手和歌词
        const customName = await showCustomPrompt("歌曲信息", "请输入歌名", name);
        if (customName === null) continue;
        if (customName.trim()) name = customName.trim();

        const customArtist = await showCustomPrompt("歌曲信息", "请输入歌手名", artist);
        if (customArtist === null) continue;
        if (customArtist.trim()) artist = customArtist.trim();

        const wantLrc = await showCustomConfirm("导入歌词", `要为《${name}》添加歌词吗？`);
        if (wantLrc) {
          lrcContent = await getLrcContent() || "";
        }
      }

      let songSrc = null;
      let isLocal = true;

      // 如果开启了 Catbox 配置，尝试上传到 Catbox
      const hasCatbox = state.apiConfig && state.apiConfig.catboxEnable && state.apiConfig.catboxUserHash;
      if (hasCatbox) {
        try {
          const catboxUrl = await uploadFileToCatbox(file);
          if (catboxUrl) {
            songSrc = catboxUrl;
            isLocal = false;
          } else {
            songSrc = await file.arrayBuffer();
            isLocal = true;
          }
        } catch (uploadError) {
          console.warn(`[本地音频] 上传Catbox失败，降级为本地保存: ${file.name}`, uploadError);
          songSrc = await file.arrayBuffer();
          isLocal = true;
        }
      } else {
        songSrc = await file.arrayBuffer();
        isLocal = true;
      }

      musicState.playlist.push({
        name,
        artist,
        src: songSrc,
        fileType: file.type || 'audio/mpeg',
        isLocal: isLocal,
        lrcContent: lrcContent,
        cover: 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1757748720126_qdqqd_1jt5sv.jpeg',
        playlistId: playlistId
      });
      uploadedCount++;
    }

    if (uploadedCount > 0) {
      await saveGlobalPlaylist();
      updatePlaylistUI();
      if (musicState.currentIndex === -1 && musicState.playlist.length > 0) {
        musicState.currentIndex = 0;
        updatePlayerUI();
      }
      if (isBatch) {
        await showCustomAlert("批量添加成功", `已成功添加 ${uploadedCount} 首本地歌曲！`);
      } else {
        showToast("歌曲已添加", "success");
      }
    }
    event.target.value = null;
  }


  async function deleteTrack(index) {
    if (index < 0 || index >= musicState.playlist.length) return;
    const track = musicState.playlist[index];
    const wasPlaying = musicState.isPlaying && musicState.currentIndex === index;
    if (track.isLocal && audioPlayer.src.startsWith('blob:') && musicState.currentIndex === index) URL.revokeObjectURL(audioPlayer.src);
    musicState.playlist.splice(index, 1);
    await saveGlobalPlaylist();
    if (musicState.playlist.length === 0) {
      if (musicState.isPlaying) audioPlayer.pause();
      audioPlayer.src = '';
      musicState.currentIndex = -1;
      musicState.isPlaying = false;
    } else {
      if (wasPlaying) {
        playNext();
      } else {
        if (musicState.currentIndex >= index) musicState.currentIndex = Math.max(0, musicState.currentIndex - 1);
      }
    }
    updatePlayerUI();
    updatePlaylistUI();
  }

  // ========== 歌词解析与渲染（来自 script.js 第 31283~31535 行） ==========

  function closeMusicPlayerWithAnimation(callback) {
    const overlay = document.getElementById('music-player-overlay');
    if (!overlay.classList.contains('visible')) {
      if (callback) callback();
      return;
    }
    overlay.classList.remove('visible');
    setTimeout(() => {
      document.getElementById('music-playlist-panel').classList.remove('visible');
      if (callback) callback();
    }, 400);
  }

  function parseLRC(lrcContent) {
    if (!lrcContent) return [];
    const lines = String(lrcContent).split(/\r\n?|\n/);
    const lyrics = [];
    const timeRegex = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/g;
    for (const line of lines) {
      const text = line.replace(timeRegex, '').trim();
      if (!text) continue;
      timeRegex.lastIndex = 0;
      let match;
      while ((match = timeRegex.exec(line)) !== null) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
        const time = minutes * 60 + seconds + milliseconds / 1000;
        lyrics.push({
          time,
          text
        });
      }
    }
    return lyrics.sort((a, b) => a.time - b.time);
  }

  function renderLyrics() {
    const lyricsList = document.getElementById('music-lyrics-list');
    lyricsList.innerHTML = '';
    if (!musicState.parsedLyrics || musicState.parsedLyrics.length === 0) {
      lyricsList.innerHTML = '<div class="lyric-line">♪ 暂无歌词 ♪</div>';
      return;
    }
    musicState.parsedLyrics.forEach((line, index) => {
      const lineEl = document.createElement('div');
      lineEl.className = 'lyric-line';
      lineEl.textContent = line.text;
      lineEl.dataset.index = index;
      lyricsList.appendChild(lineEl);
    });
    lyricsList.style.transform = `translateY(0px)`;
  }

  function updateIslandScrollAnimation() {

  }

  function checkLyricScroll() {

    if (!islandLyricText || !islandLyricContainer) return;

    const textWidth = islandLyricText.scrollWidth;
    const containerWidth = islandLyricContainer.clientWidth;


    if (textWidth > containerWidth) {

      const scrollRatio = textWidth / containerWidth;
      const animationDuration = Math.max(5, scrollRatio * 5);


      islandLyricText.style.setProperty('--animation-duration', `${animationDuration}s`);
      islandLyricText.style.setProperty('--container-width', `${containerWidth}px`);
      islandLyricText.style.setProperty('--text-width', `${textWidth}px`);


      islandLyricText.classList.add('scrolling');
    } else {

      islandLyricText.classList.remove('scrolling');
    }
  }

  function updateActiveLyric(currentTime) {
    if (musicState.parsedLyrics.length === 0) return;
    let newLyricIndex = -1;
    for (let i = 0; i < musicState.parsedLyrics.length; i++) {
      if (currentTime >= musicState.parsedLyrics[i].time) {
        newLyricIndex = i;
      } else {
        break;
      }
    }
    if (newLyricIndex === musicState.currentLyricIndex) return;
    musicState.currentLyricIndex = newLyricIndex;
    updateLyricsUI();

    const singleLyricEl = document.getElementById('single-lyric-display');
    if (singleLyricEl) {
      if (newLyricIndex > -1 && musicState.parsedLyrics[newLyricIndex]) {
        singleLyricEl.textContent = musicState.parsedLyrics[newLyricIndex].text;
      } else {
        singleLyricEl.textContent = '♪ ♪ ♪';
      }
    }

    const lyricBar = document.getElementById('global-lyrics-bar');
    if (lyricBar.classList.contains('visible')) {
      if (newLyricIndex > -1 && musicState.parsedLyrics[newLyricIndex]) {
        lyricBar.textContent = musicState.parsedLyrics[newLyricIndex].text;
      } else {
        lyricBar.textContent = '♪';
      }
    }


    if (phoneScreenForIsland.classList.contains('dynamic-island-active')) {
      const lyricText = (newLyricIndex > -1 && musicState.parsedLyrics[newLyricIndex]) ?
        musicState.parsedLyrics[newLyricIndex].text :
        '♪ ♪ ♪';


      const firstSpan = islandLyricText.querySelector('span:first-child');
      if (firstSpan && firstSpan.textContent === lyricText) {
        return;
      }


      islandLyricText.style.opacity = 0;


      setTimeout(() => {



        islandLyricText.classList.remove('scrolling');
        islandLyricContainer.classList.remove('center-content');
        islandLyricText.style.animation = 'none';

        let span1 = islandLyricText.querySelector('span:first-child');
        let span2 = islandLyricText.querySelector('span:last-child');
        if (!span1) {
          span1 = document.createElement('span');
          islandLyricText.appendChild(span1);
        }
        if (!span2) {
          span2 = document.createElement('span');
          islandLyricText.appendChild(span2);
        }

        span1.textContent = lyricText;
        span2.textContent = lyricText;

        const textWidth = span1.offsetWidth;
        const containerWidth = islandLyricContainer.clientWidth;


        if (textWidth > containerWidth) {

          const scrollRatio = textWidth / containerWidth;
          const duration = Math.max(5, scrollRatio * 5);

          islandLyricText.style.setProperty('--marquee-duration', `${duration}s`);
          islandLyricText.classList.add('scrolling');

          islandLyricText.style.animation = `marquee var(--marquee-duration, 10s) linear infinite`;
        } else {

          islandLyricContainer.classList.add('center-content');
        }




        islandLyricText.style.opacity = 1;

      }, 200);
    }

  }


  function updateLyricsUI(isFullscreen = false) {
    const listSelector = isFullscreen ? '#fullscreen-lyrics-container .music-lyrics-list' : '#music-lyrics-container #music-lyrics-list';
    const containerSelector = isFullscreen ? '#fullscreen-lyrics-container' : '#music-lyrics-container';

    const lyricsList = document.querySelector(listSelector);
    const container = document.querySelector(containerSelector);
    if (!lyricsList || !container) return;

    const lines = lyricsList.querySelectorAll('.lyric-line');
    lines.forEach(line => line.classList.remove('active'));

    if (musicState.currentLyricIndex === -1) {
      lyricsList.style.transform = `translateY(0px)`;
      return;
    }

    const activeLine = lyricsList.querySelector(`.lyric-line[data-index="${musicState.currentLyricIndex}"]`);
    if (activeLine) {
      activeLine.classList.add('active');
      const containerHeight = container.offsetHeight;
      const offset = (containerHeight / 2.2) - activeLine.offsetTop - (activeLine.offsetHeight / 2);
      lyricsList.style.transform = `translateY(${offset}px)`;
    }
  }

  function formatMusicTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  let lastTimeUpdate = 0;
  let animationFrameId;

  function updateMusicProgressBar() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }

    function step() {
      if (!musicState.isPlaying || !audioPlayer.duration) {
        return;
      }

      const now = performance.now();
      const currentTime = audioPlayer.currentTime;
      const duration = audioPlayer.duration;

      const progressPercent = (currentTime / duration) * 100;
      document.getElementById('music-progress-fill').style.width = `${progressPercent}%`;

      if (now - lastTimeUpdate > 1000) {
        document.getElementById('music-current-time').textContent = formatMusicTime(currentTime);
        document.getElementById('music-total-time').textContent = formatMusicTime(duration);
        updateActiveLyric(currentTime);
        updateIslandScrollAnimation();
        lastTimeUpdate = now;
      }


      animationFrameId = requestAnimationFrame(step);
    }

    animationFrameId = requestAnimationFrame(step);
  }

  // ========== 音乐搜索 API（来自 script.js 第 38006~38870 行） ==========

  if (typeof Http_Get_External === 'undefined') {
    window.Http_Get_External = function (url) {
      return new Promise((resolve) => {
        fetch(url).then(res => res.json().catch(() => res.text())).then(resolve).catch(() => resolve(null));
      });
    }
  }
  async function Http_Get(url) {
    return await Http_Get_External(url);
  }

  function checkAudioAvailability(url, timeoutMs = 8000) {
    return new Promise(resolve => {
      if (!url) {
        resolve(false);
        return;
      }
      const tester = new Audio();
      let settled = false;
      const finish = (available) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        tester.removeAttribute('src');
        tester.load();
        resolve(available);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      tester.addEventListener('loadedmetadata', () => finish(true), { once: true });
      tester.addEventListener('error', () => finish(false), { once: true });
      tester.preload = 'metadata';
      tester.src = String(url).replace(/^http:\/\//i, 'https://');
    });
  }

  let onlineRetryInProgress = false;
  async function retryOnlineTrackPlayback() {
    const track = musicState.playlist[musicState.currentIndex];
    if (!track?.onlineSource || onlineRetryInProgress) return false;
    if (Date.now() - (track.onlineRetryAt || 0) < 5000) return true;

    onlineRetryInProgress = true;
    track.onlineRetryAt = Date.now();
    try {
      const resolved = await getOnlineMusicServices().resolveSong(track, { preferAlternative: true });
      if (!resolved?.url) throw new Error('没有找到备用音源');
      track.src = resolved.url;
      track.onlineResolvedAt = Date.now();
      track.onlineSource = getOnlineMusicServices().toPlaylistTrack(resolved.identity, resolved.url).onlineSource;
      const refreshedLyrics = await getOnlineMusicServices().loadLyrics(resolved.identity);
      if (refreshedLyrics) track.lrcContent = refreshedLyrics;
      await saveGlobalPlaylist();
      audioPlayer.src = resolved.url;
      audioPlayer.load();
      await audioPlayer.play();
      return true;
    } catch (error) {
      console.error('[音乐播放] 自动切换备用音源失败:', error);
      if (error?.name === 'NotAllowedError') {
        await showCustomAlert('可以播放了', '备用音源已经准备好，请再次点击播放按钮。');
      } else {
        await showCustomAlert('播放失败', `《${track.name}》的当前来源和备用来源都暂时不可用。`);
      }
      return true;
    } finally {
      onlineRetryInProgress = false;
    }
  }
  function getOnlineMusicServices() {
    if (!window.MusicOnlineServices) throw new Error('音乐服务尚未加载');
    return window.MusicOnlineServices;
  }

  function escapeMusicHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function searchNeteaseMusic(name, singer) {
    const query = `${name || ''} ${singer || ''}`.trim();
    try {
      return await getOnlineMusicServices().searchPlatform('netease', query, 30);
    } catch (error) {
      console.error('网易云音乐搜索失败:', error);
      return [];
    }
  }

  async function searchPublicMusic(keyword) {
    try {
      return await getOnlineMusicServices().searchAll(keyword, 20);
    } catch (error) {
      console.error('多平台音乐搜索失败:', error);
      return [];
    }
  }

  async function getPublicPlaylist(playlistId) {
    try {
      return await getOnlineMusicServices().getPlaylist(String(playlistId));
    } catch (error) {
      console.error('歌单解析失败:', error);
      return [];
    }
  }

  async function getPublicAlbum(albumId) {
    try {
      return await getOnlineMusicServices().getAlbum(String(albumId));
    } catch (error) {
      console.error('专辑解析失败:', error);
      return [];
    }
  }
  async function searchTencentMusic(name) {
    try {
      return await getOnlineMusicServices().searchPlatform('tencent', name, 30);
    } catch (e) {
      console.error("QQ音乐搜索API失败:", e);
      return [];
    }
  }

  // --- 3. 重构搜索主入口 (已去除图标) ---
  // --- 3. 重构搜索主入口 (已去除图标) ---
  async function addSongFromSearch() {
    // 1. 第一步：选择模式 (去除了 Emoji)
    const modeChoice = await showChoiceModal("请选择操作模式", [
      { text: '搜索歌曲 (新源·支持选音质)', value: 'search_new' },
      { text: '解析歌单 (输入ID)', value: 'playlist_new' },
      { text: '解析专辑 (输入ID)', value: 'album_new' },
      { text: '普通搜索 (网易/腾讯旧源)', value: 'search_old' }
    ]);

    if (!modeChoice) return;

    let searchResults = [];
    let selectedQuality = 'exhigh'; // 默认极高

    // 2. 第二步：如果是新源，选择音质 (去除了 Emoji)
    if (modeChoice.includes('_new')) {
      const qualityChoice = await showChoiceModal("请选择期望音质", [
        { text: '无损 (Lossless - FLAC)', value: 'lossless' },
        { text: '高解析 (Hi-Res - FLAC)', value: 'hires' },
        { text: '母带级 (Master - FLAC)', value: 'jymaster' },
        { text: '杜比全景声 (Dolby - MP4)', value: 'dolby' },
        { text: '极高 (ExHigh - MP3)', value: 'exhigh' },
        { text: '标准 (Standard - MP3)', value: 'standard' },
        { text: '环绕沉浸 (Sky)', value: 'sky' },
        { text: '空间音效 (Effect)', value: 'jyeffect' }
      ]);
      if (!qualityChoice) return;
      selectedQuality = qualityChoice;
    }

    // 3. 第三步：输入关键词或ID
    let promptText = "请输入歌曲名称";
    if (modeChoice === 'playlist_new') promptText = "请输入歌单 ID (数字)";
    if (modeChoice === 'album_new') promptText = "请输入专辑 ID (数字)";

    const input = await showCustomPrompt(promptText, "在此输入...");
    if (!input || !input.trim()) return;
    const query = input.trim();

    await showCustomAlert("请稍候...", "正在请求资源...");

    // 4. 执行搜索/解析 (保持原逻辑不变)
    try {
      if (modeChoice === 'search_new') {
        searchResults = await searchPublicMusic(query);
      }
      else if (modeChoice === 'playlist_new') {
        searchResults = await getPublicPlaylist(query);
        if (searchResults.length > 0) {
          await showCustomAlert("解析成功", `成功解析歌单，共 ${searchResults.length} 首歌曲。`);
        }
      }
      else if (modeChoice === 'album_new') {
        searchResults = await getPublicAlbum(query);
        if (searchResults.length > 0) {
          await showCustomAlert("解析成功", `成功解析专辑，共 ${searchResults.length} 首歌曲。`);
        }
      }
      else if (modeChoice === 'search_old') {
        // 旧版并行搜索逻辑
        let musicName = query;
        let singerName = "";
        if (query.includes('-')) {
          const parts = query.split('-');
          musicName = parts[0].trim();
          singerName = parts[1].trim();
        }
        const [netease, tencent] = await Promise.all([
          searchNeteaseMusic(musicName, singerName),
          searchTencentMusic(musicName)
        ]);
        searchResults = [...netease, ...tencent];
      }
    } catch (e) {
      console.error(e);
      await showCustomAlert("错误", "搜索或解析过程中发生错误，请检查ID是否正确。");
      return;
    }

    // 5. 渲染结果
    if (searchResults.length === 0) {
      await showCustomAlert("无结果", "未找到相关内容。");
      return;
    }

    const modal = document.getElementById('music-search-results-modal');
    const listEl = document.getElementById('search-results-list');
    listEl.innerHTML = '';
    document.getElementById('select-all-music-search').checked = false;

    searchResults.forEach(song => {
      // 【关键】将用户选择的音质写入歌曲对象
      if (modeChoice.includes('_new')) {
        song.preferredQuality = selectedQuality;
      }

      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.dataset.songJson = JSON.stringify(song);

      // 显示来源标签 (去除了 Emoji)
      let sourceTag = '';
      if (modeChoice.includes('_new')) {
        const qualityLabels = {
          'lossless': '无损', 'hires': 'Hi-Res', 'jymaster': '母带',
          'dolby': '杜比', 'exhigh': '极高', 'standard': '标准',
          'sky': '全景', 'jyeffect': '空间'
        };
        const qLabel = qualityLabels[selectedQuality] || 'Pro';
        const platformLabel = { netease: '网易云', tencent: 'QQ音乐', kugou: '酷狗' }[song.source] || '在线';
        sourceTag = `<span class="source" style="color:#ff3b30; border-color:#ff3b30;">${platformLabel} · ${qLabel}</span>`;
      } else if (song.source === 'netease') {
        sourceTag = '<span class="source" style="color:#c20c0c; border-color:#c20c0c;">网易云</span>';
      } else {
        sourceTag = '<span class="source" style="color:#00e09e; border-color:#00e09e;">QQ音乐</span>';
      }

      item.innerHTML = `
            <input type="checkbox" class="music-search-checkbox" style="margin-right: 15px;">
            <div class="search-result-info">
                <div class="title">${escapeMusicHtml(song.name)}</div>
                <div class="artist">${escapeMusicHtml(song.artist)} ${sourceTag}</div>
            </div>
        `;
      listEl.appendChild(item);
    });

    modal.classList.add('visible');
  }


  async function getPlayableSongDetails(songData) {
    try {
      const services = getOnlineMusicServices();
      let resolved = await services.resolveSong(songData, { allowCrossPlatform: true });
      if (!resolved?.url) return null;
      if (!await checkAudioAvailability(resolved.url, 7000)) {
        resolved = await services.resolveSong(songData, { preferAlternative: true });
        if (!resolved?.url || !await checkAudioAvailability(resolved.url, 7000)) return null;
      }
      const track = services.toPlaylistTrack(resolved.identity || songData, resolved.url);
      track.name = songData.name || track.name;
      track.artist = songData.artist || track.artist;
      track.cover = songData.cover || track.cover;
      track.preferredQuality = songData.preferredQuality || 'exhigh';
      track.lrcContent = await services.loadLyrics(resolved.identity || songData) || '';
      return track;
    } catch (error) {
      console.error(`无法获取《${songData.name || '未知歌曲'}》的播放信息:`, error);
      return null;
    }
  }
  async function getLyricsForSong(songId, source) {
    return getOnlineMusicServices().loadLyrics({ id: songId, source });
  }

  async function handleManualLrcImport(trackIndex) {
    if (trackIndex < 0 || trackIndex >= musicState.playlist.length) return;

    const choice = await showChoiceModal('选择歌词导入方式', [{
      text: '📁 从本地文件 (.lrc)',
      value: 'file'
    },
    {
      text: '📋 直接粘贴歌词文本',
      value: 'paste'
    }
    ]);

    let lrcContent = null;

    if (choice === 'file') {
      lrcContent = await new Promise(resolve => {
        const lrcInput = document.getElementById('lrc-upload-input');
        const lrcChangeHandler = e => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = readEvent => resolve(readEvent.target.result);
            reader.onerror = () => resolve(null);
            reader.readAsText(file);
          } else {
            resolve(null);
          }
          lrcInput.removeEventListener('change', lrcChangeHandler);
          lrcInput.value = '';
        };
        lrcInput.addEventListener('change', lrcChangeHandler, {
          once: true
        });
        lrcInput.click();
      });
    } else if (choice === 'paste') {
      const pastedText = await showCustomPrompt('粘贴歌词', '请在此处粘贴完整的LRC格式歌词...', '', 'textarea');
      if (pastedText) lrcContent = pastedText.replace(/\[/g, '\n[').trim();
    }

    if (lrcContent !== null) {
      musicState.playlist[trackIndex].lrcContent = lrcContent;


      await saveGlobalPlaylist();

      if (musicState.currentIndex === trackIndex) {
        musicState.parsedLyrics = parseLRC(lrcContent);
        renderLyrics();
        updateLyricsUI();
      }
      await showCustomAlert('成功', `《${musicState.playlist[trackIndex].name}》的歌词已成功保存！`);
    }
  }


  async function toggleBackgroundBlur() {
    if (musicState.currentIndex === -1) return;

    const track = musicState.playlist[musicState.currentIndex];
    if (!track) return;


    track.isBgClear = !track.isBgClear;


    await saveGlobalPlaylist();


    const playerWindow = document.querySelector('.music-player-window');
    const toggleBtn = document.getElementById('toggle-blur-btn');

    playerWindow.classList.toggle('bg-clear', track.isBgClear);
    toggleBtn.classList.toggle('active', track.isBgClear);
  }


  function toggleMusicPlayerAvatars() {
    const avatarDisplay = document.getElementById('music-player-avatar-display');
    const toggleBtn = document.getElementById('show-avatars-btn');
    if (avatarDisplay && toggleBtn) {
      avatarDisplay.classList.toggle('visible');
      toggleBtn.classList.toggle('active');
    }
  }


  function togglePlayerFullscreen() {
    const playerWindow = document.querySelector('.music-player-window');
    const overlay = document.getElementById('music-player-overlay');
    if (playerWindow && overlay) {

      playerWindow.classList.toggle('fullscreen');
      overlay.classList.toggle('fullscreen-active');
    }
  }

  window.togglePlayerFullscreen = togglePlayerFullscreen;


  async function cleanupInvalidSongs() {
    if (musicState.playlist.length === 0) {
      showToast("播放列表是空的，无需清理。");
      return;
    }

    const confirmed = await showCustomConfirm(
      '确认清理无效歌曲？',
      '此操作将检查播放列表中的每一首网络歌曲，并移除所有无法播放的"死链"。本地歌曲不会受影响。', {
      confirmText: '开始清理'
    }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", `正在检查 ${musicState.playlist.length} 首歌曲，这可能需要一些时间...`);

    const originalCount = musicState.playlist.length;
    const checkPromises = musicState.playlist.map(async (track, originalIndex) => {
      if (track.isLocal) {
        return { track, originalIndex, available: true };
      }
      let candidateUrl = track.src;
      if (track.onlineSource) {
        const resolved = await getOnlineMusicServices().resolveSong(track, {
          forceRefresh: true,
          allowCrossPlatform: true
        }).catch(() => null);
        if (resolved?.url) {
          candidateUrl = resolved.url;
          track.src = resolved.url;
          track.onlineResolvedAt = Date.now();
          track.onlineSource = getOnlineMusicServices().toPlaylistTrack(resolved.identity, resolved.url).onlineSource;
        }
      }
      let isAvailable = await checkAudioAvailability(candidateUrl);
      if (!isAvailable && track.onlineSource) {
        const alternative = await getOnlineMusicServices().resolveSong(track, { preferAlternative: true }).catch(() => null);
        if (alternative?.url && await checkAudioAvailability(alternative.url)) {
          candidateUrl = alternative.url;
          track.src = alternative.url;
          track.onlineResolvedAt = Date.now();
          track.onlineSource = getOnlineMusicServices().toPlaylistTrack(alternative.identity, alternative.url).onlineSource;
          isAvailable = true;
        }
      }
      if (!isAvailable) {
        console.warn(`无效链接: ${track.name} - ${track.src}`);
      }
      return { track, originalIndex, available: isAvailable };
    });

    const checkResults = await Promise.all(checkPromises);
    const validPlaylist = checkResults.filter(result => result.available).map(result => result.track);
    const invalidSongs = checkResults.filter(result => !result.available).map(result => ({
      name: result.track.name,
      artist: result.track.artist || '未知歌手',
      originalIndex: result.originalIndex
    }));

    const removedCount = originalCount - validPlaylist.length;

    if (removedCount > 0) {
      const currentPlayingTrack = musicState.playlist[musicState.currentIndex];
      const isCurrentTrackRemoved = invalidSongs.some(song => song.originalIndex === musicState.currentIndex);

      musicState.playlist = validPlaylist;
      await saveGlobalPlaylist();

      if (isCurrentTrackRemoved) {
        audioPlayer.pause();
        audioPlayer.src = '';
        musicState.currentIndex = musicState.playlist.length > 0 ? 0 : -1;
        musicState.isPlaying = false;
      } else if (currentPlayingTrack) {
        musicState.currentIndex = musicState.playlist.indexOf(currentPlayingTrack);
      }

      updatePlaylistUI();
      updatePlayerUI();

      // 显示被清理的歌曲列表模态框
      showCleanedSongsModal(invalidSongs);
    } else {
      await showCustomAlert("检查完成", "所有歌曲链接均有效，无需清理！");
    }
  }

  // 显示被清理歌曲的模态框
  function showCleanedSongsModal(cleanedSongs) {
    const modal = document.getElementById('cleaned-songs-modal');
    const listEl = document.getElementById('cleaned-songs-list');
    listEl.innerHTML = '';
    document.getElementById('select-all-cleaned-songs').checked = false;

    cleanedSongs.forEach(song => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.dataset.songJson = JSON.stringify(song);

      item.innerHTML = `
        <input type="checkbox" class="cleaned-song-checkbox" style="margin-right: 15px;">
        <div class="search-result-info">
          <div class="title">${escapeMusicHtml(song.name)}</div>
          <div class="artist">${escapeMusicHtml(song.artist)}</div>
        </div>
      `;
      listEl.appendChild(item);
    });

    modal.classList.add('visible');
  }

  // 处理重新搜索选中的歌曲
  async function handleResearchSelectedSongs() {
    const modal = document.getElementById('cleaned-songs-modal');
    const checkboxes = modal.querySelectorAll('.cleaned-song-checkbox:checked');

    if (checkboxes.length === 0) {
      await showCustomAlert("提示", "请先选择要重新搜索的歌曲");
      return;
    }

    const selectedSongs = [];
    checkboxes.forEach(cb => {
      const item = cb.closest('.search-result-item');
      const songData = JSON.parse(item.dataset.songJson);
      selectedSongs.push(songData);
    });

    // 关闭被清理歌曲模态框
    modal.classList.remove('visible');

    // 逐个处理
    await processResearchSongsOneByOne(selectedSongs);
  }

  // 逐个处理重新搜索的歌曲
  async function processResearchSongsOneByOne(songs) {
    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      let searchQuery = `${song.name} ${song.artist}`;

      // 让用户确认或修改搜索关键词
      const userQuery = prompt(`第 ${i + 1}/${songs.length} 首\n\n请确认或修改搜索关键词：`, searchQuery);

      if (userQuery === null) {
        // 用户点击取消，询问是否继续下一首
        const continueNext = await showCustomConfirm(
          "已取消",
          `是否继续搜索下一首歌曲？`,
          { confirmText: '继续' }
        );
        if (!continueNext) break;
        continue;
      }

      searchQuery = userQuery.trim();
      if (!searchQuery) {
        await showCustomAlert("提示", "搜索关键词不能为空");
        i--; // 重新处理当前歌曲
        continue;
      }

      // 搜索循环，允许重新输入关键词
      let searchSuccess = false;
      while (!searchSuccess) {
        await showCustomAlert("搜索中...", `正在搜索：${searchQuery}`);

        try {
          // 使用默认的 exhigh 音质搜索
          const searchResults = await searchPublicMusic(searchQuery);

          if (searchResults.length === 0) {
            // 未找到结果，询问是否重新输入关键词
            const choice = await showChoiceModal("未找到结果", [
              { text: `"${searchQuery}" 没有搜索到结果`, value: 'info' },
              { text: '重新输入关键词', value: 'retry' },
              { text: '跳过此歌曲', value: 'skip' },
              { text: '结束搜索', value: 'quit' }
            ]);

            if (choice === 'retry') {
              const newQuery = prompt(`请重新输入搜索关键词：`, searchQuery);
              if (newQuery && newQuery.trim()) {
                searchQuery = newQuery.trim();
                continue; // 继续搜索循环
              } else {
                searchSuccess = true; // 退出搜索循环，继续下一首
                break;
              }
            } else if (choice === 'skip') {
              searchSuccess = true; // 跳过，继续下一首
              break;
            } else if (choice === 'quit') {
              return; // 结束整个搜索流程
            }
            continue;
          }

          // 显示搜索结果让用户选择
          const selectedTrack = await showSongSelectionModal(searchResults, song.name, i + 1, songs.length);

          if (selectedTrack) {
            // 获取歌曲详情并添加到播放列表
            const trackDetails = await getPlayableSongDetails(selectedTrack);

            if (trackDetails) {
              trackDetails.playlistId = trackDetails.playlistId || musicState.activePlaylistId || 'default';
              musicState.playlist.push(trackDetails);
              await saveGlobalPlaylist();
              updatePlaylistUI();
              await showCustomAlert("添加成功", `"${song.name}" 已添加到播放列表`);
              searchSuccess = true; // 成功，继续下一首
            } else {
              await showCustomAlert("添加失败", `无法获取 "${song.name}" 的播放链接`);
              searchSuccess = true; // 失败也继续下一首
            }
          } else {
            // 用户取消或跳过
            searchSuccess = true; // 继续下一首
          }

        } catch (e) {
          console.error(`搜索 "${searchQuery}" 失败:`, e);
          const retry = await showCustomConfirm(
            "搜索出错",
            `搜索 "${searchQuery}" 时出错，是否重新尝试？`,
            { confirmText: '重新尝试' }
          );
          if (!retry) {
            searchSuccess = true; // 不重试，继续下一首
          }
        }
      }
    }

    await showCustomAlert("完成", "所有选中的歌曲已处理完毕");
  }

  // 显示歌曲选择模态框
  function showSongSelectionModal(searchResults, songName, currentIndex, totalCount) {
    return new Promise((resolve) => {
      const modal = document.getElementById('music-search-results-modal');
      const listEl = document.getElementById('search-results-list');
      const headerSpan = modal.querySelector('.modal-header span');

      // 修改标题显示当前进度
      headerSpan.textContent = `选择歌曲 (${currentIndex}/${totalCount}): ${songName}`;

      listEl.innerHTML = '';
      document.getElementById('select-all-music-search').checked = false;

      // 渲染搜索结果（单选模式）
      searchResults.forEach(song => {
        song.preferredQuality = 'exhigh'; // 默认极高音质

        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.dataset.songJson = JSON.stringify(song);
        item.style.cursor = 'pointer';

        let sourceTag = '';
        if (song.source === 'netease') {
          sourceTag = '<span class="source" style="color:#c20c0c; border-color:#c20c0c;">网易云</span>';
        } else if (song.source === 'tencent') {
          sourceTag = '<span class="source" style="color:#00e09e; border-color:#00e09e;">QQ音乐</span>';
        } else {
          sourceTag = '<span class="source" style="color:#3f9f46; border-color:#3f9f46;">酷狗</span>';
        }

        item.innerHTML = `
          <input type="radio" name="song-selection-radio" class="music-search-radio" style="margin-right: 15px;">
          <div class="search-result-info">
            <div class="title">${escapeMusicHtml(song.name)}</div>
            <div class="artist">${escapeMusicHtml(song.artist)} ${sourceTag}</div>
          </div>
        `;

        // 点击整行也能选中
        item.addEventListener('click', (e) => {
          if (e.target.type !== 'radio') {
            const radio = item.querySelector('.music-search-radio');
            radio.checked = true;
          }
        });

        listEl.appendChild(item);
      });

      modal.classList.add('visible');

      // 临时修改按钮文本和功能
      const cancelBtn = document.getElementById('cancel-music-search-btn');
      const confirmBtn = document.getElementById('add-selected-music-btn');

      const originalCancelText = cancelBtn.textContent;
      const originalConfirmText = confirmBtn.textContent;

      cancelBtn.textContent = '跳过';
      confirmBtn.textContent = '确认添加';

      // 取消/跳过按钮
      const handleCancel = () => {
        cleanup();
        resolve(null);
      };

      // 确认按钮
      const handleConfirm = () => {
        const selectedRadio = modal.querySelector('.music-search-radio:checked');
        if (!selectedRadio) {
          alert('请先选择一首歌曲');
          return;
        }

        const item = selectedRadio.closest('.search-result-item');
        const songData = JSON.parse(item.dataset.songJson);
        cleanup();
        resolve(songData);
      };

      const cleanup = () => {
        modal.classList.remove('visible');
        headerSpan.textContent = '搜索结果'; // 恢复标题
        cancelBtn.textContent = originalCancelText;
        confirmBtn.textContent = originalConfirmText;
        cancelBtn.removeEventListener('click', handleCancel);
        confirmBtn.removeEventListener('click', handleConfirm);
      };

      cancelBtn.addEventListener('click', handleCancel);
      confirmBtn.addEventListener('click', handleConfirm);
    });
  }

  // ========== 歌单管理模式（来自 script.js 第 11197~11500 行） ==========

  let isPlaylistManagementMode = false;
  let selectedPlaylistItems = new Set();

  function togglePlaylistManagementMode() {
    isPlaylistManagementMode = !isPlaylistManagementMode;
    const panel = document.getElementById('music-playlist-panel');
    const manageBtn = document.getElementById('manage-playlist-btn');
    const actionBar = document.getElementById('playlist-action-bar');
    const selectAllCheckbox = document.getElementById('select-all-playlist-checkbox');

    panel.classList.toggle('management-mode', isPlaylistManagementMode);

    if (isPlaylistManagementMode) {
      manageBtn.textContent = translations[currentLanguage].done;
      manageBtn.setAttribute('data-lang-key', 'done');
      actionBar.style.display = 'flex';
      selectedPlaylistItems.clear();
      selectAllCheckbox.checked = false;
      updatePlaylistActionBar();
      // 显示复选框
      panel.querySelectorAll('.playlist-item-checkbox').forEach(cb => cb.style.display = 'block');
    } else {
      manageBtn.textContent = translations[currentLanguage].manage;
      manageBtn.setAttribute('data-lang-key', 'manage');
      actionBar.style.display = 'none';
      // 隐藏复选框并取消选中
      panel.querySelectorAll('.playlist-item').forEach(item => {
        item.classList.remove('selected');
        const cb = item.querySelector('.playlist-item-checkbox');
        if (cb) {
          cb.style.display = 'none';
          cb.checked = false;
        }
      });
    }
  }

  function handlePlaylistSelection(index) {
    if (!isPlaylistManagementMode) return;

    const item = document.querySelector(`.playlist-item[data-index="${index}"]`);
    if (!item) return;
    const checkbox = item.querySelector('.playlist-item-checkbox');

    // 切换状态
    const isSelected = selectedPlaylistItems.has(index);
    item.classList.toggle('selected', !isSelected);
    checkbox.checked = !isSelected;

    if (isSelected) {
      selectedPlaylistItems.delete(index);
    } else {
      selectedPlaylistItems.add(index);
    }
    updatePlaylistActionBar();
  }

  function updatePlaylistActionBar() {
    const uploadBtn = document.getElementById('upload-selected-to-catbox-btn');
    const deleteBtn = document.getElementById('delete-selected-songs-btn');
    const moveBtn = document.getElementById('move-to-playlist-btn');
    const count = selectedPlaylistItems.size;
    if (uploadBtn) uploadBtn.textContent = `上传Catbox (${count})`;
    if (deleteBtn) deleteBtn.textContent = `删除 (${count})`;
    if (moveBtn) moveBtn.textContent = `移到歌单 (${count})`;
  }

  function handleSelectAllPlaylistItems() {
    const checkbox = document.getElementById('select-all-playlist-checkbox');
    const shouldSelect = checkbox.checked;

    document.querySelectorAll('.playlist-item').forEach(item => {
      const index = parseInt(item.dataset.index);
      if (isNaN(index)) return;

      item.classList.toggle('selected', shouldSelect);
      item.querySelector('.playlist-item-checkbox').checked = shouldSelect;

      if (shouldSelect) {
        selectedPlaylistItems.add(index);
      } else {
        selectedPlaylistItems.delete(index);
      }
    });
    updatePlaylistActionBar();
  }

  async function executeDeleteSelectedSongs() {
    if (selectedPlaylistItems.size === 0) {
      await showCustomAlert("未选择", "请先选择要删除的歌曲。");
      return;
    }

    const confirmed = await showCustomConfirm(
      '确认删除？',
      `确定要删除选中的 ${selectedPlaylistItems.size} 首歌曲吗？此操作无法撤销。`,
      { confirmText: '确认删除', cancelText: '取消' }
    );

    if (!confirmed) return;

    // 将选中的索引转为数组并从大到小排序（避免删除时索引错乱）
    const indicesToDelete = Array.from(selectedPlaylistItems).sort((a, b) => b - a);

    // 从播放列表中删除歌曲
    for (const index of indicesToDelete) {
      if (index >= 0 && index < musicState.playlist.length) {
        musicState.playlist.splice(index, 1);
      }
    }

    // 如果当前正在播放的歌曲被删除，需要调整currentIndex
    if (indicesToDelete.includes(musicState.currentIndex)) {
      if (musicState.playlist.length > 0) {
        musicState.currentIndex = 0;
        loadCurrentSong();
      } else {
        musicState.currentIndex = -1;
        if (musicState.audio) {
          musicState.audio.pause();
          musicState.audio.src = '';
        }
      }
    } else if (musicState.currentIndex >= musicState.playlist.length) {
      musicState.currentIndex = Math.max(0, musicState.playlist.length - 1);
    }

    await saveGlobalPlaylist();

    await showCustomAlert("删除成功", `已删除 ${indicesToDelete.length} 首歌曲。`);

    selectedPlaylistItems.clear();
    togglePlaylistManagementMode();
    updatePlaylistUI();
  }

  async function executeMoveToPlaylist() {
    if (selectedPlaylistItems.size === 0) {
      await showCustomAlert("未选择", "请先选择要移动的歌曲。");
      return;
    }
    const targetId = await showPlaylistPicker('移动到哪个歌单？');
    if (!targetId) return;
    const targetName = musicState.playlists.find(p => p.id === targetId)?.name || '默认';
    for (const index of selectedPlaylistItems) {
      if (index >= 0 && index < musicState.playlist.length) {
        musicState.playlist[index].playlistId = targetId;
      }
    }
    await saveGlobalPlaylist();
    selectedPlaylistItems.clear();
    togglePlaylistManagementMode();
    updatePlaylistUI();
    await showCustomAlert("移动成功", `已将选中歌曲移到「${targetName}」`);
  }

  async function executeBatchUploadToCatbox() {
    if (!state.apiConfig.catboxEnable || !state.apiConfig.catboxUserHash) {
      await showCustomAlert("功能未开启", "请先在\u201CAPI设置\u201D -> \u201CCatbox.moe\u201D中开启此功能并填写您的 User Hash。");
      return;
    }

    if (selectedPlaylistItems.size === 0) {
      await showCustomAlert("未选择", "请先选择要上传的歌曲。");
      return;
    }

    const indicesToUpload = Array.from(selectedPlaylistItems).filter(index => {
      const song = musicState.playlist[index];
      return song && song.src && !String(song.src).includes('catbox.moe');
    });

    if (indicesToUpload.length === 0) {
      await showCustomAlert("无需上传", "您选择的所有歌曲均已在 Catbox 上。");
      togglePlaylistManagementMode();
      return;
    }

    const confirmed = await showCustomConfirm(
      '确认上传？',
      `即将上传 ${indicesToUpload.length} 首歌曲到 Catbox.moe。\n\n这会转换本地音乐和外部链接，可能需要一些时间并消耗流量。\n（已在 Catbox 上的歌曲将被自动跳过）`,
      { confirmText: '开始上传' }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", `正在开始上传 ${indicesToUpload.length} 首歌曲，请勿关闭页面...`);

    let successCount = 0;
    let failCount = 0;
    const failedNames = [];

    const proxySettings = getNovelAISettings();
    let corsProxy = proxySettings.cors_proxy;
    if (corsProxy === 'custom') {
      corsProxy = proxySettings.custom_proxy_url || '';
    }


    for (const index of indicesToUpload) {
      const song = musicState.playlist[index];
      try {
        let fileToUpload;
        let songName = song.name || 'unknown_track.mp3';

        if (song.isLocal) {
          console.log(`[Catbox 批量上传] 处理本地歌曲: ${song.name}`);
          fileToUpload = new Blob([song.src], { type: song.fileType || 'audio/mpeg' });
        } else {
          console.log(`[Catbox 批量上传] 处理网络歌曲: ${song.name} from ${song.src}`);

          let fetchUrl = song.src;
          if (corsProxy && corsProxy !== '' && !fetchUrl.startsWith('data:')) {
            fetchUrl = corsProxy + encodeURIComponent(song.src);
            console.log(`[Catbox 批量上传] 使用代理下载: ${fetchUrl}`);
          } else {
            console.log(`[Catbox 批量上传] 不使用代理，尝试直连下载... (这在Safari上会失败)`);
          }

          const response = await fetch(fetchUrl);
          if (!response.ok) throw new Error(`下载歌曲失败，状态: ${response.status}`);
          fileToUpload = await response.blob();
        }

        if (!songName.match(/\.(mp3|wav|flac|m4a|ogg)$/i)) {
          songName += '.mp3';
        }

        const newCatboxUrl = await uploadFileToCatbox(new File([fileToUpload], songName, { type: fileToUpload.type }));

        song.src = newCatboxUrl;
        song.isLocal = false;
        delete song.fileType;
        successCount++;

      } catch (error) {
        console.error(`[Catbox 批量上传] 上传失败: ${song.name}`, error);
        failCount++;
        failedNames.push(song.name);
      }
    }

    await saveGlobalPlaylist();

    let summary = `上传完成！\n\n成功: ${successCount} 首`;
    if (failCount > 0) {
      summary += `\n失败: ${failCount} 首\n(${failedNames.join(', ')})`;
    }
    await showCustomAlert("操作完成", summary);

    togglePlaylistManagementMode();
    updatePlaylistUI();
  }

  let neteaseQrPollTimer = null;
  let neteaseQrDeadlineTimer = null;
  let activeNeteaseQrKey = null;
  let neteaseAccountRevision = 0;
  let neteaseQrDeadline = 0;
  let neteaseQrFailures = 0;
  const NETEASE_QR_WAIT = 180000;

  function stopNeteaseQrPolling() {
    if (neteaseQrPollTimer) clearTimeout(neteaseQrPollTimer);
    if (neteaseQrDeadlineTimer) clearTimeout(neteaseQrDeadlineTimer);
    neteaseQrPollTimer = null;
    neteaseQrDeadlineTimer = null;
    activeNeteaseQrKey = null;
    neteaseAccountRevision++;
  }

  function closeMusicAccountCenter() {
    stopNeteaseQrPolling();
    document.getElementById('music-account-modal')?.classList.remove('visible');
  }

  function setNeteaseAccountStatus(message) {
    const status = document.getElementById('netease-account-status');
    if (status) status.textContent = message;
  }

  function showNeteaseProfile(profile) {
    const profileEl = document.getElementById('netease-profile');
    const avatar = document.getElementById('netease-profile-avatar');
    const name = document.getElementById('netease-profile-name');
    const loginBtn = document.getElementById('netease-login-btn');
    const logoutBtn = document.getElementById('netease-logout-btn');
    const qrArea = document.getElementById('netease-qr-area');

    if (profile) {
      profileEl.hidden = false;
      avatar.src = String(profile.avatarUrl || getOnlineMusicServices().PLACEHOLDER_COVER).replace(/^http:\/\//i, 'https://');
      name.textContent = profile.nickname || `用户 ${profile.userId}`;
      loginBtn.hidden = true;
      logoutBtn.hidden = false;
      qrArea.hidden = true;
      setNeteaseAccountStatus('已登录');
    } else {
      profileEl.hidden = true;
      loginBtn.hidden = false;
      loginBtn.disabled = false;
      logoutBtn.hidden = true;
      setNeteaseAccountStatus('未登录，不影响搜索和播放');
    }
  }

  async function renderNeteasePlaylists() {
    const revision = neteaseAccountRevision;
    const section = document.getElementById('netease-playlists-section');
    const loading = document.getElementById('netease-playlists-loading');
    const list = document.getElementById('netease-playlists-list');
    section.hidden = false;
    loading.hidden = false;
    loading.textContent = '正在读取歌单…';
    list.innerHTML = '';
    const retry = document.getElementById('netease-playlists-retry-btn');
    retry.hidden = true;

    try {
      const playlists = await getOnlineMusicServices().account.getUserPlaylists();
      if (revision !== neteaseAccountRevision) return;
      loading.hidden = playlists.length > 0;
      if (playlists.length === 0) loading.textContent = '账号中没有可导入的歌单';

      playlists.forEach(playlist => {
        const item = document.createElement('div');
        item.className = 'music-account-playlist-item';

        const info = document.createElement('div');
        info.className = 'music-account-playlist-info';
        const title = document.createElement('div');
        title.className = 'music-account-playlist-name';
        title.textContent = playlist.name || '未命名歌单';
        const count = document.createElement('div');
        count.className = 'music-account-playlist-count';
        count.textContent = `${playlist.trackCount || 0} 首`;
        info.append(title, count);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'music-account-import-btn';
        button.textContent = '导入';
        button.addEventListener('click', () => importNeteasePlaylist(playlist, button));
        item.append(info, button);
        list.appendChild(item);
      });
    } catch (error) {
      if (revision !== neteaseAccountRevision) return;
      loading.hidden = false;
      loading.textContent = error.message || '歌单读取失败，请稍后重试';
      retry.hidden = false;
      if (error.code === 'login_expired') {
        retry.hidden = true;
        getOnlineMusicServices().account.clearSession();
        showNeteaseProfile(null);
        setNeteaseAccountStatus(error.message);
        document.getElementById('netease-login-btn').textContent = '重新扫码';
      }
    }
  }

  async function refreshNeteaseAccountView() {
    stopNeteaseQrPolling();
    const revision = neteaseAccountRevision;
    const account = getOnlineMusicServices().account;
    const session = account.loadSession();
    const retry = document.getElementById('netease-account-retry-btn');
    const login = document.getElementById('netease-login-btn');
    retry.hidden = true;
    document.getElementById('netease-playlists-section').hidden = true;
    document.getElementById('netease-qr-area').hidden = true;
    if (!session) {
      showNeteaseProfile(null);
      login.textContent = '扫码登录';
      return;
    }

    showNeteaseProfile(session.profile || null);
    login.disabled = true;
    setNeteaseAccountStatus(session.profile ? '正在验证登录状态…' : '扫码已确认，正在读取账号…');
    try {
      const profile = await account.getLoginStatus(session);
      if (revision !== neteaseAccountRevision) return;
      if (!profile) {
        account.clearSession();
        showNeteaseProfile(null);
        setNeteaseAccountStatus('登录已失效，请重新扫码');
        return;
      }
      showNeteaseProfile(profile);
      await renderNeteasePlaylists();
    } catch (error) {
      if (revision !== neteaseAccountRevision) return;
      if (error.code === 'login_expired') {
        account.clearSession();
        showNeteaseProfile(null);
        setNeteaseAccountStatus(error.message);
        login.textContent = '重新扫码';
        return;
      }
      showNeteaseProfile(session.profile || null);
      setNeteaseAccountStatus(`${session.profile ? '' : '扫码已确认，但'}${error.message || '读取账号失败，请重试'}。登录状态已保留。`);
      retry.hidden = false;
      document.getElementById('netease-logout-btn').hidden = false;
      login.textContent = '重新扫码';
    } finally {
      if (revision === neteaseAccountRevision) login.disabled = false;
    }
  }

  async function openMusicAccountCenter() {
    document.getElementById('music-account-modal')?.classList.add('visible');
    await refreshNeteaseAccountView();
  }

  function finishNeteaseQrAttempt(message) {
    stopNeteaseQrPolling();
    document.getElementById('netease-qr-message').textContent = message;
    const login = document.getElementById('netease-login-btn');
    login.disabled = false;
    login.textContent = '重新生成二维码';
    // An expired or failed QR must not continue to invite scanning.
    document.getElementById('netease-qr-image').hidden = true;
    document.getElementById('netease-qr-link').hidden = true;
    setNeteaseAccountStatus(message);
  }

  async function pollNeteaseQrLogin(revision = neteaseAccountRevision) {
    if (revision !== neteaseAccountRevision || !activeNeteaseQrKey) return;
    if (Date.now() >= neteaseQrDeadline) {
      finishNeteaseQrAttempt('等待扫码确认已超时，请重新生成二维码');
      return;
    }
    if (document.hidden) {
      neteaseQrPollTimer = setTimeout(() => pollNeteaseQrLogin(revision), 3000);
      return;
    }
    const key = activeNeteaseQrKey;
    const qrMessage = document.getElementById('netease-qr-message');
    try {
      const account = getOnlineMusicServices().account;
      const result = await account.checkQrLogin(key);
      if (revision !== neteaseAccountRevision || key !== activeNeteaseQrKey) return;
      if (Date.now() >= neteaseQrDeadline) {
        finishNeteaseQrAttempt('等待扫码确认已超时，请重新生成二维码');
        return;
      }
      neteaseQrFailures = 0;
      if (result?.code === 801) {
        qrMessage.textContent = '等待扫码…';
      } else if (result?.code === 802) {
        qrMessage.textContent = '已扫码，请在网易云音乐中确认';
      } else if (result?.code === 803) {
        account.acceptQrLogin(result);
        stopNeteaseQrPolling();
        await refreshNeteaseAccountView();
        return;
      } else if (result?.code === 800) {
        finishNeteaseQrAttempt('二维码已过期，请重新生成');
        return;
      } else {
        finishNeteaseQrAttempt('查询扫码状态：登录服务返回异常结果，请重新生成二维码');
        return;
      }
    } catch (error) {
      if (revision !== neteaseAccountRevision || key !== activeNeteaseQrKey) return;
      neteaseQrFailures++;
      if (!error.retryable || neteaseQrFailures >= 3) {
        finishNeteaseQrAttempt(`${error.message || '查询扫码状态失败'}。请重新生成二维码`);
        return;
      }
      qrMessage.textContent = `${error.message}（连续失败 ${neteaseQrFailures}/3，稍后自动重试）`;
    }
    // Schedule only after the previous request completes; slow requests cannot overlap.
    if (revision === neteaseAccountRevision && key === activeNeteaseQrKey) {
      neteaseQrPollTimer = setTimeout(() => pollNeteaseQrLogin(revision), 3000);
    }
  }

  async function startNeteaseQrLogin() {
    const beforeConfirm = neteaseAccountRevision;
    const confirmed = await showCustomConfirm(
      '使用公共节点扫码登录',
      `本次登录服务：${new URL(getOnlineMusicServices().account.node).hostname}\n登录由第三方公共服务处理，该服务能够接触你的网易云登录会话。请勿在任何页面输入账号、密码或短信验证码。是否继续？`,
      { confirmText: '生成二维码' }
    );
    if (!confirmed || beforeConfirm !== neteaseAccountRevision) return;

    const loginBtn = document.getElementById('netease-login-btn');
    const qrArea = document.getElementById('netease-qr-area');
    const qrImage = document.getElementById('netease-qr-image');
    const qrMessage = document.getElementById('netease-qr-message');
    const qrLink = document.getElementById('netease-qr-link');
    loginBtn.disabled = true;
    setNeteaseAccountStatus('正在生成二维码…');
    stopNeteaseQrPolling();
    const revision = neteaseAccountRevision;
    document.getElementById('netease-account-retry-btn').hidden = true;
    document.getElementById('netease-playlists-section').hidden = true;
    qrArea.hidden = true;

    try {
      const qr = await getOnlineMusicServices().account.createQrLogin();
      if (revision !== neteaseAccountRevision) return;
      activeNeteaseQrKey = qr.key;
      neteaseQrFailures = 0;
      neteaseQrDeadline = Date.now() + NETEASE_QR_WAIT;
      qrImage.src = qr.qrimg;
      qrImage.hidden = false;
      qrLink.href = qr.qrurl;
      qrLink.hidden = !qr.qrurl;
      qrMessage.textContent = '请使用网易云音乐 App 扫码并确认';
      qrArea.hidden = false;
      setNeteaseAccountStatus('等待扫码登录');
      neteaseQrDeadlineTimer = setTimeout(() => {
        if (revision === neteaseAccountRevision) finishNeteaseQrAttempt('等待扫码确认已超时，请重新生成二维码');
      }, NETEASE_QR_WAIT);
      await pollNeteaseQrLogin(revision);
    } catch (error) {
      if (revision !== neteaseAccountRevision) return;
      loginBtn.disabled = false;
      loginBtn.textContent = '重试生成二维码';
      qrArea.hidden = true;
      setNeteaseAccountStatus(error.message || '生成二维码失败，请重试');
      if (getOnlineMusicServices().account.loadSession()) document.getElementById('netease-account-retry-btn').hidden = false;
    }
  }

  async function logoutNeteaseMusic() {
    stopNeteaseQrPolling();
    getOnlineMusicServices().account.clearSession();
    showNeteaseProfile(null);
    document.getElementById('netease-login-btn').textContent = '扫码登录';
    document.getElementById('netease-account-retry-btn').hidden = true;
    document.getElementById('netease-playlists-section').hidden = true;
    document.getElementById('netease-qr-area').hidden = true;
  }

  async function importNeteasePlaylist(remotePlaylist, button) {
    const revision = neteaseAccountRevision;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '导入中…';
    try {
      const songs = await getOnlineMusicServices().account.getUserPlaylistTracks(remotePlaylist.id);
      if (revision !== neteaseAccountRevision) return;
      if (songs.length === 0) throw new Error('这个歌单中没有可导入的歌曲');

      const playlistId = `netease_${remotePlaylist.id}`;
      let localPlaylist = musicState.playlists.find(playlist => playlist.id === playlistId);
      if (!localPlaylist) {
        localPlaylist = {
          id: playlistId,
          name: remotePlaylist.name || '网易云歌单',
          createdAt: Date.now(),
          remoteSource: 'netease',
          remoteId: String(remotePlaylist.id)
        };
        musicState.playlists.push(localPlaylist);
      }

      const existingIds = new Set(musicState.playlist
        .filter(track => (track.playlistId || 'default') === playlistId)
        .map(track => `${track.onlineSource?.platform || ''}:${track.onlineSource?.id || ''}`));
      let addedCount = 0;
      songs.forEach(song => {
        const key = `netease:${song.id}`;
        if (existingIds.has(key)) return;
        const track = getOnlineMusicServices().toPlaylistTrack(song);
        track.playlistId = playlistId;
        musicState.playlist.push(track);
        existingIds.add(key);
        addedCount++;
      });

      musicState.activePlaylistId = playlistId;
      if (musicState.currentIndex === -1 && musicState.playlist.length > 0) {
        musicState.currentIndex = musicState.playlist.findIndex(track => track.playlistId === playlistId);
      }
      await saveGlobalPlaylist();
      updatePlaylistUI();
      updatePlayerUI();
      button.textContent = addedCount > 0 ? `已导入 ${addedCount}` : '已是最新';
      await showCustomAlert('导入完成', addedCount > 0
        ? `已将「${remotePlaylist.name}」中的 ${addedCount} 首歌曲加入一起听。`
        : `「${remotePlaylist.name}」中的歌曲已经全部存在。`);
    } catch (error) {
      console.error('[音乐账号] 导入歌单失败:', error);
      button.textContent = originalText;
      await showCustomAlert('导入失败', error.message || '歌单暂时无法导入，请稍后重试');
    } finally {
      button.disabled = false;
    }
  }

  // 恢复旧版乐谱演奏：保留音色、默认节奏及按钮状态，不使用一起听播放器。
  async function playSynthScore(btnElement, notesJson, instrumentType = 'piano') {
    if (!btnElement || btnElement.disabled) return;

    let synth = null;
    const resetButton = () => {
      btnElement.textContent = '▶';
      btnElement.classList.remove('playing');
      btnElement.disabled = false;
    };
    btnElement.disabled = true;

    try {
      let rawNotes;
      try {
        rawNotes = typeof notesJson === 'string' ? JSON.parse(notesJson) : notesJson;
      } catch (_) {
        throw new Error('乐谱数据格式有误，暂时无法播放');
      }
      if (!Array.isArray(rawNotes)) throw new Error('乐谱数据格式有误，暂时无法播放');
      const notes = rawNotes.map(item => typeof item === 'string'
        ? { n: item, d: '8n' }
        : { n: item?.n, d: item?.d || '4n' })
        .filter(note => typeof note.n === 'string' && /^[A-G][#b]?[0-9]$/.test(note.n));
      if (notes.length === 0) throw new Error('这份乐谱没有可播放的音符');

      const Tone = window.Tone;
      if (!Tone) throw new Error('音频组件未加载，请联网刷新后重试');

      // 在用户点击中解锁音频，完成后再安排音符。
      await Tone.start();
      if (Tone.getContext().state !== 'running') {
        throw new Error('浏览器尚未允许声音播放，请再次点击播放按钮');
      }
      const score = notes.map(note => {
        const seconds = Tone.Time(note.d).toSeconds();
        if (!Number.isFinite(seconds) || seconds <= 0) {
          throw new Error('乐谱中的音符时长有误，暂时无法播放');
        }
        return { ...note, seconds };
      });

      // 与旧实现相同的八种合成音色。
      const presets = {
        piano: {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 },
          volume: -8
        },
        guitar: {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 1 },
          volume: -5
        },
        violin: {
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.2, decay: 0.1, sustain: 0.8, release: 1.5 },
          volume: -10
        },
        flute: {
          oscillator: { type: 'sine' },
          envelope: { attack: 0.1, decay: 0.1, sustain: 0.9, release: 0.5 },
          volume: -8
        },
        guzheng: {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.005, decay: 0.4, sustain: 0, release: 1.5 },
          volume: -5
        },
        kalimba: {
          oscillator: { type: 'sine' },
          envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 1.2 },
          volume: -8
        },
        synth: {
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 2 },
          volume: -8
        },
        chiptune: {
          oscillator: { type: 'square' },
          envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 },
          volume: -8
        }
      };
      const preset = Object.prototype.hasOwnProperty.call(presets, instrumentType)
        ? presets[instrumentType] : presets.piano;
      // 每张乐谱独立合成，避免同时点击不同卡片时互相改变音色。
      synth = new Tone.PolySynth(Tone.Synth);
      synth.toDestination();
      synth.volume.value = preset.volume;
      synth.set({ oscillator: preset.oscillator, envelope: preset.envelope });

      btnElement.textContent = '❚❚';
      btnElement.classList.add('playing');
      const now = Tone.now();
      let accumulatedTime = 0;
      for (const note of score) {
        synth.triggerAttackRelease(note.n, note.d, now + accumulatedTime);
        accumulatedTime += note.seconds;
      }

      setTimeout(resetButton, accumulatedTime * 1000 + 500);
      // 保留余音，再释放本次播放的音频节点。
      setTimeout(() => synth.dispose(),
        (accumulatedTime + Math.max(0.5, preset.envelope.release) + 0.5) * 1000);
    } catch (error) {
      if (synth) synth.dispose();
      resetButton();
      console.error('乐谱播放失败:', error);
      showToast(error.message || '乐谱暂时无法播放，请稍后重试', 'error');
    }
  }

  // ========== 导出到全局作用域 ==========
  window.playSynthScore = playSynthScore;
  window.applyLyricsBarPosition = applyLyricsBarPosition;
  window.getLrcContent = getLrcContent;
  window.saveGlobalPlaylist = saveGlobalPlaylist;
  window.addMusicActionSystemMessage = addMusicActionSystemMessage;
  window.isMusicAwareChat = isMusicAwareChat;
  window.getMusicElapsedTime = getMusicElapsedTime;
  window.openMusicSyncSettings = openMusicSyncSettings;
  window.handleListenTogetherClick = handleListenTogetherClick;
  window.startListenTogetherSession = startListenTogetherSession;
  window.endListenTogetherSession = endListenTogetherSession;
  window.returnToChat = returnToChat;
  window.updateListenTogetherIcon = updateListenTogetherIcon;
  window.updatePlayerUI = updatePlayerUI;
  window.updateElapsedTimeDisplay = updateElapsedTimeDisplay;
  window.updatePlaylistUI = updatePlaylistUI;
  window.getActivePlaylistIndices = getActivePlaylistIndices;
  window.renderPlaylistTabs = renderPlaylistTabs;
  window.showSharePlaylistMenu = showSharePlaylistMenu;
  window.sharePlaylistToCharacter = sharePlaylistToCharacter;
  window.showPlaylistPicker = showPlaylistPicker;
  window.openPlaylistManager = openPlaylistManager;
  window.togglePlayPause = togglePlayPause;
  window.playNext = playNext;
  window.playPrev = playPrev;
  window.changePlayMode = changePlayMode;
  window.updatePlayModeUI = updatePlayModeUI;
  window.addSongFromURL = addSongFromURL;
  window.playSong = playSong;
  window.handleChangeBackground = handleChangeBackground;
  window.handleChangeAlbumArt = handleChangeAlbumArt;
  window.addSongFromLocal = addSongFromLocal;
  window.deleteTrack = deleteTrack;
  window.closeMusicPlayerWithAnimation = closeMusicPlayerWithAnimation;
  window.parseLRC = parseLRC;
  window.renderLyrics = renderLyrics;
  window.updateIslandScrollAnimation = updateIslandScrollAnimation;
  window.checkLyricScroll = checkLyricScroll;
  window.updateActiveLyric = updateActiveLyric;
  window.updateLyricsUI = updateLyricsUI;
  window.formatMusicTime = formatMusicTime;
  window.updateMusicProgressBar = updateMusicProgressBar;
  window.Http_Get = Http_Get;
  window.checkAudioAvailability = checkAudioAvailability;
  window.searchNeteaseMusic = searchNeteaseMusic;
  // Public extension compatibility aliases.
  window.fetchToubiec = async (endpoint, data = {}) => {
    if (endpoint === 'search') return { data: await searchPublicMusic(data.keywords || '') };
    if (endpoint === 'playlist') return { data: await getPublicPlaylist(data.id) };
    if (endpoint === 'album') return { data: await getPublicAlbum(data.id) };
    return null;
  };
  window.searchToubiec = searchPublicMusic;
  window.getToubiecPlaylist = getPublicPlaylist;
  window.getToubiecAlbum = getPublicAlbum;
  window.getToubiecDetail = async () => null;
  window.getToubiecUrl = async id => (await getOnlineMusicServices().resolveSong({ id, source: 'netease' }))?.url || null;
  window.getToubiecLyric = id => getLyricsForSong(id, 'netease');
  window.searchTencentMusic = searchTencentMusic;
  window.addSongFromSearch = addSongFromSearch;
  window.getPlayableSongDetails = getPlayableSongDetails;
  window.getLyricsForSong = getLyricsForSong;
  window.retryOnlineTrackPlayback = retryOnlineTrackPlayback;
  window.handleManualLrcImport = handleManualLrcImport;
  window.toggleBackgroundBlur = toggleBackgroundBlur;
  window.toggleMusicPlayerAvatars = toggleMusicPlayerAvatars;
  window.cleanupInvalidSongs = cleanupInvalidSongs;
  window.showCleanedSongsModal = showCleanedSongsModal;
  window.handleResearchSelectedSongs = handleResearchSelectedSongs;
  window.processResearchSongsOneByOne = processResearchSongsOneByOne;
  window.showSongSelectionModal = showSongSelectionModal;
  window.togglePlaylistManagementMode = togglePlaylistManagementMode;
  window.handlePlaylistSelection = handlePlaylistSelection;
  window.updatePlaylistActionBar = updatePlaylistActionBar;
  window.handleSelectAllPlaylistItems = handleSelectAllPlaylistItems;
  window.executeDeleteSelectedSongs = executeDeleteSelectedSongs;
  window.executeMoveToPlaylist = executeMoveToPlaylist;
  window.openMusicAccountCenter = openMusicAccountCenter;
  window.refreshNeteaseAccountView = refreshNeteaseAccountView;
  window.closeMusicAccountCenter = closeMusicAccountCenter;
  window.startNeteaseQrLogin = startNeteaseQrLogin;
  window.logoutNeteaseMusic = logoutNeteaseMusic;
  window.executeBatchUploadToCatbox = executeBatchUploadToCatbox;
})();
