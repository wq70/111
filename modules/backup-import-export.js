// ============================================================
// backup-import-export.js — 备份导入导出 + 数据分布统计
// 从 script.js 拆分（原始行范围：6093~6974 + 54517~55595）
// ============================================================

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

        appearancePresets,

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
        watchTogetherPlaylist
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

        db.appearancePresets.toArray(),

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
        db.watchTogetherPlaylist.toArray()
      ]);

      // 方案3：导出时移除API历史记录
      const cleanedChats = removeApiHistoryFromChats(chats);

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

        appearancePresets,

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
        watchTogetherPlaylist
      });

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
    const protectedTables = ['apiConfig', 'globalSettings', 'userWallet'];
    
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
        watchTogetherPlaylist: '观影播放列表'
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
        const canClean = !['apiConfig', 'globalSettings', 'userWallet'].includes(stat.tableName);
        
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
      await db.transaction('rw', db.tables, async () => {

        for (const table of db.tables) {
          await table.clear();
        }


        for (const tableName in backupData) {
          if (Array.isArray(backupData[tableName])) {
            console.log(`正在导入表: ${tableName}, 记录数: ${backupData[tableName].length}`);
            await db.table(tableName).bulkPut(backupData[tableName]);
          }
        }
      });

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

      let backupDataContent;
      let backupType;


      if (data.data && typeof data.data === 'object' && (data.data.chats || data.data.worldBooks)) {
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
      'watchTogetherPlaylist': '观影播放列表'
    };

    let foundData = false;
    for (const key in contentSummary) {
      if (backupDataContent[key] && (Array.isArray(backupDataContent[key]) ? backupDataContent[key].length > 0 : backupDataContent[key])) {
        const count = Array.isArray(backupDataContent[key]) ? backupDataContent[key].length : 1;
        const li = document.createElement('li');
        li.textContent = `${contentSummary[key]}: ${count} 条/个`;
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
          const novelaiSettings = localStorage.getItem('novelai-settings'); // NovelAI配置比较特殊，通常在localStorage，如果备份里有也可以恢复
          // 注意：你的代码似乎没有把 novelai 的 key 存入 apiConfig 表，而是直接存 localStorage，
          // 如果你的备份逻辑里没有包含 localStorage 的 novelai 数据，导入后确实会丢失。
          // 但这里我们主要修复 ImgBB/Minimax/Catbox。
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
      'watchTogetherPlaylist': '观影播放列表'
    };

    let hasContent = false;
    for (const key in contentSummary) {
      if (backupDataContent[key] && (Array.isArray(backupDataContent[key]) ? backupDataContent[key].length > 0 : backupDataContent[key])) {
        const count = Array.isArray(backupDataContent[key]) ? backupDataContent[key].length : 1;
        const isSingleObject = !Array.isArray(backupDataContent[key]);

        const item = document.createElement('div');
        item.className = 'clear-posts-item selected';
        item.dataset.typeId = key;
        item.innerHTML = `
                <div class="checkbox selected"></div>
                <div>
                    <span class="name">${contentSummary[key]} (${count} 条/个)</span>
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

      await db.transaction('rw', db.tables, async () => {
        for (const type of typesToMerge) {
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
        if (Array.isArray(backupData.watchTogetherPlaylist)) await db.watchTogetherPlaylist.bulkPut(backupData.watchTogetherPlaylist);
      });
    } catch (error) {
      throw new Error(`旧版备份数据写入数据库失败: ${error.message}`);
    }
  }


  // ============================================================
  // 以下来自 script.js 第二段（原始行范围：54517~55595）
  // ============================================================

  function removeApiHistoryFromChats(chatsArray) {
    if (!Array.isArray(chatsArray)) return chatsArray;
    
    // 创建深拷贝并移除apiHistory字段
    return chatsArray.map(chat => {
      const chatCopy = { ...chat };
      if (chatCopy.apiHistory) {
        delete chatCopy.apiHistory;
      }
      return chatCopy;
    });
  }

  async function exportDataAsSlicedZip() {

    if (!window.streamSaver || typeof JSZip === 'undefined') {
      await showCustomAlert("库加载失败", "无法启动导出，所需的核心库 (StreamSaver.js 或 JSZip) 未加载。请检查您的网络连接并刷新页面后重试。");
      return;
    }

    await showCustomAlert("正在准备分片导出...", "即将开始打包您的完整备份文件。文件将以ZIP格式流式下载，请勿关闭页面。");


    const fileStream = streamSaver.createWriteStream(`330-EPhone-Sliced-Backup-${new Date().toISOString().split('T')[0]}.zip`);
    const zip = new JSZip();


    const MAX_SLICE_SIZE = 95 * 1024 * 1024;
    let sliceIndex = 1;
    let currentSliceData = {};
    let currentSliceSizeBytes = 0;
    const encoder = new TextEncoder();

    try {
      const tablesToBackup = db.tables.map(t => t.name);

      for (const tableName of tablesToBackup) {
        console.log(`正在打包表: ${tableName}...`);
        let tableData = await db.table(tableName).toArray();

        // 方案3：导出时移除API历史记录
        if (tableName === 'chats') {
          tableData = removeApiHistoryFromChats(tableData);
        }

        if (tableData.length === 0) continue;

        const tableDataString = JSON.stringify(tableData);
        const tableDataSize = encoder.encode(tableDataString).length;


        if (tableDataSize > MAX_SLICE_SIZE) {
          console.warn(`警告：表 "${tableName}" (大小: ${(tableDataSize / 1024 / 1024).toFixed(2)}MB) 单独超过了切片限制。`);


          if (currentSliceSizeBytes > 0) {
            zip.file(`slice_${sliceIndex++}.json`, JSON.stringify({
              version: 4,
              type: 'slice',
              data: currentSliceData
            }));
            currentSliceData = {};
            currentSliceSizeBytes = 0;
          }


          currentSliceData[tableName] = tableData;
          zip.file(`slice_${sliceIndex++}.json`, JSON.stringify({
            version: 4,
            type: 'slice',
            data: currentSliceData
          }));
          currentSliceData = {};
          currentSliceSizeBytes = 0;

          continue;
        }


        if (currentSliceSizeBytes > 0 && (currentSliceSizeBytes + tableDataSize > MAX_SLICE_SIZE)) {
          console.log(`切片 ${sliceIndex} 已满 (大小: ${(currentSliceSizeBytes / 1024 / 1024).toFixed(2)}MB)，正在归档...`);


          zip.file(`slice_${sliceIndex++}.json`, JSON.stringify({
            version: 4,
            type: 'slice',
            data: currentSliceData
          }));


          currentSliceData = {};
          currentSliceSizeBytes = 0;
        }


        currentSliceData[tableName] = tableData;
        currentSliceSizeBytes += tableDataSize;
      }


      if (currentSliceSizeBytes > 0) {
        console.log(`正在归档最后一个切片 ${sliceIndex} (大小: ${(currentSliceSizeBytes / 1024 / 1024).toFixed(2)}MB)...`);
        zip.file(`slice_${sliceIndex}.json`, JSON.stringify({
          version: 4,
          type: 'slice',
          data: currentSliceData
        }));
      }

      console.log("所有切片已打包，开始流式下载ZIP...");


      const zipStream = zip.generateInternalStream({
        type: "blob",
        streamFiles: true
      });


      const readableStream = new ReadableStream({
        start(controller) {
          zipStream.on('data', (chunk) => {

            controller.enqueue(chunk);
          }).on('end', () => {

            console.log("ZIP 流生成完毕。");
            controller.close();
          }).on('error', (err) => {

            console.error("JSZip 流错误:", err);
            controller.error(err);
          }).resume();
        }
      });


      await readableStream.pipeTo(fileStream);


      await showCustomAlert('导出已开始', '您的分片备份已开始下载。解压后，您可以使用"导入"功能，选择其中的 `slice_X.json` 文件进行增量恢复。');

    } catch (error) {
      console.error("分片导出过程中出错:", error);
      await showCustomAlert('导出失败', `在打包或写入文件流时发生错误: ${error.message}`);


      try {
        const writer = fileStream.getWriter();
        writer.abort(error);
      } catch (e) { }
    }
  }

  async function exportDataAsStream() {

    if (!window.streamSaver) {
      alert("流式下载库 (StreamSaver.js) 未加载。请检查网络连接或HTML文件配置。");
      return;
    }

    await showCustomAlert("正在准备...", "即将开始下载您的完整备份文件。下载过程中请勿关闭页面。");


    const fileStream = streamSaver.createWriteStream(`330-EPhone-Full-Backup-Streamed-${new Date().toISOString().split('T')[0]}.json`);
    const writer = fileStream.getWriter();
    const encoder = new TextEncoder();

    try {

      await writer.write(encoder.encode('{\n"version": 3,\n"timestamp": ' + Date.now() + ',\n"data": {\n'));

      const tablesToBackup = await db.tables.map(t => t.name);

      for (let i = 0; i < tablesToBackup.length; i++) {
        const tableName = tablesToBackup[i];
        const table = db.table(tableName);


        await writer.write(encoder.encode(`"${tableName}": [\n`));

        let isFirstRecordInTable = true;

        await table.each(record => {
          if (!isFirstRecordInTable) {
            writer.write(encoder.encode(',\n'));
          }

          // 方案3：导出时移除API历史记录
          let recordToWrite = record;
          if (tableName === 'chats' && record.apiHistory) {
            recordToWrite = { ...record };
            delete recordToWrite.apiHistory;
          }

          writer.write(encoder.encode(JSON.stringify(recordToWrite)));
          isFirstRecordInTable = false;
        });


        await writer.write(encoder.encode('\n]'));
        if (i < tablesToBackup.length - 1) {

          await writer.write(encoder.encode(',\n'));
        }
      }


      await writer.write(encoder.encode('\n}\n}'));

    } catch (error) {
      console.error("流式导出过程中出错:", error);
      await showCustomAlert('导出失败', `在写入文件流时发生错误: ${error.message}`);
    } finally {

      await writer.close();
    }
  }

  async function exportDataAsBlob() {
    await showCustomAlert("正在准备...", "正在读取所有数据到内存中，请稍候...");

    try {
      const backupData = {
        version: 3,
        timestamp: Date.now(),
        data: {}
      };

      const tablesToBackup = db.tables.map(t => t.name);

      for (const tableName of tablesToBackup) {
        let tableData = await db.table(tableName).toArray();
        
        // 方案3：导出时移除API历史记录
        if (tableName === 'chats') {
          tableData = removeApiHistoryFromChats(tableData);
        }
        
        backupData.data[tableName] = tableData;
        console.log(`已打包表: ${tableName}, 记录数: ${tableData.length}`);
      }

      const blob = new Blob(
        [JSON.stringify(backupData, null, 2)], {
        type: 'application/json'
      }
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `330-EPhone-Full-Backup-Legacy-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);

      await showCustomAlert('导出成功', '已成功导出所有数据！');

    } catch (error) {
      console.error("传统导出数据时出错:", error);
      await showCustomAlert('导出失败', `发生了一个错误: ${error.message}`);
    }
  }

  // 供更新弹窗/崩溃恢复弹窗使用：先选备份方式再导出，避免卡在「正在准备」
  window.ephoneExportBackupFromPopup = async function () {
    if (typeof showChoiceModal !== 'function' || typeof exportDataAsBlob !== 'function') {
      if (typeof showCustomAlert === 'function') {
        await showCustomAlert('无法备份', '导出功能尚未加载完成，请稍候几秒再试。');
      } else {
        alert('导出功能尚未加载完成，请稍候几秒再试。');
      }
      return false;
    }
    // 若从更新弹窗内调用，其 z-index 很高，选择/导出过程弹窗会被挡住，故临时降低直到流程结束
    const updateOverlay = document.getElementById('update-notification-overlay');
    const prevZ = updateOverlay ? updateOverlay.style.zIndex : '';
    if (updateOverlay) updateOverlay.style.zIndex = '10000';
    try {
      const choice = await showChoiceModal('选择备份方式', [
        { text: '分片导出 (推荐，ZIP 包，大数据也稳定)', value: 'slice' },
        { text: '智能导出 (单个大文件，数据大时可能较慢)', value: 'stream' },
        { text: '传统导出 (兼容旧设备，单文件)', value: 'blob' }
      ]);
      if (!choice) return false;
      if (choice === 'slice') {
        await exportDataAsSlicedZip();
      } else if (choice === 'stream') {
        await exportDataAsStream();
      } else {
        await exportDataAsBlob();
      }
      return true;
    } catch (e) {
      console.error('[备份]', e);
      if (typeof showCustomAlert === 'function') {
        await showCustomAlert('备份失败', '导出时出错：' + (e && e.message ? e.message : String(e)));
      } else {
        alert('备份失败：' + (e && e.message ? e.message : String(e)));
      }
      return false;
    } finally {
      if (updateOverlay) updateOverlay.style.zIndex = prevZ || '999999';
    }
  };

  // 高级导出导入功能 - 按类别导出导入（支持多选角色/群聊）
  let advancedExportSelectedChats = []; // 存储选中的角色/群聊ID
  
  async function showAdvancedExportImportModal() {
    // 定义数据类别及其对应的表
    const dataCategories = {
      '聊天与消息': ['chats'],
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
      '邮件系统': ['emails'],
      '外观设置': ['appearancePresets']
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
          }
          
          backupData.data[tableName] = tableData;
          totalRecords += tableData.length;
          console.log(`已打包表: ${tableName}, 记录数: ${tableData.length}${isFiltered ? ' (已过滤)' : ''}`);
        }
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

  // ========== 从 script.js 迁移：restoreFromGitHub, startAutoBackupTimer, stopAutoBackupTimer ==========
  let backupIntervalId = null;

  function startAutoBackupTimer(intervalMinutes) {
    if (backupIntervalId) clearInterval(backupIntervalId);
    if (!intervalMinutes) {
      const saved = localStorage.getItem('github-backup-interval');
      intervalMinutes = saved ? parseInt(saved) : 30;
    }
    console.log(`✅ 自动备份定时器已启动 (每 ${intervalMinutes} 分钟)`);
    backupIntervalId = setInterval(async () => {
      const isEnabled = localStorage.getItem('github-enabled') === 'true';
      const isAuto = localStorage.getItem('github-auto-backup') === 'true';
      if (isEnabled && isAuto) {
        console.log("⏰ 触发定时自动备份...");
        await uploadToGitHub(true);
      }
    }, intervalMinutes * 60 * 1000);
  }

  function stopAutoBackupTimer() {
    if (backupIntervalId) {
      clearInterval(backupIntervalId);
      backupIntervalId = null;
      console.log("🛑 自动备份定时器已停止");
    }
  }

  async function restoreFromGitHub() {
    if (!state.apiConfig.githubEnable) { alert("请先开启 GitHub 云备份功能。"); return; }
    const username = state.apiConfig.githubUsername;
    const repo = state.apiConfig.githubRepo;
    const token = state.apiConfig.githubToken;
    if (!username || !repo || !token) { alert("请先保存 GitHub 配置！"); return; }

    const modalBody = document.getElementById('custom-modal-body');
    const confirmBtn = document.getElementById('custom-modal-confirm');
    const cancelBtn = document.getElementById('custom-modal-cancel');

    const showProgress = (text) => {
      const modal = document.getElementById('custom-modal-overlay');
      document.getElementById('custom-modal-title').textContent = "GitHub 恢复";
      modalBody.innerHTML = `<div class="spinner" style="margin: 20px auto;"></div><p style="text-align:center;">${text}</p>`;
      confirmBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
      modal.classList.add('visible');
    };

    const ghFetch = async (path) => {
      let url = `https://api.github.com/repos/${username}/${repo}/contents/${path}`;
      if (state.apiConfig.githubProxyEnable && state.apiConfig.githubProxyUrl) {
        const relativePath = url.replace("https://api.github.com", "");
        url = state.apiConfig.githubProxyUrl.replace(/\/$/, '') + relativePath;
      }
      const res = await fetch(url, { headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' } });
      if (!res.ok) { if (res.status === 404) return []; throw new Error(`GitHub API Error: ${res.status}`); }
      return await res.json();
    };

    try {
      showProgress("正在搜索备份...");
      let rootPath = "";
      const backupsDir = await ghFetch("backups");
      if (backupsDir.length > 0) {
        const dateFolders = backupsDir.filter(item => item.type === 'dir');
        if (dateFolders.length > 0) {
          document.getElementById('custom-modal-overlay').classList.remove('visible');
          dateFolders.sort((a, b) => b.name.localeCompare(a.name));
          const dateChoices = dateFolders.map(f => ({ text: `📅 ${f.name}`, value: f.path }));
          const selectedPath = await showChoiceModal('请选择备份日期', dateChoices);
          if (!selectedPath) return;
          rootPath = selectedPath;
          showProgress(`正在读取 ${rootPath} ...`);
        }
      }
      const files = await ghFetch(rootPath);
      const backupSets = new Map();
      files.forEach(file => {
        if (!file.name.endsWith('.json') && !file.name.endsWith('.json.gz')) return;
        const partMatch = file.name.match(/^(.*)_part(\d+)\.json(?:\.gz)?$/);
        if (partMatch) {
          const baseName = partMatch[1];
          const partNum = parseInt(partMatch[2]);
          if (!backupSets.has(baseName)) backupSets.set(baseName, { type: 'multipart', display: baseName, parts: [] });
          backupSets.get(baseName).parts.push({ num: partNum, name: file.name, path: file.path });
        } else {
          backupSets.set(file.name, { type: 'single', display: file.name, name: file.name, path: file.path });
        }
      });
      if (backupSets.size === 0) throw new Error("未找到备份文件。");
      document.getElementById('custom-modal-overlay').classList.remove('visible');
      const choices = [];
      backupSets.forEach((info, key) => {
        let text = info.display;
        if (info.type === 'multipart') text += ` (${info.parts.length} 个分片)`;
        choices.push({ text: text, value: key });
      });
      const selectedKey = await showChoiceModal('请选择要恢复的档案', choices);
      if (!selectedKey) return;
      const targetSet = backupSets.get(selectedKey);
      const confirmRestore = await showCustomConfirm('最后确认', `即将恢复数据。本地数据将被覆盖。确定吗？`, { confirmButtonClass: 'btn-danger', confirmText: '恢复' });
      if (!confirmRestore) return;
      showProgress("正在下载并恢复数据...");
      await db.transaction('rw', db.tables, async () => { for (const table of db.tables) await table.clear(); });
      const processFile = async (filePath) => {
        let url = `https://api.github.com/repos/${username}/${repo}/contents/${filePath}`;
        if (state.apiConfig.githubProxyEnable && state.apiConfig.githubProxyUrl) {
          const relativePath = url.replace("https://api.github.com", "");
          url = state.apiConfig.githubProxyUrl.replace(/\/$/, '') + relativePath;
        }
        const res = await fetch(url, { headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3.raw' } });
        if (!res.ok) throw new Error(`下载失败: ${res.status}`);
        let json;
        const isGzipped = filePath.endsWith('.gz');
        if (isGzipped && typeof pako !== 'undefined') {
          const arrayBuffer = await res.arrayBuffer();
          const decompressed = pako.ungzip(new Uint8Array(arrayBuffer), { to: 'string' });
          json = JSON.parse(decompressed);
        } else {
          const text = await res.text();
          try { json = JSON.parse(text); } catch (e) {
            const decoded = decodeURIComponent(escape(window.atob(text.replace(/\s/g, ''))));
            json = JSON.parse(decoded);
          }
        }
        const dataPart = json.data || json;
        for (const tableName of Object.keys(dataPart)) {
          const records = dataPart[tableName];
          if (Array.isArray(records) && records.length > 0) await db.table(tableName).bulkPut(records);
        }
      };
      if (targetSet.type === 'multipart') {
        targetSet.parts.sort((a, b) => a.num - b.num);
        for (let i = 0; i < targetSet.parts.length; i++) {
          modalBody.innerHTML = `<div class="spinner"></div><p style="text-align:center;">正在处理分片 ${i + 1}/${targetSet.parts.length}...</p>`;
          await processFile(targetSet.parts[i].path);
          await new Promise(r => setTimeout(r, 50));
        }
      } else {
        await processFile(targetSet.path);
      }
      try {
        const restoredApiConfig = await db.apiConfig.get('main');
        if (restoredApiConfig) {
          if (restoredApiConfig.imgbbApiKey) localStorage.setItem('imgbb-api-key', restoredApiConfig.imgbbApiKey);
          if (restoredApiConfig.imgbbEnable !== undefined) localStorage.setItem('imgbb-enabled', restoredApiConfig.imgbbEnable);
          if (restoredApiConfig.minimaxApiKey) localStorage.setItem('minimax-api-key', restoredApiConfig.minimaxApiKey);
          if (restoredApiConfig.minimaxGroupId) localStorage.setItem('minimax-group-id', restoredApiConfig.minimaxGroupId);
          if (restoredApiConfig.githubToken) state.apiConfig.githubToken = restoredApiConfig.githubToken;
        }
      } catch (e) { }
      confirmBtn.style.display = '';
      await showCustomAlert("恢复成功", "所有分片已处理完毕，数据已恢复！点击确定刷新页面。");
      setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      console.error(error);
      confirmBtn.style.display = '';
      await showCustomAlert("恢复失败", error.message);
    }
  }

  window.restoreFromGitHub = restoreFromGitHub;
  window.startAutoBackupTimer = startAutoBackupTimer;
  window.stopAutoBackupTimer = stopAutoBackupTimer;
