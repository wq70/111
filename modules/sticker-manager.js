// ============================================================
// sticker-manager.js
// 来源：script.js 第 11115~11950 + 39584~39700 + 55641~55830 行
//       （DOMContentLoaded 内部）
// 功能：表情包管理系统 —— renderStickerPanel、toggleStickerManagementMode、
//       handleSelectAllStickers、executeBatchMoveStickers、
//       executeBatchDeleteStickers、executeBatchExportStickers、
//       openBatchStickerImportModal、handleBatchStickerImport、
//       handleStickerFileImport、processStickerFile、switchStickerCategory、
//       openStickerCategoryManager、renderStickerCategoriesInManager、
//       addNewStickerCategory、deleteStickerCategory、
//       openStickerCategoryBindingModal、saveStickerCategoryBindings、
//       getStickerContextForPrompt、getGroupStickerContextForPrompt
// ============================================================

(function () {
  // state 通过全局作用域访问（window.state，由 init-and-state.js 初始化）

  let isStickerManagementMode = false;
  let selectedStickers = new Set();
  let activeStickerCategoryId = 'all';

  // ========== 来源：script.js 第 11115~11200 行 ==========

  async function renderStickerPanel(rerenderTabs = true) {
    const grid = document.getElementById('sticker-grid');
    const tabsContainer = document.getElementById('sticker-category-tabs');
    const searchInput = document.getElementById('sticker-search-input');
    const searchTerm = searchInput.value.trim().toLowerCase();


    if (rerenderTabs) {
      tabsContainer.innerHTML = '';
      const categories = await db.stickerCategories.toArray();

      tabsContainer.innerHTML += `<button class="sticker-category-tab ${activeStickerCategoryId === 'all' ? 'active' : ''}" data-category-id="all">全部</button>`;
      categories.forEach(cat => {
        tabsContainer.innerHTML += `<button class="sticker-category-tab ${activeStickerCategoryId === cat.id ? 'active' : ''}" data-category-id="${cat.id}">${cat.name}</button>`;
      });
      tabsContainer.innerHTML += `<button class="sticker-category-tab ${activeStickerCategoryId === 'uncategorized' ? 'active' : ''}" data-category-id="uncategorized">未分类</button>`;
    }


    grid.innerHTML = '';


    let stickersByCategory;
    if (activeStickerCategoryId === 'all') {
      stickersByCategory = state.userStickers;
    } else if (activeStickerCategoryId === 'uncategorized') {
      stickersByCategory = state.userStickers.filter(s => !s.categoryId);
    } else {
      stickersByCategory = state.userStickers.filter(s => s.categoryId === activeStickerCategoryId);
    }


    const stickersToShow = searchTerm ?
      stickersByCategory.filter(sticker => sticker.name.toLowerCase().includes(searchTerm)) :
      stickersByCategory;


    if (stickersToShow.length === 0) {
      const message = searchTerm ? '找不到匹配的表情' : '这个分类下还没有表情哦~';
      grid.innerHTML = `<p style="text-align:center; color: var(--text-secondary); grid-column: 1 / -1; padding-top: 20px;">${message}</p>`;
      return;
    }

    stickersToShow.forEach(sticker => {
      const item = document.createElement('div');
      item.className = 'sticker-item';
      item.title = sticker.name;
      item.dataset.stickerId = sticker.id;
      item.innerHTML = `
            <div class="sticker-image-container" style="background-image: url(${sticker.url})"></div>
            <span class="sticker-name">${sticker.name}</span>
        `;
      item.addEventListener('click', () => {
        if (isStickerManagementMode) {
          handleStickerSelection(item);
        } else {
          sendSticker(sticker);
        }
      });
      const deleteBtn = document.createElement('div');
      deleteBtn.className = 'delete-btn';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        const confirmed = await showCustomConfirm('删除表情', `确定要删除表情 "${sticker.name}" 吗？`, {
          confirmButtonClass: 'btn-danger'
        });
        if (confirmed) {
          await db.userStickers.delete(sticker.id);
          state.userStickers = state.userStickers.filter(s => s.id !== sticker.id);
          renderStickerPanel();
        }
      };
      item.appendChild(deleteBtn);
      grid.appendChild(item);
    });
  }

  // ========== 来源：script.js 第 11200~11280 行 ==========

  function toggleStickerManagementMode() {
    isStickerManagementMode = !isStickerManagementMode;
    const grid = document.getElementById('sticker-grid');
    const manageBtn = document.getElementById('manage-stickers-btn');
    const actionBar = document.getElementById('sticker-action-bar');
    const selectAllCheckbox = document.getElementById('select-all-stickers-checkbox');

    grid.classList.toggle('management-mode', isStickerManagementMode);

    if (isStickerManagementMode) {
      manageBtn.textContent = '完成';
      actionBar.style.display = 'flex';
      selectedStickers.clear();
      selectAllCheckbox.checked = false;
      updateDeleteStickerButton();
    } else {
      manageBtn.textContent = '管理';
      actionBar.style.display = 'none';
      grid.querySelectorAll('.sticker-item.selected').forEach(item => item.classList.remove('selected'));
    }
  }



  function handleSelectAllStickers() {
    const checkbox = document.getElementById('select-all-stickers-checkbox');
    const shouldSelect = checkbox.checked;


    let stickersToSelect;
    if (activeStickerCategoryId === 'all') {
      stickersToSelect = state.userStickers;
    } else if (activeStickerCategoryId === 'uncategorized') {
      stickersToSelect = state.userStickers.filter(s => !s.categoryId);
    } else {
      stickersToSelect = state.userStickers.filter(s => s.categoryId === activeStickerCategoryId);
    }


    stickersToSelect.forEach(sticker => {
      const stickerId = sticker.id;
      const itemEl = document.querySelector(`.sticker-item[data-sticker-id="${stickerId}"]`);

      if (shouldSelect) {

        selectedStickers.add(stickerId);
        if (itemEl) itemEl.classList.add('selected');
      } else {

        selectedStickers.delete(stickerId);
        if (itemEl) itemEl.classList.remove('selected');
      }
    });


    updateDeleteStickerButton();
  }


  function updateDeleteStickerButton() {
    const count = selectedStickers.size;
    const delBtn = document.getElementById('delete-selected-stickers-btn');
    const exportBtn = document.getElementById('export-selected-stickers-btn');
    const moveBtn = document.getElementById('move-selected-stickers-btn'); // 新增

    if (delBtn) delBtn.textContent = `删除 (${count})`;
    if (exportBtn) exportBtn.textContent = `导出 (${count})`;
    if (moveBtn) moveBtn.textContent = `移动 (${count})`; // 新增
  }

  async function executeBatchMoveStickers() {
    if (selectedStickers.size === 0) {
      alert("请先选择要移动的表情。");
      return;
    }

    // 1. 获取所有分类
    const categories = await db.stickerCategories.toArray();
    const options = [
      { text: '未分类', value: 'uncategorized' },
      ...categories.map(c => ({ text: c.name, value: c.id }))
    ];

    // 2. 弹出选择框
    const targetCategoryId = await showChoiceModal("移动到分类", options);
    if (!targetCategoryId) return;

    // 3. 处理目标ID (未分类存为 null)
    const finalCategoryId = targetCategoryId === 'uncategorized' ? null : parseInt(targetCategoryId);

    await showCustomAlert("请稍候...", "正在移动表情...");

    // 4. 更新数据库
    const idsToMove = Array.from(selectedStickers);
    await db.transaction('rw', db.userStickers, async () => {
      for (const id of idsToMove) {
        await db.userStickers.update(id, { categoryId: finalCategoryId });
        // 更新内存
        const s = state.userStickers.find(item => item.id === id);
        if (s) s.categoryId = finalCategoryId;
      }
    });

    // 5. 刷新界面
    toggleStickerManagementMode(); // 退出管理模式
    await renderStickerPanel(); // 刷新列表 (这会根据当前选中的Tab刷新，移动走的表情会消失)

    await showCustomAlert("成功", `已将 ${idsToMove.length} 个表情移动到新分类。`);
  }
  /**
   * 处理用户点击选择或取消选择表情
   * @param {HTMLElement} item - 被点击的表情DOM元素
   */
  function handleStickerSelection(item) {
    if (!isStickerManagementMode) return;

    const stickerId = item.dataset.stickerId;
    if (!stickerId) return;

    item.classList.toggle('selected');

    if (selectedStickers.has(stickerId)) {
      selectedStickers.delete(stickerId);
    } else {
      selectedStickers.add(stickerId);
    }
    updateDeleteStickerButton();
  }


  async function executeBatchDeleteStickers() {
    if (selectedStickers.size === 0) return;

    const confirmed = await showCustomConfirm(
      '确认删除',
      `确定要删除选中的 ${selectedStickers.size} 个表情吗？此操作不可恢复。`, {
      confirmButtonClass: 'btn-danger'
    }
    );

    if (confirmed) {
      const idsToDelete = [...selectedStickers];


      await db.userStickers.bulkDelete(idsToDelete);


      state.userStickers = state.userStickers.filter(s => !idsToDelete.includes(s.id));


      toggleStickerManagementMode();
      renderStickerPanel();

      await showCustomAlert('删除成功', '选中的表情已成功删除。');
    }
  }

  async function executeBatchExportStickers() {
    if (selectedStickers.size === 0) {
      alert("请先选择要导出的表情包。");
      return;
    }

    let exportText = "";
    let exportedCount = 0;


    state.userStickers.forEach(sticker => {
      if (selectedStickers.has(sticker.id)) {

        exportText += `${sticker.name}: ${sticker.url}\n`;
        exportedCount++;
      }
    });

    if (exportedCount === 0) {
      alert("未找到所选表情的数据。");
      return;
    }

    const finalText = exportText.trim();
    const textareaId = 'batch-export-textarea-' + Date.now();


    const alertHtml = `
        <p style="text-align:left; font-size: 14px; margin: 0 0 10px 0;">
            已为您生成 ${exportedCount} 条快捷导入格式的文本：
        </p>
        <textarea id="${textareaId}" 
                  rows="10" 
                  style="width: 100%; font-size: 12px; resize: vertical; border-radius: 6px; border: 1px solid #ccc;"
                  readonly>${finalText}</textarea>
    `;


    showCustomAlert("复制表情包数据", alertHtml);

    const modalConfirmBtn = document.getElementById('custom-modal-confirm');

    if (modalConfirmBtn) {


      modalConfirmBtn.textContent = '一键复制';


      const originalOnclick = modalConfirmBtn.onclick;


      modalConfirmBtn.onclick = async (e) => {
        try {

          await navigator.clipboard.writeText(finalText);
          modalConfirmBtn.textContent = '复制成功!';


          setTimeout(() => {
            modalConfirmBtn.textContent = '完成';
            modalConfirmBtn.onclick = originalOnclick;
          }, 1500);

        } catch (err) {

          alert('自动复制失败，请长按文本框手动复制。');

          modalConfirmBtn.textContent = '完成';
          modalConfirmBtn.onclick = originalOnclick;
        }
      };
    }
  }




  async function openBatchStickerImportModal() {
    // 1. 让用户选择导入方式
    const choice = await showChoiceModal('批量导入表情', [
      { text: '📋 粘贴文本', value: 'paste' },
      { text: '📁 上传文件 (.txt/.json/.docx)', value: 'file' }
    ]);

    if (choice === 'paste') {
      // --- 方式 A: 粘贴文本 (保持原有逻辑) ---
      const placeholderText = `请输入表情数据，一行一个。
【规则】：包含【名字】和【链接】。
【示例】：
开心: https://xx.com/1.jpg
哭泣：https://xx.com/2.png
生气https://xx.com/3.gif
https://xx.com/4.jpg 疑惑`;

      const pastedText = await showCustomPrompt(
        '批量导入表情',
        placeholderText,
        '',
        'textarea'
      );

      if (pastedText && pastedText.trim()) {
        await handleBatchStickerImport(pastedText);
      }

    } else if (choice === 'file') {
      // --- 方式 B: 上传文件 ---
      await handleStickerFileImport();
    }
  }



  async function handleBatchStickerImport(text) {
    const lines = text.trim().split('\n');
    const newStickers = [];
    const baseUrl = 'https://files.catbox.moe/';
    let errorCount = 0;
    let skippedPureLinks = 0; // 统计被跳过的纯链接
    const currentCategoryId = (activeStickerCategoryId !== 'all' && activeStickerCategoryId !== 'uncategorized') ? activeStickerCategoryId : null;

    // 1. 提取URL的正则 (支持 http/https 和 data:image)
    const urlRegex = /(https?:\/\/[^\s]+|data:image\/[^\s]+)/;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // 跳过空行或包含提示语的行
      if (!trimmedLine || trimmedLine.includes('填入') || trimmedLine.includes('格式')) {
        continue;
      }

      // --- 第一步：寻找链接 ---
      const urlMatch = trimmedLine.match(urlRegex);

      // 2. 如果没找到标准链接，尝试兼容旧版 Catbox 短码 (名字 code.png)
      if (!urlMatch) {
        // 尝试匹配: 任意文字 + 空格 + (字母数字.后缀)
        const catboxMatch = trimmedLine.match(/^(.+?)\s+([a-zA-Z0-9]+\.[a-zA-Z0-9]+)$/);
        if (catboxMatch) {
          newStickers.push({
            id: 'sticker_' + Date.now() + Math.random(),
            name: catboxMatch[1].trim(),
            url: baseUrl + catboxMatch[2].trim(),
            categoryId: currentCategoryId
          });
        } else {
          errorCount++;
          console.warn('无法识别行:', trimmedLine);
        }
        continue;
      }

      // --- 第二步：提取并清洗数据 ---
      const url = urlMatch[0];

      // 从整行中把链接删掉，剩下的就是名字
      // 例如 "开心:http://..." -> 剩下 "开心:" (英文冒号)
      // 例如 "开心：http://..." -> 剩下 "开心：" (中文冒号)
      let rawName = trimmedLine.replace(url, '').trim();

      // --- 第三步：智能清洗名字 (核心修改) ---
      // 正则解释：
      // ^[\s:：,，]+  -> 去掉开头的所有 空格、英文冒号、中文冒号、逗号
      // |             -> 或者
      // [\s:：,，]+$  -> 去掉结尾的所有 空格、英文冒号、中文冒号、逗号
      let cleanName = rawName.replace(/^[\s:：,，]+|[\s:：,，]+$/g, '');

      // --- 第四步：严格校验 (禁止纯链接) ---
      // 如果清洗后名字为空，说明这一行只有链接
      if (!cleanName) {
        skippedPureLinks++;
        console.warn('跳过纯链接 (未提供名字):', trimmedLine);
        continue;
      }

      // 添加到列表
      newStickers.push({
        id: 'sticker_' + Date.now() + Math.random(),
        name: cleanName,
        url: url,
        categoryId: currentCategoryId
      });
    }

    // --- 第五步：结果反馈 ---
    let resultMsg = '';

    if (newStickers.length > 0) {
      await db.userStickers.bulkAdd(newStickers);
      state.userStickers.push(...newStickers);
      renderStickerPanel();
      resultMsg = `成功导入 ${newStickers.length} 个新表情！`;
    }

    if (skippedPureLinks > 0) {
      resultMsg += `\n⚠️ 有 ${skippedPureLinks} 行因只有链接(无名字)被跳过。`;
    }

    if (errorCount > 0) {
      resultMsg += `\n❌ 有 ${errorCount} 行格式无法识别。`;
    }

    if (resultMsg) {
      await showCustomAlert('导入结果', resultMsg);
    } else if (lines.length > 0) {
      await showCustomAlert('导入失败', '未能识别任何有效数据，请确保每行都包含【名字】和【链接】。');
    }
  }

  // 处理文件选择
  function handleStickerFileImport() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.json,.docx,text/plain,application/json'; // 扩展名 + MIME，便于各环境正确识别 .txt

      input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) {
          resolve();
          return;
        }

        try {
          await showCustomAlert("正在解析...", "正在读取文件内容，请稍候...");
          const textContent = await processStickerFile(file);

          if (textContent && textContent.trim()) {
            // 解析成功后，直接复用之前的文本解析逻辑
            // 这样无论是文件还是粘贴，都支持那种灵活的格式（中文冒号、无空格等）
            await handleBatchStickerImport(textContent);
          } else {
            alert("文件内容为空或无法解析。");
          }
        } catch (error) {
          console.error("文件解析失败:", error);
          alert(`文件解析失败: ${error.message}`);
        }
        resolve();
      };

      input.click();
    });
  }

  // 核心：根据后缀名解析文件内容
  async function processStickerFile(file) {
    const fileName = file.name.toLowerCase();

    // 1. 处理 .txt 文件
    if (fileName.endsWith('.txt')) {
      return await file.text();
    }

    // 2. 处理 .docx 文件 (依赖 mammoth.js)
    if (fileName.endsWith('.docx')) {
      if (typeof mammoth === 'undefined') {
        throw new Error("未加载 mammoth.js 库，无法读取 Word 文档。");
      }
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      return result.value; // 返回 Word 中的纯文本
    }

    // 3. 处理 .json 文件
    if (fileName.endsWith('.json')) {
      const text = await file.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        throw new Error("JSON 格式错误");
      }

      // 将 JSON 转换为 "名字: 链接" 的文本格式，以便复用 handleBatchStickerImport
      let convertedText = "";

      if (Array.isArray(json)) {
        // 情况 A: 数组格式 [{name: "开心", url: "http..."}, ...]
        json.forEach(item => {
          // 尝试多种可能的键名
          const name = item.name || item.key || item.title || item.meaning;
          const url = item.url || item.src || item.content || item.link;
          if (name && url) {
            convertedText += `${name}: ${url}\n`;
          }
        });
      } else if (typeof json === 'object') {
        // 情况 B: 对象格式 {"开心": "http...", "哭泣": "http..."}
        // 或者 Tavern 格式 {"entries": ...}
        if (json.entries) {
          // 简单的兼容 Tavern 格式
          const entries = Array.isArray(json.entries) ? json.entries : Object.values(json.entries);
          entries.forEach(item => {
            const name = item.comment || item.key?.toString() || "表情";
            const url = item.content || item.url;
            if (url && url.startsWith('http')) {
              convertedText += `${name}: ${url}\n`;
            }
          });
        } else {
          // 普通 Key-Value 对
          for (let key in json) {
            const val = json[key];
            if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image'))) {
              convertedText += `${key}: ${val}\n`;
            }
          }
        }
      }
      return convertedText;
    }

    throw new Error("不支持的文件格式");
  }

  // ========== 来源：script.js 第 39584~39700 行 ==========

  async function openStickerCategoryManager() {
    await renderStickerCategoriesInManager();
    document.getElementById('sticker-category-manager-modal').classList.add('visible');
  }


  async function renderStickerCategoriesInManager() {
    const listEl = document.getElementById('existing-sticker-categories-list');
    const categories = await db.stickerCategories.toArray();
    listEl.innerHTML = '';
    if (categories.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有任何分类</p>';
      return;
    }
    categories.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'existing-group-item';
      item.innerHTML = `
                    <span class="group-name">${cat.name}</span>
                    <span class="delete-group-btn" data-id="${cat.id}">×</span>
                `;
      listEl.appendChild(item);
    });
  }

  async function addNewStickerCategory() {
    const input = document.getElementById('new-sticker-category-name-input');
    const name = input.value.trim();
    if (!name) {
      alert('分类名不能为空！');
      return;
    }
    const existing = await db.stickerCategories.where('name').equals(name).first();
    if (existing) {
      alert(`分类 "${name}" 已经存在了！`);
      return;
    }
    await db.stickerCategories.add({
      name
    });
    input.value = '';
    await renderStickerCategoriesInManager();
  }


  async function deleteStickerCategory(categoryId) {
    const category = await db.stickerCategories.get(categoryId);
    if (!category) return;

    const stickersInCateogry = await db.userStickers.where('categoryId').equals(categoryId).count();

    const confirmMessage = stickersInCateogry > 0 ?
      `确定要删除分类《${category.name}》吗？\n\n【警告】\n此操作将同时永久删除该分类下的 ${stickersInCateogry} 个表情包，且无法恢复！` :
      `确定要删除分类《${category.name}》吗？`;

    const confirmed = await showCustomConfirm(
      '确认删除分类',
      confirmMessage, {
      confirmButtonClass: 'btn-danger'
    }
    );

    if (confirmed) {
      try {

        await db.transaction('rw', db.stickerCategories, db.userStickers, async () => {

          const stickerIdsToDelete = await db.userStickers.where('categoryId').equals(categoryId).primaryKeys();


          if (stickerIdsToDelete.length > 0) {
            await db.userStickers.bulkDelete(stickerIdsToDelete);
          }


          await db.stickerCategories.delete(categoryId);
        });


        state.userStickers = await db.userStickers.toArray();
        if (activeStickerCategoryId === categoryId) {
          activeStickerCategoryId = 'all';
        }
        await renderStickerCategoriesInManager();
        await renderStickerPanel();

        alert(`分类《${category.name}》及其下的表情已成功删除。`);

      } catch (error) {
        console.error("删除分类及表情时出错:", error);
        alert("删除失败，请查看控制台错误信息。");
      }
    }
  }


  function switchStickerCategory(categoryId) {
    activeStickerCategoryId = categoryId;
    document.querySelectorAll('.sticker-category-tab').forEach(tab => {
      tab.classList.toggle('active', String(tab.dataset.categoryId) === String(categoryId));
    });
    renderStickerPanel(false);


    const selectAllCheckbox = document.getElementById('select-all-stickers-checkbox');
    if (selectAllCheckbox) selectAllCheckbox.checked = false;
  }


  // ========== 来源：script.js 第 55641~55830 行 ==========

  async function openStickerCategoryBindingModal(categoryId) {
    const category = categoryId === 'uncategorized' ?
      {
        id: 'uncategorized',
        name: '未分类'
      } :
      await db.stickerCategories.get(categoryId);

    if (!category) {
      console.error("无法为不存在的分类打开绑定模态框:", categoryId);
      return;
    }

    const modal = document.getElementById('sticker-binding-modal');
    const listEl = document.getElementById('sticker-binding-chat-list');
    const header = modal.querySelector('.modal-header span');
    listEl.innerHTML = '';
    header.textContent = `将分类 "${category.name}" 绑定到...`;

    const allChats = Object.values(state.chats).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    allChats.forEach(chat => {

      const isChecked = Array.isArray(chat.settings?.stickerCategoryIds) && chat.settings.stickerCategoryIds.includes(categoryId);

      const item = document.createElement('div');
      item.className = 'contact-picker-item'; // 复用现有样式
      item.innerHTML = `
            <input type="checkbox" class="sticker-binding-checkbox" data-chat-id="${chat.id}" ${isChecked ? 'checked' : ''} style="margin-right: 15px;">
            <img src="${chat.isGroup ? chat.settings.groupAvatar : chat.settings.aiAvatar || defaultAvatar}" class="avatar">
            <span class="name">${chat.name}</span>
        `;
      listEl.appendChild(item);
    });


    document.getElementById('save-sticker-binding-btn').onclick = () => saveStickerCategoryBindings(categoryId);
    document.getElementById('cancel-sticker-binding-btn').onclick = () => modal.classList.remove('visible');

    modal.classList.add('visible');
  }


  async function saveStickerCategoryBindings(categoryId) {
    const selectedChatIds = new Set(
      Array.from(document.querySelectorAll('#sticker-binding-chat-list .sticker-binding-checkbox:checked'))
        .map(cb => cb.dataset.chatId)
    );

    const chatsToUpdate = [];
    for (const chatId in state.chats) {
      const chat = state.chats[chatId];
      if (!Array.isArray(chat.settings.stickerCategoryIds)) {
        chat.settings.stickerCategoryIds = [];
      }


      const wasBound = chat.settings.stickerCategoryIds.includes(categoryId);
      const shouldBeBound = selectedChatIds.has(chatId);

      if (wasBound && !shouldBeBound) {

        chat.settings.stickerCategoryIds = chat.settings.stickerCategoryIds.filter(id => id !== categoryId);
        chatsToUpdate.push(chat);
      } else if (!wasBound && shouldBeBound) {

        chat.settings.stickerCategoryIds.push(categoryId);
        chatsToUpdate.push(chat);
      }
    }

    if (chatsToUpdate.length > 0) {
      await db.chats.bulkPut(chatsToUpdate);
      await showCustomAlert("保存成功", "表情包分类绑定已更新！");
    }

    document.getElementById('sticker-binding-modal').classList.remove('visible');
  }


  function getStickerContextForPrompt(chat) {
    if (!chat || !chat.settings.stickerCategoryIds || chat.settings.stickerCategoryIds.length === 0) {
      return '';
    }

    const categoryIds = chat.settings.stickerCategoryIds;
    let allStickers = [];
    const addedStickerNames = new Set();


    categoryIds.forEach(categoryId => {
      let stickersInCategory;

      if (categoryId === 'uncategorized') {
        stickersInCategory = state.userStickers.filter(s => !s.categoryId);
      } else {
        stickersInCategory = state.userStickers.filter(s => s.categoryId === categoryId);
      }


      stickersInCategory.forEach(sticker => {
        if (!addedStickerNames.has(sticker.name)) {
          allStickers.push(sticker);
          addedStickerNames.add(sticker.name);
        }
      });
    });

    if (allStickers.length === 0) {
      return '';
    }

    const stickerList = allStickers.map(s => `- ${s.name}`).join('\n');
    return `
# 可用表情包 (选填)
# 【【【表情使用铁律 (最高优先级)】】】
1.  你【只能】在同时发送了【有意义的文本内容】之后，才能【额外】追加一个表情。
2.  【绝对禁止】只发送一个表情作为单独的回复。
3.  【绝对禁止】发明或编造列表中不存在的表情含义。
4.  如果你在列表中找不到【100%完美匹配】的表情，请【不要】使用 "sticker" 指令，只发送文本。
5. 【使用频率】: 你【不应该】在每一轮对话中都发送表情。请只在你觉得【非常必要】或【情绪特别强烈】时才使用表情，保持对话的自然性。
6.  **【重复惩罚 (最高铁律！)】**: 你【绝对禁止】连续几轮回复使用【完全相同】的表情含义。例如，如果你上一轮回复了 "meaning": "害羞"，那么你这一轮【绝对不能】再次使用 "meaning": "害羞"。你必须选择一个不同的含义，或者干脆不发表情。
- **可用列表**:
${stickerList}
`;
  }


  function getGroupStickerContextForPrompt(chat) {
    if (!chat || !chat.isGroup) return '';

    const allCategoryIds = new Set();
    chat.members.forEach(member => {
      if (member.id === 'user') return;
      const memberChat = state.chats[member.id];
      if (memberChat && memberChat.settings.stickerCategoryIds) {
        memberChat.settings.stickerCategoryIds.forEach(id => allCategoryIds.add(id));
      }
    });

    if (allCategoryIds.size === 0) {
      return '';
    }

    let allStickers = [];
    const addedStickerNames = new Set();

    allCategoryIds.forEach(categoryId => {
      let stickersInCategory;
      if (categoryId === 'uncategorized') {
        stickersInCategory = state.userStickers.filter(s => !s.categoryId);
      } else {
        stickersInCategory = state.userStickers.filter(s => s.categoryId === categoryId);
      }

      stickersInCategory.forEach(sticker => {
        if (!addedStickerNames.has(sticker.name)) {
          allStickers.push(sticker);
          addedStickerNames.add(sticker.name);
        }
      });
    });

    if (allStickers.length === 0) {
      return '';
    }

    const stickerList = allStickers.map(s => `- ${s.name}`).join('\n');
    return `
# 可用表情包 (全群共享)
# 【【【表情使用铁律 (最高优先级)】】】
1.  【绝对禁止】只发送一个表情作为单独的回复。
2.  【绝对禁止】发明或编造列表中不存在的表情含义。
3.  如果没找到合适的，请不要使用 "sticker" 指令。
4.  **【角色分配】**: 你可以从下面的【共享列表】中选择任意表情，并将其分配给【任意AI角色】。
5. 【使用频率】: 请只在你觉得【非常必要】或【情绪特别强烈】时才使用表情，保持对话的自然性。
6.  **【重复惩罚 (最高铁律！)】**: 你【绝对禁止】连续几轮回复使用【完全相同】的表情含义。例如，如果你上一轮回复了 "meaning": "害羞"，那么你这一轮【绝对不能】再次使用 "meaning": "害羞"。你必须选择一个不同的含义，或者干脆不发表情。
- **可用列表**:
${stickerList}
`;
  }

  // ========== 全局暴露 ==========

  window.renderStickerPanel = renderStickerPanel;
  window.toggleStickerManagementMode = toggleStickerManagementMode;
  window.handleSelectAllStickers = handleSelectAllStickers;
  window.executeBatchMoveStickers = executeBatchMoveStickers;
  window.handleStickerSelection = handleStickerSelection;
  window.executeBatchDeleteStickers = executeBatchDeleteStickers;
  window.executeBatchExportStickers = executeBatchExportStickers;
  window.openBatchStickerImportModal = openBatchStickerImportModal;
  window.handleBatchStickerImport = handleBatchStickerImport;
  window.handleStickerFileImport = handleStickerFileImport;
  window.processStickerFile = processStickerFile;
  window.openStickerCategoryManager = openStickerCategoryManager;
  window.renderStickerCategoriesInManager = renderStickerCategoriesInManager;
  window.addNewStickerCategory = addNewStickerCategory;
  window.deleteStickerCategory = deleteStickerCategory;
  window.switchStickerCategory = switchStickerCategory;
  window.openStickerCategoryBindingModal = openStickerCategoryBindingModal;
  window.saveStickerCategoryBindings = saveStickerCategoryBindings;
  window.getStickerContextForPrompt = getStickerContextForPrompt;
  window.getGroupStickerContextForPrompt = getGroupStickerContextForPrompt;
  window.updateDeleteStickerButton = updateDeleteStickerButton;

})();
