// ============================================================
// settings-presets.js — API预设、提示音预设、壁纸/外观/CSS/字体/主题预设管理
// 来源：script.js 第 9080~9620 行 + 第 10562~10862 行 + 第 39116~39583 行
// ============================================================

// ========== 提示词处理函数（来源：script.js 第 36490~36608 行）==========

  /**
   * 获取默认的心声提示词
   */
  function getDefaultThoughtsPrompt() {
    return `## 内心独白 (必须执行)
在所有行动的最后，必须包含 \`update_thoughts\` 指令，用于更新你的"心声"和"散记"（这是你灵魂的延续，绝对不能遗漏！）。
\`{"type": "update_thoughts", "heartfelt_voice": "...", "random_jottings": "..."}\`
- **heartfelt_voice (心声)**: 一句话概括角色此刻最核心、最私密的想法。
- **random_jottings (散记)**: 一段50字以上的、符合人设的思考或心情记录，禁止OOC。这是你灵魂的延续。
- **记忆发展**: 你的新"心声"和"散记"【必须】是基于最新对话内容的【全新思考】。你【绝对不能】重复或简单改写上一轮的内心独白。你的思绪应该像真人一样，不断演进和发展。`;
  }

  /**
   * 获取当前生效的心声提示词（优先用户自定义，否则用默认）
   */
  function getActiveThoughtsPrompt() {
    if (state.globalSettings.customThoughtsPromptEnabled && state.globalSettings.customThoughtsPrompt && state.globalSettings.customThoughtsPrompt.trim()) {
      return state.globalSettings.customThoughtsPrompt;
    }
    return getDefaultThoughtsPrompt();
  }

  /**
   * 获取默认的结构化总结提示词（带占位符变量）
   */
  function getDefaultSummaryPrompt() {
    return `{{总结设定}}
# 你的任务
你是"{{角色名}}"。请阅读下面的对话记录，提取【值得长期记忆】的信息，输出为【结构化记忆条目】。

# 现有记忆档案（供参考，避免重复提取）
{{现有记忆}}

# 对话时间范围
{{时间范围}}

# 输出格式（严格遵守）
每行一条，格式为：[YYMMDD]分类标签:内容

{{分类说明}}

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
- ❓ 这个信息能帮助我更了解{{用户昵称}}吗？
- ❓ 这是我们关系发展的重要节点吗？
- ❓ 如果一个月后忘记这个，会让{{用户昵称}}失望吗？
→ 如果都是"否"，就不要提取

## 4. 格式要求
- 【日期准确】：根据对话时间范围推算具体日期，格式YYMMDD
- 【F类用key=value】：同类信息归到同一个key下，多个值用+连接
- 【简短但完整】：每条尽量简短，但不能丢失关键信息
- 【第一人称】：从"{{角色名}}"的视角记录
- 【不重复】：参考现有记忆档案，不要重复提取已有的信息
- 【善用自定义分类】：如果有自定义分类，优先将相关内容归入对应分类

## 5. 质量控制
- 宁可少记，不要滥记
- 每条记忆都应该是"值得珍藏"的
- 如果犹豫要不要记，那就不记

# 你的角色设定
{{角色人设}}

# 你的聊天对象
{{用户昵称}}（人设：{{用户人设}}）

# 待提取的对话记录
{{对话记录}}

请直接输出结构化记忆条目，每行一条，不要输出其他内容。只提取真正重要的信息，不要把闲聊内容也记录下来。`;
  }

  /**
   * 获取当前生效的结构化总结提示词（优先用户自定义，否则用默认）
   */
  function getActiveSummaryPrompt() {
    if (state.globalSettings.customSummaryPromptEnabled && state.globalSettings.customSummaryPrompt && state.globalSettings.customSummaryPrompt.trim()) {
      return state.globalSettings.customSummaryPrompt;
    }
    return getDefaultSummaryPrompt();
  }

  /**
   * 根据用户设置处理提示词
   * @param {string} originalPrompt - 原始的完整提示词
   * @param {string} chatType - 聊天类型：'single'单聊, 'group'群聊, 'spectator'旁观
   * @returns {string} - 处理后的提示词
   */
  function processPromptWithSettings(originalPrompt, chatType = 'single') {
    // 使用原始提示词
    return originalPrompt;
  }

// ========== 提示词处理函数结束 ==========

// ========== API 预设管理 ==========

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
      state.apiConfig = {
        id: 'main',
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
    document.getElementById('global-enable-qzone-actions-switch').checked = state.globalSettings.enableQzoneActions || false;

    // 新增：读取自定义心声提示词设置
    const customThoughtsSwitch = document.getElementById('custom-thoughts-prompt-switch');
    const customThoughtsContainer = document.getElementById('custom-thoughts-prompt-container');
    const customThoughtsTextarea = document.getElementById('custom-thoughts-prompt-textarea');
    customThoughtsSwitch.checked = state.globalSettings.customThoughtsPromptEnabled || false;
    customThoughtsContainer.style.display = customThoughtsSwitch.checked ? 'block' : 'none';
    customThoughtsTextarea.value = state.globalSettings.customThoughtsPrompt || getDefaultThoughtsPrompt();
    customThoughtsSwitch.addEventListener('change', function() {
      customThoughtsContainer.style.display = this.checked ? 'block' : 'none';
      if (this.checked && !customThoughtsTextarea.value.trim()) {
        customThoughtsTextarea.value = getDefaultThoughtsPrompt();
      }
    });
    document.getElementById('reset-thoughts-prompt-btn').addEventListener('click', function() {
      customThoughtsTextarea.value = getDefaultThoughtsPrompt();
    });

    // 心声提示词 - 导出
    document.getElementById('export-thoughts-prompt-btn').addEventListener('click', function() {
      const content = customThoughtsTextarea.value || '';
      const data = JSON.stringify({ type: 'thoughts_prompt', content: content }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '心声提示词.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    // 心声提示词 - 导入
    document.getElementById('import-thoughts-prompt-btn').addEventListener('click', function() {
      document.getElementById('import-thoughts-prompt-file').click();
    });
    document.getElementById('import-thoughts-prompt-file').addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(ev) {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.content) {
            customThoughtsTextarea.value = data.content;
            showToast('心声提示词导入成功');
          } else {
            showToast('文件格式不正确');
          }
        } catch (err) {
          // 如果不是JSON，当作纯文本导入
          customThoughtsTextarea.value = ev.target.result;
          showToast('心声提示词导入成功');
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
    customSummarySwitch.addEventListener('change', function() {
      customSummaryContainer.style.display = this.checked ? 'block' : 'none';
      if (this.checked && !customSummaryTextarea.value.trim()) {
        customSummaryTextarea.value = getDefaultSummaryPrompt();
      }
    });
    document.getElementById('reset-summary-prompt-btn').addEventListener('click', function() {
      customSummaryTextarea.value = getDefaultSummaryPrompt();
    });

    // 结构化总结提示词 - 导出
    document.getElementById('export-summary-prompt-btn').addEventListener('click', function() {
      const content = customSummaryTextarea.value || '';
      const data = JSON.stringify({ type: 'summary_prompt', content: content }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '结构化总结提示词.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    // 结构化总结提示词 - 导入
    document.getElementById('import-summary-prompt-btn').addEventListener('click', function() {
      document.getElementById('import-summary-prompt-file').click();
    });
    document.getElementById('import-summary-prompt-file').addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(ev) {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.content) {
            customSummaryTextarea.value = data.content;
            showToast('结构化总结提示词导入成功');
          } else {
            showToast('文件格式不正确');
          }
        } catch (err) {
          customSummaryTextarea.value = ev.target.result;
          showToast('结构化总结提示词导入成功');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    document.getElementById('global-enable-view-myphone-switch').checked = state.globalSettings.enableViewMyPhone || false;
    document.getElementById('global-enable-cross-chat-switch').checked = state.globalSettings.enableCrossChat !== false; // 默认开启

    document.getElementById('chat-render-window-input').value = state.globalSettings.chatRenderWindow || 50;
    document.getElementById('chat-list-render-window-input').value = state.globalSettings.chatListRenderWindow || 30;
    const tempSlider = document.getElementById('api-temperature-slider');
    const tempValue = document.getElementById('api-temperature-value');
    const savedTemp = state.globalSettings.apiTemperature || 0.8;
    tempSlider.value = savedTemp;
    tempValue.textContent = savedTemp;
    
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


    const novelaiEnabled = localStorage.getItem('novelai-enabled') === 'true';
    const novelaiModel = localStorage.getItem('novelai-model') || 'nai-diffusion-4-5-full';
    const novelaiApiKey = localStorage.getItem('novelai-api-key') || '';
    document.getElementById('novelai-switch').checked = novelaiEnabled;
    document.getElementById('novelai-model').value = novelaiModel;
    document.getElementById('novelai-api-key').value = novelaiApiKey;
    document.getElementById('novelai-details').style.display = novelaiEnabled ? 'block' : 'none';

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
    document.getElementById('google-imagen-details').style.display = googleImagenEnabled ? 'block' : 'none';

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
        ghProxySwitch.addEventListener('change', (e) => {
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
    displayTotalImageSize();
  }

  window.renderApiSettingsProxy = renderApiSettings;


// ========== 提示音预设管理 ==========

  async function migrateSoundPresetsToDb() {
    try {
      // 检查数据库表是否为空
      const existingPresets = await db.soundPresets.toArray();
      if (existingPresets.length > 0) {
        console.log('[声音预设迁移] 数据库表已有数据，跳过迁移');
        return;
      }

      // 检查旧数据是否存在
      if (state.globalSettings.soundPresets && Array.isArray(state.globalSettings.soundPresets) && state.globalSettings.soundPresets.length > 0) {
        console.log('[声音预设迁移] 发现旧数据，开始迁移...', state.globalSettings.soundPresets);
        
        // 迁移数据到新表
        for (const preset of state.globalSettings.soundPresets) {
          await db.soundPresets.add({
            name: preset.name,
            url: preset.url
          });
        }
        
        console.log(`[声音预设迁移] 成功迁移 ${state.globalSettings.soundPresets.length} 个预设到数据库表`);
      } else {
        console.log('[声音预设迁移] 未发现旧数据');
      }
    } catch (error) {
      console.error('[声音预设迁移] 迁移失败:', error);
    }
  }

  // 加载提示音预设下拉框
  async function loadSoundPresetsDropdown(forceSelectedId = null) {
    console.log('[声音预设DEBUG] loadSoundPresetsDropdown 被调用, forceSelectedId:', forceSelectedId);
    const selectEl = document.getElementById('sound-preset-select');
    if (!selectEl) {
      console.error('[声音预设DEBUG] 找不到 sound-preset-select 元素！');
      return;
    }

    selectEl.innerHTML = '<option value="current">当前配置 (未保存)</option>';

    console.log('[声音预设DEBUG] 开始从数据库读取预设...');
    const presets = await db.soundPresets.toArray();
    console.log('[声音预设DEBUG] 从数据库读取到的预设:', presets);
    
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      selectEl.appendChild(option);
      console.log('[声音预设DEBUG] 添加预设到下拉框:', preset.name, 'ID:', preset.id);
    });

    // 如果指定了要选中的预设ID
    if (forceSelectedId) {
      selectEl.value = forceSelectedId;
      return;
    }

    // 自动匹配当前配置
    const currentUrl = document.getElementById('notification-sound-url-input').value.trim();
    let matchingPresetId = null;
    for (const preset of presets) {
      if (preset.url === currentUrl) {
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

  // 处理提示音预设选择变化
  async function handleSoundPresetSelectionChange() {
    const selectEl = document.getElementById('sound-preset-select');
    const selectedValue = selectEl.value;

    if (selectedValue === 'current') {
      return;
    }

    const selectedId = parseInt(selectedValue);
    if (isNaN(selectedId)) {
      return;
    }

    const preset = await db.soundPresets.get(selectedId);
    if (!preset) return;

    // 直接应用预设
    document.getElementById('notification-sound-url-input').value = preset.url || '';
    state.globalSettings.notificationSoundUrl = preset.url || '';
    saveState();

    // 刷新下拉框，确保选中状态
    await loadSoundPresetsDropdown(selectedId);
  }

  // 保存提示音预设
  async function saveSoundPreset() {
    console.log('[声音预设DEBUG] saveSoundPreset 被调用');
    const url = document.getElementById('notification-sound-url-input').value.trim();

    // 请求输入预设名称
    const name = await showCustomPrompt('保存提示音预设', '请输入预设名称');
    if (!name || name.trim() === '') {
      console.log('[声音预设DEBUG] 用户取消输入');
      return;
    }

    const presetData = {
      name: name.trim(),
      url: url
    };
    console.log('[声音预设DEBUG] 准备保存预设:', presetData);

    // 检查是否已存在同名预设
    const existingPreset = await db.soundPresets.where('name').equals(presetData.name).first();
    if (existingPreset) {
      console.log('[声音预设DEBUG] 发现同名预设:', existingPreset);
      const confirmed = await showCustomConfirm('覆盖预设', `名为 "${presetData.name}" 的预设已存在。要覆盖它吗？`, {
        confirmButtonClass: 'btn-danger'
      });
      if (!confirmed) {
        console.log('[声音预设DEBUG] 用户取消覆盖');
        return;
      }
      presetData.id = existingPreset.id;
    }

    console.log('[声音预设DEBUG] 开始写入数据库...');
    await db.soundPresets.put(presetData);
    console.log('[声音预设DEBUG] 数据库写入完成，返回的ID:', presetData.id);
    
    console.log('[声音预设DEBUG] 准备刷新下拉框...');
    await loadSoundPresetsDropdown(presetData.id);
    console.log('[声音预设DEBUG] 下拉框刷新完成');
    
    alert('预设已保存！');
  }

  // 删除提示音预设（从下拉框删除选中的预设）
  async function deleteSoundPreset() {
    const selectEl = document.getElementById('sound-preset-select');
    const selectedValue = selectEl.value;

    if (selectedValue === 'current') {
      alert('请先从下拉框中选择一个要删除的预设。');
      return;
    }

    const selectedId = parseInt(selectedValue);
    if (isNaN(selectedId)) {
      return;
    }

    const preset = await db.soundPresets.get(selectedId);
    if (!preset) return;

    const confirmed = await showCustomConfirm('删除预设', `确定要删除预设 "${preset.name}" 吗？`, {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.soundPresets.delete(selectedId);
      await loadSoundPresetsDropdown();
      alert('预设已删除！');
    }
  }

  // 渲染提示音预设列表（保持兼容，但现在主要用下拉框）
  async function renderSoundPresets() {
    console.log('[声音预设DEBUG] renderSoundPresets 被调用');
    await migrateSoundPresetsToDb(); // 先执行数据迁移
    console.log('[声音预设DEBUG] 迁移完成，开始加载下拉框');
    await loadSoundPresetsDropdown();
    console.log('[声音预设DEBUG] 下拉框加载完成');
  }

  // ========== 提示音预设管理功能结束 ==========


// ========== 壁纸/外观屏幕渲染 ==========

  async function renderWallpaperScreen(forcePresetId = null) {
    console.log('[声音预设DEBUG] renderWallpaperScreen 被调用');
    loadCssPresetsDropdown();
    // 这里传入 forcePresetId
    loadAppearancePresetsDropdown(forcePresetId);

    const ephonePreview = document.getElementById('wallpaper-preview');

    if (newWallpaperBase64) {
      ephonePreview.style.backgroundImage = `url("${newWallpaperBase64}")`;
      ephonePreview.textContent = '';
    } else {
      const ephoneBg = state.globalSettings.wallpaper;
      if (ephoneBg && ephoneBg.trim() !== '') {
        ephonePreview.style.backgroundImage = `url("${ephoneBg}")`;
        ephonePreview.textContent = '';
      } else {
        ephonePreview.style.backgroundImage = 'none';
        ephonePreview.style.backgroundColor = '#ffffff';
        ephonePreview.textContent = '点击下方上传';
      }
    }

    const cphonePreview = document.getElementById('cphone-wallpaper-preview');
    const cphoneBg = state.globalSettings.cphoneWallpaper;
    if (cphoneBg) {
      cphonePreview.style.backgroundImage = `url("${cphoneBg}")`;
      cphonePreview.textContent = '';
    } else {
      cphonePreview.style.backgroundImage = 'none';
      cphonePreview.style.backgroundColor = '#ffffff';
      cphonePreview.textContent = '当前为白色';
    }

    const myphonePreview = document.getElementById('myphone-wallpaper-preview');
    const myphoneBg = state.globalSettings.myphoneWallpaper;
    if (myphoneBg) {
      myphonePreview.style.backgroundImage = `url("${myphoneBg}")`;
      myphonePreview.textContent = '';
    } else {
      myphonePreview.style.backgroundImage = 'none';
      myphonePreview.style.backgroundColor = '#ffffff';
      myphonePreview.textContent = '当前为白色';
    }

    const globalBgPreview = document.getElementById('global-bg-preview');
    const globalBg = state.globalSettings.globalChatBackground;
    if (globalBg) {
      globalBgPreview.style.backgroundImage = `url(${globalBg})`;
      globalBgPreview.textContent = '';
    } else {
      globalBgPreview.style.backgroundImage = 'none';
      globalBgPreview.style.backgroundColor = '#ffffff';
      globalBgPreview.textContent = '点击下方上传';
    }

    renderIconSettings();
    renderCPhoneIconSettings();
    renderMyPhoneIconSettings();
    document.getElementById('global-css-input').value = state.globalSettings.globalCss || '';
    document.getElementById('notification-sound-url-input').value = state.globalSettings.notificationSoundUrl || '';

    // 初始化音量滑动条
    const volumeValue = (state.globalSettings.notificationVolume !== undefined ? state.globalSettings.notificationVolume : 1.0) * 100;
    document.getElementById('notification-volume-slider').value = volumeValue;
    document.getElementById('notification-volume-label').textContent = Math.round(volumeValue) + '%';

    if (typeof renderSoundPresets === 'function') {
      console.log('[声音预设DEBUG] 准备调用 renderSoundPresets');
      await renderSoundPresets(); // 渲染提示音预设列表
      console.log('[声音预设DEBUG] renderSoundPresets 调用完成');
    } else {
      console.error('[声音预设DEBUG] renderSoundPresets 函数不存在！');
    }
    document.getElementById('status-bar-toggle-switch').checked = state.globalSettings.showStatusBar || false;
    document.getElementById('global-show-seconds-switch').checked = state.globalSettings.showSeconds || false;
    document.getElementById('phone-frame-toggle-switch').checked = state.globalSettings.showPhoneFrame || false;
    document.getElementById('minimal-chat-ui-switch').checked = state.globalSettings.enableMinimalChatUI || false;
    document.getElementById('dynamic-island-music-toggle-switch').checked = state.globalSettings.alwaysShowMusicIsland || false;
    document.getElementById('detach-status-bar-switch').checked = state.globalSettings.detachStatusBar || false;
    document.getElementById('clean-chat-detail-switch').checked = state.globalSettings.cleanChatDetail || false;
    document.getElementById('clean-api-settings-switch').checked = state.globalSettings.cleanApiSettings || false;
    document.getElementById('api-style-beautify-switch').checked = state.globalSettings.apiStyleBeautify || false;
    document.getElementById('dropdown-popup-mode-switch').checked = state.globalSettings.dropdownPopupMode || false;
    document.getElementById('lock-screen-toggle').checked = state.globalSettings.lockScreenEnabled || false; // 锁屏回显
    document.getElementById('lock-screen-password-input').value = state.globalSettings.lockScreenPassword || ''; // 密码回显

    // 锁屏壁纸回显
    const lockPreview = document.getElementById('lock-wallpaper-preview');
    if (state.globalSettings.lockScreenWallpaper) {
      lockPreview.style.backgroundImage = `url(${state.globalSettings.lockScreenWallpaper})`;
      lockPreview.textContent = '';
    } else {
      lockPreview.style.backgroundImage = 'linear-gradient(135deg, #1c1c1e, #3a3a3c)';
      lockPreview.textContent = '默认壁纸';
    }

    renderButtonOrderEditor();
    initializeButtonOrderEditor();

    // 加载系统通知设置
    loadSystemNotificationSettings();
  }

  window.renderWallpaperScreenProxy = renderWallpaperScreen;

  function applyGlobalWallpaper() {
    const homeScreen = document.getElementById('home-screen');
    const wallpaper = state.globalSettings.wallpaper;
    if (wallpaper) {

      homeScreen.style.backgroundImage = `url("${wallpaper}")`;
      homeScreen.style.backgroundColor = '';
    } else {

      homeScreen.style.backgroundImage = 'none';
      homeScreen.style.backgroundColor = '#ffffff';
    }
  }


// ========== CSS 预设管理 ==========

  async function loadCssPresetsDropdown() {
    const selectEl = document.getElementById('css-preset-select');
    selectEl.innerHTML = '<option value="">-- 选择一个预设 --</option>';

    const presets = await db.appearancePresets.where('type').equals('global_css').toArray();
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      selectEl.appendChild(option);
    });
  }


  async function handleCssPresetSelectionChange() {
    const selectEl = document.getElementById('css-preset-select');
    const selectedId = parseInt(selectEl.value);
    if (isNaN(selectedId)) return;

    const preset = await db.appearancePresets.get(selectedId);
    if (preset) {
      const cssInput = document.getElementById('global-css-input');
      cssInput.value = preset.value;
      applyGlobalCss(preset.value);
    }
  }


  async function saveCssPreset() {
    const name = await showCustomPrompt('保存CSS预设', '请输入预设名称');
    if (!name || !name.trim()) return;

    const cssValue = document.getElementById('global-css-input').value;

    const existingPreset = await db.appearancePresets.where({
      name: name.trim(),
      type: 'global_css'
    }).first();
    if (existingPreset) {
      const confirmed = await showCustomConfirm('覆盖预设', `名为 "${name.trim()}" 的预设已存在。要覆盖它吗？`, {
        confirmButtonClass: 'btn-danger'
      });
      if (!confirmed) return;

      await db.appearancePresets.update(existingPreset.id, {
        value: cssValue
      });
    } else {
      await db.appearancePresets.add({
        name: name.trim(),
        type: 'global_css',
        value: cssValue
      });
    }

    await loadCssPresetsDropdown();
    alert('CSS 预设已保存！');
  }


  async function deleteCssPreset() {
    const selectEl = document.getElementById('css-preset-select');
    const selectedId = parseInt(selectEl.value);

    if (isNaN(selectedId)) {
      alert('请先从下拉框中选择一个要删除的预设。');
      return;
    }

    const preset = await db.appearancePresets.get(selectedId);
    if (!preset) return;

    const confirmed = await showCustomConfirm('删除预设', `确定要删除预设 "${preset.name}" 吗？`, {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.appearancePresets.delete(selectedId);
      await loadCssPresetsDropdown();
      alert('预设已删除。');
    }
  }


// ========== 字体预设管理 ==========

  async function loadFontPresetsDropdown() {
    const selectEl = document.getElementById('font-preset-select');
    selectEl.innerHTML = '<option value="">-- 选择一个预设 --</option>';

    const presets = await db.appearancePresets.where('type').equals('font').toArray();
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      selectEl.appendChild(option);
    });
  }


  async function handleFontPresetSelectionChange() {
    const selectEl = document.getElementById('font-preset-select');
    const selectedId = parseInt(selectEl.value);
    if (isNaN(selectedId)) return;

    const preset = await db.appearancePresets.get(selectedId);
    if (preset) {
      const fontUrlInput = document.getElementById('font-url-input');
      fontUrlInput.value = preset.value;
      applyCustomFont(preset.value, true);
    }
  }


  async function saveFontPreset() {
    const name = await showCustomPrompt('保存字体预设', '请输入预设名称');
    if (!name || !name.trim()) return;

    const fontUrl = document.getElementById('font-url-input').value.trim();
    if (!fontUrl) {
      alert("字体URL不能为空！");
      return;
    }

    const existingPreset = await db.appearancePresets.where({
      name: name.trim(),
      type: 'font'
    }).first();
    if (existingPreset) {
      const confirmed = await showCustomConfirm('覆盖预设', `名为 "${name.trim()}" 的预设已存在。要覆盖它吗？`, {
        confirmButtonClass: 'btn-danger'
      });
      if (!confirmed) return;

      await db.appearancePresets.update(existingPreset.id, {
        value: fontUrl
      });
    } else {
      await db.appearancePresets.add({
        name: name.trim(),
        type: 'font',
        value: fontUrl
      });
    }

    await loadFontPresetsDropdown();
    alert('字体预设已保存！');
  }


  async function deleteFontPreset() {
    const selectEl = document.getElementById('font-preset-select');
    const selectedId = parseInt(selectEl.value);

    if (isNaN(selectedId)) {
      alert('请先从下拉框中选择一个要删除的预设。');
      return;
    }

    const preset = await db.appearancePresets.get(selectedId);
    if (!preset) return;

    const confirmed = await showCustomConfirm('删除预设', `确定要删除预设 "${preset.name}" 吗？`, {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.appearancePresets.delete(selectedId);
      await loadFontPresetsDropdown();
      alert('预设已删除。');
    }
  }


// ========== 外观预设管理 ==========

  // 找到这个函数并替换
  async function loadAppearancePresetsDropdown(forceSelectedId = null) {
    const selectEl = document.getElementById('appearance-preset-select');
    if (!selectEl) return; // 防御性检查：元素不存在时直接返回
    selectEl.innerHTML = '<option value="">-- 选择一个预设 --</option>';

    const presets = await db.appearancePresets.where('type').equals('appearance').toArray();
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      selectEl.appendChild(option);
    });

    // 如果传入了强制选中的ID，直接选中它，不再进行复杂的对比
    if (forceSelectedId) {
      selectEl.value = forceSelectedId;
      return;
    }

    // 只有在没有强制选中时，才执行原来的自动匹配逻辑
    const currentSettings = {
      wallpaper: state.globalSettings.wallpaper,
      cphoneWallpaper: state.globalSettings.cphoneWallpaper,
      globalChatBackground: state.globalSettings.globalChatBackground,
      appIcons: state.globalSettings.appIcons,
      cphoneAppIcons: state.globalSettings.cphoneAppIcons,
      myphoneAppIcons: state.globalSettings.myphoneAppIcons,
      chatActionButtonsOrder: state.globalSettings.chatActionButtonsOrder,
      theme: localStorage.getItem('ephone-theme') || 'light',
      showStatusBar: state.globalSettings.showStatusBar,
      notificationSoundUrl: state.globalSettings.notificationSoundUrl,
      widgetData: state.globalSettings.widgetData
    };

    let matchingPresetId = null;

    for (const preset of presets) {
      if (JSON.stringify(preset.value) === JSON.stringify(currentSettings)) {
        matchingPresetId = preset.id;
        break;
      }
    }

    if (matchingPresetId) {
      selectEl.value = matchingPresetId;
    } else {
      selectEl.value = '';
    }
  }



  // 找到这个函数并替换
  async function handleAppearancePresetSelectionChange() {
    const selectEl = document.getElementById('appearance-preset-select');
    const selectedId = parseInt(selectEl.value);
    if (isNaN(selectedId)) return;

    const preset = await db.appearancePresets.get(selectedId);
    if (preset && preset.value) {
      const data = preset.value;

      // 1. 智能合并图标（保留上一轮的修复）
      const mergedAppIcons = {
        ...DEFAULT_APP_ICONS,
        ...(data.appIcons || {})
      };
      const mergedCPhoneIcons = {
        ...DEFAULT_CPHONE_ICONS,
        ...(data.cphoneAppIcons || {})
      };
      const mergedMyPhoneIcons = {
        ...DEFAULT_MYPHONE_ICONS,
        ...(data.myphoneAppIcons || {})
      };

      Object.assign(state.globalSettings, data);
      state.globalSettings.appIcons = mergedAppIcons;
      state.globalSettings.cphoneAppIcons = mergedCPhoneIcons;
      state.globalSettings.myphoneAppIcons = mergedMyPhoneIcons;

      applyTheme(data.theme || 'light');
      await db.globalSettings.put(state.globalSettings);

      applyGlobalWallpaper();
      applyCPhoneWallpaper();
      applyMyPhoneWallpaper();
      renderIconSettings();
      renderCPhoneIconSettings();
      renderMyPhoneIconSettings();
      applyAppIcons();
      applyCPhoneAppIcons();
      applyMyPhoneAppIconsGlobal();
      applyStatusBarVisibility();
      applyWidgetData();

      if (data.chatActionButtonsOrder) {
        renderButtonOrderEditor();
        applyButtonOrder();
      }

      // 【关键修改】：调用 renderWallpaperScreen 时传入 selectedId
      // 这样下拉框就会被强制设置为当前选中的预设，而不会跳回"请选择"
      renderWallpaperScreen(selectedId);

      alert(`已成功加载外观预设："${preset.name}"\n(缺失的新App图标已自动重置为默认)`);
    }
  }


  async function saveAppearancePreset() {
    const name = await showCustomPrompt('保存外观预设', '请输入预设名称');
    if (!name || !name.trim()) return;


    const appearanceData = {
      wallpaper: state.globalSettings.wallpaper,
      cphoneWallpaper: state.globalSettings.cphoneWallpaper,
      globalChatBackground: state.globalSettings.globalChatBackground,
      appIcons: state.globalSettings.appIcons,
      cphoneAppIcons: state.globalSettings.cphoneAppIcons,
      myphoneAppIcons: state.globalSettings.myphoneAppIcons,
      chatActionButtonsOrder: state.globalSettings.chatActionButtonsOrder,
      theme: localStorage.getItem('ephone-theme') || 'light',
      showStatusBar: state.globalSettings.showStatusBar,
      notificationSoundUrl: state.globalSettings.notificationSoundUrl,
      widgetData: state.globalSettings.widgetData
    };


    const existingPreset = await db.appearancePresets.where({
      name: name.trim(),
      type: 'appearance'
    }).first();
    if (existingPreset) {
      const confirmed = await showCustomConfirm('覆盖预设', `名为 "${name.trim()}" 的预设已存在。要覆盖它吗？`, {
        confirmButtonClass: 'btn-danger'
      });
      if (!confirmed) return;

      await db.appearancePresets.update(existingPreset.id, {
        value: appearanceData
      });
    } else {
      await db.appearancePresets.add({
        name: name.trim(),
        type: 'appearance',
        value: appearanceData
      });
    }


    await loadAppearancePresetsDropdown();
    alert('外观预设已保存！');
  }


  async function deleteAppearancePreset() {
    const selectEl = document.getElementById('appearance-preset-select');
    const selectedId = parseInt(selectEl.value);

    if (isNaN(selectedId)) {
      alert('请先从下拉框中选择一个要删除的预设。');
      return;
    }

    const preset = await db.appearancePresets.get(selectedId);
    if (!preset) return;

    const confirmed = await showCustomConfirm('删除预设', `确定要删除预设 "${preset.name}" 吗？`, {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.appearancePresets.delete(selectedId);
      await loadAppearancePresetsDropdown();
      alert('预设已删除。');
    }
  }


// ========== 主题预设管理 ==========

  async function loadThemePresetsDropdown() {
    const selectEl = document.getElementById('theme-preset-select');
    selectEl.innerHTML = '<option value="">-- 选择一个预设 --</option>';

    const presets = await db.appearancePresets.where('type').equals('bubble_theme').toArray();
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      selectEl.appendChild(option);
    });
  }


  async function handleThemePresetSelectionChange() {
    const selectEl = document.getElementById('theme-preset-select');
    const selectedId = parseInt(selectEl.value);
    if (isNaN(selectedId)) return;

    const preset = await db.appearancePresets.get(selectedId);
    if (preset) {


      const baseTheme = preset.value.base || 'default';
      const customCss = preset.value.custom || '';


      const themeRadio = document.querySelector(`input[name="theme-select"][value="${baseTheme}"]`);
      if (themeRadio) {
        themeRadio.checked = true;
      }


      const customCssInput = document.getElementById('custom-css-input');
      customCssInput.value = customCss;


      updateSettingsPreview();

    }
  }


  async function saveThemePreset() {
    const name = await showCustomPrompt('保存主题预设', '请输入预设名称');
    if (!name || !name.trim()) return;



    const selectedThemeRadio = document.querySelector('input[name="theme-select"]:checked');
    const themeValue = selectedThemeRadio ? selectedThemeRadio.value : 'default';


    const cssValue = document.getElementById('custom-css-input').value.trim();


    const presetValueObject = {
      base: themeValue,
      custom: cssValue
    };


    const existingPreset = await db.appearancePresets.where({
      name: name.trim(),
      type: 'bubble_theme'
    }).first();
    if (existingPreset) {
      const confirmed = await showCustomConfirm('覆盖预设', `名为 "${name.trim()}" 的预设已存在。要覆盖它吗？`, {
        confirmButtonClass: 'btn-danger'
      });
      if (!confirmed) return;


      await db.appearancePresets.update(existingPreset.id, {
        value: presetValueObject
      });
    } else {
      await db.appearancePresets.add({
        name: name.trim(),
        type: 'bubble_theme',

        value: presetValueObject
      });
    }

    await loadThemePresetsDropdown();
    alert('主题预设已保存！');
  }


  async function deleteThemePreset() {
    const selectEl = document.getElementById('theme-preset-select');
    const selectedId = parseInt(selectEl.value);

    if (isNaN(selectedId)) {
      alert('请先从下拉框中选择一个要删除的预设。');
      return;
    }

    const preset = await db.appearancePresets.get(selectedId);
    if (!preset) return;

    const confirmed = await showCustomConfirm('删除预设', `确定要删除预设 "${preset.name}" 吗？`, {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.appearancePresets.delete(selectedId);
      await loadThemePresetsDropdown();
      alert('预设已删除。');
    }
  }

// ========== 预设管理功能（从 script.js 补充拆分，原第 47706~48160 行） ==========

  let editingPresetId = null;

  async function openPresetScreen() {
    await renderPresetScreen();
    showScreen('preset-screen');
  }

  async function renderPresetScreen() {
    const tabsContainer = document.getElementById('preset-tabs');
    const contentContainer = document.getElementById('preset-content-container');
    tabsContainer.innerHTML = '';
    contentContainer.innerHTML = '';

    const [presets, categories] = await Promise.all([
      db.presets.toArray(),
      db.presetCategories.orderBy('name').toArray()
    ]);

    state.presets = presets;

    if (presets.length === 0) {
      contentContainer.innerHTML = '<p style="text-align:center; color: #8a8a8a; margin-top: 50px;">点击右上角 "+" 创建你的第一个预设</p>';
      return;
    }

    const allTab = document.createElement('button');
    allTab.className = 'world-book-tab active';
    allTab.textContent = '全部';
    allTab.dataset.categoryId = 'all';
    tabsContainer.appendChild(allTab);

    const allPane = document.createElement('div');
    allPane.className = 'world-book-category-pane active';
    allPane.dataset.categoryId = 'all';
    contentContainer.appendChild(allPane);

    categories.forEach(category => {
      const categoryTab = document.createElement('button');
      categoryTab.className = 'world-book-tab';
      categoryTab.textContent = category.name;
      categoryTab.dataset.categoryId = String(category.id);
      tabsContainer.appendChild(categoryTab);

      const categoryPane = document.createElement('div');
      categoryPane.className = 'world-book-category-pane';
      categoryPane.dataset.categoryId = String(category.id);
      contentContainer.appendChild(categoryPane);
    });

    const hasUncategorized = presets.some(p => !p.categoryId);
    if (hasUncategorized) {
      const uncategorizedTab = document.createElement('button');
      uncategorizedTab.className = 'world-book-tab';
      uncategorizedTab.textContent = '未分类';
      uncategorizedTab.dataset.categoryId = 'uncategorized';
      tabsContainer.appendChild(uncategorizedTab);

      const uncategorizedPane = document.createElement('div');
      uncategorizedPane.className = 'world-book-category-pane';
      uncategorizedPane.dataset.categoryId = 'uncategorized';
      contentContainer.appendChild(uncategorizedPane);
    }

    presets.forEach(preset => {
      const contentPreview = `该预设包含 ${preset.content.length} 个条目。`;

      const card = document.createElement('div');
      card.className = 'world-book-card';
      card.innerHTML = `
            <div class="card-title">${preset.name}</div>
            <div class="card-content-preview">${contentPreview}</div>
        `;

      const cardClickHandler = () => openPresetEditor(preset.id);
      const cardLongPressHandler = async () => {
        const confirmed = await showCustomConfirm('删除预设', `确定要删除《${preset.name}》吗？`, {
          confirmButtonClass: 'btn-danger'
        });
        if (confirmed) {
          await db.presets.delete(preset.id);
          state.presets = await db.presets.toArray();
          renderPresetScreen();
        }
      };

      card.addEventListener('click', cardClickHandler);
      addLongPressListener(card, cardLongPressHandler);

      const clonedCardForAll = card.cloneNode(true);
      clonedCardForAll.addEventListener('click', cardClickHandler);
      addLongPressListener(clonedCardForAll, cardLongPressHandler);
      allPane.appendChild(clonedCardForAll);

      const categoryKey = preset.categoryId ? String(preset.categoryId) : 'uncategorized';
      const targetPane = contentContainer.querySelector(`.world-book-category-pane[data-category-id="${categoryKey}"]`);
      if (targetPane) {
        targetPane.appendChild(card);
      }
    });

    document.querySelectorAll('#preset-tabs .world-book-tab').forEach(tab => {
      tab.addEventListener('click', () => switchPresetCategory(tab.dataset.categoryId));
    });
  }

  function switchPresetCategory(categoryId) {
    document.querySelectorAll('#preset-tabs .world-book-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.categoryId === categoryId);
    });
    document.querySelectorAll('#preset-content-container .world-book-category-pane').forEach(pane => {
      pane.classList.toggle('active', pane.dataset.categoryId === categoryId);
    });
  }

  async function openPresetEditor(presetId) {
    showScreen('preset-editor-screen');
    editingPresetId = presetId;

    try {
      const [preset, categories] = await Promise.all([
        db.presets.get(presetId),
        db.presetCategories.toArray()
      ]);

      if (!preset) {
        console.error("错误：尝试打开一个不存在的预设，ID:", presetId);
        await showCustomAlert("加载失败", "找不到这个预设的详细信息。");
        showScreen('preset-screen');
        return;
      }

      setTimeout(() => {
        document.getElementById('preset-editor-title').textContent = preset.name;
        document.getElementById('preset-name-input').value = preset.name;

        const selectEl = document.getElementById('preset-category-select');
        selectEl.innerHTML = '<option value="">-- 未分类 --</option>';
        categories.forEach(cat => {
          const option = document.createElement('option');
          option.value = cat.id;
          option.textContent = cat.name;
          if (preset.categoryId === cat.id) option.selected = true;
          selectEl.appendChild(option);
        });

        const entriesContainer = document.getElementById('preset-entries-container');
        entriesContainer.innerHTML = '';
        if (Array.isArray(preset.content) && preset.content.length > 0) {
          preset.content.forEach(entry => {
            const block = createPresetEntryBlock(entry);
            entriesContainer.appendChild(block);
          });
        } else {
          entriesContainer.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 20px;">还没有内容，点击下方按钮添加第一条吧！</p>';
        }
      }, 50);

    } catch (error) {
      console.error("打开预设编辑器时发生严重错误:", error);
      await showCustomAlert("加载失败", `加载预设详情时发生错误: ${error.message}`);
      showScreen('preset-screen');
    }
  }

  function createPresetEntryBlock(entry = {
    keys: [],
    comment: '',
    content: '',
    enabled: true
  }) {
    const block = document.createElement('div');
    block.className = 'message-editor-block';
    const isChecked = entry.enabled !== false ? 'checked' : '';

    block.innerHTML = `
        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-bottom: 5px;">
            <label class="toggle-switch" title="启用/禁用此条目">
                <input type="checkbox" class="entry-enabled-switch" ${isChecked}>
                <span class="slider"></span>
            </label>
            <button type="button" class="delete-block-btn" title="删除此条目">×</button>
        </div>
        <div class="form-group" style="margin-bottom: 10px;">
            <label style="font-size: 0.8em;">备注 (可选)</label>
            <input type="text" class="entry-comment-input" value="${entry.comment || ''}" placeholder="例如：角色核心设定" style="padding: 8px;">
        </div>
        <div class="form-group" style="margin-bottom: 10px;">
            <label style="font-size: 0.8em;">关键词 (用英文逗号,分隔)</label>
            <input type="text" class="entry-keys-input" value="${(entry.keys || []).join(', ')}" placeholder="例如: key1, key2" style="padding: 8px;">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 0.8em; display: flex; justify-content: space-between; align-items: center;">
                <span>内容 (点击右侧展开)</span>
                <button type="button" class="toggle-content-btn">展开</button>
            </label>
            <div class="entry-content-container">
                 <textarea class="entry-content-textarea" rows="8" style="width: 100%; font-size: 14px;">${entry.content || ''}</textarea>
            </div>
        </div>
    `;

    block.querySelector('.delete-block-btn').addEventListener('click', () => block.remove());

    const toggleBtn = block.querySelector('.toggle-content-btn');
    const contentContainer = block.querySelector('.entry-content-container');
    toggleBtn.addEventListener('click', () => {
      const isHidden = contentContainer.style.display === 'none';
      contentContainer.style.display = isHidden ? 'block' : 'none';
      toggleBtn.textContent = isHidden ? '收起' : '展开';
    });

    return block;
  }

  async function openPresetCategoryManager() {
    await renderPresetCategoriesInManager();

    document.querySelector('#group-management-modal .modal-header span').textContent = '管理预设分类';
    document.getElementById('add-new-group-btn').onclick = addNewPresetCategory;
    document.getElementById('existing-groups-list').onclick = (e) => {
      if (e.target.classList.contains('delete-group-btn')) {
        deletePresetCategory(parseInt(e.target.dataset.id));
      }
    };
    document.getElementById('close-group-manager-btn').onclick = () => {
      document.getElementById('group-management-modal').classList.remove('visible');
      renderPresetScreen();
    };
    document.getElementById('group-management-modal').classList.add('visible');
  }

  async function renderPresetCategoriesInManager() {
    const listEl = document.getElementById('existing-groups-list');
    const categories = await db.presetCategories.toArray();
    listEl.innerHTML = '';
    if (categories.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有任何分类</p>';
    }
    categories.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'existing-group-item';
      item.innerHTML = `<span class="group-name">${cat.name}</span><span class="delete-group-btn" data-id="${cat.id}">×</span>`;
      listEl.appendChild(item);
    });
  }

  async function addNewPresetCategory() {
    const input = document.getElementById('new-group-name-input');
    const name = input.value.trim();
    if (!name) return alert('分类名不能为空！');
    const existing = await db.presetCategories.where('name').equals(name).first();
    if (existing) return alert(`分类 "${name}" 已经存在了！`);
    await db.presetCategories.add({ name });
    input.value = '';
    await renderPresetCategoriesInManager();
  }

  async function deletePresetCategory(categoryId) {
    const confirmed = await showCustomConfirm('确认删除', '删除分类后，该分类下的所有预设将变为"未分类"。确定吗？', {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.presetCategories.delete(categoryId);
      await db.presets.where('categoryId').equals(categoryId).modify({ categoryId: null });
      state.presets = await db.presets.toArray();
      await renderPresetCategoriesInManager();
    }
  }

  async function handlePresetImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      if (!file.name.endsWith('.json')) {
        throw new Error("文件格式不支持。请选择 .json 格式的 Tavern 预设文件。");
      }

      const text = await file.text();
      const tavernData = JSON.parse(text);
      await importTavernPresetFile(tavernData, file.name);

    } catch (error) {
      console.error("预设导入失败:", error);
      await showCustomAlert("导入失败", `无法解析预设文件。\n错误: ${error.message}`);
    } finally {
      event.target.value = null;
    }
  }

  async function importTavernPresetFile(tavernData, fileName) {
    let newEntries = [];

    if (Array.isArray(tavernData.prompts) && Array.isArray(tavernData.prompt_order) && tavernData.prompt_order.length > 0) {
      console.log("检测到 Tavern/SillyTavern 预设格式，将严格按照 prompt_order 排序。");
      const promptsMap = new Map(tavernData.prompts.map(p => [p.identifier, p]));
      const orderArray = tavernData.prompt_order.reduce((acc, curr) => (
        (curr.order && curr.order.length > (acc.length || 0)) ? curr.order : acc
      ), []);

      if (orderArray && orderArray.length > 0) {
        newEntries = orderArray
          .map(orderItem => {
            const promptData = promptsMap.get(orderItem.identifier);
            if (promptData) {
              return {
                keys: [],
                comment: promptData.name || '无标题',
                content: promptData.content || '',
                enabled: orderItem.enabled
              };
            }
            return null;
          })
          .filter(Boolean);
      }
    } else if (tavernData.entries && typeof tavernData.entries === 'object') {
      if (Array.isArray(tavernData.order)) {
        newEntries = tavernData.order
          .map(key => tavernData.entries[key])
          .filter(Boolean)
          .map(entry => ({
            keys: entry.key || [],
            comment: entry.comment || '无备注',
            content: entry.content || '',
            enabled: !entry.disable
          }));
      } else {
        newEntries = Object.values(tavernData.entries).map(entry => ({
          keys: entry.key || [],
          comment: entry.comment || '无备注',
          content: entry.content || '',
          enabled: !entry.disable
        }));
      }
    } else if (Array.isArray(tavernData.prompts)) {
      newEntries = tavernData.prompts.map(prompt => ({
        keys: [],
        comment: prompt.name || '无标题',
        content: prompt.content || '',
        enabled: true
      }));
    } else {
      throw new Error("文件格式无法识别。未找到有效的 'prompts' 数组或 'entries' 对象。");
    }

    newEntries = newEntries.filter(entry => entry.content);

    if (newEntries.length === 0) {
      alert("这个预设文件中没有找到任何有效的提示词条目。");
      return;
    }

    const presetNameSuggestion = fileName.replace(/\.json$/i, '');
    const newPresetName = await showCustomPrompt("导入 Tavern 预设", "请为这组提示词预设命名：", presetNameSuggestion);
    if (!newPresetName || !newPresetName.trim()) {
      alert("导入已取消，因为未提供名称。");
      return;
    }

    const newPreset = {
      id: 'preset_' + Date.now(),
      name: newPresetName.trim(),
      content: newEntries,
      categoryId: null
    };

    await db.presets.add(newPreset);
    state.presets.push(newPreset);

    await renderPresetScreen();
    await showCustomAlert('导入成功！', `已成功从文件导入预设《${newPresetName}》。`);
  }

  async function renderOfflinePresetSelector(chat) {
    const selectEl = document.getElementById('offline-preset-select');
    if (!selectEl) return;

    const presets = state.presets || [];

    selectEl.innerHTML = '<option value="">-- 不使用预设 --</option>';
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      selectEl.appendChild(option);
    });

    if (chat.settings.offlinePresetId) {
      selectEl.value = chat.settings.offlinePresetId;
    }
  }

// ========== 设置预览（从 script.js 补充拆分，原第 23278~23369 行） ==========

  async function updateSettingsPreview() {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    const previewArea = document.getElementById('settings-preview-area');
    if (!previewArea) return;

    const selectedTheme = document.querySelector('input[name="theme-select"]:checked')?.value || 'default';
    const fontSize = document.getElementById('chat-font-size-slider').value;
    const customCss = document.getElementById('custom-css-input').value;
    const background = chat.settings.background;

    previewArea.dataset.theme = selectedTheme;
    previewArea.style.setProperty('--chat-font-size', `${fontSize}px`);

    if (background && background.startsWith('data:image')) {
      previewArea.style.backgroundImage = `url(${background})`;
      previewArea.style.backgroundColor = 'transparent';
    } else {
      previewArea.style.backgroundImage = 'none';
      previewArea.style.background = background || '#f0f2f5';
    }

    previewArea.innerHTML = '';

    const aiMsg = {
      role: 'ai',
      content: '对方消息预览',
      timestamp: 1,
      senderName: chat.name
    };
    const aiBubble = await createMessageElement(aiMsg, chat);
    if (aiBubble) previewArea.appendChild(aiBubble);

    const userMsg = {
      role: 'user',
      content: '我的消息预览',
      timestamp: 2
    };
    const userBubble = await createMessageElement(userMsg, chat);
    if (userBubble) previewArea.appendChild(userBubble);

    const previewLyricsBar = document.createElement('div');
    previewLyricsBar.style.cssText = `
                position: absolute; 
                font-size: 11px; 
                padding: 2px 6px; 
                border-radius: 8px; 
                background-color: rgba(0, 0, 0, 0.1); 
                color: var(--text-secondary); 
                white-space: nowrap; 
                transition: all 0.3s ease;
            `;
    previewLyricsBar.textContent = '♪ 歌词位置预览 ♪';
    previewArea.appendChild(previewLyricsBar);

    const vertical = document.getElementById('lyrics-vertical-pos').value;
    const horizontal = document.getElementById('lyrics-horizontal-pos').value;
    const offset = parseInt(document.getElementById('lyrics-offset-input').value) || 10;

    if (vertical === 'top') {
      previewLyricsBar.style.top = `${offset}px`;
    } else {
      previewLyricsBar.style.bottom = `${offset}px`;
    }

    switch (horizontal) {
      case 'left':
        previewLyricsBar.style.left = '15px';
        break;
      case 'right':
        previewLyricsBar.style.right = '15px';
        break;
      default:
        previewLyricsBar.style.left = '50%';
        previewLyricsBar.style.transform = 'translateX(-50%)';
        break;
    }

    applyScopedCss(customCss, '#settings-preview-area', 'preview-bubble-style');
  }

  // ========== 全局暴露 ==========
  window.handlePresetSelectionChange = handlePresetSelectionChange;
  window.saveApiPreset = saveApiPreset;
  window.deleteApiPreset = deleteApiPreset;
  window.handleSoundPresetSelectionChange = handleSoundPresetSelectionChange;
  window.saveSoundPreset = saveSoundPreset;
  window.deleteSoundPreset = deleteSoundPreset;
  window.handleCssPresetSelectionChange = handleCssPresetSelectionChange;
  window.saveCssPreset = saveCssPreset;
  window.deleteCssPreset = deleteCssPreset;
  window.handleFontPresetSelectionChange = handleFontPresetSelectionChange;
  window.saveFontPreset = saveFontPreset;
  window.deleteFontPreset = deleteFontPreset;
  window.handleAppearancePresetSelectionChange = handleAppearancePresetSelectionChange;
  window.saveAppearancePreset = saveAppearancePreset;
  window.deleteAppearancePreset = deleteAppearancePreset;
  window.handleThemePresetSelectionChange = handleThemePresetSelectionChange;
  window.saveThemePreset = saveThemePreset;
  window.deleteThemePreset = deleteThemePreset;
  window.handlePresetImport = handlePresetImport;
  window.renderPresetScreen = renderPresetScreen;
  window.renderOfflinePresetSelector = renderOfflinePresetSelector;
  window.openPresetCategoryManager = openPresetCategoryManager;
  window.applyGlobalWallpaper = applyGlobalWallpaper;
  window.loadSoundPresetsDropdown = loadSoundPresetsDropdown;
  window.loadThemePresetsDropdown = loadThemePresetsDropdown;
