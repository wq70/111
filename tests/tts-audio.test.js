const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const turn = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const requests = [], toasts = [], alerts = [];
  const player = { dataset: {}, paused: true, src: '', async play() { this.paused = false; }, pause() { this.paused = true; }, removeAttribute() {}, load() {} };
  const c = { state: { activeChatId: 'a', chats: { a: { id: 'a', settings: { ttsProvider: 'elevenlabs', elevenlabsVoiceId: 'a-voice' } } },
    apiConfig: { elevenlabsApiKey: 'key', minimaxApiKey: 'mini-key', minimaxGroupId: 'group', fishApiKey: 'fish-test-only' }, ttsCache: new Map() },
    localStorage: { getItem: () => null }, document: { getElementById: () => player, querySelectorAll: () => [], addEventListener() {} },
    Map, Set, URL, Blob, DOMException, AbortController, Uint8Array, console: { error() {} }, setTimeout, clearTimeout, FormData, URLSearchParams,
    fetch: async (url, options) => {
      requests.push(JSON.parse(options.body));
      if (url.includes('/t2a_v2')) return new Response(JSON.stringify({ base_resp: { status_code: 0 }, data: { audio: '49443301' } }));
      return new Response(Uint8Array.of(1, 2), { headers: { 'Content-Type': 'audio/mpeg' } });
    },
    showCustomAlert: (title, text) => alerts.push({ title, text }),
    showToast: text => { const toast = { text, addEventListener: (_event, fn) => { toast.click = fn; } }; toasts.push(toast); return toast; }, addEventListener() {} };
  c.window = c; vm.createContext(c);
  vm.runInContext(source('modules/chat/language-policy.js'), c);
  vm.runInContext(source('modules/fish-tts-provider.js'), c); vm.runInContext(source('modules/tts-provider.js'), c); vm.runInContext(source('modules/tts-audio.js'), c);
  return { c, player, requests, toasts, alerts };
}
test('通话队列保持顺序和原角色配置；切换当前聊天不会串音色，删除只取消对应消息', async () => {
  const f = fixture();
  f.c.playVideoCallPureTTS('保留一', '', 'a', 1);
  f.c.playVideoCallPureTTS('删除二', '', 'a', 2);
  f.c.playVideoCallPureTTS('保留三', '', 'a', 3);
  await turn();
  f.c.state.activeChatId = 'b'; f.c.state.chats.a.settings.elevenlabsVoiceId = 'changed';
  f.c.cancelCallMessageTts('a', 2); f.player.onended(); await turn();
  assert.deepEqual(f.requests.map(r => r.input ?? r.text), ['保留一', '保留三']);
  assert.equal(f.player.dataset.currentText, '保留三');
  f.c.stopTtsQueue(); assert.equal(f.player.paused, true); assert.equal(f.player.onended, null);
});
test('ElevenLabs 音频解码失败停止队列，并可查看经过转义的完整原因；不自动多次付费请求', async () => {
  const f = fixture(); f.c.playVideoCallPureTTS('失败一', '', 'a', 1); f.c.playVideoCallPureTTS('不应提交二', '', 'a', 2);
  await turn(); f.player.onerror(); await turn();
  assert.equal(f.requests.length, 1); assert.match(f.toasts[0].text, /点击查看原因/);
  f.toasts[0].click(); assert.match(f.alerts[0].text, /浏览器无法播放/);
  assert.equal(f.player.paused, true);
});

test('Fish 通话使用入队时的音色和参数；播放失败停止队列，不重复合成', async () => {
  const f = fixture(), chat = f.c.state.chats.a;
  chat.settings = { ttsProvider: 'fish', fishVoiceId: 'original', fishVoiceSettings: { temperature: 0.4 } };
  f.c.playVideoCallPureTTS('Fish 一', '', 'a', 1); f.c.playVideoCallPureTTS('Fish 二', '', 'a', 2);
  chat.settings.fishVoiceId = 'changed'; chat.settings.fishVoiceSettings.temperature = 0.9;
  await turn(); assert.equal(f.requests[0].voice, 'original');
  f.player.onended(); await turn(); assert.equal(f.requests[1].voice, 'original'); assert.equal(f.requests[1].provider.options['fish-audio'].temperature, 0.4);
  f.player.onerror(); await turn(); assert.equal(f.requests.length, 2); assert.equal(f.player.paused, true); assert.match(f.toasts[0].text, /停止/);
});
test('保存设置模板时保留旧角色语速和默认语言，以及各服务独立语速', () => {
  const f = fixture(); vm.runInContext(source('modules/chat-settings-presets.js'), f.c);
  f.c.state.chats.a.settings = { minimaxVoiceId: 'old', ttsSpeed: 1.6 };
  let preset = f.c.getCurrentChatSettings(); assert.equal(preset.minimaxTtsSpeed, 1.6); assert.equal(preset.ttsLanguage, 'zh-CN');
  f.c.state.chats.a.settings = { ttsProvider: 'elevenlabs', elevenlabsVoiceId: 'voice', ttsSpeed: 0.8, minimaxTtsSpeed: 1.7 };
  preset = f.c.getCurrentChatSettings(); assert.equal(preset.elevenlabsTtsSpeed, 0.8); assert.equal(preset.minimaxTtsSpeed, 1.7);
});

for (const provider of ['minimax', 'elevenlabs', 'fish']) {
  for (const mode of ['source', 'translation', 'both']) {
    for (const input of ['Hello〖你好〗', 'Hello【你好】', 'Hello\n〖你\n好〗']) {
      test(`${provider} 通话按 ${mode} 朗读，保留完整内容：${JSON.stringify(input)}`, async () => {
        const f = fixture(), chat = f.c.state.chats.a;
        chat.settings = { ttsProvider: provider, minimaxVoiceId: 'mini-voice', elevenlabsVoiceId: 'a-voice',
          enableBilingualMode: true, languagePolicy: { ttsReadMode: mode, outputLanguage: 'en-US' } };
        chat.history = [{ role: 'assistant', content: input, timestamp: 1 }];
        f.c.playVideoCallPureTTS(input, '', 'a', 1);
        await turn();
        if (mode === 'both') { f.player.onended(); await turn(); }
        const translation = input.includes('\n好') ? '你\n好' : '你好';
        const expected = mode === 'both' ? ['Hello', translation] : [mode === 'source' ? 'Hello' : translation];
        assert.deepEqual(f.requests.map(r => r.input ?? r.text), expected);
        assert.equal(chat.history[0].content, input);
        f.c.stopTtsQueue();
      });
    }
  }
}

test('MiniMax 通话多段译文按设置提取，动作清理发生在译文选取之后', async () => {
  const f = fixture(), chat = f.c.state.chats.a;
  chat.settings = { minimaxVoiceId: 'mini-voice', enableBilingualMode: true, languagePolicy: { ttsReadMode: 'translation' } };
  f.c.playVideoCallPureTTS('(laughs) Hello【（笑）你好】 Goodbye〖再见〗', '', 'a', 1);
  await turn();
  assert.deepEqual(f.requests.map(r => r.input ?? r.text), ['你好 再见']);
  f.c.stopTtsQueue();
});

test('通话队列只保留朗读配置，不保留整份聊天历史和记忆', async () => {
  for (const provider of ['minimax', 'elevenlabs', 'fish']) {
    const f = fixture();
    const chat = f.c.state.chats.a;
    chat.history = [{ content: '图片和长聊天历史' }];
    chat.longTermMemory = [{ content: '长期记忆' }];
    chat.settings = { ttsProvider: provider, minimaxVoiceId: 'mini-voice', elevenlabsVoiceId: 'a-voice', enableBilingualMode: true, languagePolicy: { ttsReadMode: 'translation' } };
    const contexts = [];
    const segments = f.c.ttsProvider.segments;
    f.c.ttsProvider.segments = (text, snapshot, config) => {
      contexts.push(snapshot);
      return segments(text, snapshot, config);
    };
    f.c.playVideoCallPureTTS('Hello〖你好〗', '', 'a', 1);
    f.c.playVideoCallPureTTS('Goodbye〖再见〗', '', 'a', 2);
    chat.settings.languagePolicy.ttsReadMode = 'source';
    await turn(); f.player.onended(); await turn();
    assert.deepEqual(f.requests.map(request => request.input ?? request.text), ['你好', '再见']);
    assert.equal(contexts.length, 2);
    for (const snapshot of contexts) {
      assert.equal(Object.hasOwn(snapshot, 'history'), false);
      assert.equal(Object.hasOwn(snapshot, 'longTermMemory'), false);
    }
    assert.equal(chat.history.length, 1); assert.equal(chat.longTermMemory.length, 1);
    f.c.stopTtsQueue();
  }
});

test('MiniMax 未开启双语的旧通话也过滤标准和跨行翻译括号，保留原动作过滤', async () => {
  const f = fixture();
  f.c.state.chats.a.settings = { minimaxVoiceId: 'mini-voice' };
  f.c.playVideoCallPureTTS('[laughs](quietly)（笑）Hello〖你\n好〗 Goodbye【再\n见】', '', 'a', 1);
  await turn();
  assert.deepEqual(f.requests.map(r => r.input ?? r.text), ['Hello Goodbye']);
  f.c.stopTtsQueue();
});

test('通话只读原文时纯译文不请求；只读译文但缺译文时回退原文', async () => {
  for (const provider of ['minimax', 'elevenlabs', 'fish']) {
    const f = fixture(), chat = f.c.state.chats.a;
    chat.settings = { ttsProvider: provider, minimaxVoiceId: 'mini-voice', elevenlabsVoiceId: 'a-voice',
      enableBilingualMode: true, languagePolicy: { ttsReadMode: 'source' } };
    f.c.playVideoCallPureTTS('〖你好〗', '', 'a', 1);
    await turn(); assert.equal(f.requests.length, 0);
    chat.settings.languagePolicy.ttsReadMode = 'translation';
    f.c.playVideoCallPureTTS('Hello', '', 'a', 2);
    await turn(); assert.deepEqual(f.requests.map(r => r.input ?? r.text), ['Hello']);
    f.c.stopTtsQueue();
  }
});

test('MiniMax 通话朗读方式随入队设置保存；切换聊天或修改设置不改变待播文本', async () => {
  const f = fixture(), chat = f.c.state.chats.a;
  chat.settings = { minimaxVoiceId: 'mini-voice', enableBilingualMode: true, languagePolicy: { ttsReadMode: 'source' } };
  f.c.playVideoCallPureTTS('First〖第一句〗', '', 'a', 1);
  f.c.playVideoCallPureTTS('Second【第二句】', '', 'a', 2);
  await turn();
  chat.settings.languagePolicy.ttsReadMode = 'translation';
  f.c.state.activeChatId = 'b';
  f.player.onended(); await turn();
  assert.deepEqual(f.requests.map(r => r.input ?? r.text), ['First', 'Second']);
  f.c.stopTtsQueue();
});

test('MiniMax 聊天语音保留已选取的朗读文本，不重复解析双语', () => {
  const f = fixture(), chat = f.c.state.chats.a;
  chat.settings = { minimaxVoiceId: 'mini-voice', enableBilingualMode: true, languagePolicy: { ttsReadMode: 'both' } };
  const body = { dataset: { text: encodeURIComponent('Hello。你好'), originalContent: encodeURIComponent('Hello〖你好〗') } };
  const request = f.c.messageTtsRequest(body, chat);
  assert.deepEqual(Array.from(request.parts, p => p.text), ['Hello。你好']);
});

test('通话仅读取对话在原文和译文分离后执行，不提前吞掉另一种语言', async () => {
  for (const provider of ['minimax', 'elevenlabs', 'fish']) {
    const f = fixture(), chat = f.c.state.chats.a;
    f.c.document.addEventListener = () => {};
    f.c.console.log = () => {};
    vm.runInContext(source('modules/video-optimization.js'), f.c);
    chat.settings = { ttsProvider: provider, minimaxVoiceId: 'mini-voice', elevenlabsVoiceId: 'a-voice',
      enableBilingualMode: true, languagePolicy: { ttsReadMode: 'both' } };
    chat.videoOptimization = { ttsDialogueOnly: true };
    f.c.playVideoCallPureTTS('He smiles. "Hello"〖他笑了。“你好”〗', '', 'a', 1);
    await turn(); f.player.onended(); await turn();
    assert.deepEqual(f.requests.map(r => r.input ?? r.text), ['Hello', '你好']);
    f.c.stopTtsQueue();
  }
});

test('MiniMax 通话默认只读原文；语言组件缺失时仍过滤译文', async () => {
  for (const available of [true, false]) {
    const f = fixture();
    f.c.state.chats.a.settings = { minimaxVoiceId: 'mini-voice', enableBilingualMode: true };
    if (!available) delete f.c.languagePolicy;
    f.c.playVideoCallPureTTS('Hello〖你好〗', '', 'a', 1);
    await turn();
    assert.deepEqual(f.requests.map(r => r.input ?? r.text), ['Hello']);
    f.c.stopTtsQueue();
  }
});
