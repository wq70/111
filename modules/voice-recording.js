/**
 * 用户真实语音录制与理解。
 * 录音始终独立于语音识别；识别失败不会丢失或阻止发送原声。
 */
(function () {
  'use strict';

  let activeSession = null;
  let pendingStart = null;
  let initialized = false;
  let suppressChatClick = false;

  function notify(message, type = 'info') {
    if (typeof showToast === 'function') showToast(message, type);
    else console[type === 'error' ? 'error' : 'log'](message);
  }

  function getActiveChat() {
    // 主程序在 DOMContentLoaded 中暴露状态，本模块可能更早执行。
    const appState = window.state;
    return appState?.activeChatId ? appState.chats?.[appState.activeChatId] || null : null;
  }

  function getUnderstandingMode(chat, forCall) {
    if (!chat?.settings) return 'none';
    if (forCall) {
      const callMode = chat.settings.voiceCallUnderstandingMode || 'same';
      if (callMode !== 'same') return callMode;
    }
    return chat.settings.voiceUnderstandingMode || 'auto';
  }

  function resolveAutomaticMode(chat) {
    const apiConfig = window.state?.apiConfig;
    const proxyUrl = String(apiConfig?.proxyUrl || '').replace(/\/+$/, '');
    const configuredGeminiUrl = typeof GEMINI_API_URL !== 'undefined' ? GEMINI_API_URL : window.GEMINI_API_URL;
    const geminiUrl = String(configuredGeminiUrl || '').replace(/\/+$/, '');
    if (proxyUrl && proxyUrl === geminiUrl && apiConfig?.apiKey) return 'gemini';
    if (chat?.settings?.voiceTranscriptionUrl) return 'transcription';
    return 'none';
  }

  function selectRecorderOptions() {
    if (typeof MediaRecorder === 'undefined') return null;
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
      'audio/webm',
      'audio/ogg;codecs=opus'
    ];
    for (const mimeType of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(mimeType)) return { mimeType };
      } catch (error) { /* Let the browser choose below. */ }
    }
    return {};
  }

  function describeCaptureError(error) {
    switch (error?.name) {
      case 'NotAllowedError': return '麦克风权限被拒绝，请在浏览器网站设置中允许麦克风';
      case 'NotFoundError': return '没有找到可用的麦克风';
      case 'NotReadableError': return '麦克风可能正被其他应用占用';
      case 'SecurityError': return '当前页面不允许使用麦克风，请确认通过 HTTPS 打开';
      case 'AbortError': return '麦克风启动被系统中断，请重试';
      default: return `无法开始录音：${error?.message || '未知错误'}`;
    }
  }

  function updateRecordingUi(recording, source, elapsedSeconds = 0) {
    const chatButton = document.getElementById('voice-record-btn');
    const callButton = document.getElementById('voice-user-speak-btn');
    chatButton?.classList.toggle('is-recording', recording && source === 'chat');
    callButton?.classList.toggle('is-recording', recording && source === 'call');
    let indicator = document.getElementById('real-voice-recording-indicator');
    if (!recording) {
      indicator?.remove();
      return;
    }
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'real-voice-recording-indicator';
      indicator.className = 'real-voice-recording-indicator';
      indicator.innerHTML = '<span class="recording-dot"></span><span class="recording-label"></span><span class="recording-time"></span>';
      document.body.appendChild(indicator);
    }
    const operation = source === 'call'
      ? (getActiveChat()?.settings?.voiceCallInputMode || 'text')
      : (getActiveChat()?.settings?.realVoiceOperation || 'tap');
    indicator.querySelector('.recording-label').textContent = operation === 'hold' ? '正在录音，松开发送' : '正在录音，再次点击结束';
    indicator.querySelector('.recording-time').textContent = `0:${String(elapsedSeconds).padStart(2, '0')}`;
  }

  function startLegacyRecognition(session) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      session.recognitionError = '当前浏览器不支持浏览器语音识别';
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = event => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          if (event.results[index].isFinal) session.recognizedText += event.results[index][0].transcript;
        }
      };
      recognition.onerror = event => { session.recognitionError = `浏览器识别失败：${event.error}`; };
      recognition.start();
      session.recognition = recognition;
    } catch (error) {
      session.recognitionError = `浏览器识别启动失败：${error.message}`;
    }
  }

  async function startRecording(source) {
    if (activeSession || pendingStart) return false;
    const chat = getActiveChat();
    if (!chat) {
      notify('请先打开一个聊天', 'error');
      return false;
    }
    if (source === 'chat' && chat.settings?.enableRealVoice === false) {
      notify('当前聊天未启用真实语音', 'error');
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      notify('当前浏览器不支持网页录音，请更新浏览器并通过 HTTPS 打开', 'error');
      return false;
    }
    const pending = { source, stopRequested: false, cancelled: false, resolveStop: null, stopPromise: null };
    pending.stopPromise = new Promise(resolve => { pending.resolveStop = resolve; });
    pendingStart = pending;
    let acquiredStream = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      acquiredStream = stream;
      if (pending.stopRequested || pendingStart !== pending) {
        stream.getTracks().forEach(track => track.stop());
        if (pendingStart === pending) pendingStart = null;
        pending.resolveStop(null);
        if (!pending.cancelled) {
          const chatMode = source === 'call'
            ? (chat.settings?.voiceCallInputMode || 'text')
            : (chat.settings?.realVoiceOperation || 'tap');
          notify(chatMode === 'hold' ? '麦克风已就绪，请重新按住说话' : '麦克风已就绪，请再次点击开始录音');
        }
        return false;
      }
      const options = selectRecorderOptions();
      let recorder;
      try {
        recorder = options && Object.keys(options).length ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
      } catch (preferredFormatError) {
        recorder = new MediaRecorder(stream);
      }
      let complete;
      const completion = new Promise(resolve => { complete = resolve; });
      const mode = getUnderstandingMode(chat, source === 'call');
      const session = {
        source, chatId: chat.id, stream, recorder, chunks: [], startedAt: Date.now(),
        recognizedText: '', recognitionError: '', recognition: null, completion, complete,
        timer: null, maxTimer: null, cancelled: false, mode
      };
      activeSession = session;
      pendingStart = null;
      recorder.ondataavailable = event => { if (event.data?.size) session.chunks.push(event.data); };
      recorder.onerror = event => { session.recordingError = event.error?.message || '录音编码失败'; };
      recorder.onstop = () => finalizeSession(session);
      try {
        recorder.start(250);
      } catch (error) {
        session.cancelled = true;
        releaseSession(session);
        session.complete(null);
        throw error;
      }
      if (mode === 'browser') startLegacyRecognition(session);
      const maxSeconds = Math.max(5, Number(chat.settings?.voiceMaxDuration) || 60);
      session.timer = setInterval(() => updateRecordingUi(true, source, Math.floor((Date.now() - session.startedAt) / 1000)), 500);
      session.maxTimer = setTimeout(() => {
        if (activeSession === session) {
          notify(`已达到 ${maxSeconds} 秒录音上限`);
          if (source === 'chat') finishChatRecording(false);
          else {
            stopCallRecording(false).then(result => {
              if (result) window.dispatchEvent(new CustomEvent('real-voice-call-result', { detail: result }));
            });
          }
        }
      }, maxSeconds * 1000);
      updateRecordingUi(true, source, 0);
      return true;
    } catch (error) {
      if (pendingStart === pending) pendingStart = null;
      if (!activeSession) acquiredStream?.getTracks().forEach(track => track.stop());
      pending.resolveStop(null);
      notify(describeCaptureError(error), 'error');
      return false;
    }
  }

  function releaseSession(session) {
    clearInterval(session.timer);
    clearTimeout(session.maxTimer);
    session.stream?.getTracks().forEach(track => track.stop());
    if (session.recognition) {
      try { session.recognition.stop(); } catch (error) { /* Already stopped. */ }
      session.recognition.onresult = null;
      session.recognition.onerror = null;
      session.recognition = null;
    }
    updateRecordingUi(false, session.source);
    if (activeSession === session) activeSession = null;
  }

  function finalizeSession(session) {
    if (session.finalized) return;
    session.finalized = true;
    const duration = Math.max(1, Math.round((Date.now() - session.startedAt) / 1000));
    const mimeType = session.recorder.mimeType || session.chunks[0]?.type || 'audio/webm';
    const blob = new Blob(session.chunks, { type: mimeType });
    releaseSession(session);
    if (!session.cancelled && blob.size === 0) {
      notify('没有录到有效声音，请检查麦克风后重试', 'error');
      session.complete(null);
      return;
    }
    session.complete(session.cancelled ? null : {
      blob, duration, recognizedText: session.recognizedText.trim(),
      recognitionError: session.recognitionError || session.recordingError || '', requestedMode: session.mode,
      chatId: session.chatId
    });
  }

  function stopRecording(source, cancelled = false) {
    const session = activeSession;
    if (!session) {
      if (pendingStart && (!source || pendingStart.source === source)) {
        pendingStart.stopRequested = true;
        pendingStart.cancelled = pendingStart.cancelled || cancelled;
        return pendingStart.stopPromise;
      }
      return Promise.resolve(null);
    }
    if (source && session.source !== source) return Promise.resolve(null);
    session.cancelled = cancelled;
    if (session.recorder.state !== 'inactive') session.recorder.stop();
    else finalizeSession(session);
    return session.completion;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('读取录音失败'));
      reader.readAsDataURL(blob);
    });
  }

  function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeString = (offset, value) => {
      for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    for (let index = 0; index < samples.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, samples[index]));
      view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  async function normalizeToWav(blob) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return blob;
    const context = new AudioContextClass();
    try {
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const targetRate = 16000;
      const targetLength = Math.max(1, Math.round(decoded.duration * targetRate));
      const mono = new Float32Array(decoded.length);
      for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
        const data = decoded.getChannelData(channel);
        for (let index = 0; index < data.length; index += 1) mono[index] += data[index] / decoded.numberOfChannels;
      }
      const resampled = new Float32Array(targetLength);
      const ratio = decoded.sampleRate / targetRate;
      for (let index = 0; index < targetLength; index += 1) {
        const position = index * ratio;
        const left = Math.floor(position);
        const right = Math.min(left + 1, mono.length - 1);
        const fraction = position - left;
        resampled[index] = mono[left] * (1 - fraction) + mono[right] * fraction;
      }
      return encodeWav(resampled, targetRate);
    } catch (error) {
      console.warn('[真实语音] 浏览器无法转码，改用原始录音格式:', error);
      return blob;
    } finally {
      Promise.resolve(context.close()).catch(() => {});
    }
  }

  function audioFilename(blob) {
    const type = String(blob.type || '').toLowerCase();
    if (type.includes('wav')) return 'voice.wav';
    if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'voice.m4a';
    if (type.includes('ogg')) return 'voice.ogg';
    if (type.includes('mpeg') || type.includes('mp3')) return 'voice.mp3';
    return 'voice.webm';
  }

  async function transcribeWithCompatibleApi(blob, chat) {
    const url = chat.settings?.voiceTranscriptionUrl?.trim();
    if (!url) throw new Error('尚未填写后台转写接口');
    const wavBlob = await normalizeToWav(blob);
    const form = new FormData();
    form.append('file', wavBlob, audioFilename(wavBlob));
    form.append('model', chat.settings?.voiceTranscriptionModel || 'whisper-1');
    form.append('language', 'zh');
    const configuredKey = chat.settings?.voiceTranscriptionKey || window.state?.apiConfig?.apiKey || '';
    const apiKey = typeof getRandomValue === 'function' ? getRandomValue(configuredKey) : configuredKey;
    const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const response = await fetch(url, { method: 'POST', headers, body: form });
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const data = await response.json();
        detail = data?.error?.message || data?.message || detail;
      } catch (error) { /* Keep status. */ }
      throw new Error(`后台转写失败：${detail}`);
    }
    const data = await response.json();
    const text = data.text || data.transcript || data.result?.text || '';
    if (!String(text).trim()) throw new Error('后台转写没有返回文字');
    return String(text).trim();
  }

  async function understandWithGemini(blob) {
    const apiConfig = window.state?.apiConfig;
    const apiKeyValue = apiConfig?.apiKey || '';
    const apiKey = typeof getRandomValue === 'function' ? getRandomValue(apiKeyValue) : apiKeyValue;
    if (!apiKey) throw new Error('尚未配置 Gemini API Key');
    const model = apiConfig?.model;
    if (!model) throw new Error('尚未选择 Gemini 模型');
    const wavBlob = await normalizeToWav(blob);
    const dataUrl = await blobToDataUrl(wavBlob);
    const audioBase64 = String(dataUrl).split(',')[1];
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [
        { text: '请直接理解这段用户语音。忠实输出用户说出的内容；仅在确实影响含义时，用简短括号补充明显的语气、情绪或非语言声音。不要回答用户，不要添加解释。' },
        { inline_data: { mime_type: wavBlob.type || 'audio/wav', data: audioBase64 } }
      ] }] })
    });
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const data = await response.json();
        detail = data?.error?.message || detail;
      } catch (error) { /* Keep status. */ }
      throw new Error(`Gemini 音频理解失败：${detail}`);
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
    if (!text) throw new Error('Gemini 没有返回音频理解结果');
    return text;
  }

  async function processClip(recording, chat, forCall) {
    let mode = recording.requestedMode || getUnderstandingMode(chat, forCall);
    if (mode === 'same') mode = chat.settings?.voiceUnderstandingMode || 'auto';
    if (mode === 'auto') mode = resolveAutomaticMode(chat);
    try {
      if (mode === 'browser') {
        if (!recording.recognizedText) throw new Error(recording.recognitionError || '浏览器没有识别到文字');
        return { ...recording, text: recording.recognizedText, resolvedMode: mode, error: '' };
      }
      if (mode === 'transcription') return { ...recording, text: await transcribeWithCompatibleApi(recording.blob, chat), resolvedMode: mode, error: '' };
      if (mode === 'fish') {
        if (!window.fishTts) throw new Error('Fish 语音模块尚未加载，请刷新页面');
        const wav = await normalizeToWav(recording.blob);
        return { ...recording, text: await window.fishTts.transcribe(window.state?.apiConfig || {}, wav), resolvedMode: mode, error: '' };
      }
      if (mode === 'gemini') return { ...recording, text: await understandWithGemini(recording.blob), resolvedMode: mode, error: '' };
      return { ...recording, text: '', resolvedMode: 'none', error: '' };
    } catch (error) {
      console.error('[真实语音] 处理失败:', error);
      return { ...recording, text: recording.recognizedText || '', resolvedMode: mode, error: error.message || String(error) };
    }
  }

  function showConfirmDialog(result) {
    return new Promise(resolve => {
      const dialog = document.createElement('div');
      dialog.className = 'voice-text-confirm-dialog';
      const errorText = result.error ? `<div class="voice-processing-error">${escapeHTML(result.error)}，原声仍可发送</div>` : '';
      dialog.innerHTML = `
        <div class="voice-text-confirm-overlay"></div>
        <div class="voice-text-confirm-content real-voice-confirm-content">
          <div class="voice-text-confirm-header"><h3>发送真实语音</h3><p class="voice-text-hint">录音 ${result.duration} 秒 · ${result.resolvedMode === 'none' ? '仅发送原声' : '已处理角色理解内容'}</p></div>
          <div class="voice-text-confirm-body">
            <button type="button" class="voice-preview-btn"><span>▶</span>试听原声</button>${errorText}
            <textarea class="voice-text-input" placeholder="可留空并直接发送原声">${escapeHTML(result.text || '')}</textarea>
          </div>
          <div class="voice-text-confirm-footer"><button class="voice-text-cancel-btn">取消</button><button class="voice-text-send-btn">发送</button></div>
        </div>`;
      document.body.appendChild(dialog);
      const url = URL.createObjectURL(result.blob);
      const audio = new Audio(url);
      const finish = value => {
        audio.pause();
        URL.revokeObjectURL(url);
        dialog.remove();
        resolve(value);
      };
      const preview = dialog.querySelector('.voice-preview-btn');
      preview.addEventListener('click', async () => {
        if (!audio.paused) {
          audio.pause();
          preview.querySelector('span').textContent = '▶';
          return;
        }
        try {
          await audio.play();
          preview.querySelector('span').textContent = 'Ⅱ';
        } catch (error) { notify('无法播放录音，请检查系统媒体音量', 'error'); }
      });
      audio.onended = () => { preview.querySelector('span').textContent = '▶'; };
      dialog.querySelector('.voice-text-cancel-btn').addEventListener('click', () => finish(null));
      dialog.querySelector('.voice-text-confirm-overlay').addEventListener('click', () => finish(null));
      dialog.querySelector('.voice-text-send-btn').addEventListener('click', () => finish(dialog.querySelector('.voice-text-input').value.trim()));
      const textarea = dialog.querySelector('.voice-text-input');
      textarea.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) finish(textarea.value.trim());
      });
      textarea.focus();
    });
  }

  async function saveChatRecording(recording) {
    const appState = window.state;
    const chat = appState?.chats?.[recording.chatId || appState?.activeChatId] || getActiveChat();
    if (!chat) return;
    notify('正在处理真实语音…');
    const result = await processClip(recording, chat, false);
    let finalText = result.text || '';
    if (chat.settings?.voiceConfirmTranscript !== false) {
      const confirmed = await showConfirmDialog(result);
      if (confirmed === null) return;
      finalText = confirmed;
    } else if (result.error) notify(`${result.error}，已保留并发送原声`, 'error');
    const audioData = await blobToDataUrl(result.blob);
    const msg = {
      role: 'user', type: 'voice_message', content: finalText || '[真实语音]', voiceTranscript: finalText,
      voiceUnderstandingMode: result.resolvedMode, voiceUnderstandingError: result.error || '',
      audioData, audioMimeType: result.blob.type, audioDuration: result.duration, timestamp: Date.now()
    };
    chat.history.push(msg);
    await db.chats.put(chat);
    appendMessage(msg, chat);
    renderChatList();
    notify(result.error ? '真实语音已发送，角色理解内容可稍后重试' : '真实语音已发送');
  }

  async function finishChatRecording(cancelled = false) {
    const recording = await stopRecording('chat', cancelled);
    if (!recording || recording.deliveryClaimed) return;
    recording.deliveryClaimed = true;
    await saveChatRecording(recording);
  }

  async function handleChatClick() {
    if (suppressChatClick) {
      suppressChatClick = false;
      return;
    }
    const chat = getActiveChat();
    if (!chat || (chat.settings?.realVoiceOperation || 'tap') !== 'tap') return;
    if (activeSession?.source === 'chat' || pendingStart?.source === 'chat') await finishChatRecording(false);
    else await startRecording('chat');
  }

  async function prepareCallResult(recording) {
    const appState = window.state;
    const chat = appState?.chats?.[recording.chatId || appState?.activeChatId] || getActiveChat();
    if (!chat) return null;
    notify('正在理解你的通话语音…');
    const result = await processClip(recording, chat, true);
    let text = result.text || '';
    if (!text && chat.settings?.voiceCallTextFallback !== false && typeof showCustomPrompt === 'function') {
      text = (await showCustomPrompt('语音未能转换为文字', `${result.error || '可补充你刚才说的话，也可以取消本轮。'}\n原声录音没有丢失。`))?.trim() || '';
      if (!text) return null;
    }
    if (!text) {
      notify(result.error || '本轮仅记录原声，角色无法直接理解内容', 'error');
      text = '[真实语音]';
    }
    return {
      text, audioData: await blobToDataUrl(result.blob), audioMimeType: result.blob.type,
      audioDuration: result.duration, voiceUnderstandingMode: result.resolvedMode
    };
  }

  async function startCallRecording() { return startRecording('call'); }

  async function stopCallRecording(cancelled = false) {
    const recording = await stopRecording('call', cancelled);
    if (!recording || recording.deliveryClaimed) return null;
    recording.deliveryClaimed = true;
    return prepareCallResult(recording);
  }

  function refreshSettingsUi() {
    const realVoiceEnabled = Boolean(document.getElementById('enable-real-voice-switch')?.checked);
    const configContainer = document.getElementById('real-voice-config-container');
    if (configContainer) {
      configContainer.style.display = realVoiceEnabled ? 'block' : 'none';
    }
    const mode = document.getElementById('voice-understanding-mode-select')?.value;
    const details = document.getElementById('voice-transcription-settings');
    if (details) details.style.display = mode === 'transcription' || mode === 'auto' ? 'block' : 'none';
    const chatControlIds = ['real-voice-operation-select', 'voice-confirm-transcript-switch'];
    chatControlIds.forEach(id => {
      const control = document.getElementById(id);
      if (control) control.disabled = !realVoiceEnabled;
    });
    const callUsesVoice = (document.getElementById('voice-call-input-mode-select')?.value || 'text') !== 'text';
    const callUnderstanding = document.getElementById('voice-call-understanding-select');
    const callFallback = document.getElementById('voice-call-text-fallback-switch');
    if (callUnderstanding) callUnderstanding.disabled = !callUsesVoice;
    if (callFallback) callFallback.disabled = !callUsesVoice;
  }

  function refreshAvailability(chat = getActiveChat()) {
    const button = document.getElementById('voice-record-btn');
    if (!button) return;
    button.style.display = chat?.settings?.enableRealVoice === false ? 'none' : '';
    button.title = (chat?.settings?.realVoiceOperation || 'tap') === 'hold' ? '按住发送真实语音' : '录制真实语音';
  }

  function init() {
    if (initialized) return;
    initialized = true;
    const button = document.getElementById('voice-record-btn');
    if (button) {
      button.addEventListener('click', handleChatClick);
      button.addEventListener('pointerdown', async event => {
        const chat = getActiveChat();
        if (!chat || (chat.settings?.realVoiceOperation || 'tap') !== 'hold') return;
        event.preventDefault();
        suppressChatClick = true;
        try { button.setPointerCapture(event.pointerId); } catch (error) { /* Optional. */ }
        await startRecording('chat');
      });
      button.addEventListener('pointerup', event => {
        const chat = getActiveChat();
        if (!chat || (chat.settings?.realVoiceOperation || 'tap') !== 'hold') return;
        event.preventDefault();
        finishChatRecording(false);
        setTimeout(() => { suppressChatClick = false; }, 0);
      });
      button.addEventListener('pointercancel', () => {
        suppressChatClick = false;
        finishChatRecording(true);
      });
      button.addEventListener('contextmenu', event => {
        if ((getActiveChat()?.settings?.realVoiceOperation || 'tap') === 'hold') event.preventDefault();
      });
    }
    document.getElementById('voice-understanding-mode-select')?.addEventListener('change', refreshSettingsUi);
    document.getElementById('enable-real-voice-switch')?.addEventListener('change', refreshSettingsUi);
    document.getElementById('voice-call-input-mode-select')?.addEventListener('change', refreshSettingsUi);
    refreshSettingsUi();
    refreshAvailability();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.voiceRecording = {
    startRecording, stopRecording, startCallRecording, stopCallRecording,
    isRecording: source => Boolean(
      (activeSession && (!source || activeSession.source === source)) ||
      (pendingStart && (!source || pendingStart.source === source))
    ),
    cancelRecording: source => stopRecording(source, true), refreshSettingsUi, refreshAvailability
  };

  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    if (pendingStart) {
      pendingStart.stopRequested = true;
      pendingStart.cancelled = true;
    }
    if (!activeSession) return;
    const session = activeSession;
    session.cancelled = true;
    try {
      if (session.recorder.state !== 'inactive') session.recorder.stop();
    } catch (error) { releaseSession(session); }
  });
})();
