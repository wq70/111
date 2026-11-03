(function () {
  'use strict';
  const G = () => window.GenerationAdjustments;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let root, record, session, chatId, controller, saveQueue = Promise.resolve(), previousFocus, editPreferenceId, openRevision = 0, renderRevision = 0;
  const $ = selector => root.querySelector(selector);
  const chat = () => state.chats[chatId];
  function status(message) { if (root) $('[data-status]').textContent = message; }
  function persist() {
    const snapshot = G().clone(record);
    saveQueue = saveQueue.catch(() => {}).then(() => G().saveDiscussion(snapshot));
    saveQueue.catch(() => status('保存失败，请勿清除页面数据；可以重试当前操作。'));
    return saveQueue;
  }
  function capture() {
    if (!session || !root) return;
    for (const [key, selector] of [['guidance', '[data-guidance]'], ['draft', '[data-draft]'], ['member', '[data-member]'], ['mode', '[data-mode]'], ['scope', '[data-scope]'], ['apiSource', '[data-api-source]'], ['contextLimit', '[data-context-limit]']]) {
      const input = $(selector);
      if (input) session[key] = input.value;
    }
  }
  function btn(action, label, extra = '') { return `<button type="button" data-action="${action}" ${extra}>${label}</button>`; }
  function create() {
    root = document.createElement('div');
    root.id = 'model-communication-panel';
    root.className = 'mc-overlay';
    root.hidden = true;
    root.innerHTML = `<section class="mc-panel" role="dialog" aria-modal="true" aria-labelledby="mc-title">
      <header class="mc-header"><span id="mc-title">生成调整</span>${btn('close', '关闭', 'aria-label="关闭生成调整，保留草稿"')}</header>
      <div class="mc-tabs" role="tablist">${btn('tab-intent', '生成意向', 'role="tab"')}${btn('tab-talk', '和模型聊聊', 'role="tab"')}${btn('tab-preferences', '生成偏好', 'role="tab"')}</div>
      <div class="mc-body" data-body></div><div class="mc-status" data-status role="status" aria-live="polite"></div>
    </section>`;
    (document.getElementById('phone-screen') || document.body).appendChild(root);
    root.addEventListener('input', event => {
      capture();
      if (event.target.matches('[data-guidance]')) session.requirementsRevision = session.messages.length;
      persist();
    });
    root.addEventListener('change', async event => {
      if (event.target.matches('[data-session]')) {
        if (controller) return;
        capture();
        session = record.sessions.find(s => s.id === event.target.value);
        record.currentId = session.id;
        editPreferenceId = null;
        await persist(); await render();
      } else { capture(); persist(); }
    });
    root.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      action(button.dataset.action, button.dataset).catch(error => status(error.message));
    });
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const items = [...root.querySelectorAll('button:not(:disabled), textarea, input, select, summary')].filter(el => el.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
  }
  async function open(id = state.activeChatId, tab = 'intent', timestamp) {
    if (!state.chats[id]) return;
    if (!root) create();
    if (controller) { root.hidden = false; if (id !== chatId) status('当前讨论仍在请求中，请先停止或等待完成，再打开其他聊天。'); return; }
    const revision = ++openRevision;
    if (record && !root.hidden) { capture(); await persist(); }
    previousFocus = document.activeElement;
    const loaded = await G().loadDiscussion(id);
    if (revision !== openRevision) return;
    chatId = id;
    record = loaded;
    session = record.sessions.find(s => s.id === record.currentId);
    if (!session || timestamp != null) {
      session = G().newSession(chat(), timestamp);
      record.sessions.push(session); record.currentId = session.id;
    }
    session.tab = tab;
    editPreferenceId = null;
    root.hidden = false;
    await persist(); await render();
    $('[data-action="close"]').focus();
  }
  function close() {
    capture(); persist(); root.hidden = true;
    previousFocus?.focus?.();
  }
  function requirements() {
    const stale = session.requirementsRevision != null && session.requirementsRevision < session.messages.length;
    return `<label class="mc-label">调整要求（可编辑）<textarea data-guidance rows="4" placeholder="例如：更温柔一点、可爱一点，不要替我说话……">${esc(session.guidance)}</textarea></label>
      ${stale ? '<p class="mc-muted">讨论有新内容；现有要求保留，可以重新整理。</p>' : ''}
      <div class="mc-row"><label class="mc-label">生效范围<select data-scope><option value="once">仅这次重生成</option><option value="next">下一次主动回复</option><option value="chat">此聊天持续生效</option><option value="global">全局持续生效</option></select></label>
      <label class="mc-label">调整方式<select data-mode><option value="expression" ${session.mode === 'expression' ? 'selected' : ''}>保留原意，调整表达</option><option value="rewrite" ${session.mode === 'rewrite' ? 'selected' : ''}>保留情境，重新发挥</option></select></label></div>
      <div class="mc-actions">${btn('apply', '应用要求', 'class="mc-primary"')}${btn('clear-guidance', '清空要求')}${session.undo ? btn('undo', '撤销采用') : ''}</div>
      <p class="mc-muted">仅这次会先生成候选，采用前原回复保留。持续偏好需主动保存；请求失败不会消耗下一次要求。</p>`;
  }
  async function render() {
    const revision = ++renderRevision;
    const current = chat();
    if (!current || !session) return;
    $('[id="mc-title"]').textContent = `生成调整 · ${current.name}`;
    root.querySelectorAll('.mc-tabs button').forEach(b => { const selected = b.dataset.action === `tab-${session.tab}`; b.setAttribute('aria-selected', String(selected)); b.classList.toggle('active', selected); });
    const target = session.target;
    const targetText = target?.original.filter(m => !m.isHidden).map(m => `${m.senderName || current.name}：${G().textOf(m)}`).join('\n') || '没有可重写的角色回复，仍然可以沟通或保存偏好。';
    let body = `<div class="mc-row"><label class="mc-label mc-grow">讨论记录<select data-session>${record.sessions.map((s, i) => `<option value="${esc(s.id)}" ${s.id === session.id ? 'selected' : ''}>${i + 1} · ${esc(new Date(s.createdAt).toLocaleString('zh-CN'))}</option>`).join('')}</select></label>${btn('new', '新讨论')}</div>
      <details class="mc-reference"><summary>讨论目标 · ${esc(targetText.replace(/\s+/g, ' ').slice(0, 38))}</summary><div class="mc-plain">${esc(targetText)}</div>${btn('refresh-target', '选择最新一轮')}</details>
      ${target && !target.canGenerate ? '<p class="mc-muted">这是历史讨论目标，可以沟通和保存偏好；重生成请选最新一轮。</p>' : ''}
      ${current.isGroup ? `<label class="mc-label">作用成员<select data-member><option value="">整轮群聊</option>${(current.members || []).map(m => { const name = m.originalName || m.groupNickname; return `<option value="${esc(name)}" ${session.member === name ? 'selected' : ''}>${esc(m.groupNickname || name)}</option>`; }).join('')}</select></label>` : ''}`;
    if (session.tab === 'intent') {
      body += `<p class="mc-muted">原“重新生成”按钮仍可直接使用。这里可以附加本次意向。</p><div class="mc-chips">${['更温柔', '更可爱', '自然一点', '简短一点', '详细一点', '少些动作描写', '不替我说话'].map(t => btn('tag', esc(t), `data-value="${esc(t)}"`)).join('')}</div>${requirements()}`;
    } else if (session.tab === 'talk') {
      let model = '未配置'; try { model = G().resolveApi(current, session.apiSource).model; } catch (_) {}
      body += `<p class="mc-muted">可以直接吐槽模型。此处对话不进入角色聊天、记忆或关系；你决定是否应用调整。</p>
        <details class="mc-reference"><summary>沟通设置 · ${esc(model)}</summary><div class="mc-row"><label class="mc-label">API 配置<select data-api-source><option value="chat" ${session.apiSource === 'chat' ? 'selected' : ''}>沿用此聊天</option><option value="global" ${session.apiSource === 'global' ? 'selected' : ''}>全局配置</option></select></label><label class="mc-label">参考消息数<input type="number" data-context-limit min="1" max="100" value="${esc(session.contextLimit)}"></label></div>
        <p class="mc-muted">只读取选定目标前的可见、未排除消息和人设，以及最近 24 条沟通和讨论摘要。完整沟通记录仍保留。发送、整理要求及整理摘要会调用所配置的模型服务；打开面板不会调用。</p>${session.summary ? `<div class="mc-plain">讨论摘要：${esc(session.summary)}</div>` : ''}</details>
        <div class="mc-transcript" aria-label="与模型的独立讨论">${session.messages.map((m, i) => `<div class="mc-message ${m.role === 'user' ? 'mc-user' : ''}"><span class="mc-speaker">${m.role === 'user' ? '我 → 模型' : '模型'}</span><div class="mc-plain">${esc(m.content)}</div><div class="mc-actions">${btn('copy', '复制', `data-index="${i}"`)}${m.role === 'user' ? btn('edit-send', '编辑重发', `data-index="${i}"`) : ''}${m.role === 'assistant' ? btn('use-answer', '作为调整草稿', `data-index="${i}"`) : ''}</div></div>`).join('') || '<p class="mc-muted">告诉模型哪里写得让你不舒服，也可以先吐槽。聊完后可以只关闭，不应用任何调整。</p>'}</div>
        <label class="mc-label">对模型说<textarea data-draft rows="3" placeholder="比如：你怎么又把他写得这么凶，他明明很温柔……">${esc(session.draft)}</textarea></label>
        <div class="mc-actions">${btn('send', '发送给模型', 'class="mc-primary"')}${btn('retry', '重试上次')}${btn('stop', '停止')}${btn('summarize', '整理调整要求')}${btn('summary', '整理讨论摘要')}</div>${requirements()}`;
    } else {
      const rows = await G().preferences(chatId);
      const labels = { global: '全局', chat: '此聊天', next: '下一次主动回复' };
      body += `<p class="mc-muted">仅这里启用的偏好影响后续生成。原始模型沟通不进入角色记录。</p>${rows.map(p => `<div class="mc-preference"><div class="mc-muted">${labels[p.scope]} · ${p.enabled === false ? '已关闭' : '生效中'}${p.member ? ` · ${esc(p.member)}` : ''}</div><div class="mc-plain">${esc(p.text)}</div><div class="mc-actions">${btn('edit-pref', '编辑', `data-id="${esc(p.id)}"`)}${btn('toggle-pref', p.enabled === false ? '启用' : '关闭', `data-id="${esc(p.id)}"`)}${btn('delete-pref', '删除', `data-id="${esc(p.id)}"`)}</div></div>`).join('') || '<p class="mc-muted">尚未保存生成偏好。</p>'}${requirements()}`;
    }
    if (session.candidates.length) {
      body += `<div class="mc-candidates"><p class="mc-label">候选回复 · 原回复尚未修改</p><p class="mc-muted">已发生的转账、动态等行动会保留，不撤销或重复执行。</p>${session.candidates.map((c, i) => {
        const preview = parseAiResponse(c.content).filter(a => a.type !== 'thought_chain_block').map(a => `${a.name ? a.name + '：' : ''}${G().textOf(a)}`).join('\n\n');
        return `<details class="mc-reference" ${i === session.candidates.length - 1 ? 'open' : ''}><summary>候选 ${i + 1}</summary><div class="mc-plain">${esc(preview)}</div><details><summary>使用的要求</summary><div class="mc-plain">${esc(c.guidance || '沿用当前设定')}</div></details><div class="mc-actions">${btn('adopt', '采用此回复', `class="mc-primary" data-id="${esc(c.id)}"`)}${btn('feedback', '和模型讨论此候选', `data-id="${esc(c.id)}"`)}${btn('discard', '放弃', `data-id="${esc(c.id)}"`)}</div></details>`;
      }).join('')}</div>`;
    }
    body += `<div class="mc-actions mc-record-tools">${btn('export', '导出此讨论')}${btn('delete-discussion', '删除此讨论')}</div>`;
    if (revision !== renderRevision || current.id !== chatId) return;
    $('[data-body]').innerHTML = body;
    $('[data-scope]').value = session.scope || 'once';
    if (editPreferenceId) $('[data-scope]').value = (await db.generationPreferences.get(editPreferenceId))?.scope || 'chat';
    setBusy(!!controller);
    window.ChoicePicker?.enhance(root);
  }
  function setBusy(value) {
    root.querySelectorAll('button').forEach(b => { b.disabled = value && !['close', 'stop'].includes(b.dataset.action); });
    root.querySelectorAll('select, textarea, input').forEach(el => { el.disabled = value; });
    const stop = $('[data-action="stop"]'); if (stop) stop.disabled = !value;
    window.ChoicePicker?.enhance(root);
  }
  async function run(label, operation, canStop = true) {
    if (controller) throw new Error('正在请求中，请等待或停止。');
    controller = new AbortController(); setBusy(true); status(label);
    if (!canStop && $('[data-action="stop"]')) $('[data-action="stop"]').disabled = true;
    try { await operation(controller.signal); await persist(); await render(); status('已完成，角色记录未自动修改。'); return true; }
    catch (error) { await persist(); status(error.name === 'AbortError' ? '已停止，原回复和草稿保留。' : error.message); return false; }
    finally { controller = null; setBusy(false); }
  }
  async function action(name, data) {
    if (name === 'close') { close(); return; }
    if (name === 'stop') { controller?.abort(); return; }
    if (controller) return;
    capture();
    const current = chat();
    if (!current) throw new Error('此聊天已删除。');
    if (name.startsWith('tab-')) { session.tab = name.slice(4); await persist(); await render(); return; }
    if (name === 'new') { session = G().newSession(current); record.sessions.push(session); record.currentId = session.id; editPreferenceId = null; }
    if (name === 'refresh-target') { session.target = current.history.length ? G().targetFor(current) : null; session.candidates = []; session.undo = null; }
    if (name === 'tag') {
      if (data.value === '简短一点') session.guidance = session.guidance.replace(/详细一点[、，]?/g, '');
      if (data.value === '详细一点') session.guidance = session.guidance.replace(/简短一点[、，]?/g, '');
      if (!session.guidance.includes(data.value)) session.guidance = [session.guidance, data.value].filter(Boolean).join('，');
    }
    if (name === 'clear-guidance') { session.guidance = ''; editPreferenceId = null; }
    if (name === 'send' || name === 'retry') {
      let message = session.draft.trim();
      if (name === 'retry') { const last = session.messages.at(-1); if (last?.role !== 'user') throw new Error('上一条已有模型回应。可以编辑重发，或发送新的反馈。'); }
      else {
        if (!message) throw new Error('请先输入想对模型说的话。');
        session.messages.push({ role: 'user', content: message, timestamp: Date.now() }); session.draft = '';
      }
      await persist(); await render();
      await run('正在和模型沟通…', async signal => { const answer = await G().talk(current, session, null, signal); session.messages.push({ role: 'assistant', content: answer, timestamp: Date.now() }); });
      return;
    }
    if (name === 'summarize' || name === 'summary') {
      if (!session.messages.length) throw new Error('请先和模型沟通，或直接填写调整要求。');
      if (name === 'summarize' && session.guidance.trim() && !await showCustomConfirm('重新整理', '将替换当前调整草稿，是否继续？')) return;
      await run(name === 'summary' ? '正在整理讨论摘要…' : '正在整理可编辑的调整要求…', async signal => {
        const instruction = name === 'summary' ? '仅整理这次幕后讨论的简短摘要，保留用户偏好、问题和未决事项，不当作剧情事实。' : '根据讨论只输出可直接使用的生成调整要求，明确保留、改变和避免的内容，不包含原始辱骂、道歉或模型对话，不凭空增加要求。';
        const result = await G().talk(current, session, instruction, signal);
        if (name === 'summary') session.summary = result;
        else { session.guidance = result; session.requirementsRevision = session.messages.length; }
      }); return;
    }
    if (name === 'apply') {
      const scope = $('[data-scope]').value;
      if (scope === 'once') {
        if (!session.target) throw new Error('还没有可重生成的角色回复，可以选择用于下一次回复。');
        await run('正在生成候选，原回复保留…', async signal => {
          const result = await G().candidate(current, session, signal);
          session.candidates.push(result);
        }); return;
      }
      if (scope === 'global' && !await showCustomConfirm('全局生成偏好', '此要求会影响所有聊天。是否保存？')) return;
      const row = await G().savePreference(chatId, session.guidance, scope, session.member, editPreferenceId);
      editPreferenceId = null;
      await persist(); await render(); status(row.scope === 'next' ? '已保存：下一次主动回复使用，失败后保留。' : '生成偏好已保存，可以在“生成偏好”中关闭或编辑。'); return;
    }
    if (name === 'adopt') {
      const item = session.candidates.find(c => c.id === data.id);
      if (!item) throw new Error('此候选已不存在。');
      const adopted = await run('正在采用候选…', async () => { await G().adopt(current, session, item); }, false);
      if (adopted) status('已采用。可以撤销；已有行动保持原状。'); return;
    }
    if (name === 'undo') { await G().undo(current, session); await persist(); await render(); status('已恢复采用前的回复。'); return; }
    if (name === 'feedback') {
      const item = session.candidates.find(c => c.id === data.id);
      session.draft = `讨论这个候选回复：\n${parseAiResponse(item.content).filter(m => m.type !== 'thought_chain_block').map(G().textOf).join('\n')}\n\n我的反馈：`;
      session.tab = 'talk';
    }
    if (name === 'discard') session.candidates = session.candidates.filter(c => c.id !== data.id);
    if (name === 'copy') { await copyTextToClipboard(session.messages[Number(data.index)].content); status('已复制。'); return; }
    if (name === 'edit-send') { session.draft = session.messages[Number(data.index)].content; }
    if (name === 'use-answer') { session.guidance = session.messages[Number(data.index)].content; session.requirementsRevision = session.messages.length; }
    if (name === 'edit-pref') {
      const row = await db.generationPreferences.get(data.id);
      session.guidance = row.text; session.member = row.member || ''; session.scope = row.scope; editPreferenceId = row.id;
    }
    if (name === 'toggle-pref') { const row = await db.generationPreferences.get(data.id); row.enabled = row.enabled === false; row.updatedAt = Date.now(); await db.generationPreferences.put(row); }
    if (name === 'delete-pref') { if (!await showCustomConfirm('删除生成偏好', '删除后不再应用这条要求。')) return; await db.generationPreferences.delete(data.id); }
    if (name === 'export') {
      const blob = new Blob([JSON.stringify({ chatName: current.name, discussion: session }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = '模型沟通记录.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); status('已导出此讨论。'); return;
    }
    if (name === 'delete-discussion') {
      if (!await showCustomConfirm('删除此讨论', '此讨论、草稿及候选会删除，角色聊天和已保存偏好保留。')) return;
      record.sessions = record.sessions.filter(s => s.id !== session.id);
      session = record.sessions.at(-1) || G().newSession(current);
      if (!record.sessions.length) record.sessions.push(session);
      record.currentId = session.id; editPreferenceId = null;
    }
    await persist(); await render(); status('已保存。');
  }
  function init() {
    for (const type of ['voice', 'video']) document.getElementById(`${type}-model-communication-btn`)?.addEventListener('click', () => {
      const call = type === 'voice' ? voiceCallState : videoCallState;
      open(call.activeChatId, 'talk').then(() => status('通话中的要求可保存为下一次主动回复或持续偏好；沟通内容不会播报。')).catch(e => showCustomAlert('模型沟通', esc(e.message)));
    });
    document.getElementById('generation-adjustments-btn')?.addEventListener('click', () => open().catch(e => showCustomAlert('生成调整', esc(e.message))));
    document.getElementById('model-communication-btn')?.addEventListener('click', () => open(state.activeChatId, 'talk').catch(e => showCustomAlert('模型沟通', esc(e.message))));
    document.getElementById('generation-preferences-btn')?.addEventListener('click', () => open(state.activeChatId, 'preferences').catch(e => showCustomAlert('生成偏好', esc(e.message))));
    document.getElementById('discuss-message-btn')?.addEventListener('click', () => {
      const timestamp = activeMessageTimestamp;
      document.getElementById('message-actions-modal').classList.remove('visible');
      open(state.activeChatId, 'talk', timestamp).catch(e => showCustomAlert('模型沟通', esc(e.message)));
    });
  }
  window.ModelCommunication = { open };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
