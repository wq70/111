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
        const avatarInput = document.getElementById('online-avatar-input');
        const avatarPreview = document.getElementById('my-online-avatar-preview');
        
        if (uploadAvatarBtn && avatarInput) {
            uploadAvatarBtn.addEventListener('click', () => {
                avatarInput.click();
            });
            
            avatarInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        this.avatar = event.target.result;
                        avatarPreview.src = this.avatar;
                        this.saveSettings();
                    };
                    reader.readAsDataURL(file);
                }
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
        const settings = {
            enabled: document.getElementById('enable-online-chat-switch')?.checked || false,
            userId: document.getElementById('my-online-id')?.value || '',
            nickname: document.getElementById('my-online-nickname')?.value || '',
            avatar: this.avatar || '',
            serverUrl: document.getElementById('online-server-url')?.value || '',
            wasConnected: this.shouldAutoReconnect // 【新增】保存连接状态
        };
        localStorage.setItem('ephone-online-settings', JSON.stringify(settings));
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
                
                if (userIdInput) userIdInput.value = settings.userId || '';
                if (nicknameInput) nicknameInput.value = settings.nickname || '';
                if (serverUrlInput) serverUrlInput.value = settings.serverUrl || '';
                
                if (settings.avatar && avatarPreview) {
                    this.avatar = settings.avatar;
                    avatarPreview.src = settings.avatar;
                }
                
                // 【新增】恢复连接状态标记
                if (settings.wasConnected) {
                    this.shouldAutoReconnect = true;
                }
            } catch (error) {
                console.error('加载联机设置失败:', error);
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

        // 更新状态
        statusSpan.textContent = '连接中...';
        statusSpan.className = 'connecting';

        try {
            // 创建WebSocket连接
            this.ws = new WebSocket(this.serverUrl);

            this.ws.onopen = () => {
                console.log('WebSocket连接已建立');
                
                // 发送注册消息
                this.send({
                    type: 'register',
                    userId: this.userId,
                    nickname: this.nickname,
                    avatar: this.avatar || ''
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
        alert('注册失败: ' + error);
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
        
        this.send({
            type: 'friend_request',
            toUserId: friendId,
            fromUserId: this.userId,
            fromNickname: this.nickname,
            fromAvatar: this.avatar || ''
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
                <div class="empty-state">
                    <div style="font-size: 14px; color: #999;">暂无好友申请</div>
                </div>
            `;
        } else {
            listDiv.innerHTML = this.friendRequests.map((request, index) => `
                <div class="friend-request-item">
                    <img src="${request.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'}" 
                         class="friend-request-avatar" alt="头像">
                    <div class="friend-request-info">
                        <div class="friend-request-nickname">${escapeHTML(request.nickname)}</div>
                        <div class="friend-request-id">ID: ${escapeHTML(request.userId)}</div>
                        <div class="friend-request-time">${this.formatTime(request.timestamp)}</div>
                    </div>
                    <div class="friend-request-actions">
                        <button class="friend-request-accept-btn" 
                                onclick="onlineChatManager.acceptFriendRequest(${index})">同意</button>
                        <button class="friend-request-reject-btn" 
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
        
        // 发送同意消息到服务器
        this.send({
            type: 'accept_friend_request',
            toUserId: request.userId,
            fromUserId: this.userId,
            fromNickname: this.nickname,
            fromAvatar: this.avatar || ''
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
                <div class="empty-state">
                    <div style="font-size: 14px; color: #999;">暂无联机好友</div>
                    <div style="margin-top: 10px; font-size: 13px; color: #aaa;">搜索ID添加好友吧</div>
                </div>
            `;
        } else {
            listDiv.innerHTML = this.onlineFriends.map((friend, index) => `
                <div class="online-friend-item">
                    <div class="online-friend-avatar-wrapper">
                        <img src="${friend.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'}" 
                             class="online-friend-avatar" alt="头像">
                        <div class="online-friend-status-dot ${friend.online ? 'online' : 'offline'}"></div>
                    </div>
                    <div class="online-friend-info">
                        <div class="online-friend-nickname">${escapeHTML(friend.nickname)}</div>
                        <div class="online-friend-id">ID: ${escapeHTML(friend.userId)}</div>
                    </div>
                    <div class="online-friend-actions">
                        <button class="online-friend-chat-btn" 
                                onclick="onlineChatManager.startChatWithFriend('${friend.userId}')">聊天</button>
                        <button class="online-friend-delete-btn" 
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
                
                // 【关键】如果应该保持连接但当前未连接，立即重连
                if (this.shouldAutoReconnect && !this.isConnected) {
                    console.log('检测到页面重新显示，尝试重新连接...');
                    this.reconnectAttempts = 0; // 重置重连次数
                    this.connect();
                } else if (this.isConnected) {
                    // 即使已连接，也发送一个心跳检查连接健康
                    this.send({ type: 'heartbeat' });
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
    }
    
    if (url) {
        window.open(url, '_blank');
    }
}
