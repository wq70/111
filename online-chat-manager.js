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
        this.reconnectTimer = null;
        this.heartbeatTimer = null;
        this.shouldAutoReconnect = false; // 是否应该自动重连
        this.reconnectAttempts = 0; // 重连尝试次数
        this.maxReconnectAttempts = 999; // 最大重连次数（几乎无限）
        this.heartbeatMissed = 0; // 心跳丢失次数
        this.maxHeartbeatMissed = 3; // 最大心跳丢失次数
        this.lastHeartbeatTime = null; // 上次心跳时间
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
                    } else if (typeof EPHONE_DEVICE_ID !== 'undefined' && EPHONE_DEVICE_ID) {
                        // 使用设备ID的前12位作为默认ID（去掉连字符）
                        const defaultId = EPHONE_DEVICE_ID.replace(/-/g, '').substring(0, 12);
                        userIdInput.value = defaultId;
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
        this.shouldAutoReconnect = true; // 【新增】标记为应该自动重连
        this.reconnectAttempts = 0; // 重置重连次数
        this.heartbeatMissed = 0; // 重置心跳丢失计数
        
        const statusSpan = document.getElementById('online-connection-status');
        const connectBtn = document.getElementById('connect-online-btn');
        const disconnectBtn = document.getElementById('disconnect-online-btn');
        
        statusSpan.textContent = '已连接';
        statusSpan.className = 'connected';
        connectBtn.style.display = 'none';
        disconnectBtn.style.display = 'inline-block';
        
        // 启动心跳
        this.startHeartbeat();
        
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
            
            // 创建聊天对象
            const newChat = {
                id: chatId,
                name: friend.nickname,
                avatar: friend.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg',
                lastMessage: '已添加为联机好友',
                timestamp: Date.now(),
                unread: 0,
                unreadCount: 0,
                isPinned: false,
                isOnlineFriend: true, // 标记为联机好友
                onlineUserId: friend.userId, // 保存联机用户ID
                history: [], // 消息历史
                settings: {} // 聊天设置
            };
            
            // 检查是否已存在
            const existingChat = await db.chats.get(chatId);
            if (existingChat) {
                console.log('该联机好友已在聊天列表中，更新信息');
                await db.chats.update(chatId, {
                    name: friend.nickname,
                    avatar: friend.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg',
                    lastMessage: '已添加为联机好友',
                    timestamp: Date.now()
                });
                
                // 【关键】同步更新 state.chats
                if (typeof window.state !== 'undefined' && window.state && window.state.chats && window.state.chats[chatId]) {
                    window.state.chats[chatId].name = friend.nickname;
                    window.state.chats[chatId].avatar = friend.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
                    window.state.chats[chatId].lastMessage = '已添加为联机好友';
                    window.state.chats[chatId].timestamp = Date.now();
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
    saveFriendRequests() {
        localStorage.setItem('ephone-friend-requests', JSON.stringify(this.friendRequests));
    }

    // 加载好友申请
    loadFriendRequests() {
        const saved = localStorage.getItem('ephone-friend-requests');
        if (saved) {
            try {
                this.friendRequests = JSON.parse(saved);
                this.updateFriendRequestBadge();
            } catch (error) {
                console.error('加载好友申请失败:', error);
            }
        }
    }

    // 保存好友列表到localStorage
    saveOnlineFriends() {
        localStorage.setItem('ephone-online-friends', JSON.stringify(this.onlineFriends));
    }

    // 加载好友列表
    loadOnlineFriends() {
        const saved = localStorage.getItem('ephone-online-friends');
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
        
        // 【优化】缩短心跳间隔到15秒，并增加健康检查
        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
                // 检查上次心跳是否超时
                if (this.lastHeartbeatTime && Date.now() - this.lastHeartbeatTime > 45000) {
                    console.warn('心跳超时，可能连接异常');
                    this.heartbeatMissed++;
                    
                    // 如果连续多次心跳丢失，主动断开重连
                    if (this.heartbeatMissed >= this.maxHeartbeatMissed) {
                        console.error('心跳连续丢失，主动关闭连接以触发重连');
                        if (this.ws) {
                            this.ws.close();
                        }
                        return;
                    }
                }
                
                // 发送心跳
                this.send({ type: 'heartbeat' });
                console.log('发送心跳包');
            } else if (this.shouldAutoReconnect) {
                // 如果连接断开但应该保持连接，尝试重连
                console.log('检测到连接断开，触发重连');
                this.scheduleReconnect();
            }
        }, 15000); // 每15秒发送一次心跳
        
        // 初始化心跳时间
        this.lastHeartbeatTime = Date.now();
    }

    // 计划重连
    scheduleReconnect() {
        // 如果不应该自动重连，直接返回
        if (!this.shouldAutoReconnect) {
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
                chat = {
                    id: chatId,
                    name: friend ? friend.nickname : '联机好友',
                    avatar: friend ? friend.avatar : 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg',
                    lastMessage: data.message,
                    timestamp: data.timestamp,
                    unread: 1,
                    unreadCount: 1,
                    isPinned: false,
                    isOnlineFriend: true,
                    onlineUserId: data.fromUserId,
                    history: [],
                    settings: {}
                };
                console.log('创建了新chat对象');
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

            // 6. 清除localStorage中的联机设置
            localStorage.removeItem('ephone-online-settings');
            localStorage.removeItem('ephone-online-friends');
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

        } catch (error) {
            console.error('重置联机数据失败:', error);
            alert('重置失败: ' + error.message);
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
