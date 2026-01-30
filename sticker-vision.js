// ========================================
// 表情包识图功能模块
// ========================================

/**
 * 获取表情包识别缓存
 * @param {string} stickerUrl - 表情包URL
 * @returns {Promise<string|null>} - 返回缓存的描述或null
 */
async function getStickerVisionCache(stickerUrl) {
  try {
    const cache = await db.stickerVisionCache.get(stickerUrl);
    if (cache && cache.description) {
      return cache.description;
    }
  } catch (error) {
    console.error('[表情包识图缓存] 读取失败:', error);
  }
  return null;
}

/**
 * 保存表情包识别缓存
 * @param {string} stickerUrl - 表情包URL
 * @param {string} description - AI识别的描述
 */
async function saveStickerVisionCache(stickerUrl, description) {
  try {
    await db.stickerVisionCache.put({
      url: stickerUrl,
      description: description,
      timestamp: Date.now()
    });
    console.log('[表情包识图缓存] 保存成功:', stickerUrl);
  } catch (error) {
    console.error('[表情包识图缓存] 保存失败:', error);
  }
}

/**
 * 调用Vision API识别图片
 * @param {string} imageUrl - 图片URL
 * @returns {Promise<string>} - 识别结果
 */
async function callVisionAPI(imageUrl) {
  // 优先使用主API
  const {
    proxyUrl,
    apiKey,
    model
  } = state.apiConfig;

  if (!proxyUrl || !apiKey || !model) {
    throw new Error("API未配置或配置不完整");
  }

  const prompt = '请用一句简短的话描述这个表情包的内容和情绪，不超过20字。';
  
  let isGemini = proxyUrl.includes('generativelanguage');
  let response;

  try {
    if (isGemini) {
      // Gemini API 需要先下载图片转为base64
      const imageResponse = await fetch(imageUrl);
      const blob = await imageResponse.blob();
      const base64Data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(blob);
      });

      const mimeType = blob.type || 'image/jpeg';
      const payload = {
        contents: [{
          parts: [{
              text: prompt
            },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            }
          ]
        }]
      };

      response = await fetch(`${proxyUrl}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } else {
      // OpenAI 兼容 API
      const payload = {
        model: model,
        messages: [{
          role: 'user',
          content: [{
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl
              }
            }
          ]
        }],
        max_tokens: 100
      };

      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API 错误: ${errorData.error?.message || errorData.message || '未知错误'}`);
    }

    const data = await response.json();
    const description = isGemini ? getGeminiResponseText(data) : data.choices[0].message.content;
    
    return description.trim();
  } catch (error) {
    console.error('[表情包识图] API调用失败:', error);
    throw error;
  }
}

/**
 * 识别表情包内容（带缓存）
 * @param {string} stickerUrl - 表情包URL
 * @param {string} stickerName - 表情包名称（作为fallback）
 * @param {boolean} forceRecognize - 是否强制重新识别
 * @returns {Promise<string>} - 返回识别结果
 */
async function recognizeSticker(stickerUrl, stickerName, forceRecognize = false) {
  // 1. 检查缓存
  if (!forceRecognize) {
    const cached = await getStickerVisionCache(stickerUrl);
    if (cached) {
      console.log('[表情包识图] 使用缓存:', cached);
      return cached;
    }
  }

  // 2. 尝试AI识别
  try {
    const description = await callVisionAPI(stickerUrl);
    // 3. 保存缓存
    await saveStickerVisionCache(stickerUrl, description);
    return description;
  } catch (error) {
    console.warn('[表情包识图] AI识别失败，使用名称:', error);
    // 4. 失败时使用表情包名称
    return stickerName || '表情';
  }
}

console.log('✅ [表情包识图] 模块已加载');
