// ============================================================
// init-event-bindingsA.js
// 事件绑定A：init() 函数前半段
// 从 init-and-state.js 约 2569~6030 行拆分
// 包含：世界书导入导出、角色创建、全局清理、音乐播放器事件、
//       聊天输入、表情包智能匹配、移动端控制台、世界书编辑器、
//       聊天消息点击事件、聊天设置弹窗、群成员设置等
// ============================================================

window.initEventBindingsA = async function(state, db) {
    initLanguage();

    // 弹窗模式的多选框 - 用于浏览器不兼容下拉框时的替代方案
    function showMultiselectPopup(title, sourceContainer, onChangeCallback) {
      // 移除已有弹窗
      const existing = document.getElementById('multiselect-popup-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'multiselect-popup-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';

      const popup = document.createElement('div');
      popup.style.cssText = 'background:var(--secondary-bg,#fff);border-radius:14px;width:85%;max-width:360px;max-height:70vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.25);';

      // 标题栏
      const header = document.createElement('div');
      header.style.cssText = 'padding:14px 16px;font-size:16px;font-weight:600;border-bottom:0.5px solid var(--border-color,#e0e0e0);text-align:center;color:var(--text-color,#333);';
      header.textContent = title;

      // 选项列表
      const listWrap = document.createElement('div');
      listWrap.style.cssText = 'flex:1;overflow-y:auto;padding:8px 0;';

      // 从源容器克隆所有checkbox选项
      const sourceLabels = sourceContainer.querySelectorAll('label');
      sourceLabels.forEach(srcLabel => {
        const srcCheckbox = srcLabel.querySelector('input[type="checkbox"]');
        if (!srcCheckbox) return;

        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;padding:12px 16px;cursor:pointer;transition:background 0.15s;';
        item.addEventListener('mouseenter', () => item.style.background = 'var(--hover-bg,#f5f5f5)');
        item.addEventListener('mouseleave', () => item.style.background = 'transparent');

        const checkbox = document.createElement('div');
        const isChecked = srcCheckbox.checked;
        checkbox.style.cssText = `width:22px;height:22px;border-radius:6px;border:2px solid ${isChecked ? 'var(--accent-color,#007aff)' : '#ccc'};margin-right:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.15s;${isChecked ? 'background:var(--accent-color,#007aff);' : ''}`;
        checkbox.innerHTML = isChecked ? '<span style="color:#fff;font-size:14px;">✓</span>' : '';

        const label = document.createElement('span');
        label.style.cssText = 'font-size:15px;color:var(--text-color,#333);';
        label.textContent = srcLabel.textContent.trim();

        item.appendChild(checkbox);
        item.appendChild(label);

        item.addEventListener('click', () => {
          srcCheckbox.checked = !srcCheckbox.checked;
          const nowChecked = srcCheckbox.checked;
          checkbox.style.border = `2px solid ${nowChecked ? 'var(--accent-color,#007aff)' : '#ccc'}`;
          checkbox.style.background = nowChecked ? 'var(--accent-color,#007aff)' : 'transparent';
          checkbox.innerHTML = nowChecked ? '<span style="color:#fff;font-size:14px;">✓</span>' : '';
          srcCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        });

        listWrap.appendChild(item);
      });

      // 如果没有选项
      if (sourceLabels.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:24px 16px;text-align:center;color:var(--text-secondary,#999);font-size:14px;';
        empty.textContent = '暂无可选项';
        listWrap.appendChild(empty);
      }

      // 确认按钮
      const footer = document.createElement('div');
      footer.style.cssText = 'padding:12px 16px;border-top:0.5px solid var(--border-color,#e0e0e0);';
      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = '确定';
      confirmBtn.style.cssText = 'width:100%;padding:10px;background:var(--accent-color,#007aff);color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:500;cursor:pointer;';
      confirmBtn.addEventListener('click', () => overlay.remove());
      footer.appendChild(confirmBtn);

      popup.appendChild(header);
      popup.appendChild(listWrap);
      popup.appendChild(footer);
      overlay.appendChild(popup);

      // 点击遮罩关闭
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
      });

      document.body.appendChild(overlay);
    }

    async function handleWorldBookImport(files) {
      if (!files || files.length === 0) return;

      try {
        // 分离JSON文件、TXT文件、ZIP文件和DOCX文件
        const jsonFiles = [];
        const txtFiles = [];
        const zipFiles = [];
        const docxFiles = [];

        for (const file of files) {
          if (file.name.toLowerCase().endsWith('.json')) {
            jsonFiles.push(file);
          } else if (file.name.toLowerCase().endsWith('.txt')) {
            txtFiles.push(file);
          } else if (file.name.toLowerCase().endsWith('.zip')) {
            zipFiles.push(file);
          } else if (file.name.toLowerCase().endsWith('.docx')) {
            docxFiles.push(file);
          }
        }

        // 处理JSON文件（保持原有逻辑，仅处理第一个JSON文件）
        if (jsonFiles.length > 0) {
          const file = jsonFiles[0];
          const text = await file.text();
          const data = JSON.parse(text);

          if (data.type === 'EPhoneWorldBookBackup') {
            console.log("检测到 EPhone 备份文件，执行标准导入...");
            await importWorldBooks(data);
          } else if (data.entries && typeof data.entries === 'object') {
            console.log("检测到 世界书文件，需要激活码...");
            try {
              await requirePinActivation();
              await importTavernWorldBook(data, file.name);
            } catch (error) {
              console.warn("世界书导入被取消:", error.message);
            }
          } else {
            throw new Error("文件格式无法识别。请确保您选择的是有效的 EPhone 世界书备份或 Tavern AI 世界书文件。");
          }
        }

        // 处理TXT文件
        if (txtFiles.length > 0) {
          await handleTxtWorldBookImport(txtFiles);
        }

        // 处理DOCX文件
        if (docxFiles.length > 0) {
          await handleDocxWorldBookImport(docxFiles);
        }

        // 处理ZIP文件
        if (zipFiles.length > 0) {
          await handleZipWorldBookImport(zipFiles);
        }

      } catch (error) {
        console.error("导入世界书时出错:", error);
        await showCustomAlert('导入失败', `文件解析或应用失败: ${error.message}`);
      }
    }

    // 新增：处理TXT文件导入
    async function handleTxtWorldBookImport(txtFiles) {
      try {
        // 读取所有TXT文件的内容
        const fileContents = await Promise.all(
          txtFiles.map(async (file) => ({
            name: file.name,
            content: await file.text()
          }))
        );

        // 显示确认对话框让用户选择要导入的文件
        const selectedFiles = await showTxtImportConfirmModal(fileContents);

        if (!selectedFiles || selectedFiles.length === 0) {
          return;
        }

        // 为每个选中的TXT文件创建一本世界书
        let importedCount = 0;
        for (const fileData of selectedFiles) {
          const bookName = fileData.name.replace(/\.txt$/i, '');

          const newWorldBook = {
            id: 'wb_txt_' + Date.now() + '_' + importedCount,
            name: bookName,
            content: [{
              keys: [],
              comment: '由TXT文件导入',
              content: fileData.content.trim(),
              enabled: true
            }],
            categoryId: null
          };

          await db.worldBooks.add(newWorldBook);
          state.worldBooks.push(newWorldBook);
          importedCount++;

          // 添加小延迟确保ID唯一
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        await renderWorldBookScreen();
        await showCustomAlert('导入成功', `成功导入 ${importedCount} 个TXT文件到世界书！`);

      } catch (error) {
        console.error("TXT文件导入失败:", error);
        await showCustomAlert('导入失败', `TXT文件导入失败: ${error.message}`);
      }
    }

    // 显示TXT文件导入确认对话框
    function showTxtImportConfirmModal(fileContents) {
      return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
          <div class="modal-content" style="max-width: 600px; max-height: 80vh; display: flex; flex-direction: column;">
            <h2 style="margin-top: 0;">确认导入TXT文件</h2>
            <p style="color: #666; margin-bottom: 15px;">
              找到 ${fileContents.length} 个TXT文件，请选择要导入的文件：
            </p>
            <div style="flex: 1; overflow-y: auto; margin-bottom: 20px;">
              ${fileContents.map((file, index) => `
                <div style="margin-bottom: 15px; padding: 15px; background: #f5f5f5; border-radius: 8px;">
                  <label style="display: flex; align-items: start; cursor: pointer;">
                    <input type="checkbox" class="txt-import-checkbox" data-index="${index}" 
                           style="margin-right: 10px; margin-top: 3px;" checked>
                    <div style="flex: 1;">
                      <div style="font-weight: bold; margin-bottom: 8px;">${escapeHTML(file.name)}</div>
                      <div style="font-size: 12px; color: #666; max-height: 100px; overflow: auto; 
                                  white-space: pre-wrap; word-break: break-word; 
                                  background: white; padding: 8px; border-radius: 4px;">
                        ${escapeHTML(file.content.substring(0, 200))}${file.content.length > 200 ? '...' : ''}
                      </div>
                      <div style="font-size: 11px; color: #999; margin-top: 5px;">
                        文件大小: ${(file.content.length / 1024).toFixed(2)} KB
                      </div>
                    </div>
                  </label>
                </div>
              `).join('')}
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
              <button id="txt-import-select-all" style="padding: 10px 20px; background: #666; color: white; 
                      border: none; border-radius: 5px; cursor: pointer;">全选</button>
              <button id="txt-import-cancel" style="padding: 10px 20px; background: #ccc; color: #333; 
                      border: none; border-radius: 5px; cursor: pointer;">取消</button>
              <button id="txt-import-confirm" style="padding: 10px 20px; background: #007aff; color: white; 
                      border: none; border-radius: 5px; cursor: pointer;">确认导入</button>
            </div>
          </div>
        `;

        document.body.appendChild(modal);

        const checkboxes = modal.querySelectorAll('.txt-import-checkbox');

        // 全选/取消全选按钮
        const selectAllBtn = modal.querySelector('#txt-import-select-all');
        let allSelected = true;
        selectAllBtn.addEventListener('click', () => {
          allSelected = !allSelected;
          checkboxes.forEach(cb => cb.checked = allSelected);
          selectAllBtn.textContent = allSelected ? '取消全选' : '全选';
        });

        // 取消按钮
        modal.querySelector('#txt-import-cancel').addEventListener('click', () => {
          document.body.removeChild(modal);
          resolve(null);
        });

        // 确认按钮
        modal.querySelector('#txt-import-confirm').addEventListener('click', () => {
          const selected = [];
          checkboxes.forEach(cb => {
            if (cb.checked) {
              const index = parseInt(cb.dataset.index);
              selected.push(fileContents[index]);
            }
          });

          document.body.removeChild(modal);

          if (selected.length === 0) {
            showCustomAlert('提示', '请至少选择一个文件进行导入');
            resolve(null);
          } else {
            resolve(selected);
          }
        });

        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            document.body.removeChild(modal);
            resolve(null);
          }
        });
      });
    }

    // 新增：处理DOCX文件导入
    async function handleDocxWorldBookImport(docxFiles) {
      try {
        // 检查mammoth是否可用
        if (typeof mammoth === 'undefined') {
          throw new Error('mammoth库未加载，无法解析DOCX文件');
        }

        // 读取所有DOCX文件的内容
        const fileContents = await Promise.all(
          docxFiles.map(async (file) => {
            try {
              const arrayBuffer = await file.arrayBuffer();
              const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
              return {
                name: file.name,
                content: result.value
              };
            } catch (error) {
              console.error('解析DOCX文件失败:', file.name, error);
              return null;
            }
          })
        );

        // 过滤掉解析失败的文件
        const validFiles = fileContents.filter(f => f !== null && f.content);

        if (validFiles.length === 0) {
          await showCustomAlert('导入失败', '无法解析任何DOCX文件');
          return;
        }

        // 显示确认对话框让用户选择要导入的文件
        const selectedFiles = await showDocxImportConfirmModal(validFiles);

        if (!selectedFiles || selectedFiles.length === 0) {
          return;
        }

        // 为每个选中的DOCX文件创建一本世界书
        let importedCount = 0;
        for (const fileData of selectedFiles) {
          const bookName = fileData.name.replace(/\.docx$/i, '');

          const newWorldBook = {
            id: 'wb_docx_' + Date.now() + '_' + importedCount,
            name: bookName,
            content: [{
              keys: [],
              comment: '由DOCX文件导入',
              content: fileData.content.trim(),
              enabled: true
            }],
            categoryId: null
          };

          await db.worldBooks.add(newWorldBook);
          state.worldBooks.push(newWorldBook);
          importedCount++;

          // 添加小延迟确保ID唯一
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        await renderWorldBookScreen();
        await showCustomAlert('导入成功', `成功导入 ${importedCount} 个DOCX文件到世界书！`);

      } catch (error) {
        console.error('DOCX文件导入失败:', error);
        await showCustomAlert('导入失败', `DOCX文件导入失败: ${error.message}`);
      }
    }

    // 显示DOCX文件导入确认对话框
    function showDocxImportConfirmModal(fileContents) {
      return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
          <div class="modal-content" style="max-width: 600px; max-height: 80vh; display: flex; flex-direction: column;">
            <h2 style="margin-top: 0;">确认导入DOCX文件</h2>
            <p style="color: #666; margin-bottom: 15px;">
              找到 ${fileContents.length} 个DOCX文件，请选择要导入的文件：
            </p>
            <div style="flex: 1; overflow-y: auto; margin-bottom: 20px;">
              ${fileContents.map((file, index) => `
                <div style="margin-bottom: 15px; padding: 15px; background: #f5f5f5; border-radius: 8px;">
                  <label style="display: flex; align-items: start; cursor: pointer;">
                    <input type="checkbox" class="docx-import-checkbox" data-index="${index}" 
                           style="margin-right: 10px; margin-top: 3px;" checked>
                    <div style="flex: 1;">
                      <div style="font-weight: bold; margin-bottom: 8px;">${escapeHTML(file.name)}</div>
                      <div style="font-size: 12px; color: #666; max-height: 100px; overflow: auto; 
                                  white-space: pre-wrap; word-break: break-word; 
                                  background: white; padding: 8px; border-radius: 4px;">
                        ${escapeHTML(file.content.substring(0, 200))}${file.content.length > 200 ? '...' : ''}
                      </div>
                      <div style="font-size: 11px; color: #999; margin-top: 5px;">
                        文件大小: ${(file.content.length / 1024).toFixed(2)} KB
                      </div>
                    </div>
                  </label>
                </div>
              `).join('')}
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
              <button id="docx-import-select-all" style="padding: 10px 20px; background: #666; color: white; 
                      border: none; border-radius: 5px; cursor: pointer;">全选</button>
              <button id="docx-import-cancel" style="padding: 10px 20px; background: #ccc; color: #333; 
                      border: none; border-radius: 5px; cursor: pointer;">取消</button>
              <button id="docx-import-confirm" style="padding: 10px 20px; background: #007aff; color: white; 
                      border: none; border-radius: 5px; cursor: pointer;">确认导入</button>
            </div>
          </div>
        `;

        document.body.appendChild(modal);

        const checkboxes = modal.querySelectorAll('.docx-import-checkbox');

        // 全选/取消全选按钮
        const selectAllBtn = modal.querySelector('#docx-import-select-all');
        let allSelected = true;
        selectAllBtn.addEventListener('click', () => {
          allSelected = !allSelected;
          checkboxes.forEach(cb => cb.checked = allSelected);
          selectAllBtn.textContent = allSelected ? '取消全选' : '全选';
        });

        // 取消按钮
        modal.querySelector('#docx-import-cancel').addEventListener('click', () => {
          document.body.removeChild(modal);
          resolve(null);
        });

        // 确认按钮
        modal.querySelector('#docx-import-confirm').addEventListener('click', () => {
          const selected = [];
          checkboxes.forEach(cb => {
            if (cb.checked) {
              const index = parseInt(cb.dataset.index);
              selected.push(fileContents[index]);
            }
          });

          document.body.removeChild(modal);

          if (selected.length === 0) {
            showCustomAlert('提示', '请至少选择一个文件进行导入');
            resolve(null);
          } else {
            resolve(selected);
          }
        });

        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            document.body.removeChild(modal);
            resolve(null);
          }
        });
      });
    }

    // 新增：处理ZIP文件导入
    async function handleZipWorldBookImport(zipFiles) {
      try {
        // 检查JSZip是否可用
        if (typeof JSZip === 'undefined') {
          throw new Error('JSZip库未加载，请刷新页面重试');
        }

        let allExtractedFiles = [];

        // 处理所有ZIP文件
        for (const zipFile of zipFiles) {
          console.log('正在处理ZIP文件:', zipFile.name);

          const zip = await JSZip.loadAsync(zipFile);
          const zipFileName = zipFile.name.replace(/\.zip$/i, '');

          // 遍历ZIP中的所有文件
          for (const [filename, file] of Object.entries(zip.files)) {
            // 跳过目录和JSON文件
            if (file.dir) continue;

            const lowerFilename = filename.toLowerCase();

            // 只处理TXT和DOCX文件，忽略JSON文件
            if (lowerFilename.endsWith('.json')) {
              console.log('跳过JSON文件:', filename);
              continue;
            }

            if (lowerFilename.endsWith('.txt')) {
              // 处理TXT文件
              const content = await file.async('text');
              allExtractedFiles.push({
                name: filename,
                content: content,
                type: 'txt',
                zipName: zipFileName
              });
              console.log('提取TXT文件:', filename);

            } else if (lowerFilename.endsWith('.docx')) {
              // 处理DOCX文件
              try {
                const arrayBuffer = await file.async('arraybuffer');

                // 使用mammoth解析DOCX
                if (typeof mammoth !== 'undefined') {
                  const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
                  allExtractedFiles.push({
                    name: filename,
                    content: result.value,
                    type: 'docx',
                    zipName: zipFileName
                  });
                  console.log('提取DOCX文件:', filename);
                } else {
                  console.warn('mammoth库未加载，无法解析DOCX文件:', filename);
                }
              } catch (error) {
                console.error('解析DOCX文件失败:', filename, error);
              }
            }
          }
        }

        if (allExtractedFiles.length === 0) {
          await showCustomAlert('提示', 'ZIP文件中没有找到可导入的TXT或DOCX文件（JSON文件已被忽略）');
          return;
        }

        console.log('从ZIP中提取的文件总数:', allExtractedFiles.length);

        // 显示确认对话框让用户选择要导入的文件
        const selectedFiles = await showZipImportConfirmModal(allExtractedFiles);

        if (!selectedFiles || selectedFiles.length === 0) {
          return;
        }

        // 为每个选中的文件创建一本世界书
        let importedCount = 0;
        for (const fileData of selectedFiles) {
          const bookName = fileData.name.replace(/\.(txt|docx)$/i, '');

          const newWorldBook = {
            id: 'wb_zip_' + Date.now() + '_' + importedCount,
            name: `${bookName} (来自${fileData.zipName})`,
            content: [{
              keys: [],
              comment: `由ZIP文件中的${fileData.type.toUpperCase()}文件导入`,
              content: fileData.content.trim(),
              enabled: true
            }],
            categoryId: null
          };

          await db.worldBooks.add(newWorldBook);
          state.worldBooks.push(newWorldBook);
          importedCount++;

          // 添加小延迟确保ID唯一
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        await renderWorldBookScreen();
        await showCustomAlert('导入成功', `成功从ZIP文件导入 ${importedCount} 个世界书！`);

      } catch (error) {
        console.error('ZIP文件导入失败:', error);
        await showCustomAlert('导入失败', `ZIP文件导入失败: ${error.message}`);
      }
    }

    // 显示ZIP文件导入确认对话框
    function showZipImportConfirmModal(fileContents) {
      return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
          <div class="modal-content" style="max-width: 600px; max-height: 80vh; display: flex; flex-direction: column;">
            <h2 style="margin-top: 0;">确认从ZIP导入文件</h2>
            <p style="color: #666; margin-bottom: 15px;">
              从ZIP文件中找到 ${fileContents.length} 个可导入文件（TXT/DOCX），请选择要导入的文件：
            </p>
            <div style="flex: 1; overflow-y: auto; margin-bottom: 20px;">
              ${fileContents.map((file, index) => `
                <div style="margin-bottom: 15px; padding: 15px; background: #f5f5f5; border-radius: 8px;">
                  <label style="display: flex; align-items: start; cursor: pointer;">
                    <input type="checkbox" class="zip-import-checkbox" data-index="${index}" 
                           style="margin-right: 10px; margin-top: 3px;" checked>
                    <div style="flex: 1;">
                      <div style="font-weight: bold; margin-bottom: 8px;">
                        ${escapeHTML(file.name)}
                        <span style="background: #007aff; color: white; padding: 2px 6px; border-radius: 3px; 
                                     font-size: 10px; margin-left: 8px;">${file.type.toUpperCase()}</span>
                      </div>
                      <div style="font-size: 11px; color: #999; margin-bottom: 5px;">
                        来自: ${escapeHTML(file.zipName)}.zip
                      </div>
                      <div style="font-size: 12px; color: #666; max-height: 100px; overflow: auto; 
                                  white-space: pre-wrap; word-break: break-word; 
                                  background: white; padding: 8px; border-radius: 4px;">
                        ${escapeHTML(file.content.substring(0, 200))}${file.content.length > 200 ? '...' : ''}
                      </div>
                      <div style="font-size: 11px; color: #999; margin-top: 5px;">
                        文件大小: ${(file.content.length / 1024).toFixed(2)} KB
                      </div>
                    </div>
                  </label>
                </div>
              `).join('')}
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
              <button id="zip-import-select-all" style="padding: 10px 20px; background: #666; color: white; 
                      border: none; border-radius: 5px; cursor: pointer;">全选</button>
              <button id="zip-import-cancel" style="padding: 10px 20px; background: #ccc; color: #333; 
                      border: none; border-radius: 5px; cursor: pointer;">取消</button>
              <button id="zip-import-confirm" style="padding: 10px 20px; background: #007aff; color: white; 
                      border: none; border-radius: 5px; cursor: pointer;">确认导入</button>
            </div>
          </div>
        `;

        document.body.appendChild(modal);

        const checkboxes = modal.querySelectorAll('.zip-import-checkbox');

        // 全选/取消全选按钮
        const selectAllBtn = modal.querySelector('#zip-import-select-all');
        let allSelected = true;
        selectAllBtn.addEventListener('click', () => {
          allSelected = !allSelected;
          checkboxes.forEach(cb => cb.checked = allSelected);
          selectAllBtn.textContent = allSelected ? '取消全选' : '全选';
        });

        // 取消按钮
        modal.querySelector('#zip-import-cancel').addEventListener('click', () => {
          document.body.removeChild(modal);
          resolve(null);
        });

        // 确认按钮
        modal.querySelector('#zip-import-confirm').addEventListener('click', () => {
          const selected = [];
          checkboxes.forEach(cb => {
            if (cb.checked) {
              const index = parseInt(cb.dataset.index);
              selected.push(fileContents[index]);
            }
          });

          document.body.removeChild(modal);

          if (selected.length === 0) {
            showCustomAlert('提示', '请至少选择一个文件进行导入');
            resolve(null);
          } else {
            resolve(selected);
          }
        });

        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            document.body.removeChild(modal);
            resolve(null);
          }
        });
      });
    }


    async function importTavernWorldBook(tavernData, fileName) {
      const bookNameSuggestion = fileName.replace(/\.json$/i, '');

      const newBookName = await showCustomPrompt(
        "导入 Tavern AI 世界书",
        "请为这本设定集命名：",
        bookNameSuggestion
      );

      if (!newBookName || !newBookName.trim()) {
        alert("导入已取消，因为未提供书名。");
        return;
      }

      const newEntries = Object.values(tavernData.entries).map(entry => {

        return {
          keys: entry.key || [],
          comment: entry.comment || '无备注',
          content: entry.content || '',
          enabled: !entry.disable
        };
      }).filter(entry => entry.content);

      if (newEntries.length === 0) {
        alert("这个 Tavern AI 世界书中没有找到任何有效的条目。");
        return;
      }

      const newWorldBook = {
        id: 'wb_' + Date.now(),
        name: newBookName.trim(),
        content: newEntries,
        categoryId: null
      };

      await db.worldBooks.add(newWorldBook);
      state.worldBooks.push(newWorldBook);
      await renderWorldBookScreen();

      await showCustomAlert('导入成功！', `已成功从 Tavern AI 文件导入设定集《${newBookName}》。`);
    }


    async function exportWorldBooks() {
      try {
        const books = await db.worldBooks.toArray();
        const categories = await db.worldBookCategories.toArray();

        if (books.length === 0 && categories.length === 0) {
          alert("没有可导出的世界书数据。");
          return;
        }

        const backupData = {
          type: 'EPhoneWorldBookBackup',
          version: 1,
          timestamp: Date.now(),
          books: books,
          categories: categories
        };

        const blob = new Blob(
          [JSON.stringify(backupData, null, 2)], {
          type: 'application/json'
        }
        );
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `EPhone-WorldBooks-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);

        await showCustomAlert('导出成功', '所有世界书数据已成功导出！');

      } catch (error) {
        console.error("导出世界书时出错:", error);
        await showCustomAlert('导出失败', `发生了一个错误: ${error.message}`);
      }
    }


    async function importWorldBooks(data) {

      try {
        if (data.type !== 'EPhoneWorldBookBackup' || !data.books) {
          throw new Error("文件格式不正确，这不是一个有效的世界书备份文件。");
        }

        const confirmed = await showCustomConfirm(
          '导入世界书',
          '这将用文件中的数据【完全覆盖】您当前所有的世界书和分类。此操作不可撤销！', {
          confirmButtonClass: 'btn-danger',
          confirmText: '确认覆盖'
        }
        );

        if (!confirmed) return;

        await db.transaction('rw', db.worldBooks, db.worldBookCategories, async () => {
          await db.worldBooks.clear();
          await db.worldBookCategories.clear();

          if (Array.isArray(data.books)) {
            await db.worldBooks.bulkPut(data.books);
          }
          if (Array.isArray(data.categories)) {
            await db.worldBookCategories.bulkPut(data.categories);
          }
        });


        state.worldBooks = await db.worldBooks.toArray();
        await renderWorldBookScreen();

        await showCustomAlert('导入成功', '世界书数据已成功恢复！');

      } catch (error) {
        console.error("导入世界书时出错:", error);
        await showCustomAlert('导入失败', `文件解析或应用失败: ${error.message}`);
      }
    }



    const lastActiveTimestamp = localStorage.getItem('ephoneLastActiveTimestamp');
    if (lastActiveTimestamp) {
      const minutesOffline = (Date.now() - parseInt(lastActiveTimestamp)) / (1000 * 60);

      if (minutesOffline > 5) {


        simulateBackgroundActivity(minutesOffline);
      }
    }

    setupCharPlayerControls();

    window.showScreen = showScreen;
    window.openRenderingRulesScreen = openRenderingRulesScreen;
    window.handleListenTogetherClick = handleListenTogetherClick;

    window.openCharacterSelector = openCharacterSelector;
    window.openCharApp = openCharApp;
    window.switchToMyPhone = switchToMyPhone;
    window.openCharWallet = openCharWallet;
    window.switchToCharHomeScreen = switchToCharHomeScreen;

    // MY Phone 函数暴露
    window.openMyphoneScreen = openMyphoneScreen;
    window.openMyPhoneApp = openMyPhoneApp;
    window.switchToMyPhoneHomeScreen = switchToMyPhoneHomeScreen;
    window.switchToCPhone = switchToCPhone;
    window.openMyPhoneSettings = openMyPhoneSettings;
    window.openMyPhoneViewRecords = openMyPhoneViewRecords;
    window.showMyPhoneAddContactDialog = showMyPhoneAddContactDialog;
    window.manualCreateMyPhoneContact = manualCreateMyPhoneContact;
    window.showImportMainScreenCharacters = showImportMainScreenCharacters;
    window.updateImportSelectAllState = updateImportSelectAllState;
    window.importSelectedCharacters = importSelectedCharacters;
    window.openMyPhoneContactSettings = openMyPhoneContactSettings;
    window.saveMyPhoneContactSettings = saveMyPhoneContactSettings;
    window.changeMyPhoneContactAvatar = changeMyPhoneContactAvatar;
    window.addMyPhoneMessage = addMyPhoneMessage;
    window.showMyPhoneTransferActionModal = showMyPhoneTransferActionModal;
    window.handleMyPhoneTransferResponse = handleMyPhoneTransferResponse;



    const stickerActionBar = document.createElement('div');
    stickerActionBar.id = 'sticker-action-bar';
    stickerActionBar.innerHTML = `
       <input type="checkbox" id="select-all-stickers-checkbox" style="margin-right: 10px;">
      <button id="delete-selected-stickers-btn" class="form-button-secondary">删除 (0)</button>
   `;
    document.getElementById('sticker-panel').appendChild(stickerActionBar);
    const exportStickersBtn = document.createElement('button');
    exportStickersBtn.id = 'export-selected-stickers-btn';
    exportStickersBtn.textContent = '导出 (0)';
    exportStickersBtn.className = 'form-button'; // 使用主按钮样式
    exportStickersBtn.style.marginLeft = '10px';

    stickerActionBar.appendChild(exportStickersBtn);

    exportStickersBtn.addEventListener('click', executeBatchExportStickers);
    const globalCssStyleTag = document.createElement('style');
    globalCssStyleTag.id = 'global-custom-style';
    document.head.appendChild(globalCssStyleTag);


    // 初始化 qzoneStickerPanelState 并暴露到 window，供 qzone.js 等模块访问
    if (!window.qzoneStickerPanelState) {
      window.qzoneStickerPanelState = {
        isOpen: false,
        activePostId: null,
        panelEl: null,
        gridEl: null
      };
    }
    const qzoneStickerPanelState = window.qzoneStickerPanelState;
    qzoneStickerPanelState.panelEl = document.getElementById('qzone-sticker-panel');
    qzoneStickerPanelState.gridEl = document.getElementById('qzone-sticker-grid');

    const savedTheme = localStorage.getItem('ephone-theme') || 'light';
    applyTheme(savedTheme);



    const customBubbleStyleTag = document.createElement('style');
    customBubbleStyleTag.id = 'custom-bubble-style';
    document.head.appendChild(customBubbleStyleTag);



    const previewBubbleStyleTag = document.createElement('style');
    previewBubbleStyleTag.id = 'preview-bubble-style';
    document.head.appendChild(previewBubbleStyleTag);




    applyScopedCss('', '#chat-messages', 'custom-bubble-style');
    applyScopedCss('', '#settings-preview-area', 'preview-bubble-style');

    window.openRenderingRulesScreen = openRenderingRulesScreen;
    window.showScreen = showScreen;
    window.renderChatListProxy = renderChatList;
    window.renderApiSettingsProxy = renderApiSettings;
    window.renderWallpaperScreenProxy = renderWallpaperScreen;
    window.renderWorldBookScreenProxy = renderWorldBookScreen;

    await loadAllDataFromDB();
    await initFunds();

    // 初始化提示词管理器
    if (typeof initPromptManagerUI === 'function') {
      initPromptManagerUI();
    }

    applyStatusBarVisibility();
    applyPhoneFrame(state.globalSettings.showPhoneFrame);
    applyDetachStatusBarMode(state.globalSettings.detachStatusBar);
    applyMinimalChatUI(state.globalSettings.enableMinimalChatUI);
    if (typeof applyApiStyleBeautify === 'function') applyApiStyleBeautify();
    await migrateOldRedPacketData();


    applyGlobalCss(state.globalSettings.globalCss);



    const storedCount = parseInt(localStorage.getItem('unreadPostsCount')) || 0;
    updateUnreadIndicator(storedCount);



    if (state.globalSettings && (state.globalSettings.fontUrl || (state.globalSettings.globalFontSize && state.globalSettings.globalFontSize !== 16))) {
      applyCustomFont(state.globalSettings.fontUrl || '');
    }

    updateClock();
    if (window._clockTimer) clearInterval(window._clockTimer);
    window._clockTimer = setInterval(updateClock, 1000 * 30);
    applyGlobalWallpaper();
    initBatteryManager();

    applyAppIcons();
    applyWidgetData();





    document.getElementById('rules-tabs').addEventListener('click', (e) => {
      if (e.target.classList.contains('rules-tab')) {
        switchRuleCategory(e.target.dataset.categoryId);
      }
    });



    document.getElementById('add-new-rule-btn').addEventListener('click', () => openRuleEditor(null));
    document.getElementById('cancel-rule-editor-btn').addEventListener('click', () => {
      document.getElementById('rule-editor-modal').classList.remove('visible');
    });
    document.getElementById('save-rule-btn').addEventListener('click', saveRenderingRule);



    document.getElementById('pat-btn').addEventListener('click', async () => {

      if (state.activeChatId && !state.chats[state.activeChatId].isGroup) {
        const chat = state.chats[state.activeChatId];

        // 弹出选择框：拍自己还是拍对方
        const choice = await showChoiceModal('拍一拍', [
          { text: '拍对方', value: 'pat_other' },
          { text: '拍自己', value: 'pat_self' }
        ]);

        if (choice === 'pat_other') {
          handleUserPat(chat.id, chat.originalName);
        } else if (choice === 'pat_self') {
          handleUserPatSelf(chat.id);
        }
      }
    });


    let activeAnnouncementId = null;


    function showAnnouncementActions(annoId) {
      activeAnnouncementId = annoId;
      const chat = state.chats[state.activeChatId];
      const announcement = chat.announcements.find(a => a.id === annoId);
      if (!announcement) return;

      const pinButton = document.getElementById('announcement-action-pin');

      pinButton.textContent = announcement.isPinned ? '取消置顶' : '置顶公告';

      document.getElementById('announcement-actions-modal').classList.add('visible');
    }


    async function handlePinAnnouncement() {
      if (!activeAnnouncementId) return;
      const chat = state.chats[state.activeChatId];
      const announcement = chat.announcements.find(a => a.id === activeAnnouncementId);
      if (announcement) {
        announcement.isPinned = !announcement.isPinned;
        await db.chats.put(chat);
        showAnnouncementBoard();
      }
      document.getElementById('announcement-actions-modal').classList.remove('visible');
    }


    async function handleDeleteAnnouncement() {
      if (!activeAnnouncementId) return;

      const confirmed = await showCustomConfirm("确认删除", "确定要删除这条公告吗？此操作不可恢复。", {
        confirmButtonClass: 'btn-danger'
      });

      if (confirmed) {
        const chat = state.chats[state.activeChatId];

        chat.announcements = chat.announcements.filter(a => a.id !== activeAnnouncementId);
        await db.chats.put(chat);
        showAnnouncementBoard();
      }
      document.getElementById('announcement-actions-modal').classList.remove('visible');
    }

    document.getElementById('custom-modal-cancel').addEventListener('click', hideCustomModal);
    document.getElementById('custom-modal-overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('custom-modal-overlay')) hideCustomModal();
    });
    // 查看数据分布按钮
    document.getElementById('view-data-distribution-btn').addEventListener('click', viewDataDistribution);
    
    // 数据分析统计界面按钮
    document.getElementById('data-distribution-back-btn').addEventListener('click', () => {
      showScreen('api-settings-screen');
    });
    
    document.getElementById('refresh-distribution-btn').addEventListener('click', async () => {
      const container = document.getElementById('data-distribution-container');
      await renderDistributionData(container);
      showToast('数据已刷新', 'success');
    });

    document.getElementById('export-data-btn').addEventListener('click', async () => {

      const choice = await showChoiceModal('选择导出方式', [{
        text: '分片导出 (推荐，打包为ZIP，解压每个切片选择增量导入)',
        value: 'slice'
      },
      {
        text: '智能导出 (单个大文件，太大可能会导致导入不了)',
        value: 'stream'
      },
      {
        text: '传统导出 (兼容旧版或内存小的浏览器)',
        value: 'blob'
      }
      ]);


      if (choice === 'slice') {
        exportDataAsSlicedZip();
      } else if (choice === 'stream') {
        exportDataAsStream();
      } else if (choice === 'blob') {
        exportDataAsBlob();
      }

    });

    // 高级导出导入功能
    document.getElementById('advanced-export-btn').addEventListener('click', async () => {
      await showAdvancedExportImportModal();
    });

    // 高级导入文件选择
    document.getElementById('advanced-import-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await handleAdvancedImport(file);
        e.target.value = ''; // 清空文件选择
      }
    });

    document.getElementById('cleanup-data-btn').addEventListener('click', cleanupRedundantData);

    document.getElementById('offline-mode-toggle').addEventListener('change', (e) => {

      document.getElementById('offline-mode-options').style.display = e.target.checked ? 'block' : 'none';
    });
    document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-data-input').click());
    document.getElementById('time-perception-toggle').addEventListener('change', (e) => {
      document.getElementById('time-zone-group').style.display = e.target.checked ? 'block' : 'none';
    });
    
    // 双语模式开关事件
    document.getElementById('bilingual-mode-toggle').addEventListener('change', (e) => {
      document.getElementById('bilingual-display-mode-group').style.display = e.target.checked ? 'flex' : 'none';
    });
    
    // 自动记忆开关实时生效
    document.getElementById('auto-memory-toggle').addEventListener('change', (e) => {
      const chat = state.chats[state.activeChatId];
      if (chat) {
        chat.settings.enableAutoMemory = e.target.checked;
        db.chats.put(chat); // 立即保存到数据库
      }
    });
    
    // 记忆模式选择器事件绑定
    document.querySelectorAll('#memory-mode-selector .memory-mode-option').forEach(option => {
      option.addEventListener('click', async () => {
        const chat = state.chats[state.activeChatId];
        if (!chat) return;
        const mode = option.dataset.mode;
        
        // 更新UI
        document.querySelectorAll('#memory-mode-selector .memory-mode-option').forEach(o => o.classList.remove('active'));
        option.classList.add('active');
        
        // 更新设置
        chat.settings.memoryMode = mode;
        // 同步兼容性开关
        chat.settings.enableStructuredMemory = (mode === 'structured');
        chat.settings.enableDiaryMode = (mode === 'diary');
        document.getElementById('structured-memory-toggle').checked = (mode === 'structured');
        document.getElementById('diary-mode-toggle').checked = (mode === 'diary');
        
        // 显示/隐藏日记模式子选项
        const diaryOptions = document.getElementById('diary-mode-options');
        if (diaryOptions) diaryOptions.style.display = (mode === 'diary') ? 'flex' : 'none';
        
        await db.chats.put(chat);
        
        // 如果切换到结构化模式且有长期记忆，提示转换
        if (mode === 'structured' && chat.longTermMemory && chat.longTermMemory.length > 0 && window.structuredMemoryManager) {
          const confirmed = await showCustomConfirm(
            '转换长期记忆',
            `检测到你有 ${chat.longTermMemory.length} 条长期记忆。是否将它们自动转换为结构化记忆？`,
            { confirmButtonText: '立即转换', cancelButtonText: '暂不转换' }
          );
          if (confirmed) {
            showToast('正在转换长期记忆...', 'info');
            await convertLongTermMemoryToStructured(state.activeChatId);
          }
        }
      });
    });

    // 日记模式开关实时生效
    document.getElementById('diary-mode-toggle').addEventListener('change', (e) => {
      const chat = state.chats[state.activeChatId];
      if (chat) {
        chat.settings.enableDiaryMode = e.target.checked;
        db.chats.put(chat); // 立即保存到数据库
      }
    });
    
    // 结构化记忆开关实时生效（兼容旧逻辑，现在由模式选择器控制）
    document.getElementById('structured-memory-toggle').addEventListener('change', async (e) => {
      const chat = state.chats[state.activeChatId];
      if (chat) {
        const wasEnabled = chat.settings.enableStructuredMemory;
        const isNowEnabled = e.target.checked;
        chat.settings.enableStructuredMemory = isNowEnabled;
        await db.chats.put(chat); // 立即保存到数据库
        
        // 如果从关闭变为开启，且有长期记忆，则自动转换
        if (!wasEnabled && isNowEnabled && chat.longTermMemory && chat.longTermMemory.length > 0) {
          const confirmed = await showCustomConfirm(
            '转换长期记忆', 
            `检测到你有 ${chat.longTermMemory.length} 条长期记忆。是否将它们自动转换为结构化记忆？\n\n这将调用API进行转换，会消耗一定额度。`,
            { confirmButtonText: '立即转换', cancelButtonText: '暂不转换' }
          );
          
          if (confirmed) {
            showToast('正在转换长期记忆...', 'info');
            await convertLongTermMemoryToStructured(state.activeChatId);
          }
        }
      }
    });
    
    // 限制长期记忆开关实时生效
    document.getElementById('limit-memory-toggle').addEventListener('change', async (e) => {
      const chat = state.chats[state.activeChatId];
      if (chat) {
        chat.settings.limitLongTermMemory = e.target.checked;
        await db.chats.put(chat);
        
        // 显示/隐藏输入框
        document.getElementById('memory-limit-input-group').style.display = 
          e.target.checked ? 'block' : 'none';
        updateTokenCountDisplay();
      }
    });
    
    // 限制数量输入框实时保存
    document.getElementById('memory-limit-count').addEventListener('change', async (e) => {
      const chat = state.chats[state.activeChatId];
      if (chat) {
        const value = parseInt(e.target.value) || 50;
        // 确保值在合理范围内
        const clampedValue = Math.max(1, Math.min(1000, value));
        e.target.value = clampedValue;
        chat.settings.longTermMemoryLimit = clampedValue;
        await db.chats.put(chat);
        updateTokenCountDisplay();
      }
    });
    
    // 显示隐藏消息开关实时生效
    document.getElementById('show-hidden-msg-toggle').addEventListener('change', (e) => {
      const chat = state.chats[state.activeChatId];
      if (chat) {
        chat.settings.showHiddenMessages = e.target.checked;
        db.chats.put(chat); // 立即保存到数据库
        renderChatInterface(state.activeChatId); // 立即刷新聊天区域显示
      }
    });

    document.getElementById('import-data-input').addEventListener('change', e => handleSmartImport(e.target.files[0]));
    document.getElementById('import-card-input').addEventListener('change', handleCardImport);

    // 批量导入模态框事件监听
    document.getElementById('select-all-import-cards')?.addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.batch-import-card-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        const cardId = cb.dataset.cardId;
        const card = pendingImportCards.find(c => c.id === cardId);
        if (card) card.selected = e.target.checked;
      });
    });

    document.getElementById('confirm-batch-import-btn')?.addEventListener('click', confirmBatchImport);
    document.getElementById('cancel-batch-import-btn')?.addEventListener('click', cancelBatchImport);

    // ============================================================
    // ▼▼▼ 全局安全返回与变量清理系统 (防炸群/防串台) ▼▼▼
    // ============================================================

    // 1. 定义通用清理函数 (所有“退出/返回”操作都应该调用它)
    function forceGlobalCleanup() {
      console.log("执行全局变量清理...");

      // A. 清理回复/引用状态
      if (typeof cancelReplyMode === 'function') cancelReplyMode();
      currentReplyContext = null;

      // B. 清理多选/编辑模式
      if (typeof exitSelectionMode === 'function') exitSelectionMode();

      // C. 清理定时器 (防止外卖/游戏倒计时在后台报错)
      if (typeof cleanupWaimaiTimers === 'function') cleanupWaimaiTimers();
      if (typeof stopAutoBackupTimer === 'function') stopAutoBackupTimer(); // 如果有自动备份

      // D. 强制关闭悬浮层/面板
      const gomokuOverlay = document.getElementById('gomoku-overlay');
      if (gomokuOverlay) {
        gomokuOverlay.classList.remove('visible');
        // 重置五子棋状态，防止下次打开卡死
        if (state.activeChatId && gomokuState[state.activeChatId]) {
          gomokuState[state.activeChatId].isActive = false;
        }
      }

      const stickerPanel = document.getElementById('sticker-panel');
      if (stickerPanel) stickerPanel.classList.remove('visible');

      const musicPanel = document.getElementById('music-playlist-panel');
      if (musicPanel) musicPanel.classList.remove('visible');

      // E. 清理全局临时变量 (最重要的一步！)
      ruleCache = {};
      activeMessageTimestamp = null;
      activeTransferTimestamp = null;
      //lastRawAiResponse = ''; 
      //lastResponseTimestamps = [];

      // F. 重置 UI 样式
      applyScopedCss('', '#chat-messages', 'custom-bubble-style');
      applyScopedCss('', '#settings-preview-area', 'preview-bubble-style');

      const typingIndicator = document.getElementById('typing-indicator');
      if (typingIndicator) typingIndicator.style.display = 'none';

      // G. 核心：解除当前聊天绑定
      state.activeChatId = null;
    }

    // 2. 绑定：聊天界面 -> 返回列表
    document.getElementById('back-to-list-btn').addEventListener('click', () => {
      forceGlobalCleanup(); // 执行清理
      showScreen('chat-list-screen'); // 切换画面
    });

    // 3. 绑定：狼人杀 -> 退出游戏
    document.getElementById('exit-werewolf-game-btn').addEventListener('click', async () => {
      const confirmed = await showCustomConfirm('退出游戏', '确定要退出当前这局狼人杀吗？游戏进度将不会被保存。', {
        confirmButtonClass: 'btn-danger'
      });
      if (confirmed) {
        werewolfGameState.isActive = false;

        // 如果是群聊模式，返回聊天界面（不清理activeChatId，因为还在群里）
        if (werewolfGameState.chatId) {
          showScreen('chat-interface-screen');
        } else {
          // 如果是全局模式，返回主页（执行清理！）
          forceGlobalCleanup();
          showScreen('home-screen');
        }
      }
    });

    // 4. 绑定：绿江/支付宝/设置 -> 返回主页 (自动查找并绑定)
    // 因为这些按钮在HTML里没有ID，我们用选择器批量绑定“安全锁”
    const safeBackSelectors = [
      '#green-river-screen .gr-icon-btn', // 绿江返回
      '#alipay-screen .back-btn',         // 支付宝返回
      '#api-settings-screen .back-btn',   // API设置返回
      '#wallpaper-screen .back-btn',      // 外观设置返回
      '#font-settings-screen .back-btn',  // 字体设置返回
      '#tutorial-screen .back-btn'        // 教程返回
    ];

    safeBackSelectors.forEach(selector => {
      const btn = document.querySelector(selector);
      if (btn) {
        // 移除旧的 inline onclick (如果有冲突的话)，或者直接追加
        // 这里我们追加一个清理操作，它会在 onclick 跳转之前或同时执行
        btn.addEventListener('click', () => {
          forceGlobalCleanup();
          // 注意：原本的 showScreen('home-screen') 写在 HTML onclick 里，依然会执行
          // 这里只是额外加了一道保险
        });
      }
    });

    // ============================================================


    document.getElementById('add-chat-btn').addEventListener('click', async () => {

      const choice = await showChoiceModal('创建新聊天', [{
        text: '手动创建角色',
        value: 'manual'
      },
      {
        text: '从角色卡导入 (.json/.png)',
        value: 'import_card'
      },
      {
        text: '导入文件（仅TXT、DOCX、ZIP，ZIP也只解析TXT和DOCX）',
        value: 'import_file'
      }
      ]);

      if (choice === 'manual') {

        const remarkName = await showCustomPrompt('创建新聊天 (第1/2步)', '请输入你想为Ta设置的【备注名】');
        if (!remarkName || !remarkName.trim()) return;

        const originalName = await showCustomPrompt('创建新聊天 (第2/2步)', '请输入Ta的【本名】');
        if (!originalName || !originalName.trim()) return;


        const newChatId = 'chat_' + Date.now();
        const newChat = {
          id: newChatId,
          name: remarkName.trim(),
          originalName: originalName.trim(),
          isGroup: false,
          isPinned: false,
          unreadCount: 0,
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
            aiPersona: '这是一个通过手动创建的角色。',
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
        renderChatList();

      } else if (choice === 'import_card') {

        try {

          await requirePinActivation();


          document.getElementById('import-card-input').click();

        } catch (error) {

          console.warn("角色卡导入被取消:", error.message);
        }

      } else if (choice === 'import_file') {
        // 导入文件（非酒馆）
        await handleCharacterFileImport();
      }
    });



    document.getElementById('add-group-chat-btn').addEventListener('click', window.openContactPickerForGroupCreate);

    document.getElementById('transfer-cancel-btn').addEventListener('click', () => document.getElementById('transfer-modal').classList.remove('visible'));
    document.getElementById('transfer-confirm-btn').addEventListener('click', sendUserTransfer);

    document.getElementById('listen-together-btn').addEventListener('click', handleListenTogetherClick);
    document.getElementById('music-exit-btn').addEventListener('click', () => endListenTogetherSession(true));
    document.getElementById('music-return-btn').addEventListener('click', returnToChat);
    document.getElementById('music-play-pause-btn').addEventListener('click', togglePlayPause);
    document.getElementById('music-next-btn').addEventListener('click', playNext);
    document.getElementById('music-prev-btn').addEventListener('click', playPrev);
    document.getElementById('music-mode-btn').addEventListener('click', changePlayMode);
    document.getElementById('music-playlist-btn').addEventListener('click', () => {
      updatePlaylistUI();
      document.getElementById('music-playlist-panel').classList.add('visible');
    });
    document.getElementById('close-playlist-btn').addEventListener('click', () => document.getElementById('music-playlist-panel').classList.remove('visible'));
    document.getElementById('manage-playlist-btn').addEventListener('click', togglePlaylistManagementMode);
    document.getElementById('select-all-playlist-checkbox').addEventListener('change', handleSelectAllPlaylistItems);
    document.getElementById('delete-selected-songs-btn').addEventListener('click', executeDeleteSelectedSongs);
    document.getElementById('upload-selected-to-catbox-btn').addEventListener('click', executeBatchUploadToCatbox);
    
    // 上传按钮 -> 复用通用弹窗
    document.getElementById('add-song-upload-btn').addEventListener('click', async () => {
      const choice = await showChoiceModal('选择上传方式', [
        { text: '📁 本地文件', value: 'local' },
        { text: '🔗 网络URL', value: 'url' }
      ]);
      if (choice === 'local') {
        document.getElementById('local-song-upload-input').click();
      } else if (choice === 'url') {
        addSongFromURL();
      }
    });
    
    document.getElementById('local-song-upload-input').addEventListener('change', addSongFromLocal);

    document.getElementById('playlist-body').addEventListener('click', (e) => {
      const target = e.target;
      const trackIndex = parseInt(target.dataset.index);

      if (isNaN(trackIndex)) return;

      if (target.classList.contains('album-art-btn')) {
        handleChangeAlbumArt(trackIndex);
      } else if (target.classList.contains('lyrics-btn')) {
        handleManualLrcImport(trackIndex);
      } else if (target.classList.contains('bg-btn')) {
        handleChangeBackground(trackIndex);
      } else if (target.classList.contains('delete-track-btn')) {
        deleteTrack(trackIndex);
      }
    });

    audioPlayer.addEventListener('ended', async () => { // 1. 在这里添加 async
      document.getElementById('vinyl-view').classList.remove('spinning');

      // 2. 保持 playNext(true) 不变，这样它就不会发送“用户切歌”的错误提示
      playNext(true);

      // 3. 等待 playNext 执行完毕，确保 musicState.currentIndex 已经更新
      //    (注意：playNext 不是异步的，但 playSong 是。不过 playNext 会同步更新 currentIndex)
      //    为了保险起见，我们稍微等待一下确保状态已更新。
      await new Promise(resolve => setTimeout(resolve, 50));

      // 4. 手动添加一条“自动换歌”的系统提示
      const track = musicState.playlist[musicState.currentIndex];
      if (track && musicState.isActive && musicState.activeChatId) {
        const chat = state.chats[musicState.activeChatId];
        if (chat) {
          const systemMessage = {
            role: 'system',
            content: `[系统提示：上一首歌曲播放完毕，已自动为你切换到《${track.name}》 - ${track.artist}]`,
            timestamp: Date.now(),
            isHidden: true // 这条消息用户看不见，但AI在下次回复时会读到
          };
          chat.history.push(systemMessage);
          await db.chats.put(chat); // 异步保存到数据库
        }
      }
    });





    const chatInput = document.getElementById('chat-input');


    document.getElementById('send-btn').addEventListener('click', () => {
      playSilentAudio();
      const content = chatInput.value.trim();
      if (!content || !state.activeChatId) return;

      const chat = state.chats[state.activeChatId];
      if (content.startsWith('/n ') || content.startsWith('/旁白 ')) {
        const narrationText = content.replace(/^\/n\s+|^\/旁白\s+/, '');

        const msg = {
          role: 'system', // 设为 system 居中显示
          type: 'narration',
          content: narrationText,
          timestamp: Date.now()
        };

        // 保存并渲染
        chat.history.push(msg);
        db.chats.put(chat);
        appendMessage(msg, chat);

        chatInput.value = '';
        chatInput.style.height = 'auto';
        chatInput.focus();
        return; // 阻止发送普通消息
      }
      const msg = {
        role: 'user',
        content,
        timestamp: Date.now()
      };

      if (currentReplyContext) {
        msg.quote = currentReplyContext;
      }


      appendMessage(msg, chat);


      (async () => {
        chat.history.push(msg);
        await db.chats.put(chat);
        renderChatList();

      })();


      chatInput.value = '';
      chatInput.style.height = 'auto';
      chatInput.focus();
      cancelReplyMode();
      document.body.classList.remove('chat-actions-expanded');
    });
    document.getElementById('wait-reply-btn').addEventListener('click', triggerAiResponse);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('send-btn').click();
      }
    });

    // ========================================
    // 表情包智能匹配功能
    // ========================================
    let smartMatchDebounceTimer = null;
    const smartMatchPanel = document.getElementById('smart-sticker-match-panel');
    const smartMatchGrid = document.getElementById('smart-sticker-match-grid');

    // 输入框输入事件监听
    chatInput.addEventListener('input', () => {
      // 清除之前的定时器
      if (smartMatchDebounceTimer) {
        clearTimeout(smartMatchDebounceTimer);
      }

      // 检查是否启用智能匹配
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];
      if (!chat || !chat.settings.enableStickerSmartMatch) {
        smartMatchPanel.style.display = 'none';
        return;
      }

      const inputText = chatInput.value.trim();
      
      // 如果输入为空，隐藏面板
      if (!inputText) {
        smartMatchPanel.style.display = 'none';
        return;
      }

      // 防抖：延迟300ms后执行匹配
      smartMatchDebounceTimer = setTimeout(() => {
        performSmartStickerMatch(inputText, chat);
      }, 300);
    });

    // 执行智能匹配
    function performSmartStickerMatch(inputText, chat) {
      // 获取当前聊天的表情包分类
      const categoryId = chat.settings.stickerCategoryId;
      let availableStickers = [];

      if (categoryId) {
        // 使用指定分类的表情包
        const category = state.stickerCategories.find(c => c.id === categoryId);
        if (category) {
          availableStickers = state.userStickers.filter(s => s.categoryId === categoryId);
        }
      } else {
        // 使用所有表情包
        availableStickers = state.userStickers;
      }

      if (availableStickers.length === 0) {
        smartMatchPanel.style.display = 'none';
        return;
      }

      // 简单的关键词匹配算法
      const matches = [];
      const keywords = inputText.toLowerCase().split(/\s+/);

      availableStickers.forEach(sticker => {
        if (!sticker.name) return;
        
        const stickerName = sticker.name.toLowerCase();
        let score = 0;

        // 计算匹配分数
        keywords.forEach(keyword => {
          if (stickerName.includes(keyword)) {
            score += keyword.length;
          }
        });

        // 完全匹配加分
        if (stickerName === inputText.toLowerCase()) {
          score += 100;
        }

        // 包含完整输入文本加分
        if (stickerName.includes(inputText.toLowerCase())) {
          score += 50;
        }

        if (score > 0) {
          matches.push({ sticker, score });
        }
      });

      // 按分数排序，取前5个
      matches.sort((a, b) => b.score - a.score);
      const topMatches = matches.slice(0, 5);

      if (topMatches.length === 0) {
        smartMatchPanel.style.display = 'none';
        return;
      }

      // 渲染匹配结果
      smartMatchGrid.innerHTML = '';
      topMatches.forEach(({ sticker }) => {
        const stickerItem = document.createElement('div');
        stickerItem.className = 'sticker-item';
        stickerItem.innerHTML = `
          <div class="sticker-image-container" style="background-image: url('${sticker.url}');"></div>
          <div class="sticker-name">${escapeHTML(sticker.name)}</div>
        `;
        
        // 点击表情包发送
        stickerItem.addEventListener('click', () => {
          sendSmartMatchedSticker(sticker, chat);
        });

        smartMatchGrid.appendChild(stickerItem);
      });

      smartMatchPanel.style.display = 'block';
    }

    // 发送智能匹配的表情包
    function sendSmartMatchedSticker(sticker, chat) {
      const msg = {
        role: 'user',
        type: 'sticker',
        content: sticker.url,  // 使用content字段存储URL
        meaning: sticker.name,  // 使用meaning字段存储名称
        timestamp: Date.now()
      };

      appendMessage(msg, chat);
      chat.history.push(msg);
      db.chats.put(chat);
      renderChatList();

      // 清空输入框并隐藏匹配面板
      chatInput.value = '';
      chatInput.style.height = 'auto';
      smartMatchPanel.style.display = 'none';
      chatInput.focus();
    }

    // 点击其他地方隐藏匹配面板
    document.addEventListener('click', (e) => {
      if (!smartMatchPanel.contains(e.target) && e.target !== chatInput) {
        smartMatchPanel.style.display = 'none';
      }
    });
    // ========================================
    // 表情包智能匹配功能结束
    // ========================================


    document.getElementById('wallpaper-upload-input').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (file) {

        const base64Url = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result);
          reader.onerror = () => rej(reader.error);
          reader.readAsDataURL(file);
        });


        newWallpaperBase64 = base64Url;


        renderWallpaperScreen();


        if (state.apiConfig.imgbbEnable && state.apiConfig.imgbbApiKey) {

          (async () => {
            try {
              console.log("[ImgBB] 后台开始上传壁纸...");

              const imageUrl = await uploadImageToImgBB(base64Url);


              if (newWallpaperBase64 === base64Url) {
                newWallpaperBase64 = imageUrl; // 悄悄地将变量更新为 URL
                console.log("[ImgBB] 后台壁纸上传成功，临时变量已更新为 URL。");
              } else {
                console.log("[ImgBB] 后台壁纸上传完成，但用户已更改选择，放弃更新。");
              }
            } catch (uploadError) {

              console.error("后台壁纸上传失败:", uploadError.message);

            }
          })();
        }


        event.target.value = null;
      }
    });

    document.getElementById('save-wallpaper-btn').addEventListener('click', async () => {

      if (newWallpaperBase64) {
        state.globalSettings.wallpaper = newWallpaperBase64;
      }




      state.globalSettings.globalCss = document.getElementById('global-css-input').value.trim();
      state.globalSettings.notificationSoundUrl = document.getElementById('notification-sound-url-input').value.trim();
      state.globalSettings.notificationVolume = parseInt(document.getElementById('notification-volume-slider').value) / 100;
      state.globalSettings.showStatusBar = document.getElementById('status-bar-toggle-switch').checked;

      state.globalSettings.showPhoneFrame = document.getElementById('phone-frame-toggle-switch').checked;
      state.globalSettings.enableMinimalChatUI = document.getElementById('minimal-chat-ui-switch').checked;
      state.globalSettings.alwaysShowMusicIsland = document.getElementById('dynamic-island-music-toggle-switch').checked;
      state.globalSettings.detachStatusBar = document.getElementById('detach-status-bar-switch').checked;
      state.globalSettings.cleanChatDetail = document.getElementById('clean-chat-detail-switch').checked;
      state.globalSettings.cleanApiSettings = document.getElementById('clean-api-settings-switch').checked;
      state.globalSettings.apiStyleBeautify = document.getElementById('api-style-beautify-switch').checked;
      state.globalSettings.dropdownPopupMode = document.getElementById('dropdown-popup-mode-switch').checked;
      state.globalSettings.lockScreenEnabled = document.getElementById('lock-screen-toggle').checked;
      state.globalSettings.lockScreenPassword = document.getElementById('lock-screen-password-input').value.trim();

      const lockPreview = document.getElementById('lock-wallpaper-preview');
      if (lockPreview.dataset.tempUrl) {
        state.globalSettings.lockScreenWallpaper = lockPreview.dataset.tempUrl;
      }
      await db.globalSettings.put(state.globalSettings);


      applyGlobalWallpaper();
      applyCPhoneWallpaper();
      applyMyPhoneWallpaper();
      newWallpaperBase64 = null;

      applyAppIcons();
      applyCPhoneAppIcons();
      applyMyPhoneAppIconsGlobal();

      applyGlobalCss(state.globalSettings.globalCss);
      applyStatusBarVisibility();
      applyMinimalChatUI(state.globalSettings.enableMinimalChatUI);
      if (typeof applyApiStyleBeautify === 'function') applyApiStyleBeautify();
      initLockScreen();
      alert('外观设置已保存并应用！');
      showScreen('home-screen');
    });


    const messagesView = document.getElementById('messages-view');
    messagesView.addEventListener('scroll', () => {

      const {
        scrollTop,
        scrollHeight,
        clientHeight
      } = messagesView;



      if (scrollHeight - scrollTop - clientHeight < clientHeight) {

        if (!isLoadingMoreChats) {

          loadMoreChats();
        }
      }
    });


    document.getElementById('save-api-settings-btn').addEventListener('click', async () => {

      state.apiConfig.proxyUrl = document.getElementById('proxy-url').value.trim();
      state.apiConfig.apiKey = document.getElementById('api-key').value.trim();
      // 优先使用手写输入框的值，如果为空则使用下拉框的值
      const modelInput = document.getElementById('model-input').value.trim();
      state.apiConfig.model = modelInput || document.getElementById('model-select').value;
      state.apiConfig.minimaxGroupId = document.getElementById('minimax-group-id').value.trim();
      state.apiConfig.minimaxApiKey = document.getElementById('minimax-api-key').value.trim();
      state.apiConfig.minimaxModel = document.getElementById('minimax-model-select').value;
      const domainSelect = document.getElementById('minimax-domain-select');
      if (domainSelect) {
        state.apiConfig.minimaxDomain = domainSelect.value;
        localStorage.setItem('minimax-domain', domainSelect.value);
      }
      localStorage.setItem('minimax-group-id', state.apiConfig.minimaxGroupId);
      localStorage.setItem('minimax-api-key', state.apiConfig.minimaxApiKey);
      localStorage.setItem('minimax-model', state.apiConfig.minimaxModel);
      state.apiConfig.secondaryProxyUrl = document.getElementById('secondary-proxy-url').value.trim();
      state.apiConfig.secondaryApiKey = document.getElementById('secondary-api-key').value.trim();
      // 优先使用手写输入框的值，如果为空则使用下拉框的值
      const secondaryModelInput = document.getElementById('secondary-model-input').value.trim();
      state.apiConfig.secondaryModel = secondaryModelInput || document.getElementById('secondary-model-select').value;
      
      state.apiConfig.backgroundProxyUrl = document.getElementById('background-proxy-url').value.trim();
      state.apiConfig.backgroundApiKey = document.getElementById('background-api-key').value.trim();
      // 优先使用手写输入框的值，如果为空则使用下拉框的值
      const backgroundModelInput = document.getElementById('background-model-input').value.trim();
      state.apiConfig.backgroundModel = backgroundModelInput || document.getElementById('background-model-select').value;
      
      // 识图API
      state.apiConfig.visionProxyUrl = document.getElementById('vision-proxy-url').value.trim();
      state.apiConfig.visionApiKey = document.getElementById('vision-api-key').value.trim();
      const visionModelInput = document.getElementById('vision-model-input').value.trim();
      state.apiConfig.visionModel = visionModelInput || document.getElementById('vision-model-select').value;

      const imgbbEnable = document.getElementById('imgbb-enable-switch').checked;
      const imgbbApiKey = document.getElementById('imgbb-api-key').value.trim();
      const catboxEnable = document.getElementById('catbox-enable-switch').checked;
      const catboxUserHash = document.getElementById('catbox-userhash').value.trim();


      state.apiConfig.imgbbEnable = imgbbEnable;
      state.apiConfig.imgbbApiKey = imgbbApiKey;
      state.apiConfig.catboxEnable = catboxEnable;
      state.apiConfig.catboxUserHash = catboxUserHash;


      localStorage.setItem('imgbb-enabled', imgbbEnable);
      localStorage.setItem('imgbb-api-key', imgbbApiKey);
      localStorage.setItem('catbox-enabled', catboxEnable);
      localStorage.setItem('catbox-userhash', catboxUserHash);

      // 识图Token优化开关
      const imageTokenOptimize = document.getElementById('image-token-optimize-switch').checked;
      state.apiConfig.imageTokenOptimize = imageTokenOptimize;
      localStorage.setItem('image-token-optimize', imageTokenOptimize);

      const githubEnable = document.getElementById('github-enable-switch').checked;
      const githubAutoBackup = document.getElementById('github-auto-backup-switch').checked;
      let backupInterval = parseInt(document.getElementById('github-backup-interval').value);
      if (isNaN(backupInterval) || backupInterval < 1) backupInterval = 30;
      state.apiConfig.githubEnable = githubEnable;
      state.apiConfig.githubAutoBackup = githubAutoBackup;
      const githubProxyEnable = document.getElementById('github-proxy-switch').checked;
      const githubProxyUrl = document.getElementById('github-proxy-url').value.trim();

      state.apiConfig.githubProxyEnable = githubProxyEnable;
      state.apiConfig.githubProxyUrl = githubProxyUrl;

      localStorage.setItem('github-proxy-enabled', githubProxyEnable);
      localStorage.setItem('github-proxy-url', githubProxyUrl);
      state.apiConfig.githubUsername = document.getElementById('github-username').value.trim();
      state.apiConfig.githubRepo = document.getElementById('github-repo').value.trim();
      state.apiConfig.githubToken = document.getElementById('github-token').value.trim();
      state.apiConfig.githubFilename = document.getElementById('github-filename').value.trim() || 'ephone_backup.json';
      localStorage.setItem('github-username', state.apiConfig.githubUsername);
      localStorage.setItem('github-repo', state.apiConfig.githubRepo);
      localStorage.setItem('github-token', state.apiConfig.githubToken);
      localStorage.setItem('github-filename', state.apiConfig.githubFilename);
      state.apiConfig.novelaiApiKey = document.getElementById('novelai-api-key').value.trim();
      state.apiConfig.novelaiModel = document.getElementById('novelai-model').value;
      state.apiConfig.novelaiEnabled = document.getElementById('novelai-switch').checked;
      // 保存备份间隔
      state.apiConfig.githubBackupInterval = backupInterval;
      // 保存开关状态到 localStorage
      localStorage.setItem('github-enabled', githubEnable);
      localStorage.setItem('github-auto-backup', githubAutoBackup);
      localStorage.setItem('github-backup-interval', backupInterval);

      if (githubEnable && githubAutoBackup) {
        // 传入动态的时间间隔
        startAutoBackupTimer(backupInterval);
      } else {
        stopAutoBackupTimer();
      }
      await db.apiConfig.put(state.apiConfig);


      const backgroundSwitch = document.getElementById('background-activity-switch');
      const intervalInput = document.getElementById('background-interval-input');
      const cooldownInput = document.getElementById('block-cooldown-input');

      state.globalSettings.enableBackgroundActivity = backgroundSwitch.checked;
      state.globalSettings.backgroundActivityInterval = parseInt(intervalInput.value) || 60;
      state.globalSettings.blockCooldownHours = parseFloat(cooldownInput.value) || 1;
      state.globalSettings.enableAiDrawing = document.getElementById('enable-ai-drawing-switch').checked;

      // 新增：保存心声和动态功能开关
      state.globalSettings.enableThoughts = document.getElementById('global-enable-thoughts-switch').checked;
      state.globalSettings.customThoughtsPromptEnabled = document.getElementById('custom-thoughts-prompt-switch').checked;
      state.globalSettings.customThoughtsPrompt = document.getElementById('custom-thoughts-prompt-textarea').value;
      state.globalSettings.customSummaryPromptEnabled = document.getElementById('custom-summary-prompt-switch').checked;
      state.globalSettings.customSummaryPrompt = document.getElementById('custom-summary-prompt-textarea').value;
      state.globalSettings.enableQzoneActions = document.getElementById('global-enable-qzone-actions-switch').checked;
      state.globalSettings.enableViewMyPhone = document.getElementById('global-enable-view-myphone-switch').checked;
      state.globalSettings.enableCrossChat = document.getElementById('global-enable-cross-chat-switch').checked;
      
      // 新增：保存后台查看用户手机设置
      state.globalSettings.enableViewMyPhoneInBackground = document.getElementById('global-enable-view-myphone-bg-switch').checked;
      const viewMyPhoneChanceInput = document.getElementById('global-view-myphone-chance-input');
      state.globalSettings.viewMyPhoneChance = viewMyPhoneChanceInput.value.trim() === '' ? null : parseInt(viewMyPhoneChanceInput.value);

      state.globalSettings.chatRenderWindow = parseInt(document.getElementById('chat-render-window-input').value) || 50;
      state.globalSettings.chatListRenderWindow = parseInt(document.getElementById('chat-list-render-window-input').value) || 30;
      state.globalSettings.apiTemperature = parseFloat(document.getElementById('api-temperature-slider').value);
      
      // 方案4：保存API历史记录开关状态
      const apiHistorySwitch = document.getElementById('enable-api-history-switch');
      if (apiHistorySwitch) {
        state.globalSettings.enableApiHistory = apiHistorySwitch.checked;
      }
      
      // 保存安全渲染模式
      const safeRenderSwitch = document.getElementById('safe-render-mode-switch');
      const oldSafeRenderMode = state.globalSettings.safeRenderMode;
      if (safeRenderSwitch) {
        state.globalSettings.safeRenderMode = safeRenderSwitch.checked;
      }
      
      await db.globalSettings.put(state.globalSettings);
      
      // 如果安全渲染模式发生变化，提醒用户刷新页面
      if (safeRenderSwitch && oldSafeRenderMode !== safeRenderSwitch.checked) {
        setTimeout(() => {
          if (confirm('安全渲染模式已' + (safeRenderSwitch.checked ? '开启' : '关闭') + '，需要刷新页面才能生效。是否立即刷新？')) {
            location.reload();
          }
        }, 100);
      }

      stopBackgroundSimulation();
      if (state.globalSettings.enableBackgroundActivity) {
        startBackgroundSimulation();
        console.log(`后台活动模拟已启动，间隔: ${state.globalSettings.backgroundActivityInterval}秒`);
      } else {
        console.log("后台活动模拟已停止。");
      }

      // 保存NovelAI配置到localStorage
      const novelaiEnabled = document.getElementById('novelai-switch').checked;
      const novelaiModel = document.getElementById('novelai-model').value;
      const novelaiApiKey = document.getElementById('novelai-api-key').value.trim();
      localStorage.setItem('novelai-enabled', novelaiEnabled);
      localStorage.setItem('novelai-model', novelaiModel);
      localStorage.setItem('novelai-api-key', novelaiApiKey);

      // 保存Google Imagen配置到localStorage
      saveGoogleImagenSettings();

      alert('所有API与后台设置已保存!');
    });



    const ApiKeyInput = document.getElementById('api-key')
    ApiKeyInput.addEventListener('focus', (e) => {
      e.target.setAttribute('type', 'text')
    })
    ApiKeyInput.addEventListener('blur', (e) => {
      e.target.setAttribute('type', 'password')
    })





    async function fetchModels(urlInputId, keyInputId, selectId) {
      const url = document.getElementById(urlInputId).value.trim();
      const key = document.getElementById(keyInputId).value.trim();
      if (!url || !key) return alert('请先填写对应的反代地址和密钥');

      try {
        let isGemini = url === GEMINI_API_URL;
        const fetchOptions = isGemini ? {
          method: 'GET',
          mode: 'cors',
          cache: 'no-cache',
          credentials: 'omit'
        } : {
          method: 'GET',
          mode: 'cors',
          cache: 'no-cache',
          credentials: 'omit',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          }
        };

        const response = await fetch(
          isGemini ? `${GEMINI_API_URL}?key=${getRandomValue(key)}` : `${url}/v1/models`,
          fetchOptions
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`无法获取模型列表 (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        let models = isGemini ? data.models.map(model => ({
          id: model.name.split('/')[1] || model.name
        })) : data.data;

        if (!models || models.length === 0) {
          throw new Error('返回的模型列表为空');
        }

        const modelSelect = document.getElementById(selectId);
        modelSelect.innerHTML = '';

        const savedModel = selectId === 'model-select' ? state.apiConfig.model : state.apiConfig.secondaryModel;

        models.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = model.id;
          if (model.id === savedModel) option.selected = true;
          modelSelect.appendChild(option);
        });
        alert('模型列表已更新');
      } catch (error) {
        console.error('拉取模型失败:', error);
        alert(`拉取模型失败: ${error.message}`);
      }
    }


    document.getElementById('fetch-models-btn').addEventListener('click', () => {
      fetchModels('proxy-url', 'api-key', 'model-select');
    });


    document.getElementById('fetch-secondary-models-btn').addEventListener('click', () => {
      fetchModels('secondary-proxy-url', 'secondary-api-key', 'secondary-model-select');
    });

    document.getElementById('fetch-background-models-btn').addEventListener('click', () => {
      fetchModels('background-proxy-url', 'background-api-key', 'background-model-select');
    });

    document.getElementById('fetch-vision-models-btn').addEventListener('click', () => {
      fetchModels('vision-proxy-url', 'vision-api-key', 'vision-model-select');
    });

    // 监听主模型下拉框变化，自动填入手写框
    document.getElementById('model-select').addEventListener('change', (e) => {
      const selectedModel = e.target.value;
      if (selectedModel) {
        document.getElementById('model-input').value = selectedModel;
      }
    });

    // 监听副模型下拉框变化，自动填入手写框
    document.getElementById('secondary-model-select').addEventListener('change', (e) => {
      const selectedModel = e.target.value;
      if (selectedModel) {
        document.getElementById('secondary-model-input').value = selectedModel;
      }
    });

    // 监听后台模型下拉框变化，自动填入手写框
    document.getElementById('background-model-select').addEventListener('change', (e) => {
      const selectedModel = e.target.value;
      if (selectedModel) {
        document.getElementById('background-model-input').value = selectedModel;
      }
    });

    // 监听识图模型下拉框变化，自动填入手写框
    document.getElementById('vision-model-select').addEventListener('change', (e) => {
      const selectedModel = e.target.value;
      if (selectedModel) {
        document.getElementById('vision-model-input').value = selectedModel;
      }
    });

    // ========== 移动端控制台功能 ==========
    (function () {
      const consoleLogs = [];
      let currentFilter = 'all';

      // 保存原始console方法
      const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info
      };

      // 添加日志到数组
      function addLog(type, args) {
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        const message = Array.from(args).map(arg => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch (e) {
              return String(arg);
            }
          }
          return String(arg);
        }).join(' ');

        consoleLogs.push({ type, timestamp, message });

        // 限制日志数量，最多保存1000条
        if (consoleLogs.length > 1000) {
          consoleLogs.shift();
        }
      }

      // 重写console方法
      console.log = function (...args) {
        originalConsole.log.apply(console, args);
        addLog('log', args);
      };

      console.warn = function (...args) {
        originalConsole.warn.apply(console, args);
        addLog('warn', args);
      };

      console.error = function (...args) {
        originalConsole.error.apply(console, args);
        addLog('error', args);
      };

      console.info = function (...args) {
        originalConsole.info.apply(console, args);
        addLog('info', args);
      };

      // 捕获未处理的错误
      window.addEventListener('error', (event) => {
        const message = `${event.message}\n  at ${event.filename}:${event.lineno}:${event.colno}`;
        addLog('error', [message]);
      });

      // 捕获未处理的Promise拒绝
      window.addEventListener('unhandledrejection', (event) => {
        const message = `Unhandled Promise Rejection: ${event.reason}`;
        addLog('error', [message]);
      });

      // 渲染控制台内容
      function renderConsole() {
        const content = document.getElementById('mobile-console-content');
        if (!content) return;

        const filteredLogs = currentFilter === 'all'
          ? consoleLogs
          : consoleLogs.filter(log => log.type === currentFilter);

        if (filteredLogs.length === 0) {
          content.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">暂无日志</div>';
          return;
        }

        content.innerHTML = filteredLogs.map(log =>
          `<div class="console-entry ${log.type}">
            <span class="console-timestamp">[${log.timestamp}]</span>
            <span class="console-message">${log.message}</span>
          </div>`
        ).join('');

        // 自动滚动到底部
        content.scrollTop = content.scrollHeight;
      }

      // 打开控制台按钮
      const openConsoleBtn = document.getElementById('open-console-btn');
      if (openConsoleBtn) {
        const openConsoleHandler = async () => {
          const consolePanel = document.getElementById('mobile-console');
          if (consolePanel) {
            consolePanel.style.display = 'flex';
            renderConsole();

            // 首次打开控制台时显示提示
            const hasShownConsoleTip = localStorage.getItem('ephoneConsoleFirstTipShown');
            if (!hasShownConsoleTip) {
              await showCustomAlert(
                '💡 控制台使用提示',
                '如果您是因为遇到问题才打开控制台的，发现报错后请将错误信息发送给作者。\n\n您可以点击左上角的小人图标，进入私信页面联系作者。'
              );
              localStorage.setItem('ephoneConsoleFirstTipShown', 'true');
            }
          }
        };
        openConsoleBtn.addEventListener('click', openConsoleHandler);
        openConsoleBtn.addEventListener('touchend', (e) => {
          e.preventDefault();
          openConsoleHandler();
        }, { passive: false });
      }

      // 关闭控制台按钮
      const closeConsoleBtn = document.getElementById('console-close-btn');
      if (closeConsoleBtn) {
        const closeConsoleHandler = () => {
          const consolePanel = document.getElementById('mobile-console');
          if (consolePanel) {
            consolePanel.style.display = 'none';
          }
        };
        closeConsoleBtn.addEventListener('click', closeConsoleHandler);
        closeConsoleBtn.addEventListener('touchend', (e) => {
          e.preventDefault();
          closeConsoleHandler();
        }, { passive: false });
      }

      // 清空控制台按钮
      const clearConsoleBtn = document.getElementById('console-clear-btn');
      if (clearConsoleBtn) {
        const clearConsoleHandler = () => {
          consoleLogs.length = 0;
          renderConsole();
        };
        clearConsoleBtn.addEventListener('click', clearConsoleHandler);
        clearConsoleBtn.addEventListener('touchend', (e) => {
          e.preventDefault();
          clearConsoleHandler();
        }, { passive: false });
      }

      // 控制台标签切换
      const consoleTabs = document.querySelectorAll('.console-tab');
      consoleTabs.forEach(tab => {
        const tabClickHandler = () => {
          consoleTabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          currentFilter = tab.dataset.tab;
          renderConsole();
        };
        tab.addEventListener('click', tabClickHandler);
        tab.addEventListener('touchend', (e) => {
          e.preventDefault();
          tabClickHandler();
        }, { passive: false });
      });

      // 添加初始欢迎日志
      console.log('移动端控制台已启动');
      console.info('可在API设置中打开控制台查看日志');
    })();
    // ========== 移动端控制台功能结束 ==========

    document.getElementById('add-world-book-btn').addEventListener('click', async () => {
      const name = await showCustomPrompt('创建世界书', '请输入书名');
      if (name && name.trim()) {
        const newBook = {
          id: 'wb_' + Date.now(),
          name: name.trim(),
          content: '',
          isGlobal: false,
          injectPosition: 'before' // 默认为前
        };
        await db.worldBooks.add(newBook);
        state.worldBooks.push(newBook);
        renderWorldBookScreen();
        openWorldBookEditor(newBook.id);
      }
    });

    document.getElementById('save-world-book-btn').addEventListener('click', async () => {
      if (!window.editingWorldBookId) return;
      const book = state.worldBooks.find(wb => wb.id === window.editingWorldBookId);
      if (!book) return;


      const newName = document.getElementById('world-book-name-input').value.trim();
      if (!newName) {
        alert('书名不能为空！');
        return;
      }
      book.name = newName;
      const categoryId = document.getElementById('world-book-category-select').value;
      book.categoryId = categoryId ? parseInt(categoryId) : null;

      // 保存全局开关状态
      const isGlobal = document.getElementById('world-book-global-switch').checked;
      book.isGlobal = isGlobal;

      // 保存注入位置（无论是否全局都保存）
      const injectPosition = document.getElementById('world-book-inject-position-select').value;
      book.injectPosition = injectPosition;

      const entriesContainer = document.getElementById('world-book-entries-container');
      const entryBlocks = entriesContainer.querySelectorAll('.message-editor-block');
      const newEntries = [];

      entryBlocks.forEach(block => {
        const keysInput = block.querySelector('.entry-keys-input').value.trim();
        const content = block.querySelector('.entry-content-textarea').value.trim();
        const isEnabled = block.querySelector('.entry-enabled-switch').checked;
        if (content) {
          newEntries.push({
            comment: block.querySelector('.entry-comment-input').value.trim(),
            keys: keysInput ? keysInput.split(',').map(k => k.trim()).filter(k => k) : [],
            content: content,
            enabled: isEnabled
          });
        }
      });
      book.content = newEntries;


      await db.worldBooks.put(book);
      document.getElementById('world-book-editor-title').textContent = newName;
      window.editingWorldBookId = null;


      showScreen('world-book-screen');


      await renderWorldBookScreen();
    });

    document.getElementById('chat-messages').addEventListener('click', async (e) => {
      // 【双语模式】点击消息气泡切换翻译
      let bubble = e.target.closest('.message-bubble');
      if (bubble && bubble.dataset.originalContent && state.activeChatId) {
        const chat = state.chats[state.activeChatId];
        if (chat && chat.settings.enableBilingualMode) {
          // 检查是否是语音消息
          const isVoiceMessage = bubble.classList.contains('is-voice-message');
          
          if (isVoiceMessage) {
            // 语音消息：点击 voice-transcript 区域或整个气泡都可以切换翻译
            // 但排除点击播放按钮（voice-message-body 内的波形区域）
            if (!e.target.closest('.voice-waveform, .loading-spinner')) {
              toggleBilingualTranslation(bubble, chat);
              return;
            }
          } else {
            // 文本消息：排除点击图片、按钮等特殊元素
            if (!e.target.closest('img, button, a')) {
              toggleBilingualTranslation(bubble, chat);
              return;
            }
          }
        }
      }
      
      if (e.target.tagName === 'IMG') {
        // 检查是否是聊天里的图片类名
        if (e.target.classList.contains('chat-image') ||

          e.target.classList.contains('realimag-image') ||
          e.target.classList.contains('naiimag-image')) {

          e.stopPropagation(); // 阻止气泡被选中等其他事件

          // --- 核心修复逻辑：检测连击 ---

          // 如果这是一个快速的第二次或第三次点击 (detail > 1)，
          // 说明用户可能在尝试三击下载，或者是双击。
          // 此时我们要取消掉还没执行的“放大”操作，并不做任何放大处理。
          if (e.detail > 1) {
            if (window.simpleZoomTimer) {
              clearTimeout(window.simpleZoomTimer);
              window.simpleZoomTimer = null;
            }
            return; // 直接退出，把舞台留给三击下载逻辑
          }

          // 如果是第一次点击，我们不要立刻放大，而是等 250ms
          // 如果 250ms 内没有第二次点击，才执行放大。
          window.simpleZoomTimer = setTimeout(() => {
            openSimpleImageZoom(e.target.src);
            window.simpleZoomTimer = null;
          }, 250); // 250毫秒延迟，既不影响体感，又能避开连击

          return;
        }
      }

      // 1. 修复下载按钮 (带转圈动画)
      const downloadBtn = e.target.closest('.nai-save-local-btn');
      if (downloadBtn) {
        e.stopPropagation();

        // --- 新增：让它转起来 ---
        downloadBtn.classList.add('loading'); // 添加转圈样式
        downloadBtn.disabled = true;          // 防止连点

        const bubble = downloadBtn.closest('.message-bubble');
        const img = bubble ? bubble.querySelector('img.chat-image, img.realimag-image, img.naiimag-image') : null;

        if (img && img.src) {
          addVisualFeedback(img);
          const filename = generateFilename(img);
          downloadImage(img.src, filename);
        }

        // --- 新增：转一会儿后停止 (800毫秒后恢复) ---
        // 因为下载是浏览器接管的，JS无法知道确切结束时间，给个视觉反馈时间即可
        setTimeout(() => {
          downloadBtn.classList.remove('loading');
          downloadBtn.disabled = false;
        }, 800);

        return;
      }
      // --- 修复上传图床按钮 (原本漏掉了这个监听) ---
      const naiUploadBtn = e.target.closest('.nai-upload-imgbb-btn');
      if (naiUploadBtn) {
        e.stopPropagation();
        const bubble = e.target.closest('.message-bubble');
        if (bubble) {
          const timestamp = parseInt(bubble.dataset.timestamp);
          if (!isNaN(timestamp)) {
            // 调用已有的 NAI 上传处理函数
            await handleSilentUploadNaiImage(timestamp, naiUploadBtn);
          }
        }
        return;
      }
      const regenBtn = e.target.closest('.nai-regenerate-btn');
      if (regenBtn) {
        e.stopPropagation();
        const bubble = e.target.closest('.message-bubble');
        if (bubble) {
          const timestamp = parseInt(bubble.dataset.timestamp);
          if (!isNaN(timestamp)) {
            await handleRegenerateNaiImage(timestamp, regenBtn);
          }
        }
        return;
      }
      const userUploadBtn = e.target.closest('.user-upload-imgbb-btn');
      if (userUploadBtn) {
        e.stopPropagation();
        const bubble = e.target.closest('.message-bubble');
        if (bubble) {
          const timestamp = parseInt(bubble.dataset.timestamp);
          if (!isNaN(timestamp)) {
            await handleSilentUploadUserImage(timestamp, userUploadBtn);
          }
        }
        return;
      }
      const voiceBody = e.target.closest('.voice-message-body[data-text]');
      if (voiceBody) {

        const chat = state.chats[state.activeChatId];
        if (!chat) return;

        // 先显示/隐藏文字（所有语音消息都支持）
        toggleVoiceTranscript(voiceBody);

        // 检查是否有真实音频数据
        if (voiceBody.dataset.audio) {
          // 播放真实录音
          playRealAudio(voiceBody);
          return;
        }

        // 否则使用原有的TTS逻辑


        const bubble = voiceBody.closest('.message-bubble');
        const transcriptEl = bubble ? bubble.querySelector('.voice-transcript') : null;


        if (voiceBody.dataset.voiceId && transcriptEl && transcriptEl.style.display === 'block') {


          if (chat.isGroup) {
            console.log("这是一条群聊语音消息，已禁止发起TTS请求。");
            return;
          }
          if (chat.settings.enableTts === false) {
            console.log(`“${chat.name}”的TTS功能已关闭，已禁止发起TTS请求。`);
            return;
          }


          playTtsAudio(voiceBody);
        }

        return;
      }

      const detailsBtn = e.target.closest('.waimai-details-btn');
      if (detailsBtn) {
        const bubble = detailsBtn.closest('.message-bubble');
        if (bubble) {
          const timestamp = parseInt(bubble.dataset.timestamp);
          if (!isNaN(timestamp)) {
            showWaimaiDetails(timestamp);
            return;
          }
        }
      }



      const choiceBtn = e.target.closest('.waimai-user-actions button');
      if (choiceBtn) {
        const bubble = choiceBtn.closest('.message-bubble');
        if (bubble) {
          const timestamp = parseInt(bubble.dataset.timestamp);
          const choice = choiceBtn.dataset.choice;
          if (!isNaN(timestamp) && choice) {
            await handleWaimaiResponse(timestamp, choice);
            return;
          }
        }
      }


      const deletedPostPlaceholder = e.target.closest('.post-deleted-placeholder');
      if (deletedPostPlaceholder) {
        const postId = parseInt(deletedPostPlaceholder.dataset.postId);
        if (!isNaN(postId)) {
          const post = await db.qzonePosts.get(postId);
          if (post) {
            let originalContent = '';
            const authorName = post.authorId === 'user' ? state.qzoneSettings.nickname : (state.chats[post.authorId]?.name || '未知作者');

            if (post.type === 'shuoshuo') {
              originalContent = post.content;
            } else {
              originalContent = post.publicText || '';
              if (post.imageUrl) originalContent += `\n[图片]`;
              if (post.hiddenContent) originalContent += `\n[文字图内容: ${post.hiddenContent}]`;
            }

            showCustomAlert(
              `来自 ${authorName} 的已删除动态`,
              originalContent.replace(/\n/g, '<br>')
            );
          } else {
            showCustomAlert('提示', '这条动态的原始数据已被彻底清除。');
          }
        }
        return;
      }

      const aiImage = e.target.closest('.ai-generated-image');
      if (aiImage) {
        const description = aiImage.dataset.description;
        if (description) showCustomAlert('照片描述', description);
        return;
      }

      const quoteBlock = e.target.closest('.quoted-message');
      if (quoteBlock && quoteBlock.dataset.originalTimestamp) {
        const originalTimestamp = parseInt(quoteBlock.dataset.originalTimestamp);
        if (!isNaN(originalTimestamp)) {
          scrollToOriginalMessage(originalTimestamp);
        }
      }

      const giftCard = e.target.closest('.gift-card');
      if (giftCard) {
        const bubble = giftCard.closest('.message-bubble');
        if (bubble) {
          showGiftReceipt(parseInt(bubble.dataset.timestamp));
        }
      }

      const packetCard = e.target.closest('.red-packet-card');
      if (packetCard) {
        const messageBubble = packetCard.closest('.message-bubble');
        if (messageBubble && messageBubble.dataset.timestamp) {
          const timestamp = parseInt(messageBubble.dataset.timestamp);
          handlePacketClick(timestamp);
        }
      }

      const pollCard = e.target.closest('.poll-card');
      if (pollCard) {
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

            if (recalled.originalType === 'text') {
              originalContentText = `原文: "${recalled.originalContent}"`;
            } else {
              originalContentText = `撤回了一条[${recalled.originalType}]类型的消息`;
            }
            showCustomAlert('已撤回的消息', originalContentText);
          }
        }
      }

      const linkCard = e.target.closest('.link-share-card');
      if (linkCard && linkCard.closest('.message-bubble.is-link-share')) {
        const timestamp = parseInt(linkCard.dataset.timestamp);
        openSharedHistoryViewer(timestamp);
      }

      bubble = e.target.closest('.message-bubble');
      if (bubble && bubble.classList.contains('ai') && bubble.classList.contains('is-transfer') && bubble.dataset.status === 'pending') {
        const timestamp = parseInt(bubble.dataset.timestamp);
        if (!isNaN(timestamp)) {
          showTransferActionModal(timestamp);
        }
      }
    });


    const chatSettingsModal = document.getElementById('chat-settings-modal');
    const worldBookSelectBox = document.querySelector('.custom-multiselect .select-box');
    const worldBookCheckboxesContainer = document.getElementById('world-book-checkboxes-container');

    function updateWorldBookSelectionDisplay() {
      const checkedBoxes = worldBookCheckboxesContainer.querySelectorAll('input:checked');
      const displayText = document.querySelector('.selected-options-text');

      if (checkedBoxes.length === 0) {
        displayText.textContent = '-- 点击选择 --';
      } else if (checkedBoxes.length > 2) {
        displayText.textContent = `已选择 ${checkedBoxes.length} 本世界书`;
      } else {
        const displayItems = Array.from(checkedBoxes).map(cb => {
          return cb.parentElement.textContent.trim();
        });
        displayText.textContent = displayItems.join(', ');
      }
    }


    worldBookSelectBox.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.globalSettings.dropdownPopupMode) {
        showMultiselectPopup('关联世界书', worldBookCheckboxesContainer, updateWorldBookSelectionDisplay);
      } else {
        worldBookCheckboxesContainer.classList.toggle('visible');
        worldBookSelectBox.classList.toggle('expanded');
      }
    });
    document.getElementById('world-book-checkboxes-container').addEventListener('change', updateWorldBookSelectionDisplay);
    window.addEventListener('click', (e) => {
      if (!document.querySelector('.custom-multiselect').contains(e.target)) {
        worldBookCheckboxesContainer.classList.remove('visible');
        worldBookSelectBox.classList.remove('expanded');
      }
    });

    document.getElementById('chat-settings-btn').addEventListener('click', async () => {
      loadThemePresetsDropdown();
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];
      const isGroup = chat.isGroup;

      const weatherSection = document.getElementById('weather-settings-section');
      if (isGroup) {
        weatherSection.style.display = 'none';
      } else {
        weatherSection.style.display = 'block';

        // 读取配置
        const wSettings = chat.settings.weather || {};

        const weatherSwitch = document.getElementById('enable-weather-switch');
        const weatherConfigContainer = document.getElementById('weather-config-container');

        weatherSwitch.checked = wSettings.enabled || false;
        weatherConfigContainer.style.display = wSettings.enabled ? 'block' : 'none';

        // 绑定开关显示隐藏
        weatherSwitch.onclick = (e) => {
          weatherConfigContainer.style.display = e.target.checked ? 'block' : 'none';
        };

        // 回显 User 数据
        document.getElementById('user-virtual-city').value = wSettings.userVirtualCity || '';
        document.getElementById('user-city-lat').value = wSettings.userLat || '';
        document.getElementById('user-city-lon').value = wSettings.userLon || '';
        if (wSettings.userRealCity) {
          document.getElementById('user-city-result').textContent = `已映射: ${wSettings.userRealCity} (${wSettings.userLat}, ${wSettings.userLon})`;
          document.getElementById('user-city-result').style.color = 'green';
        } else {
          document.getElementById('user-city-result').textContent = '未设置映射';
          document.getElementById('user-city-result').style.color = '#007bff';
        }

        // 回显 Char 数据
        document.getElementById('char-virtual-city').value = wSettings.charVirtualCity || '';
        document.getElementById('char-city-lat').value = wSettings.charLat || '';
        document.getElementById('char-city-lon').value = wSettings.charLon || '';
        if (wSettings.charRealCity) {
          document.getElementById('char-city-result').textContent = `已映射: ${wSettings.charRealCity} (${wSettings.charLat}, ${wSettings.charLon})`;
          document.getElementById('char-city-result').style.color = 'green';
        } else {
          document.getElementById('char-city-result').textContent = '未设置映射';
          document.getElementById('char-city-result').style.color = '#007bff';
        }
      }
      const switchGreetingGroup = document.getElementById('switch-greeting-group');
      if (!isGroup && chat.settings.alternateGreetings && chat.settings.alternateGreetings.length > 0) {
        switchGreetingGroup.style.display = 'block';
      } else {
        switchGreetingGroup.style.display = 'none';
      }

      document.getElementById('chat-name-group').style.display = 'block';
      document.getElementById('my-persona-group').style.display = 'block';
      document.getElementById('my-avatar-group').style.display = 'block';
      document.getElementById('my-group-nickname-group').style.display = isGroup ? 'block' : 'none';
      document.getElementById('my-nickname-group').style.display = isGroup ? 'none' : 'block';
      document.getElementById('group-avatar-group').style.display = isGroup ? 'block' : 'none';
      document.getElementById('group-members-group').style.display = isGroup ? 'block' : 'none';
      const spectatorMemoryGroup = document.getElementById('spectator-memory-settings-group');
      if (isGroup && chat.isSpectatorGroup) {
        spectatorMemoryGroup.style.display = 'block';
        const spectatorMemoryBtn = document.getElementById('spectator-memory-settings-btn');
        spectatorMemoryBtn.onclick = async () => {
          const selected = await showSpectatorMemorySelectionModal(chat.members, chat.settings.spectatorIncludeUserMemoryForMemberIds);
          if (selected !== null) {
            chat.settings.spectatorIncludeUserMemoryForMemberIds = selected;
            await showCustomAlert('已保存', '旁观记忆设置将在下次「推进剧情」时生效。');
          }
        };
      } else {
        spectatorMemoryGroup.style.display = 'none';
      }
      document.getElementById('ai-persona-group').style.display = isGroup ? 'none' : 'block';
      document.getElementById('ai-avatar-group').style.display = isGroup ? 'none' : 'block';
      document.getElementById('assign-group-section').style.display = isGroup ? 'none' : 'block';
      document.getElementById('ai-original-name-group').style.display = isGroup ? 'none' : 'block';
      document.getElementById('ai-voice-id-group').style.display = isGroup ? 'none' : 'block';
      document.getElementById('inject-thought-group').style.display = isGroup ? 'none' : 'block';
      document.getElementById('todo-list-setting-group').style.display = isGroup ? 'none' : 'flex';
      document.getElementById('offline-mode-group').style.display = isGroup ? 'none' : 'block';
      document.getElementById('ai-cooldown-group').style.display = isGroup ? 'none' : 'block';
      document.getElementById('group-cooldown-group').style.display = isGroup ? 'block' : 'none';
      // 记忆存档功能现在支持群聊
      document.getElementById('memory-archive-section').style.display = 'block';
      document.getElementById('export-character-full-btn').style.display = isGroup ? 'none' : 'block';
      document.getElementById('chat-name-input').value = chat.name;

      // 加载角色国籍
      const countrySelect = document.getElementById('character-country-select');
      if (!isGroup) {
        document.getElementById('character-country-group').style.display = 'block';
        countrySelect.value = chat.country || 'China';
      } else {
        document.getElementById('character-country-group').style.display = 'none';
      }

      document.getElementById('my-persona').value = chat.settings.myPersona;
      document.getElementById('my-avatar-preview').src = chat.settings.myAvatar || (isGroup ? defaultMyGroupAvatar : defaultAvatar);
      document.getElementById('max-memory').value = chat.settings.maxMemory;
      document.getElementById('linked-memory-count').value = chat.settings.linkedMemoryCount || 10;
      const bgPreview = document.getElementById('bg-preview');
      const removeBgBtn = document.getElementById('remove-bg-btn');
      if (chat.settings.background) {
        bgPreview.src = chat.settings.background;
        bgPreview.style.display = 'block';
        removeBgBtn.style.display = 'inline-block';
      } else {
        bgPreview.style.display = 'none';
        removeBgBtn.style.display = 'none';
      }
      document.getElementById('lyrics-position-group').style.display = 'block';

      document.getElementById('single-char-background-activity-group').style.display = isGroup ? 'none' : 'block';
      document.getElementById('group-background-activity-group').style.display = isGroup ? 'block' : 'none';




      const timePerceptionToggle = document.getElementById('time-perception-toggle');
      const timeZoneGroup = document.getElementById('time-zone-group');
      timePerceptionToggle.checked = chat.settings.enableTimePerception;
      timeZoneGroup.style.display = timePerceptionToggle.checked ? 'block' : 'none';


      const timezoneSelect = document.getElementById('time-zone-select');

      const timezones = Intl.supportedValuesOf('timeZone');
      timezoneSelect.innerHTML = '';
      timezones.forEach(tz => {
        const option = document.createElement('option');
        option.value = tz;
        option.textContent = tz;
        timezoneSelect.appendChild(option);
      });

      timezoneSelect.value = chat.settings.timeZone || 'Asia/Shanghai';
      document.getElementById('enable-synth-music-switch').checked = chat.settings.enableSynthMusic || false;
      document.getElementById('narrator-mode-toggle').checked = chat.settings.enableNarratorMode || false;
      
      // 加载双语模式设置
      document.getElementById('bilingual-mode-toggle').checked = chat.settings.enableBilingualMode || false;
      document.getElementById('bilingual-display-mode-select').value = chat.settings.bilingualDisplayMode || 'outside';
      document.getElementById('bilingual-display-mode-group').style.display = 
        (chat.settings.enableBilingualMode) ? 'flex' : 'none';
      
      if (isGroup) {

        document.getElementById('group-background-activity-switch').checked = chat.settings.enableBackgroundActivity;
        document.getElementById('my-group-nickname-input').value = chat.settings.myNickname || '';
        document.getElementById('group-avatar-preview').src = chat.settings.groupAvatar || defaultGroupAvatar;
        document.getElementById('group-action-cooldown-input').value = chat.settings.actionCooldownMinutes || 10;


        document.getElementById('single-char-background-activity-group').style.display = 'none';
        renderGroupMemberSettings(chat.members);

        // 群聊也需要加载表情包识图与智能匹配设置
        document.getElementById('enable-sticker-vision-checkbox').checked = chat.settings.enableStickerVision || false;
        document.getElementById('enable-sticker-smart-match-checkbox').checked = chat.settings.enableStickerSmartMatch || false;
      } else {

        document.getElementById('single-char-background-activity-group').style.display = 'block';
        document.getElementById('enable-todo-list-switch').checked = chat.settings.enableTodoList || false;
        // --- 修复天气设置回显逻辑 ---
        const weatherSection = document.getElementById('weather-settings-section');
        weatherSection.style.display = 'block';

        // 读取当前角色的配置
        const wSettings = chat.settings.weather || {};

        const weatherSwitch = document.getElementById('enable-weather-switch');
        const weatherConfigContainer = document.getElementById('weather-config-container');

        weatherSwitch.checked = wSettings.enabled || false;
        weatherConfigContainer.style.display = wSettings.enabled ? 'block' : 'none';

        // 绑定开关显示隐藏 (防止事件重复绑定，先移除再添加，或者依赖 HTML onclick 逻辑)
        weatherSwitch.onclick = (e) => {
          weatherConfigContainer.style.display = e.target.checked ? 'block' : 'none';
        };

        // 1. 回显 User 数据
        document.getElementById('user-virtual-city').value = wSettings.userVirtualCity || '';

        // 【关键修复】: 显式设置搜索框的值为已保存的城市名，如果没有则清空
        const userRealCityInput = document.getElementById('user-real-city-search');
        userRealCityInput.value = wSettings.userRealCity || '';
        userRealCityInput.dataset.realName = wSettings.userRealCity || ''; // 同步 dataset

        document.getElementById('user-city-lat').value = wSettings.userLat || '';
        document.getElementById('user-city-lon').value = wSettings.userLon || '';

        if (wSettings.userRealCity) {
          document.getElementById('user-city-result').textContent = `已映射: ${wSettings.userRealCity} (${wSettings.userLat}, ${wSettings.userLon})`;
          document.getElementById('user-city-result').style.color = 'green';
        } else {
          document.getElementById('user-city-result').textContent = '未设置映射';
          document.getElementById('user-city-result').style.color = '#007bff';
        }

        // 2. 回显 Char 数据
        document.getElementById('char-virtual-city').value = wSettings.charVirtualCity || '';

        // 【关键修复】: 显式设置搜索框的值为已保存的城市名，如果没有则清空
        const charRealCityInput = document.getElementById('char-real-city-search');
        charRealCityInput.value = wSettings.charRealCity || '';
        charRealCityInput.dataset.realName = wSettings.charRealCity || ''; // 同步 dataset

        document.getElementById('char-city-lat').value = wSettings.charLat || '';
        document.getElementById('char-city-lon').value = wSettings.charLon || '';

        if (wSettings.charRealCity) {
          document.getElementById('char-city-result').textContent = `已映射: ${wSettings.charRealCity} (${wSettings.charLat}, ${wSettings.charLon})`;
          document.getElementById('char-city-result').style.color = 'green';
        } else {
          document.getElementById('char-city-result').textContent = '未设置映射';
          document.getElementById('char-city-result').style.color = '#007bff';
        }
        document.getElementById('char-background-activity-switch').checked = chat.settings.enableBackgroundActivity;
        document.getElementById('inject-thought-toggle').checked = chat.settings.injectLatestThought;
        document.getElementById('char-auto-cart-clear-switch').checked = chat.settings.enableAutoCartClear || false;
        
        // 新增：加载后台查看用户手机设置
        const charViewMyPhoneBgSelect = document.getElementById('char-view-myphone-bg-select');
        if (chat.settings.enableViewMyPhoneInBackground === null || chat.settings.enableViewMyPhoneInBackground === undefined) {
          charViewMyPhoneBgSelect.value = 'null';
        } else {
          charViewMyPhoneBgSelect.value = String(chat.settings.enableViewMyPhoneInBackground);
        }
        document.getElementById('char-view-myphone-chance-input').value = chat.settings.viewMyPhoneChance !== null && chat.settings.viewMyPhoneChance !== undefined ? chat.settings.viewMyPhoneChance : '';

        // 新增：读取AI行为控制设置
        const thoughtsSelect = document.getElementById('chat-enable-thoughts-select');
        if (chat.settings.enableThoughts === null || chat.settings.enableThoughts === undefined) {
          thoughtsSelect.value = 'null';
        } else {
          thoughtsSelect.value = String(chat.settings.enableThoughts);
        }

        const qzoneSelect = document.getElementById('chat-enable-qzone-actions-select');
        if (chat.settings.enableQzoneActions === null || chat.settings.enableQzoneActions === undefined) {
          qzoneSelect.value = 'null';
        } else {
          qzoneSelect.value = String(chat.settings.enableQzoneActions);
        }

        const viewMyPhoneSelect = document.getElementById('chat-enable-view-myphone-select');
        if (chat.settings.enableViewMyPhone === null || chat.settings.enableViewMyPhone === undefined) {
          viewMyPhoneSelect.value = 'null';
        } else {
          viewMyPhoneSelect.value = String(chat.settings.enableViewMyPhone);
        }

        const crossChatSelect = document.getElementById('chat-enable-cross-chat-select');
        if (chat.settings.enableCrossChat === null || chat.settings.enableCrossChat === undefined) {
          crossChatSelect.value = 'null';
        } else {
          crossChatSelect.value = String(chat.settings.enableCrossChat);
        }

        // 更新全局设置状态显示
        document.getElementById('global-thoughts-status').textContent = state.globalSettings.enableThoughts ? '开启' : '关闭';
        document.getElementById('global-qzone-status').textContent = state.globalSettings.enableQzoneActions ? '开启' : '关闭';
        document.getElementById('global-view-myphone-status').textContent = state.globalSettings.enableViewMyPhone ? '开启' : '关闭';
        document.getElementById('global-cross-chat-status').textContent = state.globalSettings.enableCrossChat !== false ? '开启' : '关闭';

        const offlineModeToggle = document.getElementById('offline-mode-toggle');
        const offlineModeOptions = document.getElementById('offline-mode-options');
        const offlineMinInput = document.getElementById('offline-min-length-input');
        const offlineMaxInput = document.getElementById('offline-max-length-input');
        offlineModeToggle.checked = chat.settings.isOfflineMode || false;
        offlineModeOptions.style.display = offlineModeToggle.checked ? 'block' : 'none';
        offlineMinInput.value = chat.settings.offlineMinLength || 100;
        offlineMaxInput.value = chat.settings.offlineMaxLength || 300;
        const offlineContinuousToggle = document.getElementById('offline-continuous-layout-toggle');
        if (offlineContinuousToggle) offlineContinuousToggle.checked = chat.settings.offlineContinuousLayout || false;
        await renderOfflinePresetSelector(chat);

        // 加载表情包识图设置
        document.getElementById('enable-sticker-vision-checkbox').checked = chat.settings.enableStickerVision || false;

        // 加载表情包智能匹配设置
        document.getElementById('enable-sticker-smart-match-checkbox').checked = chat.settings.enableStickerSmartMatch || false;

        document.getElementById('ai-original-name-input').value = chat.originalName;
        document.getElementById('ai-voice-id-input').value = chat.settings.minimaxVoiceId || '';

        document.getElementById('ai-voice-lang-group').style.display = isGroup ? 'none' : 'block';
        document.getElementById('ai-voice-lang-select').value = chat.settings.ttsLanguage || '';
        document.getElementById('chat-show-seconds-switch').checked = chat.settings.showSeconds !== undefined ? chat.settings.showSeconds : (state.globalSettings.showSeconds || false);
        document.getElementById('enable-tts-switch').checked = chat.settings.enableTts !== false;
        document.getElementById('ai-persona').value = chat.settings.aiPersona;
        document.getElementById('ai-avatar-preview').src = chat.settings.aiAvatar || defaultAvatar;
        document.getElementById('my-nickname-input').value = chat.settings.myNickname || '我';
        document.getElementById('ai-action-cooldown-input').value = chat.settings.actionCooldownMinutes || 10;
        const select = document.getElementById('assign-group-select');
        select.innerHTML = '<option value="">未分组</option>';
        const groups = await db.qzoneGroups.toArray();
        groups.forEach(group => {
          const option = document.createElement('option');
          option.value = group.id;
          option.textContent = group.name;
          if (chat.groupId === group.id) option.selected = true;
          select.appendChild(option);
        });
        const lyricsPos = chat.settings.lyricsPosition || {
          vertical: 'top',
          horizontal: 'center',
          offset: 10
        };
        document.getElementById('lyrics-vertical-pos').value = lyricsPos.vertical;
        document.getElementById('lyrics-horizontal-pos').value = lyricsPos.horizontal;
        document.getElementById('lyrics-offset-input').value = lyricsPos.offset;
      }



      const worldBookCheckboxesContainer = document.getElementById('world-book-checkboxes-container');
      worldBookCheckboxesContainer.innerHTML = '';

      const [allCategories, allBooks] = await Promise.all([
        db.worldBookCategories.toArray(),
        db.worldBooks.toArray()
      ]);

      const linkedBookIds = new Set(chat.settings.linkedWorldBookIds || []);

      if (allBooks.length === 0) {
        worldBookCheckboxesContainer.innerHTML = '<p style="text-align:center; color: #8a8a8a;">还没有创建任何世界书</p>';
      } else {

        allCategories.forEach(cat => {
          const booksInCategory = allBooks.filter(book => book.categoryId === cat.id);
          if (booksInCategory.length > 0) {
            const categoryHeader = document.createElement('h4');
            categoryHeader.textContent = cat.name;
            categoryHeader.style.cssText = 'margin: 10px 0 5px; color: #555; border-bottom: 1px solid #eee; padding-bottom: 3px;';
            worldBookCheckboxesContainer.appendChild(categoryHeader);

            booksInCategory.forEach(book => {
              // 全局世界书自动勾选
              const isChecked = linkedBookIds.has(book.id) || book.isGlobal === true;
              const label = document.createElement('label');
              const globalTag = book.isGlobal ? ' <span style="color: #ff5722; font-size: 12px;">[全局]</span>' : '';
              label.innerHTML = `<input type="checkbox" value="book_${book.id}" ${isChecked ? 'checked' : ''}> ${book.name}${globalTag}`;
              worldBookCheckboxesContainer.appendChild(label);
            });
          }
        });


        const uncategorizedBooks = allBooks.filter(book => !book.categoryId);
        if (uncategorizedBooks.length > 0) {
          const bookHeader = document.createElement('h4');
          bookHeader.textContent = '未分类';
          bookHeader.style.cssText = 'margin: 15px 0 5px; color: #555; border-bottom: 1px solid #eee; padding-bottom: 3px;';
          worldBookCheckboxesContainer.appendChild(bookHeader);

          uncategorizedBooks.forEach(book => {
            // 全局世界书自动勾选
            const isChecked = linkedBookIds.has(book.id) || book.isGlobal === true;
            const label = document.createElement('label');
            const globalTag = book.isGlobal ? ' <span style="color: #ff5722; font-size: 12px;">[全局]</span>' : '';
            label.innerHTML = `<input type="checkbox" value="book_${book.id}" ${isChecked ? 'checked' : ''}> ${book.name}${globalTag}`;
            worldBookCheckboxesContainer.appendChild(label);
          });
        }
      }


      updateWorldBookSelectionDisplay();

      const linkMemoryToggle = document.getElementById('link-memory-toggle');
      const linkedMemorySelection = document.getElementById('linked-memory-selection');
      const linkedChatsContainer = document.getElementById('linked-chats-checkboxes-container');
      const linkedMemoryIds = chat.settings.linkedMemoryChatIds || [];
      linkMemoryToggle.checked = linkedMemoryIds.length > 0;
      linkedMemorySelection.style.display = linkMemoryToggle.checked ? 'block' : 'none';
      linkedChatsContainer.innerHTML = '';
      Object.values(state.chats).forEach(c => {
        if (c.id === chat.id) return;
        const isChecked = linkedMemoryIds.includes(c.id);
        const prefix = c.isGroup ? '[群聊]' : '[私聊]';
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" value="${c.id}" ${isChecked ? 'checked' : ''}> ${prefix} ${c.name}`;
        linkedChatsContainer.appendChild(label);
      });

      function updateLinkedMemorySelectionDisplay() {
        const checkedBoxes = linkedChatsContainer.querySelectorAll('input:checked');
        const displayText = linkedMemorySelection.querySelector('.selected-options-text');
        if (checkedBoxes.length === 0) {
          displayText.textContent = '-- 点击选择 --';
        } else if (checkedBoxes.length > 2) {
          displayText.textContent = `已选择 ${checkedBoxes.length} 项`;
        } else {
          displayText.textContent = Array.from(checkedBoxes).map(cb => cb.parentElement.textContent.trim()).join(', ');
        }
      }
      updateLinkedMemorySelectionDisplay();
      linkMemoryToggle.addEventListener('change', () => {
        linkedMemorySelection.style.display = linkMemoryToggle.checked ? 'block' : 'none';
      });
      const linkedMemorySelectBox = linkedMemorySelection.querySelector('.select-box');
      const newLinkedMemorySelectBox = linkedMemorySelectBox.cloneNode(true);
      linkedMemorySelectBox.parentNode.replaceChild(newLinkedMemorySelectBox, linkedMemorySelectBox);
      newLinkedMemorySelectBox.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.globalSettings.dropdownPopupMode) {
          showMultiselectPopup('挂载聊天记忆', linkedChatsContainer, updateLinkedMemorySelectionDisplay);
        } else {
          linkedChatsContainer.classList.toggle('visible');
          newLinkedMemorySelectBox.classList.toggle('expanded');
        }
      });
      linkedChatsContainer.addEventListener('change', updateLinkedMemorySelectionDisplay);
      const themeRadio = document.querySelector(`input[name="theme-select"][value="${chat.settings.theme || 'default'}"]`);
      if (themeRadio) themeRadio.checked = true;
      const chatFontSizeSlider = document.getElementById('chat-font-size-slider');
      chatFontSizeSlider.value = chat.settings.fontSize || 13;
      document.getElementById('chat-font-size-value').textContent = `${chatFontSizeSlider.value}px`;
      const customCssInput = document.getElementById('custom-css-input');
      customCssInput.value = chat.settings.customCss || '';
      updateSettingsPreview();
      document.getElementById('auto-memory-toggle').checked = chat.settings.enableAutoMemory || false;
      document.getElementById('auto-memory-interval').value = chat.settings.autoMemoryInterval || 20;
      document.getElementById('diary-mode-toggle').checked = chat.settings.enableDiaryMode || false;
      document.getElementById('structured-memory-toggle').checked = chat.settings.enableStructuredMemory || false;
      
      // 加载记忆模式选择器
      const memoryMode = chat.settings.memoryMode || (chat.settings.enableStructuredMemory ? 'structured' : 'diary');
      document.querySelectorAll('#memory-mode-selector .memory-mode-option').forEach(o => {
        o.classList.toggle('active', o.dataset.mode === memoryMode);
      });
      // 显示/隐藏日记模式子选项
      const diaryOptions = document.getElementById('diary-mode-options');
      if (diaryOptions) diaryOptions.style.display = (memoryMode === 'diary') ? 'flex' : 'none';
      
      // 加载限制长期记忆设置
      document.getElementById('limit-memory-toggle').checked = chat.settings.limitLongTermMemory || false;
      document.getElementById('memory-limit-count').value = chat.settings.longTermMemoryLimit || 50;
      document.getElementById('memory-limit-input-group').style.display = 
        (chat.settings.limitLongTermMemory) ? 'block' : 'none';
      
      document.getElementById('show-hidden-msg-toggle').checked = chat.settings.showHiddenMessages || false;

      // 加载并显示/隐藏角色知晓窥屏开关（仅单聊）
      const phoneViewingAwarenessGroup = document.getElementById('phone-viewing-awareness-group');
      if (!isGroup) {
        phoneViewingAwarenessGroup.style.display = 'flex';
        document.getElementById('phone-viewing-awareness-toggle').checked = chat.settings.phoneViewingAwareness || false;
      } else {
        phoneViewingAwarenessGroup.style.display = 'none';
      }

      // 加载一起听时长感知开关（仅单聊）
      const musicTimeAwarenessGroup = document.getElementById('music-time-awareness-group');
      if (!isGroup) {
        musicTimeAwarenessGroup.style.display = 'flex';
        document.getElementById('music-time-awareness-toggle').checked = chat.settings.enableMusicTimeAwareness || false;
      } else {
        musicTimeAwarenessGroup.style.display = 'none';
      }

      // 加载情侣空间感知开关（仅单聊）
      const coupleSpacePromptGroup = document.getElementById('couple-space-prompt-group');
      const coupleSpaceContentGroup = document.getElementById('couple-space-content-group');
      if (!isGroup) {
        coupleSpacePromptGroup.style.display = 'flex';
        coupleSpaceContentGroup.style.display = 'flex';
        document.getElementById('couple-space-prompt-toggle').checked = chat.settings.enableCoupleSpacePrompt || false;
        document.getElementById('couple-space-content-toggle').checked = chat.settings.enableCoupleSpaceContent || false;
      } else {
        coupleSpacePromptGroup.style.display = 'none';
        coupleSpaceContentGroup.style.display = 'none';
      }

      setTimeout(() => {
        updateTokenCountDisplay();

        const inputsToWatch = [
          'ai-persona', 'my-persona', 'max-memory',
          'linked-memory-count', 'auto-memory-toggle', 'auto-memory-interval',
          'diary-mode-toggle', 'structured-memory-toggle',
          'offline-mode-toggle', 'offline-min-length-input',
          'offline-max-length-input', 'offline-preset-select'
        ];

        inputsToWatch.forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.addEventListener('input', updateTokenCountDisplay);
          }
        });

        // 为多选框容器添加事件监听
        document.getElementById('world-book-checkboxes-container').addEventListener('change', updateTokenCountDisplay);
        document.getElementById('linked-chats-checkboxes-container').addEventListener('change', updateTokenCountDisplay);
        document.getElementById('link-memory-toggle').addEventListener('change', updateTokenCountDisplay);
      }, 100);

      // 渲染记忆库列表
      renderMemoryArchiveList();

      // 加载视频通话优化设置
      if (typeof window.loadVideoOptimizationSettings === 'function') {
        window.loadVideoOptimizationSettings(chat);
      }

      if (state.globalSettings.cleanChatDetail && typeof window.openCleanChatDetail === 'function') {
        // 整洁模式：先让原有回显完成，再构建Tab界面
        showScreen('chat-settings-screen');
        setTimeout(() => window.openCleanChatDetail(), 50);
      } else {
        showScreen('chat-settings-screen');
      }
    });



    function renderGroupMemberSettings(members) {
      const container = document.getElementById('group-members-settings');
      container.innerHTML = '';
      members.forEach(member => {
        const div = document.createElement('div');
        div.className = 'member-editor';
        div.dataset.memberId = member.id;




        const memberAvatar = member.avatar || (state.chats[member.id] ? state.chats[member.id].settings.aiAvatar : defaultGroupMemberAvatar);

        div.innerHTML = `<img src="${memberAvatar}" alt="${member.groupNickname}"><div class="member-name">${member.groupNickname}</div>`;
        div.addEventListener('click', () => openMemberEditor(member.id));
        container.appendChild(div);
      });
    }



    document.getElementById('save-member-settings-btn').addEventListener('click', async () => {
      if (!editingMemberId) return;
      const chat = state.chats[state.activeChatId];
      const member = chat.members.find(m => m.id === editingMemberId);
      if (!member) return;

      const newNickname = document.getElementById('member-name-input').value.trim();
      if (!newNickname) {
        alert("群昵称不能为空！");
        return;
      }
      member.groupNickname = newNickname;
      member.persona = document.getElementById('member-persona-input').value;

      const newAvatarUrl = document.getElementById('member-avatar-preview').src;



      member.avatar = newAvatarUrl;


      const characterProfile = state.chats[member.id];
      if (characterProfile) {
        characterProfile.settings.aiAvatar = newAvatarUrl;
        await db.chats.put(characterProfile);
      }


      await db.chats.put(chat);


      renderGroupMemberSettings(chat.members);
      document.getElementById('member-settings-modal').classList.remove('visible');
      editingMemberId = null;
    });



    function openMemberEditor(memberId) {
      editingMemberId = memberId;
      const chat = state.chats[state.activeChatId];
      const member = chat.members.find(m => m.id === memberId);
      if (!member) return;

      document.getElementById('member-name-input').value = member.groupNickname;
      document.getElementById('member-persona-input').value = member.persona;



      const memberAvatar = member.avatar || (state.chats[member.id] ? state.chats[member.id].settings.aiAvatar : defaultGroupMemberAvatar);
      document.getElementById('member-avatar-preview').src = memberAvatar;

      document.getElementById('member-settings-modal').classList.add('visible');
    }

    document.getElementById('cancel-member-settings-btn').addEventListener('click', () => {
      document.getElementById('member-settings-modal').classList.remove('visible');
      editingMemberId = null;
    });


    document.getElementById('save-member-settings-btn').addEventListener('click', async () => {
      if (!editingMemberId) return;
      const chat = state.chats[state.activeChatId];
      const member = chat.members.find(m => m.id === editingMemberId);
      if (!member) return;

      const newNickname = document.getElementById('member-name-input').value.trim();
      if (!newNickname) {
        alert("群昵称不能为空！");
        return;
      }
      member.groupNickname = newNickname;
      member.persona = document.getElementById('member-persona-input').value;

      const newAvatarUrl = document.getElementById('member-avatar-preview').src;



      member.avatar = newAvatarUrl;


      const characterProfile = state.chats[member.id];
      if (characterProfile) {
        characterProfile.settings.aiAvatar = newAvatarUrl;
        await db.chats.put(characterProfile);
      }


      await db.chats.put(chat);


      renderGroupMemberSettings(chat.members);
      document.getElementById('member-settings-modal').classList.remove('visible');
      editingMemberId = null;
    });

    document.getElementById('reset-theme-btn').addEventListener('click', () => {
      document.getElementById('theme-default').checked = true;
    });



    document.getElementById('save-chat-settings-btn').addEventListener('click', async () => {
      if (!state.activeChatId) return;
      const chat = state.chats[state.activeChatId];


      const oldOfflineModeState = chat.settings.isOfflineMode || false;


      const newName = document.getElementById('chat-name-input').value.trim();
      if (!newName) return alert('备注名/群名不能为空！');
      if (!chat.isGroup && newName !== chat.name) {
        if (!chat.nameHistory) chat.nameHistory = [];
        if (!chat.nameHistory.includes(chat.name)) chat.nameHistory.push(chat.name);
      }
      chat.name = newName;

      // 保存角色国籍
      const selectedCountry = document.getElementById('character-country-select').value;
      chat.country = selectedCountry;

      const selectedThemeRadio = document.querySelector('input[name="theme-select"]:checked');
      chat.settings.theme = selectedThemeRadio ? selectedThemeRadio.value : 'default';
      chat.settings.fontSize = parseInt(document.getElementById('chat-font-size-slider').value);
      chat.settings.customCss = document.getElementById('custom-css-input').value.trim();
      chat.settings.myPersona = document.getElementById('my-persona').value;
      chat.settings.myAvatar = document.getElementById('my-avatar-preview').src;
      chat.settings.maxMemory = parseInt(document.getElementById('max-memory').value) || 10;
      chat.settings.linkedMemoryCount = parseInt(document.getElementById('linked-memory-count').value) || 10;

      const checkedBookItems = document.querySelectorAll('#world-book-checkboxes-container input[type="checkbox"]:checked');
      const newLinkedBookIds = [];
      checkedBookItems.forEach(cb => {
        if (cb.value.startsWith('book_')) {
          newLinkedBookIds.push(cb.value.replace('book_', ''));
        }
      });
      chat.settings.linkedWorldBookIds = newLinkedBookIds;

      const linkMemoryToggleChecked = document.getElementById('link-memory-toggle').checked;
      if (linkMemoryToggleChecked) {
        const checkedChats = document.querySelectorAll('#linked-chats-checkboxes-container input:checked');
        chat.settings.linkedMemoryChatIds = Array.from(checkedChats).map(cb => cb.value);
      } else {
        chat.settings.linkedMemoryChatIds = [];
      }
      chat.settings.enableAutoMemory = document.getElementById('auto-memory-toggle').checked;
      chat.settings.autoMemoryInterval = parseInt(document.getElementById('auto-memory-interval').value) || 20;
      chat.settings.enableDiaryMode = document.getElementById('diary-mode-toggle').checked;
      chat.settings.enableStructuredMemory = document.getElementById('structured-memory-toggle').checked;
      
      // 保存记忆模式
      const activeMode = document.querySelector('#memory-mode-selector .memory-mode-option.active');
      if (activeMode) {
        chat.settings.memoryMode = activeMode.dataset.mode;
      }
      
      // 保存限制长期记忆设置
      chat.settings.limitLongTermMemory = document.getElementById('limit-memory-toggle').checked;
      chat.settings.longTermMemoryLimit = parseInt(document.getElementById('memory-limit-count').value) || 50;
      
      chat.settings.showHiddenMessages = document.getElementById('show-hidden-msg-toggle').checked;

      // 保存角色知晓窥屏设置
      if (!chat.isGroup) {
        chat.settings.phoneViewingAwareness = document.getElementById('phone-viewing-awareness-toggle').checked;
      }

      // 保存一起听时长感知设置
      if (!chat.isGroup) {
        chat.settings.enableMusicTimeAwareness = document.getElementById('music-time-awareness-toggle').checked;
      }

      // 保存情侣空间感知设置
      if (!chat.isGroup) {
        chat.settings.enableCoupleSpacePrompt = document.getElementById('couple-space-prompt-toggle').checked;
        chat.settings.enableCoupleSpaceContent = document.getElementById('couple-space-content-toggle').checked;
      }

      chat.settings.enableTimePerception = document.getElementById('time-perception-toggle').checked;
      chat.settings.timeZone = document.getElementById('time-zone-select').value;
      chat.settings.lyricsPosition = {
        vertical: document.getElementById('lyrics-vertical-pos').value,
        horizontal: document.getElementById('lyrics-horizontal-pos').value,
        offset: parseInt(document.getElementById('lyrics-offset-input').value) || 10
      };
      chat.settings.enableSynthMusic = document.getElementById('enable-synth-music-switch').checked;
      chat.settings.enableNarratorMode = document.getElementById('narrator-mode-toggle').checked;
      
      // 保存双语模式设置
      chat.settings.enableBilingualMode = document.getElementById('bilingual-mode-toggle').checked;
      chat.settings.bilingualDisplayMode = document.getElementById('bilingual-display-mode-select').value;
      
      if (chat.isGroup) {
        chat.settings.enableBackgroundActivity = document.getElementById('group-background-activity-switch').checked;
        chat.settings.myNickname = document.getElementById('my-group-nickname-input').value.trim();
        chat.settings.groupAvatar = document.getElementById('group-avatar-preview').src;
        chat.settings.actionCooldownMinutes = parseInt(document.getElementById('group-action-cooldown-input').value) || 10;
        // 群聊也保存表情包识图与智能匹配，与单聊一致
        chat.settings.enableStickerVision = document.getElementById('enable-sticker-vision-checkbox').checked;
        chat.settings.enableStickerSmartMatch = document.getElementById('enable-sticker-smart-match-checkbox').checked;
      } else {
        chat.settings.enableBackgroundActivity = document.getElementById('char-background-activity-switch').checked;
        chat.settings.enableAutoCartClear = document.getElementById('char-auto-cart-clear-switch').checked;
        
        // 新增：保存后台查看用户手机设置
        const charViewMyPhoneBgSelect = document.getElementById('char-view-myphone-bg-select');
        if (charViewMyPhoneBgSelect.value === 'null') {
          chat.settings.enableViewMyPhoneInBackground = null;
        } else {
          chat.settings.enableViewMyPhoneInBackground = charViewMyPhoneBgSelect.value === 'true';
        }
        const charViewMyPhoneChanceInput = document.getElementById('char-view-myphone-chance-input');
        chat.settings.viewMyPhoneChance = charViewMyPhoneChanceInput.value.trim() === '' ? null : parseInt(charViewMyPhoneChanceInput.value);
        
        chat.settings.enableTodoList = document.getElementById('enable-todo-list-switch').checked;
        const newOfflineModeState = document.getElementById('offline-mode-toggle').checked;
        chat.settings.isOfflineMode = newOfflineModeState;
        const weatherEnabled = document.getElementById('enable-weather-switch').checked;
        const weatherSettings = {
          enabled: weatherEnabled,
          userVirtualCity: document.getElementById('user-virtual-city').value.trim(),
          userRealCity: document.getElementById('user-real-city-search').dataset.realName || chat.settings.weather?.userRealCity || '',
          userLat: parseFloat(document.getElementById('user-city-lat').value) || null,
          userLon: parseFloat(document.getElementById('user-city-lon').value) || null,

          charVirtualCity: document.getElementById('char-virtual-city').value.trim(),
          charRealCity: document.getElementById('char-real-city-search').dataset.realName || chat.settings.weather?.charRealCity || '',
          charLat: parseFloat(document.getElementById('char-city-lat').value) || null,
          charLon: parseFloat(document.getElementById('char-city-lon').value) || null
        };

        chat.settings.weather = weatherSettings;





        if (oldOfflineModeState === true && newOfflineModeState === false) {


          const switchInstruction = {
            role: 'system',
            content: '[系统指令：模式已切换！你现在回到了线上聊天模式。你的回复【必须】严格遵守线上模式的JSON数组格式，例如 [{"type": "text", "content": "你好"}]]',
            timestamp: Date.now(),
            isHidden: true
          };


          chat.history.push(switchInstruction);
          console.log("已成功注入“切换到线上模式”的系统指令。");
        }


        chat.settings.injectLatestThought = document.getElementById('inject-thought-toggle').checked;

        // 新增：保存AI行为控制设置
        const thoughtsValue = document.getElementById('chat-enable-thoughts-select').value;
        if (thoughtsValue === 'null') {
          chat.settings.enableThoughts = null;
        } else {
          chat.settings.enableThoughts = thoughtsValue === 'true';
        }

        const qzoneValue = document.getElementById('chat-enable-qzone-actions-select').value;
        if (qzoneValue === 'null') {
          chat.settings.enableQzoneActions = null;
        } else {
          chat.settings.enableQzoneActions = qzoneValue === 'true';
        }

        const viewMyPhoneValue = document.getElementById('chat-enable-view-myphone-select').value;
        if (viewMyPhoneValue === 'null') {
          chat.settings.enableViewMyPhone = null;
        } else {
          chat.settings.enableViewMyPhone = viewMyPhoneValue === 'true';
        }

        const crossChatValue = document.getElementById('chat-enable-cross-chat-select').value;
        if (crossChatValue === 'null') {
          chat.settings.enableCrossChat = null;
        } else {
          chat.settings.enableCrossChat = crossChatValue === 'true';
        }

        chat.settings.offlineMinLength = parseInt(document.getElementById('offline-min-length-input').value) || 100;
        chat.settings.offlineMaxLength = parseInt(document.getElementById('offline-max-length-input').value) || 300;
        chat.settings.offlinePresetId = document.getElementById('offline-preset-select').value || null;
        const offlineContinuousEl = document.getElementById('offline-continuous-layout-toggle');
        if (offlineContinuousEl) chat.settings.offlineContinuousLayout = offlineContinuousEl.checked;

        // 保存表情包识图设置
        chat.settings.enableStickerVision = document.getElementById('enable-sticker-vision-checkbox').checked;

        // 保存表情包智能匹配设置
        chat.settings.enableStickerSmartMatch = document.getElementById('enable-sticker-smart-match-checkbox').checked;

        const newOriginalName = document.getElementById('ai-original-name-input').value.trim();
        if (!newOriginalName) return alert('对方本名不能为空！');
        chat.originalName = newOriginalName;
        chat.settings.aiPersona = document.getElementById('ai-persona').value;
        chat.settings.minimaxVoiceId = document.getElementById('ai-voice-id-input').value.trim();

        chat.settings.ttsLanguage = document.getElementById('ai-voice-lang-select').value;
        chat.settings.showSeconds = document.getElementById('chat-show-seconds-switch').checked;
        chat.settings.enableTts = document.getElementById('enable-tts-switch').checked;
        chat.settings.aiAvatar = document.getElementById('ai-avatar-preview').src;
        chat.settings.myNickname = document.getElementById('my-nickname-input').value.trim() || '我';
        chat.settings.actionCooldownMinutes = parseInt(document.getElementById('ai-action-cooldown-input').value) || 10;

        const selectedGroupId = document.getElementById('assign-group-select').value;
        chat.groupId = selectedGroupId ? parseInt(selectedGroupId) : null;
      }

      // 保存视频通话优化设置
      if (typeof window.saveVideoOptimizationSettings === 'function') {
        window.saveVideoOptimizationSettings(chat);
      }

      await db.chats.put(chat);
      if (!chat.isGroup) {
        await syncCharacterNameInGroups(chat);
        await syncCharacterAvatarInGroups(chat);
      }
      applyLyricsBarPosition(chat);
      applyScopedCss(chat.settings.customCss, '#chat-messages', 'custom-bubble-style');
      showScreen('chat-interface-screen');
      renderChatInterface(state.activeChatId);
      renderChatList();
    });
    // 暴露需要跨文件引用的函数到 window
    window.handleWorldBookImport = handleWorldBookImport;
    window.exportWorldBooks = exportWorldBooks;
    window.showAnnouncementActions = showAnnouncementActions;
    window.handlePinAnnouncement = handlePinAnnouncement;
    window.handleDeleteAnnouncement = handleDeleteAnnouncement;
    window.forceGlobalCleanup = forceGlobalCleanup;

};