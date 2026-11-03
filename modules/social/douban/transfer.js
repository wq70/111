// 豆瓣独立备份：只读出勾选的内容；跨设备导入始终重新分配本地编号。
(() => {
  'use strict';
  const TYPE = 'ephone-douban';
  const copy = value => JSON.parse(JSON.stringify(value));
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' ? value : '';
  const image = value => /^(https?:\/\/|data:image\/(png|jpe?g|gif|webp|avif|bmp);base64,)/i.test(text(value)) ? value : '';
  const array = (value, label) => {
    if (!Array.isArray(value) || value.length > 100000) throw new Error(`${label}格式不正确`);
    return value;
  };
  const uid = prefix => `${prefix}_${crypto.randomUUID()}`;
  const canonical = value => JSON.stringify(value, (_key, item) => object(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  const unique = (values, key = canonical) => [...new Map(values.map(value => [key(value), value])).values()];
  const profileKeys = ['doubanUserNickname', 'doubanUserAvatar'];
  const preferenceKeys = ['doubanMinPosts', 'doubanMaxPosts', 'doubanEnableAiAvatar'];
  const categories = [
    ['posts', '帖子', '可逐篇勾选，多选或全选'],
    ['comments', '帖子评论', '随所选帖子一起保存'],
    ['groups', '自定义小组', '小组名称、提示词和启用状态'],
    ['profile', '我的豆瓣身份', '豆瓣昵称与头像'],
    ['preferences', '豆瓣设置与 NPC 头像', '生成数量、AI 头像开关与自定义头像库'],
    ['resources', '关联资料', '参与角色的基本人设、我的人设和关联世界书；不包含聊天记录']
  ];
  const currentState = () => state;

  function characterRecord(chat) {
    return { id: chat.id, name: text(chat.name), originalName: text(chat.originalName || chat.name),
      linkedWorldBookIds: Array.isArray(chat.linkedWorldBookIds) ? chat.linkedWorldBookIds : (chat.settings?.linkedWorldBookIds || []),
      settings: { aiPersona: text(chat.settings?.aiPersona), myPersona: text(chat.settings?.myPersona),
        aiAvatar: image(chat.settings?.aiAvatar), myAvatar: image(chat.settings?.myAvatar) } };
  }
  function personaRecord(persona) {
    return { id: persona.id, name: text(persona.name), persona: text(persona.persona), avatar: image(persona.avatar) };
  }
  function bookRecord(book) {
    return { id: book.id, name: text(book.name), isGlobal: false,
      content: array(book.content, '世界书条目').map(entry => {
        if (!object(entry) || typeof entry.content !== 'string') throw new Error('世界书条目格式不正确');
        return { comment: text(entry.comment), content: entry.content, enabled: entry.enabled !== false,
          keys: Array.isArray(entry.keys) ? entry.keys.filter(key => typeof key === 'string') : [] };
      }) };
  }
  function findCharacter(record, chats, comment = false) {
    const id = comment ? record.commenterId : record.authorId;
    if (id && id !== 'user' && chats[id] && !chats[id].isGroup) return chats[id];
    const name = comment ? record.commenter : record.authorName;
    const original = comment ? record.commenterOriginalName : record.authorOriginalName;
    const matches = Object.values(chats).filter(chat => !chat.isGroup &&
      (original ? chat.originalName === original : chat.name === name));
    return matches.length === 1 ? matches[0] : null;
  }
  function postRecord(post) {
    if (!object(post) || typeof post.postTitle !== 'string' || typeof post.content !== 'string' ||
        typeof post.authorName !== 'string' || typeof post.groupName !== 'string' ||
        !Number.isFinite(post.timestamp) || post.timestamp < 0) throw new Error('帖子格式不正确');
    const result = { postTitle: post.postTitle, content: post.content, authorName: post.authorName,
      groupName: post.groupName, timestamp: post.timestamp, authorOriginalName: text(post.authorOriginalName),
      authorAvatarPrompt: text(post.authorAvatarPrompt), authorAvatar: image(post.authorAvatar),
      likesCount: Number.isFinite(post.likesCount) ? Math.max(0, post.likesCount) : 0 };
    if (typeof post.authorId === 'string') result.authorId = post.authorId;
    result.comments = array(post.comments ?? [], '评论').map(comment => {
      if (!object(comment) || typeof comment.commenter !== 'string' || typeof comment.text !== 'string') {
        throw new Error('评论格式不正确');
      }
      const item = { commenter: comment.commenter, text: comment.text,
        commenterDisplayName: text(comment.commenterDisplayName),
        commenterOriginalName: text(comment.commenterOriginalName), isUser: comment.isUser === true,
        avatar_prompt: text(comment.avatar_prompt), commenterAvatar: image(comment.commenterAvatar) };
      if (typeof comment.commenterId === 'string') item.commenterId = comment.commenterId;
      if (Number.isFinite(comment.timestamp)) item.timestamp = comment.timestamp;
      return item;
    });
    result.commentsCount = result.comments.length;
    return result;
  }
  function settingsRecord(value, keys) {
    if (!object(value)) throw new Error('豆瓣设置格式不正确');
    const result = {};
    for (const key of keys) if (own(value, key)) {
      const item = value[key];
      if (key === 'doubanEnableAiAvatar') {
        if (typeof item !== 'boolean') throw new Error('头像开关格式不正确');
        result[key] = item;
      } else if (/Posts$/.test(key)) {
        if (!Number.isInteger(item) || item < 1) throw new Error('帖子数量格式不正确');
        result[key] = item;
      } else {
        if (typeof item !== 'string') throw new Error('豆瓣身份格式不正确');
        result[key] = key.endsWith('Avatar') ? image(item) : item;
      }
    }
    if (result.doubanMinPosts > result.doubanMaxPosts) throw new Error('最少帖子数不能大于最多帖子数');
    return result;
  }
  function normalize(payload) {
    if (!object(payload) || payload.type !== TYPE || payload.version !== 1 || !object(payload.data)) {
      throw new Error('请选择由“豆瓣导出”生成的备份文件（版本 1）');
    }
    const source = payload.data, data = {};
    if (own(source, 'posts')) data.posts = array(source.posts, '帖子').map(postRecord);
    if (own(source, 'groups')) data.groups = array(source.groups, '小组').map(group => {
      if (!object(group) || typeof group.name !== 'string' || !group.name.trim() || typeof group.prompt !== 'string') {
        throw new Error('自定义小组格式不正确');
      }
      return { name: group.name, prompt: group.prompt, enabled: group.enabled !== false };
    });
    if (own(source, 'profile')) data.profile = settingsRecord(source.profile, profileKeys);
    if (own(source, 'preferences')) {
      data.preferences = settingsRecord(source.preferences, preferenceKeys);
      data.preferences.npcAvatars = array(source.preferences.npcAvatars ?? [], 'NPC头像').map(image).filter(Boolean);
    }
    if (own(source, 'resources')) {
      const r = source.resources;
      if (!object(r)) throw new Error('关联资料格式不正确');
      data.resources = {};
      for (const [key, project] of [['characters', characterRecord], ['personas', personaRecord], ['worldBooks', bookRecord]]) {
        const ids = new Set();
        data.resources[key] = array(r[key], '关联资料').map(item => {
          if (!object(item) || !['string', 'number'].includes(typeof item.id) || ids.has(String(item.id))) {
            throw new Error('关联资料编号缺失或重复');
          }
          if (typeof item.name !== 'string' || (key === 'characters' && !object(item.settings)) ||
              (key === 'personas' && typeof item.persona !== 'string')) throw new Error('关联资料格式不正确');
          ids.add(String(item.id));
          return project(item);
        });
      }
      const selection = object(r.selection) ? r.selection : {};
      data.resources.selection = {};
      for (const key of ['characters', 'personas', 'worldBooks']) {
        const available = new Set(data.resources[key].map(item => String(item.id)));
        data.resources.selection[key] = array(selection[key] ?? data.resources[key].map(item => item.id), '关联选择')
          .filter(id => ['string', 'number'].includes(typeof id) && available.has(String(id)));
      }
    }
    if (!Object.keys(data).length) throw new Error('备份中没有可导入的豆瓣内容');
    return { type: TYPE, version: 1, data };
  }

  async function collect() {
    const s = currentState(), g = s.globalSettings;
    const posts = await db.doubanPosts.orderBy('timestamp').reverse().toArray();
    const characterIds = new Set(g.doubanActiveCharacterIds || []);
    const decorated = posts.map(post => {
      const result = copy(post), author = findCharacter(post, s.chats);
      if (author) { result.authorId = author.id; result.authorAvatar = image(author.settings?.aiAvatar); characterIds.add(author.id); }
      result.comments = (post.comments || []).map(comment => {
        const item = copy(comment), chat = findCharacter(comment, s.chats, true);
        item.isUser = comment.isUser === true || comment.commenterId === 'user' || comment.commenter === '我' ||
          comment.commenter === g.doubanUserNickname || comment.commenter === s.qzoneSettings?.nickname;
        item.commenterDisplayName = comment.commenterDisplayName || (item.isUser ? g.doubanUserNickname || s.qzoneSettings?.nickname || '我' : comment.commenter);
        if (item.isUser) item.commenterAvatar = image(g.doubanUserAvatar || s.qzoneSettings?.avatar);
        else if (chat) { item.commenterId = chat.id; item.commenterAvatar = image(chat.settings?.aiAvatar); characterIds.add(chat.id); }
        return item;
      });
      return result;
    });
    const bookIds = new Set(g.doubanActiveWorldBookIds || []);
    for (const id of characterIds) for (const bookId of (s.chats[id]?.settings?.linkedWorldBookIds || [])) bookIds.add(bookId);
    const books = (s.worldBooks || []).filter(book => bookIds.has(book.id) || book.isGlobal || book.name === '豆瓣设定');
    const personas = (s.personaPresets || []).filter(persona => (g.doubanActivePersonaIds || []).includes(persona.id));
    return { posts: decorated, groups: copy(g.customDoubanGroups || []),
      profile: { doubanUserNickname: text(g.doubanUserNickname), doubanUserAvatar: image(g.doubanUserAvatar) },
      preferences: { doubanMinPosts: g.doubanMinPosts || 12, doubanMaxPosts: g.doubanMaxPosts || 20,
        doubanEnableAiAvatar: g.doubanEnableAiAvatar !== false, npcAvatars: copy(g.npcAvatars || []) },
      resources: { characters: [...characterIds].filter(id => s.chats[id] && !s.chats[id].isGroup).map(id => characterRecord(s.chats[id])),
        personas: personas.map(personaRecord), worldBooks: books.map(bookRecord),
        selection: { characters: copy(g.doubanActiveCharacterIds || []), personas: copy(g.doubanActivePersonaIds || []),
          worldBooks: books.filter(book => book.isGlobal || (g.doubanActiveWorldBookIds || []).includes(book.id) || book.name === '豆瓣设定').map(book => book.id) } } };
  }
  function selectData(data, options) {
    const selected = {};
    if (options.posts) selected.posts = data.posts.filter((_post, index) => options.postIndices.includes(index)).map(post => ({
      ...post, comments: options.comments ? post.comments : []
    }));
    for (const key of ['groups', 'profile', 'preferences', 'resources']) if (options[key] && own(data, key)) selected[key] = copy(data[key]);
    if (selected.resources) {
      const r = selected.resources;
      const characterIds = new Set((r.selection?.characters || r.characters.map(item => item.id)).map(String));
      for (const post of selected.posts || []) {
        if (post.authorId) characterIds.add(String(post.authorId));
        for (const comment of post.comments || []) if (comment.commenterId) characterIds.add(String(comment.commenterId));
      }
      r.characters = r.characters.filter(item => characterIds.has(String(item.id)));
      const bookIds = new Set((r.selection?.worldBooks || r.worldBooks.map(item => item.id)).map(String));
      for (const character of r.characters) for (const id of character.linkedWorldBookIds || []) bookIds.add(String(id));
      r.worldBooks = r.worldBooks.filter(item => bookIds.has(String(item.id)));
    }
    return normalize({ type: TYPE, version: 1, data: selected });
  }
  const postKey = post => canonical([post.timestamp, post.authorOriginalName || post.authorName, post.groupName, post.postTitle, post.content]);
  const commentKey = comment => canonical([comment.commenterOriginalName || comment.commenter, comment.text, comment.timestamp ?? null]);
  const identityKey = (key, item) => {
    const projected = key === 'characters' ? characterRecord(item) : key === 'personas' ? personaRecord(item) : bookRecord(item);
    delete projected.id;
    // The same world book has different local IDs after migration.
    if (key === 'characters') delete projected.linkedWorldBookIds;
    return canonical(projected);
  };

  async function importData(payload, options) {
    if (options.mode !== 'merge' && options.mode !== 'replace') throw new Error('请选择导入方式');
    const normalized = normalize(payload);
    const selected = selectData(normalized.data, options).data;
    const replace = options.mode === 'replace';
    const s = currentState(), g = copy(s.globalSettings), stagedChats = [];
    const result = { added: 0, merged: 0, skipped: 0, resources: 0 };
    // All writes, including a replacement clear, share one transaction. State is published only after commit.
    await db.transaction('rw', [db.doubanPosts, db.globalSettings, db.chats, db.personaPresets, db.worldBooks], async () => {
      const maps = { characters: new Map(), personas: new Map(), worldBooks: new Map() };
      if (selected.resources) {
        for (const [key, table] of [['worldBooks', db.worldBooks], ['personas', db.personaPresets], ['characters', db.chats]]) {
          const existing = (await table.toArray()).filter(item => key !== 'characters' || !item.isGroup);
          for (const incoming of selected.resources[key]) {
            const same = existing.find(item => identityKey(key, item) === identityKey(key, incoming));
            let id = same?.id;
            if (id === undefined) {
              id = uid(key === 'characters' ? 'chat' : key === 'personas' ? 'persona' : 'worldbook');
              let record = { ...copy(incoming), id };
              if (key === 'characters') {
                record = { ...record, isGroup: false, history: [], longTermMemory: [], musicData: { totalTime: 0 },
                  relationship: { status: 'friend' }, status: { text: '在线', lastUpdate: Date.now(), isBusy: false },
                  settings: { myPersona: '我是谁呀。', maxMemory: 10, theme: 'default', fontSize: 13, background: '', customCss: '',
                    linkedWorldBookIds: (incoming.linkedWorldBookIds || []).map(bookId => maps.worldBooks.get(String(bookId))).filter(id => id !== undefined),
                    aiAvatarLibrary: [], ...record.settings } };
                delete record.linkedWorldBookIds;
                window.applyDefaultChatSettings?.(record);
                stagedChats.push(record);
              }
              await table.add(record);
              existing.push(record);
              result.resources++;
            }
            maps[key].set(String(incoming.id), id);
          }
        }
        for (const [key, setting] of [['characters', 'doubanActiveCharacterIds'], ['personas', 'doubanActivePersonaIds'], ['worldBooks', 'doubanActiveWorldBookIds']]) {
          const ids = selected.resources.selection[key].map(id => maps[key].get(String(id))).filter(id => id !== undefined);
          g[setting] = replace ? ids : [...new Set([...(g[setting] || []), ...ids])];
        }
      }
      if (selected.posts) {
        const existing = replace ? [] : await db.doubanPosts.toArray();
        if (replace) await db.doubanPosts.clear();
        const byKey = new Map(existing.map(post => [postKey(post), post]));
        for (const raw of selected.posts) {
          const post = copy(raw);
          if (post.authorId !== 'user') {
            const mapped = maps.characters.get(String(post.authorId));
            delete post.authorId;
            if (mapped) post.authorId = mapped;
          }
          for (const comment of post.comments) if (comment.commenterId !== 'user') {
            const mapped = maps.characters.get(String(comment.commenterId));
            delete comment.commenterId;
            if (mapped) comment.commenterId = mapped;
          }
          const key = postKey(post), previous = byKey.get(key);
          if (previous) {
            const comments = [...(previous.comments || [])];
            const keys = new Set(comments.map(commentKey));
            for (const comment of post.comments) if (!keys.has(commentKey(comment))) {
              comments.push(comment); keys.add(commentKey(comment));
            }
            if (comments.length > (previous.comments || []).length) {
              previous.comments = comments; previous.commentsCount = comments.length;
              await db.doubanPosts.put(previous); result.merged++;
            } else result.skipped++;
          } else {
            const id = await db.doubanPosts.add(post);
            byKey.set(key, { ...post, id }); result.added++;
          }
        }
      }
      if (selected.groups) g.customDoubanGroups = replace ? selected.groups : unique([...(g.customDoubanGroups || []), ...selected.groups]);
      for (const key of ['profile', 'preferences']) if (selected[key]) {
        for (const [name, value] of Object.entries(selected[key])) {
          if (name === 'npcAvatars') g[name] = replace ? value : [...new Set([...(g[name] || []), ...value])];
          else if (replace || !own(g, name) || g[name] === '') g[name] = value;
        }
      }
      if (g.doubanMinPosts > g.doubanMaxPosts) throw new Error('合并后的帖子数量范围无效，请同时导入最少和最多数量，或使用覆盖恢复');
      if (Object.keys(selected).some(key => key !== 'posts')) await db.globalSettings.put(g);
    });
    s.globalSettings = g;
    for (const chat of stagedChats) s.chats[chat.id] = chat;
    if (selected.resources) {
      s.personaPresets = await db.personaPresets.toArray();
      s.worldBooks = await db.worldBooks.toArray();
    }
    return result;
  }

  let busy = false, opening = false;
  async function open(mode, payload) {
    if (busy || opening || document.getElementById('douban-transfer-modal')) return;
    opening = true;
    let data;
    try { data = mode === 'export' ? await collect() : normalize(payload).data; }
    finally { opening = false; }
    document.getElementById('douban-settings-modal')?.classList.remove('visible');
    const modal = document.createElement('div');
    modal.id = 'douban-transfer-modal'; modal.className = 'modal visible douban-transfer-modal';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'douban-transfer-title');
    modal.innerHTML = `<div class="modal-content douban-transfer-dialog">
      <div class="modal-header"><span id="douban-transfer-title">${mode === 'export' ? '导出豆瓣' : '导入豆瓣'}</span><button type="button" data-close aria-label="关闭">×</button></div>
      <div class="modal-body"><p class="douban-transfer-intro">${mode === 'export' ? '选择要保存的内容，可用于自己备份或分享。' : '选择本次导入的内容，未勾选的部分保持原样。'}</p>
        <fieldset class="douban-transfer-options"><legend>包含内容</legend><div data-categories></div></fieldset>
        <section data-posts><div class="douban-transfer-list-header"><label><input type="checkbox" data-all> 全选帖子</label><span data-count></span></div><div class="douban-transfer-posts" data-post-list></div></section>
        ${mode === 'import' ? `<fieldset class="douban-transfer-options"><legend>导入方式</legend>
          <label><input type="radio" name="douban-import-mode" value="merge" checked><span>追加并去重<small>保留已有帖子，补充新评论；小组和头像追加，已有设置保留。</small></span></label>
          <label><input type="radio" name="douban-import-mode" value="replace"><span>覆盖恢复<small>所选帖子替换当前全部豆瓣帖子；仅覆盖勾选的豆瓣设置。关联资料只添加，不覆盖其他应用资料。</small></span></label></fieldset>` : ''}
        <p class="douban-transfer-note">关联资料包含角色基本人设、我的人设与世界书正文。分享前请检查所选内容。</p>
        <p class="douban-transfer-error" role="alert" data-error></p>
      </div><div class="modal-footer"><button type="button" class="cancel" data-cancel>取消</button><button type="button" class="save" data-submit>${mode === 'export' ? '导出所选内容' : '导入所选内容'}</button></div></div>`;
    const root = document.getElementById('phone-screen') || document.body;
    root.appendChild(modal);
    const priorFocus = document.activeElement;
    const close = () => { if (!busy) { modal.remove(); priorFocus?.focus(); } };
    modal.querySelector('[data-close]').onclick = close;
    modal.querySelector('[data-cancel]').onclick = close;
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const focusable = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled)')].filter(el => el.getClientRects().length);
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
      }
    });
    const checks = {};
    for (const [key, title, desc] of categories) {
      if (key !== 'comments' && !own(data, key)) continue;
      if (key === 'comments' && !own(data, 'posts')) continue;
      const label = document.createElement('label'), input = document.createElement('input'), span = document.createElement('span'), small = document.createElement('small');
      input.type = 'checkbox'; input.dataset.category = key; input.checked = key === 'posts' || key === 'comments';
      span.textContent = title; small.textContent = desc; span.appendChild(small); label.append(input, span);
      modal.querySelector('[data-categories]').appendChild(label); checks[key] = input;
    }
    const rows = [];
    for (const [index, post] of (data.posts || []).entries()) {
      const label = document.createElement('label'), input = document.createElement('input'), span = document.createElement('span'), small = document.createElement('small');
      input.type = 'checkbox'; input.checked = true; input.dataset.postIndex = index;
      span.textContent = post.postTitle || '无标题帖子';
      small.textContent = `${post.groupName} · ${post.authorName} · ${new Date(post.timestamp).toLocaleString('zh-CN')} · ${(post.comments || []).length} 条评论`;
      span.appendChild(small); label.append(input, span); modal.querySelector('[data-post-list]').appendChild(label); rows.push(input);
    }
    if (!rows.length) {
      const p = document.createElement('p'); p.textContent = '暂无可选帖子，可单独导出或导入其他内容。'; modal.querySelector('[data-post-list]').appendChild(p);
    }
    const all = modal.querySelector('[data-all]');
    const update = () => {
      const enabled = checks.posts?.checked;
      if (checks.comments) checks.comments.disabled = !enabled;
      modal.querySelector('[data-posts]').hidden = !enabled;
      const count = rows.filter(input => input.checked).length;
      all.checked = rows.length > 0 && count === rows.length;
      all.indeterminate = count > 0 && count < rows.length;
      all.disabled = rows.length === 0;
      modal.querySelector('[data-count]').textContent = `已选 ${count} / ${rows.length}`;
    };
    all.onchange = () => { rows.forEach(input => { input.checked = all.checked; }); update(); };
    modal.addEventListener('change', update); update();
    modal.querySelector('[data-close]').focus();
    modal.querySelector('[data-submit]').onclick = async () => {
      if (busy) return;
      const options = Object.fromEntries(Object.entries(checks).map(([key, input]) => [key, input.checked && !input.disabled]));
      options.postIndices = rows.filter(input => input.checked).map(input => Number(input.dataset.postIndex));
      options.mode = modal.querySelector('input[name="douban-import-mode"]:checked')?.value || 'merge';
      const error = modal.querySelector('[data-error]'); error.textContent = '';
      if (!Object.entries(options).some(([key, value]) => value === true && key !== 'comments')) { error.textContent = '请至少选择一类内容。'; return; }
      if (options.posts && !options.postIndices.length) { error.textContent = '请勾选至少一篇帖子，或取消勾选“帖子”。'; return; }
      busy = true;
      const controls = [...modal.querySelectorAll('button, input')];
      const disabled = controls.map(control => control.disabled); controls.forEach(control => { control.disabled = true; });
      try {
        const selected = selectData(data, options);
        if (mode === 'export') {
          const blob = new Blob([JSON.stringify({ ...selected, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob), link = document.createElement('a');
          link.href = url; link.download = `豆瓣备份-${new Date().toISOString().slice(0, 10)}.json`;
          link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
          busy = false; close();
          if (typeof showToast === 'function') showToast('豆瓣备份已导出', 'success');
        } else {
          const chosen = Object.entries(checks).filter(([key]) => options[key]).map(([key]) => categories.find(item => item[0] === key)[1]);
          const message = options.mode === 'replace'
            ? `${options.posts ? `将用所选的 ${options.postIndices.length} 篇帖子替换当前全部豆瓣帖子。<br>` : ''}将覆盖所勾选的豆瓣设置，关联资料仅添加。<br>本次选择：${chosen.join('、')}。建议先导出备份。`
            : `将追加所选内容并去重，保留已有设置。<br>本次选择：${chosen.join('、')}。`;
          const confirmed = await showCustomConfirm(options.mode === 'replace' ? '确认覆盖恢复？' : '确认导入豆瓣？', message,
            { confirmText: options.mode === 'replace' ? '确认覆盖恢复' : '确认导入', ...(options.mode === 'replace' ? { confirmButtonClass: 'btn-danger' } : {}) });
          if (!confirmed) return;
          const result = await importData({ type: TYPE, version: 1, data }, options);
          busy = false; close();
          if (typeof isDoubanSelectMode !== 'undefined' && isDoubanSelectMode) toggleDoubanSelectMode();
          if (typeof isDoubanDetailSelectMode !== 'undefined' && isDoubanDetailSelectMode) toggleDoubanDetailSelectMode();
          if (safelyOnDetail()) showScreen('douban-screen');
          if (typeof renderDoubanScreen === 'function') await renderDoubanScreen();
          if (typeof renderChatList === 'function' && result.resources) renderChatList();
          await showCustomAlert('导入成功', `新增 ${result.added} 篇帖子，补充评论 ${result.merged} 篇，跳过重复 ${result.skipped} 篇，新增关联资料 ${result.resources} 项。`);
        }
      } catch (reason) {
        error.textContent = `操作失败：${reason.message}`;
      } finally {
        busy = false; controls.forEach((control, index) => { control.disabled = disabled[index]; }); update();
      }
    };
  }
  const safelyOnDetail = () => currentState().currentScreen === 'douban-post-detail-screen';
  async function openImport() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        if (file.size > 100 * 1024 * 1024) throw new Error('文件超过 100 MB，请分批导出帖子后重试');
        await open('import', normalize(JSON.parse(await file.text())));
      } catch (error) { await showCustomAlert('无法导入', text(error.message).replace(/[<>&]/g, '')); }
    };
    input.click();
  }
  window.DoubanTransfer = { collect, normalize, selectData, importData, openExport: () => open('export'), openImport };
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-douban-transfer]')?.dataset.doubanTransfer;
    if (action === 'export') open('export').catch(error => showCustomAlert('无法导出', text(error.message).replace(/[<>&]/g, '')));
    if (action === 'import') openImport();
  });
})();
