// ============================================================
// 用户状态/心声/角色资料 (原 script.js 第 33054~33351 行)
// ============================================================

  let appliedThoughtsUIMode = null;
  let appliedThoughtsHTML = null;
  let appliedThoughtsCSS = null;
  let thoughtsOpenRequestId = 0;
  let thoughtsHistoryRequestId = 0;
  let thoughtsModalTrigger = null;
  const boundThoughtsHistoryLists = new WeakSet();

  function getThoughtsModal() {
    return document.getElementById('character-profile-modal');
  }

  function getThoughtsElement(id) {
    return getThoughtsModal()?.querySelector(`#${id}`) || null;
  }

  function handleThoughtsHistoryScroll(event) {
    const listEl = event.currentTarget;
    if (!listEl || isLoadingMoreThoughts) return;
    if (listEl.scrollHeight - listEl.scrollTop > listEl.clientHeight + 80) return;

    const totalItems = state.chats[state.activeChatId]?.thoughtsHistory?.length || 0;
    if (totalItems > thoughtsHistoryRenderCount) loadMoreThoughts();
  }

  function bindThoughtsHistoryScroll(listEl) {
    if (!listEl || boundThoughtsHistoryLists.has(listEl)) return;
    boundThoughtsHistoryLists.add(listEl);
    listEl.addEventListener('scroll', handleThoughtsHistoryScroll, { passive: true });
  }

  function setThoughtsCustomStylesEnabled(enabled) {
    const modal = getThoughtsModal();
    const shouldEnable = !!enabled && modal?.dataset.thoughtsUiMode === 'custom';
    const styleEl = document.getElementById('custom-thoughts-style');
    if (styleEl) styleEl.disabled = !shouldEnable;
    modal?.querySelectorAll('.character-profile-content style').forEach(element => {
      element.disabled = !shouldEnable;
    });
  }

  function applyCustomThoughtsUI(force = false, chat = state.chats[state.activeChatId]) {
    const modal = getThoughtsModal();
    const modalContent = modal?.querySelector('.character-profile-content');
    if (!modalContent) return null;

    const uiEnabled = !!state.globalSettings.customThoughtsUIEnabled;
    const mode = uiEnabled && state.globalSettings.customThoughtsHTML ? 'custom' : 'default';
    const html = mode === 'custom'
      ? window.renderAppearanceHtml(state.globalSettings.customThoughtsHTML, chat)
      : (typeof getDefaultThoughtsHTML === 'function' ? getDefaultThoughtsHTML() : '');
    const currentDefaultMarkupIsUsable = mode === 'default'
      && getThoughtsElement('profile-heartfelt-voice')
      && getThoughtsElement('profile-random-jottings');
    const markupChanged = force
      || appliedThoughtsUIMode !== mode
      || appliedThoughtsHTML !== html;

    // 初始默认 DOM 已由页面提供，直接接管，避免首次打开也进行一次无意义的整块重建。
    if (markupChanged && !(appliedThoughtsUIMode === null && currentDefaultMarkupIsUsable && !force)) {
      const template = document.createElement('template');
      template.innerHTML = html;
      modalContent.replaceChildren(template.content.cloneNode(true));
    }

    appliedThoughtsUIMode = mode;
    appliedThoughtsHTML = html;
    modal.dataset.thoughtsUiMode = mode;

    let styleEl = document.getElementById('custom-thoughts-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'custom-thoughts-style';
      document.head.appendChild(styleEl);
    }
    const css = mode === 'custom' ? window.replaceAppearanceVariables(state.globalSettings.customThoughtsCSS, chat, 'css') : '';
    if (appliedThoughtsCSS !== css || styleEl.textContent !== css) {
      styleEl.textContent = css;
      appliedThoughtsCSS = css;
    }

    bindThoughtsHistoryScroll(getThoughtsElement('thoughts-history-list'));
    setThoughtsCustomStylesEnabled(modal.classList.contains('visible'));
    return modalContent;
  }

  function invalidateCustomThoughtsUI(applyImmediately = false) {
    appliedThoughtsUIMode = null;
    appliedThoughtsHTML = null;
    appliedThoughtsCSS = null;

    if (!state.globalSettings.customThoughtsUIEnabled) {
      const styleEl = document.getElementById('custom-thoughts-style');
      if (styleEl) styleEl.textContent = '';
    }

    const modal = getThoughtsModal();
    if (applyImmediately || modal?.classList.contains('visible')) {
      applyCustomThoughtsUI(true);
    }
  }

  function closeCharacterProfileModal() {
    const modal = getThoughtsModal();
    if (!modal) return;
    thoughtsOpenRequestId++;
    thoughtsHistoryRequestId++;
    setThoughtsCustomStylesEnabled(false);
    modal.classList.remove('visible');
    modal.classList.add('thoughts-paused');
    hideThoughtsHistory();
    if (thoughtsModalTrigger?.isConnected && typeof thoughtsModalTrigger.focus === 'function') {
      thoughtsModalTrigger.focus({ preventScroll: true });
    }
    thoughtsModalTrigger = null;
  }

  function bindThoughtsModalEvents() {
    const modal = getThoughtsModal();
    if (!modal || modal.dataset.thoughtsEventsBound === 'true') return;
    modal.dataset.thoughtsEventsBound = 'true';

    modal.addEventListener('click', event => {
      if (event.target === modal) {
        closeCharacterProfileModal();
        return;
      }

      const target = event.target.closest([
        '#profile-edit-btn',
        '#profile-history-icon-btn',
        '#history-back-btn',
        '#manage-thoughts-btn',
        '#delete-selected-thoughts-btn',
        '#load-more-thoughts-btn',
        '.thought-delete-btn',
        '.thought-card'
      ].join(','));
      if (!target || !modal.contains(target)) return;
      if (target.id === 'profile-edit-btn') openThoughtEditor();
      else if (target.id === 'profile-history-icon-btn') showThoughtsHistory();
      else if (target.id === 'history-back-btn') hideThoughtsHistory();
      else if (target.id === 'manage-thoughts-btn') toggleThoughtsManagementMode();
      else if (target.id === 'delete-selected-thoughts-btn') executeBatchDeleteThoughts();
      else if (target.id === 'load-more-thoughts-btn') loadMoreThoughts();
      else if (target.classList.contains('thought-delete-btn')) {
        const timestamp = Number.parseInt(target.dataset.timestamp, 10);
        if (Number.isFinite(timestamp)) handleDeleteThought(timestamp);
      } else if (target.classList.contains('thought-card') && isThoughtsManagementMode) {
        toggleThoughtCardSelection(target);
      }
    });

    modal.addEventListener('change', event => {
      if (event.target?.id === 'select-all-thoughts-checkbox') handleSelectAllThoughts();
    });
  }

  bindThoughtsModalEvents();
  window.applyCustomThoughtsUI = applyCustomThoughtsUI;
  window.invalidateCustomThoughtsUI = invalidateCustomThoughtsUI;
  window.closeCharacterProfileModal = closeCharacterProfileModal;

  // USER状态修改弹窗 - 直接输入框
  async function showUserStatusModal(chatId) {
    const chat = state.chats[chatId];
    if (!chat) return;

    // 初始化USER状态（如果不存在）
    if (!chat.settings.userStatus) {
      chat.settings.userStatus = {
        text: '在线',
        lastUpdate: Date.now(),
        isBusy: false
      };
    }

    // 直接弹出输入框
    const customStatus = await showCustomPrompt(
      '修改在线状态',
      '请输入你的状态...',
      chat.settings.userStatus.text
    );

    if (customStatus !== null && customStatus.trim()) {
      await updateUserStatus(chatId, customStatus.trim(), false);
    }
  }

  async function updateUserStatus(chatId, statusText, isBusy) {
    const chat = state.chats[chatId];
    if (!chat) return;

    const oldStatus = chat.settings.userStatus.text;

    // 更新USER状态
    chat.settings.userStatus = {
      text: statusText,
      isBusy: isBusy,
      lastUpdate: Date.now()
    };

    // 保存到数据库
    await db.chats.put(chat);
    state.chats[chatId] = chat;

    // 添加系统提示消息
    const myNickname = chat.settings.myNickname || '我';
    const statusUpdateMessage = {
      role: 'system',
      type: 'pat_message',
      content: `[${myNickname}的状态已更新为: ${statusText}]`,
      timestamp: Date.now()
    };

    chat.history.push(statusUpdateMessage);
    await db.chats.put(chat);

    // 如果当前在聊天界面，刷新消息显示
    if (state.activeChatId === chatId) {
      await appendMessage(statusUpdateMessage, chat);
      scrollToBottom();
    }

    console.log(`USER状态已更新: ${oldStatus} -> ${statusText}`);
  }


  async function openThoughtEditor() {

    if (!state.activeChatId || state.chats[state.activeChatId].isGroup) return;
    const chat = state.chats[state.activeChatId];
    if (!chat) return;


    const currentHeartfeltVoice = chat.heartfeltVoice || '';
    const newHeartfeltVoice = await showCustomPrompt(
      `编辑"${chat.name}"的心声`,
      '请输入新的心声内容...',
      currentHeartfeltVoice,
      'textarea'
    );


    if (newHeartfeltVoice === null) {
      await showCustomAlert("操作取消", "心声编辑已取消。");
      return;
    }


    const currentRandomJottings = chat.randomJottings || '';
    const newRandomJottings = await showCustomPrompt(
      `编辑"${chat.name}"的散记`,
      '请输入新的散记内容...',
      currentRandomJottings,
      'textarea'
    );


    if (newRandomJottings === null) {
      await showCustomAlert("操作取消", "散记编辑已取消，心声的修改也未保存。");
      return;
    }


    chat.heartfeltVoice = newHeartfeltVoice.trim();
    chat.randomJottings = newRandomJottings.trim();


    if (!Array.isArray(chat.thoughtsHistory)) {
      chat.thoughtsHistory = [];
    }

    if (chat.thoughtsHistory.length > 0) {

      const lastThought = chat.thoughtsHistory[chat.thoughtsHistory.length - 1];

      lastThought.heartfeltVoice = chat.heartfeltVoice;
      lastThought.randomJottings = chat.randomJottings;
      // 保留 customThoughts
      lastThought.timestamp = Date.now();
    } else {

      chat.thoughtsHistory.push({
        heartfeltVoice: chat.heartfeltVoice,
        randomJottings: chat.randomJottings,
        customThoughts: chat.customThoughts ? JSON.parse(JSON.stringify(chat.customThoughts)) : {},
        timestamp: Date.now()
      });
    }


    await db.chats.put(chat);


    await showCharacterProfileModal(chat.id);

    await showCustomAlert('成功', '心声和散记已更新！');
  }

  async function showCharacterProfileModal(chatId) {
    const chat = state.chats[chatId];
    if (!chat || chat.isGroup) return;
    const modal = getThoughtsModal();
    if (!modal) return;

    const requestId = ++thoughtsOpenRequestId;
    thoughtsHistoryRequestId++;
    thoughtsModalTrigger = document.activeElement;
    applyCustomThoughtsUI(false, chat);
    hideThoughtsHistory();

    const heartfeltVoiceEl = getThoughtsElement('profile-heartfelt-voice');
    const randomJottingsEl = getThoughtsElement('profile-random-jottings');
    const enableThoughts = chat.settings.enableThoughts !== null
      ? chat.settings.enableThoughts
      : state.globalSettings.enableThoughts;
    const disabledMessage = '<span style="color: #999;">心声功能已关闭</span>';

    if (heartfeltVoiceEl) heartfeltVoiceEl.textContent = '';
    if (randomJottingsEl) randomJottingsEl.textContent = '';
    modal.classList.remove('thoughts-paused');
    modal.classList.add('visible');
    setThoughtsCustomStylesEnabled(true);

    if (!heartfeltVoiceEl || !randomJottingsEl) return;
    if (!enableThoughts) {
      heartfeltVoiceEl.innerHTML = disabledMessage;
      randomJottingsEl.innerHTML = disabledMessage;
      return;
    }

    const [renderedVoice, renderedJottings] = await Promise.all([
      applyRenderingRules(chat.heartfeltVoice || '...', chatId, { messageId: 'current-thoughts', role: 'assistant', type: 'thoughts', field: 'heartfeltVoice' }),
      applyRenderingRules(chat.randomJottings || '...', chatId, { messageId: 'current-thoughts', role: 'assistant', type: 'thoughts', field: 'randomJottings' })
    ]);
    if (requestId !== thoughtsOpenRequestId || !modal.classList.contains('visible')) return;

    const currentHeartfeltVoiceEl = getThoughtsElement('profile-heartfelt-voice');
    const currentRandomJottingsEl = getThoughtsElement('profile-random-jottings');
    if (currentHeartfeltVoiceEl) currentHeartfeltVoiceEl.innerHTML = renderedVoice;
    if (currentRandomJottingsEl) currentRandomJottingsEl.innerHTML = renderedJottings;
  }

  async function showThoughtsHistory() {
    const mainContent = getThoughtsElement('profile-main-content');
    const historyView = getThoughtsElement('profile-thoughts-history-view');
    if (!mainContent || !historyView) return;
    mainContent.style.display = 'none';
    historyView.style.display = 'flex';
    
    // 初始化管理模式状态为关闭
    if (isThoughtsManagementMode) {
      toggleThoughtsManagementMode();
    }
    
    // 在显示历史记录时，重新绑定/确保绑定了管理相关事件
    bindThoughtsManagementEvents();
    
    await renderThoughtsHistory(); // <-- 2. 添加 await
  }

  function bindThoughtsManagementEvents() {
    bindThoughtsHistoryScroll(getThoughtsElement('thoughts-history-list'));
  }


  function hideThoughtsHistory() {
    thoughtsHistoryRequestId++;
    const historyView = getThoughtsElement('profile-thoughts-history-view');
    const mainContent = getThoughtsElement('profile-main-content');
    if (historyView) historyView.style.display = 'none';
    if (mainContent) mainContent.style.display = 'flex';
    
    // 退出时恢复管理模式状态
    if (isThoughtsManagementMode) {
      toggleThoughtsManagementMode();
      if (isThoughtsManagementMode) {
        isThoughtsManagementMode = false;
        selectedThoughts.clear();
      }
    }
  }

  // --- 心声批量管理模式逻辑 ---
  let isThoughtsManagementMode = false;
  let selectedThoughts = new Set();

  function toggleThoughtsManagementMode() {
    const listEl = getThoughtsElement('thoughts-history-list');
    const actionBar = getThoughtsElement('thoughts-action-bar');
    const manageBtn = getThoughtsElement('manage-thoughts-btn');
    const selectAllCheckbox = getThoughtsElement('select-all-thoughts-checkbox');
    if (!listEl || !actionBar || !manageBtn || !selectAllCheckbox) return;
    isThoughtsManagementMode = !isThoughtsManagementMode;

    if (isThoughtsManagementMode) {
      listEl.classList.add('management-mode');
      actionBar.style.display = 'flex';
      manageBtn.textContent = '完成';
      manageBtn.style.color = 'var(--accent-color)';
      selectedThoughts.clear();
      selectAllCheckbox.checked = false;
      updateDeleteThoughtsButton();
    } else {
      listEl.classList.remove('management-mode');
      actionBar.style.display = 'none';
      manageBtn.textContent = '管理';
      manageBtn.style.color = 'var(--text-secondary)';
      selectedThoughts.clear();
      
      // 取消所有的选中状态样式
      listEl.querySelectorAll('.thought-card.selected').forEach(card => {
        card.classList.remove('selected');
        const cb = card.querySelector('.thought-checkbox');
        if (cb) cb.checked = false;
      });
    }
  }

  function updateDeleteThoughtsButton() {
    const btn = getThoughtsElement('delete-selected-thoughts-btn');
    if (btn) {
      btn.textContent = `删除 (${selectedThoughts.size})`;
      if (selectedThoughts.size > 0) {
        btn.style.backgroundColor = '#ff3b30';
        btn.style.opacity = '1';
        btn.disabled = false;
      } else {
        btn.style.backgroundColor = '#ff3b30';
        btn.style.opacity = '0.4';
        btn.disabled = true;
      }
    }
  }

  function handleSelectAllThoughts() {
    const selectAllCheckbox = getThoughtsElement('select-all-thoughts-checkbox');
    const listEl = getThoughtsElement('thoughts-history-list');
    if (!selectAllCheckbox || !listEl) return;
    const isChecked = selectAllCheckbox.checked;
    const cards = listEl.querySelectorAll('.thought-card');
    
    cards.forEach(card => {
      const timestamp = parseInt(card.dataset.timestamp);
      if (isNaN(timestamp)) return;
      
      const cb = card.querySelector('.thought-checkbox');
      if (cb) {
        cb.checked = isChecked;
        if (isChecked) {
          card.classList.add('selected');
          selectedThoughts.add(timestamp);
        } else {
          card.classList.remove('selected');
          selectedThoughts.delete(timestamp);
        }
      }
    });
    
    updateDeleteThoughtsButton();
  }

  function toggleThoughtCardSelection(card) {
    const cb = card.querySelector('.thought-checkbox');
    if (!cb) return;
    cb.checked = !cb.checked;
    const timestamp = Number.parseInt(card.dataset.timestamp, 10);
    if (!Number.isFinite(timestamp)) return;
    card.classList.toggle('selected', cb.checked);
    if (cb.checked) selectedThoughts.add(timestamp);
    else selectedThoughts.delete(timestamp);
    updateDeleteThoughtsButton();
  }

  async function executeBatchDeleteThoughts() {
    if (selectedThoughts.size === 0) return;

    const confirmed = await showCustomConfirm(
      '确认删除',
      `确定要删除选中的 ${selectedThoughts.size} 条心声记录吗？此操作不可恢复。`, {
      confirmButtonClass: 'btn-danger'
    });

    if (confirmed) {
      const chat = state.chats[state.activeChatId];
      if (!chat || !chat.thoughtsHistory) return;

      const idsToDelete = [...selectedThoughts];
      // 判断是否包含最新的一条心声
      let includesLatest = false;
      if (chat.thoughtsHistory.length > 0) {
        const latestTimestamp = chat.thoughtsHistory[chat.thoughtsHistory.length - 1].timestamp;
        includesLatest = idsToDelete.includes(latestTimestamp);
      }

      chat.thoughtsHistory = chat.thoughtsHistory.filter(thought => !idsToDelete.includes(thought.timestamp));

      // 如果删除了最新的心声，需要回退当前心声状态
      if (includesLatest) {
        if (chat.thoughtsHistory.length > 0) {
          const newLatestThought = chat.thoughtsHistory[chat.thoughtsHistory.length - 1];
          chat.heartfeltVoice = newLatestThought.heartfeltVoice;
          chat.randomJottings = newLatestThought.randomJottings;
          chat.customThoughts = newLatestThought.customThoughts ? JSON.parse(JSON.stringify(newLatestThought.customThoughts)) : {};

          const heartfeltVoiceEl = getThoughtsElement('profile-heartfelt-voice');
          const randomJottingsEl = getThoughtsElement('profile-random-jottings');
          if (heartfeltVoiceEl) heartfeltVoiceEl.textContent = chat.heartfeltVoice;
          if (randomJottingsEl) randomJottingsEl.textContent = chat.randomJottings;

          console.log("批量删除包含了最新心声，当前心声已回滚至上一条。");
        } else {
          chat.heartfeltVoice = '...';
          chat.randomJottings = '...';
          chat.customThoughts = {};

          const heartfeltVoiceEl = getThoughtsElement('profile-heartfelt-voice');
          const randomJottingsEl = getThoughtsElement('profile-random-jottings');
          if (heartfeltVoiceEl) heartfeltVoiceEl.textContent = chat.heartfeltVoice;
          if (randomJottingsEl) randomJottingsEl.textContent = chat.randomJottings;

          console.log("所有心声记录均已被删除，当前心声已重置。");
        }
      }

      await db.chats.put(chat);
      
      toggleThoughtsManagementMode(); // 操作完成后退出管理模式
      await renderThoughtsHistory(); // 重新渲染列表
      await showCustomAlert('删除成功', `已成功删除 ${idsToDelete.length} 条心声记录。`);
    }
  }

  // 初始化时调用一次绑定（主要针对没有使用自定义 UI 的原生情况）
  document.addEventListener('DOMContentLoaded', () => {
    bindThoughtsManagementEvents();
  });



  function getThoughtsHistoryBatch(history, offset, limit) {
    const endIndex = history.length - 1 - offset;
    if (endIndex < 0) return [];
    const startIndex = Math.max(0, endIndex - limit + 1);
    const batch = [];
    for (let index = endIndex; index >= startIndex; index--) batch.push(history[index]);
    return batch;
  }

  async function renderThoughtsHistory() {
    const listEl = getThoughtsElement('thoughts-history-list');
    const chat = state.chats[state.activeChatId];
    if (!listEl) return;
    const requestId = ++thoughtsHistoryRequestId;
    listEl.replaceChildren();

    if (!chat || !chat.thoughtsHistory || chat.thoughtsHistory.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: #8a8a8a; padding: 30px 0;">这里还没有历史记录哦。</p>';
      thoughtsHistoryRenderCount = 0;
      return;
    }

    const initialItems = getThoughtsHistoryBatch(chat.thoughtsHistory, 0, THOUGHTS_RENDER_WINDOW);
    const cardPromises = initialItems.map(thought => createThoughtCard(thought, chat.id));
    const cards = await Promise.all(cardPromises);
    if (requestId !== thoughtsHistoryRequestId || listEl !== getThoughtsElement('thoughts-history-list')) return;
    const fragment = document.createDocumentFragment();
    cards.forEach(card => fragment.appendChild(card));
    listEl.appendChild(fragment);
    thoughtsHistoryRenderCount = initialItems.length;

    if (chat.thoughtsHistory.length > thoughtsHistoryRenderCount) {
      appendLoadMoreThoughtsButton(listEl);
    }
  }

  // ========== 补充缺失的 appendLoadMoreThoughtsButton ==========
  function appendLoadMoreThoughtsButton(container) {
    const button = document.createElement('button');
    button.id = 'load-more-thoughts-btn';
    button.className = 'load-more-btn';
    button.textContent = '加载更多...';
    button.style.cssText = 'display:block;margin:15px auto;padding:10px 30px;border:none;border-radius:20px;background:var(--bg-secondary, #f0f0f0);color:var(--text-secondary, #666);font-size:14px;cursor:pointer;';
    container.appendChild(button);
  }

  async function loadMoreThoughts() {
    if (isLoadingMoreThoughts) return;
    isLoadingMoreThoughts = true;

    const listEl = getThoughtsElement('thoughts-history-list');
    const chat = state.chats[state.activeChatId];
    if (!listEl || !chat?.thoughtsHistory) {
      isLoadingMoreThoughts = false;
      return;
    }

    const requestId = thoughtsHistoryRequestId;
    const expectedOffset = thoughtsHistoryRenderCount;
    showLoader(listEl, 'bottom');
    try {
      // 先让加载反馈完成一次绘制，再进行下一批内容创建。
      await new Promise(resolve => requestAnimationFrame(resolve));
      const itemsToAppend = getThoughtsHistoryBatch(
        chat.thoughtsHistory,
        expectedOffset,
        THOUGHTS_RENDER_WINDOW
      );
      const cardPromises = itemsToAppend.map(thought => createThoughtCard(thought, chat.id));
      const cards = await Promise.all(cardPromises);
      if (requestId !== thoughtsHistoryRequestId || listEl !== getThoughtsElement('thoughts-history-list')) return;

      hideLoader(listEl);
      listEl.querySelector('#load-more-thoughts-btn')?.remove();
      const fragment = document.createDocumentFragment();
      cards.forEach(card => fragment.appendChild(card));
      listEl.appendChild(fragment);
      thoughtsHistoryRenderCount += itemsToAppend.length;
      if (thoughtsHistoryRenderCount < chat.thoughtsHistory.length) appendLoadMoreThoughtsButton(listEl);
    } finally {
      hideLoader(listEl);
      isLoadingMoreThoughts = false;
    }
  }



  async function createThoughtCard(thought, chatId = state.activeChatId) {
    const card = document.createElement('div');
    card.className = 'thought-card';
    const date = new Date(thought.timestamp);
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;


    const [renderedVoice, renderedJottings] = await Promise.all([
      applyRenderingRules(thought.heartfeltVoice || '...', chatId, { messageId: thought.id ?? thought.timestamp, timestamp: thought.timestamp, role: 'assistant', type: 'thoughts', field: 'heartfeltVoice' }),
      applyRenderingRules(thought.randomJottings || '...', chatId, { messageId: thought.id ?? thought.timestamp, timestamp: thought.timestamp, role: 'assistant', type: 'thoughts', field: 'randomJottings' })
    ]);


    let customThoughtsHtml = '';
    if (thought.customThoughts && Object.keys(thought.customThoughts).length > 0) {
      const renderedCustomEntries = await Promise.all(Object.entries(thought.customThoughts).map(async ([key, value]) => [
        key,
        await applyRenderingRules(value || '...', chatId, { messageId: thought.id ?? thought.timestamp, timestamp: thought.timestamp, role: 'assistant', type: 'thoughts', field: 'custom', fieldKey: key })
      ]));
      for (const [key, renderedCustom] of renderedCustomEntries) {
        customThoughtsHtml += `
            <div class="custom-thought-item" style="margin-top: 10px;">
                <div class="label" style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    ${key}
                </div>
                <div class="text" style="font-size: 14px; line-height: 1.5; color: var(--text-color);">${renderedCustom}</div>
            </div>
        `;
      }
    }

    card.dataset.timestamp = thought.timestamp; // 添加 timestamp 到 card 数据属性，方便多选获取
    
    card.innerHTML = `
        <input type="checkbox" class="thought-checkbox" style="position: absolute; right: 15px; top: 15px; z-index: 2; transform: scale(1.3); cursor: pointer; margin: 0; pointer-events: none;">
        <button class="thought-delete-btn" data-timestamp="${thought.timestamp}" title="删除此条记录">×</button>
        <div class="thought-header">${dateString}</div>
        <div class="thought-content">
            <div class="voice">
                <div class="label">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    心声
                </div>
                <div class="text">${renderedVoice}</div>
            </div>
            <div class="jottings">
                <div class="label">
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path></svg>
                    散记
                </div>
                <div class="text">${renderedJottings}</div>
            </div>
            ${customThoughtsHtml}
        </div>
    `;
    
    return card;
  }


