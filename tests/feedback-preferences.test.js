const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function storyFixture(storyMode = 'serial', mode = 'continue') {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: id === 'gr-writing-mode' ? mode : '', textContent: '', classList: { add() {}, remove() {} } });
    return elements.get(id);
  };
  const rows = new Map();
  let nextId = 10;
  const c = vm.createContext({ console, JSON, Math, Date, AbortController, Map, Set,
    window: {}, state: { chats: { char: { name: '人设角色', settings: { aiPersona: '基础人设', myPersona: '用户人设' }, history: [{ role: 'assistant', content: '聊天语气标记' }] } }, apiConfig: { proxyUrl: 'https://api.invalid', model: 'mock' }, globalSettings: {} },
    db: { grStories: { get: async id => clone(rows.get(id)), put: async row => { rows.set(row.id, clone(row)); }, add: async row => { const id = nextId++; rows.set(id, { ...clone(row), id }); return id; } }, grAuthors: { get: async () => ({ name: '作者', style: '自然' }) }, worldBooks: { get: async () => null }, personaPresets: { get: async () => null } },
    document: { getElementById: element }, grState: { activeStoryId: 1, isGenerating: false }, updateGenButtonBinding() {},
    openReader: async id => { c.grState.activeStoryId = id; }, showCustomAlert: async () => {}, alert: text => { c.error = text; },
    fetch: async (url, init) => { c.request = JSON.parse(init.body); return { ok: true, json: async () => ({ content: JSON.stringify({ title: '新短篇标题', content: '独立故事正文。'.repeat(40), summary: '新摘要', globalSummary: '新全局摘要', storyDelta: {} }) }) }; },
    getGeminiResponseText: data => data.content
  });
  vm.runInContext(read('modules/social/green-river/story-engine.js'), c);
  c.GreenRiverStoryEngine = c.window.GreenRiverStoryEngine;
  vm.runInContext(read('modules/social/green-river/story-generation.js'), c);
  const story = { id: 1, title: '原书', authorId: 1, settings: { storyMode, charIds: ['char'], useChatReferences: false },
    storyBible: { synopsis: '本次作品前提', globalSummary: '累计摘要秘密', timeline: [{ text: '时间线秘密', chapterId: 'old' }], openThreads: [{ text: '伏笔秘密', chapterId: 'old' }] },
    chapters: [{ id: 'old', title: '旧章', content: '更早章节秘密', summary: '更早摘要秘密' }, { id: 'last', title: '末章', content: '当前短篇正文', summary: '当前短篇摘要' }] };
  c.GreenRiverStoryEngine.normalizeStory(story); rows.set(1, clone(story));
  return { c, rows, story: clone(story), engine: c.GreenRiverStoryEngine };
}

test('独立短篇请求隔离正文、摘要、时间线与伏笔，保留主动设定', async () => {
  for (const mode of ['anthology', 'standalone']) {
    const { c } = storyFixture(mode);
    await c.handleGenerateStoryContent();
    const prompt = c.request.messages[0].content;
    assert.match(prompt, /本次作品前提|独立短篇/);
    assert.doesNotMatch(prompt, /更早章节秘密|更早摘要秘密|当前短篇正文|当前短篇摘要|累计摘要秘密|时间线秘密|伏笔秘密|聊天语气标记/);
  }
});
test('关闭聊天参考时不读取聊天历史；开启后读取语气参考', async () => {
  const { c, engine, story } = storyFixture('anthology');
  Object.defineProperty(c.state.chats.char, 'history', { get() { throw new Error('不应读取聊天'); }, configurable: true });
  assert.match(await c.buildGreenRiverCharacterContext(engine.prepareGenerationStory(story, 'continue', false), 20), /基础人设/);
  Object.defineProperty(c.state.chats.char, 'history', { value: [{ role: 'assistant', content: '聊天语气标记' }], configurable: true });
  story.settings.useChatReferences = true;
  assert.match(await c.buildGreenRiverCharacterContext(story, 20), /聊天语气标记/);
});
test('延长短篇只读取当前一篇，连载仍读取前情，重写不泄漏被替换章节摘要', async () => {
  const isolated = storyFixture('anthology', 'extend');
  await isolated.c.handleGenerateStoryContent();
  const prompt = isolated.c.request.messages[0].content;
  assert.match(prompt, /当前短篇正文/);
  assert.doesNotMatch(prompt, /更早章节秘密|更早摘要秘密|累计摘要秘密|时间线秘密|伏笔秘密/);
  assert.equal(isolated.rows.get(1).chapters.length, 2);
  const serial = storyFixture(); await serial.c.handleGenerateStoryContent();
  assert.match(serial.c.request.messages[0].content, /当前短篇正文|更早摘要秘密/);
  const reroll = storyFixture(); await reroll.c.handleGenerateStoryContent(true);
  assert.doesNotMatch(reroll.c.request.messages[0].content, /当前短篇正文|当前短篇摘要/);
});
test('单独成书不覆盖原作，同书模式追加一篇；API失败保持原作', async () => {
  const standalone = storyFixture('standalone'); await standalone.c.handleGenerateStoryContent();
  assert.deepEqual(standalone.rows.get(1), standalone.story);
  assert.equal(standalone.rows.size, 2);
  assert.equal(standalone.rows.get(10).chapters.length, 1);
  assert.equal(standalone.rows.get(10).title, '新短篇标题');
  assert.equal(standalone.c.grState.activeStoryId, 10);
  const anthology = storyFixture('anthology'); await anthology.c.handleGenerateStoryContent();
  assert.equal(anthology.rows.size, 1); assert.equal(anthology.rows.get(1).chapters.length, 3);
  const failed = storyFixture('standalone'); failed.c.fetch = async () => { throw new Error('请求失败'); };
  await failed.c.handleGenerateStoryContent();
  assert.deepEqual(failed.rows.get(1), failed.story); assert.equal(failed.rows.size, 1);
});
test('短篇重写保留修订，原有独立篇目不变', async () => {
  const { c, rows, story } = storyFixture('standalone'); await c.handleGenerateStoryContent(true);
  assert.equal(rows.size, 1); assert.deepEqual(rows.get(1).chapters[0], story.chapters[0]);
  assert.equal(rows.get(1).chapters[1].revisions.at(-1).content, '当前短篇正文');
});

function templateFixture() {
  const presets = new Map([[1, { id: 1, name: '偏好', settings: { enableNarratorMode: true, enableBilingualMode: true, languagePolicy: { outputMode: 'forced', outputLanguage: 'ja-JP' }, enableThoughts: false, linkedChatIds: ['private'], aiPersona: '恶意人设覆盖', myAvatar: '恶意头像覆盖' } }]]);
  const stored = new Map();
  const c = vm.createContext({ console, JSON, Object, Set, Map, Date, window: {}, document: { addEventListener() {}, getElementById: () => null },
    state: { activeChatId: 'a', globalSettings: { id: 'global' }, chats: {
      a: { id: 'a', name: '甲', settings: { aiPersona: '甲的人设', myAvatar: '甲头像', enableThoughts: false, enableNarratorMode: true, enableBilingualMode: true }, history: [{ content: '原聊天' }] },
      b: { id: 'b', name: '乙', isGroup: true, settings: { aiPersona: '群设定', theme: 'custom' }, history: [] }
    } },
    db: { chats: { put: async row => { stored.set(row.id, clone(row)); } },
      chatSettingsPresets: { get: async id => clone(presets.get(id)), put: async row => { presets.set(row.id || 2, clone(row)); return row.id || 2; }, where: () => ({ equals: () => ({ first: async () => null }) }) },
      globalSettings: { put: async row => { c.savedGlobal = clone(row); } }, transaction: async (mode, table, fn) => fn() }
  });
  vm.runInContext(read('modules/chat-settings-presets.js'), c);
  return { c, api: c.window, stored };
}
test('模板保存旁白/双语与显式关闭状态；只允许功能字段，不覆盖身份', async () => {
  const { c, api } = templateFixture();
  const settings = api.getCurrentChatSettings();
  assert.equal(settings.enableNarratorMode, true); assert.equal(settings.enableBilingualMode, true); assert.equal(settings.enableThoughts, false);
  const before = clone(c.state.chats.a);
  await api.ChatSettingsTemplates.applyPresetToChats(1, ['a', 'b', 'a']);
  assert.equal(c.state.chats.a.settings.aiPersona, before.settings.aiPersona);
  assert.equal(c.state.chats.a.settings.myAvatar, before.settings.myAvatar);
  assert.deepEqual(c.state.chats.a.history, before.history);
  assert.equal(c.state.chats.b.settings.theme, 'custom');
  c.state.chats.a.settings.languagePolicy.outputLanguage = 'changed';
  assert.equal(c.state.chats.b.settings.languagePolicy.outputLanguage, 'ja-JP');
});
test('默认模板区分单聊群聊，不改变其他聊天、不复制跨聊天关联', () => {
  const { c, api } = templateFixture();
  const before = clone(c.state.chats);
  c.state.globalSettings.chatSettingsDefaults = { single: { settings: { enableNarratorMode: true, linkedChatIds: ['private'], languagePolicy: { outputLanguage: 'ja-JP' } } }, group: { settings: { enableBilingualMode: true } } };
  const single = { settings: { aiPersona: '新人设' } }, group = { isGroup: true, settings: {} };
  api.applyDefaultChatSettings(single); api.applyDefaultChatSettings(group);
  assert.equal(single.settings.enableNarratorMode, true); assert.equal(single.settings.aiPersona, '新人设');
  assert.equal(single.settings.linkedChatIds, undefined); assert.equal(group.settings.enableBilingualMode, true);
  assert.equal(group.settings.enableNarratorMode, undefined); assert.deepEqual(c.state.chats, before);
  single.settings.languagePolicy.outputLanguage = 'changed';
  assert.equal(c.state.globalSettings.chatSettingsDefaults.single.settings.languagePolicy.outputLanguage, 'ja-JP');
});
test('批量保存失败时不更改内存中的聊天设置', async () => {
  const { c, api } = templateFixture(); const before = clone(c.state.chats);
  c.db.transaction = async () => { throw new Error('数据库失败'); };
  await assert.rejects(api.ChatSettingsTemplates.applyPresetToChats(1, ['a', 'b']), /数据库失败/);
  assert.deepEqual(c.state.chats, before);
});
test('模板套用后刷新当前聊天详情，避免旧表单再次保存时覆盖新设置', async () => {
  const { c, api } = templateFixture();
  let refreshed = 0;
  c.document.getElementById = id => id === 'chat-settings-screen' ? { classList: { contains: () => true } } : null;
  api.openChatSettings = () => { refreshed++; };
  await api.ChatSettingsTemplates.applyPresetToChats(1, ['a']);
  assert.equal(refreshed, 1);
  await api.ChatSettingsTemplates.applyPresetToChats(1, ['b']);
  assert.equal(refreshed, 1);
});
