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
      const addedMemory = {
        content: content.trim(),
        timestamp: Date.now(),
        source: 'manual'
      };
      targetChatForMemory.longTermMemory.push(addedMemory);
      await db.chats.put(targetChatForMemory);
      window.normalMemoryManager?.afterSummary(targetChatForMemory, addedMemory, null, targetChatForMemory).catch(error => console.warn('[普通记忆]', error));
      renderLongTermMemoryList();
    }
  }

  async function handleEditMemory(authorChatId, memoryTimestamp, normalMemoryId = null) {
    const authorChat = state.chats[authorChatId];
    if (!authorChat || !authorChat.longTermMemory) return;
    const memoryIndex = authorChat.longTermMemory.findIndex(m => normalMemoryId ? m.normalMemoryId === normalMemoryId : m.timestamp === memoryTimestamp);
    if (memoryIndex === -1) return;
    const memory = authorChat.longTermMemory[memoryIndex];
    const newContent = await showCustomPrompt('编辑记忆', '请修改记忆要点：', memory.content, 'textarea');
    if (newContent && newContent.trim()) {
      memory.content = newContent.trim();
      await db.chats.put(authorChat);
      renderLongTermMemoryList();
    }
  }

  async function handleDeleteMemory(authorChatId, memoryTimestamp, normalMemoryId = null) {
    const confirmed = await showCustomConfirm('确认删除', '确定要删除这条长期记忆吗？', {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      const authorChat = state.chats[authorChatId];
      if (!authorChat || !authorChat.longTermMemory) return;
      authorChat.longTermMemory = authorChat.longTermMemory.filter(m => normalMemoryId ? m.normalMemoryId !== normalMemoryId : m.timestamp !== memoryTimestamp);
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
        const systemPrompt = await (window.structuredMemoryManager.buildSummaryPromptForRequest || window.structuredMemoryManager.buildSummaryPrompt).call(window.structuredMemoryManager, chat, formattedMemories, timeRangeStr);

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
