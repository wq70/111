const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dep = name => require(process.env.SMS_TEST_DEPS ? path.join(process.env.SMS_TEST_DEPS, name) : name);
const Dexie = dep('dexie');
const { IDBFactory, IDBKeyRange } = dep('fake-indexeddb');
const source = fs.readFileSync(path.join(__dirname, '../modules/sms/core.js'), 'utf8');

async function fixture(t, enabled = true) {
  const db = new Dexie('sms-test', { indexedDB: new IDBFactory(), IDBKeyRange });
  db.version(1).stores({ smsSettings:'&id',smsContacts:'&id,&number,chatId,updatedAt',smsMessages:'&id,contactId,timestamp,batchId',smsMemories:'&id,contactId,createdAt',smsJobs:'&id,contactId,status,dueAt',chats:'&id' });
  await db.open(); t.after(() => db.close());
  const requests = [], state = { apiConfig:{proxyUrl:'https://api.example.test/v1',apiKey:'test-only',model:'test'},globalSettings:{},qzoneSettings:{nickname:'我'},chats:{a:{id:'a',name:'同名甲',originalName:'杰克',settings:{aiPersona:'甲的人设'},relationship:{status:'blocked_by_ai'},history:[{role:'user',content:'QQ里的秘密',timestamp:1}]},b:{id:'b',name:'同名乙',originalName:'杰克',settings:{aiPersona:'乙的人设'},history:[]}} };
  const sandbox = { console,Date,Math,JSON,Set,Map,DOMException,AbortController,CustomEvent,db,state,window:{crypto:require('node:crypto').webcrypto,dispatchEvent(){}},getMemoryContextForPromptAsync:async()=> '结构化或向量角色记忆',
    getGeminiResponseText:d=>d.choices?.[0]?.message?.content,
    fetch:async(url,init)=>{requests.push({url,body:JSON.parse(init.body),signal:init.signal});return{ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({action:'reply',read:true,messages:[{text:'收到你的信息。'}]})}}]})};} };
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  const api=sandbox.window.SmsEngine;if(enabled)await api.saveSettings({enabled:true});
  const c=await api.contactForChat('a',true);
  return { db,api,c,state,sandbox,requests };
}
const answer = value => ({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(value)}}]})});

test('默认关闭：QQ 请求不增加短信片段，不读取聊天或记忆、不调用 API',async t=>{
  const {api,state,sandbox,requests}=await fixture(t,false);
  Object.defineProperty(state.chats.a,'history',{get(){throw Error('不应读取历史');}});
  sandbox.getMemoryContextForPromptAsync=()=>{throw Error('不应读取记忆');};
  assert.equal(await api.qqContext(state.chats.a),'');assert.equal(requests.length,0);
});
test('同名角色各有稳定号码，交换前不出现在已获得的联系人中',async t=>{
  const {api,c}=await fixture(t);const b=await api.contactForChat('b');
  assert.notEqual(c.number,b.number);assert.match(b.number,/^1\d{10}$/);assert.equal(b.known,false);
  assert.equal((await api.contactForChat('b')).number,b.number);
  await assert.rejects(api.send(b.id,'你好'),/获得/);
});
test('发送消息不调用 API；批量手动回复包含人设、短期上下文和记忆',async t=>{
  const {api,c,requests}=await fixture(t);await api.send(c.id,'第一句');await api.send(c.id,'第二句');
  assert.equal(requests.length,0);await api.reply(c.id);
  assert.equal(requests.length,1);assert.equal(requests[0].url,'https://api.example.test/v1/chat/completions');
  const body=JSON.stringify(requests[0].body);for(const s of ['第一句','第二句','甲的人设','QQ里的秘密','结构化或向量角色记忆'])assert.ok(body.includes(s));
  const rows=await api.messagesOf(c.id);assert.equal(rows.filter(m=>m.direction==='incoming').length,1);assert.ok(rows.filter(m=>m.direction==='outgoing').every(m=>m.handled));
});
test('四种互通方向精确控制近期记录与共享记忆',async t=>{
  const {api,c,state}=await fixture(t);await api.addMessage(c.id,{content:'短信里的秘密'});
  for(const [bridge,inbound,outbound] of [['both',true,true],['qq-to-sms',true,false],['sms-to-qq',false,true],['none',false,false]]){
    await api.patchContact(c.id,{options:{bridge}});
    const fresh=await api.contactForChat('a'),ctx=await api.buildContext(fresh,await api.options(fresh),[]),qq=await api.qqContext(state.chats.a);
    assert.equal(ctx.qq.length>0,inbound);assert.equal(ctx.roleMemories.length>0,inbound);assert.equal(qq.includes('短信里的秘密'),outbound);
  }
});
test('独立和关闭长期记忆不会泄露共享角色记忆，关闭时不参考短信记忆',async t=>{
  const {api,c,db}=await fixture(t);await db.smsMemories.add({id:'m',contactId:c.id,content:'短信独有记忆',createdAt:1});
  for(const memoryMode of ['independent','off']){await api.patchContact(c.id,{options:{memoryMode}});const fresh=await db.smsContacts.get(c.id),ctx=await api.buildContext(fresh,await api.options(fresh),[]);assert.equal(ctx.roleMemories,'');assert.equal(ctx.smsMemories.length,memoryMode==='off'?0:1);}
});
test('自定义提示词支持补充、替换和变量，替换风格仍保留身份与收发协议',async t=>{
  const {api,c,db,requests}=await fixture(t);await api.patchContact(c.id,{options:{promptMode:'replace',customPrompt:'{{角色名}}用短句。用户：{{用户}}，号码{{号码}}。'}});
  await api.send(c.id,'你好');await api.reply(c.id);const system=requests[0].body.messages[0].content;
  assert.ok(system.includes('杰克用短句'));assert.ok(system.includes(c.number));assert.ok(!system.includes(api.DEFAULT_PROMPT));assert.ok(system.includes('只输出 JSON'));assert.ok(JSON.stringify(requests[0].body).includes('甲的人设'));
});
test('请求失败与无效格式保留待回复信息，允许重试',async t=>{
  const {api,c,sandbox,db}=await fixture(t);await api.send(c.id,'保留这句');
  sandbox.fetch=async()=>{throw Error('断网');};await assert.rejects(api.reply(c.id),/断网/);
  assert.equal((await api.messagesOf(c.id))[0].handled,false);assert.equal((await db.smsContacts.get(c.id)).lease,null);
  sandbox.fetch=async()=>answer({action:'reply',messages:[]});await assert.rejects(api.reply(c.id),/正文为空/);assert.equal((await api.messagesOf(c.id)).length,1);
  sandbox.fetch=async()=>answer({action:'reply',messages:[{text:'恢复了'}]});await api.reply(c.id);assert.equal((await api.messagesOf(c.id)).length,2);
});
test('生成中继续发送：只标记本次请求包含的消息，不吞掉新消息',async t=>{
  const {api,c,sandbox}=await fixture(t);await api.send(c.id,'旧句');let release,started;
  const ready=new Promise(r=>started=r);sandbox.fetch=async()=>{started();return new Promise(r=>release=r);};
  const pending=api.reply(c.id);await ready;await api.send(c.id,'生成时的新句');release(answer({action:'reply',messages:[{text:'回复旧句'}]}));await pending;
  const rows=await api.messagesOf(c.id);assert.equal(rows.find(m=>m.content==='旧句').handled,true);assert.equal(rows.find(m=>m.content==='生成时的新句').handled,false);
});
test('数据库请求锁阻止重复调用，关闭开关后不写入飞行中的结果',async t=>{
  const {api,c,sandbox}=await fixture(t);await api.send(c.id,'测试');let release,started;const ready=new Promise(r=>started=r);
  sandbox.fetch=async()=>{started();return new Promise(r=>release=r);};const pending=api.reply(c.id);await ready;
  await assert.rejects(api.reply(c.id),/正在处理/);await api.saveSettings({enabled:false});release(answer({action:'reply',messages:[{text:'不应写入'}]}));await assert.rejects(pending,/状态已改变/);
  assert.equal((await api.messagesOf(c.id)).length,1);
});
test('停止请求保留待回复内容，不出现虚构来信',async t=>{
  const {api,c,sandbox}=await fixture(t);await api.send(c.id,'停止测试');const ctl=new AbortController();
  sandbox.fetch=async()=>{ctl.abort();return answer({action:'reply',messages:[{text:'不要写入'}]});};await assert.rejects(api.reply(c.id,{signal:ctl.signal}),e=>e.name==='AbortError');assert.equal((await api.messagesOf(c.id)).length,1);
});
test('延迟回复只保存一次模型结果，时间到达后幂等投递，关闭时暂停',async t=>{
  const {api,c,sandbox,db}=await fixture(t);await api.send(c.id,'晚点回');let count=0;sandbox.fetch=async()=>{count++;return answer({action:'defer',delayMinutes:30,messages:[{text:'迟来的回复'}]});};await api.reply(c.id);
  assert.equal((await api.messagesOf(c.id)).length,1);const job=(await db.smsJobs.toArray())[0];await db.smsJobs.update(job.id,{dueAt:0});await api.saveSettings({enabled:false});await api.deliverDue();assert.equal((await api.messagesOf(c.id)).length,1);
  await api.saveSettings({enabled:true});await Promise.all([api.deliverDue(),api.deliverDue()]);assert.equal((await api.messagesOf(c.id)).length,2);assert.equal(count,1);
});
test('QQ 拉黑不拦截短信；短信拒收保持已发送，不再调用模型或解除QQ拉黑',async t=>{
  const {api,c,sandbox,state,requests}=await fixture(t);await api.send(c.id,'QQ拉黑后短信');await api.reply(c.id);assert.equal(state.chats.a.relationship.status,'blocked_by_ai');
  sandbox.fetch=async()=>answer({action:'block',messages:[],read:true});await api.send(c.id,'另一句');await api.reply(c.id);
  await api.send(c.id,'后续短信');const before=requests.length;const result=await api.reply(c.id);assert.equal(result.action,'undelivered');assert.equal(requests.length,before);assert.equal((await api.messagesOf(c.id)).at(-1).status,'sent');
});
test('用户阻止联系人后不再调用回复API，待送达任务取消',async t=>{
  const {api,c,db,requests}=await fixture(t);await api.send(c.id,'你好');await api.patchContact(c.id,{blocked:true});await assert.rejects(api.reply(c.id),/阻止/);assert.equal(requests.length,0);
  await db.smsJobs.add({id:'blockedjob',contactId:c.id,status:'pending',kind:'deliver',dueAt:0,parts:[{text:'不应送达'}]});await api.deliverDue();assert.equal((await db.smsJobs.get('blockedjob')).status,'cancelled');
});
test('陌生人固定档案只获知公开身份，不读取任何QQ秘密',async t=>{
  const {api,sandbox,requests,db}=await fixture(t);sandbox.fetch=async(url,init)=>{requests.push(JSON.parse(init.body));return answer({name:'林间',persona:'书店店员，言语慢热',scenario:'发错号码',content:'请问书到了吗？'});};
  const c=await api.encounter({scenario:'日常偶遇'});assert.equal(c.saved,false);assert.equal(c.chatId,undefined);assert.equal((await db.smsContacts.get(c.id)).persona,'书店店员，言语慢热');assert.ok(!JSON.stringify(requests).includes('QQ里的秘密'));
});
test('总结保留消息来源，重复总结不再调用API；关闭写回时QQ不读取短信记忆',async t=>{
  const {api,c,sandbox,db,state}=await fixture(t);await api.send(c.id,'周六去书店');let count=0;sandbox.fetch=async()=>{count++;return answer({memories:['约定周六去书店']});};await api.summarize(c.id);assert.equal((await db.smsMemories.toArray())[0].sourceIds.length,1);
  await assert.rejects(api.summarize(c.id),/已整理过/);assert.equal(count,1);await api.patchContact(c.id,{options:{writeMemory:false,qqContextLimit:0}});assert.ok(!(await api.qqContext(state.chats.a)).includes('约定周六去书店'));
});
test('完整导入导出保留号码、独立记忆与照片草稿，清除请求锁',async t=>{
  const {api,c,db}=await fixture(t);await api.patchContact(c.id,{draft:'未发送',draftImage:'data:image/jpeg;base64,YQ==',lease:{id:'old',until:Date.now()+100000}});await db.smsMemories.add({id:'memory',contactId:c.id,content:'记住我',createdAt:1});
  const backup=await api.exportData();await db.smsContacts.clear();await db.smsMemories.clear();await api.importData(backup);const restored=await db.smsContacts.get(c.id);assert.equal(restored.number,c.number);assert.equal(restored.draft,'未发送');assert.ok(!restored.lease);assert.equal((await api.memoriesOf(c.id)).length,1);
});

test('短信独立API配置不完整时禁止借用全局密钥；兼容完整接口地址',async t=>{
  const {api,c,requests}=await fixture(t);await api.send(c.id,'独立API');
  await api.patchContact(c.id,{options:{apiSource:'custom',apiConfig:{proxyUrl:'https://other.example.test/v1'}}});
  await assert.rejects(api.reply(c.id),/填写地址、密钥和模型/);assert.equal(requests.length,0);
  await api.patchContact(c.id,{options:{apiSource:'custom',apiConfig:{proxyUrl:'https://other.example.test/v1/chat/completions',apiKey:'independent-key',model:'independent-model'}}});
  await api.reply(c.id);assert.equal(requests[0].url,'https://other.example.test/v1/chat/completions');assert.equal(requests[0].body.model,'independent-model');
});
test('陌生人加入QQ后保留原号码、会话和长期记忆，不另造联系人',async t=>{
  const {api,db}=await fixture(t);const stranger={id:'stranger',number:'13900000001',name:'林间',persona:'原始人设',known:true,qqOffered:true,options:{}};
  await db.smsContacts.add(stranger);
  await api.addMessage(stranger.id,{content:'之前聊过'});await db.smsMemories.add({id:'m',contactId:stranger.id,content:'之前的约定',createdAt:1});
  const chat=await api.createQQContact(stranger.id);assert.equal(chat.status.isBusy,false);assert.deepEqual(Array.from(chat.thoughtsHistory),[]);assert.equal(chat.settings.aiPersona,'原始人设');
  const resolved=await api.contactForChat(chat.id);assert.equal(resolved.id,stranger.id);assert.equal(resolved.number,stranger.number);
  const ctx=await api.qqContext(chat);assert.ok(ctx.includes('之前聊过'));assert.ok(ctx.includes('之前的约定'));
  assert.equal((await api.createQQContact(stranger.id)).id,chat.id);assert.equal((await db.chats.toArray()).length,1);
});
test('引用不能跨联系人；照片输入校验并保存，收到的角色回复没有伪造附图',async t=>{
  const {api,c}=await fixture(t);const b=await api.contactForChat('b',true),foreign=await api.addMessage(b.id,{content:'乙的私聊'});
  const msg=await api.send(c.id,'照片','data:image/jpeg;base64,YQ==',foreign.id);assert.equal(msg.quoteId,'');assert.equal(msg.image,'data:image/jpeg;base64,YQ==');
  await assert.rejects(api.send(c.id,'','https://untrusted.example.test/photo.jpg'),/格式无效/);
});
test('未打开APP时也能处理主动来信；同一天遵守次数上限',async t=>{
  const {api,c,sandbox,requests,db}=await fixture(t);
  sandbox.document={hidden:false,querySelectorAll:()=>[]};sandbox.setTimeout=setTimeout;sandbox.clearTimeout=clearTimeout;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../modules/sms/app.js'),'utf8'),sandbox);
  await api.saveSettings({proactive:true,quietStart:'00:00',quietEnd:'00:00',dailyLimit:1});
  await sandbox.window.SmsApp.backgroundTick();assert.equal(requests.length,1);
  await db.smsSettings.update('main',{nextAutoAt:0});await sandbox.window.SmsApp.backgroundTick();assert.equal(requests.length,1);
});
test('恢复未完成请求后，迟到的旧回复和旧记忆结果都不能落库',async t=>{
  const {api,c,sandbox,db}=await fixture(t);await api.send(c.id,'需要恢复');
  for(const method of ['reply','summarize']){
    let release,started;const ready=new Promise(r=>started=r);sandbox.fetch=async()=>{started();return new Promise(r=>release=r);};
    const pending=api[method](c.id);await ready;await api.recoverRequest(c.id);release(answer(method==='reply'?{action:'reply',messages:[{text:'迟到回复'}]}:{memories:['迟到记忆']}));
    await assert.rejects(pending,/状态已改变|已失效/);
  }
  assert.equal((await api.messagesOf(c.id)).length,1);assert.equal((await db.smsMemories.toArray()).length,0);
});
