// ============================================================
// init-and-state.js
// 主入口文件（精简后）
// 内容：DOMContentLoaded 入口、billState/state 定义、
//       loadAllDataFromDB()、saveGlobalPlaylist()、init() 函数壳
// 已拆分到独立文件：
//   - init-avatar-frames.js（头像框数据）
//   - init-db-schema.js（数据库 schema）
//   - init-data-protection.js（数据保护/崩溃恢复/自动保存）
//   - init-crash-recovery.js（崩溃恢复检测）
//   - init-pin-city.js（PIN/城市搜索）
//   - init-event-bindingsA.js（事件绑定前半段）
//   - init-event-bindingsB.js（事件绑定中段）
//   - init-features.js（功能模块后半段）
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

  // ========================================
  // References to globals from split files
  // ========================================
  const db = window.db;
  const avatarFrames = window.avatarFrames;


  let billState = {
    page: 0,
    pageSize: 30,
    isLoading: false,
    hasMore: true,
    filterDate: '',
    filterType: 'all'
  };
  let state = {
    chats: {},
    activeChatId: null,
    globalSettings: {},
    apiConfig: {},
    userStickers: [],
    worldBooks: [],
    personaPresets: [],
    qzoneSettings: {},
    activeAlbumId: null,
    cache: {
      songs: new Map(),
      lyrics: new Map()
    },
    ttsCache: new Map(),
    quickReplies: []
  };

  // 【新增】暴露 state 到 window，供联机功能访问
  window.state = state;
  window.billState = billState;

  async function loadAllDataFromDB() {
    const [
      chatsArr, apiConfig, loadedGlobalSettings, userStickers, worldBooks,
      musicLib, personaPresets, qzoneSettings, initialFavorites,
      allMemories,

      allPresets,
      allQuickReplies
    ] = await Promise.all([
      db.chats.toArray(), db.apiConfig.get('main'), db.globalSettings.get('main'),
      db.userStickers.toArray(), db.worldBooks.toArray(), db.musicLibrary.get('main'),
      db.personaPresets.toArray(), db.qzoneSettings.get('main'), db.favorites.orderBy('timestamp').reverse().toArray(),
      db.memories.toArray(),

      db.presets.toArray(),
      db.quickReplies.toArray()
    ]);


    state.presets = allPresets || [];
    state.quickReplies = allQuickReplies || [];
    await initUserWallet();
    const defaultGlobalSettings = {
      id: 'main',
      showStatusBar: false,
      wallpaper: 'linear-gradient(135deg, #89f7fe, #66a6ff)',
      fontUrl: '',
      fontLocalData: '',
      fontScope: { all: true, homeScreen: true, qq: true, cphone: true, myphone: true, worldBook: true, douban: true, alipay: true, settings: true },
      globalFontSize: 16,
      enableThoughts: false,              // 新增：全局心声开关，默认关闭
      customThoughtsPromptEnabled: false,  // 自定义心声提示词开关，默认关闭
      customThoughtsPrompt: '',            // 自定义心声提示词内容，空字符串表示使用默认
      customSummaryPromptEnabled: false,   // 自定义结构化总结提示词开关，默认关闭
      customSummaryPrompt: '',             // 自定义结构化总结提示词内容，空字符串表示使用默认
      enableQzoneActions: false,          // 新增：全局动态开关，默认关闭
      enableViewMyPhone: false,           // 新增：全局查看User手机开关，默认关闭
      enableCrossChat: true,              // 新增：全局跨聊天消息开关（群聊↔私聊），默认开启
      enableBackgroundActivity: false,
      backgroundActivityInterval: 60,
      enableViewMyPhoneInBackground: false,  // 新增：后台查看用户手机开关，默认关闭
      viewMyPhoneChance: null,               // 新增：后台查看用户手机概率，null=AI自主决定，0-100=按概率触发
      blockCooldownHours: 1,
      apiTemperature: 0.8,
      appIcons: {
        ...DEFAULT_APP_ICONS
      },
      cphoneWallpaper: 'linear-gradient(135deg, #f6d365, #fda085)',
      cphoneAppIcons: {
        ...DEFAULT_CPHONE_ICONS
      },
      myphoneWallpaper: 'linear-gradient(135deg, #a8edea, #fed6e3)',
      myphoneAppIcons: {
        ...DEFAULT_MYPHONE_ICONS
      },
      globalCss: '',
      notificationSoundUrl: '',
      notificationVolume: 1.0, // 消息提示音音量 (0.0-1.0)
      soundPresets: [], // 消息提示音预设列表
      widgetData: {},
      globalChatBackground: '',
      enableAiDrawing: true,
      showPhoneFrame: false,
      lockScreenEnabled: false,
      lockScreenPassword: '',
      lockScreenWallpaper: '',
      alwaysShowMusicIsland: false,
      detachStatusBar: false,
      enableMinimalChatUI: false,
      chatActionButtonsOrder: null,
      shoppingCategoryCount: 3,
      shoppingProductCount: 8,
      chatRenderWindow: 50,
      safeRenderMode: false,
      dropdownPopupMode: false,
      systemNotification: {
        enabled: false,
        appName: 'EPhone',
        notifyInChatPage: false,  // 在聊天页面也发送通知
        disableInternalNotification: false,  // 禁用内部弹窗
        pushServer: {
          enabled: false,
          serverUrl: '',
          apiKey: ''
        },
        vibration: {
          enabled: false,
          pattern: 'short'
        },
        sound: {
          enabled: false,
          useGlobalSound: true,
          customSoundUrl: ''
        }
      },
    };
    state.globalSettings = {
      ...defaultGlobalSettings,
      ...(loadedGlobalSettings || {})
    };

    // 确保 systemNotification 配置完整
    if (!state.globalSettings.systemNotification) {
      state.globalSettings.systemNotification = defaultGlobalSettings.systemNotification;
    } else {
      state.globalSettings.systemNotification = {
        ...defaultGlobalSettings.systemNotification,
        ...state.globalSettings.systemNotification,
        pushServer: {
          ...defaultGlobalSettings.systemNotification.pushServer,
          ...(state.globalSettings.systemNotification.pushServer || {})
        },
        vibration: {
          ...defaultGlobalSettings.systemNotification.vibration,
          ...(state.globalSettings.systemNotification.vibration || {})
        },
        sound: {
          ...defaultGlobalSettings.systemNotification.sound,
          ...(state.globalSettings.systemNotification.sound || {})
        }
      };
    }

    state.globalSettings.appIcons = {
      ...defaultGlobalSettings.appIcons,
      ...(state.globalSettings.appIcons || {})
    };
    state.globalSettings.cphoneAppIcons = {
      ...defaultGlobalSettings.cphoneAppIcons,
      ...(state.globalSettings.cphoneAppIcons || {})
    };
    state.globalSettings.myphoneAppIcons = {
      ...defaultGlobalSettings.myphoneAppIcons,
      ...(state.globalSettings.myphoneAppIcons || {})
    };

    chatsArr.forEach(chat => {
      if (typeof chat.settings.enableTimePerception === 'undefined') {
        chat.settings.enableTimePerception = true;
      }
      if (!chat.settings.lyricsPosition) {
        chat.settings.lyricsPosition = {
          vertical: 'top',
          horizontal: 'center',
          offset: 10
        };
      }
      if (!chat.isGroup && !chat.settings.myAvatarLibrary) {
        chat.settings.myAvatarLibrary = [];
      }
      if (!chat.isGroup && typeof chat.originalName === 'undefined') {
        chat.originalName = chat.name;
      }
    });
    state.chats = chatsArr.reduce((acc, chat) => {
      if (typeof chat.unreadCount === 'undefined') chat.unreadCount = 0;
      if (chat.isGroup) {
        if (typeof chat.settings.enableBackgroundActivity === 'undefined') {
          chat.settings.enableBackgroundActivity = true;
        }
        if (chat.members && chat.members.length > 0 && chat.members[0].name) {
          chat.members.forEach(member => {
            if (typeof member.originalName === 'undefined') {
              member.originalName = member.name;
              member.groupNickname = member.name;
              delete member.name;
            }
          });
        }
      }
      if (!chat.settings) chat.settings = {};
      if (typeof chat.settings.actionCooldownMinutes === 'undefined') {
        chat.settings.actionCooldownMinutes = 10;
      }
      if (!chat.isGroup && !chat.status) chat.status = {
        text: '在线',
        lastUpdate: Date.now(),
        isBusy: false
      };
      // 初始化USER状态
      if (!chat.settings.userStatus) chat.settings.userStatus = {
        text: '在线',
        lastUpdate: Date.now(),
        isBusy: false
      };
      if (!chat.isGroup && !chat.relationship) chat.relationship = {
        status: 'friend',
        blockedTimestamp: null,
        applicationReason: ''
      };
      if (!chat.isGroup && (!chat.settings || !chat.settings.aiAvatarLibrary)) {
        if (!chat.settings) chat.settings = {};
        chat.settings.aiAvatarLibrary = [];
      }
      if (chat.isGroup) {
        (chat.members || []).forEach(member => {
          if (typeof member.avatarFrame === 'undefined') member.avatarFrame = '';
        });
      }
      if (!chat.musicData) chat.musicData = {
        totalTime: 0
      };
      if (chat.settings && chat.settings.linkedWorldBookId && !chat.settings.linkedWorldBookIds) {
        chat.settings.linkedWorldBookIds = [chat.settings.linkedWorldBookId];
        delete chat.settings.linkedWorldBookId;
      }
      if (typeof chat.isPinned === 'undefined') chat.isPinned = false;
      if (!chat.isGroup && typeof chat.settings.myNickname === 'undefined') {
        chat.settings.myNickname = '我';
      }
      if (chat.isGroup && chat.members) {
        let needsUpdate = false;
        chatsArr.forEach(c => {
          if (c.id === chat.id && c.originalName) {
            delete c.originalName;
          }
        });
        chat.members.forEach(member => {
          const originalCharacter = chatsArr.find(c => c.id === member.id);
          if (originalCharacter && originalCharacter.settings) {
            const correctAvatar = originalCharacter.settings.aiAvatar;
            if (correctAvatar && member.avatar !== correctAvatar) {
              member.avatar = correctAvatar;
              needsUpdate = true;
            }
            const correctFrame = originalCharacter.settings.aiAvatarFrame || '';
            if (member.avatarFrame !== correctFrame) {
              member.avatarFrame = correctFrame;
              needsUpdate = true;
            }
          } else if (typeof member.avatarFrame === 'undefined') {
            member.avatarFrame = '';
            needsUpdate = true;
          }
        });
        if (needsUpdate) db.chats.put(chat);
      }
      if (!chat.settings.enableAutoMemory) chat.settings.enableAutoMemory = false;
      if (!chat.settings.autoMemoryInterval) chat.settings.autoMemoryInterval = 20;
      if (typeof chat.settings.enableDiaryMode === 'undefined') chat.settings.enableDiaryMode = false;
      if (typeof chat.settings.memoryMode === 'undefined') {
        // 兼容旧数据：根据已有开关推断模式
        if (chat.settings.enableStructuredMemory) chat.settings.memoryMode = 'structured';
        else chat.settings.memoryMode = 'diary';
      }
      if (!chat.longTermMemory) chat.longTermMemory = [];
      if (!chat.lastMemorySummaryTimestamp) chat.lastMemorySummaryTimestamp = 0;
      if (!chat.isGroup) {
        if (typeof chat.settings.enableBackgroundActivity === 'undefined') {
          chat.settings.enableBackgroundActivity = true;
        }
        if (typeof chat.settings.enableTts === 'undefined') {
          chat.settings.enableTts = false;
        }
        if (typeof chat.settings.enableAutoCartClear === 'undefined') {
          chat.settings.enableAutoCartClear = false;
        }
        if (!chat.status) chat.status = {
          text: '在线',
          lastUpdate: Date.now(),
          isBusy: false
        };
        // 初始化USER状态
        if (!chat.settings.userStatus) chat.settings.userStatus = {
          text: '在线',
          lastUpdate: Date.now(),
          isBusy: false
        };
        if (!chat.relationship) chat.relationship = {
          status: 'friend',
          blockedTimestamp: null,
          applicationReason: ''
        };
        if (!chat.settings || !chat.settings.aiAvatarLibrary) {
          if (!chat.settings) chat.settings = {};
          chat.settings.aiAvatarLibrary = [];
        }
        if (typeof chat.settings.isOfflineMode === 'undefined') chat.settings.isOfflineMode = false;
        if (typeof chat.settings.offlineMinLength === 'undefined') chat.settings.offlineMinLength = 100;
        if (typeof chat.settings.offlineMaxLength === 'undefined') chat.settings.offlineMaxLength = 300;
        if (typeof chat.settings.offlineContinuousLayout === 'undefined') chat.settings.offlineContinuousLayout = false;

        if (typeof chat.settings.injectLatestThought === 'undefined') {
          chat.settings.injectLatestThought = false;
        }

        // 新增：初始化心声和动态功能开关
        if (typeof chat.settings.enableThoughts === 'undefined') {
          chat.settings.enableThoughts = null; // null表示使用全局设置
        }
        if (typeof chat.settings.enableQzoneActions === 'undefined') {
          chat.settings.enableQzoneActions = null; // null表示使用全局设置
        }
        if (typeof chat.settings.enableViewMyPhone === 'undefined') {
          chat.settings.enableViewMyPhone = null; // null表示使用全局设置
        }
        if (typeof chat.settings.enableCrossChat === 'undefined') {
          chat.settings.enableCrossChat = null; // null表示使用全局设置
        }
        
        // 新增：初始化后台查看用户手机设置
        if (typeof chat.settings.enableViewMyPhoneInBackground === 'undefined') {
          chat.settings.enableViewMyPhoneInBackground = null; // null表示使用全局设置
        }
        if (typeof chat.settings.viewMyPhoneChance === 'undefined') {
          chat.settings.viewMyPhoneChance = null; // null表示使用全局设置
        }

        if (typeof chat.heartfeltVoice === 'undefined') chat.heartfeltVoice = '...';
        if (typeof chat.randomJottings === 'undefined') chat.randomJottings = '...';
        if (!Array.isArray(chat.thoughtsHistory)) {
          chat.thoughtsHistory = [];
        }
      }
      if (typeof chat.settings.stickerCategoryIds === 'undefined') {

        if (chat.settings.stickerCategoryId) {

          chat.settings.stickerCategoryIds = [chat.settings.stickerCategoryId];
        } else {

          chat.settings.stickerCategoryIds = [];
        }

        delete chat.settings.stickerCategoryId;
      }
      acc[chat.id] = chat;
      return acc;
    }, {});
    const memoriesToUpdate = [];
    allMemories.forEach(memory => {
      if (memory.type === 'ai_generated' && memory.authorName && !memory.authorId) {
        const foundChat = chatsArr.find(c => !c.isGroup && c.originalName === memory.authorName);
        if (foundChat) {
          memory.authorId = foundChat.id;
          memoriesToUpdate.push(memory);
        } else {
          const fallbackChat = chatsArr.find(c => !c.isGroup && c.name === memory.authorName);
          if (fallbackChat) {
            memory.authorId = fallbackChat.id;
            memoriesToUpdate.push(memory);
          }
        }
      }
    });
    if (memoriesToUpdate.length > 0) {
      await db.memories.bulkPut(memoriesToUpdate);
    }
    state.apiConfig = apiConfig || {
      id: 'main',
      proxyUrl: '',
      apiKey: '',
      model: '',
      secondaryProxyUrl: '',
      secondaryApiKey: '',
      secondaryModel: '',
      backgroundProxyUrl: '',
      backgroundApiKey: '',
      backgroundModel: '',
      minimaxGroupId: '',
      minimaxApiKey: '',
      minimaxModel: 'speech-01',
      imgbbEnable: false,
      imgbbApiKey: '',

      catboxEnable: false,
      catboxUserHash: '',
      githubEnable: false, // 默认为关闭
      githubAutoBackup: false,
      githubUsername: '',
      githubRepo: '',
      githubToken: '',
      githubFilename: 'ephone_backup.json'
    };
    if (localStorage.getItem('imgbb-enabled') !== null) {
      state.apiConfig.imgbbEnable = localStorage.getItem('imgbb-enabled') === 'true';
    }
    if (localStorage.getItem('imgbb-api-key') !== null) {
      state.apiConfig.imgbbApiKey = localStorage.getItem('imgbb-api-key');
    }
    if (localStorage.getItem('catbox-enabled') !== null) {
      state.apiConfig.catboxEnable = localStorage.getItem('catbox-enabled') === 'true';
    }
    if (localStorage.getItem('catbox-userhash') !== null) {
      state.apiConfig.catboxUserHash = localStorage.getItem('catbox-userhash');
    }
    if (localStorage.getItem('minimax-group-id') !== null) {
      state.apiConfig.minimaxGroupId = localStorage.getItem('minimax-group-id');
    }
    if (localStorage.getItem('minimax-api-key') !== null) {
      state.apiConfig.minimaxApiKey = localStorage.getItem('minimax-api-key');
    }
    if (localStorage.getItem('minimax-model') !== null) {
      state.apiConfig.minimaxModel = localStorage.getItem('minimax-model');
    }
    if (localStorage.getItem('github-proxy-enabled') !== null) {
      state.apiConfig.githubProxyEnable = localStorage.getItem('github-proxy-enabled') === 'true';
    }
    if (localStorage.getItem('github-proxy-url') !== null) {
      state.apiConfig.githubProxyUrl = localStorage.getItem('github-proxy-url');
    }
    state.userStickers = userStickers || [];
    state.worldBooks = worldBooks || [];
    musicState.playlist = musicLib?.playlist || [];
    musicState.playlists = musicLib?.playlists || [{ id: 'default', name: '默认', createdAt: Date.now() }];
    musicState.activePlaylistId = musicLib?.activePlaylistId || 'default';
    // 给没有playlistId的旧歌曲补上默认值
    musicState.playlist.forEach(t => { if (!t.playlistId) t.playlistId = 'default'; });
    state.personaPresets = personaPresets || [];
    state.qzoneSettings = qzoneSettings || {
      id: 'main',
      nickname: '{{user}}',
      avatar: 'https://files.catbox.moe/q6z5fc.jpeg',
      banner: 'https://files.catbox.moe/r5heyt.gif'
    };
    allFavoriteItems = initialFavorites || [];
  }

  // 暴露 loadAllDataFromDB 到 window，供其他模块调用
  window.loadAllDataFromDB = loadAllDataFromDB;


  async function saveGlobalPlaylist() {
    await db.musicLibrary.put({
      id: 'main',
      playlist: musicState.playlist,
      playlists: musicState.playlists,
      activePlaylistId: musicState.activePlaylistId
    });
  }



  async function init() {

    // ==================== Event Bindings A (from init-event-bindingsA.js) ====================
    await window.initEventBindingsA(state, db);


    // ==================== Event Bindings B (from init-event-bindingsB.js) ====================
    window.initEventBindingsB(state, db);

    // ==================== Features (from init-features.js) ====================
    window.initFeatures(state, db);

    initLockScreen();
    checkForUpdates();
    updateLockedFeatureUI();
    initSystemNotification();
    initializeBackgroundKeepAlive();
    bindBackgroundKeepAliveEvents();
    loadBackgroundKeepAliveSettings();
    loadShoppingCart(); // 加载购物车数据
    showScreen('home-screen');
  }

  init();

});
