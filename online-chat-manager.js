// ========================================
// 联机功能管理器
// ========================================

class OnlineChatManager {
    constructor() {
        this.ws = null;
        this.userId = null;
        this.nickname = null;
        this.avatar = null;
        this.serverUrl = null;
        this.isConnected = false;
        this.friendRequests = []; // 好友申请列表
        this.onlineFriends = []; // 联机好友列表
        this.groupChats = []; // 群聊列表
        this.reconnectTimer = null;
        this.heartbeatTimer = null;
        this.shouldAutoReconnect = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 999;
        this.heartbeatMissed = 0;
        this.maxHeartbeatMissed = 3;
        this.lastHeartbeatTime = null;
    }

    // 等待数据库就绪的辅助函数
    async waitForDatabase(timeout = 10000) {
        const startTime = Date.now();
        
        // 循环检查数据库是否真正就绪
        while (Date.now() - startTime < timeout) {
            // 检查数据库对象和chats表是否存在（注意：此应用不使用独立的messages表）
            if (window.db && 
                window.db.chats && 
                typeof window.db.chats.get === 'function' &&
                typeof window.db.chats.put === 'function') {
                console.log('数据库和chats表已就绪');
                return window.db;
            }
            
            // 如果有 dbReadyPromise 并且还没完成，等待它
            if (window.dbReadyPromise && !window.dbReady) {
                try {
                    await window.dbReadyPromise;
                    // 等待完成后再检查一次
                    continue;
                } catch (err) {
                    console.error('dbReadyPromise 失败:', err);
                }
            }
            
            // 等待 50ms 后再检查
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // 超时后抛出错误
        throw new Error('数据库初始化超时，请刷新页面重试');
    }

    // 压缩图片的辅助函数
    async compressImage(file, maxWidth = 200, maxHeight = 200, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const img = new Image();
                
                img.onload = () => {
                    // 创建canvas进行压缩
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    
                    // 计算缩放比例，保持宽高比
                    if (width > height) {
                        if (width > maxWidth) {
                            height = height * (maxWidth / width);
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxHeight) {
                            width = width * (maxHeight / height);
                            height = maxHeight;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // 转换为base64，使用JPEG格式压缩
                    const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                    
                    console.log('图片压缩完成，原始大小:', e.target.result.length, '压缩后大小:', compressedBase64.length);
                    resolve(compressedBase64);
                };
                
                img.onerror = () => {
                    reject(new Error('图片加载失败'));
                };
                
                img.src = e.target.result;
            };
            
            reader.onerror = () => {
                reject(new Error('文件读取失败'));
            };
            
            reader.readAsDataURL(file);
        });
    }

    // 【新增】获取安全的头像（检查大小，过大则返回默认头像）
    getSafeAvatar() {
        let avatarToSend = this.avatar || '';
        
        // 如果是 base64 格式，检查大小
        if (avatarToSend && avatarToSend.startsWith('data:image/')) {
            const avatarSize = avatarToSend.length;
            if (avatarSize > 500 * 1024) { // 如果头像超过500KB
                console.warn('头像太大（' + Math.round(avatarSize/1024) + 'KB），使用默认头像');
                return 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
            }
        }
        
        return avatarToSend;
    }


    // 初始化UI事件监听
    initUI() {
        // 启用联机开关
        const enableSwitch = document.getElementById('enable-online-chat-switch');
        const detailsDiv = document.getElementById('online-chat-details');
        
        if (enableSwitch) {
            enableSwitch.addEventListener('change', (e) => {
                detailsDiv.style.display = e.target.checked ? 'block' : 'none';
                
                // 【关键修复】关闭开关时，彻底断开连接并停止一切自动重连
                if (!e.target.checked) {
                    this.shouldAutoReconnect = false;
                    this.reconnectAttempts = 0;
                    if (this.reconnectTimer) {
                        clearTimeout(this.reconnectTimer);
                        this.reconnectTimer = null;
                    }
                    if (this.heartbeatTimer) {
                        clearInterval(this.heartbeatTimer);
                        this.heartbeatTimer = null;
                    }
                    if (this.ws) {
                        this.isConnected = false;
                        try { this.ws.close(); } catch(e) {}
                        this.ws = null;
                    }
                    const statusSpan = document.getElementById('online-connection-status');
                    const connectBtn = document.getElementById('connect-online-btn');
                    const disconnectBtn = document.getElementById('disconnect-online-btn');
                    if (statusSpan) { statusSpan.textContent = '未连接'; statusSpan.className = 'disconnected'; }
                    if (connectBtn) connectBtn.style.display = 'inline-block';
                    if (disconnectBtn) disconnectBtn.style.display = 'none';
                    console.log('联机开关已关闭，已彻底断开连接');
                    
                    // 【关键】关闭联机时，恢复原始发送按钮，移除拦截器
                    if (typeof window._restoreOriginalSendBtn === 'function') {
                        window._restoreOriginalSendBtn();
                    }
                } else {
                    // 【关键】开启联机时，重新初始化消息拦截器
                    if (typeof window._initOnlineChatIntegration === 'function') {
                        window._initOnlineChatIntegration();
                    }
                }
                
                this.saveSettings();
            });
        }

        // 上传头像按钮
        const uploadAvatarBtn = document.getElementById('upload-online-avatar-btn');
        const resetAvatarBtn = document.getElementById('reset-online-avatar-btn');
        const avatarInput = document.getElementById('online-avatar-input');
        const avatarPreview = document.getElementById('my-online-avatar-preview');
        
        if (uploadAvatarBtn && avatarInput) {
            uploadAvatarBtn.addEventListener('click', () => {
                avatarInput.click();
            });
            
            avatarInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        // 压缩图片以减小大小
                        const compressedBase64 = await this.compressImage(file, 200, 200, 0.8);
                        this.avatar = compressedBase64;
                        avatarPreview.src = this.avatar;
                        this.saveSettings();
                        
                        // 如果已经连接，需要重新连接以更新头像
                        if (this.isConnected) {
                            console.log('头像已更新，正在重新注册...');
                            // 重新发送注册消息更新头像，使用安全的头像
                            this.send({
                                type: 'register',
                                userId: this.userId,
                                nickname: this.nickname,
                                avatar: this.getSafeAvatar()
                            });
                        }
                        
                        console.log('头像上传成功');
                    } catch (error) {
                        console.error('头像上传失败:', error);
                        alert('头像上传失败: ' + error.message);
                    }
                }
                // 清空input，允许重复选择同一个文件
                e.target.value = '';
            });
        }
        
        // 重置头像按钮
        if (resetAvatarBtn) {
            resetAvatarBtn.addEventListener('click', () => {
                const defaultAvatar = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
                this.avatar = defaultAvatar;
                avatarPreview.src = defaultAvatar;
                this.saveSettings();
                
                // 如果已经连接，重新注册以更新头像
                if (this.isConnected) {
                    console.log('头像已重置，正在重新注册...');
                    this.send({
                        type: 'register',
                        userId: this.userId,
                        nickname: this.nickname,
                        avatar: this.avatar // 默认头像一定是安全的
                    });
                }
                
                console.log('头像已重置为默认头像');
            });
        }

        // 连接服务器按钮
        const connectBtn = document.getElementById('connect-online-btn');
        const disconnectBtn = document.getElementById('disconnect-online-btn');
        
        if (connectBtn) {
            connectBtn.addEventListener('click', () => this.connect());
        }
        
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => this.disconnect());
        }

        // 搜索好友按钮
        const searchBtn = document.getElementById('search-friend-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.searchFriend());
        }

        // 好友申请按钮
        const requestsBtn = document.getElementById('open-friend-requests-btn');
        if (requestsBtn) {
            requestsBtn.addEventListener('click', () => this.openFriendRequestsModal());
        }

        // 查看好友列表按钮
        const viewFriendsBtn = document.getElementById('view-online-friends-btn');
        if (viewFriendsBtn) {
            viewFriendsBtn.addEventListener('click', () => this.openOnlineFriendsModal());
        }

        // 创建群聊按钮
        const createGroupBtn = document.getElementById('create-group-chat-btn');
        if (createGroupBtn) {
            createGroupBtn.addEventListener('click', () => this.openCreateGroupModal());
        }

        // 清理所有旧数据按钮
        const clearOnlineCacheBtn = document.getElementById('clear-online-cache-btn');
        if (clearOnlineCacheBtn) {
            clearOnlineCacheBtn.addEventListener('click', () => this.clearAllOldData());
        }

        // 重置联机数据按钮
        const resetOnlineDataBtn = document.getElementById('reset-online-data-btn');
        if (resetOnlineDataBtn) {
            resetOnlineDataBtn.addEventListener('click', () => this.resetOnlineData());
        }

        // 加载保存的设置
        this.loadSettings();
        
        // 【新增】监听页面可见性变化
        this.setupVisibilityListener();
        
        // 【新增】监听页面刷新/关闭事件
        this.setupBeforeUnloadListener();
        
        // 【新增】如果之前已连接，自动重连
        this.autoReconnectIfNeeded();
    }

    // 保存设置到localStorage
    saveSettings() {
        try {
            const settings = {
                enabled: document.getElementById('enable-online-chat-switch')?.checked || false,
                userId: document.getElementById('my-online-id')?.value || '',
                nickname: document.getElementById('my-online-nickname')?.value || '',
                avatar: this.avatar || '',
                serverUrl: document.getElementById('online-server-url')?.value || '',
                wasConnected: this.shouldAutoReconnect // 【新增】保存连接状态
            };
            
            // 【修复】检查localStorage空间，如果头像太大则不保存头像
            const settingsStr = JSON.stringify(settings);
            if (settingsStr.length > 5 * 1024 * 1024) { // 如果超过5MB
                console.warn('设置数据过大，头像将不被保存到localStorage');
                settings.avatar = ''; // 清空头像，避免localStorage溢出
            }
            
            localStorage.setItem('ephone-online-settings', JSON.stringify(settings));
            console.log('联机设置已保存');
        } catch (error) {
            console.error('保存联机设置失败:', error);
            // 如果保存失败（可能是localStorage满了），尝试只保存关键信息
            try {
                const minimalSettings = {
                    enabled: document.getElementById('enable-online-chat-switch')?.checked || false,
                    userId: document.getElementById('my-online-id')?.value || '',
                    nickname: document.getElementById('my-online-nickname')?.value || '',
                    avatar: '', // 不保存头像
                    serverUrl: document.getElementById('online-server-url')?.value || '',
                    wasConnected: this.shouldAutoReconnect
                };
                localStorage.setItem('ephone-online-settings', JSON.stringify(minimalSettings));
                console.log('已保存简化版设置（不含头像）');
            } catch (err) {
                console.error('保存简化版设置也失败:', err);
                alert('保存设置失败，可能是浏览器存储空间不足');
            }
        }
    }

    // 加载设置
    loadSettings() {
        const saved = localStorage.getItem('ephone-online-settings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                
                const enableSwitch = document.getElementById('enable-online-chat-switch');
                const detailsDiv = document.getElementById('online-chat-details');
                const userIdInput = document.getElementById('my-online-id');
                const nicknameInput = document.getElementById('my-online-nickname');
                const avatarPreview = document.getElementById('my-online-avatar-preview');
                const serverUrlInput = document.getElementById('online-server-url');
                
                if (enableSwitch) {
                    enableSwitch.checked = settings.enabled;
                    detailsDiv.style.display = settings.enabled ? 'block' : 'none';
                }
                
                // 【优化】如果没有保存的用户ID，使用设备ID作为默认值
                if (userIdInput) {
                    if (settings.userId) {
                        userIdInput.value = settings.userId;
                        this.userId = settings.userId; // 【修复】先设置userId，确保后续加载好友数据时key正确
                    } else if (typeof EPHONE_DEVICE_ID !== 'undefined' && EPHONE_DEVICE_ID) {
                        // 使用设备ID的前12位作为默认ID（去掉连字符）
                        const defaultId = EPHONE_DEVICE_ID.replace(/-/g, '').substring(0, 12);
                        userIdInput.value = defaultId;
                        this.userId = defaultId;
                        console.log('使用设备ID生成默认用户ID:', defaultId);
                    } else {
                        userIdInput.value = '';
                    }
                }
                if (nicknameInput) nicknameInput.value = settings.nickname || '';
                if (serverUrlInput) serverUrlInput.value = settings.serverUrl || '';
                
                // 【修复】加载头像时进行验证，如果头像无效则使用默认头像
                if (settings.avatar && avatarPreview) {
                    try {
                        // 验证头像是否为有效的URL或base64
                        if (settings.avatar.startsWith('data:image/') || settings.avatar.startsWith('http')) {
                            this.avatar = settings.avatar;
                            avatarPreview.src = settings.avatar;
                        } else {
                            // 无效格式，使用默认头像
                            console.warn('保存的头像格式无效，使用默认头像');
                            this.avatar = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
                            avatarPreview.src = this.avatar;
                        }
                    } catch (error) {
                        console.error('加载头像失败:', error);
                        this.avatar = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
                        avatarPreview.src = this.avatar;
                    }
                } else {
                    // 没有保存的头像，使用默认头像
                    this.avatar = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
                    if (avatarPreview) {
                        avatarPreview.src = this.avatar;
                    }
                }
                
                // 【新增】恢复连接状态标记
                if (settings.wasConnected) {
                    this.shouldAutoReconnect = true;
                }
            } catch (error) {
                console.error('加载联机设置失败:', error);
                // 设置默认头像
                this.avatar = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
                const avatarPreview = document.getElementById('my-online-avatar-preview');
                if (avatarPreview) {
                    avatarPreview.src = this.avatar;
                }
            }
        } else {
            // 首次使用，设置默认头像和ID
            this.avatar = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
            const avatarPreview = document.getElementById('my-online-avatar-preview');
            if (avatarPreview) {
                avatarPreview.src = this.avatar;
            }
            
            // 【新增】首次使用时，自动使用设备ID生成默认用户ID
            const userIdInput = document.getElementById('my-online-id');
            if (userIdInput && !userIdInput.value && typeof EPHONE_DEVICE_ID !== 'undefined' && EPHONE_DEVICE_ID) {
                // 使用设备ID的前12位作为默认ID（去掉连字符）
                const defaultId = EPHONE_DEVICE_ID.replace(/-/g, '').substring(0, 12);
                userIdInput.value = defaultId;
                console.log('首次使用，使用设备ID生成默认用户ID:', defaultId);
            }
        }

        // 加载好友申请和好友列表
        this.loadFriendRequests();
        this.loadOnlineFriends();
        this.loadGroupChats();
    }

    // 连接服务器
    async connect() {
        const userIdInput = document.getElementById('my-online-id');
        const nicknameInput = document.getElementById('my-online-nickname');
        const serverUrlInput = document.getElementById('online-server-url');
        const statusSpan = document.getElementById('online-connection-status');
        const connectBtn = document.getElementById('connect-online-btn');
        const disconnectBtn = document.getElementById('disconnect-online-btn');

        this.userId = userIdInput?.value.trim();
        this.nickname = nicknameInput?.value.trim();
        this.serverUrl = serverUrlInput?.value.trim();

        // 验证输入
        if (!this.userId) {
            alert('请设置你的ID');
            return;
        }
        if (!this.nickname) {
            alert('请设置你的昵称');
            return;
        }
        if (!this.serverUrl) {
            alert('请输入服务器地址');
            return;
        }

        // 【修复】userId确认后，重新加载该ID绑定的好友数据
        this.friendRequests = [];
        this.onlineFriends = [];
        this.groupChats = [];
        this.loadFriendRequests();
        this.loadOnlineFriends();
        this.loadGroupChats();

        // 【修复】如果已有WebSocket连接，先关闭旧连接
        if (this.ws) {
            console.log('检测到旧连接，先关闭...');
            try {
                if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                    this.ws.close();
                }
            } catch (error) {
                console.error('关闭旧连接时出错:', error);
            }
            this.ws = null;
            // 等待一小段时间确保旧连接完全关闭
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // 更新状态
        statusSpan.textContent = '连接中...';
        statusSpan.className = 'connecting';

        try {
            // 创建WebSocket连接
            this.ws = new WebSocket(this.serverUrl);

            this.ws.onopen = () => {
                console.log('WebSocket连接已建立');
                
                // 【修复】发送注册消息时使用安全的头像
                const avatarToSend = this.getSafeAvatar();
                if (avatarToSend !== this.avatar && this.avatar.startsWith('data:image/')) {
                    alert('您上传的头像过大，暂时使用默认头像连接。建议重新上传更小的图片。');
                }
                
                this.send({
                    type: 'register',
                    userId: this.userId,
                    nickname: this.nickname,
                    avatar: avatarToSend
                });
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket错误:', error);
                statusSpan.textContent = '连接失败';
                statusSpan.className = 'disconnected';
                alert('连接服务器失败，请检查服务器地址');
            };

            this.ws.onclose = () => {
                console.log('WebSocket连接已关闭');
                
                const wasConnectedBefore = this.isConnected || this.shouldAutoReconnect;
                this.isConnected = false;
                
                statusSpan.textContent = '未连接';
                statusSpan.className = 'disconnected';
                connectBtn.style.display = 'inline-block';
                disconnectBtn.style.display = 'none';
                
                // 停止心跳
                if (this.heartbeatTimer) {
                    clearInterval(this.heartbeatTimer);
                    this.heartbeatTimer = null;
                }
                
                // 【优化】如果应该自动重连（不是主动断开），则尝试重连
                if (this.shouldAutoReconnect && wasConnectedBefore) {
                    console.log('检测到连接断开，准备自动重连...');
                    this.scheduleReconnect();
                }
            };

        } catch (error) {
            console.error('连接失败:', error);
            statusSpan.textContent = '连接失败';
            statusSpan.className = 'disconnected';
            alert('连接失败: ' + error.message);
        }
    }

    // 断开连接
    disconnect() {
        // 【关键】标记为主动断开，停止自动重连
        this.shouldAutoReconnect = false;
        this.reconnectAttempts = 0;
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.ws) {
            this.isConnected = false;
            this.ws.close();
            this.ws = null;
        }
        
        const statusSpan = document.getElementById('online-connection-status');
        const connectBtn = document.getElementById('connect-online-btn');
        const disconnectBtn = document.getElementById('disconnect-online-btn');
        
        statusSpan.textContent = '未连接';
        statusSpan.className = 'disconnected';
        connectBtn.style.display = 'inline-block';
        disconnectBtn.style.display = 'none';
        
        // 保存断开状态
        this.saveSettings();
        
        console.log('已主动断开连接');
    }

    // 发送消息到服务器
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.error('WebSocket未连接');
        }
    }

    // 处理服务器消息
    handleMessage(data) {
        console.log('收到服务器消息:', data);

        switch (data.type) {
            case 'register_success':
                this.onRegisterSuccess();
                break;
            
            case 'register_error':
                this.onRegisterError(data.error);
                break;
            
            case 'search_result':
                this.onSearchResult(data);
                break;
            
            case 'friend_request':
                this.onFriendRequest(data);
                break;
            
            case 'friend_request_accepted':
                this.onFriendRequestAccepted(data);
                break;
            
            case 'friend_request_rejected':
                this.onFriendRequestRejected(data);
                break;
            
            case 'receive_message':
                this.onReceiveMessage(data);
                break;
            
            case 'group_created':
                this.onGroupCreated(data).catch(err => console.error('处理group_created失败:', err));
                break;
            
            case 'group_invite':
                this.onGroupInvite(data).catch(err => console.error('处理group_invite失败:', err));
                break;
            
            case 'receive_group_message':
                this.onReceiveGroupMessage(data).catch(err => console.error('处理receive_group_message失败:', err));
                break;
            
            case 'group_member_joined':
                this.onGroupMemberJoined(data).catch(err => console.error('处理group_member_joined失败:', err));
                break;
            
            case 'group_member_left':
                this.onGroupMemberLeft(data).catch(err => console.error('处理group_member_left失败:', err));
                break;
            
            case 'group_synced':
                console.log('群同步完成:', data.groupId);
                break;
            
            case 'heartbeat_ack':
                // 【优化】心跳响应，重置丢失计数
                this.heartbeatMissed = 0;
                this.lastHeartbeatTime = Date.now();
                break;
            
            default:
                console.warn('未知消息类型:', data.type);
        }
    }

    // 注册成功
    onRegisterSuccess() {
        this.isConnected = true;
        this.shouldAutoReconnect = true;
        this.reconnectAttempts = 0;
        this.heartbeatMissed = 0;
        
        const statusSpan = document.getElementById('online-connection-status');
        const connectBtn = document.getElementById('connect-online-btn');
        const disconnectBtn = document.getElementById('disconnect-online-btn');
        
        statusSpan.textContent = '已连接';
        statusSpan.className = 'connected';
        connectBtn.style.display = 'none';
        disconnectBtn.style.display = 'inline-block';
        
        // 启动心跳
        this.startHeartbeat();
        
        // 同步群聊信息到服务器
        this.syncAllGroups();
        
        // 保存设置
        this.saveSettings();
        
        console.log('成功连接到服务器');
    }

    // 注册失败
    onRegisterError(error) {
        const statusSpan = document.getElementById('online-connection-status');
        statusSpan.textContent = '连接失败';
        statusSpan.className = 'disconnected';
        
        // 【优化】根据错误类型给出更友好的提示
        if (error.includes('ID格式不正确')) {
            alert('注册失败: ' + error + '\n\n提示：ID只能包含字母、数字和下划线，长度3-20位');
        } else if (error.includes('已被使用')) {
            // 这种情况理论上不应该再出现，因为服务器已经会自动踢掉旧连接
            console.warn('收到ID占用错误，但服务器应该已自动处理旧连接');
            alert('注册失败: ' + error + '\n\n如果这是您自己的ID，请稍等片刻后重试');
        } else {
            alert('注册失败: ' + error);
        }
    }

    // 搜索好友
    async searchFriend() {
        const searchInput = document.getElementById('search-friend-id-input');
        const searchId = searchInput?.value.trim();
        
        if (!searchId) {
            alert('请输入要搜索的ID');
            return;
        }
        
        if (!this.isConnected) {
            alert('请先连接服务器');
            return;
        }
        
        if (searchId === this.userId) {
            alert('不能添加自己为好友');
            return;
        }
        
        // 发送搜索请求
        this.send({
            type: 'search_user',
            searchId: searchId
        });
    }

    // 搜索结果
    onSearchResult(data) {
        const resultDiv = document.getElementById('friend-search-result');
        
        if (!data.found) {
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = `
                <div class="empty-state">
                    <div style="font-size: 14px; color: #999;">未找到用户 "${data.searchId}"</div>
                </div>
            `;
            return;
        }
        
        // 检查是否已经是好友
        const isAlreadyFriend = this.onlineFriends.some(f => f.userId === data.userId);
        
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
            <div class="friend-search-card">
                <img src="${data.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'}" 
                     class="friend-search-avatar" alt="头像">
                <div class="friend-search-info">
                    <div class="friend-search-nickname">
                        ${escapeHTML(data.nickname)}
                        <span class="friend-search-status ${data.online ? 'online' : 'offline'}">
                            ${data.online ? '在线' : '离线'}
                        </span>
                    </div>
                    <div class="friend-search-id">ID: ${escapeHTML(data.userId)}</div>
                </div>
                <div class="friend-search-actions">
                    ${isAlreadyFriend ? 
                        '<button class="settings-mini-btn" disabled>已是好友</button>' :
                        `<button class="settings-mini-btn" onclick="onlineChatManager.sendFriendRequest('${data.userId}', '${escapeHTML(data.nickname)}', '${data.avatar || ''}')">添加好友</button>`
                    }
                </div>
            </div>
        `;
    }

    // 发送好友申请
    sendFriendRequest(friendId, friendNickname, friendAvatar) {
        if (!this.isConnected) {
            alert('请先连接服务器');
            return;
        }
        
        // 【修复】使用安全的头像
        this.send({
            type: 'friend_request',
            toUserId: friendId,
            fromUserId: this.userId,
            fromNickname: this.nickname,
            fromAvatar: this.getSafeAvatar()
        });
        
        alert(`已向 ${friendNickname} 发送好友申请`);
        
        // 清空搜索结果
        document.getElementById('friend-search-result').style.display = 'none';
        document.getElementById('search-friend-id-input').value = '';
    }

    // 收到好友申请
    onFriendRequest(data) {
        // 添加到好友申请列表
        this.friendRequests.push({
            userId: data.fromUserId,
            nickname: data.fromNickname,
            avatar: data.fromAvatar,
            timestamp: Date.now()
        });
        
        this.saveFriendRequests();
        this.updateFriendRequestBadge();
        
        // 显示通知
        alert(`${data.fromNickname} 请求添加你为好友`);
    }

    // 打开好友申请弹窗
    openFriendRequestsModal() {
        const modal = document.getElementById('friend-requests-modal');
        const listDiv = document.getElementById('friend-requests-list');
        
        if (this.friendRequests.length === 0) {
            listDiv.innerHTML = `
                <div class="shugo-empty">
                    <div style="font-size: 14px; font-weight: bold;">暂无好友申请</div>
                    <div style="font-size: 12px; margin-top: 5px;">如果有新的申请，会在这里显示哦~</div>
                </div>
            `;
        } else {
            listDiv.innerHTML = this.friendRequests.map((request, index) => `
                <div class="shugo-list-item">
                    <div class="shugo-avatar-wrapper">
                        <img src="${request.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'}" 
                             class="shugo-avatar" alt="头像">
                    </div>
                    <div class="shugo-info">
                        <div class="shugo-nickname">${escapeHTML(request.nickname)}</div>
                        <div class="shugo-id">ID: ${escapeHTML(request.userId)}</div>
                        <div style="font-size: 11px; color: #aaa; margin-top: 2px;">${this.formatTime(request.timestamp)}</div>
                    </div>
                    <div class="shugo-actions">
                        <button class="shugo-btn shugo-btn-primary" 
                                onclick="onlineChatManager.acceptFriendRequest(${index})">同意</button>
                        <button class="shugo-btn shugo-btn-danger" 
                                onclick="onlineChatManager.rejectFriendRequest(${index})">拒绝</button>
                    </div>
                </div>
            `).join('');
        }
        
        modal.classList.add('visible');
    }

    // 同意好友申请
    async acceptFriendRequest(index) {
        const request = this.friendRequests[index];
        
        console.log('开始处理好友申请:', request);
        
        // 【修复】使用安全的头像
        this.send({
            type: 'accept_friend_request',
            toUserId: request.userId,
            fromUserId: this.userId,
            fromNickname: this.nickname,
            fromAvatar: this.getSafeAvatar()
        });
        
        // 添加到好友列表
        this.onlineFriends.push({
            userId: request.userId,
            nickname: request.nickname,
            avatar: request.avatar,
            online: false
        });
        
        this.saveOnlineFriends();
        console.log('已添加到联机好友列表');
        
        // 【关键】添加到QQ聊天列表
        try {
            await this.addToQQChatList(request);
            console.log('成功添加到QQ聊天列表');
        } catch (error) {
            console.error('添加到QQ聊天列表时出错:', error);
            alert('添加好友成功，但添加到聊天列表失败，请刷新页面后查看');
        }
        
        // 从申请列表中移除
        this.friendRequests.splice(index, 1);
        this.saveFriendRequests();
        this.updateFriendRequestBadge();
        
        // 刷新弹窗
        this.openFriendRequestsModal();
        
        alert(`已添加 ${request.nickname} 为好友，可在聊天列表中找到TA！`);
    }

    // 添加联机好友到QQ聊天列表
    async addToQQChatList(friend) {
        try {
            // 【修复】等待数据库完全就绪
            console.log('等待数据库初始化...');
            const db = await this.waitForDatabase();
            console.log('数据库已就绪');
            
            console.log('尝试添加联机好友到聊天列表:', friend);
            
            // 生成唯一的chatId，使用 'online_' 前缀标识联机好友
            const chatId = `online_${friend.userId}`;
            console.log('生成的chatId:', chatId);
            
            // 创建聊天对象，将头像同步到 settings 中以便聊天界面正确渲染
            const friendAvatar = friend.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
            const myAvatar = this.getSafeAvatar() || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
            const newChat = {
                id: chatId,
                name: friend.nickname,
                avatar: friendAvatar,
                lastMessage: '已添加为联机好友',
                timestamp: Date.now(),
                unread: 0,
                unreadCount: 0,
                isPinned: false,
                isOnlineFriend: true, // 标记为联机好友
                onlineUserId: friend.userId, // 保存联机用户ID
                history: [], // 消息历史
                settings: {
                    aiAvatar: friendAvatar,  // 对方头像
                    myAvatar: myAvatar        // 自己的头像
                }
            };
            
            // 检查是否已存在
            const existingChat = await db.chats.get(chatId);
            if (existingChat) {
                console.log('该联机好友已在聊天列表中，更新信息');
                // 确保 settings 对象存在
                const updatedSettings = existingChat.settings || {};
                updatedSettings.aiAvatar = friendAvatar;
                updatedSettings.myAvatar = myAvatar;
                
                await db.chats.update(chatId, {
                    name: friend.nickname,
                    avatar: friendAvatar,
                    lastMessage: '已添加为联机好友',
                    timestamp: Date.now(),
                    settings: updatedSettings
                });
                
                // 【关键】同步更新 state.chats
                if (typeof window.state !== 'undefined' && window.state && window.state.chats && window.state.chats[chatId]) {
                    window.state.chats[chatId].name = friend.nickname;
                    window.state.chats[chatId].avatar = friendAvatar;
                    window.state.chats[chatId].lastMessage = '已添加为联机好友';
                    window.state.chats[chatId].timestamp = Date.now();
                    if (!window.state.chats[chatId].settings) window.state.chats[chatId].settings = {};
                    window.state.chats[chatId].settings.aiAvatar = friendAvatar;
                    window.state.chats[chatId].settings.myAvatar = myAvatar;
                }
            } else {
                console.log('创建新的聊天记录');
                
                // 初始化history数组，添加欢迎消息
                newChat.history = [{
                    role: 'system',
                    content: '你们已成为联机好友，现在可以开始聊天了！',
                    timestamp: Date.now()
                }];
                
                // 保存到数据库
                await db.chats.add(newChat);
                console.log('聊天记录创建成功');
                
                // 【关键】同步添加到 state.chats
                if (typeof window.state !== 'undefined' && window.state && window.state.chats) {
                    window.state.chats[chatId] = newChat;
                    console.log('已同步到 state.chats');
                }
            }
            
            console.log(`已将联机好友 ${friend.nickname} 添加到QQ聊天列表`);
            
            // 刷新聊天列表显示
            if (typeof window.renderChatListProxy === 'function') {
                await window.renderChatListProxy();
                console.log('已刷新聊天列表显示');
            } else {
                console.warn('renderChatListProxy 函数未找到');
            }
        } catch (error) {
            console.error('添加到QQ聊天列表失败:', error);
            throw error; // 重新抛出错误以便上层捕获
        }
    }

    // 拒绝好友申请
    rejectFriendRequest(index) {
        const request = this.friendRequests[index];
        
        // 发送拒绝消息到服务器
        this.send({
            type: 'reject_friend_request',
            toUserId: request.userId
        });
        
        // 从申请列表中移除
        this.friendRequests.splice(index, 1);
        this.saveFriendRequests();
        this.updateFriendRequestBadge();
        
        // 刷新弹窗
        this.openFriendRequestsModal();
    }

    // 好友申请被接受
    async onFriendRequestAccepted(data) {
        console.log('收到好友申请被接受的通知:', data);
        
        // 添加到好友列表
        this.onlineFriends.push({
            userId: data.fromUserId,
            nickname: data.fromNickname,
            avatar: data.fromAvatar,
            online: true
        });
        
        this.saveOnlineFriends();
        console.log('已添加到联机好友列表');
        
        // 【关键】添加到QQ聊天列表
        try {
            await this.addToQQChatList({
                userId: data.fromUserId,
                nickname: data.fromNickname,
                avatar: data.fromAvatar
            });
            console.log('成功添加到QQ聊天列表');
        } catch (error) {
            console.error('添加到QQ聊天列表时出错:', error);
        }
        
        alert(`${data.fromNickname} 接受了你的好友申请，可在聊天列表中找到TA！`);
    }

    // 好友申请被拒绝
    onFriendRequestRejected(data) {
        alert('对方拒绝了你的好友申请');
    }

    // 打开好友列表弹窗
    openOnlineFriendsModal() {
        const modal = document.getElementById('online-friends-modal');
        const listDiv = document.getElementById('online-friends-list');
        
        if (this.onlineFriends.length === 0) {
            listDiv.innerHTML = `
                <div class="shugo-empty">
                    <div style="font-size: 14px; font-weight: bold;">暂无联机好友</div>
                    <div style="margin-top: 10px; font-size: 13px;">搜索ID添加好友吧</div>
                </div>
            `;
        } else {
            listDiv.innerHTML = this.onlineFriends.map((friend, index) => `
                <div class="shugo-list-item">
                    <div class="shugo-avatar-wrapper">
                        <img src="${friend.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'}" 
                             class="shugo-avatar" alt="头像">
                        <div class="online-friend-status-dot ${friend.online ? 'online' : 'offline'}" 
                             style="position: absolute; bottom: 0; right: 0; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; background-color: ${friend.online ? '#4cd964' : '#999'}; box-shadow: 0 0 5px rgba(0,0,0,0.1);"></div>
                    </div>
                    <div class="shugo-info">
                        <div class="shugo-nickname">${escapeHTML(friend.nickname)}</div>
                        <div class="shugo-id">ID: ${escapeHTML(friend.userId)}</div>
                    </div>
                    <div class="shugo-actions">
                        <button class="shugo-btn shugo-btn-primary" 
                                onclick="onlineChatManager.startChatWithFriend('${friend.userId}')">聊天</button>
                        <button class="shugo-btn shugo-btn-danger" 
                                onclick="onlineChatManager.deleteFriend(${index})">删除</button>
                    </div>
                </div>
            `).join('');
        }
        
        modal.classList.add('visible');
    }

    // 开始与好友聊天
    async startChatWithFriend(friendId) {
        const chatId = `online_${friendId}`;
        
        // 关闭弹窗
        this.closeOnlineFriendsModal();
        
        // 跳转到聊天界面
        if (typeof openChat === 'function') {
            await openChat(chatId);
        } else if (typeof window.openChat === 'function') {
            await window.openChat(chatId);
        } else {
            console.error('openChat 函数未定义');
            alert('无法打开聊天界面');
        }
    }

    // 删除好友
    async deleteFriend(index) {
        const friend = this.onlineFriends[index];
        
        if (confirm(`确定要删除好友 ${friend.nickname} 吗？`)) {
            const chatId = `online_${friend.userId}`;
            
            // 从好友列表删除
            this.onlineFriends.splice(index, 1);
            this.saveOnlineFriends();
            
            // 从QQ聊天列表删除
            try {
                // 【修复】等待数据库完全就绪
                console.log('等待数据库初始化...');
                const db = await this.waitForDatabase();
                console.log('数据库已就绪');
                
                // 删除聊天记录（消息历史包含在chat对象中，一起删除）
                await db.chats.delete(chatId);
                console.log(`已删除聊天记录: ${chatId}`);
                
                // 【关键】同步删除 state.chats
                if (typeof window.state !== 'undefined' && window.state && window.state.chats && window.state.chats[chatId]) {
                    delete window.state.chats[chatId];
                    console.log('已从 state.chats 删除');
                }
                
                // 刷新聊天列表
                if (typeof window.renderChatListProxy === 'function') {
                    await window.renderChatListProxy();
                    console.log('已刷新聊天列表');
                }
                
                alert(`已删除好友 ${friend.nickname}`);
            } catch (error) {
                console.error('从QQ聊天列表删除失败:', error);
                alert('删除失败: ' + error.message);
            }
            
            // 刷新好友列表弹窗
            this.openOnlineFriendsModal();
        }
    }

    // 关闭好友申请弹窗
    closeFriendRequestsModal() {
        const modal = document.getElementById('friend-requests-modal');
        modal.classList.remove('visible');
    }

    // 关闭好友列表弹窗
    closeOnlineFriendsModal() {
        const modal = document.getElementById('online-friends-modal');
        modal.classList.remove('visible');
    }

    // 更新好友申请徽章
    updateFriendRequestBadge() {
        const badge = document.getElementById('friend-request-badge');
        if (badge) {
            if (this.friendRequests.length > 0) {
                badge.textContent = this.friendRequests.length;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    // 保存好友申请到localStorage
    // 【修复】获取当前用户ID绑定的存储key，确保不同ID的数据隔离
    _getFriendRequestsKey() {
        const uid = this.userId || document.getElementById('my-online-id')?.value || '';
        return uid ? `ephone-friend-requests-${uid}` : 'ephone-friend-requests';
    }

    _getOnlineFriendsKey() {
        const uid = this.userId || document.getElementById('my-online-id')?.value || '';
        return uid ? `ephone-online-friends-${uid}` : 'ephone-online-friends';
    }

    saveFriendRequests() {
        localStorage.setItem(this._getFriendRequestsKey(), JSON.stringify(this.friendRequests));
        // 兼容：清理旧的无ID key
        if (this.userId) {
            localStorage.removeItem('ephone-friend-requests');
        }
    }

    // 加载好友申请
    loadFriendRequests() {
        let saved = localStorage.getItem(this._getFriendRequestsKey());
        // 兼容：如果新key没有数据，尝试从旧key迁移
        if (!saved && this.userId) {
            saved = localStorage.getItem('ephone-friend-requests');
            if (saved) {
                localStorage.setItem(this._getFriendRequestsKey(), saved);
                localStorage.removeItem('ephone-friend-requests');
                console.log('已将好友申请数据迁移到用户ID绑定的key');
            }
        }
        if (saved) {
            try {
                this.friendRequests = JSON.parse(saved);
                this.updateFriendRequestBadge();
            } catch (error) {
                console.error('加载好友申请失败:', error);
            }
        }
    }

    // 保存好友列表到localStorage（绑定用户ID）
    saveOnlineFriends() {
        localStorage.setItem(this._getOnlineFriendsKey(), JSON.stringify(this.onlineFriends));
        // 兼容：清理旧的无ID key
        if (this.userId) {
            localStorage.removeItem('ephone-online-friends');
        }
    }

    // 加载好友列表（绑定用户ID）
    loadOnlineFriends() {
        let saved = localStorage.getItem(this._getOnlineFriendsKey());
        // 兼容：如果新key没有数据，尝试从旧key迁移
        if (!saved && this.userId) {
            saved = localStorage.getItem('ephone-online-friends');
            if (saved) {
                localStorage.setItem(this._getOnlineFriendsKey(), saved);
                localStorage.removeItem('ephone-online-friends');
                console.log('已将好友列表数据迁移到用户ID绑定的key');
            }
        }
        if (saved) {
            try {
                this.onlineFriends = JSON.parse(saved);
            } catch (error) {
                console.error('加载好友列表失败:', error);
            }
        }
    }

    // 启动心跳
    startHeartbeat() {
        // 清除已有的心跳定时器
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }
        
        // 每60秒发送一次心跳，仅用于保活，不主动断连
        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.send({ type: 'heartbeat' });
                console.log('发送心跳包');
            } else if (this.shouldAutoReconnect && (!this.ws || this.ws.readyState === WebSocket.CLOSED)) {
                // 连接已断但应该保持，触发重连
                console.log('检测到连接断开，触发重连');
                this.scheduleReconnect();
            }
        }, 60000); // 每60秒一次，轻量保活
        
        // 初始化心跳时间
        this.lastHeartbeatTime = Date.now();
    }

    // 计划重连
    scheduleReconnect() {
        // 如果不应该自动重连，直接返回
        if (!this.shouldAutoReconnect) {
            return;
        }
        
        // 【修复】如果联机开关是关的，不要重连
        const enableSwitch = document.getElementById('enable-online-chat-switch');
        if (enableSwitch && !enableSwitch.checked) {
            this.shouldAutoReconnect = false;
            console.log('联机开关未开启，停止重连');
            return;
        }
        
        // 检查是否超过最大重连次数
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('已达到最大重连次数');
            return;
        }
        
        // 清除已有的重连定时器
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        // 【优化】使用指数退避算法，但最长不超过30秒
        this.reconnectAttempts++;
        const delay = Math.min(3000 + this.reconnectAttempts * 2000, 30000);
        
        console.log(`${delay/1000}秒后尝试第${this.reconnectAttempts}次重连...`);
        
        const statusSpan = document.getElementById('online-connection-status');
        if (statusSpan) {
            statusSpan.textContent = `重连中(${this.reconnectAttempts})...`;
            statusSpan.className = 'connecting';
        }
        
        this.reconnectTimer = setTimeout(() => {
            console.log(`执行第${this.reconnectAttempts}次重连`);
            this.connect();
        }, delay);
    }

    // 【新增】监听页面可见性变化
    setupVisibilityListener() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('页面已隐藏（切换到其他应用）');
            } else {
                console.log('页面已显示（切换回应用）');
                
                // 【修复】如果联机开关是关的，不做任何事
                const enableSwitch = document.getElementById('enable-online-chat-switch');
                if (enableSwitch && !enableSwitch.checked) {
                    return;
                }
                
                // 【优化】只有在连接断开时才重连，避免重复注册
                if (this.shouldAutoReconnect && !this.isConnected && 
                    this.ws && this.ws.readyState !== WebSocket.OPEN && 
                    this.ws.readyState !== WebSocket.CONNECTING) {
                    console.log('检测到页面重新显示且连接已断开，尝试重新连接...');
                    this.reconnectAttempts = 0; // 重置重连次数
                    // 延迟500ms重连，确保旧连接完全关闭
                    setTimeout(() => {
                        if (!this.isConnected) {
                            this.connect();
                        }
                    }, 500);
                } else if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
                    // 已连接且连接正常，只发送心跳检查健康
                    console.log('连接正常，发送心跳检查');
                    this.send({ type: 'heartbeat' });
                } else if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
                    console.log('连接正在建立中，无需重连');
                }
            }
        });
    }

    // 【新增】监听页面刷新/关闭前保存状态
    setupBeforeUnloadListener() {
        window.addEventListener('beforeunload', () => {
            // 保存当前连接状态，以便刷新后自动重连
            this.saveSettings();
        });
    }

    // 【新增】如果之前已连接，自动重连
    autoReconnectIfNeeded() {
        // 页面加载完成后，检查是否需要自动重连
        setTimeout(() => {
            // 【修复】如果联机开关是关的，不要自动重连
            const enableSwitch = document.getElementById('enable-online-chat-switch');
            if (enableSwitch && !enableSwitch.checked) {
                this.shouldAutoReconnect = false;
                console.log('联机开关未开启，跳过自动重连');
                return;
            }
            
            if (this.shouldAutoReconnect && !this.isConnected) {
                const userIdInput = document.getElementById('my-online-id');
                const nicknameInput = document.getElementById('my-online-nickname');
                const serverUrlInput = document.getElementById('online-server-url');
                
                // 只有配置完整时才自动重连
                if (userIdInput?.value && nicknameInput?.value && serverUrlInput?.value) {
                    console.log('检测到之前已连接，正在自动重连...');
                    this.connect();
                }
            }
        }, 1000); // 延迟1秒确保页面完全加载
    }

    // 格式化时间
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) {
            return '刚刚';
        } else if (diff < 3600000) {
            return Math.floor(diff / 60000) + '分钟前';
        } else if (diff < 86400000) {
            return Math.floor(diff / 3600000) + '小时前';
        } else {
            return date.toLocaleDateString();
        }
    }

    // 收到消息
    async onReceiveMessage(data) {
        console.log('收到联机消息:', data);
        console.log('消息内容:', {
            fromUserId: data.fromUserId,
            message: data.message,
            timestamp: data.timestamp
        });
        
        const chatId = `online_${data.fromUserId}`;
        console.log('计算的chatId:', chatId);
        
        try {
            // 【修复】等待数据库完全就绪
            const db = await this.waitForDatabase();
            console.log('数据库已就绪，准备保存消息');
            
            // 获取或创建聊天对象
            let chat = await db.chats.get(chatId);
            console.log('获取到的chat对象:', chat ? '存在' : '不存在');
            
            if (!chat) {
                // 如果聊天不存在，创建一个新的
                console.warn('收到消息但聊天不存在，创建新聊天');
                const friend = this.onlineFriends.find(f => f.userId === data.fromUserId);
                const friendAvatar = friend ? friend.avatar : 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
                const myAvatar = this.getSafeAvatar() || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
                chat = {
                    id: chatId,
                    name: friend ? friend.nickname : '联机好友',
                    avatar: friendAvatar,
                    lastMessage: data.message,
                    timestamp: data.timestamp,
                    unread: 1,
                    unreadCount: 1,
                    isPinned: false,
                    isOnlineFriend: true,
                    onlineUserId: data.fromUserId,
                    history: [],
                    settings: {
                        aiAvatar: friendAvatar,
                        myAvatar: myAvatar
                    }
                };
                console.log('创建了新chat对象');
            } else {
                // 【修复】对已有聊天，补全 settings 中缺失的头像（兼容旧数据）
                if (!chat.settings) chat.settings = {};
                if (!chat.settings.aiAvatar) {
                    const friend = this.onlineFriends.find(f => f.userId === data.fromUserId);
                    chat.settings.aiAvatar = chat.avatar || (friend ? friend.avatar : '') || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
                    console.log('已补全 settings.aiAvatar:', chat.settings.aiAvatar);
                }
                if (!chat.settings.myAvatar) {
                    chat.settings.myAvatar = this.getSafeAvatar() || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
                    console.log('已补全 settings.myAvatar:', chat.settings.myAvatar);
                }
            }
            
            // 确保 history 数组存在
            if (!Array.isArray(chat.history)) {
                chat.history = [];
                console.log('初始化了history数组');
            }
            
            console.log('添加消息前，history长度:', chat.history.length);
            
            // 创建消息对象
            const msg = {
                role: 'ai', // 对方发送的消息
                content: data.message,
                timestamp: data.timestamp
            };
            
            // 添加消息到 history
            chat.history.push(msg);
            
            console.log('添加消息后，history长度:', chat.history.length);
            console.log('最后一条消息:', chat.history[chat.history.length - 1]);
            
            // 更新最后消息和未读数
            chat.lastMessage = data.message;
            chat.timestamp = data.timestamp;
            chat.unread = (chat.unread || 0) + 1;
            
            // 保存到数据库
            await db.chats.put(chat);
            console.log('chat对象已保存到数据库');
            
            // 【关键】同步更新 state.chats（尝试多种方式）
            let stateUpdated = false;
            
            if (typeof state !== 'undefined' && state && state.chats) {
                state.chats[chatId] = chat;
                console.log('已同步更新 state.chats 中的消息');
                stateUpdated = true;
            }
            
            if (typeof window.state !== 'undefined' && window.state && window.state.chats) {
                window.state.chats[chatId] = chat;
                console.log('已同步更新 window.state.chats 中的消息');
                stateUpdated = true;
            }
            
            if (!stateUpdated) {
                console.warn('⚠️ 无法同步到 state.chats - state 不存在');
            }
            
            // 刷新聊天列表
            if (typeof window.renderChatListProxy === 'function') {
                await window.renderChatListProxy();
                console.log('已刷新聊天列表');
            } else {
                console.warn('window.renderChatListProxy 不存在');
            }
            
            // 如果当前正在与该好友聊天，使用 appendMessage 立即显示消息
            let currentChatId = null;
            if (typeof state !== 'undefined' && state && state.activeChatId) {
                currentChatId = state.activeChatId;
            } else if (typeof window.state !== 'undefined' && window.state && window.state.activeChatId) {
                currentChatId = window.state.activeChatId;
            }
            
            console.log('当前activeChatId:', currentChatId, '期望:', chatId);
            
            if (currentChatId === chatId) {
                console.log('✅ 当前正在与该好友聊天，准备显示消息');
                
                // 使用 appendMessage 立即显示消息，而不是重新渲染整个界面
                if (typeof window.appendMessage === 'function') {
                    await window.appendMessage(msg, chat);
                    console.log('✅ 已通过 appendMessage 显示对方的消息');
                } else {
                    console.warn('appendMessage 函数不存在，尝试重新渲染界面');
                    if (typeof window.renderChatInterface === 'function') {
                        await window.renderChatInterface(chatId);
                        console.log('已重新渲染聊天界面');
                    } else {
                        console.warn('window.renderChatInterface 不存在');
                    }
                }
            } else {
                console.log('当前未打开该好友的聊天界面');
            }
            
            // 【修复】发送系统通知 —— 页面在后台或不在当前聊天时弹通知
            const isPageHidden = document.hidden || document.visibilityState === 'hidden';
            const isNotInChat = currentChatId !== chatId;

            if (isPageHidden || isNotInChat) {
                const friend = this.onlineFriends.find(f => f.userId === data.fromUserId);
                const senderName = friend ? friend.nickname : '联机好友';

                // 优先通过 Service Worker postMessage 发送通知（后台页面 JS 可能被暂停）
                if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                    try {
                        navigator.serviceWorker.controller.postMessage({
                            type: 'SHOW_NOTIFICATION',
                            title: senderName,
                            options: {
                                body: data.message,
                                icon: 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1758510900942_qdqqd_djw0z2.jpeg',
                                badge: 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1758510900942_qdqqd_djw0z2.jpeg',
                                tag: `chat-${chatId}-${Date.now()}`,
                                requireInteraction: true,
                                renotify: true,
                                silent: false,
                                vibrate: [200, 100, 200, 100, 200],
                                data: { type: 'chat', chatId: chatId, timestamp: Date.now() }
                            }
                        });
                        console.log('[通知] 已通过 SW postMessage 发送通知');
                    } catch (swErr) {
                        console.warn('[通知] SW postMessage 失败，回退到 notificationManager:', swErr);
                        if (window.notificationManager) {
                            window.notificationManager.notifyNewMessage(senderName, data.message, chatId);
                        }
                    }
                } else if (window.notificationManager) {
                    // 回退：直接用 notificationManager
                    window.notificationManager.notifyNewMessage(senderName, data.message, chatId);
                    console.log('[通知] 已通过 notificationManager 发送通知');
                }
            }

            console.log('联机消息已保存');
        } catch (error) {
            console.error('保存联机消息失败:', error);
            console.error('错误堆栈:', error.stack);
        }
    }

    // 发送消息给联机好友
    async sendMessageToFriend(friendUserId, message) {
        if (!this.isConnected) {
            throw new Error('未连接到服务器');
        }
        
        // 发送到服务器
        this.send({
            type: 'send_message',
            toUserId: friendUserId,
            fromUserId: this.userId,
            message: message,
            timestamp: Date.now()
        });
        
        console.log(`已发送消息给 ${friendUserId}`);
    }

    // 清理所有旧数据（解决头像不同步等问题）
    async clearAllOldData() {
        try {
            const confirmed = confirm(
                '🧹 清理所有旧数据\n\n' +
                '此操作将清除所有联机聊天中缓存的旧头像和旧数据，\n' +
                '解决头像更换后部分好友看不到新头像的问题。\n\n' +
                '清理内容：\n' +
                '• 聊天记录中缓存的旧头像数据\n' +
                '• 好友列表中缓存的旧头像数据\n' +
                '• 本地存储中的旧缓存\n\n' +
                '注意：不会删除好友关系和聊天记录。\n' +
                '清理后重新连接服务器即可同步最新头像。\n\n' +
                '确定要清理吗？'
            );

            if (!confirmed) return;

            console.log('开始清理所有旧数据...');

            const db = await this.waitForDatabase();

            // 1. 清理数据库中所有联机聊天的缓存头像
            const allChats = await db.chats.toArray();
            const onlineChats = allChats.filter(chat => chat.id && chat.id.startsWith('online_'));
            const defaultAvatar = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
            let cleanedCount = 0;

            for (const chat of onlineChats) {
                const updates = {
                    avatar: defaultAvatar
                };
                // 重置 settings 中缓存的头像
                if (chat.settings) {
                    updates.settings = {
                        ...chat.settings,
                        aiAvatar: defaultAvatar,
                        myAvatar: defaultAvatar
                    };
                } else {
                    updates.settings = {
                        aiAvatar: defaultAvatar,
                        myAvatar: defaultAvatar
                    };
                }
                await db.chats.update(chat.id, updates);

                // 同步更新内存中的 state.chats
                if (window.state && window.state.chats && window.state.chats[chat.id]) {
                    window.state.chats[chat.id].avatar = defaultAvatar;
                    if (!window.state.chats[chat.id].settings) window.state.chats[chat.id].settings = {};
                    window.state.chats[chat.id].settings.aiAvatar = defaultAvatar;
                    window.state.chats[chat.id].settings.myAvatar = defaultAvatar;
                }
                cleanedCount++;
                console.log(`已清理聊天缓存: ${chat.id}`);
            }

            // 2. 清理好友列表中缓存的旧头像
            for (const friend of this.onlineFriends) {
                friend.avatar = defaultAvatar;
            }
            this.saveOnlineFriends();
            console.log('已清理好友列表中的旧头像缓存');

            // 3. 清理自己的头像缓存，重置为默认
            this.avatar = defaultAvatar;
            const avatarPreview = document.getElementById('my-online-avatar-preview');
            if (avatarPreview) avatarPreview.src = defaultAvatar;
            this.saveSettings();
            console.log('已清理自己的头像缓存');

            // 4. 刷新聊天列表
            if (typeof window.renderChatListProxy === 'function') {
                await window.renderChatListProxy();
                console.log('已刷新聊天列表');
            }

            // 5. 如果已连接，重新注册以同步最新头像
            if (this.isConnected) {
                this.send({
                    type: 'register',
                    userId: this.userId,
                    nickname: this.nickname,
                    avatar: this.getSafeAvatar()
                });
                console.log('已重新注册以同步最新头像');
            }

            console.log(`清理完成，共清理了 ${cleanedCount} 个聊天的旧数据`);
            alert(`✅ 旧数据清理完成！\n\n已清理 ${cleanedCount} 个联机聊天的缓存数据。\n\n请重新上传头像并连接服务器，好友将看到你的最新头像。`);

        } catch (error) {
            console.error('清理旧数据失败:', error);
            alert('清理失败: ' + error.message);
        }
    }

    // 重置联机数据
    async resetOnlineData() {
        try {
            // 第1层：确认对话框
            const confirmed = confirm(
                '⚠️ 警告：重置联机数据\n\n' +
                '此操作将永久删除：\n' +
                '✗ 所有联机好友\n' +
                '✗ 所有联机聊天记录\n' +
                '✗ 用户ID、昵称、头像\n' +
                '✗ 服务器连接信息\n\n' +
                '确定要继续吗？'
            );
            
            if (!confirmed) return;

            // 第2层：输入验证
            const verification = prompt('为确认这不是误操作，请输入"重置联机"四个字：');
            if (verification !== '重置联机') {
                alert('验证失败，操作已取消。');
                return;
            }

            console.log('开始重置联机数据...');

            // 1. 断开WebSocket连接
            if (this.isConnected && this.ws) {
                this.shouldAutoReconnect = false; // 禁止自动重连
                this.ws.close();
                this.ws = null;
                this.isConnected = false;
                console.log('已断开WebSocket连接');
            }

            // 2. 清除定时器
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }

            // 3. 等待数据库就绪
            const db = await this.waitForDatabase();

            // 4. 删除数据库中所有联机好友的聊天记录
            const allChats = await db.chats.toArray();
            const onlineChats = allChats.filter(chat => chat.id && chat.id.startsWith('online_'));
            
            for (const chat of onlineChats) {
                await db.chats.delete(chat.id);
                console.log(`已删除联机聊天: ${chat.id}`);
                
                // 同时从 state.chats 中删除
                if (window.state && window.state.chats && window.state.chats[chat.id]) {
                    delete window.state.chats[chat.id];
                }
            }

            // 5. 清空内存中的数据
            this.userId = null;
            this.nickname = null;
            this.avatar = null;
            this.serverUrl = null;
            this.friendRequests = [];
            this.onlineFriends = [];
            this.reconnectAttempts = 0;
            this.heartbeatMissed = 0;

            // 6. 清除localStorage中的联机设置（包括用户ID绑定的数据）
            const oldUserId = this.userId;
            if (oldUserId) {
                localStorage.removeItem(`ephone-friend-requests-${oldUserId}`);
                localStorage.removeItem(`ephone-online-friends-${oldUserId}`);
                console.log(`已清除用户 ${oldUserId} 绑定的好友数据`);
            }
            localStorage.removeItem('ephone-online-settings');
            localStorage.removeItem('ephone-online-friends');
            localStorage.removeItem('ephone-friend-requests');
            console.log('已清除localStorage中的联机数据');

            // 7. 重置UI
            const enableSwitch = document.getElementById('enable-online-chat-switch');
            const detailsDiv = document.getElementById('online-chat-details');
            const myOnlineId = document.getElementById('my-online-id');
            const myOnlineNickname = document.getElementById('my-online-nickname');
            const myOnlineAvatarPreview = document.getElementById('my-online-avatar-preview');
            const onlineServerUrl = document.getElementById('online-server-url');
            const connectionStatus = document.getElementById('online-connection-status');
            const connectBtn = document.getElementById('connect-online-btn');
            const disconnectBtn = document.getElementById('disconnect-online-btn');

            if (enableSwitch) enableSwitch.checked = false;
            if (detailsDiv) detailsDiv.style.display = 'none';
            if (myOnlineId) myOnlineId.value = '';
            if (myOnlineNickname) myOnlineNickname.value = '';
            if (myOnlineAvatarPreview) myOnlineAvatarPreview.src = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
            if (onlineServerUrl) onlineServerUrl.value = '';
            if (connectionStatus) {
                connectionStatus.textContent = '未连接';
                connectionStatus.style.color = '#999';
            }
            if (connectBtn) connectBtn.style.display = 'inline-block';
            if (disconnectBtn) disconnectBtn.style.display = 'none';

            // 8. 刷新聊天列表
            if (typeof window.renderChatListProxy === 'function') {
                await window.renderChatListProxy();
                console.log('已刷新聊天列表');
            }

            console.log('联机数据重置完成');
            alert('✅ 联机数据已完全重置！');

            // 9. 询问用户是否要注销当前ID并生成新ID
            const discardId = confirm(
                '是否要丢弃当前的用户ID？\n\n' +
                '选择"确定"：注销旧ID，立即生成一个全新的ID\n' +
                '选择"取消"：保留原来的ID（刷新后会恢复）'
            );

            if (discardId) {
                // 生成一个全新的随机ID（12位，字母+数字）
                const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
                let newId = '';
                const randomValues = crypto.getRandomValues(new Uint8Array(12));
                for (let i = 0; i < 12; i++) {
                    newId += chars[randomValues[i] % chars.length];
                }

                // 更新内存和UI
                this.userId = newId;
                const myOnlineIdAfter = document.getElementById('my-online-id');
                if (myOnlineIdAfter) myOnlineIdAfter.value = newId;

                // 保存新ID到localStorage，这样刷新后不会回退到设备ID
                const newSettings = {
                    enabled: false,
                    userId: newId,
                    nickname: '',
                    avatar: '',
                    serverUrl: '',
                    wasConnected: false
                };
                localStorage.setItem('ephone-online-settings', JSON.stringify(newSettings));

                console.log(`旧ID已注销，新ID已生成: ${newId}`);
                alert(`✅ 旧ID已注销！\n\n你的新ID是: ${newId}\n\n请设置昵称和头像后重新连接服务器。`);
            }

        } catch (error) {
            console.error('重置联机数据失败:', error);
            alert('重置失败: ' + error.message);
        }
    }
    // ========================================
    // 群聊功能
    // ========================================

    // 获取群聊存储key（绑定用户ID）
    _getGroupChatsKey() {
        const uid = this.userId || document.getElementById('my-online-id')?.value || '';
        return uid ? `ephone-group-chats-${uid}` : 'ephone-group-chats';
    }

    // 保存群聊列表
    saveGroupChats() {
        try {
            localStorage.setItem(this._getGroupChatsKey(), JSON.stringify(this.groupChats));
        } catch (error) {
            console.error('保存群聊列表失败:', error);
        }
    }

    // 加载群聊列表
    loadGroupChats() {
        let saved = localStorage.getItem(this._getGroupChatsKey());
        if (!saved && this.userId) {
            saved = localStorage.getItem('ephone-group-chats');
            if (saved) {
                localStorage.setItem(this._getGroupChatsKey(), saved);
                localStorage.removeItem('ephone-group-chats');
            }
        }
        if (saved) {
            try {
                this.groupChats = JSON.parse(saved);
            } catch (error) {
                console.error('加载群聊列表失败:', error);
                this.groupChats = [];
            }
        }
    }

    // 同步所有群聊到服务器（重连后调用）
    syncAllGroups() {
        if (!this.isConnected || this.groupChats.length === 0) return;
        
        for (const group of this.groupChats) {
            this.send({
                type: 'sync_group',
                groupId: group.groupId,
                groupName: group.name,
                members: group.members,
                userId: this.userId
            });
        }
        console.log(`已同步 ${this.groupChats.length} 个群聊到服务器`);
    }

    // 打开创建群聊弹窗
    openCreateGroupModal() {
        if (!this.isConnected) {
            alert('请先连接服务器');
            return;
        }
        
        if (this.onlineFriends.length === 0) {
            alert('你还没有联机好友，先添加好友吧');
            return;
        }
        
        const modal = document.getElementById('create-group-modal');
        const listDiv = document.getElementById('create-group-friend-list');
        const nameInput = document.getElementById('group-name-input');
        
        if (!modal || !listDiv) return;
        
        // 清空群名输入
        if (nameInput) nameInput.value = '';
        
        // 渲染好友多选列表
        listDiv.innerHTML = this.onlineFriends.map((friend, index) => {
            // 安全处理头像，避免base64破坏HTML属性
            const safeAvatar = (friend.avatar || '').replace(/"/g, '&quot;');
            return `
            <label class="shugo-list-item" style="cursor: pointer; display: flex; align-items: center; padding: 10px 15px;">
                <input type="checkbox" class="group-friend-checkbox" value="${friend.userId}" 
                       data-nickname="${escapeHTML(friend.nickname)}" 
                       data-avatar-index="${index}"
                       style="margin-right: 12px; width: 18px; height: 18px; accent-color: #007aff;">
                <div class="shugo-avatar-wrapper" style="margin-right: 10px;">
                    <img src="${friend.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'}" 
                         class="shugo-avatar" alt="头像" style="width: 40px; height: 40px; border-radius: 50%;">
                </div>
                <div class="shugo-info">
                    <div class="shugo-nickname">${escapeHTML(friend.nickname)}</div>
                    <div class="shugo-id" style="font-size: 11px; color: #999;">ID: ${escapeHTML(friend.userId)}</div>
                </div>
            </label>
            `;
        }).join('');
        
        modal.classList.add('visible');
    }

    // 关闭创建群聊弹窗
    closeCreateGroupModal() {
        const modal = document.getElementById('create-group-modal');
        if (modal) modal.classList.remove('visible');
    }

    // 确认创建群聊
    async confirmCreateGroup() {
        const nameInput = document.getElementById('group-name-input');
        const checkboxes = document.querySelectorAll('.group-friend-checkbox:checked');
        
        const groupName = nameInput?.value.trim();
        if (!groupName) {
            alert('请输入群名称');
            return;
        }
        
        if (checkboxes.length < 1) {
            alert('请至少选择1个好友');
            return;
        }
        
        // 收集选中的成员（头像不发送base64，避免超过WebSocket消息大小限制）
        const myAvatar = this.getSafeAvatar();
        const safeSelfAvatar = (myAvatar && myAvatar.startsWith('data:image/')) ? '' : myAvatar;
        const members = [{
            userId: this.userId,
            nickname: this.nickname,
            avatar: safeSelfAvatar
        }];
        
        checkboxes.forEach(cb => {
            const friendIndex = parseInt(cb.dataset.avatarIndex);
            const friend = this.onlineFriends[friendIndex];
            // 如果头像是base64，不发送给服务器（太大），用空字符串代替
            let avatar = friend ? friend.avatar : '';
            if (avatar && avatar.startsWith('data:image/')) {
                avatar = ''; // 不发送base64头像，避免超过100KB限制
            }
            members.push({
                userId: cb.value,
                nickname: cb.dataset.nickname,
                avatar: avatar
            });
        });
        
        // 生成群ID
        const groupId = 'group_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        
        // 发送创建群聊请求
        this.send({
            type: 'create_group',
            groupId,
            groupName,
            creatorId: this.userId,
            members
        });
        
        // 关闭弹窗
        this.closeCreateGroupModal();
    }

    // 服务器确认群创建成功
    async onGroupCreated(data) {
        console.log('群聊创建成功:', data);
        
        const { groupId, groupName, members } = data;
        
        // 保存到本地群聊列表
        this.groupChats.push({
            groupId,
            name: groupName,
            members,
            createdAt: Date.now()
        });
        this.saveGroupChats();
        console.log('群聊已保存到本地列表，当前群数:', this.groupChats.length);
        
        // 添加到聊天列表
        try {
            await this.addGroupToChatList(groupId, groupName, members);
            console.log('群聊已添加到聊天列表');
        } catch (error) {
            console.error('添加群聊到聊天列表失败:', error);
        }
        
        alert(`群聊「${groupName}」创建成功！`);
    }

    // 被邀请入群
    async onGroupInvite(data) {
        console.log('收到群聊邀请:', data);
        
        const { groupId, groupName, creatorNickname, members } = data;
        
        // 检查是否已在群里
        if (this.groupChats.some(g => g.groupId === groupId)) {
            console.log('已在该群中，忽略重复邀请');
            return;
        }
        
        // 保存到本地群聊列表
        this.groupChats.push({
            groupId,
            name: groupName,
            members,
            createdAt: Date.now()
        });
        this.saveGroupChats();
        
        // 添加到聊天列表
        await this.addGroupToChatList(groupId, groupName, members);
        
        alert(`${creatorNickname} 邀请你加入群聊「${groupName}」`);
    }

    // 添加群聊到聊天列表
    async addGroupToChatList(groupId, groupName, members) {
        try {
            const db = await this.waitForDatabase();
            const chatId = groupId;
            
            // 补全成员头像（服务器传输时可能省略了base64头像）
            const fullMembers = members.map(m => {
                if (!m.avatar || m.avatar === '') {
                    // 尝试从好友列表获取完整头像
                    if (m.userId === this.userId) {
                        return { ...m, avatar: this.getSafeAvatar() || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg' };
                    }
                    const friend = this.onlineFriends.find(f => f.userId === m.userId);
                    return { ...m, avatar: (friend ? friend.avatar : '') || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg' };
                }
                return m;
            });
            
            const existingChat = await db.chats.get(chatId);
            if (existingChat) {
                await db.chats.update(chatId, {
                    name: groupName,
                    timestamp: Date.now()
                });
                if (window.state && window.state.chats && window.state.chats[chatId]) {
                    window.state.chats[chatId].name = groupName;
                    window.state.chats[chatId].timestamp = Date.now();
                }
            } else {
                const memberNames = fullMembers.map(m => m.nickname).join('、');
                const newChat = {
                    id: chatId,
                    name: groupName,
                    avatar: '',
                    lastMessage: `群聊已创建，成员：${memberNames}`,
                    timestamp: Date.now(),
                    unread: 0,
                    unreadCount: 0,
                    isPinned: false,
                    isGroupChat: true,
                    groupId: groupId,
                    history: [{
                        role: 'system',
                        content: `群聊已创建，成员：${memberNames}`,
                        timestamp: Date.now()
                    }],
                    settings: {
                        myAvatar: this.getSafeAvatar() || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'
                    }
                };
                
                await db.chats.add(newChat);
                
                if (window.state && window.state.chats) {
                    window.state.chats[chatId] = newChat;
                }
            }
            
            // 同时更新本地群聊列表中的成员头像
            const localGroup = this.groupChats.find(g => g.groupId === groupId);
            if (localGroup) {
                localGroup.members = fullMembers;
                this.saveGroupChats();
            }
            
            if (typeof window.renderChatListProxy === 'function') {
                await window.renderChatListProxy();
            }
        } catch (error) {
            console.error('添加群聊到聊天列表失败:', error);
        }
    }

    // 收到群消息
    async onReceiveGroupMessage(data) {
        console.log('收到群消息:', data);
        
        const { groupId, fromUserId, fromNickname, fromAvatar, message, timestamp } = data;
        const chatId = groupId;
        
        try {
            const db = await this.waitForDatabase();
            let chat = await db.chats.get(chatId);
            
            if (!chat) {
                // 群聊不在本地，可能是新加入的
                const group = this.groupChats.find(g => g.groupId === groupId);
                chat = {
                    id: chatId,
                    name: group ? group.name : '群聊',
                    avatar: '',
                    lastMessage: message,
                    timestamp: timestamp,
                    unread: 1,
                    unreadCount: 1,
                    isPinned: false,
                    isGroupChat: true,
                    groupId: groupId,
                    history: [],
                    settings: {
                        myAvatar: this.getSafeAvatar() || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'
                    }
                };
            }
            
            if (!Array.isArray(chat.history)) chat.history = [];
            
            // 群消息用特殊格式，带上发送者信息
            const msg = {
                role: 'ai',
                content: message,
                timestamp: timestamp,
                // 群消息额外字段
                senderUserId: fromUserId,
                senderNickname: fromNickname,
                senderAvatar: fromAvatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'
            };
            
            chat.history.push(msg);
            chat.lastMessage = `${fromNickname}: ${message}`;
            chat.timestamp = timestamp;
            chat.unread = (chat.unread || 0) + 1;
            
            await db.chats.put(chat);
            
            // 同步到 state
            if (typeof state !== 'undefined' && state && state.chats) {
                state.chats[chatId] = chat;
            }
            if (typeof window.state !== 'undefined' && window.state && window.state.chats) {
                window.state.chats[chatId] = chat;
            }
            
            // 刷新聊天列表
            if (typeof window.renderChatListProxy === 'function') {
                await window.renderChatListProxy();
            }
            
            // 如果当前正在看这个群聊，立即显示消息
            let currentChatId = null;
            if (typeof state !== 'undefined' && state && state.activeChatId) {
                currentChatId = state.activeChatId;
            } else if (typeof window.state !== 'undefined' && window.state && window.state.activeChatId) {
                currentChatId = window.state.activeChatId;
            }
            
            if (currentChatId === chatId) {
                if (typeof window.appendMessage === 'function') {
                    await window.appendMessage(msg, chat);
                } else if (typeof window.renderChatInterface === 'function') {
                    await window.renderChatInterface(chatId);
                }
            }
            
            // 后台通知
            const isPageHidden = document.hidden || document.visibilityState === 'hidden';
            const isNotInChat = currentChatId !== chatId;
            
            if (isPageHidden || isNotInChat) {
                const group = this.groupChats.find(g => g.groupId === groupId);
                const groupDisplayName = group ? group.name : '群聊';
                
                if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                    try {
                        navigator.serviceWorker.controller.postMessage({
                            type: 'SHOW_NOTIFICATION',
                            title: `${groupDisplayName}`,
                            options: {
                                body: `${fromNickname}: ${message}`,
                                icon: 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1758510900942_qdqqd_djw0z2.jpeg',
                                tag: `group-${chatId}-${Date.now()}`,
                                requireInteraction: true,
                                renotify: true,
                                silent: false,
                                vibrate: [200, 100, 200],
                                data: { type: 'group_chat', chatId: chatId }
                            }
                        });
                    } catch (swErr) {
                        if (window.notificationManager) {
                            window.notificationManager.notifyNewMessage(groupDisplayName, `${fromNickname}: ${message}`, chatId);
                        }
                    }
                } else if (window.notificationManager) {
                    window.notificationManager.notifyNewMessage(groupDisplayName, `${fromNickname}: ${message}`, chatId);
                }
            }
            
        } catch (error) {
            console.error('处理群消息失败:', error);
        }
    }

    // 发送群消息
    async sendGroupMessageToServer(groupId, message) {
        if (!this.isConnected) {
            throw new Error('未连接到服务器');
        }
        
        this.send({
            type: 'send_group_message',
            groupId,
            fromUserId: this.userId,
            fromNickname: this.nickname,
            fromAvatar: this.getSafeAvatar(),
            message,
            timestamp: Date.now()
        });
    }

    // 群成员加入通知
    async onGroupMemberJoined(data) {
        const { groupId, newMembers, inviterNickname, allMembers } = data;
        
        // 更新本地群成员列表
        const group = this.groupChats.find(g => g.groupId === groupId);
        if (group) {
            group.members = allMembers;
            this.saveGroupChats();
        }
        
        // 在聊天中显示系统消息
        const newNames = newMembers.map(m => m.nickname).join('、');
        const systemMsg = `${inviterNickname} 邀请 ${newNames} 加入了群聊`;
        
        try {
            const db = await this.waitForDatabase();
            const chat = await db.chats.get(groupId);
            if (chat) {
                if (!Array.isArray(chat.history)) chat.history = [];
                chat.history.push({
                    role: 'system',
                    content: systemMsg,
                    timestamp: Date.now()
                });
                chat.lastMessage = systemMsg;
                chat.timestamp = Date.now();
                await db.chats.put(chat);
                
                if (window.state && window.state.chats) {
                    window.state.chats[groupId] = chat;
                }
                if (typeof window.renderChatListProxy === 'function') {
                    await window.renderChatListProxy();
                }
            }
        } catch (error) {
            console.error('处理群成员加入通知失败:', error);
        }
    }

    // 群成员退出通知
    async onGroupMemberLeft(data) {
        const { groupId, userId, leaverNickname, allMembers } = data;
        
        // 更新本地群成员列表
        const group = this.groupChats.find(g => g.groupId === groupId);
        if (group) {
            group.members = allMembers;
            this.saveGroupChats();
        }
        
        const systemMsg = `${leaverNickname} 退出了群聊`;
        
        try {
            const db = await this.waitForDatabase();
            const chat = await db.chats.get(groupId);
            if (chat) {
                if (!Array.isArray(chat.history)) chat.history = [];
                chat.history.push({
                    role: 'system',
                    content: systemMsg,
                    timestamp: Date.now()
                });
                chat.lastMessage = systemMsg;
                chat.timestamp = Date.now();
                await db.chats.put(chat);
                
                if (window.state && window.state.chats) {
                    window.state.chats[groupId] = chat;
                }
                if (typeof window.renderChatListProxy === 'function') {
                    await window.renderChatListProxy();
                }
            }
        } catch (error) {
            console.error('处理群成员退出通知失败:', error);
        }
    }

    // 退出群聊
    async leaveGroup(groupId) {
        const group = this.groupChats.find(g => g.groupId === groupId);
        if (!group) return;
        
        if (!confirm(`确定要退出群聊「${group.name}」吗？`)) return;
        
        // 通知服务器
        if (this.isConnected) {
            this.send({
                type: 'leave_group',
                groupId,
                userId: this.userId
            });
        }
        
        // 从本地群列表移除
        this.groupChats = this.groupChats.filter(g => g.groupId !== groupId);
        this.saveGroupChats();
        
        // 从聊天列表删除
        try {
            const db = await this.waitForDatabase();
            await db.chats.delete(groupId);
            
            if (window.state && window.state.chats && window.state.chats[groupId]) {
                delete window.state.chats[groupId];
            }
            
            if (typeof window.renderChatListProxy === 'function') {
                await window.renderChatListProxy();
            }
            
            alert(`已退出群聊「${group.name}」`);
        } catch (error) {
            console.error('退出群聊失败:', error);
        }
    }

    // 打开群聊信息弹窗
    openGroupInfoModal(groupId) {
        const group = this.groupChats.find(g => g.groupId === groupId);
        if (!group) {
            alert('群聊信息不存在');
            return;
        }
        
        const modal = document.getElementById('group-info-modal');
        const contentDiv = document.getElementById('group-info-content');
        
        if (!modal || !contentDiv) return;
        
        contentDiv.innerHTML = `
            <div style="padding: 15px;">
                <div style="font-size: 16px; font-weight: bold; margin-bottom: 15px;">${escapeHTML(group.name)}</div>
                <div style="font-size: 13px; color: #999; margin-bottom: 15px;">群成员 (${group.members.length}人)</div>
                <div style="max-height: 300px; overflow-y: auto;">
                    ${group.members.map(m => `
                        <div style="display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                            <img src="${m.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'}" 
                                 style="width: 36px; height: 36px; border-radius: 50%; margin-right: 10px;" alt="头像">
                            <div>
                                <div style="font-size: 14px;">${escapeHTML(m.nickname)}</div>
                                <div style="font-size: 11px; color: #999;">ID: ${escapeHTML(m.userId)}</div>
                            </div>
                            ${m.userId === this.userId ? '<span style="margin-left: auto; font-size: 11px; color: #007aff;">我</span>' : ''}
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top: 20px; display: flex; gap: 10px;">
                    <button class="shugo-btn shugo-btn-primary" style="flex: 1;" 
                            onclick="onlineChatManager.openInviteToGroupModal('${groupId}')">邀请好友</button>
                    <button class="shugo-btn shugo-btn-danger" style="flex: 1;" 
                            onclick="onlineChatManager.leaveGroup('${groupId}')">退出群聊</button>
                </div>
            </div>
        `;
        
        modal.classList.add('visible');
    }

    // 关闭群聊信息弹窗
    closeGroupInfoModal() {
        const modal = document.getElementById('group-info-modal');
        if (modal) modal.classList.remove('visible');
    }

    // 打开邀请好友入群弹窗
    openInviteToGroupModal(groupId) {
        const group = this.groupChats.find(g => g.groupId === groupId);
        if (!group) return;
        
        // 过滤掉已在群里的好友
        const existingMemberIds = group.members.map(m => m.userId);
        const availableFriends = this.onlineFriends.filter(f => !existingMemberIds.includes(f.userId));
        
        if (availableFriends.length === 0) {
            alert('所有好友都已在群里了');
            return;
        }
        
        // 复用创建群聊弹窗
        const modal = document.getElementById('create-group-modal');
        const listDiv = document.getElementById('create-group-friend-list');
        const nameInput = document.getElementById('group-name-input');
        const confirmBtn = document.getElementById('confirm-create-group-btn');
        const titleSpan = document.querySelector('#create-group-modal .modal-header span:first-child');
        
        if (!modal || !listDiv) return;
        
        // 修改标题和按钮
        if (titleSpan) titleSpan.textContent = '邀请好友入群';
        if (nameInput) nameInput.style.display = 'none';
        if (confirmBtn) {
            confirmBtn.textContent = '确认邀请';
            confirmBtn.onclick = () => this.confirmInviteToGroup(groupId);
        }
        
        listDiv.innerHTML = availableFriends.map((friend, idx) => {
            const friendIndex = this.onlineFriends.indexOf(friend);
            return `
            <label class="shugo-list-item" style="cursor: pointer; display: flex; align-items: center; padding: 10px 15px;">
                <input type="checkbox" class="group-friend-checkbox" value="${friend.userId}" 
                       data-nickname="${escapeHTML(friend.nickname)}" 
                       data-avatar-index="${friendIndex}"
                       style="margin-right: 12px; width: 18px; height: 18px; accent-color: #007aff;">
                <div class="shugo-avatar-wrapper" style="margin-right: 10px;">
                    <img src="${friend.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'}" 
                         class="shugo-avatar" alt="头像" style="width: 40px; height: 40px; border-radius: 50%;">
                </div>
                <div class="shugo-info">
                    <div class="shugo-nickname">${escapeHTML(friend.nickname)}</div>
                    <div class="shugo-id" style="font-size: 11px; color: #999;">ID: ${escapeHTML(friend.userId)}</div>
                </div>
            </label>
            `;
        }).join('');
        
        modal.classList.add('visible');
    }

    // 确认邀请好友入群
    async confirmInviteToGroup(groupId) {
        const checkboxes = document.querySelectorAll('.group-friend-checkbox:checked');
        
        if (checkboxes.length === 0) {
            alert('请至少选择1个好友');
            return;
        }
        
        const newMembers = [];
        checkboxes.forEach(cb => {
            const friendIndex = parseInt(cb.dataset.avatarIndex);
            const friend = this.onlineFriends[friendIndex];
            let avatar = friend ? friend.avatar : '';
            if (avatar && avatar.startsWith('data:image/')) {
                avatar = '';
            }
            newMembers.push({
                userId: cb.value,
                nickname: cb.dataset.nickname,
                avatar: avatar
            });
        });
        
        // 发送邀请请求
        this.send({
            type: 'invite_to_group',
            groupId,
            inviterId: this.userId,
            newMembers
        });
        
        // 本地也更新成员列表
        const group = this.groupChats.find(g => g.groupId === groupId);
        if (group) {
            for (const m of newMembers) {
                if (!group.members.some(existing => existing.userId === m.userId)) {
                    group.members.push(m);
                }
            }
            this.saveGroupChats();
        }
        
        // 关闭弹窗并恢复原始状态
        this.closeCreateGroupModal();
        this.resetCreateGroupModal();
        
        alert(`已邀请 ${newMembers.map(m => m.nickname).join('、')} 加入群聊`);
    }

    // 恢复创建群聊弹窗的原始状态
    resetCreateGroupModal() {
        const titleSpan = document.querySelector('#create-group-modal .modal-header span:first-child');
        const nameInput = document.getElementById('group-name-input');
        const confirmBtn = document.getElementById('confirm-create-group-btn');
        
        if (titleSpan) titleSpan.textContent = '创建群聊';
        if (nameInput) nameInput.style.display = '';
        if (confirmBtn) {
            confirmBtn.textContent = '创建群聊';
            confirmBtn.onclick = () => onlineChatManager.confirmCreateGroup();
        }
    }
}

// 创建全局实例
const onlineChatManager = new OnlineChatManager();

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    onlineChatManager.initUI();
});

// 全局函数供HTML调用
function closeFriendRequestsModal() {
    onlineChatManager.closeFriendRequestsModal();
}

function closeOnlineFriendsModal() {
    onlineChatManager.closeOnlineFriendsModal();
}

function closeCreateGroupModal() {
    onlineChatManager.closeCreateGroupModal();
    onlineChatManager.resetCreateGroupModal();
}

function closeGroupInfoModal() {
    onlineChatManager.closeGroupInfoModal();
}

// 打开联机功能帮助外链
function openOnlineHelpLink(type) {
    let url;
    if (type === 'explain') {
        url = 'online-help-explain.html';
    } else if (type === 'guide') {
        url = 'online-help-guide.html';
    } else if (type === 'deploy') {
        url = 'online-help-deploy.html';
    }
    
    if (url) {
        window.open(url, '_blank');
    }
}
