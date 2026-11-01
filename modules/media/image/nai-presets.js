// ============================================================
// nai-imagen.js — NovelAI 预设管理 / 生图 + Google Imagen 生图
// 来源：script.js 第 7681 ~ 8889 行
// ============================================================

// --- 新增 NAI 预设相关函数 ---

// 参考并改写自 yxlforever/YYY：
// https://github.com/yxlforever/YYY/commit/fb27ca3fafb9a38f6f9f91daabd457a290f0be19
// 用途：生成下一张图时释放上一张结果图的 Blob URL，避免连续生图持续占用内存。
// 不改变生成结果、图库数据、保存方式、按钮入口或现有生图配置。
let naiResultObjectUrl = null;

function setNaiResultImageFromBlob(blob) {
  if (naiResultObjectUrl) {
    URL.revokeObjectURL(naiResultObjectUrl);
  }
  naiResultObjectUrl = URL.createObjectURL(blob);
  const imageEl = document.getElementById('nai-result-image');
  if (imageEl) imageEl.src = naiResultObjectUrl;
  return naiResultObjectUrl;
}

function releaseNaiResultObjectUrl() {
  if (!naiResultObjectUrl) return;
  URL.revokeObjectURL(naiResultObjectUrl);
  naiResultObjectUrl = null;
}

  // 1. 加载预设下拉菜单
  async function loadNaiPresetsDropdown() {
    const selectEl = document.getElementById('nai-preset-select');
    // 保留第一个选项
    selectEl.innerHTML = '<option value="">-- 当前临时设置 --</option>';

    const presets = await db.naiPresets.toArray();
    presets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      selectEl.appendChild(opt);
    });

    // 恢复选中状态
    if (currentNaiPresetId) {
      selectEl.value = currentNaiPresetId;
      updateNaiPresetButtons(true);
    } else {
      updateNaiPresetButtons(false);
    }
  }

  // 2. 更新按钮显示状态
  // 2. 更新按钮显示状态 (更新这个函数)
  function updateNaiPresetButtons(hasSelection) {
    const updateBtn = document.getElementById('update-nai-preset-btn');
    const bindBtn = document.getElementById('bind-nai-preset-btn');
    const deleteBtn = document.getElementById('delete-nai-preset-btn');
    const saveBtn = document.getElementById('save-nai-preset-btn');

    if (hasSelection) {
      updateBtn.style.display = 'block';
      bindBtn.style.display = 'block';
      deleteBtn.style.display = 'block';
      // 改动：选中状态下显示"另存" (2个字)
      saveBtn.textContent = '另存';
    } else {
      updateBtn.style.display = 'none';
      bindBtn.style.display = 'none';
      deleteBtn.style.display = 'none';
      // 改动：未选中状态下显示"新增" (2个字)
      saveBtn.textContent = '新增';
    }
  }

  // 3. 收集当前界面上的所有设置
  function gatherNaiUiSettings() {
    return {
      resolution: document.getElementById('nai-resolution').value,
      steps: parseInt(document.getElementById('nai-steps').value),
      cfg_scale: parseFloat(document.getElementById('nai-cfg-scale').value),
      sampler: document.getElementById('nai-sampler').value,
      seed: parseInt(document.getElementById('nai-seed').value),
      uc_preset: parseInt(document.getElementById('nai-uc-preset').value),
      quality_toggle: document.getElementById('nai-quality-toggle').checked,
      smea: document.getElementById('nai-smea').checked,
      smea_dyn: document.getElementById('nai-smea-dyn').checked,
      default_positive: document.getElementById('nai-default-positive').value,
      default_negative: document.getElementById('nai-default-negative').value,
      // 注意：API Key 和 Proxy 这种敏感/全局配置通常不存入风格预设，但你可以根据需求决定
      // 这里为了风格切换方便，我们只存参数，Key 和 Proxy 还是走全局
    };
  }

  // 4. 应用设置到 UI
  function applyNaiUiSettings(settings) {
    if (!settings) return;
    document.getElementById('nai-resolution').value = settings.resolution || '1024x1024';
    document.getElementById('nai-steps').value = settings.steps || 28;
    document.getElementById('nai-cfg-scale').value = settings.cfg_scale || 5;
    document.getElementById('nai-sampler').value = settings.sampler || 'k_euler_ancestral';
    document.getElementById('nai-seed').value = settings.seed ?? -1;
    document.getElementById('nai-uc-preset').value = settings.uc_preset || 1;
    document.getElementById('nai-quality-toggle').checked = settings.quality_toggle !== false;
    document.getElementById('nai-smea').checked = settings.smea !== false;
    document.getElementById('nai-smea-dyn').checked = settings.smea_dyn || false;
    document.getElementById('nai-default-positive').value = settings.default_positive || '';
    document.getElementById('nai-default-negative').value = settings.default_negative || '';
  }

  // 5. 保存/新建预设
  async function handleSaveNaiPreset(isUpdate = false) {
    const settings = gatherNaiUiSettings();

    if (isUpdate && currentNaiPresetId) {
      const confirmed = await showCustomConfirm("更新预设", "确定要覆盖当前预设的参数吗？");
      if (!confirmed) return;

      await db.naiPresets.update(parseInt(currentNaiPresetId), { settings });
      alert("预设已更新！");
    } else {
      const name = await showCustomPrompt("新建预设", "请输入预设名称（例如：厚涂风、像素风）");
      if (!name) return;

      const id = await db.naiPresets.add({ name, settings });
      currentNaiPresetId = id;
      await loadNaiPresetsDropdown();
      alert("预设已创建！");
    }
  }

  // 6. 删除预设
  async function handleDeleteNaiPreset() {
    if (!currentNaiPresetId) return;
    const confirmed = await showCustomConfirm("删除预设", "确定要删除此预设吗？绑定了此预设的角色将回退到全局设置。", { confirmButtonClass: 'btn-danger' });
    if (!confirmed) return;

    await db.naiPresets.delete(parseInt(currentNaiPresetId));

    // 清除所有聊天中的绑定引用
    const allChats = await db.chats.toArray();
    for (const chat of allChats) {
      if (chat.settings?.naiPresetId === parseInt(currentNaiPresetId)) {
        delete chat.settings.naiPresetId;
        await db.chats.put(chat);
      }
    }

    currentNaiPresetId = null;
    await loadNaiPresetsDropdown();
  }

  // 7. 处理下拉框切换
  async function handleNaiPresetChange(e) {
    const val = e.target.value;
    if (val) {
      currentNaiPresetId = parseInt(val);
      const preset = await db.naiPresets.get(currentNaiPresetId);
      if (preset && preset.settings) {
        applyNaiUiSettings(preset.settings);
      }
      updateNaiPresetButtons(true);
    } else {
      currentNaiPresetId = null;
      updateNaiPresetButtons(false);
      // 恢复到 localStorage 里的全局设置
      loadNovelAISettings();
    }
  }

  // 8. 打开绑定弹窗
  async function openNaiBindingModal() {
    if (!currentNaiPresetId) return;
    const preset = await db.naiPresets.get(parseInt(currentNaiPresetId));
    if (!preset) return;

    const modal = document.getElementById('nai-binding-modal');
    const listEl = document.getElementById('nai-binding-list');
    const titleEl = modal.querySelector('.modal-header span');

    titleEl.textContent = `将预设"${preset.name}"绑定到...`;
    listEl.innerHTML = '';

    const allChats = Object.values(state.chats).sort((a, b) => a.name.localeCompare(b.name));

    allChats.forEach(chat => {
      const isBound = chat.settings?.naiPresetId === currentNaiPresetId;

      const item = document.createElement('div');
      item.className = 'contact-picker-item'; // 复用样式
      item.innerHTML = `
            <input type="checkbox" class="nai-binding-checkbox" data-chat-id="${chat.id}" ${isBound ? 'checked' : ''} style="margin-right: 15px;">
            <img src="${chat.isGroup ? chat.settings.groupAvatar : chat.settings.aiAvatar || defaultAvatar}" class="avatar">
            <div style="display:flex; flex-direction:column;">
                <span class="name">${chat.name}</span>
                ${isBound ? '<span style="font-size:10px; color:green;">已绑定</span>' : ''}
            </div>
        `;
      // 点击行切换
      item.addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox') {
          const cb = item.querySelector('input');
          cb.checked = !cb.checked;
        }
      });
      listEl.appendChild(item);
    });

    modal.classList.add('visible');
  }

  // 9. 保存绑定
  async function saveNaiBinding() {
    if (!currentNaiPresetId) return;

    const checkboxes = document.querySelectorAll('.nai-binding-checkbox');
    const updates = [];

    for (const cb of checkboxes) {
      const chatId = cb.dataset.chatId;
      const chat = state.chats[chatId];
      const shouldBind = cb.checked;

      if (chat) {
        if (shouldBind) {
          // 如果勾选，绑定当前预设
          if (chat.settings.naiPresetId !== currentNaiPresetId) {
            chat.settings.naiPresetId = currentNaiPresetId;
            updates.push(chat);
          }
        } else {
          // 如果取消勾选，且当前正是绑定了这个预设，则解绑
          if (chat.settings.naiPresetId === currentNaiPresetId) {
            delete chat.settings.naiPresetId;
            updates.push(chat);
          }
        }
      }
    }

    if (updates.length > 0) {
      await db.chats.bulkPut(updates);
      await showCustomAlert("保存成功", `已更新 ${updates.length} 个角色的绑定设置。`);
    } else {
      // 无变化
    }

    document.getElementById('nai-binding-modal').classList.remove('visible');
  }

  function loadNovelAISettings() {
    const settings = getNovelAISettings();
    document.getElementById('nai-resolution').value = settings.resolution;
    document.getElementById('nai-steps').value = settings.steps;
    document.getElementById('nai-cfg-scale').value = settings.cfg_scale;
    document.getElementById('nai-sampler').value = settings.sampler;
    document.getElementById('nai-seed').value = settings.seed;
    document.getElementById('nai-uc-preset').value = settings.uc_preset;
    document.getElementById('nai-quality-toggle').checked = settings.quality_toggle;
    document.getElementById('nai-smea').checked = settings.smea;
    document.getElementById('nai-smea-dyn').checked = settings.smea_dyn;
    document.getElementById('nai-default-positive').value = settings.default_positive;
    document.getElementById('nai-default-negative').value = settings.default_negative;
    document.getElementById('nai-cors-proxy').value = settings.cors_proxy;
    document.getElementById('nai-custom-proxy-url').value = settings.custom_proxy_url || '';


    const customProxyGroup = document.getElementById('nai-custom-proxy-group');
    customProxyGroup.style.display = settings.cors_proxy === 'custom' ? 'block' : 'none';
    loadNaiPresetsDropdown();
  }

  async function saveNovelAISettings() {

    const settings = {
      ...getNovelAISettings(),
      ...window.NovelAISettings.read(),
      resolution: document.getElementById('nai-resolution').value,
      steps: parseInt(document.getElementById('nai-steps').value),
      cfg_scale: parseFloat(document.getElementById('nai-cfg-scale').value),
      sampler: document.getElementById('nai-sampler').value,
      seed: parseInt(document.getElementById('nai-seed').value),
      uc_preset: parseInt(document.getElementById('nai-uc-preset').value),
      quality_toggle: document.getElementById('nai-quality-toggle').checked,
      smea: document.getElementById('nai-smea').checked,
      smea_dyn: document.getElementById('nai-smea-dyn').checked,
      default_positive: document.getElementById('nai-default-positive').value,
      default_negative: document.getElementById('nai-default-negative').value,
      cors_proxy: document.getElementById('nai-cors-proxy').value,
      custom_proxy_url: document.getElementById('nai-custom-proxy-url').value
    };

    await window.NovelAISettings.save(settings);
  }

  function resetNovelAISettings() {
    const connection = Object.fromEntries(window.NovelAIConnection.connectionFields.map(key => [key, getNovelAISettings()[key]]));
    localStorage.removeItem('novelai-settings');
    localStorage.setItem('novelai-settings', JSON.stringify(connection));
    loadNovelAISettings();
    alert('已恢复默认生成参数，生图站点连接保持不变。请保存设置。');
  }

