// ============================================================
// ui-modals.js
// 来源：script.js 第 3003~4210 行（DOMContentLoaded 内部）
// 功能：自定义弹窗系统 —— showCustomModal/hideCustomModal、
//       showCustomAlert、showRecoveryAlertWithBackup、showCustomConfirm、
//       showCustomPrompt、showChoiceModal、showCategoryPickerModal、
//       showSpectatorMemorySelectionModal、showToast、showDownloadToast、
//       copyTextToClipboard
// ============================================================

(function () {
  // 闭包变量：与 script.js 中 DOMContentLoaded 内部共享的 DOM 引用
  const modalOverlay = document.getElementById('custom-modal-overlay');
  const modalTitle = document.getElementById('custom-modal-title');
  const modalBody = document.getElementById('custom-modal-body');
  const modalConfirmBtn = document.getElementById('custom-modal-confirm');
  const modalCancelBtn = document.getElementById('custom-modal-cancel');
  let modalResolve;

  function showCustomModal() {
    modalOverlay.classList.add('visible');
  }

  function hideCustomModal() {
    modalOverlay.classList.remove('visible');
    modalConfirmBtn.classList.remove('btn-danger');
    if (modalResolve) modalResolve(null);
  }

  function showCustomConfirm(title, message, options = {}) {
    return new Promise(resolve => {
      modalResolve = resolve;
      modalTitle.textContent = title;
      modalBody.innerHTML = `<p>${message}</p>`;

      // --- 【修复开始】：强制重置 Footer 结构 ---
      // 因为 showChoiceModal可能会破坏Footer结构导致ID丢失，这里必须重建
      const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');
      if (modalFooter) {
        modalFooter.style.flexDirection = 'row'; // 恢复横向布局
        modalFooter.style.justifyContent = 'flex-end'; // 按钮靠右
        modalFooter.innerHTML = `
              <button id="custom-modal-cancel">取消</button>
              <button id="custom-modal-confirm" class="confirm-btn">确定</button>
          `;
      }
      // --- 【修复结束】 ---

      const confirmBtn = document.getElementById('custom-modal-confirm');
      const cancelBtn = document.getElementById('custom-modal-cancel');

      // 此时 cancelBtn 必定存在
      cancelBtn.style.display = 'block';

      confirmBtn.textContent = options.confirmText || '确定';
      cancelBtn.textContent = options.cancelText || '取消';

      if (options.confirmButtonClass) {
        confirmBtn.className = `confirm-btn ${options.confirmButtonClass}`; // 重置class并添加自定义class
      } else {
        confirmBtn.className = 'confirm-btn'; // 恢复默认
      }

      confirmBtn.onclick = () => {
        resolve(true);
        hideCustomModal();
      };
      cancelBtn.onclick = () => {
        resolve(false);
        hideCustomModal();
      };
      showCustomModal();
    });
  }


  function showDownloadToast(message = '📥 图片下载中...', type = 'success') {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : '#f44336'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-size: 14px;
        pointer-events: none;
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s ease;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 2000);
  }

  // --- 新增：高端非侵入式通知 ---
  function showToast(message, type = 'info', duration = 3000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    // 定义图标 (SVG)
    const icons = {
      success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
      loading: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>`,
      error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
      info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
    };

    const iconSvg = icons[type] || icons.info;
    const spinClass = type === 'loading' ? 'spinning' : '';

    // 智能截断过长的消息
    const displayMsg = message.length > 25 ? message.substring(0, 24) + '...' : message;

    const toast = document.createElement('div');
    toast.className = 'toast-item';
    toast.innerHTML = `
        <div class="toast-icon ${spinClass}">${iconSvg}</div>
        <span>${displayMsg}</span>
    `;

    container.appendChild(toast);

    // 动画入场
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    // 自动消失 (如果是 loading 类型，则不自动消失，需要外部移除逻辑，或者简单点设个长时限)
    if (type !== 'loading') {
      setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 400); // 等待过渡结束
      }, duration);
    }

    return toast; // 返回元素以便手动移除
  }

  function showCustomAlert(title, message) {
    return new Promise(resolve => {
      modalResolve = resolve;
      modalTitle.textContent = title;
      modalBody.innerHTML = `<p style="text-align: left; white-space: pre-wrap;">${message}</p>`;

      // --- 【核心修复开始】 ---
      // 获取 Footer 容器
      const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');

      // 强制重置 Footer 结构，防止被 showChoiceModal 修改后导致 ID 丢失
      if (modalFooter) {
        modalFooter.style.flexDirection = 'row'; // 恢复默认横向布局
        modalFooter.innerHTML = `
              <button id="custom-modal-cancel">取消</button>
              <button id="custom-modal-confirm" class="confirm-btn">确定</button>
          `;
      }
      // --- 【核心修复结束】 ---

      const confirmBtn = document.getElementById('custom-modal-confirm');
      const cancelBtn = document.getElementById('custom-modal-cancel');

      // 此时 confirmBtn 和 cancelBtn 必定存在
      if (cancelBtn) cancelBtn.style.display = 'none';
      if (confirmBtn) confirmBtn.textContent = '好的';

      if (confirmBtn) {
        confirmBtn.onclick = () => {
          if (cancelBtn) cancelBtn.style.display = 'block'; // 恢复显示，以免影响其他功能
          confirmBtn.textContent = '确定';
          resolve(true);
          hideCustomModal();
        };
      }

      if (cancelBtn) {
        cancelBtn.onclick = hideCustomModal;
      }

      showCustomModal();
    });
  }

  // 崩溃恢复专用：带「备份本站数据」按钮的弹窗（先备份再清除缓存时可从此入口导出）
  function showRecoveryAlertWithBackup(title, message) {
    return new Promise(resolve => {
      modalResolve = resolve;
      modalTitle.textContent = title;
      const backupHint = '\n\n【若页面卡住无法操作】可先点击下方「备份本站数据」导出，再清除浏览器中本网站的数据；清除后重新打开，到 设置→导入备份文件 恢复即可。';
      modalBody.innerHTML = `<p style="text-align: left; white-space: pre-wrap;">${message}${backupHint}</p>`;

      const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');
      if (modalFooter) {
        modalFooter.style.flexDirection = 'row';
        modalFooter.innerHTML = `
          <button id="recovery-modal-backup-btn" class="confirm-btn" style="margin-right: 8px;">📤 备份本站数据</button>
          <button id="custom-modal-confirm">好的</button>
        `;
      }

      const confirmBtn = document.getElementById('custom-modal-confirm');
      const backupBtn = document.getElementById('recovery-modal-backup-btn');

      if (confirmBtn) {
        confirmBtn.onclick = () => {
          resolve(true);
          hideCustomModal();
        };
      }
      if (backupBtn) {
        backupBtn.onclick = async () => {
          backupBtn.disabled = true;
          backupBtn.textContent = '正在准备备份...';
          const fn = window.ephoneExportBackupFromPopup;
          if (typeof fn === 'function') {
            const ok = await fn();
            backupBtn.textContent = ok ? '✓ 已触发下载' : '📤 备份本站数据';
          } else {
            backupBtn.textContent = '📤 备份本站数据';
            if (typeof showCustomAlert === 'function') await showCustomAlert('无法备份', '导出功能尚未就绪，请稍候再试。');
          }
          backupBtn.disabled = false;
        };
      }

      showCustomModal();
    });
  }

  async function copyTextToClipboard(textToCopy, successMessage = '内容已复制到剪贴板！') {
    if (!textToCopy) {
      await showCustomAlert('复制失败', '没有可复制的内容。');
      return;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      await showCustomAlert('复制成功', successMessage);
    } catch (err) {
      console.error('复制失败:', err);
      await showCustomAlert('复制失败', '无法访问剪贴板。');
    }
  }

  // 查找 function showCustomPrompt 并完全替换为以下内容：

  function showCustomPrompt(title, message, initialValue = '', type = 'text', extraHtml = '') {
    return new Promise(resolve => {
      modalResolve = resolve;
      modalTitle.textContent = title;
      const inputId = 'custom-prompt-input';

      // 添加消息显示区域
      const messageHtml = message ? `<div style="margin-bottom: 15px; color: #333; line-height: 1.6;">${message}</div>` : '';

      const inputHtml = type === 'textarea' ?
        `<textarea id="${inputId}" placeholder="" rows="4" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ccc; font-size: 16px; box-sizing: border-box; resize: vertical;">${initialValue}</textarea>` :
        `<input type="${type}" id="${inputId}" placeholder="" value="${initialValue}">`;

      modalBody.innerHTML = messageHtml + extraHtml + inputHtml;
      const input = document.getElementById(inputId);

      // 绑定额外的格式化按钮事件（如果有）
      modalBody.querySelectorAll('.format-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const templateStr = btn.dataset.template;
          if (templateStr) {
            try {
              const templateObj = JSON.parse(templateStr);
              input.value = JSON.stringify(templateObj, null, 2);
              input.focus();
            } catch (e) {
              console.error("解析格式模板失败:", e);
            }
          }
        });
      });

      // --- 【核心修复开始】：强制重建 Footer 结构 ---
      // 防止因为之前调用过 showChoiceModal 导致按钮丢失
      const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');
      if (modalFooter) {
        modalFooter.style.flexDirection = 'row';
        modalFooter.style.justifyContent = 'flex-end';
        modalFooter.style.maxHeight = '';
        modalFooter.style.overflowY = '';

        // 暴力重置：把按钮塞回去
        modalFooter.innerHTML = `
            <button id="custom-modal-cancel">取消</button>
            <button id="custom-modal-confirm" class="confirm-btn">确定</button>
          `;
      }
      // --- 【核心修复结束】 ---

      const confirmBtn = document.getElementById('custom-modal-confirm');
      const cancelBtn = document.getElementById('custom-modal-cancel');

      // 确保按钮存在后再操作
      if (confirmBtn) {
        confirmBtn.textContent = '确定'; // 重置可能被修改的文字
        confirmBtn.className = 'confirm-btn'; // 重置可能被修改的样式
        confirmBtn.style.display = 'block';

        confirmBtn.onclick = () => {
          resolve(input.value);
          hideCustomModal();
        };
      }

      if (cancelBtn) {
        cancelBtn.textContent = '取消';
        cancelBtn.style.display = 'block';

        cancelBtn.onclick = () => {
          resolve(null);
          hideCustomModal();
        };
      }

      showCustomModal();

      // 加个安全判断防止 input 为空
      setTimeout(() => {
        if (input) input.focus();
      }, 100);
    });
  }

  /**
   * 旁观群聊 · 记忆设置弹窗：多选哪些角色保留与用户有关的长期/短期记忆。
   * @param {Array<{id: string, groupNickname: string, originalName: string, isNpc?: boolean}>} members - 群成员列表（仅角色，不含 NPC 也可传入，会过滤）
   * @param {string[]} [initialSelectedIds] - 初始选中的成员 id，不传则默认全选
   * @returns {Promise<string[]|null>} 选中的成员 id 数组，取消则 null
   */
  function showSpectatorMemorySelectionModal(members, initialSelectedIds) {
    const characterMembers = members.filter(m => !m.isNpc);
    if (characterMembers.length === 0) return Promise.resolve([]);

    return new Promise(resolve => {
      const modal = document.getElementById('custom-modal-overlay');
      const modalTitle = document.getElementById('custom-modal-title');
      const modalBody = document.getElementById('custom-modal-body');
      const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');

      modalTitle.textContent = '旁观群聊 · 记忆设置';
      const defaultChecked = initialSelectedIds === undefined || initialSelectedIds === null;
      const checkedSet = new Set(defaultChecked ? characterMembers.map(m => m.id) : (initialSelectedIds || []));

      modalBody.innerHTML = `
        <div style="margin-bottom: 12px; color: #555; font-size: 14px; line-height: 1.5;">
          勾选的角色会在旁观剧情中保留与您有关的长期记忆，可能会提到或 @ 您；未勾选的角色仅根据自身人设对话，不会带入与您的记忆。
        </div>
        <div id="spectator-memory-checkbox-list" style="max-height: 50vh; overflow-y: auto;"></div>
      `;
      const listEl = document.getElementById('spectator-memory-checkbox-list');
      characterMembers.forEach(m => {
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '8px';
        label.style.padding = '8px 0';
        label.style.borderBottom = '1px solid #eee';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.memberId = m.id;
        cb.checked = checkedSet.has(m.id);
        label.appendChild(cb);
        label.appendChild(document.createTextNode(`${m.groupNickname || m.originalName}（本名: ${m.originalName}）`));
        listEl.appendChild(label);
      });

      modalFooter.innerHTML = '';
      modalFooter.style.flexDirection = 'row';
      modalFooter.style.flexWrap = 'wrap';
      modalFooter.style.gap = '8px';
      modalFooter.style.justifyContent = 'flex-end';
      const btnStyle = 'padding: 8px 14px; border-radius: 8px; border: none; font-size: 14px;';
      const btnCancel = document.createElement('button');
      btnCancel.textContent = '取消';
      btnCancel.style.cssText = btnStyle + ' background: #f0f0f0; color: #333;';
      const btnNone = document.createElement('button');
      btnNone.textContent = '全不选';
      btnNone.style.cssText = btnStyle + ' background: #f5f5f5; color: #666;';
      const btnAll = document.createElement('button');
      btnAll.textContent = '全选';
      btnAll.style.cssText = btnStyle + ' background: #e8e8e8; color: #333;';
      const btnConfirm = document.createElement('button');
      btnConfirm.textContent = '确定';
      btnConfirm.className = 'confirm-btn';
      btnConfirm.style.cssText = btnStyle + ' background: #07c160; color: #fff;';

      btnNone.onclick = () => listEl.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = false; });
      btnAll.onclick = () => listEl.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; });
      btnCancel.onclick = () => {
        modal.classList.remove('visible');
        resolve(null);
      };
      btnConfirm.onclick = () => {
        const selected = [];
        listEl.querySelectorAll('input[type=checkbox]:checked').forEach(cb => selected.push(cb.dataset.memberId));
        modal.classList.remove('visible');
        resolve(selected);
      };

      modalFooter.appendChild(btnNone);
      modalFooter.appendChild(btnAll);
      modalFooter.appendChild(btnCancel);
      modalFooter.appendChild(btnConfirm);
      modal.classList.add('visible');
    });
  }

  // 增强版 showChoiceModal：优化滑动体验
  function showChoiceModal(title, options) {
    return new Promise(resolve => {
      const modal = document.getElementById('custom-modal-overlay');
      const modalTitle = document.getElementById('custom-modal-title');
      const modalBody = document.getElementById('custom-modal-body');
      const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');

      modalTitle.textContent = title;
      modalBody.innerHTML = ''; // 清空主体，选项主要在 Footer

      // 清空 Footer 并设置为列布局
      modalFooter.innerHTML = '';
      modalFooter.style.flexDirection = 'column';

      // --- 【核心优化：滑动设置】 ---
      modalFooter.style.maxHeight = '50vh'; // 限制高度，留出空间
      modalFooter.style.overflowY = 'auto'; // 允许垂直滚动
      modalFooter.style.webkitOverflowScrolling = 'touch'; // iOS 流畅滚动
      modalFooter.style.overscrollBehavior = 'contain'; // 防止滚动穿透到底层
      modalFooter.style.padding = '10px'; // 增加内边距
      modalFooter.style.gap = '8px'; // 按钮间距
      // ---------------------------

      // --- 分页逻辑开始 ---
      let renderedCount = 0;
      const PAGE_SIZE = 10; // 每次加载10个

      // 创建"加载更多"按钮
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.textContent = '加载更多...';
      loadMoreBtn.style.cssText = 'background-color: #f0f0f0; color: #666; margin-top: 8px; width: 100%; border-radius: 8px; padding: 10px; border: none;';
      loadMoreBtn.style.display = 'none'; // 初始隐藏

      // 渲染函数
      const renderBatch = () => {
        const nextBatch = options.slice(renderedCount, renderedCount + PAGE_SIZE);

        nextBatch.forEach(option => {
          const button = document.createElement('button');

          // 允许渲染 HTML 内容
          button.innerHTML = option.text;

          // 添加美化类名和样式
          button.className = 'payment-option-item';
          button.style.width = '100%';
          button.style.textAlign = 'left';
          button.style.padding = '12px 15px';
          button.style.marginBottom = '0'; // 由父容器 gap 控制

          button.onclick = () => {
            modal.classList.remove('visible');
            resolve(option.value);
          };
          // 插入到"加载更多"按钮之前
          modalFooter.insertBefore(button, loadMoreBtn);
        });

        renderedCount += nextBatch.length;

        // 如果还有剩余选项，显示加载更多按钮，否则隐藏
        if (renderedCount < options.length) {
          loadMoreBtn.style.display = 'block';
          loadMoreBtn.textContent = `加载更多 (${options.length - renderedCount} 个剩余)`;
        } else {
          loadMoreBtn.style.display = 'none';
        }
      };

      // 绑定加载更多事件
      loadMoreBtn.onclick = (e) => {
        e.stopPropagation();
        renderBatch();
      };

      // 先把加载更多按钮放进去
      modalFooter.appendChild(loadMoreBtn);

      // 初始渲染第一页
      renderBatch();
      // --- 分页逻辑结束 ---

      const cancelButton = document.createElement('button');
      cancelButton.textContent = '取消';
      cancelButton.style.marginTop = '15px';
      cancelButton.style.borderRadius = '8px';
      cancelButton.style.backgroundColor = '#fff';
      cancelButton.style.border = '1px solid #ddd';
      cancelButton.style.color = '#666';
      cancelButton.style.padding = '12px';
      cancelButton.style.width = '100%';

      cancelButton.onclick = () => {
        modal.classList.remove('visible');
        resolve(null);
      };
      modalFooter.appendChild(cancelButton);

      modal.classList.add('visible');

    }).finally(() => {
      // Promise 结束后的清理工作（如果有）
    });
  }


  // 增强版分类选择弹窗：支持自定义分类的新建、编辑、删除
  function showCategoryPickerModal(chat) {
    return new Promise(resolve => {
      const modal = document.getElementById('custom-modal-overlay');
      const modalTitle = document.getElementById('custom-modal-title');
      const modalBody = document.getElementById('custom-modal-body');
      const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');

      let resolved = false;
      const resetModalStyles = () => {
        modalBody.style.maxHeight = '';
        modalBody.style.overflowY = '';
        modalBody.style.webkitOverflowScrolling = '';
        modalBody.style.overscrollBehavior = '';
        modalBody.style.padding = '';
        modalFooter.style.flexDirection = '';
        modalFooter.style.maxHeight = '';
        modalFooter.style.overflowY = '';
        modalFooter.style.webkitOverflowScrolling = '';
        modalFooter.style.overscrollBehavior = '';
        modalFooter.style.padding = '';
        modalFooter.style.gap = '';
      };
      const safeResolve = (val) => {
        if (resolved) return;
        resolved = true;
        modal.classList.remove('visible');
        resetModalStyles();
        resolve(val);
      };

      const renderPicker = () => {
        const categories = window.structuredMemoryManager.getCategories(chat);
        const mgr = window.structuredMemoryManager;

        modalTitle.textContent = '选择分类';

        // 分类列表放 modalBody（可滚动）
        modalBody.innerHTML = '';
        modalBody.style.maxHeight = '45vh';
        modalBody.style.overflowY = 'auto';
        modalBody.style.webkitOverflowScrolling = 'touch';
        modalBody.style.overscrollBehavior = 'contain';
        modalBody.style.padding = '10px';

        const listWrap = document.createElement('div');
        listWrap.style.cssText = 'display:flex; flex-direction:column; gap:6px;';

        // 渲染每个分类选项
        Object.entries(categories).forEach(([code, cat]) => {
          const isCustom = !!(cat.isCustom);
          const row = document.createElement('div');
          row.style.cssText = 'display:flex; align-items:center; gap:6px; width:100%;';

          const btn = document.createElement('button');
          btn.className = 'payment-option-item';
          btn.style.cssText = 'flex:1; text-align:left; padding:12px 15px; margin:0; min-width:0;';
          btn.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cat.color || '#666'};margin-right:8px;"></span>${code} - ${cat.name}`;
          btn.onclick = () => safeResolve(code);
          row.appendChild(btn);

          if (isCustom) {
            const editBtn = document.createElement('button');
            editBtn.style.cssText = 'background:none; border:1px solid #ddd; border-radius:8px; padding:8px 10px; font-size:14px; cursor:pointer; flex-shrink:0;';
            editBtn.textContent = '✏️';
            editBtn.title = '编辑分类';
            editBtn.onclick = async (e) => {
              e.stopPropagation();
              modal.classList.remove('visible');
              resetModalStyles();
              const action = await showChoiceModal('编辑分类: ' + cat.name, [
                { text: '✏️ 重命名', value: 'rename' },
                { text: '🎨 修改颜色', value: 'color' },
                { text: '🗑️ 删除分类', value: 'delete' }
              ]);
              if (action === 'rename') {
                const newName = await showCustomPrompt('重命名分类', '输入新名称：', cat.name);
                if (newName && newName.trim()) {
                  mgr.renameCustomCategory(chat, code, newName.trim());
                  await db.chats.put(chat);
                  renderStructuredMemoryView();
                }
              } else if (action === 'color') {
                const colors = [
                  { text: '🔵 蓝色', value: '#007aff' },
                  { text: '🟢 绿色', value: '#34c759' },
                  { text: '🟠 橙色', value: '#ff9500' },
                  { text: '🟣 紫色', value: '#5856d6' },
                  { text: '🔴 红色', value: '#ff2d55' },
                  { text: '🩷 粉色', value: '#af52de' },
                  { text: '🟤 棕色', value: '#a2845e' },
                  { text: '⚫ 灰色', value: '#666666' }
                ];
                const newColor = await showChoiceModal('选择颜色', colors);
                if (newColor) {
                  mgr.recolorCustomCategory(chat, code, newColor);
                  await db.chats.put(chat);
                  renderStructuredMemoryView();
                }
              } else if (action === 'delete') {
                const mem = mgr.getStructuredMemory(chat);
                const itemCount = (mem._custom[code] || []).length;
                const confirmed = await showCustomConfirm('确认删除分类',
                  `确定要删除分类"${cat.name}"吗？${itemCount > 0 ? `其中的 ${itemCount} 条记忆也会被删除。` : ''}此操作不可撤销。`,
                  { confirmButtonClass: 'btn-danger', confirmText: '确认删除' }
                );
                if (confirmed) {
                  mgr.deleteCustomCategory(chat, code);
                  await db.chats.put(chat);
                  renderStructuredMemoryView();
                  showToast(`分类"${cat.name}"已删除`, 'info');
                }
              }
              resolved = false;
              modal.classList.add('visible');
              renderPicker();
            };
            row.appendChild(editBtn);
          }

          listWrap.appendChild(row);
        });

        modalBody.appendChild(listWrap);

        // 底部固定区域：新建分类 + 取消
        modalFooter.innerHTML = '';
        modalFooter.style.flexDirection = 'column';
        modalFooter.style.padding = '10px';
        modalFooter.style.gap = '8px';
        modalFooter.style.maxHeight = '';
        modalFooter.style.overflowY = '';

        const addBtn = document.createElement('button');
        addBtn.className = 'payment-option-item';
        addBtn.style.cssText = 'width:100%; text-align:center; padding:12px 15px; margin:0; color:#007aff; font-weight:600;';
        addBtn.textContent = '＋ 新建自定义分类';
        addBtn.onclick = async (e) => {
          e.stopPropagation();
          modal.classList.remove('visible');
          resetModalStyles();

          const name = await showCustomPrompt('新建自定义分类', '请输入分类名称（如：约会记录、共同爱好、吵架记录）');
          if (!name || !name.trim()) {
            resolved = false;
            modal.classList.add('visible');
            renderPicker();
            return;
          }

          const existingCodes = Object.keys(window.structuredMemoryManager.getCategories(chat));
          let code = name.trim().substring(0, 2).toUpperCase();
          let suffix = 1;
          let finalCode = code;
          while (existingCodes.includes(finalCode)) {
            finalCode = code + suffix;
            suffix++;
          }

          mgr.addCustomCategory(chat, finalCode, name.trim());
          await db.chats.put(chat);
          renderStructuredMemoryView();
          showToast(`分类"${name.trim()}"已创建`, 'success');

          resolved = false;
          modal.classList.add('visible');
          renderPicker();
        };
        modalFooter.appendChild(addBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.style.cssText = 'border-radius:8px; background:#fff; border:1px solid #ddd; color:#666; padding:12px; width:100%;';
        cancelBtn.textContent = '取消';
        cancelBtn.onclick = () => safeResolve(null);
        modalFooter.appendChild(cancelBtn);
      };

      renderPicker();
      modal.classList.add('visible');
    });
  }

  // 导出到全局作用域，供 HTML onclick 和其他模块调用
  window._modalOverlay = modalOverlay;
  window._modalTitle = modalTitle;
  window._modalBody = modalBody;
  window._modalConfirmBtn = modalConfirmBtn;
  window._modalCancelBtn = modalCancelBtn;
  Object.defineProperty(window, '_modalResolve', {
    get() { return modalResolve; },
    set(v) { modalResolve = v; },
    configurable: true
  });
  window.showCustomModal = showCustomModal;
  window.hideCustomModal = hideCustomModal;
  window.showCustomConfirm = showCustomConfirm;
  window.showDownloadToast = showDownloadToast;
  window.showToast = showToast;
  window.showCustomAlert = showCustomAlert;
  window.showRecoveryAlertWithBackup = showRecoveryAlertWithBackup;
  window.copyTextToClipboard = copyTextToClipboard;
  window.showCustomPrompt = showCustomPrompt;
  window.showSpectatorMemorySelectionModal = showSpectatorMemorySelectionModal;
  window.showChoiceModal = showChoiceModal;
  window.showCategoryPickerModal = showCategoryPickerModal;
})();
