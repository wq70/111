// Isolated acceptance page: sample data in its own IndexedDB, no production DB or API.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function page(testScript = '') {
  const styles = [...read('src/html/document-head.html').matchAll(/<link rel="stylesheet" href="([^"]+)"/g)]
    .map(match => match[1].split('?')[0]).filter(file => !file.startsWith('http')).map(read).join('\n');
  const modals = read('src/html/modals-feature.html');
  const settings = modals.slice(modals.indexOf('<div id="douban-settings-modal"'), modals.indexOf('<audio id="char-audio-player"'));
  const general = read('src/html/feature-screens.html');
  const customStart = general.indexOf('<div id="custom-modal-overlay"');
  const customEnd = general.indexOf('<!--', customStart + 1);
  // Keep the real shared confirmation dialog, including its footer.
  const custom = customEnd === -1 ? general.slice(customStart) : general.slice(customStart, customEnd);
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>豆瓣独立备份 · 本地验收</title>
    <style>${styles}</style><style>
      body{opacity:1!important;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#e9eee9}
      #phone-screen{position:relative!important;width:min(390px,100vw)!important;height:min(844px,100dvh)!important;border-radius:20px;overflow:hidden;background:var(--secondary-bg,#fff);color:var(--text-primary,#222)}
      .preview-home{padding:32px 20px}.preview-home h1{font-size:28px;font-weight:500;line-height:1.5}.preview-home p{font-size:13px;line-height:1.8;color:var(--text-secondary,#666)}
      .preview-home button{display:block;width:100%;padding:14px;margin:12px 0;background:var(--primary-bg,#fff);color:inherit;border:1px solid var(--border-color,#ddd);border-radius:12px;font:inherit;text-align:left;cursor:pointer}
      #preview-notice{overflow-wrap:anywhere}.preview-tag{font-size:12px;letter-spacing:2px;color:#278c59}#douban-settings-modal .modal-content{color:var(--text-primary);background:var(--secondary-bg)}
    </style><div id="phone-screen"><div class="preview-home"><div class="preview-tag">豆瓣 · 独立备份</div><h1>把小组里的故事<br>单独留一份。</h1><p>可选择帖子、评论、小组与设置。<br>这里使用独立示例数据，不读取真实聊天。</p><button data-douban-transfer="export">导出豆瓣 →</button><button data-douban-transfer="import">导入豆瓣 →</button><button id="preview-settings">豆瓣设置 →</button><button id="preview-theme">切换明暗主题</button><p id="preview-notice" role="status">正在准备示例…</p></div>${settings}${custom}<pre id="test-result" hidden></pre></div>
    <script>
    window.state={currentScreen:'douban-screen',chats:{a:{id:'a',name:'林间来信',originalName:'林间来信',history:[],settings:{aiPersona:'喜欢记录日常的朋友',aiAvatar:''}}},qzoneSettings:{nickname:'小豆'},globalSettings:{id:'global',doubanUserNickname:'小豆',doubanMinPosts:12,doubanMaxPosts:20,doubanEnableAiAvatar:true,doubanActiveCharacterIds:['a'],doubanActivePersonaIds:[],doubanActiveWorldBookIds:[],customDoubanGroups:[{name:'今天也有好事发生',prompt:'分享日常的小小幸福',enabled:true}],npcAvatars:[]},worldBooks:[],personaPresets:[]};
    window.previewCopy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
    window.previewPosts=[{id:1,postTitle:'周末的第一杯热茶',content:'窗边的光刚刚好。',groupName:'今天也有好事发生',authorName:'林间来信',timestamp:1793606400000,comments:[{commenter:'小豆',text:'我也来一杯！',isUser:true}]},{id:2,postTitle:'给明天留一点期待',content:'今晚想早点睡。',groupName:'生活观察室',authorName:'路过的朋友',timestamp:1793520000000,comments:[]}];
    window.previewReady=new Promise((resolve,reject)=>{const request=indexedDB.open('douban-transfer-isolated-preview',1);request.onupgradeneeded=()=>{for(const name of ['doubanPosts','globalSettings','chats','personaPresets','worldBooks'])request.result.createObjectStore(name,{keyPath:'id',autoIncrement:name==='doubanPosts'});};request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);}).then(async database=>{
      let active=null;
      const names=['doubanPosts','globalSettings','chats','personaPresets','worldBooks'];
      const operation=(name,method,value)=>new Promise((resolve,reject)=>{if(window.previewFailTable===name && ['add','put'].includes(method)){reject(new Error('模拟写入失败'));return;}const tx=active||database.transaction(name,method==='getAll'?'readonly':'readwrite');const store=tx.objectStore(name);const request=value===undefined?store[method]():store[method](value);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      window.db=Object.fromEntries(names.map(name=>[name,{name,toArray:()=>operation(name,'getAll'),add:row=>operation(name,'add',row),put:row=>operation(name,'put',row),clear:()=>operation(name,'clear'),orderBy:()=>({reverse:()=>({toArray:async()=>(await operation(name,'getAll')).sort((a,b)=>b.timestamp-a.timestamp)})})}]));
      db.transaction=async(mode,tables,callback)=>{if(active)throw new Error('Nested preview transaction');const tx=database.transaction(tables.map(table=>table.name),'readwrite');active=tx;const finished=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('Transaction aborted'));tx.onerror=()=>{};});try{const result=await callback();await finished;return result;}catch(error){try{tx.abort();}catch{}await finished.catch(()=>{});throw error;}finally{active=null;}};
      await db.transaction('rw',Object.values(db).filter(table=>table.name),async()=>{for(const name of names)await db[name].clear();for(const post of previewPosts)await db.doubanPosts.add(post);await db.globalSettings.put(state.globalSettings);await db.chats.add(state.chats.a);});
      document.getElementById('preview-notice').textContent='示例已就绪。刷新页面可还原示例。';
    });
    window.escapeHTML=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    window.showToast=text=>document.getElementById('preview-notice').textContent=text;window.renderDoubanScreen=async()=>{};window.renderChatList=()=>{};window.showScreen=id=>state.currentScreen=id;window.defaultAvatar='';
    </script><script>${read('modules/ui-modals.js').replace(/<\/script/gi, '<\\/script')}</script><script>${read('modules/social/douban/transfer.js').replace(/<\/script/gi, '<\\/script')}</script>
    <script>
    document.getElementById('preview-theme').onclick=()=>document.getElementById('phone-screen').classList.toggle('dark-mode');
    document.getElementById('preview-settings').onclick=()=>document.getElementById('douban-settings-modal').classList.add('visible');
    document.getElementById('cancel-douban-settings-btn').onclick=()=>document.getElementById('douban-settings-modal').classList.remove('visible');
    ${testScript.replace(/<\/script/gi, '<\\/script')}
    </script></html>`;
}
module.exports = { page };
if (require.main === module) http.createServer((req,res)=>{
  if(!['/','/qa'].includes(req.url)||!['GET','HEAD'].includes(req.method)){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?'':page(req.url==='/qa'?require('../tests/helpers/douban-transfer-assertions'):''));
}).listen(8793,'127.0.0.1',()=>console.log('Douban isolated preview: http://127.0.0.1:8793/'));
