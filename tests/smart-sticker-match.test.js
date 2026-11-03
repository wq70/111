const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const bindings = read('src/js-bundles/event-bindings-a/global-controls-and-music.jsfrag') +
  read('src/js-bundles/event-bindings-a/wallpaper-and-chat-input.jsfrag');
const begin = bindings.indexOf('    let smartMatchDebounceTimer');
const end = bindings.indexOf('    // 表情包智能匹配功能结束', begin);
const source = bindings.slice(begin, end);

function fixture(storage = new Map(), width = 300) {
  const elements = new Map();
  function element() {
    const listeners = {};
    return {
      children: [], style: {}, dataset: {}, value: '', disabled: false, hidden: false,
      clientWidth: width, scrollLeft: 0, textContent: '',
      addEventListener(name, fn) { listeners[name] = fn; },
      fire(name) { return listeners[name]?.({ target: this }); },
      click() { if (!this.disabled) return this.fire('click'); },
      replaceChildren() { this.children = []; },
      append(...children) { this.children.push(...children); },
      appendChild(child) { this.children.push(child); },
      setAttribute(name, value) { this[name] = value; },
      focus() {}, contains(target) { return target === this || this.children.includes(target); }
    };
  }
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  let timer, resize;
  const sent = [], saved = [];
  const chat = { id: 'a', history: [], settings: { enableStickerSmartMatch: true } };
  const stickers = Array.from({ length: 11 }, (_, i) => ({ name: `开心${i}`, url: `local:${i}`, categoryId: i < 6 ? 1 : 2 }));
  const state = { activeChatId: 'a', chats: { a: chat }, userStickers: stickers, stickerCategories: [{ id: 1 }, { id: 2 }] };
  const c = vm.createContext({
    state, chatInput: get('chat-input'),
    document: { getElementById: get, createElement: element, addEventListener() {} },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} },
    setTimeout: fn => { timer = fn; return 1; }, clearTimeout: () => { timer = null; },
    appendMessage: msg => sent.push(msg), db: { chats: { put: chat => saved.push(chat.id) } },
    renderChatList() {}, Date
  });
  vm.runInContext(source, c);
  const input = text => { c.chatInput.value = text; c.chatInput.fire('input'); const pending = timer; timer = null; pending?.(); };
  return { c, get, chat, state, storage, sent, saved, input,
    names: () => get('smart-sticker-match-grid').children.map(item => item.children[1].textContent),
    mode: value => get('smart-sticker-mode-' + value).click(),
    resize: size => { get('smart-sticker-match-grid').clientWidth = size; resize(); },
    pending: text => { c.chatInput.value = text; c.chatInput.fire('input'); return timer; }
  };
}

test('默认分页，逐页可访问全部11个匹配结果，末页可点击发送', () => {
  const f = fixture(); f.input('开心');
  assert.equal(f.get('smart-sticker-mode-pages')['aria-pressed'], 'true');
  assert.equal(f.get('smart-sticker-match-status').textContent, '1/4');
  assert.equal(f.get('smart-sticker-match-prev').disabled, true);
  const seen = [...f.names()];
  for (let i = 0; i < 3; i++) { f.get('smart-sticker-match-next').click(); seen.push(...f.names()); }
  assert.deepEqual(seen, f.state.userStickers.map(s => s.name));
  assert.equal(f.get('smart-sticker-match-status').textContent, '4/4');
  assert.equal(f.get('smart-sticker-match-next').disabled, true);
  f.get('smart-sticker-match-grid').children.at(-1).click();
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].content, 'local:10');
  assert.equal(f.chat.history[0], f.sent[0]);
  assert.deepEqual(f.saved, ['a']);
  assert.equal(f.c.chatInput.value, '');
  assert.equal(f.get('smart-sticker-match-panel').style.display, 'none');
});

test('切换滑动显示全部结果，重开记住选择，切回分页从第一页开始', () => {
  const f = fixture(); f.input('开心'); f.mode('scroll');
  assert.equal(f.names().length, 11);
  assert.equal(f.get('smart-sticker-match-pagination').hidden, true);
  const reopened = fixture(f.storage); reopened.input('开心');
  assert.equal(reopened.get('smart-sticker-mode-scroll')['aria-pressed'], 'true');
  assert.equal(reopened.names().length, 11);
  reopened.get('smart-sticker-match-grid').scrollLeft = 500;
  reopened.mode('pages');
  assert.equal(reopened.get('smart-sticker-match-status').textContent, '1/4');
  assert.equal(reopened.get('smart-sticker-match-grid').scrollLeft, 0);
  assert.equal(reopened.names().length, 3);
});

test('分类筛选、匹配优先级、输入变化重置与无结果收起', () => {
  const f = fixture(); f.chat.settings.stickerCategoryId = 2; f.input('开心');
  assert.equal(f.names()[0], '开心6');
  f.get('smart-sticker-match-next').click(); assert.equal(f.names()[0], '开心9');
  f.input('开心10');
  assert.deepEqual(f.names(), ['开心10']);
  assert.equal(f.get('smart-sticker-match-status').textContent, '1/1');
  assert.equal(f.get('smart-sticker-match-next').disabled, true);
  f.input('无匹配'); assert.equal(f.get('smart-sticker-match-panel').style.display, 'none');
  f.input(''); assert.equal(f.get('smart-sticker-match-panel').style.display, 'none');
  f.chat.settings.stickerCategoryId = null;
  f.state.userStickers.push({ name: '开心', url: 'exact' });
  f.input('开心'); assert.equal(f.names()[0], '开心');
});

test('窄屏调整页容量且不丢失结果，存储不可用也能切换', () => {
  const brokenStorage = { get() { throw Error('blocked'); }, set() { throw Error('blocked'); } };
  const f = fixture(brokenStorage); f.input('开心'); f.get('smart-sticker-match-next').click();
  f.resize(150);
  assert.equal(f.names().length, 2);
  assert.ok(f.names().includes('开心3'));
  f.resize(70); assert.equal(f.names().length, 1);
  f.mode('scroll'); assert.equal(f.names().length, 11);
});

test('延迟匹配不跨聊天，旧候选不发送到新聊天或新输入', () => {
  const f = fixture(); const pending = f.pending('开心');
  f.state.activeChatId = 'b'; pending();
  assert.equal(f.get('smart-sticker-match-panel').style.display, 'none');
  f.state.activeChatId = 'a'; f.input('开心');
  const old = f.get('smart-sticker-match-grid').children[0];
  f.state.activeChatId = 'b'; old.click(); assert.equal(f.sent.length, 0);
  f.state.activeChatId = 'a'; f.pending('别的'); old.click(); assert.equal(f.sent.length, 0);
});
