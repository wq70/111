// 发送前的宏处理。仅处理作者配置的来源；聊天记录和替换结果不再次作为宏执行。
(function () {
  'use strict';
  const LIMIT = 1000000, MAX_RULES = 100;
  const scopes = ['presets', 'worldbooks', 'prompts'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  function settings(value = window.state?.globalSettings?.promptMacros) {
    value = value || {};
    return { enabled: value.enabled === true, offMode: value.offMode === 'omit' ? 'omit' : 'preserve',
      scopes: Object.fromEntries(scopes.map(scope => [scope, value.scopes?.[scope] !== false])),
      rules: Array.isArray(value.rules) ? clone(value.rules) : [] };
  }
  function validate(config) {
    if (config.rules.length > MAX_RULES) throw new Error('自定义宏最多保存 100 条。');
    const names = new Set(['random']);
    for (const rule of config.rules) {
      const name = String(rule.name || '').trim().toLowerCase();
      if (!/^[a-z][a-z0-9_-]{0,47}$/.test(name)) throw new Error('宏名称使用英文字母开头，可包含数字、下划线和短横线。');
      if (names.has(name)) throw new Error(`宏名称重复或为内置宏：${name}`);
      names.add(name);
      if (!['fixed', 'random', 'template', 'script'].includes(rule.type)) throw new Error(`宏 ${name} 的处理方式无效。`);
      if (String(rule.value || '').length > 50000) throw new Error(`宏 ${name} 的规则内容过长。`);
    }
    return config;
  }
  function parse(text, depth = 0) {
    if (depth > 12) throw new Error('宏嵌套超过 12 层。');
    const nodes = []; let literal = '';
    const flush = () => { if (literal) nodes.push({ text: literal }); literal = ''; };
    for (let i = 0; i < text.length;) {
      const opener = /^\{\{\s*([a-z][a-z0-9_-]*)\s*(::|:|\s+)?/i.exec(text.slice(i));
      if (!opener) { literal += text[i++]; continue; }
      let cursor = i + opener[0].length, level = 0, start = cursor, closed = false;
      const parts = [], separator = opener[2] === '::' ? '::' : ',';
      while (cursor < text.length) {
        if (text[cursor] === '\\') { cursor += 2; continue; }
        if (text.startsWith('{{', cursor)) { level++; cursor += 2; continue; }
        if (text.startsWith('}}', cursor)) {
          if (level) { level--; cursor += 2; continue; }
          parts.push(text.slice(start, cursor).trim()); cursor += 2; closed = true; break;
        }
        if (!level && text.startsWith(separator, cursor)) { parts.push(text.slice(start, cursor).trim()); cursor += separator.length; start = cursor; continue; }
        cursor++;
      }
      if (!closed) { literal += text.slice(i); break; }
      if (parts.length > 500) throw new Error('单个宏最多包含 500 个参数。');
      flush();
      nodes.push({ name: opener[1].toLowerCase(), raw: text.slice(i, cursor), args: parts.map(part => parse(part, depth + 1)) });
      i = cursor;
    }
    flush(); return nodes;
  }
  const unescape = value => value.replace(/\\([\\{},:])/g, '$1');
  const bounded = value => {
    if (typeof value !== 'string') throw new Error('宏处理必须返回文字。');
    if (value.length > LIMIT) throw new Error('宏展开结果过长。');
    return value;
  };
  // 脚本在不共享站点来源的 iframe 内启动 Worker。只传本条宏的参数，超时终止。
  function runScript(script, args, text) {
    if (typeof document === 'undefined' || typeof MessageChannel === 'undefined') return Promise.reject(new Error('当前环境不支持高级宏脚本。'));
    return new Promise((resolve, reject) => {
      const frame = document.createElement('iframe'), channel = new MessageChannel();
      frame.hidden = true; frame.setAttribute('sandbox', 'allow-scripts');
      const finish = (error, result) => { clearTimeout(timer); channel.port1.close(); frame.remove(); error ? reject(error) : resolve(result); };
      const timer = setTimeout(() => finish(new Error('高级宏脚本超时或无法运行，本次请求未发送。')), 1500);
      channel.port1.onmessage = event => {
        try {
          if (!event.data?.ok) throw new Error('高级宏脚本失败：' + String(event.data?.error || '未知错误'));
          finish(null, bounded(event.data.value));
        } catch (error) { finish(error); }
      };
      frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'"><script>
        addEventListener('message', event => {
          if (event.source !== parent || !event.ports[0]) return;
          const port = event.ports[0];
          const code = 'onmessage = async function(event) { try { const {script,args,text} = event.data; const value = await new Function("args", "text", script)(Object.freeze(args), text); if (typeof value !== "string" || value.length > 1000000) throw new Error("必须返回长度不超过一百万的文字"); postMessage({ok:true,value}); } catch(error) { postMessage({ok:false,error:String(error.message || error)}); } };';
          const url = URL.createObjectURL(new Blob([code], {type:'text/javascript'}));
          const worker = new Worker(url);
          worker.onmessage = e => { port.postMessage(e.data); worker.terminate(); URL.revokeObjectURL(url); };
          worker.onerror = () => { port.postMessage({ok:false,error:'脚本语法或运行错误'}); worker.terminate(); URL.revokeObjectURL(url); };
          worker.postMessage(event.data);
        }, {once:true});
      <\/script>`;
      frame.onload = () => frame.contentWindow.postMessage({ script, args, text }, '*', [channel.port2]);
      document.body.appendChild(frame);
    });
  }
  function session(value, collections = window.state?.globalSettings?.customPromptCollections) {
    const config = validate(settings(value));
    const sourceCollections = clone(collections || {});
    const rules = new Map(config.rules.map(rule => [rule.name.trim().toLowerCase(), rule]));
    const find = name => name === 'random' ? { name, type: 'builtin', enabled: true } : rules.get(name);
    function isOmitted(nodes, scope) {
      return nodes.some(node => {
        const rule = find(node.name);
        if (!rule || rule.scopes?.[scope] === false) return false;
        return ((!config.enabled || rule.enabled === false) && (rule.offMode || config.offMode) === 'omit') || node.args?.some(parts => isOmitted(parts, scope));
      });
    }
    async function resolve(nodes, scope) {
      let output = '';
      for (const node of nodes) {
        if (own(node, 'text')) { output += node.text; continue; }
        const rule = find(node.name);
        if (!rule || !config.enabled || rule.enabled === false || rule.scopes?.[scope] === false) { output += node.raw; continue; }
        const args = [];
        for (const parts of node.args) args.push(unescape(await resolve(parts, scope)));
        const value = String(rule.value || '');
        let result;
        if (rule.type === 'builtin') result = args[Math.floor(Math.random() * args.length)] || '';
        else if (rule.type === 'fixed') result = value;
        else if (rule.type === 'random') {
          const choices = value.split(/\r?\n/).filter(Boolean);
          result = choices[Math.floor(Math.random() * choices.length)] || '';
        } else if (rule.type === 'template') result = value.replace(/\$\{(\d+)\}/g, (match, index) => args[Number(index) - 1] ?? '');
        else result = await runScript(value, args, node.raw);
        output += bounded(result);
        bounded(output);
      }
      return bounded(output);
    }
    async function render(text, scope) {
      text = String(text ?? '');
      if (!config.scopes[scope] || (!config.enabled && config.offMode === 'preserve')) return text;
      const nodes = parse(text);
      if (isOmitted(nodes, scope)) return '';
      return resolve(nodes, scope);
    }
    async function prompt(text, scope) {
      const collection = scope === 'summary' || scope === 'thoughts' ? sourceCollections[scope] : sourceCollections.chat?.[scope];
      const items = collection?.items;
      if (Array.isArray(items)) {
        const enabled = items.filter(item => item && item.enabled !== false && typeof item.content === 'string' && item.content.trim())
          .slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
        const combined = enabled.map((item, index) => `${index ? (item.separatorBefore ?? '\n\n') : ''}${item.content}`).join('');
        if (combined === text) {
          let output = '';
          for (const item of enabled) {
            const part = await render(item.content, 'prompts');
            if (part) output += (output ? item.separatorBefore ?? '\n\n' : '') + part;
          }
          return output;
        }
      }
      return render(text, 'prompts');
    }
    return { config, render, prompt };
  }
  window.PromptMacros = { settings, validate, parse, session, runScript };
})();
