// Isolated visual acceptance page: real UI modules, in-memory sample data, no API calls.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function page() {
  const head = read('src/html/document-head.html');
  const css = [...head.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1].split('?')[0]);
  const modals = read('src/html/modals-phone-and-finance.html');
  const settings = modals.slice(modals.indexOf('<div id="gr-settings-modal"'), modals.indexOf('<div id="gr-chapter-editor-modal"'));
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>330 偏好功能验收</title>
    ${css.map(file => `<link rel="stylesheet" href="/${file}">`).join('')}
    <style>body{opacity:1!important;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#dce2df}#phone-screen{position:relative!important;width:390px!important;height:min(844px,100vh)!important;max-width:100vw!important;border-radius:24px;overflow:hidden;background:var(--secondary-bg);color:var(--text-primary)}.preview-home{padding:28px 20px}.preview-home h1{font-size:25px;font-weight:500}.preview-home p{font-size:13px;color:var(--text-secondary);line-height:1.8}.preview-home button{display:block;width:100%;border:1px solid var(--border-color);background:var(--primary-bg);color:var(--text-primary);font:inherit;border-radius:12px;margin:12px 0;padding:14px;text-align:left;cursor:pointer}.preview-note{position:absolute;bottom:20px;left:20px;right:20px;font-size:11px;line-height:1.7;color:var(--text-secondary)}#gr-settings-modal .modal-content{max-width:100%}#gr-settings-modal .modal-body{min-height:0}#preview-notice{color:var(--text-secondary)}</style>
    <div id="phone-screen"><div class="preview-home"><p>330 · 本地验收</p><h1>让每个故事<br>都有自己的节奏。</h1><p>真实界面与独立示例数据。<br>可试用模板、短篇选择与明暗主题。</p><button data-chat-templates>聊天设置模板 →</button><button id="preview-story">绿江作品设定 →</button><button id="preview-model">模型沟通 →</button><button id="preview-dark">切换明暗主题</button><p id="preview-notice" role="status"></p></div>${settings}<div class="preview-note">此验收页不读取真实聊天，不连接模型服务。刷新后还原示例。</div></div>
    <script>
    const copy=x=>x==null?x:JSON.parse(JSON.stringify(x));
    const table=rows=>{let seq=20;const map=new Map(rows.map(row=>[row.id,copy(row)]));return{get:async id=>copy(map.get(id)),put:async row=>{const id=row.id??seq++;map.set(id,{...copy(row),id});return id},add:async row=>{const id=seq++;map.set(id,{...copy(row),id});return id},toArray:async()=>copy([...map.values()]),delete:async id=>map.delete(id),where:key=>({equals:value=>({first:async()=>copy([...map.values()].find(row=>row[key]===value))})})}};
    window.state={activeChatId:'a',globalSettings:{id:'global'},chats:{a:{id:'a',name:'林间来信',settings:{aiPersona:'温柔自然',myPersona:'读者',enableNarratorMode:true,enableBilingualMode:true,languagePolicy:{outputMode:'fixed',outputLanguage:'ja-JP'}},history:[{role:'user',content:'今天想看一个温柔的故事',timestamp:1},{role:'assistant',content:'好，我们从窗边的风开始写。',timestamp:2}]},b:{id:'b',name:'月下茶话会',isGroup:true,settings:{},members:[],history:[]},c:{id:'c',name:'远山',settings:{},history:[]}}};
    window.db={chatSettingsPresets:table([{id:1,name:'温柔双语 · 轻旁白',createdAt:1,settings:{enableNarratorMode:true,enableBilingualMode:true,languagePolicy:{outputMode:'fixed',outputLanguage:'ja-JP'}}},{id:2,name:'自然聊天 · 简洁回复',createdAt:2,settings:{enableNarratorMode:false,enableMultiReply:true,minReplyCount:1,maxReplyCount:3}}]),globalSettings:table([]),chats:table(Object.values(state.chats)),modelDiscussions:table([]),generationPreferences:table([]),grAuthors:table([{id:1,name:'细腻的日常'}]),npcs:table([]),worldBooks:table([{id:'w',name:'雨天小镇',content:[]}]),personaPresets:table([]),grStories:table([]),transaction:async(mode,table,fn)=>fn()};
    window.grState={activeStoryId:null,isGenerating:false};window.showToast=text=>document.getElementById('preview-notice').textContent=text;window.showCustomAlert=async(title,text)=>showToast(title+' '+text);window.showCustomPrompt=async()=>null;window.showCustomConfirm=async()=>false;
    window.renderChatInterface=async()=>{};window.renderChatList=()=>{};window.parseAiResponse=()=>[];window.toGeminiRequestData=()=>{};window.getGeminiResponseText=()=>'';window.triggerAiResponse=async()=>{throw new Error('验收页不调用模型服务')};window.silentlyUpdateDbUrl=()=>{};
    </script>
    <script src="/modules/ui/choice-picker.js"></script><script src="/modules/chat-settings-presets.js"></script><script src="/modules/ai/generation-adjustments.js"></script><script src="/modules/ai/model-communication.js"></script><script src="/modules/social/green-river/story-engine.js"></script><script src="/modules/social/green-river/story-settings-and-reader.js"></script>
    <script>
    document.getElementById('preview-dark').onclick=()=>document.getElementById('phone-screen').classList.toggle('dark-mode');
    window.openReader=async id=>{grState.activeStoryId=id;showToast('作品设置已保存；再次打开可检查回显。');};
    document.getElementById('preview-story').onclick=()=>grState.activeStoryId?openStorySettings():createNewStory();
    document.getElementById('preview-model').onclick=()=>ModelCommunication.open('a','talk');
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
}).listen(8768, '127.0.0.1', () => console.log('Preferences acceptance page: http://127.0.0.1:8768/'));
