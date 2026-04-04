// ============================================================
// MY Phone 模块
// 来源：script.js 第 40153 ~ 41384 行
// 功能：MY Phone 我的手机全部功能
//       openMyphoneScreen、renderMyPhoneCharacterSelector、
//       switchToMyPhoneCharacter、enterMyPhone、锁屏、
//       联系人管理、消息管理、MyPhone 设置、删除模式
// ============================================================

  // MY Phone 相关变量
  let activeMyPhoneCharacterId = null;
  // 暴露到全局，供 CPhone 等其他模块访问
  Object.defineProperty(window, 'activeMyPhoneCharacterId', {
    get() { return activeMyPhoneCharacterId; },
    set(v) { activeMyPhoneCharacterId = v; }
  });

  // MY Phone 锁屏状态
  let myPhoneLockScreenState = {
    passwordBuffer: '',
    isLocked: false,
    pendingCharacterId: null
  };
  window.myPhoneLockScreenState = myPhoneLockScreenState;

  // MY Phone 删除模式相关状态
  let myPhoneDeleteMode = {
    active: false,
    appType: null, // 'qq', 'album', 'browser', 'taobao', 'memo', 'diary', 'usage', 'music', 'amap'
    selectedIndices: new Set()
  };
  window.myPhoneDeleteMode = myPhoneDeleteMode;

  function openMyphoneScreen() {
    renderMyPhoneCharacterSelector();
    showScreen('myphone-selection-screen');
  }

  // openCharacterGeneratorScreen 由 character-generator.js 提供

  function renderMyPhoneCharacterSelector() {
    const gridEl = document.getElementById('myphone-character-grid');
    gridEl.innerHTML = '';

    const characters = Object.values(state.chats).filter(chat => !chat.isGroup);

    if (characters.length === 0) {
      gridEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">还没有可以查看手机的角色哦~</p>';
      return;
    }

    characters.forEach(char => {
      const item = document.createElement('div');
      item.className = 'character-select-item';
      item.innerHTML = `
            <img src="${char.settings.aiAvatar || defaultAvatar}" class="avatar">
            <span class="name">${char.name}</span>
        `;
      item.addEventListener('click', () => switchToMyPhoneCharacter(char.id));
      gridEl.appendChild(item);
    });
  }

  async function switchToMyPhoneCharacter(characterId) {
    const char = state.chats[characterId];
    if (!char) return;

    // 检查是否启用了MyPhone锁屏
    if (char.settings.myPhoneLockScreenEnabled) {
      // 保存待进入的角色ID
      myPhoneLockScreenState.pendingCharacterId = characterId;

      // 显示锁屏界面
      showMyPhoneLockScreen(char);
      return;
    }

    // 如果没有启用锁屏，直接进入
    enterMyPhone(characterId);
  }

  function enterMyPhone(characterId) {
    activeMyPhoneCharacterId = characterId;
    console.log(`已切换到角色 ${characterId} 查看我的手机`);

    applyMyPhoneWallpaper();
    applyMyPhoneAppIcons();

    renderMyPhoneHomeScreen();
    showScreen('myphone-screen');
  }

  function renderMyPhoneHomeScreen() {
    switchToMyPhoneScreen('myphone-home-screen');
  }

  function switchToMyPhoneScreen(screenId) {
    document.querySelectorAll('#myphone-screen .char-screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  }

  function switchToMyPhoneHomeScreen() {
    switchToMyPhoneScreen('myphone-home-screen');
  }

  function switchToCPhone() {
    // 从 MY Phone 切换回 CP Phone 角色选择
    openCharacterSelector();
  }

  function openMyPhoneSettings() {
    // 回显设置
    const char = state.chats[activeMyPhoneCharacterId];
    if (char) {
      const toggle = document.getElementById('myphone-lock-screen-toggle');
      const detail = document.getElementById('myphone-lock-screen-settings-detail');
      const passwordInput = document.getElementById('myphone-lock-screen-password-input');

      if (toggle) {
        toggle.checked = char.settings.myPhoneLockScreenEnabled || false;
        if (detail) {
          detail.style.display = toggle.checked ? 'block' : 'none';
        }
      }

      if (passwordInput) {
        passwordInput.value = char.settings.myPhoneLockScreenPassword || '';
      }
    }

    switchToMyPhoneScreen('myphone-settings-screen');
  }

  function showMyPhoneLockScreen(char) {
    const lockScreen = document.getElementById('lock-screen');

    // 设置壁纸（使用主屏幕的锁屏壁纸）
    if (state.globalSettings.lockScreenWallpaper) {
      lockScreen.style.backgroundImage = `url(${state.globalSettings.lockScreenWallpaper})`;
    } else {
      lockScreen.style.backgroundImage = 'linear-gradient(135deg, #1c1c1e, #3a3a3c)';
    }

    // 标记为MyPhone锁屏模式
    myPhoneLockScreenState.isLocked = true;
    lockScreen.classList.add('active');
    lockScreen.classList.add('myphone-lock-mode');

    // 更新时钟
    updateMyPhoneLockScreenClock();
  }

  function updateMyPhoneLockScreenClock() {
    if (!myPhoneLockScreenState.isLocked) return;

    const now = new Date();
    const timeString = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateString = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

    document.getElementById('lock-time').textContent = timeString;
    document.getElementById('lock-date').textContent = dateString;
  }

  function showMyPhonePasswordInput() {
    const lockScreen = document.getElementById('lock-screen');
    const passwordArea = document.getElementById('lock-password-area');

    lockScreen.classList.add('input-mode');
    passwordArea.style.display = 'flex';
    myPhoneLockScreenState.passwordBuffer = '';
    updateMyPhoneLockDots();
  }

  function hideMyPhonePasswordInput() {
    const lockScreen = document.getElementById('lock-screen');
    const passwordArea = document.getElementById('lock-password-area');

    lockScreen.classList.remove('input-mode');
    passwordArea.style.display = 'none';
    myPhoneLockScreenState.passwordBuffer = '';
  }

  function updateMyPhoneLockDots() {
    const dots = document.querySelectorAll('.lock-dots .dot');
    const len = myPhoneLockScreenState.passwordBuffer.length;
    dots.forEach((dot, index) => {
      if (index < len) dot.classList.add('filled');
      else dot.classList.remove('filled');
    });
  }

  function checkMyPhoneLockPassword() {
    const characterId = myPhoneLockScreenState.pendingCharacterId;
    if (!characterId) return;

    const char = state.chats[characterId];
    if (!char) return;

    const correctPassword = char.settings.myPhoneLockScreenPassword;

    if (myPhoneLockScreenState.passwordBuffer === correctPassword) {
      // 解锁成功
      const lockScreen = document.getElementById('lock-screen');
      lockScreen.classList.add('unlocking');
      myPhoneLockScreenState.isLocked = false;

      setTimeout(() => {
        lockScreen.classList.remove('active');
        lockScreen.classList.remove('unlocking');
        lockScreen.classList.remove('myphone-lock-mode');
        hideMyPhonePasswordInput();

        // 进入MyPhone
        enterMyPhone(characterId);
        myPhoneLockScreenState.pendingCharacterId = null;
      }, 500);
    } else {
      // 解锁失败
      const dots = document.querySelector('.lock-dots');
      dots.classList.add('shake-animation');
      if (navigator.vibrate) navigator.vibrate(200);

      setTimeout(() => {
        dots.classList.remove('shake-animation');
        myPhoneLockScreenState.passwordBuffer = '';
        updateMyPhoneLockDots();
      }, 400);
    }
  }

  function openMyPhoneViewRecords() {
    switchToMyPhoneScreen('myphone-view-records-screen');
  }

  // MY Phone 删除模式功能
  function toggleMyPhoneDeleteMode(appType) {
    if (myPhoneDeleteMode.active && myPhoneDeleteMode.appType === appType) {
      // 退出删除模式
      exitMyPhoneDeleteMode();
    } else {
      // 进入删除模式
      enterMyPhoneDeleteMode(appType);
    }
  }

  function enterMyPhoneDeleteMode(appType) {
    myPhoneDeleteMode.active = true;
    myPhoneDeleteMode.appType = appType;
    myPhoneDeleteMode.selectedIndices.clear();

    // 更新按钮UI - 添加删除模式工具栏
    const screen = document.getElementById(`myphone-${appType}-screen`);
    if (!screen) return;

    const header = screen.querySelector('.header');
    if (!header) return;

    // 隐藏其他按钮，只显示返回按钮
    const actionBtns = header.querySelectorAll('.action-btn');
    actionBtns.forEach(btn => btn.style.display = 'none');

    // 创建删除模式工具栏
    let deleteToolbar = header.querySelector('.delete-mode-toolbar');
    if (!deleteToolbar) {
      deleteToolbar = document.createElement('div');
      deleteToolbar.className = 'delete-mode-toolbar';
      deleteToolbar.style.cssText = 'display: flex; gap: 8px; align-items: center;';
      deleteToolbar.innerHTML = `
        <button class="delete-mode-btn" onclick="selectAllMyPhoneItems()" style="padding: 6px 12px; border: none; background: var(--accent-color); color: white; border-radius: 6px; cursor: pointer; font-size: 14px;">全选</button>
        <button class="delete-mode-btn" onclick="confirmDeleteMyPhoneItems()" style="padding: 6px 12px; border: none; background: #ff4444; color: white; border-radius: 6px; cursor: pointer; font-size: 14px;">删除</button>
        <button class="delete-mode-btn" onclick="exitMyPhoneDeleteMode()" style="padding: 6px 12px; border: none; background: var(--secondary-bg); color: var(--text-color); border-radius: 6px; cursor: pointer; font-size: 14px;">取消</button>
      `;
      header.appendChild(deleteToolbar);
    }
    deleteToolbar.style.display = 'flex';

    // 重新渲染列表以显示复选框
    rerenderMyPhoneApp(appType);
  }

  function exitMyPhoneDeleteMode() {
    if (!myPhoneDeleteMode.active) return;

    const appType = myPhoneDeleteMode.appType;
    myPhoneDeleteMode.active = false;
    myPhoneDeleteMode.appType = null;
    myPhoneDeleteMode.selectedIndices.clear();

    // 恢复按钮UI
    const screen = document.getElementById(`myphone-${appType}-screen`);
    if (!screen) return;

    const header = screen.querySelector('.header');
    if (!header) return;

    // 恢复显示操作按钮
    const actionBtns = header.querySelectorAll('.action-btn');
    actionBtns.forEach(btn => btn.style.display = '');

    // 隐藏删除模式工具栏
    const deleteToolbar = header.querySelector('.delete-mode-toolbar');
    if (deleteToolbar) {
      deleteToolbar.style.display = 'none';
    }

    // 重新渲染列表以隐藏复选框
    rerenderMyPhoneApp(appType);
  }
  // 将函数暴露到全局作用域
  window.exitMyPhoneDeleteMode = exitMyPhoneDeleteMode;

  function selectAllMyPhoneItems() {
    if (!myPhoneDeleteMode.active) return;

    const appType = myPhoneDeleteMode.appType;
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) return;

    let items = [];
    switch (appType) {
      case 'qq':
        items = char.myPhoneSimulatedQQConversations || [];
        break;
      case 'album':
        items = char.myPhoneAlbum || [];
        break;
      case 'browser':
        items = char.myPhoneBrowserHistory || [];
        break;
      case 'taobao':
        items = char.myPhoneTaobaoHistory || [];
        break;
      case 'memo':
        items = char.myPhoneMemos || [];
        break;
      case 'diary':
        items = char.myPhoneDiaries || [];
        break;
      case 'usage':
        items = char.myPhoneAppUsage || [];
        break;
      case 'music':
        items = char.myPhoneMusicPlaylist || [];
        break;
      case 'amap':
        items = char.myPhoneAmapHistory || [];
        break;
    }

    // 判断是全选还是取消全选
    const allSelected = myPhoneDeleteMode.selectedIndices.size === items.length;

    if (allSelected) {
      // 取消全选
      myPhoneDeleteMode.selectedIndices.clear();
    } else {
      // 全选
      myPhoneDeleteMode.selectedIndices.clear();
      items.forEach((_, idx) => myPhoneDeleteMode.selectedIndices.add(idx));
    }

    // 更新复选框状态
    updateMyPhoneCheckboxStates();
  }
  // 将函数暴露到全局作用域
  window.selectAllMyPhoneItems = selectAllMyPhoneItems;

  function toggleMyPhoneItemSelection(index) {
    if (!myPhoneDeleteMode.active) return;

    if (myPhoneDeleteMode.selectedIndices.has(index)) {
      myPhoneDeleteMode.selectedIndices.delete(index);
    } else {
      myPhoneDeleteMode.selectedIndices.add(index);
    }

    // 更新复选框状态
    updateMyPhoneCheckboxStates();
  }
  // 将函数暴露到全局作用域
  window.toggleMyPhoneItemSelection = toggleMyPhoneItemSelection;

  function updateMyPhoneCheckboxStates() {
    const checkboxes = document.querySelectorAll('.myphone-delete-checkbox');
    checkboxes.forEach(checkbox => {
      const index = parseInt(checkbox.dataset.index);
      checkbox.checked = myPhoneDeleteMode.selectedIndices.has(index);
    });
  }

  async function confirmDeleteMyPhoneItems() {
    if (!myPhoneDeleteMode.active || myPhoneDeleteMode.selectedIndices.size === 0) {
      showCustomAlert('提示', '请至少选择一项要删除的内容');
      return;
    }

    const count = myPhoneDeleteMode.selectedIndices.size;
    const confirmed = await showCustomConfirm('确认删除', `确定要删除选中的 ${count} 项内容吗？`);

    if (!confirmed) return;

    const appType = myPhoneDeleteMode.appType;
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) return;

    // 获取要删除的索引数组，从大到小排序（避免删除时索引变化）
    const indicesToDelete = Array.from(myPhoneDeleteMode.selectedIndices).sort((a, b) => b - a);

    // 根据appType删除对应的数据
    switch (appType) {
      case 'qq':
        if (!char.myPhoneSimulatedQQConversations) char.myPhoneSimulatedQQConversations = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneSimulatedQQConversations.splice(idx, 1);
        });
        break;
      case 'album':
        if (!char.myPhoneAlbum) char.myPhoneAlbum = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneAlbum.splice(idx, 1);
        });
        break;
      case 'browser':
        if (!char.myPhoneBrowserHistory) char.myPhoneBrowserHistory = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneBrowserHistory.splice(idx, 1);
        });
        break;
      case 'taobao':
        if (!char.myPhoneTaobaoHistory) char.myPhoneTaobaoHistory = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneTaobaoHistory.splice(idx, 1);
        });
        break;
      case 'memo':
        if (!char.myPhoneMemos) char.myPhoneMemos = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneMemos.splice(idx, 1);
        });
        break;
      case 'diary':
        if (!char.myPhoneDiaries) char.myPhoneDiaries = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneDiaries.splice(idx, 1);
        });
        break;
      case 'usage':
        if (!char.myPhoneAppUsage) char.myPhoneAppUsage = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneAppUsage.splice(idx, 1);
        });
        break;
      case 'music':
        if (!char.myPhoneMusicPlaylist) char.myPhoneMusicPlaylist = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneMusicPlaylist.splice(idx, 1);
        });
        break;
      case 'amap':
        if (!char.myPhoneAmapHistory) char.myPhoneAmapHistory = [];
        indicesToDelete.forEach(idx => {
          char.myPhoneAmapHistory.splice(idx, 1);
        });
        break;
    }

    // 保存数据到数据库
    await db.chats.put(char);

    // 退出删除模式并刷新列表
    exitMyPhoneDeleteMode();

    showCustomAlert('成功', `已删除 ${count} 项内容`);
  }
  // 将函数暴露到全局作用域
  window.confirmDeleteMyPhoneItems = confirmDeleteMyPhoneItems;

  function rerenderMyPhoneApp(appType) {
    switch (appType) {
      case 'qq':
        renderMyPhoneSimulatedQQ();
        break;
      case 'album':
        renderMyPhoneAlbum();
        break;
      case 'browser':
        renderMyPhoneBrowserHistory();
        break;
      case 'taobao':
        renderMyPhoneTaobao();
        break;
      case 'memo':
        renderMyPhoneMemoList();
        break;
      case 'diary':
        renderMyPhoneDiaryList();
        break;
      case 'usage':
        renderMyPhoneAppUsage();
        break;
      case 'music':
        renderMyPhoneMusicScreen();
        break;
      case 'amap':
        renderMyPhoneAmap();
        break;
    }
  }

  // MY Phone 添加联系人选择弹窗
  async function showMyPhoneAddContactDialog() {
    const modal = document.getElementById('myphone-add-choice-modal');
    if (!modal) return;

    modal.classList.add('visible');
  }

  // 手动创建角色
  async function manualCreateMyPhoneContact() {
    // 关闭选择弹窗
    document.getElementById('myphone-add-choice-modal')?.classList.remove('visible');

    // 第一步：输入联系人名称
    const name = await showCustomPrompt('添加联系人 (1/3)', '请输入联系人名称');
    if (!name || !name.trim()) return;

    // 第二步：输入备注（可选）
    const remark = await showCustomPrompt('添加联系人 (2/3)', '请输入备注（可选，显示在列表中）', '', 'text');

    // 第三步：选择头像方式
    const avatarChoice = await showChoiceModal('添加联系人 (3/3)', [
      { text: '使用默认头像', value: 'default' },
      { text: '上传本地图片', value: 'upload' },
      { text: '输入图片URL', value: 'url' }
    ]);

    let finalAvatar = defaultAvatar;

    if (avatarChoice === 'upload') {
      // 上传本地图片
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';

      const avatarData = await new Promise((resolve) => {
        fileInput.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.readAsDataURL(file);
          } else {
            resolve(null);
          }
        };
        fileInput.click();
      });

      if (avatarData) {
        finalAvatar = avatarData;
      }
    } else if (avatarChoice === 'url') {
      // 输入URL
      const avatarUrl = await showCustomPrompt('输入头像URL', '请输入图片URL地址');
      if (avatarUrl && avatarUrl.trim()) {
        finalAvatar = avatarUrl.trim();
      }
    }

    // 添加联系人
    await addMyPhoneContact(name.trim(), remark ? remark.trim() : '', finalAvatar);

    // 刷新列表
    renderMyPhoneSimulatedQQ();
  }

  // 显示导入主屏幕角色弹窗
  async function showImportMainScreenCharacters() {
    // 关闭选择弹窗
    document.getElementById('myphone-add-choice-modal')?.classList.remove('visible');

    if (!activeMyPhoneCharacterId) return;
    const currentChar = state.chats[activeMyPhoneCharacterId];
    if (!currentChar) return;

    // 获取所有非群组角色，排除当前角色
    const allCharacters = Object.values(state.chats).filter(chat =>
      !chat.isGroup && chat.id !== activeMyPhoneCharacterId
    );

    if (allCharacters.length === 0) {
      showCustomAlert('提示', '没有可导入的角色');
      return;
    }

    // 渲染角色列表
    const listEl = document.getElementById('myphone-import-list');
    listEl.innerHTML = '';

    allCharacters.forEach(char => {
      const item = document.createElement('div');
      item.className = 'chat-list-item';
      item.style.padding = '15px';
      item.style.borderBottom = '1px solid var(--border-color)';
      item.style.cursor = 'pointer';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '15px';

      const charAvatar = char.settings.aiAvatar || defaultAvatar;

      // 获取最后一条消息
      const lastMessages = char.history.filter(m => !m.isHidden).slice(-10);
      const lastMsg = lastMessages.slice(-1)[0];
      let lastMsgText = '暂无消息';
      if (lastMsg) {
        if (typeof lastMsg.content === 'string') {
          lastMsgText = lastMsg.content.substring(0, 30);
        } else if (Array.isArray(lastMsg.content)) {
          lastMsgText = '[图片]';
        }
      }

      item.innerHTML = `
        <input type="checkbox" class="myphone-import-checkbox" data-char-id="${char.id}" style="width: 20px; height: 20px; cursor: pointer;">
        <img src="${charAvatar}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">
        <div style="flex: 1; overflow: hidden;">
          <div style="font-weight: 500; font-size: 16px; margin-bottom: 5px;">${char.name}</div>
          <div style="font-size: 14px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${lastMsgText}</div>
        </div>
      `;

      // 点击整行切换选中状态
      item.addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox') {
          const checkbox = item.querySelector('.myphone-import-checkbox');
          checkbox.checked = !checkbox.checked;
          updateImportSelectAllState();
        }
      });

      // checkbox 单独监听
      const checkbox = item.querySelector('.myphone-import-checkbox');
      checkbox.addEventListener('change', () => {
        updateImportSelectAllState();
      });

      listEl.appendChild(item);
    });

    // 显示弹窗
    document.getElementById('myphone-import-characters-modal').classList.add('visible');
  }

  // 更新全选状态
  function updateImportSelectAllState() {
    const allCheckboxes = document.querySelectorAll('.myphone-import-checkbox');
    const selectAllCheckbox = document.getElementById('select-all-myphone-import');

    if (allCheckboxes.length === 0) return;

    const checkedCount = Array.from(allCheckboxes).filter(cb => cb.checked).length;
    selectAllCheckbox.checked = checkedCount === allCheckboxes.length;
  }

  // 导入选中的角色
  async function importSelectedCharacters() {
    if (!activeMyPhoneCharacterId) return;
    const currentChar = state.chats[activeMyPhoneCharacterId];
    if (!currentChar) return;

    // 获取选中的角色ID
    const selectedCheckboxes = Array.from(document.querySelectorAll('.myphone-import-checkbox:checked'));

    if (selectedCheckboxes.length === 0) {
      showCustomAlert('提示', '请至少选择一个角色');
      return;
    }

    const selectedCharIds = selectedCheckboxes.map(cb => cb.dataset.charId);

    // 初始化数组
    if (!currentChar.myPhoneSimulatedQQConversations) {
      currentChar.myPhoneSimulatedQQConversations = [];
    }

    // 导入每个选中的角色
    let importCount = 0;
    for (const charId of selectedCharIds) {
      const char = state.chats[charId];
      if (!char) continue;

      // 检查是否已经存在
      const existingIndex = currentChar.myPhoneSimulatedQQConversations.findIndex(
        conv => conv.importedFromCharId === charId
      );

      if (existingIndex !== -1) {
        // 已存在，跳过
        continue;
      }

      // 获取最后10条消息
      const recentMessages = char.history.filter(m => !m.isHidden).slice(-10);

      // 转换消息格式 - 保持原始格式以兼容createMessageElement
      const convertedMessages = recentMessages.map(msg => {
        const isUser = msg.role === 'user';

        // 保持原始消息结构
        const convertedMsg = {
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp || Date.now(),
          sender: isUser ? (state.qzoneSettings.nickname || '我') : char.name
        };

        // 如果有其他属性，也保留
        if (msg.type) convertedMsg.type = msg.type;
        if (msg.imageUrl) convertedMsg.imageUrl = msg.imageUrl;
        if (msg.voiceUrl) convertedMsg.voiceUrl = msg.voiceUrl;
        if (msg.voiceText) convertedMsg.voiceText = msg.voiceText;
        if (msg.duration) convertedMsg.duration = msg.duration;

        return convertedMsg;
      });

      // 获取最后一条消息文本
      let lastMessageText = '暂无消息';
      if (convertedMessages.length > 0) {
        const lastMsg = convertedMessages[convertedMessages.length - 1];
        lastMessageText = lastMsg.content.substring(0, 30);
      }

      // 创建新联系人
      const newContact = {
        name: char.name,
        originalName: char.name,
        avatar: char.settings.aiAvatar || defaultAvatar,
        lastMessage: lastMessageText,
        messages: convertedMessages,
        isImported: true,
        importedFromCharId: charId
      };

      currentChar.myPhoneSimulatedQQConversations.push(newContact);
      importCount++;
    }

    // 保存到数据库
    await db.chats.put(currentChar);

    // 关闭弹窗
    document.getElementById('myphone-import-characters-modal').classList.remove('visible');

    // 刷新列表
    renderMyPhoneSimulatedQQ();

    // 显示成功提示
    showCustomAlert('成功', `已导入 ${importCount} 个角色`);
  }

  // 添加MY Phone联系人
  async function addMyPhoneContact(name, remark, avatar) {
    if (!activeMyPhoneCharacterId) return;
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) return;

    // 初始化数组
    if (!char.myPhoneSimulatedQQConversations) {
      char.myPhoneSimulatedQQConversations = [];
    }

    // 创建新联系人
    const newContact = {
      name: remark || name,
      originalName: name,
      avatar: avatar || defaultAvatar,
      lastMessage: '暂无消息',
      messages: [],
      isManuallyAdded: true // 标记为手动添加
    };

    // 添加到列表
    char.myPhoneSimulatedQQConversations.unshift(newContact);

    // 保存到数据库
    await db.chats.put(char);

    showCustomAlert('成功', `已添加联系人：${name}`);
  }

  // 打开联系人设置界面
  function openMyPhoneContactSettings() {
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) return;

    const index = window.currentMyPhoneConversationIndex;
    if (index === -1 || index === undefined) return;

    const contact = char.myPhoneSimulatedQQConversations[index];
    if (!contact) return;

    // 填充设置界面
    document.getElementById('myphone-settings-avatar-img').src = contact.avatar || defaultAvatar;
    document.getElementById('myphone-settings-name').value = contact.originalName || contact.name;
    document.getElementById('myphone-settings-remark').value = contact.name;

    // 渲染对话列表
    renderMyPhoneContactMessages(contact);

    switchToMyPhoneScreen('myphone-contact-settings-screen');
  }

  // 渲染联系人的对话列表
  function renderMyPhoneContactMessages(contact) {
    const listEl = document.getElementById('myphone-conversation-list');
    listEl.innerHTML = '';

    if (!contact.messages || contact.messages.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">暂无对话记录</p>';
      return;
    }

    contact.messages.forEach((msg, idx) => {
      const msgEl = document.createElement('div');
      msgEl.style.cssText = 'padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 8px; background: var(--secondary-bg);';

      // 根据消息类型显示不同内容
      let contentDisplay = '';
      let typeLabel = '';

      if (msg.type === 'voice_message') {
        typeLabel = '[语音]';
        contentDisplay = msg.content;
      } else if (msg.type === 'ai_image') {
        typeLabel = '[图片]';
        contentDisplay = msg.content;
      } else if (msg.type === 'transfer') {
        typeLabel = '[转账]';
        contentDisplay = `¥${msg.amount} - ${msg.note || ''}`;
      } else {
        contentDisplay = msg.content;
      }

      msgEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
          <div>
            <span style="font-weight: 500; color: var(--text-color);">${msg.role === 'user' ? '我' : contact.name}</span>
            ${typeLabel ? `<span style="margin-left: 8px; padding: 2px 6px; background: var(--accent-color); color: white; border-radius: 4px; font-size: 11px;">${typeLabel}</span>` : ''}
          </div>
          <button onclick="deleteMyPhoneMessage(${idx})" style="padding: 4px 8px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">删除</button>
        </div>
        <div style="color: var(--text-color);">${contentDisplay}</div>
      `;
      listEl.appendChild(msgEl);
    });
  }

  // 删除对话消息
  window.deleteMyPhoneMessage = async function (msgIndex) {
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) return;

    const index = window.currentMyPhoneConversationIndex;
    const contact = char.myPhoneSimulatedQQConversations[index];
    if (!contact) return;

    contact.messages.splice(msgIndex, 1);
    await db.chats.put(char);

    renderMyPhoneContactMessages(contact);
  };

  // 保存联系人设置
  async function saveMyPhoneContactSettings() {
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) return;

    const index = window.currentMyPhoneConversationIndex;
    const contact = char.myPhoneSimulatedQQConversations[index];
    if (!contact) return;

    const newName = document.getElementById('myphone-settings-name').value.trim();
    const newRemark = document.getElementById('myphone-settings-remark').value.trim();

    if (!newName) {
      showCustomAlert('提示', '联系人名称不能为空');
      return;
    }

    contact.originalName = newName;
    contact.name = newRemark || newName;

    await db.chats.put(char);

    showCustomAlert('成功', '设置已保存');

    // 返回对话界面
    await openMyPhoneConversation(index);
  }

  // 更换联系人头像
  async function changeMyPhoneContactAvatar() {
    const avatarChoice = await showChoiceModal('选择头像方式', [
      { text: '上传本地图片', value: 'upload' },
      { text: '输入图片URL', value: 'url' }
    ]);

    let newAvatar = null;

    if (avatarChoice === 'upload') {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';

      newAvatar = await new Promise((resolve) => {
        fileInput.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.readAsDataURL(file);
          } else {
            resolve(null);
          }
        };
        fileInput.click();
      });
    } else if (avatarChoice === 'url') {
      const avatarUrl = await showCustomPrompt('输入头像URL', '请输入图片URL地址');
      if (avatarUrl && avatarUrl.trim()) {
        newAvatar = avatarUrl.trim();
      }
    }

    if (newAvatar) {
      const char = state.chats[activeMyPhoneCharacterId];
      const index = window.currentMyPhoneConversationIndex;
      const contact = char.myPhoneSimulatedQQConversations[index];

      contact.avatar = newAvatar;
      document.getElementById('myphone-settings-avatar-img').src = newAvatar;

      await db.chats.put(char);
    }
  }

  // 添加对话消息
  async function addMyPhoneMessage() {
    const role = await showChoiceModal('选择发送者', [
      { text: '我发送', value: 'user' },
      { text: `${document.getElementById('myphone-settings-name').value}发送`, value: 'assistant' }
    ]);

    if (!role) return;

    // 选择消息类型
    const msgType = await showChoiceModal('选择消息类型', [
      { text: '文字消息', value: 'text' },
      { text: '图片', value: 'image' },
      { text: '语音', value: 'voice' },
      { text: '转账', value: 'transfer' }
    ]);

    if (!msgType) return;

    const char = state.chats[activeMyPhoneCharacterId];
    const index = window.currentMyPhoneConversationIndex;
    const contact = char.myPhoneSimulatedQQConversations[index];

    if (!contact.messages) {
      contact.messages = [];
    }

    let newMessage = {
      role: role,
      timestamp: new Date().toISOString()
    };

    let lastMsgPreview = '';

    if (msgType === 'text') {
      // 文字消息
      const content = await showCustomPrompt('输入消息内容', '请输入要添加的消息', '', 'textarea');
      if (!content || !content.trim()) return;

      newMessage.content = content.trim();
      lastMsgPreview = content.trim();

    } else if (msgType === 'image') {
      // 图片消息
      const description = await showCustomPrompt('图片描述', '请输入图片的中文描述');
      if (!description || !description.trim()) return;

      const imagePrompt = await showCustomPrompt('图片提示词（可选）', '请输入英文图片生成提示词（可选，留空则不生成图片）');

      newMessage.type = 'ai_image';
      newMessage.content = description.trim();
      if (imagePrompt && imagePrompt.trim()) {
        newMessage.image_prompt = imagePrompt.trim();
      }
      lastMsgPreview = '[图片]';

    } else if (msgType === 'voice') {
      // 语音消息
      const content = await showCustomPrompt('语音内容', '请输入语音的文字内容', '', 'textarea');
      if (!content || !content.trim()) return;

      newMessage.type = 'voice_message';
      newMessage.content = content.trim();
      lastMsgPreview = '[语音]';

    } else if (msgType === 'transfer') {
      // 转账消息
      const amount = await showCustomPrompt('转账金额', '请输入转账金额（数字）');
      if (!amount || !amount.trim()) return;

      const note = await showCustomPrompt('转账备注', '请输入转账备注（可选）');

      const senderName = role === 'user' ? (char.settings.myNickname || '我') : contact.name;
      const receiverName = role === 'user' ? contact.name : (char.settings.myNickname || '我');

      newMessage.type = 'transfer';
      newMessage.amount = parseFloat(amount.trim()) || 0;
      newMessage.note = note ? note.trim() : '转账';
      newMessage.senderName = senderName;
      newMessage.receiverName = receiverName;
      newMessage.status = 'accepted';
      newMessage.content = `转账 ¥${newMessage.amount}`;
      lastMsgPreview = '[转账]';
    }

    contact.messages.push(newMessage);

    // 更新最后一条消息
    contact.lastMessage = lastMsgPreview.substring(0, 20) + (lastMsgPreview.length > 20 ? '...' : '');

    await db.chats.put(char);

    renderMyPhoneContactMessages(contact);
  }

  // My Phone 转账操作相关函数
  let activeMyPhoneTransferTimestamp = null;

  function showMyPhoneTransferActionModal(timestamp) {
    activeMyPhoneTransferTimestamp = timestamp;

    const char = state.chats[activeMyPhoneCharacterId];
    const index = window.currentMyPhoneConversationIndex;

    let message;
    if (index === -1) {
      // 与角色的真实对话
      message = char.history.find(m => m.timestamp === timestamp);
    } else {
      // 模拟对话
      const contact = char.myPhoneSimulatedQQConversations[index];
      message = contact.messages.find(m => m.timestamp === timestamp);
    }

    if (message) {
      document.getElementById('transfer-sender-name').textContent = message.senderName || '对方';
    }
    document.getElementById('transfer-actions-modal').classList.add('visible');
  }

  async function handleMyPhoneTransferResponse(choice) {
    if (!activeMyPhoneTransferTimestamp) return;

    const timestamp = activeMyPhoneTransferTimestamp;
    const char = state.chats[activeMyPhoneCharacterId];
    const index = window.currentMyPhoneConversationIndex;

    let message, messageArray;

    if (index === -1) {
      // 与角色的真实对话
      messageArray = char.history;
      message = messageArray.find(m => m.timestamp === timestamp);
    } else {
      // 模拟对话
      const contact = char.myPhoneSimulatedQQConversations[index];
      messageArray = contact.messages;
      message = messageArray.find(m => m.timestamp === timestamp);
    }

    if (!message) return;

    // 防止重复点击
    if (message.status && message.status !== 'pending') {
      hideTransferActionModal();
      return;
    }

    let transferAmount = parseFloat(message.amount);
    if (isNaN(transferAmount)) {
      transferAmount = 0;
    }

    message.status = choice;

    if (choice === 'declined') {
      // 拒收逻辑 - 添加退款消息
      const refundMessage = {
        role: 'user',
        type: 'transfer',
        isRefund: true,
        amount: transferAmount,
        note: '已拒收对方转账',
        senderName: char.settings.myNickname || '我',
        receiverName: message.senderName,
        timestamp: Date.now(),
        status: 'accepted'
      };
      messageArray.push(refundMessage);

      // 如果是真实对话，添加隐藏系统消息
      if (index === -1) {
        const hiddenMessage = {
          role: 'system',
          content: `[系统提示：你拒绝并退还了"${message.senderName}"的转账。]`,
          timestamp: Date.now() + 1,
          isHidden: true
        };
        messageArray.push(hiddenMessage);
      }
    } else {
      // 接收逻辑
      if (transferAmount > 0 && index === -1) {
        // 只有真实对话才记账
        const success = await processTransaction(transferAmount, 'income', `收到转账-${message.senderName}`);

        if (success) {
          await showCustomAlert("收款成功", `已存入余额：+ ¥${transferAmount.toFixed(2)}`);

          // 添加已收款消息
          const receivedMessage = {
            role: 'user',
            type: 'transfer',
            isReceived: true,
            amount: transferAmount,
            note: '已收款',
            senderName: '我',
            receiverName: message.senderName,
            timestamp: Date.now(),
            status: 'accepted'
          };
          messageArray.push(receivedMessage);
        } else {
          alert("警告：金额入账失败！");
        }
      }

      // 如果是真实对话，添加隐藏系统消息
      if (index === -1) {
        const hiddenMessage = {
          role: 'system',
          content: `[系统提示：你接受了"${message.senderName}"的转账。]`,
          timestamp: Date.now() + 1,
          isHidden: true
        };
        messageArray.push(hiddenMessage);
      }
    }

    // 保存更改
    await db.chats.put(char);

    // 关闭弹窗并刷新界面
    hideTransferActionModal();
    activeMyPhoneTransferTimestamp = null;

    // 重新打开对话以刷新显示
    await openMyPhoneConversation(index);
  }


  function applyMyPhoneAppIcons() {
    // 先保存所有 MyPhone 应用图标的默认 src（如果还没保存的话）
    const iconElements = document.querySelectorAll('[id^="myphone-icon-img-"]');
    iconElements.forEach(img => {
      if (!img.dataset.defaultSrc) {
        img.dataset.defaultSrc = img.src;
      }
    });

    if (!state.globalSettings.myphoneAppIcons) return;

    for (const iconId in state.globalSettings.myphoneAppIcons) {
      const imgElement = document.getElementById(`myphone-icon-img-${iconId}`);
      if (imgElement) {
        imgElement.src = state.globalSettings.myphoneAppIcons[iconId];
      }
    }
  }

  async function openMyPhoneApp(appName) {
    if (!activeMyPhoneCharacterId) return;
    const char = state.chats[activeMyPhoneCharacterId];

    // 不再自动记录APP使用，改为只能手动添加或API生成

    switch (appName) {
      case 'qq':
        renderMyPhoneSimulatedQQ();
        switchToMyPhoneScreen('myphone-qq-screen');
        break;
      case 'album':
        renderMyPhoneAlbum();
        switchToMyPhoneScreen('myphone-album-screen');
        break;
      case 'browser':
        renderMyPhoneBrowserHistory();
        switchToMyPhoneScreen('myphone-browser-screen');
        break;
      case 'taobao':
        renderMyPhoneTaobao();
        switchToMyPhoneScreen('myphone-taobao-screen');
        break;
      case 'memo':
        renderMyPhoneMemoList();
        switchToMyPhoneScreen('myphone-memo-screen');
        break;
      case 'diary':
        renderMyPhoneDiaryList();
        switchToMyPhoneScreen('myphone-diary-screen');
        break;
      case 'amap':
        renderMyPhoneAmap();
        switchToMyPhoneScreen('myphone-amap-screen');
        break;
      case 'music':
        renderMyPhoneMusicScreen();
        switchToMyPhoneScreen('myphone-music-screen');
        break;
      case 'usage':
        renderMyPhoneAppUsage();
        switchToMyPhoneScreen('myphone-usage-screen');
        break;
    }
  }

  // logMyPhoneAppUsage 函数已移除，MYphone不再自动记录APP使用
  // APP使用记录现在只能通过手动添加或API生成


  // ============================================================
  // MyPhone QQ 渲染函数（从 script.js 迁移）
  // ============================================================

  async function renderMyPhoneSimulatedQQ() {
    const listEl = document.getElementById('myphone-chat-list');
    listEl.innerHTML = '';
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) return;

    const userDisplayName = state.qzoneSettings.nickname || '我';
    const lastRealMessage = char.history.filter(m => !m.isHidden).slice(-1)[0] || { content: '...' };

    let lastMsgContent = '...';
    if (lastRealMessage) {
      if (typeof lastRealMessage.content === 'string') {
        lastMsgContent = lastRealMessage.content;
      } else if (Array.isArray(lastRealMessage.content) && lastRealMessage.content[0]?.type === 'image_url') {
        lastMsgContent = '[图片]';
      } else if (lastRealMessage.type) {
        const typeMap = {
          'voice_message': '[语音]',
          'transfer': '[转账]',
          'ai_image': '[图片]'
        };
        lastMsgContent = typeMap[lastRealMessage.type] || `[${lastRealMessage.type}]`;
      }
    }

    const charAvatar = char.settings.aiAvatar || defaultAvatar;
    const charFrame = char.settings.aiAvatarFrame || '';
    let avatarHtml;
    if (charFrame) {
      avatarHtml = `<div class="avatar-group has-frame" style="width: 45px; height: 45px;"><div class="avatar-with-frame" style="width: 45px; height: 45px;"><img src="${charAvatar}" class="avatar-img" style="border-radius: 50%;"><img src="${charFrame}" class="avatar-frame"></div></div>`;
    } else {
      avatarHtml = `<div class="avatar-group" style="width: 45px; height: 45px;"><img src="${charAvatar}" class="avatar" style="border-radius: 50%; width: 45px; height: 45px;"></div>`;
    }

    const charChatItem = document.createElement('div');
    charChatItem.className = 'chat-list-item';
    charChatItem.dataset.conversationIndex = "-1";
    charChatItem.innerHTML = `
      ${avatarHtml}
      <div class="info">
          <div class="name-line">
              <span class="name">${char.name}</span>
          </div>
          <div class="last-msg">${String(lastMsgContent).substring(0, 20)}...</div>
      </div>
  `;
    charChatItem.addEventListener('click', () => openMyPhoneConversation(-1));
    listEl.appendChild(charChatItem);

    const simulatedConversations = char.myPhoneSimulatedQQConversations || [];
    simulatedConversations.forEach((conv, idx) => {
      const item = document.createElement('div');
      item.className = 'chat-list-item';
      item.dataset.conversationIndex = idx;

      // 检查是否在删除模式下
      const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'qq';

      if (isDeleteMode) {
        item.innerHTML = `
        <input type="checkbox" class="myphone-delete-checkbox" data-index="${idx}" style="width: 20px; height: 20px; margin-right: 10px; cursor: pointer;" onchange="toggleMyPhoneItemSelection(${idx})">
        <img src="${conv.avatar || defaultAvatar}" class="avatar">
        <div class="info">
          <div class="name-line">
            <span class="name">${conv.name}</span>
          </div>
          <div class="last-msg">${conv.lastMessage || '...'}</div>
        </div>
      `;
        item.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(idx);
          const checkbox = item.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(idx);
        });
      } else {
        item.innerHTML = `
        <img src="${conv.avatar || defaultAvatar}" class="avatar">
        <div class="info">
          <div class="name-line">
            <span class="name">${conv.name}</span>
          </div>
          <div class="last-msg">${conv.lastMessage || '...'}</div>
        </div>
      `;
        item.addEventListener('click', () => openMyPhoneConversation(idx));
      }

      listEl.appendChild(item);
    });

    document.getElementById('back-to-myphone-qq-list-btn').onclick = () => switchToMyPhoneScreen('myphone-qq-screen');
  }

  async function openMyPhoneConversation(index) {
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) return;

    // 保存当前对话索引
    window.currentMyPhoneConversationIndex = index;
    myphoneActiveConversationIndex = index;

    const messagesEl = document.getElementById('myphone-conversation-messages');
    messagesEl.innerHTML = '';
    messagesEl.dataset.theme = char.settings.theme || 'default';

    let partnerName, messages, tempChatObject;
    const settingsBtn = document.getElementById('myphone-conversation-settings-btn');

    if (index === -1) {
      // 与角色的真实对话 - 不显示设置按钮，使用渲染窗口机制
      partnerName = char.name;
      settingsBtn.style.display = 'none';

      tempChatObject = {
        id: 'temp_myphone_user_chat',
        isGroup: false,
        name: state.qzoneSettings.nickname || '我',
        settings: {
          ...char.settings,
          myAvatar: char.settings.myAvatar || defaultAvatar,
          myAvatarFrame: char.settings.myAvatarFrame || '',
          aiAvatar: char.settings.aiAvatar || defaultAvatar,
          aiAvatarFrame: char.settings.aiAvatarFrame || ''
        }
      };

      // 使用渲染窗口机制，只渲染最近的消息
      myphoneRenderedCount = 0;
      isLoadingMoreMyPhoneMessages = false;

      const allVisibleMessages = char.history.filter(m => !m.isHidden);
      const renderWindow = state.globalSettings.chatRenderWindow || 50;
      const initialMessages = allVisibleMessages.slice(-renderWindow);
      messages = initialMessages;
      myphoneRenderedCount = initialMessages.length;
    } else {
      // 模拟对话 - 显示设置按钮
      const conv = char.myPhoneSimulatedQQConversations[index];
      partnerName = conv.name;
      settingsBtn.style.display = 'block';

      const userAvatar = char.settings.myAvatar || state.qzoneSettings.avatar || defaultAvatar;
      const userAvatarFrame = char.settings.myAvatarFrame || '';

      tempChatObject = {
        id: 'temp_myphone_simulated_chat',
        isGroup: false,
        name: conv.name,
        settings: {
          myAvatar: userAvatar,
          myAvatarFrame: userAvatarFrame,
          aiAvatar: conv.avatar || defaultAvatar,
          aiAvatarFrame: ''
        }
      };

      messages = conv.messages || [];
    }

    document.getElementById('myphone-conversation-partner-name').textContent = partnerName;

    for (const msg of messages) {
      const messageEl = await createMessageElement(msg, tempChatObject);
      if (messageEl) {
        messagesEl.appendChild(messageEl);
      }
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
    switchToMyPhoneScreen('myphone-qq-conversation-screen');
  }


  // ============================================================
  // 全局暴露（供 HTML onclick 和其他模块调用）
  // ============================================================
  window.openMyphoneScreen = openMyphoneScreen;
  window.openMyPhoneApp = openMyPhoneApp;
  window.renderMyPhoneSimulatedQQ = renderMyPhoneSimulatedQQ;
  window.openMyPhoneConversation = openMyPhoneConversation;
  window.switchToMyPhoneHomeScreen = switchToMyPhoneHomeScreen;
  window.switchToMyPhoneScreen = switchToMyPhoneScreen;
  window.switchToCPhone = switchToCPhone;
  window.openMyPhoneSettings = openMyPhoneSettings;
  window.openMyPhoneViewRecords = openMyPhoneViewRecords;
  window.showMyPhoneAddContactDialog = showMyPhoneAddContactDialog;
  window.manualCreateMyPhoneContact = manualCreateMyPhoneContact;
  window.showImportMainScreenCharacters = showImportMainScreenCharacters;
  window.updateImportSelectAllState = updateImportSelectAllState;
  window.importSelectedCharacters = importSelectedCharacters;
  window.openMyPhoneContactSettings = openMyPhoneContactSettings;
  window.saveMyPhoneContactSettings = saveMyPhoneContactSettings;
  window.changeMyPhoneContactAvatar = changeMyPhoneContactAvatar;
  window.addMyPhoneMessage = addMyPhoneMessage;
  window.showMyPhoneTransferActionModal = showMyPhoneTransferActionModal;
  window.handleMyPhoneTransferResponse = handleMyPhoneTransferResponse;
  window.toggleMyPhoneDeleteMode = toggleMyPhoneDeleteMode;
  window.enterMyPhoneDeleteMode = enterMyPhoneDeleteMode;
  window.applyMyPhoneAppIcons = applyMyPhoneAppIcons;
  window.enterMyPhone = enterMyPhone;
  window.renderMyPhoneHomeScreen = renderMyPhoneHomeScreen;
  window.renderMyPhoneCharacterSelector = renderMyPhoneCharacterSelector;
  window.showMyPhoneLockScreen = showMyPhoneLockScreen;
  window.updateMyPhoneLockScreenClock = updateMyPhoneLockScreenClock;
  window.showMyPhonePasswordInput = showMyPhonePasswordInput;
  window.hideMyPhonePasswordInput = hideMyPhonePasswordInput;
  window.checkMyPhoneLockPassword = checkMyPhoneLockPassword;
  window.renderMyPhoneContactMessages = renderMyPhoneContactMessages;


  // ========== 从 script.js 迁移的 MyPhone 渲染和保存函数 ==========

  async function renderMyPhoneAlbum() {
    const gridEl = document.getElementById('myphone-album-grid');
    gridEl.innerHTML = '';
    if (!activeMyPhoneCharacterId) return;
    const char = state.chats[activeMyPhoneCharacterId];
    const photos = char.myPhoneAlbum || [];

    if (photos.length === 0) {
      gridEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">我的相册还是空的，<br>点击右上角刷新按钮生成一些照片吧！</p>';
      return;
    }

    const fallbackImageUrl = `https://i.postimg.cc/KYr2qRCK/1.jpg`;
    const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'album';

    photos.forEach((photo, idx) => {
      const item = document.createElement('div');
      item.className = 'char-photo-item';
      item.dataset.description = photo.description;
      item.style.position = 'relative';
      gridEl.appendChild(item);

      if (isDeleteMode) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'myphone-delete-checkbox';
        checkbox.dataset.index = idx;
        checkbox.checked = myPhoneDeleteMode.selectedIndices.has(idx);
        checkbox.style.cssText = 'position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; cursor: pointer; z-index: 10;';
        checkbox.onchange = () => toggleMyPhoneItemSelection(idx);
        item.appendChild(checkbox);
      }

      if (state.globalSettings.enableAiDrawing) {
        item.style.backgroundColor = '#e9ecef';
        const containsNonEnglish = /[^\x00-\x7F]/.test(photo.image_prompt);
        const isValidPrompt = photo.image_prompt && photo.image_prompt.trim() && !containsNonEnglish;
        const finalPrompt = isValidPrompt ? photo.image_prompt : 'a beautiful scenery, anime style, cinematic lighting';
        const imageUrl = getPollinationsImageUrl(finalPrompt);
        const img = new Image();
        img.onload = function () { item.style.backgroundImage = `url(${this.src})`; };
        img.onerror = function () { item.style.backgroundImage = `url(${fallbackImageUrl})`; };
        img.src = imageUrl;
      } else {
        item.style.backgroundColor = '#f0f2f5';
        item.style.border = '1px solid #e0e0e0';
        const descriptionEl = document.createElement('p');
        descriptionEl.className = 'char-photo-description';
        descriptionEl.textContent = photo.description || '(这张照片没有描述)';
        item.appendChild(descriptionEl);
      }

      if (isDeleteMode) {
        item.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(idx);
          const checkbox = item.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(idx);
        });
      } else {
        item.addEventListener('click', () => { showCustomAlert('照片描述', photo.description || '无描述'); });
      }
    });
  }

  function renderMyPhoneBrowserHistory() {
    const listEl = document.getElementById('myphone-browser-list');
    listEl.innerHTML = '';
    if (!activeMyPhoneCharacterId) return;
    const char = state.chats[activeMyPhoneCharacterId];
    const history = char.myPhoneBrowserHistory || [];

    if (history.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">我的浏览器空空如也，<br>点击右上角刷新按钮生成一些记录吧！</p>';
      return;
    }

    const globeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
    const arrowIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'browser';

    history.forEach((item, index) => {
      const entryEl = document.createElement('div');
      entryEl.className = 'char-browser-item';
      let cleanUrl = item.url.replace(/^https?:\/\//, '').replace(/^www\./, '');
      if (cleanUrl.length > 25) cleanUrl = cleanUrl.substring(0, 25) + '...';

      if (isDeleteMode) {
        entryEl.innerHTML = `
        <input type="checkbox" class="myphone-delete-checkbox" data-index="${index}" style="width: 20px; height: 20px; margin-right: 10px; cursor: pointer;" onchange="toggleMyPhoneItemSelection(${index})">
        <div class="char-browser-icon-box">${globeIcon}</div>
        <div class="char-browser-content"><div class="char-browser-title">${item.title}</div><div class="char-browser-url">${cleanUrl}</div></div>
        <div class="char-browser-arrow">${arrowIcon}</div>`;
        entryEl.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(index);
          const checkbox = entryEl.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(index);
        });
      } else {
        entryEl.innerHTML = `
        <div class="char-browser-icon-box">${globeIcon}</div>
        <div class="char-browser-content"><div class="char-browser-title">${item.title}</div><div class="char-browser-url">${cleanUrl}</div></div>
        <div class="char-browser-arrow">${arrowIcon}</div>`;
        entryEl.addEventListener('click', () => openMyPhoneArticle(index));
      }
      listEl.appendChild(entryEl);
    });
    document.getElementById('back-to-myphone-browser-list-btn').onclick = () => switchToMyPhoneScreen('myphone-browser-screen');
  }

  async function openMyPhoneArticle(index) {
    const char = state.chats[activeMyPhoneCharacterId];
    const articleData = char.myPhoneBrowserHistory[index];
    if (!articleData) return;
    renderMyPhoneArticle(articleData);
    switchToMyPhoneScreen('myphone-browser-article-screen');
  }

  function renderMyPhoneArticle(articleData) {
    document.getElementById('myphone-article-title-header').textContent = articleData.title.substring(0, 10) + '...';
    document.getElementById('myphone-article-title').textContent = articleData.title;
    document.getElementById('myphone-article-meta').textContent = articleData.url;
    document.getElementById('myphone-article-content').textContent = articleData.content || '内容加载中...';
  }

  function renderMyPhoneTaobao() {
    const gridEl = document.getElementById('myphone-taobao-grid');
    gridEl.innerHTML = '';
    if (!activeMyPhoneCharacterId) return;
    const char = state.chats[activeMyPhoneCharacterId];
    const items = char.myPhoneTaobaoHistory || [];

    if (items.length === 0) {
      gridEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">我的淘宝空空如也，<br>点击右上角刷新按钮生成一些记录吧！</p>';
      return;
    }

    const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'taobao';

    items.forEach((item, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'char-product-item';
      itemEl.dataset.reason = item.reason || item.thought;
      itemEl.style.position = 'relative';

      let imageOrTextHtml;
      if (item.image_prompt && !item.useDefaultImage && state.globalSettings.enableAiDrawing) {
        const imageUrl = getPollinationsImageUrl(item.image_prompt);
        imageOrTextHtml = `<img src="${imageUrl}" class="product-image">`;
      } else {
        imageOrTextHtml = `<div class="char-product-description-overlay"><p class="char-photo-description">${item.thought || item.reason || '(无购买理由)'}</p></div>`;
      }

      let checkboxHtml = '';
      if (isDeleteMode) {
        checkboxHtml = `<input type="checkbox" class="myphone-delete-checkbox" data-index="${idx}" style="position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; cursor: pointer; z-index: 10;" onchange="toggleMyPhoneItemSelection(${idx})">`;
      }

      itemEl.innerHTML = `${checkboxHtml}${imageOrTextHtml}
      <div class="product-info">
        <div class="product-name">${item.name}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
          <div class="product-price">¥${(parseFloat(item.price) || 0).toFixed(2)}</div>
          <div class="char-product-status">${item.status || '已签收'}</div>
        </div>
      </div>`;

      if (isDeleteMode) {
        itemEl.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(idx);
          const checkbox = itemEl.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(idx);
        });
      } else {
        itemEl.addEventListener('click', () => { showCustomAlert('购买想法', item.thought || item.reason || '无想法记录'); });
      }
      gridEl.appendChild(itemEl);
    });
  }

  function renderMyPhoneMemoList() {
    const listEl = document.getElementById('myphone-memo-list');
    listEl.innerHTML = '';
    const char = state.chats[activeMyPhoneCharacterId];
    const memos = (char.myPhoneMemos || []).slice().reverse();

    if (memos.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">我的备忘录空空如也，<br>点击右上角+号添加或刷新按钮生成！</p>';
      return;
    }

    const memoIconSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    const arrowIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'memo';

    memos.forEach((memo, index) => {
      const item = document.createElement('div');
      item.className = 'memo-item';
      const previewText = (memo.content || '').split('\n')[0].substring(0, 50) || '无内容';
      const actualIndex = memos.length - 1 - index;

      if (isDeleteMode) {
        item.innerHTML = `
        <input type="checkbox" class="myphone-delete-checkbox" data-index="${actualIndex}" style="width: 20px; height: 20px; margin-right: 10px; cursor: pointer;" onchange="toggleMyPhoneItemSelection(${actualIndex})">
        <div class="cphone-item-icon-box memo-icon-style">${memoIconSVG}</div>
        <div class="cphone-item-info"><div class="cphone-item-title">${memo.title}</div><div class="cphone-item-preview">${previewText}</div></div>
        <div class="cphone-item-arrow">${arrowIcon}</div>`;
        item.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(actualIndex);
          const checkbox = item.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(actualIndex);
        });
      } else {
        item.innerHTML = `
        <div class="cphone-item-icon-box memo-icon-style">${memoIconSVG}</div>
        <div class="cphone-item-info"><div class="cphone-item-title">${memo.title}</div><div class="cphone-item-preview">${previewText}</div></div>
        <div class="cphone-item-arrow">${arrowIcon}</div>`;
        item.addEventListener('click', () => openMyPhoneMemo(actualIndex));
      }
      listEl.appendChild(item);
    });
    document.getElementById('back-to-myphone-memo-list-btn').onclick = () => switchToMyPhoneScreen('myphone-memo-screen');
  }

  function openMyPhoneMemo(index) {
    const char = state.chats[activeMyPhoneCharacterId];
    const memo = char.myPhoneMemos[index];
    if (!memo) return;
    document.getElementById('myphone-memo-title-header').textContent = memo.title.substring(0, 10) + '...';
    document.getElementById('myphone-memo-detail-title').textContent = memo.title;
    document.getElementById('myphone-memo-detail-date').textContent = memo.date;
    document.getElementById('myphone-memo-detail-content').textContent = memo.content;
    switchToMyPhoneScreen('myphone-memo-detail-screen');
  }

  function renderMyPhoneDiaryList() {
    const listEl = document.getElementById('myphone-diary-list');
    listEl.innerHTML = '';
    const char = state.chats[activeMyPhoneCharacterId];
    const diaries = (char.myPhoneDiaries || []).slice().reverse();

    if (diaries.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">我的日记空空如也，<br>点击右上角刷新按钮生成一些内容吧！</p>';
      return;
    }

    const diaryIconSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;
    const arrowIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'diary';

    diaries.forEach((diary, index) => {
      const item = document.createElement('div');
      item.className = 'diary-item';
      const dateStr = diary.date || new Date().toLocaleDateString('zh-CN');
      const actualIndex = diaries.length - 1 - index;

      if (isDeleteMode) {
        item.innerHTML = `
        <input type="checkbox" class="myphone-delete-checkbox" data-index="${actualIndex}" style="width: 20px; height: 20px; margin-right: 10px; cursor: pointer;" onchange="toggleMyPhoneItemSelection(${actualIndex})">
        <div class="cphone-item-icon-box diary-icon-style">${diaryIconSVG}</div>
        <div class="cphone-item-info"><div class="cphone-item-title">${diary.title}</div><div class="cphone-item-preview">${dateStr}</div></div>
        <div class="cphone-item-arrow">${arrowIcon}</div>`;
        item.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(actualIndex);
          const checkbox = item.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(actualIndex);
        });
      } else {
        item.innerHTML = `
        <div class="cphone-item-icon-box diary-icon-style">${diaryIconSVG}</div>
        <div class="cphone-item-info"><div class="cphone-item-title">${diary.title}</div><div class="cphone-item-preview">${dateStr}</div></div>
        <div class="cphone-item-arrow">${arrowIcon}</div>`;
        item.addEventListener('click', () => openMyPhoneDiary(actualIndex));
      }
      listEl.appendChild(item);
    });
    document.getElementById('back-to-myphone-diary-list-btn').onclick = () => switchToMyPhoneScreen('myphone-diary-screen');
  }

  function openMyPhoneDiary(index) {
    const char = state.chats[activeMyPhoneCharacterId];
    const diary = char.myPhoneDiaries[index];
    if (!diary) return;
    document.getElementById('myphone-diary-title-header').textContent = diary.title.substring(0, 10) + '...';
    document.getElementById('myphone-diary-detail-title').textContent = diary.title;
    document.getElementById('myphone-diary-detail-date').textContent = diary.date;
    const weatherEl = document.getElementById('myphone-diary-detail-weather');
    if (weatherEl) { weatherEl.textContent = diary.weather ? `天气：${diary.weather}` : ''; weatherEl.style.display = diary.weather ? 'block' : 'none'; }
    const prefaceEl = document.getElementById('myphone-diary-detail-preface');
    if (prefaceEl) { prefaceEl.textContent = diary.preface || ''; prefaceEl.style.display = diary.preface ? 'block' : 'none'; }
    document.getElementById('myphone-diary-detail-content').textContent = diary.content;
    switchToMyPhoneScreen('myphone-diary-detail-screen');
  }

  function renderMyPhoneAmap() {
    const listEl = document.getElementById('myphone-amap-list');
    listEl.innerHTML = '';
    if (!activeMyPhoneCharacterId) return;
    const char = state.chats[activeMyPhoneCharacterId];
    const locations = char.myPhoneAmapHistory || [];
    const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'amap';

    if (locations.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">我的足迹空空如也，<br>点击右上角刷新按钮生成一些记录吧！</p>';
      return;
    }

    locations.forEach((item, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'char-amap-item';
      itemEl.style.position = 'relative';
      const locationName = item.locationName || item.name || '未知地点';
      const address = item.address || '';
      const comment = item.comment || item.thought || '';
      const timeAgo = item.timeAgo || item.time || '某个时间';

      let photoHtml = '';
      if (item.image_prompt) {
        const imageUrl = getPollinationsImageUrl(item.image_prompt);
        photoHtml = `<div class="amap-item-photo" style="background-image: url('${imageUrl}')" data-comment="${comment}"></div>`;
      }

      let checkboxHtml = '';
      if (isDeleteMode) {
        checkboxHtml = `<input type="checkbox" class="myphone-delete-checkbox" data-index="${idx}" style="position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; cursor: pointer; z-index: 10;" onchange="toggleMyPhoneItemSelection(${idx})">`;
      }

      itemEl.innerHTML = `${checkboxHtml}
      <div class="amap-item-header"><div class="amap-item-icon">📍</div><div class="amap-item-info"><div class="amap-item-title">${locationName}</div><div class="amap-item-address">${address}</div></div></div>
      <div class="amap-item-body"><div class="amap-item-comment">${comment.replace(/\n/g, '<br>')}</div>${photoHtml}</div>
      <div class="amap-item-footer">${timeAgo}</div>`;

      if (isDeleteMode) {
        itemEl.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(idx);
          const checkbox = itemEl.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(idx);
        });
      }
      listEl.appendChild(itemEl);
    });
  }

  function renderMyPhoneAppUsage() {
    const listEl = document.getElementById('myphone-usage-list');
    listEl.innerHTML = '';
    if (!activeMyPhoneCharacterId) return;
    const char = state.chats[activeMyPhoneCharacterId];
    const originalUsage = char.myPhoneAppUsage || [];
    const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'usage';

    if (originalUsage.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">暂无使用记录，<br>点击右上角+号添加或刷新按钮生成！</p>';
      return;
    }

    let listToRender;
    if (isDeleteMode) {
      listToRender = originalUsage.map((item, idx) => ({ ...item, _originalIndex: idx }))
        .sort((a, b) => b.usageTimeMinutes - a.usageTimeMinutes);
    } else {
      const merged = new Map();
      originalUsage.forEach(item => {
        const key = `${item.appName}\t${item.category || ''}`;
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, { appName: item.appName, category: item.category || '其他', usageTimeMinutes: item.usageTimeMinutes || 0, iconUrl: item.iconUrl || '' });
        } else {
          existing.usageTimeMinutes += item.usageTimeMinutes || 0;
        }
      });
      listToRender = Array.from(merged.values()).sort((a, b) => b.usageTimeMinutes - a.usageTimeMinutes);
    }

    listToRender.forEach((item) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'char-usage-item';
      const totalMinutes = item.usageTimeMinutes || 0;
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      let timeString = '';
      if (hours > 0) timeString += `${hours}小时`;
      if (minutes > 0) timeString += `${minutes}分钟`;
      if (!timeString) timeString = '小于1分钟';

      let iconHtml = item.iconUrl
        ? `<img src="${item.iconUrl}" class="usage-item-icon">`
        : `<div class="usage-item-icon" style="background-color: #e0e0e0; display: flex; align-items: center; justify-content: center; color: #999; font-size: 20px;">📱</div>`;

      if (isDeleteMode) {
        const actualIndex = item._originalIndex;
        itemEl.innerHTML = `
        <input type="checkbox" class="myphone-delete-checkbox" data-index="${actualIndex}" style="width: 20px; height: 20px; margin-right: 10px; cursor: pointer;" onchange="toggleMyPhoneItemSelection(${actualIndex})">
        ${iconHtml}<div class="usage-item-info"><div class="usage-item-name">${item.appName}</div><div class="usage-item-category">${item.category}</div></div><div class="usage-item-time">${timeString}</div>`;
        itemEl.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(actualIndex);
          const checkbox = itemEl.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(actualIndex);
        });
      } else {
        itemEl.innerHTML = `${iconHtml}<div class="usage-item-info"><div class="usage-item-name">${item.appName}</div><div class="usage-item-category">${item.category}</div></div><div class="usage-item-time">${timeString}</div>`;
      }
      listEl.appendChild(itemEl);
    });
  }

  function renderMyPhoneMusicScreen() {
    const listEl = document.getElementById('myphone-music-list');
    listEl.innerHTML = '';
    if (!activeMyPhoneCharacterId) return;
    const char = state.chats[activeMyPhoneCharacterId];
    const playlist = char.myPhoneMusicPlaylist || [];
    const isDeleteMode = myPhoneDeleteMode.active && myPhoneDeleteMode.appType === 'music';

    if (playlist.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">我的歌单空空如也，<br>点击右上角+号添加或刷新按钮生成！</p>';
      return;
    }

    playlist.forEach((track, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'char-music-item';
      const coverUrl = track.cover || 'https://via.placeholder.com/60x60/cccccc/666666?text=Music';

      if (isDeleteMode) {
        itemEl.innerHTML = `
        <input type="checkbox" class="myphone-delete-checkbox" data-index="${index}" style="width: 20px; height: 20px; margin-right: 10px; cursor: pointer;" onchange="toggleMyPhoneItemSelection(${index})">
        <img src="${coverUrl}" class="music-item-cover">
        <div class="music-item-info"><div class="music-item-name">${track.name || track.title || '未知歌曲'}</div><div class="music-item-artist">${track.artist || '未知歌手'}</div></div>`;
        itemEl.addEventListener('click', (e) => {
          if (e.target.classList.contains('myphone-delete-checkbox')) return;
          toggleMyPhoneItemSelection(index);
          const checkbox = itemEl.querySelector('.myphone-delete-checkbox');
          if (checkbox) checkbox.checked = myPhoneDeleteMode.selectedIndices.has(index);
        });
      } else {
        itemEl.innerHTML = `
        <img src="${coverUrl}" class="music-item-cover">
        <div class="music-item-info"><div class="music-item-name">${track.name || track.title || '未知歌曲'}</div><div class="music-item-artist">${track.artist || '未知歌手'}</div></div>`;
        itemEl.addEventListener('click', () => playMyPhoneSong(index, playlist));
      }
      listEl.appendChild(itemEl);
    });
  }

  function playMyPhoneSong(songIndex, playlist) {
    const player = document.getElementById('char-audio-player');
    const modal = document.getElementById('char-music-player-modal');
    if (charPlayerState.lrcUpdateInterval) clearInterval(charPlayerState.lrcUpdateInterval);
    player.pause();

    charPlayerState.currentPlaylist = playlist;
    charPlayerState.currentIndex = songIndex;
    const songObject = playlist[songIndex];
    if (!songObject) { console.error("playMyPhoneSong: 歌曲索引无效或歌单为空。"); return; }

    const songName = songObject.name || songObject.title || '未知歌曲';
    const songArtist = songObject.artist || '未知歌手';
    const songCover = songObject.cover || 'https://via.placeholder.com/300x300/cccccc/666666?text=Music';

    document.getElementById('char-music-player-title').textContent = songName;
    document.getElementById('char-music-artist').textContent = songArtist;
    document.getElementById('char-music-cover').src = songCover;

    charPlayerState.parsedLyrics = parseLRC(songObject.lrcContent || "");
    renderCharLyrics();

    if (songObject.isLocal) {
      const blob = new Blob([songObject.src], { type: songObject.fileType || 'audio/mpeg' });
      player.src = URL.createObjectURL(blob);
    } else if (songObject.src || songObject.url) {
      player.src = songObject.src || songObject.url;
    } else {
      showCustomAlert('错误', '该歌曲没有可播放的音源');
      return;
    }

    player.play().catch(e => { console.error("音频播放失败:", e); showCustomAlert('播放失败', '无法播放此音频文件'); });
    player.onloadedmetadata = () => {
      const duration = player.duration;
      if (isFinite(duration)) {
        document.getElementById('char-music-total-time').textContent = formatTime(duration);
        document.getElementById('char-music-progress-bar').max = duration;
      }
    };

    modal.classList.add('visible');
    charPlayerState.isPlaying = true;
    updateCharPlayButton();
    charPlayerState.lrcUpdateInterval = setInterval(() => {
      const currentTime = player.currentTime;
      updateCharLyricHighlight(currentTime);
      document.getElementById('char-music-current-time').textContent = formatTime(currentTime);
      document.getElementById('char-music-progress-bar').value = currentTime;
    }, 100);
  }

  function renderMyPhoneYiqitingSongList() {
    const listEl = document.getElementById('myphone-yiqiting-song-list');
    listEl.innerHTML = '';
    const yiqitingPlaylist = musicState.playlist || [];

    if (yiqitingPlaylist.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 20px;">一起听播放列表为空<br>请先在主屏幕QQ一起听中添加歌曲</p>';
      return;
    }

    yiqitingPlaylist.forEach((song, index) => {
      const item = document.createElement('div');
      item.className = 'yiqiting-song-item';
      item.style.cssText = 'display: flex; align-items: center; padding: 10px; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background 0.2s;';
      item.innerHTML = `
      <input type="checkbox" class="yiqiting-song-checkbox" data-index="${index}" style="margin-right: 10px; width: 18px; height: 18px; cursor: pointer;">
      <div style="flex: 1;">
        <div style="font-weight: 500; color: var(--text-color);">${song.name || '未知歌曲'}</div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${song.artist || '未知歌手'}</div>
      </div>`;
      item.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT') { const checkbox = item.querySelector('.yiqiting-song-checkbox'); checkbox.checked = !checkbox.checked; } });
      item.addEventListener('mouseenter', () => { item.style.background = 'var(--hover-bg)'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
      listEl.appendChild(item);
    });
  }

  function toggleMyPhoneMusicInputs() {
    const source = document.getElementById('myphone-music-source-select')?.value;
    const fileGroup = document.getElementById('myphone-music-file-group');
    const urlGroup = document.getElementById('myphone-music-url-group');
    const yiqitingListGroup = document.getElementById('myphone-yiqiting-list-group');
    const manualInputs = document.getElementById('myphone-music-manual-inputs');

    if (source === 'yiqiting') {
      fileGroup.style.display = 'none';
      yiqitingListGroup.style.display = 'block';
      manualInputs.style.display = 'none';
      renderMyPhoneYiqitingSongList();
    } else if (source === 'local') {
      fileGroup.style.display = 'block';
      urlGroup.style.display = 'none';
      yiqitingListGroup.style.display = 'none';
      manualInputs.style.display = 'block';
    } else {
      fileGroup.style.display = 'none';
      urlGroup.style.display = 'block';
      yiqitingListGroup.style.display = 'none';
      manualInputs.style.display = 'block';
    }
  }

  async function saveMyPhoneMusic() {
    const source = document.getElementById('myphone-music-source-select')?.value;
    if (!activeMyPhoneCharacterId) { showCustomAlert('错误', '未选择角色'); return; }
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char.myPhoneMusicPlaylist) char.myPhoneMusicPlaylist = [];

    if (source === 'yiqiting') {
      const checkboxes = document.querySelectorAll('.yiqiting-song-checkbox:checked');
      if (checkboxes.length === 0) { showCustomAlert('错误', '请至少选择一首歌曲'); return; }
      let importedCount = 0;
      checkboxes.forEach(checkbox => {
        const index = parseInt(checkbox.dataset.index);
        const originalSong = musicState.playlist[index];
        if (originalSong) {
          char.myPhoneMusicPlaylist.unshift({
            name: originalSong.name, artist: originalSong.artist, src: originalSong.src,
            fileType: originalSong.fileType, isLocal: originalSong.isLocal,
            lrcContent: originalSong.lrcContent || "",
            cover: originalSong.cover || 'https://via.placeholder.com/300x300/cccccc/666666?text=Music'
          });
          importedCount++;
        }
      });
      await db.chats.put(char);
      renderMyPhoneMusicScreen();
      document.getElementById('myphone-add-music-modal')?.classList.remove('visible');
      document.getElementById('myphone-yiqiting-select-all').checked = false;
      showCustomAlert('成功', `已导入 ${importedCount} 首歌曲`);
    } else if (source === 'local') {
      const fileInput = document.getElementById('myphone-music-file-input');
      const file = fileInput?.files[0];
      const title = document.getElementById('myphone-music-title-input')?.value?.trim();
      const artist = document.getElementById('myphone-music-artist-input')?.value?.trim();
      if (!file) { showCustomAlert('错误', '请选择音频文件'); return; }
      if (!title) { showCustomAlert('错误', '请填写歌曲标题'); return; }
      let songSrc = null; let isLocal = true;
      try {
        const catboxUrl = await uploadFileToCatbox(file);
        if (catboxUrl) { songSrc = catboxUrl; isLocal = false; await showCustomAlert("上传成功", `歌曲 "${file.name}" 已成功上传到 Catbox！`); }
        else { songSrc = await file.arrayBuffer(); isLocal = true; }
      } catch (uploadError) {
        console.error("Catbox 上传失败:", uploadError);
        await showCustomAlert("上传失败", `上传到 Catbox 失败: ${uploadError.message}\n\n将改为本地保存。`);
        songSrc = await file.arrayBuffer(); isLocal = true;
      }
      char.myPhoneMusicPlaylist.unshift({ name: title, artist: artist || '未知歌手', src: songSrc, fileType: file.type, isLocal: isLocal, lrcContent: "", cover: 'https://via.placeholder.com/300x300/cccccc/666666?text=Music' });
      await db.chats.put(char); renderMyPhoneMusicScreen();
      document.getElementById('myphone-add-music-modal')?.classList.remove('visible');
      document.getElementById('myphone-music-title-input').value = ''; document.getElementById('myphone-music-artist-input').value = ''; document.getElementById('myphone-music-file-input').value = '';
      showCustomAlert('成功', '歌曲已添加');
    } else {
      const url = document.getElementById('myphone-music-url-input')?.value?.trim();
      const title = document.getElementById('myphone-music-title-input')?.value?.trim();
      const artist = document.getElementById('myphone-music-artist-input')?.value?.trim();
      if (!title || !url) { showCustomAlert('错误', '请填写歌曲标题和链接'); return; }
      char.myPhoneMusicPlaylist.unshift({ name: title, artist: artist || '未知歌手', src: url, isLocal: false, lrcContent: "", cover: 'https://via.placeholder.com/300x300/cccccc/666666?text=Music' });
      await db.chats.put(char); renderMyPhoneMusicScreen();
      document.getElementById('myphone-add-music-modal')?.classList.remove('visible');
      document.getElementById('myphone-music-title-input').value = ''; document.getElementById('myphone-music-artist-input').value = ''; document.getElementById('myphone-music-url-input').value = '';
      showCustomAlert('成功', '歌曲已添加');
    }
  }

  async function saveMyPhoneAlbum() {
    const description = document.getElementById('myphone-album-description-input')?.value?.trim();
    if (!description) { showCustomAlert('错误', '请输入图片描述'); return; }
    if (!activeMyPhoneCharacterId) { showCustomAlert('错误', '未选择角色'); return; }
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char.myPhoneAlbum) char.myPhoneAlbum = [];
    char.myPhoneAlbum.unshift({ description: description, image_prompt: description, date: new Date().toLocaleDateString('zh-CN') });
    await db.chats.put(char); renderMyPhoneAlbum();
    document.getElementById('myphone-add-album-modal')?.classList.remove('visible');
    document.getElementById('myphone-album-description-input').value = '';
    showCustomAlert('成功', '照片已添加');
  }

  async function saveMyPhoneBrowser() {
    const title = document.getElementById('myphone-browser-title-input')?.value?.trim();
    const content = document.getElementById('myphone-browser-content-input')?.value?.trim();
    if (!title || !content) { showCustomAlert('错误', '请填写标题和内容'); return; }
    if (!activeMyPhoneCharacterId) { showCustomAlert('错误', '未选择角色'); return; }
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char.myPhoneBrowserHistory) char.myPhoneBrowserHistory = [];
    char.myPhoneBrowserHistory.unshift({ title: title, url: 'www.example.com', content: content, date: new Date().toLocaleDateString('zh-CN') });
    await db.chats.put(char); renderMyPhoneBrowserHistory();
    document.getElementById('myphone-add-browser-modal')?.classList.remove('visible');
    document.getElementById('myphone-browser-title-input').value = ''; document.getElementById('myphone-browser-content-input').value = '';
    showCustomAlert('成功', '浏览记录已添加');
  }

  async function saveMyPhoneTaobao() {
    const name = document.getElementById('myphone-taobao-name-input')?.value?.trim();
    const description = document.getElementById('myphone-taobao-description-input')?.value?.trim();
    const thought = document.getElementById('myphone-taobao-thought-input')?.value?.trim();
    const price = document.getElementById('myphone-taobao-price-input')?.value || '99';
    const status = document.getElementById('myphone-taobao-status-input')?.value?.trim() || '已签收';
    const useAI = document.getElementById('myphone-taobao-ai-image-checkbox')?.checked;
    if (!name || !description) { showCustomAlert('错误', '请填写商品名称和描述'); return; }
    if (!activeMyPhoneCharacterId) { showCustomAlert('错误', '未选择角色'); return; }
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char.myPhoneTaobaoHistory) char.myPhoneTaobaoHistory = [];
    char.myPhoneTaobaoHistory.unshift({ name, price, status, date: new Date().toLocaleDateString('zh-CN'), reason: thought || description, thought: thought || '', image_prompt: useAI ? description : null, useDefaultImage: !useAI });
    await db.chats.put(char); renderMyPhoneTaobao();
    document.getElementById('myphone-add-taobao-modal')?.classList.remove('visible');
    document.getElementById('myphone-taobao-name-input').value = ''; document.getElementById('myphone-taobao-description-input').value = '';
    document.getElementById('myphone-taobao-thought-input').value = ''; document.getElementById('myphone-taobao-price-input').value = '99';
    document.getElementById('myphone-taobao-status-input').value = '已签收'; document.getElementById('myphone-taobao-ai-image-checkbox').checked = false;
    showCustomAlert('成功', '购物记录已添加');
  }

  async function saveMyPhoneDiary() {
    const date = document.getElementById('myphone-diary-date-input')?.value;
    const weather = document.getElementById('myphone-diary-weather-input')?.value?.trim();
    const title = document.getElementById('myphone-diary-title-input')?.value?.trim();
    const preface = document.getElementById('myphone-diary-preface-input')?.value?.trim();
    const content = document.getElementById('myphone-diary-content-input')?.value?.trim();
    if (!date || !title || !content) { showCustomAlert('错误', '请填写日期、标题和内容'); return; }
    if (!activeMyPhoneCharacterId) { showCustomAlert('错误', '未选择角色'); return; }
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char.myPhoneDiaries) char.myPhoneDiaries = [];
    const formattedDate = new Date(date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    char.myPhoneDiaries.unshift({ date: formattedDate, weather: weather || '晴', title, preface: preface || '', content });
    await db.chats.put(char); renderMyPhoneDiaryList();
    document.getElementById('myphone-add-diary-modal')?.classList.remove('visible');
    document.getElementById('myphone-diary-date-input').value = ''; document.getElementById('myphone-diary-weather-input').value = '';
    document.getElementById('myphone-diary-title-input').value = ''; document.getElementById('myphone-diary-preface-input').value = '';
    document.getElementById('myphone-diary-content-input').value = '';
    showCustomAlert('成功', '日记已添加');
  }

  async function saveMyPhoneMemo() {
    const title = document.getElementById('myphone-memo-title-input')?.value?.trim();
    const content = document.getElementById('myphone-memo-content-input')?.value?.trim();
    if (!title || !content) { showCustomAlert('错误', '请填写标题和内容'); return; }
    if (!activeMyPhoneCharacterId) { showCustomAlert('错误', '未选择角色'); return; }
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char.myPhoneMemos) char.myPhoneMemos = [];
    char.myPhoneMemos.unshift({ title, content, date: new Date().toLocaleDateString('zh-CN') });
    await db.chats.put(char); renderMyPhoneMemoList();
    document.getElementById('myphone-add-memo-modal')?.classList.remove('visible');
    document.getElementById('myphone-memo-title-input').value = ''; document.getElementById('myphone-memo-content-input').value = '';
    showCustomAlert('成功', '备忘录已添加');
  }

  async function saveMyPhoneAmap() {
    const location = document.getElementById('myphone-amap-location-input')?.value?.trim();
    const address = document.getElementById('myphone-amap-address-input')?.value?.trim();
    const thought = document.getElementById('myphone-amap-thought-input')?.value?.trim();
    const timeInput = document.getElementById('myphone-amap-time-input')?.value?.trim();
    if (!location) { showCustomAlert('错误', '请填写地点'); return; }
    if (!activeMyPhoneCharacterId) { showCustomAlert('错误', '未选择角色'); return; }
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char.myPhoneAmapHistory) char.myPhoneAmapHistory = [];
    char.myPhoneAmapHistory.unshift({ locationName: location, address: address || '', comment: thought || '', timeAgo: timeInput || '刚刚', timestamp: Date.now() });
    await db.chats.put(char); renderMyPhoneAmap();
    document.getElementById('myphone-add-amap-modal')?.classList.remove('visible');
    document.getElementById('myphone-amap-location-input').value = ''; document.getElementById('myphone-amap-address-input').value = '';
    document.getElementById('myphone-amap-thought-input').value = ''; document.getElementById('myphone-amap-time-input').value = '';
    showCustomAlert('成功', '足迹已添加');
  }

  async function saveMyPhoneUsage() {
    const appName = document.getElementById('myphone-usage-app-input')?.value?.trim();
    const category = document.getElementById('myphone-usage-category-input')?.value?.trim();
    const iconUrl = document.getElementById('myphone-usage-icon-input')?.value?.trim();
    const duration = document.getElementById('myphone-usage-duration-input')?.value || '30';
    if (!appName) { showCustomAlert('错误', '请填写应用名称'); return; }
    if (!activeMyPhoneCharacterId) { showCustomAlert('错误', '未选择角色'); return; }
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char.myPhoneAppUsage) char.myPhoneAppUsage = [];
    char.myPhoneAppUsage.unshift({ appName, category: category || '其他', usageTimeMinutes: parseInt(duration), iconUrl: iconUrl || '', timestamp: Date.now() });
    await db.chats.put(char); renderMyPhoneAppUsage();
    document.getElementById('myphone-add-usage-modal')?.classList.remove('visible');
    document.getElementById('myphone-usage-app-input').value = ''; document.getElementById('myphone-usage-category-input').value = '';
    document.getElementById('myphone-usage-icon-input').value = ''; document.getElementById('myphone-usage-duration-input').value = '30';
    showCustomAlert('成功', '使用记录已添加');
  }

  // ========== window 暴露 ==========
  window.renderMyPhoneAlbum = renderMyPhoneAlbum;
  window.renderMyPhoneBrowserHistory = renderMyPhoneBrowserHistory;
  window.renderMyPhoneTaobao = renderMyPhoneTaobao;
  window.renderMyPhoneMemoList = renderMyPhoneMemoList;
  window.renderMyPhoneDiaryList = renderMyPhoneDiaryList;
  window.renderMyPhoneAmap = renderMyPhoneAmap;
  window.renderMyPhoneAppUsage = renderMyPhoneAppUsage;
  window.renderMyPhoneMusicScreen = renderMyPhoneMusicScreen;
  window.playMyPhoneSong = playMyPhoneSong;
  window.renderMyPhoneYiqitingSongList = renderMyPhoneYiqitingSongList;
  window.toggleMyPhoneMusicInputs = toggleMyPhoneMusicInputs;
  window.saveMyPhoneMusic = saveMyPhoneMusic;
  window.saveMyPhoneAlbum = saveMyPhoneAlbum;
  window.saveMyPhoneBrowser = saveMyPhoneBrowser;
  window.saveMyPhoneTaobao = saveMyPhoneTaobao;
  window.saveMyPhoneDiary = saveMyPhoneDiary;
  window.saveMyPhoneMemo = saveMyPhoneMemo;
  window.saveMyPhoneAmap = saveMyPhoneAmap;
  window.saveMyPhoneUsage = saveMyPhoneUsage;
  window.openMyPhoneArticle = openMyPhoneArticle;
  window.renderMyPhoneArticle = renderMyPhoneArticle;
  window.openMyPhoneMemo = openMyPhoneMemo;
  window.openMyPhoneDiary = openMyPhoneDiary;
