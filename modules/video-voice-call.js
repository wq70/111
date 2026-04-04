// ============================================================
// video-voice-call.js
// 来源：script.js 第 25404 ~ 26812 行
// 功能：视频通话 & 语音通话 & 拍一拍 & 通话消息操作
// ============================================================

(function () {
  // state 通过全局作用域访问（window.state，由 init-and-state.js 初始化）

  let videoCallState = {
    isActive: false,
    isAwaitingResponse: false,
    isGroupCall: false,
    activeChatId: null,
    initiator: null,
    startTime: null,
    participants: [],
    isUserParticipating: true,
    callHistory: [],
    preCallContext: ""
  };

  let voiceCallState = {
    isActive: false,
    isAwaitingResponse: false,
    isGroupCall: false,
    activeChatId: null,
    initiator: null,
    startTime: null,
    participants: [],
    isUserParticipating: true,
    callHistory: [],
    preCallContext: ""
  };

  let callTimerInterval = null;
  let voiceCallTimerInterval = null;


  async function handleInitiateCall() {
    if (!state.activeChatId || videoCallState.isActive || videoCallState.isAwaitingResponse) return;

    const chat = state.chats[state.activeChatId];
    videoCallState.isGroupCall = chat.isGroup;
    videoCallState.isAwaitingResponse = true;
    videoCallState.initiator = 'user';
    videoCallState.activeChatId = chat.id;
    videoCallState.isUserParticipating = true;


    if (chat.isGroup) {
      document.getElementById('outgoing-call-avatar').src = chat.settings.myAvatar || defaultMyGroupAvatar;
      document.getElementById('outgoing-call-name').textContent = chat.settings.myNickname || '我';
    } else {
      document.getElementById('outgoing-call-avatar').src = chat.settings.aiAvatar || defaultAvatar;
      document.getElementById('outgoing-call-name').textContent = chat.name;
    }
    document.querySelector('#outgoing-call-screen .caller-text').textContent = chat.isGroup ? "正在呼叫所有成员..." : "正在呼叫...";
    showScreen('outgoing-call-screen');


    const requestMessage = {
      role: 'system',
      content: chat.isGroup ?
        `[系统提示：用户 (${chat.settings.myNickname || '我'}) 发起了群视频通话请求。请你们各自决策，并使用 "group_call_response" 指令，设置 "decision" 为 "join" 或 "decline" 来回应。]` :
        `[系统提示：用户向你发起了视频通话请求。请根据你的人设，使用 "video_call_response" 指令，并设置 "decision" 为 "accept" 或 "reject" 来回应。]`,
      timestamp: Date.now(),
      isHidden: true,
    };
    chat.history.push(requestMessage);
    await db.chats.put(chat);


    await triggerAiResponse();
  }


  function startVideoCall() {
    const chat = state.chats[videoCallState.activeChatId];
    if (!chat) return;

    videoCallState.isActive = true;
    videoCallState.isAwaitingResponse = false;
    videoCallState.startTime = Date.now();
    videoCallState.callHistory = [];


    const preCallHistory = chat.history.slice(-10);
    videoCallState.preCallContext = preCallHistory.map(msg => {
      const sender = msg.role === 'user' ? (chat.settings.myNickname || '我') : (msg.senderName || chat.name);
      return `${sender}: ${String(msg.content).substring(0, 50)}...`;
    }).join('\n');


    updateParticipantAvatars();

    document.getElementById('video-call-main').innerHTML = `<em>${videoCallState.isGroupCall ? '群聊已建立...' : '正在接通...'}</em>`;
    showScreen('video-call-screen');

    // 应用视频通话优化设置
    if (typeof window.applyVideoOptimizationToCall === 'function') {
      window.applyVideoOptimizationToCall(chat);
    }

    document.getElementById('user-speak-btn').style.display = videoCallState.isUserParticipating ? 'block' : 'none';
    document.getElementById('join-call-btn').style.display = videoCallState.isUserParticipating ? 'none' : 'block';

    if (callTimerInterval) clearInterval(callTimerInterval);
    callTimerInterval = setInterval(updateCallTimer, 1000);
    updateCallTimer();

    triggerAiInCallAction();
  }

  function minimizeVideoCall() {
    if (!videoCallState.isActive) return;


    document.getElementById('video-call-restore-btn').style.display = 'flex';


    showScreen('chat-interface-screen');


    console.log("视频通话已最小化。");
  }


  function restoreVideoCall() {
    if (!videoCallState.isActive) return;


    document.getElementById('video-call-restore-btn').style.display = 'none';


    showScreen('video-call-screen');
    console.log("视频通话已恢复。");
  }

  async function endVideoCall() {
    if (!videoCallState.isActive) return;
    stopTtsQueue();
    document.getElementById('video-call-restore-btn').style.display = 'none';
    const duration = Math.floor((Date.now() - videoCallState.startTime) / 1000);
    const durationText = `${Math.floor(duration / 60)}分${duration % 60}秒`;
    const endCallText = `通话结束，时长 ${durationText}`;

    const chat = state.chats[videoCallState.activeChatId];
    if (chat) {

      const participantsData = [];
      if (videoCallState.isGroupCall) {
        videoCallState.participants.forEach(p => participantsData.push({
          name: p.originalName,
          avatar: p.avatar
        }));
        if (videoCallState.isUserParticipating) {
          participantsData.unshift({
            name: chat.settings.myNickname || '我',
            avatar: chat.settings.myAvatar || defaultMyGroupAvatar
          });
        }
      } else {
        participantsData.push({
          name: chat.name,
          avatar: chat.settings.aiAvatar || defaultAvatar
        });
        participantsData.unshift({
          name: '我',
          avatar: chat.settings.myAvatar || defaultAvatar
        });
      }

      const callRecord = {
        chatId: videoCallState.activeChatId,
        timestamp: Date.now(),
        duration: duration,
        participants: participantsData,
        transcript: [...videoCallState.callHistory]
      };
      await db.callRecords.add(callRecord);
      console.log("通话记录已保存:", callRecord);


      let summaryMessage = {
        role: videoCallState.initiator === 'user' ? 'user' : 'assistant',
        content: endCallText,
        timestamp: Date.now(),
      };
      if (chat.isGroup && summaryMessage.role === 'assistant') {
        summaryMessage.senderName = videoCallState.callRequester || chat.members[0]?.originalName || chat.name;
      }
      chat.history.push(summaryMessage);






      const callTranscriptForAI = videoCallState.callHistory.map(h => {
        const sender = h.role === 'user' ? (chat.settings.myNickname || '我') : h.senderName;
        return `${sender}: ${h.content}`;
      }).join('\n');



      summarizeCallTranscript(chat.id, callTranscriptForAI);


      const hiddenReactionInstruction = {
        role: 'system',
        content: `[系统指令：视频通话刚刚结束。请你以角色的口吻，向用户主动发送一两条消息，来自然地总结这次通话的要点、确认达成的约定，或者表达你的感受。]`,
        timestamp: Date.now() + 1,
        isHidden: true
      };
      chat.history.push(hiddenReactionInstruction);


      await db.chats.put(chat);
    }


    clearInterval(callTimerInterval);
    callTimerInterval = null;

    // 停止摄像头
    if (typeof stopCamera === 'function') {
      stopCamera();
    }

    videoCallState = {
      isActive: false,
      isAwaitingResponse: false,
      isGroupCall: false,
      activeChatId: null,
      initiator: null,
      startTime: null,
      participants: [],
      isUserParticipating: true,
      callHistory: [],
      preCallContext: ""
    };


    if (chat) {
      openChat(chat.id);
      triggerAiResponse();
    }
  }




  function updateParticipantAvatars() {
    const grid = document.getElementById('participant-avatars-grid');
    grid.innerHTML = '';
    const chat = state.chats[videoCallState.activeChatId];
    if (!chat) return;

    let participantsToRender = [];


    if (videoCallState.isGroupCall) {

      participantsToRender = [...videoCallState.participants];

      if (videoCallState.isUserParticipating) {
        participantsToRender.unshift({
          id: 'user',
          name: chat.settings.myNickname || '我',
          avatar: chat.settings.myAvatar || defaultMyGroupAvatar
        });
      }
    } else {

      participantsToRender.push({
        id: 'ai',
        name: chat.name,
        avatar: chat.settings.aiAvatar || defaultAvatar
      });
    }

    participantsToRender.forEach(p => {
      const wrapper = document.createElement('div');
      wrapper.className = 'participant-avatar-wrapper';
      wrapper.dataset.participantId = p.id;
      const displayName = p.groupNickname || p.name;
      wrapper.innerHTML = `
            <img src="${p.avatar}" class="participant-avatar" alt="${displayName}">
            <div class="participant-name">${displayName}</div>
        `;
      grid.appendChild(wrapper);
    });
  }


  function handleUserJoinCall() {
    if (!videoCallState.isActive || videoCallState.isUserParticipating) return;

    videoCallState.isUserParticipating = true;
    updateParticipantAvatars();


    document.getElementById('user-speak-btn').style.display = 'block';
    document.getElementById('join-call-btn').style.display = 'none';


    triggerAiInCallAction("[系统提示：用户加入了通话]");
  }



  function updateCallTimer() {
    if (!videoCallState.isActive) return;
    const elapsed = Math.floor((Date.now() - videoCallState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    document.getElementById('call-timer').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }


  function showIncomingCallModal(callType = 'video', chat = null) {
    // 如果没有传入 chat，则从 state 中获取
    if (!chat) {
      const activeChatId = callType === 'video' ? videoCallState.activeChatId : voiceCallState.activeChatId;
      chat = state.chats[activeChatId];
    }
    if (!chat) return;

    const callTypeText = callType === 'video' ? '视频通话' : '语音通话';
    const callTypeTextShort = callType === 'video' ? '视频' : '语音';

    if (chat.isGroup) {
      const currentCallState = callType === 'video' ? videoCallState : voiceCallState;
      const requesterName = currentCallState.callRequester || chat.members[0]?.name || '一位成员';
      document.getElementById('caller-avatar').src = chat.settings.groupAvatar || defaultGroupAvatar;
      document.getElementById('caller-name').textContent = chat.name;
      document.querySelector('.incoming-call-content .caller-text').textContent = `${requesterName} 邀请你加入群${callTypeTextShort}`;
    } else {
      document.getElementById('caller-avatar').src = chat.settings.aiAvatar || defaultAvatar;
      document.getElementById('caller-name').textContent = chat.name;
      document.querySelector('.incoming-call-content .caller-text').textContent = `邀请你${callTypeText}`;
    }

    // 保存通话类型到 modal 的 dataset 中，以便接听/拒绝时使用
    const modal = document.getElementById('incoming-call-modal');
    modal.dataset.callType = callType;
    modal.classList.add('visible');
  }



  function hideIncomingCallModal() {
    document.getElementById('incoming-call-modal').classList.remove('visible');
  }


  async function triggerAiInCallAction(userInput = null) {
    if (!videoCallState.isActive) return;

    const chat = state.chats[videoCallState.activeChatId];
    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    const callFeed = document.getElementById('video-call-main');
    const userNickname = chat.settings.myNickname || '我';

    let worldBookContent = '';
    // 获取所有应该使用的世界书ID（包括手动选择的和全局的）
    let allWorldBookIds = [...(chat.settings.linkedWorldBookIds || [])];
    // 添加所有全局世界书
    state.worldBooks.forEach(wb => {
      if (wb.isGlobal && !allWorldBookIds.includes(wb.id)) {
        allWorldBookIds.push(wb.id);
      }
    });

    if (allWorldBookIds.length > 0) {
      const linkedContents = allWorldBookIds.map(bookId => {
        const worldBook = state.worldBooks.find(wb => wb.id === bookId);
        return worldBook && worldBook.content ? `\n\n## 世界书: ${worldBook.name}\n${worldBook.content}` : '';
      }).filter(Boolean).join('');
      if (linkedContents) {
        worldBookContent = `# --- 世界书 (World Book) ---
# 【最高优先级指令：绝对真理】
# 以下内容是你所在世界的"物理法则"和"基础常识"。
# 无论用户是否提及，你都【必须】时刻主动应用这些设定来指导你的思考和描写。
# 它们是无条件生效的，不需要触发词。
${linkedContents}
# --- 世界书设定结束 ---
`;
      }
    }
    const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0 ?
      `\n# 长期记忆 (必须参考)\n` + chat.longTermMemory.map(mem => `- (记录于 ${formatTimeAgo(mem.timestamp)}) ${mem.content}`).join('\n') :
      '';

    if (userInput && videoCallState.isUserParticipating) {
      const userTimestamp = Date.now();
      const userBubble = document.createElement('div');
      userBubble.className = 'call-message-bubble user-speech';
      userBubble.textContent = userInput;
      userBubble.dataset.timestamp = userTimestamp;
      addLongPressListener(userBubble, () => showCallMessageActions(userTimestamp));
      callFeed.appendChild(userBubble);
      callFeed.scrollTop = callFeed.scrollHeight;

      // 检查是否启用真实摄像头并获取截图
      let userContent = userInput;
      if (chat.videoOptimization && chat.videoOptimization.enableRealCamera) {
        const capturedImage = window.getLastCameraCapture ? window.getLastCameraCapture() : null;
        if (capturedImage) {
          // 为支持视觉的模型构建多模态消息
          userContent = [
            { type: 'text', text: userInput },
            { type: 'image_url', image_url: { url: capturedImage } }
          ];
        }
      }

      videoCallState.callHistory.push({
        role: 'user',
        content: userContent,
        timestamp: userTimestamp
      });
    }


    let inCallPrompt;
    if (videoCallState.isGroupCall) {
      const participantNames = videoCallState.participants.map(p => p.name);
      if (videoCallState.isUserParticipating) {
        participantNames.unshift(userNickname);
      }
      inCallPrompt = `
        # 你的任务
        你是一个群聊视频通话的导演。你的任务是扮演所有【除了用户以外】的AI角色，并以【第三人称旁观视角】来描述他们在通话中的所有动作和语言。
        # 核心规则
        1.  **【身份铁律】**: 用户的身份是【${userNickname}】。你【绝对不能】生成 \`name\` 字段为 **"${userNickname}"** 的发言。
        2.  **【视角铁律】**: 你的回复【绝对不能】使用第一人称"我"。
        3.  **格式**: 你的回复【必须】是一个JSON数组，每个对象代表一个角色的发言，格式为：\`{"name": "角色名", "speech": "*他笑了笑* 大家好啊！"}\`。
        4.  **角色扮演**: 严格遵守每个角色的设定。
        # 当前情景
        你们正在一个群视频通话中。
         ${longTermMemoryContext}
        **通话前的聊天摘要**:
        ${videoCallState.preCallContext}
        **当前参与者**: ${participantNames.join('、 ')}。
        **通话刚刚开始...**
        ${worldBookContent}
        现在，请根据【通话前摘要】和下面的【通话实时记录】，继续进行对话。
        `;
    } else {
      let openingContext = videoCallState.initiator === 'user' ?
        `你刚刚接听了用户的视频通话请求。` :
        `用户刚刚接听了你主动发起的视频通话。`;
      const interleavedMode = chat.videoOptimization && chat.videoOptimization.interleavedMode;
      const layoutRule = interleavedMode
        ? `4.  **【穿插排版】**: 旁白和对话按自然发生的顺序穿插排列。例如：先一段动作描写，再说一两句话，再一段动作描写，再说话。不要把所有旁白堆在一起。
        5.  **【对话规则】**: 对话是角色实际说出的话，每句对话会独立显示，可以连续说多句话。`
        : `4.  **【旁白规则】**: 旁白只描述动作、表情、神态等视觉信息，所有旁白会合并显示为一段灰色文字。
        5.  **【对话规则】**: 对话是角色实际说出的话，每句对话会独立显示，可以连续说多句话。`;
      inCallPrompt = `
        # 你的任务
        你现在是一个场景描述引擎。你的任务是扮演 ${chat.name} (${chat.settings.aiPersona})，并以【第三人称旁观视角】来描述TA在视频通话中的所有动作和语言。
        # 核心规则
        1.  **【【【视角铁律】】】**: 你的回复【绝对不能】使用第一人称"我"。必须使用第三人称，如"他"、"她"、或直接使用角色名"${chat.name}"。
        2.  **【格式要求】**: 你的回复【必须】是一个JSON数组，包含旁白和对话。格式如下：
           - 旁白（动作、表情描述）：\`{"type": "narration", "content": "他笑了笑，挠了挠头"}\`
           - 对话（角色说的话）：\`{"type": "dialogue", "content": "你好啊！"}\`
        3.  **【多句发言】**: 你可以一次说多句话，每句话作为独立的dialogue对象。例如：
           \`[{"type": "narration", "content": "他笑了笑"}, {"type": "dialogue", "content": "你好啊！"}, {"type": "dialogue", "content": "最近怎么样？"}]\`
        ${layoutRule}
        # 当前情景
        你正在和用户（${userNickname}，人设: ${chat.settings.myPersona}）进行视频通话。
        ${longTermMemoryContext}
        **${openingContext}**
        **通话前的聊天摘要 (这是你们通话的原因，至关重要！)**:
        ${videoCallState.preCallContext}
        现在，请根据【通话前摘要】和下面的【通话实时记录】，继续进行对话。记住：必须返回JSON数组格式，区分旁白和对话。
        `;
    }


    const messagesForApi = [{
      role: 'system',
      content: inCallPrompt
    },
    ...videoCallState.callHistory.map(h => ({
      role: h.role,
      content: h.content
    }))
    ];

    if (videoCallState.callHistory.length === 0) {
      const firstLineTrigger = videoCallState.initiator === 'user' ? `*你按下了接听键...*` : `*对方按下了接听键...*`;
      messagesForApi.push({
        role: 'user',
        content: firstLineTrigger
      });
    }

    try {
      let isGemini = proxyUrl === GEMINI_API_URL;
      let geminiConfig = toGeminiRequestData(model, apiKey, inCallPrompt, messagesForApi)
      const response = isGemini ? await fetch(geminiConfig.url, geminiConfig.data) : await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: messagesForApi,
          temperature: state.globalSettings.apiTemperature || 0.8
        })
      });
      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try { const errData = await response.json(); errMsg = errData?.error?.message || errData?.message || errData?.detail || JSON.stringify(errData); } catch(e) { errMsg += ` (${response.statusText})`; }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const aiResponse = isGemini ? data.candidates[0].content.parts[0].text : data.choices[0].message.content;

      const connectingElement = callFeed.querySelector('em');
      if (connectingElement) connectingElement.remove();
      if (videoCallState.isGroupCall) {
        const speechArray = parseAiResponse(aiResponse);
        speechArray.forEach(turn => {
          if (!turn.name || turn.name === userNickname || !turn.speech) return;
          const aiTimestamp = Date.now() + Math.random();
          const aiBubble = document.createElement('div');
          aiBubble.className = 'call-message-bubble ai-speech';
          aiBubble.innerHTML = `<strong>${turn.name}:</strong> ${turn.speech}`;
          aiBubble.dataset.timestamp = aiTimestamp;
          addLongPressListener(aiBubble, () => showCallMessageActions(aiTimestamp));
          callFeed.appendChild(aiBubble);
          videoCallState.callHistory.push({
            role: 'assistant',
            content: `${turn.name}: ${turn.speech}`,
            timestamp: aiTimestamp
          });

          const speaker = videoCallState.participants.find(p => p.name === turn.name);
          if (speaker) {
            const speakingAvatar = document.querySelector(`.participant-avatar-wrapper[data-participant-id="${speaker.id}"] .participant-avatar`);
            if (speakingAvatar) {
              speakingAvatar.classList.add('speaking');
              setTimeout(() => speakingAvatar.classList.remove('speaking'), 2000);
            }
          }
        });
      } else {
        // 单人视频通话：支持旁白和多句对话
        const enableTts = chat.settings.enableTts !== false;
        const voiceId = chat.settings.minimaxVoiceId;
        const interleavedMode = chat.videoOptimization && chat.videoOptimization.interleavedMode;

        // 尝试解析为JSON数组
        const messagesArray = parseAiResponse(aiResponse);

        if (interleavedMode) {
          // 穿插模式：按原始顺序逐条渲染
          let dialogueCount = 0;
          messagesArray.forEach((msg, index) => {
            const aiTimestamp = Date.now() + index + 1;

            if (msg.type === 'narration') {
              const narrationBubble = document.createElement('div');
              narrationBubble.className = 'call-message-bubble ai-narration';
              narrationBubble.style.color = '#999';
              narrationBubble.style.fontStyle = 'italic';
              narrationBubble.textContent = msg.content;
              narrationBubble.dataset.timestamp = aiTimestamp;
              addLongPressListener(narrationBubble, () => showCallMessageActions(aiTimestamp));
              callFeed.appendChild(narrationBubble);

              videoCallState.callHistory.push({
                role: 'assistant',
                content: `[旁白] ${msg.content}`,
                timestamp: aiTimestamp
              });
            } else {
              const aiBubble = document.createElement('div');
              aiBubble.className = 'call-message-bubble ai-speech';
              aiBubble.textContent = msg.content;
              aiBubble.dataset.timestamp = aiTimestamp;
              addLongPressListener(aiBubble, () => showCallMessageActions(aiTimestamp));
              callFeed.appendChild(aiBubble);

              videoCallState.callHistory.push({
                role: 'assistant',
                content: msg.content,
                timestamp: aiTimestamp
              });

              if (enableTts && voiceId) {
                playVideoCallPureTTS(msg.content, voiceId);
              }
              dialogueCount++;
            }
          });

          // 头像动画
          const speakingAvatar = document.querySelector(`.participant-avatar-wrapper[data-participant-id="ai"] .participant-avatar`);
          if (speakingAvatar && dialogueCount > 0) {
            speakingAvatar.classList.add('speaking');
            const totalLength = messagesArray.filter(m => m.type === 'dialogue').reduce((sum, m) => sum + (m.content || '').length, 0);
            const speakTime = Math.min(totalLength * 200, 5000);
            setTimeout(() => speakingAvatar.classList.remove('speaking'), speakTime);
          }
        } else {
          // 默认模式：旁白合并在前，对话在后
          const narrations = messagesArray.filter(m => m.type === 'narration');
          const dialogues = messagesArray.filter(m => m.type === 'dialogue');

          if (narrations.length > 0) {
            const narrationTimestamp = Date.now();
            const narrationBubble = document.createElement('div');
            narrationBubble.className = 'call-message-bubble ai-narration';
            narrationBubble.style.color = '#999';
            narrationBubble.style.fontStyle = 'italic';
            const narrationText = narrations.map(n => n.content).join(' ');
            narrationBubble.textContent = narrationText;
            narrationBubble.dataset.timestamp = narrationTimestamp;
            addLongPressListener(narrationBubble, () => showCallMessageActions(narrationTimestamp));
            callFeed.appendChild(narrationBubble);

            videoCallState.callHistory.push({
              role: 'assistant',
              content: `[旁白] ${narrationText}`,
              timestamp: narrationTimestamp
            });
          }

          dialogues.forEach((msg, index) => {
            const messageContent = msg.content;
            const aiTimestamp = Date.now() + index + 1;

            const aiBubble = document.createElement('div');
            aiBubble.className = 'call-message-bubble ai-speech';
            aiBubble.textContent = messageContent;
            aiBubble.dataset.timestamp = aiTimestamp;
            addLongPressListener(aiBubble, () => showCallMessageActions(aiTimestamp));
            callFeed.appendChild(aiBubble);

            videoCallState.callHistory.push({
              role: 'assistant',
              content: messageContent,
              timestamp: aiTimestamp
            });

            if (enableTts && voiceId) {
              playVideoCallPureTTS(messageContent, voiceId);
            }
          });

          // 头像动画
          const speakingAvatar = document.querySelector(`.participant-avatar-wrapper[data-participant-id="ai"] .participant-avatar`);
          if (speakingAvatar) {
            speakingAvatar.classList.add('speaking');
            const totalLength = dialogues.reduce((sum, msg) => sum + (msg.content || '').length, 0);
            const speakTime = Math.min(totalLength * 200, 5000);
            setTimeout(() => speakingAvatar.classList.remove('speaking'), speakTime);
          }
        }
      }

      callFeed.scrollTop = callFeed.scrollHeight;

    } catch (error) {
      const errorBubble = document.createElement('div');
      errorBubble.className = 'call-message-bubble ai-speech';
      errorBubble.style.color = '#ff8a80';
      errorBubble.textContent = `[ERROR: ${error.message}]`;
      callFeed.appendChild(errorBubble);
      callFeed.scrollTop = callFeed.scrollHeight;
      videoCallState.callHistory.push({
        role: 'assistant',
        content: `[ERROR: ${error.message}]`
      });
    }
    // ★ 每次发送后修剪历史
    trimCallHistory(videoCallState);
  }
  function trimCallHistory(callState) {
    if (callState.callHistory.length > 100) {
      callState.callHistory = callState.callHistory.slice(-100);
    }
  }




  function toggleCallButtons(isGroup) {
    document.getElementById('video-call-btn').style.display = isGroup ? 'none' : 'flex';
    document.getElementById('group-video-call-btn').style.display = isGroup ? 'flex' : 'none';
    document.getElementById('voice-call-btn').style.display = isGroup ? 'none' : 'flex';
    document.getElementById('group-voice-call-btn').style.display = isGroup ? 'flex' : 'none';
  }

  // ==================== 语音通话功能 ====================

  async function handleInitiateVoiceCall() {
    if (!state.activeChatId || voiceCallState.isActive || voiceCallState.isAwaitingResponse) return;

    const chat = state.chats[state.activeChatId];
    voiceCallState.isGroupCall = chat.isGroup;
    voiceCallState.isAwaitingResponse = true;
    voiceCallState.initiator = 'user';
    voiceCallState.activeChatId = chat.id;
    voiceCallState.isUserParticipating = true;

    if (chat.isGroup) {
      document.getElementById('outgoing-call-avatar').src = chat.settings.myAvatar || defaultMyGroupAvatar;
      document.getElementById('outgoing-call-name').textContent = chat.settings.myNickname || '我';
    } else {
      document.getElementById('outgoing-call-avatar').src = chat.settings.aiAvatar || defaultAvatar;
      document.getElementById('outgoing-call-name').textContent = chat.name;
    }
    document.querySelector('#outgoing-call-screen .caller-text').textContent = chat.isGroup ? "正在呼叫所有成员..." : "正在呼叫...";
    showScreen('outgoing-call-screen');

    const requestMessage = {
      role: 'system',
      content: chat.isGroup ?
        `[系统提示：用户 (${chat.settings.myNickname || '我'}) 发起了群语音通话请求。请你们各自决策，并使用 "group_voice_response" 指令，设置 "decision" 为 "join" 或 "decline" 来回应。]` :
        `[系统提示：用户向你发起了语音通话请求。请根据你的人设，使用 "voice_call_response" 指令，并设置 "decision" 为 "accept" 或 "reject" 来回应。]`,
      timestamp: Date.now(),
      isHidden: true,
    };
    chat.history.push(requestMessage);
    await db.chats.put(chat);

    await triggerAiResponse();
  }

  function startVoiceCall() {
    const chat = state.chats[voiceCallState.activeChatId];
    if (!chat) return;

    voiceCallState.isActive = true;
    voiceCallState.isAwaitingResponse = false;
    voiceCallState.startTime = Date.now();
    voiceCallState.callHistory = [];

    const preCallHistory = chat.history.slice(-10);
    voiceCallState.preCallContext = preCallHistory.map(msg => {
      const sender = msg.role === 'user' ? (chat.settings.myNickname || '我') : (msg.senderName || chat.name);
      return `${sender}: ${String(msg.content).substring(0, 50)}...`;
    }).join('\n');

    updateVoiceParticipantAvatars();

    document.getElementById('voice-call-main').innerHTML = `<em>${voiceCallState.isGroupCall ? '群聊已建立...' : '正在接通...'}</em>`;
    showScreen('voice-call-screen');

    document.getElementById('voice-user-speak-btn').style.display = voiceCallState.isUserParticipating ? 'block' : 'none';
    document.getElementById('voice-join-call-btn').style.display = voiceCallState.isUserParticipating ? 'none' : 'block';

    if (voiceCallTimerInterval) clearInterval(voiceCallTimerInterval);
    voiceCallTimerInterval = setInterval(updateVoiceCallTimer, 1000);
    updateVoiceCallTimer();

    triggerAiInVoiceCallAction();
  }

  function minimizeVoiceCall() {
    if (!voiceCallState.isActive) return;
    document.getElementById('voice-call-restore-btn').style.display = 'flex';
    showScreen('chat-interface-screen');
    console.log("语音通话已最小化。");
  }

  function restoreVoiceCall() {
    if (!voiceCallState.isActive) return;
    document.getElementById('voice-call-restore-btn').style.display = 'none';
    showScreen('voice-call-screen');
    console.log("语音通话已恢复。");
  }

  async function endVoiceCall() {
    if (!voiceCallState.isActive) return;
    stopTtsQueue();
    document.getElementById('voice-call-restore-btn').style.display = 'none';
    const duration = Math.floor((Date.now() - voiceCallState.startTime) / 1000);
    const durationText = `${Math.floor(duration / 60)}分${duration % 60}秒`;
    const endCallText = `语音通话结束，时长 ${durationText}`;

    const chat = state.chats[voiceCallState.activeChatId];
    if (chat) {
      const participantsData = [];
      if (voiceCallState.isGroupCall) {
        voiceCallState.participants.forEach(p => participantsData.push({
          name: p.originalName,
          avatar: p.avatar
        }));
        if (voiceCallState.isUserParticipating) {
          participantsData.unshift({
            name: chat.settings.myNickname || '我',
            avatar: chat.settings.myAvatar || defaultMyGroupAvatar
          });
        }
      } else {
        participantsData.push({
          name: chat.name,
          avatar: chat.settings.aiAvatar || defaultAvatar
        });
        participantsData.unshift({
          name: '我',
          avatar: chat.settings.myAvatar || defaultAvatar
        });
      }

      const callRecord = {
        chatId: voiceCallState.activeChatId,
        timestamp: Date.now(),
        duration: duration,
        participants: participantsData,
        transcript: [...voiceCallState.callHistory],
        callType: 'voice'
      };
      await db.callRecords.add(callRecord);
      console.log("语音通话记录已保存:", callRecord);

      let summaryMessage = {
        role: voiceCallState.initiator === 'user' ? 'user' : 'assistant',
        content: endCallText,
        timestamp: Date.now(),
      };
      if (chat.isGroup && summaryMessage.role === 'assistant') {
        summaryMessage.senderName = voiceCallState.callRequester || chat.members[0]?.originalName || chat.name;
      }
      chat.history.push(summaryMessage);

      const callTranscriptForAI = voiceCallState.callHistory.map(h => {
        const sender = h.role === 'user' ? (chat.settings.myNickname || '我') : h.senderName;
        return `${sender}: ${h.content}`;
      }).join('\n');

      summarizeCallTranscript(chat.id, callTranscriptForAI);

      const hiddenReactionInstruction = {
        role: 'system',
        content: `[系统指令：语音通话刚刚结束。请你以角色的口吻，向用户主动发送一两条消息，来自然地总结这次通话的要点、确认达成的约定，或者表达你的感受。]`,
        timestamp: Date.now() + 1,
        isHidden: true
      };
      chat.history.push(hiddenReactionInstruction);

      await db.chats.put(chat);
    }

    clearInterval(voiceCallTimerInterval);
    voiceCallTimerInterval = null;

    voiceCallState = {
      isActive: false,
      isAwaitingResponse: false,
      isGroupCall: false,
      activeChatId: null,
      initiator: null,
      startTime: null,
      participants: [],
      isUserParticipating: true,
      callHistory: [],
      preCallContext: ""
    };

    if (chat) {
      openChat(chat.id);
      triggerAiResponse();
    }
  }

  function updateVoiceParticipantAvatars() {
    const grid = document.getElementById('voice-participant-avatars-grid');
    grid.innerHTML = '';
    const chat = state.chats[voiceCallState.activeChatId];
    if (!chat) return;

    let participantsToRender = [];

    if (voiceCallState.isGroupCall) {
      participantsToRender = [...voiceCallState.participants];
      if (voiceCallState.isUserParticipating) {
        participantsToRender.unshift({
          id: 'user',
          name: chat.settings.myNickname || '我',
          avatar: chat.settings.myAvatar || defaultMyGroupAvatar
        });
      }
    } else {
      participantsToRender.push({
        id: 'ai',
        name: chat.name,
        avatar: chat.settings.aiAvatar || defaultAvatar
      });
    }

    participantsToRender.forEach(p => {
      const wrapper = document.createElement('div');
      wrapper.className = 'participant-avatar-wrapper';
      wrapper.dataset.participantId = p.id;
      const displayName = p.groupNickname || p.name;
      wrapper.innerHTML = `
        <img src="${p.avatar}" class="participant-avatar" alt="${displayName}">
        <div class="participant-name">${displayName}</div>
      `;
      grid.appendChild(wrapper);
    });
  }

  function handleUserJoinVoiceCall() {
    if (!voiceCallState.isActive || voiceCallState.isUserParticipating) return;

    voiceCallState.isUserParticipating = true;
    updateVoiceParticipantAvatars();

    document.getElementById('voice-user-speak-btn').style.display = 'block';
    document.getElementById('voice-join-call-btn').style.display = 'none';

    triggerAiInVoiceCallAction("[系统提示：用户加入了通话]");
  }

  function updateVoiceCallTimer() {
    if (!voiceCallState.isActive) return;
    const elapsed = Math.floor((Date.now() - voiceCallState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    document.getElementById('voice-call-timer').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  async function triggerAiInVoiceCallAction(userInput = null) {
    if (!voiceCallState.isActive) return;

    const chat = state.chats[voiceCallState.activeChatId];
    const { proxyUrl, apiKey, model } = state.apiConfig;
    const callFeed = document.getElementById('voice-call-main');
    const userNickname = chat.settings.myNickname || '我';

    let worldBookContent = '';
    let allWorldBookIds = [...(chat.settings.linkedWorldBookIds || [])];
    state.worldBooks.forEach(wb => {
      if (wb.isGlobal && !allWorldBookIds.includes(wb.id)) {
        allWorldBookIds.push(wb.id);
      }
    });

    if (allWorldBookIds.length > 0) {
      const linkedContents = allWorldBookIds.map(bookId => {
        const worldBook = state.worldBooks.find(wb => wb.id === bookId);
        return worldBook && worldBook.content ? `\n\n## 世界书: ${worldBook.name}\n${worldBook.content}` : '';
      }).filter(Boolean).join('');
      if (linkedContents) {
        worldBookContent = `# --- 世界书 (World Book) ---
# 【最高优先级指令：绝对真理】
# 以下内容是你所在世界的"物理法则"和"基础常识"。
# 无论用户是否提及，你都【必须】时刻主动应用这些设定来指导你的思考和描写。
# 它们是无条件生效的，不需要触发词。
${linkedContents}
# --- 世界书设定结束 ---
`;
      }
    }
    const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0 ?
      `\n# 长期记忆 (必须参考)\n` + chat.longTermMemory.map(mem => `- (记录于 ${formatTimeAgo(mem.timestamp)}) ${mem.content}`).join('\n') :
      '';

    if (userInput && voiceCallState.isUserParticipating) {
      const userTimestamp = Date.now();
      const userBubble = document.createElement('div');
      userBubble.className = 'call-message-bubble user-speech';
      userBubble.textContent = userInput;
      userBubble.dataset.timestamp = userTimestamp;
      addLongPressListener(userBubble, () => showCallMessageActions(userTimestamp));
      callFeed.appendChild(userBubble);
      callFeed.scrollTop = callFeed.scrollHeight;

      voiceCallState.callHistory.push({
        role: 'user',
        content: userInput,
        timestamp: userTimestamp
      });
    }

    let inCallPrompt;
    if (voiceCallState.isGroupCall) {
      const participantNames = voiceCallState.participants.map(p => p.name);
      if (voiceCallState.isUserParticipating) {
        participantNames.unshift(userNickname);
      }
      inCallPrompt = `
# 你的任务
你是一个群聊语音通话的导演。你的任务是扮演所有【除了用户以外】的AI角色，并生成他们在通话中说的话。

# 【核心规则 - 语音通话专用】
1. **【身份铁律】**: 用户的身份是【${userNickname}】。你【绝对不能】生成 \`name\` 字段为 **"${userNickname}"** 的发言。
2. **【纯对话铁律】**: 这是语音通话，不是视频通话。你们只能听到声音，看不到对方。因此：
   - 你的回复【只能包含角色说的话】
   - 【绝对禁止】任何动作描写（如：*笑了笑*、*点头*、*挥手*等）
   - 【绝对禁止】任何表情符号（如：😊、❤️等）
   - 【绝对禁止】任何视觉相关的描述（如：看起来、表情、动作等）
3. **格式**: 你的回复【必须】是一个JSON数组，每个对象代表一个角色的发言，格式为：\`{"name": "角色名", "speech": "大家好啊！"}\`。
4. **角色扮演**: 严格遵守每个角色的设定。

# 当前情景
你们正在一个群语音通话中。你们只能通过声音交流，看不到彼此。
${longTermMemoryContext}
**通话前的聊天摘要**:
${voiceCallState.preCallContext}
**当前参与者**: ${participantNames.join('、 ')}。
**通话刚刚开始...**
${worldBookContent}
现在，请根据【通话前摘要】和下面的【通话实时记录】，继续进行对话。记住：只输出对话内容，不要有任何动作或表情描写。
`;
    } else {
      let openingContext = voiceCallState.initiator === 'user' ?
        `你刚刚接听了用户的语音通话请求。` :
        `用户刚刚接听了你主动发起的语音通话。`;
      inCallPrompt = `
# 你的任务
你现在正在和用户进行语音通话。你扮演 ${chat.name} (${chat.settings.aiPersona})。

# 【核心规则 - 语音通话专用】
1. **【纯对话铁律】**: 这是语音通话，不是视频通话。你们只能听到声音，看不到对方。因此：
   - 你的回复【只能包含你说的话】
   - 【绝对禁止】任何动作描写（如：*笑了笑*、*点头*、*挥手*、*看着你*等）
   - 【绝对禁止】任何表情符号（如：😊、❤️、😂等）
   - 【绝对禁止】任何视觉相关的描述（如：看起来、表情、眼神、动作等）
   - 【绝对禁止】使用星号*或其他符号来描述动作
2. **【角色认知】**: 你知道这是语音通话，你看不到用户，用户也看不到你。你们只能通过声音交流。
3. **【多句发言】**: 你可以一次说多句话，每句话会显示为独立的气泡。格式：
   - 如果只说一句话：直接返回纯文本，如 "喂，你好啊！"
   - 如果要说多句话：返回JSON数组，如 [{"type": "text", "content": "喂，你好啊！"}, {"type": "text", "content": "最近怎么样？"}]
4. **格式灵活性**: 你可以根据情况选择单句（纯文本）或多句（JSON数组）格式。

# 当前情景
你正在和用户（${userNickname}，人设: ${chat.settings.myPersona}）进行语音通话。你们只能通过声音交流，看不到彼此。
${longTermMemoryContext}
**${openingContext}**
**通话前的聊天摘要 (这是你们通话的原因，至关重要！)**:
${voiceCallState.preCallContext}
${worldBookContent}
现在，请根据【通话前摘要】和下面的【通话实时记录】，继续进行对话。记住：只输出对话内容，不要有任何动作、表情或视觉描写。
`;
    }

    const messagesForApi = [{
      role: 'system',
      content: inCallPrompt
    },
    ...voiceCallState.callHistory.map(h => ({
      role: h.role,
      content: h.content
    }))
    ];

    if (voiceCallState.callHistory.length === 0) {
      const firstLineTrigger = voiceCallState.initiator === 'user' ? `喂？` : `喂，你好？`;
      messagesForApi.push({
        role: 'user',
        content: firstLineTrigger
      });
    }

    try {
      let isGemini = proxyUrl === GEMINI_API_URL;
      let geminiConfig = toGeminiRequestData(model, apiKey, inCallPrompt, messagesForApi)
      const response = isGemini ? await fetch(geminiConfig.url, geminiConfig.data) : await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: messagesForApi,
          temperature: state.globalSettings.apiTemperature || 0.8
        })
      });
      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try { const errData = await response.json(); errMsg = errData?.error?.message || errData?.message || errData?.detail || JSON.stringify(errData); } catch(e) { errMsg += ` (${response.statusText})`; }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const aiResponse = isGemini ? data.candidates[0].content.parts[0].text : data.choices[0].message.content;

      const connectingElement = callFeed.querySelector('em');
      if (connectingElement) connectingElement.remove();

      if (voiceCallState.isGroupCall) {
        const speechArray = parseAiResponse(aiResponse);
        speechArray.forEach(turn => {
          if (!turn.name || turn.name === userNickname || !turn.speech) return;
          const aiTimestamp = Date.now() + Math.random();
          const aiBubble = document.createElement('div');
          aiBubble.className = 'call-message-bubble ai-speech';
          aiBubble.innerHTML = `<strong>${turn.name}:</strong> ${turn.speech}`;
          aiBubble.dataset.timestamp = aiTimestamp;
          addLongPressListener(aiBubble, () => showCallMessageActions(aiTimestamp));
          callFeed.appendChild(aiBubble);
          voiceCallState.callHistory.push({
            role: 'assistant',
            content: `${turn.name}: ${turn.speech}`,
            timestamp: aiTimestamp
          });

          const speaker = voiceCallState.participants.find(p => p.name === turn.name);
          if (speaker) {
            const speakingAvatar = document.querySelector(`.participant-avatar-wrapper[data-participant-id="${speaker.id}"] .participant-avatar`);
            if (speakingAvatar) {
              speakingAvatar.classList.add('speaking');
              setTimeout(() => speakingAvatar.classList.remove('speaking'), 2000);
            }
          }
        });
      } else {
        // 单聊模式：支持多条消息
        const enableTts = chat.settings.enableTts !== false;
        const voiceId = chat.settings.minimaxVoiceId;

        // 尝试解析为JSON数组（多条消息）
        const messagesArray = parseAiResponse(aiResponse);

        messagesArray.forEach((msg, index) => {
          const messageContent = msg.content || msg.speech || aiResponse;
          const aiTimestamp = Date.now() + index;

          const aiBubble = document.createElement('div');
          aiBubble.className = 'call-message-bubble ai-speech';
          aiBubble.textContent = messageContent;
          aiBubble.dataset.timestamp = aiTimestamp;
          addLongPressListener(aiBubble, () => showCallMessageActions(aiTimestamp));
          callFeed.appendChild(aiBubble);

          voiceCallState.callHistory.push({
            role: 'assistant',
            content: messageContent,
            timestamp: aiTimestamp
          });

          // 为每条消息播放TTS
          if (enableTts && voiceId) {
            playVideoCallPureTTS(messageContent, voiceId);
          }
        });

        const speakingAvatar = document.querySelector(`.participant-avatar-wrapper[data-participant-id="ai"] .participant-avatar`);
        if (speakingAvatar) {
          speakingAvatar.classList.add('speaking');
          const totalLength = messagesArray.reduce((sum, msg) => sum + (msg.content || msg.speech || aiResponse).length, 0);
          const speakTime = Math.min(totalLength * 200, 5000);
          setTimeout(() => speakingAvatar.classList.remove('speaking'), speakTime);
        }
      }

      callFeed.scrollTop = callFeed.scrollHeight;

    } catch (error) {
      const errorBubble = document.createElement('div');
      errorBubble.className = 'call-message-bubble ai-speech';
      errorBubble.style.color = '#ff8a80';
      errorBubble.textContent = `[ERROR: ${error.message}]`;
      callFeed.appendChild(errorBubble);
      callFeed.scrollTop = callFeed.scrollHeight;
      voiceCallState.callHistory.push({
        role: 'assistant',
        content: `[ERROR: ${error.message}]`
      });
    }
    // ★ 每次发送后修剪历史
    trimCallHistory(voiceCallState);
  }

  // ==================== 语音通话功能结束 ====================





  async function handleUserPat(chatId, characterOriginalName) {
    const chat = state.chats[chatId];
    if (!chat) return;


    let displayNameForUI;
    if (chat.isGroup) {

      displayNameForUI = getDisplayNameInGroup(chat, characterOriginalName);
    } else {

      displayNameForUI = chat.name;
    }

    const phoneScreen = document.getElementById('phone-screen');
    phoneScreen.classList.remove('pat-animation');
    void phoneScreen.offsetWidth;
    phoneScreen.classList.add('pat-animation');


    const suffix = await showCustomPrompt(
      `你拍了拍 "${displayNameForUI}"`,
      "（可选）输入后缀",
      "",
      "text"
    );

    if (suffix === null) return;

    // 获取用户昵称，如果是 {{user}} 则使用 "你"
    let myNickname = state.qzoneSettings.nickname;
    if (!myNickname || myNickname === '{{user}}') {
      myNickname = '你';
    }

    // 如果是群聊，使用群昵称
    if (chat.isGroup) {
      myNickname = chat.settings.myNickname || '你';
    }



    const visibleMessageContent = `${myNickname} 拍了拍 "${displayNameForUI}" ${suffix.trim()}`;
    const visibleMessage = {
      role: 'system',
      type: 'pat_message',
      content: visibleMessageContent,
      timestamp: Date.now()
    };
    chat.history.push(visibleMessage);


    const hiddenMessageContent = `[系统提示：用户（${myNickname}）刚刚拍了拍你（${characterOriginalName}）${suffix.trim()}。请你对此作出回应。]`;
    const hiddenMessage = {
      role: 'system',
      content: hiddenMessageContent,
      timestamp: Date.now() + 1,
      isHidden: true
    };
    chat.history.push(hiddenMessage);

    await db.chats.put(chat);
    if (state.activeChatId === chatId) {
      appendMessage(visibleMessage, chat);
    }
    await renderChatList();
  }

  // 新增：处理用户拍自己的功能
  async function handleUserPatSelf(chatId) {
    const chat = state.chats[chatId];
    if (!chat) return;

    const phoneScreen = document.getElementById('phone-screen');
    phoneScreen.classList.remove('pat-animation');
    void phoneScreen.offsetWidth;
    phoneScreen.classList.add('pat-animation');

    // 获取用户昵称，如果是 {{user}} 则使用 "你"
    let myNickname = state.qzoneSettings.nickname;
    if (!myNickname || myNickname === '{{user}}') {
      myNickname = '你';
    }

    // 如果是群聊，使用群昵称
    if (chat.isGroup) {
      myNickname = chat.settings.myNickname || '你';
    }

    // 弹出输入框让用户输入拍自己的后缀
    const suffix = await showCustomPrompt(
      `${myNickname} 拍了拍自己`,
      "输入拍一拍后缀",
      "",
      "text"
    );

    if (suffix === null) return;

    // 创建可见的拍一拍消息
    const visibleMessageContent = `${myNickname} 拍了拍自己 ${suffix.trim()}`;
    const visibleMessage = {
      role: 'system',
      type: 'pat_message',
      content: visibleMessageContent,
      timestamp: Date.now()
    };
    chat.history.push(visibleMessage);

    // 创建隐藏的系统提示，让AI知道用户拍了自己
    const hiddenMessageContent = `[系统提示：用户（${myNickname}）刚刚拍了拍自己${suffix.trim()}。你可以对此作出回应或评论。]`;
    const hiddenMessage = {
      role: 'system',
      content: hiddenMessageContent,
      timestamp: Date.now() + 1,
      isHidden: true
    };
    chat.history.push(hiddenMessage);

    await db.chats.put(chat);
    if (state.activeChatId === chatId) {
      appendMessage(visibleMessage, chat);
    }
    await renderChatList();
  }

  let activeCallMessageTimestamp = null;
  let isFrameManagementMode = false;
  let selectedFrames = new Set();

  function showCallMessageActions(timestamp) {
    activeCallMessageTimestamp = timestamp;
    document.getElementById('call-message-actions-modal').classList.add('visible');
  }


  function hideCallMessageActions() {
    document.getElementById('call-message-actions-modal').classList.remove('visible');
    activeCallMessageTimestamp = null;
  }


  async function openCallMessageEditor() {
    if (!activeCallMessageTimestamp) return;

    const timestampToEdit = activeCallMessageTimestamp;
    
    // 判断当前是视频通话还是语音通话
    const isVideoCall = videoCallState.isActive || document.getElementById('video-call-screen').classList.contains('active');
    const currentCallState = isVideoCall ? videoCallState : voiceCallState;
    
    const message = currentCallState.callHistory.find(m => m.timestamp === timestampToEdit);
    if (!message) return;

    hideCallMessageActions();

    let contentForEditing = message.content;

    if (currentCallState.isGroupCall && message.role === 'assistant') {
      const parts = message.content.split(': ');
      if (parts.length > 1) {
        contentForEditing = parts.slice(1).join(': ');
      }
    }

    const newContent = await showCustomPrompt(
      '编辑通话消息',
      '在此修改内容...',
      contentForEditing,
      'textarea'
    );

    if (newContent !== null) {
      await saveEditedCallMessage(timestampToEdit, newContent, isVideoCall);
    }
  }


  async function saveEditedCallMessage(timestamp, newContent, isVideoCall = true) {
    const currentCallState = isVideoCall ? videoCallState : voiceCallState;
    const message = currentCallState.callHistory.find(m => m.timestamp === timestamp);
    
    if (message) {
      let finalContent = newContent;

      if (currentCallState.isGroupCall && message.role === 'assistant') {
        const parts = message.content.split(': ');
        const senderName = parts[0];
        finalContent = `${senderName}: ${newContent}`;
      }
      message.content = finalContent;

      const messageBubble = document.querySelector(`.call-message-bubble[data-timestamp="${timestamp}"]`);
      if (messageBubble) {
        if (currentCallState.isGroupCall && message.role === 'assistant') {
          const parts = message.content.split(': ');
          const senderName = parts[0];
          messageBubble.innerHTML = `<strong>${senderName}:</strong> ${newContent}`;
        } else {
          messageBubble.textContent = newContent;
        }
      }
    }
    await showCustomAlert('成功', '通话消息已更新！');
  }


  async function deleteCallMessage() {
    if (!activeCallMessageTimestamp) return;

    const confirmed = await showCustomConfirm('删除消息', '确定要删除这条通话消息吗？', {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      const timestampToDelete = activeCallMessageTimestamp;
      hideCallMessageActions();

      // 判断当前是视频通话还是语音通话
      const isVideoCall = videoCallState.isActive || document.getElementById('video-call-screen').classList.contains('active');
      const currentCallState = isVideoCall ? videoCallState : voiceCallState;

      const messageIndex = currentCallState.callHistory.findIndex(m => m.timestamp === timestampToDelete);
      if (messageIndex > -1) {
        currentCallState.callHistory.splice(messageIndex, 1);
      }

      const messageBubble = document.querySelector(`.call-message-bubble[data-timestamp="${timestampToDelete}"]`);
      if (messageBubble) {
        messageBubble.remove();
      }
    } else {
      hideCallMessageActions();
    }
  }


  // ========== 导出到全局作用域 ==========
  window.videoCallState = videoCallState;
  window.voiceCallState = voiceCallState;
  window.handleInitiateCall = handleInitiateCall;
  window.startVideoCall = startVideoCall;
  window.minimizeVideoCall = minimizeVideoCall;
  window.restoreVideoCall = restoreVideoCall;
  window.endVideoCall = endVideoCall;
  window.updateParticipantAvatars = updateParticipantAvatars;
  window.handleUserJoinCall = handleUserJoinCall;
  window.updateCallTimer = updateCallTimer;
  window.showIncomingCallModal = showIncomingCallModal;
  window.hideIncomingCallModal = hideIncomingCallModal;
  window.triggerAiInCallAction = triggerAiInCallAction;
  window.toggleCallButtons = toggleCallButtons;
  window.handleInitiateVoiceCall = handleInitiateVoiceCall;
  window.startVoiceCall = startVoiceCall;
  window.minimizeVoiceCall = minimizeVoiceCall;
  window.restoreVoiceCall = restoreVoiceCall;
  window.endVoiceCall = endVoiceCall;
  window.updateVoiceParticipantAvatars = updateVoiceParticipantAvatars;
  window.handleUserJoinVoiceCall = handleUserJoinVoiceCall;
  window.updateVoiceCallTimer = updateVoiceCallTimer;
  window.triggerAiInVoiceCallAction = triggerAiInVoiceCallAction;
  window.handleUserPat = handleUserPat;
  window.handleUserPatSelf = handleUserPatSelf;
  window.showCallMessageActions = showCallMessageActions;
  window.hideCallMessageActions = hideCallMessageActions;
  window.openCallMessageEditor = openCallMessageEditor;
  window.saveEditedCallMessage = saveEditedCallMessage;
  window.deleteCallMessage = deleteCallMessage;
  window.isFrameManagementMode = isFrameManagementMode;
  window.selectedFrames = selectedFrames;

})();
