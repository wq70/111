const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=', 'base64');
const pngUrl = 'data:image/png;base64,' + png.toString('base64');
function fixture(respond = () => Response.json({images:[png.toString('base64')]})) {
  const requests=[],store=new Map(),elements=new Map();
  const element=id=> {
    if (!elements.has(id)) elements.set(id,{value:'',checked:false,style:{},disabled:false,textContent:'',children:[],listeners:{},
      replaceChildren(){this.children=[];}, appendChild(v){this.children.push(v);}, addEventListener(type,fn){this.listeners[type]=fn;}});
    return elements.get(id);
  };
  const c={URL,URLSearchParams,Blob,Response,Uint8Array,DataView,TextDecoder,TextEncoder,AbortController,setTimeout,clearTimeout,atob,btoa,
    console:{log(){},warn(){},error(){}},state:{chats:{},apiConfig:{}},
    localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},
    document:{getElementById:element,createElement:()=>({})}, alert(){},
    db:{apiConfig:{get:async()=>({id:'main',model:'chat-model'}),put:async data=>{c.record=data;}},naiPresets:{get:async()=>null,toArray:async()=>[]}},
    fetch:async(url,options)=>{requests.push({url,options});return respond(url,options);},
    JSZip:{loadAsync:async bytes=> { assert.equal(bytes[0],80); assert.equal(bytes[1],75); return {files:{'image.png':{async:async()=>new Uint8Array(png)}}}; }}
  };
  c.window=c; vm.createContext(c);
  for(const file of ['novelai-connection.js','novelai-settings.js','nai-presets.js','generation-providers.js']) vm.runInContext(fs.readFileSync(path.join(root,'modules/media/image',file),'utf8'),c);
  c.currentNaiPresetId = null;
  c.NovelAISettings.load();
  element('novelai-model').value='nai-diffusion-4-5-full'; element('novelai-api-key').value='test-only-key';
  element('novelai-endpoint').value='https://relay.example/v1';
  return {c,api:c.NovelAIConnection,ui:c.NovelAISettings,requests,element,store};
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('基础、完整、查询参数和站点前缀正确解析，Key不进URL',()=>{
  const {api}=fixture();
  for(const [endpoint,extra,expected] of [
    ['https://image.novelai.net',{},'https://image.novelai.net/ai/generate-image'],
    ['https://nai.rinko.ai',{},'https://nai.rinko.ai/native/ai/generate-image'],
    ['https://nai.rinko.ai/native/',{},'https://nai.rinko.ai/native/ai/generate-image'],
    ['https://api.hamubox.com',{},'https://api.hamubox.com/v1/novelai/ai/generate-image'],
    ['https://api.taleapi.asia/v1',{},'https://api.taleapi.asia/v1/ai/generate-image'],
    ['https://relay.example/gateway?tenant=nai',{},'https://relay.example/gateway/ai/generate-image?tenant=nai'],
    ['https://relay.example/v1',{protocol:'images'},'https://relay.example/v1/images/generations'],
    ['https://relay.example/v1/images/generations?route=a',{},'https://relay.example/v1/images/generations?route=a'],
    ['https://relay.example/custom/draw?route=a',{address_mode:'full'},'https://relay.example/custom/draw?route=a'],
    ['https://relay.example/ai/generate-image-stream',{},'https://relay.example/ai/generate-image-stream']
  ]) assert.equal(api.resolve({endpoint,...extra}).url,expected);
  assert.throws(()=>api.resolve({endpoint:'file:///private'}),/HTTP/);
  assert.throws(()=>api.resolve({endpoint:'https://name:password@example.com'}),/用户名密码/);
});
test('模型列表地址独立解析，官网内置清单不伪装成拉取成功',async()=>{
  const {api,requests}=fixture();
  assert.equal(api.modelsUrl({endpoint:'https://nai.rinko.ai/native'}),'https://nai.rinko.ai/v1/models');
  assert.equal(api.modelsUrl({endpoint:'https://nai.rinko.ai/v1/nai/generate-image'}),'https://nai.rinko.ai/v1/models');
  assert.equal(api.modelsUrl({endpoint:'https://api.hamubox.com/v1/novelai'}),'https://api.hamubox.com/v1/models');
  assert.equal(api.modelsUrl({endpoint:'https://api.taleapi.asia/v1/ai/generate-image'}),'https://api.taleapi.asia/v1/models');
  assert.equal(api.modelsUrl({endpoint:'https://relay.example/anything',models_url:'https://relay.example/catalog?group=nai'}),'https://relay.example/catalog?group=nai');
  assert.throws(()=>api.modelsUrl({endpoint:'https://relay.example/draw',address_mode:'full'}),/模型列表地址/);
  assert.equal((await api.listModels({},'')).builtin,true); assert.equal(requests.length,0);
});
test('模型拉取兼容列表和别名，保留完整名称、去重、不生成图片、不自动重试',async()=>{
  const f=fixture(()=>Response.json({data:[{id:'[分组]nai-diffusion-4-5-full'},{id:'custom-name'},{id:'custom-name'},{id:'nai-diffusion-5-full-inpainting'}]}));
  const r=await f.api.listModels({endpoint:'https://relay.example/v1'},'test-only-key');
  assert.deepEqual(plain(r.models),['[分组]nai-diffusion-4-5-full','custom-name','nai-diffusion-5-full-inpainting']);
  assert.equal(f.requests.length,1); const request=f.requests[0];
  assert.equal(request.options.method,'GET'); assert.equal(request.options.headers.Authorization,'Bearer test-only-key');
  assert.equal(request.options.credentials,'omit'); assert.equal(request.options.cache,'no-store');
  assert.equal(request.options.redirect,'error'); assert.equal(request.options.body,undefined);
});
test('原生V3/V4.5/V5参数分支正确；别名手选版本，重绘型号明确拒绝',()=>{
  const {api}=fixture(), settings={resolution:'832x1216',seed:123,steps:23,cfg_scale:5};
  const v3=api.request(settings,'nai-diffusion-3','positive','negative');
  assert.equal(v3.body.parameters.v4_prompt,undefined); assert.equal(v3.body.parameters.noise_schedule,'native');
  for(const model of ['nai-diffusion-4-5-full','nai-diffusion-5-full','[中转]nai-diffusion-4-5-full']) {
    const r=api.request(settings,model,'positive','negative'); assert.equal(r.body.model,model);
    assert.equal(r.body.parameters.v4_prompt.caption.base_caption,'positive');
    assert.equal(r.body.parameters.v4_negative_prompt.caption.base_caption,'negative');
  }
  assert.throws(()=>api.request(settings,'custom-alias','p','n'),/模型版本/);
  assert.equal(api.request({...settings,model_family:'v5'},'custom-alias','p','n').body.model,'custom-alias');
  assert.throws(()=>api.request(settings,'nai-diffusion-5-full-inpainting','p','n'),/重绘专用/);
  assert.throws(()=>api.request({...settings,seed:9999999999},'nai-diffusion-3','p','n'),/种子/);
});
test('兼容模式别名可发送，已知站点按说明传NAI参数，未知站只传标准字段',()=>{
  const {api}=fixture(), settings={endpoint:'https://relay.example/v1',protocol:'images',seed:123};
  const r=api.request(settings,'custom-alias','positive','negative');
  assert.deepEqual(Object.keys(r.body).sort(),['model','n','prompt','response_format','size']);
  const rink=api.request({...settings,endpoint:'https://nai.rinko.ai/v1'},'nai-diffusion-5-full','p','n');
  assert.equal(rink.body.nai.negative_prompt,'n'); assert.equal(rink.body.nai.seed,123);
  const tale=api.request({...settings,endpoint:'https://api.taleapi.asia/v1'},'nai-diffusion-4-5-full','p','n');
  assert.equal(tale.body.negative_prompt,'n');
});
test('旧官网代理继续使用，第三方默认直连，主动启用代理才转发',()=>{
  const {api}=fixture(), settings={cors_proxy:'https://corsproxy.io/?'};
  assert.equal(api.proxyUrl(api.resolve(settings).url,settings),'https://corsproxy.io/?https%3A%2F%2Fimage.novelai.net%2Fai%2Fgenerate-image');
  const custom={...settings,endpoint:'https://relay.example/v1'};
  assert.equal(api.proxyUrl(api.resolve(custom).url,custom),'https://relay.example/v1/ai/generate-image');
  assert.ok(api.proxyUrl(api.resolve(custom).url,{...custom,proxy_scope:'always'}).startsWith('https://corsproxy.io/?'));
});
test('JSON Base64、URL、官方images对象和Rinko images字符串都可解析',async()=>{
  const {api}=fixture();
  for(const data of [{data:[{b64_json:png.toString('base64')}]},{images:[png.toString('base64')]},{images:[{image:png.toString('base64')}]},{data:[{url:pngUrl}]}])
    assert.equal(await api.parseResponse(Response.json(data),{stream:false}),pngUrl);
  assert.equal(await api.parseResponse(Response.json({data:[{url:'https://images.example/output.png'}]}),{}),'https://images.example/output.png');
  await assert.rejects(api.parseResponse(Response.json({data:[{url:'javascript:alert(1)'}]}),{}));
});
test('直接图片和ZIP均可读取，HTTP成功也需确认实际有图片',async()=>{
  const {api}=fixture();
  assert.equal(await api.parseResponse(new Response(png,{headers:{'content-type':'image/png'}}),{}),pngUrl);
  assert.equal(await api.parseResponse(new Response(Uint8Array.of(80,75,3,4),{headers:{'content-type':'application/zip'}}),{}),pngUrl);
  await assert.rejects(api.parseResponse(Response.json({success:true}),{}),/没有图片/);
  await assert.rejects(api.parseResponse(new Response('<html>login</html>'),{}),/没有返回可识别的图片/);
});
test('SSE流只接受最终结果，拒绝只有预览或后续错误的返回',async()=>{
  const {api}=fixture();
  const sse=events=>new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
  assert.equal(await api.parseResponse(sse([{event_type:'intermediate',image:'preview'},{event_type:'final',image:png.toString('base64')}]),{stream:true}),pngUrl);
  await assert.rejects(api.parseResponse(sse([{event_type:'intermediate',image:png.toString('base64')}]),{stream:true}),/缺少最终/);
  await assert.rejects(api.parseResponse(sse([{event_type:'final',image:png.toString('base64')},{event_type:'error',message:'upstream failed'}]),{stream:true}),/upstream failed/);
});
function frame(type='final') {
  const payload=Buffer.concat([Buffer.from([0x82,0xaa]),Buffer.from('event_type'),Buffer.from([0xa0+type.length]),Buffer.from(type),Buffer.from([0xa5]),Buffer.from('image'),Buffer.from([0xc4,png.length]),png]);
  const size=Buffer.alloc(4); size.writeUInt32BE(payload.length); return Buffer.concat([size,payload]);
}
test('原生MessagePack流解析最终二进制图片，截断帧与只有预览不算成功',async()=>{
  const {api}=fixture(), response=bytes=>new Response(bytes,{headers:{'content-type':'binary/octet-stream'}});
  assert.equal(await api.parseResponse(response(Buffer.concat([frame('intermediate'),frame()])),{stream:true}),pngUrl);
  await assert.rejects(api.parseResponse(response(frame().subarray(0,15)),{stream:true}),/不完整/);
  await assert.rejects(api.parseResponse(response(frame('intermediate')),{stream:true}),/缺少最终/);
});
test('一次生成只提交一次，Key留在请求头，错误不自动换地址重发',async()=>{
  const f=fixture(()=>new Response('{"error":{"message":"No credits"}}',{status:402,headers:{'content-type':'application/json'}}));
  await assert.rejects(f.api.generate({endpoint:'https://relay.example/v1'},'nai-diffusion-5-full','test-only-key','p','n'),/额度不足.*No credits/);
  assert.equal(f.requests.length,1); assert.equal(f.requests[0].url.includes('test-only-key'),false);
});
test('连接保存、重载、数据库备份字段和模型缓存不串站，缓存不存Key',async()=>{
  const f=fixture(); await f.ui.save();
  assert.equal(f.c.record.model,'chat-model'); assert.equal(f.c.record.novelaiSettings.endpoint,'https://relay.example/v1');
  assert.equal(f.c.record.novelaiApiKey,'test-only-key');
  assert.ok(!f.store.get('novelai-model-cache').includes('test-only-key'));
  f.element('novelai-endpoint').value='changed'; f.ui.load();
  assert.equal(f.element('novelai-endpoint').value,'https://relay.example/v1');
});
test('清单更新不覆盖手填模型，拉取失败和空清单保留原内容',async()=>{
  const f=fixture(()=>Response.json({data:[{id:'nai-diffusion-5-full-inpainting'},{id:'nai-diffusion-4-5-full'}]}));
  f.element('novelai-model').value='my-custom-name'; await f.ui.fetchModels();
  assert.equal(f.element('novelai-model').value,'my-custom-name');
  const models=f.element('novelai-model-options').children; assert.equal(models[0].value,'nai-diffusion-4-5-full');
  assert.match(models[1].label,/重绘专用/);
  for(const respond of [()=>Response.json({data:[]}),()=>new Response('',{status:401})]) {
    const bad=fixture(respond); bad.element('novelai-model').value='keep'; await bad.ui.fetchModels();
    assert.equal(bad.element('novelai-model').value,'keep'); assert.equal(bad.element('novelai-fetch-models-btn').disabled,false);
  }
});
test('数据库保存失败恢复旧连接，不改变已有运行配置',async()=>{
  const f=fixture(); await f.ui.save(); const old=f.store.get('novelai-settings');
  f.element('novelai-endpoint').value='https://new.example/v1';
  f.c.db.apiConfig.put=async()=>{throw new Error('quota');};
  await assert.rejects(f.ui.save(),/连接未保存/);
  assert.equal(f.store.get('novelai-settings'),old);
  assert.equal(f.c.state.apiConfig.novelaiSettings.endpoint,'https://relay.example/v1');
});
test('生成参数保存与重置保留站点连接，画风预设不包含地址和Key',async()=>{
  const f=fixture(); await f.ui.save(); f.c.loadNovelAISettings();
  f.element('nai-default-positive').value='my-style'; f.element('nai-steps').value='18';
  await f.c.saveNovelAISettings();
  assert.equal(f.c.getNovelAISettings().steps,18); assert.equal(f.c.getNovelAISettings().endpoint,'https://relay.example/v1');
  assert.equal(f.c.record.novelaiSettings.steps,18);
  const preset=f.c.gatherNaiUiSettings(); assert.equal(preset.endpoint,undefined);assert.equal(preset.apiKey,undefined);
  f.c.resetNovelAISettings();
  assert.equal(f.c.getNovelAISettings().endpoint,'https://relay.example/v1'); assert.equal(f.c.getNovelAISettings().steps,28);
});
test('切站或更换Key后旧拉取响应不得覆盖新站点清单',async()=>{
  let finish; const f=fixture(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=f.ui.fetchModels();
  f.element('novelai-endpoint').value='https://other.example/v1'; f.element('novelai-model').value='new-site-model';
  finish(Response.json({data:[{id:'stale-model'}]})); await pending;
  assert.equal(f.element('novelai-model').value,'new-site-model');
  assert.equal(f.element('novelai-model-options').children.some(m=>m.value==='stale-model'),false);
});
test('测试窗口先保存当前设置；聊天用相同请求、Key、模型与图片解析',async()=>{
  const f=fixture(); f.element('nai-test-prompt').value='a cat'; f.element('nai-test-negative').value='';
  f.element('novelai-model').value='nai-diffusion-5-full';
  await f.c.generateNovelAIImage();
  assert.equal(f.element('nai-test-result').style.display,'block');
  assert.equal(f.element('nai-result-image').src,pngUrl);
  await f.c.generateNaiImageFromPrompt('a cat');
  assert.equal(f.requests.length,2); assert.equal(f.requests[0].url,f.requests[1].url);
  assert.equal(f.requests[0].options.headers.Authorization,f.requests[1].options.headers.Authorization);
  const a=JSON.parse(f.requests[0].options.body),b=JSON.parse(f.requests[1].options.body);
  a.parameters.seed=0;b.parameters.seed=0; assert.deepEqual(a,b);
});
test('角色提示词和绑定画风参数保留，但预设不能替换当前站点连接',async()=>{
  const f=fixture(); await f.ui.save();
  f.c.state.chats.a={settings:{naiPresetId:1,naiSettings:{promptSource:'character',characterPositivePrompt:'character-tag',characterNegativePrompt:'character-negative'}}};
  f.c.db.naiPresets.get=async()=>({name:'style',settings:{endpoint:'https://wrong.example',cors_proxy:'https://wrong-proxy.example/',steps:18,default_positive:'preset-tag'}});
  await f.c.generateNaiImageFromPrompt('scene','a');
  const r=f.requests[0],body=JSON.parse(r.options.body);
  assert.equal(r.url,'https://relay.example/v1/ai/generate-image');assert.equal(body.parameters.steps,18);
  assert.equal(body.input,'scene, character-tag');assert.equal(body.parameters.negative_prompt,'character-negative');
});
