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

          window.applyDefaultChatSettings?.(newChat);
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

