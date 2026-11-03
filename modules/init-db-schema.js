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

// 聊天设置模板系统
db.version(56).stores({
  chatSettingsPresets: '++id, name, createdAt'
});

// 副API预设系统
db.version(57).stores({
  secondaryApiPresets: '++id, name'
});

// 思维链预设系统
db.version(58).stores({
  thoughtChainPresets: '++id, name'
});

// 回复守护：保存未完成的 AI 回复任务与用户自定义保活音频。
// 只新增独立表，不修改任何既有表结构或数据。
db.version(59).stores({
  replyTasks: '&id, chatId, status, updatedAt, createdAt',
  keepAliveAssets: '&id, updatedAt'
});

// MCP 使用独立表，避免改变任何既有聊天或设置数据结构。
db.version(60).stores({
  mcpConnections: '&id, type, enabled, status, updatedAt',
  mcpActivities: '&id, connectionId, status, chatId, createdAt',
  mcpSettings: '&id',
  mcpSecrets: '&id'
});

// 邮箱通信生态：保留旧 emails 表及所有旧字段，仅增加可选索引和独立数据表。
// 旧邮件会在邮箱首次打开时按需补齐方向、文件夹、线程与联系人关联。
db.version(61).stores({
  emails: '++id, &uid, threadId, contactId, direction, folder, status, sender, senderType, recipient, subject, timestamp, scheduledAt, isRead, isStarred',
  mailThreads: '&id, contactId, status, lastTimestamp, eventId',
  mailContacts: '&id, email, name, relationshipStatus, chatId, lastContactAt, blocked',
  mailAccounts: '&id, &email, isDefault',
  mailEvents: '&id, type, status, contactId, threadId, nextActionAt, createdAt',
  mailPublicBoxes: '&id, email, category',
  mailSettings: '&id'
});

// 番茄钟可靠性与扩展数据：保留旧表和旧字段，仅增加可选索引及独立状态表。
db.version(62).stores({
  focusSessions: '++id, companionId, startTime, endTime, duration, completed, stage, phase, taskId, taskChatId, round',
  focusStats: '&id, todayCount, totalCount, streakDays, lastFocusDate',
  focusMessages: '++id, sessionId, companionId, stage, message, timestamp, format',
  focusActiveState: '&id, sessionId, status, phase, updatedAt',
  focusEvents: '++id, sessionId, type, timestamp'
});

// 用户自制小组件：定义与每次放置填写的私有内容分开保存。
db.version(63).stores({
  customWidgetPackages: '&id, name, updatedAt',
  customWidgetInstances: '&id, packageId, updatedAt'
});

// 幕后沟通与生成偏好独立保存，不进入角色历史或记忆。
db.version(64).stores({
  modelDiscussions: '&id, chatId, updatedAt',
  generationPreferences: '&id, chatId, scope, updatedAt'
});

// 视频文件单独存储；dataUrl 可被现有 JSON 备份完整序列化。
db.version(65).stores({ videoAttachments: '&id, chatId' });

// 信息 APP：与 QQ、邮箱分别保存，通过明确的参考设置互通。
db.version(66).stores({
  smsSettings: '&id',
  smsContacts: '&id, &number, chatId, updatedAt',
  smsMessages: '&id, contactId, timestamp, batchId',
  smsMemories: '&id, contactId, createdAt',
  smsJobs: '&id, contactId, status, dueAt'
});

window.db = db;
