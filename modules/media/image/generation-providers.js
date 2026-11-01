  // ========== Google Imagen 生图功能 ==========
  function getGoogleImagenSettings() {
    const defaultSettings = {
      model: 'imagen-4.0-generate-001',
      endpoint: 'https://generativelanguage.googleapis.com',
      aspectRatio: '1:1',
      numberOfImages: 1,
      positivePrompt: '',
      negativePrompt: ''
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
    
    const posInput = document.getElementById('google-imagen-positive');
    const negInput = document.getElementById('google-imagen-negative');
    const positivePrompt = posInput ? posInput.value.trim() : '';
    const negativePrompt = negInput ? negInput.value.trim() : '';

    localStorage.setItem('google-imagen-enabled', enabled);
    localStorage.setItem('google-imagen-model', model);
    localStorage.setItem('google-imagen-api-key', apiKey);

    const settings = { model, endpoint: endpoint || 'https://generativelanguage.googleapis.com', aspectRatio, positivePrompt, negativePrompt };
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

    let finalPrompt = aiPrompt;
    if (settings.positivePrompt) {
        finalPrompt = finalPrompt + ', ' + settings.positivePrompt;
    }

    let apiUrl, requestBody, headers;

    if (isGemini) {
      // 官方 Google API → 用 :predict 端点
      apiUrl = `${baseEndpoint}/v1beta/models/${model}:predict`;
      requestBody = {
        instances: [{ prompt: finalPrompt }],
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
        prompt: finalPrompt,
        response_format: 'b64_json',
        n: 1
      };
      if (settings.negativePrompt) {
          requestBody.negative_prompt = settings.negativePrompt;
      }
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
          fullPrompt: data.data[0].revised_prompt || finalPrompt
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
      fullPrompt: finalPrompt
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
        ? GEMINI_API_URL
        : `${endpoint.replace(/\/+$/, '')}/v1/models`;

      const fetchOptions = isGemini ? {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'omit',
        headers: {
          'x-goog-api-key': getRandomValue(apiKey)
        }
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
        ? (data.models || [])
            .filter(model => {
              const id = model.name?.split('/')[1] || model.name || '';
              return id.startsWith('imagen-') && (!Array.isArray(model.supportedGenerationMethods) || model.supportedGenerationMethods.includes('predict'));
            })
            .map(model => ({ id: model.name.split('/')[1] || model.name }))
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

  // ========== OpenAI GPT Image 生图功能 ==========
  function getOpenAIImageSettings() {
    const defaultSettings = {
      model: 'gpt-image-2',
      endpoint: 'https://api.openai.com',
      size: 'auto',
      quality: 'auto',
      outputFormat: 'png',
      outputCompression: 100,
      background: 'auto',
      moderation: 'auto',
      positivePrompt: ''
    };
    const saved = localStorage.getItem('openai-image-settings');
    if (!saved) return defaultSettings;
    try {
      return { ...defaultSettings, ...JSON.parse(saved) };
    } catch (error) {
      console.warn('[GPT Image] 设置解析失败，已使用默认设置。', error);
      return defaultSettings;
    }
  }

  function saveOpenAIImageSettings() {
    const enabled = document.getElementById('openai-image-switch')?.checked || false;
    const model = document.getElementById('openai-image-model')?.value.trim() || 'gpt-image-2';
    const apiKey = document.getElementById('openai-image-api-key')?.value.trim() || '';
    const endpoint = document.getElementById('openai-image-endpoint')?.value.trim() || 'https://api.openai.com';
    const compressionValue = parseInt(document.getElementById('openai-image-compression')?.value, 10);
    const settings = {
      model,
      endpoint,
      size: document.getElementById('openai-image-size')?.value || 'auto',
      quality: document.getElementById('openai-image-quality')?.value || 'auto',
      outputFormat: document.getElementById('openai-image-output-format')?.value || 'png',
      outputCompression: Math.min(100, Math.max(0, Number.isFinite(compressionValue) ? compressionValue : 100)),
      background: document.getElementById('openai-image-background')?.value || 'auto',
      moderation: document.getElementById('openai-image-moderation')?.value || 'auto',
      positivePrompt: document.getElementById('openai-image-positive')?.value.trim() || ''
    };

    localStorage.setItem('openai-image-enabled', String(enabled));
    localStorage.setItem('openai-image-model', model);
    localStorage.setItem('openai-image-api-key', apiKey);
    localStorage.setItem('openai-image-settings', JSON.stringify(settings));
  }

  function getOpenAIImageGenerationsUrl(endpoint) {
    const normalized = String(endpoint || 'https://api.openai.com').trim().replace(/\/+$/, '');
    if (/\/images\/generations$/i.test(normalized)) return normalized;
    return /\/v1$/i.test(normalized)
      ? `${normalized}/images/generations`
      : `${normalized}/v1/images/generations`;
  }

  function getOpenAIImageMimeType(outputFormat) {
    if (outputFormat === 'jpg') return 'image/jpeg';
    return `image/${outputFormat || 'png'}`;
  }

  async function generateOpenAIImageFromPrompt(aiPrompt) {
    const prompt = String(aiPrompt || '').trim() || 'A beautiful scene';
    const apiKey = localStorage.getItem('openai-image-api-key');
    if (!apiKey) {
      throw new Error('GPT 生图 API Key 未配置。请在 GPT 生图设置中填写 API Key。');
    }

    const settings = getOpenAIImageSettings();
    const model = localStorage.getItem('openai-image-model') || settings.model || 'gpt-image-2';
    const finalPrompt = settings.positivePrompt ? `${prompt}, ${settings.positivePrompt}` : prompt;
    const outputFormat = settings.outputFormat || 'png';
    if (outputFormat === 'jpeg' && settings.background === 'transparent') {
      throw new Error('JPEG 不支持透明背景，请选择 PNG/WebP，或将背景改为自动/不透明。');
    }
    const requestBody = {
      model,
      prompt: finalPrompt,
      n: 1,
      size: settings.size || 'auto',
      quality: settings.quality || 'auto',
      output_format: outputFormat,
      background: settings.background || 'auto',
      moderation: settings.moderation || 'auto'
    };
    if (outputFormat === 'jpeg' || outputFormat === 'webp') {
      const compressionValue = Number(settings.outputCompression);
      requestBody.output_compression = Math.min(100, Math.max(0, Number.isFinite(compressionValue) ? compressionValue : 100));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);
    let response;
    try {
      response = await fetch(getOpenAIImageGenerationsUrl(settings.endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getRandomValue(apiKey)}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('GPT 生图请求超时（超过3分钟），请检查网络或稍后重试。');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let errorMessage = `GPT 生图 API 请求失败 (${response.status})`;
      try {
        const errorData = await response.json();
        const code = errorData?.error?.code;
        if (code === 'moderation_blocked') {
          errorMessage = '该提示词或生成结果未通过安全检查，请调整描述后重试。';
        } else if (errorData?.error?.message) {
          errorMessage += `: ${errorData.error.message}`;
        }
      } catch (_) {}
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const image = data?.data?.[0];
    if (!image) throw new Error('GPT 生图响应中未找到图片数据。');

    const mimeType = getOpenAIImageMimeType(outputFormat);
    const imageUrl = image.b64_json
      ? `data:${mimeType};base64,${image.b64_json}`
      : image.url;
    if (!imageUrl) throw new Error('GPT 生图响应中未找到可用的图片内容。');

    return {
      imageUrl,
      fullPrompt: image.revised_prompt || finalPrompt,
      model,
      mimeType,
      requestId: response.headers.get('x-request-id') || ''
    };
  }

  async function testOpenAIImageGeneration() {
    const apiKey = document.getElementById('openai-image-api-key')?.value.trim();
    if (!apiKey) {
      alert('请先填写 GPT 生图 API Key！');
      return;
    }
    saveOpenAIImageSettings();

    const testBtn = document.getElementById('openai-image-test-btn');
    const resultDiv = document.getElementById('openai-image-test-result');
    const resultImg = document.getElementById('openai-image-result-image');
    if (!testBtn || !resultDiv || !resultImg) return;

    testBtn.disabled = true;
    resultDiv.style.display = 'none';
    let seconds = 0;
    const timer = setInterval(() => {
      seconds += 1;
      testBtn.textContent = `⏳ 生成中... (${seconds}s)`;
    }, 1000);
    testBtn.textContent = '⏳ 生成中... (0s)';

    try {
      const result = await generateOpenAIImageFromPrompt('一只戴着红色围巾的橘猫坐在温暖的窗边，细腻自然光，高质量摄影');
      resultImg.src = result.imageUrl;
      resultDiv.style.display = 'block';
    } catch (error) {
      alert(`❌ GPT 生图测试失败: ${error.message}`);
      console.error('[GPT Image] 测试失败:', error);
    } finally {
      clearInterval(timer);
      testBtn.disabled = false;
      testBtn.textContent = '🧪 测试生成';
    }
  }
  // ========== OpenAI GPT Image 结束 ==========

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
      custom_proxy_url: '',
      endpoint: window.NovelAIConnection.OFFICIAL, protocol: 'auto', address_mode: 'auto', models_url: '', model_family: 'auto', proxy_scope: 'official'
    };

    const saved = localStorage.getItem('novelai-settings') || (typeof state !== 'undefined' && state.apiConfig?.novelaiSettings ? JSON.stringify(state.apiConfig.novelaiSettings) : null);
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
          // 画风预设只能改变生成参数，不能覆盖当前站点地址或代理。
          const style = Object.fromEntries(Object.entries(boundPresetSettings).filter(([key]) => Object.hasOwn(settings, key) && !window.NovelAIConnection.connectionFields.includes(key)));
          settings = { ...settings, ...style };
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

      return window.NovelAIConnection.generate(settings, model, apiKey, finalPositivePrompt, finalNegativePrompt);
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
    const prompt = document.getElementById('nai-test-prompt').value.trim();
    if (!prompt) { alert('请输入提示词！'); return; }
    const status = document.getElementById('nai-test-status');
    const result = document.getElementById('nai-test-result');
    const error = document.getElementById('nai-test-error');
    const button = document.getElementById('nai-generate-btn');
    if (button.disabled) return;
    status.style.display = 'block'; status.textContent = '正在生成，请稍候…';
    result.style.display = 'none'; error.style.display = 'none'; button.disabled = true;
    button.textContent = '生成中…';
    try {
      // 测试前保存当前连接，聊天随后使用同样的地址、模型和Key。
      const settings = await window.NovelAISettings.save();
      const model = localStorage.getItem('novelai-model');
      const key = localStorage.getItem('novelai-api-key');
      const negative = document.getElementById('nai-test-negative').value.trim() || settings.default_negative;
      const positive = [prompt, settings.default_positive].filter(Boolean).join(', ');
      const generated = await window.NovelAIConnection.generate(settings, model, key, positive, negative);
      if (typeof releaseNaiResultObjectUrl === 'function') releaseNaiResultObjectUrl();
      document.getElementById('nai-result-image').src = generated.imageUrl;
      result.style.display = 'block';
    } catch (e) {
      error.style.display = 'block'; error.textContent = '生成失败: ' + e.message;
    } finally {
      status.style.display = 'none'; button.disabled = false; button.textContent = '生成图像';
    }
  }
