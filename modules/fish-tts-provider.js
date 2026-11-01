// Fish uses its OpenAI-compatible audio route: the native TTS route disallows browser CORS.
(function () {
  'use strict';
  const defaults = {
    fishApiKey: '', fishBaseUrl: 'https://api.fish.audio', fishModel: 'fish-audio/s2.1-pro-free',
    fishProtocol: 'fish', fishManagementBaseUrl: '', fishSpeechUrl: '',
    fishCallModel: '', fishTranscriptionModel: 'fish-audio/transcribe-1', fishVoiceLibrary: [], fishSoundPresets: []
  };
  const knownModels = new Set(['s1', 's2-pro', 's2.1-pro', 's2.1-pro-free'].map(id => 'fish-audio/' + id));
  function base(value) {
    const url = new URL(value || defaults.fishBaseUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Fish 接口需要有效的 HTTP/HTTPS 地址');
    return url;
  }
  function endpoint(value, path) {
    const url = base(value);
    let prefix = url.pathname.replace(/\/+$/, '');
    // Accept an origin or a pasted compatibility API root without duplicating its path.
    prefix = prefix.replace(/\/compat(?:\/(?:v1|api\/v1|openai\/v1)(?:\/audio\/speech)?|\/elevenlabs)?$|\/v1(?:\/tts)?$/, '');
    const [pathname, query] = path.split('?');
    url.pathname = prefix + pathname;
    if (query) new URLSearchParams(query).forEach((value, key) => url.searchParams.set(key, value));
    return url.href;
  }
  function isElevenCompatibility(value) {
    try { const url = base(value); return url.hostname === 'api.fish.audio' && /^\/compat\/elevenlabs\/?$/.test(url.pathname); }
    catch (_) { return false; }
  }
  function protocol(api) { return api.fishProtocol || 'fish'; }
  function relayEndpoint(value, path, kind) {
    const url = base(value);
    let prefix = url.pathname.replace(/\/+$/, '');
    if (kind === 'openai') {
      prefix = prefix.replace(/\/(?:audio\/(?:speech|transcriptions)|models)$/, '');
      if (!/\/v1$/.test(prefix)) prefix += '/v1';
      url.pathname = prefix + path;
    } else {
      prefix = prefix.replace(/\/v1\/tts$/, '').replace(/\/v1$/, '');
      url.pathname = prefix + path;
    }
    return url.href;
  }
  function metadataEndpoint(api, path) {
    const kind = protocol(api);
    if (kind !== 'fish' && api.fishManagementBaseUrl && !path.startsWith('/compat/')) return endpoint(api.fishManagementBaseUrl, path);
    if (kind === 'fish') return endpoint(api.fishBaseUrl, path);
    if (path.startsWith('/compat/v1/')) {
      const root = base(api.fishBaseUrl);
      root.pathname = root.pathname.replace(/\/v1\/tts\/?$/, '');
      return relayEndpoint(root.href, path.slice('/compat/v1'.length), 'openai');
    }
    // Voice management is Fish-native. Never send a relay Key to the official host as a fallback.
    const url = base(api.fishBaseUrl);
    url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/(?:audio\/(?:speech|transcriptions)|models)$/, '').replace(/\/v1(?:\/tts)?$/, '');
    return endpoint(url.href, path);
  }
  function voiceId(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^https?:\/\//i.test(text)) {
      const url = new URL(text);
      if (!/(^|\.)fish\.audio$/i.test(url.hostname)) throw new Error('请粘贴 Fish 音色链接或音色 ID');
      const match = url.pathname.match(/\/(?:m|model|voice)\/([^/]+)/);
      if (!match) throw new Error('链接中没有找到 Fish 音色 ID，请复制音色页面的 ID');
      return decodeURIComponent(match[1]);
    }
    if (/\s|[?#/]/.test(text) || text.length > 200) throw new Error('Fish 音色 ID 格式不正确');
    return text;
  }
  function modelId(value) {
    const id = String(value || defaults.fishModel).trim();
    return id.startsWith('fish-audio/') ? id : 'fish-audio/' + id;
  }
  function resolve(settings, api, context, compatibility = false) {
    if (compatibility) {
      const selected = settings.elevenlabsModel || (context === 'call' && api.elevenlabsCallModel) || api.elevenlabsModel;
      return { baseUrl: api.elevenlabsBaseUrl, apiKey: api.elevenlabsApiKey || '',
        model: modelId(selected && !selected.startsWith('eleven_') ? selected : defaults.fishModel),
        voiceId: voiceId(settings.elevenlabsVoiceId), fishOptions: settings.elevenlabsVoiceSettings?.stability == null ? {} : { temperature: 1 - Number(settings.elevenlabsVoiceSettings.stability) },
        fishCompatibility: true };
    }
    return { baseUrl: api.fishBaseUrl || defaults.fishBaseUrl, apiKey: api.fishApiKey || '',
      fishProtocol: protocol(api),
      fishSpeechUrl: api.fishSpeechUrl || '',
      model: protocol(api) === 'fish' ? modelId(settings.fishModel || (context === 'call' && api.fishCallModel) || api.fishModel)
        : String(settings.fishModel || (context === 'call' && api.fishCallModel) || api.fishModel || defaults.fishModel).trim(),
      voiceId: voiceId(settings.fishVoiceId), fishOptions: JSON.parse(JSON.stringify(settings.fishVoiceSettings || {})) };
  }
  const ranges = { temperature: [0, 1], top_p: [0, 1], chunk_length: [100, 300], min_chunk_length: [0, 100],
    early_stop_threshold: [0, 1], max_new_tokens: [0, 65536] };
  const allowed = new Set(['temperature', 'top_p', 'latency', 'prosody', 'chunk_length', 'min_chunk_length',
    'normalize', 'references', 'reference_id', 'max_new_tokens', 'condition_on_previous_chunks',
    'early_stop_threshold', 'features', 'repetition_penalty', 'sample_rate', 'mp3_bitrate',
    'pronunciation_dictionary', 'language']);
  function validate(config) {
    base(config.baseUrl);
    if (!['fish', 'openai', 'native'].includes(config.fishProtocol || 'fish')) throw new Error('请选择支持的 Fish 接口格式');
    if (config.fishSpeechUrl && config.fishProtocol !== 'fish') base(config.fishSpeechUrl);
    const destination = config.fishProtocol !== 'fish' && config.fishSpeechUrl ? config.fishSpeechUrl : config.baseUrl;
    if (base(destination).hostname === 'api.fish.audio' && !knownModels.has(modelId(config.model))) throw new Error('Fish 模型 ID 未识别，请获取模型列表后选择；为避免误用付费模型，已停止请求');
    const options = config.fishOptions || {};
    if (typeof options !== 'object' || Array.isArray(options)) throw new Error('Fish 高级参数需要是 JSON 对象');
    for (const key of Object.keys(options)) {
      if (!allowed.has(key)) throw new Error(`Fish 不支持此高级参数：${key}；请检查官方 TTS 参数名称`);
    }
    for (const [key, [min, max]] of Object.entries(ranges)) {
      if (options[key] != null && (typeof options[key] !== 'number' || !Number.isFinite(options[key]) || options[key] < min || options[key] > max)) throw new Error(`Fish ${key} 需要在 ${min}～${max} 之间`);
    }
    for (const key of ['normalize', 'condition_on_previous_chunks']) {
      if (options[key] != null && typeof options[key] !== 'boolean') throw new Error(`Fish ${key} 需要是 true 或 false`);
    }
    if (options.latency && !['normal', 'balanced', 'low'].includes(options.latency)) throw new Error('Fish 延迟模式无效');
    if (options.prosody?.volume != null && (typeof options.prosody.volume !== 'number' || !Number.isFinite(options.prosody.volume) || Math.abs(options.prosody.volume) > 20)) throw new Error('Fish 音量需要在 -20～20 之间');
    if (options.prosody != null && (typeof options.prosody !== 'object' || Array.isArray(options.prosody))) throw new Error('Fish prosody 需要是参数对象');
    if (options.prosody?.normalize_loudness != null && typeof options.prosody.normalize_loudness !== 'boolean') throw new Error('音量归一化需要是 true 或 false');
    if (options.reference_id != null && !(typeof options.reference_id === 'string' || (Array.isArray(options.reference_id) && options.reference_id.length && options.reference_id.every(id => typeof id === 'string' && id)))) throw new Error('reference_id 需要是音色 ID 或非空音色 ID 数组');
    for (const key of ['chunk_length', 'min_chunk_length', 'max_new_tokens']) if (options[key] != null && !Number.isInteger(options[key])) throw new Error(`Fish ${key} 需要是整数`);
    if (options.repetition_penalty != null && (typeof options.repetition_penalty !== 'number' || !Number.isFinite(options.repetition_penalty) || options.repetition_penalty <= 0)) throw new Error('重复惩罚需要大于 0');
    if (options.references != null && (!Array.isArray(options.references) || options.references.flat().some(row => typeof row?.audio !== 'string' || typeof row?.text !== 'string'))) throw new Error('参考音频需要包含 Base64 audio 和对应 text');
    if (options.features != null && (!Array.isArray(options.features) || options.features.some(flag => typeof flag !== 'string'))) throw new Error('Fish features 需要是字符串数组');
    if (options.mp3_bitrate != null && ![64, 128, 192].includes(options.mp3_bitrate)) throw new Error('MP3 码率可选 64、128、192');
    if (options.sample_rate != null && ![32000, 44100].includes(options.sample_rate)) throw new Error('MP3 采样率可选 32000、44100');
  }
  function request(config, text) {
    validate(config);
    const options = { ...config.fishOptions, prosody: { ...config.fishOptions?.prosody, speed: config.speed } };
    if (config.language) options.language = config.language;
    const kind = config.fishProtocol || 'fish';
    if (kind === 'native') return {
      url: config.fishSpeechUrl ? base(config.fishSpeechUrl).href : relayEndpoint(config.baseUrl, '/v1/tts', kind),
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', Accept: 'audio/mpeg', model: config.model.replace(/^fish-audio\//, '') },
      body: { ...options, text, ...(options.reference_id != null || options.references?.length ? {} : config.voiceId ? { reference_id: config.voiceId } : {}), format: 'mp3' }
    };
    if (kind === 'openai') return {
      url: config.fishSpeechUrl ? base(config.fishSpeechUrl).href : relayEndpoint(config.baseUrl, '/audio/speech', kind),
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: { model: config.model, input: text, voice: config.voiceId || '', response_format: 'mp3', speed: config.speed,
        ...(Object.keys(config.fishOptions || {}).length || config.language ? { provider: { options: { 'fish-audio': options } } } : {}) }
    };
    return { url: endpoint(config.baseUrl, '/compat/v1/audio/speech'),
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: { model: modelId(config.model), input: text, voice: config.voiceId || '', response_format: 'mp3', speed: config.speed,
        provider: { options: { 'fish-audio': options } } } };
  }
  async function error(response) {
    let detail = '';
    try { const data = await response.json(); detail = data.error?.message || (typeof data.detail === 'string' ? data.detail : data.detail?.message) || data.message || ''; } catch (_) { }
    const labels = { 401: 'Key 无效或已过期', 402: '额度不足或免费资格已结束', 403: '音色、模型或账户权限不足', 404: '接口、音色或模型不存在', 422: '音频、文字或参数不被接受', 429: '请求过多或免费额度受限' };
    const result = new Error(`Fish：${labels[response.status] || '请求失败'}（${response.status}）${detail ? ' · ' + String(detail).slice(0, 250) : ''}`);
    result.status = response.status; return result;
  }
  async function metadata(api, path, options = {}) {
    if (!api.fishApiKey) throw new Error('请先填写 Fish API Key；角色音色管理使用已经保存的配置');
    const controller = new AbortController(), cancel = () => controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) controller.abort();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.method === 'POST' ? 120000 : 25000);
    try {
      const headers = { Authorization: `Bearer ${api.fishApiKey}` };
      let body = options.body;
      if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
      const response = await fetch(metadataEndpoint(api, path), { method: options.method || 'GET', headers, body, signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw await error(response);
      if (response.status === 204) return null;
      const text = await response.text(); return text ? JSON.parse(text) : null;
    } catch (cause) {
      if (timedOut) throw new Error('Fish 请求超时，请检查网络；创建音色超时后请先刷新“我的音色”，避免重复创建');
      if (cause instanceof TypeError && !controller.signal.aborted) throw new Error('无法连接 Fish。请检查网络和接口地址；自定义接口需要允许浏览器跨域请求。');
      throw cause;
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
  }
  async function listModels(api, signal) {
    const data = await metadata(api, '/compat/v1/models', { signal });
    if (!Array.isArray(data?.data)) throw new Error('Fish 模型列表格式不正确');
    const rows = data.data.filter(row => typeof row.id === 'string' && (protocol(api) !== 'fish' || row.id.startsWith('fish-audio/')) && !/transcri|\basr\b/i.test(row.id));
    if (base(api.fishBaseUrl).hostname === 'api.fish.audio') rows.forEach(row => knownModels.add(row.id));
    return rows;
  }
  async function listVoices(api, { search = '', page = 1, mine = false, language = '', signal } = {}) {
    const query = new URLSearchParams({ page_size: '30', page_number: String(page) });
    if (search) query.set('title', search);
    if (mine) query.set('self', 'true');
    if (language) query.set('language', language);
    // Keep query parameters on custom gateways too.
    const url = new URL(metadataEndpoint(api, '/model'));
    query.forEach((value, key) => url.searchParams.set(key, value));
    const data = await metadata(api, '/model' + url.search, { signal });
    if (!Array.isArray(data?.items)) throw new Error('Fish 音色列表格式不正确');
    return { voices: data.items, hasMore: data.items.length === 30 };
  }
  async function createVoice(api, { title, description, files, texts = [], signal }) {
    if (!title?.trim() || !files?.length || files.length > 20) throw new Error('请填写音色名称，并选择 1～20 段自己的参考录音');
    if (texts.length && texts.length !== files.length) throw new Error('参考文字需每段录音对应一行，或全部留空');
    const form = new FormData();
    for (const [key, value] of Object.entries({ type: 'tts', title: title.trim(), description: description || '', train_mode: 'fast', visibility: 'private' })) form.append(key, value);
    files.forEach((file, i) => { if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('每段录音需非空且小于 20 MB'); form.append('voices', file, file.name); if (texts.length) form.append('texts', texts[i]); });
    return metadata(api, '/model', { method: 'POST', body: form, signal });
  }
  async function transcribe(api, blob, signal) {
    if (!blob?.size || blob.size > 100 * 1024 * 1024) throw new Error('Fish 转写音频需非空且不超过 100 MB');
    const form = new FormData(), type = blob.type || '';
    const extension = /wav/i.test(type) ? 'wav' : /mpeg|mp3/i.test(type) ? 'mp3' : /mp4|m4a/i.test(type) ? 'm4a' : /ogg/i.test(type) ? 'ogg' : 'webm';
    form.append('file', blob, 'recording.' + extension);
    form.append('model', api.fishTranscriptionModel || defaults.fishTranscriptionModel);
    form.append('response_format', 'json');
    const data = await metadata(api, '/compat/v1/audio/transcriptions', { method: 'POST', body: form, signal });
    if (!String(data?.text || '').trim()) throw new Error('Fish 转写未返回文字，原声仍然保留');
    return data.text.trim();
  }
  window.fishTts = { defaults, endpoint, metadataEndpoint, isElevenCompatibility, voiceId, modelId, resolve, validate, request, metadata, listModels, listVoices, createVoice, transcribe,
    check: (api, signal) => metadata(api, protocol(api) === 'fish' ? '/wallet/self/api-credit' : '/compat/v1/models', { signal }),
    getVoice: (api, id, signal) => metadata(api, '/model/' + encodeURIComponent(voiceId(id)), { signal }),
    updateVoice: (api, id, body, signal) => metadata(api, '/model/' + encodeURIComponent(voiceId(id)), { method: 'PATCH', body, signal }),
    deleteVoice: (api, id, signal) => metadata(api, '/model/' + encodeURIComponent(voiceId(id)), { method: 'DELETE', signal }) };
})();
