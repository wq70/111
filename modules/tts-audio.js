// ============================================================
// tts-audio.js — TTS 语音播放、真实录音播放、双语翻译
// 来源：script.js 第 53313 ~ 53978 行
// ============================================================

  function playSilentAudio() {
    const silentPlayer = document.getElementById('silent-audio-player');
    if (silentPlayer) {

      const playPromise = silentPlayer.play();
      if (playPromise !== undefined) {
        playPromise.then(_ => {
          console.log("静音音频已启动，用于后台活动保活。");
        }).catch(error => {


          console.warn("无法自动播放静音音频（这在iOS首次加载时是正常现象）:", error);
        });
      }
    }
  }


  function stopSilentAudio() {
    const silentPlayer = document.getElementById('silent-audio-player');
    if (silentPlayer && !silentPlayer.paused) {
      silentPlayer.pause();
      silentPlayer.currentTime = 0;
      console.log("静音音频已停止。");
    }
  }


  function hexToUint8Array(hexString) {
    if (!hexString) return new Uint8Array();
    const arrayBuffer = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
      arrayBuffer[i / 2] = parseInt(hexString.substr(i, 2), 16);
    }
    return arrayBuffer;
  }
  // --- TTS 播放队列（修复：前一条没读完就跳到最后一条的问题） ---
  const ttsQueue = [];
  let isTtsPlaying = false;

  function stopTtsQueue() {
    ttsQueue.length = 0;
    isTtsPlaying = false;
    const callPlayer = document.getElementById('call-tts-audio-player');
    if (callPlayer) {
      callPlayer.onended = null;
      callPlayer.onerror = null;
      callPlayer.pause();
      callPlayer.src = '';
    }
  }

  // 单条语音消息播放状态（用于同一条点两次=暂停/取消，退出聊天=停播）
  let currentTtsMessageKey = '';
  let currentTtsLoading = false;
  let ttsAbortController = null;

  /** 只停聊天语音条播放，不清通话 TTS 队列（打着电话切到别人聊天时用） */
  function stopChatMessageTtsOnly() {
    if (ttsAbortController) {
      ttsAbortController.abort();
      ttsAbortController = null;
    }
    currentTtsMessageKey = '';
    currentTtsLoading = false;
    const ttsPlayer = document.getElementById('tts-audio-player');
    if (ttsPlayer) {
      ttsPlayer.onended = null;
      ttsPlayer.onpause = null;
      ttsPlayer.pause();
      ttsPlayer.src = '';
      delete ttsPlayer.dataset.currentText;
      delete ttsPlayer.dataset.currentVoiceId;
      delete ttsPlayer.dataset.currentMessageKey;
    }
    document.querySelectorAll('.voice-play-btn').forEach(btn => { btn.textContent = '▶'; });
    document.querySelectorAll('.voice-message-body .loading-spinner').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.voice-message-body .voice-play-btn').forEach(btn => { btn.style.display = 'flex'; });
  }

  function stopAllTtsPlayback() {
    stopTtsQueue();
    stopChatMessageTtsOnly();
  }

  async function processNextTts() {
    if (ttsQueue.length === 0) {
      isTtsPlaying = false;
      return;
    }

    isTtsPlaying = true;
    const { text, voiceId } = ttsQueue.shift();

    try {
      const { minimaxGroupId, minimaxApiKey } = state.apiConfig;
      if (!minimaxGroupId || !minimaxApiKey || !voiceId) {
        processNextTts();
        return;
      }

      console.log(`[TTS队列] 正在朗读 (剩余${ttsQueue.length}条): ${text}`);

      const savedDomain = state.apiConfig.minimaxDomain || localStorage.getItem('minimax-domain') || 'https://api.minimax.chat';
      const modelId = state.apiConfig.minimaxModel || "speech-01-hd";

      const response = await fetch(`${savedDomain}/v1/t2a_v2?GroupId=${minimaxGroupId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${minimaxApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          text: text,
          stream: false,
          voice_setting: {
            voice_id: voiceId,
            speed: 1.0,
            vol: 1.0,
            pitch: 0
          },
          audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: "mp3",
            channel: 1
          }
        })
      });

      if (!response.ok) throw new Error("API请求失败");

      const data = await response.json();
      if (data.base_resp && data.base_resp.status_code !== 0) throw new Error(data.base_resp.status_msg);

      const audioHex = data.data?.audio;
      if (!audioHex) {
        processNextTts();
        return;
      }

      const audioBytes = hexToUint8Array(audioHex);
      const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);

      const callPlayer = document.getElementById('call-tts-audio-player');
      callPlayer.src = audioUrl;
      callPlayer.dataset.currentText = text;

      // 播完这条再播下一条
      callPlayer.onended = () => {
        URL.revokeObjectURL(audioUrl);
        processNextTts();
      };
      callPlayer.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        processNextTts();
      };

      await callPlayer.play();

    } catch (error) {
      console.error("TTS生成失败:", error);
      processNextTts(); // 失败也继续下一条
    }
  }

  // --- 视频/语音通话专用 TTS 播放函数（队列版） ---
  function playVideoCallPureTTS(text, voiceId) {
    // 1. 正则去除括号及括号内的内容
    let cleanText = text.replace(/(\[.*?\]|\(.*?\)|（.*?）|【.*?】)/g, '').trim();
    if (!cleanText) return;

    // 1.5. 处理"仅读取对话"功能
    if (state.activeChatId && state.chats[state.activeChatId]) {
      const chat = state.chats[state.activeChatId];
      if (chat.videoOptimization && chat.videoOptimization.ttsDialogueOnly) {
        cleanText = extractDialogueOnly(cleanText);
        console.log('[视频通话TTS] 仅读取对话模式：', cleanText);
      }
    }

    if (!cleanText) return;

    // 2. 检查配置
    const { minimaxGroupId, minimaxApiKey } = state.apiConfig;
    if (!minimaxGroupId || !minimaxApiKey || !voiceId) return;

    // 3. 推入队列，串行处理
    ttsQueue.push({ text: cleanText, voiceId });

    if (!isTtsPlaying) {
      processNextTts();
    }
  }
  // 播放真实录音
  async function playRealAudio(bodyElement) {
    const audioData = bodyElement.dataset.audio;
    const audioMime = bodyElement.dataset.audioMime || 'audio/webm';

    if (!audioData) {
      console.error('没有找到音频数据');
      return;
    }

    try {
      const audioDataDecoded = decodeURIComponent(audioData);

      // 创建音频播放器
      let realAudioPlayer = document.getElementById('real-audio-player');
      if (!realAudioPlayer) {
        realAudioPlayer = document.createElement('audio');
        realAudioPlayer.id = 'real-audio-player';
        realAudioPlayer.style.display = 'none';
        document.body.appendChild(realAudioPlayer);
      }

      // 如果正在播放同一条语音，暂停
      if (!realAudioPlayer.paused && realAudioPlayer.dataset.currentAudio === audioData) {
        realAudioPlayer.pause();
        return;
      }

      // 停止之前的播放
      realAudioPlayer.pause();

      // 设置新的音频源
      realAudioPlayer.src = audioDataDecoded;
      realAudioPlayer.dataset.currentAudio = audioData;

      // 播放音频
      await realAudioPlayer.play();
      console.log('播放真实录音');

    } catch (error) {
      console.error('播放录音失败:', error);
      alert('播放录音失败');
    }
  }

  async function playTtsAudio(bodyElement) {
    const bubble = bodyElement.closest('.message-bubble');
    const messageKey = (state.activeChatId || '') + '_' + (bubble?.dataset?.timestamp || '');

    let text = decodeURIComponent(bodyElement.dataset.text);

    // 1. 获取 Voice ID
    let voiceId = bodyElement.dataset.voiceId;
    // 新增：初始化语言设置，默认为普通话
    let ttsLanguage = 'zh-CN';

    if (state.activeChatId && state.chats[state.activeChatId]) {
      const chat = state.chats[state.activeChatId];
      if (!chat.isGroup && chat.settings.enableTts !== false) {
        // 优先使用标签上的ID，如果没有则用设置里的
        if (!voiceId) voiceId = chat.settings.minimaxVoiceId;
        // 【关键修复】获取用户在设置中选择的语言/方言
        if (chat.settings.ttsLanguage) ttsLanguage = chat.settings.ttsLanguage;
      }

      // 处理"仅读取对话"功能
      if (chat.videoOptimization && chat.videoOptimization.ttsDialogueOnly) {
        // extractDialogueOnly 会返回引号内容或原文，不会返回空
        text = extractDialogueOnly(text);
        console.log('TTS仅读取对话模式：', text);
      }
    }

    if (!voiceId) {
      alert("错误：无法获取 Voice ID。请检查角色设置。");
      return;
    }

    const button = bodyElement.querySelector('.voice-play-btn');
    const spinner = bodyElement.querySelector('.loading-spinner');
    const ttsPlayer = document.getElementById('tts-audio-player');

    // 同一条消息点第二次：正在播放则暂停，正在请求则取消
    if (messageKey && messageKey === currentTtsMessageKey) {
      if (!ttsPlayer.paused && ttsPlayer.dataset.currentMessageKey === messageKey) {
        ttsPlayer.pause();
        currentTtsMessageKey = '';
        if (button) button.textContent = '▶';
        return;
      }
      if (currentTtsLoading && ttsAbortController) {
        ttsAbortController.abort();
        currentTtsMessageKey = '';
        currentTtsLoading = false;
        spinner.style.display = 'none';
        if (button) button.style.display = 'flex';
        return;
      }
    }

    ttsPlayer.pause();
    document.querySelectorAll('.voice-play-btn').forEach(btn => btn.textContent = '▶');

    // 2. 检查缓存 (Key加入语言区分，防止切换方言后读到旧缓存)
    const cacheKey = `tts_v2_${voiceId}_${ttsLanguage}_${text}`;
    let cachedAudio = state.ttsCache.get(cacheKey);
    if (cachedAudio) {
      console.log("从缓存播放 TTS...");
      currentTtsMessageKey = messageKey;
      await playAudioFromData(cachedAudio.url, cachedAudio.type, text, voiceId, bodyElement, messageKey, () => { currentTtsMessageKey = ''; });
      return;
    }

    currentTtsMessageKey = messageKey;
    currentTtsLoading = true;
    ttsAbortController = new AbortController();
    const signal = ttsAbortController.signal;

    console.log(`请求 Minimax T2A v2... VoiceID: ${voiceId}, Language: ${ttsLanguage}`);
    if (button) button.style.display = 'none';
    spinner.style.display = 'block';

    const {
      minimaxGroupId,
      minimaxApiKey
    } = state.apiConfig;

    const languageMap = {
      'zh-CN': 'Chinese',
      'zh-HK': 'Chinese,Yue',   // 粤语特殊处理
      'en-US': 'English',
      'ja-JP': 'Japanese',
      'ko-KR': 'Korean',
      'de-DE': 'German',
      'fr-FR': 'French',
      'es-ES': 'Spanish',
      'it-IT': 'Italian',
      'ru-RU': 'Russian',
      'pt-BR': 'Portuguese',
      'nl-NL': 'Dutch',
      'pl-PL': 'Polish',
      'sv-SE': 'Swedish',
      'tr-TR': 'Turkish',
      'id-ID': 'Indonesian',
      'ms-MY': 'Malay',
      'vi-VN': 'Vietnamese',
      'th-TH': 'Thai',
      'hi-IN': 'Hindi',
      'ar-SA': 'Arabic'
    };

    // 获取对应的 boost 值，如果没有匹配到就默认 'auto'
    const boostValue = languageMap[ttsLanguage] || 'auto';

    // 2. 发送请求 (注意 language_boost 的位置)
    try {
      const savedDomain = state.apiConfig.minimaxDomain || localStorage.getItem('minimax-domain') || 'https://api.minimax.chat';
      const minimaxBaseUrl = savedDomain;
      const modelId = state.apiConfig.minimaxModel || "speech-01-hd";

      const response = await fetch(`${minimaxBaseUrl}/v1/t2a_v2?GroupId=${minimaxGroupId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${minimaxApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          text: text,
          stream: false,


          language_boost: boostValue,

          voice_setting: {
            voice_id: voiceId,
            speed: 1.0,
            vol: 1.0,
            pitch: 0
          },
          audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: "mp3",
            channel: 1
          }
        }),
        signal
      });

      if (!response.ok) {
        let errorMsg = `API 失败: ${response.status}`;
        try {
          const errJson = await response.json();
          errorMsg += ` - ${errJson.base_resp?.status_msg || JSON.stringify(errJson)}`;
        } catch (e) { }
        throw new Error(errorMsg);
      }

      const data = await response.json();

      // 4. 检查业务状态码
      if (data.base_resp && data.base_resp.status_code !== 0) {
        throw new Error(`API 错误: ${data.base_resp.status_msg}`);
      }

      // 5. 解析 Hex 音频数据
      const audioHex = data.data?.audio;
      if (!audioHex) throw new Error("API 未返回音频数据");

      const audioBytes = hexToUint8Array(audioHex);
      const audioBlob = new Blob([audioBytes], {
        type: 'audio/mpeg'
      });
      const audioUrl = URL.createObjectURL(audioBlob);

      await playAudioFromData(audioUrl, 'audio/mpeg', text, voiceId, bodyElement, messageKey, () => { currentTtsMessageKey = ''; });

      // 写入缓存
      const reader = new FileReader();
      reader.onloadend = function () {
        state.ttsCache.set(cacheKey, {
          url: reader.result,
          type: 'audio/mpeg'
        });
      }
      reader.readAsDataURL(audioBlob);

    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error("TTS 生成失败:", error);
      await showCustomAlert("语音生成失败", `错误: ${error.message}`);
    } finally {
      currentTtsLoading = false;
      ttsAbortController = null;
      spinner.style.display = 'none';
      if (button) button.style.display = 'flex';
    }
  }


  function playAudioFromData(audioSrc, audioType, text, voiceId, bodyElement, messageKey, onEndedCallback) {
    return new Promise((resolve, reject) => {
      const ttsPlayer = document.getElementById('tts-audio-player');

      ttsPlayer.src = audioSrc;
      ttsPlayer.type = audioType;
      ttsPlayer.dataset.currentText = text;
      ttsPlayer.dataset.currentVoiceId = voiceId;
      if (messageKey) ttsPlayer.dataset.currentMessageKey = messageKey;

      const playPromise = ttsPlayer.play();

      if (playPromise !== undefined) {
        playPromise.then(() => {
          const button = bodyElement.querySelector('.voice-play-btn');
          if (button) button.textContent = '❚❚';


          resolve();
        }).catch(error => {
          console.error("音频播放失败:", error);
          reject(error);
        });
      }

      ttsPlayer.onended = () => {
        const button = bodyElement.querySelector('.voice-play-btn');
        if (button) button.textContent = '▶';
        if (typeof onEndedCallback === 'function') onEndedCallback();
      };
      ttsPlayer.onpause = () => {
        const button = bodyElement.querySelector('.voice-play-btn');
        if (button) button.textContent = '▶';
      };
    });
  }




  function toggleVoiceTranscript(bodyElement) {
    const bubble = bodyElement.closest('.message-bubble');
    if (!bubble) return;

    const transcriptEl = bubble.querySelector('.voice-transcript');
    const text = decodeURIComponent(bodyElement.dataset.text);

    if (transcriptEl.style.display === 'block') {

      transcriptEl.style.display = 'none';
    } else {
      // 【双语模式】检查是否有原始双语内容
      const originalContent = bodyElement.dataset.originalContent;
      
      if (originalContent) {
        // 有双语内容：显示外语 + 中文翻译
        const decodedOriginal = decodeURIComponent(originalContent);
        
        // 提取外语部分（去掉〖〗中的内容）
        const foreignText = decodedOriginal.replace(/[〖【][^〗】]*[〗】]/g, '').trim();
        
        // 提取中文翻译
        const translationMatches = decodedOriginal.match(/[〖【]\s*([^〗】]+?)\s*[〗】]/g);
        let translation = '';
        if (translationMatches && translationMatches.length > 0) {
          translation = translationMatches
            .map(m => m.replace(/[〖【〗】]/g, '').trim())
            .filter(t => t.length > 0)
            .join(' ');
        }
        
        // 构建显示内容：外语 + 换行 + 中文翻译
        if (translation) {
          transcriptEl.innerHTML = `
            <div style="margin-bottom: 6px;">${foreignText}</div>
            <div style="color: var(--text-secondary); font-size: 0.92em; opacity: 0.85; border-top: 1px solid rgba(0,0,0,0.06); padding-top: 6px; margin-top: 6px;">${translation}</div>
          `;
        } else {
          // 没有找到翻译，只显示外语
          transcriptEl.textContent = foreignText;
        }
      } else {
        // 没有双语内容，正常显示
        transcriptEl.textContent = text;
      }
      
      transcriptEl.style.display = 'block';
    }
  }

  // 双语翻译切换函数
  function toggleBilingualTranslation(bubble, chat) {
    const originalContent = bubble.dataset.originalContent;
    if (!originalContent) return; // 没有双语内容
    
    const isShowingTranslation = bubble.dataset.showingTranslation === 'true';
    const contentEl = bubble.querySelector('.content');
    const displayMode = chat.settings.bilingualDisplayMode || 'outside';
    
    // 检查是否是语音消息
    const isVoiceMessage = bubble.classList.contains('is-voice-message');
    
    if (isShowingTranslation) {
      // 隐藏翻译
      if (isVoiceMessage) {
        // 语音消息：在 voice-transcript 区域隐藏翻译
        const transcriptEl = bubble.querySelector('.voice-transcript');
        if (transcriptEl) {
          transcriptEl.textContent = '';
          transcriptEl.style.display = 'none';
        }
      } else {
        // 文本消息：原有逻辑
        if (displayMode === 'inside') {
          // 内部模式：恢复只显示外语
          const englishOnly = originalContent.replace(/[〖【][^〗】]*[〗】]/g, '');
          contentEl.innerHTML = parseMarkdown(englishOnly).replace(/\n/g, '<br>');
        } else {
          // 外部模式：移除翻译元素（从wrapper中移除）
          const contentRow = bubble.closest('.message-content-row');
          const wrapper = contentRow ? contentRow.parentElement : null;
          if (wrapper) {
            const transEl = wrapper.querySelector('.translation-bubble');
            if (transEl) transEl.remove();
          }
        }
      }
      bubble.dataset.showingTranslation = 'false';
    } else {
      // 显示翻译
      const translation = extractBilingualTranslation(originalContent, bubble);
      if (!translation) {
        console.warn('[双语模式] 未找到翻译内容，AI可能未按格式输出');
        return;
      }
      
      if (isVoiceMessage) {
        // 语音消息：在 voice-transcript 区域显示翻译
        const transcriptEl = bubble.querySelector('.voice-transcript');
        if (transcriptEl) {
          transcriptEl.textContent = `翻译：${translation}`;
          transcriptEl.style.display = 'block';
          transcriptEl.style.marginTop = '8px';
          transcriptEl.style.fontSize = '13px';
          transcriptEl.style.color = 'var(--text-secondary)';
          transcriptEl.style.opacity = '0.85';
        }
      } else {
        // 文本消息：原有逻辑
        if (displayMode === 'inside') {
          // 内部模式：外语 + 翻译（用换行分隔）
          const englishOnly = originalContent.replace(/[〖【][^〗】]*[〗】]/g, '');
          contentEl.innerHTML = parseMarkdown(englishOnly).replace(/\n/g, '<br>') + 
            '<br><span style="color: var(--text-secondary); font-size: 0.95em;">' + 
            translation + '</span>';
        } else {
          // 外部模式：在wrapper中添加翻译气泡（作为contentRow的兄弟元素）
          const contentRow = bubble.closest('.message-content-row');
          const wrapper = contentRow ? contentRow.parentElement : null;
          if (wrapper) {
            const transEl = document.createElement('div');
            transEl.className = 'translation-bubble';
            transEl.textContent = translation;
            transEl.dataset.linkedBubble = bubble.dataset.timestamp || Date.now();
            
            // 添加到wrapper的末尾（contentRow下方）
            wrapper.appendChild(transEl);
          }
        }
      }
      bubble.dataset.showingTranslation = 'true';
    }
  }

  // 提取双语翻译内容
  function extractBilingualTranslation(content, bubble) {
    // 检查缓存
    if (bubble.dataset.cachedTranslation) {
      return bubble.dataset.cachedTranslation;
    }
    
    // 【调试日志】
    console.log('[双语调试] 原始内容:', content);
    console.log('[双语调试] 内容长度:', content.length);
    console.log('[双语调试] 包含〖:', content.includes('〖'));
    console.log('[双语调试] 包含〗:', content.includes('〗'));
    
    // 【预处理】清理可能的隐藏字符和统一符号
    let cleanedContent = content
      // 清理零宽字符
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // 统一全角括号为〖〗
      .replace(/【/g, '〖')
      .replace(/】/g, '〗')
      // 清理可能的多余空格
      .trim();
    
    console.log('[双语调试] 清理后内容:', cleanedContent);
    
    // 【增强正则】支持多种格式
    // 1. 标准格式：〖中文〗
    // 2. 带空格：〖 中文 〗
    // 3. 换行格式：\n〖中文〗
    const matches = cleanedContent.match(/[〖【]\s*([^〗】]+?)\s*[〗】]/g);
    
    console.log('[双语调试] 匹配结果:', matches);
    
    if (!matches || matches.length === 0) {
      console.warn('[双语调试] 未匹配到翻译内容！');
      return null;
    }
    
    // 提取括号内的内容
    const translation = matches
      .map(m => m.replace(/[〖【〗】]/g, '').trim())
      .filter(t => t.length > 0)
      .join(' ');
    
    console.log('[双语调试] 提取的翻译:', translation);
    
    // 缓存结果
    bubble.dataset.cachedTranslation = translation;
    
    return translation;
  }

  // ========== 全局暴露 ==========
  window.playTtsAudio = playTtsAudio;
  window.playRealAudio = playRealAudio;
  window.playSilentAudio = playSilentAudio;
