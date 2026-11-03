/* 苹果信息风格的本地通信界面。所有模型调用均经过显式开关和请求锁。 */
(function () {
  'use strict';
  const E = () => window.SmsEngine;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const paths = { back:'m15 18-6-6 6-6', plus:'M12 5v14M5 12h14', send:'M12 19V5m-6 6 6-6 6 6', edit:'m16 3 5 5-12 12H4v-5ZM14 5l5 5', more:'M5 12h.01M12 12h.01M19 12h.01', search:'m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', info:'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', photo:'M3 3h18v18H3ZM3 16l5-5 4 4 3-3 6 6M16 7h.01', close:'m6 6 12 12M6 18 18 6', chevron:'m9 5 7 7-7 7', home:'m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7', people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87' };
  const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[n] || paths.more}"/></svg>`;
  const btn = (action, label, extra = '', cls = '') => `<button type="button" class="sms-button ${cls}" data-action="${action}" ${extra}>${label}</button>`;
  const ib = (action, n, label, extra = '') => btn(action, icon(n), `aria-label="${esc(label)}" ${extra}`, 'sms-icon-button');
  const date = stamp => new Date(stamp).toLocaleString('zh-CN', { month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit' });
  const avatar = c => { const src = c.avatar || E().role(c)?.settings?.aiAvatar; return /^https:\/\//.test(src || '') || /^data:image\/(png|jpeg|webp);base64,/.test(src || '') ? `<img class="sms-avatar" src="${esc(src)}" alt="">` : `<span class="sms-avatar">${esc(c.saved ? (E().nameOf(c) || '?').slice(0,1) : '?')}</span>`; };
  let root, view = 'list', contactId = '', search = '', filter = 'all', controller, busyContact = '', activity = '', showActions = '', renderVersion = 0, limit = 60, initDone = false, tickBusy = false, timersStarted = false;
  const drafts = new Map(), sending = new Set(); let saveQueue = Promise.resolve(), draftTimer;
  const $ = s => root.querySelector(s);
  const check = (key, label, value, hint = '') => `<label class="sms-setting"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" role="switch" name="${key}" ${value ? 'checked' : ''}></label>`;
  const field = (key, label, value, type = 'text', extra = '') => `<label class="sms-field"><span>${label}</span><input name="${key}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const area = (key, label, value, placeholder = '') => `<label class="sms-field"><span>${label}</span><textarea name="${key}" rows="5" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
  const select = (key, label, value, opts) => `<label class="sms-field"><span>${label}</span><select name="${key}">${opts.map(([v,t]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  const group = html => `<div class="sms-group">${html}</div>`;
  function note(message) { activity = message || ''; if (root && $('[data-status]')) $('[data-status]').textContent = activity; }
  function captureDraft() {
    if (view !== 'chat' || !contactId || !$('[data-compose]')) return;
    const previous = drafts.get(contactId) || {};
    const draft = { ...previous, draft: $('[data-compose]').value };
    drafts.set(contactId, draft); clearTimeout(draftTimer);
    const id = contactId;
    draftTimer = setTimeout(() => persistDraft(id, draft), 250);
  }
  function persistDraft(id, value) { const snapshot = E().clone(value); saveQueue = saveQueue.catch(() => {}).then(() => db.smsContacts.update(id, snapshot)); saveQueue.catch(() => note('草稿保存失败，请保留页面并重试。')); return saveQueue; }
  async function navigate(next, id) { captureDraft(); if (contactId && drafts.has(contactId)) await persistDraft(contactId, drafts.get(contactId)); if (id) contactId = id; view = next; showActions = ''; limit = 60; search = ''; activity = ''; await render(); }
  function create() {
    if (root) return;
    root = document.createElement('section'); root.id = 'sms-screen'; root.className = 'screen'; root.setAttribute('aria-label','信息');
    (document.getElementById('phone-screen') || document.body).appendChild(root);
    root.addEventListener('click', ev => { const b = ev.target.closest('[data-action]'); if (b && !b.disabled) action(b.dataset.action, b.dataset).catch(e => note(e.message)); });
    root.addEventListener('input', ev => {
      const inherit = ev.target.closest('[data-settings]')?.querySelector('[name="inherit"]');
      if (inherit && !['inherit','contactEnabled'].includes(ev.target.name)) inherit.checked = false;
      if (ev.target.matches('[data-compose]')) captureDraft();
      if (ev.target.matches('[data-compose]')) { ev.target.style.height='auto'; ev.target.style.height=Math.min(110,ev.target.scrollHeight)+'px'; }
      if (ev.target.matches('[data-search]')) { search = ev.target.value; render().catch(e => note(e.message)); }
    });
    root.addEventListener('keydown', ev => { if (ev.target.matches('[data-compose]') && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); action('send', {}).catch(e => note(e.message)); } });
    root.addEventListener('change', ev => { const inherit=ev.target.closest('[data-settings]')?.querySelector('[name="inherit"]');if(inherit&&!['inherit','contactEnabled'].includes(ev.target.name))inherit.checked=false;if (ev.target.matches('[data-photo]')) attach(ev.target.files?.[0]).catch(e => note(e.message)); });
    root.addEventListener('submit', ev => { ev.preventDefault(); if (ev.target.matches('[data-settings]')) saveForm(ev.target).catch(e => note(e.message)); });
  }
  async function open() { create(); await initialize(); view = 'list'; await E().deliverDue(); await render(); showScreen('sms-screen'); }
  function header(title, back = 'list', trailing = '') { return `<header class="sms-header">${ib(back, 'back', back === 'home' ? '返回桌面' : '返回')}<strong>${esc(title)}</strong><div class="sms-header-actions">${trailing}</div></header>`; }
  async function render() {
    if (!root) return; const revision = ++renderVersion;
    const focused = document.activeElement, focusKey = root.contains(focused) ? focused.getAttribute('data-compose') != null ? '[data-compose]' : focused.getAttribute('data-search') != null ? '[data-search]' : null : null;
    const position = focusKey ? [focused.selectionStart, focused.selectionEnd] : null;
    const oldScroll = $('[data-scroll]'), oldTop = oldScroll?.scrollTop || 0, bottom = !oldScroll || oldScroll.scrollHeight - oldScroll.scrollTop - oldScroll.clientHeight < 80;
    const s = await E().getSettings(); let html = '';
    const all = (await db.smsContacts.toArray()).filter(c => c.known).sort((a,b) => (b.pinned === true) - (a.pinned === true) || b.updatedAt-a.updatedAt);
    if (view === 'list') {
      const term = search.trim().toLowerCase(); let found = new Set();
      if (term) for (const m of await db.smsMessages.toArray()) if (!m.superseded && m.content?.toLowerCase().includes(term)) found.add(m.contactId);
      const contacts = all.filter(c => (!term || `${E().nameOf(c)} ${c.number}`.toLowerCase().includes(term) || found.has(c.id)) && (filter !== 'unknown' || !c.saved) && (filter !== 'unread' || c.unread > 0));
      html = `<header class="sms-list-head">${ib('home','home','返回桌面')}<div>${ib('contacts','people','通讯录')}${ib('settings','more','信息设置')}${ib('compose','edit','新建信息')}</div></header><div class="sms-title-row"><h1>信息</h1>${ib('encounter','plus','遇见陌生人')}</div>
        ${!s.enabled ? `<div class="sms-banner">开启「信息」，开始交换号码与收发短信。${btn('settings','前往开启')}</div>` : ''}
        <label class="sms-search">${icon('search')}<input type="search" aria-label="搜索信息" data-search value="${esc(search)}" placeholder="搜索姓名、号码或信息"></label>
        <nav class="sms-filters" aria-label="信息筛选">${[['all','全部'],['unread','未读'],['unknown','未知发件人']].map(([v,n])=>btn('filter',n,`data-value="${v}" aria-pressed="${filter===v}"`)).join('')}</nav>
        <div class="sms-scroll" data-scroll>${contacts.length ? contacts.map(c=>`<button type="button" class="sms-contact" data-action="chat" data-id="${esc(c.id)}"><span class="sms-unread ${c.unread ? '' : 'sms-invisible'}"></span>${avatar(c)}<span class="sms-contact-content"><span class="sms-contact-heading"><strong>${esc(E().nameOf(c))}</strong><span>${c.pinned ? '置顶 · ' : ''}${date(c.updatedAt)}</span>${icon('chevron')}</span><span class="sms-snippet">${esc(c.lastPreview || '开始一段对话')}${c.muted ? ' · 静音' : ''}</span></span></button>`).join('') : `<div class="sms-empty"><span class="sms-empty-icon">${icon('edit')}</span><h2>${term ? '没有找到信息' : '每一段故事，从一句话开始。'}</h2><p>${term ? '试试其他姓名、号码或关键词。' : '向认识的人要个号码，或遇见一位陌生人。'}</p>${btn('contacts','交换号码')}${btn('encounter','遇见陌生人')}</div>`}</div>`;
    } else if (view === 'chat') {
      const c = await db.smsContacts.get(contactId); if (!c) { view='list'; return render(); }
      const opts = await E().options(c), rows = (await E().messagesOf(c.id)).filter(m=>!m.superseded);
      if (!drafts.has(c.id)) drafts.set(c.id, { draft:c.draft || '',draftImage:c.draftImage || '',draftQuote:c.draftQuote || '' });
      const draft = drafts.get(c.id), quoted = rows.find(m=>m.id===draft.draftQuote);
      html = `<header class="sms-chat-header">${ib('list','back','返回信息列表')}<button type="button" class="sms-person" data-action="info">${avatar(c)}<span>${esc(E().nameOf(c))}${icon('chevron')}</span></button>${ib('info','info','联系人详情')}</header>
        <div class="sms-conversation sms-scroll" data-scroll>${rows.length > limit ? btn('older', '查看更早的信息', '', 'sms-older') : ''}<div class="sms-time">iMessage 信息</div>${rows.slice(-limit).map((m,i,arr)=>messageHTML(m,c,opts,i,arr,rows)).join('') || '<div class="sms-empty"><p>号码已在这里，想说的话慢慢说。</p></div>'}</div>
        ${c.qqOffered && !c.chatId ? `<div class="sms-banner">对方提出交换 QQ 联系方式。${btn('promote','查看并决定')}</div>` : ''}
        ${quoted ? `<div class="sms-quote-draft"><span>回复：${esc(E().visibleText(quoted).slice(0,60))}</span>${ib('cancel-quote','close','取消引用')}</div>` : ''}
        ${draft.draftImage ? `<div class="sms-photo-draft"><img src="${esc(draft.draftImage)}" alt="待发送照片">${btn('remove-photo','移除照片')}</div>` : ''}
        <div class="sms-composer">${ib('photo','plus','添加照片')}<textarea rows="1" data-compose aria-label="信息内容" placeholder="${opts.enabled ? 'iMessage 信息' : '信息已关闭'}" ${opts.enabled ? '' : 'disabled'}>${esc(draft.draft)}</textarea>${btn('send',icon('send'),`aria-label="发送" ${opts.enabled ? '' : 'disabled'}`,'sms-send')}</div>
        <div class="sms-reply-bar">${btn('api', busyContact===c.id ? '正在请求…' : 'API 回复', `${controller || !opts.enabled ? 'disabled' : ''}`, 'sms-api')}${btn('guidance','回复要求')}${controller ? btn('stop','停止') : btn('proactive','让对方说话',`${opts.proactive ? '' : 'disabled'}`)}</div>
        <input type="file" accept="image/png,image/jpeg,image/webp" data-photo hidden><div class="sms-caption">${opts.autoReply ? '自动回复已开启' : '手动回复 · 发送不调用模型'}${c.lastError ? ' · 上次请求未完成' : ''}</div>`;
      if (c.unread) { await db.smsContacts.update(c.id, { unread:0, lastReadAt:Date.now() }); await updateBadge(); }
      if (c.lastError && !activity) activity=c.lastError;
    } else if (view === 'settings' || view === 'contact-settings') {
      const c = view==='contact-settings' ? await db.smsContacts.get(contactId) : null;
      html = header(c ? '此联系人的设置' : '信息设置', c ? 'info' : 'list') + `<div class="sms-settings-body sms-scroll" data-scroll>${settingsHTML(c ? await E().options(c) : s, c)}</div>`;
    } else if (view === 'info') {
      const c = await db.smsContacts.get(contactId); if (!c) return navigate('list');
      html = header('详细信息','chat') + `<div class="sms-settings-body sms-scroll" data-scroll><div class="sms-profile">${avatar(c)}<h2>${esc(E().nameOf(c))}</h2><p>${esc(c.number)}</p></div>${group(
        btn('save-contact',c.saved ? '修改姓名与备注' : '存为联系人','','sms-row') + btn('avatar','设置联系人头像','','sms-row') + btn('pin',c.pinned ? '取消置顶' : '置顶会话','','sms-row') + btn('mute',c.muted ? '取消免打扰' : '隐藏提醒','','sms-row') + btn('contact-settings','上下文、记忆与自定义提示词','','sms-row') + btn('memory','长期记忆','','sms-row'))}
        ${group(btn('block',c.blocked ? '取消阻止此联系人' : '阻止此联系人','','sms-row sms-danger') + btn('clear','清空会话记录','','sms-row sms-danger') + (c.lease || c.summaryLease ? btn('recover','恢复未完成的请求','','sms-row') : ''))}
        ${!c.chatId ? group(btn('ask-qq','询问 QQ 联系方式','','sms-row') + (c.qqOffered ? btn('promote','接受 QQ 联系方式','','sms-row') : '')) : group(btn('qq','进入 QQ 聊天','','sms-row'))}<p class="sms-help">短信与 QQ 分别管理黑名单。清空会话不会删除长期记忆。</p></div>`;
    } else if (view === 'contacts' || view === 'compose') {
      const roles = Object.values(state.chats || {}).filter(c=>!c.isGroup);
      html = header(view==='compose'?'新信息':'通讯录','list') + `<div class="sms-settings-body sms-scroll" data-scroll>${group(`<label class="sms-field">收件号码<input data-number inputmode="tel" placeholder="输入已获得的虚拟号码"></label>${btn('number','按号码开始聊天','','sms-wide')}`)}<h2>已保存的联系人</h2>${all.filter(c=>c.saved).map(c=>btn('chat',`${avatar(c)}<span>${esc(E().nameOf(c))}<small>${esc(c.number)}</small></span>`,`data-id="${esc(c.id)}"`,'sms-contact-mini')).join('') || '<p class="sms-help">暂未保存联系人。</p>'}<h2>向角色交换号码</h2><p class="sms-help">每次请求由人物决定是否提供号码，会调用该角色的 API。也可以在 QQ 中自然地询问。</p>${roles.map(c=>btn('exchange',`${esc(c.name)}<small>询问号码</small>`,`data-chat-id="${esc(c.id)}"`,'sms-row')).join('') || '<p class="sms-help">先在 QQ 添加角色，或遇见一位陌生人。</p>'}</div>`;
    } else if (view === 'memory') {
      const c=await db.smsContacts.get(contactId), opts=await E().options(c), ms=await E().memoriesOf(contactId);
      const shared=opts.memoryMode==='shared' && E().incomingAllowed(opts) && E().role(c) && typeof getMemoryContextForPrompt==='function' ? getMemoryContextForPrompt(E().role(c)) : '';
      html=header('长期记忆','info')+`<div class="sms-settings-body sms-scroll" data-scroll><p class="sms-help">当前：${{shared:'与角色共享',independent:'短信独立',off:'不使用长期记忆'}[opts.memoryMode]}。整理会调用 API，手动添加不调用。</p><div class="sms-inline-actions">${btn('summarize','整理未总结的消息',controller?'disabled':'')}${btn('summary-range','选择时间范围')}${btn('add-memory','手动添加')}</div>${shared?`<details class="sms-group"><summary>参考的角色记忆</summary><pre class="sms-memory-text">${esc(shared)}</pre><p class="sms-help">这里只读；编辑原有角色记忆请进入 QQ 的记忆管理。</p></details>`:''}${ms.map(m=>`<article class="sms-memory-item"><small>${date(m.createdAt)}</small><p>${esc(m.content)}</p>${btn('edit-memory','编辑',`data-id="${esc(m.id)}"`)}${btn('delete-memory','删除',`data-id="${esc(m.id)}"`,'sms-danger')}</article>`).join('') || '<div class="sms-empty"><p>还没有短信长期记忆。</p></div>'}${btn('contact-settings','调整记忆模式','','sms-wide')}</div>`;
    }
    if (revision!==renderVersion) return;
    root.innerHTML = html + `<div class="sms-status" data-status role="status" aria-live="polite">${esc(activity)}</div>`;
    if (focusKey && $(focusKey)) { $(focusKey).focus({preventScroll:true}); if (position && typeof $(focusKey).setSelectionRange==='function') { try { $(focusKey).setSelectionRange(...position); } catch (_) {} } }
    const compose=$('[data-compose]');if(compose&&compose.value)compose.style.height=Math.min(110,compose.scrollHeight)+'px';
    const scroll=$('[data-scroll]'); if (scroll) scroll.scrollTop=view==='chat' && bottom ? scroll.scrollHeight : oldTop;
  }
  function messageHTML(m,c,opts,index,arr,all) {
    const stamp = !index || m.timestamp-arr[index-1].timestamp>600000 ? `<div class="sms-time">${date(m.timestamp)}</div>` : '';
    const quote=all.find(x=>x.id===m.quoteId);
    return stamp+`<article class="sms-message ${m.direction==='outgoing'?'sms-out':'sms-in'}"><div class="sms-bubble ${m.image?'sms-with-photo':''}">${quote ? `<div class="sms-bubble-quote">${esc(E().visibleText(quote).slice(0,100))}</div>` : ''}${m.image ? `<img src="${esc(m.image)}" alt="照片" loading="lazy">` : ''}${m.content ? `<span>${esc(m.content)}</span>`:''}</div>${m.reaction||m.incomingReaction ? `<span class="sms-reaction">${esc([m.reaction,m.incomingReaction].filter(Boolean).join(' '))}</span>`:''}<button type="button" class="sms-message-menu" data-action="message-menu" data-id="${esc(m.id)}" aria-label="此条信息的操作">···</button>${m.direction==='outgoing' ? `<div class="sms-receipt">${{sent:'已发送',delivered:'已送达',read:'已读'}[m.status]||'已发送'}</div>`:''}${showActions===m.id ? `<div class="sms-message-actions">${btn('quote','引用',`data-id="${esc(m.id)}"`)}${btn('react','回应',`data-id="${esc(m.id)}"`)}${btn('copy','复制',`data-id="${esc(m.id)}"`)}${btn('delete-message','删除',`data-id="${esc(m.id)}"`)}${m.direction==='incoming'&&index===arr.length-1?btn('regenerate','重新生成'):''}</div>`:''}</article>`;
  }
  function settingsHTML(s,c) {
    return `<form data-settings data-contact="${esc(c?.id||'')}">${!c ? `<div class="sms-settings-intro"><img src="icons/messages.svg" alt="" width="58" height="58"><h2>信息</h2><p>有些话，换一个地方说。</p></div>${group(check('enabled','启用信息',s.enabled,'关闭后保留记录，不添加短信专属提示词，不运行短信 API 任务。'))}${group(field('displayName','我的姓名',s.displayName)+field('number','我的虚拟号码',s.number,'text','inputmode="tel" maxlength="11"')+field('avatar','我的头像 URL',s.avatar))}` : `<p class="sms-help">${esc(E().nameOf(c))} · ${esc(c.number)}</p>${group(check('contactEnabled','允许此联系人的短信能力',c.enabled!==false)+check('inherit','沿用全局设置',!Object.keys(c.options||{}).length,'开启后以下参数使用全局值；关闭可单独调整。'))}`}
      <h2>聊天与上下文</h2>${group(check('autoReply','发送后自动调用 API',s.autoReply,'默认关闭；手动点击 API 回复可以一次处理多条。')+field('contextLimit','参考短信条数',s.contextLimit,'number','min="1" max="200"')+field('qqContextLimit','跨渠道参考条数',s.qqContextLimit,'number','min="0" max="100"')+select('bridge','互通方向',s.bridge,[['both','双向互通'],['qq-to-sms','QQ → 短信'],['sms-to-qq','短信 → QQ'],['none','完全独立']])+check('readReceipts','已读回执',s.readReceipts))}
      <h2>长期记忆</h2>${group(select('memoryMode','记忆模式',s.memoryMode,[['shared','共享角色记忆'],['independent','短信独立记忆'],['off','关闭长期记忆']])+check('writeMemory','允许 QQ 参考短信长期记忆',s.writeMemory,'仅在共享模式且方向允许短信 → QQ 时生效。')+check('autoSummary','自动整理长期记忆',s.autoSummary,'会额外调用 API；默认关闭。')+field('summaryEvery','每多少条新消息整理一次',s.summaryEvery,'number','min="10" max="500"'))}<p class="sms-help">切换模式保留已有记忆。共享模式按方向读取原有日记、结构化或向量记忆；短信摘要按来源单独保存，避免重复写入原记忆。</p>
      <h2>自定义提示词</h2>${group(select('promptMode','使用方式',s.promptMode,[['append','补充默认短信风格'],['replace','替换默认短信风格']])+area('customPrompt','短信提示词',s.customPrompt,'例如：回复简洁自然，多用生活化的短句。')+area('summaryPrompt','记忆整理补充要求',s.summaryPrompt,'希望重点记住哪些事情……'))}<p class="sms-help">可用变量：{{角色名}}、{{用户}}、{{号码}}、{{我的号码}}、{{时间}}。替换风格仍保留人物身份与收发协议。留空使用默认提示词。</p><div class="sms-inline-actions">${btn('default-prompt','查看默认提示词')}${btn('reset-prompt','恢复默认风格')}</div>
      <h2>API</h2>${group(select('apiSource','API 来源',s.apiSource,[['chat','沿用角色 API，无独立配置时用全局'],['global','使用全局 API'],['custom','信息独立 API']])+field('apiUrl','独立 API 地址',s.apiConfig?.proxyUrl||'','url')+field('apiKey','独立 API 密钥',s.apiConfig?.apiKey||'','password','autocomplete="off"')+field('apiModel','独立 API 模型',s.apiConfig?.model||''))}
      <h2>主动联系</h2>${group(check('proactive','允许角色主动发信',s.proactive,'开启后可能调用 API，受频率、上限与安静时段限制。'))}
      ${!c ? `${group(check('randomStrangers','允许随机陌生来信',s.randomStrangers,'虚构人物；默认关闭，不读取其他角色的私聊。')+field('intervalMinutes','主动联系间隔（分钟）',s.intervalMinutes,'number','min="30" max="10080"')+field('dailyLimit','主动联系每天最多次数',s.dailyLimit,'number','min="0" max="10"')+field('quietStart','安静时段开始',s.quietStart,'time')+field('quietEnd','安静时段结束',s.quietEnd,'time'))}<h2>陌生人提示词</h2>${group(area('strangerPrompt','相遇与人物偏好',s.strangerPrompt,'例如：都市日常，慢慢熟悉，不默认恋爱；人物拥有独立生活。'))}<p class="sms-help">网页关闭后暂停，重新打开时最多处理一次到期的主动联系，不补发累积次数。</p>`:''}
      <button class="sms-button sms-primary sms-wide" type="submit">保存设置</button>${c?'':`<div class="sms-inline-actions">${btn('export','导出信息备份')}${btn('import','导入信息备份')}${btn('jobs','待处理任务')}</div>`}</form>`;
  }
  async function saveForm(form) {
    const data=new FormData(form), global=await E().getSettings(), c=form.dataset.contact ? await db.smsContacts.get(form.dataset.contact) : null;
    const patch={};
    for (const k of ['autoReply','writeMemory','readReceipts','autoSummary','proactive']) patch[k]=data.has(k);
    for (const k of ['contextLimit','qqContextLimit','summaryEvery']) patch[k]=Number(data.get(k));
    for (const k of ['bridge','memoryMode','customPrompt','summaryPrompt','promptMode','apiSource']) patch[k]=String(data.get(k)||'');
    patch.apiConfig={proxyUrl:E().text(data.get('apiUrl')),apiKey:E().text(data.get('apiKey')),model:E().text(data.get('apiModel'))};
    if(c) {
      if ((patch.memoryMode!== (await E().options(c)).memoryMode || patch.bridge!==(await E().options(c)).bridge) && !await confirm('改变记忆参考方式','已有消息和记忆保留。之后的请求将按新的模式与方向读取，是否保存？')) return;
      const normalized=E().normalize({...global,...patch});
      await E().patchContact(c.id,{enabled:data.has('contactEnabled'),options:data.has('inherit')?{}:Object.fromEntries(Object.keys(patch).map(key=>[key,normalized[key]]))});
      if (!data.has('contactEnabled') && busyContact === c.id) controller?.abort();
    } else {
      Object.assign(patch,{enabled:data.has('enabled'),randomStrangers:data.has('randomStrangers')});
      for(const k of ['displayName','number','avatar','strangerPrompt','quietStart','quietEnd'])patch[k]=String(data.get(k)||'');
      for(const k of ['intervalMinutes','dailyLimit'])patch[k]=Number(data.get(k));
      await E().saveSettings(patch); if(!patch.enabled)controller?.abort();
    }
    note('设置已保存。'); await render();
  }
  async function confirm(title,message){return typeof showCustomConfirm==='function'?showCustomConfirm(title,message):window.confirm(`${title}\n${message}`);}
  async function prompt(title,message,value='',type='text'){return typeof showCustomPrompt==='function'?showCustomPrompt(title,message,value,type):window.prompt(`${title}\n${message}`,value);}
  async function run(label,operation,id='') {
    if(controller)throw new Error('当前已有请求，请等待或停止。');controller=new AbortController();busyContact=id;note(label);if(view==='chat')await render();
    const timeout=setTimeout(()=>controller?.abort(),180000);let success=false;
    try{await operation(controller.signal);success=true;note('已完成。');}
    catch(e){note(e.name==='AbortError'?'请求已停止，消息和草稿保留。':e.message);}
    finally{clearTimeout(timeout);controller=null;busyContact='';if(!['settings','contact-settings'].includes(view))await render();}return success;
  }
  async function runReply(args={}) {
    const id=contactId;let result;
    const success=await run('正在调用 API…',async signal=>{result=await E().reply(id,{signal,...args});},id);
    if(success){note(result?.action==='defer'?'信息已处理，等待后续来信。':result?.action==='ignore'||result?.action==='block'||result?.action==='undelivered'?'暂时没有新来信。':'已收到新信息。');await maybeSummarize(id);}
    if(success){const c=await db.smsContacts.get(id);if(c&&(await E().options(c)).autoReply&&(await E().messagesOf(id)).some(m=>m.direction==='outgoing'&&!m.handled)&&result?.action!=='undelivered'){setTimeout(()=>{if(!controller&&contactId===id)runReply().catch(e=>note(e.message));},50);}}
  }
  async function maybeSummarize(id){const c=await db.smsContacts.get(id),o=await E().options(c);if(!o.enabled||!o.autoSummary||o.memoryMode==='off'||controller)return;const used=new Set((await E().memoriesOf(id)).flatMap(m=>m.sourceIds||[]));if((await E().messagesOf(id)).filter(m=>!m.superseded&&!used.has(m.id)).length>=o.summaryEvery)await run('正在整理长期记忆…',signal=>E().summarize(id,{signal}),id);}
  async function attach(file) {
    if (!file) return;
    const id = contactId; captureDraft();
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 15*1024*1024) throw new Error('请选择 15MB 以内的 PNG、JPG 或 WebP 照片。');
    const data = await new Promise((ok,no) => { const reader=new FileReader();reader.onload=()=>ok(reader.result);reader.onerror=()=>no(new Error('照片读取失败'));reader.readAsDataURL(file); });
    const img = new Image(); await new Promise((ok,no) => { img.onload=ok;img.onerror=()=>no(new Error('照片无法打开'));img.src=data; });
    const canvas=document.createElement('canvas'),scale=Math.min(1,1280/img.width,1280/img.height);
    canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    const draft=drafts.get(id)||{draft:''};draft.draftImage=canvas.toDataURL('image/jpeg',.82);drafts.set(id,draft);
    await persistDraft(id,draft);if(view==='chat'&&contactId===id)await render();
  }
  async function action(name,data) {
    if(name==='home'){captureDraft();if(contactId&&drafts.has(contactId))await persistDraft(contactId,drafts.get(contactId));showScreen('home-screen');return;}
    if(['list','contacts','compose','info','settings','contact-settings','memory'].includes(name)){await navigate(name);return;}
    if(name==='chat'){await navigate('chat',data.id||contactId);return;}
    if(name==='filter'){filter=data.value;await render();return;}
    if(name==='older'){limit+=60;await render();return;}
    if(name==='stop'){controller?.abort();return;}
    if(name==='send'){
      const id=contactId;if(sending.has(id))return;sending.add(id);captureDraft();clearTimeout(draftTimer);
      const snapshot=E().clone(drafts.get(id)||{}),empty={draft:'',draftImage:'',draftQuote:''};
      if(!E().text(snapshot.draft)&&!snapshot.draftImage){sending.delete(id);return;}
      drafts.set(id,empty);if(view==='chat'&&contactId===id&&$('[data-compose]'))$('[data-compose]').value='';
      let committed=false;
      try{await E().send(id,snapshot.draft,snapshot.draftImage,snapshot.draftQuote);committed=true;await persistDraft(id,drafts.get(id)||empty);await render();if((await E().options(await db.smsContacts.get(id))).autoReply&&!controller&&contactId===id)await runReply();}
      catch(error){if(!committed){const current=drafts.get(id)||empty;const restored={draft:[snapshot.draft,current.draft].filter(Boolean).join('\n'),draftImage:current.draftImage||snapshot.draftImage||'',draftQuote:current.draftQuote||snapshot.draftQuote||''};drafts.set(id,restored);await persistDraft(id,restored);await render();}throw error;}
      finally{sending.delete(id);}return;
    }
    if(name==='api'){await runReply();return;}
    if(name==='proactive'){await runReply({proactive:true});return;}
    if(name==='regenerate'){const guidance=await prompt('重新生成','可填写本次表达要求；原回复在成功前保留。','');if(guidance!==null)await runReply({regenerate:true,guidance});return;}
    if(name==='guidance'){const v=await prompt('本次回复要求','只作用于本次 API 回复，不写入角色记忆。','','textarea');if(v!==null)await runReply({guidance:v});return;}
    if(name==='photo'){$('[data-photo]')?.click();return;}
    if(name==='remove-photo'||name==='cancel-quote'){captureDraft();const draft=drafts.get(contactId)||{};draft[name==='remove-photo'?'draftImage':'draftQuote']='';drafts.set(contactId,draft);await persistDraft(contactId,draft);await render();return;}
    if(name==='message-menu'){captureDraft();showActions=showActions===data.id?'':data.id;await render();return;}
    if(['quote','react','copy','delete-message'].includes(name)){
      const m=await db.smsMessages.get(data.id);if(!m||m.contactId!==contactId)return;
      if(name==='quote'){captureDraft();const d=drafts.get(contactId)||{};d.draftQuote=m.id;drafts.set(contactId,d);await persistDraft(contactId,d);showActions='';await render();$('[data-compose]')?.focus();}
      if(name==='react'){const reaction=await prompt('回应信息','输入 ♥、👍、👎、哈哈、!! 或 ?；留空移除。',m.reaction||'');if(reaction===null)return;if(reaction&&!['♥','👍','👎','哈哈','!!','?'].includes(reaction))throw Error('请选择支持的回应。');await db.smsMessages.update(m.id,{reaction});await render();}
      if(name==='copy'){if(typeof copyTextToClipboard==='function')await copyTextToClipboard(E().visibleText(m));else await navigator.clipboard.writeText(E().visibleText(m));note('已复制。');}
      if(name==='delete-message'&&await confirm('删除本条信息','只删除本地这条信息，不撤回对方已知的内容，也不删除长期记忆。')){await db.smsMessages.delete(m.id);await render();}return;
    }
    if(name==='number'){const number=E().text($('[data-number]').value).replace(/[\s-]/g,'');const c=await db.smsContacts.where('number').equals(number).first();if(!c)throw Error('此虚拟号码尚未建立联系人。请先交换号码，或选择遇见陌生人。');await E().patchContact(c.id,{known:true});await navigate('chat',c.id);return;}
    if(name==='exchange'){await exchange(data.chatId);return;}
    if(name==='encounter'){const cfg=await E().getSettings();if(!cfg.enabled){await navigate('settings');note('请先开启信息功能。');return;}const scenario=await prompt('遇见陌生人','可以写相遇情境或人物偏好；留空自然相遇。本次会调用 API。','','textarea');if(scenario===null)return;let c;const ok=await run('正在遇见一位陌生人…',async signal=>{c=await E().encounter({signal,scenario});});if(ok&&c)await navigate('chat',c.id);return;}
    if(name==='default-prompt'){await prompt('默认短信提示词','可复制到自定义提示词中修改。',E().DEFAULT_PROMPT,'textarea');return;}
    if(name==='reset-prompt'){if(await confirm('恢复默认短信风格','清空当前表单的短信自定义提示词，保存后生效。')){$('[name="customPrompt"]').value='';$('[name="promptMode"]').value='append';}return;}
    if(name==='export'){download(await E().exportData(),`信息备份-${new Date().toISOString().slice(0,10)}.json`);note('已导出信息备份。');return;}
    if(name==='import'){const input=document.createElement('input');input.type='file';input.accept='.json';input.onchange=async()=>{try{const file=input.files?.[0];if(!file)return;const backup=JSON.parse(await file.text());if(!await confirm('导入信息备份','按记录 ID 合并，已有相同记录会更新。建议先导出当前备份。'))return;await E().importData(backup);drafts.clear();await render();note('已导入。');}catch(e){note(e.message);}};input.click();return;}
    if(name==='jobs'){const jobs=(await db.smsJobs.where('status').equals('pending').toArray());if(!jobs.length){note('当前没有待处理来信。');return;}const result=await prompt('待处理任务',jobs.map((j,i)=>`${i+1}. ${date(j.dueAt)} · 待送达`).join('\n')+'\n输入序号取消一项；留空返回。');const job=jobs[Number(result)-1];if(job&&await confirm('取消任务','取消后不会送达该次已安排的来信。'))await db.smsJobs.update(job.id,{status:'cancelled'});return;}
    const c=await db.smsContacts.get(contactId);if(!c)return;
    if(name==='recover'&&await confirm('恢复未完成的请求','使上次未完成的结果失效，保留消息，然后可以重新点击 API 回复。如果其他页面正在处理同一会话，也会停止接收那次结果。')){if(busyContact===c.id)controller?.abort();await E().recoverRequest(c.id);await render();note('已恢复，可以重新请求。');}
    if(name==='save-contact'){const v=await prompt('保存联系人','填写显示姓名或备注。',c.remark||(c.saved?c.name:''));if(v===null)return;if(!E().text(v))throw Error('请填写联系人名称。');await E().patchContact(c.id,{saved:true,remark:E().text(v).slice(0,80)});await render();}
    if(name==='avatar'){const v=await prompt('联系人头像','填写 HTTPS 图片地址；留空使用默认。',c.avatar||'');if(v===null)return;if(v&&!/^https:\/\//.test(v))throw Error('请使用 HTTPS 图片地址。');await E().patchContact(c.id,{avatar:v});await render();}
    if(name==='pin'||name==='mute'){await E().patchContact(c.id,{[name==='pin'?'pinned':'muted']:!c[name==='pin'?'pinned':'muted']});await render();}
    if(name==='block'&&await confirm(c.blocked?'取消阻止':'阻止此联系人',c.blocked?'允许此号码的新来信。':'停止接收此号码的新来信；QQ 关系和已有记录保留。')){await E().patchContact(c.id,{blocked:!c.blocked});await render();}
    if(name==='clear'&&await confirm('清空会话','删除此会话的全部短信和待送达任务，长期记忆与联系人保留。')){await db.transaction('rw',db.smsContacts,db.smsMessages,db.smsJobs,async()=>{const fresh=await db.smsContacts.get(c.id);if(fresh.lease?.until>Date.now())throw Error('请先停止或等待本会话的 API 请求完成。');await db.smsMessages.where('contactId').equals(c.id).delete();await db.smsJobs.where('contactId').equals(c.id).delete();await db.smsContacts.update(c.id,{lastPreview:'',unread:0,draft:'',draftImage:'',draftQuote:''});});drafts.delete(c.id);await render();}
    if(name==='qq'){showScreen('chat-list-screen');state.activeChatId=c.chatId;renderChatInterface(c.chatId);showScreen('chat-interface-screen');}
    if(name==='ask-qq'){await E().send(c.id,'如果你愿意，我们可以交换 QQ 联系方式吗？');await navigate('chat',c.id);await runReply();}
    if(name==='promote'){if(!c.qqOffered||c.chatId)throw Error('先通过短信和对方商量交换联系方式。');if(!await confirm('添加 QQ 联系人',`将${esc(E().nameOf(c))}添加到主聊天，短信仍然保留。`))return;await promote(c);await render();}
    if(name==='summarize'){await run('正在整理长期记忆…',signal=>E().summarize(c.id,{signal}),c.id);}
    if(name==='summary-range'){const raw=await prompt('选择时间范围','输入开始日期和结束日期，以逗号分隔，例如 2026-11-01,2026-11-02。');if(!raw)return;const [a,b]=raw.split(/[,，]/).map(x=>x.trim());const from=new Date(a+'T00:00:00').getTime(),to=new Date(b+'T23:59:59.999').getTime();if(!Number.isFinite(from)||!Number.isFinite(to)||from>to)throw Error('日期范围无效。');await run('正在整理选定消息…',signal=>E().summarize(c.id,{signal,from,to}),c.id);}
    if(name==='add-memory'){const content=await prompt('添加短信记忆','填写希望记住的内容。','','textarea');if(E().text(content)){await db.smsMemories.add({id:E().uid('memory'),contactId:c.id,content:E().text(content).slice(0,4000),sourceIds:[],createdAt:Date.now()});await render();}}
    if(name==='edit-memory'||name==='delete-memory'){const m=await db.smsMemories.get(data.id);if(m?.contactId!==c.id)return;if(name==='edit-memory'){const content=await prompt('编辑短信记忆','修改这条长期记忆。',m.content,'textarea');if(E().text(content))await db.smsMemories.update(m.id,{content:E().text(content).slice(0,4000)});}else if(await confirm('删除长期记忆','不删除聊天记录；之后请求不再参考这条短信记忆。'))await db.smsMemories.delete(m.id);await render();}
  }
  async function exchange(chatId){const c=await E().contactForChat(chatId),cfg=await E().options(c);if(!cfg.enabled)throw Error('请先开启信息功能。');if(c.known){await navigate('chat',c.id);return;}let answer;const success=await run('正在询问角色是否交换号码…',async signal=>{const ctx=await E().buildContext(c,cfg,[]);answer=E().parse(await E().request(c,cfg,'你是材料中的角色。用户希望交换虚拟手机号码。结合人设、关系和当前矛盾，自主同意、拒绝或暂缓，不无条件同意。仅返回JSON：{"decision":"accept|reject|wait","content":"自然回应，接受时可提到你的虚拟号码"}。',JSON.stringify({context:ctx,number:c.number,userNumber:cfg.number}),signal));if(!['accept','reject','wait'].includes(answer.decision)||!E().text(answer.content))throw Error('交换号码的回应格式无效。');if(signal.aborted||!(await E().getSettings()).enabled)throw Error('交换已停止。');if(answer.decision==='accept')await E().patchContact(c.id,{known:true,saved:true,userNumberKnown:true});});if(!success)return;if(answer?.decision==='accept'){await E().addMessage(c.id,{content:answer.content,batchId:E().uid('exchange')});await navigate('chat',c.id);}else if(answer)note(answer.content);}
  async function promote(c){await E().createQQContact(c.id);window.renderChatList?.();note('已加入 QQ；短信记录保留，参考范围遵循本联系人的设置。');}
  function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function quiet(s){const now=new Date(),min=now.getHours()*60+now.getMinutes(),parse=t=>/^\d{2}:\d{2}$/.test(t)?Number(t.slice(0,2))*60+Number(t.slice(3)):null,a=parse(s.quietStart),b=parse(s.quietEnd);if(a===null||b===null||a===b)return false;return a<b?min>=a&&min<b:min>=a||min<b;}
  async function backgroundTick() {
    if (tickBusy || controller || document.hidden) return;
    tickBusy = true;
    try {
      await E().deliverDue(); const s = await E().getSettings();
      if (!s.enabled || quiet(s) || s.dailyLimit <= 0) return;
      const candidates = [];
      for (const c of await db.smsContacts.toArray()) {
        if (!c.known || c.blocked || c.blockedByContact || c.lease?.until > Date.now()) continue;
        const opts = await E().options(c); if (opts.enabled && opts.proactive) candidates.push(c);
      }
      if (!s.randomStrangers && !candidates.length) return;
      const today = new Date().toLocaleDateString('sv-SE'); let reserved = false;
      await db.transaction('rw', db.smsSettings, async () => {
        const fresh = await E().getSettings();
        if (!fresh.enabled || fresh.autoLeaseUntil > Date.now() || fresh.nextAutoAt > Date.now() || (fresh.autoDay === today && (fresh.autoCount || 0) >= fresh.dailyLimit)) return;
        await db.smsSettings.put({ ...fresh, autoLeaseUntil: Date.now() + 240000, nextAutoAt: Date.now() + fresh.intervalMinutes * 60000, autoDay: today, autoCount: (fresh.autoDay === today ? fresh.autoCount || 0 : 0) + 1 }); reserved = true;
      });
      if (!reserved) return;
      try {
        if (s.randomStrangers && (!candidates.length || Math.random() < .3)) await run('有一条陌生来信正在抵达…', signal => E().encounter({ signal }));
        else if (candidates.length) { const c = candidates[Math.floor(Math.random() * candidates.length)]; await run('正在处理主动来信…', signal => E().reply(c.id, { signal, proactive: true }), c.id); }
      } finally { await db.smsSettings.update('main', { autoLeaseUntil: 0 }); }
    } catch (e) { if (root?.classList.contains('active')) note(e.message); }
    finally { tickBusy = false; }
  }
  async function updateBadge() {
    const count = (await db.smsContacts.toArray()).filter(c => c.known && !c.muted && !c.blocked).reduce((n,c) => n + (Number(c.unread) || 0), 0);
    if (window.SmsApp) window.SmsApp.unreadCount = count;
    const parents = [...document.querySelectorAll('#icon-img-messages')].map(img => img.parentElement).concat([...document.querySelectorAll('[data-sms-icon]')]);
    parents.forEach(parent => {
      let badge = parent.querySelector('.sms-app-badge');
      if (!badge) { badge = document.createElement('span'); badge.className = 'sms-app-badge'; parent.style.position = 'relative'; parent.appendChild(badge); }
      badge.hidden = !count; badge.textContent = count > 99 ? '99+' : String(count); badge.setAttribute('aria-label',`${count}条未读信息`);
    });
  }
  async function initialize() {
    if (initDone) return; await db.open?.(); initDone = true; await updateBadge();
    if (!timersStarted) {
      timersStarted = true; setInterval(() => backgroundTick(),30000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) backgroundTick(); });
      window.addEventListener('sms:change', () => {
        updateBadge().catch(() => {});
        if (controller) E().getSettings().then(s => { if (!s.enabled) controller?.abort(); });
        if (root?.classList.contains('active') && !['settings','contact-settings'].includes(view)) render().catch(e => note(e.message));
      });
    }
  }
  Object.assign(window,{openSmsApp:open,SmsApp:{open,initialize,backgroundTick,render,quiet}});
})();
