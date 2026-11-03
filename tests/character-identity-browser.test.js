const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

test('浏览器：旧评论选人、取消、保存重开、同名通知和表情回复', t => {
  const browser = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium']
    .find(file => file && fs.existsSync(file));
  if (!browser) return t.skip('需要 Chromium 浏览器');
  const modals = read('modules/ui-modals.js');
  const choice = modals.slice(modals.indexOf('  function showChoiceModal('), modals.indexOf('  function showCategoryPickerModal('));
  const bindings = read('src/js-bundles/event-bindings-b/chat-settings.jsfrag') + read('src/js-bundles/event-bindings-b/qzone-and-stickers.jsfrag');
  const clickHandler = bindings.slice(bindings.indexOf('    async function handlePostClick('), bindings.indexOf('    const handleSwipeStart'));
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'character-identity-'));
  const script = `
    (async () => {
      const check = (ok, message) => { if (!ok) throw new Error(message); };
      const tick = () => new Promise(resolve => setTimeout(resolve, 0));
      window.state = { qzoneSettings: {nickname:'杰克',avatar:''}, userStickers: [], favoritedPostIds:new Set(), chats: {
        a: {id:'a',originalName:'杰克',name:'A的备注',settings:{aiPersona:'设定A'},history:[]},
        b: {id:'b',originalName:'杰克',name:'B的备注',settings:{aiPersona:'设定B'},history:[]}
      }};
      window.currentQzoneReplyContext = null;
      window.defaultAvatar = ''; window.defaultGroupMemberAvatar = '';
      window.STICKER_REGEX = /^data:/;
      window.escapeHTML = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      window.parseMarkdown = escapeHTML;
      window.getDisplayNameByOriginalName = (name,id) => CharacterIdentity.display(name,id);
      window.showLoader = window.hideLoader = () => {};
      let stored = {id:1,authorId:'user',type:'shuoshuo',content:'测试动态',timestamp:1,comments:[{commenterName:'杰克',text:'旧评论',timestamp:2}]};
      localStorage.setItem('post',JSON.stringify(stored));
      const query = { reverse(){return this;},filter(){return this;},async toArray(){return [structuredClone(stored)];} };
      window.db = {
        qzonePosts:{async get(){return structuredClone(stored);},async update(id,patch){stored={...stored,...structuredClone(patch)};localStorage.setItem('post',JSON.stringify(stored));},orderBy(){return query;}},
        chats:{async put(){}}, favorites:{where(){return {equals(){return {async toArray(){return [];}};}};}}
      };
      (0,eval)(${JSON.stringify(read('modules/character/identity.js'))});
      (0,eval)(${JSON.stringify(choice)});
      (0,eval)(${JSON.stringify(read('modules/qzone.js'))});
      (0,eval)(${JSON.stringify(clickHandler)});
      const list = document.getElementById('qzone-posts-list');
      list.addEventListener('click', event => { window.lastClick = handlePostClick(event); });
      const draw = async () => { qzonePostsCache=[structuredClone(stored)];list.replaceChildren();list.appendChild(await createOrUpdatePostElement(stored)); };
      const modal = document.getElementById('custom-modal-overlay');
      await draw();
      check(list.querySelector('.comment-item').textContent.includes('身份待确认'),'旧评论缺少身份提示');
      list.querySelector('.comment-text').click();await tick();
      check(modal.classList.contains('visible'),'旧评论点击后没有选择框');
      check(document.getElementById('custom-modal-title').textContent.includes('旧评论'),'选择说明不清晰');
      check(document.querySelectorAll('.payment-option-item').length===3,'同名用户和两个角色没有分开列出');
      [...modal.querySelectorAll('button')].find(button=>button.textContent==='取消').click();await lastClick;
      check(!stored.comments[0].commenterId && !currentQzoneReplyContext,'取消后仍写入身份或回复目标');
      list.querySelector('.comment-text').click();await tick();
      [...modal.querySelectorAll('.payment-option-item')].find(button=>button.textContent.includes('B的备注')).click();await lastClick;
      check(stored.comments[0].commenterId==='b' && qzonePostsCache[0].comments[0].commenterId==='b','选择结果未同步保存与缓存');
      check(currentQzoneReplyContext.replyToId==='b','回复目标未保存B的ID');
      const input=list.querySelector('.comment-input');input.value='只回复B';
      list.querySelector('.comment-send-btn').click();await lastClick;
      check(stored.comments[1].commenterId==='user' && stored.comments[1].replyToId==='b','发送时丢失身份');
      check(state.chats.a.history.length===0 && state.chats.b.history.length===1,'通知发给了同名A');
      stored=JSON.parse(localStorage.getItem('post'));
      state.chats.b.name='B的新备注';await draw();
      check(list.querySelector('.comment-text').textContent.includes('B的新备注'),'重开或改备注后显示错误');
      list.querySelector('.comment-text').click();await lastClick;
      check(!modal.classList.contains('visible') && currentQzoneReplyContext.replyToId==='b','明确归属的评论重复询问或归属改变');
      await sendQzoneStickerComment(1,{url:'data:image/gif;base64,R0lGODlhAQABAAAAACw=',name:'开心'});
      check(stored.comments[2].commenterId==='user' && stored.comments[2].replyToId==='b','表情回复身份丢失');
      check(state.chats.a.history.length===0 && state.chats.b.history.length===2,'表情回复通知广播给了其他角色');
      const malicious = '杰克<img src=x onerror="window.injected=true">';
      state.chats.a.originalName=state.chats.b.originalName=malicious;
      const pending=CharacterIdentity.prepare({isGroup:true,members:[state.chats.a,state.chats.b]},{type:'text',name:malicious},true);
      await tick();check(!modal.querySelector('img') && !window.injected,'选项未转义角色名字');
      [...modal.querySelectorAll('button')].find(button=>button.textContent==='取消').click();await pending;
      document.getElementById('result').textContent='PASS';
    })().catch(error=>{document.getElementById('result').textContent=error.stack;});
  `;
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
    + '<style>body{margin:0;width:320px}#custom-modal-overlay{display:none}#custom-modal-overlay.visible{display:block}#custom-modal{width:300px}.custom-modal-footer{display:flex}</style>'
    + '<div id="qzone-posts-list"></div><div id="custom-modal-overlay"><div id="custom-modal"><h2 id="custom-modal-title"></h2><div id="custom-modal-body"></div><div class="custom-modal-footer"></div></div></div><pre id="result"></pre>'
    + '<script>' + script.replace(/<\/script/gi, '<\\/script') + '</script>';
  const file = path.join(folder, 'test.html');
  fs.writeFileSync(file, html);
  try {
    const result = spawnSync(browser, ['--headless','--disable-gpu','--no-first-run','--no-default-browser-check',
      '--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND','--user-data-dir='+path.join(folder,'profile'),
      '--dump-dom','--virtual-time-budget=3000',pathToFileURL(file).href], {encoding:'utf8',timeout:25000,maxBuffer:4*1024*1024,windowsHide:true});
    assert.ifError(result.error);
    const actual = result.stdout?.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];
    assert.equal(actual, 'PASS', actual || result.stderr?.slice(-1500));
  } finally {
    if (path.dirname(folder) === path.resolve(os.tmpdir()) && path.basename(folder).startsWith('character-identity-')) {
      fs.rmSync(folder, {recursive:true,force:true,maxRetries:5,retryDelay:200});
    }
  }
});
