// 在外部依赖加载前采集；不依赖业务初始化，也不读取聊天数据库。
(function () {
  'use strict';
  if (window.EPhoneConsole) return;
  const LIMIT = 1000;
  const TEXT_LIMIT = 24000;
  const startedAt = new Date().toISOString();
  const scriptSource = document.currentScript?.src;
  const release = scriptSource ? new URL(scriptSource, location.href).searchParams.get('v') : null;
  const records = [];
  const timers = new Map();
  const counters = new Map();
  const original = {};
  let dropped = 0, sequence = 0, groupDepth = 0, epoch = 0;
  let filter = 'all', query = '', panel, content, scheduled = false;
  let revision = 0, renderedRevision = -1, renderedIds = [], lastFocus;
  let notice = '', noticeTimer;
  const methods = ['log', 'info', 'debug', 'warn', 'error', 'dir', 'table', 'trace', 'assert',
    'time', 'timeLog', 'timeEnd', 'count', 'countReset', 'group', 'groupCollapsed', 'groupEnd', 'clear'];
  methods.forEach(name => { if (typeof console[name] === 'function') original[name] = console[name]; });

  function clip(value, limit = TEXT_LIMIT) {
    const text = String(value);
    return text.length > limit ? text.slice(0, limit) + `…[截断，共 ${text.length} 字符]` : text;
  }
  function redact(value) {
    return clip(value).replace(/\bBearer\s+[\w.+\/~=-]+/gi, 'Bearer [已隐藏]')
      .replace(/([?&](?:key|api[_-]?key|access[_-]?token|token|secret|password|authorization)=)[^&#\s]*/gi, '$1[已隐藏]')
      .replace(/((?:["']?)(?:api[_-]?key|access[_-]?token|token|secret|password|authorization|cookie)(?:["']?)\s*[:=]\s*["']?)[^\s,"'}&]+/gi, '$1[已隐藏]');
  }
  function safeUrl(value) {
    try {
      const url = new URL(String(value), location.href);
      url.username = ''; url.password = '';
      // 查询参数可能含令牌、提示词等，只保留参数名。
      for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, '[已隐藏]');
      url.hash = '';
      return clip(url.href.replaceAll(encodeURIComponent('[已隐藏]'), '[已隐藏]'), 4000);
    } catch (_) { return '[无法读取地址]'; }
  }
  function snapshot(value, seen = new WeakSet(), depth = 0, budget = { remaining: 200 }) {
    if (--budget.remaining < 0) return '[达到快照大小上限]';
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return redact(value);
    if (typeof value === 'undefined') return '[undefined]';
    if (typeof value === 'bigint') return value.toString() + 'n';
    if (typeof value === 'symbol') return String(value);
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
    try {
      if (seen.has(value)) return '[循环引用]';
      if (depth >= 5) return '[达到展开深度上限]';
      seen.add(value);
      if (value instanceof Error || Object.prototype.toString.call(value).endsWith('Error]')) {
        const result = { name: redact(value.name), message: redact(value.message), stack: redact(value.stack || '') };
        if ('cause' in value) result.cause = snapshot(value.cause, seen, depth + 1, budget);
        return result;
      }
      if (value instanceof Date) return value.toISOString();
      if (typeof Element !== 'undefined' && value instanceof Element) {
        return `<${value.tagName.toLowerCase()}${value.id ? '#' + value.id : ''}>`;
      }
      if (value instanceof Map || value instanceof Set) {
        const items = [];
        for (const item of value) {
          if (items.length >= 100 || budget.remaining <= 0) break;
          items.push(snapshot(item, seen, depth + 1, budget));
        }
        return { type: value instanceof Map ? 'Map' : 'Set', size: value.size, items };
      }
      const output = Array.isArray(value) ? [] : Object.create(null);
      const keys = Object.keys(value);
      for (const key of keys.slice(0, 100)) {
        if (budget.remaining <= 0) break;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        const safeKey = clip(key, 200);
        output[safeKey] = /^(?:api[_-]?key|access[_-]?token|token|secret|password|authorization|cookie)$/i.test(key)
          ? '[已隐藏]' : descriptor && 'value' in descriptor ? snapshot(descriptor.value, seen, depth + 1, budget) : '[Getter/Setter]';
      }
      if (keys.length > 100) {
        if (Array.isArray(output)) output.push(`[另有 ${keys.length - 100} 项]`);
        else output['…'] = `另有 ${keys.length - 100} 项`;
      }
      return output;
    } catch (_) { return '[无法读取的对象]'; }
  }
  function printable(value) {
    if (value && typeof value === 'object' && typeof value.stack === 'string' && typeof value.message === 'string') {
      return `${value.name || 'Error'}: ${value.message}`;
    }
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  function callsite() {
    return redact((new Error().stack || '').split('\n').slice(1)
      .filter(line => !/mobile-console\.js/.test(line)).join('\n'));
  }
  function formatted(args) {
    let next = 1;
    if (typeof args[0] !== 'string') return clip(args.map(printable).join(' '));
    const text = args[0].replace(/%[%sdifoOc]/g, token => {
      if (token === '%%') return '%';
      if (next >= args.length) return token;
      const value = args[next++];
      if (token === '%c') return '';
      if (token === '%d' || token === '%i') return String(parseInt(value, 10));
      if (token === '%f') return String(parseFloat(value));
      return printable(value);
    });
    return clip([text, ...args.slice(next).map(printable)].join(' '));
  }
  function add(type, args, extra = {}) {
    try {
      const values = Array.from(args, value => snapshot(value));
      const record = { id: ++sequence, timestamp: new Date().toISOString(), type,
        message: formatted(values), args: values, stack: callsite(), groupDepth, ...extra };
      // 限制每条快照大小，避免大响应对象使移动端日志无限占用内存。
      if (JSON.stringify(record.args).length > TEXT_LIMIT) record.args = [clip(JSON.stringify(record.args))];
      records.push(record);
      if (records.length > LIMIT) { records.shift(); dropped++; }
      revision++; schedule();
      return record;
    } catch (_) { /* 调试采集不得影响原业务 */ }
  }
  function clear() {
    records.length = 0; dropped = 0; epoch++; revision++;
    schedule();
  }
  function capture(name, args) {
    if (name === 'clear') { clear(); return; }
    if (name === 'groupEnd') { groupDepth = Math.max(0, groupDepth - 1); return; }
    if (name === 'group' || name === 'groupCollapsed') {
      add('log', args.length ? args : ['分组'], { method: name });
      groupDepth = Math.min(groupDepth + 1, 10); return;
    }
    if (name === 'assert') {
      if (!args[0]) add('error', ['Assertion failed:', ...args.slice(1)], { method: name });
      return;
    }
    const label = /^(?:count|countReset|time|timeLog|timeEnd)$/.test(name) ? String(args[0] === undefined ? 'default' : args[0]) : '';
    if (name === 'countReset') { counters.delete(label); return; }
    if (name === 'count') {
      const count = (counters.get(label) || 0) + 1;
      if (counters.size < LIMIT || counters.has(label)) counters.set(label, count);
      add('info', [`${label}: ${count}`], { method: name }); return;
    }
    if (name === 'time') {
      if (timers.has(label)) add('warn', [`计时器 ${label} 已存在`]);
      else if (timers.size < LIMIT) timers.set(label, performance.now());
      return;
    }
    if (name === 'timeEnd' || name === 'timeLog') {
      if (!timers.has(label)) { add('warn', [`计时器 ${label} 不存在`]); return; }
      add('info', [`${label}: ${(performance.now() - timers.get(label)).toFixed(3)} ms`, ...args.slice(1)], { method: name });
      if (name === 'timeEnd') timers.delete(label);
      return;
    }
    add(['warn', 'error', 'info', 'debug'].includes(name) ? name : 'log', args, { method: name });
  }
  methods.forEach(name => {
    if (!original[name]) return;
    console[name] = function (...args) {
      const result = original[name].apply(this, args);
      try { capture(name, args); } catch (_) { /* 保留原生 console 行为 */ }
      return result;
    };
  });
  window.addEventListener('error', event => {
    if (event.target && event.target !== window) {
      const target = event.target;
      add('error', ['资源加载失败', safeUrl(target.src || target.href || '')], { method: 'resource', stack: '' });
    } else {
      add('error', [event.error || event.message || '未知脚本错误'], { method: 'uncaught',
        stack: redact(event.error?.stack || ''), source: `${safeUrl(event.filename || location.href)}:${event.lineno || 0}:${event.colno || 0}` });
    }
  }, true);
  window.addEventListener('unhandledrejection', event => {
    add('error', ['Unhandled Promise Rejection:', event.reason], { method: 'unhandledrejection', stack: redact(event.reason?.stack || '') });
  });

  function beginRequest(method, url, transport) {
    const request = { method: clip(method, 30), url: safeUrl(url), transport, status: 'pending' };
    const record = add('network', [`${request.method} ${request.url}`], { request, method: transport });
    return { record, started: performance.now(), epoch };
  }
  function endRequest(job, status, error) {
    try {
      if (!job.record || job.epoch !== epoch || !records.includes(job.record)) return;
      const request = job.record.request;
      request.status = status;
      request.durationMs = Math.round((performance.now() - job.started) * 100) / 100;
      if (error) request.error = redact(error.message || error);
      job.record.failed = status === 0 || status >= 400;
      job.record.message = `${request.method} ${request.url} → ${status || '失败/取消'} · ${request.durationMs} ms${error ? ' · ' + request.error : ''}`;
      revision++; schedule();
    } catch (_) { /* 不改变网络请求结果 */ }
  }
  if (typeof window.fetch === 'function') {
    const nativeFetch = window.fetch;
    window.fetch = function (input, options) {
      let job;
      try { job = beginRequest(options?.method || input?.method || 'GET', typeof input === 'string' || input instanceof URL ? input : input?.url, 'fetch'); } catch (_) { /* 采集隔离 */ }
      try {
        return nativeFetch.apply(this, arguments).then(response => {
          if (job) endRequest(job, response.status);
          return response;
        }, error => { if (job) endRequest(job, 0, error); throw error; });
      } catch (error) { if (job) endRequest(job, 0, error); throw error; }
    };
  }
  if (typeof window.XMLHttpRequest === 'function') {
    const prototype = window.XMLHttpRequest.prototype;
    const nativeOpen = prototype.open, nativeSend = prototype.send;
    const metadata = new WeakMap();
    prototype.open = function (method, url) {
      const result = nativeOpen.apply(this, arguments);
      metadata.set(this, { method, url });
      return result;
    };
    prototype.send = function () {
      const meta = metadata.get(this);
      let job;
      try { if (meta) job = beginRequest(meta.method, meta.url, 'xhr'); } catch (_) { /* 采集隔离 */ }
      const finish = () => { if (job) endRequest(job, this.status); };
      if (job) this.addEventListener('loadend', finish, { once: true });
      try { return nativeSend.apply(this, arguments); }
      catch (error) {
        if (job) { this.removeEventListener('loadend', finish); endRequest(job, 0, error); }
        throw error;
      }
    };
  }

  function visibleRecords() {
    return records.filter(record => (filter === 'all' || record.type === filter || (filter === 'error' && record.failed))
      && (!query || `${record.message}\n${record.stack}\n${record.source || ''}\n${JSON.stringify(record.args)}`.toLowerCase().includes(query)));
  }
  function environment() {
    return { startedAt, exportedAt: new Date().toISOString(), page: safeUrl(location.href),
      release,
      userAgent: navigator.userAgent, language: navigator.language, online: navigator.onLine,
      viewport: { width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  }
  function report(scope = 'all') {
    return { schemaVersion: 1, environment: environment(), limit: LIMIT, dropped,
      scope, filters: { type: filter, search: query },
      notes: '仅本页启动后的记录；对象为调用时快照，有深度和长度限制。已隐藏常见密钥与请求查询参数，不采集请求头或正文。日志原文仍可能包含个人信息。',
      records: JSON.parse(JSON.stringify(scope === 'filtered' ? visibleRecords() : records)) };
  }
  function asText(data) {
    return ['EPhone 控制台诊断报告', JSON.stringify(data.environment, null, 2),
      `范围: ${data.scope} | 共 ${data.records.length} 条 | 已淘汰 ${data.dropped} 条`, data.notes, '',
      ...data.records.map(record => `[${record.timestamp}] [${record.type.toUpperCase()}]${record.method ? ' [' + record.method + ']' : ''} ${record.message}`
        + (record.source ? '\n来源: ' + record.source : '') + (record.stack ? '\n' + record.stack : '')
        + record.args.filter(value => value && typeof value === 'object' && typeof value.stack === 'string').map(value => '\n异常堆栈:\n' + value.stack).join('')
        + (record.request ? '\n请求: ' + JSON.stringify(record.request) : '')
        + '\n参数快照: ' + JSON.stringify(record.args))].join('\n');
  }
  function tell(message) {
    notice = message;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice = ''; schedule(); }, 4000);
    schedule();
  }
  function exportFile() {
    try {
      const format = document.getElementById('console-export-format').value;
      const data = report(document.getElementById('console-export-scope').value);
      const body = format === 'json' ? JSON.stringify(data, null, 2) : asText(data);
      const url = URL.createObjectURL(new Blob([format === 'txt' ? '\uFEFF' : '', body], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `ephone-console-${data.environment.exportedAt.replace(/[:.]/g, '-')}.${format}`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      tell(`已发起导出 ${data.records.length} 条记录`);
    } catch (_) { tell('导出失败，请尝试复制日志'); }
  }
  async function copyReport() {
    const text = asText(report(document.getElementById('console-export-scope').value));
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      tell('已复制诊断报告');
    } catch (_) {
      const field = document.createElement('textarea');
      field.value = text; field.className = 'console-copy-field';
      panel.appendChild(field); field.focus(); field.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch (_) { /* 继续提供导出 */ }
      field.remove();
      tell(copied ? '已复制诊断报告' : '复制不可用，请使用导出');
    }
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function row(record) {
    const entry = element('div', `console-entry ${record.failed ? 'error' : record.type}`);
    entry.style.setProperty('--console-depth', record.groupDepth);
    const header = element('div', 'console-entry-header');
    const time = new Date(record.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) + '.' + record.timestamp.slice(20, 23);
    header.append(element('time', 'console-timestamp', time), element('span', 'console-level', record.type.toUpperCase()));
    if (record.method) header.append(element('span', 'console-method', record.method));
    entry.append(header, element('div', 'console-message', record.message));
    if (record.source) entry.append(element('div', 'console-source', record.source));
    const details = element('details', 'console-details');
    details.append(element('summary', '', '参数快照 / 调用堆栈'));
    details.append(element('pre', '', clip(JSON.stringify({ args: record.args, ...(record.request ? { request: record.request } : {}) }, null, 2))));
    record.args.forEach(value => {
      if (value && typeof value === 'object' && typeof value.stack === 'string') details.append(element('pre', '', value.stack));
    });
    if (record.stack) details.append(element('pre', '', record.stack));
    entry.append(details);
    return entry;
  }
  function render() {
    if (!panel || panel.style.display === 'none') return;
    const selected = visibleRecords();
    panel.querySelectorAll('.console-tab').forEach(tab => {
      const count = tab.dataset.tab === 'all' ? records.length : records.filter(record => record.type === tab.dataset.tab || (tab.dataset.tab === 'error' && record.failed)).length;
      tab.querySelector('span').textContent = count;
    });
    document.getElementById('console-status').textContent = notice || `显示 ${selected.length} / ${records.length} 条${dropped ? ` · 已淘汰最早 ${dropped} 条` : ''}`;
    if (revision === renderedRevision) return;
    const oldScroll = content.scrollTop;
    const nodes = new Map([...content.children].filter(node => node.dataset.id).map(node => [Number(node.dataset.id), node]));
    const ids = selected.map(record => record.id);
    const sameOrder = ids.length === renderedIds.length && ids.every((id, index) => id === renderedIds[index]);
    // 保留已展开的行；请求完成时只更新对应行。
    const fragment = document.createDocumentFragment();
    selected.forEach(record => {
      let node = nodes.get(record.id);
      const signature = record.message;
      if (!node || node.dataset.signature !== signature) {
        const wasOpen = node?.querySelector('details')?.open;
        node = row(record); node.dataset.id = record.id; node.dataset.signature = signature;
        if (wasOpen) node.querySelector('details').open = true;
      }
      fragment.appendChild(node);
    });
    if (!selected.length) fragment.append(element('div', 'console-empty', records.length ? '没有匹配的记录' : '暂无记录，后续日志将在这里实时显示'));
    if (!sameOrder || selected.length) content.replaceChildren(fragment);
    renderedIds = ids; renderedRevision = revision;
    content.scrollTop = document.getElementById('console-follow').checked ? content.scrollHeight : oldScroll;
  }
  function schedule() {
    if (!panel || panel.style.display === 'none' || scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; render(); }, 100);
  }
  function initUI() {
    const target = document.getElementById('mobile-console');
    if (!target || target.dataset.consoleBound) return;
    panel = target; content = document.getElementById('mobile-console-content');
    target.dataset.consoleBound = 'true';
    document.getElementById('open-console-btn')?.addEventListener('click', () => {
      lastFocus = document.activeElement; panel.style.display = 'flex'; render();
      document.getElementById('console-search').focus();
    });
    const close = () => { panel.style.display = 'none'; lastFocus?.focus(); };
    document.getElementById('console-close-btn').addEventListener('click', close);
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    document.getElementById('console-clear-btn').addEventListener('click', clear);
    document.getElementById('console-export-btn').addEventListener('click', exportFile);
    document.getElementById('console-copy-btn').addEventListener('click', copyReport);
    document.getElementById('console-search').addEventListener('input', event => { query = event.target.value.toLowerCase(); revision++; schedule(); });
    document.getElementById('console-follow').addEventListener('change', event => { if (event.target.checked) content.scrollTop = content.scrollHeight; });
    content.addEventListener('scroll', () => {
      if (content.scrollHeight - content.scrollTop - content.clientHeight > 50) document.getElementById('console-follow').checked = false;
    }, { passive: true });
    panel.querySelectorAll('.console-tab').forEach(tab => tab.addEventListener('click', () => {
      filter = tab.dataset.tab; revision++;
      panel.querySelectorAll('.console-tab').forEach(item => { item.classList.toggle('active', item === tab); item.setAttribute('aria-pressed', String(item === tab)); });
      schedule();
    }));
  }
  window.EPhoneConsole = Object.freeze({ initUI, report, clear });
  document.addEventListener('DOMContentLoaded', initUI, { once: true });
  add('info', ['控制台采集已启动：日志、异常及 fetch / XHR 请求；详情可展开，报告可导出。'], { stack: '' });
})();
