// ============================================================
// init-db-schema.js
// 数据库 Schema 定义
// 从 init-and-state.js 拆分
// ============================================================

const db = new Dexie('GeminiChatDB');

// memoryCache, memoryRenderCount, isLoadingMoreMemories 已移至 utils.js 全局作用域
// todoCache, todoRenderCount, isLoadingMoreTodos 已移至 utils.js 全局作用域
db.version(50).stores({
  doubanPosts: '++id, timestamp',
  chats: '&id, isGroup, groupId, isPinned, memos, diary, appUsageLog, lastIntelligentSummaryTimestamp',
  apiConfig: '&id, minimaxGroupId, minimaxApiKey',
  globalSettings: '&id',
  userStickers: '&id, url, name, categoryId',
  stickerVisionCache: '&url, description, timestamp',
  worldBooks: '&id, name, categoryId',
  worldBookCategories: '++id, name',
  musicLibrary: '&id',
  personaPresets: '&id',
  qzoneSettings: '&id',
  qzonePosts: '++id, timestamp, authorId',
  qzoneAlbums: '++id, name, createdAt',
  qzonePhotos: '++id, albumId',
  favorites: '++id, type, timestamp, originalTimestamp',
  qzoneGroups: '++id, name',
  memories: '++id, chatId, timestamp, type, targetDate',
  callRecords: '++id, chatId, timestamp, customName',
  shoppingProducts: '++id, name, description, categoryId',
  shoppingCategories: '++id, name',
  apiPresets: '++id, name',
  soundPresets: '++id, name',
  renderingRules: '++id, name, chatId',
  appearancePresets: '++id, name, type',
  stickerCategories: '++id, name',
  customAvatarFrames: '++id, name',
  presets: '&id, name, categoryId',
  presetCategories: '++id, name',
  readingLibrary: '++id, title, lastOpened, linkedStoryId',
  quickReplies: '++id, text, categoryId', // 修改：增加 categoryId 索引
});

// 快捷回复分类系统 - 新增数据表
db.version(51).stores({
  quickReplyCategories: '++id, name',
  npcs: '++id, name, npcGroupId, enableBackgroundActivity, actionCooldownMinutes, lastActionTimestamp',
  npcGroups: '++id, name',
  naiPresets: '++id, name',
  grAuthors: '++id, name',
  grStories: '++id, title, authorId, lastUpdated',
  userWallet: '&id',
  userTransactions: '++id, timestamp, type, amount, description',
  funds: '&id, code, name, riskLevel, currentNav, lastDayNav, history',
  auctions: '++id, status, itemName, endTime', // 拍卖记录
  inventory: '++id, name, type, acquiredTime',
  emails: '++id, sender, senderType, recipient, subject, content, timestamp, isRead'
}).upgrade(tx => {

  return tx.table('worldBooks').toCollection().modify(book => {

    if (typeof book.content === 'string' && book.content.trim() !== '') {
      book.content = [{
        keys: [],
        comment: '从旧版本迁移的条目',
        content: book.content
      }];
    }
  });
});

// 观影播放列表
db.version(52).stores({
  watchTogetherPlaylist: '++id, name, timestamp'
});

// 月经记录相关表
db.version(53).stores({
  periodRecords: '++id, startDate, endDate, flow, symptoms, mood, notes, painLevel, pmsSymptoms, productChanges, sleepQuality, exerciseDuration, createdAt',
  periodSettings: '++id, characterId, enabled, avgCycleLength, avgPeriodLength',
  periodNotificationSettings: '&id, enabled, upcomingDays, upcomingTime, recordTime, abnormalCycleMin, abnormalCycleMax, delayDays'
});

// 番茄钟相关表
db.version(54).stores({
  focusSessions: '++id, companionId, startTime, endTime, duration, completed, stage',
  focusStats: '&id, todayCount, totalCount, streakDays, lastFocusDate',
  focusMessages: '++id, sessionId, companionId, stage, message, timestamp'
});

// 修复：为 shoppingProducts 补充 categoryId 索引
db.version(55).stores({
  shoppingProducts: '++id, name, description, categoryId'
});

window.db = db;
