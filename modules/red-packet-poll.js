// ============================================================
// red-packet-poll.js
// 来源：script.js 第 27247~27850 + 33018~33054 行
// 功能：红包（群红包/专属红包）、投票、红包数据迁移
// ============================================================

(function () {
  // state 通过全局作用域访问（window.state，由 init-and-state.js 初始化）

  function handlePaymentButtonClick() {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    if (chat.isGroup) {
      openRedPacketModal();
    } else {

      document.getElementById('transfer-modal').classList.add('visible');
    }
  }


  function openRedPacketModal() {
    const modal = document.getElementById('red-packet-modal');
    const chat = state.chats[state.activeChatId];


    document.getElementById('rp-group-amount').value = '';
    document.getElementById('rp-group-count').value = '';
    document.getElementById('rp-group-greeting').value = '';
    document.getElementById('rp-direct-amount').value = '';
    document.getElementById('rp-direct-greeting').value = '';
    document.getElementById('rp-group-total').textContent = '¥ 0.00';
    document.getElementById('rp-direct-total').textContent = '¥ 0.00';


    const receiverSelect = document.getElementById('rp-direct-receiver');
    receiverSelect.innerHTML = '';

    chat.members.forEach(member => {
      const option = document.createElement('option');

      option.value = member.originalName;
      option.textContent = member.groupNickname;
      receiverSelect.appendChild(option);
    });



    document.getElementById('rp-tab-group').click();

    modal.classList.add('visible');
  }


  async function sendGroupRedPacket() {
    const chat = state.chats[state.activeChatId];
    const amount = parseFloat(document.getElementById('rp-group-amount').value);
    const count = parseInt(document.getElementById('rp-group-count').value);
    const greeting = document.getElementById('rp-group-greeting').value.trim();

    if (isNaN(amount) || amount <= 0) {
      alert("请输入有效的总金额！");
      return;
    }
    if (isNaN(count) || count <= 0) {
      alert("请输入有效的红包个数！");
      return;
    }
    if (amount / count < 0.01) {
      alert("单个红包金额不能少于0.01元！");
      return;
    }

    const myNickname = chat.settings.myNickname || '我';

    const allocatedAmounts = generateRandomPacketAmounts(amount, count);
    const success = await processTransaction(amount, 'expense', `发出群红包(拼手气)`);
    if (!success) return;
    const newPacket = {
      role: 'user',
      senderName: myNickname,
      type: 'red_packet',
      packetType: 'lucky',
      timestamp: Date.now(),
      totalAmount: amount,
      count: count,
      greeting: greeting || '恭喜发财，大吉大利！',
      allocatedAmounts: allocatedAmounts,
      unclaimedAmounts: [...allocatedAmounts],
      claimedBy: {},
      isFullyClaimed: false,
    };

    chat.history.push(newPacket);
    await db.chats.put(chat);

    appendMessage(newPacket, chat);
    renderChatList();
    document.getElementById('red-packet-modal').classList.remove('visible');
  }


  async function sendDirectRedPacket() {
    const chat = state.chats[state.activeChatId];
    const amount = parseFloat(document.getElementById('rp-direct-amount').value);
    const receiverName = document.getElementById('rp-direct-receiver').value;
    const greeting = document.getElementById('rp-direct-greeting').value.trim();

    if (isNaN(amount) || amount <= 0) {
      alert("请输入有效的金额！");
      return;
    }
    if (!receiverName) {
      alert("请选择一个接收人！");
      return;
    }

    const myNickname = chat.settings.myNickname || '我';
    const success = await processTransaction(amount, 'expense', `发出专属红包-给${receiverName}`);
    if (!success) return;
    const newPacket = {
      role: 'user',
      senderName: myNickname,
      type: 'red_packet',
      packetType: 'direct',
      timestamp: Date.now(),
      totalAmount: amount,
      count: 1,
      greeting: greeting || '给你准备了一个红包',
      receiverName: receiverName,
      claimedBy: {},
      isFullyClaimed: false,
    };

    chat.history.push(newPacket);
    await db.chats.put(chat);

    appendMessage(newPacket, chat);
    renderChatList();
    document.getElementById('red-packet-modal').classList.remove('visible');
  }


  let isPacketProcessing = false;

  async function handlePacketClick(timestamp) {
    // 1. 如果锁是锁着的，直接退出，什么都不做
    if (isPacketProcessing) {
      console.log("正在处理红包，拦截了重复点击");
      return;
    }

    // 2. 上锁
    isPacketProcessing = true;

    try {
      const currentChatId = state.activeChatId;

      // 重新从数据库拉取最新数据（防止内存数据滞后）
      const freshChat = await db.chats.get(currentChatId);
      if (!freshChat) return;

      state.chats[currentChatId] = freshChat;
      const packet = freshChat.history.find(m => m.timestamp === timestamp);
      if (!packet) return;

      const myOriginalName = state.qzoneSettings.nickname || '{{user}}';
      // 确保 claimedBy 是个对象，防止报错
      if (!packet.claimedBy) packet.claimedBy = {};
      const hasClaimed = packet.claimedBy[myOriginalName];

      // 检查是否已经领过，或者是否已领完
      // 注意：这里加了更严格的检查
      if ((packet.packetType === 'direct' && packet.receiverName !== myOriginalName && Object.keys(packet.claimedBy).length > 0) ||
        packet.isFullyClaimed ||
        hasClaimed) {
        showRedPacketDetails(packet);
        return;
      }

      // 执行领取逻辑
      const claimedAmount = await handleOpenRedPacket(packet);

      if (claimedAmount !== null) {
        await renderChatInterface(currentChatId);
        await showCustomAlert("恭喜！", `你领取了 ${getDisplayNameInGroup(freshChat, packet.senderName)} 的红包，金额为 ${claimedAmount.toFixed(2)} 元。`);
      }

      const updatedPacket = state.chats[currentChatId].history.find(m => m.timestamp === timestamp);
      if (updatedPacket) {
        showRedPacketDetails(updatedPacket);
      }

    } catch (error) {
      console.error("红包处理出错:", error);
      alert("领取出错，请稍后重试");
    } finally {
      // 3. 无论成功还是失败，1秒后解锁
      // 延迟解锁是为了防止极快的手速连点
      setTimeout(() => {
        isPacketProcessing = false;
      }, 1000);
    }
  }





  async function handleOpenRedPacket(packet) {
    const chat = state.chats[state.activeChatId];
    let timestamp = Date.now();
    const myOriginalName = state.qzoneSettings.nickname || '{{user}}';

    // 检查是否领完
    const remainingCount = packet.count - Object.keys(packet.claimedBy || {}).length;
    if (remainingCount <= 0) {
      packet.isFullyClaimed = true;
      await db.chats.put(chat);
      await showCustomAlert("手慢了", "红包已被领完！");
      return null;
    }

    // --- 计算金额逻辑 ---
    let claimedAmount = 0;
    if (packet.packetType === 'lucky') {
      if (packet.unclaimedAmounts && packet.unclaimedAmounts.length > 0) {
        claimedAmount = packet.unclaimedAmounts.pop();
      } else {
        // 兼容旧数据
        const remainingAmount = packet.totalAmount - Object.values(packet.claimedBy || {}).reduce((sum, val) => sum + val, 0);
        if (remainingCount === 1) {
          claimedAmount = remainingAmount;
        } else {
          const min = 0.01;
          const max = remainingAmount - (remainingCount - 1) * min;
          claimedAmount = Math.random() * (max - min) + min;
        }
      }
    } else {
      claimedAmount = packet.totalAmount;
    }
    claimedAmount = parseFloat(claimedAmount.toFixed(2));

    // 记录领取
    if (!packet.claimedBy) packet.claimedBy = {};
    packet.claimedBy[myOriginalName] = claimedAmount;

    // 更新状态
    const isNowFullyClaimed = (packet.unclaimedAmounts && packet.unclaimedAmounts.length === 0) || (Object.keys(packet.claimedBy).length >= packet.count);
    if (isNowFullyClaimed) {
      packet.isFullyClaimed = true;
    }

    // 生成聊天消息
    const myDisplayName = getDisplayNameInGroup(chat, myOriginalName);
    const senderDisplayName = getDisplayNameInGroup(chat, packet.senderName);

    const visibleMessage = {
      role: 'system',
      type: 'pat_message',
      content: `你领取了 ${senderDisplayName} 的红包`,
      timestamp: timestamp++
    };
    chat.history.push(visibleMessage);

    // 生成给AI看的隐藏提示
    let hiddenMessageContent;
    if (isNowFullyClaimed) {
      const finishedMessage = {
        role: 'system',
        type: 'pat_message',
        content: `${senderDisplayName} 的红包已被领完`,
        timestamp: timestamp++
      };
      chat.history.push(finishedMessage);

      let luckyKing = { name: '', amount: -1 };
      if (packet.packetType === 'lucky' && packet.count > 1) {
        Object.entries(packet.claimedBy).forEach(([name, amount]) => {
          if (amount > luckyKing.amount) {
            luckyKing = { name, amount };
          }
        });
      }
      const luckyKingDisplayName = luckyKing.name ? getDisplayNameInGroup(chat, luckyKing.name) : '无';
      hiddenMessageContent = `[系统提示：用户 (${myDisplayName}) 领取了最后一个红包。红包已被领完，手气王是 ${luckyKingDisplayName}！请对此事件发表评论。]`;

    } else {
      hiddenMessageContent = `[系统提示：用户 (${myDisplayName}) 刚刚领取了红包 (时间戳: ${packet.timestamp})。红包还未领完，你现在可以使用 'open_red_packet' 指令来尝试领取。]`;
    }

    const hiddenMessage = {
      role: 'system',
      content: hiddenMessageContent,
      timestamp: timestamp++,
      isHidden: true
    };
    chat.history.push(hiddenMessage);

    await db.chats.put(chat);

    // 【核心修复】把抢到的钱存入钱包
    if (claimedAmount > 0) {
      // 这里的 'income' 会增加余额，description 会显示在账单列表里
      await processTransaction(claimedAmount, 'income', `红包-${senderDisplayName}`);
    }

    return claimedAmount;
  }




  async function showRedPacketDetails(packet) {
    if (!packet) {
      console.error("showRedPacketDetails收到了无效的packet对象");
      return;
    }

    const chat = state.chats[state.activeChatId];
    if (!chat) return;

    const modal = document.getElementById('red-packet-details-modal');

    const myOriginalName = state.qzoneSettings.nickname || '{{user}}';

    const senderDisplayName = getDisplayNameInGroup(chat, packet.senderName);
    document.getElementById('rp-details-sender').textContent = senderDisplayName;
    document.getElementById('rp-details-greeting').textContent = packet.greeting || '恭喜发财，大吉大利！';

    const myAmountEl = document.getElementById('rp-details-my-amount');

    if (packet.claimedBy && packet.claimedBy[myOriginalName]) {
      myAmountEl.querySelector('span:first-child').textContent = packet.claimedBy[myOriginalName].toFixed(2);
      myAmountEl.style.display = 'block';
    } else {
      myAmountEl.style.display = 'none';
    }

    const claimedCount = Object.keys(packet.claimedBy || {}).length;
    const claimedAmountSum = Object.values(packet.claimedBy || {}).reduce((sum, val) => sum + val, 0);
    let summaryText = `${claimedCount}/${packet.count}个红包，共${claimedAmountSum.toFixed(2)}/${packet.totalAmount.toFixed(2)}元。`;
    if (!packet.isFullyClaimed && claimedCount < packet.count) {
      const timeLeft = Math.floor((packet.timestamp + 24 * 60 * 60 * 1000 - Date.now()) / (1000 * 60 * 60));
      if (timeLeft > 0) summaryText += ` 剩余红包将在${timeLeft}小时内退还。`;
    }
    document.getElementById('rp-details-summary').textContent = summaryText;

    const listEl = document.getElementById('rp-details-list');
    listEl.innerHTML = '';
    const claimedEntries = Object.entries(packet.claimedBy || {});

    let luckyKing = {
      name: '',
      amount: -1
    };
    if (packet.packetType === 'lucky' && packet.isFullyClaimed && claimedEntries.length > 1) {
      claimedEntries.forEach(([name, amount]) => {
        if (amount > luckyKing.amount) {
          luckyKing = {
            name,
            amount
          };
        }
      });
    }

    claimedEntries.sort((a, b) => b[1] - a[1]);

    claimedEntries.forEach(([originalName, amount]) => {
      const item = document.createElement('div');
      item.className = 'rp-details-item';
      let luckyTag = '';
      if (luckyKing.name && originalName === luckyKing.name) {
        luckyTag = '<span class="lucky-king-tag">手气王</span>';
      }


      const claimerDisplayName = getDisplayNameInGroup(chat, originalName);

      item.innerHTML = `
                    <span class="name">${claimerDisplayName}</span>
                    <span class="amount">${amount.toFixed(2)} 元</span>
                    ${luckyTag}
                `;
      listEl.appendChild(item);
    });

    modal.classList.add('visible');
  }


  document.getElementById('close-rp-details-btn').addEventListener('click', () => {
    document.getElementById('red-packet-details-modal').classList.remove('visible');
  });





  function openCreatePollModal() {
    const modal = document.getElementById('create-poll-modal');
    document.getElementById('poll-question-input').value = '';
    const optionsContainer = document.getElementById('poll-options-container');
    optionsContainer.innerHTML = '';


    addPollOptionInput();
    addPollOptionInput();

    modal.classList.add('visible');
  }


  function addPollOptionInput() {
    const container = document.getElementById('poll-options-container');
    const wrapper = document.createElement('div');
    wrapper.className = 'poll-option-input-wrapper';
    wrapper.innerHTML = `
                <input type="text" class="poll-option-input" placeholder="选项内容...">
                <button class="remove-option-btn">-</button>
            `;

    wrapper.querySelector('.remove-option-btn').addEventListener('click', () => {

      if (container.children.length > 2) {
        wrapper.remove();
      } else {
        alert('投票至少需要2个选项。');
      }
    });

    container.appendChild(wrapper);
  }


  async function sendPoll() {
    if (!state.activeChatId) return;

    const question = document.getElementById('poll-question-input').value.trim();
    if (!question) {
      alert('请输入投票问题！');
      return;
    }

    const options = Array.from(document.querySelectorAll('.poll-option-input'))
      .map(input => input.value.trim())
      .filter(text => text);

    if (options.length < 2) {
      alert('请至少输入2个有效的投票选项！');
      return;
    }

    const chat = state.chats[state.activeChatId];
    const myNickname = chat.isGroup ? (chat.settings.myNickname || '我') : '我';

    const newPollMessage = {
      role: 'user',
      senderName: myNickname,
      type: 'poll',
      timestamp: Date.now(),
      question: question,
      options: options,
      votes: {},
      isClosed: false,
    };

    chat.history.push(newPollMessage);
    await db.chats.put(chat);

    appendMessage(newPollMessage, chat);
    renderChatList();

    document.getElementById('create-poll-modal').classList.remove('visible');
  }



  async function handleUserVote(timestamp, choice) {
    const chat = state.chats[state.activeChatId];
    const poll = chat.history.find(m => m.timestamp === timestamp);
    const myNickname = chat.isGroup ? (chat.settings.myNickname || '我') : '我';


    if (!poll || poll.isClosed) {

      if (poll && poll.isClosed) {
        showPollResults(timestamp);
      }
      return;
    }


    const isReclickingSameOption = poll.votes[choice] && poll.votes[choice].includes(myNickname);


    if (!isReclickingSameOption) {

      for (const option in poll.votes) {
        const voterIndex = poll.votes[option].indexOf(myNickname);
        if (voterIndex > -1) {
          poll.votes[option].splice(voterIndex, 1);
        }
      }

      if (!poll.votes[choice]) {
        poll.votes[choice] = [];
      }
      poll.votes[choice].push(myNickname);
    }


    let hiddenMessageContent = null;


    if (!isReclickingSameOption) {
      hiddenMessageContent = `[系统提示：用户 (${myNickname}) 刚刚投票给了 "${choice}"。]`;
    }


    if (hiddenMessageContent) {
      const hiddenMessage = {
        role: 'system',
        content: hiddenMessageContent,
        timestamp: Date.now(),
        isHidden: true,
      };
      chat.history.push(hiddenMessage);
    }


    await db.chats.put(chat);
    renderChatInterface(state.activeChatId);
  }



  async function endPoll(timestamp) {
    const chat = state.chats[state.activeChatId];
    const poll = chat.history.find(m => m.timestamp === timestamp);
    if (!poll || poll.isClosed) return;

    const confirmed = await showCustomConfirm("结束投票", "确定要结束这个投票吗？结束后将无法再进行投票。");
    if (confirmed) {
      poll.isClosed = true;

      const resultSummary = poll.options.map(opt => `"${opt}"(${poll.votes[opt]?.length || 0}票)`).join('，');
      const hiddenMessageContent = `[系统提示：用户手动结束了投票！最终结果为：${resultSummary}。]`;

      const hiddenMessage = {
        role: 'system',
        content: hiddenMessageContent,
        timestamp: Date.now(),
        isHidden: true,
      };
      chat.history.push(hiddenMessage);


      await db.chats.put(chat);
      renderChatInterface(state.activeChatId);
    }
  }




  function showPollResults(timestamp) {
    const chat = state.chats[state.activeChatId];
    const poll = chat.history.find(m => m.timestamp === timestamp);
    if (!poll || !poll.isClosed) return;

    let resultsHtml = `<p><strong>${poll.question}</strong></p><hr style="opacity: 0.2; margin: 10px 0;">`;

    if (Object.keys(poll.votes).length === 0) {
      resultsHtml += '<p style="color: #8a8a8a;">还没有人投票。</p>';
    } else {
      poll.options.forEach(option => {
        const voters = poll.votes[option] || [];


        const displayVoters = voters.map(originalName => getDisplayNameInGroup(chat, originalName)).join('、 ');

        resultsHtml += `
                        <div style="margin-bottom: 15px;">
                            <p style="font-weight: 500; margin: 0 0 5px 0;">${option} (${voters.length}票)</p>
                            <p style="font-size: 13px; color: #555; margin: 0; line-height: 1.5;">
                                ${voters.length > 0 ? displayVoters : '无人投票'}
                            </p>
                        </div>
                    `;
      });
    }

    showCustomAlert("投票结果", resultsHtml);
  }



  // 来源：script.js 第 33018~33054 行
  async function migrateOldRedPacketData() {
    console.log("开始检查并迁移旧的红包数据...");
    let migrationCount = 0;

    const allChats = Object.values(state.chats);

    for (const chat of allChats) {
      let needsDbUpdate = false;
      for (const msg of chat.history) {

        if (msg.type === 'red_packet' && msg.packetType === 'direct' && msg.role === 'assistant' && msg.hasOwnProperty('receiver') && !msg.hasOwnProperty('receiverName')) {

          msg.receiverName = msg.receiver;
          delete msg.receiver;

          needsDbUpdate = true;
          migrationCount++;
        }
      }

      if (needsDbUpdate) {
        console.log(`在聊天 "${chat.name}" 中发现并修复了旧红包数据。`);
        await db.chats.put(chat);
      }
    }

    if (migrationCount > 0) {
      console.log(`数据迁移完成！总共修复了 ${migrationCount} 条红包记录。`);
      alert(`检测到并成功修复了 ${migrationCount} 条旧的红包消息！页面将自动刷新以应用更改。`);
      location.reload();
    } else {
      console.log("未发现需要迁移的旧红包数据。");
    }
  }

  // ========== 导出到全局作用域 ==========
  window.handlePaymentButtonClick = handlePaymentButtonClick;
  window.openRedPacketModal = openRedPacketModal;
  window.sendGroupRedPacket = sendGroupRedPacket;
  window.sendDirectRedPacket = sendDirectRedPacket;
  window.handlePacketClick = handlePacketClick;
  window.handleOpenRedPacket = handleOpenRedPacket;
  window.showRedPacketDetails = showRedPacketDetails;
  window.openCreatePollModal = openCreatePollModal;
  window.addPollOptionInput = addPollOptionInput;
  window.sendPoll = sendPoll;
  window.handleUserVote = handleUserVote;
  window.endPoll = endPoll;
  window.showPollResults = showPollResults;
  window.migrateOldRedPacketData = migrateOldRedPacketData;

})();
