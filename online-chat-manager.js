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
    }

    // 保存设置到localStorage
    saveSettings() {
        const settings = {
            enabled: document.getElementById('enable-online-chat-switch')?.checked || false,
            userId: document.getElementById('my-online-id')?.value || '',
            nickname: document.getElementById('my-online-nickname')?.value || '',
            avatar: this.avatar || '',
            serverUrl: document.getElementById('online-server-url')?.value || ''
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
                
                // 尝试重连（如果不是主动断开）
                if (this.isConnected) {
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
        if (this.ws) {
            this.isConnected = false; // 标记为主动断开
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
                // 心跳响应
                break;
            
            default:
                console.warn('未知消息类型:', data.type);
        }
    }

    // 注册成功
    onRegisterSuccess() {
        this.isConnected = true;
        
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
        
        modal.classList.add('show');
    }

    // 同意好友申请
    async acceptFriendRequest(index) {
        const request = this.friendRequests[index];
        
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
        
        // 【关键】添加到QQ聊天列表
        await this.addToQQChatList(request);
        
        // 从申请列表中移除
        this.friendRequests.splice(index, 1);
        this.saveFriendRequests();
        this.updateFriendRequestBadge();
        
        // 刷新弹窗
        this.openFriendRequestsModal();
        
        alert(`已添加 ${request.nickname} 为好友`);
    }

    // 添加联机好友到QQ聊天列表
    async addToQQChatList(friend) {
        try {
            // 生成唯一的chatId，使用 'online_' 前缀标识联机好友
            const chatId = `online_${friend.userId}`;
            
            // 检查是否已存在
            const existingChat = await db.chats.get(chatId);
            if (existingChat) {
                console.log('该联机好友已在聊天列表中');
                return;
            }
            
            // 创建聊天记录
            await db.chats.add({
                id: chatId,
                name: friend.nickname,
                avatar: friend.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg',
                lastMessage: '已添加为联机好友',
                timestamp: Date.now(),
                unread: 0,
                isOnlineFriend: true, // 标记为联机好友
                onlineUserId: friend.userId // 保存联机用户ID
            });
            
            // 添加系统消息
            await db.messages.add({
                id: `${chatId}_welcome_${Date.now()}`,
                chatId: chatId,
                content: `你们已成为联机好友，现在可以开始聊天了！`,
                sender: 'system',
                timestamp: Date.now()
            });
            
            console.log(`已将联机好友 ${friend.nickname} 添加到QQ聊天列表`);
            
            // 刷新聊天列表（如果有全局刷新函数）
            if (typeof loadChatList === 'function') {
                await loadChatList();
            }
        } catch (error) {
            console.error('添加到QQ聊天列表失败:', error);
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
        // 添加到好友列表
        this.onlineFriends.push({
            userId: data.fromUserId,
            nickname: data.fromNickname,
            avatar: data.fromAvatar,
            online: true
        });
        
        this.saveOnlineFriends();
        
        // 【关键】添加到QQ聊天列表
        await this.addToQQChatList({
            userId: data.fromUserId,
            nickname: data.fromNickname,
            avatar: data.fromAvatar
        });
        
        alert(`${data.fromNickname} 接受了你的好友申请`);
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
        
        modal.classList.add('show');
    }

    // 开始与好友聊天
    async startChatWithFriend(friendId) {
        const chatId = `online_${friendId}`;
        
        // 关闭弹窗
        this.closeOnlineFriendsModal();
        
        // 跳转到聊天界面
        if (typeof openChat === 'function') {
            await openChat(chatId);
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
                await db.chats.delete(chatId);
                await db.messages.where('chatId').equals(chatId).delete();
                console.log(`已从QQ聊天列表删除 ${friend.nickname}`);
                
                // 刷新聊天列表
                if (typeof loadChatList === 'function') {
                    await loadChatList();
                }
            } catch (error) {
                console.error('从QQ聊天列表删除失败:', error);
            }
            
            // 刷新好友列表弹窗
            this.openOnlineFriendsModal();
        }
    }

    // 关闭好友申请弹窗
    closeFriendRequestsModal() {
        const modal = document.getElementById('friend-requests-modal');
        modal.classList.remove('show');
    }

    // 关闭好友列表弹窗
    closeOnlineFriendsModal() {
        const modal = document.getElementById('online-friends-modal');
        modal.classList.remove('show');
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
        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected) {
                this.send({ type: 'heartbeat' });
            }
        }, 30000); // 每30秒发送一次心跳
    }

    // 计划重连
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        this.reconnectTimer = setTimeout(() => {
            console.log('尝试重新连接...');
            this.connect();
        }, 5000); // 5秒后重连
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
        
        const chatId = `online_${data.fromUserId}`;
        
        try {
            // 保存消息到数据库
            await db.messages.add({
                id: `${chatId}_${data.timestamp}`,
                chatId: chatId,
                content: data.message,
                sender: 'ai', // 对方发送的消息
                timestamp: data.timestamp
            });
            
            // 更新聊天列表的最后消息
            const chat = await db.chats.get(chatId);
            if (chat) {
                await db.chats.update(chatId, {
                    lastMessage: data.message,
                    timestamp: data.timestamp,
                    unread: (chat.unread || 0) + 1
                });
            }
            
            // 刷新聊天列表
            if (typeof loadChatList === 'function') {
                await loadChatList();
            }
            
            // 如果当前正在与该好友聊天，刷新聊天界面
            if (typeof currentChatId !== 'undefined' && currentChatId === chatId) {
                if (typeof loadMessages === 'function') {
                    await loadMessages(chatId);
                }
            }
            
            console.log('联机消息已保存');
        } catch (error) {
            console.error('保存联机消息失败:', error);
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
