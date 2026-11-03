(function () {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const names = { diary: '日记式', structured: '结构化', vector: '向量记忆' };
  let closeActive = null;
  const gm = () => window.GroupMemory;
  function icon(name) {
    const paths = { book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V5a1 1 0 0 1 1-1Z"/><path d="M4 16h15M8 8h7M8 11h5"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>', plus: '<path d="M12 5v14M5 12h14"/>', upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>', download: '<path d="M12 4v12m-5-5 5 5 5-5M4 17v3h16v-3"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>', edit: '<path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14v6Z"/>', trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>', spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>' };
    return `<svg class="gm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.book}</svg>`;
  }
  function load(chat) {
    const host = document.getElementById('group-memory-settings');
    if (!host) return;
    host.hidden = !chat.isGroup;
    if (!chat.isGroup) { host.innerHTML = ''; return; }
    host.innerHTML = `<div class="gm-settings-heading"><span class="gm-emblem">${icon('book')}</span><div><strong>让每段故事各自被记住</strong><p>为这个群选择合适的记忆方式</p></div></div><label for="group-memory-mode">群聊记忆归属</label>
      <select id="group-memory-mode"><option value="shared">共享成员的私聊记忆</option><option value="independent">每位成员拥有本群独立记忆</option></select>
      <p class="settings-desc">独立记忆按群和成员分别保存，不写回私聊，也不供其他聊天读取。切换模式保留两边已有记忆。</p>
      <div id="group-memory-independent-options">
        <label for="group-memory-links">其他聊天的挂载记忆</label>
        <select id="group-memory-links"><option value="strict">严格隔离（默认）</option><option value="allow">允许主动挂载例外</option></select>
        <p id="group-memory-links-note" class="settings-desc"></p>
        <fieldset><legend>允许生成本群记忆的 NPC</legend><div class="gm-npc-options">${gm().members(chat).filter(m => m.isNpc).map(m => `<label class="gm-check"><input type="checkbox" data-group-memory-npc value="${escape(m.id)}" ${(chat.settings.groupMemoryNpcIds || []).map(String).includes(String(m.id)) ? 'checked' : ''}><span>${escape(m.groupNickname || m.originalName)}</span></label>`).join('') || '<p class="settings-desc">本群暂无 NPC。添加后可在这里选择。</p>'}</div></fieldset>
        <p class="settings-desc">首次开启从此后的消息开始积累。旧群聊记录可在管理页选择范围补建，会调用 API。</p>
      </div><button type="button" id="group-memory-manage"><span>${icon('book')}管理本群独立记忆／补建旧记录</span>${icon('arrow')}</button>`;
    const selector = host.querySelector('#group-memory-mode'), links = host.querySelector('#group-memory-links');
    selector.value = gm().independent(chat) ? 'independent' : 'shared';
    links.value = chat.settings.groupMemoryAllowLinks === true ? 'allow' : 'strict';
    const refresh = () => {
      host.querySelector('#group-memory-independent-options').hidden = selector.value !== 'independent';
      host.querySelector('#group-memory-links-note').textContent = links.value === 'allow'
        ? '例外已选择：保存后会读取明确挂载的其他聊天。本群记忆不写回对方，其他独立群仍保持隔离。'
        : '保存后不读取任何已挂载聊天；已有挂载选择保留，切回共享模式仍可使用。';
    };
    selector.onchange = links.onchange = refresh; refresh();
    window.ChoicePicker?.enhance(host);
    host.querySelector('#group-memory-manage').onclick = () => {
      if (!gm().independent(chat) && !chat.groupMemory) { showToast('请先选择独立记忆并保存聊天设置', 'info'); return; }
      open(chat);
    };
  }
  async function save(chat) {
    const host = document.getElementById('group-memory-settings');
    if (!chat.isGroup || !host?.querySelector('#group-memory-mode')) return;
    await gm().configure(chat, {
      mode: host.querySelector('#group-memory-mode').value,
      allowLinks: host.querySelector('#group-memory-links').value === 'allow',
      npcIds: [...host.querySelectorAll('[data-group-memory-npc]:checked')].map(input => input.value)
    });
  }
  function download(chat) {
    const body = JSON.stringify({ fileType: 'ephone-group-memory', version: 1, groupName: chat.name, data: gm().transfer(chat) }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${String(chat.name || '群聊').replace(/[\\/:*?"<>|]/g, '_')}-独立记忆.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function open(chat) {
    closeActive?.();
    const panel = document.createElement('div'); panel.id = 'group-memory-panel'; panel.className = 'gm-overlay';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', '本群独立记忆');
    const previousFocus = document.activeElement;
    let selectedId = String(gm().members(chat)[0]?.id || ''), running = gm().locks.has(String(chat.id)), status = '';
    const member = () => gm().members(chat).find(m => String(m.id) === selectedId);
    let unsubscribe = () => {};
    const close = () => { window.ChoicePicker?.close(); unsubscribe(); panel.remove(); closeActive = null; previousFocus?.focus(); };
    closeActive = close;
    const form = { source: 'new', targets: 'one', start: 1, end: gm().eligible(chat).length, batch: 30 };
    const report = error => { status = error.message; render(); };
    function render() {
      for (const field of ['source', 'targets', 'start', 'end', 'batch']) {
        const input = panel.querySelector('#gm-' + field); if (input) form[field] = input.value;
      }
      const current = member(), data = current && gm().archive(chat, current), selectedMode = gm().mode(chat);
      const all = gm().eligible(chat), active = gm().independent(chat);
      const enabled = current && gm().enabled(chat, current);
      let rows = selectedMode === 'diary' ? data?.longTermMemory || [] : selectedMode === 'vector' ? data?.variableMemory?.fragments || [] : [];
      if (selectedMode === 'structured' && data) {
        const scoped = gm().actor(chat, current, JSON.parse(JSON.stringify(data)));
        const mem = window.structuredMemoryManager.getStructuredMemory(scoped);
        rows = Object.entries(mem.facts).map(([k, v], i) => ({ content: k + '=' + v, category: 'F', index: i, label: '偏好/事实' }));
        let index = 0;
        for (const ym of Object.keys(mem.events).sort()) for (const text of mem.events[ym].split('|')) rows.push({ content: text, category: 'E', index: index++, label: '事件 · ' + ym });
        for (const [field, category, label] of [['decisions','D','决定'], ['plans','P','计划'], ['emotions','M','情绪']])
          mem[field].forEach((text, i) => rows.push({ content: text, category, index: i, label }));
        if (mem.relationship) rows.push({ content: mem.relationship, category: 'R', index: 0, label: '关系' });
        for (const [category, values] of Object.entries(mem._custom || {})) values.forEach((text, i) => rows.push({ content: text, category, index: i, label: mem._customCategories[category]?.name || category }));
      }
      panel.innerHTML = `<section class="gm-dialog"><header><span class="gm-emblem">${icon('book')}</span><div class="gm-heading"><small>${escape(chat.name)}</small><h2>本群独立记忆</h2></div><button type="button" class="gm-close" data-close aria-label="关闭独立记忆">${icon('close')}</button></header>
        <div class="gm-body"><div class="gm-isolation">${icon('shield')}<span>${chat.settings.groupMemoryAllowLinks === true && active ? '已允许主动挂载例外' : '严格隔离'}<small>${active ? '每位成员，只记住自己的群内经历' : '共享模式中，独立档案仍为你保留'}</small></span></div>
        <section class="gm-member-card"><div class="gm-section-label"><label for="gm-member">查看成员</label><span class="gm-mode-badge">${names[selectedMode]}</span></div><select id="gm-member">${gm().members(chat).map(m => `<option value="${escape(m.id)}" ${String(m.id) === selectedId ? 'selected' : ''}>${escape(m.groupNickname || m.originalName)}${m.isNpc ? ' · NPC' : ''}</option>`).join('')}</select>
        <p class="gm-note gm-mode-note">可在聊天设置中切换记忆模式，已有数据保留。</p></section>
        ${!enabled ? '<p class="gm-note">该 NPC 尚未启用记忆。请在聊天设置中勾选并保存。</p>' : ''}
        <div class="gm-actions gm-toolbar"><button class="gm-primary" data-add ${!enabled || running ? 'disabled' : ''}>${icon('plus')}${selectedMode === 'structured' ? '添加条目' : '添加记忆'}</button><button data-import-open ${running ? 'disabled' : ''}>${icon('upload')}导入</button><button data-export aria-label="导出本群全部成员">${icon('download')}导出</button><input type="file" hidden accept=".json,application/json" data-import ${running ? 'disabled' : ''} aria-label="导入群记忆文件"></div>
        <div class="gm-section-label gm-records-label"><strong>记忆片段</strong><span>${rows.length} 条</span></div>
        <div class="gm-memories">${rows.map((row, i) => `<article><div class="gm-memory-meta"><small>${escape(row.label || names[selectedMode])}</small><span>${String(i + 1).padStart(2, '0')}</span></div><p>${escape(row.content)}</p><div class="gm-actions gm-row-actions"><button data-edit="${i}" ${running || !enabled ? 'disabled' : ''}>${icon('edit')}编辑</button><button class="gm-danger" data-delete="${i}" ${running || !enabled ? 'disabled' : ''}>${icon('trash')}删除</button></div></article>`).join('') || `<div class="gm-empty"><span class="gm-empty-icon">${icon('book')}</span><strong>故事的记忆，从这里开始</strong><p>添加一段经历，或从群聊记录中整理。</p></div>`}</div>
        <section class="gm-summary"><div class="gm-section-label"><h3>${icon('spark')}整理与补建</h3><span>按需整理</span></div><details class="gm-summary-help"><summary>总结说明</summary><p>已完成的批次会保留，重试跳过已处理消息。每位选中成员每批调用一次 API；向量模式还会调用已配置的向量接口。</p></details>
        <label for="gm-source">消息来源</label><select id="gm-source"><option value="new">开启后尚未总结的新消息</option><option value="range">选择旧记录范围补建</option></select>
        <div id="gm-range" hidden><p class="gm-note">按时间从早到晚排列，共 ${all.length} 条可用消息。</p><div class="gm-range"><label>起始条数<input id="gm-start" type="number" min="1" max="${all.length}" value="1"></label><label>结束条数<input id="gm-end" type="number" min="1" max="${all.length}" value="${all.length}"></label></div><p id="gm-range-note" class="gm-note"></p></div>
        <label for="gm-targets">总结对象</label><select id="gm-targets"><option value="one">仅当前成员</option><option value="all">全部已启用记忆的成员</option></select>
        <label>每批消息数<input id="gm-batch" type="number" min="1" max="100" value="30"></label>
        <div class="gm-actions gm-summary-actions"><button class="gm-primary" data-summarize ${running || !active || !enabled ? 'disabled' : ''}>${icon('spark')}${running ? '正在整理…' : '开始总结（调用 API）'}</button><button data-stop ${running ? '' : 'disabled'}>停止</button></div>
        <p class="gm-status" role="status">${escape(status || chat.groupMemory?.error || '')}</p></section></div></section>`;
      panel.querySelector('[data-close]').onclick = close;
      panel.querySelector('#gm-member').onchange = event => { selectedId = event.target.value; render(); };
      panel.querySelector('[data-export]').onclick = () => download(chat);
      panel.querySelector('[data-import-open]').onclick = () => panel.querySelector('[data-import]').click();
      const showEditor = (text, onSave, placeholder, addingStructured = false) => {
        panel.querySelector('.gm-editor')?.remove();
        const editor = document.createElement('form'); editor.className = 'gm-editor';
        const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        editor.innerHTML = `${addingStructured ? `<label>记忆分类<select data-category><option value="E">事件</option><option value="F">偏好／事实</option><option value="D">决定</option><option value="P">计划</option><option value="R">关系变化</option><option value="M">情绪</option></select></label><label>事件日期<input data-date type="date" value="${today}" required></label>` : ''}<label>记忆正文<textarea rows="10" required placeholder="${escape(placeholder || '')}">${escape(text || '')}</textarea></label><div class="gm-actions"><button type="submit">保存记忆</button><button type="button" data-cancel>取消</button></div><p role="status"></p>`;
        panel.querySelector('.gm-memories').prepend(editor);
        editor.querySelector('[data-cancel]').onclick = () => editor.remove();
        editor.onsubmit = async event => { event.preventDefault(); const text = editor.querySelector('textarea').value.trim(); if (!text) return; try { if (addingStructured) await gm().addStructured(chat, selectedId, text, editor.querySelector('[data-category]').value, editor.querySelector('[data-date]').value); else await onSave(text); render(); } catch (error) { editor.querySelector('[role=status]').textContent = error.message; } };
        window.ChoicePicker?.enhance(editor);
        editor.querySelector('textarea').focus();
      };
      panel.querySelector('[data-add]').onclick = () => showEditor('', text => gm().saveEntry(chat, selectedId, text), '记录此成员在本群的经历', selectedMode === 'structured');
      panel.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => showEditor(rows[Number(button.dataset.edit)].content, text => gm().saveEntry(chat, selectedId, text, selectedMode === 'structured' ? rows[Number(button.dataset.edit)] : Number(button.dataset.edit))));
      panel.querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => { if (!await showCustomConfirm('删除本群记忆', '仅删除此成员在本群的这一条记忆，确定继续？')) return; try { await gm().saveEntry(chat, selectedId, null, selectedMode === 'structured' ? rows[Number(button.dataset.delete)] : Number(button.dataset.delete)); render(); } catch (error) { report(error); } });
      panel.querySelector('[data-import]').onchange = async event => {
        const file = event.target.files[0]; if (!file) return;
        try {
          const value = JSON.parse(await file.text());
          if (value.fileType !== 'ephone-group-memory') throw new Error('请选择本群独立记忆导出文件');
          if (!await showCustomConfirm('合并群记忆', '按成员 ID 合并到本群；同名但 ID 不同的成员不会混入。已有记忆保留，是否继续？')) return;
          await gm().persist(chat, gm().merge(chat, value.data)); status = '群记忆已合并'; render();
        } catch (error) { report(error); }
      };
      const source = panel.querySelector('#gm-source');
      for (const field of ['source', 'targets', 'start', 'end', 'batch']) panel.querySelector('#gm-' + field).value = form[field];
      const showRange = () => { panel.querySelector('#gm-range').hidden = source.value !== 'range'; };
      source.onchange = showRange; showRange();
      const rangeNote = () => {
        const start = all[Number(panel.querySelector('#gm-start').value) - 1], end = all[Number(panel.querySelector('#gm-end').value) - 1];
        panel.querySelector('#gm-range-note').textContent = start && end ? `${new Date(start.timestamp).toLocaleString('zh-CN')} 至 ${new Date(end.timestamp).toLocaleString('zh-CN')}` : '请填写有效的起止位置';
      };
      panel.querySelector('#gm-start').oninput = panel.querySelector('#gm-end').oninput = rangeNote; rangeNote();
      panel.querySelector('[data-stop]').onclick = () => { gm().stop(chat); status = '正在停止；此前保存的批次保留。'; panel.querySelector('[role=status]').textContent = status; };
      panel.querySelector('[data-summarize]').onclick = async () => {
        const options = { batchSize: Number(panel.querySelector('#gm-batch').value) };
        if (panel.querySelector('#gm-targets').value === 'one') options.memberIds = [selectedId];
        if (source.value === 'range') options.range = { start: Number(panel.querySelector('#gm-start').value), end: Number(panel.querySelector('#gm-end').value) };
        if (!await showCustomConfirm('总结本群独立记忆', '将把选定的群聊记录发送给已配置的模型，为选中的成员分别整理记忆，会消耗 API 额度。是否开始？')) return;
        running = true; status = '正在整理…'; render();
        try { const count = await gm().summarize(chat, { ...options, onProgress: text => { status = text; if (panel.isConnected) panel.querySelector('.gm-status').textContent = text; } }); status = count ? `已保存 ${count} 个成员批次。` : '没有尚未处理的消息。'; }
        catch (error) { status = error.message + '；此前完成的批次已保留。'; }
        finally { running = false; if (panel.isConnected) render(); }
      };
      if (running) panel.querySelectorAll('.gm-summary input,.gm-summary select').forEach(input => { input.disabled = true; });
      panel.querySelectorAll('input[type="number"]').forEach(input => {
        const inputLabel = input.labels?.[0]?.textContent.trim() || '数量';
        input.setAttribute('aria-label', inputLabel);
        const stepper = document.createElement('div'); stepper.className = 'gm-stepper';
        input.parentNode.insertBefore(stepper, input);
        const makeStep = (text, delta) => {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
          button.setAttribute('aria-label', `${delta < 0 ? '减少' : '增加'}${inputLabel}`);
          button.disabled = input.disabled;
          button.onclick = () => { delta < 0 ? input.stepDown() : input.stepUp(); input.dispatchEvent(new Event('input', { bubbles: true })); };
          return button;
        };
        const decrease = makeStep('−', -1), increase = makeStep('+', 1);
        stepper.append(decrease, input, increase);
      });
      window.ChoicePicker?.enhance(panel);
    }
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { close(); return; }
      if (event.key !== 'Tab') return;
      const controls = [...panel.querySelectorAll('button,input,select,textarea')].filter(el => !el.disabled && el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    unsubscribe = gm().subscribe(changed => {
      if (String(changed.id) !== String(chat.id)) return;
      if (!panel.isConnected) { unsubscribe(); return; }
      running = gm().locks.has(String(chat.id));
      status = chat.groupMemory?.error || '本群记忆任务已结束。'; render();
    });
    (document.getElementById('phone-screen') || document.body).appendChild(panel); render(); panel.querySelector('[data-close]').focus();
  }
  window.GroupMemoryUI = { load, save, open };
})();
