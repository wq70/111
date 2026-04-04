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
  async function handleZipFileImport(zipFile) {
    try {
      // 检查JSZip是否可用
      if (typeof JSZip === 'undefined') {
        throw new Error("未加载 JSZip 库，无法解析 ZIP 文件。");
      }

      // 读取ZIP文件
      const zip = await JSZip.loadAsync(zipFile);

      // 提取所有 .txt 和 .docx 文件
      const fileEntries = [];

      for (const [filename, zipEntry] of Object.entries(zip.files)) {
        // 跳过目录和隐藏文件
        if (zipEntry.dir || filename.startsWith('__MACOSX') || filename.startsWith('.')) {
          continue;
        }

        const lowerName = filename.toLowerCase();
        if (lowerName.endsWith('.txt') || lowerName.endsWith('.docx')) {
          fileEntries.push({
            filename: filename,
            zipEntry: zipEntry,
            type: lowerName.endsWith('.txt') ? 'txt' : 'docx'
          });
        }
      }

      if (fileEntries.length === 0) {
        await showCustomAlert('ZIP文件为空', `ZIP文件"${zipFile.name}"中没有找到 .txt 或 .docx 文件。`);
        return;
      }

      // 显示文件选择界面
      const selectedFiles = await showZipFileSelectionModal(fileEntries, zipFile.name);

      if (!selectedFiles || selectedFiles.length === 0) {
        return; // 用户取消或没有选择任何文件
      }

      // 处理选中的文件
      let importedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < selectedFiles.length; i++) {
        const entry = selectedFiles[i];

        try {
          // 解析文件内容
          let textContent;

          if (entry.type === 'txt') {
            // 读取TXT文件
            textContent = await entry.zipEntry.async('text');
          } else if (entry.type === 'docx') {
            // 读取DOCX文件
            if (typeof mammoth === 'undefined') {
              throw new Error("未加载 mammoth.js 库，无法读取 Word 文档。");
            }

            const arrayBuffer = await entry.zipEntry.async('arraybuffer');
            const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });

            if (result.value && result.value.trim()) {
              textContent = result.value;
            } else {
              // 尝试转换为HTML再提取
              const htmlResult = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
              textContent = htmlResult.value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            }
          }

          if (!textContent || !textContent.trim()) {
            await showCustomAlert('文件内容为空', `文件"${entry.filename}"内容为空或无法解析，已跳过。`);
            skippedCount++;
            continue;
          }

          // 显示内容确认弹窗
          const action = await showMultiFileContentConfirmModal(
            textContent,
            entry.filename,
            i + 1,
            selectedFiles.length
          );

          if (action === 'cancel') {
            break;
          } else if (action === 'skip') {
            skippedCount++;
            continue;
          }

          // 创建角色流程
          const remarkName = await showCustomPrompt(
            `创建角色 [${i + 1}/${selectedFiles.length}] (第1/2步)`,
            `文件: ${entry.filename}\n\n请输入你想为Ta设置的【备注名】`
          );

          if (!remarkName || !remarkName.trim()) {
            skippedCount++;
            continue;
          }

          const originalName = await showCustomPrompt(
            `创建角色 [${i + 1}/${selectedFiles.length}] (第2/2步)`,
            `文件: ${entry.filename}\n\n请输入Ta的【本名】`
          );

          if (!originalName || !originalName.trim()) {
            skippedCount++;
            continue;
          }

          // 创建新聊天
          const newChatId = 'chat_' + Date.now() + '_' + i;
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
              aiPersona: textContent.trim(),
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

          state.chats[newChatId] = newChat;
          await db.chats.put(newChat);
          importedCount++;
          renderChatList();

        } catch (error) {
          console.error(`文件"${entry.filename}"导入失败:`, error);
          await showCustomAlert('文件导入失败', `文件"${entry.filename}"解析失败: ${error.message}`);
          failedCount++;
        }
      }

      // 显示总结
      if (importedCount > 0 || skippedCount > 0 || failedCount > 0) {
        let summary = `ZIP文件导入完成！\n\n`;
        if (importedCount > 0) summary += `✓ 成功导入: ${importedCount} 个角色\n`;
        if (skippedCount > 0) summary += `○ 已跳过: ${skippedCount} 个文件\n`;
        if (failedCount > 0) summary += `✗ 失败: ${failedCount} 个文件\n`;

        await showCustomAlert('ZIP导入结果', summary);
      }

    } catch (error) {
      console.error('ZIP文件处理失败:', error);
      throw error;
    }
  }

  // 显示ZIP文件选择界面
  function showZipFileSelectionModal(fileEntries, zipFileName) {
    return new Promise(resolve => {
      const modal = document.createElement('div');
      modal.className = 'custom-modal';
      modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';

      const modalContent = document.createElement('div');
      modalContent.style.cssText = 'background: white; border-radius: 12px; padding: 20px; max-width: 600px; width: 90%; max-height: 80vh; display: flex; flex-direction: column;';

      const title = document.createElement('h3');
      title.textContent = 'ZIP文件导入 - 选择文件';
      title.style.cssText = 'margin: 0 0 10px 0; font-size: 18px; text-align: center; color: #333;';

      const zipNameLabel = document.createElement('p');
      zipNameLabel.textContent = `📦 ${zipFileName}`;
      zipNameLabel.style.cssText = 'margin: 0 0 15px 0; text-align: center; font-size: 13px; color: #666; background: #f0f0f0; padding: 8px; border-radius: 6px; font-weight: 500;';

      const infoText = document.createElement('p');
      infoText.textContent = `找到 ${fileEntries.length} 个可导入的文件，请选择要导入的文件：`;
      infoText.style.cssText = 'margin: 0 0 12px 0; font-size: 14px; color: #555;';

      // 全选/取消全选按钮
      const selectAllContainer = document.createElement('div');
      selectAllContainer.style.cssText = 'display: flex; gap: 8px; margin-bottom: 12px; justify-content: flex-end;';

      const selectAllBtn = document.createElement('button');
      selectAllBtn.textContent = '全选';
      selectAllBtn.style.cssText = 'padding: 6px 12px; border: 1px solid #007AFF; border-radius: 6px; background: white; color: #007AFF; font-size: 13px; cursor: pointer;';

      const deselectAllBtn = document.createElement('button');
      deselectAllBtn.textContent = '取消全选';
      deselectAllBtn.style.cssText = 'padding: 6px 12px; border: 1px solid #999; border-radius: 6px; background: white; color: #666; font-size: 13px; cursor: pointer;';

      selectAllContainer.appendChild(selectAllBtn);
      selectAllContainer.appendChild(deselectAllBtn);

      // 文件列表容器
      const fileListContainer = document.createElement('div');
      fileListContainer.style.cssText = 'flex: 1; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px; margin-bottom: 15px; background: #fafafa; max-height: 400px;';

      const checkboxes = [];

      // 创建文件列表项
      fileEntries.forEach((entry, index) => {
        const fileItem = document.createElement('label');
        fileItem.style.cssText = 'display: flex; align-items: center; padding: 10px; margin-bottom: 6px; background: white; border-radius: 6px; cursor: pointer; border: 1px solid #e0e0e0; transition: background 0.2s;';

        fileItem.onmouseover = () => fileItem.style.background = '#f0f8ff';
        fileItem.onmouseout = () => fileItem.style.background = 'white';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true; // 默认全选
        checkbox.style.cssText = 'width: 18px; height: 18px; margin-right: 10px; cursor: pointer;';
        checkboxes.push(checkbox);

        const fileIcon = document.createElement('span');
        fileIcon.textContent = entry.type === 'txt' ? '📄' : '📝';
        fileIcon.style.cssText = 'font-size: 18px; margin-right: 8px;';

        const fileName = document.createElement('span');
        fileName.textContent = entry.filename;
        fileName.style.cssText = 'flex: 1; font-size: 13px; color: #333; word-break: break-all;';

        const fileType = document.createElement('span');
        fileType.textContent = `.${entry.type}`;
        fileType.style.cssText = 'font-size: 11px; color: #999; background: #f0f0f0; padding: 2px 6px; border-radius: 4px; margin-left: 8px;';

        fileItem.appendChild(checkbox);
        fileItem.appendChild(fileIcon);
        fileItem.appendChild(fileName);
        fileItem.appendChild(fileType);

        fileListContainer.appendChild(fileItem);
      });

      // 全选按钮事件
      selectAllBtn.onclick = () => {
        checkboxes.forEach(cb => cb.checked = true);
      };

      // 取消全选按钮事件
      deselectAllBtn.onclick = () => {
        checkboxes.forEach(cb => cb.checked = false);
      };

      // 计数显示
      const countLabel = document.createElement('p');
      countLabel.style.cssText = 'margin: 0 0 15px 0; text-align: center; font-size: 13px; color: #666;';

      const updateCount = () => {
        const selectedCount = checkboxes.filter(cb => cb.checked).length;
        countLabel.textContent = `已选择 ${selectedCount} / ${fileEntries.length} 个文件`;
      };

      checkboxes.forEach(cb => cb.addEventListener('change', updateCount));
      updateCount();

      // 按钮容器
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display: flex; gap: 10px;';

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '取消';
      cancelBtn.style.cssText = 'flex: 1; padding: 12px; border: none; border-radius: 8px; background: #ddd; font-size: 16px; cursor: pointer;';
      cancelBtn.onclick = () => {
        document.body.removeChild(modal);
        resolve(null);
      };

      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = '确认导入';
      confirmBtn.style.cssText = 'flex: 1; padding: 12px; border: none; border-radius: 8px; background: #007AFF; color: white; font-size: 16px; cursor: pointer;';
      confirmBtn.onclick = () => {
        const selectedFiles = fileEntries.filter((entry, index) => checkboxes[index].checked);

        if (selectedFiles.length === 0) {
          alert('请至少选择一个文件！');
          return;
        }

        document.body.removeChild(modal);
        resolve(selectedFiles);
      };

      buttonContainer.appendChild(cancelBtn);
      buttonContainer.appendChild(confirmBtn);

      modalContent.appendChild(title);
      modalContent.appendChild(zipNameLabel);
      modalContent.appendChild(infoText);
      modalContent.appendChild(selectAllContainer);
      modalContent.appendChild(fileListContainer);
      modalContent.appendChild(countLabel);
      modalContent.appendChild(buttonContainer);

      modal.appendChild(modalContent);
      document.body.appendChild(modal);
    });
  }

  // 显示内容确认弹窗
  function showContentConfirmModal(content) {
    return new Promise(resolve => {
      const modal = document.createElement('div');
      modal.className = 'custom-modal';
      modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';

      const modalContent = document.createElement('div');
      modalContent.style.cssText = 'background: white; border-radius: 12px; padding: 20px; max-width: 500px; width: 90%; max-height: 70vh; display: flex; flex-direction: column;';

      const title = document.createElement('h3');
      title.textContent = '内容确认';
      title.style.cssText = 'margin: 0 0 15px 0; font-size: 18px; text-align: center;';

      const contentBox = document.createElement('div');
      contentBox.style.cssText = 'flex: 1; overflow-y: auto; background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 15px; white-space: pre-wrap; word-wrap: break-word; font-size: 14px; line-height: 1.6; max-height: 400px;';
      contentBox.textContent = content;

      const question = document.createElement('p');
      question.textContent = '是否将以上内容完全填入到对方人设中？';
      question.style.cssText = 'margin: 0 0 15px 0; text-align: center; font-size: 15px;';

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display: flex; gap: 10px;';

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '取消';
      cancelBtn.style.cssText = 'flex: 1; padding: 12px; border: none; border-radius: 8px; background: #ddd; font-size: 16px; cursor: pointer;';
      cancelBtn.onclick = () => {
        document.body.removeChild(modal);
        resolve(false);
      };

      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = '确定';
      confirmBtn.style.cssText = 'flex: 1; padding: 12px; border: none; border-radius: 8px; background: #007AFF; color: white; font-size: 16px; cursor: pointer;';
      confirmBtn.onclick = () => {
        document.body.removeChild(modal);
        resolve(true);
      };

      buttonContainer.appendChild(cancelBtn);
      buttonContainer.appendChild(confirmBtn);

      modalContent.appendChild(title);
      modalContent.appendChild(contentBox);
      modalContent.appendChild(question);
      modalContent.appendChild(buttonContainer);

      modal.appendChild(modalContent);
      document.body.appendChild(modal);
    });
  }

  // 多文件导入专用的内容确认弹窗（支持跳过）
  function showMultiFileContentConfirmModal(content, fileName, currentIndex, totalCount) {
    return new Promise(resolve => {
      const modal = document.createElement('div');
      modal.className = 'custom-modal';
      modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';

      const modalContent = document.createElement('div');
      modalContent.style.cssText = 'background: white; border-radius: 12px; padding: 20px; max-width: 550px; width: 90%; max-height: 75vh; display: flex; flex-direction: column;';

      const title = document.createElement('h3');
      title.textContent = `文件内容确认 [${currentIndex}/${totalCount}]`;
      title.style.cssText = 'margin: 0 0 10px 0; font-size: 18px; text-align: center; color: #333;';

      const fileNameLabel = document.createElement('p');
      fileNameLabel.textContent = `📄 ${fileName}`;
      fileNameLabel.style.cssText = 'margin: 0 0 15px 0; text-align: center; font-size: 13px; color: #666; background: #f0f0f0; padding: 8px; border-radius: 6px; font-weight: 500;';

      const contentBox = document.createElement('div');
      contentBox.style.cssText = 'flex: 1; overflow-y: auto; background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 15px; white-space: pre-wrap; word-wrap: break-word; font-size: 13px; line-height: 1.6; max-height: 400px; border: 1px solid #e0e0e0;';
      contentBox.textContent = content;

      const question = document.createElement('p');
      question.innerHTML = '是否将以上内容填入到<strong>对方人设</strong>中？';
      question.style.cssText = 'margin: 0 0 15px 0; text-align: center; font-size: 15px; color: #444;';

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display: flex; gap: 8px;';

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '取消全部';
      cancelBtn.style.cssText = 'flex: 1; padding: 12px; border: none; border-radius: 8px; background: #e74c3c; color: white; font-size: 15px; cursor: pointer; transition: background 0.2s;';
      cancelBtn.onmouseover = () => cancelBtn.style.background = '#c0392b';
      cancelBtn.onmouseout = () => cancelBtn.style.background = '#e74c3c';
      cancelBtn.onclick = () => {
        document.body.removeChild(modal);
        resolve('cancel');
      };

      const skipBtn = document.createElement('button');
      skipBtn.textContent = '跳过此文件';
      skipBtn.style.cssText = 'flex: 1; padding: 12px; border: none; border-radius: 8px; background: #95a5a6; color: white; font-size: 15px; cursor: pointer; transition: background 0.2s;';
      skipBtn.onmouseover = () => skipBtn.style.background = '#7f8c8d';
      skipBtn.onmouseout = () => skipBtn.style.background = '#95a5a6';
      skipBtn.onclick = () => {
        document.body.removeChild(modal);
        resolve('skip');
      };

      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = '确定导入';
      confirmBtn.style.cssText = 'flex: 1; padding: 12px; border: none; border-radius: 8px; background: #27ae60; color: white; font-size: 15px; cursor: pointer; transition: background 0.2s; font-weight: 600;';
      confirmBtn.onmouseover = () => confirmBtn.style.background = '#229954';
      confirmBtn.onmouseout = () => confirmBtn.style.background = '#27ae60';
      confirmBtn.onclick = () => {
        document.body.removeChild(modal);
        resolve('confirm');
      };

      buttonContainer.appendChild(cancelBtn);
      buttonContainer.appendChild(skipBtn);
      buttonContainer.appendChild(confirmBtn);

      modalContent.appendChild(title);
      modalContent.appendChild(fileNameLabel);
      modalContent.appendChild(contentBox);
      modalContent.appendChild(question);
      modalContent.appendChild(buttonContainer);

      modal.appendChild(modalContent);
      document.body.appendChild(modal);

      // 支持键盘快捷键
      const keyHandler = (e) => {
        if (e.key === 'Escape') {
          document.body.removeChild(modal);
          document.removeEventListener('keydown', keyHandler);
          resolve('skip');
        }
      };
      document.addEventListener('keydown', keyHandler);
    });
  }

  async function handleCardImport(event) {
    const files = Array.from(event.target.files);
    if (!files || files.length === 0) return;

    try {
      // 如果只有一个文件，使用旧的单文件导入流程
      if (files.length === 1) {
        await importSingleCard(files[0]);
        event.target.value = null;
        return;
      }

      // 多文件：显示批量导入预览
      await showBatchImportPreview(files);

    } catch (error) {
      console.error("角色卡导入失败:", error);
      await showCustomAlert("导入失败", `无法解析角色卡文件。\n错误: ${error.message}`);
    } finally {
      event.target.value = null;
    }
  }

  // 单个文件导入（支持酒馆AI和小手机格式）
  async function importSingleCard(file) {
    try {
      let cardData;
      let avatarBase64 = null;

      if (file.name.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);

        // 检测是否为小手机专属格式
        if (parsed.type === 'EPhoneCharacterExport') {
          await importEPhoneCharacter(parsed);
          return;
        }

        cardData = parsed;
      } else if (file.name.endsWith('.png')) {
        const arrayBuffer = await file.arrayBuffer();

        // 同时检测ephone和chara两种格式
        const formats = await parsePngForAllFormats(arrayBuffer);

        if (formats.ephone && formats.ephone.type === 'EPhoneCharacterExport') {
          // 小手机格式：读取PNG作为头像
          avatarBase64 = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
          });

          // 处理ImgBB上传
          if (state.apiConfig.imgbbEnable && state.apiConfig.imgbbApiKey) {
            try {
              await showCustomAlert("请稍候...", "正在上传角色头像到 ImgBB...");
              avatarBase64 = await uploadImageToImgBB(avatarBase64);
            } catch (uploadError) {
              console.error(uploadError);
              await showCustomAlert("ImgBB 上传失败", `头像上传失败: ${uploadError.message}\n\n将继续使用本地 Base64 格式保存。`);
            }
          }

          await importEPhoneCharacter(formats.ephone, avatarBase64);
          return;
        }

        if (formats.chara) {
          cardData = formats.chara;
        } else {
          throw new Error("在PNG文件中未找到有效的角色数据。");
        }

        avatarBase64 = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = async (readerEvent) => {
            let base64Result = readerEvent.target.result;

            if (state.apiConfig.imgbbEnable && state.apiConfig.imgbbApiKey) {
              try {
                await showCustomAlert("请稍候...", "正在上传角色卡封面到 ImgBB...");
                const imageUrl = await uploadImageToImgBB(base64Result);
                resolve(imageUrl);
              } catch (uploadError) {
                console.error(uploadError);
                await showCustomAlert("ImgBB 上传失败", `封面上传失败: ${uploadError.message}\n\n将继续使用本地 Base64 格式保存。`);
                resolve(base64Result);
              }
            } else {
              resolve(base64Result);
            }
          };
          reader.readAsDataURL(file);
        });
      } else {
        throw new Error("不支持的文件格式。请选择 .json 或 .png 文件。");
      }

      await createChatFromCardData(cardData, avatarBase64);

    } catch (error) {
      throw error;
    }
  }

  // 显示批量导入预览界面
  async function showBatchImportPreview(files) {
    const modal = document.getElementById('batch-import-preview-modal');
    const listContainer = document.getElementById('batch-import-preview-list');

    if (!modal || !listContainer) {
      console.error('批量导入预览模态框未找到');
      return;
    }

    // 显示加载提示
    listContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 50px 20px;">正在解析角色卡...</p>';
    modal.style.display = 'flex';

    // 解析所有文件
    pendingImportCards = [];
    const parsePromises = files.map(async (file, index) => {
      try {
        let cardData;
        let avatarBase64 = null;
        let fileType = file.name.endsWith('.png') ? 'png' : 'json';
        let isEPhoneFormat = false;
        let ephoneExportData = null;

        if (fileType === 'json') {
          const text = await file.text();
          const parsed = JSON.parse(text);
          if (parsed.type === 'EPhoneCharacterExport') {
            isEPhoneFormat = true;
            ephoneExportData = parsed;
            cardData = { name: parsed.chatData?.name, data: { name: parsed.chatData?.name, description: parsed.chatData?.settings?.aiPersona || '' } };
          } else {
            cardData = parsed;
          }
        } else if (fileType === 'png') {
          const arrayBuffer = await file.arrayBuffer();
          const formats = await parsePngForAllFormats(arrayBuffer);

          if (formats.ephone && formats.ephone.type === 'EPhoneCharacterExport') {
            isEPhoneFormat = true;
            ephoneExportData = formats.ephone;
            cardData = { name: formats.ephone.chatData?.name, data: { name: formats.ephone.chatData?.name, description: formats.ephone.chatData?.settings?.aiPersona || '' } };
          } else if (formats.chara) {
            cardData = formats.chara;
          } else {
            throw new Error("在PNG文件中未找到有效的角色数据。");
          }

          // 读取PNG作为base64
          avatarBase64 = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
          });
        }

        return {
          id: `import_${Date.now()}_${index}`,
          fileName: file.name,
          fileType: fileType,
          cardData: cardData,
          avatarBase64: avatarBase64,
          selected: true,
          parseSuccess: true,
          isEPhoneFormat: isEPhoneFormat,
          ephoneExportData: ephoneExportData
        };
      } catch (error) {
        console.error(`解析失败: ${file.name}`, error);
        return {
          id: `import_${Date.now()}_${index}`,
          fileName: file.name,
          fileType: file.name.endsWith('.png') ? 'png' : 'json',
          error: error.message,
          selected: false,
          parseSuccess: false
        };
      }
    });

    pendingImportCards = await Promise.all(parsePromises);
    renderBatchImportPreview();
  }

  // 渲染批量导入预览列表
  function renderBatchImportPreview() {
    const listContainer = document.getElementById('batch-import-preview-list');
    if (!listContainer) return;

    if (pendingImportCards.length === 0) {
      listContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 50px 20px;">没有可导入的角色卡</p>';
      return;
    }

    listContainer.innerHTML = pendingImportCards.map(card => {
      if (!card.parseSuccess) {
        return `
          <div class="list-item" style="padding: 15px; border-bottom: 1px solid var(--border-color); opacity: 0.5;">
            <div style="display: flex; align-items: center; gap: 15px;">
              <input type="checkbox" disabled style="width: 20px; height: 20px;">
              <div style="width: 60px; height: 60px; background: #f5f5f5; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #999;">
                ❌
              </div>
              <div style="flex: 1;">
                <div style="font-weight: 600; color: #f44;">${escapeHtml(card.fileName)}</div>
                <div style="font-size: 13px; color: #f44; margin-top: 5px;">解析失败: ${escapeHtml(card.error)}</div>
              </div>
            </div>
          </div>
        `;
      }

      const name = card.cardData.name || card.cardData.data?.name || '未命名角色';
      const description = card.cardData.description || card.cardData.data?.description || '';
      const previewDesc = description.substring(0, 100) + (description.length > 100 ? '...' : '');
      const avatarSrc = card.avatarBase64 || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';

      return `
        <div class="list-item" style="padding: 15px; border-bottom: 1px solid var(--border-color);">
          <div style="display: flex; align-items: center; gap: 15px;">
            <input type="checkbox" 
                   class="batch-import-card-checkbox" 
                   data-card-id="${card.id}" 
                   ${card.selected ? 'checked' : ''}
                   style="width: 20px; height: 20px;">
            <img src="${avatarSrc}" 
                 style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover;"
                 onerror="this.src='https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'">
            <div style="flex: 1;">
              <div style="font-weight: 600; margin-bottom: 5px;">${escapeHtml(name)}</div>
              <div style="font-size: 13px; color: #666; margin-bottom: 5px;">${escapeHtml(previewDesc)}</div>
              <div style="font-size: 12px; color: #999;">
                <span style="background: #e3f2fd; padding: 2px 8px; border-radius: 4px; margin-right: 5px;">${card.fileType.toUpperCase()}</span>
                ${card.isEPhoneFormat ? '<span style="background: #e8f5e9; color: #2e7d32; padding: 2px 8px; border-radius: 4px; margin-right: 5px;">小手机</span>' : ''}
                ${escapeHtml(card.fileName)}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // 绑定复选框事件
    document.querySelectorAll('.batch-import-card-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const cardId = e.target.dataset.cardId;
        const card = pendingImportCards.find(c => c.id === cardId);
        if (card) {
          card.selected = e.target.checked;
        }
        updateSelectAllCheckbox();
      });
    });

    updateSelectAllCheckbox();
  }

  // 更新全选复选框状态
  function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('select-all-import-cards');
    if (!selectAllCheckbox) return;

    const successCards = pendingImportCards.filter(c => c.parseSuccess);
    const selectedCount = successCards.filter(c => c.selected).length;

    selectAllCheckbox.checked = selectedCount === successCards.length && successCards.length > 0;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < successCards.length;
  }

  // 确认批量导入
  async function confirmBatchImport() {
    const selectedCards = pendingImportCards.filter(c => c.selected && c.parseSuccess);

    if (selectedCards.length === 0) {
      await showCustomAlert("提示", "请至少选择一个角色卡进行导入");
      return;
    }

    // 关闭预览模态框
    const modal = document.getElementById('batch-import-preview-modal');
    if (modal) modal.style.display = 'none';

    // 显示进度提示
    const progressDiv = document.createElement('div');
    progressDiv.id = 'batch-import-progress';
    progressDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 10001;
      text-align: center;
      min-width: 300px;
    `;
    document.body.appendChild(progressDiv);

    let successCount = 0;
    let failCount = 0;
    const failedCards = [];

    for (let i = 0; i < selectedCards.length; i++) {
      const card = selectedCards[i];

      // 更新进度显示
      progressDiv.innerHTML = `
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 15px;">正在导入角色卡</div>
        <div style="font-size: 14px; color: #666; margin-bottom: 10px;">
          ${i + 1} / ${selectedCards.length}
        </div>
        <div style="font-size: 14px; color: #999;">
          ${escapeHtml(card.fileName)}
        </div>
        <div style="margin-top: 15px; width: 100%; height: 4px; background: #f0f0f0; border-radius: 2px; overflow: hidden;">
          <div style="width: ${((i + 1) / selectedCards.length * 100)}%; height: 100%; background: #4CAF50; transition: width 0.3s;"></div>
        </div>
      `;

      try {
        // 处理ImgBB上传（仅针对PNG）
        let finalAvatar = card.avatarBase64;
        if (card.fileType === 'png' && state.apiConfig.imgbbEnable && state.apiConfig.imgbbApiKey) {
          try {
            finalAvatar = await uploadImageToImgBB(card.avatarBase64);
          } catch (uploadError) {
            console.error('ImgBB上传失败，使用本地Base64:', uploadError);
          }
        }

        // 小手机格式走专属导入逻辑
        if (card.isEPhoneFormat && card.ephoneExportData) {
          await importEPhoneCharacter(card.ephoneExportData, finalAvatar, true);
        } else {
          await createChatFromCardData(card.cardData, finalAvatar);
        }
        successCount++;
      } catch (error) {
        console.error(`导入失败: ${card.fileName}`, error);
        failCount++;
        failedCards.push({
          name: card.fileName,
          error: error.message
        });
      }

      // 添加小延迟，让用户看到进度
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 移除进度提示
    document.body.removeChild(progressDiv);

    // 显示结果
    let message = `✓ 成功导入 ${successCount} 个角色`;
    if (failCount > 0) {
      message += `\n✗ 失败 ${failCount} 个`;
      if (failedCards.length <= 3) {
        message += '\n\n失败列表：';
        failedCards.forEach(fc => {
          message += `\n• ${fc.name}: ${fc.error}`;
        });
      }
    }
    await showCustomAlert("导入完成", message);

    // 清空待导入列表
    pendingImportCards = [];

    // 刷新聊天列表
    if (typeof renderChatList === 'function') {
      renderChatList();
    }
  }

  // 取消批量导入
  function cancelBatchImport() {
    const modal = document.getElementById('batch-import-preview-modal');
    if (modal) modal.style.display = 'none';
    pendingImportCards = [];
  }


  function parsePngForTavernData(arrayBuffer) {
    return new Promise((resolve, reject) => {
      const view = new DataView(arrayBuffer);

      if (view.getUint32(0) !== 0x89504E47 || view.getUint32(4) !== 0x0D0A1A0A) {
        return reject(new Error("文件不是一个有效的PNG。"));
      }

      let offset = 8;
      const decoder = new TextDecoder();

      while (offset < view.byteLength) {
        const length = view.getUint32(offset);
        const type = decoder.decode(arrayBuffer.slice(offset + 4, offset + 8));

        if (type === 'tEXt') {
          const data = new Uint8Array(arrayBuffer, offset + 8, length);
          const nullSeparatorIndex = data.indexOf(0);
          if (nullSeparatorIndex !== -1) {
            const key = decoder.decode(data.slice(0, nullSeparatorIndex));
            if (key === 'chara') {
              const value = decoder.decode(data.slice(nullSeparatorIndex + 1));
              try {





                const binaryString = atob(value);


                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }



                const decodedData = new TextDecoder('utf-8').decode(bytes);



                resolve(JSON.parse(decodedData));
                return;
              } catch (e) {
                return reject(new Error("在PNG中找到角色数据，但解码或解析失败。错误: " + e.message));
              }
            }
          }
        }


        offset += 4 + 4 + length + 4;
      }

      reject(new Error("在PNG文件中未找到有效的Tavern AI角色数据(chara chunk)。"));
    });
  }





  function findWorldBookEntries(cardData) {




    if (cardData.data?.character_book?.entries?.length > 0) {
      console.log("诊断：在 data.character_book 中找到世界书。");
      return cardData.data.character_book.entries;
    }


    if (cardData.extensions?.character_book?.entries?.length > 0) {
      console.log("诊断：在 extensions.character_book 中找到世界书。");
      return cardData.extensions.character_book.entries;
    }


    if (cardData.data?.extensions?.character_book?.entries?.length > 0) {
      console.log("诊断：在 data.extensions.character_book 中找到世界书。");
      return cardData.data.extensions.character_book.entries;
    }


    const possibleTopLevelKeys = ['character_book', 'lorebook', 'world_info', 'char_book'];
    for (const key of possibleTopLevelKeys) {
      if (cardData[key]?.entries?.length > 0) {
        console.log(`诊断：在顶层 ${key} 中找到世界书。`);
        return cardData[key].entries;
      }
    }

    console.log("诊断：未在此角色卡中找到任何有效的世界书数据。");
    return null;
  }

  async function createChatFromCardData(cardData, avatarBase64 = null) {
    const effectiveCardData = cardData.data || cardData;
    if (!effectiveCardData.name) {
      throw new Error("角色卡数据无效或缺少'name'字段。");
    }


    let worldBookIdToLink = null;
    const worldBookEntries = findWorldBookEntries(cardData);

    if (worldBookEntries) {
      const structuredEntries = worldBookEntries
        .filter(entry => entry.enabled && entry.content)
        .map(entry => ({
          keys: entry.keys || [],
          comment: entry.comment || '',
          content: entry.content.replace(/<memory>|<\/memory>/g, '').trim()
        }));

      if (structuredEntries.length > 0) {
        const newWorldBook = {
          id: 'wb_' + Date.now(),
          name: `${effectiveCardData.name}的设定集`,
          content: structuredEntries,
          categoryId: null
        };
        await db.worldBooks.add(newWorldBook);
        state.worldBooks.push(newWorldBook);
        worldBookIdToLink = newWorldBook.id;
      }
    }


    let alternateGreetings = [];

    if (Array.isArray(effectiveCardData.alternate_greetings)) {
      alternateGreetings = effectiveCardData.alternate_greetings;
    }

    else if (Array.isArray(cardData.alternate_greetings)) {
      alternateGreetings = cardData.alternate_greetings;
    }


    alternateGreetings = alternateGreetings.filter(g => g && typeof g === 'string' && g.trim() !== '');


    const firstGreeting = effectiveCardData.first_mes || cardData.first_mes;


    if (firstGreeting && typeof firstGreeting === 'string' && firstGreeting.trim() !== '') {
      if (!alternateGreetings.includes(firstGreeting)) {
        alternateGreetings.unshift(firstGreeting);
      }
    }


    let description = effectiveCardData.description || cardData.description || '无';
    description = description
      .replace(/```yaml/g, '').replace(/```/g, '')
      .replace(/<\/?info>/g, '').replace(/<\/?character>/g, '')
      .replace(/<\/?writing_rule>/g, '').replace(/\[OOC：.*?\]/g, '').trim();

    let persona = `# 角色核心设定\n${description}\n\n`;
    if (effectiveCardData.personality) persona += `# 性格补充\n${effectiveCardData.personality}\n\n`;
    if (effectiveCardData.scenario) persona += `# 场景设定\n${effectiveCardData.scenario}\n\n`;
    if (effectiveCardData.mes_example) persona += `# 对话示例\n${effectiveCardData.mes_example}\n\n`;

    const remarkName = effectiveCardData.name;
    const originalName = effectiveCardData.name;

    const newChatId = 'chat_' + Date.now();


    const newChat = {
      id: newChatId,
      name: remarkName.trim(),
      originalName: originalName.trim(),
      isGroup: false,
      relationship: {
        status: 'friend'
      },
      status: {
        text: '在线',
        lastUpdate: Date.now(),
        isBusy: false
      },
      settings: {
        aiPersona: persona,
        myPersona: '我是谁呀。',
        maxMemory: 10,
        aiAvatar: defaultAvatar,
        myAvatar: defaultAvatar,
        background: '',
        theme: 'default',
        fontSize: 13,
        customCss: '',
        linkedWorldBookIds: worldBookIdToLink ? [worldBookIdToLink] : [],
        aiAvatarLibrary: [],


        alternateGreetings: alternateGreetings,
        myPhoneLockScreenEnabled: false,
        myPhoneLockScreenPassword: '',
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
      longTermMemory: []
    };


    if (avatarBase64) {
      newChat.settings.aiAvatar = avatarBase64;
      newChat.settings.aiAvatarLibrary.push({
        name: '默认头像',
        url: avatarBase64
      });
    }


    if (firstGreeting && typeof firstGreeting === 'string') {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = firstGreeting;
      const cleanGreeting = (tempDiv.textContent || tempDiv.innerText || "").replace(/原作者.*?开局/s, '').trim();

      if (cleanGreeting) {
        newChat.history.push({
          role: 'assistant',
          senderName: newChat.originalName,
          content: cleanGreeting,
          timestamp: Date.now()
        });
      }
    }


    state.chats[newChatId] = newChat;
    await db.chats.put(newChat);
    renderChatList();

    let successMessage = `角色 "${newChat.name}" 已成功导入！`;
    if (worldBookIdToLink) {
      successMessage += `\n\n其专属的"世界书"也已自动创建并关联。`;
    }
    if (alternateGreetings.length > 1) {
      successMessage += `\n\n检测到 ${alternateGreetings.length} 条开场白，可在"聊天设置"中切换。`;
    }
    await showCustomAlert('导入成功！', successMessage);
  }




  async function handleSwitchGreeting() {
    console.log("点击了切换开场按钮");

    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];

    const greetings = chat.settings?.alternateGreetings || [];

    if (greetings.length === 0) {
      alert("未检测到可用的候补开场白数据。\n请确认您已使用修复后的代码重新导入了角色卡。");
      return;
    }


    const options = greetings.map((text, index) => {

      const safeText = String(text || "");
      const preview = safeText.replace(/<[^>]*>/g, '').trim().substring(0, 20);
      return {
        text: `📜 开场 ${index + 1}: ${preview}...`,
        value: index
      };
    });


    const selectedIndex = await showChoiceModal('选择一个开场白', options);


    if (selectedIndex !== null) {
      const confirmed = await showCustomConfirm(
        '⚠️ 警告：确认切换？',
        '切换开场白将会【清空并替换】当前所有的聊天记录，就像重新开始一样。\n\n确定要继续吗？', {
        confirmButtonClass: 'btn-danger',
        confirmText: '确定切换'
      }
      );

      if (confirmed) {
        const newGreetingText = greetings[selectedIndex];


        const newMessage = {
          role: 'assistant',
          senderName: chat.originalName,
          content: newGreetingText,
          timestamp: Date.now()
        };

        chat.history = [newMessage];


        await db.chats.put(chat);


        renderChatInterface(chat.id);

        await showCustomAlert('成功', '已切换到新的开场故事！\n点击左上角返回即可开始对话。');
      }
    }
  }

  // ========== 全局暴露 ==========
  window.handleCardImport = handleCardImport;
  window.handleCharacterFileImport = handleCharacterFileImport;
  window.handleSwitchGreeting = handleSwitchGreeting;
  window.cancelBatchImport = cancelBatchImport;
  window.confirmBatchImport = confirmBatchImport;
