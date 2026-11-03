  let grSettingsPreviousFocus;
  function showStorySettingsModal() {
    const modal = document.getElementById('gr-settings-modal');
    grSettingsPreviousFocus = document.activeElement;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '作品设定');
    if (!modal.dataset.keyboardBound) {
      modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeStorySettingsModal(); }
        if (event.key === 'Tab') {
          const items = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')].filter(el => el.getClientRects().length);
          const first = items[0], last = items.at(-1);
          if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
        }
      });
      modal.dataset.keyboardBound = 'true';
    }
    modal.classList.add('visible');
    document.getElementById('gr-story-title').focus({ preventScroll: true });
  }
  function closeStorySettingsModal() {
    window.ChoicePicker?.close();
    document.getElementById('gr-settings-modal').classList.remove('visible');
    if (grSettingsPreviousFocus?.isConnected) grSettingsPreviousFocus.focus({ preventScroll: true });
  }
  async function createNewStory() {
    grState.activeStoryId = null; // 标记为新建
    document.getElementById('gr-story-title').value = '';
    await loadStorySettingsUI();
    showStorySettingsModal();
  }

  async function openStorySettings() {
    if (!grState.activeStoryId) return;
    const story = await db.grStories.get(grState.activeStoryId);
    if (!story) return;

    document.getElementById('gr-story-title').value = story.title;
    await loadStorySettingsUI(story.settings, story.authorId, story.storyBible);

    showStorySettingsModal();
  }

  // 加载设置弹窗中的选项
  // 加载设置弹窗中的选项 (修复版：增加字数和条数的回显)
  async function loadStorySettingsUI(settings = {}, selectedAuthorId = null, storyBible = {}) {
    const engine = window.GreenRiverStoryEngine;
    storyBible = Object.assign({}, engine.DEFAULT_STORY_BIBLE, storyBible || {});
    const exportBtn = document.getElementById('gr-export-txt-btn');
    if (exportBtn) {
      if (grState.activeStoryId) {
        exportBtn.style.display = 'block';
        exportBtn.textContent = '导出作品';
        exportBtn.onclick = () => openExportTxtModal(grState.activeStoryId);
      } else {
        exportBtn.style.display = 'none';
      }
    }

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
    bindAuthorPicker();
    const authorTrigger = document.getElementById('gr-author-select-trigger');
    if (authorTrigger) authorTrigger.textContent = authorSelect.selectedOptions[0]?.textContent || '请选择作者';

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
    const selectedMode = window.GreenRiverStoryEngine.storyMode({ settings });
    document.querySelectorAll('[name="gr-story-mode"]').forEach(input => {
      input.checked = input.value === selectedMode;
      input.onchange = syncStoryContextSettings;
    });
    document.getElementById('gr-use-chat-references').checked = settings.useChatReferences !== false;
    document.getElementById('gr-use-chat-references').onchange = syncStoryContextSettings;
    document.getElementById('gr-reader-comments-enabled').checked = settings.readerCommentsEnabled || false;
    document.getElementById('gr-reader-comment-density').value = settings.readerCommentDensity || 'natural';
    document.getElementById('gr-reader-comment-tone').value = settings.readerCommentTone || 'mixed';
    document.getElementById('gr-macro-world-view').value = settings.macroWorldView || '';
    document.getElementById('gr-story-synopsis').value = storyBible.synopsis || '';
    document.getElementById('gr-story-genre').value = storyBible.genre || '';
    document.getElementById('gr-story-tone').value = storyBible.tone || '';
    document.getElementById('gr-story-status').value = storyBible.status || '连载中';
    document.getElementById('gr-story-tags').value = (storyBible.tags || []).join(', ');
    document.getElementById('gr-story-pov').value = storyBible.pov || '第三人称有限视角';
    document.getElementById('gr-story-tense').value = storyBible.tense || '自然叙事';
    document.getElementById('gr-ending-direction').value = storyBible.endingDirection || '';
    document.getElementById('gr-forbidden-content').value = storyBible.forbiddenContent || '';
    syncStoryContextSettings();
    window.ChoicePicker?.enhance(document.getElementById('gr-settings-modal'));

    // 绑定按钮事件
    const saveBtn = document.getElementById('gr-save-story-btn');
    const cancelBtn = document.getElementById('gr-cancel-settings-btn');

    // 使用 cloneNode 清除旧的监听器，防止多次点击
    const newSaveBtn = saveBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);

    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newSaveBtn.textContent = grState.activeStoryId ? '保存设定' : '开始创作';
    newSaveBtn.onclick = () => saveStorySettings();
    newCancelBtn.onclick = closeStorySettingsModal;
  }

  function syncStoryContextSettings() {
    const mode = document.querySelector('[name="gr-story-mode"]:checked')?.value || 'serial';
    const references = document.getElementById('gr-use-chat-references').checked;
    const limit = document.getElementById('gr-context-limit');
    limit.disabled = !references;
    limit.closest('.gr-form-group').hidden = !references;
    document.getElementById('gr-context-note').textContent = mode === 'serial'
      ? '本作品会读取前文章节与剧情存档，适合连续发展。'
      : '不读取其他章节正文、摘要、累计时间线或伏笔。选择“延长当前场景”时，仅参考当前短篇。';
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
    const readerCommentDensity = document.getElementById('gr-reader-comment-density').value;
    const readerCommentTone = document.getElementById('gr-reader-comment-tone').value;
    const macroWorldView = macroWorldViewInput.value.trim();
    if (!title) return showCustomAlert('给故事起个名字', '请先填写书名。');
    if (charIds.length === 0) return showCustomAlert('选择登场人物', '请至少选择一个角色或群聊。');
    if (!Number.isFinite(authorId)) return showCustomAlert('选择作者风格', '请先在作者管理中添加一位作者，再选择文风。');

    const existingStory = grState.activeStoryId ? await db.grStories.get(grState.activeStoryId) : null;
    const settings = Object.assign({}, existingStory?.settings || {}, {
      charIds,
      bookIds,
      userPersonaId,
      outputLength, // 这里的名字要和 prompt 里的对应
      contextLimit,
      macroWorldView,
      readerCommentsEnabled,
      readerCommentDensity,
      readerCommentTone
    });
    settings.storyMode = document.querySelector('[name="gr-story-mode"]:checked')?.value || 'serial';
    settings.useChatReferences = document.getElementById('gr-use-chat-references').checked;

    const oldBible = existingStory?.storyBible || {};
    const storyBible = Object.assign({}, window.GreenRiverStoryEngine.DEFAULT_STORY_BIBLE, oldBible, {
      synopsis: document.getElementById('gr-story-synopsis').value.trim(),
      genre: document.getElementById('gr-story-genre').value.trim(),
      tone: document.getElementById('gr-story-tone').value.trim(),
      status: document.getElementById('gr-story-status').value,
      tags: document.getElementById('gr-story-tags').value.split(/[,，]/).map(text => text.trim()).filter(Boolean),
      pov: document.getElementById('gr-story-pov').value,
      tense: document.getElementById('gr-story-tense').value,
      endingDirection: document.getElementById('gr-ending-direction').value.trim(),
      forbiddenContent: document.getElementById('gr-forbidden-content').value.trim()
    });

    if (grState.activeStoryId) {
      // 更新现有作品
      await db.grStories.update(grState.activeStoryId, { title, authorId, settings, storyBible, lastUpdated: Date.now() });
    } else {
      // 新建作品
      const newStory = {
        title,
        authorId,
        settings,
        storyBible,
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

  function showReaderCommentsPopup(comments, paragraphId) {
    const popup = document.getElementById('gr-reader-comments-popup');
    const listEl = popup && popup.querySelector('.gr-comments-popup-list');
    if (!popup || !listEl) return;
    const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    listEl.innerHTML = (comments || []).map(c => {
      const name = escapeHtml(c.name || '读者');
      const content = escapeHtml(c.content || '');
      const likes = Math.max(0, Number(c.likes) || 0);
      return `<div class="gr-comment-item"><div class="gr-comment-name">${name}</div><div class="gr-comment-content">${content}</div>${likes ? `<div class="gr-comment-meta">♡ ${likes}</div>` : ''}</div>`;
    }).join('');
    if (!listEl.innerHTML) listEl.innerHTML = '<div class="gr-comments-empty">这里还没有段评</div>';
    popup.style.display = 'flex';
    const close = () => { popup.style.display = 'none'; };
    popup.onclick = (e) => { if (e.target === popup) close(); };
    const closeBtn = popup.querySelector('.gr-comments-popup-close');
    if (closeBtn) closeBtn.onclick = close;
    const input = document.getElementById('gr-user-comment-input');
    const submit = document.getElementById('gr-user-comment-submit');
    if (input) input.value = '';
    if (submit) submit.onclick = async () => {
      const content = input?.value.trim();
      if (!content || !paragraphId || !grState.activeStoryId) return;
      const story = await db.grStories.get(grState.activeStoryId);
      window.GreenRiverStoryEngine.normalizeStory(story);
      const chapter = story.chapters[grState.currentChapterIndex];
      if (!chapter) return;
      let group = chapter.readerComments.find(item => item.paragraphId === paragraphId);
      if (!group) {
        const segmentIndex = chapter.paragraphs.findIndex(item => item.id === paragraphId);
        group = { paragraphId, segmentIndex, comments: [] };
        chapter.readerComments.push(group);
      }
      group.comments.push({ id: window.GreenRiverStoryEngine.makeId('comment'), name: '我', content, likes: 0, timestamp: Date.now(), isUser: true });
      story.lastUpdated = Date.now();
      await db.grStories.put(story);
      grState.currentReaderChapter = chapter;
      const bubble = Array.from(document.querySelectorAll('.gr-reader-comment-bubble')).find(item => item.dataset.paragraphId === paragraphId);
      if (bubble) bubble.textContent = `${group.comments.length}条`;
      showReaderCommentsPopup(group.comments, paragraphId);
    };
    if (input) input.onkeydown = event => {
      if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); submit?.click(); }
    };
  }

  // 6. 阅读器逻辑 - 分页版 (Jinjiang Style)
  async function openReader(storyId, chapterIndex = 0) {
    grState.activeStoryId = storyId;
    const story = await db.grStories.get(storyId);
    if (!story) return;
    window.GreenRiverStoryEngine.normalizeStory(story);
    // 旧作品首次打开时持久化稳定章节/段落 ID，保证段评、共读进度和修订记录不漂移。
    await db.grStories.put(story);

    // 确保索引合法
    const totalChapters = story.chapters.length;
    if (totalChapters > 0 && chapterIndex >= totalChapters) chapterIndex = totalChapters - 1;
    if (chapterIndex < 0) chapterIndex = 0;

    grState.currentChapterIndex = chapterIndex;
    applyGreenRiverReadingMode();

    // 更新顶部标题
    document.getElementById('gr-book-name-display').textContent = story.title;

    const contentArea = document.getElementById('gr-reader-content');
    contentArea.innerHTML = '';
    bindWritingModePicker();
    syncGreenRiverWritingMode(story);

    // --- 场景 A: 尚未开始 (没有章节) ---
    if (totalChapters === 0) {
      document.getElementById('gr-chapter-title-display').textContent = "序章";
      contentArea.innerHTML = `
            <div style="text-align:center; padding-top:100px; color:#888;">
                <p>故事尚未开始。</p>
                <p>在下方写下灵感，开始你的${window.GreenRiverStoryEngine.storyMode(story) === 'serial' ? '第一章' : '独立短篇'}。</p>
            </div>
        `;
      // 显示写作控制栏，隐藏翻页栏
      document.getElementById('gr-pagination-controls').style.display = 'none';
      document.getElementById('gr-writing-controls').style.display = 'flex';
      contentArea.style.paddingBottom = '190px';
      const creatorTools = document.getElementById('gr-creator-tools');
      if (creatorTools) creatorTools.style.display = 'flex';
      const bibleBtn = document.getElementById('gr-story-bible-btn');
      const newChapterBtn = document.getElementById('gr-new-chapter-btn');
      if (bibleBtn) { bibleBtn.disabled = false; bibleBtn.onclick = () => openStoryBibleEditor(storyId); }
      if (newChapterBtn) { newChapterBtn.disabled = false; newChapterBtn.onclick = () => openChapterEditor(storyId, null); }
      ['gr-edit-chapter-btn', 'gr-diagnose-btn', 'gr-revisions-btn', 'gr-regenerate-comments-btn', 'gr-create-branch-btn'].forEach(id => {
        const button = document.getElementById(id);
        if (button) button.disabled = true;
      });

      // 绑定生成按钮
      updateGenButtonBinding();
      showScreen('gr-reader-screen');
      return;
    }

    // --- 场景 B: 显示特定章节 ---
    const chapter = story.chapters[chapterIndex];
    grState.currentReaderChapter = chapter;
    const engine = window.GreenRiverStoryEngine;
    const chapterTitle = chapter.title || `第 ${chapterIndex + 1} 章`; // 如果没有标题，使用默认

    document.getElementById('gr-chapter-title-display').textContent = chapterTitle;

    // 1. 顶部：前情提要 (Context)
    if (chapter.prevSummary) {
      contentArea.innerHTML += `
            <details class="gr-summary-box top-summary">
                <summary>📖 上文提要 (Context)</summary>
                <div class="gr-summary-content" style="font-size:12px; color:#888;">${engine.escapeHtml(chapter.prevSummary)}</div>
            </details>
        `;
    }

    // 2. 章节大标题
    contentArea.innerHTML += `<div class="gr-chapter-title-large">${engine.escapeHtml(chapterTitle)}</div>`;

    // 3. 正文（有读者评论时按段渲染+气泡，否则整块）
    const commentMap = {};
    const anchoredComments = engine.paragraphCommentMap(chapter);
    const segments = chapter.paragraphs || [];
    
    const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    if (segments.length <= 1 && anchoredComments.size === 0) {
      contentArea.innerHTML += `<div class="gr-chapter-text">${escapeHtml(chapter.content || '').replace(/\n/g, '<br>')}</div>`;
    } else {
      let bodyHtml = '';
      segments.forEach((paragraph, i) => {
        // 先转义文本内容，然后替换换行符
        const text = escapeHtml(paragraph.text.trim()).replace(/\n/g, '<br>');
        const comments = anchoredComments.get(paragraph.id);
        
        // 创建段落div
        bodyHtml += `<div class="gr-chapter-segment" data-paragraph-id="${engine.escapeHtml(paragraph.id)}">${text}`;
        
        // 如果有评论，添加气泡（不转义，因为这是我们自己生成的HTML）
        if (comments && comments.length > 0) {
          bodyHtml += ` <span class="gr-reader-comment-bubble" data-paragraph-id="${engine.escapeHtml(paragraph.id)}" data-segment-index="${i}">${comments.length}条</span>`;
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
        const paragraphId = bubble.dataset.paragraphId;
        const idx = parseInt(bubble.dataset.segmentIndex, 10);
        const list = curChapter.readerComments.find(r => r.paragraphId === paragraphId || (!r.paragraphId && Number(r.segmentIndex) === idx));
        const comments = list ? (list.comments || []) : [];
        showReaderCommentsPopup(comments, paragraphId);
      });
    }

    // 4. 底部：本章摘要 (可编辑)
    const summaryHtml = `
            <div class="gr-summary-card editable">
                <div class="gr-summary-header">
                    <span class="gr-summary-title">Chapter Checkpoint · 剧情存档</span>
                    <button class="gr-mini-btn save-summary-btn" data-index="${chapterIndex}">保存修改</button>
                </div>
                <textarea class="gr-summary-input" data-index="${chapterIndex}" placeholder="在此处概括本章关键剧情点，供AI记忆..."></textarea>
                 <div class="gr-summary-footer">
                    ${engine.storyMode(story) === 'serial' ? '续写会参考剧情存档、作品档案与近期正文。' : '此存档仅属于本篇，创作其他独立短篇时不会读取。'}
                </div>
            </div>
        `;
    contentArea.innerHTML += summaryHtml;
    const summaryInput = contentArea.querySelector(`.gr-summary-input[data-index="${chapterIndex}"]`);
    if (summaryInput) summaryInput.value = chapter.summary || '';
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
    const creatorTools = document.getElementById('gr-creator-tools');
    if (creatorTools) creatorTools.style.display = 'flex';

    // 总是显示分页栏，写作栏只在最后一页显示
    paginationDiv.style.display = 'flex';

    prevBtn.disabled = (chapterIndex === 0);
    prevBtn.onclick = () => openReader(storyId, chapterIndex - 1);

    if (chapterIndex < totalChapters - 1) {
      // 如果不是最后一章
      nextBtn.textContent = "下一章";
      nextBtn.onclick = () => openReader(storyId, chapterIndex + 1);
      writingDiv.style.display = 'none'; // 隐藏写作栏
      contentArea.style.paddingBottom = '120px';
    } else {
      // 如果是最后一章
      nextBtn.textContent = engine.storyMode(story) === 'serial' ? '续写下一章' : '创作新短篇';
      nextBtn.onclick = () => {
        // 点击下一章按钮时，显示写作栏，并自动滚动到底部
        writingDiv.style.display = 'flex';
        contentArea.scrollTop = contentArea.scrollHeight;
        document.getElementById('gr-direction-input').focus();
      };
      // 默认也显示写作栏
      writingDiv.style.display = 'flex';
      contentArea.style.paddingBottom = '230px';

      // 绑定重写按钮
      rerollBtn.onclick = async () => {
        const confirmed = await showCustomConfirm("重写本章", "将生成一份新的本章内容。当前原稿会保存在修订记录中，生成失败不会改变原稿。", { confirmText: "重写", confirmButtonClass: "btn-danger" });
        if (confirmed) handleGenerateStoryContent(true);
      };
    }

    // 绑定生成按钮
    updateGenButtonBinding();
    bindCreatorToolButtons(storyId, chapterIndex);

    showScreen('gr-reader-screen');
    contentArea.scrollTop = 0;
  }

  // 辅助：绑定自定义写作方式选择器
  function syncGreenRiverWritingMode(story) {
    const isolated = window.GreenRiverStoryEngine.storyMode(story) !== 'serial';
    grState.storyMode = window.GreenRiverStoryEngine.storyMode(story);
    const labels = isolated
      ? { continue: ['创作新短篇', '独立起承转合，不承接其他章节'], direction: ['按灵感创作', '把这次的剧情梗写成独立故事'], extend: ['延长当前短篇', '仅参考当前短篇，不读取其他篇目'], dialogue: ['对话型短篇', '以人物对话为中心，创作独立故事'] }
      : { continue: ['自然续写', '承接上一章，自然推进剧情'], direction: ['按方向续写', '按照你给出的剧情方向展开'], extend: ['延长当前场景', '继续描写当前场景，不急着切换'], transition: ['补写自然过渡', '补足场景之间的连接和转折'], dialogue: ['加强人物对话', '让对话更有潜台词和推进感'] };
    const select = document.getElementById('gr-writing-mode');
    if (!labels[select.value]) select.value = 'continue';
    document.querySelectorAll('#gr-writing-mode-options [data-value]').forEach(button => {
      const label = labels[button.dataset.value];
      button.hidden = !label;
      if (label) { button.firstChild.textContent = label[0]; button.querySelector('span').textContent = label[1]; }
    });
    document.getElementById('gr-writing-mode-trigger').textContent = labels[select.value][0];
    document.getElementById('gr-gen-text').textContent = isolated ? '创作' : '续写';
  }

  function bindWritingModePicker() {
    const trigger = document.getElementById('gr-writing-mode-trigger');
    const select = document.getElementById('gr-writing-mode');
    const modal = document.getElementById('gr-writing-mode-modal');
    if (!trigger || !select || !modal || trigger.dataset.bound === 'true') return;
    // 控制栏使用 backdrop-filter，会给 fixed 子元素建立新的坐标系；
    // 将弹窗提升到 body，才能相对整个屏幕真正居中。
    if (modal.parentElement !== document.body) document.body.appendChild(modal);
    const close = () => {
      modal.classList.remove('visible');
      modal.setAttribute('aria-hidden', 'true');
      trigger.setAttribute('aria-expanded', 'false');
    };
    trigger.onclick = () => {
      modal.classList.add('visible');
      modal.setAttribute('aria-hidden', 'false');
      trigger.setAttribute('aria-expanded', 'true');
    };
    document.getElementById('gr-writing-mode-close')?.addEventListener('click', close);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) return close();
      const option = event.target.closest('[data-value]');
      if (!option) return;
      select.value = option.dataset.value;
      trigger.firstChild.textContent = option.firstChild.textContent;
      close();
    });
    trigger.dataset.bound = 'true';
  }

  function bindAuthorPicker() {
    const trigger = document.getElementById('gr-author-select-trigger');
    const select = document.getElementById('gr-author-select');
    const modal = document.getElementById('gr-author-select-modal');
    const options = document.getElementById('gr-author-select-options');
    if (!trigger || !select || !modal || !options || trigger.dataset.bound === 'true') return;
    if (modal.parentElement !== document.body) document.body.appendChild(modal);
    const close = () => {
      modal.classList.remove('visible');
      modal.setAttribute('aria-hidden', 'true');
      trigger.setAttribute('aria-expanded', 'false');
    };
    trigger.onclick = () => {
      const escape = window.GreenRiverStoryEngine?.escapeHtml || (value => String(value));
      options.innerHTML = `<button type="button" class="gr-author-picker-add" data-add-author="true">＋ 新增作者文风</button>` +
        Array.from(select.options).map(option =>
          `<div class="gr-author-picker-item${select.value === option.value ? ' selected' : ''}" data-value="${escape(option.value)}">
             <button type="button" class="gr-author-picker-choice"><span>${escape(option.textContent)}</span><small>使用该作者的文风进行创作</small></button>
             <button type="button" class="gr-author-picker-edit" data-edit-author="${escape(option.value)}">编辑</button>
           </div>`
        ).join('');
      modal.classList.add('visible');
      modal.setAttribute('aria-hidden', 'false');
      trigger.setAttribute('aria-expanded', 'true');
    };
    document.getElementById('gr-author-select-close')?.addEventListener('click', close);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) return close();
      if (event.target.closest('[data-add-author]')) {
        close();
        return window.openAuthorEditor?.();
      }
      const editButton = event.target.closest('[data-edit-author]');
      if (editButton) {
        close();
        return window.openAuthorEditor?.(Number(editButton.dataset.editAuthor));
      }
      const option = event.target.closest('[data-value]');
      if (!option) return;
      select.value = option.dataset.value;
      trigger.textContent = option.querySelector('.gr-author-picker-choice span')?.textContent || '';
      close();
    });
    trigger.dataset.bound = 'true';
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
        const confirmed = await showCustomConfirm("重写本章", "将生成一份新的本章内容。当前原稿会保存在修订记录中，生成失败不会改变原稿。", { confirmText: "重写", confirmButtonClass: "btn-danger" });
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

  function applyGreenRiverReadingMode() {
    const screen = document.getElementById('gr-reader-screen');
    const button = document.getElementById('gr-reading-mode-toggle');
    if (!screen || !button) return;
    screen.classList.toggle('reading-only', Boolean(grState.readingOnly));
    button.textContent = grState.readingOnly ? '创作' : '阅读';
    button.setAttribute('aria-pressed', String(Boolean(grState.readingOnly)));
    button.onclick = () => {
      grState.readingOnly = !grState.readingOnly;
      applyGreenRiverReadingMode();
    };
  }

  function bindCreatorToolButtons(storyId, chapterIndex) {
    const bibleBtn = document.getElementById('gr-story-bible-btn');
    const newChapterBtn = document.getElementById('gr-new-chapter-btn');
    const editBtn = document.getElementById('gr-edit-chapter-btn');
    const diagnoseBtn = document.getElementById('gr-diagnose-btn');
    const revisionsBtn = document.getElementById('gr-revisions-btn');
    const commentsBtn = document.getElementById('gr-regenerate-comments-btn');
    const branchBtn = document.getElementById('gr-create-branch-btn');
    [bibleBtn, newChapterBtn, editBtn, diagnoseBtn, revisionsBtn, commentsBtn, branchBtn].forEach(button => { if (button) button.disabled = false; });
    if (bibleBtn) bibleBtn.onclick = () => openStoryBibleEditor(storyId);
    if (newChapterBtn) newChapterBtn.onclick = () => openChapterEditor(storyId, null);
    if (editBtn) editBtn.onclick = () => openChapterEditor(storyId, chapterIndex);
    if (diagnoseBtn) diagnoseBtn.onclick = () => showChapterDiagnostics(storyId, chapterIndex);
    if (revisionsBtn) revisionsBtn.onclick = () => openChapterRevisions(storyId, chapterIndex);
    if (commentsBtn) commentsBtn.onclick = () => regenerateReaderComments(storyId, chapterIndex);
    if (branchBtn) branchBtn.onclick = () => createStoryBranch(storyId, chapterIndex);
  }

  async function ensureStoryCharacterProfiles(story) {
    const profiles = story.storyBible.storyCharacters;
    for (const id of (story.settings.charIds || [])) {
      if (profiles[id]) continue;
      if (String(id).startsWith('npc_')) {
        const npc = await db.npcs.get(parseInt(String(id).replace('npc_', ''), 10));
        if (npc) profiles[id] = { name: npc.name, sourceId: id, persona: npc.persona || '', role: '', goal: '', voice: '', relationships: '', knowledge: '' };
      } else {
        const chat = state.chats[id];
        if (chat) profiles[id] = { name: chat.name, sourceId: id, persona: chat.settings?.aiPersona || '', role: '', goal: '', voice: '', relationships: '', knowledge: '' };
      }
    }
  }

  async function openStoryBibleEditor(storyId) {
    const story = await db.grStories.get(storyId);
    if (!story) return;
    const engine = window.GreenRiverStoryEngine;
    engine.normalizeStory(story);
    await ensureStoryCharacterProfiles(story);
    await db.grStories.put(story);
    const bible = story.storyBible;
    document.getElementById('gr-global-story-summary').value = bible.globalSummary || '';
    document.getElementById('gr-open-threads-input').value = bible.openThreads.map(item => typeof item === 'string' ? item : item.text).filter(Boolean).join('\n');
    const characterEditor = document.getElementById('gr-story-character-editor');
    characterEditor.innerHTML = '';
    Object.entries(bible.storyCharacters).forEach(([id, profile]) => {
      const card = document.createElement('div');
      card.className = 'gr-story-character-card';
      const heading = document.createElement('strong');
      heading.textContent = profile.name || id;
      card.appendChild(heading);
      [['role', '小说内身份'], ['goal', '当前目标'], ['voice', '说话特点'], ['relationships', '关系与状态'], ['knowledge', '当前掌握的信息']].forEach(([field, label]) => {
        const wrapper = document.createElement('label');
        wrapper.textContent = label;
        const input = document.createElement('textarea');
        input.rows = field === 'relationships' || field === 'knowledge' ? 2 : 1;
        input.className = 'gr-input';
        input.dataset.characterId = id;
        input.dataset.field = field;
        input.value = profile[field] || '';
        wrapper.appendChild(input);
        card.appendChild(wrapper);
      });
      characterEditor.appendChild(card);
    });
    if (!characterEditor.children.length) characterEditor.innerHTML = '<div class="gr-empty-state">人物档案会在首次生成时从已选择角色建立。</div>';
    const timeline = document.getElementById('gr-story-timeline');
    timeline.innerHTML = '';
    bible.timeline.slice().reverse().slice(0, 30).forEach(item => {
      const row = document.createElement('div');
      row.textContent = typeof item === 'string' ? item : item.text;
      timeline.appendChild(row);
    });
    if (!timeline.children.length) timeline.innerHTML = '<div class="gr-empty-state">生成章节后会自动记录关键事件。</div>';
    const modal = document.getElementById('gr-story-bible-modal');
    modal.classList.add('visible');
    document.getElementById('gr-cancel-story-bible').onclick = () => modal.classList.remove('visible');
    document.getElementById('gr-save-story-bible').onclick = async () => {
      const latest = await db.grStories.get(storyId);
      engine.normalizeStory(latest);
      latest.storyBible.globalSummary = document.getElementById('gr-global-story-summary').value.trim();
      latest.storyBible.openThreads = document.getElementById('gr-open-threads-input').value.split(/\n/).map(text => text.trim()).filter(Boolean).map(text => ({ id: engine.makeId('thread'), text }));
      characterEditor.querySelectorAll('[data-character-id][data-field]').forEach(input => {
        const profile = latest.storyBible.storyCharacters[input.dataset.characterId];
        if (profile) profile[input.dataset.field] = input.value.trim();
      });
      latest.lastUpdated = Date.now();
      await db.grStories.put(latest);
      modal.classList.remove('visible');
      await showCustomAlert('已保存', '剧情档案会在后续续写中参与连续性判断。');
    };
  }

  async function openChapterEditor(storyId, chapterIndex) {
    const story = await db.grStories.get(storyId);
    const isNewChapter = chapterIndex === null;
    if (!story || (!isNewChapter && !story.chapters?.[chapterIndex])) return;
    window.GreenRiverStoryEngine.normalizeStory(story);
    const chapter = isNewChapter ? { title: `第 ${story.chapters.length + 1} 章`, content: '', summary: '' } : story.chapters[chapterIndex];
    document.getElementById('gr-edit-chapter-title').value = chapter.title || '';
    document.getElementById('gr-edit-chapter-content').value = chapter.content || '';
    document.getElementById('gr-edit-chapter-summary').value = chapter.summary || '';
    const modal = document.getElementById('gr-chapter-editor-modal');
    modal.classList.add('visible');
    document.getElementById('gr-cancel-chapter-edit').onclick = () => modal.classList.remove('visible');
    modal.querySelectorAll('[data-gr-transform]').forEach(button => {
      button.onclick = () => transformSelectedChapterText(button.dataset.grTransform, button);
    });
    document.getElementById('gr-save-chapter-edit').onclick = async () => {
      const latest = await db.grStories.get(storyId);
      window.GreenRiverStoryEngine.normalizeStory(latest);
      let target = isNewChapter ? null : latest.chapters[chapterIndex];
      const title = document.getElementById('gr-edit-chapter-title').value.trim();
      const content = document.getElementById('gr-edit-chapter-content').value.trim();
      const summary = document.getElementById('gr-edit-chapter-summary').value.trim();
      if (!content) return alert('正文不能为空');
      if (isNewChapter) {
        target = {
          id: window.GreenRiverStoryEngine.makeId('chapter'),
          title: title || `第 ${latest.chapters.length + 1} 章`,
          content: '', paragraphs: [], summary: '', prevSummary: latest.chapters[latest.chapters.length - 1]?.summary || '这是故事的开始。',
          readerComments: [], revisions: [], storyDelta: {}, timestamp: Date.now(), writingMode: 'manual'
        };
      } else {
        window.GreenRiverStoryEngine.snapshotRevision(target, '手动编辑前');
      }
      const oldCommentsByText = new Map((target.paragraphs || []).map(p => [p.text.trim(), p.id]));
      target.title = title || target.title;
      target.content = content;
      target.summary = summary;
      target.paragraphs = window.GreenRiverStoryEngine.splitParagraphs(content).map(text => ({
        id: oldCommentsByText.get(text.trim()) || window.GreenRiverStoryEngine.makeId('paragraph'),
        text
      }));
      target.readerComments = window.GreenRiverStoryEngine.attachCommentAnchors(target, target.readerComments);
      if (isNewChapter) latest.chapters.push(target);
      latest.lastUpdated = Date.now();
      await db.grStories.put(latest);
      modal.classList.remove('visible');
      await openReader(storyId, isNewChapter ? latest.chapters.length - 1 : chapterIndex);
    };
  }

  async function transformSelectedChapterText(operation, button) {
    const textarea = document.getElementById('gr-edit-chapter-content');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) return showCustomAlert('请先选择文字', '在正文编辑框中选中需要处理的段落后再使用此工具。');
    const selected = textarea.value.slice(start, end);
    if (selected.length > 8000) return showCustomAlert('选择内容过长', '请一次选择不超过 8000 个字符，以免局部处理失去重点。');
    const instruction = {
      polish: '自然润色这段中文小说文字，保持事实、人物意图和信息不变，使表达流畅克制，不增加新剧情。',
      deai: '去除这段小说文字的AI腔：删掉重复解释、模板化情绪、滥用的目光指尖呼吸心跳和空泛比喻；保持原事实、语气和人物关系。',
      expand: '扩写这段小说文字，补充能推动场景或体现人物意图的有效动作、对话和感官细节，不得注水或重复心理。',
      condense: '精简这段小说文字，删除重复、空泛抒情和无效动作，保留所有关键事实、人物情绪转折和必要语气。',
      dialogue: '改进这段小说中的人物对话，使不同人物声音更有区分度，并增加潜台词；保留原有事实和剧情结果。'
    }[operation];
    if (!instruction || typeof callGreenRiverModel !== 'function') return;
    const before = textarea.value.slice(Math.max(0, start - 600), start);
    const after = textarea.value.slice(end, Math.min(textarea.value.length, end + 600));
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = '处理中…';
    try {
      const output = await callGreenRiverModel('你是中文小说局部编辑器。严格只返回处理后的选中文字，不要解释，不要引号，不要代码围栏。', `${instruction}\n\n前文参考：${before}\n\n【待处理文字】\n${selected}\n\n后文参考：${after}`, 0.65);
      const replacement = String(output || '').trim().replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/i, '');
      if (!replacement) throw new Error('AI未返回处理结果');
      textarea.setRangeText(replacement, start, end, 'select');
      document.getElementById('gr-edit-chapter-hint').textContent = '局部处理已放入编辑框，确认效果后点击“保存修改”；取消则不会写入作品。';
    } catch (error) {
      alert(`局部处理失败：${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  async function createStoryBranch(storyId, chapterIndex) {
    const branchName = await showCustomPrompt('创建剧情分支', '输入分支名称。新作品会保留到当前章节，原作品不受影响。', '另一条可能');
    if (branchName === null || !String(branchName).trim()) return;
    const story = await db.grStories.get(storyId);
    if (!story) return;
    window.GreenRiverStoryEngine.normalizeStory(story);
    const branch = window.GreenRiverStoryEngine.clone(story);
    delete branch.id;
    branch.title = `${story.title} · ${String(branchName).trim()}`;
    branch.chapters = branch.chapters.slice(0, chapterIndex + 1);
    branch.parentStoryId = story.id;
    branch.branchFromChapterId = story.chapters[chapterIndex]?.id || null;
    branch.deletedChapters = [];
    const retainedChapterIds = new Set(branch.chapters.map(chapter => chapter.id));
    branch.storyBible.timeline = (branch.storyBible.timeline || []).filter(item => !item.chapterId || retainedChapterIds.has(item.chapterId));
    branch.storyBible.openThreads = (branch.storyBible.openThreads || []).filter(item => !item.chapterId || retainedChapterIds.has(item.chapterId));
    window.GreenRiverStoryEngine.refreshGlobalSummary(branch);
    branch.lastUpdated = Date.now();
    const branchId = await db.grStories.add(branch);
    await openReader(branchId, branch.chapters.length - 1);
    await showCustomAlert('分支已创建', `《${branch.title}》已作为独立作品加入绿江书架。`);
  }

  async function showChapterDiagnostics(storyId, chapterIndex) {
    const story = await db.grStories.get(storyId);
    const chapter = story?.chapters?.[chapterIndex];
    if (!chapter) return;
    const result = window.GreenRiverStoryEngine.analyseChapter(chapter);
    const content = document.getElementById('gr-diagnostics-content');
    content.innerHTML = `<div class="gr-diagnostic-stats"><span>${result.charCount} 字</span><span>${result.paragraphCount} 段</span></div><div class="gr-diagnostic-message">${window.GreenRiverStoryEngine.escapeHtml(result.message).replace(/\n/g, '<br>')}</div>`;
    const modal = document.getElementById('gr-diagnostics-modal');
    modal.classList.add('visible');
    document.getElementById('gr-close-diagnostics').onclick = () => modal.classList.remove('visible');
  }

  async function openChapterRevisions(storyId, chapterIndex) {
    const story = await db.grStories.get(storyId);
    window.GreenRiverStoryEngine.normalizeStory(story);
    const chapter = story?.chapters?.[chapterIndex];
    if (!chapter) return;
    const list = document.getElementById('gr-revisions-list');
    const revisions = (chapter.revisions || []).slice().reverse();
    list.innerHTML = revisions.length ? '' : '<div class="gr-empty-state">当前章节还没有修订记录。</div>';
    revisions.forEach(revision => {
      const item = document.createElement('div');
      item.className = 'gr-revision-item';
      const info = document.createElement('div');
      info.innerHTML = `<strong>${window.GreenRiverStoryEngine.escapeHtml(revision.reason || '历史稿')}</strong><span>${new Date(revision.timestamp).toLocaleString()}</span>`;
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'gr-tool-btn';
      restoreBtn.textContent = '恢复此稿';
      restoreBtn.onclick = async () => {
        const confirmed = await showCustomConfirm('恢复历史稿', '当前内容会先自动存档，然后恢复所选历史稿。', { confirmText: '恢复' });
        if (!confirmed) return;
        const latest = await db.grStories.get(storyId);
        window.GreenRiverStoryEngine.normalizeStory(latest);
        window.GreenRiverStoryEngine.restoreRevision(latest.chapters[chapterIndex], revision);
        latest.lastUpdated = Date.now();
        await db.grStories.put(latest);
        document.getElementById('gr-revisions-modal').classList.remove('visible');
        await openReader(storyId, chapterIndex);
      };
      item.appendChild(info);
      item.appendChild(restoreBtn);
      list.appendChild(item);
    });
    const modal = document.getElementById('gr-revisions-modal');
    modal.classList.add('visible');
    document.getElementById('gr-close-revisions').onclick = () => modal.classList.remove('visible');
  }
