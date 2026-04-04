// ========================================
// 黑市拍卖模块
// 来源: script.js 第 61060 ~ 61815 行
// 包含: openAuctionScreen, generateNewAuctionItem, startAuctionLoop, npcBid,
//       placeBid, addAuctionLog, updateAuctionState, endAuction,
//       openAuctionGiftSelector, sendAuctionGiftToChat,
//       openInventoryModal, closeInventoryModal, handleGiftFromInventory
// ========================================

  let auctionState = {
    isActive: false,
    item: null,
    currentPrice: 0,
    timer: 30,
    timerId: null,
    npcIntervalId: null,
    lastBidder: null,
    bidHistory: []
  };

  let auctioneerState = 0;

  async function openAuctionScreen() {
    showScreen('auction-screen');
    if (!auctionState.isActive) {
      document.getElementById('auction-item-img').style.display = 'none';
      document.getElementById('auction-loading').style.display = 'block';
      document.getElementById('auction-item-name').textContent = "正在搜寻黑市...";
      document.getElementById('auction-item-desc').textContent = "";
      generateNewAuctionItem();
    }
  }

  async function generateNewAuctionItem() {
    const btn = document.querySelector('#auction-screen .action-btn');
    btn.style.pointerEvents = 'none';
    btn.textContent = '进货中...';

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey) {
      alert("请先配置API！");
      btn.style.pointerEvents = 'auto';
      btn.textContent = '新拍品';
      return;
    }

    let auctionContext = "";
    const auctionBook = state.worldBooks.find(wb => wb.name.includes('黑市') || wb.name.includes('拍卖'));

    if (auctionBook) {
      console.log("✅ 找到专属拍卖设定书:", auctionBook.name);
      const contentPreview = auctionBook.content.filter(e => e.enabled !== false).map(e => e.content).join('; ');
      auctionContext = `\n    【当前拍卖行特殊世界观 (最高优先级)】: \n    ${contentPreview}\n    \n    (请根据上述特殊世界观生成符合设定的拍品和NPC，忽略现实世界的限制)\n    `;
    } else {
      auctionContext = `\n    【默认拍品类别清单】:\n    1. 顶级珠宝：稀有钻石项链、红蓝宝石戒指、皇冠、手镯（适合送给恋人）。\n    2. 传世古董：明清瓷器、欧洲中世纪古物、绝版名表、玉玺。\n    3. 艺术珍品：世界名画（虚构的真迹）、著名雕塑。\n    4. 奢华资产：海岛契约、私人飞机、顶级豪车、庄园钥匙。\n    5. 游戏抽卡：珍稀游戏道具、绝版皮肤账号。\n    \n    (请仅从上述 5 个类别中选择一种生成)\n    `;
    }

    const charList = Object.values(state.chats).filter(c => !c.isGroup).map(c => {
      const persona = c.settings?.aiPersona || '未设定人设';
      return `${c.name}(${persona.substring(0, 50)}...)`;
    }).join('\n');

    const systemPrompt = `你是一位顶级拍卖行的首席拍卖官。\n\n# 核心任务\n请根据下面的【设定来源】，完成两个任务：\n1. 生成一件极具价值的拍品。\n2. 生成一批符合该世界观背景的"路人NPC竞拍者"。\n\n${auctionContext}\n\n# 任务 B：买家意向分析\n下面是今天的受邀宾客名单（用户的重要角色）：\n${charList}\n请分析这件拍品对哪些宾客有吸引力？\n\n# 回复格式铁律\n回复【必须且只能】是一个JSON对象：\n{\n    "item": {\n        "name": "物品名称 (中文，名字要霸气或优雅)",\n        "description": "一段精彩的描述，强调其稀有度、历史价值或特殊功能（50字以内，中文）",\n        "basePrice": 初始价格(数字, 建议 10000 以上),\n        "image_prompt": "物品的英文视觉描述, high quality, cinematic lighting, detailed, clean background"\n    },\n    "interested_bidders": ["宾客A的名字", "宾客B的名字"],\n    "world_npcs": ["NPC名字1", "NPC名字2", "NPC名字3", "NPC名字4", "NPC名字5"]\n}\n\n注意：\n1. image_prompt 必须全是英文单词。\n2. interested_bidders 数组里只能填上面"受邀宾客名单"里出现过的名字。\n3. world_npcs 是你根据世界观生成的路人。`;

    try {
      let isGemini = proxyUrl.includes('generativelanguage');
      let config = toGeminiRequestData(model, apiKey, systemPrompt, [{ role: 'user', content: '生成一件拍品' }]);

      const response = isGemini ?
        await fetch(config.url, config.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: '生成一件拍品' }], temperature: 1.0 })
        });

      if (!response.ok) throw new Error("API请求失败");
      const data = await response.json();
      const text = getGeminiResponseText(data);
      const json = JSON.parse(text.replace(/^```json\s*/, '').replace(/```$/, ''));

      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(json.item.image_prompt)}`;
      const limitMultiplier = 1.5 + Math.random() * 2.0;

      auctionState.item = json.item;
      auctionState.basePrice = json.item.basePrice;
      auctionState.limitPrice = json.item.basePrice * limitMultiplier;
      auctionState.currentPrice = json.item.basePrice;
      auctionState.isActive = true;
      auctionState.timer = 20;
      auctionState.lastBidder = null;
      auctionState.bidHistory = [];
      auctionState.interestedChars = json.interested_bidders || [];
      auctionState.worldNPCs = json.world_npcs || [];

      document.getElementById('auction-item-name').textContent = json.item.name;
      document.getElementById('auction-item-desc').textContent = json.item.description;
      document.getElementById('auction-current-price').textContent = `¥ ${json.item.basePrice.toLocaleString()}`;

      const imgEl = document.getElementById('auction-item-img');
      imgEl.src = imageUrl;
      imgEl.style.display = 'block';
      document.getElementById('auction-loading').style.display = 'none';
      document.getElementById('auction-log').innerHTML = '<div style="color:#666; padding:5px;">拍卖开始！底价 ¥' + json.item.basePrice + '</div>';

      startAuctionLoop();
    } catch (e) {
      console.error(e);
      alert("进货失败，请重试");
    } finally {
      btn.style.pointerEvents = 'auto';
      btn.textContent = '新拍品';
    }
  }

  function startAuctionLoop() {
    if (auctionState.timerId) clearInterval(auctionState.timerId);
    if (auctionState.npcIntervalId) clearInterval(auctionState.npcIntervalId);

    const timerEl = document.getElementById('auction-timer');
    auctioneerState = 0;

    auctionState.timerId = setInterval(() => {
      auctionState.timer--;
      timerEl.textContent = `${auctionState.timer.toFixed(1)}s`;

      if (auctionState.timer <= 5) {
        timerEl.style.color = '#ff0055';
        timerEl.style.textShadow = '0 0 10px #ff0055';
      } else {
        timerEl.style.color = '#f0ad4e';
        timerEl.style.textShadow = 'none';
      }

      if (auctionState.timer <= 10 && auctioneerState === 0) {
        addAuctionLog("System", `🔨 ${auctionState.currentPrice} 第一次！`);
        auctioneerState = 1;
      }
      if (auctionState.timer <= 5 && auctioneerState === 1) {
        addAuctionLog("System", `🔨 ${auctionState.currentPrice} 第二次！还有人加价吗？`);
        auctioneerState = 2;
      }
      if (auctionState.timer <= 2 && auctioneerState === 2) {
        addAuctionLog("System", `🔨 ${auctionState.currentPrice} 第三次！即将成交...`);
        auctioneerState = 3;
      }

      if (auctionState.timer <= 0) {
        endAuction();
      }
    }, 1000);

    auctionState.npcIntervalId = setInterval(() => {
      if (!auctionState.isActive) return;
      if (Math.random() < 0.7) {
        npcBid();
      }
    }, 800);
  }

  function npcBid() {
    if (auctionState.currentPrice >= auctionState.limitPrice) {
      if (Math.random() > 0.1) return;
    }

    const premiumRatio = auctionState.currentPrice / auctionState.basePrice;
    const bidChance = 0.8 / (premiumRatio * premiumRatio);
    if (Math.random() > bidChance) return;

    let candidate = null;
    const allCharacters = Object.values(state.chats).filter(c => !c.isGroup);
    const interestedCandidates = allCharacters.filter(c =>
      auctionState.interestedChars && auctionState.interestedChars.includes(c.name)
    );

    if (interestedCandidates.length > 0 && Math.random() < 0.3) {
      const char = interestedCandidates[Math.floor(Math.random() * interestedCandidates.length)];
      candidate = { name: char.name, type: 'char', id: char.id };
    } else {
      let npcName = "神秘买家";
      if (auctionState.worldNPCs && auctionState.worldNPCs.length > 0) {
        const rivals = auctionState.worldNPCs.filter(n =>
          !auctionState.lastBidder || n !== auctionState.lastBidder.name
        );
        npcName = rivals.length > 0 ? rivals[Math.floor(Math.random() * rivals.length)] : auctionState.worldNPCs[0];
      } else {
        const richNames = ["神秘买家", "苏富比VIP", "迪拜王室成员", "华尔街投资人", "地产大亨", "低调的收藏家", "某上市公司CEO", "港岛名媛", "石油王子"];
        npcName = richNames[Math.floor(Math.random() * richNames.length)];
      }
      candidate = { name: npcName, type: 'npc' };
    }

    if (auctionState.lastBidder && auctionState.lastBidder.name === candidate.name) return;

    let increasePercent = 0.05;
    if (candidate.type === 'npc' && Math.random() < 0.3) increasePercent = 0.15;

    const newPrice = Math.floor(auctionState.currentPrice * (1 + increasePercent));
    updateAuctionState(newPrice, candidate);
  }

  async function placeBid(multiplier) {
    if (!auctionState.isActive) return;

    let bidAmount = 0;
    if (multiplier === 'custom') {
      const input = await showCustomPrompt("手动出价", "输入金额 (不能低于当前价)", auctionState.currentPrice + 100, 'number');
      if (!input) return;
      bidAmount = parseFloat(input);
    } else {
      bidAmount = Math.floor(auctionState.currentPrice * multiplier);
    }

    if (bidAmount <= auctionState.currentPrice) {
      alert("出价必须高于当前价格！");
      return;
    }

    const wallet = await db.userWallet.get('main');
    const totalAssets = wallet.balance + (wallet.kinshipCards || []).reduce((sum, c) => sum + (c.limit - (c.spent || 0)), 0);

    if (totalAssets < bidAmount) {
      if (navigator.vibrate) navigator.vibrate(200);
      showCustomAlert("资金不足", "你的资产总额不足以支付此价格！");
      return;
    }

    const user = { name: state.qzoneSettings.nickname || '我', type: 'user', id: 'user' };
    updateAuctionState(bidAmount, user);
  }

  function addAuctionLog(type, text) {
    const logEl = document.getElementById('auction-log');
    const div = document.createElement('div');
    if (type === 'System') {
      div.innerHTML = `<span style="color:#00f3ff; font-weight:bold;">[拍卖官]</span> ${text}`;
    } else {
      div.innerHTML = text;
    }
    if (type === 'bid-me') div.className = 'bid-me';
    if (type === 'bid-friend') div.className = 'bid-friend';
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function updateAuctionState(newPrice, bidder) {
    auctionState.currentPrice = newPrice;
    auctionState.lastBidder = bidder;
    auctionState.bidHistory.push(bidder);

    if (auctionState.timer < 10) {
      const bonusTime = Math.floor(Math.random() * 5) + 10;
      auctionState.timer = bonusTime;
      auctioneerState = 0;
      const timerEl = document.getElementById('auction-timer');
      timerEl.style.color = '#00ff00';
      setTimeout(() => timerEl.style.color = '#f0ad4e', 300);
      addAuctionLog("System", "⏱️ 有人出价，时间延长！");
    }

    const priceEl = document.getElementById('auction-current-price');
    priceEl.textContent = `¥ ${newPrice.toLocaleString()}`;
    priceEl.classList.remove('shake-animation');
    void priceEl.offsetWidth;
    priceEl.classList.add('shake-animation');

    let content = "";
    let logType = "bid-npc";

    if (bidder.type === 'user') {
      content = `🚩 <b>你</b> 出价 ¥${newPrice.toLocaleString()}`;
      logType = "bid-me";
      if (navigator.vibrate) navigator.vibrate(50);
    } else if (bidder.type === 'char') {
      content = `🔥 <b>${bidder.name}</b> 举牌 ¥${newPrice.toLocaleString()}!`;
      logType = "bid-friend";
    } else {
      content = `${bidder.name} 出价 ¥${newPrice.toLocaleString()}`;
    }

    const logEl = document.getElementById('auction-log');
    const div = document.createElement('div');
    div.innerHTML = content;
    div.className = logType;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  async function endAuction() {
    clearInterval(auctionState.timerId);
    clearInterval(auctionState.npcIntervalId);
    auctionState.isActive = false;

    const winner = auctionState.lastBidder;
    const finalPrice = auctionState.currentPrice;
    const item = auctionState.item;

    document.getElementById('auction-timer').textContent = "结束";
    document.getElementById('auction-item-image-container').classList.remove('auction-win-anim');

    if (!winner) {
      await showCustomAlert("拍卖结束", "无人出价，该拍品已流拍。");
      return;
    }

    if (winner.type === 'user') {
      document.getElementById('auction-item-image-container').classList.add('auction-win-anim');

      const wallet = await db.userWallet.get('main');
      const balance = wallet.balance || 0;
      const kinshipCards = wallet.kinshipCards || [];

      const paymentOptions = [];
      if (balance >= finalPrice) {
        paymentOptions.push({
          text: `<span style="color:#1677ff;font-weight:bold;">余额支付</span> (剩余 ¥${balance.toFixed(2)})`,
          value: 'balance'
        });
      }
      kinshipCards.forEach(card => {
        const remaining = card.limit - (card.spent || 0);
        if (remaining >= finalPrice) {
          const chat = state.chats[card.chatId];
          paymentOptions.push({
            text: `<span style="color:#ff5252;font-weight:bold;">亲属卡 - ${chat.name}</span> (剩余 ¥${remaining.toFixed(2)})`,
            value: `kinship_${card.chatId}`
          });
        }
      });

      if (paymentOptions.length === 0) {
        await showCustomAlert("竞拍成功但支付失败", "你赢了竞拍，但资金不足以支付！");
        return;
      }

      document.getElementById('custom-modal-overlay').style.zIndex = 3002;
      const method = await showChoiceModal(`竞拍成功！支付 ¥${finalPrice}`, paymentOptions);
      document.getElementById('custom-modal-overlay').style.zIndex = '';

      if (!method) {
        await showCustomAlert("交易取消", "你放弃了支付。");
        return;
      }

      let providerChatId = null;
      if (method === 'balance') {
        await processTransaction(finalPrice, 'expense', `黑市购买-${item.name}`);
      } else {
        const chatId = method.replace('kinship_', '');
        providerChatId = chatId;
        const cardIndex = wallet.kinshipCards.findIndex(c => c.chatId === chatId);
        if (cardIndex > -1) {
          wallet.kinshipCards[cardIndex].spent = (wallet.kinshipCards[cardIndex].spent || 0) + finalPrice;
          await db.userWallet.put(wallet);
          await db.userTransactions.add({ timestamp: Date.now(), type: 'expense', amount: finalPrice, description: `亲属卡黑市-${item.name}` });
        } else {
          alert("支付异常：未找到对应的亲属卡记录。");
          return;
        }
      }

      await db.inventory.add({
        name: item.name, type: 'treasure', description: item.description,
        image: item.image_prompt, acquiredPrice: finalPrice, acquiredTime: Date.now()
      });

      const giftConfirmed = await showCustomConfirm("竞拍成功！", `你已成功拍下【${item.name}】！\n\n要现在就把它作为礼物，送给某位角色吗？`, { confirmText: '🎁 立即赠送', cancelText: '放入仓库' });

      if (giftConfirmed) {
        await openAuctionGiftSelector(item, finalPrice);
      } else {
        await showCustomAlert("已入库", "物品已安全存入你的库存。");
      }

      if (providerChatId) {
        const providerChat = state.chats[providerChatId];
        if (providerChat) {
          providerChat.history.push({ role: 'system', content: `[消费通知：用户使用你的亲属卡在黑市拍卖行消费了 ¥${finalPrice}，购买了"${item.name}"。]`, timestamp: Date.now(), isHidden: true });
          await db.chats.put(providerChat);
        }
      }

      const uniqueBidders = [...new Set(auctionState.bidHistory.filter(b => b.type === 'char').map(b => b.id))];
      for (const charId of uniqueBidders) {
        if (charId === providerChatId) continue;
        const char = state.chats[charId];
        if (char) {
          char.history.push({ role: 'system', content: `[系统提示：在刚才的黑市拍卖中，用户以 ¥${finalPrice} 的价格击败了在场的竞拍者（包括你），赢得了"${item.name}"。]`, timestamp: Date.now(), isHidden: true });
          await db.chats.put(char);
        }
      }
    } else {
      if (winner.type === 'char') {
        const chat = state.chats[winner.id];
        if (chat) {
          await showCustomAlert("竞拍结束", `恭喜！您的好友【${winner.name}】以 ¥${finalPrice.toLocaleString()} 成功拍得宝物！`);
          chat.history.push({ role: 'system', content: `[系统提示：你刚刚在拍卖会上斥资 ¥${finalPrice.toLocaleString()} 拍下了"${item.name}"(${item.description})。请根据你的人设和与用户的关系，决定怎么处理这个物品。]`, timestamp: Date.now(), isHidden: true });
          await db.chats.put(chat);
          const confirmJump = await showCustomConfirm("去看看？", `${winner.name} 似乎有话对你说。`, { confirmText: "前往聊天" });
          if (confirmJump) { openChat(winner.id); triggerAiResponse(); }
        }
      } else {
        await showCustomAlert("拍卖结束", `很遗憾，被【${winner.name}】以 ¥${finalPrice.toLocaleString()} 拍走了。`);
      }
    }
  }

  async function openAuctionGiftSelector(item, price) {
    const characters = Object.values(state.chats).filter(c => !c.isGroup);
    if (characters.length === 0) return alert("没有可赠送的角色");

    const modal = document.getElementById('custom-modal-overlay');
    const titleEl = document.getElementById('custom-modal-title');
    const bodyEl = document.getElementById('custom-modal-body');
    const footerEl = document.querySelector('#custom-modal .custom-modal-footer');

    titleEl.textContent = `将"${item.name}"送给...`;
    footerEl.innerHTML = '';
    footerEl.style.flexDirection = 'row';
    footerEl.style.justifyContent = 'center';
    footerEl.style.maxHeight = '';
    footerEl.style.overflowY = '';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.color = '#666';
    cancelBtn.onclick = () => modal.classList.remove('visible');
    footerEl.appendChild(cancelBtn);

    bodyEl.innerHTML = '';
    const listContainer = document.createElement('div');
    listContainer.style.cssText = `max-height: 60vh; overflow-y: auto; display: flex; flex-direction: column; text-align: left; margin: 0 -16px; border-top: 1px solid #eee;`;

    characters.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    characters.forEach(char => {
      const row = document.createElement('div');
      row.style.cssText = `display: flex; align-items: center; padding: 12px 20px; border-bottom: 1px solid #f5f5f5; cursor: pointer; transition: background-color 0.2s;`;
      const avatar = char.settings.aiAvatar || defaultAvatar;
      row.innerHTML = `
            <img src="${avatar}" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 15px; object-fit: cover; border: 1px solid #eee;">
            <div style="flex-grow: 1;"><div style="font-weight: 500; font-size: 16px; color: var(--text-primary);">${char.name}</div></div>
            <div style="color: #ccc;">›</div>`;
      row.onclick = async () => {
        row.style.backgroundColor = '#f0f0f0';
        setTimeout(async () => { modal.classList.remove('visible'); await sendAuctionGiftToChat(char.id, item, price); }, 100);
      };
      listContainer.appendChild(row);
    });

    bodyEl.appendChild(listContainer);
    modal.classList.add('visible');
  }

  async function sendAuctionGiftToChat(chatId, item, price) {
    const chat = state.chats[chatId];
    if (!chat) return;

    let imageUrl = 'https://i.postimg.cc/Hs7BLh76/alipay.png';
    if (item.image_prompt) imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(item.image_prompt)}`;

    const giftMessage = { role: 'user', type: 'gift', timestamp: Date.now(), items: [{ name: `[稀世珍宝] ${item.name}`, price: price, imageUrl: imageUrl, quantity: 1 }], total: price, recipients: null };
    chat.history.push(giftMessage);

    const hiddenMessage = { role: 'system', content: `[系统提示：用户刚刚在黑市拍卖会上，斥巨资（¥${price.toLocaleString()}）拍下了稀世珍宝"${item.name}"并直接送给了你。物品描述：${item.description}。这是极其贵重的礼物，请根据你的人设做出强烈的反应。]`, timestamp: Date.now() + 1, isHidden: true };
    chat.history.push(hiddenMessage);

    await db.chats.put(chat);
    await showCustomAlert("赠送成功", `礼物已送达给 ${chat.name}！正在前往聊天界面...`);
    showScreen('chat-list-screen');
    setTimeout(() => { openChat(chatId); triggerAiResponse(); }, 300);
  }

  async function openInventoryModal() {
    const modal = document.getElementById('inventory-modal');
    const listEl = document.getElementById('inventory-list');
    modal.classList.add('visible');
    listEl.innerHTML = '<div class="spinner"></div>';

    try {
      const items = await db.inventory.orderBy('acquiredTime').reverse().toArray();
      listEl.innerHTML = '';
      if (items.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; color:#666; margin-top:50px;">仓库空空如也<br>快去竞拍点好东西吧</div>';
        return;
      }
      items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'inventory-item';
        let imageUrl = 'https://i.postimg.cc/Hs7BLh76/alipay.png';
        if (item.image) {
          imageUrl = (item.image.startsWith('http') || item.image.startsWith('data:')) ? item.image : `https://image.pollinations.ai/prompt/${encodeURIComponent(item.image)}`;
        }
        div.innerHTML = `<img src="${imageUrl}" class="inventory-img" loading="lazy"><div class="inventory-info"><div class="inventory-name">${item.name}</div><div class="inventory-desc">${item.description || '稀世珍宝'}</div><div class="inventory-price">入手价: ¥${(item.acquiredPrice || 0).toLocaleString()}</div></div><button class="inventory-use-btn">赠送</button>`;
        div.querySelector('.inventory-use-btn').onclick = () => handleGiftFromInventory(item);
        listEl.appendChild(div);
      });
    } catch (e) {
      console.error(e);
      listEl.innerHTML = '<div style="text-align:center; color:#ff3b30;">加载失败</div>';
    }
  }

  function closeInventoryModal() {
    document.getElementById('inventory-modal').classList.remove('visible');
  }

  async function handleGiftFromInventory(item) {
    closeInventoryModal();
    const giftItem = { name: item.name, description: item.description, image_prompt: item.image };
    await openAuctionGiftSelector(giftItem, item.acquiredPrice || 9999);
  }

  // ========== 全局暴露 ==========
  window.openAuctionScreen = openAuctionScreen;
  window.generateNewAuctionItem = generateNewAuctionItem;
  window.placeBid = placeBid;
  window.openInventoryModal = openInventoryModal;
  window.closeInventoryModal = closeInventoryModal;
  window.openAuctionGiftSelector = openAuctionGiftSelector;
