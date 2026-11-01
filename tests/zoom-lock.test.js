const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('浏览器：默认关闭、保存恢复、整页手势拦截、单指滚动和独立图片缩放', t => {
  const browser = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium']
    .find(file => file && fs.existsSync(file));
  if (!browser) { t.skip('需要 Chromium 浏览器'); return; }
  const appearance = read('src/html/appearance-and-thoughts.html');
  const ui = appearance.slice(appearance.indexOf('<div id="wallpaper-screen"'), appearance.indexOf('<!-- 3. 锁屏设置 -->'));
  const bindings = read('src/js-bundles/event-bindings-a/wallpaper-and-chat-input.jsfrag');
  const save = bindings.slice(bindings.indexOf("document.getElementById('save-wallpaper-btn').addEventListener"), bindings.indexOf('    const secondaryApiPresetSelect'));
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-lock-'));
  const script = `
    (async () => {
      const assert = (ok, message) => { if (!ok) throw new Error(message); };
      window.state = { globalSettings: {} };
      window.newWallpaperBase64 = null;
      window.db = {globalSettings:{put:async record => { localStorage.setItem('saved', JSON.stringify(record)); }}};
      for (const name of ['applyGlobalWallpaper','applyCPhoneWallpaper','applyMyPhoneWallpaper','applyAppIcons',
        'applyCPhoneAppIcons','applyMyPhoneAppIconsGlobal','applyGlobalCss','applyStatusBarVisibility','applyMinimalChatUI','initLockScreen','showScreen','alert']) window[name] = () => {};
      const saveSource = ${JSON.stringify(save)};
      for (const match of saveSource.matchAll(/getElementById\\('([^']+)'\\)/g)) {
        if (!document.getElementById(match[1])) { const input = document.createElement('input'); input.id=match[1]; document.body.append(input); }
      }
      (0,eval)(${JSON.stringify(read('modules/ui/zoom-lock.js'))});
      (0,eval)(saveSource);
      const toggle = document.getElementById('lock-interface-zoom-switch');
      const previewToggle = document.getElementById('allow-preview-zoom-switch');
      const root = document.documentElement;
      const surface = document.getElementById('simple-image-zoom-overlay');
      const image = surface.querySelector('img');
      const touch = (type, target, coords) => {
        const event = new Event(type, {bubbles:true,cancelable:true});
        Object.defineProperty(event, 'touches', {value:coords.map(([clientX,clientY])=>({clientX,clientY}))});
        target.dispatchEvent(event); return event;
      };
      const wheel = ctrlKey => { const event = new WheelEvent('wheel',{ctrlKey,deltaY:10,bubbles:true,cancelable:true}); document.body.dispatchEvent(event); return event; };
      applyInterfaceZoomSettings(); renderInterfaceZoomSettings();
      assert(!toggle.checked && previewToggle.checked && previewToggle.disabled, '旧数据默认值错误');
      assert(getComputedStyle(root).touchAction === 'auto', '默认关闭却限制了原有手势');
      assert(!touch('touchmove',document.body,[[10,10],[30,30]]).defaultPrevented && !wheel(true).defaultPrevented, '关闭时拦截缩放');
      toggle.checked = true; toggle.dispatchEvent(new Event('change',{bubbles:true}));
      assert(!previewToggle.disabled, '开启后无法选择图片缩放');
      document.getElementById('save-wallpaper-btn').click();
      await new Promise(resolve=>setTimeout(resolve,0));
      const saved = JSON.parse(localStorage.getItem('saved'));
      assert(saved.lockInterfaceZoom === true && saved.allowPreviewZoom === true, '完成按钮未保存两个选项');
      state.globalSettings = saved; applyInterfaceZoomSettings(); renderInterfaceZoomSettings();
      assert(toggle.checked && previewToggle.checked, '恢复设置失败');
      assert(getComputedStyle(root).touchAction === 'pan-x pan-y', '未限制整页缩放');
      assert(touch('touchmove',document.body,[[10,10],[30,30]]).defaultPrevented && wheel(true).defaultPrevented, '双指或触控板缩放未拦截');
      assert(!touch('touchmove',document.body,[[10,10]]).defaultPrevented && !wheel(false).defaultPrevented, '正常单指或滚轮滚动被阻止');
      const gesture = new Event('gesturestart',{bubbles:true,cancelable:true}); document.body.dispatchEvent(gesture);
      assert(gesture.defaultPrevented, 'Safari 手势未拦截');
      prepareLockedImagePreview(surface,image);
      assert(getComputedStyle(surface).touchAction === 'none', '图片手势仍可能改变整页比例');
      touch('touchstart',image,[[100,100],[200,100]]);
      touch('touchmove',image,[[50,100],[250,100]]);
      assert(image.style.transform.includes('scale(2)'), '图片未单独放大');
      touch('touchend',image,[[200,100]]);
      touch('touchmove',image,[[220,120]]);
      assert(!image.style.transform.includes('translate(0px, 0px)'), '放大图片无法单指拖动');
      touch('touchend',image,[]);
      let closed = false; surface.addEventListener('click',()=>{closed=true;}); image.click();
      assert(!closed, '结束缩放时误关闭图片');
      prepareLockedImagePreview(surface,image);
      assert(!image.style.transform, '切换或重开图片未复位');
      touch('touchstart',image,[[100,100],[200,100]]);
      touch('touchmove',image,[[0,100],[1000,100]]);
      assert(image.style.transform.includes('scale(5)'), '图片放大没有上限');
      touch('touchmove',image,[[140,100],[160,100]]);
      assert(image.style.transform.includes('scale(1)') && image.style.transform.includes('translate(0px, 0px)'), '缩小不能复原');
      prepareLockedImagePreview(surface,image);
      previewToggle.checked = false; document.getElementById('save-wallpaper-btn').click();
      await new Promise(resolve=>setTimeout(resolve,0));
      touch('touchstart',image,[[100,100],[200,100]]); touch('touchmove',image,[[50,100],[250,100]]);
      assert(!image.style.transform && JSON.parse(localStorage.getItem('saved')).allowPreviewZoom === false, '禁止图片缩放的选项未生效');
      toggle.checked = false; document.getElementById('save-wallpaper-btn').click();
      await new Promise(resolve=>setTimeout(resolve,0));
      state.globalSettings=JSON.parse(localStorage.getItem('saved')); applyInterfaceZoomSettings(); renderInterfaceZoomSettings();
      assert(!toggle.checked && !previewToggle.checked && previewToggle.disabled, '关闭后丢失图片偏好');
      assert(getComputedStyle(root).touchAction === 'auto' && getComputedStyle(surface).touchAction === 'auto', '关闭后未恢复原有手势');
      assert(!touch('touchmove',document.body,[[10,10],[30,30]]).defaultPrevented, '关闭后残留拦截');
      document.getElementById('result').textContent='PASS';
    })().catch(error=>{document.getElementById('result').textContent=error.stack;});
  `;
  const css = read('css/ui/zoom-lock.css');
  const html = '<!doctype html><meta charset="utf-8"><style>'+css+'</style>'+ui+'</div></div>'
    +'<div id="simple-image-zoom-overlay" style="position:fixed;width:300px;height:300px;left:0;top:0;display:flex;align-items:center;justify-content:center"><img style="width:280px;height:280px"></div><pre id="result"></pre>'
    +'<script>'+script.replace(/<\/script/gi,'<\\/script')+'</script>';
  const file = path.join(folder,'test.html');
  fs.writeFileSync(file,html);
  try {
    const run = spawnSync(browser,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check',
      '--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND','--user-data-dir='+path.join(folder,'profile'),
      '--dump-dom','--virtual-time-budget=3000',pathToFileURL(file).href],
      {encoding:'utf8',timeout:25000,maxBuffer:4*1024*1024,windowsHide:true});
    assert.ifError(run.error);
    const result=(run.stdout||'').match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];
    assert.equal(result,'PASS',result||(run.stderr||'').slice(-2000));
  } finally {
    if (path.dirname(folder)===path.resolve(os.tmpdir()) && path.basename(folder).startsWith('zoom-lock-')) {
      fs.rmSync(folder,{recursive:true,force:true,maxRetries:5,retryDelay:200});
    }
  }
});
