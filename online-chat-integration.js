// ========================================
// 联机功能与QQ聊天系统集成
// ========================================

// 在发送消息时检查是否是联机好友，如果是则通过WebSocket发送
(function() {
    'use strict';

    // 等待页面加载完成
    document.addEventListener('DOMContentLoaded', () => {
        console.log('联机功能集成模块已加载');
        
        // 监听消息发送事件
        setupMessageInterceptor();
    });

    // 设置消息拦截器
    function setupMessageInterceptor() {
        // 保存原始的消息发送函数（如果存在）
        if (typeof window.originalSendMessage === 'undefined' && typeof window.sendUserMessage === 'function') {
            window.originalSendMessage = window.sendUserMessage;
        }

        // 重写消息发送函数
        window.sendUserMessage = async function(chatId, content) {
            console.log('发送消息:', chatId, content);

            // 检查是否是联机好友
            if (chatId && chatId.startsWith('online_')) {
                // 这是联机好友，通过WebSocket发送
                const friendUserId = chatId.replace('online_', '');
                
                try {
                    // 检查是否已连接
                    if (!onlineChatManager.isConnected) {
                        alert('未连接到服务器，无法发送消息');
                        return;
                    }

                    // 检查是否是表情包且开启了识图
                    let processedContent = content;
                    if (typeof STICKER_REGEX !== 'undefined' && STICKER_REGEX.test(content)) {
                        const chat = await db.chats.get(chatId);
                        if (chat && chat.settings && chat.settings.enableStickerVision) {
                            // 进行AI识别并增强内容
                            const sticker = state.userStickers.find(s => s.url === content);
                            const stickerName = sticker?.name || '表情';
                            
                            try {
                                const aiDescription = await recognizeSticker(content, stickerName);
                                processedContent = `[表情包：${aiDescription} - ${stickerName}]`;
                                console.log('[表情包识图] 已增强内容:', processedContent);
                            } catch (error) {
                                console.error('[表情包识图] 识别失败，使用默认描述:', error);
                                processedContent = `[发送了一个表情，意思是: '${stickerName}']`;
                            }
                        } else {
                            // 使用默认描述
                            const sticker = state.userStickers.find(s => s.url === content);
                            processedContent = `[发送了一个表情，意思是: '${sticker?.name || '表情'}']`;
                        }
                    }

                    // 通过WebSocket发送处理后的内容
                    await onlineChatManager.sendMessageToFriend(friendUserId, processedContent);

                    // 保存到本地数据库（作为已发送的消息）
                    await db.messages.add({
                        id: `${chatId}_${Date.now()}`,
                        chatId: chatId,
                        content: processedContent,
                        sender: 'user',
                        timestamp: Date.now()
                    });

                    // 更新聊天列表
                    await db.chats.update(chatId, {
                        lastMessage: processedContent,
                        timestamp: Date.now()
                    });

                    // 刷新聊天界面
                    if (typeof loadMessages === 'function') {
                        await loadMessages(chatId);
                    }

                    console.log('联机消息已发送');
                } catch (error) {
                    console.error('发送联机消息失败:', error);
                    alert('发送失败: ' + error.message);
                }
            } else {
                // 普通AI聊天，使用原始函数
                if (typeof window.originalSendMessage === 'function') {
                    return await window.originalSendMessage(chatId, content);
                } else {
                    console.error('原始sendUserMessage函数未找到');
                }
            }
        };
    }

    // 在聊天界面显示联机好友的在线状态
    window.updateOnlineStatus = function(chatId) {
        if (!chatId || !chatId.startsWith('online_')) {
            return;
        }

        const friendUserId = chatId.replace('online_', '');
        const friend = onlineChatManager.onlineFriends.find(f => f.userId === friendUserId);

        if (friend) {
            // 更新聊天界面的在线状态显示
            const statusElement = document.querySelector('.chat-online-status');
            if (statusElement) {
                statusElement.textContent = friend.online ? '在线' : '离线';
                statusElement.style.color = friend.online ? '#34c759' : '#999';
            }
        }
    };

    // 监听好友在线状态变化
    window.addEventListener('online-friend-status-changed', (event) => {
        const { userId, online } = event.detail;
        
        // 更新好友列表中的状态
        const friend = onlineChatManager.onlineFriends.find(f => f.userId === userId);
        if (friend) {
            friend.online = online;
            onlineChatManager.saveOnlineFriends();
        }

        // 如果当前正在与该好友聊天，更新状态显示
        if (typeof currentChatId !== 'undefined' && currentChatId === `online_${userId}`) {
            updateOnlineStatus(currentChatId);
        }
    });

    // 在聊天列表中标识联机好友
    window.markOnlineFriendInChatList = function(chatElement, chatId) {
        if (chatId && chatId.startsWith('online_')) {
            // 添加联机好友标识
            const badge = document.createElement('span');
            badge.textContent = '联机';
            badge.style.cssText = `
                display: inline-block;
                padding: 2px 6px;
                background: #007aff;
                color: white;
                font-size: 10px;
                border-radius: 4px;
                margin-left: 6px;
            `;
            
            const nameElement = chatElement.querySelector('.chat-name');
            if (nameElement) {
                nameElement.appendChild(badge);
            }
        }
    };

    console.log('联机功能集成完成');
})();
