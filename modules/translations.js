// ========== 从 script.js 第 186~681 行提取 ==========
// 中英文翻译对象 translations、currentLanguage、setLanguage、initLanguage

const translations = {
  'zh-CN': {

    save: '保存',
    cancel: '取消',
    confirm: '确定',
    edit: '编辑',
    done: '完成',
    add: '添加',
    back: '返回',
    next: '下一步',
    close: '关闭',
    reset: '重置',
    upload: '上传',
    send: '发送',
    manage: '管理',
    share: '分享',
    delete: '删除',
    publish: '发布',
    refresh: '刷新',
    search: '搜索',
    remove: '移除',
    finish: '结束',
    details: '详情',
    settings: '设置',
    title: '标题',
    content: '内容',
    category: '分类',
    name: '名称',
    description: '描述',
    status: '状态',
    ok: '好的',
    error: '错误',
    success: '成功',
    warning: '警告',
    loading: '加载中...',
    processing: '处理中...',
    pleaseWait: '请稍候...',
    languageChangedAlert: '语言已切换，页面即将刷新以应用更改。',


    // --- 主屏幕 & Dock ---
    homeAppQQ: 'QQ',
    homeAppWorldBook: '世界书',
    homeAppAppearance: '外观设置',
    homeAppRenderer: '渲染器',
    homeAppApiSettings: '设置',
    homeAppFont: '字体',
    homeAppCPhone: 'CPhone',
    homeAppDouban: '豆瓣',
    homeAppPreset: '预设',
    homeAppTutorial: '教程',
    homeAppWerewolf: '狼人杀',
    homeAppX: 'X',
    homeAppCharGenerator: '角色生成',

    // --- 聊天列表页 ---
    chatListTitle: '消息',
    navMessages: '消息',
    navQzone: '动态',
    navMemories: '回忆',
    navFavorites: '收藏',
    navNpcList: 'NPC',

    // --- QZone & 动态 ---
    qzoneTitle: '好友动态',
    qzoneActionShuoshuo: '说说',
    qzoneActionPost: '动态',
    qzoneActionAlbum: '相册',

    // --- CPhone (角色手机) ---
    cphoneTitleSelect: '选择一部手机',
    cphoneAppQQ: 'QQ',
    cphoneAppAlbum: '相册',
    cphoneAppBrowser: '浏览器',
    cphoneAppTaobao: '淘宝',
    cphoneAppMemo: '备忘录',
    cphoneAppDiary: '日记',
    cphoneAppAmap: '高德地图',
    cphoneAppUsage: 'App记录',
    cphoneAppMusic: '网易云',
    cphoneAppEphone: 'Ephone',
    cphoneAppFootprints: '足迹',
    cphoneAlbumTitle: 'TA的相册',
    cphoneBrowserTitle: 'TA的浏览器历史',
    cphoneTaobaoTitle: 'TA的淘宝订单',
    cphoneWalletTitle: '钱包',
    cphoneMemoTitle: '备忘录',
    cphoneDiaryTitle: '日记',
    cphoneUsageTitle: 'App使用记录',
    cphoneMusicTitle: 'TA的歌单',
    cphoneArticleTitle: '文章',
    cphoneSimulatedChatPlaceholder: '这是模拟对话，无法发送消息',

    // --- 世界书 ---
    worldBookTitle: '世界书',
    worldBookEditorTitle: '编辑世界书',
    worldBookEntryEditorTitle: '编辑条目',
    worldBookNameLabel: '书名',
    worldBookCategoryLabel: '分类',
    worldBookEntriesLabel: '内容条目',
    worldBookAddEntryBtn: '[+] 添加新条目',
    worldBookNamePlaceholder: '请输入世界书的名称...',
    worldBookImportTitle: '导入世界书',

    // --- 预设 ---
    presetTitle: '预设',
    presetEditorTitle: '编辑预设',
    presetNameLabel: '预设名称',
    presetCategoryLabel: '分类',
    presetEntriesLabel: '内容条目',
    presetAddEntryBtn: '[+] 添加新条目',

    // --- 教程 ---
    tutorialTitle: '教程',

    // --- API 设置 ---
    apiSettingsTitle: 'API 设置',
    languageLabel: '语言',
    apiPresetManagement: 'API 预设管理',
    apiPresetSelectLabel: '选择或切换预设',
    apiPrimarySettings: '主API设置 (用于聊天)',
    apiProxyUrlLabel: '反代地址 (不需要添加/v1噢~)',
    apiKeyLabel: '密钥 (API Key)',
    apiModelLabel: '模型',
    apiFetchModelsBtn: '拉取主模型',
    apiSecondarySettings: '副API设置 (用于总结长期记忆)',
    apiSecondaryProxyUrlLabel: '副反代地址',
    apiSecondaryKeyLabel: '副密钥',
    apiSecondaryModelLabel: '副模型',
    apiFetchSecondaryModelsBtn: '拉取副模型',
    apiBackgroundSettings: '后台活动API设置',
    apiBackgroundProxyUrlLabel: '后台反代地址',
    apiBackgroundKeyLabel: '后台密钥',
    apiBackgroundModelLabel: '后台模型',
    apiFetchBackgroundModelsBtn: '拉取后台模型',
    apiBgActivitySettings: '后台活动设置',
    apiEnableBgActivityLabel: '启用后台角色活动',
    apiBgIntervalLabel: '后台活动检测间隔 (秒)',
    apiBlockCooldownLabel: 'AI被拉黑后冷静期 (小时)',
    apiTtsSettings: '语音消息设置 (Minimax TTS)',
    apiTtsModelLabel: '语音模型 (Model)',
    apiPerformanceSettings: '性能与显示设置',
    apiChatListRenderWindowLabel: '聊天列表每次加载条数',
    apiChatRenderWindowLabel: '聊天界面初始加载条数',
    apiImageGenSettings: '生图功能设置',
    apiEnableImageGenLabel: '启用AI生图功能',
    apiEnableNovelAILabel: '启用 NovelAI 图像生成',
    apiNovelAIModelLabel: 'NovelAI 模型',
    apiNovelAIKeyLabel: 'NovelAI API Key',
    apiNovelAIGenSettingsBtn: '生成设置',
    apiNovelAITestBtn: '测试生成',
    apiStorageOptimization: '存储空间优化',
    apiCompressImagesBtn: '一键压缩本地图片',
    apiSaveAllBtn: '保存所有设置',
    apiViewDataDistributionBtn: '查看数据分布',
    apiExportDataBtn: '导出数据',
    apiImportDataBtn: '导入备份文件',
    apiCleanupDataBtn: '清理冗余数据',
    apiDeleteWorldBooksBtn: '删除世界书',
    apiAdvancedCleanupBtn: '高级数据清理',
    apiCheckAndFixDataBtn: '数据检查与修复',

    // --- 聊天界面 ---
    chatHeaderOnline: '在线',
    chatHeaderLongTermMemory: '长期记忆',
    chatHeaderListenTogether: '一起听',
    chatHeaderChatSettings: '聊天设置',
    chatSelectionCancel: '取消',
    chatSelectionScreenshot: '长截图',
    chatSelectionFavorite: '收藏',
    chatSelectionForward: '转发',
    chatSelectionShare: '分享',
    chatSelectionSoftDelete: '删除(通知AI)',
    chatSelectionHardDelete: '彻底删除',
    chatReplyTo: '回复',
    chatInputPlaceholder: '输入消息...',
    chatWaitForReply: '等待回复',

    // --- 外观设置 ---
    appearanceTitle: '外观设置',
    appearanceSaveAll: '保存所有外观设置',

    // --- 字体设置 ---
    fontSettingsTitle: '字体设置',
    fontPresetManagement: '字体预设管理',
    fontFileUrlLabel: '字体文件URL (.ttf, .otf, .woff等)',
    fontLocalUploadLabel: '或上传本地字体文件',
    fontLocalUploadBtn: '选择本地字体',
    fontLocalSizeWarning: '⚠️ 本地字体文件较大，可能导致应用卡顿或闪退。建议使用 5MB 以下的字体文件。',
    fontLocalClearBtn: '清除本地字体',
    fontPreviewLabel: '实时预览',
    fontPreviewText1: '你好世界 Hello World',
    fontPreviewText2: '这是字体预览效果，12345。',
    fontSaveAndApply: '保存并应用',
    fontResetDefault: '恢复默认字体',

    // --- 渲染规则 ---
    rendererTitle: '渲染规则',
    rendererEditorTitle: '编辑规则',
    rendererCreateTitle: '创建新规则',
    rendererRuleName: '规则名称',
    rendererBindScope: '绑定范围',
    rendererScopeGlobal: '公用 (所有角色)',
    rendererRegex: '正则表达式 (使用g作为标志)',
    rendererHtmlTemplate: 'HTML 模板 (用 $1, $2 引用)',
    rendererEnableRule: '启用规则',

    // --- 其他 ---
    myAlbumTitle: '我的相册',
    albumPhotosTitle: '相册名称',
    npcEditorTitleAdd: '添加 NPC',
    npcEditorTitleEdit: '编辑 NPC',
    npcAvatarLabel: 'NPC 头像',
    npcUploadAvatar: '上传头像',
    npcNicknameLabel: 'NPC 昵称',
    npcPersonaLabel: 'NPC 人设',
    npcEnableBgActivity: '启用独立后台活动',
    npcActionCooldown: '独立行动冷却 (分钟)',
    npcAssociatedChars: '关联的角色 (NPC会去评论这些角色的动态)',


  },
  'en': {

    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    edit: 'Edit',
    done: 'Done',
    add: 'Add',
    back: 'Back',
    next: 'Next',
    close: 'Close',
    reset: 'Reset',
    upload: 'Upload',
    send: 'Send',
    manage: 'Manage',
    share: 'Share',
    delete: 'Delete',
    publish: 'Publish',
    refresh: 'Refresh',
    search: 'Search',
    remove: 'Remove',
    finish: 'Finish',
    details: 'Details',
    settings: 'Settings',
    title: 'Title',
    content: 'Content',
    category: 'Category',
    name: 'Name',
    description: 'Description',
    status: 'Status',
    ok: 'OK',
    error: 'Error',
    success: 'Success',
    warning: 'Warning',
    loading: 'Loading...',
    processing: 'Processing...',
    pleaseWait: 'Please wait...',
    languageChangedAlert: 'Language switched. The page will reload to apply changes.',


    // --- Home Screen & Dock ---
    homeAppQQ: 'QQ',
    homeAppWorldBook: 'World Book',
    homeAppAppearance: 'Appearance',
    homeAppRenderer: 'Renderer',
    homeAppApiSettings: 'Settings',
    homeAppFont: 'Fonts',
    homeAppCPhone: 'CPhone',
    homeAppDouban: 'Douban',
    homeAppPreset: 'Presets',
    homeAppTutorial: 'Tutorial',
    homeAppWerewolf: 'Werewolf',
    homeAppX: 'X',
    homeAppCharGenerator: 'Character Generator',

    // --- Chat List Screen ---
    chatListTitle: 'Messages',
    navMessages: 'Messages',
    navQzone: 'Moments',
    navMemories: 'Memories',
    navFavorites: 'Favorites',
    navNpcList: 'NPCs',

    // --- QZone & Moments ---
    qzoneTitle: 'Moments',
    qzoneActionShuoshuo: 'Status',
    qzoneActionPost: 'Post',
    qzoneActionAlbum: 'Album',

    // --- CPhone (Character's Phone) ---
    cphoneTitleSelect: 'Select a Phone',
    cphoneAppQQ: 'QQ',
    cphoneAppAlbum: 'Album',
    cphoneAppBrowser: 'Browser',
    cphoneAppTaobao: 'Taobao',
    cphoneAppMemo: 'Memo',
    cphoneAppDiary: 'Diary',
    cphoneAppAmap: 'Amap',
    cphoneAppUsage: 'App Usage',
    cphoneAppMusic: 'Music',
    cphoneAppEphone: 'Ephone',
    cphoneAppFootprints: 'Footprints',
    cphoneAlbumTitle: 'Their Album',
    cphoneBrowserTitle: 'Their Browser History',
    cphoneTaobaoTitle: 'Their Taobao Orders',
    cphoneWalletTitle: 'Wallet',
    cphoneMemoTitle: 'Memo',
    cphoneDiaryTitle: 'Diary',
    cphoneUsageTitle: 'App Usage Log',
    cphoneMusicTitle: 'Their Playlist',
    cphoneArticleTitle: 'Article',
    cphoneSimulatedChatPlaceholder: 'This is a simulated chat, messages cannot be sent',

    // --- World Book ---
    worldBookTitle: 'World Book',
    worldBookEditorTitle: 'Edit World Book',
    worldBookEntryEditorTitle: 'Edit Entry',
    worldBookNameLabel: 'Book Name',
    worldBookCategoryLabel: 'Category',
    worldBookEntriesLabel: 'Content Entries',
    worldBookAddEntryBtn: '[+] Add New Entry',
    worldBookNamePlaceholder: 'Enter the name of the world book...',
    worldBookImportTitle: 'Import World Book',

    // --- Presets ---
    presetTitle: 'Presets',
    presetEditorTitle: 'Edit Preset',
    presetNameLabel: 'Preset Name',
    presetCategoryLabel: 'Category',
    presetEntriesLabel: 'Content Entries',
    presetAddEntryBtn: '[+] Add New Entry',

    // --- Tutorial ---
    tutorialTitle: 'Tutorial',

    // --- API Settings ---
    apiSettingsTitle: 'API Settings',
    languageLabel: 'Language',
    apiPresetManagement: 'API Preset Management',
    apiPresetSelectLabel: 'Select or Switch Preset',
    apiPrimarySettings: 'Primary API Settings (for Chat)',
    apiProxyUrlLabel: 'Proxy URL (No /v1 needed~)',
    apiKeyLabel: 'API Key',
    apiModelLabel: 'Model',
    apiFetchModelsBtn: 'Fetch Primary Models',
    apiSecondarySettings: 'Secondary API Settings (for Summarization)',
    apiSecondaryProxyUrlLabel: 'Secondary Proxy URL',
    apiSecondaryKeyLabel: 'Secondary API Key',
    apiSecondaryModelLabel: 'Secondary Model',
    apiFetchSecondaryModelsBtn: 'Fetch Secondary Models',
    apiBackgroundSettings: 'Background Activity API Settings',
    apiBackgroundProxyUrlLabel: 'Background Proxy URL',
    apiBackgroundKeyLabel: 'Background API Key',
    apiBackgroundModelLabel: 'Background Model',
    apiFetchBackgroundModelsBtn: 'Fetch Background Models',
    apiTemperatureLabel: 'API Temperature',
    apiBgActivitySettings: 'Background Activity Settings',
    apiEnableBgActivityLabel: 'Enable Background Character Activity',
    apiBgIntervalLabel: 'Background Activity Interval (sec)',
    apiBlockCooldownLabel: 'AI Block Cooldown (hours)',
    apiTtsSettings: 'Voice Message Settings (Minimax TTS)',
    apiTtsModelLabel: 'Voice Model',
    apiPerformanceSettings: 'Performance & Display Settings',
    apiChatListRenderWindowLabel: 'Chat List Batch Load Count',
    apiChatRenderWindowLabel: 'Chat View Initial Load Count',
    apiImageGenSettings: 'Image Generation Settings',
    apiEnableImageGenLabel: 'Enable AI Image Generation',
    apiEnableNovelAILabel: 'Enable NovelAI Image Generation',
    apiNovelAIModelLabel: 'NovelAI Model',
    apiNovelAIKeyLabel: 'NovelAI API Key',
    apiNovelAIGenSettingsBtn: 'Generation Settings',
    apiNovelAITestBtn: 'Test Generation',
    apiStorageOptimization: 'Storage Optimization',
    apiCompressImagesBtn: 'Compress Local Images',
    apiSaveAllBtn: 'Save All Settings',
    apiViewDataDistributionBtn: 'View Data Distribution',
    apiExportDataBtn: 'Export Data',
    apiImportDataBtn: 'Import Backup File',
    apiCleanupDataBtn: 'Cleanup Redundant Data',
    apiDeleteWorldBooksBtn: 'Delete World Books',
    apiAdvancedCleanupBtn: 'Advanced Data Cleanup',
    apiCheckAndFixDataBtn: 'Data Check & Repair',

    // --- Chat Screen ---
    chatHeaderOnline: 'Online',
    chatHeaderLongTermMemory: 'Long-term Memory',
    chatHeaderListenTogether: 'Listen Together',
    chatHeaderChatSettings: 'Chat Settings',
    chatSelectionCancel: 'Cancel',
    chatSelectionScreenshot: 'Long Screenshot',
    chatSelectionFavorite: 'Favorite',
    chatSelectionForward: 'Forward',
    chatSelectionShare: 'Share',
    chatSelectionSoftDelete: 'Delete (Notify AI)',
    chatSelectionHardDelete: 'Erase',
    chatReplyTo: 'Reply to',
    chatInputPlaceholder: 'Type a message...',
    chatWaitForReply: 'Wait for Reply',

    // --- Appearance Settings ---
    appearanceTitle: 'Appearance Settings',
    appearanceSaveAll: 'Save All Appearance Settings',

    // --- Font Settings ---
    fontSettingsTitle: 'Font Settings',
    fontPresetManagement: 'Font Preset Management',
    fontFileUrlLabel: 'Font File URL (.ttf, .otf, .woff, etc.)',
    fontLocalUploadLabel: 'Or upload a local font file',
    fontLocalUploadBtn: 'Choose Local Font',
    fontLocalSizeWarning: '⚠️ Large local font files may cause lag or crashes. Recommended: under 5MB.',
    fontLocalClearBtn: 'Clear Local Font',
    fontPreviewLabel: 'Live Preview',
    fontPreviewText1: 'Hello World 你好世界',
    fontPreviewText2: 'This is a font preview effect, 12345.',
    fontSaveAndApply: 'Save and Apply',
    fontResetDefault: 'Reset to Default Font',

    // --- Renderer ---
    rendererTitle: 'Rendering Rules',
    rendererEditorTitle: 'Edit Rule',
    rendererCreateTitle: 'Create New Rule',
    rendererRuleName: 'Rule Name',
    rendererBindScope: 'Binding Scope',
    rendererScopeGlobal: 'Global (All Characters)',
    rendererRegex: 'Regular Expression (use g flag)',
    rendererHtmlTemplate: 'HTML Template (use $1, $2)',
    rendererEnableRule: 'Enable Rule',

    // --- Others ---
    myAlbumTitle: 'My Albums',
    albumPhotosTitle: 'Album Name',
    npcEditorTitleAdd: 'Add NPC',
    npcEditorTitleEdit: 'Edit NPC',
    npcAvatarLabel: 'NPC Avatar',
    npcUploadAvatar: 'Upload Avatar',
    npcNicknameLabel: 'NPC Nickname',
    npcPersonaLabel: 'NPC Persona',
    npcEnableBgActivity: 'Enable Independent Background Activity',
    npcActionCooldown: 'Independent Action Cooldown (min)',
    npcAssociatedChars: 'Associated Characters (NPC will comment on their moments)',

  }
};

let currentLanguage = 'zh-CN';

function setLanguage(lang) {
  if (!translations[lang]) {
    console.warn(`Language "${lang}" not found. Defaulting to 'zh-CN'.`);
    lang = 'zh-CN';
  }
  currentLanguage = lang;
  localStorage.setItem('ephone-language', lang);
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-lang-key]').forEach(el => {
    const key = el.getAttribute('data-lang-key');
    if (translations[lang][key]) {
      el.textContent = translations[lang][key];
    }
  });

  document.querySelectorAll('[data-lang-key-placeholder]').forEach(el => {
    const key = el.getAttribute('data-lang-key-placeholder');
    if (translations[lang][key]) {
      el.placeholder = translations[lang][key];
    }
  });

  document.querySelectorAll('[data-lang-key-title]').forEach(el => {
    const key = el.getAttribute('data-lang-key-title');
    if (translations[lang][key]) {
      el.title = translations[lang][key];
    }
  });
}

function initLanguage() {
  const savedLang = localStorage.getItem('ephone-language') || 'zh-CN';
  const langSelector = document.getElementById('language-select');

  if (langSelector) {
    langSelector.value = savedLang;
    langSelector.addEventListener('change', (e) => {
      const newLang = e.target.value;
      alert(translations[newLang].languageChangedAlert);
      localStorage.setItem('ephone-language', newLang);
      setTimeout(() => window.location.reload(), 100);
    });
  }
  setLanguage(savedLang);
}

// ========== 全局暴露 ==========
window.initLanguage = initLanguage;
window.translations = translations;
