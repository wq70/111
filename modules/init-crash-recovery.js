// ============================================================
// init-crash-recovery.js
// 崩溃恢复检测 - 应用启动时执行
// 从 init-and-state.js 拆分
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

  // ========================================
  // 🛡️ 崩溃恢复检测 - 应用启动时执行
  // ========================================
  (async () => {
    // 等待数据库就绪
    await window.dbReadyPromise;
    
    const CrashRecoveryDetector = window.CrashRecoveryDetector;
    const OperationLogger = window.OperationLogger;
    const DualWriteManager = window.DualWriteManager;

    // 检测是否有异常退出
    const hadCrash = CrashRecoveryDetector.markSessionStart();
    
    if (hadCrash) {
      console.warn('⚠️ 检测到上次异常退出');
      
      // 检查是否有未保存的操作日志
      const unsavedLogs = OperationLogger.getLogs();
      const lastSnapshot = DualWriteManager.getSnapshot();
      const lastSaveTime = DualWriteManager.getLastSaveTime();
      
      // 构建恢复信息
      let recoveryInfo = '<div style="max-height: 40vh; overflow-y: auto; padding-right: 5px;">';
      recoveryInfo += '<div style="margin-bottom: 15px;"><button id="clear-global-css-btn" style="width: 100%; padding: 10px; background: #ff4d4f; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">🧹 清除全局自定义CSS (防错位)</button></div>';
      recoveryInfo += '<b>【您的数据是安全的】</b>\n';
      recoveryInfo += '检测到应用上次异常关闭。您的所有数据已自动保存在本地数据库中，不会丢失。\n\n';
      
      recoveryInfo += '<b>【当前数据状态】</b>\n';
      
      if (lastSaveTime) {
        const timeDiff = Date.now() - lastSaveTime;
        const minutesAgo = Math.floor(timeDiff / 60000);
        recoveryInfo += `最后保存时间：${minutesAgo} 分钟前\n`;
      }
      
      if (lastSnapshot) {
        recoveryInfo += `数据快照：聊天 ${lastSnapshot.summary?.chatsCount || 0} | 说说 ${lastSnapshot.summary?.qzonePostsCount || 0} | NPC ${lastSnapshot.summary?.npcsCount || 0}\n`;
      }
      
      if (unsavedLogs.length > 0) {
        recoveryInfo += `\n检测到 ${unsavedLogs.length} 条未保存的操作记录\n`;
        
        // 显示最近的几条操作
        const recentOps = unsavedLogs.slice(-5).map(log => {
          const time = new Date(log.timestamp).toLocaleTimeString();
          return `• ${time}：${log.operation} ${log.tableName}`;
        }).join('\n');
        
        recoveryInfo += recentOps + '\n';
      }
      
      recoveryInfo += '\n您可以继续正常使用，数据已经恢复完成。';
      recoveryInfo += '</div>';
      
      // 显示恢复提示（使用原有的 showCustomAlert）
      if (typeof showCustomAlert === 'function') {
        const alertPromise = showCustomAlert('正常启动提示', recoveryInfo);
        setTimeout(() => {
          const btn = document.getElementById('clear-global-css-btn');
          if (btn) {
            btn.onclick = () => {
              // 1. 更新内存状态
              if (window.state && window.state.globalSettings) {
                window.state.globalSettings.globalCss = '';
                // 2. 更新数据库
                if (window.db && window.db.globalSettings) {
                  window.db.globalSettings.put({ id: 1, ...window.state.globalSettings }).catch(console.error);
                }
              }
              // 3. 更新输入框（如果存在）
              const globalCssInput = document.getElementById('global-css-input');
              if (globalCssInput) globalCssInput.value = '';
              // 4. 清除页面上的样式标签
              const styleEl = document.getElementById('global-custom-style');
              if (styleEl) styleEl.textContent = '';
              
              // 5. 如果有 applyGlobalCss 函数，调用它以确保应用空样式
              if (typeof window.applyGlobalCss === 'function') {
                window.applyGlobalCss('');
              }
              
              // 6. 重新渲染聊天消息 (如果有激活的聊天)，确保气泡等恢复默认
              if (window.state && window.state.activeChatId && typeof window.renderMessages === 'function') {
                  const chat = window.state.chats[window.state.activeChatId];
                  if (chat) window.renderMessages(chat);
              }

              btn.textContent = '✅ 已清除全局CSS';
              btn.style.background = '#52c41a';
            };
          }
        }, 100);
        await alertPromise;
      } else {
        // 如果 showCustomAlert 还未定义，使用 alert
        alert('正常启动提示\n\n检测到应用上次异常关闭。数据安全。');
      }
      
      console.log('[崩溃恢复] 恢复信息:', {
        unsavedLogs: unsavedLogs.length,
        lastSnapshot,
        lastSaveTime: lastSaveTime ? new Date(lastSaveTime).toLocaleString() : null
      });
    } else {
      console.log('[崩溃恢复] 正常启动，无需恢复');
    }
    
    // 启动初始快照保存
    setTimeout(() => {
      DualWriteManager.saveSnapshot();
    }, 5000); // 启动 5 秒后保存第一个快照
  })();
  // ========================================
  // 🛡️ 崩溃恢复检测结束
  // ========================================

});
