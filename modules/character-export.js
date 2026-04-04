// ============================================================
// character-export.js — 角色导出/导入（小手机专属格式）、单聊导出/导入
// 来源：script.js 第 39694 ~ 40147 行
// ============================================================


  // ========================================
  // 小手机角色完整导出/导入
  // ========================================

  /**
   * 将数据嵌入PNG的tEXt chunk中
   * @param {Blob} pngBlob - 原始PNG图片Blob
   * @param {string} key - tEXt chunk的key
   * @param {string} value - 要嵌入的数据（会被base64编码）
   * @returns {Promise<Blob>} - 嵌入数据后的PNG Blob
   */
  async function embedDataInPng(pngBlob, key, value) {
    const arrayBuffer = await pngBlob.arrayBuffer();
    const originalBytes = new Uint8Array(arrayBuffer);

    // base64编码数据
    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode(value);
    let binaryString = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binaryString += String.fromCharCode(utf8Bytes[i]);
    }
    const base64Value = btoa(binaryString);

    // 构建tEXt chunk
    const keyBytes = encoder.encode(key);
    const valueBytes = encoder.encode(base64Value);
    // tEXt chunk data = key + null separator + value
    const chunkDataLength = keyBytes.length + 1 + valueBytes.length;
    const chunkData = new Uint8Array(chunkDataLength);
    chunkData.set(keyBytes, 0);
    chunkData[keyBytes.length] = 0; // null separator
    chunkData.set(valueBytes, keyBytes.length + 1);

    // chunk type "tEXt"
    const chunkType = encoder.encode('tEXt');

    // 计算CRC32 (type + data)
    const crcInput = new Uint8Array(4 + chunkDataLength);
    crcInput.set(chunkType, 0);
    crcInput.set(chunkData, 4);
    const crc = crc32(crcInput);

    // 构建完整chunk: length(4) + type(4) + data + crc(4)
    const chunkTotal = 4 + 4 + chunkDataLength + 4;
    const chunk = new Uint8Array(chunkTotal);
    const chunkView = new DataView(chunk.buffer);
    chunkView.setUint32(0, chunkDataLength); // length
    chunk.set(chunkType, 4); // type
    chunk.set(chunkData, 8); // data
    chunkView.setUint32(4 + 4 + chunkDataLength, crc); // crc

    // 在IEND之前插入chunk
    // IEND chunk位于文件末尾，长度固定12字节 (4 length + 4 type + 0 data + 4 crc)
    const iendOffset = originalBytes.length - 12;
    const newPng = new Uint8Array(originalBytes.length + chunkTotal);
    newPng.set(originalBytes.slice(0, iendOffset), 0);
    newPng.set(chunk, iendOffset);
    newPng.set(originalBytes.slice(iendOffset), iendOffset + chunkTotal);

    return new Blob([newPng], { type: 'image/png' });
  }

  // CRC32查表法
  function crc32(data) {
    let table = crc32.table;
    if (!table) {
      table = crc32.table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /**
   * 从PNG中解析ephone格式的角色数据
   * @param {ArrayBuffer} arrayBuffer
   * @returns {Promise<{ephone: object|null, chara: object|null}>}
   */
  function parsePngForAllFormats(arrayBuffer) {
    return new Promise((resolve, reject) => {
      const view = new DataView(arrayBuffer);
      if (view.getUint32(0) !== 0x89504E47 || view.getUint32(4) !== 0x0D0A1A0A) {
        return reject(new Error("文件不是一个有效的PNG。"));
      }

      let offset = 8;
      const decoder = new TextDecoder();
      let ephoneData = null;
      let charaData = null;

      while (offset < view.byteLength) {
        const length = view.getUint32(offset);
        const type = decoder.decode(arrayBuffer.slice(offset + 4, offset + 8));

        if (type === 'tEXt') {
          const data = new Uint8Array(arrayBuffer, offset + 8, length);
          const nullSeparatorIndex = data.indexOf(0);
          if (nullSeparatorIndex !== -1) {
            const key = decoder.decode(data.slice(0, nullSeparatorIndex));
            const value = decoder.decode(data.slice(nullSeparatorIndex + 1));

            if (key === 'ephone') {
              try {
                const binaryString = atob(value);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                const decodedData = new TextDecoder('utf-8').decode(bytes);
                ephoneData = JSON.parse(decodedData);
              } catch (e) {
                console.error("解析ephone数据失败:", e);
              }
            }

            if (key === 'chara') {
              try {
                const binaryString = atob(value);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                const decodedData = new TextDecoder('utf-8').decode(bytes);
                charaData = JSON.parse(decodedData);
              } catch (e) {
                console.error("解析chara数据失败:", e);
              }
            }
          }
        }

        offset += 4 + 4 + length + 4;
      }

      resolve({ ephone: ephoneData, chara: charaData });
    });
  }

  /**
   * 导出角色完整数据（小手机专属格式）
   */
  async function exportCharacterFull() {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    if (!chat || chat.isGroup) {
      await showCustomAlert('提示', '仅支持导出单聊角色。');
      return;
    }

    try {
      // 询问是否包含聊天记录
      const includeHistory = await showCustomConfirm(
        '导出角色',
        '是否要将聊天记录一起导出？\n\n选择"确定"将包含聊天记录，选择"取消"则仅导出角色数据。',
        { confirmText: '包含聊天记录', cancelText: '不包含' }
      );

      // 收集关联的世界书
      const linkedWorldBooks = [];
      if (chat.settings.linkedWorldBookIds && chat.settings.linkedWorldBookIds.length > 0) {
        for (const wbId of chat.settings.linkedWorldBookIds) {
          const wb = state.worldBooks.find(b => b.id === wbId);
          if (wb) linkedWorldBooks.push(wb);
        }
      }

      // 收集关联的memories
      const charMemories = await db.memories.where('chatId').equals(chat.id).toArray();

      // 收集关联的通话记录
      const charCallRecords = await db.callRecords.where('chatId').equals(chat.id).toArray();

      // 深拷贝chat数据
      const chatDataCopy = JSON.parse(JSON.stringify(chat));

      // 方案3：导出时移除API历史记录
      if (chatDataCopy.apiHistory) {
        delete chatDataCopy.apiHistory;
      }

      // 如果不包含聊天记录，清空history
      if (!includeHistory) {
        chatDataCopy.history = [];
      }

      const exportData = {
        type: 'EPhoneCharacterExport',
        version: 1,
        timestamp: Date.now(),
        appName: '小手机',
        chatData: chatDataCopy,
        worldBooks: linkedWorldBooks,
        memories: charMemories,
        callRecords: charCallRecords,
        includesHistory: !!includeHistory
      };

      // 询问导出格式
      const formatOptions = [
        { text: 'PNG 角色卡 (带头像图片)', value: 'png' },
        { text: ' JSON 文件', value: 'json' }
      ];
      const format = await showChoiceModal('选择导出格式', formatOptions);
      if (format === null) return;

      const safeName = chat.name.replace(/[\\/:*?"<>|]/g, '_');
      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `EPhone-Char-${safeName}-${dateStr}.json`;
        link.click();
        URL.revokeObjectURL(url);
      } else if (format === 'png') {
        // 获取角色头像作为PNG底图
        let avatarSrc = chat.settings.aiAvatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';

        // 将头像转为PNG Blob
        const pngBlob = await avatarToPngBlob(avatarSrc);

        // 嵌入ephone数据到PNG
        const jsonStr = JSON.stringify(exportData);
        const finalBlob = await embedDataInPng(pngBlob, 'ephone', jsonStr);

        const url = URL.createObjectURL(finalBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `EPhone-Char-${safeName}-${dateStr}.png`;
        link.click();
        URL.revokeObjectURL(url);
      }

      let msg = `角色 "${chat.name}" 已成功导出！`;
      if (linkedWorldBooks.length > 0) msg += `\n包含 ${linkedWorldBooks.length} 个关联世界书。`;
      if (includeHistory) msg += `\n包含 ${chatDataCopy.history.length} 条聊天记录。`;
      if (charMemories.length > 0) msg += `\n包含 ${charMemories.length} 条记忆数据。`;
      await showCustomAlert('导出成功', msg);

    } catch (error) {
      console.error("导出角色时出错:", error);
      await showCustomAlert('导出失败', `发生了一个错误: ${error.message}`);
    }
  }

  /**
   * 将头像（base64或URL）转为PNG Blob
   */
  async function avatarToPngBlob(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 512;
        canvas.height = img.naturalHeight || img.height || 512;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob 失败'));
        }, 'image/png');
      };
      img.onerror = () => reject(new Error('头像图片加载失败'));
      img.src = src;
    });
  }

  /**
   * 导入小手机专属角色数据
   */
  async function importEPhoneCharacter(exportData, avatarBase64FromPng = null, silent = false) {
    if (!exportData || exportData.type !== 'EPhoneCharacterExport') {
      throw new Error("无效的小手机角色导出数据。");
    }

    const chatData = exportData.chatData;
    if (!chatData || !chatData.name) {
      throw new Error("角色数据无效或缺少名称。");
    }

    // 生成新的chatId
    const newChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    // 先处理世界书：创建新的世界书并建立ID映射
    const worldBookIdMap = {}; // oldId -> newId
    if (exportData.worldBooks && exportData.worldBooks.length > 0) {
      for (const wb of exportData.worldBooks) {
        const newWbId = 'wb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const newWb = JSON.parse(JSON.stringify(wb));
        const oldId = newWb.id;
        newWb.id = newWbId;
        await db.worldBooks.add(newWb);
        state.worldBooks.push(newWb);
        worldBookIdMap[oldId] = newWbId;
      }
    }

    // 更新chatData的ID和世界书关联
    chatData.id = newChatId;
    if (chatData.settings && chatData.settings.linkedWorldBookIds) {
      chatData.settings.linkedWorldBookIds = chatData.settings.linkedWorldBookIds.map(
        oldId => worldBookIdMap[oldId] || oldId
      );
    }

    // 如果PNG导入带了头像，用PNG的头像覆盖（因为PNG本身就是头像图片）
    if (avatarBase64FromPng) {
      chatData.settings.aiAvatar = avatarBase64FromPng;
    }

    // 保存角色
    await db.chats.put(chatData);
    state.chats[newChatId] = chatData;

    // 导入memories
    if (exportData.memories && exportData.memories.length > 0) {
      for (const mem of exportData.memories) {
        const newMem = JSON.parse(JSON.stringify(mem));
        delete newMem.id; // 让数据库自动生成新ID
        newMem.chatId = newChatId;
        await db.memories.add(newMem);
      }
    }

    // 导入通话记录
    if (exportData.callRecords && exportData.callRecords.length > 0) {
      for (const rec of exportData.callRecords) {
        const newRec = JSON.parse(JSON.stringify(rec));
        delete newRec.id;
        newRec.chatId = newChatId;
        await db.callRecords.add(newRec);
      }
    }

    renderChatList();

    if (!silent) {
      let msg = `角色 "${chatData.name}" 已成功导入！`;
      if (Object.keys(worldBookIdMap).length > 0) {
        msg += `\n已自动创建并关联 ${Object.keys(worldBookIdMap).length} 个世界书。`;
      }
      if (exportData.includesHistory && chatData.history && chatData.history.length > 0) {
        msg += `\n已导入 ${chatData.history.length} 条聊天记录。`;
      }
      if (exportData.memories && exportData.memories.length > 0) {
        msg += `\n已导入 ${exportData.memories.length} 条记忆数据。`;
      }
      await showCustomAlert('导入成功！', msg);
    }
  }

  async function exportSingleChat() {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    if (!chat) return;

    try {
      // 方案3：导出时移除API历史记录
      const chatDataCopy = { ...chat };
      if (chatDataCopy.apiHistory) {
        delete chatDataCopy.apiHistory;
      }

      const backupData = {
        type: 'EPhoneSingleChat',
        version: 1,
        chatData: chatDataCopy
      };

      const blob = new Blob(
        [JSON.stringify(backupData, null, 2)], {
        type: 'application/json'
      }
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      link.download = `EPhone-Chat-${chat.name}-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);

      await showCustomAlert('导出成功', `与"${chat.name}"的聊天记录已成功导出！`);

    } catch (error) {
      console.error("导出单个聊天时出错:", error);
      await showCustomAlert('导出失败', `发生了一个错误: ${error.message}`);
    }
  }


  async function importSingleChat(file) {
    if (!file || !state.activeChatId) return;
    const currentChatId = state.activeChatId;
    const currentChat = state.chats[currentChatId];

    try {
      const text = await file.text();
      const data = JSON.parse(text);


      if (data.type !== 'EPhoneSingleChat' || !data.chatData) {
        throw new Error("文件格式不正确，这不是一个有效的单聊备份文件。");
      }


      const confirmed = await showCustomConfirm(
        '严重警告！',
        `这将用备份文件中的数据【完全覆盖】当前与"${currentChat.name}"的聊天记录和设置。此操作不可撤销！<br><br><strong>确定要继续吗？</strong>`, {
        confirmButtonClass: 'btn-danger',
        confirmText: '确认覆盖'
      }
      );

      if (!confirmed) return;


      const importedChatData = data.chatData;


      importedChatData.id = currentChatId;


      await db.chats.put(importedChatData);
      state.chats[currentChatId] = importedChatData;


      await showCustomAlert('导入成功', '聊天记录已成功覆盖！正在刷新界面...');


      renderChatInterface(currentChatId);
      renderChatList();
      document.getElementById('chat-settings-btn').click();

    } catch (error) {
      console.error("导入单个聊天时出错:", error);
      await showCustomAlert('导入失败', `文件解析或应用失败: ${error.message}`);
    }
  }

  // ========== 全局暴露 ==========
  window.exportCharacterFull = exportCharacterFull;
  window.exportSingleChat = exportSingleChat;
  window.importSingleChat = importSingleChat;
