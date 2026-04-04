// ============================================================
// data-management.js — 数据管理模块
// 从 script.js 拆分而来
// 包含：数据清理、数据分布统计、字体管理、图片压缩、更新检查等
// ============================================================

// ========== 冗余数据清理 ==========

async function cleanupRedundantData() {
    const confirmed = await showCustomConfirm(
      '确认清理冗余数据？',
      '此操作将扫描数据库，移除所有与已删除角色相关的孤立数据（如动态、评论、记忆等）。<br><br><strong>此操作不可撤销，但通常是安全的。NPC数据不会被删除。</strong><br><br>建议在操作前先导出数据备份。', {
      confirmButtonClass: 'btn-danger',
      confirmText: '确认清理'
    }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", "正在开始清理冗余数据，请不要关闭页面...");
    console.log("冗余数据清理流程已启动...");

    let cleanupCounts = {
      posts: 0,
      likes: 0,
      comments: 0,
      memories: 0,
      callRecords: 0,
      renderingRules: 0,
      groupMembers: 0,
      chatLinks: 0,
    };

    try {
      await db.transaction('rw', db.tables, async () => {

        const allChats = await db.chats.toArray();
        const allNpcs = await db.npcs.toArray();

        const existingChatIds = new Set(allChats.map(c => c.id));
        const existingNpcIds = new Set(allNpcs.map(n => `npc_${n.id}`));

        const existingOriginalNames = new Set(allChats.filter(c => !c.isGroup).map(c => c.originalName));
        existingOriginalNames.add(state.qzoneSettings.nickname || '{{user}}');

        allNpcs.forEach(npc => existingOriginalNames.add(npc.name));


        for (const chat of allChats) {
          let chatModified = false;
          if (chat.isGroup && chat.members) {
            const originalMemberCount = chat.members.length;


            chat.members = chat.members.filter(member =>
              existingChatIds.has(member.id) || existingNpcIds.has(member.id)
            );

            if (chat.members.length < originalMemberCount) {
              cleanupCounts.groupMembers += (originalMemberCount - chat.members.length);
              chatModified = true;
            }
          }

          if (chat.settings?.linkedMemoryChatIds?.length > 0) {
            const originalLinkCount = chat.settings.linkedMemoryChatIds.length;
            chat.settings.linkedMemoryChatIds = chat.settings.linkedMemoryChatIds.filter(id => existingChatIds.has(id));
            if (chat.settings.linkedMemoryChatIds.length < originalLinkCount) {
              cleanupCounts.chatLinks += (originalLinkCount - chat.settings.linkedMemoryChatIds.length);
              chatModified = true;
            }
          }
          if (chatModified) {
            await db.chats.put(chat);
          }
        }


        const allPosts = await db.qzonePosts.toArray();
        for (const post of allPosts) {
          let postModified = false;



          const isAuthorValid = post.authorId === 'user' || existingChatIds.has(post.authorId) || existingNpcIds.has(post.authorId);

          if (!isAuthorValid) {
            await db.qzonePosts.delete(post.id);
            cleanupCounts.posts++;
            continue;
          }

          if (post.likes && post.likes.length > 0) {
            const originalLikeCount = post.likes.length;
            post.likes = post.likes.filter(name => existingOriginalNames.has(name));
            if (post.likes.length < originalLikeCount) {
              cleanupCounts.likes += (originalLikeCount - post.likes.length);
              postModified = true;
            }
          }
          if (post.comments && post.comments.length > 0) {
            const originalCommentCount = post.comments.length;
            post.comments = post.comments.filter(comment => {
              if (typeof comment === 'object' && comment.commenterName) {
                return existingOriginalNames.has(comment.commenterName);
              }
              return true;
            });
            if (post.comments.length < originalCommentCount) {
              cleanupCounts.comments += (originalCommentCount - post.comments.length);
              postModified = true;
            }
          }
          if (postModified) {
            await db.qzonePosts.put(post);
          }
        }


        await db.memories.where('chatId').noneOf([...existingChatIds]).delete().then(c => cleanupCounts.memories += c);
        await db.callRecords.where('chatId').noneOf([...existingChatIds]).delete().then(c => cleanupCounts.callRecords += c);
        const allRules = await db.renderingRules.toArray();
        for (const rule of allRules) {
          const scope = Array.isArray(rule.chatId) ? rule.chatId : [rule.chatId];
          // 如果规则绑定了 'global'，则保留
          if (scope.includes('global')) continue;
          // 如果规则绑定的所有 chatId 都不存在了，才删除
          const hasValidChat = scope.some(id => existingChatIds.has(id));
          if (!hasValidChat) {
            await db.renderingRules.delete(rule.id);
            cleanupCounts.renderingRules++;
          }
        }
      });

      let summary = "✅ 清理完成！\n\n";
      let cleanedSomething = false;
      Object.entries(cleanupCounts).forEach(([key, value]) => {
        if (value > 0) {
          const keyMap = {
            posts: '动态',
            likes: '点赞',
            comments: '评论',
            memories: '记忆',
            callRecords: '通话记录',
            renderingRules: '渲染规则',
            groupMembers: '群成员',
            chatLinks: '记忆链接'
          };
          summary += `- 清理了 ${value} 条无效的${keyMap[key] || key}。\n`;
          cleanedSomething = true;
        }
      });
      if (!cleanedSomething) {
        summary = "✅ 检查完成，未发现任何冗余数据。";
      }
      summary += "\n建议刷新页面以确保所有更改生效。";

      await showCustomAlert("操作成功", summary);

      const confirmedReload = await showCustomConfirm("刷新页面？", "为了确保所有数据同步，建议立即刷新页面。");
      if (confirmedReload) {
        location.reload();
      }

    } catch (error) {
      console.error("清理冗余数据时出错:", error);
      await showCustomAlert('清理失败', `发生了一个错误: ${error.message}`);
    }
  }


  // ========== 清理指定数据表 ==========

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

  // ========== 数据分布统计 ==========

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


  // ========== 自定义字体管理 ==========

  // 字体范围 → CSS 选择器映射
  const FONT_SCOPE_SELECTORS = {
    homeScreen: '#home-screen',
    qq: '#chat-list-screen, #chat-interface-screen',
    cphone: '#character-phone-screen, #character-selection-screen',
    myphone: '#myphone-screen, #myphone-selection-screen',
    worldBook: '#world-book-screen, #world-book-editor-screen',
    douban: '#douban-screen, #douban-post-detail-screen',
    alipay: '#alipay-screen, #fund-screen',
    settings: '#font-settings-screen, #wallpaper-screen, #rendering-rules-screen, #preset-screen, #preset-editor-screen, #chat-settings-screen, #long-term-memory-screen'
  };

  function applyCustomFont(fontUrl, isPreviewOnly = false) {
    const globalFontSize = state.globalSettings.globalFontSize || 16;
    const fontSizeCss = globalFontSize !== 16 ? `font-size: ${globalFontSize}px;` : '';
    const fontLocalData = state.globalSettings.fontLocalData || '';

    // 优先使用本地字体数据，其次使用URL
    const fontSrc = fontLocalData || fontUrl;

    if (!fontSrc) {
      // 即使没有自定义字体，也要应用字体大小
      if (fontSizeCss) {
        dynamicFontStyle.innerHTML = `body { ${fontSizeCss} }`;
      } else {
        dynamicFontStyle.innerHTML = '';
      }
      document.getElementById('font-preview').style.fontFamily = '';
      return;
    }
    const fontName = 'custom-user-font';
    const newStyle = `
                        @font-face {
                          font-family: '${fontName}';
                          src: url('${fontSrc}');
                          font-display: swap;
                        }`;
    if (isPreviewOnly) {
      const previewStyle = document.getElementById('preview-font-style') || document.createElement('style');
      previewStyle.id = 'preview-font-style';
      previewStyle.innerHTML = newStyle;
      if (!document.getElementById('preview-font-style')) document.head.appendChild(previewStyle);
      document.getElementById('font-preview').style.fontFamily = `'${fontName}', 'bulangni', sans-serif`;
      document.getElementById('font-preview').style.fontSize = `${globalFontSize}px`;
    } else {
      const scope = state.globalSettings.fontScope || { all: true };
      const fontFamily = `'${fontName}', 'bulangni', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      if (scope.all) {
        dynamicFontStyle.innerHTML = `${newStyle}\nbody { font-family: ${fontFamily}; ${fontSizeCss} }`;
      } else {
        const selectors = Object.keys(FONT_SCOPE_SELECTORS)
          .filter(key => scope[key])
          .map(key => FONT_SCOPE_SELECTORS[key])
          .join(', ');
        if (selectors) {
          dynamicFontStyle.innerHTML = `${newStyle}\n${selectors} { font-family: ${fontFamily}; ${fontSizeCss} }`;
        } else {
          dynamicFontStyle.innerHTML = fontSizeCss ? `${newStyle}\nbody { ${fontSizeCss} }` : '';
        }
      }
    }
  }

  async function resetFontByScope() {
    const fontUrl = state.globalSettings.fontUrl;
    if (!fontUrl) {
      alert('当前没有使用自定义字体。');
      return;
    }

    const scope = state.globalSettings.fontScope || { all: true };
    const scopeLabels = {
      homeScreen: '主屏幕', qq: 'QQ (聊天)', cphone: 'Cphone',
      myphone: 'Myphone', worldBook: '世界书', douban: '豆瓣',
      alipay: '支付宝', settings: '设置页面'
    };
    const activeScopes = scope.all
      ? Object.keys(scopeLabels)
      : Object.keys(scopeLabels).filter(k => scope[k]);

    if (activeScopes.length === 0) {
      alert('当前没有区域在使用自定义字体。');
      return;
    }

    // 构建 checkbox 列表 HTML
    const checkboxHtml = activeScopes.map(key =>
      `<label style="display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer;">
        <input type="checkbox" value="${key}" style="width:18px;height:18px;accent-color:#007aff;">
        <span>${scopeLabels[key]}</span>
      </label>`
    ).join('');

    const contentHtml = `
      <div style="max-height:300px;overflow-y:auto;margin:10px 0;">
        ${checkboxHtml}
      </div>
      <p style="font-size:12px;color:#999;margin-top:8px;">勾选的区域将恢复为系统默认字体，其他区域不受影响。</p>
    `;

    return new Promise(resolve => {
      modalResolve = null;
      modalTitle.textContent = '选择要恢复默认的区域';
      modalBody.innerHTML = contentHtml;

      const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');
      if (modalFooter) {
        modalFooter.style.flexDirection = 'row';
        modalFooter.style.justifyContent = 'flex-end';
        modalFooter.innerHTML = `
          <button id="custom-modal-cancel">取消</button>
          <button id="custom-modal-confirm" class="confirm-btn btn-danger">恢复选中区域</button>
        `;
      }

      const confirmBtn = document.getElementById('custom-modal-confirm');
      const cancelBtn = document.getElementById('custom-modal-cancel');

      confirmBtn.onclick = async () => {
        const checked = modalBody.querySelectorAll('input[type="checkbox"]:checked');
        if (checked.length === 0) {
          alert('请至少选择一个区域。');
          return;
        }

        const resetKeys = Array.from(checked).map(cb => cb.value);
        const newScope = { ...scope, all: false };
        resetKeys.forEach(key => { newScope[key] = false; });

        const anyActive = Object.keys(scopeLabels).some(k => newScope[k]);
        if (!anyActive) {
          state.globalSettings.fontUrl = '';
          state.globalSettings.fontLocalData = '';
          state.globalSettings.fontScope = { all: true, homeScreen: true, qq: true, cphone: true, myphone: true, worldBook: true, douban: true, alipay: true, settings: true };
          dynamicFontStyle.innerHTML = '';
          document.getElementById('font-url-input').value = '';
          document.getElementById('font-preview').style.fontFamily = '';
          document.getElementById('font-local-filename').textContent = '';
          document.getElementById('font-local-warning').style.display = 'none';
          document.getElementById('font-local-clear-btn').style.display = 'none';
          document.getElementById('font-url-input').disabled = false;
          document.getElementById('font-url-input').placeholder = 'https://..../font.ttf';
        } else {
          state.globalSettings.fontScope = newScope;
          applyCustomFont(state.globalSettings.fontUrl, false);
        }

        await db.globalSettings.put(state.globalSettings);

        // 刷新字体设置页面 UI
        const allCb = document.getElementById('font-scope-all');
        if (allCb) {
          allCb.checked = state.globalSettings.fontScope.all;
          document.getElementById('font-scope-list').style.display = state.globalSettings.fontScope.all ? 'none' : 'flex';
          document.querySelectorAll('#font-scope-list input[data-scope]').forEach(cb => {
            cb.checked = state.globalSettings.fontScope[cb.dataset.scope] !== false;
          });
        }

        hideCustomModal();
        const names = resetKeys.map(k => scopeLabels[k]).join('、');
        alert(`已恢复以下区域的默认字体：${names}`);
        resolve(true);
      };

      cancelBtn.onclick = () => {
        hideCustomModal();
        resolve(false);
      };

      showCustomModal();
    });
  }

  async function resetToDefaultFont() {
    dynamicFontStyle.innerHTML = '';
    state.globalSettings.fontUrl = '';
    state.globalSettings.fontLocalData = '';
    state.globalSettings.globalFontSize = 16;
    state.globalSettings.fontScope = { all: true, homeScreen: true, qq: true, cphone: true, myphone: true, worldBook: true, douban: true, alipay: true, settings: true };
    await db.globalSettings.put(state.globalSettings);
    document.getElementById('font-url-input').value = '';
    document.getElementById('font-preview').style.fontFamily = '';
    document.getElementById('font-preview').style.fontSize = '';
    document.getElementById('font-local-filename').textContent = '';
    document.getElementById('font-local-warning').style.display = 'none';
    document.getElementById('font-local-clear-btn').style.display = 'none';
    document.getElementById('font-size-slider').value = 16;
    document.getElementById('font-size-value').textContent = '16';
    // 重置 UI
    const allCb = document.getElementById('font-scope-all');
    if (allCb) {
      allCb.checked = true;
      document.getElementById('font-scope-list').style.display = 'none';
      document.querySelectorAll('#font-scope-list input[type="checkbox"]').forEach(cb => cb.checked = true);
    }
    alert('已恢复默认字体。');
  }


  // ========== 高级数据清理向导 ==========

  let selectedCharsForClear = [];
  let selectedTypesForClear = [];

  function openDataClearWizard() {
    const modal = document.getElementById('data-clear-wizard-modal');
    selectedCharsForClear = [];
    selectedTypesForClear = [];


    renderClearWizardStep1();


    document.getElementById('data-clear-step-1').style.display = 'flex';
    document.getElementById('data-clear-step-2').style.display = 'none';

    modal.classList.add('visible');
  }


  function renderClearWizardStep1() {
    const listEl = document.getElementById('data-clear-char-list');
    listEl.innerHTML = '';


    const userItem = document.createElement('div');
    userItem.className = 'clear-posts-item';
    userItem.dataset.charId = 'user';
    userItem.innerHTML = `
        <div class="checkbox"></div>
        <span class="name">${state.qzoneSettings.nickname || '我'} (用户)</span>
    `;
    listEl.appendChild(userItem);


    Object.values(state.chats).forEach(chat => {
      if (!chat.isGroup) {
        const charItem = document.createElement('div');
        charItem.className = 'clear-posts-item';
        charItem.dataset.charId = chat.id;
        charItem.innerHTML = `
                <div class="checkbox"></div>
                <span class="name">${chat.name} (角色)</span>
            `;
        listEl.appendChild(charItem);
      } else {
        const groupItem = document.createElement('div');
        groupItem.className = 'clear-posts-item';
        groupItem.dataset.charId = chat.id;
        groupItem.dataset.isGroup = 'true';
        const memberCount = chat.members ? chat.members.length : 0;
        groupItem.innerHTML = `
                <div class="checkbox"></div>
                <span class="name">${chat.name} (群聊 - ${memberCount}人)</span>
            `;
        listEl.appendChild(groupItem);
      }
    });
  }


  function renderClearWizardStep2() {
    const listEl = document.getElementById('data-clear-type-list');
    listEl.innerHTML = '';

    const dataTypes = [{
      id: 'chat',
      name: '聊天记录',
      description: '将清空选定角色/群聊的所有对话消息。对于角色，还会清空曾用备注和你的昵称。'
    },
    {
      id: 'qzone',
      name: '动态与互动',
      description: '将清空选定角色的所有动态、评论和点赞。(不适用于群聊)'
    },
    {
      id: 'calls',
      name: '通话记录',
      description: '将清空选定角色的所有通话记录。(不适用于群聊)'
    },
    {
      id: 'thoughts',
      name: '心声',
      description: '将清空选定角色的心声和散记历史。(不适用于群聊)'
    },
    {
      id: 'memories',
      name: '长期记忆',
      description: '将清空选定角色的所有长期记忆。(不适用于群聊)'
    },
    {
      id: 'structured_memory',
      name: '结构化记忆',
      description: '将清空选定角色的所有结构化记忆数据及总结时间戳。(不适用于群聊)'
    },
    {
      id: 'status',
      name: '在线状态',
      description: '将重置选定角色的在线状态为默认值"在线"。(不适用于群聊)'
    },
    {
      id: 'countdown_memories',
      name: '倒计时/约定',
      description: '将清空与该角色的所有倒计时和约定。(不适用于群聊)'
    },
    {
      id: 'ai_memories',
      name: 'AI回忆',
      description: '将清空该角色创建的所有AI回忆记录。(不适用于群聊)'
    },
    {
      id: 'favorites',
      name: '收藏',
      description: '将清空收藏夹中所有与该角色相关的内容（如聊天、动态、日记等）。(不适用于群聊)'
    },
    {
      id: 'cphone',
      name: 'Cphone数据 (CPhone)',
      description: '将清空角色的相册、QQ、浏览器、淘宝、日记、备忘录等所有模拟手机数据。(不适用于群聊)'
    },
    {
      id: 'myphone',
      name: 'MyPhone数据 (MyPhone)',
      description: '将清空绑定角色的MyPhone所有数据，包括QQ联系人、相册、浏览器、淘宝、日记、备忘录、地图、APP记录、音乐等。(不适用于群聊)'
    },
    {
      id: 'todo',
      name: '待办事项 (To-Do)',
      description: '将清空选定角色的待办事项清单。(若第一步选"我"，则清除所有角色中由"我"创建的待办)'
    },
    {
      id: 'alipay_bills',
      name: '支付宝账单 (Alipay)',
      description: '将清空支付宝的所有交易流水、转账记录和基金买卖记录。(仅在第一步选择"我"时生效)'
    }
    ];

    dataTypes.forEach(type => {
      const item = document.createElement('div');
      item.className = 'clear-posts-item';
      item.dataset.typeId = type.id;
      item.innerHTML = `
                    <div class="checkbox"></div>
                    <div>
                        <span class="name">${type.name}</span>
                        <p style="font-size: 12px; color: #888; margin: 4px 0 0;">${type.description}</p>
                    </div>
                `;
      listEl.appendChild(item);
    });
  }



  function handleDataClearNext() {
    const selectedItems = document.querySelectorAll('#data-clear-char-list .clear-posts-item.selected');
    if (selectedItems.length === 0) {
      alert("请至少选择一个要清理的角色或群聊。");
      return;
    }

    selectedCharsForClear = Array.from(selectedItems).map(item => item.dataset.charId);


    renderClearWizardStep2();
    document.getElementById('data-clear-step-1').style.display = 'none';
    document.getElementById('data-clear-step-2').style.display = 'flex';
  }


  function handleDataClearBack() {
    document.getElementById('data-clear-step-2').style.display = 'none';
    document.getElementById('data-clear-step-1').style.display = 'flex';

    document.querySelectorAll('#data-clear-char-list .clear-posts-item').forEach(item => {
      if (selectedCharsForClear.includes(item.dataset.charId)) {
        item.classList.add('selected');
      }
    });
  }


  async function handleConfirmDataClear() {
    const selectedItems = document.querySelectorAll('#data-clear-type-list .clear-posts-item.selected');
    if (selectedItems.length === 0) {
      alert("请至少选择一种要清理的数据类型。");
      return;
    }

    selectedTypesForClear = Array.from(selectedItems).map(item => item.dataset.typeId);

    const confirmed = await showCustomConfirm(
      '最后确认！',
      '此操作将永久删除您选择的所有数据，且无法恢复！确定要继续吗？', {
      confirmButtonClass: 'btn-danger',
      confirmText: '确认删除'
    }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", "正在执行清理操作，请不要关闭页面...");

    try {
      await db.transaction('rw', db.tables, async () => {
        for (const charId of selectedCharsForClear) {
          for (const type of selectedTypesForClear) {
            if (type === 'todo') {
              if (charId === 'user') {
                // 如果第一步选的是"我 (用户)"，则遍历所有聊天，只删除 creator 为 'user' 的待办
                const allChats = await db.chats.toArray();
                for (const chat of allChats) {
                  if (chat.todoList && chat.todoList.length > 0) {
                    const originalLength = chat.todoList.length;
                    // 过滤掉用户创建的，保留AI创建的
                    chat.todoList = chat.todoList.filter(t => t.creator !== 'user');

                    if (chat.todoList.length < originalLength) {
                      await db.chats.put(chat);
                    }
                  }
                }
                console.log("已清理所有由用户创建的待办事项");
              } else {
                // 如果选的是具体角色或群聊，直接清空该对象的待办列表 (todoList)
                const chat = await db.chats.get(charId);
                if (chat) {
                  if (chat.isGroup) {
                    console.log(`跳过群聊 ${chat.name} 的待办事项清理（群聊不适用）`);
                    continue;
                  }
                  chat.todoList = []; // 直接置空
                  await db.chats.put(chat);
                  console.log(`已清空角色 ${chat.name} 的待办事项`);
                }
              }
            }
            if (type === 'alipay_bills') {
              // 只有当第一步选择了"我(用户)"时，才执行清空，防止误操作
              if (charId === 'user') {
                await db.userTransactions.clear(); // 清空账单表
                console.log("支付宝账单已全部清空");

                // 可选：如果你还想重置钱包余额和基金持仓，可以解开下面注释
                /*
                const wallet = await db.userWallet.get('main');
                if(wallet) {
                    wallet.balance = 0; // 重置余额
                    wallet.fundHoldings = []; // 重置基金
                    await db.userWallet.put(wallet);
                }
                */
              } else {
                // 如果选择了某个角色，尝试删除该角色名字相关的账单(模糊匹配)
                // 注意：这依赖于description包含角色名，可能不完全准确，建议只用上面的清空全部
                const chat = await db.chats.get(charId);
                if (chat) {
                  const nameKeys = [chat.name, chat.originalName];
                  // 这是一个比较耗时的过滤删除，但对于清理特定角色流水很有用
                  await db.userTransactions
                    .filter(t => nameKeys.some(k => t.description && t.description.includes(k)))
                    .delete();
                }
              }
            }
            if (type === 'chat') {
              if (charId === 'user') {
                const allChats = await db.chats.toArray();
                for (const chat of allChats) {
                  chat.history = chat.history.filter(msg => msg.role !== 'user');
                  await db.chats.put(chat);
                }
              } else {
                const chat = await db.chats.get(charId);
                if (chat) {
                  // 如果是群聊，只清空聊天记录，保留其他信息
                  if (chat.isGroup) {
                    chat.history = [];
                    // 保留群设置、成员等信息
                    await db.chats.put(chat);
                    console.log(`已清空群聊 ${chat.name} 的聊天记录`);
                  } else {
                    // 单聊的处理逻辑（清空更多信息）
                    chat.history = [];
                    chat.heartfeltVoice = '...';
                    chat.randomJottings = '...';
                    if (Array.isArray(chat.nameHistory)) {
                      chat.nameHistory = [];
                    }
                    if (chat.settings) {
                      chat.settings.myNickname = '我';
                    }
                    await db.chats.put(chat);
                  }
                }
              }
            }

            if (type === 'qzone') {
              // 群聊不适用于动态清理
              if (charId !== 'user') {
                const chat = await db.chats.get(charId);
                if (chat && chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的动态清理（群聊不适用）`);
                  continue;
                }
              }
              const authorId = (charId === 'user') ? 'user' : charId;
              await db.qzonePosts.where('authorId').equals(authorId).delete();
            }

            if (type === 'calls' && charId !== 'user') {
              // 检查是否为群聊
              const chat = await db.chats.get(charId);
              if (chat && chat.isGroup) {
                console.log(`跳过群聊 ${chat.name} 的通话记录清理（群聊不适用）`);
                continue;
              }
              await db.callRecords.where('chatId').equals(charId).delete();
            }

            if (type === 'thoughts' && charId !== 'user') {
              const chat = await db.chats.get(charId);
              if (chat) {
                if (chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的心声清理（群聊不适用）`);
                  continue;
                }
                chat.thoughtsHistory = [];
                chat.heartfeltVoice = '...';
                chat.randomJottings = '...';
                await db.chats.put(chat);
              }
            }

            if (type === 'memories' && charId !== 'user') {
              const chat = await db.chats.get(charId);
              if (chat) {
                if (chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的长期记忆清理（群聊不适用）`);
                  continue;
                }
                chat.longTermMemory = [];
                await db.chats.put(chat);
              }
            }

            if (type === 'structured_memory' && charId !== 'user') {
              const chat = await db.chats.get(charId);
              if (chat) {
                if (chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的结构化记忆清理（群聊不适用）`);
                  continue;
                }
                chat.structuredMemory = null;
                chat.lastStructuredMemoryTimestamp = 0;
                await db.chats.put(chat);
              }
            }

            if (type === 'status' && charId !== 'user') {
              const chat = await db.chats.get(charId);
              if (chat) {
                if (chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的在线状态重置（群聊不适用）`);
                  continue;
                }
                chat.status = { text: '在线', isBusy: false, lastUpdate: Date.now() };
                await db.chats.put(chat);
              }
            }

            if (type === 'countdown_memories' && charId !== 'user') {
              const chat = await db.chats.get(charId);
              if (chat) {
                if (chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的倒计时清理（群聊不适用）`);
                  continue;
                }
                // 删除该角色的所有倒计时/约定
                await db.memories.where('chatId').equals(charId).and(m => m.type === 'countdown').delete();
                console.log(`已清空角色 ${chat.name} 的所有倒计时/约定`);
              }
            }

            if (type === 'ai_memories' && charId !== 'user') {
              const chat = await db.chats.get(charId);
              if (chat) {
                if (chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的AI回忆清理（群聊不适用）`);
                  continue;
                }
                // 删除该角色的所有AI生成的回忆
                await db.memories.where('chatId').equals(charId).and(m => m.type === 'ai_generated').delete();
                console.log(`已清空角色 ${chat.name} 的所有AI回忆`);
              }
            }


            if (type === 'favorites') {
              if (charId === 'user') {

                await db.favorites.where('type').equals('qzone_post').filter(fav => fav.content.authorId === 'user').delete();

                await db.favorites.where('type').equals('chat_message').filter(fav => fav.content.role === 'user').delete();
              } else {
                // 检查是否为群聊
                const chat = await db.chats.get(charId);
                if (chat && chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的收藏清理（群聊不适用）`);
                  continue;
                }

                await db.favorites.where('type').equals('chat_message').and(fav => fav.chatId === charId).delete();

                await db.favorites.where('type').equals('qzone_post').filter(fav => fav.content.authorId === charId).delete();

                await db.favorites.where('type').equals('char_diary').filter(fav => fav.content.characterId === charId).delete();
                await db.favorites.where('type').equals('char_browser_article').filter(fav => fav.content.characterId === charId).delete();
                await db.favorites.where('type').equals('char_memo').filter(fav => fav.content.characterId === charId).delete();
              }
            }


            if (type === 'cphone' && charId !== 'user') {
              const chat = await db.chats.get(charId);
              if (chat) {
                if (chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的CPhone数据清理（群聊不适用）`);
                  continue;
                }
                chat.simulatedAlbum = [];
                chat.simulatedConversations = [];
                chat.simulatedBrowserHistory = [];
                chat.simulatedTaobaoHistory = null;
                chat.simulatedAmapHistory = [];
                chat.simulatedAppUsage = [];
                chat.simulatedMusicPlaylist = [];
                chat.diary = [];
                chat.memos = [];
                await db.chats.put(chat);
              }
            }

            if (type === 'myphone' && charId !== 'user') {
              const chat = await db.chats.get(charId);
              if (chat) {
                if (chat.isGroup) {
                  console.log(`跳过群聊 ${chat.name} 的MyPhone数据清理（群聊不适用）`);
                  continue;
                }
                chat.myPhoneSimulatedQQConversations = [];
                chat.myPhoneAlbum = [];
                chat.myPhoneBrowserHistory = [];
                chat.myPhoneTaobaoHistory = [];
                chat.myPhoneAmapHistory = [];
                chat.myPhoneAppUsage = [];
                chat.myPhoneMusicPlaylist = [];
                chat.myPhoneDiaries = [];
                chat.myPhoneMemos = [];
                await db.chats.put(chat);
              }
            }
          }
        }
      });

      await loadAllDataFromDB();
      await renderChatList();
      const alipayScreen = document.getElementById('alipay-screen');
      if (alipayScreen && alipayScreen.classList.contains('active')) {
        // 如果你之前定义了 loadBills 函数
        if (typeof loadBills === 'function') {
          await loadBills(true); // true 代表重置并重新加载
        }
        // 同时更新余额显示（如果刚才解开了重置余额的注释）
        if (window.userBalance !== undefined) {
          const wallet = await db.userWallet.get('main');
          if (wallet) {
            window.userBalance = wallet.balance;
            document.getElementById('alipay-balance-display').textContent = window.userBalance.toFixed(2);
          }
        }
      }
      document.getElementById('data-clear-wizard-modal').classList.remove('visible');
      await showCustomAlert("清理完成", "指定的数据已成功清除。");

    } catch (error) {
      console.error("高级数据清理失败:", error);
      await showCustomAlert("清理失败", `操作失败: ${error.message}`);
    }
  }


  // ========== 图标更换 ==========

  async function handleIconChange(iconId, phoneType, itemElement) {
    const appName = itemElement.querySelector('.icon-preview').alt;

    const choice = await showChoiceModal(`更换"${appName}"图标`, [
      { text: '📁 从本地上传', value: 'local' },
      { text: '🌐 使用网络URL', value: 'url' },
      { text: '🔄 重置为默认', value: 'reset' }
    ]);

    // 处理重置逻辑
    if (choice === 'reset') {
      const iconElement = itemElement.querySelector('.icon-preview');
      const defaultSrc = iconElement.dataset.defaultSrc;

      if (defaultSrc) {
        // 恢复到默认图标
        iconElement.src = defaultSrc;

        // 从对应的数据库对象中删除该记录
        if (phoneType === 'cphone') {
          if (state.globalSettings.cphoneAppIcons && state.globalSettings.cphoneAppIcons[iconId]) {
            delete state.globalSettings.cphoneAppIcons[iconId];
          }
        } else if (phoneType === 'myphone') {
          if (state.globalSettings.myphoneAppIcons && state.globalSettings.myphoneAppIcons[iconId]) {
            delete state.globalSettings.myphoneAppIcons[iconId];
          }
        } else {
          if (state.globalSettings.appIcons && state.globalSettings.appIcons[iconId]) {
            delete state.globalSettings.appIcons[iconId];
          }
        }

        await db.globalSettings.put(state.globalSettings);
        await showCustomAlert("成功", "已重置为默认图标！");
      } else {
        // 没有默认图标，重置为纯白色
        // 创建一个1x1的纯白色图片的Base64
        const whitePixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2P4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
        iconElement.src = whitePixel;

        // 从对应的数据库对象中删除该记录
        if (phoneType === 'cphone') {
          if (state.globalSettings.cphoneAppIcons && state.globalSettings.cphoneAppIcons[iconId]) {
            delete state.globalSettings.cphoneAppIcons[iconId];
          }
        } else if (phoneType === 'myphone') {
          if (state.globalSettings.myphoneAppIcons && state.globalSettings.myphoneAppIcons[iconId]) {
            delete state.globalSettings.myphoneAppIcons[iconId];
          }
        } else {
          if (state.globalSettings.appIcons && state.globalSettings.appIcons[iconId]) {
            delete state.globalSettings.appIcons[iconId];
          }
        }

        await db.globalSettings.put(state.globalSettings);
        await showCustomAlert("成功", "没有默认信息，已重置为纯白！");
      }
      return;
    }

    let newUrl = null;
    let isBase64 = false;

    if (choice === 'local') {
      newUrl = await new Promise(resolve => { // 简化版 uploadImageLocally
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = e => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (readerEvent) => resolve(readerEvent.target.result);
            reader.readAsDataURL(file);
          } else {
            resolve(null);
          }
        };
        input.click();
      });
      if (newUrl) isBase64 = true;

    } else if (choice === 'url') {
      let currentUrl;
      if (phoneType === 'cphone') {
        currentUrl = state.globalSettings.cphoneAppIcons[iconId];
      } else if (phoneType === 'myphone') {
        currentUrl = state.globalSettings.myphoneAppIcons[iconId];
      } else {
        currentUrl = state.globalSettings.appIcons[iconId];
      }
      const isCurrentUrlBase64 = currentUrl && currentUrl.startsWith('data:image');

      const initialValueForPrompt = isCurrentUrlBase64 ? '' : currentUrl;

      newUrl = await showCustomPrompt(`更换图标`, '请输入新的图片URL', initialValueForPrompt, 'url');


      if (newUrl) isBase64 = false;
    }

    if (newUrl && newUrl.trim()) {
      const trimmedUrl = newUrl.trim();


      itemElement.querySelector('.icon-preview').src = trimmedUrl;


      let dbPath;
      if (phoneType === 'cphone') {
        dbPath = `cphoneAppIcons.${iconId}`;
        state.globalSettings.cphoneAppIcons[iconId] = trimmedUrl;
      } else if (phoneType === 'myphone') {
        dbPath = `myphoneAppIcons.${iconId}`;
        state.globalSettings.myphoneAppIcons[iconId] = trimmedUrl;
      } else {
        dbPath = `appIcons.${iconId}`;
        state.globalSettings.appIcons[iconId] = trimmedUrl;
      }
      await db.globalSettings.put(state.globalSettings);
      await showCustomAlert("成功", "图标已更新！");


      if (isBase64) {
        (async () => {
          console.log(`[ImgBB] 启动 ${dbPath} 的静默上传...`);
          await silentlyUpdateDbUrl(
            db.globalSettings,
            'main',
            dbPath,
            trimmedUrl // The Base64 string
          );
        })();
      }
    } else if (newUrl !== null) {
      alert("请输入一个有效的URL或选择一个文件！");
    }
  }


  // ========== 图片压缩 ==========

  async function compressAllLocalImages() {

    const confirmed = await showCustomConfirm(
      '确认压缩图片？',
      '此操作将扫描并压缩所有本地上传的图片（Base64格式），将其转换为JPEG以减小体积。这会轻微降低图片质量且【不可恢复】。<br><br><strong>强烈建议在操作前先进行数据备份！</strong>', {
      confirmButtonClass: 'btn-danger',
      confirmText: '我已了解风险，确认压缩'
    }
    );

    if (!confirmed) return;


    await showCustomAlert("请稍候...", "正在开始全面压缩图片，根据图片数量，这可能需要几分钟时间，请不要关闭或刷新页面...");

    let stats = {
      found: 0,
      compressed: 0,
      skipped: 0,
      originalSize: 0,
      newSize: 0
    };

    try {





      console.log("压缩步骤 1/3: 正在从数据库读取所有相关数据...");
      const tablesToScan = [
        'chats', 'globalSettings', 'qzoneSettings',
        'userStickers', 'customAvatarFrames'
      ];
      const allData = [];
      for (const tableName of tablesToScan) {
        const table = db.table(tableName);
        const records = await table.toArray();
        allData.push({
          tableName,
          records
        });
      }


      console.log("压缩步骤 2/3: 正在内存中异步压缩图片，这可能需要一些时间...");
      for (const data of allData) {
        for (const record of data.records) {

          await traverseAndCompress(record, stats);
        }
      }


      console.log("压缩步骤 3/3: 正在将压缩后的数据写回数据库...");
      await db.transaction('rw', tablesToScan, async () => {
        for (const data of allData) {

          await db.table(data.tableName).bulkPut(data.records);
        }
      });






      const reduction = stats.originalSize - stats.newSize;
      const reductionPercent = stats.originalSize > 0 ? (reduction / stats.originalSize * 100).toFixed(2) : 0;

      await showCustomAlert(
        '压缩完成！',
        `扫描完成！<br>
            - 共找到 ${stats.found} 张本地图片<br>
            - 成功压缩 ${stats.compressed} 张<br>
            - 跳过(已压缩或无需压缩) ${stats.skipped} 张<br>
            - 空间节省了 <strong>${(reduction / 1024 / 1024).toFixed(2)} MB</strong> (压缩率 ${reductionPercent}%)
            <br><br>
            建议刷新页面以应用所有更改。`
      );

    } catch (error) {
      console.error("图片压缩过程中发生错误:", error);
      await showCustomAlert('压缩失败', `操作失败: ${error.message}`);
    }
  }

  function calculateTotalSizeRecursive(obj, parentKey = '') {
    let totalSize = 0;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (typeof value === 'string' && value.startsWith('data:image')) {


          const isExcluded =

            (parentKey === 'globalSettings' && (key === 'wallpaper' || key === 'cphoneWallpaper' || key === 'globalChatBackground')) ||

            (parentKey === 'widgetData') ||

            (parentKey === 'settings' && key === 'background') ||

            (parentKey === 'appIcons' || parentKey === 'cphoneAppIcons' || parentKey === 'myphoneAppIcons');

          if (!isExcluded) {
            totalSize += value.length;
          }


        } else if (typeof value === 'object' && value !== null) {

          totalSize += calculateTotalSizeRecursive(value, key);
        }
      }
    }
    return totalSize;
  }


  async function displayTotalImageSize() {
    const displayElement = document.getElementById('total-image-size-display');
    if (!displayElement) return;

    displayElement.innerHTML = `
        <span id="image-size-label">正在计算可压缩图片大小...</span>
        <span id="image-size-value">-- MB</span>
    `;

    try {
      let totalBytes = 0;
      const tablesToScan = [
        'chats', 'globalSettings', 'qzoneSettings',
        'userStickers', 'customAvatarFrames'
      ];

      for (const tableName of tablesToScan) {
        const table = db.table(tableName);
        await table.each(record => {

          totalBytes += calculateTotalSizeRecursive(record);
        });
      }

      const totalMB = (totalBytes / 1024 / 1024).toFixed(2);

      displayElement.innerHTML = `
            <span id="image-size-label">本地图片(头像/表情/头像框/等)大小:</span>
            <span id="image-size-value"><strong>${totalMB} MB</strong></span>
        `;

    } catch (error) {
      console.error("计算图片总大小时出错:", error);
      displayElement.innerHTML = `
            <span id="image-size-label">计算图片大小时出错</span>
            <span id="image-size-value">Error</span>
        `;
    }
  }


  // ========== 清空聊天表情包消息 ==========

  let selectedCharsForStickerClear = [];

  async function openClearStickersModal() {
    const modal = document.getElementById('clear-stickers-modal');
    selectedCharsForStickerClear = [];
    
    // 计算并显示存储占用
    const statsEl = document.getElementById('sticker-storage-stats');
    statsEl.innerHTML = '正在计算...';
    
    const stats = await calculateChatStickerStorageSize();
    if (stats) {
      statsEl.innerHTML = `
        <div>聊天中总表情消息数：<strong>${stats.totalCount}</strong> 条</div>
        <div>• Base64表情消息：<strong>${stats.base64Count}</strong> 条 (<strong>${stats.totalMB} MB</strong>)</div>
        <div>• 网络URL表情消息：<strong>${stats.urlCount}</strong> 条 (不占本地空间)</div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ffc107;">
          💡 <strong>结论：</strong>${stats.base64Count > 0 ? `聊天中的Base64表情消息占用了 ${stats.totalMB} MB 本地存储空间` : '聊天中的表情消息没有占用本地存储空间'}
        </div>
      `;
    } else {
      statsEl.innerHTML = '<div style="color: #dc3545;">计算失败</div>';
    }

    await renderClearStickersList();
    modal.classList.add('visible');
  }

  async function calculateChatStickerStorageSize() {
    try {
      const allChats = await db.chats.toArray();
      let totalCount = 0;
      let base64Count = 0;
      let base64Size = 0;
      let urlCount = 0;

      for (const chat of allChats) {
        if (chat.history && Array.isArray(chat.history)) {
          for (const msg of chat.history) {
            // 检查是否是表情消息：有meaning字段或type==='sticker'
            const isSticker = msg.meaning || msg.type === 'sticker';
            if (isSticker && msg.content) {
              totalCount++;
              if (msg.content.startsWith('data:image')) {
                base64Count++;
                base64Size += msg.content.length;
              } else {
                urlCount++;
              }
            }
          }
        }
      }

      const totalMB = (base64Size / 1024 / 1024).toFixed(2);
      return {
        totalCount,
        base64Count,
        base64Size,
        totalMB,
        urlCount
      };
    } catch (error) {
      console.error('计算聊天表情包大小时出错:', error);
      return null;
    }
  }

  async function renderClearStickersList() {
    const listEl = document.getElementById('clear-stickers-category-list');
    listEl.innerHTML = '';

    const allChats = await db.chats.toArray();
    const chatsWithStickers = [];

    // 统计每个角色的表情消息数量和大小
    for (const chat of allChats) {
      if (chat.isGroup) continue; // 暂不支持群聊

      let stickerCount = 0;
      let totalSize = 0;
      let base64Count = 0;

      if (chat.history && Array.isArray(chat.history)) {
        for (const msg of chat.history) {
          const isSticker = msg.meaning || msg.type === 'sticker';
          if (isSticker && msg.content) {
            stickerCount++;
            if (msg.content.startsWith('data:image')) {
              base64Count++;
              totalSize += msg.content.length;
            }
          }
        }
      }

      if (stickerCount > 0) {
        chatsWithStickers.push({
          id: chat.id,
          name: chat.name,
          avatar: chat.settings?.aiAvatar || defaultAvatar,
          stickerCount,
          base64Count,
          totalSize
        });
      }
    }

    // 按表情数量排序
    chatsWithStickers.sort((a, b) => b.stickerCount - a.stickerCount);

    if (chatsWithStickers.length === 0) {
      listEl.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">聊天中没有发送过表情包消息</div>';
      return;
    }

    chatsWithStickers.forEach(chatInfo => {
      const sizeMB = (chatInfo.totalSize / 1024 / 1024).toFixed(2);
      const item = document.createElement('div');
      item.className = 'clear-posts-item';
      item.dataset.chatId = chatInfo.id;
      item.innerHTML = `
        <img src="${chatInfo.avatar}" class="avatar" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 12px;">
        <div style="flex: 1;">
          <div style="font-weight: 500;">${chatInfo.name}</div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
            ${chatInfo.stickerCount} 条表情消息 (Base64: ${chatInfo.base64Count}条, ${sizeMB} MB)
          </div>
        </div>
      `;
      listEl.appendChild(item);
    });
  }

  async function handleConfirmClearStickers() {
    if (selectedCharsForStickerClear.length === 0) {
      await showCustomAlert('提示', '请先选择要清空表情的角色');
      return;
    }

    const selectedItems = document.querySelectorAll('#clear-stickers-category-list .clear-posts-item.selected');
    const charNames = [];
    selectedItems.forEach(item => {
      const name = item.querySelector('div').textContent.trim();
      charNames.push(name);
    });

    const confirmed = await showCustomConfirm(
      '确认清空',
      `确定要清空以下 ${selectedCharsForStickerClear.length} 个角色的聊天表情包消息吗？\n\n${charNames.join('\n')}\n\n⚠️ 此操作不可恢复！仅删除表情消息，保留文字聊天记录。`,
      { confirmText: '确认清空', cancelText: '取消' }
    );

    if (!confirmed) return;

    try {
      await showCustomAlert('请稍候', '正在清空表情包消息...');

      let totalDeletedMessages = 0;
      let totalFreedSize = 0;

      for (const chatId of selectedCharsForStickerClear) {
        const chat = await db.chats.get(chatId);
        if (!chat || !chat.history) continue;

        const originalLength = chat.history.length;
        let deletedSize = 0;

        // 过滤掉表情消息
        chat.history = chat.history.filter(msg => {
          const isSticker = msg.meaning || msg.type === 'sticker';
          if (isSticker) {
            if (msg.content && msg.content.startsWith('data:image')) {
              deletedSize += msg.content.length;
            }
            return false; // 删除表情消息
          }
          return true; // 保留其他消息
        });

        const deletedCount = originalLength - chat.history.length;
        totalDeletedMessages += deletedCount;
        totalFreedSize += deletedSize;

        await db.chats.put(chat);
        
        // 更新 state
        if (state.chats[chatId]) {
          state.chats[chatId].history = chat.history;
        }
      }

      document.getElementById('clear-stickers-modal').classList.remove('visible');

      const freedMB = (totalFreedSize / 1024 / 1024).toFixed(2);
      await showCustomAlert(
        '清空完成', 
        `已成功删除 ${totalDeletedMessages} 条表情包消息！\n释放了约 ${freedMB} MB 存储空间。`
      );

      // 刷新当前聊天界面
      if (state.activeChatId && selectedCharsForStickerClear.includes(state.activeChatId)) {
        await renderChatScreen();
      }

      // 刷新存储大小显示
      displayTotalImageSize();
    } catch (error) {
      console.error('清空表情包消息时出错:', error);
      await showCustomAlert('清空失败', '操作过程中发生错误，请重试');
    }
  }


  // ========== 清空聊天图片 ==========

  let selectedCharsForImageClear = [];

  function openClearChatImagesModal() {
    const modal = document.getElementById('clear-chat-images-modal');
    selectedCharsForImageClear = [];

    renderClearChatImagesList();
    modal.classList.add('visible');
  }

  async function renderClearChatImagesList() {
    const listEl = document.getElementById('clear-chat-images-list');
    listEl.innerHTML = '';

    const allChats = await db.chats.toArray();
    const chatsWithImages = [];

    // 统计每个角色的图片数量和大小
    for (const chat of allChats) {
      if (chat.isGroup) continue;

      let imageCount = 0;
      let totalSize = 0;

      if (chat.history && Array.isArray(chat.history)) {
        for (const msg of chat.history) {
          // 检查 msg.images 格式（旧格式）
          if (msg.images && Array.isArray(msg.images)) {
            for (const img of msg.images) {
              if (typeof img === 'string' && img.startsWith('data:image')) {
                imageCount++;
                totalSize += img.length;
              }
            }
          }
          // 检查 msg.content 格式（新格式：图片上传）
          if (Array.isArray(msg.content)) {
            for (const item of msg.content) {
              if (item.type === 'image_url' && item.image_url && item.image_url.url) {
                const url = item.image_url.url;
                if (typeof url === 'string' && url.startsWith('data:image')) {
                  imageCount++;
                  totalSize += url.length;
                }
              }
            }
          }
        }
      }

      if (imageCount > 0) {
        chatsWithImages.push({
          id: chat.id,
          name: chat.name,
          imageCount: imageCount,
          totalSize: totalSize
        });
      }
    }

    if (chatsWithImages.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-secondary);">没有找到包含本地图片的聊天角色</p>';
      return;
    }

    // 按图片数量降序排列
    chatsWithImages.sort((a, b) => b.imageCount - a.imageCount);

    chatsWithImages.forEach(chat => {
      const sizeMB = (chat.totalSize / 1024 / 1024).toFixed(2);
      const item = document.createElement('div');
      item.className = 'clear-posts-item';
      item.dataset.charId = chat.id;
      item.innerHTML = `
        <div class="checkbox"></div>
        <div>
          <span class="name">${chat.name}</span>
          <p style="font-size: 12px; color: #888; margin: 4px 0 0;">${chat.imageCount} 张图片，占用 ${sizeMB} MB</p>
        </div>
      `;
      listEl.appendChild(item);
    });
  }

  async function handleConfirmClearChatImages() {
    const selectedItems = document.querySelectorAll('#clear-chat-images-list .clear-posts-item.selected');

    if (selectedItems.length === 0) {
      alert("请至少选择一个角色。");
      return;
    }

    selectedCharsForImageClear = Array.from(selectedItems).map(item => item.dataset.charId);

    const confirmed = await showCustomConfirm(
      '确认清空图片？',
      `即将清空 <strong>${selectedCharsForImageClear.length}</strong> 个角色的所有聊天本地图片。<br><br>此操作不可撤销，建议先导出数据备份。`,
      {
        confirmButtonClass: 'btn-danger',
        confirmText: '确认清空'
      }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", "正在清空图片，请不要关闭页面...");

    try {
      let stats = {
        chatsProcessed: 0,
        imagesCleared: 0,
        sizeFreed: 0
      };

      await db.transaction('rw', db.chats, async () => {
        for (const chatId of selectedCharsForImageClear) {
          const chat = await db.chats.get(chatId);
          if (!chat) continue;

          if (chat.history && Array.isArray(chat.history)) {
            for (const msg of chat.history) {
              // 清空 msg.images 格式（旧格式）
              if (msg.images && Array.isArray(msg.images)) {
                for (const img of msg.images) {
                  if (typeof img === 'string' && img.startsWith('data:image')) {
                    stats.imagesCleared++;
                    stats.sizeFreed += img.length;
                  }
                }
                msg.images = [];
              }
              // 清空 msg.content 中的图片（新格式）
              if (Array.isArray(msg.content)) {
                const newContent = [];
                for (const item of msg.content) {
                  if (item.type === 'image_url' && item.image_url && item.image_url.url) {
                    const url = item.image_url.url;
                    if (typeof url === 'string' && url.startsWith('data:image')) {
                      stats.imagesCleared++;
                      stats.sizeFreed += url.length;
                      // 不添加到 newContent，即删除该图片
                    } else {
                      newContent.push(item);
                    }
                  } else {
                    newContent.push(item);
                  }
                }
                msg.content = newContent;
              }
            }
          }

          await db.chats.put(chat);
          stats.chatsProcessed++;
        }
      });

      const freedMB = (stats.sizeFreed / 1024 / 1024).toFixed(2);

      document.getElementById('clear-chat-images-modal').classList.remove('visible');

      // 清空成功，询问用户是否刷新页面
      const shouldRefresh = await showCustomConfirm(
        '清空完成',
        `已成功清空 ${stats.chatsProcessed} 个角色的聊天图片。<br>
        清空了 ${stats.imagesCleared} 张图片<br>
        释放了 <strong>${freedMB} MB</strong> 空间<br><br>
        是否立即刷新页面以使更改生效？<br>
        <span style="color: #666; font-size: 14px;">（点击"取消"可以继续进行其他操作）</span>`,
        {
          confirmText: '立即刷新',
          cancelText: '稍后刷新'
        }
      );

      if (shouldRefresh) {
        // 用户选择刷新页面
        location.reload();
      } else {
        // 用户选择不刷新，尝试局部刷新
        if (state.currentChatId && selectedCharsForImageClear.includes(state.currentChatId)) {
          await loadChat(state.currentChatId);
        }
      }

    } catch (error) {
      console.error("清空图片时出错:", error);
      await showCustomAlert('清空失败', `操作失败: ${error.message}`);
    }
  }


  // ========== 清空聊天HTML ==========

  let selectedChatsForHtmlClear = [];

  function isRawHtmlContent(content) {
    if (typeof content !== 'string') return false;
    const trimmed = content.trim();
    return trimmed.startsWith('<') && trimmed.endsWith('>');
  }

  function stripHtmlTags(html) {
    if (typeof html !== 'string') return html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  }

  function openClearChatHtmlModal() {
    const modal = document.getElementById('clear-chat-html-modal');
    selectedChatsForHtmlClear = [];
    document.getElementById('select-all-chats-for-html-clear').checked = false;
    
    renderClearChatHtmlList();
    modal.classList.add('visible');
  }

  async function renderClearChatHtmlList() {
    const listEl = document.getElementById('clear-chat-html-list');
    listEl.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--text-secondary);">正在扫描...</p>';

    const allChats = await db.chats.toArray();
    const chatsWithHtml = [];

    for (const chat of allChats) {
      let htmlMsgCount = 0;

      if (chat.history && Array.isArray(chat.history)) {
        for (const msg of chat.history) {
          if (isRawHtmlContent(msg.content)) {
            htmlMsgCount++;
          }
        }
      }

      if (htmlMsgCount > 0) {
        chatsWithHtml.push({
          id: chat.id,
          name: chat.name,
          isGroup: chat.isGroup || false,
          htmlMsgCount: htmlMsgCount
        });
      }
    }

    if (chatsWithHtml.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-secondary);">没有找到包含HTML内容的聊天</p>';
      return;
    }

    chatsWithHtml.sort((a, b) => b.htmlMsgCount - a.htmlMsgCount);

    listEl.innerHTML = '';
    chatsWithHtml.forEach(chat => {
      const typeLabel = chat.isGroup ? '群聊' : '单聊';
      const item = document.createElement('div');
      item.className = 'clear-posts-item';
      item.dataset.chatId = chat.id;
      item.innerHTML = `
        <div class="checkbox"></div>
        <div>
          <span class="name">${chat.name}</span>
          <p style="font-size: 12px; color: #888; margin: 4px 0 0;">${typeLabel} · ${chat.htmlMsgCount} 条HTML消息</p>
        </div>
      `;
      item.addEventListener('click', () => {
        item.classList.toggle('selected');
        updateHtmlClearSelection();
      });
      listEl.appendChild(item);
    });
  }

  function updateHtmlClearSelection() {
    const allItems = document.querySelectorAll('#clear-chat-html-list .clear-posts-item');
    const selectedItems = document.querySelectorAll('#clear-chat-html-list .clear-posts-item.selected');
    document.getElementById('select-all-chats-for-html-clear').checked = allItems.length > 0 && allItems.length === selectedItems.length;
  }

  async function handleConfirmClearChatHtml() {
    const selectedItems = document.querySelectorAll('#clear-chat-html-list .clear-posts-item.selected');

    if (selectedItems.length === 0) {
      alert("请至少选择一个聊天。");
      return;
    }

    selectedChatsForHtmlClear = Array.from(selectedItems).map(item => item.dataset.chatId);
    
    const clearMode = document.querySelector('input[name="html-clear-mode"]:checked').value;
    const modeText = clearMode === 'strip' ? '剥离HTML标签（保留文本）' : '直接删除消息';

    const confirmed = await showCustomConfirm(
      '确认清空HTML？',
      `即将处理 <strong>${selectedChatsForHtmlClear.length}</strong> 个聊天的HTML内容。<br><br>
      清理模式：<strong>${modeText}</strong><br><br>
      此操作不可撤销，建议先导出数据备份。`,
      {
        confirmButtonClass: 'btn-danger',
        confirmText: '确认清空'
      }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", "正在清空HTML内容，请不要关闭页面...");

    try {
      let stats = {
        chatsProcessed: 0,
        msgsProcessed: 0,
        msgsDeleted: 0
      };

      await db.transaction('rw', db.chats, async () => {
        for (const chatId of selectedChatsForHtmlClear) {
          const chat = await db.chats.get(chatId);
          if (!chat) continue;

          if (chat.history && Array.isArray(chat.history)) {
            if (clearMode === 'delete') {
              const originalLength = chat.history.length;
              chat.history = chat.history.filter(msg => {
                if (isRawHtmlContent(msg.content)) {
                  stats.msgsDeleted++;
                  return false;
                }
                return true;
              });
              stats.msgsProcessed += (originalLength - chat.history.length);
            } else {
              for (const msg of chat.history) {
                if (isRawHtmlContent(msg.content)) {
                  msg.content = stripHtmlTags(msg.content);
                  stats.msgsProcessed++;
                }
              }
            }
          }

          await db.chats.put(chat);
          stats.chatsProcessed++;
        }
      });

      document.getElementById('clear-chat-html-modal').classList.remove('visible');

      const resultText = clearMode === 'delete' 
        ? `删除了 ${stats.msgsDeleted} 条HTML消息`
        : `处理了 ${stats.msgsProcessed} 条HTML消息（已剥离标签）`;

      const shouldRefresh = await showCustomConfirm(
        '清空完成',
        `已成功处理 ${stats.chatsProcessed} 个聊天的HTML内容。<br>
        ${resultText}<br><br>
        是否立即刷新页面以使更改生效？<br>
        <span style="color: #666; font-size: 14px;">（点击"取消"可以继续进行其他操作）</span>`,
        {
          confirmText: '立即刷新',
          cancelText: '稍后刷新'
        }
      );

      if (shouldRefresh) {
        location.reload();
      } else {
        if (state.currentChatId && selectedChatsForHtmlClear.includes(state.currentChatId)) {
          await loadChat(state.currentChatId);
        }
      }

    } catch (error) {
      console.error("清空HTML时出错:", error);
      await showCustomAlert('清空失败', `操作失败: ${error.message}`);
    }
  }


  // ========== 图片压缩辅助函数 ==========

  function calculateSkippedStats(obj) {
    let found = 0;
    let size = 0;
    if (typeof obj !== 'object' || obj === null) return {
      found,
      size
    };

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (typeof value === 'string' && value.startsWith('data:image')) {
          found++;
          size += value.length;
        } else if (typeof value === 'object' && value !== null) {
          const nestedStats = calculateSkippedStats(value);
          found += nestedStats.found;
          size += nestedStats.size;
        }
      }
    }
    return {
      found,
      size
    };
  }

  async function traverseAndCompress(obj, stats, parentKey = '') {

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {


        if (parentKey === '' && (key === 'widgetData' || key === 'appIcons' || key === 'cphoneAppIcons' || key === 'myphoneAppIcons')) {
          console.log(`跳过压缩整个对象: ${key}`);
          const {
            found,
            size
          } = calculateSkippedStats(obj[key]);
          stats.found += found;
          stats.skipped += found;
          stats.originalSize += size;
          stats.newSize += size;
          continue;
        }

        const value = obj[key];


        if (typeof value === 'string' && value.startsWith('data:image')) {


          const isExcluded =

            (parentKey === '' && (key === 'wallpaper' || key === 'cphoneWallpaper' || key === 'globalChatBackground')) ||

            (parentKey === 'settings' && key === 'background');

          if (isExcluded) {
            console.log(`跳过压缩背景图片: ${parentKey || 'global'}.${key}`);
            stats.found++;
            stats.skipped++;
            stats.originalSize += value.length;
            stats.newSize += value.length;
            continue;
          }

          stats.found++;
          stats.originalSize += value.length;

          const compressedBase64 = await compressImage(value);
          if (compressedBase64 && compressedBase64 !== value) {
            obj[key] = compressedBase64;
            stats.compressed++;
            stats.newSize += compressedBase64.length;
          } else {
            stats.skipped++;
            stats.newSize += value.length;
          }


        } else if (typeof value === 'object' && value !== null) {

          await traverseAndCompress(value, stats, key);
        }
      }
    }
  }


  async function compressImage(base64Str) {

    if (!base64Str.startsWith('data:image')) {
      return base64Str;
    }


    const MAX_BASE64_SIZE_TO_SKIP = 500000;
    if (base64Str.startsWith('data:image/jpeg') && base64Str.length < MAX_BASE64_SIZE_TO_SKIP) {
      console.log('跳过压缩：图片已经是小体积JPEG。');
      return base64Str;
    }

    try {

      const imageBlob = await (await fetch(base64Str)).blob();


      const SIZE_THRESHOLD_BYTES = 0.3 * 1024 * 1024;
      if (imageBlob.size < SIZE_THRESHOLD_BYTES) {
        console.log(`跳过压缩：图片大小 (${(imageBlob.size / 1024 / 1024).toFixed(2)} MB) 已小于 0.3 MB。`);
        return base64Str;
      }



      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 800,
        useWebWorker: true,
        initialQuality: 0.5,
        fileType: 'image/jpeg'
      };



      console.log(`开始压缩图片，原始大小: ${(imageBlob.size / 1024 / 1024).toFixed(2)} MB`);
      const compressedFile = await imageCompression(imageBlob, options);
      console.log(`压缩完成，新的大小: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);


      if (compressedFile.size > imageBlob.size) {
        console.warn("压缩后的图片体积增大，已保留原始图片。");
        return base64Str;
      }


      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(compressedFile);
      });

    } catch (error) {
      console.error("使用 browser-image-compression 压缩失败:", error);
      return base64Str;
    }
  }


  // ========== 更新检查 ==========

  function compareVersions(v1, v2) {

    if (!v1 || !v2 || typeof v1 !== 'string' || typeof v2 !== 'string') {
      return 0;
    }

    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    const len = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < len; i++) {
      const p1 = parts1[i] || 0; // 如果部分不存在，则视为 0
      const p2 = parts2[i] || 0;

      if (p1 > p2) {
        return 1;
      }
      if (p1 < p2) {
        return -1;
      }
    }
    return 0;
  }


  async function checkForUpdates() {



    const CURRENT_APP_VERSION = "1.0";

    try {

      const response = await fetch('update-notice.html?_=' + Date.now());
      if (!response.ok) {
        console.warn('获取更新通知文件失败。');
        return;
      }
      const noticeHtml = await response.text();


      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = noticeHtml;
      const noticeContent = tempDiv.querySelector('[data-version]');

      if (!noticeContent) {
        console.error('更新通知文件中缺少 data-version 属性。');
        return;
      }

      const notificationVersion = noticeContent.dataset.version;


      const dismissedVersion = localStorage.getItem('dismissedUpdateVersion');



      if (!dismissedVersion || compareVersions(notificationVersion, dismissedVersion) > 0) {
        console.log(`发现新版本通知: ${notificationVersion} (已忽略版本: ${dismissedVersion || '无'})`);
        showUpdateNotice(notificationVersion, noticeContent.innerHTML);
      } else {
        console.log(`当前通知版本 (${notificationVersion}) 已被用户忽略或为旧版本，无需显示。`);
      }

    } catch (error) {
      console.error('检查更新时出错:', error);
    }
  }


  function showUpdateNotice(version, contentHtml) {
    const modal = document.getElementById('update-notice-modal');
    const body = document.getElementById('update-notice-body');
    const confirmBtn = document.getElementById('update-notice-confirm-btn');
    const dismissBtn = document.getElementById('update-notice-dismiss-btn');

    body.innerHTML = contentHtml;


    confirmBtn.disabled = true;
    dismissBtn.disabled = true;


    const confirmOriginalText = confirmBtn.textContent;
    let countdown = 10;
    confirmBtn.textContent = `${confirmOriginalText} (${countdown}s)`;


    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {

        confirmBtn.textContent = `${confirmOriginalText} (${countdown}s)`;
      } else {

        clearInterval(countdownInterval);
        confirmBtn.disabled = false;
        dismissBtn.disabled = false;
        confirmBtn.textContent = confirmOriginalText;
      }
    }, 1000);


    confirmBtn.onclick = () => {
      clearInterval(countdownInterval);
      modal.classList.remove('visible');
      confirmBtn.textContent = confirmOriginalText;
    };

    dismissBtn.onclick = () => {
      clearInterval(countdownInterval);
      localStorage.setItem('dismissedUpdateVersion', version);
      modal.classList.remove('visible');
      console.log(`用户已忽略版本: ${version}`);
      confirmBtn.textContent = confirmOriginalText;
    };



    modal.classList.add('visible');
  }


  // ========== 数据检查与修复 ==========

  async function checkAndFixData() {
    const confirmed = await showCustomConfirm(
      '确认操作',
      '此功能将扫描数据库，尝试找出并修复"角色在数据库中存在，但未在聊天列表显示"的问题。<br><br><strong>操作通常是安全的，但仍建议在操作前备份数据。</strong>', {
      confirmText: '开始检查'
    }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", "正在扫描和修复数据...");

    try {
      const chatsFromDB = await db.chats.toArray();
      let fixedCount = 0;

      for (const chat of chatsFromDB) {
        let isModified = false;


        if (!Array.isArray(chat.history)) {
          chat.history = [];
          isModified = true;
        }

        if (typeof chat.settings !== 'object' || chat.settings === null) {
          chat.settings = {};
          isModified = true;
        }

        if (!chat.isGroup && !chat.originalName) {
          chat.originalName = chat.name;
          isModified = true;
        }

        if (typeof chat.unreadCount === 'undefined') {
          chat.unreadCount = 0;
          isModified = true;
        }

        if (!Array.isArray(chat.longTermMemory)) {
          chat.longTermMemory = [];
          isModified = true;
        }



        if (isModified) {
          fixedCount++;
          console.log(`修复了角色 "${chat.name}" (ID: ${chat.id}) 的残缺数据。`);
          await db.chats.put(chat);
        }


        state.chats[chat.id] = chat;
      }

      if (fixedCount > 0) {
        await showCustomAlert(
          '修复完成！',
          `成功检查并修复了 ${fixedCount} 个角色的数据问题！\n\n聊天列表已为您刷新。`
        );

        await renderChatList();
      } else {
        await showCustomAlert('检查完成', '未发现任何需要修复的数据问题。');
      }

    } catch (error) {
      console.error("数据检查与修复失败:", error);
      await showCustomAlert('操作失败', `执行检查时发生错误: ${error.message}`);
    }
  }

  // ========== 世界书删除 ==========

  async function openWorldBookDeletionModal() {
    const modal = document.getElementById('delete-world-books-modal');
    const listEl = document.getElementById('delete-world-books-list');
    const selectAllCheckbox = document.getElementById('select-all-world-books-for-clear');
    listEl.innerHTML = '';
    selectAllCheckbox.checked = false;

    const books = await db.worldBooks.toArray();

    if (books.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">没有可以删除的世界书。</p>';
    } else {
      books.forEach(book => {
        const item = document.createElement('div');
        item.className = 'clear-posts-item';
        item.dataset.bookId = book.id;
        item.innerHTML = `
                <div class="checkbox"></div>
                <span class="name">${book.name}</span>
            `;
        listEl.appendChild(item);
      });
    }

    modal.classList.add('visible');
  }


  async function handleConfirmWorldBookDeletion() {
    const selectedItems = document.querySelectorAll('#delete-world-books-list .clear-posts-item.selected');
    if (selectedItems.length === 0) {
      alert("请至少选择一个要删除的世界书。");
      return;
    }

    const idsToDelete = Array.from(selectedItems).map(item => item.dataset.bookId);

    const confirmed = await showCustomConfirm(
      '最后确认！',
      `此操作将永久删除您选择的 ${selectedItems.length} 本世界书，并解除它们与所有角色的关联。此操作【不可恢复】！`, {
      confirmButtonClass: 'btn-danger',
      confirmText: '确认删除'
    }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", "正在执行删除操作...");

    try {
      await db.transaction('rw', db.worldBooks, db.chats, async () => {

        await db.worldBooks.bulkDelete(idsToDelete);


        const allChats = await db.chats.toArray();
        for (const chat of allChats) {
          if (chat.settings && Array.isArray(chat.settings.linkedWorldBookIds)) {
            const originalCount = chat.settings.linkedWorldBookIds.length;

            chat.settings.linkedWorldBookIds = chat.settings.linkedWorldBookIds.filter(id => !idsToDelete.includes(id));


            if (chat.settings.linkedWorldBookIds.length < originalCount) {
              await db.chats.put(chat);
            }
          }
        }
      });


      state.worldBooks = state.worldBooks.filter(book => !idsToDelete.includes(book.id));

      document.getElementById('delete-world-books-modal').classList.remove('visible');
      await showCustomAlert("删除成功", `${selectedItems.length} 本世界书已成功删除。`);

    } catch (error) {
      console.error("删除世界书失败:", error);
      await showCustomAlert("删除失败", `操作失败: ${error.message}`);
    }
  }


// ========== 世界书渲染与编辑（从 script.js 补充拆分） ==========

  function switchWorldBookCategory(categoryId) {

    document.querySelectorAll('.world-book-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.categoryId === categoryId);
    });

    document.querySelectorAll('.world-book-category-pane').forEach(pane => {
      pane.classList.toggle('active', pane.dataset.categoryId === categoryId);
    });
  }


  async function renderWorldBookScreen() {
    const tabsContainer = document.getElementById('world-book-tabs');
    const contentContainer = document.getElementById('world-book-content-container');
    tabsContainer.innerHTML = '';
    contentContainer.innerHTML = '';


    const [books, categories] = await Promise.all([
      db.worldBooks.toArray(),
      db.worldBookCategories.orderBy('name').toArray()
    ]);

    state.worldBooks = books;

    if (books.length === 0) {
      contentContainer.innerHTML = '<p style="text-align:center; color: #8a8a8a; margin-top: 50px;">点击右上角 "+" 创建你的第一本世界书</p>';
      return;
    }


    const allTab = document.createElement('button');
    allTab.className = 'world-book-tab active';
    allTab.textContent = '全部';
    allTab.dataset.categoryId = 'all';
    tabsContainer.appendChild(allTab);

    const allPane = document.createElement('div');
    allPane.className = 'world-book-category-pane active';
    allPane.dataset.categoryId = 'all';
    contentContainer.appendChild(allPane);


    categories.forEach(category => {
      const categoryTab = document.createElement('button');
      categoryTab.className = 'world-book-tab';
      categoryTab.textContent = category.name;
      categoryTab.dataset.categoryId = String(category.id);
      tabsContainer.appendChild(categoryTab);

      const categoryPane = document.createElement('div');
      categoryPane.className = 'world-book-category-pane';
      categoryPane.dataset.categoryId = String(category.id);
      contentContainer.appendChild(categoryPane);
    });


    const hasUncategorized = books.some(book => !book.categoryId);
    if (hasUncategorized) {
      const uncategorizedTab = document.createElement('button');
      uncategorizedTab.className = 'world-book-tab';
      uncategorizedTab.textContent = '未分类';
      uncategorizedTab.dataset.categoryId = 'uncategorized';
      tabsContainer.appendChild(uncategorizedTab);

      const uncategorizedPane = document.createElement('div');
      uncategorizedPane.className = 'world-book-category-pane';
      uncategorizedPane.dataset.categoryId = 'uncategorized';
      contentContainer.appendChild(uncategorizedPane);
    }


    books.forEach(book => {
      let contentPreview = '暂无内容...';
      if (Array.isArray(book.content) && book.content.length > 0) {
        const firstEntry = book.content[0];
        contentPreview = firstEntry.comment || firstEntry.content || '';
      } else if (typeof book.content === 'string' && book.content.trim() !== '') {
        contentPreview = book.content;
      }

      const card = document.createElement('div');
      card.className = 'world-book-card';
      card.innerHTML = `
                    <div class="card-title">${book.name}</div>
                    <div class="card-content-preview">${contentPreview}</div>
                `;


      const cardClickHandler = () => openWorldBookEditor(book.id);
      const cardLongPressHandler = async () => {
        const confirmed = await showCustomConfirm('删除世界书', `确定要删除《${book.name}》吗？`, {
          confirmButtonClass: 'btn-danger'
        });
        if (confirmed) {
          await db.worldBooks.delete(book.id);
          state.worldBooks = state.worldBooks.filter(wb => wb.id !== book.id);
          renderWorldBookScreen();
        }
      };

      card.addEventListener('click', cardClickHandler);
      addLongPressListener(card, cardLongPressHandler);


      const clonedCardForAll = card.cloneNode(true);
      clonedCardForAll.addEventListener('click', cardClickHandler);
      addLongPressListener(clonedCardForAll, cardLongPressHandler);
      allPane.appendChild(clonedCardForAll);


      const categoryKey = book.categoryId ? String(book.categoryId) : 'uncategorized';
      const targetPane = contentContainer.querySelector(`.world-book-category-pane[data-category-id="${categoryKey}"]`);
      if (targetPane) {
        targetPane.appendChild(card);
      }
    });


    document.querySelectorAll('.world-book-tab').forEach(tab => {
      tab.addEventListener('click', () => switchWorldBookCategory(tab.dataset.categoryId));
    });
  }



  function createWorldBookGroup(groupName, books) {
    const groupContainer = document.createElement('div');
    groupContainer.className = 'world-book-group-container';

    groupContainer.innerHTML = `
                <div class="world-book-group-header">
                    <span class="arrow">▼</span>
                    <span class="group-name">${groupName}</span>
                </div>
                <div class="world-book-group-content"></div>
            `;

    const contentEl = groupContainer.querySelector('.world-book-group-content');
    books.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    books.forEach(book => {

      let contentPreview = '暂无内容...';


      if (Array.isArray(book.content) && book.content.length > 0) {


        const firstEntry = book.content[0];
        contentPreview = firstEntry.comment || firstEntry.content || '';
      } else if (typeof book.content === 'string' && book.content.trim() !== '') {

        contentPreview = book.content;
      }


      const item = document.createElement('div');
      item.className = 'list-item';
      item.dataset.bookId = book.id;

      item.innerHTML = `
                    <div class="item-title">${book.name}</div>
                    <div class="item-content">${String(contentPreview).substring(0, 50)}</div>
                `;
      item.addEventListener('click', () => openWorldBookEditor(book.id));
      addLongPressListener(item, async () => {
        const confirmed = await showCustomConfirm('删除世界书', `确定要删除《${book.name}》吗？此操作不可撤销。`, {
          confirmButtonClass: 'btn-danger'
        });
        if (confirmed) {
          await db.worldBooks.delete(book.id);
          state.worldBooks = state.worldBooks.filter(wb => wb.id !== book.id);
          renderWorldBookScreen();
        }
      });
      contentEl.appendChild(item);
    });

    return groupContainer;
  }


  async function openWorldBookEditor(bookId) {


    showScreen('world-book-editor-screen');

    window.editingWorldBookId = bookId;
    const [book, categories] = await Promise.all([
      db.worldBooks.get(bookId),
      db.worldBookCategories.toArray()
    ]);


    if (!book) {
      console.error("尝试打开一个不存在的世界书，ID:", bookId);
      showScreen('world-book-screen');
      return;
    }


    document.getElementById('world-book-editor-title').textContent = book.name;
    document.getElementById('world-book-name-input').value = book.name;


    const selectEl = document.getElementById('world-book-category-select');
    selectEl.innerHTML = '<option value="">-- 未分类 --</option>';
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = cat.name;
      if (book.categoryId === cat.id) option.selected = true;
      selectEl.appendChild(option);
    });

    // 设置全局开关状态（默认为关闭）
    const globalSwitch = document.getElementById('world-book-global-switch');
    if (globalSwitch) {
      globalSwitch.checked = book.isGlobal === true;
    }

    // 设置注入位置的值（默认为'before'）
    const injectPositionSelect = document.getElementById('world-book-inject-position-select');
    if (injectPositionSelect) {
      injectPositionSelect.value = book.injectPosition || 'before';
    }


    const entriesContainer = document.getElementById('world-book-entries-container');
    entriesContainer.innerHTML = '';

    if (Array.isArray(book.content) && book.content.length > 0) {
      book.content.forEach(entry => {
        const block = createWorldBookEntryBlock(entry);
        entriesContainer.appendChild(block);
      });
    } else {
      entriesContainer.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 20px;">还没有内容，点击下方按钮添加第一条吧！</p>';
    }


  }


  function createWorldBookEntryBlock(entry = {
    keys: [],
    comment: '',
    content: '',
    enabled: true
  }) {
    const block = document.createElement('div');

    block.className = 'message-editor-block';


    const isChecked = entry.enabled !== false ? 'checked' : '';

    block.innerHTML = `
                <div style="display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-bottom: 5px;">
                    <label class="toggle-switch" title="启用/禁用此条目">
                        <input type="checkbox" class="entry-enabled-switch" ${isChecked}>
                        <span class="slider"></span>
                    </label>
                    <button class="delete-block-btn" title="删除此条目">×</button>
                </div>
                <div class="form-group" style="margin-bottom: 10px;">
                    <label style="font-size: 0.8em;">备注 (可选)</label>
                    <input type="text" class="entry-comment-input" value="${entry.comment || ''}" placeholder="例如：关于角色的童年" style="padding: 8px;">
                </div>
                <div class="form-group" style="margin-bottom: 10px;">
                    <label style="font-size: 0.8em;">关键词 (用英文逗号,分隔)</label>
                    <input type="text" class="entry-keys-input" value="${(entry.keys || []).join(', ')}" placeholder="例如: key1, key2, key3" style="padding: 8px;">
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-size: 0.8em;">内容</label>
                    <textarea class="entry-content-textarea" rows="5" style="width: 100%; font-size: 14px;">${entry.content || ''}</textarea>
                </div>
            `;


    block.querySelector('.delete-block-btn').addEventListener('click', () => {
      block.remove();
    });

    return block;
  }


// ========== 钱包与基金初始化（从 script.js 补充拆分） ==========

  if (typeof window.userBalance === 'undefined') window.userBalance = 0;

  async function initUserWallet() {
    try {
      let wallet = await db.userWallet.get('main');

      // 如果没有钱包，或者余额变成了 NaN/null/undefined，强制修复
      if (!wallet || typeof wallet.balance !== 'number' || isNaN(wallet.balance)) {
        console.warn("检测到钱包数据异常 (NaN 或 不存在)，正在重置...");

        // 尝试保留旧的亲属卡数据，只重置余额
        const oldKinship = (wallet && wallet.kinshipCards) ? wallet.kinshipCards : [];

        wallet = {
          id: 'main',
          balance: 0, // 强制重置为 0
          kinshipCards: oldKinship,
          lastResetMonth: ''
        };

        await db.userWallet.put(wallet);
        window.userBalance = 0;
      } else {
        // 数据正常，读取余额
        window.userBalance = wallet.balance;

        // 补全可能缺失的字段
        if (!wallet.kinshipCards) {
          wallet.kinshipCards = [];
          await db.userWallet.put(wallet);
        }
      }

      // 每月自动重置亲属卡额度逻辑 (保持不变)
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
      if (wallet.lastResetMonth !== currentMonthKey) {
        if (wallet.kinshipCards && wallet.kinshipCards.length > 0) {
          wallet.kinshipCards.forEach(card => { card.spent = 0; });
          await db.userWallet.put(wallet);
        }
        wallet.lastResetMonth = currentMonthKey;
        await db.userWallet.put(wallet);
      }

      console.log("用户钱包初始化完成，当前余额:", window.userBalance);

      // 立即更新界面上的显示（如果正在显示的话）
      const displayEl = document.getElementById('alipay-balance-display');
      if (displayEl) displayEl.textContent = window.userBalance.toFixed(2);

    } catch (e) {
      console.error("初始化钱包失败:", e);
      window.userBalance = 0;
    }
  }

  // 初始化基金数据
  async function initFunds() {
    const count = await db.funds.count();
    if (count === 0) {
      const initialFunds = [
        { id: 'f01', code: '001001', name: '招财进宝混合', riskLevel: 'medium', currentNav: 1.520, lastDayNav: 1.510, history: [] },
        { id: 'f02', code: '002088', name: '科技先锋成长', riskLevel: 'high', currentNav: 2.305, lastDayNav: 2.280, history: [] },
        { id: 'f03', code: '003099', name: '稳健债基A', riskLevel: 'low', currentNav: 1.050, lastDayNav: 1.049, history: [] },
        { id: 'f04', code: '005666', name: '新能源精选', riskLevel: 'high', currentNav: 3.100, lastDayNav: 3.200, history: [] },
        { id: 'f05', code: '008888', name: '消费红利指数', riskLevel: 'medium', currentNav: 1.880, lastDayNav: 1.885, history: [] },
        { id: 'f06', code: '110022', name: '全球医疗医药', riskLevel: 'high', currentNav: 0.950, lastDayNav: 0.940, history: [] }
      ];
      await db.funds.bulkAdd(initialFunds);
    }
    // 补全钱包字段
    const wallet = await db.userWallet.get('main');
    if (wallet && !wallet.fundHoldings) {
      wallet.fundHoldings = [];
      await db.userWallet.put(wallet);
    }
  }

// ========== 钱包交易处理（从 script.js 补充拆分，原第 60109~60165 行） ==========

  async function processTransaction(amount, type, description) {
    let safeAmount = parseFloat(amount);
    if (isNaN(safeAmount) || safeAmount <= 0) {
      console.error("记账失败：金额无效", amount);
      return false;
    }

    try {
      let wallet = await db.userWallet.get('main');
      if (!wallet) {
        wallet = { id: 'main', balance: 0, kinshipCards: [] };
      }

      if (typeof wallet.balance !== 'number') wallet.balance = 0;

      if (type === 'expense') {
        if (wallet.balance < safeAmount) {
          await showCustomAlert("支付失败", `余额不足！当前: ${wallet.balance.toFixed(2)}`);
          return false;
        }
        wallet.balance -= safeAmount;
      } else if (type === 'income') {
        wallet.balance += safeAmount;
      }

      await db.userWallet.put(wallet);
      window.userBalance = wallet.balance;

      const transaction = {
        timestamp: Date.now(),
        type: type,
        amount: safeAmount,
        description: description || '未知交易'
      };
      await db.userTransactions.add(transaction);

      console.log(`✅ [钱包] 交易成功: ${type} ¥${safeAmount.toFixed(2)}. 新余额: ${wallet.balance.toFixed(2)}`);
      return true;

    } catch (e) {
      console.error("写入钱包数据库失败:", e);
      alert("系统错误：账单写入失败，请检查控制台。");
      return false;
    }
  }

  // ========== 全局暴露 ==========
  window.openDataClearWizard = openDataClearWizard;
  window.openWorldBookDeletionModal = openWorldBookDeletionModal;
  window.openWorldBookEditor = openWorldBookEditor;
  window.handleDataClearBack = handleDataClearBack;
  window.handleDataClearNext = handleDataClearNext;
  window.handleConfirmDataClear = handleConfirmDataClear;
  window.handleConfirmWorldBookDeletion = handleConfirmWorldBookDeletion;
  window.checkForUpdates = checkForUpdates;
  window.checkAndFixData = checkAndFixData;
  window.cleanupRedundantData = cleanupRedundantData;
  window.compressAllLocalImages = compressAllLocalImages;
  window.applyCustomFont = applyCustomFont;
  window.initUserWallet = initUserWallet;
  window.initFunds = initFunds;

  // ========== 从 script.js 迁移：handleFactoryReset ==========
  async function handleFactoryReset() {
    const confirmed = await showCustomConfirm(
      "☠️ 严重警告：初始化应用",
      "此操作将【永久删除】本地存储的所有数据，包括：\n\n❌ 所有聊天记录和设定\n❌ 所有图片、表情包、预设\n❌ 所有API配置和外观设置\n❌ 所有联机数据（好友、服务器、头像）\n\n应用将变回刚安装时的样子。数据一旦删除无法恢复！\n\n确定要继续吗？",
      { confirmButtonClass: 'btn-danger', confirmText: '我明白，继续' }
    );
    if (!confirmed) return;

    const verificationText = "立即重置";
    const userInput = await showCustomPrompt(
      "最终确认",
      `为了确认这不是误操作，请在下方框中准确输入"${verificationText}"四个字：`,
      "", "text"
    );
    if (userInput !== verificationText) {
      await showCustomAlert("操作取消", "验证文字输入错误，初始化已取消。");
      return;
    }

    await showCustomAlert("正在重置...", "正在销毁所有数据，应用即将重启...");

    try {
      if (typeof onlineChatManager !== 'undefined' && onlineChatManager) {
        onlineChatManager.shouldAutoReconnect = false;
        if (onlineChatManager.isConnected && onlineChatManager.ws) {
          onlineChatManager.ws.close();
          onlineChatManager.ws = null;
          onlineChatManager.isConnected = false;
        }
        if (onlineChatManager.reconnectTimer) {
          clearTimeout(onlineChatManager.reconnectTimer);
          onlineChatManager.reconnectTimer = null;
        }
        if (onlineChatManager.heartbeatTimer) {
          clearInterval(onlineChatManager.heartbeatTimer);
          onlineChatManager.heartbeatTimer = null;
        }
      }

      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
          await table.clear();
        }
      });

      localStorage.clear();

      setTimeout(() => {
        window.location.reload(true);
      }, 1000);

    } catch (error) {
      console.error("初始化失败:", error);
      await showCustomAlert("错误", `重置过程中发生错误: ${error.message}\n请尝试手动清除浏览器缓存。`);
    }
  }
  window.handleFactoryReset = handleFactoryReset;

  // ========== 从 script.js 迁移：记忆管理函数 ==========
  async function handleAddManualMemory() {
    const chat = state.chats[state.activeChatId];
    if (!chat) return;
    let targetChatForMemory = chat;
    if (chat.isGroup) {
      const memberOptions = chat.members.map(member => ({
        text: `为"${member.groupNickname}"添加记忆`,
        value: member.id
      }));
      const selectedMemberId = await showChoiceModal('选择记忆所属角色', memberOptions);
      if (!selectedMemberId) return;
      targetChatForMemory = state.chats[selectedMemberId];
      if (!targetChatForMemory) {
        alert("错误：找不到该成员的个人档案。");
        return;
      }
    }
    const content = await showCustomPrompt(`为"${targetChatForMemory.name}"添加记忆`, '请输入要添加的记忆要点：', '', 'textarea');
    if (content && content.trim()) {
      if (!targetChatForMemory.longTermMemory) targetChatForMemory.longTermMemory = [];
      targetChatForMemory.longTermMemory.push({
        content: content.trim(),
        timestamp: Date.now(),
        source: 'manual'
      });
      await db.chats.put(targetChatForMemory);
      renderLongTermMemoryList();
    }
  }

  async function handleEditMemory(authorChatId, memoryTimestamp) {
    const authorChat = state.chats[authorChatId];
    if (!authorChat || !authorChat.longTermMemory) return;
    const memoryIndex = authorChat.longTermMemory.findIndex(m => m.timestamp === memoryTimestamp);
    if (memoryIndex === -1) return;
    const memory = authorChat.longTermMemory[memoryIndex];
    const newContent = await showCustomPrompt('编辑记忆', '请修改记忆要点：', memory.content, 'textarea');
    if (newContent && newContent.trim()) {
      memory.content = newContent.trim();
      await db.chats.put(authorChat);
      renderLongTermMemoryList();
    }
  }

  async function handleDeleteMemory(authorChatId, memoryTimestamp) {
    const confirmed = await showCustomConfirm('确认删除', '确定要删除这条长期记忆吗？', {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      const authorChat = state.chats[authorChatId];
      if (!authorChat || !authorChat.longTermMemory) return;
      authorChat.longTermMemory = authorChat.longTermMemory.filter(m => m.timestamp !== memoryTimestamp);
      await db.chats.put(authorChat);
      renderLongTermMemoryList();
    }
  }

  window.handleAddManualMemory = handleAddManualMemory;
  window.handleEditMemory = handleEditMemory;
  window.handleDeleteMemory = handleDeleteMemory;

  // ========== 从 script.js 迁移：convertLongTermMemoryToStructured ==========
  async function convertLongTermMemoryToStructured(chatId) {
    const chat = state.chats[chatId];
    if (!chat || !window.structuredMemoryManager || !chat.longTermMemory || chat.longTermMemory.length === 0) {
      showToast('没有可转换的长期记忆', 'warning');
      return;
    }

    const totalMemories = chat.longTermMemory.length;
    const BATCH_SIZE = 50;
    const totalBatches = Math.ceil(totalMemories / BATCH_SIZE);

    const estimatedTotalTokens = chat.longTermMemory.reduce((sum, mem) => sum + mem.content.length, 0) / 1.5;

    let shouldProceed = true;
    if (totalMemories > 100) {
      const message = `检测到大量长期记忆：\n\n- 记忆数量：${totalMemories} 条\n- 估算 Token：约 ${Math.ceil(estimatedTotalTokens)} tokens\n- 将分 ${totalBatches} 批转换\n- 预计耗时：${Math.ceil(totalBatches * 0.5)} 分钟\n\n继续转换？`;
      shouldProceed = await showCustomConfirm('长期记忆转换', message);
    }

    if (!shouldProceed) {
      showToast('已取消转换', 'info');
      return;
    }

    const userNickname = chat.settings.myNickname || (state.qzoneSettings.nickname || '用户');

    const useSecondaryApi = state.apiConfig.secondaryProxyUrl && state.apiConfig.secondaryApiKey && state.apiConfig.secondaryModel;
    const { proxyUrl, apiKey, model } = useSecondaryApi
      ? { proxyUrl: state.apiConfig.secondaryProxyUrl, apiKey: state.apiConfig.secondaryApiKey, model: state.apiConfig.secondaryModel }
      : state.apiConfig;

    if (!proxyUrl || !apiKey || !model) {
      showToast('API未配置，无法转换', 'error');
      return;
    }

    let progressToast = null;
    let isCancelled = false;

    const updateProgress = (current, total, successCount) => {
      const message = `转换中... ${current}/${total} 批\n已提取 ${successCount} 条结构化记忆`;
      if (progressToast) {
        const toastElement = document.querySelector('.toast:last-child');
        if (toastElement) {
          toastElement.textContent = message;
        }
      } else {
        progressToast = showToast(message, 'info', 0);
      }
    };

    let totalEntriesExtracted = 0;
    let successfulBatches = 0;
    let failedBatches = 0;

    try {
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        if (isCancelled) {
          showToast('转换已取消', 'info');
          break;
        }

        const start = batchIndex * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, totalMemories);
        const batchMemories = chat.longTermMemory.slice(start, end);

        updateProgress(batchIndex + 1, totalBatches, totalEntriesExtracted);

        const formattedMemories = batchMemories.map((mem, index) => {
          const date = new Date(mem.timestamp);
          const dateStr = date.toLocaleString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false
          });
          return `[记忆 ${start + index + 1}] (${dateStr}) ${mem.content}`;
        }).join('\n');

        const timeRangeStr = `长期记忆库 第 ${batchIndex + 1}/${totalBatches} 批 (共 ${batchMemories.length} 条)`;
        const systemPrompt = window.structuredMemoryManager.buildSummaryPrompt(chat, formattedMemories, timeRangeStr);

        try {
          let isGemini = proxyUrl.includes('generativelanguage');
          let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, [{ role: 'user', content: '请将以上长期记忆全部提取为结构化记忆条目。' }]);

          const response = isGemini
            ? await fetch(geminiConfig.url, geminiConfig.data)
            : await fetch(`${proxyUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                  model,
                  messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: '请将以上长期记忆全部提取为结构化记忆条目。' }],
                  temperature: 0.3
                })
              });

          if (!response.ok) {
            console.warn(`批次 ${batchIndex + 1} API 错误: ${response.statusText}`);
            failedBatches++;
            continue;
          }

          const data = await response.json();
          let rawContent = isGemini ? getGeminiResponseText(data) : data.choices[0].message.content;
          rawContent = rawContent.replace(/^```[a-z]*\s*/g, '').replace(/```$/g, '').trim();

          const entries = window.structuredMemoryManager.parseMemoryEntries(rawContent, chat);
          if (entries.length > 0) {
            window.structuredMemoryManager.mergeEntries(chat, entries);
            totalEntriesExtracted += entries.length;
            successfulBatches++;
            console.log(`批次 ${batchIndex + 1}/${totalBatches}: 成功提取 ${entries.length} 条记忆`);
          } else {
            console.warn(`批次 ${batchIndex + 1}/${totalBatches}: AI 未返回有效数据`);
            console.warn('AI 返回内容:', rawContent.substring(0, 500));
            failedBatches++;
          }

          await db.chats.put(chat);

          if (batchIndex < totalBatches - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

        } catch (batchError) {
          console.error(`批次 ${batchIndex + 1} 处理出错:`, batchError);
          failedBatches++;
          continue;
        }
      }

      if (progressToast) {
        const toastElements = document.querySelectorAll('.toast');
        toastElements.forEach(el => el.remove());
      }

      if (totalEntriesExtracted > 0) {
        let resultMessage = `转换完成！\n- 成功批次：${successfulBatches}/${totalBatches}\n- 提取记忆：${totalEntriesExtracted} 条`;
        if (failedBatches > 0) {
          resultMessage += `\n- 失败批次：${failedBatches}`;
        }
        showToast(resultMessage, successfulBatches === totalBatches ? 'success' : 'warning', 5000);
      } else {
        showToast(`转换失败：所有批次都未能提取有效数据`, 'error', 8000);
      }

    } catch (error) {
      if (progressToast) {
        const toastElements = document.querySelectorAll('.toast');
        toastElements.forEach(el => el.remove());
      }
      console.error('长期记忆转换出错:', error);
      showToast(`转换失败：${error.message}\n已成功转换 ${successfulBatches} 批`, 'error', 5000);
    }
  }
  window.convertLongTermMemoryToStructured = convertLongTermMemoryToStructured;
