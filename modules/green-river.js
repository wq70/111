// ========================================
// 绿江 (Green River) 同人创作模块
// 来源: script.js 第 62277 ~ 64166 行
// 包含: grState, DEFAULT_AUTHORS, initGreenRiverData, openGreenRiverScreen,
//       renderBookList, openAuthorManager, openAuthorEditor, saveAuthor,
//       deleteAuthor, addAuthor, createNewStory, openStorySettings,
//       loadStorySettingsUI, saveStorySettings, openReader, handleGenerateStoryContent,
//       openChapterList, closeChapterList, renderChapterList, deleteSelectedChapters,
//       calculateNextUpdateTime, checkAutoUpdate, autoGenerateChapter,
//       checkAllStoriesForAutoUpdate, startAutoUpdateTimer, stopAutoUpdateTimer
// ========================================

  // ==========================================
  // ▼▼▼ 绿江 (Green River) 同人创作模块 ▼▼▼
  // ==========================================

  let grState = {
    activeStoryId: null,
    isGenerating: false,
    currentReaderChapter: null
  };

  // 默认作者预设
  const DEFAULT_AUTHORS = [
    { name: "细腻情感", style: "侧重心理描写，文笔细腻，擅长捕捉人物间微妙的情感流动，氛围感强。", maxOutput: 600 },
    { name: "正剧剧情", style: "注重剧情逻辑，节奏紧凑，对白干练，擅长推动故事情节发展。", maxOutput: 800 },
    { name: "轻松日常", style: "幽默风趣，轻松愉快，多用生动的对话和有趣的细节描写，治愈系。", maxOutput: 500 },
    { name: "意识流", style: "大量使用隐喻和象征，句式优美复杂，着重于意象和哲学思考，弱化具体情节。", maxOutput: 400 },

    // 著名作家文风
    { name: "鲁迅", style: "犀利深刻，善用讽刺和批判，文笔简练有力，揭露社会黑暗面，语言辛辣而富有战斗性。多用短句，节奏明快，常有深刻的社会洞察。", maxOutput: 600 },
    { name: "张爱玲", style: "细腻敏感，擅长描写都市男女的情感纠葛，文字华丽而苍凉，善用比喻和意象，笔触冷静克制，充满人生况味。关注细节，氛围感极强。", maxOutput: 700 },
    { name: "老舍", style: "京味十足，语言生动幽默，善于刻画小人物的悲欢离合，文字朴实而富有生活气息，对话生动传神，充满市井烟火味。", maxOutput: 650 },
    { name: "沈从文", style: "抒情诗意，文字清新隽永，善于描绘湘西风情和人性美好，笔触细腻温婉，充满诗意和画面感，语言优美流畅。", maxOutput: 600 },
    { name: "钱钟书", style: "博学机智，语言幽默讽刺，善用典故和比喻，文字雅致而犀利，充满知识分子的睿智和调侃，叙述风格独特。", maxOutput: 700 },
    { name: "巴金", style: "激情澎湃，文字真挚热烈，关注社会现实和人性挣扎，笔触饱含感情，语言流畅自然，充满理想主义色彩。", maxOutput: 650 },
    { name: "林语堂", style: "幽默雅致，中西合璧，文字闲适自在，善于议论和抒情，语言轻松诙谐，充满生活哲理和人生智慧。", maxOutput: 600 },
    { name: "冰心", style: "清新纯净，文字温婉柔美，善于抒发母爱、童真和自然之美，笔触细腻真挚，语言优美如诗，充满温情。", maxOutput: 500 },
    { name: "余华", style: "冷峻克制，善于描写命运的荒诞和人性的坚韧，文字简洁有力，叙事冷静客观，却能直击人心，充满悲悯情怀。", maxOutput: 650 },
    { name: "莫言", style: "魔幻现实，想象力丰富，文字恣肆汪洋，善于用民间传说和乡土元素，语言浓烈奔放，充满生命力和张力。", maxOutput: 800 }
  ];

  // 1. 初始化数据 (在 openGreenRiverScreen 时调用)
  async function initGreenRiverData() {
    const count = await db.grAuthors.count();
    if (count === 0) {
      await db.grAuthors.bulkAdd(DEFAULT_AUTHORS);
    }
  }

  // 2. 打开主界面
  async function openGreenRiverScreen() {
    await initGreenRiverData();
    showScreen('green-river-screen');
    renderBookList();
  }

  // 3. 渲染书架
  // 找到 renderBookList 函数，替换整个函数
  async function renderBookList() {
    const listEl = document.getElementById('gr-book-list');
    listEl.innerHTML = '';

    const stories = await db.grStories.orderBy('lastUpdated').reverse().toArray();
    const authors = await db.grAuthors.toArray();
    const authorMap = new Map(authors.map(a => [a.id, a.name]));

    // 获取已关联的书籍ID集合
    const existingBooks = await db.readingLibrary.toArray();
    const linkedIds = new Set(existingBooks.map(b => b.linkedStoryId).filter(id => id));

    if (stories.length === 0) {
      listEl.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--gr-text-sub); margin-top:50px;">书架是空的，点击右上角新建一部作品吧。</p>';
      return;
    }

    stories.forEach(story => {
      const authorName = authorMap.get(story.authorId) || '未知作者';
      const div = document.createElement('div');
      div.className = 'gr-book-card';

      const wordCount = story.chapters.reduce((acc, ch) => acc + ch.content.length, 0);

      // 【核心逻辑修改】
      const isAdded = linkedIds.has(story.id);
      // 如果已加入，显示"已在书架"，点击触发移除；否则显示"加入"，点击触发加入
      const btnText = isAdded ? '已在书架' : '加入共读';
      const btnClass = isAdded ? 'gr-add-shelf-btn added' : 'gr-add-shelf-btn';
      const actionFn = isAdded ? 'removeGreenRiverFromShelf' : 'addGreenRiverToShelf';

      div.innerHTML = `
            <div>
                <div class="gr-book-title">${story.title}</div>
                <div class="gr-book-meta">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    ${authorName}
                </div>
            </div>
            <div class="gr-book-meta" style="justify-content: space-between; margin-top:15px; align-items: flex-end;">
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <span>${story.chapters.length} 章</span>
                    <span>${(wordCount / 1000).toFixed(1)}k 字</span>
                </div>
                <button class="${btnClass}" onclick="event.stopPropagation(); ${actionFn}(${story.id}, this);">
                    ${isAdded ? '✓ ' : '+ '}${btnText}
                </button>
            </div>
        `;

      div.onclick = (e) => {
        if (e.target.tagName !== 'BUTTON') openReader(story.id);
      };

      addLongPressListener(div, async () => {
        if (confirm(`确定要删除作品《${story.title}》吗？`)) {
          await db.grStories.delete(story.id);
          renderBookList();
        }
      });

      listEl.appendChild(div);
    });
  }

  // 4. 作者管理
  // --- 绿江作者管理重构 (修复布局和编辑功能) ---

  let editingAuthorId = null; // 用于记录当前正在编辑的作者ID

  // 1. 打开作者管理列表 (渲染界面)
  async function openAuthorManager() {
    showScreen('gr-author-screen');
    const listEl = document.getElementById('gr-author-list');
    listEl.innerHTML = '';

    const authors = await db.grAuthors.toArray();

    if (authors.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color:#999; margin-top:50px;">还没有设定作者，点击右上角"+"添加。</p>';
      return;
    }

    authors.forEach(author => {
      const div = document.createElement('div');
      div.className = 'gr-author-item';
      div.innerHTML = `
            <div class="gr-author-info" style="flex-grow: 1; padding-right: 10px; min-width: 0;">
                <h3 style="margin: 0 0 5px 0; font-size: 16px; font-weight: 600; color: #1C1C1E;">${author.name}</h3>
                <p style="margin: 0; font-size: 13px; color: #8E8E93; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.5;">${author.style}</p>
            </div>
            <div class="gr-author-actions">
                <button class="gr-icon-btn" onclick="openAuthorEditor(${author.id})" title="编辑">
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="gr-icon-btn" style="color:#ff3b30;" onclick="deleteAuthor(${author.id})" title="删除">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;
      listEl.appendChild(div);
    });
  }

  // 2. 打开编辑/添加弹窗
  // 如果传入 id，则是编辑模式；否则是添加模式
  async function openAuthorEditor(id = null) {
    editingAuthorId = id;
    const modal = document.getElementById('gr-author-editor-modal');
    const titleEl = document.getElementById('gr-author-editor-title');
    const nameInput = document.getElementById('gr-author-name-input');
    const styleInput = document.getElementById('gr-author-style-input');

    if (id) {
      // 编辑模式：回显数据
      const author = await db.grAuthors.get(id);
      if (author) {
        titleEl.textContent = "编辑作者";
        nameInput.value = author.name;
        styleInput.value = author.style;
      }
    } else {
      // 添加模式：清空数据
      titleEl.textContent = "添加作者";
      nameInput.value = "";
      styleInput.value = "";
    }

    modal.classList.add('visible');
  }

  // 3. 保存作者 (由弹窗内的保存按钮调用)
  async function saveAuthor() {
    const name = document.getElementById('gr-author-name-input').value.trim();
    const style = document.getElementById('gr-author-style-input').value.trim();

    if (!name || !style) {
      alert("名称和风格描述都不能为空！");
      return;
    }

    if (editingAuthorId) {
      // 更新
      await db.grAuthors.update(editingAuthorId, { name, style });
    } else {
      // 新增
      await db.grAuthors.add({ name, style, maxOutput: 600 });
    }

    // 关闭弹窗并刷新列表
    document.getElementById('gr-author-editor-modal').classList.remove('visible');
    openAuthorManager();
  }

  // 4. 删除作者
  async function deleteAuthor(id) {
    const confirmed = await showCustomConfirm("确认删除", "确定删除这位作者设定吗？\n(这不会影响已生成的章节内容)", { confirmButtonClass: 'btn-danger' });
    if (confirmed) {
      await db.grAuthors.delete(id);
      openAuthorManager();
    }
  }

  // 5. 绑定头部"+"按钮到新的编辑器逻辑
  // (这个函数名与HTML中的onclick="addAuthor()"对应，我们将其重定向到openAuthorEditor)
  function addAuthor() {
    openAuthorEditor(null);
  }

  // 6. 绑定保存按钮事件 (在初始化时执行一次即可，防止重复绑定)
  const saveBtn = document.getElementById('gr-save-author-btn');
  if (saveBtn) {
    // 使用 cloneNode 移除旧的监听器 (如果有的话)
    const newBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newBtn, saveBtn);
    newBtn.onclick = saveAuthor;
  }

  // 暴露给全局
  window.openAuthorManager = openAuthorManager;
  window.openAuthorEditor = openAuthorEditor;
  window.addAuthor = addAuthor;
  window.deleteAuthor = deleteAuthor;

  // 5. 新建作品 (设置页)
  async function createNewStory() {
    grState.activeStoryId = null; // 标记为新建
    document.getElementById('gr-story-title').value = '';
    await loadStorySettingsUI();
    document.getElementById('gr-settings-modal').classList.add('visible');
  }

  async function openStorySettings() {
    if (!grState.activeStoryId) return;
    const story = await db.grStories.get(grState.activeStoryId);
    if (!story) return;

    document.getElementById('gr-story-title').value = story.title;
    await loadStorySettingsUI(story.settings, story.authorId);

    document.getElementById('gr-settings-modal').classList.add('visible');
  }

  // 加载设置弹窗中的选项
  // 加载设置弹窗中的选项 (修复版：增加字数和条数的回显)
  async function loadStorySettingsUI(settings = {}, selectedAuthorId = null) {
    // 1. 加载作者列表
    const authorSelect = document.getElementById('gr-author-select');
    authorSelect.innerHTML = '';
    const authors = await db.grAuthors.toArray();
    authors.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      if (selectedAuthorId === a.id) opt.selected = true;
      authorSelect.appendChild(opt);
    });

    // 2. 加载角色列表 (Chats + NPCs)
    const charList = document.getElementById('gr-char-list');
    charList.innerHTML = '';
    const chars = Object.values(state.chats);
    const npcs = await db.npcs.toArray();

    const allEntities = [
      ...chars.map(c => ({ id: c.id, name: c.name, type: c.isGroup ? '群聊' : '角色' })),
      ...npcs.map(n => ({ id: `npc_${n.id}`, name: n.name, type: 'NPC' }))
    ];

    allEntities.forEach(item => {
      const div = document.createElement('div');
      div.className = 'gr-checkbox-item';
      // 回显：检查是否在已保存的列表中
      const isChecked = settings.charIds && settings.charIds.includes(item.id);
      div.innerHTML = `<input type="checkbox" value="${item.id}" ${isChecked ? 'checked' : ''}> <span>${item.name} <small style="color:#999">(${item.type})</small></span>`;
      div.onclick = (e) => { if (e.target.tagName !== 'INPUT') div.querySelector('input').click(); };
      charList.appendChild(div);
    });

    // 3. 加载世界书列表
    const wbList = document.getElementById('gr-worldbook-list');
    wbList.innerHTML = '';
    const books = await db.worldBooks.toArray();
    books.forEach(book => {
      const div = document.createElement('div');
      div.className = 'gr-checkbox-item';
      // 回显：检查是否在已保存的列表中
      const isChecked = settings.bookIds && settings.bookIds.includes(book.id);
      div.innerHTML = `<input type="checkbox" value="${book.id}" ${isChecked ? 'checked' : ''}> <span>${book.name}</span>`;
      div.onclick = (e) => { if (e.target.tagName !== 'INPUT') div.querySelector('input').click(); };
      wbList.appendChild(div);
    });

    // 4. 加载User预设
    const userSelect = document.getElementById('gr-user-persona-select');
    userSelect.innerHTML = '<option value="">当前默认</option>';
    const presets = await db.personaPresets.toArray();
    presets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.persona.substring(0, 20) + '...';
      // 回显：选中已保存的 User Persona
      if (settings.userPersonaId === p.id) opt.selected = true;
      userSelect.appendChild(opt);
    });

    // 5. 【核心修复】：回显字数和上下文条数
    // 如果 settings 里有值，就用 settings 里的；如果没有（新建时），就用默认值 500 和 20
    document.getElementById('gr-output-length').value = settings.outputLength || 500;
    document.getElementById('gr-context-limit').value = settings.contextLimit || 20;
    document.getElementById('gr-reader-comments-enabled').checked = settings.readerCommentsEnabled || false;
    document.getElementById('gr-macro-world-view').value = settings.macroWorldView || '';

    // 6. 加载作者追更相关设置
    const autoUpdateEnabled = document.getElementById('gr-auto-update-enabled');
    const autoUpdateSettings = document.getElementById('gr-auto-update-settings');
    const updateType = document.getElementById('gr-auto-update-type');
    const updateAuthorSelect = document.getElementById('gr-update-author-select');
    const updateCharacterSelect = document.getElementById('gr-update-character-select');
    const updateFrequency = document.getElementById('gr-update-frequency');
    const customFrequencyGroup = document.getElementById('gr-custom-frequency-group');
    const customFrequencyHours = document.getElementById('gr-custom-frequency-hours');

    // 回显追更开关
    autoUpdateEnabled.checked = settings.autoUpdate?.enabled || false;
    autoUpdateSettings.style.display = autoUpdateEnabled.checked ? 'block' : 'none';

    // 填充作者选择列表（追更用）
    updateAuthorSelect.innerHTML = '';
    authors.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      if (settings.autoUpdate?.authorId === a.id) opt.selected = true;
      updateAuthorSelect.appendChild(opt);
    });

    // 填充角色选择列表（追更用）
    updateCharacterSelect.innerHTML = '';
    allEntities.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = `${item.name} (${item.type})`;
      if (settings.autoUpdate?.characterId === item.id) opt.selected = true;
      updateCharacterSelect.appendChild(opt);
    });

    // 回显追更方式
    updateType.value = settings.autoUpdate?.type || 'author';
    document.getElementById('gr-update-author-select-group').style.display =
      updateType.value === 'author' ? 'block' : 'none';
    document.getElementById('gr-update-character-select-group').style.display =
      updateType.value === 'character' ? 'block' : 'none';

    // 回显更新频率
    updateFrequency.value = settings.autoUpdate?.frequency || 'manual';
    customFrequencyGroup.style.display = updateFrequency.value === 'custom' ? 'block' : 'none';
    customFrequencyHours.value = settings.autoUpdate?.customHours || 24;
    
    // 回显每日更新时间
    const dailyTimeGroup = document.getElementById('gr-daily-time-group');
    const dailyUpdateHour = document.getElementById('gr-daily-update-hour');
    dailyTimeGroup.style.display = updateFrequency.value === 'daily' ? 'block' : 'none';
    dailyUpdateHour.value = settings.autoUpdate?.dailyHour || 12;
    
    // 回显每周更新时间
    const weeklyTimeGroup = document.getElementById('gr-weekly-time-group');
    const weeklyUpdateDay = document.getElementById('gr-weekly-update-day');
    const weeklyUpdateHour = document.getElementById('gr-weekly-update-hour');
    weeklyTimeGroup.style.display = updateFrequency.value === 'weekly' ? 'block' : 'none';
    weeklyUpdateDay.value = settings.autoUpdate?.weeklyDay || 1;
    weeklyUpdateHour.value = settings.autoUpdate?.weeklyHour || 12;
    
    // 显示上次更新时间
    const lastUpdateDisplay = document.getElementById('gr-last-update-display');
    const lastUpdateTime = document.getElementById('gr-last-update-time');
    const nextUpdateTime = document.getElementById('gr-next-update-time');
    lastUpdateDisplay.style.display = updateFrequency.value !== 'manual' ? 'block' : 'none';
    
    if (settings.autoUpdate?.lastUpdate) {
      const lastDate = new Date(settings.autoUpdate.lastUpdate);
      lastUpdateTime.textContent = lastDate.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      // 计算下次更新时间
      const nextUpdate = calculateNextUpdateTime(settings.autoUpdate);
      if (nextUpdate) {
        nextUpdateTime.textContent = nextUpdate.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
      } else {
        nextUpdateTime.textContent = '待计算';
      }
    } else {
      lastUpdateTime.textContent = '从未更新';
      nextUpdateTime.textContent = '首次更新将在设定时间执行';
    }

    // 绑定追更设置的事件监听
    autoUpdateEnabled.onchange = () => {
      autoUpdateSettings.style.display = autoUpdateEnabled.checked ? 'block' : 'none';
    };

    updateType.onchange = () => {
      document.getElementById('gr-update-author-select-group').style.display =
        updateType.value === 'author' ? 'block' : 'none';
      document.getElementById('gr-update-character-select-group').style.display =
        updateType.value === 'character' ? 'block' : 'none';
    };

    updateFrequency.onchange = () => {
      const dailyTimeGroup = document.getElementById('gr-daily-time-group');
      const weeklyTimeGroup = document.getElementById('gr-weekly-time-group');
      const lastUpdateDisplay = document.getElementById('gr-last-update-display');
      
      customFrequencyGroup.style.display = updateFrequency.value === 'custom' ? 'block' : 'none';
      dailyTimeGroup.style.display = updateFrequency.value === 'daily' ? 'block' : 'none';
      weeklyTimeGroup.style.display = updateFrequency.value === 'weekly' ? 'block' : 'none';
      
      // 显示上次更新时间（非手动模式时显示）
      lastUpdateDisplay.style.display = updateFrequency.value !== 'manual' ? 'block' : 'none';
    };

    // 绑定按钮事件
    const saveBtn = document.getElementById('gr-save-story-btn');
    const cancelBtn = document.getElementById('gr-cancel-settings-btn');

    // 使用 cloneNode 清除旧的监听器，防止多次点击
    const newSaveBtn = saveBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);

    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newSaveBtn.onclick = () => saveStorySettings();
    newCancelBtn.onclick = () => document.getElementById('gr-settings-modal').classList.remove('visible');
  }

  // 5. 修复版：保存作品设置
  async function saveStorySettings() {
    // 获取 DOM 元素
    const titleInput = document.getElementById('gr-story-title');
    const authorSelect = document.getElementById('gr-author-select');
    const userPersonaSelect = document.getElementById('gr-user-persona-select');
    const outputLengthInput = document.getElementById('gr-output-length'); // 检查HTML ID是否一致
    const contextLimitInput = document.getElementById('gr-context-limit'); // 检查HTML ID是否一致
    const macroWorldViewInput = document.getElementById('gr-macro-world-view');
    const title = titleInput.value.trim();
    const authorId = parseInt(authorSelect.value);

    const charIds = Array.from(document.querySelectorAll('#gr-char-list input:checked')).map(cb => cb.value);
    const bookIds = Array.from(document.querySelectorAll('#gr-worldbook-list input:checked')).map(cb => cb.value);
    const userPersonaId = userPersonaSelect.value;

    // 【核心修复】：确保这里取到的是数字，并且有默认值
    const outputLength = parseInt(outputLengthInput.value) || 500;
    const contextLimit = parseInt(contextLimitInput.value) || 20;
    const readerCommentsEnabled = document.getElementById('gr-reader-comments-enabled').checked;
    const macroWorldView = macroWorldViewInput.value.trim();
    if (!title) return alert("请输入书名");
    if (charIds.length === 0) return alert("请至少选择一个角色或群聊");

    // 获取作者追更设置
    const autoUpdateEnabled = document.getElementById('gr-auto-update-enabled').checked;
    let autoUpdate;
    // 编辑已有作品时，先读取之前的 lastUpdate，避免在 settings 声明前访问
    let existingLastUpdate = null;
    if (grState.activeStoryId) {
      const existingStory = await db.grStories.get(grState.activeStoryId);
      existingLastUpdate = existingStory?.settings?.autoUpdate?.lastUpdate ?? null;
    }

    if (autoUpdateEnabled) {
      const updateType = document.getElementById('gr-auto-update-type').value;
      const updateAuthorId = parseInt(document.getElementById('gr-update-author-select').value) || null;
      const updateCharacterId = document.getElementById('gr-update-character-select').value || null;
      const frequency = document.getElementById('gr-update-frequency').value;
      
      // 验证配置
      if (updateType === 'author' && !updateAuthorId) {
        alert('请选择一个作者用于追更');
        return;
      }
      if (updateType === 'character' && !updateCharacterId) {
        alert('请选择一个角色用于追更');
        return;
      }
      
      autoUpdate = {
        enabled: true,
        type: updateType,
        authorId: updateAuthorId,
        characterId: updateCharacterId,
        frequency: frequency,
        customHours: parseInt(document.getElementById('gr-custom-frequency-hours').value) || 24,
        dailyHour: parseInt(document.getElementById('gr-daily-update-hour').value) || 12,
        weeklyDay: parseInt(document.getElementById('gr-weekly-update-day').value) || 1,
        weeklyHour: parseInt(document.getElementById('gr-weekly-update-hour').value) || 12,
        lastUpdate: existingLastUpdate // 保留之前的更新时间
      };
    } else {
      autoUpdate = {
        enabled: false
      };
    }

    const settings = {
      charIds,
      bookIds,
      userPersonaId,
      outputLength, // 这里的名字要和 prompt 里的对应
      contextLimit,
      macroWorldView,
      readerCommentsEnabled,
      autoUpdate // 添加作者追更设置
    };

    if (grState.activeStoryId) {
      // 更新现有作品
      await db.grStories.update(grState.activeStoryId, { title, authorId, settings });
    } else {
      // 新建作品
      const newStory = {
        title,
        authorId,
        settings,
        chapters: [],
        lastUpdated: Date.now()
      };
      grState.activeStoryId = await db.grStories.add(newStory);
    }

    document.getElementById('gr-settings-modal').classList.remove('visible');

    // 打开阅读器，并定位到最新一章
    const story = await db.grStories.get(grState.activeStoryId);
    const lastIndex = Math.max(0, story.chapters.length - 1);
    openReader(grState.activeStoryId, lastIndex);
  }

  function showReaderCommentsPopup(comments) {
    const popup = document.getElementById('gr-reader-comments-popup');
    const listEl = popup && popup.querySelector('.gr-comments-popup-list');
    if (!popup || !listEl) return;
    const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    listEl.innerHTML = (comments || []).map(c => {
      const name = escapeHtml(c.name || '读者');
      const content = escapeHtml(c.content || '');
      return `<div class="gr-comment-item"><div class="gr-comment-name">${name}</div><div class="gr-comment-content">${content}</div></div>`;
    }).join('');
    popup.style.display = 'flex';
    const close = () => { popup.style.display = 'none'; };
    popup.onclick = (e) => { if (e.target === popup) close(); };
    const closeBtn = popup.querySelector('.gr-comments-popup-close');
    if (closeBtn) closeBtn.onclick = close;
  }

  // 6. 阅读器逻辑 - 分页版 (Jinjiang Style)
  async function openReader(storyId, chapterIndex = 0) {
    grState.activeStoryId = storyId;
    const story = await db.grStories.get(storyId);
    if (!story) return;

    // 确保索引合法
    const totalChapters = story.chapters.length;
    if (totalChapters > 0 && chapterIndex >= totalChapters) chapterIndex = totalChapters - 1;
    if (chapterIndex < 0) chapterIndex = 0;

    grState.currentChapterIndex = chapterIndex;

    // 更新顶部标题
    document.getElementById('gr-book-name-display').textContent = story.title;

    const contentArea = document.getElementById('gr-reader-content');
    contentArea.innerHTML = '';

    // --- 场景 A: 尚未开始 (没有章节) ---
    if (totalChapters === 0) {
      document.getElementById('gr-chapter-title-display').textContent = "序章";
      contentArea.innerHTML = `
            <div style="text-align:center; padding-top:100px; color:#888;">
                <p>故事尚未开始。</p>
                <p>请在下方输入第一章的剧情走向，点击"续写"开始创作。</p>
            </div>
        `;
      // 显示写作控制栏，隐藏翻页栏
      document.getElementById('gr-pagination-controls').style.display = 'none';
      document.getElementById('gr-writing-controls').style.display = 'flex';

      // 绑定生成按钮
      updateGenButtonBinding();
      showScreen('gr-reader-screen');
      return;
    }

    // --- 场景 B: 显示特定章节 ---
    const chapter = story.chapters[chapterIndex];
    grState.currentReaderChapter = chapter;
    const chapterTitle = chapter.title || `第 ${chapterIndex + 1} 章`; // 如果没有标题，使用默认

    document.getElementById('gr-chapter-title-display').textContent = chapterTitle;

    // 1. 顶部：前情提要 (Context)
    if (chapter.prevSummary) {
      contentArea.innerHTML += `
            <details class="gr-summary-box top-summary">
                <summary>📖 上文提要 (Context)</summary>
                <div class="gr-summary-content" style="font-size:12px; color:#888;">${chapter.prevSummary}</div>
            </details>
        `;
    }

    // 2. 章节大标题
    contentArea.innerHTML += `<div class="gr-chapter-title-large">${chapterTitle}</div>`;

    // 3. 正文（有读者评论时按段渲染+气泡，否则整块）
    const commentMap = {};
    (chapter.readerComments || []).forEach(rc => {
      const idx = typeof rc.segmentIndex === 'number' ? rc.segmentIndex : parseInt(rc.segmentIndex, 10);
      if (!isNaN(idx)) commentMap[idx] = Array.isArray(rc.comments) ? rc.comments : [];
    });
    const segments = (chapter.content || '').split(/\n\n/);
    const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    if (segments.length <= 1 && Object.keys(commentMap).length === 0) {
      contentArea.innerHTML += `<div class="gr-chapter-text">${(chapter.content || '').replace(/\n/g, '<br>')}</div>`;
    } else {
      let bodyHtml = '';
      segments.forEach((seg, i) => {
        const text = escapeHtml(seg.trim()).replace(/\n/g, '<br>');
        const comments = commentMap[i];
        bodyHtml += '<div class="gr-chapter-segment">' + text;
        if (comments && comments.length > 0) {
          bodyHtml += ` <span class="gr-reader-comment-bubble" data-segment-index="${i}">${comments.length}条</span>`;
        }
        bodyHtml += '</div>';
      });
      contentArea.innerHTML += bodyHtml;
    }

    // 读者评论气泡：事件委托，避免被后续 innerHTML 替换掉绑定
    if (!contentArea._readerCommentDelegation) {
      contentArea._readerCommentDelegation = true;
      contentArea.addEventListener('click', function (e) {
        const bubble = e.target.closest('.gr-reader-comment-bubble');
        if (!bubble) return;
        e.preventDefault();
        const curChapter = grState.currentReaderChapter;
        if (!curChapter || !curChapter.readerComments) return;
        const idx = parseInt(bubble.dataset.segmentIndex, 10);
        const list = curChapter.readerComments.find(r => Number(r.segmentIndex) === idx);
        const comments = list ? (list.comments || []) : [];
        showReaderCommentsPopup(comments);
      });
    }

    // 4. 底部：本章摘要 (可编辑)
    const summaryHtml = `
            <div class="gr-summary-card editable">
                <div class="gr-summary-header">
                    <span class="gr-summary-title">Chapter Checkpoint · 剧情存档</span>
                    <button class="gr-mini-btn save-summary-btn" data-index="${chapterIndex}">保存修改</button>
                </div>
                <textarea class="gr-summary-input" data-index="${chapterIndex}" placeholder="在此处概括本章关键剧情点，供AI记忆...">${chapter.summary || ''}</textarea>
                 <div class="gr-summary-footer">
                    * AI续写时将读取此框内容作为唯一记忆依据。
                </div>
            </div>
        `;
    contentArea.innerHTML += summaryHtml;
    contentArea.innerHTML += `<div style="height: 100px;"></div>`;

    // 绑定保存摘要按钮
    contentArea.querySelectorAll('.save-summary-btn').forEach(btn => {
      btn.onclick = (e) => {
        const idx = parseInt(e.target.dataset.index);
        const textarea = contentArea.querySelector(`.gr-summary-input[data-index="${idx}"]`);
        saveChapterSummary(storyId, idx, textarea.value);
        e.target.textContent = "已保存";
        setTimeout(() => e.target.style.display = 'none', 1000);
      };
    });

    // 5. 更新底部导航栏状态
    const prevBtn = document.getElementById('gr-prev-chapter-btn');
    const nextBtn = document.getElementById('gr-next-chapter-btn');
    const paginationDiv = document.getElementById('gr-pagination-controls');
    const writingDiv = document.getElementById('gr-writing-controls');
    const rerollBtn = document.getElementById('gr-reroll-btn');

    // 总是显示分页栏，写作栏只在最后一页显示
    paginationDiv.style.display = 'flex';

    prevBtn.disabled = (chapterIndex === 0);
    prevBtn.onclick = () => openReader(storyId, chapterIndex - 1);

    if (chapterIndex < totalChapters - 1) {
      // 如果不是最后一章
      nextBtn.textContent = "下一章";
      nextBtn.onclick = () => openReader(storyId, chapterIndex + 1);
      writingDiv.style.display = 'none'; // 隐藏写作栏
    } else {
      // 如果是最后一章
      nextBtn.textContent = "续写下一章";
      nextBtn.onclick = () => {
        // 点击下一章按钮时，显示写作栏，并自动滚动到底部
        writingDiv.style.display = 'flex';
        contentArea.scrollTop = contentArea.scrollHeight;
        document.getElementById('gr-direction-input').focus();
      };
      // 默认也显示写作栏
      writingDiv.style.display = 'flex';

      // 绑定重写按钮
      rerollBtn.onclick = async () => {
        const confirmed = await showCustomConfirm("重写本章", "确定要删除当前章节并重新生成吗？", { confirmText: "重写", confirmButtonClass: "btn-danger" });
        if (confirmed) handleGenerateStoryContent(true);
      };
    }

    // 绑定生成按钮
    updateGenButtonBinding();

    showScreen('gr-reader-screen');
    contentArea.scrollTop = 0;
  }

  // 辅助：绑定生成按钮
  function updateGenButtonBinding() {
    const genBtn = document.getElementById('gr-generate-btn');
    // 使用克隆节点来移除旧的监听器
    const newBtn = genBtn.cloneNode(true);
    genBtn.parentNode.replaceChild(newBtn, genBtn);
    newBtn.onclick = () => handleGenerateStoryContent(false);
  }

  // 辅助：更新底部控制栏
  function updateControlPanel(story) {
    const controlPanel = document.querySelector('.gr-control-panel');
    // 清空旧内容，重新构建
    controlPanel.innerHTML = `
        <div style="display:flex; gap:10px; align-items:center; width:100%;">
            <div class="gr-input-group" style="flex-grow:1;">
                <input type="text" id="gr-direction-input" class="gr-input" placeholder="输入剧情走向 (留空则自由续写)...">
            </div>
            
            ${story.chapters.length > 0 ? `
            <button id="gr-reroll-btn" class="gr-main-btn" style="background-color:#F4F4F5; color:#666; border:1px solid #ddd;" title="不满当前章？重写！">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            </button>
            ` : ''}

            <button id="gr-generate-btn" class="gr-main-btn">
                <span id="gr-gen-text">续写</span>
                <svg id="gr-gen-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path></svg>
            </button>
        </div>
    `;

    // 绑定事件
    document.getElementById('gr-generate-btn').onclick = () => handleGenerateStoryContent(false); // false = 不是重写

    const rerollBtn = document.getElementById('gr-reroll-btn');
    if (rerollBtn) {
      rerollBtn.onclick = async () => {
        const confirmed = await showCustomConfirm("重写本章", "确定要删除当前最新章节并重新生成吗？\n(如果你刚才修改了摘要，重写后需要重新修改)", { confirmText: "重写", confirmButtonClass: "btn-danger" });
        if (confirmed) {
          handleGenerateStoryContent(true); // true = 是重写
        }
      };
    }
  }

  // 辅助：保存修改后的摘要
  async function saveChapterSummary(storyId, chapterIndex, newSummary) {
    const story = await db.grStories.get(storyId);
    if (story && story.chapters[chapterIndex]) {
      story.chapters[chapterIndex].summary = newSummary;
      await db.grStories.put(story);
      console.log("摘要已手动更新");
    }
  }
  // 7. 核心生成逻辑 (The Writer) - 字数强力修正版
  async function handleGenerateStoryContent(isReroll = false) {
    if (grState.isGenerating) return;

    let story = await db.grStories.get(grState.activeStoryId);

    // --- 重写逻辑 ---
    if (isReroll && story.chapters.length > 0) {
      story.chapters.pop();
      await db.grStories.put(story);
      openReader(story.id, Math.max(0, story.chapters.length - 1));
    }

    const author = await db.grAuthors.get(story.authorId);
    const directionInput = document.getElementById('gr-direction-input');
    const userDirection = directionInput.value.trim();

    const genBtn = document.getElementById('gr-generate-btn');
    const btnText = document.getElementById('gr-gen-text'); // 获取文字标签
    grState.isGenerating = true;

    if (genBtn) {
      genBtn.disabled = true;
      // 【核心修复】：加了判断，只有当文字标签存在时才修改文字，否则只禁用按钮
      if (btnText) btnText.textContent = "撰写中...";
    }

    try {
      // 获取目标字数，并做一个"溢价"处理
      // 如果用户设置 500，我们告诉 AI 写 800，这样它偷懒打折后刚好是 500
      const settingValue = parseInt(story.settings.outputLength) || 500;
      const targetWordCount = Math.floor(settingValue * 1.5);

      const historyLimit = story.settings.contextLimit || 20;

      // --- 构建上下文 ---
      let charsContext = "";
      for (const id of story.settings.charIds) {
        if (id.startsWith('npc_')) {
          const npcId = parseInt(id.replace('npc_', ''));
          const npc = await db.npcs.get(npcId);
          if (npc) charsContext += `- NPC ${npc.name}: ${npc.persona}\n`;
        } else {
          const chat = state.chats[id];
          if (chat) {
            const memories = (chat.longTermMemory || [])
              .map(m => `  * ${m.content}`)
              .join('\n');

            const history = chat.history.slice(-historyLimit).map(m => {
              if (m.role === 'system' || m.type === 'red_packet' || m.type === 'waimai_request' || m.type === 'transfer') return null;
              let content = String(m.content);
              if (content.includes("红包") || content.includes("手机") || content.includes("转账")) return null;
              return `  > ${m.senderName}: ${content.substring(0, 50)}`;
            }).filter(Boolean).join('\n');

            charsContext += `### 角色: ${chat.name}\n- **核心人设**: ${chat.settings.aiPersona}\n`;
            if (memories) charsContext += `- **【重要：长期记忆】**:\n${memories}\n`;
            if (history) charsContext += `- **【语气参考 (最近聊天)】**:\n${history}\n`;
            charsContext += `\n`;
          }
        }
      }

      let userPersonaText = "普通用户";
      if (story.settings.userPersonaId) {
        const preset = await db.personaPresets.get(story.settings.userPersonaId);
        if (preset) userPersonaText = preset.persona;
      } else if (state.chats[Object.keys(state.chats)[0]]) {
        userPersonaText = state.chats[Object.keys(state.chats)[0]].settings.myPersona;
      }

      let worldBookText = "";
      for (const bid of story.settings.bookIds) {
        const wb = await db.worldBooks.get(bid);
        if (wb) worldBookText += `- 《${wb.name}》设定: ${wb.content.filter(e => e.enabled).map(e => e.content).join(';')}\n`;
      }

      let prevSummary = "这是故事的开始。";
      if (story.chapters && story.chapters.length > 0) {
        const lastChapter = story.chapters[story.chapters.length - 1];
        if (lastChapter && lastChapter.summary) {
          prevSummary = lastChapter.summary;
        }
      }
      let macroContext = "";
      if (story.settings.macroWorldView) {
        macroContext = `
# 【🔥 核心世界观 / IF线设定 (最高优先级)】
注意：这是一条IF线或特殊背景故事。**你必须优先遵循以下设定**，如果以下设定与角色的原始人设或记忆冲突，**请以以下设定为准并进行适配**！
---
${story.settings.macroWorldView}
---
`;
      }
      // E. Prompt 强力优化 (字数扩充 + 标题生成)
      const systemPrompt = `
# 身份
你现在是【${author.name}】。文风特点: ${author.style}

# 核心任务
续写这篇小说的新一章。
${macroContext}
# 【最高优先级：字数扩充指令】
你必须输出 **${targetWordCount} 字** 以上的内容。
为了达到这个字数，你**必须**执行以下操作：
1.  **拒绝流水账**：不要只写"他做了什么"，要写"他如何做、什么表情、心里想了什么、周围环境如何"。
2.  **细节描写**：增加环境描写（光影、气味、声音）、微表情描写、肢体动作描写。
3.  **心理活动**：大幅增加角色的内心独白和纠结。
4.  **慢镜头**：将关键动作拆解，放慢叙事节奏。

# 数据使用指南
1. **世界观**: ${worldBookText ? "必须严格遵守以下设定：" + worldBookText : "请根据角色设定自行判断。"}
2. **时代净化**: 严禁出现不符合世界观的现代物品。
3. **长期记忆**: 必须遵守角色档案中的记忆事实。

# 设定资料
- **"我" (User) 的设定**: ${userPersonaText}
- **登场角色档案**:
${charsContext}

# 当前进度
- **前情提要**: ${prevSummary}
- **用户指示**: ${userDirection || "（无指示，请顺其自然地发展剧情，重点是写够字数！）"}

# 输出格式 (JSON)
回复必须且只能是一个JSON对象：${(story.settings.readerCommentsEnabled ? `
- **content** 正文必须用双换行 \\n\\n 分段，以便与读者评论对应。
- **readerComments**（仅当开启读者评论时）：可选。模拟网文读者在部分段落后留下的评论，不必每段都有，由你判断（高能、好笑、虐、吐槽等）。段落序号 = content 按 \\n\\n 分割后的下标（从0开始）。最多 5 段有评论，每段最多 3 条。每条评论包含 name（读者昵称）和 content（评论内容）。` : '')}
\`\`\`json
{
  "title": "四字或多字标题 (如：月下对酌、危机四伏)",
  "content": "正文内容 (必须使用${author.style}风格，**强制写满 ${targetWordCount} 字**，段落之间用换行符\\n\\n分隔)",
  "summary": "用陈述句概括本章关键事实（谁、在哪里、做了什么），供下一章记忆使用。"${story.settings.readerCommentsEnabled ? `,
  "readerComments": [{"segmentIndex": 0, "comments": [{"name": "读者昵称", "content": "评论内容"}]}]
` : ''}
}
\`\`\`
`;

      // API 调用
      const { proxyUrl, apiKey, model } = state.apiConfig;
      const messages = [{ role: 'user', content: `请开始写作，请务必写够 ${targetWordCount} 字！` }];

      let response;
      if (proxyUrl.includes('generativelanguage')) {
        let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messages);
        response = await fetch(geminiConfig.url, geminiConfig.data);
      } else {
        response = await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages
            ],
            temperature: 0.9 // 提高温度，让它更啰嗦一点
          })
        });
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API 请求失败 (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const aiText = getGeminiResponseText(data);

      // 1. 提取 JSON 部分
      let jsonStr = aiText;
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      } else {
        throw new Error("AI未返回有效JSON格式");
      }

      let result;
      try {
        // 2. 尝试直接解析
        result = JSON.parse(jsonStr);
      } catch (e) {
        console.warn("JSON解析初次失败，尝试修复转义字符...", e);

        // 3. 【核心修复】: 自动修复错误的转义字符
        // 正则含义：查找所有反斜杠，如果它后面跟的不是 json 允许的转义符( " \ / b f n r t u )，就把它替换为双反斜杠
        const fixedStr = jsonStr.replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1');

        try {
          result = JSON.parse(fixedStr);
          console.log("JSON自动修复成功！");
        } catch (e2) {
          // 如果还是失败，抛出异常
          throw new Error("JSON解析失败: " + e.message);
        }
      }

      const readerComments = (result.readerComments && Array.isArray(result.readerComments))
        ? result.readerComments
        : [];
      const newChapter = {
        title: result.title || `第 ${story.chapters.length + 1} 章`,
        content: result.content,
        summary: result.summary,
        prevSummary: prevSummary,
        readerComments,
        timestamp: Date.now()
      };

      // 并发安全获取
      story = await db.grStories.get(grState.activeStoryId);
      story.chapters.push(newChapter);
      story.lastUpdated = Date.now();
      await db.grStories.put(story);

      openReader(story.id, story.chapters.length - 1);
      document.getElementById('gr-direction-input').value = '';

    } catch (e) {
      console.error("绿江生成失败:", e);
      alert("生成失败: " + e.message);
    } finally {
      grState.isGenerating = false;
      if (genBtn) {
        genBtn.disabled = false;
        // 【核心修复】：同样只在文字标签存在时才恢复文字
        if (btnText) btnText.textContent = "续写";
      }
    }
  }
  // 8. 侧边栏目录功能
  // 章节删除模式状态
  const chapterDeleteState = {
    isDeleteMode: false,
    selectedChapters: new Set()
  };

  function openChapterList() {
    const sidebar = document.getElementById('gr-chapter-sidebar');
    const overlay = document.getElementById('gr-sidebar-overlay');
    const listContainer = document.getElementById('gr-chapter-list-content');
    const countEl = document.getElementById('gr-total-chapters');

    if (!grState.activeStoryId) return;

    db.grStories.get(grState.activeStoryId).then(story => {
      // 重置删除模式
      chapterDeleteState.isDeleteMode = false;
      chapterDeleteState.selectedChapters.clear();
      
      renderChapterList(story, listContainer, countEl);

      sidebar.classList.add('visible');
      overlay.classList.add('visible');
    });
  }

  function renderChapterList(story, listContainer, countEl) {
    listContainer.innerHTML = '';
    countEl.textContent = `共 ${story.chapters.length} 章`;

    // 如果是删除模式，显示控制栏
    if (chapterDeleteState.isDeleteMode) {
      const controlBar = document.createElement('div');
      controlBar.style.cssText = 'padding: 10px; background: #f5f5f5; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; gap: 10px;';
      
      const leftButtons = document.createElement('div');
      leftButtons.style.cssText = 'display: flex; gap: 8px; align-items: center;';
      
      // 全选按钮
      const selectAllBtn = document.createElement('button');
      selectAllBtn.textContent = '全选';
      selectAllBtn.style.cssText = 'padding: 5px 12px; background: #fff; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 13px;';
      selectAllBtn.onclick = () => {
        story.chapters.forEach((_, idx) => chapterDeleteState.selectedChapters.add(idx));
        renderChapterList(story, listContainer, countEl);
      };
      
      // 取消全选按钮
      const deselectAllBtn = document.createElement('button');
      deselectAllBtn.textContent = '取消全选';
      deselectAllBtn.style.cssText = 'padding: 5px 12px; background: #fff; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 13px;';
      deselectAllBtn.onclick = () => {
        chapterDeleteState.selectedChapters.clear();
        renderChapterList(story, listContainer, countEl);
      };
      
      // 选中计数
      const countSpan = document.createElement('span');
      countSpan.style.cssText = 'font-size: 13px; color: #666;';
      countSpan.textContent = `已选 ${chapterDeleteState.selectedChapters.size} 章`;
      
      leftButtons.appendChild(selectAllBtn);
      leftButtons.appendChild(deselectAllBtn);
      leftButtons.appendChild(countSpan);
      
      const rightButtons = document.createElement('div');
      rightButtons.style.cssText = 'display: flex; gap: 8px;';
      
      // 确认删除按钮
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = `删除 (${chapterDeleteState.selectedChapters.size})`;
      deleteBtn.style.cssText = 'padding: 5px 15px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;';
      deleteBtn.disabled = chapterDeleteState.selectedChapters.size === 0;
      if (deleteBtn.disabled) {
        deleteBtn.style.background = '#ccc';
        deleteBtn.style.cursor = 'not-allowed';
      }
      deleteBtn.onclick = async () => {
        if (chapterDeleteState.selectedChapters.size === 0) return;
        
        const confirmed = await showCustomConfirm(
          '确认删除',
          `确定要删除选中的 ${chapterDeleteState.selectedChapters.size} 个章节吗？\n此操作不可撤销！`,
          { confirmText: '删除', confirmButtonClass: 'btn-danger' }
        );
        
        if (confirmed) {
          await deleteSelectedChapters();
        }
      };
      
      // 取消按钮
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '取消';
      cancelBtn.style.cssText = 'padding: 5px 15px; background: #fff; color: #666; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 13px;';
      cancelBtn.onclick = () => {
        chapterDeleteState.isDeleteMode = false;
        chapterDeleteState.selectedChapters.clear();
        renderChapterList(story, listContainer, countEl);
      };
      
      rightButtons.appendChild(deleteBtn);
      rightButtons.appendChild(cancelBtn);
      
      controlBar.appendChild(leftButtons);
      controlBar.appendChild(rightButtons);
      listContainer.appendChild(controlBar);
    } else {
      // 非删除模式，显示删除按钮
      const toolBar = document.createElement('div');
      toolBar.style.cssText = 'padding: 10px; background: #f9f9f9; border-bottom: 1px solid #ddd; display: flex; justify-content: flex-end;';
      
      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        删除章节
      `;
      deleteBtn.style.cssText = 'padding: 6px 12px; background: #fff; color: #666; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 13px; display: flex; align-items: center;';
      deleteBtn.onclick = () => {
        chapterDeleteState.isDeleteMode = true;
        renderChapterList(story, listContainer, countEl);
      };
      
      toolBar.appendChild(deleteBtn);
      listContainer.appendChild(toolBar);
    }

    // 渲染章节列表
    story.chapters.forEach((ch, index) => {
      const div = document.createElement('div');
      div.className = 'gr-sidebar-item';
      if (index === grState.currentChapterIndex && !chapterDeleteState.isDeleteMode) {
        div.classList.add('active');
      }

      if (chapterDeleteState.isDeleteMode) {
        const isSelected = chapterDeleteState.selectedChapters.has(index);
        
        div.style.cssText = 'display: flex; align-items: center; padding: 12px; cursor: pointer; user-select: none;';
        if (isSelected) {
          div.style.background = '#e3f2fd';
        }
        
        // 复选框
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = isSelected;
        checkbox.style.cssText = 'width: 18px; height: 18px; margin-right: 12px; cursor: pointer;';
        checkbox.onclick = (e) => {
          e.stopPropagation();
        };
        
        div.onclick = () => {
          if (chapterDeleteState.selectedChapters.has(index)) {
            chapterDeleteState.selectedChapters.delete(index);
          } else {
            chapterDeleteState.selectedChapters.add(index);
          }
          renderChapterList(story, listContainer, countEl);
        };
        
        const content = document.createElement('div');
        content.style.cssText = 'flex: 1;';
        content.innerHTML = `
          <div style="display:flex; justify-content:space-between;">
            <span>${index + 1}. ${ch.title || '无题'}</span>
            <span style="font-size:12px; color:#999;">${new Date(ch.timestamp).toLocaleTimeString()}</span>
          </div>
          <div style="font-size:12px; color:#999; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${(ch.summary || '').substring(0, 30)}...</div>
        `;
        
        div.appendChild(checkbox);
        div.appendChild(content);
      } else {
        div.innerHTML = `
          <div style="display:flex; justify-content:space-between;">
            <span>${index + 1}. ${ch.title || '无题'}</span>
            <span style="font-size:12px; color:#999;">${new Date(ch.timestamp).toLocaleTimeString()}</span>
          </div>
          <div style="font-size:12px; color:#999; margin-left:10px; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${(ch.summary || '').substring(0, 20)}...</div>
        `;

        div.onclick = () => {
          openReader(story.id, index);
          closeChapterList();
        };
      }
      
      listContainer.appendChild(div);
    });
  }

  async function deleteSelectedChapters() {
    if (!grState.activeStoryId) return;
    
    const story = await db.grStories.get(grState.activeStoryId);
    if (!story) return;
    
    // 将选中的索引转为数组并排序（从大到小，避免删除时索引变化）
    const indicesToDelete = Array.from(chapterDeleteState.selectedChapters).sort((a, b) => b - a);
    
    console.log('[章节删除] 准备删除章节:', indicesToDelete);
    
    // 删除章节
    indicesToDelete.forEach(index => {
      story.chapters.splice(index, 1);
    });
    
    story.lastUpdated = Date.now();
    await db.grStories.put(story);
    
    console.log(`[章节删除] 成功删除 ${indicesToDelete.length} 个章节`);
    
    // 重置状态
    chapterDeleteState.isDeleteMode = false;
    chapterDeleteState.selectedChapters.clear();
    
    // 重新渲染列表
    const listContainer = document.getElementById('gr-chapter-list-content');
    const countEl = document.getElementById('gr-total-chapters');
    renderChapterList(story, listContainer, countEl);
    
    // 如果当前阅读的章节被删除了，跳转到最后一章
    if (indicesToDelete.includes(grState.currentChapterIndex)) {
      const newIndex = Math.max(0, story.chapters.length - 1);
      if (story.chapters.length > 0) {
        openReader(story.id, newIndex);
      } else {
        // 如果所有章节都被删除了，显示空状态
        document.getElementById('gr-reader-content').innerHTML = `
          <div style="text-align: center; padding: 50px; color: #999;">
            <p>暂无章节</p>
            <p style="font-size: 14px; margin-top: 10px;">点击下方"续写"按钮开始创作</p>
          </div>
        `;
      }
    } else {
      // 重新加载当前章节（索引可能发生变化）
      const deletedBefore = indicesToDelete.filter(i => i < grState.currentChapterIndex).length;
      const newIndex = grState.currentChapterIndex - deletedBefore;
      openReader(story.id, newIndex);
    }
    
    alert(`成功删除 ${indicesToDelete.length} 个章节`);
  }

  function closeChapterList() {
    document.getElementById('gr-chapter-sidebar').classList.remove('visible');
    document.getElementById('gr-sidebar-overlay').classList.remove('visible');
  }
  // 暴露给 HTML onclick
  window.openChapterList = openChapterList;
  window.closeChapterList = closeChapterList;
  // ==========================================
  // ▼▼▼ 作者追更功能 ▼▼▼
  // ==========================================

  // 计算下次更新时间
  function calculateNextUpdateTime(autoUpdate) {
    if (!autoUpdate || !autoUpdate.enabled || autoUpdate.frequency === 'manual') {
      return null;
    }

    const now = new Date();
    let nextUpdate = new Date();

    switch (autoUpdate.frequency) {
      case 'daily':
        // 每天指定小时更新
        const dailyHour = autoUpdate.dailyHour || 12;
        nextUpdate.setHours(dailyHour, 0, 0, 0);
        
        // 如果今天的更新时间已过，设置为明天
        if (nextUpdate <= now) {
          nextUpdate.setDate(nextUpdate.getDate() + 1);
        }
        
        // 如果已经在今天更新过，下次更新是明天
        if (autoUpdate.lastUpdate) {
          const lastUpdate = new Date(autoUpdate.lastUpdate);
          if (lastUpdate.toDateString() === now.toDateString()) {
            nextUpdate.setDate(nextUpdate.getDate() + 1);
            nextUpdate.setHours(dailyHour, 0, 0, 0);
          }
        }
        break;

      case 'weekly':
        // 每周指定星期和小时更新
        const weeklyDay = autoUpdate.weeklyDay || 1; // 0=周日, 1=周一, ...
        const weeklyHour = autoUpdate.weeklyHour || 12;
        
        nextUpdate.setHours(weeklyHour, 0, 0, 0);
        
        // 计算距离下一个指定星期几的天数
        const currentDay = now.getDay();
        let daysUntilNext = weeklyDay - currentDay;
        if (daysUntilNext < 0 || (daysUntilNext === 0 && nextUpdate <= now)) {
          daysUntilNext += 7;
        }
        
        nextUpdate.setDate(nextUpdate.getDate() + daysUntilNext);
        
        // 如果本周已经更新过，下次更新是下周
        if (autoUpdate.lastUpdate) {
          const lastUpdate = new Date(autoUpdate.lastUpdate);
          const lastWeekStart = new Date(lastUpdate);
          lastWeekStart.setDate(lastUpdate.getDate() - lastUpdate.getDay());
          const currentWeekStart = new Date(now);
          currentWeekStart.setDate(now.getDate() - now.getDay());
          
          if (lastWeekStart.getTime() === currentWeekStart.getTime()) {
            nextUpdate.setDate(nextUpdate.getDate() + 7);
          }
        }
        break;

      case 'custom':
        // 自定义间隔（小时）
        const customHours = autoUpdate.customHours || 24;
        if (autoUpdate.lastUpdate) {
          nextUpdate = new Date(autoUpdate.lastUpdate);
          nextUpdate.setHours(nextUpdate.getHours() + customHours);
        } else {
          nextUpdate.setHours(nextUpdate.getHours() + customHours);
        }
        break;

      default:
        return null;
    }

    return nextUpdate;
  }

  // 检查是否需要自动更新
  async function checkAutoUpdate(story) {
    if (!story.settings.autoUpdate || !story.settings.autoUpdate.enabled) {
      return false;
    }

    const autoUpdate = story.settings.autoUpdate;

    // 如果频率设置为手动，不自动更新
    if (autoUpdate.frequency === 'manual') {
      return false;
    }

    const now = new Date();

    // 如果从未更新过，根据频率决定是否立即更新
    if (!autoUpdate.lastUpdate) {
      if (autoUpdate.frequency === 'daily') {
        // 每天模式：检查当前时间是否已到达设定的更新小时
        const dailyHour = autoUpdate.dailyHour || 12;
        return now.getHours() >= dailyHour;
      } else if (autoUpdate.frequency === 'weekly') {
        // 每周模式：检查是否是指定的星期几和时间
        const weeklyDay = autoUpdate.weeklyDay || 1;
        const weeklyHour = autoUpdate.weeklyHour || 12;
        return now.getDay() === weeklyDay && now.getHours() >= weeklyHour;
      } else {
        // 自定义间隔：立即更新
        return true;
      }
    }

    const lastUpdate = new Date(autoUpdate.lastUpdate);

    switch (autoUpdate.frequency) {
      case 'daily':
        // 每天指定小时更新：检查是否已过了上次更新的日期，且当前时间已到达设定小时
        const dailyHour = autoUpdate.dailyHour || 12;
        const isSameDay = lastUpdate.toDateString() === now.toDateString();
        const isPastUpdateHour = now.getHours() >= dailyHour;
        
        // 如果不是同一天，且当前时间已到达设定小时，则需要更新
        return !isSameDay && isPastUpdateHour;

      case 'weekly':
        // 每周指定星期和小时更新
        const weeklyDay = autoUpdate.weeklyDay || 1;
        const weeklyHour = autoUpdate.weeklyHour || 12;
        
        // 检查是否是指定的星期几
        if (now.getDay() !== weeklyDay) {
          return false;
        }
        
        // 检查是否已到达指定小时
        if (now.getHours() < weeklyHour) {
          return false;
        }
        
        // 检查本周是否已经更新过
        const lastWeekStart = new Date(lastUpdate);
        lastWeekStart.setDate(lastUpdate.getDate() - lastUpdate.getDay());
        lastWeekStart.setHours(0, 0, 0, 0);
        
        const currentWeekStart = new Date(now);
        currentWeekStart.setDate(now.getDate() - now.getDay());
        currentWeekStart.setHours(0, 0, 0, 0);
        
        // 如果本周还没更新过，则需要更新
        return lastWeekStart.getTime() < currentWeekStart.getTime();

      case 'custom':
        // 自定义间隔（小时）
        const customHours = autoUpdate.customHours || 24;
        const intervalMs = customHours * 60 * 60 * 1000;
        const timeSinceLastUpdate = now.getTime() - lastUpdate.getTime();
        return timeSinceLastUpdate >= intervalMs;

      default:
        return false;
    }
  }

  // 自动生成新章节
  async function autoGenerateChapter(storyId) {
    try {
      console.log(`[作者追更] 开始为作品 ${storyId} 生成新章节`);

      const story = await db.grStories.get(storyId);
      if (!story) {
        console.error(`[作者追更] 作品 ${storyId} 不存在`);
        return false;
      }

      const autoUpdate = story.settings.autoUpdate;
      if (!autoUpdate || !autoUpdate.enabled) {
        return false;
      }

      // 获取作者信息
      const author = await db.grAuthors.get(story.authorId);
      if (!author) {
        console.error(`[作者追更] 作者 ${story.authorId} 不存在`);
        return false;
      }

      // 构建生成提示词
      const settingValue = parseInt(story.settings.outputLength) || 500;
      const targetWordCount = Math.floor(settingValue * 1.5);
      const historyLimit = story.settings.contextLimit || 20;

      // 获取角色信息
      let charsContext = "";
      for (const charId of story.settings.charIds) {
        if (charId.startsWith('npc_')) {
          const npcId = parseInt(charId.replace('npc_', ''));
          const npc = await db.npcs.get(npcId);
          if (npc) {
            charsContext += `[NPC] ${npc.name}: ${npc.description || ''}\n`;
          }
        } else {
          const char = state.chats[charId];
          if (char) {
            charsContext += `${char.name}: ${char.firstMessage || char.description || ''}\n`;
          }
        }
      }

      // 获取世界书信息
      let worldBookContext = "";
      for (const bookId of story.settings.bookIds) {
        const book = await db.worldBooks.get(bookId);
        if (book) {
          worldBookContext += `\n[${book.name}]\n`;
          if (Array.isArray(book.content)) {
            book.content.forEach(entry => {
              if (typeof entry === 'object' && entry.content) {
                worldBookContext += `${entry.content}\n`;
              } else if (typeof entry === 'string') {
                worldBookContext += `${entry}\n`;
              }
            });
          } else if (typeof book.content === 'string') {
            worldBookContext += book.content;
          }
        }
      }

      // 获取历史章节（追更仅使用摘要以控制长度，避免截断）
      const recentChapters = story.chapters.slice(-historyLimit);
      let chaptersText = "";
      recentChapters.forEach((ch, idx) => {
        const chTitle = ch.title || `第 ${idx + 1} 章`;
        chaptersText += `\n\n[${chTitle}]\n摘要: ${ch.summary || '无'}`;
      });

      // 根据追更方式构建特殊提示词
      let updatePrompt = "";
      if (autoUpdate.type === 'character') {
        // 使用角色视角
        const charId = autoUpdate.characterId;
        let charName = "未知角色";
        if (charId && charId.startsWith('npc_')) {
          const npcId = parseInt(charId.replace('npc_', ''));
          const npc = await db.npcs.get(npcId);
          if (npc) charName = npc.name;
        } else if (charId) {
          const char = state.chats[charId];
          if (char) charName = char.name;
        }
        updatePrompt = `\n\n【特别说明】本次更新请以 ${charName} 的第一人称视角进行叙述，展现${charName}的内心活动和所见所闻。`;
      } else if (autoUpdate.type === 'author') {
        // 使用指定作者文风
        // 修复：检查 authorId 是否有效
        if (autoUpdate.authorId && !isNaN(autoUpdate.authorId)) {
          const updateAuthor = await db.grAuthors.get(autoUpdate.authorId);
          if (updateAuthor) {
            updatePrompt = `\n\n【特别说明】本次更新请严格模仿【${updateAuthor.name}】的文风：${updateAuthor.style}`;
          } else {
            console.warn('[作者追更] 未找到指定的追更作者，将使用作品原作者文风');
          }
        } else {
          console.warn('[作者追更] 追更作者ID无效，将使用作品原作者文风');
        }
      }

      const readerCommentsEnabled = story.settings.readerCommentsEnabled || false;
      const fullPrompt = readerCommentsEnabled
        ? `你是一位专业的小说续写AI。请根据以下信息，续写下一章节内容。

【基础设定】
${story.settings.macroWorldView || '无特殊设定'}

【角色信息】
${charsContext}

${worldBookContext}

【已有章节】（作为上下文参考）${chaptersText}

【作者文风】
${author.style}

${updatePrompt}

【续写要求】
1. 这是自动追更功能生成的新章节，请自然地推进剧情发展
2. 字数要求：约 ${targetWordCount} 字
3. 保持与前文的连贯性
4. 符合角色性格和世界观设定
5. 正文必须用双换行 \\n\\n 分段。可选：在部分段落后添加模拟读者评论（readerComments），不必每段都有，最多5段有评论、每段最多3条。段落序号 = content 按 \\n\\n 分割后的下标（从0开始）。

请只输出一个 JSON 对象，不要其他文字：
\`\`\`json
{
  "title": "第X章 标题",
  "summary": "本章摘要（50字以内）",
  "content": "正文，段落之间用\\\\n\\\\n分隔",
  "readerComments": [{"segmentIndex": 0, "comments": [{"name": "读者昵称", "content": "评论内容"}]}]
}
\`\`\`

现在开始续写：`
        : `你是一位专业的小说续写AI。请根据以下信息，续写下一章节内容。

【基础设定】
${story.settings.macroWorldView || '无特殊设定'}

【角色信息】
${charsContext}

${worldBookContext}

【已有章节】（作为上下文参考）${chaptersText}

【作者文风】
${author.style}

${updatePrompt}

【续写要求】
1. 这是自动追更功能生成的新章节，请自然地推进剧情发展
2. 字数要求：约 ${targetWordCount} 字
3. 保持与前文的连贯性
4. 符合角色性格和世界观设定
5. 请输出: 标题（一行）、摘要（一小段）、正文（完整章节内容）

格式示例：
标题: 第X章 XXX
摘要: XXX（简要概括本章内容，50字以内）
正文:
（这里是章节正文内容）

现在开始续写：`;

      // 调用AI生成
      const apiConfig = await db.apiConfig.get('main');
      if (!apiConfig || !apiConfig.proxyUrl || !apiConfig.apiKey) {
        console.error('[作者追更] API配置不完整');
        alert('作者追更失败：API配置不完整，请先配置API');
        return false;
      }

      const isGemini = apiConfig.proxyUrl.includes('generativelanguage');
      let response;

      if (isGemini) {
        const payload = {
          contents: [{
            parts: [{
              text: fullPrompt
            }]
          }],
          generationConfig: {
            maxOutputTokens: Math.min(8192, targetWordCount * 3), // Gemini支持更大的输出
            temperature: 0.8
          }
        };

        response = await fetch(`${apiConfig.proxyUrl}/${apiConfig.model}:generateContent?key=${apiConfig.apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      } else {
        const payload = {
          model: apiConfig.model,
          messages: [{
            role: 'user',
            content: fullPrompt
          }],
          temperature: 0.8,
          max_tokens: Math.min(4096, targetWordCount * 3) // 增加max_tokens，至少3倍目标字数
        };

        response = await fetch(`${apiConfig.proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiConfig.apiKey}`
          },
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[作者追更] API请求失败:', response.status, response.statusText);
        console.error('[作者追更] 错误详情:', errorText);
        alert(`作者追更失败：API请求错误 (${response.status})\n${errorText.substring(0, 200)}`);
        return false;
      }

      const data = await response.json();
      console.log('[作者追更] API响应数据:', data);
      let aiOutput = '';

      if (isGemini) {
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
          aiOutput = data.candidates[0].content.parts.map(p => p.text).join('');
        } else {
          console.error('[作者追更] Gemini响应格式异常:', JSON.stringify(data));
        }
      } else {
        if (data.choices && data.choices[0] && data.choices[0].message) {
          aiOutput = data.choices[0].message.content;
          // 检查是否因为长度限制而截断
          const finishReason = data.choices[0].finish_reason;
          if (finishReason === 'length') {
            console.warn('[作者追更] AI输出因token限制被截断，尝试使用截断的内容');
            if (!aiOutput || aiOutput.length < 100) {
              console.error('[作者追更] 截断的内容过短，无法使用');
              alert('作者追更失败：AI输出超过token限制且内容过短。\n建议：\n1. 减少"上下文引用条数"\n2. 减少"字数设置"\n3. 减少选择的角色和世界书数量');
              return false;
            }
          }
        } else {
          console.error('[作者追更] OpenAI响应格式异常:', JSON.stringify(data));
        }
      }

      if (!aiOutput) {
        console.error('[作者追更] AI返回内容为空，完整响应:', JSON.stringify(data));
        alert('作者追更失败：AI返回的内容为空。\n可能原因：\n1. 输入内容过长超过模型限制\n2. API配置错误\n请检查控制台日志获取详细信息');
        return false;
      }

      console.log('[作者追更] AI生成内容:', aiOutput);

      let newTitle = `第 ${story.chapters.length + 1} 章`;
      let newSummary = '';
      let newContent = '';
      let readerComments = [];

      if (readerCommentsEnabled) {
        const jsonMatch = aiOutput.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const fixedStr = jsonMatch[0].replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1');
            const result = JSON.parse(fixedStr);
            newTitle = result.title || newTitle;
            newSummary = (result.summary || '').trim();
            newContent = (result.content || '').trim();
            readerComments = Array.isArray(result.readerComments) ? result.readerComments : [];
            console.log('[作者追更] JSON 解析成功，读者评论条数:', readerComments.length);
          } catch (e) {
            console.warn('[作者追更] JSON 解析失败，回退到文本解析', e);
          }
        }
      }

      if (!newContent) {
        // 文本格式解析
        console.log('[作者追更] 开始解析AI输出（文本格式）...');
        const lines = aiOutput.split('\n');
        let currentSection = '';
        let hasFoundTitle = false;
        let hasFoundSummary = false;
        let hasFoundContent = false;

        for (let line of lines) {
          const trimmedLine = line.trim();
          if (!hasFoundTitle && (trimmedLine.startsWith('标题:') || trimmedLine.startsWith('标题：') || trimmedLine.startsWith('# '))) {
            newTitle = trimmedLine.replace(/^(标题[:：]|#)\s*/, '').trim();
            currentSection = 'title';
            hasFoundTitle = true;
          } else if (!hasFoundSummary && (trimmedLine.startsWith('摘要:') || trimmedLine.startsWith('摘要：'))) {
            newSummary = trimmedLine.replace(/^摘要[:：]\s*/, '').trim();
            currentSection = 'summary';
            hasFoundSummary = true;
          } else if (!hasFoundContent && (trimmedLine.startsWith('正文:') || trimmedLine.startsWith('正文：'))) {
            currentSection = 'content';
            hasFoundContent = true;
          } else if (currentSection === 'content' && line) {
            newContent += line + '\n';
          } else if (currentSection === 'summary' && trimmedLine && !trimmedLine.startsWith('正文')) {
            newSummary += ' ' + trimmedLine;
          }
        }

        if (!hasFoundContent && aiOutput.length > 50) {
          newContent = aiOutput;
          const firstLine = lines[0]?.trim();
          if (firstLine && firstLine.length < 30 && firstLine.length > 0) {
            newTitle = firstLine;
            newContent = lines.slice(1).join('\n');
          }
        }
        newContent = newContent.trim();
        newSummary = newSummary.trim();
      }

      console.log('[作者追更] 解析结果 - 标题:', newTitle);
      console.log('[作者追更] 解析结果 - 摘要长度:', newSummary.length);
      console.log('[作者追更] 解析结果 - 正文长度:', newContent.length);

      if (!newContent || newContent.length < 50) {
        console.error('[作者追更] 解析内容失败或内容过短');
        console.error('[作者追更] AI原始输出:', aiOutput);
        alert('作者追更生成失败：AI返回的内容无法解析或过短，请检查控制台日志');
        return false;
      }

      const newChapter = {
        title: newTitle,
        content: newContent,
        summary: newSummary,
        createdAt: Date.now(),
        autoGenerated: true
      };
      if (readerComments.length > 0) newChapter.readerComments = readerComments;
      story.chapters.push(newChapter);

      // 更新最后更新时间
      story.settings.autoUpdate.lastUpdate = Date.now();
      story.lastUpdated = Date.now();

      await db.grStories.put(story);

      console.log(`[作者追更] 成功为作品《${story.title}》生成新章节: ${newTitle}`);
      return true;

    } catch (error) {
      console.error('[作者追更] 生成失败:', error);
      console.error('[作者追更] 错误堆栈:', error.stack);
      // 向用户显示错误信息
      if (typeof alert !== 'undefined') {
        alert(`作者追更生成失败：${error.message}\n请查看控制台了解详细信息`);
      }
      return false;
    }
  }

  // 检查所有作品的追更状态
  async function checkAllStoriesForAutoUpdate() {
    try {
      const stories = await db.grStories.toArray();

      for (const story of stories) {
        if (await checkAutoUpdate(story)) {
          console.log(`[作者追更] 作品《${story.title}》需要更新`);
          await autoGenerateChapter(story.id);
          // 添加延迟，避免同时发送太多请求
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      console.error('[作者追更] 检查更新失败:', error);
    }
  }

  // 启动追更定时器（每小时检查一次）
  let autoUpdateTimer = null;

  function startAutoUpdateTimer() {
    if (autoUpdateTimer) {
      clearInterval(autoUpdateTimer);
    }

    // 每小时检查一次
    autoUpdateTimer = setInterval(() => {
      const now = new Date();
      console.log(`[作者追更] 定时检查开始... 当前时间: ${now.toLocaleString('zh-CN')}`);
      checkAllStoriesForAutoUpdate();
    }, 60 * 60 * 1000); // 1小时

    console.log('[作者追更] 定时器已启动，每小时检查一次');
  }

  // 停止追更定时器
  function stopAutoUpdateTimer() {
    if (autoUpdateTimer) {
      clearInterval(autoUpdateTimer);
      autoUpdateTimer = null;
      console.log('[作者追更] 定时器已停止');
    }
  }

  // 页面加载时启动定时器
  if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
      startAutoUpdateTimer();
      // 立即检查一次
      setTimeout(checkAllStoriesForAutoUpdate, 5000); // 延迟5秒后首次检查
    });
  }

  // 暴露给全局
  window.openGreenRiverScreen = openGreenRiverScreen;
  window.openAuthorManager = openAuthorManager;
  window.createNewStory = createNewStory;
  window.openStorySettings = openStorySettings;
  window.addAuthor = addAuthor;
  window.deleteAuthor = deleteAuthor;
  window.checkAllStoriesForAutoUpdate = checkAllStoriesForAutoUpdate; // 手动触发检查
  window.autoGenerateChapter = autoGenerateChapter; // 手动触发单个作品更新
