// ============================================================
// chat-settings-presets.js - 聊天设置模板管理
// ============================================================

(function() {
  'use strict';

  // 获取当前聊天的所有设置（只保存关联世界书之后的配置）
  function getCurrentChatSettings(sourceChat = state.chats[state.activeChatId]) {
    const chat = sourceChat;
    if (!chat) return null;
    
    // 只保存关联世界书之后的配置（功能性设置，不包括身份信息）
    return {
      // ===== 模型与智能设置 =====
      enableMultiReply: chat.settings.enableMultiReply || false,
      enableNarratorMode: chat.settings.enableNarratorMode === true,
      enableOnlineOnlyRestriction: chat.settings.enableOnlineOnlyRestriction ?? null,
      minReplyCount: chat.settings.minReplyCount || 2,
      maxReplyCount: chat.settings.maxReplyCount || 5,
      injectThought: chat.settings.injectThought || false,
      enableBackgroundActivity: chat.settings.enableBackgroundActivity || false,
      allowAutoCartClear: chat.settings.allowAutoCartClear || false,
      viewMyPhoneInBackground: chat.settings.viewMyPhoneInBackground ?? null,
      viewMyPhoneChance: chat.settings.viewMyPhoneChance ?? null,
      groupBackgroundActivity: chat.settings.groupBackgroundActivity || false,
      actionCooldownMinutes: chat.settings.actionCooldownMinutes || 60,
      groupActionCooldownMinutes: chat.settings.groupActionCooldownMinutes || 30,
      
      // ===== 记忆设置 =====
      maxMemory: chat.settings.maxMemory || 10,
      linkedMemoryCount: chat.settings.linkedMemoryCount || 5,
      autoMemory: chat.settings.autoMemory || false,
      autoMemoryInterval: chat.settings.autoMemoryInterval || 20,
      memoryMode: chat.settings.memoryMode || 'diary',
      diaryMode: chat.settings.diaryMode || false,
      limitMemory: chat.settings.limitMemory || false,
      memoryLimitCount: chat.settings.memoryLimitCount || 50,
      linkMemory: chat.settings.linkMemory || false,
      linkedChatIds: chat.settings.linkedChatIds || [],
      showHiddenMessages: chat.settings.showHiddenMessages || false,
      phoneViewingAwareness: chat.settings.phoneViewingAwareness || false,
      coupleSpacePrompt: chat.settings.coupleSpacePrompt || false,
      coupleSpaceContent: chat.settings.coupleSpaceContent || false,
      
      // ===== AI行为控制 =====
      enableThoughts: chat.settings.enableThoughts ?? null,
      enableQzoneActions: chat.settings.enableQzoneActions ?? null,
      
      // ===== 高级功能 =====
      enableTts: chat.settings.enableTts !== false,
      minimaxVoiceId: chat.settings.minimaxVoiceId || '',
      ttsProvider: chat.settings.ttsProvider || 'minimax',
      elevenlabsVoiceId: chat.settings.elevenlabsVoiceId || '',
      elevenlabsModel: chat.settings.elevenlabsModel || '',
      elevenlabsVoiceSettings: { ...(chat.settings.elevenlabsVoiceSettings || {}) },
      fishVoiceId: chat.settings.fishVoiceId || '',
      fishModel: chat.settings.fishModel || '',
      fishVoiceSettings: JSON.parse(JSON.stringify(chat.settings.fishVoiceSettings || {})),
      fishTtsSpeed: chat.settings.fishTtsSpeed ?? (window.ttsProvider?.provider(chat) === 'fish' ? chat.settings.ttsSpeed ?? 1 : 1),
      ttsSpeed: chat.settings.ttsSpeed ?? 1,
      minimaxTtsSpeed: chat.settings.minimaxTtsSpeed ?? (window.ttsProvider?.provider(chat) === 'minimax' ? chat.settings.ttsSpeed ?? 1 : 1),
      elevenlabsTtsSpeed: chat.settings.elevenlabsTtsSpeed ?? (window.ttsProvider?.provider(chat) === 'elevenlabs' ? chat.settings.ttsSpeed ?? 1 : 1),
      ttsStreaming: chat.settings.ttsStreaming === true,
      ttsSplitLongText: chat.settings.ttsSplitLongText === true,
      ttsSaveAudio: chat.settings.ttsSaveAudio === true,
      ttsLanguage: chat.settings.ttsLanguage ?? window.ttsProvider?.language(chat) ?? 'auto',
      enableTTS: chat.settings.enableTTS || false,
      ttsVoiceId: chat.settings.ttsVoiceId || '',
      enableBilingualMode: chat.settings.enableBilingualMode || false,
      bilingualDisplayMode: chat.settings.bilingualDisplayMode || 'outside',
      bilingualCharacters: [...(chat.settings.bilingualCharacters || [])],
      languagePolicy: chat.settings.languagePolicy ? JSON.parse(JSON.stringify(chat.settings.languagePolicy)) : null,
      enableRealVoice: chat.settings.enableRealVoice !== false,
      realVoiceOperation: chat.settings.realVoiceOperation || 'tap',
      voiceUnderstandingMode: chat.settings.voiceUnderstandingMode || 'auto',
      voiceTranscriptionUrl: chat.settings.voiceTranscriptionUrl || '',
      voiceTranscriptionModel: chat.settings.voiceTranscriptionModel || 'whisper-1',
      voiceMaxDuration: chat.settings.voiceMaxDuration || 60,
      voiceConfirmTranscript: chat.settings.voiceConfirmTranscript !== false,
      voiceCallInputMode: chat.settings.voiceCallInputMode || 'text',
      voiceCallUnderstandingMode: chat.settings.voiceCallUnderstandingMode || 'same',
      voiceCallTextFallback: chat.settings.voiceCallTextFallback !== false,
      enableOfflineMode: chat.settings.enableOfflineMode || false,
      isOfflineMode: chat.settings.isOfflineMode === true,
      offlineMinLength: chat.settings.offlineMinLength ?? 100,
      offlineMaxLength: chat.settings.offlineMaxLength ?? 300,
      offlineContinuousLayout: chat.settings.offlineContinuousLayout || false,
      enableTimeSimulation: chat.settings.enableTimeSimulation || false,
      timeSpeed: chat.settings.timeSpeed || 1,
      enableNaiImageGen: chat.settings.enableNaiImageGen || false,
      naiImagePromptMode: chat.settings.naiImagePromptMode || 'auto',
      
      // ===== 外观与视觉 =====
      theme: chat.settings.theme || 'default',
      fontSize: chat.settings.fontSize || 13,
      background: chat.settings.background || '',
      customCss: chat.settings.customCss || ''
    };
  }

  // 应用设置模板到当前聊天
  async function applyChatSettingsPreset(presetId) {
    const chatId = state.activeChatId;
    if (!chatId) {
      if (typeof showToast === 'function') {
        showToast('请先打开一个聊天');
      }
      return false;
    }
    
    const chat = state.chats[chatId];
    if (!chat) return false;
    
    const preset = await db.chatSettingsPresets.get(presetId);
    if (!preset) return false;
    
    // 只应用功能性设置，不覆盖身份信息（名字、头像、人设等）
    // 使用 Object.assign 会保留原有的身份信息
    const settingsToApply = sanitizeSettings(preset.settings);
    
    // 逐个应用设置，确保不覆盖未包含在模板中的字段
    Object.keys(settingsToApply).forEach(key => {
      chat.settings[key] = clone(settingsToApply[key]);
    });
    
    // 保存到数据库
    await db.chats.put(chat);
    if (document.getElementById('chat-settings-screen')?.classList.contains('active')) window.openChatSettings?.();
    
    // 如果当前在聊天界面，刷新显示
    const chatScreen = document.getElementById('chat-interface-screen');
    if (chatScreen && chatScreen.classList.contains('active')) {
      if (typeof renderChatInterface === 'function') {
        await renderChatInterface(chatId);
      }
    }
    
    if (typeof showToast === 'function') {
      showToast(`已应用模板：${preset.name}`);
    }
    
    return true;
  }

  // 保存当前聊天设置为模板
  async function saveCurrentChatSettingsAsPreset(name) {
    const settings = getCurrentChatSettings();
    if (!settings) {
      if (typeof showToast === 'function') {
        showToast('请先打开一个聊天');
      }
      return null;
    }
    
    const presetData = {
      name: name.trim(),
      settings: settings,
      createdAt: Date.now(),
      description: generatePresetDescription(settings) // 自动生成描述
    };
    
    // 检查是否已存在同名模板
    const existing = await db.chatSettingsPresets.where('name').equals(presetData.name).first();
    if (existing) {
      presetData.id = existing.id;
    }
    
    const id = await db.chatSettingsPresets.put(presetData);
    const defaults = clone(state.globalSettings.chatSettingsDefaults || {});
    for (const kind of ['single', 'group']) if (defaults[kind]?.id === id) defaults[kind] = { id, name: presetData.name, settings: sanitizeSettings(settings) };
    await saveDefaults(defaults);
    
    if (typeof showToast === 'function') {
      showToast('设置模板已保存');
    }
    
    return id;
  }

  // 生成模板描述（自动总结包含的设置）
  function generatePresetDescription(settings) {
    const features = [];
    if (settings.enableNarratorMode) features.push('旁白');
    if (settings.enableBilingualMode) features.push('语言与翻译');
    
    // 回复设置
    if (settings.enableMultiReply) {
      features.push(`多条回复(${settings.minReplyCount}-${settings.maxReplyCount})`);
    }
    
    // 后台活动
    if (settings.enableBackgroundActivity) {
      features.push('后台活动');
    }
    
    // 记忆模式
    if (settings.memoryMode === 'structured') {
      features.push('结构化记忆');
    } else if (settings.memoryMode === 'vector') {
      features.push('向量记忆');
    } else if (settings.memoryMode) {
      features.push('日记记忆');
    }
    
    // 记忆条数
    if (settings.maxMemory != null) features.push(`${settings.maxMemory}条短期记忆`);
    
    // 自动总结
    if (settings.autoMemory) {
      features.push('自动总结');
    }
    
    // TTS
    if (settings.enableTTS) {
      features.push('语音播报');
    }
    
    // 主题
    if (settings.theme && settings.theme !== 'default') {
      features.push(`主题:${settings.theme}`);
    }
    
    return features.length > 0 ? features.join(' | ') : '默认配置';
  }

  // 删除设置模板
  async function deleteChatSettingsPreset(presetId) {
    await db.chatSettingsPresets.delete(presetId);
    const defaults = clone(state.globalSettings.chatSettingsDefaults || {});
    for (const kind of ['single', 'group']) if (defaults[kind]?.id === presetId) delete defaults[kind];
    await saveDefaults(defaults);
    
    if (typeof showToast === 'function') {
      showToast('模板已删除');
    }
  }

  // 获取所有设置模板
  async function getAllChatSettingsPresets() {
    return await db.chatSettingsPresets.toArray();
  }

  // 暴露全局方法
  window.getCurrentChatSettings = getCurrentChatSettings;
  window.applyChatSettingsPreset = applyChatSettingsPreset;
  window.saveCurrentChatSettingsAsPreset = saveCurrentChatSettingsAsPreset;
  window.deleteChatSettingsPreset = deleteChatSettingsPreset;
  window.getAllChatSettingsPresets = getAllChatSettingsPresets;

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const groupLabels = { behavior: '回复与行为', memory: '记忆设置', language: '旁白与语言', voice: '语音设置', appearance: '外观设置' };
  function settingGroup(key) {
    if (/Narrator|Bilingual|bilingual|languagePolicy/.test(key)) return 'language';
    if (/Tts|TTS|tts|Voice|voice|fish|elevenlabs|minimax|realVoice/.test(key)) return 'voice';
    if (/Memory|memory|diary|HiddenMessages|linkedChat|phoneViewingAwareness|coupleSpace/.test(key)) return 'memory';
    if (['theme', 'fontSize', 'background', 'customCss'].includes(key)) return 'appearance';
    return 'behavior';
  }
  function sanitizeSettings(settings, groups = Object.keys(groupLabels)) {
    const allowed = Object.keys(getCurrentChatSettings({ settings: {} }));
    return Object.fromEntries(allowed.filter(key => groups.includes(settingGroup(key)) && Object.hasOwn(settings || {}, key)).map(key => [key, clone(settings[key])]));
  }
  async function saveDefaults(defaults) {
    const next = { ...state.globalSettings, chatSettingsDefaults: clone(defaults) };
    await db.globalSettings.put(next);
    state.globalSettings.chatSettingsDefaults = next.chatSettingsDefaults;
  }
  function applyDefaultChatSettings(chat) {
    const row = state.globalSettings.chatSettingsDefaults?.[chat.isGroup ? 'group' : 'single'];
    if (!row) return chat;
    const settings = sanitizeSettings(row.settings);
    // A default must not silently connect a new person to another person's memories.
    delete settings.linkedChatIds;
    delete settings.bilingualCharacters;
    chat.settings = Object.assign(chat.settings || {}, settings);
    return chat;
  }
  async function applyPresetToChats(presetId, ids) {
    const preset = await db.chatSettingsPresets.get(presetId);
    if (!preset) throw new Error('模板已不存在，请重新选择。');
    const settings = sanitizeSettings(preset.settings);
    const chats = [...new Set(ids)].map(id => state.chats[id]).filter(Boolean);
    if (!chats.length) throw new Error('请至少选择一个聊天。');
    const rows = chats.map(chat => ({ ...chat, settings: { ...chat.settings, ...clone(settings) } }));
    await db.transaction('rw', db.chats, async () => { for (const row of rows) await db.chats.put(row); });
    for (const row of rows) Object.assign(state.chats[row.id].settings, clone(settings));
    if (chats.some(chat => chat.id === state.activeChatId)) {
      if (document.getElementById('chat-settings-screen')?.classList.contains('active')) window.openChatSettings?.();
      else if (document.getElementById('chat-interface-screen')?.classList.contains('active') && typeof renderChatInterface === 'function') await renderChatInterface(state.activeChatId);
    }
    return rows.length;
  }
  window.applyDefaultChatSettings = applyDefaultChatSettings;
  window.ChatSettingsTemplates = { sanitizeSettings, applyPresetToChats, settingGroup };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let panel, previousFocus, editor, batch;
  const templateGlyph = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="14" height="16" rx="2.5"/><path d="M9 5V3h6v2M9 10h6M9 14h6M9 18h3"/></svg>';
  function closeTemplates() {
    window.ChoicePicker?.close();
    panel?.remove(); panel = null; editor = null; batch = null;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  function shell(title, subtitle, body, footer = '') {
    panel.innerHTML = `<section class="template-panel" role="dialog" aria-modal="true" aria-labelledby="template-title" aria-describedby="template-intro"><header class="template-header"><span class="template-emblem">${templateGlyph}</span><div class="template-heading"><h2 id="template-title">${title}</h2><p id="template-intro" class="template-intro">${subtitle}</p></div><button type="button" data-template-action="close" class="template-close" aria-label="关闭设置模板">×</button></header><div class="template-body">${body}</div><footer class="template-footer">${footer}<p data-template-status role="status"></p></footer></section>`;
    window.ChoicePicker?.enhance(panel);
    panel.querySelector('.template-close')?.focus({ preventScroll: true });
  }
  const button = (action, text, extra = '') => `<button type="button" data-template-action="${action}" ${extra}>${text}</button>`;
  async function renderTemplates() {
    const rows = await db.chatSettingsPresets.toArray();
    if (!panel) return;
    const defaults = state.globalSettings.chatSettingsDefaults || {};
    const options = rows.map(row => `<option value="${row.id}">${esc(row.name)}</option>`).join('');
    const defaultChoice = (kind, label) => `<label class="template-field">${label}<select data-default-kind="${kind}" aria-label="${label}"><option value="">不自动套用</option>${options}</select></label>`;
    shell('设置模板', '把喜欢的聊天方式保存下来，下一次直接使用。', `
      <section class="template-defaults"><div class="template-section-title"><strong>新聊天的默认设置</strong><span>单聊 / 群聊分别选择</span></div><div class="template-grid">${defaultChoice('single', '新建单聊')}${defaultChoice('group', '新建群聊')}</div><p class="template-hint">只对之后新建的聊天生效。已有聊天可在下方主动批量应用。</p></section>
      <div class="template-section-title"><strong>我的模板</strong><span>${rows.length} 份</span></div>
      <div class="template-list">${rows.map(row => `<article class="template-card"><div class="template-card-title"><span class="template-icon">${templateGlyph}</span><div><h3>${esc(row.name)}</h3><p>${esc(row.description || generatePresetDescription(row.settings || {}))}</p></div></div><div class="template-tags">${[...new Set(Object.keys(sanitizeSettings(row.settings)).map(settingGroup))].map(key => `<span>${groupLabels[key]}</span>`).join('')}${['single', 'group'].filter(k => defaults[k]?.id === row.id).map(k => `<span class="template-default-tag">${k === 'single' ? '单聊' : '群聊'}默认</span>`).join('')}</div><div class="template-actions">${state.chats[state.activeChatId] ? button('apply', '应用到此聊天', `data-id="${row.id}" class="template-primary"`) : ''}${button('batch', '批量应用', `data-id="${row.id}"`)}${button('edit', '编辑', `data-id="${row.id}"`)}${button('delete', '删除', `data-id="${row.id}" class="template-danger"`)}</div></article>`).join('') || `<div class="template-empty"><span class="template-empty-art">${templateGlyph}</span><h3>从一份喜欢的设置开始</h3><p>将旁白、语言和回复偏好收进模板，<br>下次聊天，一键沿用。</p><small>角色名字、头像与人设独立保留</small></div>`}</div>`, button('create', '＋ 新建模板', 'class="template-primary template-wide"'));
    for (const select of panel.querySelectorAll('[data-default-kind]')) select.value = defaults[select.dataset.defaultKind]?.id || '';
    window.ChoicePicker?.enhance(panel);
  }
  async function editTemplate(id) {
    const row = id ? await db.chatSettingsPresets.get(id) : null;
    const source = row?.settings || getCurrentChatSettings() || getCurrentChatSettings({ settings: {} });
    editor = { id: row?.id, settings: clone(source), groups: row ? [...new Set(Object.keys(source).map(settingGroup))] : ['behavior', 'language'] };
    shell(row ? '编辑模板' : '新建模板', '选择要保存的范围，其他设置在套用时保持原样。', `
      <label class="template-field">模板名称<input data-template-name type="text" maxlength="60" placeholder="例如：温柔双语 · 轻旁白" value="${esc(row?.name || '')}"></label>
      <section class="template-editor-card"><strong>保存哪些设置</strong><div class="template-group-options">${Object.entries(groupLabels).map(([key, label]) => `<label><input type="checkbox" data-setting-group="${key}" ${editor.groups.includes(key) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div><p class="template-hint">${row ? '未修改的设置沿用此模板。' : state.chats[state.activeChatId] ? '从当前聊天已保存的设置开始。' : '从基础设置开始；也可在聊天详情中保存更完整的配置。'}</p></section>
      <section class="template-editor-card"><div class="template-section-title"><strong>旁白与语言</strong><span>常用偏好</span></div><label class="template-switch"><span><strong>每轮附带旁白</strong><small>环境、动作或心理描写</small></span><input type="checkbox" data-template-narrator ${source.enableNarratorMode ? 'checked' : ''}></label><label class="template-switch"><span><strong>语言与翻译</strong><small>沿用保存的语言规则与显示方式</small></span><input type="checkbox" data-template-bilingual ${source.enableBilingualMode ? 'checked' : ''}></label><label class="template-field">角色输出语言<input data-template-language placeholder="留空沿用角色设定，例如：日语" value="${esc(source.languagePolicy?.outputLanguage || '')}"></label><p class="template-hint">填写语言后，启用语言与翻译的模板将固定使用该语言。</p></section>`, `${button('list', '取消')}${button('save', '保存模板', 'class="template-primary"')}`);
    panel.querySelector('[data-template-name]').focus();
  }
  async function renderBatch(id) {
    const row = await db.chatSettingsPresets.get(id);
    if (!row) throw new Error('模板已不存在。');
    batch = { id, ids: [], name: row.name };
    shell('选择应用范围', `将「${esc(row.name)}」应用到你选中的聊天。`, `<div class="template-selection-tools">${button('select-single', '选择全部单聊')}${button('select-group', '选择全部群聊')}${button('select-none', '清空选择')}</div><div class="template-chat-list">${Object.values(state.chats).map(chat => `<label class="template-chat-row"><input type="checkbox" data-target-chat="${esc(chat.id)}" data-is-group="${chat.isGroup ? 'true' : 'false'}"><span class="template-chat-avatar">${chat.isGroup ? '群' : esc((chat.name || '?').slice(0, 1))}</span><span><strong>${esc(chat.name)}</strong><small>${chat.isGroup ? '群聊' : '单聊'}</small></span></label>`).join('') || '<p class="template-hint">还没有可应用的聊天。</p>'}</div>`, `${button('list', '返回')}${button('review', '下一步 · 检查范围', 'class="template-primary"')}`);
  }
  async function handleAction(action, id) {
    if (action === 'close') return closeTemplates();
    if (action === 'list') return renderTemplates();
    if (action === 'create' || action === 'edit') return editTemplate(id);
    if (action === 'batch') return renderBatch(id);
    if (action.startsWith('select-')) {
      panel.querySelectorAll('[data-target-chat]').forEach(input => { input.checked = action === 'select-single' ? input.dataset.isGroup === 'false' : action === 'select-group' ? input.dataset.isGroup === 'true' : false; }); return;
    }
    if (action === 'review') {
      batch.ids = [...panel.querySelectorAll('[data-target-chat]:checked')].map(input => input.dataset.targetChat);
      if (!batch.ids.length) throw new Error('请先选择聊天。');
      const row = await db.chatSettingsPresets.get(batch.id);
      if (!row) throw new Error('模板已不存在。');
      batch.updatedAt = row.updatedAt || row.createdAt;
      shell('确认应用', '检查这次会更新的范围。', `<div class="template-review"><span class="template-review-count">${batch.ids.length}</span><strong>个聊天将使用「${esc(batch.name)}」</strong><p>${[...new Set(Object.keys(sanitizeSettings(row.settings)).map(settingGroup))].map(key => groupLabels[key]).join(' · ')}</p></div><p class="template-hint">所选范围中的设置会被覆盖，名字、头像、人设与聊天记录保留。</p><div class="template-review-names">${batch.ids.map(cid => `<span>${esc(state.chats[cid]?.name)}</span>`).join('')}</div>`, `${button('batch', '重新选择', `data-id="${batch.id}"`)}${button('confirm-batch', `确认应用到 ${batch.ids.length} 个聊天`, 'class="template-primary"')}`); return;
    }
    if (action === 'confirm-batch') {
      const row = await db.chatSettingsPresets.get(batch.id);
      if (!row || (row.updatedAt || row.createdAt) !== batch.updatedAt) throw new Error('模板已有变化，请返回并重新检查。');
      const count = await applyPresetToChats(batch.id, batch.ids);
      await renderTemplates(); templateStatus(`已应用到 ${count} 个聊天。`); return;
    }
    if (action === 'apply') {
      await applyPresetToChats(id, [state.activeChatId]);
      templateStatus('已应用到当前聊天。'); return;
    }
    if (action === 'delete') {
      const row = await db.chatSettingsPresets.get(id);
      shell('删除模板', `确认删除「${esc(row?.name)}」？`, '<p class="template-hint">已有聊天的设置保留。如果它是默认模板，之后的新聊天将不再自动套用。</p>', `${button('list', '保留')}${button('confirm-delete', '删除模板', `data-id="${id}" class="template-danger"`)}`); return;
    }
    if (action === 'confirm-delete') { await deleteChatSettingsPreset(id); return renderTemplates(); }
    if (action === 'save') {
      const name = panel.querySelector('[data-template-name]').value.trim();
      if (!name) throw new Error('给模板起个名字吧。');
      const groups = [...panel.querySelectorAll('[data-setting-group]:checked')].map(input => input.dataset.settingGroup);
      if (!groups.length) throw new Error('至少选择一类设置。');
      const settings = clone(editor.settings);
      settings.enableNarratorMode = panel.querySelector('[data-template-narrator]').checked;
      settings.enableBilingualMode = panel.querySelector('[data-template-bilingual]').checked;
      const language = panel.querySelector('[data-template-language]').value.trim();
      if (language !== (settings.languagePolicy?.outputLanguage || '')) {
        settings.languagePolicy = { ...(settings.languagePolicy || {}), outputLanguage: language, outputMode: language ? 'fixed' : 'auto' };
      }
      const safe = sanitizeSettings(settings, groups);
      const existing = await db.chatSettingsPresets.where('name').equals(name).first();
      if (existing && existing.id !== editor.id) throw new Error('已有同名模板，请换一个名称。');
      const row = { ...(editor.id ? await db.chatSettingsPresets.get(editor.id) : {}), name, settings: safe, description: generatePresetDescription(safe), updatedAt: Date.now() };
      if (!row.createdAt) row.createdAt = Date.now();
      if (editor.id) row.id = editor.id;
      const savedId = await db.chatSettingsPresets.put(row);
      const defaults = clone(state.globalSettings.chatSettingsDefaults || {});
      for (const kind of ['single', 'group']) if (defaults[kind]?.id === savedId) defaults[kind] = { id: savedId, name, settings: safe };
      await saveDefaults(defaults);
      await renderTemplates(); templateStatus('模板已保存。');
    }
  }
  function templateStatus(message) { const target = panel?.querySelector('[data-template-status]'); if (target) target.textContent = message; }
  async function openChatSettingsTemplates() {
    if (panel) { panel.querySelector('button')?.focus(); return; }
    previousFocus = document.activeElement;
    panel = document.createElement('div'); panel.className = 'template-overlay';
    (document.getElementById('phone-screen') || document.body).append(panel);
    panel.addEventListener('click', async event => {
      if (event.target === panel) return closeTemplates();
      const target = event.target.closest('[data-template-action]');
      if (!target || target.disabled) return;
      target.disabled = true;
      try { await handleAction(target.dataset.templateAction, Number(target.dataset.id) || undefined); }
      catch (error) { templateStatus(error.message || '操作失败，请重试。'); }
      finally { if (target.isConnected) target.disabled = false; }
    });
    panel.addEventListener('change', async event => {
      if (event.target.matches('[data-template-narrator], [data-template-bilingual], [data-template-language]')) {
        panel.querySelector('[data-setting-group="language"]').checked = true;
      }
      const select = event.target.closest('[data-default-kind]');
      if (!select) return;
      try {
        const defaults = clone(state.globalSettings.chatSettingsDefaults || {});
        const row = select.value ? await db.chatSettingsPresets.get(Number(select.value)) : null;
        if (row) defaults[select.dataset.defaultKind] = { id: row.id, name: row.name, settings: sanitizeSettings(row.settings) };
        else delete defaults[select.dataset.defaultKind];
        const kind = select.dataset.defaultKind;
        await saveDefaults(defaults); await renderTemplates(); templateStatus('新聊天的默认设置已保存。');
        panel?.querySelector(`[data-default-kind="${kind}"]`)?.nextElementSibling?.focus({ preventScroll: true });
      } catch (error) { templateStatus('默认设置保存失败，请重试。'); }
    });
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); closeTemplates(); }
      if (event.key === 'Tab') {
        const items = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled)')].filter(el => el.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      }
    });
    await renderTemplates(); panel?.querySelector('button')?.focus();
  }
  window.openChatSettingsTemplates = openChatSettingsTemplates;
  document.addEventListener('click', event => { if (event.target.closest('[data-chat-templates]')) openChatSettingsTemplates().catch(error => { templateStatus(error.message); }); });

})();
