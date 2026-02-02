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

console.log('='.repeat(60));
console.log('                  真人联机服务器启动中...                  ');
console.log('='.repeat(60));

// ==================== WebSocket连接处理 ====================

wss.on('connection', (ws, req) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[连接] 新客户端连接 - IP: ${clientIp}`);
    
    let currentUserId = null; // 当前连接的用户ID
    let heartbeatTimer = null; // 心跳超时计时器
    
    // 设置心跳超时检测
    function resetHeartbeat() {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        // 60秒无心跳则断开连接
        heartbeatTimer = setTimeout(() => {
            console.log(`[超时] 用户心跳超时: ${currentUserId}`);
            ws.terminate();
        }, 60000);
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
            onlineUsers.delete(currentUserId);
            console.log(`[离线] 用户离线: ${currentUserId} (在线: ${onlineUsers.size})`);
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
            
            // 关闭旧的WebSocket连接
            try {
                if (oldUser.ws && oldUser.ws.readyState === WebSocket.OPEN) {
                    oldUser.ws.close(1000, '账号在其他地方登录');
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
