// ============================================================
// chat-settings-presets.js - 聊天设置模板管理
// ============================================================

(function() {
  'use strict';

  // 获取当前聊天的所有设置（只保存关联世界书之后的配置）
  function getCurrentChatSettings() {
    const chatId = state.activeChatId;
    if (!chatId) return null;
    
    const chat = state.chats[chatId];
    if (!chat) return null;
    
    // 只保存关联世界书之后的配置（功能性设置，不包括身份信息）
    return {
      // ===== 模型与智能设置 =====
      enableMultiReply: chat.settings.enableMultiReply || false,
      minReplyCount: chat.settings.minReplyCount || 2,
      maxReplyCount: chat.settings.maxReplyCount || 5,
      injectThought: chat.settings.injectThought || false,
      enableBackgroundActivity: chat.settings.enableBackgroundActivity || false,
      allowAutoCartClear: chat.settings.allowAutoCartClear || false,
      viewMyPhoneInBackground: chat.settings.viewMyPhoneInBackground || null,
      viewMyPhoneChance: chat.settings.viewMyPhoneChance || null,
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
      enableThoughts: chat.settings.enableThoughts || null,
      enableQzoneActions: chat.settings.enableQzoneActions || null,
      
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
      fishTtsSpeed: chat.settings.fishTtsSpeed ?? (window.ttsProvider.provider(chat) === 'fish' ? chat.settings.ttsSpeed ?? 1 : 1),
      ttsSpeed: chat.settings.ttsSpeed ?? 1,
      minimaxTtsSpeed: chat.settings.minimaxTtsSpeed ?? (window.ttsProvider.provider(chat) === 'minimax' ? chat.settings.ttsSpeed ?? 1 : 1),
      elevenlabsTtsSpeed: chat.settings.elevenlabsTtsSpeed ?? (window.ttsProvider.provider(chat) === 'elevenlabs' ? chat.settings.ttsSpeed ?? 1 : 1),
      ttsStreaming: chat.settings.ttsStreaming === true,
      ttsSplitLongText: chat.settings.ttsSplitLongText === true,
      ttsSaveAudio: chat.settings.ttsSaveAudio === true,
      ttsLanguage: chat.settings.ttsLanguage ?? window.ttsProvider.language(chat),
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
    const settingsToApply = preset.settings;
    
    // 逐个应用设置，确保不覆盖未包含在模板中的字段
    Object.keys(settingsToApply).forEach(key => {
      chat.settings[key] = settingsToApply[key];
    });
    
    // 保存到数据库
    await db.chats.put(chat);
    
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
    
    if (typeof showToast === 'function') {
      showToast('设置模板已保存');
    }
    
    return id;
  }

  // 生成模板描述（自动总结包含的设置）
  function generatePresetDescription(settings) {
    const features = [];
    
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
    } else {
      features.push('日记记忆');
    }
    
    // 记忆条数
    features.push(`${settings.maxMemory}条短期记忆`);
    
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

})();
