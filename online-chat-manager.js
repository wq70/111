// ========================================
// 连接APP - 独立联机功能管理器 (完全重写)
// 不再与QQ聊天系统共享任何数据
// ========================================

class OnlineChatManager {
    constructor() {
        this.ws = null;
        this.userId = null;
        this.nickname = null;
        this.avatar = null;
        this.serverUrl = null;
        this.isConnected = false;
        this.friendRequests = [];
        this.onlineFriends = [];
        this.reconnectTimer = null;
        this.heartbeatTimer = null;
        this.shouldAutoReconnect = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 999;
        this.heartbeatMissed = 0;
        this.maxHeartbeatMissed = 3;
        this.lastHeartbeatTime = null;

        // 独立的聊天数据存储 (不使用QQ的 state.chats / db.chats)
        this.chats = {};          // { chatId: { id, name, avatar, lastMessage, timestamp, unread, history[], isGroup, members[] } }
        this.activeChatId = null; // 当前打开的聊天
    }

    // ==================== 数据持久化 (独立于QQ) ====================

    _getStorageKey(suffix) {
        return `online-app-${this.userId || 'default'}-${suffix}`;
    }

    saveChats() {
        try {
            const data = JSON.stringify(this.chats);
            localStorage.setItem(this._getStorageKey('chats'), data);
        } catch (e) {
            console.error('保存连接APP聊天数据失败:', e);
        }
    }

    loadChats() {
        try {
            const data = localStorage.getItem(this._getStorageKey('chats'));
            if (data) {
                this.chats = JSON.parse(data);
            }
        } catch (e) {
            console.error('加载连接APP聊天数据失败:', e);
            this.chats = {};
        }
    }

    saveFriendRequests() {
        try {
            localStorage.setItem(this._getStorageKey('friend-requests'), JSON.stringify(this.friendRequests));
        } catch (e) { console.error('保存好友申请失败:', e); }
    }
    loadFriendRequests() {
        try {
            const data = localStorage.getItem(this._getStorageKey('friend-requests'));
            if (data) this.friendRequests = JSON.parse(data);
        } catch (e) { this.friendRequests = []; }
    }
    saveOnlineFriends() {
        try {
            localStorage.setItem(this._getStorageKey('friends'), JSON.stringify(this.onlineFriends));
        } catch (e) { console.error('保存好友列表失败:', e); }
    }
    loadOnlineFriends() {
        try {
            const data = localStorage.getItem(this._getStorageKey('friends'));
            if (data) this.onlineFriends = JSON.parse(data);
        } catch (e) { this.onlineFriends = []; }
    }

    // ==================== 图片压缩 ====================

    async compressImage(file, maxWidth = 200, maxHeight = 200, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width, h = img.height;
                    if (w > maxWidth) { h = h * maxWidth / w; w = maxWidth; }
                    if (h > maxHeight) { w = w * maxHeight / h; h = maxHeight; }
                    canvas.width = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    getSafeAvatar() {
        if (!this.avatar) return 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
        if (this.avatar.startsWith('data:image/') && this.avatar.length > 50000) {
            return 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
        }
        return this.avatar;
    }

    // ==================== UI初始化 ====================

    initUI() {
        // 启用开关
        const enableSwitch = document.getElementById('online-app-enable-switch');
        const detailsDiv = document.getElementById('online-app-settings-details');

        if (enableSwitch) {
            enableSwitch.addEventListener('change', (e) => {
                detailsDiv.style.display = e.target.checked ? 'block' : 'none';
                if (!e.target.checked) {
                    this.shouldAutoReconnect = false;
                    this.reconnectAttempts = 0;
                    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
                    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
                    if (this.ws) { this.isConnected = false; try { this.ws.close(); } catch(e) {} this.ws = null; }
                    this.updateConnectionUI(false);
                }
                this.saveSettings();
            });
        }

        // 头像上传
        const uploadBtn = document.getElementById('online-app-upload-avatar-btn');
        const resetBtn = document.getElementById('online-app-reset-avatar-btn');
        const avatarInput = document.getElementById('online-app-avatar-input');
        const avatarPreview = document.getElementById('online-app-avatar-preview');

        if (uploadBtn && avatarInput) {
            uploadBtn.addEventListener('click', () => avatarInput.click());
            avatarInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        this.avatar = await this.compressImage(file, 200, 200, 0.8);
                        avatarPreview.src = this.avatar;
                        this.saveSettings();
                        if (this.isConnected) {
                            this.send({ type: 'register', userId: this.userId, nickname: this.nickname, avatar: this.getSafeAvatar() });
                        }
                    } catch (err) { alert('头像上传失败: ' + err.message); }
                }
                e.target.value = '';
            });
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.avatar = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
                avatarPreview.src = this.avatar;
                this.saveSettings();
                if (this.isConnected) {
                    this.send({ type: 'register', userId: this.userId, nickname: this.nickname, avatar: this.avatar });
                }
            });
        }

        // 连接/断开
        const connectBtn = document.getElementById('online-app-connect-btn');
        const disconnectBtn = document.getElementById('online-app-disconnect-btn');
        if (connectBtn) connectBtn.addEventListener('click', () => this.connect());
        if (disconnectBtn) disconnectBtn.addEventListener('click', () => this.disconnect());

        // 搜索好友
        const searchBtn = document.getElementById('online-app-search-btn');
        if (searchBtn) searchBtn.addEventListener('click', () => this.searchFriend());

        // 好友申请
        const reqBtn = document.getElementById('online-app-friend-requests-btn');
        if (reqBtn) reqBtn.addEventListener('click', () => this.openFriendRequestsModal());


        // 清理旧数据
        const clearBtn = document.getElementById('online-app-clear-cache-btn');
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearAllOldData());

        // 重置
        const resetDataBtn = document.getElementById('online-app-reset-btn');
        if (resetDataBtn) resetDataBtn.addEventListener('click', () => this.resetOnlineData());

        // 设置按钮 (从列表视图进入设置)
        const settingsBtn = document.getElementById('online-app-settings-btn');
        if (settingsBtn) settingsBtn.addEventListener('click', () => this.showView('online-app-settings-view'));

        // 设置返回按钮
        const settingsBack = document.getElementById('online-app-settings-back');
        if (settingsBack) settingsBack.addEventListener('click', () => this.showView('online-app-list-view'));

        // 添加好友按钮 (快捷入口)
        const addBtn = document.getElementById('online-app-add-btn');
        if (addBtn) addBtn.addEventListener('click', () => this.showView('online-app-settings-view'));

        // 聊天界面返回
        const backToList = document.getElementById('online-app-back-to-list');
        if (backToList) backToList.addEventListener('click', () => {
            this.activeChatId = null;
            this.showView('online-app-list-view');
        });

        // 发送消息
        const sendBtn = document.getElementById('online-app-send-btn');
        const chatInput = document.getElementById('online-app-chat-input');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendCurrentMessage());
        }
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendCurrentMessage();
                }
            });
            // 自动调整高度
            chatInput.addEventListener('input', () => {
                chatInput.style.height = 'auto';
                chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
            });
        }

        // 加载设置
        this.loadSettings();
        this.setupVisibilityListener();
        this.setupBeforeUnloadListener();
        this.autoReconnectIfNeeded();
    }

    // ==================== 视图切换 ====================

    showView(viewId) {
        document.querySelectorAll('#online-app-screen .online-app-view').forEach(v => v.classList.remove('active'));
        const view = document.getElementById(viewId);
        if (view) view.classList.add('active');

        if (viewId === 'online-app-list-view') {
            this.renderChatList();
        }
    }

    // ==================== 连接状态UI ====================

    updateConnectionUI(connected) {
        const statusDot = document.getElementById('online-app-status-dot');
        const statusText = document.getElementById('online-app-status-text');
        const connStatus = document.getElementById('online-app-conn-status');
        const connectBtn = document.getElementById('online-app-connect-btn');
        const disconnectBtn = document.getElementById('online-app-disconnect-btn');

        if (connected) {
            if (statusDot) { statusDot.className = 'status-dot-online'; }
            if (statusText) statusText.textContent = '已连接';
            if (connStatus) { connStatus.textContent = '已连接'; connStatus.style.color = '#34c759'; }
            if (connectBtn) connectBtn.style.display = 'none';
            if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
        } else {
            if (statusDot) { statusDot.className = 'status-dot-offline'; }
            if (statusText) statusText.textContent = '未连接';
            if (connStatus) { connStatus.textContent = '未连接'; connStatus.style.color = '#999'; }
            if (connectBtn) connectBtn.style.display = 'inline-block';
            if (disconnectBtn) disconnectBtn.style.display = 'none';
        }
    }

    updateConnectingUI() {
        const statusDot = document.getElementById('online-app-status-dot');
        const statusText = document.getElementById('online-app-status-text');
        const connStatus = document.getElementById('online-app-conn-status');
        if (statusDot) statusDot.className = 'status-dot-connecting';
        if (statusText) statusText.textContent = '连接中...';
        if (connStatus) { connStatus.textContent = '连接中...'; connStatus.style.color = '#ff9500'; }
    }

    // ==================== 设置保存/加载 ====================

    saveSettings() {
        try {
            const settings = {
                enabled: document.getElementById('online-app-enable-switch')?.checked || false,
                userId: document.getElementById('online-app-my-id')?.value || '',
                nickname: document.getElementById('online-app-my-nickname')?.value || '',
                avatar: this.avatar || '',
                serverUrl: document.getElementById('online-app-server-url')?.value || '',
                wasConnected: this.shouldAutoReconnect
            };
            const str = JSON.stringify(settings);
            if (str.length > 5 * 1024 * 1024) settings.avatar = '';
            localStorage.setItem('online-app-settings', JSON.stringify(settings));
        } catch (e) {
            console.error('保存连接APP设置失败:', e);
            try {
                const min = {
                    enabled: document.getElementById('online-app-enable-switch')?.checked || false,
                    userId: document.getElementById('online-app-my-id')?.value || '',
                    nickname: document.getElementById('online-app-my-nickname')?.value || '',
                    avatar: '',
                    serverUrl: document.getElementById('online-app-server-url')?.value || '',
                    wasConnected: this.shouldAutoReconnect
                };
                localStorage.setItem('online-app-settings', JSON.stringify(min));
            } catch (err) { console.error('保存简化设置也失败:', err); }
        }
    }

    loadSettings() {
        const saved = localStorage.getItem('online-app-settings');
        // 兼容旧版数据迁移
        const oldSaved = !saved ? localStorage.getItem('ephone-online-settings') : null;
        const raw = saved || oldSaved;

        if (raw) {
            try {
                const s = JSON.parse(raw);
                const enableSwitch = document.getElementById('online-app-enable-switch');
                const detailsDiv = document.getElementById('online-app-settings-details');
                const idInput = document.getElementById('online-app-my-id');
                const nickInput = document.getElementById('online-app-my-nickname');
                const avatarPreview = document.getElementById('online-app-avatar-preview');
                const serverInput = document.getElementById('online-app-server-url');

                if (enableSwitch) {
                    enableSwitch.checked = s.enabled;
                    if (detailsDiv) detailsDiv.style.display = s.enabled ? 'block' : 'none';
                }
                if (idInput) {
                    idInput.value = s.userId || '';
                    this.userId = s.userId || null;
                }
                if (nickInput) nickInput.value = s.nickname || '';
                if (serverInput) serverInput.value = s.serverUrl || '';

                if (s.avatar && (s.avatar.startsWith('data:image/') || s.avatar.startsWith('http'))) {
                    this.avatar = s.avatar;
                    if (avatarPreview) avatarPreview.src = s.avatar;
                } else {
                    this.avatar = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
                    if (avatarPreview) avatarPreview.src = this.avatar;
                }

                if (s.wasConnected) this.shouldAutoReconnect = true;

                // 如果是从旧版迁移，保存到新key
                if (oldSaved && !saved) {
                    this.saveSettings();
                    console.log('已从旧版设置迁移到连接APP');
                }
            } catch (e) {
                console.error('加载连接APP设置失败:', e);
                this.avatar = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
            }
        } else {
            this.avatar = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
            const avatarPreview = document.getElementById('online-app-avatar-preview');
            if (avatarPreview) avatarPreview.src = this.avatar;
        }

        // 加载好友数据和聊天数据
        this.loadFriendRequests();
        this.loadOnlineFriends();
        this.loadChats();
    }

    // ==================== WebSocket连接 ====================

    async connect() {
        const idInput = document.getElementById('online-app-my-id');
        const nickInput = document.getElementById('online-app-my-nickname');
        const serverInput = document.getElementById('online-app-server-url');

        this.userId = idInput?.value.trim();
        this.nickname = nickInput?.value.trim();
        this.serverUrl = serverInput?.value.trim();

        if (!this.userId) { alert('请设置你的ID'); return; }
        if (!this.nickname) { alert('请设置你的昵称'); return; }
        if (!this.serverUrl) { alert('请输入服务器地址'); return; }

        // 重新加载该ID绑定的数据
        this.friendRequests = [];
        this.onlineFriends = [];
        this.loadFriendRequests();
        this.loadOnlineFriends();
        this.loadChats();

        // 关闭旧连接
        if (this.ws) {
            try { if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) this.ws.close(); } catch(e) {}
            this.ws = null;
            await new Promise(r => setTimeout(r, 300));
        }

        this.updateConnectingUI();

        try {
            this.ws = new WebSocket(this.serverUrl);

            this.ws.onopen = () => {
                const avatarToSend = this.getSafeAvatar();
                this.send({ type: 'register', userId: this.userId, nickname: this.nickname, avatar: avatarToSend });
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket错误:', error);
                this.updateConnectionUI(false);
                alert('连接服务器失败，请检查服务器地址');
            };

            this.ws.onclose = () => {
                const wasConnected = this.isConnected || this.shouldAutoReconnect;
                this.isConnected = false;
                this.updateConnectionUI(false);
                if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
                if (this.shouldAutoReconnect && wasConnected) {
                    this.scheduleReconnect();
                }
            };
        } catch (error) {
            console.error('连接失败:', error);
            this.updateConnectionUI(false);
            alert('连接失败: ' + error.message);
        }
    }

    disconnect() {
        this.shouldAutoReconnect = false;
        this.reconnectAttempts = 0;
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        if (this.ws) { this.isConnected = false; this.ws.close(); this.ws = null; }
        this.updateConnectionUI(false);
        this.saveSettings();
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    // ==================== 消息处理 ====================

    handleMessage(data) {
        switch (data.type) {
            case 'register_success': this.onRegisterSuccess(); break;
            case 'register_error': this.onRegisterError(data.error); break;
            case 'search_result': this.onSearchResult(data); break;
            case 'friend_request': this.onFriendRequest(data); break;
            case 'friend_request_accepted': this.onFriendRequestAccepted(data); break;
            case 'friend_request_rejected': this.onFriendRequestRejected(data); break;
            case 'receive_message': this.onReceiveMessage(data); break;
            case 'heartbeat_ack':
                this.heartbeatMissed = 0;
                this.lastHeartbeatTime = Date.now();
                break;
            default: console.warn('未知消息类型:', data.type);
        }
    }

    onRegisterSuccess() {
        this.isConnected = true;
        this.shouldAutoReconnect = true;
        this.reconnectAttempts = 0;
        this.heartbeatMissed = 0;
        this.updateConnectionUI(true);
        this.startHeartbeat();
        this.saveSettings();
        this.renderChatList();
    }

    onRegisterError(error) {
        this.updateConnectionUI(false);
        alert('注册失败: ' + error);
    }

    // ==================== 好友搜索/申请/接受 ====================

    searchFriend() {
        const input = document.getElementById('online-app-search-id');
        const searchId = input?.value.trim();
        if (!searchId) { alert('请输入要搜索的好友ID'); return; }
        if (!this.isConnected) { alert('请先连接服务器'); return; }
        this.send({ type: 'search_user', searchId });
    }

    onSearchResult(data) {
        const resultDiv = document.getElementById('online-app-search-result');
        if (!resultDiv) return;

        if (data.found) {
            const u = data.user;
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;">
                    <img src="${u.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">
                    <div style="flex:1;">
                        <div style="font-weight:bold;">${u.nickname}</div>
                        <div style="font-size:12px;color:#999;">ID: ${u.userId}</div>
                    </div>
                    <button onclick="onlineChatManager.sendFriendRequest('${u.userId}','${u.nickname}','${u.avatar || ''}')" 
                            style="padding:6px 14px;background:#007aff;color:white;border:none;border-radius:6px;cursor:pointer;">添加</button>
                </div>`;
        } else {
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = '<div style="text-align:center;color:#999;">未找到该用户</div>';
        }
    }

    sendFriendRequest(friendId, friendNickname, friendAvatar) {
        if (!this.isConnected) { alert('未连接到服务器'); return; }
        if (friendId === this.userId) { alert('不能添加自己为好友'); return; }
        if (this.onlineFriends.some(f => f.userId === friendId)) { alert('已经是好友了'); return; }
        this.send({
            type: 'friend_request',
            fromUserId: this.userId,
            fromNickname: this.nickname,
            fromAvatar: this.getSafeAvatar(),
            toUserId: friendId
        });
        alert('好友申请已发送');
        const resultDiv = document.getElementById('online-app-search-result');
        if (resultDiv) resultDiv.style.display = 'none';
    }

    onFriendRequest(data) {
        this.friendRequests.push({
            fromUserId: data.fromUserId,
            fromNickname: data.fromNickname,
            fromAvatar: data.fromAvatar,
            timestamp: Date.now()
        });
        this.saveFriendRequests();
        this.updateFriendRequestBadge();
        // 通知
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            try {
                navigator.serviceWorker.controller.postMessage({
                    type: 'SHOW_NOTIFICATION',
                    title: '新的好友申请',
                    options: { body: `${data.fromNickname} 请求添加你为好友`, tag: 'friend-req-' + Date.now() }
                });
            } catch(e) {}
        }
    }

    openFriendRequestsModal() {
        const modal = document.getElementById('friend-requests-modal');
        const list = document.getElementById('friend-requests-list');
        if (!modal || !list) return;

        if (this.friendRequests.length === 0) {
            list.innerHTML = '<div style="text-align:center;color:#999;padding:40px 20px;">暂无好友申请</div>';
        } else {
            list.innerHTML = this.friendRequests.map((req, i) => `
                <div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #eee;">
                    <img src="${req.fromAvatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">
                    <div style="flex:1;">
                        <div style="font-weight:bold;">${req.fromNickname}</div>
                        <div style="font-size:12px;color:#999;">ID: ${req.fromUserId}</div>
                    </div>
                    <button onclick="onlineChatManager.acceptFriendRequest(${i})" style="padding:5px 12px;background:#34c759;color:white;border:none;border-radius:6px;cursor:pointer;">接受</button>
                    <button onclick="onlineChatManager.rejectFriendRequest(${i})" style="padding:5px 12px;background:#ff3b30;color:white;border:none;border-radius:6px;cursor:pointer;">拒绝</button>
                </div>
            `).join('');
        }
        modal.classList.add('visible');
    }

    async acceptFriendRequest(index) {
        const req = this.friendRequests[index];
        if (!req) return;

        const friend = {
            userId: req.fromUserId,
            nickname: req.fromNickname,
            avatar: req.fromAvatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'
        };

        // 添加到好友列表
        if (!this.onlineFriends.some(f => f.userId === friend.userId)) {
            this.onlineFriends.push(friend);
            this.saveOnlineFriends();
        }

        // 通知服务器
        this.send({
            type: 'accept_friend_request',
            fromUserId: req.fromUserId,
            toUserId: this.userId,
            toNickname: this.nickname,
            toAvatar: this.getSafeAvatar()
        });

        // 创建聊天 (独立存储)
        this.addFriendChat(friend);

        // 移除申请
        this.friendRequests.splice(index, 1);
        this.saveFriendRequests();
        this.updateFriendRequestBadge();
        this.openFriendRequestsModal(); // 刷新列表
        this.renderChatList();
    }

    rejectFriendRequest(index) {
        const req = this.friendRequests[index];
        if (!req) return;
        this.send({ type: 'reject_friend_request', fromUserId: req.fromUserId, toUserId: this.userId });
        this.friendRequests.splice(index, 1);
        this.saveFriendRequests();
        this.updateFriendRequestBadge();
        this.openFriendRequestsModal();
    }

    async onFriendRequestAccepted(data) {
        const friend = {
            userId: data.fromUserId,
            nickname: data.fromNickname,
            avatar: data.fromAvatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'
        };
        if (!this.onlineFriends.some(f => f.userId === friend.userId)) {
            this.onlineFriends.push(friend);
            this.saveOnlineFriends();
        }
        this.addFriendChat(friend);
        this.renderChatList();
        alert(`${friend.nickname} 已接受你的好友申请！`);
    }

    onFriendRequestRejected(data) {
        alert(`好友申请被拒绝`);
    }

    updateFriendRequestBadge() {
        const badge = document.getElementById('online-app-friend-badge');
        if (badge) {
            if (this.friendRequests.length > 0) {
                badge.textContent = this.friendRequests.length;
                badge.style.display = 'inline';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    // ==================== 独立聊天数据管理 ====================

    addFriendChat(friend) {
        const chatId = `online_${friend.userId}`;
        if (!this.chats[chatId]) {
            this.chats[chatId] = {
                id: chatId,
                name: friend.nickname,
                avatar: friend.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg',
                lastMessage: '已添加为联机好友',
                timestamp: Date.now(),
                unread: 0,
                isGroup: false,
                history: [{ role: 'system', content: '你们已成为联机好友，现在可以开始聊天了！', timestamp: Date.now() }]
            };
        } else {
            // 更新信息
            this.chats[chatId].name = friend.nickname;
            this.chats[chatId].avatar = friend.avatar || this.chats[chatId].avatar;
        }
        this.saveChats();
    }

    // ==================== 收发消息 (独立，不碰QQ) ====================

    sendCurrentMessage() {
        const input = document.getElementById('online-app-chat-input');
        const content = input?.value.trim();
        if (!content || !this.activeChatId) return;

        if (!this.isConnected) {
            alert('未连接到服务器，无法发送消息');
            return;
        }

        const chat = this.chats[this.activeChatId];
        if (!chat) return;

        // 发送到服务器
        const friendUserId = this.activeChatId.replace('online_', '');
        this.send({
            type: 'send_message',
            toUserId: friendUserId,
            fromUserId: this.userId,
            message: content,
            timestamp: Date.now()
        });

        // 保存到本地
        const msg = {
            role: 'user',
            content: content,
            timestamp: Date.now()
        };

        if (!Array.isArray(chat.history)) chat.history = [];
        chat.history.push(msg);
        chat.lastMessage = content;
        chat.timestamp = Date.now();
        this.saveChats();

        // 显示消息
        this.appendMessageToUI(msg, chat);

        // 清空输入
        input.value = '';
        input.style.height = 'auto';
        input.focus();
    }

    async onReceiveMessage(data) {
        const chatId = `online_${data.fromUserId}`;
        let chat = this.chats[chatId];

        if (!chat) {
            const friend = this.onlineFriends.find(f => f.userId === data.fromUserId);
            chat = {
                id: chatId,
                name: friend ? friend.nickname : '联机好友',
                avatar: friend ? friend.avatar : 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg',
                lastMessage: data.message,
                timestamp: data.timestamp,
                unread: 0,
                isGroup: false,
                history: []
            };
            this.chats[chatId] = chat;
        }

        if (!Array.isArray(chat.history)) chat.history = [];

        const msg = { role: 'ai', content: data.message, timestamp: data.timestamp };
        chat.history.push(msg);
        chat.lastMessage = data.message;
        chat.timestamp = data.timestamp;

        // 未读计数
        if (this.activeChatId !== chatId) {
            chat.unread = (chat.unread || 0) + 1;
        }

        this.saveChats();

        // 如果当前正在看这个聊天，立即显示
        if (this.activeChatId === chatId) {
            this.appendMessageToUI(msg, chat);
        }

        // 刷新列表
        this.renderChatList();

        // 通知
        this.sendNotification(chat.name, data.message, chatId);
    }


    sendNotification(title, body, chatId) {
        const isPageHidden = document.hidden || document.visibilityState === 'hidden';
        const isNotInChat = this.activeChatId !== chatId;
        if (!isPageHidden && !isNotInChat) return;

        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            try {
                navigator.serviceWorker.controller.postMessage({
                    type: 'SHOW_NOTIFICATION',
                    title: title,
                    options: {
                        body: body,
                        icon: 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1758510900942_qdqqd_djw0z2.jpeg',
                        tag: `online-${chatId}-${Date.now()}`,
                        requireInteraction: true,
                        renotify: true,
                        vibrate: [200, 100, 200]
                    }
                });
            } catch(e) {
                if (window.notificationManager) window.notificationManager.notifyNewMessage(title, body, chatId);
            }
        } else if (window.notificationManager) {
            window.notificationManager.notifyNewMessage(title, body, chatId);
        }
    }

    // ==================== UI渲染 (独立于QQ) ====================

    renderChatList() {
        const listEl = document.getElementById('online-app-chat-list');
        if (!listEl) return;

        const allChats = Object.values(this.chats).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        if (allChats.length === 0) {
            listEl.innerHTML = `<div class="online-app-empty-hint">
                <p>暂无联机好友</p>
                <p style="font-size:12px;color:#999;">点击右上角 ⚙ 配置联机，点击 + 添加好友</p>
            </div>`;
            return;
        }

        listEl.innerHTML = '';
        allChats.forEach(chat => {
            const item = document.createElement('div');
            item.className = 'online-chat-list-item';
            item.dataset.chatId = chat.id;

            const avatar = chat.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
            const lastMsg = chat.lastMessage || '...';
            const unread = chat.unread || 0;

            item.innerHTML = `
                <div class="avatar-group">
                    <img src="${avatar}" class="avatar" onerror="this.src='https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'">
                </div>
                <div class="info">
                    <div class="name-line">
                        <span class="name">${chat.name}</span>
                    </div>
                    <div class="last-msg">${lastMsg.substring(0, 30)}</div>
                </div>
                <div class="unread-count-wrapper">
                    <span class="unread-count" style="display:${unread > 0 ? 'inline-flex' : 'none'};">${unread > 99 ? '99+' : unread}</span>
                </div>`;

            item.addEventListener('click', () => this.openChat(chat.id));

            // 长按删除
            let pressTimer = null;
            item.addEventListener('touchstart', (e) => {
                pressTimer = setTimeout(() => {
                    if (confirm(`删除与「${chat.name}」的对话？`)) {
                        delete this.chats[chat.id];
                        this.saveChats();
                        this.renderChatList();
                    }
                }, 600);
            }, { passive: true });
            item.addEventListener('touchend', () => { if (pressTimer) clearTimeout(pressTimer); });
            item.addEventListener('touchmove', () => { if (pressTimer) clearTimeout(pressTimer); });

            listEl.appendChild(item);
        });
    }

    openChat(chatId) {
        const chat = this.chats[chatId];
        if (!chat) return;

        this.activeChatId = chatId;
        chat.unread = 0;
        this.saveChats();

        // 更新标题
        const titleEl = document.getElementById('online-app-chat-title');
        if (titleEl) titleEl.textContent = chat.name;

        // 渲染消息
        this.renderMessages(chat);

        // 切换视图
        this.showView('online-app-chat-view');
    }

    renderMessages(chat) {
        const container = document.getElementById('online-app-messages');
        if (!container) return;
        container.innerHTML = '';

        const history = chat.history || [];
        history.forEach(msg => {
            this.appendMessageToUI(msg, chat, false);
        });

        // 滚动到底部
        requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
    }

    appendMessageToUI(msg, chat, scroll = true) {
        const container = document.getElementById('online-app-messages');
        if (!container) return;

        const div = document.createElement('div');

        if (msg.role === 'system') {
            div.className = 'online-msg system';
            div.textContent = msg.content;
        } else if (msg.role === 'user') {
            div.className = 'online-msg user';
            div.innerHTML = `<div>${this.escapeHtml(msg.content)}</div>`;
            div.innerHTML += `<div class="msg-time">${this.formatTime(msg.timestamp)}</div>`;
        } else {
            div.className = 'online-msg friend';
            div.innerHTML = `<div>${this.escapeHtml(msg.content)}</div>`;
            div.innerHTML += `<div class="msg-time">${this.formatTime(msg.timestamp)}</div>`;
        }

        container.appendChild(div);

        if (scroll) {
            requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatTime(timestamp) {
        if (!timestamp) return '';
        const d = new Date(timestamp);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }

    // ==================== 心跳/重连/保活 ====================

    startHeartbeat() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.heartbeatMissed++;
                if (this.heartbeatMissed > this.maxHeartbeatMissed) {
                    console.log('心跳超时，断开重连');
                    this.ws.close();
                    return;
                }
                this.send({ type: 'heartbeat', userId: this.userId });
            }
        }, 25000);
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
        const delay = Math.min(3000 * Math.pow(1.5, this.reconnectAttempts), 60000);
        this.reconnectAttempts++;
        console.log(`[连接APP] ${delay / 1000}秒后重连 (第${this.reconnectAttempts}次)`);
        this.reconnectTimer = setTimeout(() => {
            if (this.shouldAutoReconnect && !this.isConnected) {
                this.connect();
            }
        }, delay);
    }

    setupVisibilityListener() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.shouldAutoReconnect && !this.isConnected) {
                console.log('[连接APP] 页面恢复可见，尝试重连');
                this.connect();
            }
        });
    }

    setupBeforeUnloadListener() {
        window.addEventListener('beforeunload', () => {
            this.saveSettings();
            this.saveChats();
        });
    }

    autoReconnectIfNeeded() {
        if (this.shouldAutoReconnect && !this.isConnected) {
            const enableSwitch = document.getElementById('online-app-enable-switch');
            if (enableSwitch && enableSwitch.checked) {
                const idInput = document.getElementById('online-app-my-id');
                const serverInput = document.getElementById('online-app-server-url');
                if (idInput?.value && serverInput?.value) {
                    console.log('[连接APP] 自动重连...');
                    setTimeout(() => this.connect(), 1000);
                }
            }
        }
    }

    // ==================== 清理/重置 ====================

    async clearAllOldData() {
        if (!confirm('清理所有旧数据？\n\n将清除缓存的旧头像数据，不会删除好友关系和聊天记录。')) return;

        // 更新好友列表中的头像
        for (const friend of this.onlineFriends) {
            if (friend.avatar && friend.avatar.startsWith('data:image/') && friend.avatar.length > 50000) {
                friend.avatar = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
            }
        }
        this.saveOnlineFriends();

        // 更新聊天中的头像
        for (const chatId in this.chats) {
            const chat = this.chats[chatId];
            if (chat.avatar && chat.avatar.startsWith('data:image/') && chat.avatar.length > 50000) {
                chat.avatar = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
            }
        }
        this.saveChats();

        alert('旧数据已清理完成');
        this.renderChatList();
    }

    async resetOnlineData() {
        if (!confirm('⚠️ 重置联机数据\n\n将删除所有联机好友、聊天记录和群聊数据。\n此操作不可撤销！')) return;

        this.disconnect();
        this.friendRequests = [];
        this.onlineFriends = [];
        this.chats = {};
        this.activeChatId = null;

        this.saveFriendRequests();
        this.saveOnlineFriends();
        this.saveChats();

        this.renderChatList();
        this.showView('online-app-list-view');
        alert('联机数据已重置');
    }

    // ==================== 好友删除 ====================

    async deleteFriend(index) {
        const friend = this.onlineFriends[index];
        if (!friend) return;
        if (!confirm(`确定要删除好友「${friend.nickname}」吗？\n聊天记录也会被删除。`)) return;

        const chatId = `online_${friend.userId}`;
        this.onlineFriends.splice(index, 1);
        this.saveOnlineFriends();
        delete this.chats[chatId];
        this.saveChats();

        if (this.activeChatId === chatId) {
            this.activeChatId = null;
            this.showView('online-app-list-view');
        }
        this.renderChatList();
    }
}

// ==================== 全局实例和初始化 ====================

const onlineChatManager = new OnlineChatManager();

// 关闭弹窗的全局函数
function closeFriendRequestsModal() {
    const modal = document.getElementById('friend-requests-modal');
    if (modal) modal.classList.remove('visible');
}
function closeOnlineFriendsModal() {
    const modal = document.getElementById('online-friends-modal');
    if (modal) modal.classList.remove('visible');
}
function openOnlineHelpLink(type) {
    const urls = {
        explain: 'online-help-explain.html',
        guide: 'online-help-guide.html',
        deploy: 'online-help-deploy.html'
    };
    window.open(urls[type] || urls.explain, '_blank');
}

// DOM加载后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => onlineChatManager.initUI());
} else {
    onlineChatManager.initUI();
}
