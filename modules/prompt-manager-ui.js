/**
 * 提示词管理器 UI 交互 + 提示词获取辅助函数
 * 从 script.js 第 81253 ~ 文件末尾提取
 * 包含：提示词管理器界面、场景渲染、编辑器、导入导出、辅助函数
 */

// ========================================
// 提示词管理器 UI 交互
// ========================================

let currentEditingSceneId = null;

// 初始化提示词管理器UI
function initPromptManagerUI() {
  renderPromptScenes();

  // 打开提示词管理器按钮（在API设置中）
  const openBtn = document.getElementById('open-prompt-manager-btn');
  if (openBtn) {
    const openPromptManagerHandler = () => {
      // 暂时锁定提示词管理功能
      showCustomAlert(
        '功能开发中',
        '自定义提示词功能正在重构中，暂时无法使用。\n\n当前所有对话都使用内置的默认提示词。\n\n预计在下个版本中完成集成。'
      );
      // showScreen('prompt-manager-screen'); // 暂时注释掉
    };
    openBtn.addEventListener('click', openPromptManagerHandler);
    openBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      openPromptManagerHandler();
    }, { passive: false });
  }

  // 持久化存储检查按钮
  const storagePersistBtn = document.getElementById('check-storage-persistence-btn');
  if (storagePersistBtn) {
    const storagePersistHandler = async () => {
      const infoDiv = document.getElementById('storage-persistence-info');
      infoDiv.style.display = 'block';
      infoDiv.innerHTML = '<span style="color:#999;">检查中...</span>';

      try {
        const persisted = await window.checkStoragePersistence();
        const estimate = await window.getStorageEstimate();

        let html = '';

        // 持久化状态
        if (persisted === true) {
          html += '<div style="margin-bottom:8px;">🛡️ <strong style="color:#34c759;">已启用持久化保护</strong><br><span style="font-size:12px;">浏览器不会自动清除本站数据</span></div>';
        } else if (persisted === false) {
          html += '<div style="margin-bottom:8px;">⚠️ <strong style="color:#ff9500;">未获得持久化保护</strong><br><span style="font-size:12px;">浏览器可能在存储压力下自动清除数据，建议定期备份</span></div>';
          html += '<button id="request-persist-btn" style="margin:6px 0 10px;padding:6px 14px;border:none;border-radius:8px;background:#007aff;color:#fff;font-size:13px;cursor:pointer;">请求持久化保护</button>';
        } else {
          html += '<div style="margin-bottom:8px;">❓ <strong style="color:#999;">浏览器不支持持久化存储 API</strong></div>';
        }

        // 存储用量
        if (estimate) {
          const usageMB = (estimate.usage / 1024 / 1024).toFixed(1);
          const quotaMB = (estimate.quota / 1024 / 1024).toFixed(0);
          const percent = estimate.usagePercent;
          const barColor = percent > 80 ? '#ff3b30' : percent > 50 ? '#ff9500' : '#34c759';
          html += '<div style="margin-top:4px;">';
          html += `📦 已用 <strong>${usageMB} MB</strong> / ${quotaMB} MB（${percent}%）`;
          html += `<div style="margin-top:6px;height:6px;background:#e0e0e0;border-radius:3px;overflow:hidden;">`;
          html += `<div style="height:100%;width:${Math.min(percent, 100)}%;background:${barColor};border-radius:3px;transition:width 0.3s;"></div>`;
          html += '</div></div>';
        }

        infoDiv.innerHTML = html;

        // 绑定手动请求按钮
        const requestBtn = document.getElementById('request-persist-btn');
        if (requestBtn) {
          const requestPersistHandler = async () => {
            try {
              const granted = await navigator.storage.persist();
              if (granted) {
                await showCustomAlert('成功', '已获得持久化存储保护，浏览器不会自动清除数据。');
              } else {
                await showCustomAlert('提示', '浏览器拒绝了请求。\n\n建议：将本站添加到主屏幕（PWA安装）或开启通知权限，可提高授权概率。');
              }
              // 刷新显示
              storagePersistBtn.click();
            } catch (err) {
              await showCustomAlert('错误', '请求失败: ' + err.message);
            }
          };
          requestBtn.addEventListener('click', requestPersistHandler);
          requestBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            requestPersistHandler();
          }, { passive: false });
        }
      } catch (error) {
        infoDiv.innerHTML = '<span style="color:#ff3b30;">检查失败: ' + error.message + '</span>';
      }
    };
    storagePersistBtn.addEventListener('click', storagePersistHandler);
    storagePersistBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      storagePersistHandler();
    }, { passive: false });
  }

  
  // 导出按钮
  document.getElementById('prompt-export-btn').addEventListener('click', () => {
    promptManager.exportPrompts();
    showCustomAlert('导出成功', '提示词已导出为JSON文件');
  });

  // 导入按钮
  document.getElementById('prompt-import-btn').addEventListener('click', () => {
    document.getElementById('prompt-import-input').click();
  });

  // 导入文件选择
  document.getElementById('prompt-import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      await promptManager.importPrompts(file);
      renderPromptScenes();
      await showCustomAlert('导入成功', '提示词已成功导入');
    } catch (error) {
      await showCustomAlert('导入失败', `错误: ${error.message}`);
    }

    // 清空文件选择
    e.target.value = '';
  });

  // 重置按钮
  document.getElementById('prompt-reset-btn').addEventListener('click', async () => {
    const confirmed = confirm('确定要重置所有提示词为默认值吗？此操作不可撤销！');
    if (!confirmed) return;

    if (promptManager.resetToDefaults()) {
      renderPromptScenes();
      await showCustomAlert('重置成功', '所有提示词已恢复为默认值');
    } else {
      await showCustomAlert('重置失败', '操作失败，请重试');
    }
  });
}

// 渲染场景列表
function renderPromptScenes() {
  const container = document.getElementById('prompt-scenes-container');
  container.innerHTML = '';

  const scenes = promptManager.getAllScenes();
  const customPrompts = promptManager.loadCustomPrompts();
  const defaultPrompts = promptManager.getDefaultPrompts();

  // 按类别分组
  const categories = {};
  scenes.forEach(scene => {
    if (!categories[scene.category]) {
      categories[scene.category] = [];
    }
    categories[scene.category].push(scene);
  });

  // 渲染每个类别
  Object.keys(categories).forEach(category => {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'prompt-category';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'prompt-category-header';
    headerDiv.style.display = 'flex';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.alignItems = 'center';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = category;
    headerDiv.appendChild(titleSpan);

    // 分类操作按钮容器
    const categoryActionsDiv = document.createElement('div');
    categoryActionsDiv.style.display = 'flex';
    categoryActionsDiv.style.gap = '8px';

    // 导出按钮
    const exportCategoryBtn = document.createElement('button');
    exportCategoryBtn.textContent = '导出';
    exportCategoryBtn.className = 'category-action-btn';
    exportCategoryBtn.onclick = (e) => {
      e.stopPropagation();
      promptManager.exportCategory(category);
    };

    // 导入按钮
    const importCategoryBtn = document.createElement('button');
    importCategoryBtn.textContent = '导入';
    importCategoryBtn.className = 'category-action-btn';
    importCategoryBtn.onclick = async (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (event) => {
        const file = event.target.files[0];
        if (file) {
          try {
            await promptManager.importCategory(file, category);
            renderPromptScenes();
            await showCustomAlert('导入成功', `${category}的提示词已成功导入`);
          } catch (error) {
            await showCustomAlert('导入失败', error.message);
          }
        }
      };
      input.click();
    };

    // 重置按钮
    const resetCategoryBtn = document.createElement('button');
    resetCategoryBtn.textContent = '重置';
    resetCategoryBtn.className = 'category-action-btn';
    resetCategoryBtn.onclick = async (e) => {
      e.stopPropagation();
      const confirmed = confirm(`确定要重置"${category}"分类的所有提示词吗？`);
      if (confirmed) {
        categories[category].forEach(scene => {
          promptManager.resetScene(scene.id);
        });
        renderPromptScenes();
        await showCustomAlert('重置成功', `${category}的提示词已恢复为默认值`);
      }
    };

    categoryActionsDiv.appendChild(exportCategoryBtn);
    categoryActionsDiv.appendChild(importCategoryBtn);
    categoryActionsDiv.appendChild(resetCategoryBtn);
    headerDiv.appendChild(categoryActionsDiv);

    categoryDiv.appendChild(headerDiv);

    const listDiv = document.createElement('div');
    listDiv.className = 'prompt-scene-list';

    categories[category].forEach(scene => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'prompt-scene-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'prompt-scene-name';
      nameSpan.textContent = scene.name;

      const statusSpan = document.createElement('span');
      statusSpan.className = 'prompt-scene-status';

      // 检查是否有自定义提示词（对比默认值）
      const keys = scene.id.split('.');
      let customValue = customPrompts?.prompts;
      let defaultValue = defaultPrompts.prompts;

      for (const key of keys) {
        customValue = customValue?.[key];
        defaultValue = defaultValue?.[key];
      }

      // 只有当自定义值存在且与默认值不同时，才显示"已自定义"
      const isCustomized = customValue &&
        customValue.trim() &&
        customValue !== defaultValue;

      if (isCustomized) {
        statusSpan.textContent = '已自定义';
        statusSpan.classList.add('custom');
      } else {
        statusSpan.textContent = '使用默认';
      }

      const editBtn = document.createElement('button');
      editBtn.className = 'prompt-edit-btn';
      editBtn.textContent = '编辑';
      editBtn.onclick = () => openPromptEditor(scene.id, scene.name);

      itemDiv.appendChild(nameSpan);
      itemDiv.appendChild(statusSpan);
      itemDiv.appendChild(editBtn);
      listDiv.appendChild(itemDiv);
    });

    categoryDiv.appendChild(listDiv);
    container.appendChild(categoryDiv);
  });
}

// 打开提示词编辑器
function openPromptEditor(sceneId, sceneName) {
  currentEditingSceneId = sceneId;

  const modal = document.getElementById('prompt-editor-modal');
  const title = document.getElementById('prompt-editor-title');
  const textarea = document.getElementById('prompt-editor-textarea');

  title.textContent = `编辑提示词 - ${sceneName}`;

  // 获取当前提示词（优先自定义，否则默认）
  const currentPrompt = promptManager.getPrompt(sceneId);
  textarea.value = currentPrompt;

  modal.style.display = 'flex';

  // 自动聚焦
  setTimeout(() => textarea.focus(), 100);
}

// 关闭提示词编辑器
function closePromptEditor() {
  const modal = document.getElementById('prompt-editor-modal');
  modal.style.display = 'none';
  currentEditingSceneId = null;
}

// 保存提示词编辑
async function savePromptEdit() {
  if (!currentEditingSceneId) return;

  const textarea = document.getElementById('prompt-editor-textarea');
  const newPrompt = textarea.value;

  // 加载或创建自定义提示词对象
  let customPrompts = promptManager.loadCustomPrompts() || promptManager.getDefaultPrompts();

  // 根据路径设置值
  const keys = currentEditingSceneId.split('.');
  let target = customPrompts.prompts;

  for (let i = 0; i < keys.length - 1; i++) {
    if (!target[keys[i]]) {
      target[keys[i]] = {};
    }
    target = target[keys[i]];
  }

  target[keys[keys.length - 1]] = newPrompt;

  // 保存
  if (promptManager.saveCustomPrompts(customPrompts)) {
    closePromptEditor();
    renderPromptScenes();
    await showCustomAlert('保存成功', '提示词已保存');
  } else {
    await showCustomAlert('保存失败', '操作失败，请重试');
  }
}

// 在页面加载时初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPromptManagerUI);
} else {
  initPromptManagerUI();
}


// ========================================
// 提示词获取辅助函数
// ========================================

// 注意：由于提示词包含大量模板变量（${...}），
// 我们采用以下策略：
// 1. 如果用户没有自定义，直接使用代码中的原始提示词（保持现有逻辑）
// 2. 如果用户自定义了，则使用自定义的提示词
// 3. 自定义提示词中的变量会在运行时被替换

// 检查是否有自定义提示词
function hasCustomPrompt(scenePath) {
  const custom = promptManager.loadCustomPrompts();
  if (!custom) return false;

  const keys = scenePath.split('.');
  let value = custom.prompts;
  for (const key of keys) {
    value = value?.[key];
  }

  return value && value.trim().length > 0;
}

// 获取自定义提示词（如果存在）
function getCustomPromptIfExists(scenePath) {
  if (!hasCustomPrompt(scenePath)) {
    return null;
  }
  return promptManager.getPrompt(scenePath);
}