(function () {
  'use strict';

  const DAY_MS = 86400000;
  const PET_ALLOWED_TYPES = new Set(['text', 'sticker', 'voice_message']);
  const pendingSparkUpdates = new Set();

  function localDayKey(timestamp = Date.now()) {
    const date = new Date(Number(timestamp) || Date.now());
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function dayNumber(dayKey) {
    const parts = String(dayKey || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return NaN;
    return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / DAY_MS);
  }

  function makeId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return `${prefix}_${window.crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function ensureChat(chat) {
    if (!chat || chat.isGroup) return null;
    if (!chat.settings) chat.settings = {};
    if (typeof chat.settings.enableCharacterSpark !== 'boolean') chat.settings.enableCharacterSpark = false;
    if (typeof chat.settings.enableSharedPet !== 'boolean') chat.settings.enableSharedPet = false;
    if (!chat.spark || typeof chat.spark !== 'object') {
      chat.spark = {
        schemaVersion: 1,
        enabledAt: null,
        days: {},
        currentStreak: 0,
        bestStreak: 0,
        status: 'unlit',
        lastCompleteDate: null,
        sparks: 0,
        freezeCards: 0,
        restoreCards: 0,
        rewardedWeeks: 0
      };
    }
    if (!Array.isArray(chat.spark.activePeriods)) {
      chat.spark.activePeriods = chat.settings.enableCharacterSpark
        ? [{ start: chat.spark.enabledAt || Date.now(), end: null }]
        : [];
    }
    if (!chat.spark.days || typeof chat.spark.days !== 'object') chat.spark.days = {};
    if (typeof chat.spark.currentStreak !== 'number') chat.spark.currentStreak = 0;
    if (typeof chat.spark.bestStreak !== 'number') chat.spark.bestStreak = 0;
    const restoreCards = Number(chat.spark.restoreCards);
    chat.spark.restoreCards = Number.isSafeInteger(restoreCards) && restoreCards >= 0 ? restoreCards : 0;
    if (!chat.sharedPet || typeof chat.sharedPet !== 'object') {
      chat.sharedPet = {
        schemaVersion: 1,
        id: makeId('pet'),
        status: 'not_adopted',
        name: '小精灵',
        species: '小精灵',
        persona: '亲近你和角色、活泼但不会抢话的小伙伴',
        avatar: '',
        autoJoin: true,
        level: 1,
        experience: 0,
        mood: 80,
        satiety: 80,
        memories: [],
        lastSpokeAt: 0,
        createdAt: null
      };
    }
    if (!Array.isArray(chat.sharedPet.memories)) chat.sharedPet.memories = [];
    const petToday = localDayKey();
    const previousCareDay = chat.sharedPet.lastDecayDay || petToday;
    const elapsedDays = Math.max(0, dayNumber(petToday) - dayNumber(previousCareDay));
    if (elapsedDays > 0) {
      chat.sharedPet.satiety = Math.max(0, (chat.sharedPet.satiety || 80) - elapsedDays * 8);
      chat.sharedPet.mood = Math.max(20, (chat.sharedPet.mood || 80) - elapsedDays * 3);
      chat.sharedPet.lastDecayDay = petToday;
    }
    return chat;
  }

  function isVisibleEligibleMessage(msg) {
    if (!msg || msg.isHidden || msg.isExcluded || msg.type === 'thought_chain_block') return false;
    if (msg.role === 'user') return msg.type !== 'narration';
    return msg.role === 'assistant' && msg.actorType !== 'pet';
  }

  function sparkRecoveryPlan(spark) {
    const complete = Object.keys(spark.days).filter(key => key <= localDayKey() && spark.days[key].user && spark.days[key].character).sort();
    let chain = 0;
    let previous = null;
    let anchor = null;
    for (const key of complete) {
      const day = dayNumber(key);
      chain = previous !== null && day === previous + 1 ? chain + 1 : 1;
      if (chain >= 3) anchor = day;
      previous = day;
    }
    const today = dayNumber(localDayKey());
    if (anchor === null) return { days: [], message: '没有找到可接回的已点亮记录，无法使用恢复卡。' };
    if (today - anchor <= 1) return { days: [], message: '当前没有需要恢复的中断日期。' };
    // 从首个缺失日起算七个自然日，不随重新聊天而延长。
    if (today - (anchor + 1) >= 7) return { days: [], message: '这次中断已超过7天恢复期限，无法使用恢复卡。' };
    const completeDays = new Set(complete);
    const days = [];
    for (let day = anchor + 1; day < today; day += 1) {
      const key = new Date(day * DAY_MS).toISOString().slice(0, 10);
      if (!completeDays.has(key)) days.push(key);
    }
    return { days, message: '' };
  }

  function reconcile(chat) {
    if (!ensureChat(chat) || !chat.settings.enableCharacterSpark) return chat && chat.spark;
    const spark = chat.spark;
    const previousStatus = spark.status;
    const previousLastCompleteDate = spark.lastCompleteDate;
    if (!spark.enabledAt) spark.enabledAt = Date.now();
    const days = {};
    const wasEnabledAt = timestamp => spark.activePeriods.some(period => {
      return timestamp >= Number(period.start) && (period.end == null || timestamp <= Number(period.end));
    });
    (chat.history || []).forEach(msg => {
      if (!isVisibleEligibleMessage(msg) || !wasEnabledAt(Number(msg.timestamp))) return;
      const key = localDayKey(msg.timestamp);
      if (!days[key]) days[key] = { user: false, character: false };
      if (msg.role === 'user') days[key].user = true;
      if (msg.role === 'assistant') days[key].character = true;
    });
    if (!spark.protectedDays || typeof spark.protectedDays !== 'object') spark.protectedDays = {};
    if (previousStatus === 'lit' && previousLastCompleteDate && (spark.freezeCards || 0) > 0) {
      const gapBeforeToday = dayNumber(localDayKey()) - dayNumber(previousLastCompleteDate);
      if (gapBeforeToday === 2) {
        const missedDay = new Date((dayNumber(previousLastCompleteDate) + 1) * DAY_MS).toISOString().slice(0, 10);
        if (!spark.protectedDays[missedDay]) {
          spark.protectedDays[missedDay] = 'freeze';
          spark.freezeCards -= 1;
        }
      }
    }
    Object.keys(spark.protectedDays).forEach(key => {
      days[key] = { user: true, character: true, protectedBy: spark.protectedDays[key] };
    });
    spark.days = days;
    const complete = Object.keys(days).filter(key => key <= localDayKey() && days[key].user && days[key].character).sort();
    spark.lastCompleteDate = complete.length ? complete[complete.length - 1] : null;

    let streak = 0;
    let completedChain = 0;
    if (complete.length) {
      streak = 1;
      for (let i = complete.length - 1; i > 0; i -= 1) {
        if (dayNumber(complete[i]) - dayNumber(complete[i - 1]) !== 1) break;
        streak += 1;
      }
      completedChain = streak;
      const gap = dayNumber(localDayKey()) - dayNumber(spark.lastCompleteDate);
      if (gap > 1) streak = 0;
    }
    spark.currentStreak = streak;
    spark.bestStreak = Math.max(spark.bestStreak || 0, completedChain);
    spark.status = streak >= 3 ? 'lit' : (sparkRecoveryPlan(spark).days.length ? 'recoverable' : 'unlit');

    const earnedWeeks = Math.floor((spark.bestStreak || 0) / 7);
    if (earnedWeeks > (spark.rewardedWeeks || 0)) {
      const delta = earnedWeeks - (spark.rewardedWeeks || 0);
      spark.sparks = (spark.sparks || 0) + delta * 7;
      spark.freezeCards = (spark.freezeCards || 0) + Math.floor(earnedWeeks / 2) - Math.floor((spark.rewardedWeeks || 0) / 2);
      spark.restoreCards = (spark.restoreCards || 0) + delta;
      spark.rewardedWeeks = earnedWeeks;
    }
    return spark;
  }

  function setSwitches(chat, sparkEnabled, petEnabled) {
    ensureChat(chat);
    const wasSparkEnabled = chat.settings.enableCharacterSpark;
    const nextSparkEnabled = Boolean(sparkEnabled);
    if (wasSparkEnabled !== nextSparkEnabled) {
      if (nextSparkEnabled) {
        chat.spark.activePeriods.push({ start: Date.now(), end: null });
      } else {
        const openPeriod = [...chat.spark.activePeriods].reverse().find(period => period.end == null);
        if (openPeriod) openPeriod.end = Date.now();
      }
    }
    chat.settings.enableCharacterSpark = nextSparkEnabled;
    chat.settings.enableSharedPet = Boolean(petEnabled);
    if (!wasSparkEnabled && chat.settings.enableCharacterSpark && !chat.spark.enabledAt) {
      chat.spark.enabledAt = Date.now();
    }
    reconcile(chat);
  }

  function petIsUsable(chat) {
    return Boolean(ensureChat(chat) && chat.settings.enableSharedPet && chat.sharedPet.status === 'active');
  }

  function petMentionToken(chat) {
    return petIsUsable(chat) ? `@[[pet:${chat.sharedPet.id}]]` : '';
  }

  function normalizePetMention(text, chat) {
    if (!petIsUsable(chat) || typeof text !== 'string') return text;
    const name = chat.sharedPet.name || '小精灵';
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`@${escaped}(?=\\s|$)`, 'g'), petMentionToken(chat));
  }

  function displayMentions(text, chat) {
    if (!chat || typeof text !== 'string') return text;
    ensureChat(chat);
    return text.replace(/@\[\[pet:([^\]]+)\]\]/g, (match, id) => {
      return chat.sharedPet && chat.sharedPet.id === id ? `@${chat.sharedPet.name || '小精灵'}` : '@小精灵';
    });
  }

  function getPromptContext(chat, lastUserMessage) {
    if (!petIsUsable(chat)) return '';
    const pet = chat.sharedPet;
    const mentioned = typeof lastUserMessage?.content === 'string' && lastUserMessage.content.includes(petMentionToken(chat));
    const autoJoinAvailable = pet.autoJoin && Date.now() - (pet.lastSpokeAt || 0) >= 10 * 60 * 1000;
    const recentMemories = pet.memories.slice(-8).map(item => `  - ${item.summary}`).join('\n') || '  - 暂无';
    return `# 共同宠物（单聊中的第三位发言者）\n你与用户共同养了一只宠物。它不是群成员，也不是真人账号。\n- 宠物名：${pet.name}\n- 种类：${pet.species}\n- 性格：${pet.persona}\n- 等级：${pet.level}；心情：${pet.mood}/100；饱腹：${pet.satiety}/100\n- 用户用 ${petMentionToken(chat)} 明确呼叫宠物：${mentioned ? '是' : '否'}。\n- 若明确呼叫，必须至少返回一条宠物回复；宠物回复对象须增加 \"speakerType\":\"pet\"。\n- 角色回复使用 \"speakerType\":\"character\"（也可省略）。宠物只允许 text、sticker、voice_message，禁止转账、下单、发帖、通话、图片生成或操作任何角色专属工具。\n- ${autoJoinAvailable ? '未被呼叫时，宠物只可在语境非常自然时偶尔插话，不能连续抢话。' : '本轮未被明确呼叫时，宠物不要主动插话。'}\n- 宠物记忆与角色长期记忆分开；不要声称它读取了角色私密记忆。\n- 宠物自己的近期记忆：\n${recentMemories}`;
  }

  function decorateAssistantBase(baseMessage, msgData, chat) {
    const isPet = petIsUsable(chat) && (
      msgData.speakerType === 'pet' || msgData.speaker_type === 'pet'
      || msgData.speaker === 'pet'
    );
    if (!isPet) {
      return { ...baseMessage, actorType: 'character', actorId: chat.id };
    }
    return {
      ...baseMessage,
      actorType: 'pet',
      actorId: chat.sharedPet.id,
      senderName: chat.sharedPet.name,
      avatarSnapshot: chat.sharedPet.avatar || ''
    };
  }

  function isAllowedPetMessage(msgData, chat) {
    const isPet = petIsUsable(chat) && (
      msgData.speakerType === 'pet' || msgData.speaker_type === 'pet'
      || msgData.speaker === 'pet'
    );
    return !isPet || PET_ALLOWED_TYPES.has(msgData.type || 'text');
  }

  function onMessageSaved(chat, msg) {
    if (!ensureChat(chat)) return;
    if (chat.settings.enableCharacterSpark) reconcile(chat);
    if (msg && msg.role === 'user' && petIsUsable(chat) && typeof msg.content === 'string' && msg.content.includes(petMentionToken(chat))) {
      chat.sharedPet.memories.push({
        timestamp: Number(msg.timestamp) || Date.now(),
        summary: `用户对我说：${displayMentions(msg.content, chat).slice(0, 100)}`
      });
    }
    if (msg && msg.actorType === 'pet' && petIsUsable(chat)) {
      const pet = chat.sharedPet;
      pet.lastSpokeAt = Number(msg.timestamp) || Date.now();
      pet.experience = (pet.experience || 0) + 2;
      pet.level = Math.max(1, Math.floor(pet.experience / 30) + 1);
      pet.mood = Math.min(100, (pet.mood || 80) + 1);
      const memoryText = String(msg.content || '').trim();
      if (memoryText) {
        pet.memories.push({ timestamp: pet.lastSpokeAt, summary: memoryText.slice(0, 120) });
        if (pet.memories.length > 30) pet.memories.splice(0, pet.memories.length - 30);
      }
    }
    if (chat.sharedPet.memories.length > 30) chat.sharedPet.memories.splice(0, chat.sharedPet.memories.length - 30);
    refreshVisibleUi(chat);
  }

  // 高品质火花矢量 SVG 图标定义（多种形态）
  const SPARK_SVGS = {
    // 灰阶/未点燃态（精简柔和灰）
    unlit: `<svg class="spark-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C11.5 5 9.5 7.5 7 9C4.5 10.5 3 13 3 16C3 19.3137 5.68629 22 9 22C11 22 12 21 12 21C12 21 13 22 15 22C18.3137 22 21 19.3137 21 16C21 13 19.5 10.5 17 9C14.5 7.5 12.5 5 12 2Z" fill="#B0B5BC"/>
      <path d="M12 11C11.5 12.8 10 14.2 8.5 15C7.2 15.7 6.5 17 6.5 18.5C6.5 20.4 8 21.2 10 21.2C11.2 21.2 12 20.5 12 20.5C12 20.5 12.8 21.2 14 21.2C16 21.2 17.5 20.4 17.5 18.5C17.5 17 16.8 15.7 15.5 15C14 14.2 12.5 12.8 12 11Z" fill="#D3D7DD"/>
    </svg>`,
    // 初级点燃态（3~6天，鲜明渐变火苗）
    lit: `<svg class="spark-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sparkGradLit" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FF7A00"/>
          <stop offset="0.5" stop-color="#FF3D00"/>
          <stop offset="1" stop-color="#E52D27"/>
        </linearGradient>
        <linearGradient id="sparkInnerLit" x1="12" y1="10" x2="12" y2="21" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FFF176"/>
          <stop offset="1" stop-color="#FFB300"/>
        </linearGradient>
      </defs>
      <path d="M12 2C11.3 5.2 9.2 7.8 6.5 9.2C3.8 10.6 2 13.5 2 16.5C2 20.1 4.9 22.5 8.8 22.5C11 22.5 12 21.3 12 21.3C12 21.3 13 22.5 15.2 22.5C19.1 22.5 22 20.1 22 16.5C22 13.5 20.2 10.6 17.5 9.2C14.8 7.8 12.7 5.2 12 2Z" fill="url(#sparkGradLit)"/>
      <path d="M12 10.5C11.5 12.5 10 14 8.5 14.8C7.3 15.5 6.6 16.8 6.6 18.2C6.6 20.1 8.2 21 10 21C11.3 21 12 20.2 12 20.2C12 20.2 12.7 21 14 21C15.8 21 17.4 20.1 17.4 18.2C17.4 16.8 16.7 15.5 15.5 14.8C14 14 12.5 12.5 12 10.5Z" fill="url(#sparkInnerLit)"/>
    </svg>`,
    // 高阶炽热态（7天及以上，璀璨大火花+四角星光）
    superLit: `<svg class="spark-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sparkGradSuper" x1="12" y1="1" x2="12" y2="23" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FF9100"/>
          <stop offset="0.45" stop-color="#FF2A00"/>
          <stop offset="1" stop-color="#D50000"/>
        </linearGradient>
        <linearGradient id="sparkSuperCore" x1="12" y1="9" x2="12" y2="21" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FFFF8D"/>
          <stop offset="0.6" stop-color="#FFEA00"/>
          <stop offset="1" stop-color="#FF9100"/>
        </linearGradient>
      </defs>
      <path d="M12 1.5C11.2 5 8.8 7.8 5.8 9.3C2.8 10.8 1 13.9 1 17C1 20.8 4.2 23 8.5 23C11 23 12 21.6 12 21.6C12 21.6 13 23 15.5 23C19.8 23 23 20.8 23 17C23 13.9 21.2 10.8 18.2 9.3C15.2 7.8 12.8 5 12 1.5Z" fill="url(#sparkGradSuper)"/>
      <path d="M12 9.5C11.4 11.8 9.6 13.5 8 14.4C6.6 15.2 5.8 16.7 5.8 18.3C5.8 20.4 7.6 21.5 9.8 21.5C11.2 21.5 12 20.6 12 20.6C12 20.6 12.8 21.5 14.2 21.5C16.4 21.5 18.2 20.4 18.2 18.3C18.2 16.7 17.4 15.2 16 14.4C14.4 13.5 12.6 11.8 12 9.5Z" fill="url(#sparkSuperCore)"/>
      <path d="M20.5 4L21.2 5.8L23 6.5L21.2 7.2L20.5 9L19.8 7.2L18 6.5L19.8 5.8L20.5 4Z" fill="#FFE57F"/>
      <path d="M4 3L4.5 4.5L6 5L4.5 5.5L4 7L3.5 5.5L2 5L3.5 4.5L4 3Z" fill="#FFE57F"/>
    </svg>`,
    // 待恢复态
    recoverable: `<svg class="spark-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C11.5 5 9.5 7.5 7 9C4.5 10.5 3 13 3 16C3 19.3137 5.68629 22 9 22C11 22 12 21 12 21C12 21 13 22 15 22C18.3137 22 21 19.3137 21 16C21 13 19.5 10.5 17 9C14.5 7.5 12.5 5 12 2Z" fill="#90949C" opacity="0.6"/>
      <path d="M12 11C11.5 12.8 10 14.2 8.5 15C7.2 15.7 6.5 17 6.5 18.5C6.5 20.4 8 21.2 10 21.2C11.2 21.2 12 20.5 12 20.5C12 20.5 12.8 21.2 14 21.2C16 21.2 17.5 20.4 17.5 18.5C17.5 17 16.8 15.7 15.5 15C14 14.2 12.5 12.8 12 11Z" fill="#CED2D9"/>
    </svg>`
  };

  function badgeLabel(chat) {
    const spark = reconcile(chat);
    if (!chat.settings.enableCharacterSpark) return '';
    if (spark.status === 'lit') return `${spark.currentStreak}天`;
    if (spark.status === 'recoverable') return '待恢复';
    return spark.currentStreak ? `${spark.currentStreak}天` : '未点燃';
  }

  function refreshVisibleUi(chat) {
    if (!chat || chat.isGroup) return;
    // 聊天界面顶部已根据用户要求隐藏火花徽标
    const badge = document.getElementById('character-spark-badge');
    if (badge) {
      badge.hidden = true;
      badge.style.display = 'none';
    }
  }

  function createSparkBadgeNode(chat) {
    const spark = reconcile(chat);
    if (!chat.settings.enableCharacterSpark) return null;

    const badge = document.createElement('span');
    badge.className = 'character-spark-list-badge';

    const streak = spark.currentStreak || 0;
    let svgHtml = '';
    let textHtml = '';

    if (spark.status === 'lit') {
      badge.classList.add('is-lit');
      if (streak >= 7) {
        badge.classList.add('is-super');
        svgHtml = SPARK_SVGS.superLit;
      } else {
        svgHtml = SPARK_SVGS.lit;
      }
      textHtml = `<span class="spark-text">${streak}天</span>`;
      badge.title = `角色火花：已连续点燃 ${streak} 天 (点击查看)`;
    } else if (spark.status === 'recoverable') {
      badge.classList.add('needs-recovery');
      svgHtml = SPARK_SVGS.recoverable;
      textHtml = `<span class="spark-text">待恢复</span>`;
      badge.title = `角色火花中断，可使用恢复卡救回 (点击查看)`;
    } else {
      // 未点燃：如果有天数（如1~2天）则显示灰色天数，否则仅显示灰色小火花
      badge.classList.add('is-unlit');
      svgHtml = SPARK_SVGS.unlit;
      if (streak > 0) {
        textHtml = `<span class="spark-text">${streak}天</span>`;
        badge.title = `角色火花：已连续互动 ${streak}/3 天 (点击查看)`;
      } else {
        textHtml = '';
        badge.title = `角色火花：未点燃，连续互动3天即可点燃 (点击查看)`;
      }
    }

    badge.innerHTML = `${svgHtml}${textHtml}`;

    // 点击直接呼出火花详情面板
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      showBondModal('spark', chat);
    });

    return badge;
  }

  function decorateChatListItem(item, chat) {
    if (!item || !ensureChat(chat) || !chat.settings.enableCharacterSpark) return;
    const nameLine = item.querySelector('.name-line');
    if (!nameLine) return;
    item.classList.add('has-character-spark');
    const badge = createSparkBadgeNode(chat);
    if (badge) {
      nameLine.appendChild(badge);
    }
  }

  function loadSettingsUi(chat) {
    ensureChat(chat);
    const group = document.getElementById('character-bond-settings-group');
    if (!group) return;
    group.style.display = chat.isGroup ? 'none' : 'block';
    if (chat.isGroup) return;
    document.getElementById('character-spark-switch').checked = chat.settings.enableCharacterSpark;
    document.getElementById('shared-pet-switch').checked = chat.settings.enableSharedPet;
    updateSettingsSummary(chat);
  }

  function updateSettingsSummary(chat) {
    ensureChat(chat);
    const sparkSummary = document.getElementById('character-spark-settings-summary');
    const petSummary = document.getElementById('shared-pet-settings-summary');
    if (sparkSummary) sparkSummary.textContent = chat.settings.enableCharacterSpark ? badgeLabel(chat) : '关闭后不记录角色互动天数';
    if (petSummary) {
      petSummary.textContent = chat.settings.enableSharedPet
        ? (petIsUsable(chat) ? `${chat.sharedPet.name} · Lv.${chat.sharedPet.level}` : '已开启，设置宠物后可在单聊中 @它')
        : '关闭后宠物不出现、不回复，数据仍保留';
    }
  }

  function isPetEnabledInContext(chat) {
    const petSwitch = document.getElementById('shared-pet-switch');
    if (petSwitch && petSwitch.isConnected) {
      return petSwitch.checked;
    }
    return Boolean(chat?.settings?.enableSharedPet);
  }

  function showBondModal(mode, chat) {
    if (!ensureChat(chat)) return;
    const modal = document.getElementById('character-bond-modal');
    if (!modal) return;
    modal.dataset.mode = mode;
    modal.dataset.chatId = chat.id;
    modal.classList.add('visible');
    document.getElementById('character-bond-modal-title').textContent = mode === 'spark' ? '角色火花' : '共同宠物';
    document.getElementById('character-spark-panel').hidden = mode !== 'spark';
    document.getElementById('shared-pet-panel').hidden = mode !== 'pet';
    const petEnabled = isPetEnabledInContext(chat);
    document.getElementById('save-shared-pet-btn').hidden = mode !== 'pet' || !petEnabled;
    if (mode === 'spark') renderSparkPanel(chat);
    else renderPetPanel(chat);
  }

  function renderSparkPanel(chat) {
    const spark = reconcile(chat);
    const isSparkEnabled = Boolean(chat.settings.enableCharacterSpark);
    const today = spark.days[localDayKey()] || { user: false, character: false };
    const status = !isSparkEnabled ? '火花开关尚未开启' :
      spark.status === 'lit' ? `已点亮，连续 ${spark.currentStreak} 天` :
      spark.status === 'recoverable' ? '火花已中断，可使用恢复卡' : `连续互动 ${spark.currentStreak}/3 天`;
    document.getElementById('character-spark-state').textContent = status;
    document.getElementById('character-spark-today').textContent = `今日：你${today.user ? '已' : '未'}发送 · 角色${today.character ? '已' : '未'}回复`;
    document.getElementById('character-spark-record').textContent = `最高 ${spark.bestStreak || 0} 天 · 火花值 ${spark.sparks || 0} · 冻结卡 ${spark.freezeCards || 0} · 恢复卡 ${spark.restoreCards || 0}`;
    const restoreButton = document.getElementById('restore-character-spark-btn');
    const busy = pendingSparkUpdates.has(chat.id);
    restoreButton.hidden = !(isSparkEnabled && spark.status === 'recoverable');
    restoreButton.disabled = busy || spark.restoreCards < 1;
    restoreButton.textContent = busy ? '正在保存…' : spark.restoreCards < 1 ? '暂无恢复卡' : '使用恢复卡';
    document.getElementById('character-spark-restore-cards').value = spark.restoreCards;
    document.getElementById('character-spark-restore-cards').disabled = busy;
    document.getElementById('save-character-spark-cards-btn').disabled = busy;
    const recoveryNote = document.getElementById('character-spark-recovery-note');
    recoveryNote.textContent = spark.status === 'recoverable'
      ? `使用1张恢复卡，补回${sparkRecoveryPlan(spark).days.length}个中断日期，接回之前的连续记录。首个缺失日起7天内可恢复。`
      : isSparkEnabled && spark.status !== 'lit' && spark.bestStreak >= 3 ? sparkRecoveryPlan(spark).message : '';
    recoveryNote.hidden = !recoveryNote.textContent;
  }

  function renderPetPanel(chat) {
    const pet = chat.sharedPet;
    const petEnabled = isPetEnabledInContext(chat);
    document.getElementById('shared-pet-disabled-note').hidden = petEnabled;
    document.getElementById('shared-pet-form').hidden = !petEnabled;
    document.getElementById('save-shared-pet-btn').hidden = !petEnabled;
    if (!petEnabled) return;
    document.getElementById('shared-pet-name').value = pet.status === 'active' ? pet.name : '';
    document.getElementById('shared-pet-species').value = pet.status === 'active' ? pet.species : '';
    document.getElementById('shared-pet-persona').value = pet.status === 'active' ? pet.persona : '';
    document.getElementById('shared-pet-avatar-url').value = pet.avatar && !pet.avatar.startsWith('data:') ? pet.avatar : '';
    document.getElementById('shared-pet-auto-join').checked = pet.autoJoin !== false;
    const preview = document.getElementById('shared-pet-avatar-preview');
    preview.src = pet.avatar || chat.settings.aiAvatar || '';
    preview.dataset.pendingAvatar = pet.avatar || '';
    document.getElementById('shared-pet-growth').textContent = pet.status === 'active'
      ? `Lv.${pet.level} · 经验 ${pet.experience} · 心情 ${pet.mood} · 饱腹 ${pet.satiety}`
      : '还没有领养宠物';
    document.getElementById('feed-shared-pet-btn').hidden = pet.status !== 'active';
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
      reader.readAsDataURL(file);
    });
  }

  async function compressPetImage(file) {
    if (!file || !file.type.startsWith('image/')) throw new Error('请选择图片文件');
    if (file.size > 10 * 1024 * 1024) throw new Error('图片不能超过 10MB');
    if (typeof imageCompression === 'function') {
      const compressed = await imageCompression(file, { maxSizeMB: 0.28, maxWidthOrHeight: 768, useWebWorker: true, fileType: file.type === 'image/png' ? 'image/png' : 'image/webp' });
      return readFileAsDataUrl(compressed);
    }
    return readFileAsDataUrl(file);
  }

  async function savePetFromModal(chat) {
    const petEnabled = isPetEnabledInContext(chat);
    if (!petEnabled) return;
    chat.settings.enableSharedPet = true;
    const petSwitch = document.getElementById('shared-pet-switch');
    if (petSwitch) petSwitch.checked = true;
    const name = document.getElementById('shared-pet-name').value.trim();
    const species = document.getElementById('shared-pet-species').value.trim();
    const persona = document.getElementById('shared-pet-persona').value.trim();
    if (!name || !species || !persona) {
      await showCustomAlert('信息未完成', '请填写宠物名称、种类和性格。');
      return;
    }
    const preview = document.getElementById('shared-pet-avatar-preview');
    const url = document.getElementById('shared-pet-avatar-url').value.trim();
    const avatar = preview.dataset.pendingAvatar || url;
    if (!avatar) {
      await showCustomAlert('缺少形象', '请填写图片 URL 或从本地上传一张宠物图片。');
      return;
    }
    if (!avatar.startsWith('data:image/') && !/^https?:\/\//i.test(avatar)) {
      await showCustomAlert('图片地址无效', '宠物图片 URL 需要以 http:// 或 https:// 开头。');
      return;
    }
    Object.assign(chat.sharedPet, {
      status: 'active', name, species, persona, avatar,
      autoJoin: document.getElementById('shared-pet-auto-join').checked,
      createdAt: chat.sharedPet.createdAt || Date.now()
    });
    await db.chats.put(chat);
    document.getElementById('character-bond-modal').classList.remove('visible');
    updateSettingsSummary(chat);
    refreshVisibleUi(chat);
    if (typeof renderChatInterface === 'function' && state.activeChatId === chat.id) renderChatInterface(chat.id, { preserveScroll: true });
    showToast(`${name} 已加入这段单聊`);
  }

  async function updateSpark(chat, change, successMessage) {
    if (!chat || chat.isGroup) {
      showToast('没有找到对应角色，请重新打开火花详情。');
      return;
    }
    if (pendingSparkUpdates.has(chat.id)) return;
    pendingSparkUpdates.add(chat.id);
    try {
      // 在副本上恢复并扣卡；保存失败时不改变当前角色的卡数和保护日期。
      const draft = { ...chat, settings: { ...chat.settings },
        spark: JSON.parse(JSON.stringify(chat.spark || {})),
        sharedPet: chat.sharedPet ? JSON.parse(JSON.stringify(chat.sharedPet)) : undefined };
      reconcile(draft);
      const message = change(draft);
      if (message) {
        showToast(message);
        return;
      }
      const modal = document.getElementById('character-bond-modal');
      if (modal.dataset.chatId === String(chat.id) && modal.dataset.mode === 'spark') renderSparkPanel(chat);
      await db.chats.put({ ...chat, spark: draft.spark });
      chat.spark = draft.spark;
    } catch (error) {
      console.error('保存角色火花失败', error);
      showToast('保存失败，本次操作未生效，恢复卡未扣除，请重试。');
      return;
    } finally {
      pendingSparkUpdates.delete(chat.id);
      const modal = document.getElementById('character-bond-modal');
      if (modal.dataset.chatId === String(chat.id) && modal.dataset.mode === 'spark') renderSparkPanel(chat);
    }
    refreshVisibleUi(chat);
    if (state.activeChatId === chat.id) updateSettingsSummary(chat);
    if (typeof renderChatList === 'function') renderChatList();
    showToast(successMessage);
  }

  async function restoreSpark(chat) {
    return updateSpark(chat, draft => {
      if (!draft.settings.enableCharacterSpark) return '请先在聊天设置中开启角色火花。';
      const spark = draft.spark;
      if (spark.status === 'lit') return '角色火花已点亮，无需使用恢复卡。';
      const plan = sparkRecoveryPlan(spark);
      if (!plan.days.length) return plan.message;
      if (spark.restoreCards < 1) return '暂无恢复卡，可以在下方自定义数量后保存。';
      plan.days.forEach(key => { spark.protectedDays[key] = 'restore'; });
      spark.restoreCards -= 1;
      reconcile(draft);
      if (spark.status !== 'lit') return '未能接回连续记录，恢复卡未扣除。';
      return '';
    }, '角色火花已恢复');
  }

  async function saveSparkCards(chat) {
    const value = document.getElementById('character-spark-restore-cards').value.trim();
    const count = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(count)) {
      showToast('恢复卡数量请填写0或正整数。');
      return;
    }
    return updateSpark(chat, draft => {
      draft.spark.restoreCards = count;
      return '';
    }, '恢复卡数量已保存');
  }

  async function feedPet(chat) {
    if (!petIsUsable(chat)) return;
    const today = localDayKey();
    if (chat.sharedPet.lastFedDay === today) {
      showToast('今天已经喂过啦');
      return;
    }
    chat.sharedPet.lastFedDay = today;
    chat.sharedPet.satiety = Math.min(100, (chat.sharedPet.satiety || 0) + 25);
    chat.sharedPet.mood = Math.min(100, (chat.sharedPet.mood || 0) + 6);
    chat.sharedPet.experience = (chat.sharedPet.experience || 0) + 5;
    chat.sharedPet.level = Math.max(1, Math.floor(chat.sharedPet.experience / 30) + 1);
    await db.chats.put(chat);
    renderPetPanel(chat);
    updateSettingsSummary(chat);
    showToast(`${chat.sharedPet.name} 吃饱了`);
  }

  function bindUi() {
    const modal = document.getElementById('character-bond-modal');
    if (!modal || modal.dataset.bound === 'true') return;
    modal.dataset.bound = 'true';
    const activeChat = () => state.activeChatId ? state.chats[state.activeChatId] : null;
    const modalChat = () => state.chats[modal.dataset.chatId] || null;
    document.getElementById('character-spark-details-btn')?.addEventListener('click', () => showBondModal('spark', activeChat()));
    document.getElementById('shared-pet-manage-btn')?.addEventListener('click', () => showBondModal('pet', activeChat()));
    document.getElementById('character-spark-badge')?.addEventListener('click', () => showBondModal('spark', activeChat()));
    document.getElementById('close-character-bond-modal')?.addEventListener('click', () => modal.classList.remove('visible'));
    modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('visible'); });
    document.getElementById('cancel-character-bond-modal')?.addEventListener('click', () => modal.classList.remove('visible'));
    document.getElementById('save-shared-pet-btn')?.addEventListener('click', () => savePetFromModal(activeChat()));
    document.getElementById('restore-character-spark-btn')?.addEventListener('click', () => restoreSpark(modalChat()));
    document.getElementById('save-character-spark-cards-btn')?.addEventListener('click', () => saveSparkCards(modalChat()));
    document.getElementById('feed-shared-pet-btn')?.addEventListener('click', () => feedPet(activeChat()));
    document.getElementById('shared-pet-avatar-url')?.addEventListener('input', event => {
      const preview = document.getElementById('shared-pet-avatar-preview');
      preview.src = event.target.value.trim();
      preview.dataset.pendingAvatar = event.target.value.trim();
    });
    document.getElementById('shared-pet-upload-btn')?.addEventListener('click', () => document.getElementById('shared-pet-upload-input').click());
    document.getElementById('shared-pet-upload-input')?.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await compressPetImage(file);
        const preview = document.getElementById('shared-pet-avatar-preview');
        preview.src = dataUrl;
        preview.dataset.pendingAvatar = dataUrl;
        document.getElementById('shared-pet-avatar-url').value = '';
      } catch (error) {
        await showCustomAlert('图片不可用', error.message);
      } finally {
        event.target.value = '';
      }
    });
  }

  window.CharacterBond = {
    ensureChat, reconcile, setSwitches, petIsUsable, petMentionToken,
    normalizePetMention, displayMentions, getPromptContext, decorateAssistantBase,
    isAllowedPetMessage, onMessageSaved, refreshVisibleUi, decorateChatListItem,
    loadSettingsUi, updateSettingsSummary, showBondModal, bindUi
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUi);
  else bindUi();
})();
