// ========== API 预设管理 ==========

  // renderApiSettings 会在每次进入页面和切换预设时执行。用 WeakMap 保证
  // 同一控件的同类业务事件只绑定一次，避免连续使用后重复触发。
  const apiSettingsBoundEvents = new WeakMap();

  function bindApiSettingsListener(element, type, listener) {
    if (!element) return;
    let boundTypes = apiSettingsBoundEvents.get(element);
    if (!boundTypes) {
      boundTypes = new Set();
      apiSettingsBoundEvents.set(element, boundTypes);
    }
    if (boundTypes.has(type)) return;
    boundTypes.add(type);
    element.addEventListener(type, listener);
  }

  async function loadApiPresetsDropdown(forceSelectedId = null) {
    const selectEl = document.getElementById('api-preset-select');
    selectEl.innerHTML = '<option value="current">当前配置 (未保存)</option>';

    const presets = await db.apiPresets.toArray();
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      selectEl.appendChild(option);
    });

    if (forceSelectedId) { // <--- 2. 新增这段判断逻辑
      selectEl.value = forceSelectedId;
      return;
    }
    const currentConfig = state.apiConfig;
    let matchingPresetId = null;
    for (const preset of presets) {

      if (
        preset.proxyUrl === currentConfig.proxyUrl &&
        preset.apiKey === currentConfig.apiKey &&
        preset.model === currentConfig.model &&
        preset.secondaryProxyUrl === currentConfig.secondaryProxyUrl &&
        preset.secondaryApiKey === currentConfig.secondaryApiKey &&
        preset.secondaryModel === currentConfig.secondaryModel &&

        Object.entries(window.ttsProvider.apiFields(currentConfig)).every(([key, value]) => JSON.stringify(preset[key] ?? window.ttsProvider.defaults[key]) === JSON.stringify(value)) &&
        (preset.minimaxGroupId || '') === (currentConfig.minimaxGroupId || '') &&
        (preset.minimaxApiKey || '') === (currentConfig.minimaxApiKey || '') &&
        (preset.minimaxModel || 'speech-01') === (currentConfig.minimaxModel || 'speech-01')
      ) {
        matchingPresetId = preset.id;
        break;
      }
    }

    if (matchingPresetId) {
      selectEl.value = matchingPresetId;
    } else {
      selectEl.value = 'current';
    }
  }


  async function handlePresetSelectionChange() {
    const selectEl = document.getElementById('api-preset-select');
    const selectedId = parseInt(selectEl.value);

    if (isNaN(selectedId)) {
      return;
    }

    const preset = await db.apiPresets.get(selectedId);
    if (preset) {
      // 1. 加载预设 (这会覆盖当前的 config)
      const nextApiConfig = {
        id: 'main',
        embeddingConfig: state.apiConfig.embeddingConfig,
        videoUnderstanding: state.apiConfig.videoUnderstanding,
        ...window.ttsProvider.apiFields({ ...state.apiConfig, ...preset }),
        proxyUrl: preset.proxyUrl,
        apiKey: preset.apiKey,
        model: preset.model,
        secondaryProxyUrl: preset.secondaryProxyUrl,
        secondaryApiKey: preset.secondaryApiKey,
        secondaryModel: preset.secondaryModel,
        backgroundProxyUrl: preset.backgroundProxyUrl,
        backgroundApiKey: preset.backgroundApiKey,
        backgroundModel: preset.backgroundModel,
        visionProxyUrl: preset.visionProxyUrl,
        visionApiKey: preset.visionApiKey,
        visionModel: preset.visionModel,
        minimaxGroupId: preset.minimaxGroupId,
        minimaxApiKey: preset.minimaxApiKey,
        minimaxModel: preset.minimaxModel
      };

      if (window.vectorMemoryManager) {
        if (!await window.vectorMemoryManager.saveApiConfiguration(nextApiConfig)) {
          await loadApiPresetsDropdown();
          return;
        }
      } else Object.assign(state.apiConfig, nextApiConfig);


      const savedImgbbEnabled = localStorage.getItem('imgbb-enabled');
      const savedImgbbKey = localStorage.getItem('imgbb-api-key');
      const savedCatboxEnabled = localStorage.getItem('catbox-enabled');
      const savedCatboxHash = localStorage.getItem('catbox-userhash');

      if (savedImgbbEnabled !== null) state.apiConfig.imgbbEnable = (savedImgbbEnabled === 'true');
      if (savedImgbbKey !== null) state.apiConfig.imgbbApiKey = savedImgbbKey;

      if (savedCatboxEnabled !== null) state.apiConfig.catboxEnable = (savedCatboxEnabled === 'true');
      if (savedCatboxHash !== null) state.apiConfig.catboxUserHash = savedCatboxHash;

      // 识图Token优化
      const savedImageTokenOptimize = localStorage.getItem('image-token-optimize');
      if (savedImageTokenOptimize !== null) state.apiConfig.imageTokenOptimize = (savedImageTokenOptimize === 'true');

      const savedMinimaxGroupId = localStorage.getItem('minimax-group-id');
      const savedMinimaxApiKey = localStorage.getItem('minimax-api-key');
      const savedMinimaxModel = localStorage.getItem('minimax-model');

      if (savedMinimaxGroupId !== null) state.apiConfig.minimaxGroupId = savedMinimaxGroupId;
      if (savedMinimaxApiKey !== null) state.apiConfig.minimaxApiKey = savedMinimaxApiKey;
      if (savedMinimaxModel !== null) state.apiConfig.minimaxModel = savedMinimaxModel;
      const savedGhEnabled = localStorage.getItem('github-enabled');
      const savedGhAuto = localStorage.getItem('github-auto-backup');
      const savedGhInterval = localStorage.getItem('github-backup-interval');
      const savedGhProxyEnabled = localStorage.getItem('github-proxy-enabled');
      const savedGhProxyUrl = localStorage.getItem('github-proxy-url');

      // 关键：读取账号信息
      const savedGhUsername = localStorage.getItem('github-username');
      const savedGhRepo = localStorage.getItem('github-repo');
      const savedGhToken = localStorage.getItem('github-token');
      const savedGhFilename = localStorage.getItem('github-filename');

      if (savedGhEnabled !== null) state.apiConfig.githubEnable = (savedGhEnabled === 'true');
      if (savedGhAuto !== null) state.apiConfig.githubAutoBackup = (savedGhAuto === 'true');
      if (savedGhInterval !== null) state.apiConfig.githubBackupInterval = parseInt(savedGhInterval);
      if (savedGhProxyEnabled !== null) state.apiConfig.githubProxyEnable = (savedGhProxyEnabled === 'true');
      if (savedGhProxyUrl !== null) state.apiConfig.githubProxyUrl = savedGhProxyUrl;

      if (savedGhUsername !== null) state.apiConfig.githubUsername = savedGhUsername;
      if (savedGhRepo !== null) state.apiConfig.githubRepo = savedGhRepo;
      if (savedGhToken !== null) state.apiConfig.githubToken = savedGhToken;
      if (savedGhFilename !== null) state.apiConfig.githubFilename = savedGhFilename;
      await db.apiConfig.put(state.apiConfig);

      renderApiSettings(selectedId);

      // 确保手写输入框被正确填充
      document.getElementById('model-input').value = preset.model || '';
      document.getElementById('secondary-model-input').value = preset.secondaryModel || '';
      document.getElementById('background-model-input').value = preset.backgroundModel || '';
      document.getElementById('vision-model-input').value = preset.visionModel || '';
      document.getElementById('couplespace-model-input').value = preset.couplespaceModel || '';

      document.getElementById('fetch-models-btn').click();
      if (preset.secondaryProxyUrl && preset.secondaryApiKey) {
        document.getElementById('fetch-secondary-models-btn').click();
      }
      if (preset.backgroundProxyUrl && preset.backgroundApiKey) {
        document.getElementById('fetch-background-models-btn').click();
      }
      if (preset.visionProxyUrl && preset.visionApiKey) {
        document.getElementById('fetch-vision-models-btn').click();
      }
      if (preset.couplespaceProxyUrl && preset.couplespaceApiKey) {
        document.getElementById('fetch-couplespace-models-btn').click();
      }
      //alert(`已加载预设 "${preset.name}"`);
    }
  }


  async function saveApiPreset() {
    const name = await showCustomPrompt('保存 API 预设', '请输入预设名称');
    if (!name || !name.trim()) return;


    const presetData = {
      name: name.trim(),
      proxyUrl: document.getElementById('proxy-url').value.trim(),
      apiKey: document.getElementById('api-key').value.trim(),
      // 优先保存手写输入框的值
      model: document.getElementById('model-input').value.trim() || document.getElementById('model-select').value,
      secondaryProxyUrl: document.getElementById('secondary-proxy-url').value.trim(),
      secondaryApiKey: document.getElementById('secondary-api-key').value.trim(),
      // 优先保存手写输入框的值
      secondaryModel: document.getElementById('secondary-model-input').value.trim() || document.getElementById('secondary-model-select').value,
      backgroundProxyUrl: document.getElementById('background-proxy-url').value.trim(),
      backgroundApiKey: document.getElementById('background-api-key').value.trim(),
      backgroundModel: document.getElementById('background-model-input').value.trim() || document.getElementById('background-model-select').value,

      visionProxyUrl: document.getElementById('vision-proxy-url').value.trim(),
      visionApiKey: document.getElementById('vision-api-key').value.trim(),
      visionModel: document.getElementById('vision-model-input').value.trim() || document.getElementById('vision-model-select').value,
      
      couplespaceProxyUrl: document.getElementById('couplespace-proxy-url').value.trim(),
      couplespaceApiKey: document.getElementById('couplespace-api-key').value.trim(),
      couplespaceModel: document.getElementById('couplespace-model-input').value.trim() || document.getElementById('couplespace-model-select').value,

      ...window.ttsProvider.apiFields(state.apiConfig),
      ...window.ttsSettings.readApi(),
      minimaxGroupId: document.getElementById('minimax-group-id').value.trim(),
      minimaxApiKey: document.getElementById('minimax-api-key').value.trim(),
      minimaxModel: document.getElementById('minimax-model-select').value

    };


    const existingPreset = await db.apiPresets.where('name').equals(presetData.name).first();
    if (existingPreset) {
      const confirmed = await showCustomConfirm('覆盖预设', `名为 "${presetData.name}" 的预设已存在。要覆盖它吗？`, {
        confirmButtonClass: 'btn-danger'
      });
      if (!confirmed) return;
      presetData.id = existingPreset.id;
    }

    await db.apiPresets.put(presetData);
    await loadApiPresetsDropdown();
    alert('API 预设已保存！');
  }


  async function deleteApiPreset() {
    const selectEl = document.getElementById('api-preset-select');
    const selectedId = parseInt(selectEl.value);

    if (isNaN(selectedId)) {
      alert('请先从下拉框中选择一个要删除的预设。');
      return;
    }

    const preset = await db.apiPresets.get(selectedId);
    if (!preset) return;

    const confirmed = await showCustomConfirm('删除预设', `确定要删除预设 "${preset.name}" 吗？`, {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.apiPresets.delete(selectedId);
      await loadApiPresetsDropdown();
      alert('预设已删除。');
    }
  }

  function renderApiSettings(forcePresetId = null) {
    window.ttsSettings.loadApi();
    window.EmbeddingApiSettings?.render();
    window.PromptMacroSettings?.render();

    document.getElementById('proxy-url').value = state.apiConfig.proxyUrl || '';
    document.getElementById('api-key').value = state.apiConfig.apiKey || '';
    document.getElementById('secondary-proxy-url').value = state.apiConfig.secondaryProxyUrl || '';
    document.getElementById('secondary-api-key').value = state.apiConfig.secondaryApiKey || '';
    document.getElementById('background-proxy-url').value = state.apiConfig.backgroundProxyUrl || '';
    document.getElementById('background-api-key').value = state.apiConfig.backgroundApiKey || '';
    // 识图API回填
    document.getElementById('vision-proxy-url').value = state.apiConfig.visionProxyUrl || '';
    document.getElementById('vision-api-key').value = state.apiConfig.visionApiKey || '';
    document.getElementById('vision-model-input').value = state.apiConfig.visionModel || '';
    // 情侣空间API回填
    document.getElementById('couplespace-proxy-url').value = state.apiConfig.couplespaceProxyUrl || '';
    document.getElementById('couplespace-api-key').value = state.apiConfig.couplespaceApiKey || '';
    document.getElementById('couplespace-model-input').value = state.apiConfig.couplespaceModel || '';
    document.getElementById('background-activity-switch').checked = state.globalSettings.enableBackgroundActivity || false;
    document.getElementById('background-interval-input').value = state.globalSettings.backgroundActivityInterval || 60;
    document.getElementById('block-cooldown-input').value = state.globalSettings.blockCooldownHours || 1;
    
    // 新增：加载后台查看用户手机设置
    document.getElementById('global-enable-view-myphone-bg-switch').checked = state.globalSettings.enableViewMyPhoneInBackground || false;
    document.getElementById('global-view-myphone-chance-input').value = state.globalSettings.viewMyPhoneChance !== null && state.globalSettings.viewMyPhoneChance !== undefined ? state.globalSettings.viewMyPhoneChance : '';
    document.getElementById('enable-ai-drawing-switch').checked = state.globalSettings.enableAiDrawing;

    // Pollinations 设置面板展开 + 读取已保存的 Key 和模型
    const pollinationsDetails = document.getElementById('pollinations-details');
    if (pollinationsDetails) pollinationsDetails.style.display = state.globalSettings.enableAiDrawing ? '' : 'none';
    const savedPollinationsKey = localStorage.getItem('pollinations-api-key') || '';
    const savedPollinationsModel = localStorage.getItem('pollinations-model') || 'flux';
    document.getElementById('pollinations-api-key').value = savedPollinationsKey;
    document.getElementById('pollinations-model').value = savedPollinationsModel;

    // 新增：读取心声和动态功能开关
    document.getElementById('global-enable-thoughts-switch').checked = state.globalSettings.enableThoughts || false;
    document.getElementById('global-online-only-restriction-switch').checked = state.globalSettings.enableOnlineOnlyRestriction !== false;
    document.getElementById('global-enable-qzone-actions-switch').checked = state.globalSettings.enableQzoneActions || false;

    // 新增：读取自定义心声提示词设置
    const customThoughtsSwitch = document.getElementById('custom-thoughts-prompt-switch');
    const customThoughtsContainer = document.getElementById('custom-thoughts-prompt-container');
    const customThoughtsTextarea = document.getElementById('custom-thoughts-prompt-textarea');
    customThoughtsSwitch.checked = state.globalSettings.customThoughtsPromptEnabled || false;
    customThoughtsContainer.style.display = customThoughtsSwitch.checked ? 'block' : 'none';
    customThoughtsTextarea.value = state.globalSettings.customThoughtsPrompt || getDefaultThoughtsPrompt();
    bindApiSettingsListener(customThoughtsSwitch, 'change', function() {
      customThoughtsContainer.style.display = this.checked ? 'block' : 'none';
      if (this.checked && !customThoughtsTextarea.value.trim()) {
        customThoughtsTextarea.value = getDefaultThoughtsPrompt();
      }
    });
    bindApiSettingsListener(document.getElementById('reset-thoughts-prompt-btn'), 'click', function() {
      customThoughtsTextarea.value = getDefaultThoughtsPrompt();
      window.PromptEntryManager?.replaceWithDefault('thoughts');
    });

    // 心声提示词 - 导出
    bindApiSettingsListener(document.getElementById('export-thoughts-prompt-btn'), 'click', function() {
      const content = customThoughtsTextarea.value || '';
      const data = JSON.stringify({
        type: 'thoughts_prompt',
        content: content,
        entries: window.PromptEntryManager?.exportScope('thoughts') || undefined
      }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '心声提示词.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    // 心声提示词 - 导入
    bindApiSettingsListener(document.getElementById('import-thoughts-prompt-btn'), 'click', function() {
      document.getElementById('import-thoughts-prompt-file').click();
    });
    bindApiSettingsListener(document.getElementById('import-thoughts-prompt-file'), 'change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(ev) {
        try {
          const data = JSON.parse(ev.target.result);
          if (Array.isArray(data.entries) && window.PromptEntryManager) {
            window.PromptEntryManager.replaceWithItems('thoughts', data.entries);
            showToast('心声提示词导入成功');
          } else if (data.content) {
            customThoughtsTextarea.value = data.content;
            window.PromptEntryManager?.replaceWithLegacy('thoughts', data.content);
            showToast('心声提示词导入成功');
          } else {
            showToast('文件格式不正确');
          }
        } catch (err) {
          // 如果不是JSON，当作纯文本导入
          customThoughtsTextarea.value = ev.target.result;
          window.PromptEntryManager?.replaceWithLegacy('thoughts', ev.target.result);
          showToast('心声提示词导入成功');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // 新增：读取自定义心声外观设置
    const customThoughtsUISwitch = document.getElementById('custom-thoughts-ui-switch');
    const customThoughtsUIContainer = document.getElementById('custom-thoughts-ui-container');
    const customThoughtsHTMLTextarea = document.getElementById('custom-thoughts-html-textarea');
    const customThoughtsCSSTextarea = document.getElementById('custom-thoughts-css-textarea');
    
    customThoughtsUISwitch.checked = state.globalSettings.customThoughtsUIEnabled || false;
    customThoughtsUIContainer.style.display = customThoughtsUISwitch.checked ? 'block' : 'none';
    
    const savedThoughtsHTML = state.globalSettings.customThoughtsHTML || getDefaultThoughtsHTML();
    const savedThoughtsCSS = state.globalSettings.customThoughtsCSS || getDefaultThoughtsCSS();
    if (customThoughtsHTMLTextarea.value !== savedThoughtsHTML) customThoughtsHTMLTextarea.value = savedThoughtsHTML;
    if (customThoughtsCSSTextarea.value !== savedThoughtsCSS) customThoughtsCSSTextarea.value = savedThoughtsCSS;
    
    bindApiSettingsListener(customThoughtsUISwitch, 'change', function() {
      customThoughtsUIContainer.style.display = this.checked ? 'block' : 'none';
      if (this.checked) {
        if (!customThoughtsHTMLTextarea.value.trim()) {
          customThoughtsHTMLTextarea.value = getDefaultThoughtsHTML();
        }
        if (!customThoughtsCSSTextarea.value.trim()) {
          customThoughtsCSSTextarea.value = getDefaultThoughtsCSS();
        }
      }
    });

    bindApiSettingsListener(document.getElementById('reset-thoughts-ui-btn'), 'click', function() {
      customThoughtsHTMLTextarea.value = getDefaultThoughtsHTML();
      customThoughtsCSSTextarea.value = getDefaultThoughtsCSS();
      showToast('已恢复默认外观代码');
    });

    // 心声外观 - 导出
    bindApiSettingsListener(document.getElementById('export-thoughts-ui-btn'), 'click', function() {
      const htmlContent = customThoughtsHTMLTextarea.value || '';
      const cssContent = customThoughtsCSSTextarea.value || '';
      const data = JSON.stringify({ type: 'thoughts_ui', html: htmlContent, css: cssContent }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '心声自定义外观.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    // 心声外观 - 导入
    bindApiSettingsListener(document.getElementById('import-thoughts-ui-btn'), 'click', function() {
      document.getElementById('import-thoughts-ui-file').click();
    });
    
    bindApiSettingsListener(document.getElementById('import-thoughts-ui-file'), 'change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(ev) {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.type === 'thoughts_ui') {
            customThoughtsHTMLTextarea.value = data.html || '';
            customThoughtsCSSTextarea.value = data.css || '';
            showToast('心声自定义外观导入成功');
          } else {
            showToast('文件格式不正确');
          }
        } catch (err) {
          showToast('导入失败：文件格式错误');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // 新增：读取自定义结构化总结提示词设置
    const customSummarySwitch = document.getElementById('custom-summary-prompt-switch');
    const customSummaryContainer = document.getElementById('custom-summary-prompt-container');
    const customSummaryTextarea = document.getElementById('custom-summary-prompt-textarea');
    customSummarySwitch.checked = state.globalSettings.customSummaryPromptEnabled || false;
    customSummaryContainer.style.display = customSummarySwitch.checked ? 'block' : 'none';
    customSummaryTextarea.value = state.globalSettings.customSummaryPrompt || getDefaultSummaryPrompt();
    bindApiSettingsListener(customSummarySwitch, 'change', function() {
      customSummaryContainer.style.display = this.checked ? 'block' : 'none';
      if (this.checked && !customSummaryTextarea.value.trim()) {
        customSummaryTextarea.value = getDefaultSummaryPrompt();
      }
    });
    bindApiSettingsListener(document.getElementById('reset-summary-prompt-btn'), 'click', function() {
      customSummaryTextarea.value = getDefaultSummaryPrompt();
      window.PromptEntryManager?.replaceWithDefault('summary');
    });

    // 结构化总结提示词 - 导出
    bindApiSettingsListener(document.getElementById('export-summary-prompt-btn'), 'click', function() {
      const content = customSummaryTextarea.value || '';
      const data = JSON.stringify({
        type: 'summary_prompt',
        content: content,
        entries: window.PromptEntryManager?.exportScope('summary') || undefined
      }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '结构化总结提示词.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    // 结构化总结提示词 - 导入
    bindApiSettingsListener(document.getElementById('import-summary-prompt-btn'), 'click', function() {
      document.getElementById('import-summary-prompt-file').click();
    });
    bindApiSettingsListener(document.getElementById('import-summary-prompt-file'), 'change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(ev) {
        try {
          const data = JSON.parse(ev.target.result);
          if (Array.isArray(data.entries) && window.PromptEntryManager) {
            window.PromptEntryManager.replaceWithItems('summary', data.entries);
            showToast('结构化总结提示词导入成功');
          } else if (data.content) {
            customSummaryTextarea.value = data.content;
            window.PromptEntryManager?.replaceWithLegacy('summary', data.content);
            showToast('结构化总结提示词导入成功');
          } else {
            showToast('文件格式不正确');
          }
        } catch (err) {
          customSummaryTextarea.value = ev.target.result;
          window.PromptEntryManager?.replaceWithLegacy('summary', ev.target.result);
          showToast('结构化总结提示词导入成功');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // 新增：读取自定义聊天提示词设置
    const customChatPromptSwitch = document.getElementById('custom-chat-prompt-switch');
    const customChatPromptContainer = document.getElementById('custom-chat-prompt-container');
    const customChatPromptSingleTextarea = document.getElementById('custom-chat-prompt-single-textarea');
    const customChatPromptGroupTextarea = document.getElementById('custom-chat-prompt-group-textarea');
    const customChatPromptOfflineTextarea = document.getElementById('custom-chat-prompt-offline-textarea');
    const customChatPromptGroupOfflineTextarea = document.getElementById('custom-chat-prompt-group-offline-textarea');
    
    customChatPromptSwitch.checked = state.globalSettings.customChatPromptEnabled || false;
    customChatPromptContainer.style.display = customChatPromptSwitch.checked ? 'block' : 'none';
    
    // 初始化时填充默认提示词（如果用户没有自定义）
    customChatPromptSingleTextarea.value = state.globalSettings.customChatPromptSingle || getDefaultChatPrompt('single');
    customChatPromptGroupTextarea.value = state.globalSettings.customChatPromptGroup || getDefaultChatPrompt('group');
    customChatPromptOfflineTextarea.value = state.globalSettings.customChatPromptOffline || getDefaultChatPrompt('offline');
    customChatPromptGroupOfflineTextarea.value = state.globalSettings.customChatPromptGroupOffline || getDefaultChatPrompt('group_offline');
    window.PromptEntryManager?.mountAll(state.globalSettings);
    
    bindApiSettingsListener(customChatPromptSwitch, 'change', function() {
      customChatPromptContainer.style.display = this.checked ? 'block' : 'none';
      // 开启时，如果文本框为空，填充默认提示词
      if (this.checked) {
        if (!customChatPromptSingleTextarea.value.trim()) {
          customChatPromptSingleTextarea.value = getDefaultChatPrompt('single');
        }
        if (!customChatPromptGroupTextarea.value.trim()) {
          customChatPromptGroupTextarea.value = getDefaultChatPrompt('group');
        }
        if (!customChatPromptOfflineTextarea.value.trim()) {
          customChatPromptOfflineTextarea.value = getDefaultChatPrompt('offline');
        }
        if (!customChatPromptGroupOfflineTextarea.value.trim()) {
          customChatPromptGroupOfflineTextarea.value = getDefaultChatPrompt('group_offline');
        }
      }
    });
    
    // 单聊提示词 - 恢复默认
    bindApiSettingsListener(document.getElementById('reset-chat-prompt-single-btn'), 'click', function() {
      customChatPromptSingleTextarea.value = getDefaultChatPrompt('single');
      window.PromptEntryManager?.replaceWithDefault('single');
      showToast('已恢复单聊默认提示词');
    });
    
    // 群聊提示词 - 恢复默认
    bindApiSettingsListener(document.getElementById('reset-chat-prompt-group-btn'), 'click', function() {
      customChatPromptGroupTextarea.value = getDefaultChatPrompt('group');
      window.PromptEntryManager?.replaceWithDefault('group');
      showToast('已恢复群聊默认提示词');
    });
    
    // 线下模式提示词 - 恢复默认
    bindApiSettingsListener(document.getElementById('reset-chat-prompt-offline-btn'), 'click', function() {
      customChatPromptOfflineTextarea.value = getDefaultChatPrompt('offline');
      window.PromptEntryManager?.replaceWithDefault('offline');
      showToast('已恢复线下模式默认提示词');
      showToast('已清空线下模式提示词，将使用默认提示词');
    });
    
    // 群聊线下模式提示词 - 恢复默认
    bindApiSettingsListener(document.getElementById('reset-chat-prompt-group-offline-btn'), 'click', function() {
      customChatPromptGroupOfflineTextarea.value = getDefaultChatPrompt('group_offline');
      window.PromptEntryManager?.replaceWithDefault('group_offline');
      showToast('已恢复群聊线下模式默认提示词');
    });
    
    // 聊天提示词 - 导出
    bindApiSettingsListener(document.getElementById('export-chat-prompt-btn'), 'click', function() {
      const data = {
        type: 'chat_prompts',
        single: customChatPromptSingleTextarea.value || '',
        group: customChatPromptGroupTextarea.value || '',
        offline: customChatPromptOfflineTextarea.value || '',
        group_offline: customChatPromptGroupOfflineTextarea.value || '',
        entries: window.PromptEntryManager ? {
          single: window.PromptEntryManager.exportScope('single'),
          group: window.PromptEntryManager.exportScope('group'),
          offline: window.PromptEntryManager.exportScope('offline'),
          group_offline: window.PromptEntryManager.exportScope('group_offline')
        } : undefined
      };
      const dataStr = JSON.stringify(data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '聊天提示词.json';
      a.click();
      URL.revokeObjectURL(url);
    });
    
    // 聊天提示词 - 导入
    bindApiSettingsListener(document.getElementById('import-chat-prompt-btn'), 'click', function() {
      document.getElementById('import-chat-prompt-file').click();
    });
    bindApiSettingsListener(document.getElementById('import-chat-prompt-file'), 'change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(ev) {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.type === 'chat_prompts') {
            const importedEntries = data.entries && typeof data.entries === 'object' ? data.entries : null;
            if (data.single !== undefined) customChatPromptSingleTextarea.value = data.single;
            if (data.group !== undefined) customChatPromptGroupTextarea.value = data.group;
            if (data.offline !== undefined) customChatPromptOfflineTextarea.value = data.offline;
            if (data.group_offline !== undefined) customChatPromptGroupOfflineTextarea.value = data.group_offline;
            if (Array.isArray(importedEntries?.single)) window.PromptEntryManager?.replaceWithItems('single', importedEntries.single);
            else if (data.single !== undefined) window.PromptEntryManager?.replaceWithLegacy('single', data.single);
            if (Array.isArray(importedEntries?.group)) window.PromptEntryManager?.replaceWithItems('group', importedEntries.group);
            else if (data.group !== undefined) window.PromptEntryManager?.replaceWithLegacy('group', data.group);
            if (Array.isArray(importedEntries?.offline)) window.PromptEntryManager?.replaceWithItems('offline', importedEntries.offline);
            else if (data.offline !== undefined) window.PromptEntryManager?.replaceWithLegacy('offline', data.offline);
            if (Array.isArray(importedEntries?.group_offline)) window.PromptEntryManager?.replaceWithItems('group_offline', importedEntries.group_offline);
            else if (data.group_offline !== undefined) window.PromptEntryManager?.replaceWithLegacy('group_offline', data.group_offline);
            window.PromptEntryManager?.syncAll();
            showToast('聊天提示词导入成功');
          } else {
            showToast('文件格式不正确');
          }
        } catch (err) {
          showToast('导入失败：文件格式错误');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // 新增：聊天提示词标签页切换
    const chatPromptTabs = document.querySelectorAll('.custom-chat-prompt-tab');
    const chatPromptContents = document.querySelectorAll('.custom-chat-prompt-tab-content');
    
    chatPromptTabs.forEach(tab => {
      bindApiSettingsListener(tab, 'click', function() {
        const targetTab = this.getAttribute('data-tab');
        
        // 更新标签样式
        chatPromptTabs.forEach(t => {
          t.classList.remove('active');
          t.style.borderBottomColor = 'transparent';
          t.style.color = 'var(--text-secondary, #8e8e93)';
        });
        this.classList.add('active');
        this.style.borderBottomColor = 'var(--primary-color, #007aff)';
        this.style.color = 'var(--primary-color, #007aff)';
        
        // 切换内容
        chatPromptContents.forEach(content => {
          const contentTab = content.getAttribute('data-content');
          content.style.display = contentTab === targetTab ? 'block' : 'none';
        });
      });
    });

    document.getElementById('global-enable-view-myphone-switch').checked = state.globalSettings.enableViewMyPhone || false;
    document.getElementById('global-enable-cross-chat-switch').checked = state.globalSettings.enableCrossChat !== false; // 默认开启
    document.getElementById('global-prompt-clear-memory-switch').checked = state.globalSettings.promptClearMemoryOnChatClear || false;

    document.getElementById('chat-render-window-input').value = state.globalSettings.chatRenderWindow || 50;
    document.getElementById('chat-list-render-window-input').value = state.globalSettings.chatListRenderWindow || 30;
    const tempSlider = document.getElementById('api-temperature-slider');
    const tempInput = document.getElementById('api-temperature-input');
    const savedTemp = state.globalSettings.apiTemperature || 0.8;
    tempSlider.value = savedTemp;
    tempInput.value = savedTemp;
    
    const topPSlider = document.getElementById('api-top-p-slider');
    const topPInput = document.getElementById('api-top-p-input');
    const savedTopP = state.globalSettings.apiTopP !== undefined ? state.globalSettings.apiTopP : 1.0;
    topPSlider.value = savedTopP;
    topPInput.value = savedTopP;
    
    const presenceSlider = document.getElementById('api-presence-penalty-slider');
    const presenceInput = document.getElementById('api-presence-penalty-input');
    const savedPresence = state.globalSettings.apiPresencePenalty !== undefined ? state.globalSettings.apiPresencePenalty : 0.0;
    presenceSlider.value = savedPresence;
    presenceInput.value = savedPresence;
    
    const frequencySlider = document.getElementById('api-frequency-penalty-slider');
    const frequencyInput = document.getElementById('api-frequency-penalty-input');
    const savedFrequency = state.globalSettings.apiFrequencyPenalty !== undefined ? state.globalSettings.apiFrequencyPenalty : 0.0;
    frequencySlider.value = savedFrequency;
    frequencyInput.value = savedFrequency;
    
    // 方案4：加载API历史记录开关状态（默认关闭以减小导出文件体积）
    const apiHistorySwitch = document.getElementById('enable-api-history-switch');
    if (apiHistorySwitch) {
      apiHistorySwitch.checked = state.globalSettings.enableApiHistory || false;
    }
    
    // 加载安全渲染模式开关状态
    const safeRenderSwitch = document.getElementById('safe-render-mode-switch');
    if (safeRenderSwitch) {
      safeRenderSwitch.checked = state.globalSettings.safeRenderMode || false;
    }
    
    // 加载主对话流式输出开关状态
    const apiStreamSwitch = document.getElementById('enable-api-stream-switch');
    if (apiStreamSwitch) {
      apiStreamSwitch.checked = state.globalSettings.enableApiStream || false;
    }
    
    // 加载悬浮球开关状态
    const floatingBallSwitch = document.getElementById('floating-ball-switch');
    if (floatingBallSwitch) {
      floatingBallSwitch.checked = state.globalSettings.floatingBallEnabled === true; // 默认关闭
    }
    
    const savedMinimaxGroupId = localStorage.getItem('minimax-group-id');
    const savedMinimaxApiKey = localStorage.getItem('minimax-api-key');
    const savedMinimaxModel = localStorage.getItem('minimax-model');


    if (savedMinimaxGroupId !== null) state.apiConfig.minimaxGroupId = savedMinimaxGroupId;
    if (savedMinimaxApiKey !== null) state.apiConfig.minimaxApiKey = savedMinimaxApiKey;
    if (savedMinimaxModel !== null) state.apiConfig.minimaxModel = savedMinimaxModel;


    document.getElementById('minimax-group-id').value = state.apiConfig.minimaxGroupId || '';
    document.getElementById('minimax-api-key').value = state.apiConfig.minimaxApiKey || '';
    const minimaxSelect = document.getElementById('minimax-model-select');
    if (minimaxSelect) {
      // 1. 填充模型列表 (已接入 Minimax 全系列模型)
      const supportedMinimaxModels = [
        // --- 01 系列 (经典) ---

        { id: 'speech-01-turbo', name: 'Speech-01 Turbo (快速版)' },
        { id: 'speech-01-hd', name: 'Speech-01 HD (高清版)' },


        // --- 02 系列 ---

        { id: 'speech-02-turbo', name: 'Speech-02 Turbo' },
        { id: 'speech-02-hd', name: 'Speech-02 HD' },

        // --- 2.x 系列 (包含您要的 2.5) ---
        { id: 'speech-2.5-hd-preview', name: 'Speech-2.5 HD (高清)' },
        { id: 'speech-2.6-turbo', name: 'Speech-2.6 Turbo' },
        { id: 'speech-2.6-hd', name: 'Speech-2.6 HD' },

        // --- 2.8 系列 ---
        { id: 'speech-2.8-turbo', name: 'Speech-2.8 Turbo' },
        { id: 'speech-2.8-hd', name: 'Speech-2.8 HD' },

      ];

      minimaxSelect.innerHTML = '';
      supportedMinimaxModels.forEach(m => {
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = m.name;
        minimaxSelect.appendChild(option);
      });
      minimaxSelect.value = state.apiConfig.minimaxModel || 'speech-01';

      // 2. 【新增】动态插入"接口域名"选择框 (如果还没有的话)


      // 3. 【新增】回显保存的设置
      const domainSelect = document.getElementById('minimax-domain-select');
      if (domainSelect) {
        // 优先读取 state，没有则读取 localStorage，默认国内
        domainSelect.value = state.apiConfig.minimaxDomain || localStorage.getItem('minimax-domain') || 'https://api.minimax.chat';
      }
    }


    const novelaiEnabled = (localStorage.getItem('novelai-enabled') ?? String(state.apiConfig.novelaiEnabled || false)) === 'true';
    const novelaiModel = localStorage.getItem('novelai-model') || state.apiConfig.novelaiModel || 'nai-diffusion-4-5-full';
    const novelaiApiKey = localStorage.getItem('novelai-api-key') ?? state.apiConfig.novelaiApiKey ?? '';
    document.getElementById('novelai-switch').checked = novelaiEnabled;
    document.getElementById('novelai-model').value = novelaiModel;
    document.getElementById('novelai-api-key').value = novelaiApiKey;
    document.getElementById('novelai-details').style.display = novelaiEnabled ? 'block' : 'none';
    window.NovelAISettings?.load();

    // Google Imagen 设置加载
    const googleImagenEnabled = localStorage.getItem('google-imagen-enabled') === 'true';
    const googleImagenModel = localStorage.getItem('google-imagen-model') || 'imagen-4.0-generate-001';
    const googleImagenApiKey = localStorage.getItem('google-imagen-api-key') || '';
    const googleImagenSettings = getGoogleImagenSettings();
    document.getElementById('google-imagen-switch').checked = googleImagenEnabled;
    document.getElementById('google-imagen-model').value = googleImagenModel;
    document.getElementById('google-imagen-api-key').value = googleImagenApiKey;
    document.getElementById('google-imagen-endpoint').value = googleImagenSettings.endpoint || 'https://generativelanguage.googleapis.com';
    document.getElementById('google-imagen-aspect-ratio').value = googleImagenSettings.aspectRatio || '1:1';
    if(document.getElementById('google-imagen-positive')) document.getElementById('google-imagen-positive').value = googleImagenSettings.positivePrompt || '';
    if(document.getElementById('google-imagen-negative')) document.getElementById('google-imagen-negative').value = googleImagenSettings.negativePrompt || '';
    document.getElementById('google-imagen-details').style.display = googleImagenEnabled ? 'block' : 'none';

    // GPT 生图设置加载
    const openAIImageEnabled = localStorage.getItem('openai-image-enabled') === 'true';
    const openAIImageApiKey = localStorage.getItem('openai-image-api-key') || '';
    const openAIImageSettings = getOpenAIImageSettings();
    const openAIImageSwitch = document.getElementById('openai-image-switch');
    if (openAIImageSwitch) openAIImageSwitch.checked = openAIImageEnabled;
    const openAIImageModel = document.getElementById('openai-image-model');
    if (openAIImageModel) openAIImageModel.value = localStorage.getItem('openai-image-model') || openAIImageSettings.model || 'gpt-image-2';
    const openAIImageApiKeyInput = document.getElementById('openai-image-api-key');
    if (openAIImageApiKeyInput) openAIImageApiKeyInput.value = openAIImageApiKey;
    const openAIImageEndpoint = document.getElementById('openai-image-endpoint');
    if (openAIImageEndpoint) openAIImageEndpoint.value = openAIImageSettings.endpoint || 'https://api.openai.com';
    const openAIImageSize = document.getElementById('openai-image-size');
    if (openAIImageSize) openAIImageSize.value = openAIImageSettings.size || 'auto';
    const openAIImageQuality = document.getElementById('openai-image-quality');
    if (openAIImageQuality) openAIImageQuality.value = openAIImageSettings.quality || 'auto';
    const openAIImageFormat = document.getElementById('openai-image-output-format');
    if (openAIImageFormat) openAIImageFormat.value = openAIImageSettings.outputFormat || 'png';
    const openAIImageCompression = document.getElementById('openai-image-compression');
    if (openAIImageCompression) openAIImageCompression.value = openAIImageSettings.outputCompression ?? 100;
    const openAIImageCompressionRow = document.getElementById('openai-image-compression-row');
    if (openAIImageCompressionRow) openAIImageCompressionRow.style.display = ['jpeg', 'webp'].includes(openAIImageSettings.outputFormat) ? 'flex' : 'none';
    const openAIImageBackground = document.getElementById('openai-image-background');
    if (openAIImageBackground) openAIImageBackground.value = openAIImageSettings.background || 'auto';
    const openAIImageModeration = document.getElementById('openai-image-moderation');
    if (openAIImageModeration) openAIImageModeration.value = openAIImageSettings.moderation || 'auto';
    const openAIImagePositive = document.getElementById('openai-image-positive');
    if (openAIImagePositive) openAIImagePositive.value = openAIImageSettings.positivePrompt || '';
    const openAIImageDetails = document.getElementById('openai-image-details');
    if (openAIImageDetails) openAIImageDetails.style.display = openAIImageEnabled ? 'block' : 'none';

    const imgbbEnableSwitch = document.getElementById('imgbb-enable-switch');
    const imgbbApiKeyInput = document.getElementById('imgbb-api-key');
    const imgbbDetailsDiv = document.getElementById('imgbb-settings-details');


    const savedImgbbEnabled = localStorage.getItem('imgbb-enabled');
    const savedImgbbKey = localStorage.getItem('imgbb-api-key');


    if (savedImgbbEnabled !== null) state.apiConfig.imgbbEnable = (savedImgbbEnabled === 'true');
    if (savedImgbbKey !== null) state.apiConfig.imgbbApiKey = savedImgbbKey;

    if (imgbbEnableSwitch) {
      imgbbEnableSwitch.checked = state.apiConfig.imgbbEnable || false;
      imgbbApiKeyInput.value = state.apiConfig.imgbbApiKey || '';
      imgbbDetailsDiv.style.display = imgbbEnableSwitch.checked ? 'block' : 'none';
    }


    const catboxEnableSwitch = document.getElementById('catbox-enable-switch');
    const catboxUserHashInput = document.getElementById('catbox-userhash');
    const catboxDetailsDiv = document.getElementById('catbox-settings-details');


    const savedCatboxEnabled = localStorage.getItem('catbox-enabled');
    const savedCatboxHash = localStorage.getItem('catbox-userhash');


    if (savedCatboxEnabled !== null) state.apiConfig.catboxEnable = (savedCatboxEnabled === 'true');
    if (savedCatboxHash !== null) state.apiConfig.catboxUserHash = savedCatboxHash;

    if (catboxEnableSwitch) {
      catboxEnableSwitch.checked = state.apiConfig.catboxEnable || false;
      catboxUserHashInput.value = state.apiConfig.catboxUserHash || '';
      catboxDetailsDiv.style.display = catboxEnableSwitch.checked ? 'block' : 'none';
    }

    // 识图Token优化开关
    const imageTokenOptimizeSwitch = document.getElementById('image-token-optimize-switch');
    const savedImageTokenOptimize = localStorage.getItem('image-token-optimize');
    if (savedImageTokenOptimize !== null) state.apiConfig.imageTokenOptimize = (savedImageTokenOptimize === 'true');
    if (imageTokenOptimizeSwitch) {
      imageTokenOptimizeSwitch.checked = state.apiConfig.imageTokenOptimize || false;
    }

    const ghSwitch = document.getElementById('github-enable-switch');
    const ghDetails = document.getElementById('github-settings-details');

    // 从 localStorage 读取，如果没有则读取 apiConfig (保持一致性)
    const savedGhEnabled = localStorage.getItem('github-enabled');
    if (savedGhEnabled !== null) state.apiConfig.githubEnable = (savedGhEnabled === 'true');

    if (ghSwitch) {
      ghSwitch.checked = state.apiConfig.githubEnable || false;

      // 核心逻辑：根据开关状态决定是否显示详情框
      ghDetails.style.display = ghSwitch.checked ? 'block' : 'none';
      const ghAutoSwitch = document.getElementById('github-auto-backup-switch');
      const ghIntervalInput = document.getElementById('github-backup-interval'); // 【新增】

      if (ghAutoSwitch) {
        const savedAuto = localStorage.getItem('github-auto-backup');
        ghAutoSwitch.checked = savedAuto !== null ? (savedAuto === 'true') : false;

        // 【新增】回显分钟数，默认 30
        const savedInterval = localStorage.getItem('github-backup-interval');
        if (ghIntervalInput) {
          ghIntervalInput.value = savedInterval ? parseInt(savedInterval) : 30;
        }
      }
      // 回显输入框的值
      document.getElementById('github-username').value = state.apiConfig.githubUsername || '';
      document.getElementById('github-repo').value = state.apiConfig.githubRepo || '';
      document.getElementById('github-token').value = state.apiConfig.githubToken || '';
      document.getElementById('github-filename').value = state.apiConfig.githubFilename || 'ephone_backup.json';
      const ghProxySwitch = document.getElementById('github-proxy-switch');
      const ghProxyInputDiv = document.getElementById('github-proxy-input-group');
      const ghProxyUrlInput = document.getElementById('github-proxy-url');

      // 读取保存的设置
      const savedGhProxyEnabled = localStorage.getItem('github-proxy-enabled');
      const savedGhProxyUrl = localStorage.getItem('github-proxy-url');

      // 设置状态
      state.apiConfig.githubProxyEnable = savedGhProxyEnabled === 'true';
      state.apiConfig.githubProxyUrl = savedGhProxyUrl || '';

      if (ghProxySwitch) {
        ghProxySwitch.checked = state.apiConfig.githubProxyEnable;
        ghProxyInputDiv.style.display = ghProxySwitch.checked ? 'block' : 'none';
        ghProxyUrlInput.value = state.apiConfig.githubProxyUrl || '';

        // 绑定切换事件，控制输入框显示
        bindApiSettingsListener(ghProxySwitch, 'change', (e) => {
          ghProxyInputDiv.style.display = e.target.checked ? 'block' : 'none';
        });
      }
    }

    // 填充手写输入框（模型）
    const modelInput = document.getElementById('model-input');
    const secondaryModelInput = document.getElementById('secondary-model-input');
    const backgroundModelInput = document.getElementById('background-model-input');
    const visionModelInput = document.getElementById('vision-model-input');
    if (modelInput) {
      modelInput.value = state.apiConfig.model || '';
    }
    if (secondaryModelInput) {
      secondaryModelInput.value = state.apiConfig.secondaryModel || '';
    }
    if (backgroundModelInput) {
      backgroundModelInput.value = state.apiConfig.backgroundModel || '';
    }
    if (visionModelInput) {
      visionModelInput.value = state.apiConfig.visionModel || '';
    }

    loadApiPresetsDropdown(forcePresetId);
    if(typeof loadSecondaryApiPresetsDropdown === 'function') {
      loadSecondaryApiPresetsDropdown();
    }
    displayTotalImageSize();
  }

  window.renderApiSettingsProxy = renderApiSettings;


