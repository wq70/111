const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../modules/tools/mobile-console.js'), 'utf8');

function runtime(fetcher = async () => new Response('body', { status: 200 })) {
  const listeners = {}, native = [], scheduled = [];
  class XHR {
    constructor() { this.listeners = {}; this.status = 0; }
    open(...args) { this.openArgs = args; }
    send(value) { this.sent = value; }
    addEventListener(name, handler) { this.listeners[name] = handler; }
    removeEventListener(name) { delete this.listeners[name]; }
    finish(status) { this.status = status; this.listeners.loadend?.(); delete this.listeners.loadend; }
  }
  const context = {
    URL, Blob, Error, Date, Map, Set, WeakMap, WeakSet, Response, Element: class {},
    location: { href: 'https://app.example.test/phone/?token=private#chat' },
    navigator: { userAgent: 'Test Browser', language: 'zh-CN', onLine: true },
    performance: { now: () => 100 },
    setTimeout: (fn, delay) => { scheduled.push({ fn, delay }); return scheduled.length; }, clearTimeout() {},
    document: { querySelector: () => null, addEventListener() {}, getElementById: () => null },
    console: Object.fromEntries(['log', 'info', 'debug', 'warn', 'error', 'dir', 'table', 'trace', 'assert', 'time', 'timeLog', 'timeEnd', 'count', 'countReset', 'group', 'groupCollapsed', 'groupEnd', 'clear'].map(name => [name, (...args) => native.push({ name, args })])),
    fetch: fetcher, XMLHttpRequest: XHR,
    addEventListener(name, handler) { listeners[name] = handler; },
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 2
  };
  context.window = context;
  vm.createContext(context); vm.runInContext(source, context);
  return { c: context, native, listeners, scheduled, report: scope => context.EPhoneConsole.report(scope) };
}

test('保留原生输出，捕获错误堆栈、循环引用与调用时对象快照，不执行 getter', () => {
  const r = runtime();
  let reads = 0;
  const value = { text: '<img src=x onerror=alert(1)>', number: 12n, apiKey: 'private-key' };
  value.self = value;
  Object.defineProperty(value, 'computed', { enumerable: true, get() { reads++; throw new Error('no'); } });
  r.c.console.log(value); value.text = 'changed';
  r.c.console.error(new Error('request failed', { cause: new Error('root cause') }));
  const records = r.report().records;
  assert.equal(reads, 0);
  assert.equal(r.native[0].args[0], value);
  assert.match(records[1].message, /<img src=x onerror=alert\(1\)>/);
  assert.match(records[1].message, /循环引用/);
  assert.match(records[1].message, /Getter\/Setter/);
  assert.equal(records[1].args[0].apiKey, '[已隐藏]');
  assert.match(records[2].args[0].stack, /request failed/);
  assert.match(records[2].args[0].cause.stack, /root cause/);
});

test('捕获脚本错误、Promise 原因和资源加载失败，保留来源', () => {
  const r = runtime();
  r.listeners.error({ error: new Error('broken'), filename: 'https://app.example.test/a.js', lineno: 32, colno: 5 });
  r.listeners.unhandledrejection({ reason: new Error('rejected') });
  r.listeners.error({ target: { src: 'https://cdn.example.test/lib.js?token=secret' } });
  const records = r.report().records;
  assert.equal(records[1].source, 'https://app.example.test/a.js:32:5');
  assert.match(records[1].stack, /broken/);
  assert.match(records[2].message, /rejected/);
  assert.match(records[3].message, /资源加载失败/);
  assert.doesNotMatch(JSON.stringify(records), /token=secret/);
});

test('支持级别、断言、格式占位符、计时、计数和分组', () => {
  const r = runtime();
  r.c.console.assert(true, 'invisible'); r.c.console.assert(false, 'failed');
  r.c.console.debug('debug'); r.c.console.info('info');
  r.c.console.log('%s %d %f %o %cstyled', 'hello', 42, 1.5, { ok: true }, 'color:red');
  r.c.console.time('timer'); r.c.console.timeEnd('timer');
  r.c.console.count('calls'); r.c.console.count('calls'); r.c.console.countReset('calls'); r.c.console.count('calls');
  r.c.console.group('nested'); r.c.console.log('child'); r.c.console.groupEnd(); r.c.console.log('parent');
  const records = r.report().records;
  assert.equal(records.filter(record => record.method === 'assert').length, 1);
  assert.equal(records.find(record => record.method === 'debug').type, 'debug');
  assert.match(records[4].message, /hello 42 1.5/);
  assert.doesNotMatch(records[4].message, /color:red/);
  assert.match(records.find(record => record.method === 'timeEnd').message, /timer: 0.000 ms/);
  assert.deepEqual(Array.from(records.filter(record => record.method === 'count'), record => record.message), ['calls: 1', 'calls: 2', 'calls: 1']);
  assert.equal(records.find(record => record.message === 'child').groupDepth, 1);
  assert.equal(records.find(record => record.message === 'parent').groupDepth, 0);
});

test('fetch 保持原响应、可读流及拒绝原因，采集状态和耗时且不读取正文/请求头', async () => {
  let captured;
  const response = new Response('stream contents', { status: 429 });
  const r = runtime(async (...args) => { captured = args; return response; });
  const options = { method: 'POST', body: 'private prompt', headers: { Authorization: 'Bearer private-key' } };
  const result = await r.c.fetch('https://api.example.test/chat?key=secret&prompt=private', options);
  assert.equal(result, response); assert.equal(response.bodyUsed, false);
  assert.equal(captured[1], options); assert.equal(await result.text(), 'stream contents');
  const record = r.report().records.at(-1);
  assert.equal(record.request.status, 429); assert.equal(record.failed, true);
  assert.equal(record.request.durationMs, 0);
  assert.doesNotMatch(JSON.stringify(r.report()), /private prompt|private-key|key=secret|prompt=private/);
  const reason = new Error('offline');
  const failing = runtime(() => Promise.reject(reason));
  await assert.rejects(failing.c.fetch('/test'), error => error === reason);
  assert.equal(failing.report().records.at(-1).request.status, 0);
});

test('XHR 保持参数及发送行为，清空后不会回填未完成请求', async () => {
  const r = runtime();
  const xhr = new r.c.XMLHttpRequest();
  xhr.open('POST', '/api?token=secret'); xhr.send('private body'); xhr.finish(503);
  assert.deepEqual(xhr.openArgs, ['POST', '/api?token=secret']); assert.equal(xhr.sent, 'private body');
  assert.equal(r.report().records.at(-1).request.status, 503);
  const pending = new r.c.XMLHttpRequest(); pending.open('GET', '/slow'); pending.send();
  r.c.EPhoneConsole.clear(); pending.finish(200);
  assert.equal(r.report().records.length, 0);
});

test('最多保留 1000 条，超长对象和敏感值受限，导出包含环境且重复加载不重复包装', () => {
  const r = runtime();
  const wrapped = r.c.console.log; vm.runInContext(source, r.c); assert.equal(r.c.console.log, wrapped);
  r.c.console.log({ huge: 'x'.repeat(200000), password: 'secret' });
  assert.ok(JSON.stringify(r.report().records.at(-1)).length < 60000);
  for (let i = 0; i < 1010; i++) r.c.console.log('entry', i);
  const data = r.report();
  assert.equal(data.records.length, 1000); assert.equal(data.dropped, 12);
  assert.equal(data.environment.viewport.width, 390);
  assert.doesNotMatch(data.environment.page, /private|#chat/);
  data.records[0].message = 'changed externally';
  assert.notEqual(r.report().records[0].message, 'changed externally');
  r.c.console.clear(); assert.equal(r.report().records.length, 0);
});

test('导出实际生成可解析 JSON / 中文 TXT，遵守筛选范围并可复制报告', async () => {
  const r = runtime();
  const nodes = new Map(), links = [];
  function node() {
    const events = {};
    return { dataset: {}, style: { display: 'none' }, value: '', events,
      addEventListener: (name, handler) => { events[name] = handler; },
      querySelectorAll: () => [], appendChild() {}, remove() {},
      click() { links.push(this); } };
  }
  r.c.document.getElementById = id => {
    if (!nodes.has(id)) nodes.set(id, node());
    return nodes.get(id);
  };
  r.c.document.createElement = () => node();
  r.c.document.body = node();
  r.c.EPhoneConsole.initUI();
  r.c.console.error(new Error('导出错误示例'));
  const get = r.c.document.getElementById;
  get('console-search').events.input({ target: { value: '导出错误示例' } });
  get('console-export-format').value = 'json';
  get('console-export-scope').value = 'filtered';
  get('console-export-btn').events.click();
  const jsonLink = links.at(-1);
  const data = await (await fetch(jsonLink.href)).json();
  assert.equal(data.records.length, 1);
  assert.equal(data.scope, 'filtered');
  assert.match(data.records[0].args[0].stack, /导出错误示例/);
  assert.match(jsonLink.download, /\.json$/);
  URL.revokeObjectURL(jsonLink.href);
  get('console-export-format').value = 'txt';
  get('console-export-scope').value = 'all';
  get('console-export-btn').events.click();
  const txtLink = links.at(-1);
  const text = await (await fetch(txtLink.href)).text();
  assert.match(text, /EPhone 控制台诊断报告/);
  assert.match(text, /共 2 条/);
  assert.match(text, /导出错误示例/);
  assert.match(txtLink.download, /\.txt$/);
  URL.revokeObjectURL(txtLink.href);
  let copied;
  r.c.navigator.clipboard = { writeText: async value => { copied = value; } };
  await get('console-copy-btn').events.click();
  const withoutExportTime = value => value.replace(/"exportedAt": "[^"]+"/, '"exportedAt": "<time>"');
  assert.equal(withoutExportTime(copied), withoutExportTime(text));
});
