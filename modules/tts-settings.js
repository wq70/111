// TTS settings extend the existing API and character forms.
(function () {
  'use strict';
  const get = id => document.getElementById(id);
  const escapeText = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  let activeChat = null, draft = null, preview = null, previewUrl = null, previewController = null;
  let voiceController = null, voiceGeneration = 0, voiceRows = [], nextPage = '';
  const info = (id, message) => { const node = get(id); if (node) node.textContent = message; };
  const values = () => ({ ...state.apiConfig, ...readApi() });
  function renderUsage() {
    const data = window.ttsProvider.usage();
    info('tts-session-usage', `本次打开：提交 ${data.requests} 次合成 · ${data.characters} 字符 · 缓存复用 ${data.cacheHits} 次。实际计费以服务商为准。`);
  }
  function readApi() {
    return {
      ...window.fishTtsSettings?.readApi(),
      elevenlabsApiKey: get('elevenlabs-api-key')?.value.trim() ?? state.apiConfig.elevenlabsApiKey ?? '',
      elevenlabsBaseUrl: get('elevenlabs-base-url')?.value.trim() || window.ttsProvider.defaults.elevenlabsBaseUrl,
      elevenlabsModel: get('elevenlabs-model-input')?.value.trim() || get('elevenlabs-model-select')?.value || window.ttsProvider.defaults.elevenlabsModel,
      elevenlabsCallModel: get('elevenlabs-call-model')?.value.trim() || ''
    };
  }
  function loadApi() {
    const config = window.ttsProvider.apiFields(state.apiConfig);
    for (const [id, key] of [['elevenlabs-api-key', 'elevenlabsApiKey'], ['elevenlabs-base-url', 'elevenlabsBaseUrl'], ['elevenlabs-model-input', 'elevenlabsModel'], ['elevenlabs-call-model', 'elevenlabsCallModel']]) {
      if (get(id)) get(id).value = config[key];
    }
    if (get('elevenlabs-model-select')) get('elevenlabs-model-select').value = config.elevenlabsModel;
    info('elevenlabs-api-status', '检查连接不生成音频；试听会产生 API 用量。');
    renderUsage();
    window.fishTtsSettings?.loadApi();
    bind();
  }
  function snapshotDraft() {
    if (!draft) return;
    const name = get('tts-provider-select').value;
    draft[name + 'VoiceId'] = get('ai-voice-id-input').value.trim();
    draft.ttsSpeed = Number(get('ai-voice-speed-input').value || 1);
    draft[name + 'TtsSpeed'] = draft.ttsSpeed;
    draft.elevenlabsModel = get('elevenlabs-role-model').value.trim();
    draft.ttsSplitLongText = get('tts-split-long-switch').checked;
    draft.ttsStreaming = get('tts-stream-switch').checked;
    draft.ttsSaveAudio = get('tts-save-audio-switch').checked;
    draft.elevenlabsVoiceSettings = {};
    for (const key of ['stability', 'similarity_boost', 'style']) {
      const value = get('elevenlabs-' + key).value;
      if (value !== '') draft.elevenlabsVoiceSettings[key] = Number(value);
    }
    const boost = get('elevenlabs-speaker-boost').value;
    if (boost !== '') draft.elevenlabsVoiceSettings.use_speaker_boost = boost === 'true';
    window.fishTtsSettings?.snapshot(draft);
  }
  function renderProvider(name) {
    if (!draft) return;
    get('tts-provider-select').value = name;
    get('ai-voice-id-input').value = draft[name + 'VoiceId'] || '';
    get('ai-voice-id-input').placeholder = name === 'fish' ? 'Fish 音色 ID / 链接，留空用默认音色' : name === 'elevenlabs' ? 'ElevenLabs voice_id' : 'minimax voice_id';
    get('ai-voice-speed-input').value = draft[name + 'TtsSpeed'] ?? 1;
    get('elevenlabs-role-options').hidden = name !== 'elevenlabs' || activeChat?.isGroup;
    get('ai-voice-speed-input').min = name === 'elevenlabs' ? '0.7' : '0.5';
    get('ai-voice-speed-input').max = name === 'elevenlabs' ? '1.2' : '2.0';
    if (get('tts-extended-playback')) get('tts-extended-playback').hidden = name === 'minimax';
    window.fishTtsSettings?.render(name, activeChat);
    info('tts-role-status', name === 'fish' ? '使用 API 设置里保存的 Fish Key；音色 ID 可留空使用默认音色。' : name === 'elevenlabs' ? '使用 API 设置里保存的 ElevenLabs Key。Fish 官方兼容地址会自动转为可跨域的合成请求，支持稳定度与语速，其余 ElevenLabs 声音参数不生效。' : '使用原有 MiniMax 配置。');
  }
  function loadChat(chat) {
    stopPreview();
    voiceController?.abort(); voiceGeneration++;
    activeChat = chat;
    draft = { ...chat.settings, elevenlabsVoiceSettings: { ...(chat.settings.elevenlabsVoiceSettings || {}) } };
    draft.ttsProvider = window.ttsProvider.provider(chat);
    draft.minimaxTtsSpeed = chat.settings.minimaxTtsSpeed ?? (draft.ttsProvider === 'minimax' ? chat.settings.ttsSpeed ?? 1 : 1);
    draft.elevenlabsTtsSpeed = chat.settings.elevenlabsTtsSpeed ?? (draft.ttsProvider === 'elevenlabs' ? chat.settings.ttsSpeed ?? 1 : 1);
    draft.fishTtsSpeed = chat.settings.fishTtsSpeed ?? (draft.ttsProvider === 'fish' ? chat.settings.ttsSpeed ?? 1 : 1);
    draft.fishVoiceSettings = JSON.parse(JSON.stringify(chat.settings.fishVoiceSettings || {}));
    window.fishTtsSettings?.loadChat(draft);
    get('tts-provider-group').hidden = chat.isGroup;
    get('tts-common-options').hidden = chat.isGroup;
    get('ai-voice-speed-input').value = draft.ttsSpeed ?? 1;
    get('elevenlabs-role-model').value = draft.elevenlabsModel || '';
    get('tts-split-long-switch').checked = draft.ttsSplitLongText === true;
    get('tts-stream-switch').checked = draft.ttsStreaming === true;
    get('tts-save-audio-switch').checked = draft.ttsSaveAudio === true;
    for (const key of ['stability', 'similarity_boost', 'style']) get('elevenlabs-' + key).value = draft.elevenlabsVoiceSettings[key] ?? '';
    get('elevenlabs-speaker-boost').value = draft.elevenlabsVoiceSettings.use_speaker_boost == null ? '' : String(draft.elevenlabsVoiceSettings.use_speaker_boost);
    get('elevenlabs-voice-search').value = '';
    voiceRows = []; nextPage = ''; renderVoices(); renderLibrary();
    renderProvider(window.ttsProvider.provider(chat));
    bind();
  }
  function saveChat(chat) {
    if (!draft || activeChat?.id !== chat.id || chat.isGroup) return;
    snapshotDraft();
    const name = get('tts-provider-select').value;
    // Keep both voice IDs even when switching providers in the same open form.
    Object.assign(chat.settings, {
      ttsProvider: name, minimaxVoiceId: draft.minimaxVoiceId || '', elevenlabsVoiceId: draft.elevenlabsVoiceId || '',
      elevenlabsModel: draft.elevenlabsModel, elevenlabsVoiceSettings: { ...draft.elevenlabsVoiceSettings },
      ttsSpeed: draft.ttsSpeed, ttsSplitLongText: draft.ttsSplitLongText, ttsStreaming: draft.ttsStreaming, ttsSaveAudio: draft.ttsSaveAudio,
      minimaxTtsSpeed: draft.minimaxTtsSpeed, elevenlabsTtsSpeed: draft.elevenlabsTtsSpeed,
      fishVoiceId: draft.fishVoiceId || '', fishModel: draft.fishModel || '', fishTtsSpeed: draft.fishTtsSpeed,
      fishVoiceSettings: JSON.parse(JSON.stringify(draft.fishVoiceSettings || {}))
    });
    stopPreview();
  }
  function draftChat() {
    snapshotDraft();
    return { ...activeChat, settings: { ...draft, ttsProvider: get('tts-provider-select').value,
      ttsLanguage: get('ai-voice-lang-select').value } };
  }
  function validateChat() {
    if (!draft || activeChat?.isGroup) return;
    const chat = draftChat();
    const config = window.ttsProvider.resolve(chat);
    // Settings can be saved before a Key or voice ID is configured.
    window.ttsProvider.validate({ ...config, apiKey: config.apiKey || 'pending', groupId: config.groupId || 'pending', voiceId: config.voiceId || 'pending' });
  }
  function stopPreview() {
    previewController?.abort(); previewController = null;
    if (preview) { preview.pause(); preview.removeAttribute('src'); preview.onended = null; preview.onerror = null; }
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    window.fishTtsSettings?.stopSample();
  }
  async function previewVoice(fromApi = false) {
    if ((typeof videoCallState !== 'undefined' && videoCallState.isActive) || (typeof voiceCallState !== 'undefined' && voiceCallState.isActive)) {
      throw new Error('通话中请先结束通话再试听，避免两路声音重叠');
    }
    stopPreview();
    const controller = new AbortController(); previewController = controller;
    const status = fromApi === 'fish' ? 'fish-api-status' : fromApi ? 'elevenlabs-api-status' : 'tts-role-status';
    const chat = fromApi === 'fish' ? { settings: { ttsProvider: 'fish', fishVoiceId: get('fish-test-voice').value.trim() } } : fromApi ? { settings: { ttsProvider: 'elevenlabs', elevenlabsVoiceId: get('elevenlabs-test-voice').value.trim() } } : draftChat();
    const config = window.ttsProvider.resolve(chat, { apiConfig: fromApi ? values() : state.apiConfig });
    const text = get(fromApi === 'fish' ? 'fish-test-text' : fromApi ? 'elevenlabs-test-text' : 'tts-preview-text').value;
    const parts = window.ttsProvider.segments(text, chat, config);
    if (!parts.length) throw new Error('请输入试听文本');
    window.ttsProvider.validate(config);
    info(status, '正在生成试听，会产生 API 用量；可点击停止。');
    const playPart = async index => {
      const part = parts[index];
      const blob = await window.ttsProvider.generate({ ...config, language: part.language }, part.text, controller.signal);
      if (controller.signal.aborted || previewController !== controller) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob); preview = get('tts-preview-player'); preview.src = previewUrl;
      preview.onended = () => {
        if (index + 1 < parts.length) playPart(index + 1).catch(error => handleError(status, error));
        else info(status, '试听完成，可点击“播放试听”再次播放。');
      };
      preview.onerror = () => { info(status, '音频已生成，但浏览器无法播放。'); stopPreview(); };
      try { await preview.play(); info(status, '试听播放中。'); }
      catch (_) { info(status, '音频已生成，请点击“播放试听”。'); }
    };
    await playPart(0);
  }
  function handleError(id, error) {
    if (error.name !== 'AbortError') info(id, error.message || '操作失败，请重试');
  }
  function action(id, status, run) {
    const button = get(id);
    if (!button || button.dataset.ttsBound) return;
    button.dataset.ttsBound = '1';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await run(); } catch (error) { handleError(status, error); }
      finally { button.disabled = false; }
    });
  }
  function option(select, value, label) {
    const node = document.createElement('option'); node.value = value; node.textContent = label; select.appendChild(node);
  }
  function renderVoices() {
    const select = get('elevenlabs-voice-select'); select.replaceChildren();
    option(select, '', '选择音色（也可手填 ID）');
    for (const row of voiceRows) option(select, row.voice_id, `${row.name || row.voice_id}${row.category ? ' · ' + row.category : ''}`);
    get('elevenlabs-voice-next').hidden = !nextPage;
  }
  async function fetchVoices(append = false) {
    voiceController?.abort(); const controller = new AbortController(); voiceController = controller;
    const generation = ++voiceGeneration;
    info('tts-role-status', '正在获取音色…');
    const result = await window.ttsProvider.listVoices(state.apiConfig, get('elevenlabs-voice-search').value.trim(), append ? nextPage : '', controller.signal);
    if (generation !== voiceGeneration || controller.signal.aborted) return;
    voiceRows = append ? [...voiceRows, ...result.voices] : result.voices;
    voiceRows = [...new Map(voiceRows.map(row => [row.voice_id, row])).values()];
    nextPage = result.has_more && result.next_page_token ? result.next_page_token : '';
    renderVoices(); info('tts-role-status', `已获取 ${voiceRows.length} 个音色，选择后可试听。`);
  }
  function renderLibrary() {
    const voices = get('elevenlabs-favorite-select'), presets = get('elevenlabs-sound-preset');
    voices.replaceChildren(); presets.replaceChildren();
    option(voices, '', '收藏的音色'); option(presets, '', '声音参数预设');
    const api = window.ttsProvider.apiFields(state.apiConfig);
    for (const row of api.elevenlabsVoiceLibrary) option(voices, row.id, row.name || row.id);
    api.elevenlabsSoundPresets.forEach((row, index) => option(presets, String(index), row.name));
  }
  async function saveLibrary(key, rows) {
    const next = { ...state.apiConfig, [key]: rows };
    await db.apiConfig.put(next); state.apiConfig = next; renderLibrary();
  }
  function bind() {
    const select = get('tts-provider-select');
    if (select && !select.dataset.ttsBound) {
      select.dataset.ttsBound = '1';
      select.addEventListener('change', () => {
        const next = select.value;
        select.value = draft?.ttsProvider || 'minimax';
        try { snapshotDraft(); }
        catch (error) { info('tts-role-status', error.message); return; }
        if (draft) draft.ttsProvider = next; stopPreview(); renderProvider(next);
      });
    }
    action('elevenlabs-model-fetch', 'elevenlabs-api-status', async () => {
      const rows = await window.ttsProvider.listModels(values());
      const chosen = readApi().elevenlabsModel, select = get('elevenlabs-model-select'); select.replaceChildren();
      for (const row of rows) option(select, row.model_id, row.name || row.model_id);
      if (!rows.some(row => row.model_id === chosen)) option(select, chosen, chosen);
      select.value = chosen; info('elevenlabs-api-status', `已获取 ${rows.length} 个 TTS 模型，账户权限以语音测试为准。`);
    });
    action('elevenlabs-connect-test', 'elevenlabs-api-status', async () => {
      await window.ttsProvider.listModels(values()); info('elevenlabs-api-status', '接口和鉴权检查通过；音色能否使用请执行语音测试。');
    });
    const model = get('elevenlabs-model-select');
    if (model && !model.dataset.ttsBound) { model.dataset.ttsBound = '1'; model.addEventListener('change', () => { get('elevenlabs-model-input').value = model.value; }); }
    action('elevenlabs-key-show', 'elevenlabs-api-status', () => {
      const input = get('elevenlabs-api-key'); input.type = input.type === 'password' ? 'text' : 'password';
      get('elevenlabs-key-show').textContent = input.type === 'password' ? '显示' : '隐藏';
    });
    action('elevenlabs-key-clear', 'elevenlabs-api-status', () => { get('elevenlabs-api-key').value = ''; info('elevenlabs-api-status', '已清空输入；点击页面保存后生效。'); });
    action('elevenlabs-test-generate', 'elevenlabs-api-status', () => previewVoice(true));
    action('tts-preview-generate', 'tts-role-status', () => previewVoice());
    for (const id of ['tts-preview-stop', 'elevenlabs-test-stop']) action(id, id === 'tts-preview-stop' ? 'tts-role-status' : 'elevenlabs-api-status', () => {
      stopPreview(); info(id === 'tts-preview-stop' ? 'tts-role-status' : 'elevenlabs-api-status', '试听已停止。');
    });
    for (const id of ['tts-preview-play', 'elevenlabs-test-play']) action(id, id === 'tts-preview-play' ? 'tts-role-status' : 'elevenlabs-api-status', async () => {
      if (!previewUrl || !preview) throw new Error('请先生成试听'); await preview.play();
    });
    action('elevenlabs-voice-fetch', 'tts-role-status', () => fetchVoices());
    action('elevenlabs-voice-next', 'tts-role-status', () => fetchVoices(true));
    const voiceSelect = get('elevenlabs-voice-select');
    if (voiceSelect && !voiceSelect.dataset.ttsBound) {
      voiceSelect.dataset.ttsBound = '1';
      voiceSelect.addEventListener('change', () => { if (voiceSelect.value) get('ai-voice-id-input').value = voiceSelect.value; });
    }
    action('elevenlabs-voice-sample', 'tts-role-status', async () => {
      const voice = voiceRows.find(row => row.voice_id === get('ai-voice-id-input').value.trim());
      if (!voice?.preview_url) throw new Error('此音色没有示例，请使用自定义试听');
      const url = new URL(voice.preview_url); if (url.protocol !== 'https:') throw new Error('示例音频地址不可用');
      if ((typeof videoCallState !== 'undefined' && videoCallState.isActive) || (typeof voiceCallState !== 'undefined' && voiceCallState.isActive)) throw new Error('通话中不能同时试听');
      stopPreview(); preview = get('tts-preview-player'); preview.src = url.href;
      preview.onended = () => { info('tts-role-status', '示例播放完成。'); stopPreview(); };
      preview.onerror = () => { info('tts-role-status', '音色示例无法播放，请使用自定义试听。'); stopPreview(); };
      await preview.play(); info('tts-role-status', '正在播放音色示例（不是当前参数生成的音频）。');
    });
    action('elevenlabs-favorite-add', 'tts-role-status', async () => {
      const id = get('ai-voice-id-input').value.trim(); if (!id) throw new Error('请先选择音色');
      const row = voiceRows.find(voice => voice.voice_id === id);
      const rows = [...window.ttsProvider.apiFields(state.apiConfig).elevenlabsVoiceLibrary];
      if (!rows.some(item => item.id === id)) rows.push({ id, name: row?.name || id });
      await saveLibrary('elevenlabsVoiceLibrary', rows); info('tts-role-status', '音色已收藏。');
    });
    action('elevenlabs-favorite-remove', 'tts-role-status', async () => {
      const id = get('elevenlabs-favorite-select').value; if (!id) throw new Error('请先选择要取消收藏的音色');
      await saveLibrary('elevenlabsVoiceLibrary', window.ttsProvider.apiFields(state.apiConfig).elevenlabsVoiceLibrary.filter(row => row.id !== id));
      info('tts-role-status', '已取消收藏；角色当前音色保留。');
    });
    const favorites = get('elevenlabs-favorite-select');
    if (favorites && !favorites.dataset.ttsBound) { favorites.dataset.ttsBound = '1'; favorites.addEventListener('change', () => { if (favorites.value) get('ai-voice-id-input').value = favorites.value; }); }
    action('elevenlabs-preset-save', 'tts-role-status', async () => {
      snapshotDraft(); const name = await showCustomPrompt('保存声音参数', '请输入预设名称'); if (!name?.trim()) return;
      const rows = [...window.ttsProvider.apiFields(state.apiConfig).elevenlabsSoundPresets];
      const existing = rows.findIndex(row => row.name === name.trim());
      if (existing >= 0 && !await showCustomConfirm('覆盖声音参数', `覆盖“${escapeText(name.trim())}”吗？`)) return;
      const row = { name: name.trim(), settings: { ...draft.elevenlabsVoiceSettings }, speed: draft.ttsSpeed };
      if (existing >= 0) rows[existing] = row; else rows.push(row);
      await saveLibrary('elevenlabsSoundPresets', rows); info('tts-role-status', '声音参数预设已保存。');
    });
    action('elevenlabs-preset-apply', 'tts-role-status', () => {
      const index = get('elevenlabs-sound-preset').value;
      const row = index === '' ? null : window.ttsProvider.apiFields(state.apiConfig).elevenlabsSoundPresets[Number(index)];
      if (!row) throw new Error('请先选择声音参数预设');
      for (const key of ['stability', 'similarity_boost', 'style']) get('elevenlabs-' + key).value = row.settings[key] ?? '';
      get('elevenlabs-speaker-boost').value = row.settings.use_speaker_boost == null ? '' : String(row.settings.use_speaker_boost);
      get('ai-voice-speed-input').value = row.speed; info('tts-role-status', '已应用声音参数；保存角色设置后生效。');
    });
    action('elevenlabs-preset-delete', 'tts-role-status', async () => {
      const index = get('elevenlabs-sound-preset').value; if (index === '') throw new Error('请先选择声音参数预设');
      const rows = [...window.ttsProvider.apiFields(state.apiConfig).elevenlabsSoundPresets];
      if (!await showCustomConfirm('删除声音参数', `删除“${escapeText(rows[Number(index)]?.name)}”吗？`)) return;
      rows.splice(Number(index), 1); await saveLibrary('elevenlabsSoundPresets', rows);
      info('tts-role-status', '预设已删除，角色当前参数保留。');
    });
    action('tts-clear-saved-audio', 'tts-role-status', async () => {
      if (!activeChat) return;
      const messages = activeChat.history.filter(message => message.ttsSavedAudio?.length);
      if (!messages.length) { info('tts-role-status', '该角色没有已保存的合成音频。'); return; }
      if (!await showCustomConfirm('清理合成音频', `清理这个角色的 ${messages.length} 条已保存合成音频吗？文字和真实录音保留，重新生成会产生 API 用量。`)) return;
      const previous = messages.map(message => [message, message.ttsSavedAudio]);
      messages.forEach(message => { delete message.ttsSavedAudio; });
      try { await db.chats.put(activeChat); }
      catch (error) { previous.forEach(([message, data]) => { message.ttsSavedAudio = data; }); throw error; }
      info('tts-role-status', '已清理保存的合成音频，聊天文字和真实录音保留。');
    });
    for (const screenId of ['api-settings-screen', 'chat-settings-screen']) {
      const screen = get(screenId);
      if (screen && !screen.dataset.ttsObserved && typeof MutationObserver !== 'undefined') {
        screen.dataset.ttsObserved = '1';
        new MutationObserver(() => {
          if (!screen.classList.contains('active')) {
            stopPreview();
            if (screenId === 'chat-settings-screen') window.fishTtsSettings?.closeChat();
          }
        }).observe(screen, { attributes: true, attributeFilter: ['class'] });
      }
    }
  }
  window.ttsSettings = { readApi, loadApi, loadChat, saveChat, validateChat, stopPreview, previewVoice,
    playPreview: async () => { if (!previewUrl || !preview) throw new Error('请先生成试听'); await preview.play(); } };
  window.addEventListener('pagehide', () => { stopPreview(); voiceController?.abort(); });
  window.addEventListener('tts-usage-updated', renderUsage);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPreview(); });
})();
