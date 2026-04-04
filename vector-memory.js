// ========================================
// 向量记忆系统 (Vector Memory System)
// 三层记忆架构：核心记忆 + 向量检索 + 时间线摘要
// 双通道检索：语义向量 + 关键词标签
// ========================================

class VectorMemoryManager {
  constructor() {
    this.CATEGORIES = {
      F: { name: '偏好/事实', color: '#007aff', icon: 'F' },
      E: { name: '事件', color: '#34c759', icon: 'E' },
      D: { name: '决定', color: '#ff9500', icon: 'D' },
      P: { name: '计划/待办', color: '#5856d6', icon: 'P' },
      R: { name: '关系变化', color: '#ff2d55', icon: 'R' },
      M: { name: '情绪节点', color: '#af52de', icon: 'M' },
      C: { name: '核心记忆', color: '#ff3b30', icon: 'C' }
    };
    this.embeddingCache = new Map();
    this._embeddingQueue = [];
    this._isProcessingQueue = false;
  }

  // ==================== 数据结构初始化 ====================

  getVectorMemory(chat) {
    if (!chat.vectorMemory) {
      chat.vectorMemory = {
        fragments: [],
        coreMemories: [],
        timelineSummaries: {},
        settings: {
          topN: 8,
          embeddingModel: '',
          embeddingEndpoint: '',
          useCustomEmbedding: false,
          scoreWeights: { semantic: 0.4, keyword: 0.3, importance: 0.15, emotion: 0.1, recency: 0.05 },
          customExtractionPrompt: '',
          useCustomExtractionPrompt: false,
          enableDateTrigger: true,
          enableEmotionTrigger: true,
          enableTopicTrigger: true,
          enablePeriodicReview: true,
          reviewIntervalDays: 7
        },
        lastExtractionTimestamp: 0,
        lastReviewTimestamp: 0,
        _customCategories: {},
        stats: { totalFragments: 0, totalRecalls: 0, lastUpdated: 0 }
      };
    }
    // 兼容旧数据
    const vm = chat.vectorMemory;
    if (!vm.fragments) vm.fragments = [];
    if (!vm.coreMemories) vm.coreMemories = [];
    if (!vm.timelineSummaries) vm.timelineSummaries = {};
    if (!vm.settings) vm.settings = {};
    if (!vm.settings.scoreWeights) vm.settings.scoreWeights = { semantic: 0.4, keyword: 0.3, importance: 0.15, emotion: 0.1, recency: 0.05 };
    if (!vm._customCategories) vm._customCategories = {};
    if (!vm.stats) vm.stats = { totalFragments: 0, totalRecalls: 0, lastUpdated: 0 };
    return vm;
  }

  // ==================== 核心记忆（第一层：永远注入） ====================

  getCoreMemories(chat) {
    const vm = this.getVectorMemory(chat);
    return vm.coreMemories || [];
  }

  addCoreMemory(chat, content) {
    const vm = this.getVectorMemory(chat);
    const id = 'core_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    vm.coreMemories.push({ id, content, createdAt: Date.now() });
    return id;
  }

  editCoreMemory(chat, id, newContent) {
    const vm = this.getVectorMemory(chat);
    const mem = vm.coreMemories.find(m => m.id === id);
    if (mem) mem.content = newContent;
  }

  deleteCoreMemory(chat, id) {
    const vm = this.getVectorMemory(chat);
    vm.coreMemories = vm.coreMemories.filter(m => m.id !== id);
  }

  pinToCoreMemory(chat, fragmentId) {
    const vm = this.getVectorMemory(chat);
    const fragment = vm.fragments.find(f => f.id === fragmentId);
    if (fragment) {
      this.addCoreMemory(chat, fragment.content);
    }
  }

  serializeCoreMemories(chat) {
    const cores = this.getCoreMemories(chat);
    if (cores.length === 0) return '';
    let output = '## 核心记忆（永久）\n';
    cores.forEach(m => { output += `- ${m.content}\n`; });
    return output;
  }

  // ==================== 记忆片段管理（第二层：向量检索） ====================

  createFragment(chat, data) {
    const vm = this.getVectorMemory(chat);
    const id = 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const fragment = {
      id,
      content: data.content,
      tags: data.tags || [],
      category: data.category || 'E',
      importance: data.importance || 5,
      emotionalWeight: data.emotionalWeight || 3,
      createdAt: data.createdAt || Date.now(),
      lastRecalled: 0,
      recallCount: 0,
      embedding: data.embedding || null,
      linkedMemories: data.linkedMemories || [],
      source: data.source || 'auto',
      context: data.context || ''
    };
    vm.fragments.push(fragment);
    vm.stats.totalFragments = vm.fragments.length;
    vm.stats.lastUpdated = Date.now();
    return id;
  }

  editFragment(chat, id, updates) {
    const vm = this.getVectorMemory(chat);
    const frag = vm.fragments.find(f => f.id === id);
    if (!frag) return false;
    if (updates.content !== undefined) { frag.content = updates.content; frag.embedding = null; }
    if (updates.tags !== undefined) frag.tags = updates.tags;
    if (updates.category !== undefined) frag.category = updates.category;
    if (updates.importance !== undefined) frag.importance = updates.importance;
    if (updates.emotionalWeight !== undefined) frag.emotionalWeight = updates.emotionalWeight;
    if (updates.linkedMemories !== undefined) frag.linkedMemories = updates.linkedMemories;
    if (updates.context !== undefined) frag.context = updates.context;
    vm.stats.lastUpdated = Date.now();
    return true;
  }

  deleteFragment(chat, id) {
    const vm = this.getVectorMemory(chat);
    vm.fragments = vm.fragments.filter(f => f.id !== id);
    // 清理关联引用
    vm.fragments.forEach(f => {
      f.linkedMemories = (f.linkedMemories || []).filter(lid => lid !== id);
    });
    vm.stats.totalFragments = vm.fragments.length;
    vm.stats.lastUpdated = Date.now();
  }

  getFragment(chat, id) {
    const vm = this.getVectorMemory(chat);
    return vm.fragments.find(f => f.id === id) || null;
  }

  getAllFragments(chat) {
    const vm = this.getVectorMemory(chat);
    return vm.fragments || [];
  }

  // ==================== Embedding 相关 ====================

  async getEmbedding(text, chat) {
    if (!text || !text.trim()) return null;
    const cacheKey = text.trim().substring(0, 200);
    if (this.embeddingCache.has(cacheKey)) return this.embeddingCache.get(cacheKey);

    try {
      const vm = this.getVectorMemory(chat);
      const apiConfig = window.state?.apiConfig || {};
      let endpoint, apiKey, model;

      if (vm.settings.useCustomEmbedding && vm.settings.embeddingEndpoint) {
        endpoint = vm.settings.embeddingEndpoint;
        apiKey = vm.settings.embeddingApiKey || apiConfig.apiKey;
        model = vm.settings.embeddingModel || 'text-embedding-3-small';
      } else {
        // 使用主API或副API
        const useSecondary = apiConfig.secondaryProxyUrl && apiConfig.secondaryApiKey;
        endpoint = useSecondary ? apiConfig.secondaryProxyUrl : apiConfig.proxyUrl;
        apiKey = useSecondary ? apiConfig.secondaryApiKey : apiConfig.apiKey;
        model = 'text-embedding-3-small';
      }

      if (!endpoint || !apiKey) {
        console.warn('[向量记忆] 无可用的Embedding API配置，使用关键词模式');
        return null;
      }

      const url = endpoint.endsWith('/') ? endpoint + 'v1/embeddings' : endpoint + '/v1/embeddings';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: text.trim() })
      });

      if (!response.ok) {
        console.warn(`[向量记忆] Embedding API 返回 ${response.status}`);
        return null;
      }

      const data = await response.json();
      const embedding = data?.data?.[0]?.embedding || null;
      if (embedding) this.embeddingCache.set(cacheKey, embedding);
      return embedding;
    } catch (e) {
      console.warn('[向量记忆] Embedding 请求失败:', e.message);
      return null;
    }
  }

  async batchGetEmbeddings(texts, chat) {
    const results = [];
    for (const text of texts) {
      const emb = await this.getEmbedding(text, chat);
      results.push(emb);
    }
    return results;
  }

  // ==================== 检索引擎（双通道） ====================

  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  keywordMatch(queryTokens, tags) {
    if (!queryTokens.length || !tags.length) return 0;
    const lowerTags = tags.map(t => t.toLowerCase());
    let matches = 0;
    for (const token of queryTokens) {
      const lt = token.toLowerCase();
      if (lowerTags.some(tag => tag.includes(lt) || lt.includes(tag))) matches++;
    }
    return matches / Math.max(queryTokens.length, 1);
  }

  tokenize(text) {
    if (!text) return [];
    // 简单分词：中文按字/词切分，英文按空格，去除标点和停用词
    const stopWords = new Set(['的', '了', '是', '在', '我', '你', '他', '她', '它', '们', '这', '那', '有', '和', '与', '也', '都', '就', '不', '吗', '呢', '吧', '啊', '哦', '嗯', '呀', '哈', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'and', 'in', 'on', 'at', 'for', 'with', 'i', 'you', 'he', 'she', 'it', 'we', 'they']);
    const tokens = [];
    // 提取中文词组（2-4字）
    const cnMatches = text.match(/[\u4e00-\u9fff]{2,4}/g) || [];
    cnMatches.forEach(m => { if (!stopWords.has(m)) tokens.push(m); });
    // 提取英文单词
    const enMatches = text.match(/[a-zA-Z]+/g) || [];
    enMatches.forEach(m => { if (m.length > 1 && !stopWords.has(m.toLowerCase())) tokens.push(m); });
    // 提取数字（日期、金额等）
    const numMatches = text.match(/\d+/g) || [];
    numMatches.forEach(m => { if (m.length >= 2) tokens.push(m); });
    return [...new Set(tokens)];
  }

  timeDecay(timestamp) {
    const daysSince = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
    // 半衰期30天的指数衰减
    return Math.exp(-0.693 * daysSince / 30);
  }

  async retrieveRelevant(chat, queryText, topN = null) {
    const vm = this.getVectorMemory(chat);
    if (!vm.fragments.length) return [];
    if (!topN) topN = vm.settings.topN || 8;
    const weights = vm.settings.scoreWeights;

    // 通道A：语义检索
    const queryEmbedding = await this.getEmbedding(queryText, chat);

    // 通道B：关键词检索
    const queryTokens = this.tokenize(queryText);

    // 评分
    const scored = vm.fragments.map(frag => {
      const semanticScore = queryEmbedding && frag.embedding
        ? this.cosineSimilarity(queryEmbedding, frag.embedding) : 0;
      const keywordScore = this.keywordMatch(queryTokens, frag.tags || []);
      // 也对内容做关键词匹配作为补充
      const contentTokens = this.tokenize(frag.content);
      const contentKeywordScore = this.keywordMatch(queryTokens, contentTokens);
      const combinedKeyword = Math.max(keywordScore, contentKeywordScore * 0.7);

      const importanceScore = (frag.importance || 5) / 10;
      const emotionScore = (frag.emotionalWeight || 3) / 10;
      const recencyScore = this.timeDecay(frag.createdAt);

      const totalScore =
        semanticScore * (weights.semantic || 0.4) +
        combinedKeyword * (weights.keyword || 0.3) +
        importanceScore * (weights.importance || 0.15) +
        emotionScore * (weights.emotion || 0.1) +
        recencyScore * (weights.recency || 0.05);

      return { fragment: frag, score: totalScore, semanticScore, keywordScore: combinedKeyword };
    });

    // 排序取topN
    scored.sort((a, b) => b.score - a.score);
    let results = scored.slice(0, topN);

    // 拉取关联记忆
    const resultIds = new Set(results.map(r => r.fragment.id));
    const linkedToAdd = [];
    for (const r of results) {
      for (const linkedId of (r.fragment.linkedMemories || [])) {
        if (!resultIds.has(linkedId)) {
          const linked = vm.fragments.find(f => f.id === linkedId);
          if (linked) {
            linkedToAdd.push({ fragment: linked, score: r.score * 0.8, semanticScore: 0, keywordScore: 0 });
            resultIds.add(linkedId);
          }
        }
      }
    }
    results = results.concat(linkedToAdd);

    // 更新召回统计
    for (const r of results) {
      r.fragment.lastRecalled = Date.now();
      r.fragment.recallCount = (r.fragment.recallCount || 0) + 1;
    }
    vm.stats.totalRecalls++;

    return results;
  }

  // ==================== 主动回忆机制 ====================

  getDateTriggeredMemories(chat) {
    const vm = this.getVectorMemory(chat);
    if (!vm.settings.enableDateTrigger) return [];
    const now = new Date();
    const todayMMDD = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const results = [];
    for (const frag of vm.fragments) {
      for (const tag of (frag.tags || [])) {
        // 匹配日期标签如 "3月15日", "0315", "03-15"
        const dateMatch = tag.match(/(\d{1,2})[月\-\/](\d{1,2})/);
        if (dateMatch) {
          const mm = String(dateMatch[1]).padStart(2, '0');
          const dd = String(dateMatch[2]).padStart(2, '0');
          if (mm + dd === todayMMDD) {
            results.push(frag);
            break;
          }
        }
      }
      // 检查周年纪念
      if (frag.category === 'R' || frag.category === 'E') {
        const fragDate = new Date(frag.createdAt);
        if (fragDate.getMonth() === now.getMonth() && fragDate.getDate() === now.getDate() && fragDate.getFullYear() !== now.getFullYear()) {
          if (!results.includes(frag)) results.push(frag);
        }
      }
    }
    return results;
  }

  // ==================== 时间线摘要（第三层） ====================

  getTimelineSummary(chat) {
    const vm = this.getVectorMemory(chat);
    return vm.timelineSummaries || {};
  }

  updateTimelineSummary(chat, period, summary) {
    const vm = this.getVectorMemory(chat);
    vm.timelineSummaries[period] = { content: summary, updatedAt: Date.now() };
  }

  serializeTimelineSummary(chat) {
    const summaries = this.getTimelineSummary(chat);
    if (!Object.keys(summaries).length) return '';
    let output = '## 最近动态\n';
    const order = ['3h', '6h', '1d', '3d', '7d', '30d'];
    const labels = { '3h': '最近3小时', '6h': '最近6小时', '1d': '今天', '3d': '最近3天', '7d': '最近一周', '30d': '最近一个月' };
    for (const key of order) {
      if (summaries[key] && summaries[key].content) {
        output += `[${labels[key] || key}] ${summaries[key].content}\n`;
      }
    }
    return output;
  }

  // ==================== 序列化为 Prompt ====================

  async serializeForPrompt(chat, recentMessages = '') {
    const vm = this.getVectorMemory(chat);
    let output = '';

    // 第一层：核心记忆（永远注入）
    const coreStr = this.serializeCoreMemories(chat);
    if (coreStr) output += coreStr + '\n';

    // 第二层：向量检索（按需注入）
    if (recentMessages && vm.fragments.length > 0) {
      const results = await this.retrieveRelevant(chat, recentMessages);
      if (results.length > 0) {
        output += '## 相关记忆\n';
        for (const r of results) {
          const cat = this.CATEGORIES[r.fragment.category] || { icon: '-' };
          const dateStr = new Date(r.fragment.createdAt).toLocaleDateString('zh-CN');
          output += `[${cat.icon}] ${r.fragment.content} (${dateStr})\n`;
        }
        output += '\n';
      }
    }

    // 主动回忆：日期触发
    const dateTriggers = this.getDateTriggeredMemories(chat);
    if (dateTriggers.length > 0) {
      output += '## 今日相关记忆\n';
      for (const frag of dateTriggers) {
        const cat = this.CATEGORIES[frag.category] || { icon: '-' };
        output += `[${cat.icon}] ${frag.content}\n`;
      }
      output += '\n';
    }

    // 第三层：时间线摘要
    const timelineStr = this.serializeTimelineSummary(chat);
    if (timelineStr) output += timelineStr + '\n';

    if (!output.trim()) output = '(暂无记忆)\n';

    return `## 你的记忆档案（向量记忆系统）
以下是根据当前对话智能检索出的相关记忆。你必须像读取自己的记忆一样理解这些数据，在对话中自然引用。
${output}`;
  }

  // ==================== AI 提取记忆 ====================

  buildExtractionPrompt(chat, formattedHistory, timeRangeStr) {
    const vm = this.getVectorMemory(chat);
    const userNickname = chat.settings.myNickname || (window.state?.qzoneSettings?.nickname || '用户');

    let summarySettingContext = '';
    if (window.state && window.state.worldBooks) {
      const summaryWorldBook = window.state.worldBooks.find(wb => wb.name === '总结设定');
      if (summaryWorldBook) {
        const enabledEntries = summaryWorldBook.content.filter(e => e.enabled !== false).map(e => e.content).join('\n');
        if (enabledEntries) summarySettingContext = `\n# 【总结规则 (最高优先级)】\n${enabledEntries}\n`;
      }
    }

    // 用户自定义提取提示词
    if (vm.settings.useCustomExtractionPrompt && vm.settings.customExtractionPrompt && vm.settings.customExtractionPrompt.trim()) {
      return vm.settings.customExtractionPrompt
        .replace(/\{\{角色名\}\}/g, chat.originalName || chat.name)
        .replace(/\{\{用户昵称\}\}/g, userNickname)
        .replace(/\{\{用户人设\}\}/g, chat.settings.myPersona || '未设置')
        .replace(/\{\{角色人设\}\}/g, chat.settings.aiPersona || '')
        .replace(/\{\{时间范围\}\}/g, timeRangeStr)
        .replace(/\{\{对话记录\}\}/g, formattedHistory)
        .replace(/\{\{总结设定\}\}/g, summarySettingContext);
    }

    return `${summarySettingContext}
# 你的任务
你是"${chat.originalName || chat.name}"。请阅读下面的对话记录，提取【值得长期记忆】的信息，输出为JSON数组格式的记忆片段。

# 对话时间范围
${timeRangeStr}

# 输出格式（严格遵守）
你的回复必须是一个JSON数组，每个元素格式如下：
\`\`\`json
[
  {
    "content": "记忆内容（简短但完整）",
    "tags": ["关键词1", "关键词2", "关键词3"],
    "category": "F/E/D/P/R/M",
    "importance": 1-10,
    "emotionalWeight": 1-10,
    "context": "当时的简短上下文"
  }
]
\`\`\`

# 分类说明
- F = 偏好/事实（用户的喜好、习惯、个人信息）
- E = 事件（发生了什么重要的事）
- D = 重要决定
- P = 计划/待办（未来要做的事）
- R = 关系变化（关系状态的转折点）
- M = 情绪节点（重要的情感时刻）

# tags 标签规则（非常重要）
- 每条记忆必须有3-6个关键词标签
- 标签要包含：人名、地点、物品、时间、情感、主题等
- 如果涉及日期，标签中要包含日期（如"3月15日"、"周五"）
- 标签越精准，未来检索越准确

# importance 评分规则
- 9-10：核心事实（生日、重要承诺、关系里程碑）
- 7-8：重要事件（第一次做某事、重要决定）
- 5-6：一般重要（偏好、习惯）
- 3-4：次要信息（临时计划、一般事件）
- 1-2：低重要度（可能有用但不关键）

# emotionalWeight 评分规则
- 9-10：强烈情感（表白、吵架、和好、感动落泪）
- 7-8：明显情感（开心、难过、惊喜）
- 5-6：一般情感
- 3-4：轻微情感
- 1-2：几乎无情感色彩

# 提取规则
1. 宁可少记，不要滥记
2. 每条记忆都应该是"值得珍藏"的
3. 不要记录日常问候、寒暄、临时闲聊
4. 从"${chat.originalName || chat.name}"的第一人称视角记录
5. 如果两条记忆有关联，在context中注明

# 你的角色设定
${chat.settings.aiPersona || '(未设置)'}

# 你的聊天对象
${userNickname}（人设：${chat.settings.myPersona || '未设置'}）

# 待提取的对话记录
${formattedHistory}

请直接输出JSON数组，不要输出其他内容。如果没有值得记录的内容，输出空数组 []。`;
  }

  parseExtractionResult(rawText) {
    try {
      // 尝试提取JSON数组
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      const arr = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(arr)) return [];
      return arr.filter(item => item && item.content).map(item => ({
        content: String(item.content).trim(),
        tags: Array.isArray(item.tags) ? item.tags.map(t => String(t).trim()) : [],
        category: this.CATEGORIES[item.category] ? item.category : 'E',
        importance: Math.min(10, Math.max(1, parseInt(item.importance) || 5)),
        emotionalWeight: Math.min(10, Math.max(1, parseInt(item.emotionalWeight) || 3)),
        context: item.context ? String(item.context).trim() : ''
      }));
    } catch (e) {
      console.error('[向量记忆] 解析提取结果失败:', e);
      return [];
    }
  }

  async mergeExtractedMemories(chat, extractedItems) {
    const vm = this.getVectorMemory(chat);
    const newIds = [];
    for (const item of extractedItems) {
      // 去重：检查是否已有非常相似的记忆
      const isDuplicate = vm.fragments.some(f => {
        const contentSim = this._textSimilarity(f.content, item.content);
        return contentSim > 0.8;
      });
      if (isDuplicate) continue;

      // 生成embedding
      const embedding = await this.getEmbedding(item.content, chat);

      const id = this.createFragment(chat, {
        content: item.content,
        tags: item.tags,
        category: item.category,
        importance: item.importance,
        emotionalWeight: item.emotionalWeight,
        embedding,
        source: 'auto',
        context: item.context
      });
      newIds.push(id);
    }

    // 自动关联：新记忆之间如果有共同标签，建立关联
    for (let i = 0; i < newIds.length; i++) {
      for (let j = i + 1; j < newIds.length; j++) {
        const fragA = this.getFragment(chat, newIds[i]);
        const fragB = this.getFragment(chat, newIds[j]);
        if (fragA && fragB) {
          const commonTags = (fragA.tags || []).filter(t => (fragB.tags || []).includes(t));
          if (commonTags.length >= 2) {
            if (!fragA.linkedMemories.includes(fragB.id)) fragA.linkedMemories.push(fragB.id);
            if (!fragB.linkedMemories.includes(fragA.id)) fragB.linkedMemories.push(fragA.id);
          }
        }
      }
    }

    vm.lastExtractionTimestamp = Date.now();
    return newIds;
  }

  _textSimilarity(a, b) {
    if (!a || !b) return 0;
    const setA = new Set(this.tokenize(a));
    const setB = new Set(this.tokenize(b));
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const t of setA) { if (setB.has(t)) intersection++; }
    return intersection / Math.max(setA.size, setB.size);
  }

  // ==================== 导入导出 ====================

  exportMemory(chat) {
    const vm = this.getVectorMemory(chat);
    const exportData = {
      version: '1.0',
      exportedAt: Date.now(),
      characterName: chat.originalName || chat.name,
      coreMemories: vm.coreMemories,
      fragments: vm.fragments.map(f => ({
        ...f,
        embedding: null // 导出时不包含embedding，导入时重新生成
      })),
      timelineSummaries: vm.timelineSummaries,
      settings: vm.settings,
      _customCategories: vm._customCategories
    };
    return JSON.stringify(exportData, null, 2);
  }

  async importMemory(chat, jsonString, mode = 'merge') {
    try {
      const data = JSON.parse(jsonString);
      if (!data.version) throw new Error('无效的向量记忆导出文件');

      const vm = this.getVectorMemory(chat);

      if (mode === 'replace') {
        vm.coreMemories = data.coreMemories || [];
        vm.fragments = [];
        vm.timelineSummaries = data.timelineSummaries || {};
      }

      // 导入核心记忆
      if (mode === 'merge' && data.coreMemories) {
        for (const core of data.coreMemories) {
          if (!vm.coreMemories.some(c => c.content === core.content)) {
            vm.coreMemories.push({ ...core, id: 'core_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) });
          }
        }
      }

      // 导入记忆片段（重新生成embedding）
      if (data.fragments) {
        let imported = 0;
        for (const frag of data.fragments) {
          const isDuplicate = vm.fragments.some(f => this._textSimilarity(f.content, frag.content) > 0.8);
          if (isDuplicate && mode === 'merge') continue;

          const embedding = await this.getEmbedding(frag.content, chat);
          this.createFragment(chat, {
            content: frag.content,
            tags: frag.tags || [],
            category: frag.category || 'E',
            importance: frag.importance || 5,
            emotionalWeight: frag.emotionalWeight || 3,
            embedding,
            linkedMemories: [],
            source: 'import',
            context: frag.context || ''
          });
          imported++;
        }
        return imported;
      }

      // 导入设置
      if (data.settings) {
        vm.settings = { ...vm.settings, ...data.settings };
      }
      if (data._customCategories) {
        vm._customCategories = { ...vm._customCategories, ...data._customCategories };
      }

      return data.fragments ? data.fragments.length : 0;
    } catch (e) {
      console.error('[向量记忆] 导入失败:', e);
      throw e;
    }
  }

  // ==================== 统计信息 ====================

  getStats(chat) {
    const vm = this.getVectorMemory(chat);
    const frags = vm.fragments || [];
    const catCounts = {};
    for (const f of frags) {
      catCounts[f.category] = (catCounts[f.category] || 0) + 1;
    }
    const embeddedCount = frags.filter(f => f.embedding).length;
    const avgImportance = frags.length > 0 ? (frags.reduce((s, f) => s + (f.importance || 5), 0) / frags.length).toFixed(1) : 0;
    return {
      totalFragments: frags.length,
      coreMemories: (vm.coreMemories || []).length,
      embeddedCount,
      categoryCounts: catCounts,
      avgImportance,
      totalRecalls: vm.stats.totalRecalls || 0,
      lastUpdated: vm.stats.lastUpdated || 0,
      estimatedTokens: this.estimateTokens(chat)
    };
  }

  estimateTokens(chat) {
    const vm = this.getVectorMemory(chat);
    // 核心记忆token
    let total = (vm.coreMemories || []).reduce((s, m) => s + m.content.length, 0);
    // 预估检索结果token（topN条）
    const topN = vm.settings.topN || 8;
    const frags = [...(vm.fragments || [])].sort((a, b) => (b.importance || 5) - (a.importance || 5));
    const topFrags = frags.slice(0, topN);
    total += topFrags.reduce((s, f) => s + f.content.length, 0);
    // 时间线摘要
    const summaries = vm.timelineSummaries || {};
    for (const s of Object.values(summaries)) {
      if (s && s.content) total += s.content.length;
    }
    return Math.ceil(total / 1.5);
  }

  // ==================== UI 渲染 ====================

  renderMemoryUI(chat, container) {
    const vm = this.getVectorMemory(chat);
    const stats = this.getStats(chat);
    container.innerHTML = '';

    // 工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'vm-toolbar';
    toolbar.innerHTML = `
      <button class="vm-toolbar-btn" id="vm-add-fragment-btn">添加记忆</button>
      <button class="vm-toolbar-btn" id="vm-add-core-btn">添加核心记忆</button>
      <button class="vm-toolbar-btn" id="vm-settings-btn">设置</button>
      <button class="vm-toolbar-btn" id="vm-batch-toggle-btn">批量</button>
      <div style="flex:1"></div>
      <button class="vm-toolbar-btn" id="vm-export-btn">导出</button>
      <button class="vm-toolbar-btn" id="vm-import-btn">导入</button>
      <button class="vm-toolbar-btn vm-primary" id="vm-summary-btn">总结</button>
    `;
    container.appendChild(toolbar);

    // 批量操作工具栏（默认隐藏）
    const batchBar = document.createElement('div');
    batchBar.className = 'vm-batch-toolbar';
    batchBar.id = 'vm-batch-toolbar';
    batchBar.style.display = 'none';
    batchBar.innerHTML = `
      <span class="vm-batch-count">已选 <span id="vm-batch-selected-count">0</span> 项</span>
      <button class="vm-batch-btn" id="vm-batch-select-all-btn">全选</button>
      <button class="vm-batch-btn" id="vm-batch-copy-btn">复制</button>
      <button class="vm-batch-btn" id="vm-batch-export-btn">导出选中</button>
      <button class="vm-batch-btn vm-batch-danger" id="vm-batch-delete-btn">删除选中</button>
      <button class="vm-batch-btn" id="vm-batch-cancel-btn">取消</button>
    `;
    container.appendChild(batchBar);

    // 统计栏
    const statsBar = document.createElement('div');
    statsBar.className = 'vm-stats';
    let statsHtml = '<div class="vm-stats-row">';
    statsHtml += `<span>核心 ${stats.coreMemories}</span>`;
    statsHtml += `<span>片段 ${stats.totalFragments}</span>`;
    statsHtml += `<span>已向量化 ${stats.embeddedCount}</span>`;
    statsHtml += `<span>召回 ${stats.totalRecalls}次</span>`;
    statsHtml += `<span>≈ ${stats.estimatedTokens} Tokens</span>`;
    statsHtml += '</div>';
    statsBar.innerHTML = statsHtml;
    container.appendChild(statsBar);

    // 核心记忆区
    if (vm.coreMemories.length > 0) {
      const coreSection = document.createElement('div');
      coreSection.className = 'vm-section vm-core-section';
      coreSection.innerHTML = `
        <div class="vm-section-header">
          <div class="vm-section-select-all vm-batch-element" data-type="core" style="display:none"></div>
          <span class="vm-section-tag" style="background:#ff3b30">C</span>
          <span class="vm-section-title">核心记忆（永久注入）</span>
          <span class="vm-section-count">${vm.coreMemories.length}</span>
        </div>
      `;
      const list = document.createElement('div');
      list.className = 'vm-section-list';
      vm.coreMemories.forEach((mem, idx) => {
        const row = document.createElement('div');
        row.className = 'vm-item-row';
        row.innerHTML = `
          <div class="vm-item-checkbox vm-batch-element" data-type="core" data-id="${mem.id}" style="display:none"></div>
          <span class="vm-item-content">${this._escapeHtml(mem.content)}</span>
          <div class="vm-item-actions">
            <button class="vm-item-btn vm-edit-core-btn" data-id="${mem.id}" title="编辑">编辑</button>
            <button class="vm-item-btn vm-delete-core-btn" data-id="${mem.id}" title="删除">删除</button>
          </div>
        `;
        list.appendChild(row);
      });
      coreSection.appendChild(list);
      container.appendChild(coreSection);
    }

    // 记忆片段区（按分类分组）
    const categories = { ...this.CATEGORIES, ...(vm._customCategories || {}) };
    for (const [code, catInfo] of Object.entries(categories)) {
      const frags = vm.fragments.filter(f => f.category === code);
      if (frags.length === 0 && code !== 'C') continue;
      if (code === 'C') continue; // 核心记忆已单独渲染

      const section = document.createElement('div');
      section.className = 'vm-section';
      section.innerHTML = `
        <div class="vm-section-header">
          <div class="vm-section-select-all vm-batch-element" data-type="fragment" data-category="${code}" style="display:none"></div>
          <span class="vm-section-tag" style="background:${catInfo.color || '#666'}">${code}</span>
          <span class="vm-section-title">${catInfo.name}</span>
          <span class="vm-section-count">${frags.length}</span>
        </div>
      `;
      const list = document.createElement('div');
      list.className = 'vm-section-list';

      // 按重要度排序
      frags.sort((a, b) => (b.importance || 5) - (a.importance || 5));

      frags.forEach(frag => {
        const row = document.createElement('div');
        row.className = 'vm-item-row';
        const dateStr = new Date(frag.createdAt).toLocaleDateString('zh-CN');
        const embIcon = frag.embedding ? 'vec' : '!';
        const tagsStr = (frag.tags || []).slice(0, 4).join(', ');
        row.innerHTML = `
          <div class="vm-item-checkbox vm-batch-element" data-type="fragment" data-id="${frag.id}" style="display:none"></div>
          <div class="vm-item-main">
            <span class="vm-item-content">${this._escapeHtml(frag.content)}</span>
            <div class="vm-item-meta">
              <span class="vm-meta-tag">${embIcon} ${dateStr}</span>
              <span class="vm-meta-tag">重要度:${frag.importance || 5}</span>
              <span class="vm-meta-tag">情感:${frag.emotionalWeight || 3}</span>
              ${tagsStr ? `<span class="vm-meta-tag">${tagsStr}</span>` : ''}
              ${frag.recallCount > 0 ? `<span class="vm-meta-tag">召回${frag.recallCount}次</span>` : ''}
            </div>
          </div>
          <div class="vm-item-actions">
            <button class="vm-item-btn vm-pin-btn" data-id="${frag.id}" title="钉选为核心记忆">PIN</button>
            <button class="vm-item-btn vm-edit-frag-btn" data-id="${frag.id}" title="编辑">编辑</button>
            <button class="vm-item-btn vm-delete-frag-btn" data-id="${frag.id}" title="删除">删除</button>
          </div>
        `;
        list.appendChild(row);
      });
      section.appendChild(list);
      container.appendChild(section);
    }

    // 空状态
    if (vm.coreMemories.length === 0 && vm.fragments.length === 0) {
      container.innerHTML += `
        <div style="text-align:center; color: var(--text-secondary, #999); margin-top: 20px; padding: 20px;">
          <p style="font-size: 24px; margin-bottom: 8px; color: var(--text-secondary, #999);">向量记忆</p>
          <p>还没有向量记忆数据</p>
          <p style="font-size: 12px; margin-top: 5px;">开启自动总结后，对话内容会自动提取为向量记忆</p>
          <p style="font-size: 12px;">你也可以点击上方按钮手动添加</p>
        </div>
      `;
    }
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==================== 默认提取提示词模板 ====================

  getDefaultExtractionPrompt() {
    return `{{总结设定}}
# 你的任务
你是"{{角色名}}"。请阅读下面的对话记录，提取【值得长期记忆】的信息，输出为JSON数组格式的记忆片段。

# 对话时间范围
{{时间范围}}

# 输出格式（严格遵守）
你的回复必须是一个JSON数组，每个元素格式如下：
\`\`\`json
[
  {
    "content": "记忆内容（简短但完整）",
    "tags": ["关键词1", "关键词2", "关键词3"],
    "category": "F/E/D/P/R/M",
    "importance": 1-10,
    "emotionalWeight": 1-10,
    "context": "当时的简短上下文"
  }
]
\`\`\`

# 分类说明
- F = 偏好/事实（用户的喜好、习惯、个人信息）
- E = 事件（发生了什么重要的事）
- D = 重要决定
- P = 计划/待办（未来要做的事）
- R = 关系变化（关系状态的转折点）
- M = 情绪节点（重要的情感时刻）

# tags 标签规则（非常重要）
- 每条记忆必须有3-6个关键词标签
- 标签要包含：人名、地点、物品、时间、情感、主题等
- 如果涉及日期，标签中要包含日期（如"3月15日"、"周五"）
- 标签越精准，未来检索越准确

# importance 评分规则
- 9-10：核心事实（生日、重要承诺、关系里程碑）
- 7-8：重要事件（第一次做某事、重要决定）
- 5-6：一般重要（偏好、习惯）
- 3-4：次要信息（临时计划、一般事件）
- 1-2：低重要度（可能有用但不关键）

# emotionalWeight 评分规则
- 9-10：强烈情感（表白、吵架、和好、感动落泪）
- 7-8：明显情感（开心、难过、惊喜）
- 5-6：一般情感
- 3-4：轻微情感
- 1-2：几乎无情感色彩

# 提取规则
1. 宁可少记，不要滥记
2. 每条记忆都应该是"值得珍藏"的
3. 不要记录日常问候、寒暄、临时闲聊
4. 从"{{角色名}}"的第一人称视角记录
5. 如果两条记忆有关联，在context中注明

# 你的角色设定
{{角色人设}}

# 你的聊天对象
{{用户昵称}}（人设：{{用户人设}}）

# 待提取的对话记录
{{对话记录}}

请直接输出JSON数组，不要输出其他内容。如果没有值得记录的内容，输出空数组 []。`;
  }

  // ==================== 设置面板渲染 ====================

  renderSettingsPanel(chat) {
    const vm = this.getVectorMemory(chat);
    const s = vm.settings;
    const defaultPrompt = this.getDefaultExtractionPrompt();
    const promptContent = s.customExtractionPrompt || defaultPrompt;
    return `
      <div class="vm-settings-panel">
        <div class="vm-settings-group">
          <h4>检索设置</h4>
          <div class="vm-setting-item">
            <label>每次检索数量 (Top N)</label>
            <input type="number" id="vm-topn" value="${s.topN || 8}" min="1" max="30" class="vm-input">
          </div>
          <div class="vm-setting-item">
            <label>评分权重</label>
            <div class="vm-weights">
              <div><span>语义相似度</span><input type="number" id="vm-w-semantic" value="${s.scoreWeights.semantic}" min="0" max="1" step="0.05" class="vm-input-sm"></div>
              <div><span>关键词匹配</span><input type="number" id="vm-w-keyword" value="${s.scoreWeights.keyword}" min="0" max="1" step="0.05" class="vm-input-sm"></div>
              <div><span>重要度</span><input type="number" id="vm-w-importance" value="${s.scoreWeights.importance}" min="0" max="1" step="0.05" class="vm-input-sm"></div>
              <div><span>情感权重</span><input type="number" id="vm-w-emotion" value="${s.scoreWeights.emotion}" min="0" max="1" step="0.05" class="vm-input-sm"></div>
              <div><span>时间衰减</span><input type="number" id="vm-w-recency" value="${s.scoreWeights.recency}" min="0" max="1" step="0.05" class="vm-input-sm"></div>
            </div>
          </div>
        </div>
        <div class="vm-settings-group">
          <h4>Embedding 设置</h4>
          <div class="vm-setting-row">
            <span>使用自定义 Embedding 端点</span>
            <label class="toggle-switch"><input type="checkbox" id="vm-custom-embedding" ${s.useCustomEmbedding ? 'checked' : ''}><span class="slider"></span></label>
          </div>
          <div id="vm-custom-embedding-fields" style="display:${s.useCustomEmbedding ? 'block' : 'none'}">
            <div class="vm-setting-item">
              <label>Embedding API 地址</label>
              <input type="text" id="vm-embedding-endpoint" value="${s.embeddingEndpoint || ''}" placeholder="https://api.openai.com" class="vm-input-full">
            </div>
            <div class="vm-setting-item">
              <label>Embedding API Key（留空则使用主API Key）</label>
              <input type="password" id="vm-embedding-apikey" value="${s.embeddingApiKey || ''}" placeholder="留空使用主API Key" class="vm-input-full">
            </div>
            <div class="vm-setting-item">
              <label>Embedding 模型</label>
              <div style="display:flex;gap:6px;margin-top:4px;">
                <input type="text" id="vm-embedding-model" value="${s.embeddingModel || 'text-embedding-3-small'}" class="vm-input-full" style="flex:1;">
                <button id="vm-fetch-models-btn" style="padding:6px 12px;border:1px solid var(--border-color,#ddd);background:var(--card-bg,#fff);border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;color:var(--text-primary,#333);">拉取模型</button>
              </div>
              <div id="vm-models-list" style="display:none;margin-top:6px;max-height:200px;overflow-y:auto;border:1px solid var(--border-color,#ddd);border-radius:8px;background:var(--card-bg,#fff);"></div>
            </div>
          </div>
        </div>
        <div class="vm-settings-group">
          <h4>主动回忆</h4>
          <div class="vm-setting-row">
            <span>日期/纪念日触发</span>
            <label class="toggle-switch"><input type="checkbox" id="vm-date-trigger" ${s.enableDateTrigger ? 'checked' : ''}><span class="slider"></span></label>
          </div>
          <div class="vm-setting-row">
            <span>情感变化触发</span>
            <label class="toggle-switch"><input type="checkbox" id="vm-emotion-trigger" ${s.enableEmotionTrigger ? 'checked' : ''}><span class="slider"></span></label>
          </div>
          <div class="vm-setting-row">
            <span>话题漂移触发</span>
            <label class="toggle-switch"><input type="checkbox" id="vm-topic-trigger" ${s.enableTopicTrigger ? 'checked' : ''}><span class="slider"></span></label>
          </div>
          <div class="vm-setting-row">
            <span>定期复习</span>
            <label class="toggle-switch"><input type="checkbox" id="vm-periodic-review" ${s.enablePeriodicReview ? 'checked' : ''}><span class="slider"></span></label>
          </div>
          <div class="vm-setting-item" id="vm-review-interval-group" style="display:${s.enablePeriodicReview ? 'block' : 'none'}">
            <label>复习间隔（天）</label>
            <input type="number" id="vm-review-interval" value="${s.reviewIntervalDays || 7}" min="1" max="90" class="vm-input">
          </div>
        </div>
        <div class="vm-settings-group">
          <h4>自定义提取提示词</h4>
          <div class="vm-setting-row">
            <span>使用自定义提取提示词</span>
            <label class="toggle-switch"><input type="checkbox" id="vm-custom-prompt" ${s.useCustomExtractionPrompt ? 'checked' : ''}><span class="slider"></span></label>
          </div>
          <div id="vm-custom-prompt-field" style="display:${s.useCustomExtractionPrompt ? 'block' : 'none'}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0 4px;">
              <span style="font-size:12px;color:var(--text-secondary,#999);">可用变量：{{角色名}} {{用户昵称}} {{用户人设}} {{角色人设}} {{时间范围}} {{对话记录}} {{总结设定}}</span>
              <button id="vm-reset-prompt-btn" style="padding:4px 10px;border:1px solid var(--border-color,#ddd);background:var(--card-bg,#fff);border-radius:6px;font-size:12px;cursor:pointer;color:var(--text-secondary,#666);white-space:nowrap;margin-left:8px;">重置为默认</button>
            </div>
            <textarea id="vm-custom-prompt-text" class="vm-textarea" style="min-height:200px;">${this._escapeHtml(promptContent)}</textarea>
          </div>
        </div>
        <button id="vm-save-settings-btn" class="vm-btn-primary" style="width:100%;margin-top:12px;">保存设置</button>
      </div>
    `;
  }

  saveSettingsFromUI(chat) {
    const vm = this.getVectorMemory(chat);
    vm.settings.topN = parseInt(document.getElementById('vm-topn')?.value) || 8;
    vm.settings.scoreWeights = {
      semantic: parseFloat(document.getElementById('vm-w-semantic')?.value) || 0.4,
      keyword: parseFloat(document.getElementById('vm-w-keyword')?.value) || 0.3,
      importance: parseFloat(document.getElementById('vm-w-importance')?.value) || 0.15,
      emotion: parseFloat(document.getElementById('vm-w-emotion')?.value) || 0.1,
      recency: parseFloat(document.getElementById('vm-w-recency')?.value) || 0.05
    };
    vm.settings.useCustomEmbedding = document.getElementById('vm-custom-embedding')?.checked || false;
    vm.settings.embeddingEndpoint = document.getElementById('vm-embedding-endpoint')?.value || '';
    vm.settings.embeddingApiKey = document.getElementById('vm-embedding-apikey')?.value || '';
    vm.settings.embeddingModel = document.getElementById('vm-embedding-model')?.value || 'text-embedding-3-small';
    vm.settings.enableDateTrigger = document.getElementById('vm-date-trigger')?.checked || false;
    vm.settings.enableEmotionTrigger = document.getElementById('vm-emotion-trigger')?.checked || false;
    vm.settings.enableTopicTrigger = document.getElementById('vm-topic-trigger')?.checked || false;
    vm.settings.enablePeriodicReview = document.getElementById('vm-periodic-review')?.checked || false;
    vm.settings.reviewIntervalDays = parseInt(document.getElementById('vm-review-interval')?.value) || 7;
    vm.settings.useCustomExtractionPrompt = document.getElementById('vm-custom-prompt')?.checked || false;
    vm.settings.customExtractionPrompt = document.getElementById('vm-custom-prompt-text')?.value || '';
  }

  // ==================== 重建所有 Embedding ====================

  async fetchAvailableModels(chat) {
    const vm = this.getVectorMemory(chat);
    const apiConfig = window.state?.apiConfig || {};
    let endpoint, apiKey;

    if (vm.settings.useCustomEmbedding && vm.settings.embeddingEndpoint) {
      endpoint = document.getElementById('vm-embedding-endpoint')?.value || vm.settings.embeddingEndpoint;
      apiKey = document.getElementById('vm-embedding-apikey')?.value || vm.settings.embeddingApiKey || apiConfig.apiKey;
    } else {
      const useSecondary = apiConfig.secondaryProxyUrl && apiConfig.secondaryApiKey;
      endpoint = useSecondary ? apiConfig.secondaryProxyUrl : apiConfig.proxyUrl;
      apiKey = useSecondary ? apiConfig.secondaryApiKey : apiConfig.apiKey;
    }

    if (!endpoint || !apiKey) throw new Error('未配置API地址或Key');

    const url = endpoint.endsWith('/') ? endpoint + 'v1/models' : endpoint + '/v1/models';
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!response.ok) throw new Error(`API返回 ${response.status}`);
    const data = await response.json();
    const models = (data.data || data || []).map(m => typeof m === 'string' ? m : m.id).filter(Boolean);

    // 排序：embedding相关的排前面
    const embeddingKeywords = ['embed', 'embedding', 'text-embedding', 'bge', 'e5', 'gte', 'jina'];
    models.sort((a, b) => {
      const aIsEmb = embeddingKeywords.some(k => a.toLowerCase().includes(k));
      const bIsEmb = embeddingKeywords.some(k => b.toLowerCase().includes(k));
      if (aIsEmb && !bIsEmb) return -1;
      if (!aIsEmb && bIsEmb) return 1;
      return a.localeCompare(b);
    });

    return models;
  }

  async rebuildAllEmbeddings(chat, progressCallback) {
    const vm = this.getVectorMemory(chat);
    const total = vm.fragments.length;
    let done = 0;
    for (const frag of vm.fragments) {
      frag.embedding = await this.getEmbedding(frag.content, chat);
      done++;
      if (progressCallback) progressCallback(done, total);
    }
    return done;
  }

  // ==================== 批量操作 ====================

  exportSelected(chat, selectedItems) {
    const vm = this.getVectorMemory(chat);
    const exportData = {
      version: '1.0',
      type: 'vector-memory-partial',
      exportedAt: Date.now(),
      characterName: chat.originalName || chat.name,
      coreMemories: [],
      fragments: []
    };

    for (const item of selectedItems) {
      if (item.type === 'core') {
        const mem = vm.coreMemories.find(m => m.id === item.id);
        if (mem) exportData.coreMemories.push({ ...mem });
      } else if (item.type === 'fragment') {
        const frag = vm.fragments.find(f => f.id === item.id);
        if (frag) exportData.fragments.push({ ...frag, embedding: null });
      }
    }
    return JSON.stringify(exportData, null, 2);
  }

  batchDelete(chat, selectedItems) {
    const vm = this.getVectorMemory(chat);
    for (const item of selectedItems) {
      if (item.type === 'core') {
        this.deleteCoreMemory(chat, item.id);
      } else if (item.type === 'fragment') {
        this.deleteFragment(chat, item.id);
      }
    }
  }

  getSelectedItemsText(chat, selectedItems) {
    const vm = this.getVectorMemory(chat);
    const lines = [];
    for (const item of selectedItems) {
      if (item.type === 'core') {
        const mem = vm.coreMemories.find(m => m.id === item.id);
        if (mem) lines.push(`[核心] ${mem.content}`);
      } else if (item.type === 'fragment') {
        const frag = vm.fragments.find(f => f.id === item.id);
        if (frag) lines.push(`[${frag.category || 'E'}] ${frag.content}`);
      }
    }
    return lines.join('\n');
  }
}

// 全局实例
window.vectorMemoryManager = new VectorMemoryManager();
