// ============================================================
// nai-imagen.js — NovelAI 预设管理 / 生图 + Google Imagen 生图
// 来源：script.js 第 7681 ~ 8889 行
// ============================================================

// --- 新增 NAI 预设相关函数 ---

  // 1. 加载预设下拉菜单
  async function loadNaiPresetsDropdown() {
    const selectEl = document.getElementById('nai-preset-select');
    // 保留第一个选项
    selectEl.innerHTML = '<option value="">-- 当前临时设置 --</option>';

    const presets = await db.naiPresets.toArray();
    presets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      selectEl.appendChild(opt);
    });

    // 恢复选中状态
    if (currentNaiPresetId) {
      selectEl.value = currentNaiPresetId;
      updateNaiPresetButtons(true);
    } else {
      updateNaiPresetButtons(false);
    }
  }

  // 2. 更新按钮显示状态
  // 2. 更新按钮显示状态 (更新这个函数)
  function updateNaiPresetButtons(hasSelection) {
    const updateBtn = document.getElementById('update-nai-preset-btn');
    const bindBtn = document.getElementById('bind-nai-preset-btn');
    const deleteBtn = document.getElementById('delete-nai-preset-btn');
    const saveBtn = document.getElementById('save-nai-preset-btn');

    if (hasSelection) {
      updateBtn.style.display = 'block';
      bindBtn.style.display = 'block';
      deleteBtn.style.display = 'block';
      // 改动：选中状态下显示"另存" (2个字)
      saveBtn.textContent = '另存';
    } else {
      updateBtn.style.display = 'none';
      bindBtn.style.display = 'none';
      deleteBtn.style.display = 'none';
      // 改动：未选中状态下显示"新增" (2个字)
      saveBtn.textContent = '新增';
    }
  }

  // 3. 收集当前界面上的所有设置
  function gatherNaiUiSettings() {
    return {
      resolution: document.getElementById('nai-resolution').value,
      steps: parseInt(document.getElementById('nai-steps').value),
      cfg_scale: parseFloat(document.getElementById('nai-cfg-scale').value),
      sampler: document.getElementById('nai-sampler').value,
      seed: parseInt(document.getElementById('nai-seed').value),
      uc_preset: parseInt(document.getElementById('nai-uc-preset').value),
      quality_toggle: document.getElementById('nai-quality-toggle').checked,
      smea: document.getElementById('nai-smea').checked,
      smea_dyn: document.getElementById('nai-smea-dyn').checked,
      default_positive: document.getElementById('nai-default-positive').value,
      default_negative: document.getElementById('nai-default-negative').value,
      // 注意：API Key 和 Proxy 这种敏感/全局配置通常不存入风格预设，但你可以根据需求决定
      // 这里为了风格切换方便，我们只存参数，Key 和 Proxy 还是走全局
    };
  }

  // 4. 应用设置到 UI
  function applyNaiUiSettings(settings) {
    if (!settings) return;
    document.getElementById('nai-resolution').value = settings.resolution || '1024x1024';
    document.getElementById('nai-steps').value = settings.steps || 28;
    document.getElementById('nai-cfg-scale').value = settings.cfg_scale || 5;
    document.getElementById('nai-sampler').value = settings.sampler || 'k_euler_ancestral';
    document.getElementById('nai-seed').value = settings.seed ?? -1;
    document.getElementById('nai-uc-preset').value = settings.uc_preset || 1;
    document.getElementById('nai-quality-toggle').checked = settings.quality_toggle !== false;
    document.getElementById('nai-smea').checked = settings.smea !== false;
    document.getElementById('nai-smea-dyn').checked = settings.smea_dyn || false;
    document.getElementById('nai-default-positive').value = settings.default_positive || '';
    document.getElementById('nai-default-negative').value = settings.default_negative || '';
  }

  // 5. 保存/新建预设
  async function handleSaveNaiPreset(isUpdate = false) {
    const settings = gatherNaiUiSettings();

    if (isUpdate && currentNaiPresetId) {
      const confirmed = await showCustomConfirm("更新预设", "确定要覆盖当前预设的参数吗？");
      if (!confirmed) return;

      await db.naiPresets.update(parseInt(currentNaiPresetId), { settings });
      alert("预设已更新！");
    } else {
      const name = await showCustomPrompt("新建预设", "请输入预设名称（例如：厚涂风、像素风）");
      if (!name) return;

      const id = await db.naiPresets.add({ name, settings });
      currentNaiPresetId = id;
      await loadNaiPresetsDropdown();
      alert("预设已创建！");
    }
  }

  // 6. 删除预设
  async function handleDeleteNaiPreset() {
    if (!currentNaiPresetId) return;
    const confirmed = await showCustomConfirm("删除预设", "确定要删除此预设吗？绑定了此预设的角色将回退到全局设置。", { confirmButtonClass: 'btn-danger' });
    if (!confirmed) return;

    await db.naiPresets.delete(parseInt(currentNaiPresetId));

    // 清除所有聊天中的绑定引用
    const allChats = await db.chats.toArray();
    for (const chat of allChats) {
      if (chat.settings?.naiPresetId === parseInt(currentNaiPresetId)) {
        delete chat.settings.naiPresetId;
        await db.chats.put(chat);
      }
    }

    currentNaiPresetId = null;
    await loadNaiPresetsDropdown();
  }

  // 7. 处理下拉框切换
  async function handleNaiPresetChange(e) {
    const val = e.target.value;
    if (val) {
      currentNaiPresetId = parseInt(val);
      const preset = await db.naiPresets.get(currentNaiPresetId);
      if (preset && preset.settings) {
        applyNaiUiSettings(preset.settings);
      }
      updateNaiPresetButtons(true);
    } else {
      currentNaiPresetId = null;
      updateNaiPresetButtons(false);
      // 恢复到 localStorage 里的全局设置
      loadNovelAISettings();
    }
  }

  // 8. 打开绑定弹窗
  async function openNaiBindingModal() {
    if (!currentNaiPresetId) return;
    const preset = await db.naiPresets.get(parseInt(currentNaiPresetId));
    if (!preset) return;

    const modal = document.getElementById('nai-binding-modal');
    const listEl = document.getElementById('nai-binding-list');
    const titleEl = modal.querySelector('.modal-header span');

    titleEl.textContent = `将预设"${preset.name}"绑定到...`;
    listEl.innerHTML = '';

    const allChats = Object.values(state.chats).sort((a, b) => a.name.localeCompare(b.name));

    allChats.forEach(chat => {
      const isBound = chat.settings?.naiPresetId === currentNaiPresetId;

      const item = document.createElement('div');
      item.className = 'contact-picker-item'; // 复用样式
      item.innerHTML = `
            <input type="checkbox" class="nai-binding-checkbox" data-chat-id="${chat.id}" ${isBound ? 'checked' : ''} style="margin-right: 15px;">
            <img src="${chat.isGroup ? chat.settings.groupAvatar : chat.settings.aiAvatar || defaultAvatar}" class="avatar">
            <div style="display:flex; flex-direction:column;">
                <span class="name">${chat.name}</span>
                ${isBound ? '<span style="font-size:10px; color:green;">已绑定</span>' : ''}
            </div>
        `;
      // 点击行切换
      item.addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox') {
          const cb = item.querySelector('input');
          cb.checked = !cb.checked;
        }
      });
      listEl.appendChild(item);
    });

    modal.classList.add('visible');
  }

  // 9. 保存绑定
  async function saveNaiBinding() {
    if (!currentNaiPresetId) return;

    const checkboxes = document.querySelectorAll('.nai-binding-checkbox');
    const updates = [];

    for (const cb of checkboxes) {
      const chatId = cb.dataset.chatId;
      const chat = state.chats[chatId];
      const shouldBind = cb.checked;

      if (chat) {
        if (shouldBind) {
          // 如果勾选，绑定当前预设
          if (chat.settings.naiPresetId !== currentNaiPresetId) {
            chat.settings.naiPresetId = currentNaiPresetId;
            updates.push(chat);
          }
        } else {
          // 如果取消勾选，且当前正是绑定了这个预设，则解绑
          if (chat.settings.naiPresetId === currentNaiPresetId) {
            delete chat.settings.naiPresetId;
            updates.push(chat);
          }
        }
      }
    }

    if (updates.length > 0) {
      await db.chats.bulkPut(updates);
      await showCustomAlert("保存成功", `已更新 ${updates.length} 个角色的绑定设置。`);
    } else {
      // 无变化
    }

    document.getElementById('nai-binding-modal').classList.remove('visible');
  }

  function loadNovelAISettings() {
    const settings = getNovelAISettings();
    document.getElementById('nai-resolution').value = settings.resolution;
    document.getElementById('nai-steps').value = settings.steps;
    document.getElementById('nai-cfg-scale').value = settings.cfg_scale;
    document.getElementById('nai-sampler').value = settings.sampler;
    document.getElementById('nai-seed').value = settings.seed;
    document.getElementById('nai-uc-preset').value = settings.uc_preset;
    document.getElementById('nai-quality-toggle').checked = settings.quality_toggle;
    document.getElementById('nai-smea').checked = settings.smea;
    document.getElementById('nai-smea-dyn').checked = settings.smea_dyn;
    document.getElementById('nai-default-positive').value = settings.default_positive;
    document.getElementById('nai-default-negative').value = settings.default_negative;
    document.getElementById('nai-cors-proxy').value = settings.cors_proxy;
    document.getElementById('nai-custom-proxy-url').value = settings.custom_proxy_url || '';


    const customProxyGroup = document.getElementById('nai-custom-proxy-group');
    customProxyGroup.style.display = settings.cors_proxy === 'custom' ? 'block' : 'none';
    loadNaiPresetsDropdown();
  }

  function saveNovelAISettings() {

    const novelaiEnabled = document.getElementById('novelai-switch').checked;
    const novelaiModel = document.getElementById('novelai-model').value;
    const novelaiApiKey = document.getElementById('novelai-api-key').value.trim();

    localStorage.setItem('novelai-enabled', novelaiEnabled);
    localStorage.setItem('novelai-model', novelaiModel);
    localStorage.setItem('novelai-api-key', novelaiApiKey);


    const settings = {
      resolution: document.getElementById('nai-resolution').value,
      steps: parseInt(document.getElementById('nai-steps').value),
      cfg_scale: parseFloat(document.getElementById('nai-cfg-scale').value),
      sampler: document.getElementById('nai-sampler').value,
      seed: parseInt(document.getElementById('nai-seed').value),
      uc_preset: parseInt(document.getElementById('nai-uc-preset').value),
      quality_toggle: document.getElementById('nai-quality-toggle').checked,
      smea: document.getElementById('nai-smea').checked,
      smea_dyn: document.getElementById('nai-smea-dyn').checked,
      default_positive: document.getElementById('nai-default-positive').value,
      default_negative: document.getElementById('nai-default-negative').value,
      cors_proxy: document.getElementById('nai-cors-proxy').value,
      custom_proxy_url: document.getElementById('nai-custom-proxy-url').value
    };

    localStorage.setItem('novelai-settings', JSON.stringify(settings));
  }

  function resetNovelAISettings() {
    localStorage.removeItem('novelai-settings');
    loadNovelAISettings();
    alert('已恢复默认设置！');
  }

  // ========== Google Imagen 生图功能 ==========
  function getGoogleImagenSettings() {
    const defaultSettings = {
      model: 'imagen-4.0-generate-001',
      endpoint: 'https://generativelanguage.googleapis.com',
      aspectRatio: '1:1',
      numberOfImages: 1
    };
    const saved = localStorage.getItem('google-imagen-settings');
    if (saved) {
      try { return { ...defaultSettings, ...JSON.parse(saved) }; }
      catch (e) { return defaultSettings; }
    }
    return defaultSettings;
  }

  function saveGoogleImagenSettings() {
    const enabled = document.getElementById('google-imagen-switch').checked;
    const model = document.getElementById('google-imagen-model').value;
    const apiKey = document.getElementById('google-imagen-api-key').value.trim();
    const endpoint = document.getElementById('google-imagen-endpoint').value.trim();
    const aspectRatio = document.getElementById('google-imagen-aspect-ratio').value;

    localStorage.setItem('google-imagen-enabled', enabled);
    localStorage.setItem('google-imagen-model', model);
    localStorage.setItem('google-imagen-api-key', apiKey);

    const settings = { model, endpoint: endpoint || 'https://generativelanguage.googleapis.com', aspectRatio };
    localStorage.setItem('google-imagen-settings', JSON.stringify(settings));
  }

  async function generateGoogleImagenFromPrompt(aiPrompt) {
    console.log(`🎨 [Google Imagen] 开始生成... Prompt: "${aiPrompt}"`);

    const apiKey = localStorage.getItem('google-imagen-api-key');
    if (!apiKey) {
      throw new Error('Google Imagen API Key未配置。请在Google Imagen设置中填写API Key。');
    }

    const settings = getGoogleImagenSettings();
    const model = localStorage.getItem('google-imagen-model') || settings.model;
    const baseEndpoint = (settings.endpoint || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    const isGemini = baseEndpoint.includes('generativelanguage.googleapis.com');

    let apiUrl, requestBody, headers;

    if (isGemini) {
      // 官方 Google API → 用 :predict 端点
      apiUrl = `${baseEndpoint}/v1beta/models/${model}:predict`;
      requestBody = {
        instances: [{ prompt: aiPrompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: settings.aspectRatio || '1:1'
        }
      };
      headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': getRandomValue(apiKey)
      };
    } else {
      // 第三方中转站 → 走 OpenAI 兼容的 /v1/images/generations
      apiUrl = `${baseEndpoint}/v1/images/generations`;
      requestBody = {
        model: model,
        prompt: aiPrompt,
        response_format: 'b64_json',
        n: 1
      };
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getRandomValue(apiKey)}`
      };
    }

    console.log('🚀 发送Google Imagen请求:', apiUrl, requestBody);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 3分钟超时

    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Google Imagen 请求超时（超过3分钟），请检查网络或稍后重试。');
      }
      throw error;
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Imagen API请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log('📦 Google Imagen 响应:', JSON.stringify(data).substring(0, 500));

    // 从响应中提取 base64 图片（兼容多种格式）
    let base64Data = null;
    if (data.predictions && data.predictions.length > 0) {
      // 官方 Vertex AI / Gemini API :predict 格式
      base64Data = data.predictions[0].bytesBase64Encoded;
      // 如果被安全过滤拦截了
      if (!base64Data && data.predictions[0].raiFilteredReason) {
        throw new Error(`图片被Google安全过滤拦截: ${data.predictions[0].raiFilteredReason}`);
      }
    } else if (data.generatedImages && data.generatedImages.length > 0) {
      // Gemini SDK generateImages 格式
      const img = data.generatedImages[0].image || data.generatedImages[0];
      base64Data = img.imageBytes || img.bytesBase64Encoded;
    } else if (data.data && data.data.length > 0) {
      // OpenAI 兼容格式 - 支持 b64_json 和 url 两种
      base64Data = data.data[0].b64_json;
      if (!base64Data && data.data[0].url) {
        // 第三方中转站返回的是图片URL，直接使用
        console.log('✅ [Google Imagen] 生成成功！(URL格式)');
        return {
          imageUrl: data.data[0].url,
          fullPrompt: data.data[0].revised_prompt || aiPrompt
        };
      }
    }

    if (!base64Data) {
      throw new Error(`Google Imagen 响应中未找到图片数据。响应结构: ${JSON.stringify(Object.keys(data))}，请检查控制台日志查看完整响应。`);
    }

    const imageDataUrl = `data:image/png;base64,${base64Data}`;
    console.log('✅ [Google Imagen] 生成成功！');

    return {
      imageUrl: imageDataUrl,
      fullPrompt: aiPrompt
    };
  }

  async function testGoogleImagenGeneration() {
    const apiKey = document.getElementById('google-imagen-api-key').value.trim();
    if (!apiKey) {
      alert('请先填写 Google Imagen API Key！');
      return;
    }
    // 先保存当前设置
    saveGoogleImagenSettings();

    const testBtn = document.getElementById('google-imagen-test-btn');
    const resultDiv = document.getElementById('google-imagen-test-result');
    const resultImg = document.getElementById('google-imagen-result-image');
    testBtn.disabled = true;
    resultDiv.style.display = 'none';

    let seconds = 0;
    const timer = setInterval(() => {
      seconds++;
      testBtn.textContent = `⏳ 生成中... (${seconds}s)`;
    }, 1000);
    testBtn.textContent = '⏳ 生成中... (0s)';

    try {
      const result = await generateGoogleImagenFromPrompt('A beautiful sunset over the ocean, vibrant colors, high quality');
      resultImg.src = result.imageUrl;
      resultDiv.style.display = 'block';
      console.log('测试图片:', result.imageUrl.substring(0, 100) + '...');
    } catch (error) {
      alert('❌ Google Imagen 测试失败: ' + error.message);
      console.error('Google Imagen 测试错误:', error);
    } finally {
      clearInterval(timer);
      testBtn.disabled = false;
      testBtn.textContent = '🧪 测试生成';
    }
  }

  async function fetchGoogleImagenModels() {
    const apiKey = document.getElementById('google-imagen-api-key').value.trim();
    const endpoint = document.getElementById('google-imagen-endpoint').value.trim() || 'https://generativelanguage.googleapis.com';

    if (!apiKey || !endpoint) {
      alert('请先填写 API 地址和密钥！');
      return;
    }

    const fetchBtn = document.getElementById('google-imagen-fetch-models-btn');
    fetchBtn.disabled = true;
    fetchBtn.textContent = '⏳ 拉取中...';

    try {
      // 跟主API拉取逻辑完全一致
      const isGemini = endpoint.replace(/\/+$/, '') === GEMINI_API_URL || 
                        endpoint.includes('generativelanguage.googleapis.com');

      const fetchUrl = isGemini 
        ? `${GEMINI_API_URL}?key=${getRandomValue(apiKey)}`
        : `${endpoint.replace(/\/+$/, '')}/v1/models`;

      const fetchOptions = isGemini ? {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'omit'
      } : {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'omit',
        headers: {
          'Authorization': `Bearer ${getRandomValue(apiKey)}`,
          'Content-Type': 'application/json'
        }
      };

      console.log('🔄 [Google Imagen] 拉取模型列表:', fetchUrl);

      const response = await fetch(fetchUrl, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`拉取失败 (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      console.log('📦 模型列表响应:', data);

      // 跟主API一样的解析方式
      let models = isGemini 
        ? (data.models || []).map(model => ({ id: model.name.split('/')[1] || model.name }))
        : (data.data || []);

      if (!models || models.length === 0) {
        throw new Error('返回的模型列表为空');
      }

      const select = document.getElementById('google-imagen-model');
      const currentValue = select.value;
      select.innerHTML = '';

      models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.id;
        if (model.id === currentValue) option.selected = true;
        select.appendChild(option);
      });

      alert(`✅ 模型列表已更新，共 ${models.length} 个模型。`);

    } catch (error) {
      alert('❌ 拉取模型失败: ' + error.message);
      console.error('拉取模型错误:', error);
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.textContent = '🔄 拉取';
    }
  }
  // ========== Google Imagen 结束 ==========

  function getNovelAISettings() {
    const defaultSettings = {
      resolution: '1024x1024',
      steps: 28,
      cfg_scale: 5,
      sampler: 'k_euler_ancestral',
      seed: -1,
      uc_preset: 1,
      quality_toggle: true,
      smea: true,
      smea_dyn: false,
      default_positive: 'masterpiece, best quality, 1girl, beautiful, detailed face, detailed eyes, long hair, anime style',
      default_negative: 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry',
      cors_proxy: 'https://corsproxy.io/?',
      custom_proxy_url: ''
    };

    const saved = localStorage.getItem('novelai-settings');
    if (saved) {
      try {
        return {
          ...defaultSettings,
          ...JSON.parse(saved)
        };
      } catch (e) {
        return defaultSettings;
      }
    }
    return defaultSettings;
  }

  async function generateNaiImageFromPrompt(aiPrompt, chatId) {
      console.log(`🎨 [NAI核心生成] 开始... Prompt: "${aiPrompt}", ChatID: ${chatId}`);

      const apiKey = localStorage.getItem('novelai-api-key');
      const model = localStorage.getItem('novelai-model') || 'nai-diffusion-4-5-full';
      let settings = getNovelAISettings();
      let boundPresetSettings = null;

      // 【第1步】先检查角色有没有绑定预设，拿到预设数据
      if (chatId && state.chats[chatId] && state.chats[chatId].settings.naiPresetId) {
        const presetId = state.chats[chatId].settings.naiPresetId;
        const preset = await db.naiPresets.get(presetId);

        if (preset && preset.settings) {
          console.log(`🎨 [NAI] 检测到角色绑定了预设 "${preset.name}"，正在应用预设参数...`);
          boundPresetSettings = preset.settings;
          settings = { ...settings, ...boundPresetSettings };
        } else {
          console.warn(`[NAI] 角色绑定了预设ID ${presetId}，但数据库中未找到，将使用全局设置。`);
        }
      }

      // 【第2步】决定提示词，优先级：角色专属画师串 > 绑定预设画师串 > 全局默认
      const naiPrompts = getCharacterNAIPrompts(chatId);
      let positiveBase = naiPrompts.positive;
      let negativeBase = naiPrompts.negative;

      // 如果角色没有专属画师串，但绑定了预设且预设里有画师串，用预设的
      if (naiPrompts.source !== 'character' && boundPresetSettings) {
        if (boundPresetSettings.default_positive) {
          positiveBase = boundPresetSettings.default_positive;
          console.log('📝 使用绑定预设的正面提示词:', positiveBase);
        }
        if (boundPresetSettings.default_negative) {
          negativeBase = boundPresetSettings.default_negative;
          console.log('📝 使用绑定预设的负面提示词:', negativeBase);
        }
      }

      const finalPositivePrompt = aiPrompt + ', ' + positiveBase;
      const finalNegativePrompt = negativeBase;

      console.log(`📝 提示词来源: ${naiPrompts.source === 'character' ? '角色专属' : (boundPresetSettings ? '绑定预设' : '系统默认')}`);
      console.log('   [+] 最终正面提示词:', finalPositivePrompt);
      console.log('   [-] 最终负面提示词:', finalNegativePrompt);

      if (!apiKey) {
        throw new Error('NovelAI API Key未配置。请在NovelAI设置中填写API Key。');
      }

      const [width, height] = settings.resolution.split('x').map(Number);


      let requestBody;
      if (model.includes('nai-diffusion-4')) {
        requestBody = {
          input: finalPositivePrompt,
          model: model,
          action: 'generate',
          parameters: {
            params_version: 3,
            width: width,
            height: height,
            scale: settings.cfg_scale,
            sampler: settings.sampler,
            steps: settings.steps,
            seed: settings.seed === -1 ? Math.floor(Math.random() * 9999999999) : settings.seed,
            n_samples: 1,
            ucPreset: settings.uc_preset,
            qualityToggle: settings.quality_toggle,
            add_original_image: true,
            noise_schedule: 'karras',
            v4_prompt: {
              caption: {
                base_caption: finalPositivePrompt,
                char_captions: []
              },
              use_coords: false,
              use_order: true
            },
            v4_negative_prompt: {
              caption: {
                base_caption: finalNegativePrompt,
                char_captions: []
              },
              legacy_uc: false
            },
            negative_prompt: finalNegativePrompt,
            autoSmea: false,
            dynamic_thresholding: false,
            controlnet_strength: 1,
            legacy: false,
            cfg_rescale: 0,
            legacy_v3_extend: false,
            skip_cfg_above_sigma: null,
            use_coords: false,
            legacy_uc: false,
            normalize_reference_strength_multiple: true,
            inpaintImg2ImgStrength: 1,
            characterPrompts: [],
            deliberate_euler_ancestral_bug: false,
            prefer_brownian: true
          }
        };
      } else {

        requestBody = {
          input: finalPositivePrompt,
          model: model,
          action: 'generate',
          parameters: {
            width: width,
            height: height,
            scale: settings.cfg_scale,
            sampler: settings.sampler,
            steps: settings.steps,
            seed: settings.seed === -1 ? Math.floor(Math.random() * 9999999999) : settings.seed,
            n_samples: 1,
            ucPreset: settings.uc_preset,
            qualityToggle: settings.quality_toggle,
            sm: settings.smea,
            sm_dyn: settings.smea_dyn,
            negative_prompt: finalNegativePrompt,
            dynamic_thresholding: false,
            controlnet_strength: 1,
            legacy: false,
            add_original_image: false,
            cfg_rescale: 0,
            noise_schedule: 'native'
          }
        };
      }

      console.log('🚀 发送NAI请求:', requestBody);


      let apiUrl;
      if (model.includes('nai-diffusion-4')) {
        apiUrl = 'https://image.novelai.net/ai/generate-image-stream';
      } else {
        apiUrl = 'https://image.novelai.net/ai/generate-image';
      }

      let corsProxy = settings.cors_proxy;
      if (corsProxy === 'custom') {
        corsProxy = settings.custom_proxy_url || '';
      }
      if (corsProxy && corsProxy !== '') {
        apiUrl = corsProxy + apiUrl;
      }


      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API请求失败 (${response.status}): ${errorText}`);
      }

      const contentType = response.headers.get('content-type');
      let zipBlob;
      let imageDataUrl;


      if (contentType && contentType.includes('text/event-stream')) {

        const text = await response.text();
        const lines = text.trim().split('\n');
        let base64Data = null;

        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            const dataContent = line.substring(6);
            try {
              const jsonData = JSON.parse(dataContent);
              if (jsonData.event_type === 'final' && jsonData.image) {
                base64Data = jsonData.image;
                break;
              }
              if (jsonData.data) {
                base64Data = jsonData.data;
                break;
              }
              if (jsonData.image) {
                base64Data = jsonData.image;
                break;
              }
            } catch (e) {
              base64Data = dataContent;
              break;
            }
          }
        }
        if (!base64Data) throw new Error('无法从 SSE 响应中提取图片数据');

        const isPNG = base64Data.startsWith('iVBORw0KGgo');
        const isJPEG = base64Data.startsWith('/9j/');

        if (isPNG || isJPEG) {

          imageDataUrl = `data:${isPNG ? 'image/png' : 'image/jpeg'};base64,${base64Data}`;
        } else {

          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
          zipBlob = new Blob([bytes]);
        }
      } else {

        zipBlob = await response.blob();
      }


      if (!imageDataUrl && zipBlob) {
        if (typeof JSZip === 'undefined') throw new Error('JSZip库未加载');

        const zip = await JSZip.loadAsync(zipBlob);
        let imageFile = null;
        for (let filename in zip.files) {
          if (filename.match(/\.(png|jpg|jpeg|webp)$/i)) {
            imageFile = zip.files[filename];
            break;
          }
        }
        if (!imageFile) throw new Error('ZIP文件中未找到图片');

        const imageBlob = await imageFile.async('blob');


        imageDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(imageBlob);
        });
      }

      console.log(`✅ [NAI核心生成] 成功！`);
      return {
        imageUrl: imageDataUrl,
        fullPrompt: finalPositivePrompt
      };
    }


  function getCharacterNAIPrompts(chatId) {

    const systemSettings = getNovelAISettings();


    if (!chatId || !state.chats[chatId]) {
      console.log('⚠️ NAI提示词：没有角色，使用系统配置');
      return {
        positive: systemSettings.default_positive,
        negative: systemSettings.default_negative,
        source: 'system'
      };
    }

    const chat = state.chats[chatId];
    const naiSettings = chat.settings.naiSettings || {};


    if (naiSettings.promptSource === 'character') {
      console.log('✅ NAI提示词：使用角色配置');
      console.log('   正面:', naiSettings.characterPositivePrompt || '(空)');
      console.log('   负面:', naiSettings.characterNegativePrompt || '(空)');

      return {
        positive: naiSettings.characterPositivePrompt || '',
        negative: naiSettings.characterNegativePrompt || '',
        source: 'character'
      };
    } else {
      console.log('✅ NAI提示词：使用系统配置');
      console.log('   正面:', systemSettings.default_positive || '(空)');
      console.log('   负面:', systemSettings.default_negative || '(空)');

      return {
        positive: systemSettings.default_positive,
        negative: systemSettings.default_negative,
        source: 'system'
      };
    }
  }


  async function generateNovelAIImage() {
    const apiKey = document.getElementById('novelai-api-key').value.trim();
    const model = document.getElementById('novelai-model').value;
    const prompt = document.getElementById('nai-test-prompt').value.trim();

    if (!apiKey) {
      alert('请先配置NovelAI API Key！');
      return;
    }

    if (!prompt) {
      alert('请输入提示词！');
      return;
    }

    const settings = getNovelAISettings();
    const negativePrompt = document.getElementById('nai-test-negative').value.trim();

    const statusDiv = document.getElementById('nai-test-status');
    const resultDiv = document.getElementById('nai-test-result');
    const errorDiv = document.getElementById('nai-test-error');
    const generateBtn = document.getElementById('nai-generate-btn');

    statusDiv.style.display = 'block';
    resultDiv.style.display = 'none';
    errorDiv.style.display = 'none';
    generateBtn.disabled = true;
    generateBtn.textContent = '生成中...';

    try {
      const [width, height] = settings.resolution.split('x').map(Number);


      let requestBody;

      if (model.includes('nai-diffusion-4')) {

        requestBody = {
          input: prompt,
          model: model,
          action: 'generate',
          parameters: {
            params_version: 3, // V4必须使用版本3
            width: width,
            height: height,
            scale: settings.cfg_scale,
            sampler: settings.sampler,
            steps: settings.steps,
            seed: settings.seed === -1 ? Math.floor(Math.random() * 9999999999) : settings.seed,
            n_samples: 1,
            ucPreset: settings.uc_preset,
            qualityToggle: settings.quality_toggle,
            autoSmea: false,
            dynamic_thresholding: false,
            controlnet_strength: 1,
            legacy: false,
            add_original_image: true,
            cfg_rescale: 0,
            noise_schedule: 'karras', // V4使用karras
            legacy_v3_extend: false,
            skip_cfg_above_sigma: null,
            use_coords: false,
            legacy_uc: false,
            normalize_reference_strength_multiple: true,
            inpaintImg2ImgStrength: 1,
            characterPrompts: [],

            v4_prompt: {
              caption: {
                base_caption: prompt,
                char_captions: []
              },
              use_coords: false,
              use_order: true
            },

            v4_negative_prompt: {
              caption: {
                base_caption: negativePrompt,
                char_captions: []
              },
              legacy_uc: false
            },
            negative_prompt: negativePrompt,
            deliberate_euler_ancestral_bug: false,
            prefer_brownian: true

          }
        };
      } else {

        requestBody = {
          input: prompt,
          model: model,
          action: 'generate',
          parameters: {
            width: width,
            height: height,
            scale: settings.cfg_scale,
            sampler: settings.sampler,
            steps: settings.steps,
            seed: settings.seed === -1 ? Math.floor(Math.random() * 9999999999) : settings.seed,
            n_samples: 1,
            ucPreset: settings.uc_preset,
            qualityToggle: settings.quality_toggle,
            sm: settings.smea,
            sm_dyn: settings.smea_dyn,
            dynamic_thresholding: false,
            controlnet_strength: 1,
            legacy: false,
            add_original_image: false,
            cfg_rescale: 0,
            noise_schedule: 'native',
            negative_prompt: negativePrompt
          }
        };
      }

      console.log('📤 发送请求到 NovelAI API');
      console.log('📊 使用模型:', model);
      console.log('📋 请求体:', JSON.stringify(requestBody, null, 2));


      let apiUrl;


      if (model.includes('nai-diffusion-4')) {

        apiUrl = 'https://image.novelai.net/ai/generate-image-stream';
      } else {

        apiUrl = 'https://image.novelai.net/ai/generate-image';
      }

      let corsProxy = settings.cors_proxy;


      if (corsProxy === 'custom') {
        corsProxy = settings.custom_proxy_url || '';
      }


      if (corsProxy && corsProxy !== '') {
        apiUrl = corsProxy + encodeURIComponent(apiUrl);
      }


      const isChrome = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent);
      let fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify(requestBody)
      };


      if (isChrome) {
        console.log('🔧 检测到Chrome浏览器，启用headers兼容性处理');
        const cleanHeaders = {};
        for (const [key, value] of Object.entries(fetchOptions.headers)) {

          cleanHeaders[key] = value.replace(/[^\x00-\xFF]/g, '');
        }
        fetchOptions.headers = cleanHeaders;
      }

      const response = await fetch(apiUrl, fetchOptions);

      console.log('Response status:', response.status);
      console.log('Response headers:', [...response.headers.entries()]);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API错误响应:', errorText);
        throw new Error(`API请求失败 (${response.status}): ${errorText}`);
      }


      const contentType = response.headers.get('content-type');
      console.log('Content-Type:', contentType);


      let zipBlob;
      if (contentType && contentType.includes('text/event-stream')) {
        console.log('检测到 SSE 流式响应，开始解析...');
        statusDiv.textContent = '正在接收流式数据...';


        const text = await response.text();
        console.log('收到 SSE 数据，大小:', text.length);

        const lines = text.trim().split('\n');
        let base64Data = null;

        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            const dataContent = line.substring(6);


            try {
              const jsonData = JSON.parse(dataContent);


              if (jsonData.event_type === 'final' && jsonData.image) {
                base64Data = jsonData.image;
                console.log('✅ 找到 final 事件的图片数据');
                break;
              }


              if (jsonData.data) {
                base64Data = jsonData.data;
                console.log('从 JSON.data 中提取图片数据');
                break;
              }
              if (jsonData.image) {
                base64Data = jsonData.image;
                console.log('从 JSON.image 中提取图片数据');
                break;
              }
            } catch (e) {

              base64Data = dataContent;
              console.log('直接使用 base64 数据');
              break;
            }
          }
        }

        if (!base64Data) {
          throw new Error('无法从 SSE 响应中提取图片数据');
        }


        const isPNG = base64Data.startsWith('iVBORw0KGgo');
        const isJPEG = base64Data.startsWith('/9j/');

        if (isPNG || isJPEG) {
          console.log('✅ 检测到直接的图片 base64 数据 (PNG/JPEG)');

          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const imageBlob = new Blob([bytes], {
            type: isPNG ? 'image/png' : 'image/jpeg'
          });
          console.log('图片 Blob 创建成功，大小:', imageBlob.size);

          // 直接显示图片
          const imageUrl = URL.createObjectURL(imageBlob);
          document.getElementById('nai-result-image').src = imageUrl;
          statusDiv.style.display = 'none';
          resultDiv.style.display = 'block';
          console.log('✅ 图片显示成功！🎨');
          return;
        }


        console.log('当作 ZIP 文件处理...');
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        zipBlob = new Blob([bytes]);
        console.log('ZIP Blob 大小:', zipBlob.size);

      } else {

        zipBlob = await response.blob();
        console.log('收到数据，类型:', zipBlob.type, '大小:', zipBlob.size);
      }


      try {

        if (typeof JSZip === 'undefined') {
          throw new Error('JSZip库未加载，请刷新页面重试');
        }

        statusDiv.textContent = '正在解压图片...';

        const zip = await JSZip.loadAsync(zipBlob);
        console.log('ZIP文件内容:', Object.keys(zip.files));

        let imageFile = null;
        for (let filename in zip.files) {
          if (filename.match(/\.(png|jpg|jpeg|webp)$/i)) {
            imageFile = zip.files[filename];
            console.log('找到图片文件:', filename);
            break;
          }
        }

        if (!imageFile) {
          throw new Error('ZIP文件中未找到图片');
        }

        const imageBlob = await imageFile.async('blob');
        console.log('提取的图片大小:', imageBlob.size);

        const imageUrl = URL.createObjectURL(imageBlob);
        console.log('生成的图片URL:', imageUrl);

        document.getElementById('nai-result-image').src = imageUrl;
        statusDiv.style.display = 'none';
        resultDiv.style.display = 'block';

      } catch (zipError) {
        console.error('ZIP解压失败:', zipError);

        console.log('尝试直接作为图片显示...');

        if (zipBlob.type.startsWith('image/')) {
          const imageUrl = URL.createObjectURL(zipBlob);
          document.getElementById('nai-result-image').src = imageUrl;
          statusDiv.style.display = 'none';
          resultDiv.style.display = 'block';
        } else {
          throw new Error('图片格式处理失败: ' + zipError.message);
        }
      }

    } catch (error) {
      console.error('NovelAI生成失败:', error);
      statusDiv.style.display = 'none';
      errorDiv.style.display = 'block';
      errorDiv.textContent = '生成失败: ' + error.message;
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = '生成图像';
    }
  }

  // ========== 全局暴露 ==========
  window.handleNaiPresetChange = handleNaiPresetChange;
  window.saveNaiBinding = saveNaiBinding;
  window.loadNovelAISettings = loadNovelAISettings;
  window.saveNovelAISettings = saveNovelAISettings;
  window.resetNovelAISettings = resetNovelAISettings;
  window.saveGoogleImagenSettings = saveGoogleImagenSettings;
  window.fetchGoogleImagenModels = fetchGoogleImagenModels;
  window.testGoogleImagenGeneration = testGoogleImagenGeneration;
  window.openNaiBindingModal = openNaiBindingModal;
  window.generateNovelAIImage = generateNovelAIImage;
  window.handleDeleteNaiPreset = handleDeleteNaiPreset;
  window.loadNaiPresetsDropdown = loadNaiPresetsDropdown;
  window.generateNaiImageFromPrompt = generateNaiImageFromPrompt;
  window.getNovelAISettings = getNovelAISettings;
  window.generateGoogleImagenFromPrompt = generateGoogleImagenFromPrompt;

  // ========== 从 script.js 迁移：NAI Gallery 及相关函数 ==========
  let isNaiGalleryManagementMode = false;
  let selectedNaiImages = new Set();
  let naiGalleryCache = { local: [], cloud: [] };
  let naiGalleryRenderCount = { local: 0, cloud: 0 };
  let isLoadingMoreNaiImages = { local: false, cloud: false };
  let activeNaiGalleryTab = 'local';
  const NAI_GALLERY_RENDER_WINDOW = 45;

  async function handleRegenerateNaiImage(timestamp, buttonElement) {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    const msgIndex = chat.history.findIndex(m => m.timestamp === timestamp);
    if (msgIndex === -1) return;
    const message = chat.history[msgIndex];
    const originalPrompt = message.prompt;
    if (!originalPrompt) { await showCustomAlert("无法重新生成", "未找到该图片的原始提示词(prompt)。"); return; }
    buttonElement.disabled = true;
    buttonElement.classList.add('loading');
    const bubble = buttonElement.closest('.message-bubble');
    const imgElement = bubble ? bubble.querySelector('.realimag-image') : null;
    if (imgElement) imgElement.style.opacity = '0.5';
    try {
      const generatedData = await generateNaiImageFromPrompt(originalPrompt, chat.id);
      message.imageUrl = generatedData.imageUrl;
      message.fullPrompt = generatedData.fullPrompt;
      await db.chats.put(chat);
      if (imgElement) { imgElement.src = generatedData.imageUrl; imgElement.title = generatedData.fullPrompt; imgElement.style.opacity = '1'; }
    } catch (error) {
      console.error("重新生成NAI图片失败:", error);
      await showCustomAlert("生成失败", `无法重新生成图片: ${error.message}`);
      if (imgElement) imgElement.style.opacity = '1';
    } finally {
      buttonElement.disabled = false;
      buttonElement.classList.remove('loading');
    }
  }

  async function handleSilentUploadNaiImage(timestamp, buttonElement) {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    const msgIndex = chat.history.findIndex(m => m.timestamp === timestamp);
    if (msgIndex === -1) return;
    const message = chat.history[msgIndex];
    const base64Url = message.imageUrl;
    if (!base64Url || !base64Url.startsWith('data:image')) { alert("错误：这张图片已经是URL，或数据已损坏。"); return; }
    buttonElement.disabled = true;
    buttonElement.classList.add('loading');
    const bubble = buttonElement.closest('.message-bubble');
    const imgElement = bubble ? bubble.querySelector('.realimag-image') : null;
    if (imgElement) imgElement.style.opacity = '0.5';
    try {
      const newUrl = await uploadImageToImgBB(base64Url);
      if (newUrl === base64Url) throw new Error("上传函数返回了原始Base64，可能上传失败或被跳过。");
      message.imageUrl = newUrl;
      await db.chats.put(chat);
      if (imgElement) { imgElement.src = newUrl; imgElement.style.opacity = '1'; }
      buttonElement.style.display = 'none';
    } catch (error) {
      console.error("静默上传NAI图片失败:", error);
      await showCustomAlert("上传失败", `无法上传到 ImgBB: ${error.message}`);
      if (imgElement) imgElement.style.opacity = '1';
    } finally {
      buttonElement.disabled = false;
      buttonElement.classList.remove('loading');
    }
  }

  async function handleSilentUploadUserImage(timestamp, buttonElement) {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    const msgIndex = chat.history.findIndex(m => m.timestamp === timestamp);
    if (msgIndex === -1) return;
    const message = chat.history[msgIndex];
    if (!message || message.role !== 'user' || !Array.isArray(message.content)) { alert("错误：消息格式不正确。"); return; }
    const base64Url = message.content[0].image_url.url;
    if (!base64Url || !base64Url.startsWith('data:image')) { alert("错误：这张图片已经是URL，或数据已损坏。"); return; }
    buttonElement.disabled = true;
    buttonElement.classList.add('loading');
    const bubble = buttonElement.closest('.message-bubble');
    const imgElement = bubble ? bubble.querySelector('.chat-image') : null;
    if (imgElement) imgElement.style.opacity = '0.5';
    try {
      const newUrl = await uploadImageToImgBB(base64Url);
      if (newUrl === base64Url) throw new Error("上传函数返回了原始Base64，可能上传失败或被跳过。");
      message.content[0].image_url.url = newUrl;
      await db.chats.put(chat);
      if (imgElement) { imgElement.src = newUrl; imgElement.style.opacity = '1'; }
      buttonElement.style.display = 'none';
    } catch (error) {
      console.error("静默上传User图片失败:", error);
      await showCustomAlert("上传失败", `无法上传到 ImgBB: ${error.message}`);
      if (imgElement) imgElement.style.opacity = '1';
    } finally {
      buttonElement.disabled = false;
      buttonElement.classList.remove('loading');
    }
  }

  window.handleRegenerateNaiImage = handleRegenerateNaiImage;
  window.handleSilentUploadNaiImage = handleSilentUploadNaiImage;
  window.handleSilentUploadUserImage = handleSilentUploadUserImage;
  window.naiGalleryCache = naiGalleryCache;
  window.naiGalleryRenderCount = naiGalleryRenderCount;
  window.isLoadingMoreNaiImages = isLoadingMoreNaiImages;
  window.activeNaiGalleryTab = activeNaiGalleryTab;

  // ========== 从 script.js 迁移：NAI Gallery 核心函数 ==========
  async function openNaiGallery() {
    naiGalleryCache = { local: [], cloud: [] };
    naiGalleryRenderCount = { local: 0, cloud: 0 };
    isLoadingMoreNaiImages = { local: false, cloud: false };
    const allNaiImages = [];
    try {
      const allChats = await db.chats.toArray();
      for (const chat of allChats) {
        if (chat.history && chat.history.length > 0) {
          chat.history.forEach(msg => {
            if ((msg.type === 'naiimag' || msg.type === 'googleimag') && msg.imageUrl) {
              allNaiImages.push({ sourceType: 'chat', imageUrl: msg.imageUrl, prompt: msg.prompt || msg.fullPrompt || 'NAI Image', chatId: chat.id, msgTimestamp: msg.timestamp });
            }
          });
        }
      }
    } catch (e) { console.error("扫描聊天记录失败:", e); }
    try {
      const allPosts = await db.qzonePosts.toArray();
      allPosts.forEach(post => {
        if (post.type === 'naiimag' || post.type === 'googleimag') {
          const urls = post.imageUrls || (post.imageUrl ? [post.imageUrl] : []);
          const prompts = Array.isArray(post.prompt) ? post.prompt : [post.prompt || 'NAI Image'];
          urls.forEach((url, index) => {
            allNaiImages.push({ sourceType: 'qzone', imageUrl: url, prompt: prompts[index] || prompts[0], postId: post.id, imageIndex: index });
          });
        }
      });
    } catch (e) { console.error("扫描动态失败:", e); }
    allNaiImages.sort((a, b) => (b.msgTimestamp || b.postId || 0) - (a.msgTimestamp || a.postId || 0));
    allNaiImages.forEach(img => {
      if (img.imageUrl.startsWith('data:image')) naiGalleryCache.local.push(img);
      else naiGalleryCache.cloud.push(img);
    });
    document.getElementById('nai-gallery-grid-local').innerHTML = '';
    document.getElementById('nai-gallery-grid-cloud').innerHTML = '';
    switchNaiGalleryTab('local');
    document.getElementById('nai-gallery-panel').classList.add('visible');
  }

  function switchNaiGalleryTab(tabId) {
    if (isNaiGalleryManagementMode) toggleNaiGalleryManagementMode();
    activeNaiGalleryTab = tabId;
    document.querySelectorAll('.nai-gallery-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tabId === tabId));
    document.querySelectorAll('.nai-gallery-page').forEach(page => page.classList.toggle('active', page.id === `nai-gallery-grid-${tabId}`));
    const cache = naiGalleryCache[tabId];
    const renderCount = naiGalleryRenderCount[tabId];
    const gridEl = document.getElementById(`nai-gallery-grid-${tabId}`);
    if (renderCount === 0) {
      gridEl.innerHTML = '';
      if (cache.length === 0) {
        const message = (tabId === 'local') ? '本地画廊是空的，快去生成一些图片吧！' : '图床画廊是空的，请从"本地"上传图片。';
        gridEl.innerHTML = `<p style="text-align:center; color: var(--text-secondary); grid-column: 1 / -1;">${message}</p>`;
      } else {
        loadMoreNaiGalleryImages();
      }
    }
    updateNaiGalleryActionButtons();
  }

  function renderNaiGalleryGrid(images, gridEl) {
    if (images.length === 0 && naiGalleryRenderCount[activeNaiGalleryTab] === 0) {
      const message = (activeNaiGalleryTab === 'local') ? '本地画廊是空的，快去生成一些图片吧！' : '图床画廊是空的。';
      gridEl.innerHTML = `<p style="text-align:center; color: var(--text-secondary); grid-column: 1 / -1;">${message}</p>`;
      return;
    }
    const fragment = document.createDocumentFragment();
    images.forEach(img => {
      const item = document.createElement('div');
      item.className = 'nai-gallery-item';
      item.title = img.prompt;
      const itemKey = `${img.sourceType}_${img.chatId || img.postId}_${img.msgTimestamp || img.imageIndex}`;
      item.dataset.key = itemKey;
      item.dataset.imageUrl = img.imageUrl;
      item.dataset.prompt = img.prompt;
      item.innerHTML = `<div class="nai-image-container" style="background-image: url(${img.imageUrl})">
        <div class="nai-gallery-controls">
          <button class="nai-gallery-download-btn" title="下载"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path></svg></button>
          <button class="nai-gallery-delete-btn" title="删除"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path></svg></button>
        </div></div><span class="nai-gallery-name">${img.prompt}</span>`;
      fragment.appendChild(item);
    });
    gridEl.appendChild(fragment);
  }

  async function loadMoreNaiGalleryImages() {
    const activeTab = activeNaiGalleryTab;
    if (isLoadingMoreNaiImages[activeTab] || naiGalleryRenderCount[activeTab] >= naiGalleryCache[activeTab].length) return;
    isLoadingMoreNaiImages[activeTab] = true;
    const gridEl = document.getElementById(`nai-gallery-grid-${activeTab}`);
    if (typeof showLoader === 'function') showLoader(gridEl, 'bottom');
    setTimeout(() => {
      if (activeNaiGalleryTab !== activeTab) { isLoadingMoreNaiImages[activeTab] = false; if (typeof hideLoader === 'function') hideLoader(gridEl); return; }
      const imagesToAppend = naiGalleryCache[activeTab].slice(naiGalleryRenderCount[activeTab], naiGalleryRenderCount[activeTab] + NAI_GALLERY_RENDER_WINDOW);
      if (typeof hideLoader === 'function') hideLoader(gridEl);
      if (imagesToAppend.length > 0) { renderNaiGalleryGrid(imagesToAppend, gridEl); naiGalleryRenderCount[activeTab] += imagesToAppend.length; }
      isLoadingMoreNaiImages[activeTab] = false;
    }, 500);
  }

  function toggleNaiGalleryManagementMode() {
    isNaiGalleryManagementMode = !isNaiGalleryManagementMode;
    const grid = document.getElementById(`nai-gallery-grid-${activeNaiGalleryTab}`);
    const manageBtn = document.getElementById('manage-nai-gallery-btn');
    const actionBar = document.getElementById('nai-gallery-action-bar');
    const selectAllCheckbox = document.getElementById('select-all-nai-gallery-checkbox');
    grid.classList.toggle('management-mode', isNaiGalleryManagementMode);
    if (isNaiGalleryManagementMode) {
      manageBtn.textContent = '完成'; actionBar.style.display = 'flex'; selectedNaiImages.clear();
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
      updateNaiGalleryActionButtons();
      document.querySelectorAll('.nai-gallery-page').forEach(page => page.classList.add('management-mode'));
    } else {
      manageBtn.textContent = '管理'; actionBar.style.display = 'none';
      document.querySelectorAll('.nai-gallery-page').forEach(page => page.classList.remove('management-mode'));
      grid.querySelectorAll('.nai-gallery-item.selected').forEach(item => item.classList.remove('selected'));
    }
  }

  function updateNaiGalleryActionButtons() {
    const deleteBtn = document.getElementById('delete-selected-nai-gallery-btn');
    const downloadBtn = document.getElementById('download-selected-nai-gallery-btn');
    const uploadBtn = document.getElementById('upload-selected-nai-gallery-btn');
    const exportBtn = document.getElementById('export-selected-nai-gallery-btn');
    const count = selectedNaiImages.size;
    if (deleteBtn) deleteBtn.textContent = `删除 (${count})`;
    if (downloadBtn) downloadBtn.textContent = `下载 (${count})`;
    if (exportBtn) { exportBtn.textContent = `导出 (${count})`; exportBtn.style.display = (activeNaiGalleryTab === 'cloud') ? 'block' : 'none'; }
    if (uploadBtn) { uploadBtn.textContent = `上传 (${count})`; const shouldShowUpload = (activeNaiGalleryTab === 'local' && state.apiConfig.imgbbEnable && state.apiConfig.imgbbApiKey); uploadBtn.style.display = shouldShowUpload ? 'block' : 'none'; }
  }

  function handleNaiGalleryGridClick(e) {
    const item = e.target.closest('.nai-gallery-item');
    if (!item) return;
    const key = item.dataset.key;
    const imageUrl = item.dataset.imageUrl;
    const prompt = item.dataset.prompt;
    if (e.target.closest('.nai-gallery-download-btn')) { e.stopPropagation(); if (typeof downloadNaiImage === 'function') downloadNaiImage(imageUrl, prompt); return; }
    if (e.target.closest('.nai-gallery-delete-btn')) { e.stopPropagation(); if (typeof executeBatchDeleteNaiImages === 'function') executeBatchDeleteNaiImages(new Set([key])); return; }
    if (isNaiGalleryManagementMode) {
      item.classList.toggle('selected');
      if (selectedNaiImages.has(key)) selectedNaiImages.delete(key); else selectedNaiImages.add(key);
      updateNaiGalleryActionButtons();
    } else {
      showCustomAlert("图片详情", `<div style="text-align: center;"><img src="${imageUrl}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);"></div>`);
    }
  }

  window.openNaiGallery = openNaiGallery;
  window.switchNaiGalleryTab = switchNaiGalleryTab;
  window.toggleNaiGalleryManagementMode = toggleNaiGalleryManagementMode;
  window.updateNaiGalleryActionButtons = updateNaiGalleryActionButtons;
  window.handleNaiGalleryGridClick = handleNaiGalleryGridClick;
  window.loadMoreNaiGalleryImages = loadMoreNaiGalleryImages;
  window.renderNaiGalleryGrid = renderNaiGalleryGrid;

  // ========== 从 script.js 迁移：generateFilenameForNai, downloadNaiImage ==========
  function generateFilenameForNai(prompt) {
    let cleanTitle = (prompt || 'NAI_Image')
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 30);

    const timestamp = new Date().toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .split('.')[0];

    return `${cleanTitle}_${timestamp}.png`;
  }

  function downloadNaiImage(imageSrc, prompt) {
    try {
      const filename = generateFilenameForNai(prompt);
      const link = document.createElement('a');
      link.href = imageSrc;
      link.download = filename;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
      }, 100);

      showDownloadToast('📥 图片下载中...');
    } catch (error) {
      console.error('❌ [NAI下载] 下载失败:', error);
      showDownloadToast('下载失败，请重试', 'error');
    }
  }

  window.generateFilenameForNai = generateFilenameForNai;
  window.downloadNaiImage = downloadNaiImage;

  // ========== 从 script.js 迁移：NAI Gallery 批量操作函数 ==========

  async function executeBatchExportNaiImages() {
    if (selectedNaiImages.size === 0) {
      alert("请先选择要导出的图片。");
      return;
    }

    let exportText = "";
    let exportedCount = 0;

    selectedNaiImages.forEach(key => {
      const item = naiGalleryCache.cloud.find(img => {
        const itemKey = `${img.sourceType}_${img.chatId || img.postId}_${img.msgTimestamp || img.imageIndex}`;
        return itemKey === key;
      });

      if (item && item.imageUrl) {
        exportText += `${item.imageUrl}\n`;
        exportedCount++;
      }
    });

    if (exportedCount === 0) {
      alert("未找到所选图片的数据（请确认您在'图床'分类下）。");
      return;
    }

    const finalText = exportText.trim();
    const textareaId = 'batch-export-nai-textarea-' + Date.now();

    const alertHtml = `
        <p style="text-align:left; font-size: 14px; margin: 0 0 10px 0;">
            已提取 ${exportedCount} 条链接：
        </p>
        <textarea id="${textareaId}" 
                  rows="10" 
                  style="width: 100%; font-size: 12px; resize: vertical; border-radius: 6px; border: 1px solid #ccc;"
                  readonly>${finalText}</textarea>
    `;

    showCustomAlert("复制链接", alertHtml);

    const modalConfirmBtn = document.getElementById('custom-modal-confirm');
    if (modalConfirmBtn) {
      modalConfirmBtn.textContent = '一键复制';
      const originalOnclick = modalConfirmBtn.onclick;

      modalConfirmBtn.onclick = async (e) => {
        try {
          await navigator.clipboard.writeText(finalText);
          modalConfirmBtn.textContent = '复制成功!';
          setTimeout(() => {
            modalConfirmBtn.textContent = '完成';
            modalConfirmBtn.onclick = originalOnclick;
          }, 1500);
        } catch (err) {
          alert('自动复制失败，请长按文本框手动复制。');
          modalConfirmBtn.textContent = '完成';
          modalConfirmBtn.onclick = originalOnclick;
        }
      };
    }
  }

  async function executeBatchDownloadNaiImages() {
    const keys = selectedNaiImages;

    if (keys.size === 0) {
      alert("请先选择要下载的图片。");
      return;
    }

    if (typeof JSZip === 'undefined' || !window.streamSaver) {
      await showCustomAlert("下载失败", "核心库 (JSZip 或 StreamSaver) 未能成功加载，请检查您的网络连接并刷新页面后重试。");
      return;
    }

    await showCustomAlert("请稍候...", `正在准备 ${keys.size} 张图片...`);

    const zip = new JSZip();
    let failedDownloads = 0;
    const downloadPromises = [];

    const keysArray = Array.from(keys);

    keysArray.forEach((key, index) => {
      const item = document.querySelector(`.nai-gallery-item[data-key="${key}"]`);
      if (!item) return;

      const imageUrl = item.dataset.imageUrl;
      const prompt = item.dataset.prompt;

      const baseFilename = generateFilenameForNai(prompt);
      const filename = baseFilename.replace(/\.png$/, `_(${index + 1}).png`);

      const promise = (async () => {
        try {
          let blob;
          if (imageUrl.startsWith('data:')) {
            const response = await fetch(imageUrl);
            blob = await response.blob();
          } else {
            let response;
            try {
              response = await fetch(imageUrl, { mode: 'cors' });
              if (!response.ok) throw new Error('直连失败');
            } catch (e) {
              console.warn("直连失败, 尝试使用CORS代理...", e.message);
              const settings = getNovelAISettings();
              let corsProxy = settings.cors_proxy === 'custom' ? settings.custom_proxy_url : settings.cors_proxy;
              if (!corsProxy || corsProxy === '') corsProxy = 'https://corsproxy.io/?';
              const proxiedUrl = corsProxy + encodeURIComponent(imageUrl);
              response = await fetch(proxiedUrl);
            }

            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            blob = await response.blob();
          }
          zip.file(filename, blob, { binary: true });
        } catch (e) {
          console.error(`下载图片失败: ${imageUrl}`, e);
          failedDownloads++;
        }
      })();
      downloadPromises.push(promise);
    });

    await Promise.all(downloadPromises);

    if (failedDownloads === keys.size) {
      await showCustomAlert("下载失败", "所有图片都下载失败了。这通常是由于网络问题或CORS跨域限制（请检查API设置中的CORS代理是否有效）。");
      return;
    }

    await showCustomAlert("打包中...", "所有图片已准备就绪，正在流式压缩... 下载将自动开始。");

    try {
      const fileStream = streamSaver.createWriteStream(`NAI_Gallery_Batch_${Date.now()}.zip`);

      const zipStream = zip.generateInternalStream({ type: "blob", streamFiles: true });

      const readableStream = new ReadableStream({
        start(controller) {
          zipStream.on('data', (chunk) => {
            controller.enqueue(chunk);
          }).on('end', () => {
            console.log("ZIP 流生成完毕。");
            controller.close();
          }).on('error', (err) => {
            console.error("JSZip 流错误:", err);
            controller.error(err);
          }).resume();
        }
      });

      await readableStream.pipeTo(fileStream);

      if (failedDownloads > 0) {
        showCustomAlert("部分下载完成", `成功打包 ${keys.size - failedDownloads} 张图片。有 ${failedDownloads} 张图片因网络或CORS限制下载失败。`);
      }

    } catch (error) {
      console.error("流式下载ZIP失败:", error);
      await showCustomAlert("流式下载失败", `创建ZIP流时出错: ${error.message}`);
    }
  }

  async function executeBatchDeleteNaiImages(keysToDelete = null) {
    const keys = keysToDelete || selectedNaiImages;
    if (keys.size === 0) return;

    const confirmed = await showCustomConfirm(
      '确认删除',
      `确定要从【聊天记录和动态】中永久删除这 ${keys.size} 张NAI图片吗？此操作不可恢复。`, {
      confirmButtonClass: 'btn-danger'
    });

    if (!confirmed) return;

    await showCustomAlert("请稍候...", "正在执行删除操作...");

    let deletedCount = 0;
    const chatsToUpdate = new Map();
    const postsToDelete = new Set();
    const postsToModify = new Map();

    const postIdsToFetch = new Set();
    for (const key of keys) {
      if (key.startsWith('qzone_')) {
        const parts = key.split('_');
        const postId = parseInt(parts[1]);
        if (!isNaN(postId)) {
          postIdsToFetch.add(postId);
        }
      }
    }
    const postsCache = new Map();
    if (postIdsToFetch.size > 0) {
      const posts = await db.qzonePosts.where('id').anyOf(Array.from(postIdsToFetch)).toArray();
      posts.forEach(post => postsCache.set(post.id, post));
    }

    for (const key of keys) {
      const parts = key.split('_');
      if (parts.length < 3) {
        console.warn("跳过格式错误的NAI图片Key:", key);
        continue;
      }

      const sourceType = parts[0];
      const identifier = parts.pop();
      const id = parts.slice(1).join('_');

      if (sourceType === 'chat') {
        const chatId = id;
        const msgTimestamp = parseInt(identifier);

        if (!chatsToUpdate.has(chatId)) {
          const chatData = await db.chats.get(chatId);
          if (chatData) {
            chatsToUpdate.set(chatId, chatData);
          } else {
            console.warn(`未找到 chatID: ${chatId}，跳过...`);
            continue;
          }
        }

        const chat = chatsToUpdate.get(chatId);
        if (chat && chat.history) {
          const originalLength = chat.history.length;
          chat.history = chat.history.filter(msg => msg.timestamp !== msgTimestamp);
          if (chat.history.length < originalLength) {
            deletedCount++;
            chatsToUpdate.set(chatId, chat);
            if (state.chats[chatId]) {
              state.chats[chatId].history = chat.history;
            }
          }
        }
      } else if (sourceType === 'qzone') {
        const postId = parseInt(id);
        const imageIndex = parseInt(identifier);

        const post = postsToModify.get(postId) || postsCache.get(postId);
        if (!post) {
          console.warn(`未找到 postID: ${postId}，跳过...`);
          continue;
        }

        const urls = post.imageUrls || (post.imageUrl ? [post.imageUrl] : []);

        if (urls.length <= 1) {
          postsToDelete.add(postId);
          if (postsToModify.has(postId)) {
            postsToModify.delete(postId);
          }
        } else {
          const urlToRemove = urls[imageIndex];
          post.imageUrls = post.imageUrls.filter(url => url !== urlToRemove);

          if (post.prompt && Array.isArray(post.prompt) && post.prompt[imageIndex]) {
            post.prompt.splice(imageIndex, 1);
          }
          post.imageUrl = post.imageUrls[0] || null;
          postsToModify.set(postId, post);
        }
        deletedCount++;
      }
    }

    try {
      await db.transaction('rw', db.chats, db.qzonePosts, async () => {
        if (chatsToUpdate.size > 0) {
          await db.chats.bulkPut(Array.from(chatsToUpdate.values()));
        }
        if (postsToModify.size > 0) {
          await db.qzonePosts.bulkPut(Array.from(postsToModify.values()));
        }
        if (postsToDelete.size > 0) {
          await db.qzonePosts.bulkDelete(Array.from(postsToDelete));
        }
      });

      toggleNaiGalleryManagementMode();
      keys.forEach(key => {
        naiGalleryCache.local = naiGalleryCache.local.filter(item => {
          const itemKey = `${item.sourceType}_${item.chatId || item.postId}_${item.msgTimestamp || item.imageIndex}`;
          return itemKey !== key;
        });
        naiGalleryCache.cloud = naiGalleryCache.cloud.filter(item => {
          const itemKey = `${item.sourceType}_${item.chatId || item.postId}_${item.msgTimestamp || item.imageIndex}`;
          return itemKey !== key;
        });
      });

      naiGalleryRenderCount[activeNaiGalleryTab] = 0;
      document.getElementById(`nai-gallery-grid-${activeNaiGalleryTab}`).innerHTML = '';

      loadMoreNaiGalleryImages();
      await showCustomAlert('删除成功', `已成功删除 ${deletedCount} 张图片。`);

      if (document.getElementById('chat-interface-screen').classList.contains('active')) {
        renderChatInterface(state.activeChatId);
      }
      if (document.getElementById('qzone-screen').classList.contains('active')) {
        renderQzonePosts();
      }

    } catch (error) {
      console.error("批量删除NAI图片时出错:", error);
      await showCustomAlert('删除失败', `操作失败: ${error.message}`);
    }
  }

  async function executeBatchUploadNaiImagesToImgBB() {
    if (!state.apiConfig.imgbbEnable || !state.apiConfig.imgbbApiKey) {
      await showCustomAlert("功能未开启", "请先在\"API设置\"中开启 ImgBB 自动图床功能并填写 API Key。");
      return;
    }

    const itemsToUpload = Array.from(selectedNaiImages)
      .map(key => document.querySelector(`.nai-gallery-item[data-key="${key}"]`))
      .filter(item => item && item.dataset.imageUrl && item.dataset.imageUrl.startsWith('data:image'));

    if (itemsToUpload.length === 0) {
      await showCustomAlert("无需上传", "你选择的图片中没有需要上传的本地图片（它们可能已经是网络链接了）。");
      return;
    }

    const confirmed = await showCustomConfirm(
      '确认上传？',
      `即将把 ${itemsToUpload.length} 张本地图片上传到 ImgBB，并永久替换其在数据库中的地址。此操作不可逆！\n\n（上传期间请勿关闭页面）`,
      { confirmButtonClass: 'btn-danger', confirmText: '确认上传' }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", `正在开始上传 ${itemsToUpload.length} 张图片...`);

    let successCount = 0;
    let failCount = 0;
    const chatsToUpdate = new Map();
    const postsToUpdate = new Map();
    const keysToUpdateInCache = new Map();

    for (const item of itemsToUpload) {
      const key = item.dataset.key;
      const base64Url = item.dataset.imageUrl;

      try {
        const newUrl = await uploadImageToImgBB(base64Url);

        if (newUrl === base64Url) {
          throw new Error("上传函数返回了原始Base64，可能上传失败或被跳过。");
        }

        const parts = key.split('_');
        if (parts.length < 3) throw new Error(`Key格式错误: ${key}`);

        const sourceType = parts[0];
        const identifier = parts.pop();
        const id = parts.slice(1).join('_');

        if (sourceType === 'chat') {
          const chatId = id;
          const msgTimestamp = parseInt(identifier);

          let chat = chatsToUpdate.get(chatId);
          if (!chat) chat = await db.chats.get(chatId);

          if (chat && chat.history) {
            const msg = chat.history.find(m => m.timestamp === msgTimestamp);
            if (msg && msg.imageUrl === base64Url) {
              msg.imageUrl = newUrl;
              chatsToUpdate.set(chatId, chat);
              keysToUpdateInCache.set(key, newUrl);
              successCount++;
            } else {
              throw new Error(`未在聊天 ${chatId} 中找到时间戳为 ${msgTimestamp} 且匹配Base64的消息。`);
            }
          }

        } else if (sourceType === 'qzone') {
          const postId = parseInt(id);
          const imageIndex = parseInt(identifier);

          let post = postsToUpdate.get(postId);
          if (!post) post = await db.qzonePosts.get(postId);

          if (post && post.imageUrls && post.imageUrls[imageIndex] === base64Url) {
            post.imageUrls[imageIndex] = newUrl;
            if (imageIndex === 0) {
              post.imageUrl = newUrl;
            }
            postsToUpdate.set(postId, post);
            keysToUpdateInCache.set(key, newUrl);
            successCount++;
          } else {
            throw new Error(`未在动态 ${postId} 的第 ${imageIndex} 张图中找到匹配的Base64。`);
          }
        }

      } catch (error) {
        failCount++;
        console.error(`上传失败 (Key: ${key}):`, error.message);
      }
    }

    try {
      if (chatsToUpdate.size > 0 || postsToUpdate.size > 0) {
        await db.transaction('rw', db.chats, db.qzonePosts, async () => {
          if (chatsToUpdate.size > 0) {
            await db.chats.bulkPut(Array.from(chatsToUpdate.values()));
          }
          if (postsToUpdate.size > 0) {
            await db.qzonePosts.bulkPut(Array.from(postsToUpdate.values()));
          }
        });
      }
    } catch (dbError) {
      console.error("批量更新数据库失败:", dbError);
      await showCustomAlert("数据库更新失败", `图片上传完成，但在保存到数据库时出错: ${dbError.message}`);
      return;
    }

    keysToUpdateInCache.forEach((newUrl, key) => {
      const domItem = document.querySelector(`.nai-gallery-item[data-key="${key}"]`);
      if (domItem) {
        domItem.dataset.imageUrl = newUrl;
        domItem.querySelector('.nai-image-container').style.backgroundImage = `url(${newUrl})`;
      }
    });

    const updatedLocal = [];
    const updatedCloud = [];

    naiGalleryCache.local.forEach(item => {
      const itemKey = `${item.sourceType}_${item.chatId || item.postId}_${item.msgTimestamp || item.imageIndex}`;
      if (keysToUpdateInCache.has(itemKey)) {
        item.imageUrl = keysToUpdateInCache.get(itemKey);
        updatedCloud.push(item);
      } else {
        updatedLocal.push(item);
      }
    });

    naiGalleryCache.cloud.push(...updatedCloud);
    naiGalleryCache.local = updatedLocal;

    naiGalleryRenderCount = { local: 0, cloud: 0 };
    let resultMessage = `批量上传完成！\n\n成功: ${successCount} 张\n失败: ${failCount} 张`;
    if (failCount > 0) {
      resultMessage += "\n\n失败的图片请检查控制台（Console）中的错误日志。";
    }
    await showCustomAlert("操作完成", resultMessage);

    toggleNaiGalleryManagementMode();
  }

  window.executeBatchExportNaiImages = executeBatchExportNaiImages;
  window.executeBatchDownloadNaiImages = executeBatchDownloadNaiImages;
  window.executeBatchDeleteNaiImages = executeBatchDeleteNaiImages;
  window.executeBatchUploadNaiImagesToImgBB = executeBatchUploadNaiImagesToImgBB;
