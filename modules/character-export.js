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
        { text: '小手机专属 PNG 角色卡', value: 'ephone_png' },
        { text: '小手机专属 JSON 文件', value: 'ephone_json' },
        { text: '酒馆格式(Tavern) PNG', value: 'tavern_png' },
        { text: '酒馆格式(Tavern) JSON', value: 'tavern_json' }
      ];
      const format = await showChoiceModal('选择导出格式', formatOptions);
      if (format === null) return;

      const safeName = chat.name.replace(/[\\/:*?"<>|]/g, '_');
      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'ephone_json') {
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `EPhone-Char-${safeName}-${dateStr}.json`;
        link.click();
        URL.revokeObjectURL(url);
      } else if (format === 'ephone_png') {
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
      } else if (format === 'tavern_json' || format === 'tavern_png') {
        // 构建 Tavern V2 格式角色卡
        let tavernBookEntries = [];
        if (linkedWorldBooks.length > 0) {
          let entryId = 1;
          for (const wb of linkedWorldBooks) {
            if (wb.content && Array.isArray(wb.content)) {
              for (const entry of wb.content) {
                if (entry.enabled) {
                  tavernBookEntries.push({
                    keys: entry.keys || [],
                    content: entry.content || '',
                    extensions: {},
                    enabled: true,
                    insertion_order: 50,
                    case_sensitive: false,
                    name: `entry_${entryId}`,
                    priority: 10,
                    id: entryId,
                    comment: entry.comment || '',
                    selective: true,
                    secondary_keys: [],
                    constant: false,
                    position: "before_char"
                  });
                  entryId++;
                }
              }
            }
          }
        }

        const tavernData = {
          spec: "chara_card_v2",
          spec_version: "2.0",
          data: {
            name: chat.name || '',
            description: chat.settings?.aiPersona || '',
            personality: "",
            scenario: "",
            first_mes: "",
            mes_example: "",
            creator_notes: "",
            system_prompt: "",
            post_history_instructions: "",
            tags: [],
            creator: "",
            character_version: "",
            alternate_greetings: [],
            extensions: {}
          }
        };

        if (tavernBookEntries.length > 0) {
          tavernData.data.character_book = {
            name: `${chat.name}的设定集`,
            description: "",
            scan_depth: 50,
            token_budget: 500,
            recursive_scanning: false,
            extensions: {},
            entries: tavernBookEntries
          };
        }

        if (format === 'tavern_json') {
          const blob = new Blob([JSON.stringify(tavernData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${safeName}.json`;
          link.click();
          URL.revokeObjectURL(url);
        } else if (format === 'tavern_png') {
          let avatarSrc = chat.settings.aiAvatar || 'https://i.postimg.cc/y8xWzCqj/anime-boy.jpg';
          const pngBlob = await avatarToPngBlob(avatarSrc);
          
          const jsonStr = JSON.stringify(tavernData);
          // 嵌入chara数据到PNG（酒馆格式）
          const finalBlob = await embedDataInPng(pngBlob, 'chara', jsonStr);

          const url = URL.createObjectURL(finalBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${safeName}.png`;
          link.click();
          URL.revokeObjectURL(url);
        }
      }

      let msg = `角色 "${chat.name}" 已成功导出！`;
      if (format.startsWith('ephone_')) {
        if (linkedWorldBooks.length > 0) msg += `\n包含 ${linkedWorldBooks.length} 个关联世界书。`;
        if (includeHistory) msg += `\n包含 ${chatDataCopy.history.length} 条聊天记录。`;
        if (charMemories.length > 0) msg += `\n包含 ${charMemories.length} 条记忆数据。`;
      } else {
        msg += `\n已导出为兼容酒馆(Tavern)格式的角色卡。`;
        if (linkedWorldBooks.length > 0) msg += `\n包含 ${linkedWorldBooks.length} 个关联世界书的设定。`;
      }
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
      const formatOptions = [
        { text: '完整备份 (JSON)', value: 'json' },
        { text: '纯文本记录 (TXT)', value: 'txt' },
        { text: '纪念信件 (HTML)', value: 'html' }
      ];
      const format = await showChoiceModal('选择导出格式', formatOptions);
      if (!format) return;

      const safeName = chat.name.replace(/[\\/:*?"<>|]/g, '_');
      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'json') {
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

        link.download = `EPhone-Chat-${safeName}-${dateStr}.json`;
        link.click();
        URL.revokeObjectURL(url);
      } else if (format === 'txt') {
        let txtContent = `【与 ${chat.name} 的聊天记录】\n【导出时间：${new Date().toLocaleString()}】\n\n`;
        
        if (chat.history && chat.history.length > 0) {
          for (const msg of chat.history) {
            const role = msg.role === 'user' ? '我' : chat.name;
            const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
            txtContent += `${role} [${time}]\n${msg.content}\n\n`;
          }
        } else {
          txtContent += "暂无聊天记录。\n";
        }
        
        const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${safeName}的聊天记录_${dateStr}.txt`;
        link.click();
        URL.revokeObjectURL(url);
      } else if (format === 'html') {
        let htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>与 ${chat.name} 的纪念信件</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; transition: background-color 0.3s ease; min-height: 100vh; }
  
  /* 顶部控制台 */
  .control-panel {
    position: fixed; top: 0; left: 0; right: 0; background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 15px 20px; z-index: 1000;
    display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 20px; backdrop-filter: blur(5px);
  }
  .control-group { display: flex; align-items: center; gap: 10px; }
  .control-group label { font-size: 14px; color: #333; font-weight: bold; }
  select, input { padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; outline: none; }
  input:focus, select:focus { border-color: #007aff; }

  #main-content { margin-top: 80px; padding: 20px; }
  .highlight { background-color: yellow; color: black; font-weight: bold; border-radius: 2px; padding: 0 2px; }

  /* 默认头像占位 */
  .avatar {
    width: 40px; height: 40px; border-radius: 50%; display: flex; justify-content: center; align-items: center;
    font-weight: bold; color: #fff; flex-shrink: 0; font-size: 16px;
  }

  /* 主题 1: 现代气泡 (Modern Chat) */
  body.theme-modern { background-color: #f0f2f5; color: #000; }
  .theme-modern .chat-container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .theme-modern .header { text-align: center; margin-bottom: 30px; padding: 10px; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);}
  .theme-modern .title { font-size: 20px; font-weight: bold; margin: 0 0 5px 0; }
  .theme-modern .subtitle { font-size: 12px; color: #888; }
  .theme-modern .message { display: flex; flex-direction: column; margin-bottom: 20px; }
  .theme-modern .user-msg { align-items: flex-end; }
  .theme-modern .ai-msg { align-items: flex-start; }
  .theme-modern .meta { font-size: 12px; color: #888; margin-bottom: 4px; }
  .theme-modern .content { font-size: 16px; white-space: pre-wrap; padding: 12px 16px; border-radius: 18px; max-width: 80%; line-height: 1.5; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
  .theme-modern .user-msg .content { background-color: #95ec69; color: #000; border-top-right-radius: 4px; }
  .theme-modern .ai-msg .content { background-color: #ffffff; color: #000; border-top-left-radius: 4px; }
  .theme-modern .avatar-container { display: none; }

  /* 主题 2: 复古信笺 (Classic Letter) */
  body.theme-letter { background-color: #f4e8d3; color: #4a3c31; font-family: "KaiTi", "楷体", STKaiti, serif; }
  .theme-letter .chat-container { max-width: 800px; margin: 0 auto; background: #fbf5eb; padding: 60px 50px; border-radius: 4px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); position: relative; border: 1px solid #e2d1b3; }
  .theme-letter .chat-container::before { content: ''; position: absolute; top: 20px; left: 20px; right: 20px; bottom: 20px; border: 1px solid #e8dac1; pointer-events: none; }
  .theme-letter .header { text-align: center; margin-bottom: 50px; border-bottom: 2px dashed #d5c4a1; padding-bottom: 20px; }
  .theme-letter .title { font-size: 32px; font-weight: normal; margin: 0 0 10px 0; letter-spacing: 2px; }
  .theme-letter .subtitle { font-size: 16px; color: #8c7a6b; }
  .theme-letter .message { margin-bottom: 25px; position: relative; z-index: 1; }
  .theme-letter .meta { font-size: 14px; color: #8c7a6b; margin-bottom: 5px; border-bottom: 1px solid #efe4ce; display: inline-block; padding-bottom: 2px; }
  .theme-letter .content { font-size: 18px; white-space: pre-wrap; padding: 10px 15px; background: rgba(255,255,255,0.4); border-radius: 8px; margin-top: 5px; line-height: 1.8;}
  .theme-letter .user-msg .content { background: rgba(220, 234, 240, 0.4); }
  .theme-letter .user-msg .meta { color: #5c6b73; border-bottom-color: #d1dbe0; }
  .theme-letter .avatar-container { display: none; }

  /* 主题 3: 微信 (WeChat) */
  body.theme-wechat { background-color: #EDEDED; color: #000; }
  .theme-wechat .chat-container { max-width: 600px; margin: 0 auto; background: #EDEDED; padding: 10px 0;}
  .theme-wechat .header { text-align: center; margin-bottom: 20px; padding: 15px; background: #EDEDED; border-bottom: 1px solid #D5D5D5;}
  .theme-wechat .title { font-size: 17px; font-weight: bold; margin: 0; }
  .theme-wechat .subtitle { font-size: 12px; color: #b2b2b2; margin-top: 5px; }
  .theme-wechat .message { display: flex; margin-bottom: 20px; padding: 0 15px; }
  .theme-wechat .user-msg { flex-direction: row-reverse; }
  .theme-wechat .ai-msg { flex-direction: row; }
  .theme-wechat .avatar-container { display: block; margin: 0 10px; }
  .theme-wechat .msg-body { max-width: 70%; display: flex; flex-direction: column; }
  .theme-wechat .user-msg .msg-body { align-items: flex-end; }
  .theme-wechat .ai-msg .msg-body { align-items: flex-start; }
  .theme-wechat .meta { display: none; }
  .theme-wechat .content { font-size: 16px; white-space: pre-wrap; padding: 10px 14px; border-radius: 8px; line-height: 1.5; position: relative; }
  .theme-wechat .user-msg .content { background-color: #95ec69; color: #000; }
  .theme-wechat .ai-msg .content { background-color: #ffffff; color: #000; }
  .theme-wechat .ai-msg .content::before { content: ''; position: absolute; top: 14px; left: -10px; border: 5px solid transparent; border-right-color: #ffffff; }
  .theme-wechat .user-msg .content::after { content: ''; position: absolute; top: 14px; right: -10px; border: 5px solid transparent; border-left-color: #95ec69; }

  /* 主题 4: 古早 Windows (Win98) */
  body.theme-win98 { background-color: #008080; color: #000; font-family: "Tahoma", "宋体", sans-serif; }
  .theme-win98 .control-panel { background: #c0c0c0; border-bottom: 2px solid #fff; box-shadow: inset 0 -2px #808080; }
  .theme-win98 .chat-container { max-width: 700px; margin: 0 auto; background: #c0c0c0; padding: 2px; border-top: 2px solid #fff; border-left: 2px solid #fff; border-right: 2px solid #000; border-bottom: 2px solid #000; }
  .theme-win98 .header { background: #000080; color: #fff; padding: 5px 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }
  .theme-win98 .title { font-size: 14px; font-weight: bold; margin: 0; }
  .theme-win98 .subtitle { font-size: 12px; }
  .theme-win98 #message-list { padding: 10px; background: #fff; border: 2px inset #fff; height: 100%; min-height: 400px; }
  .theme-win98 .message { margin-bottom: 15px; border-bottom: 1px dashed #c0c0c0; padding-bottom: 10px; }
  .theme-win98 .meta { font-size: 12px; color: #000080; font-weight: bold; margin-bottom: 5px; }
  .theme-win98 .content { font-size: 14px; white-space: pre-wrap; color: #000; }
  .theme-win98 .user-msg .meta { color: #800080; }
  .theme-win98 .avatar-container { display: none; }
  .theme-win98 .highlight { background-color: #000080; color: #fff; }
</style>
</head>
<body class="theme-modern">
  <div class="control-panel">
    <div class="control-group">
      <label for="themeSelect">选择主题：</label>
      <select id="themeSelect">
        <option value="theme-modern">现代气泡</option>
        <option value="theme-wechat">微信 (WeChat)</option>
        <option value="theme-letter">复古信笺</option>
        <option value="theme-win98">古早 Windows</option>
      </select>
    </div>
    <div class="control-group">
      <label for="searchInput">🔍 搜索记录：</label>
      <input type="text" id="searchInput" placeholder="发件人、日期或内容..." autocomplete="off">
    </div>
  </div>

  <div id="main-content">
    <div class="chat-container">
      <div class="header">
        <h1 class="title">与 ${chat.name} 的聊天记录</h1>
        <div class="subtitle">导出时间：${new Date().toLocaleString()}</div>
      </div>
      <div id="message-list">
`;
        if (chat.history && chat.history.length > 0) {
          const aiInitial = chat.name ? chat.name.charAt(0) : 'A';
          for (const msg of chat.history) {
            const isUser = msg.role === 'user';
            const role = isUser ? '我' : chat.name;
            const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
            const msgClass = isUser ? 'message user-msg' : 'message ai-msg';
            
            // 头像颜色稍微区分
            const avatarBg = isUser ? '#7bed9f' : '#ff6b81';
            const initial = isUser ? '我' : aiInitial;
            const rawText = msg.content.replace(/"/g, '"').replace(/</g, '<').replace(/>/g, '>');

            htmlContent += `
        <div class="${msgClass}" data-text="${rawText}" data-meta="${role} · ${time}">
          <div class="avatar-container"><div class="avatar" style="background:${avatarBg};">${initial}</div></div>
          <div class="msg-body">
            <div class="meta">${role} · ${time}</div>
            <div class="content">${msg.content}</div>
          </div>
        </div>`;
          }
        } else {
          htmlContent += `        <div style="text-align: center; color: #888; margin-top: 50px;">暂无聊天记录</div>\n`;
        }
        
        htmlContent += `
      </div>
    </div>
  </div>

  <script>
    // 主题切换
    document.getElementById('themeSelect').addEventListener('change', (e) => {
      document.body.className = e.target.value;
    });

    // 搜索过滤与高亮
    const searchInput = document.getElementById('searchInput');
    const messages = document.querySelectorAll('.message');

    function highlightText(text, keyword) {
      if (!keyword) return text;
      const escapedKeyword = keyword.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
      const regex = new RegExp('(' + escapedKeyword + ')', 'gi');
      return text.replace(regex, '<span class="highlight">$1</span>');
    }

    searchInput.addEventListener('input', (e) => {
      const keyword = e.target.value.trim().toLowerCase();
      messages.forEach(msg => {
        const rawContent = msg.getAttribute('data-text');
        const rawMeta = msg.getAttribute('data-meta');
        const contentEl = msg.querySelector('.content');
        const metaEl = msg.querySelector('.meta');

        const isMatch = rawContent.toLowerCase().includes(keyword) || rawMeta.toLowerCase().includes(keyword);
        if (isMatch) {
          msg.style.display = '';
          if (keyword) {
            contentEl.innerHTML = highlightText(rawContent, keyword);
            metaEl.innerHTML = highlightText(rawMeta, keyword);
          } else {
            contentEl.textContent = rawContent;
            metaEl.textContent = rawMeta;
          }
        } else {
          msg.style.display = 'none';
        }
      });
    });
  </script>
</body>
</html>`;

        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `致_${safeName}_的纪念信件_${dateStr}.html`;
        link.click();
        URL.revokeObjectURL(url);
      }

      let formatName = '完整备份';
      if (format === 'txt') formatName = 'TXT文本';
      if (format === 'html') formatName = '纪念信件';
      await showCustomAlert('导出成功', `与"${chat.name}"的聊天记录已成功导出为 ${formatName}！`);

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
