// Independent Fish controls share the existing character save and audio preview lifecycle.
(function () {
  'use strict';
  const get = id => document.getElementById(id);
  const say = (id, value) => { if (get(id)) get(id).textContent = value; };
  const apiKeys = { 'fish-api-key': 'fishApiKey', 'fish-base-url': 'fishBaseUrl', 'fish-model-input': 'fishModel', 'fish-call-model': 'fishCallModel', 'fish-transcription-model': 'fishTranscriptionModel',
    'fish-protocol': 'fishProtocol', 'fish-management-base-url': 'fishManagementBaseUrl', 'fish-speech-url': 'fishSpeechUrl' };
  const numeric = { temperature: 'fish-temperature', top_p: 'fish-top-p', volume: 'fish-volume' };
  let rows = [], page = 1, more = false, query = '', mine = false, controller = null, generation = 0;
  let roleGeneration = 0;
  let sample = null;
  function readApi() {
    return Object.fromEntries(Object.entries(apiKeys).map(([id, key]) => [key, get(id)?.value.trim() ?? state.apiConfig[key] ?? window.fishTts.defaults[key]]).map(([key, value]) => [key, value || (key === 'fishApiKey' ? '' : window.fishTts.defaults[key])]));
  }
  const currentApi = () => ({ ...state.apiConfig, ...readApi() });
  const storedApi = () => ({ ...window.fishTts.defaults, ...state.apiConfig });
  function option(select, value, label) {
    const node = document.createElement('option'); node.value = value; node.textContent = label; select.appendChild(node);
  }
  function loadApi() {
    const api = storedApi();
    for (const [id, key] of Object.entries(apiKeys)) if (get(id)) get(id).value = api[key];
    if (get('fish-model-select')) get('fish-model-select').value = api.fishModel;
    renderConnection();
    bind();
  }
  function renderConnection() {
    const relay = readApi().fishProtocol !== 'fish';
    if (get('fish-relay-options')) get('fish-relay-options').hidden = !relay;
    const details = get('fish-base-url')?.closest?.('details');
    if (relay && details) details.open = true;
  }
  function loadOptions(options = {}) {
    if (!get('fish-advanced-json')) return;
    const extra = JSON.parse(JSON.stringify(options));
    for (const [key, id] of Object.entries(numeric)) get(id).value = key === 'volume' ? extra.prosody?.volume ?? '' : extra[key] ?? '';
    get('fish-latency').value = extra.latency || '';
    get('fish-normalize').value = extra.normalize == null ? '' : String(extra.normalize);
    get('fish-quality-guard').checked = extra.features?.includes('quality-guard') || false;
    delete extra.temperature; delete extra.top_p; delete extra.latency; delete extra.normalize;
    if (extra.prosody) { delete extra.prosody.volume; delete extra.prosody.speed; if (!Object.keys(extra.prosody).length) delete extra.prosody; }
    if (extra.features) { extra.features = extra.features.filter(flag => flag !== 'quality-guard'); if (!extra.features.length) delete extra.features; }
    get('fish-advanced-json').value = Object.keys(extra).length ? JSON.stringify(extra, null, 2) : '';
  }
  function options() {
    let value;
    try { value = JSON.parse(get('fish-advanced-json').value.trim() || '{}'); }
    catch (_) { throw new Error('Fish 高级参数不是有效的 JSON，请检查括号和逗号'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Fish 高级参数需要是 JSON 对象');
    for (const [key, id] of Object.entries(numeric)) {
      const raw = get(id).value;
      if (raw !== '') {
        if (key === 'volume') value.prosody = { ...value.prosody, volume: Number(raw) };
        else value[key] = Number(raw);
      }
    }
    if (get('fish-latency').value) value.latency = get('fish-latency').value;
    if (get('fish-normalize').value !== '') value.normalize = get('fish-normalize').value === 'true';
    if (get('fish-quality-guard').checked) value.features = [...new Set([...(value.features || []), 'quality-guard'])];
    return value;
  }
  function snapshot(draft) {
    if (get('tts-provider-select')?.value !== 'fish') return;
    draft.fishVoiceId = window.fishTts.voiceId(get('ai-voice-id-input').value);
    draft.fishModel = get('fish-role-model').value.trim(); draft.fishVoiceSettings = options();
  }
  function loadChat(draft) {
    controller?.abort(); generation++; roleGeneration++; stopSample(); rows = []; page = 1; more = false; query = ''; mine = false;
    for (const id of ['fish-own-title', 'fish-own-description', 'fish-own-texts', 'fish-own-files']) get(id).value = '';
    say('fish-voice-description', '');
    get('fish-role-model').value = draft.fishModel || '';
    get('fish-voice-search').value = ''; get('fish-voice-scope').value = 'public';
    loadOptions(draft.fishVoiceSettings); renderRows(); renderLibrary(); bind();
  }
  function render(name, chat) {
    if (get('fish-role-options')) get('fish-role-options').hidden = name !== 'fish' || Boolean(chat?.isGroup);
    if (name !== 'fish') { controller?.abort(); generation++; roleGeneration++; stopSample(); }
  }
  function stopSample() {
    if (sample) { sample.pause(); sample.removeAttribute('src'); sample.onended = sample.onerror = null; sample = null; }
  }
  function renderRows() {
    const select = get('fish-voice-select'); select.replaceChildren(); option(select, '', '选择音色，或手填 ID / 链接');
    for (const row of rows) option(select, row._id, `${row.title || row._id}${row.languages?.length ? ' · ' + row.languages.join('/') : ''}`);
    get('fish-voice-next').hidden = !more;
  }
  async function fetchVoices(append = false) {
    controller?.abort(); const request = new AbortController(); controller = request;
    const token = ++generation;
    if (!append) { query = get('fish-voice-search').value.trim(); mine = get('fish-voice-scope').value === 'mine'; page = 1; }
    const next = append ? page + 1 : 1;
    say('tts-role-status', '正在获取 Fish 音色…');
    const result = await window.fishTts.listVoices(storedApi(), { search: query, page: next, mine, signal: request.signal });
    if (token !== generation || request.signal.aborted) return;
    rows = [...new Map((append ? [...rows, ...result.voices] : result.voices).map(row => [row._id, row])).values()];
    page = next; more = result.hasMore; renderRows();
    say('tts-role-status', `已获取 ${rows.length} 个${mine ? '自己的' : '公开'}音色；选择后可试听${more ? '，也可继续加载' : ''}。`);
  }
  function selectedId() { return window.fishTts.voiceId(get('ai-voice-id-input').value); }
  function ownSelection() {
    const id = selectedId();
    if (!mine || !rows.some(row => row._id === id)) throw new Error('请先获取“我的音色”，并选择要管理的音色');
    return id;
  }
  function renderLibrary() {
    const api = storedApi(), favorites = get('fish-favorite-select'), presets = get('fish-sound-preset');
    favorites.replaceChildren(); presets.replaceChildren(); option(favorites, '', '收藏的 Fish 音色'); option(presets, '', 'Fish 声音参数预设');
    for (const row of api.fishVoiceLibrary) option(favorites, row.id, row.name || row.id);
    api.fishSoundPresets.forEach((row, index) => option(presets, String(index), row.name));
  }
  async function saveLibrary(key, value) {
    const next = { ...state.apiConfig, [key]: value }; await db.apiConfig.put(next); state.apiConfig = next; renderLibrary();
  }
  function action(id, status, run) {
    const button = get(id); if (!button || button.dataset.fishBound) return;
    button.dataset.fishBound = '1';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await run(); } catch (error) { if (error.name !== 'AbortError') say(status, error.message || '操作失败'); }
      finally { button.disabled = false; }
    });
  }
  function change(id, run) {
    const node = get(id); if (!node || node.dataset.fishBound) return; node.dataset.fishBound = '1'; node.addEventListener('change', run);
  }
  const escaped = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  function bind() {
    action('fish-key-show', 'fish-api-status', () => { const node = get('fish-api-key'); node.type = node.type === 'password' ? 'text' : 'password'; get('fish-key-show').textContent = node.type === 'password' ? '显示' : '隐藏'; });
    action('fish-key-clear', 'fish-api-status', () => { get('fish-api-key').value = ''; say('fish-api-status', '已清空输入，保存 API 设置后生效。'); });
    change('fish-protocol', renderConnection);
    action('fish-connect-test', 'fish-api-status', async () => {
      const api = currentApi(); await window.fishTts.check(api);
      say('fish-api-status', api.fishProtocol === 'fish' ? '账户鉴权通过。免费资格、模型和音色能否使用，请生成试听确认。'
        : '中转站模型接口可访问；公开目录不能证明 Key 有效。请生成试听确认鉴权和音色支持。仅提供合成的中转站可直接手填模型并试听。');
    });
    action('fish-model-fetch', 'fish-api-status', async () => {
      const rows = await window.fishTts.listModels(currentApi()), select = get('fish-model-select'), chosen = readApi().fishModel;
      select.replaceChildren(); rows.forEach(row => option(select, row.id, row.id));
      if (!rows.some(row => row.id === chosen)) option(select, chosen, chosen); select.value = chosen;
      say('fish-api-status', '模型列表已更新；能获取目录不代表 Key、音色或免费资格通过合成验证，请生成试听。');
    });
    change('fish-model-select', () => { get('fish-model-input').value = get('fish-model-select').value; });
    action('fish-test-generate', 'fish-api-status', () => window.ttsSettings.previewVoice('fish'));
    action('fish-test-play', 'fish-api-status', () => window.ttsSettings.playPreview());
    action('fish-test-stop', 'fish-api-status', () => { window.ttsSettings.stopPreview(); say('fish-api-status', '试听已停止。'); });
    action('fish-voice-fetch', 'tts-role-status', () => fetchVoices());
    action('fish-voice-next', 'tts-role-status', () => fetchVoices(true));
    change('fish-voice-scope', () => { controller?.abort(); generation++; mine = false; rows = []; more = false; renderRows(); say('tts-role-status', '范围已改变，请点击获取音色。'); });
    change('fish-voice-select', () => { if (get('fish-voice-select').value) get('ai-voice-id-input').value = get('fish-voice-select').value; });
    change('fish-favorite-select', () => { if (get('fish-favorite-select').value) get('ai-voice-id-input').value = get('fish-favorite-select').value; });
    action('fish-voice-detail', 'tts-role-status', async () => {
      const id = selectedId(); if (!id) throw new Error('请先选择音色或填写 ID');
      const token = roleGeneration;
      const row = await window.fishTts.getVoice(storedApi(), id);
      if (token !== roleGeneration || selectedId() !== id) return;
      say('fish-voice-description', `${row.title || id} · ${row.description || '暂无简介'} · ${row.visibility || ''}`);
      if (mine && rows.some(item => item._id === id)) { get('fish-own-title').value = row.title || ''; get('fish-own-description').value = row.description || ''; }
    });
    action('fish-voice-sample', 'tts-role-status', async () => {
      const row = rows.find(item => item._id === selectedId());
      const value = row?.samples?.[0]?.audio;
      if (!value) throw new Error('此音色没有示例，请使用下面的角色试听');
      const url = new URL(value); if (url.protocol !== 'https:') throw new Error('音色示例地址无效');
      if ((typeof videoCallState !== 'undefined' && videoCallState.isActive) || (typeof voiceCallState !== 'undefined' && voiceCallState.isActive)) throw new Error('请先结束通话再试听');
      window.ttsSettings.stopPreview(); sample = get('fish-sample-player'); sample.src = url.href;
      sample.onended = sample.onerror = stopSample; await sample.play(); say('tts-role-status', '正在播放音色示例；它不代表当前参数生成的效果。');
    });
    action('fish-sample-stop', 'tts-role-status', stopSample);
    action('fish-favorite-add', 'tts-role-status', async () => {
      const id = selectedId(); if (!id) throw new Error('请先选择音色');
      const favorites = [...storedApi().fishVoiceLibrary];
      if (!favorites.some(row => row.id === id)) favorites.push({ id, name: rows.find(row => row._id === id)?.title || id });
      await saveLibrary('fishVoiceLibrary', favorites); say('tts-role-status', 'Fish 音色已收藏。');
    });
    action('fish-favorite-remove', 'tts-role-status', async () => {
      const id = get('fish-favorite-select').value; if (!id) throw new Error('请选择收藏的音色');
      await saveLibrary('fishVoiceLibrary', storedApi().fishVoiceLibrary.filter(row => row.id !== id)); say('tts-role-status', '已取消收藏，当前音色保留。');
    });
    action('fish-preset-save', 'tts-role-status', async () => {
      const settings = options(), speed = Number(get('ai-voice-speed-input').value || 1);
      window.ttsProvider.validate({ ...window.ttsProvider.resolve({ settings: { ttsProvider: 'fish', fishVoiceSettings: settings, fishTtsSpeed: speed, fishModel: get('fish-role-model').value } }), apiKey: 'pending' });
      const name = (await showCustomPrompt('保存 Fish 参数', '请输入预设名称'))?.trim(); if (!name) return;
      const presets = [...storedApi().fishSoundPresets], index = presets.findIndex(row => row.name === name);
      if (index >= 0 && !await showCustomConfirm('覆盖参数预设', `覆盖“${escaped(name)}”吗？`)) return;
      const row = { name, settings, speed, model: get('fish-role-model').value.trim() };
      if (index >= 0) presets[index] = row; else presets.push(row); await saveLibrary('fishSoundPresets', presets); say('tts-role-status', 'Fish 参数预设已保存。');
    });
    action('fish-preset-apply', 'tts-role-status', () => {
      const index = get('fish-sound-preset').value, row = index === '' ? null : storedApi().fishSoundPresets[Number(index)];
      if (!row) throw new Error('请选择参数预设'); loadOptions(row.settings); get('ai-voice-speed-input').value = row.speed; get('fish-role-model').value = row.model || ''; say('tts-role-status', '参数已应用，保存角色设置后生效。');
    });
    action('fish-preset-delete', 'tts-role-status', async () => {
      const index = get('fish-sound-preset').value, presets = [...storedApi().fishSoundPresets]; if (index === '' || !presets[Number(index)]) throw new Error('请选择参数预设');
      if (!await showCustomConfirm('删除参数预设', `删除“${escaped(presets[Number(index)].name)}”吗？`)) return;
      presets.splice(Number(index), 1); await saveLibrary('fishSoundPresets', presets);
    });
    action('fish-own-create', 'tts-role-status', async () => {
      const files = Array.from(get('fish-own-files').files || []), title = get('fish-own-title').value.trim();
      if (!title || !files.length) throw new Error('请填写音色名称并选择参考录音');
      const token = roleGeneration, api = storedApi();
      const input = { title, description: get('fish-own-description').value, files,
        texts: get('fish-own-texts').value.trim() ? get('fish-own-texts').value.trim().split('\n') : [] };
      if (!await showCustomConfirm('创建私有 Fish 音色', `将选中的 ${files.length} 段录音上传到你的 Fish 账户，创建私有音色“${escaped(title)}”吗？请确保你有权使用这些录音。`)) return;
      if (token !== roleGeneration) return;
      say('tts-role-status', '正在上传并创建私有音色，请稍候…');
      const row = await window.fishTts.createVoice(api, input);
      // Cloud creation may finish after the user leaves. Never apply its ID to another role.
      if (token !== roleGeneration) return;
      get('fish-own-files').value = ''; get('fish-own-texts').value = '';
      const id = row?._id || row?.id; if (id) get('ai-voice-id-input').value = id;
      get('fish-voice-scope').value = 'mine'; await fetchVoices(); if (id) get('fish-voice-select').value = id;
      say('tts-role-status', '私有音色已创建；训练状态及可用性请通过详情和试听确认。保存角色设置后生效。');
    });
    action('fish-own-update', 'tts-role-status', async () => {
      const id = ownSelection(), title = get('fish-own-title').value.trim(); if (!title) throw new Error('请填写音色名称');
      const token = roleGeneration;
      await window.fishTts.updateVoice(storedApi(), id, { title, description: get('fish-own-description').value });
      if (token !== roleGeneration) return;
      await fetchVoices(); say('tts-role-status', '音色名称和简介已更新。');
    });
    action('fish-own-delete', 'tts-role-status', async () => {
      const id = ownSelection(), token = roleGeneration, api = storedApi();
      if (!await showCustomConfirm('删除 Fish 云端音色', '删除后这个音色将无法继续合成，引用它的角色也会受影响。确认删除吗？')) return;
      if (token !== roleGeneration) return;
      await window.fishTts.deleteVoice(api, id);
      if (token !== roleGeneration) return;
      if (selectedId() === id) get('ai-voice-id-input').value = '';
      await fetchVoices(); say('tts-role-status', '云端音色已删除，请重新选择角色音色并保存。');
    });
  }
  window.fishTtsSettings = { readApi, loadApi, loadChat, snapshot, render, stopSample };
  // Leaving the settings screen invalidates pending selections, not completed cloud work.
  function closeChat() { controller?.abort(); generation++; roleGeneration++; stopSample(); }
  window.fishTtsSettings.closeChat = closeChat;
  window.addEventListener('pagehide', () => { controller?.abort(); generation++; stopSample(); });
})();
