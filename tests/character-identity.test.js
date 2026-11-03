const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
function fixture() {
  const a = { id: 'a', originalName: '杰克', name: '杰克（A）', settings: { aiPersona: '设定A' }, history: [] };
  const b = { id: 'b', originalName: '杰克', name: '杰克（B）', settings: { aiPersona: '设定B' }, history: [] };
  const group = { id: 'g', isGroup: true, name: '朋友群', settings: { enableCrossChat: true }, history: [], members: [
    { id: 'a', originalName: '杰克', groupNickname: a.name }, { id: 'b', originalName: '杰克', groupNickname: b.name }
  ] };
  const state = { chats: { a, b, g: group }, qzoneSettings: { nickname: '我' }, globalSettings: { enableCrossChat: true }, activeChatId: 'b', userStickers: [] };
  const post = { id: 1, authorId: 'user', comments: [] };
  const stored = new Map([[1, structuredClone(post)]]), writtenChats = [], writtenPosts = [], choices = [];
  const db = {
    qzonePosts: {
      async get(id) { return structuredClone(stored.get(id)); },
      async update(id, patch) { stored.set(id, { ...stored.get(id), ...structuredClone(patch) }); },
      async add(row) { writtenPosts.push(structuredClone(row)); }
    },
    chats: { async put(row) { writtenChats.push(row.id); } }
  };
  const context = vm.createContext({ window: { state }, state, db, console: { warn() {}, log() {} },
    showNotification() {}, updateUnreadIndicator() {}, unreadPostsCount: 0, processMentions: x => x,
    document: { getElementById: () => ({ classList: { contains: () => false } }) }
  });
  context.window.showChoiceModal = async (title, options) => { choices.push({ title, options }); return context.selection ?? null; };
  vm.runInContext(source('modules/character/identity.js'), context);
  return { a, b, group, state, post, stored, writtenChats, writtenPosts, choices, context, identity: context.window.CharacterIdentity };
}

test('同名角色按ID区分；本名和备注有歧义时不取第一个', () => {
  const f = fixture(), id = f.identity;
  assert.equal(id.resolve(null, '杰克'), null);
  assert.equal(id.resolve('b', '杰克').id, 'b');
  assert.equal(id.display('杰克', 'b'), '杰克（B）');
  assert.equal(id.display('杰克'), '杰克');
  f.b.name = f.a.name;
  assert.equal(id.resolve(null, f.a.name), null);
  assert.equal(id.resolve('deleted', '杰克'), null);
  assert.equal(id.resolve(null, '杰克（A）'), null);
});

test('同名群成员可按actorId选择B，本名与头像记录保留B的ID', async () => {
  const f = fixture(), action = { type: 'text', name: '杰克', actorId: 'b', content: 'B的消息' };
  assert.equal(await f.identity.prepare(f.group, action), true);
  assert.equal(f.identity.member(f.group, action).id, 'b');
  assert.equal(f.identity.member(f.group, { senderName: '杰克', senderId: 'b' }).id, 'b');
  assert.equal(f.identity.member(f.group, { senderName: '杰克' }), null);
  assert.equal(f.choices.length, 0);
});

test('没有ID的同名发言由用户选择，取消不默认认领；后台不猜', async () => {
  const f = fixture();
  assert.equal(await f.identity.prepare(f.group, { type: 'text', name: '杰克' }), false);
  assert.equal(f.choices.length, 0);
  assert.equal(await f.identity.prepare(f.group, { type: 'text', name: '杰克' }, true), false);
  f.context.selection = 'b';
  const action = { type: 'text', name: '杰克' };
  assert.equal(await f.identity.prepare(f.group, action, true), true);
  assert.equal(action.actorId, 'b');
  assert.ok(f.choices.at(-1).options.some(option => option.text.includes('设定B')));
});

test('私聊行为归属于当前角色，模型填写另一个同名ID也不能冒充', async () => {
  const f = fixture(), action = { type: 'qzone_post', name: '杰克', actorId: 'a' };
  assert.equal(await f.identity.prepare(f.b, action), true);
  assert.equal(action.actorId, 'b');
  assert.equal(f.identity.privateChat(f.b, action).id, 'b');
});

test('群成员身份、跨群目标按ID校验，同名群聊可选择且拒绝非成员群', async () => {
  const f = fixture();
  f.group.members = f.group.members.filter(member => member.id === 'b');
  const other = { ...f.group, id: 'g2' };
  f.state.chats.g2 = other;
  assert.equal(f.identity.groupsFor('a').length, 0);
  assert.equal(f.identity.groupsFor('b').length, 2);
  assert.equal(await f.identity.targetGroup(f.a, { actorId: 'a', targetGroupId: 'g' }), null);
  const action = { type: 'send_group_message', targetGroupName: f.group.name };
  assert.equal(await f.identity.prepare(f.b, action), false);
  f.context.selection = 'g2';
  assert.equal(await f.identity.prepare(f.b, action, true), true);
  assert.equal(action.targetGroupId, 'g2');
  assert.equal(await f.identity.targetGroup(f.b, action), other);
  assert.equal(await f.identity.targetGroup(f.b, { targetGroupId: 'deleted', targetGroupName: f.group.name }), null);
});

test('运行真实跨聊天分支：B的悄悄话写入B私聊，绝不写入A', async () => {
  const f = fixture();
  f.context.chat = f.group;
  f.context.action = { type: 'send_private_message', actorId: 'b', name: '杰克', recipient: '我', content: ['B的悄悄话'] };
  await f.identity.prepare(f.group, f.context.action);
  const text = source('src/js-bundles/trigger-response/media-preprocessing.jsfrag');
  const body = text.slice(text.indexOf("case 'send_private_message':"), text.indexOf("case 'send_group_message':"));
  await vm.runInContext(`(async () => { let aiMessage, lastPrivateMessagesSent; let messageTimestamp=100; for (const msgData of [action]) { switch(msgData.type) { ${body} } } })()`, f.context);
  assert.equal(f.a.history.length, 0);
  assert.equal(f.b.history.length, 1);
  assert.equal(f.b.history[0].senderId, 'b');
  assert.deepEqual(f.writtenChats, ['b']);
});

test('运行真实跨群分支：同名成员也保留正确发言者与目标群', async () => {
  const f = fixture();
  f.context.chat = f.b;
  f.context.action = { type: 'send_group_message', actorId: 'b', targetGroupId: 'g', content: ['B发到群里'] };
  await f.identity.prepare(f.b, f.context.action);
  const text = source('src/js-bundles/trigger-response/media-preprocessing.jsfrag');
  const body = text.slice(text.indexOf("case 'send_group_message':"), text.indexOf("case 'view_myphone':"));
  assert.ok(body.length > 100);
  await vm.runInContext(`(async () => { let aiMessage; let messageTimestamp=100; for (const msgData of [action]) { switch(msgData.type) { ${body} } } })()`, f.context);
  assert.equal(f.group.history[0].senderId, 'b');
});

test('运行真实群后台发动态分支：同名B的帖子authorId为B', async () => {
  const f = fixture();
  f.context.action = { type: 'qzone_post', name: '杰克', actorId: 'b', content: 'B的动态' };
  const text = source('modules/ai/group-actions.js');
  const body = text.slice(text.indexOf("case 'qzone_post':"), text.indexOf("case 'qzone_comment':"));
  await vm.runInContext(`(async () => {let visibleSystemMessage; const senderDisplayName='杰克（B）'; switch(action.type) { ${body} } })()`, f.context);
  assert.equal(f.writtenPosts[0].authorId, 'b');
});

test('运行真实评论分支：作者与回复目标各自保留身份', async () => {
  const f = fixture();
  f.context.chat = f.b;
  f.context.action = { type: 'qzone_comment', name: '杰克', actorId: 'b', postId: 1, replyTo: '杰克', replyToId: 'a', commentText: '回复A' };
  assert.equal(await f.identity.prepare(f.b, f.context.action), true);
  const text = source('src/js-bundles/trigger-response/response-actions.jsfrag');
  const body = text.slice(text.indexOf("case 'qzone_comment':"), text.indexOf("case 'qzone_like':"));
  await vm.runInContext(`(async () => {const chatId='b'; for(const msgData of [action]) {switch(msgData.type) { ${body} } } })()`, f.context);
  const comment = f.stored.get(1).comments[0];
  assert.equal(comment.commenterId, 'b');
  assert.equal(comment.replyToId, 'a');
  assert.equal(f.identity.commentDisplay(comment), '杰克（B）');
  assert.match(f.identity.commentContext(comment, 'a'), /^杰克（B）/);
  assert.match(f.identity.commentContext(comment, 'b'), /^你/);
});

test('旧评论只保存用户选定的这一条归属；取消不修改原记录', async () => {
  const f = fixture();
  f.post.comments = [{ commenterName: '杰克', text: '旧评论1', timestamp: 1 }, { commenterName: '杰克', text: '旧评论2', timestamp: 2 }];
  f.stored.set(1, structuredClone(f.post));
  assert.match(f.identity.commentDisplay(f.post.comments[0]), /身份待确认/);
  assert.equal(await f.identity.resolveComment(f.post, 0), null);
  assert.equal(f.stored.get(1).comments[0].commenterId, undefined);
  f.context.selection = 'b';
  assert.equal((await f.identity.resolveComment(f.post, 0)).id, 'b');
  assert.equal(f.stored.get(1).comments[0].commenterId, 'b');
  assert.equal(f.stored.get(1).comments[1].commenterId, undefined);
  assert.equal(f.identity.resolve(null, '杰克'), null);
});

test('用户昵称与角色本名相同：新评论按ID，旧评论仍待选择', async () => {
  const f = fixture();
  f.state.qzoneSettings.nickname = '杰克';
  assert.equal(f.identity.isUserComment({ commenterName: '杰克' }), false);
  assert.equal(f.identity.isUserComment({ commenterName: '杰克', commenterId: 'user' }), true);
  assert.equal(f.identity.isUserComment({ commenterName: '杰克', commenterId: 'b' }), false);
  const action = { type: 'qzone_comment', postId: 1, replyTo: '杰克', replyToId: 'b' };
  await f.identity.prepare(f.a, action);
  assert.equal(action.actorId, 'a');
  assert.equal(action.replyToId, 'b');
});

test('通知只送帖子作者与实际被回复者；删除角色不回退同名角色', () => {
  const f = fixture();
  assert.deepEqual([...f.identity.notificationIds({ authorId: 'user' }, { replyTo: '杰克', replyToId: 'b' })], ['b']);
  assert.deepEqual([...f.identity.notificationIds({ authorId: 'a' }, { replyTo: '杰克', replyToId: 'b' })], ['a', 'b']);
  assert.deepEqual([...f.identity.notificationIds({ authorId: 'user' }, { replyTo: '杰克' })], []);
  delete f.state.chats.b;
  assert.deepEqual([...f.identity.notificationIds({ authorId: 'user' }, { replyTo: '杰克', replyToId: 'b' })], []);
});

test('点赞分别记录同名A/B与用户，旧点赞不自动分配', () => {
  const f = fixture(), post = { likes: ['杰克'] };
  assert.equal(f.identity.likedBy(post, 'a'), false);
  assert.equal(f.identity.addLike(post, 'a', '杰克'), true);
  assert.equal(f.identity.addLike(post, 'b', '杰克'), true);
  assert.equal(f.identity.addLike(post, 'b', '杰克'), false);
  assert.deepEqual([...f.identity.likeLabels(post)], ['杰克', '杰克（A）', '杰克（B）']);
});

test('NPC与同名角色不会相互认领，提示词提供身份与正确群关系', async () => {
  const f = fixture(), comment = { commenterName: '杰克', commenterId: 'npc_1', timestamp: 1 };
  f.post.comments = [comment];
  assert.equal((await f.identity.resolveComment(f.post, 0)).id, 'npc_1');
  assert.match(f.identity.commentContext(comment, 'a'), /^杰克 \[角色ID: npc_1\]/);
  f.group.members = f.group.members.filter(member => member.id === 'b');
  assert.doesNotMatch(f.identity.buildContext(f.a), /targetGroupId:/);
  assert.match(f.identity.buildContext(f.b), /targetGroupId: "g"/);
});

test('导演模式取消身份选择时，原回复与之前跨聊消息保持完整', async () => {
  const f = fixture();
  f.state.activeChatId = 'g';
  f.group.history = [{ role: 'assistant', senderId: 'b', senderName: '杰克', content: '原回复', timestamp: 100 }];
  f.a.history = [{ role: 'assistant', content: '上轮跨聊消息', timestamp: 200 }];
  f.context.lastResponseTimestamps = [100];
  f.context.lastPrivateMessagesSent = [{ chatId: 'a', timestamp: 200 }];
  const textarea = { value: JSON.stringify({ type: 'text', name: '杰克', content: '新回复' }) };
  f.context.document = { getElementById: () => ({ querySelectorAll: () => [textarea], addEventListener() {} }) };
  vm.runInContext(source('modules/message-actions.js'), f.context);
  await f.context.window.saveEditedAiResponse();
  assert.equal(f.group.history[0].content, '原回复');
  assert.equal(f.a.history[0].content, '上轮跨聊消息');
  assert.equal(f.context.lastResponseTimestamps.length, 1);
  assert.equal(f.context.lastPrivateMessagesSent.length, 1);
  assert.equal(f.writtenChats.length, 0);
});

test('旧评论在用户选择期间发生变化时，不把选择写到另一条评论上', async () => {
  const f = fixture();
  f.post.comments = [{ commenterName: '杰克', text: '旧评论', timestamp: 1 }];
  f.stored.set(1, { ...f.post, comments: [{ commenterName: '杰克', text: '另一条评论', timestamp: 2 }] });
  f.context.selection = 'b';
  assert.equal(await f.identity.resolveComment(f.post, 0), null);
  assert.equal(f.stored.get(1).comments[0].commenterId, undefined);
});

test('区分标签保留本名、同名同备注可选中正确角色；标签属于角色自身', async () => {
  const f = fixture();
  f.b.name = f.a.name = '杰克';
  const input = { value: '  成年线  ' }, row = { style: {} };
  f.context.document = { getElementById: id => id.endsWith('-input') ? input : row };
  f.identity.saveSettings(f.b);
  assert.equal(f.b.settings.identityLabel, '成年线');
  assert.equal(f.b.originalName, '杰克');
  assert.equal(f.identity.display('杰克', 'b'), '杰克 · 成年线');
  assert.equal(f.identity.resolve(null, '杰克 · 成年线').id, 'b');
  assert.match(f.identity.buildContext(f.group), /杰克（B） · 成年线/);
  input.value = '';
  f.identity.renderSettings(f.b);
  assert.equal(input.value, '成年线');
  f.identity.renderSettings(f.a);
  assert.equal(input.value, '');
  f.identity.renderSettings(f.group);
  assert.equal(row.style.display, 'none');
  assert.equal(f.b.settings.identityLabel, '成年线');
});

test('旧NPC与角色本名相同，用户可以从同名候选中明确选择NPC', async () => {
  const f = fixture();
  f.context.db.npcs = { async toArray() { return [{ id: 1, name: '杰克', persona: 'NPC设定' }]; } };
  f.post.comments = [{ commenterName: '杰克', text: 'NPC旧评论', timestamp: 1 }];
  f.stored.set(1, structuredClone(f.post));
  f.context.selection = 'npc_1';
  assert.equal((await f.identity.resolveComment(f.post, 0)).id, 'npc_1');
  assert.equal(f.stored.get(1).comments[0].commenterId, 'npc_1');
  assert.equal(f.choices[0].options.length, 3);
});
