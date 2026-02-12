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

        // AI角色相关
        this.myAiCharacter = null; // 当前用户拉入群聊的AI角色 { chatId(主屏幕chatId), originalName, avatar, ownerUserId }
        this.aiCharactersInGroup = {}; // groupId -> [{ characterId, originalName, avatar, ownerUserId, ownerNickname }]
        this.isAiResponding = false; // AI是否正在回复中
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

        // 搜索好友 - 打开弹窗
        const searchBtn = document.getElementById('online-app-search-btn');
        if (searchBtn) searchBtn.addEventListener('click', () => this.searchFriend());
        // 弹窗内的搜索按钮
        const searchDoBtn = document.getElementById('online-app-search-do-btn');
        if (searchDoBtn) searchDoBtn.addEventListener('click', () => this.doSearch());
        // 弹窗内回车搜索
        const searchInput = document.getElementById('online-app-search-id');
        if (searchInput) searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.doSearch();
        });

        // 好友申请
        const reqBtn = document.getElementById('online-app-friend-requests-btn');
        if (reqBtn) reqBtn.addEventListener('click', () => this.openFriendRequestsModal());


        // 创建群聊
        const createGroupBtn = document.getElementById('online-app-create-group-btn');
        if (createGroupBtn) createGroupBtn.addEventListener('click', () => this.openCreateGroupModal());

        // 群聊信息按钮
        const groupInfoBtn = document.getElementById('online-app-group-info-btn');
        if (groupInfoBtn) groupInfoBtn.addEventListener('click', () => this.openGroupInfoModal());

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
            // 输入时关闭表情面板
            chatInput.addEventListener('focus', () => {
                const panel = document.getElementById('online-sticker-panel');
                if (panel) panel.style.display = 'none';
            });
        }

        // 表情包按钮
        const stickerBtn = document.getElementById('online-app-sticker-btn');
        if (stickerBtn) stickerBtn.addEventListener('click', () => this.toggleStickerPanel());
        const stickerCloseBtn = document.getElementById('online-sticker-close-btn');
        if (stickerCloseBtn) stickerCloseBtn.addEventListener('click', () => {
            const panel = document.getElementById('online-sticker-panel');
            if (panel) panel.style.display = 'none';
        });
        const stickerAddBtn = document.getElementById('online-sticker-add-btn');
        if (stickerAddBtn) stickerAddBtn.addEventListener('click', () => this.addSticker());
        const stickerUploadInput = document.getElementById('online-sticker-upload-input');
        if (stickerUploadInput) stickerUploadInput.addEventListener('change', (e) => {
            this.handleStickerUpload(e.target.files[0]);
            e.target.value = '';
        });

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

                if (s.wasConnected && s.enabled) this.shouldAutoReconnect = true;

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
        this.loadAiCharacters();
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

        // 断线时通知移除所有我的AI角色
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            for (const [groupId, chars] of Object.entries(this.aiCharactersInGroup)) {
                const myChar = chars.find(c => c.ownerUserId === this.userId);
                if (myChar) {
                    const chat = this.chats[groupId];
                    this.send({
                        type: 'ai_character_leave',
                        groupId: groupId,
                        characterId: myChar.characterId,
                        characterName: myChar.originalName,
                        members: chat ? chat.members.filter(m => !m.isAiCharacter || m.ownerUserId !== this.userId).map(m => m.userId) : []
                    });
                }
            }
        }

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
            case 'receive_group_message': this.onReceiveGroupMessage(data); break;
            case 'receive_group_created': this.onReceiveGroupMessage(data); break;
            case 'ai_character_join': this.onAiCharacterJoin(data); break;
            case 'ai_character_leave': this.onAiCharacterLeave(data); break;
            case 'heartbeat_ack':
                this.heartbeatMissed = 0;
                this.lastHeartbeatTime = Date.now();
                break;
            default: console.warn('未知消息类型:', data.type, data);
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
            // 打开搜索弹窗
            const modal = document.getElementById('search-friend-modal');
            if (modal) {
                // 清空上次的搜索结果
                const resultDiv = document.getElementById('online-app-search-result');
                if (resultDiv) resultDiv.innerHTML = '<div style="text-align:center;color:#999;padding:30px 20px;">输入对方的ID进行搜索</div>';
                const input = document.getElementById('online-app-search-id');
                if (input) input.value = '';
                modal.classList.add('visible');
            }
        }

        doSearch() {
            const input = document.getElementById('online-app-search-id');
            const searchId = input?.value.trim();
            if (!searchId) { alert('请输入要搜索的好友ID'); return; }
            if (!this.isConnected) { alert('请先连接服务器'); return; }
            // 显示搜索中状态
            const resultDiv = document.getElementById('online-app-search-result');
            if (resultDiv) resultDiv.innerHTML = '<div style="text-align:center;color:#999;padding:30px 20px;">搜索中...</div>';
            console.log('[搜索好友] 发送搜索请求, searchId:', JSON.stringify(searchId), ', 我的ID:', JSON.stringify(this.userId));
            this.send({ type: 'search_user', searchId });
            // 5秒超时
            this._searchTimeout = setTimeout(() => {
                if (resultDiv && resultDiv.innerHTML.includes('搜索中')) {
                    resultDiv.innerHTML = '<div style="text-align:center;color:#ff3b30;padding:30px 20px;">搜索超时，服务器未响应。<br>请检查服务器是否支持搜索功能。</div>';
                }
            }, 5000);
        }

    onSearchResult(data) {
            if (this._searchTimeout) { clearTimeout(this._searchTimeout); this._searchTimeout = null; }
            console.log('[搜索好友] 收到搜索结果:', JSON.stringify(data));
            const resultDiv = document.getElementById('online-app-search-result');
            if (!resultDiv) return;

            if (data.found && data.user) {
                const u = data.user;
                const safeNickname = this.escapeHtml(u.nickname || '未知');
                const safeUserId = this.escapeHtml(u.userId || '');
                const safeAvatar = u.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
                resultDiv.innerHTML = `
                    <div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #eee;">
                        <img src="${safeAvatar}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">
                        <div style="flex:1;">
                            <div style="font-weight:bold;">${safeNickname}</div>
                            <div style="font-size:12px;color:#999;">ID: ${safeUserId}</div>
                        </div>
                        <button onclick="onlineChatManager.sendFriendRequest('${safeUserId.replace(/'/g, "\\'")}','${safeNickname.replace(/'/g, "\\'")}','${safeAvatar.replace(/'/g, "\\'")}')" 
                                style="padding:5px 12px;background:#34c759;color:white;border:none;border-radius:6px;cursor:pointer;">添加好友</button>
                    </div>`;
            } else {
                resultDiv.innerHTML = '<div style="text-align:center;color:#999;padding:30px 20px;">未找到该用户，请确认对方已连接服务器</div>';
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
            // 关闭搜索弹窗
            const modal = document.getElementById('search-friend-modal');
            if (modal) modal.classList.remove('visible');
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

        if (chat.isGroup) {
            // 群聊：发送给所有真人群成员（排除AI角色）
            const groupId = chat.id;
            this.send({
                type: 'send_group_message',
                groupId: groupId,
                members: chat.members.filter(m => !m.isAiCharacter).map(m => m.userId),
                fromUserId: this.userId,
                fromNickname: this.nickname,
                fromAvatar: this.getSafeAvatar(),
                message: content,
                timestamp: Date.now()
            });
        } else {
            // 单聊
            const friendUserId = this.activeChatId.replace('online_', '');
            this.send({
                type: 'send_message',
                toUserId: friendUserId,
                fromUserId: this.userId,
                message: content,
                timestamp: Date.now()
            });
        }

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

        const STICKER_RE = /(^https:\/\/i\.postimg\.cc\/.+|^https:\/\/files\.catbox\.moe\/.+|^https?:\/\/sharkpan\.xyz\/.+|^data:image|\.(png|jpg|jpeg|gif|webp)\?.*$|\.(png|jpg|jpeg|gif|webp)$)/i;
        const isSticker = STICKER_RE.test(data.message);
        const displayMsg = isSticker ? '[表情包]' : data.message;

        const msg = { role: 'ai', content: data.message, timestamp: data.timestamp };
        chat.history.push(msg);
        chat.lastMessage = displayMsg;
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

            // 群聊显示多头像，单聊显示单头像
            let avatarHtml;
            if (chat.isGroup && chat.members && chat.members.length > 0) {
                const showMembers = chat.members.slice(0, 4);
                const avatarImgs = showMembers.map(m =>
                    `<img src="${m.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'}" onerror="this.src='https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'">`
                ).join('');
                avatarHtml = `<div class="avatar-group group-avatar-grid grid-${showMembers.length}">${avatarImgs}</div>`;
            } else {
                avatarHtml = `<div class="avatar-group"><img src="${avatar}" class="avatar" onerror="this.src='https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'"></div>`;
            }

            item.innerHTML = `
                ${avatarHtml}
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

        // 群聊信息按钮
        const groupInfoBtn = document.getElementById('online-app-group-info-btn');
        if (groupInfoBtn) groupInfoBtn.style.display = chat.isGroup ? 'inline' : 'none';

        // AI调用按钮
        this.updateAiCallButton();

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

            const STICKER_RE = /(^https:\/\/i\.postimg\.cc\/.+|^https:\/\/files\.catbox\.moe\/.+|^https?:\/\/sharkpan\.xyz\/.+|^data:image|\.(png|jpg|jpeg|gif|webp)\?.*$|\.(png|jpg|jpeg|gif|webp)$)/i;

            if (msg.role === 'system') {
                const div = document.createElement('div');
                div.className = 'online-msg system';
                div.textContent = msg.content;
                container.appendChild(div);
            } else {
                const wrapper = document.createElement('div');
                wrapper.className = msg.role === 'user' ? 'online-msg-row user' : 'online-msg-row friend';

                let avatarSrc;
                if (msg.role === 'user') {
                    avatarSrc = this.getSafeAvatar();
                } else if (chat.isGroup && msg.senderAvatar) {
                    avatarSrc = msg.senderAvatar;
                } else {
                    avatarSrc = chat.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
                }

                const isSticker = STICKER_RE.test(msg.content);
                let contentHtml;
                if (isSticker) {
                    contentHtml = `<img class="sticker-in-msg" src="${msg.content}">`;
                } else {
                    contentHtml = `<div>${this.escapeHtml(msg.content)}</div>`;
                }

                // 群聊中显示发送者昵称
                let senderNameHtml = '';
                if (chat.isGroup && msg.role !== 'user' && msg.senderNickname) {
                    senderNameHtml = `<div class="group-msg-sender">${this.escapeHtml(msg.senderNickname)}</div>`;
                }

                const bubbleClass = isSticker ? 'online-msg sticker-bubble' : `online-msg ${msg.role === 'user' ? 'user' : 'friend'}`;
                const bubble = `<div class="${bubbleClass}">
                    ${senderNameHtml}
                    ${contentHtml}
                    <div class="msg-time">${this.formatTime(msg.timestamp)}</div>
                </div>`;

                const avatar = `<img class="online-msg-avatar" src="${avatarSrc}">`;

                if (msg.role === 'user') {
                    wrapper.innerHTML = bubble + avatar;
                } else {
                    wrapper.innerHTML = avatar + bubble;
                }

                container.appendChild(wrapper);
            }

            if (scroll) {
                requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
            }
        }

    // ========== 表情包面板 ==========
    toggleStickerPanel() {
        const panel = document.getElementById('online-sticker-panel');
        if (!panel) return;
        if (panel.style.display === 'none' || !panel.style.display) {
            this.renderStickerPanel();
            panel.style.display = 'flex';
        } else {
            panel.style.display = 'none';
        }
    }

    async renderStickerPanel() {
            const grid = document.getElementById('online-sticker-grid');
            const tabs = document.getElementById('online-sticker-tabs');
            if (!grid || !tabs) return;

            // 渲染分类标签
            tabs.innerHTML = '';
            const allTab = document.createElement('button');
            allTab.className = 'os-tab' + (this._stickerCat === 'all' || !this._stickerCat ? ' active' : '');
            allTab.textContent = '全部';
            allTab.onclick = () => { this._stickerCat = 'all'; this.renderStickerPanel(); };
            tabs.appendChild(allTab);

            if (typeof db !== 'undefined' && db.stickerCategories) {
                const cats = await db.stickerCategories.toArray();
                cats.forEach(cat => {
                    const t = document.createElement('button');
                    t.className = 'os-tab' + (this._stickerCat === cat.id ? ' active' : '');
                    t.textContent = cat.name;
                    t.onclick = () => { this._stickerCat = cat.id; this.renderStickerPanel(); };
                    tabs.appendChild(t);
                });
            }

            const uncatTab = document.createElement('button');
            uncatTab.className = 'os-tab' + (this._stickerCat === 'uncategorized' ? ' active' : '');
            uncatTab.textContent = '未分类';
            uncatTab.onclick = () => { this._stickerCat = 'uncategorized'; this.renderStickerPanel(); };
            tabs.appendChild(uncatTab);

            // 获取表情列表
            let stickers = (typeof state !== 'undefined' && state.userStickers) ? state.userStickers : [];
            if (this._stickerCat === 'uncategorized') {
                stickers = stickers.filter(s => !s.categoryId);
            } else if (this._stickerCat && this._stickerCat !== 'all') {
                stickers = stickers.filter(s => s.categoryId === this._stickerCat);
            }

            grid.innerHTML = '';
            if (stickers.length === 0) {
                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#999;padding:30px 0;">暂无表情包<br><span style="font-size:12px;">点击右上角"添加"上传表情</span></div>';
                return;
            }

            stickers.forEach(sticker => {
                const item = document.createElement('div');
                item.className = 'online-sticker-item';
                const img = document.createElement('img');
                img.src = sticker.url;
                img.alt = sticker.name;
                img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
                img.onerror = function() { this.style.display = 'none'; };
                item.appendChild(img);
                const nameEl = document.createElement('div');
                nameEl.className = 'online-sticker-name';
                nameEl.textContent = sticker.name;
                item.appendChild(nameEl);
                item.onclick = () => this.sendSticker(sticker);
                grid.appendChild(item);
            });
        }

    sendSticker(sticker) {
            if (!sticker || !sticker.url) return;
            if (!this.activeChatId) return;
            if (!this.isConnected) { alert('未连接到服务器'); return; }

            const chat = this.chats[this.activeChatId];
            if (!chat) return;

            // base64图片太大，无法通过WebSocket发送给对方
            if (sticker.url.startsWith('data:image/')) {
                alert('这个表情还没上传到图床，暂时无法发送给对方。\n请稍等片刻让图片自动上传完成，或重新添加表情。');
                return;
            }

            if (chat.isGroup) {
                this.send({
                    type: 'send_group_message',
                    groupId: chat.id,
                    members: chat.members.filter(m => !m.isAiCharacter).map(m => m.userId),
                    fromUserId: this.userId,
                    fromNickname: this.nickname,
                    fromAvatar: this.getSafeAvatar(),
                    message: sticker.url,
                    timestamp: Date.now()
                });
            } else {
                const friendUserId = this.activeChatId.replace('online_', '');
                this.send({
                    type: 'send_message',
                    toUserId: friendUserId,
                    fromUserId: this.userId,
                    message: sticker.url,
                    timestamp: Date.now()
                });
            }

            const msg = { role: 'user', content: sticker.url, timestamp: Date.now() };
            if (!Array.isArray(chat.history)) chat.history = [];
            chat.history.push(msg);
            chat.lastMessage = '[表情包]';
            chat.timestamp = Date.now();
            this.saveChats();
            this.appendMessageToUI(msg, chat);

            // 关闭面板
            const panel = document.getElementById('online-sticker-panel');
            if (panel) panel.style.display = 'none';
        }

    async addSticker() {
        const input = document.getElementById('online-sticker-upload-input');
        if (input) input.click();
    }

    async handleStickerUpload(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64Url = reader.result;
            const name = prompt('请为这个表情命名：');
            if (!name || !name.trim()) return;

            const newSticker = {
                id: 'sticker_' + Date.now() + Math.random(),
                url: base64Url,
                name: name.trim(),
                categoryId: (this._stickerCat && this._stickerCat !== 'all') ? this._stickerCat : null
            };

            if (typeof db !== 'undefined' && db.userStickers) {
                const newId = await db.userStickers.add(newSticker);
                newSticker.id = newId;
            }
            if (typeof state !== 'undefined' && state.userStickers) {
                state.userStickers.push(newSticker);
            }

            this.renderStickerPanel();

            // 后台上传到图床
            if (typeof silentlyUpdateDbUrl === 'function') {
                (async () => {
                    await silentlyUpdateDbUrl(db.userStickers, newSticker.id, 'url', base64Url);
                })();
            }
        };
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
                    const enableSwitch = document.getElementById('online-app-enable-switch');
                    if (enableSwitch && enableSwitch.checked) {
                        this.connect();
                    }
                }
            }, delay);
        }

    setupVisibilityListener() {
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && this.shouldAutoReconnect && !this.isConnected) {
                    const enableSwitch = document.getElementById('online-app-enable-switch');
                    if (enableSwitch && enableSwitch.checked) {
                        const idInput = document.getElementById('online-app-my-id');
                        const serverInput = document.getElementById('online-app-server-url');
                        if (idInput?.value && serverInput?.value) {
                            console.log('[连接APP] 页面恢复可见，尝试重连');
                            this.connect();
                        }
                    }
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
            if (!confirm('⚠️ 重置联机数据\n\n将删除所有联机设置、好友、聊天记录。\n包括你的ID、昵称、头像、服务器地址。\n此操作不可撤销！')) return;

            this.disconnect();

            // 清空内存数据
            this.friendRequests = [];
            this.onlineFriends = [];
            this.chats = {};
            this.activeChatId = null;
            this.userId = null;
            this.nickname = null;
            this.avatar = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
            this.serverUrl = null;

            // 清空 localStorage 中所有联机相关的数据
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('online-app-') || key === 'ephone-online-settings')) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));

            // 重置 UI
            const idInput = document.getElementById('online-app-my-id');
            const nickInput = document.getElementById('online-app-my-nickname');
            const serverInput = document.getElementById('online-app-server-url');
            const avatarPreview = document.getElementById('online-app-avatar-preview');
            const enableSwitch = document.getElementById('online-app-enable-switch');
            const detailsDiv = document.getElementById('online-app-settings-details');

            if (idInput) idInput.value = '';
            if (nickInput) nickInput.value = '';
            if (serverInput) serverInput.value = '';
            if (avatarPreview) avatarPreview.src = 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
            if (enableSwitch) enableSwitch.checked = false;
            if (detailsDiv) detailsDiv.style.display = 'none';

            this.updateConnectionUI(false);
            this.renderChatList();
            this.showView('online-app-list-view');
            alert('联机数据已全部重置');
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

    // ==================== 群聊功能 ====================

    openCreateGroupModal() {
        if (!this.isConnected) {
            alert('请先连接服务器');
            return;
        }
        if (this.onlineFriends.length === 0) {
            alert('暂无联机好友，请先添加好友');
            return;
        }

        const modal = document.getElementById('create-group-modal');
        const listEl = document.getElementById('create-group-friend-list');
        const nameInput = document.getElementById('group-name-input');
        if (!modal || !listEl) return;

        nameInput.value = '';
        listEl.innerHTML = '';

        this.onlineFriends.forEach((friend, idx) => {
            const item = document.createElement('div');
            item.className = 'create-group-friend-item';
            item.innerHTML = `
                <label style="display:flex;align-items:center;gap:10px;padding:10px 0;cursor:pointer;">
                    <input type="checkbox" class="group-friend-checkbox" data-index="${idx}" value="${friend.userId}">
                    <img src="${friend.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'}" 
                         style="width:36px;height:36px;border-radius:50%;object-fit:cover;"
                         onerror="this.src='https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'">
                    <span style="font-size:14px;">${this.escapeHtml(friend.nickname)}</span>
                    <span style="font-size:12px;color:#999;">(${friend.userId})</span>
                </label>`;
            listEl.appendChild(item);
        });

        modal.classList.add('visible');
    }

    confirmCreateGroup() {
        const nameInput = document.getElementById('group-name-input');
        const checkboxes = document.querySelectorAll('.group-friend-checkbox:checked');

        const groupName = nameInput?.value.trim();
        if (!groupName) {
            alert('请输入群名称');
            return;
        }

        const selectedFriends = [];
        checkboxes.forEach(cb => {
            const idx = parseInt(cb.dataset.index);
            const friend = this.onlineFriends[idx];
            if (friend) selectedFriends.push(friend);
        });

        if (selectedFriends.length < 1) {
            alert('请至少选择1个好友');
            return;
        }

        // 生成群聊ID
        const groupId = `group_${this.userId}_${Date.now()}`;

        // 群成员包括自己
        const members = [
            { userId: this.userId, nickname: this.nickname, avatar: this.getSafeAvatar() },
            ...selectedFriends.map(f => ({
                userId: f.userId,
                nickname: f.nickname,
                avatar: f.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'
            }))
        ];

        // 创建本地群聊
        this.chats[groupId] = {
            id: groupId,
            name: groupName,
            avatar: null,
            lastMessage: '群聊已创建',
            timestamp: Date.now(),
            unread: 0,
            isGroup: true,
            members: members,
            history: [{ role: 'system', content: `群聊「${groupName}」已创建，共${members.length}人`, timestamp: Date.now() }]
        };
        this.saveChats();

        // 通知服务器，让其他成员也创建群聊
        this.send({
            type: 'create_group',
            groupId: groupId,
            groupName: groupName,
            members: members,
            creatorId: this.userId
        });

        // 关闭弹窗
        const modal = document.getElementById('create-group-modal');
        if (modal) modal.classList.remove('visible');

        this.renderChatList();
        this.openChat(groupId);
    }

    onReceiveGroupMessage(data) {
        console.log('[群聊] 收到群消息:', data.type, data.groupId, data);
        const chatId = data.groupId;
        let chat = this.chats[chatId];

        // 如果是创建群聊的通知
        if (data.type === 'receive_group_created') {
            if (!chat) {
                chat = {
                    id: chatId,
                    name: data.groupName,
                    avatar: null,
                    lastMessage: '你被邀请加入群聊',
                    timestamp: data.timestamp || Date.now(),
                    unread: 1,
                    isGroup: true,
                    members: data.members || [],
                    history: [{ role: 'system', content: `你被邀请加入群聊「${data.groupName}」`, timestamp: Date.now() }]
                };
                this.chats[chatId] = chat;
            }
            this.saveChats();
            this.renderChatList();
            return;
        }

        // 普通群聊消息
        if (!chat) return; // 不在这个群里就忽略

        if (!Array.isArray(chat.history)) chat.history = [];

        const STICKER_RE = /(^https:\/\/i\.postimg\.cc\/.+|^https:\/\/files\.catbox\.moe\/.+|^https?:\/\/sharkpan\.xyz\/.+|^data:image|\.(png|jpg|jpeg|gif|webp)\?.*$|\.(png|jpg|jpeg|gif|webp)$)/i;
        const isSticker = STICKER_RE.test(data.message);
        const displayMsg = isSticker ? '[表情包]' : data.message;

        const msg = {
            role: 'ai',
            content: data.message,
            timestamp: data.timestamp,
            senderUserId: data.fromUserId,
            senderNickname: data.fromNickname,
            senderAvatar: data.fromAvatar
        };
        chat.history.push(msg);
        chat.lastMessage = `${data.fromNickname}: ${displayMsg}`;
        chat.timestamp = data.timestamp;

        if (this.activeChatId !== chatId) {
            chat.unread = (chat.unread || 0) + 1;
        }

        this.saveChats();

        if (this.activeChatId === chatId) {
            this.appendMessageToUI(msg, chat);
        }

        this.renderChatList();
        this.sendNotification(chat.name, `${data.fromNickname}: ${displayMsg}`, chatId);
    }

    openGroupInfoModal() {
        if (!this.activeChatId) return;
        const chat = this.chats[this.activeChatId];
        if (!chat || !chat.isGroup) return;

        const modal = document.getElementById('group-info-modal');
        const content = document.getElementById('group-info-content');
        if (!modal || !content) return;

        const membersHtml = (chat.members || []).map(m => `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;">
                <img src="${m.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'}" 
                     style="width:36px;height:36px;border-radius:50%;object-fit:cover;"
                     onerror="this.src='https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'">
                <div style="flex:1;">
                    <div style="font-size:14px;">${this.escapeHtml(m.nickname)}${m.isAiCharacter ? ' 🤖' : ''}</div>
                    <div style="font-size:12px;color:#999;">${m.isAiCharacter ? `AI角色 (${m.ownerUserId === this.userId ? '我的' : '其他人的'})` : m.userId}${m.userId === this.userId ? ' (我)' : ''}</div>
                </div>
            </div>
        `).join('');

        // AI角色操作按钮
        const groupAiChars = this.aiCharactersInGroup[this.activeChatId] || [];
        const myAiChar = groupAiChars.find(c => c.ownerUserId === this.userId);
        const aiButtonHtml = myAiChar
            ? `<button class="settings-full-btn" style="margin-top:10px;color:#ff9500;" 
                    onclick="onlineChatManager.removeAiCharacterFromGroup('${chat.id}');closeGroupInfoModal();">移除我的AI角色 (${this.escapeHtml(myAiChar.originalName)})</button>`
            : `<button class="settings-full-btn" style="margin-top:10px;color:#007aff;" 
                    onclick="onlineChatManager.openAddAiCharacterModal();closeGroupInfoModal();">拉入AI角色</button>`;

        content.innerHTML = `
            <div style="padding:15px;">
                <div style="font-size:16px;font-weight:600;margin-bottom:5px;">${this.escapeHtml(chat.name)}</div>
                <div style="font-size:13px;color:#999;margin-bottom:15px;">群成员 (${(chat.members || []).length}人)</div>
                <div>${membersHtml}</div>
                ${aiButtonHtml}
                <button class="settings-full-btn" style="margin-top:15px;color:#ff3b30;" 
                        onclick="onlineChatManager.leaveGroup('${chat.id}')">退出群聊</button>
            </div>`;

        modal.classList.add('visible');
    }

    leaveGroup(groupId) {
        if (!confirm('确定要退出这个群聊吗？聊天记录将被删除。')) return;

        delete this.chats[groupId];
        this.saveChats();

        if (this.activeChatId === groupId) {
            this.activeChatId = null;
            this.showView('online-app-list-view');
        }

        const modal = document.getElementById('group-info-modal');
        if (modal) modal.classList.remove('visible');

        this.renderChatList();
    }


        // ==================== AI角色入群功能 ====================

        // 打开选择AI角色的弹窗
        openAddAiCharacterModal() {
            if (!this.activeChatId) return;
            const chat = this.chats[this.activeChatId];
            if (!chat || !chat.isGroup) { alert('只能在群聊中拉入AI角色'); return; }

            // 检查是否已经拉入了角色
            const groupAiChars = this.aiCharactersInGroup[this.activeChatId] || [];
            const myExisting = groupAiChars.find(c => c.ownerUserId === this.userId);
            if (myExisting) {
                alert(`你已经拉入了角色「${myExisting.originalName}」，每人只能拉入一个角色`);
                return;
            }

            // 从主屏幕获取角色列表
            if (!window.state || !window.state.chats) {
                alert('主屏幕聊天数据未加载，请先打开主屏幕');
                return;
            }

            const mainChats = Object.values(window.state.chats).filter(c => !c.isGroup && c.settings && c.settings.aiPersona);
            if (mainChats.length === 0) {
                alert('主屏幕没有可用的AI角色');
                return;
            }

            // 创建弹窗
            let modal = document.getElementById('add-ai-character-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'add-ai-character-modal';
                modal.className = 'modal';
                modal.innerHTML = `
                    <div class="modal-content" style="max-height:70vh;">
                        <div class="modal-header">
                            <span>选择要拉入的AI角色</span>
                            <span class="modal-close" onclick="document.getElementById('add-ai-character-modal').classList.remove('visible')">✕</span>
                        </div>
                        <div class="modal-body" id="ai-character-select-list" style="overflow-y:auto;max-height:55vh;padding:10px 15px;"></div>
                    </div>`;
                document.body.appendChild(modal);
            }

            const listEl = document.getElementById('ai-character-select-list');
            listEl.innerHTML = '';

            mainChats.forEach(c => {
                const avatar = (c.settings && c.settings.aiAvatar) || c.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
                const item = document.createElement('div');
                item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #eee;cursor:pointer;';
                item.innerHTML = `
                    <img src="${avatar}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" onerror="this.src='https://i.postimg.cc/y8xWzCqj/anime-boy.jpg'">
                    <div style="flex:1;">
                        <div style="font-weight:bold;">${this.escapeHtml(c.originalName || c.name)}</div>
                        <div style="font-size:12px;color:#999;">${this.escapeHtml((c.settings.aiPersona || '').substring(0, 50))}...</div>
                    </div>`;
                item.addEventListener('click', () => {
                    this.addAiCharacterToGroup(c);
                    modal.classList.remove('visible');
                });
                listEl.appendChild(item);
            });

            modal.classList.add('visible');
        }

        // 将AI角色加入群聊
        addAiCharacterToGroup(mainChat) {
            const groupId = this.activeChatId;
            const chat = this.chats[groupId];
            if (!chat || !chat.isGroup) return;

            const characterId = `ai_${this.userId}_${mainChat.id}`;
            const charData = {
                characterId: characterId,
                originalName: mainChat.originalName || mainChat.name,
                avatar: (mainChat.settings && mainChat.settings.aiAvatar) || mainChat.avatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg',
                ownerUserId: this.userId,
                ownerNickname: this.nickname,
                mainChatId: mainChat.id // 用于实时读取主屏幕数据
            };

            // 本地记录
            if (!this.aiCharactersInGroup[groupId]) this.aiCharactersInGroup[groupId] = [];
            this.aiCharactersInGroup[groupId].push(charData);
            this.saveAiCharacters();

            // 添加到群成员列表
            if (!chat.members.find(m => m.userId === characterId)) {
                chat.members.push({
                    userId: characterId,
                    nickname: charData.originalName,
                    avatar: charData.avatar,
                    isAiCharacter: true,
                    ownerUserId: this.userId
                });
                this.saveChats();
            }

            // 通知其他群成员
            this.send({
                type: 'ai_character_join',
                groupId: groupId,
                character: charData,
                members: chat.members.filter(m => !m.isAiCharacter).map(m => m.userId)
            });

            // 本地显示系统消息
            const sysMsg = { role: 'system', content: `${charData.originalName} (${this.nickname}的AI角色) 加入了群聊`, timestamp: Date.now() };
            chat.history.push(sysMsg);
            chat.lastMessage = sysMsg.content;
            chat.timestamp = Date.now();
            this.saveChats();

            if (this.activeChatId === groupId) {
                this.appendMessageToUI(sysMsg, chat);
            }
            this.renderChatList();

            // 更新API调用按钮显示
            this.updateAiCallButton();
        }

        // 移除AI角色
        removeAiCharacterFromGroup(groupId) {
            const chars = this.aiCharactersInGroup[groupId] || [];
            const myChar = chars.find(c => c.ownerUserId === this.userId);
            if (!myChar) return;

            // 从列表移除
            this.aiCharactersInGroup[groupId] = chars.filter(c => c.ownerUserId !== this.userId);
            this.saveAiCharacters();

            // 从群成员移除
            const chat = this.chats[groupId];
            if (chat) {
                chat.members = chat.members.filter(m => m.userId !== myChar.characterId);
                const sysMsg = { role: 'system', content: `${myChar.originalName} 离开了群聊`, timestamp: Date.now() };
                chat.history.push(sysMsg);
                chat.lastMessage = sysMsg.content;
                chat.timestamp = Date.now();
                this.saveChats();

                if (this.activeChatId === groupId) {
                    this.appendMessageToUI(sysMsg, chat);
                }
            }

            // 通知其他群成员
            this.send({
                type: 'ai_character_leave',
                groupId: groupId,
                characterId: myChar.characterId,
                characterName: myChar.originalName,
                members: chat ? chat.members.map(m => m.userId) : []
            });

            this.renderChatList();
            this.updateAiCallButton();
        }

        // 处理收到的AI角色加入通知
        onAiCharacterJoin(data) {
            const chat = this.chats[data.groupId];
            if (!chat) return;

            const charData = data.character;

            // 添加到本地AI角色列表
            if (!this.aiCharactersInGroup[data.groupId]) this.aiCharactersInGroup[data.groupId] = [];
            if (!this.aiCharactersInGroup[data.groupId].find(c => c.characterId === charData.characterId)) {
                this.aiCharactersInGroup[data.groupId].push(charData);
                this.saveAiCharacters();
            }

            // 添加到群成员
            if (!chat.members.find(m => m.userId === charData.characterId)) {
                chat.members.push({
                    userId: charData.characterId,
                    nickname: charData.originalName,
                    avatar: charData.avatar,
                    isAiCharacter: true,
                    ownerUserId: charData.ownerUserId
                });
            }

            const sysMsg = { role: 'system', content: `${charData.originalName} (${charData.ownerNickname}的AI角色) 加入了群聊`, timestamp: Date.now() };
            chat.history.push(sysMsg);
            chat.lastMessage = sysMsg.content;
            chat.timestamp = Date.now();
            this.saveChats();

            if (this.activeChatId === data.groupId) {
                this.appendMessageToUI(sysMsg, chat);
            }
            this.renderChatList();
        }

        // 处理收到的AI角色离开通知
        onAiCharacterLeave(data) {
            const chat = this.chats[data.groupId];
            if (!chat) return;

            // 从本地列表移除
            if (this.aiCharactersInGroup[data.groupId]) {
                this.aiCharactersInGroup[data.groupId] = this.aiCharactersInGroup[data.groupId].filter(c => c.characterId !== data.characterId);
                this.saveAiCharacters();
            }

            // 从群成员移除
            chat.members = chat.members.filter(m => m.userId !== data.characterId);

            const sysMsg = { role: 'system', content: `${data.characterName} 离开了群聊`, timestamp: Date.now() };
            chat.history.push(sysMsg);
            chat.lastMessage = sysMsg.content;
            chat.timestamp = Date.now();
            this.saveChats();

            if (this.activeChatId === data.groupId) {
                this.appendMessageToUI(sysMsg, chat);
            }
            this.renderChatList();
        }

        // 保存/加载AI角色数据
        saveAiCharacters() {
            try {
                localStorage.setItem(this._getStorageKey('ai-characters'), JSON.stringify(this.aiCharactersInGroup));
            } catch (e) { console.error('保存AI角色数据失败:', e); }
        }

        loadAiCharacters() {
            try {
                const data = localStorage.getItem(this._getStorageKey('ai-characters'));
                if (data) this.aiCharactersInGroup = JSON.parse(data);
            } catch (e) { this.aiCharactersInGroup = {}; }
        }

        // 更新API调用按钮的显示状态
        updateAiCallButton() {
            const btn = document.getElementById('online-app-ai-call-btn');
            if (!btn) return;

            const chat = this.chats[this.activeChatId];
            if (!chat || !chat.isGroup) {
                btn.style.display = 'none';
                return;
            }

            const chars = this.aiCharactersInGroup[this.activeChatId] || [];
            const myChar = chars.find(c => c.ownerUserId === this.userId);
            btn.style.display = myChar ? 'inline-flex' : 'none';
        }

        // 调用API让AI角色回复
        async triggerAiCharacterResponse() {
            if (this.isAiResponding) return;

            const groupId = this.activeChatId;
            const chat = this.chats[groupId];
            if (!chat || !chat.isGroup) return;

            const chars = this.aiCharactersInGroup[groupId] || [];
            const myChar = chars.find(c => c.ownerUserId === this.userId);
            if (!myChar) { alert('你还没有拉入AI角色'); return; }

            // 从主屏幕实时读取角色数据
            if (!window.state || !window.state.chats) {
                alert('主屏幕数据未加载');
                return;
            }
            const mainChat = window.state.chats[myChar.mainChatId];
            if (!mainChat) {
                alert('主屏幕中找不到该角色的聊天数据');
                return;
            }

            // 获取API配置（使用拉入者的API设置）
            const apiConfig = window.state.apiConfig;
            if (!apiConfig || !apiConfig.proxyUrl || !apiConfig.apiKey || !apiConfig.model) {
                alert('请先在主屏幕的API设置中配置API');
                return;
            }

            this.isAiResponding = true;
            const btn = document.getElementById('online-app-ai-call-btn');
            if (btn) { btn.disabled = true; btn.textContent = '思考中...'; }

            try {
                const { proxyUrl, apiKey, model } = apiConfig;

                // 构建系统提示词
                const systemPrompt = this.buildAiCharacterPrompt(mainChat, myChar, chat);

                // 构建消息历史
                const messagesPayload = this.buildAiCharacterMessages(chat, myChar);

                // 调用API
                const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
                const isGemini = proxyUrl === GEMINI_API_URL;

                let response;
                if (isGemini) {
                    const geminiConfig = this.toGeminiRequest(model, apiKey, systemPrompt, messagesPayload);
                    response = await fetch(geminiConfig.url, geminiConfig.data);
                } else {
                    response = await fetch(`${proxyUrl}/v1/chat/completions`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${getRandomValue(apiKey)}`
                        },
                        body: JSON.stringify({
                            model: model,
                            messages: [{ role: 'system', content: systemPrompt }, ...messagesPayload],
                            temperature: (window.state.globalSettings && window.state.globalSettings.apiTemperature) || 0.8,
                            stream: false
                        })
                    });
                }

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error?.message || `API错误: ${response.status}`);
                }

                const data = await response.json();
                const aiContent = getGeminiResponseText(data);

                if (!aiContent) throw new Error('AI返回了空内容');

                // 解析AI回复，提取文本消息
                const replyTexts = this.parseAiCharacterResponse(aiContent);

                // 发送每条消息到群聊
                for (const text of replyTexts) {
                    const timestamp = Date.now();

                    // 发送到服务器
                    this.send({
                        type: 'send_group_message',
                        groupId: groupId,
                        members: chat.members.filter(m => !m.isAiCharacter).map(m => m.userId),
                        fromUserId: myChar.characterId,
                        fromNickname: myChar.originalName,
                        fromAvatar: myChar.avatar,
                        message: text,
                        timestamp: timestamp,
                        isAiCharacter: true
                    });

                    // 本地显示
                    const msg = {
                        role: 'ai',
                        content: text,
                        timestamp: timestamp,
                        senderUserId: myChar.characterId,
                        senderNickname: myChar.originalName,
                        senderAvatar: myChar.avatar,
                        isAiCharacter: true
                    };
                    chat.history.push(msg);
                    chat.lastMessage = `${myChar.originalName}: ${text.substring(0, 30)}`;
                    chat.timestamp = timestamp;

                    if (this.activeChatId === groupId) {
                        this.appendMessageToUI(msg, chat);
                    }

                    // 多条消息之间加延迟
                    if (replyTexts.indexOf(text) < replyTexts.length - 1) {
                        await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
                    }
                }

                this.saveChats();
                this.renderChatList();

            } catch (error) {
                console.error('AI角色回复失败:', error);
                alert('AI角色回复失败: ' + error.message);
            } finally {
                this.isAiResponding = false;
                if (btn) { btn.disabled = false; btn.textContent = '调用AI'; }
            }
        }

        // 构建AI角色在群聊中的系统提示词
        buildAiCharacterPrompt(mainChat, myChar, groupChat) {
            const ownerNickname = this.nickname;
            const charName = mainChat.originalName || mainChat.name;

            // 从主屏幕读取记忆
            let longTermMemory = '- (暂无)';
            if (mainChat.longTermMemory && mainChat.longTermMemory.length > 0) {
                longTermMemory = mainChat.longTermMemory.map(mem => `- ${mem.content}`).join('\n');
            }

            // 结构化记忆
            let structuredMemoryText = '';
            if (window.structuredMemoryManager && mainChat.structuredMemory) {
                structuredMemoryText = window.structuredMemoryManager.serializeForPrompt(mainChat);
            }

            // 群成员信息（区分认识的人和不认识的人）
            const membersList = (groupChat.members || []).map(m => {
                if (m.userId === myChar.ownerUserId) {
                    return `- **${m.nickname}** (你的主人，你认识的人，你们有深厚的关系)`;
                } else if (m.isAiCharacter) {
                    return `- **${m.nickname}** (另一个AI角色，你不认识)`;
                } else {
                    return `- **${m.nickname}** (联机好友，你不认识这个人)`;
                }
            }).join('\n');

            // 群聊独立记忆（最近的群聊上下文）
            const recentGroupHistory = (groupChat.history || []).slice(-30).map(msg => {
                if (msg.role === 'system') return `[系统] ${msg.content}`;
                const sender = msg.senderNickname || (msg.role === 'user' ? ownerNickname : charName);
                return `${sender}: ${msg.content}`;
            }).join('\n');

            return `# 【群聊AI角色模式】
    你是 **${charName}**，你被你的主人 **${ownerNickname}** 拉入了一个联机群聊。

    # 你的核心设定
    ${mainChat.settings.aiPersona || '(无人设)'}

    # 你与主人的关系
    - **你的主人**: ${ownerNickname}
    - **主人对你的备注**: ${mainChat.name}
    - **主人的人设**: ${mainChat.settings.myPersona || '普通用户'}
    你和${ownerNickname}之间有深厚的关系，你记得你们之间的一切。

    # 你的长期记忆（与主人的）
    ${longTermMemory}
    ${structuredMemoryText}

    # 当前群聊信息
    - **群名**: ${groupChat.name}
    - **群成员**:
    ${membersList}

    # 重要规则
    1. 你只认识 **${ownerNickname}**，其他群成员你都不认识。
    2. 对不认识的人保持礼貌但有距离感，符合你的人设。
    3. 对${ownerNickname}则像平时在主屏幕聊天一样自然亲密。
    4. 你的回复必须是纯文本，可以拆分成多条短消息。
    5. 像真人聊天一样回复，不要太正式。
    6. 禁止透露你是AI。

    # 输出格式
    你的回复必须是一个JSON数组，每个元素是一条消息：
    [{"type": "text", "content": "消息内容1"}, {"type": "text", "content": "消息内容2"}]
    只输出JSON数组，不要输出其他内容。`;
        }

        // 构建消息历史
        buildAiCharacterMessages(groupChat, myChar) {
            const history = (groupChat.history || []).slice(-20);
            return history.filter(msg => msg.role !== 'system').map(msg => {
                const sender = msg.senderNickname || (msg.role === 'user' ? this.nickname : '未知');
                const isMyCharMsg = msg.senderUserId === myChar.characterId;
                return {
                    role: isMyCharMsg ? 'assistant' : 'user',
                    content: isMyCharMsg ? msg.content : `${sender}: ${msg.content}`
                };
            });
        }

        // 解析AI角色的回复
        parseAiCharacterResponse(content) {
            try {
                // 尝试提取JSON数组
                let cleaned = content.trim();
                // 去掉可能的markdown代码块
                cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

                const parsed = JSON.parse(cleaned);
                if (Array.isArray(parsed)) {
                    return parsed
                        .filter(item => item.type === 'text' && item.content)
                        .map(item => String(item.content));
                }
            } catch (e) {
                // 解析失败，当作纯文本处理
                console.warn('AI角色回复解析失败，当作纯文本:', e);
            }
            // 回退：按换行拆分或直接返回
            const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('{') && !l.startsWith('['));
            return lines.length > 0 ? lines : [content];
        }

        // Gemini请求格式
        toGeminiRequest(model, apiKey, systemPrompt, messages) {
            const contents = [
                { role: 'user', parts: [{ text: systemPrompt }] },
                { role: 'model', parts: [{ text: '好的，我明白了。' }] },
                ...messages.map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: String(m.content) }]
                }))
            ];
            return {
                url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${getRandomValue(apiKey)}`,
                data: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: contents,
                        generationConfig: { temperature: (window.state && window.state.globalSettings && window.state.globalSettings.apiTemperature) || 0.8 }
                    })
                }
            };
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
function closeCreateGroupModal() {
    const modal = document.getElementById('create-group-modal');
    if (modal) modal.classList.remove('visible');
}
function closeGroupInfoModal() {
    const modal = document.getElementById('group-info-modal');
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
