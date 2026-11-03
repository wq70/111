// ============================================================
// card-import.js — 角色卡导入（酒馆AI/小手机格式）、批量导入、文件导入
// 来源：script.js 第 11949 ~ 12670 行 + 第 33352 ~ 34068 行
// ============================================================


  function handleCharacterFileImport() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.docx,.zip'; // 支持 TXT、DOCX 和 ZIP
      input.multiple = true; // 支持多文件选择

      input.onchange = async e => {
        const files = Array.from(e.target.files);
        if (!files || files.length === 0) {
          resolve();
          return;
        }

        // 分离 ZIP 文件和普通文件
        const zipFiles = files.filter(f => f.name.toLowerCase().endsWith('.zip'));
        const normalFiles = files.filter(f => !f.name.toLowerCase().endsWith('.zip'));

        // 先处理 ZIP 文件
        for (const zipFile of zipFiles) {
          try {
            await handleZipFileImport(zipFile);
          } catch (error) {
            console.error(`ZIP文件"${zipFile.name}"处理失败:`, error);
            await showCustomAlert('ZIP文件处理失败', `文件"${zipFile.name}"处理失败: ${error.message}`);
          }
        }

        // 如果没有普通文件，直接结束
        if (normalFiles.length === 0) {
          resolve();
          return;
        }

        let importedCount = 0;
        let skippedCount = 0;
        let failedCount = 0;

        // 逐个处理普通文件
        for (let i = 0; i < normalFiles.length; i++) {
          const file = normalFiles[i];

          try {
            // 解析文件内容
            const textContent = await processCharacterFile(file);

            if (!textContent || !textContent.trim()) {
              await showCustomAlert('文件内容为空', `文件"${file.name}"内容为空或无法解析，已跳过。`);
              skippedCount++;
              continue;
            }

            // 显示内容确认弹窗（带文件名和进度）
            const action = await showMultiFileContentConfirmModal(
              textContent,
              file.name,
              i + 1,
              normalFiles.length
            );

            if (action === 'cancel') {
              // 用户选择取消整个导入流程
              break;
            } else if (action === 'skip') {
              // 跳过当前文件，继续下一个
              skippedCount++;
              continue;
            }

            // 进入手动创建流程
            const remarkName = await showCustomPrompt(
              `创建角色 [${i + 1}/${normalFiles.length}] (第1/2步)`,
              `文件: ${file.name}\n\n请输入你想为Ta设置的【备注名】`
            );
            if (!remarkName || !remarkName.trim()) {
              skippedCount++;
              continue;
            }

            const originalName = await showCustomPrompt(
              `创建角色 [${i + 1}/${normalFiles.length}] (第2/2步)`,
              `文件: ${file.name}\n\n请输入Ta的【本名】`
            );
            if (!originalName || !originalName.trim()) {
              skippedCount++;
              continue;
            }

            // 创建新聊天，aiPersona 使用导入的内容
            const newChatId = 'chat_' + Date.now() + '_' + i; // 添加索引避免ID冲突
            const newChat = {
              id: newChatId,
              name: remarkName.trim(),
              originalName: originalName.trim(),
              isGroup: false,
              isPinned: false,
              unreadCount: 0,
              country: 'China', // 默认中国，后续可以自动识别或手动修改
              relationship: {
                status: 'friend',
                blockedTimestamp: null,
                applicationReason: ''
              },
              status: {
                text: '在线',
                lastUpdate: Date.now(),
                isBusy: false
              },
              settings: {
                aiPersona: textContent.trim(), // 使用导入的内容作为对方人设
                myPersona: '我是谁呀。',
                myNickname: '我',
                maxMemory: 10,
                aiAvatar: defaultAvatar,
                myAvatar: defaultAvatar,
                background: '',
                theme: 'default',
                fontSize: 13,
                customCss: '',
                linkedWorldBookIds: [],
                aiAvatarLibrary: [],
                myAvatarLibrary: [],
                enableBackgroundActivity: true,
                actionCooldownMinutes: 15,
                enableTimePerception: true,
                isOfflineMode: false,
                offlineMinLength: 100,
                offlineMaxLength: 300,
                offlinePresetId: null,
                offlineContinuousLayout: false,
                timeZone: 'Asia/Shanghai',
                myPhoneLockScreenEnabled: false,
                myPhoneLockScreenPassword: '',
                enableViewMyPhoneInBackground: null,  // null=跟随全局，true=强制开启，false=强制关闭
                viewMyPhoneChance: null,              // null=使用全局设置，或者独立设置概率
                userStatus: {
                  text: '在线',
                  lastUpdate: Date.now(),
                  isBusy: false
                }
              },
              history: [],
              musicData: {
                totalTime: 0
              },
              longTermMemory: [],
              thoughtsHistory: []
            };

            window.applyDefaultChatSettings?.(newChat);
            state.chats[newChatId] = newChat;
            await db.chats.put(newChat);
            importedCount++;

            // 每导入一个后刷新列表
            renderChatList();

          } catch (error) {
            console.error(`文件"${file.name}"导入失败:`, error);
            await showCustomAlert('文件导入失败', `文件"${file.name}"解析失败: ${error.message}`);
            failedCount++;
          }
        }

        // 显示总结信息
        if (importedCount > 0 || skippedCount > 0 || failedCount > 0) {
          let summary = `导入完成！\n\n`;
          if (importedCount > 0) summary += `✓ 成功导入: ${importedCount} 个角色\n`;
          if (skippedCount > 0) summary += `○ 已跳过: ${skippedCount} 个文件\n`;
          if (failedCount > 0) summary += `✗ 失败: ${failedCount} 个文件\n`;

          await showCustomAlert('批量导入结果', summary);
        }

        resolve();
      };

      input.click();
    });
  }

  // 解析角色文件内容 (支持 .txt 和 .docx)
  async function processCharacterFile(file) {
    const fileName = file.name.toLowerCase();

    // 处理 .txt 文件
    if (fileName.endsWith('.txt')) {
      return await file.text();
    }

    // 处理 .docx 文件 (依赖 mammoth.js)
    if (fileName.endsWith('.docx')) {
      if (typeof mammoth === 'undefined') {
        throw new Error("未加载 mammoth.js 库，无法读取 Word 文档。");
      }

      const arrayBuffer = await file.arrayBuffer();

      try {
        // 方案 1: 尝试提取纯文本
        const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });

        if (result.value && result.value.trim()) {
          return result.value;
        }

        // 如果纯文本为空，尝试转换为 HTML 再提取
        const htmlResult = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
        if (htmlResult.value) {
          // 简单移除 HTML 标签
          const textContent = htmlResult.value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (textContent) {
            return textContent;
          }
        }

        throw new Error("DOCX 文件内容为空");

      } catch (error) {
        console.error("DOCX 解析错误:", error);
        // 提供更友好的错误提示
        throw new Error(
          "无法解析此 DOCX 文件，可能原因：\n" +
          "1. 文件损坏或格式不标准\n" +
          "2. 文件使用了不兼容的 Word 功能\n\n" +
          "建议解决方案：\n" +
          "• 用 Word 打开文件，另存为新的 .docx\n" +
          "• 或者另存为 .txt 纯文本格式后再导入"
        );
      }
    }

    // 特别提示：不支持旧版 .doc 格式
    if (fileName.endsWith('.doc')) {
      throw new Error("不支持旧版 .doc 格式，请将文件另存为 .docx 或 .txt 格式后再导入。");
    }

    throw new Error("不支持的文件格式，仅支持 .txt 和 .docx");
  }

  // 处理ZIP文件导入
