  // ============================================================
  // 导出函数
  // ============================================================

  function sanitizeMcpConnectionsForBackup(connections) {
    return (connections || []).map(connection => {
      const copy = JSON.parse(JSON.stringify(connection));
      delete copy.secret;
      delete copy.sessionId;
      delete copy.pairingCode;
      delete copy.deviceId;
      copy.enabled = false;
      copy.status = 'disabled';
      return copy;
    });
  }

  async function exportBackup() {
    try {
      const backupData = {
        version: 1,
        timestamp: Date.now()
      };

      const [
        chats, worldBooks, userStickers, apiConfig, globalSettings,
        personaPresets, musicLibrary, qzoneSettings, qzonePosts,
        qzoneAlbums, qzonePhotos, favorites, qzoneGroups,
        memories, worldBookCategories,
        apiPresets, soundPresets, shoppingProducts, callRecords,
        renderingRules,

        doubanPosts,
        stickerCategories,

        appearancePresets, customWidgetPackages, customWidgetInstances,

        presets,
        presetCategories,

        npcs,

        // 新增的表
        stickerVisionCache,
        shoppingCategories,
        customAvatarFrames,
        readingLibrary,
        quickReplies,
        quickReplyCategories,
        npcGroups,
        naiPresets,
        grAuthors,
        grStories,
        userWallet,
        userTransactions,
        funds,
        auctions,
        inventory,
        emails,
        mailThreads, mailContacts, mailAccounts, mailEvents, mailPublicBoxes, mailSettings,
        watchTogetherPlaylist, videoAttachments,
        mcpConnections,
        mcpActivities,
        mcpSettings
      ] = await Promise.all([
        db.chats.toArray(),
        db.worldBooks.toArray(),
        db.userStickers.toArray(),
        db.apiConfig.get('main'),
        db.globalSettings.get('main'),
        db.personaPresets.toArray(),
        db.musicLibrary.get('main'),
        db.qzoneSettings.get('main'),
        db.qzonePosts.toArray(),
        db.qzoneAlbums.toArray(),
        db.qzonePhotos.toArray(),
        db.favorites.toArray(),
        db.qzoneGroups.toArray(),
        db.memories.toArray(),
        db.worldBookCategories.toArray(),
        db.apiPresets.toArray(),
        db.soundPresets.toArray(),
        db.shoppingProducts.toArray(),
        db.callRecords.toArray(),
        db.renderingRules.toArray(),

        db.doubanPosts.toArray(),
        db.stickerCategories.toArray(),

        db.appearancePresets.toArray(), db.customWidgetPackages.toArray(), db.customWidgetInstances.toArray(),

        db.presets.toArray(),
        db.presetCategories.toArray(),

        db.npcs.toArray(),

        // 新增的表
        db.stickerVisionCache.toArray(),
        db.shoppingCategories.toArray(),
        db.customAvatarFrames.toArray(),
        db.readingLibrary.toArray(),
        db.quickReplies.toArray(),
        db.quickReplyCategories.toArray(),
        db.npcGroups.toArray(),
        db.naiPresets.toArray(),
        db.grAuthors.toArray(),
        db.grStories.toArray(),
        db.userWallet.get('main'),
        db.userTransactions.toArray(),
        db.funds.toArray(),
        db.auctions.toArray(),
        db.inventory.toArray(),
        db.emails.toArray(),
        db.mailThreads.toArray(), db.mailContacts.toArray(), db.mailAccounts.toArray(),
        db.mailEvents.toArray(), db.mailPublicBoxes.toArray(), db.mailSettings.get('main'),
        db.watchTogetherPlaylist.toArray(), db.videoAttachments.toArray(),
        db.mcpConnections.toArray(),
        db.mcpActivities.toArray(),
        db.mcpSettings.get('main')
      ]);

      // 方案3：导出时移除API历史记录
      const cleanedChats = removeApiHistoryFromChats(chats);

      // 导出情侣空间相关的 localStorage 数据
      const coupleSpaceLocalStorage = exportCoupleSpaceLocalStorage();

      Object.assign(backupData, {
        chats: cleanedChats,
        worldBooks,
        userStickers,
        apiConfig,
        globalSettings,
        personaPresets,
        musicLibrary,
        qzoneSettings,
        qzonePosts,
        qzoneAlbums,
        qzonePhotos,
        favorites,
        qzoneGroups,
        memories,
        worldBookCategories,
        apiPresets,
        soundPresets,
        shoppingProducts,
        callRecords,
        renderingRules,

        doubanPosts,
        stickerCategories,

        appearancePresets, customWidgetPackages, customWidgetInstances,

        presets,
        presetCategories,

        npcs,

        // 新增的表
        stickerVisionCache,
        shoppingCategories,
        customAvatarFrames,
        readingLibrary,
        quickReplies,
        quickReplyCategories,
        npcGroups,
        naiPresets,
        grAuthors,
        grStories,
        userWallet,
        userTransactions,
        funds,
        auctions,
        inventory,
        emails,
        mailThreads, mailContacts, mailAccounts, mailEvents, mailPublicBoxes, mailSettings,
        watchTogetherPlaylist, videoAttachments,
        mcpConnections: sanitizeMcpConnectionsForBackup(mcpConnections),
        mcpActivities,
        mcpSettings,
        
        // 情侣空间 localStorage 数据
        localStorage: coupleSpaceLocalStorage
      });

      for (const tableName of window.SmsEngine?.TABLES || []) backupData[tableName] = await db.table(tableName).toArray();
      const blob = new Blob(
        [JSON.stringify(backupData, null, 2)], {
        type: 'application/json'
      }
      );
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), {
        href: url,
        download: `EPhone-Full-Backup-${new Date().toISOString().split('T')[0]}.json`
      });
      link.click();
      URL.revokeObjectURL(url);

      await showCustomAlert('导出成功', '已成功导出所有数据！');

    } catch (error) {
      console.error("导出数据时出错:", error);
      await showCustomAlert('导出失败', `发生了一个错误: ${error.message}`);
    }
  }



  // 清理指定数据表
  async function cleanupTableData(tableName, statElem) {
    // 不可清理的核心表
    const protectedTables = ['apiConfig', 'globalSettings', 'userWallet', 'mcpSecrets'];
    
    if (protectedTables.includes(tableName)) {
      await showCustomAlert("无法清理", "此数据表为系统核心配置，不可清理。");
      return false;
    }

    const confirmed = await showCustomConfirm(
      "确认清理数据",
      `即将清空 <strong>${statElem.dataset.tableCnName}</strong> 的所有数据。<br><br>⚠️ <strong>此操作不可撤销！</strong><br>建议在清理前先备份数据。`,
      {
        confirmButtonClass: 'btn-danger',
        confirmText: '确认清理'
      }
    );

    if (!confirmed) return false;

    try {
      // 执行清理
      await db.table(tableName).clear();
      return true;
    } catch (error) {
      console.error(`清理表 ${tableName} 失败:`, error);
      await showCustomAlert("清理失败", `发生错误: ${error.message}`);
      return false;
    }
  }

  // 查看数据分布统计（改为显示全屏界面）
  async function viewDataDistribution() {
    // 显示数据分析统计界面
    showScreen('data-distribution-screen');
    
    // 获取容器并渲染数据
    const container = document.getElementById('data-distribution-container');
    await renderDistributionData(container);
  }

  // 渲染数据分布内容
  async function renderDistributionData(container) {
    container.innerHTML = '<p style="text-align: center; padding: 40px 0;">正在统计数据...</p>';

    try {
      // 数据表的中文名称映射
      const tableNameMap = {
        chats: '聊天记录',
        worldBooks: '世界书',
        userStickers: '表情包',
        apiConfig: 'API配置',
        globalSettings: '全局设置',
        personaPresets: '人设预设',
        musicLibrary: '音乐库',
        qzoneSettings: '空间设置',
        qzonePosts: '空间动态',
        qzoneAlbums: '相册',
        qzonePhotos: '相片',
        favorites: '收藏',
        qzoneGroups: '分组',
        memories: '记忆',
        worldBookCategories: '世界书分类',
        apiPresets: 'API预设',
        soundPresets: '声音预设',
        shoppingProducts: '商品',
        callRecords: '通话记录',
        renderingRules: '渲染规则',
        doubanPosts: '豆瓣帖子',
        stickerCategories: '表情包分类',
        appearancePresets: '外观预设',
        customWidgetPackages: '自制小组件',
        customWidgetInstances: '小组件个人内容',
        presets: '预设',
        presetCategories: '预设分类',
        npcs: 'NPC',
        stickerVisionCache: '表情识别缓存',
        shoppingCategories: '商品分类',
        customAvatarFrames: '自定义头像框',
        readingLibrary: '阅读库',
        quickReplies: '快捷回复',
        quickReplyCategories: '快捷回复分类',
        npcGroups: 'NPC分组',
        naiPresets: 'NAI预设',
        grAuthors: '绿江作者',
        grStories: '绿江故事',
        userWallet: '钱包',
        userTransactions: '交易记录',
        funds: '基金',
        auctions: '拍卖',
        inventory: '背包',
        emails: '邮件',
        mailThreads: '邮件线程',
        mailContacts: '邮件联系人与笔友',
        mailAccounts: '邮箱账户',
        mailEvents: '邮件后台任务',
        mailPublicBoxes: '公共邮箱',
        mailSettings: '邮箱设置',
        watchTogetherPlaylist: '观影播放列表',
        videoAttachments: '聊天视频文件',
        mcpConnections: 'MCP连接',
        mcpActivities: 'MCP活动记录',
        mcpSettings: 'MCP设置',
        mcpSecrets: 'MCP本机凭证'
      };

      // 统计各表数据
      const stats = [];
      let totalRecords = 0;
      let totalSize = 0;

      for (const table of db.tables) {
        const tableName = table.name;
        const count = await table.count();
        
        if (count > 0) {
          // 获取表数据并计算大小
          const data = await table.toArray();
          const dataStr = JSON.stringify(data);
          const sizeBytes = new Blob([dataStr]).size;
          const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
          
          stats.push({
            name: tableNameMap[tableName] || tableName,
            tableName: tableName,
            count: count,
            size: sizeBytes,
            sizeMB: sizeMB
          });
          
          totalRecords += count;
          totalSize += sizeBytes;
        }
      }

      // 按数据量大小排序
      stats.sort((a, b) => b.size - a.size);

      // 计算总大小
      const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

      // 生成HTML显示
      let html = `
        <div style="text-align: left;">
          <div style="background: var(--bg-secondary, #f5f5f5); padding: 15px; border-radius: 10px; margin-bottom: 15px;">
            <h3 style="margin: 0 0 10px 0; color: var(--text-primary);">📊 数据总览</h3>
            <p style="margin: 5px 0; font-size: 14px;">
              <strong>总记录数：</strong><span style="color: #007bff;">${totalRecords.toLocaleString()}</span> 条
            </p>
            <p style="margin: 5px 0; font-size: 14px;">
              <strong>总数据量：</strong><span style="color: #28a745;">${totalSizeMB}</span> MB
            </p>
            <p style="margin: 5px 0; font-size: 14px;">
              <strong>包含表数：</strong><span style="color: #6c757d;">${stats.length}</span> 个
            </p>
          </div>

          <div style="background: var(--bg-primary, #fff); border-radius: 10px; overflow: hidden;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead style="background: var(--bg-secondary, #f5f5f5); position: sticky; top: 0;">
                <tr>
                  <th style="padding: 10px; text-align: left; border-bottom: 1px solid var(--border-color, #ddd); min-width: 140px;">数据类型</th>
                  <th style="padding: 10px; text-align: right; border-bottom: 1px solid var(--border-color, #ddd); width: 90px;">记录数</th>
                  <th style="padding: 10px; text-align: right; border-bottom: 1px solid var(--border-color, #ddd); width: 80px;">大小(MB)</th>
                  <th style="padding: 10px; text-align: right; border-bottom: 1px solid var(--border-color, #ddd); width: 150px;">占比</th>
                  <th style="padding: 10px; text-align: center; border-bottom: 1px solid var(--border-color, #ddd); width: 80px;">操作</th>
                </tr>
              </thead>
              <tbody>
      `;

      stats.forEach((stat, index) => {
        const percentage = ((stat.size / totalSize) * 100).toFixed(1);
        const bgColor = index % 2 === 0 ? 'transparent' : 'var(--bg-secondary, #f9f9f9)';
        const canClean = !['apiConfig', 'globalSettings', 'userWallet', 'mcpSecrets'].includes(stat.tableName);
        
        html += `
          <tr class="stat-row" data-table-name="${stat.tableName}" data-table-cn-name="${stat.name}" style="background: ${bgColor};">
            <td style="padding: 10px; border-bottom: 1px solid var(--border-color, #eee);">
              <div style="font-weight: 500;">${stat.name}</div>
              <div style="font-size: 11px; color: var(--text-secondary, #999);">${stat.tableName}</div>
            </td>
            <td class="stat-count" style="padding: 10px; text-align: right; border-bottom: 1px solid var(--border-color, #eee); color: #007bff;">
              ${stat.count.toLocaleString()}
            </td>
            <td class="stat-size" style="padding: 10px; text-align: right; border-bottom: 1px solid var(--border-color, #eee); color: #28a745;">
              ${stat.sizeMB}
            </td>
            <td class="stat-percentage" style="padding: 10px; text-align: right; border-bottom: 1px solid var(--border-color, #eee);">
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 5px;">
                <div style="width: 60px; height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden;">
                  <div class="percentage-bar" style="width: ${percentage}%; height: 100%; background: linear-gradient(90deg, #007bff, #0056b3); border-radius: 4px;"></div>
                </div>
                <span class="percentage-text" style="font-size: 12px; color: var(--text-secondary); min-width: 45px;">${percentage}%</span>
              </div>
            </td>
            <td style="padding: 10px; text-align: center; border-bottom: 1px solid var(--border-color, #eee);">
              ${canClean ? `
                <button class="cleanup-btn" data-table="${stat.tableName}" style="
                  background: #ff3b30;
                  color: white;
                  border: none;
                  padding: 5px 12px;
                  border-radius: 5px;
                  font-size: 12px;
                  cursor: pointer;
                  transition: all 0.2s;
                " onmouseover="this.style.background='#d32f2f'" onmouseout="this.style.background='#ff3b30'">
                  清理
                </button>
              ` : `<span style="font-size: 11px; color: #999;">不可清理</span>`}
            </td>
          </tr>
        `;
      });

      html += `
              </tbody>
            </table>
          </div>

          <div style="margin-top: 15px; padding: 10px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
            <p style="margin: 0; font-size: 12px; color: #856404;">
              💡 <strong>提示：</strong>点击"清理"按钮可以清空对应数据表。清理后数据将实时更新。<strong>清理前请务必备份！</strong>
            </p>
          </div>
        </div>
      `;

      container.innerHTML = html;

      // 绑定清理按钮事件
      container.querySelectorAll('.cleanup-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const tableName = btn.dataset.table;
          const row = btn.closest('.stat-row');
          
          // 执行清理
          const success = await cleanupTableData(tableName, row);
          
          if (success) {
            // 清理成功，刷新显示
            showToast('数据已清理，正在刷新统计...', 'success');
            await renderDistributionData(container);
          }
        });
      });

    } catch (error) {
      console.error("统计数据分布时出错:", error);
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
          <p style="color: #ff3b30; font-size: 16px; margin-bottom: 10px;">⚠️ 统计失败</p>
          <p style="color: #666; font-size: 14px;">${error.message}</p>
        </div>
      `;
    }
  }


  async function importStreamedBackup(backupData) {
    try {
      // 1. 先清理所有情侣空间相关的 localStorage
      console.log('正在清理情侣空间 localStorage 数据...');
      clearCoupleSpaceLocalStorage();
      
      // 2. 导入数据库
      await db.transaction('rw', db.tables, async () => {

        for (const table of db.tables) {
          await table.clear();
        }


        for (const tableName in backupData) {
          // 跳过 localStorage 字段，它不是数据库表
          if (tableName === 'localStorage' || tableName === 'mcpSecrets') continue;
          
          if (Array.isArray(backupData[tableName])) {
            console.log(`正在导入表: ${tableName}, 记录数: ${backupData[tableName].length}`);
            await db.table(tableName).bulkPut(backupData[tableName]);
          }
        }
      });
      
      // 3. 如果备份中有 localStorage 数据，则恢复
      if (backupData.localStorage) {
        console.log('正在恢复情侣空间 localStorage 数据...');
        restoreCoupleSpaceLocalStorage(backupData.localStorage);
      } else {
        console.log('备份中没有 localStorage 数据（可能是旧版备份），已清理情侣空间数据');
      }

    } catch (error) {

      throw new Error(`数据库写入失败: ${error.message}`);
    }
  }





  async function handleSmartImport(file) {
    if (!file) return;

    // 用非阻塞的 toast 提示正在解析，不再用 await showCustomAlert 阻塞流程
    showToast("正在读取并解析备份文件...", "info", 3000);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.exportType === 'advanced' && data.data && data.categories) {
        if (typeof window.handleAdvancedImport !== 'function') {
          throw new Error('分类备份导入功能尚未加载完成，请稍后重试。');
        }
        await window.handleAdvancedImport(file);
        return;
      }

      if (data.type === 'slice' && data.data && typeof data.data === 'object') {
        pendingBackupData = { type: 'slice', content: data.data };
        openSelectiveImportModal(data.data);
        return;
      }

      let backupDataContent;
      let backupType;


      if (data.data && typeof data.data === 'object') {
        console.log("检测到新版流式备份文件...");
        backupDataContent = data.data;
        backupType = 'streamed'; // 'streamed' or 'legacy'
      } else if (data.chats || data.worldBooks) {
        console.log("检测到旧版完整备份文件...");
        backupDataContent = data;
        backupType = 'legacy';
      } else {
        throw new Error("文件格式无法识别。请确保您选择的是有效的 EPhone 备份文件。");
      }


      pendingBackupData = {
        type: backupType,
        content: backupDataContent
      };


      openImportOptionsModal(backupDataContent);

    } catch (error) {
      console.error("导入数据时出错:", error);
      pendingBackupData = null;
      await showCustomAlert('导入失败', `文件解析或应用失败: ${error.message}`);
    }
  }


  function openImportOptionsModal(backupDataContent) {
    const modal = document.getElementById('import-options-modal');
    const listEl = document.getElementById('import-preview-list');
    listEl.innerHTML = '';

    const contentSummary = {
      'chats': '聊天会话',
      'worldBooks': '世界书',
      'worldBookCategories': '世界书分类',
      'presets': '离线预设',
      'presetCategories': '预设分类',
      'userStickers': '表情包',
      'stickerCategories': '表情分类',
      'customAvatarFrames': '头像框',
      'apiConfig': 'API配置',
      'globalSettings': '全局设置',
      'personaPresets': '人设预设',
      'qzoneSettings': '空间设置',
      'qzonePosts': '动态',
      'qzoneAlbums': '相册',
      'qzonePhotos': '相册照片',
      'favorites': '收藏',
      'qzoneGroups': '空间分组',
      'memories': '回忆',
      'callRecords': '通话记录',
      'shoppingProducts': '商品',
      'shoppingCategories': '商品分类',
      'apiPresets': 'API预设',
      'soundPresets': '声音预设',
      'renderingRules': '渲染规则',
      'appearancePresets': '外观预设',
      'customWidgetPackages': '自制小组件',
      'customWidgetInstances': '小组件个人内容',
      'npcs': 'NPCs',
      'npcGroups': 'NPC分组',
      'doubanPosts': '豆瓣动态',
      'stickerVisionCache': '表情缓存',
      'readingLibrary': '阅读库',
      'quickReplies': '快捷回复',
      'quickReplyCategories': '快捷回复分类',
      'naiPresets': 'NAI预设',
      'grAuthors': '故事作者',
      'grStories': '故事',
      'userWallet': '用户钱包',
      'userTransactions': '交易记录',
      'funds': '基金',
      'auctions': '拍卖记录',
      'inventory': '物品清单',
      'emails': '邮件',
      'watchTogetherPlaylist': '观影播放列表',
        videoAttachments: '聊天视频文件',
      'mcpConnections': 'MCP连接',
      'mcpActivities': 'MCP活动记录',
      'mcpSettings': 'MCP设置',
      'localStorage': '情侣空间数据'
    };

    let foundData = false;
    for (const key of Object.keys(backupDataContent)) {
      if (backupDataContent[key] && (Array.isArray(backupDataContent[key]) ? backupDataContent[key].length > 0 : backupDataContent[key])) {
        let count;
        let countText;
        
        // localStorage 是对象，显示键的数量
        if (key === 'localStorage' && typeof backupDataContent[key] === 'object') {
          count = Object.keys(backupDataContent[key]).length;
          countText = `${count} 个键`;
        } else {
          count = Array.isArray(backupDataContent[key]) ? backupDataContent[key].length : 1;
          countText = `${count} 条/个`;
        }
        
        const li = document.createElement('li');
        li.textContent = `${contentSummary[key] || key}: ${countText}`;
        listEl.appendChild(li);
        foundData = true;
      }
    }

    if (!foundData) {
      listEl.innerHTML = '<li>未在此文件中找到可识别的数据。</li>';
    }


    document.getElementById('confirm-full-import-btn').onclick = () => {
      modal.classList.remove('visible');
      handleFullImport(pendingBackupData);
    };
    document.getElementById('confirm-selective-import-btn').onclick = () => {
      modal.classList.remove('visible');
      openSelectiveImportModal(pendingBackupData.content);
    };
    document.getElementById('cancel-import-options-btn').onclick = () => {
      modal.classList.remove('visible');
      pendingBackupData = null;
    };

    modal.classList.add('visible');
  }


  async function handleFullImport(backupInfo) {
    if (!backupInfo) return;

    const confirmed = await showCustomConfirm(
      '严重警告！',
      '【完全导入】将删除您当前的所有数据并替换为备份文件中的内容。此操作不可撤销！<br><br><strong>确定要继续吗？</strong>', {
      confirmButtonClass: 'btn-danger',
      confirmText: '我明白，覆盖所有数据'
    }
    );
    if (!confirmed) {
      pendingBackupData = null;
      return;
    }

    await showCustomAlert("请稍候...", "正在执行完全导入，请勿关闭页面...");

    try {
      if (backupInfo.type === 'streamed') {
        await importStreamedBackup(backupInfo.content);
      } else if (backupInfo.type === 'legacy') {
        await importLegacyBackup(backupInfo.content);
      } else {
        throw new Error("未知的备份类型。");
      }

      await showCustomAlert('导入成功', '所有数据已成功恢复！应用即将刷新以应用所有更改。');
      try {
        const restoredApiConfig = await db.apiConfig.get('main');
        if (restoredApiConfig) {
          // 同步 ImgBB
          if (restoredApiConfig.imgbbApiKey) localStorage.setItem('imgbb-api-key', restoredApiConfig.imgbbApiKey);
          if (restoredApiConfig.imgbbEnable !== undefined) localStorage.setItem('imgbb-enabled', restoredApiConfig.imgbbEnable);

          // 同步 Minimax
          if (restoredApiConfig.minimaxGroupId) localStorage.setItem('minimax-group-id', restoredApiConfig.minimaxGroupId);
          if (restoredApiConfig.minimaxApiKey) localStorage.setItem('minimax-api-key', restoredApiConfig.minimaxApiKey);
          if (restoredApiConfig.minimaxModel) localStorage.setItem('minimax-model', restoredApiConfig.minimaxModel);

          // 同步 Catbox
          if (restoredApiConfig.catboxUserHash) localStorage.setItem('catbox-userhash', restoredApiConfig.catboxUserHash);
          if (restoredApiConfig.catboxEnable !== undefined) localStorage.setItem('catbox-enabled', restoredApiConfig.catboxEnable);

          // 同步 NovelAI
          if (restoredApiConfig.novelaiSettings) localStorage.setItem('novelai-settings', JSON.stringify(restoredApiConfig.novelaiSettings));
          if (restoredApiConfig.novelaiApiKey !== undefined) localStorage.setItem('novelai-api-key', restoredApiConfig.novelaiApiKey);
          if (restoredApiConfig.novelaiModel !== undefined) localStorage.setItem('novelai-model', restoredApiConfig.novelaiModel);
          if (restoredApiConfig.novelaiEnabled !== undefined) localStorage.setItem('novelai-enabled', String(restoredApiConfig.novelaiEnabled));
        }
        console.log("API 配置已强制同步到本地缓存。");
      } catch (e) {
        console.error("同步配置失败:", e);
      }
      setTimeout(() => window.location.reload(), 1500);

    } catch (error) {
      console.error("完全导入失败:", error);
      await showCustomAlert('导入失败', `文件应用失败: ${error.message}`);
    } finally {
      pendingBackupData = null;
    }
  }


  function openSelectiveImportModal(backupDataContent) {
    const modal = document.getElementById('selective-import-modal');
    const listEl = document.getElementById('selective-import-list');
    const selectAllCheckbox = document.getElementById('select-all-import-types');
    listEl.innerHTML = '';
    selectAllCheckbox.checked = true;

    const contentSummary = {
      'chats': '聊天会话',
      'worldBooks': '世界书',
      'worldBookCategories': '世界书分类',
      'presets': '离线预设',
      'presetCategories': '预设分类',
      'userStickers': '表情包',
      'stickerCategories': '表情分类',
      'customAvatarFrames': '头像框',
      'apiConfig': 'API配置',
      'globalSettings': '全局设置',
      'personaPresets': '人设预设',
      'qzoneSettings': '空间设置',
      'qzonePosts': '动态',
      'qzoneAlbums': '相册',
      'qzonePhotos': '相册照片',
      'qzoneGroups': '空间分组',
      'favorites': '收藏',
      'memories': '回忆',
      'callRecords': '通话记录',
      'shoppingProducts': '商品',
      'shoppingCategories': '商品分类',
      'apiPresets': 'API预设',
      'soundPresets': '声音预设',
      'renderingRules': '渲染规则',
      'appearancePresets': '外观预设',
      'customWidgetPackages': '自制小组件',
      'customWidgetInstances': '小组件个人内容',
      'npcs': 'NPCs',
      'npcGroups': 'NPC分组',
      'doubanPosts': '豆瓣动态',
      'stickerVisionCache': '表情缓存',
      'readingLibrary': '阅读库',
      'quickReplies': '快捷回复',
      'quickReplyCategories': '快捷回复分类',
      'naiPresets': 'NAI预设',
      'grAuthors': '故事作者',
      'grStories': '故事',
      'userWallet': '用户钱包',
      'userTransactions': '交易记录',
      'funds': '基金',
      'auctions': '拍卖记录',
      'inventory': '物品清单',
      'emails': '邮件',
      'watchTogetherPlaylist': '观影播放列表',
        videoAttachments: '聊天视频文件',
      'mcpConnections': 'MCP连接',
      'mcpActivities': 'MCP活动记录',
      'mcpSettings': 'MCP设置',
      'localStorage': '情侣空间数据'
    };

    let hasContent = false;
    for (const key of Object.keys(backupDataContent)) {
      if (backupDataContent[key] && (Array.isArray(backupDataContent[key]) ? backupDataContent[key].length > 0 : backupDataContent[key])) {
        let count;
        let countText;
        let isSingleObject = false;
        
        // localStorage 是对象，显示键的数量
        if (key === 'localStorage' && typeof backupDataContent[key] === 'object') {
          count = Object.keys(backupDataContent[key]).length;
          countText = `${count} 个键`;
          isSingleObject = true; // localStorage 会覆盖现有数据
        } else {
          count = Array.isArray(backupDataContent[key]) ? backupDataContent[key].length : 1;
          countText = `${count} 条/个`;
          isSingleObject = !Array.isArray(backupDataContent[key]);
        }

        const item = document.createElement('div');
        item.className = 'clear-posts-item selected';
        item.dataset.typeId = key;
        item.innerHTML = `
                <div class="checkbox selected"></div>
                <div>
                    <span class="name">${contentSummary[key] || key} (${countText})</span>
                    ${isSingleObject ? '<p style="font-size: 12px; color: #ff8c00; margin: 4px 0 0;">(注意: 这将【覆盖】您当前的设置)</p>' : ''}
                </div>
            `;
        listEl.appendChild(item);
        hasContent = true;
      }
    }

    if (!hasContent) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">文件中未找到可合并的数据。</p>';
    }


    document.getElementById('confirm-merge-import-btn').onclick = () => handleSelectiveImport(pendingBackupData);
    document.getElementById('cancel-selective-import-btn').onclick = () => {
      modal.classList.remove('visible');
      pendingBackupData = null;
    };

    selectAllCheckbox.onchange = (e) => {
      const isChecked = e.target.checked;
      listEl.querySelectorAll('.clear-posts-item').forEach(item => {
        item.classList.toggle('selected', isChecked);
        item.querySelector('.checkbox').classList.toggle('selected', isChecked);
      });
    };

    listEl.onclick = (e) => {
      const item = e.target.closest('.clear-posts-item');
      if (item) {
        item.classList.toggle('selected');
        item.querySelector('.checkbox').classList.toggle('selected');
      }
    };

    modal.classList.add('visible');
  }


  async function handleSelectiveImport(backupInfo) {
    if (!backupInfo) return;

    const selectedItems = document.querySelectorAll('#selective-import-list .clear-posts-item.selected');
    if (selectedItems.length === 0) {
      alert("请至少选择一种要合并的数据类型。");
      return;
    }

    const typesToMerge = Array.from(selectedItems).map(item => item.dataset.typeId);
    const dataToMerge = backupInfo.content;

    const confirmed = await showCustomConfirm(
      '确认合并？',
      '这将把您选择的数据【添加并覆盖】到现有数据中。同ID的数据将被更新，新数据将被添加。<br><br><strong>此操作不可撤销！</strong>', {
      confirmText: '确认合并'
    }
    );
    if (!confirmed) return;

    await showCustomAlert("请稍候...", "正在合并数据，请勿关闭页面...");

    try {
      // 先处理 localStorage（如果选中）
      if (typesToMerge.includes('localStorage')) {
        const localStorageData = dataToMerge.localStorage;
        if (localStorageData && typeof localStorageData === 'object') {
          console.log('正在清理并恢复情侣空间 localStorage 数据...');
          clearCoupleSpaceLocalStorage();
          restoreCoupleSpaceLocalStorage(localStorageData);
        }
      }

      // 处理数据库表
      await db.transaction('rw', db.tables, async () => {
        for (const type of typesToMerge) {
          // 跳过 localStorage，它已经在上面处理了
          if (type === 'localStorage') continue;
          
          const data = dataToMerge[type];
          if (!data) continue;

          const table = db.table(type);
          if (!table) {
            console.warn(`找不到表: ${type}, 跳过...`);
            continue;
          }

          if (Array.isArray(data)) {

            console.log(`正在合并 ${data.length} 条记录到 ${type}...`);
            await table.bulkPut(data);
          } else if (typeof data === 'object' && data.id) {

            console.log(`正在合并单条记录到 ${type}...`);
            await table.put(data);
          } else if (typeof data === 'object') {

            console.log(`正在合并非标对象到 ${type}...`);
            const existingData = await table.toCollection().first() || {};
            const mergedData = {
              ...existingData,
              ...data
            };


            if (existingData.id) {
              mergedData.id = existingData.id;
            } else if (type === 'apiConfig' || type === 'qzoneSettings' || type === 'globalSettings' || type === 'musicLibrary' || type === 'userWallet') {
              mergedData.id = 'main';
            }

            await table.put(mergedData);
          }
        }
      });

      await showCustomAlert('合并成功', '数据已成功合并！应用即将刷新以应用所有更改。');
      setTimeout(() => window.location.reload(), 1500);

    } catch (error) {
      console.error("选择性导入失败:", error);
      await showCustomAlert('合并失败', `文件应用失败: ${error.message}`);
    } finally {
      pendingBackupData = null;
    }
  }


  async function importLegacyBackup(backupData) {
    try {
      // 1. 先清理所有情侣空间相关的 localStorage
      console.log('正在清理情侣空间 localStorage 数据...');
      clearCoupleSpaceLocalStorage();
      
      // 2. 导入数据库
      await db.transaction('rw', db.tables, async () => {
        await db.chats.clear();
        await db.worldBooks.clear();

        for (const table of db.tables) {
          await table.clear();
        }

        if (Array.isArray(backupData.chats)) await db.chats.bulkPut(backupData.chats);
        if (Array.isArray(backupData.worldBooks)) await db.worldBooks.bulkPut(backupData.worldBooks);

        if (Array.isArray(backupData.userStickers)) await db.userStickers.bulkPut(backupData.userStickers);
        if (backupData.apiConfig) await db.apiConfig.put(backupData.apiConfig);
        if (backupData.globalSettings) await db.globalSettings.put(backupData.globalSettings);

        if (Array.isArray(backupData.personaPresets)) await db.personaPresets.bulkPut(backupData.personaPresets);
        if (backupData.musicLibrary) await db.musicLibrary.put(backupData.musicLibrary);
        if (backupData.qzoneSettings) await db.qzoneSettings.put(backupData.qzoneSettings);
        if (Array.isArray(backupData.qzonePosts)) await db.qzonePosts.bulkPut(backupData.qzonePosts);
        if (Array.isArray(backupData.qzoneAlbums)) await db.qzoneAlbums.bulkPut(backupData.qzoneAlbums);
        if (Array.isArray(backupData.qzonePhotos)) await db.qzonePhotos.bulkPut(backupData.qzonePhotos);
        if (Array.isArray(backupData.favorites)) await db.favorites.bulkPut(backupData.favorites);
        if (Array.isArray(backupData.qzoneGroups)) await db.qzoneGroups.bulkPut(backupData.qzoneGroups);
        if (Array.isArray(backupData.memories)) await db.memories.bulkPut(backupData.memories);
        if (Array.isArray(backupData.worldBookCategories)) await db.worldBookCategories.bulkPut(backupData.worldBookCategories);
        if (Array.isArray(backupData.apiPresets)) await db.apiPresets.bulkPut(backupData.apiPresets);
        if (Array.isArray(backupData.soundPresets)) await db.soundPresets.bulkPut(backupData.soundPresets);
        if (Array.isArray(backupData.shoppingProducts)) await db.shoppingProducts.bulkPut(backupData.shoppingProducts);
        if (Array.isArray(backupData.callRecords)) await db.callRecords.bulkPut(backupData.callRecords);
        if (Array.isArray(backupData.renderingRules)) await db.renderingRules.bulkPut(backupData.renderingRules);
        if (Array.isArray(backupData.doubanPosts)) await db.doubanPosts.bulkPut(backupData.doubanPosts);
        if (Array.isArray(backupData.stickerCategories)) await db.stickerCategories.bulkPut(backupData.stickerCategories);
        if (Array.isArray(backupData.appearancePresets)) await db.appearancePresets.bulkPut(backupData.appearancePresets);
        if (Array.isArray(backupData.customWidgetPackages)) await db.customWidgetPackages.bulkPut(backupData.customWidgetPackages);
        if (Array.isArray(backupData.customWidgetInstances)) await db.customWidgetInstances.bulkPut(backupData.customWidgetInstances);
        if (Array.isArray(backupData.presets)) await db.presets.bulkPut(backupData.presets);
        if (Array.isArray(backupData.presetCategories)) await db.presetCategories.bulkPut(backupData.presetCategories);
        if (Array.isArray(backupData.npcs)) await db.npcs.bulkPut(backupData.npcs);

        // 新增的表
        if (Array.isArray(backupData.stickerVisionCache)) await db.stickerVisionCache.bulkPut(backupData.stickerVisionCache);
        if (Array.isArray(backupData.shoppingCategories)) await db.shoppingCategories.bulkPut(backupData.shoppingCategories);
        if (Array.isArray(backupData.customAvatarFrames)) await db.customAvatarFrames.bulkPut(backupData.customAvatarFrames);
        if (Array.isArray(backupData.readingLibrary)) await db.readingLibrary.bulkPut(backupData.readingLibrary);
        if (Array.isArray(backupData.quickReplies)) await db.quickReplies.bulkPut(backupData.quickReplies);
        if (Array.isArray(backupData.quickReplyCategories)) await db.quickReplyCategories.bulkPut(backupData.quickReplyCategories);
        if (Array.isArray(backupData.npcGroups)) await db.npcGroups.bulkPut(backupData.npcGroups);
        if (Array.isArray(backupData.naiPresets)) await db.naiPresets.bulkPut(backupData.naiPresets);
        if (Array.isArray(backupData.grAuthors)) await db.grAuthors.bulkPut(backupData.grAuthors);
        if (Array.isArray(backupData.grStories)) await db.grStories.bulkPut(backupData.grStories);
        if (backupData.userWallet) await db.userWallet.put(backupData.userWallet);
        if (Array.isArray(backupData.userTransactions)) await db.userTransactions.bulkPut(backupData.userTransactions);
        if (Array.isArray(backupData.funds)) await db.funds.bulkPut(backupData.funds);
        if (Array.isArray(backupData.auctions)) await db.auctions.bulkPut(backupData.auctions);
        if (Array.isArray(backupData.inventory)) await db.inventory.bulkPut(backupData.inventory);
        if (Array.isArray(backupData.emails)) await db.emails.bulkPut(backupData.emails);
        if (Array.isArray(backupData.mailThreads)) await db.mailThreads.bulkPut(backupData.mailThreads);
        if (Array.isArray(backupData.mailContacts)) await db.mailContacts.bulkPut(backupData.mailContacts);
        if (Array.isArray(backupData.mailAccounts)) await db.mailAccounts.bulkPut(backupData.mailAccounts);
        if (Array.isArray(backupData.mailEvents)) await db.mailEvents.bulkPut(backupData.mailEvents);
        if (Array.isArray(backupData.mailPublicBoxes)) await db.mailPublicBoxes.bulkPut(backupData.mailPublicBoxes);
        if (backupData.mailSettings) await db.mailSettings.put(backupData.mailSettings);
        for (const tableName of window.SmsEngine?.TABLES || []) {
          if (Array.isArray(backupData[tableName])) await db.table(tableName).bulkPut(backupData[tableName].map(row => ({ ...row, lease: null, summaryLease: null })));
        }
        if (Array.isArray(backupData.videoAttachments)) await window.ChatVideo.importMedia(backupData.videoAttachments);
        if (Array.isArray(backupData.watchTogetherPlaylist)) await db.watchTogetherPlaylist.bulkPut(backupData.watchTogetherPlaylist);
        if (Array.isArray(backupData.mcpConnections)) await db.mcpConnections.bulkPut(sanitizeMcpConnectionsForBackup(backupData.mcpConnections));
        if (Array.isArray(backupData.mcpActivities)) await db.mcpActivities.bulkPut(backupData.mcpActivities);
        if (backupData.mcpSettings) await db.mcpSettings.put(backupData.mcpSettings);
      });
      
      // 3. 如果备份中有 localStorage 数据，则恢复
      if (backupData.localStorage) {
        console.log('正在恢复情侣空间 localStorage 数据...');
        restoreCoupleSpaceLocalStorage(backupData.localStorage);
      } else {
        console.log('备份中没有 localStorage 数据（可能是旧版备份），已清理情侣空间数据');
      }
      
    } catch (error) {
      throw new Error(`旧版备份数据写入数据库失败: ${error.message}`);
    }
  }


