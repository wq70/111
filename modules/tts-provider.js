// Shared TTS request adapter. Existing players and message types remain unchanged.
(function () {
  'use strict';
  const defaults = {
    ...window.fishTts?.defaults,
    elevenlabsApiKey: '', elevenlabsBaseUrl: 'https://api.elevenlabs.io',
    elevenlabsModel: 'eleven_multilingual_v2', elevenlabsCallModel: '',
    elevenlabsVoiceLibrary: [], elevenlabsSoundPresets: []
  };
  const jobs = new Map();
  const models = new Map();
  const identities = new Map();
  let identitySequence = 0;
  const usage = { requests: 0, characters: 0, cacheHits: 0, sharedRequests: 0 };
  function notifyUsage() {
    if (typeof CustomEvent === 'function' && window.dispatchEvent) window.dispatchEvent(new CustomEvent('tts-usage-updated'));
  }
  const boosts = {
    'zh-CN': 'Chinese', 'zh-HK': 'Chinese,Yue', 'en-US': 'English',
    'ja-JP': 'Japanese', 'ko-KR': 'Korean', 'de-DE': 'German', 'fr-FR': 'French',
    'es-ES': 'Spanish', 'it-IT': 'Italian', 'ru-RU': 'Russian', 'pt-BR': 'Portuguese',
    'nl-NL': 'Dutch', 'pl-PL': 'Polish', 'sv-SE': 'Swedish', 'tr-TR': 'Turkish',
    'id-ID': 'Indonesian', 'ms-MY': 'Malay', 'vi-VN': 'Vietnamese', 'th-TH': 'Thai',
    'hi-IN': 'Hindi', 'ar-SA': 'Arabic'
  };
  const languageAliases = {
    'zh-Hans-CN': 'zh-CN', 'zh-Hant-TW': 'zh-CN', 'zh-Hant-HK': 'zh-HK',
    'yue-Hant-HK': 'zh-HK', 'yue-Hans-CN': 'zh-HK', 'en-GB': 'en-US',
    'es-MX': 'es-ES', 'pt-PT': 'pt-BR'
  };
  const abortError = () => new DOMException('语音请求已取消', 'AbortError');
  function provider(chat) { return ['elevenlabs', 'fish'].includes(chat?.settings?.ttsProvider) ? chat.settings.ttsProvider : 'minimax'; }
  function voiceId(chat, fallback = '') {
    if (provider(chat) === 'fish') return window.fishTts.voiceId(chat?.settings?.fishVoiceId);
    return provider(chat) === 'elevenlabs' ? (chat?.settings?.elevenlabsVoiceId || '')
      : (fallback || chat?.settings?.minimaxVoiceId || '');
  }
  function apiFields(config = {}) {
    return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, config[key] ?? value]));
  }
  function baseUrl(value) {
    const url = new URL((value || defaults.elevenlabsBaseUrl).trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) {
      throw new Error('语音接口地址需要是有效的 HTTP/HTTPS 地址，不能包含账号或片段');
    }
    return url;
  }
  function endpoint(base, path) {
    const url = baseUrl(base);
    url.pathname = url.pathname.replace(/\/+$/, '') + path;
    return url.href;
  }
  function account(config) {
    const raw = JSON.stringify([config.baseUrl, config.apiKey, config.groupId]);
    if (!identities.has(raw)) identities.set(raw, ++identitySequence);
    return identities.get(raw);
  }
  function language(chat) {
    const settings = chat?.settings || {};
    if (Object.prototype.hasOwnProperty.call(settings, 'ttsLanguage')) return settings.ttsLanguage || '';
    if (settings.enableBilingualMode && window.languagePolicy) {
      const policy = window.languagePolicy.getPolicy(chat);
      const selected = policy.ttsReadMode === 'translation' ? translationLanguage(policy) : policy.outputLanguage;
      return languageAliases[selected] || selected || '';
    }
    return provider(chat) === 'minimax' ? 'zh-CN' : '';
  }
  function translationLanguage(policy) {
    return policy.translationMode === 'interface'
      ? (localStorage.getItem('ephone-language') === 'en' ? 'en-US' : 'zh-Hans-CN') : policy.translationLanguage;
  }
  function resolve(chat, options = {}) {
    const settings = chat?.settings || {}, api = options.apiConfig || state.apiConfig;
    const name = provider(chat);
    const config = {
      provider: name, voiceId: voiceId(chat, options.voiceId), language: options.language ?? language(chat),
      context: options.context || 'chat', splitLongText: settings.ttsSplitLongText === true,
      streaming: settings.ttsStreaming === true,
      speed: Number(settings[name + 'TtsSpeed'] ?? settings.ttsSpeed ?? 1)
    };
    if (name === 'fish' || (name === 'elevenlabs' && window.fishTts?.isElevenCompatibility(api.elevenlabsBaseUrl))) {
      Object.assign(config, window.fishTts.resolve(settings, api, config.context, name === 'elevenlabs'), { provider: 'fish' });
    } else if (name === 'elevenlabs') {
      Object.assign(config, {
        baseUrl: api.elevenlabsBaseUrl || defaults.elevenlabsBaseUrl, apiKey: api.elevenlabsApiKey || '',
        model: settings.elevenlabsModel || (config.context === 'call' && api.elevenlabsCallModel) || api.elevenlabsModel || defaults.elevenlabsModel,
        voiceSettings: { ...(settings.elevenlabsVoiceSettings || {}) }
      });
    } else {
      Object.assign(config, {
        baseUrl: api.minimaxDomain || localStorage.getItem('minimax-domain') || 'https://api.minimax.chat',
        apiKey: api.minimaxApiKey || '', groupId: api.minimaxGroupId || '', model: api.minimaxModel || 'speech-01-hd'
      });
    }
    config.accountId = account(config);
    return config;
  }
  function validate(config) {
    if (!config.apiKey || (config.provider === 'minimax' && !config.groupId)) {
      throw new Error(`请先在 API 设置中配置 ${config.provider === 'fish' ? 'Fish' : config.provider === 'elevenlabs' ? 'ElevenLabs' : 'MiniMax'} 语音服务`);
    }
    if (!config.voiceId && config.provider !== 'fish') throw new Error('请先在角色设置中填写或选择语音 ID');
    baseUrl(config.baseUrl);
    const min = config.provider === 'elevenlabs' ? 0.7 : 0.5, max = config.provider === 'elevenlabs' ? 1.2 : 2;
    if (!Number.isFinite(config.speed) || config.speed < min || config.speed > max) throw new Error(`此语音服务支持的语速范围为 ${min}～${max}`);
    if (config.provider === 'fish') window.fishTts.validate(config);
    if (config.provider === 'elevenlabs') {
      const capability = models.get(config.accountId)?.find(model => model.model_id === config.model);
      if (capability?.can_do_text_to_speech === false) throw new Error('所选模型不支持文本转语音');
      const settings = config.voiceSettings;
      for (const key of ['stability', 'similarity_boost', 'style']) {
        if (settings[key] != null && (!Number.isFinite(Number(settings[key])) || Number(settings[key]) < 0 || Number(settings[key]) > 1)) {
          throw new Error('声音参数需要在 0～1 之间');
        }
      }
      if (settings.style != null && capability?.can_use_style === false) throw new Error('此模型不支持风格强度，请清空该覆盖参数');
      if (settings.use_speaker_boost === true && capability?.can_use_speaker_boost === false) throw new Error('此模型不支持声音增强');
    }
  }
  function cacheKey(config, text) {
    return 'tts_provider_' + JSON.stringify([config.provider, config.accountId, config.baseUrl, config.model,
      config.voiceId, config.language, config.context === 'call' && config.provider === 'minimax', config.speed,
      config.voiceSettings || {}, config.fishOptions || {}, config.fishProtocol || '', config.fishSpeechUrl || '', text]);
  }
  function cleanText(text, chat, context = 'chat') {
    let value = String(text || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    // Runs after bilingual selection; also strip translation markers in legacy calls.
    if (context === 'call' && provider(chat) === 'minimax') value = value.replace(/(\[.*?\]|\(.*?\)|（.*?）|[〖【][^〗】]*[〗】])/g, '').trim();
    if (chat?.videoOptimization?.ttsDialogueOnly && typeof extractDialogueOnly === 'function') value = extractDialogueOnly(value);
    return value.trim();
  }
  function segments(text, chat, config) {
    let parts = [{ text, language: config.language }];
    // MiniMax chat bubbles already select their text; calls retain the full content.
    if ((config.provider !== 'minimax' || config.context === 'call') && chat?.settings?.enableBilingualMode && window.languagePolicy) {
      const policy = window.languagePolicy.getPolicy(chat), split = window.languagePolicy.splitContent(text);
      const sourceLanguage = chat.settings.ttsLanguage || languageAliases[policy.outputLanguage] || policy.outputLanguage || '';
      const targetLanguage = languageAliases[translationLanguage(policy)] || translationLanguage(policy) || '';
      if (policy.ttsReadMode === 'both' && split.translationText) {
        parts = [{ text: split.sourceText, language: sourceLanguage }, { text: split.translationText, language: targetLanguage }];
      } else {
        parts = [{ text: config.context === 'call' && policy.ttsReadMode === 'source'
          ? split.sourceText : window.languagePolicy.getTtsText(text, chat),
          language: policy.ttsReadMode === 'translation' && split.translationText ? targetLanguage : config.language }];
      }
    }
    const capability = models.get(config.accountId)?.find(model => model.model_id === config.model);
    const fallbackLimit = config.model === 'eleven_flash_v2_5' ? 40000 : config.model === 'eleven_v3' ? 5000 : 10000;
    const modelLimit = Number(capability?.maximum_text_length_per_request);
    const limit = config.provider === 'fish' ? (config.splitLongText ? 1000 : Infinity) : config.provider === 'elevenlabs' ? (Number.isInteger(modelLimit) && modelLimit > 0 ? modelLimit : fallbackLimit) : Infinity;
    return parts.flatMap(part => {
      const value = cleanText(part.text, chat, config.context);
      if (!value) return [];
      if (Array.from(value).length <= limit) return [{ ...part, text: value }];
      if (!config.splitLongText) throw new Error(`文本超过所选模型的 ${limit} 字符限制，请在角色语音设置中开启“长文本分段”或缩短文本`);
      const result = [], chars = Array.from(value);
      while (chars.length) {
        let end = Math.min(limit, chars.length);
        if (end < chars.length) {
          for (let index = end - 1; index >= Math.floor(end / 2); index--) {
            if (/[。！？.!?\n]/.test(chars[index])) { end = index + 1; break; }
          }
        }
        result.push({ ...part, text: chars.splice(0, end).join('') });
      }
      return result;
    });
  }
  async function responseError(response, service) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data.error?.message || data.base_resp?.status_msg || (typeof data.detail === 'string' ? data.detail : data.detail?.message || data.detail?.status) || data.message || '';
    } catch (_) { }
    const labels = { 401: 'Key 无效或未提供', 402: '额度不足或免费资格已结束', 403: '账户、音色或模型权限不足', 404: '接口、模型或音色不存在', 429: '请求限流、并发受限或额度不足', 422: '文本或参数不被接口接受' };
    const error = new Error(`${service}：${labels[response.status] || '请求失败'}（${response.status}）${detail ? ' · ' + String(detail).slice(0, 350) : ''}`);
    error.status = response.status;
    return error;
  }
  function enforcedLanguage(config) {
    if (!config.language || config.model === 'eleven_multilingual_v2') return undefined;
    const selected = languageAliases[config.language] || config.language;
    if (selected === 'zh-HK' || selected.startsWith('yue')) throw new Error('此 TTS 接口不能将粤语作为普通话参数发送，请选择支持该方言的模型并使用自动识别');
    const code = selected.split('-')[0];
    const capability = models.get(config.accountId)?.find(model => model.model_id === config.model);
    if (capability?.languages?.length && !capability.languages.some(item => item.language_id === code)) throw new Error('所选模型不支持当前朗读语言');
    return code;
  }
  async function requestAudio(config, text, signal, onChunk) {
    validate(config);
    let url, body, headers;
    if (config.provider === 'fish') {
      const request = window.fishTts.request(config, text);
      url = new URL(request.url); headers = request.headers; body = request.body;
    } else if (config.provider === 'elevenlabs') {
      // Even Multilingual v2 cannot promise Cantonese merely by selecting zh-HK.
      if (config.language === 'zh-HK' || config.language.startsWith('yue')) throw new Error('当前音色配置不能保证粤语朗读，请选择自动识别并测试支持方言的模型');
      url = new URL(endpoint(config.baseUrl, '/v1/text-to-speech/' + encodeURIComponent(config.voiceId) + (config.streaming ? '/stream' : '')));
      url.searchParams.set('output_format', 'mp3_44100_128');
      headers = { 'xi-api-key': config.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' };
      body = { text, model_id: config.model };
      const code = enforcedLanguage(config);
      if (code) body.language_code = code;
      if (Object.keys(config.voiceSettings).length || config.speed !== 1) body.voice_settings = { ...config.voiceSettings, speed: config.speed };
    } else {
      url = new URL(endpoint(config.baseUrl, '/v1/t2a_v2'));
      url.searchParams.set('GroupId', config.groupId);
      headers = { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' };
      body = { model: config.model, text, stream: false,
        voice_setting: { voice_id: config.voiceId, speed: config.speed, vol: 1, pitch: 0 },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 } };
      if (config.context !== 'call') body.language_boost = boosts[config.language] || 'auto';
    }
    usage.requests++; usage.characters += Array.from(text).length; notifyUsage();
    let response;
    try { response = await fetch(url.href, { method: 'POST', headers, body: JSON.stringify(body), signal, cache: 'no-store' }); }
    catch (error) {
      if (config.provider === 'fish' && error.name !== 'AbortError') throw new Error('Fish 连接失败，请检查网络与接口地址；自定义地址需要允许浏览器跨域请求。');
      throw error;
    }
    if (!response.ok) throw await responseError(response, config.provider === 'fish' ? 'Fish' : config.provider === 'elevenlabs' ? 'ElevenLabs' : 'MiniMax');
    let blob;
    if (config.provider !== 'minimax') {
      const type = response.headers.get('content-type') || '';
      if (/json|text\/|html/i.test(type)) throw new Error('语音服务返回了非音频内容，请检查接口地址和参数');
      if (config.streaming && response.body?.getReader) {
        const reader = response.body.getReader(), chunks = [];
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (signal?.aborted) throw abortError();
            chunks.push(value); onChunk?.(value);
          }
        } finally { reader.releaseLock(); }
        blob = new Blob(chunks, { type: 'audio/mpeg' });
      } else {
        const bytes = await response.arrayBuffer();
        blob = new Blob([bytes], { type: 'audio/mpeg' });
      }
    } else {
      const data = await response.json();
      if (data.base_resp && data.base_resp.status_code !== 0) throw new Error(`MiniMax：${data.base_resp.status_msg || '语音生成失败'}`);
      const hex = data.data?.audio;
      if (!hex || hex.length % 2 || !/^[\da-f]+$/i.test(hex)) throw new Error('MiniMax 未返回有效音频数据');
      blob = new Blob([Uint8Array.from(hex.match(/../g), value => parseInt(value, 16))], { type: 'audio/mpeg' });
    }
    if (!blob.size) throw new Error('语音接口返回了空音频');
    if (signal?.aborted) throw abortError();
    return blob;
  }
  function trimCache() {
    const cache = state.ttsCache;
    let bytes = [...cache.values()].reduce((sum, item) => sum + (item.blob?.size || Math.ceil((item.url?.length || 0) * 0.75)), 0);
    while (cache.size > 15 || bytes > 24 * 1024 * 1024) {
      const key = cache.keys().next().value, item = cache.get(key);
      bytes -= item.blob?.size || Math.ceil((item.url?.length || 0) * 0.75);
      cache.delete(key);
    }
  }
  function generate(config, text, signal, onChunk) {
    if (signal?.aborted) return Promise.reject(abortError());
    const key = cacheKey(config, text), cached = state.ttsCache.get(key);
    if (cached?.blob) {
      usage.cacheHits++; notifyUsage();
      state.ttsCache.delete(key); state.ttsCache.set(key, cached);
      return Promise.resolve(cached.blob);
    }
    let job = jobs.get(key);
    if (job) { usage.sharedRequests++; notifyUsage(); }
    if (!job) {
      const controller = new AbortController();
      job = { controller, users: 0, done: false, chunks: [], listeners: new Set() };
      job.promise = (async () => {
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60000);
        try {
          const blob = await requestAudio(config, text, controller.signal, chunk => {
            job.chunks.push(chunk);
            for (const listener of job.listeners) { try { listener(chunk); } catch (_) { } }
          });
          state.ttsCache.set(key, { blob, type: blob.type }); trimCache();
          return blob;
        } catch (error) {
          if (timedOut) throw new Error('语音生成超过 60 秒，已停止等待；请检查网络或选择其他模型');
          throw error;
        } finally { clearTimeout(timer); job.done = true; if (jobs.get(key) === job) jobs.delete(key); }
      })();
      jobs.set(key, job);
    }
    job.users++;
    if (onChunk) {
      job.listeners.add(onChunk);
      for (const chunk of job.chunks) { try { onChunk(chunk); } catch (_) { } }
    }
    return new Promise((resolve, reject) => {
      let finished = false;
      const release = () => {
        if (finished) return false;
        finished = true; signal?.removeEventListener('abort', cancel); job.users--;
        if (onChunk) job.listeners.delete(onChunk);
        if (!job.users && !job.done) { job.controller.abort(); if (jobs.get(key) === job) jobs.delete(key); }
        return true;
      };
      const cancel = () => { if (release()) reject(abortError()); };
      signal?.addEventListener('abort', cancel, { once: true });
      job.promise.then(blob => { if (release()) resolve(blob); }, error => { if (release()) reject(error); });
      if (signal?.aborted) cancel();
    });
  }
  async function listModels(apiConfig, signal) {
    const config = resolve({ settings: { ttsProvider: 'elevenlabs' } }, { apiConfig });
    if (config.provider === 'fish') return (await window.fishTts.listModels({ fishApiKey: config.apiKey, fishBaseUrl: config.baseUrl }, signal)).map(row => ({ model_id: row.id, name: row.id, can_do_text_to_speech: true }));
    if (!config.apiKey) throw new Error('请填写 ElevenLabs API Key');
    const response = await fetchMetadata(endpoint(config.baseUrl, '/v1/models'), config.apiKey, signal);
    if (!response.ok) throw await responseError(response, 'ElevenLabs');
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('模型接口返回格式不正确');
    const result = data.filter(item => item.can_do_text_to_speech === true);
    models.set(config.accountId, result); return result;
  }
  async function listVoices(apiConfig, search = '', nextPage = '', signal) {
    const config = resolve({ settings: { ttsProvider: 'elevenlabs' } }, { apiConfig });
    if (config.provider === 'fish') {
      const page = Number(nextPage) || 1;
      const data = await window.fishTts.listVoices({ fishApiKey: config.apiKey, fishBaseUrl: config.baseUrl }, { search, page, signal });
      return { voices: data.voices.map(row => ({ voice_id: row._id, name: row.title, preview_url: row.samples?.[0]?.audio })), has_more: data.hasMore, next_page_token: data.hasMore ? String(page + 1) : '' };
    }
    if (!config.apiKey) throw new Error('请先在 API 设置中填写 ElevenLabs Key 并保存');
    const url = new URL(endpoint(config.baseUrl, '/v2/voices'));
    url.searchParams.set('page_size', '50');
    if (search) url.searchParams.set('search', search);
    if (nextPage) url.searchParams.set('next_page_token', nextPage);
    const response = await fetchMetadata(url.href, config.apiKey, signal);
    if (!response.ok) throw await responseError(response, 'ElevenLabs');
    const data = await response.json();
    if (!Array.isArray(data.voices)) throw new Error('音色接口返回格式不正确');
    return data;
  }
  async function fetchMetadata(url, key, signal) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) controller.abort();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    try {
      const response = await fetch(url, { headers: { 'xi-api-key': key }, signal: controller.signal, cache: 'no-store' });
      // Read the body inside the timeout too (headers alone do not finish a request).
      const data = await response.json();
      return { ok: response.ok, status: response.status, json: async () => data };
    } catch (error) {
      if (timedOut) throw new Error('接口请求超过 20 秒，请检查网络或接口地址');
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  }
  window.ttsProvider = { defaults, apiFields, provider, voiceId, resolve, validate, language,
    cacheKey, cleanText, segments, generate, listModels, listVoices, trimCache, endpoint, usage: () => ({ ...usage }) };
})();
