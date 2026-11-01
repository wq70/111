const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('浏览器：手机宽度适配、跨行排序、取消、即时应用、恢复默认和重复初始化', t => {
  const browser = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome']
    .find(file => file && fs.existsSync(file));
  if (!browser) { t.skip('需要本机 Chromium 浏览器'); return; }
  const css = [...read('src/html/document-head.html').matchAll(/<link[^>]*href="(css\/[^"?]+)/g)]
    .map(match => read(match[1])).join('\n');
  const chat = read('src/html/chat-interface.html');
  const header = chat.slice(chat.indexOf('<div class="header">'), chat.indexOf('<div id="chat-messages">'));
  const toolbar = chat.slice(chat.indexOf('<div id="chat-input-actions-top"'), chat.indexOf('<div id="chat-input-main-row"'));
  const modals = read('src/html/modals-general.html');
  const menu = modals.slice(modals.indexOf('<div id="message-actions-modal"'), modals.indexOf('<div id="post-actions-modal"'));
  const appearance = read('src/html/appearance-and-thoughts.html');
  const editors = appearance.slice(appearance.indexOf('<!-- 6.'), appearance.indexOf('<!-- 7.'));
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-action-layout-'));
  const runChecks = `
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    window.state = {globalSettings:{}};
    window.saves = 0;
    window.db = {globalSettings:{put:async()=>{saves++;}}};
    window.showCustomAlert = async()=>{};
    (0,eval)(${JSON.stringify(read('modules/ui/button-order.js'))});
    try {
      const phone = document.getElementById('phone-screen');
      const screen = document.getElementById('chat-interface-screen');
      document.getElementById('selection-count').textContent = '已选 123 条';
      for (const width of [280,320,360,390,430,768]) {
        phone.style.width = width+'px';
        const controls = screen.querySelector('.selection-controls');
        for (const button of controls.querySelectorAll('button')) {
          const box = button.getBoundingClientRect();
          assert(box.width>=44 && box.height>=44, '点击区域过小 '+width+' '+button.id);
          assert(box.left>=0 && box.right<=width+1, '按钮溢出 '+width+' '+button.id);
        }
        assert(controls.scrollWidth<=controls.clientWidth+1, '多选栏横向溢出 '+width);
      }
      phone.style.width='320px';
      const modal = document.getElementById('message-actions-modal');
      modal.classList.add('visible');
      for (const id of ['delete-message-btn','erase-message-btn']) document.getElementById(id).style.display='flex';
      const card = modal.firstElementChild;
      assert(card.getBoundingClientRect().right<=320, '菜单超出屏幕');
      card.style.maxHeight='180px';
      card.scrollTop=card.scrollHeight;
      assert(card.scrollTop>0, '长菜单不可滚动');
      assert(getComputedStyle(document.getElementById('view-thought-chain-btn')).display==='none', '条件按钮被错误显示');
      phone.classList.add('dark-mode');
      assert(getComputedStyle(document.getElementById('erase-message-btn')).color==='rgb(255, 105, 97)', '夜间模式删除按钮失去区分');
      phone.classList.remove('dark-mode');
      modal.classList.remove('visible');
      screen.style.display='none';
      document.getElementById('sort-screen').style.display='block';
      renderButtonOrderEditor(); initializeButtonOrderEditor(); initializeButtonOrderEditor();
      const editor = document.getElementById('button-order-editor');
      // Synthetic pointer events cannot acquire native capture; geometry and handlers are real.
      editor.setPointerCapture=()=>{}; editor.hasPointerCapture=()=>false;
      const first=editor.children[0], target=editor.children[12];
      const pointer=(type,element,box)=>element.dispatchEvent(new PointerEvent(type,{bubbles:true,isPrimary:true,pointerId:1,button:0,clientX:box.left+box.width/2,clientY:box.top+box.height/2}));
      pointer('pointerdown',first,first.getBoundingClientRect());
      pointer('pointermove',editor,target.getBoundingClientRect());
      pointer('pointerup',editor,target.getBoundingClientRect());
      assert(state.globalSettings.chatActionButtonsOrder.indexOf(first.dataset.buttonId)===12,'跨行拖动位置错误');
      assert(saves===1,'重复绑定导致多次保存');
      const saved=Array.from(editor.children,item=>item.dataset.buttonId).join();
      const next=editor.children[0], destination=editor.children[8];
      pointer('pointerdown',next,next.getBoundingClientRect());
      pointer('pointermove',editor,destination.getBoundingClientRect());
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
      assert(Array.from(editor.children,item=>item.dataset.buttonId).join()===saved,'取消未还原顺序');
      assert(saves===1 && !document.querySelector('.button-order-drag-ghost'),'取消后残留拖动或保存');
      const headerEditor=document.getElementById('header-button-order-editor');
      headerEditor.firstElementChild.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
      assert(state.globalSettings.chatHeaderButtonsOrder[0]==='listen-together-btn','顶栏排序未保存');
      assert(document.querySelector('.default-controls .header-actions').firstElementChild.id==='listen-together-btn','顶栏未立即应用');
      document.getElementById('reset-header-button-order-btn').click();
      assert(document.querySelector('.default-controls .header-actions').firstElementChild.id==='open-memory-screen-btn','恢复默认未应用');
      renderButtonOrderEditor(); initializeButtonOrderEditor();
      assert(editor.children[12].dataset.buttonId===first.dataset.buttonId,'重新打开丢失顺序');
      applyButtonOrder();
      assert(document.querySelector('#message-actions-modal .custom-modal-footer').lastElementChild.id==='cancel-message-action-btn','取消按钮未固定在最后');
      document.getElementById('result').textContent='PASS';
    } catch(error) { document.getElementById('result').textContent=error.stack; }
  `;
  const html = '<!doctype html><meta charset="utf-8"><style>'+css+'</style><div id="phone-screen" style="height:568px">'
    +'<div id="chat-interface-screen" class="screen active selection-mode">'+header+'<div style="display:none">'+toolbar+'</div></div>'
    +'<div id="sort-screen" style="display:none;overflow-y:auto;padding:12px">'+editors+'</div>'+menu+'</div><pre id="result"></pre>'
    +'<script>'+runChecks.replace(/<\/script/gi, '<\\/script')+'</script>';
  const file = path.join(folder, 'test.html');
  fs.writeFileSync(file, html);
  try {
    const run = spawnSync(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND', '--window-size=900,1000',
      '--user-data-dir='+path.join(folder,'profile'), '--dump-dom', '--virtual-time-budget=3000', pathToFileURL(file).href],
      {encoding:'utf8',timeout:25000,maxBuffer:4*1024*1024,windowsHide:true});
    assert.ifError(run.error);
    const result = (run.stdout || '').match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];
    assert.equal(result, 'PASS', result || (run.stderr || '').slice(-2000));
  } finally {
    if (path.dirname(folder) === path.resolve(os.tmpdir()) && path.basename(folder).startsWith('chat-action-layout-')) {
      fs.rmSync(folder,{recursive:true,force:true,maxRetries:5,retryDelay:200});
    }
  }
});
