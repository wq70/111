const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function fixture() {
  let now = Date.parse('2026-10-02T00:00:00Z');
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const storage = new Map(), nodes = new Map(), timers = [];
  function node() {
    return { value: '', checked: false, hidden: false, style: {}, dataset: {}, textContent: '', options: [],
      addEventListener(event, handler) { this[event] = handler; },
      getAttribute() { return 'false'; }, setAttribute() {},
      appendChild(option) { this.options.push(option); },
      dispatchEvent(event) { this[event.type]?.({ target: this }); }, focus() { this.focused = true; },
      set innerHTML(value) { this.options = []; }, get innerHTML() { return ''; } };
  }
  const document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, Object.assign(node(), { id })); return nodes.get(id); }, createElement: node };
  const localStorage = { getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
  const chat = { id: 'a', originalName: 'Alex', settings: {
    enableTimePerception: true, timeZone: 'Asia/Shanghai', characterTimeZone: 'America/New_York'
  }, history: [{ role: 'assistant', content: '刚才的对话', timestamp: now - 120000 },
    { role: 'user', content: '早上好', timestamp: now }] };
  const state = { activeChatId: 'a', chats: { a: chat }, globalSettings: {} };
  const context = vm.createContext({ Date: ClockDate, Intl, Map, Set, WeakMap, WeakSet, JSON, Math,
    document, localStorage, state, window: { state }, console: { log() {}, warn() {}, error() {} },
    Event, AbortController,
    setInterval: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearInterval() {}, setTimeout, clearTimeout });
  vm.runInContext(read('modules/memory/world-memory-time.js'), context);
  vm.runInContext(read('js/time-system.js'), context);
  vm.runInContext(read('js/time-zone-tools.js'), context);
  document.getElementById('member-time-zone-select');
  return { chat, state, nodes, storage, context, timers, a: context.window.TimeAwareness, e: context.window.MemoryWorldTime,
    now: () => now, at: value => { now = Date.parse(value); }, tick: ms => { now += ms; } };
}

test('上海早安不会成为纽约早晨：短间隔和首次聊天也提供双方时间规则', () => {
  const f = fixture(), info = f.a.getClockInfo(f.chat), result = f.a.buildContext({ chat: f.chat });
  assert.equal(info.user.timeText, '08:00');
  assert.equal(info.user.period, '早上');
  assert.equal(info.characters[0].timeText, '20:00');
  assert.equal(info.characters[0].period, '晚上');
  assert.equal(info.characters[0].dateKey, '2026-10-01');
  assert.equal(result.isReturn, false);
  assert.match(result.context, /用户当地时间.*08:00，早上/);
  assert.match(result.context, /角色「Alex」当地时间.*20:00，晚上/);
  assert.match(result.context, /不代表角色也处于相同时段/);
  f.chat.history = [];
  assert.match(f.a.buildContext({ chat: f.chat }).context, /不要每轮刻意解释时差/);
});

test('未设置或无效的角色时区不默认跟随用户；只有主动选择跟随才同步用户时间', () => {
  const f = fixture();
  delete f.chat.settings.characterTimeZone;
  assert.equal(f.a.getClockInfo(f.chat).characters.length, 0);
  assert.deepEqual(Array.from(f.a.getClockInfo(f.chat).unknownCharacters), ['Alex']);
  f.chat.settings.timeZone = 'America/Los_Angeles';
  assert.equal(f.a.getClockInfo(f.chat).characters.length, 0);
  f.chat.settings.characterTimeZone = 'bad-zone';
  assert.equal(f.a.getClockInfo(f.chat).characters.length, 0);
  assert.equal(f.chat.settings.characterTimeZone, 'bad-zone');
  f.chat.settings.characterTimeZone = 'follow-user';
  assert.equal(f.a.getClockInfo(f.chat).characters[0].timeText, '17:00');
  f.chat.settings.timeZone = 'Asia/Tokyo';
  assert.equal(f.a.getClockInfo(f.chat).characters[0].timeText, '09:00');
});

test('纽约夏令时跳过不存在的两点，冬夏时差随日期自动变化', () => {
  const f = fixture();
  f.at('2026-03-08T06:30:00Z');
  assert.equal(f.a.getClockInfo(f.chat).characters[0].timeText, '01:30');
  f.tick(3600000);
  assert.equal(f.a.getClockInfo(f.chat).characters[0].timeText, '03:30');
  f.at('2026-01-01T00:00:00Z');
  assert.equal(f.a.getClockInfo(f.chat).characters[0].timeText, '19:00');
  f.at('2026-07-01T00:00:00Z');
  assert.equal(f.a.getClockInfo(f.chat).characters[0].timeText, '20:00');
});

test('跨天分别按双方日历判断，上次互动按角色时区表达，离开间隔不受时区影响', () => {
  const f = fixture();
  f.chat.history[0].timestamp = Date.parse('2026-10-01T15:00:00Z');
  const result = f.a.buildContext({ chat: f.chat });
  assert.equal(result.isReturn, true);
  assert.equal(result.gapMs, 9 * 3600000);
  assert.match(result.context, /用户是否跨天：是/);
  assert.match(result.context, /角色「Alex」是否跨天：否/);
  assert.match(result.context, /上次互动时间：.*11:00（America\/New_York）/);
  f.chat.settings.characterTimeZone = 'Asia/Tokyo';
  assert.equal(f.a.buildContext({ chat: f.chat }).gapMs, result.gapMs);
});

test('全局自定义世界时间保留时差、暂停与倍率，原时间快照不被改写', () => {
  const f = fixture(), anchor = Date.parse('2021-10-16T00:00:00Z');
  for (const [key, value] of Object.entries({ enabled: true, year: 2021, month: 10, day: 16,
    hour: 8, minute: 0, anchor: f.now(), 'base-value': anchor, rate: 2 })) {
    f.storage.set(`custom-time-${key}`, String(value));
  }
  const message = { role: 'user', content: '早安', timestamp: f.now() };
  f.e.capture(message, f.chat);
  const snapshot = JSON.stringify(message.memoryClock);
  const initial = f.a.getClockInfo(f.chat);
  assert.equal(initial.user.timeText, '08:00');
  assert.equal(initial.characters[0].dateKey, '2021-10-15');
  assert.equal(initial.characters[0].timeText, '20:00');
  f.tick(3600000);
  assert.equal(f.a.getClockInfo(f.chat).user.timeText, '10:00');
  f.storage.set('custom-time-paused', 'true');
  f.storage.set('custom-time-paused-value', String(anchor + 7200000));
  f.tick(86400000);
  assert.equal(f.a.getClockInfo(f.chat).characters[0].timeText, '22:00');
  assert.equal(JSON.stringify(message.memoryClock), snapshot);
});

test('独立世界时钟是共同时间基准，时区换算不会改锚点或创建角色时钟', () => {
  const f = fixture();
  f.chat.settings.memoryTime = { inherit: false, clockMode: 'independent', clock: {
    anchorTime: Date.parse('2021-12-31T23:00:00Z'), anchorReal: f.now(), timeZone: 'America/New_York', rate: 1, paused: true
  } };
  const before = JSON.stringify(f.chat.settings.memoryTime);
  const info = f.a.getClockInfo(f.chat);
  assert.equal(info.user.dateKey, '2022-01-01');
  assert.equal(info.user.timeText, '07:00');
  assert.equal(info.characters[0].dateKey, '2021-12-31');
  assert.equal(info.characters[0].timeText, '18:00');
  f.tick(7200000);
  assert.equal(f.a.getClockInfo(f.chat).timestamp, info.timestamp);
  assert.equal(JSON.stringify(f.chat.settings.memoryTime), before);
});

test('群成员沿用关联角色时区，未关联成员可独立设置；群使用群的世界时钟', () => {
  const f = fixture();
  const group = { id: 'g', isGroup: true, settings: { enableTimePerception: true, timeZone: 'Asia/Shanghai' },
    members: [{ id: 'a', originalName: 'Alex', characterTimeZone: 'Asia/Tokyo' },
      { id: 'b', originalName: 'Sam', characterTimeZone: 'America/Los_Angeles' }, { id: 'c', originalName: '小明' }], history: [] };
  f.chat.settings.memoryTime = { inherit: false, clockMode: 'independent', clock: {
    anchorTime: Date.parse('2000-01-01T00:00:00Z'), anchorReal: f.now(), timeZone: 'UTC', rate: 1, paused: true
  } };
  const info = f.a.getClockInfo(group);
  assert.deepEqual(Array.from(info.characters, item => item.timeText), ['20:00', '17:00']);
  assert.deepEqual(Array.from(info.unknownCharacters), ['小明']);
  assert.equal(info.characters[0].dateKey, '2026-10-01');
  assert.match(f.a.buildContext({ chat: group }).context, /角色「Sam」当地时间.*17:00/);
  f.nodes.get('member-time-zone-select').value = 'Asia/Tokyo';
  f.a.saveMemberTimeZone(group.members[0]);
  assert.equal(f.chat.settings.characterTimeZone, 'Asia/Tokyo');
  assert.equal(f.a.getClockInfo(group).characters[0].timeText, '09:00');
  f.nodes.get('member-time-zone-select').value = '';
  f.a.saveMemberTimeZone(group.members[0]);
  assert.equal(f.a.getClockInfo(group).characters.some(item => item.name === 'Alex'), false);
  assert.match(f.a.buildContext({ chat: group }).context, /「Alex」、「小明」未设置时区/);
  assert.doesNotMatch(f.a.buildContext({ chat: group }).context, /角色「(?:Alex|小明)」(?:当地时间|是否跨天)/);
  f.nodes.get('member-time-zone-select').value = 'Europe/London';
  f.a.saveMemberTimeZone(group.members[1]);
  assert.equal(f.a.getClockInfo(group).characters.find(item => item.name === 'Sam').timeText, '01:00');
});

test('角色时区可加载、保存、回到跟随，不混入全局感知预设；私聊群聊界面正确切换', () => {
  const f = fixture();
  f.chat.settings.timeAwareness = { preset: 'natural', minGapMinutes: 240 };
  f.a.loadSettingsUi(f.chat);
  const select = f.nodes.get('character-time-zone-select');
  assert.equal(select.value, 'America/New_York');
  assert.ok(select.options.some(option => /美国 · 纽约/.test(option.textContent)));
  assert.equal(select.options[0].textContent, '未设置（按人设与剧情判断）');
  assert.equal(select.options[1].value, 'follow-user');
  select.value = 'America/Los_Angeles';
  f.a.saveSettingsUi(f.chat);
  assert.equal(f.chat.settings.characterTimeZone, 'America/Los_Angeles');
  assert.equal(f.chat.settings.timeAwareness.minGapMinutes, 240);
  assert.equal(f.chat.settings.timeAwareness.characterTimeZone, undefined);
  select.value = '';
  f.a.saveSettingsUi(f.chat);
  assert.equal(f.a.getClockInfo(f.chat).characters.length, 0);
  select.value = 'follow-user';
  f.a.saveSettingsUi(f.chat);
  assert.equal(f.a.getClockInfo(f.chat).characters[0].timeText, '08:00');
  const group = { isGroup: true, settings: {}, members: [] };
  f.a.loadSettingsUi(group);
  assert.equal(f.nodes.get('character-time-zone-group').hidden, true);
  assert.equal(f.nodes.get('group-time-zone-hint').hidden, false);
  f.a.loadSettingsUi(f.chat);
  assert.equal(f.nodes.get('character-time-zone-group').hidden, false);
  assert.equal(f.nodes.get('group-time-zone-hint').hidden, true);
});

test('感知开关和高级事实选项仍生效，后台不会假装用户回来', () => {
  const f = fixture();
  f.chat.settings.enableTimePerception = false;
  assert.equal(f.a.buildContext({ chat: f.chat }).context, '');
  assert.equal(f.a.buildLocalContext(f.chat), '');
  f.chat.settings.enableTimePerception = true;
  f.chat.settings.timeAwareness = { facts: { date: false, time: false, period: false, gap: false, lastInteraction: false, crossDay: false } };
  assert.equal(f.a.buildContext({ chat: f.chat }).context, '');
  assert.equal(f.a.buildLocalContext(f.chat), '');
  f.chat.settings.timeAwareness = { minGapMinutes: 0 };
  const background = f.a.buildContext({ chat: f.chat, mode: 'background' });
  assert.match(background.context, /用户此刻并未发送新消息/);
  assert.match(background.context, /角色「Alex」当地时间.*20:00，晚上/);
});

test('模拟预览使用尚未保存的时区选择，不提前修改角色资料', () => {
  const f = fixture();
  f.a.loadSettingsUi(f.chat);
  f.nodes.get('character-time-zone-select').value = 'America/Los_Angeles';
  f.context.document.getElementById('time-zone-select').value = 'Asia/Shanghai';
  f.nodes.get('time-awareness-preview-btn').click();
  assert.match(f.nodes.get('time-awareness-preview-output').textContent, /角色「Alex」当地时间.*17:00，下午/);
  assert.equal(f.chat.settings.characterTimeZone, 'America/New_York');
});

test('自定义回来提示词的当前时间和时段使用角色当地时间，时区规则始终保留', () => {
  const f = fixture();
  f.chat.settings.timeAwareness = { minGapMinutes: 0, promptMode: 'replace', customPrompt: '我这里是{{当前时间}}，{{时间段}}。' };
  const result = f.a.buildContext({ chat: f.chat });
  assert.match(result.context, /我这里是.*20:00，晚上/);
  assert.match(result.context, /不代表角色也处于相同时段/);
});

test('视频、语音通话的实际 API 请求包含双方时间，关闭感知后不注入', async () => {
  const f = fixture(), requests = [];
  f.state.worldBooks = [];
  f.state.apiConfig = { proxyUrl: 'https://mock.invalid', apiKey: 'mock', model: 'mock' };
  Object.assign(f.context, {
    AbortController, GEMINI_API_URL: 'https://gemini.invalid',
    getMemoryContextForPrompt: () => '', toGeminiRequestData: () => ({}),
    fetch: async (url, request) => {
      requests.push(JSON.parse(request.body));
      const error = new Error('停止在请求边界'); error.name = 'AbortError'; throw error;
    }
  });
  f.context.window.addEventListener = () => {};
  f.context.document.addEventListener = () => {};
  vm.runInContext(read('modules/video-voice-call.js'), f.context);
  for (const [stateKey, triggerKey] of [['videoCallState', 'triggerAiInCallAction'], ['voiceCallState', 'triggerAiInVoiceCallAction']]) {
    Object.assign(f.context.window[stateKey], { isActive: true, activeChatId: 'a', initiator: 'user' });
    await f.context.window[triggerKey]();
    const prompt = requests.at(-1).messages[0].content;
    assert.match(prompt, /用户当地时间.*08:00，早上/);
    assert.match(prompt, /角色「Alex」当地时间.*20:00，晚上/);
    assert.match(prompt, /不代表角色也处于相同时段/);
    f.chat.settings.enableTimePerception = false;
    await f.context.window[triggerKey]();
    assert.doesNotMatch(requests.at(-1).messages[0].content, /双方当地时间|不代表角色也处于相同时段/);
    f.chat.settings.enableTimePerception = true;
    f.chat.settings.characterTimeZone = '';
    await f.context.window[triggerKey]();
    assert.match(requests.at(-1).messages[0].content, /「Alex」未设置时区/);
    assert.doesNotMatch(requests.at(-1).messages[0].content, /角色「Alex」当地时间/);
    f.chat.settings.characterTimeZone = 'America/New_York';
  }
  assert.equal(requests.length, 6);
});

test('普通聊天的两个时间变量不会重复注入整段回来规则', () => {
  const f = fixture();
  f.chat.history[0].timestamp = f.now() - 9 * 3600000;
  const timeContext = f.a.buildContext({ chat: f.chat }).context;
  const expression = read('src/js-bundles/trigger-response/memory-and-social-context.jsfrag')
    .match(/'timePerceptionContext': (.*),/)[1];
  Object.assign(f.context, { chat: f.chat, timeContext });
  const localContext = vm.runInContext(expression, f.context);
  const template = read('modules/settings/prompt-templates.js');
  const contextSection = template.slice(template.indexOf('# 【Part 2:'), template.indexOf('- **情景感知**:'));
  const prompt = contextSection.replace('{{timePerceptionContext}}', localContext).replace('{{timeContext}}', timeContext);
  assert.equal((prompt.match(/# 回来时的角色反应规则/g) || []).length, 1);
  assert.match(prompt, /角色「Alex」当地时间.*20:00，晚上/);
});

test('双方时间显示随选择立即更新，显示前一天和时差；预览不提前保存设置', () => {
  const f = fixture();
  f.a.loadSettingsUi(f.chat);
  f.nodes.get('time-zone-select').value = 'Asia/Shanghai';
  f.nodes.get('character-time-zone-select').change();
  assert.equal(f.nodes.get('role-time-preview-user').textContent, '2026-10-02 08:00（早上）');
  assert.equal(f.nodes.get('role-time-preview-character').textContent, '2026-10-01 20:00（晚上）');
  assert.equal(f.nodes.get('role-time-preview-difference').textContent, '角色比我慢12小时');
  f.nodes.get('character-time-zone-select').value = 'America/Los_Angeles';
  f.nodes.get('character-time-zone-select').change();
  assert.equal(f.nodes.get('role-time-preview-character').textContent, '2026-10-01 17:00（下午）');
  assert.equal(f.nodes.get('role-time-preview-difference').textContent, '角色比我慢15小时');
  assert.equal(f.chat.settings.characterTimeZone, 'America/New_York');
});

test('时间显示区支持跟随、快慢方向和半小时时差，修改我的时区也立即换算', () => {
  const f = fixture();
  f.a.loadSettingsUi(f.chat);
  f.nodes.get('time-zone-select').value = 'Asia/Shanghai';
  f.nodes.get('character-time-zone-select').value = '';
  f.nodes.get('character-time-zone-select').change();
  assert.equal(f.nodes.get('role-time-preview-character').textContent, '未设置，按人设与剧情判断');
  assert.equal(f.nodes.get('role-time-preview-difference').textContent, '未设置角色时区，不计算时差');
  f.nodes.get('character-time-zone-select').value = 'follow-user';
  f.nodes.get('character-time-zone-select').change();
  assert.equal(f.nodes.get('role-time-preview-difference').textContent, '无时差，双方时间相同');
  assert.equal(f.nodes.get('role-time-preview-user').textContent, f.nodes.get('role-time-preview-character').textContent);
  f.nodes.get('character-time-zone-select').value = 'Asia/Kolkata';
  f.nodes.get('character-time-zone-select').change();
  assert.equal(f.nodes.get('role-time-preview-difference').textContent, '角色比我慢2小时30分钟');
  f.nodes.get('character-time-zone-select').value = 'Asia/Tokyo';
  f.nodes.get('character-time-zone-select').change();
  assert.equal(f.nodes.get('role-time-preview-difference').textContent, '角色比我快1小时');
  f.nodes.get('time-zone-select').value = 'Asia/Tokyo';
  f.nodes.get('time-zone-select').change();
  assert.equal(f.nodes.get('role-time-preview-difference').textContent, '无时差，双方时间相同');
});

test('显示的当前时差按冬夏令时计算，跨日期不会误算成少12或多24小时', () => {
  const f = fixture();
  f.a.loadSettingsUi(f.chat);
  f.at('2026-01-01T00:00:00Z');
  f.a.updateRoleTimePreview(true);
  assert.equal(f.nodes.get('role-time-preview-difference').textContent, '角色比我慢13小时');
  f.at('2026-07-01T00:00:00Z');
  f.a.updateRoleTimePreview(true);
  assert.equal(f.nodes.get('role-time-preview-difference').textContent, '角色比我慢12小时');
});

test('时间显示自动刷新、自定义世界时间和暂停沿用同一时钟；隐藏时跳过刷新', () => {
  const f = fixture();
  f.a.loadSettingsUi(f.chat);
  for (const [key, value] of Object.entries({ enabled: true, year: 2021, month: 10, day: 16,
    hour: 8, minute: 0, anchor: f.now(), 'base-value': Date.parse('2021-10-16T00:00:00Z'), rate: 2 })) {
    f.storage.set(`custom-time-${key}`, String(value));
  }
  const timer = f.timers.find(item => item.delay === 1000);
  timer.callback();
  assert.equal(f.nodes.get('role-time-preview-user').textContent, '2021-10-16 08:00（早上）');
  f.tick(30000);
  timer.callback();
  assert.equal(f.nodes.get('role-time-preview-user').textContent, '2021-10-16 08:01（早上）');
  f.storage.set('custom-time-paused', 'true');
  f.storage.set('custom-time-paused-value', String(Date.parse('2021-10-16T00:01:00Z')));
  f.tick(86400000);
  timer.callback();
  assert.equal(f.nodes.get('role-time-preview-character').textContent, '2021-10-15 20:01（晚上）');
  f.storage.set('custom-time-enabled', 'false');
  f.nodes.get('role-time-preview').getClientRects = () => [];
  timer.callback();
  assert.equal(f.nodes.get('role-time-preview-user').textContent, '2021-10-16 08:01（早上）');
  f.nodes.get('role-time-preview').getClientRects = () => [{}];
  timer.callback();
  assert.match(f.nodes.get('role-time-preview-user').textContent, /2026-10-03/);
});

test('我的、角色和群成员时区独立搜索，中英文城市与时区标识可点击选择，不提前保存', () => {
  const f = fixture();
  f.a.loadSettingsUi(f.chat);
  const tools = f.context.window.TimeZoneTools;
  const user = f.nodes.get('time-zone-select'), role = f.nodes.get('character-time-zone-select');
  assert.equal(user.value, 'Asia/Shanghai');
  assert.equal(user.options.some(option => option.value === ''), false);
  assert.ok(tools.searchOptions(user, '北京').some(option => option.value === 'Asia/Shanghai'));
  assert.ok(tools.searchOptions(role, 'new york').some(option => option.value === 'America/New_York'));
  const input = f.nodes.get('character-time-zone-search-input'), results = f.nodes.get('character-time-zone-search-results');
  input.value = '东京'; input.input();
  assert.equal(results.hidden, false);
  assert.equal(results.options.length, 2);
  results.options[1].click();
  assert.equal(role.value, 'Asia/Tokyo');
  assert.equal(user.value, 'Asia/Shanghai');
  assert.equal(f.chat.settings.characterTimeZone, 'America/New_York');
  assert.equal(results.hidden, true);
  assert.equal(input.value, '');
  assert.equal(f.nodes.get('role-time-preview-difference').textContent, '角色比我快1小时');
  input.value = '不存在的城市'; input.input();
  assert.match(results.options[0].textContent, /未找到时区/);
  assert.equal(role.value, 'Asia/Tokyo');
  f.a.populateRoleTimeZones(f.nodes.get('member-time-zone-select'), 'Europe/London');
  const memberInput = f.nodes.get('member-time-zone-search-input');
  memberInput.value = '洛杉矶'; memberInput.input();
  f.nodes.get('member-time-zone-search-results').options[1].click();
  assert.equal(f.nodes.get('member-time-zone-select').value, 'America/Los_Angeles');
  assert.equal(role.value, 'Asia/Tokyo');
  f.a.loadSettingsUi(f.chat);
  assert.equal(input.value, '');
  assert.equal(results.hidden, true);
});

function recommendationFixture() {
  const f = fixture();
  f.chat.settings.aiPersona = 'Alex 常住英国伦敦';
  f.chat.settings.linkedWorldBookIds = ['1'];
  f.state.worldBooks = [
    { id: 1, name: '角色世界', content: [{ content: '常住伦敦' }, { enabled: false, content: '禁用资料' }] },
    { id: 2, name: '其他世界', content: [{ content: '不应读取的资料' }] },
    { id: 3, name: '通用世界', isGlobal: true, content: [{ content: '现实世界' }] }
  ];
  f.state.apiConfig = { proxyUrl: 'https://example.invalid/', apiKey: 'test-key', model: 'test-model' };
  f.a.loadSettingsUi(f.chat);
  f.context.document.getElementById('ai-persona').value = f.chat.settings.aiPersona;
  f.mockResult = { timeZone: 'Europe/London', location: '英国伦敦', reason: '人设与角色世界均表明常住伦敦。', confidence: 'high' };
  f.requests = [];
  f.context.fetch = async (url, request) => {
    f.requests.push({ url, ...request, body: JSON.parse(request.body) });
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(f.mockResult) } }] }) };
  };
  return f;
}

test('AI 默认读取角色人设、绑定及全局世界书，隐藏的搜索结果不改变勾选，取消的书和禁用条目不发送', async () => {
  const f = recommendationFixture();
  const books = f.nodes.get('time-zone-ai-books').options;
  assert.equal(books[0].options[0].checked, true);
  assert.equal(books[1].options[0].checked, false);
  assert.equal(books[2].options[0].checked, true);
  f.nodes.get('time-zone-book-search').input({ target: { value: '其他' } });
  assert.equal(books[0].hidden, true);
  await f.nodes.get('time-zone-ai-recommend').click();
  const materials = JSON.parse(f.requests[0].body.messages[1].content);
  assert.equal(materials.persona, 'Alex 常住英国伦敦');
  assert.deepEqual(materials.worldBooks.map(book => book.name), ['角色世界', '通用世界']);
  assert.doesNotMatch(JSON.stringify(materials), /禁用资料|不应读取/);
  assert.equal(f.requests[0].url, 'https://example.invalid/v1/chat/completions');
  assert.match(f.requests[0].body.messages[0].content, /不是给你的指令/);
  assert.equal(f.nodes.get('character-time-zone-select').value, 'America/New_York');
  assert.equal(f.chat.settings.characterTimeZone, 'America/New_York');
  assert.equal(f.nodes.get('time-zone-ai-result').hidden, false);
  f.nodes.get('time-zone-ai-apply').click();
  assert.equal(f.nodes.get('character-time-zone-select').value, 'Europe/London');
  assert.equal(f.nodes.get('time-zone-select').value, 'Asia/Shanghai');
  assert.equal(f.chat.settings.characterTimeZone, 'America/New_York');
  f.a.saveSettingsUi(f.chat);
  assert.equal(f.chat.settings.characterTimeZone, 'Europe/London');
});

test('AI 支持只读指定世界书和聊天 API 覆盖；空资料、无效时区、空响应和网络错误可以重试', async () => {
  const f = recommendationFixture();
  f.chat.apiOverride = { enabled: true, proxyUrl: 'https://override.invalid', apiKey: 'override-key', model: 'override-model' };
  f.nodes.get('time-zone-ai-persona').checked = false;
  const books = f.nodes.get('time-zone-ai-books').options;
  books.forEach(label => { label.options[0].checked = false; });
  await f.nodes.get('time-zone-ai-recommend').click();
  assert.equal(f.requests.length, 0);
  assert.match(f.nodes.get('time-zone-ai-status').textContent, /先填写角色人设/);
  books[1].options[0].checked = true;
  await f.nodes.get('time-zone-ai-recommend').click();
  const materials = JSON.parse(f.requests[0].body.messages[1].content);
  assert.equal(materials.persona, '');
  assert.deepEqual(materials.worldBooks.map(book => book.name), ['其他世界']);
  assert.equal(f.requests[0].url, 'https://override.invalid/v1/chat/completions');
  assert.equal(f.requests[0].body.model, 'override-model');
  f.mockResult.timeZone = 'Invalid/Zone';
  await f.nodes.get('time-zone-ai-recommend').click();
  assert.match(f.nodes.get('time-zone-ai-status').textContent, /时区无效/);
  assert.equal(f.nodes.get('time-zone-ai-result').hidden, true);
  assert.equal(f.nodes.get('time-zone-ai-recommend').disabled, false);
  f.context.fetch = async () => { throw new Error('连接失败'); };
  await f.nodes.get('time-zone-ai-recommend').click();
  assert.equal(f.nodes.get('time-zone-ai-status').textContent, '连接失败');
  f.context.fetch = async () => ({ ok: true, json: async () => ({}) });
  await f.nodes.get('time-zone-ai-recommend').click();
  assert.match(f.nodes.get('time-zone-ai-status').textContent, /返回格式无法识别/);
});

test('架空世界资料不足时不提供应用按钮；返回 JSON 严格验证时区', async () => {
  const f = recommendationFixture();
  f.mockResult = { timeZone: null, location: '架空王国', reason: '没有对应的现实地理信息', confidence: 'low' };
  await f.nodes.get('time-zone-ai-recommend').click();
  assert.equal(f.nodes.get('time-zone-ai-apply').hidden, true);
  f.nodes.get('time-zone-ai-apply').click();
  assert.equal(f.nodes.get('character-time-zone-select').value, 'America/New_York');
  const parse = f.context.window.TimeZoneTools.parseRecommendation;
  assert.equal(parse('```json\n{"timeZone":"Asia/Tokyo"}\n```').timeZone, 'Asia/Tokyo');
  for (const value of [{}, { timeZone: '+08:00' }, { timeZone: 8 }, { timeZone: '' }]) {
    assert.throws(() => parse(JSON.stringify(value)), /有效的城市时区/);
  }
});

test('切换角色或修改读取范围会中止请求，过期推荐不能应用到其他角色', async () => {
  const f = recommendationFixture();
  let release, signal;
  f.context.fetch = async (_, request) => {
    signal = request.signal;
    return new Promise(resolve => { release = () => resolve({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(f.mockResult) } }] }) }); });
  };
  const running = f.nodes.get('time-zone-ai-recommend').click();
  const other = { id: 'b', settings: { characterTimeZone: 'Asia/Tokyo' } };
  f.state.chats.b = other; f.state.activeChatId = 'b';
  f.a.loadSettingsUi(other);
  assert.equal(signal.aborted, true);
  release(); await running;
  assert.equal(f.nodes.get('time-zone-ai-result').hidden, true);
  f.nodes.get('time-zone-ai-apply').click();
  assert.equal(f.nodes.get('character-time-zone-select').value, 'Asia/Tokyo');
  f.state.activeChatId = 'a'; f.a.loadSettingsUi(f.chat);
  const retry = f.nodes.get('time-zone-ai-recommend').click();
  f.nodes.get('time-zone-ai-persona').change();
  assert.equal(signal.aborted, true);
  release(); await retry;
  assert.equal(f.nodes.get('time-zone-ai-result').hidden, true);
});

test('Gemini 接口也可以生成时区推荐', async () => {
  const f = recommendationFixture();
  f.state.apiConfig.proxyUrl = 'https://generativelanguage.googleapis.com';
  f.context.toGeminiRequestData = (model, key, system, messages) => ({ url: 'https://gemini.invalid/generate', data: { method: 'POST', body: JSON.stringify({ model, messages, system }) } });
  f.context.fetch = async url => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(f.mockResult) }] } }] }) });
  await f.nodes.get('time-zone-ai-recommend').click();
  assert.equal(f.nodes.get('time-zone-ai-zone').textContent, 'Europe/London');
  assert.equal(f.nodes.get('time-zone-ai-result').hidden, false);
});

test('不选择时区不调用 AI，不虚构角色时间、时差或跨天；互动间隔和关闭感知仍生效', () => {
  const f = recommendationFixture();
  delete f.chat.settings.characterTimeZone;
  f.a.loadSettingsUi(f.chat);
  assert.equal(f.nodes.get('character-time-zone-select').value, '');
  assert.equal(f.requests.length, 0);
  f.chat.history[0].timestamp = f.now() - 9 * 3600000;
  const before = JSON.stringify(f.chat.settings);
  const info = f.a.getClockInfo(f.chat);
  assert.match(info.currentTime, /角色当地时间未设置/);
  assert.equal(info.timeOfDayGreeting, '角色当地时段未设置');
  const result = f.a.buildContext({ chat: f.chat });
  assert.equal(result.isReturn, true);
  assert.equal(result.gapMs, 9 * 3600000);
  assert.match(result.context, /用户当地时间/);
  assert.match(result.context, /不得将用户当地时间当成这些角色的当地时间/);
  assert.match(result.context, /用户时区，仅用于互动记录/);
  assert.doesNotMatch(result.context, /角色「Alex」(?:当地时间|是否跨天)/);
  assert.match(f.a.buildLocalContext(f.chat), /「Alex」未设置时区/);
  assert.equal(JSON.stringify(f.chat.settings), before);
  assert.equal(f.requests.length, 0);
  f.chat.settings.enableTimePerception = false;
  assert.equal(f.a.buildContext({ chat: f.chat }).context, '');
  assert.equal(f.a.buildLocalContext(f.chat), '');
});
