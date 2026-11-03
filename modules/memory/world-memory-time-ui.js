(function () {
  'use strict';
  const engine = () => window.MemoryWorldTime;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const toast = (message, type = 'success') => window.showToast?.(message, type);
  function select(key, label, value, options) {
    return `<label class="memory-time-row"><span>${label}</span><select data-memory-time="${key}" class="settings-select memory-time-select">${options.map(([id, text]) => `<option value="${id}" ${id === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
  }
  function toggle(key, label, value) {
    return `<div class="memory-time-row"><span>${label}</span><label class="toggle-switch"><input type="checkbox" data-memory-time="${key}" ${value ? 'checked' : ''}><span class="slider"></span></label></div>`;
  }
  function render(chat) {
    const e = engine();
    const c = e.config(chat);
    const current = e.clock(chat);
    const own = chat.settings.memoryTime;
    const timelines = c.timelines || [{ id: c.timelineId, name: c.timelineName }];
    return `<div class="memory-time-settings" data-memory-time-chat="${escape(chat.id)}">
      ${toggle('linked', '新记忆跟随世界时间', c.linked)}
      <div class="memory-time-help" data-memory-time-status aria-live="polite"></div>
      <div class="memory-time-help">自动保存，只影响之后的新消息；旧记忆不改动。</div>
      <button type="button" class="memory-time-disclosure" data-memory-time-expand aria-expanded="false"><span>时间规则</span><span data-memory-time-expand-label>展开</span></button>
      <div data-memory-time-advanced hidden>
        ${select('scope', '规则来源', !own || own.inherit !== false ? 'global' : 'chat', [['global', '跟随全局默认'], ['chat', '本聊天单独设置']])}
        ${select('explicitPriority', '原文明示日期', c.explicitPriority, [['text', '尊重原文日期'], ['world', '优先消息世界时间']])}
        ${select('relativeBasis', '今天／昨天／明天', c.relativeBasis, [['world', '按消息世界日期'], ['real', '按现实消息日期']])}
        ${select('undated', '当场事件无明示日期', c.undated, [['message', '使用消息发生时间'], ['unknown', '标为时间不明']])}
        <div class="memory-time-help">模糊往事不会自动盖上今天；计划分别记录提出日期与执行日期。</div>
        ${select('decayBasis', '新记忆时间衰减', c.decayBasis, [['world', '按世界时间'], ['real', '按现实时间'], ['off', '不按时间衰减']])}
        <label class="memory-time-row"><span>衰减半衰期（天）</span><input data-memory-time="halfLifeDays" class="settings-num-input memory-time-number" type="number" min="0.01" step="any" value="${c.halfLifeDays}"></label>
        <div class="memory-time-actions"><button type="button" data-memory-time-save-global>将这些规则保存为全局默认</button></div>
        ${select('clockMode', '本聊天世界时钟', c.clockMode, [['global', '使用现有世界时钟'], ['independent', '使用独立世界时钟']])}
        <div data-memory-time-own-clock ${c.clockMode === 'independent' ? '' : 'hidden'}>
          <label class="memory-time-field"><span>独立日期与时间</span><input data-memory-clock-date type="datetime-local" class="settings-num-input" value="${e.toInput(current.time, current.timeZone)}"></label>
          <label class="memory-time-field"><span>时区</span><input data-memory-clock-zone class="settings-num-input" value="${escape(current.timeZone)}" placeholder="Asia/Shanghai 或 UTC"></label>
          <label class="memory-time-row"><span>流逝倍率</span><input data-memory-clock-rate type="number" min="0" step="any" class="settings-num-input memory-time-number" value="${current.rate}"></label>
          <div class="memory-time-actions"><button type="button" data-memory-clock-apply>应用独立时间</button><button type="button" data-memory-clock-pause>${current.paused ? '继续独立时间' : '暂停独立时间'}</button></div>
          <div class="memory-time-help">倍率 1 为正常流逝，0 为固定时间。修改日期只影响之后消息。</div>
        </div>
        ${select('timelineId', '当前时间线', c.timelineId, timelines.map(item => [escape(item.id), escape(item.name)]))}
        <div class="memory-time-actions"><button type="button" data-memory-time-new-timeline>新建时间线</button></div>
        ${toggle('includeOtherEvents', '调用其他时间线的事件', c.includeOtherEvents)}
        ${toggle('shareFacts', '共享其他时间线的设定', c.shareFacts)}
        <div class="memory-time-help">共享设定包含核心、用户／角色设定和禁忌规则。已有旧记忆仍按原逻辑使用。</div>
      </div>
    </div>`;
  }
  function refresh(root, chat) {
    const c = engine().config(chat);
    const current = engine().clock(chat);
    const status = root.querySelector('[data-memory-time-status]');
    const usesWorld = c.linked && current.enabled;
    status.textContent = `当前使用${usesWorld ? '世界' : '现实'}时间：${engine().format(usesWorld ? current.time : Date.now(), current.timeZone)}${usesWorld && current.paused ? '（已暂停）' : ''}`;
    root.querySelectorAll('[data-memory-time]').forEach(input => {
      const key = input.dataset.memoryTime;
      const value = key === 'scope' ? (chat.settings.memoryTime?.inherit === false ? 'chat' : 'global') : c[key];
      if (input.type === 'checkbox') input.checked = !!value;
      else input.value = String(value);
    });
    root.querySelector('[data-memory-time-own-clock]').hidden = c.clockMode !== 'independent';
    root.querySelector('[data-memory-clock-pause]').textContent = current.paused ? '继续独立时间' : '暂停独立时间';
  }
  function refreshAll(chat) {
    document.querySelectorAll('.memory-time-settings').forEach(root => {
      const item = window.state?.chats?.[root.dataset.memoryTimeChat];
      if (item && (!chat || item.id === chat.id)) refresh(root, item);
    });
  }
  function bind(root, chat) {
    if (!root || root.dataset.memoryTimeBound) return;
    root.dataset.memoryTimeBound = 'true';
    refresh(root, chat);
    root.querySelector('[data-memory-time-expand]').addEventListener('click', event => {
      const button = event.currentTarget;
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(expanded));
      root.querySelector('[data-memory-time-advanced]').hidden = !expanded;
      root.querySelector('[data-memory-time-expand-label]').textContent = expanded ? '收起' : '展开';
    });
    let saving = false;
    async function act(action) {
      if (saving) return;
      saving = true;
      root.querySelectorAll('input, select, button').forEach(input => { input.disabled = true; });
      try { await action(); refreshAll(); toast('记忆时间设置已保存'); }
      catch (error) { refresh(root, chat); toast(error.message || '保存失败，请重试', 'error'); }
      finally { saving = false; root.querySelectorAll('input, select, button').forEach(input => { input.disabled = false; }); }
    }
    root.querySelectorAll('[data-memory-time]').forEach(input => input.addEventListener('change', () => act(async () => {
      const key = input.dataset.memoryTime;
      const value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
      const current = engine().config(chat);
      let next = { ...current, inherit: false };
      if (key === 'scope') next = { ...current, inherit: value === 'global' };
      else next[key] = value;
      if (key === 'halfLifeDays' && (!Number.isFinite(value) || value <= 0)) throw new Error('半衰期必须大于 0');
      if (key === 'clockMode' && value === 'independent' && !next.clock) {
        const clock = engine().clock(chat);
        next.clock = { anchorTime: clock.time, anchorReal: Date.now(), timeZone: clock.timeZone, rate: clock.rate, paused: clock.paused, pausedAt: clock.paused ? Date.now() : null, pauseHistory: [] };
      }
      if (key === 'timelineId') next.timelineName = next.timelines?.find(item => item.id === value)?.name || current.timelineName;
      await engine().saveConfig(chat, next);
      if (key === 'clockMode') {
        const clock = engine().clock(chat);
        root.querySelector('[data-memory-clock-date]').value = engine().toInput(clock.time, clock.timeZone);
        root.querySelector('[data-memory-clock-zone]').value = clock.timeZone;
        root.querySelector('[data-memory-clock-rate]').value = clock.rate;
      }
    })));
    root.querySelector('[data-memory-time-save-global]').addEventListener('click', () => act(async () => {
      const c = engine().config(chat);
      const ruleKeys = ['linked', 'relativeBasis', 'explicitPriority', 'undated', 'decayBasis', 'halfLifeDays'];
      await engine().saveGlobal(Object.fromEntries(ruleKeys.map(key => [key, c[key]])));
    }));
    root.querySelector('[data-memory-clock-apply]').addEventListener('click', () => act(async () => {
      const timeZone = engine().zone(root.querySelector('[data-memory-clock-zone]').value.trim());
      const rate = Number(root.querySelector('[data-memory-clock-rate]').value);
      if (!Number.isFinite(rate) || rate < 0) throw new Error('倍率必须是大于或等于 0 的数字');
      const anchorTime = engine().parseInput(root.querySelector('[data-memory-clock-date]').value, timeZone);
      const c = engine().config(chat);
      await engine().saveConfig(chat, { ...c, inherit: chat.settings.memoryTime?.inherit !== false,
        clockMode: 'independent', clock: { ...c.clock, anchorTime, anchorReal: Date.now(), rate, timeZone, paused: !!c.clock?.paused } });
    }));
    root.querySelector('[data-memory-clock-pause]').addEventListener('click', () => act(async () => {
      const current = engine().clock(chat);
      const c = engine().config(chat);
      const pauseHistory = [...(c.clock?.pauseHistory || [])];
      const now = Date.now();
      if (current.paused && Number.isFinite(c.clock?.pausedAt)) pauseHistory.push({ start: c.clock.pausedAt, end: now });
      await engine().saveConfig(chat, { ...c, inherit: chat.settings.memoryTime?.inherit !== false,
        clockMode: 'independent', clock: { anchorTime: current.time, anchorReal: now, rate: current.rate, timeZone: current.timeZone,
          paused: !current.paused, pausedAt: current.paused ? null : now, pauseHistory: pauseHistory.slice(-100) } });
      root.querySelector('[data-memory-clock-date]').value = engine().toInput(current.time, current.timeZone);
    }));
    root.querySelector('[data-memory-time-new-timeline]').addEventListener('click', async () => {
      const name = await showCustomPrompt('新建时间线', '填写名称。旧记忆保留；下方可选择是否继续调用其他时间线的事件和设定。', '', 'text');
      if (!name?.trim()) return;
      await act(async () => {
        const c = engine().config(chat);
        const timelines = [...(c.timelines || [{ id: c.timelineId, name: c.timelineName }])];
        const id = `timeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        timelines.push({ id, name: name.trim() });
        await engine().saveConfig(chat, { ...c, inherit: chat.settings.memoryTime?.inherit !== false, timelines, timelineId: id, timelineName: name.trim() });
        const select = root.querySelector('[data-memory-time="timelineId"]');
        const option = document.createElement('option'); option.value = id; option.textContent = name.trim(); select.appendChild(option);
        refreshAll(chat);
      });
    });
    const timer = setInterval(() => {
      if (!root.isConnected) { clearInterval(timer); return; }
      if (!saving && !root.closest('[hidden]')) {
        const status = root.querySelector('[data-memory-time-status]');
        const c = engine().config(chat), clock = engine().clock(chat);
        status.textContent = `当前使用${c.linked && clock.enabled ? '世界' : '现实'}时间：${engine().format(c.linked && clock.enabled ? clock.time : Date.now(), clock.timeZone)}${c.linked && clock.paused ? '（已暂停）' : ''}`;
      }
    }, 60000);
  }
  function mount(chat) {
    const host = document.getElementById('memory-time-settings-host');
    if (!host || !chat) return;
    host.innerHTML = render(chat);
    bind(host.firstElementChild, chat);
  }
  async function detail(chat, fragment) {
    const e = engine();
    const manager = window.vectorMemoryManager;
    const legacy = !fragment.clockVersion;
    const settings = e.config(chat);
    const timelines = settings.timelines || [{ id: settings.timelineId, name: settings.timelineName }];
    const timeZone = fragment.memoryTimeZone || e.zone();
    const panel = document.createElement('div');
    panel.className = 'vm-fullscreen-panel memory-time-detail';
    const options = [['keep', '保留当前日期'], ['unknown', '时间不明'], ['manual', '自己指定日期']];
    if (!legacy) options.push(['auto', '恢复提取时的自动规则'], ['world', '来源消息的世界时间'],
      ['real', '来源消息的现实时间'], ['explicit', '原文明示日期']);
    panel.innerHTML = `<div class="vm-panel-header"><button type="button" class="memory-time-back" data-time-close aria-label="返回">‹</button><span class="vm-panel-title">记忆时间</span><span class="memory-time-header-spacer"></span></div>
      <div class="vm-panel-body memory-time-settings"><div class="memory-time-help">${escape(fragment.content)}</div>
      <div class="memory-time-help">当前日期：${escape(window.MemoryExtractionSupport.formatTime(fragment))} · ${legacy ? '旧版记忆' : escape(e.label(fragment))}</div>
      <div class="memory-time-help">记录写入：${escape(e.format(fragment.createdAt, e.zone()))} · 时间线：${escape(legacy ? '未指定' : fragment.timelineName || fragment.timelineId)}</div>
      ${legacy ? select('assignTimeline', '归入时间线', '', [['', '保留旧版归属'], ...timelines.map((item, index) => [String(index), escape(item.name)])]) : ''}
      ${select('dateSource', '日期来源', 'keep', options)}
      <div data-time-manual hidden><label class="memory-time-field"><span>事件时间</span><input type="datetime-local" data-time-start class="settings-num-input" value="${e.toInput(fragment.memoryTime, timeZone)}"></label>
      <label class="memory-time-field"><span>结束时间（可留空）</span><input type="datetime-local" data-time-end class="settings-num-input" value="${e.toInput(fragment.memoryTimeEnd, timeZone)}"></label>
      <label class="memory-time-field"><span>计划执行（可留空）</span><input type="datetime-local" data-time-plan class="settings-num-input" value="${e.toInput(fragment.plannedTime, timeZone)}"></label></div>
      <div class="memory-time-help" data-time-preview aria-live="polite"></div>
      <div class="memory-time-help">时间依据：${escape(fragment.timeEvidence || '未记录明确日期原文')}</div>
      <div class="memory-time-evidence">${(fragment.sourceEvidence || []).map(source => `<p>${escape(source.content)}</p>`).join('')}</div>
      <div class="memory-time-actions"><button type="button" data-time-save>保存</button><button type="button" data-time-close>取消</button></div></div>`;
    document.body.appendChild(panel);
    panel.querySelectorAll('[data-time-close]').forEach(button => button.addEventListener('click', () => panel.remove()));
    let pending = null;
    const sourceSelect = panel.querySelector('[data-memory-time="dateSource"]');
    const timelineSelect = panel.querySelector('[data-memory-time="assignTimeline"]');
    const selectedTimeline = () => timelineSelect?.value ? timelines[Number(timelineSelect.value)] : null;
    function resolve() {
      const choice = sourceSelect.value;
      panel.querySelector('[data-time-manual]').hidden = choice !== 'manual';
      if (choice === 'keep') return null;
      if (choice === 'auto') {
        if (!fragment.automaticTime) throw new Error('这条记忆没有自动日期备份');
        return { ...fragment.automaticTime };
      }
      if (choice === 'unknown') return { memoryTime: null, memoryTimeEnd: null, plannedTime: null, timeBasis: 'manual', timePrecision: 'unknown', eventTimeText: '' };
      if (choice === 'manual') {
        const start = e.parseInput(panel.querySelector('[data-time-start]').value, timeZone);
        const endValue = panel.querySelector('[data-time-end]').value;
        const end = endValue ? e.parseInput(endValue, timeZone) : null;
        if (end !== null && end < start) throw new Error('结束时间不能早于开始时间');
        const planValue = panel.querySelector('[data-time-plan]').value;
        return { memoryTime: start, memoryTimeEnd: end, plannedTime: planValue ? e.parseInput(planValue, timeZone) : null,
          memoryTimeZone: timeZone, timeBasis: 'manual', timePrecision: 'minute', plannedTimePrecision: 'minute', eventTimeText: '' };
      }
      const sources = (fragment.sourceEvidence || []).map(source => ({ ...source, memoryClock: source.memoryClock ? JSON.parse(JSON.stringify(source.memoryClock)) : undefined }));
      if (!sources.length) throw new Error('这条记忆没有来源消息，无法自动推算');
      if (choice === 'world' && sources.some(source => !source.memoryClock)) throw new Error('来源消息没有保存世界时间，请自己指定日期');
      sources.forEach(source => {
        if (source.memoryClock) {
          source.memoryClock.linked = choice !== 'real';
          source.memoryClock.timeSource = choice === 'world' ? 'world' : 'real';
          source.memoryClock.policy = { relativeBasis: 'world', explicitPriority: 'text', undated: 'message' };
        }
      });
      const result = window.MemoryExtractionSupport.resolveTime({ category: fragment.category, sourceMessageIds: sources.map((_, i) => i + 1),
        timeBasis: choice === 'explicit' ? 'explicit' : 'message' }, sources);
      if (result.memoryTime === null) throw new Error('来源原文没有可以确认的日期');
      return { ...result, timeBasis: 'manual', timeSource: choice === 'explicit' ? result.timeSource : choice, automaticTime: fragment.automaticTime };
    }
    const preview = () => {
      try {
        pending = resolve();
        const timeline = selectedTimeline();
        const date = pending ? `将改为：${window.MemoryExtractionSupport.formatTime({ ...fragment, ...pending })}` : '日期保持原样';
        panel.querySelector('[data-time-preview]').textContent = timeline ? `将归入「${timeline.name}」 · ${date}` : date;
      }
      catch (error) { pending = null; panel.querySelector('[data-time-preview]').textContent = error.message; }
    };
    sourceSelect.addEventListener('change', preview);
    timelineSelect?.addEventListener('change', preview);
    panel.querySelectorAll('input').forEach(input => input.addEventListener('change', preview));
    panel.querySelector('[data-time-save]').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        if (manager._extractionLocks.get(chat)) throw new Error('请先结束当前记忆任务');
        if (manager.getFragment(chat, fragment.id) !== fragment) throw new Error('这条记忆已经变化，请重新打开详情');
        pending = resolve();
        const timeline = selectedTimeline();
        if (!pending && !timeline) { panel.remove(); return; }
        const before = JSON.parse(JSON.stringify(fragment));
        const vm = manager.getVariableMemory(chat);
        const cache = vm._retrievalCache;
        if (timeline) Object.assign(fragment, {
          clockVersion: 1, timelineId: timeline.id, timelineName: timeline.name, timeSource: 'real', memoryTimeZone: timeZone,
          memoryTime: window.MemoryExtractionSupport.validTime(fragment.memoryTime), timeBasis: fragment.timeBasis || 'manual'
        });
        Object.assign(fragment, pending);
        vm._retrievalCache = manager._emptyRetrievalCache();
        try { await window.db.chats.put(chat); }
        catch (error) {
          Object.keys(fragment).forEach(key => delete fragment[key]); Object.assign(fragment, before);
          vm._retrievalCache = cache;
          throw error;
        }
        panel.remove(); renderVectorMemoryView(); toast(timeline ? '已归入指定时间线' : '记忆日期已保存');
      } catch (error) { panel.querySelector('[data-time-preview]').textContent = error.message; }
      finally { button.disabled = false; }
    });
    preview();
  }
  window.MemoryWorldTimeUI = { render, bind, mount, refreshAll, detail };
})();
