// ========== 角色生成器模块 ==========
// 此模块独立于主script.js，用于角色生成功能

(function() {
    'use strict';

    // 生成的角色数据缓存
    let generatedCharacters = [];
    
    // API选择配置（使用主API还是副API）
    let generatorUseSecondaryApi = false;

    // 从localStorage加载API选择
    function loadGeneratorApiChoice() {
        const saved = localStorage.getItem('characterGeneratorUseSecondaryApi');
        if (saved) {
            generatorUseSecondaryApi = saved === 'true';
        }
    }

    // 保存API选择到localStorage
    function saveGeneratorApiChoice() {
        localStorage.setItem('characterGeneratorUseSecondaryApi', generatorUseSecondaryApi.toString());
    }

    // 初始化
    loadGeneratorApiChoice();

    // ========== 打开角色生成器主界面 ==========
    window.openCharacterGeneratorScreen = function() {
        console.log('打开角色生成器');
        
        // 创建角色生成器屏幕（如果不存在）
        let screen = document.getElementById('character-generator-screen');
        if (!screen) {
            screen = createCharacterGeneratorScreen();
            document.getElementById('phone-screen').appendChild(screen);
        }

        // 显示屏幕
        if (typeof window.showScreen === 'function') {
            window.showScreen('character-generator-screen');
        } else {
            // 备用方案
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            screen.classList.add('active');
        }
        
        // 重新加载世界书列表到选择器中
        loadWorldBooksToSelectors();
        
        // 更新API选择可用性
        updateApiChoiceAvailability();
    };

    // ========== 创建角色生成器主界面 ==========
    function createCharacterGeneratorScreen() {
        const screen = document.createElement('div');
        screen.id = 'character-generator-screen';
        screen.className = 'screen';
        screen.innerHTML = `
            <div class="header">
                <span class="back-btn" onclick="showScreen('home-screen')">‹</span>
                <span>角色生成器</span>
                <span style="width: 30px;"></span>
            </div>
            <div class="form-container" style="padding-bottom: 80px;">
                
                <!-- 不希望的特质 -->
                <div class="form-group">
                    <label>不希望角色有的特质</label>
                    <textarea id="gen-negative-traits" placeholder="例如：暴力、粗鲁、冷漠..."></textarea>
                </div>

                <!-- 希望的特质 -->
                <div class="form-group">
                    <label>希望角色一定有的特质 <span style="color: red;">*</span></label>
                    <textarea id="gen-positive-traits" placeholder="例如：善良、幽默、聪明..." required></textarea>
                </div>

                <!-- 角色模板 -->
                <div class="form-group">
                    <label>角色模板</label>
                    <textarea id="gen-character-template" placeholder="输入角色模板或从下方导入..."></textarea>
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button class="form-button form-button-secondary" onclick="window.charGenImportFiles('template', ['txt', 'docx', 'json'])" style="flex: 1;">本地导入</button>
                        <button class="form-button form-button-secondary" onclick="window.charGenImportFromUrl('template')" style="flex: 1;">URL导入</button>
                    </div>
                    <div id="gen-template-files-list" style="margin-top: 10px; font-size: 14px; color: #666;"></div>
                </div>

                <!-- 世界背景 -->
                <div class="form-group">
                    <label>世界背景/时代背景</label>
                    <textarea id="gen-world-background" placeholder="描述故事的世界观、时代背景..."></textarea>
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button class="form-button form-button-secondary" onclick="window.charGenSelectWorldBooks('background')" style="flex: 1;">选择世界书</button>
                        <button class="form-button form-button-secondary" onclick="window.charGenImportFiles('background', ['txt', 'docx', 'json'])" style="flex: 1;">导入文件</button>
                    </div>
                    <div id="gen-background-selections" style="margin-top: 10px; font-size: 14px; color: #666;"></div>
                    <div id="gen-background-files-list" style="margin-top: 5px; font-size: 14px; color: #666;"></div>
                </div>

                <!-- 同人原作 -->
                <div class="form-group">
                    <label>同人相关原作（如适用）</label>
                    <textarea id="gen-fanfic-source" placeholder="如果是同人角色，描述或导入原作信息..."></textarea>
                    <button class="form-button form-button-secondary" onclick="window.charGenImportFiles('fanfic', ['txt', 'docx', 'json'])">导入原作文件</button>
                    <div id="gen-fanfic-files-list" style="margin-top: 10px; font-size: 14px; color: #666;"></div>
                </div>

                <!-- 文风生成 -->
                <div class="form-group">
                    <label>生成文风</label>
                    <textarea id="gen-writing-style" placeholder="描述希望生成的文风、写作手法..."></textarea>
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button class="form-button form-button-secondary" onclick="window.charGenSelectWorldBooks('style')" style="flex: 1;">从世界书选择</button>
                        <button class="form-button form-button-secondary" onclick="window.charGenImportFiles('style', ['txt', 'docx'])" style="flex: 1;">导入文件</button>
                    </div>
                    <div id="gen-style-selections" style="margin-top: 10px; font-size: 14px; color: #666;"></div>
                    <div id="gen-style-files-list" style="margin-top: 5px; font-size: 14px; color: #666;"></div>
                </div>

                <!-- 角色姓名 -->
                <div class="form-group">
                    <label>角色姓名（可选，留空则由AI生成）</label>
                    <input type="text" id="gen-character-name" placeholder="留空由AI自动生成">
                </div>

                <!-- 生成数量 -->
                <div class="form-group">
                    <label>生成数量</label>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="number" id="gen-count" value="1" min="1" max="10" style="width: 80px;">
                        <span style="font-size: 14px; color: #999;">生成多个将消耗对应次数的API调用</span>
                    </div>
                </div>

                <!-- API选择 -->
                <div class="form-group">
                    <label>使用的API</label>
                    <select id="gen-api-choice" onchange="window.saveGeneratorApiSelection()">
                        <option value="primary">使用主API</option>
                        <option value="secondary" id="gen-secondary-api-option">使用副API</option>
                    </select>
                    <div style="font-size: 12px; color: #999; margin-top: 5px;">
                        请在"API设置"中配置主API或副API
                    </div>
                </div>

                <!-- 生成按钮 -->
                <button class="form-button" onclick="window.startCharacterGeneration()" id="gen-start-btn">
                    AI生成角色
                </button>

            </div>
        `;

        return screen;
    }

    // ========== API选择相关 ==========
    window.saveGeneratorApiSelection = function() {
        const select = document.getElementById('gen-api-choice');
        generatorUseSecondaryApi = select.value === 'secondary';
        saveGeneratorApiChoice();
        console.log('API选择已保存:', generatorUseSecondaryApi ? '副API' : '主API');
    };

    // 检查并更新API选择可用性
    async function updateApiChoiceAvailability() {
        // 需要等待页面加载完成
        setTimeout(async () => {
            const select = document.getElementById('gen-api-choice');
            const secondaryOption = document.getElementById('gen-secondary-api-option');
            
            if (!select || !secondaryOption) return;
            
            // 获取API配置
            const apiConfig = await getApiConfig();
            
            // 检查是否有副API配置
            const hasSecondaryApi = apiConfig && 
                                   apiConfig.secondaryProxyUrl && 
                                   apiConfig.secondaryApiKey && 
                                   apiConfig.secondaryModel;
            
            if (!hasSecondaryApi) {
                secondaryOption.disabled = true;
                secondaryOption.textContent = '使用副API（未配置）';
                // 如果当前选择的是副API但副API未配置，切换到主API
                if (generatorUseSecondaryApi) {
                    generatorUseSecondaryApi = false;
                    saveGeneratorApiChoice();
                    select.value = 'primary';
                }
            } else {
                secondaryOption.disabled = false;
                secondaryOption.textContent = '使用副API';
                // 恢复之前的选择
                select.value = generatorUseSecondaryApi ? 'secondary' : 'primary';
            }
        }, 100);
    }

    // ========== 文件导入功能 ==========
    window.charGenImportFiles = function(type, allowedTypes) {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = allowedTypes.map(t => {
            if (t === 'txt') return '.txt';
            if (t === 'docx') return '.docx';
            if (t === 'json') return '.json';
            return '';
        }).join(',');

        input.onchange = async function(e) {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;

            let combinedContent = '';
            let fileNames = [];

            for (const file of files) {
                fileNames.push(file.name);
                const content = await readFileContent(file);
                combinedContent += content + '\n\n';
            }

            // 根据类型填充到对应的文本框
            if (type === 'template') {
                document.getElementById('gen-character-template').value += combinedContent;
                updateFilesList('gen-template-files-list', fileNames);
            } else if (type === 'background') {
                document.getElementById('gen-world-background').value += combinedContent;
                updateFilesList('gen-background-files-list', fileNames);
            } else if (type === 'fanfic') {
                document.getElementById('gen-fanfic-source').value += combinedContent;
                updateFilesList('gen-fanfic-files-list', fileNames);
            } else if (type === 'style') {
                document.getElementById('gen-writing-style').value += combinedContent;
                updateFilesList('gen-style-files-list', fileNames);
            }

            alert(`成功导入 ${files.length} 个文件`);
        };

        input.click();
    };

    // 读取文件内容
    async function readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            if (file.name.endsWith('.json')) {
                reader.onload = function(e) {
                    try {
                        const json = JSON.parse(e.target.result);
                        resolve(JSON.stringify(json, null, 2));
                    } catch (err) {
                        resolve(e.target.result);
                    }
                };
                reader.readAsText(file);
            } else if (file.name.endsWith('.docx')) {
                reader.onload = function(e) {
                    if (typeof mammoth !== 'undefined') {
                        mammoth.extractRawText({arrayBuffer: e.target.result})
                            .then(result => resolve(result.value))
                            .catch(() => resolve('[无法读取DOCX文件]'));
                    } else {
                        resolve('[DOCX解析器未加载]');
                    }
                };
                reader.readAsArrayBuffer(file);
            } else {
                reader.onload = function(e) {
                    resolve(e.target.result);
                };
                reader.readAsText(file);
            }

            reader.onerror = function() {
                reject(new Error('文件读取失败'));
            };
        });
    }

    // 更新文件列表显示
    function updateFilesList(elementId, fileNames) {
        const element = document.getElementById(elementId);
        if (!element) return;

        if (!element.dataset.files) {
            element.dataset.files = '[]';
        }

        const existingFiles = JSON.parse(element.dataset.files);
        const allFiles = [...existingFiles, ...fileNames];
        element.dataset.files = JSON.stringify(allFiles);

        element.innerHTML = '已导入: ' + allFiles.join(', ');
    }

    // ========== URL导入功能 ==========
    window.charGenImportFromUrl = async function(type) {
        const url = prompt('请输入URL地址:');
        if (!url) return;

        try {
            const response = await fetch(url);
            const content = await response.text();

            if (type === 'template') {
                document.getElementById('gen-character-template').value += content + '\n\n';
            }

            alert('导入成功');
        } catch (error) {
            alert('导入失败: ' + error.message);
        }
    };

    // ========== 选择世界书功能 ==========
    window.charGenSelectWorldBooks = async function(type) {
        console.log('选择世界书:', type);
        
        let screen = document.getElementById('gen-worldbook-selector-screen');
        if (!screen) {
            screen = createWorldBookSelectorScreen();
            document.getElementById('phone-screen').appendChild(screen);
        }

        // 设置当前选择类型
        screen.dataset.selectionType = type;

        // 先显示屏幕
        if (typeof window.showScreen === 'function') {
            window.showScreen('gen-worldbook-selector-screen');
        }

        // 加载世界书列表（异步）
        await loadWorldBooksForSelection();
    };

    function createWorldBookSelectorScreen() {
        const screen = document.createElement('div');
        screen.id = 'gen-worldbook-selector-screen';
        screen.className = 'screen';
        screen.innerHTML = `
            <div class="header">
                <span class="back-btn" onclick="showScreen('character-generator-screen')">‹</span>
                <span>选择世界书</span>
                <span class="action-btn" onclick="window.confirmWorldBookSelection()">确定</span>
            </div>
            <div id="gen-worldbook-list" class="list-container">
                <!-- 世界书列表将在这里动态生成 -->
            </div>
        `;

        return screen;
    }

    async function loadWorldBooksForSelection() {
        const container = document.getElementById('gen-worldbook-list');
        if (!container) {
            console.error('世界书列表容器未找到');
            return;
        }

        // 显示加载提示
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 50px 20px;">加载中...</p>';

        // 从IndexedDB获取世界书
        let worldBooks = [];
        
        try {
            // 检查window.db是否存在
            if (!window.db) {
                console.error('window.db 未初始化');
                container.innerHTML = '<p style="text-align: center; color: #f44; padding: 50px 20px;">数据库未初始化，请刷新页面重试</p>';
                return;
            }
            
            if (!window.db.worldBooks) {
                console.error('window.db.worldBooks 不存在');
                container.innerHTML = '<p style="text-align: center; color: #f44; padding: 50px 20px;">世界书数据表不存在</p>';
                return;
            }
            
            worldBooks = await window.db.worldBooks.toArray();
            console.log('从IndexedDB加载世界书成功:', worldBooks.length, '个');
            console.log('世界书详情:', worldBooks);
            
        } catch (e) {
            console.error('从IndexedDB获取世界书失败:', e);
            container.innerHTML = '<p style="text-align: center; color: #f44; padding: 50px 20px;">加载失败: ' + e.message + '</p>';
            return;
        }

        if (worldBooks.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #999; padding: 50px 20px;">暂无世界书<br><br>请先在主屏幕的"世界书"应用中创建世界书</p>';
            return;
        }

        container.innerHTML = worldBooks.map(book => {
            // 处理content字段（可能是数组或字符串）
            let contentPreview = '';
            if (Array.isArray(book.content)) {
                // 如果是数组，获取条目数量
                contentPreview = `包含 ${book.content.length} 个条目`;
            } else if (typeof book.content === 'string') {
                // 如果是字符串，截取前100个字符
                contentPreview = book.content.substring(0, 100);
                if (book.content.length > 100) contentPreview += '...';
            } else {
                contentPreview = '无内容';
            }
            
            return `
                <div class="list-item" style="display: flex; align-items: center; gap: 10px; padding: 15px; border-bottom: 1px solid var(--border-color);">
                    <input type="checkbox" 
                           data-worldbook-id="${book.id}" 
                           data-worldbook-name="${escapeHTML(book.name)}"
                           style="width: 20px; height: 20px;">
                    <div style="flex: 1;">
                        <div class="item-title" style="font-weight: 600; margin-bottom: 5px;">${escapeHTML(book.name)}</div>
                        <div class="item-content" style="font-size: 13px; color: #666;">${escapeHTML(contentPreview)}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    window.confirmWorldBookSelection = async function() {
        const screen = document.getElementById('gen-worldbook-selector-screen');
        const type = screen.dataset.selectionType;

        const checkboxes = document.querySelectorAll('#gen-worldbook-list input[type="checkbox"]:checked');
        const selectedBooks = Array.from(checkboxes).map(cb => {
            // 尝试将id转换为数字，如果不是数字则保持原样
            let bookId = cb.dataset.worldbookId;
            const numId = Number(bookId);
            if (!isNaN(numId)) {
                bookId = numId;
            }
            return {
                id: bookId,
                name: cb.dataset.worldbookName
            };
        });

        if (selectedBooks.length === 0) {
            alert('请至少选择一个世界书');
            return;
        }

        // 从IndexedDB获取选中的世界书内容
        let combinedContent = '';
        
        try {
            if (window.db && window.db.worldBooks) {
                for (const book of selectedBooks) {
                    const bookData = await window.db.worldBooks.get(book.id);
                    if (bookData) {
                        // 处理content字段（可能是数组或字符串）
                        let contentText = '';
                        if (Array.isArray(bookData.content)) {
                            // 如果是数组，将每个条目格式化输出
                            contentText = bookData.content.map((entry, index) => {
                                if (typeof entry === 'object' && entry !== null) {
                                    // 如果条目是对象，尝试提取关键信息
                                    if (entry.keyword && entry.content) {
                                        return `[${entry.keyword}]\n${entry.content}`;
                                    } else if (entry.key && entry.value) {
                                        return `[${entry.key}]\n${entry.value}`;
                                    } else {
                                        // 否则转为可读的JSON格式
                                        return JSON.stringify(entry, null, 2);
                                    }
                                } else if (typeof entry === 'string') {
                                    return entry;
                                } else {
                                    return String(entry);
                                }
                            }).join('\n\n');
                        } else if (typeof bookData.content === 'string') {
                            contentText = bookData.content;
                        } else if (bookData.content) {
                            contentText = JSON.stringify(bookData.content);
                        } else {
                            contentText = '';
                        }
                        
                        combinedContent += `\n\n=== ${bookData.name} ===\n${contentText}`;
                    } else {
                        console.warn('未找到世界书:', book.id, book.name);
                    }
                }
            }
        } catch (e) {
            console.error('从IndexedDB获取世界书内容失败:', e);
            alert('获取世界书内容失败，请重试');
            return;
        }

        // 填充到对应文本框
        if (type === 'background') {
            document.getElementById('gen-world-background').value += combinedContent;
            document.getElementById('gen-background-selections').innerHTML = 
                '已选择: ' + selectedBooks.map(b => b.name).join(', ');
        } else if (type === 'style') {
            document.getElementById('gen-writing-style').value += combinedContent;
            document.getElementById('gen-style-selections').innerHTML = 
                '已选择: ' + selectedBooks.map(b => b.name).join(', ');
        }

        if (typeof window.showScreen === 'function') {
            window.showScreen('character-generator-screen');
        }
    };

    // 加载世界书到选择器（用于初始化）
    function loadWorldBooksToSelectors() {
        // 预加载世界书数据，以便后续快速使用
        console.log('世界书数据已准备');
    }

    // 获取API配置（从IndexedDB读取）
    async function getApiConfig() {
        try {
            // 检查window.db是否存在
            if (!window.db) {
                console.error('IndexedDB (window.db) 未初始化');
                return null;
            }

            console.log('从IndexedDB读取API配置...');
            
            // 从IndexedDB读取apiConfig
            const apiConfig = await window.db.apiConfig.get('main');
            
            console.log('IndexedDB返回的配置:', apiConfig);

            if (!apiConfig) {
                console.error('IndexedDB中未找到API配置');
                return null;
            }

            const config = {
                proxyUrl: apiConfig.proxyUrl || '',
                apiKey: apiConfig.apiKey || '',
                model: apiConfig.model || '',
                secondaryProxyUrl: apiConfig.secondaryProxyUrl || '',
                secondaryApiKey: apiConfig.secondaryApiKey || '',
                secondaryModel: apiConfig.secondaryModel || ''
            };

            console.log('解析后的API配置:', {
                proxyUrl: config.proxyUrl,
                hasApiKey: !!config.apiKey,
                apiKeyLength: config.apiKey.length,
                model: config.model,
                secondaryProxyUrl: config.secondaryProxyUrl,
                hasSecondaryApiKey: !!config.secondaryApiKey,
                secondaryModel: config.secondaryModel
            });

            return config;
        } catch (error) {
            console.error('读取API配置时出错:', error);
            return null;
        }
    }

    // ========== 开始生成角色 ==========
    window.startCharacterGeneration = async function() {
        // 详细检查API配置
        console.log('开始角色生成流程');
        console.log('使用副API:', generatorUseSecondaryApi);
        
        // 获取API配置
        const apiConfig = await getApiConfig();
        console.log('getApiConfig()返回:', apiConfig);
        
        if (!apiConfig) {
            alert('无法获取API配置\n\n请确保已在"API设置"中配置了主API或副API\n\n可能原因：DOM元素未找到（proxy-url, api-key, model-select）');
            return;
        }

        // 根据选择获取API配置
        const useSecondaryApi = generatorUseSecondaryApi && 
                               apiConfig.secondaryProxyUrl && 
                               apiConfig.secondaryApiKey && 
                               apiConfig.secondaryModel;
        
        console.log('副API检查:', {
            generatorUseSecondaryApi: generatorUseSecondaryApi,
            hasSecondaryProxyUrl: !!apiConfig.secondaryProxyUrl,
            hasSecondaryApiKey: !!apiConfig.secondaryApiKey,
            hasSecondaryModel: !!apiConfig.secondaryModel,
            useSecondaryApi: useSecondaryApi
        });
        
        const { proxyUrl, apiKey, model } = useSecondaryApi
            ? {
                proxyUrl: apiConfig.secondaryProxyUrl,
                apiKey: apiConfig.secondaryApiKey,
                model: apiConfig.secondaryModel
              }
            : {
                proxyUrl: apiConfig.proxyUrl,
                apiKey: apiConfig.apiKey,
                model: apiConfig.model
              };

        console.log('最终使用的API配置:', {
            使用API: useSecondaryApi ? '副API' : '主API',
            proxyUrl: proxyUrl,
            proxyUrlLength: proxyUrl ? proxyUrl.length : 0,
            hasApiKey: !!apiKey,
            apiKeyLength: apiKey ? apiKey.length : 0,
            model: model,
            modelLength: model ? model.length : 0
        });

        if (!proxyUrl || !apiKey || !model) {
            const errorMsg = '请先在"API设置"中配置' + (generatorUseSecondaryApi ? '副API' : '主API') + '\n\n' +
                           '当前状态:\n' +
                           'proxyUrl: ' + (proxyUrl || '空') + '\n' +
                           'apiKey: ' + (apiKey ? '已设置(' + apiKey.length + '字符)' : '空') + '\n' +
                           'model: ' + (model || '空');
            alert(errorMsg);
            return;
        }
        
        console.log('✓ API配置验证通过，继续执行');

        // 获取必填字段
        const positiveTraits = document.getElementById('gen-positive-traits').value.trim();
        if (!positiveTraits) {
            alert('请填写希望角色一定有的特质');
            return;
        }

        console.log('必填字段验证通过');

        // 获取所有输入
        const negativeTraits = document.getElementById('gen-negative-traits').value.trim();
        const characterTemplate = document.getElementById('gen-character-template').value.trim();
        const worldBackground = document.getElementById('gen-world-background').value.trim();
        const fanficSource = document.getElementById('gen-fanfic-source').value.trim();
        const writingStyle = document.getElementById('gen-writing-style').value.trim();
        const characterName = document.getElementById('gen-character-name').value.trim();
        const genCount = parseInt(document.getElementById('gen-count').value) || 1;

        // 确认生成数量
        if (genCount > 1) {
            if (!confirm(`将生成 ${genCount} 个角色，这会消耗 ${genCount} 次API调用。是否继续？`)) {
                return;
            }
        }

        // 构建提示词
        const prompt = buildCharacterGenerationPrompt({
            negativeTraits,
            positiveTraits,
            characterTemplate,
            worldBackground,
            fanficSource,
            writingStyle,
            characterName
        });

        // 显示加载状态
        const btn = document.getElementById('gen-start-btn');
        const originalText = btn.textContent;
        btn.textContent = '生成中...';
        btn.disabled = true;

        try {
            // 清空之前的结果
            generatedCharacters = [];

            console.log(`准备生成 ${genCount} 个角色`);

            // 生成角色
            for (let i = 0; i < genCount; i++) {
                btn.textContent = `生成中... (${i + 1}/${genCount})`;
                console.log(`开始生成第 ${i + 1} 个角色`);
                
                const character = await generateCharacterWithApi(prompt);
                generatedCharacters.push(character);
                
                console.log(`第 ${i + 1} 个角色生成成功`);
            }

            console.log('所有角色生成完成，准备显示结果');

            // 显示结果
            showGeneratedCharacters();

        } catch (error) {
            console.error('生成失败 - 完整错误:', error);
            console.error('错误堆栈:', error.stack);
            
            // 更友好的错误提示
            let errorMsg = '角色生成失败\n\n';
            errorMsg += error.message || '未知错误';
            errorMsg += '\n\n详细信息已输出到控制台，请按F12查看';
            
            alert(errorMsg);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    };

    // 构建生成提示词
    function buildCharacterGenerationPrompt(data) {
        let prompt = '请根据以下要求生成一个角色描述：\n\n';

        if (data.positiveTraits) {
            prompt += `必须具有的特质：${data.positiveTraits}\n\n`;
        }

        if (data.negativeTraits) {
            prompt += `不应具有的特质：${data.negativeTraits}\n\n`;
        }

        if (data.characterTemplate) {
            prompt += `参考模板：\n${data.characterTemplate}\n\n`;
        }

        if (data.worldBackground) {
            prompt += `世界背景：\n${data.worldBackground}\n\n`;
        }

        if (data.fanficSource) {
            prompt += `同人原作信息：\n${data.fanficSource}\n\n`;
        }

        if (data.writingStyle) {
            prompt += `文风要求：\n${data.writingStyle}\n\n`;
        }

        if (data.characterName) {
            prompt += `角色姓名：${data.characterName}\n\n`;
        } else {
            prompt += `请为角色起一个合适的名字。\n\n`;
        }

        prompt += `请生成详细的角色描述，包括：
- 姓名
- 外貌特征
- 性格特点
- 背景故事
- 能力特长
- 其他相关信息

请以结构化的方式输出，便于后续使用。`;

        return prompt;
    }

    // 调用API生成角色（使用和script.js相同的方式）
    async function generateCharacterWithApi(prompt) {
        // 获取API配置
        const apiConfig = await getApiConfig();
        if (!apiConfig) {
            throw new Error('无法获取API配置');
        }

        const useSecondaryApi = generatorUseSecondaryApi && 
                               apiConfig.secondaryProxyUrl && 
                               apiConfig.secondaryApiKey && 
                               apiConfig.secondaryModel;
        
        const { proxyUrl, apiKey, model } = useSecondaryApi
            ? {
                proxyUrl: apiConfig.secondaryProxyUrl,
                apiKey: apiConfig.secondaryApiKey,
                model: apiConfig.secondaryModel
              }
            : apiConfig;

        if (!proxyUrl || !apiKey || !model) {
            throw new Error('API配置不完整');
        }

        console.log('发送API请求到:', proxyUrl);
        console.log('使用模型:', model);

        // 检查是否是Gemini API
        let isGemini = proxyUrl.includes('generativelanguage');
        let response;

        if (isGemini) {
            // Gemini格式
            const payload = {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    maxOutputTokens: 8000,
                    temperature: 0.8
                }
            };
            console.log('使用Gemini格式，请求体:', JSON.stringify(payload, null, 2));
            
            response = await fetch(`${proxyUrl}/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
        } else {
            // OpenAI格式
            const payload = {
                model: model,
                messages: [{
                    role: 'user',
                    content: prompt
                }],
                temperature: 0.8,
                max_tokens: 8000
            };
            console.log('使用OpenAI格式，请求体:', JSON.stringify(payload, null, 2));
            
            response = await fetch(`${proxyUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(payload)
            });
        }

        console.log('收到响应，状态码:', response.status);

        if (!response.ok) {
            let errorText;
            try {
                const errorData = await response.json();
                errorText = JSON.stringify(errorData);
                console.error('API错误响应:', errorData);
            } catch (e) {
                errorText = await response.text();
                console.error('API错误响应(文本):', errorText);
            }
            throw new Error(`API请求失败 (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        console.log('API响应数据:', data);
        
        // 提取内容
        let content = null;
        
        if (isGemini) {
            // Gemini响应格式
            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
                content = data.candidates[0].content.parts.map(part => part.text).join('');
                
                // 检查是否因为长度限制而被截断
                const finishReason = data.candidates[0].finishReason;
                console.log('Gemini完成原因:', finishReason);
                
                if (finishReason === 'MAX_TOKENS') {
                    console.warn('警告：生成因达到token限制而被截断');
                }
            }
        } else {
            // OpenAI响应格式
            if (data.choices && data.choices[0] && data.choices[0].message) {
                content = data.choices[0].message.content;
                
                // 检查是否因为长度限制而被截断
                const finishReason = data.choices[0].finish_reason;
                console.log('OpenAI完成原因:', finishReason);
                
                if (finishReason === 'length') {
                    console.warn('警告：生成因达到token限制而被截断');
                }
            }
        }

        if (!content) {
            console.error('无法从响应中提取内容，响应数据:', data);
            throw new Error('API返回格式错误，无法提取生成的内容');
        }
        
        console.log('成功提取内容，长度:', content.length, '字符');

        return {
            id: Date.now() + Math.random(),
            content: content,
            timestamp: new Date().toISOString()
        };
    }

    // ========== 显示生成结果 ==========
    function showGeneratedCharacters() {
        let screen = document.getElementById('gen-results-screen');
        if (!screen) {
            screen = createGeneratedResultsScreen();
            document.getElementById('phone-screen').appendChild(screen);
        }

        updateGeneratedResultsList();
        if (typeof window.showScreen === 'function') {
            window.showScreen('gen-results-screen');
        }
    }

    function createGeneratedResultsScreen() {
        const screen = document.createElement('div');
        screen.id = 'gen-results-screen';
        screen.className = 'screen';
        screen.innerHTML = `
            <div class="header">
                <span class="back-btn" onclick="showScreen('character-generator-screen')">‹</span>
                <span>生成结果</span>
                <span style="width: 30px;"></span>
            </div>
            <div id="gen-results-list" class="list-container">
                <!-- 生成结果将在这里显示 -->
            </div>
        `;

        return screen;
    }

    function updateGeneratedResultsList() {
        const container = document.getElementById('gen-results-list');
        if (!container) return;

        if (generatedCharacters.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #999; padding: 50px 20px;">暂无生成结果</p>';
            return;
        }

        container.innerHTML = generatedCharacters.map((char, index) => `
            <div style="background: #fff; border: 1px solid var(--border-color); border-radius: 12px; padding: 15px; margin-bottom: 15px;">
                <div style="font-weight: 600; font-size: 16px; margin-bottom: 10px;">角色 ${index + 1}</div>
                <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 15px; white-space: pre-wrap; max-height: 300px; overflow-y: auto; font-size: 14px; line-height: 1.6;">${escapeHTML(char.content)}</div>
                <div style="display: flex; gap: 10px;">
                    <button onclick="window.addGeneratedAsCharacter(${index})" 
                            class="form-button" 
                            style="flex: 1; padding: 10px; font-size: 14px;">
                        添加为角色
                    </button>
                    <button onclick="window.addGeneratedAsNpc(${index})" 
                            class="form-button form-button-secondary" 
                            style="flex: 1; padding: 10px; font-size: 14px;">
                        添加到NPC库
                    </button>
                </div>
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button onclick="window.addGeneratedAsUsePreset(${index})" 
                            class="form-button form-button-secondary" 
                            style="flex: 1; padding: 10px; font-size: 14px;">
                        添加为Use预设
                    </button>
                    <button onclick="window.discardGenerated(${index})" 
                            class="form-button form-button-secondary" 
                            style="flex: 1; padding: 10px; font-size: 14px; background: #ff3b30; color: white;">
                        丢弃
                    </button>
                </div>
            </div>
        `).join('');
    }

    // ========== 添加生成结果为角色 ==========
    window.addGeneratedAsCharacter = function(index) {
        const character = generatedCharacters[index];
        if (!character) return;

        // 调用主script.js中的创建角色功能
        // 这里假设主script.js有一个全局函数来打开角色创建界面
        if (typeof window.openCreateCharacterWithData === 'function') {
            window.openCreateCharacterWithData({
                description: character.content
            });
        } else {
            // 备用方案：直接跳转到聊天列表并提示
            alert('角色描述已复制，请手动创建角色');
            copyToClipboard(character.content);
            if (typeof window.showScreen === 'function') {
                window.showScreen('chat-list-screen');
            }
        }

        // 从列表中移除
        generatedCharacters.splice(index, 1);
        updateGeneratedResultsList();
    };

    // ========== 添加为NPC ==========
    window.addGeneratedAsNpc = function(index) {
        const character = generatedCharacters[index];
        if (!character) return;

        // 提取角色名称（简单的启发式方法）
        const lines = character.content.split('\n');
        let characterName = '未命名角色';
        for (const line of lines) {
            if (line.includes('姓名') || line.includes('名字') || line.includes('Name')) {
                const match = line.match(/[:：]\s*(.+)/);
                if (match) {
                    characterName = match[1].trim();
                    break;
                }
            }
        }

        // 创建NPC
        const npc = {
            id: Date.now(),
            name: characterName,
            description: character.content,
            avatar: 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg', // 默认头像
            createdAt: new Date().toISOString()
        };

        // 保存到localStorage
        const npcKey = 'npc_' + npc.id;
        localStorage.setItem(npcKey, JSON.stringify(npc));

        alert('已添加到NPC库: ' + characterName);

        // 从列表中移除
        generatedCharacters.splice(index, 1);
        updateGeneratedResultsList();
    };

    // ========== 添加为Use预设 ==========
    window.addGeneratedAsUsePreset = function(index) {
        const character = generatedCharacters[index];
        if (!character) return;

        // 提取角色名称
        const lines = character.content.split('\n');
        let characterName = '未命名角色';
        for (const line of lines) {
            if (line.includes('姓名') || line.includes('名字') || line.includes('Name')) {
                const match = line.match(/[:：]\s*(.+)/);
                if (match) {
                    characterName = match[1].trim();
                    break;
                }
            }
        }

        // 创建Use预设
        const preset = {
            id: Date.now(),
            name: characterName,
            description: character.content,
            createdAt: new Date().toISOString()
        };

        // 保存到localStorage (假设主script.js使用 'usePreset_' 前缀)
        const presetKey = 'usePreset_' + preset.id;
        localStorage.setItem(presetKey, JSON.stringify(preset));

        alert('已添加为Use预设: ' + characterName);

        // 从列表中移除
        generatedCharacters.splice(index, 1);
        updateGeneratedResultsList();
    };

    // ========== 丢弃生成结果 ==========
    window.discardGenerated = function(index) {
        if (!confirm('确定丢弃此角色？')) return;

        generatedCharacters.splice(index, 1);
        updateGeneratedResultsList();

        if (generatedCharacters.length === 0) {
            if (typeof window.showScreen === 'function') {
                window.showScreen('character-generator-screen');
            }
        }
    };

    // ========== 工具函数 ==========
    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
    }

    // ========== 初始化完成 ==========
    console.log('角色生成器模块已加载');

})();
