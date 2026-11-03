const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const deps = name => require(process.env.HISTORY_TEST_DEPS ? path.join(process.env.HISTORY_TEST_DEPS, name) : name);
const Dexie = deps('dexie');
const { IDBFactory, IDBKeyRange } = deps('fake-indexeddb');
const source = fs.readFileSync(path.join(__dirname, '../modules/data/chat-history-transfer.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const stamp = (day, hour = 12) => new Date(2026, 10, day, hour).getTime();
const message = (day, content = '你好', extra = {}) => ({ role: 'user', timestamp: stamp(day), content, ...extra });
const chat = (id, history = [], extra = {}) => ({ id, name: id, settings: { apiKey: 'keep-private', aiPersona: 'keep-persona' }, history, longTermMemory: ['keep-memory'], ...extra });
const video = (id = 'v') => ({ id, chatId: 'source', name: '视频.mp4', dataUrl: 'data:video/mp4;base64,AQID', size: 3 });
const payload = (messages, extra = {}) => ({ type: 'EPhoneChatHistoryPart', version: 1,
  source: { id: 'source', name: '原聊天', isGroup: false, members: [] }, messages, videoAttachments: [], ...extra });

async function fixture(t, initial = chat('target')) {
  const db = new Dexie('history-test', { indexedDB: new IDBFactory(), IDBKeyRange });
  db.version(1).stores({ chats: '&id', videoAttachments: '&id,chatId' });
  await db.open(); t.after(() => db.close()); await db.chats.put(clone(initial));
  const state = { activeChatId: initial.id, chats: { [initial.id]: clone(initial) } };
  const sandbox = { db, state, window: {}, Dexie, TextEncoder, URL, Blob, setTimeout, clearTimeout, console,
    crypto: require('node:crypto').webcrypto };
  vm.runInNewContext(source, sandbox);
  return { api: sandbox.window.ChatHistoryTransfer, state, db };
}

test('日期包含起止整天；无时间记录只在全量导出中保留；反向日期和非法日期拒绝', async t => {
  const { api } = await fixture(t);
  const messages = [message(1), message(2, '零点', { timestamp: stamp(2, 0) }), message(2, '末毫秒', { timestamp: stamp(3, 0) - 1 }), message(3), { role: 'user', content: '没有时间' }];
  assert.deepEqual(clone(api.selectHistory(messages, '2026-11-02', '2026-11-02')).map(m => m.content), ['零点', '末毫秒']);
  assert.equal(api.selectHistory(messages).length, 5);
  assert.throws(() => api.selectHistory(messages, '2026-11-03', '2026-11-02'), /开始日期/);
  assert.throws(() => api.selectHistory(messages, '2026-02-30'), /有效的日期/);
});

test('单聊和群聊按日期拆分，附件仅随对应分段导出，文件不含设置和其他聊天', async t => {
  for (const isGroup of [false, true]) {
    const { api, db } = await fixture(t);
    await db.videoAttachments.bulkPut([video(), video('unrelated')]);
    const original = chat('source', [message(1, '不选'), message(2, '照片', { type: 'image', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } }] }),
      message(2, '语音', { audioData: 'data:audio/webm;base64,AQID', timestamp: stamp(2) + 1 }),
      message(3, '视频', { video: { mediaId: 'v' } }), message(4, '不选')], { isGroup, members: [{ id: 'actor', originalName: '林' }] });
    const plan = await api.planExport(original, { start: '2026-11-02', end: '2026-11-03', partBytes: 2400 });
    assert.ok(plan.parts.length > 1); assert.equal(plan.totalMessages, 3);
    const files = [];
    for (let i = 0; i < plan.parts.length; i++) files.push(await api.makePart(plan, i));
    assert.equal(files.flatMap(p => p.messages).length, 3);
    assert.deepEqual(files.flatMap(p => p.videoAttachments).map(m => m.id), ['v']);
    for (const file of files) { api.normalize(file); assert.equal(file.source.isGroup, isGroup); assert.doesNotMatch(JSON.stringify(file), /keep-private|keep-persona|keep-memory|unrelated/); }
    assert.equal(files.flatMap(p => p.messages).find(m => m.audioData).audioData, 'data:audio/webm;base64,AQID');
  }
});

test('一条大媒体消息单独成份且内容完整；单份内共用视频不重复储存', async t => {
  const { api, db } = await fixture(t); await db.videoAttachments.put(video());
  const messages = [message(1, 'x'.repeat(20000)), message(2, 'video1', { video: { mediaId: 'v' } }), message(3, 'video2', { video: { mediaId: 'v' } })];
  const plan = await api.planExport(chat('source', messages), { partBytes: 3000 });
  assert.equal(plan.parts.length, 2); assert.equal((await api.makePart(plan, 0)).messages[0].content.length, 20000);
  assert.equal((await api.makePart(plan, 1)).videoAttachments.length, 1);
});

test('默认大小处理超过 12 MB 的记录，实际序列化文件按上限拆分且无遗漏', async t => {
  const { api } = await fixture(t);
  const history = Array.from({ length: 4000 }, (_, i) => message(1, 'x'.repeat(4096), { timestamp: stamp(1) + i }));
  const plan = await api.planExport(chat('large', history));
  assert.ok(plan.parts.length > 1);
  let count = 0;
  for (let i = 0; i < plan.parts.length; i++) {
    const part = await api.makePart(plan, i);
    const bytes = Buffer.byteLength(JSON.stringify(part));
    assert.ok(bytes <= 12 * 1024 * 1024); count += part.messages.length;
  }
  assert.equal(count, history.length);
});

test('乱序逐份恢复再重复导入：不丢本地消息、不改设置、附件仍可按新编号读取', async t => {
  const local = message(5, '本地新消息');
  const { api, state, db } = await fixture(t, chat('target', [local]));
  const original = chat('source', [message(1, '相片', { imageUrl: 'data:image/png;base64,AQID' }), message(2, '语音', { audioData: 'data:audio/webm;base64,AQID' }), message(3, '视频', { video: { mediaId: 'v' } })]);
  await db.videoAttachments.put(video());
  const plan = await api.planExport(original, { partBytes: 2200 });
  const parts = [];
  for (let i = 0; i < plan.parts.length; i++) parts.push(clone(await api.makePart(plan, i)));
  for (const part of [...parts].reverse()) await api.importData('target', part);
  assert.equal(state.chats.target.history.length, 4);
  assert.deepEqual(state.chats.target.history.map(m => m.timestamp), [stamp(1), stamp(2), stamp(3), stamp(5)]);
  assert.deepEqual(state.chats.target.settings, { apiKey: 'keep-private', aiPersona: 'keep-persona' });
  assert.deepEqual(state.chats.target.longTermMemory, ['keep-memory']);
  const importedVideo = state.chats.target.history.find(m => m.video);
  const row = await db.videoAttachments.get(importedVideo.video.mediaId);
  assert.equal(row.dataUrl, video().dataUrl); assert.equal(row.chatId, 'target');
  const mediaCount = await db.videoAttachments.count();
  for (const part of parts) assert.equal((await api.importData('target', part)).added, 0);
  assert.equal((await db.chats.get('target')).history.length, 4); assert.equal(await db.videoAttachments.count(), mediaCount);
});

test('重复判定保留同一毫秒不同内容和文件内真正重复的多条；已有消息不会被导入改写', async t => {
  const { api } = await fixture(t, chat('target', [message(1, '同一条')]));
  const result = await api.importData('target', payload([message(1, '同一条'), message(1, '另一条'), message(1, '另一条')]));
  assert.equal(result.added, 2); assert.equal(result.skipped, 1);
  assert.equal((await api.importData('target', payload([message(1, '同一条'), message(1, '另一条'), message(1, '另一条')]))).added, 0);
});

test('迁移后重新导出的备份可导回原聊天，不因发言者或视频编号变化重复', async t => {
  const first = chat('source', [message(1, '视频', { role: 'assistant', senderId: 'source', video: { mediaId: 'v' } })]);
  const { api, db } = await fixture(t, first);
  await db.videoAttachments.put(video()); await db.chats.put(chat('second'));
  const partA = await api.makePart(await api.planExport(first), 0);
  await api.importData('second', clone(partA));
  const second = await db.chats.get('second');
  const partB = await api.makePart(await api.planExport(second), 0);
  assert.equal((await api.importData('source', clone(partB))).added, 0);
  assert.equal((await db.chats.get('source')).history.length, 1);
});

test('旧单聊／群聊 JSON 备份可合并，保留当前成员；跨类型导入拒绝且不写入', async t => {
  const { api, db } = await fixture(t);
  const old = { type: 'EPhoneSingleChat', version: 1, chatData: chat('source', [message(1)]) };
  assert.equal((await api.importData('target', old)).added, 1);
  const before = await db.chats.get('target');
  await assert.rejects(api.importData('target', { ...old, chatData: { ...old.chatData, isGroup: true } }), /群聊/);
  assert.deepEqual(await db.chats.get('target'), before);
  const group = chat('group', [], { isGroup: true, members: [{ id: 'collision', originalName: '另一个人' }] });
  await db.chats.put(group);
  const groupData = payload([message(1, '历史发言', { role: 'assistant', senderId: 'collision', senderName: '原成员' })],
    { source: { id: 'foreign-group', name: '旧群', isGroup: true, members: [{ id: 'collision', originalName: '原成员' }] } });
  await api.importData('group', groupData);
  const restored = await db.chats.get('group');
  assert.deepEqual(restored.members, group.members); assert.equal(restored.history[0].senderName, '原成员'); assert.notEqual(restored.history[0].senderId, 'collision');
  assert.equal((await api.importData('group', groupData)).added, 0);
});

test('磁盘保存失败时消息和视频一起回滚，内存保持原样，重试可成功', async t => {
  const { api, state, db } = await fixture(t, chat('target', [message(5, '保留')]));
  const data = payload([message(1, '视频', { video: { mediaId: 'v' } })], { videoAttachments: [video()] });
  const before = clone(state.chats.target);
  const fail = () => { throw new Error('模拟磁盘空间不足'); };
  db.chats.hook('updating', fail);
  await assert.rejects(api.importData('target', data), /空间不足/);
  assert.equal(await db.videoAttachments.count(), 0);
  assert.deepEqual(await db.chats.get('target'), before); assert.deepEqual(state.chats.target, before);
  db.chats.hook('updating').unsubscribe(fail);
  assert.equal((await api.importData('target', data)).added, 1);
});

test('写入时读取最新聊天，保留预览之后新增的记录', async t => {
  const { api, state, db } = await fixture(t);
  const data = payload([message(1)]); await api.mergePlan(state.chats.target, data);
  const latest = await db.chats.get('target'); latest.history.push(message(5, '预览后新消息')); latest.settings.theme = 'new'; await db.chats.put(latest);
  await api.importData('target', data);
  assert.equal(state.chats.target.history.length, 2); assert.equal(state.chats.target.settings.theme, 'new');
});

test('缺失附件、坏文件、非法媒体和未知版本在保存前拒绝', async t => {
  const { api, db } = await fixture(t);
  await assert.rejects(api.planExport(chat('s', [message(1, '', { video: { mediaId: 'missing' } })])), /缺失/);
  for (const data of [{}, payload([], { version: 99 }), payload([message(1, '', { video: { mediaId: 'missing' } })]), payload([], { videoAttachments: [{ id: 'v', url: 'javascript:alert(1)' }] })]) {
    await assert.rejects(api.importData('target', data));
  }
  assert.equal((await db.chats.get('target')).history.length, 0); assert.equal(await db.videoAttachments.count(), 0);
});

if (process.env.HISTORY_DOWNLOADED_BACKUP) test('浏览器实际下载的 JSON 文件可恢复全部记录和附件，并重复导入去重', async t => {
  const data = JSON.parse(fs.readFileSync(process.env.HISTORY_DOWNLOADED_BACKUP, 'utf8'));
  const { api, db } = await fixture(t);
  const result = await api.importData('target', data);
  assert.equal(result.added, data.messages.length);
  assert.equal((await api.importData('target', data)).added, 0);
  const target = await db.chats.get('target');
  assert.equal(target.history.length, data.messages.length);
  assert.ok(target.history.some(m => m.imageUrl)); assert.ok(target.history.some(m => m.audioData));
  const restored = target.history.find(m => m.video);
  assert.equal((await db.videoAttachments.get(restored.video.mediaId)).dataUrl, data.videoAttachments[0].dataUrl);
});
