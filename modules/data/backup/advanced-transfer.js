  // 高级导出导入功能 - 按类别导出导入（支持多选角色/群聊）
  let advancedExportSelectedChats = []; // 存储选中的角色/群聊ID
  
  async function showAdvancedExportImportModal() {
    // 定义数据类别及其对应的表
    const dataCategories = {
      '聊天与消息': ['chats', 'videoAttachments'],
      '空间与社交': ['qzoneSettings', 'qzonePosts', 'qzoneAlbums', 'qzonePhotos', 'qzoneGroups', 'doubanPosts'],
      '世界书与预设': ['worldBooks', 'worldBookCategories', 'presets', 'presetCategories', 'personaPresets'],
      'API与配置': ['apiConfig', 'apiPresets', 'soundPresets', 'globalSettings', 'renderingRules', 'naiPresets'],
      '贴纸与表情': ['userStickers', 'stickerCategories', 'stickerVisionCache', 'customAvatarFrames'],
      '音乐与媒体': ['musicLibrary', 'readingLibrary', 'watchTogetherPlaylist'],
      '记忆与记录': ['memories', 'callRecords', 'favorites'],
      '商城与物品': ['shoppingProducts', 'shoppingCategories', 'inventory', 'auctions'],
      '金融系统': ['userWallet', 'userTransactions', 'funds'],
      'NPC与故事': ['npcs', 'npcGroups', 'grAuthors', 'grStories'],
      '快捷回复': ['quickReplies', 'quickReplyCategories'],
      '邮件系统': ['emails', 'mailThreads', 'mailContacts', 'mailAccounts', 'mailEvents', 'mailPublicBoxes', 'mailSettings'],
      '信息与短信': ['smsSettings', 'smsContacts', 'smsMessages', 'smsMemories', 'smsJobs'],
      'MCP连接': ['mcpConnections', 'mcpActivities', 'mcpSettings'],
      '外观设置': ['appearancePresets', 'customWidgetPackages', 'customWidgetInstances']
    };

    // 需要按角色/群聊过滤的数据类别
    const chatRelatedCategories = ['聊天与消息', '空间与社交', '记忆与记录'];

    // 重置选中的角色/群聊
    advancedExportSelectedChats = [];

    // 生成角色/群聊列表HTML
    const generateChatListHTML = () => {
      let chatListHTML = '';
      Object.values(state.chats).forEach(chat => {
        if (!chat.isGroup) {
          chatListHTML += `
            <div class="adv-export-chat-item" data-chat-id="${chat.id}" style="
              margin: 6px 0; 
              padding: 10px 12px; 
              background: rgba(255,255,255,0.7); 
              border-radius: 8px; 
              cursor: pointer;
              display: flex;
              align-items: center;
              transition: all 0.2s;
              border: 2px solid transparent;
            ">
              <div class="adv-export-checkbox" style="
                width: 20px; 
                height: 20px; 
                border: 2px solid #ccc; 
                border-radius: 4px; 
                margin-right: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
              "></div>
              <span style="flex: 1; font-size: 14px;">${chat.name}</span>
              <span style="font-size: 12px; color: #666; background: #e3f2fd; padding: 2px 8px; border-radius: 10px;">角色</span>
            </div>
          `;
        } else {
          const memberCount = chat.members ? chat.members.length : 0;
          chatListHTML += `
            <div class="adv-export-chat-item" data-chat-id="${chat.id}" data-is-group="true" style="
              margin: 6px 0; 
              padding: 10px 12px; 
              background: rgba(255,255,255,0.7); 
              border-radius: 8px; 
              cursor: pointer;
              display: flex;
              align-items: center;
              transition: all 0.2s;
              border: 2px solid transparent;
            ">
              <div class="adv-export-checkbox" style="
                width: 20px; 
                height: 20px; 
                border: 2px solid #ccc; 
                border-radius: 4px; 
                margin-right: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
              "></div>
              <span style="flex: 1; font-size: 14px;">${chat.name}</span>
              <span style="font-size: 12px; color: #666; background: #fff3e0; padding: 2px 8px; border-radius: 10px;">群聊 · ${memberCount}人</span>
            </div>
          `;
        }
      });
      return chatListHTML;
    };

    // 创建选择界面HTML
    const categoryCheckboxes = Object.keys(dataCategories).map(category => {
      const tableCount = dataCategories[category].length;
      const isChatRelated = chatRelatedCategories.includes(category);
      return `
        <div style="margin: 8px 0; padding: 10px; background: rgba(255,255,255,0.5); border-radius: 8px;">
          <label style="display: flex; align-items: center; cursor: pointer;">
            <input type="checkbox" class="category-checkbox" data-category="${category}" 
                   style="margin-right: 10px; width: 18px; height: 18px; cursor: pointer;">
            <span style="flex: 1; font-size: 14px;">${category}</span>
            ${isChatRelated ? '<span style="font-size: 11px; color: #2196F3; margin-right: 5px;">📋可筛选</span>' : ''}
            <span style="font-size: 12px; color: #666;">(${tableCount}个表)</span>
          </label>
        </div>
      `;
    }).join('');

    const modalHTML = `
      <div id="advanced-export-modal" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      ">
        <div style="
          background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
          border-radius: 12px;
          padding: 20px;
          max-width: 520px;
          width: 90%;
          max-height: 85vh;
          overflow-y: auto;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        ">
          <!-- 步骤1: 选择角色/群聊 -->
          <div id="adv-export-step-1" style="display: flex; flex-direction: column;">
            <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #333;">
              📤 高级导出 - 第一步：选择角色/群聊
            </h2>
            <p style="margin: 0 0 15px 0; font-size: 13px; color: #666;">
              选择要导出的角色或群聊。如不选择任何项目，将导出全部数据。
            </p>
            <div style="margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
              <button id="adv-export-select-all-chats" style="
                padding: 6px 12px;
                background: #4CAF50;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
              ">全选</button>
              <button id="adv-export-deselect-all-chats" style="
                padding: 6px 12px;
                background: #f44336;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
              ">取消全选</button>
              <button id="adv-export-select-roles-only" style="
                padding: 6px 12px;
                background: #2196F3;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
              ">仅角色</button>
              <button id="adv-export-select-groups-only" style="
                padding: 6px 12px;
                background: #FF9800;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
              ">仅群聊</button>
            </div>
            <div id="adv-export-chat-list" style="
              max-height: 300px; 
              overflow-y: auto; 
              padding: 5px;
              background: rgba(0,0,0,0.03);
              border-radius: 8px;
            ">
              ${generateChatListHTML()}
            </div>
            <div style="
              margin-top: 10px; 
              padding: 8px 12px; 
              background: #e3f2fd; 
              border-radius: 6px;
              font-size: 12px;
              color: #1565c0;
            ">
              💡 已选择 <span id="adv-export-selected-count">0</span> 个角色/群聊
            </div>
            <div style="margin-top: 15px; display: flex; gap: 10px;">
              <button id="adv-export-step1-next" style="
                flex: 1;
                padding: 12px;
                background: #2196F3;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 15px;
                cursor: pointer;
              ">下一步 →</button>
              <button id="adv-export-step1-cancel" style="
                flex: 1;
                padding: 12px;
                background: #999;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 15px;
                cursor: pointer;
              ">取消</button>
            </div>
          </div>

          <!-- 步骤2: 选择数据类别 -->
          <div id="adv-export-step-2" style="display: none; flex-direction: column;">
            <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #333;">
              📤 高级导出 - 第二步：选择数据类别
            </h2>
            <p id="adv-export-filter-hint" style="margin: 0 0 15px 0; font-size: 13px; color: #666;"></p>
            <div style="margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
              <button id="select-all-categories" style="
                padding: 6px 12px;
                background: #4CAF50;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
              ">全选</button>
              <button id="deselect-all-categories" style="
                padding: 6px 12px;
                background: #f44336;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
              ">取消全选</button>
              <button id="advanced-import-trigger" style="
                padding: 6px 12px;
                background: #FF9800;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                margin-left: auto;
              ">📥 导入数据</button>
            </div>
            <div style="margin: 10px 0; max-height: 280px; overflow-y: auto;">
              ${categoryCheckboxes}
            </div>
            <div style="margin-top: 15px; display: flex; gap: 10px;">
              <button id="adv-export-step2-back" style="
                padding: 12px 20px;
                background: #757575;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 15px;
                cursor: pointer;
              ">← 上一步</button>
              <button id="confirm-export" style="
                flex: 1;
                padding: 12px;
                background: #2196F3;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 15px;
                cursor: pointer;
              ">确认导出</button>
              <button id="cancel-export" style="
                padding: 12px 20px;
                background: #999;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 15px;
                cursor: pointer;
              ">取消</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // 添加到页面
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);

    const modal = document.getElementById('advanced-export-modal');
    const chatItems = modal.querySelectorAll('.adv-export-chat-item');
    const selectedCountEl = document.getElementById('adv-export-selected-count');

    // 更新选中计数
    const updateSelectedCount = () => {
      const count = advancedExportSelectedChats.length;
      selectedCountEl.textContent = count;
    };

    // 更新单个项目的选中状态样式
    const updateItemStyle = (item, isSelected) => {
      const checkbox = item.querySelector('.adv-export-checkbox');
      if (isSelected) {
        item.style.borderColor = '#2196F3';
        item.style.background = 'rgba(33, 150, 243, 0.1)';
        checkbox.style.borderColor = '#2196F3';
        checkbox.style.background = '#2196F3';
        checkbox.innerHTML = '<span style="color: white; font-size: 14px;">✓</span>';
      } else {
        item.style.borderColor = 'transparent';
        item.style.background = 'rgba(255,255,255,0.7)';
        checkbox.style.borderColor = '#ccc';
        checkbox.style.background = 'transparent';
        checkbox.innerHTML = '';
      }
    };

    // 绑定角色/群聊选择事件
    chatItems.forEach(item => {
      item.addEventListener('click', () => {
        const chatId = item.dataset.chatId;
        const index = advancedExportSelectedChats.indexOf(chatId);
        if (index > -1) {
          advancedExportSelectedChats.splice(index, 1);
          updateItemStyle(item, false);
        } else {
          advancedExportSelectedChats.push(chatId);
          updateItemStyle(item, true);
        }
        updateSelectedCount();
      });
    });

    // 全选角色/群聊
    document.getElementById('adv-export-select-all-chats').addEventListener('click', () => {
      advancedExportSelectedChats = [];
      chatItems.forEach(item => {
        advancedExportSelectedChats.push(item.dataset.chatId);
        updateItemStyle(item, true);
      });
      updateSelectedCount();
    });

    // 取消全选角色/群聊
    document.getElementById('adv-export-deselect-all-chats').addEventListener('click', () => {
      advancedExportSelectedChats = [];
      chatItems.forEach(item => {
        updateItemStyle(item, false);
      });
      updateSelectedCount();
    });

    // 仅选择角色
    document.getElementById('adv-export-select-roles-only').addEventListener('click', () => {
      advancedExportSelectedChats = [];
      chatItems.forEach(item => {
        if (item.dataset.isGroup !== 'true') {
          advancedExportSelectedChats.push(item.dataset.chatId);
          updateItemStyle(item, true);
        } else {
          updateItemStyle(item, false);
        }
      });
      updateSelectedCount();
    });

    // 仅选择群聊
    document.getElementById('adv-export-select-groups-only').addEventListener('click', () => {
      advancedExportSelectedChats = [];
      chatItems.forEach(item => {
        if (item.dataset.isGroup === 'true') {
          advancedExportSelectedChats.push(item.dataset.chatId);
          updateItemStyle(item, true);
        } else {
          updateItemStyle(item, false);
        }
      });
      updateSelectedCount();
    });

    // 步骤1取消
    document.getElementById('adv-export-step1-cancel').addEventListener('click', () => {
      document.body.removeChild(modalContainer);
    });

    // 步骤1下一步
    document.getElementById('adv-export-step1-next').addEventListener('click', () => {
      document.getElementById('adv-export-step-1').style.display = 'none';
      document.getElementById('adv-export-step-2').style.display = 'flex';
      
      // 更新提示文字
      const filterHint = document.getElementById('adv-export-filter-hint');
      if (advancedExportSelectedChats.length === 0) {
        filterHint.innerHTML = '将导出<strong>全部</strong>数据。带 📋 标记的类别包含与角色/群聊相关的数据。';
      } else {
        filterHint.innerHTML = `将仅导出 <strong>${advancedExportSelectedChats.length}</strong> 个选中角色/群聊的相关数据。带 📋 标记的类别会被筛选。`;
      }
    });

    // 步骤2返回
    document.getElementById('adv-export-step2-back').addEventListener('click', () => {
      document.getElementById('adv-export-step-2').style.display = 'none';
      document.getElementById('adv-export-step-1').style.display = 'flex';
    });

    // 绑定数据类别事件
    const checkboxes = modal.querySelectorAll('.category-checkbox');

    // 全选类别
    document.getElementById('select-all-categories').addEventListener('click', () => {
      checkboxes.forEach(cb => cb.checked = true);
    });

    // 取消全选类别
    document.getElementById('deselect-all-categories').addEventListener('click', () => {
      checkboxes.forEach(cb => cb.checked = false);
    });

    // 导入数据
    document.getElementById('advanced-import-trigger').addEventListener('click', () => {
      document.getElementById('advanced-import-input').click();
    });

    // 取消
    document.getElementById('cancel-export').addEventListener('click', () => {
      document.body.removeChild(modalContainer);
    });

    // 确认导出
    document.getElementById('confirm-export').addEventListener('click', async () => {
      const selectedCategories = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.dataset.category);

      if (selectedCategories.length === 0) {
        await showCustomAlert('提示', '请至少选择一个数据类别！');
        return;
      }

      // 收集所有要导出的表
      const tablesToExport = [];
      selectedCategories.forEach(category => {
        tablesToExport.push(...dataCategories[category]);
      });

      // 关闭模态框
      document.body.removeChild(modalContainer);

      // 执行导出（传入选中的角色/群聊ID）
      await exportSelectedTables(tablesToExport, selectedCategories, advancedExportSelectedChats);
    });

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modalContainer);
      }
    });
  }

  // 导出选定的表（支持按角色/群聊过滤）
  async function exportSelectedTables(tables, categoryNames, selectedChatIds = []) {
    await showCustomAlert("正在准备...", "正在读取选定的数据，请稍候...");

    try {
      const sanitizeMemorySecrets = value => JSON.parse(JSON.stringify(value, (key, child) => {
        if (key === 'embeddingApiKey' || key === '_retrievalCache') return undefined;
        return child;
      }));
      const isFiltered = selectedChatIds.length > 0;
      const backupData = {
        version: 3,
        timestamp: Date.now(),
        exportType: 'advanced',
        categories: categoryNames,
        filteredByChats: isFiltered,
        selectedChatIds: isFiltered ? selectedChatIds : null,
        data: {}
      };

      let totalRecords = 0;
      for (const tableName of tables) {
        if (db[tableName]) {
          let tableData = await db.table(tableName).toArray();
          
          // 根据选中的角色/群聊过滤数据
          if (isFiltered) {
            tableData = filterDataByChatIds(tableName, tableData, selectedChatIds);
          }
          
          // 导出时移除API历史记录
          if (tableName === 'chats') {
            tableData = removeApiHistoryFromChats(tableData);
            tableData = tableData.map(sanitizeMemorySecrets);
          }
          
          backupData.data[tableName] = tableData;
          totalRecords += tableData.length;
          console.log(`已打包表: ${tableName}, 记录数: ${tableData.length}${isFiltered ? ' (已过滤)' : ''}`);
        }
      }

      // 长期/结构化/向量记忆存放在 chats 记录内部，记忆分类需单独提取，
      // 避免为了迁移记忆而覆盖聊天记录和角色设置。
      if (categoryNames.includes('记忆与记录')) {
        const selectedSet = new Set(selectedChatIds);
        const memoryChats = Object.values(state.chats).filter(chat => !isFiltered || selectedSet.has(chat.id));
        backupData.data.chatMemories = memoryChats.map(chat => ({
          chatId: chat.id,
          chatName: chat.name,
          groupMemory: window.GroupMemory?.transfer(chat) || null,
          longTermMemory: JSON.parse(JSON.stringify(chat.longTermMemory || [])),
          normalMemory: window.normalMemoryManager?.transfer(chat) || null,
          structuredMemory: chat.structuredMemory ? JSON.parse(JSON.stringify(chat.structuredMemory)) : null,
          variableMemory: chat.variableMemory ? (() => { const value = JSON.parse(JSON.stringify(chat.variableMemory)); if (value.settings) delete value.settings.embeddingApiKey; delete value._retrievalCache; return value; })() : null,
          vectorMemory: chat.vectorMemory ? (() => { const value = JSON.parse(JSON.stringify(chat.vectorMemory)); if (value.settings) delete value.settings.embeddingApiKey; delete value._retrievalCache; return value; })() : null,
          lastMemorySummaryTimestamp: chat.lastMemorySummaryTimestamp || 0,
          lastStructuredMemoryTimestamp: chat.lastStructuredMemoryTimestamp || 0,
          memoryArchives: chat.memoryArchives ? sanitizeMemorySecrets(chat.memoryArchives) : [],
          memorySettings: {
            memoryMode: chat.settings?.memoryMode,
            groupMemoryMode: chat.settings?.groupMemoryMode,
            groupMemoryAllowLinks: chat.settings?.groupMemoryAllowLinks,
            groupMemoryNpcIds: chat.settings?.groupMemoryNpcIds,
            enableStructuredMemory: chat.settings?.enableStructuredMemory,
            enableAutoMemory: chat.settings?.enableAutoMemory,
            autoMemoryInterval: chat.settings?.autoMemoryInterval,
            longTermMemoryLimit: chat.settings?.longTermMemoryLimit
          }
        }));
        totalRecords += backupData.data.chatMemories.length;
      }

      const blob = new Blob(
        [JSON.stringify(backupData, null, 2)], {
        type: 'application/json'
      }
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const categoryLabel = categoryNames.join('-');
      const filterLabel = isFiltered ? `-${selectedChatIds.length}项` : '';
      link.download = `EPhone-Advanced-Export-${categoryLabel}${filterLabel}-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);

      const filterMsg = isFiltered ? `（已按 ${selectedChatIds.length} 个角色/群聊筛选）` : '';
      await showCustomAlert('导出成功', `已成功导出 ${tables.length} 个数据表，共 ${totalRecords} 条记录！${filterMsg}`);

    } catch (error) {
      console.error("高级导出数据时出错:", error);
      await showCustomAlert('导出失败', `发生了一个错误: ${error.message}`);
    }
  }

  // 根据角色/群聊ID过滤数据
  function filterDataByChatIds(tableName, tableData, selectedChatIds) {
    switch (tableName) {
      case 'chats':
        // 直接过滤聊天记录
        return tableData.filter(chat => selectedChatIds.includes(chat.id));
      
      case 'qzonePosts':
        // 过滤动态（authorId 或 targetCharId）
        return tableData.filter(post => 
          selectedChatIds.includes(post.authorId) || 
          selectedChatIds.includes(post.targetCharId) ||
          post.authorId === 'user'
        );
      
      case 'videoAttachments':
        return tableData.filter(record => selectedChatIds.includes(record.chatId));
      case 'memories':
        // 过滤长期记忆
        return tableData.filter(memory => selectedChatIds.includes(memory.chatId));
      
      case 'callRecords':
        // 过滤通话记录
        return tableData.filter(record => selectedChatIds.includes(record.chatId));
      
      case 'favorites':
        // 过滤收藏（可能包含chatId或characterId）
        return tableData.filter(fav => 
          selectedChatIds.includes(fav.chatId) || 
          selectedChatIds.includes(fav.characterId)
        );
      
      case 'qzoneAlbums':
        // 过滤相册
        return tableData.filter(album => 
          selectedChatIds.includes(album.ownerId) || 
          album.ownerId === 'user'
        );
      
      case 'qzonePhotos':
        // 过滤照片（需要先获取过滤后的相册ID）
        // 这里简单处理，保留所有照片（因为照片关联相册，相册已过滤）
        return tableData;
      
      case 'doubanPosts':
        // 过滤豆瓣动态
        return tableData.filter(post => 
          selectedChatIds.includes(post.authorId) || 
          post.authorId === 'user'
        );
      
      default:
        // 其他表不过滤，全量导出
        return tableData;
    }
  }

  // 高级导入功能
  async function handleAdvancedImport(file) {
    if (!file) return;

    await showCustomAlert("请稍候...", "正在读取并解析高级导出文件...");

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // 检查是否为高级导出文件
      if (data.exportType !== 'advanced' || !data.data || !data.categories) {
        await showCustomAlert('文件格式错误', '这不是一个有效的高级导出文件。请使用"导入备份文件"功能导入普通备份。');
        return;
      }

      // 显示导入确认界面
      await showAdvancedImportConfirmModal(data);

    } catch (error) {
      console.error("读取高级导出文件时出错:", error);
      await showCustomAlert('导入失败', `文件解析失败: ${error.message}`);
    }
  }

  // 显示高级导入确认界面
  async function showAdvancedImportConfirmModal(backupData) {
    const { categories, data } = backupData;

    // 统计数据
    const tableStats = [];
    let totalRecords = 0;
    for (const tableName in data) {
      const count = Array.isArray(data[tableName]) ? data[tableName].length : 1;
      totalRecords += count;
      tableStats.push({ table: tableName, count });
    }

    const statsHTML = tableStats.map(stat => `
      <div style="padding: 8px; background: rgba(255,255,255,0.5); border-radius: 6px; margin: 5px 0;">
        <span style="font-weight: bold;">${stat.table}</span>: ${stat.count} 条记录
      </div>
    `).join('');

    const modalHTML = `
      <div id="advanced-import-confirm-modal" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      ">
        <div style="
          background: white;
          border-radius: 12px;
          padding: 20px;
          max-width: 500px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        ">
          <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #333;">高级导入确认</h2>
          <div style="margin: 15px 0;">
            <p style="margin: 10px 0;"><strong>导出类别：</strong>${categories.join('、')}</p>
            <p style="margin: 10px 0;"><strong>总记录数：</strong>${totalRecords} 条</p>
            <div style="margin-top: 15px;">
              <strong>包含的数据表：</strong>
              <div style="margin-top: 10px; max-height: 300px; overflow-y: auto;">
                ${statsHTML}
              </div>
            </div>
          </div>
          <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <strong style="color: #856404;">⚠️ 导入说明：</strong>
            <p style="margin: 5px 0 0 0; color: #856404; font-size: 14px;">
              导入将会<strong>合并</strong>数据到现有数据库中。如果存在ID冲突，新数据将覆盖旧数据。
            </p>
          </div>
          <div style="margin-top: 20px; display: flex; gap: 10px;">
            <button id="confirm-advanced-import" style="
              flex: 1;
              padding: 12px;
              background: #4CAF50;
              color: white;
              border: none;
              border-radius: 8px;
              font-size: 16px;
              cursor: pointer;
            ">确认导入</button>
            <button id="cancel-advanced-import" style="
              flex: 1;
              padding: 12px;
              background: #999;
              color: white;
              border: none;
              border-radius: 8px;
              font-size: 16px;
              cursor: pointer;
            ">取消</button>
          </div>
        </div>
      </div>
    `;

    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);

    const modal = document.getElementById('advanced-import-confirm-modal');

    // 取消
    document.getElementById('cancel-advanced-import').addEventListener('click', () => {
      document.body.removeChild(modalContainer);
    });

    // 确认导入
    document.getElementById('confirm-advanced-import').addEventListener('click', async () => {
      document.body.removeChild(modalContainer);
      await executeAdvancedImport(backupData.data);
    });

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modalContainer);
      }
    });
  }

  // 执行高级导入
  async function executeAdvancedImport(data) {
    await showCustomAlert("正在导入...", "正在将数据写入数据库，请稍候...");

    try {
      let importedTables = 0;
      let importedRecords = 0;

      for (const tableName in data) {
        if (tableName === 'mcpSecrets') continue;
        if (tableName === 'chatMemories') {
          const records = Array.isArray(data.chatMemories) ? data.chatMemories : [];
          for (const record of records) {
            const chat = state.chats[record.chatId];
            if (!chat) continue;
            if (record.groupMemory && window.GroupMemory) chat.groupMemory = window.GroupMemory.merge(chat, record.groupMemory);
            if (window.normalMemoryManager?.locks.has(chat)) throw new Error('请先暂停该角色的普通记忆梳理再导入备份');
            window.normalMemoryManager?.validateState(record.normalMemory);
            chat.longTermMemory = Array.isArray(chat.longTermMemory) ? chat.longTermMemory : [];
            const existingMemoryKeys = new Set(chat.longTermMemory.map(item => `${item.timestamp || ''}\u0000${String(item.content || '').trim()}`));
            for (const item of (record.longTermMemory || [])) {
              const key = `${item.timestamp || ''}\u0000${String(item.content || '').trim()}`;
              if (!existingMemoryKeys.has(key)) {
                chat.longTermMemory.push(JSON.parse(JSON.stringify(item)));
                existingMemoryKeys.add(key);
              }
            }
            window.normalMemoryManager?.importState(chat, record.normalMemory, 'merge');
            if (record.structuredMemory && window.structuredMemoryManager) {
              const structuredPayload = { version: '1.0', type: 'structured-memory', ...record.structuredMemory };
              window.structuredMemoryManager.importMemory(chat, JSON.stringify(structuredPayload), 'merge');
            }
            const variablePayload = record.variableMemory || record.vectorMemory;
            if (variablePayload && window.vectorMemoryManager) {
              const vectorPayload = variablePayload.type ? variablePayload : { type: 'variable-memory-full', version: 2, ...variablePayload };
              await window.vectorMemoryManager.importMemory(chat, JSON.stringify(vectorPayload), 'merge');
            }
            chat.memoryArchives = Array.isArray(chat.memoryArchives) ? chat.memoryArchives : [];
            const archiveIds = new Set(chat.memoryArchives.map(item => item.id));
            for (const archive of (record.memoryArchives || [])) {
              if (!archiveIds.has(archive.id)) chat.memoryArchives.push(JSON.parse(JSON.stringify(archive)));
            }
            chat.settings = chat.settings || {};
            for (const [key, value] of Object.entries(record.memorySettings || {})) {
              if (value !== undefined) chat.settings[key] = value;
            }
            if (record.lastMemorySummaryTimestamp !== undefined) chat.lastMemorySummaryTimestamp = record.lastMemorySummaryTimestamp || 0;
            if (record.lastStructuredMemoryTimestamp !== undefined) chat.lastStructuredMemoryTimestamp = record.lastStructuredMemoryTimestamp || 0;
            await db.chats.put(chat);
            importedRecords++;
          }
          if (records.length) importedTables++;
          continue;
        }
        if (db[tableName]) {
          const tableData = data[tableName];
          if (Array.isArray(tableData) && tableData.length > 0) {
            // 使用 bulkPut 来合并数据（如果有主键冲突会覆盖）
            await db.table(tableName).bulkPut(tableData);
            importedTables++;
            importedRecords += tableData.length;
            console.log(`已导入表 ${tableName}: ${tableData.length} 条记录`);
          }
        } else {
          console.warn(`表 ${tableName} 不存在于当前数据库中，跳过`);
        }
      }

      // 导入成功，询问用户是否刷新页面
      const shouldRefresh = await showCustomConfirm(
        '导入成功',
        `已成功导入 ${importedTables} 个数据表，共 ${importedRecords} 条记录！<br><br>是否立即刷新页面以使数据生效？<br><span style="color: #666; font-size: 14px;">（点击"取消"可以继续进行其他操作）</span>`,
        {
          confirmText: '立即刷新',
          cancelText: '稍后刷新'
        }
      );

      if (shouldRefresh) {
        // 用户选择刷新页面
        location.reload();
      } else {
        // 用户选择不刷新，尝试局部刷新界面
        if (typeof loadChats === 'function') {
          loadChats();
        }
      }

    } catch (error) {
      console.error("高级导入数据时出错:", error);
      await showCustomAlert('导入失败', `发生了一个错误: ${error.message}`);
    }
  }

  // ========== 全局暴露 ==========
  window.handleAdvancedImport = handleAdvancedImport;
  window.handleSmartImport = handleSmartImport;
  window.exportDataAsBlob = exportDataAsBlob;
  window.exportDataAsSlicedZip = exportDataAsSlicedZip;
  window.exportDataAsStream = exportDataAsStream;
  window.showAdvancedExportImportModal = showAdvancedExportImportModal;
  window.viewDataDistribution = viewDataDistribution;
  window.renderDistributionData = renderDistributionData;

