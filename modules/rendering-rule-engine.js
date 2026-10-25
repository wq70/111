/* Shared by the renderer, preview and isolated worker. No chat data is modified. */
(function installRenderingRuleEngine(root) {
  'use strict';
  const MAX_OUTPUT = 1000000;
  const MAX_MATCHES = 10000;
  const compiled = new Map();
  let compiledBytes = 0;
  const MAX_COMPILED_BYTES = 2 * 1024 * 1024;
  const escapeRegex = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const htmlPattern = /<\/?[a-z][^>]*>/i;
  const ACTIONS = ['replace', 'delete', 'random', 'map', 'format', 'prefix', 'suffix', 'wrap', 'highlight', 'badge', 'note', 'fold', 'quote', 'card', 'table', 'mask', 'extract', 'html', 'exclude'];

  function fingerprint(rule) {
    return JSON.stringify([rule.regex ?? rule.findRegex, rule.template ?? rule.replaceString, rule.options || null]);
  }

  function hash(text) {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
  }

  // Parse only authored templates. Inserted captures never re-enter this parser.
  function parseTemplate(source, depth = 0, warnings = []) {
    if (depth > 12) throw new Error('随机表达式嵌套超过 12 层');
    const nodes = [];
    let literal = '';
    const flush = () => { if (literal) nodes.push({ text: literal }); literal = ''; };
    for (let i = 0; i < source.length;) {
      if (depth > 0 && source[i] === '\\' && /[\\{},:]/.test(source[i + 1] || '')) {
        literal += source[i + 1]; i += 2; continue;
      }
      const opener = /^\{\{\s*(random|pick)\s*(::|:)/i.exec(source.slice(i));
      if (!opener) {
        if (/^\{\{\s*(random|pick)\s*\}\}/i.test(source.slice(i))) throw new Error('随机表达式缺少候选项');
        if (source.startsWith('{{', i)) {
          const end = source.indexOf('}}', i + 2);
          if (end >= 0) {
            if (!/^\{\{\s*(?:char_name|char_remark|user_name|user_nickname|char_avatar|user_avatar)\s*\}\}$/.test(source.slice(i, end + 2))) warnings.push('包含未支持的宏，已按原文保留');
            literal += source.slice(i, end + 2); i = end + 2; continue;
          }
          if (/^\{\{\s*(random|pick)\b/i.test(source.slice(i))) throw new Error('随机表达式缺少候选项或结束标记');
        }
        literal += source[i++]; continue;
      }
      flush();
      const start = i + opener[0].length;
      const separator = opener[2] === '::' ? '::' : ',';
      let level = 0, cursor = start, partStart = start, closed = false;
      const choices = [];
      while (cursor < source.length) {
        if (source[cursor] === '\\') { cursor += 2; continue; }
        if (source.startsWith('{{', cursor)) { level++; cursor += 2; continue; }
        if (source.startsWith('}}', cursor)) {
          if (level) { level--; cursor += 2; continue; }
          choices.push(source.slice(partStart, cursor).trim());
          cursor += 2; closed = true; break;
        }
        if (!level && source.startsWith(separator, cursor)) {
          choices.push(source.slice(partStart, cursor).trim());
          cursor += separator.length; partStart = cursor; continue;
        }
        cursor++;
      }
      if (!closed) throw new Error('随机表达式缺少结束标记 }}');
      if (choices.length > 200) throw new Error('一个随机表达式最多包含 200 个候选项');
      if (choices.some(choice => !choice)) warnings.push('包含空候选项，选中时会删除匹配内容');
      nodes.push({ choices: choices.map(choice => parseTemplate(choice, depth + 1, warnings)), stable: opener[1].toLowerCase() === 'pick' });
      i = cursor;
    }
    flush();
    return nodes;
  }

  // ECMAScript replacement-string semantics, including two-digit fallback.
  function substitute(template, match, variables = {}, asHtml = false, escapeCaptures = asHtml) {
    const { whole, captures, index, input, groups } = match;
    const capture = (token, key) => {
      if (key === '$') return '$';
      if (key === '&') return whole;
      if (key === '`') return input.slice(0, index);
      if (key === "'") return input.slice(index + whole.length);
      if (key.startsWith('<')) return groups ? String(groups[key.slice(1, -1)] ?? '') : token;
      const number = Number(key);
      if (number > 0 && number <= captures.length) return String(captures[number - 1] ?? '');
      const first = Number(key[0]);
      if (key.length === 2 && first > 0 && first <= captures.length) return String(captures[first - 1] ?? '') + key[1];
      return token;
    };
    // 一次处理模板中的变量和捕获引用，插入的值不再作为 $1 或随机表达式执行。
    return template.replace(/\{\{\s*(char_name|char_remark|user_name|user_nickname|char_avatar|user_avatar)\s*\}\}|\$(\$|&|`|'|<[^>]*>|\d{1,2})/g, (token, variable, key, offset) => {
      if (variable) {
        if (!Object.prototype.hasOwnProperty.call(variables, variable)) return token;
        const value = String(variables[variable] ?? '');
        if (!asHtml) return value;
        // HTML 模板内的样式使用 CSS 转义，其余文字和属性使用 HTML 转义。
        const prefix = template.slice(0, offset);
        const inStyle = prefix.toLowerCase().lastIndexOf('<style') > prefix.toLowerCase().lastIndexOf('</style');
        const tagStart = prefix.lastIndexOf('<');
        const tagEnd = template.indexOf('>', offset);
        const tag = tagStart > prefix.lastIndexOf('>') && tagEnd >= 0 ? template.slice(tagStart, tagEnd + 1) : '';
        const attribute = [...tag.matchAll(/\s([^\s=<>]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/g)].find(attr => offset - tagStart >= attr.index && offset - tagStart < attr.index + attr[0].length);
        const inScript = prefix.toLowerCase().lastIndexOf('<script') > prefix.toLowerCase().lastIndexOf('</script');
        if (inScript || attribute && /^(?:on|srcdoc$)/i.test(attribute[1])) return token;
        const inStyleAttribute = [...tag.matchAll(/\bstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi)].some(attr => offset - tagStart >= attr.index && offset - tagStart < attr.index + attr[0].length);
        if (inStyle || inStyleAttribute) {
          const css = value.replace(/[^a-zA-Z0-9_\-\u0080-\uffff]/gu, char => `\\${char.codePointAt(0).toString(16)} `);
          return inStyleAttribute ? escapeHtml(css) : css;
        }
        return attribute ? escapeHtml(value).replace(/[\s=`]/g, char => `&#${char.codePointAt(0)};`) : escapeHtml(value);
      }
      const value = capture(token, key);
      return escapeCaptures && key !== '$' ? escapeHtml(value) : value;
    });
  }

  function parseCandidates(text) {
    return String(text ?? '').split('\n').map(line => {
      const weighted = /^\s*\[(\d+(?:\.\d+)?)\]\s?(.*)$/.exec(line);
      return { text: weighted ? weighted[2] : line, weight: weighted ? Number(weighted[1]) : 1 };
    });
  }

  function parseMappings(text) {
    const entries = String(text ?? '').split('\n').filter(line => line.trim()).map((line, i) => {
      const separator = line.includes('→') ? '→' : '=>';
      const at = line.indexOf(separator);
      if (at < 0 || !line.slice(0, at).trim()) throw new Error(`对照表第 ${i + 1} 行需要“来源 → 目标”`);
      return [line.slice(0, at).trim(), line.slice(at + separator.length).trim()];
    });
    if (!entries.length) throw new Error('请填写至少一条对照替换');
    if (new Set(entries.map(entry => entry[0])).size !== entries.length) throw new Error('对照表包含重复的来源词');
    return entries.sort((a, b) => b[0].length - a[0].length);
  }

  function compileRule(rule) {
    const key = fingerprint(rule);
    if (compiled.has(key)) return compiled.get(key).result;
    const options = rule.options || {};
    const mode = options.matchMode || 'regex';
    const action = options.action || 'replace';
    if (!ACTIONS.includes(action)) throw new Error('不支持的处理动作');
    if (options.maxMatches !== undefined && options.maxMatches !== '' && (!Number.isInteger(Number(options.maxMatches)) || Number(options.maxMatches) < 1)) throw new Error('最多处理次数必须是正整数');
    if (options.order !== undefined && !Number.isFinite(Number(options.order))) throw new Error('执行顺序必须是有限数字');
    let source = String(rule.regex ?? rule.findRegex ?? '');
    const warnings = [];
    let flags = options.flags ?? 'g';
    let mapping;
    if (action === 'map') {
      mapping = parseMappings(options.mapping);
      source = mapping.map(entry => escapeRegex(entry[0])).join('|');
    } else if (action === 'format') {
      source = '[\\s\\S]+';
    } else if (mode === 'text') {
      source = escapeRegex(source);
    } else if (mode === 'keywords' || mode === 'word') {
      const words = source.split('\n').map(word => word.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
      if (!words.length) throw new Error('请填写查找内容');
      source = `(?:${words.map(escapeRegex).join('|')})`;
      if (mode === 'word') { source = `(?<![\\p{L}\\p{N}_])${source}(?![\\p{L}\\p{N}_])`; flags += 'u'; }
    } else if (mode === 'line') {
      source = `^.*${escapeRegex(source)}.*(?:\\r?\\n|$)`;
      flags += 'm';
    } else if (mode === 'markers') {
      if (!options.startMarker || !options.endMarker) throw new Error('请填写起始标记和结束标记');
      source = `${escapeRegex(options.startMarker)}([\\s\\S]*?)${escapeRegex(options.endMarker)}`;
    } else if (mode === 'regex') {
      if (source.startsWith('/') && source.lastIndexOf('/') > 0) {
        const slash = source.lastIndexOf('/');
        flags = source.slice(slash + 1);
        try { new RegExp(source.slice(1, slash), flags); source = source.slice(1, slash); }
        catch (error) {
          if (rule.options && !options.legacySlashFallback) throw error;
          flags = 'g'; // Preserve legacy slash-pattern fallback.
        }
      }
    } else throw new Error('不支持的匹配方式');
    if (!source) throw new Error('查找内容不能为空');
    flags = [...new Set(flags)].join('');
    if (options.firstOnly) flags = flags.replace(/g/g, '');
    const regex = new RegExp(source, flags);
    const template = String(rule.template ?? rule.replaceString ?? '');
    const nodes = parseTemplate(template, 0, warnings);
    const alternative = parseTemplate(String(options.elseTemplate ?? ''), 0, warnings);
    const candidates = action === 'random' ? parseCandidates(options.candidates ?? template) : null;
    if (candidates && (candidates.length > 200 || candidates.some(item => !Number.isFinite(item.weight) || item.weight < 0) || candidates.every(item => item.weight <= 0))) throw new Error('候选项最多 200 条，权重须为非负有限数，且至少一项大于零');
    const candidateNodes = candidates?.map(item => parseTemplate(item.text, 0, warnings));
    const usesRandom = !!candidates || /\{\{\s*(random|pick)\s*:/i.test(template + (options.elseTemplate || ''));
    const result = { regex, nodes, alternative, options, action, mapping, candidates, candidateNodes, usesRandom, warnings: [...new Set(warnings)], source };
    // 新编译缓存同时限制配置键与表达式/模板字符容量，避免大型规则仅按条数累积。
    const bytes = 2 * (key.length + source.length + template.length + String(options.elseTemplate || '').length);
    if (bytes <= MAX_COMPILED_BYTES) {
      compiled.set(key, { result, bytes }); compiledBytes += bytes;
      while (compiled.size > 300 || compiledBytes > MAX_COMPILED_BYTES) {
        const oldest = compiled.keys().next().value;
        compiledBytes -= compiled.get(oldest).bytes;
        compiled.delete(oldest);
      }
    }
    return result;
  }

  function randomValue(seed) { return hash(seed) / 4294967296; }

  function choose(count, weights, context, token, forceStable = false) {
    const strategy = context.options.selection || 'independent';
    const matchNumber = strategy === 'message' ? 0 : context.matchNumber;
    const key = `${context.seed}\u0000${matchNumber}\u0000${token}`;
    const random = forceStable || context.options.randomMode !== 'reroll' ? randomValue(key) : Math.random();
    let choice;
    if (strategy === 'cycle') choice = (hash(context.seed + token) % count + matchNumber) % count;
    else {
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      let cursor = random * total;
      choice = weights.findIndex(weight => { cursor -= weight; return cursor < 0; });
      if (choice < 0) choice = count - 1;
      if (strategy === 'no-repeat' && count > 1 && context.previous.get(token) === choice) {
        const remaining = weights.map((weight, index) => index === choice ? 0 : weight);
        const remainingTotal = remaining.reduce((sum, weight) => sum + weight, 0);
        if (remainingTotal > 0) {
          let remainingCursor = randomValue(key + ':alternate') * remainingTotal;
          choice = remaining.findIndex(weight => { remainingCursor -= weight; return remainingCursor < 0; });
        }
      }
    }
    context.previous.set(token, choice);
    if (context.choices) context.choices.push(choice + 1);
    return choice;
  }

  function renderNodes(nodes, match, context, path = 't', asHtml = false) {
    const expand = (items, prefix) => items.map((node, index) => {
      if (!node.choices) return node.text;
      const token = `${prefix}.${index}`;
      const selected = choose(node.choices.length, node.choices.map(() => 1), context, token, node.stable);
      return expand(node.choices[selected], `${token}.${selected}`);
    }).join('');
    const authored = expand(nodes, path);
    const hasHtml = htmlPattern.test(authored);
    context.authoredHtml = context.authoredHtml || hasHtml;
    return substitute(authored, match, context.variables, asHtml || hasHtml);
  }

  function protectedRanges(text, options) {
    const ranges = [];
    const add = regex => { for (const match of text.matchAll(regex)) ranges.push([match.index, match.index + match[0].length]); };
    if (options.protectCode) add(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g);
    if (options.protectLinks) add(/https?:\/\/[^\s<>"']+/g);
    if (options.protectHtml) add(/<[^>]+>/g);
    if (options.protectStart && options.protectEnd) add(new RegExp(`${escapeRegex(options.protectStart)}[\\s\\S]*?${escapeRegex(options.protectEnd)}`, 'g'));
    return ranges;
  }

  function allowedRanges(text, region = 'all') {
    if (region === 'all') return [[0, text.length]];
    const dialogue = [...text.matchAll(/「[^」]*」|“[^”]*”|"[^"\n]*"/g)].map(match => [match.index, match.index + match[0].length]);
    if (region === 'dialogue') return dialogue;
    const description = [];
    let cursor = 0;
    for (const [start, end] of dialogue) { if (cursor < start) description.push([cursor, start]); cursor = end; }
    if (cursor < text.length) description.push([cursor, text.length]);
    return description;
  }

  function normalize(text, options) {
    const config = options.format || {};
    let output = text;
    if (config.newlines) output = output.replace(/\r\n?|\u2028|\u2029/g, '\n');
    if (config.trailingSpace) output = output.replace(/[\t ]+$/gm, '');
    if (config.spaces) output = output.replace(/[\t ]{2,}/g, ' ');
    if (config.blankLines) output = output.replace(/\n(?:[\t ]*\n){2,}/g, '\n\n');
    if (config.duplicateLines) {
      const seen = new Set();
      output = output.split('\n').filter(line => !line.trim() || !seen.has(line) && seen.add(line)).join('\n');
    }
    if (config.invisible) output = output.replace(/[\u200B-\u200D\uFEFF]/g, '');
    if (config.trim) output = output.trim();
    if (config.punctuation === 'full') output = output.replace(/[,;:!?]/g, char => ({ ',': '，', ';': '；', ':': '：', '!': '！', '?': '？' }[char]));
    if (config.punctuation === 'half') output = output.replace(/[，；：！？]/g, char => ({ '，': ',', '；': ';', '：': ':', '！': '!', '？': '?' }[char]));
    if (config.indent || config.listPrefix) output = output.split('\n').map(line => line.trim() ? `${config.indent || ''}${config.listPrefix || ''}${line}` : line).join('\n');
    return output;
  }

  function normalizeProtected(text, options) {
    const ranges = protectedRanges(text, options).sort((a, b) => a[0] - b[0]);
    let cursor = 0, output = '';
    const segmentOptions = { ...options, format: { ...options.format, trim: false } };
    for (const [start, end] of ranges) {
      if (start < cursor) continue;
      output += normalize(text.slice(cursor, start), segmentOptions) + text.slice(start, end); cursor = end;
    }
    output += normalize(text.slice(cursor), segmentOptions);
    return options.format?.trim ? output.trim() : output;
  }

  function applicable(rule, chatId, meta, stage) {
    if (!rule.isEnabled) return '规则已关闭';
    const scope = Array.isArray(rule.chatId) ? rule.chatId : [rule.chatId];
    if (!scope.includes('global') && !scope.includes(chatId)) return '聊天范围不符';
    const options = rule.options || {};
    const stages = options.stages || ['display'];
    if (stage === 'context' ? !(rule.doNotSend || stages.includes('context')) : !stages.includes(stage)) return '处理阶段不符';
    if (options.roles?.length && !options.roles.includes(meta.role || 'assistant')) return '消息来源不符';
    if (options.types?.length && !options.types.includes(meta.type || 'text')) return '内容类型不符';
    if (options.fields?.length && !options.fields.includes(meta.field || 'content')) return '文本字段不符';
    if (options.chatKind && (meta.isGroup ? 'group' : 'single') !== options.chatKind) return '聊天类型不符';
    if (options.after && (!meta.timestamp || Number(meta.timestamp) < Number(options.after))) return '消息时间不符';
    return '';
  }

  function colorStyle(options) {
    const color = /^#[\da-f]{3,8}$/i.test(options.color || '') ? options.color : 'var(--accent-color, #007aff)';
    const size = Math.max(10, Math.min(20, Number(options.fontSize) || 14));
    const radius = Math.max(0, Math.min(20, Number(options.radius) || 6));
    return `--rr-color:${color};font-size:${size}px;border-radius:${radius}px`;
  }

  function executeRule(input, rule, chatId, meta = {}, stage = 'display', preview = false) {
    const reason = applicable(rule, chatId, meta, stage);
    if (reason) return { content: input, isHtml: false, matched: 0, reason, warnings: [] };
    const spec = compileRule(rule);
    const options = spec.options;
    if (!rule.options && !spec.usesRandom) {
      spec.regex.lastIndex = 0;
      const matched = spec.regex.test(input) ? 1 : 0;
      spec.regex.lastIndex = 0;
      const template = String(rule.template ?? rule.replaceString ?? '');
      const hasVariables = /\{\{\s*(?:char_name|char_remark|user_name|user_nickname|char_avatar|user_avatar)\s*\}\}/.test(template);
      const replacement = stage === 'context' && rule.doNotSend ? '' : template;
      const content = hasVariables && replacement ? input.replace(spec.regex, (...args) => {
        const groups = typeof args[args.length - 1] === 'object' ? args.pop() : undefined;
        return substitute(replacement, { whole: args[0], captures: args.slice(1, -2), index: args[args.length - 2], input, groups }, meta.appearanceVariables, htmlPattern.test(template), false);
      }) : input.replace(spec.regex, replacement);
      return { content, matched, isHtml: stage === 'display' && content !== input && htmlPattern.test(String(rule.template ?? rule.replaceString ?? '')), warnings: [] };
    }
    const condition = options.condition || {};
    const conditionPassed = (!condition.contains || input.includes(condition.contains)) && (!condition.excludes || !input.includes(condition.excludes)) && (!condition.minLength || input.length >= Number(condition.minLength));
    if (!conditionPassed && !condition.useElse) return { content: input, isHtml: false, matched: 0, reason: '条件不满足', warnings: spec.warnings };
    let count = 0, matched = 0, isHtml = false, excluded = false;
    const selections = [];
    const protect = spec.action === 'format' ? [] : protectedRanges(input, options);
    const allowed = allowedRanges(input, options.region);
    const seedOptions = { matchMode: options.matchMode || 'regex', flags: options.flags ?? 'g', action: options.action || 'replace', selection: options.selection || 'independent', randomMode: options.randomMode || 'stable', ...(spec.action === 'random' ? { candidates: options.candidates ?? rule.template } : {}), ...(options.matchMode === 'markers' ? { startMarker: options.startMarker, endMarker: options.endMarker } : {}) };
    const seed = JSON.stringify([chatId, meta.messageId ?? meta.timestamp ?? input, meta.field || 'content', meta.fieldKey || '', input, rule.regex ?? rule.findRegex, rule.template ?? rule.replaceString, seedOptions, meta.previewNonce || 0]);
    const context = { seed, options, previous: new Map(), matchNumber: 0, choices: preview ? selections : null, variables: meta.appearanceVariables };
    let changedParts = 0;
    const pieces = [];
    const replaceSegment = (segment, baseOffset = 0) => {
      spec.regex.lastIndex = 0;
      return segment.replace(spec.regex, (...args) => {
        const groups = typeof args[args.length - 1] === 'object' ? args.pop() : undefined;
        const localIndex = args[args.length - 2];
        const whole = args[0];
        const index = localIndex + baseOffset;
        const end = index + whole.length;
        if (protect.some(([start, stop]) => whole.length ? index < stop && end > start : index >= start && index < stop)) return whole;
        if (!allowed.some(([start, stop]) => index >= start && end <= stop)) return whole;
        if (matched >= (options.maxMatches ? Math.min(MAX_MATCHES, Number(options.maxMatches)) : MAX_MATCHES)) return whole;
        if (++count > MAX_MATCHES) throw new Error('匹配次数超过限制');
        const match = { whole, captures: args.slice(1, -2), index, input, groups };
        context.matchNumber = matched++;
        context.authoredHtml = false;
        const nodes = conditionPassed ? spec.nodes : spec.alternative;
        const render = (html = false) => renderNodes(nodes, match, context, 't', html);
        const action = stage === 'context' && rule.doNotSend ? 'delete' : !conditionPassed ? 'replace' : spec.action;
        let output;
        if (action === 'delete') output = '';
        else if (action === 'exclude') { excluded = true; output = whole; }
        else if (action === 'map') {
          const mapped = spec.mapping.find(entry => options.flags?.includes('i') ? entry[0].toLowerCase() === whole.toLowerCase() : entry[0] === whole);
          output = mapped ? mapped[1] : whole;
          context.authoredHtml = !!mapped && htmlPattern.test(mapped[1]);
        } else if (action === 'format') output = normalizeProtected(whole, options);
        else if (action === 'random') {
          const selected = choose(spec.candidates.length, spec.candidates.map(item => item.weight), context, 'c');
          output = renderNodes(spec.candidateNodes[selected], match, context, `c.${selected}`);
        } else if (action === 'prefix') { const prefix = render(); output = prefix + (context.authoredHtml ? escapeHtml(whole) : whole); }
        else if (action === 'suffix') { const suffix = render(); output = (context.authoredHtml ? escapeHtml(whole) : whole) + suffix; }
        else if (action === 'wrap') {
          const prefix = render(), suffix = String(options.suffix || '');
          context.authoredHtml = context.authoredHtml || htmlPattern.test(suffix);
          output = prefix + (context.authoredHtml ? escapeHtml(whole) : whole) + substitute(suffix, match, context.variables, context.authoredHtml);
        }
        else if (action === 'extract') output = render() || String(match.captures[0] ?? whole);
        else if (action === 'mask') {
          const masked = String(options.maskText || '•••');
          output = stage === 'display' && options.reveal ? `<details class="rr-mask"><summary>${escapeHtml(masked)}</summary>${escapeHtml(whole)}</details>` : masked;
        } else if (['highlight', 'badge', 'note', 'fold', 'quote', 'card', 'table'].includes(action)) {
          const content = render() || (options.matchMode === 'markers' ? String(match.captures[0] ?? whole) : whole);
          const safe = escapeHtml(content).replace(/\n/g, '<br>');
          const title = escapeHtml(options.title || '查看内容');
          if (stage !== 'display') output = content;
          else if (action === 'highlight') output = `<mark class="rr-highlight" style="${colorStyle(options)}">${safe}</mark>`;
          else if (action === 'badge') output = `<span class="rr-badge" style="${colorStyle(options)}">${safe}</span>`;
          else if (action === 'fold') output = `<details class="rr-fold"><summary>${title}</summary><div>${safe}</div></details>`;
          else if (action === 'quote') output = `<blockquote class="rr-quote">${safe}</blockquote>`;
          else if (action === 'card' || action === 'table') {
            const rows = content.split('\n').map(line => {
              const parts = /^([^：:]+)[：:](.*)$/.exec(line);
              return parts ? [parts[1], parts[2]] : ['', line];
            });
            output = action === 'table' ? `<div class="rr-table-wrap"><table class="rr-table"><tbody>${rows.map(row => `<tr><th>${escapeHtml(row[0])}</th><td>${escapeHtml(row[1])}</td></tr>`).join('')}</tbody></table></div>` : `<dl class="rr-card">${rows.map(row => `<dt>${escapeHtml(row[0])}</dt><dd>${escapeHtml(row[1])}</dd>`).join('')}</dl>`;
          } else output = `<aside class="rr-note" style="${colorStyle(options)}">${safe}</aside>`;
        } else if (action === 'html') output = render(true);
        else output = render();
        const outputIsHtml = stage === 'display' && (context.authoredHtml || ['highlight', 'badge', 'note', 'fold', 'quote', 'card', 'table'].includes(action) || action === 'mask' && options.reveal) && htmlPattern.test(output);
        if (output !== whole) {
          changedParts += output.length;
          if (changedParts > MAX_OUTPUT) throw new Error('替换结果超过长度限制');
          if (outputIsHtml) isHtml = true;
        }
        pieces.push({ index, end, output, html: outputIsHtml });
        return output;
      });
    };
    let content;
    if (spec.action === 'format' && options.region && options.region !== 'all') {
      let cursor = 0; content = '';
      for (const [start, end] of allowed) { content += input.slice(cursor, start) + replaceSegment(input.slice(start, end), start); cursor = end; }
      content += input.slice(cursor);
    } else content = replaceSegment(input);
    if (content.length > MAX_OUTPUT) throw new Error('替换结果超过长度限制');
    if (isHtml && !meta._htmlInput) {
      let cursor = 0; content = '';
      for (const part of pieces) {
        content += escapeHtml(input.slice(cursor, part.index)) + (part.html ? part.output : escapeHtml(part.output));
        cursor = part.end;
      }
      content += escapeHtml(input.slice(cursor));
    }
    if (excluded) content = '';
    return { content, isHtml, matched, excluded, warnings: spec.warnings, selections };
  }

  function run(input, rules, chatId, meta = {}, stage = 'display', preview = false, beforeRule) {
    let content = input, isHtml = false, excluded = false, inlineOnly = true;
    const trace = [], warnings = [], stoppedGroups = new Set();
    const sorted = rules.map((rule, index) => ({ rule, index })).sort((a, b) => (a.rule.executionOrder ?? a.rule.options?.order ?? a.index) - (b.rule.executionOrder ?? b.rule.options?.order ?? b.index));
    for (const { rule, index } of sorted) {
      if (stoppedGroups.has(rule.options?.group || '')) { if (preview) trace.push({ name: rule.name, matched: 0, reason: '规则组已停止' }); continue; }
      if (beforeRule) beforeRule(index);
      try {
        const before = content;
        const result = executeRule(content, rule, chatId, { ...meta, _htmlInput: isHtml }, stage, preview);
        content = result.content;
        isHtml = isHtml || result.isHtml;
        if (result.isHtml && !['highlight', 'badge'].includes(rule.options?.action)) inlineOnly = false;
        excluded = excluded || !!result.excluded;
        warnings.push(...result.warnings.map(warning => `${rule.name || '规则'}：${warning}`));
        if (preview) trace.push({ name: rule.name, matched: result.matched, reason: result.reason || (result.matched ? '已匹配' : '未匹配'), before, after: content, selections: result.selections || [] });
        if (result.matched && rule.options?.stop === 'group') stoppedGroups.add(rule.options.group || '');
        if (excluded || result.matched && rule.options?.stop === 'stage') break;
      } catch (error) {
        warnings.push(`${rule.name || '规则'}：${error.message}`);
        if (preview) trace.push({ name: rule.name, matched: 0, reason: error.message, error: true });
      }
    }
    return { content, isHtml, excluded, inlineOnly: isHtml && inlineOnly, trace, warnings: [...new Set(warnings)] };
  }

  const api = { compileRule, parseTemplate, parseCandidates, parseMappings, fingerprint, substitute, executeRule, run, escapeHtml, applicable };
  // A self-contained trusted worker bootstrap also supports pages opened via file://.
  api.workerSource = `(${installRenderingRuleEngine.toString()})(self);self.onmessage = event => {
    const { id, input, rules, chatId, meta, stage, preview } = event.data;
    try {
      const result = self.RenderingRuleEngine.run(input, rules, chatId, meta, stage, preview, index => self.postMessage({ id, running: index }));
      self.postMessage({ id, result });
    } catch (error) { self.postMessage({ id, error: error.message }); }
  };`;
  root.RenderingRuleEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
