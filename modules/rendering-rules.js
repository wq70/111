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
  let ruleCache = {};

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

    const allRules = await db.renderingRules.toArray();

    if (allRules.length === 0) {
      contentContainer.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 50px;">还没有任何渲染规则。点击右上角"+"创建第一个吧！</p>';
      return;
    }

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
    const manageBtn = document.getElementById('manage-rules-btn');

    const manageIconSVG = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            <polyline points="9 11 12 14 22 4"></polyline>
        </svg>`;

    const doneIconSVG = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-color);">
             <polyline points="20 6 9 17 4 12"></polyline>
        </svg>`;


    if (isRuleManagementMode) {
      container.classList.add('management-mode');
      actionBar.style.display = 'flex';
      manageBtn.innerHTML = doneIconSVG;
    } else {
      container.classList.remove('management-mode');
      actionBar.style.display = 'none';
      manageBtn.innerHTML = manageIconSVG;
      manageBtn.style.color = '';

      selectedRules.clear();
      updateRuleActionBar();
      renderRulesList();
    }

    renderRulesList();
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

        ruleCache = {};
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
      await db.renderingRules.bulkDelete([...selectedRules]);
      ruleCache = {};
      selectedRules.clear();

      toggleRuleManagementMode();
    }
  }

  async function openRuleEditor(ruleId = null) {
    editingRuleId = ruleId;
    const modal = document.getElementById('rule-editor-modal');
    const title = document.getElementById('rule-editor-title');
    const nameInput = document.getElementById('rule-name-input');

    let scopeContainer = document.getElementById('rule-scope-checkboxes');
    if (!scopeContainer) {
      const oldSelect = document.getElementById('rule-chat-id-select');
      if (oldSelect) {
        scopeContainer = document.createElement('div');
        scopeContainer.id = 'rule-scope-checkboxes';
        scopeContainer.style.cssText = "max-height: 150px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 4px; background: #f9f9f9;";
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

    modal.classList.add('visible');
  }


  async function saveRenderingRule() {
    const name = document.getElementById('rule-name-input').value.trim();
    const regex = document.getElementById('rule-regex-input').value.trim();

    if (!name || !regex) {
      alert("规则名称和正则表达式不能为空！");
      return;
    }
    try {
      new RegExp(regex);
    } catch (e) {
      alert(`正则表达式格式错误: ${e.message}`);
      return;
    }

    const checkboxes = document.querySelectorAll('.rule-scope-cb:checked');
    const selectedScope = Array.from(checkboxes).map(cb => cb.value);

    if (selectedScope.length === 0) {
      alert("请至少选择一个绑定范围（公用或指定角色）！");
      return;
    }

    const ruleData = {
      name: name,
      chatId: selectedScope,
      regex: regex,
      template: document.getElementById('rule-template-input').value,
      isEnabled: document.getElementById('rule-enabled-switch').checked,
      doNotSend: document.getElementById('rule-do-not-send-switch').checked
    };

    if (editingRuleId) {
      await db.renderingRules.update(editingRuleId, ruleData);
    } else {
      await db.renderingRules.add(ruleData);
    }

    ruleCache = {};

    document.getElementById('rule-editor-modal').classList.remove('visible');
    await renderRulesList();
  }


  async function deleteRenderingRule(ruleId) {
    const confirmed = await showCustomConfirm('删除规则', '确定要删除这条渲染规则吗？', {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.renderingRules.delete(ruleId);
      await renderRulesList();
    }
  }

  async function filterHistoryWithDoNotSendRules(history, chatId) {
    // 0. 先过滤掉用户手动排除的消息 (isExcluded)
    history = history.filter(msg => !msg.isExcluded);

    // 1. 获取所有规则
    const allRules = await db.renderingRules.toArray();

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

  async function applyRenderingRules(rawContent, chatId) {
    if (!rawContent || typeof rawContent !== 'string') {
      return rawContent;
    }

    if (!ruleCache['active_rules_list']) {
      const allRules = await db.renderingRules.toArray();
      ruleCache['active_rules_list'] = allRules.filter(r => r.isEnabled);
    }

    const allActiveRules = ruleCache['active_rules_list'];

    const applicableRules = allActiveRules.filter(rule => {
      const scope = Array.isArray(rule.chatId) ? rule.chatId : [rule.chatId];

      return scope.includes('global') || scope.includes(chatId);
    });

    let processedContent = rawContent;

    for (const rule of applicableRules) {
      try {
        let regex;
        const regexString = rule.regex || rule.findRegex;
        const replacementString = rule.template ?? rule.replaceString;

        if (!regexString) continue;

        if (regexString.startsWith('/') && regexString.lastIndexOf('/') > 0) {
          const lastSlash = regexString.lastIndexOf('/');
          const pattern = regexString.substring(1, lastSlash);
          const flags = regexString.substring(lastSlash + 1);
          try {
            regex = new RegExp(pattern, flags);
          } catch (e) {
            regex = new RegExp(regexString, 'g');
          }
        } else {
          regex = new RegExp(regexString, 'g');
        }

        processedContent = processedContent.replace(regex, replacementString);

      } catch (e) {
        console.error(`渲染规则 [${rule.name}] 执行出错:`, e);
      }
    }

    return processedContent;
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
  window.switchRuleCategory = switchRuleCategory;
  window.ruleCache = ruleCache;

})();
