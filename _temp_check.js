
// ===== MESSAGE BOARD =====
var msgFabOpen = false;
var aiWritingMsg = false;
var currentViewingMsgId = null;
var editingMsgSticker = 'none';

var MSG_STICKERS = [
  { id: 'none', svg: '<svg style="width:20px;height:20px" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>', label: '无' },
  { id: 'heart', svg: '<svg style="width:20px;height:20px;color:#fb7185" fill="currentColor" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>', label: '爱心' },
  { id: 'star', svg: '<svg style="width:20px;height:20px;color:#f59e0b" fill="currentColor" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>', label: '星星' },
  { id: 'smile', svg: '<svg style="width:20px;height:20px;color:#f59e0b" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>', label: '微笑' },
  { id: 'hug', svg: '<svg style="width:20px;height:20px;color:#a78bfa" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M7 9.5C7 9.5 8 8 9.5 9"/><path d="M17 9.5C17 9.5 16 8 14.5 9"/><path d="M5 12c-1 0-2 .5-2 2s1 2 2 2"/><path d="M19 12c1 0 2 .5 2 2s-1 2-2 2"/></svg>', label: '拥抱' },
  { id: 'kiss', svg: '<svg style="width:20px;height:20px;color:#fb7185" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/><path d="M16 5l1.5 1.5L16 8" fill="none"/><path d="M18.5 5L20 6.5 18.5 8" fill="none"/></svg>', label: '亲亲' },
  { id: 'moon', svg: '<svg style="width:20px;height:20px;color:#6366f1" fill="currentColor" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>', label: '月亮' },
  { id: 'sun', svg: '<svg style="width:20px;height:20px;color:#f59e0b" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>', label: '太阳' },
  { id: 'rainbow', svg: '<svg style="width:20px;height:20px" fill="none" stroke-width="2" viewBox="0 0 24 24"><path d="M2 18C2 11.37 7.37 6 14 6s12 5.37 12 12" stroke="#ef4444" fill="none"/><path d="M5 18C5 13.03 9.03 9 14 9s9 4.03 9 9" stroke="#f59e0b" fill="none"/><path d="M8 18c0-3.31 2.69-6 6-6s6 2.69 6 6" stroke="#22c55e" fill="none"/></svg>', label: '彩虹' },
  { id: 'flower', svg: '<svg style="width:20px;height:20px;color:#fb7185" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="#f59e0b"/><circle cx="12" cy="6" r="3" opacity="0.8"/><circle cx="17.2" cy="9" r="3" opacity="0.8"/><circle cx="15.5" cy="15" r="3" opacity="0.8"/><circle cx="8.5" cy="15" r="3" opacity="0.8"/><circle cx="6.8" cy="9" r="3" opacity="0.8"/></svg>', label: '花' }
];

function getStickerSvg(id) {
  var s = MSG_STICKERS.find(function(x) { return x.id === id; });
  return s ? s.svg : '';
}

// --- Storage ---
function getMessages() {
  if (!currentCharId) return [];
  try { return JSON.parse(localStorage.getItem('coupleMessages_' + currentCharId)) || []; }
  catch(e) { return []; }
}
function saveMessages(list) {
  if (!currentCharId) return;
  localStorage.setItem('coupleMessages_' + currentCharId, JSON.stringify(list));
}
function getMsgSettings() {
  if (!currentCharId) return {};
  try { return JSON.parse(localStorage.getItem('coupleMessageSettings_' + currentCharId)) || {}; }
  catch(e) { return {}; }
}
function saveMsgSettings(s) {
  if (!currentCharId) return;
  localStorage.setItem('coupleMessageSettings_' + currentCharId, JSON.stringify(s));
}

function notifyMsgChanged() {
  window.parent.postMessage({
    type: 'coupleSpaceMessageChanged',
    charId: currentCharId,
    items: getMessages()
  }, '*');
}
function notifyMsgSettingsChanged() {
  window.parent.postMessage({
    type: 'coupleSpaceMessageSettingsChanged',
    charId: currentCharId,
    settings: getMsgSettings()
  }, '*');
}

// --- List ---
function renderMsgList() {
  var container = document.getElementById('msg-list-container');
  if (!container) return;
  var msgs = getMessages();
  msgs.sort(function(a, b) { return b.createdAt - a.createdAt; });

  if (msgs.length === 0 && !aiWritingMsg) {
    container.innerHTML = '<div class="msg-empty">' +
      '<svg class="msg-empty-icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      '<span class="msg-empty-text">还没有留言，写下第一条吧</span></div>';
    return;
  }

  var html = '';
  if (aiWritingMsg) {
    html += '<div class="msg-ai-writing"><div class="diary-ai-dots"><span></span><span></span><span></span></div>' + escHtml(csCharName) + ' 正在写留言...</div>';
  }
  msgs.forEach(function(m) {
    var isChar = m.author === 'char';
    var avatar = isChar ? csCharAvatar : csUserAvatar;
    var name = isChar ? csCharName : csUserName;
    var commentCount = (m.comments || []).length;
    var heartCount = 0;
    if (m.hearts) { if (m.hearts.user) heartCount++; if (m.hearts.char) heartCount++; }
    var stickerHtml = (m.sticker && m.sticker !== 'none') ? '<div class="msg-card-sticker">' + getStickerSvg(m.sticker) + '</div>' : '';

    html += '<div class="msg-card" onclick="openMsgDetail(\'' + m.id + '\')">' +
      stickerHtml +
      '<div class="msg-card-top">' +
        '<div class="msg-card-avatar" style="background-image:url(' + escAttr(avatar) + ')"></div>' +
        '<div class="msg-card-meta"><div class="msg-card-author">' + escHtml(name) + '</div>' +
        '<div class="msg-card-date">' + fmtRelativeDate(m.createdAt) + '</div></div>' +
      '</div>' +
      '<div class="msg-card-content">' + escHtml(m.content) + '</div>' +
      '<div class="msg-card-footer">' +
        '<span class="msg-card-heart' + (heartCount > 0 ? ' active' : '') + '"><svg style="width:14px;height:14px" fill="' + (heartCount > 0 ? '#fb7185' : 'none') + '" stroke="' + (heartCount > 0 ? '#fb7185' : 'currentColor') + '" stroke-width="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> ' + heartCount + '</span>' +
        '<svg style="width:14px;height:14px;margin-left:auto;color:#c8c5c2" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
        '<span>' + commentCount + '</span>' +
      '</div></div>';
  });
  container.innerHTML = html;
}

// --- FAB ---
function toggleMsgFab() {
  msgFabOpen = !msgFabOpen;
  var menu = document.getElementById('msg-fab-menu');
  var btn = document.getElementById('msg-fab-btn');
  if (msgFabOpen) {
    menu.style.display = 'flex';
    menu.innerHTML =
      '<div class="album-fab-option animate-fade-in" onclick="openMsgWrite()">' +
        '<svg style="width:18px;height:18px;color:#78716c;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' +
        '我来写' +
      '</div>' +
      '<div class="album-fab-option animate-fade-in" onclick="requestAiMsg()">' +
        '<svg style="width:18px;height:18px;color:#78716c;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
        '让TA写' +
      '</div>';
    btn.innerHTML = '<svg class="icon-lg" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  } else {
    menu.style.display = 'none';
    btn.innerHTML = SVG_PLUS;
  }
}
function closeMsgFab() { if (msgFabOpen) toggleMsgFab(); }

// --- Request AI Message ---
function requestAiMsg() {
  closeMsgFab();
  if (aiWritingMsg) return;
  aiWritingMsg = true;
  renderMsgList();
  var settings = getMsgSettings();
  window.parent.postMessage({
    type: 'coupleSpaceMessageAiRequest',
    charId: currentCharId,
    existingMessages: getMessages(),
    messageSettings: settings
  }, '*');
}

// --- Write Message ---
function openMsgWrite() {
  closeMsgFab();
  editingMsgSticker = 'none';
  document.getElementById('msg-write-content').value = '';
  renderMsgStickerRow();
  document.getElementById('msg-write-page').classList.add('active');
  document.getElementById('feature-wrapper').classList.remove('active');
}
function closeMsgWrite() {
  document.getElementById('msg-write-page').classList.remove('active');
  document.getElementById('feature-wrapper').classList.add('active');
}
function renderMsgStickerRow() {
  var row = document.getElementById('msg-sticker-row');
  row.innerHTML = MSG_STICKERS.map(function(s) {
    return '<button class="msg-sticker-chip' + (editingMsgSticker === s.id ? ' active' : '') + '" onclick="selectMsgSticker(\'' + s.id + '\')" title="' + s.label + '">' + s.svg + '</button>';
  }).join('');
}
function selectMsgSticker(id) {
  editingMsgSticker = id;
  renderMsgStickerRow();
}
function saveMsgItem() {
  var content = document.getElementById('msg-write-content').value.trim();
  if (!content) return;
  var msgs = getMessages();
  msgs.push({
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    content: content,
    sticker: editingMsgSticker,
    author: 'user',
    createdAt: Date.now(),
    hearts: { user: true },
    comments: []
  });
  saveMessages(msgs);
  closeMsgWrite();
  renderMsgList();
  notifyMsgChanged();
  // Ask AI to reply
  var settings = getMsgSettings();
  window.parent.postMessage({
    type: 'coupleSpaceMessageReplyRequest',
    charId: currentCharId,
    msgId: msgs[msgs.length - 1].id,
    msgContent: content,
    msgDate: new Date().toLocaleString('zh-CN')
  }, '*');
  // Ask AI to heart
  window.parent.postMessage({
    type: 'coupleSpaceMessageHeartRequest',
    charId: currentCharId,
    msgId: msgs[msgs.length - 1].id,
    msgContent: content
  }, '*');
}

// --- Detail ---
function openMsgDetail(id) {
  currentViewingMsgId = id;
  var msgs = getMessages();
  var m = msgs.find(function(x) { return x.id === id; });
  if (!m) return;

  var isChar = m.author === 'char';
  var avatar = isChar ? csCharAvatar : csUserAvatar;
  var name = isChar ? csCharName : csUserName;
  var userHearted = m.hearts && m.hearts.user;
  var charHearted = m.hearts && m.hearts.char;

  var html = '';
  if (m.sticker && m.sticker !== 'none') {
    html += '<div class="msg-detail-sticker">' + getStickerSvg(m.sticker) + '</div>';
  }
  html += '<div class="msg-detail-author-row">' +
    '<div class="msg-detail-avatar" style="background-image:url(' + escAttr(avatar) + ')"></div>' +
    '<div><div class="msg-detail-author-name">' + escHtml(name) + '</div>' +
    '<div class="msg-detail-date">' + fmtRelativeDate(m.createdAt) + '</div></div></div>';
  html += '<div class="msg-detail-content">' + escHtml(m.content) + '</div>';

  // Hearts
  html += '<div class="msg-detail-hearts">' +
    '<button class="msg-detail-heart-btn' + (userHearted ? ' active' : '') + '" onclick="toggleMsgHeart(\'' + id + '\',\'user\')">' +
      '<svg style="width:16px;height:16px" fill="' + (userHearted ? '#fb7185' : 'none') + '" stroke="' + (userHearted ? '#fb7185' : 'currentColor') + '" stroke-width="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> ' + escHtml(csUserName) +
    '</button>' +
    '<button class="msg-detail-heart-btn' + (charHearted ? ' active' : '') + '" style="pointer-events:none">' +
      '<svg style="width:16px;height:16px" fill="' + (charHearted ? '#fb7185' : 'none') + '" stroke="' + (charHearted ? '#fb7185' : 'currentColor') + '" stroke-width="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> ' + escHtml(csCharName) +
    '</button>' +
  '</div>';

  // Comments
  html += '<div class="msg-comments-section"><div class="msg-comments-title">评论</div>';
  var comments = m.comments || [];
  if (comments.length === 0) {
    html += '<div class="msg-comment-empty">暂无评论</div>';
  } else {
    comments.forEach(function(c) {
      var cIsChar = c.author === 'char';
      var cAvatar = cIsChar ? csCharAvatar : csUserAvatar;
      var cName = cIsChar ? csCharName : csUserName;
      html += '<div class="msg-comment-item">' +
        '<div class="msg-comment-avatar" style="background-image:url(' + escAttr(cAvatar) + ')"></div>' +
        '<div class="msg-comment-body">' +
          '<span class="msg-comment-name">' + escHtml(cName) + '</span>' +
          '<span class="msg-comment-time">' + fmtRelativeDate(c.timestamp) + '</span>' +
          '<div class="msg-comment-text">' + escHtml(c.content) + '</div>' +
        '</div></div>';
    });
  }
  html += '</div>';

  document.getElementById('msg-detail-scroll').innerHTML = html;
  document.getElementById('msg-detail-page').classList.add('active');
  document.getElementById('feature-wrapper').classList.remove('active');
  document.getElementById('msg-comment-input').value = '';
  updateMsgCommentBtn();
}
function closeMsgDetail() {
  currentViewingMsgId = null;
  document.getElementById('msg-detail-page').classList.remove('active');
  document.getElementById('feature-wrapper').classList.add('active');
  renderMsgList();
}
function deleteMsgFromDetail() {
  if (!currentViewingMsgId) return;
  if (!confirm('确定删除这条留言？')) return;
  var msgs = getMessages();
  msgs = msgs.filter(function(m) { return m.id !== currentViewingMsgId; });
  saveMessages(msgs);
  notifyMsgChanged();
  closeMsgDetail();
}

function toggleMsgHeart(id, who) {
  var msgs = getMessages();
  var m = msgs.find(function(x) { return x.id === id; });
  if (!m) return;
  if (!m.hearts) m.hearts = {};
  m.hearts[who] = !m.hearts[who];
  saveMessages(msgs);
  notifyMsgChanged();
  openMsgDetail(id);
  // If user hearted, ask AI
  if (who === 'user' && m.hearts.user) {
    window.parent.postMessage({
      type: 'coupleSpaceMessageHeartRequest',
      charId: currentCharId,
      msgId: id,
      msgContent: m.content
    }, '*');
  }
}

function updateMsgCommentBtn() {
  var val = document.getElementById('msg-comment-input').value.trim();
  var btn = document.getElementById('msg-comment-send');
  if (val) btn.classList.remove('disabled');
  else btn.classList.add('disabled');
}
function sendMsgComment() {
  var val = document.getElementById('msg-comment-input').value.trim();
  if (!val || !currentViewingMsgId) return;
  var msgs = getMessages();
  var m = msgs.find(function(x) { return x.id === currentViewingMsgId; });
  if (!m) return;
  if (!m.comments) m.comments = [];
  m.comments.push({ author: 'user', content: val, timestamp: Date.now() });
  saveMessages(msgs);
  notifyMsgChanged();
  document.getElementById('msg-comment-input').value = '';
  updateMsgCommentBtn();
  openMsgDetail(currentViewingMsgId);
  // Ask AI to reply to comment
  window.parent.postMessage({
    type: 'coupleSpaceMessageReplyRequest',
    charId: currentCharId,
    msgId: currentViewingMsgId,
    msgContent: m.content + '\n\n用户评论: ' + val,
    msgDate: new Date().toLocaleString('zh-CN')
  }, '*');
}

function showMsgToast(msg) {
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#1c1917;color:white;padding:10px 24px;border-radius:9999px;font-size:13px;z-index:100;pointer-events:none;animation:fadeIn .2s ease';
  toast.textContent = msg;
  document.getElementById('app').appendChild(toast);
  setTimeout(function() { toast.remove(); }, 2000);
}

// --- Settings ---
var DEFAULT_MSG_PROMPT = '# 你的任务\n你是"{{charName}}"，现在要在情侣空间的留言板上给"{{myNickname}}"留一条言。\n留言板是你们之间的小纸条，随意、温暖、真实。\n\n# 你的角色设定\n{{aiPersona}}\n\n# 你的伴侣\n- 昵称: {{myNickname}}\n- 人设: {{myPersona}}\n\n{{worldBook}}\n\n{{memoryContext}}\n\n{{shortTermMemory}}\n\n{{linkedMemory}}\n\n{{summaryContext}}\n\n{{anniversaryContext}}\n\n{{existingCharMessages}}\n\n{{existingUserMessages}}\n\n# 当前时间\n{{currentTime}}\n\n# 输出要求\n请以JSON格式返回，不要输出任何其他内容：\n{"content": "留言内容", "sticker": "贴纸ID"}\n\n贴纸ID可选值: none, heart, star, smile, hug, kiss, moon, sun, rainbow, flower\n\n# 写作要求\n- 像在便签纸上写给对方的话，自然随意\n- 可以是想说的话、碎碎念、撒娇、关心、分享心情、表白等\n- 字数在15-200字之间\n- 语气要符合你的角色设定\n- 基于记忆和最近的对话，不要凭空编造\n- 绝对不要提到你是AI';

function openMsgSettings() {
  var settings = getMsgSettings();
  var overlay = document.createElement('div');
  overlay.className = 'diary-settings-overlay animate-fade-in';
  overlay.id = 'msg-settings-overlay';

  var autoEnabled = settings.autoEnabled || false;
  var aiDecide = settings.aiDecide || false;
  var visCharMsgs = settings.visibleCharMessages ?? 10;
  var visUserMsgs = settings.visibleUserMessages ?? 10;
  var enableCustomPrompt = settings.enableCustomPrompt || false;
  var promptText = settings.customPrompt || DEFAULT_MSG_PROMPT;

  overlay.innerHTML = '<div class="diary-settings-sheet animate-slide-up">' +
    '<div class="diary-settings-handle"></div>' +
    '<div class="diary-settings-title">留言设置</div>' +

    '<div class="diary-setting-item">' +
      '<div><div class="diary-setting-label">角色自动留言</div>' +
      '<div class="diary-setting-desc">角色会在设定时间自动留言</div></div>' +
      '<div class="diary-toggle' + (autoEnabled ? ' on' : '') + '" id="msg-toggle-auto" onclick="toggleMsgSetting(\'auto\')"></div>' +
    '</div>' +

    '<div class="diary-setting-item">' +
      '<div><div class="diary-setting-label">自动留言时间</div></div>' +
      '<input type="time" class="diary-time-select" id="msg-auto-time" value="' + (settings.autoTime || '20:00') + '" onchange="updateMsgAutoTime()" />' +
    '</div>' +

    '<div class="diary-setting-item">' +
      '<div><div class="diary-setting-label">AI 自主决定</div>' +
      '<div class="diary-setting-desc">让 AI 自己判断是否要留言</div></div>' +
      '<div class="diary-toggle' + (aiDecide ? ' on' : '') + '" id="msg-toggle-decide" onclick="toggleMsgSetting(\'decide\')"></div>' +
    '</div>' +

    '<div style="padding-top:16px;margin-top:8px;border-top:1px solid #f0efed">' +
      '<div class="diary-setting-item">' +
        '<div><div class="diary-setting-label">AI可见角色留言数</div>' +
        '<div class="diary-setting-desc">AI能看到多少条角色的留言及评论</div></div>' +
        '<input type="number" class="diary-time-select" style="width:60px" id="msg-vis-char" value="' + visCharMsgs + '" min="0" max="50" onchange="updateMsgVisibility()" />' +
      '</div>' +
      '<div class="diary-setting-item">' +
        '<div><div class="diary-setting-label">AI可见用户留言数</div>' +
        '<div class="diary-setting-desc">AI能看到多少条你的留言及评论</div></div>' +
        '<input type="number" class="diary-time-select" style="width:60px" id="msg-vis-user" value="' + visUserMsgs + '" min="0" max="50" onchange="updateMsgVisibility()" />' +
      '</div>' +
    '</div>' +

    '<div style="padding-top:16px;margin-top:8px;border-top:1px solid #f0efed">' +
      '<div class="diary-setting-item">' +
        '<div><div class="diary-setting-label">自定义留言生成提示词</div>' +
        '<div class="diary-setting-desc">自定义 AI 写留言时使用的提示词模板</div></div>' +
        '<div class="diary-toggle' + (enableCustomPrompt ? ' on' : '') + '" id="msg-toggle-prompt" onclick="toggleMsgPromptSetting()"></div>' +
      '</div>' +
      '<div class="diary-prompt-section" id="msg-prompt-section" style="' + (enableCustomPrompt ? '' : 'display:none') + '">' +
        '<textarea class="diary-prompt-textarea" id="msg-prompt-textarea" placeholder="输入自定义提示词...">' + escHtml(promptText) + '</textarea>' +
        '<div class="diary-prompt-actions">' +
          '<button class="diary-prompt-action-btn" onclick="saveMsgPromptText()">保存</button>' +
          '<button class="diary-prompt-action-btn warn" onclick="resetMsgPrompt()">重置默认</button>' +
        '</div>' +
        '<div style="margin-top:8px;font-size:11px;color:#a8a29e;line-height:1.5">可用变量: {{charName}} {{myNickname}} {{aiPersona}} {{myPersona}} {{worldBook}} {{memoryContext}} {{shortTermMemory}} {{linkedMemory}} {{summaryContext}} {{existingCharMessages}} {{existingUserMessages}} {{currentTime}} {{anniversaryContext}}</div>' +
      '</div>' +
    '</div>' +

  '</div>';

  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeMsgSettings(); });
  document.getElementById('app').appendChild(overlay);
}

function closeMsgSettings() {
  var el = document.getElementById('msg-settings-overlay');
  if (el) el.remove();
}

function toggleMsgSetting(key) {
  var settings = getMsgSettings();
  if (key === 'auto') {
    settings.autoEnabled = !settings.autoEnabled;
    document.getElementById('msg-toggle-auto').classList.toggle('on', settings.autoEnabled);
  } else if (key === 'decide') {
    settings.aiDecide = !settings.aiDecide;
    document.getElementById('msg-toggle-decide').classList.toggle('on', settings.aiDecide);
  }
  saveMsgSettings(settings);
  notifyMsgSettingsChanged();
}

function updateMsgAutoTime() {
  var settings = getMsgSettings();
  settings.autoTime = document.getElementById('msg-auto-time').value;
  saveMsgSettings(settings);
  notifyMsgSettingsChanged();
}

function updateMsgVisibility() {
  var settings = getMsgSettings();
  settings.visibleCharMessages = parseInt(document.getElementById('msg-vis-char').value) || 10;
  settings.visibleUserMessages = parseInt(document.getElementById('msg-vis-user').value) || 10;
  saveMsgSettings(settings);
  notifyMsgSettingsChanged();
}

function toggleMsgPromptSetting() {
  var settings = getMsgSettings();
  settings.enableCustomPrompt = !settings.enableCustomPrompt;
  saveMsgSettings(settings);
  var toggle = document.getElementById('msg-toggle-prompt');
  toggle.classList.toggle('on', settings.enableCustomPrompt);
  var section = document.getElementById('msg-prompt-section');
  section.style.display = settings.enableCustomPrompt ? '' : 'none';
  if (settings.enableCustomPrompt && !settings.customPrompt) {
    document.getElementById('msg-prompt-textarea').value = DEFAULT_MSG_PROMPT;
  }
}

function saveMsgPromptText() {
  var settings = getMsgSettings();
  settings.customPrompt = document.getElementById('msg-prompt-textarea').value;
  saveMsgSettings(settings);
  notifyMsgSettingsChanged();
  showMsgToast('提示词已保存');
}

function resetMsgPrompt() {
  document.getElementById('msg-prompt-textarea').value = DEFAULT_MSG_PROMPT;
  var settings = getMsgSettings();
  settings.customPrompt = '';
  saveMsgSettings(settings);
  notifyMsgSettingsChanged();
  showMsgToast('已重置为默认');
}

// ========== TIMELINE (时光轴) ==========
var TL_CATEGORIES = [
  { id: 'milestone', label: '里程碑', color: '#e11d48' },
  { id: 'moment', label: '小确幸', color: '#2563eb' },
  { id: 'growth', label: '成长', color: '#059669' },
  { id: 'memory', label: '回忆', color: '#d97706' },
  { id: 'wish', label: '心愿', color: '#db2777' }
];
var tlFabOpen = false;
var aiWritingTl = false;
var currentViewingTlId = null;
var editingTlCategory = 'moment';

function getTlItems() {
  if (!currentCharId) return [];
  try { return JSON.parse(localStorage.getItem('coupleTimeline_' + currentCharId)) || []; }
  catch(e) { return []; }
}
function saveTlItems(list) {
  if (!currentCharId) return;
  localStorage.setItem('coupleTimeline_' + currentCharId, JSON.stringify(list));
}
function getTlSettings() {
  if (!currentCharId) return {};
  try { return JSON.parse(localStorage.getItem('coupleTimelineSettings_' + currentCharId)) || {}; }
  catch(e) { return {}; }
}
function saveTlSettings(s) {
  if (!currentCharId) return;
  localStorage.setItem('coupleTimelineSettings_' + currentCharId, JSON.stringify(s));
}
function notifyTlChanged() {
  window.parent.postMessage({ type: 'coupleSpaceTimelineChanged', charId: currentCharId, items: getTlItems() }, '*');
}
function notifyTlSettingsChanged() {
  window.parent.postMessage({ type: 'coupleSpaceTimelineSettingsChanged', charId: currentCharId, settings: getTlSettings() }, '*');
}

function renderTlList() {
  var container = document.getElementById('tl-list-container');
  if (!container) return;
  var items = getTlItems();
  items.sort(function(a, b) { return b.createdAt - a.createdAt; });

  if (items.length === 0 && !aiWritingTl) {
    container.innerHTML = '<div class="tl-empty" style="padding-left:0">' +
      '<svg class="tl-empty-icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
      '<span class="tl-empty-text">时光轴还是空的，记录第一个瞬间吧</span></div>';
    return;
  }

  var html = '';
  if (aiWritingTl) {
    html += '<div class="tl-node"><div class="tl-dot char"><div class="tl-dot-inner"></div></div>' +
      '<div class="tl-ai-writing"><div class="diary-ai-dots"><span></span><span></span><span></span></div>' + escHtml(csCharName) + ' 正在记录...</div></div>';
  }

  var lastDateStr = '';
  items.forEach(function(item) {
    var d = new Date(item.createdAt);
    var dateStr = d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
    if (dateStr !== lastDateStr) {
      html += '<div class="tl-date-header">' + dateStr + '</div>';
      lastDateStr = dateStr;
    }
    var isChar = item.author === 'char';
    var avatar = isChar ? csCharAvatar : csUserAvatar;
    var name = isChar ? csCharName : csUserName;
    var heartCount = 0;
    if (item.hearts) { if (item.hearts.user) heartCount++; if (item.hearts.char) heartCount++; }
    var cat = TL_CATEGORIES.find(function(c) { return c.id === item.category; }) || TL_CATEGORIES[1];

    html += '<div class="tl-node"><div class="tl-dot' + (isChar ? ' char' : '') + '"><div class="tl-dot-inner"></div></div>' +
      '<div class="tl-card" onclick="openTlDetail(\'' + item.id + '\')">' +
        '<div class="tl-card-top">' +
          '<div class="tl-card-avatar" style="background-image:url(' + escAttr(avatar) + ')"></div>' +
          '<span class="tl-card-name">' + escHtml(name) + '</span>' +
          '<span class="tl-card-date">' + fmtRelativeDate(item.createdAt) + '</span>' +
        '</div>' +
        '<div class="tl-card-title">' + escHtml(item.title) + '</div>' +
        '<div class="tl-card-content">' + escHtml(item.content) + '</div>' +
        '<div class="tl-card-footer">' +
          '<span class="tl-card-tag ' + cat.id + '">' + cat.label + '</span>' +
          '<span class="tl-card-heart' + (heartCount > 0 ? ' active' : '') + '">' +
            '<svg style="width:14px;height:14px" fill="' + (heartCount > 0 ? '#fb7185' : 'none') + '" stroke="' + (heartCount > 0 ? '#fb7185' : 'currentColor') + '" stroke-width="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> ' + heartCount +
          '</span>' +
        '</div>' +
      '</div></div>';
  });
  container.innerHTML = html;
}

// --- FAB ---
function toggleTlFab() {
  tlFabOpen = !tlFabOpen;
  var menu = document.getElementById('tl-fab-menu');
  var btn = document.getElementById('tl-fab-btn');
  if (tlFabOpen) {
    menu.style.display = 'flex';
    menu.innerHTML =
      '<div class="album-fab-option animate-fade-in" onclick="openTlWrite()">' +
        '<svg style="width:18px;height:18px;color:#78716c;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' +
        '我来记录' +
      '</div>' +
      '<div class="album-fab-option animate-fade-in" onclick="requestAiTl()">' +
        '<svg style="width:18px;height:18px;color:#78716c;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
        '让TA记录' +
      '</div>';
    btn.innerHTML = '<svg class="icon-lg" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  } else {
    menu.style.display = 'none';
    btn.innerHTML = SVG_PLUS;
  }
}
function closeTlFab() { if (tlFabOpen) toggleTlFab(); }

// --- Request AI Timeline ---
function requestAiTl() {
  closeTlFab();
  if (aiWritingTl) return;
  aiWritingTl = true;
  renderTlList();
  var settings = getTlSettings();
  var items = getTlItems();
  var charItems = items.filter(function(i) { return i.author === 'char'; }).slice(-( settings.visibleCharItems || 10));
  var userItems = items.filter(function(i) { return i.author === 'user'; }).slice(-(settings.visibleUserItems || 10));
  window.parent.postMessage({
    type: 'coupleSpaceTimelineAiRequest',
    charId: currentCharId,
    existingItems: items,
    charItems: charItems,
    userItems: userItems,
    timelineSettings: settings
  }, '*');
}

// --- Write ---
function openTlWrite() {
  closeTlFab();
  editingTlCategory = 'moment';
  document.getElementById('tl-write-title').value = '';
  document.getElementById('tl-write-content').value = '';
  renderTlCatRow();
  document.getElementById('tl-write-page').classList.add('active');
  document.getElementById('feature-wrapper').classList.remove('active');
}
function closeTlWrite() {
  document.getElementById('tl-write-page').classList.remove('active');
  document.getElementById('feature-wrapper').classList.add('active');
}
function renderTlCatRow() {
  var row = document.getElementById('tl-cat-row');
  row.innerHTML = TL_CATEGORIES.map(function(c) {
    return '<button class="tl-write-cat-chip' + (editingTlCategory === c.id ? ' active' : '') + '" onclick="selectTlCat(\'' + c.id + '\')">' + c.label + '</button>';
  }).join('');
}
function selectTlCat(id) {
  editingTlCategory = id;
  renderTlCatRow();
}
function saveTlItem() {
  var title = document.getElementById('tl-write-title').value.trim();
  var content = document.getElementById('tl-write-content').value.trim();
  if (!title || !content) return;
  var items = getTlItems();
  var newItem = {
    id: 'tl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    title: title,
    content: content,
    category: editingTlCategory,
    author: 'user',
    createdAt: Date.now(),
    hearts: { user: true },
    comments: []
  };
  items.push(newItem);
  saveTlItems(items);
  closeTlWrite();
  renderTlList();
  notifyTlChanged();
  // Ask AI to comment
  window.parent.postMessage({
    type: 'coupleSpaceTimelineCommentRequest',
    charId: currentCharId,
    itemId: newItem.id,
    itemTitle: title,
    itemContent: content,
    itemCategory: editingTlCategory,
    itemAuthor: 'user'
  }, '*');
  // Ask AI to heart
  window.parent.postMessage({
    type: 'coupleSpaceTimelineHeartRequest',
    charId: currentCharId,
    itemId: newItem.id,
    itemContent: title + ': ' + content
  }, '*');
}

// --- Detail ---
function openTlDetail(id) {
  var items = getTlItems();
  var item = items.find(function(x) { return x.id === id; });
  if (!item) return;
  currentViewingTlId = id;
  var isChar = item.author === 'char';
  var avatar = isChar ? csCharAvatar : csUserAvatar;
  var name = isChar ? csCharName : csUserName;
  var cat = TL_CATEGORIES.find(function(c) { return c.id === item.category; }) || TL_CATEGORIES[1];
  var d = new Date(item.createdAt);
  var dateStr = d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');

  var userHearted = item.hearts && item.hearts.user;
  var charHearted = item.hearts && item.hearts.char;

  var html = '<div class="tl-detail-tags"><span class="tl-card-tag ' + cat.id + '">' + cat.label + '</span></div>' +
    '<div class="tl-detail-title">' + escHtml(item.title) + '</div>' +
    '<div class="tl-detail-author-row">' +
      '<div class="tl-detail-avatar" style="background-image:url(' + escAttr(avatar) + ')"></div>' +
      '<div><div class="tl-detail-author-name">' + escHtml(name) + '</div>' +
      '<div class="tl-detail-date">' + dateStr + '</div></div>' +
    '</div>' +
    '<div class="tl-detail-content">' + escHtml(item.content) + '</div>' +
    '<div class="tl-detail-hearts">' +
      '<button class="tl-detail-heart-btn' + (userHearted ? ' active' : '') + '" onclick="toggleTlHeart(\'' + id + '\',\'user\')">' +
        '<svg style="width:16px;height:16px" fill="' + (userHearted ? '#fb7185' : 'none') + '" stroke="' + (userHearted ? '#fb7185' : 'currentColor') + '" stroke-width="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
        escHtml(csUserName) +
      '</button>' +
      '<button class="tl-detail-heart-btn' + (charHearted ? ' active' : '') + '" style="pointer-events:none">' +
        '<svg style="width:16px;height:16px" fill="' + (charHearted ? '#fb7185' : 'none') + '" stroke="' + (charHearted ? '#fb7185' : 'currentColor') + '" stroke-width="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
        escHtml(csCharName) +
      '</button>' +
    '</div>';

  // Comments
  if (item.comments && item.comments.length > 0) {
    html += '<div class="tl-detail-comments">';
    item.comments.forEach(function(c) {
      var cIsChar = c.author === 'char';
      var cAvatar = cIsChar ? csCharAvatar : csUserAvatar;
      var cName = cIsChar ? csCharName : csUserName;
      html += '<div class="tl-detail-comment">' +
        '<div class="tl-detail-comment-avatar" style="background-image:url(' + escAttr(cAvatar) + ')"></div>' +
        '<div class="tl-detail-comment-body">' +
          '<div class="tl-detail-comment-name">' + escHtml(cName) + '</div>' +
          '<div class="tl-detail-comment-text">' + escHtml(c.content) + '</div>' +
          '<div class="tl-detail-comment-time">' + fmtRelativeDate(c.timestamp) + '</div>' +
        '</div></div>';
    });
    html += '</div>';
  }

  document.getElementById('tl-detail-scroll').innerHTML = html;
  document.getElementById('tl-detail-page').classList.add('active');
  document.getElementById('feature-wrapper').classList.remove('active');
}
function closeTlDetail() {
  currentViewingTlId = null;
  document.getElementById('tl-detail-page').classList.remove('active');
  document.getElementById('feature-wrapper').classList.add('active');
  renderTlList();
}
function showTlDeleteConfirm() {
  if (!currentViewingTlId) return;
  if (confirm('确定删除这条时光记录吗？')) {
    var items = getTlItems().filter(function(x) { return x.id !== currentViewingTlId; });
    saveTlItems(items);
    notifyTlChanged();
    closeTlDetail();
  }
}
function toggleTlHeart(id, who) {
  var items = getTlItems();
  var item = items.find(function(x) { return x.id === id; });
  if (!item) return;
  if (!item.hearts) item.hearts = {};
  item.hearts[who] = !item.hearts[who];
  saveTlItems(items);
  notifyTlChanged();
  openTlDetail(id);
  if (who === 'user' && item.hearts.user) {
    window.parent.postMessage({
      type: 'coupleSpaceTimelineHeartRequest',
      charId: currentCharId,
      itemId: id,
      itemContent: item.title + ': ' + item.content
    }, '*');
  }
}
function updateTlCommentBtn() {
  var val = document.getElementById('tl-comment-input').value.trim();
  var btn = document.getElementById('tl-comment-send-btn');
  if (val) btn.classList.remove('disabled');
  else btn.classList.add('disabled');
}
function sendTlComment() {
  var val = document.getElementById('tl-comment-input').value.trim();
  if (!val || !currentViewingTlId) return;
  var items = getTlItems();
  var item = items.find(function(x) { return x.id === currentViewingTlId; });
  if (!item) return;
  if (!item.comments) item.comments = [];
  item.comments.push({ author: 'user', content: val, timestamp: Date.now() });
  saveTlItems(items);
  notifyTlChanged();
  document.getElementById('tl-comment-input').value = '';
  updateTlCommentBtn();
  openTlDetail(currentViewingTlId);
  // Ask AI to reply
  window.parent.postMessage({
    type: 'coupleSpaceTimelineCommentRequest',
    charId: currentCharId,
    itemId: currentViewingTlId,
    itemTitle: item.title,
    itemContent: item.content + '\n\n用户评论: ' + val,
    itemCategory: item.category,
    itemAuthor: item.author
  }, '*');
}

function showTlToast(msg) {
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#1c1917;color:white;padding:10px 24px;border-radius:9999px;font-size:13px;z-index:100;pointer-events:none;animation:fadeIn .2s ease';
  toast.textContent = msg;
  document.getElementById('app').appendChild(toast);
  setTimeout(function() { toast.remove(); }, 2000);
}

// --- Settings ---
var DEFAULT_TL_PROMPT = '# 你的任务\n你是"{{charName}}"，现在要在情侣空间的时光轴上记录一个瞬间。\n时光轴是你们共同的回忆线，记录在一起的点点滴滴。\n\n# 你的角色设定\n{{aiPersona}}\n\n# 你的伴侣\n- 昵称: {{myNickname}}\n- 人设: {{myPersona}}\n\n{{worldBook}}\n\n{{memoryContext}}\n\n{{shortTermMemory}}\n\n{{linkedMemory}}\n\n{{summaryContext}}\n\n{{anniversaryContext}}\n\n{{existingCharItems}}\n\n{{existingUserItems}}\n\n# 当前时间\n{{currentTime}}\n\n# 输出要求\n请以JSON格式返回，不要输出任何其他内容：\n{"title": "标题", "content": "正文", "category": "分类ID"}\n\n分类ID可选值: milestone(里程碑), moment(小确幸), growth(成长), memory(回忆), wish(心愿)\n\n# 写作要求\n- 以第一人称记录，像在时光轴上留下印记\n- 内容基于你的记忆和最近发生的事\n- 可以是你们之间的重要时刻、温馨瞬间、成长感悟、美好回忆、未来心愿\n- 字数在50-300字之间\n- 语气符合你的角色设定\n- 不要和已有的记录重复\n- 绝对不要提到你是AI';

function openTlSettings() {
  var settings = getTlSettings();
  var overlay = document.createElement('div');
  overlay.className = 'diary-settings-overlay animate-fade-in';
  overlay.id = 'tl-settings-overlay';

  var autoEnabled = settings.autoEnabled || false;
  var aiDecide = settings.aiDecide || false;
  var visCharItems = settings.visibleCharItems ?? 10;
  var visUserItems = settings.visibleUserItems ?? 10;
  var enableCustomPrompt = settings.enableCustomPrompt || false;
  var promptText = settings.customPrompt || DEFAULT_TL_PROMPT;

  overlay.innerHTML = '<div class="diary-settings-sheet animate-slide-up">' +
    '<div class="diary-settings-handle"></div>' +
    '<div class="diary-settings-title">时光轴设置</div>' +

    '<div class="diary-setting-item">' +
      '<div><div class="diary-setting-label">角色自动记录</div>' +
      '<div class="diary-setting-desc">角色会在设定时间自动记录时光</div></div>' +
      '<div class="diary-toggle' + (autoEnabled ? ' on' : '') + '" id="tl-toggle-auto" onclick="toggleTlSetting(\'auto\')"></div>' +
    '</div>' +

    '<div class="diary-setting-item">' +
      '<div><div class="diary-setting-label">自动记录时间</div></div>' +
      '<input type="time" class="diary-time-select" id="tl-auto-time" value="' + (settings.autoTime || '21:00') + '" onchange="updateTlAutoTime()" />' +
    '</div>' +

    '<div class="diary-setting-item">' +
      '<div><div class="diary-setting-label">AI 自主决定</div>' +
      '<div class="diary-setting-desc">让 AI 自己判断是否要记录</div></div>' +
      '<div class="diary-toggle' + (aiDecide ? ' on' : '') + '" id="tl-toggle-decide" onclick="toggleTlSetting(\'decide\')"></div>' +
    '</div>' +

    '<div style="padding-top:16px;margin-top:8px;border-top:1px solid #f0efed">' +
      '<div class="diary-setting-item">' +
        '<div><div class="diary-setting-label">AI可见角色记录数</div>' +
        '<div class="diary-setting-desc">AI能看到多少条角色的时光记录</div></div>' +
        '<input type="number" class="diary-time-select" style="width:60px" id="tl-vis-char" value="' + visCharItems + '" min="0" max="50" onchange="updateTlVisibility()" />' +
      '</div>' +
      '<div class="diary-setting-item">' +
        '<div><div class="diary-setting-label">AI可见用户记录数</div>' +
        '<div class="diary-setting-desc">AI能看到多少条你的时光记录</div></div>' +
        '<input type="number" class="diary-time-select" style="width:60px" id="tl-vis-user" value="' + visUserItems + '" min="0" max="50" onchange="updateTlVisibility()" />' +
      '</div>' +
    '</div>' +

    '<div style="padding-top:16px;margin-top:8px;border-top:1px solid #f0efed">' +
      '<div class="diary-setting-item">' +
        '<div><div class="diary-setting-label">自定义时光生成提示词</div>' +
        '<div class="diary-setting-desc">自定义 AI 记录时光时使用的提示词模板</div></div>' +
        '<div class="diary-toggle' + (enableCustomPrompt ? ' on' : '') + '" id="tl-toggle-prompt" onclick="toggleTlPromptSetting()"></div>' +
      '</div>' +
      '<div class="diary-prompt-section" id="tl-prompt-section" style="' + (enableCustomPrompt ? '' : 'display:none') + '">' +
        '<textarea class="diary-prompt-textarea" id="tl-prompt-textarea" placeholder="输入自定义提示词...">' + escHtml(promptText) + '</textarea>' +
        '<div class="diary-prompt-actions">' +
          '<button class="diary-prompt-action-btn" onclick="saveTlPromptText()">保存</button>' +
          '<button class="diary-prompt-action-btn warn" onclick="resetTlPrompt()">重置默认</button>' +
        '</div>' +
        '<div style="margin-top:8px;font-size:11px;color:#a8a29e;line-height:1.5">可用变量: {{charName}} {{myNickname}} {{aiPersona}} {{myPersona}} {{worldBook}} {{memoryContext}} {{shortTermMemory}} {{linkedMemory}} {{summaryContext}} {{existingCharItems}} {{existingUserItems}} {{currentTime}} {{anniversaryContext}}</div>' +
      '</div>' +
    '</div>' +

  '</div>';

  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeTlSettings(); });
  document.getElementById('app').appendChild(overlay);
}

function closeTlSettings() {
  var el = document.getElementById('tl-settings-overlay');
  if (el) el.remove();
}

function toggleTlSetting(key) {
  var settings = getTlSettings();
  if (key === 'auto') {
    settings.autoEnabled = !settings.autoEnabled;
    document.getElementById('tl-toggle-auto').classList.toggle('on', settings.autoEnabled);
  } else if (key === 'decide') {
    settings.aiDecide = !settings.aiDecide;
    document.getElementById('tl-toggle-decide').classList.toggle('on', settings.aiDecide);
  }
  saveTlSettings(settings);
  notifyTlSettingsChanged();
}

function updateTlAutoTime() {
  var settings = getTlSettings();
  settings.autoTime = document.getElementById('tl-auto-time').value;
  saveTlSettings(settings);
  notifyTlSettingsChanged();
}

function updateTlVisibility() {
  var settings = getTlSettings();
  settings.visibleCharItems = parseInt(document.getElementById('tl-vis-char').value) || 10;
  settings.visibleUserItems = parseInt(document.getElementById('tl-vis-user').value) || 10;
  saveTlSettings(settings);
  notifyTlSettingsChanged();
}

function toggleTlPromptSetting() {
  var settings = getTlSettings();
  settings.enableCustomPrompt = !settings.enableCustomPrompt;
  saveTlSettings(settings);
  var toggle = document.getElementById('tl-toggle-prompt');
  toggle.classList.toggle('on', settings.enableCustomPrompt);
  var section = document.getElementById('tl-prompt-section');
  section.style.display = settings.enableCustomPrompt ? '' : 'none';
  if (settings.enableCustomPrompt && !settings.customPrompt) {
    document.getElementById('tl-prompt-textarea').value = DEFAULT_TL_PROMPT;
  }
}

function saveTlPromptText() {
  var settings = getTlSettings();
  settings.customPrompt = document.getElementById('tl-prompt-textarea').value;
  saveTlSettings(settings);
  notifyTlSettingsChanged();
  showTlToast('提示词已保存');
}

function resetTlPrompt() {
  document.getElementById('tl-prompt-textarea').value = DEFAULT_TL_PROMPT;
  var settings = getTlSettings();
  settings.customPrompt = '';
  saveTlSettings(settings);
  notifyTlSettingsChanged();
  showTlToast('已重置为默认');
}

// --- Message handlers from parent ---
window.addEventListener('message', function(e) {
  // AI generated timeline item
  if (e.data && e.data.type === 'coupleSpaceTimelineAiResult') {
    if (e.data.error) {
      showTlToast('记录失败，请重试');
      aiWritingTl = false;
      renderTlList();
      return;
    }
    var items = getTlItems();
    items.push({
      id: 'tl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: e.data.title,
      content: e.data.content,
      category: e.data.category || 'moment',
      author: 'char',
      createdAt: Date.now(),
      hearts: { char: true },
      comments: []
    });
    saveTlItems(items);
    aiWritingTl = false;
    renderTlList();
    showTlToast((csCharName || 'TA') + '记录了一个瞬间');
    notifyTlChanged();
  }

  // AI comment result
  if (e.data && e.data.type === 'coupleSpaceTimelineCommentResult') {
    if (e.data.error || !e.data.comment) return;
    var items = getTlItems();
    var item = items.find(function(x) { return x.id === e.data.itemId; });
    if (item) {
      if (!item.comments) item.comments = [];
      item.comments.push({ author: 'char', content: e.data.comment, timestamp: Date.now() });
      saveTlItems(items);
      if (currentViewingTlId === e.data.itemId) openTlDetail(e.data.itemId);
      else renderTlList();
      notifyTlChanged();
    }
  }

  // AI heart result
  if (e.data && e.data.type === 'coupleSpaceTimelineHeartResult') {
    if (!e.data.liked) return;
    var items = getTlItems();
    var item = items.find(function(x) { return x.id === e.data.itemId; });
    if (item) {
      if (!item.hearts) item.hearts = {};
      item.hearts.char = true;
      saveTlItems(items);
      if (currentViewingTlId === e.data.itemId) openTlDetail(e.data.itemId);
      else renderTlList();
      showTlToast((csCharName || 'TA') + '也点了爱心');
      notifyTlChanged();
    }
  }

  // Auto timeline result
  if (e.data && e.data.type === 'coupleSpaceTimelineAutoResult') {
    var items = getTlItems();
    items.push(e.data.item);
    saveTlItems(items);
    renderTlList();
    showTlToast((csCharName || 'TA') + '记录了一个瞬间');
  }
});
