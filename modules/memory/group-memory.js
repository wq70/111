(function () {
  'use strict';
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const locks = new Map();
  const listeners = new Set();
  const modes = ['diary', 'structured', 'vector'];
  const independent = chat => !!chat?.isGroup && chat.settings?.groupMemoryMode === 'independent';
  const mode = chat => modes.includes(chat.settings?.memoryMode) ? chat.settings.memoryMode : chat.settings?.enableStructuredMemory ? 'structured' : 'diary';
  const eligible = chat => (chat.history || []).filter(m => window.MemoryExtractionSupport.eligible(m) && !m.isExcluded && m.type !== 'thought_chain_block' && m.type !== 'mcp_activity');
  const key = message => JSON.stringify([window.MemoryExtractionSupport.sourceKey(message), message.senderId ?? '', message.memoryClock ?? null]);
  const members = chat => (chat.members || []).filter(m => m.id !== 'user');
  const enabled = (chat, member) => !member.isNpc || (chat.settings?.groupMemoryNpcIds || []).map(String).includes(String(member.id));
  const memberKey = member => JSON.stringify(String(member.id));
  function ensure(chat) {
    if (!chat.groupMemory) chat.groupMemory = { version: 1, members: {}, startedAt: Date.now(), startKeys: eligible(chat).map(key) };
    if (!chat.groupMemory.members) chat.groupMemory.members = {};
    return chat.groupMemory;
  }
  function archive(chat, member, create = false) {
    const data = create ? ensure(chat) : chat.groupMemory;
    if (!data) return null;
    const id = memberKey(member);
    if (!data.members[id] && create) data.members[id] = { name: member.groupNickname || member.originalName, longTermMemory: [], processed: {} };
    return data.members[id] || null;
  }
  // Scope objects are never inserted into state.chats or the chats table.
  function actor(chat, member, data) {
    return {
      id: JSON.stringify(['group-memory', String(chat.id), String(member.id)]),
      name: member.groupNickname || member.originalName, originalName: member.originalName || member.groupNickname,
      settings: { ...clone(chat.settings), aiPersona: member.persona || '', enableStructuredMemory: mode(chat) === 'structured' },
      history: chat.history || [], longTermMemory: data.longTermMemory || [],
      structuredMemory: data.structuredMemory, variableMemory: data.variableMemory
    };
  }
  function canMount(target, source) {
    if (!source || String(target.id) === String(source.id)) return false;
    // An incoming exception never grants other chats access to this group's archive/history.
    if (independent(source)) return false;
    return !independent(target) || target.settings.groupMemoryAllowLinks === true;
  }
  function mountIds(chat) {
    return (chat.settings?.linkedMemoryChatIds || []).filter(id => canMount(chat, state.chats[id]));
  }
  function speaker(chat, message) {
    if (message.senderId != null) return members(chat).find(m => String(m.id) === String(message.senderId));
    const candidates = members(chat).filter(m => message.senderName && [m.originalName, m.groupNickname].includes(message.senderName));
    return candidates.length === 1 ? candidates[0] : null;
  }
  function canRead(chat, member, message) {
    if (!message.isHidden) return true;
    return String(speaker(chat, message)?.id ?? '') === String(member.id);
  }
  async function context(chat, query = '') {
    const sections = [];
    for (const member of members(chat)) {
      if (!enabled(chat, member)) continue;
      const data = archive(chat, member);
      if (!data) continue;
      const scoped = actor(chat, member, clone(data));
      let text;
      if (mode(chat) === 'vector') text = await window.vectorMemoryManager.serializeForPrompt(scoped, query);
      else if (mode(chat) === 'structured') text = window.structuredMemoryManager.serializeForPrompt(scoped);
      else {
        let entries = scoped.longTermMemory;
        if (chat.settings.limitLongTermMemory) entries = entries.slice(-Math.max(1, Number(chat.settings.longTermMemoryLimit) || 50));
        text = entries.map(m => `- ${m.content}`).join('\n');
      }
      if (text?.trim()) sections.push(`## ${member.groupNickname || member.originalName}（成员ID：${JSON.stringify(String(member.id))}）的本群记忆\n${text}`);
    }
    return '# 群聊独立记忆\n以下记忆仅属于当前群内的指定成员。各成员只能把自己的经历当作亲历；不得把别人的私下经历当作自己已知的事实。\n' + (sections.join('\n\n') || '- (暂无本群独立记忆)');
  }
  function contextSync(chat, query = '') {
    return '# 群聊独立记忆（仅当前群、各成员自己的经历）\n' + members(chat).filter(m => enabled(chat, m)).map(member => {
      const data = archive(chat, member); if (!data) return '';
      const scoped = actor(chat, member, clone(data));
      const text = mode(chat) === 'vector' ? window.vectorMemoryManager.serializeForPromptSync(scoped, query)
        : mode(chat) === 'structured' ? window.structuredMemoryManager.serializeForPrompt(scoped)
          : scoped.longTermMemory.slice(-(chat.settings.limitLongTermMemory ? Math.max(1, Number(chat.settings.longTermMemoryLimit) || 50) : scoped.longTermMemory.length || 1)).map(m => `- ${m.content}`).join('\n');
      return text ? `## ${member.groupNickname || member.originalName}（成员ID：${JSON.stringify(String(member.id))}）\n${text}` : '';
    }).filter(Boolean).join('\n\n');
  }
  async function persist(chat, next) {
    const previous = chat.groupMemory;
    chat.groupMemory = next;
    try { await db.chats.put(chat); }
    catch (error) { chat.groupMemory = previous; throw error; }
  }
  async function configure(chat, options) {
    if (!chat.isGroup) return;
    if (locks.has(String(chat.id))) throw new Error('请先停止当前群记忆总结，再修改设置');
    const previous = clone(chat.settings), oldData = clone(chat.groupMemory);
    chat.settings.groupMemoryMode = options.mode === 'independent' ? 'independent' : 'shared';
    chat.settings.groupMemoryAllowLinks = options.allowLinks === true;
    chat.settings.groupMemoryNpcIds = members(chat).filter(m => m.isNpc && (options.npcIds || []).map(String).includes(String(m.id))).map(m => String(m.id));
    if (independent(chat)) {
      ensure(chat);
      for (const member of members(chat).filter(m => enabled(chat, m))) archive(chat, member, true);
    }
    try { await db.chats.put(chat); }
    catch (error) { chat.settings = previous; chat.groupMemory = oldData; throw error; }
  }
  async function request(prompt, signal) {
    const config = state.apiConfig || {};
    const secondary = config.secondaryProxyUrl && config.secondaryApiKey && config.secondaryModel;
    const proxyUrl = secondary ? config.secondaryProxyUrl : config.proxyUrl;
    const apiKey = secondary ? config.secondaryApiKey : config.apiKey;
    const model = secondary ? config.secondaryModel : config.model;
    if (!proxyUrl || !apiKey || !model) throw new Error('请先配置总结使用的 API');
    if (Number(config.contextWindowTokens) > 0 && Math.ceil(prompt.length / 2) + 4096 > Number(config.contextWindowTokens)) throw new Error('本批输入超过模型容量，请缩小每批消息数');
    let data;
    if (String(proxyUrl).includes('generativelanguage')) {
      const req = toGeminiRequestData(model, apiKey, prompt, [{ role: 'user', content: '请开始整理本群记忆。' }]);
      data = await window.MemoryExtractionSupport.requestData(req.url, { ...req.data, signal });
    } else data = await window.MemoryExtractionSupport.requestData(`${String(proxyUrl).replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: '请开始整理本群记忆。' }], temperature: 0.3 })
    });
    if (['length', 'MAX_TOKENS', 'content_filter', 'SAFETY', 'RECITATION'].includes(data.choices?.[0]?.finish_reason || data.candidates?.[0]?.finishReason)) throw new Error('模型输出不完整，本批未保存，请缩小范围后重试');
    const text = data.choices?.[0]?.message?.content ?? (typeof getGeminiResponseText === 'function' ? getGeminiResponseText(data) : '');
    if (typeof text !== 'string' || !text.trim()) throw new Error('模型返回为空，本批未保存');
    return text.replace(/^```\w*\s*/, '').replace(/```\s*$/, '').trim();
  }
  async function extract(chat, member, data, messages, selectedMode, signal) {
    const scoped = actor(chat, member, data);
    const history = messages.map((m, i) => {
      const author = speaker(chat, m);
      const identity = author ? ` [发言成员ID：${JSON.stringify(String(author.id))}；群昵称：${author.groupNickname || author.originalName}]`
        : m.role === 'user' ? ' [用户发言]' : ' [成员身份未明确，不得仅按同名认作当前角色]';
      return window.MemoryExtractionSupport.formatMessage(m, chat, i + 1) + identity;
    }).join('\n');
    const range = '以下每条消息自带日期；相对时间以该消息日期为准，无可靠日期请标为时间不明。';
    const restriction = `\n# 群内成员视角\n本次只为成员ID ${JSON.stringify(String(member.id))}、群昵称 ${JSON.stringify(member.groupNickname)}、本名 ${JSON.stringify(member.originalName)} 保存记忆。\n只记录该成员参与、在场可知的群内经历；不能编造私聊、其他群的经历，不能把其他成员的视角写成自己的。以下多人记录是同一个群，第一人称只代表此成员。\n`;
    if (selectedMode === 'diary') {
      const raw = await request(`你是${JSON.stringify(member.originalName)}。人设：${member.persona || ''}。${restriction}\n阅读记录并用第一人称提取重要事件、事实、计划和关系变化。过去日期不等于计划已完成。没有相关经历时返回空字符串。只输出 JSON：{"summary":"记忆正文"}\n${history}`, signal);
      const result = JSON.parse(raw);
      if (!result || typeof result.summary !== 'string') throw new Error('日记总结格式不正确，本批未保存');
      if (result.summary.trim()) data.longTermMemory.push({ id: `gm-${Date.now()}-${Math.random().toString(36).slice(2)}`, content: result.summary.trim(), timestamp: Date.now(), source: 'group-independent', sourceKeys: messages.map(key) });
    } else if (selectedMode === 'structured') {
      const manager = window.structuredMemoryManager;
      const prompt = await (manager.buildSummaryPromptForRequest || manager.buildSummaryPrompt).call(manager, scoped, history, range);
      const raw = await request(prompt + restriction, signal);
      const entries = manager.parseMemoryEntries(raw, scoped);
      if (!entries.length && !/^(?:无|暂无|无新增记忆|没有值得记录的信息|\[\])\s*[。.!！]?$/.test(raw)) throw new Error('未返回有效结构化条目，本批未保存');
      manager.mergeEntries(scoped, entries);
      data.structuredMemory = scoped.structuredMemory;
    } else {
      const manager = window.vectorMemoryManager;
      const prompt = manager.buildExtractionPrompt(scoped, history, range, {});
      const raw = await request(prompt + restriction, signal);
      const entries = manager.parseExtractionResult(raw).map(item => ({ ...item, ...window.MemoryExtractionSupport.resolveTime(item, messages) }));
      await manager.mergeExtractedMemories(scoped, entries, null, { signal });
      data.variableMemory = scoped.variableMemory;
    }
    if (signal.aborted) throw new Error('总结已停止，本批未保存');
  }
  function signature(chat) { return JSON.stringify([chat.settings.groupMemoryMode, mode(chat), chat.settings.groupMemoryNpcIds, members(chat).map(m => [m.id, m.persona, m.groupNickname])]); }
  async function summarize(chat, options = {}) {
    if (!independent(chat)) return 0;
    const lockKey = String(chat.id);
    if (locks.has(lockKey)) { if (options.auto) return 0; throw new Error('本群已有记忆总结任务'); }
    const controller = new AbortController(); locks.set(lockKey, controller);
    let batches = 0;
    try {
      ensure(chat);
      const selectedMode = mode(chat), started = signature(chat);
      const selected = options.memberIds ? new Set(options.memberIds.map(String)) : null;
      const all = options.messages || eligible(chat);
      const start = options.range?.start ?? 1, end = options.range?.end ?? all.length;
      if (options.range && (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > all.length)) throw new Error('请选择有效的消息范围');
      const source = options.range ? all.slice(start - 1, end) : all;
      const batchSize = options.batchSize === undefined ? 30 : Number(options.batchSize);
      if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error('每批消息数必须是 1 到 100 之间的整数');
      for (const member of members(chat).filter(m => enabled(chat, m) && (!selected || selected.has(String(m.id))))) {
        const current = archive(chat, member, true);
        const done = new Set(current.processed[selectedMode] || []);
        const baseline = new Set(current.baseline || chat.groupMemory.startKeys || []);
        const pending = source.filter(m => canRead(chat, member, m) && !done.has(key(m)) && (options.range || options.messages || !baseline.has(key(m))));
        if (options.auto && pending.length < Math.max(1, Number(chat.settings.autoMemoryInterval) || 20)) continue;
        for (let offset = 0; offset < pending.length; offset += batchSize) {
          if (controller.signal.aborted) throw new Error('总结已停止');
          const batch = pending.slice(offset, offset + batchSize), keys = batch.map(key);
          const next = clone(chat.groupMemory), staged = next.members[memberKey(member)];
          options.onProgress?.(`${member.groupNickname || member.originalName} · ${Math.min(offset + batch.length, pending.length)}/${pending.length} 条`);
          await extract(chat, member, staged, batch, selectedMode, controller.signal);
          if (signature(chat) !== started) throw new Error('群设置或成员发生变化，本批未保存，请重新开始');
          if (!options.messages) {
            const liveKeys = new Set(eligible(chat).map(key));
            if (keys.some(k => !liveKeys.has(k))) throw new Error('原聊天记录已被修改，本批未保存');
          }
          staged.processed[selectedMode] = [...new Set([...(staged.processed[selectedMode] || []), ...keys])];
          next.autoBlocked = false; next.error = '';
          await persist(chat, next); batches++;
        }
      }
      if (chat.groupMemory.autoBlocked) {
        const next = clone(chat.groupMemory); next.autoBlocked = false; next.error = ''; await persist(chat, next);
      }
      return batches;
    } catch (error) {
      const next = clone(ensure(chat)); next.autoBlocked = true; next.error = error.message;
      try { await persist(chat, next); } catch (_) { /* Preserve the original error. */ }
      throw error;
    } finally { locks.delete(lockKey); for (const listener of listeners) { try { listener(chat); } catch (error) { console.warn('[群记忆界面]', error); } } }
  }
  async function auto(chat) {
    if (!chat.settings.enableAutoMemory || chat.groupMemory?.autoBlocked || locks.has(String(chat.id))) return;
    try { await summarize(chat, { auto: true }); }
    catch (error) { console.warn('[群独立记忆]', error); if (typeof showToast === 'function') showToast('群记忆总结已暂停：' + error.message, 'error'); }
  }
  async function saveEntry(chat, memberId, text, index) {
    if (locks.has(String(chat.id))) throw new Error('请先停止正在进行的总结');
    const member = members(chat).find(m => String(m.id) === String(memberId));
    if (!member || !enabled(chat, member)) throw new Error('请选择已启用记忆的群成员');
    archive(chat, member, true);
    const next = clone(chat.groupMemory), data = next.members[memberKey(member)];
    const selectedMode = mode(chat);
    if (index && typeof index === 'object' && selectedMode === 'structured') {
      const scoped = actor(chat, member, data);
      if (text == null) window.structuredMemoryManager.deleteEntry(scoped, index.category, index.index);
      else window.structuredMemoryManager.editEntry(scoped, index.category, index.index, String(text).trim());
      data.structuredMemory = scoped.structuredMemory;
    } else if (index != null) {
      const rows = selectedMode === 'diary' ? data.longTermMemory : selectedMode === 'vector' ? data.variableMemory?.fragments : null;
      if (!rows?.[index]) throw new Error('记忆已变化，请重新打开');
      if (text == null) rows.splice(index, 1); else rows[index].content = String(text).trim();
      if (selectedMode === 'vector') {
        const row = rows[index];
        if (text != null) { row.embedding = null; row.embeddingVersions = []; row.embeddingSignature = ''; row.embeddingSpace = ''; row.embeddingTextHash = ''; }
        const ids = new Set(rows.map(fragment => fragment.id));
        for (const fragment of rows) fragment.linkedMemories = (fragment.linkedMemories || []).filter(id => ids.has(id));
        delete data.variableMemory._retrievalCache; data.variableMemory.stats.totalFragments = rows.length;
      }
    } else if (text?.trim()) {
      if (selectedMode === 'diary') data.longTermMemory.push({ id: `gm-${Date.now()}-${Math.random().toString(36).slice(2)}`, content: text.trim(), timestamp: Date.now(), source: 'manual' });
      else if (selectedMode === 'structured') {
        const scoped = actor(chat, member, data), entries = window.structuredMemoryManager.parseMemoryEntries(text, scoped);
        if (!entries.length) throw new Error('请使用 [YYMMDD]分类:内容 格式添加结构化条目');
        window.structuredMemoryManager.mergeEntries(scoped, entries); data.structuredMemory = scoped.structuredMemory;
      } else {
        const scoped = actor(chat, member, data);
        window.vectorMemoryManager.createFragment(scoped, { category: 'E', content: text.trim(), memoryTime: null, importance: 5 });
        data.variableMemory = scoped.variableMemory;
      }
    }
    await persist(chat, next);
  }
  async function addStructured(chat, memberId, text, category, date) {
    if (!/^[A-Z]$/.test(category) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !text.trim()) throw new Error('请填写分类、日期和正文');
    const stamp = date.slice(2).replace(/-/g, '');
    return saveEntry(chat, memberId, `[${stamp}]${category}:${text.replace(/\r?\n/g, ' ').trim()}`);
  }
  function transfer(chat) {
    const data = clone(chat.groupMemory);
    if (data) for (const member of Object.values(data.members || {})) {
      if (member.variableMemory?.settings) delete member.variableMemory.settings.embeddingApiKey;
      if (member.variableMemory) delete member.variableMemory._retrievalCache;
    }
    return data;
  }
  function merge(chat, incoming) {
    if (!chat.isGroup || !incoming || incoming.version !== 1 || !incoming.members || typeof incoming.members !== 'object') throw new Error('群记忆文件格式不正确');
    if (locks.has(String(chat.id))) throw new Error('请先停止当前总结任务');
    const next = clone(ensure(chat));
    for (const [id, data] of Object.entries(incoming.members)) {
      if (!members(chat).some(m => memberKey(m) === id)) continue;
      if (!Array.isArray(data.longTermMemory) || !data.processed || typeof data.processed !== 'object') throw new Error('成员记忆格式不正确');
      if (!next.members[id]) next.members[id] = clone(data);
      else {
        const target = next.members[id], known = new Set(target.longTermMemory.map(m => m.id || JSON.stringify([m.timestamp, m.content])));
        for (const item of data.longTermMemory) if (!known.has(item.id || JSON.stringify([item.timestamp, item.content]))) { target.longTermMemory.push(clone(item)); known.add(item.id || JSON.stringify([item.timestamp, item.content])); }
        const member = members(chat).find(m => memberKey(m) === id), scoped = actor(chat, member, target);
        if (data.structuredMemory) window.structuredMemoryManager.importMemory(scoped, JSON.stringify({ type: 'structured-memory', version: '1.0', ...data.structuredMemory }), 'merge');
        target.structuredMemory = scoped.structuredMemory;
        if (data.variableMemory) {
          const vm = window.vectorMemoryManager.getVariableMemory(scoped), ids = new Set(vm.fragments.map(f => f.id));
          for (const fragment of data.variableMemory.fragments || []) if (!ids.has(fragment.id)) { vm.fragments.push(clone(fragment)); ids.add(fragment.id); }
          delete vm._retrievalCache; target.variableMemory = vm;
        }
        for (const m of modes) target.processed[m] = [...new Set([...(target.processed[m] || []), ...(data.processed[m] || [])])];
      }
    }
    return next;
  }
  window.GroupMemory = { independent, mode, eligible, members, enabled, archive, actor, configure, context, contextSync, canMount, mountIds, summarize, auto, saveEntry, addStructured, transfer, merge, persist, locks,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    stop: chat => locks.get(String(chat.id))?.abort() };
})();
