const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../modules/social/douban/transfer.js'), 'utf8');
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const post = (title = '一篇帖子', extra = {}) => ({ id: 1, timestamp: 1000, postTitle: title, content: '正文\n第二行',
  authorName: '林', groupName: '日常', comments: [{ commenter: '我', text: '旧评论' }], ...extra });
const options = extra => ({ posts: true, comments: true, postIndices: [0], mode: 'merge', ...extra });
const payload = data => ({ type: 'ephone-douban', version: 1, data });

function fixture(initial = {}) {
  let stores = Object.fromEntries(['doubanPosts', 'globalSettings', 'chats', 'personaPresets', 'worldBooks'].map(key => [key, copy(initial[key] || [])]));
  const fail = new Set();
  const db = Object.fromEntries(Object.keys(stores).map(key => [key, {
    async toArray() { return copy(stores[key]); },
    orderBy() { return { reverse: () => ({ toArray: async () => copy(stores[key]).sort((a,b) => b.timestamp-a.timestamp) }) }; },
    async clear() { stores[key] = []; },
    async add(value) {
      if (fail.has(key)) throw new Error('模拟磁盘写入失败');
      const id = value.id ?? Math.max(0, ...stores[key].map(row => typeof row.id === 'number' ? row.id : 0)) + 1;
      if (stores[key].some(row => row.id === id)) throw new Error('主键冲突');
      stores[key].push(copy({ ...value, id })); return id;
    },
    async put(value) {
      if (fail.has(key)) throw new Error('模拟磁盘写入失败');
      stores[key] = stores[key].filter(row => row.id !== value.id); stores[key].push(copy(value)); return value.id;
    }
  }]));
  db.transaction = async (_mode, _tables, callback) => {
    const backup = copy(stores);
    try { return await callback(); } catch (error) { stores = backup; throw error; }
  };
  const s = { currentScreen: 'douban-screen', globalSettings: { id: 'global', theme: 'keep', ...(initial.settings || {}) },
    qzoneSettings: { nickname: '我' }, chats: Object.fromEntries((initial.chats || []).map(chat => [chat.id, copy(chat)])),
    worldBooks: copy(initial.worldBooks || []), personaPresets: copy(initial.personaPresets || []) };
  const context = vm.createContext({ state: s, db, crypto: { randomUUID }, console,
    document: { addEventListener() {} }, window: {}, setTimeout });
  vm.runInContext(source, context);
  return { api: context.window.DoubanTransfer, s, fail, rows: key => copy(stores[key]) };
}

test('选择性导出只包含勾选类别与帖子，可排除评论；基本人设不携带历史和密钥', async () => {
  const f = fixture({ doubanPosts: [post('第一篇'), post('第二篇', {id:2,timestamp:2000})],
    chats: [{id:'a',name:'林',originalName:'林',history:[{content:'私人聊天'}],settings:{aiPersona:'人设',apiKey:'密钥'}}],
    settings: { apiKey:'其他密钥', doubanActiveCharacterIds:['a'],customDoubanGroups:[{name:'小组',prompt:'提示词',enabled:true}] } });
  const all = await f.api.collect();
  const selected = f.api.selectData(all, options({comments:false,postIndices:[1]}));
  assert.equal(selected.data.posts.length, 1);
  assert.equal(selected.data.posts[0].postTitle, '第一篇');
  assert.equal(selected.data.posts[0].comments.length, 0);
  assert.deepEqual(Object.keys(selected.data), ['posts']);
  const resource = f.api.selectData(all, options({posts:false,resources:true}));
  assert.equal(resource.data.resources.characters[0].settings.aiPersona, '人设');
  assert.doesNotMatch(JSON.stringify(resource), /私人聊天|密钥|history|apiKey/);
});

test('跨设备编号重合时追加新帖子，保留本地帖子；重复导入不会增加副本', async () => {
  const f = fixture({ doubanPosts:[post('本地已有')] });
  const backup = payload({posts:[post('外部帖子',{authorId:'foreign',comments:[{commenter:'林',commenterId:'foreign',text:'你好'}]})]});
  const first = await f.api.importData(backup, options());
  assert.equal(first.added, 1);
  assert.deepEqual(f.rows('doubanPosts').map(p=>p.postTitle), ['本地已有','外部帖子']);
  assert.equal(f.rows('doubanPosts')[1].id, 2);
  assert.equal(f.rows('doubanPosts')[1].authorId, undefined);
  assert.equal(f.rows('doubanPosts')[1].comments[0].commenterId, undefined);
  const second = await f.api.importData(backup, options());
  assert.equal(second.skipped, 1);
  assert.equal(f.rows('doubanPosts').length, 2);
});

test('只选一篇帖子时，不携带未选帖子的非参与角色资料', async () => {
  const f = fixture({doubanPosts:[post('选中',{authorId:'a'}),post('不选',{id:2,timestamp:2000,authorId:'b',authorName:'另一位'})],
    chats:[{id:'a',name:'林',settings:{aiPersona:'选中人设'}},{id:'b',name:'另一位',settings:{aiPersona:'不应导出的人设'}}]});
  const data = await f.api.collect();
  const selected = f.api.selectData(data,options({postIndices:[1],resources:true}));
  assert.equal(selected.data.resources.characters.length,1);
  assert.doesNotMatch(JSON.stringify(selected),/不应导出的人设/);
});

test('自己导出再导入保持已有评论，新增评论只补充一次', async () => {
  const f = fixture({doubanPosts:[post()]});
  const exported = f.api.selectData(await f.api.collect(), options());
  const before = f.rows('doubanPosts');
  await f.api.importData(exported, options());
  assert.deepEqual(f.rows('doubanPosts'), before);
  exported.data.posts[0].comments.push({commenter:'林',text:'新评论'});
  const result = await f.api.importData(exported, options());
  assert.equal(result.merged, 1);
  await f.api.importData(exported, options());
  assert.deepEqual(f.rows('doubanPosts')[0].comments.map(c=>c.text), ['旧评论','新评论']);
});

test('仅导入小组不触及帖子、身份或其他全局设置；重复的小组去重', async () => {
  const group = {name:'旧组',prompt:'旧提示词',enabled:true};
  const f = fixture({doubanPosts:[post()],settings:{customDoubanGroups:[group],doubanUserNickname:'本地昵称'}});
  const backup = payload({groups:[group,{name:'新组',prompt:'新提示词',enabled:false}],profile:{doubanUserNickname:'外部昵称'}});
  await f.api.importData(backup,options({posts:false,groups:true}));
  assert.deepEqual(copy(f.s.globalSettings.customDoubanGroups).map(g=>g.name), ['旧组','新组']);
  assert.equal(f.s.globalSettings.doubanUserNickname,'本地昵称');
  assert.equal(f.s.globalSettings.theme,'keep');
  assert.deepEqual(f.rows('doubanPosts'),[post()]);
});

test('合并保留已有身份和偏好，覆盖恢复仅替换勾选的范围与所选帖子', async () => {
  const f = fixture({doubanPosts:[post('已有')],settings:{doubanUserNickname:'本地昵称',doubanMinPosts:5,customDoubanGroups:[{name:'保留组'}]}});
  const backup = payload({posts:[post('恢复A'),post('恢复B',{timestamp:2000})],profile:{doubanUserNickname:'备份昵称'},preferences:{doubanMinPosts:12,doubanMaxPosts:20,npcAvatars:[]}});
  await f.api.importData(backup,options({posts:false,profile:true,preferences:true}));
  assert.equal(f.s.globalSettings.doubanUserNickname,'本地昵称');
  assert.equal(f.s.globalSettings.doubanMinPosts,5);
  await f.api.importData(backup,options({mode:'replace',profile:true,comments:false,postIndices:[1]}));
  assert.equal(f.s.globalSettings.doubanUserNickname,'备份昵称');
  assert.equal(f.s.globalSettings.doubanMinPosts,5);
  assert.deepEqual(copy(f.s.globalSettings.customDoubanGroups),[{name:'保留组'}]);
  assert.deepEqual(f.rows('doubanPosts').map(p=>p.postTitle),['恢复B']);
  assert.deepEqual(f.rows('doubanPosts')[0].comments,[]);
});

test('损坏、错误版本、错误类型与缺失正文在任何写入前被拒绝', async () => {
  const f = fixture({doubanPosts:[post()]});
  for (const backup of [{}, {...payload({posts:[]}),version:2},payload({posts:[{content:'损坏'}]}),payload({posts:'错误'}),
    payload({profile:{doubanUserNickname:{bad:true}}}),payload({preferences:{doubanMinPosts:-1}}),payload({resources:{characters:[],personas:[],worldBooks:[{id:1,name:'损坏',content:[null]}]}})]) {
    await assert.rejects(f.api.importData(backup,options({mode:'replace',profile:true,preferences:true,resources:true})));
    assert.deepEqual(f.rows('doubanPosts'),[post()]);
  }
});

test('覆盖恢复期间写入失败会回滚清空、资源和设置，内存状态同步保持原样', async () => {
  const f = fixture({doubanPosts:[post()], settings:{doubanUserNickname:'原名'}});
  const snapshot = copy(f.s);
  f.fail.add('globalSettings');
  const backup = payload({posts:[post('新帖')],profile:{doubanUserNickname:'新名'},resources:{characters:[{id:'a',name:'新角色',settings:{aiPersona:'人设'}}],personas:[],worldBooks:[]}});
  await assert.rejects(f.api.importData(backup,options({mode:'replace',profile:true,resources:true})),/写入失败/);
  assert.deepEqual(f.rows('doubanPosts'),[post()]);
  assert.deepEqual(f.rows('chats'),[]);
  assert.deepEqual(copy(f.s),snapshot);
});

test('关联资料不按外部编号覆盖同名异人，重映射关联且重复导入复用相同资料', async () => {
  const f = fixture({chats:[{id:'foreign',name:'林',originalName:'林',history:[{content:'保留'}],settings:{aiPersona:'本地不同人设'}}],
    worldBooks:[{id:'book',name:'同名世界书',content:[{content:'本地内容'}]}]});
  const backup = payload({posts:[post('迁移帖子',{authorId:'foreign',comments:[{commenter:'林',commenterId:'foreign',text:'外部评论'}]})],
    resources:{characters:[{id:'foreign',name:'林',originalName:'林',settings:{aiPersona:'外部不同人设'},linkedWorldBookIds:['book']}],
      personas:[{id:1,name:'我的人设',persona:'读者'}],worldBooks:[{id:'book',name:'同名世界书',content:[{content:'外部内容'}]}]}});
  await f.api.importData(backup,options({resources:true}));
  const chats = f.rows('chats'); assert.equal(chats.length,2);
  assert.deepEqual(chats[0].history,[{content:'保留'}]);
  const imported = chats.find(c=>c.id!=='foreign');
  assert.deepEqual(imported.history,[]);
  assert.equal(f.rows('doubanPosts')[0].authorId,imported.id);
  assert.equal(f.rows('doubanPosts')[0].comments[0].commenterId,imported.id);
  assert.notEqual(imported.settings.linkedWorldBookIds[0],'book');
  assert.deepEqual(copy(f.s.globalSettings.doubanActiveCharacterIds),[imported.id]);
  await f.api.importData(backup,options({resources:true}));
  assert.equal(f.rows('chats').length,2);
  assert.equal(f.rows('worldBooks').length,2);
  assert.equal(f.rows('personaPresets').length,1);
});

test('导出与导入白名单排除全局凭证和额外表，保留标题中的字面文本', () => {
  const f = fixture();
  const backup = f.api.normalize(payload({posts:[post('<img src=x onerror=alert(1)>',{apiKey:'secret'})],
    profile:{doubanUserNickname:'小豆',apiKey:'secret'},preferences:{apiKey:'secret'},chats:[{history:'private'}]}));
  assert.doesNotMatch(JSON.stringify(backup),/secret|private/);
  assert.equal(backup.data.posts[0].postTitle,'<img src=x onerror=alert(1)>');
});
