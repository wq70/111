  // ========== 从 script.js 迁移：Todo 相关函数 ==========
  let currentTodoDate = new Date();
  // todoCache, todoRenderCount, isLoadingMoreTodos 已在 utils.js 中声明
  let editingTodoId = null;
  const pendingCharacterTodos = new Set();
  const characterTodoTypes = ['日常', '工作', '重要', '生活', '约会', '学习', '记账'];

  function characterTodoSettings(chat) {
    return chat?.isGroup ? {} : (chat?.settings?.characterTodos || {});
  }

  function updateCharacterTodoSettingsVisibility() {
    const enabled = document.getElementById('char-todo-manual').checked || document.getElementById('char-todo-auto').checked;
    document.getElementById('char-todo-source-row').style.display = enabled ? '' : 'none';
    const custom = document.getElementById('char-todo-source').value === 'custom';
    document.getElementById('char-todo-routine-row').style.display = enabled && custom ? '' : 'none';
  }

  function renderCharacterTodoSettings(chat) {
    const settings = characterTodoSettings(chat);
    document.getElementById('char-todo-settings').style.display = chat.isGroup ? 'none' : '';
    document.getElementById('char-todo-manual').checked = settings.manual === true;
    document.getElementById('char-todo-auto').checked = settings.auto === true;
    document.getElementById('char-todo-source').value = settings.source === 'custom' ? 'custom' : 'persona';
    document.getElementById('char-todo-routine').value = settings.routine || '';
    updateCharacterTodoSettingsVisibility();
  }

  function saveCharacterTodoSettings(chat) {
    chat.settings.characterTodos = {
      manual: document.getElementById('char-todo-manual').checked,
      auto: document.getElementById('char-todo-auto').checked,
      source: document.getElementById('char-todo-source').value,
      routine: document.getElementById('char-todo-routine').value.trim().slice(0, 500)
    };
  }

  function characterTodosForDate(chat, date) {
    return (chat.todoList || []).filter(todo => todo.owner === 'char' && todo.date === date);
  }

  function characterTodoPrompt(chat, date) {
    const { source, routine } = characterTodoSettings(chat);
    if (source === 'custom' && !routine?.trim()) return '';
    const schedule = source === 'custom' ? `按这份作息安排：${JSON.stringify(routine)}` : '根据角色人设推断作息。';
    return `为角色本人安排 ${date} 的 2–4 件具体事项。${schedule} 用 JSON 对象 {"type":"character_todo","content":"事项","time":"HH:mm","task_type":"日常"} 表示每一项。事项只描述角色自己的安排。`;
  }

  function characterTodoChatContext(chat) {
    const { auto, manual } = characterTodoSettings(chat);
    if (!auto && !manual) return { date: '', prompt: '' };
    const date = getTodoDateString(new Date());
    const todos = characterTodosForDate(chat, date);
    if (todos.length) {
      const today = todos.slice(0, 4).map(todo => `${todo.time} ${String(todo.content).slice(0, 100)}${todo.status === 'completed' ? '（已完成）' : ''}`);
      return { date: '', prompt: `\n角色本人今天的安排（聊天可自然参考）：${JSON.stringify(today)}` };
    }
    if (!auto || chat.characterTodoAutoDate === date || pendingCharacterTodos.has(JSON.stringify([chat.id, date]))) return { date: '', prompt: '' };
    const instruction = characterTodoPrompt(chat, date);
    return instruction ? { date, prompt: `\n${instruction} 把事项放进本轮正常回复的 JSON 数组。` } : { date: '', prompt: '' };
  }

  function addCharacterTodos(chat, date, actions, mode) {
    if (!date || !characterTodoSettings(chat)[mode] || characterTodosForDate(chat, date).length) return 0;
    if (mode === 'auto' && chat.characterTodoAutoDate === date) return 0;
    const tasks = [];
    const timestamp = Date.now();
    for (const action of actions) {
      if (action?.type !== 'character_todo' || typeof action.content !== 'string') continue;
      const content = action.content.trim().slice(0, 100);
      if (!content || tasks.some(task => task.content === content)) continue;
      const time = typeof action.time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(action.time) ? action.time : '';
      const type = characterTodoTypes.includes(action.task_type) ? action.task_type : '日常';
      tasks.push({ id: timestamp + Math.random(), content, date, time, type, status: 'pending', creator: 'char', owner: 'char', timestamp });
      if (tasks.length === 4) break;
    }
    if (tasks.length) {
      chat.todoList = [...(chat.todoList || []), ...tasks];
      if (mode === 'auto') chat.characterTodoAutoDate = date;
    }
    return tasks.length;
  }

  async function requestCharacterTodos(chat, instruction) {
    const base = state.apiConfig;
    const override = chat.apiOverride?.enabled ? chat.apiOverride : {};
    const proxyUrl = (override.proxyUrl || base.proxyUrl || '').replace(/\/$/, '');
    const apiKey = override.apiKey || base.apiKey;
    const model = override.model || base.model;
    if (!proxyUrl || !apiKey || !model) throw new Error('请先配置 API 地址、密钥和模型。');
    const system = `角色：${chat.originalName || chat.name}\n人设：${chat.settings.aiPersona || ''}\n只输出待办对象组成的 JSON 数组。`;
    const messages = [{ role: 'user', content: instruction }];
    const request = proxyUrl === GEMINI_API_URL ? toGeminiRequestData(model, apiKey, system, messages) : {
      url: `${proxyUrl}/v1/chat/completions`,
      data: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages], stream: false })
      }
    };
    const response = await fetch(request.url, request.data);
    if (!response.ok) throw new Error(`生成待办失败（API ${response.status}）。`);
    return parseAiResponse(getGeminiResponseText(await response.json()));
  }

  async function generateCharacterTodosForSelectedDate() {
    const chat = state.chats[state.activeChatId];
    if (!characterTodoSettings(chat).manual) return;
    const date = getTodoDateString(currentTodoDate);
    if (characterTodosForDate(chat, date).length) return showToast('这一天已有 Char 待办。');
    const instruction = characterTodoPrompt(chat, date);
    if (!instruction) return showToast('请先在聊天设置填写 Char 作息。');
    const key = JSON.stringify([chat.id, date]);
    if (pendingCharacterTodos.has(key)) return;
    pendingCharacterTodos.add(key);
    updateCharacterTodoButton(chat, date);
    try {
      const actions = await requestCharacterTodos(chat, instruction);
      const current = state.chats[chat.id];
      if (!current || !characterTodoSettings(current).manual) return;
      const before = current.todoList;
      const count = addCharacterTodos(current, date, actions, 'manual');
      if (!count) {
        if (!characterTodosForDate(current, date).length) throw new Error('模型没有返回有效的 Char 待办，请重试。');
        return;
      }
      const generated = current.todoList;
      try {
        const updated = await db.chats.update(current.id, { todoList: generated });
        if (!updated) throw new Error('找不到该角色，待办未保存。');
      } catch (error) {
        if (current.todoList === generated) current.todoList = before;
        throw error;
      }
      if (state.activeChatId === current.id) await renderTodoList();
      showToast(`已生成 ${count} 条 Char 待办。`);
    } catch (error) {
      showToast(error.message || '生成 Char 待办失败，请重试。', 'error');
    } finally {
      pendingCharacterTodos.delete(key);
      const active = state.chats[state.activeChatId];
      if (active) updateCharacterTodoButton(active, getTodoDateString(currentTodoDate));
    }
  }

  function updateCharacterTodoButton(chat, date) {
    const row = document.getElementById('char-todo-generate-row');
    const button = document.getElementById('char-todo-generate');
    row.hidden = !characterTodoSettings(chat).manual;
    const pending = pendingCharacterTodos.has(JSON.stringify([chat.id, date]));
    const exists = characterTodosForDate(chat, date).length > 0;
    button.disabled = pending || exists;
    button.textContent = pending ? '正在生成…' : exists ? '已有 Char 待办' : '生成 Char 待办';
  }

  async function openTodoList() {
    if (!state.activeChatId) return;
    currentTodoDate = new Date();
    updateTodoDateDisplay();
    await renderTodoList();
    showScreen('todo-list-screen');
  }

  function getTodoDateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function updateTodoDateDisplay() {
    const displayEl = document.getElementById('todo-current-date-display');
    const now = new Date();
    const dateStr = getTodoDateString(currentTodoDate);
    const todayStr = getTodoDateString(now);
    if (dateStr === todayStr) {
      displayEl.textContent = "今天";
    } else {
      displayEl.textContent = dateStr;
    }
  }

  function changeTodoDate(days) {
    currentTodoDate.setDate(currentTodoDate.getDate() + days);
    updateTodoDateDisplay();
    renderTodoList();
  }

  async function renderTodoList() {
    const container = document.getElementById('todo-list-container');
    container.innerHTML = '';
    const chat = state.chats[state.activeChatId];
    if (!chat) return;
    const targetDateStr = getTodoDateString(currentTodoDate);
    updateCharacterTodoButton(chat, targetDateStr);
    const todos = chat.todoList || [];
    const dayTodos = todos.filter(t => t.date === targetDateStr);
    dayTodos.sort((a, b) => {
      if (a.status === b.status) return (a.time || '00:00').localeCompare(b.time || '00:00');
      return a.status === 'completed' ? 1 : -1;
    });
    if (dayTodos.length === 0) {
      todoCache = [];
      todoRenderCount = 0;
      container.innerHTML = `<div class="todo-empty-state">📅 ${targetDateStr}<br>暂无待办事项</div>`;
      return;
    }
    todoCache = dayTodos;
    todoRenderCount = 0;
    loadMoreTodos();
  }

  function loadMoreTodos() {
    if (isLoadingMoreTodos) return;
    const container = document.getElementById('todo-list-container');
    if (!container) return;
    if (todoRenderCount >= todoCache.length) return;
    isLoadingMoreTodos = true;
    const BATCH_SIZE = 30;
    const nextSliceEnd = todoRenderCount + BATCH_SIZE;
    const itemsToRender = todoCache.slice(todoRenderCount, nextSliceEnd);
    const fragment = document.createDocumentFragment();
    itemsToRender.forEach(todo => {
      const item = document.createElement('div');
      const isUser = (todo.creator === 'user' || !todo.creator);
      const creatorClass = isUser ? 'is-user' : 'is-char';
      item.className = `todo-item ${todo.status} ${creatorClass}`;
      item.dataset.id = todo.id;
      const colorMap = {
        '日常': '#8e8e93', '工作': '#007aff', '重要': '#ff3b30',
        '生活': '#34c759', '约会': '#af52de', '学习': '#ff9500', '记账': '#ffc107'
      };
      const tagColor = colorMap[todo.type] || '#8e8e93';
      item.innerHTML = `
            <div class="todo-checkbox"></div>
            <div class="todo-info">
                <div class="todo-content">${escapeHTML(todo.content)}</div>
                <div class="todo-meta">
                    ${todo.owner === 'char' ? '<span class="todo-tag">Char 的待办</span>' : ''}
                    <span class="todo-tag" style="--tag-color: ${tagColor};">${todo.type || '日常'}</span>
                    ${todo.time ? `<span class="todo-time">⏰ ${todo.time}</span>` : ''}
                </div>
            </div>
            <button class="todo-delete-btn">×</button>
        `;
      item.querySelector('.todo-checkbox').addEventListener('click', (e) => { e.stopPropagation(); toggleTodoStatus(todo.id); });
      item.querySelector('.todo-delete-btn').addEventListener('click', (e) => { e.stopPropagation(); deleteTodo(todo.id); });
      item.addEventListener('click', () => openTodoEditor(todo));
      fragment.appendChild(item);
    });
    container.appendChild(fragment);
    todoRenderCount += itemsToRender.length;
    isLoadingMoreTodos = false;
  }

  async function toggleTodoStatus(id) {
    const chat = state.chats[state.activeChatId];
    const todo = chat.todoList.find(t => t.id === id);
    if (todo) {
      const isCompleting = todo.status !== 'completed';
      todo.status = isCompleting ? 'completed' : 'pending';
      if (isCompleting && todo.owner !== 'char') {
        const myNickname = chat.settings.myNickname || '我';
        const systemHint = `[系统提示：用户(${myNickname}) 刚刚在待办清单中勾选完成了："${todo.content}"。]`;
        chat.history.push({ role: 'system', content: systemHint, timestamp: Date.now(), isHidden: true });
      }
      await db.chats.put(chat);
      renderTodoList();
    }
  }

  async function deleteTodo(id) {
    const confirmed = await showCustomConfirm("删除事项", "确定要删除这条待办事项吗？");
    if (confirmed) {
      const chat = state.chats[state.activeChatId];
      chat.todoList = chat.todoList.filter(t => t.id !== id);
      await db.chats.put(chat);
      renderTodoList();
    }
  }

  function openTodoEditor(todo = null) {
    const modal = document.getElementById('todo-editor-modal');
    const titleEl = document.getElementById('todo-editor-title');
    editingTodoId = todo ? todo.id : null;
    titleEl.textContent = todo ? '编辑事项' : '添加事项';
    document.getElementById('todo-content-input').value = todo ? todo.content : '';
    document.getElementById('todo-date-input').value = todo ? todo.date : getTodoDateString(currentTodoDate);
    document.getElementById('todo-time-input').value = todo ? todo.time : '';
    const typeOptions = document.querySelectorAll('.todo-type-option');
    typeOptions.forEach(opt => opt.classList.remove('active'));
    const targetType = todo ? todo.type : '日常';
    const activeOption = Array.from(typeOptions).find(opt => opt.dataset.value === targetType);
    if (activeOption) activeOption.classList.add('active');
    modal.classList.add('visible');
  }

  async function saveTodo() {
    const content = document.getElementById('todo-content-input').value.trim();
    const date = document.getElementById('todo-date-input').value;
    const time = document.getElementById('todo-time-input').value;
    const typeEl = document.querySelector('.todo-type-option.active');
    const type = typeEl ? typeEl.dataset.value : '日常';
    if (!content || !date) { alert("内容和日期不能为空！"); return; }
    const chat = state.chats[state.activeChatId];
    if (!chat.todoList) chat.todoList = [];
    if (editingTodoId) {
      const todo = chat.todoList.find(t => t.id === editingTodoId);
      if (todo) { todo.content = content; todo.date = date; todo.time = time; todo.type = type; }
    } else {
      chat.todoList.push({ id: Date.now(), content, date, time, type, status: 'pending', creator: 'user', timestamp: Date.now() });
    }
    await db.chats.put(chat);
    const newDate = new Date(`${date}T00:00:00`);
    if (!isNaN(newDate.getTime())) { currentTodoDate = newDate; updateTodoDateDisplay(); }
    document.getElementById('todo-editor-modal').classList.remove('visible');
    renderTodoList();
  }

  window.renderTodoList = renderTodoList;
  window.loadMoreTodos = loadMoreTodos;
  window.saveTodo = saveTodo;
  window.updateTodoDateDisplay = updateTodoDateDisplay;
  window.changeTodoDate = changeTodoDate;
  window.openTodoEditor = openTodoEditor;
  window.openTodoList = openTodoList;
  window.CharacterTodos = {
    renderSettings: renderCharacterTodoSettings,
    saveSettings: saveCharacterTodoSettings,
    updateSettingsVisibility: updateCharacterTodoSettingsVisibility,
    generateForSelectedDate: generateCharacterTodosForSelectedDate,
    chatContext: characterTodoChatContext,
    add: addCharacterTodos
  };

