// ============================================================
// init-event-bindingsB.js
// 事件绑定B：init() 函数中段
// 从 init-and-state.js 约 6032~10163 行拆分
// 包含：记忆库功能（存档保存/加载/删除/重命名）、
//       API调用历史查看功能、聊天设置保存逻辑、
//       群成员设置编辑、头像框选择、贴纸面板、
//       QQ空间动态/相册/评论、收藏夹、红包投票、
//       视频/语音通话、商城购物、提示音预设管理等
// ============================================================

window.initEventBindingsB = function(state, db) {
    // 收藏夹选择模式相关变量
    var selectedFavorites = new Set();

    // ==================== 记忆库功能 ====================

    // 保存记忆存档
    document.getElementById('save-memory-archive-btn').addEventListener('click', async () => {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];

      // 弹出输入框让用户命名
      const archiveName = await showCustomPrompt('保存记忆存档', '请为这个存档命名：', '');
      if (!archiveName || !archiveName.trim()) {
        return; // 用户取消或未输入
      }

      try {
        // 创建存档对象
        const archive = {
          id: Date.now(),
          name: archiveName.trim(),
          timestamp: Date.now(),
          chatId: chat.id,
          data: {
            // 聊天记录
            history: JSON.parse(JSON.stringify(chat.history)),

            // 长期记忆（总结的记忆）
            longTermMemory: chat.longTermMemory ? JSON.parse(JSON.stringify(chat.longTermMemory)) : [],

            // 人设和头像
            settings: {
              aiPersona: chat.settings.aiPersona,
              aiAvatar: chat.settings.aiAvatar,
              myPersona: chat.settings.myPersona,
              myAvatar: chat.settings.myAvatar,
              myNickname: chat.settings.myNickname,

              // 长期记忆
              maxMemory: chat.settings.maxMemory,
              linkedMemoryCount: chat.settings.linkedMemoryCount,
              linkedMemoryChatIds: [...(chat.settings.linkedMemoryChatIds || [])],
              enableAutoMemory: chat.settings.enableAutoMemory,
              autoMemoryInterval: chat.settings.autoMemoryInterval,
              enableDiaryMode: chat.settings.enableDiaryMode,

              // 语音通话
              enableTts: chat.settings.enableTts,
              minimaxVoiceId: chat.settings.minimaxVoiceId,
              ttsLanguage: chat.settings.ttsLanguage,

              // 预设
              linkedWorldBookIds: [...(chat.settings.linkedWorldBookIds || [])],
              offlinePresetId: chat.settings.offlinePresetId,

              // 其他设置
              theme: chat.settings.theme,
              fontSize: chat.settings.fontSize,
              customCss: chat.settings.customCss,
              enableTimePerception: chat.settings.enableTimePerception,
              timeZone: chat.settings.timeZone,
              enableBackgroundActivity: chat.settings.enableBackgroundActivity,
              actionCooldownMinutes: chat.settings.actionCooldownMinutes,
              enableTodoList: chat.settings.enableTodoList,
              isOfflineMode: chat.settings.isOfflineMode,
              weather: chat.settings.weather ? JSON.parse(JSON.stringify(chat.settings.weather)) : null,
              enableSynthMusic: chat.settings.enableSynthMusic,
              enableNarratorMode: chat.settings.enableNarratorMode,
              showSeconds: chat.settings.showSeconds,
              lyricsPosition: chat.settings.lyricsPosition ? JSON.parse(JSON.stringify(chat.settings.lyricsPosition)) : null
            },

            // 角色状态
            heartfeltVoice: chat.heartfeltVoice,
            randomJottings: chat.randomJottings,
            status: chat.status ? JSON.parse(JSON.stringify(chat.status)) : null
          }
        };

        // 初始化存档数组
        if (!chat.memoryArchives) {
          chat.memoryArchives = [];
        }

        // 添加存档
        chat.memoryArchives.push(archive);

        // 保存到数据库
        await db.chats.put(chat);

        // 刷新存档列表
        renderMemoryArchiveList();

        await showCustomAlert('保存成功', `存档"${archiveName}"已保存！`);
      } catch (error) {
        console.error('保存记忆存档失败:', error);
        await showCustomAlert('保存失败', '保存记忆存档时出错，请重试。');
      }
    });

    // 渲染记忆存档列表
    function renderMemoryArchiveList() {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];
      const listContainer = document.getElementById('memory-archive-list');

      if (!chat.memoryArchives || chat.memoryArchives.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">暂无存档</div>';
        return;
      }

      // 按时间倒序排列
      const archives = [...chat.memoryArchives].sort((a, b) => b.timestamp - a.timestamp);

      listContainer.innerHTML = archives.map(archive => {
        const date = new Date(archive.timestamp);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

        return `
          <div class="memory-archive-item">
            <div class="memory-archive-info">
              <div class="memory-archive-name">${escapeHTML(archive.name)}</div>
              <div class="memory-archive-date">${dateStr}</div>
            </div>
            <div class="memory-archive-actions">
              <button class="memory-archive-btn load" data-archive-id="${archive.id}">读档</button>
              <button class="memory-archive-btn delete" data-archive-id="${archive.id}">删除</button>
            </div>
          </div>
        `;
      }).join('');

      // 绑定读档按钮事件
      listContainer.querySelectorAll('.memory-archive-btn.load').forEach(btn => {
        btn.addEventListener('click', async () => {
          const archiveId = parseInt(btn.dataset.archiveId);
          await loadMemoryArchive(archiveId);
        });
      });

      // 绑定删除按钮事件
      listContainer.querySelectorAll('.memory-archive-btn.delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const archiveId = parseInt(btn.dataset.archiveId);
          await deleteMemoryArchive(archiveId);
        });
      });
    }

    // 读取记忆存档
    async function loadMemoryArchive(archiveId) {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];

      const archive = chat.memoryArchives.find(a => a.id === archiveId);
      if (!archive) {
        await showCustomAlert('错误', '找不到该存档');
        return;
      }

      const confirmed = await showCustomConfirm(
        '读取存档',
        `确定要读取存档"${archive.name}"吗？\n\n当前的聊天记录和所有设置将被完全覆盖！`,
        { confirmButtonClass: 'btn-danger' }
      );

      if (!confirmed) return;

      try {
        // 恢复聊天记录
        chat.history = JSON.parse(JSON.stringify(archive.data.history));

        // 恢复长期记忆（总结的记忆）
        chat.longTermMemory = archive.data.longTermMemory ? JSON.parse(JSON.stringify(archive.data.longTermMemory)) : [];

        // 恢复所有设置
        const savedSettings = archive.data.settings;
        chat.settings.aiPersona = savedSettings.aiPersona;
        chat.settings.aiAvatar = savedSettings.aiAvatar;
        chat.settings.myPersona = savedSettings.myPersona;
        chat.settings.myAvatar = savedSettings.myAvatar;
        chat.settings.myNickname = savedSettings.myNickname;
        chat.settings.maxMemory = savedSettings.maxMemory;
        chat.settings.linkedMemoryCount = savedSettings.linkedMemoryCount;
        chat.settings.linkedMemoryChatIds = [...(savedSettings.linkedMemoryChatIds || [])];
        chat.settings.enableAutoMemory = savedSettings.enableAutoMemory;
        chat.settings.autoMemoryInterval = savedSettings.autoMemoryInterval;
        chat.settings.enableDiaryMode = savedSettings.enableDiaryMode || false;
        chat.settings.enableTts = savedSettings.enableTts;
        chat.settings.minimaxVoiceId = savedSettings.minimaxVoiceId;
        chat.settings.ttsLanguage = savedSettings.ttsLanguage;
        chat.settings.linkedWorldBookIds = [...(savedSettings.linkedWorldBookIds || [])];
        chat.settings.offlinePresetId = savedSettings.offlinePresetId;
        chat.settings.theme = savedSettings.theme;
        chat.settings.fontSize = savedSettings.fontSize;
        chat.settings.customCss = savedSettings.customCss;
        chat.settings.enableTimePerception = savedSettings.enableTimePerception;
        chat.settings.timeZone = savedSettings.timeZone;
        chat.settings.enableBackgroundActivity = savedSettings.enableBackgroundActivity;
        chat.settings.actionCooldownMinutes = savedSettings.actionCooldownMinutes;
        chat.settings.enableTodoList = savedSettings.enableTodoList;
        chat.settings.isOfflineMode = savedSettings.isOfflineMode;
        chat.settings.weather = savedSettings.weather ? JSON.parse(JSON.stringify(savedSettings.weather)) : null;
        chat.settings.enableSynthMusic = savedSettings.enableSynthMusic;
        chat.settings.enableNarratorMode = savedSettings.enableNarratorMode;
        chat.settings.showSeconds = savedSettings.showSeconds;
        chat.settings.lyricsPosition = savedSettings.lyricsPosition ? JSON.parse(JSON.stringify(savedSettings.lyricsPosition)) : null;

        // 恢复角色状态
        chat.heartfeltVoice = archive.data.heartfeltVoice;
        chat.randomJottings = archive.data.randomJottings;
        chat.status = archive.data.status ? JSON.parse(JSON.stringify(archive.data.status)) : null;

        // 保存到数据库
        await db.chats.put(chat);

        // 刷新界面
        renderChatInterface(state.activeChatId);
        renderChatList();

        // 如果在设置页面，也刷新设置页面
        const settingsModalElement = document.getElementById('chat-settings-modal');
        if (settingsModalElement && settingsModalElement.classList.contains('visible')) {
          showScreen('chat-interface-screen');
          setTimeout(() => {
            openChatSettings();
          }, 100);
        }

        await showCustomAlert('读档成功', `已成功读取存档"${archive.name}"！`);
      } catch (error) {
        console.error('读取记忆存档失败:', error);
        await showCustomAlert('读档失败', '读取记忆存档时出错，请重试。');
      }
    }

    // 删除记忆存档
    async function deleteMemoryArchive(archiveId) {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];

      const archive = chat.memoryArchives.find(a => a.id === archiveId);
      if (!archive) {
        await showCustomAlert('错误', '找不到该存档');
        return;
      }

      const confirmed = await showCustomConfirm(
        '删除存档',
        `确定要删除存档"${archive.name}"吗？\n\n此操作无法撤销！`,
        { confirmButtonClass: 'btn-danger' }
      );

      if (!confirmed) return;

      try {
        // 从数组中移除
        chat.memoryArchives = chat.memoryArchives.filter(a => a.id !== archiveId);

        // 保存到数据库
        await db.chats.put(chat);

        // 刷新列表
        renderMemoryArchiveList();

        await showCustomAlert('删除成功', `存档"${archive.name}"已删除！`);
      } catch (error) {
        console.error('删除记忆存档失败:', error);
        await showCustomAlert('删除失败', '删除记忆存档时出错，请重试。');
      }
    }

    // ==================== 记忆库功能结束 ====================

    // ==================== API调用历史查看功能 ====================

    // 打开API历史查看器
    document.getElementById('view-api-history-btn').addEventListener('click', () => {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];

      renderApiHistoryList();
      document.getElementById('api-history-modal').classList.add('visible');
    });

    // 一键回到第一条消息
    document.getElementById('scroll-to-first-message-btn').addEventListener('click', async () => {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];

      // 检查消息数量 - 使用 chat.history 而不是 chat.messages
      const messageCount = chat.history ? chat.history.length : 0;

      if (messageCount === 0) {
        await showCustomAlert('提示', '当前聊天没有消息记录。');
        return;
      }

      // 如果消息数量超过阈值，显示警告
      const MESSAGE_WARNING_THRESHOLD = 500;

      if (messageCount > MESSAGE_WARNING_THRESHOLD) {
        const confirmed = await showCustomConfirm(
          '性能提示',
          `当前聊天共有 ${messageCount} 条消息。\n\n滚动到第一条消息可能需要一些时间，并可能出现短暂卡顿。\n\n是否继续？`,
          {
            confirmText: '继续',
            cancelText: '取消',
            confirmButtonClass: 'btn-primary'
          }
        );

        if (!confirmed) return;
      }

      // 关闭聊天详情页面，返回聊天界面
      showScreen('chat-interface-screen');

      // 等待界面渲染完成
      await new Promise(resolve => setTimeout(resolve, 150));

      // 获取消息容器
      const messagesContainer = document.getElementById('chat-messages');
      if (!messagesContainer) return;

      // 执行滚动操作
      requestAnimationFrame(() => {
        const firstMessage = messagesContainer.querySelector('.message-bubble');

        if (messageCount > MESSAGE_WARNING_THRESHOLD) {
          // 消息数量很多时，使用instant模式直接跳转，避免卡顿
          if (firstMessage) {
            firstMessage.scrollIntoView({
              behavior: 'instant',
              block: 'start'
            });
          } else {
            messagesContainer.scrollTop = 0;
          }

          // 跳转完成后，显示成功提示
          setTimeout(() => {
            showCustomAlert('跳转完成', `已跳转到第一条消息。\n\n当前共有 ${messageCount} 条消息记录。`);
          }, 100);
        } else {
          // 消息数量适中时，使用平滑滚动
          if (firstMessage) {
            firstMessage.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          } else {
            messagesContainer.scrollTo({
              top: 0,
              behavior: 'smooth'
            });
          }
        }
      });
    });

    // 一键回到最后一条消息
    document.getElementById('scroll-to-last-message-btn').addEventListener('click', async () => {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];

      // 检查消息数量
      const messageCount = chat.history ? chat.history.length : 0;

      if (messageCount === 0) {
        await showCustomAlert('提示', '当前聊天没有消息记录。');
        return;
      }

      // 如果消息数量超过阈值，显示警告
      const MESSAGE_WARNING_THRESHOLD = 500;

      if (messageCount > MESSAGE_WARNING_THRESHOLD) {
        const confirmed = await showCustomConfirm(
          '性能提示',
          `当前聊天共有 ${messageCount} 条消息。\n\n滚动到最后一条消息可能需要一些时间，并可能出现短暂卡顿。\n\n是否继续？`,
          {
            confirmText: '继续',
            cancelText: '取消',
            confirmButtonClass: 'btn-primary'
          }
        );

        if (!confirmed) return;
      }

      // 关闭聊天详情页面，返回聊天界面
      showScreen('chat-interface-screen');

      // 等待界面渲染完成
      await new Promise(resolve => setTimeout(resolve, 150));

      // 获取消息容器
      const messagesContainer = document.getElementById('chat-messages');
      if (!messagesContainer) return;

      // 执行滚动操作
      requestAnimationFrame(() => {
        // 获取所有消息气泡
        const allMessages = messagesContainer.querySelectorAll('.message-bubble');
        const lastMessage = allMessages[allMessages.length - 1];

        if (messageCount > MESSAGE_WARNING_THRESHOLD) {
          // 消息数量很多时，使用instant模式直接跳转，避免卡顿
          if (lastMessage) {
            lastMessage.scrollIntoView({
              behavior: 'instant',
              block: 'end'
            });
          } else {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }

          // 跳转完成后，显示成功提示
          setTimeout(() => {
            showCustomAlert('跳转完成', `已跳转到最后一条消息。\n\n当前共有 ${messageCount} 条消息记录。`);
          }, 100);
        } else {
          // 消息数量适中时，使用平滑滚动
          if (lastMessage) {
            lastMessage.scrollIntoView({
              behavior: 'smooth',
              block: 'end'
            });
          } else {
            messagesContainer.scrollTo({
              top: messagesContainer.scrollHeight,
              behavior: 'smooth'
            });
          }
        }
      });
    });

    // 关闭API历史查看器
    document.getElementById('close-api-history-btn').addEventListener('click', () => {
      document.getElementById('api-history-modal').classList.remove('visible');
    });

    // 全选/取消全选API历史
    document.getElementById('api-history-select-all').addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.api-history-checkbox');
      checkboxes.forEach(cb => cb.checked = e.target.checked);
    });

    // 删除选中的API历史
    document.getElementById('api-history-delete-btn').addEventListener('click', async () => {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];

      // 获取所有选中的复选框
      const checkedBoxes = document.querySelectorAll('.api-history-checkbox:checked');

      if (checkedBoxes.length === 0) {
        await showCustomAlert('提示', '请先选择要删除的记录！');
        return;
      }

      const confirmed = await showCustomConfirm(
        '删除API历史',
        `确定要删除选中的 ${checkedBoxes.length} 条API调用历史记录吗？\n\n此操作无法撤销！`,
        { confirmButtonClass: 'btn-danger' }
      );

      if (!confirmed) return;

      try {
        // 获取要删除的索引列表
        const indicesToDelete = Array.from(checkedBoxes).map(cb => parseInt(cb.dataset.index));

        // 创建新数组，排除要删除的记录
        chat.apiHistory = chat.apiHistory.filter((record, index) => !indicesToDelete.includes(index));

        await db.chats.put(chat);

        // 取消全选
        document.getElementById('api-history-select-all').checked = false;

        renderApiHistoryList();
        await showCustomAlert('删除成功', `已删除 ${checkedBoxes.length} 条API调用历史记录！`);
      } catch (error) {
        console.error('删除API历史失败:', error);
        await showCustomAlert('删除失败', '删除API历史时出错，请重试。');
      }
    });

    // 导出API历史为JSON
    document.getElementById('api-history-export-btn').addEventListener('click', () => {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];

      if (!chat.apiHistory || chat.apiHistory.length === 0) {
        showCustomAlert('无数据', '当前没有API调用历史可导出。');
        return;
      }

      try {
        const jsonData = JSON.stringify(chat.apiHistory, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `api-history-${chat.name}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showCustomAlert('导出成功', `已导出 ${chat.apiHistory.length} 条API调用记录！`);
      } catch (error) {
        console.error('导出API历史失败:', error);
        showCustomAlert('导出失败', '导出API历史时出错，请重试。');
      }
    });

    // 渲染API历史列表
    function renderApiHistoryList() {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];
      const listContainer = document.getElementById('api-history-list');

      if (!chat.apiHistory || chat.apiHistory.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 40px 20px;">暂无API调用历史</div>';
        return;
      }

      // 按时间倒序排列（最新的在前）
      const history = [...chat.apiHistory].reverse();

      listContainer.innerHTML = history.map((record, index) => {
        const date = new Date(record.timestamp);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

        const duration = record.responseTimestamp ? `${Math.round((record.responseTimestamp - record.timestamp) / 1000)}秒` : '未完成';
        const reversedIndex = chat.apiHistory.length - index;

        // 计算提示词和响应的字符数
        const promptLength = record.systemPrompt ? record.systemPrompt.length : 0;
        const messagesLength = record.messages ? JSON.stringify(record.messages).length : 0;
        const responseLength = record.aiResponseContent ? record.aiResponseContent.length : 0;

        return `
          <div class="api-history-item" style="
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
            background: var(--bg-primary);
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <input type="checkbox" class="api-history-checkbox" data-index="${chat.apiHistory.length - 1 - index}" style="cursor: pointer; width: 18px; height: 18px;">
                <div style="font-weight: 600; font-size: 14px;">
                  #${reversedIndex} - ${dateStr}
                </div>
              </div>
              <div style="font-size: 12px; color: var(--text-secondary);">
                耗时: ${duration}
              </div>
            </div>
            
            <div style="display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
              <span style="font-size: 12px; padding: 4px 8px; background: var(--bg-secondary); border-radius: 4px;">
                模型: ${escapeHTML(record.model)}
              </span>
              <span style="font-size: 12px; padding: 4px 8px; background: var(--bg-secondary); border-radius: 4px;">
                温度: ${record.temperature}
              </span>
              <span style="font-size: 12px; padding: 4px 8px; background: var(--bg-secondary); border-radius: 4px;">
                提示词: ${promptLength.toLocaleString()} 字符
              </span>
              <span style="font-size: 12px; padding: 4px 8px; background: var(--bg-secondary); border-radius: 4px;">
                消息: ${messagesLength.toLocaleString()} 字符
              </span>
              <span style="font-size: 12px; padding: 4px 8px; background: var(--bg-secondary); border-radius: 4px;">
                响应: ${responseLength.toLocaleString()} 字符
              </span>
            </div>
            
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <button class="form-button-secondary view-system-prompt-btn" data-index="${chat.apiHistory.length - 1 - index}" style="flex: 1; min-width: 150px; padding: 8px 12px; font-size: 13px; opacity: 0.7;">
                查看系统提示词
              </button>
              <button class="form-button-secondary view-messages-btn" data-index="${chat.apiHistory.length - 1 - index}" style="flex: 1; min-width: 150px; padding: 8px 12px; font-size: 13px;">
                查看发送消息
              </button>
              <button class="form-button-secondary view-response-btn" data-index="${chat.apiHistory.length - 1 - index}" style="flex: 1; min-width: 150px; padding: 8px 12px; font-size: 13px;">
                查看AI响应
              </button>
              <button class="form-button-secondary view-raw-data-btn" data-index="${chat.apiHistory.length - 1 - index}" style="flex: 1; min-width: 150px; padding: 8px 12px; font-size: 13px;">
                查看原始数据
              </button>
            </div>
          </div>
        `;
      }).join('');

      // 绑定按钮事件
      listContainer.querySelectorAll('.view-system-prompt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          // 显示上锁提示
          showCustomAlert('功能已锁定', '为保护核心隐私，此功能已被锁定。');
        });
      });

      listContainer.querySelectorAll('.view-messages-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const index = parseInt(btn.dataset.index);
          const record = chat.apiHistory[index];
          const messagesContent = JSON.stringify(record.messages, null, 2);
          showApiHistoryDetail('发送消息内容', messagesContent, 'json');
        });
      });

      listContainer.querySelectorAll('.view-response-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const index = parseInt(btn.dataset.index);
          const record = chat.apiHistory[index];
          showApiHistoryDetail('AI响应内容', record.aiResponseContent, 'text');
        });
      });

      listContainer.querySelectorAll('.view-raw-data-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const index = parseInt(btn.dataset.index);
          const record = chat.apiHistory[index];
          showApiHistoryDetail('原始响应数据', JSON.stringify(record.responseData, null, 2), 'json');
        });
      });

      // 监听单个复选框变化，更新全选复选框状态
      const selectAllCheckbox = document.getElementById('api-history-select-all');
      listContainer.querySelectorAll('.api-history-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
          const allCheckboxes = document.querySelectorAll('.api-history-checkbox');
          const checkedCount = document.querySelectorAll('.api-history-checkbox:checked').length;
          selectAllCheckbox.checked = checkedCount === allCheckboxes.length;
        });
      });

      // 重置全选复选框状态
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
      }
    }

    // 显示API历史详情
    function showApiHistoryDetail(title, content, type) {
      const modal = document.createElement('div');
      modal.className = 'modal visible';
      modal.style.zIndex = '10001'; // 确保在API历史模态窗口之上

      const copyButtonHtml = `<button id="copy-detail-btn" class="form-button" style="padding: 8px 15px; margin-right: 10px;">复制内容</button>`;

      modal.innerHTML = `
        <div class="modal-content" style="height: 90%; max-width: 900px;">
          <div class="modal-header">
            <span>${escapeHTML(title)}</span>
          </div>
          <div class="modal-body" style="height: calc(100% - 100px); overflow-y: auto;">
            <div style="background: var(--bg-secondary); padding: 15px; border-radius: 8px; font-family: monospace; white-space: pre-wrap; word-wrap: break-word; font-size: 13px; line-height: 1.6;">
              ${escapeHTML(content || '(空)')}
            </div>
          </div>
          <div class="modal-footer">
            ${copyButtonHtml}
            <button class="cancel close-detail-btn">关闭</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // 绑定复制按钮事件
      const copyBtn = modal.querySelector('#copy-detail-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(content);
            copyBtn.textContent = '已复制！';
            setTimeout(() => {
              copyBtn.textContent = '复制内容';
            }, 2000);
          } catch (error) {
            console.error('复制失败:', error);
            showCustomAlert('复制失败', '无法复制到剪贴板，请手动复制。');
          }
        });
      }

      // 绑定关闭按钮事件
      modal.querySelector('.close-detail-btn').addEventListener('click', () => {
        document.body.removeChild(modal);
      });

      // 点击背景关闭
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          document.body.removeChild(modal);
        }
      });
    }

    // ==================== API调用历史查看功能结束 ====================








    document.getElementById('chat-settings-screen').addEventListener('click', (e) => {
      if (e.target.classList.contains('change-frame-btn')) {
        openFrameSelectorModal('chat');
      }
    });

    // 整洁模式下元素被移出 chat-settings-screen，事件委托失效，需要在 document 级别补充
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('change-frame-btn') && e.target.closest('#clean-chat-detail-screen')) {
        openFrameSelectorModal('chat');
      }
    });


    document.getElementById('member-settings-modal').addEventListener('click', (e) => {
      if (e.target.classList.contains('change-frame-btn')) {
        openFrameSelectorModal('member');
      }
    });


    const frameModal = document.getElementById('avatar-frame-modal');
    const aiFrameTab = document.getElementById('ai-frame-tab');
    const myFrameTab = document.getElementById('my-frame-tab');
    const aiFrameContent = document.getElementById('ai-frame-content');
    const myFrameContent = document.getElementById('my-frame-content');


    document.getElementById('save-frame-settings-btn').addEventListener('click', saveSelectedFrames);


    document.getElementById('cancel-frame-settings-btn').addEventListener('click', () => {
      frameModal.classList.remove('visible');
      editingFrameForMember = false;
    });


    aiFrameTab.addEventListener('click', () => {
      aiFrameTab.classList.add('active');
      myFrameTab.classList.remove('active');
      aiFrameContent.style.display = 'block';
      myFrameContent.style.display = 'none';
    });


    myFrameTab.addEventListener('click', () => {
      myFrameTab.classList.add('active');
      aiFrameTab.classList.remove('active');
      myFrameContent.style.display = 'block';
      aiFrameContent.style.display = 'none';
    });


    document.getElementById('clear-chat-btn').addEventListener('click', async () => {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];
      const confirmed = await showCustomConfirm('清空聊天记录', '此操作将永久删除此聊天的所有消息，无法恢复。确定要清空吗？', {
        confirmButtonClass: 'btn-danger'
      });
      if (confirmed) {
        chat.history = [];
        chat.heartfeltVoice = '...';
        chat.randomJottings = '...';
        // 重置角色状态为默认的"在线"
        if (!chat.isGroup && chat.status) {
          chat.status.text = '在线';
          chat.status.isBusy = false;
          chat.status.lastUpdate = Date.now();
        }
        await db.chats.put(chat);
        renderChatInterface(state.activeChatId);
        renderChatList();
        const chatSettingsModal = document.getElementById('chat-settings-modal');
        if (chatSettingsModal) chatSettingsModal.classList.remove('visible');
      }
    });

    const setupFileUpload = (inputId, callback) => {
      document.getElementById(inputId).addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) {
          const dataUrl = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result);
            reader.onerror = () => rej(reader.error);
            reader.readAsDataURL(file);
          });
          callback(dataUrl);
          event.target.value = null;
        }
      });
    };
    setupFileUpload('ai-avatar-input', (base64) => document.getElementById('ai-avatar-preview').src = base64);
    setupFileUpload('my-avatar-input', (base64) => document.getElementById('my-avatar-preview').src = base64);
    setupFileUpload('group-avatar-input', (base64) => document.getElementById('group-avatar-preview').src = base64);
    setupFileUpload('member-avatar-input', (base64) => document.getElementById('member-avatar-preview').src = base64);
    setupFileUpload('bg-input', async (base64) => {
      if (state.activeChatId) {
        const chat = state.chats[state.activeChatId];

        // 1. 立即保存和显示
        chat.settings.background = base64;
        const bgPreview = document.getElementById('bg-preview');
        bgPreview.src = base64;
        bgPreview.style.display = 'block';
        document.getElementById('remove-bg-btn').style.display = 'inline-block';

        await showCustomAlert("成功", "聊天背景已更新！\n\n图片将在后台静默上传到图床... (保存设置后生效)");

        // 2. 启动静默上传
        (async () => {
          await silentlyUpdateDbUrl(
            db.chats,
            chat.id,
            'settings.background',
            base64
          );
        })();
      }
    });
    setupFileUpload('preset-avatar-input', (base64) => document.getElementById('preset-avatar-preview').src = base64);
    document.getElementById('remove-bg-btn').addEventListener('click', () => {
      if (state.activeChatId) {
        state.chats[state.activeChatId].settings.background = '';
        const bgPreview = document.getElementById('bg-preview');
        bgPreview.src = '';
        bgPreview.style.display = 'none';
        document.getElementById('remove-bg-btn').style.display = 'none';
      }
    });

    const stickerPanel = document.getElementById('sticker-panel');
    document.getElementById('open-sticker-panel-btn').addEventListener('click', () => {
      const chat = state.chats[state.activeChatId];
      if (chat && chat.settings.stickerCategoryId) {

        activeStickerCategoryId = chat.settings.stickerCategoryId;
      } else {

        activeStickerCategoryId = 'all';
      }
      renderStickerPanel();
      stickerPanel.classList.add('visible');
    });
    document.getElementById('close-sticker-panel-btn').addEventListener('click', () => stickerPanel.classList.remove('visible'));



    document.getElementById('add-sticker-batch-btn').addEventListener('click', openBatchStickerImportModal);






    document.getElementById('upload-sticker-btn').addEventListener('click', () => document.getElementById('sticker-upload-input').click());
    document.getElementById('sticker-upload-input').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        let base64Url = reader.result;
        const name = await showCustomPrompt("命名表情", "请为这个表情命名 (例如：好耶、疑惑)");

        if (name && name.trim()) {
          const trimmedName = name.trim();

          const newSticker = {
            id: 'sticker_' + Date.now() + Math.random(), // <-- Add this line
            url: base64Url,
            name: trimmedName,
            categoryId: (activeStickerCategoryId !== 'all' && activeStickerCategoryId !== 'uncategorized') ? activeStickerCategoryId : null
          };
          const newId = await db.userStickers.add(newSticker); // 1. Save to DB

          newSticker.id = newId;
          state.userStickers.push(newSticker); // 2. Update state

          renderStickerPanel(); // 3. Render UI
          await showCustomAlert("添加成功！", `表情“${trimmedName}”已添加。\n\n图片将在后台静默上传到图床...`);

          // 4. 【【【已修复的调用】】】
          (async () => {
            await silentlyUpdateDbUrl(
              db.userStickers, // table
              newId, // recordId
              'url', // pathString (指向简单属性)
              base64Url // base64ToFind
              // nameToMatch (不需要)
            );
          })();

        } else if (name !== null) {
          alert("表情名不能为空！");
        }
      };
      event.target.value = null;
    });

    document.getElementById('upload-image-btn').addEventListener('click', () => document.getElementById('image-upload-input').click());
    document.getElementById('image-upload-input').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file || !state.activeChatId) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Url = e.target.result;
        const chat = state.chats[state.activeChatId];
        const msg = {
          role: 'user',
          content: [{
            type: 'image_url',
            image_url: {
              url: base64Url
            }
          }],
          timestamp: Date.now()
        };
        chat.history.push(msg);
        await db.chats.put(chat);
        appendMessage(msg, chat);
        renderChatList();
      };
      reader.readAsDataURL(file);
      event.target.value = null;
    });

    // 拍照按钮事件处理
    document.getElementById('camera-capture-btn').addEventListener('click', () => {
      document.getElementById('camera-capture-input').click();
    });

    document.getElementById('camera-capture-input').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file || !state.activeChatId) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Url = e.target.result;
        const chat = state.chats[state.activeChatId];
        const msg = {
          role: 'user',
          content: [{
            type: 'image_url',
            image_url: {
              url: base64Url
            }
          }],
          timestamp: Date.now()
        };
        chat.history.push(msg);
        await db.chats.put(chat);
        appendMessage(msg, chat);
        renderChatList();
      };
      reader.readAsDataURL(file);
      event.target.value = null;
    });
    document.getElementById('voice-message-btn').addEventListener('click', async () => {
      if (!state.activeChatId) return;

      const text = await showCustomPrompt("发送语音", "请输入你想说的内容：");
      if (text && text.trim()) {
        const chat = state.chats[state.activeChatId];


        const msg = {
          role: 'user',
          type: 'voice_message',
          content: text.trim(),
          timestamp: Date.now()
        };

        chat.history.push(msg);
        await db.chats.put(chat);
        appendMessage(msg, chat);
        renderChatList();
      }
    });
    document.getElementById('send-photo-btn').addEventListener('click', async () => {
      if (!state.activeChatId) return;
      const description = await showCustomPrompt("发送照片", "请用文字描述您要发送的照片：");
      if (description && description.trim()) {
        const chat = state.chats[state.activeChatId];
        const msg = {
          role: 'user',
          type: 'user_photo',
          content: description.trim(),
          timestamp: Date.now()
        };
        chat.history.push(msg);
        await db.chats.put(chat);
        appendMessage(msg, chat);
        renderChatList();
      }
    });

    const waimaiModal = document.getElementById('waimai-request-modal');


    document.getElementById('send-waimai-request-btn').addEventListener('click', () => {
      waimaiModal.classList.add('visible');
    });


    waimaiModal.addEventListener('click', (e) => {

      if (e.target === waimaiModal) {
        waimaiModal.classList.remove('visible');
      }
    });


    document.getElementById('waimai-order-for-ai-btn').addEventListener('click', sendWaimaiOrderForAI);


    document.getElementById('waimai-confirm-btn').addEventListener('click', async () => {
      if (!state.activeChatId) return;

      const productInfoInput = document.getElementById('waimai-product-info');
      const amountInput = document.getElementById('waimai-amount');

      const productInfo = productInfoInput.value.trim();
      const amount = parseFloat(amountInput.value);

      if (!productInfo || isNaN(amount) || amount <= 0) {
        alert('请填写有效的商品信息和金额！');
        return;
      }

      const chat = state.chats[state.activeChatId];
      const now = Date.now();
      const myNickname = chat.isGroup ? (chat.settings.myNickname || '我') : '我';

      const msg = {
        role: 'user',
        senderName: myNickname,
        type: 'waimai_request',
        productInfo: productInfo,
        amount: amount,
        status: 'pending',
        countdownEndTime: now + 15 * 60 * 1000,
        timestamp: now
      };

      chat.history.push(msg);
      await db.chats.put(chat);
      appendMessage(msg, chat);
      renderChatList();

      productInfoInput.value = '';
      amountInput.value = '';
      waimaiModal.classList.remove('visible');
    });
    document.getElementById('open-persona-library-btn').addEventListener('click', openPersonaLibrary);
    document.getElementById('close-persona-library-btn').addEventListener('click', closePersonaLibrary);
    document.getElementById('add-persona-preset-btn').addEventListener('click', openPersonaEditorForCreate);
    document.getElementById('manage-persona-preset-btn').addEventListener('click', enterManageMode);
    document.getElementById('select-all-persona-btn').addEventListener('click', selectAllPresets);
    document.getElementById('delete-selected-persona-btn').addEventListener('click', deleteSelectedPresets);
    document.getElementById('cancel-manage-persona-btn').addEventListener('click', exitManageMode);
    document.getElementById('import-tavern-persona-btn').addEventListener('click', importTavernPersonas);
    document.getElementById('import-tavern-persona-input').addEventListener('change', handleTavernPersonaImport);
    document.getElementById('cancel-tavern-import-btn').addEventListener('click', closeTavernPersonaSelector);
    document.getElementById('confirm-tavern-import-btn').addEventListener('click', confirmTavernImport);
    document.getElementById('cancel-persona-editor-btn').addEventListener('click', closePersonaEditor);
    document.getElementById('save-persona-preset-btn').addEventListener('click', savePersonaPreset);
    document.getElementById('preset-action-edit').addEventListener('click', openPersonaEditorForEdit);
    document.getElementById('preset-action-delete').addEventListener('click', deletePersonaPreset);
    document.getElementById('preset-action-cancel').addEventListener('click', hidePresetActions);

    // 新增：人设操作弹窗事件绑定
    document.getElementById('apply-persona-direct-btn').addEventListener('click', applyPersonaPresetDirect);
    document.getElementById('edit-persona-first-btn').addEventListener('click', editPersonaThenApply);
    document.getElementById('cancel-persona-action-btn').addEventListener('click', hidePersonaActionModal);

    document.getElementById('selection-cancel-btn').addEventListener('click', exitSelectionMode);




    document.getElementById('selection-soft-delete-btn').addEventListener('click', async () => {
      if (selectedMessages.size === 0) return;
      const confirmed = await showCustomConfirm('删除消息', `确定要删除选中的 ${selectedMessages.size} 条消息吗？这会通知AI这些消息已被删除。`, {
        confirmButtonClass: 'btn-danger'
      });
      if (confirmed) {
        const chat = state.chats[state.activeChatId];
        let deletedPollsInfo = [];
        for (const timestamp of selectedMessages) {
          const msg = chat.history.find(m => m.timestamp === timestamp);
          if (msg && msg.type === 'poll') {
            deletedPollsInfo.push(`关于“${msg.question}”的投票(时间戳: ${msg.timestamp})`);
          }
        }
        chat.history = chat.history.filter(msg => !selectedMessages.has(msg.timestamp));
        let forgetReason = "一些之前的消息已被用户删除。";
        if (deletedPollsInfo.length > 0) {
          forgetReason += ` 其中包括以下投票：${deletedPollsInfo.join('；')}。`;
        }
        forgetReason += " 你应该像它们从未存在过一样继续对话，并相应地调整你的记忆和行为，不要再提及这些被删除的内容。";
        const forgetInstruction = {
          role: 'system',
          content: `[系统提示：${forgetReason}]`,
          timestamp: Date.now(),
          isHidden: true
        };
        chat.history.push(forgetInstruction);
        await db.chats.put(chat);
        renderChatInterface(state.activeChatId);
        renderChatList();
      }
    });


    document.getElementById('selection-erase-btn').addEventListener('click', async () => {
      if (selectedMessages.size === 0) return;
      const confirmed = await showCustomConfirm(
        '彻底删除消息',
        `这将从历史记录中【永久抹除】这 ${selectedMessages.size} 条消息，AI将完全遗忘它们的存在。确定吗？`, {
        confirmButtonClass: 'btn-danger',
        confirmText: '确认抹除'
      }
      );
      if (confirmed) {
        const chat = state.chats[state.activeChatId];


        chat.history = chat.history.filter(msg => !selectedMessages.has(msg.timestamp));


        await db.chats.put(chat);


        renderChatInterface(state.activeChatId);
        renderChatList();
      }
    });


    const fontUrlInput = document.getElementById('font-url-input');
    fontUrlInput.addEventListener('input', () => applyCustomFont(fontUrlInput.value.trim(), true));

    // 本地字体上传
    document.getElementById('font-local-upload-btn').addEventListener('click', () => {
      document.getElementById('font-local-file-input').click();
    });
    document.getElementById('font-local-file-input').addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const MAX_SIZE = 10 * 1024 * 1024; // 10MB 硬限制
      const WARN_SIZE = 5 * 1024 * 1024;  // 5MB 警告
      if (file.size > MAX_SIZE) {
        alert('字体文件超过 10MB，为避免闪退已拒绝加载。请选择更小的字体文件。');
        this.value = null;
        return;
      }
      if (file.size > WARN_SIZE) {
        document.getElementById('font-local-warning').style.display = 'block';
      } else {
        document.getElementById('font-local-warning').style.display = 'none';
      }
      const reader = new FileReader();
      reader.onload = function(ev) {
        const dataUrl = ev.target.result;
        state.globalSettings.fontLocalData = dataUrl;
        document.getElementById('font-local-filename').textContent = file.name + ' (' + (file.size / 1024 / 1024).toFixed(2) + 'MB)';
        document.getElementById('font-local-clear-btn').style.display = 'inline-block';
        document.getElementById('font-url-input').disabled = true;
        document.getElementById('font-url-input').placeholder = '已使用本地字体，清除后可输入URL';
        applyCustomFont(state.globalSettings.fontUrl || '', true);
      };
      reader.readAsDataURL(file);
      this.value = null;
    });
    document.getElementById('font-local-clear-btn').addEventListener('click', function() {
      state.globalSettings.fontLocalData = '';
      document.getElementById('font-local-filename').textContent = '';
      document.getElementById('font-local-warning').style.display = 'none';
      this.style.display = 'none';
      document.getElementById('font-url-input').disabled = false;
      document.getElementById('font-url-input').placeholder = 'https://..../font.ttf';
      applyCustomFont(fontUrlInput.value.trim(), true);
    });

    // 字体大小滑动条实时预览
    document.getElementById('font-size-slider').addEventListener('input', function() {
      document.getElementById('font-size-value').textContent = this.value;
      state.globalSettings.globalFontSize = parseInt(this.value);
      document.getElementById('font-preview').style.fontSize = this.value + 'px';
    });

    // 字体应用范围交互
    document.getElementById('font-scope-all').addEventListener('change', function() {
      const scopeList = document.getElementById('font-scope-list');
      scopeList.style.display = this.checked ? 'none' : 'flex';
      if (this.checked) {
        document.querySelectorAll('#font-scope-list input[type="checkbox"]').forEach(cb => cb.checked = true);
      }
    });

    document.getElementById('save-font-btn').addEventListener('click', async () => {
      const newFontUrl = fontUrlInput.value.trim();
      // 读取字体大小
      const newFontSize = parseInt(document.getElementById('font-size-slider').value) || 16;
      state.globalSettings.globalFontSize = newFontSize;
      // 读取字体应用范围
      const scopeAll = document.getElementById('font-scope-all').checked;
      const newScope = { all: scopeAll };
      document.querySelectorAll('#font-scope-list input[data-scope]').forEach(cb => {
        newScope[cb.dataset.scope] = scopeAll ? true : cb.checked;
      });
      state.globalSettings.fontScope = newScope;
      state.globalSettings.fontUrl = newFontUrl;
      applyCustomFont(newFontUrl, false);
      await db.globalSettings.put(state.globalSettings);
      alert('字体设置已保存并应用！');
    });
    document.getElementById('reset-font-btn').addEventListener('click', resetToDefaultFont);
    document.getElementById('reset-font-scope-btn').addEventListener('click', resetFontByScope);

    document.querySelectorAll('#chat-list-bottom-nav .nav-item').forEach(item => {
      item.addEventListener('click', () => switchToChatListView(item.dataset.view));
    });
    document.getElementById('qzone-back-btn').addEventListener('click', () => switchToChatListView('messages-view'));
    document.getElementById('qzone-nickname').addEventListener('click', async () => {
      const newNickname = await showCustomPrompt("修改昵称", "请输入新的昵称", state.qzoneSettings.nickname);
      if (newNickname && newNickname.trim()) {
        state.qzoneSettings.nickname = newNickname.trim();
        await saveQzoneSettings();
        renderQzoneScreen();
      }
    });
    document.getElementById('qzone-avatar-container').addEventListener('click', () => document.getElementById('qzone-avatar-input').click());
    document.getElementById('qzone-banner-container').addEventListener('click', () => document.getElementById('qzone-banner-input').click());
    document.getElementById('qzone-avatar-input').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (file) {
        const dataUrl = await new Promise(res => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result);
          reader.readAsDataURL(file);
        });
        state.qzoneSettings.avatar = dataUrl;
        await saveQzoneSettings();
        renderQzoneScreen();
      }
      event.target.value = null;
    });
    document.getElementById('qzone-banner-input').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (file) {
        const dataUrl = await new Promise(res => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result);
          reader.readAsDataURL(file);
        });
        state.qzoneSettings.banner = dataUrl;
        await saveQzoneSettings();
        renderQzoneScreen();
      }
      event.target.value = null;
    });


    document.getElementById('create-shuoshuo-btn').addEventListener('click', async () => {

      resetCreatePostModal();
      const modal = document.getElementById('create-post-modal');


      modal.dataset.mode = 'shuoshuo';


      modal.querySelector('.post-mode-switcher').style.display = 'none';
      modal.querySelector('#image-mode-content').style.display = 'none';
      modal.querySelector('#text-image-mode-content').style.display = 'none';


      modal.querySelector('#post-public-text').placeholder = '分享新鲜事...';


      const visibilityGroupsContainer = document.getElementById('post-visibility-groups');
      visibilityGroupsContainer.innerHTML = '';
      const groups = await db.qzoneGroups.toArray();
      if (groups.length > 0) {
        groups.forEach(group => {
          const label = document.createElement('label');
          label.style.display = 'block';
          label.innerHTML = `<input type="checkbox" name="visibility_group" value="${group.id}"> ${group.name}`;
          visibilityGroupsContainer.appendChild(label);
        });
      } else {
        visibilityGroupsContainer.innerHTML = '<p style="color: var(--text-secondary);">没有可用的分组</p>';
      }
      modal.classList.add('visible');
    });


    document.getElementById('create-post-btn').addEventListener('click', async () => {

      resetCreatePostModal();
      const modal = document.getElementById('create-post-modal');


      modal.dataset.mode = 'complex';


      modal.querySelector('.post-mode-switcher').style.display = 'flex';

      modal.querySelector('#image-mode-content').classList.add('active');

      modal.querySelector('#text-image-mode-content').classList.remove('active');


      modal.querySelector('#post-public-text').placeholder = '分享新鲜事...（非必填的公开文字）';


      const visibilityGroupsContainer = document.getElementById('post-visibility-groups');
      visibilityGroupsContainer.innerHTML = '';
      const groups = await db.qzoneGroups.toArray();
      if (groups.length > 0) {
        groups.forEach(group => {
          const label = document.createElement('label');
          label.style.display = 'block';
          label.innerHTML = `<input type="checkbox" name="visibility_group" value="${group.id}"> ${group.name}`;
          visibilityGroupsContainer.appendChild(label);
        });
      } else {
        visibilityGroupsContainer.innerHTML = '<p style="color: var(--text-secondary);">没有可用的分组</p>';
      }
      modal.classList.add('visible');
    });
    document.getElementById('open-album-btn').addEventListener('click', async () => {
      await renderAlbumList();
      showScreen('album-screen');
    });
    document.getElementById('album-back-btn').addEventListener('click', () => {
      showScreen('chat-list-screen');
      switchToChatListView('qzone-screen');
    });



    document.getElementById('album-photos-back-btn').addEventListener('click', () => {
      state.activeAlbumId = null;
      showScreen('album-screen');
    });

    document.getElementById('album-upload-photo-btn').addEventListener('click', () => document.getElementById('album-photo-input').click());

    document.getElementById('album-photo-input').addEventListener('change', async (event) => {
      if (!state.activeAlbumId) return;
      const files = event.target.files;
      if (!files.length) return;

      const album = await db.qzoneAlbums.get(state.activeAlbumId);

      for (const file of files) {
        const dataUrl = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        await db.qzonePhotos.add({
          albumId: state.activeAlbumId,
          url: dataUrl,
          createdAt: Date.now()
        });
      }

      const photoCount = await db.qzonePhotos.where('albumId').equals(state.activeAlbumId).count();
      const updateData = {
        photoCount
      };

      if (!album.photoCount || album.coverUrl.includes('placeholder')) {
        const firstPhoto = await db.qzonePhotos.where('albumId').equals(state.activeAlbumId).first();
        if (firstPhoto) updateData.coverUrl = firstPhoto.url;
      }

      await db.qzoneAlbums.update(state.activeAlbumId, updateData);
      await renderAlbumPhotosScreen();
      await renderAlbumList();

      event.target.value = null;
      alert('照片上传成功！');
    });





    document.getElementById('photos-grid-page').addEventListener('click', async (e) => {
      const deleteBtn = e.target.closest('.photo-delete-btn');
      const photoThumb = e.target.closest('.photo-thumb');

      if (deleteBtn) {
        e.stopPropagation();
        const photoId = parseInt(deleteBtn.dataset.photoId);
        const confirmed = await showCustomConfirm(
          '删除照片',
          '确定要删除这张照片吗？此操作不可恢复。', {
          confirmButtonClass: 'btn-danger'
        }
        );

        if (confirmed) {
          const deletedPhoto = await db.qzonePhotos.get(photoId);
          if (!deletedPhoto) return;

          await db.qzonePhotos.delete(photoId);

          const album = await db.qzoneAlbums.get(state.activeAlbumId);
          const photoCount = (album.photoCount || 1) - 1;
          const updateData = {
            photoCount
          };

          if (album.coverUrl === deletedPhoto.url) {
            const nextPhoto = await db.qzonePhotos.where('albumId').equals(state.activeAlbumId).first();
            updateData.coverUrl = nextPhoto ? nextPhoto.url : 'https://i.postimg.cc/pT2xKzPz/album-cover-placeholder.png';
          }

          await db.qzoneAlbums.update(state.activeAlbumId, updateData);
          await renderAlbumPhotosScreen();
          await renderAlbumList();
          alert('照片已删除。');
        }
      } else if (photoThumb) {

        openPhotoViewer(photoThumb.src);
      }
    });


    document.getElementById('photo-viewer-close-btn').addEventListener('click', window.closePhotoViewer);
    document.getElementById('photo-viewer-next-btn').addEventListener('click', window.showNextPhoto);
    document.getElementById('photo-viewer-prev-btn').addEventListener('click', window.showPrevPhoto);


    document.addEventListener('keydown', (e) => {
      if (!photoViewerState.isOpen) return;

      if (e.key === 'ArrowRight') {
        window.showNextPhoto();
      } else if (e.key === 'ArrowLeft') {
        window.showPrevPhoto();
      } else if (e.key === 'Escape') {
        window.closePhotoViewer();
      }
    });



    document.getElementById('create-album-btn-page').addEventListener('click', async () => {
      const albumName = await showCustomPrompt("创建新相册", "请输入相册名称");
      if (albumName && albumName.trim()) {
        const newAlbum = {
          name: albumName.trim(),
          coverUrl: 'https://i.postimg.cc/pT2xKzPz/album-cover-placeholder.png',
          photoCount: 0,
          createdAt: Date.now()
        };
        await db.qzoneAlbums.add(newAlbum);
        await renderAlbumList();
        alert(`相册 "${albumName}" 创建成功！`);
      } else if (albumName !== null) {
        alert("相册名称不能为空！");
      }
    });

    document.getElementById('cancel-create-post-btn').addEventListener('click', () => document.getElementById('create-post-modal').classList.remove('visible'));
    document.getElementById('post-upload-local-btn').addEventListener('click', () => document.getElementById('post-local-image-input').click());
    document.getElementById('post-local-image-input').addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          document.getElementById('post-image-preview').src = e.target.result;
          document.getElementById('post-image-preview-container').classList.add('visible');
          document.getElementById('post-image-desc-group').style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });
    document.getElementById('post-use-url-btn').addEventListener('click', async () => {
      const url = await showCustomPrompt("输入图片URL", "请输入网络图片的链接", "", "url");
      if (url) {
        document.getElementById('post-image-preview').src = url;
        document.getElementById('post-image-preview-container').classList.add('visible');
        document.getElementById('post-image-desc-group').style.display = 'block';
      }
    });
    document.getElementById('post-remove-image-btn').addEventListener('click', () => resetCreatePostModal());
    const imageModeBtn = document.getElementById('switch-to-image-mode');
    const textImageModeBtn = document.getElementById('switch-to-text-image-mode');
    const imageModeContent = document.getElementById('image-mode-content');
    const textImageModeContent = document.getElementById('text-image-mode-content');
    imageModeBtn.addEventListener('click', () => {
      imageModeBtn.classList.add('active');
      textImageModeBtn.classList.remove('active');
      imageModeContent.classList.add('active');
      textImageModeContent.classList.remove('active');
    });
    textImageModeBtn.addEventListener('click', () => {
      textImageModeBtn.classList.add('active');
      imageModeBtn.classList.remove('active');
      textImageModeContent.classList.add('active');
      imageModeContent.classList.remove('active');
    });


    document.getElementById('confirm-create-post-btn').addEventListener('click', async () => {
      const modal = document.getElementById('create-post-modal');
      const mode = modal.dataset.mode;


      const visibilityMode = document.querySelector('input[name="visibility"]:checked').value;
      let visibleGroupIds = null;

      if (visibilityMode === 'include') {
        visibleGroupIds = Array.from(document.querySelectorAll('input[name="visibility_group"]:checked')).map(cb => parseInt(cb.value));
      }

      let newPost = {};
      const basePostData = {
        timestamp: Date.now(),
        authorId: 'user',

        visibleGroupIds: visibleGroupIds,
      };


      if (mode === 'shuoshuo') {
        const content = document.getElementById('post-public-text').value.trim();
        if (!content) {
          alert('说说内容不能为空哦！');
          return;
        }
        newPost = {
          ...basePostData,
          type: 'shuoshuo',
          content: content,
        };

      } else {
        const publicText = document.getElementById('post-public-text').value.trim();
        const isImageModeActive = document.getElementById('image-mode-content').classList.contains('active');

        if (isImageModeActive) {
          const imageUrl = document.getElementById('post-image-preview').src;
          const imageDescription = document.getElementById('post-image-description').value.trim();
          if (!imageUrl || !(imageUrl.startsWith('http') || imageUrl.startsWith('data:'))) {
            alert('请先添加一张图片再发布动态哦！');
            return;
          }
          if (!imageDescription) {
            alert('请为你的图片添加一个简单的描述（必填，给AI看的）！');
            return;
          }
          newPost = {
            ...basePostData,
            type: 'image_post',
            publicText: publicText,
            imageUrl: imageUrl,
            imageDescription: imageDescription,
          };
        } else {
          const hiddenText = document.getElementById('post-hidden-text').value.trim();
          if (!hiddenText) {
            alert('请输入文字图描述！');
            return;
          }
          newPost = {
            ...basePostData,
            type: 'text_image',
            publicText: publicText,
            hiddenContent: hiddenText,
          };
        }
      }


      const newPostId = await db.qzonePosts.add(newPost);
      let postSummary = newPost.content || newPost.publicText || newPost.imageDescription || newPost.hiddenContent || "（无文字内容）";
      postSummary = postSummary.substring(0, 50) + (postSummary.length > 50 ? '...' : '');


      for (const chatId in state.chats) {
        const chat = state.chats[chatId];
        if (chat.isGroup) continue;

        let shouldNotify = false;
        const postVisibleGroups = newPost.visibleGroupIds;


        if (!postVisibleGroups || postVisibleGroups.length === 0) {
          shouldNotify = true;
        } else if (chat.groupId && postVisibleGroups.includes(chat.groupId)) {
          shouldNotify = true;
        }


        if (shouldNotify) {

          const historyMessage = {
            role: 'system',
            content: `[系统提示：用户刚刚发布了一条动态(ID: ${newPostId})，内容摘要是：“${postSummary}”。请你【结合自己的角色设定、世界观和你们的最近聊天内容】，对这条动态发表一条自然的评论。]`,
            timestamp: Date.now(),
            isHidden: true
          };

          chat.history.push(historyMessage);
          await db.chats.put(chat);
        }
      }


      await renderQzonePosts();
      modal.classList.remove('visible');
      alert('动态发布成功！');
    });



    const postsList = document.getElementById('qzone-posts-list');
    let swipeState = {
      isDragging: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      activeContainer: null,
      swipeDirection: null,
      isClick: true
    };

    function resetAllSwipes(exceptThisOne = null) {
      document.querySelectorAll('.qzone-post-container').forEach(container => {
        if (container !== exceptThisOne) {
          container.querySelector('.qzone-post-item').classList.remove('swiped');
        }
      });
    }


    async function handlePostClick(e) {
      e.stopPropagation();
      const target = e.target;


      const deleteBtn = target.closest('.comment-delete-btn');
      if (deleteBtn) {
        const postContainer = deleteBtn.closest('.qzone-post-container');
        const postId = parseInt(postContainer.dataset.postId);
        const commentIndex = parseInt(deleteBtn.dataset.commentIndex);
        if (isNaN(postId) || isNaN(commentIndex)) return;

        const post = qzonePostsCache.find(p => p.id === postId);
        if (!post || !post.comments || !post.comments[commentIndex]) return;



        const deletedComment = post.comments[commentIndex];

        const confirmed = await showCustomConfirm('删除评论', '确定要删除这条评论吗？', {
          confirmButtonClass: 'btn-danger'
        });
        if (confirmed) {

          post.comments.splice(commentIndex, 1);
          await db.qzonePosts.update(postId, {
            comments: post.comments
          });




          if (deletedComment && deletedComment.commenterName === state.qzoneSettings.nickname) {
            console.log("用户删除了自己的评论，开始清理AI记忆...");


            const aiToNotifyIds = new Set();
            if (post.authorId !== 'user') {
              aiToNotifyIds.add(post.authorId);
            }
            if (deletedComment.replyTo) {
              const repliedToChat = Object.values(state.chats).find(c => c.originalName === deletedComment.replyTo);
              if (repliedToChat) {
                aiToNotifyIds.add(repliedToChat.id);
              }
            }


            const postSummary = (post.publicText || post.content || '').substring(0, 30);
            const userNickname = state.qzoneSettings.nickname;
            let notificationText;
            const stickerMatch = state.userStickers.find(s => s.url === deletedComment.text);

            if (stickerMatch) {
              notificationText = `用户'${userNickname}'刚刚在你的动态“${postSummary}”下，发送了一个表情评论，意思是：“${stickerMatch.name}”。`;
            } else if (deletedComment.replyTo) {
              const repliedToDisplayName = getDisplayNameByOriginalName(deletedComment.replyTo);
              notificationText = `用户'${userNickname}'刚刚在你的动态“${postSummary}”下，回复了'${repliedToDisplayName}'的评论，内容是：“${deletedComment.text}”。`;
            } else {
              notificationText = `用户'${userNickname}'刚刚评论了你的动态“${postSummary}”，内容是：“${deletedComment.text}”。`;
            }
            const fullSystemContent = `[系统提示：${notificationText}请你对此作出回应。]`;


            for (const aiId of aiToNotifyIds) {
              const chat = state.chats[aiId];
              if (chat) {
                const originalLength = chat.history.length;

                chat.history = chat.history.filter(msg =>
                  !(msg.isHidden && msg.role === 'system' && msg.content === fullSystemContent)
                );

                if (chat.history.length < originalLength) {
                  console.log(`在角色 "${chat.name}" 的记忆中清除了1条关于已删除评论的通知。`);
                  await db.chats.put(chat);
                }
              }
            }
          }


          await updateSinglePostInDOM(postId);
        }

        return;
      }


      const stickerBtn = target.closest('.comment-sticker-btn');
      if (stickerBtn) {
        const postContainer = stickerBtn.closest('.qzone-post-container');
        if (!postContainer) return;
        const postId = parseInt(postContainer.dataset.postId);
        if (qzoneStickerPanelState.isOpen && qzoneStickerPanelState.activePostId === postId) {
          closeQzoneStickerPanel();
        } else {
          openQzoneStickerPanel(postId, stickerBtn);
        }
        return;
      }
      const commentItem = target.closest('.comment-item');
      if (commentItem) {
        const postId = parseInt(commentItem.dataset.postId);
        const commenterOriginalName = commentItem.dataset.commenterOriginalName;
        const commenterDisplayName = commentItem.dataset.commenterDisplayName;

        if (!commenterOriginalName || !commenterDisplayName || commenterOriginalName === state.qzoneSettings.nickname) {
          clearQzoneReplyContext(commentItem.closest('.qzone-post-container'));
          return;
        }
        currentQzoneReplyContext = {
          postId,
          replyToName: commenterOriginalName,
          replyToDisplayName: commenterDisplayName
        };
        const postContainer = commentItem.closest('.qzone-post-container');
        const commentInput = postContainer.querySelector('.comment-input');
        commentInput.placeholder = `回复 ${commenterDisplayName}:`;
        commentInput.focus();
        return;
      }
      if (target.classList.contains('post-actions-btn')) {
        const container = target.closest('.qzone-post-container');
        if (container && container.dataset.postId) showPostActions(parseInt(container.dataset.postId));
        return;
      }
      if (target.tagName === 'IMG' && target.dataset.hiddenText) {
        showCustomAlert("图片内容", target.dataset.hiddenText.replace(/<br>/g, '\n'));
        return;
      }


      const postContainer = target.closest('.qzone-post-container');
      if (!postContainer) return;
      const postId = parseInt(postContainer.dataset.postId);
      if (isNaN(postId)) return;

      if (target.closest('.qzone-post-delete-action')) {
        const confirmed = await showCustomConfirm('删除动态', '确定要永久删除这条动态吗？', {
          confirmButtonClass: 'btn-danger'
        });
        if (confirmed) {
          postContainer.style.transition = 'all 0.3s ease';
          postContainer.style.transform = 'scale(0.8)';
          postContainer.style.opacity = '0';
          setTimeout(async () => {
            await db.qzonePosts.delete(postId);
            const notificationIdentifier = `(ID: ${postId})`;
            for (const chatId in state.chats) {
              const chat = state.chats[chatId];
              const originalHistoryLength = chat.history.length;
              chat.history = chat.history.filter(msg => !(msg.role === 'system' && msg.content.includes(notificationIdentifier)));
              if (chat.history.length < originalHistoryLength) await db.chats.put(chat);
            }
            await renderQzonePosts();
            alert('动态已删除。');
          }, 300);
        }
        return;
      }

      const icon = target.closest('.action-icon');
      if (icon) {
        if (icon.classList.contains('repost')) {
          openRepostModal(postId);
          return;
        }
        if (icon.classList.contains('like')) {
          const post = qzonePostsCache.find(p => p.id === postId);
          if (!post) return;
          if (!post.likes) post.likes = [];
          const userOriginalName = state.qzoneSettings.nickname;
          const userLikeIndex = post.likes.indexOf(userOriginalName);
          if (userLikeIndex > -1) {
            post.likes.splice(userLikeIndex, 1);
          } else {
            post.likes.push(userOriginalName);
            icon.classList.add('animate-like');
            icon.addEventListener('animationend', () => icon.classList.remove('animate-like'), {
              once: true
            });
          }
          await db.qzonePosts.update(postId, {
            likes: post.likes
          });
          await updateSinglePostInDOM(postId);
        }
        if (icon.classList.contains('favorite')) {
          const existingFavorite = await db.favorites.where({
            type: 'qzone_post',
            'content.id': postId
          }).first();
          if (existingFavorite) {
            await db.favorites.delete(existingFavorite.id);
            await showCustomAlert('提示', '已取消收藏');
          } else {
            const postToSave = await db.qzonePosts.get(postId);
            if (postToSave) {
              await db.favorites.add({
                type: 'qzone_post',
                content: postToSave,
                timestamp: Date.now()
              });
              await showCustomAlert('提示', '收藏成功！');
            }
          }
          await updateSinglePostInDOM(postId);
        }
        return;
      }

      const sendBtn = target.closest('.comment-send-btn');
      if (sendBtn) {
        const commentInput = postContainer.querySelector('.comment-input');
        const commentText = commentInput.value.trim();
        if (!commentText) return alert('评论内容不能为空哦！');

        const post = qzonePostsCache.find(p => p.id === postId);
        if (!post) return;

        if (!post.comments) post.comments = [];

        const newComment = {
          commenterName: state.qzoneSettings.nickname,
          text: commentText,
          timestamp: Date.now(),
          replyTo: (currentQzoneReplyContext && currentQzoneReplyContext.postId === postId) ? currentQzoneReplyContext.replyToName : null
        };

        post.comments.push(newComment);
        await db.qzonePosts.update(postId, {
          comments: post.comments
        });

        let postSummary = (post.publicText || post.content || '').substring(0, 30);
        const userNickname = state.qzoneSettings.nickname;
        const notifiedAiIds = new Set();
        if (post.authorId !== 'user') notifiedAiIds.add(post.authorId);
        if (newComment.replyTo && newComment.replyTo !== userNickname) {
          const repliedToChat = Object.values(state.chats).find(c => c.originalName === newComment.replyTo);
          if (repliedToChat) notifiedAiIds.add(repliedToChat.id);
        }
        for (const aiId of notifiedAiIds) {
          const chat = state.chats[aiId];
          if (chat && !chat.isGroup) {
            const stickerMatch = state.userStickers.find(s => s.url === commentText);
            let notificationText = stickerMatch ? `用户'${userNickname}'刚刚在你的动态“${postSummary}”下，发送了一个表情评论，意思是：“${stickerMatch.name}”。` :
              newComment.replyTo ? `用户'${userNickname}'刚刚在你的动态“${postSummary}”下，回复了'${currentQzoneReplyContext.replyToDisplayName}'的评论，内容是：“${commentText}”。` :
                `用户'${userNickname}'刚刚评论了你的动态“${postSummary}”，内容是：“${commentText}”。`;
            const historyMessage = {
              role: 'system',
              content: `[系统提示：${notificationText}请你对此作出回应。]`,
              timestamp: Date.now(),
              isHidden: true
            };
            chat.history.push(historyMessage);
            await db.chats.put(chat);
          }
        }

        commentInput.value = '';
        clearQzoneReplyContext(postContainer);
        await updateSinglePostInDOM(postId);
        return;
      }
    }






    const handleSwipeStart = (e) => {
      const target = e.target;

      if (target.closest('.post-footer, .post-feedback-icons, .post-actions-btn, .post-comments-container, .reposted-content-wrapper')) {
        return;
      }
      const targetContainer = e.target.closest('.qzone-post-container');
      if (!targetContainer) return;

      resetAllSwipes(targetContainer);
      swipeState.activeContainer = targetContainer;
      swipeState.isDragging = true;
      swipeState.isClick = true;
      swipeState.swipeDirection = null;
      swipeState.startX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
      swipeState.startY = e.type.includes('mouse') ? e.pageY : e.touches[0].pageY;
      swipeState.activeContainer.querySelector('.qzone-post-item').style.transition = 'none';


      document.addEventListener('mousemove', handleSwipeMove);
      document.addEventListener('mouseup', handleSwipeEnd);
      document.addEventListener('touchmove', handleSwipeMove, {
        passive: false
      });
      document.addEventListener('touchend', handleSwipeEnd);
    };


    const handleSwipeMove = (e) => {
      if (!swipeState.isDragging || !swipeState.activeContainer) return;

      const currentX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
      const currentY = e.type.includes('mouse') ? e.pageY : e.touches[0].pageY;
      const diffX = currentX - swipeState.startX;
      const diffY = currentY - swipeState.startY;

      if (swipeState.isClick && (Math.abs(diffX) > 5 || Math.abs(diffY) > 5)) {
        swipeState.isClick = false;
      }

      if (!swipeState.swipeDirection) {
        if (Math.abs(diffX) > Math.abs(diffY)) {
          swipeState.swipeDirection = 'horizontal';
        } else {
          swipeState.swipeDirection = 'vertical';
        }
      }

      if (swipeState.swipeDirection === 'horizontal') {
        e.preventDefault();
        swipeState.currentX = currentX;
        let translation = Math.min(0, Math.max(-90, diffX));
        swipeState.activeContainer.querySelector('.qzone-post-item').style.transform = `translateX(${translation}px)`;
      }
    };


    const handleSwipeEnd = (e) => {

      document.removeEventListener('mousemove', handleSwipeMove);
      document.removeEventListener('mouseup', handleSwipeEnd);
      document.removeEventListener('touchmove', handleSwipeMove);
      document.removeEventListener('touchend', handleSwipeEnd);

      if (!swipeState.isDragging || !swipeState.activeContainer) return;

      const postItem = swipeState.activeContainer.querySelector('.qzone-post-item');
      postItem.style.transition = 'transform 0.3s ease';

      if (swipeState.swipeDirection === 'horizontal' && !swipeState.isClick) {
        const finalX = e.type.includes('touchend') ? e.changedTouches[0].pageX : e.pageX;
        const diffX = finalX - swipeState.startX;
        if (diffX < -40) {
          postItem.classList.add('swiped');
        } else {
          postItem.classList.remove('swiped');
        }
      }

      postItem.style.transform = '';


      swipeState.isDragging = false;
      swipeState.activeContainer = null;
      swipeState.swipeDirection = null;
      swipeState.isClick = true;
    };











    postsList.addEventListener('click', handlePostClick);
    postsList.addEventListener('mousedown', handleSwipeStart);
    postsList.addEventListener('touchstart', handleSwipeStart, {
      passive: true
    });



    postsList.addEventListener('click', (e) => {

      if (e.target && e.target.id === 'load-more-qzone-btn') {
        loadMoreQzonePosts();
      }
    });


    document.getElementById('refine-memory-btn-header').addEventListener('click', () => {
      if (state.activeChatId) {
        summarizeExistingLongTermMemory(state.activeChatId);
      }
    });

    document.getElementById('api-preset-select').addEventListener('change', handlePresetSelectionChange);
    document.getElementById('save-api-preset-btn').addEventListener('click', saveApiPreset);
    document.getElementById('delete-api-preset-btn').addEventListener('click', deleteApiPreset);


    document.getElementById('add-world-book-entry-btn').addEventListener('click', () => {
      const container = document.getElementById('world-book-entries-container');

      if (container.querySelector('p')) {
        container.innerHTML = '';
      }
      const newBlock = createWorldBookEntryBlock();
      container.appendChild(newBlock);
      newBlock.querySelector('.entry-content-textarea').focus();
    });


    document.getElementById('switch-greeting-btn').addEventListener('click', handleSwitchGreeting);

    document.getElementById('thoughts-history-list').addEventListener('click', (e) => {
      if (e.target && e.target.id === 'load-more-thoughts-btn') {
        loadMoreThoughts();
      }
    });




    document.getElementById('profile-history-icon-btn').addEventListener('click', showThoughtsHistory);

    document.getElementById('history-back-btn').addEventListener('click', hideThoughtsHistory);
    document.getElementById('character-profile-modal').addEventListener('click', (e) => {

      if (e.target.id === 'character-profile-modal') {
        e.target.classList.remove('visible');
      }
    });

    document.getElementById('manage-stickers-btn').addEventListener('click', toggleStickerManagementMode);
    document.getElementById('delete-selected-stickers-btn').addEventListener('click', executeBatchDeleteStickers);
    document.getElementById('export-selected-stickers-btn').addEventListener('click', executeBatchExportStickers);

    document.getElementById('qzone-back-btn').addEventListener('click', () => switchToChatListView('messages-view'));
    document.getElementById('favorites-back-btn').addEventListener('click', () => switchToChatListView('messages-view'));






    const searchInput = document.getElementById('favorites-search-input');
    const searchClearBtn = document.getElementById('favorites-search-clear-btn');

    searchInput.addEventListener('input', () => {
      const searchTerm = searchInput.value.trim().toLowerCase();


      searchClearBtn.style.display = searchTerm ? 'block' : 'none';

      if (!searchTerm) {
        displayFilteredFavorites(allFavoriteItems);
        return;
      }


      const filteredItems = allFavoriteItems.filter(item => {
        let contentToSearch = '';
        let authorToSearch = '';

        if (item.type === 'qzone_post') {
          const post = item.content;
          contentToSearch += (post.publicText || '') + ' ' + (post.content || '');
          if (post.authorId === 'user') {
            authorToSearch = state.qzoneSettings.nickname;
          } else if (state.chats[post.authorId]) {
            authorToSearch = state.chats[post.authorId].name;
          }
        } else if (item.type === 'chat_message') {
          const msg = item.content;
          if (typeof msg.content === 'string') {
            contentToSearch = msg.content;
          }
          const chat = state.chats[item.chatId];
          if (chat) {
            if (msg.role === 'user') {
              authorToSearch = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
            } else {
              authorToSearch = chat.isGroup ? msg.senderName : chat.name;
            }
          }
        }


        return contentToSearch.toLowerCase().includes(searchTerm) ||
          authorToSearch.toLowerCase().includes(searchTerm);
      });

      displayFilteredFavorites(filteredItems);
    });


    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchClearBtn.style.display = 'none';
      displayFilteredFavorites(allFavoriteItems);
      searchInput.focus();
    });







    document.getElementById('selection-favorite-btn').addEventListener('click', async () => {
      if (selectedMessages.size === 0) return;
      const chat = state.chats[state.activeChatId];
      if (!chat) return;

      const favoritesToAdd = [];
      const timestampsToFavorite = [...selectedMessages];

      for (const timestamp of timestampsToFavorite) {

        const existing = await db.favorites.where('originalTimestamp').equals(timestamp).first();

        if (!existing) {
          const messageToSave = chat.history.find(msg => msg.timestamp === timestamp);
          if (messageToSave) {
            favoritesToAdd.push({
              type: 'chat_message',
              content: messageToSave,
              chatId: state.activeChatId,
              timestamp: Date.now(),
              originalTimestamp: messageToSave.timestamp
            });
          }
        }
      }

      if (favoritesToAdd.length > 0) {
        await db.favorites.bulkAdd(favoritesToAdd);
        allFavoriteItems = await db.favorites.orderBy('timestamp').reverse().toArray();
        await showCustomAlert('收藏成功', `已成功收藏 ${favoritesToAdd.length} 条消息。`);
      } else {
        await showCustomAlert('提示', '选中的消息均已收藏过。');
      }

      exitSelectionMode();
    });


    const favoritesEditBtn = document.getElementById('favorites-edit-btn');
    const favoritesView = document.getElementById('favorites-view');
    const favoritesActionBar = document.getElementById('favorites-action-bar');
    const mainBottomNav = document.getElementById('chat-list-bottom-nav');
    const favoritesList = document.getElementById('favorites-list');

    favoritesEditBtn.addEventListener('click', () => {
      isFavoritesSelectionMode = !isFavoritesSelectionMode;
      favoritesView.classList.toggle('selection-mode', isFavoritesSelectionMode);

      if (isFavoritesSelectionMode) {

        favoritesEditBtn.textContent = '完成';
        favoritesActionBar.style.display = 'block';
        mainBottomNav.style.display = 'none';
        favoritesList.style.paddingBottom = '80px';
      } else {

        favoritesEditBtn.textContent = '编辑';
        favoritesActionBar.style.display = 'none';
        mainBottomNav.style.display = 'flex';
        favoritesList.style.paddingBottom = '';


        selectedFavorites.clear();
        document.querySelectorAll('.favorite-item-card.selected').forEach(card => card.classList.remove('selected'));
        document.getElementById('favorites-delete-selected-btn').textContent = `删除 (0)`;
      }
    });



    document.getElementById('favorites-list').addEventListener('click', (e) => {
      const target = e.target;
      const card = target.closest('.favorite-item-card');


      if (target.tagName === 'IMG' && target.dataset.hiddenText) {
        const hiddenText = target.dataset.hiddenText;
        showCustomAlert("图片内容", hiddenText.replace(/<br>/g, '\n'));
        return;
      }


      if (!isFavoritesSelectionMode) return;


      if (!card) return;

      const favId = parseInt(card.dataset.favid);
      if (isNaN(favId)) return;


      if (selectedFavorites.has(favId)) {
        selectedFavorites.delete(favId);
        card.classList.remove('selected');
      } else {
        selectedFavorites.add(favId);
        card.classList.add('selected');
      }


      document.getElementById('favorites-delete-selected-btn').textContent = `删除 (${selectedFavorites.size})`;
    });



    document.getElementById('favorites-delete-selected-btn').addEventListener('click', async () => {
      if (selectedFavorites.size === 0) return;

      const confirmed = await showCustomConfirm(
        '确认删除',
        `确定要从收藏夹中移除这 ${selectedFavorites.size} 条内容吗？`, {
        confirmButtonClass: 'btn-danger'
      }
      );

      if (confirmed) {
        const idsToDelete = [...selectedFavorites];
        await db.favorites.bulkDelete(idsToDelete);
        await showCustomAlert('删除成功', '选中的收藏已被移除。');


        allFavoriteItems = allFavoriteItems.filter(item => !idsToDelete.includes(item.id));


        displayFilteredFavorites(allFavoriteItems);


        favoritesEditBtn.click();
      }
    });


    if (state.globalSettings.enableBackgroundActivity) {
      startBackgroundSimulation();
      console.log("后台活动模拟已自动启动。");
    }







    document.querySelectorAll('input[name="theme-select"]').forEach(radio => {
      radio.addEventListener('change', updateSettingsPreview);
    });


    const chatFontSizeSlider = document.getElementById('chat-font-size-slider');
    chatFontSizeSlider.addEventListener('input', () => {

      document.getElementById('chat-font-size-value').textContent = `${chatFontSizeSlider.value}px`;

      updateSettingsPreview();
    });


    const customCssInputForPreview = document.getElementById('custom-css-input');
    customCssInputForPreview.addEventListener('input', updateSettingsPreview);


    document.getElementById('reset-theme-btn').addEventListener('click', () => {
      document.getElementById('theme-default').checked = true;
      updateSettingsPreview();
    });

    document.getElementById('reset-custom-css-btn').addEventListener('click', () => {
      document.getElementById('custom-css-input').value = '';
      updateSettingsPreview();
    });



    document.getElementById('lyrics-vertical-pos').addEventListener('change', updateSettingsPreview);
    document.getElementById('lyrics-horizontal-pos').addEventListener('change', updateSettingsPreview);
    document.getElementById('lyrics-offset-input').addEventListener('input', updateSettingsPreview);

    document.querySelectorAll('input[name="visibility"]').forEach(radio => {
      radio.addEventListener('change', function () {
        const groupsContainer = document.getElementById('post-visibility-groups');
        if (this.value === 'include' || this.value === 'exclude') {
          groupsContainer.style.display = 'block';
        } else {
          groupsContainer.style.display = 'none';
        }
      });
    });



    document.getElementById('manage-groups-btn').addEventListener('click', openGroupManager);
    document.getElementById('close-group-manager-btn').addEventListener('click', () => {
      document.getElementById('group-management-modal').classList.remove('visible');

      const chatSettingsBtn = document.getElementById('chat-settings-btn');
      if (document.getElementById('chat-settings-modal').classList.contains('visible')) {
        chatSettingsBtn.click();
      }
    });

    document.getElementById('add-new-group-btn').addEventListener('click', addNewGroup);
    document.getElementById('existing-groups-list').addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-group-btn')) {
        const groupId = parseInt(e.target.dataset.id);
        deleteGroup(groupId);
      }
    });




    document.getElementById('cancel-message-action-btn').addEventListener('click', hideMessageActions);

    // 翻译按钮事件监听器
    document.getElementById('translate-message-btn').addEventListener('click', translateMessageContent);

    document.getElementById('edit-message-btn').addEventListener('click', openAdvancedMessageEditor);

    document.getElementById('copy-message-btn').addEventListener('click', copyMessageContent);


    document.getElementById('recall-message-btn').addEventListener('click', handleRecallClick);



    document.getElementById('select-message-btn').addEventListener('click', () => {

      const timestampToSelect = activeMessageTimestamp;
      hideMessageActions();

      if (timestampToSelect) {
        enterSelectionMode(timestampToSelect);
      }
    });

    // 排除消息按钮 (单条) - 已移至聊天设置批量管理

    // 排除消息按钮 (多选) - 已移至聊天设置批量管理

    // 批量管理排除消息 (聊天详情入口)
    document.getElementById('batch-exclude-manage-btn').addEventListener('click', openBatchExcludeManager);
    document.getElementById('batch-exclude-cancel-btn').addEventListener('click', closeBatchExcludeManager);
    document.getElementById('view-excluded-detail-btn').addEventListener('click', openExcludedDetailView);
    document.getElementById('excluded-detail-close-btn').addEventListener('click', closeExcludedDetailView);
    document.getElementById('token-detail-trigger').addEventListener('click', openTokenBreakdown);
    document.getElementById('token-breakdown-close-btn').addEventListener('click', closeTokenBreakdown);
    document.getElementById('token-breakdown-refresh-btn').addEventListener('click', refreshTokenBreakdown);
    document.getElementById('batch-exclude-action-btn').addEventListener('click', () => batchExcludeAction(true));
    document.getElementById('batch-include-action-btn').addEventListener('click', () => batchExcludeAction(false));
    document.getElementById('batch-exclude-select-all').addEventListener('click', () => {
      document.querySelectorAll('#batch-exclude-list .batch-exclude-item').forEach(item => {
        const ts = parseInt(item.dataset.timestamp);
        window.batchExcludeChecked.add(ts);
        item.classList.add('checked');
      });
      document.getElementById('batch-exclude-selected-count').textContent = `已选 ${window.batchExcludeChecked.size} 条`;
    });
    document.getElementById('batch-exclude-deselect-all').addEventListener('click', () => {
      window.batchExcludeChecked.clear();
      document.querySelectorAll('#batch-exclude-list .batch-exclude-item').forEach(item => item.classList.remove('checked'));
      document.getElementById('batch-exclude-selected-count').textContent = '已选 0 条';
    });
    document.getElementById('batch-exclude-select-range').addEventListener('click', async () => {
      const rangeStr = await showCustomPrompt('按范围选择', '输入要选择的消息范围，例如：1-50 表示第1到第50条', '', 'text');
      if (!rangeStr) return;
      const match = rangeStr.match(/(\d+)\s*[-~到]\s*(\d+)/);
      if (!match) return;
      const start = parseInt(match[1]) - 1;
      const end = parseInt(match[2]);
      const items = document.querySelectorAll('#batch-exclude-list .batch-exclude-item');
      items.forEach((item, i) => {
        if (i >= start && i < end) {
          window.batchExcludeChecked.add(parseInt(item.dataset.timestamp));
          item.classList.add('checked');
        }
      });
      document.getElementById('batch-exclude-selected-count').textContent = `已选 ${window.batchExcludeChecked.size} 条`;
    });







    document.getElementById('transfer-action-accept').addEventListener('click', () => {
      // 检查是否在 My Phone 环境中
      if (activeMyPhoneTransferTimestamp !== null && typeof activeMyPhoneTransferTimestamp !== 'undefined') {
        handleMyPhoneTransferResponse('accepted');
      } else {
        handleUserTransferResponse('accepted');
      }
    });
    document.getElementById('transfer-action-decline').addEventListener('click', () => {
      // 检查是否在 My Phone 环境中
      if (activeMyPhoneTransferTimestamp !== null && typeof activeMyPhoneTransferTimestamp !== 'undefined') {
        handleMyPhoneTransferResponse('declined');
      } else {
        handleUserTransferResponse('declined');
      }
    });
    document.getElementById('transfer-action-cancel').addEventListener('click', () => {
      hideTransferActionModal();
      // 清除 My Phone 转账状态
      if (typeof activeMyPhoneTransferTimestamp !== 'undefined') {
        activeMyPhoneTransferTimestamp = null;
      }
    });





    document.getElementById('edit-post-btn').addEventListener('click', openPostEditor);
    document.getElementById('copy-post-btn').addEventListener('click', copyPostContent);
    document.getElementById('cancel-post-action-btn').addEventListener('click', hidePostActions);




    document.getElementById('cancel-contact-picker-btn').addEventListener('click', () => {
      showScreen('chat-list-screen');
    });

    document.getElementById('contact-picker-list').addEventListener('click', (e) => {
      const item = e.target.closest('.contact-picker-item');
      if (!item) return;

      const contactId = item.dataset.contactId;
      item.classList.toggle('selected');

      if (selectedContacts.has(contactId)) {
        selectedContacts.delete(contactId);
      } else {
        selectedContacts.add(contactId);
      }
      updateContactPickerConfirmButton();
    });


    document.getElementById('manage-members-btn').addEventListener('click', () => {



      openMemberManagementScreen();
    });



    document.getElementById('back-from-member-management').addEventListener('click', () => {

      showScreen('chat-interface-screen');
      document.getElementById('chat-settings-btn').click();
    });


    document.getElementById('member-management-list').addEventListener('click', (e) => {

      if (e.target.classList.contains('remove-member-btn')) {
        removeMemberFromGroup(e.target.dataset.memberId);
      }
    });

    document.getElementById('add-existing-contact-btn').addEventListener('click', async () => {


      const confirmBtn = document.getElementById('confirm-contact-picker-btn');

      const newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
      newConfirmBtn.addEventListener('click', handleAddMembersToGroup);

      await openContactPickerForAddMember();
    });

    document.getElementById('create-new-member-btn').addEventListener('click', createNewMemberInGroup);





    document.getElementById('video-call-btn').addEventListener('click', handleInitiateCall);
    document.getElementById('group-video-call-btn').addEventListener('click', handleInitiateCall);
    document.getElementById('voice-call-btn').addEventListener('click', handleInitiateVoiceCall);
    document.getElementById('group-voice-call-btn').addEventListener('click', handleInitiateVoiceCall);


    document.getElementById('hang-up-btn').addEventListener('click', endVideoCall);
    document.getElementById('minimize-call-btn').addEventListener('click', minimizeVideoCall);
    document.getElementById('video-call-restore-btn').addEventListener('click', restoreVideoCall);

    makeDraggable(document.getElementById('video-call-restore-btn'), document.getElementById('video-call-restore-btn'));

    // 语音通话按钮事件监听器
    document.getElementById('voice-hang-up-btn').addEventListener('click', endVoiceCall);
    document.getElementById('minimize-voice-call-btn').addEventListener('click', minimizeVoiceCall);
    document.getElementById('voice-call-restore-btn').addEventListener('click', restoreVoiceCall);
    makeDraggable(document.getElementById('voice-call-restore-btn'), document.getElementById('voice-call-restore-btn'));
    document.getElementById('voice-join-call-btn').addEventListener('click', handleUserJoinVoiceCall);
    document.getElementById('voice-user-speak-btn').addEventListener('click', async () => {
      if (!voiceCallState.isActive) return;
      const userAvatar = document.querySelector('#voice-participant-avatars-grid .participant-avatar-wrapper[data-participant-id="user"] .participant-avatar');
      if (userAvatar) {
        userAvatar.classList.add('speaking');
      }
      const userInput = await showCustomPrompt('你说', '请输入你想说的话...');
      if (userAvatar) {
        userAvatar.classList.remove('speaking');
      }
      if (userInput && userInput.trim()) {
        triggerAiInVoiceCallAction(userInput.trim());
      }
    });
    document.getElementById('voice-regenerate-call-btn').addEventListener('click', () => {
      if (!voiceCallState.isActive) return;
      if (voiceCallState.callHistory.length > 0) {
        voiceCallState.callHistory.pop();
        const callFeed = document.getElementById('voice-call-main');
        const lastBubble = callFeed.querySelector('.call-message-bubble:last-child');
        if (lastBubble) lastBubble.remove();
      }
      triggerAiInVoiceCallAction();
    });

    document.getElementById('cancel-call-btn').addEventListener('click', () => {
      videoCallState.isAwaitingResponse = false;
      showScreen('chat-interface-screen');
    });


    document.getElementById('join-call-btn').addEventListener('click', handleUserJoinCall);



    document.getElementById('decline-call-btn').addEventListener('click', async () => {
      hideIncomingCallModal();
      
      // 获取通话类型
      const modal = document.getElementById('incoming-call-modal');
      const callType = modal.dataset.callType || 'video';
      const isVideoCall = callType === 'video';
      
      const currentCallState = isVideoCall ? videoCallState : voiceCallState;
      const chat = state.chats[currentCallState.activeChatId];
      if (!chat) return;

      const callTypeText = isVideoCall ? '视频通话' : '语音通话';

      if (currentCallState.isGroupCall) {
        currentCallState.isUserParticipating = false;

        const systemNote = {
          role: 'system',
          content: `[系统提示：用户拒绝了${callTypeText}邀请，但你们可以自己开始。请你们各自决策是否加入。]`,
          timestamp: Date.now(),
          isHidden: true
        };
        chat.history.push(systemNote);
        await db.chats.put(chat);

        await triggerAiResponse();

      } else {
        const declineMessage = {
          role: 'user',
          content: `我拒绝了你的${callTypeText}请求。`,
          timestamp: Date.now()
        };
        chat.history.push(declineMessage);
        await db.chats.put(chat);

        showScreen('chat-interface-screen');
        appendMessage(declineMessage, chat);

        triggerAiResponse();
      }

      currentCallState.isAwaitingResponse = false;
    });




    document.getElementById('accept-call-btn').addEventListener('click', async () => {
      hideIncomingCallModal();

      // 获取通话类型
      const modal = document.getElementById('incoming-call-modal');
      const callType = modal.dataset.callType || 'video';
      const isVideoCall = callType === 'video';
      
      const currentCallState = isVideoCall ? videoCallState : voiceCallState;
      
      currentCallState.initiator = 'ai';
      currentCallState.isUserParticipating = true;
      currentCallState.activeChatId = state.activeChatId;

      if (currentCallState.isGroupCall) {
        const chat = state.chats[currentCallState.activeChatId];
        const requester = chat.members.find(m => m.name === currentCallState.callRequester);
        if (requester) {
          currentCallState.participants = [requester];
        } else {
          currentCallState.participants = [];
        }
      }

      // 根据通话类型启动对应的通话界面
      if (isVideoCall) {
        startVideoCall();
      } else {
        startVoiceCall();
      }
    });





    document.getElementById('user-speak-btn').addEventListener('click', async () => {
      if (!videoCallState.isActive) return;


      const userAvatar = document.querySelector('.participant-avatar-wrapper[data-participant-id="user"] .participant-avatar');
      if (userAvatar) {
        userAvatar.classList.add('speaking');
      }

      const userInput = await showCustomPrompt('你说', '请输入你想说的话...');


      if (userAvatar) {
        userAvatar.classList.remove('speaking');
      }

      if (userInput && userInput.trim()) {
        triggerAiInCallAction(userInput.trim());
      }
    });




    document.querySelector('.nav-item[data-view="memories-view"]').addEventListener('click', () => {

      if (isFavoritesSelectionMode) {
        document.getElementById('favorites-edit-btn').click();
      }
      switchToChatListView('memories-view');
      renderMemoriesScreen();
    });


    document.getElementById('memories-back-btn').addEventListener('click', () => switchToChatListView('messages-view'));




    document.getElementById('confirm-create-countdown-btn').addEventListener('click', async () => {
      const title = document.getElementById('countdown-title-input').value.trim();
      const dateValue = document.getElementById('countdown-date-input').value;

      if (!title || !dateValue) {
        alert('请填写完整的约定标题和日期！');
        return;
      }

      const targetDate = new Date(dateValue);
      if (isNaN(targetDate) || targetDate <= new Date()) {
        alert('请输入一个有效的、未来的日期！');
        return;
      }


      const newCountdown = {
        authorId: 'user',
        description: title,
        timestamp: Date.now(),
        type: 'countdown',
        targetDate: targetDate.getTime()
      };


      await db.memories.add(newCountdown);
      document.getElementById('create-countdown-modal').classList.remove('visible');
      renderMemoriesScreen();
    });


    document.getElementById('block-chat-btn').addEventListener('click', async () => {
      if (!state.activeChatId || state.chats[state.activeChatId].isGroup) return;

      const chat = state.chats[state.activeChatId];
      const confirmed = await showCustomConfirm(
        '确认拉黑',
        `确定要拉黑“${chat.name}”吗？拉黑后您将无法向其发送消息，直到您将Ta移出黑名单，或等待Ta重新申请好友。`, {
        confirmButtonClass: 'btn-danger'
      }
      );

      if (confirmed) {
        chat.relationship.status = 'blocked_by_user';
        chat.relationship.blockedTimestamp = Date.now();


        const hiddenMessage = {
          role: 'system',
          content: `[系统提示：你刚刚被用户拉黑了。在对方解除拉黑之前，你无法再主动发起对话，也无法回应。]`,
          timestamp: Date.now() + 1,
          isHidden: true
        };
        chat.history.push(hiddenMessage);


        await db.chats.put(chat);


        document.getElementById('chat-settings-modal').classList.remove('visible');
        renderChatInterface(state.activeChatId);

        renderChatList();
      }
    });

    document.getElementById('chat-lock-overlay').addEventListener('click', async (e) => {
      const chat = state.chats[state.activeChatId];
      if (!chat) return;

      if (e.target.id === 'force-apply-check-btn') {
        alert("正在手动触发好友申请流程，请稍后...\n如果API调用成功，将弹出提示。如果失败，也会有错误提示。如果长时间无反应，说明AI可能决定暂时不申请。");
        await triggerAiFriendApplication(chat.id);
        renderChatInterface(chat.id);
        return;
      }

      if (e.target.id === 'unblock-btn') {
        chat.relationship.status = 'friend';
        chat.relationship.blockedTimestamp = null;


        const hiddenMessage = {
          role: 'system',
          content: `[系统提示：用户刚刚解除了对你的拉黑。现在你们可以重新开始对话了。]`,
          timestamp: Date.now(),
          isHidden: true
        };
        chat.history.push(hiddenMessage);


        await db.chats.put(chat);
        renderChatInterface(chat.id);
        renderChatList();
        triggerAiResponse();
      } else if (e.target.id === 'accept-friend-btn') {
        // 【修复】1. 先获取AI的申请理由，防止被清除
        const applicationReason = chat.relationship.applicationReason || '（对方没有留下理由，但我们和好了）';

        // 2. 更新状态
        chat.relationship.status = 'friend';
        chat.relationship.applicationReason = ''; // 现在可以安全清空了

        // 3. (可选) 保留系统消息
        const systemMessage = {
          role: 'system',
          type: 'pat_message',
          content: `你通过了“${chat.name}”的好友请求`,
          timestamp: Date.now()
        };
        chat.history.push(systemMessage);

        // 4. 【核心修复】将AI的“申请理由”作为它的第一条消息推入历史记录
        const applicationMessage = {
          role: 'assistant',
          senderName: chat.name,
          content: applicationReason, // <-- 使用AI自己生成的理由
          timestamp: Date.now() + 1
        };
        chat.history.push(applicationMessage);

        // 5. 保存并刷新
        await db.chats.put(chat);
        renderChatInterface(chat.id);
        renderChatList();

        // 6. (可选) 立即触发AI，让它对“被接受”这件事作出回应

      } else if (e.target.id === 'reject-friend-btn') {
        chat.relationship.status = 'blocked_by_user';
        chat.relationship.blockedTimestamp = Date.now();
        chat.relationship.applicationReason = '';
        await db.chats.put(chat);
        renderChatInterface(chat.id);
      } else if (e.target.id === 'apply-friend-btn') {
        const reason = await showCustomPrompt(
          '发送好友申请',
          `请输入你想对“${chat.name}”说的申请理由：`,
          "我们和好吧！"
        );

        if (reason !== null) {

          chat.relationship.status = 'pending_ai_approval';
          chat.relationship.applicationReason = reason;
          await db.chats.put(chat);


          renderChatInterface(chat.id);
          renderChatList();


          triggerAiResponse();
        }
      }
    });




    document.getElementById('transfer-btn').addEventListener('click', handlePaymentButtonClick);


    document.getElementById('cancel-red-packet-btn').addEventListener('click', () => {
      document.getElementById('red-packet-modal').classList.remove('visible');
    });
    document.getElementById('send-group-packet-btn').addEventListener('click', sendGroupRedPacket);
    document.getElementById('send-direct-packet-btn').addEventListener('click', sendDirectRedPacket);


    const rpTabGroup = document.getElementById('rp-tab-group');
    const rpTabDirect = document.getElementById('rp-tab-direct');
    const rpContentGroup = document.getElementById('rp-content-group');
    const rpContentDirect = document.getElementById('rp-content-direct');

    rpTabGroup.addEventListener('click', () => {
      rpTabGroup.classList.add('active');
      rpTabDirect.classList.remove('active');
      rpContentGroup.style.display = 'block';
      rpContentDirect.style.display = 'none';
    });
    rpTabDirect.addEventListener('click', () => {
      rpTabDirect.classList.add('active');
      rpTabGroup.classList.remove('active');
      rpContentDirect.style.display = 'block';
      rpContentGroup.style.display = 'none';
    });


    document.getElementById('rp-group-amount').addEventListener('input', (e) => {
      const amount = parseFloat(e.target.value) || 0;
      document.getElementById('rp-group-total').textContent = `¥ ${amount.toFixed(2)}`;
    });
    document.getElementById('rp-direct-amount').addEventListener('input', (e) => {
      const amount = parseFloat(e.target.value) || 0;
      document.getElementById('rp-direct-total').textContent = `¥ ${amount.toFixed(2)}`;
    });









    document.getElementById('send-poll-btn').addEventListener('click', openCreatePollModal);


    document.getElementById('add-poll-option-btn').addEventListener('click', addPollOptionInput);
    document.getElementById('cancel-create-poll-btn').addEventListener('click', () => {
      document.getElementById('create-poll-modal').classList.remove('visible');
    });
    document.getElementById('confirm-create-poll-btn').addEventListener('click', sendPoll);


    document.getElementById('chat-messages').addEventListener('click', (e) => {
      const pollCard = e.target.closest('.poll-card');
      if (!pollCard) return;

      const timestamp = parseInt(pollCard.dataset.pollTimestamp);
      if (isNaN(timestamp)) return;


      const optionItem = e.target.closest('.poll-option-item');
      if (optionItem && !pollCard.classList.contains('closed')) {
        handleUserVote(timestamp, optionItem.dataset.option);
        return;
      }


      const actionBtn = e.target.closest('.poll-action-btn');
      if (actionBtn) {
        if (pollCard.classList.contains('closed')) {
          showPollResults(timestamp);
        } else {
          endPoll(timestamp);
        }
        return;
      }


      if (pollCard.classList.contains('closed')) {
        showPollResults(timestamp);
      }
    });



    document.getElementById('manage-ai-avatar-library-btn').addEventListener('click', openAiAvatarLibraryModal);


    document.getElementById('add-ai-avatar-batch-btn').addEventListener('click', () => openBatchImportModal('ai'));


    document.getElementById('add-group-avatar-batch-btn').addEventListener('click', () => openBatchImportModal('group'));



    document.getElementById('add-ai-avatar-url-btn').addEventListener('click', addAvatarToLibraryFromURL);


    document.getElementById('add-ai-avatar-upload-btn').addEventListener('click', () => {
      document.getElementById('ai-avatar-upload-input').click();
    });


    document.getElementById('ai-avatar-upload-input').addEventListener('change', handleLocalAvatarUpload);

    document.getElementById('close-ai-avatar-library-btn').addEventListener('click', closeAiAvatarLibraryModal);


    document.getElementById('manage-group-avatar-library-btn').addEventListener('click', openGroupAvatarLibraryModal);



    document.getElementById('add-group-avatar-url-btn').addEventListener('click', addAvatarToGroupLibraryFromURL);


    document.getElementById('add-group-avatar-upload-btn').addEventListener('click', () => {
      document.getElementById('group-avatar-upload-input').click();
    });


    document.getElementById('group-avatar-upload-input').addEventListener('change', handleLocalGroupAvatarUpload);


    document.getElementById('close-group-avatar-library-btn').addEventListener('click', closeGroupAvatarLibraryModal);



    document.getElementById('icon-settings-grid').addEventListener('click', (e) => {
      if (e.target.classList.contains('change-icon-btn')) {
        const item = e.target.closest('.icon-setting-item');
        const iconId = item.dataset.iconId;
        if (iconId) {
          handleIconChange(iconId, 'ephone', item);
        }
      }
    });




    document.getElementById('chat-messages').addEventListener('click', (e) => {

      const linkCard = e.target.closest('.link-share-card');
      if (linkCard) {
        const timestamp = parseInt(linkCard.dataset.timestamp);
        if (!isNaN(timestamp)) {
          openBrowser(timestamp);
        }
      }
    });


    document.getElementById('browser-back-btn').addEventListener('click', () => {
      showScreen('chat-interface-screen');
    });



    qzoneStickerPanelState.panelEl.addEventListener('click', async (e) => {
      const stickerItem = e.target.closest('.sticker-item');
      if (stickerItem && qzoneStickerPanelState.activePostId !== null) {

        const stickerUrl = stickerItem.style.backgroundImage.slice(5, -2);


        const stickerObject = state.userStickers.find(s => s.url === stickerUrl);

        if (stickerObject) {

          await sendQzoneStickerComment(qzoneStickerPanelState.activePostId, stickerObject);
        } else {
          console.warn("在动态评论区点击了表情，但在表情库中未找到对象:", stickerUrl);
        }
      }
    });




    document.addEventListener('click', (e) => {
      if (qzoneStickerPanelState.isOpen &&
        !qzoneStickerPanelState.panelEl.contains(e.target) &&
        !e.target.closest('.comment-sticker-btn')) {
        closeQzoneStickerPanel();
      }
    });



    document.getElementById('share-link-btn').addEventListener('click', openShareLinkModal);


    document.getElementById('cancel-share-link-btn').addEventListener('click', () => {
      document.getElementById('share-link-modal').classList.remove('visible');
    });


    document.getElementById('confirm-share-link-btn').addEventListener('click', sendUserLinkShare);



    document.getElementById('theme-toggle-switch').addEventListener('change', toggleTheme);
    document.getElementById('detach-status-bar-switch').addEventListener('change', (e) => {
      applyDetachStatusBarMode(e.target.checked);
    });
    document.getElementById('phone-frame-toggle-switch').addEventListener('change', (e) => {
      applyPhoneFrame(e.target.checked);
    });


    document.getElementById('share-location-btn').addEventListener('click', sendLocationShare);





    document.getElementById('chat-list-title').addEventListener('click', renderCallHistoryScreen);


    document.getElementById('call-history-back-btn').addEventListener('click', () => {

      showScreen('chat-list-screen');
    });


    document.getElementById('call-history-list').addEventListener('click', (e) => {
      const card = e.target.closest('.call-record-card');
      if (card && card.dataset.recordId) {
        showCallTranscript(parseInt(card.dataset.recordId));
      }
    });


    document.getElementById('close-call-transcript-btn').addEventListener('click', () => {
      document.getElementById('call-transcript-modal').classList.remove('visible');
    });





    document.getElementById('chat-header-status').addEventListener('click', handleEditStatusClick);


    document.getElementById('selection-share-btn').addEventListener('click', () => {
      if (selectedMessages.size > 0) {
        openShareTargetPicker();
      }
    });
    document.getElementById('selection-forward-btn').addEventListener('click', () => {
      if (selectedMessages.size > 0) {
        openForwardTargetPicker();
      }
    });
    document.getElementById('selection-screenshot-btn').addEventListener('click', handleLongScreenshot);

    document.getElementById('confirm-share-target-btn').addEventListener('click', async () => {
      const sourceChat = state.chats[state.activeChatId];
      const selectedTargetIds = Array.from(document.querySelectorAll('.share-target-checkbox:checked'))
        .map(cb => cb.dataset.chatId);

      if (selectedTargetIds.length === 0) {
        alert("请至少选择一个要分享的聊天。");
        return;
      }


      const sharedHistory = [];
      const sortedTimestamps = [...selectedMessages].sort((a, b) => a - b);
      for (const timestamp of sortedTimestamps) {
        const msg = sourceChat.history.find(m => m.timestamp === timestamp);
        if (msg) {
          sharedHistory.push(msg);
        }
      }


      const shareCardMessage = {
        role: 'user',
        senderName: sourceChat.isGroup ? (sourceChat.settings.myNickname || '我') : '我',
        type: 'share_card',
        timestamp: Date.now(),
        payload: {
          sourceChatName: sourceChat.name,
          title: `来自“${sourceChat.name}”的聊天记录`,
          sharedHistory: sharedHistory
        }
      };


      for (const targetId of selectedTargetIds) {
        const targetChat = state.chats[targetId];
        if (targetChat) {
          targetChat.history.push(shareCardMessage);
          await db.chats.put(targetChat);
        }
      }


      document.getElementById('share-target-modal').classList.remove('visible');
      exitSelectionMode();
      await showCustomAlert("分享成功", `聊天记录已成功分享到 ${selectedTargetIds.length} 个会话中。`);
      renderChatList();
    });


    document.getElementById('cancel-share-target-btn').addEventListener('click', () => {
      document.getElementById('share-target-modal').classList.remove('visible');
    });

    document.getElementById('confirm-forward-target-btn').addEventListener('click', async () => {
      const sourceChat = state.chats[state.activeChatId];
      const selectedTargetIds = Array.from(document.querySelectorAll('.forward-target-checkbox:checked'))
        .map(cb => cb.dataset.chatId);

      if (selectedTargetIds.length === 0) {
        alert("请至少选择一个要转发的聊天。");
        return;
      }

      const sortedTimestamps = [...selectedMessages].sort((a, b) => a - b);

      for (const targetId of selectedTargetIds) {
        const targetChat = state.chats[targetId];
        if (!targetChat) continue;

        for (const timestamp of sortedTimestamps) {
          const msg = sourceChat.history.find(m => m.timestamp === timestamp);
          if (!msg) continue;

          const forwardedMessage = {
            role: 'user',
            senderName: targetChat.isGroup ? (targetChat.settings.myNickname || '我') : '我',
            content: msg.content,
            timestamp: Date.now() + sortedTimestamps.indexOf(timestamp),
          };

          if (msg.type) {
            forwardedMessage.type = msg.type;
            if (msg.type === 'voice_message') {
              forwardedMessage.content = msg.content;
            } else if (msg.type === 'ai_image' || msg.type === 'naiimag') {
              forwardedMessage.content = msg.content;
            } else if (msg.type === 'transfer') {
              forwardedMessage.amount = msg.amount;
              forwardedMessage.note = msg.note;
            } else if (msg.type === 'share_link') {
              forwardedMessage.title = msg.title;
              forwardedMessage.description = msg.description;
              forwardedMessage.source_name = msg.source_name;
              forwardedMessage.content = msg.content;
            } else if (msg.type === 'red_packet') {
              forwardedMessage.totalAmount = msg.totalAmount;
              forwardedMessage.count = msg.count;
              forwardedMessage.message = msg.message;
              forwardedMessage.claimed = [];
            } else if (msg.type === 'location_share') {
              forwardedMessage.latitude = msg.latitude;
              forwardedMessage.longitude = msg.longitude;
              forwardedMessage.locationName = msg.locationName;
            }
          }

          targetChat.history.push(forwardedMessage);
        }

        await db.chats.put(targetChat);
      }

      document.getElementById('forward-target-modal').classList.remove('visible');
      exitSelectionMode();
      await showCustomAlert("转发成功", `消息已成功转发到 ${selectedTargetIds.length} 个会话中。`);
      renderChatList();
    });

    document.getElementById('cancel-forward-target-btn').addEventListener('click', () => {
      document.getElementById('forward-target-modal').classList.remove('visible');
    });


    document.getElementById('chat-messages').addEventListener('click', (e) => {



      const shareCard = e.target.closest('.link-share-card[data-timestamp]');
      if (shareCard && shareCard.closest('.message-bubble.is-link-share')) {
        const timestamp = parseInt(shareCard.dataset.timestamp);
        openSharedHistoryViewer(timestamp);
      }
    });


    document.getElementById('close-shared-history-viewer-btn').addEventListener('click', () => {
      document.getElementById('shared-history-viewer-modal').classList.remove('visible');
    });


    async function openSharedHistoryViewer(timestamp) {
      const chat = state.chats[state.activeChatId];
      if (!chat) return;

      const message = chat.history.find(m => m.timestamp === timestamp);



      if (!message) {
        console.error("无法找到分享记录:", timestamp);
        await showCustomAlert("查看失败", "无法找到对应的分享记录或记录已损坏。");
        return;
      }


      if (message.type === 'share_link') {
        openBrowser(timestamp);
        return;
      }


      if (message.type === 'share_card') {
        if (!message.payload || !message.payload.sharedHistory) {
          console.error("聊天记录分享卡片数据损坏:", message);
          await showCustomAlert("查看失败", "分享的聊天记录已损坏。");
          return;
        }

      } else {

        console.error("未知的分享卡片类型:", message.type);
        await showCustomAlert("查看失败", "不支持的分享类型。");
        return;
      }

      const viewerModal = document.getElementById('shared-history-viewer-modal');
      const viewerTitle = document.getElementById('shared-history-viewer-title');
      const viewerContent = document.getElementById('shared-history-viewer-content');

      viewerTitle.textContent = message.payload.title;
      viewerContent.innerHTML = '';

      const fragment = document.createDocumentFragment();
      const sourceChat = Object.values(state.chats).find(c => c.name === message.payload.sourceChatName) || chat;

      for (const sharedMsg of message.payload.sharedHistory) {
        const bubbleEl = await createMessageElement(sharedMsg, sourceChat);
        if (bubbleEl) {
          fragment.appendChild(bubbleEl);
        }
      }

      viewerContent.appendChild(fragment);
      viewerModal.classList.add('visible');
    }

    audioPlayer.addEventListener('timeupdate', updateMusicProgressBar);

    audioPlayer.addEventListener('error', (e) => {
      console.error('[音乐播放] 音频加载/播放错误:', e);
      if (audioPlayer.error) {
        console.error('[音乐播放] 错误详情:', {
          code: audioPlayer.error.code,
          message: audioPlayer.error.message,
          src: audioPlayer.src
        });

        // 显示友好的错误提示
        let errorMsg = '音频播放失败: ';
        switch (audioPlayer.error.code) {
          case 1: errorMsg += '音频加载被中止'; break;
          case 2: errorMsg += '网络错误'; break;
          case 3: errorMsg += '音频解码失败'; break;
          case 4: errorMsg += '音频格式不支持或URL无效'; break;
          default: errorMsg += '未知错误';
        }
        console.warn(errorMsg);
      }
    });

    audioPlayer.addEventListener('pause', () => {
      if (musicState.isActive) {
        musicState.isPlaying = false;
        phoneScreenForIsland.classList.remove('dynamic-island-active');
        // --- 新增：暂停时停止旋转 ---
        document.getElementById('vinyl-view').classList.remove('spinning');
        updatePlayerUI();
      }
    });

    audioPlayer.addEventListener('play', () => {
      if (musicState.isActive) {
        musicState.isPlaying = true;
        // --- 新增：播放时开始旋转 ---
        document.getElementById('vinyl-view').classList.add('spinning');
        updatePlayerUI();
      }
    });

    // 添加音频加载错误处理
    audioPlayer.addEventListener('error', (e) => {
      console.error('[音频播放错误]', e);
      if (audioPlayer.error) {
        const errorMessages = {
          1: 'MEDIA_ERR_ABORTED: 音频加载被中止',
          2: 'MEDIA_ERR_NETWORK: 网络错误，无法加载音频',
          3: 'MEDIA_ERR_DECODE: 音频解码失败',
          4: 'MEDIA_ERR_SRC_NOT_SUPPORTED: 不支持的音频格式或无法找到音频源'
        };
        const errorMsg = errorMessages[audioPlayer.error.code] || '未知错误';
        console.error(`[音频错误] ${errorMsg}`, audioPlayer.src);

        // 如果是网络错误或源不支持，尝试重新加载
        if (audioPlayer.error.code === 2 || audioPlayer.error.code === 4) {
          console.log('[音频播放] 尝试重新加载音频...');
          setTimeout(() => {
            if (musicState.isActive && musicState.currentIndex >= 0) {
              const currentTrack = musicState.playlist[musicState.currentIndex];
              if (currentTrack) {
                console.log(`[音频播放] 重新加载: ${currentTrack.name}`);
                audioPlayer.load();
              }
            }
          }, 1000);
        }
      }
    });

    // 添加音频加载成功监听
    audioPlayer.addEventListener('loadeddata', () => {
      console.log('[音频播放] 音频数据加载成功');
    });

    // 添加可以播放监听
    audioPlayer.addEventListener('canplay', () => {
      console.log('[音频播放] 音频可以开始播放');
    });



    document.getElementById('playlist-body').addEventListener('click', async (e) => {
      const target = e.target;


      const albumArtBtn = target.closest('.album-art-btn');
      if (albumArtBtn) {
        const index = parseInt(albumArtBtn.dataset.index);
        if (!isNaN(index)) {

          await handleChangeAlbumArt(index);
        }
        return;
      }

      const lyricsBtn = target.closest('.lyrics-btn');
      if (lyricsBtn) {
        const index = parseInt(lyricsBtn.dataset.index);
        if (isNaN(index)) return;



        await handleManualLrcImport(index);

        return;
      }


      const deleteBtn = target.closest('.delete-track-btn');
      if (deleteBtn) {
        const index = parseInt(deleteBtn.dataset.index);
        if (isNaN(index)) return;
        const track = musicState.playlist[index];
        const confirmed = await showCustomConfirm('删除歌曲', `确定要从播放列表中删除《${track.name}》吗？`);
        if (confirmed) {
          deleteTrack(index);
        }
        return;
      }


      const itemInfo = target.closest('.playlist-item-info');
      if (itemInfo) {
        const item = itemInfo.closest('.playlist-item');
        const index = Array.from(item.parentElement.children).indexOf(item);
        if (index > -1) {
          playSong(index);
        }
      }
    });


    document.querySelector('.progress-bar').addEventListener('click', (e) => {
      if (!audioPlayer.duration) return;
      const progressBar = e.currentTarget;
      const barWidth = progressBar.clientWidth;
      const clickX = e.offsetX;
      audioPlayer.currentTime = (clickX / barWidth) * audioPlayer.duration;
    });




    document.getElementById('chat-messages').addEventListener('click', (e) => {

      // 【新增/修改】点击邮件卡片查看详情 (固定大小弹窗版)
      const emailCard = e.target.closest('.email-share-card');
      if (emailCard) {
        const jsonStr = decodeURIComponent(emailCard.dataset.emailJson);
        try {
          const data = JSON.parse(jsonStr);

          // 1. 获取模态框相关元素
          const overlay = document.getElementById('custom-modal-overlay');
          const modal = document.getElementById('custom-modal');
          const titleEl = document.getElementById('custom-modal-title');
          const bodyEl = document.getElementById('custom-modal-body');
          const footerEl = document.querySelector('#custom-modal .custom-modal-footer');

          // 2. 【核心步骤】临时修改模态框样式 (固定宽高)
          modal.style.width = '320px';        // 宽度加宽
          modal.style.height = '500px';       // 高度固定
          modal.style.maxHeight = '80vh';     // 防止超出屏幕

          // 3. 调整 Body 样式以支持内部滚动
          bodyEl.style.flex = '1';            // 撑满剩余空间
          bodyEl.style.overflowY = 'auto';    // 允许垂直滚动
          bodyEl.style.padding = '0';         // 清除默认内边距，由内部容器控制

          // 4. 设置标题
          titleEl.textContent = "邮件详情";

          // 5. 构造详情 HTML (优化布局)
          const detailHtml = `
                  <div style="padding: 20px; min-height: 100%; box-sizing: border-box; text-align: left;"> <div style="border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 15px;">
                          <div style="font-weight: 700; font-size: 18px; color: #111; line-height: 1.4; margin-bottom: 8px; word-break: break-word;">
                              ${escapeHTML(data.subject)}
                          </div>
                          <div style="display: flex; justify-content: space-between; align-items: center; color: #8a8a8a; font-size: 13px;">
                              <span><span style="color:#666;">发件人:</span> ${escapeHTML(data.sender)}</span>
                              <span>${data.date.split(' ')[0]}</span>
                          </div>
                      </div>
                      <div style="white-space: pre-wrap; color: #333; font-size: 15px; line-height: 1.8; font-family: -apple-system, sans-serif; letter-spacing: 0.5px;">${escapeHTML(data.fullContent)}</div>
                  </div>
              `;
          bodyEl.innerHTML = detailHtml;

          // 6. 重写底部按钮 (仅显示一个关闭按钮)
          footerEl.innerHTML = ''; // 清空原有按钮
          const closeBtn = document.createElement('button');
          closeBtn.textContent = '关闭';
          closeBtn.style.cssText = 'width: 100%; border: none; background: transparent; color: var(--accent-color); font-weight: 600; padding: 15px; font-size: 16px; cursor: pointer;';

          // 7. 绑定关闭事件 (关键：关闭时必须还原样式！)
          closeBtn.onclick = () => {
            overlay.classList.remove('visible');

            // 延迟还原样式，防止视觉跳动
            setTimeout(() => {
              modal.style.width = '';       // 还原宽度
              modal.style.height = '';      // 还原高度
              modal.style.maxHeight = '';
              bodyEl.style.flex = '';
              bodyEl.style.overflowY = '';
              bodyEl.style.padding = '';
            }, 300);
          };
          footerEl.appendChild(closeBtn);

          // 8. 显示弹窗
          overlay.classList.add('visible');

        } catch (err) {
          console.error("解析邮件数据失败", err);
        }
        return; // 阻止后续逻辑
      }
      const redditCard = e.target.closest('.reddit-share-card');
      if (redditCard) {
        const bubble = redditCard.closest('.message-bubble');
        if (bubble) {
          const timestamp = parseInt(bubble.dataset.timestamp);
          const chat = state.chats[state.activeChatId];
          // 在历史记录中找到这条消息
          const msg = chat.history.find(m => m.timestamp === timestamp);

          if (msg && msg.type === 'reddit_share' && msg.redditData) {
            // 调用你写好的详情页函数
            openRedditDetail(msg.redditData);
          }
        }
        return;
      }
      const placeholder = e.target.closest('.recalled-message-placeholder');
      if (placeholder) {
        const chat = state.chats[state.activeChatId];
        const wrapper = placeholder.closest('.message-wrapper');
        if (chat && wrapper) {
          const timestamp = parseInt(wrapper.dataset.timestamp);
          const recalledMsg = chat.history.find(m => m.timestamp === timestamp);

          if (recalledMsg && recalledMsg.recalledData) {
            let originalContentText = '';
            const recalled = recalledMsg.recalledData;


            switch (recalled.originalType) {
              case 'text':
                originalContentText = `原文: "${recalled.originalContent}"`;
                break;
              case 'user_photo':
              case 'ai_image':
              case 'text_image':
                originalContentText = `[图片/文字图] 描述: "${recalled.originalContent}"`;
                break;
              case 'voice_message':
                originalContentText = `[语音] 内容: "${recalled.originalContent}"`;
                break;
              case 'sticker':

                originalContentText = `[表情] 含义: "${recalled.originalMeaning || '(无)'}" \n URL: ${recalled.originalContent}`;
                break;
              case 'transfer':
                originalContentText = `一条[转账]消息已被撤回。`;
                break;
              default:

                originalContentText = `撤回了一条[${recalled.originalType}]类型的消息。\n内容: ${JSON.stringify(recalled.originalContent)}`;
                break;
            }


            showCustomAlert('已撤回的消息', originalContentText);
          }
        }
      }
    });




    document.getElementById('manage-world-book-categories-btn').addEventListener('click', openCategoryManager);
    document.getElementById('close-category-manager-btn').addEventListener('click', () => {
      document.getElementById('world-book-category-manager-modal').classList.remove('visible');
      renderWorldBookScreen();
    });
    document.getElementById('add-new-category-btn').addEventListener('click', addNewCategory);
    document.getElementById('existing-categories-list').addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-group-btn')) {
        const categoryId = parseInt(e.target.dataset.id);
        deleteCategory(categoryId);
      }
    });

    document.getElementById('repost-cancel-btn').addEventListener('click', hideRepostModal);
    document.getElementById('repost-confirm-btn').addEventListener('click', handleConfirmRepost);





    document.getElementById('quote-message-btn').addEventListener('click', startReplyToMessage);

    document.getElementById('forward-message-btn').addEventListener('click', () => {
      if (activeMessageTimestamp) {
        hideMessageActions();
        enterSelectionMode(activeMessageTimestamp);
      }
    });

    document.getElementById('cancel-reply-btn').addEventListener('click', cancelReplyMode);










    document.getElementById('qzone-posts-list').addEventListener('input', (e) => {
      if (!e.target.matches('.comment-input')) return;

      const commentInput = e.target;
      const postContainer = commentInput.closest('.qzone-post-container');
      if (!postContainer) return;

      const popup = postContainer.querySelector('.at-mention-popup');
      const value = commentInput.value;
      const atMatch = value.match(/@([\p{L}\w]*)$/u);

      if (atMatch) {
        const namesToMention = new Set();
        const authorNickname = postContainer.querySelector('.post-nickname')?.textContent;
        if (authorNickname) namesToMention.add(authorNickname);
        postContainer.querySelectorAll('.commenter-name').forEach(nameEl => {
          namesToMention.add(nameEl.textContent.replace(':', ''));
        });
        namesToMention.delete(state.qzoneSettings.nickname);

        popup.innerHTML = '';
        if (namesToMention.size > 0) {
          const searchTerm = atMatch[1];
          namesToMention.forEach(name => {
            if (name.toLowerCase().includes(searchTerm.toLowerCase())) {
              const item = document.createElement('div');
              item.className = 'at-mention-item';
              item.textContent = name;
              item.addEventListener('mousedown', (evt) => {
                evt.preventDefault();
                const newText = value.substring(0, atMatch.index) + `@${name} `;
                commentInput.value = newText;
                popup.style.display = 'none';
                commentInput.focus();
              });
              popup.appendChild(item);
            }
          });
          popup.style.display = popup.children.length > 0 ? 'block' : 'none';
        } else {
          popup.style.display = 'none';
        }
      } else {
        popup.style.display = 'none';
      }
    });

    document.getElementById('qzone-posts-list').addEventListener('focusout', (e) => {
      if (e.target.matches('.comment-input')) {
        const postContainer = e.target.closest('.qzone-post-container');
        if (postContainer) {
          const popup = postContainer.querySelector('.at-mention-popup');
          if (popup) {
            setTimeout(() => {
              popup.style.display = 'none';
            }, 200);
          }
        }
      }
    });





    const chatInputForMention = document.getElementById('chat-input');
    const chatMentionPopup = document.getElementById('chat-at-mention-popup');

    chatInputForMention.addEventListener('input', () => {

      if (!state.activeChatId) {
        chatMentionPopup.style.display = 'none';
        return;
      }

      const chat = state.chats[state.activeChatId];
      const value = chatInputForMention.value;
      const atMatch = value.match(/@([\p{L}\w]*)$/u);

      if (atMatch) {
        const searchTerm = atMatch[1];

        // 收集所有可以@的对象（群成员）
        let namesToMention = [];

        // 如果是群聊，添加群成员
        if (chat.isGroup) {
          const myNickname = chat.settings.myNickname || '我';
          const memberNames = chat.members
            .map(member => ({ name: member.groupNickname, type: 'member' }))
            .filter(item => item.name !== myNickname);
          namesToMention = namesToMention.concat(memberNames);
        }

        chatMentionPopup.innerHTML = '';

        if (namesToMention.length > 0) {
          // 过滤匹配的名字
          const filteredNames = namesToMention.filter(item =>
            item.name.toLowerCase().includes(searchTerm.toLowerCase())
          );

          filteredNames.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.className = 'at-mention-item';
            menuItem.textContent = item.name;

            menuItem.addEventListener('mousedown', (e) => {
              e.preventDefault();
              const newText = value.substring(0, atMatch.index) + `@${item.name} `;
              chatInputForMention.value = newText;
              chatMentionPopup.style.display = 'none';
              chatInputForMention.focus();
            });
            chatMentionPopup.appendChild(menuItem);
          });

          chatMentionPopup.style.display = chatMentionPopup.children.length > 0 ? 'block' : 'none';
        } else {
          chatMentionPopup.style.display = 'none';
        }
      } else {
        chatMentionPopup.style.display = 'none';
      }
    });


    chatInputForMention.addEventListener('blur', () => {
      setTimeout(() => {
        chatMentionPopup.style.display = 'none';
      }, 200);
    });


    document.getElementById('publish-to-announcement-btn').addEventListener('click', publishToAnnouncementBoard);
    document.getElementById('show-announcement-board-btn').addEventListener('click', showAnnouncementBoard);
    document.getElementById('close-announcement-board-btn').addEventListener('click', () => {
      document.getElementById('announcement-board-modal').classList.remove('visible');
    });


    document.getElementById('announcement-board-content').addEventListener('click', (e) => {
      if (e.target.classList.contains('announcement-item-actions')) {
        const annoId = e.target.dataset.annoId;
        if (annoId) {
          showAnnouncementActions(annoId);
        }
      }
    });

    document.getElementById('announcement-action-pin').addEventListener('click', handlePinAnnouncement);
    document.getElementById('announcement-action-delete').addEventListener('click', handleDeleteAnnouncement);
    document.getElementById('announcement-action-cancel').addEventListener('click', () => {
      document.getElementById('announcement-actions-modal').classList.remove('visible');
    });


    document.getElementById('reset-global-css-btn').addEventListener('click', () => {
      document.getElementById('global-css-input').value = '';


    });



    document.getElementById('open-memory-screen-btn').addEventListener('click', openLongTermMemoryScreen);


    document.getElementById('memory-screen-back-btn').addEventListener('click', () => {
      showScreen('chat-interface-screen');
    });


    document.getElementById('add-manual-memory-btn-header').addEventListener('click', handleAddManualMemory);


    document.getElementById('summarize-recent-btn-header').addEventListener('click', handleManualSummary);

    // 结构化记忆 Tab 切换
    document.getElementById('memory-tab-original').addEventListener('click', () => switchMemoryTab('original'));
    document.getElementById('memory-tab-structured').addEventListener('click', () => switchMemoryTab('structured'));
    document.getElementById('memory-tab-vector').addEventListener('click', () => switchMemoryTab('vector'));

    document.getElementById('memory-list-container').addEventListener('click', (e) => {
      const editBtn = e.target.closest('.edit-memory-btn');
      if (editBtn) {
        handleEditMemory(editBtn.dataset.authorId, parseInt(editBtn.dataset.memoryTimestamp));
        return;
      }
      const deleteBtn = e.target.closest('.delete-memory-btn');
      if (deleteBtn) {
        handleDeleteMemory(deleteBtn.dataset.authorId, parseInt(deleteBtn.dataset.memoryTimestamp));
        return;
      }
    });


    document.getElementById('gomoku-btn').addEventListener('click', toggleGomokuBoard);
    document.getElementById('close-gomoku-btn').addEventListener('click', closeGomokuBoard);

    const gomokuCanvas = document.getElementById('gomoku-board');
    gomokuCanvas.addEventListener('mousemove', handleBoardHover);
    gomokuCanvas.addEventListener('mouseout', () => renderGomokuBoard(state.activeChatId));
    gomokuCanvas.addEventListener('click', handleBoardClick);


    document.getElementById('add-countdown-btn').addEventListener('click', () => {

      document.getElementById('countdown-title-input').value = '';
      document.getElementById('countdown-date-input').value = '';

      document.getElementById('create-countdown-modal').classList.add('visible');
    });


    document.getElementById('cancel-create-countdown-btn').addEventListener('click', () => {
      document.getElementById('create-countdown-modal').classList.remove('visible');
    });



    document.getElementById('edit-call-message-btn').addEventListener('click', openCallMessageEditor);
    document.getElementById('delete-call-message-btn').addEventListener('click', deleteCallMessage);
    document.getElementById('cancel-call-message-action-btn').addEventListener('click', hideCallMessageActions);


    document.getElementById('edit-last-response-btn').addEventListener('click', openAiResponseEditor);
    document.getElementById('cancel-ai-response-editor-btn').addEventListener('click', () => {
      document.getElementById('ai-response-editor-modal').classList.remove('visible');
    });
    document.getElementById('save-ai-response-editor-btn').addEventListener('click', saveEditedAiResponse);
    document.getElementById('add-ai-response-block-btn').addEventListener('click', () => {

      const container = document.getElementById('ai-response-editor-container');
      const newBlock = createAiResponseEditorBlock('{\n  "type": "text",\n  "content": "在这里输入新消息..."\n}');
      container.appendChild(newBlock);
      newBlock.querySelector('textarea').focus();
    });


    document.getElementById('manage-my-avatar-library-btn').addEventListener('click', openMyAvatarLibraryModal);
    document.getElementById('close-my-avatar-library-btn').addEventListener('click', closeMyAvatarLibraryModal);
    document.getElementById('add-my-avatar-url-btn').addEventListener('click', addAvatarToMyLibraryFromURL);
    document.getElementById('add-my-avatar-upload-btn').addEventListener('click', () => {
      document.getElementById('my-avatar-upload-input').click();
    });
    document.getElementById('my-avatar-upload-input').addEventListener('change', handleLocalMyAvatarUpload);
    document.getElementById('add-my-avatar-batch-btn').addEventListener('click', async () => {
      const placeholderText = `请按照以下格式粘贴，一行一个：\n\n焦虑 2a9wte.jpeg\n大惊失色 or8qf4.png\n没有灵感 njwujh.jpeg`;
      const pastedText = await showCustomPrompt('批量导入头像', placeholderText, '', 'textarea');
      if (pastedText && pastedText.trim()) {
        await handleBatchImportForMyAvatar(pastedText);
      }
    });


    document.getElementById('open-shopping-btn').addEventListener('click', openShoppingScreen);
    document.getElementById('shopping-back-btn').addEventListener('click', () => showScreen('chat-interface-screen'));
    document.getElementById('go-to-cart-btn').addEventListener('click', openCartScreen);
    document.getElementById('cart-back-btn').addEventListener('click', openShoppingScreen);
    document.getElementById('checkout-btn').addEventListener('click', handleCheckout);
    document.getElementById('close-receipt-btn').addEventListener('click', () => {
      document.getElementById('gift-receipt-modal').classList.remove('visible');
    });


    document.getElementById('manage-products-btn').addEventListener('click', () => {
      isProductManagementMode = !isProductManagementMode;
      const btn = document.getElementById('manage-products-btn');
      const actionBar = document.getElementById('shopping-action-bar');
      const gridEl = document.getElementById('product-grid');

      btn.style.color = isProductManagementMode ? 'var(--accent-color)' : 'var(--text-primary)';

      if (isProductManagementMode) {
        actionBar.style.display = 'flex';
        gridEl.style.paddingBottom = '80px';
      } else {
        actionBar.style.display = 'none';
        gridEl.style.paddingBottom = '';

        selectedProducts.clear();
        document.querySelectorAll('.product-item.selected').forEach(item => item.classList.remove('selected'));
        document.getElementById('delete-selected-products-btn').textContent = `删除 (0)`;
        document.getElementById('select-all-products-checkbox').checked = false;
      }


      renderShoppingProducts();
      updateDeleteCategoryButtonVisibility();
    });


    document.getElementById('add-new-product-btn').addEventListener('click', () => {
      if (isProductManagementMode) {
        openProductEditor(null);
      } else {
        alert("请先点击扳手图标进入管理模式，才能添加新商品。");
      }
    });



    document.getElementById('product-grid').addEventListener('click', async e => {
      const productItem = e.target.closest('.product-item');
      if (!productItem) return;
      const productId = parseInt(productItem.dataset.id);
      if (isNaN(productId)) return;


      if (isProductManagementMode) {

        if (e.target.classList.contains('edit-product-btn')) {
          openProductEditor(productId);
          return;
        }

        if (e.target.classList.contains('delete-product-btn')) {
          const product = await db.shoppingProducts.get(productId);
          if (!product) return;
          const confirmed = await showCustomConfirm('删除商品', `确定要永久删除商品 “${product.name}” 吗？`, {
            confirmButtonClass: 'btn-danger'
          });
          if (confirmed) {
            await db.shoppingProducts.delete(productId);
            await renderShoppingProducts();
            alert("商品已删除。");
          }
          return;
        }


        productItem.classList.toggle('selected');
        if (selectedProducts.has(productId)) {
          selectedProducts.delete(productId);
        } else {
          selectedProducts.add(productId);
        }
        document.getElementById('delete-selected-products-btn').textContent = `删除 (${selectedProducts.size})`;
        return;
      }


      if (e.target.classList.contains('add-to-cart-btn')) {
        const product = await db.shoppingProducts.get(productId);
        if (product.variations && product.variations.length > 0) {
          openVariationSelector(productId);
        } else {
          await addToCart(productId);
          await showCustomAlert('成功', '已成功加入购物车！');
        }
        return;
      }


      if (productItem.contains(e.target)) {
        console.log(`点击了商品卡片: ${productId}`);
      }
    });



    document.getElementById('cart-items-list').addEventListener('click', e => {
      const target = e.target;
      if (target.classList.contains('decrease-qty-btn')) {
        updateCartItemQuantity(parseInt(target.dataset.id), -1);
      }
      if (target.classList.contains('increase-qty-btn')) {
        updateCartItemQuantity(parseInt(target.dataset.id), 1);
      }
      if (target.classList.contains('cart-item-checkbox')) {
        updateCartTotal();
      }
    });


    document.getElementById('clear-cart-btn').addEventListener('click', async () => {
      if (shoppingCart.length === 0) return;
      const confirmed = await showCustomConfirm('清空购物车', '确定要清空购物车中的所有商品吗？');
      if (confirmed) {
        shoppingCart = [];
        updateCartCount();
        renderCartItems();
        saveShoppingCart(); // 保存购物车
      }
    });


    document.getElementById('select-all-cart-items').addEventListener('change', function (e) {
      document.querySelectorAll('.cart-item-checkbox').forEach(cb => {
        cb.checked = e.target.checked;
      });
      updateCartTotal();
    });


    document.getElementById('cancel-product-editor-btn').addEventListener('click', () => {
      document.getElementById('product-editor-modal').classList.remove('visible');
    });
    document.getElementById('save-product-btn').addEventListener('click', saveProduct);
    document.getElementById('product-image-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (re) => {
          document.getElementById('product-image-preview').src = re.target.result;
        };
        reader.readAsDataURL(file);
      }
    });


    document.getElementById('chat-messages').addEventListener('click', e => {
      const giftCard = e.target.closest('.gift-card');
      if (giftCard) {
        const bubble = giftCard.closest('.message-bubble');
        if (bubble) {
          showGiftReceipt(parseInt(bubble.dataset.timestamp));
        }
      }
    });


    document.getElementById('cancel-gift-recipient-btn').addEventListener('click', () => {
      document.getElementById('gift-recipient-modal').classList.remove('visible');
    });


    document.getElementById('confirm-gift-recipient-btn').addEventListener('click', async () => {

      const selectedRecipients = Array.from(document.querySelectorAll('#gift-recipient-list .contact-picker-item.selected'))
        .map(item => item.dataset.recipientName);

      if (selectedRecipients.length === 0) {
        alert("请至少选择一位收礼人。");
        return;
      }


      const selectedItems = shoppingCart.filter(item =>
        document.querySelector(`.cart-item-checkbox[data-id="${item.productId}"]:checked`)
      );


      await sendGiftMessage(selectedItems, selectedRecipients);


      document.getElementById('gift-recipient-modal').classList.remove('visible');
    });


    document.getElementById('gift-recipient-list').addEventListener('click', (e) => {
      const item = e.target.closest('.contact-picker-item');
      if (item) {
        item.classList.toggle('selected');
      }
    });

    document.getElementById('select-all-recipients').addEventListener('change', function (e) {
      const isChecked = e.target.checked;
      document.querySelectorAll('#gift-recipient-list .contact-picker-item').forEach(item => {
        item.classList.toggle('selected', isChecked);
      });
    });


    document.getElementById('regenerate-btn').addEventListener('click', handleRegenerateResponse);
    document.getElementById('regenerate-call-btn').addEventListener('click', handleRegenerateCallResponse);


    document.getElementById('propel-btn').addEventListener('click', handlePropelAction);


    // ========== 提示音预设管理功能结束 ==========

    // 暴露需要跨文件引用的函数到 window
    window.renderMemoryArchiveList = renderMemoryArchiveList;
    window.openSharedHistoryViewer = openSharedHistoryViewer;

};
