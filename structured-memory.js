// ========================================
// 结构化动态记忆系统 (Structured Dynamic Memory)
// 独立模块 - 通过开关控制，不影响原有长期记忆系统
// ========================================

class StructuredMemoryManager {
  constructor() {
    // 默认分类标签定义
    this.DEFAULT_CATEGORIES = {
      F: { name: '偏好/事实', color: '#007aff', icon: '📌', mergeMode: 'keyvalue' },
      E: { name: '事件', color: '#34c759', icon: '📅', mergeMode: 'monthly' },
      D: { name: '决定', color: '#ff9500', icon: '💡', mergeMode: 'list' },
      P: { name: '计划/待办', color: '#5856d6', icon: '📋', mergeMode: 'list' },
      R: { name: '关系变化', color: '#ff2d55', icon: '💕', mergeMode: 'timeline' },
      M: { name: '情绪节点', color: '#af52de', icon: '🎭', mergeMode: 'list' }
    };
  }

  // ==================== 分类管理 ====================

  /**
   * 获取角色的所有分类（默认 + 自定义）
   */
  getCategories(chat) {
    const custom = (chat.structuredMemory && chat.structuredMemory._customCategories) || {};
    return { ...this.DEFAULT_CATEGORIES, ...custom };
  }

  /**
   * 添加自定义分类
   */
  addCustomCategory(chat, code, name, color = '#666666') {
    const mem = this.getStructuredMemory(chat);
    if (!mem._customCategories) mem._customCategories = {};
    // 自定义分类统一用 list 模式
    mem._customCategories[code] = { name, color, icon: '🏷️', mergeMode: 'list', isCustom: true };
    // 初始化数据存储
    if (!mem._custom) mem._custom = {};
    if (!mem._custom[code]) mem._custom[code] = [];
  }

  /**
   * 删除自定义分类
   */
  deleteCustomCategory(chat, code) {
    const mem = this.getStructuredMemory(chat);
    if (mem._customCategories && mem._customCategories[code]) {
      delete mem._customCategories[code];
    }
    if (mem._custom && mem._custom[code]) {
      delete mem._custom[code];
    }
  }

  /**
   * 重命名自定义分类
   */
  renameCustomCategory(chat, code, newName) {
    const mem = this.getStructuredMemory(chat);
    if (mem._customCategories && mem._customCategories[code]) {
      mem._customCategories[code].name = newName;
    }
  }

  /**
   * 修改自定义分类颜色
   */
  recolorCustomCategory(chat, code, newColor) {
    const mem = this.getStructuredMemory(chat);
    if (mem._customCategories && mem._customCategories[code]) {
      mem._customCategories[code].color = newColor;
    }
  }

  /**
   * 判断是否为自定义分类
   */
  isCustomCategory(chat, code) {
    const mem = this.getStructuredMemory(chat);
    return !!(mem._customCategories && mem._customCategories[code]);
  }

  // ==================== 数据结构 ====================

  getStructuredMemory(chat) {
    if (!chat.structuredMemory) {
      chat.structuredMemory = {
        facts: {},
        events: {},
        decisions: [],
        plans: [],
        relationship: "",
        emotions: [],
        _customCategories: {},  // { code: { name, color, icon, mergeMode, isCustom } }
        _custom: {}             // { code: ["条目1", "条目2", ...] }
      };
    }
    // 兼容旧数据
    if (!chat.structuredMemory._customCategories) chat.structuredMemory._customCategories = {};
    if (!chat.structuredMemory._custom) chat.structuredMemory._custom = {};
    return chat.structuredMemory;
  }

  // ==================== 解析 AI 返回 ====================

  parseMemoryEntries(rawText, chat) {
    const entries = [];
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const allCategories = this.getCategories(chat || {});
    const validCodes = Object.keys(allCategories);

    for (const line of lines) {
      // 匹配格式: [YYMMDD]分类代码:内容
      const match = line.match(/^\[(\d{6})\]([A-Za-z0-9_]+):(.+)$/);
      if (match && validCodes.includes(match[2])) {
        entries.push({
          date: match[1],
          category: match[2],
          content: match[3].trim()
        });
      }
    }
    return entries;
  }

  // ==================== 合并逻辑 ====================

  mergeEntries(chat, entries) {
    const mem = this.getStructuredMemory(chat);

    for (const entry of entries) {
      // 默认分类用专用合并逻辑
      if (this.DEFAULT_CATEGORIES[entry.category]) {
        switch (entry.category) {
          case 'F': this._mergeFact(mem, entry); break;
          case 'E': this._mergeEvent(mem, entry); break;
          case 'D': this._mergeDecision(mem, entry); break;
          case 'P': this._mergePlan(mem, entry); break;
          case 'R': this._mergeRelationship(mem, entry); break;
          case 'M': this._mergeEmotion(mem, entry); break;
        }
      } else if (mem._customCategories[entry.category]) {
        // 自定义分类：直接追加到列表（去重）
        if (!mem._custom[entry.category]) mem._custom[entry.category] = [];
        const itemStr = `[${entry.date}]${entry.content}`;
        if (!mem._custom[entry.category].includes(itemStr)) {
          mem._custom[entry.category].push(itemStr);
        }
      }
    }
    return mem;
  }

  _mergeFact(mem, entry) {
    const eqIndex = entry.content.indexOf('=');
    if (eqIndex === -1) {
      mem.facts[entry.content] = `(${entry.date})`;
    } else {
      const key = entry.content.substring(0, eqIndex).trim();
      const value = entry.content.substring(eqIndex + 1).trim();
      const existing = mem.facts[key];
      if (existing) {
        const existingValues = existing.replace(/\(\d{6}\)$/, '').split('+').map(v => v.trim());
        const newValues = value.split('+').map(v => v.trim());
        const merged = [...new Set([...existingValues, ...newValues])].join('+');
        mem.facts[key] = `${merged}(${entry.date})`;
      } else {
        mem.facts[key] = `${value}(${entry.date})`;
      }
    }
  }

  _mergeEvent(mem, entry) {
    const yearMonth = entry.date.substring(0, 4);
    const day = entry.date.substring(4, 6);
    const eventStr = `[${day}]${entry.content}`;
    if (mem.events[yearMonth]) {
      if (!mem.events[yearMonth].includes(eventStr)) {
        mem.events[yearMonth] += `|${eventStr}`;
      }
    } else {
      mem.events[yearMonth] = eventStr;
    }
  }

  _mergeDecision(mem, entry) {
    const decStr = `[${entry.date}]${entry.content}`;
    if (!mem.decisions.includes(decStr)) mem.decisions.push(decStr);
  }

  _mergePlan(mem, entry) {
    const planStr = `${entry.content}(${entry.date})`;
    const isDuplicate = mem.plans.some(p => p.replace(/\(\d{6}\)$/, '').trim() === entry.content.trim());
    if (!isDuplicate) mem.plans.push(planStr);
  }

  _mergeRelationship(mem, entry) {
    const relStr = `${entry.content}(${entry.date})`;
    mem.relationship = mem.relationship ? `${mem.relationship}→${relStr}` : relStr;
  }

  _mergeEmotion(mem, entry) {
    const emoStr = `[${entry.date}]${entry.content}`;
    if (!mem.emotions.includes(emoStr)) mem.emotions.push(emoStr);
  }

  completePlan(chat, planIndex) {
    const mem = this.getStructuredMemory(chat);
    if (planIndex >= 0 && planIndex < mem.plans.length) mem.plans.splice(planIndex, 1);
  }

  // ==================== 序列化为 Prompt ====================

  serializeForPrompt(chat) {
    const mem = this.getStructuredMemory(chat);
    const categories = this.getCategories(chat);
    let output = '';

    // 构建分类说明
    const catDescriptions = Object.entries(categories)
      .map(([code, cat]) => `${code}=${cat.name}`)
      .join(' ');

    output += `## 你的记忆数据库（压缩格式）
以下是你的完整记忆档案。格式说明：
- ${catDescriptions}
- 日期格式为YYMMDD，如260105=2026年1月5日
- 你必须像读取自己的记忆一样理解这些数据，在对话中自然引用，不要提及"数据库"或"表格"。\n`;

    // 默认分类
    const factKeys = Object.keys(mem.facts);
    if (factKeys.length > 0) {
      output += `\n[F${categories.F.name}]\n`;
      for (const key of factKeys) output += `${key}=${mem.facts[key]}\n`;
    }

    if (mem.relationship) {
      output += `\n[R${categories.R.name}]\n${mem.relationship}\n`;
    }

    const eventMonths = Object.keys(mem.events).sort();
    if (eventMonths.length > 0) {
      output += `\n[E${categories.E.name}]\n`;
      for (const ym of eventMonths) output += `${ym}:${mem.events[ym]}\n`;
    }

    if (mem.plans.length > 0) {
      output += `\n[P${categories.P.name}]\n`;
      mem.plans.forEach(p => { output += `${p}\n`; });
    }

    if (mem.decisions.length > 0) {
      output += `\n[D${categories.D.name}]\n`;
      mem.decisions.forEach(d => { output += `${d}\n`; });
    }

    if (mem.emotions.length > 0) {
      output += `\n[M${categories.M.name}]\n`;
      mem.emotions.forEach(e => { output += `${e}\n`; });
    }

    // 自定义分类
    for (const [code, cat] of Object.entries(mem._customCategories || {})) {
      const items = (mem._custom && mem._custom[code]) || [];
      if (items.length > 0) {
        output += `\n[${code}${cat.name}]\n`;
        items.forEach(item => { output += `${item}\n`; });
      }
    }

    // 空状态检查
    const hasAny = factKeys.length > 0 || mem.relationship || eventMonths.length > 0 ||
      mem.plans.length > 0 || mem.decisions.length > 0 || mem.emotions.length > 0 ||
      Object.values(mem._custom || {}).some(arr => arr.length > 0);

    if (!hasAny) output += '\n(暂无记忆档案)\n';

    return output;
  }

  // ==================== 估算 Token ====================

  estimateTokens(chat) {
    return Math.ceil(this.serializeForPrompt(chat).length / 1.5);
  }

  // ==================== 统计信息 ====================

  getStats(chat) {
    const mem = this.getStructuredMemory(chat);
    const customStats = {};
    for (const [code, items] of Object.entries(mem._custom || {})) {
      customStats[code] = items.length;
    }
    return {
      factsCount: Object.keys(mem.facts).length,
      eventsMonths: Object.keys(mem.events).length,
      eventsTotal: Object.values(mem.events).reduce((sum, v) => sum + v.split('|').length, 0),
      decisionsCount: mem.decisions.length,
      plansCount: mem.plans.length,
      hasRelationship: !!mem.relationship,
      emotionsCount: mem.emotions.length,
      customStats,
      estimatedTokens: this.estimateTokens(chat)
    };
  }

  // ==================== 生成总结 Prompt ====================

  buildSummaryPrompt(chat, formattedHistory, timeRangeStr) {
      const userNickname = chat.settings.myNickname || (window.state && window.state.qzoneSettings ? window.state.qzoneSettings.nickname : '用户') || '用户';

      let summarySettingContext = '';
      if (window.state && window.state.worldBooks) {
        const summaryWorldBook = window.state.worldBooks.find(wb => wb.name === '总结设定');
        if (summaryWorldBook) {
          const enabledEntries = summaryWorldBook.content
            .filter(e => e.enabled !== false).map(e => e.content).join('\n');
          if (enabledEntries) summarySettingContext = `\n# 【总结规则 (最高优先级)】\n${enabledEntries}\n`;
        }
      }

      const existingMemory = this.serializeForPrompt(chat);
      const categories = this.getCategories(chat);

      // 构建分类说明（包含自定义分类）
      let categoryDocs = `分类标签说明：
  - F = 偏好/事实（格式：[YYMMDD]F:key=value，同一类信息用同一个key）
    例：[260105]F:用户口味=草莓+抹茶
  - E = 事件（发生了什么）
    例：[260105]E:一起去公园散步,吃了草莓蛋糕
  - D = 重要决定
    例：[260105]D:决定每周五一起看电影
  - P = 计划/待办（未来要做的事）
    例：[260105]P:下周六一起去京都旅行
  - R = 关系变化（关系状态的转折点）
    例：[260105]R:${userNickname}第一次叫我宝贝
  - M = 情绪节点（重要的情感时刻）
    例：[260105]M:因为忘记约定吵架了,后来道歉和好`;

      // 添加自定义分类说明
      const customCats = Object.entries(categories).filter(([_, c]) => c.isCustom);
      if (customCats.length > 0) {
        categoryDocs += '\n\n# 自定义分类（也请积极使用）';
        for (const [code, cat] of customCats) {
          categoryDocs += `\n- ${code} = ${cat.name}（格式：[YYMMDD]${code}:内容）`;
        }
      }

      // 检查是否有用户自定义的结构化总结提示词
      if (window.state && window.state.globalSettings &&
          window.state.globalSettings.customSummaryPromptEnabled &&
          window.state.globalSettings.customSummaryPrompt &&
          window.state.globalSettings.customSummaryPrompt.trim()) {
        // 使用用户自定义提示词，替换占位符变量
        return window.state.globalSettings.customSummaryPrompt
          .replace(/\{\{角色名\}\}/g, chat.originalName)
          .replace(/\{\{用户昵称\}\}/g, userNickname)
          .replace(/\{\{用户人设\}\}/g, chat.settings.myPersona || '未设置')
          .replace(/\{\{角色人设\}\}/g, chat.settings.aiPersona)
          .replace(/\{\{现有记忆\}\}/g, existingMemory)
          .replace(/\{\{时间范围\}\}/g, timeRangeStr)
          .replace(/\{\{分类说明\}\}/g, categoryDocs)
          .replace(/\{\{对话记录\}\}/g, formattedHistory)
          .replace(/\{\{总结设定\}\}/g, summarySettingContext);
      }

      return `${summarySettingContext}
  # 你的任务
  你是"${chat.originalName}"。请阅读下面的对话记录，提取【值得长期记忆】的信息，输出为【结构化记忆条目】。

  # 现有记忆档案（供参考，避免重复提取）
  ${existingMemory}

  # 对话时间范围
  ${timeRangeStr}

  # 输出格式（严格遵守）
  每行一条，格式为：[YYMMDD]分类标签:内容

  ${categoryDocs}

  # 提取规则（重要性优先）
  ## 1. 什么值得记录？（必须满足以下至少一条）
  - 【用户偏好/习惯】：喜欢/讨厌的东西、生活习惯、性格特点、重要个人信息（生日、职业等）
  - 【重要事件】：第一次做某事、特殊场合、转折点、有纪念意义的时刻
  - 【明确的决定】：做出的重要选择、改变的想法
  - 【具体的计划】：约定要做的事、未来的安排
  - 【关系里程碑】：称呼变化、关系进展、重要的承诺
  - 【强烈情绪时刻】：吵架、和好、感动、失落等情感转折
  - 【未来会引用的信息】：如果一个月后忘记会影响对话质量的内容

  ## 2. 什么不需要记录？（直接跳过）
  - 日常问候、寒暄（"早安"、"晚安"、"在吗"）
  - 临时性闲聊话题（天气、今天吃什么、随口聊的话题）
  - 一次性的询问和回答（"这个词什么意思"、"帮我算个数"）
  - 没有后续影响的琐碎细节（"我去上个厕所"、"手机快没电了"）
  - 重复的日常对话（每天都说的话不需要每次都记）

  ## 3. 判断标准（提取前问自己）
  - ❓ 这个信息在未来对话中会被引用吗？
  - ❓ 这个信息能帮助我更了解${userNickname}吗？
  - ❓ 这是我们关系发展的重要节点吗？
  - ❓ 如果一个月后忘记这个，会让${userNickname}失望吗？
  → 如果都是"否"，就不要提取

  ## 4. 格式要求
  - 【日期准确】：根据对话时间范围推算具体日期，格式YYMMDD
  - 【F类用key=value】：同类信息归到同一个key下，多个值用+连接
  - 【简短但完整】：每条尽量简短，但不能丢失关键信息
  - 【第一人称】：从"${chat.originalName}"的视角记录
  - 【不重复】：参考现有记忆档案，不要重复提取已有的信息
  - 【善用自定义分类】：如果有自定义分类，优先将相关内容归入对应分类

  ## 5. 质量控制
  - 宁可少记，不要滥记
  - 每条记忆都应该是"值得珍藏"的
  - 如果犹豫要不要记，那就不记

  # 你的角色设定
  ${chat.settings.aiPersona}

  # 你的聊天对象
  ${userNickname}（人设：${chat.settings.myPersona || '未设置'}）

  # 待提取的对话记录
  ${formattedHistory}

  请直接输出结构化记忆条目，每行一条，不要输出其他内容。只提取真正重要的信息，不要把闲聊内容也记录下来。`;
    }

  // ==================== UI 渲染 ====================

  renderMemoryTable(chat, container) {
    const mem = this.getStructuredMemory(chat);
    const stats = this.getStats(chat);
    const categories = this.getCategories(chat);

    container.innerHTML = '';

    // 操作栏：新建分类 + 添加条目 + 总结
    const toolbar = document.createElement('div');
    toolbar.className = 'sm-toolbar';
    toolbar.innerHTML = `
      <button class="sm-toolbar-btn" id="sm-add-category-btn">新建分类</button>
      <button class="sm-toolbar-btn" id="sm-add-entry-btn">添加条目</button>
      <button class="sm-toolbar-btn" id="sm-summary-btn" style="margin-left: auto;">总结</button>
    `;
    container.appendChild(toolbar);

    // 统计信息栏
    const statsBar = document.createElement('div');
    statsBar.className = 'structured-memory-stats';
    let statsHtml = '<div class="sm-stats-row">';
    if (stats.factsCount > 0) statsHtml += `<span>偏好 ${stats.factsCount}</span>`;
    if (stats.eventsTotal > 0) statsHtml += `<span>事件 ${stats.eventsTotal}</span>`;
    if (stats.decisionsCount > 0) statsHtml += `<span>决定 ${stats.decisionsCount}</span>`;
    if (stats.plansCount > 0) statsHtml += `<span>计划 ${stats.plansCount}</span>`;
    if (stats.emotionsCount > 0) statsHtml += `<span>情绪 ${stats.emotionsCount}</span>`;
    for (const [code, count] of Object.entries(stats.customStats)) {
      if (count > 0) {
        const catName = (mem._customCategories[code] || {}).name || code;
        statsHtml += `<span>${catName} ${count}</span>`;
      }
    }
    statsHtml += `<span>≈ ${stats.estimatedTokens} Tokens</span></div>`;
    statsBar.innerHTML = statsHtml;
    container.appendChild(statsBar);

    // 默认分类渲染
    this._renderSection(container, 'F', categories.F, Object.entries(mem.facts).map(([k, v]) => ({
      display: `${k} = ${v}`, key: k, value: v
    })), false);

    this._renderSection(container, 'R', categories.R, mem.relationship ? [{
      display: mem.relationship
    }] : [], false);

    const eventItems = [];
    for (const ym of Object.keys(mem.events).sort()) {
      const year = '20' + ym.substring(0, 2);
      const month = ym.substring(2, 4);
      mem.events[ym].split('|').forEach(evt => {
        eventItems.push({ display: `${year}年${month}月 ${evt}`, yearMonth: ym, raw: evt });
      });
    }
    this._renderSection(container, 'E', categories.E, eventItems, false);

    this._renderSection(container, 'P', categories.P,
      mem.plans.map((p, i) => ({ display: p, index: i })), false);

    this._renderSection(container, 'D', categories.D,
      mem.decisions.map((d, i) => ({ display: d, index: i })), false);

    this._renderSection(container, 'M', categories.M,
      mem.emotions.map((e, i) => ({ display: e, index: i })), false);

    // 自定义分类渲染
    for (const [code, cat] of Object.entries(mem._customCategories || {})) {
      const items = (mem._custom[code] || []).map((item, i) => ({ display: item, index: i }));
      this._renderSection(container, code, cat, items, true);
    }

    // 空状态（没有任何数据且没有自定义分类时才显示）
    const hasCustomCategories = Object.keys(mem._customCategories || {}).length > 0;
    const hasAny = stats.factsCount > 0 || stats.eventsTotal > 0 || stats.decisionsCount > 0 ||
      stats.plansCount > 0 || stats.emotionsCount > 0 || mem.relationship ||
      Object.values(stats.customStats).some(c => c > 0) || hasCustomCategories;

    if (!hasAny) {
      container.innerHTML += `
        <div style="text-align:center; color: var(--text-secondary, #999); margin-top: 20px; padding: 20px;">
          <p style="font-size: 36px; margin-bottom: 8px;">📋</p>
          <p>还没有结构化记忆数据</p>
          <p style="font-size: 12px; margin-top: 5px;">开启自动总结后，对话内容会自动提取为结构化记忆</p>
          <p style="font-size: 12px;">你也可以点击上方"新建分类"自定义记忆表格</p>
        </div>
      `;
    }
  }

  _renderSection(container, categoryCode, catInfo, items, isCustom) {
    const section = document.createElement('div');
    section.className = 'sm-section';

    const headerHtml = `
      <div class="sm-section-header">
        <span class="sm-section-tag" style="background:${catInfo.color || '#666'}">${categoryCode}</span>
        <span class="sm-section-title">${catInfo.name}</span>
        <span class="sm-section-count">${items.length}</span>
        <div class="sm-section-actions">
          <button class="sm-section-action-btn sm-add-to-cat-btn" data-code="${categoryCode}" title="添加条目到此分类">➕</button>
          ${isCustom ? `
            <button class="sm-section-action-btn sm-rename-cat-btn" data-code="${categoryCode}" title="重命名">✏️</button>
            <button class="sm-section-action-btn sm-delete-cat-btn" data-code="${categoryCode}" title="删除分类">🗑️</button>
          ` : ''}
        </div>
      </div>
    `;
    section.innerHTML = headerHtml;

    const list = document.createElement('div');
    list.className = 'sm-section-list';

    if (items.length === 0 && isCustom) {
      list.innerHTML = `<div class="sm-item-row sm-empty-hint" style="justify-content:center; color:var(--text-secondary,#999); font-size:12px;">暂无条目，点击右上角 ➕ 添加，或通过自动总结填充</div>`;
    } else if (items.length === 0 && !isCustom) {
      list.innerHTML = `<div class="sm-item-row sm-empty-hint" style="justify-content:center; color:var(--text-secondary,#999); font-size:12px;">暂无条目，点击 ➕ 添加</div>`;
    } else {
      items.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'sm-item-row';
        row.innerHTML = `
          <span class="sm-item-content">${this._escapeHtml(item.display)}</span>
          <div class="sm-item-actions">
            <button class="sm-item-btn sm-edit-btn" data-category="${categoryCode}" data-index="${idx}" title="编辑">✏️</button>
            <button class="sm-item-btn sm-delete-btn" data-category="${categoryCode}" data-index="${idx}" title="删除">🗑️</button>
          </div>
        `;
        list.appendChild(row);
      });
    }

    section.appendChild(list);
    container.appendChild(section);
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==================== 编辑操作 ====================

  editEntry(chat, categoryCode, index, newContent) {
    const mem = this.getStructuredMemory(chat);

    // 自定义分类
    if (mem._customCategories[categoryCode]) {
      if (mem._custom[categoryCode] && index < mem._custom[categoryCode].length) {
        mem._custom[categoryCode][index] = newContent;
      }
      return;
    }

    // 默认分类
    switch (categoryCode) {
      case 'F': {
        const keys = Object.keys(mem.facts);
        if (index < keys.length) {
          const oldKey = keys[index];
          const eqIdx = newContent.indexOf('=');
          if (eqIdx !== -1) {
            const newKey = newContent.substring(0, eqIdx).trim();
            const newValue = newContent.substring(eqIdx + 1).trim();
            if (newKey !== oldKey) delete mem.facts[oldKey];
            mem.facts[newKey] = newValue;
          } else {
            mem.facts[oldKey] = newContent;
          }
        }
        break;
      }
      case 'R': mem.relationship = newContent; break;
      case 'E': {
        let eventIdx = 0;
        for (const ym of Object.keys(mem.events).sort()) {
          const events = mem.events[ym].split('|');
          for (let i = 0; i < events.length; i++) {
            if (eventIdx === index) { events[i] = newContent; mem.events[ym] = events.join('|'); return; }
            eventIdx++;
          }
        }
        break;
      }
      case 'P': if (index < mem.plans.length) mem.plans[index] = newContent; break;
      case 'D': if (index < mem.decisions.length) mem.decisions[index] = newContent; break;
      case 'M': if (index < mem.emotions.length) mem.emotions[index] = newContent; break;
    }
  }

  deleteEntry(chat, categoryCode, index) {
    const mem = this.getStructuredMemory(chat);

    // 自定义分类
    if (mem._customCategories[categoryCode]) {
      if (mem._custom[categoryCode] && index < mem._custom[categoryCode].length) {
        mem._custom[categoryCode].splice(index, 1);
      }
      return;
    }

    // 默认分类
    switch (categoryCode) {
      case 'F': {
        const keys = Object.keys(mem.facts);
        if (index < keys.length) delete mem.facts[keys[index]];
        break;
      }
      case 'R': mem.relationship = ''; break;
      case 'E': {
        let eventIdx = 0;
        for (const ym of Object.keys(mem.events).sort()) {
          const events = mem.events[ym].split('|');
          for (let i = 0; i < events.length; i++) {
            if (eventIdx === index) {
              events.splice(i, 1);
              if (events.length === 0) delete mem.events[ym]; else mem.events[ym] = events.join('|');
              return;
            }
            eventIdx++;
          }
        }
        break;
      }
      case 'P': if (index < mem.plans.length) mem.plans.splice(index, 1); break;
      case 'D': if (index < mem.decisions.length) mem.decisions.splice(index, 1); break;
      case 'M': if (index < mem.emotions.length) mem.emotions.splice(index, 1); break;
    }
  }

  addManualEntry(chat, categoryCode, content, date = null) {
    if (!date) {
      const now = new Date();
      const yy = String(now.getFullYear()).substring(2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      date = `${yy}${mm}${dd}`;
    }
    const entry = { date, category: categoryCode, content };
    this.mergeEntries(chat, [entry]);
  }

  // ==================== 调试与维护 ====================

  /**
   * 重置结构化记忆的时间戳（用于修复更新停止的问题）
   */
  resetTimestamp(chat) {
    if (chat) {
      const oldTimestamp = chat.lastStructuredMemoryTimestamp;
      chat.lastStructuredMemoryTimestamp = 0;
      console.log(`[结构化记忆] 时间戳已重置: ${oldTimestamp} -> 0`);
      return true;
    }
    return false;
  }

  /**
   * 获取调试信息
   */
  getDebugInfo(chat) {
    if (!chat) return null;
    const lastTimestamp = chat.lastStructuredMemoryTimestamp || 0;
    const lastDate = lastTimestamp ? new Date(lastTimestamp).toLocaleString('zh-CN') : '从未更新';
    const totalMessages = chat.history ? chat.history.length : 0;
    const messagesAfterTimestamp = chat.history ? chat.history.filter(m => m.timestamp > lastTimestamp).length : 0;
    
    return {
      lastTimestamp,
      lastDate,
      totalMessages,
      messagesAfterTimestamp,
      isEnabled: chat.settings?.enableStructuredMemory || false
    };
  }
}

// 全局实例
window.structuredMemoryManager = new StructuredMemoryManager();
