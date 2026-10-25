(function () {
  'use strict';
  let worker = null, workerBlob = null, sequence = 0, queue = Promise.resolve();
  const results = new Map();
  let resultBytes = 0;
  const maxResultBytes = 2 * 1024 * 1024;
  const reported = new Set();
  const runtimeUrl = new URL(document.currentScript?.src || location.href);
  const workerSource = new URL('rendering-rule-worker.js', runtimeUrl);
  workerSource.search = runtimeUrl.search;
  const workerUrl = workerSource.href;
  const engine = window.RenderingRuleEngine;

  function stopWorker() {
    worker?.terminate(); worker = null;
    if (workerBlob) { URL.revokeObjectURL(workerBlob); workerBlob = null; }
  }

  function createWorker() {
    if (location.protocol === 'file:') {
      workerBlob = URL.createObjectURL(new Blob([engine.workerSource], { type: 'text/javascript' }));
      return new Worker(workerBlob);
    }
    return new Worker(workerUrl);
  }

  function withoutCompiledFields(rule) {
    return Object.fromEntries(Object.entries(rule).filter(([key]) => !key.startsWith('_')));
  }

  function inWorker(input, rules, chatId, meta, stage, preview) {
    return new Promise(resolve => {
      let current = -1;
      const id = ++sequence;
      const fail = message => {
        clearTimeout(timer);
        stopWorker();
        resolve({ failed: current, message });
      };
      const timer = setTimeout(() => fail('规则执行超时，已停止并保留该规则处理前的内容'), 1200);
      try {
        if (!worker) worker = createWorker();
        worker.onmessage = event => {
          if (event.data.id !== id) return;
          if (Number.isInteger(event.data.running)) { current = event.data.running; return; }
          clearTimeout(timer);
          if (event.data.error) fail(event.data.error); else resolve(event.data.result);
        };
        worker.onerror = () => fail('隔离执行不可用');
        worker.postMessage({ id, input, rules: rules.map(withoutCompiledFields), chatId, meta, stage, preview });
      } catch (_) { fail('隔离执行不可用'); }
    });
  }

  function directFallback(input, rules, chatId, meta, stage, preview) {
    const safe = [], warnings = [];
    for (const rule of rules) {
      // Fail closed for regular expressions when they cannot be interrupted.
      if (rule.options && (rule.options.matchMode || 'regex') === 'regex' && !['map', 'format'].includes(rule.options.action)) {
        warnings.push(`${rule.name}：浏览器无法隔离执行正则，已跳过；可使用普通文字匹配`);
      } else safe.push(rule);
    }
    const result = engine.run(input, safe, chatId, meta, stage, preview);
    result.warnings.push(...warnings);
    return result;
  }

  function sanitizeNewHtml(content) {
    const template = document.createElement('template');
    template.innerHTML = content;
    const allowed = new Set(['DIV', 'SPAN', 'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'MARK', 'SMALL', 'BLOCKQUOTE', 'ASIDE', 'DETAILS', 'SUMMARY', 'DL', 'DT', 'DD', 'TABLE', 'TBODY', 'THEAD', 'TR', 'TH', 'TD', 'UL', 'OL', 'LI', 'PRE', 'CODE', 'A', 'IMG', 'HR']);
    for (const element of [...template.content.querySelectorAll('*')]) {
      if (!allowed.has(element.tagName)) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(element.tagName)) element.remove();
        else element.replaceWith(...element.childNodes);
        continue;
      }
      for (const attribute of [...element.attributes]) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value;
        if (['class', 'title', 'open', 'alt', 'colspan', 'rowspan'].includes(name)) continue;
        if (name === 'style') {
          const declarations = value.split(';').filter(part => /^\s*(?:--rr-color|color|background-color|font-size|font-weight|border-radius|padding|margin|border-color|text-align)\s*:/i.test(part) && !/url\s*\(|expression|[<>\\]/i.test(part));
          if (declarations.length) element.setAttribute('style', declarations.join(';')); else element.removeAttribute(name);
          continue;
        }
        if ((name === 'href' || name === 'src') && /^(https?:\/\/|\/[^/]|#)/i.test(value.trim())) continue;
        element.removeAttribute(name);
      }
      if (element.tagName === 'A') element.setAttribute('rel', 'noopener noreferrer');
    }
    return template.innerHTML;
  }

  async function run(input, rules, chatId, meta = {}, stage = 'display', preview = false) {
    if (window.areRenderingRulesPaused?.() && !preview) return { content: input, isHtml: false, trace: [], warnings: [], excluded: false };
    // 普通聊天恢复直接返回；不把无关规则、空规则送进 Worker 队列。
    if (!preview) rules = rules.filter(rule => !engine.applicable(rule, chatId, meta, stage));
    if (!rules.length) return { content: input, isHtml: false, inlineOnly: false, trace: [], warnings: [], excluded: false };
    // 用内容所属聊天的快照，不读取当前打开的另一个角色；快照同时进入缓存键和 Worker。
    const usesAppearanceVariables = rules.some(rule => [rule.template ?? rule.replaceString, rule.options?.elseTemplate, rule.options?.candidates, rule.options?.suffix].some(source => typeof source === 'string' && /\{\{\s*(?:char_name|char_remark|user_name|user_nickname|char_avatar|user_avatar)\s*\}\}/.test(source)));
    if (usesAppearanceVariables && typeof window.getAppearanceVariables === 'function') {
      const chat = typeof state !== 'undefined' ? state.chats?.[chatId] : null;
      meta = { ...meta, appearanceVariables: window.getAppearanceVariables(chat || null) };
    }
    const volatile = rules.some(rule => rule.options?.randomMode === 'reroll');
    const key = !preview && !volatile && input.length <= 50000 ? JSON.stringify([input, rules.map(rule => [engine.fingerprint(rule), rule.executionOrder, rule.isEnabled, rule.chatId, rule.doNotSend]), chatId, meta, stage]) : null;
    if (key && results.has(key)) return results.get(key).result;
    const execute = async () => {
      let active = rules;
      let result;
      const warnings = [];
      const needsIsolation = rules.some(rule => rule.options && (rule.options.matchMode || 'regex') === 'regex' && !['map', 'format'].includes(rule.options.action));
      // 旧版规则继续同步执行；新增正则规则仍隔离，普通文字规则无需异步往返。
      if (!needsIsolation) result = engine.run(input, active, chatId, meta, stage, preview);
      else if (typeof Worker === 'undefined') result = directFallback(input, active, chatId, meta, stage, preview);
      else {
        // Only retry after an identified timeout, omitting that offending rule.
        for (let attempts = 0; attempts <= rules.length; attempts++) {
          result = await inWorker(input, active, chatId, meta, stage, preview);
          if (!('failed' in result)) break;
          if (result.failed < 0) { result = directFallback(input, active, chatId, meta, stage, preview); break; }
          warnings.push(`${active[result.failed].name}：${result.message}`);
          active = active.filter((_, index) => index !== result.failed);
        }
      }
      result.warnings.push(...warnings);
      const hasLegacyHtml = rules.some(rule => !rule.options && /<\/?[a-z][^>]*>/i.test(rule.template ?? rule.replaceString ?? ''));
      if (stage === 'display' && result.isHtml && !hasLegacyHtml) result.content = sanitizeNewHtml(result.content);
      if (stage === 'copy' || stage === 'export') {
        const template = document.createElement('template');
        template.innerHTML = sanitizeNewHtml(result.content);
        if (result.isHtml) result.content = template.content.textContent || '';
        result.isHtml = false;
      }
      if (!preview) for (const warning of result.warnings) {
        if (!reported.has(warning)) { reported.add(warning); console.warn('[渲染规则]', warning); }
        if (reported.size > 100) reported.delete(reported.values().next().value);
      }
      if (key) {
        const bytes = 2 * (key.length + result.content.length);
        if (bytes <= maxResultBytes) {
          if (results.has(key)) resultBytes -= results.get(key).bytes;
          results.set(key, { result, bytes }); resultBytes += bytes;
          while (results.size > 300 || resultBytes > maxResultBytes) {
            const oldest = results.keys().next().value;
            resultBytes -= results.get(oldest).bytes; results.delete(oldest);
          }
        }
      }
      return result;
    };
    // 同步路径不排在其他聊天的正则 Worker 后面。
    if (!rules.some(rule => rule.options && (rule.options.matchMode || 'regex') === 'regex' && !['map', 'format'].includes(rule.options.action))) return execute();
    const pending = queue.then(execute, execute);
    queue = pending.then(() => {}, () => {});
    return pending;
  }

  window.RenderingRuleRuntime = { run, sanitizeNewHtml, clear() { results.clear(); resultBytes = 0; reported.clear(); } };
  window.applyRenderingRulesForStage = async (content, chatId, meta = {}, stage = 'copy') => {
    const rules = await db.renderingRules.toArray();
    return run(content, rules, chatId, meta, stage);
  };
})();
