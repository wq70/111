// ============================================================
// rendering-rules.js
// 来源：script.js 第 35225~35878 行 + 3402~3416 行（DOMContentLoaded 内部）
// 功能：渲染规则系统 —— openRenderingRulesScreen、renderRulesList、
//       createRuleItemElement、toggleRuleManagementMode、
//       exportSelectedRules、handleRulesImport、deleteSelectedRules、
//       openRuleEditor、saveRenderingRule、deleteRenderingRule、
//       filterHistoryWithDoNotSendRules、applyRenderingRules、
//       switchRuleCategory
// ============================================================

(function () {
  // state 通过全局作用域访问（window.state，由 init-and-state.js 初始化）

  let isRuleManagementMode = false;
  let selectedRules = new Set();
  let editingRuleId = null;
  let editingRuleRecord = null;
  let ruleCache = {};
  const renderingResultCache = new Map();
  const MAX_RENDERING_RESULT_CACHE = 300;

  function resetRenderingRuleCache() {
    ruleCache = {};
    renderingResultCache.clear();
    window.RenderingRuleRuntime?.clear();
    window.ruleCache = ruleCache;
  }

  function rememberRenderingResult(key, value) {
    if (renderingResultCache.has(key)) renderingResultCache.delete(key);
    renderingResultCache.set(key, value);
    if (renderingResultCache.size > MAX_RENDERING_RESULT_CACHE) {
      renderingResultCache.delete(renderingResultCache.keys().next().value);
    }
  }

  // ========== 来源：script.js 第 3402~3416 行 ==========

  function switchRuleCategory(categoryId) {

    document.querySelectorAll('.rules-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.categoryId === categoryId);
    });

    document.querySelectorAll('.rules-category-pane').forEach(pane => {
      pane.classList.toggle('active', pane.dataset.categoryId === categoryId);
    });
  }

  // ========== 来源：script.js 第 35225~35878 行 ==========

  async function openRenderingRulesScreen() {
    await renderRulesList();
    showScreen('rendering-rules-screen');
  }




  async function renderRulesList() {
    const tabsContainer = document.getElementById('rules-tabs');
    const contentContainer = document.getElementById('rules-content-container');
    tabsContainer.innerHTML = '';
    contentContainer.innerHTML = '';

    const allRules = (await db.renderingRules.toArray()).map((rule, index) => ({ rule, index })).sort((a, b) => (a.rule.executionOrder ?? a.rule.options?.order ?? a.index) - (b.rule.executionOrder ?? b.rule.options?.order ?? b.index)).map(item => item.rule);
    window.RenderingRuleWorkbench?.updateList(allRules);

    if (allRules.length === 0) {
      tabsContainer.style.display = 'none';
      contentContainer.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 50px;">还没有任何渲染规则。点击右上角"+"创建第一个吧！</p>';
      return;
    }

    tabsContainer.style.display = 'flex';

    // 1. 创建"公用规则" Tab
    const globalTab = document.createElement('button');
    globalTab.className = 'rules-tab active';
    globalTab.textContent = '公用规则';
    globalTab.dataset.categoryId = 'global';
    tabsContainer.appendChild(globalTab);

    const globalPane = document.createElement('div');
    globalPane.className = 'rules-category-pane active';
    globalPane.dataset.categoryId = 'global';
    contentContainer.appendChild(globalPane);

    // 2. 为每个角色创建 Tab
    const characterChats = Object.values(state.chats).filter(chat => !chat.isGroup);

    characterChats.forEach(chat => {
      const charTab = document.createElement('button');
      charTab.className = 'rules-tab';
      charTab.textContent = chat.name;
      charTab.dataset.categoryId = chat.id;
      tabsContainer.appendChild(charTab);

      const charPane = document.createElement('div');
      charPane.className = 'rules-category-pane';
      charPane.dataset.categoryId = chat.id;
      contentContainer.appendChild(charPane);
    });

    // 3. 分发规则卡片到各个 Pane
    allRules.forEach(rule => {
      const card = createRuleItemElement(rule);

      // 兼容处理：标准化 scope 为数组
      const scope = Array.isArray(rule.chatId) ? rule.chatId : [rule.chatId];

      scope.forEach(targetId => {
        const targetPane = contentContainer.querySelector(`.rules-category-pane[data-category-id="${targetId}"]`);

        if (targetPane) {
          const cardCopy = createRuleItemElement(rule);
          targetPane.appendChild(cardCopy);
        }
      });
    });

    // 4. 绑定 Tab 切换事件
    document.querySelectorAll('.rules-tab').forEach(tab => {
      tab.addEventListener('click', () => switchRuleCategory(tab.dataset.categoryId));
    });
  }


  function createRuleItemElement(rule) {
    const card = document.createElement('div');
    const isSelected = selectedRules.has(rule.id);

    card.className = `rule-card ${rule.isEnabled ? 'enabled' : ''} ${isSelected ? 'selected' : ''}`;
    card.dataset.ruleId = rule.id;

    card.innerHTML = `
        <input type="checkbox" class="rule-select-checkbox" ${isSelected ? 'checked' : ''}>
        <div class="card-title">${rule.name}</div>
        <div class="card-content-preview">${escapeHTML(rule.regex)}</div>
    `;
    window.RenderingRuleWorkbench?.decorateCard(card, rule);

    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('rule-select-checkbox')) {
        e.stopPropagation();
        toggleRuleSelection(rule.id);
        return;
      }

      if (isRuleManagementMode) {
        toggleRuleSelection(rule.id);
      } else {
        openRuleEditor(rule.id);
      }
    });

    addLongPressListener(card, () => {
      if (!isRuleManagementMode) {
        toggleRuleManagementMode();
        toggleRuleSelection(rule.id);
      }
    });

    return card;
  }

  // 切换管理模式
  function toggleRuleManagementMode() {
    isRuleManagementMode = !isRuleManagementMode;
    const container = document.getElementById('rules-content-container');
    const actionBar = document.getElementById('rules-action-bar');
    const moreWrapper = document.querySelector('.rules-more-wrapper');
    const exitBtn = document.getElementById('rules-exit-manage-btn');
    const manageText = document.getElementById('manage-rules-btn-text');

    closeRulesMoreMenu();

    if (isRuleManagementMode) {
      container?.classList.add('management-mode');
      if (actionBar) actionBar.style.display = 'flex';
      if (moreWrapper) moreWrapper.style.display = 'none';
      if (exitBtn) exitBtn.style.display = 'inline-flex';
      if (manageText) manageText.textContent = '完成管理';
    } else {
      container?.classList.remove('management-mode');
      if (actionBar) actionBar.style.display = 'none';
      if (moreWrapper) moreWrapper.style.display = 'inline-flex';
      if (exitBtn) exitBtn.style.display = 'none';
      if (manageText) manageText.textContent = '批量管理';

      selectedRules.clear();
      updateRuleActionBar();
    }

    renderRulesList();
  }

  function closeRulesMoreMenu() {
    const menu = document.getElementById('rules-more-menu');
    const moreBtn = document.getElementById('rules-more-btn');
    if (menu) menu.style.display = 'none';
    if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false');
  }

  function toggleRulesMoreMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('rules-more-menu');
    const moreBtn = document.getElementById('rules-more-btn');
    if (!menu) return;
    const isOpen = menu.style.display === 'flex';
    if (isOpen) {
      closeRulesMoreMenu();
    } else {
      menu.style.display = 'flex';
      if (moreBtn) moreBtn.setAttribute('aria-expanded', 'true');
    }
  }

  // 初始化更多菜单与按钮交互
  function initRulesHeaderEvents() {
    const moreBtn = document.getElementById('rules-more-btn');
    const exitBtn = document.getElementById('rules-exit-manage-btn');
    const manageBtn = document.getElementById('manage-rules-btn');
    const menu = document.getElementById('rules-more-menu');

    if (moreBtn && !moreBtn.dataset.bound) {
      moreBtn.dataset.bound = 'true';
      moreBtn.addEventListener('click', toggleRulesMoreMenu);
    }

    if (exitBtn && !exitBtn.dataset.bound) {
      exitBtn.dataset.bound = 'true';
      exitBtn.addEventListener('click', () => {
        if (isRuleManagementMode) toggleRuleManagementMode();
      });
    }

    if (manageBtn && !manageBtn.dataset.bound) {
      manageBtn.dataset.bound = 'true';
      manageBtn.addEventListener('click', () => {
        closeRulesMoreMenu();
        toggleRuleManagementMode();
      });
    }

    document.addEventListener('click', (e) => {
      const moreWrapper = document.querySelector('.rules-more-wrapper');
      if (moreWrapper && !moreWrapper.contains(e.target)) {
        closeRulesMoreMenu();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRulesHeaderEvents);
  } else {
    initRulesHeaderEvents();
  }

  function toggleRuleSelection(ruleId) {
    if (selectedRules.has(ruleId)) {
      selectedRules.delete(ruleId);
    } else {
      selectedRules.add(ruleId);
    }
    updateRuleActionBar();

    const cards = document.querySelectorAll(`.rule-card[data-rule-id="${ruleId}"]`);
    cards.forEach(card => {
      const cb = card.querySelector('.rule-select-checkbox');
      if (selectedRules.has(ruleId)) {
        card.classList.add('selected');
        if (cb) cb.checked = true;
      } else {
        card.classList.remove('selected');
        if (cb) cb.checked = false;
      }
    });
  }

  function updateRuleActionBar() {
    const count = selectedRules.size;
    const exportBtn = document.getElementById('export-selected-rules-btn');
    const deleteBtn = document.getElementById('delete-selected-rules-btn');

    exportBtn.textContent = `导出 (${count})`;
    deleteBtn.textContent = `删除 (${count})`;
  }

  function handleSelectAllRules() {
    const isChecked = document.getElementById('select-all-rules-checkbox').checked;
    const visibleCards = document.querySelectorAll('#rules-content-container .rule-card');

    visibleCards.forEach(card => {
      const id = parseInt(card.dataset.ruleId);
      if (isChecked) {
        selectedRules.add(id);
      } else {
        selectedRules.delete(id);
      }
    });

    updateRuleActionBar();
    renderRulesList();
  }

  async function exportSelectedRules() {
    if (selectedRules.size === 0) {
      alert("请先选择要导出的规则。");
      return;
    }

    const rules = await db.renderingRules.where('id').anyOf([...selectedRules]).toArray();

    const exportData = {
      type: 'EPhoneRenderingRules',
      version: 1,
      timestamp: Date.now(),
      rules: rules.map(r => ({
        ...r,
        id: undefined,
        name: r.name,
        regex: r.regex,
        template: r.template,
        chatId: ['global'],
        isEnabled: true,
        doNotSend: r.doNotSend
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `RenderingRules_Share_${dateStr}.json`;
    link.click();
    URL.revokeObjectURL(url);

    toggleRuleManagementMode();
    await showCustomAlert("导出成功", `已导出 ${rules.length} 条规则。\n\n注意：为了方便分享，导出的规则已自动设为"公用"范围。`);
  }

  async function handleRulesImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (window.RenderingRuleWorkbench) {
        await window.RenderingRuleWorkbench.importRules(data);
        return;
      }
      if (data.type !== 'EPhoneRenderingRules' || !Array.isArray(data.rules)) {
        throw new Error("文件格式不正确，不是有效的渲染规则分享文件。");
      }

      const confirmed = await showCustomConfirm(
        "导入规则",
        `发现 ${data.rules.length} 条渲染规则。\n\n确定要导入吗？`,
        { confirmText: "导入" }
      );

      if (confirmed) {
        let addedCount = 0;
        for (const rule of data.rules) {
          await db.renderingRules.add({
            name: rule.name + " (导入)",
            chatId: rule.chatId || ['global'],
            regex: rule.regex,
            template: rule.template,
            isEnabled: true,
            doNotSend: rule.doNotSend || false
          });
          addedCount++;
        }

        resetRenderingRuleCache();
        await renderRulesList();
        await showCustomAlert("成功", `已成功导入 ${addedCount} 条规则！`);
      }

    } catch (error) {
      console.error(error);
      alert("导入失败: " + error.message);
    } finally {
      event.target.value = null;
    }
  }

  async function deleteSelectedRules() {
    if (selectedRules.size === 0) return;

    const confirmed = await showCustomConfirm(
      "确认删除",
      `确定要删除选中的 ${selectedRules.size} 条规则吗？`,
      { confirmButtonClass: 'btn-danger' }
    );

    if (confirmed) {
      await window.RenderingRuleWorkbench?.beforeMutation();
      await db.renderingRules.bulkDelete([...selectedRules]);
      await window.RenderingRuleWorkbench?.afterMutation();
      resetRenderingRuleCache();
      selectedRules.clear();

      toggleRuleManagementMode();
    }
  }

  async function openRuleEditor(ruleId = null) {
    editingRuleId = ruleId;
    editingRuleRecord = null;
    const modal = document.getElementById('rule-editor-modal');
    const title = document.getElementById('rule-editor-title');
    const nameInput = document.getElementById('rule-name-input');

    let scopeContainer = document.getElementById('rule-scope-checkboxes');
    if (!scopeContainer) {
      const oldSelect = document.getElementById('rule-chat-id-select');
      if (oldSelect) {
        scopeContainer = document.createElement('div');
        scopeContainer.id = 'rule-scope-checkboxes';
        scopeContainer.style.cssText = "max-height: 160px; overflow-y: auto; border: 1px solid rgba(0, 0, 0, 0.08); padding: 8px; border-radius: 12px; background: #ffffff;";
        oldSelect.parentNode.insertBefore(scopeContainer, oldSelect);
        oldSelect.style.display = 'none';
      }
    }

    const regexInput = document.getElementById('rule-regex-input');
    const templateInput = document.getElementById('rule-template-input');
    const enabledSwitch = document.getElementById('rule-enabled-switch');
    const doNotSendSwitch = document.getElementById('rule-do-not-send-switch');

    let currentScope = ['global'];
    let currentName = '';
    let currentRegex = '';
    let currentTemplate = '';
    let currentEnabled = true;
    let currentDoNotSend = false;

    if (ruleId) {
      title.textContent = '编辑规则';
      const rule = await db.renderingRules.get(ruleId);
      if (rule) {
        editingRuleRecord = rule;
        currentName = rule.name;
        currentRegex = rule.regex;
        currentTemplate = rule.template;
        currentEnabled = rule.isEnabled;
        currentDoNotSend = rule.doNotSend || false;

        if (Array.isArray(rule.chatId)) {
          currentScope = rule.chatId;
        } else {
          currentScope = [rule.chatId];
        }
      }
    } else {
      title.textContent = '创建新规则';
    }

    nameInput.value = currentName;
    regexInput.value = currentRegex;
    templateInput.value = currentTemplate;
    enabledSwitch.checked = currentEnabled;
    doNotSendSwitch.checked = currentDoNotSend;

    if (scopeContainer) {
      scopeContainer.innerHTML = '';

      const createScopeItem = (value, name, desc, avatarUrl = null, isChecked = false) => {
        const item = document.createElement('div');
        item.className = 'rule-scope-item';

        let visualHtml = '';
        if (value === 'global') {
          visualHtml = `<div class="rule-scope-icon-box">🌐</div>`;
        } else {
          const src = avatarUrl || 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg';
          visualHtml = `<img src="${src}" class="rule-scope-avatar">`;
        }

        const checkboxHtml = `<input type="checkbox" value="${value}" class="rule-scope-cb" ${isChecked ? 'checked' : ''}>`;

        item.innerHTML = `
                ${checkboxHtml}
                ${visualHtml}
                <div class="rule-scope-info">
                    <span class="rule-scope-name">${name}</span>
                    ${desc ? `<span class="rule-scope-desc">${desc}</span>` : ''}
                </div>
            `;

        item.addEventListener('click', (e) => {
          if (e.target.type !== 'checkbox') {
            const cb = item.querySelector('input[type="checkbox"]');
            cb.checked = !cb.checked;
          }
        });

        return item;
      };

      scopeContainer.appendChild(createScopeItem(
        'global',
        '公用规则',
        '对所有角色生效',
        null,
        currentScope.includes('global')
      ));

      const chars = Object.values(state.chats).filter(c => !c.isGroup);
      chars.forEach(chat => {
        scopeContainer.appendChild(createScopeItem(
          chat.id,
          chat.name,
          chat.settings.aiPersona ? chat.settings.aiPersona.substring(0, 15) + '...' : '',
          chat.settings.aiAvatar,
          currentScope.includes(chat.id)
        ));
      });
    }

    window.RenderingRuleWorkbench?.openEditor(editingRuleRecord);
    modal.classList.add('visible');
  }


  async function saveRenderingRule() {
    const name = document.getElementById('rule-name-input').value.trim();
    const regex = document.getElementById('rule-regex-input').value.trim();

    let options;
    try { options = window.RenderingRuleWorkbench?.readOptions(); }
    catch (error) { await showCustomAlert('配置格式错误', error.message); return; }
    const action = options?.action || 'replace';
    if (!name || (!regex && !['map', 'format'].includes(action) && options?.matchMode !== 'markers')) {
      await showCustomAlert('无法保存', '请填写规则名称和查找内容。');
      return;
    }
    try {
      if (window.RenderingRuleEngine) window.RenderingRuleEngine.compileRule({ regex, template: document.getElementById('rule-template-input').value, options });
      else new RegExp(regex);
    } catch (e) {
      await showCustomAlert('规则格式错误', e.message);
      return;
    }

    const checkboxes = document.querySelectorAll('.rule-scope-cb:checked');
    const selectedScope = Array.from(checkboxes).map(cb => cb.value);

    if (selectedScope.length === 0) {
      await showCustomAlert('无法保存', '请至少选择一个绑定范围。');
      return;
    }

    const ruleData = {
      ...editingRuleRecord,
      name: name,
      chatId: selectedScope,
      regex: regex,
      template: document.getElementById('rule-template-input').value,
      isEnabled: document.getElementById('rule-enabled-switch').checked,
      doNotSend: document.getElementById('rule-do-not-send-switch').checked,
      ...(options ? { options, executionOrder: options.order } : {}),
      ...(window.RenderingRuleWorkbench?.readMetadata() || {})
    };

    await window.RenderingRuleWorkbench?.beforeMutation();
    if (editingRuleId) {
      await db.renderingRules.update(editingRuleId, ruleData);
    } else {
      await db.renderingRules.add(ruleData);
    }
    await window.RenderingRuleWorkbench?.afterMutation();

    resetRenderingRuleCache();

    document.getElementById('rule-editor-modal').classList.remove('visible');
    await renderRulesList();
  }


  async function deleteRenderingRule(ruleId) {
    const confirmed = await showCustomConfirm('删除规则', '确定要删除这条渲染规则吗？', {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await window.RenderingRuleWorkbench?.beforeMutation();
      await db.renderingRules.delete(ruleId);
      await window.RenderingRuleWorkbench?.afterMutation();
      resetRenderingRuleCache();
      await renderRulesList();
    }
  }

  async function filterHistoryWithDoNotSendRules(history, chatId) {
    // 0. 先过滤掉用户手动排除的消息 (isExcluded)
    history = history.filter(msg => !msg.isExcluded);

    // 1. 获取所有规则
    const allRules = await db.renderingRules.toArray();
    if (window.RenderingRuleRuntime) {
      const output = [];
      for (const msg of history) {
        if (typeof msg.content !== 'string' || !msg.content) { output.push(msg); continue; }
        const result = await window.RenderingRuleRuntime.run(msg.content, allRules, chatId, {
          role: msg.role, type: msg.type, timestamp: msg.timestamp, messageId: msg.id ?? msg.timestamp,
          isGroup: !!state.chats[chatId]?.isGroup, field: 'content'
        }, 'context');
        if (!result.excluded) output.push({ ...msg, content: result.content });
      }
      return output;
    }

    // 2. 筛选出：(启用了DoNotSend) AND (范围包含Global或当前ChatId)
    const doNotSendRules = allRules.filter(rule => {
      if (!rule.doNotSend) return false;

      const scope = Array.isArray(rule.chatId) ? rule.chatId : [rule.chatId];

      return scope.includes('global') || scope.includes(chatId);
    });

    if (doNotSendRules.length === 0) {
      return history;
    }

    const modifiedHistory = history.map(msg => {
      if (typeof msg.content !== 'string' || !msg.content) {
        return msg;
      }

      const modifiedMsg = { ...msg };
      let newContent = msg.content;

      for (const rule of doNotSendRules) {
        try {
          let regex;
          const regexString = rule.regex || rule.findRegex;

          if (!regexString) continue;

          if (regexString.startsWith('/') && regexString.lastIndexOf('/') > 0) {
            const lastSlash = regexString.lastIndexOf('/');
            const pattern = regexString.substring(1, lastSlash);
            const flags = regexString.substring(lastSlash + 1);
            regex = new RegExp(pattern, flags);
          } else {
            regex = new RegExp(regexString, 'g');
          }

          if (regex.test(newContent)) {
            newContent = newContent.replace(regex, '');
            console.log(`[内容替换] 规则 "${rule.name}" 命中 (DoNotSend)。正在过滤...`);
          }

        } catch (e) {
          console.error(`[过滤规则错误] 规则 "${rule.name}" 无效:`, e);
        }
      }

      modifiedMsg.content = newContent;
      return modifiedMsg;
    });

    return modifiedHistory;
  }

  async function applyRenderingRulesDetailed(rawContent, chatId, metadata = {}) {
    if (!rawContent || typeof rawContent !== 'string') {
      return { content: rawContent, isHtml: false };
    }

    if (!ruleCache.activeRules) {
      const cacheToPopulate = ruleCache;
      if (!cacheToPopulate.activeRulesPromise) {
        cacheToPopulate.activeRulesPromise = db.renderingRules.toArray().then(allRules => {
          cacheToPopulate.activeRules = allRules.filter(r => r.isEnabled).map(rule => {
            if (window.RenderingRuleRuntime) return rule;
            const regexString = rule.regex || rule.findRegex;
            let compiledRegex = null;
            if (regexString) {
              try {
                if (regexString.startsWith('/') && regexString.lastIndexOf('/') > 0) {
                  const lastSlash = regexString.lastIndexOf('/');
                  try {
                    compiledRegex = new RegExp(
                      regexString.substring(1, lastSlash),
                      regexString.substring(lastSlash + 1)
                    );
                  } catch (_) {
                    compiledRegex = new RegExp(regexString, 'g');
                  }
                } else {
                  compiledRegex = new RegExp(regexString, 'g');
                }
              } catch (error) {
                console.error(`渲染规则 [${rule.name}] 编译出错:`, error);
              }
            }
            return {
              ...rule,
              _compiledRegex: compiledRegex,
              _replacementString: rule.template ?? rule.replaceString,
              _isHtmlTemplate: /<\/?[a-z][^>]*>/i.test(rule.template ?? rule.replaceString ?? '')
            };
          });
          cacheToPopulate.applicableRulesByChat = new Map();
        });
      }
      await cacheToPopulate.activeRulesPromise;
      if (ruleCache !== cacheToPopulate) return applyRenderingRulesDetailed(rawContent, chatId, metadata);
    }

    if (window.RenderingRuleRuntime) {
      return window.RenderingRuleRuntime.run(rawContent, ruleCache.activeRules, chatId, metadata);
    }
    if (window.RenderingRuleEngine) {
      const chat = typeof state !== 'undefined' ? state.chats?.[chatId] : null;
      const appearanceVariables = window.getAppearanceVariables?.(chat || null);
      return window.RenderingRuleEngine.run(rawContent, ruleCache.activeRules, chatId, { ...metadata, appearanceVariables });
    }

    const canCacheResult = rawContent.length <= 50000;
    const cacheKey = canCacheResult ? `${String(chatId)}\u0000${rawContent}` : null;
    if (cacheKey && renderingResultCache.has(cacheKey)) {
      const cachedResult = renderingResultCache.get(cacheKey);
      rememberRenderingResult(cacheKey, cachedResult);
      return cachedResult;
    }

    let applicableRules = ruleCache.applicableRulesByChat.get(chatId);
    if (!applicableRules) {
      applicableRules = ruleCache.activeRules.filter(rule => {
        const scope = Array.isArray(rule.chatId) ? rule.chatId : [rule.chatId];
        return scope.includes('global') || scope.includes(chatId);
      });
      ruleCache.applicableRulesByChat.set(chatId, applicableRules);
    }

    let processedContent = rawContent;
    let isHtml = false;

    for (const rule of applicableRules) {
      try {
        const regex = rule._compiledRegex;
        if (!regex) continue;
        regex.lastIndex = 0;
        const replacedContent = processedContent.replace(regex, rule._replacementString);
        if (replacedContent !== processedContent && rule._isHtmlTemplate) isHtml = true;
        processedContent = replacedContent;

      } catch (e) {
        console.error(`渲染规则 [${rule.name}] 执行出错:`, e);
      }
    }

    const result = { content: processedContent, isHtml };
    if (cacheKey) rememberRenderingResult(cacheKey, result);
    return result;
  }

  async function applyRenderingRules(rawContent, chatId, metadata = {}) {
    const result = await applyRenderingRulesDetailed(rawContent, chatId, metadata);
    return result.content;
  }

  // ========== 全局暴露 ==========

  window.openRenderingRulesScreen = openRenderingRulesScreen;
  window.renderRulesList = renderRulesList;
  window.createRuleItemElement = createRuleItemElement;
  window.toggleRuleManagementMode = toggleRuleManagementMode;
  window.toggleRuleSelection = toggleRuleSelection;
  window.updateRuleActionBar = updateRuleActionBar;
  window.handleSelectAllRules = handleSelectAllRules;
  window.exportSelectedRules = exportSelectedRules;
  window.handleRulesImport = handleRulesImport;
  window.deleteSelectedRules = deleteSelectedRules;
  window.openRuleEditor = openRuleEditor;
  window.saveRenderingRule = saveRenderingRule;
  window.deleteRenderingRule = deleteRenderingRule;
  window.filterHistoryWithDoNotSendRules = filterHistoryWithDoNotSendRules;
  window.applyRenderingRules = applyRenderingRules;
  window.applyRenderingRulesDetailed = applyRenderingRulesDetailed;
  window.invalidateRenderingRuleCache = resetRenderingRuleCache;
  window.switchRuleCategory = switchRuleCategory;
  window.ruleCache = ruleCache;

})();
