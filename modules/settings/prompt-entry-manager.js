// 条目式提示词编辑器：保留旧 textarea 作为兼容数据桥，只改变用户编辑界面。
(function () {
  const scopeConfig = {
    thoughts: {
      rootId: 'prompt-entry-thoughts-root',
      textareaId: 'custom-thoughts-prompt-textarea',
      label: '心声提示词',
      legacyKey: 'customThoughtsPrompt',
      defaultPrompt: () => window.getDefaultThoughtsPrompt?.() || ''
    },
    summary: {
      rootId: 'prompt-entry-summary-root',
      textareaId: 'custom-summary-prompt-textarea',
      label: '结构化总结提示词',
      legacyKey: 'customSummaryPrompt',
      defaultPrompt: () => window.getDefaultSummaryPrompt?.() || ''
    },
    single: {
      rootId: 'prompt-entry-single-root',
      textareaId: 'custom-chat-prompt-single-textarea',
      label: '单聊提示词',
      legacyKey: 'customChatPromptSingle',
      defaultPrompt: () => window.getDefaultChatPrompt?.('single') || ''
    },
    group: {
      rootId: 'prompt-entry-group-root',
      textareaId: 'custom-chat-prompt-group-textarea',
      label: '群聊提示词',
      legacyKey: 'customChatPromptGroup',
      defaultPrompt: () => window.getDefaultChatPrompt?.('group') || ''
    },
    offline: {
      rootId: 'prompt-entry-offline-root',
      textareaId: 'custom-chat-prompt-offline-textarea',
      label: '单人线下提示词',
      legacyKey: 'customChatPromptOffline',
      defaultPrompt: () => window.getDefaultChatPrompt?.('offline') || ''
    },
    group_offline: {
      rootId: 'prompt-entry-group-offline-root',
      textareaId: 'custom-chat-prompt-group-offline-textarea',
      label: '群聊线下提示词',
      legacyKey: 'customChatPromptGroupOffline',
      defaultPrompt: () => window.getDefaultChatPrompt?.('group_offline') || ''
    }
  };

  const variableScopes = {
    summary: ['总结设定', '角色名', '用户昵称', '用户人设', '角色人设', '现有记忆', '时间范围', '分类说明', '对话记录'],
    single: [
      'chat.originalName', 'chat.name', 'aiAgeContext', 'aiPersona', 'latestThoughtContext', 'worldBookContent',
      'memoryContextForPrompt', 'linkedMemoryContext', 'multiLayeredSummaryContext', 'todoListContext', 'periodSummaryContext', 'myNickname',
      'myPersona', 'userStatus', 'userProfileContext', 'nameHistoryContext', 'timePerceptionContext', 'weatherContext',
      'timeContext', 'musicContextStr', 'readingContextStr', 'contactsList', 'postsContext', 'groupContext', 'gomokuContext',
      'sharedContext', 'callTranscriptContext', 'synthMusicInstruction', 'narratorInstruction', 'kinshipContext',
      'coupleSpaceContext', 'bilingualModeContext', 'thoughtChainContextHead', 'thoughtChainContextMiddle', 'thoughtsPrompt',
      'bilingualAlertText', 'bilingualAlertVoice', 'novelAiImageContext', 'googleImagenContext', 'openAIImageContext',
      'qzoneActionsPrompt', 'viewMyPhonePrompt', 'crossChatInstruction', 'todoInstruction', 'stickerContext',
      'aiAvatarLibrary', 'myAvatarLibrary', 'currencyExchangeContext', 'char_avatar', 'user_avatar', 'char_name',
      'char_remark', 'user_name', 'user_nickname'
    ],
    group: [
      'memberNames', 'membersWithContacts', 'chat.name', 'myNickname', 'myOriginalName', 'myPersona', 'userStatus',
      'bilingualModeGroupContext', 'groupTimePerceptionInstruction', 'groupTimeContextText', 'groupLongTimeNoSeeContext',
      'groupCrossChatInstruction', 'readingContextStr', 'worldBookContent', 'longTermMemoryContext', 'memoryModeContext',
      'multiLayeredSummaryContext_group', 'linkedMemoryContext', 'musicContext', 'sharedContext', 'groupAvatarLibraryContext',
      'stickerContext', 'forbiddenNamesContext', 'callTranscriptContext', 'synthMusicInstruction', 'narratorInstruction',
      'thoughtChainContextHead', 'thoughtChainContextMiddle', 'novelAiImageGroupContext', 'googleImagenGroupContext',
      'openAIImageGroupContext', 'bilingualAlertVoice', 'currencyExchangeContext', 'char_avatar', 'user_avatar', 'char_name',
      'char_remark', 'user_name', 'user_nickname'
    ],
    offline: [
      'chat.originalName', 'presetContext', 'aiAgeContext', 'aiPersona', 'myPersona', 'timePerceptionContext',
      'worldBookContent', 'longTermMemoryContext', 'linkedMemoryContext', 'historySliceStr', 'formatRules', 'minLength',
      'maxLength', 'currencyExchangeContext', 'char_avatar', 'user_avatar', 'char_name', 'char_remark', 'user_name',
      'user_nickname', 'thoughtChainContextHead', 'thoughtChainContextMiddle'
    ],
    group_offline: [
      'presetContext', 'membersList', 'myPersona', 'timePerceptionContext', 'worldBookContent', 'longTermMemoryContext',
      'linkedMemoryContext', 'historySliceStr', 'formatRules', 'minLength', 'maxLength', 'memberNames', 'membersWithContacts',
      'chat.name', 'myNickname', 'myOriginalName', 'userStatus', 'currencyExchangeContext', 'char_avatar', 'user_avatar',
      'char_name', 'char_remark', 'user_name', 'user_nickname', 'thoughtChainContextHead', 'thoughtChainContextMiddle'
    ]
  };
  variableScopes.thoughts = variableScopes.single.filter(name => name !== 'linkedMemoryContext');
  const unavailableByScope = {
    group_offline: new Set(['presetContext', 'membersList', 'timePerceptionContext', 'historySliceStr', 'formatRules', 'minLength', 'maxLength'])
  };

  const variableDescriptions = {
    'chat.originalName': '角色本名', 'chat.name': '聊天备注名或群名称', aiPersona: '角色人设', myPersona: '用户人设',
    myNickname: '用户在当前聊天中的昵称', myOriginalName: '用户本名', userStatus: '用户当前状态',
    worldBookContent: '当前生效的世界书内容', memoryContextForPrompt: '当前记忆内容', longTermMemoryContext: '长期记忆内容',
    linkedMemoryContext: '关联记忆内容', historySliceStr: '当前对话历史', timePerceptionContext: '时间感知上下文',
    weatherContext: '天气上下文', thoughtsPrompt: '当前心声提示词', thoughtChainContextHead: '思维链头部内容',
    thoughtChainContextMiddle: '思维链中部内容', stickerContext: '可用表情包上下文', formatRules: '当前输出格式规则',
    minLength: '最小输出长度', maxLength: '最大输出长度', memberNames: '群成员本名列表', membersList: '群成员资料列表',
    presetContext: '当前剧情预设', '总结设定': '结构化总结的附加设定', '角色名': '当前角色本名',
    '用户昵称': '当前用户昵称', '用户人设': '用户人设', '角色人设': '角色人设', '现有记忆': '已有结构化记忆',
    '时间范围': '本次总结覆盖的时间', '分类说明': '结构化记忆分类规则', '对话记录': '待总结的聊天记录'
  };

  const instances = new Map();
  let globalSettingsRef = null;
  let dragged = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function makeId() {
    return `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function cleanTitle(raw, fallback) {
    return String(raw || '').replace(/^#{1,6}\s*/, '').replace(/^[-*]\s*/, '').replace(/\*\*/g, '').replace(/[:：]\s*$/, '').trim() || fallback;
  }

  function splitDefaultPrompt(prompt, sourceType = 'builtin', fallbackName = '完整提示词') {
    const source = String(prompt || '');
    if (!source) return [];
    let boundaries = [...source.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => ({ index: match.index, title: cleanTitle(match[1], '提示词条目') }));
    if (boundaries.length <= 1) {
      const bulletBoundaries = [...source.matchAll(/^-\s+\*\*([^*]+)\*\*\s*:/gm)].map(match => ({ index: match.index, title: cleanTitle(match[1], '提示词规则') }));
      boundaries = [...boundaries, ...bulletBoundaries].sort((a, b) => a.index - b.index);
    }
    if (!boundaries.length) return [normalizeItem({ name: fallbackName, content: source, source: sourceType }, 0)];
    if (boundaries[0].index > 0) boundaries.unshift({ index: 0, title: '基础指令' });
    let separatorBefore = '';
    return boundaries.map((boundary, index) => {
      const hasNext = !!boundaries[index + 1];
      let content = source.slice(boundary.index, boundaries[index + 1]?.index ?? source.length);
      let nextSeparator = '';
      if (hasNext) {
        const trailingWhitespace = content.match(/\s+$/)?.[0] || '';
        if (trailingWhitespace) {
          content = content.slice(0, -trailingWhitespace.length);
          nextSeparator = trailingWhitespace;
        }
      }
      const item = normalizeItem({
        name: boundary.title,
        content,
        separatorBefore,
        enabled: true,
        source: sourceType
      }, index);
      separatorBefore = nextSeparator;
      return item;
    }).filter(item => item.content.trim());
  }

  function normalizeItem(item, index) {
    const value = item && typeof item === 'object' ? item : {};
    return {
      id: typeof value.id === 'string' && value.id ? value.id : makeId(),
      name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : `未命名条目 ${index + 1}`,
      content: typeof value.content === 'string' ? value.content : '',
      note: typeof value.note === 'string' ? value.note : '',
      enabled: value.enabled !== false,
      order: Number.isFinite(Number(value.order)) ? Number(value.order) : index,
      separatorBefore: typeof value.separatorBefore === 'string' ? value.separatorBefore : (index > 0 ? '\n\n' : ''),
      source: typeof value.source === 'string' ? value.source : 'custom'
    };
  }

  function normalizeItems(items) {
    if (!Array.isArray(items)) return [];
    const ids = new Set();
    return items.map((item, index) => {
      const normalized = normalizeItem(item, index);
      if (ids.has(normalized.id)) normalized.id = makeId();
      ids.add(normalized.id);
      return normalized;
    }).sort((a, b) => a.order - b.order).map((item, index) => ({ ...item, order: index }));
  }

  function compose(items) {
    return normalizeItems(items).filter(item => item.enabled && item.content.trim()).map((item, index) => `${index > 0 ? item.separatorBefore : ''}${item.content}`).join('');
  }

  function getStoredItems(settings, scope) {
    const collections = settings?.customPromptCollections;
    if (!collections) return null;
    if (scope === 'thoughts' || scope === 'summary') return collections[scope]?.items || null;
    return collections.chat?.[scope]?.items || null;
  }

  function createInitialItems(settings, scope) {
    const stored = getStoredItems(settings, scope);
    if (Array.isArray(stored)) {
      const normalizedStored = normalizeItems(stored);
      if (normalizedStored.length === 1 && ['legacy', 'imported'].includes(normalizedStored[0].source)) {
        const expanded = splitDefaultPrompt(normalizedStored[0].content, normalizedStored[0].source, normalizedStored[0].name);
        if (expanded.length > 1) {
          expanded.forEach(item => {
            item.enabled = normalizedStored[0].enabled;
            item.note = normalizedStored[0].note;
          });
          return expanded;
        }
      }
      return normalizedStored;
    }
    const config = scopeConfig[scope];
    const legacy = settings?.[config.legacyKey];
    if (typeof legacy === 'string' && legacy.trim()) {
      return splitDefaultPrompt(legacy, 'legacy', '旧版完整提示词');
    }
    return splitDefaultPrompt(config.defaultPrompt());
  }

  function getVariables(scope) {
    const unavailable = unavailableByScope[scope] || new Set();
    const fixed = (variableScopes[scope] || []).map(name => ({
      name,
      description: variableDescriptions[name] || '当前场景运行时变量',
      dynamic: false,
      unavailable: unavailable.has(name)
    }));
    const chat = window.state?.activeChatId ? window.state.chats?.[window.state.activeChatId] : null;
    if ((scope === 'thoughts' || scope === 'single') && chat?.customThoughts) {
      Object.keys(chat.customThoughts).forEach(name => {
        if (!fixed.some(item => item.name === name)) fixed.push({ name, description: '当前角色的自定义心声变量', dynamic: true });
      });
    }
    return fixed;
  }

  function unknownVariables(scope, content) {
    const variables = getVariables(scope);
    const known = new Set(variables.filter(item => !item.unavailable).map(item => item.name));
    return [...new Set([...String(content || '').matchAll(/\{\{([^{}]+)\}\}/g)].map(match => match[1].trim()).filter(name => !known.has(name)))];
  }

  function sync(instance) {
    instance.items = normalizeItems(instance.items);
    if (instance.textarea) {
      instance.textarea.value = compose(instance.items);
      instance.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function render(scope) {
    const instance = instances.get(scope);
    if (!instance?.root) return;
    sync(instance);
    const query = instance.query.trim().toLowerCase();
    const visible = instance.items;
    const enabledCount = instance.items.filter(item => item.enabled && item.content.trim()).length;
    instance.root.innerHTML = `
      <div class="prompt-entry-toolbar">
        <input class="prompt-entry-search" type="search" value="${escapeHtml(instance.query)}" placeholder="搜索条目内容" aria-label="搜索提示词条目">
        <button class="prompt-entry-tool-btn prompt-entry-vars" type="button">变量</button>
        <button class="prompt-entry-tool-btn prompt-entry-preview-btn" type="button">预览</button>
        <button class="prompt-entry-tool-btn primary prompt-entry-add" type="button">＋ 新增</button>
      </div>
      <div class="prompt-entry-stats">共 ${instance.items.length} 个条目 · 启用 ${enabledCount} 个${enabledCount ? '' : ' · 全部停用时沿用现有默认提示词 Fallback'}</div>
      <div class="prompt-entry-list"></div>`;
    const list = instance.root.querySelector('.prompt-entry-list');
    let matchCount = 0;
    visible.forEach(item => {
      const index = instance.items.findIndex(candidate => candidate.id === item.id);
      const unknown = unknownVariables(scope, item.content);
      const variables = [...item.content.matchAll(/\{\{([^{}]+)\}\}/g)].length;
      const card = document.createElement('article');
      card.className = `prompt-entry-card${item.enabled ? '' : ' is-disabled'}`;
      card.draggable = true;
      card.dataset.id = item.id;
      const matchesQuery = !query || item.name.toLowerCase().includes(query) || item.content.toLowerCase().includes(query);
      card.hidden = !matchesQuery;
      if (matchesQuery) matchCount += 1;
      card.innerHTML = `
        <div class="prompt-entry-index" title="拖动排序">${String(index + 1).padStart(2, '0')}</div>
        <div class="prompt-entry-main" tabindex="0" role="button" aria-label="编辑 ${escapeHtml(item.name)}">
          <div class="prompt-entry-heading"><strong>${escapeHtml(item.name)}</strong>${unknown.length ? `<span class="prompt-entry-warning" title="未知变量：${escapeHtml(unknown.join('、'))}">变量待检查</span>` : ''}</div>
          <p class="prompt-entry-preview">${escapeHtml(item.content)}</p>
          <div class="prompt-entry-meta">${variables} 个变量${item.note ? ` · ${escapeHtml(item.note)}` : ''}</div>
        </div>
        <div class="prompt-entry-actions">
          <button class="prompt-entry-edit" type="button" aria-label="编辑">编辑</button>
          <label class="prompt-entry-switch" title="${item.enabled ? '停用' : '启用'}条目"><input type="checkbox" ${item.enabled ? 'checked' : ''}><span></span></label>
        </div>`;
      list.appendChild(card);
      const open = () => openEditor(scope, item.id);
      card.querySelector('.prompt-entry-main').addEventListener('click', open);
      card.querySelector('.prompt-entry-main').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
      card.querySelector('.prompt-entry-edit').addEventListener('click', open);
      card.querySelector('input[type="checkbox"]').addEventListener('change', event => { item.enabled = event.target.checked; render(scope); });
      card.addEventListener('dragstart', () => { dragged = { scope, id: item.id }; card.classList.add('is-dragging'); });
      card.addEventListener('dragend', () => { dragged = null; card.classList.remove('is-dragging'); });
      card.addEventListener('dragover', event => { if (dragged?.scope === scope) event.preventDefault(); });
      card.addEventListener('drop', event => {
        event.preventDefault();
        if (!dragged || dragged.scope !== scope || dragged.id === item.id) return;
        const from = instance.items.findIndex(candidate => candidate.id === dragged.id);
        const to = instance.items.findIndex(candidate => candidate.id === item.id);
        if (from < 0 || to < 0) return;
        const moved = instance.items.splice(from, 1)[0];
        instance.items.splice(to, 0, moved);
        render(scope);
      });
    });
    if (!matchCount) {
      const empty = document.createElement('div');
      empty.className = 'prompt-entry-empty prompt-entry-search-empty';
      empty.textContent = instance.items.length ? '没有匹配的条目' : '暂无提示词条目';
      list.appendChild(empty);
    }
    instance.root.querySelector('.prompt-entry-search').addEventListener('input', event => {
      instance.query = event.target.value;
      const normalized = instance.query.trim().toLowerCase();
      let matches = 0;
      list.querySelectorAll('.prompt-entry-card').forEach(card => {
        const item = instance.items.find(candidate => candidate.id === card.dataset.id);
        const show = !!item && (!normalized || item.name.toLowerCase().includes(normalized) || item.content.toLowerCase().includes(normalized));
        card.hidden = !show;
        if (show) matches += 1;
      });
      let empty = list.querySelector('.prompt-entry-search-empty');
      if (!matches && !empty) {
        empty = document.createElement('div');
        empty.className = 'prompt-entry-empty prompt-entry-search-empty';
        list.appendChild(empty);
      }
      if (empty) {
        empty.textContent = instance.items.length ? '没有匹配的条目' : '暂无提示词条目';
        empty.hidden = matches > 0;
      }
    });
    instance.root.querySelector('.prompt-entry-add').addEventListener('click', () => openEditor(scope));
    instance.root.querySelector('.prompt-entry-vars').addEventListener('click', () => openVariables(scope));
    instance.root.querySelector('.prompt-entry-preview-btn').addEventListener('click', () => openPreview(scope));
  }

  function ensureModal() {
    let modal = document.getElementById('prompt-entry-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'prompt-entry-modal';
    modal.className = 'prompt-entry-modal';
    modal.innerHTML = '<div class="prompt-entry-dialog" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(modal);
    return modal;
  }

  function ensureVariableModal() {
    let modal = document.getElementById('prompt-variable-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'prompt-variable-modal';
    modal.className = 'prompt-entry-modal prompt-variable-modal';
    modal.innerHTML = '<div class="prompt-entry-dialog" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(modal);
    return modal;
  }

  function closeModal() {
    const modal = ensureModal();
    modal.classList.remove('visible');
    modal.querySelector('.prompt-entry-dialog').innerHTML = '';
  }

  function openEditor(scope, itemId) {
    const instance = instances.get(scope);
    if (!instance) return;
    const existing = itemId ? instance.items.find(item => item.id === itemId) : null;
    const draft = existing ? { ...existing } : normalizeItem({ name: '', content: '', enabled: true, source: 'custom' }, instance.items.length);
    const modal = ensureModal();
    const dialog = modal.querySelector('.prompt-entry-dialog');
    dialog.innerHTML = `
      <div class="prompt-entry-dialog-header"><strong>${existing ? '编辑条目' : '新增条目'}</strong><button class="prompt-entry-close" type="button">关闭</button></div>
      <div class="prompt-entry-dialog-body">
        <label class="prompt-entry-field">条目名称<input class="prompt-entry-name" type="text" maxlength="80" value="${escapeHtml(draft.name)}" placeholder="例如：角色身份与核心设定"></label>
        <label class="prompt-entry-field">备注（不会发送给模型）<input class="prompt-entry-note" type="text" maxlength="160" value="${escapeHtml(draft.note)}" placeholder="可选"></label>
        <div class="prompt-entry-editor-tools"><span class="prompt-entry-editor-info"></span><button class="prompt-entry-insert-var" type="button">插入变量</button></div>
        <label class="prompt-entry-field">内容<textarea class="prompt-entry-content" spellcheck="false" placeholder="输入提示词内容…">${escapeHtml(draft.content)}</textarea></label>
      </div>
      <div class="prompt-entry-dialog-footer">
        ${existing ? '<button class="prompt-entry-delete" type="button">删除</button><button class="prompt-entry-duplicate" type="button">复制</button><button class="prompt-entry-up" type="button">上移</button><button class="prompt-entry-down" type="button">下移</button>' : ''}
        <button class="prompt-entry-cancel" type="button">取消</button><button class="prompt-entry-save" type="button">保存</button>
      </div>`;
    modal.classList.add('visible');
    const nameInput = dialog.querySelector('.prompt-entry-name');
    const noteInput = dialog.querySelector('.prompt-entry-note');
    const contentInput = dialog.querySelector('.prompt-entry-content');
    const info = dialog.querySelector('.prompt-entry-editor-info');
    const updateInfo = () => {
      const unknown = unknownVariables(scope, contentInput.value);
      info.textContent = `${contentInput.value.length} 字 · ${[...contentInput.value.matchAll(/\{\{([^{}]+)\}\}/g)].length} 个变量${unknown.length ? ` · ${unknown.length} 个待检查` : ''}`;
    };
    updateInfo();
    contentInput.addEventListener('input', updateInfo);
    const hasChanges = () => nameInput.value !== draft.name || noteInput.value !== draft.note || contentInput.value !== draft.content;
    const requestClose = async () => {
      if (hasChanges() && window.showCustomConfirm) {
        const leave = await window.showCustomConfirm('放弃修改', '当前条目有未保存内容，确定关闭吗？');
        if (!leave) return;
      }
      closeModal();
    };
    dialog.querySelector('.prompt-entry-close').addEventListener('click', requestClose);
    dialog.querySelector('.prompt-entry-cancel').addEventListener('click', requestClose);
    dialog.querySelector('.prompt-entry-insert-var').addEventListener('click', () => openVariables(scope, contentInput));
    dialog.querySelector('.prompt-entry-save').addEventListener('click', () => {
      const name = nameInput.value.trim();
      const content = contentInput.value;
      if (!name || !content.trim()) {
        window.showToast?.('条目名称和内容不能为空');
        return;
      }
      draft.name = name;
      draft.note = noteInput.value.trim();
      draft.content = content;
      if (existing) Object.assign(existing, draft);
      else instance.items.push(draft);
      render(scope);
      closeModal();
      window.showToast?.('提示词条目已保存');
    });
    if (existing) {
      dialog.querySelector('.prompt-entry-delete').addEventListener('click', async () => {
        const confirmed = window.showCustomConfirm ? await window.showCustomConfirm('删除条目', `确定删除“${existing.name}”吗？`) : false;
        if (!confirmed) return;
        instance.items = instance.items.filter(item => item.id !== existing.id);
        render(scope);
        closeModal();
        window.showToast?.('条目已删除');
      });
      dialog.querySelector('.prompt-entry-duplicate').addEventListener('click', () => {
        const index = instance.items.indexOf(existing);
        instance.items.splice(index + 1, 0, normalizeItem({ ...existing, id: makeId(), name: `${existing.name} 副本`, source: 'custom' }, index + 1));
        render(scope);
        closeModal();
        window.showToast?.('已复制条目');
      });
      const move = offset => {
        const index = instance.items.indexOf(existing);
        const target = Math.max(0, Math.min(instance.items.length - 1, index + offset));
        if (target === index) return;
        instance.items.splice(index, 1);
        instance.items.splice(target, 0, existing);
        render(scope);
        closeModal();
      };
      dialog.querySelector('.prompt-entry-up').addEventListener('click', () => move(-1));
      dialog.querySelector('.prompt-entry-down').addEventListener('click', () => move(1));
    }
    setTimeout(() => (existing ? contentInput : nameInput).focus(), 0);
  }

  function openVariables(scope, targetTextarea = null) {
    const modal = targetTextarea ? ensureVariableModal() : ensureModal();
    const dialog = modal.querySelector('.prompt-entry-dialog');
    const variables = getVariables(scope);
    dialog.innerHTML = `
      <div class="prompt-entry-dialog-header"><strong>${escapeHtml(scopeConfig[scope].label)} · 变量手册</strong><button class="prompt-entry-close" type="button">关闭</button></div>
      <div class="prompt-entry-dialog-body"><input class="prompt-variable-search" type="search" placeholder="搜索变量或说明"><div class="prompt-variable-list"></div></div>`;
    modal.classList.add('visible');
    const list = dialog.querySelector('.prompt-variable-list');
    const draw = query => {
      const normalized = query.trim().toLowerCase();
      const filtered = variables.filter(item => !normalized || item.name.toLowerCase().includes(normalized) || item.description.includes(query));
      list.innerHTML = filtered.map(item => `<div class="prompt-variable-item${item.unavailable ? ' is-unavailable' : ''}"><div><code>{{${escapeHtml(item.name)}}}</code><small>${escapeHtml(item.description)}${item.dynamic ? ' · 当前角色动态变量' : ''}${item.unavailable ? ' · 当前调用链尚未提供值' : ''}</small></div><button type="button" data-variable="${escapeHtml(item.name)}">${targetTextarea ? '插入' : '复制'}</button></div>`).join('') || '<div class="prompt-entry-empty">没有匹配的变量</div>';
      list.querySelectorAll('button[data-variable]').forEach(button => button.addEventListener('click', async () => {
        const token = `{{${button.dataset.variable}}}`;
        if (targetTextarea) {
          const start = targetTextarea.selectionStart ?? targetTextarea.value.length;
          const end = targetTextarea.selectionEnd ?? start;
          targetTextarea.setRangeText(token, start, end, 'end');
          targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          modal.classList.remove('visible');
          dialog.innerHTML = '';
          targetTextarea.focus();
        } else {
          try { await navigator.clipboard.writeText(token); window.showToast?.('变量已复制'); } catch (_) { window.showToast?.('复制失败，请手动复制'); }
        }
      }));
    };
    draw('');
    dialog.querySelector('.prompt-variable-search').addEventListener('input', event => draw(event.target.value));
    dialog.querySelector('.prompt-entry-close').addEventListener('click', () => {
      modal.classList.remove('visible');
      dialog.innerHTML = '';
      targetTextarea?.focus();
    });
  }

  function openPreview(scope) {
    const instance = instances.get(scope);
    if (!instance) return;
    const content = compose(instance.items);
    const unresolved = unknownVariables(scope, content);
    const modal = ensureModal();
    const dialog = modal.querySelector('.prompt-entry-dialog');
    dialog.innerHTML = `
      <div class="prompt-entry-dialog-header"><strong>${escapeHtml(scopeConfig[scope].label)} · 最终模板预览</strong><button class="prompt-entry-close" type="button">关闭</button></div>
      <div class="prompt-entry-dialog-body"><div class="prompt-entry-stats">${content.length} 字 · ${unresolved.length ? `${unresolved.length} 个变量待检查` : '变量格式正常'}</div><pre class="prompt-preview-output">${escapeHtml(content || '（没有启用的有效条目；实际调用会沿用现有默认提示词 Fallback）')}</pre></div>`;
    modal.classList.add('visible');
    dialog.querySelector('.prompt-entry-close').addEventListener('click', closeModal);
  }

  function mountAll(settings) {
    globalSettingsRef = settings || globalSettingsRef || {};
    const completeDom = Object.values(scopeConfig).every(config => document.getElementById(config.rootId) && document.getElementById(config.textareaId));
    if (!completeDom) {
      document.body.classList.remove('prompt-entry-ui-ready');
      return;
    }
    let mountedCount = 0;
    Object.entries(scopeConfig).forEach(([scope, config]) => {
      const root = document.getElementById(config.rootId);
      const textarea = document.getElementById(config.textareaId);
      if (!root || !textarea) return;
      instances.set(scope, { scope, root, textarea, items: createInitialItems(globalSettingsRef, scope), query: '' });
      render(scope);
      mountedCount += 1;
    });
    document.body.classList.toggle('prompt-entry-ui-ready', mountedCount === Object.keys(scopeConfig).length);
  }

  function replaceWithDefault(scope) {
    const instance = instances.get(scope);
    if (!instance) return;
    instance.items = splitDefaultPrompt(scopeConfig[scope].defaultPrompt());
    render(scope);
  }

  function replaceWithLegacy(scope, content, name = '导入的完整提示词') {
    const instance = instances.get(scope);
    if (!instance) return;
    instance.items = splitDefaultPrompt(String(content || ''), 'imported', name);
    render(scope);
  }

  function replaceWithItems(scope, items) {
    const instance = instances.get(scope);
    if (!instance || !Array.isArray(items)) return false;
    instance.items = normalizeItems(items);
    render(scope);
    return true;
  }

  function exportState() {
    const get = scope => ({ items: normalizeItems(instances.get(scope)?.items || []) });
    return {
      format: 'ephone-prompt-entries',
      thoughts: get('thoughts'),
      summary: get('summary'),
      chat: { single: get('single'), group: get('group'), offline: get('offline'), group_offline: get('group_offline') }
    };
  }

  function exportScope(scope) {
    return normalizeItems(instances.get(scope)?.items || []);
  }

  window.PromptEntryManager = {
    mountAll,
    replaceWithDefault,
    replaceWithLegacy,
    replaceWithItems,
    exportState,
    exportScope,
    compose,
    getVariables,
    createDefaultItems(scope) { return scopeConfig[scope] ? splitDefaultPrompt(scopeConfig[scope].defaultPrompt()) : []; },
    splitPromptIntoEntries(content, name = '完整提示词') { return splitDefaultPrompt(content, 'imported', name); },
    syncAll() { instances.forEach(sync); }
  };
})();
