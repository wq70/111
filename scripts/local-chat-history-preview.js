// Isolated UI acceptance page; no production storage or external API requests.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const deps = process.env.HISTORY_TEST_DEPS;
const dexie = require.resolve(deps ? path.join(deps, 'dexie') : 'dexie');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function page() {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>330 聊天记录分段备份验收</title>
  <link rel="stylesheet" href="/css/chat-history-transfer.css"><style>
  body{margin:0;background:#e9edea;font:15px/1.7 sans-serif;color:#263c32;display:grid;place-content:center;min-height:100vh}
  #phone-screen{width:min(390px,100vw);height:min(780px,100dvh);position:relative;transform:translateZ(0);background:var(--secondary-bg,#fff);color:var(--text-primary,#222);overflow:hidden;border-radius:20px}
  #phone-screen.dark-mode{--secondary-bg:#1c2421;--primary-bg:#28312d;--text-primary:#edf5f0;--text-secondary:#b6c6bc;--border-color:#4b5f52}
  .home{padding:24px 18px}h1{font-size:25px;font-weight:500}button,label{font:inherit}.home button{display:block;width:100%;margin:12px 0;padding:12px;background:var(--primary-bg,#f4f6f4);color:inherit;border:1px solid var(--border-color,#d3ddd6);border-radius:10px;text-align:left}.tools{display:flex;gap:8px}.tools button{font-size:12px}#notice{font-size:13px;overflow-wrap:anywhere}
  </style><div id="phone-screen"><div class="home"><small>330 · 本地验收</small><h1>把一段对话<br>完整留在身边。</h1><p>仅使用独立示例数据，包含照片、语音和视频。<br>不会读取真实聊天或调用模型。</p><button id="export">导出示例聊天 →</button><label>导入一份备份<input id="import" type="file" accept="application/json"></label><button id="type">切换到群聊示例</button><div class="tools"><button id="theme">切换明暗</button><button id="width">切换到 320px</button></div><p id="notice" role="status">正在准备…</p></div></div>
  <script src="/dexie.js"></script><script>
  window.state={activeChatId:'demo',chats:{}};
  window.db=new Dexie('chat-history-isolated-preview');db.version(1).stores({chats:'&id',videoAttachments:'&id,chatId'});
  window.renderChatList=()=>{};window.renderChatInterface=()=>{};window.showCustomAlert=async(title,body)=>document.getElementById('notice').textContent=title+'：'+body;
  window.demoReady=(async()=>{await db.open();await db.chats.clear();await db.videoAttachments.clear();
    const image='data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><rect width="30" height="30" fill="green"/></svg>');
    const history=[{role:'user',timestamp:new Date(2026,10,1,12).getTime(),content:'周末去看海吧'}, {role:'assistant',timestamp:new Date(2026,10,2,12).getTime(),content:'带上这张照片',imageUrl:image}, {role:'user',timestamp:new Date(2026,10,3,12).getTime(),content:'听听海浪',audioData:'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='}, {role:'user',timestamp:new Date(2026,10,3,13).getTime(),type:'video_message',content:'海边的视频',video:{mediaId:'demo-video'}}];
    for(const isGroup of [false,true]){const id=isGroup?'group':'demo';const chat={id,name:isGroup?'周末出游群':'林间来信',isGroup,settings:{aiPersona:'示例人设',theme:'keep'},members:isGroup?[{id:'friend',originalName:'林间来信'}]:[],history:structuredClone(history)};await db.chats.put(chat);state.chats[id]=chat;}
    await db.videoAttachments.put({id:'demo-video',chatId:'demo',name:'示例视频.mp4',dataUrl:'data:video/mp4;base64,AQID',size:3});
    document.getElementById('notice').textContent='示例已就绪。刷新可重置。';})();
  </script><script src="/modules/data/chat-history-transfer.js"></script><script>
  document.getElementById('export').onclick=async()=>{await demoReady;ChatHistoryTransfer.openExport(state.chats[state.activeChatId]);};
  document.getElementById('import').onchange=async e=>{const file=e.target.files[0];if(file)await ChatHistoryTransfer.openImport(file,state.activeChatId);e.target.value='';};
  document.getElementById('type').onclick=e=>{state.activeChatId=state.activeChatId==='demo'?'group':'demo';e.target.textContent=state.activeChatId==='demo'?'切换到群聊示例':'切换到单聊示例';document.getElementById('notice').textContent='当前：'+state.chats[state.activeChatId].name;};
  document.getElementById('theme').onclick=()=>document.getElementById('phone-screen').classList.toggle('dark-mode');
  document.getElementById('width').onclick=e=>{const phone=document.getElementById('phone-screen');const narrow=phone.style.width==='320px';phone.style.width=narrow?'390px':'320px';e.target.textContent=narrow?'切换到 320px':'切换到 390px';};
  </script></html>`;
}
module.exports = { page };
if (require.main === module) http.createServer((req, res) => {
  const files = { '/dexie.js': dexie, '/modules/data/chat-history-transfer.js': path.join(root,'modules/data/chat-history-transfer.js'), '/css/chat-history-transfer.css': path.join(root,'css/chat-history-transfer.css') };
  if (req.url === '/') { res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}); res.end(page()); }
  else if (files[req.url]) { res.writeHead(200,{'Content-Type':req.url.endsWith('.css')?'text/css':'text/javascript','Cache-Control':'no-store'});res.end(fs.readFileSync(files[req.url])); }
  else { res.writeHead(404).end(); }
}).listen(8794,'127.0.0.1',()=>console.log('History isolated preview: http://127.0.0.1:8794/'));
