// Date-scoped, bounded history backups. Settings and other chats never enter these files.
(() => {
  'use strict';
  const TYPE = 'EPhoneChatHistoryPart';
  const PART_BYTES = 12 * 1024 * 1024;
  const enc = new TextEncoder();
  const copy = value => JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const canonical = value => JSON.stringify(value, (key, item) => key === '_historyTransfer' ? undefined : object(item)
    ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
  const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value))), n => n.toString(16).padStart(2, '0')).join('');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const time = message => typeof message.timestamp === 'number' && Number.isFinite(message.timestamp) ? message.timestamp : null;
  const day = value => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const yieldUi = () => new Promise(resolve => setTimeout(resolve, 0));

  function boundary(value, nextDay = false) {
    if (!value) return nextDay ? Infinity : -Infinity;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('请选择有效的日期。');
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) throw new Error('请选择有效的日期。');
    if (nextDay) date.setDate(date.getDate() + 1);
    return date.getTime();
  }
  function selectHistory(history, start = '', end = '') {
    const from = boundary(start), until = boundary(end, true);
    if (from >= until) throw new Error('开始日期不能晚于结束日期。');
    return history.filter(message => !start && !end || time(message) !== null && time(message) >= from && time(message) < until);
  }
  function sourceInfo(chat) {
    return { id: chat.id, name: chat.name || '', isGroup: !!chat.isGroup,
      members: chat.isGroup ? (chat.members || []).map(m => ({ id: m.id, name: m.name, originalName: m.originalName, groupNickname: m.groupNickname })) : [] };
  }
  async function readMedia(id) {
    const row = await db.videoAttachments.get(id);
    if (!row) throw new Error('有视频附件已缺失，无法生成完整备份。请先检查对应视频。');
    if (!row.dataUrl && !row.url) throw new Error('有视频附件没有可用的文件或地址。');
    return row;
  }
  async function planExport(chat, options = {}) {
    const messages = selectHistory(chat.history || [], options.start, options.end);
    if (!messages.length) throw new Error('所选日期没有聊天记录。');
    const limit = options.partBytes || PART_BYTES;
    const parts = [];
    let current = { messages: [], mediaIds: [], bytes: 2048 }, mediaIds = new Set();
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const messageBytes = enc.encode(JSON.stringify(message)).length + 1;
      const id = message.video?.mediaId;
      let mediaBytes = 0;
      if (id) mediaBytes = enc.encode(JSON.stringify(await readMedia(id))).length + 1;
      const cost = messageBytes + (id && !mediaIds.has(id) ? mediaBytes : 0);
      if (current.messages.length && current.bytes + cost > limit) {
        parts.push(current); current = { messages: [], mediaIds: [], bytes: 2048 }; mediaIds = new Set();
      }
      current.messages.push(message);
      current.bytes += messageBytes;
      if (id && !mediaIds.has(id)) { mediaIds.add(id); current.mediaIds.push(id); current.bytes += mediaBytes; }
      if (i % 100 === 0) { options.progress?.(i + 1, messages.length); await yieldUi(); }
    }
    parts.push(current);
    return { backupId: crypto.randomUUID(), createdAt: Date.now(), source: sourceInfo(chat),
      range: { start: options.start || '', end: options.end || '' }, totalMessages: messages.length, parts };
  }
  async function makePart(plan, index) {
    const part = plan.parts[index];
    if (!part) throw new Error('备份分段不存在。');
    const videoAttachments = [];
    for (const id of part.mediaIds) videoAttachments.push(await readMedia(id));
    return { type: TYPE, version: 1, backupId: plan.backupId, createdAt: plan.createdAt,
      source: plan.source, range: plan.range, part: { index: index + 1, total: plan.parts.length, totalMessages: plan.totalMessages },
      messages: part.messages, videoAttachments };
  }
  function normalize(data) {
    if (data?.type === 'EPhoneSingleChat' && object(data.chatData)) {
      return validate({ type: TYPE, version: 1, source: sourceInfo(data.chatData), messages: data.chatData.history,
        videoAttachments: data.videoAttachments || [] });
    }
    return validate(data);
  }
  function validate(data) {
    if (!object(data) || data.type !== TYPE || data.version !== 1 || !object(data.source) || typeof data.source.isGroup !== 'boolean' ||
        !Array.isArray(data.messages) || !Array.isArray(data.videoAttachments)) throw new Error('这不是有效的聊天记录备份。');
    if (data.part && (!Number.isInteger(data.part.index) || !Number.isInteger(data.part.total) || data.part.index < 1 || data.part.total < data.part.index)) throw new Error('备份分段编号无效。');
    for (const message of data.messages) {
      if (!object(message) || typeof message.role !== 'string' || message.timestamp != null && time(message) === null) throw new Error('备份中的消息格式或时间无效。');
    }
    const ids = new Set();
    for (const row of data.videoAttachments) {
      if (!object(row) || typeof row.id !== 'string' || ids.has(row.id)) throw new Error('视频附件编号无效或重复。');
      ids.add(row.id);
      if (row.dataUrl && (!/^data:video\/(?:mp4|webm);base64,[a-zA-Z0-9+/=]+$/.test(row.dataUrl) || row.dataUrl.length > 50 * 1024 * 1024 * 1.4)) throw new Error('备份中的视频文件格式或大小无效。');
      if (row.url) { const url = new URL(row.url); if (url.protocol !== 'https:' || url.username || url.password) throw new Error('视频地址必须是 HTTPS 直链。'); }
      if (!row.dataUrl && !row.url) throw new Error('视频附件没有可用的文件或地址。');
    }
    // Never accept a file that silently omits the actual local video data.
    for (const message of data.messages) if (message.video?.mediaId && !ids.has(message.video.mediaId)) throw new Error('备份缺少消息引用的视频附件。');
    return data;
  }
  function remapSender(message, source, target) {
    if (!target.isGroup) {
      if (message.role === 'assistant' && message.senderId === source.id) message.senderId = target.id;
      return;
    }
    // Keep historical names, but never bind a foreign ID to an unrelated namesake.
    for (const actor of [message, message.quote].filter(Boolean)) {
      if (!actor.senderId || actor.senderId === 'user') continue;
      const original = (source.members || []).find(m => m.id === actor.senderId);
      const member = (target.members || []).find(m => m.id === actor.senderId && (source.id === target.id || original &&
        (m.originalName || m.name) === (original.originalName || original.name)));
      if (!member) actor.senderId = `history:${source.id}:${actor.senderId}`;
    }
  }
  async function messageKeys(message) {
    const raw = await hash(canonical(message));
    const meta = message._historyTransfer;
    return [...new Set([raw, ...(meta?.local === raw && /^[a-f0-9]{64}$/.test(meta.original) ? [meta.original] : [])])];
  }
  async function mergePlan(target, data) {
    if (!!target.isGroup !== data.source.isGroup) throw new Error('单聊备份只能导入单聊，群聊备份只能导入群聊。');
    const history = target.history || [], counts = new Map(), seen = new Map(), added = [], media = new Map();
    for (let i = 0; i < history.length; i++) {
      // Provenance also survives exporting the restored chat from a second device.
      // Edited imported messages no longer match their original fingerprint.
      const keys = await messageKeys(history[i]);
      for (const key of keys) counts.set(key, (counts.get(key) || 0) + 1);
      if (i % 100 === 0) await yieldUi();
    }
    const rows = new Map(data.videoAttachments.map(row => [row.id, row]));
    for (let i = 0; i < data.messages.length; i++) {
      const original = data.messages[i], keys = await messageKeys(original), key = keys.at(-1);
      for (const alias of keys) seen.set(alias, (seen.get(alias) || 0) + 1);
      if (keys.some(alias => seen.get(alias) <= (counts.get(alias) || 0))) continue;
      const message = copy(original);
      delete message._historyTransfer;
      remapSender(message, data.source, target);
      if (message.video?.mediaId) {
        const row = rows.get(message.video.mediaId);
        const id = `history_${await hash(canonical({ ...row, chatId: target.id }))}`;
        media.set(id, { ...row, id, chatId: target.id }); message.video.mediaId = id;
      }
      message._historyTransfer = { original: key, local: await hash(canonical(message)) };
      added.push(message);
    }
    // Stable sorting retains same-time messages and never invents timestamps.
    const merged = history.concat(added).sort((a, b) => (time(a) ?? Infinity) - (time(b) ?? Infinity));
    return { history: merged, media: [...media.values()], added: added.length, skipped: data.messages.length - added.length };
  }
  async function importData(targetId, payload) {
    const data = normalize(payload);
    let result, saved;
    await db.transaction('rw', [db.chats, db.videoAttachments], async () => {
      const target = await db.chats.get(targetId);
      if (!target) throw new Error('目标聊天已不存在。');
      // Hashing may yield; keep the IndexedDB transaction alive until the merge is ready.
      result = await Dexie.waitFor(mergePlan(target, data));
      saved = { ...target, history: result.history };
      if (result.media.length) await db.videoAttachments.bulkPut(result.media);
      if (result.added) await db.chats.put(saved);
    });
    state.chats[targetId] = saved;
    return { added: result.added, skipped: result.skipped };
  }

  function dialog(title, body, action) {
    const previous = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'history-transfer-overlay';
    overlay.innerHTML = `<section class="history-transfer-dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button type="button" data-close aria-label="关闭">×</button></header><div class="history-transfer-body">${body}<p class="history-transfer-notice" role="status" aria-live="polite"></p></div><footer><button type="button" data-close>关闭</button><button type="button" data-submit>${esc(action)}</button></footer></section>`;
    (document.getElementById('phone-screen') || document.body).appendChild(overlay);
    const find = selector => overlay.querySelector(selector);
    const close = () => { overlay.remove(); previous?.focus(); };
    overlay.querySelectorAll('[data-close]').forEach(button => button.onclick = close);
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !find('[data-submit]').disabled) close();
      if (event.key === 'Tab') {
        const nodes = [...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select')].filter(el => !el.hidden);
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
        if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
      }
    });
    find('[data-close]').focus();
    return { overlay, find, close, notice: text => find('[role=status]').textContent = text,
      busy(value) { overlay.querySelectorAll('button,input').forEach(el => el.disabled = value); } };
  }
  function download(payload, filename) {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function openExport(chat) {
    const dates = (chat.history || []).map(time).filter(value => value !== null);
    let earliest = Infinity, latest = -Infinity;
    for (const stamp of dates) { earliest = Math.min(earliest, stamp); latest = Math.max(latest, stamp); }
    const undated = (chat.history || []).length - dates.length;
    const view = dialog('按日期备份聊天记录', `<p>备份「${esc(chat.name)}」的消息和本地照片、语音、视频。外链保留原地址；聊天设置不包含在内。</p><div class="history-transfer-dates"><label>开始日期<input type="date" name="start" value="${dates.length ? day(earliest) : ''}"></label><label>结束日期<input type="date" name="end" value="${dates.length ? day(latest) : ''}"></label></div><p>日期包含当天。清空日期可备份全部记录。文件按约 12 MB 自动拆分，单条超大的消息或视频会单独保留，不截断。</p>${undated ? `<p>有 ${undated} 条记录没有时间，清空两个日期才能一起导出。</p>` : ''}<div data-downloads></div>`, '准备备份');
    const button = view.find('[data-submit]');
    button.onclick = async () => {
      view.busy(true); view.notice('正在检查记录和附件…');
      try {
        // Select a fixed list of messages; later arrivals are handled by the next backup.
        const plan = await planExport(chat, { start: view.find('[name=start]').value, end: view.find('[name=end]').value,
          progress: (n, all) => view.notice(`正在检查 ${n} / ${all} 条记录…`) });
        if (!view.overlay.isConnected) return;
        const list = view.find('[data-downloads]'); list.replaceChildren();
        const safeName = String(chat.name || '聊天').replace(/[\\/:*?"<>|]/g, '_').slice(0, 70);
        plan.parts.forEach((part, index) => {
          const item = document.createElement('button'); item.type = 'button';
          item.textContent = `下载第 ${index + 1} / ${plan.parts.length} 份 · ${part.messages.length} 条 · 约 ${(part.bytes / 1024 / 1024).toFixed(1)} MB`;
          item.onclick = async () => {
            view.busy(true); view.notice(`正在生成第 ${index + 1} 份…`);
            try {
              download(await makePart(plan, index), `EPhone-History-${safeName}-${plan.range.start || '全部'}-${plan.range.end || '全部'}-${plan.backupId.slice(0,8)}-part-${index + 1}-of-${plan.parts.length}.json`);
              item.textContent = `已发起下载 · 第 ${index + 1} / ${plan.parts.length} 份（点此重新下载）`;
              view.notice('已发起下载，请确认浏览器已保存文件。每份可单独导入，建议保存全部分段。');
            } catch (error) { view.notice(error.message); } finally { view.busy(false); }
          };
          list.appendChild(item);
        });
        view.notice(`共 ${plan.totalMessages} 条记录，已分成 ${plan.parts.length} 份。请逐份点击下载。`);
        button.textContent = '重新准备';
      } catch (error) { view.notice(error.message); } finally { view.busy(false); }
    };
  }
  async function openImport(file, targetId) {
    let data;
    try { data = normalize(JSON.parse(await file.text())); }
    catch (error) { await showCustomAlert('无法导入', esc(error.message)); return; }
    const target = state.chats[targetId];
    if (!target) return;
    const view = dialog('合并聊天记录', `<p>从「${esc(data.source.name)}」导入到「${esc(target.name)}」。${data.part ? `这是第 ${data.part.index} / ${data.part.total} 份，可按任意顺序导入。` : ''}</p><p>保留当前消息、角色／群成员和所有聊天设置。完全相同的消息自动跳过；内容不同的记录都会保留。</p>`, '确认合并');
    view.busy(true); view.notice('正在检查重复记录…');
    try {
      const preview = await mergePlan(target, data);
      view.notice(`本文件 ${data.messages.length} 条：预计新增 ${preview.added} 条，跳过重复 ${preview.skipped} 条。保存时会重新核对最新记录。`);
    } catch (error) { view.notice(error.message); view.busy(false); view.find('[data-submit]').disabled = true; return; }
    view.busy(false);
    view.find('[data-submit]').onclick = async () => {
      view.busy(true); view.notice('正在合并，请稍候…');
      try {
        const result = await importData(targetId, data);
        view.notice(`合并完成：新增 ${result.added} 条，跳过重复 ${result.skipped} 条。`);
        view.busy(false); view.find('[data-submit]').disabled = true;
        if (state.activeChatId === targetId && typeof renderChatInterface === 'function') renderChatInterface(targetId);
        if (typeof renderChatList === 'function') renderChatList();
      } catch (error) { view.notice(`没有完成导入：${error.message}。可重试，原聊天不会被覆盖。`); view.busy(false); }
    };
  }
  window.ChatHistoryTransfer = { selectHistory, planExport, makePart, normalize, mergePlan, importData, openExport, openImport };
})();
