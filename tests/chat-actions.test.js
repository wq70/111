const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function fixture() {
  const handlers = {};
  const elements = new Map();
  const getElementById = id => {
    if (!elements.has(id)) elements.set(id, { style: {}, classList: { add() {}, remove() {} },
      addEventListener: (type, callback) => { handlers[id + ':' + type] = callback; } });
    return elements.get(id);
  };
  const a = { id: 'a', settings: {}, history: [
    { timestamp: 1, role: 'user', content: '你好' },
    { timestamp: 2, role: 'assistant', type: 'poll', question: '周末去哪' },
    { timestamp: 3, role: 'assistant', content: '公园' }
  ] };
  const b = { id: 'b', history: [{ timestamp: 1, content: '其他聊天' }] };
  const writes = [], renders = [];
  const c = vm.createContext({ console, window: {}, document: { getElementById },
    state: { activeChatId: 'a', chats: { a, b }, globalSettings: {} }, activeMessageTimestamp: 1,
    isSelectionMode: false, showCustomConfirm: async () => true,
    db: { chats: { put: async chat => writes.push(chat.id) } },
    exitSelectionMode() {}, renderChatInterface: async id => renders.push(id), renderChatList() {} });
  vm.runInContext(read('modules/message-actions.js'), c);
  return { c, a, b, writes, renders, handlers, elements, remove: c.window.deleteChatMessages };
}

test('长按菜单支持两种删除，取消确认不写入记录', async () => {
  const f = fixture();
  f.c.showCustomConfirm = async () => false;
  await f.handlers['erase-message-btn:click']();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.a.history.length, 3);
  assert.deepEqual(f.writes, []);
  assert.equal(f.c.activeMessageTimestamp, null);
  assert.equal(f.elements.get('delete-message-btn').style.display, 'none');
});

test('通知AI的删除移除选中消息并保留投票删除说明', async () => {
  const { a, b, remove, writes, renders } = fixture();
  await remove([1, 2], false);
  assert.deepEqual(a.history.filter(m => !m.isHidden).map(m => m.timestamp), [3]);
  assert.equal(a.history.at(-1).role, 'system');
  assert.match(a.history.at(-1).content, /周末去哪/);
  assert.equal(b.history.length, 1);
  assert.deepEqual(writes, ['a']);
  assert.deepEqual(renders, ['a']);
});

test('彻底删除仅移除目标消息，不额外插入系统提示', async () => {
  const { a, remove } = fixture();
  await remove([2, 2], true);
  assert.deepEqual(a.history.map(m => m.timestamp), [1, 3]);
  assert.equal(a.history.some(m => m.isHidden), false);
});

test('等待确认期间切换聊天或改变选中集合，仍只删除原聊天的原消息', async () => {
  const { c, a, b, remove, renders } = fixture();
  let confirm;
  c.showCustomConfirm = () => new Promise(resolve => { confirm = resolve; });
  const selected = new Set([1]);
  const pending = remove(selected, true);
  selected.clear(); selected.add(3);
  c.state.activeChatId = 'b';
  confirm(true);
  await pending;
  assert.deepEqual(a.history.map(m => m.timestamp), [2, 3]);
  assert.equal(b.history[0].content, '其他聊天');
  assert.deepEqual(renders, []);
});

test('空选择、已删除的消息或确认期间删除了聊天，都不写入', async () => {
  const { c, writes, remove } = fixture();
  let confirmations = 0;
  c.showCustomConfirm = async () => { confirmations++; delete c.state.chats.a; return true; };
  await remove([], true);
  await remove([99], true);
  assert.equal(confirmations, 0);
  await remove([1], true);
  assert.deepEqual(writes, []);
});

test('旧排序补齐新增操作，过滤重复和失效按钮；讨论操作默认靠后', () => {
  const c = vm.createContext({ state: { globalSettings: { chatActionButtonsOrder: ['voice-record-btn', 'obsolete', 'voice-record-btn'] } } });
  vm.runInContext(read('modules/ui/button-order.js'), c);
  const order = vm.runInContext('getChatButtonOrder(CHAT_BUTTON_ORDER_GROUPS[0])', c);
  assert.equal(order[0], 'voice-record-btn');
  assert.equal(order.includes('obsolete'), false);
  assert.equal(order.filter(id => id === 'voice-record-btn').length, 1);
  assert.ok(order.includes('generation-adjustments-btn'));
  const menu = vm.runInContext('getChatButtonOrder(CHAT_BUTTON_ORDER_GROUPS[3])', c);
  assert.ok(menu.indexOf('discuss-message-btn') > menu.indexOf('select-message-btn'));
  assert.ok(menu.includes('delete-message-btn') && menu.includes('erase-message-btn'));
});
