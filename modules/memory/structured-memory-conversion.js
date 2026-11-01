// ==================== 结构化动态记忆 - 长期记忆转换 ====================
async function convertLongTermMemoryToStructured(chatId) {
  const chat = state.chats[chatId];
  if (!chat || !window.structuredMemoryManager || !chat.longTermMemory || chat.longTermMemory.length === 0) {
    showToast('没有可转换的长期记忆', 'warning');
    return;
  }

  const totalMemories = chat.longTermMemory.length;
  const BATCH_SIZE = 50; // 每批处理50条记忆
  const totalBatches = Math.ceil(totalMemories / BATCH_SIZE);

  // 估算总 token 数
  const estimatedTotalTokens = chat.longTermMemory.reduce((sum, mem) => sum + mem.content.length, 0) / 1.5;
  
  // 预检查：如果记忆过多，给出提示
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
  
  // API 配置
  const useSecondaryApi = state.apiConfig.secondaryProxyUrl && state.apiConfig.secondaryApiKey && state.apiConfig.secondaryModel;
  const { proxyUrl, apiKey, model } = useSecondaryApi
    ? { proxyUrl: state.apiConfig.secondaryProxyUrl, apiKey: state.apiConfig.secondaryApiKey, model: state.apiConfig.secondaryModel }
    : state.apiConfig;

  if (!proxyUrl || !apiKey || !model) {
    showToast('API未配置，无法转换', 'error');
    return;
  }

  // 创建进度提示
  let progressToast = null;
  let isCancelled = false;
  
  const updateProgress = (current, total, successCount) => {
    const message = `转换中... ${current}/${total} 批\n已提取 ${successCount} 条结构化记忆`;
    if (progressToast) {
      // 更新现有提示
      const toastElement = document.querySelector('.toast:last-child');
      if (toastElement) {
        toastElement.textContent = message;
      }
    } else {
      progressToast = showToast(message, 'info', 0); // 持续显示
    }
  };

  let totalEntriesExtracted = 0;
  let successfulBatches = 0;
  let failedBatches = 0;

  try {
    // 分批处理
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      if (isCancelled) {
        showToast('转换已取消', 'info');
        break;
      }

      const start = batchIndex * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, totalMemories);
      const batchMemories = chat.longTermMemory.slice(start, end);

      updateProgress(batchIndex + 1, totalBatches, totalEntriesExtracted);

      // 格式化当前批次的记忆
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

        // 解析并合并
        const entries = window.structuredMemoryManager.parseMemoryEntries(rawContent, chat);
        if (entries.length > 0) {
          window.structuredMemoryManager.mergeEntries(chat, entries);
          totalEntriesExtracted += entries.length;
          successfulBatches++;
          console.log(`批次 ${batchIndex + 1}/${totalBatches}: 成功提取 ${entries.length} 条记忆`);
        } else {
          console.warn(`批次 ${batchIndex + 1}/${totalBatches}: AI 未返回有效数据`);
          console.warn('AI 返回内容:', rawContent.substring(0, 500)); // 记录前500字符用于调试
          failedBatches++;
        }

        // 每批处理后保存一次
        await db.chats.put(chat);

        // 批次间延迟，避免 API 限流
        if (batchIndex < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 延迟1秒
        }

      } catch (batchError) {
        console.error(`批次 ${batchIndex + 1} 处理出错:`, batchError);
        failedBatches++;
        continue;
      }
    }

    // 清除进度提示
    if (progressToast) {
      const toastElements = document.querySelectorAll('.toast');
      toastElements.forEach(el => el.remove());
    }

    // 最终结果提示
    if (totalEntriesExtracted > 0) {
      let resultMessage = `转换完成！\n- 成功批次：${successfulBatches}/${totalBatches}\n- 提取记忆：${totalEntriesExtracted} 条`;
      if (failedBatches > 0) {
        resultMessage += `\n- 失败批次：${failedBatches}`;
      }
      showToast(resultMessage, successfulBatches === totalBatches ? 'success' : 'warning', 5000);
      console.log(`长期记忆转换完成: ${totalMemories} 条记忆 -> ${totalEntriesExtracted} 条结构化记忆 (${successfulBatches}/${totalBatches} 批成功)`);
    } else {
      showToast(`转换失败：所有批次都未能提取有效数据\n- 原记忆数：${totalMemories} 条\n- 失败批次：${failedBatches}\n\n可能原因：\n1. Token 数量仍然过多\n2. AI 返回格式不符合要求\n3. API 配置问题\n\n请查看控制台获取详细信息`, 'error', 8000);
      console.error('长期记忆转换失败：未能提取任何有效条目');
      console.error('记忆总数:', totalMemories);
      console.error('估算 tokens:', Math.ceil(estimatedTotalTokens));
    }

  } catch (error) {
    // 清除进度提示
    if (progressToast) {
      const toastElements = document.querySelectorAll('.toast');
      toastElements.forEach(el => el.remove());
    }
    
    console.error('长期记忆转换出错:', error);
    showToast(`转换失败：${error.message}\n已成功转换 ${successfulBatches} 批`, 'error', 5000);
  }
}

// ==================== 结构化动态记忆 - 自动总结 ====================
async function triggerStructuredMemorySummary(chatId, forceUpdate = false) {
  const chat = state.chats[chatId];
  if (!chat || !window.structuredMemoryManager) return;
  window._structuredMemoryExtractionLocks ||= new Set();
  if (window._structuredMemoryExtractionLocks.has(chatId)) return;

  const lastTimestamp = chat.lastStructuredMemoryTimestamp || 0;
  const messagesToSummarize = (chat.history || []).filter(m => Number(m?.timestamp) > lastTimestamp && (!m?.isHidden || (m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('内心独白'))));

  console.log(`[结构化记忆] 检查更新: 上次时间戳=${lastTimestamp}, 待总结消息=${messagesToSummarize.length}条`);

  // 如果不是强制更新且消息太少，则跳过
  if (!forceUpdate && messagesToSummarize.length < 5) {
    console.log(`[结构化记忆] 消息数量不足(${messagesToSummarize.length}/5)，跳过本次更新`);
    return;
  }
  if (messagesToSummarize.length === 0) {
    if (forceUpdate) showToast('没有新的对话需要提取', 'info');
    return;
  }

  window._structuredMemoryExtractionLocks.add(chatId);

  const userNickname = chat.settings.myNickname || (state.qzoneSettings.nickname || '用户');
  const startMsg = messagesToSummarize[0];
  const endMsg = messagesToSummarize[messagesToSummarize.length - 1];

  const formatDateTime = (ts) => new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const timeRangeStr = `${formatDateTime(startMsg.timestamp)} 至 ${formatDateTime(endMsg.timestamp)}`;

  // 格式化对话历史
  const formattedHistory = messagesToSummarize.map(msg => {
    return window.MemoryExtractionSupport.formatMessage(msg, chat);
  }).filter(Boolean).join('\n');

  const systemPrompt = await (window.structuredMemoryManager.buildSummaryPromptForRequest || window.structuredMemoryManager.buildSummaryPrompt).call(window.structuredMemoryManager, chat, formattedHistory, timeRangeStr);

  try {
    const useSecondaryApi = state.apiConfig.secondaryProxyUrl && state.apiConfig.secondaryApiKey && state.apiConfig.secondaryModel;
    const { proxyUrl, apiKey, model } = useSecondaryApi
      ? { proxyUrl: state.apiConfig.secondaryProxyUrl, apiKey: state.apiConfig.secondaryApiKey, model: state.apiConfig.secondaryModel }
      : state.apiConfig;

    if (!proxyUrl || !apiKey || !model) throw new Error('API未配置');

    let isGemini = proxyUrl.includes('generativelanguage');
    let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, [{ role: 'user', content: '请提取结构化记忆。' }]);

    const response = isGemini
      ? await fetch(geminiConfig.url, geminiConfig.data)
      : await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: '请提取结构化记忆。' }],
            temperature: 0.3
          })
        });

    if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

    const data = await response.json();
    let rawContent = isGemini ? getGeminiResponseText(data) : data.choices[0].message.content;
    rawContent = rawContent.replace(/^```[a-z]*\s*/g, '').replace(/```$/g, '').trim();

    // 解析并合并
    const entries = window.structuredMemoryManager.parseMemoryEntries(rawContent, chat);
    if (entries.length > 0) {
      window.structuredMemoryManager.mergeEntries(chat, entries);
      const newTimestamp = endMsg.timestamp;
      chat.lastStructuredMemoryTimestamp = newTimestamp;
      await db.chats.put(chat);
      console.log(`[结构化记忆] 成功提取并合并 ${entries.length} 条记忆条目`);
      console.log(`[结构化记忆] 时间戳已更新: ${lastTimestamp} -> ${newTimestamp}`);
    } else {
      console.warn('[结构化记忆] AI 未返回有效的记忆条目，保持原时间戳不变');
      console.log('[结构化记忆] AI原始返回:', rawContent);
      // 即使没有新条目，也应该更新时间戳，避免重复处理相同消息
      if (messagesToSummarize.length > 0) {
        chat.lastStructuredMemoryTimestamp = endMsg.timestamp;
        await db.chats.put(chat);
        console.log(`[结构化记忆] 虽无有效条目，但已更新时间戳避免重复处理`);
      }
    }
    return entries.length;
  } catch (error) {
    console.error('[结构化记忆] 总结出错:', error);
    showToast(`结构化记忆提取失败：${error.message}`, 'error');
    return null;
  } finally {
    window._structuredMemoryExtractionLocks.delete(chatId);
  }
}

