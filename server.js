// ========================================
// 真人联机 WebSocket 服务器
// 版本: 1.0.0
// 日期: 2026-01-31
// ========================================

const WebSocket = require('ws');
const http = require('http');

// ==================== 配置区 ====================
const PORT = process.env.PORT || 8080; // 服务器端口，可通过环境变量修改
const MAX_USERS = 1000; // 最大在线用户数
// =============================================

// 创建HTTP服务器
const server = http.createServer((req, res) => {
    res.writeHead(200, { 
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
    });
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>真人联机服务器</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
            h1 { color: #007aff; }
            .status { font-size: 18px; margin: 20px 0; }
            .online { color: #34c759; }
        </style>
    </head>
    <body>
        <h1>🌐 真人联机服务器</h1>
        <div class="status">
            <span class="online">● 服务器运行中</span><br>
            在线用户: <strong>${onlineUsers.size}</strong> / ${MAX_USERS}
        </div>
        <p>服务器时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
        <hr>
        <p style="color: #999; font-size: 14px;">
            WebSocket端口: ${PORT}<br>
            连接地址: ws://[服务器IP]:${PORT}
        </p>
    </body>
    </html>
    `;
    res.end(html);
});

// 创建WebSocket服务器
const wss = new WebSocket.Server({ 
    server,
    // 配置WebSocket选项
    perMessageDeflate: false, // 禁用压缩以提高性能
    maxPayload: 100 * 1024 // 最大消息100KB
});

// 存储在线用户
// 结构: { userId: { ws, nickname, avatar, connectedAt } }
const onlineUsers = new Map();

// 存储群聊信息
// 结构: { groupId: { name, creatorId, members: [userId...], createdAt } }
const groups = new Map();

console.log('='.repeat(60));
console.log('                  真人联机服务器启动中...                  ');
console.log('='.repeat(60));

// ==================== WebSocket连接处理 ====================

wss.on('connection', (ws, req) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[连接] 新客户端连接 - IP: ${clientIp}`);
    
    let currentUserId = null; // 当前连接的用户ID
    let heartbeatTimer = null; // 心跳超时计时器
    
    // 设置心跳超时检测（30分钟无任何消息才断开）
    function resetHeartbeat() {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        heartbeatTimer = setTimeout(() => {
            console.log(`[超时] 用户30分钟无活动: ${currentUserId}`);
            ws.terminate();
        }, 30 * 60 * 1000); // 30分钟
    }
    
    resetHeartbeat();
    
    // ==================== 消息处理 ====================
    
    ws.on('message', (message) => {
        try {
            // 重置心跳
            resetHeartbeat();
            
            const data = JSON.parse(message.toString());
            
            // 记录消息（不包含聊天内容）
            if (data.type !== 'send_message' && data.type !== 'heartbeat') {
                console.log(`[消息] 类型: ${data.type}, 用户: ${currentUserId || '未注册'}`);
            }
            
            // 路由到不同的处理函数
            switch (data.type) {
                case 'register':
                    handleRegister(ws, data);
                    break;
                
                case 'search_user':
                    handleSearchUser(ws, data);
                    break;
                
                case 'friend_request':
                    handleFriendRequest(ws, data);
                    break;
                
                case 'accept_friend_request':
                    handleAcceptFriendRequest(ws, data);
                    break;
                
                case 'reject_friend_request':
                    handleRejectFriendRequest(ws, data);
                    break;
                
                case 'send_message':
                    handleSendMessage(ws, data);
                    break;
                
                case 'create_group':
                    handleCreateGroup(ws, data);
                    break;
                
                case 'send_group_message':
                    handleSendGroupMessage(ws, data);
                    break;
                
                case 'invite_to_group':
                    handleInviteToGroup(ws, data);
                    break;
                
                case 'leave_group':
                    handleLeaveGroup(ws, data);
                    break;
                
                case 'sync_group':
                    handleSyncGroup(ws, data);
                    break;
                
                case 'heartbeat':
                    // 心跳响应
                    sendToClient(ws, { type: 'heartbeat_ack' });
                    break;
                
                default:
                    console.log(`[警告] 未知消息类型: ${data.type}`);
            }
        } catch (error) {
            console.error('[错误] 处理消息失败:', error);
            sendToClient(ws, {
                type: 'error',
                message: '服务器处理消息失败'
            });
        }
    });
    
    // ==================== 连接关闭 ====================
    
    ws.on('close', () => {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        
        if (currentUserId) {
            // 【关键修复】只有当 map 里存的还是当前这个 ws 时才删除
            // 避免旧连接关闭时误删新连接的记录
            const existing = onlineUsers.get(currentUserId);
            if (existing && existing.ws === ws) {
                onlineUsers.delete(currentUserId);
                console.log(`[离线] 用户离线: ${currentUserId} (在线: ${onlineUsers.size})`);
            } else {
                console.log(`[忽略] 旧连接关闭，用户 ${currentUserId} 已有新连接，不删除`);
            }
        } else {
            console.log('[断开] 未注册的客户端断开连接');
        }
    });
    
    // ==================== 错误处理 ====================
    
    ws.on('error', (error) => {
        console.error('[错误] WebSocket错误:', error.message);
    });
    
    // ==================== 业务逻辑函数 ====================
    
    /**
     * 处理用户注册
     */
    function handleRegister(ws, data) {
        const { userId, nickname, avatar } = data;
        
        // 验证输入
        if (!userId || !nickname) {
            return sendToClient(ws, {
                type: 'register_error',
                error: '用户ID和昵称不能为空'
            });
        }
        
        // 验证ID格式（只允许字母、数字、下划线，长度3-20）
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(userId)) {
            return sendToClient(ws, {
                type: 'register_error',
                error: 'ID格式不正确（3-20位，仅支持字母、数字、下划线）'
            });
        }
        
        // 检查用户数量限制
        if (onlineUsers.size >= MAX_USERS) {
            return sendToClient(ws, {
                type: 'register_error',
                error: '服务器已满，请稍后再试'
            });
        }
        
        // 【修复】检查ID是否已被占用
        // 如果ID已存在，先关闭旧连接（处理重连场景）
        if (onlineUsers.has(userId)) {
            const oldUser = onlineUsers.get(userId);
            console.log(`[重连] 用户 ${userId} 正在重新连接，关闭旧连接`);
            
            // 立即终止旧连接（用terminate而非close，避免等待握手）
            try {
                if (oldUser.ws && oldUser.ws.readyState !== WebSocket.CLOSED) {
                    oldUser.ws.terminate();
                }
            } catch (error) {
                console.error(`[错误] 关闭旧连接失败:`, error);
            }
            
            // 从在线列表移除旧连接
            onlineUsers.delete(userId);
        }
        
        // 注册用户
        currentUserId = userId;
        onlineUsers.set(userId, {
            ws,
            nickname: nickname.substring(0, 20), // 限制昵称长度
            avatar: avatar || '',
            connectedAt: Date.now()
        });
        
        console.log(`[注册] 用户上线: ${userId} (${nickname}) - 在线: ${onlineUsers.size}`);
        
        // 发送注册成功消息
        sendToClient(ws, {
            type: 'register_success',
            userId,
            nickname
        });
    }
    
    /**
     * 处理搜索用户
     */
    function handleSearchUser(ws, data) {
        const { searchId } = data;
        
        if (!searchId) {
            return sendToClient(ws, {
                type: 'search_result',
                found: false,
                error: '搜索ID不能为空'
            });
        }
        
        // 查找用户
        const user = onlineUsers.get(searchId);
        
        if (user) {
            sendToClient(ws, {
                type: 'search_result',
                found: true,
                userId: searchId,
                nickname: user.nickname,
                avatar: user.avatar,
                online: true
            });
        } else {
            sendToClient(ws, {
                type: 'search_result',
                found: false,
                searchId
            });
        }
    }
    
    /**
     * 处理好友申请
     */
    function handleFriendRequest(ws, data) {
        const { toUserId, fromUserId, fromNickname, fromAvatar } = data;
        
        // 验证必填字段
        if (!toUserId || !fromUserId || !fromNickname) {
            return sendToClient(ws, {
                type: 'error',
                message: '缺少必要参数'
            });
        }
        
        // 不能添加自己
        if (toUserId === fromUserId) {
            return sendToClient(ws, {
                type: 'error',
                message: '不能添加自己为好友'
            });
        }
        
        const targetUser = onlineUsers.get(toUserId);
        
        if (targetUser) {
            // 转发好友申请给目标用户
            sendToClient(targetUser.ws, {
                type: 'friend_request',
                fromUserId,
                fromNickname,
                fromAvatar
            });
            console.log(`[好友申请] ${fromUserId} -> ${toUserId}`);
        } else {
            // 目标用户不在线
            sendToClient(ws, {
                type: 'error',
                message: '对方不在线或不存在'
            });
        }
    }
    
    /**
     * 处理接受好友申请
     */
    function handleAcceptFriendRequest(ws, data) {
        const { toUserId, fromUserId, fromNickname, fromAvatar } = data;
        
        const targetUser = onlineUsers.get(toUserId);
        
        if (targetUser) {
            // 通知对方已接受
            sendToClient(targetUser.ws, {
                type: 'friend_request_accepted',
                fromUserId,
                fromNickname,
                fromAvatar
            });
            console.log(`[好友接受] ${fromUserId} <-> ${toUserId}`);
        }
    }
    
    /**
     * 处理拒绝好友申请
     */
    function handleRejectFriendRequest(ws, data) {
        const { toUserId } = data;
        
        const targetUser = onlineUsers.get(toUserId);
        
        if (targetUser) {
            // 通知对方已拒绝
            sendToClient(targetUser.ws, {
                type: 'friend_request_rejected'
            });
            console.log(`[好友拒绝] -> ${toUserId}`);
        }
    }
    
    /**
     * 处理发送消息
     */
    function handleSendMessage(ws, data) {
        const { toUserId, fromUserId, message, timestamp } = data;
        
        // 验证必填字段
        if (!toUserId || !fromUserId || !message) {
            return sendToClient(ws, {
                type: 'error',
                message: '消息内容不完整'
            });
        }
        
        // 验证消息长度（限制10KB）
        if (message.length > 10000) {
            return sendToClient(ws, {
                type: 'error',
                message: '消息内容过长'
            });
        }
        
        const targetUser = onlineUsers.get(toUserId);
        
        if (targetUser) {
            // 转发消息给目标用户
            sendToClient(targetUser.ws, {
                type: 'receive_message',
                fromUserId,
                message,
                timestamp: timestamp || Date.now()
            });
            // 不记录聊天内容，保护隐私
            console.log(`[消息转发] ${fromUserId} -> ${toUserId}`);
        } else {
            // 对方不在线
            sendToClient(ws, {
                type: 'send_message_error',
                error: '对方不在线'
            });
            console.log(`[消息失败] ${fromUserId} -> ${toUserId} (对方不在线)`);
        }
    }

    /**
     * 处理创建群聊
     */
    function handleCreateGroup(ws, data) {
        const { groupId, groupName, creatorId, members } = data;
        
        if (!groupId || !groupName || !creatorId || !Array.isArray(members)) {
            return sendToClient(ws, { type: 'error', message: '创建群聊参数不完整' });
        }
        
        // 存储群信息
        groups.set(groupId, {
            name: groupName,
            creatorId,
            members: members, // [{ userId, nickname, avatar }]
            createdAt: Date.now()
        });
        
        console.log(`[创建群聊] ${creatorId} 创建了群 "${groupName}" (${groupId})，成员: ${members.map(m => m.userId).join(', ')}`);
        
        // 通知创建者成功
        sendToClient(ws, {
            type: 'group_created',
            groupId,
            groupName,
            members
        });
        
        // 通知所有被拉入的成员（排除创建者自己）
        for (const member of members) {
            if (member.userId !== creatorId) {
                const targetUser = onlineUsers.get(member.userId);
                if (targetUser) {
                    // 获取创建者信息
                    const creator = onlineUsers.get(creatorId);
                    sendToClient(targetUser.ws, {
                        type: 'group_invite',
                        groupId,
                        groupName,
                        creatorId,
                        creatorNickname: creator ? creator.nickname : creatorId,
                        members
                    });
                }
            }
        }
    }

    /**
     * 处理群聊消息
     */
    function handleSendGroupMessage(ws, data) {
        const { groupId, fromUserId, fromNickname, fromAvatar, message, timestamp } = data;
        
        if (!groupId || !fromUserId || !message) {
            return sendToClient(ws, { type: 'error', message: '群消息内容不完整' });
        }
        
        if (message.length > 10000) {
            return sendToClient(ws, { type: 'error', message: '消息内容过长' });
        }
        
        const group = groups.get(groupId);
        
        if (!group) {
            // 群不在服务器内存中（可能服务器重启过），尝试广播给已知成员
            // 客户端会在 sync_group 时重新注册群
            return sendToClient(ws, { type: 'error', message: '群聊不存在，请等待同步完成' });
        }
        
        const msgTimestamp = timestamp || Date.now();
        let deliveredCount = 0;
        
        // 转发给群内所有在线成员（排除发送者）
        for (const member of group.members) {
            if (member.userId !== fromUserId) {
                const targetUser = onlineUsers.get(member.userId);
                if (targetUser) {
                    sendToClient(targetUser.ws, {
                        type: 'receive_group_message',
                        groupId,
                        fromUserId,
                        fromNickname: fromNickname || fromUserId,
                        fromAvatar: fromAvatar || '',
                        message,
                        timestamp: msgTimestamp
                    });
                    deliveredCount++;
                }
            }
        }
        
        console.log(`[群消息] ${fromUserId} -> 群${groupId} (送达${deliveredCount}/${group.members.length - 1}人)`);
    }

    /**
     * 处理邀请成员入群
     */
    function handleInviteToGroup(ws, data) {
        const { groupId, inviterId, newMembers } = data;
        
        if (!groupId || !inviterId || !Array.isArray(newMembers)) {
            return sendToClient(ws, { type: 'error', message: '邀请参数不完整' });
        }
        
        const group = groups.get(groupId);
        if (!group) {
            return sendToClient(ws, { type: 'error', message: '群聊不存在' });
        }
        
        // 添加新成员到群
        for (const newMember of newMembers) {
            if (!group.members.some(m => m.userId === newMember.userId)) {
                group.members.push(newMember);
            }
        }
        
        const inviter = onlineUsers.get(inviterId);
        const inviterNickname = inviter ? inviter.nickname : inviterId;
        
        // 通知群内所有在线成员有新人加入
        for (const member of group.members) {
            const targetUser = onlineUsers.get(member.userId);
            if (targetUser) {
                sendToClient(targetUser.ws, {
                    type: 'group_member_joined',
                    groupId,
                    newMembers,
                    inviterNickname,
                    allMembers: group.members
                });
            }
        }
        
        // 通知新成员被邀请入群
        for (const newMember of newMembers) {
            const targetUser = onlineUsers.get(newMember.userId);
            if (targetUser) {
                sendToClient(targetUser.ws, {
                    type: 'group_invite',
                    groupId,
                    groupName: group.name,
                    creatorId: group.creatorId,
                    creatorNickname: inviterNickname,
                    members: group.members
                });
            }
        }
        
        console.log(`[邀请入群] ${inviterId} 邀请 ${newMembers.map(m => m.userId).join(', ')} 加入群 ${groupId}`);
    }

    /**
     * 处理退出群聊
     */
    function handleLeaveGroup(ws, data) {
        const { groupId, userId } = data;
        
        if (!groupId || !userId) return;
        
        const group = groups.get(groupId);
        if (!group) return;
        
        // 从成员列表移除
        group.members = group.members.filter(m => m.userId !== userId);
        
        const leaver = onlineUsers.get(userId);
        const leaverNickname = leaver ? leaver.nickname : userId;
        
        // 如果群里没人了，删除群
        if (group.members.length === 0) {
            groups.delete(groupId);
            console.log(`[群解散] 群 ${groupId} 已无成员，自动解散`);
            return;
        }
        
        // 通知剩余成员
        for (const member of group.members) {
            const targetUser = onlineUsers.get(member.userId);
            if (targetUser) {
                sendToClient(targetUser.ws, {
                    type: 'group_member_left',
                    groupId,
                    userId,
                    leaverNickname,
                    allMembers: group.members
                });
            }
        }
        
        console.log(`[退出群聊] ${userId} 退出了群 ${groupId}`);
    }

    /**
     * 处理群同步（客户端重连后重新注册群信息）
     */
    function handleSyncGroup(ws, data) {
        const { groupId, groupName, members, userId } = data;
        
        if (!groupId || !groupName || !Array.isArray(members)) return;
        
        if (!groups.has(groupId)) {
            // 服务器没有这个群的记录，重新创建
            groups.set(groupId, {
                name: groupName,
                creatorId: userId || members[0]?.userId,
                members: members,
                createdAt: Date.now()
            });
            console.log(`[群同步] 重新注册群 "${groupName}" (${groupId})，成员: ${members.map(m => m.userId).join(', ')}`);
        } else {
            // 群已存在，更新成员信息
            const group = groups.get(groupId);
            // 合并成员（以客户端数据为补充）
            for (const member of members) {
                if (!group.members.some(m => m.userId === member.userId)) {
                    group.members.push(member);
                }
            }
            console.log(`[群同步] 更新群 "${groupName}" (${groupId})，当前成员: ${group.members.map(m => m.userId).join(', ')}`);
        }
        
        sendToClient(ws, { type: 'group_synced', groupId });
    }
});

// ==================== 工具函数 ====================

/**
 * 安全地发送消息给客户端
 */
function sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(data));
        } catch (error) {
            console.error('[错误] 发送消息失败:', error);
        }
    }
}

/**
 * 广播消息给所有在线用户（保留接口，暂未使用）
 */
function broadcast(data, excludeUserId = null) {
    const message = JSON.stringify(data);
    onlineUsers.forEach((user, userId) => {
        if (userId !== excludeUserId && user.ws.readyState === WebSocket.OPEN) {
            user.ws.send(message);
        }
    });
}

// ==================== 服务器启动 ====================

server.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(60));
    console.log('                  ✅ 服务器启动成功！                   ');
    console.log('='.repeat(60));
    console.log(`📡 WebSocket端口: ${PORT}`);
    console.log(`🌐 HTTP访问: http://localhost:${PORT}`);
    console.log(`⏰ 启动时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    console.log(`👥 最大用户数: ${MAX_USERS}`);
    console.log('='.repeat(60));
    console.log('');
    console.log('💡 提示:');
    console.log('  - 使用 Ctrl+C 停止服务器');
    console.log('  - 使用 PM2 可以让服务器持续运行');
    console.log('  - 确保防火墙已开放端口 ' + PORT);
    console.log('');
});

// ==================== 定时任务 ====================

// 每30秒显示一次在线用户数
setInterval(() => {
    const timestamp = new Date().toLocaleTimeString('zh-CN');
    console.log(`[${timestamp}] 当前在线用户: ${onlineUsers.size}`);
}, 30000);

// 每5分钟清理断开的连接
setInterval(() => {
    let cleaned = 0;
    onlineUsers.forEach((user, userId) => {
        if (user.ws.readyState !== WebSocket.OPEN) {
            onlineUsers.delete(userId);
            cleaned++;
        }
    });
    if (cleaned > 0) {
        console.log(`[清理] 清理了 ${cleaned} 个断开的连接`);
    }
}, 5 * 60 * 1000);

// ==================== 优雅关闭 ====================

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
    console.log('\n');
    console.log('='.repeat(60));
    console.log('正在关闭服务器...');
    
    // 通知所有客户端
    onlineUsers.forEach((user) => {
        sendToClient(user.ws, {
            type: 'server_shutdown',
            message: '服务器正在维护，请稍后重新连接'
        });
        user.ws.close();
    });
    
    // 关闭WebSocket服务器
    wss.close(() => {
        console.log('WebSocket服务器已关闭');
        
        // 关闭HTTP服务器
        server.close(() => {
            console.log('HTTP服务器已关闭');
            console.log('服务器已安全关闭');
            console.log('='.repeat(60));
            process.exit(0);
        });
    });
    
    // 强制关闭超时
    setTimeout(() => {
        console.error('强制关闭服务器');
        process.exit(1);
    }, 10000);
}

// ==================== 错误处理 ====================

process.on('uncaughtException', (error) => {
    console.error('[严重错误] 未捕获的异常:', error);
    // 不退出进程，继续运行
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[警告] 未处理的Promise拒绝:', reason);
    // 不退出进程，继续运行
});

// ==================== 服务器信息 ====================

console.log('服务器配置:');
console.log(`  Node.js版本: ${process.version}`);
console.log(`  操作系统: ${process.platform}`);
console.log(`  进程ID: ${process.pid}`);
console.log('');
