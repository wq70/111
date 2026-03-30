// ============================================================
// message-actions.js — 消息操作模块
// 来源：script.js 第 23435~24565 行 + 第 31537~32326 行
// 功能：消息操作菜单、排除/恢复消息、批量管理排除消息、
//       翻译消息、编辑消息、复制消息、高级消息编辑器、
//       AI响应编辑器（导演模式）、撤回消息
// ============================================================

(function () {
  // state 通过全局作用域访问（window.state，由 init-and-state.js 初始化）

  function showMessageActions(timestamp) {
    const chat = state.chats[state.activeChatId];
    document.getElementById('publish-to-announcement-btn').style.display = chat.isGroup ? 'block' : 'none';

    if (isSelectionMode) return;

    activeMessageTimestamp = timestamp;
    document.getElementById('message-actions-modal').classList.add('visible');
  }

  function hideMessageActions() {
    document.getElementById('message-actions-modal').classList.remove('visible');
    activeMessageTimestamp = null;
  }

  // ========== 排除/恢复消息 (省Token) ==========
  async function toggleExcludeMessage() {
    if (!activeMessageTimestamp) return;
    const chat = state.chats[state.activeChatId];
    const msg = chat.history.find(m => m.timestamp === activeMessageTimestamp);
    if (!msg) return;
    hideMessageActions();
    msg.isExcluded = !msg.isExcluded;
    await db.chats.put(chat);
    // 更新DOM上的样式
    const wrapper = document.querySelector(`.message-bubble[data-timestamp="${msg.timestamp}"]`)?.closest('.message-wrapper');
    if (wrapper) {
      wrapper.classList.toggle('msg-excluded', msg.isExcluded);
    }
    console.log(`[排除消息] timestamp=${msg.timestamp}, isExcluded=${msg.isExcluded}`);
  }

  async function toggleExcludeSelectedMessages() {
    if (selectedMessages.size === 0) return;
    const chat = state.chats[state.activeChatId];
    // 判断：如果选中的消息中有任何一条未排除的，则全部排除；否则全部恢复
    const selectedMsgs = chat.history.filter(m => selectedMessages.has(m.timestamp));
    const hasAnyNotExcluded = selectedMsgs.some(m => !m.isExcluded);
    const newState = hasAnyNotExcluded; // true = 排除, false = 恢复
    selectedMsgs.forEach(m => { m.isExcluded = newState; });
    await db.chats.put(chat);
    // 更新DOM
    selectedMsgs.forEach(m => {
      const wrapper = document.querySelector(`.message-bubble[data-timestamp="${m.timestamp}"]`)?.closest('.message-wrapper');
      if (wrapper) wrapper.classList.toggle('msg-excluded', m.isExcluded);
    });
    const actionText = newState ? '排除' : '恢复';
    console.log(`[批量排除] ${actionText}了 ${selectedMsgs.length} 条消息`);
    exitSelectionMode();
  }

  // ========== 批量管理排除消息 (聊天详情入口) ==========
  let batchExcludeChecked = new Set();

  function openBatchExcludeManager() {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;
    batchExcludeChecked = new Set();
    window.batchExcludeChecked = batchExcludeChecked;
    const listEl = document.getElementById('batch-exclude-list');
    // 只显示非系统隐藏的消息（用户可见的消息）
    const visibleMsgs = chat.history.filter(m => !m.isHidden);
    if (visibleMsgs.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;color:#8a8a8a;padding:40px;">暂无消息</div>';
    } else {
      listEl.innerHTML = '';
      visibleMsgs.forEach(msg => {
        const item = document.createElement('div');
        item.className = 'batch-exclude-item' + (msg.isExcluded ? ' is-excluded' : '');
        item.dataset.timestamp = msg.timestamp;
        const sender = msg.role === 'user' ? (chat.settings.myNickname || '我') : (msg.senderName || chat.name);
        const time = new Date(msg.timestamp);
        const timeStr = `${time.getMonth()+1}/${time.getDate()} ${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}`;
        let preview = '';
        if (typeof msg.content === 'string') {
          preview = msg.content.substring(0, 60);
          if (msg.content.length > 60) preview += '...';
        } else if (msg.type === 'ai_image') preview = '[图片]';
        else if (msg.type === 'voice_message') preview = '[语音]';
        else if (msg.type === 'sticker') preview = '[表情]';
        else if (msg.type === 'transfer') preview = '[转账]';
        else preview = '[消息]';
        item.innerHTML = `<div class="bei-checkbox"></div><div class="bei-content"><div class="bei-meta">${escapeHTML(sender)} · ${timeStr}</div><div class="bei-text">${escapeHTML(preview)}</div></div>${msg.isExcluded ? '<span class="bei-tag">已排除</span>' : ''}`;
        item.addEventListener('click', () => {
          const ts = msg.timestamp;
          if (batchExcludeChecked.has(ts)) {
            batchExcludeChecked.delete(ts);
            item.classList.remove('checked');
          } else {
            batchExcludeChecked.add(ts);
            item.classList.add('checked');
          }
          document.getElementById('batch-exclude-selected-count').textContent = `已选 ${batchExcludeChecked.size} 条`;
        });
        listEl.appendChild(item);
      });
    }
    document.getElementById('batch-exclude-selected-count').textContent = '已选 0 条';
    document.getElementById('batch-exclude-modal').classList.add('visible');
  }

  function closeBatchExcludeManager() {
    document.getElementById('batch-exclude-modal').classList.remove('visible');
    batchExcludeChecked = new Set();
    window.batchExcludeChecked = batchExcludeChecked;
  }

  function openExcludedDetailView() {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;
    const listEl = document.getElementById('excluded-detail-list');
    const visibleMsgs = chat.history.filter(m => !m.isHidden);
    const hasExcluded = visibleMsgs.some(m => m.isExcluded);
    if (!hasExcluded) {
      listEl.innerHTML = '<div style="text-align:center;color:#8a8a8a;padding:40px;">当前没有被排除的消息</div>';
      document.getElementById('excluded-detail-modal').classList.add('visible');
      return;
    }
    // 把连续排除的消息合并成范围
    const ranges = [];
    let currentRange = null;
    visibleMsgs.forEach((msg, idx) => {
      if (msg.isExcluded) {
        if (!currentRange) {
          currentRange = { startIdx: idx, endIdx: idx, msgs: [msg] };
        } else {
          currentRange.endIdx = idx;
          currentRange.msgs.push(msg);
        }
      } else {
        if (currentRange) { ranges.push(currentRange); currentRange = null; }
      }
    });
    if (currentRange) ranges.push(currentRange);

    function getMsgPreview(msg) {
      if (typeof msg.content === 'string') {
        const t = msg.content.substring(0, 40);
        return t + (msg.content.length > 40 ? '...' : '');
      }
      if (msg.type === 'ai_image') return '[图片]';
      if (msg.type === 'voice_message') return '[语音]';
      if (msg.type === 'sticker') return '[表情]';
      if (msg.type === 'transfer') return '[转账]';
      return '[消息]';
    }
    function getSender(msg) {
      return msg.role === 'user' ? (chat.settings.myNickname || '我') : (msg.senderName || chat.name);
    }
    function fmtTime(ts) {
      const t = new Date(ts);
      return `${t.getMonth()+1}/${t.getDate()} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
    }

    listEl.innerHTML = '';
    ranges.forEach((range, ri) => {
      const card = document.createElement('div');
      card.style.cssText = 'padding: 12px 15px; border-bottom: 1px solid var(--border-color, #eee);';
      const count = range.msgs.length;
      const isSingle = count === 1;
      // 标题行：范围 + 恢复按钮
      const header = document.createElement('div');
      header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;';
      const label = document.createElement('div');
      label.style.cssText = 'font-size: 14px; font-weight: 500; color: var(--text-color);';
      if (isSingle) {
        label.textContent = `第 ${range.startIdx + 1} 条`;
      } else {
        label.textContent = `第 ${range.startIdx + 1} ~ ${range.endIdx + 1} 条 (共${count}条)`;
      }
      const restoreBtn = document.createElement('span');
      restoreBtn.textContent = '恢复此区间';
      restoreBtn.style.cssText = 'color: var(--accent-color); font-size: 12px; cursor: pointer; white-space: nowrap;';
      restoreBtn.addEventListener('click', async () => {
        range.msgs.forEach(m => { m.isExcluded = false; });
        await db.chats.put(chat);
        card.remove();
        range.msgs.forEach(m => {
          const w = document.querySelector(`.message-bubble[data-timestamp="${m.timestamp}"]`)?.closest('.message-wrapper');
          if (w) w.classList.remove('msg-excluded');
        });
        if (!chat.history.some(m => m.isExcluded && !m.isHidden)) {
          listEl.innerHTML = '<div style="text-align:center;color:#8a8a8a;padding:40px;">当前没有被排除的消息</div>';
        }
        updateTokenCountDisplay();
      });
      header.appendChild(label);
      header.appendChild(restoreBtn);
      card.appendChild(header);
      // 预览：显示首尾消息
      const previewDiv = document.createElement('div');
      previewDiv.style.cssText = 'font-size: 12px; color: var(--text-secondary); line-height: 1.6;';
      const first = range.msgs[0];
      const last = range.msgs[count - 1];
      let previewHtml = `${escapeHTML(getSender(first))}：${escapeHTML(getMsgPreview(first))}`;
      if (!isSingle) {
        previewHtml += `<br>...<br>${escapeHTML(getSender(last))}：${escapeHTML(getMsgPreview(last))}`;
      }
      previewHtml += `<div style="margin-top: 4px; font-size: 11px; color: #aaa;">${fmtTime(first.timestamp)}${isSingle ? '' : ' ~ ' + fmtTime(last.timestamp)}</div>`;
      previewDiv.innerHTML = previewHtml;
      card.appendChild(previewDiv);
      listEl.appendChild(card);
    });
    document.getElementById('excluded-detail-modal').classList.add('visible');
  }

  function closeExcludedDetailView() {
    document.getElementById('excluded-detail-modal').classList.remove('visible');
  }

  async function batchExcludeAction(exclude) {
    if (batchExcludeChecked.size === 0) return;
    const chat = state.chats[state.activeChatId];
    if (!chat) return;
    let count = 0;
    chat.history.forEach(m => {
      if (batchExcludeChecked.has(m.timestamp)) {
        m.isExcluded = exclude;
        count++;
      }
    });
    await db.chats.put(chat);
    closeBatchExcludeManager();
    renderChatInterface(state.activeChatId);
    updateTokenCountDisplay();
    console.log(`[批量管理] ${exclude ? '排除' : '恢复'}了 ${count} 条消息`);
  }

  // 翻译消息内容函数
  async function translateMessageContent() {
    if (!activeMessageTimestamp) return;

    const chat = state.chats[state.activeChatId];
    const message = chat.history.find(m => m.timestamp === activeMessageTimestamp);
    if (!message) return;

    hideMessageActions();

    // 获取要翻译的文本
    let textToTranslate;
    if (typeof message.content === 'object') {
      textToTranslate = JSON.stringify(message.content);
    } else {
      textToTranslate = String(message.content);
    }

    // 如果文本为空或太短，不翻译
    if (!textToTranslate || textToTranslate.trim().length === 0) {
      await showCustomAlert('翻译失败', '消息内容为空，无法翻译。');
      return;
    }

    try {
      // 显示加载提示
      await showCustomAlert('翻译中...', '正在调用翻译服务，请稍候...');

      // 如果文本太长，截取前500字符
      const textToSend = textToTranslate.length > 500
        ? textToTranslate.substring(0, 500) + '...'
        : textToTranslate;

      // 简单的语言检测
      function detectLanguage(text) {
        // 检测是否包含中文字符
        if (/[\u4e00-\u9fa5]/.test(text)) {
          return 'zh-CN';
        }
        // 检测是否包含日文字符
        if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
          return 'ja';
        }
        // 检测是否包含韩文字符
        if (/[\uac00-\ud7af]/.test(text)) {
          return 'ko';
        }
        // 检测是否包含俄文字符
        if (/[\u0400-\u04ff]/.test(text)) {
          return 'ru';
        }
        // 默认为英文
        return 'en';
      }

      const sourceLang = detectLanguage(textToSend);
      const targetLang = 'zh-CN'; // 目标语言：简体中文

      // 如果检测到已经是中文，尝试翻译成英文
      const finalTargetLang = sourceLang === 'zh-CN' ? 'en' : 'zh-CN';

      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToSend)}&langpair=${sourceLang}|${finalTargetLang}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`翻译API返回错误: ${response.status}`);
      }

      const data = await response.json();

      if (data.responseStatus !== 200) {
        throw new Error(data.responseDetails || '翻译服务返回错误');
      }

      const translatedText = data.responseData.translatedText;

      // 显示翻译结果
      const langName = {
        'en': '英文',
        'ja': '日文',
        'ko': '韩文',
        'ru': '俄文',
        'zh-CN': '中文'
      };

      await showCustomAlert(
        '翻译结果',
        `检测语言：${langName[sourceLang] || sourceLang}\n\n原文：\n${textToSend}\n\n译文：\n${translatedText}`
      );

    } catch (err) {
      console.error('翻译失败:', err);
      await showCustomAlert('翻译失败', `无法翻译消息内容：${err.message}\n\n提示：您可以尝试使用浏览器自带的翻译功能。`);
    }
  }



  async function openMessageEditor() {
    if (!activeMessageTimestamp) return;

    const timestampToEdit = activeMessageTimestamp;
    const chat = state.chats[state.activeChatId];
    const message = chat.history.find(m => m.timestamp === timestampToEdit);
    if (!message) return;

    hideMessageActions();

    let contentForEditing;

    const isSpecialType = message.type && ['voice_message', 'ai_image', 'transfer', 'share_link'].includes(message.type);

    if (isSpecialType) {
      let fullMessageObject = {
        type: message.type
      };
      if (message.type === 'voice_message') fullMessageObject.content = message.content;
      else if (message.type === 'ai_image') fullMessageObject.description = message.content;
      else if (message.type === 'transfer') {
        fullMessageObject.amount = message.amount;
        fullMessageObject.note = message.note;
      } else if (message.type === 'share_link') {
        fullMessageObject.title = message.title;
        fullMessageObject.description = message.description;
        fullMessageObject.source_name = message.source_name;
        fullMessageObject.content = message.content;
      }
      contentForEditing = JSON.stringify(fullMessageObject, null, 2);
    } else if (typeof message.content === 'object') {
      contentForEditing = JSON.stringify(message.content, null, 2);
    } else {
      contentForEditing = message.content;
    }


    const templates = {
      voice: {
        type: 'voice_message',
        content: '在这里输入语音内容'
      },
      image: {
        type: 'ai_image',
        description: '在这里输入图片描述'
      },
      transfer: {
        type: 'transfer',
        amount: 5.20,
        note: '一点心意'
      },
      link: {
        type: 'share_link',
        title: '文章标题',
        description: '文章摘要...',
        source_name: '来源网站',
        content: '文章完整内容...'
      }
    };


    const helpersHtml = `
                <div class="format-helpers">
                    <button class="format-btn" data-template='${JSON.stringify(templates.voice)}'>语音</button>
                    <button class="format-btn" data-template='${JSON.stringify(templates.image)}'>图片</button>
                    <button class="format-btn" data-template='${JSON.stringify(templates.transfer)}'>转账</button>
                    <button class="format-btn" data-template='${JSON.stringify(templates.link)}'>链接</button>
                </div>
            `;

    const newContent = await showCustomPrompt(
      '编辑消息',
      '在此修改，或点击上方按钮使用格式模板...',
      contentForEditing,
      'textarea',
      helpersHtml
    );

    if (newContent !== null) {

      await saveEditedMessage(timestampToEdit, newContent, true);
    }
  }



  async function copyMessageContent() {
    if (!activeMessageTimestamp) return;
    const chat = state.chats[state.activeChatId];
    const message = chat.history.find(m => m.timestamp === activeMessageTimestamp);
    if (!message) return;

    let textToCopy;

    if (message.type === 'offline_text') {

      if (message.content) {
        textToCopy = message.content;
      } else {
        textToCopy = `「${message.dialogue || ''}」\n${message.description || ''}`;
      }
    } else if (typeof message.content === 'object') {
      textToCopy = JSON.stringify(message.content);
    } else {
      textToCopy = String(message.content);
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      await showCustomAlert('复制成功', '消息内容已复制到剪贴板。');
    } catch (err) {
      await showCustomAlert('复制失败', '无法访问剪贴板。');
    }

    hideMessageActions();
  }



  async function copyMessageTimestamp() {
    if (!activeMessageTimestamp) return;

    try {
      await navigator.clipboard.writeText(activeMessageTimestamp);
      await showCustomAlert('复制成功', `消息时间戳 ${activeMessageTimestamp} 已复制到剪贴板。`);
    } catch (err) {
      await showCustomAlert('复制失败', '无法访问剪贴板。');
    }

    hideMessageActions();
  }



  function createMessageEditorBlock(initialContent = '') {
    const block = document.createElement('div');
    block.className = 'message-editor-block';


    const templates = {
      voice: {
        type: 'voice_message',
        content: '在这里输入语音内容'
      },
      image: {
        type: 'ai_image',
        description: '在这里输入图片描述'
      },
      transfer: {
        type: 'transfer',
        amount: 5.20,
        note: '一点心意'
      },
      link: {
        type: 'share_link',
        title: '文章标题',
        description: '文章摘要...',
        source_name: '来源网站',
        content: '文章完整内容...'
      },
      offline: {
        type: 'offline_text',
        content: '「在这里输入对话内容」\n(在这里输入动作或环境描写)'
      },
      quote: {
        type: 'quote_reply',
        target_timestamp: 1234567890,
        reply_content: '在这里输入回复内容'
      },

      nai: {
        type: 'naiimag',
        prompt: '1girl, best quality, masterpiece, ...'
      },
      // 【关键修改】：添加旁白模板
      narration: {
        type: 'narration',
        content: '在这里输入环境或心理描写...'
      }

    };

    block.innerHTML = `
        <button class="delete-block-btn" title="删除此条">×</button>
        <textarea>${initialContent}</textarea>
        <div class="format-helpers">
            <button class="format-btn" data-template='${JSON.stringify(templates.voice)}'>语音</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.image)}'>图片</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.transfer)}'>转账</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.link)}'>链接</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.offline)}'>线下</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.quote)}'>引用</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.nai)}' style="color: #6a329f; border-color: #6a329f;">NAI生图</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.narration)}' style="color: #888; border-color: #ccc;">旁白</button>
            </div>
    `;


    block.querySelector('.delete-block-btn').addEventListener('click', () => {

      if (document.querySelectorAll('.message-editor-block').length > 1) {
        block.remove();
      } else {
        alert('至少需要保留一条消息。');
      }
    });


    block.querySelectorAll('.format-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const templateStr = btn.dataset.template;
        const textarea = block.querySelector('textarea');
        if (templateStr && textarea) {
          try {
            const templateObj = JSON.parse(templateStr);
            textarea.value = JSON.stringify(templateObj, null, 2);
            textarea.focus();
          } catch (e) {
            console.error("解析格式模板失败:", e);
          }
        }
      });
    });

    return block;
  }




  async function openAdvancedMessageEditor() {
    if (!activeMessageTimestamp) return;

    const timestampToEdit = activeMessageTimestamp;
    const chat = state.chats[state.activeChatId];
    const message = chat.history.find(m => m.timestamp === timestampToEdit);
    if (!message) return;

    hideMessageActions();

    const editorModal = document.getElementById('message-editor-modal');
    const editorContainer = document.getElementById('message-editor-container');
    editorContainer.innerHTML = '';

    let initialContent;

    if (message.quote) {

      const quoteReplyObject = {
        type: 'quote_reply',
        target_timestamp: message.quote.timestamp,
        reply_content: message.content
      };

      initialContent = JSON.stringify(quoteReplyObject, null, 2);
    }


    else if (message.type && ['voice_message', 'ai_image', 'transfer', 'offline_text', 'share_link', 'naiimag', 'narration'].includes(message.type)) {
      let fullMessageObject = {
        type: message.type
      };
      if (message.type === 'voice_message') fullMessageObject.content = message.content;
      else if (message.type === 'ai_image') fullMessageObject.description = message.content;
      else if (message.type === 'transfer') {
        fullMessageObject.amount = message.amount;
        fullMessageObject.note = message.note;
      } else if (message.type === 'offline_text') {
        if (message.content) {
          fullMessageObject.content = message.content;
        } else {
          fullMessageObject.dialogue = message.dialogue;
          fullMessageObject.description = message.description;
        }
      } else if (message.type === 'share_link') {
        fullMessageObject.title = message.title;
        fullMessageObject.description = message.description;
        fullMessageObject.source_name = message.source_name;
        fullMessageObject.content = message.content;
      }

      else if (message.type === 'naiimag') {
        fullMessageObject.prompt = message.prompt;

        fullMessageObject.fullPrompt = message.fullPrompt;
      }
      else if (message.type === 'narration') {
        fullMessageObject.content = message.content;
      }

      initialContent = JSON.stringify(fullMessageObject, null, 2);
    } else if (typeof message.content === 'object') {
      try {
        let safeContent = JSON.parse(JSON.stringify(message.content));
        if (Array.isArray(safeContent)) {
          safeContent.forEach(part => {

            if (part.type === 'image_url' && part.image_url && part.image_url.url && part.image_url.url.length > 500) {
              part.image_url.url = "BASE64_DATA_HIDDEN";
            }
          });
        }
        initialContent = JSON.stringify(safeContent, null, 2);
      } catch (e) {
        console.warn("无法安全处理消息内容，回退到原始显示:", e);
        initialContent = JSON.stringify(message.content, null, 2);
      }
    } else {
      initialContent = message.content;
    }

    const firstBlock = createMessageEditorBlock(initialContent);
    editorContainer.appendChild(firstBlock);


    const addBtn = document.getElementById('add-message-editor-block-btn');
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    newAddBtn.addEventListener('click', () => {
      const newBlock = createMessageEditorBlock();
      editorContainer.appendChild(newBlock);
      newBlock.querySelector('textarea').focus();
    });

    const cancelBtn = document.getElementById('cancel-advanced-editor-btn');
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', () => {
      editorModal.classList.remove('visible');
    });

    const saveBtn = document.getElementById('save-advanced-editor-btn');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener('click', () => {
      saveEditedMessage(timestampToEdit);
    });

    editorModal.classList.add('visible');
  }



  function parseEditedContent(text) {
    const trimmedText = text.trim();


    if (trimmedText.startsWith('{') && trimmedText.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmedText);

        if (parsed.type) {
          return parsed;
        }
      } catch (e) {
      }
    }


    if (STICKER_REGEX.test(trimmedText)) {

      return {
        type: 'sticker',
        content: trimmedText
      };
    }


    return {
      type: 'text',
      content: trimmedText
    };
  }




  async function saveEditedMessage(timestamp, simpleContent = null) {
    if (!timestamp) return;

    const chat = state.chats[state.activeChatId];
    const messageIndex = chat.history.findIndex(m => m.timestamp === timestamp);
    if (messageIndex === -1) return;


    const originalMessage = chat.history[messageIndex];

    let newMessages = [];


    const blocks = simpleContent !== null ?
      [simpleContent] :
      Array.from(document.querySelectorAll('#message-editor-container textarea')).map(ta => ta.value);

    for (const rawContent of blocks) {
      if (!rawContent.trim()) continue;


      const parsedResult = parseEditedContent(rawContent.trim());



      const newMessage = {
        role: originalMessage.role,
        senderName: originalMessage.senderName,
        timestamp: originalMessage.timestamp,
        isHidden: originalMessage.isHidden
      };



      switch (parsedResult.type) {
        case 'text':
          newMessage.type = 'text';
          newMessage.content = parsedResult.content;
          break;
        case 'offline_text':
          newMessage.type = 'offline_text';
          if (parsedResult.content) {
            newMessage.content = parsedResult.content;
          } else {
            newMessage.dialogue = parsedResult.dialogue;
            newMessage.description = parsedResult.description;
          }
          break;
        case 'quote_reply':
          newMessage.type = 'quote_reply';
          newMessage.content = parsedResult.reply_content;
          const originalQuotedMsg = chat.history.find(m => m.timestamp === parsedResult.target_timestamp);
          if (originalQuotedMsg) {
            let originalSenderName = originalQuotedMsg.senderName;
            if (originalQuotedMsg.role === 'user') {
              originalSenderName = state.qzoneSettings.nickname || '{{user}}';
            }
            newMessage.quote = {
              timestamp: parsedResult.target_timestamp,
              senderName: originalSenderName,
              content: String(originalQuotedMsg.content || '')
            };
          } else {
            newMessage.quote = {
              timestamp: parsedResult.target_timestamp,
              senderName: '未知用户',
              content: '原始消息已删除或不存在'
            };
          }
          break;
        case 'voice_message':

        case 'ai_image':
        case 'user_photo':
          newMessage.type = parsedResult.type;
          newMessage.content = parsedResult.content || parsedResult.description;
          if (parsedResult.meaning) newMessage.meaning = parsedResult.meaning;
          break;


        case 'naiimag': {
          const originalMsg = chat.history[messageIndex];
          let newPrompt = parsedResult.prompt;


          let newImageUrl = parsedResult.imageUrl;
          let newFullPrompt = parsedResult.fullPrompt;
          let promptChanged = false;


          if (newPrompt && typeof newPrompt === 'string' && originalMsg.prompt !== newPrompt) {
            promptChanged = true;
          } else {

            newPrompt = originalMsg.prompt;
            newFullPrompt = originalMsg.fullPrompt;
            newImageUrl = originalMsg.imageUrl;
          }

          if (promptChanged) {
            await showCustomAlert("请稍候...", "检测到提示词已修改，正在重新生成 NovelAI 图片...");
            try {

              const generatedData = await generateNaiImageFromPrompt(newPrompt, chat.id);
              newImageUrl = generatedData.imageUrl;
              newFullPrompt = generatedData.fullPrompt;
              await showCustomAlert("成功", "图片已根据新提示词重新生成！");
            } catch (error) {
              console.error("编辑时重新生成NAI图片失败:", error);
              await showCustomAlert("生成失败", `无法重新生成图片: ${error.message}. \n\n将保留旧图片，但提示词会更新。`);

              newImageUrl = originalMsg.imageUrl;
            }
          }


          newMessage.type = 'naiimag';
          newMessage.imageUrl = newImageUrl;
          newMessage.prompt = newPrompt;
          newMessage.fullPrompt = newFullPrompt;
          break;
        }

        case 'googleimag': {
          const originalGoogleMsg = chat.history[messageIndex];
          let googlePrompt = parsedResult.prompt;
          let googleImageUrl = parsedResult.imageUrl;
          let googleFullPrompt = parsedResult.fullPrompt;
          let googlePromptChanged = false;

          if (googlePrompt && typeof googlePrompt === 'string' && originalGoogleMsg.prompt !== googlePrompt) {
            googlePromptChanged = true;
          } else {
            googlePrompt = originalGoogleMsg.prompt;
            googleFullPrompt = originalGoogleMsg.fullPrompt;
            googleImageUrl = originalGoogleMsg.imageUrl;
          }

          if (googlePromptChanged) {
            await showCustomAlert("请稍候...", "检测到提示词已修改，正在重新生成 Google Imagen 图片...");
            try {
              const googleResult = await generateGoogleImagenFromPrompt(googlePrompt);
              googleImageUrl = googleResult.imageUrl;
              googleFullPrompt = googleResult.fullPrompt;
              await showCustomAlert("成功", "图片已根据新提示词重新生成！");
            } catch (error) {
              console.error("编辑时重新生成Google Imagen图片失败:", error);
              await showCustomAlert("生成失败", `无法重新生成图片: ${error.message}. \n\n将保留旧图片，但提示词会更新。`);
              googleImageUrl = originalGoogleMsg.imageUrl;
            }
          }

          newMessage.type = 'googleimag';
          newMessage.imageUrl = googleImageUrl;
          newMessage.prompt = googlePrompt;
          newMessage.fullPrompt = googleFullPrompt;
          break;
        }


        case 'sticker': {
          newMessage.type = 'sticker';
          let found = false;


          if (parsedResult.meaning) {

            const sticker = state.userStickers.find(s => s.name === parsedResult.meaning);
            if (sticker) {

              newMessage.content = sticker.url;
              newMessage.meaning = sticker.name;
              console.log("导演/编辑模式保存(Sticker): 使用了 meaning 查找");
              found = true;
            } else {

              newMessage.type = 'text';
              newMessage.content = `[表情: ${parsedResult.meaning}]`;
              console.warn("导演/编辑模式保存(Sticker): 提供了 meaning 但未找到对应表情:", parsedResult.meaning);
              found = true;
            }
          }



          if (!found && parsedResult.url) {
            newMessage.content = parsedResult.url;

            const stickerByURL = state.userStickers.find(s => s.url === parsedResult.url);

            if (parsedResult.meaning && (!stickerByURL || stickerByURL.name === parsedResult.meaning)) {
              newMessage.meaning = parsedResult.meaning;
            } else if (stickerByURL) {
              newMessage.meaning = stickerByURL.name;
            } else {
              newMessage.meaning = '未知表情';
            }
            console.log("导演/编辑模式保存(Sticker): 使用了 URL，最终 meaning:", newMessage.meaning);
            found = true;
          }


          if (!found && parsedResult.content && typeof parsedResult.content === 'string' && STICKER_REGEX.test(parsedResult.content)) {
            newMessage.content = parsedResult.content;

            const sticker = state.userStickers.find(s => s.url === parsedResult.content);
            newMessage.meaning = sticker ? sticker.name : '未知表情';
            console.log("导演/编辑模式保存(Sticker): 将 content 视为 URL，查找到 meaning:", newMessage.meaning);
            found = true;
          }


          if (!found) {
            console.error("导演/编辑模式保存(Sticker): 指令无效或缺少必要字段 (meaning/url/content):", parsedResult);
            continue;
          }
          break;
        }
        case 'transfer':
          newMessage.type = 'transfer';
          newMessage.amount = parsedResult.amount;
          newMessage.note = parsedResult.note;
          break;
        case 'share_link':
          newMessage.type = 'share_link';
          newMessage.title = parsedResult.title;
          newMessage.description = parsedResult.description;
          newMessage.source_name = parsedResult.source_name;
          newMessage.content = parsedResult.content;
          break;
        default:

          Object.assign(newMessage, parsedResult);
          break;
      }

      newMessages.push(newMessage);
    }

    if (newMessages.length === 0) {
      document.getElementById('message-editor-modal').classList.remove('visible');
      return;
    }



    chat.history.splice(messageIndex, 1, ...newMessages);


    let reassignTimestamp = timestamp;
    for (let i = messageIndex; i < chat.history.length; i++) {
      chat.history[i].timestamp = reassignTimestamp;
      reassignTimestamp++;
    }

    await db.chats.put(chat);
    document.getElementById('message-editor-modal').classList.remove('visible');
    renderChatInterface(state.activeChatId);
    await showCustomAlert('成功', '消息已更新！');
  }



  // ==================== AI响应编辑器（导演模式）====================

  function openAiResponseEditor() {
    if (!lastRawAiResponse) {
      alert("还没有可供编辑的AI响应。请先让AI回复一次。");
      return;
    }

    const editorModal = document.getElementById('ai-response-editor-modal');
    const editorContainer = document.getElementById('ai-response-editor-container');
    editorContainer.innerHTML = '';


    const actionObjects = parseAiResponse(lastRawAiResponse);

    if (actionObjects && actionObjects.length > 0) {

      actionObjects.forEach(actionObj => {


        if (typeof actionObj === 'object' && actionObj !== null) {
          try {

            const formattedJson = JSON.stringify(actionObj, null, 2);
            const block = createAiResponseEditorBlock(formattedJson);
            editorContainer.appendChild(block);
          } catch (e) {

            console.error("在导演模式下 stringify 失败:", actionObj, e);
          }
        } else if (typeof actionObj === 'string') {

          const block = createAiResponseEditorBlock(actionObj);
          editorContainer.appendChild(block);
          console.warn("在导演模式中发现一个无效的片段 (来自parseAiResponse的文本回退):", actionObj);
        }
      });
    } else {

      const block = createAiResponseEditorBlock(lastRawAiResponse);
      editorContainer.appendChild(block);
    }


    editorModal.classList.add('visible');
  }



  function createAiResponseEditorBlock(initialContent = '') {
    const block = document.createElement('div');
    block.className = 'ai-response-editor-block';


    const templates = {
      text: {
        type: 'text',
        content: '在这里输入文本...'
      },
      sticker: {
        type: 'sticker',
        url: 'https://...',
        meaning: '表情含义'
      },
      image: {
        type: 'ai_image',
        description: '在这里输入图片描述...'
      },
      voice: {
        type: 'voice_message',
        content: '在这里输入语音内容...'
      },
      transfer: {
        type: 'transfer',
        amount: 5.20,
        note: '一点心意'
      },
      offline: {
        type: 'offline_text',
        content: '「在这里输入对话内容」\\n(在这里输入动作或环境描写)'
      },
      quote: {
        type: 'quote_reply',
        target_timestamp: 1234567890,
        reply_content: '在这里输入回复内容'
      },

      nai: {
        type: 'naiimag',
        prompt: '1girl, best quality, masterpiece, ...'
      },
      narration: {
        type: 'narration',
        content: '在这里输入环境或心理描写...'
      }


    };

    block.innerHTML = `
        <button class="delete-block-btn" title="删除此条动作">×</button>
        <textarea>${initialContent}</textarea>
        <div class="format-helpers">
            <button class="format-btn" data-template='${JSON.stringify(templates.text)}'>文本</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.sticker)}'>表情</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.image)}'>图片</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.voice)}'>语音</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.transfer)}'>转账</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.offline)}'>线下</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.quote)}'>引用</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.nai)}' style="color: #6a329f; border-color: #6a329f;">NAI生图</button>
            <button class="format-btn" data-template='${JSON.stringify(templates.narration)}' style="color: #888; border-color: #ccc;">旁白</button>
            
            </div>
    `;


    block.querySelector('.delete-block-btn').addEventListener('click', () => {
      block.remove();
    });


    block.querySelectorAll('.format-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const templateStr = btn.dataset.template;
        const textarea = block.querySelector('textarea');
        if (templateStr && textarea) {
          try {
            const templateObj = JSON.parse(templateStr);

            textarea.value = JSON.stringify(templateObj, null, 2);
            textarea.focus();
          } catch (e) {
            console.error("解析格式模板失败:", e);
          }
        }
      });
    });

    return block;
  }


  async function saveEditedAiResponse() {

    const chatsToUpdate = new Map();
    let oldMessageTimestampProvider = null;

    if (lastPrivateMessagesSent.length > 0) {
      console.log(`导演剪辑室：正在撤销 ${lastPrivateMessagesSent.length} 条上一轮发送的私信...`);

      const oldPrivateMessages = [...lastPrivateMessagesSent];
      oldMessageTimestampProvider = oldPrivateMessages.values();

      const chatIdsToUndo = [...new Set(oldPrivateMessages.map(ref => ref.chatId))];

      for (const chatId of chatIdsToUndo) {
        const chat = await db.chats.get(chatId);
        if (chat) {
          chatsToUpdate.set(chatId, chat);
        }
      }

      for (const msgRef of oldPrivateMessages) {
        const chat = chatsToUpdate.get(msgRef.chatId);
        if (chat) {
          chat.history = chat.history.filter(msg => msg.timestamp !== msgRef.timestamp);
        }
      }

      if (chatsToUpdate.size > 0) {
        await db.chats.bulkPut(Array.from(chatsToUpdate.values()));
      }

      lastPrivateMessagesSent = [];
    }

    const chat = state.chats[state.activeChatId];
    if (!chat) return;


    const editorContainer = document.getElementById('ai-response-editor-container');
    const editorTextareas = editorContainer.querySelectorAll('textarea');
    const editedRawBlocks = Array.from(editorTextareas).map(ta => ta.value.trim()).filter(Boolean);



    const originalAiMessages = chat.history.filter(msg => lastResponseTimestamps.includes(msg.timestamp));
    chat.history = chat.history.filter(msg => !lastResponseTimestamps.includes(msg.timestamp));


    if (editedRawBlocks.length === 0) {
      await db.chats.put(chat);
      renderChatInterface(state.activeChatId);
      renderChatList();
      document.getElementById('ai-response-editor-modal').classList.remove('visible');
      lastRawAiResponse = '';
      lastResponseTimestamps = [];
      return;
    }


    let newMessagesArray = [];
    for (const rawContent of editedRawBlocks) {
      try {

        const parsedObject = JSON.parse(rawContent);
        newMessagesArray.push(parsedObject);
      } catch (e) {
        console.warn("跳过一个无法解析为JSON的编辑块:", rawContent);
      }
    }



    const originalNaiMsgs = originalAiMessages.filter(m => m.type === 'naiimag');
    let naiMsgIndex = 0;


    let newTimestamps = [];
    let messageTimestamp = Date.now();
    const privateChatsToSave = new Map();
    const groupChatsToSave = new Map();
    for (const msgData of newMessagesArray) {
      if (!msgData || typeof msgData !== 'object' || !msgData.type) {
        console.warn("在导演模式保存时，发现无效的指令对象，已跳过:", msgData);
        continue;
      }

      // 纠正AI可能返回群昵称而非本名的问题
      if (chat.isGroup && msgData.name) {
        const exactMember = chat.members.find(m => m.originalName === msgData.name);
        if (!exactMember) {
          const nicknameMember = chat.members.find(m => m.groupNickname === msgData.name);
          if (nicknameMember) {
            msgData.name = nicknameMember.originalName;
          }
        }
      }

      let aiMessage = null;
      const baseMessage = {
        role: 'assistant',
        senderName: msgData.name || chat.originalName,
        timestamp: messageTimestamp++
      };

      switch (msgData.type) {
        case 'narration':
          aiMessage = {
            ...baseMessage,
            type: 'narration',
            content: String(msgData.content),
            role: 'system' // 强制设为 system 角色以确保样式正确
          };
          break;
        case 'buy_item': {
          const itemName = msgData.item_name;
          const price = parseFloat(msgData.price);
          const reason = msgData.reason || '想买';

          if (!itemName || isNaN(price) || price <= 0) continue; // 数据无效跳过

          // 1. 重新获取钱包数据（确保实时性）
          const currentWallet = await db.userWallet.get('main');
          const cardIndex = currentWallet?.kinshipCards?.findIndex(c => c.chatId === chat.id);

          if (cardIndex > -1) {
            const card = currentWallet.kinshipCards[cardIndex];
            const remaining = card.limit - (card.spent || 0);

            if (remaining >= price) {
              // 2. 执行扣款
              currentWallet.kinshipCards[cardIndex].spent = (card.spent || 0) + price;
              await db.userWallet.put(currentWallet);

              // 3. 记录账单
              await db.userTransactions.add({
                timestamp: Date.now(),
                type: 'expense',
                amount: price,
                description: `亲属卡消费-${chat.name}-${itemName}`
              });

              // 4. 生成系统通知消息 (AI发送的)
              const successMsg = {
                role: 'assistant', // 或者是 'system'，看你喜好
                senderName: chat.name, // 加上这个确保群聊显示正常
                type: 'text', // 或者用 'pat_message' 样式
                content: `[支付宝通知] 我使用亲属卡消费了 ¥${price.toFixed(2)} 购买了"${itemName}"。\n💭 ${reason}`,
                timestamp: messageTimestamp++
              };

              chat.history.push(successMsg);

              // 如果是当前查看的聊天，直接上屏
              if (isViewingThisChat) {
                appendMessage(successMsg, chat);
              } else {
                // 如果在后台，发送通知
                showNotification(chat.id, `${chat.name} 使用亲属卡消费了 ¥${price}`);
              }

              // 5. (可选) 将购买记录写入角色的模拟淘宝历史，增加真实感
              if (!chat.simulatedTaobaoHistory) chat.simulatedTaobaoHistory = { totalBalance: 0, purchases: [] };
              if (!chat.simulatedTaobaoHistory.purchases) chat.simulatedTaobaoHistory.purchases = [];

              chat.simulatedTaobaoHistory.purchases.unshift({
                itemName: itemName,
                price: price,
                status: '已签收',
                reason: reason,
                image_prompt: `${itemName}, product photography` // 简单生成个prompt
              });

              hasPerformedMajorAction = true; // 标记为已执行重要操作（用于后台活动）
            } else {
              console.log(`AI 想要购买 ${itemName} (¥${price}) 但亲属卡余额不足 (剩 ¥${remaining})`);
              // 可选：让 AI 发一条消息抱怨没钱了
              const failMsg = {
                role: 'assistant',
                senderName: chat.name,
                content: `本来想买"${itemName}"的，但是亲属卡额度好像不够了... (¥${price})`,
                timestamp: messageTimestamp++
              };
              chat.history.push(failMsg);
              if (isViewingThisChat) appendMessage(failMsg, chat);
            }
          }
          continue;
        }
        case 'send_private_message': {
          const senderOriginalName = msgData.name;
          const recipientOriginalName = msgData.recipient;
          const userOriginalName = state.qzoneSettings.nickname || '{{user}}';

          if (recipientOriginalName === userOriginalName) {
            const privateChat = Object.values(state.chats).find(c => !c.isGroup && c.originalName === senderOriginalName);

            if (privateChat) {

              if (!privateChatsToSave.has(privateChat.id)) {

                const freshPrivateChat = chatsToUpdate.get(privateChat.id) || await db.chats.get(privateChat.id);

                privateChatsToSave.set(privateChat.id, freshPrivateChat);
              }

              const chatToUpdate = privateChatsToSave.get(privateChat.id);

              const messagesToSend = Array.isArray(msgData.content) ? msgData.content : [msgData.content];
              let newMessagesCount = 0;

              for (const contentString of messagesToSend) {
                if (!contentString || !contentString.trim()) continue;

                const oldMsgRef = (oldMessageTimestampProvider) ? oldMessageTimestampProvider.next().value : null;

                const timestampToUse = (oldMsgRef && oldMsgRef.chatId === privateChat.id) ?
                  oldMsgRef.timestamp :
                  messageTimestamp++;

                const privateMessage = {
                  role: 'assistant',
                  senderName: senderOriginalName,
                  content: contentString,
                  timestamp: timestampToUse
                };


                lastPrivateMessagesSent.push({
                  chatId: privateChat.id,
                  timestamp: privateMessage.timestamp
                });

                chatToUpdate.history.push(privateMessage);
                newMessagesCount++;
              }

              if (newMessagesCount > 0) {
                if (state.activeChatId !== privateChat.id) {
                  chatToUpdate.unreadCount = (chatToUpdate.unreadCount || 0) + newMessagesCount;
                  showNotification(privateChat.id, `${privateChat.name} 发来了 ${newMessagesCount} 条新消息`);
                }
              }

              aiMessage = null;

            } else {
              console.warn(`AI ${senderOriginalName} 尝试发送私信，但未找到其对应的私聊会话。`);
              aiMessage = null;
            }
          } else {
            console.warn(`AI 尝试发送私信给非用户角色 (${recipientOriginalName})，此功能暂不支持。`);
            aiMessage = null;
          }

          continue;
        }
        case 'send_group_message': {
          const senderOriginalName = msgData.name || chat.originalName;
          const targetGroupName = msgData.targetGroupName;
          const messagesToSend = Array.isArray(msgData.content) ? msgData.content : [String(msgData.content)];

          if (!targetGroupName) {
            console.warn(`导演模式保存(send_group_message): 未指定 targetGroupName，已跳过。`);
            continue;
          }

          // 查找目标群聊，并确保AI是该群的成员
          const targetGroupChat = Object.values(state.chats).find(c =>
            c.isGroup &&
            c.name === targetGroupName &&
            c.members.some(m => m.originalName === senderOriginalName)
          );

          if (targetGroupChat) {
            // 如果群聊尚未被暂存，则从数据库加载最新数据并存入 Map
            if (!groupChatsToSave.has(targetGroupChat.id)) {
              const freshGroupChat = await db.chats.get(targetGroupChat.id);
              groupChatsToSave.set(targetGroupChat.id, freshGroupChat);
            }

            const chatToUpdate = groupChatsToSave.get(targetGroupChat.id);
            let newMessagesCount = 0;

            for (const contentString of messagesToSend) {
              if (!contentString || !contentString.trim()) continue;

              const groupMessage = {
                role: 'assistant',
                senderName: senderOriginalName,
                content: contentString,
                timestamp: messageTimestamp++ // 使用统一的时间戳递增
              };
              chatToUpdate.history.push(groupMessage);
              newMessagesCount++;
            }

            if (newMessagesCount > 0) {
              if (state.activeChatId !== targetGroupChat.id) {
                chatToUpdate.unreadCount = (chatToUpdate.unreadCount || 0) + newMessagesCount;
              }
            }
            aiMessage = null;
          } else {
            console.warn(`导演模式保存(send_group_message): 未找到群聊 "${targetGroupName}" 或角色 "${senderOriginalName}" 不在该群中。`);
            aiMessage = null;
          }
          continue;
        }
        case 'thought_chain': {
          continue;
        }
        case 'text':
          aiMessage = {
            ...baseMessage,
            content: String(msgData.content || msgData.message)
          };
          break;
        case 'sticker': {
          let found = false;
          if (msgData.url && msgData.meaning) {
            aiMessage = {
              ...baseMessage,
              type: 'sticker',
              content: msgData.url,
              meaning: msgData.meaning
            };
            found = true;
          } else if (msgData.meaning) {
            const sticker = findBestStickerMatch(msgData.meaning, state.userStickers);
            if (sticker) {
              aiMessage = {
                ...baseMessage,
                type: 'sticker',
                content: sticker.url,
                meaning: sticker.name
              };
              found = true;
            } else {
              aiMessage = {
                ...baseMessage,
                type: 'text',
                content: `[表情: ${msgData.meaning}]`
              };
              found = true;
            }
          } else if (msgData.url) {
            aiMessage = {
              ...baseMessage,
              type: 'sticker',
              content: msgData.url
            };
            const stickerByURL = state.userStickers.find(s => s.url === msgData.url);
            aiMessage.meaning = stickerByURL ? stickerByURL.name : '未知表情';
            found = true;
          } else if (msgData.content && typeof msgData.content === 'string' && STICKER_REGEX.test(msgData.content)) {
            aiMessage = {
              ...baseMessage,
              type: 'sticker',
              content: msgData.content
            };
            const stickerByContentUrl = state.userStickers.find(s => s.url === msgData.content);
            aiMessage.meaning = stickerByContentUrl ? stickerByContentUrl.name : '未知表情';
            found = true;
          }
          if (!found) {
            console.error("导演模式保存(Sticker): 指令无效或缺少必要字段 (meaning/url/content):", msgData);
            continue;
          }
          break;
        }
        case 'ai_image':
          aiMessage = {
            ...baseMessage,
            type: 'ai_image',
            content: msgData.description,
            image_prompt: msgData.image_prompt
          };
          break;

        case 'naiimag': {
          const newPrompt = msgData.prompt;
          let newImageUrl = null;
          let newFullPrompt = null;


          const originalMsg = originalNaiMsgs[naiMsgIndex];
          naiMsgIndex++; // Increment cursor for the next NAI block

          let promptChanged = false;

          if (originalMsg) {

            const originalPrompt = originalMsg.prompt;


            if (newPrompt && newPrompt !== originalPrompt) {
              console.log("NAI Prompt 已改变，将触发重新生成。");
              promptChanged = true;
            } else {

              console.log("NAI Prompt 未改变，将保留原始图片。");
              newImageUrl = originalMsg.imageUrl;
              newFullPrompt = originalMsg.fullPrompt;
            }
          } else {

            console.log("未找到匹配的原始NAI图片(这是新添加的块)，将触发重新生成。");
            promptChanged = true;
          }

          if (promptChanged) {

            const alertMessage = originalMsg ? "检测到NAI提示词已修改，正在重新生成..." : "检测到新的NAI生图指令，正在生成...";
            await showCustomAlert("请稍候...", alertMessage);

            try {
              const generatedData = await generateNaiImageFromPrompt(newPrompt, chat.id);
              newImageUrl = generatedData.imageUrl;
              newFullPrompt = generatedData.fullPrompt;
              await showCustomAlert("成功", "图片已生成！");
            } catch (error) {
              console.error("导演模式下重新生成NAI图片失败:", error);
              await showCustomAlert("生成失败", `无法生成图片: ${error.message}. \n\n将保留旧图片（如果存在）。`);

              if (originalMsg) {
                newImageUrl = originalMsg.imageUrl; // Fallback to old image
                newFullPrompt = originalMsg.fullPrompt;
              } else {
                console.error("新NAI图片生成失败，此条消息已被跳过。");
                continue; // Skip this message
              }
            }
          }


          aiMessage = {
            ...baseMessage,
            type: 'naiimag',
            imageUrl: newImageUrl,
            prompt: newPrompt,
            fullPrompt: newFullPrompt
          };
          break;
        }

        case 'googleimag': {
          const googlePrompt = msgData.prompt || 'a beautiful scene';
          let googleImageUrl = null;
          let googleFullPrompt = null;

          try {
            const googleResult = await generateGoogleImagenFromPrompt(googlePrompt);
            googleImageUrl = googleResult.imageUrl;
            googleFullPrompt = googleResult.fullPrompt;
          } catch (error) {
            console.error('❌ 后台Google Imagen图片生成失败:', error);
            aiMessage = {
              ...baseMessage,
              content: `[Google Imagen图片生成失败: ${error.message}]`
            };
            break;
          }

          aiMessage = {
            ...baseMessage,
            type: 'googleimag',
            imageUrl: googleImageUrl,
            prompt: googlePrompt,
            fullPrompt: googleFullPrompt
          };
          break;
        }


        case 'voice_message':
          aiMessage = {
            ...baseMessage,
            type: 'voice_message',
            content: msgData.content
          };
          break;
        case 'transfer':
          aiMessage = {
            ...baseMessage,
            type: 'transfer',
            amount: msgData.amount,
            note: msgData.note,
            receiverName: msgData.receiver || '我'
          };
          break;
        case 'waimai_request':
          aiMessage = {
            ...baseMessage,
            type: 'waimai_request',
            productInfo: msgData.productInfo,
            amount: msgData.amount,
            status: 'pending',
            countdownEndTime: Date.now() + 15 * 60 * 1000,
          };
          break;
        case 'offline_text':
          aiMessage = {
            ...baseMessage,
            ...msgData
          };
          break;
        case 'gomoku_move': {
          const gameState = gomokuState[chat.id];
          if (gameState) {
            const lastAiMoveIndex = gameState.history.findLastIndex(move => move.player === 2);
            if (lastAiMoveIndex > -1) {
              const move_to_undo = gameState.history[lastAiMoveIndex];
              gameState.board[move_to_undo.y][move_to_undo.x] = 0;
              gameState.history.splice(lastAiMoveIndex, 1);
              console.log(`导演模式悔棋：已撤销AI在 (${move_to_undo.x}, ${move_to_undo.y}) 的棋步。`);
            }
          }
          const x = parseInt(msgData.x);
          const y = parseInt(msgData.y);
          if (!isNaN(x) && !isNaN(y)) {
            handleAiGomokuMove({
              x: x,
              y: y
            }, true);
          } else {
            console.warn("导演模式保存了一个无效的五子棋移动指令:", msgData);
          }
          continue;
        }
        case 'update_thoughts': {
          if (!chat.isGroup) {
            if (msgData.heartfelt_voice) chat.heartfeltVoice = String(msgData.heartfelt_voice);
            if (msgData.random_jottings) chat.randomJottings = String(msgData.random_jottings);
            if (!Array.isArray(chat.thoughtsHistory)) chat.thoughtsHistory = [];
            chat.thoughtsHistory.push({
              heartfeltVoice: chat.heartfeltVoice,
              randomJottings: chat.randomJottings,
              timestamp: Date.now()
            });
            if (chat.thoughtsHistory.length > 50) chat.thoughtsHistory.shift();
          }
          continue;
        }
        case 'quote_reply': { // 这是在 saveEditedAiResponse() 函数中的
          let originalMessage = null;
          let quoteContext = null;


          if (msgData.target_content) {
            originalMessage = [...chat.history].reverse().find(m =>
              !m.isHidden &&
              (
                m.content === msgData.target_content ||
                (typeof m.content === 'string' && m.content.trim() === msgData.target_content.trim())
              )
            );
            if (!originalMessage) {
              console.warn(`[导演模式保存失败] 尝试引用内容 "${(msgData.target_content || '').substring(0, 20)}..."，但在历史中未找到。`);
            }
          }


          else if (msgData.target_timestamp) {
            originalMessage = chat.history.find(m => m.timestamp === msgData.target_timestamp);
          }


          if (originalMessage) {


            let quotedSenderDisplayName;

            if (originalMessage.role === 'user') {

              quotedSenderDisplayName = chat.settings.myNickname || '我';
            } else {

              if (chat.isGroup) {

                quotedSenderDisplayName = getDisplayNameInGroup(chat, originalMessage.senderName);
              } else {

                quotedSenderDisplayName = chat.name;
              }
            }

            quoteContext = {
              timestamp: originalMessage.timestamp,
              senderName: quotedSenderDisplayName, // 使用修复后的昵称
              content: String(originalMessage.content || '') // 确保内容是字符串
            };
          } else {

            console.warn(`导演模式保存引用失败: 找不到目标消息 (Content: ${msgData.target_content}, TS: ${msgData.target_timestamp})`);
          }


          aiMessage = {
            ...baseMessage,
            content: msgData.reply_content
          };

          if (quoteContext) {
            aiMessage.quote = quoteContext;
          }


          break;
        }
        default:
          console.warn("在导演模式保存时，遇到了未知的AI指令类型:", msgData.type, msgData);
          if (msgData.content) {
            aiMessage = {
              ...baseMessage,
              content: String(msgData.content)
            };
          } else {
            continue;
          }
          break;
      }

      if (aiMessage) {
        chat.history.push(aiMessage);
        newTimestamps.push(aiMessage.timestamp);
      }
    }

    if (groupChatsToSave.size > 0) {
      await db.chats.bulkPut(Array.from(groupChatsToSave.values()));
    }
    await db.chats.put(chat);

    if (privateChatsToSave.size > 0) {
      await db.chats.bulkPut(Array.from(privateChatsToSave.values()));
    }

    renderChatInterface(state.activeChatId);
    renderChatList();
    document.getElementById('ai-response-editor-modal').classList.remove('visible');


    lastRawAiResponse = editedRawBlocks.join('\n\n');
    lastResponseTimestamps = newTimestamps;


    await showCustomAlert("导演模式", "您的修改已保存！");
  }


  async function handleRecallClick() {
    if (!activeMessageTimestamp) return;

    const RECALL_TIME_LIMIT_MS = 2 * 60 * 1000;
    const messageTime = activeMessageTimestamp;
    const now = Date.now();


    if (now - messageTime > RECALL_TIME_LIMIT_MS) {
      hideMessageActions();
      await showCustomAlert('操作失败', '该消息发送已超过2分钟，无法撤回。');
      return;
    }


    await recallMessage(messageTime, true);
    hideMessageActions();
  }


  async function recallMessage(timestamp, isUserRecall) {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;

    const messageIndex = chat.history.findIndex(m => m.timestamp === timestamp);
    if (messageIndex === -1) return;

    const messageToRecall = chat.history[messageIndex];

    const recalledData = {
      originalType: messageToRecall.type || 'text',
      originalContent: messageToRecall.content,
      originalMeaning: messageToRecall.meaning,
      originalQuote: messageToRecall.quote
    };

    messageToRecall.type = 'recalled_message';
    messageToRecall.content = isUserRecall ? '你撤回了一条消息' : '对方撤回了一条消息';
    messageToRecall.recalledData = recalledData;
    delete messageToRecall.meaning;
    delete messageToRecall.quote;


    if (isUserRecall) {

      const myNickname = chat.isGroup ? (chat.settings.myNickname || '我') : '我';


      let recalledContentText = '';
      if (recalledData.originalType === 'sticker') {
        recalledContentText = `[表情，含义: ${recalledData.originalMeaning || '未知'}]`;
      } else if (recalledData.originalType === 'ai_image' || recalledData.originalType === 'user_photo') {
        recalledContentText = `[图片，描述: ${recalledData.originalContent}]`;
      } else {
        recalledContentText = `"${String(recalledData.originalContent)}"`;
      }


      const hiddenMessageForAI = {
        role: 'system',
        content: `[系统提示：用户（${myNickname}）刚刚撤回了一条消息。撤回前的内容是：${recalledContentText}。请你对此作出回应，可以表现出好奇、开玩笑（比如'我截图了！'）、或者根据你的人设表示理解或疑惑。]`,
        timestamp: Date.now(),
        isHidden: true
      };
      chat.history.push(hiddenMessageForAI);
    }


    await db.chats.put(chat);
    renderChatInterface(state.activeChatId);

    if (isUserRecall) {
      renderChatList();

      //triggerAiResponse();
    }
  }


  // ========== 导出到全局作用域 ==========
  window.showMessageActions = showMessageActions;
  window.hideMessageActions = hideMessageActions;
  window.toggleExcludeMessage = toggleExcludeMessage;
  window.toggleExcludeSelectedMessages = toggleExcludeSelectedMessages;
  window.openBatchExcludeManager = openBatchExcludeManager;
  window.closeBatchExcludeManager = closeBatchExcludeManager;
  window.openExcludedDetailView = openExcludedDetailView;
  window.closeExcludedDetailView = closeExcludedDetailView;
  window.batchExcludeChecked = batchExcludeChecked;
  window.batchExcludeAction = batchExcludeAction;
  window.translateMessageContent = translateMessageContent;
  window.openMessageEditor = openMessageEditor;
  window.copyMessageContent = copyMessageContent;
  window.copyMessageTimestamp = copyMessageTimestamp;
  window.createMessageEditorBlock = createMessageEditorBlock;
  window.openAdvancedMessageEditor = openAdvancedMessageEditor;
  window.parseEditedContent = parseEditedContent;
  window.saveEditedMessage = saveEditedMessage;
  window.openAiResponseEditor = openAiResponseEditor;
  window.createAiResponseEditorBlock = createAiResponseEditorBlock;
  window.saveEditedAiResponse = saveEditedAiResponse;
  window.handleRecallClick = handleRecallClick;
  window.recallMessage = recallMessage;

})();
