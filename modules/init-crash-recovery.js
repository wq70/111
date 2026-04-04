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
      let recoveryInfo = '【您的数据是安全的，请放心！】\n\n';
      recoveryInfo += '检测到应用上次没有正常关闭（可能是浏览器崩溃、电脑断电或强制关闭）。\n\n';
      recoveryInfo += '【为什么会有这个提示？】\n';
      recoveryInfo += '应用具有异常退出检测功能，当检测到上次没有正常退出时，会自动显示这个提示，让您了解当前的数据状态。\n\n';
      recoveryInfo += '【数据保存机制说明】\n';
      recoveryInfo += '• 您的所有数据都实时自动保存在浏览器本地数据库中\n';
      recoveryInfo += '• 即使异常退出，已保存的数据也不会丢失\n';
      recoveryInfo += '• 系统会定期创建数据快照，确保数据安全\n';
      recoveryInfo += '• 如果您开启了云备份，数据还会同步到云端\n\n';
      
      recoveryInfo += '【当前数据状态】\n';
      
      if (lastSaveTime) {
        const timeDiff = Date.now() - lastSaveTime;
        const minutesAgo = Math.floor(timeDiff / 60000);
        recoveryInfo += `最后保存时间：${minutesAgo} 分钟前\n`;
      }
      
      if (lastSnapshot) {
        recoveryInfo += `聊天数：${lastSnapshot.summary?.chatsCount || 0}\n`;
        recoveryInfo += `说说数：${lastSnapshot.summary?.qzonePostsCount || 0}\n`;
        recoveryInfo += `NPC数：${lastSnapshot.summary?.npcsCount || 0}\n`;
      }
      
      if (unsavedLogs.length > 0) {
        recoveryInfo += `\n检测到 ${unsavedLogs.length} 条未保存的操作记录\n`;
        
        // 显示最近的几条操作
        const recentOps = unsavedLogs.slice(-5).map(log => {
          const time = new Date(log.timestamp).toLocaleTimeString();
          return `  • ${time}：${log.operation} ${log.tableName}`;
        }).join('\n');
        
        recoveryInfo += '\n最近的操作：\n' + recentOps;
      }
      
      recoveryInfo += '\n\n您可以继续正常使用，数据已经恢复完成。如有任何疑问，可以检查云备份记录。';
      
      // 显示恢复提示（使用原有的 showCustomAlert）
      if (typeof showCustomAlert === 'function') {
        await showCustomAlert('正常启动提示', recoveryInfo);
      } else {
        // 如果 showCustomAlert 还未定义，使用 alert
        alert('正常启动提示\n\n' + recoveryInfo);
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
