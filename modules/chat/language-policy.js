(function () {
  'use strict';

  const STANDARD_LANGUAGES = [
    ['zh-Hans-CN', '简体中文（中国大陆）'], ['zh-Hant-TW', '繁体中文（台湾）'],
    ['zh-Hant-HK', '繁体中文（香港）'], ['yue-Hant-HK', '粤语（香港繁体）'],
    ['yue-Hans-CN', '粤语（简体）'], ['en-US', '英语（美国）'], ['en-GB', '英语（英国）'],
    ['ko-KR', '韩语（韩国）'], ['ja-JP', '日语（日本）'], ['fr-FR', '法语（法国）'],
    ['de-DE', '德语（德国）'], ['es-ES', '西班牙语（西班牙）'], ['es-MX', '西班牙语（墨西哥）'],
    ['pt-BR', '葡萄牙语（巴西）'], ['pt-PT', '葡萄牙语（葡萄牙）'], ['it-IT', '意大利语（意大利）'],
    ['ru-RU', '俄语（俄罗斯）'], ['ar', '阿拉伯语'], ['hi-IN', '印地语（印度）'],
    ['th-TH', '泰语（泰国）'], ['vi-VN', '越南语（越南）'], ['id-ID', '印度尼西亚语'],
    ['ms-MY', '马来语（马来西亚）'], ['tr-TR', '土耳其语（土耳其）'],
    ['nl-NL', '荷兰语（荷兰）'], ['pl-PL', '波兰语（波兰）'], ['sv-SE', '瑞典语（瑞典）'],
    ['uk-UA', '乌克兰语（乌克兰）'], ['la', '拉丁语'], ['eo', '世界语'],
    ['zh-Latn-pinyin', '汉语拼音'], ['lzh', '文言文']
  ].map(([code, label]) => ({ code, label }));

  const LANGUAGE_ALIASES = {
    '中文': 'zh-Hans-CN', '普通话': 'zh-Hans-CN', '国语': 'zh-Hans-CN', '简中': 'zh-Hans-CN',
    '繁中': 'zh-Hant-TW', '广东话': 'yue-Hant-HK', '香港话': 'yue-Hant-HK',
    '韩国话': 'ko-KR', '韩文': 'ko-KR', '韩国语': 'ko-KR', '日本语': 'ja-JP'
  };

  const DEFAULT_POLICY = Object.freeze({
    outputMode: 'auto', outputLanguage: '', translationMode: 'fixed',
    translationLanguage: 'zh-Hans-CN', ttsReadMode: 'source', switchPolicy: 'dynamic',
    translationStyle: 'natural', narrationMode: 'inherit', narrationLanguage: '',
    customInstruction: '', examples: '', memberOverrides: {}
  });

  function normalizePolicy(raw) {
    const value = raw && typeof raw === 'object' ? raw : {};
    return {
      ...DEFAULT_POLICY,
      ...value,
      memberOverrides: value.memberOverrides && typeof value.memberOverrides === 'object'
        ? { ...value.memberOverrides }
        : {}
    };
  }

  function getPolicy(chat) {
    return normalizePolicy(chat?.settings?.languagePolicy);
  }

  function languageLabel(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    const found = STANDARD_LANGUAGES.find(item => item.code === normalized || item.code === LANGUAGE_ALIASES[normalized] || item.label === normalized);
    return found ? `${found.label}（${found.code}）` : normalized;
  }

  function displayLanguageValue(value) {
    const normalized = String(value || '').trim();
    const found = STANDARD_LANGUAGES.find(item => item.code === normalized || item.code === LANGUAGE_ALIASES[normalized] || item.label === normalized);
    return found ? found.label : normalized;
  }

  function canonicalLanguageValue(value) {
    const normalized = String(value || '').trim();
    const found = STANDARD_LANGUAGES.find(item => item.code === normalized || item.code === LANGUAGE_ALIASES[normalized] || item.label === normalized);
    return found ? found.code : normalized;
  }

  function memberKey(member) {
    return String(member?.id || member?.characterId || member?.originalName || member?.name || '');
  }

  function isBilingualMember(chat, member) {
    const selected = Array.isArray(chat?.settings?.bilingualCharacters) ? chat.settings.bilingualCharacters : [];
    if (!selected.length) return true;
    return selected.includes(member?.originalName) || selected.includes(memberKey(member));
  }

  function outputRule(policy) {
    if (policy.outputMode === 'forced') {
      return `【强制输出语言】该角色的所有对白文本和语音消息的原文必须始终使用“${languageLabel(policy.outputLanguage) || '用户指定语言'}”。此设置优先于角色人设、国籍、历史回复、用户消息使用的语言、自定义语言规则和语言示例；即使用户在对话中要求改用其他语言，也继续保持指定语言，只有用户在语言设置中修改后才切换。译文与独立旁白遵守各自的语言设置；不得翻译或修改消息协议的字段名、类型和角色标识。`;
    }
    if (policy.outputMode === 'fixed') {
      return `必须使用用户指定的“${languageLabel(policy.outputLanguage) || '自定义语言'}”作为角色对白原文。角色会其他语言、用户使用其他语言或角色国籍设定，都不能自动改变原文语言。`;
    }
    if (policy.outputMode === 'persona') return '根据角色人设确定最符合角色的主要语言，并在本次对话中保持该主要语言；“会某种语言”只表示理解能力，不等于默认用该语言回复。';
    if (policy.outputMode === 'user') return '角色对白原文跟随用户当前主要使用的语言。';
    return '根据角色人设、对话对象和当前情境自然选择角色对白原文语言。';
  }

  function switchRule(policy) {
    if (policy.outputMode === 'forced') return '语言保持策略：强制锁定指定语言，不按情境切换，也不夹杂其他语言的完整句子；仅保留必要的专有名词、直接引用和代码。此规则覆盖其他语言切换要求。';
    if (policy.switchPolicy === 'strict') return '语言保持策略：严格固定。除专有名词、直接引用和代码外，不得切换或大段夹杂其他语言。';
    if (policy.switchPolicy === 'explicit') return '语言保持策略：只有用户明确要求切换语言时才切换；用户仅仅使用另一种语言不算切换要求。';
    if (policy.switchPolicy === 'natural') return '语言保持策略：主体语言保持不变，允许少量符合人设的称呼、口头禅或外来词。';
    return '语言保持策略：可根据情境自然切换，但必须保证每条消息的原文语言明确一致。';
  }

  function translationRule(policy) {
    if (policy.translationMode === 'none') return '不生成翻译，只输出角色对白原文。';
    let interfaceLanguage = 'zh-CN';
    try { interfaceLanguage = localStorage.getItem('ephone-language') || 'zh-CN'; } catch (_) {}
    const target = policy.translationMode === 'interface'
      ? (interfaceLanguage === 'en' ? '英语（en）' : '简体中文（中国大陆）（zh-Hans-CN）')
      : languageLabel(policy.translationLanguage) || '简体中文（中国大陆）（zh-Hans-CN）';
    const style = {
      natural: '自然口语，保留人物语气，不要生硬翻译腔',
      faithful: '忠实准确，尽量保留原文信息与语气',
      concise: '简洁意译，保持原意，不添加解释',
      custom: '严格遵守用户填写的自定义翻译要求'
    }[policy.translationStyle] || '自然口语，保留人物语气';
    return `每条文本和语音消息都必须附带目标为“${target}”的译文。译文风格：${style}。目标为简体中文时禁止输出繁体字；目标为繁体中文时遵守所选地区的文字和用词。粤语与普通话之间必须做语义翻译，不能只做简繁字符转换。`;
  }

  function formatRule(policy) {
    return policy.translationMode === 'none'
      ? '只在 content 中放入原文。'
      : 'content 必须使用“原文〖译文〗”格式；括号只能使用 〖 和 〗，原文与〖之间不留空格，每条消息都要有完整对应译文。';
  }

  function resolvePolicyForSender(chat, senderName) {
    const policy = getPolicy(chat);
    if (!chat?.isGroup || !senderName || !Array.isArray(chat.members)) return policy;
    const member = chat.members.find(item => item.originalName === senderName || item.groupNickname === senderName || memberKey(item) === senderName);
    if (!member) return policy;
    return policyForMember(policy, member);
  }

  function policyForMember(policy, member) {
    const override = policy.memberOverrides[memberKey(member)] || {};
    const resolved = normalizePolicy({ ...policy, ...override });
    if (policy.outputMode === 'forced') resolved.outputMode = 'forced';
    return resolved;
  }

  function buildEnforcementPrompt(chat) {
    if (!chat?.settings?.enableBilingualMode) return '';
    const policy = getPolicy(chat);
    const entries = chat.isGroup
      ? (Array.isArray(chat.members) ? chat.members : []).filter(member => isBilingualMember(chat, member)).map(member => ({
        name: member.originalName || member.groupNickname || member.name || memberKey(member),
        policy: policyForMember(policy, member)
      }))
      : [{ name: '当前角色', policy }];
    const rules = entries.filter(entry => entry.policy.outputMode === 'forced').map(entry =>
      `- ${entry.name}：${outputRule(entry.policy)} ${switchRule(entry.policy)} ${translationRule(entry.policy)} ${formatRule(entry.policy)}`
    );
    return rules.length ? `\n# 【回复前必须核对：强制输出语言】\n以下规则仅适用于列出的角色。发送前检查每条角色对白和语音原文的语言，不符合时先改为指定语言，再生成相应译文。\n${rules.join('\n')}\n` : '';
  }

  function buildPrompt(chat, options = {}) {
    if (!chat?.settings?.enableBilingualMode) return '';
    const policy = getPolicy(chat);
    const advanced = [policy.customInstruction && `用户补充规则：${policy.customInstruction}`, policy.examples && `语言示例：\n${policy.examples}`].filter(Boolean).join('\n');
    const narration = policy.narrationMode === 'fixed'
      ? `旁白与动作描写使用：${languageLabel(policy.narrationLanguage) || '用户自定义语言'}。`
      : policy.narrationMode === 'translation'
        ? '旁白与动作描写使用译文目标语言。'
        : '旁白与动作描写沿用现有旁白规则。';
    if (!options.isGroup) {
      return `\n# 【语言与翻译规则 - 最高优先级】\n${outputRule(policy)}\n${switchRule(policy)}\n${translationRule(policy)}\n${formatRule(policy)}\n${narration}${advanced ? `\n${advanced}` : ''}\n`;
    }
    const members = Array.isArray(chat.members) ? chat.members : [];
    const activeMembers = members.filter(member => isBilingualMember(chat, member));
    const inactiveMembers = members.filter(member => !isBilingualMember(chat, member));
    const memberRules = activeMembers.map(member => {
      const override = policyForMember(policy, member);
      const name = member.originalName || member.groupNickname || member.name || memberKey(member);
      return `- ${name}：${outputRule(override)} ${switchRule(override)} ${translationRule(override)} ${formatRule(override)}`;
    }).join('\n');
    const inactiveRule = inactiveMembers.length
      ? `以下角色保持原有单语输出，禁止强制添加译文：${inactiveMembers.map(member => member.originalName || member.groupNickname || member.name).join('、')}。`
      : '';
    return `\n# 【群聊语言与翻译规则 - 最高优先级】\n${memberRules || `所有角色：${outputRule(policy)} ${switchRule(policy)} ${translationRule(policy)} ${formatRule(policy)}`}\n${inactiveRule}\n${narration}${advanced ? `\n${advanced}` : ''}\n`;
  }

  function splitContent(content) {
    const original = String(content || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/【/g, '〖').replace(/】/g, '〗');
    const matches = [...original.matchAll(/〖\s*([^〗]+?)\s*〗/g)];
    return {
      sourceText: original.replace(/〖[^〗]*〗/g, '').trim(),
      translationText: matches.map(match => match[1].trim()).filter(Boolean).join(' '),
      originalContent: original
    };
  }

  function getTtsText(content, chat) {
    const parts = splitContent(content);
    const mode = getPolicy(chat).ttsReadMode;
    if (mode === 'translation') return parts.translationText || parts.sourceText;
    if (mode === 'both') return [parts.sourceText, parts.translationText].filter(Boolean).join('。');
    return parts.sourceText || String(content || '');
  }

  function buildInlineAlert(chat, options = {}) {
    if (!chat?.settings?.enableBilingualMode) return '';
    const policy = getPolicy(chat);
    if (policy.translationMode === 'none') return ' 必须遵守当前语言设置，只输出角色原文';
    return ` 必须遵守当前语言与翻译设置，并使用原文〖译文〗格式${options.voice ? '（朗读内容由用户设置决定）' : ''}`;
  }

  function setVisible(id, visible, display = 'block') {
    const element = document.getElementById(id);
    if (element) element.style.display = visible ? display : 'none';
  }

  function updateConditionalUi() {
    const outputMode = document.getElementById('language-output-mode-select')?.value;
    setVisible('language-output-custom-row', outputMode === 'fixed' || outputMode === 'forced', 'flex');
    setVisible('language-output-force-hint', outputMode === 'forced');
    const switchSelect = document.getElementById('language-switch-policy-select');
    if (switchSelect) switchSelect.disabled = outputMode === 'forced';
    setVisible('language-translation-custom-row', document.getElementById('language-translation-mode-select')?.value === 'fixed', 'flex');
    setVisible('language-narration-custom-row', document.getElementById('language-narration-mode-select')?.value === 'fixed', 'flex');
  }

  function renderSuggestions(input, list) {
    if (!input || !list) return;
    const query = input.value.trim().toLowerCase();
    if (!query) {
      list.innerHTML = '';
      list.classList.remove('visible');
      return;
    }
    const aliasCodes = Object.entries(LANGUAGE_ALIASES).filter(([alias]) => alias.toLowerCase().includes(query)).map(([, code]) => code);
    const matches = STANDARD_LANGUAGES.filter(item => `${item.label} ${item.code}`.toLowerCase().includes(query) || aliasCodes.includes(item.code)).slice(0, 6);
    list.innerHTML = '';
    matches.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'language-suggestion';
      button.textContent = item.label;
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => {
        input.value = item.label;
        list.classList.remove('visible');
      });
      list.appendChild(button);
    });
    list.classList.toggle('visible', matches.length > 0);
  }

  function bindSearchInput(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list || input.dataset.languageBound === 'true') return;
    input.dataset.languageBound = 'true';
    input.addEventListener('input', () => renderSuggestions(input, list));
    input.addEventListener('focus', () => renderSuggestions(input, list));
    input.addEventListener('blur', () => setTimeout(() => list.classList.remove('visible'), 120));
  }

  function bindSettingsUi() {
    ['language-output-mode-select', 'language-translation-mode-select', 'language-narration-mode-select'].forEach(id => {
      const element = document.getElementById(id);
      if (element && element.dataset.languageBound !== 'true') {
        element.dataset.languageBound = 'true';
        element.addEventListener('change', updateConditionalUi);
      }
    });
    const advancedButton = document.getElementById('language-advanced-toggle');
    if (advancedButton && advancedButton.dataset.languageBound !== 'true') {
      advancedButton.dataset.languageBound = 'true';
      advancedButton.addEventListener('click', () => {
        const panel = document.getElementById('language-advanced-panel');
        const expanded = advancedButton.getAttribute('aria-expanded') === 'true';
        advancedButton.setAttribute('aria-expanded', String(!expanded));
        advancedButton.querySelector('.language-expand-mark').textContent = expanded ? '展开' : '收起';
        if (panel) panel.hidden = expanded;
      });
    }
    bindSearchInput('language-output-input', 'language-output-suggestions');
    bindSearchInput('language-translation-input', 'language-translation-suggestions');
    bindSearchInput('language-narration-input', 'language-narration-suggestions');
    updateConditionalUi();
  }

  function renderMemberOverrides(chat, policy) {
    const section = document.getElementById('language-member-overrides-group');
    const container = document.getElementById('language-member-overrides-list');
    if (!section || !container) return;
    section.style.display = chat?.isGroup ? 'block' : 'none';
    container.innerHTML = '';
    if (!chat?.isGroup || !Array.isArray(chat.members)) return;
    chat.members.forEach(member => {
      const key = memberKey(member);
      const override = policy.memberOverrides[key] || {};
      const item = document.createElement('div');
      item.className = 'language-member-item';
      item.dataset.memberKey = key;
      const title = document.createElement('div');
      title.className = 'language-member-name';
      title.textContent = member.groupNickname || member.originalName || member.name || '未命名角色';
      const sourceInput = document.createElement('input');
      sourceInput.type = 'text';
      sourceInput.className = 'language-member-input';
      sourceInput.placeholder = '输出语言：沿用群聊设置';
      sourceInput.value = displayLanguageValue(override.outputLanguage);
      sourceInput.dataset.field = 'outputLanguage';
      const targetInput = document.createElement('input');
      targetInput.type = 'text';
      targetInput.className = 'language-member-input';
      targetInput.placeholder = '翻译语言：沿用群聊设置';
      targetInput.value = displayLanguageValue(override.translationLanguage);
      targetInput.dataset.field = 'translationLanguage';
      item.append(title, sourceInput, targetInput);
      container.appendChild(item);
    });
  }

  function loadSettingsUi(chat) {
    bindSettingsUi();
    const policy = getPolicy(chat);
    const values = {
      'language-output-mode-select': policy.outputMode, 'language-output-input': displayLanguageValue(policy.outputLanguage),
      'language-translation-mode-select': policy.translationMode, 'language-translation-input': displayLanguageValue(policy.translationLanguage),
      'language-tts-read-mode-select': policy.ttsReadMode, 'language-switch-policy-select': policy.switchPolicy,
      'language-translation-style-select': policy.translationStyle, 'language-narration-mode-select': policy.narrationMode,
      'language-narration-input': displayLanguageValue(policy.narrationLanguage), 'language-custom-instruction': policy.customInstruction,
      'language-examples-input': policy.examples
    };
    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.value = value || '';
    });
    setVisible('language-policy-settings', Boolean(chat?.settings?.enableBilingualMode));
    renderMemberOverrides(chat, policy);
    updateConditionalUi();
  }

  function saveSettingsUi(chat) {
    if (!chat?.settings) return;
    const previous = getPolicy(chat);
    const read = id => document.getElementById(id)?.value?.trim() || '';
    const memberOverrides = { ...previous.memberOverrides };
    document.querySelectorAll('#language-member-overrides-list .language-member-item').forEach(item => {
      const outputLanguage = canonicalLanguageValue(item.querySelector('[data-field="outputLanguage"]')?.value);
      const translationLanguage = canonicalLanguageValue(item.querySelector('[data-field="translationLanguage"]')?.value);
      if (outputLanguage || translationLanguage) {
        memberOverrides[item.dataset.memberKey] = {
          ...(memberOverrides[item.dataset.memberKey] || {}),
          ...(outputLanguage ? { outputMode: 'fixed', outputLanguage } : {}),
          ...(translationLanguage ? { translationMode: 'fixed', translationLanguage } : {})
        };
      } else delete memberOverrides[item.dataset.memberKey];
    });
    chat.settings.languagePolicy = normalizePolicy({
      outputMode: read('language-output-mode-select') || previous.outputMode,
      outputLanguage: canonicalLanguageValue(read('language-output-input')),
      translationMode: read('language-translation-mode-select') || previous.translationMode,
      translationLanguage: canonicalLanguageValue(read('language-translation-input')),
      ttsReadMode: read('language-tts-read-mode-select') || previous.ttsReadMode,
      switchPolicy: read('language-switch-policy-select') || previous.switchPolicy,
      translationStyle: read('language-translation-style-select') || previous.translationStyle,
      narrationMode: read('language-narration-mode-select') || previous.narrationMode,
      narrationLanguage: canonicalLanguageValue(read('language-narration-input')),
      customInstruction: read('language-custom-instruction'), examples: read('language-examples-input'), memberOverrides
    });
  }

  function validateSettingsUi(enabled) {
    if (!enabled) return '';
    const outputMode = document.getElementById('language-output-mode-select')?.value;
    const translationMode = document.getElementById('language-translation-mode-select')?.value;
    const narrationMode = document.getElementById('language-narration-mode-select')?.value;
    if ((outputMode === 'fixed' || outputMode === 'forced') && !document.getElementById('language-output-input')?.value.trim()) return `选择“${outputMode === 'forced' ? '强制指定语言' : '手动指定'}”后，请填写角色输出语言。`;
    if (translationMode === 'fixed' && !document.getElementById('language-translation-input')?.value.trim()) return '请选择或填写翻译语言。';
    if (narrationMode === 'fixed' && !document.getElementById('language-narration-input')?.value.trim()) return '选择手动指定旁白语言后，请填写旁白语言。';
    return '';
  }

  window.languagePolicy = { STANDARD_LANGUAGES, getPolicy, resolvePolicyForSender, buildPrompt, buildEnforcementPrompt, buildInlineAlert, splitContent, getTtsText, bindSettingsUi, loadSettingsUi, saveSettingsUi, validateSettingsUi, updateConditionalUi };
})();
