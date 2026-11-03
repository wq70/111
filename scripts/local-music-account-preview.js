// Local component acceptance page. Uses the production markup, styles and account implementation.
// Run: node scripts/local-music-account-preview.js (loopback only, no account proxy).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const assets = new Set(['/modules/music-online-services.js', '/modules/music-player.js', '/css/media/music-player.css']);
function page() {
  const source = fs.readFileSync(path.join(root, 'src/html/modals-feature.html'), 'utf8');
  const begin = source.indexOf('  <div id="music-account-modal"');
  const end = source.indexOf('\n  <div id="cleaned-songs-modal"', begin);
  if (begin < 0 || end < 0) throw new Error('Music account markup not found');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>330 · 网易云登录验收</title>
<link rel="stylesheet" href="/css/media/music-player.css"><style>
*{box-sizing:border-box}body{font:16px/1.6 system-ui,sans-serif;margin:0;background:#f4f6f9;color:#253043}
main{max-width:680px;margin:48px auto;padding:24px}h1{font-size:26px}button{font:inherit;cursor:pointer;padding:9px 16px;border:1px solid #d5dce6;border-radius:10px;background:white;color:inherit}button:disabled{cursor:wait}
.modal{display:none;position:fixed;inset:0;background:#1c294450;align-items:center;justify-content:center}.modal.visible{display:flex}
.modal-content{display:flex;flex-direction:column;background:white;border-radius:20px;box-shadow:0 20px 80px #14233c26}.modal-header{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid #edf0f5;font-weight:600}
.modal-body{min-height:0}dialog{max-width:480px;border:0;border-radius:16px;padding:24px}dialog::backdrop{background:#1c294450}dialog footer{display:flex;justify-content:flex-end;gap:12px}.notice{white-space:pre-wrap;padding:12px 0}#test-library{margin-top:20px}
</style><main><h1>330 · 网易云登录验收</h1><p>请打开音乐账号，生成二维码后用网易云音乐 App 扫码并确认。</p>
<p>测试步骤：显示账号 → 读取歌单 → 选择一个歌单导入。导入结果保存在当前测试页面的本地存储中。</p>
<button id="test-open">打开音乐账号</button><div id="test-library" role="status">本次测试尚未导入歌曲</div><div id="test-notice" class="notice" role="status"></div></main>
${source.slice(begin, end)}
<div hidden><div id="playlist-tabs-container"></div><div id="playlist-body"></div><div id="music-player-song-title"></div><div id="music-player-artist"></div><div id="music-time-counter"></div><button id="music-play-pause-btn"></button></div>
<dialog id="test-confirm"><h2 id="test-confirm-title"></h2><p id="test-confirm-body"></p><footer><button id="test-confirm-cancel">取消</button><button id="test-confirm-ok">生成二维码</button></footer></dialog>
<script>
window.state={chats:{}};window.musicState={playlist:[],playlists:[],currentIndex:-1,totalElapsedTime:0};
window.addLongPressListener=()=>{};
window.showCustomAlert=async(title,body)=>{document.getElementById('test-notice').textContent=title+'：'+body;};
window.showCustomConfirm=(title,body)=>new Promise(resolve=>{
 const dialog=document.getElementById('test-confirm');document.getElementById('test-confirm-title').textContent=title;document.getElementById('test-confirm-body').textContent=body;
 const finish=value=>{dialog.close();resolve(value);};document.getElementById('test-confirm-ok').onclick=()=>finish(true);document.getElementById('test-confirm-cancel').onclick=()=>finish(false);dialog.oncancel=e=>{e.preventDefault();finish(false);};dialog.showModal();
});
window.db={musicLibrary:{put:row=>new Promise((resolve,reject)=>{
 const request=indexedDB.open('ephone-music-account-verification',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('musicLibrary',{keyPath:'id'});
 request.onerror=()=>reject(new Error('测试歌单保存失败'));
 request.onsuccess=()=>{const database=request.result,transaction=database.transaction('musicLibrary','readwrite');transaction.objectStore('musicLibrary').put(row);
 transaction.oncomplete=()=>{database.close();document.getElementById('test-library').textContent='本次测试已保存 '+row.playlist.length+' 首歌曲';resolve();};
 transaction.onerror=()=>{database.close();reject(new Error('测试歌单保存失败'));};};
})}};
</script><script src="/modules/music-online-services.js"></script><script src="/modules/music-player.js"></script>
<script>
for(const [id,fn] of [['test-open',openMusicAccountCenter],['close-music-account-btn',closeMusicAccountCenter],['netease-login-btn',startNeteaseQrLogin],['netease-logout-btn',logoutNeteaseMusic],['netease-account-retry-btn',refreshNeteaseAccountView],['netease-playlists-retry-btn',refreshNeteaseAccountView]])document.getElementById(id).addEventListener('click',fn);
</script></html>`;
}
http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? '' : page()); return;
  }
  if (!assets.has(pathname)) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
  if (request.method === 'HEAD') response.end(); else fs.createReadStream(path.join(root, pathname.slice(1))).pipe(response);
}).listen(8766, '127.0.0.1', () => console.log('Music account acceptance page: http://127.0.0.1:8766/'));
