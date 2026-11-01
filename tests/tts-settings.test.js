const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = name => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
function fixture() {
  const nodes = new Map(), writes = [];
  const element = () => ({ value: '', type: 'text', checked: false, hidden: false, disabled: false,
    dataset: {}, textContent: '', children: [], listeners: {},
    classList: { contains: () => true }, addEventListener(type, fn) { this.listeners[type] = fn; },
    replaceChildren() { this.children = []; }, appendChild(node) { this.children.push(node); },
    removeAttribute() {}, pause() {}, async emit(type) { await this.listeners[type]?.({ target: this }); } });
  const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const c = { state: { apiConfig: { elevenlabsApiKey: 'key' }, ttsCache: new Map() },
    document: { getElementById: get, createElement: element, addEventListener() {} }, localStorage: { getItem: () => null },
    db: { apiConfig: { async put(value) { writes.push(value); } }, chats: { async put(value) { writes.push(value); } } },
    console, Map, Set, URL, Blob, DOMException, AbortController, setTimeout, clearTimeout, FormData, URLSearchParams,
    showCustomPrompt: async () => '声音预设', showCustomConfirm: async () => true, addEventListener() {} };
  c.window = c; vm.createContext(c);
  vm.runInContext(source('modules/fish-tts-provider.js'), c); vm.runInContext(source('modules/tts-provider.js'), c); vm.runInContext(source('modules/fish-tts-settings.js'), c); vm.runInContext(source('modules/tts-settings.js'), c);
  return { c, get, writes };
}
test('角色切换服务保留两家的音色与语速，保存后重新打开完整回显', async () => {
  const f = fixture(), chat = { id: 'a', settings: { minimaxVoiceId: 'mini-original', minimaxTtsSpeed: 1.7, elevenlabsVoiceId: 'eleven-original', elevenlabsTtsSpeed: 0.9 }, history: [] };
  f.c.ttsSettings.loadChat(chat);
  assert.equal(f.get('tts-provider-select').value, 'minimax'); assert.equal(f.get('ai-voice-id-input').value, 'mini-original');
  f.get('ai-voice-id-input').value = 'mini-new'; f.get('tts-provider-select').value = 'elevenlabs'; await f.get('tts-provider-select').emit('change');
  assert.equal(f.get('ai-voice-id-input').value, 'eleven-original'); assert.equal(f.get('ai-voice-speed-input').value, 0.9);
  f.get('ai-voice-id-input').value = 'eleven-new'; f.get('elevenlabs-stability').value = '0.35';
  f.c.ttsSettings.saveChat(chat);
  assert.equal(chat.settings.minimaxVoiceId, 'mini-new'); assert.equal(chat.settings.elevenlabsVoiceId, 'eleven-new');
  assert.equal(chat.settings.minimaxTtsSpeed, 1.7); assert.equal(chat.settings.elevenlabsTtsSpeed, 0.9);
  assert.equal(chat.settings.elevenlabsVoiceSettings.stability, 0.35);
  f.c.ttsSettings.loadChat(chat); assert.equal(f.get('ai-voice-id-input').value, 'eleven-new');
});
test('退出未保存不会修改角色；群聊新增语音选项隐藏，旧参数不被清空', async () => {
  const f = fixture(), chat = { id: 'a', settings: { minimaxVoiceId: 'keep' }, history: [] };
  f.c.ttsSettings.loadChat(chat); f.get('ai-voice-id-input').value = 'unsaved';
  assert.equal(chat.settings.minimaxVoiceId, 'keep');
  const group = { id: 'g', isGroup: true, settings: { minimaxVoiceId: 'group-keep' }, history: [] };
  f.c.ttsSettings.loadChat(group); assert.equal(f.get('tts-provider-group').hidden, true); assert.equal(f.get('tts-common-options').hidden, true);
  f.c.ttsSettings.saveChat(group); assert.equal(group.settings.minimaxVoiceId, 'group-keep');
});
test('连接未配置也能保存角色；无效声音参数明确拦截；API Key 通过原保存入口读取', () => {
  const f = fixture(), chat = { id: 'a', settings: { ttsProvider: 'elevenlabs' }, history: [] };
  f.c.ttsSettings.loadChat(chat); assert.doesNotThrow(() => f.c.ttsSettings.validateChat());
  f.get('elevenlabs-stability').value = '2'; assert.throws(() => f.c.ttsSettings.validateChat(), /0～1/);
  f.get('elevenlabs-api-key').value = 'saved-key'; f.get('elevenlabs-model-input').value = 'custom';
  assert.equal(f.c.ttsSettings.readApi().elevenlabsApiKey, 'saved-key'); assert.equal(f.c.ttsSettings.readApi().elevenlabsModel, 'custom');
});
test('音色收藏与参数预设只保存配置，不把 Key 放到角色参数中', async () => {
  const f = fixture(), chat = { id: 'a', settings: { ttsProvider: 'elevenlabs', elevenlabsVoiceId: 'voice' }, history: [] };
  f.c.ttsSettings.loadChat(chat); await f.get('elevenlabs-favorite-add').emit('click');
  assert.equal(f.c.state.apiConfig.elevenlabsVoiceLibrary[0].id, 'voice');
  f.get('elevenlabs-stability').value = '0.4'; await f.get('elevenlabs-preset-save').emit('click');
  f.get('elevenlabs-stability').value = ''; f.get('elevenlabs-sound-preset').value = '0'; await f.get('elevenlabs-preset-apply').emit('click');
  assert.equal(f.get('elevenlabs-stability').value, 0.4);
  assert.equal(JSON.stringify(chat.settings).includes('key'), false);
});
test('保存音频的清理入口保留聊天正文和真实录音；保存失败回滚音频', async () => {
  const f = fixture(), message = { content: '保留', audioData: '真实录音', ttsSavedAudio: [{ data: 'data:audio/mpeg;base64,AA==' }] };
  const chat = { id: 'a', settings: {}, history: [message] };
  f.c.ttsSettings.loadChat(chat); f.c.db.chats.put = async () => { throw new Error('quota'); };
  await f.get('tts-clear-saved-audio').emit('click'); assert.equal(message.ttsSavedAudio.length, 1);
  f.c.db.chats.put = async () => {}; await f.get('tts-clear-saved-audio').emit('click');
  assert.equal(message.ttsSavedAudio, undefined); assert.equal(message.content, '保留'); assert.equal(message.audioData, '真实录音');
});

test('Fish 与另外两家切换后保留音色、模型、独立语速和高级参数，保存与重开一致', async () => {
  const f = fixture(), chat = { id: 'fish', history: [], settings: { ttsProvider: 'fish', fishVoiceId: 'original', fishModel: 's2.1-pro-free', fishTtsSpeed: 1.4,
    fishVoiceSettings: { temperature: 0.5, prosody: { volume: 2, normalize_loudness: true }, chunk_length: 250 }, minimaxVoiceId: 'mini' } };
  f.c.ttsSettings.loadChat(chat); assert.equal(f.get('fish-role-options').hidden, false);
  assert.equal(f.get('ai-voice-id-input').value, 'original'); assert.equal(f.get('ai-voice-speed-input').value, 1.4);
  f.get('ai-voice-id-input').value = 'https://fish.audio/m/changed/'; f.get('fish-temperature').value = '0.3';
  f.get('tts-provider-select').value = 'minimax'; await f.get('tts-provider-select').emit('change');
  assert.equal(f.get('ai-voice-id-input').value, 'mini'); assert.equal(f.get('fish-role-options').hidden, true);
  f.get('tts-provider-select').value = 'fish'; await f.get('tts-provider-select').emit('change');
  assert.equal(f.get('ai-voice-id-input').value, 'changed');
  f.c.ttsSettings.validateChat(); f.c.ttsSettings.saveChat(chat);
  assert.equal(chat.settings.fishVoiceSettings.temperature, 0.3); assert.equal(chat.settings.fishVoiceSettings.prosody.normalize_loudness, true);
  assert.equal(chat.settings.fishVoiceSettings.chunk_length, 250); assert.equal(chat.settings.fishTtsSpeed, 1.4);
  f.c.ttsSettings.loadChat(chat); assert.equal(f.get('fish-temperature').value, 0.3);
  assert.equal(chat.settings.minimaxVoiceId, 'mini'); assert.equal(JSON.stringify(chat.settings).includes('apiKey'), false);
});

test('Fish 高级参数无效可纠正，切换服务时不丢失输入；收藏和预设保存失败不污染状态', async () => {
  const f = fixture(), chat = { id: 'a', settings: { ttsProvider: 'fish', fishVoiceId: 'voice' }, history: [] };
  f.c.ttsSettings.loadChat(chat); f.get('fish-advanced-json').value = '{bad';
  assert.throws(() => f.c.ttsSettings.validateChat(), /JSON/);
  f.get('tts-provider-select').value = 'elevenlabs'; await f.get('tts-provider-select').emit('change');
  assert.equal(f.get('tts-provider-select').value, 'fish'); assert.match(f.get('tts-role-status').textContent, /JSON/);
  f.get('fish-advanced-json').value = '{}'; f.get('fish-temperature').value = '0.4';
  await f.get('fish-favorite-add').emit('click'); assert.equal(f.c.state.apiConfig.fishVoiceLibrary[0].id, 'voice');
  await f.get('fish-preset-save').emit('click'); assert.equal(f.c.state.apiConfig.fishSoundPresets[0].settings.temperature, 0.4);
  const before = f.c.state.apiConfig; f.c.db.apiConfig.put = async () => { throw new Error('quota'); };
  f.get('ai-voice-id-input').value = 'other'; await f.get('fish-favorite-add').emit('click'); assert.equal(f.c.state.apiConfig, before);
  f.get('fish-temperature').value = ''; f.get('fish-sound-preset').value = '0'; await f.get('fish-preset-apply').emit('click'); assert.equal(f.get('fish-temperature').value, 0.4);
});

test('Fish API 独立配置读取、清空 Key、角色群聊保护', async () => {
  const f = fixture(); f.c.ttsSettings.loadApi();
  f.get('fish-api-key').value = 'fish-only'; f.get('fish-base-url').value = 'https://api.fish.audio/compat/v1';
  f.get('fish-model-input').value = 's2.1-pro-free'; f.get('fish-call-model').value = 's2-pro';
  const api = f.c.ttsSettings.readApi(); assert.equal(api.fishApiKey, 'fish-only'); assert.equal(api.fishModel, 's2.1-pro-free');
  assert.equal(api.elevenlabsApiKey, 'key'); assert.equal(api.fishCallModel, 's2-pro');
  await f.get('fish-key-clear').emit('click'); assert.equal(f.c.ttsSettings.readApi().fishApiKey, '');
  const group = { id: 'g', isGroup: true, settings: { ttsProvider: 'fish', fishVoiceId: 'keep' }, history: [] };
  f.c.ttsSettings.loadChat(group); assert.equal(f.get('fish-role-options').hidden, true); f.c.ttsSettings.saveChat(group); assert.equal(group.settings.fishVoiceId, 'keep');
});

test('切换角色后，迟到的 Fish 音色详情不会改写另一个角色的编辑区', async () => {
  const f = fixture(); let complete;
  f.c.fishTts.getVoice = () => new Promise(resolve => { complete = resolve; });
  f.c.ttsSettings.loadChat({ id: 'old', settings: { ttsProvider: 'fish', fishVoiceId: 'old-voice' }, history: [] });
  const pending = f.get('fish-voice-detail').emit('click');
  f.c.ttsSettings.loadChat({ id: 'new', settings: { ttsProvider: 'fish', fishVoiceId: 'new-voice' }, history: [] });
  complete({ title: '旧角色音色详情', description: '不应显示' }); await pending;
  assert.equal(f.get('ai-voice-id-input').value, 'new-voice'); assert.equal(f.get('fish-voice-description').textContent, '');
});

test('创建 Fish 音色期间切换角色，云端结果不会替换新角色的音色', async () => {
  const f = fixture(); let complete, notifyStarted;
  const started = new Promise(resolve => { notifyStarted = resolve; });
  f.c.fishTts.createVoice = () => new Promise(resolve => { complete = resolve; notifyStarted(); });
  f.c.ttsSettings.loadChat({ id: 'old', settings: { ttsProvider: 'fish' }, history: [] });
  f.get('fish-own-title').value = '新私有音色'; f.get('fish-own-files').files = [{ size: 1 }];
  const pending = f.get('fish-own-create').emit('click'); await started;
  assert.equal(typeof complete, 'function', f.get('tts-role-status').textContent);
  f.c.ttsSettings.loadChat({ id: 'new', settings: { ttsProvider: 'fish', fishVoiceId: 'keep' }, history: [] });
  complete({ _id: 'created-for-old-role' }); await pending;
  assert.equal(f.get('ai-voice-id-input').value, 'keep');
});

test('Fish 试听结束后可以复播已有音频，停止后释放，不重复提交合成', async () => {
  const f = fixture(); f.c.state.apiConfig.fishApiKey = 'test-only'; let generates = 0, plays = 0;
  f.c.ttsProvider.generate = async () => { generates++; return new Blob([Uint8Array.of(1)], { type: 'audio/mpeg' }); };
  f.c.ttsSettings.loadChat({ id: 'preview', settings: { ttsProvider: 'fish' }, history: [] });
  f.get('tts-preview-text').value = '你好'; f.get('tts-preview-player').play = async () => { plays++; };
  await f.c.ttsSettings.previewVoice(); f.get('tts-preview-player').onended(); await f.c.ttsSettings.playPreview();
  assert.equal(generates, 1); assert.equal(plays, 2);
  f.c.ttsSettings.stopPreview(); await assert.rejects(f.c.ttsSettings.playPreview(), /请先生成/);
});

test('Fish 中转格式、完整地址和管理地址通过 API 保存并重新载入', async () => {
  const f = fixture(); f.c.ttsSettings.loadApi();
  f.get('fish-protocol').value = 'native'; await f.get('fish-protocol').emit('change');
  assert.equal(f.get('fish-relay-options').hidden, false);
  f.get('fish-base-url').value = 'https://relay.example/v1'; f.get('fish-model-input').value = 'relay-model';
  f.get('fish-speech-url').value = 'https://relay.example/speak?route=fish';
  f.get('fish-management-base-url').value = 'https://relay.example/native';
  Object.assign(f.c.state.apiConfig, f.c.ttsSettings.readApi()); f.c.ttsSettings.loadApi();
  assert.equal(f.get('fish-protocol').value, 'native'); assert.equal(f.get('fish-model-input').value, 'relay-model');
  assert.equal(f.get('fish-speech-url').value, 'https://relay.example/speak?route=fish');
  assert.equal(f.get('fish-management-base-url').value, 'https://relay.example/native');
  f.get('fish-protocol').value = 'fish'; await f.get('fish-protocol').emit('change');
  assert.equal(f.get('fish-relay-options').hidden, true); assert.equal(f.get('fish-speech-url').value, 'https://relay.example/speak?route=fish');
});
