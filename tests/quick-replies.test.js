const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'modules/chat/quick-replies.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const initial = [
  { id: 1, text: '你好\n第二行', categoryId: 10 },
  { id: 2, text: '晚安', categoryId: 10 },
  { id: 3, text: '其他分类', categoryId: 20 },
  { id: 4, text: '未分类', categoryId: null }
];

function fixture(saved = initial) {
  const elements = new Map();
  function element() {
    const classes = new Set();
    return {
      children: [], dataset: {}, style: {}, checked: false, indeterminate: false,
      classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
      appendChild(child) { this.children.push(child); },
      set innerHTML(value) { this.html = value; this.children = []; },
      get innerHTML() { return this.html; },
      addEventListener(type, listener) { this[type] = listener; },
      querySelectorAll() { return []; },
      focus() { this.focused = true; }
    };
  }
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const rows = new Map(saved.map(row => [row.id, copy(row)]));
  const prompts = [], confirmations = [], alerts = [];
  const c = vm.createContext({
    window: {}, console: { error() {} }, activeQuickReplyCategoryId: 'all',
    state: { quickReplies: copy(saved) },
    document: { getElementById: get, createElement: element },
    escapeHTML: value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])),
    showCustomPrompt: async (...args) => { prompts.push(args); return null; },
    showCustomConfirm: async (...args) => { confirmations.push(args); return false; },
    showCustomAlert: async (...args) => { alerts.push(args); },
    alert: message => alerts.push([message]),
    db: {
      quickReplies: {
        update: async (id, changes) => { Object.assign(rows.get(id), changes); return 1; },
        delete: async id => { rows.delete(id); },
        bulkDelete: async ids => { ids.forEach(id => rows.delete(id)); }
      },
      quickReplyCategories: { toArray: async () => [{ id: 10, name: '日常' }, { id: 20, name: '其他' }] }
    }
  });
  vm.runInContext(source, c);
  const click = async (index, selector) => {
    await c.renderQuickReplyList(false);
    const row = get('quick-reply-list').children[index];
    await row.click({ target: { closest: name => name === selector ? { dataset: { text: c.state.quickReplies[index].text } } : null } });
  };
  return { c, get, rows, click, prompts, confirmations, alerts,
    selected: () => Array.from(vm.runInContext('selectedQuickReplies', c)).sort() };
}

test('编辑按钮回填多行原文，保存后保留编号与分类并能重新载入', async () => {
  const f = fixture();
  f.c.showCustomPrompt = async (...args) => { f.prompts.push(args); return '修改后\n<你好> "朋友"'; };
  await f.click(0, '.quick-reply-edit-btn');
  assert.equal(f.prompts[0][2], initial[0].text);
  assert.equal(f.prompts[0][3], 'textarea');
  assert.deepEqual(f.rows.get(1), { ...initial[0], text: '修改后\n<你好> "朋友"' });
  assert.equal(f.c.state.quickReplies[0].text, f.rows.get(1).text);
  const reloaded = fixture([...f.rows.values()]);
  await reloaded.c.renderQuickReplyList(false);
  assert.match(reloaded.get('quick-reply-list').children[0].innerHTML, /修改后\n&lt;你好&gt; &quot;朋友&quot;/);
  assert.equal(f.rows.size, 4);
});

test('编辑取消、空内容和保存失败都不覆盖已有回复', async () => {
  const f = fixture();
  await f.click(0, '.quick-reply-edit-btn');
  f.c.showCustomPrompt = async () => ' \n ';
  await f.click(0, '.quick-reply-edit-btn');
  assert.match(f.alerts.at(-1)[0], /不能为空/);
  f.c.showCustomPrompt = async () => '不会保存';
  f.c.db.quickReplies.update = async () => { throw new Error('storage failed'); };
  await f.click(0, '.quick-reply-edit-btn');
  assert.match(f.alerts.at(-1)[0], /保存失败/);
  assert.deepEqual([...f.rows.values()], initial);
  assert.deepEqual(copy(f.c.state.quickReplies), initial);
});

test('单条删除按钮先确认，取消保留，确认只删除对应回复且重新载入不再出现', async () => {
  const f = fixture();
  await f.click(1, '.quick-reply-delete-btn');
  assert.equal(f.confirmations.length, 1);
  assert.equal(f.rows.size, 4);
  f.c.showCustomConfirm = async () => true;
  await f.click(1, '.quick-reply-delete-btn');
  assert.deepEqual([...f.rows.keys()], [1, 3, 4]);
  assert.deepEqual(copy(f.c.state.quickReplies).map(r => r.id), [1, 3, 4]);
  const reloaded = fixture([...f.rows.values()]);
  assert.equal(reloaded.c.state.quickReplies.some(r => r.id === 2), false);
});

test('多选与逐条取消更新删除数量、全选和半选状态，完成后清空选择', async () => {
  const f = fixture();
  f.c.toggleQuickReplyManagementMode();
  await f.click(0, '.quick-reply-checkbox');
  await f.click(1, '.quick-reply-text');
  assert.deepEqual(f.selected(), [1, 2]);
  assert.equal(f.get('delete-selected-quick-replies-btn').textContent, '删除 (2)');
  assert.equal(f.get('select-all-quick-replies-checkbox').indeterminate, true);
  assert.equal(f.get('select-all-quick-replies-checkbox').checked, false);
  await f.click(0, '.quick-reply-checkbox');
  assert.deepEqual(f.selected(), [2]);
  f.c.toggleQuickReplyManagementMode();
  assert.deepEqual(f.selected(), []);
  assert.equal(f.get('select-all-quick-replies-checkbox').indeterminate, false);
});

test('全选跟随当前分类，取消当前分类全选保留其他分类已选项', async () => {
  const f = fixture();
  f.c.toggleQuickReplyManagementMode();
  f.get('select-all-quick-replies-checkbox').checked = true;
  f.c.handleSelectAllQuickReplies();
  assert.deepEqual(f.selected(), [1, 2, 3, 4]);
  assert.equal(f.get('select-all-quick-replies-checkbox').checked, true);
  f.c.activeQuickReplyCategoryId = 10;
  await f.c.renderQuickReplyList(false);
  assert.equal(f.get('select-all-quick-replies-checkbox').checked, true);
  f.get('select-all-quick-replies-checkbox').checked = false;
  f.c.handleSelectAllQuickReplies();
  assert.deepEqual(f.selected(), [3, 4]);
  f.get('select-all-quick-replies-checkbox').checked = true;
  f.c.handleSelectAllQuickReplies();
  assert.deepEqual(f.selected(), [1, 2, 3, 4]);
  f.c.activeQuickReplyCategoryId = 99;
  await f.c.renderQuickReplyList(false);
  assert.equal(f.get('select-all-quick-replies-checkbox').disabled, true);
  assert.equal(f.get('select-all-quick-replies-checkbox').checked, false);
});

test('批量删除取消不变，确认只删除多选条目并保留其他分类', async () => {
  const f = fixture();
  f.c.toggleQuickReplyManagementMode();
  await f.click(0, '.quick-reply-checkbox');
  await f.click(1, '.quick-reply-checkbox');
  await f.c.executeBatchDeleteQuickReplies();
  assert.match(f.confirmations[0][1], /2 条/);
  assert.equal(f.rows.size, 4);
  assert.deepEqual(f.selected(), [1, 2]);
  f.c.showCustomConfirm = async () => true;
  await f.c.executeBatchDeleteQuickReplies();
  assert.deepEqual([...f.rows.keys()], [3, 4]);
  assert.deepEqual(copy(f.c.state.quickReplies).map(r => r.id), [3, 4]);
  assert.deepEqual(f.selected(), []);
});

test('全选可删除全部回复，空列表禁用全选；空选择不会发起删除', async () => {
  const f = fixture();
  f.c.toggleQuickReplyManagementMode();
  await f.c.executeBatchDeleteQuickReplies();
  assert.equal(f.confirmations.length, 0);
  f.get('select-all-quick-replies-checkbox').checked = true;
  f.c.handleSelectAllQuickReplies();
  f.c.showCustomConfirm = async () => true;
  await f.c.executeBatchDeleteQuickReplies();
  assert.equal(f.rows.size, 0);
  assert.equal(f.c.state.quickReplies.length, 0);
  assert.equal(f.get('select-all-quick-replies-checkbox').disabled, true);
});

test('等待确认时改变选择，仍只删除确认前的条目', async () => {
  const f = fixture();
  f.c.toggleQuickReplyManagementMode();
  f.c.toggleQuickReplySelection(1);
  let confirm;
  f.c.showCustomConfirm = () => new Promise(resolve => { confirm = resolve; });
  const pending = f.c.executeBatchDeleteQuickReplies();
  f.c.toggleQuickReplySelection(1);
  f.c.toggleQuickReplySelection(3);
  confirm(true);
  await pending;
  assert.deepEqual([...f.rows.keys()], [2, 3, 4]);
  assert.deepEqual(copy(f.c.state.quickReplies).map(r => r.id), [2, 3, 4]);
});

test('单条与批量删除保存失败时保留数据及选择，允许重试', async () => {
  const f = fixture();
  f.c.showCustomConfirm = async () => true;
  f.c.db.quickReplies.delete = async () => { throw new Error('storage failed'); };
  await f.click(0, '.quick-reply-delete-btn');
  f.c.toggleQuickReplyManagementMode();
  f.c.toggleQuickReplySelection(1);
  f.c.db.quickReplies.bulkDelete = async () => { throw new Error('storage failed'); };
  await f.c.executeBatchDeleteQuickReplies();
  assert.equal(f.rows.size, 4);
  assert.deepEqual(copy(f.c.state.quickReplies), initial);
  assert.deepEqual(f.selected(), [1]);
  assert.match(f.alerts.at(-1)[0], /删除失败/);
});

test('普通模式点击正文仍填入聊天框，不触发编辑或删除', async () => {
  const f = fixture();
  await f.click(0, '.quick-reply-text');
  assert.equal(f.get('chat-input').value, initial[0].text);
  assert.equal(f.get('chat-input').focused, true);
  assert.equal(f.prompts.length, 0);
  assert.equal(f.confirmations.length, 0);
  assert.equal(f.rows.size, 4);
});
