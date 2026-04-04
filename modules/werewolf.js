// ========================================
// 狼人杀功能模块
// 来源: script.js 第 50503 ~ 52375 行
// 包含: openWerewolfLobby, initializeWerewolfGame, renderWerewolfScreen, showMyRole,
//       executeNightPhase, executeDayPhase, startDiscussionPhase, buildWerewolfPrompt,
//       createWerewolfGameSummary, injectSummaryIntoMemories, handleManualWerewolfSummary,
//       endGame, addGameLog, addDialogueLog, openSelectionModal, openWolfKillModal,
//       handleUserWerewolfSpeech, handleAiContinueDiscussion, handleWerewolfWaitReply,
//       startVotingPhase, getAiVotes, handleVotingResults, getAiWolfKillTarget,
//       openWitchActionModal, handleWerewolfRetry, checkGameOver
// ========================================

  // 狼人杀游戏状态（从 script.js 补充）
  let werewolfGameState = {
    isActive: false,
    gameMode: null,
    chatId: null,
    players: [],
    currentDay: 1,
    currentPhase: 'setup',
    nightActions: {},
    gameLog: [],
    discussionLog: [],
    voteResults: {},
    electionInfo: {
      candidates: [],
      votes: {}
    },
    sheriffId: null,
    lastFailedAction: null,
  };

  async function openWerewolfLobby(mode) {
    const modal = document.getElementById('werewolf-lobby-modal');
    const listEl = document.getElementById('werewolf-player-selection-list');
    listEl.innerHTML = '';

    let potentialPlayers = [];

    if (mode === 'global') {
      const characters = Object.values(state.chats).filter(c => !c.isGroup);
      const npcs = await db.npcs.toArray();
      potentialPlayers = [

        {
          id: 'user',
          name: state.qzoneSettings.nickname || '我',
          originalName: state.qzoneSettings.nickname || '我',
          avatar: state.qzoneSettings.avatar,
          type: 'user'
        },

        ...characters.map(c => ({
          id: c.id,
          name: c.name,
          originalName: c.originalName,
          avatar: c.settings.aiAvatar,
          type: 'character'
        })),

        ...npcs.map(n => ({
          id: `npc_${n.id}`,
          name: n.name,
          originalName: n.name,
          avatar: n.avatar,
          type: 'npc'
        }))
      ];
      werewolfGameState.chatId = null;
    } else {
      const chat = state.chats[state.activeChatId];
      if (!chat || !chat.isGroup) return;

      potentialPlayers = [

        {
          id: 'user',
          name: chat.settings.myNickname || '我',
          originalName: state.qzoneSettings.nickname || '我',
          avatar: chat.settings.myAvatar,
          type: 'user'
        },

        ...chat.members.map(m => {
          const char = state.chats[m.id];
          const memberAvatar = m.avatar || (char ? char.settings.aiAvatar : defaultGroupMemberAvatar);
          return {
            id: m.id,
            name: m.groupNickname,
            originalName: m.originalName,
            avatar: memberAvatar,
            type: m.isNpc ? 'npc' : 'character'
          };
        })
      ];
      werewolfGameState.chatId = state.activeChatId;
    }

    potentialPlayers.forEach(player => {
      const item = document.createElement('div');
      item.className = 'contact-picker-item';
      item.innerHTML = `
            <input type="checkbox" class="werewolf-player-checkbox" data-player-json='${JSON.stringify(player)}' ${player.type === 'user' ? 'checked disabled' : 'checked'}>
            <img src="${player.avatar}" class="avatar">
            <span class="name">${player.name}</span>
        `;
      listEl.appendChild(item);
    });

    modal.classList.add('visible');
  }


  async function initializeWerewolfGame() {
    const selectedCheckboxes = document.querySelectorAll('.werewolf-player-checkbox:checked');
    const playerCount = selectedCheckboxes.length;

    let roles = [];
    if (playerCount === 6) {
      werewolfGameState.gameMode = '6p';
      roles = ['狼人', '狼人', '平民', '平民', '预言家', '猎人'];
    } else if (playerCount === 9) {
      werewolfGameState.gameMode = '9p';
      roles = ['狼人', '狼人', '狼人', '平民', '平民', '平民', '预言家', '女巫', '猎人'];
    } else if (playerCount === 12) {
      werewolfGameState.gameMode = '12p';
      roles = ['狼人', '狼人', '狼人', '狼人', '平民', '平民', '平民', '平民', '预言家', '女巫', '猎人', '守卫'];
    } else {
      alert(`当前人数 ${playerCount} 不支持。请选择6、9或12人。`);
      return;
    }

    document.getElementById('werewolf-lobby-modal').classList.remove('visible');
    await showCustomAlert('正在发牌...', '游戏即将开始，正在为各位玩家分配身份...');

    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    const selectedPlayers = Array.from(selectedCheckboxes).map(cb => JSON.parse(cb.dataset.playerJson));
    werewolfGameState.players = [];

    for (let i = 0; i < selectedPlayers.length; i++) {
      const playerInfo = selectedPlayers[i];
      const role = roles[i];

      let character_persona = "一个普通玩家";
      if (playerInfo.type === 'character') {
        const char = state.chats[playerInfo.id];
        character_persona = char ? char.settings.aiPersona : '未知设定的角色';
      } else if (playerInfo.type === 'npc') {
        const npcs = await db.npcs.toArray();
        const npc = npcs.find(n => `npc_${n.id}` === playerInfo.id);
        character_persona = npc ? npc.persona : '未知设定的NPC';
      } else if (playerInfo.type === 'user') {
        const activeChat = werewolfGameState.chatId ? state.chats[werewolfGameState.chatId] : null;
        character_persona = activeChat ? activeChat.settings.myPersona : '我是谁呀。';
      }

      const playerObject = {
        ...playerInfo,
        role: role,
        isAlive: true,
        character_persona: character_persona
      };


      if (role === '女巫') {
        playerObject.antidoteUsed = false;
        playerObject.poisonUsed = false;
      }
      if (role === '守卫') {
        playerObject.lastGuardedId = null;
      }


      werewolfGameState.players.push(playerObject);
    }

    werewolfGameState.isActive = true;
    werewolfGameState.currentDay = 1;
    werewolfGameState.currentPhase = 'start';
    werewolfGameState.gameLog = [];
    werewolfGameState.discussionLog = [];

    const roleCounts = roles.reduce((acc, role) => {
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});
    const roleSummary = Object.entries(roleCounts).map(([role, count]) => `${role} x${count}`).join('、');
    addGameLog(`游戏配置：${playerCount}人局，身份为 ${roleSummary}。`);

    const myPlayer = werewolfGameState.players.find(p => p.id === 'user');

    renderWerewolfScreen();
    showScreen('werewolf-game-screen');

    showMyRole(myPlayer.role);
  }



  function renderWerewolfScreen() {
    const gridEl = document.getElementById('werewolf-player-grid');
    gridEl.innerHTML = '';
    const sortedPlayers = [...werewolfGameState.players].sort((a, b) => a.isAlive - b.isAlive);

    sortedPlayers.forEach((p, index) => {
      const playerIndex = werewolfGameState.players.findIndex(player => player.id === p.id) + 1;
      const avatarEl = document.createElement('div');
      avatarEl.className = 'werewolf-player-avatar';
      if (!p.isAlive) avatarEl.classList.add('dead');
      avatarEl.innerHTML = `
            <img src="${p.avatar}">
            <span class="player-name">${playerIndex}. ${p.name}</span>
        `;
      gridEl.appendChild(avatarEl);
    });

    const logEl = document.getElementById('werewolf-log');
    logEl.innerHTML = '';


    for (let day = 1; day <= werewolfGameState.currentDay; day++) {

      const logsThisDay = [
        ...werewolfGameState.gameLog.filter(entry => entry.day === day),
        ...werewolfGameState.discussionLog.filter(entry => entry.day === day)
      ].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));


      if (logsThisDay.length > 0) {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'werewolf-log-entry system';
        dayHeader.textContent = `--- 第 ${day} 天 ---`;
        dayHeader.style.cssText = 'font-weight: bold; background: rgba(255, 193, 7, 0.2);';
        logEl.appendChild(dayHeader);


        logsThisDay.forEach(entry => {
          const entryEl = document.createElement('div');
          entryEl.className = `werewolf-log-entry ${entry.type}`;
          if (entry.type === 'dialogue') {
            entryEl.innerHTML = `<span class="speaker">${entry.speaker}:</span> ${entry.content}`;
          } else {
            entryEl.textContent = entry.content;
          }
          logEl.appendChild(entryEl);
        });
      }
    }


    logEl.scrollTop = logEl.scrollHeight;


    const phaseMap = {
      'start': '游戏开始',
      'night': `第${werewolfGameState.currentDay}天 - 夜晚`,
      'day': `第${werewolfGameState.currentDay}天 - 白天`,
      'discussion': `第${werewolfGameState.currentDay}天 - 讨论`,
      'voting': `第${werewolfGameState.currentDay}天 - 投票`,
      'gameover': '游戏结束'
    };
    document.getElementById('werewolf-game-title').textContent = `狼人杀 - ${phaseMap[werewolfGameState.currentPhase] || werewolfGameState.currentPhase}`;
  }



  function showMyRole(role) {
    const roleDescriptions = {
      '狼人': '你的目标是杀死所有好人。每晚可以和同伴一起刀一个玩家。',
      '平民': '你没有任何特殊能力，你的目标是通过投票放逐所有狼人。',
      '预言家': '每晚可以查验一个玩家的身份是好人还是狼人。',
      '猎人': '当你死亡时，你可以选择带走场上任意一名玩家。',
      '女巫': '你有一瓶解药和一瓶毒药，解药可以救活当晚被杀的玩家，毒药可以毒死任意一名玩家。',
      '守卫': '每晚可以守护一名玩家，使其免受狼人袭击。不能连续两晚守护同一个人。'
    };

    document.getElementById('werewolf-role-name').textContent = role;
    document.getElementById('werewolf-role-description').textContent = roleDescriptions[role] || '一个神秘的角色。';
    document.getElementById('werewolf-role-modal').classList.add('visible');
  }


  async function executeNightPhase() {
    werewolfGameState.currentPhase = `第${werewolfGameState.currentDay}天 - 夜晚`;
    werewolfGameState.nightActions = {};
    addGameLog('天黑请闭眼...');
    renderWerewolfScreen();

    document.getElementById('werewolf-action-bar').style.display = 'none';
    document.getElementById('werewolf-retry-btn').style.display = 'none';
    await new Promise(resolve => setTimeout(resolve, 1500));


    const guard = werewolfGameState.players.find(p => p.role === '守卫' && p.isAlive);
    if (guard) {
      addGameLog('守卫请睁眼，请选择要守护的玩家。');
      renderWerewolfScreen();
      let guardedId = null;
      if (guard.id === 'user') {
        guardedId = await openSelectionModal('guard', guard.lastGuardedId);
      } else {
        const potentialTargets = werewolfGameState.players.filter(p => p.isAlive && p.id !== guard.lastGuardedId);
        if (potentialTargets.length > 0) {
          guardedId = potentialTargets[Math.floor(Math.random() * potentialTargets.length)].id;
        }
      }
      if (guardedId) {
        werewolfGameState.nightActions.guardedId = guardedId;
        guard.lastGuardedId = guardedId;
      }
      addGameLog('守卫已行动，守卫请闭眼。');
      renderWerewolfScreen();
      await new Promise(resolve => setTimeout(resolve, 1500));
    }



    addGameLog('狼人请睁眼，请选择要刀的玩家。');
    renderWerewolfScreen();

    const wolves = werewolfGameState.players.filter(p => p.role === '狼人' && p.isAlive);
    const userIsWolf = wolves.some(p => p.id === 'user');

    let wolfTargetId = null;


    werewolfGameState.lastFailedAction = 'wolfKill';
    try {
      if (userIsWolf) {
        addGameLog('你是狼人，请选择刀人目标。');
        renderWerewolfScreen();
        wolfTargetId = await openWolfKillModal();
      } else {

        if (werewolfGameState.currentDay === 1) {
          console.log("第一夜，执行本地随机刀人逻辑...");
          const potentialTargets = werewolfGameState.players.filter(p => p.isAlive && p.role !== '狼人');
          if (potentialTargets.length > 0) {
            wolfTargetId = potentialTargets[Math.floor(Math.random() * potentialTargets.length)].id;
          }
        } else {

          wolfTargetId = await getAiWolfKillTarget();
        }
      }

      werewolfGameState.lastFailedAction = null;
    } catch (error) {
      console.error("狼人行动API失败:", error);
      await showCustomAlert("操作失败", `AI狼人团队无法决定目标，游戏暂停。请点击右上角的"重试"按钮继续。`);
      document.getElementById('werewolf-retry-btn').style.display = 'block';
      return;
    }

    werewolfGameState.nightActions.killedId = wolfTargetId;
    addGameLog('狼人已行动，狼人请闭眼。');
    renderWerewolfScreen();
    await new Promise(resolve => setTimeout(resolve, 1500));


    const witch = werewolfGameState.players.find(p => p.role === '女巫' && p.isAlive);
    if (witch) {
      addGameLog('女巫请睁眼。');
      renderWerewolfScreen();
      const killedPlayer = werewolfGameState.players.find(p => p.id === werewolfGameState.nightActions.killedId);


      const isGuarded = werewolfGameState.nightActions.guardedId === werewolfGameState.nightActions.killedId;


      const playerToShowWitch = (isGuarded || !killedPlayer) ? null : killedPlayer;

      if (witch.id === 'user') {
        let userWitchAction = await openWitchActionModal(playerToShowWitch, witch);
        if (userWitchAction.save) {
          werewolfGameState.nightActions.savedId = werewolfGameState.nightActions.killedId;
          witch.antidoteUsed = true;
        }
        if (userWitchAction.poison) {
          werewolfGameState.nightActions.poisonedId = userWitchAction.poison;
          witch.poisonUsed = true;
        }
      } else {

        if (!witch.antidoteUsed && playerToShowWitch) {
          let saveChance = 0;
          if (werewolfGameState.currentDay === 1) {

            saveChance = 0.3;
          } else {

            saveChance = 0.8;
          }

          console.log(`AI女巫决策：今天是第${werewolfGameState.currentDay}天，救人概率为 ${saveChance * 100}%`);

          if (Math.random() < saveChance) {
            console.log("AI女巫决定使用解药！");
            werewolfGameState.nightActions.savedId = werewolfGameState.nightActions.killedId;
            witch.antidoteUsed = true;
          } else {
            console.log("AI女巫决定保留解药。");
          }
        }


        if (!werewolfGameState.nightActions.savedId && !witch.poisonUsed && Math.random() < 0.5) {
          const poisonTargets = werewolfGameState.players.filter(p => p.isAlive && p.id !== werewolfGameState.nightActions.killedId);
          if (poisonTargets.length > 0) {
            const target = poisonTargets[Math.floor(Math.random() * poisonTargets.length)];
            werewolfGameState.nightActions.poisonedId = target.id;
            witch.poisonUsed = true;
            console.log(`AI女巫决定使用毒药，目标是: ${target.name}`);
          }
        }

      }
      addGameLog('女巫已行动，女巫请闭眼。');
      renderWerewolfScreen();
      await new Promise(resolve => setTimeout(resolve, 1500));
    }


    const prophet = werewolfGameState.players.find(p => p.role === '预言家' && p.isAlive);
    if (prophet) {
      addGameLog('预言家请睁眼，请选择要查验的玩家。');
      renderWerewolfScreen();

      if (prophet.id === 'user') {
        const targetId = await openSelectionModal('prophet');
        const targetPlayer = werewolfGameState.players.find(p => p.id === targetId);
        if (targetPlayer) {
          const isWolf = targetPlayer.role === '狼人';
          await showCustomAlert('查验结果', `你查验的玩家 ${targetPlayer.name} 的身份是：${isWolf ? '狼人' : '好人'}`);
          werewolfGameState.nightActions.prophetCheck = {
            target: targetId,
            result: isWolf ? '狼人' : '好人'
          };
        }
      } else {
        const potentialTargets = werewolfGameState.players.filter(p => p.isAlive && p.id !== prophet.id);
        if (potentialTargets.length > 0) {
          const target = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
          werewolfGameState.nightActions.prophetCheck = {
            target: target.id,
            result: target.role === '狼人' ? '狼人' : '好人'
          };
        }
      }
      addGameLog('预言家已行动，预言家请闭眼。');
      renderWerewolfScreen();
      await new Promise(resolve => setTimeout(resolve, 1500));
    }


    executeDayPhase();
  }


  async function executeDayPhase() {
    werewolfGameState.currentPhase = `第${werewolfGameState.currentDay}天 - 白天`;
    werewolfGameState.voteResults = {};
    addGameLog('天亮了。');

    const {
      killedId,
      guardedId,
      savedId,
      poisonedId
    } = werewolfGameState.nightActions;
    const deathsThisNight = new Set();


    if (killedId && killedId !== guardedId && killedId !== savedId) {
      deathsThisNight.add(killedId);
    }


    if (poisonedId) {

      deathsThisNight.add(poisonedId);
    }


    if (deathsThisNight.size === 0) {
      addGameLog('昨晚是平安夜。');
    } else {
      for (const deadPlayerId of deathsThisNight) {
        const deadPlayer = werewolfGameState.players.find(p => p.id === deadPlayerId);
        if (deadPlayer && deadPlayer.isAlive) {
          deadPlayer.isAlive = false;
          addGameLog(`昨晚 ${deadPlayer.name} 死亡了。`);


          if (deadPlayer.role === '猎人') {
            addGameLog('猎人死亡，请选择一名玩家带走！');
            renderWerewolfScreen();
            let hunterTargetId = null;
            if (deadPlayer.id === 'user') {
              hunterTargetId = await openSelectionModal('hunter');
            } else {
              const potentialTargets = werewolfGameState.players.filter(p => p.isAlive && p.id !== deadPlayer.id);
              if (potentialTargets.length > 0) {
                hunterTargetId = potentialTargets[Math.floor(Math.random() * potentialTargets.length)].id;
              }
            }
            const targetPlayer = werewolfGameState.players.find(p => p.id === hunterTargetId);
            if (targetPlayer) {
              targetPlayer.isAlive = false;
              addGameLog(`猎人带走了 ${targetPlayer.name}。`);
            }
          }
        }
      }
    }

    renderWerewolfScreen();

    if (checkGameOver()) return;

    await startDiscussionPhase();
  }



  async function startDiscussionPhase() {



    addGameLog('现在开始讨论，请各位玩家依次发言。');
    renderWerewolfScreen();

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('API未配置，无法生成对话。');
      return;
    }

    const systemPrompt = buildWerewolfPrompt();
    werewolfGameState.lastFailedAction = 'startDiscussion';
    try {
      await showCustomAlert("请稍候", "正在等待AI角色们进行激烈的讨论...");

      let isGemini = proxyUrl.includes('generativelanguage');
      let messagesForApi = [{
        role: 'user',
        content: '请所有AI角色根据你们的身份和人设开始发言。'
      }];
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);

      const response = isGemini ?
        await fetch(geminiConfig.url, geminiConfig.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{
              role: 'system',
              content: systemPrompt
            }, ...messagesForApi],
            temperature: state.globalSettings.apiTemperature || 0.95,
          })
        });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API 错误: ${errorData.error.message}`);
      }

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch) {
        throw new Error(`AI返回的讨论内容格式不正确。原始返回: ${aiResponseContent}`);
      }
      const dialogues = JSON.parse(jsonMatch[0]);

      for (const dialogue of dialogues) {
        if (dialogue.speaker_name && dialogue.dialogue) {
          addDialogueLog(dialogue.speaker_name, dialogue.dialogue);
          renderWerewolfScreen();
          await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2000));
        }
      }

      werewolfGameState.lastFailedAction = null;

    } catch (error) {
      console.error("狼人杀AI讨论生成失败:", error);
      await showCustomAlert("AI 发言失败", `讨论无法开始，游戏暂停。请点击右上角的"重试"按钮继续。\n错误: ${error.message}`);
      document.getElementById('werewolf-retry-btn').style.display = 'block';
      return;
    }

    const myPlayer = werewolfGameState.players.find(p => p.id === 'user');
    const actionBar = document.getElementById('werewolf-action-bar');
    const waitReplyBtn = document.getElementById('werewolf-wait-reply-btn');
    const finishSpeechBtn = document.getElementById('werewolf-finish-speech-btn');
    const userInput = document.getElementById('werewolf-user-input');

    actionBar.style.display = 'flex';

    if (myPlayer && myPlayer.isAlive) {
      waitReplyBtn.textContent = '等待回应';
      finishSpeechBtn.textContent = '结束发言';
      waitReplyBtn.style.display = 'block';
      finishSpeechBtn.style.display = 'block';
      userInput.disabled = false;
      userInput.placeholder = "轮到你发言了...";
      userInput.focus();

      const newWaitBtn = waitReplyBtn.cloneNode(true);
      waitReplyBtn.parentNode.replaceChild(newWaitBtn, waitReplyBtn);
      newWaitBtn.addEventListener('click', handleWerewolfWaitReply);

      const newFinishBtn = finishSpeechBtn.cloneNode(true);
      finishSpeechBtn.parentNode.replaceChild(newFinishBtn, finishSpeechBtn);
      newFinishBtn.addEventListener('click', handleUserWerewolfSpeech);

    } else {
      addGameLog('你已经死亡，无法发言。请等待其他玩家发言结束。');
      renderWerewolfScreen();

      waitReplyBtn.textContent = '继续讨论';
      finishSpeechBtn.textContent = '进入投票';
      waitReplyBtn.style.display = 'block';
      finishSpeechBtn.style.display = 'block';
      userInput.disabled = true;
      userInput.placeholder = "你已死亡，正在围观...";

      const newWaitBtn = waitReplyBtn.cloneNode(true);
      waitReplyBtn.parentNode.replaceChild(newWaitBtn, waitReplyBtn);
      newWaitBtn.addEventListener('click', handleAiContinueDiscussion);

      const newFinishBtn = finishSpeechBtn.cloneNode(true);
      finishSpeechBtn.parentNode.replaceChild(newFinishBtn, finishSpeechBtn);
      newFinishBtn.addEventListener('click', startVotingPhase);
    }
  }



  function buildWerewolfPrompt() {
    const alivePlayers = werewolfGameState.players.filter(p => p.isAlive);
    const myPlayerObject = werewolfGameState.players.find(p => p.id === 'user');
    const myPlayerName = myPlayerObject ? myPlayerObject.name : '用户';
    const isUserAlive = alivePlayers.some(p => p.id === 'user');


    let charactersAndPlayersDossier = "# 角色与玩家档案 (Character & Player Dossiers)\n";
    charactersAndPlayersDossier += "这是所有在场玩家的公开信息、人设和社交背景。\n";

    alivePlayers.forEach((p, i) => {
      const playerIndex = werewolfGameState.players.findIndex(player => player.id === p.id) + 1;

      let socialContext = '';
      const playerChat = state.chats[p.id];

      if (playerChat) {
        const friendsInGame = alivePlayers.filter(otherPlayer =>
          otherPlayer.id !== p.id &&
          state.chats[otherPlayer.id] &&
          state.chats[otherPlayer.id].groupId === playerChat.groupId &&
          playerChat.groupId !== null
        ).map(friend => friend.name).join('、');

        if (friendsInGame) {
          socialContext += `- **你的好友 (必须保护)**: 你和 ${friendsInGame} 是同一个分组的好友。\n`;
        }
      }
      if (p.id !== 'user') {
        socialContext += `- **与用户的关系**: 你和用户(${myPlayerName})的关系请参考你的人设、长期记忆和最近的对话。\n`;
      }

      charactersAndPlayersDossier += `
## ${playerIndex}号玩家: ${p.name} (这是TA的昵称)
- **本名 (你在对话中必须用这个名字称呼TA)**: ${p.originalName}
- **身份**: ${p.id === 'user' ? '【用户 (User)】' : '【AI角色】'}
- **人设 (必须严格遵守)**: ${p.character_persona}
`;

      if (p.type === 'character') {
        const char = state.chats[p.id];
        if (char && char.longTermMemory && char.longTermMemory.length > 0) {
          const memoryContent = char.longTermMemory.map(mem => mem.content).join('; ');
          charactersAndPlayersDossier += `- **长期记忆 (必须参考)**: ${memoryContent}\n`;
        }
      }
      if (socialContext) {
        charactersAndPlayersDossier += `
- **你的社交关系 (必须参考)**:
${socialContext}`;
      }
    });


    let nightEventSummary = "# 昨晚事件总结 (Night Event Summary)\n";
    nightEventSummary += "这是所有玩家都能听到的【公开信息】。\n";
    const deathsThisNight = werewolfGameState.gameLog.filter(entry => entry.content.includes('死亡了') && entry.day === werewolfGameState.currentDay);
    if (deathsThisNight.length === 0) {
      nightEventSummary += "- 昨晚是平安夜，无人死亡。\n";
    } else {
      deathsThisNight.forEach(death => {
        nightEventSummary += `- ${death.content}\n`;
      });
    }


    let previousDaysSummary = "# 前几日完整历史回顾 (Full Recap of Previous Days)\n";
    if (werewolfGameState.currentDay > 1) {
      for (let day = 1; day < werewolfGameState.currentDay; day++) {
        previousDaysSummary += `\n**--- 第 ${day} 天 ---**\n`;
        const eventsThisDay = werewolfGameState.gameLog.filter(entry => entry.day === day && (entry.content.includes('死亡') || entry.content.includes('放逐')));
        if (eventsThisDay.length > 0) {
          previousDaysSummary += `*事件*: ${eventsThisDay.map(e => e.content).join(' ')}\n`;
        } else {
          previousDaysSummary += "*事件*: 平安夜，无人出局。\n";
        }
        const discussionsThisDay = werewolfGameState.discussionLog.filter(entry => entry.day === day);
        if (discussionsThisDay.length > 0) {
          previousDaysSummary += `*讨论记录*:\n${discussionsThisDay.map(d => `- ${d.speaker}: ${d.content}`).join('\n')}\n`;
        }
      }
    } else {
      previousDaysSummary += "(今天是第一天，没有历史记录)\n";
    }


    let discussionHistoryContext = "# 今日完整讨论记录 (Today's Full Discussion Record)\n";
    const todayDiscussions = werewolfGameState.discussionLog.filter(entry => entry.day === werewolfGameState.currentDay);
    if (todayDiscussions.length > 0) {
      discussionHistoryContext += todayDiscussions.map(d => `- **${d.speaker}**: ${d.content}`).join('\n');
    } else {
      discussionHistoryContext += "(你是第一个发言的人)";
    }


    let internalMonologueBuilder = `
# 【逻辑隔离与TGS三核思考 (最高优先级指令)】
为了兼顾游戏逻辑和角色扮演，你【必须】在内部为【每一个AI角色】按顺序执行以下"三阶段思考"：

## 阶段1：内部独立思考 (Internal Monologue Scratchpad)
(这部分内容【绝对不能】出现在你最终的JSON输出中，这仅供你内部模拟使用)
`;


    alivePlayers.forEach(p => {
      if (p.id !== 'user') { // 只为AI角色生成思考模块
        const playerIndex = werewolfGameState.players.findIndex(player => player.id === p.id) + 1;
        internalMonologueBuilder += `
### 正在模拟 ${playerIndex}号玩家: ${p.name} (本名: ${p.originalName})

#### 阶段 A：数据输入 (Data Input)
1.  **我的秘密身份**: 我是【${p.role}】。
2.  **我掌握的秘密信息 (仅我可见)**:
`;

        // 1. 注入秘密
        let playerSecrets = "";
        if (p.role === '狼人') {
          const teammates = werewolfGameState.players.filter(t => t.role === '狼人' && t.id !== p.id && t.isAlive).map(t => t.name).join('、');
          playerSecrets += `    - 我的狼队友是：${teammates || '无'}\n`;
          const killedPlayer = werewolfGameState.players.find(pl => pl.id === werewolfGameState.nightActions.killedId);
          playerSecrets += `    - 我们昨晚攻击了：${killedPlayer ? killedPlayer.name : '空刀'}\n`;
        }
        if (p.role === '预言家' && werewolfGameState.nightActions.prophetCheck) {
          const checkedPlayer = werewolfGameState.players.find(pl => pl.id === werewolfGameState.nightActions.prophetCheck.target);
          playerSecrets += `    - 我昨晚查验了 ${checkedPlayer.name}，TA的身份是：【${werewolfGameState.nightActions.prophetCheck.result}】\n`;
        }
        if (p.role === '女巫') {
          if (werewolfGameState.nightActions.savedId) {
            const savedPlayer = werewolfGameState.players.find(pl => pl.id === werewolfGameState.nightActions.savedId);
            playerSecrets += `    - 我昨晚用解药救了 ${savedPlayer.name}。\n`;
          }
          if (werewolfGameState.nightActions.poisonedId) {
            const poisonedPlayer = werewolfGameState.players.find(pl => pl.id === werewolfGameState.nightActions.poisonedId);
            playerSecrets += `    - 我昨晚用毒药毒了 ${poisonedPlayer.name}。\n`;
          }
          playerSecrets += `    - 我的解药：${p.antidoteUsed ? '已使用' : '未使用'}\n`;
          playerSecrets += `    - 我的毒药：${p.poisonUsed ? '已使用' : '未使用'}\n`;
        }
        if (p.role === '守卫') {
          if (werewolfGameState.nightActions.guardedId) {
            const guardedPlayer = werewolfGameState.players.find(pl => pl.id === werewolfGameState.nightActions.guardedId);
            playerSecrets += `    - 我昨晚守护了 ${guardedPlayer.name}。\n`;
          } else {
            playerSecrets += `    - 我昨晚空守了。\n`;
          }
        }
        if (playerSecrets === "") {
          playerSecrets = "    - 我没有掌握任何特殊的夜晚信息。\n";
        }
        internalMonologueBuilder += playerSecrets;

        // 2. 注入公开信息
        internalMonologueBuilder += `3.  **我看到的公开信息 (所有人可见)**:
    - **昨晚事件**: ${nightEventSummary.replace(/\n/g, ' ')}
    - **今日讨论**: ${discussionHistoryContext.replace(/\n/g, ' ')}
4.  **我的人设与社交关系**:
    - **人设**: ${p.character_persona}
    - **社交**: 
`;
        // 3. 注入社交关系
        let socialContext = "";
        const playerChat = state.chats[p.id];
        if (playerChat) {
          const friendsInGame = alivePlayers.filter(otherPlayer =>
            otherPlayer.id !== p.id && state.chats[otherPlayer.id] &&
            state.chats[otherPlayer.id].groupId === playerChat.groupId && playerChat.groupId !== null
          ).map(friend => friend.name).join('、');
          if (friendsInGame) {
            socialContext += `      - ${friendsInGame} 是我的好友。\n`;
          }
        }
        if (p.id !== 'user') {
          socialContext += `      - ${myPlayerName} 是我的重要互动对象（用户）。\n`;
        }
        if (socialContext === "") {
          socialContext = "      - 我在此次游戏中没有特别的社交关系。\n";
        }
        internalMonologueBuilder += socialContext;


        internalMonologueBuilder += `
#### 阶段 B：TGS 融合思考 (Task-Game-Social)
1.  **T (Task - 游戏任务)**: 基于我的身份和秘密，我的【逻辑目标】是 (例如：找出狼人 / 悍跳预言家 / 隐藏身份 / 保护队友 / 攻击${myPlayerName})。
2.  **G (Game - 游戏互动)**: 针对【今日讨论】中 ${todayDiscussions.length > 0 ? '其他人的发言' : '昨晚的死讯'}，我的看法是... 我【必须】回应...
3.  **S (Social - 社交表演)**: 我要如何用我的【人设】和【社交关系】来包装我的发言？
    - (例如：我的好友 ${myPlayerName} 被怀疑了，虽然我的逻辑也怀疑TA，但我的表演必须是维护TA的："我不觉得${myPlayerName}是狼...")
    - (例如：我的敌人发言了，我的表演就是无视TA的逻辑，直接攻击TA。)
    - (例如：我是一个${p.role}，我的人设很${p.character_persona.substring(0, 20)}...，所以我决定这样说...)

#### 阶段 C：最终发言稿 (草稿)
(结合T, G, S的思考，我准备这样说：...)
---
`;
      }
    });

    internalMonologueBuilder += `
## 阶段2：生成最终对话 (Final JSON Output)
你现在已经为【所有AI角色】都完成了"TGS三核"独立思考。
请根据你在"阶段C：最终发言稿"中为每个角色准备好的草稿，生成最终的、符合格式的JSON数组。
`;



    const prompt = `
# 你的任务
你是一个狼人杀游戏模拟器 (Game Simulator)。你的任务是【并行模拟】${isUserAlive ? `用户(${myPlayerName})` : `已死亡的用户(${myPlayerName})`}以外的所有AI角色，并根据他们的【角色人设】和【狼人杀身份】，生成一整轮符合逻辑、充满博弈的发言。

# 身份与人设铁律 (最高优先级)
你【必须】为每一个角色都仔细阅读并严格遵守下面的档案。这是你所有行为和发言的唯一依据。在对话中，请务必注意角色人设中暗示的性别，并使用正确的称呼（例如"他"或"她"）。

${charactersAndPlayersDossier}

# 游戏规则
- ${werewolfGameState.gameMode === '12p' ? '屠边局：狼人杀死所有神职或所有平民即获胜。' : '屠城局：狼人杀死所有好人即获胜。'}
- 好人胜利：放逐所有狼人。

# 当前游戏状态
- 今天是第 ${werewolfGameState.currentDay} 天的讨论环节。
${nightEventSummary} 
- 存活玩家: ${alivePlayers.map(p => `${p.name} (${p.id === 'user' ? '用户' : 'AI'})`).join(', ')}

# 【【【角色策略指南 (至关重要！)】】】
你【不是】一个单纯的游戏玩家，你是一个【有感情、有记忆、有社交关系】的角色。你在游戏中的所有发言和行为，都【必须】首先符合你的人设以及你与其他玩家的既有关系。
- **朋友**: 如果你和某个玩家是朋友，你应该在发言时倾向于保护TA，为TA的发言寻找合理解释，除非有确凿的证据。
- **敌人/情敌**: 如果你和某个玩家有矛盾，你可以借机在游戏中攻击TA，质疑TA的发言，甚至在你是狼人时优先刀掉TA。
- **恋人/暗恋对象**: 你会无条件地信任TA，保护TA，甚至愿意为TA牺牲。
你的社交关系比游戏本身的胜负更重要！
你的发言【必须】体现出高水平的、类似真人的策略博弈，而不是简单地陈述事实。

### **神职角色 (预言家, 女巫, 猎人, 守卫) 策略**
1.  **【隐藏优先！】**: 你的首要任务是活下去。**绝对不要**在第一天就轻易暴露自己的神职身份！这会让你立刻成为狼人的目标。
2.  **【暗示而非明示】**: 你应该用更委婉、更聪明的语言来传递信息，而不是直接说"我是预言家，我查了A"。
    * **预言家可以说**: "我对X玩家的身份有一些看法，我觉得他发言很阳光。" 或 "Y玩家的发言让我感到很不舒服，我把他列为重点怀疑对象。"
    * **女巫可以说**: "昨晚的信息很有趣，场上局势可能和大家想的不一样。"
3.  **【何时起跳？】**: 只有在以下【危急情况】下，你才应该考虑暴露自己的身份（俗称"起跳"）：
    * **被投票时**: 当你即将被投票放逐时，必须起跳自证身份来求生。
    * **关键信息**: 当你掌握了可以决定胜负的信息时（例如预言家查到了最后一个狼人）。
    * **有人悍跳**: 当有狼人假扮你的身份时，你必须站出来与他对峙，争夺好人的信任。

### **狼人角色策略**
1.  **【积极伪装】**: 你需要扮演一个好人，最好是伪装成某个神职（俗称"悍跳"），来扰乱好人的判断，骗取他们的信任。
2.  **【制造混乱】**: 你的发言应该引导好人去怀疑其他无辜的好人。可以故意曲解别人的发言，或者制造逻辑陷阱。
3.  **【团队合作】**: 如果你的狼队友被怀疑，你应该想办法为他辩护，或者通过攻击其他玩家来转移焦点。

### **平民角色策略**
1.  **【逻辑为王】**: 你是场上的"法官"。你的核心任务是仔细倾听每个人的发言，找出其中的逻辑漏洞和矛盾之处。
2.  **【积极分析】**: 不要只是说"我不知道，我过了"。你应该大胆说出你的怀疑，并解释你的理由。例如："A玩家说B是狼人，但是他的理由很牵强，所以我更怀疑A。"
3.  **【跟票与站边】**: 在你相信某位神职玩家后，你应该坚定地支持他，并号召其他好人一起投票给神职指认的狼人。

# 其他核心指令 (必须遵守)
1.  **互动铁律**: 角色之间【必须】互相质疑、支持、分析【本轮已有发言】。你【绝对不能】无视 ${myPlayerName} (用户) 或其他AI的发言，必须对他们的观点和逻辑做出回应。
2.  **记忆力与连贯性**: 你的新发言【必须】是基于**过去几天和今天发生的所有事件和讨论**的逻辑延续。
3.  **格式铁律**: 你的回复【必须且只能】是一个JSON数组，格式为: \`{"speaker_name": "角色的【昵称】", "dialogue": "发言内容"}\`。**必须**为每一个存活的AI角色都生成一段发言。
4.  **称呼铁律**: 你的发言中【绝对禁止】提及任何玩家的编号。在对话中互相称呼时，你【必须】使用玩家的【本名】，而不是他们的昵称。

# ${previousDaysSummary}

# ${discussionHistoryContext}

${internalMonologueBuilder}

现在，请严格按照"阶段2"的指令，为所有【存活的AI角色】生成他们充满策略和博弈的发言JSON数组。`;

    return prompt;
  }


  function createWerewolfGameSummary(gameState) {
    let summary = `--- 狼人杀对局完整复盘 ---\n\n`;
    const winner = gameState.gameLog.find(log => log.content.includes('胜利'))?.content || '胜负未分';
    summary += `### 最终结果: ${winner}\n\n`;

    summary += "### 玩家身份配置:\n";


    gameState.players.forEach(player => {
      const status = player.isAlive ? "存活" : "已死亡";
      summary += `- ${player.name}: ${player.role} (${status})\n`;
    });


    summary += "\n### 详细对局流程:\n";
    for (let day = 1; day <= gameState.currentDay; day++) {
      summary += `\n**--- 第 ${day} 天 ---**\n`;


      const nightEvents = gameState.gameLog.filter(entry => entry.day === day && (entry.content.includes('死亡')));
      if (nightEvents.length > 0) {
        summary += `**[夜晚]** ${nightEvents.map(e => e.content).join(' ')}\n`;
      } else if (day > 1 || (day === 1 && gameState.currentDay > 1)) {
        summary += `**[夜晚]** 平安夜。\n`;
      }


      const discussionsThisDay = gameState.discussionLog.filter(entry => entry.day === day);
      if (discussionsThisDay.length > 0) {
        summary += `**[讨论环节]**\n${discussionsThisDay.map(d => `- ${d.speaker}: ${d.content}`).join('\n')}\n`;
      }


      const voteLog = gameState.gameLog.find(entry => entry.day === day && entry.content.includes('被投票放逐'));
      if (voteLog) {
        summary += `**[投票结果]** ${voteLog.content}\n`;
      }
    }

    summary += "\n--- 复盘结束 ---";
    return summary;
  }


  async function injectSummaryIntoMemories(summary) {
    let injectedCount = 0;

    for (const player of werewolfGameState.players) {

      if (player.type === 'character') {
        const chat = state.chats[player.id];
        if (chat) {

          const newMemory = {
            content: summary,
            timestamp: Date.now(),
            source: 'werewolf_summary'
          };
          if (!chat.longTermMemory) {
            chat.longTermMemory = [];
          }
          chat.longTermMemory.push(newMemory);

          await db.chats.put(chat);
          injectedCount++;
        }
      }
    }
    return injectedCount;
  }


  async function handleManualWerewolfSummary() {
    if (!werewolfGameState.isActive && werewolfGameState.currentPhase === 'gameover') {
      await showCustomAlert("请稍候...", "正在为所有AI角色生成并注入游戏记忆...");
      try {
        const summary = createWerewolfGameSummary(werewolfGameState);



        const count = await injectSummaryIntoMemories(summary);


        await showCustomAlert("成功", `游戏记忆已成功注入到 ${count} 位AI角色的长期记忆中！`);
      } catch (error) {
        console.error("手动注入狼人杀记忆失败:", error);
        await showCustomAlert("失败", `手动注入记忆时出错: ${error.message}`);
      }
    } else {
      alert("游戏尚未结束，无法进行总结。");
    }
  }


  async function endGame(winner) {
    werewolfGameState.isActive = false;
    werewolfGameState.currentPhase = 'gameover';


    addGameLog(`${winner}阵营胜利！`);

    document.getElementById('werewolf-game-over-title').textContent = `${winner}胜利！`;
    let reason = '';
    if (winner === '好人') {
      reason = '所有狼人已被放逐，好人阵营获得了胜利！';
    } else {
      reason = '狼人数量已达到胜利条件，狼人阵营获得了胜利！';
    }
    const reasonEl = document.getElementById('werewolf-game-over-reason');
    reasonEl.textContent = reason;

    const roleListEl = document.getElementById('werewolf-role-reveal-list');
    roleListEl.innerHTML = '';

    const sortedPlayers = [...werewolfGameState.players].sort((a, b) => {
      const aIndex = werewolfGameState.players.findIndex(p => p.id === a.id);
      const bIndex = werewolfGameState.players.findIndex(p => p.id === b.id);
      return aIndex - bIndex;
    });

    sortedPlayers.forEach((player, index) => {
      const itemEl = document.createElement('div');
      itemEl.style.cssText = `display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #444; color: white;`;
      if (index === sortedPlayers.length - 1) itemEl.style.borderBottom = 'none';
      const roleColor = player.role === '狼人' ? '#ff4d4d' : '#52c41a';
      itemEl.innerHTML = `
                    <img src="${player.avatar}" style="width: 30px; height: 30px; border-radius: 50%; margin-right: 12px; filter: ${player.isAlive ? 'none' : 'grayscale(100%)'};">
                    <span style="flex-grow: 1; text-align: left; text-decoration: ${player.isAlive ? 'none' : 'line-through'};">${index + 1}. ${player.name}</span>
                    <strong style="color: ${roleColor};">${player.role}</strong>
                `;
      roleListEl.appendChild(itemEl);
    });

    document.getElementById('werewolf-game-over-modal').classList.add('visible');


    try {
      console.log("游戏结束，开始自动总结并注入记忆...");

      const summaryContext = createWerewolfGameSummary(werewolfGameState);

      const count = await generateAndInjectWerewolfMemories(summaryContext);
      console.log(`狼人杀游戏总结已自动存入 ${count} 位角色的记忆中。`);
    } catch (error) {
      console.error("自动总结狼人杀游戏失败:", error);
      if (reasonEl) {
        reasonEl.innerHTML += '<br><small style="color: #ff8a80; margin-top: 10px; display: block;">自动记忆总结失败，可稍后手动尝试。</small>';
      }
    }

  }



  function addGameLog(content) {

    werewolfGameState.gameLog.push({
      type: 'system',
      content,
      timestamp: Date.now(),
      day: werewolfGameState.currentDay
    });
  }

  function addDialogueLog(speaker, content) {

    werewolfGameState.discussionLog.push({
      type: 'dialogue',
      speaker,
      content,
      timestamp: Date.now(),
      day: werewolfGameState.currentDay
    });
  }




  function openSelectionModal(type) {
    return new Promise(resolve => {
      const modalId = `werewolf-${type}-modal`;
      const listId = `werewolf-${type}-selection-list`;
      let confirmBtnId = '';
      if (type === 'prophet') confirmBtnId = 'confirm-prophet-check-btn';
      if (type === 'hunter') confirmBtnId = 'confirm-hunter-shot-btn';
      if (type === 'vote') confirmBtnId = 'confirm-vote-btn';

      const modal = document.getElementById(modalId);
      const listEl = document.getElementById(listId);
      const confirmBtn = document.getElementById(confirmBtnId);

      listEl.innerHTML = '';
      let selectedId = null;


      const potentialTargets = werewolfGameState.players.filter(p =>
        p.isAlive && (type === 'hunter' || type === 'vote' || p.id !== 'user')
      );
      potentialTargets.forEach(p => {
        const item = document.createElement('div');
        item.className = 'werewolf-selection-item';
        item.dataset.id = p.id;
        item.innerHTML = `<img src="${p.avatar}" class="avatar"><span class="name">${p.name}</span>`;
        item.onclick = () => {
          listEl.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          selectedId = p.id;
        };
        listEl.appendChild(item);
      });

      const newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
      newConfirmBtn.onclick = () => {
        if (selectedId) {
          modal.classList.remove('visible');
          resolve(selectedId);
        } else {
          alert('请选择一个目标。');
        }
      };

      modal.classList.add('visible');
    });
  }


  function openWolfKillModal() {
    return new Promise(resolve => {
      const modal = document.getElementById('werewolf-kill-modal');
      const listEl = document.getElementById('werewolf-kill-selection-list');
      const confirmBtn = document.getElementById('confirm-wolf-kill-btn');
      const header = modal.querySelector('.modal-header span');

      const wolves = werewolfGameState.players.filter(p => p.role === '狼人' && p.isAlive);
      const teammates = wolves.filter(w => w.id !== 'user').map(w => w.name).join('、');

      if (teammates) {
        header.innerHTML = `狼人请选择刀人对象<br><small style="font-weight:normal; font-size: 13px;">你的队友是: ${teammates}</small>`;
      } else {
        header.textContent = '狼人请选择刀人对象';
      }

      listEl.innerHTML = '';
      let selectedId = null;

      const potentialTargets = werewolfGameState.players.filter(p => p.isAlive && p.role !== '狼人');
      potentialTargets.forEach(p => {
        const item = document.createElement('div');
        item.className = 'werewolf-selection-item';
        item.dataset.id = p.id;
        item.innerHTML = `<img src="${p.avatar}" class="avatar"><span class="name">${p.name}</span>`;
        item.onclick = () => {
          listEl.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          selectedId = p.id;
        };
        listEl.appendChild(item);
      });

      const newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
      newConfirmBtn.onclick = () => {
        if (selectedId) {
          modal.classList.remove('visible');
          resolve(selectedId);
        } else {
          alert('请选择一个目标。');
        }
      };

      modal.classList.add('visible');
    });
  }


  function handleUserWerewolfSpeech() {
    const myPlayer = werewolfGameState.players.find(p => p.id === 'user');

    if (!myPlayer || !myPlayer.isAlive) return;

    const userInput = document.getElementById('werewolf-user-input');
    const speech = userInput.value.trim();

    if (speech) {
      addDialogueLog(myPlayer.name, speech);
      renderWerewolfScreen();
    }


    document.getElementById('werewolf-action-bar').style.display = 'none';
    userInput.value = '';

    startVotingPhase();
  }

  async function handleAiContinueDiscussion() {
    addGameLog('你让大家继续讨论...');
    renderWerewolfScreen();


    const continueBtn = document.getElementById('werewolf-wait-reply-btn');
    if (continueBtn) continueBtn.disabled = true;



    await showCustomAlert("请稍候", "正在等待AI角色们继续讨论...");

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('API未配置，无法生成对话。');
      return;
    }

    const systemPrompt = buildWerewolfPrompt();

    try {
      let isGemini = proxyUrl.includes('generativelanguage');

      let messagesForApi = [{
        role: 'user',
        content: '请AI角色们继续进行讨论。'
      }];
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);

      const response = isGemini ?
        await fetch(geminiConfig.url, geminiConfig.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{
              role: 'system',
              content: systemPrompt
            }, ...messagesForApi],
            temperature: state.globalSettings.apiTemperature || 0.9,
          })
        });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API 错误: ${errorData.error.message}`);
      }

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const dialogues = JSON.parse(jsonMatch[0]);

      for (const dialogue of dialogues) {
        if (dialogue.speaker_name && dialogue.dialogue) {
          addDialogueLog(dialogue.speaker_name, dialogue.dialogue);
          renderWerewolfScreen();
          await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2000));
        }
      }
    } catch (error) {
      console.error("狼人杀AI回应生成失败:", error);
      await showCustomAlert("AI 发言失败", `错误: ${error.message}`);
    } finally {

      if (continueBtn) continueBtn.disabled = false;
    }
  }


  async function handleWerewolfWaitReply() {
    const myPlayer = werewolfGameState.players.find(p => p.id === 'user');

    if (!myPlayer || !myPlayer.isAlive) {
      console.warn("handleWerewolfWaitReply 被调用，但用户已死亡。操作被忽略。");
      return;
    }


    const userInput = document.getElementById('werewolf-user-input');
    const speech = userInput.value.trim();

    if (!speech) {
      alert("请先输入你的发言内容。");
      return;
    }

    addDialogueLog(myPlayer.name, speech);
    renderWerewolfScreen();
    userInput.value = '';

    await showCustomAlert("请稍候", "正在等待AI角色们对你的发言做出回应...");

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('API未配置，无法生成对话。');
      return;
    }

    const systemPrompt = buildWerewolfPrompt();

    try {
      let isGemini = proxyUrl.includes('generativelanguage');
      let messagesForApi = [{
        role: 'user',
        content: `现在，请所有AI角色针对刚刚的发言（特别是'${myPlayer.name}'的发言）继续进行讨论。`
      }];
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);

      const response = isGemini ?
        await fetch(geminiConfig.url, geminiConfig.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{
              role: 'system',
              content: systemPrompt
            }, ...messagesForApi],
            temperature: state.globalSettings.apiTemperature || 0.9,
          })
        });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API 错误: ${errorData.error.message}`);
      }

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);



      let dialogues;
      try {

        let cleanedJsonString = aiResponseContent.replace(/^```json\s*/, '').replace(/```$/, '').trim();
        const startIndex = cleanedJsonString.indexOf('[');
        const endIndex = cleanedJsonString.lastIndexOf(']');

        if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
          throw new Error("AI返回的内容中未找到有效的JSON数组结构 (`[...]`)。");
        }

        const jsonArrayString = cleanedJsonString.substring(startIndex, endIndex + 1);


        dialogues = JSON.parse(jsonArrayString);

      } catch (e) {

        if (e.message.includes("Bad control character")) {
          console.warn("检测到JSON中的非法控制字符，尝试清理并重试...");


          const sanitizeJsonString = (str) => {
            let inString = false;
            let escaped = false;
            let result = '';
            for (let i = 0; i < str.length; i++) {
              const char = str[i];

              if (escaped) {
                result += char;
                escaped = false;
                continue;
              }
              if (char === '\\') {
                result += char;
                escaped = true;
                continue;
              }
              if (char === '"') {
                result += char;
                inString = !inString;
                continue;
              }

              if (inString) {

                if (char === '\n') result += '\\n';
                else if (char === '\r') result += '\\r';
                else if (char === '\t') result += '\\t';

                else if (char.charCodeAt(0) < 32) continue;
                else result += char;
              } else {

                result += char;
              }
            }
            return result;
          };


          let cleanedJsonString = aiResponseContent.replace(/^```json\s*/, '').replace(/```$/, '').trim();


          const sanitizedString = sanitizeJsonString(cleanedJsonString);

          const jsonMatch = sanitizedString.match(/(\[[\s\S]*\])/);
          if (!jsonMatch) throw new Error("清理后仍未找到JSON数组。");

          dialogues = JSON.parse(jsonMatch[0]);

        } else {

          throw new Error(`解析AI返回的JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
        }
      }


      for (const dialogue of dialogues) {
        if (dialogue.speaker_name && dialogue.dialogue) {
          addDialogueLog(dialogue.speaker_name, dialogue.dialogue);
          renderWerewolfScreen();
          await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2000));
        }
      }
    } catch (error) {
      console.error("狼人杀AI回应生成失败:", error);
      await showCustomAlert("AI 发言失败", `错误: ${error.message}`);
    }
  }


  async function startVotingPhase() {
    addGameLog('发言结束，现在开始投票。');
    renderWerewolfScreen();


    werewolfGameState.votes = {};

    let aiVotes = null;
    werewolfGameState.lastFailedAction = 'getVotes';
    try {

      aiVotes = await getAiVotes();
      if (aiVotes) {
        aiVotes.forEach(vote => {
          const voter = werewolfGameState.players.find(p => p.name === vote.voter_name);
          const target = werewolfGameState.players.find(p => p.name === vote.vote_for_name);
          if (voter && voter.isAlive && target) {
            werewolfGameState.votes[voter.name] = target.name;
          }
        });
      }
      werewolfGameState.lastFailedAction = null;
    } catch (error) {
      console.error("AI投票决策API失败:", error);

      await showCustomAlert("操作失败", `AI角色无法完成投票，游戏暂停。请点击右上角的"重试"按钮继续。\n错误: ${error.message}`);
      document.getElementById('werewolf-retry-btn').style.display = 'block';
      return;
    }



    const myPlayer = werewolfGameState.players.find(p => p.id === 'user');
    if (myPlayer && myPlayer.isAlive) {
      addGameLog('请你投票。');
      renderWerewolfScreen();
      const userVoteTargetId = await openSelectionModal('vote');
      const targetPlayer = werewolfGameState.players.find(p => p.id === userVoteTargetId);
      if (targetPlayer) {

        werewolfGameState.votes[myPlayer.name] = targetPlayer.name;
      }
    }


    handleVotingResults();
  }


  async function getAiVotes() {
    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return null;

    const aliveAiPlayers = werewolfGameState.players.filter(p => p.isAlive && p.id !== 'user');
    const potentialTargets = werewolfGameState.players.filter(p => p.isAlive).map(p => p.name);

    let systemPrompt = buildWerewolfPrompt();
    systemPrompt += `
# 【【【最终投票指令 (最高优先级)】】】
现在是投票环节。请你扮演【每一个存活的AI角色】，根据以上所有信息（特别是刚刚的讨论环节），为他们各自决定要投票放逐哪一位玩家。
- **投票依据**: 你的投票【必须】基于逻辑分析和你的身份。狼人可能会投给好人，好人需要找出狼人。
- **格式铁律**: 你的回复【必须且只能】是一个JSON数组，格式如下：
\`\`\`json
[
  {"voter_name": "角色A的名字", "vote_for_name": "角色A投票的玩家名字"},
  {"voter_name": "角色B的名字", "vote_for_name": "角色B投票的玩家名字"}
]
\`\`\`
- **可投票的玩家列表**: ${potentialTargets.join(', ')}

现在，请为所有存活的AI角色生成他们的投票决定。`;

    try {
      let isGemini = proxyUrl.includes('generativelanguage');
      let messagesForApi = [{
        role: 'user',
        content: '请所有AI角色开始投票。'
      }];
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);

      const response = isGemini ?
        await fetch(geminiConfig.url, geminiConfig.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{
              role: 'system',
              content: systemPrompt
            }, ...messagesForApi],
            temperature: state.globalSettings.apiTemperature || 0.8,
          })
        });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try { const errData = await response.json(); errMsg = errData?.error?.message || errData?.message || errData?.detail || JSON.stringify(errData); } catch(e) { errMsg += ` (${response.statusText})`; }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      let cleanedJsonString = aiResponseContent.replace(/^```json\s*/, '').replace(/```$/, '').trim();


      const startIndex = cleanedJsonString.indexOf('[');
      const endIndex = cleanedJsonString.lastIndexOf(']');


      if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        throw new Error("AI返回的投票结果中未找到有效的JSON数组结构 (`[...]`)。");
      }



      const jsonArrayString = cleanedJsonString.substring(startIndex, endIndex + 1);


      try {

        const matches = jsonArrayString.match(/(\[[\s\S]*?\])/g);
        if (matches && matches.length > 0) {
          return JSON.parse(matches[matches.length - 1]);
        }
        return JSON.parse(jsonArrayString);
      } catch (e) {

        throw new Error(`解析AI返回的投票JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
      }


    } catch (error) {
      console.error("获取AI投票失败:", error);
      throw new Error(`获取AI投票决策失败: ${error.message}`);
    }
  }


  function handleVotingResults() {
    const voteCounts = {};
    const voteDetails = {};


    for (const voterName in werewolfGameState.votes) {
      const targetName = werewolfGameState.votes[voterName];

      voteCounts[targetName] = (voteCounts[targetName] || 0) + 1;

      if (!voteDetails[targetName]) {
        voteDetails[targetName] = [];
      }
      voteDetails[targetName].push(voterName);
    }

    let maxVotes = 0;
    let mostVotedPlayers = [];


    for (const playerName in voteCounts) {
      const count = voteCounts[playerName];
      if (count > maxVotes) {
        maxVotes = count;
        mostVotedPlayers = [playerName];
      } else if (count === maxVotes) {
        mostVotedPlayers.push(playerName);
      }
    }


    addGameLog('投票结果：');
    for (const playerName in voteDetails) {
      addGameLog(`${playerName} (${voteDetails[playerName].length}票): ${voteDetails[playerName].join('、 ')}`);
    }


    if (mostVotedPlayers.length === 1 && maxVotes > 0) {
      const playerToEliminate = werewolfGameState.players.find(p => p.name === mostVotedPlayers[0]);
      if (playerToEliminate) {
        playerToEliminate.isAlive = false;
        addGameLog(`${playerToEliminate.name} 被投票放逐。`);


        if (playerToEliminate.role === '猎人') {

        }
      }
    } else {
      addGameLog('平票或无人投票，此轮无人出局。');
    }

    renderWerewolfScreen();

    if (checkGameOver()) return;


    werewolfGameState.currentDay++;
    executeNightPhase();
  }


  async function getAiWolfKillTarget() {
    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return null;

    const wolves = werewolfGameState.players.filter(p => p.role === '狼人' && p.isAlive);
    const potentialTargets = werewolfGameState.players.filter(p => p.isAlive && p.role !== '狼人');

    const systemPrompt = `
# 你的任务
你现在是狼人团队的指挥官。你的任务是分析当前局势，并为狼人团队选择一个最佳的刀人目标。
# 核心规则
1.  **目标**: 优先刀掉预言家、女巫等神职人员。如果没有明确的神职信息，可以根据发言来判断谁的逻辑清晰、威胁最大。
2.  **格式铁律**: 你的回复【必须且只能】是一个JSON对象，格式如下:
    \`{"target_name": "你决定要刀的玩家名字"}\`

# 游戏状态
- **你的狼队友是**: ${wolves.map(w => w.name).join('、 ')}
- **可以刀的玩家列表**: ${potentialTargets.map(p => p.name).join('、 ')}
- **讨论摘要**: 
${werewolfGameState.discussionLog.map(d => `${d.speaker}: ${d.content}`).join('\n')}

现在，请做出你的决定。`;

    try {
      let isGemini = proxyUrl.includes('generativelanguage');
      let messagesForApi = [{
        role: 'user',
        content: '请选择今晚的目标。'
      }];
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);

      const response = isGemini ?
        await fetch(geminiConfig.url, geminiConfig.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{
              role: 'system',
              content: systemPrompt
            }, ...messagesForApi],
            temperature: state.globalSettings.apiTemperature || 0.8,
          })
        });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try { const errData = await response.json(); errMsg = errData?.error?.message || errData?.message || errData?.detail || JSON.stringify(errData); } catch(e) { errMsg += ` (${response.statusText})`; }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);
      const jsonMatch = aiResponseContent.match(/({[\s\S]*})/);
      if (!jsonMatch) throw new Error("AI返回的刀人目标格式不正确。");
      const decision = JSON.parse(jsonMatch[0]);

      const targetPlayer = werewolfGameState.players.find(p => p.name === decision.target_name);
      return targetPlayer ? targetPlayer.id : null;

    } catch (error) {
      console.error("获取AI狼人目标失败:", error);

      return potentialTargets[Math.floor(Math.random() * potentialTargets.length)].id;
    }
  }


  function openWitchActionModal(killedPlayer, witchPlayer) {
    return new Promise(resolve => {
      const modal = document.getElementById('werewolf-witch-modal');
      const listEl = document.getElementById('werewolf-witch-selection-list');
      const titleEl = document.getElementById('witch-modal-title');


      const poisonBtn = document.getElementById('confirm-witch-poison-btn');
      const doNothingBtn = document.getElementById('witch-do-nothing-btn');
      listEl.innerHTML = '';


      const newPoisonBtn = poisonBtn.cloneNode(true);
      poisonBtn.parentNode.replaceChild(newPoisonBtn, poisonBtn);
      const newDoNothingBtn = doNothingBtn.cloneNode(true);
      doNothingBtn.parentNode.replaceChild(newDoNothingBtn, doNothingBtn);


      newPoisonBtn.style.display = 'block';
      newPoisonBtn.disabled = true;

      let action = {
        save: false,
        poison: null
      };
      let selectedPoisonTarget = null;


      if (killedPlayer && !witchPlayer.antidoteUsed) {
        titleEl.textContent = `昨晚 ${killedPlayer.name} 被刀了`;
        const saveBtn = document.createElement('button');
        saveBtn.className = 'form-button';
        saveBtn.textContent = '使用解药救TA';
        saveBtn.style.margin = '20px';
        saveBtn.onclick = () => {
          action.save = true;
          modal.classList.remove('visible');
          resolve(action);
        };
        listEl.appendChild(saveBtn);
      } else if (killedPlayer) {
        titleEl.textContent = `昨晚 ${killedPlayer.name} 被刀了 (你没有解药了)`;
      } else {
        titleEl.textContent = '昨晚是平安夜';
      }


      if (!witchPlayer.poisonUsed) {
        const poisonTitle = document.createElement('p');
        poisonTitle.textContent = '是否要使用毒药？';
        poisonTitle.style.textAlign = 'center';
        poisonTitle.style.marginTop = '20px';
        listEl.appendChild(poisonTitle);

        const potentialTargets = werewolfGameState.players.filter(p => p.isAlive && p.id !== killedPlayer?.id);
        potentialTargets.forEach(p => {
          const item = document.createElement('div');
          item.className = 'werewolf-selection-item';
          item.dataset.id = p.id;
          item.innerHTML = `<img src="${p.avatar}" class="avatar"><span class="name">${p.name}</span>`;
          item.onclick = () => {
            listEl.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedPoisonTarget = p.id;


            newPoisonBtn.disabled = false;
          };
          listEl.appendChild(item);
        });
      }


      newPoisonBtn.onclick = () => {
        if (selectedPoisonTarget) {
          action.poison = selectedPoisonTarget;
          modal.classList.remove('visible');
          resolve(action);
        }
      };

      newDoNothingBtn.onclick = () => {
        modal.classList.remove('visible');
        resolve(action);
      };

      modal.classList.add('visible');
    });
  }




  async function handleWerewolfRetry() {
    const actionToRetry = werewolfGameState.lastFailedAction;
    if (!actionToRetry) return;

    document.getElementById('werewolf-retry-btn').style.display = 'none';
    await showCustomAlert("请稍候...", `正在重试"${actionToRetry}"操作...`);

    switch (actionToRetry) {
      case 'wolfKill':

        await executeNightPhase();
        break;
      case 'startDiscussion':

        await startDiscussionPhase();
        break;
      case 'getVotes':

        await startVotingPhase();
        break;

    }
  }





  function checkGameOver() {
    const alivePlayers = werewolfGameState.players.filter(p => p.isAlive);
    const aliveWolves = alivePlayers.filter(p => p.role === '狼人');
    const aliveGods = alivePlayers.filter(p => ['预言家', '女巫', '猎人', '守卫'].includes(p.role));
    const aliveVillagers = alivePlayers.filter(p => p.role === '平民');

    let winner = null;


    if (aliveWolves.length === 0) {
      winner = '好人';
    } else if (aliveWolves.length >= (aliveGods.length + aliveVillagers.length)) {
      winner = '狼人';
    } else if (werewolfGameState.gameMode === '12p') {

      if (aliveGods.length === 0 || aliveVillagers.length === 0) {
        winner = '狼人';
      }
    } else {

      if (aliveGods.length === 0 && aliveVillagers.length === 0) {
        winner = '狼人';
      }
    }


    if (winner) {

      endGame(winner);
      return true;
    }


    return false;
  }

  // ========== 从 script.js 迁移：handleSpectatorReroll ==========
  async function handleSpectatorReroll() {
    const chat = state.chats[state.activeChatId];
    if (!chat || !lastResponseTimestamps || lastResponseTimestamps.length === 0) {
      alert("没有可供重新生成的AI响应。");
      return;
    }

    chat.history = chat.history.filter(msg => !lastResponseTimestamps.includes(msg.timestamp));

    await db.chats.put(chat);
    await renderChatInterface(state.activeChatId);

    triggerSpectatorGroupAiAction();
  }

  // ========== 全局暴露 ==========
  window.werewolfGameState = werewolfGameState;
  window.openWerewolfLobby = openWerewolfLobby;
  window.initializeWerewolfGame = initializeWerewolfGame;
  window.handleWerewolfRetry = handleWerewolfRetry;
  window.handleManualWerewolfSummary = handleManualWerewolfSummary;
  window.executeNightPhase = executeNightPhase;
  window.handleSpectatorReroll = handleSpectatorReroll;
