const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../modules/social/character-bond.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const timestamp = day => new Date(2026, 9, day, 10).getTime();

function chat(id = 'a', { end = 16, length = 7, resumed = [20], cards = 1 } = {}) {
  const days = [...Array.from({ length }, (_, i) => end - length + i + 1), ...resumed];
  return { id, settings: { enableCharacterSpark: true }, history: days.flatMap(day =>
    ['user', 'assistant'].map(role => ({ role, type: 'text', content: 'hello', timestamp: timestamp(day) }))),
  spark: { enabledAt: timestamp(1), activePeriods: [{ start: timestamp(1), end: null }], days: {},
    currentStreak: length, bestStreak: length, status: 'lit', lastCompleteDate: `2026-10-${String(end).padStart(2, '0')}`,
    sparks: 7, freezeCards: 0, restoreCards: cards, rewardedWeeks: Math.floor(length / 7) } };
}

function fixture(...chats) {
  let now = new Date(2026, 9, 20, 12).getTime();
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const nodes = new Map(), saved = new Map(), toasts = [];
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { dataset: {}, style: {}, checked: false, isConnected: true, value: '',
      hidden: false, disabled: false, textContent: '', events: {}, children: [],
      classList: { add() {}, remove() {} },
      addEventListener(event, callback) { this.events[event] = callback; },
      appendChild(child) { this.children.push(child); }, querySelector() { return this; } });
    return nodes.get(id);
  }
  let putCount = 0, putHook = async () => {};
  const state = { activeChatId: null, chats: Object.fromEntries(chats.map(c => [c.id, c])) };
  const context = { Date: ClockDate, state,
    document: { readyState: 'complete', getElementById: node, createElement: () => node(Symbol()) },
    db: { chats: { put: async value => { putCount++; await putHook(value); saved.set(value.id, clone(value)); } } },
    showToast: value => toasts.push(value), console: { error() {} }, renderChatList() {} };
  context.window = context;
  vm.runInNewContext(source, context);
  return { node, state, saved, toasts, bond: context.CharacterBond,
    open(c) { context.CharacterBond.showBondModal('spark', c); },
    async click(id = 'restore-character-spark-btn') { return node(id).events.click(); },
    async saveCount(value) { node('character-spark-restore-cards').value = String(value); return this.click('save-character-spark-cards-btn'); },
    setPut(fn) { putHook = fn; }, putCount: () => putCount,
    advanceDay() { now = new Date(2026, 9, 21, 12).getTime(); } };
}

test('列表徽标打开弹窗，在未进入聊天且设置开关为旧值时恢复正确角色', async () => {
  const a = chat(), f = fixture(a), item = f.node('list-item');
  f.bond.decorateChatListItem(item, a);
  item.children[0].events.click({ stopPropagation() {} });
  assert.equal(f.state.activeChatId, null);
  assert.equal(f.node('character-bond-modal').dataset.chatId, 'a');
  assert.equal(f.node('restore-character-spark-btn').hidden, false);
  await f.click();
  assert.equal(a.spark.status, 'lit');
  assert.equal(a.spark.currentStreak, 11);
  assert.equal(a.spark.restoreCards, 0);
  assert.deepEqual(Object.keys(a.spark.protectedDays), ['2026-10-17', '2026-10-18', '2026-10-19']);
  assert.equal(f.saved.get('a').spark.status, 'lit');
});

test('其他聊天处于打开状态时，恢复和自定义卡数只操作弹窗角色', async () => {
  const a = chat(), b = chat('b'), f = fixture(a, b);
  f.state.activeChatId = 'b'; f.open(a);
  await f.saveCount(4);
  await f.click();
  assert.equal(a.spark.restoreCards, 3);
  assert.equal(b.spark.restoreCards, 1);
  assert.equal(f.saved.has('b'), false);
});

test('设置入口恢复前后断档，今日互动信息保持真实', async () => {
  const a = chat(), f = fixture(a);
  f.state.activeChatId = 'a';
  await f.node('character-spark-details-btn').events.click();
  assert.equal(a.spark.lastCompleteDate, '2026-10-20');
  await f.click();
  assert.equal(f.node('character-spark-state').textContent, '已点亮，连续 11 天');
  assert.equal(f.node('character-spark-settings-summary').textContent, '11天');
  assert.equal(f.node('character-spark-today').textContent, '今日：你已发送 · 角色已回复');
  assert.equal(f.toasts.at(-1), '角色火花已恢复');
});

test('中断后已经重新互动两天仍可接回，已有完整日期不被覆盖', async () => {
  const a = chat('a', { resumed: [19, 20] }), f = fixture(a);
  f.open(a); await f.click();
  assert.equal(a.spark.currentStreak, 11);
  assert.deepEqual(Object.keys(a.spark.protectedDays), ['2026-10-17', '2026-10-18']);
  assert.equal(a.spark.days['2026-10-19'].protectedBy, undefined);
});

test('今天尚未互动也能恢复到昨天，不虚构今天互动', async () => {
  const a = chat('a', { resumed: [] }), f = fixture(a);
  f.open(a); await f.click();
  assert.equal(a.spark.status, 'lit');
  assert.equal(a.spark.currentStreak, 10);
  assert.equal(a.spark.lastCompleteDate, '2026-10-19');
  assert.equal(f.node('character-spark-today').textContent, '今日：你未发送 · 角色未回复');
});

test('7天期限的最后一天可恢复，第8天即使重新聊天也不延长期限', async () => {
  const eligible = chat('a', { end: 13 }), expired = chat('b', { end: 12 });
  const f = fixture(eligible, expired);
  f.open(eligible); await f.click();
  assert.equal(eligible.spark.status, 'lit');
  f.open(expired); await f.click();
  assert.equal(expired.spark.restoreCards, 1);
  assert.equal(f.saved.has('b'), false);
  assert.match(f.toasts.at(-1), /超过7天/);
  assert.equal(f.node('restore-character-spark-btn').hidden, true);
});

test('没有断档和没有已点亮历史时均不扣卡，也不假报成功', async () => {
  for (const a of [chat('a', { end: 19 }), chat('a', { end: 16, length: 2 })]) {
    const f = fixture(a); f.open(a); await f.click();
    assert.equal(a.spark.restoreCards, 1);
    assert.equal(f.putCount(), 0);
    assert.equal(f.toasts.includes('角色火花已恢复'), false);
  }
});

test('零卡时可自定义补卡再恢复，卡数可以清零，数量保存不会使用恢复卡', async () => {
  const a = chat('a', { cards: 0 }), f = fixture(a); f.open(a);
  assert.equal(f.node('restore-character-spark-btn').disabled, true);
  await f.click(); assert.equal(f.putCount(), 0);
  await f.saveCount(8);
  assert.equal(a.spark.restoreCards, 8);
  assert.equal(a.spark.status, 'recoverable');
  assert.deepEqual(clone(a.spark.protectedDays), {});
  await f.saveCount(0);
  assert.equal(a.spark.restoreCards, 0);
  assert.equal(f.saved.get('a').spark.restoreCards, 0);
});

test('空值、负数、小数、非数字和超出安全范围的卡数不会保存', async () => {
  const a = chat(), f = fixture(a); f.open(a);
  for (const value of ['', '-1', '1.5', 'abc', 'Infinity', '9007199254740992']) {
    await f.saveCount(value);
    assert.equal(a.spark.restoreCards, 1);
  }
  assert.equal(f.putCount(), 0);
});

test('恢复或修改数量保存失败时，内存卡数、保护日期和状态均不变', async () => {
  const a = chat(), f = fixture(a); f.open(a);
  const before = clone(a.spark);
  f.setPut(async () => { throw new Error('quota'); });
  await f.click();
  assert.deepEqual(clone(a.spark), before);
  await f.saveCount(5);
  assert.deepEqual(clone(a.spark), before);
  assert.equal(f.saved.size, 0);
  assert.equal(f.node('restore-character-spark-btn').disabled, false);
  assert.match(f.toasts.at(-1), /保存失败/);
});

test('重复点击及恢复中修改数量只保存一次，等待保存时不提前扣卡', async () => {
  const a = chat(), f = fixture(a); f.open(a);
  let finish; f.setPut(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.click();
  assert.equal(f.node('restore-character-spark-btn').disabled, true);
  assert.equal(f.node('save-character-spark-cards-btn').disabled, true);
  assert.equal(a.spark.restoreCards, 1);
  await f.click(); await f.saveCount(9);
  assert.equal(f.putCount(), 1);
  finish(); await pending;
  assert.equal(a.spark.restoreCards, 0);
});

test('保存过程中切换角色，完成后不覆盖新弹窗', async () => {
  const a = chat(), b = chat('b', { cards: 4 }), f = fixture(a, b); f.open(a);
  let finish; f.setPut(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.click(); f.open(b);
  finish(); await pending;
  assert.equal(f.node('character-bond-modal').dataset.chatId, 'b');
  assert.equal(Number(f.node('character-spark-restore-cards').value), 4);
  assert.equal(b.spark.restoreCards, 4);
});

test('恢复结果和自定义卡数重新载入后保留，不重复扣卡', async () => {
  const a = chat(), f = fixture(a); f.open(a);
  await f.saveCount(3); await f.click();
  const reloaded = clone(f.saved.get('a')), next = fixture(reloaded);
  next.open(reloaded); await next.click();
  assert.equal(reloaded.spark.status, 'lit');
  assert.equal(reloaded.spark.restoreCards, 2);
  assert.equal(next.putCount(), 0);
});

test('角色已删除或火花已关闭时不消耗卡，自定义数量仍允许用于关闭的火花', async () => {
  const a = chat(), f = fixture(a); f.open(a);
  delete f.state.chats.a; await f.click();
  assert.match(f.toasts.at(-1), /没有找到对应角色/);
  f.state.chats.a = a; a.settings.enableCharacterSpark = false;
  f.open(a); await f.click();
  assert.equal(a.spark.restoreCards, 1);
  await f.saveCount(5);
  assert.equal(a.spark.restoreCards, 5);
  assert.equal(a.settings.enableCharacterSpark, false);
});

test('正常三天点亮、七天奖励和冻结卡保护保持生效', () => {
  const a = chat('a', { end: 20, length: 3, resumed: [] }), f = fixture(a);
  a.spark.bestStreak = 0; a.spark.restoreCards = 0; a.spark.rewardedWeeks = 0;
  f.bond.reconcile(a); assert.equal(a.spark.status, 'lit');
  const b = chat('b', { end: 20, resumed: [], cards: 0 });
  b.spark.rewardedWeeks = 0; f.bond.reconcile(b);
  assert.equal(b.spark.restoreCards, 1);
  f.bond.reconcile(b); assert.equal(b.spark.restoreCards, 1);
  const c = chat('c', { end: 18, resumed: [] }); c.spark.freezeCards = 1;
  f.bond.reconcile(c);
  assert.equal(c.spark.protectedDays['2026-10-19'], 'freeze');
  assert.equal(c.spark.freezeCards, 0);
  assert.equal(c.spark.status, 'lit');
});

test('恢复跨过新奖励周时仍正常发奖励，重复恢复不会刷奖励', async () => {
  const a = chat('a', { length: 11 }), f = fixture(a); f.open(a);
  await f.click();
  assert.equal(a.spark.currentStreak, 15);
  assert.equal(a.spark.restoreCards, 1); // 消耗1张，同时首次到达第二个奖励周获得1张。
  assert.equal(a.spark.freezeCards, 1);
  await f.click();
  assert.equal(a.spark.restoreCards, 1);
  assert.equal(f.putCount(), 1);
});
