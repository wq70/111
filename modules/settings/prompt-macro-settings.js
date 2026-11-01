(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  const scopeLabels = { presets: '预设', worldbooks: '世界书', prompts: '提示词' };
  let draft;
  function status(message) { $('prompt-macro-status').textContent = message; }
  function syncVisibility() {
    $('prompt-macro-panel').hidden = !$('prompt-macro-enabled').checked;
    $('model-route-panel').hidden = !$('model-route-enabled').checked;
  }
  function makeScopes(value = {}, prefix = '') {
    return Object.entries(scopeLabels).map(([key, label]) => `<label class="prompt-macro-scope"><input type="checkbox" data-scope="${key}" ${value[key] !== false ? 'checked' : ''}><span>${prefix}${label}</span></label>`).join('');
  }
  function renderRules() {
    $('prompt-macro-rules').innerHTML = draft.rules.map((rule, index) => `<details class="prompt-macro-rule" data-index="${index}" open>
      <summary><span class="prompt-macro-rule-heading"><span class="prompt-macro-rule-number">${String(index + 1).padStart(2, '0')}</span><span>${esc(rule.name || '新规则')}</span></span></summary>
      <label class="prompt-macro-rule-toggle"><input type="checkbox" data-field="enabled" ${rule.enabled !== false ? 'checked' : ''}><span>启用此宏</span></label>
      <div class="prompt-macro-rule-fields"><label class="prompt-macro-field">宏名称<input type="text" data-field="name" aria-label="宏名称" placeholder="如 greeting" value="${esc(rule.name)}" maxlength="48"></label>
        <label class="prompt-macro-field">处理方式<select data-field="type" aria-label="宏处理方式">${[['fixed','固定文字'],['random','随机候选'],['template','参数模板'],['script','高级脚本']].map(([value,label]) => `<option value="${value}" ${rule.type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
      <div class="prompt-macro-field-title">规则内容</div>
      <textarea data-field="value" aria-label="宏规则内容" spellcheck="false" maxlength="50000">${esc(rule.value)}</textarea>
      <p>固定文字：直接输出内容。随机候选：每行一个。参数模板：用 \${1}、\${2} 引用参数。高级脚本：使用 args 和 text，并 return 一段文字。</p>
      <div class="prompt-macro-field-title">生效范围</div><div class="prompt-macro-row" data-rule-scopes>${makeScopes(rule.scopes)}</div>
      <label class="prompt-macro-field">停用时<select data-field="offMode" aria-label="规则停用行为"><option value="inherit" ${!rule.offMode ? 'selected' : ''}>跟随总设置</option><option value="preserve" ${rule.offMode === 'preserve' ? 'selected' : ''}>保留原文</option><option value="omit" ${rule.offMode === 'omit' ? 'selected' : ''}>不发送所在条目</option></select></label>
      <div class="prompt-macro-row prompt-macro-rule-actions"><button type="button" class="settings-mini-btn" data-action="up" aria-label="上移规则 ${esc(rule.name)}" ${index ? '' : 'disabled'}>上移</button><button type="button" class="settings-mini-btn" data-action="down" aria-label="下移规则 ${esc(rule.name)}" ${index < draft.rules.length - 1 ? '' : 'disabled'}>下移</button><button type="button" class="settings-mini-btn" data-action="delete" aria-label="删除规则 ${esc(rule.name)}">删除</button></div>
    </details>`).join('') || '<div class="prompt-macro-empty"><strong>从一条自己的规则开始</strong><p>内置 random 已可使用。你也可以添加固定文字、参数模板或其他宏规则。</p></div>';
  }
  function captureRules() {
    if (!draft) return;
    $('prompt-macro-rules').querySelectorAll('[data-index]').forEach(node => {
      const rule = draft.rules[Number(node.dataset.index)];
      node.querySelectorAll('[data-field]').forEach(field => {
        const key = field.dataset.field;
        rule[key] = key === 'enabled' ? field.checked : key === 'offMode' && field.value === 'inherit' ? undefined : field.value;
      });
      rule.scopes = Object.fromEntries([...node.querySelectorAll('[data-rule-scopes] [data-scope]')].map(field => [field.dataset.scope, field.checked]));
    });
  }
  function read() {
    if (!draft || !$('prompt-macro-enabled')) return window.PromptMacros.settings();
    captureRules();
    draft.enabled = $('prompt-macro-enabled').checked;
    draft.offMode = $('prompt-macro-off-mode').value;
    draft.scopes = Object.fromEntries([...$('prompt-macro-scopes').querySelectorAll('[data-scope]')].map(field => [field.dataset.scope, field.checked]));
    return window.PromptMacros.validate(window.PromptMacros.settings(draft));
  }
  function records(chatId) {
    const chats = Object.values(window.state?.chats || {}).filter(chat => !chatId || String(chat.id) === String(chatId));
    return chats.flatMap(chat => (chat.modelRouteObservations || []).map(row => ({ ...row, chatName: chat.name })))
      .sort((a,b) => b.timestamp - a.timestamp).slice(0,20);
  }
  function cards(chatId) {
    return records(chatId).map(row => `<article class="model-route-card"><strong>${esc(row.label)}</strong><p class="model-route-meta">${esc(row.chatName)} · ${esc(new Date(row.timestamp).toLocaleString())}</p><dl><div><dt>请求模型</dt><dd>${esc(row.requested || '未指定')}</dd></div><div><dt>接口报告</dt><dd>${esc(row.reported?.join(' → ') || '未提供')}</dd></div></dl><p>${esc(row.detail)}${row.truncated ? '（部分标识未展示）' : ''}</p></article>`).join('') || '<div class="prompt-macro-empty"><strong>等待第一次观察</strong><p>开启并完成一次对话后，模型标识会显示在这里。不会额外调用 API。</p></div>';
  }
  function renderObservations() {
    if ($('model-route-results')) $('model-route-results').innerHTML = cards();
    const button = $('model-route-chat-button');
    if (button) button.hidden = window.state?.globalSettings?.modelRouteObservation !== true;
  }
  function openObservations() {
    let dialog = $('model-route-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'model-route-dialog'; dialog.className = 'prompt-macro-panel';
      document.body.appendChild(dialog);
    }
    dialog.innerHTML = `<div class="model-route-dialog-heading"><div><span class="prompt-macro-eyebrow">趣味参考</span><h3>模型路由观察</h3></div><button type="button" class="settings-mini-btn">关闭</button></div><p>展示接口自报标识，无法核验上游隐藏路由。名称一致也不等于一定没有路由。</p>${cards(window.state?.activeChatId)}`;
    dialog.querySelector('button').onclick = () => dialog.close(); dialog.showModal();
  }
  function bind() {
    const root = $('prompt-macro-panel');
    if (!root || root.dataset.bound) return;
    root.dataset.bound = 'true';
    $('prompt-macro-enabled').addEventListener('change', syncVisibility);
    $('model-route-enabled').addEventListener('change', syncVisibility);
    syncVisibility();
    $('prompt-macro-add').onclick = () => {
      captureRules(); if (draft.rules.length >= 100) return status('最多保存 100 条自定义宏。');
      let index = 1; while (draft.rules.some(rule => rule.name === 'custom' + index)) index++;
      draft.rules.push({ name: 'custom' + index, type: 'fixed', value: '', enabled: false }); renderRules(); status('已添加规则，点击设置页“保存”后生效。');
    };
    $('prompt-macro-rules').onclick = event => {
      const action = event.target.dataset.action;
      if (!action) return;
      captureRules(); const index = Number(event.target.closest('[data-index]').dataset.index);
      if (action === 'delete') draft.rules.splice(index, 1);
      else {
        const other = index + (action === 'up' ? -1 : 1);
        if (other >= 0 && other < draft.rules.length) [draft.rules[index], draft.rules[other]] = [draft.rules[other], draft.rules[index]];
      }
      renderRules();
    };
    $('prompt-macro-preview-button').onclick = async () => {
      const button = $('prompt-macro-preview-button'); button.disabled = true;
      $('prompt-macro-preview-output').textContent = '正在处理…';
      try {
        const config = read();
        const result = await window.PromptMacros.session(config, {}).render($('prompt-macro-preview-input').value, $('prompt-macro-preview-scope').value);
        $('prompt-macro-preview-output').textContent = result || '（此条目不发送）'; status('按当前草稿预览，不会保存或发送请求。');
      } catch (error) { $('prompt-macro-preview-output').textContent = '预览失败，未生成新结果。'; status(error.message); }
      finally { button.disabled = false; }
    };
    $('prompt-macro-export').onclick = () => {
      try {
        const config = read();
        const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'ephone-prompt-macros-v1', ...config }, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'EPhone-宏规则.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) { status(error.message); }
    };
    $('prompt-macro-import').onclick = () => $('prompt-macro-import-file').click();
    $('prompt-macro-import-file').onchange = async event => {
      try {
        const file = event.target.files[0]; if (!file) return;
        if (file.size > 1024 * 1024) throw new Error('规则文件不能超过 1MB。');
        const imported = JSON.parse(await file.text());
        if (imported.format !== 'ephone-prompt-macros-v1' || !Array.isArray(imported.rules)) throw new Error('不是 EPhone 宏规则文件。');
        // 导入只替换草稿；高级脚本需要用户逐条启用，不随导入自动运行。
        const config = window.PromptMacros.settings(imported); config.enabled = false;
        config.rules.forEach(rule => { if (rule.type === 'script') rule.enabled = false; });
        draft = window.PromptMacros.validate(config); renderDraft(); status('规则已载入草稿，总开关和导入的高级脚本已关闭。点击设置页“保存”后生效。');
      } catch (error) { status(error.message); }
      finally { event.target.value = ''; }
    };
    $('model-route-chat-button')?.addEventListener('click', openObservations);
  }
  function renderDraft() {
    $('prompt-macro-enabled').checked = draft.enabled;
    $('prompt-macro-off-mode').value = draft.offMode;
    $('prompt-macro-scopes').innerHTML = makeScopes(draft.scopes);
    renderRules();
    syncVisibility();
  }
  function render() {
    if (!$('prompt-macro-panel')) return;
    bind(); draft = window.PromptMacros.settings(); renderDraft(); status('');
    $('model-route-enabled').checked = window.state?.globalSettings?.modelRouteObservation === true;
    syncVisibility();
    renderObservations();
  }
  window.addEventListener('model-route-observed', renderObservations);
  document.addEventListener('DOMContentLoaded', () => { bind(); renderObservations(); });
  window.PromptMacroSettings = { render, read, renderObservations, openObservations };
})();
