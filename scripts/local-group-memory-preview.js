// Sample-only acceptance page. Uses real group memory modules and a simulated model.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function page() {
  const css = [...read('src/html/document-head.html').matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1].split('?')[0]);
  const customModal = read('src/html/feature-screens.html').match(/<div id="custom-modal-overlay">[\s\S]*?<div class="custom-modal-footer">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)[0];
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>330 群聊独立记忆验收</title>${css.map(file => `<link rel="stylesheet" href="/${file}">`).join('')}
  <style>body{opacity:1!important;background:#e4e8e6;display:flex;justify-content:center;margin:0;min-height:100vh}#phone-screen{position:relative!important;width:390px!important;max-width:100vw!important;height:100dvh!important;min-height:600px;overflow:hidden;background:var(--secondary-bg);color:var(--text-primary);border-radius:0!important}.preview{padding:20px;height:100%;overflow:auto;box-sizing:border-box}.preview h1{font-size:24px}.preview p{line-height:1.7;font-size:13px}.preview select[hidden]{display:none!important}.preview select{display:block;width:100%;padding:10px;margin:8px 0;background:var(--primary-bg);color:var(--text-primary);border:1px solid var(--border-color);border-radius:8px}.preview button{font:inherit;padding:10px;margin:6px 0;border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);background:var(--primary-bg)}.preview #group-memory-settings{margin:20px 0}#notice{min-height:24px}.gm-overlay{position:fixed}</style>
  <main id="phone-screen"><div class="preview"><p>330 · 本地示例验收</p><h1>群聊独立记忆</h1><p>示例群有两位同名角色和一位 NPC。此页面只保存示例数据，不读取真实聊天，也不连接模型服务。</p><button id="dark">切换明暗</button><button id="new-message">添加一条示例群消息</button><label for="preview-mode">记忆模式</label><select id="preview-mode"><option value="diary">日记式</option><option value="structured">结构化</option><option value="vector">向量记忆</option></select><div id="group-memory-settings" class="settings-item-block" hidden></div><button id="save">保存群聊设置</button><p id="notice" role="status"></p></div>${customModal}</main>
  <script>
  const stored = localStorage.getItem('group-memory-demo');
  const chat = stored ? JSON.parse(stored) : {id:'demo-group',name:'周末看海小分队',isGroup:true,settings:{memoryMode:'diary',linkedMemoryChatIds:['a']},members:[{id:'a',originalName:'杰克',groupNickname:'杰克·图书馆',persona:'喜欢读书'},{id:'b',originalName:'杰克',groupNickname:'杰克·旅行家',persona:'喜欢旅行'},{id:'npc_1',originalName:'向导',groupNickname:'向导',persona:'熟悉海边小镇',isNpc:true}],history:Array.from({length:6},(_,i)=>({id:'demo-'+i,role:i%2?'assistant':'user',senderId:i%2?'a':'user',senderName:i%2?'杰克·图书馆':'我',content:['周末一起去看海吧','好，我会带上书','约好了上午八点出发','我负责买早餐','向导也和我们一起去','好，到海边再汇合'][i],timestamp:1793650800000+i*60000}))};
  window.state={activeChatId:chat.id,chats:{[chat.id]:chat,a:{id:'a',name:'杰克私聊',originalName:'杰克',settings:{},history:[],longTermMemory:[{content:'私聊内容不会出现在群独立记忆里'}]}},apiConfig:{proxyUrl:'https://simulation.invalid',apiKey:'sample',model:'sample'},worldBooks:[],qzoneSettings:{nickname:'我'},globalSettings:{}};
  window.db={chats:{put:async value=>{if(value.id!==chat.id)throw Error('示例不允许写入私聊');localStorage.setItem('group-memory-demo',JSON.stringify(value));}}};
  window.showToast=text=>document.getElementById('notice').textContent=text;

  window.fetch=async(url,request)=>{const prompt=JSON.parse(request.body).messages[0].content;const mode=chat.settings.memoryMode;const content=mode==='structured'?'[261102]E:我和大家约好周末上午八点出发去看海':mode==='vector'?'[{"category":"E","content":"我和大家约好周末上午八点去看海","sourceMessageIds":[1],"timeBasis":"message"}]':JSON.stringify({summary:'我和大家约好了周末一起去看海，上午八点出发，途中准备早餐。'});return {ok:true,json:async()=>({choices:[{message:{content},finish_reason:'stop'}]})};};
  </script><script src="/modules/ui-modals.js"></script><script src="/modules/ui/choice-picker.js"></script><script src="/modules/memory/extraction-support.js"></script><script src="/modules/memory/structured-memory.js"></script><script src="/modules/memory/vector-memory.js"></script><script src="/modules/memory/group-memory.js"></script><script src="/modules/memory/group-memory-ui.js"></script>
  <script>
  window.showToast=text=>document.getElementById('notice').textContent=text;
  GroupMemoryUI.load(chat);document.getElementById('preview-mode').value=chat.settings.memoryMode;
  document.getElementById('preview-mode').onchange=async e=>{chat.settings.memoryMode=e.target.value;await db.chats.put(chat);};
  ChoicePicker.enhance(document.querySelector('.preview'));
  document.getElementById('save').onclick=async()=>{try{await GroupMemoryUI.save(chat);GroupMemoryUI.load(chat);showToast('设置已保存，刷新页面也会保留。');}catch(e){showToast(e.message);}};
  document.getElementById('dark').onclick=()=>document.getElementById('phone-screen').classList.toggle('dark-mode');
  document.getElementById('new-message').onclick=async()=>{chat.history.push({id:'new-'+Date.now(),role:'user',content:'到了海边记得给大家拍照',timestamp:Date.now()});await db.chats.put(chat);showToast('已添加一条开启后的示例消息。');};
  </script></html>`;
}
http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(req.method === 'HEAD' ? '' : page()); return; }
  const file = path.resolve(root, '.' + decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep) || !/^\/(css|modules)\/.*\.(css|js)$/.test(pathname) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
}).listen(8772, '127.0.0.1', () => console.log('Group memory sample: http://127.0.0.1:8772/'));
