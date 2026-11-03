  function parsePngForTavernData(arrayBuffer) {
    return new Promise((resolve, reject) => {
      const view = new DataView(arrayBuffer);

      if (view.getUint32(0) !== 0x89504E47 || view.getUint32(4) !== 0x0D0A1A0A) {
        return reject(new Error("文件不是一个有效的PNG。"));
      }

      let offset = 8;
      const decoder = new TextDecoder();

      while (offset < view.byteLength) {
        const length = view.getUint32(offset);
        const type = decoder.decode(arrayBuffer.slice(offset + 4, offset + 8));

        if (type === 'tEXt') {
          const data = new Uint8Array(arrayBuffer, offset + 8, length);
          const nullSeparatorIndex = data.indexOf(0);
          if (nullSeparatorIndex !== -1) {
            const key = decoder.decode(data.slice(0, nullSeparatorIndex));
            if (key === 'chara') {
              const value = decoder.decode(data.slice(nullSeparatorIndex + 1));
              try {





                const binaryString = atob(value);


                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }



                const decodedData = new TextDecoder('utf-8').decode(bytes);



                resolve(JSON.parse(decodedData));
                return;
              } catch (e) {
                return reject(new Error("在PNG中找到角色数据，但解码或解析失败。错误: " + e.message));
              }
            }
          }
        }


        offset += 4 + 4 + length + 4;
      }

      reject(new Error("在PNG文件中未找到有效的Tavern AI角色数据(chara chunk)。"));
    });
  }





  function findWorldBookEntries(cardData) {




    if (cardData.data?.character_book?.entries?.length > 0) {
      console.log("诊断：在 data.character_book 中找到世界书。");
      return cardData.data.character_book.entries;
    }


    if (cardData.extensions?.character_book?.entries?.length > 0) {
      console.log("诊断：在 extensions.character_book 中找到世界书。");
      return cardData.extensions.character_book.entries;
    }


    if (cardData.data?.extensions?.character_book?.entries?.length > 0) {
      console.log("诊断：在 data.extensions.character_book 中找到世界书。");
      return cardData.data.extensions.character_book.entries;
    }


    const possibleTopLevelKeys = ['character_book', 'lorebook', 'world_info', 'char_book'];
    for (const key of possibleTopLevelKeys) {
      if (cardData[key]?.entries?.length > 0) {
        console.log(`诊断：在顶层 ${key} 中找到世界书。`);
        return cardData[key].entries;
      }
    }

    console.log("诊断：未在此角色卡中找到任何有效的世界书数据。");
    return null;
  }

  async function createChatFromCardData(cardData, avatarBase64 = null) {
    const effectiveCardData = cardData.data || cardData;
    if (!effectiveCardData.name) {
      throw new Error("角色卡数据无效或缺少'name'字段。");
    }


    let worldBookIdToLink = null;
    const worldBookEntries = findWorldBookEntries(cardData);

    if (worldBookEntries) {
      const structuredEntries = worldBookEntries
        .filter(entry => entry && typeof entry.content === 'string')
        .map(entry => ({
          keys: entry.keys || [],
          comment: entry.comment || '',
          content: entry.content.replace(/<memory>|<\/memory>/g, '').trim(),
          // 关闭的条目也必须导入，只是不参与上下文注入。
          // enabled 缺省时按开启处理，并兼容使用 disable 的旧格式。
          enabled: typeof entry.enabled === 'boolean'
            ? entry.enabled
            : entry.disable !== true
        }))
        .filter(entry => entry.content);

      if (structuredEntries.length > 0) {
        const newWorldBook = {
          id: 'wb_' + Date.now(),
          name: `${effectiveCardData.name}的设定集`,
          content: structuredEntries,
          categoryId: null
        };
        await db.worldBooks.add(newWorldBook);
        state.worldBooks.push(newWorldBook);
        worldBookIdToLink = newWorldBook.id;
      }
    }


    let alternateGreetings = [];

    if (Array.isArray(effectiveCardData.alternate_greetings)) {
      alternateGreetings = effectiveCardData.alternate_greetings;
    }

    else if (Array.isArray(cardData.alternate_greetings)) {
      alternateGreetings = cardData.alternate_greetings;
    }


    alternateGreetings = alternateGreetings.filter(g => g && typeof g === 'string' && g.trim() !== '');


    const firstGreeting = effectiveCardData.first_mes || cardData.first_mes;


    if (firstGreeting && typeof firstGreeting === 'string' && firstGreeting.trim() !== '') {
      if (!alternateGreetings.includes(firstGreeting)) {
        alternateGreetings.unshift(firstGreeting);
      }
    }


    let description = effectiveCardData.description || cardData.description || '无';
    description = description
      .replace(/```yaml/g, '').replace(/```/g, '')
      .replace(/<\/?info>/g, '').replace(/<\/?character>/g, '')
      .replace(/<\/?writing_rule>/g, '').replace(/\[OOC：.*?\]/g, '').trim();

    let persona = `# 角色核心设定\n${description}\n\n`;
    if (effectiveCardData.personality) persona += `# 性格补充\n${effectiveCardData.personality}\n\n`;
    if (effectiveCardData.scenario) persona += `# 场景设定\n${effectiveCardData.scenario}\n\n`;
    if (effectiveCardData.mes_example) persona += `# 对话示例\n${effectiveCardData.mes_example}\n\n`;

    const remarkName = effectiveCardData.name;
    const originalName = effectiveCardData.name;

    const newChatId = 'chat_' + Date.now();


    const newChat = {
      id: newChatId,
      name: remarkName.trim(),
      originalName: originalName.trim(),
      isGroup: false,
      relationship: {
        status: 'friend'
      },
      status: {
        text: '在线',
        lastUpdate: Date.now(),
        isBusy: false
      },
      settings: {
        aiPersona: persona,
        myPersona: '我是谁呀。',
        maxMemory: 10,
        aiAvatar: defaultAvatar,
        myAvatar: defaultAvatar,
        background: '',
        theme: 'default',
        fontSize: 13,
        customCss: '',
        linkedWorldBookIds: worldBookIdToLink ? [worldBookIdToLink] : [],
        aiAvatarLibrary: [],


        alternateGreetings: alternateGreetings,
        myPhoneLockScreenEnabled: false,
        myPhoneLockScreenPassword: '',
        userStatus: {
          text: '在线',
          lastUpdate: Date.now(),
          isBusy: false
        }
      },
      history: [],
      musicData: {
        totalTime: 0
      },
      longTermMemory: []
    };


    if (avatarBase64) {
      newChat.settings.aiAvatar = avatarBase64;
      newChat.settings.aiAvatarLibrary.push({
        name: '默认头像',
        url: avatarBase64
      });
    }


    if (firstGreeting && typeof firstGreeting === 'string') {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = firstGreeting;
      const cleanGreeting = (tempDiv.textContent || tempDiv.innerText || "").replace(/原作者.*?开局/s, '').trim();

      if (cleanGreeting) {
        newChat.history.push({
          role: 'assistant',
          senderName: newChat.originalName,
          content: cleanGreeting,
          timestamp: Date.now()
        });
      }
    }


    window.applyDefaultChatSettings?.(newChat);
    state.chats[newChatId] = newChat;
    await db.chats.put(newChat);
    renderChatList();

    let successMessage = `角色 "${newChat.name}" 已成功导入！`;
    if (worldBookIdToLink) {
      successMessage += `\n\n其专属的"世界书"也已自动创建并关联。`;
    }
    if (alternateGreetings.length > 1) {
      successMessage += `\n\n检测到 ${alternateGreetings.length} 条开场白，可在"聊天设置"中切换。`;
    }
    await showCustomAlert('导入成功！', successMessage);
  }




  async function handleSwitchGreeting() {
    console.log("点击了切换开场按钮");

    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];

    const greetings = chat.settings?.alternateGreetings || [];

    if (greetings.length === 0) {
      alert("未检测到可用的候补开场白数据。\n请确认您已使用修复后的代码重新导入了角色卡。");
      return;
    }


    const options = greetings.map((text, index) => {

      const safeText = String(text || "");
      const preview = safeText.replace(/<[^>]*>/g, '').trim().substring(0, 20);
      return {
        text: `📜 开场 ${index + 1}: ${preview}...`,
        value: index
      };
    });


    const selectedIndex = await showChoiceModal('选择一个开场白', options);


    if (selectedIndex !== null) {
      const confirmed = await showCustomConfirm(
        '⚠️ 警告：确认切换？',
        '切换开场白将会【清空并替换】当前所有的聊天记录，就像重新开始一样。\n\n确定要继续吗？', {
        confirmButtonClass: 'btn-danger',
        confirmText: '确定切换'
      }
      );

      if (confirmed) {
        const newGreetingText = greetings[selectedIndex];


        const newMessage = {
          role: 'assistant',
          senderName: chat.originalName,
          content: newGreetingText,
          timestamp: Date.now()
        };

        chat.history = [newMessage];


        await db.chats.put(chat);


        renderChatInterface(chat.id);

        await showCustomAlert('成功', '已切换到新的开场故事！\n点击左上角返回即可开始对话。');
      }
    }
  }

  // ========== 全局暴露 ==========
  window.handleCardImport = handleCardImport;
  window.handleCharacterFileImport = handleCharacterFileImport;
  window.handleSwitchGreeting = handleSwitchGreeting;
  window.cancelBatchImport = cancelBatchImport;
  window.confirmBatchImport = confirmBatchImport;
