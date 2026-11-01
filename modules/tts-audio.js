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

  // 参考并改写自 yxlforever/YYY：
  // https://github.com/yxlforever/YYY/commit/ece2d6bec633ced55c89af3871f96c97ebf3aa7e
  // 用途：限制仅用于加速播放的临时 TTS 内存缓存，并确保 Blob URL、请求与 FileReader 可释放。
  // 本实现不删除聊天、语音消息或任何持久化用户数据，也不改变原有 TTS 入口与配置。
  const TTS_CACHE_MAX = 15;
  let currentCallTtsObjectUrl = null;
  let currentChatTtsObjectUrl = null;
  let callTtsAbortController = null;
  let callTtsGeneration = 0;
  let currentCallTtsItem = null;
  let chatTtsGeneration = 0;
  let activeTtsCacheReader = null;

  function revokeCallTtsUrl() {
    if (!currentCallTtsObjectUrl) return;
    try { URL.revokeObjectURL(currentCallTtsObjectUrl); } catch (error) { }
    currentCallTtsObjectUrl = null;
  }

  function revokeChatTtsUrl() {
    if (!currentChatTtsObjectUrl) return;
    try { URL.revokeObjectURL(currentChatTtsObjectUrl); } catch (error) { }
    currentChatTtsObjectUrl = null;
  }

  function trimTtsCache() {
    if (!state.ttsCache || typeof state.ttsCache.size !== 'number') return;
    while (state.ttsCache.size > TTS_CACHE_MAX) {
      const oldestKey = state.ttsCache.keys().next().value;
      state.ttsCache.delete(oldestKey);
    }
  }

  function stopTtsQueue() {
    callTtsGeneration++;
    if (callTtsAbortController) {
      callTtsAbortController.abort();
      callTtsAbortController = null;
    }
    ttsQueue.length = 0;
    currentCallTtsItem = null;
    isTtsPlaying = false;
    const callPlayer = document.getElementById('call-tts-audio-player');
    if (callPlayer) {
      callPlayer.onended = null;
      callPlayer.onerror = null;
      callPlayer.pause();
      callPlayer.removeAttribute('src');
      try { callPlayer.load(); } catch (error) { }
    }
    revokeCallTtsUrl();
  }

  // 单条语音消息播放状态（用于同一条点两次=暂停/取消，退出聊天=停播）
  let currentTtsMessageKey = '';
  let currentTtsLoading = false;
  let ttsAbortController = null;
  let pendingChatTtsAudio = null;
  let chatTtsStream = null;
  let currentChatTtsResult = null;
  const activeAiVoiceDownloads = new Set();

  /** 只停聊天语音条播放，不清通话 TTS 队列（打着电话切到别人聊天时用） */
  function stopChatMessageTtsOnly() {
    chatTtsGeneration++;
    chatTtsStream?.dispose(); chatTtsStream = null;
    currentChatTtsResult = null;
    if (ttsAbortController) {
      ttsAbortController.abort();
      ttsAbortController = null;
    }
    currentTtsMessageKey = '';
    currentTtsLoading = false;
    if (activeTtsCacheReader) {
      try { activeTtsCacheReader.abort(); } catch (error) { }
      activeTtsCacheReader = null;
    }
    const ttsPlayer = document.getElementById('tts-audio-player');
    if (ttsPlayer) {
      ttsPlayer.onended = null;
      ttsPlayer.onpause = null;
      ttsPlayer.pause();
      ttsPlayer.removeAttribute('src');
      try { ttsPlayer.load(); } catch (error) { }
      delete ttsPlayer.dataset.currentText;
      delete ttsPlayer.dataset.currentVoiceId;
      delete ttsPlayer.dataset.currentMessageKey;
      delete ttsPlayer.dataset.currentTtsCacheKey;
    }
    revokeChatTtsUrl();
    document.querySelectorAll('.voice-play-btn').forEach(btn => { btn.textContent = '▶'; });
    document.querySelectorAll('.voice-message-body .loading-spinner').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.voice-message-body .voice-play-btn').forEach(btn => { btn.style.display = 'flex'; });
  }

  function stopAllTtsPlayback() {
    stopTtsQueue();
    stopChatMessageTtsOnly();
    window.ttsSettings?.stopPreview();
  }

  function reportTtsError(title, error) {
    const detail = error.name === 'NotAllowedError'
      ? '浏览器阻止自动播放，请再次点击播放；通话中可使用文字回复或重新进入通话。'
      : error.message || '请检查语音配置或网络后重试';
    const toast = showToast(title + '，点击查看原因', 'error', 5000);
    toast?.addEventListener('click', () => showCustomAlert(title, ttsAlertText(detail)));
  }

  async function processNextTts() {
    if (!ttsQueue.length) { isTtsPlaying = false; currentCallTtsItem = null; return; }
    isTtsPlaying = true;
    const item = ttsQueue.shift(), generation = callTtsGeneration;
    currentCallTtsItem = item;
    const controller = new AbortController(); callTtsAbortController = controller;
    try {
      const parts = window.ttsProvider.segments(item.text, item.chat, item.config);
      const playPart = async index => {
        if (generation !== callTtsGeneration || controller.signal.aborted) return;
        const part = parts[index];
        const blob = await window.ttsProvider.generate({ ...item.config, language: part.language }, part.text, controller.signal);
        if (generation !== callTtsGeneration || controller.signal.aborted) return;
        revokeCallTtsUrl(); currentCallTtsObjectUrl = URL.createObjectURL(blob);
        const player = document.getElementById('call-tts-audio-player');
        player.src = currentCallTtsObjectUrl; player.dataset.currentText = part.text;
        const next = () => {
          if (generation !== callTtsGeneration) return;
          revokeCallTtsUrl();
          if (index + 1 < parts.length) playPart(index + 1).catch(fail);
          else { if (callTtsAbortController === controller) callTtsAbortController = null; processNextTts(); }
        };
        player.onended = next;
        player.onerror = item.config.provider !== 'minimax'
          ? () => fail(new Error('浏览器无法播放返回的音频，请检查音色、模型或接口地址')) : next;
        await player.play();
      };
      const fail = error => {
        if (error.name === 'AbortError' || generation !== callTtsGeneration) return;
        revokeCallTtsUrl();
        console.error('TTS生成或播放失败:', error);
        if (item.config.provider !== 'minimax') {
          stopTtsQueue();
          reportTtsError('通话朗读已停止', error);
        } else { processNextTts(); }
      };
      if (!parts.length) { processNextTts(); return; }
      await playPart(0);
    } catch (error) {
      if (error.name !== 'AbortError' && generation === callTtsGeneration) {
        revokeCallTtsUrl();
        if (item.config.provider !== 'minimax') { stopTtsQueue(); reportTtsError('通话朗读已停止', error); }
        else { console.error('TTS生成失败:', error); processNextTts(); }
      }
    }
  }

  // Freeze the call's owning character and settings before queueing.
  function playVideoCallPureTTS(text, voiceId, chatId = state.activeChatId, timestamp) {
    const chat = state.chats[chatId];
    if (!chat || chat.isGroup || chat.settings.enableTts === false) return;
    const config = window.ttsProvider.resolve(chat, { voiceId, context: 'call' });
    // Preserve the original MiniMax silent skip for incomplete configuration.
    if (config.provider === 'minimax' && (!config.apiKey || !config.groupId || !config.voiceId)) return;
    // Keep translations until segments() selects the read mode, then clean once.
    const rawText = String(text || '').trim();
    if (!rawText) return;
    // 朗读只需要语言与动作过滤设置，不能把整份历史和记忆留在播放队列中。
    ttsQueue.push({ text: rawText, config, chatId, timestamp, chat: { settings: { ...chat.settings,
      languagePolicy: chat.settings.languagePolicy ? JSON.parse(JSON.stringify(chat.settings.languagePolicy)) : undefined },
      videoOptimization: { ...(chat.videoOptimization || {}) } } });
    if (!isTtsPlaying) processNextTts();
  }
  function cancelCallMessageTts(chatId, timestamp) {
    const matches = item => item.chatId === chatId && item.timestamp === timestamp;
    const remaining = ttsQueue.filter(item => !matches(item));
    if (currentCallTtsItem && matches(currentCallTtsItem)) {
      stopTtsQueue(); ttsQueue.push(...remaining); if (ttsQueue.length) processNextTts();
    } else { ttsQueue.splice(0, ttsQueue.length, ...remaining); }
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
      realAudioPlayer.onended = () => {
        realAudioPlayer.removeAttribute('src');
        delete realAudioPlayer.dataset.currentAudio;
        try { realAudioPlayer.load(); } catch (error) { }
      };
      realAudioPlayer.onerror = realAudioPlayer.onended;

      // 播放音频
      await realAudioPlayer.play();
      console.log('播放真实录音');

    } catch (error) {
      console.error('播放录音失败:', error);
      alert('播放录音失败');
    }
  }

  function messageTtsRequest(body, chat) {
    const service = window.ttsProvider.provider(chat);
    const fallback = service === 'minimax' && (!body.dataset.ttsProvider || body.dataset.ttsProvider === service)
      ? body.dataset.voiceId : '';
    const config = window.ttsProvider.resolve(chat, { voiceId: fallback });
    const raw = decodeURIComponent(service !== 'minimax' && body.dataset.originalContent
      ? body.dataset.originalContent : body.dataset.text || '');
    const parts = window.ttsProvider.segments(raw, chat, config);
    if (!parts.length) throw new Error('没有可朗读的文本');
    const text = parts.map(part => part.text).join('。');
    const cacheKey = parts.map(part => window.ttsProvider.cacheKey({ ...config, language: part.language }, part.text)).join('|');
    return { config, parts, text, voiceId: config.voiceId, cacheKey };
  }

  const ttsAlertText = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  function savedMessageAudio(message) {
    if (message?.ttsSavedAudio?.length) return message.ttsSavedAudio.map(part => part.data);
    return [];
  }

  // MSE is optional: unsupported browsers reuse the completed audio from the same request.
  function openTtsStream(player, isCurrent, onEnded, button) {
    if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported('audio/mpeg')) return null;
    const source = new MediaSource(), pending = [];
    let buffer = null, ended = false, failed = false, received = false, blocked = false, fallback = null;
    const fail = () => { failed = true; pending.length = 0; fallback?.(); };
    const url = URL.createObjectURL(source);
    revokeChatTtsUrl(); currentChatTtsObjectUrl = url;
    player.src = url;
    const drain = () => {
      if (!isCurrent() || failed || !buffer || buffer.updating || source.readyState !== 'open') return;
      try {
        if (pending.length) buffer.appendBuffer(pending.shift());
        else if (ended) source.endOfStream();
      } catch (_) { fail(); }
    };
    source.addEventListener('sourceopen', () => {
      if (!isCurrent()) return;
      try { buffer = source.addSourceBuffer('audio/mpeg'); buffer.addEventListener('updateend', drain); buffer.addEventListener('error', fail); drain(); }
      catch (_) { fail(); }
    }, { once: true });
    player.onended = onEnded;
    player.onerror = fail;
    player.onpause = () => { if (button) button.textContent = '▶'; };
    return {
      push(chunk) {
        if (!isCurrent() || failed) return;
        received = true; pending.push(chunk.slice().buffer); drain();
        if (player.paused && !blocked) {
          player.play().then(() => { if (button) { button.textContent = '❚❚'; button.style.display = 'flex'; } })
            .catch(() => { blocked = true; });
        }
      },
      finish() { ended = true; drain(); return received && !failed && !blocked; },
      setFallback(fn) { fallback = () => { const handler = fn; fallback = null; handler(); }; },
      dispose() { failed = true; pending.length = 0; fallback = null; if (buffer) { buffer.removeEventListener('updateend', drain); buffer.removeEventListener('error', fail); } }
    };
  }

  async function persistTtsAudio(chat, message, blobs) {
    if (!chat.settings.ttsSaveAudio || !message || savedMessageAudio(message).length) return;
    if (blobs.reduce((sum, blob) => sum + blob.size, 0) > 12 * 1024 * 1024) {
      showToast('这条音频超过 12 MB，保留临时缓存，可直接下载', 'info'); return;
    }
    const data = await Promise.all(blobs.map(blob => new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve({ data: reader.result, type: blob.type });
      reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
    })));
    if (!chat.history.includes(message)) return;
    message.ttsSavedAudio = data;
    try { await db.chats.put(chat); }
    catch (error) { delete message.ttsSavedAudio; showToast('音频已生成，但本地保存失败；仍可播放和下载', 'error'); }
  }

  async function playTtsAudio(bodyElement) {
    const chat = state.chats[state.activeChatId];
    if (!chat || chat.isGroup || chat.settings.enableTts === false) return;
    const bubble = bodyElement.closest('.message-bubble');
    const messageKey = chat.id + '_' + (bubble?.dataset?.timestamp || '');
    const message = chat.history.find(item => String(item.timestamp) === String(bubble?.dataset?.timestamp));
    const button = bodyElement.querySelector('.voice-play-btn'), spinner = bodyElement.querySelector('.loading-spinner');
    const player = document.getElementById('tts-audio-player');
    if (messageKey === currentTtsMessageKey) {
      if (!player.paused) { stopChatMessageTtsOnly(); return; }
      if (currentTtsLoading) { stopChatMessageTtsOnly(); return; }
    }
    stopChatMessageTtsOnly();
    const generation = chatTtsGeneration;
    const controller = new AbortController(); ttsAbortController = controller;
    currentTtsMessageKey = messageKey; currentTtsLoading = true;
    if (button) button.style.display = 'none'; if (spinner) spinner.style.display = 'block';
    let pending;
    try {
      const saved = savedMessageAudio(message);
      const request = saved.length ? null : messageTtsRequest(bodyElement, chat);
      const text = request?.text || decodeURIComponent(bodyElement.dataset.text || '');
      const voiceId = request?.voiceId || '', blobs = [];
      if (request && request.config.provider !== 'minimax' && request.config.streaming && request.parts.length === 1) {
        player.dataset.currentText = text; player.dataset.currentVoiceId = voiceId; player.dataset.currentMessageKey = messageKey;
        chatTtsStream = openTtsStream(player, () => generation === chatTtsGeneration && !controller.signal.aborted,
          () => { currentTtsMessageKey = ''; revokeChatTtsUrl(); }, button);
      }
      if (saved.length) {
        for (const data of saved) blobs.push(await fetch(data).then(response => response.blob()));
      } else {
        let settle;
        pending = { messageKey, cacheKey: request.cacheKey, promise: new Promise(resolve => { settle = resolve; }), resolve: value => settle(value) };
        pendingChatTtsAudio = pending;
        for (const part of request.parts) blobs.push(await window.ttsProvider.generate({ ...request.config, language: part.language }, part.text, controller.signal,
          chatTtsStream ? chunk => { if (generation === chatTtsGeneration) chatTtsStream?.push(chunk); } : undefined));
        pending.resolve(blobs);
        if (pendingChatTtsAudio === pending) pendingChatTtsAudio = null;
        await persistTtsAudio(chat, message, blobs);
      }
      if (controller.signal.aborted || generation !== chatTtsGeneration) return;
      player.dataset.currentTtsCacheKey = request?.cacheKey || 'saved_' + messageKey;
      currentChatTtsResult = { messageKey, cacheKey: player.dataset.currentTtsCacheKey, blobs };
      const playPart = async index => {
        if (controller.signal.aborted || generation !== chatTtsGeneration) return;
        revokeChatTtsUrl(); currentChatTtsObjectUrl = URL.createObjectURL(blobs[index]);
        player.onloadedmetadata = () => {
          if (generation !== chatTtsGeneration || !Number.isFinite(player.duration)) return;
          blobs[index].ttsDuration = player.duration;
          if (blobs.every(blob => Number.isFinite(blob.ttsDuration))) {
            const total = Math.round(blobs.reduce((sum, blob) => sum + blob.ttsDuration, 0));
            const duration = bodyElement.querySelector('.voice-duration');
            if (duration) duration.textContent = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}''`;
          }
        };
        try {
          await playAudioFromData(currentChatTtsObjectUrl, blobs[index].type, text, voiceId, bodyElement, messageKey, () => {
            if (generation !== chatTtsGeneration || controller.signal.aborted) return;
            if (index + 1 < blobs.length) playPart(index + 1).catch(error => reportTtsError('播放失败', error));
            else { currentTtsMessageKey = ''; revokeChatTtsUrl(); }
          });
        } catch (error) {
          if (error.name === 'NotAllowedError') {
            currentTtsMessageKey = ''; showToast('音频已生成，请再次点击语音播放', 'info');
          } else throw error;
        }
      };
      if (chatTtsStream) {
        chatTtsStream.setFallback(() => {
          if (generation !== chatTtsGeneration || controller.signal.aborted) return;
          chatTtsStream?.dispose(); chatTtsStream = null;
          playPart(0).catch(error => reportTtsError('播放失败', error));
        });
        if (chatTtsStream.finish()) return;
        if (!chatTtsStream) return; // A synchronous MSE failure already started the completed-blob fallback.
        chatTtsStream.dispose(); chatTtsStream = null;
      }
      await playPart(0);
    } catch (error) {
      if (error.name !== 'AbortError' && generation === chatTtsGeneration) {
        currentTtsMessageKey = ''; revokeChatTtsUrl();
        await showCustomAlert('语音生成失败', ttsAlertText(error.message));
      }
    } finally {
      pending?.resolve(null);
      if (pendingChatTtsAudio === pending) pendingChatTtsAudio = null;
      if (generation === chatTtsGeneration) {
        currentTtsLoading = false;
        if (spinner) spinner.style.display = 'none'; if (button) button.style.display = 'flex';
      }
    }
  }

  async function downloadAiVoiceMessage(chatId, timestamp) {
    const chat = state.chats[chatId], message = chat?.history.find(item => item.timestamp === timestamp);
    if (state.activeChatId !== chatId || !message || message.role !== 'assistant' || message.type !== 'voice_message'
        || chat.isGroup || chat.settings.enableTts === false) return;
    const downloadKey = `${chatId}_${timestamp}`;
    if (activeAiVoiceDownloads.has(downloadKey)) { showToast('这条语音正在下载', 'info'); return; }
    activeAiVoiceDownloads.add(downloadKey);
    let loading;
    try {
      const body = document.querySelector(`.message-bubble[data-timestamp="${timestamp}"] .voice-message-body`);
      if (!body) throw new Error('找不到这条语音，请返回聊天后重试');
      const saved = savedMessageAudio(message);
      let blobs = [];
      if (saved.length) {
        for (const data of saved) blobs.push(await fetch(data).then(response => response.blob()));
      } else {
        const request = messageTtsRequest(body, chat);
        if (currentChatTtsResult?.messageKey === downloadKey && currentChatTtsResult.cacheKey === request.cacheKey) {
          blobs = currentChatTtsResult.blobs;
        } else {
          loading = showToast('正在获取音频；未缓存时会产生 API 用量', 'loading');
          // Each download attaches independently to shared work before playback can cancel it.
          for (const part of request.parts) blobs.push(await window.ttsProvider.generate({ ...request.config, language: part.language }, part.text));
        }
      }
      if (blobs.some(blob => !blob.size)) throw new Error('音频文件为空');
      const safeName = String(chat.name || 'AI').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 32) || 'AI';
      let file = blobs[0], filename = `${safeName}_语音_${timestamp}.mp3`;
      if (blobs.length > 1) {
        if (typeof JSZip === 'undefined') throw new Error('分段音频下载需要 ZIP 组件，请检查网络后重试');
        const zip = new JSZip();
        for (let index = 0; index < blobs.length; index++) zip.file(`${safeName}_${String(index + 1).padStart(3, '0')}.mp3`, await blobs[index].arrayBuffer());
        file = await zip.generateAsync({ type: 'blob' }); filename = `${safeName}_语音_${timestamp}.zip`;
      }
      const url = URL.createObjectURL(file), link = document.createElement('a');
      link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      showToast(blobs.length > 1 ? '已开始下载分段音频包' : '已开始下载 MP3', 'success');
    } catch (error) { showCustomAlert('下载语音失败', ttsAlertText(error.message || '请稍后重试')); }
    finally { loading?.remove(); activeAiVoiceDownloads.delete(downloadKey); }
  }

  async function regenerateAiVoiceMessage(chatId, timestamp) {
    const chat = state.chats[chatId], message = chat?.history.find(item => item.timestamp === timestamp);
    if (!message || chat.isGroup || message.role !== 'assistant' || message.type !== 'voice_message' || chat.settings.enableTts === false) return;
    const key = `${chatId}_${timestamp}`;
    if (activeAiVoiceDownloads.has(key)) { showToast('这条语音正在下载或生成，请稍后重试', 'info'); return; }
    if (!await showCustomConfirm('重新生成语音', '使用角色当前语音配置重新生成，会产生 API 用量。已保存音频只在成功后替换。')) return;
    activeAiVoiceDownloads.add(key);
    let toast;
    try {
      const body = document.querySelector(`.message-bubble[data-timestamp="${timestamp}"] .voice-message-body`);
      if (!body || state.activeChatId !== chatId) return;
      const request = messageTtsRequest(body, chat), blobs = [];
      stopChatMessageTtsOnly(); toast = showToast('正在重新生成语音', 'loading');
      for (const part of request.parts) {
        const config = { ...request.config, language: part.language };
        const partKey = window.ttsProvider.cacheKey(config, part.text);
        state.ttsCache.delete(partKey);
        blobs.push(await window.ttsProvider.generate(config, part.text));
      }
      const saved = message.ttsSavedAudio;
      if (saved?.length || chat.settings.ttsSaveAudio) {
        delete message.ttsSavedAudio;
        await persistTtsAudio({ ...chat, settings: { ...chat.settings, ttsSaveAudio: true } }, message, blobs);
        if (!message.ttsSavedAudio && saved) {
          message.ttsSavedAudio = saved;
          throw new Error('新音频已生成，但替换保存失败，旧音频已保留');
        }
      }
      showToast('语音已重新生成，点击语音条播放', 'success');
    } catch (error) { showCustomAlert('重新生成失败', ttsAlertText(error.message || '请稍后重试')); }
    finally { toast?.remove(); activeAiVoiceDownloads.delete(key); }
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
      ttsPlayer.onerror = () => {
        stopChatMessageTtsOnly();
        showToast('音频无法播放；已生成的音频仍可下载或重新生成', 'error');
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
        // 有双语内容：显示角色原文与目标译文。
        const decodedOriginal = decodeURIComponent(originalContent);
        const languageParts = window.languagePolicy
          ? window.languagePolicy.splitContent(decodedOriginal)
          : null;
        const foreignText = languageParts
          ? languageParts.sourceText
          : decodedOriginal.replace(/[〖【][^〗】]*[〗】]/g, '').trim();
        const translationMatches = languageParts ? null : decodedOriginal.match(/[〖【]\s*([^〗】]+?)\s*[〗】]/g);
        const translation = languageParts
          ? languageParts.translationText
          : (translationMatches || []).map(m => m.replace(/[〖【〗】]/g, '').trim()).filter(Boolean).join(' ');
        
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
    
    if (window.languagePolicy) {
      const translation = window.languagePolicy.splitContent(content).translationText;
      if (!translation) return null;
      bubble.dataset.cachedTranslation = translation;
      return translation;
    }
    
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
  window.downloadAiVoiceMessage = downloadAiVoiceMessage;
  window.regenerateAiVoiceMessage = regenerateAiVoiceMessage;
  window.playRealAudio = playRealAudio;
  window.playSilentAudio = playSilentAudio;
  window.stopSilentAudio = stopSilentAudio;
  window.stopTtsQueue = stopTtsQueue;
  window.stopChatMessageTtsOnly = stopChatMessageTtsOnly;
  window.stopAllTtsPlayback = stopAllTtsPlayback;
  window.playVideoCallPureTTS = playVideoCallPureTTS;
  window.cancelCallMessageTts = cancelCallMessageTts;
  window.toggleVoiceTranscript = toggleVoiceTranscript;
  window.toggleBilingualTranslation = toggleBilingualTranslation;

  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    stopAllTtsPlayback();
    stopSilentAudio();
    const realAudioPlayer = document.getElementById('real-audio-player');
    if (realAudioPlayer) {
      realAudioPlayer.pause();
      realAudioPlayer.removeAttribute('src');
      delete realAudioPlayer.dataset.currentAudio;
      try { realAudioPlayer.load(); } catch (error) { }
    }
  });
