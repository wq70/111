// ============================================================
// avatar-library.js
// 来源：script.js 第 27844~28320 + 3062~3400 行
// 功能：AI头像库、我的头像库、群头像库、批量导入、
//       本地上传、AI描述、角色名称/头像同步、getDisplayNameInGroup
// ============================================================

(function () {
  // state 通过全局作用域访问（window.state，由 init-and-state.js 初始化）

  function openAiAvatarLibraryModal() {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    document.getElementById('ai-avatar-library-title').textContent = `"${chat.name}"的头像库`;
    renderAiAvatarLibrary();
    document.getElementById('ai-avatar-library-modal').classList.add('visible');
  }

  function renderAiAvatarLibrary() {
    const grid = document.getElementById('ai-avatar-library-grid');
    grid.innerHTML = '';
    const chat = state.chats[state.activeChatId];
    const library = chat.settings.aiAvatarLibrary || [];

    if (library.length === 0) {
      grid.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1 / -1; text-align: center;">这个头像库还是空的，点击右上角"添加"吧！</p>';
      return;
    }

    library.forEach((avatar, index) => {
      const item = document.createElement('div');
      item.className = 'sticker-item';
      item.title = avatar.name;

      item.innerHTML = `
            <div class="sticker-image-container" style="background-image: url(${avatar.url});"></div>
            <span class="sticker-name">${avatar.name}</span>
        `;

      const deleteBtn = document.createElement('div');
      deleteBtn.className = 'delete-btn';
      deleteBtn.innerHTML = '×';
      deleteBtn.style.display = 'block';
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        const confirmed = await showCustomConfirm('删除头像', `确定要从头像库中删除"${avatar.name}"吗？`, {
          confirmButtonClass: 'btn-danger'
        });
        if (confirmed) {
          chat.settings.aiAvatarLibrary.splice(index, 1);
          await db.chats.put(chat);
          renderAiAvatarLibrary();
        }
      };
      item.appendChild(deleteBtn);
      grid.appendChild(item);
    });
  }


  async function addAvatarToLibraryFromURL() {
    const name = await showCustomPrompt("添加头像", "请为这个头像起个名字（例如：开心、哭泣）");
    if (!name || !name.trim()) return;

    const url = await showCustomPrompt("添加头像", "请输入头像的图片URL", "", "url");
    if (!url || !url.trim().startsWith('http')) {
      alert("请输入有效的图片URL！");
      return;
    }

    const chat = state.chats[state.activeChatId];
    if (!chat.settings.aiAvatarLibrary) {
      chat.settings.aiAvatarLibrary = [];
    }

    chat.settings.aiAvatarLibrary.push({
      name: name.trim(),
      url: url.trim()
    });
    await db.chats.put(chat);
    renderAiAvatarLibrary();
  }

  function closeAiAvatarLibraryModal() {
    document.getElementById('ai-avatar-library-modal').classList.remove('visible');
  }

  // ==================== 我的头像库 ====================

  function openMyAvatarLibraryModal() {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    document.getElementById('my-avatar-library-title').textContent = `"${chat.settings.myNickname || '我'}"的头像库`;
    renderMyAvatarLibrary();
    document.getElementById('my-avatar-library-modal').classList.add('visible');
  }

  function renderMyAvatarLibrary() {
    const grid = document.getElementById('my-avatar-library-grid');
    grid.innerHTML = '';
    const chat = state.chats[state.activeChatId];
    const library = chat.settings.myAvatarLibrary || [];

    if (library.length === 0) {
      grid.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1 / -1; text-align: center;">这个头像库还是空的，点击右上角"添加"吧！</p>';
      return;
    }

    library.forEach((avatar, index) => {
      const item = document.createElement('div');
      item.className = 'sticker-item';
      item.title = avatar.name;

      item.innerHTML = `
            <div class="sticker-image-container" style="background-image: url(${avatar.url});"></div>
            <span class="sticker-name">${avatar.name}</span>
        `;

      const deleteBtn = document.createElement('div');
      deleteBtn.className = 'delete-btn';
      deleteBtn.innerHTML = '×';
      deleteBtn.style.display = 'block';
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        const confirmed = await showCustomConfirm('删除头像', `确定要从你的头像库中删除"${avatar.name}"吗？`, {
          confirmButtonClass: 'btn-danger'
        });
        if (confirmed) {
          chat.settings.myAvatarLibrary.splice(index, 1);
          await db.chats.put(chat);
          renderMyAvatarLibrary();
        }
      };
      item.appendChild(deleteBtn);
      grid.appendChild(item);
    });
  }

  async function addAvatarToMyLibraryFromURL() {
    const name = await showCustomPrompt("添加头像", "请为这个头像起个名字（例如：开心、哭泣）");
    if (!name || !name.trim()) return;

    const url = await showCustomPrompt("添加头像", "请输入头像的图片URL", "", "url");
    if (!url || !url.trim().startsWith('http')) {
      alert("请输入有效的图片URL！");
      return;
    }

    const chat = state.chats[state.activeChatId];
    if (!chat.settings.myAvatarLibrary) {
      chat.settings.myAvatarLibrary = [];
    }

    chat.settings.myAvatarLibrary.push({
      name: name.trim(),
      url: url.trim()
    });
    await db.chats.put(chat);
    renderMyAvatarLibrary();
  }

  async function handleLocalMyAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    let base64Url = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

    const name = await showCustomPrompt("命名头像", "请为这个新头像命名");
    if (!name || !name.trim()) {
      event.target.value = null;
      return;
    }

    const trimmedName = name.trim();
    const chat = state.chats[state.activeChatId];
    if (!chat.settings.myAvatarLibrary) {
      chat.settings.myAvatarLibrary = [];
    }

    const newItem = {
      name: trimmedName,
      url: base64Url
    };
    chat.settings.myAvatarLibrary.push(newItem);
    await db.chats.put(chat);

    renderMyAvatarLibrary();
    await showCustomAlert("添加成功！", `头像"${trimmedName}"已添加。\n\n图片将在后台静默上传到图床...`);

    // 【【【已修复的调用】】】
    (async () => {
      await silentlyUpdateDbUrl(
        db.chats, // table
        chat.id,  // recordId
        'settings.myAvatarLibrary', // pathString (指向数组)
        base64Url, // base64ToFind
        trimmedName // nameToMatch
      );
    })();

    event.target.value = null;
  }

  async function handleBatchImportForMyAvatar(text) {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;

    const lines = text.trim().split('\n');
    const newAvatars = [];
    const baseUrl = 'https://files.catbox.moe/';
    let errorCount = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.includes('http') || trimmedLine.includes('填入')) continue;

      let name = null,
        code = null;
      const noSpaceMatch = trimmedLine.match(/^([\u4e00-\u9fa5]+)([a-zA-Z0-9]+\..+)$/);

      if (noSpaceMatch) {
        name = noSpaceMatch[1];
        code = noSpaceMatch[2];
      } else {
        const parts = trimmedLine.split(/\s+/);
        if (parts.length >= 2) {
          code = parts.pop();
          name = parts.join(' ');
        }
      }

      if (name && code && code.includes('.')) {
        newAvatars.push({
          name: name,
          url: baseUrl + code
        });
      } else {
        errorCount++;
      }
    }

    if (errorCount > 0) await showCustomAlert('部分导入失败', `有 ${errorCount} 行的格式不正确，已被跳过。`);

    if (newAvatars.length > 0) {
      if (!chat.settings.myAvatarLibrary) chat.settings.myAvatarLibrary = [];
      chat.settings.myAvatarLibrary.push(...newAvatars);
      await db.chats.put(chat);
      renderMyAvatarLibrary();
      await showCustomAlert('导入成功', `已成功批量导入 ${newAvatars.length} 个新头像！`);
    } else if (errorCount === 0) {
      alert("没有找到可导入的内容。");
    }
  }

  function closeMyAvatarLibraryModal() {
    document.getElementById('my-avatar-library-modal').classList.remove('visible');
  }


  // ==================== 群头像库 ====================

  function openGroupAvatarLibraryModal() {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    document.getElementById('group-avatar-library-title').textContent = `"${chat.name}"的头像库`;
    renderGroupAvatarLibrary();
    document.getElementById('group-avatar-library-modal').classList.add('visible');
  }

  function renderGroupAvatarLibrary() {
    const grid = document.getElementById('group-avatar-library-grid');
    grid.innerHTML = '';
    const chat = state.chats[state.activeChatId];
    const library = chat.settings.groupAvatarLibrary || [];

    if (library.length === 0) {
      grid.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1 / -1; text-align: center;">这个头像库还是空的，点击右上角"添加"吧！</p>';
      return;
    }

    library.forEach((avatar, index) => {
      const item = document.createElement('div');
      item.className = 'sticker-item';
      item.title = avatar.name;

      item.innerHTML = `
            <div class="sticker-image-container" style="background-image: url(${avatar.url});"></div>
            <span class="sticker-name">${avatar.name}</span>
        `;

      const deleteBtn = document.createElement('div');
      deleteBtn.className = 'delete-btn';
      deleteBtn.innerHTML = '×';
      deleteBtn.style.display = 'block';
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        const confirmed = await showCustomConfirm('删除头像', `确定要从头像库中删除"${avatar.name}"吗？`, {
          confirmButtonClass: 'btn-danger'
        });
        if (confirmed) {
          chat.settings.groupAvatarLibrary.splice(index, 1);
          await db.chats.put(chat);
          renderGroupAvatarLibrary();
        }
      };
      item.appendChild(deleteBtn);
      grid.appendChild(item);
    });
  }

  async function addAvatarToGroupLibraryFromUR() {
    const name = await showCustomPrompt("添加头像", "请为这个头像起个名字（例如：春日野餐、学习时间）");
    if (!name || !name.trim()) return;

    const url = await showCustomPrompt("添加头像", "请输入头像的图片URL", "", "url");
    if (!url || !url.trim().startsWith('http')) {
      alert("请输入有效的图片URL！");
      return;
    }

    const chat = state.chats[state.activeChatId];
    if (!chat.settings.groupAvatarLibrary) {
      chat.settings.groupAvatarLibrary = [];
    }

    chat.settings.groupAvatarLibrary.push({
      name: name.trim(),
      url: url.trim()
    });
    await db.chats.put(chat);
    renderGroupAvatarLibrary();
  }

  function closeGroupAvatarLibraryModal() {
    document.getElementById('group-avatar-library-modal').classList.remove('visible');
  }

  // ==================== 批量导入 ====================

  async function openBatchImportModal(type) {
    const placeholderText = `请按照以下格式粘贴，一行一个：\n\n焦虑 2a9wte.jpeg\n大惊失色 or8qf4.png\n没有灵感 njwujh.jpeg`;

    const pastedText = await showCustomPrompt(
      '批量导入头像',
      placeholderText,
      '',
      'textarea'
    );

    if (pastedText && pastedText.trim()) {
      await handleBatchImport(type, pastedText);
    }
  }

  async function handleBatchImport(type, text) {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;

    const lines = text.trim().split('\n');
    const newAvatars = [];
    const baseUrl = 'https://files.catbox.moe/';
    let errorCount = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.includes('http') || trimmedLine.includes('填入')) {
        continue;
      }

      let name = null;
      let code = null;

      const noSpaceMatch = trimmedLine.match(/^([\u4e00-\u9fa5]+)([a-zA-Z0-9]+\..+)$/);

      if (noSpaceMatch) {
        name = noSpaceMatch[1];
        code = noSpaceMatch[2];
      } else {
        const parts = trimmedLine.split(/\s+/);
        if (parts.length >= 2) {
          code = parts.pop();
          name = parts.join(' ');
        }
      }

      if (name && code && code.includes('.')) {
        newAvatars.push({
          name: name,
          url: baseUrl + code
        });
      } else {
        errorCount++;
        console.warn('批量导入格式错误，已跳过此行:', trimmedLine);
      }
    }

    if (errorCount > 0) {
      await showCustomAlert('部分导入失败', `有 ${errorCount} 行的格式不正确，已被系统跳过。`);
    }

    if (newAvatars.length > 0) {
      if (type === 'ai') {
        if (!chat.settings.aiAvatarLibrary) chat.settings.aiAvatarLibrary = [];
        chat.settings.aiAvatarLibrary.push(...newAvatars);
        await db.chats.put(chat);
        renderAiAvatarLibrary();
      } else if (type === 'group') {
        if (!chat.settings.groupAvatarLibrary) chat.settings.groupAvatarLibrary = [];
        chat.settings.groupAvatarLibrary.push(...newAvatars);
        await db.chats.put(chat);
        renderGroupAvatarLibrary();
      }
      await showCustomAlert('导入成功', `已成功批量导入 ${newAvatars.length} 个新头像！`);
    } else if (errorCount === 0) {
      alert("没有找到可导入的内容。请检查您粘贴的格式是否正确。");
    }
  }

  async function addAvatarToGroupLibraryFromURL() {
    const name = await showCustomPrompt("添加头像", "请为这个头像起个名字（例如：春日野餐、学习时间）");
    if (!name || !name.trim()) return;

    const url = await showCustomPrompt("添加头像", "请输入头像的图片URL", "", "url");
    if (!url || !url.trim().startsWith('http')) {
      alert("请输入有效的图片URL！");
      return;
    }

    const chat = state.chats[state.activeChatId];
    if (!chat.settings.groupAvatarLibrary) {
      chat.settings.groupAvatarLibrary = [];
    }

    chat.settings.groupAvatarLibrary.push({
      name: name.trim(),
      url: url.trim()
    });
    await db.chats.put(chat);
    renderGroupAvatarLibrary();
  }


  // ==================== 本地上传（来自 script.js 第 3062~3200 行） ====================

  async function handleLocalGroupAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    let base64Url = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

    try {
      const description = await showCustomPrompt("命名群头像", "请为这个新群头像命名");

      if (!description || !description.trim()) {
        await showCustomAlert("操作取消", "你没有输入名称，已取消上传。");
        event.target.value = null;
        return;
      }

      const chat = state.chats[state.activeChatId];
      if (!chat.settings.groupAvatarLibrary) {
        chat.settings.groupAvatarLibrary = [];
      }

      const newItem = {
        name: description,
        url: base64Url
      };
      chat.settings.groupAvatarLibrary.push(newItem);
      await db.chats.put(chat);

      renderGroupAvatarLibrary();

      await showCustomAlert("上传成功！", `群头像已命名为："${description}"\n\n图片将在后台静默上传到图床...`);

      // 【【【已修复的调用】】】
      (async () => {
        await silentlyUpdateDbUrl(
          db.chats, // table
          chat.id,  // recordId
          'settings.groupAvatarLibrary', // pathString (指向数组)
          base64Url, // base64ToFind
          description // nameToMatch
        );
      })();

    } catch (error) {
      console.error("本地群头像上传及识别失败:", error);
      await showCustomAlert("操作失败", `上传时发生错误。\n错误: ${error.message}`);
    } finally {
      event.target.value = null;
    }
  }

  async function handleLocalAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    let base64Url = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

    try {
      const description = await showCustomPrompt("命名头像", "请为这个新头像命名");

      if (!description || !description.trim()) {
        await showCustomAlert("操作取消", "你没有输入名称，已取消上传。");
        event.target.value = null;
        return;
      }

      const chat = state.chats[state.activeChatId];
      if (!chat.settings.aiAvatarLibrary) {
        chat.settings.aiAvatarLibrary = [];
      }

      const newItem = {
        name: description,
        url: base64Url
      };
      chat.settings.aiAvatarLibrary.push(newItem);
      await db.chats.put(chat);

      renderAiAvatarLibrary();

      await showCustomAlert("上传成功！", `头像已命名为："${description}"\n\n图片将在后台静默上传到图床...`);

      // 【【【已修复的调用】】】
      (async () => {
        await silentlyUpdateDbUrl(
          db.chats, // table
          chat.id,  // recordId
          'settings.aiAvatarLibrary', // pathString (指向数组)
          base64Url, // base64ToFind
          description // nameToMatch
        );
      })();

    } catch (error) {
      console.error("本地头像上传及识别失败:", error);
      await showCustomAlert("操作失败", `上传时发生错误。\n错误: ${error.message}`);
    } finally {
      event.target.value = null;
    }
  }

  // ==================== AI 描述 & 同步功能（来自 script.js 第 3200~3400 行） ====================

  async function getAvatarDescriptionFromApi(base64Url) {

    // 优先使用识图API，其次副API，最后主API
    const useVisionApi = state.apiConfig.visionProxyUrl && state.apiConfig.visionApiKey && state.apiConfig.visionModel;
    const useSecondaryApi = state.apiConfig.secondaryProxyUrl && state.apiConfig.secondaryApiKey && state.apiConfig.secondaryModel;
    const {
      proxyUrl,
      apiKey,
      model
    } = useVisionApi
        ?
        {
          proxyUrl: state.apiConfig.visionProxyUrl,
          apiKey: state.apiConfig.visionApiKey,
          model: state.apiConfig.visionModel
        }
        : useSecondaryApi
        ?
        {
          proxyUrl: state.apiConfig.secondaryProxyUrl,
          apiKey: state.apiConfig.secondaryApiKey,
          model: state.apiConfig.secondaryModel
        } :
        state.apiConfig;

    if (!proxyUrl || !apiKey || !model) {
      throw new Error("主API和副API均未配置或配置不完整。");
    }

    const prompt = `请为这张图片起一个简洁的、适合作为头像库标签的名字。例如："微笑自拍"、"阳光下的猫咪"、"蓝发动漫少女"。请直接回答名字，不要加任何多余的解释。`;

    let isGemini = proxyUrl.includes('generativelanguage');
    let response;

    if (isGemini) {
      const mimeType = base64Url.match(/^data:(.*);base64/)[1];
      const base64Data = base64Url.split(',')[1];
      const payload = {
        contents: [{
          parts: [{
            text: prompt
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          }
          ]
        }]
      };
      response = await fetch(`${proxyUrl}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

    } else {
      const payload = {
        model: model,
        messages: [{
          role: 'user',
          content: [{
            type: 'text',
            text: prompt
          },
          {
            type: 'image_url',
            image_url: {
              url: base64Url
            }
          }
          ]
        }],
        max_tokens: 50
      };
      response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API 错误: ${errorData.error.message}`);
    }

    const data = await response.json();
    let description = isGemini ? getGeminiResponseText(data) : data.choices[0].message.content;

    return description.trim().replace(/["'""'']/g, '');
  }

  async function syncCharacterNameInGroups(characterChat) {
    if (!characterChat || characterChat.isGroup) {
      console.warn("syncCharacterNameInGroups: 传入的不是有效的单聊对象，已跳过同步。");
      return;
    }

    const characterId = characterChat.id;
    const newRemarkName = characterChat.name;
    const newOriginalName = characterChat.originalName;

    console.log(`正在为角色 ${characterId} 同步所有群聊内的名称信息...`);

    for (const chatId in state.chats) {
      const groupChat = state.chats[chatId];

      if (groupChat.isGroup && groupChat.members) {
        const memberToUpdate = groupChat.members.find(m => m.id === characterId);

        if (memberToUpdate) {
          let needsDbUpdate = false;

          if (memberToUpdate.groupNickname !== newRemarkName) {
            memberToUpdate.groupNickname = newRemarkName;
            needsDbUpdate = true;
          }

          if (memberToUpdate.originalName !== newOriginalName) {
            memberToUpdate.originalName = newOriginalName;
            needsDbUpdate = true;
          }

          if (needsDbUpdate) {
            await db.chats.put(groupChat);
            console.log(`成功将群聊 "${groupChat.name}" 中的成员信息更新`);
          }
        }
      }
    }
  }

  async function syncCharacterAvatarInGroups(characterChat) {
    if (!characterChat || characterChat.isGroup) {
      console.warn("syncCharacterAvatarInGroups: 传入的不是有效的单聊对象，已跳过同步。");
      return;
    }

    const characterId = characterChat.id;
    const newAvatar = characterChat.settings.aiAvatar;

    console.log(`正在为角色 ${characterId} 同步所有群聊内的头像...`);

    for (const groupChat of Object.values(state.chats)) {
      if (groupChat.isGroup && groupChat.members) {
        const memberToUpdate = groupChat.members.find(m => m.id === characterId);

        if (memberToUpdate && memberToUpdate.avatar !== newAvatar) {
          memberToUpdate.avatar = newAvatar;
          await db.chats.put(groupChat);
          console.log(`成功将角色 ${characterId} 的新头像同步到群聊 "${groupChat.name}"`);
        }
      }
    }
  }

  function getDisplayNameInGroup(groupChat, originalName) {
    if (!groupChat || !groupChat.isGroup || !originalName) {
      return originalName;
    }

    const userOriginalName = state.qzoneSettings.nickname || '{{user}}';
    if (originalName === userOriginalName) {
      return groupChat.settings.myNickname || '我';
    }

    const member = groupChat.members.find(m => m.originalName === originalName);
    return member ? member.groupNickname : originalName;
  }

  // ========== 导出到全局作用域 ==========
  window.openAiAvatarLibraryModal = openAiAvatarLibraryModal;
  window.renderAiAvatarLibrary = renderAiAvatarLibrary;
  window.addAvatarToLibraryFromURL = addAvatarToLibraryFromURL;
  window.closeAiAvatarLibraryModal = closeAiAvatarLibraryModal;
  window.openMyAvatarLibraryModal = openMyAvatarLibraryModal;
  window.renderMyAvatarLibrary = renderMyAvatarLibrary;
  window.addAvatarToMyLibraryFromURL = addAvatarToMyLibraryFromURL;
  window.handleLocalMyAvatarUpload = handleLocalMyAvatarUpload;
  window.handleBatchImportForMyAvatar = handleBatchImportForMyAvatar;
  window.closeMyAvatarLibraryModal = closeMyAvatarLibraryModal;
  window.openGroupAvatarLibraryModal = openGroupAvatarLibraryModal;
  window.renderGroupAvatarLibrary = renderGroupAvatarLibrary;
  window.addAvatarToGroupLibraryFromUR = addAvatarToGroupLibraryFromUR;
  window.addAvatarToGroupLibraryFromURL = addAvatarToGroupLibraryFromURL;
  window.closeGroupAvatarLibraryModal = closeGroupAvatarLibraryModal;
  window.openBatchImportModal = openBatchImportModal;
  window.handleBatchImport = handleBatchImport;
  window.handleLocalGroupAvatarUpload = handleLocalGroupAvatarUpload;
  window.handleLocalAvatarUpload = handleLocalAvatarUpload;
  window.getAvatarDescriptionFromApi = getAvatarDescriptionFromApi;
  window.syncCharacterNameInGroups = syncCharacterNameInGroups;
  window.syncCharacterAvatarInGroups = syncCharacterAvatarInGroups;
  window.getDisplayNameInGroup = getDisplayNameInGroup;

})();
