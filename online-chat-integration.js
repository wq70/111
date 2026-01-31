// ========================================
// 联机功能与QQ聊天系统集成
// ========================================

(function() {
    'use strict';
    
    console.log('联机功能集成模块已加载');
    
    // 等待DOM和script.js完全加载
    function init() {
        // 拦截发送按钮
        const sendBtn = document.getElementById('send-btn');
        const chatInput = document.getElementById('chat-input');
        
        if (!sendBtn || !chatInput) {
            console.log('⏳ 等待发送按钮和输入框...');
            setTimeout(init, 100);
            return;
        }
        
        console.log('✅ 找到发送按钮和输入框');
        
        // 移除所有现有的点击事件监听器（通过克隆元素）
        const newSendBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
        
        console.log('✅ 已重置发送按钮事件');
        
        // 添加新的点击事件监听器（在最前面执行）
        newSendBtn.addEventListener('click', async (e) => {
            console.log('✅ 发送按钮被点击');
            
            const content = chatInput.value.trim();
            
            // 尝试多种方式获取 chatId
            let chatId = null;
            
            // 方法1: 从全局 state 对象
            if (typeof state !== 'undefined' && state && state.activeChatId) {
                chatId = state.activeChatId;
                console.log('从 state.activeChatId 获取:', chatId);
            } else if (typeof window.state !== 'undefined' && window.state && window.state.activeChatId) {
                chatId = window.state.activeChatId;
                console.log('从 window.state.activeChatId 获取:', chatId);
            }
            
            // 方法2: 从 DOM 检查是否在聊天界面，并从聊天列表元素获取
            if (!chatId) {
                const chatScreen = document.getElementById('chat-interface-screen');
                if (chatScreen && chatScreen.classList.contains('active')) {
                    // 查找所有聊天列表项，找到 active 的那个
                    const activeChat = document.querySelector('.chat-item.active');
                    if (activeChat && activeChat.dataset.chatId) {
                        chatId = activeChat.dataset.chatId;
                        console.log('从 DOM .chat-item.active 获取:', chatId);
                    }
                }
            }
            
            // 方法3: 从 db.chats 中找到 isOnlineFriend 的记录
            if (!chatId && typeof db !== 'undefined') {
                console.log('尝试从数据库查找当前打开的联机好友聊天...');
                try {
                    const allChats = await db.chats.toArray();
                    const onlineChats = allChats.filter(c => c.isOnlineFriend);
                    if (onlineChats.length > 0) {
                        // 找最近打开的
                        onlineChats.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                        chatId = onlineChats[0].id;
                        console.log('从数据库最近的联机聊天获取:', chatId);
                    }
                } catch (err) {
                    console.error('从数据库查找失败:', err);
                }
            }
            
            console.log('发送内容:', content);
            console.log('最终chatId:', chatId);
            
            if (!content) {
                console.log('❌ 没有内容');
                return;
            }
            
            if (!chatId) {
                console.log('❌ 无法获取chatId，让原有的处理逻辑继续执行');
                return; // 让原有的事件处理器处理
            }
            
            // 检查是否是联机好友
            if (chatId.startsWith('online_')) {
                console.log('✅ 这是联机好友，拦截并使用WebSocket发送');
                
                // 阻止默认行为和冒泡
                e.stopImmediatePropagation();
                e.preventDefault();
                
                // 提取好友ID
                const friendUserId = chatId.replace('online_', '');
                console.log('好友ID:', friendUserId);
                
                try {
                    // 检查是否已连接
                    if (!onlineChatManager.isConnected) {
                        alert('未连接到服务器，无法发送消息');
                        return;
                    }
                    
                    // 播放静音音频（保持原有功能）
                    if (typeof playSilentAudio === 'function') {
                        playSilentAudio();
                    }
                    
                    let processedContent = content;
                    
                    // 处理表情包
                    if (typeof STICKER_REGEX !== 'undefined' && STICKER_REGEX.test(content)) {
                        const chat = await db.chats.get(chatId);
                        if (chat && chat.settings && chat.settings.enableStickerVision) {
                            const sticker = state.userStickers.find(s => s.url === content);
                            const stickerName = sticker?.name || '表情';
                            try {
                                const aiDescription = await recognizeSticker(content, stickerName);
                                processedContent = `[表情包：${aiDescription} - ${stickerName}]`;
                            } catch (error) {
                                processedContent = `[发送了一个表情，意思是: '${stickerName}']`;
                            }
                        } else {
                            const sticker = state.userStickers?.find(s => s.url === content);
                            processedContent = `[发送了一个表情，意思是: '${sticker?.name || '表情'}']`;
                        }
                    }
                    
                    // 通过WebSocket发送
                    await onlineChatManager.sendMessageToFriend(friendUserId, processedContent);
                    console.log('✅ 消息已通过WebSocket发送');
                    
                    // 保存到本地数据库
                    const chat = await db.chats.get(chatId);
                    console.log('发送方 - 获取chat对象:', chat ? '存在' : '不存在');
                    
                    if (chat) {
                        if (!Array.isArray(chat.history)) {
                            chat.history = [];
                        }
                        
                        console.log('发送方 - 添加消息前，history长度:', chat.history.length);
                        
                        // 创建消息对象
                        const msg = {
                            role: 'user',
                            content: processedContent,
                            timestamp: Date.now()
                        };
                        
                        // 添加消息到history
                        chat.history.push(msg);
                        
                        console.log('发送方 - 添加消息后，history长度:', chat.history.length);
                        
                        chat.lastMessage = processedContent;
                        chat.timestamp = Date.now();
                        
                        await db.chats.put(chat);
                        console.log('发送方 - chat对象已保存到数据库');
                        
                        // 同步到state（尝试两种方式）
                        if (typeof state !== 'undefined' && state && state.chats) {
                            state.chats[chatId] = chat;
                            console.log('发送方 - 已同步到 state.chats');
                        }
                        if (typeof window.state !== 'undefined' && window.state && window.state.chats) {
                            window.state.chats[chatId] = chat;
                            console.log('发送方 - 已同步到 window.state.chats');
                        }
                        
                        // 【关键】立即在界面显示消息，而不是重新渲染
                        if (typeof window.appendMessage === 'function') {
                            await window.appendMessage(msg, chat);
                            console.log('✅ 已通过 appendMessage 显示消息');
                        } else {
                            console.warn('appendMessage 函数不存在，尝试重新渲染界面');
                            if (typeof window.renderChatInterface === 'function') {
                                await window.renderChatInterface(chatId);
                                console.log('✅ 已重新渲染聊天界面');
                            }
                        }
                    }
                    
                    // 清空输入框
                    chatInput.value = '';
                    chatInput.style.height = 'auto';
                    chatInput.focus();
                    
                    // 取消回复模式
                    if (typeof cancelReplyMode === 'function') {
                        cancelReplyMode();
                    }
                    
                    // 收起操作栏
                    if (document.body.classList.contains('chat-actions-expanded')) {
                        document.body.classList.remove('chat-actions-expanded');
                    }
                    
                    // 刷新聊天列表（不需要重新渲染聊天界面，因为已经用 appendMessage 显示了）
                    if (typeof window.renderChatListProxy === 'function') {
                        await window.renderChatListProxy();
                        console.log('✅ 已刷新聊天列表');
                    }
                    
                    console.log('✅ 联机消息发送完成');
                    
                } catch (error) {
                    console.error('发送联机消息失败:', error);
                    alert('发送失败: ' + error.message);
                }
            } else {
                console.log('❌ 不是联机好友，使用默认处理');
                // 不是联机好友，让原有的事件处理器处理
                // 不做任何事，让事件继续传播
            }
        }, true); // 使用捕获阶段，确保最先执行
        
        console.log('✅ 联机消息拦截器设置完成');
    }
    
    // 启动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();
