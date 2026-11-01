const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

function fixture(fetchImpl) {
  const requests = [];
  const apiConfig = { minimaxGroupId: 'group', minimaxApiKey: 'mini-key', minimaxModel: 'speech-01-hd',
    elevenlabsApiKey: 'eleven-key', elevenlabsBaseUrl: 'https://api.elevenlabs.io', elevenlabsModel: 'eleven_multilingual_v2' };
  const context = { state: { apiConfig, ttsCache: new Map(), chats: {} }, localStorage: { getItem: () => null },
    Map, Set, URL, Blob, DOMException, AbortController, Uint8Array, console, setTimeout, clearTimeout, FormData, URLSearchParams,
    fetch: async (url, options) => {
      requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
      return fetchImpl ? fetchImpl(url, options) : new Response(Uint8Array.of(73, 68, 51, 1), { headers: { 'Content-Type': 'audio/mpeg' } });
    } };
  context.window = context;
  vm.createContext(context); vm.runInContext(source('modules/fish-tts-provider.js'), context); vm.runInContext(source('modules/tts-provider.js'), context);
  return { context, api: context.ttsProvider, requests, apiConfig };
}
const eleven = settings => ({ id: 'a', settings: { ttsProvider: 'elevenlabs', elevenlabsVoiceId: 'voice/with space', ...settings } });
const mini = settings => ({ id: 'm', settings: { minimaxVoiceId: 'old-voice', ...settings } });
const fish = settings => ({ id: 'f', settings: { ttsProvider: 'fish', ...settings } });

test('两种 Fish 中转通过共用生成层获得 MP3，缓存区分协议与完整地址', async () => {
  const f = fixture(); Object.assign(f.apiConfig, { fishApiKey: 'relay-key', fishProtocol: 'openai', fishBaseUrl: 'https://relay.example/v1', fishModel: 'relay-alias' });
  const first = f.api.resolve(fish()); await f.api.generate(first, '中转测试');
  assert.equal(f.requests[0].url, 'https://relay.example/v1/audio/speech'); assert.equal(f.requests[0].body.model, 'relay-alias');
  f.apiConfig.fishProtocol = 'native';
  const native = f.api.resolve(fish()); const blob = await f.api.generate(native, '中转测试');
  assert.equal(blob.type, 'audio/mpeg'); assert.equal(f.requests[1].url, 'https://relay.example/v1/tts');
  assert.equal(f.requests[1].options.headers.model, 'relay-alias'); assert.equal(f.requests[1].body.text, '中转测试');
  assert.notEqual(f.api.cacheKey(first, '中转测试'), f.api.cacheKey(native, '中转测试'));
  f.apiConfig.fishSpeechUrl = 'https://relay.example/special'; const custom = f.api.resolve(fish());
  assert.notEqual(f.api.cacheKey(custom, '中转测试'), f.api.cacheKey(native, '中转测试'));
});

test('Fish 独立 Key、默认免费模型和默认音色；仅使用浏览器允许的请求头和 MP3', async () => {
  const f = fixture(); f.apiConfig.fishApiKey = 'fish-test-only';
  const config = f.api.resolve(fish());
  assert.equal(config.apiKey, 'fish-test-only'); assert.equal(config.provider, 'fish'); assert.equal(config.voiceId, '');
  assert.equal(config.model, 'fish-audio/s2.1-pro-free');
  const blob = await f.api.generate(config, '你好 Fish');
  assert.equal(blob.type, 'audio/mpeg'); assert.equal(blob.size, 4);
  const r = f.requests[0];
  assert.equal(r.url, 'https://api.fish.audio/compat/v1/audio/speech');
  assert.deepEqual(Object.keys(r.options.headers).sort(), ['Accept', 'Authorization', 'Content-Type']);
  assert.equal(r.options.headers.Authorization, 'Bearer fish-test-only');
  assert.equal(r.body.model, 'fish-audio/s2.1-pro-free'); assert.equal(r.body.voice, '');
  assert.equal(r.body.input, '你好 Fish'); assert.equal(r.body.response_format, 'mp3');
  assert.equal(JSON.stringify(config).includes('mini-key'), false);
});

test('Fish 角色、通话模型覆盖及原生参数透传；缓存包含所有声音选项', async () => {
  const f = fixture(); Object.assign(f.apiConfig, { fishApiKey: 'fish-key', fishCallModel: 's2-pro' });
  assert.equal(f.api.resolve(fish(), { context: 'call' }).model, 'fish-audio/s2-pro');
  const chat = fish({ fishModel: 's2.1-pro-free', fishVoiceId: 'https://fish.audio/m/voice-id/', fishTtsSpeed: 1.3,
    fishVoiceSettings: { temperature: 0.4, top_p: 0.8, latency: 'normal', prosody: { volume: 3, normalize_loudness: true },
      features: ['quality-guard'], pronunciation_dictionary: [{ id: 'dictionary-id', version: 'v1' }],
      reference_id: ['voice-a', 'voice-b'], references: [{ audio: 'AA==', text: '参考文字' }] }, ttsLanguage: 'zh-CN' });
  const config = f.api.resolve(chat, { context: 'call' });
  assert.equal(config.model, 'fish-audio/s2.1-pro-free'); assert.equal(config.voiceId, 'voice-id');
  await f.api.generate(config, '<|speaker:0|>你好<|speaker:1|>欢迎');
  const options = f.requests[0].body.provider.options['fish-audio'];
  assert.equal(options.prosody.speed, 1.3); assert.equal(options.prosody.volume, 3); assert.equal(options.language, 'zh-CN');
  assert.deepEqual(options.reference_id, ['voice-a', 'voice-b']); assert.equal(options.references[0].text, '参考文字');
  assert.equal(config.fishOptions.prosody.speed, undefined);
  assert.notEqual(f.api.cacheKey(config, '你好'), f.api.cacheKey({ ...config, fishOptions: { temperature: 0.5 } }, '你好'));
  assert.equal(f.api.cacheKey(config, '你好').includes('fish-key'), false);
});

test('Fish 兼容 ElevenLabs 旧配置走可跨域通道，普通 ElevenLabs 地址保持原协议', async () => {
  const f = fixture(); Object.assign(f.apiConfig, { elevenlabsBaseUrl: 'https://api.fish.audio/compat/elevenlabs', elevenlabsModel: 's2.1-pro-free' });
  const config = f.api.resolve(eleven({ elevenlabsVoiceId: '', elevenlabsVoiceSettings: { stability: 0.6, style: 0.8 }, elevenlabsTtsSpeed: 1.1 }));
  await f.api.generate(config, '兼容');
  assert.equal(config.provider, 'fish'); assert.equal(f.requests[0].options.headers.Authorization, 'Bearer eleven-key');
  assert.equal(f.requests[0].body.provider.options['fish-audio'].temperature, 0.4);
  assert.equal(f.requests[0].body.provider.options['fish-audio'].style, undefined);
  assert.equal(f.requests[0].options.headers['xi-api-key'], undefined);
  f.apiConfig.elevenlabsBaseUrl = 'https://proxy.example/compat/elevenlabs';
  assert.equal(f.api.resolve(eleven()).provider, 'elevenlabs');
});

test('Fish 无效模型和参数在发送前拦截，不静默改成付费模型', async () => {
  const f = fixture(); f.apiConfig.fishApiKey = 'fish-key';
  for (const settings of [{ fishModel: 's2.1-pro-fre' }, { fishTtsSpeed: 2.1 }, { fishVoiceSettings: { temperature: 2 } },
    { fishVoiceSettings: { latency: 'fast' } }, { fishVoiceSettings: { chunk_length: 123.5 } },
    { fishVoiceSettings: { prosody: { volume: -21 } } }, { fishVoiceSettings: { unknown: true } }]) {
    await assert.rejects(f.api.generate(f.api.resolve(fish(settings)), '无效'));
  }
  assert.equal(f.requests.length, 0);
});

test('Fish 流式和完整音频共享一次请求；缓存与账户隔离', async () => {
  const f = fixture(); f.apiConfig.fishApiKey = 'fish-key';
  const config = f.api.resolve(fish({ ttsStreaming: true })), chunks = [];
  const [a, b] = await Promise.all([f.api.generate(config, '流式', null, value => chunks.push(value)), f.api.generate(config, '流式')]);
  assert.equal(f.requests.length, 1); assert.equal(a, b); assert.equal(chunks[0].length, 4);
  const key = f.api.cacheKey(config, '流式'); f.apiConfig.fishApiKey = 'other-key';
  assert.notEqual(key, f.api.cacheKey(f.api.resolve(fish()), '流式'));
});

test('Fish 原文译文选择和长文本分段不丢字；未开启时保留完整文本', () => {
  const f = fixture(), chat = fish({ ttsSplitLongText: true }), text = '你好。'.repeat(1000);
  const parts = f.api.segments(text, chat, f.api.resolve(chat));
  assert.equal(parts.map(row => row.text).join(''), text); assert.ok(parts.every(row => Array.from(row.text).length <= 1000));
  chat.settings.ttsSplitLongText = false;
  assert.equal(f.api.segments(text, chat, f.api.resolve(chat)).length, 1);
});

test('Fish 余额与限流错误保留原因且不重试；浏览器跨域失败给出清晰说明', async () => {
  for (const status of [401, 402, 403, 422, 429]) {
    const f = fixture(() => new Response(JSON.stringify({ error: { message: 'fish reason' } }), { status })); f.apiConfig.fishApiKey = 'fish-key';
    await assert.rejects(f.api.generate(f.api.resolve(fish()), '失败'), /fish reason/); assert.equal(f.requests.length, 1); assert.equal(f.context.state.ttsCache.size, 0);
  }
  const f = fixture(() => { const error = new Error('Failed to fetch'); error.name = 'TypeError'; throw error; }); f.apiConfig.fishApiKey = 'fish-key';
  await assert.rejects(f.api.generate(f.api.resolve(fish()), '失败'), /跨域/);
});

test('旧角色默认 MiniMax；保留国内域名、GroupId、请求格式、Hex 解码和通话语言行为', async () => {
  const f = fixture(() => new Response(JSON.stringify({ base_resp: { status_code: 0 }, data: { audio: '49443301' } }), { headers: { 'Content-Type': 'application/json' } }));
  const config = f.api.resolve(mini());
  assert.equal(config.provider, 'minimax'); assert.equal(config.language, 'zh-CN');
  const blob = await f.api.generate(config, '你好');
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [73, 68, 51, 1]);
  assert.equal(f.requests[0].url, 'https://api.minimax.chat/v1/t2a_v2?GroupId=group');
  assert.equal(f.requests[0].options.headers.Authorization, 'Bearer mini-key');
  assert.equal(f.requests[0].body.language_boost, 'Chinese');
  assert.equal(f.requests[0].body.voice_setting.speed, 1);
  await f.api.generate(f.api.resolve(mini(), { context: 'call' }), '通话');
  assert.equal(Object.hasOwn(f.requests[1].body, 'language_boost'), false);
});

test('ElevenLabs 独立鉴权、音色 URL 编码、返回 MP3，默认不覆盖服务端声音参数', async () => {
  const f = fixture(); f.apiConfig.minimaxApiKey = ''; f.apiConfig.minimaxGroupId = '';
  const config = f.api.resolve(eleven());
  const blob = await f.api.generate(config, '你好');
  assert.equal(blob.type, 'audio/mpeg'); assert.equal(blob.size, 4);
  assert.match(f.requests[0].url, /voice%2Fwith%20space\?output_format=mp3_44100_128$/);
  assert.equal(f.requests[0].options.headers['xi-api-key'], 'eleven-key');
  assert.equal(f.requests[0].options.headers.Authorization, undefined);
  assert.equal(f.requests[0].body.model_id, 'eleven_multilingual_v2');
  assert.equal(Object.hasOwn(f.requests[0].body, 'voice_settings'), false);
  assert.equal(Object.hasOwn(f.requests[0].body, 'language_code'), false);
});

test('自定义地址保留路径与查询参数；角色模型覆盖通话模型，通话模型覆盖默认模型', () => {
  const f = fixture(); f.apiConfig.elevenlabsBaseUrl = 'https://proxy.example/tts/?route=eleven'; f.apiConfig.elevenlabsCallModel = 'eleven_flash_v2_5';
  assert.equal(f.api.endpoint(f.apiConfig.elevenlabsBaseUrl, '/v1/models'), 'https://proxy.example/tts/v1/models?route=eleven');
  assert.equal(f.api.resolve(eleven(), { context: 'call' }).model, 'eleven_flash_v2_5');
  assert.equal(f.api.resolve(eleven({ elevenlabsModel: 'role-model' }), { context: 'call' }).model, 'role-model');
  assert.throws(() => f.api.endpoint('file:///secret', '/v1/models'), /HTTP/);
});

test('缓存按账户、服务、模型、音色、语言和参数区分，Key 不出现在缓存标识中', async () => {
  const f = fixture(), original = f.api.resolve(eleven());
  const key = f.api.cacheKey(original, '你好');
  assert.equal(key.includes('eleven-key'), false);
  await f.api.generate(original, '你好'); await f.api.generate(original, '你好');
  assert.equal(f.requests.length, 1);
  for (const change of [{ model: 'other' }, { voiceId: 'other' }, { language: 'en-US' }, { speed: 1.1 }, { voiceSettings: { stability: 0.5 } }]) {
    assert.notEqual(f.api.cacheKey({ ...original, ...change }, '你好'), key);
  }
  f.apiConfig.elevenlabsApiKey = 'new-key'; assert.notEqual(f.api.cacheKey(f.api.resolve(eleven()), '你好'), key);
});

test('播放与下载共享一次请求；取消播放不会取消仍在等待的下载', async () => {
  let complete, underlying;
  const f = fixture((_url, options) => { underlying = options.signal; return new Promise(resolve => { complete = resolve; }); });
  const config = f.api.resolve(eleven()), controller = new AbortController();
  const playback = f.api.generate(config, '共享', controller.signal);
  const download = f.api.generate(config, '共享');
  const cancelled = assert.rejects(playback, { name: 'AbortError' });
  controller.abort(); await cancelled;
  assert.equal(underlying.aborted, false); assert.equal(f.requests.length, 1);
  complete(new Response(Uint8Array.of(1, 2), { headers: { 'Content-Type': 'audio/mpeg' } }));
  assert.equal((await download).size, 2);
});

test('最后一个消费者取消会中断网络；迟到音频不入缓存', async () => {
  let complete, underlying;
  const f = fixture((_url, options) => { underlying = options.signal; return new Promise(resolve => { complete = resolve; }); });
  const controller = new AbortController(), promise = f.api.generate(f.api.resolve(eleven()), '取消', controller.signal);
  const rejected = assert.rejects(promise, { name: 'AbortError' }); controller.abort(); await rejected;
  assert.equal(underlying.aborted, true);
  complete(new Response(Uint8Array.of(1), { headers: { 'Content-Type': 'audio/mpeg' } }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.context.state.ttsCache.size, 0);
});

test('自动识别不强制普通话；两家语速独立保存；Flash 使用语言代码', async () => {
  const f = fixture();
  assert.equal(f.api.resolve(mini({ ttsLanguage: '' })).language, '');
  const config = f.api.resolve(eleven({ ttsLanguage: 'en-US', elevenlabsModel: 'eleven_flash_v2_5', minimaxTtsSpeed: 2, elevenlabsTtsSpeed: 0.9 }));
  assert.equal(config.speed, 0.9);
  await f.api.generate(config, 'Hello'); assert.equal(f.requests[0].body.language_code, 'en');
  assert.equal(f.requests[0].body.voice_settings.speed, 0.9);
  assert.throws(() => f.api.validate({ ...config, speed: 2 }), /语速范围/);
  await assert.rejects(f.api.generate({ ...config, language: 'zh-HK' }, '粤语'), /粤语/);
});

test('双语按原文、译文拆分，空文本不请求；对话提取在统一层执行', () => {
  const f = fixture();
  f.context.languagePolicy = { getPolicy: () => ({ ttsReadMode: 'both', outputLanguage: 'en-US', translationLanguage: 'zh-Hans-CN' }),
    splitContent: () => ({ sourceText: 'Hello', translationText: '你好' }), getTtsText: text => text };
  const chat = eleven({ enableBilingualMode: true }), config = f.api.resolve(chat);
  const parts = f.api.segments('Hello〖你好〗', chat, config);
  assert.deepEqual(JSON.parse(JSON.stringify(parts)), [{ text: 'Hello', language: 'en-US' }, { text: '你好', language: 'zh-CN' }]);
  assert.equal(f.api.segments('', eleven(), config).length, 0);
  f.context.extractDialogueOnly = () => '只读对话';
  assert.equal(f.api.cleanText('旁白“只读对话”', { videoOptimization: { ttsDialogueOnly: true } }), '只读对话');
});

test('获取模型与音色使用独立 Key、no-store、分页与搜索，过滤非 TTS 模型', async () => {
  const f = fixture(url => new Response(JSON.stringify(url.includes('/v1/models') ? [
    { model_id: 'speech', can_do_text_to_speech: true }, { model_id: 'stt', can_do_text_to_speech: false }
  ] : { voices: [{ voice_id: 'voice', name: '测试' }], has_more: true, next_page_token: 'next' }), { headers: { 'Content-Type': 'application/json' } }));
  assert.equal((await f.api.listModels(f.apiConfig)).length, 1);
  const voices = await f.api.listVoices(f.apiConfig, '中文', 'next'); assert.equal(voices.voices[0].name, '测试');
  assert.equal(new URL(f.requests[1].url).searchParams.get('search'), '中文');
  assert.equal(new URL(f.requests[1].url).searchParams.get('next_page_token'), 'next');
  assert.equal(f.requests[1].options.cache, 'no-store');
});

test('长文本明确报超限；开启后不丢字，按模型实际能力切分', async () => {
  const f = fixture(() => new Response(JSON.stringify([{ model_id: 'eleven_multilingual_v2', can_do_text_to_speech: true, maximum_text_length_per_request: 6 }])));
  await f.api.listModels(f.apiConfig);
  const chat = eleven(), config = f.api.resolve(chat), text = '你好。今天很好。再见。';
  assert.throws(() => f.api.segments(text, chat, config), /6 字符/);
  const parts = f.api.segments(text, chat, { ...config, splitLongText: true });
  assert.equal(parts.map(item => item.text).join(''), text); assert.ok(parts.every(item => [...item.text].length <= 6));
});

test('流式音频增量回调与最终音频复用同一请求', async () => {
  const f = fixture(() => new Response(new ReadableStream({ start(controller) { controller.enqueue(Uint8Array.of(1, 2)); controller.enqueue(Uint8Array.of(3, 4)); controller.close(); } }), { headers: { 'Content-Type': 'audio/mpeg' } }));
  const received = [];
  const blob = await f.api.generate(f.api.resolve(eleven({ ttsStreaming: true })), '流式', undefined, value => received.push(...value));
  assert.deepEqual(received, [1, 2, 3, 4]); assert.equal(blob.size, 4); assert.match(f.requests[0].url, /\/stream\?/);
  assert.equal(f.requests.length, 1);
});

test('错误、非音频、空音频和 MiniMax 业务失败不会误记成功或自动重试', async () => {
  for (const response of [new Response(JSON.stringify({ detail: { message: 'invalid key' } }), { status: 401 }),
    new Response('{}', { headers: { 'Content-Type': 'application/json' } }), new Response(new Uint8Array())]) {
    const f = fixture(() => response);
    await assert.rejects(f.api.generate(f.api.resolve(eleven()), '失败')); assert.equal(f.requests.length, 1); assert.equal(f.context.state.ttsCache.size, 0);
  }
  const f = fixture(() => new Response(JSON.stringify({ base_resp: { status_code: 1, status_msg: 'quota' } })));
  await assert.rejects(f.api.generate(f.api.resolve(mini()), '失败'), /quota/);
});

test('缓存同时限制数量与总字节，不删除持久化聊天数据', () => {
  const f = fixture(); f.context.state.chats.a = { history: [{ content: '保留' }] };
  for (let index = 0; index < 17; index++) f.context.state.ttsCache.set(String(index), { blob: { size: 2 * 1024 * 1024 } });
  f.api.trimCache(); assert.equal(f.context.state.ttsCache.size, 12); assert.equal(f.context.state.chats.a.history[0].content, '保留');
});

test('保存和预设链路包含新增字段，原 MiniMax UI 和群聊保护保留', () => {
  const fields = ['ttsProvider', 'elevenlabsVoiceId', 'elevenlabsVoiceSettings', 'ttsStreaming', 'ttsSaveAudio', 'elevenlabsTtsSpeed'];
  for (const field of fields) {
    assert.ok(source('modules/chat-settings-presets.js').includes(field));
    assert.ok(source('src/js-bundles/event-bindings-b/memory-and-api-history.jsfrag').includes(field));
  }
  for (const id of ['minimax-group-id', 'minimax-api-key', 'minimax-model-select', 'minimax-domain-select']) assert.ok(source('src/html/api-settings-core.html').includes(`id="${id}"`));
  assert.match(source('modules/chat/message-element.js'), /!chat\.isGroup && chat\.settings\.enableTts !== false/);
  assert.match(source('src/js-bundles/event-bindings-a/console-and-worldbook-editor.jsfrag'), /if \(chat\.isGroup\)/);
  assert.ok(source('modules/settings/api-presets.js').includes('...window.ttsProvider.apiFields'));
  assert.ok(source('modules/floating-ball.js').includes('...window.ttsProvider.apiFields'));
  assert.ok(source('sw.js').includes("headers.has('xi-api-key')"));
});
