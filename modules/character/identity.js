// Names are presentation; persisted character/chat IDs determine ownership and delivery.
(function () {
  const key = value => value == null ? '' : String(value);
  const chats = () => Object.values(window.state?.chats || {});
  const people = () => chats().filter(chat => !chat.isGroup);
  const user = () => ({ id: 'user', originalName: window.state?.qzoneSettings?.nickname || '我', name: window.state?.qzoneSettings?.nickname || '我' });
  const scope = chat => chat?.isGroup ? (chat.members || []) : people();
  function label(person) {
    const profile = window.state?.chats?.[person.id] || person;
    const name = person.groupNickname || person.name || person.originalName || '未命名';
    const tag = profile.settings?.identityLabel;
    return tag ? `${name} · ${tag}` : name;
  }
  function renderSettings(chat) {
    const row = document.getElementById('character-identity-label-group');
    const input = document.getElementById('character-identity-label-input');
    if (row) row.style.display = chat.isGroup ? 'none' : '';
    if (input) input.value = chat.isGroup ? '' : (chat.settings?.identityLabel || '');
  }
  function saveSettings(chat) {
    const input = document.getElementById('character-identity-label-input');
    if (!chat.isGroup && input) chat.settings.identityLabel = input.value.trim().slice(0, 40);
  }
  function candidates(name, pool = people()) {
    if (!name) return [];
    return pool.filter(person => [person.originalName, person.name, person.groupNickname, label(person), ...(person.nameHistory || [])].includes(name));
  }
  function resolve(id, name, pool = people()) {
    // An explicit missing/deleted ID must never fall back to another namesake.
    if (key(id)) return pool.find(person => key(person.id) === key(id)) || null;
    const matches = candidates(name, pool);
    return matches.length === 1 ? matches[0] : null;
  }
  function member(chat, action) {
    return resolve(action.actorId ?? action.senderId, action.name ?? action.senderName, scope(chat));
  }
  function display(name, id, chat) {
    if (key(id) === 'user') return chat?.settings?.myNickname || user().name;
    if (key(id).startsWith('npc_')) return name || 'NPC';
    const person = resolve(id, name, [user(), ...scope(chat)]);
    return person ? label(person) : (name || '未知角色');
  }
  const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  async function choose(title, matches, interactive) {
    if (!interactive || !matches.length || typeof window.showChoiceModal !== 'function') return null;
    const options = matches.map((person, index) => {
      const profile = window.state?.chats?.[person.id] || person;
      const personLabel = label(person);
      const detail = profile.settings?.aiPersona || person.persona || '';
      return { value: key(person.id), text: `<span style="white-space:normal;overflow-wrap:anywhere">${escape(`${index + 1}. ${personLabel}${person.originalName && person.originalName !== personLabel ? `（本名：${person.originalName}）` : ''}${key(person.id) === 'user' ? '（我）' : ''}${detail ? ` · ${String(detail).slice(0, 70)}` : ''}`)}</span>` };
    });
    const selected = await window.showChoiceModal(title, options);
    return matches.find(person => key(person.id) === key(selected)) || null;
  }
  async function select(id, name, pool, title, interactive) {
    const found = resolve(id, name, pool);
    if (found) return found;
    const matches = name ? candidates(name, pool) : pool;
    if (key(id)) return choose('原角色已不存在或不在当前范围，请重新选择', matches, interactive);
    return choose(title, matches, interactive);
  }
  async function replyPool(post) {
    const pool = [user(), ...people()];
    if (typeof db.npcs?.toArray === 'function') {
      const npcs = await db.npcs.toArray();
      npcs.forEach(npc => pool.push({ id: `npc_${npc.id}`, originalName: npc.name, persona: npc.persona }));
    }
    for (const comment of post?.comments || []) {
      if (key(comment?.commenterId).startsWith('npc_') && !pool.some(person => key(person.id) === key(comment.commenterId))) {
        pool.push({ id: comment.commenterId, originalName: comment.commenterName });
      }
    }
    return pool;
  }
  function groupsFor(actorId) {
    return chats().filter(chat => chat.isGroup && (chat.members || []).some(person => key(person.id) === key(actorId)));
  }
  async function targetGroup(chat, action, interactive = false) {
    const pool = groupsFor(action.actorId || chat.id);
    const found = key(action.targetGroupId)
      ? pool.find(group => key(group.id) === key(action.targetGroupId))
      : null;
    if (key(action.targetGroupId)) return found || null;
    const matches = pool.filter(group => group.name === action.targetGroupName);
    return matches.length === 1 ? matches[0] : choose('有同名群聊，请选择发送到哪个群', matches, interactive);
  }
  function privateChat(chat, action) {
    const actor = chat.isGroup ? member(chat, action) : chat;
    return actor ? people().find(person => key(person.id) === key(actor.id)) || null : null;
  }
  async function prepare(chat, action, interactive = false) {
    if (!action || typeof action !== 'object') return false;
    if (['thought_chain', 'narration'].includes(action.type) || action.actorType === 'pet') return true;
    const actor = chat.isGroup
      ? await select(action.actorId, action.name, scope(chat), '有同名角色或未指定角色，请选择本次发言者', interactive)
      : chat;
    if (!actor) {
      console.warn('[角色识别] 无法确定发言者，已跳过指令', action.type);
      return false;
    }
    action.actorId = actor.id;
    action.name = actor.originalName || actor.name;
    if (action.type === 'send_group_message') {
      const group = await targetGroup(chat, action, interactive);
      if (!group) return false;
      action.targetGroupId = group.id;
      action.targetGroupName = group.name;
    }
    if (action.type === 'qzone_comment' && (action.replyTo || key(action.replyToId))) {
      const post = await db.qzonePosts.get(Number(action.postId));
      if (!post) return false;
      const recipient = await select(action.replyToId, action.replyTo, await replyPool(post), '请选择这条评论要回复的角色', interactive);
      if (!recipient) return false;
      action.replyToId = recipient.id;
      action.replyTo = recipient.originalName || recipient.name;
    }
    return true;
  }
  function commentFields(action) {
    return { commenterId: action.actorId, replyToId: action.replyToId || null };
  }
  function commentDisplay(comment) {
    const label = key(comment.commenterId) ? display(comment.commenterName, comment.commenterId) : comment.commenterName;
    const ambiguous = !key(comment.commenterId) && candidates(comment.commenterName, [user(), ...people()]).length > 1;
    return ambiguous ? `${comment.commenterName}（身份待确认）` : label;
  }
  function likedBy(post, id) {
    return (post.likeActors || []).some(actor => key(actor.id) === key(id)) || (post.likes || []).some(name => {
      const pool = [user(), ...people()];
      const person = resolve(null, name, pool);
      return person && key(person.id) === key(id);
    });
  }
  function addLike(post, id, name) {
    if (likedBy(post, id)) return false;
    (post.likeActors ||= []).push({ id, name });
    return true;
  }
  function likeLabels(post) {
    return [...(post.likes || []).map(name => display(name)), ...(post.likeActors || []).map(actor => display(actor.name, actor.id))];
  }
  function notificationIds(post, comment) {
    const result = new Set();
    if (post.authorId !== 'user' && window.state?.chats?.[post.authorId] && !window.state.chats[post.authorId].isGroup) result.add(post.authorId);
    if (comment.replyToId !== 'user') {
      const target = resolve(comment.replyToId, comment.replyTo, [user(), ...people()]);
      if (target && target.id !== 'user' && window.state?.chats?.[target.id]) result.add(target.id);
    }
    return result;
  }
  function isUserComment(comment) {
    const actor = resolve(comment.commenterId, comment.commenterName, [user(), ...people()]);
    return actor?.id === 'user';
  }
  function commentContext(comment, viewerId) {
    const author = key(comment.commenterId) ? resolve(comment.commenterId, null, [user(), ...people()]) : null;
    const mine = author && key(author.id) === key(viewerId);
    const identity = key(comment.commenterId) || (author && key(author.id));
    return `${mine ? '你' : commentDisplay(comment)}${identity ? ` [角色ID: ${identity}]` : ' [旧记录，身份未确认]'}${comment.replyTo ? ` 回复 ${display(comment.replyTo, comment.replyToId)}${comment.replyToId ? ` [角色ID: ${comment.replyToId}]` : ''}` : ''}`;
  }
  async function resolveComment(post, index) {
    const comment = post?.comments?.[index];
    if (!comment || typeof comment !== 'object') return null;
    if (key(comment.commenterId).startsWith('npc_')) return { id: comment.commenterId, originalName: comment.commenterName };
    const person = await select(comment.commenterId, comment.commenterName, await replyPool(post), '这条旧评论属于哪位？请选择后再回复', true);
    if (!person) return null;
    if (key(comment.commenterId) !== key(person.id)) {
      // Persist only this comment's explicit selection, never a global name-to-ID guess.
      const fresh = await db.qzonePosts.get(post.id);
      const current = fresh?.comments?.[index];
      if (!current || current.timestamp !== comment.timestamp || current.commenterName !== comment.commenterName || key(current.commenterId) !== key(comment.commenterId)) return null;
      current.commenterId = person.id;
      await db.qzonePosts.update(post.id, { comments: fresh.comments });
      post.comments = fresh.comments;
    }
    return person;
  }
  function buildContext(chat) {
    if (!chat) return '';
    const pool = chat.isGroup ? scope(chat) : [chat];
    let text = '\n# 角色身份（本名相同也不代表同一人）\n所有角色行为指令增加 actorId，必须使用下面对应角色的ID；name仍填写其本名。不要把同名角色的人设、发言或经历当成彼此的。\n';
    pool.forEach(person => { text += `- actorId: ${JSON.stringify(key(person.id))}，本名: ${JSON.stringify(person.originalName || person.name)}，备注: ${JSON.stringify(label(person))}\n`; });
    text += '动态评论增加 replyToId 指定被回复者的角色ID（用户为 "user"），replyTo仍填写本名；参考评论中给出的角色ID。身份未确认的旧评论不能据同名判断为自己的经历。\n';
    const groups = chat.isGroup ? [] : groupsFor(chat.id);
    if (groups.length) {
      text += 'send_group_message 必须增加 targetGroupId，群名相同也只发送到指定群：\n';
      groups.forEach(group => { text += `- targetGroupId: ${JSON.stringify(key(group.id))}，群名: ${JSON.stringify(group.name)}\n`; });
    }
    return text;
  }
  window.CharacterIdentity = { candidates, resolve, member, display, prepare, privateChat, targetGroup, groupsFor, commentFields, commentDisplay, commentContext, resolveComment, likedBy, addLike, likeLabels, notificationIds, isUserComment, buildContext, renderSettings, saveSettings };
})();
