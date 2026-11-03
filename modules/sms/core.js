/* 信息应用：号码、消息与记忆独立保存；跨渠道参考按请求时的设置读取。 */
(function () {
  'use strict';
  const DEFAULT_PROMPT = '像一个正在使用手机发信息的真实人物，以你的人设、关系和当下情境回应。可以简短、分条、晚回或不回，不要每次都写动作和心理描写，不替用户说话。已有矛盾不会因换到短信自动消失；是否交换号码或 QQ 由人物自己决定。';
  const DEFAULTS = { id: 'main', enabled: false, number: '', displayName: '', avatar: '', autoReply: false, contextLimit: 30, qqContextLimit: 12,
    bridge: 'both', memoryMode: 'shared', writeMemory: true, readReceipts: true, autoSummary: false, summaryEvery: 40,
    customPrompt: '', promptMode: 'append', strangerPrompt: '', summaryPrompt: '', proactive: false, randomStrangers: false,
    intervalMinutes: 180, dailyLimit: 2, quietStart: '23:00', quietEnd: '08:00', apiSource: 'chat', apiConfig: null };
  const TABLES = ['smsSettings', 'smsContacts', 'smsMessages', 'smsMemories', 'smsJobs'];
  const text = v => String(v ?? '').trim();
  const clone = v => JSON.parse(JSON.stringify(v));
  const uid = prefix => `${prefix}_${window.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)}`;
  const clamp = (v, a, b, fallback = a) => Math.min(b, Math.max(a, Number.isFinite(Number(v)) ? Number(v) : fallback));
  const channel = typeof window.BroadcastChannel === 'function' ? new window.BroadcastChannel('ephone-sms-updates') : null;
  const notify = () => { window.dispatchEvent?.(new CustomEvent('sms:change')); channel?.postMessage('changed'); };
  if (channel) channel.onmessage = () => window.dispatchEvent?.(new CustomEvent('sms:change'));
  const role = c => c?.chatId ? state.chats[c.chatId] : null;
  const nameOf = c => c.saved ? text(c.remark || role(c)?.name || c.name) || c.number : c.number;
  const incomingAllowed = o => ['both', 'qq-to-sms'].includes(o.bridge);
  const outgoingAllowed = o => ['both', 'sms-to-qq'].includes(o.bridge);
  const visibleText = m => text(typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.filter(p => p.type === 'text').map(p => p.text).join('\n') : '') || (m.image ? '[照片]' : '[消息]');
  const memoriesOf = id => db.smsMemories.where('contactId').equals(id).sortBy('createdAt');
  const messagesOf = id => db.smsMessages.where('contactId').equals(id).sortBy('timestamp');
  async function getSettings() { return normalize({ ...DEFAULTS, ...(await db.smsSettings.get('main') || {}) }); }
  function normalize(o) {
    o.contextLimit = Math.round(clamp(o.contextLimit, 1, 200, 30)); o.qqContextLimit = Math.round(clamp(o.qqContextLimit, 0, 100, 12));
    o.summaryEvery = Math.round(clamp(o.summaryEvery, 10, 500, 40)); o.intervalMinutes = clamp(o.intervalMinutes, 30, 10080, 180); o.dailyLimit = Math.round(clamp(o.dailyLimit, 0, 10, 2));
    if (!['both', 'qq-to-sms', 'sms-to-qq', 'none'].includes(o.bridge)) o.bridge = 'both';
    if (!['shared', 'independent', 'off'].includes(o.memoryMode)) o.memoryMode = 'shared';
    if (!['chat', 'global', 'custom'].includes(o.apiSource)) o.apiSource = 'chat';
    if (!['append', 'replace'].includes(o.promptMode)) o.promptMode = 'append';
    for (const key of ['enabled','autoReply','writeMemory','readReceipts','autoSummary','proactive','randomStrangers']) o[key] = o[key] === true;
    for (const key of ['customPrompt','strangerPrompt','summaryPrompt']) o[key] = text(o[key]).slice(0, 30000);
    return o;
  }
  async function options(c) { const s = await getSettings(); return normalize({ ...s, ...(c.options || {}), enabled: s.enabled && c.enabled !== false }); }
  async function newNumber() {
    const own = (await getSettings()).number;
    for (let i = 0; i < 30; i++) { const n = '1' + String(3000000000 + Math.floor(Math.random() * 6999999999)); if (n !== own && !await db.smsContacts.where('number').equals(n).first()) return n; }
    throw new Error('号码生成失败，请重试。');
  }
  async function saveSettings(patch) {
    const s = normalize({ ...await getSettings(), ...patch, id: 'main' });
    if (!s.number) s.number = await newNumber();
    if (!/^1\d{10}$/.test(s.number) || await db.smsContacts.where('number').equals(s.number).first()) throw new Error('请使用未被联系人占用的 11 位虚拟号码。');
    await db.smsSettings.put(s); notify(); return s;
  }
  async function contactForChat(chatId, known = false) {
    const chat = state.chats[chatId]; if (!chat || chat.isGroup) throw new Error('请选择有效的单聊角色。');
    const key = `chat:${chatId}`; let c = await db.smsContacts.where('chatId').equals(chatId).first() || await db.smsContacts.get(key);
    if (!c) {
      c = { id: key, chatId, number: await newNumber(), name: chat.originalName || chat.name, known: false, saved: false, createdAt: Date.now(), updatedAt: Date.now(), options: {}, draft: '', unread: 0 };
      try { await db.smsContacts.add(c); } catch (e) { const existing = await db.smsContacts.get(key); if (!existing) throw e; c = existing; }
    }
    if (known && !c.known) { await db.smsContacts.update(c.id, { known: true }); c.known = true; }
    return c;
  }
  async function patchContact(id, patch) { await db.smsContacts.update(id, patch); notify(); return db.smsContacts.get(id); }
  async function addMessage(contactId, data) {
    const now = Date.now(); const row = { id: uid('sms'), contactId, timestamp: now, direction: 'incoming', content: '', ...data };
    await db.transaction('rw', db.smsContacts, db.smsMessages, async () => {
      const c = await db.smsContacts.get(contactId); if (!c) throw new Error('联系人已删除。');
      const all = await messagesOf(contactId); row.timestamp = Math.max(now, (all.at(-1)?.timestamp || 0) + 1);
      await db.smsMessages.add(row);
      await db.smsContacts.update(contactId, { updatedAt: row.timestamp, unread: (c.unread || 0) + (row.direction === 'incoming' ? 1 : 0), lastPreview: row.content || '[照片]',
        ...(row.direction === 'outgoing' ? { draft: '', draftImage: '', draftQuote: '' } : {}) });
    }); notify(); return row;
  }
  async function send(contactId, content, image = '', quoteId = '') {
    const c = await db.smsContacts.get(contactId); if (!c || !c.known) throw new Error('请先获得这个号码。');
    if (!(await options(c)).enabled) throw new Error('请先开启信息功能。');
    content = text(content).slice(0, 12000); if (!content && !image) throw new Error('请填写信息或添加照片。');
    if (image && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) throw new Error('照片格式无效。');
    if (image.length > 2200000) throw new Error('照片过大，请选择较小的图片。');
    if (quoteId && (await db.smsMessages.get(quoteId))?.contactId !== contactId) quoteId = '';
    const m = await addMessage(contactId, { direction: 'outgoing', content, image, quoteId, status: 'sent', handled: false });
    return m;
  }
  function expandPrompt(value, c, s) { const values = { '角色名': role(c)?.originalName || c.name, '用户': s.displayName || role(c)?.settings?.myNickname || state.qzoneSettings?.nickname || '我', '号码': c.number, '我的号码': s.number, '时间': new Date().toLocaleString('zh-CN') }; return text(value).replace(/\{\{([^{}]+)\}\}/g, (all, key) => values[key] ?? all); }
  async function buildContext(c, cfg, rows) {
    const chat = role(c); let qq = [], existing = '';
    if (chat && incomingAllowed(cfg)) {
      qq = (chat.history || []).filter(m => !m.isHidden && !m.isExcluded && m.type !== 'thought_chain_block').slice(-cfg.qqContextLimit || (cfg.qqContextLimit === 0 ? Infinity : -12));
      if (cfg.qqContextLimit === 0) qq = [];
      if (cfg.memoryMode === 'shared') existing = typeof getMemoryContextForPromptAsync === 'function' ? await getMemoryContextForPromptAsync(chat, { queryText: rows.slice(-3).map(visibleText).join('\n') }) : '';
    }
    const own = cfg.memoryMode === 'off' ? [] : await memoriesOf(c.id);
    return { identity: { name: chat?.originalName || c.name, persona: chat?.settings?.aiPersona || c.persona || '', encounter: c.scenario || '', userPersona: chat?.settings?.myPersona || '', userName: cfg.displayName || chat?.settings?.myNickname || state.qzoneSettings?.nickname || '我' },
      relationship: { description: c.relationship || '刚开始通过信息联系', qqStatus: chat && incomingAllowed(cfg) ? chat.relationship?.status : undefined, numberExchanged: c.known, userNumberKnown: c.userNumberKnown !== false },
      qq: qq.map(m => ({ sender: m.role === 'user' ? '用户' : chat.originalName || chat.name, text: visibleText(m), time: m.timestamp })),
      roleMemories: text(existing).slice(0, 24000), smsMemories: own.slice(-50).map(m => ({ id: m.id, content: m.content })),
      sms: rows.slice(-cfg.contextLimit).map(m => ({ id: m.id, sender: m.direction === 'outgoing' ? '用户' : '角色', text: m.content, photo: !!m.image, quoteId: m.quoteId || undefined, reaction: m.reaction || undefined, time: m.timestamp })) };
  }
  function apiConfig(c, cfg) {
    const base = state.apiConfig || {}, chat = role(c);
    const over = cfg.apiSource === 'custom' ? cfg.apiConfig || {} : cfg.apiSource === 'chat' && chat?.apiOverride?.enabled ? chat.apiOverride : {};
    const out = cfg.apiSource === 'custom' ? { ...over } : { proxyUrl: over.proxyUrl || base.proxyUrl, apiKey: over.apiKey || base.apiKey, model: over.model || base.model };
    if (!out.proxyUrl || !out.model || !out.apiKey) throw new Error('请先在 API 设置中填写地址、密钥和模型，或为信息单独配置。');
    return out;
  }
  async function request(c, cfg, system, user, signal, photos = []) {
    const conf = apiConfig(c, cfg); const content = photos.length ? [{ type: 'text', text: user }, ...photos.slice(-3).map(url => ({ type: 'image_url', image_url: { url } }))] : user;
    const messages = [{ role: 'user', content }];
    const gemini = /generativelanguage\.googleapis\.com/.test(conf.proxyUrl);
    const req = gemini ? toGeminiRequestData(conf.model, conf.apiKey, system, messages) : {
      url: `${conf.proxyUrl.replace(/\/+$/, '').replace(/(?:\/v1)?\/chat\/completions$/, '').replace(/\/v1$/, '')}/v1/chat/completions`,
      data: { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conf.apiKey}` }, body: JSON.stringify({ model: conf.model, messages: [{ role: 'system', content: system }, ...messages], stream: false, temperature: state.globalSettings?.apiTemperature ?? .85,
        ...(state.globalSettings?.apiMaxTokensEnabled ? { max_tokens: state.globalSettings.apiMaxTokens } : {}) }) } };
    const response = await fetch(req.url, { ...req.data, signal });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error?.message || `API 请求失败（${response.status}）`); }
    const data = await response.json(); const result = typeof getGeminiResponseText === 'function' ? getGeminiResponseText(data) : data.choices?.[0]?.message?.content;
    if (!text(result)) throw new Error('模型返回空内容，请重试。'); return text(result);
  }
  function parse(raw) {
    const code = text(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { const out = JSON.parse(code.slice(code.indexOf('{'), code.lastIndexOf('}') + 1)); if (!out || Array.isArray(out)) throw Error(); return out; }
    catch (_) { throw new Error('回复格式无法解析，原消息保留，可重试或调整提示词。'); }
  }
  async function withLease(id, operation, lockKey = 'lease') {
    const lease = { id: uid('request'), until: Date.now() + 600000 };
    await db.transaction('rw', db.smsContacts, async () => { const c = await db.smsContacts.get(id); if (!c) throw new Error('联系人不存在。'); if (c[lockKey]?.until > Date.now()) throw new Error('此会话正在处理，请等待或停止。'); await db.smsContacts.update(id, { [lockKey]: lease }); });
    try { return await operation(lease); }
    finally { await db.transaction('rw', db.smsContacts, async () => { const c = await db.smsContacts.get(id); if (c?.[lockKey]?.id === lease.id) await db.smsContacts.update(id, { [lockKey]: null }); }); }
  }
  async function reply(contactId, { signal, guidance = '', regenerate = false, proactive = false } = {}) {
    return withLease(contactId, async lease => {
      const c = await db.smsContacts.get(contactId), cfg = await options(c);
      if (!cfg.enabled) throw new Error('信息功能已关闭。');
      if (c.blocked) throw new Error('你已阻止此联系人的新来信，请先取消阻止。');
      if (c.blockedByContact && !regenerate) { return { action: 'undelivered' }; }
      let rows = (await messagesOf(contactId)).filter(m => !m.superseded); const pending = rows.filter(m => m.direction === 'outgoing' && !m.handled);
      const lastIncoming = [...rows].reverse().find(m => m.direction === 'incoming');
      if (regenerate && (!lastIncoming || rows.at(-1)?.direction !== 'incoming')) throw new Error('仅能重生成最后一轮来信，请先处理新的消息。');
      if (!pending.length && !regenerate && !proactive) throw new Error('没有待回复的信息。先发送消息，或选择让角色主动说话。');
      if (proactive && !cfg.proactive) throw new Error('请先开启允许角色主动发信。');
      if (regenerate) rows = rows.filter(m => m.batchId !== lastIncoming.batchId || m.direction !== 'incoming');
      const context = await buildContext(c, cfg, rows);
      const prompt = expandPrompt(cfg.customPrompt, c, cfg);
      const system = `${cfg.promptMode === 'replace' && prompt ? prompt : DEFAULT_PROMPT + (prompt ? '\n用户的短信风格要求：\n' + prompt : '')}\n你只扮演当前联系人，不能读取未提供的其他人的聊天。不把号码当现实电话号码。只输出 JSON：{"action":"reply|defer|ignore|block|unblock","read":true,"delayMinutes":0,"messages":[{"text":"短信正文","quoteId":"可选，引用已有消息id","reaction":"可选，♥/👍/👎/哈哈/!!/?"}],"relationship":"简短关系现状","offerQQ":false}。reply 立即来信；defer 将完整回复安排在稍后，delayMinutes 为1至1440；ignore 可以看了不回，messages为空；block 表示本号码拒收后续信息；unblock解除本号码的阻止。决定符合人物而非总是顺从，不自动改变QQ关系。offerQQ 只表示提出交换，是否添加由用户确认。正文不要包含协议或内部决策。\n${text(guidance) ? '本次额外要求：' + text(guidance).slice(0, 4000) : ''}`;
      try {
        const out = parse(await request(c, cfg, system, `${proactive ? '你主动发起这次联系。' : regenerate ? '重新表达最后一轮，避免重复原话。' : '处理尚未回复的信息。'}\n当前时间：${new Date().toLocaleString('zh-CN')}\n材料：${JSON.stringify(context)}`, signal, rows.slice(-cfg.contextLimit).filter(m => m.direction === 'outgoing' && m.image).map(m => m.image)));
        if (signal?.aborted) throw new DOMException('已停止', 'AbortError');
        const allowed = ['reply','defer','ignore','block','unblock']; if (!allowed.includes(out.action)) throw new Error('模型未返回有效的回复决定，请重试。');
        const parts = (Array.isArray(out.messages) ? out.messages : []).slice(0, 8).map(m => ({ text: text(typeof m === 'string' ? m : m.text).slice(0, 8000), quoteId: rows.some(r => r.id === m.quoteId) ? m.quoteId : '', reaction: ['♥','👍','👎','哈哈','!!','?'].includes(m.reaction) ? m.reaction : '' })).filter(m => m.text || (m.reaction && m.quoteId));
        if (['reply','defer','unblock'].includes(out.action) && !parts.length) throw new Error('回复正文为空，原消息保留，请重试。');
        if (regenerate && !['reply','defer','unblock'].includes(out.action)) throw new Error('这次没有生成新的回复，原回复已保留。');
        await db.transaction('rw', db.smsSettings, db.smsContacts, db.smsMessages, db.smsJobs, async () => {
          const fresh = await db.smsContacts.get(contactId), nowCfg = await options(fresh);
          if (fresh.lease?.id !== lease.id || !nowCfg.enabled || fresh.blocked || signal?.aborted) throw new Error('状态已改变，本次结果未写入。');
          if (regenerate) {
            const currentRows = await messagesOf(contactId);
            if (currentRows.at(-1)?.id !== lastIncoming.id) throw new Error('会话已有新消息，旧回复保持不变。');
            for (const m of currentRows.filter(m => m.batchId === lastIncoming.batchId && m.direction === 'incoming')) await db.smsMessages.update(m.id, { superseded: true });
          }
          for (const m of pending) await db.smsMessages.update(m.id, { handled: true, status: cfg.readReceipts && out.read === true ? 'read' : 'delivered' });
          await db.smsContacts.update(contactId, { lastError: '', relationship: text(out.relationship).slice(0, 500) || c.relationship || '', qqOffered: out.offerQQ === true || c.qqOffered || false,
            blockedByContact: out.action === 'block' ? true : out.action === 'unblock' ? false : !!c.blockedByContact, lastDecision: out.action, lastDecisionAt: Date.now() });
          if (out.action !== 'ignore' && out.action !== 'block') await db.smsJobs.add({ id: lease.id, contactId, status: 'pending', kind: 'deliver', dueAt: Date.now() + (out.action === 'defer' ? clamp(out.delayMinutes, 1, 1440, 5) * 60000 : 0), parts, batchId: lease.id });
        });
        await deliverDue(); notify(); return { action: out.action };
      } catch (e) { const fresh = await db.smsContacts.get(contactId); if (fresh?.lease?.id === lease.id) await db.smsContacts.update(contactId, { lastError: e.name === 'AbortError' ? '已停止，可以再次点击 API 回复。' : e.message }); notify(); throw e; }
    });
  }
  async function deliverDue() {
    const s = await getSettings(); if (!s.enabled) return;
    const jobs = await db.smsJobs.where('status').equals('pending').toArray(); let changed = false;
    for (const job of jobs.filter(j => j.kind === 'deliver' && j.dueAt <= Date.now()).slice(0, 20)) {
      await db.transaction('rw', db.smsSettings, db.smsJobs, db.smsContacts, db.smsMessages, async () => {
        const current = await db.smsJobs.get(job.id), c = await db.smsContacts.get(job.contactId); if (current?.status !== 'pending') return;
        if (!c || c.blocked) { await db.smsJobs.update(job.id, { status: 'cancelled' }); return; }
        if (!(await options(c)).enabled) return;
        let stamp = Math.max(Date.now(), ((await messagesOf(c.id)).at(-1)?.timestamp || 0) + 1), unread = c.unread || 0, preview = '';
        for (const [i, part] of job.parts.entries()) {
          if (part.reaction && part.quoteId) { const target = await db.smsMessages.get(part.quoteId); if (target?.contactId === c.id) await db.smsMessages.update(target.id, { incomingReaction: part.reaction }); }
          if (!part.text) continue;
          await db.smsMessages.put({ id: `${job.id}:${i}`, contactId: c.id, direction: 'incoming', content: part.text, quoteId: part.quoteId, timestamp: stamp++, batchId: job.batchId, status: 'delivered' }); unread++; preview = part.text;
        }
        await db.smsContacts.update(c.id, { unread, updatedAt: stamp, lastPreview: preview || c.lastPreview });
        await db.smsJobs.update(job.id, { status: 'done', deliveredAt: Date.now() });
        changed = true;
      });
    } if (changed) notify();
  }
  async function summarize(contactId, { signal, from = 0, to = Infinity } = {}) {
    return withLease(contactId, async lease => {
      const c = await db.smsContacts.get(contactId), cfg = await options(c); if (!cfg.enabled || cfg.memoryMode === 'off') throw new Error('请先开启信息和长期记忆。');
      const rows = (await messagesOf(contactId)).filter(m => !m.superseded && m.timestamp >= from && m.timestamp <= to);
      const existing = await memoriesOf(contactId), used = new Set(existing.flatMap(m => m.sourceIds || []));
      const fresh = rows.filter(m => !used.has(m.id)); if (!fresh.length) throw new Error('选定消息已整理过，或没有可总结的消息。');
      const result = await request(c, cfg, `提取值得长期记住的事实、约定、关系变化与未决事项，不虚构，不重复现有记忆。仅返回JSON：{"memories":["简洁具体的记忆"]}。${expandPrompt(cfg.summaryPrompt, c, cfg)}`, JSON.stringify({ person: c.name, existing: existing.slice(-30).map(m => m.content), messages: fresh.slice(-300).map(m => ({ id: m.id, sender: m.direction, text: visibleText(m), time: m.timestamp })) }), signal);
      const arr = parse(result).memories; if (!Array.isArray(arr)) throw new Error('记忆格式无效。');
      if (signal?.aborted) throw new DOMException('已停止', 'AbortError');
      const content = arr.map(text).filter(Boolean).slice(0, 20); if (!content.length) throw new Error('未提取到记忆。');
      await db.transaction('rw', db.smsSettings, db.smsContacts, db.smsMemories, async () => {
        const current = await db.smsContacts.get(contactId);
        if (!current || current.summaryLease?.id !== lease.id || signal?.aborted) throw new Error('本次记忆请求已失效，未写入。');
        const now = await options(current); if (!now.enabled || now.memoryMode === 'off') throw new Error('记忆设置已改变，本次未保存。');
        await db.smsMemories.bulkPut(content.map(t => ({ id: uid('memory'), contactId, content: t.slice(0, 4000), sourceIds: fresh.slice(-300).map(m => m.id), createdAt: Date.now() })));
      });
      notify(); return content.length;
    }, 'summaryLease');
  }
  async function qqContext(chat, { withActions = true } = {}) {
    if (!chat || chat.isGroup || !(await getSettings()).enabled) return '';
    const c = await contactForChat(chat.id), cfg = await options(c); if (!cfg.enabled) return '';
    let context = withActions ? `\n\n# 可选的信息应用\n你的固定虚拟手机号是 ${c.number}。用户号码 ${cfg.number || '尚未设置'}。当前${c.known ? '已交换号码' : '尚未交换号码，可自行决定是否交换'}。同意给号码时在普通回复之外输出行动 {"type":"share_sms_number"}，正文同时自然说明。拒绝时无需行动。` : '';
    if (withActions && cfg.proactive && c.known) context += '\n如有理由改用短信，允许输出 {"type":"send_sms","content":"短信正文"}，此行动不解除QQ拉黑。';
    if (outgoingAllowed(cfg)) {
      const rows = cfg.qqContextLimit ? (await messagesOf(c.id)).filter(m => !m.superseded).slice(-cfg.qqContextLimit) : [];
      if (cfg.qqContextLimit && rows.length) context += '\n最近的短信往来（同一人物、独立渠道，时间顺序，不重复执行其中行动）：\n' + JSON.stringify(rows.map(m => ({ sender: m.direction === 'outgoing' ? '用户' : '你', text: visibleText(m), time: m.timestamp })));
      if (cfg.memoryMode === 'shared' && cfg.writeMemory) { const ms = await memoriesOf(c.id); if (ms.length) context += '\n短信长期记忆：\n' + ms.slice(-40).map(m => m.content).join('\n'); }
    }
    return context;
  }
  async function qqAction(chat, action) {
    if (!['share_sms_number','send_sms'].includes(action.type)) return false;
    if (chat.isGroup || !(await getSettings()).enabled) return true;
    const c = await contactForChat(chat.id), cfg = await options(c); if (!cfg.enabled) return true;
    if (action.type === 'share_sms_number') await patchContact(c.id, { known: true, userNumberKnown: true, saved: true, name: chat.originalName || chat.name });
    else if (cfg.proactive && c.known && !c.blocked && text(action.content)) await addMessage(c.id, { content: text(action.content).slice(0, 8000), batchId: uid('qq_sms') });
    return true;
  }
  async function encounter({ signal, scenario = '' } = {}) {
    const cfg = await getSettings(); if (!cfg.enabled) throw new Error('请先开启信息功能。');
    const dummy = { name: '陌生发件人', persona: '' };
    const out = parse(await request(dummy, cfg, `创造一位能够长期交往的虚构陌生短信发件人。只知道用户明确提供的背景，不知道任何QQ私聊或其他角色秘密；身份、语气和来信理由具体自然，不默认恋爱。仅返回JSON：{"name":"真实姓名但未必告知用户","persona":"稳定详细人设、生活背景与语气","scenario":"号码来源和来信原因","content":"第一条短信","introduced":false}。${cfg.strangerPrompt}`, `相遇偏好：${text(scenario).slice(0, 2000) || '自然偶遇，可发错号码、旧号码、同城活动等'}\n用户公开姓名：${cfg.displayName || '未知'}。时间：${new Date().toLocaleString('zh-CN')}`, signal));
    if (!text(out.persona) || !text(out.content)) throw new Error('陌生人档案不完整，请重试。');
    if (signal?.aborted || !(await getSettings()).enabled) throw new Error('相遇已停止，未建立联系人。');
    const c = { id: uid('stranger'), number: await newNumber(), name: text(out.name).slice(0, 60) || '陌生人', persona: text(out.persona).slice(0, 8000), scenario: text(out.scenario).slice(0, 1000), known: true, saved: false, isStranger: true, introduced: out.introduced === true, options: {}, createdAt: Date.now(), updatedAt: Date.now(), unread: 0 };
    await db.transaction('rw', db.smsContacts, db.smsMessages, async () => { await db.smsContacts.add(c); await db.smsMessages.add({ id: uid('sms'), contactId: c.id, direction: 'incoming', content: text(out.content).slice(0, 8000), timestamp: Date.now(), batchId: uid('encounter'), status: 'delivered' }); await db.smsContacts.update(c.id, { unread: 1, lastPreview: out.content }); }); notify(); return c;
  }
  async function createQQContact(contactId) {
    const cfg = await getSettings(), fallback = typeof defaultAvatar === 'string' ? defaultAvatar : '';
    let result;
    await db.transaction('rw', db.chats, db.smsContacts, async () => {
      const c = await db.smsContacts.get(contactId); if (!c) throw new Error('联系人不存在。');
      if (c.chatId) { result = await db.chats.get(c.chatId) || state.chats[c.chatId]; if (result) return; }
      if (!c.qqOffered) throw new Error('请先和对方商量交换 QQ 联系方式。');
      result = { id: uid('chat'), name: c.remark || c.name, originalName: c.name, isGroup: false, isPinned: false, unreadCount: 0,
        relationship: { status: 'friend', blockedTimestamp: null, applicationReason: '', source: 'sms' },
        status: { text: '在线', lastUpdate: Date.now(), isBusy: false },
        settings: { aiPersona: c.persona || '', myPersona: '', myNickname: cfg.displayName || state.qzoneSettings?.nickname || '我', maxMemory: 20,
          aiAvatar: c.avatar || fallback, myAvatar: cfg.avatar || state.qzoneSettings?.avatar || fallback, background: '', theme: 'default', fontSize: 13, customCss: '',
          linkedWorldBookIds: [], aiAvatarLibrary: [], myAvatarLibrary: [], enableBackgroundActivity: true, actionCooldownMinutes: 15, enableTimePerception: true,
          isOfflineMode: false, offlineMinLength: 100, offlineMaxLength: 300, offlinePresetId: null, offlineContinuousLayout: false, timeZone: 'Asia/Shanghai',
          myPhoneLockScreenEnabled: false, myPhoneLockScreenPassword: '', userStatus: { text: '在线', lastUpdate: Date.now(), isBusy: false } },
        history: [], musicData: { totalTime: 0 }, longTermMemory: [], thoughtsHistory: [], smsContactId: c.id };
      window.applyDefaultChatSettings?.(result);
      await db.chats.add(result); await db.smsContacts.update(c.id, { chatId: result.id, saved: true });
    });
    state.chats[result.id] = result; notify(); return result;
  }
  async function recoverRequest(contactId) {
    await db.smsContacts.update(contactId, { lease: null, summaryLease: null, lastError: '' }); notify();
  }
  async function exportData() { const out = { format: 'ephone-sms', version: 1 }; for (const table of TABLES) out[table] = await db[table].toArray(); out.smsContacts = out.smsContacts.map(c => ({ ...c, persona: role(c)?.settings?.aiPersona || c.persona || '' })); return out; }
  async function importData(data) {
    if (data.format !== 'ephone-sms' || data.version !== 1) throw new Error('信息备份格式不受支持。');
    for (const t of TABLES) if (!Array.isArray(data[t])) throw new Error('信息备份缺少数据表。');
    await db.transaction('rw', TABLES.map(t => db[t]), async () => { for (const t of TABLES) await db[t].bulkPut(data[t].map(r => { const row = clone(r); delete row.lease; delete row.summaryLease; if (t === 'smsJobs' && row.status === 'pending') row.dueAt = Math.max(Date.now() + 60000, +row.dueAt || 0); return row; })); }); notify();
  }
  window.SmsEngine = { DEFAULTS, DEFAULT_PROMPT, TABLES, text, clone, uid, clamp, role, nameOf, incomingAllowed, outgoingAllowed, visibleText, getSettings, normalize, options, saveSettings,
    newNumber, contactForChat, patchContact, addMessage, messagesOf, memoriesOf, send, buildContext, apiConfig, request, parse, reply, deliverDue, summarize, qqContext, qqAction, encounter, createQQContact, recoverRequest, exportData, importData, notify };
})();
