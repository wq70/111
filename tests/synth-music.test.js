const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.disabled = false;
    this.textContent = '▶';
    this.classes = new Set();
    this.listeners = {};
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name))
    };
  }
  set innerHTML(value) {
    this.html = value;
    if (value.includes('class="synth-play-btn"')) this.playButton = new Element();
  }
  get innerHTML() { return this.html; }
  appendChild(child) { this.children.push(child); }
  addEventListener(event, handler) { this.listeners[event] = handler; }
  querySelector(selector) { return selector === '.synth-play-btn' ? this.playButton : null; }
  async click() { if (!this.disabled) await this.listeners.click?.(); }
}

function fixture(options = {}) {
  const instances = [], timers = [], toasts = [], errors = [];
  const durations = { '1n': 2, '2n': 1, '4n': 0.5, '8n': 0.25, '16n': 0.125, '8t': 1 / 6 };
  let starts = 0;
  const Tone = {
    Synth: function Synth() {},
    async start() {
      starts++;
      if (options.start) await options.start();
    },
    getContext: () => ({ state: options.state || 'running' }),
    now: () => 10,
    Time: value => ({ toSeconds: () => typeof value === 'number' ? value : durations[value] }),
    PolySynth: class {
      constructor(voice) {
        assert.equal(voice, Tone.Synth);
        this.volume = {};
        this.calls = [];
        instances.push(this);
      }
      toDestination() { this.connected = true; return this; }
      set(preset) { this.preset = JSON.parse(JSON.stringify(preset)); }
      triggerAttackRelease(...args) {
        if (options.failAt === this.calls.length) throw new Error('音频合成失败');
        this.calls.push(args);
      }
      dispose() { this.disposed = true; }
    }
  };
  const window = {
    Tone: options.missingTone ? undefined : Tone,
    state: { activeChatId: 'original' },
    musicState: { isActive: true, isPlaying: true, currentIndex: 2, playlist: ['original'] },
    audioPlayer: { src: 'original.mp3', currentTime: 42, pause() { throw new Error('不得改变一起听'); } }
  };
  const context = vm.createContext({
    window, document: { createElement: () => new Element() },
    setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; },
    showToast: (message, type) => toasts.push({ message, type }),
    console: { error: (...args) => errors.push(args) },
    formatTimestamp: () => '12:00', defaultAvatar: 'avatar.png',
    addLongPressListener() {}, isSelectionMode: false
  });
  for (const file of ['modules/music-player.js', 'modules/chat/message-element.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  return {
    context, window, Tone, instances, timers, toasts, errors,
    starts: () => starts,
    finish() { timers.splice(0).sort((a, b) => a.delay - b.delay).forEach(timer => timer.fn()); }
  };
}

function assertReset(button) {
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, '▶');
  assert.equal(button.classes.has('playing'), false);
}

test('实际乐谱卡片按钮接通播放；音符和引号不再进入 onclick 属性，历史数据不变', async () => {
  const f = fixture();
  const msg = {
    role: 'assistant', type: 'synth_music', timestamp: 1,
    title: '一首很长的中文曲名与English123', reason: '给你的旋律',
    instrument: 'guitar\'"', notes: ['C4', 'D#5', 'Ab3']
  };
  const original = JSON.stringify(msg);
  const wrapper = await f.context.createMessageElement(msg, { id: 'chat', settings: {} });
  const bubble = wrapper.children[0].children[0];
  assert.match(bubble.innerHTML, /synth-music-card/);
  assert.doesNotMatch(bubble.innerHTML, /onclick=|\["C4"/);
  assert.equal(typeof bubble.playButton.listeners.click, 'function');
  await bubble.playButton.click();
  assert.equal(f.instances.length, 1);
  assert.deepEqual(f.instances[0].calls.map(call => call[0]), msg.notes);
  assert.equal(bubble.playButton.disabled, true);
  assert.equal(bubble.playButton.textContent, '❚❚');
  f.finish();
  assertReset(bubble.playButton);
  await bubble.playButton.click();
  assert.equal(f.instances.length, 2);
  f.finish();
  assert.equal(JSON.stringify(msg), original);
});

test('兼容字符串、JSON 和对象乐谱；保持旧默认节奏及按时长连续排音', async () => {
  for (const input of [
    ['C4', { n: 'E4', d: '2n' }, { n: 'G4' }],
    '["C4",{"n":"E4","d":"2n"},{"n":"G4"}]'
  ]) {
    const f = fixture(), button = new Element();
    await f.window.playSynthScore(button, input);
    assert.deepEqual(f.instances[0].calls, [['C4', '8n', 10], ['E4', '2n', 10.25], ['G4', '4n', 11.25]]);
    assert.equal(f.timers[0].delay, 2250);
    f.finish();
    assertReset(button);
    assert.equal(f.instances[0].disposed, true);
  }
});

test('八种历史音色和未知乐器默认钢琴均保留，不改变一起听状态', async () => {
  const f = fixture();
  const before = JSON.stringify(f.window);
  for (const [instrument, oscillator, volume] of [
    ['piano', 'triangle', -8], ['guitar', 'triangle', -5], ['violin', 'sawtooth', -10],
    ['flute', 'sine', -8], ['guzheng', 'triangle', -5], ['kalimba', 'sine', -8],
    ['synth', 'sawtooth', -8], ['chiptune', 'square', -8], ['unknown', 'triangle', -8],
    ['__proto__', 'triangle', -8]
  ]) {
    await f.window.playSynthScore(new Element(), ['C4'], instrument);
    const synth = f.instances.at(-1);
    assert.equal(synth.connected, true);
    assert.equal(synth.preset.oscillator.type, oscillator);
    assert.equal(synth.volume.value, volume);
  }
  assert.equal(JSON.stringify(f.window), before);
  f.finish();
  assert.ok(f.instances.every(synth => synth.disposed));
});

test('音频解锁等待期间及播放中重复点击不重入；不同乐谱音色互不污染', async () => {
  let unlock;
  const f = fixture({ start: () => new Promise(resolve => { unlock = resolve; }) });
  const button = new Element();
  const pending = f.window.playSynthScore(button, ['C4'], 'guitar');
  assert.equal(button.disabled, true);
  await f.window.playSynthScore(button, ['E4'], 'flute');
  assert.equal(f.starts(), 1);
  assert.equal(f.instances.length, 0);
  unlock();
  await pending;
  await f.window.playSynthScore(button, ['G4']);
  assert.equal(f.instances.length, 1);
  f.Tone.start = async () => {};
  await f.window.playSynthScore(new Element(), ['A4'], 'flute');
  assert.equal(f.instances.length, 2);
  assert.equal(f.instances[0].preset.oscillator.type, 'triangle');
  assert.equal(f.instances[1].preset.oscillator.type, 'sine');
  f.finish();
  assertReset(button);
});

test('空、损坏或全无效乐谱有错误反馈且按钮恢复；部分非法音符不阻断有效音符', async () => {
  for (const input of [undefined, null, {}, [], '[broken', ['H4', null, { n: 'NaN' }]]) {
    const f = fixture(), button = new Element();
    await f.window.playSynthScore(button, input);
    assertReset(button);
    assert.equal(f.toasts.length, 1);
    assert.equal(f.toasts[0].type, 'error');
    assert.equal(f.instances.length, 0);
    assert.equal(f.timers.length, 0);
  }
  const f = fixture();
  await f.window.playSynthScore(new Element(), [null, 'H4', 'C4', { n: 'Ab3', d: '16n' }]);
  assert.deepEqual(f.instances[0].calls, [['C4', '8n', 10], ['Ab3', '16n', 10.25]]);
});

test('组件缺失、浏览器拒绝音频、无效时长及合成失败均可恢复并重试', async () => {
  for (const [options, input] of [
    [{ missingTone: true }, ['C4']],
    [{ start: async () => { throw new Error('浏览器拒绝声音播放'); } }, ['C4']],
    [{ state: 'suspended' }, ['C4']],
    [{}, [{ n: 'C4', d: 'bad-duration' }]],
    [{ failAt: 1 }, ['C4', 'E4']]
  ]) {
    const f = fixture(options), button = new Element();
    await f.window.playSynthScore(button, input);
    assertReset(button);
    assert.equal(f.toasts.length, 1);
    assert.equal(f.timers.length, 0);
    assert.ok(f.instances.every(synth => synth.disposed));
    f.window.Tone = f.Tone;
    f.Tone.start = async () => {};
    f.Tone.getContext = () => ({ state: 'running' });
    await f.window.playSynthScore(button, ['G4']);
    assert.equal(button.disabled, true);
    f.finish();
    assertReset(button);
  }
});
