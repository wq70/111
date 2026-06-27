const ThoughtChainManager = {
    items: [],
    enabled: true,
    selectedIds: [],
    draggedItemId: null,
    
    defaultItems: [
        {
            id: 'tc_head_1',
            name: '思维链开启引导',
            position: 'head',
            role: 'system',
            content: '在行动前，你必须先思考。请按照以下步骤在 <thinking> 和 </thinking> 标签内进行思考：',
            enabled: true,
            isCore: true
        },
        {
            id: 'tc_mid_1',
            name: '潜台词感知',
            position: 'middle',
            role: 'system',
            content: '- 潜台词感知：对方这句话的潜台词是什么？当前话题是否涉及世界书/人设中的特殊设定？我该如何体现？对他/她的人设是否把握准确？',
            enabled: true
        },
        {
            id: 'tc_mid_2',
            name: '情绪反应',
            position: 'middle',
            role: 'system',
            content: '- 情绪反应：我此刻的真实情绪（开心/委屈/期待？）我的情绪是否符合我的人设',
            enabled: true
        },
        {
            id: 'tc_mid_3',
            name: '角色想法',
            position: 'middle',
            role: 'system',
            content: '- 角色想法：基于人设，我内心最真实的想法...',
            enabled: true
        },
        {
            id: 'tc_bottom_1',
            name: '思维链触发器',
            position: 'bottom',
            role: 'assistant',
            content: '<thinking>\n',
            enabled: true,
            isCore: true
        }
    ],

    init() {
        this.loadData();
        this.bindEvents();
        this.renderList();
        
        // 由于 Dexie 初始化可能是异步的，等待一点时间后加载下拉框
        setTimeout(() => {
            this.loadPresetsDropdown();
        }, 500);
    },

    async loadPresetsDropdown(forceSelectedId = null) {
        const selectEl = document.getElementById('thought-chain-preset-select');
        if (!selectEl) return;
        
        selectEl.innerHTML = '<option value="current">当前配置 (未保存)</option>';

        try {
            // 插入内置默认模板
            const defaultOption = document.createElement('option');
            defaultOption.value = 'default';
            defaultOption.textContent = '内置默认模板';
            selectEl.appendChild(defaultOption);

            const presets = await db.thoughtChainPresets.toArray();
            presets.forEach(preset => {
                const option = document.createElement('option');
                option.value = preset.id;
                option.textContent = preset.name;
                selectEl.appendChild(option);
            });

            if (forceSelectedId) {
                selectEl.value = forceSelectedId;
                return;
            }
            
            // 尝试匹配当前配置
            let matchingPresetId = null;
            const currentItemsJson = JSON.stringify(this.items);
            for (const preset of presets) {
                if (JSON.stringify(preset.items) === currentItemsJson) {
                    matchingPresetId = preset.id;
                    break;
                }
            }

            if (matchingPresetId) {
                selectEl.value = matchingPresetId;
            } else if (JSON.stringify(this.items) === JSON.stringify(this.defaultItems)) {
                selectEl.value = 'default';
            } else {
                selectEl.value = 'current';
            }
        } catch (e) {
            console.error('加载思维链预设失败:', e);
        }
    },

    async handlePresetSelectionChange() {
        const selectEl = document.getElementById('thought-chain-preset-select');
        const selectedValue = selectEl.value;

        if (selectedValue === 'default') {
            this.items = JSON.parse(JSON.stringify(this.defaultItems));
            this.saveData();
            this.renderList();
            showToast('已加载内置默认模板');
            return;
        }

        const selectedId = parseInt(selectedValue);
        if (isNaN(selectedId)) {
            return;
        }

        try {
            const preset = await db.thoughtChainPresets.get(selectedId);
            if (preset && preset.items) {
                this.items = preset.items;
                this.saveData();
                this.renderList();
                showToast(`已加载思维链预设: ${preset.name}`);
            }
        } catch (e) {
            console.error('加载思维链预设详细信息失败:', e);
        }
    },

    async savePreset() {
        const name = await showCustomPrompt('保存思维链预设', '请输入预设名称');
        if (!name || !name.trim()) return;

        const presetData = {
            name: name.trim(),
            items: JSON.parse(JSON.stringify(this.items)) // 深拷贝当前条目
        };

        try {
            const existingPreset = await db.thoughtChainPresets.where('name').equals(presetData.name).first();
            if (existingPreset) {
                const confirmed = await showCustomConfirm('覆盖预设', `名为 "${presetData.name}" 的预设已存在。要覆盖它吗？`, {
                    confirmButtonClass: 'btn-danger'
                });
                if (!confirmed) return;
                presetData.id = existingPreset.id;
            }

            await db.thoughtChainPresets.put(presetData);
            await this.loadPresetsDropdown(presetData.id);
            showToast('思维链预设已保存！');
        } catch (e) {
            console.error('保存思维链预设失败:', e);
            alert('保存失败，请查看控制台。');
        }
    },

    async deletePreset() {
        const selectEl = document.getElementById('thought-chain-preset-select');
        const selectedId = parseInt(selectEl.value);

        if (isNaN(selectedId)) {
            alert('请先从下拉框中选择一个要删除的预设。');
            return;
        }

        try {
            const preset = await db.thoughtChainPresets.get(selectedId);
            if (!preset) return;

            const confirmed = await showCustomConfirm('删除预设', `确定要删除预设 "${preset.name}" 吗？`, {
                confirmButtonClass: 'btn-danger'
            });
            if (confirmed) {
                await db.thoughtChainPresets.delete(selectedId);
                await this.loadPresetsDropdown();
                showToast('预设已删除。');
            }
        } catch (e) {
            console.error('删除思维链预设失败:', e);
        }
    },

    loadData() {
        const storedEnabled = localStorage.getItem('ephone_thought_chain_enabled');
        if (storedEnabled !== null) {
            this.enabled = storedEnabled === 'true';
        }

        const storedItems = localStorage.getItem('ephone_thought_chain_items');
        if (storedItems) {
            try {
                this.items = JSON.parse(storedItems);
            } catch (e) {
                console.error('Failed to parse thought chain items', e);
                this.items = [...this.defaultItems];
            }
        } else {
            this.items = [...this.defaultItems];
            this.saveData();
        }
        
        const enableSwitch = document.getElementById('thought-chain-enable-switch');
        if (enableSwitch) {
            enableSwitch.checked = this.enabled;
        }
    },

    saveData() {
        localStorage.setItem('ephone_thought_chain_enabled', this.enabled);
        localStorage.setItem('ephone_thought_chain_items', JSON.stringify(this.items));
    },

    bindEvents() {
        const enableSwitch = document.getElementById('thought-chain-enable-switch');
        if (enableSwitch) {
            enableSwitch.addEventListener('change', (e) => {
                this.enabled = e.target.checked;
                this.saveData();
            });
        }

        const resetBtn = document.getElementById('thought-chain-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('确定要恢复默认的思维链条目吗？这会覆盖你所有的自定义修改。')) {
                    this.items = [...this.defaultItems];
                    this.saveData();
                    this.renderList();
                }
            });
        }

        const addBtn = document.getElementById('add-thought-chain-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.openEditor();
            });
        }

        const cancelBtn = document.getElementById('tc-cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.closeEditor();
            });
        }

        const saveBtn = document.getElementById('tc-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveEditorItem();
            });
        }
        
        // 预设相关事件绑定
        const presetSelect = document.getElementById('thought-chain-preset-select');
        if (presetSelect) {
            presetSelect.addEventListener('change', () => this.handlePresetSelectionChange());
        }
        
        const newPresetBtn = document.getElementById('new-thought-chain-preset-btn');
        if (newPresetBtn) {
            newPresetBtn.addEventListener('click', () => this.createNewPreset());
        }

        const savePresetBtn = document.getElementById('save-thought-chain-preset-btn');
        if (savePresetBtn) {
            savePresetBtn.addEventListener('click', () => this.savePreset());
        }
        
        const deletePresetBtn = document.getElementById('delete-thought-chain-preset-btn');
        if (deletePresetBtn) {
            deletePresetBtn.addEventListener('click', () => this.deletePreset());
        }
        
        const exportPresetBtn = document.getElementById('export-thought-chain-preset-btn');
        if (exportPresetBtn) {
            exportPresetBtn.addEventListener('click', () => this.exportPreset());
        }
        
        const importPresetBtn = document.getElementById('import-thought-chain-preset-btn');
        const importPresetFile = document.getElementById('import-thought-chain-preset-file');
        if (importPresetBtn && importPresetFile) {
            importPresetBtn.addEventListener('click', () => importPresetFile.click());
            importPresetFile.addEventListener('change', (e) => this.importPreset(e));
        }
    },

    async createNewPreset() {
        const name = await showCustomPrompt('新建思维链预设', '请输入新模板名称');
        if (!name || !name.trim()) return;

        // 仅保留头尾核心条目
        const coreItems = this.defaultItems.filter(item => item.isCore);
        
        const presetData = {
            name: name.trim(),
            items: JSON.parse(JSON.stringify(coreItems))
        };

        try {
            const existingPreset = await db.thoughtChainPresets.where('name').equals(presetData.name).first();
            if (existingPreset) {
                const confirmed = await showCustomConfirm('覆盖预设', `名为 "${presetData.name}" 的预设已存在。要覆盖它吗？`, {
                    confirmButtonClass: 'btn-danger'
                });
                if (!confirmed) return;
                presetData.id = existingPreset.id;
            }

            const newId = await db.thoughtChainPresets.put(presetData);
            this.items = presetData.items;
            this.saveData();
            this.renderList();
            await this.loadPresetsDropdown(newId);
            showToast('新模板创建成功，你可以自由添加中间的自定义条目了。');
        } catch (e) {
            console.error('新建思维链预设失败:', e);
            alert('创建失败，请查看控制台。');
        }
    },

    exportPreset() {
        if (!this.items || this.items.length === 0) {
            alert('当前没有可导出的思维链配置。');
            return;
        }

        const presetSelect = document.getElementById('thought-chain-preset-select');
        const presetName = presetSelect.options[presetSelect.selectedIndex].text || '思维链预设';
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.items, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href",     dataStr);
        // 去除名称中的非法字符
        const safeName = presetName.replace(/[<>:"\/\\|?*\x00-\x1F]/g, '_');
        downloadAnchorNode.setAttribute("download", `思维链预设_${safeName}.json`);
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showToast('已导出思维链配置。');
    },

    async importPreset(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            let parsedItems = JSON.parse(text);
            
            // 简单验证数据结构
            if (!Array.isArray(parsedItems)) {
                if (parsedItems.items && Array.isArray(parsedItems.items)) {
                    parsedItems = parsedItems.items;
                } else {
                     throw new Error('导入的数据格式不正确，应为包含数组的JSON。');
                }
            }

            const confirmed = await showCustomConfirm('导入配置', '确定要导入此思维链配置吗？这将覆盖当前的未保存配置。', { confirmButtonText: '确定导入' });
            if (confirmed) {
                this.items = parsedItems;
                // 重置所有导入项的内部状态以防冲突 (可选，但推荐生成新的内部 ID)
                this.items = this.items.map(item => ({
                    ...item,
                    id: 'tc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
                }));
                this.saveData();
                this.renderList();
                
                let defaultName = file.name.replace(/\.json$/i, '');
                if (defaultName.startsWith('思维链预设_')) {
                    defaultName = defaultName.substring('思维链预设_'.length);
                }
                
                const name = await showCustomPrompt('保存为预设', '请输入新预设的名称', defaultName);
                if (name && name.trim()) {
                    const presetData = {
                        name: name.trim(),
                        items: JSON.parse(JSON.stringify(this.items))
                    };
                    
                    const existingPreset = await db.thoughtChainPresets.where('name').equals(presetData.name).first();
                    let shouldSave = true;
                    if (existingPreset) {
                        const overwrite = await showCustomConfirm('覆盖预设', `名为 "${presetData.name}" 的预设已存在。要覆盖它吗？`, {
                            confirmButtonClass: 'btn-danger'
                        });
                        if (!overwrite) {
                            shouldSave = false;
                        } else {
                            presetData.id = existingPreset.id;
                        }
                    }
                    
                    if (shouldSave) {
                        const newId = await db.thoughtChainPresets.put(presetData);
                        await this.loadPresetsDropdown(newId);
                        showToast('思维链配置导入并保存成功！');
                    } else {
                        this.loadPresetsDropdown();
                        showToast('思维链配置导入成功！（未保存为预设）');
                    }
                } else {
                    this.loadPresetsDropdown(); // 如果取消保存，则重置下拉框为当前未保存状态
                    showToast('思维链配置导入成功！（未保存为预设）');
                }
            }
        } catch (error) {
            console.error('导入思维链配置失败:', error);
            alert(`导入失败: ${error.message || '文件格式错误'}`);
        } finally {
            // 清空 file input，以便下次可以选择同一个文件
            event.target.value = '';
        }
    },

    moveItemUp(index) {
        if (index <= 0) return;
        const item = this.items[index];
        this.items.splice(index, 1);
        this.items.splice(index - 1, 0, item);
        this.saveData();
        this.renderList();
    },

    moveItemDown(index) {
        if (index >= this.items.length - 1) return;
        const item = this.items[index];
        this.items.splice(index, 1);
        this.items.splice(index + 1, 0, item);
        this.saveData();
        this.renderList();
    },

    moveItemTop(index) {
        if (index <= 0) return;
        const item = this.items[index];
        this.items.splice(index, 1);
        this.items.unshift(item);
        this.saveData();
        this.renderList();
    },

    moveItemBottom(index) {
        if (index >= this.items.length - 1) return;
        const item = this.items[index];
        this.items.splice(index, 1);
        this.items.push(item);
        this.saveData();
        this.renderList();
    },

    moveSelectedUp() {
        if (this.selectedIds.length === 0) return;
        let moved = false;
        for (let i = 1; i < this.items.length; i++) {
            if (this.selectedIds.includes(this.items[i].id) && !this.selectedIds.includes(this.items[i-1].id)) {
                const temp = this.items[i];
                this.items[i] = this.items[i-1];
                this.items[i-1] = temp;
                moved = true;
            }
        }
        if (moved) {
            this.saveData();
            this.renderList();
        }
    },

    moveSelectedDown() {
        if (this.selectedIds.length === 0) return;
        let moved = false;
        for (let i = this.items.length - 2; i >= 0; i--) {
            if (this.selectedIds.includes(this.items[i].id) && !this.selectedIds.includes(this.items[i+1].id)) {
                const temp = this.items[i];
                this.items[i] = this.items[i+1];
                this.items[i+1] = temp;
                moved = true;
            }
        }
        if (moved) {
            this.saveData();
            this.renderList();
        }
    },

    moveSelectedTop() {
        if (this.selectedIds.length === 0) return;
        const selectedItems = [];
        const unselectedItems = [];
        
        for (const item of this.items) {
            if (this.selectedIds.includes(item.id)) {
                selectedItems.push(item);
            } else {
                unselectedItems.push(item);
            }
        }
        
        let isAlreadyTop = true;
        for (let i = 0; i < selectedItems.length; i++) {
            if (this.items[i].id !== selectedItems[i].id) {
                isAlreadyTop = false;
                break;
            }
        }
        
        if (!isAlreadyTop) {
            this.items = [...selectedItems, ...unselectedItems];
            this.saveData();
            this.renderList();
        }
    },

    moveSelectedBottom() {
        if (this.selectedIds.length === 0) return;
        const selectedItems = [];
        const unselectedItems = [];
        
        for (const item of this.items) {
            if (this.selectedIds.includes(item.id)) {
                selectedItems.push(item);
            } else {
                unselectedItems.push(item);
            }
        }
        
        let isAlreadyBottom = true;
        for (let i = 0; i < selectedItems.length; i++) {
            if (this.items[this.items.length - selectedItems.length + i].id !== selectedItems[i].id) {
                isAlreadyBottom = false;
                break;
            }
        }
        
        if (!isAlreadyBottom) {
            this.items = [...unselectedItems, ...selectedItems];
            this.saveData();
            this.renderList();
        }
    },

    toggleSelection(id) {
        const index = this.selectedIds.indexOf(id);
        if (index === -1) {
            this.selectedIds.push(id);
        } else {
            this.selectedIds.splice(index, 1);
        }
        this.renderList();
    },

    toggleAllSelection(checked) {
        if (checked) {
            this.selectedIds = this.items.map(item => item.id);
        } else {
            this.selectedIds = [];
        }
        this.renderList();
    },

    renderList() {
        const listContainer = document.getElementById('thought-chain-list');
        if (!listContainer) return;
        
        listContainer.innerHTML = '';
        
        if (this.items.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">暂无思维链条目</div>';
            return;
        }

        const allSelected = this.items.length > 0 && this.selectedIds.length === this.items.length;
        const someSelected = this.selectedIds.length > 0;
        
        const toolbarEl = document.createElement('div');
        toolbarEl.style.cssText = 'display: flex; gap: 10px; align-items: center; margin-bottom: 10px; padding: 8px 12px; background: #f9f9f9; border-radius: 8px; border: 1px solid #eee;';
        toolbarEl.innerHTML = `
            <label style="display: flex; align-items: center; gap: 6px; margin: 0; cursor: pointer;">
                <input type="checkbox" id="tc-select-all" ${allSelected ? 'checked' : ''}>
                <span style="font-size: 13px; color: #333; font-weight: 500;">全选</span>
            </label>
            <div style="flex: 1;"></div>
            <button id="tc-btn-move-top" style="padding: 4px 10px; font-size: 12px; border-radius: 4px; border: 1px solid #ccc; background: white; cursor: ${someSelected ? 'pointer' : 'not-allowed'}; opacity: ${someSelected ? 1 : 0.5}; color: #333;">置顶选中</button>
            <button id="tc-btn-move-up" style="padding: 4px 10px; font-size: 12px; border-radius: 4px; border: 1px solid #ccc; background: white; cursor: ${someSelected ? 'pointer' : 'not-allowed'}; opacity: ${someSelected ? 1 : 0.5}; color: #333;">上移选中</button>
            <button id="tc-btn-move-down" style="padding: 4px 10px; font-size: 12px; border-radius: 4px; border: 1px solid #ccc; background: white; cursor: ${someSelected ? 'pointer' : 'not-allowed'}; opacity: ${someSelected ? 1 : 0.5}; color: #333;">下移选中</button>
            <button id="tc-btn-move-bottom" style="padding: 4px 10px; font-size: 12px; border-radius: 4px; border: 1px solid #ccc; background: white; cursor: ${someSelected ? 'pointer' : 'not-allowed'}; opacity: ${someSelected ? 1 : 0.5}; color: #333;">置底选中</button>
        `;
        listContainer.appendChild(toolbarEl);
        
        toolbarEl.querySelector('#tc-select-all').addEventListener('change', (e) => {
            this.toggleAllSelection(e.target.checked);
        });
        toolbarEl.querySelector('#tc-btn-move-top').addEventListener('click', () => {
            this.moveSelectedTop();
        });
        toolbarEl.querySelector('#tc-btn-move-up').addEventListener('click', () => {
            this.moveSelectedUp();
        });
        toolbarEl.querySelector('#tc-btn-move-down').addEventListener('click', () => {
            this.moveSelectedDown();
        });
        toolbarEl.querySelector('#tc-btn-move-bottom').addEventListener('click', () => {
            this.moveSelectedBottom();
        });

        this.items.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'tc-item-card';
            el.draggable = true;
            el.dataset.index = index;
            el.dataset.id = item.id;
            
            el.addEventListener('dragstart', (e) => {
                this.draggedItemId = item.id;
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => el.style.opacity = '0.5', 0);
            });
            el.addEventListener('dragend', (e) => {
                this.draggedItemId = null;
                el.style.opacity = '1';
                listContainer.querySelectorAll('.tc-item-card').forEach(card => {
                    card.style.borderTop = '';
                    card.style.borderBottom = '';
                });
            });
            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = el.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                if (e.clientY < mid) {
                    el.style.borderTop = '2px solid #007aff';
                    el.style.borderBottom = '';
                } else {
                    el.style.borderBottom = '2px solid #007aff';
                    el.style.borderTop = '';
                }
            });
            el.addEventListener('dragleave', (e) => {
                el.style.borderTop = '';
                el.style.borderBottom = '';
            });
            el.addEventListener('drop', (e) => {
                e.preventDefault();
                el.style.borderTop = '';
                el.style.borderBottom = '';
                if (!this.draggedItemId || this.draggedItemId === item.id) return;
                
                const rect = el.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                const insertAfter = e.clientY >= mid;
                
                const draggedIndex = this.items.findIndex(i => i.id === this.draggedItemId);
                let targetIndex = index;
                if (insertAfter && draggedIndex > targetIndex) targetIndex++;
                else if (!insertAfter && draggedIndex < targetIndex) targetIndex--;
                
                const draggedItem = this.items[draggedIndex];
                this.items.splice(draggedIndex, 1);
                this.items.splice(targetIndex, 0, draggedItem);
                
                this.saveData();
                this.renderList();
            });

            el.style.cssText = 'background: white; border-radius: 8px; padding: 12px; border: 1px solid #eee; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); margin-bottom: 8px; transition: transform 0.2s;';
            
            const isSelected = this.selectedIds.includes(item.id);
            const positionText = item.position === 'head' ? '头部' : (item.position === 'middle' ? '中间' : '底部');
            const roleText = item.role === 'system' ? 'System' : (item.role === 'assistant' ? 'Assistant' : 'User');
            
            el.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 200px; opacity: ${item.enabled ? '1' : '0.5'};">
                    <div style="cursor: grab; color: #bbb; font-size: 18px; user-select: none; line-height: 1;" title="长按拖动">≡</div>
                    <input type="checkbox" class="tc-item-select" data-id="${item.id}" ${isSelected ? 'checked' : ''} style="cursor: pointer; margin: 0;">
                    <span style="font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">${item.name}</span>
                    <span style="font-size: 11px; font-weight: normal; background: #f0f0f0; padding: 2px 6px; border-radius: 4px; color: #666; white-space: nowrap; flex-shrink: 0;">${positionText} | ${roleText}</span>
                </div>
                <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end;">
                    <button class="tc-item-move-top-btn" data-index="${index}" style="background: none; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; padding: 4px 8px; cursor: pointer; color: #333;" ${index === 0 ? 'disabled opacity="0.5"' : ''}>置顶</button>
                    <button class="tc-item-move-up-btn" data-index="${index}" style="background: none; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; padding: 4px 8px; cursor: pointer; color: #333;" ${index === 0 ? 'disabled opacity="0.5"' : ''}>上移</button>
                    <button class="tc-item-move-down-btn" data-index="${index}" style="background: none; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; padding: 4px 8px; cursor: pointer; color: #333;" ${index === this.items.length - 1 ? 'disabled opacity="0.5"' : ''}>下移</button>
                    <button class="tc-item-move-bottom-btn" data-index="${index}" style="background: none; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; padding: 4px 8px; cursor: pointer; color: #333;" ${index === this.items.length - 1 ? 'disabled opacity="0.5"' : ''}>置底</button>
                    <label class="toggle-switch" style="transform: scale(0.8); margin: 0;">
                        <input type="checkbox" class="tc-item-toggle" data-id="${item.id}" ${item.enabled ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                    <button class="tc-item-edit-btn" data-id="${item.id}" style="background: none; border: 1px solid #007aff; border-radius: 4px; font-size: 12px; padding: 4px 8px; cursor: pointer; color: #007aff;">编辑</button>
                    ${!item.isCore ? `<button class="tc-item-delete-btn" data-id="${item.id}" style="background: none; border: 1px solid #ff3b30; border-radius: 4px; font-size: 12px; padding: 4px 8px; cursor: pointer; color: #ff3b30;">删除</button>` : ''}
                </div>
            `;
            
            listContainer.appendChild(el);
        });

        // Bind events for items
        listContainer.querySelectorAll('.tc-item-select').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const id = e.target.getAttribute('data-id');
                this.toggleSelection(id);
            });
        });

        listContainer.querySelectorAll('.tc-item-move-up-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'), 10);
                this.moveItemUp(index);
            });
        });

        listContainer.querySelectorAll('.tc-item-move-down-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'), 10);
                this.moveItemDown(index);
            });
        });

        listContainer.querySelectorAll('.tc-item-move-top-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'), 10);
                this.moveItemTop(index);
            });
        });

        listContainer.querySelectorAll('.tc-item-move-bottom-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'), 10);
                this.moveItemBottom(index);
            });
        });

        listContainer.querySelectorAll('.tc-item-toggle').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const id = e.target.getAttribute('data-id');
                const item = this.items.find(i => i.id === id);
                if (item) {
                    item.enabled = e.target.checked;
                    this.saveData();
                    this.renderList();
                }
            });
        });

        listContainer.querySelectorAll('.tc-item-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                this.openEditor(id);
            });
        });

        listContainer.querySelectorAll('.tc-item-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (confirm('确定要删除这个条目吗？')) {
                    const id = e.target.getAttribute('data-id');
                    this.items = this.items.filter(i => i.id !== id);
                    
                    const selIndex = this.selectedIds.indexOf(id);
                    if (selIndex !== -1) {
                        this.selectedIds.splice(selIndex, 1);
                    }
                    
                    this.saveData();
                    this.renderList();
                }
            });
        });
    },

    openEditor(itemId = null) {
        const modal = document.getElementById('thought-chain-editor-modal');
        const titleEl = document.getElementById('thought-chain-editor-title');
        
        // Reset form
        document.getElementById('tc-name-input').value = '';
        document.getElementById('tc-position-select').value = 'middle';
        document.getElementById('tc-role-select').value = 'system';
        document.getElementById('tc-content-input').value = '';
        document.getElementById('tc-enabled-switch').checked = true;
        
        this.currentEditId = null;

        if (itemId) {
            const item = this.items.find(i => i.id === itemId);
            if (item) {
                this.currentEditId = item.id;
                titleEl.textContent = '编辑条目';
                document.getElementById('tc-name-input').value = item.name;
                document.getElementById('tc-position-select').value = item.position;
                document.getElementById('tc-role-select').value = item.role;
                document.getElementById('tc-content-input').value = item.content;
                document.getElementById('tc-enabled-switch').checked = item.enabled;
            }
        } else {
            titleEl.textContent = '添加新条目';
        }

        modal.classList.add('visible');
    },

    closeEditor() {
        const modal = document.getElementById('thought-chain-editor-modal');
        if (modal) {
            modal.classList.remove('visible');
        }
        this.currentEditId = null;
    },

    saveEditorItem() {
        const name = document.getElementById('tc-name-input').value.trim();
        const position = document.getElementById('tc-position-select').value;
        const role = document.getElementById('tc-role-select').value;
        const content = document.getElementById('tc-content-input').value.trim();
        const enabled = document.getElementById('tc-enabled-switch').checked;

        if (!name || !content) {
            alert('名称和内容不能为空！');
            return;
        }

        if (this.currentEditId) {
            const item = this.items.find(i => i.id === this.currentEditId);
            if (item) {
                item.name = name;
                item.position = position;
                item.role = role;
                item.content = content;
                item.enabled = enabled;
            }
        } else {
            const newItem = {
                id: 'tc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                name,
                position,
                role,
                content,
                enabled
            };

            let insertIndex = this.items.length;
            if (position === 'head') {
                const lastHeadIndex = this.items.map(i => i.position).lastIndexOf('head');
                insertIndex = lastHeadIndex !== -1 ? lastHeadIndex + 1 : 0;
            } else if (position === 'middle') {
                const lastMiddleIndex = this.items.map(i => i.position).lastIndexOf('middle');
                if (lastMiddleIndex !== -1) {
                    insertIndex = lastMiddleIndex + 1;
                } else {
                    const lastHeadIndex = this.items.map(i => i.position).lastIndexOf('head');
                    insertIndex = lastHeadIndex !== -1 ? lastHeadIndex + 1 : 0;
                }
            }
            
            this.items.splice(insertIndex, 0, newItem);
        }

        this.saveData();
        this.renderList();
        this.closeEditor();
        this.loadPresetsDropdown(); // 更新下拉框状态，可能变为"当前配置 (未保存)"
    },

    getPayloadChunks() {
        if (!this.enabled) return { head: [], middle: [], bottom: [] };

        const chunks = {
            head: [],
            middle: [],
            bottom: []
        };

        this.items.forEach(item => {
            if (item.enabled) {
                if (item.position === 'head') chunks.head.push(item);
                else if (item.position === 'middle') chunks.middle.push(item);
                else if (item.position === 'bottom') chunks.bottom.push(item);
            }
        });

        return chunks;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ThoughtChainManager.init();
});
