// ==================== 时间感知与自定义时间系统 ====================
(function() {
  'use strict';

  // 获取元素
  const timePerceptionToggle = document.getElementById('time-perception-toggle');
  const timeZoneGroup = document.getElementById('time-zone-group');
  const customTimeToggle = document.getElementById('custom-time-toggle');
  const customTimeSettingsGroup = document.getElementById('custom-time-settings-group');
  
  const customYearInput = document.getElementById('custom-year-input');
  const customMonthInput = document.getElementById('custom-month-input');
  const customDayInput = document.getElementById('custom-day-input');
  const customHourInput = document.getElementById('custom-hour-input');
  const customMinuteInput = document.getElementById('custom-minute-input');
  const customTimePreview = document.getElementById('custom-time-preview');
  const customTimePauseBtn = document.getElementById('custom-time-pause-btn');
  const customTimePauseStatus = document.getElementById('custom-time-pause-status');

  const TIME_AWARENESS_DEFAULT_KEY = 'ephone-time-awareness-global-default';
  const CUSTOM_TIME_PAUSED_KEY = 'custom-time-paused';
  const CUSTOM_TIME_PAUSED_AT_KEY = 'custom-time-paused-at';
  const CUSTOM_TIME_PAUSED_VALUE_KEY = 'custom-time-paused-value';
  const CUSTOM_TIME_PAUSE_HISTORY_KEY = 'custom-time-pause-history';

  const PRESET_SUMMARIES = {
    adaptive: '提供客观时间信息，由角色依据人设、关系和当前消息自行决定是否回应。',
    subtle: '弱化时间差；通常继续当前话题，仅在明显间隔后含蓄体现。',
    natural: '在合适时自然体现时间变化，不要求固定问候或强制换话题。',
    strong: '明显感知用户离开；较容易直接回应，但仍需符合角色人设。',
    custom: '使用下方的精细选项和自定义回来反应规则。'
  };

  const PRESET_RULES = {
    adaptive: '把时间差视为背景事实。依据角色人设、双方关系、上一段对话和用户当前消息，自主判断是否注意、是否表现以及如何表现。不要机械问候，不要为了体现时间感知而忽略用户当前消息。',
    subtle: '轻微感知时间变化。通常不直接提到离开时长，不主动制造重逢感；除非间隔非常明显且符合角色人设，否则自然延续用户当前消息或未完成的话题。',
    natural: '自然感知时间变化。可以通过语气、态度或合适的一句话体现时间差，也可以不提；不要套用固定问候，不要仅因时间过去就强制更换话题。',
    strong: '明显感知这段时间差，并以符合角色人设和双方关系的方式作出较清晰反应。可以表达想念、担心、不满、冷淡或分享近况，但仍须先理解并回应用户当前消息，禁止使用统一模板。',
    custom: '按照用户配置的时间事实、反应权限、回应频率和自定义规则处理本次回来事件。'
  };

  const TIME_AWARENESS_DEFAULTS = Object.freeze({
    preset: 'adaptive',
    minGapMinutes: 180,
    durationStyle: 'approximate',
    responseFrequency: 'autonomous',
    facts: {
      date: true,
      time: true,
      period: true,
      gap: true,
      lastInteraction: true,
      crossDay: true
    },
    behavior: {
      allowMention: true,
      allowEmotion: true,
      allowUpdates: true,
      allowNewTopic: true,
      allowContinue: true,
      prioritizeCurrent: true,
      personaAware: true,
      scaleWithGap: true,
      avoidCliche: true,
      firstReplyOnly: true
    },
    promptMode: 'builtin',
    customPrompt: '',
    groupGapBasis: 'groupSilence',
    groupMaxResponders: 1,
    pauseGapWhileWorldPaused: true,
    pauseBackgroundWhileWorldPaused: false,
    backgroundPaused: false,
    applyReturnPromptToBackground: false
  });

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeTimeAwarenessConfig(raw) {
    const value = raw && typeof raw === 'object' ? raw : {};
    return {
      ...deepClone(TIME_AWARENESS_DEFAULTS),
      ...value,
      facts: { ...TIME_AWARENESS_DEFAULTS.facts, ...(value.facts || {}) },
      behavior: { ...TIME_AWARENESS_DEFAULTS.behavior, ...(value.behavior || {}) }
    };
  }

  function getGlobalTimeAwarenessDefault() {
    if (window.state?.globalSettings?.timeAwarenessDefault) {
      return normalizeTimeAwarenessConfig(window.state.globalSettings.timeAwarenessDefault);
    }
    try {
      return normalizeTimeAwarenessConfig(JSON.parse(localStorage.getItem(TIME_AWARENESS_DEFAULT_KEY) || 'null'));
    } catch (_) {
      return normalizeTimeAwarenessConfig();
    }
  }

  function getChatTimeAwarenessConfig(chat) {
    if (chat?.settings?.timeAwareness) return normalizeTimeAwarenessConfig(chat.settings.timeAwareness);
    return getGlobalTimeAwarenessDefault();
  }

  function isCustomTimePaused() {
    return localStorage.getItem(CUSTOM_TIME_PAUSED_KEY) === 'true';
  }

  const TIME_ZONE_LABELS = {
    'Asia/Shanghai': '中国 · 北京 / 上海', 'Asia/Hong_Kong': '中国 · 香港',
    'Asia/Taipei': '中国 · 台北', 'Asia/Tokyo': '日本 · 东京', 'Asia/Seoul': '韩国 · 首尔',
    'Asia/Singapore': '新加坡', 'Asia/Kolkata': '印度 · 加尔各答', 'Asia/Dubai': '阿联酋 · 迪拜',
    'America/New_York': '美国 · 纽约', 'America/Los_Angeles': '美国 · 洛杉矶',
    'America/Chicago': '美国 · 芝加哥', 'America/Denver': '美国 · 丹佛',
    'America/Phoenix': '美国 · 凤凰城', 'America/Anchorage': '美国 · 安克雷奇',
    'Pacific/Honolulu': '美国 · 檀香山', 'America/Toronto': '加拿大 · 多伦多',
    'America/Vancouver': '加拿大 · 温哥华', 'Europe/London': '英国 · 伦敦',
    'Europe/Paris': '法国 · 巴黎', 'Europe/Berlin': '德国 · 柏林',
    'Europe/Moscow': '俄罗斯 · 莫斯科', 'Australia/Sydney': '澳大利亚 · 悉尼',
    'Pacific/Auckland': '新西兰 · 奥克兰', 'UTC': '协调世界时 · UTC'
  };

  function validTimeZone(value, fallback = 'Asia/Shanghai') {
    if (value) {
      try { new Intl.DateTimeFormat('zh-CN', { timeZone: value }); return value; } catch (_) {}
    }
    return fallback;
  }

  function populateRoleTimeZones(select, value = '', allowFollow = true) {
    if (!select) return;
    const zones = [...new Set([...Object.keys(TIME_ZONE_LABELS), ...(Intl.supportedValuesOf?.('timeZone') || []), ...(value && value !== 'follow-user' ? [value] : [])])];
    select.innerHTML = '';
    for (const zone of [...(allowFollow ? ['', 'follow-user'] : []), ...zones]) {
      const option = document.createElement('option');
      option.value = zone;
      option.textContent = zone === '' ? '未设置（按人设与剧情判断）' : zone === 'follow-user' ? '跟随我的时区' : `${TIME_ZONE_LABELS[zone] || zone}${TIME_ZONE_LABELS[zone] ? `（${zone}）` : ''}`;
      select.appendChild(option);
    }
    select.value = value;
    window.TimeZoneTools?.resetSearch(select.id);
  }

  function getMemberTimeZone(member) {
    const profile = window.state?.chats?.[member.id];
    return profile?.settings?.characterTimeZone ?? member.characterTimeZone ?? '';
  }

  function saveMemberTimeZone(member) {
    const select = document.getElementById('member-time-zone-select');
    if (!select || !member) return;
    member.characterTimeZone = select.value;
    const profile = window.state?.chats?.[member.id];
    if (profile) {
      profile.settings = profile.settings || {};
      profile.settings.characterTimeZone = select.value;
    }
  }

  function localTime(timestamp, timeZone, name) {
    const date = new Date(timestamp);
    const fields = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(date).map(part => [part.type, part.value]));
    // 仅用于现有的日期/时段 getter；真实时间戳始终使用 timestamp。
    const localizedDate = new Date(0);
    localizedDate.setFullYear(Number(fields.year), Number(fields.month) - 1, Number(fields.day));
    localizedDate.setHours(Number(fields.hour), Number(fields.minute), Number(fields.second), 0);
    const wallTime = new Date(0);
    wallTime.setUTCFullYear(Number(fields.year), Number(fields.month) - 1, Number(fields.day));
    wallTime.setUTCHours(Number(fields.hour), Number(fields.minute), Number(fields.second), 0);
    const hour = Number(fields.hour);
    return {
      name, timeZone, date: localizedDate, dateKey: `${fields.year}-${fields.month}-${fields.day}`,
      utcOffsetMinutes: Math.round((wallTime.getTime() - Math.floor(timestamp / 1000) * 1000) / 60000),
      dateText: date.toLocaleDateString('zh-CN', { timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      timeText: `${fields.hour}:${fields.minute}`,
      formatted: date.toLocaleString('zh-CN', { timeZone, dateStyle: 'full', timeStyle: 'short' }),
      period: hour < 5 ? '凌晨' : hour < 9 ? '早上' : hour < 13 ? '上午' : hour < 18 ? '下午' : '晚上'
    };
  }

  function getClockInfo(chat, nowTimestamp = Date.now()) {
    const worldClock = window.MemoryWorldTime?.clock(chat, nowTimestamp);
    const custom = worldClock ? null : window.getCustomTime?.(chat);
    const timestamp = worldClock?.time ?? (custom?.enabled ? (custom.timestamp ?? custom.date.getTime()) : nowTimestamp);
    const userZone = validTimeZone(chat?.settings?.timeZone);
    const user = localTime(timestamp, userZone, '用户');
    const roles = chat?.isGroup
      ? (chat.members || []).map(member => ({ zone: getMemberTimeZone(member), name: member.originalName || member.groupNickname || '角色' }))
      : [{ zone: chat?.settings?.characterTimeZone, name: chat?.originalName || chat?.name || '角色' }];
    const characters = [], unknownCharacters = [];
    for (const role of roles) {
      const zone = role.zone === 'follow-user' ? userZone : validTimeZone(role.zone, null);
      if (zone) characters.push(localTime(timestamp, zone, role.name));
      else unknownCharacters.push(role.name);
    }
    const primary = chat?.isGroup ? user : characters[0];
    return { timestamp, user, characters, unknownCharacters,
      currentTime: primary?.formatted || `角色当地时间未设置，按人设与剧情判断；用户当地时间：${user.formatted}`,
      localizedDate: primary?.date || user.date, timeOfDayGreeting: primary?.period || '角色当地时段未设置' };
  }

  function updateRoleTimePreview(force = false) {
    const preview = document.getElementById('role-time-preview');
    const chat = window.state?.chats?.[window.state.activeChatId];
    if (!preview || !chat || chat.isGroup) return;
    if (!force && (document.hidden || preview.getClientRects?.().length === 0)) return;
    const draft = { ...chat, settings: {
      ...chat.settings,
      timeZone: document.getElementById('time-zone-select')?.value || chat.settings.timeZone,
      characterTimeZone: document.getElementById('character-time-zone-select')?.value ?? chat.settings.characterTimeZone
    } };
    const { user, characters } = getClockInfo(draft);
    const role = characters[0];
    const format = local => `${local.dateKey} ${local.timeText}（${local.period}）`;
    setValueText('role-time-preview-user', format(user));
    if (!role) {
      setValueText('role-time-preview-character', '未设置，按人设与剧情判断');
      setValueText('role-time-preview-difference', '未设置角色时区，不计算时差');
      return;
    }
    setValueText('role-time-preview-character', format(role));
    const difference = role.utcOffsetMinutes - user.utcOffsetMinutes;
    const minutes = Math.abs(difference);
    const duration = [Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}小时` : '',
      minutes % 60 ? `${minutes % 60}分钟` : ''].join('');
    setValueText('role-time-preview-difference', difference ? `角色比我${difference > 0 ? '快' : '慢'}${duration}` : '无时差，双方时间相同');
  }

  function setValueText(id, text) {
    const element = document.getElementById(id);
    if (element && element.textContent !== text) element.textContent = text;
  }

  function localTimeFacts(info, config) {
    if (!config.facts.date && !config.facts.time && !config.facts.period) return [];
    const facts = [info.user, ...info.characters].map((local, index) => {
      const content = [config.facts.date && local.dateText, config.facts.time && local.timeText,
        config.facts.period && local.period].filter(Boolean).join('，');
      return `${index === 0 ? '用户' : `角色「${local.name}」`}当地时间（${TIME_ZONE_LABELS[local.timeZone] || local.timeZone}，${local.timeZone}）：${content}`;
    });
    if (info.unknownCharacters.length) facts.push(`角色${info.unknownCharacters.map(name => `「${name}」`).join('、')}未设置时区：所在地、日期、天色和作息按人设、世界书与当前剧情判断。不得将用户当地时间当成这些角色的当地时间，不默认双方同处一地或同一时段；资料不足时不编造精确时间或时差。`);
    return facts;
  }

  const LOCAL_TIME_RULE = '用户的“早安／晚安”等问候可以对应用户当地时间，不代表角色也处于相同时段。可以自然回应用户的问候；已设置时区的角色描述自己的日期、天色、作息和“今天／昨天／明天”时，须以该角色当地时间为准；未设置时区的角色按人设、世界书与剧情判断。不要强行纠正用户，也不要每轮刻意解释时差。';

  function buildLocalContext(chat, nowTimestamp = Date.now()) {
    if (!chat?.settings?.enableTimePerception) return '';
    const facts = localTimeFacts(getClockInfo(chat, nowTimestamp), getChatTimeAwarenessConfig(chat));
    return facts.length ? `# 双方当地时间\n${facts.map(item => `- ${item}`).join('\n')}\n- ${LOCAL_TIME_RULE}` : '';
  }

  function loadPauseHistory() {
    try {
      const history = JSON.parse(localStorage.getItem(CUSTOM_TIME_PAUSE_HISTORY_KEY) || '[]');
      return Array.isArray(history) ? history.filter(item => Number.isFinite(item?.start)) : [];
    } catch (_) {
      return [];
    }
  }

  function savePauseHistory(history) {
    localStorage.setItem(CUSTOM_TIME_PAUSE_HISTORY_KEY, JSON.stringify(history.slice(-100)));
  }

  function getPausedDurationBetween(start, end, chat) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    const ownClock = window.MemoryWorldTime?.config(chat);
    const independent = chat && ownClock?.clockMode === 'independent';
    const history = independent ? [...(ownClock.clock?.pauseHistory || [])] : loadPauseHistory();
    if (independent ? ownClock.clock?.paused : isCustomTimePaused()) {
      const activeStart = independent ? Number(ownClock.clock.pausedAt) : parseInt(localStorage.getItem(CUSTOM_TIME_PAUSED_AT_KEY), 10);
      if (Number.isFinite(activeStart)) history.push({ start: activeStart, end });
    }
    return history.reduce((total, interval) => {
      const overlapStart = Math.max(start, interval.start);
      const overlapEnd = Math.min(end, Number.isFinite(interval.end) ? interval.end : end);
      return total + Math.max(0, overlapEnd - overlapStart);
    }, 0);
  }

  // 从localStorage加载设置
  function loadSettings() {
    const timePerceptionEnabled = localStorage.getItem('time-perception-enabled') === 'true';
    const customTimeEnabled = localStorage.getItem('custom-time-enabled') === 'true';
    
    timePerceptionToggle.checked = timePerceptionEnabled;
    customTimeToggle.checked = customTimeEnabled;
    
    // 显示/隐藏相应的设置面板
    if (timePerceptionEnabled) {
      timeZoneGroup.style.display = 'block';
    }
    if (customTimeEnabled) {
      customTimeSettingsGroup.style.display = 'block';
    }
    
    // 加载自定义时间值
    customYearInput.value = localStorage.getItem('custom-time-year') || '';
    customMonthInput.value = localStorage.getItem('custom-time-month') || '';
    customDayInput.value = localStorage.getItem('custom-time-day') || '';
    customHourInput.value = localStorage.getItem('custom-time-hour') || '';
    customMinuteInput.value = localStorage.getItem('custom-time-minute') || '';
    const rateInput = document.getElementById('custom-time-rate');
    if (rateInput) rateInput.value = localStorage.getItem('custom-time-rate') ?? '1';
    
    updatePreview();
  }

  // 更新时间预览（显示流逝后的实时时间）
  let previewTimer = null;
  function updatePreview() {
    updateRoleTimePreview(true);
    const customTimeEnabled = localStorage.getItem('custom-time-enabled') === 'true';
    if (customTimeEnabled) {
      const d = calcElapsedCustomTime();
      if (d) {
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        customTimePreview.textContent = `${y}年${mo}月${da}日 ${h}:${mi}`;
        // 每分钟刷新一次预览；暂停时无需刷新。
        if (!previewTimer && !isCustomTimePaused()) {
          previewTimer = setInterval(updatePreview, 60000);
        }
        updatePauseUi();
        return;
      }
    }
    // 未启用或数据不完整
    const year = customYearInput.value;
    const month = customMonthInput.value;
    const day = customDayInput.value;
    const hour = customHourInput.value;
    const minute = customMinuteInput.value;
    if (year && month && day && hour !== '' && minute !== '') {
      customTimePreview.textContent = `${year}年${String(month).padStart(2, '0')}月${String(day).padStart(2, '0')}日 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    } else {
      customTimePreview.textContent = '未设置';
    }
    if (previewTimer) {
      clearInterval(previewTimer);
      previewTimer = null;
    }
    updatePauseUi();
  }

  // 保存自定义时间设置（同时记录设定时的真实时间戳，用于时间流逝计算）
  function saveCustomTimeSettings() {
    window.MemoryWorldTime?.flush();
    localStorage.removeItem('custom-time-base-value');
    localStorage.setItem('custom-time-year', customYearInput.value);
    localStorage.setItem('custom-time-month', customMonthInput.value);
    localStorage.setItem('custom-time-day', customDayInput.value);
    localStorage.setItem('custom-time-hour', customHourInput.value);
    localStorage.setItem('custom-time-minute', customMinuteInput.value);
    // 记录设定这个时间时的真实时间戳，后续用 elapsed = Date.now() - anchor 来计算流逝
    localStorage.setItem('custom-time-anchor', String(Date.now()));
    if (isCustomTimePaused()) {
      const pausedValue = new Date(
        parseInt(customYearInput.value), parseInt(customMonthInput.value) - 1, parseInt(customDayInput.value),
        parseInt(customHourInput.value), parseInt(customMinuteInput.value)
      ).getTime();
      if (Number.isFinite(pausedValue)) localStorage.setItem(CUSTOM_TIME_PAUSED_VALUE_KEY, String(pausedValue));
    }
    updatePreview();
  }

  // 时间感知开关事件
  timePerceptionToggle.addEventListener('change', function() {
    const isEnabled = this.checked;
    localStorage.setItem('time-perception-enabled', isEnabled);
    
    if (isEnabled) {
      // 显示时区设置
      timeZoneGroup.style.display = 'block';
      
    } else {
      timeZoneGroup.style.display = 'none';
    }
  });

  // 自定义时间开关事件
  customTimeToggle.addEventListener('change', function() {
    window.MemoryWorldTime?.flush();
    const isEnabled = this.checked;
    localStorage.setItem('custom-time-enabled', isEnabled);
    
    if (isEnabled) {
      // 显示自定义时间设置
      customTimeSettingsGroup.style.display = 'block';
      
      // 如果没有设置值，使用当前时间作为默认值
      if (!customYearInput.value) {
        const now = new Date();
        customYearInput.value = now.getFullYear();
        customMonthInput.value = now.getMonth() + 1;
        customDayInput.value = now.getDate();
        customHourInput.value = now.getHours();
        customMinuteInput.value = now.getMinutes();
        saveCustomTimeSettings();
      }
      updatePreview();
    } else {
      if (isCustomTimePaused()) resumeCustomTime();
      customTimeSettingsGroup.style.display = 'none';
      // 关闭时清理预览定时器
      if (previewTimer) {
        clearInterval(previewTimer);
        previewTimer = null;
      }
      updatePauseUi();
    }
  });

  // 监听自定义时间输入变化
  [customYearInput, customMonthInput, customDayInput, customHourInput, customMinuteInput].forEach(input => {
    input.addEventListener('input', saveCustomTimeSettings);
    input.addEventListener('change', saveCustomTimeSettings);
  });

  // 根据用户设定的基准时间 + 真实流逝时间，计算当前自定义时间
  function calcElapsedCustomTime() {
    const year = localStorage.getItem('custom-time-year');
    const month = localStorage.getItem('custom-time-month');
    const day = localStorage.getItem('custom-time-day');
    const hour = localStorage.getItem('custom-time-hour');
    const minute = localStorage.getItem('custom-time-minute');
    const anchor = localStorage.getItem('custom-time-anchor');

    if (isCustomTimePaused()) {
      const pausedValue = parseInt(localStorage.getItem(CUSTOM_TIME_PAUSED_VALUE_KEY), 10);
      if (Number.isFinite(pausedValue)) return new Date(pausedValue);
    }

    if (year && month && day && hour !== null && minute !== null && anchor) {
      const storedBase = localStorage.getItem('custom-time-base-value');
      const baseTime = storedBase !== null && Number.isFinite(Number(storedBase)) ? Number(storedBase) : new Date(
        parseInt(year), parseInt(month) - 1, parseInt(day),
        parseInt(hour), parseInt(minute)
      ).getTime();
      const storedRate = Number(localStorage.getItem('custom-time-rate') ?? 1);
      const rate = Number.isFinite(storedRate) && storedRate >= 0 ? storedRate : 1;
      const elapsed = (Date.now() - parseInt(anchor)) * rate;
      return new Date(baseTime + elapsed);
    }
    return null;
  }

  function updatePauseUi() {
    if (!customTimePauseBtn || !customTimePauseStatus) return;
    const enabled = localStorage.getItem('custom-time-enabled') === 'true';
    const paused = isCustomTimePaused();
    customTimePauseBtn.disabled = !enabled;
    customTimePauseBtn.textContent = paused ? '继续世界时间' : '暂停世界时间';
    customTimePauseStatus.textContent = !enabled ? '请先开启自定义时间' : (paused ? '已暂停' : '运行中');
  }

  function pauseCustomTime() {
    if (localStorage.getItem('custom-time-enabled') !== 'true' || isCustomTimePaused()) return;
    window.MemoryWorldTime?.flush();
    const current = calcElapsedCustomTime();
    if (!current) return;
    const now = Date.now();
    localStorage.setItem(CUSTOM_TIME_PAUSED_KEY, 'true');
    localStorage.setItem(CUSTOM_TIME_PAUSED_AT_KEY, String(now));
    localStorage.setItem(CUSTOM_TIME_PAUSED_VALUE_KEY, String(current.getTime()));
    if (previewTimer) {
      clearInterval(previewTimer);
      previewTimer = null;
    }
    updatePreview();
  }

  function resumeCustomTime() {
    if (!isCustomTimePaused()) return;
    window.MemoryWorldTime?.flush();
    const now = Date.now();
    const pausedAt = parseInt(localStorage.getItem(CUSTOM_TIME_PAUSED_AT_KEY), 10);
    const pausedValue = parseInt(localStorage.getItem(CUSTOM_TIME_PAUSED_VALUE_KEY), 10);
    if (Number.isFinite(pausedAt)) {
      const history = loadPauseHistory();
      history.push({ start: pausedAt, end: now });
      savePauseHistory(history);
    }
    if (Number.isFinite(pausedValue)) {
      const d = new Date(pausedValue);
      customYearInput.value = d.getFullYear();
      customMonthInput.value = d.getMonth() + 1;
      customDayInput.value = d.getDate();
      customHourInput.value = d.getHours();
      customMinuteInput.value = d.getMinutes();
      localStorage.setItem('custom-time-year', String(d.getFullYear()));
      localStorage.setItem('custom-time-month', String(d.getMonth() + 1));
      localStorage.setItem('custom-time-day', String(d.getDate()));
      localStorage.setItem('custom-time-hour', String(d.getHours()));
      localStorage.setItem('custom-time-minute', String(d.getMinutes()));
      localStorage.setItem('custom-time-anchor', String(now));
      if (localStorage.getItem('custom-time-base-value') !== null) localStorage.setItem('custom-time-base-value', String(pausedValue));
    }
    localStorage.setItem(CUSTOM_TIME_PAUSED_KEY, 'false');
    localStorage.removeItem(CUSTOM_TIME_PAUSED_AT_KEY);
    localStorage.removeItem(CUSTOM_TIME_PAUSED_VALUE_KEY);
    updatePreview();
  }

  customTimePauseBtn?.addEventListener('click', () => {
    if (isCustomTimePaused()) resumeCustomTime();
    else pauseCustomTime();
  });

  // 获取当前时间（考虑自定义时间 + 自动流逝）
  window.getCustomTime = function(chat) {
    if (chat && window.MemoryWorldTime?.config(chat).clockMode === 'independent') return window.MemoryWorldTime.customTime(chat);
    const customTimeEnabled = localStorage.getItem('custom-time-enabled') === 'true';
    
    if (customTimeEnabled) {
      const d = calcElapsedCustomTime();
      if (d) {
        const y = d.getFullYear();
        const mo = d.getMonth() + 1;
        const da = d.getDate();
        const h = d.getHours();
        const mi = d.getMinutes();
        return {
          enabled: true,
          year: y,
          month: mo,
          day: da,
          hour: h,
          minute: mi,
          date: d,
          formatted: `${y}年${String(mo).padStart(2, '0')}月${String(da).padStart(2, '0')}日 ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
        };
      }
    }
    
    // 返回当前实际时间
    const now = new Date();
    return {
      enabled: false,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      date: now,
      formatted: `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    };
  };

  function formatGapDuration(milliseconds, style) {
    const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const days = Math.floor(hours / 24);
    if (style === 'vague') {
      if (totalMinutes < 15) return '一小会儿';
      if (totalMinutes < 60) return '一阵子';
      if (hours < 6) return '几个小时';
      if (hours < 24) return '大半天';
      if (days < 3) return '一两天';
      if (days < 7) return '好几天';
      if (days < 30) return '很久';
      return '非常久';
    }
    if (style === 'exact') {
      if (days > 0) return `${days}天${hours % 24 ? `${hours % 24}小时` : ''}`;
      if (hours > 0) return `${hours}小时${totalMinutes % 60 ? `${totalMinutes % 60}分钟` : ''}`;
      return `${totalMinutes}分钟`;
    }
    if (days > 0) return `大约${days}天`;
    if (hours > 0) return `大约${hours}小时`;
    return `大约${Math.max(1, totalMinutes)}分钟`;
  }

  function getGapBand(minutes) {
    if (minutes < 5) return '刚刚';
    if (minutes < 180) return '短暂离开';
    if (minutes < 1440) return '数小时未互动';
    if (minutes < 10080) return '数日未互动';
    return '长时间未互动';
  }

  function getFrequencyInstruction(value) {
    return ({
      autonomous: '是否把时间差表现出来由角色自主决定。',
      rare: '通常不要直接表现时间差，只有非常符合人设和情境时才提及。',
      moderate: '可以适度表现时间差，但避免每次回来都采用相同反应。',
      frequent: '多数回来场景可以表现时间差，但表达方式必须保持变化。',
      always: '本次回来需要让角色注意到时间差，但如何表达仍须符合人设。'
    })[value] || '';
  }

  function fillTimeTemplate(template, variables) {
    return String(template || '').replace(/\{\{([^{}]+)\}\}/g, (match, key) => {
      const cleanKey = key.trim();
      return Object.prototype.hasOwnProperty.call(variables, cleanKey) ? variables[cleanKey] : match;
    });
  }

  function resolveInteractionGap(chat, history, mode, nowTimestamp, config) {
    const visible = (history || []).filter(message => message && !message.isHidden && !message.isExcluded && Number.isFinite(Number(message.timestamp)));
    if (visible.length === 0) return { firstInteraction: true, gapMs: Infinity, previousMessage: null, currentUserMessage: null };

    if (mode === 'background' || mode === 'groupBackground') {
      const previousMessage = visible[visible.length - 1];
      let gapMs = Math.max(0, nowTimestamp - Number(previousMessage.timestamp));
      if (config.pauseGapWhileWorldPaused) gapMs = Math.max(0, gapMs - getPausedDurationBetween(Number(previousMessage.timestamp), nowTimestamp, chat));
      return { firstInteraction: false, gapMs, previousMessage, currentUserMessage: null };
    }

    let currentUserIndex = -1;
    for (let index = visible.length - 1; index >= 0; index -= 1) {
      if (visible[index].role === 'user') {
        currentUserIndex = index;
        break;
      }
    }
    if (currentUserIndex < 0) return { firstInteraction: true, gapMs: Infinity, previousMessage: null, currentUserMessage: null };

    const currentUserMessage = visible[currentUserIndex];
    let previousMessage = visible[currentUserIndex - 1] || null;
    if (chat?.isGroup && config.groupGapBasis === 'userAbsence') {
      previousMessage = null;
      for (let index = currentUserIndex - 1; index >= 0; index -= 1) {
        if (visible[index].role === 'user') {
          previousMessage = visible[index];
          break;
        }
      }
    }
    if (!config.behavior.firstReplyOnly && !(chat?.isGroup && config.groupGapBasis === 'userAbsence')) {
      for (let index = currentUserIndex - 1; index >= 0; index -= 1) {
        if (visible[index].role === 'assistant') {
          previousMessage = visible[index];
          break;
        }
      }
    }
    if (!previousMessage) return { firstInteraction: true, gapMs: Infinity, previousMessage: null, currentUserMessage };
    let gapMs = Math.max(0, Number(currentUserMessage.timestamp) - Number(previousMessage.timestamp));
    if (config.pauseGapWhileWorldPaused) {
      gapMs = Math.max(0, gapMs - getPausedDurationBetween(Number(previousMessage.timestamp), Number(currentUserMessage.timestamp), chat));
    }
    return { firstInteraction: false, gapMs, previousMessage, currentUserMessage };
  }

  function buildTimeAwarenessContext(options = {}) {
    const chat = options.chat;
    if (!chat?.settings?.enableTimePerception) return { context: '', isReturn: false, gapMs: 0, timeContextText: '', longTimeNoSee: false };
    const config = getChatTimeAwarenessConfig(chat);
    const nowTimestamp = Number.isFinite(options.nowTimestamp) ? options.nowTimestamp : Date.now();
    const gap = Number.isFinite(options.simulatedGapMinutes)
      ? {
          firstInteraction: false,
          gapMs: Math.max(0, options.simulatedGapMinutes * 60000),
          previousMessage: { timestamp: nowTimestamp - options.simulatedGapMinutes * 60000, role: 'assistant', content: '（模拟的上一条消息）' },
          currentUserMessage: { timestamp: nowTimestamp, role: 'user', content: '（模拟的回来消息）' }
        }
      : resolveInteractionGap(chat, options.history || chat.history, options.mode || 'reply', nowTimestamp, config);

    const clockInfo = getClockInfo(chat, nowTimestamp);
    const currentTime = clockInfo.currentTime;
    const period = clockInfo.timeOfDayGreeting;
    const gapMinutes = gap.gapMs === Infinity ? Infinity : Math.floor(gap.gapMs / 60000);
    const isReturn = !gap.firstInteraction && gapMinutes >= Math.max(0, Number(config.minGapMinutes) || 0);
    const previousClock = gap.previousMessage?.memoryClock;
    const previousTime = previousClock && window.MemoryWorldTime ? window.MemoryWorldTime.messageTime(gap.previousMessage) : Number(gap.previousMessage?.timestamp);
    const primaryTime = (chat.isGroup ? clockInfo.user : clockInfo.characters[0]) || clockInfo.user;
    const lastTime = gap.previousMessage?.timestamp ? localTime(previousTime, primaryTime.timeZone).formatted : '无';
    const gapText = gap.gapMs === Infinity ? '首次互动' : formatGapDuration(gap.gapMs, config.durationStyle);
    const relationship = chat.relationship?.status || chat.settings.relationshipStatus || '未特别说明';
    const recentState = gap.previousMessage ? `上一条可见消息由${gap.previousMessage.role === 'user' ? '用户' : '角色'}发送` : '暂无历史互动';
    const facts = localTimeFacts(clockInfo, config);
    if (config.facts.gap) facts.push(`有效互动间隔：${gapText}`);
    if (config.facts.lastInteraction) facts.push(`上次互动时间：${lastTime}（${primaryTime.timeZone}${!chat.isGroup && !clockInfo.characters.length ? '，用户时区，仅用于互动记录' : ''}）`);
    if (config.facts.crossDay) {
      [clockInfo.user, ...clockInfo.characters].forEach((local, index) => {
        const crossedDay = gap.previousMessage?.timestamp ? localTime(previousTime, local.timeZone).dateKey !== local.dateKey : false;
        facts.push(`${index === 0 ? '用户' : `角色「${local.name}」`}是否跨天：${crossedDay ? '是' : '否'}`);
      });
    }
    const localTimeRule = config.facts.date || config.facts.time || config.facts.period ? `\n- ${LOCAL_TIME_RULE}` : '';

    const behavior = config.behavior;
    const isBackgroundMode = options.mode === 'background' || options.mode === 'groupBackground';
    const behaviorRules = [];
    if (isBackgroundMode) behaviorRules.push('用户此刻并未发送新消息，绝不能假装用户已经回来；只把互动间隔用于判断是否以及如何主动行动。');
    else if (behavior.prioritizeCurrent) behaviorRules.push('优先理解并回应用户当前消息，时间感知不得压过用户正在表达的内容。');
    if (behavior.personaAware) behaviorRules.push('角色人设、双方关系和此前情绪优先于通用的时间反应。');
    if (behavior.allowMention) behaviorRules.push('可以直接提到这段时间差，也可以选择不说。');
    else behaviorRules.push('不要直接提到用户离开或具体互动间隔，只能在必要时通过自然语气含蓄体现。');
    if (behavior.allowEmotion) behaviorRules.push('允许以符合角色的想念、担心、不满、冷淡或其他情绪体现时间变化。');
    else behaviorRules.push('不要因为时间差额外制造情绪。');
    if (behavior.allowUpdates) behaviorRules.push('合适时可以询问用户近况或分享角色最近的事情。');
    else behaviorRules.push('不要仅因时间差主动询问近况或分享近况。');
    if (behavior.allowNewTopic && behavior.allowContinue) behaviorRules.push('可依据上下文选择继续未完成话题或自然开启新话题。');
    else if (behavior.allowNewTopic) behaviorRules.push('在符合当前消息时可以开启新话题；不要直接续接已经失去语境的旧话题。');
    else if (behavior.allowContinue) behaviorRules.push('不要因时间差开启新话题；保留继续当前消息或未完成话题的可能。');
    else behaviorRules.push('不要让时间差决定话题走向，只处理用户当前消息。');
    if (behavior.scaleWithGap) behaviorRules.push('间隔越长可以反应越明显，但不得夸张到违背角色常识。');
    else behaviorRules.push('不要仅因为间隔更长就自动加强情绪或反应。');
    if (behavior.avoidCliche) behaviorRules.push('避免机械使用“好久不见”“你终于回来了”等固定模板，并避免重复上次的回来问候。');
    if (options.isGroup || chat.isGroup) behaviorRules.push(`群聊中最多让${Math.max(1, Number(config.groupMaxResponders) || 1)}个最符合人设的角色回应时间差，避免所有成员排队问候。`);
    behaviorRules.push(getFrequencyInstruction(config.responseFrequency));

    const variables = {
      当前时间: currentTime,
      时间段: period || '未指定',
      离开时长: gapText,
      上次互动时间: lastTime,
      角色名: chat.originalName || chat.name || '角色',
      用户昵称: chat.settings.myNickname || '用户',
      双方关系: relationship,
      最近对话状态: recentState
    };
    const backgroundPresetRules = {
      adaptive: '把互动间隔视为后台行动的背景事实。依据角色人设、双方关系、最近对话和角色自身生活，自主决定是否主动联系；不要因为时间过去就必然发消息。',
      subtle: '弱化互动间隔的影响。通常维持角色自己的生活，只有非常符合人设和情境时才主动联系。',
      natural: '自然考虑互动间隔。可以主动联系、分享近况或继续其他后台活动，但不要固定采用同一种行为。',
      strong: '明显考虑互动间隔，较积极地判断是否联系用户，但仍不能违背角色人设，也不能把发消息设为唯一合法行动。',
      custom: '按照用户配置的反应权限和回应频率处理这次长时间未互动的后台行动。'
    };
    const presetRule = isBackgroundMode && !config.applyReturnPromptToBackground
      ? (backgroundPresetRules[config.preset] || backgroundPresetRules.adaptive)
      : (PRESET_RULES[config.preset] || PRESET_RULES.adaptive);
    const customRule = fillTimeTemplate(config.customPrompt, variables).trim();
    let reactionRule = presetRule;
    if ((!isBackgroundMode || config.applyReturnPromptToBackground) && config.promptMode === 'append' && customRule) reactionRule = `${presetRule}\n用户补充规则：${customRule}`;
    if ((!isBackgroundMode || config.applyReturnPromptToBackground) && config.promptMode === 'replace' && customRule) reactionRule = customRule;

    const timeContextText = gap.firstInteraction
      ? '这是首次互动。'
      : `${recentState}；有效互动间隔为${gapText}。`;
    if (!isReturn) {
      const inactiveLabel = isBackgroundMode ? '长时间未互动' : '回来';
      return {
        context: facts.length ? `# 时间感知事实\n${facts.map(item => `- ${item}`).join('\n')}${localTimeRule}\n- 当前不满足“${inactiveLabel}”触发条件，不要额外制造相关反应。` : '',
        isReturn: false,
        gapMs: gap.gapMs,
        timeContextText,
        longTimeNoSee: false
      };
    }

    const ruleTitle = isBackgroundMode ? '长时间未互动时的后台行动规则' : '回来时的角色反应规则';
    const context = `# 时间感知事实\n${facts.map(item => `- ${item}`).join('\n')}${localTimeRule}\n- 间隔级别：${getGapBand(gapMinutes)}\n\n# ${ruleTitle}\n${reactionRule}\n${behaviorRules.filter(Boolean).map(item => `- ${item}`).join('\n')}`;
    return { context, isReturn: true, gapMs: gap.gapMs, timeContextText, longTimeNoSee: true };
  }

  const uiIds = {
    preset: 'time-awareness-preset-select',
    minGapMinutes: 'time-awareness-min-gap-input',
    durationStyle: 'time-awareness-duration-style-select',
    responseFrequency: 'time-awareness-frequency-select',
    promptMode: 'time-awareness-prompt-mode-select',
    customPrompt: 'time-awareness-custom-prompt'
  };

  function setChecked(id, value) {
    const element = document.getElementById(id);
    if (element) element.checked = Boolean(value);
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value ?? '';
  }

  function readTimeAwarenessUi() {
    const checked = id => Boolean(document.getElementById(id)?.checked);
    return normalizeTimeAwarenessConfig({
      preset: document.getElementById(uiIds.preset)?.value || 'adaptive',
      minGapMinutes: Math.max(0, parseInt(document.getElementById(uiIds.minGapMinutes)?.value, 10) || 0),
      durationStyle: document.getElementById(uiIds.durationStyle)?.value || 'approximate',
      responseFrequency: document.getElementById(uiIds.responseFrequency)?.value || 'autonomous',
      facts: {
        date: checked('time-awareness-fact-date'),
        time: checked('time-awareness-fact-time'),
        period: checked('time-awareness-fact-period'),
        gap: checked('time-awareness-fact-gap'),
        lastInteraction: checked('time-awareness-fact-last-time'),
        crossDay: checked('time-awareness-fact-cross-day')
      },
      behavior: {
        allowMention: checked('time-awareness-allow-mention'),
        allowEmotion: checked('time-awareness-allow-emotion'),
        allowUpdates: checked('time-awareness-allow-updates'),
        allowNewTopic: checked('time-awareness-allow-new-topic'),
        allowContinue: checked('time-awareness-allow-continue'),
        prioritizeCurrent: checked('time-awareness-prioritize-current'),
        personaAware: checked('time-awareness-persona-aware'),
        scaleWithGap: checked('time-awareness-scale-gap'),
        avoidCliche: checked('time-awareness-avoid-cliche'),
        firstReplyOnly: checked('time-awareness-first-reply-only')
      },
      promptMode: document.getElementById(uiIds.promptMode)?.value || 'builtin',
      customPrompt: document.getElementById(uiIds.customPrompt)?.value || '',
      groupGapBasis: document.getElementById('time-awareness-group-gap-basis')?.value || 'groupSilence',
      groupMaxResponders: Math.max(1, parseInt(document.getElementById('time-awareness-group-max-responders')?.value, 10) || 1),
      pauseGapWhileWorldPaused: checked('time-awareness-pause-gap'),
      pauseBackgroundWhileWorldPaused: checked('time-awareness-pause-background'),
      backgroundPaused: checked('time-awareness-background-paused'),
      applyReturnPromptToBackground: checked('time-awareness-prompt-in-background')
    });
  }

  function writeTimeAwarenessUi(rawConfig) {
    const config = normalizeTimeAwarenessConfig(rawConfig);
    Object.entries(uiIds).forEach(([key, id]) => setValue(id, config[key]));
    Object.entries(config.facts).forEach(([key, value]) => setChecked(`time-awareness-fact-${({ lastInteraction: 'last-time', crossDay: 'cross-day' })[key] || key}`, value));
    const behaviorIds = {
      allowMention: 'allow-mention', allowEmotion: 'allow-emotion', allowUpdates: 'allow-updates',
      allowNewTopic: 'allow-new-topic', allowContinue: 'allow-continue', prioritizeCurrent: 'prioritize-current',
      personaAware: 'persona-aware', scaleWithGap: 'scale-gap', avoidCliche: 'avoid-cliche', firstReplyOnly: 'first-reply-only'
    };
    Object.entries(config.behavior).forEach(([key, value]) => setChecked(`time-awareness-${behaviorIds[key]}`, value));
    setChecked('time-awareness-pause-gap', config.pauseGapWhileWorldPaused);
    setChecked('time-awareness-pause-background', config.pauseBackgroundWhileWorldPaused);
    setChecked('time-awareness-background-paused', config.backgroundPaused);
    setChecked('time-awareness-prompt-in-background', config.applyReturnPromptToBackground);
    setValue('time-awareness-group-gap-basis', config.groupGapBasis);
    setValue('time-awareness-group-max-responders', config.groupMaxResponders);
    updateTimeAwarenessUiState();
  }

  function updateTimeAwarenessUiState() {
    const enabled = Boolean(timePerceptionToggle?.checked);
    const container = document.getElementById('time-awareness-settings');
    if (container) container.style.display = enabled ? 'block' : 'none';
    const preset = document.getElementById(uiIds.preset)?.value || 'adaptive';
    const summary = document.getElementById('time-awareness-preset-summary');
    if (summary) summary.textContent = PRESET_SUMMARIES[preset] || PRESET_SUMMARIES.adaptive;
    const promptMode = document.getElementById(uiIds.promptMode)?.value || 'builtin';
    const editor = document.getElementById('time-awareness-prompt-editor');
    if (editor) editor.hidden = promptMode === 'builtin';
  }

  function loadSettingsUi(chat) {
    writeTimeAwarenessUi(getChatTimeAwarenessConfig(chat));
    populateRoleTimeZones(document.getElementById('time-zone-select'), chat?.settings?.timeZone || 'Asia/Shanghai', false);
    populateRoleTimeZones(document.getElementById('character-time-zone-select'), chat?.settings?.characterTimeZone || '');
    window.TimeZoneTools?.load(chat);
    const roleZoneGroup = document.getElementById('character-time-zone-group');
    if (roleZoneGroup) roleZoneGroup.hidden = Boolean(chat?.isGroup);
    const memberHint = document.getElementById('group-time-zone-hint');
    if (memberHint) memberHint.hidden = !chat?.isGroup;
    const groupOptions = document.getElementById('time-awareness-group-options');
    if (groupOptions) groupOptions.hidden = !chat?.isGroup;
    updateTimeAwarenessUiState();
  }

  function saveSettingsUi(chat) {
    if (!chat?.settings) return;
    const roleZone = document.getElementById('character-time-zone-select');
    if (roleZone && !chat.isGroup) chat.settings.characterTimeZone = roleZone.value;
    chat.settings.timeAwareness = readTimeAwarenessUi();
    chat.settings.timeAwarenessVersion = 1;
  }

  function applyPresetToUi(preset) {
    const current = readTimeAwarenessUi();
    const overrides = {
      adaptive: { minGapMinutes: 180, durationStyle: 'approximate', responseFrequency: 'autonomous' },
      subtle: { minGapMinutes: 1440, durationStyle: 'vague', responseFrequency: 'rare', behavior: { allowMention: false, allowNewTopic: false, scaleWithGap: false } },
      natural: { minGapMinutes: 180, durationStyle: 'approximate', responseFrequency: 'moderate' },
      strong: { minGapMinutes: 60, durationStyle: 'exact', responseFrequency: 'frequent', behavior: { allowMention: true, allowEmotion: true, allowUpdates: true, allowNewTopic: true, scaleWithGap: true } },
      custom: {}
    };
    const presetOverride = overrides[preset] || {};
    writeTimeAwarenessUi({
      ...current,
      ...presetOverride,
      behavior: preset === 'custom'
        ? current.behavior
        : { ...TIME_AWARENESS_DEFAULTS.behavior, ...(presetOverride.behavior || {}) },
      preset
    });
  }

  function notifyUser(message) {
    if (typeof window.showToast === 'function') window.showToast(message, 'success');
  }

  function bindTimeAwarenessUi() {
    if (!timePerceptionToggle || timePerceptionToggle.dataset.timeAwarenessBound === 'true') return;
    timePerceptionToggle.dataset.timeAwarenessBound = 'true';
    timePerceptionToggle.addEventListener('change', updateTimeAwarenessUiState);
    ['time-zone-select', 'character-time-zone-select'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => updateRoleTimePreview(true));
    });
    setInterval(() => updateRoleTimePreview(), 1000);
    document.getElementById(uiIds.preset)?.addEventListener('change', event => applyPresetToUi(event.target.value));
    document.getElementById(uiIds.promptMode)?.addEventListener('change', event => {
      const textarea = document.getElementById(uiIds.customPrompt);
      if (event.target.value === 'replace' && textarea && !textarea.value.trim()) {
        const preset = document.getElementById(uiIds.preset)?.value || 'adaptive';
        textarea.value = PRESET_RULES[preset] || PRESET_RULES.adaptive;
      }
      updateTimeAwarenessUiState();
    });
    document.getElementById('time-awareness-advanced-toggle')?.addEventListener('click', event => {
      const button = event.currentTarget;
      const panel = document.getElementById('time-awareness-advanced-panel');
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      if (panel) panel.hidden = expanded;
      const stateLabel = button.querySelector('.time-awareness-disclosure-state');
      if (stateLabel) stateLabel.textContent = expanded ? '展开' : '收起';
    });
    document.getElementById('time-awareness-reset-prompt-btn')?.addEventListener('click', () => {
      const preset = document.getElementById(uiIds.preset)?.value || 'adaptive';
      const mode = document.getElementById(uiIds.promptMode)?.value || 'builtin';
      setValue(uiIds.customPrompt, mode === 'append' ? '' : (PRESET_RULES[preset] || PRESET_RULES.adaptive));
    });
    document.getElementById('time-awareness-copy-prompt-btn')?.addEventListener('click', async () => {
      const value = document.getElementById(uiIds.customPrompt)?.value || '';
      try {
        await navigator.clipboard.writeText(value);
        notifyUser('时间感知提示词已复制');
      } catch (_) {
        const textarea = document.getElementById(uiIds.customPrompt);
        textarea?.focus();
        textarea?.select();
        try {
          if (document.execCommand?.('copy')) notifyUser('时间感知提示词已复制');
        } catch (_) {}
      }
    });
    document.getElementById('time-awareness-preview-btn')?.addEventListener('click', () => {
      const output = document.getElementById('time-awareness-preview-output');
      const chat = window.state?.chats?.[window.state.activeChatId];
      if (!output || !chat) return;
      const temporaryChat = { ...chat, settings: {
        ...chat.settings, enableTimePerception: true, timeAwareness: readTimeAwarenessUi(),
        timeZone: document.getElementById('time-zone-select')?.value || chat.settings.timeZone,
        characterTimeZone: chat.isGroup ? chat.settings.characterTimeZone : (document.getElementById('character-time-zone-select')?.value ?? chat.settings.characterTimeZone)
      } };
      const simulatedGapMinutes = parseInt(document.getElementById('time-awareness-preview-gap')?.value, 10) || 180;
      const result = buildTimeAwarenessContext({ chat: temporaryChat, simulatedGapMinutes, currentTime: window.getCustomTime?.(temporaryChat).formatted });
      output.textContent = result.context || '当前配置不会注入时间感知内容。';
      output.hidden = false;
    });
    document.getElementById('time-awareness-save-default-btn')?.addEventListener('click', async () => {
      const config = readTimeAwarenessUi();
      localStorage.setItem(TIME_AWARENESS_DEFAULT_KEY, JSON.stringify(config));
      if (window.state?.globalSettings && window.db?.globalSettings) {
        window.state.globalSettings.timeAwarenessDefault = deepClone(config);
        await window.db.globalSettings.put(window.state.globalSettings);
      }
      notifyUser('已保存为全局时间感知默认设置');
    });
    document.getElementById('time-awareness-load-default-btn')?.addEventListener('click', () => {
      writeTimeAwarenessUi(getGlobalTimeAwarenessDefault());
      notifyUser('已载入全局时间感知默认设置，请保存聊天设置');
    });
    document.getElementById('time-awareness-export-btn')?.addEventListener('click', () => {
      const payload = JSON.stringify({ type: 'ephone-time-awareness', version: 1, config: readTimeAwarenessUi() }, null, 2);
      const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `time-awareness-${Date.now()}.json`;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    });
    document.getElementById('time-awareness-import-btn')?.addEventListener('click', () => {
      document.getElementById('time-awareness-import-file')?.click();
    });
    document.getElementById('time-awareness-import-file')?.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (parsed?.type !== 'ephone-time-awareness' || !parsed.config) throw new Error('不是有效的时间感知配置文件');
        writeTimeAwarenessUi(parsed.config);
        notifyUser('时间感知配置已导入，请保存聊天设置');
      } catch (error) {
        if (typeof window.showCustomAlert === 'function') await window.showCustomAlert('导入失败', error.message);
      }
    });
    document.getElementById('time-awareness-apply-all-btn')?.addEventListener('click', async () => {
      if (!window.state?.chats || !window.db?.chats) return;
      if (typeof window.showCustomConfirm !== 'function') return;
      const confirmed = await window.showCustomConfirm('应用时间感知设置', '将当前高级时间感知配置复制到全部聊天；各聊天原有的“时间感知”开关状态不会改变。', { confirmText: '应用' });
      if (!confirmed) return;
      const config = readTimeAwarenessUi();
      const chats = Object.values(window.state.chats);
      chats.forEach(item => {
        if (!item.settings) item.settings = {};
        item.settings.timeAwareness = deepClone(config);
        item.settings.timeAwarenessVersion = 1;
      });
      await window.db.chats.bulkPut(chats);
      notifyUser(`已应用到 ${chats.length} 个聊天`);
    });
  }

  window.TimeAwareness = {
    updateRoleTimePreview,
    getClockInfo,
    buildLocalContext,
    populateRoleTimeZones,
    getMemberTimeZone,
    saveMemberTimeZone,
    defaults: TIME_AWARENESS_DEFAULTS,
    presetRules: PRESET_RULES,
    normalizeConfig: normalizeTimeAwarenessConfig,
    getConfig: getChatTimeAwarenessConfig,
    buildContext: buildTimeAwarenessContext,
    loadSettingsUi,
    saveSettingsUi,
    readSettingsUi: readTimeAwarenessUi,
    isWorldPaused(chat) {
      return chat && window.MemoryWorldTime?.config(chat).clockMode === 'independent' ? window.MemoryWorldTime.clock(chat).paused : isCustomTimePaused();
    },
    setClockRate(rate) {
      if (!Number.isFinite(rate) || rate < 0) throw new Error('倍率必须大于或等于 0');
      window.MemoryWorldTime?.flush();
      const current = calcElapsedCustomTime();
      if (current) {
        customYearInput.value = current.getFullYear(); customMonthInput.value = current.getMonth() + 1;
        customDayInput.value = current.getDate(); customHourInput.value = current.getHours(); customMinuteInput.value = current.getMinutes();
        saveCustomTimeSettings();
        localStorage.setItem('custom-time-base-value', String(current.getTime()));
        localStorage.setItem('custom-time-anchor', String(Date.now()));
      }
      localStorage.setItem('custom-time-rate', String(rate));
      updatePreview();
    },
    getPausedDurationBetween,
    isBackgroundPaused(chat) {
      const config = getChatTimeAwarenessConfig(chat);
      return Boolean(config.backgroundPaused || (config.pauseBackgroundWhileWorldPaused && window.TimeAwareness.isWorldPaused(chat)));
    }
  };

  // 页面加载时初始化
  loadSettings();
  bindTimeAwarenessUi();
  document.getElementById('custom-time-rate-apply')?.addEventListener('click', () => {
    try {
      const input = document.getElementById('custom-time-rate');
      if (!input.value.trim()) throw new Error('请填写流逝倍率');
      window.TimeAwareness.setClockRate(Number(input.value));
      window.MemoryWorldTimeUI?.refreshAll();
      if (typeof window.showToast === 'function') window.showToast('世界时间倍率已应用', 'success');
    } catch (error) { if (typeof window.showToast === 'function') window.showToast(error.message, 'error'); }
  });

  console.log('时间感知与自定义时间系统已初始化');
})();
