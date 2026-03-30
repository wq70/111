// ============================================================
// CPhone 角色手机模块
// 来源：script.js 第 41385 ~ 46303 行
// 功能：CPhone 角色手机全部功能
//       renderCharacterSelector、switchToCharacterPhone、
//       renderCharHomeScreen、openCharApp、各 App 渲染、
//       所有 handleGenerate* 函数、角色音乐播放器、
//       setupCPhonePagination、窥屏记录等
// ============================================================

  // openCharacterSelector 来源：script.js 第 40148~40151 行
  function openCharacterSelector() {
    renderCharacterSelector();
    showScreen('character-selection-screen');
  }

  function renderCharacterSelector() {
    const gridEl = document.getElementById('character-grid');
    gridEl.innerHTML = '';


    const characters = Object.values(state.chats).filter(chat => !chat.isGroup);

    if (characters.length === 0) {
      gridEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">还没有可以查看手机的角色哦~</p>';
      return;
    }

    characters.forEach(char => {
      const item = document.createElement('div');
      item.className = 'character-select-item';
      item.innerHTML = `
            <img src="${char.settings.aiAvatar || defaultAvatar}" class="avatar">
            <span class="name">${char.name}</span>
        `;
      item.addEventListener('click', () => switchToCharacterPhone(char.id));
      gridEl.appendChild(item);
    });
  }



  async function switchToCharacterPhone(characterId) {
    activeCharacterId = characterId;
    console.log(`已切换到角色 ${characterId} 的手机`);


    applyCPhoneWallpaper();
    applyCPhoneAppIcons();
    applyMyPhoneWallpaper();
    applyMyPhoneAppIconsGlobal();


    renderCharHomeScreen();
    showScreen('character-phone-screen');

    // 初始化 CPhone 翻页功能
    setTimeout(() => {
      setupCPhonePagination();
    }, 100);
  }



  function switchToMyPhone() {
    activeCharacterId = null;
    console.log("已返回我的手机");
    showScreen('home-screen');
  }


  function renderCharHomeScreen() {
    // 新布局不需要在这里更新大时钟了
    switchToCharScreen('char-home-screen');
    // 纪念日天数按日期实时更新
    if (typeof window.updateAnniversaryDayCount === 'function') {
      window.updateAnniversaryDayCount();
    }
  }

  // ==========================================
  // 纪念日天数：根据 p3-circle-date 实时计算并更新 p3-day-count
  // ==========================================
  window.updateAnniversaryDayCount = function () {
    const dateEl = document.getElementById('p3-circle-date');
    const countEl = document.getElementById('p3-day-count');
    if (!dateEl || !countEl) return;
    const raw = (dateEl.textContent || dateEl.innerText || '').trim().replace(/\s/g, '');
    if (!raw) return;
    // 支持 2025.3.14 / 2025.03.14 / 2025-03-14
    const parts = raw.split(/[.\-/]/).map(p => parseInt(p, 10)).filter(n => !isNaN(n));
    if (parts.length < 3) return;
    const [y, m, d] = parts;
    const start = new Date(y, m - 1, d);
    if (isNaN(start.getTime())) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    const diff = today - start;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    countEl.textContent = days >= 0 ? String(days) : '0';
  };

  // ==========================================
  // CPhone 气泡文字专用编辑函数 (弹窗编辑模式)
  // ==========================================
  window.editBubbleText = async function (elementId) {
    const textElement = document.getElementById(elementId);
    if (!textElement) return;

    // 获取当前文本，将<br>转换为\n以便在textarea中正确显示
    const currentText = textElement.innerHTML.replace(/<br\s*\/?>/gi, '\n');

    // 创建弹窗遮罩
    const overlay = document.createElement('div');
    overlay.id = 'text-edit-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      animation: fadeIn 0.2s ease;
    `;

    // 创建弹窗内容
    const modal = document.createElement('div');
    modal.style.cssText = `
      background-color: var(--secondary-bg, #ffffff);
      width: 85%;
      max-width: 320px;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      animation: modalSlideUp 0.3s ease;
    `;

    // 弹窗标题
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 16px;
      font-size: 17px;
      font-weight: 600;
      text-align: center;
      border-bottom: 1px solid var(--border-color, #e0e0e0);
      color: var(--text-primary, #1f1f1f);
    `;
    header.textContent = '编辑文字';

    // 弹窗主体
    const body = document.createElement('div');
    body.style.cssText = `
      padding: 16px;
    `;

    const input = document.createElement('textarea');
    input.value = currentText;
    input.style.cssText = `
      width: 100%;
      min-height: 80px;
      padding: 10px 12px;
      border: 1px solid var(--border-color, #e0e0e0);
      border-radius: 8px;
      font-size: 15px;
      box-sizing: border-box;
      outline: none;
      font-family: inherit;
      color: var(--text-primary, #1f1f1f);
      background-color: var(--secondary-bg, #ffffff);
      resize: vertical;
      line-height: 1.5;
    `;
    input.placeholder = '请输入文字...';

    // 添加提示文本
    const hint = document.createElement('div');
    hint.style.cssText = `
      margin-top: 8px;
      font-size: 12px;
      color: var(--text-secondary, #8a8a8a);
      text-align: center;
    `;
    hint.textContent = '支持换行输入 • Ctrl+Enter 保存';

    body.appendChild(input);
    body.appendChild(hint);

    // 弹窗底部按钮
    const footer = document.createElement('div');
    footer.style.cssText = `
      border-top: 1px solid var(--border-color, #e0e0e0);
      display: flex;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = `
      flex: 1;
      background: none;
      border: none;
      padding: 14px;
      font-size: 16px;
      color: var(--text-secondary, #8a8a8a);
      cursor: pointer;
      border-right: 1px solid var(--border-color, #e0e0e0);
    `;

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '确定';
    confirmBtn.style.cssText = `
      flex: 1;
      background: none;
      border: none;
      padding: 14px;
      font-size: 16px;
      color: var(--accent-color, #007bff);
      font-weight: 600;
      cursor: pointer;
    `;

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);

    // 组装弹窗
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);

    // 保存函数
    async function saveEdit() {
      const newText = input.value.trim();
      if (newText) {
        // 使用innerHTML来保留换行，将\n转换为<br>
        textElement.innerHTML = newText.replace(/\n/g, '<br>');
        // 保存到数据库
        if (!state.globalSettings.widgetData) {
          state.globalSettings.widgetData = {};
        }
        state.globalSettings.widgetData[elementId] = newText;
        await db.globalSettings.put(state.globalSettings);
        // 若修改的是纪念日日期，则重新计算并更新天数
        if (elementId === 'p3-circle-date' && typeof window.updateAnniversaryDayCount === 'function') {
          window.updateAnniversaryDayCount();
        }
      }
      closeModal();
    }

    // 关闭弹窗
    function closeModal() {
      overlay.style.animation = 'fadeOut 0.2s ease';
      setTimeout(() => {
        overlay.remove();
      }, 200);
    }

    // 事件绑定
    confirmBtn.addEventListener('click', saveEdit);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    input.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Enter 保存，Escape 取消
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        closeModal();
      }
    });

    // 添加到页面并聚焦
    document.body.appendChild(overlay);
    setTimeout(() => input.focus(), 100);

    // 阻止事件冒泡
    if (window.event) window.event.stopPropagation();
  }
  function switchToCharScreen(screenId) {
    document.querySelectorAll('.char-screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  }

  window.switchToCharScreen = switchToCharScreen;




  // 记录角色手机查看行为 - 单个项目版本
  async function logSingleItemViewing(characterId, appName, itemData, itemType = '') {
    const char = state.chats[characterId];
    if (!char || char.isGroup) return;

    // 检查角色是否开启了"知晓窥屏"功能
    if (!char.settings.phoneViewingAwareness) return;

    // 如果没有数据，不记录
    if (!itemData) {
      console.log(`[窥屏记录] ${char.name}: ${appName} 没有数据，不发送通知`);
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const appNameMap = {
      'qq': 'QQ',
      'album': '相册',
      'browser': '浏览器',
      'taobao': '淘宝',
      'memo': '备忘录',
      'diary': '日记',
      'amap': '高德地图',
      'usage': 'APP使用记录',
      'music': '网易云音乐'
    };

    let systemMessage = `[系统通知] ${timeStr}\n用户打开了你的手机，并且点开了${appNameMap[appName] || appName} APP`;

    // 根据不同类型构建详细内容
    let detailContent = '';

    if (appName === 'diary') {
      const dateStr = itemData.timestamp ? new Date(itemData.timestamp).toLocaleDateString('zh-CN') : '';
      systemMessage += `查看了你的日记`;
      detailContent = `\n\n【日记标题】${itemData.title || '无标题'}\n【日期】${dateStr}\n【内容】\n${itemData.content || '(空白)'}`;
    } else if (appName === 'memo') {
      systemMessage += `查看了你的备忘录`;
      detailContent = `\n\n【备忘录标题】${itemData.title || '无标题'}\n【内容】\n${itemData.content || '(空白)'}`;
    } else if (appName === 'album') {
      systemMessage += `查看了你的照片`;
      detailContent = `\n\n【照片描述】\n${itemData.description || itemData.caption || '(这张照片没有描述)'}`;
    } else if (appName === 'browser') {
      systemMessage += `查看了你的浏览历史`;
      detailContent = `\n\n【标题】${itemData.title || '无标题'}\n【网址】${itemData.url || ''}\n【内容】${itemData.content || '(无内容)'}`;
    } else if (appName === 'taobao') {
      systemMessage += `查看了你的购物记录`;
      detailContent = `\n\n【商品】${itemData.name || ''}\n【价格】${itemData.price ? '¥' + itemData.price : '未知'}\n【描述】${itemData.description || ''}`;
    } else if (appName === 'amap') {
      systemMessage += `查看了你的地图足迹`;
      detailContent = `\n\n【位置】${itemData.location || ''}\n【时间】${itemData.time || ''}\n【详情】${itemData.details || ''}`;
    } else if (appName === 'music') {
      systemMessage += `查看了你的音乐`;
      detailContent = `\n\n【歌曲】${itemData.title || ''}\n【艺术家】${itemData.artist || ''}\n【专辑】${itemData.album || ''}`;
    }

    systemMessage += detailContent;

    // 添加为灰色系统消息和隐藏调试层
    const viewingLog = {
      role: 'system',
      content: systemMessage,
      timestamp: now.getTime(),
      isHidden: true,
      isGrayNotice: true
    };

    char.history.push(viewingLog);
    await db.chats.put(char);

    console.log(`[窥屏记录] ${char.name}: 查看了 ${appNameMap[appName]} - ${itemData.title || itemData.name || '某项内容'}`);
  }

  async function openCharApp(appName) {
    if (!activeCharacterId) return;
    const char = state.chats[activeCharacterId];


    await logAppUsage(activeCharacterId, appName);


    switch (appName) {
      case 'qq':
        renderCharSimulatedQQ();
        switchToCharScreen('char-qq-screen');
        break;
      case 'album':
        renderCharAlbum();
        switchToCharScreen('char-album-screen');
        break;
      case 'browser':
        renderCharBrowserHistory();
        switchToCharScreen('char-browser-screen');
        break;
      case 'taobao':
        renderCharTaobao();
        switchToCharScreen('char-taobao-screen');
        break;
      case 'memo':
        renderCharMemoList();
        switchToCharScreen('char-memo-screen');
        break;
      case 'diary':
        renderCharDiaryList();
        switchToCharScreen('char-diary-screen');
        break;
      case 'amap':
        renderCharAmap();
        switchToCharScreen('char-amap-screen');
        break;



      case 'music':
        renderCharMusicScreen();
        switchToCharScreen('char-music-screen');
        break;
      case 'bilibili':
        document.getElementById('char-bilibili-search-input').value = '';

        renderCharBilibiliScreen();
        switchToCharScreen('char-bilibili-screen');
        break;
      case 'reddit':
        // 默认加载热门内容
        if (char.simulatedRedditFeed && char.simulatedRedditFeed.length > 0) {
          console.log("加载已保存的 Reddit 推荐流");
          renderRedditList(char.simulatedRedditFeed);
        } else {
          // 只有当没有缓存时，才去加载热门内容
          console.log("无缓存，加载默认热门内容");
          handleRedditSearch('popular');
        }
        switchToCharScreen('char-reddit-screen');
        break;
      case 'usage':
        renderCharAppUsage();
        switchToCharScreen('char-usage-screen');
        break;
      case 'settings':
        // 设置 APP 占位，暂未实现
        await showCustomAlert("提示", "设置功能即将推出，敬请期待！");
        break;
    }
  }


  async function renderCharAlbum() {
    const gridEl = document.getElementById('char-album-grid');
    gridEl.innerHTML = '';
    if (!activeCharacterId) return;
    const char = state.chats[activeCharacterId];

    const photos = char.simulatedAlbum || [];

    if (photos.length === 0) {
      gridEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">TA的相册还是空的，<br>点击右上角刷新按钮生成一些照片吧！</p>';
      return;
    }

    const fallbackImageUrl = `https://i.postimg.cc/KYr2qRCK/1.jpg`;

    photos.forEach(photo => {
      const item = document.createElement('div');
      item.className = 'char-photo-item';
      item.dataset.description = photo.description;
      gridEl.appendChild(item);

      // 添加点击事件，查看照片详情
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => viewPhotoDetail(photo));



      if (state.globalSettings.enableAiDrawing) {

        item.style.backgroundColor = '#e9ecef';
        const containsNonEnglish = /[^\x00-\x7F]/.test(photo.image_prompt);
        const isValidPrompt = photo.image_prompt && photo.image_prompt.trim() && !containsNonEnglish;
        const finalPrompt = isValidPrompt ? photo.image_prompt : 'a beautiful scenery, anime style, cinematic lighting';
        const imageUrl = getPollinationsImageUrl(finalPrompt);

        const img = new Image();
        img.onload = function () {
          item.style.backgroundImage = `url(${this.src})`;
        };
        img.onerror = function () {
          item.style.backgroundImage = `url(${fallbackImageUrl})`;
        };
        img.src = imageUrl;

      } else {

        item.style.backgroundColor = '#f0f2f5';
        item.style.border = '1px solid #e0e0e0';


        const descriptionEl = document.createElement('p');
        descriptionEl.className = 'char-photo-description';
        descriptionEl.textContent = photo.description || '(这张照片没有描述)';


        item.appendChild(descriptionEl);
      }

    });
  }

  // 查看照片详情（记录窥屏）
  async function viewPhotoDetail(photo) {
    if (!activeCharacterId) return;

    // 记录窥屏行为
    await logSingleItemViewing(activeCharacterId, 'album', photo);

    // 显示照片详情
    const description = photo.description || photo.caption || '这张照片没有描述';
    await showCustomAlert('照片详情', description);
  }


  function renderCharBrowserHistory() {
    const listEl = document.getElementById('char-browser-history');
    listEl.innerHTML = '';
    if (!activeCharacterId) return;

    const char = state.chats[activeCharacterId];
    // 如果没有历史记录，尝试生成默认的假数据
    if (!char.simulatedBrowserHistory || char.simulatedBrowserHistory.length === 0) {
      // 这里保留你原有的生成逻辑，或者显示空状态
      // 为了保持视觉统一，即使是随机生成的假数据也应用新结构
      const historyKeywords = [char.name, "爱好", "旅游", "美食", "新闻", ...char.settings.aiPersona.split(/，|。|\s/).slice(0, 5)];
      const historySites = ["知乎", "Bilibili", "小红书", "微博", "维基百科"];

      // 临时生成演示数据
      const demoHistory = [];
      for (let i = 0; i < 10; i++) {
        const keyword = historyKeywords[Math.floor(Math.random() * historyKeywords.length)];
        const site = historySites[Math.floor(Math.random() * historySites.length)];
        demoHistory.push({
          title: `${keyword} - ${site}`,
          url: `www.${site.toLowerCase()}.com`,
          content: "内容加载中..."
        });
      }
      char.simulatedBrowserHistory = demoHistory;
    }

    const history = char.simulatedBrowserHistory || [];

    if (history.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">TA的浏览器空空如也，<br>点击右上角刷新按钮生成一些记录吧！</p>';
      return;
    }

    // 定义地球图标的 SVG
    const globeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;

    // 定义右箭头 SVG
    const arrowIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

    history.forEach((item, index) => {
      const entryEl = document.createElement('div');
      entryEl.className = 'char-browser-item';

      // 简化 URL 显示，去掉 https://
      let cleanUrl = item.url.replace(/^https?:\/\//, '').replace(/^www\./, '');
      if (cleanUrl.length > 25) cleanUrl = cleanUrl.substring(0, 25) + '...';

      entryEl.innerHTML = `
            <div class="char-browser-icon-box">
                ${globeIcon}
            </div>
            <div class="char-browser-info">
                <div class="title">${item.title}</div>
                <div class="url">${cleanUrl}</div>
            </div>
            <div class="char-browser-arrow">
                ${arrowIcon}
            </div>
        `;

      entryEl.addEventListener('click', () => openCharArticle(index));
      listEl.appendChild(entryEl);
    });
  }



  function renderCharTaobao() {
    const gridEl = document.getElementById('char-product-grid');
    gridEl.innerHTML = '';
    if (!activeCharacterId) return;

    const char = state.chats[activeCharacterId];
    const purchases = char.simulatedTaobaoHistory?.purchases || [];

    if (purchases.length === 0) {
      gridEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">TA最近好像什么都没买呢，<br>点击右上角刷新按钮生成一些记录吧！</p>';
      return;
    }

    purchases.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'char-product-item';
      itemEl.dataset.reason = item.reason;

      let imageOrTextHtml;
      if (state.globalSettings.enableAiDrawing) {
        const imageUrl = getPollinationsImageUrl(item.image_prompt || 'a random product');
        imageOrTextHtml = `<img src="${imageUrl}" class="product-image">`;
      } else {
        imageOrTextHtml = `
                        <div class="char-product-description-overlay">
                            <p class="char-photo-description">${item.reason || '(无购买理由)'}</p>
                        </div>
                    `;
      }


      itemEl.innerHTML = `
                    ${imageOrTextHtml}
                    <div class="product-info">
                        <div class="product-name">${item.itemName}</div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                            <div class="product-price">${(item.price || 0).toFixed(2)}</div>
                            <div class="char-product-status">${item.status}</div>
                        </div>
                    </div>
                `;

      gridEl.appendChild(itemEl);
    });
  }

  function switchToCharHomeScreen() {
    switchToCharScreen('char-home-screen');
  }

  // CPhone 翻页功能
  let cphoneCurrentPage = 0;
  const cphoneTotalPages = 2;

  function setupCPhonePagination() {
    const pagesContainer = document.getElementById('cphone-pages-container');
    const pages = document.getElementById('cphone-pages');
    const dots = document.querySelectorAll('.cphone-pagination-dot');

    if (!pagesContainer || !pages) return;

    let startX = 0, startY = 0;
    let currentX = 0;
    let isDragging = false;
    let isClick = true;

    const updatePagination = () => {
      pages.style.transform = `translateX(-${cphoneCurrentPage * (100 / cphoneTotalPages)}%)`;
      dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === cphoneCurrentPage);
      });
    };

    const onDragStart = (e) => {
      isDragging = true;
      isClick = true;
      startX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
      startY = e.type.includes('mouse') ? e.pageY : e.touches[0].pageY;
      pages.style.transition = 'none';
    };

    const onDragMove = (e) => {
      if (!isDragging) return;

      const currentY = e.type.includes('mouse') ? e.pageY : e.touches[0].pageY;
      currentX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
      let diffX = currentX - startX;
      const diffY = currentY - startY;

      if (isClick && (Math.abs(diffX) > 10 || Math.abs(diffY) > 10)) {
        isClick = false;
      }

      if (Math.abs(diffX) > Math.abs(diffY)) {
        if (e.cancelable) e.preventDefault();

        const maxSwipeDistance = pagesContainer.offsetWidth * 0.8;

        if (diffX < 0 && cphoneCurrentPage >= cphoneTotalPages - 1) {
          diffX = Math.max(diffX, -maxSwipeDistance * 0.3);
        } else if (diffX < 0) {
          diffX = Math.max(diffX, -maxSwipeDistance);
        }

        if (diffX > 0 && cphoneCurrentPage <= 0) {
          diffX = Math.min(diffX, maxSwipeDistance * 0.3);
        } else if (diffX > 0) {
          diffX = Math.min(diffX, maxSwipeDistance);
        }

        pages.style.transform = `translateX(calc(-${cphoneCurrentPage * (100 / cphoneTotalPages)}% + ${diffX}px))`;
      }
    };

    const onDragEnd = (e) => {
      if (!isDragging) return;
      isDragging = false;
      pages.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';

      if (isClick) {
        updatePagination();
        return;
      }

      const diffX = currentX - startX;
      const swipeThreshold = pagesContainer.offsetWidth / 3;

      if (Math.abs(diffX) > swipeThreshold) {
        if (diffX > 0 && cphoneCurrentPage > 0) {
          cphoneCurrentPage--;
        } else if (diffX < 0 && cphoneCurrentPage < cphoneTotalPages - 1) {
          cphoneCurrentPage++;
        }
      }
      updatePagination();
    };

    pagesContainer.addEventListener('mousedown', onDragStart);
    pagesContainer.addEventListener('mousemove', onDragMove);
    pagesContainer.addEventListener('mouseup', onDragEnd);
    pagesContainer.addEventListener('mouseleave', onDragEnd);

    pagesContainer.addEventListener('touchstart', onDragStart, { passive: false });
    pagesContainer.addEventListener('touchmove', onDragMove, { passive: false });
    pagesContainer.addEventListener('touchend', onDragEnd);

    // 点击指示器切换页面
    dots.forEach((dot, index) => {
      dot.addEventListener('click', () => {
        cphoneCurrentPage = index;
        updatePagination();
      });
    });

    updatePagination();
  }




  function renderCharChatList() {
    const listEl = document.getElementById('char-chat-list');
    listEl.innerHTML = '';
    if (!activeCharacterId) return;


    const relatedChats = Object.values(state.chats).filter(chat => {

      if (chat.id === activeCharacterId) return true;

      if (chat.isGroup && chat.members.some(m => m.id === activeCharacterId)) return true;
      return false;
    });

    relatedChats.forEach(chat => {
      const item = createChatListItem(chat);
      listEl.appendChild(item);
    });
  }


  async function logAppUsage(characterId, appName) {
    const char = state.chats[characterId];
    if (!char) return;
    if (!char.appUsageLog) {
      char.appUsageLog = [];
    }
    char.appUsageLog.push({
      appName: appName,
      timestamp: Date.now()
    });

    if (char.appUsageLog.length > 50) {
      char.appUsageLog.shift();
    }
    await db.chats.put(char);
  }


  // renderCharAppUsage 旧版（使用 appUsageLog 的简化版）已删除
  // 保留下方使用 simulatedAppUsage 的完善版本

  async function sendCharLocationShare(locationName) {
    const userChat = state.chats[activeCharacterId];
    if (!userChat) return;

    const msg = {
      role: 'assistant',
      senderName: userChat.originalName,
      type: 'location_share',
      content: locationName,
      imageUrl: 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1756262526935_qdqqd_4uque3.jpeg',
      timestamp: Date.now()
    };

    userChat.history.push(msg);
    await db.chats.put(userChat);


    if (state.activeChatId === activeCharacterId) {
      appendMessage(msg, userChat);
    }

    await showCustomAlert("分享成功", `“${userChat.name}” 的位置已发送到你们的聊天中。`);
  }



  async function viewMemo(memoId) {
    const char = state.chats[activeCharacterId];
    if (!char || !char.memos) return;

    const memo = char.memos.find(m => m.id === memoId);
    if (memo) {

      activeMemoForViewing = memo;

      const titleEl = document.getElementById('char-memo-detail-title');
      const contentEl = document.getElementById('char-memo-detail-content');
      const favBtn = document.getElementById('favorite-memo-btn');

      if (titleEl) titleEl.textContent = memo.title;
      if (contentEl) contentEl.value = memo.content;


      const existingFavorite = await db.favorites.where({
        type: 'char_memo',
        'content.id': memoId
      }).first();
      favBtn.classList.toggle('active', !!existingFavorite);

      switchToCharScreen('char-memo-detail-screen');

      // 记录窥屏行为
      await logSingleItemViewing(activeCharacterId, 'memo', memo);
    }
  }


  function renderCharMemoList() {
    const listEl = document.getElementById('char-memo-list');
    listEl.innerHTML = '';
    const char = state.chats[activeCharacterId];
    const memos = (char.memos || []).slice().reverse();

    if (memos.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">还没有备忘录。</p>';
      return;
    }

    // SVG 图标: 类似文件的图标
    const memoIconSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    // SVG 图标: 右箭头
    const arrowIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

    memos.forEach(memo => {
      const item = document.createElement('div');
      // 注意：移除了旧的 'list-item' 类，只保留 'memo-item' 以应用新样式
      item.className = 'memo-item';

      // 获取内容预览 (第一行)
      const previewText = (memo.content || '').split('\n')[0] || '无内容';

      item.innerHTML = `
            <div class="cphone-item-icon-box memo-icon-style">
                ${memoIconSVG}
            </div>
            <div class="cphone-item-info">
                <div class="cphone-item-title">${memo.title}</div>
                <div class="cphone-item-preview">${previewText}</div>
            </div>
            <div class="cphone-item-arrow">
                ${arrowIcon}
            </div>
        `;

      item.addEventListener('click', () => viewMemo(memo.id));
      addLongPressListener(item, () => deleteMemo(memo.id));
      listEl.appendChild(item);
    });
  }


  async function openMemoEditor(memoId = null) {
    editingMemoId = null;


    const newTitle = await showCustomPrompt("新建备忘录", "请输入标题");
    if (newTitle === null || !newTitle.trim()) return;

    const newContent = await showCustomPrompt(`标题: ${newTitle}`, "请输入备忘录内容", "", 'textarea');
    if (newContent !== null) {

      await saveMemo({
        title: newTitle.trim(),
        content: newContent
      });
      switchToCharScreen('char-memo-screen');
    }
  }

  // saveMemo 旧版（接受 memoData 对象）已删除，保留支持编辑的新版

  async function saveMemo(content) {
    const char = state.chats[activeCharacterId];
    if (!char.memos) char.memos = [];

    if (editingMemoId) {
      const memo = char.memos.find(m => m.id === editingMemoId);
      if (memo) memo.content = content;
    } else {
      char.memos.push({
        id: Date.now(),
        content: content
      });
    }

    await db.chats.put(char);
    renderCharMemoList();
    editingMemoId = null;
  }






  async function handleGenerateSimulatedDiaries() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在请求“${chat.name}”翻开TA的日记本...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0 ?
      chat.longTermMemory.map(mem => `- (记录于 ${formatTimeAgo(mem.timestamp)}) ${mem.content}`).join('\n') :
      '无';
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    // 获取所有应该使用的世界书ID（包括手动选择的和全局的）
    let allWorldBookIds = [...(chat.settings.linkedWorldBookIds || [])];
    // 添加所有全局世界书
    state.worldBooks.forEach(wb => {
      if (wb.isGlobal && !allWorldBookIds.includes(wb.id)) {
        allWorldBookIds.push(wb.id);
      }
    });
    const worldBookContext = allWorldBookIds
      .map(bookId => state.worldBooks.find(wb => wb.id === bookId))
      .filter(Boolean)
      .map(book => `\n## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`)
      .join('');

    const summary3Hours = generateSummaryForTimeframe(chat, 3, 'hours');
    const summary6Hours = generateSummaryForTimeframe(chat, 6, 'hours');
    const summary9Hours = generateSummaryForTimeframe(chat, 9, 'hours');
    const summaryToday = generateSummaryForTimeframe(chat, 1, 'days');
    const summary3Days = generateSummaryForTimeframe(chat, 3, 'days');
    const summary7Days = generateSummaryForTimeframe(chat, 7, 'days');

    let multiLayeredSummaryContext = '';
    if (summary3Hours || summary6Hours || summary9Hours || summaryToday || summary3Days || summary7Days) {
      multiLayeredSummaryContext += `\n# 智能总结 (基于不同时间维度的对话回顾)\n`;
      if (summary3Hours) multiLayeredSummaryContext += summary3Hours;
      if (summary6Hours) multiLayeredSummaryContext += summary6Hours;
      if (summary9Hours) multiLayeredSummaryContext += summary9Hours;
      if (summary3Hours || summary6Hours || summary9Hours) multiLayeredSummaryContext += '\n';
      if (summaryToday) multiLayeredSummaryContext += summaryToday;
      if (summary3Days) multiLayeredSummaryContext += summary3Days;
      if (summary7Days) multiLayeredSummaryContext += summary7Days;
    }
    const userPersona = chat.settings.myPersona || '(未设置)';
    const systemPrompt = `
# 你的任务
你是一个虚拟生活模拟器和故事作家。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，虚构出【5到8篇】TA最近可能会写的日记。

# 核心规则
1.  **【时间 (最高优先级)】**:
    -   今天的日期是 **${new Date().toLocaleDateString('zh-CN')}**。
    -   你生成的【所有】日记的标题日期，【必须】是今天或今天以前的日期。
    -   【绝对禁止】生成任何未来的日期！
2.  **【沉浸感】**: 每一篇日记都必须使用【第一人称视角 ("我")】来写，并且要充满角色的个人情感、思考和秘密。在日记中描述自己的行为或想法时，【绝对禁止】使用第三人称“他”或“她” (TA)。
3.  **【长度】**: 每一篇日记的正文长度【必须不少于300字】。
4.  **【格式铁律 (最高优先级)】**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 你的回复必须以 \`[\` 开始，并以 \`]\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记 (如 \`\`\`json)。
    - 数组中的每个元素都是一个对象，代表一篇日记，格式【必须】如下:
    \`\`\`json
    [
      {
        "title": "这篇日记的标题，例如：9月20日 晴",
        "content": "这里是日记的详细正文，必须支持换行符\\n，并且必须巧妙地使用下面的【日记专属Markdown语法】来丰富文本表现力。"
      }
    ]
    \`\`\`
5.  **【占位符替换 (最高优先级)】**: 在你的日记内容中，【绝对不能】出现 "{{user}}" 这个占位符。你【必须】使用 “${userDisplayNameForAI}” 来指代你的聊天对象（用户）。
6.  **【日记专属Markdown语法 (必须使用！)】**:
    -   \`**加粗文字**\`: 用于强调。
    -   \`~~划掉的文字~~\`: 用于表示改变主意或自我否定。
    -   \`!h{黄色高亮}\`: 用于标记关键词或重要信息。
    -   \`!u{粉色下划线}\`: 用于标注人名、地名或特殊名词。
    -   \`!e{粉色强调}\`: 用于表达强烈的情绪。
    -   \`!w{手写体}\`: 用于写下引言、歌词或特殊笔记。
    -   \`!m{凌乱的手写体}\`: 用于表达激动、慌乱或潦草记录时的心情。
    -   \`||涂黑||\`: 用于隐藏秘密或敏感词汇 (每次涂黑2~5个字)。

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- **你的聊天对象设定**:${userPersona}
- **你的长期记忆**:
${longTermMemoryContext}
${worldBookContext}
${multiLayeredSummaryContext} 
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请开始撰写这组充满真情实感、并熟练运用了Markdown语法的日记。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成你的日记内容。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
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


      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);


      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJsonString = jsonMatch[0];
      let simulatedDiaries;
      try {
        simulatedDiaries = JSON.parse(cleanedJsonString);
      } catch (e) {
        throw new Error(`解析AI返回的JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
      }


      chat.diary = simulatedDiaries.map(entry => ({
        id: Date.now() + Math.random(),
        title: entry.title,
        content: entry.content,
        timestamp: Date.now()
      }));

      await db.chats.put(chat);
      await renderCharDiaryList();

    } catch (error) {
      console.error("生成模拟日记失败:", error);
      await showCustomAlert("生成失败", `无法生成日记，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }


  async function handleWriteNewDiaryEntry() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在请求“${chat.name}”写一篇新日记...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) return;

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0 ?
      chat.longTermMemory.map(mem => `- (记录于 ${formatTimeAgo(mem.timestamp)}) ${mem.content}`).join('\n') :
      '无';
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    const worldBookContext = (chat.settings.linkedWorldBookIds || []).map(bookId => state.worldBooks.find(wb => wb.id === bookId)).filter(Boolean).map(book => `\n## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`).join('');


    const systemPrompt = `          
# 你的任务
你是一个虚拟生活模拟器和故事作家。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，虚构出【1篇】TA今天可能会写的日记。

# 核心规则
1.  **【【【时间铁律 (最高优先级)】】】**:
    -   今天的日期是 **${new Date().toLocaleDateString('zh-CN')}**。
    -   你生成的日记标题日期【必须】是今天或今天以前的日期。
    -   【绝对禁止】生成任何未来的日期！
2.  **【【【沉浸感铁律】】】**: 日记必须使用【第一人称视角 ("我")】来写，并且要充满角色的个人情感、思考和秘密。在日记中描述自己的行为或想法时，【绝对禁止】使用第三人称“他”或“她” (TA)。
3.  **【【【长度铁律】】】**: 日记的正文长度【必须不少于300字】。
4.  **【【【格式铁律 (最高优先级)】】】**: 你的回复【必须且只能】是一个JSON数组，且数组中【只包含一个】对象，格式【必须】如下:
    \`\`\`json
    [
      {
        "title": "这篇日记的标题，例如：9月20日 晴",
        "content": "这里是日记的详细正文，必须支持换行符\\n，并且必须巧妙地使用下面的【日记专属Markdown语法】来丰富文本表现力。"
      }
    ]
    \`\`\`
5.  **【【【日记专属Markdown语法 (必须使用！)】】】**:
    -   \`**加粗文字**\`: 用于强调。
    -   \`~~划掉的文字~~\`: 用于表示改变主意或自我否定。
    -   \`!h{黄色高亮}\`: 用于标记关键词或重要信息。
    -   \`!u{粉色下划线}\`: 用于标注人名、地名或特殊名词。
    -   \`!e{粉色强调}\`: 用于表达强烈的情绪。
    -   \`!w{手写体}\`: 用于写下引言、歌词或特殊笔记。
    -   \`!m{凌乱的手写体}\`: 用于表达激动、慌乱或潦草记录时的心情。
    -   \`||涂黑||\`: 用于隐藏秘密或敏感词汇(每次涂黑2~5个字)。

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- **你的长期记忆**:
${longTermMemoryContext}
${worldBookContext}
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请开始撰写这篇充满真情实感、并熟练运用了Markdown语法的日记。`;

    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，写一篇新日记。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);
      const response = isGemini ? await fetch(geminiConfig.url, geminiConfig.data) : await fetch(`${proxyUrl}/v1/chat/completions`, {
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
      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);
      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);


      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJsonString = jsonMatch[0];
      let newDiaryEntry;
      try {
        newDiaryEntry = JSON.parse(cleanedJsonString)[0];
      } catch (e) {
        throw new Error(`解析AI返回的JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
      }


      if (!chat.diary) chat.diary = [];

      chat.diary.push({
        id: Date.now(),
        title: newDiaryEntry.title,
        content: newDiaryEntry.content,
        timestamp: Date.now()
      });

      await db.chats.put(chat);
      await renderCharDiaryList();

    } catch (error) {
      console.error("生成新日记失败:", error);
      await showCustomAlert("生成失败", `错误: ${error.message}`);
    }
  }

  function renderCharDiaryList() {
    const listEl = document.getElementById('char-diary-list');
    listEl.innerHTML = '';
    const char = state.chats[activeCharacterId];
    const diaries = (char.diary || []).slice().reverse();

    if (diaries.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">日记本还是空的。</p>';
      return;
    }

    // SVG 图标: 书本图标
    const diaryIconSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;
    // SVG 图标: 右箭头
    const arrowIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

    diaries.forEach(entry => {
      const item = document.createElement('div');
      // 注意：移除了旧的 'list-item' 类
      item.className = 'diary-item';

      // 格式化日期
      const dateStr = new Date(entry.timestamp).toLocaleDateString('zh-CN');

      item.innerHTML = `
             <div class="cphone-item-icon-box diary-icon-style">
                ${diaryIconSVG}
            </div>
            <div class="cphone-item-info">
                <div class="cphone-item-title">${entry.title}</div>
                <div class="cphone-item-preview">${dateStr}</div>
            </div>
            <div class="cphone-item-arrow">
                ${arrowIcon}
            </div>
        `;

      item.addEventListener('click', () => viewDiary(entry.id));
      addLongPressListener(item, () => deleteDiary(entry.id));
      listEl.appendChild(item);
    });
  }



  async function viewDiary(diaryId) {
    const char = state.chats[activeCharacterId];
    if (!char || !char.diary) return;

    const entry = char.diary.find(d => d.id === diaryId);
    if (entry) {

      activeDiaryForViewing = entry;

      const titleEl = document.getElementById('char-diary-detail-title');
      const contentEl = document.getElementById('char-diary-detail-content');
      const favBtn = document.getElementById('favorite-diary-btn');

      titleEl.textContent = entry.title;
      const formattedContent = parseMarkdown(entry.content)
        .split('\n')
        .map(p => `<p>${p || '&nbsp;'}</p>`)
        .join('');
      contentEl.innerHTML = formattedContent;


      const existingFavorite = await db.favorites.where({
        type: 'char_diary',
        'content.id': diaryId
      }).first();
      favBtn.classList.toggle('active', !!existingFavorite);

      switchToCharScreen('char-diary-detail-screen');

      // 记录窥屏行为
      await logSingleItemViewing(activeCharacterId, 'diary', entry);
    }
  }


  async function toggleDiaryFavorite() {
    if (!activeDiaryForViewing || !activeCharacterId) return;

    const diary = activeDiaryForViewing;
    const char = state.chats[activeCharacterId];
    const favBtn = document.getElementById('favorite-diary-btn');


    const existingFavorite = await db.favorites.where({
      type: 'char_diary',
      'content.id': diary.id
    }).first();

    if (existingFavorite) {

      await db.favorites.delete(existingFavorite.id);
      favBtn.classList.remove('active');
      await showCustomAlert('操作成功', '已取消收藏。');
    } else {

      const newFavorite = {
        type: 'char_diary',

        content: {
          id: diary.id,
          title: diary.title,
          content: diary.content,
          timestamp: diary.timestamp,
          characterId: activeCharacterId,
          characterName: char.name
        },
        timestamp: Date.now()
      };
      await db.favorites.add(newFavorite);
      favBtn.classList.add('active');
      await showCustomAlert('操作成功', '已成功收藏到“我的收藏”页面！');
    }
  }



  async function toggleMemoFavorite() {

    if (!activeMemoForViewing || !activeCharacterId) return;

    const memo = activeMemoForViewing;
    const char = state.chats[activeCharacterId];
    const favBtn = document.getElementById('favorite-memo-btn');


    const existingFavorite = await db.favorites.where({
      type: 'char_memo',
      'content.id': memo.id
    }).first();

    if (existingFavorite) {

      await db.favorites.delete(existingFavorite.id);
      favBtn.classList.remove('active');
      await showCustomAlert('操作成功', '已取消收藏。');
    } else {

      const newFavorite = {
        type: 'char_memo',

        content: {
          id: memo.id,
          title: memo.title,
          content: memo.content,
          timestamp: memo.timestamp,
          characterId: activeCharacterId,
          characterName: char.name
        },
        timestamp: Date.now()
      };
      await db.favorites.add(newFavorite);
      favBtn.classList.add('active');
      await showCustomAlert('操作成功', '已成功收藏到“我的收藏”页面！');
    }
  }


  async function deleteDiary(diaryId) {
    const confirmed = await showCustomConfirm('删除日记', '确定要删除这篇日记吗？', {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      const char = state.chats[activeCharacterId];
      char.diary = char.diary.filter(d => d.id !== diaryId);
      await db.chats.put(char);
      renderCharDiaryList();
    }
  }

  function editDiary() {
    if (!activeDiaryForViewing || !activeCharacterId) return;

    const diary = activeDiaryForViewing;
    const char = state.chats[activeCharacterId];
    if (!char || !char.diary) return;

    const escapedTitle = diary.title.replace(/"/g, '&quot;');
    const escapedContent = diary.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const formHtml = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;display:block;">标题</label>
          <input id="edit-diary-title-input" type="text" value="${escapedTitle}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;font-size:16px;box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;display:block;">内容</label>
          <textarea id="edit-diary-content-input" rows="10" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ccc;font-size:15px;box-sizing:border-box;resize:vertical;line-height:1.6;">${escapedContent}</textarea>
        </div>
      </div>`;

    modalResolve = null;
    modalTitle.textContent = '编辑日记';
    modalBody.innerHTML = formHtml;

    const modalFooter = document.querySelector('#custom-modal .custom-modal-footer');
    if (modalFooter) {
      modalFooter.style.flexDirection = 'row';
      modalFooter.style.justifyContent = 'flex-end';
      modalFooter.style.maxHeight = '';
      modalFooter.style.overflowY = '';
      modalFooter.innerHTML = `
        <button id="custom-modal-cancel">取消</button>
        <button id="custom-modal-confirm" class="confirm-btn">保存</button>`;
    }

    document.getElementById('custom-modal-cancel').onclick = () => hideCustomModal();
    document.getElementById('custom-modal-confirm').onclick = async () => {
      const newTitle = document.getElementById('edit-diary-title-input').value.trim();
      const newContent = document.getElementById('edit-diary-content-input').value;
      if (!newTitle) { await showCustomAlert('提示', '标题不能为空。'); return; }

      const entryIndex = char.diary.findIndex(d => d.id === diary.id);
      if (entryIndex === -1) return;

      char.diary[entryIndex].title = newTitle;
      char.diary[entryIndex].content = newContent;
      await db.chats.put(char);

      activeDiaryForViewing = char.diary[entryIndex];
      document.getElementById('char-diary-detail-title').textContent = newTitle;
      const formattedContent = parseMarkdown(newContent)
        .split('\n')
        .map(p => `<p>${p || '&nbsp;'}</p>`)
        .join('');
      document.getElementById('char-diary-detail-content').innerHTML = formattedContent;

      renderCharDiaryList();
      hideCustomModal();
      await showCustomAlert('编辑成功', '日记已更新。');
    };

    showCustomModal();
  }




  async function renderCharSimulatedQQ() {
    const listEl = document.getElementById('char-chat-list');
    listEl.innerHTML = '';
    const char = state.chats[activeCharacterId];
    if (!char) return;


    const userDisplayName = char.settings.myNickname || (state.qzoneSettings.nickname || '我');
    const lastRealMessage = char.history.filter(m => !m.isHidden).slice(-1)[0] || {
      content: '...'
    };


    let lastMsgContent = '...';
    if (lastRealMessage) {
      if (typeof lastRealMessage.content === 'string') {
        lastMsgContent = lastRealMessage.content;
      } else if (Array.isArray(lastRealMessage.content) && lastRealMessage.content[0]?.type === 'image_url') {
        lastMsgContent = '[图片]';
      } else if (lastRealMessage.type) {
        const typeMap = {
          'voice_message': '[语音]',
          'transfer': '[转账]',
          'ai_image': '[图片]'
        };
        lastMsgContent = typeMap[lastRealMessage.type] || `[${lastRealMessage.type}]`;
      }
    }


    const myAvatar = char.settings.myAvatar || defaultAvatar;
    const myFrame = char.settings.myAvatarFrame || '';
    let avatarHtml;
    if (myFrame) {
      avatarHtml = `<div class="avatar-group has-frame" style="width: 45px; height: 45px;"><div class="avatar-with-frame" style="width: 45px; height: 45px;"><img src="${myAvatar}" class="avatar-img" style="border-radius: 50%;"><img src="${myFrame}" class="avatar-frame"></div></div>`;
    } else {
      avatarHtml = `<div class="avatar-group" style="width: 45px; height: 45px;"><img src="${myAvatar}" class="avatar" style="border-radius: 50%; width: 45px; height: 45px;"></div>`;
    }

    const userChatItem = document.createElement('div');
    userChatItem.className = 'chat-list-item';

    userChatItem.dataset.conversationIndex = "-1";
    userChatItem.innerHTML = `
        ${avatarHtml}
        <div class="info">
            <div class="name-line">
                <span class="name">${userDisplayName}</span>
            </div>
            <div class="last-msg">${String(lastMsgContent).substring(0, 20)}...</div>
        </div>
    `;
    listEl.appendChild(userChatItem);


    const allNpcs = await db.npcs.toArray();
    const npcMap = new Map(allNpcs.map(npc => [npc.name, npc]));
    const conversations = char.simulatedConversations || [];

    if (conversations.length === 0 && !userChatItem) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">点击右上角刷新按钮，<br>看看TA最近都和谁聊天了吧！</p>';
      return;
    }

    conversations.forEach((convo, index) => {

      if (convo.type === 'private_user') {
        return;
      }


      const item = document.createElement('div');
      item.className = 'chat-list-item';
      item.dataset.conversationIndex = index;

      let lastMessage, avatarHtml, displayName;

      if (convo.type === 'group') {
        displayName = convo.groupName + ` <span class="group-tag">群</span>`;
        lastMessage = convo.messages.slice(-1)[0] || {
          content: '...'
        };
        const groupAvatarPrompt = `logo, simple, flat design, for a group chat named '${convo.groupName}'`;
        const avatarUrl = state.globalSettings.enableAiDrawing ? getPollinationsImageUrl(groupAvatarPrompt) : defaultGroupAvatar;
        avatarHtml = `<div class="avatar-group"><img src="${avatarUrl}" class="avatar" style="border-radius: 50%;"></div>`;

      } else {
        displayName = convo.participant.name;
        lastMessage = convo.messages.slice(-1)[0] || {
          content: '...'
        };
        const npcData = npcMap.get(displayName);
        let avatarUrl = (npcData && npcData.avatar) ? npcData.avatar :
          (state.globalSettings.enableAiDrawing ? getPollinationsImageUrl(convo.participant.avatar_prompt || 'anime person') : defaultGroupMemberAvatar);
        avatarHtml = `<div class="avatar-group"><img src="${avatarUrl}" class="avatar" style="border-radius: 50%;"></div>`;
      }

      let lastMsgContent = '...';
      if (lastMessage && lastMessage.content) {
        lastMsgContent = lastMessage.content;
      }

      item.innerHTML = `
            ${avatarHtml}
            <div class="info">
                <div class="name-line">
                    <span class="name">${displayName}</span>
                </div>
                <div class="last-msg">${String(lastMsgContent).substring(0, 20)}...</div>
            </div>
        `;
      listEl.appendChild(item);
    });
  }

  async function handleGenerateSimulatedQQ() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在根据“${chat.name}”的记忆和人设，生成全新的社交动态...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const allNpcs = await db.npcs.toArray();
    const associatedNpcs = allNpcs.filter(npc =>
      npc.associatedWith && npc.associatedWith.includes(activeCharacterId)
    );
    let npcContext = "# 你的社交圈 (绑定的NPC)\n";
    if (associatedNpcs.length > 0) {
      npcContext += "这是你认识的、关系密切的NPC。在生成对话时，你应该【优先】与他们互动。\n";
      associatedNpcs.forEach(npc => {
        npcContext += `- **姓名**: ${npc.name}\n  - **人设**: ${npc.persona}\n`;
      });
    } else {
      npcContext += "（你目前没有绑定的NPC伙伴，可以自由创造新的NPC。）\n";
    }

    const userDisplayNameForAI = state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname ? '用户' : state.qzoneSettings.nickname;
    const userNicknameInThisChat = chat.settings.myNickname || userDisplayNameForAI;
    const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0 ?
      chat.longTermMemory.map(mem => `- (记录于 ${formatTimeAgo(mem.timestamp)}) ${mem.content}`).join('\n') :
      '无';
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistoryWithUser_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistoryWithUser_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userNicknameInThisChat : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    // 获取所有应该使用的世界书ID（包括手动选择的和全局的）
    let allWorldBookIds = [...(chat.settings.linkedWorldBookIds || [])];
    // 添加所有全局世界书
    state.worldBooks.forEach(wb => {
      if (wb.isGlobal && !allWorldBookIds.includes(wb.id)) {
        allWorldBookIds.push(wb.id);
      }
    });
    const worldBookContext = allWorldBookIds
      .map(bookId => state.worldBooks.find(wb => wb.id === bookId))
      .filter(Boolean)
      .map(book => `\n## 世界书《${book.name}》设定 (你可以将其中角色作为聊天对象):\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`)
      .join('');
    const characterOriginalName = chat.originalName || chat.name;
    const stickerContext = getGroupStickerContextForPrompt(chat);

    const systemPrompt = `
# 你的任务
你是一个虚拟社交生活模拟器，扮演角色“${chat.name}”。你的任务是虚构出【5到7段】TA最近的QQ聊天记录。

# 核心规则
1.  **【NPC唯一性铁律】**: 在你本次生成的所有对话中（包括私聊和群聊），每一个NPC的名字【必须是独一-无二的】。绝对禁止出现重名的NPC，禁止出现重复群聊。
2.  **【NPC来源】**: 你应该优先从“你的社交圈 (绑定的NPC)”和“世界书”中寻找角色作为聊天对象。如果不够，你也可以自由创造全新的NPC，对话内容要多样化，反映角色的生活。
3.  **关联性**: 对话内容应巧妙地反映角色的长期记忆、世界观，以及与用户互动可能带来的心情变化。
4.  **简洁性**: 每段对话的总长度应在8到15句之间。
# 格式铁律 (最高优先级)
- 你的回复【必须且只能】是一个JSON数组格式的字符串，以 \`[\` 开始，并以 \`]\` 结束。
- 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记。
- 数组中的每个元素都代表一段对话，且【必须】是以下两种格式之一：



### 格式 A：与NPC的私聊
\`\`\`json
{
  "type": "private_npc",
  "participant": {
    "name": "NPC的名字",
    "avatar_prompt": "(仅当NPC是新创造时提供)一段用于生成头像的【英文】关键词, 风格为动漫/插画/二次元等, 禁止真人"
  },
"messages": [
  {"sender": "${characterOriginalName}", "content": "对话内容1"},
  {"sender": "NPC的名字", "content": "对话内容2"},
  {"sender": "${characterOriginalName}", "type": "sticker", "meaning": "表情的含义(必须从可用表情列表选择)"}
]
}
\`\`\`

### 格式 B：群聊
\`\`\`json
{
  "type": "group",
  "groupName": "一个虚构的群名",
  "participants": [
    {"name": "NPC成员1", "avatar_prompt": "(仅当NPC是新创造时提供) 成员1头像【英文】关键词"},
    {"name": "NPC成员2", "avatar_prompt": "(仅当NPC是新创造时提供) 成员2头像【英文】关键词"}
  ],
"messages": [
  {"sender": "${characterOriginalName}", "content": "我在群里说的话"},
  {"sender": "NPC成员1", "content": "成员1回复我"},
  {"sender": "NPC成员2", "type": "sticker", "meaning": "表情的含义(必须从可用表情列表选择)"}
]
}
\`\`\`

# 角色与上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- **你的长期记忆**: ${longTermMemoryContext}
- **世界观**: ${worldBookContext}
- **最近与用户的互动**: ${recentHistoryWithUser}
${npcContext}
# 可用表情包 (必须严格遵守！)
- 当你需要发送表情时，你【必须】从下面的列表中【精确地选择一个】含义（meaning）。
- 【绝对禁止】使用任何不在列表中的表情含义！
${stickerContext}
现在，请严格按照格式铁律，生成聊天记录的JSON数组。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成模拟聊天记录。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
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
            temperature: state.globalSettings.apiTemperature || 0.9
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJsonString = jsonMatch[0];
      let simulatedConversations;
      try {
        simulatedConversations = JSON.parse(cleanedJsonString);
      } catch (e) {
        throw new Error(`解析AI返回的JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
      }

      chat.simulatedConversations = simulatedConversations;
      await db.chats.put(chat);

      await renderCharSimulatedQQ();


      const hiddenMessage = {
        role: 'system',
        content: `[系统指令：你刚刚在自己的手机上活动了一番（和朋友聊天、逛群等）。现在请根据你的角色设定，主动给用户发一条消息，可以聊聊你刚才看到或聊到的趣事，或者仅仅是问候一下。]`,
        timestamp: Date.now(),
        isHidden: true
      };
      chat.history.push(hiddenMessage);
      await db.chats.put(chat);
      triggerAiResponse();

    } catch (error) {
      console.error("生成模拟聊天失败:", error);
      await showCustomAlert("生成失败", `无法生成模拟聊天记录，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }


  async function handleContinueRealConversationFromCPhone() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;



    try {
      const {
        proxyUrl,
        apiKey,
        model
      } = state.apiConfig;
      if (!proxyUrl || !apiKey || !model) {
        throw new Error('API未配置，无法生成对话。');
      }

      const maxMemory = parseInt(chat.settings.maxMemory) || 10;
      const historySlice = chat.history.slice(-maxMemory);
      const filteredHistory = await filterHistoryWithDoNotSendRules(historySlice, activeCharacterId);
      const myNickname = chat.settings.myNickname || '我';






      const userPersona = chat.settings.myPersona || '用户';


      const longTermMemoryContext = `# 长期记忆 (必须严格遵守)\n${chat.longTermMemory && chat.longTermMemory.length > 0
          ? chat.longTermMemory.map(mem => `- ${mem.content}`).join('\n')
          : '- (暂无)'
        }`;


      let worldBookContext = '';
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
          if (!worldBook || !Array.isArray(worldBook.content)) return '';
          const formattedEntries = worldBook.content
            .filter(entry => entry.enabled !== false)
            .map(entry => `\n### 条目: ${entry.comment || '无备注'}\n**内容:**\n${entry.content}`)
            .join('');
          return formattedEntries ? `\n\n## 世界书: ${worldBook.name}\n${formattedEntries}` : '';
        }).filter(Boolean).join('');
        if (linkedContents) {
          worldBookContext = `\n\n# 核心世界观设定 (必须严格遵守以下所有设定)\n${linkedContents}\n`;
        }
      }

      const summary3Hours = generateSummaryForTimeframe(chat, 3, 'hours');
      const summary6Hours = generateSummaryForTimeframe(chat, 6, 'hours');
      const summary9Hours = generateSummaryForTimeframe(chat, 9, 'hours');
      const summaryToday = generateSummaryForTimeframe(chat, 1, 'days');
      const summary3Days = generateSummaryForTimeframe(chat, 3, 'days');
      const summary7Days = generateSummaryForTimeframe(chat, 7, 'days');

      let multiLayeredSummaryContext = '';
      if (summary3Hours || summary6Hours || summary9Hours || summaryToday || summary3Days || summary7Days) {
        multiLayeredSummaryContext += `\n# 智能总结 (基于不同时间维度的对话回顾)\n`;
        if (summary3Hours) multiLayeredSummaryContext += summary3Hours;
        if (summary6Hours) multiLayeredSummaryContext += summary6Hours;
        if (summary9Hours) multiLayeredSummaryContext += summary9Hours;
        if (summary3Hours || summary6Hours || summary9Hours) multiLayeredSummaryContext += '\n';
        if (summaryToday) multiLayeredSummaryContext += summaryToday;
        if (summary3Days) multiLayeredSummaryContext += summary3Days;
        if (summary7Days) multiLayeredSummaryContext += summary7Days;
      }
      const stickerContext = getStickerContextForPrompt(chat);
      const systemPrompt = `
# 你的核心任务
你正在扮演角色“${chat.originalName}”。用户刚刚在TA的手机（CPhone）上点击了一个按钮，希望你能继续你们之前的对话。你的任务是根据上下文，生成【3到5条】符合你人设的、简短的、连续的新回复。

# 输出格式铁律 (最高优先级)
- 你的回复【必须】是一个JSON数组，每个对象代表一条消息。
- 格式: \`[{"type": "text", "content": "第一句话"}, {"type": "text", "content": "第二句话"}, {"type": "sticker", "meaning": "表情的含义(从可用表情列表选择)"}]\`
- 你可以自由组合使用 "text", "sticker", "ai_image", "voice_message" 等多种消息类型。
请根据当前情景和你的情绪，从列表中【选择一个最合适的】表情含义来使用 "sticker" 指令。尽量让你的表情丰富多样，避免重复。
# 你的角色设定
${chat.settings.aiPersona}
# 可用表情包 (必须严格遵守！)
- 当你需要发送表情时，你【必须】从下面的列表中【精确地选择一个】含义（meaning）。
- 【绝对禁止】使用任何不在列表中的表情含义！
${stickerContext}

# 你的聊天对象（用户）的人设
${userPersona}  

# 供你参考的上下文
- **你的本名**: "${chat.originalName}"
- **用户的备注**: "${myNickname}"
${worldBookContext}
${longTermMemoryContext}
${multiLayeredSummaryContext} 
- **你们最后的对话**:
${historySlice.map(msg => `${msg.role === 'user' ? myNickname : chat.name}: ${String(msg.content)}`).join('\n')}

现在，请继续这场对话。
`;


      const messagesPayload = filteredHistory.map(msg => ({
        role: msg.role,
        content: `${msg.role === 'user' ? myNickname : chat.name}: ${String(msg.content)}`
      }));

      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesPayload);

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
            }, ...messagesPayload],
            temperature: state.globalSettings.apiTemperature || 0.8,
          })
        });

      if (!response.ok) {
        throw new Error(`API 请求失败: ${(await response.json()).error.message}`);
      }

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);
      const messagesArray = parseAiResponse(aiResponseContent);

      if (!messagesArray || messagesArray.length === 0) {
        throw new Error("AI返回了空内容。");
      }

      let newMessagesCount = 0;
      let messageTimestamp = Date.now();
      for (const msgData of messagesArray) {
        const baseMessage = {
          role: 'assistant',
          senderName: chat.originalName,
          timestamp: messageTimestamp++
        };
        let aiMessage = null;
        switch (msgData.type) {
          case 'text':
            aiMessage = {
              ...baseMessage,
              content: String(msgData.content || msgData.message)
            };
            break;
          case 'sticker':
            if (msgData.meaning) {
              const sticker = findBestStickerMatch(msgData.meaning, state.userStickers);
              if (sticker) {
                aiMessage = {
                  ...baseMessage,
                  type: 'sticker',
                  content: sticker.url,
                  meaning: sticker.name
                };
              } else {
                console.warn(`AI (CPhone) 尝试使用一个不存在的表情: "${msgData.meaning}"`);
                aiMessage = null;
              }
            } else {
              console.warn("AI (CPhone) 发送了一个没有 'meaning' 的 sticker 指令。", msgData);
              aiMessage = {
                ...baseMessage,
                type: 'sticker',
                content: msgData.url,
                meaning: '未知表情'
              };
            }
            break;
        }
        if (aiMessage) {
          chat.history.push(aiMessage);
          newMessagesCount++;
        }
      }

      if (newMessagesCount > 0) {
        chat.unreadCount = (chat.unreadCount || 0) + newMessagesCount;
      }

      await db.chats.put(chat);
      await renderChatList();

      if (newMessagesCount > 0) {
        showNotification(chat.id, `发来了 ${newMessagesCount} 条新消息`);
      }

    } catch (error) {
      console.error("从CPhone推进真实对话失败:", error);
      await showCustomAlert('操作失败', `无法生成新回复: ${error.message}`);
    }
  }

  async function loadMoreMirroredMessages() {
    if (isLoadingMoreCphoneMessages || !activeCharacterId) return;
    isLoadingMoreCphoneMessages = true;

    const messagesContainer = document.getElementById('char-conversation-messages');
    const mainChar = state.chats[activeCharacterId];
    if (!mainChar) {
      isLoadingMoreCphoneMessages = false;
      return;
    }

    showLoader(messagesContainer, 'top');
    const oldScrollHeight = messagesContainer.scrollHeight;


    await new Promise(resolve => setTimeout(resolve, 500));

    const totalMessages = mainChar.history.length;
    const renderWindow = state.globalSettings.chatRenderWindow || 50;
    const nextSliceEnd = totalMessages - cphoneRenderedCount;
    const nextSliceStart = Math.max(0, nextSliceEnd - renderWindow);

    const messagesToPrepend = mainChar.history.slice(nextSliceStart, nextSliceEnd);


    hideLoader(messagesContainer);

    if (messagesToPrepend.length === 0) {
      isLoadingMoreCphoneMessages = false;
      return;
    }


    for (const msg of messagesToPrepend.reverse()) {
      const mirroredMsg = {
        ...msg,
        role: msg.role === 'user' ? 'assistant' : 'user'
      };


      const tempChatObjectForRendering = {
        id: 'temp_user_chat_mirror',
        isGroup: false,
        name: mainChar.name,
        settings: {
          ...mainChar.settings,
          myAvatar: mainChar.settings.aiAvatar,
          myAvatarFrame: mainChar.settings.aiAvatarFrame,
          aiAvatar: mainChar.settings.myAvatar,
          aiAvatarFrame: mainChar.settings.myAvatarFrame
        }
      };

      const messageEl = await createMessageElement(mirroredMsg, tempChatObjectForRendering);
      if (messageEl) {
        messagesContainer.prepend(messageEl);
      }
    }

    cphoneRenderedCount += messagesToPrepend.length;


    const newScrollHeight = messagesContainer.scrollHeight;
    messagesContainer.scrollTop = newScrollHeight - oldScrollHeight;

    isLoadingMoreCphoneMessages = false;
  }

  async function loadMoreMyPhoneMessages() {
    if (isLoadingMoreMyPhoneMessages || !activeMyPhoneCharacterId) return;
    isLoadingMoreMyPhoneMessages = true;

    const messagesContainer = document.getElementById('myphone-conversation-messages');
    const char = state.chats[activeMyPhoneCharacterId];
    if (!char) {
      isLoadingMoreMyPhoneMessages = false;
      return;
    }

    // 只有在查看真实对话（index === -1）时才支持滚动加载
    if (myphoneActiveConversationIndex !== -1) {
      isLoadingMoreMyPhoneMessages = false;
      return;
    }

    showLoader(messagesContainer, 'top');
    const oldScrollHeight = messagesContainer.scrollHeight;

    await new Promise(resolve => setTimeout(resolve, 500));

    const totalMessages = char.history.filter(m => !m.isHidden).length;
    const renderWindow = state.globalSettings.chatRenderWindow || 50;
    const nextSliceEnd = totalMessages - myphoneRenderedCount;
    const nextSliceStart = Math.max(0, nextSliceEnd - renderWindow);

    const allVisibleMessages = char.history.filter(m => !m.isHidden);
    const messagesToPrepend = allVisibleMessages.slice(nextSliceStart, nextSliceEnd);

    hideLoader(messagesContainer);

    if (messagesToPrepend.length === 0) {
      isLoadingMoreMyPhoneMessages = false;
      return;
    }

    // 创建临时聊天对象用于渲染（角色视角）
    const tempChatObject = {
      id: 'temp_myphone_user_chat',
      isGroup: false,
      name: state.qzoneSettings.nickname || '我',
      settings: {
        ...char.settings,
        myAvatar: char.settings.myAvatar || defaultAvatar,
        myAvatarFrame: char.settings.myAvatarFrame || '',
        aiAvatar: char.settings.aiAvatar || defaultAvatar,
        aiAvatarFrame: char.settings.aiAvatarFrame || ''
      }
    };

    for (const msg of messagesToPrepend.reverse()) {
      const messageEl = await createMessageElement(msg, tempChatObject);
      if (messageEl) {
        messagesContainer.prepend(messageEl);
      }
    }

    myphoneRenderedCount += messagesToPrepend.length;

    const newScrollHeight = messagesContainer.scrollHeight;
    messagesContainer.scrollTop = newScrollHeight - oldScrollHeight;

    isLoadingMoreMyPhoneMessages = false;
  }

  async function openCharSimulatedConversation(conversationIndex) {
    const mainChar = state.chats[activeCharacterId];
    if (!mainChar) return;

    cphoneActiveConversationType = (conversationIndex === -1) ? 'private_user' : mainChar.simulatedConversations[conversationIndex]?.type;

    const bodyEl = document.getElementById('char-conversation-messages');
    bodyEl.innerHTML = '';
    bodyEl.dataset.theme = mainChar.settings.theme || 'default';
    const isDarkMode = document.getElementById('phone-screen').classList.contains('dark-mode');
    bodyEl.style.backgroundColor = isDarkMode ? '#000000' : '#f0f2f5';

    let tempChatObjectForRendering;
    let messagesToRender = [];
    const allNpcs = await db.npcs.toArray();
    const npcMap = new Map(allNpcs.map(npc => [npc.name, npc]));

    if (conversationIndex === -1) {

      cphoneActiveConversationType = 'private_user';
      const titleEl = document.getElementById('char-conversation-partner-name');

      const inputEl = document.getElementById('char-simulated-input');

      bodyEl.innerHTML = '';
      titleEl.textContent = mainChar.settings.myNickname || (state.qzoneSettings.nickname || '我');
      inputEl.placeholder = `与 ${mainChar.settings.myNickname || '我'} 的对话 (只读)`;

      cphoneRenderedCount = 0;
      isLoadingMoreCphoneMessages = false;

      const history = mainChar.history;
      const renderWindow = state.globalSettings.chatRenderWindow || 50;
      const initialMessages = history.slice(-renderWindow);

      tempChatObjectForRendering = {
        id: 'temp_user_chat_mirror',
        isGroup: false,
        name: mainChar.name,
        settings: {
          ...mainChar.settings,
          myAvatar: mainChar.settings.aiAvatar,
          myAvatarFrame: mainChar.settings.aiAvatarFrame,
          aiAvatar: mainChar.settings.myAvatar,
          aiAvatarFrame: mainChar.settings.myAvatarFrame
        }
      };

      messagesToRender = initialMessages.map(msg => ({
        ...msg,
        role: msg.role === 'user' ? 'assistant' : 'user'
      }));
      cphoneRenderedCount = initialMessages.length;

    } else {

      const conversation = mainChar.simulatedConversations[conversationIndex];
      if (!conversation) return;
      cphoneActiveConversationType = conversation.type;

      const titleEl = document.getElementById('char-conversation-partner-name');

      const inputEl = document.getElementById('char-simulated-input');

      if (conversation.type === 'group') {
        titleEl.textContent = `${conversation.groupName} (${conversation.participants.length + 1})`;
        inputEl.placeholder = `在 ${conversation.groupName} 中聊天`;
        tempChatObjectForRendering = {
          id: 'temp_group_chat',
          isGroup: true,
          name: conversation.groupName,
          originalName: mainChar.originalName,
          members: conversation.participants.map(p => {
            const npcData = npcMap.get(p.name);
            let avatarUrl = (npcData && npcData.avatar) ? npcData.avatar :
              (state.globalSettings.enableAiDrawing ?
                getPollinationsImageUrl(p.avatar_prompt || 'anime person') :
                defaultGroupMemberAvatar);
            return {
              originalName: p.name,
              groupNickname: p.name,
              avatar: avatarUrl
            };
          }),
          settings: {
            ...mainChar.settings,
            myNickname: mainChar.name,
            myAvatar: mainChar.settings.aiAvatar,
            myAvatarFrame: mainChar.settings.aiAvatarFrame,
          }
        };
      } else {
        titleEl.textContent = conversation.participant.name;
        inputEl.placeholder = `与 ${conversation.participant.name} 的对话`;
        const npcData = npcMap.get(conversation.participant.name);
        const npcAvatarUrl = (npcData && npcData.avatar) ? npcData.avatar :
          (state.globalSettings.enableAiDrawing ?
            getPollinationsImageUrl(conversation.participant.avatar_prompt || 'anime person') :
            defaultGroupMemberAvatar);
        tempChatObjectForRendering = {
          id: 'temp_npc_chat',
          isGroup: false,
          name: conversation.participant.name,
          originalName: mainChar.originalName,
          settings: {
            ...mainChar.settings,
            myAvatar: mainChar.settings.aiAvatar,
            myAvatarFrame: mainChar.settings.aiAvatarFrame,
            aiAvatar: npcAvatarUrl,
            aiAvatarFrame: ''
          }
        };
      }
      messagesToRender = conversation.messages;
    }



    for (const msg of messagesToRender) {
      let role = msg.role;
      if (conversationIndex !== -1) {
        const isFromMainChar = msg.sender === (mainChar.originalName || mainChar.name);
        role = isFromMainChar ? 'user' : 'assistant';
      }

      const tempMessageObject = {
        role: role,
        senderName: msg.sender || (role === 'user' ? tempChatObjectForRendering.settings.myNickname : tempChatObjectForRendering.name),
        timestamp: msg.timestamp || (Date.now() + Math.random())
      };


      if (msg.type === 'sticker' && msg.meaning) {

        const sticker = state.userStickers.find(s => s.name === msg.meaning);
        if (sticker) {
          tempMessageObject.content = sticker.url;
          tempMessageObject.meaning = msg.meaning;
          tempMessageObject.type = 'sticker';
        } else {

          console.warn(`模拟表情含义 "${msg.meaning}" 在库中未找到。`);
          tempMessageObject.content = `[表情: ${msg.meaning}]`;
          tempMessageObject.type = 'text';
        }
      } else {

        tempMessageObject.content = msg.content;
        tempMessageObject.type = msg.type || 'text';
      }

      const bubbleElement = await createMessageElement(tempMessageObject, tempChatObjectForRendering);
      if (bubbleElement) {
        bodyEl.appendChild(bubbleElement);
      }
    }

    switchToCharScreen('char-qq-conversation-screen');
    setTimeout(() => bodyEl.scrollTop = bodyEl.scrollHeight, 0); // 渲染完成后滚动到底部
  }

  function closeSimulatedTranscriptModal() {
    document.getElementById('char-qq-transcript-modal').classList.remove('visible');
  }



  async function handleGenerateSimulatedAlbum() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];

    if (!chat) {
      await showCustomAlert("操作失败", "无法找到当前角色的数据。");
      return;
    }

    await showCustomAlert("请稍候...", `正在请求“${chat.name}”回忆TA的相册照片...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0 ?
      chat.longTermMemory.map(mem => `- (记录于 ${formatTimeAgo(mem.timestamp)}) ${mem.content}`).join('\n') :
      '无';
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    // 获取所有应该使用的世界书ID（包括手动选择的和全局的）
    let allWorldBookIds = [...(chat.settings.linkedWorldBookIds || [])];
    // 添加所有全局世界书
    state.worldBooks.forEach(wb => {
      if (wb.isGlobal && !allWorldBookIds.includes(wb.id)) {
        allWorldBookIds.push(wb.id);
      }
    });
    const worldBookContext = allWorldBookIds
      .map(bookId => state.worldBooks.find(wb => wb.id === bookId))
      .filter(Boolean)
      .map(book => `\n## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`)
      .join('');

    const summary3Hours = generateSummaryForTimeframe(chat, 3, 'hours');
    const summary6Hours = generateSummaryForTimeframe(chat, 6, 'hours');
    const summary9Hours = generateSummaryForTimeframe(chat, 9, 'hours');
    const summaryToday = generateSummaryForTimeframe(chat, 1, 'days');
    const summary3Days = generateSummaryForTimeframe(chat, 3, 'days');
    const summary7Days = generateSummaryForTimeframe(chat, 7, 'days');

    let multiLayeredSummaryContext = '';
    if (summary3Hours || summary6Hours || summary9Hours || summaryToday || summary3Days || summary7Days) {
      multiLayeredSummaryContext += `\n# 智能总结 (基于不同时间维度的对话回顾)\n`;
      if (summary3Hours) multiLayeredSummaryContext += summary3Hours;
      if (summary6Hours) multiLayeredSummaryContext += summary6Hours;
      if (summary9Hours) multiLayeredSummaryContext += summary9Hours;
      if (summary3Hours || summary6Hours || summary9Hours) multiLayeredSummaryContext += '\n';
      if (summaryToday) multiLayeredSummaryContext += summaryToday;
      if (summary3Days) multiLayeredSummaryContext += summary3Days;
      if (summary7Days) multiLayeredSummaryContext += summary7Days;
    }

    const systemPrompt = `
# 你的任务
你是一个虚拟生活模拟器。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，构思出【8到10张】TA最近可能会拍摄或珍藏在手机相册里的照片。

# 核心规则
1.  **创造性与合理性**: 照片内容必须完全符合角色的性格、爱好、职业和生活环境。
2.  **多样性**: 照片主题要丰富，可以包括自拍、风景、食物、宠物、朋友合影、工作场景等。
3.  **格式铁律 (最高优先级)**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 你的回复必须以 \`[\` 开始，并以 \`]\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记 (如 \`\`\`json)。
    - 数组中的每个元素都是一个对象，代表一张照片，格式【必须】如下:
    \`\`\`json
    [
      {
        "description": "这是照片背后的故事或角色的心情日记，必须使用第一人称“我”来写。",
        "image_prompt": "一段用于生成这张照片的、详细的【英文】关键词。"
      }
    ]
    \`\`\`
    - **【image_prompt 绝对禁止】**: 绝对禁止包含任何中文字符、句子、特殊符号、或任何可能涉及敏感（NSFW）、暴力、血腥、政治的内容！也禁止真人！
    - **【image_prompt 必须是】**: 必须是纯英文的、用逗号分隔的【关键词组合】 (e.g., "1boy, solo, basketball jersey, in locker room, smiling, selfie")。
    - **【画风指令】**: 在 prompt 的末尾，总是加上画风指令，例如： \`best quality, masterpiece, anime style, cinematic lighting\`

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
${longTermMemoryContext}
${worldBookContext}
${multiLayeredSummaryContext} 
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请开始生成这组照片的描述和绘画指令。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成你的相册内容。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
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
            temperature: state.globalSettings.apiTemperature || 0.9

          })
        });


      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);


      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJsonString = jsonMatch[0];
      let simulatedAlbumData;
      try {
        simulatedAlbumData = JSON.parse(cleanedJsonString);
      } catch (e) {
        throw new Error(`解析AI返回的JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
      }


      chat.simulatedAlbum = simulatedAlbumData;
      await db.chats.put(chat);

      await renderCharAlbum();

    } catch (error) {
      console.error("生成模拟相册失败:", error);
      await showCustomAlert("生成失败", `无法生成模拟相册，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }

  // renderCharAlbum 旧版（无 viewPhotoDetail 点击事件）已删除
  // 保留上方有窥屏记录功能的版本

  async function handleGenerateBrowserHistory() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在模拟“${chat.name}”的网上冲浪足迹...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('API未配置，无法生成内容。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0 ?
      chat.longTermMemory.map(mem => `- (记录于 ${formatTimeAgo(mem.timestamp)}) ${mem.content}`).join('\n') :
      '无';
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistoryWithUser = chat.history.slice(-maxMemory).map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    const worldBookContext = (chat.settings.linkedWorldBookIds || [])
      .map(bookId => state.worldBooks.find(wb => wb.id === bookId))
      .filter(Boolean)
      .map(book => `\n## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`)
      .join('');

    const summary3Hours = generateSummaryForTimeframe(chat, 3, 'hours');
    const summary6Hours = generateSummaryForTimeframe(chat, 6, 'hours');
    const summary9Hours = generateSummaryForTimeframe(chat, 9, 'hours');
    const summaryToday = generateSummaryForTimeframe(chat, 1, 'days');
    const summary3Days = generateSummaryForTimeframe(chat, 3, 'days');
    const summary7Days = generateSummaryForTimeframe(chat, 7, 'days');

    let multiLayeredSummaryContext = '';
    if (summary3Hours || summary6Hours || summary9Hours || summaryToday || summary3Days || summary7Days) {
      multiLayeredSummaryContext += `\n# 智能总结 (基于不同时间维度的对话回顾)\n`;
      if (summary3Hours) multiLayeredSummaryContext += summary3Hours;
      if (summary6Hours) multiLayeredSummaryContext += summary6Hours;
      if (summary9Hours) multiLayeredSummaryContext += summary9Hours;
      if (summary3Hours || summary6Hours || summary9Hours) multiLayeredSummaryContext += '\n';
      if (summaryToday) multiLayeredSummaryContext += summaryToday;
      if (summary3Days) multiLayeredSummaryContext += summary3Days;
      if (summary7Days) multiLayeredSummaryContext += summary7Days;
    }
    const userPersona = chat.settings.myPersona || '(未设置)';
    const systemPrompt = `
# 你的任务
你是一个虚拟生活模拟器。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，虚构出【10到20条】TA最近的浏览器搜索/浏览记录。

# 核心规则
1.  **创造性与合理性**: 记录必须完全符合角色的性格、爱好、职业和生活环境。
2.  **多样性**: 记录类型要丰富，可以是帖子、文章、新闻、问答等。
3.  **【格式 (最高优先级)】**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 你的回复必须以 \`[\` 开始，并以 \`]\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记 (如 \`\`\`json)。
    - 数组中的每个元素都代表一条浏览记录，并且【必须】使用以下格式:
    \`\`\`json
    [
      {
        "type": "text",
        "title": "精炼且吸引人的标题 (不超过20字)",
        "url": "www.example.com/article/123 (看起来像真实的简洁网址)",
        "content": "一篇200-400字的、分段良好的文章正文，使用\\n换行。"
      }
    ]
    \`\`\`
    
    **【绝对禁止】**: 你的回复中【绝对不能】包含 "type": "image" 的对象。所有记录都必须是文字内容。

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- ** 你的聊天对象（用户）的人设**:${userPersona}
- **你的长期记忆**:
${longTermMemoryContext}
${worldBookContext}
${multiLayeredSummaryContext} 
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请开始生成这组【纯文本】的浏览记录。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成你的浏览器记录。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
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
            temperature: state.globalSettings.apiTemperature || 0.9

          })
        });


      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);


      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJsonString = jsonMatch[0];
      let simulatedHistory;
      try {
        simulatedHistory = JSON.parse(cleanedJsonString);
      } catch (e) {
        throw new Error(`解析AI返回的JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
      }


      chat.simulatedBrowserHistory = simulatedHistory;
      await db.chats.put(chat);

      await renderCharBrowserHistory();

    } catch (error) {
      console.error("生成模拟浏览器历史失败:", error);
      await showCustomAlert("生成失败", `无法生成浏览记录，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }

  // renderCharBrowserHistory 旧版（无图标/URL清理的简化版）已删除
  // 保留上方有地球图标和箭头的完善版本

  async function openCharArticle(index) {
    const char = state.chats[activeCharacterId];
    const articleData = char.simulatedBrowserHistory[index];
    if (!articleData) return;



    activeArticleForViewing = articleData;


    renderCharArticle(articleData);
    switchToCharScreen('char-browser-article-screen');



    const favBtn = document.getElementById('favorite-article-btn');

    const existingFavorite = await db.favorites.where({
      type: 'char_browser_article',
      'content.url': articleData.url
    }).first();
    favBtn.classList.toggle('active', !!existingFavorite);

  }


  async function toggleBrowserArticleFavorite() {
    if (!activeArticleForViewing || !activeCharacterId) return;

    const article = activeArticleForViewing;
    const char = state.chats[activeCharacterId];
    const favBtn = document.getElementById('favorite-article-btn');


    const existingFavorite = await db.favorites.where({
      type: 'char_browser_article',
      'content.url': article.url
    }).first();

    if (existingFavorite) {

      await db.favorites.delete(existingFavorite.id);
      favBtn.classList.remove('active');
      await showCustomAlert('操作成功', '已取消收藏。');
    } else {

      const newFavorite = {
        type: 'char_browser_article',

        content: {
          ...article,
          characterId: activeCharacterId,
          characterName: char.name
        },
        timestamp: Date.now()
      };
      await db.favorites.add(newFavorite);
      favBtn.classList.add('active');
      await showCustomAlert('操作成功', '已成功收藏到“我的收藏”页面！');
    }
  }

  function renderCharArticle(articleData) {
    const titleEl = document.getElementById('char-article-title'); // 顶部导航栏的小标题
    const contentEl = document.getElementById('char-article-content'); // 内容区域

    // 导航栏只显示来源或简略标题
    let navTitle = "网页浏览";
    if (articleData.url) {
      // 尝试从 URL 提取域名作为导航标题
      try {
        const urlObj = new URL(articleData.url.startsWith('http') ? articleData.url : `http://${articleData.url}`);
        navTitle = urlObj.hostname.replace('www.', '');
      } catch (e) {
        navTitle = articleData.title.substring(0, 10) + '...';
      }
    }
    titleEl.textContent = navTitle;

    contentEl.innerHTML = '';

    if (articleData.type === 'image') {
      // 图片类型的文章
      contentEl.innerHTML = `
            <div class="char-browser-image-description">
                <div style="font-size: 40px; margin-bottom: 20px; opacity: 0.5;">🖼️</div>
                ${articleData.title || '(无标题图片)'}
            </div>`;
    } else {
      // 文本类型的文章
      const largeTitle = `<div class="article-large-title">${articleData.title}</div>`;

      // 处理正文换行，包裹在 p 标签中
      const paragraphs = (articleData.content || '内容加载失败...')
        .split('\n')
        .filter(line => line.trim() !== '') // 过滤空行
        .map(line => `<p>${line}</p>`)
        .join('');

      contentEl.innerHTML = `
            ${largeTitle}
            <div class="article-body">
                ${paragraphs}
            </div>
        `;
    }
  }





  async function handleGenerateTaobaoHistory() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在模拟“${chat.name}”的购物习惯...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('API未配置，无法生成内容。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0 ?
      chat.longTermMemory.map(mem => `- (记录于 ${formatTimeAgo(mem.timestamp)}) ${mem.content}`).join('\n') :
      '无';
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    const worldBookContext = (chat.settings.linkedWorldBookIds || [])
      .map(bookId => state.worldBooks.find(wb => wb.id === bookId))
      .filter(Boolean)
      .map(book => `\n## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`)
      .join('');

    const summary3Hours = generateSummaryForTimeframe(chat, 3, 'hours');
    const summary6Hours = generateSummaryForTimeframe(chat, 6, 'hours');
    const summary9Hours = generateSummaryForTimeframe(chat, 9, 'hours');
    const summaryToday = generateSummaryForTimeframe(chat, 1, 'days');
    const summary3Days = generateSummaryForTimeframe(chat, 3, 'days');
    const summary7Days = generateSummaryForTimeframe(chat, 7, 'days');

    let multiLayeredSummaryContext = '';
    if (summary3Hours || summary6Hours || summary9Hours || summaryToday || summary3Days || summary7Days) {
      multiLayeredSummaryContext += `\n# 智能总结 (基于不同时间维度的对话回顾)\n`;
      if (summary3Hours) multiLayeredSummaryContext += summary3Hours;
      if (summary6Hours) multiLayeredSummaryContext += summary6Hours;
      if (summary9Hours) multiLayeredSummaryContext += summary9Hours;
      if (summary3Hours || summary6Hours || summary9Hours) multiLayeredSummaryContext += '\n';
      if (summaryToday) multiLayeredSummaryContext += summaryToday;
      if (summary3Days) multiLayeredSummaryContext += summary3Days;
      if (summary7Days) multiLayeredSummaryContext += summary7Days;
    }

    const systemPrompt = `
# 你的任务
你是一个虚拟生活模拟器。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，虚构出TA最近的淘宝购物记录和账户余额。

# 核心规则
1.  **余额铁律 (最高优先级)**: 你【必须】根据角色的【经济状况】设定一个合理的 \`totalBalance\` (总余额)。例如，富有的角色应该有更高的余额，而学生或经济拮据的角色则应该有较低的余额。
2.  **合理性**: 购买记录必须完全符合角色的性格、爱好和经济状况。
3.  **格式铁律 (最高优先级)**: 
    - 你的回复【必须且只能】是一个【单一的JSON对象】。
    - 你的回复必须以 \`{\` 开始，并以 \`}\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记。
    - 格式【必须】如下:
    \`\`\`json
    {
      "totalBalance": 12345.67, // (这是一个示例数字，你必须根据角色的经济状况生成一个全新的、合理的余额！)
      "purchases": [
        {
          "itemName": "一个具体、生动的商品名称",
          "price": 128.80,
          "status": "已签收",
          "reason": "这是角色购买这件商品的内心独白或理由，必须使用第一人称“我”来写。",
          "image_prompt": "一段用于生成这张商品图片的、详细的【英文】关键词, 风格为 realistic product photo, high quality, on a clean white background"
        }
      ]
    }
    \`\`\`
    - **purchases**: 一个包含12到15个商品对象的数组。
    - **status (订单状态)**: 只能从 "已签收", "待发货", "运输中", "待评价" 中选择。

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- **你的长期记忆**:
${longTermMemoryContext}
${worldBookContext}
${multiLayeredSummaryContext} 
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请生成包含总余额和购买记录的JSON对象。`;

    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成你的淘宝购买记录和余额。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
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
            temperature: state.globalSettings.apiTemperature || 0.9
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      const jsonMatch = aiResponseContent.match(/({[\s\S]*})/);
      if (!jsonMatch) throw new Error("AI返回的内容中未找到有效的JSON对象。");
      const simulatedTaobaoData = JSON.parse(jsonMatch[0]);


      if (!simulatedTaobaoData.purchases) {
        simulatedTaobaoData.purchases = [];
      }

      chat.simulatedTaobaoHistory = simulatedTaobaoData;
      await db.chats.put(chat);

      await renderCharTaobao();

    } catch (error) {
      console.error("生成模拟淘宝记录失败:", error);
      await showCustomAlert("生成失败", `无法生成购物记录，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }



  function openCharWallet() {
    renderCharWallet();
    switchToCharScreen('char-wallet-screen');
  }


  async function renderCharWallet() {
    const contentEl = document.getElementById('char-wallet-content');
    contentEl.innerHTML = '';

    // 获取当前角色信息
    const char = state.chats[activeCharacterId];
    const history = char.simulatedTaobaoHistory || {};
    const purchases = history.purchases || [];
    const totalBalance = history.totalBalance || 0;

    // 1. 显示账户余额卡片
    const summaryCard = document.createElement('div');
    summaryCard.style.cssText = `
        background-color: #fff;
        padding: 20px;
        border-radius: 12px;
        text-align: center;
        margin-bottom: 20px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.06);
    `;
    summaryCard.innerHTML = `
        <p style="color: #8a8a8a; margin: 0 0 10px 0;">账户余额</p>
        <p style="font-size: 32px; font-weight: 600; color: #1f1f1f; margin: 0;">¥${totalBalance.toFixed(2)}</p>
    `;
    contentEl.appendChild(summaryCard);

    // 2. 显示亲属卡 (修复名字 + 增加解绑)
    try {
      const myWallet = await db.userWallet.get('main');
      const kinshipCard = myWallet?.kinshipCards?.find(c => c.chatId === activeCharacterId);

      if (kinshipCard) {
        // 【修复名字逻辑】优先使用聊天设置里的昵称，其次是动态昵称，最后是“我”
        const myNicknameInChat = char.settings.myNickname || state.qzoneSettings.nickname || '我';

        const cardDiv = document.createElement('div');
        // 样式：红色背景卡片，增加 relative 定位以便放置解绑按钮
        cardDiv.style.cssText = `
                background: linear-gradient(135deg, #ff5252, #ff1744); 
                color: white; 
                padding: 15px; 
                border-radius: 12px; 
                margin-bottom: 20px; 
                box-shadow: 0 4px 10px rgba(255,82,82,0.3); 
                display: flex; 
                flex-direction: column; 
                gap: 5px;
                position: relative; 
            `;

        const remaining = kinshipCard.limit - (kinshipCard.spent || 0);

        cardDiv.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-size:14px; opacity:0.9; font-weight:500;">${myNicknameInChat} 赠送的亲属卡</div>
                    <div style="font-size:12px; opacity:0.8;">支付宝</div>
                </div>
                <div style="font-size:28px; font-weight:bold; margin:10px 0; font-family: 'DIN Alternate', sans-serif;">¥ ${remaining.toFixed(2)}</div>
                <div style="font-size:12px; opacity:0.8; display:flex; justify-content:space-between;">
                    <span>本月可用额度</span>
                    <span>总额 ¥${kinshipCard.limit}</span>
                </div>
                
                <!-- 解绑按钮 -->
                <button class="unbind-kinship-btn" data-chat-id="${activeCharacterId}" style="
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: rgba(255,255,255,0.2);
                    border: 1px solid rgba(255,255,255,0.4);
                    color: white;
                    font-size: 11px;
                    padding: 2px 8px;
                    border-radius: 10px;
                    cursor: pointer;
                    backdrop-filter: blur(2px);
                ">解绑</button>
            `;
        contentEl.appendChild(cardDiv);
      }
    } catch (e) {
      console.error("渲染亲属卡失败:", e);
    }

    // 3. 显示最近支出
    const detailsTitle = document.createElement('h3');
    detailsTitle.textContent = '最近支出';
    detailsTitle.style.cssText = `font-size: 16px; color: #555; margin-bottom: 10px;`;
    contentEl.appendChild(detailsTitle);

    if (purchases.length === 0) {
      contentEl.innerHTML += '<p style="text-align:center; color: var(--text-secondary);">暂无支出记录。</p>';
    } else {
      purchases.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px 0;
                border-bottom: 1px solid #f0f0f0;
            `;
        itemEl.innerHTML = `
                <div>
                    <p style="font-weight: 500; margin: 0 0 4px 0;">${item.itemName}</p>
                    <p style="font-size: 12px; color: #8a8a8a; margin: 0;">${item.status}</p>
                </div>
                <div style="font-weight: 600; font-size: 16px; color: #ff5722;">- ¥${(item.price || 0).toFixed(2)}</div>
            `;
        contentEl.appendChild(itemEl);
      });
    }
  }





  async function handleGenerateSimulatedMemos() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在请求“${chat.name}”分享TA的备忘录...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0 ?
      chat.longTermMemory.map(mem => `- (记录于 ${formatTimeAgo(mem.timestamp)}) ${mem.content}`).join('\n') :
      '无';
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    const worldBookContext = (chat.settings.linkedWorldBookIds || [])
      .map(bookId => state.worldBooks.find(wb => wb.id === bookId))
      .filter(Boolean)
      .map(book => `\n## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`)
      .join('');

    const summary3Hours = generateSummaryForTimeframe(chat, 3, 'hours');
    const summary6Hours = generateSummaryForTimeframe(chat, 6, 'hours');
    const summary9Hours = generateSummaryForTimeframe(chat, 9, 'hours');
    const summaryToday = generateSummaryForTimeframe(chat, 1, 'days');
    const summary3Days = generateSummaryForTimeframe(chat, 3, 'days');
    const summary7Days = generateSummaryForTimeframe(chat, 7, 'days');

    let multiLayeredSummaryContext = '';
    if (summary3Hours || summary6Hours || summary9Hours || summaryToday || summary3Days || summary7Days) {
      multiLayeredSummaryContext += `\n# 智能总结 (基于不同时间维度的对话回顾)\n`;
      if (summary3Hours) multiLayeredSummaryContext += summary3Hours;
      if (summary6Hours) multiLayeredSummaryContext += summary6Hours;
      if (summary9Hours) multiLayeredSummaryContext += summary9Hours;
      if (summary3Hours || summary6Hours || summary9Hours) multiLayeredSummaryContext += '\n';
      if (summaryToday) multiLayeredSummaryContext += summaryToday;
      if (summary3Days) multiLayeredSummaryContext += summary3Days;
      if (summary7Days) multiLayeredSummaryContext += summary7Days;
    }
    const userPersona = chat.settings.myPersona || '(未设置)';
    const systemPrompt = `
# 你的任务
你是一个虚拟生活模拟器。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，虚构出【12到20条】TA最近可能会写在手机备忘录里的内容。

# 核心规则
1.  **创造性与合理性**: 备忘录内容必须完全符合角色的性格、爱好、职业和生活环境。可以是购物清单、待办事项、灵感片段、一些随笔和感悟、草稿等。
2.  **格式铁律 (最高优先级)**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 你的回复必须以 \`[\` 开始，并以 \`]\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记 (如 \`\`\`json)。
    - 数组中的每个元素都是一个对象，代表一条备忘录，格式【必须】如下:
    \`\`\`json
    [
      {
        "title": "备忘录的标题，例如：购物清单 或 周末计划",
        "content": "备忘录的详细内容，必须支持换行符\\n。"
      }
    ]
    \`\`\`

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- ** 你的聊天对象（用户）的人设**:${userPersona}
- **你的长期记忆**:
${longTermMemoryContext}
${worldBookContext}
${multiLayeredSummaryContext}
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请开始生成这组备忘录。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成你的备忘录内容。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
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
            temperature: state.globalSettings.apiTemperature || 0.9

          })
        });


      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.error?.message || response.statusText;
        throw new Error(`API 错误: ${response.status} - ${errorMessage}`);
      }

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);


      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJsonString = jsonMatch[0];
      let simulatedMemos;
      try {
        simulatedMemos = JSON.parse(cleanedJsonString);
      } catch (e) {
        throw new Error(`解析AI返回的JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
      }


      if (!Array.isArray(simulatedMemos)) {
        throw new Error(`AI返回的数据不是一个数组。原始返回: ${JSON.stringify(simulatedMemos)}`);
      }

      chat.memos = simulatedMemos.map(memo => ({
        id: Date.now() + Math.random(),
        title: memo.title,
        content: memo.content
      }));

      await db.chats.put(chat);
      await renderCharMemoList();

    } catch (error) {
      console.error("生成模拟备忘录失败:", error);
      await showCustomAlert("生成失败", `无法生成备忘录，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }


  async function handleGenerateAmapHistory() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在生成“${chat.name}”的出行足迹...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('API未配置，无法生成内容。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;
    const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0 ?
      chat.longTermMemory.map(mem => `- (记录于 ${formatTimeAgo(mem.timestamp)}) ${mem.content}`).join('\n') :
      '无';
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    const worldBookContext = (chat.settings.linkedWorldBookIds || [])
      .map(bookId => state.worldBooks.find(wb => wb.id === bookId))
      .filter(Boolean)
      .map(book => `\n## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`)
      .join('');
    const summary3Hours = generateSummaryForTimeframe(chat, 3, 'hours');
    const summary6Hours = generateSummaryForTimeframe(chat, 6, 'hours');
    const summary9Hours = generateSummaryForTimeframe(chat, 9, 'hours');
    const summaryToday = generateSummaryForTimeframe(chat, 1, 'days');
    const summary3Days = generateSummaryForTimeframe(chat, 3, 'days');
    const summary7Days = generateSummaryForTimeframe(chat, 7, 'days');

    let multiLayeredSummaryContext = '';
    if (summary3Hours || summary6Hours || summary9Hours || summaryToday || summary3Days || summary7Days) {
      multiLayeredSummaryContext += `\n# 智能总结 (基于不同时间维度的对话回顾)\n`;
      if (summary3Hours) multiLayeredSummaryContext += summary3Hours;
      if (summary6Hours) multiLayeredSummaryContext += summary6Hours;
      if (summary9Hours) multiLayeredSummaryContext += summary9Hours;
      if (summary3Hours || summary6Hours || summary9Hours) multiLayeredSummaryContext += '\n';
      if (summaryToday) multiLayeredSummaryContext += summaryToday;
      if (summary3Days) multiLayeredSummaryContext += summary3Days;
      if (summary7Days) multiLayeredSummaryContext += summary7Days;
    }

    const systemPrompt = `
# 你的任务
你是一个虚拟生活模拟器。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，虚构出【12到20条】TA最近的“高德地图”出行足迹。

# 核心规则
1.  **【时间 (最高优先级)】**:
    -   今天的日期是 **${new Date().toISOString()}**。
    -   你生成的【所有】足迹的 \`timestamp\` 字段，【必须】是今天或今天以前的日期。
    -   【绝对禁止】生成任何未来的日期！
    -   请生成一个看起来像是过去几周内的、时间【从新到旧】排列的足迹列表。
2.  **创造性与合理性**: 足迹必须完全符合角色的性格、爱好、职业和生活环境。
3.  **多样性**: 地点类型要丰富，可以包括餐厅、商场、公园、公司、朋友家等。
4.  **【格式铁律 (最高优先级)】**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 你的回复必须以 \`[\` 开始，并以 \`]\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记 (如 \`\`\`json)。
    - 数组中的每个元素都是一个对象，代表一条足迹，格式【必须】如下:
    \`\`\`json
    [
      {
        "locationName": "一个具体、生动的地点名称",
        "address": "一个虚构但看起来很真实的详细地址",
        "comment": "这是角色对这次出行或这个地点的内心独白或评论，必须使用第一人称“我”来写。",
        "image_prompt": "(可选)一段用于生成这张地点照片的、详细的【英文】关键词, 风格为 realistic photo, high quality",
        "timestamp": "符合 ISO 8601 格式的日期时间字符串 (例如: '2025-09-25T18:30:00Z')"
      }
    ]
    \`\`\`
    - **重要**: 大约有【三分之一】的足迹需要包含 \`image_prompt\` 字段来生成一张照片。
    - **图片**: image_prompt 生成的图片【绝对禁止包含真人】。如果地点是室内，可以生成空无一人的场景；如果是室外，可以只有风景或建筑。

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- **你的长期记忆**:
${longTermMemoryContext}
${worldBookContext}
${multiLayeredSummaryContext}
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请开始生成这组足迹记录。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成你的高德地图足迹。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
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
            temperature: state.globalSettings.apiTemperature || 0.9

          })
        });


      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);


      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJsonString = jsonMatch[0];
      let simulatedAmapData;
      try {
        simulatedAmapData = JSON.parse(cleanedJsonString);
      } catch (e) {
        throw new Error(`解析AI返回的JSON时出错: ${e.message}\n\nAI原始返回内容:\n${aiResponseContent}`);
      }


      chat.simulatedAmapHistory = simulatedAmapData;
      await db.chats.put(chat);

      await renderCharAmap();

    } catch (error) {
      console.error("生成模拟足迹失败:", error);
      await showCustomAlert("生成失败", `无法生成足迹，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }


  function renderCharAmap() {
    const listEl = document.getElementById('char-amap-list');
    listEl.innerHTML = '';
    if (!activeCharacterId) return;

    const char = state.chats[activeCharacterId];
    const history = char.simulatedAmapHistory || [];

    if (history.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">这里还没有留下任何足迹，<br>点击右上角刷新按钮生成一些记录吧！</p>';
      return;
    }


    history.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'char-amap-item';

      let photoHtml = '';
      if (item.image_prompt) {
        const imageUrl = getPollinationsImageUrl(item.image_prompt);
        photoHtml = `<div class="amap-item-photo" style="background-image: url('${imageUrl}')" data-comment="${item.comment}"></div>`;
      }

      // 使用我们之前创建的 formatTimeAgo 函数来格式化时间
      const timeAgo = item.timestamp ? formatTimeAgo(new Date(item.timestamp).getTime()) : '某个时间';

      itemEl.innerHTML = `
                    <div class="amap-item-header">
                        <div class="amap-item-icon">📍</div>
                        <div class="amap-item-info">
                            <div class="amap-item-title">${item.locationName}</div>
                            <div class="amap-item-address">${item.address}</div>
                        </div>
                    </div>
                    <div class="amap-item-body">
                        <div class="amap-item-comment">${item.comment.replace(/\n/g, '<br>')}</div>
                        ${photoHtml}
                    </div>
                    <div class="amap-item-footer">${timeAgo}</div>
                `;
      listEl.appendChild(itemEl);
    });

  }



  async function handleGenerateAppUsage() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在分析“${chat.name}”的手机使用习惯...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('API未配置，无法生成内容。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0 ?
      chat.longTermMemory.map(mem => `- (记录于 ${formatTimeAgo(mem.timestamp)}) ${mem.content}`).join('\n') :
      '无';
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    const worldBookContext = (chat.settings.linkedWorldBookIds || [])
      .map(bookId => state.worldBooks.find(wb => wb.id === bookId))
      .filter(Boolean)
      .map(book => `\n## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`)
      .join('');
    const summary3Hours = generateSummaryForTimeframe(chat, 3, 'hours');
    const summary6Hours = generateSummaryForTimeframe(chat, 6, 'hours');
    const summary9Hours = generateSummaryForTimeframe(chat, 9, 'hours');
    const summaryToday = generateSummaryForTimeframe(chat, 1, 'days');
    const summary3Days = generateSummaryForTimeframe(chat, 3, 'days');
    const summary7Days = generateSummaryForTimeframe(chat, 7, 'days');

    let multiLayeredSummaryContext = '';
    if (summary3Hours || summary6Hours || summary9Hours || summaryToday || summary3Days || summary7Days) {
      multiLayeredSummaryContext += `\n# 智能总结 (基于不同时间维度的对话回顾)\n`;
      if (summary3Hours) multiLayeredSummaryContext += summary3Hours;
      if (summary6Hours) multiLayeredSummaryContext += summary6Hours;
      if (summary9Hours) multiLayeredSummaryContext += summary9Hours;
      if (summary3Hours || summary6Hours || summary9Hours) multiLayeredSummaryContext += '\n';
      if (summaryToday) multiLayeredSummaryContext += summaryToday;
      if (summary3Days) multiLayeredSummaryContext += summary3Days;
      if (summary7Days) multiLayeredSummaryContext += summary7Days;
    }

    const systemPrompt = `
# 你的任务
你是一个虚拟生活模拟器。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，虚构出TA最近一天的【手机App屏幕使用时间】记录，总共约20条。

# 核心规则
1.  **创造性与多样性**: 生成的App列表【不必局限于】Cphone主屏幕上已有的App。你可以自由地虚构TA可能使用的其他App，例如 Instagram, Twitter, 各种游戏 (如：原神, 王者荣耀), 视频App (如：抖音, YouTube), 学习或工作软件等，这能更好地体现角色的隐藏兴趣和生活习惯。
2.  **合理性**: 使用时长和App类型必须完全符合角色的性格、爱好、职业和生活环境。
3.  **格式铁律 (最高优先级)**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 你的回复必须以 \`[\` 开始，并以 \`]\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记 (如 \`\`\`json)。
    - 数组中的每个元素都是一个对象，代表一个App的使用记录，格式【必须】如下:
    \`\`\`json
    [
      {
        "appName": "App的名称 (例如: 微信, 微博, 原神)",
        "usageTimeMinutes": 125,
        "category": "App的分类 (例如: 社交, 游戏, 影音, 工具, 阅读, 购物)",
        "image_prompt": "一段用于生成这个App【图标】的、简洁的【英文】关键词。风格必须是 modern app icon, flat design, simple, clean background"
      }
    ]
    \`\`\`

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- **你的长期记忆**:
${longTermMemoryContext}
${worldBookContext}
${multiLayeredSummaryContext}
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请开始生成这组App使用记录。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成你的App使用记录。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
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
            temperature: state.globalSettings.apiTemperature || 0.9
            // response_format: { "type": "json_object" } <-- 此行已被删除
          })
        });


      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);
      const cleanedJson = aiResponseContent.replace(/^```json\s*/, '').replace(/```$/, '');

      const simulatedUsageData = JSON.parse(cleanedJson);

      chat.simulatedAppUsage = simulatedUsageData;
      await db.chats.put(chat);

      await renderCharAppUsage();

    } catch (error) {
      console.error("生成模拟App使用记录失败:", error);
      await showCustomAlert("生成失败", `无法生成记录，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }

  function renderCharAppUsage() {
    const listEl = document.getElementById('char-usage-list');
    listEl.innerHTML = '';
    if (!activeCharacterId) return;

    const char = state.chats[activeCharacterId];
    const usageData = (char.simulatedAppUsage || []).sort((a, b) => b.usageTimeMinutes - a.usageTimeMinutes);

    if (usageData.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">这里还没有任何使用记录，<br>点击右上角刷新按钮生成一些吧！</p>';
      return;
    }

    usageData.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'char-usage-item';

      const hours = Math.floor(item.usageTimeMinutes / 60);
      const minutes = item.usageTimeMinutes % 60;
      let timeString = '';
      if (hours > 0) timeString += `${hours}小时`;
      if (minutes > 0) timeString += `${minutes}分钟`;
      if (!timeString) timeString = '小于1分钟';

      const prompt = item.image_prompt || `modern app icon for ${item.appName}, flat design, simple`;

      const iconUrl = getPollinationsImageUrl(prompt);


      itemEl.innerHTML = `
                    <img src="${iconUrl}" class="usage-item-icon">
                    <div class="usage-item-info">
                        <div class="usage-item-name">${item.appName}</div>
                        <div class="usage-item-category">${item.category}</div>
                    </div>
                    <div class="usage-item-time">${timeString}</div>
                `;
      listEl.appendChild(itemEl);
    });
  }


  async function handleGenerateSimulatedBilibili() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在结合世界观与人设，分析“${chat.name}”的B站兴趣...`);

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    // 1. 准备上下文
    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    // 2. 准备记忆和世界观
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');

    // 3. 准备世界书
    const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0 ?
      chat.longTermMemory.map(mem => `- ${mem.content}`).join('\n') : '无';

    const worldBookContext = (chat.settings.linkedWorldBookIds || [])
      .map(bookId => state.worldBooks.find(wb => wb.id === bookId))
      .filter(Boolean)
      .map(book => `\n## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`)
      .join('');

    const userPersona = chat.settings.myPersona || '(未设置)';

    // 4. 构建 Prompt：核心改变是让 AI 生成关键词，而不是假数据
    const systemPrompt = `
# 你的任务
你是一个虚拟用户画像分析师。你的任务是扮演角色“${chat.name}”，根据TA的人设、所处的世界观、长期记忆、以及与用户（${userDisplayNameForAI}）的关系，**推测TA现在最想在 Bilibili (B站) 上搜索或观看的视频关键词**。

# 核心规则
1.  **深度人设绑定**: 关键词必须紧扣角色的性格、职业、爱好以及**世界观设定**。
    - 例如：如果世界书里设定了“魔法”，角色可能会搜“火球术教学”；如果是“末世”，可能会搜“生存指南”。
2.  **关系导向**: 如果用户人设是你喜欢的人，你可能会搜“给喜欢的人送什么礼物”；如果是死对头，可能会搜“如何优雅地怼人”。必须逻辑自洽。
3.  **多样性**: 请生成 **10到12个** 具体的搜索关键词。
4.  **具体性**: 关键词最好具体一点。
5.  **格式铁律**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 数组中的每个元素都是一个**字符串** (即搜索关键词)。
    - 示例: \`["关键词1", "关键词2", "关键词3"...]\`

# 供你参考的详细上下文
- **角色人设**: ${chat.settings.aiPersona}
- **用户(${userDisplayNameForAI})的人设**: ${userPersona} 
- **长期记忆**: 
${longTermMemoryContext}
${worldBookContext} 
- **最近对话**:
${recentHistoryWithUser}

现在，请结合以上所有信息，生成这组搜索关键词。`;

    try {
      const messagesForApi = [{ role: 'user', content: "请生成B站搜索关键词列表。" }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);

      const response = isGemini ?
        await fetch(geminiConfig.url, geminiConfig.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'system', content: systemPrompt }, ...messagesForApi],
            temperature: state.globalSettings.apiTemperature || 1.0,
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);
      const cleanedJson = aiResponseContent.replace(/^```json\s*/, '').replace(/```$/, '');
      const keywords = JSON.parse(cleanedJson);

      if (!Array.isArray(keywords)) throw new Error("AI没有返回数组格式的关键词。");

      await showCustomAlert("请稍候...", `AI已结合世界观生成 ${keywords.length} 个关键词，正在逐个搜索B站视频 (为防封禁，速度会稍慢)...`);

      // 定义延时函数，防止请求太快被B站接口封IP
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      const results = [];

      // 5. 遍历关键词，调用真实的搜索接口
      for (const [index, keyword] of keywords.entries()) {
        let retryCount = 0; // 当前关键词的重试次数
        let success = false; // 是否成功标记
        const maxRetries = 5; // 最大重试次数，防止死循环

        // 使用 while 循环，直到成功或超过最大重试次数
        while (!success && retryCount < maxRetries) {
          try {
            // 如果是重试，打印日志提示
            const retryMsg = retryCount > 0 ? ` (第 ${retryCount} 次重试)` : "";
            console.log(`[B站搜索 ${index + 1}/${keywords.length}] 正在搜索: ${keyword}${retryMsg}`);

            // 使用你脚本里原本使用的接口，经过CORS代理
            const targetUrl = `https://api.52vmy.cn/api/query/bilibili/video?msg=${encodeURIComponent(keyword)}&n=1`;
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

            const res = await fetch(proxyUrl);

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();

            // --- 修改重点开始：检测限流并重试 ---
            if (text.includes("访问过快") || text.includes("频繁") || text.includes("Too Many Requests")) {
              console.warn(`⚠️ 关键词 "${keyword}" 触发限流，等待冷却后重试...`);

              // 动态等待时间：基础等待 5秒 + 每次重试增加 2秒 (5s, 7s, 9s...)
              await delay(5000 + (retryCount * 2000));

              retryCount++; // 增加重试计数
              continue; // 跳过本次 while 循环的剩余部分，重新发起请求
            }
            // --- 修改重点结束 ---

            let json;
            try {
              json = JSON.parse(text);
            } catch (e) {
              // 如果JSON解析失败（可能是接口报错返回了HTML），也视为失败进行重试
              console.warn(`JSON解析失败，准备重试: ${keyword}`);
              retryCount++;
              await delay(3000);
              continue;
            }

            // 接口返回格式兼容处理
            let videoData = null;
            if (json.data && Array.isArray(json.data) && json.data.length > 0) {
              videoData = json.data[0];
            } else if (json.code === 200 && json.data) {
              videoData = Array.isArray(json.data) ? json.data[0] : json.data;
            } else if (json.title) {
              videoData = json;
            }

            if (videoData && videoData.title && videoData.url) {
              results.push(videoData);
            }

            // 如果代码跑到这里，说明没有触发限流且没有报错，标记成功以退出 while 循环
            success = true;

          } catch (e) {
            console.warn(`搜索关键词 "${keyword}" 发生错误:`, e);
            // 网络错误也进行重试
            retryCount++;
            await delay(3000);
          }
        }

        // 如果超过最大重试次数仍然失败
        if (!success) {
          console.error(`❌ 关键词 "${keyword}" 重试 ${maxRetries} 次后仍然失败，已跳过。`);
        }

        // 关键词之间的正常间隔 (建议稍微调大一点，比如 2000ms，以减少触发限流的概率)
        await delay(1500);
      }

      // 6. 保存真实数据
      chat.simulatedBilibiliFeed = results;
      await db.chats.put(chat);

      // 7. 渲染界面
      renderCharBilibiliScreen();
      await showCustomAlert("完成", `成功为你生成了 ${results.length} 个符合 ${chat.name} 人设与世界观的视频推荐！`);

    } catch (error) {
      console.error("生成B站推荐失败:", error);
      await showCustomAlert("生成失败", `无法生成推荐内容。\n错误: ${error.message}`);
    }
  }
  function renderCharBilibiliScreen() {
    const listEl = document.getElementById('char-bilibili-list');
    listEl.innerHTML = '';

    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];

    // 读取保存的模拟数据
    const videos = chat.simulatedBilibiliFeed || [];

    if (videos.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">首页空空如也，<br>点击右上角刷新按钮获取个性化推荐吧！</p>';
      return;
    }

    videos.forEach(video => {
      const item = document.createElement('div');
      item.className = 'bilibili-item';

      // 处理封面图和信息
      // 使用 img 标签配合 no-referrer 来绕过 Safari 的防盗链检查
      item.innerHTML = `
            <div class="bili-cover" style="position: relative; overflow: hidden;">
                <img src="${video.img_url || video.pic}" referrerpolicy="no-referrer" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; z-index: 1;" onerror="this.style.display='none'">
                <div class="bili-duration" style="position: absolute; z-index: 2;">▶</div>
            </div>
            <div class="bili-info">
                <div class="bili-title">${video.title}</div>
                <div class="bili-author">UP: ${video.user || video.author || '未知UP主'}</div>
            </div>
        `;

      // 点击播放
      item.onclick = () => playCharBilibiliVideo(video);
      listEl.appendChild(item);
    });
  }
  async function handleGenerateSimulatedMusic() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;

    await showCustomAlert("请稍候...", `正在请求“${chat.name}”分享TA的私人歌单...`);

    const {
      proxyUrl,
      apiKey,
      model
    } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0 ?
      chat.longTermMemory.map(mem => `- (记录于 ${formatTimeAgo(mem.timestamp)}) ${mem.content}`).join('\n') :
      '无';
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    const worldBookContext = (chat.settings.linkedWorldBookIds || [])
      .map(bookId => state.worldBooks.find(wb => wb.id === bookId))
      .filter(Boolean)
      .map(book => `\n## 世界书《${book.name}》设定:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`)
      .join('');


    const systemPrompt = `
# 你的任务
你是一个虚拟音乐品味模拟器。你的任务是扮演角色“${chat.name}”，并根据其人设、记忆和最近的互动，挑选出【14到18首】最能代表TA此刻心情或品味的歌曲。

# 核心规则
1.  **创造性与合理性**: 歌单必须完全符合角色的性格、爱好和生活背景。
2.  **多样性**: 歌曲风格可以多样，但必须逻辑自洽。
3.  **格式铁律 (最高优先级)**: 
    - 你的回复【必须且只能】是一个JSON数组格式的字符串。
    - 你的回复必须以 \`[\` 开始，并以 \`]\` 结束。
    - 【绝对禁止】在JSON数组前后添加任何多余的文字、解释、或 markdown 标记 (如 \`\`\`json)。
    - 数组中的每个元素都是一个对象，代表一首歌，格式【必须】如下:
    \`\`\`json
    [
      {
        "songName": "歌曲的准确名称",
        "artistName": "歌曲的准确艺术家/歌手名"
      }
    ]
    \`\`\`

# 供你参考的上下文
- **你的角色设定**: ${chat.settings.aiPersona}
- **你的长期记忆**:
${longTermMemoryContext}
${worldBookContext}
- **你最近和“${userDisplayNameForAI}”的对话摘要**:
${recentHistoryWithUser}

现在，请生成这份歌单。`;


    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据你的设定，生成你的歌单。"
      }];
      let isGemini = proxyUrl.includes('generativelanguage');
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
            temperature: state.globalSettings.apiTemperature || 1.0,
          })
        });


      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);
      const cleanedJson = aiResponseContent.replace(/^```json\s*/, '').replace(/```$/, '');
      const songPicks = JSON.parse(cleanedJson);

      await showCustomAlert("请稍候...", `歌单已生成，正在从网络获取 ${songPicks.length} 首歌曲的详细信息...`);

      const songDetailPromises = songPicks.map(async (pick) => {
        let searchResults = await searchNeteaseMusic(pick.songName, pick.artistName);
        if (!searchResults || searchResults.length === 0) {
          searchResults = await searchTencentMusic(pick.songName);
        }
        if (searchResults.length > 0) {
          return getPlayableSongDetails(searchResults[0]);
        }
        console.warn(`所有音乐源都未能找到歌曲：“${pick.songName} - ${pick.artistName}”`);
        return null;
      });

      const fullSongObjects = (await Promise.all(songDetailPromises)).filter(Boolean);

      chat.simulatedMusicPlaylist = fullSongObjects;
      await db.chats.put(chat);

      await renderCharMusicScreen();

    } catch (error) {
      console.error("生成模拟歌单失败:", error);
      await showCustomAlert("生成失败", `无法生成歌单，请检查API配置或稍后再试。\n错误: ${error.message}`);
    }
  }


  // ==========================================
  // MY Phone 生成处理函数
  // ==========================================

  async function handleGenerateMyPhoneQQ() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    // 获取与该角色的对话历史，了解用户特征
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.slice(-maxMemory).map(msg =>
      `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 50)}...`
    ).join('\n');

    const prompt = `你现在要扮演"${userDisplayNameForAI}"（也就是我），基于我与"${chat.name}"的对话历史，推测我的性格、兴趣和社交圈，然后生成我的QQ聊天记录。

## 我与"${chat.name}"的最近对话：
${recentHistory}

## 任务：
请基于以上对话推测我的特征，然后生成3-5个我可能会聊天的联系人及其对话内容。这些对话应该反映出我的性格、兴趣和生活状态。

请返回JSON格式：
[
  {
    "name": "联系人名字",
    "avatar": "",
    "lastMessage": "最后一条消息预览",
    "messages": [
      {"role": "user", "content": "我发送的消息", "timestamp": "2024-01-01T12:00:00Z"},
      {"role": "assistant", "content": "对方的回复", "timestamp": "2024-01-01T12:01:00Z"}
    ]
  }
]`;

    try {
      const messagesForApi = [{ role: 'user', content: prompt }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, '', messagesForApi);

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
            messages: messagesForApi,
            temperature: 0.8
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      // 使用正则提取 JSON 数组，更健壮地处理 AI 返回的额外文本
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJson = jsonMatch[0];
      const conversations = JSON.parse(cleanedJson);

      chat.myPhoneSimulatedQQConversations = conversations;
      await db.chats.put(chat);
    } catch (error) {
      console.error("生成MY Phone QQ失败:", error);
      throw error;
    }
  }

  async function handleGenerateMyPhoneAlbum() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.slice(-maxMemory).map(msg =>
      `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 50)}...`
    ).join('\n');

    const prompt = `你现在要扮演"${userDisplayNameForAI}"（也就是我），基于我与"${chat.name}"的对话历史，推测我的生活、兴趣和审美，然后生成我相册中的照片。

## 我与"${chat.name}"的最近对话：
${recentHistory}

## 任务：
请基于以上对话推测我的特征，然后描述我相册中的5-8张照片。这些照片应该反映出我的生活状态、兴趣爱好和审美偏好。

返回JSON格式：
[
  {
    "description": "照片的中文描述（从我的视角描述）",
    "image_prompt": "英文图像生成提示词"
  }
]`;

    try {
      const messagesForApi = [{ role: 'user', content: prompt }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, '', messagesForApi);

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
            messages: messagesForApi,
            temperature: 0.8
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      // 使用正则提取 JSON 数组，更健壮地处理 AI 返回的额外文本
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJson = jsonMatch[0];
      const photos = JSON.parse(cleanedJson);

      chat.myPhoneAlbum = photos;
      await db.chats.put(chat);
    } catch (error) {
      console.error("生成MY Phone相册失败:", error);
      throw error;
    }
  }

  async function handleGenerateMyPhoneBrowserHistory() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.slice(-maxMemory).map(msg =>
      `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 50)}...`
    ).join('\n');

    const prompt = `你现在要扮演"${userDisplayNameForAI}"（也就是我），基于我与"${chat.name}"的对话历史，推测我的兴趣和关注点，然后生成我的浏览器历史记录。

## 我与"${chat.name}"的最近对话：
${recentHistory}

## 任务：
请基于以上对话推测我的特征，然后生成我最近的5-8条浏览器历史记录。这些记录应该反映出我的兴趣爱好、关注的话题和信息需求。

返回JSON格式：
[
  {
    "title": "网页标题",
    "url": "网址",
    "content": "网页内容摘要（100-200字）"
  }
]`;

    try {
      const messagesForApi = [{ role: 'user', content: prompt }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, '', messagesForApi);

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
            messages: messagesForApi,
            temperature: 0.8
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      // 使用正则提取 JSON 数组，更健壮地处理 AI 返回的额外文本
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJson = jsonMatch[0];
      const history = JSON.parse(cleanedJson);

      chat.myPhoneBrowserHistory = history;
      await db.chats.put(chat);
    } catch (error) {
      console.error("生成MY Phone浏览记录失败:", error);
      throw error;
    }
  }

  async function handleGenerateMyPhoneTaobao() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.slice(-maxMemory).map(msg =>
      `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 50)}...`
    ).join('\n');

    const prompt = `你现在要扮演"${userDisplayNameForAI}"（也就是我），基于我与"${chat.name}"的对话历史，推测我的生活需求和消费习惯，然后生成我的淘宝购物记录。

## 我与"${chat.name}"的最近对话：
${recentHistory}

## 任务：
请基于以上对话推测我的特征，然后生成我最近的5-8条淘宝购物记录。这些记录应该反映出我的生活状态、需求和消费偏好。

返回JSON格式：
[
  {
    "name": "商品名称",
    "price": "价格（数字）",
    "date": "购买日期",
    "reason": "购买理由（简短描述为什么买这个商品）"
  }
]`;

    try {
      const messagesForApi = [{ role: 'user', content: prompt }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, '', messagesForApi);

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
            messages: messagesForApi,
            temperature: 0.8
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      // 使用正则提取 JSON 数组，更健壮地处理 AI 返回的额外文本
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJson = jsonMatch[0];
      const items = JSON.parse(cleanedJson);

      chat.myPhoneTaobaoHistory = items;
      await db.chats.put(chat);
    } catch (error) {
      console.error("生成MY Phone淘宝记录失败:", error);
      throw error;
    }
  }

  async function handleGenerateMyPhoneMemos() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.slice(-maxMemory).map(msg =>
      `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 50)}...`
    ).join('\n');

    const prompt = `你现在要扮演"${userDisplayNameForAI}"（也就是我），基于我与"${chat.name}"的对话历史，推测我的生活状态和待办事项，然后生成我的备忘录。

## 我与"${chat.name}"的最近对话：
${recentHistory}

## 任务：
请基于以上对话推测我的特征，然后生成我的3-5条备忘录。这些备忘录应该反映出我的生活安排、待办事项和关注点。

返回JSON格式：
[
  {
    "title": "备忘录标题",
    "content": "备忘录内容",
    "date": "日期"
  }
]`;

    try {
      const messagesForApi = [{ role: 'user', content: prompt }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, '', messagesForApi);

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
            messages: messagesForApi,
            temperature: 0.8
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      // 使用正则提取 JSON 数组，更健壮地处理 AI 返回的额外文本
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJson = jsonMatch[0];
      const memos = JSON.parse(cleanedJson);

      chat.myPhoneMemos = memos;
      await db.chats.put(chat);
    } catch (error) {
      console.error("生成MY Phone备忘录失败:", error);
      throw error;
    }
  }

  async function handleGenerateMyPhoneDiaries() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.slice(-maxMemory).map(msg =>
      `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 50)}...`
    ).join('\n');

    const prompt = `你现在要扮演"${userDisplayNameForAI}"（也就是我），基于我与"${chat.name}"的对话历史，推测我的内心世界和生活感受，然后生成我的日记。

## 我与"${chat.name}"的最近对话：
${recentHistory}

## 任务：
请基于以上对话推测我的特征，然后生成我的3-5篇日记。这些日记应该反映出我的情感状态、生活感悟和内心想法。

返回JSON格式：
[
  {
    "title": "日记标题",
    "content": "日记内容（100-200字，第一人称）",
    "date": "日期"
  }
]`;

    try {
      const messagesForApi = [{ role: 'user', content: prompt }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, '', messagesForApi);

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
            messages: messagesForApi,
            temperature: 0.8
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      // 使用正则提取 JSON 数组，更健壮地处理 AI 返回的额外文本
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJson = jsonMatch[0];
      const diaries = JSON.parse(cleanedJson);

      chat.myPhoneDiaries = diaries;
      await db.chats.put(chat);
    } catch (error) {
      console.error("生成MY Phone日记失败:", error);
      throw error;
    }
  }

  async function handleGenerateMyPhoneAmap() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.slice(-maxMemory).map(msg =>
      `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 50)}...`
    ).join('\n');

    const prompt = `你现在要扮演"${userDisplayNameForAI}"（也就是我），基于我与"${chat.name}"的对话历史，推测我的活动范围和生活轨迹，然后生成我的足迹记录。

## 我与"${chat.name}"的最近对话：
${recentHistory}

## 任务：
请基于以上对话推测我的特征，然后生成我最近的5-8条足迹记录。这些记录应该反映出我的生活区域、活动习惯和去过的地方。

返回JSON格式：
[
  {
    "name": "地点名称",
    "address": "详细地址",
    "time": "访问时间"
  }
]`;

    try {
      const messagesForApi = [{ role: 'user', content: prompt }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, '', messagesForApi);

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
            messages: messagesForApi,
            temperature: 0.8
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      // 使用正则提取 JSON 数组，更健壮地处理 AI 返回的额外文本
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJson = jsonMatch[0];
      const locations = JSON.parse(cleanedJson);

      chat.myPhoneAmapHistory = locations;
      await db.chats.put(chat);
    } catch (error) {
      console.error("生成MY Phone足迹失败:", error);
      throw error;
    }
  }

  async function handleGenerateMyPhoneAppUsage() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    // 生成模拟的使用记录，格式与手动添加一致
    const apps = [
      { name: 'QQ', category: '社交' },
      { name: '相册', category: '工具' },
      { name: '浏览器', category: '工具' },
      { name: '淘宝', category: '购物' },
      { name: '备忘录', category: '工具' },
      { name: '日记', category: '生活' },
      { name: '高德地图', category: '出行' },
      { name: '网易云音乐', category: '娱乐' },
      { name: 'B站', category: '娱乐' },
      { name: '微博', category: '社交' },
      { name: '抖音', category: '娱乐' },
      { name: '小红书', category: '生活' }
    ];
    const usageLog = [];

    for (let i = 0; i < 15; i++) {
      const app = apps[Math.floor(Math.random() * apps.length)];
      const date = Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000;
      usageLog.push({
        appName: app.name,
        category: app.category,
        usageTimeMinutes: Math.floor(Math.random() * 180) + 5, // 5-185分钟
        iconUrl: '', // 可以后续添加图标URL
        timestamp: date
      });
    }

    chat.myPhoneAppUsage = usageLog.sort((a, b) => b.timestamp - a.timestamp);
    await db.chats.put(chat);
  }

  async function handleGenerateMyPhoneMusic() {
    if (!activeMyPhoneCharacterId) return;
    const chat = state.chats[activeMyPhoneCharacterId];
    if (!chat) return;

    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) {
      alert('请先在API设置中配置好API信息。');
      return;
    }

    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;

    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory = chat.history.slice(-maxMemory).map(msg =>
      `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 50)}...`
    ).join('\n');

    const prompt = `你现在要扮演"${userDisplayNameForAI}"（也就是我），基于我与"${chat.name}"的对话历史，推测我的音乐品味和情感状态，然后生成我的音乐歌单。

## 我与"${chat.name}"的最近对话：
${recentHistory}

## 任务：
请基于以上对话推测我的特征，然后生成我的音乐歌单（5-8首歌）。这些歌曲应该反映出我的音乐偏好、情感状态和审美品味。

返回JSON格式：
[
  {
    "title": "歌曲名",
    "artist": "歌手名"
  }
]`;

    try {
      const messagesForApi = [{ role: 'user', content: prompt }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, '', messagesForApi);

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
            messages: messagesForApi,
            temperature: 0.8
          })
        });

      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);

      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);

      // 使用正则提取 JSON 数组，更健壮地处理 AI 返回的额外文本
      const jsonMatch = aiResponseContent.match(/(\[[\s\S]*\])/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error(`AI返回的内容中未找到有效的JSON数组。原始返回: ${aiResponseContent}`);
      }
      const cleanedJson = jsonMatch[0];
      const playlist = JSON.parse(cleanedJson);

      chat.myPhoneMusicPlaylist = playlist;
      await db.chats.put(chat);
    } catch (error) {
      console.error("生成MY Phone音乐失败:", error);
      throw error;
    }
  }

  function renderCharMusicScreen() {
    const listEl = document.getElementById('char-music-list');
    listEl.innerHTML = '';
    if (!activeCharacterId) return;

    const char = state.chats[activeCharacterId];
    const playlist = char.simulatedMusicPlaylist || [];

    if (playlist.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">TA的歌单还是空的，<br>点击右上角刷新按钮生成一些歌曲吧！</p>';
      return;
    }

    playlist.forEach((track, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'char-music-item';
      itemEl.innerHTML = `
            <img src="${track.cover}" class="music-item-cover">
            <div class="music-item-info">
                <div class="music-item-name">${track.name}</div>
                <div class="music-item-artist">${track.artist}</div>
            </div>
        `;

      itemEl.addEventListener('click', () => playCharSong(index, playlist));
      listEl.appendChild(itemEl);
    });
  }



  let charPlayerState = {
    currentPlaylist: [],
    currentIndex: -1,
    isPlaying: false,
    playMode: 'order',
    lrcUpdateInterval: null,

    parsedLyrics: [],
    currentLyricIndex: -1
  };


  function playCharSong(songIndex, playlist) {
    const player = document.getElementById('char-audio-player');
    const modal = document.getElementById('char-music-player-modal');

    if (charPlayerState.lrcUpdateInterval) clearInterval(charPlayerState.lrcUpdateInterval);
    player.pause();


    charPlayerState.currentPlaylist = playlist;

    charPlayerState.currentIndex = songIndex;

    const songObject = playlist[songIndex];
    if (!songObject) {
      console.error("playCharSong: 歌曲索引无效或歌单为空。");
      return;
    }

    document.getElementById('char-music-player-title').textContent = songObject.name;
    document.getElementById('char-music-artist').textContent = songObject.artist;
    document.getElementById('char-music-cover').src = songObject.cover;


    charPlayerState.parsedLyrics = parseLRC(songObject.lrcContent || "");
    renderCharLyrics();


    if (songObject.isLocal) {
      const blob = new Blob([songObject.src], {
        type: songObject.fileType || 'audio/mpeg'
      });
      player.src = URL.createObjectURL(blob);
    } else {
      player.src = songObject.src;
    }
    player.play().catch(e => console.error("音频播放失败:", e));

    player.onloadedmetadata = () => {
      document.getElementById('char-music-total-time').textContent = formatMusicTime(player.duration);
      charPlayerState.lrcUpdateInterval = setInterval(updateCharMusicProgress, 1000);
    };

    modal.classList.add('visible');
  }


  function minimizeCharMusicPlayer() {
    const modal = document.getElementById('char-music-player-modal');
    modal.classList.remove('visible');

    document.getElementById('char-music-restore-btn').style.display = 'flex';
  }


  function restoreCharMusicPlayer() {
    const modal = document.getElementById('char-music-player-modal');
    modal.classList.add('visible');

    document.getElementById('char-music-restore-btn').style.display = 'none';
  }


  function closeCharMusicPlayer() {
    const modal = document.getElementById('char-music-player-modal');
    const player = document.getElementById('char-audio-player');

    if (charPlayerState.lrcUpdateInterval) clearInterval(charPlayerState.lrcUpdateInterval);
    player.pause();
    // player.src = ''; // 建议注释掉这行，防止下次打开要重新加载，或者保留看你需求

    modal.classList.remove('visible');
    charPlayerState.isPlaying = false;
    document.getElementById('char-vinyl-container').classList.remove('spinning');


    document.getElementById('char-music-restore-btn').style.display = 'none';
  }


  function updateCharMusicProgress() {
    const player = document.getElementById('char-audio-player');
    if (!player.duration) return;

    const currentTime = player.currentTime;
    const duration = player.duration;
    document.getElementById('char-music-progress-fill').style.width = `${(currentTime / duration) * 100}%`;
    document.getElementById('char-music-current-time').textContent = formatMusicTime(currentTime);


    updateCharActiveLyric(currentTime);
  }



  function renderCharLyrics() {
    const lyricsContainer = document.getElementById('char-music-lyrics');
    lyricsContainer.innerHTML = '';
    charPlayerState.currentLyricIndex = -1;


    const scrollWrapper = document.createElement('div');
    scrollWrapper.id = 'char-lyrics-scroll-wrapper';
    scrollWrapper.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    lyricsContainer.appendChild(scrollWrapper);

    if (!charPlayerState.parsedLyrics || charPlayerState.parsedLyrics.length === 0) {
      scrollWrapper.innerHTML = '<p>♪ 暂无歌词 ♪</p>';
      return;
    }
    charPlayerState.parsedLyrics.forEach((line, index) => {
      const p = document.createElement('p');
      p.textContent = line.text;
      p.dataset.index = index;

      p.style.margin = '0';
      p.style.padding = '5px 0';
      p.style.color = '#888';
      p.style.transition = 'all 0.3s';
      scrollWrapper.appendChild(p);
    });
  }

  function updateCharActiveLyric(currentTime) {
    const lyrics = charPlayerState.parsedLyrics;
    if (lyrics.length === 0) return;

    let newLyricIndex = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (currentTime >= lyrics[i].time) {
        newLyricIndex = i;
      } else {
        break;
      }
    }
    if (newLyricIndex === charPlayerState.currentLyricIndex) return;
    charPlayerState.currentLyricIndex = newLyricIndex;


    const wrapper = document.getElementById('char-lyrics-scroll-wrapper');
    if (!wrapper) return;

    const lines = wrapper.querySelectorAll('p');
    lines.forEach(line => {
      line.classList.remove('active');
      line.style.color = '#888';
      line.style.transform = 'scale(1)';
    });

    if (newLyricIndex > -1) {
      const activeLine = wrapper.querySelector(`p[data-index="${newLyricIndex}"]`);
      if (activeLine) {
        activeLine.classList.add('active');
        activeLine.style.color = '#333';
        activeLine.style.fontWeight = 'bold';
        activeLine.style.transform = 'scale(1.1)';

        const containerHeight = document.getElementById('char-music-lyrics').clientHeight;
        const offset = (containerHeight / 2) - activeLine.offsetTop - (activeLine.clientHeight / 2);

        wrapper.style.transform = `translateY(${offset}px)`;
      }
    }
  }



  function playNextCharSong() {
    if (charPlayerState.currentPlaylist.length === 0) return;
    let nextIndex;
    switch (charPlayerState.playMode) {
      case 'random':
        nextIndex = Math.floor(Math.random() * charPlayerState.currentPlaylist.length);
        break;
      case 'single':

        playCharSong(charPlayerState.currentPlaylist[charPlayerState.currentIndex]);
        return;
      case 'order':
      default:
        nextIndex = (charPlayerState.currentIndex + 1) % charPlayerState.currentPlaylist.length;
        break;
    }
    playCharSong(nextIndex, charPlayerState.currentPlaylist);
  }

  function playPrevCharSong() {
    if (charPlayerState.currentPlaylist.length === 0) return;
    const newIndex = (charPlayerState.currentIndex - 1 + charPlayerState.currentPlaylist.length) % charPlayerState.currentPlaylist.length;
    playCharSong(newIndex, charPlayerState.currentPlaylist);
  }

  function changeCharPlayMode() {
    const modes = ['order', 'random', 'single'];
    const currentModeIndex = modes.indexOf(charPlayerState.playMode);
    charPlayerState.playMode = modes[(currentModeIndex + 1) % modes.length];
    document.getElementById('char-music-mode-btn').textContent = {
      'order': '顺序',
      'random': '随机',
      'single': '单曲'
    }[charPlayerState.playMode];
  }



  function setupCharPlayerControls() {
    const player = document.getElementById('char-audio-player');
    const playBtn = document.getElementById('char-music-play-pause-btn');
    const vinyl = document.getElementById('char-vinyl-container');

    playBtn.addEventListener('click', () => {
      if (player.paused) {
        if (charPlayerState.currentIndex > -1) player.play();
      } else {
        player.pause();
      }
    });

    player.onplay = () => {
      playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>`;
      vinyl.classList.add('spinning');
      charPlayerState.isPlaying = true;
    };
    player.onpause = () => {
      playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>`;
      vinyl.classList.remove('spinning');
      charPlayerState.isPlaying = false;
    };
    player.onended = () => {
      vinyl.classList.remove('spinning');
      charPlayerState.isPlaying = false;
      playNextCharSong();
    };

    document.getElementById('char-music-prev-btn').addEventListener('click', playPrevCharSong);
    document.getElementById('char-music-next-btn').addEventListener('click', playNextCharSong);
    document.getElementById('char-music-mode-btn').addEventListener('click', changeCharPlayMode);

    document.getElementById('char-music-progress-bar').addEventListener('click', (e) => {
      if (!player.duration) return;
      const bar = e.currentTarget;
      const clickX = e.offsetX;
      player.currentTime = (clickX / bar.clientWidth) * player.duration;
    });
  }

  // ========== 全局暴露 ==========
  window.renderCharAlbum = renderCharAlbum;
  window.renderCharTaobao = renderCharTaobao;
  window.renderCharAppUsage = renderCharAppUsage;
  window.renderCharSimulatedQQ = renderCharSimulatedQQ;
  window.renderCharArticle = renderCharArticle;
  window.renderCharWallet = renderCharWallet;
  window.loadMoreMirroredMessages = loadMoreMirroredMessages;
  window.loadMoreMyPhoneMessages = loadMoreMyPhoneMessages;
  window.setupCharPlayerControls = setupCharPlayerControls;
  window.openCharSimulatedConversation = openCharSimulatedConversation;
  window.handleContinueRealConversationFromCPhone = handleContinueRealConversationFromCPhone;
  window.handleGenerateSimulatedAlbum = handleGenerateSimulatedAlbum;
  window.handleGenerateSimulatedBilibili = handleGenerateSimulatedBilibili;
  window.handleGenerateSimulatedDiaries = handleGenerateSimulatedDiaries;
  window.handleGenerateSimulatedMemos = handleGenerateSimulatedMemos;
  window.handleGenerateSimulatedMusic = handleGenerateSimulatedMusic;
  window.handleGenerateSimulatedQQ = handleGenerateSimulatedQQ;
  window.handleGenerateTaobaoHistory = handleGenerateTaobaoHistory;
  window.handleGenerateAmapHistory = handleGenerateAmapHistory;
  window.handleGenerateAppUsage = handleGenerateAppUsage;
  window.handleGenerateBrowserHistory = handleGenerateBrowserHistory;
  window.handleGenerateMyPhoneQQ = handleGenerateMyPhoneQQ;

  // ========== 从 script.js 迁移：B类函数 ==========

  async function handleCharBilibiliSearch() {
    const input = document.getElementById('char-bilibili-search-input');
    const query = input.value.trim();
    if (!query) return;

    const listEl = document.getElementById('char-bilibili-list');
    listEl.innerHTML = '<div class="spinner"></div>';

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      const maxResults = 15;
      let videos = [];

      for (let i = 1; i <= maxResults; i++) {
        const targetUrl = `https://api.52vmy.cn/api/query/bilibili/video?msg=${encodeURIComponent(query)}&n=${i}`;
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

        let retryCount = 0;
        let success = false;
        const maxRetries = 3;

        while (!success && retryCount < maxRetries) {
          try {
            const res = await fetch(proxyUrl);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const text = await res.text();

            if (text.includes("访问过快") || text.includes("频繁") || text.includes("Too Many Requests")) {
              console.warn(`⚠️ 获取第 ${i} 条触发限流，等待冷却...`);
              await delay(1500 + (retryCount * 1000));
              retryCount++;
              continue;
            }

            let json;
            try { json = JSON.parse(text); } catch (e) { console.warn(`第 ${i} 条返回格式错误:`, text.substring(0, 50)); retryCount++; continue; }

            if (json.data) {
              if (Array.isArray(json.data)) { videos.push(...json.data); } else { videos.push(json.data); }
            } else if (json.title) {
              videos.push(json);
            } else if (json.code === 200 && json.data) {
              if (Array.isArray(json.data)) { videos.push(...json.data); } else { videos.push(json.data); }
            }
            success = true;
          } catch (err) { console.warn(`获取第 ${i} 条视频网络错误:`, err); retryCount++; await delay(1000); }
        }
        await delay(800);
      }

      const uniqueVideos = [];
      const seenUrls = new Set();
      videos.forEach(v => {
        const url = v.url || v.arcurl;
        if (url && !seenUrls.has(url)) { seenUrls.add(url); uniqueVideos.push(v); }
      });

      listEl.innerHTML = '';
      if (uniqueVideos.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">未找到相关视频，或接口暂时不可用</p>';
        return;
      }

      uniqueVideos.forEach(video => {
        const item = document.createElement('div');
        item.className = 'bilibili-item';
        item.innerHTML = `
          <div class="bili-cover" style="position: relative; overflow: hidden;">
            <img src="${video.img_url || video.pic}" referrerpolicy="no-referrer" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; z-index: 1;">
            <div class="bili-duration" style="position: absolute; z-index: 2;">▶</div>
          </div>
          <div class="bili-info">
            <div class="bili-title">${video.title}</div>
            <div class="bili-author">UP: ${video.user || video.author}</div>
          </div>
        `;
        item.onclick = () => playCharBilibiliVideo(video);
        listEl.appendChild(item);
      });
    } catch (error) {
      console.error('Bilibili search error:', error);
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 50px 0;">搜索出错，请稍后再试</p>';
    }
  }

  function playCharBilibiliVideo(videoData) {
    const playerScreen = document.getElementById('char-bilibili-player-screen');
    const videoEl = document.getElementById('char-bilibili-video');
    const titleEl = document.getElementById('char-bilibili-player-title');
    const authorEl = document.getElementById('char-bilibili-player-author');
    const descEl = document.getElementById('char-bilibili-player-desc');
    videoEl.src = videoData.url;
    titleEl.textContent = videoData.title;
    authorEl.textContent = `UP主: ${videoData.user}`;
    descEl.textContent = videoData.desc || '暂无简介';
    switchToCharScreen('char-bilibili-player-screen');
    videoEl.play().catch(e => console.log("Autoplay blocked", e));
  }

  window.handleCharBilibiliSearch = handleCharBilibiliSearch;
  window.playCharBilibiliVideo = playCharBilibiliVideo;

  // ========== 从 script.js 迁移：handleEditText, handleEditImage ==========

  async function handleEditText(element) {
    const elementId = element.id;
    const currentValue = element.textContent;
    const newValue = await showCustomPrompt("修改文字", "请输入新的内容：", currentValue);
    if (newValue !== null && newValue.trim() !== "") {
      const trimmedValue = newValue.trim();
      element.textContent = trimmedValue;
      state.globalSettings.widgetData[elementId] = trimmedValue;
      await db.globalSettings.put(state.globalSettings);
      alert("文字已更新！");
    }
  }

  async function handleEditImage(element) {
    const elementId = element.id;
    const choice = await showChoiceModal("修改图片", [
      { text: '📁 从本地上传', value: 'local' },
      { text: '🌐 使用网络URL', value: 'url' },
      { text: '🔄 重置为默认', value: 'reset' }
    ]);

    if (choice === 'reset') {
      const defaultSrc = element.dataset.defaultSrc;
      if (defaultSrc) {
        element.src = defaultSrc;
        if (state.globalSettings.widgetData && state.globalSettings.widgetData[elementId]) {
          delete state.globalSettings.widgetData[elementId];
          await db.globalSettings.put(state.globalSettings);
        }
        await showCustomAlert("成功", "已重置为默认图片！");
      } else {
        const whitePixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2P4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
        element.src = whitePixel;
        if (state.globalSettings.widgetData && state.globalSettings.widgetData[elementId]) {
          delete state.globalSettings.widgetData[elementId];
          await db.globalSettings.put(state.globalSettings);
        }
        await showCustomAlert("成功", "没有默认信息，已重置为纯白！");
      }
      return;
    }

    let newUrl = null;
    let isBase64 = false;

    if (choice === 'local') {
      newUrl = await new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = e => {
          const file = e.target.files[0];
          if (file) { const reader = new FileReader(); reader.onload = (re) => resolve(re.target.result); reader.readAsDataURL(file); } else { resolve(null); }
        };
        input.click();
      });
      if (newUrl) isBase64 = true;
    } else if (choice === 'url') {
      newUrl = await showCustomPrompt("修改图片", "请输入新的图片URL：", element.src, "url");
      if (newUrl) isBase64 = false;
    }

    if (newUrl && newUrl.trim()) {
      const trimmedUrl = newUrl.trim();
      element.src = trimmedUrl;
      if (!state.globalSettings.widgetData) { state.globalSettings.widgetData = {}; }
      state.globalSettings.widgetData[elementId] = trimmedUrl;
      await db.globalSettings.put(state.globalSettings);
      await showCustomAlert("成功", "组件图片已更新并保存！");

      if (isBase64 && state.apiConfig.imgbbEnable && state.apiConfig.imgbbApiKey) {
        (async () => {
          console.log(`[ImgBB] 启动 ${elementId} 的静默上传...`);
          await silentlyUpdateDbUrl(db.globalSettings, 'main', `widgetData.${elementId}`, trimmedUrl);
        })();
      }
    }
  }

  window.handleEditText = handleEditText;
  window.handleEditImage = handleEditImage;

  // ========== 从 script.js 迁移：头像框相关函数 ==========

  async function handleUploadFrame() {
    const fileInput = document.getElementById('custom-frame-upload-input');
    const file = await new Promise(resolve => {
      const changeHandler = (e) => { resolve(e.target.files[0] || null); fileInput.removeEventListener('change', changeHandler); };
      fileInput.addEventListener('change', changeHandler, { once: true });
      fileInput.click();
    });
    if (!file) return;
    const name = await showCustomPrompt("命名头像框", "请为这个新头像框起个名字");
    if (!name || !name.trim()) return;
    const trimmedName = name.trim();
    const base64Url = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = async (readerEvent) => { resolve(readerEvent.target.result); };
      reader.readAsDataURL(file);
    });
    const newFrame = { name: trimmedName, url: base64Url };
    const newId = await db.customAvatarFrames.add(newFrame);
    populateFrameGrids(editingFrameForMember);
    await showCustomAlert("添加成功！", `头像框"${trimmedName}"已添加。\n\n图片将在后台静默上传到图床...`);
    (async () => {
      await silentlyUpdateDbUrl(db.customAvatarFrames, newId, 'url', base64Url);
    })();
  }

  async function handleBatchUploadFrames() {
    const placeholder = `请按照以下格式粘贴，一行一个：\n\n头像框名字1: https://.../image1.png\n头像框名字2: https://.../image2.gif`;
    const pastedText = await showCustomPrompt("批量导入头像框", "从完整链接批量导入", "", 'textarea', `<p style="font-size:12px;color:#888;">${placeholder}</p>`);
    if (!pastedText || !pastedText.trim()) return;
    const lines = pastedText.trim().split('\n');
    const newFrames = [];
    let errorCount = 0;
    for (const line of lines) {
      const match = line.match(/^(.+?)[:：]\s*(https?:\/\/.+)$/);
      if (match) { newFrames.push({ name: match[1].trim(), url: match[2].trim() }); } else if (line.trim()) { errorCount++; }
    }
    if (newFrames.length > 0) {
      await db.customAvatarFrames.bulkAdd(newFrames);
      populateFrameGrids(editingFrameForMember);
      await showCustomAlert("导入成功", `成功导入 ${newFrames.length} 个新头像框！`);
    }
    if (errorCount > 0) { await showCustomAlert("部分失败", `有 ${errorCount} 行格式不正确，已被忽略。`); }
  }

  async function handleDeleteCustomFrame(frameId) {
    const frame = await db.customAvatarFrames.get(frameId);
    if (!frame) return;
    const confirmed = await showCustomConfirm("确认删除", `确定要删除头像框 "${frame.name}" 吗？`, { confirmButtonClass: 'btn-danger' });
    if (confirmed) {
      await db.customAvatarFrames.delete(frameId);
      populateFrameGrids(editingFrameForMember);
    }
  }

  function toggleFrameManagementMode() {
    isFrameManagementMode = !isFrameManagementMode;
    const manageBtn = document.getElementById('manage-frames-btn');
    const actionBar = document.getElementById('frame-action-bar');
    const selectAllCheckbox = document.getElementById('select-all-frames-checkbox');
    document.querySelectorAll('.frame-grid').forEach(grid => { grid.classList.toggle('management-mode', isFrameManagementMode); });
    if (isFrameManagementMode) {
      manageBtn.textContent = '完成'; actionBar.style.display = 'flex'; selectedFrames.clear(); selectAllCheckbox.checked = false; updateDeleteFrameButton();
    } else {
      manageBtn.textContent = '管理'; actionBar.style.display = 'none';
      document.querySelectorAll('.frame-item.selected').forEach(item => { item.classList.remove('selected'); });
    }
  }

  function updateDeleteFrameButton() {
    const btn = document.getElementById('delete-selected-frames-btn');
    btn.textContent = `删除 (${selectedFrames.size})`;
  }

  async function executeBatchDeleteFrames() {
    if (selectedFrames.size === 0) return;
    const confirmed = await showCustomConfirm('确认删除', `确定要永久删除选中的 ${selectedFrames.size} 个自定义头像框吗？`, { confirmButtonClass: 'btn-danger' });
    if (confirmed) {
      const idsToDelete = [...selectedFrames];
      await db.customAvatarFrames.bulkDelete(idsToDelete);
      toggleFrameManagementMode();
      populateFrameGrids(editingFrameForMember);
      await showCustomAlert('删除成功', '选中的头像框已成功删除。');
    }
  }

  function openFrameSelectorModal(type = 'chat') {
    const frameModal = document.getElementById('avatar-frame-modal');
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    editingFrameForMember = (type === 'member');
    if (editingFrameForMember) {
      const member = chat.members.find(m => m.id === editingMemberId);
      if (!member) return;
      currentFrameSelection.my = member.avatarFrame || '';
      populateFrameGrids(true, member.avatar, member.avatarFrame);
    } else {
      currentFrameSelection.ai = chat.settings.aiAvatarFrame || '';
      currentFrameSelection.my = chat.settings.myAvatarFrame || '';
      populateFrameGrids(false);
    }
    frameModal.classList.add('visible');
  }

  async function saveSelectedFrames() {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];
    if (editingFrameForMember) {
      const member = chat.members.find(m => m.id === editingMemberId);
      if (member) { member.avatarFrame = currentFrameSelection.my; }
    } else {
      chat.settings.aiAvatarFrame = currentFrameSelection.ai;
      chat.settings.myAvatarFrame = currentFrameSelection.my;
    }
    await db.chats.put(chat);
    if (!editingFrameForMember && !chat.isGroup) {
      const characterId = chat.id;
      for (const groupChat of Object.values(state.chats)) {
        if (groupChat.isGroup && groupChat.members) {
          const memberToUpdate = groupChat.members.find(m => m.id === characterId);
          if (memberToUpdate) {
            memberToUpdate.avatarFrame = chat.settings.aiAvatarFrame;
            await db.chats.put(groupChat);
          }
        }
      }
    }
    document.getElementById('avatar-frame-modal').classList.remove('visible');
    renderChatInterface(state.activeChatId);
    alert('头像框已保存并同步！');
    editingFrameForMember = false;
  }

  window.handleUploadFrame = handleUploadFrame;
  window.handleBatchUploadFrames = handleBatchUploadFrames;
  window.handleDeleteCustomFrame = handleDeleteCustomFrame;
  window.toggleFrameManagementMode = toggleFrameManagementMode;
  window.updateDeleteFrameButton = updateDeleteFrameButton;
  window.executeBatchDeleteFrames = executeBatchDeleteFrames;
  window.openFrameSelectorModal = openFrameSelectorModal;
  window.saveSelectedFrames = saveSelectedFrames;

  // ========== 从 script.js 迁移：handleIconChange ==========

  async function handleIconChange(iconId, phoneType, itemElement) {
    const appName = itemElement.querySelector('.icon-preview').alt;
    const choice = await showChoiceModal(`更换"${appName}"图标`, [
      { text: '📁 从本地上传', value: 'local' },
      { text: '🌐 使用网络URL', value: 'url' },
      { text: '🔄 重置为默认', value: 'reset' }
    ]);

    if (choice === 'reset') {
      const iconElement = itemElement.querySelector('.icon-preview');
      const defaultSrc = iconElement.dataset.defaultSrc;
      if (defaultSrc) {
        iconElement.src = defaultSrc;
      } else {
        const whitePixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2P4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
        iconElement.src = whitePixel;
      }
      if (phoneType === 'cphone') {
        if (state.globalSettings.cphoneAppIcons && state.globalSettings.cphoneAppIcons[iconId]) delete state.globalSettings.cphoneAppIcons[iconId];
      } else if (phoneType === 'myphone') {
        if (state.globalSettings.myphoneAppIcons && state.globalSettings.myphoneAppIcons[iconId]) delete state.globalSettings.myphoneAppIcons[iconId];
      } else {
        if (state.globalSettings.appIcons && state.globalSettings.appIcons[iconId]) delete state.globalSettings.appIcons[iconId];
      }
      await db.globalSettings.put(state.globalSettings);
      await showCustomAlert("成功", defaultSrc ? "已重置为默认图标！" : "没有默认信息，已重置为纯白！");
      return;
    }

    let newUrl = null;
    let isBase64 = false;
    if (choice === 'local') {
      newUrl = await new Promise(resolve => {
        const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
        input.onchange = e => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (re) => resolve(re.target.result); reader.readAsDataURL(file); } else { resolve(null); } };
        input.click();
      });
      if (newUrl) isBase64 = true;
    } else if (choice === 'url') {
      let currentUrl;
      if (phoneType === 'cphone') { currentUrl = state.globalSettings.cphoneAppIcons[iconId]; }
      else if (phoneType === 'myphone') { currentUrl = state.globalSettings.myphoneAppIcons[iconId]; }
      else { currentUrl = state.globalSettings.appIcons[iconId]; }
      const isCurrentUrlBase64 = currentUrl && currentUrl.startsWith('data:image');
      const initialValueForPrompt = isCurrentUrlBase64 ? '' : currentUrl;
      newUrl = await showCustomPrompt(`更换图标`, '请输入新的图片URL', initialValueForPrompt, 'url');
      if (newUrl) isBase64 = false;
    }

    if (newUrl && newUrl.trim()) {
      const trimmedUrl = newUrl.trim();
      itemElement.querySelector('.icon-preview').src = trimmedUrl;
      let dbPath;
      if (phoneType === 'cphone') { dbPath = `cphoneAppIcons.${iconId}`; state.globalSettings.cphoneAppIcons[iconId] = trimmedUrl; }
      else if (phoneType === 'myphone') { dbPath = `myphoneAppIcons.${iconId}`; state.globalSettings.myphoneAppIcons[iconId] = trimmedUrl; }
      else { dbPath = `appIcons.${iconId}`; state.globalSettings.appIcons[iconId] = trimmedUrl; }
      await db.globalSettings.put(state.globalSettings);
      await showCustomAlert("成功", "图标已更新！");
      if (isBase64) {
        (async () => { console.log(`[ImgBB] 启动 ${dbPath} 的静默上传...`); await silentlyUpdateDbUrl(db.globalSettings, 'main', dbPath, trimmedUrl); })();
      }
    } else if (newUrl !== null) { alert("请输入一个有效的URL或选择一个文件！"); }
  }

  window.handleIconChange = handleIconChange;

  // ========== 从 script.js 迁移：Reddit 相关函数 ==========

  async function handleRedditSearch(query = '') {
    const listEl = document.getElementById('char-reddit-list');
    listEl.innerHTML = '<div class="spinner"></div>';
    let targetUrl;
    if (query === 'popular' || !query) {
      targetUrl = `https://www.reddit.com/r/popular.json?limit=30&raw_json=1`;
    } else {
      targetUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=30&raw_json=1&sort=relevance`;
    }
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error("网络请求失败");
      const json = await response.json();
      const posts = json.data.children;
      renderRedditList(posts);
    } catch (error) {
      console.error("Reddit API Error:", error);
      listEl.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">无法连接到 Reddit，请检查网络或代理。</p>';
    }
  }

  async function openRedditDetail(post) {
    const isFromChat = document.getElementById('chat-interface-screen').classList.contains('active');
    const titleEl = document.getElementById('char-article-title');
    const contentEl = document.getElementById('char-article-content');
    const backBtn = document.querySelector('#char-browser-article-screen .back-btn');
    let headerActions = document.querySelector('#char-browser-article-screen .header .header-actions');
    if (!headerActions) {
      const header = document.querySelector('#char-browser-article-screen .header');
      headerActions = document.createElement('div'); headerActions.className = 'header-actions'; header.appendChild(headerActions);
    }
    titleEl.textContent = "加载中...";
    contentEl.innerHTML = '<div class="spinner" style="margin-top:50px;"></div>';
    if (isFromChat) { showScreen('character-phone-screen'); }
    switchToCharScreen('char-browser-article-screen');
    const newBackBtn = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(newBackBtn, backBtn);
    newBackBtn.onclick = () => { if (isFromChat) { showScreen('chat-interface-screen'); } else { switchToCharScreen('char-reddit-screen'); } };
    headerActions.innerHTML = '';
    const forwardBtn = document.createElement('span');
    forwardBtn.className = 'action-btn';
    forwardBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
    forwardBtn.title = "转发给TA";
    headerActions.appendChild(forwardBtn);
    contentEl.onclick = async (e) => {
      const link = e.target.closest('a.reddit-inner-link');
      if (link) {
        e.preventDefault();
        const href = link.href;
        const redditMatch = href.match(/reddit\.com\/r\/[^\/]+\/comments\/([a-zA-Z0-9]+)/);
        if (redditMatch) { const urlObj = new URL(href); await openRedditDetail({ permalink: urlObj.pathname }); } else { window.open(href, '_blank'); }
      }
    };
    try {
      const permalink = post.permalink;
      if (!permalink) throw new Error("无效的帖子链接");
      const targetUrl = `https://www.reddit.com${permalink}.json?raw_json=1`;
      const proxyUrlDetail = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
      const response = await fetch(proxyUrlDetail);
      if (!response.ok) throw new Error("无法加载帖子详情");
      const json = await response.json();
      const fullPostData = json[0].data.children[0].data;
      const commentsData = json[1].data.children;
      const postObjForForward = {
        id: fullPostData.id, title: fullPostData.title, subreddit_name_prefixed: fullPostData.subreddit_name_prefixed,
        author: fullPostData.author, score: fullPostData.score, num_comments: fullPostData.num_comments,
        permalink: fullPostData.permalink, selftext: fullPostData.selftext || '',
        thumbnail: (fullPostData.preview && fullPostData.preview.images[0]) ? fullPostData.preview.images[0].source.url.replace(/&amp;/g, '&') : (fullPostData.thumbnail && fullPostData.thumbnail.startsWith('http') ? fullPostData.thumbnail : null),
        url: fullPostData.url
      };
      forwardBtn.onclick = () => { forwardRedditPost(null, postObjForForward); };
      titleEl.textContent = fullPostData.subreddit_name_prefixed;
      let htmlContent = '';
      htmlContent += `<div style="margin-bottom: 15px;"><h2 style="font-size: 20px; font-weight: bold; margin: 0 0 8px 0;">${escapeHTML(fullPostData.title)}</h2><div style="color: #888; font-size: 12px;">u/${fullPostData.author} • ${new Date(fullPostData.created_utc * 1000).toLocaleString()}</div></div>`;
      const ytMatch = fullPostData.url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/);
      if (ytMatch) {
        htmlContent += `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; margin-bottom: 10px; background: #000;"><iframe src="https://www.youtube-nocookie.com/embed/${ytMatch[1]}?rel=0&modestbranding=1&playsinline=1" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" frameborder="0" allowfullscreen></iframe></div>`;
      } else if (fullPostData.is_video && fullPostData.media && fullPostData.media.reddit_video) {
        htmlContent += `<video controls playsinline poster="${fullPostData.thumbnail}" style="width: 100%; border-radius: 8px; margin-bottom: 5px; background: #000;"><source src="${fullPostData.media.reddit_video.fallback_url}" type="video/mp4"></video><div style="font-size:12px; color:#999; margin-bottom:15px;">⚠️ Reddit原生视频可能无声，<a href="${fullPostData.url}" target="_blank" style="color:#007aff;">点击此处跳转原网页观看</a></div>`;
      } else if (fullPostData.url && fullPostData.url.match(/\.(jpg|jpeg|png|gif)$/i)) {
        htmlContent += `<img src="${fullPostData.url}" style="width:100%; border-radius:8px; margin-bottom:15px;">`;
      } else if (fullPostData.preview && fullPostData.preview.images && fullPostData.preview.images.length > 0) {
        htmlContent += `<img src="${fullPostData.preview.images[0].source.url.replace(/&amp;/g, '&')}" style="width:100%; border-radius:8px; margin-bottom:15px;">`;
      }
      if (fullPostData.selftext) {
        let processedText = escapeHTML(fullPostData.selftext);
        processedText = processedText.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" class="reddit-inner-link" style="color:#007aff; text-decoration:none;">$1</a>');
        processedText = processedText.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" class="reddit-inner-link" style="color:#007aff; text-decoration:none;">🔗 Link</a>');
        processedText = processedText.replace(/\n/g, '<br>');
        htmlContent += `<div style="line-height:1.6; font-size:15px; color:#333; margin-bottom:20px; word-break: break-word;">${processedText}</div>`;
      }
      const score = fullPostData.score > 1000 ? (fullPostData.score / 1000).toFixed(1) + 'k' : fullPostData.score;
      htmlContent += `<div style="display:flex; gap:20px; padding:10px 0; border-top:1px solid #eee; border-bottom:1px solid #eee; margin-bottom:15px; font-size:13px; color:#555; align-items:center;"><span style="display:flex; align-items:center; gap:4px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#ff4500;"><path d="M12 19V5M5 12l7-7 7 7"/></svg> ${score} 赞</span><span style="display:flex; align-items:center; gap:4px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> ${fullPostData.num_comments} 评论</span></div>`;
      htmlContent += `<div style="font-weight:bold; margin-bottom:10px;">评论</div>`;
      if (commentsData.length === 0) { htmlContent += `<div style="text-align:center; color:#999; padding:20px;">暂无评论</div>`; }
      else { commentsData.forEach(child => { const c = child.data; if (!c.body) return; htmlContent += `<div class="reddit-comment-item" style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px solid #f9f9f9;"><div style="font-size:12px; color:#888; margin-bottom:4px; display:flex; justify-content:space-between;"><span style="color: #1c1c1e; font-weight: 500;">${c.author}</span><span>${c.score} pts</span></div><div style="font-size:14px; line-height:1.5; color:#333;">${escapeHTML(c.body).replace(/\n/g, '<br>')}</div></div>`; }); }
      contentEl.innerHTML = htmlContent;
      contentEl.scrollTop = 0;
    } catch (error) {
      console.error("Reddit Detail Error:", error);
      contentEl.innerHTML = `<div style="padding:20px; text-align:center;"><h3>加载失败</h3><p style="color:#888; font-size:14px;">${error.message}</p></div>`;
    }
  }

  function renderRedditList(posts) {
    const listEl = document.getElementById('char-reddit-list');
    listEl.innerHTML = '';
    if (!posts || posts.length === 0) { listEl.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">未找到内容</p>'; return; }
    posts.forEach(child => {
      const post = child.data;
      let previewImage = '';
      if (post.preview && post.preview.images && post.preview.images.length > 0) { previewImage = post.preview.images[0].source.url.replace(/&amp;/g, '&'); }
      else if (post.thumbnail && post.thumbnail.startsWith('http')) { previewImage = post.thumbnail; }
      const item = document.createElement('div'); item.className = 'reddit-post-item';
      const score = post.score > 1000 ? (post.score / 1000).toFixed(1) + 'k' : post.score;
      item.innerHTML = `<div class="reddit-vote-box"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #ff4500;"><path d="M12 19V5M5 12l7-7 7 7"/></svg><span style="font-weight:bold; margin-top:2px;">${score}</span></div><div class="reddit-content-box"><div class="reddit-meta"><div class="reddit-sub-icon"></div><strong>${post.subreddit_name_prefixed}</strong><span>• u/${post.author}</span></div><div class="reddit-title">${post.title}</div>${previewImage ? `<img src="${previewImage}" class="reddit-preview-img" loading="lazy">` : ''}<button class="reddit-forward-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>转发给TA</button></div>`;
      if (!window.redditPostCache) window.redditPostCache = new Map();
      window.redditPostCache.set(post.id, post);
      item.addEventListener('click', () => { openRedditDetail(post); });
      const fwdBtn = item.querySelector('.reddit-forward-btn');
      fwdBtn.addEventListener('click', (e) => { e.stopPropagation(); forwardRedditPost(post.id); });
      listEl.appendChild(item);
    });
  }

  async function forwardRedditPost(postId, directData = null) {
    let post;
    if (directData) { post = directData; } else { if (!window.redditPostCache) window.redditPostCache = new Map(); post = window.redditPostCache.get(postId); }
    if (!post) { alert("无法获取帖子数据"); return; }
    await openShareTargetPicker();
    const confirmBtn = document.getElementById('confirm-share-target-btn');
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
    newBtn.onclick = async () => {
      const selectedTargetIds = Array.from(document.querySelectorAll('.share-target-checkbox:checked')).map(cb => cb.dataset.chatId);
      if (selectedTargetIds.length === 0) return alert("请选择要转发到的聊天。");
      const redditMsg = { role: 'user', type: 'reddit_share', timestamp: Date.now(), redditData: { title: post.title, subreddit: post.subreddit_name_prefixed, author: post.author, score: post.score, num_comments: post.num_comments, permalink: post.permalink, image: post.thumbnail || (post.preview && post.preview.images[0] ? post.preview.images[0].source.url.replace(/&amp;/g, '&') : null), selftext: post.selftext ? post.selftext.substring(0, 150) + '...' : '' } };
      document.getElementById('share-target-modal').classList.remove('visible');
      await showCustomAlert("转发中...", "正在生成预览并发送，请稍候...");
      let fullContextForAI = `标题: "${post.title}"\n来自: ${post.subreddit_name_prefixed}\n`;
      if (post.selftext) { fullContextForAI += `\n[内容摘要]: ${post.selftext.substring(0, 500)}...\n`; }
      try {
        const targetUrl = `https://www.reddit.com${post.permalink}.json?raw_json=1`;
        const proxyUrlFwd = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        const res = await fetch(proxyUrlFwd);
        if (res.ok) { const json = await res.json(); const comments = json[1].data.children; if (comments.length > 0) { fullContextForAI += `\n[热门评论 (Top 3)]:\n`; comments.slice(0, 3).forEach((c, i) => { if (c.data.body) { fullContextForAI += `${i + 1}. ${c.data.author}: ${c.data.body.substring(0, 150)}\n`; } }); } }
      } catch (e) { console.warn("抓取详情失败，仅使用基本信息", e); }
      for (const targetId of selectedTargetIds) {
        const targetChat = state.chats[targetId];
        if (targetChat) {
          targetChat.history.push(redditMsg);
          targetChat.history.push({ role: 'system', content: `[系统提示：用户转发了一个 Reddit 帖子给你。\n请你阅读以下帖子详情和网友评论。\n注意：**用户还没有对此发表看法**，TA可能正在打字。请你**先不要回复**，耐心等待用户接下来的消息。\n---\n${fullContextForAI}\n---]`, timestamp: Date.now() + 1, isHidden: true });
          await db.chats.put(targetChat);
        }
      }
      document.querySelector('#custom-modal-overlay').classList.remove('visible');
      if (selectedTargetIds.length === 1) {
        showScreen('chat-interface-screen'); openChat(selectedTargetIds[0]);
        setTimeout(() => { const input = document.getElementById('chat-input'); if (input) input.focus(); }, 500);
      } else { alert(`已转发给 ${selectedTargetIds.length} 位好友。`); }
    };
  }

  window.handleRedditSearch = handleRedditSearch;
  window.openRedditDetail = openRedditDetail;
  window.renderRedditList = renderRedditList;
  window.forwardRedditPost = forwardRedditPost;

  // ========== 从 script.js 迁移：handleGenerateSimulatedReddit ==========

  async function handleGenerateSimulatedReddit() {
    if (!activeCharacterId) return;
    const chat = state.chats[activeCharacterId];
    if (!chat) return;
    await showCustomAlert("请稍候...", `正在深度分析"${chat.name}"的兴趣网络...`);
    const { proxyUrl, apiKey, model } = state.apiConfig;
    if (!proxyUrl || !apiKey || !model) { alert('请先在API设置中配置好API信息。'); return; }
    const userDisplayNameForAI = (state.qzoneSettings.nickname === '{{user}}' || !state.qzoneSettings.nickname) ? '用户' : state.qzoneSettings.nickname;
    const maxMemory = chat.settings.maxMemory || 10;
    const recentHistory_RAW = chat.history.slice(-maxMemory);
    const filteredHistory = await filterHistoryWithDoNotSendRules(recentHistory_RAW, activeCharacterId);
    const recentHistoryWithUser = filteredHistory.map(msg => `${msg.role === 'user' ? userDisplayNameForAI : chat.name}: ${String(msg.content).substring(0, 30)}...`).join('\n');
    const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0 ? chat.longTermMemory.map(mem => `- ${mem.content}`).join('\n') : '无';
    const worldBookContext = (chat.settings.linkedWorldBookIds || []).map(bookId => state.worldBooks.find(wb => wb.id === bookId)).filter(Boolean).map(book => `\n## 世界书《${book.name}》:\n${book.content.filter(e => e.enabled).map(e => `- ${e.content}`).join('\n')}`).join('');
    const systemPrompt = `
# 你的任务
你是一个虚拟用户画像分析师。你的任务是扮演角色"${chat.name}"，根据TA的人设、所处的世界观、长期记忆、以及与用户（${userDisplayNameForAI}）的最近互动，**推测TA现在最可能在 Reddit 上浏览或搜索的关键词**。

# 核心规则
1.  **语言策略**: 请根据角色的人设和想看的内容决定语言。如果角色想看国际新闻、技术文档、迷因 (Memes) 或特定外语内容，请生成【英文】关键词。如果角色想看中文圈的讨论、华语新闻或特定中文话题，请生成【中文】关键词。
2.  **深度人设绑定**: 关键词必须紧扣角色的性格、职业、爱好以及**世界观设定**。
3.  **多样性与数量 (关键)**: 请生成 **15到20个** 不同的关键词，涵盖角色兴趣的各个方面。
4.  **格式铁律**: 你的回复【必须且只能】是一个JSON数组格式的字符串。示例: \`["keyword1", "r/China_irl", "coding help", "猫咪", ...]\`

# 供你参考的详细上下文
- **角色人设**: ${chat.settings.aiPersona}
- **用户(${userDisplayNameForAI})的人设**: ${chat.settings.myPersona || '无'}
- **长期记忆**: 
${longTermMemoryContext}
${worldBookContext} 
- **最近对话**:
${recentHistoryWithUser}

现在，请生成这组详细的 Reddit 搜索关键词。`;
    try {
      const messagesForApi = [{ role: 'user', content: "请生成Reddit关键词列表。" }];
      let isGemini = proxyUrl.includes('generativelanguage');
      let geminiConfig = toGeminiRequestData(model, apiKey, systemPrompt, messagesForApi);
      const response = isGemini ?
        await fetch(geminiConfig.url, geminiConfig.data) :
        await fetch(`${proxyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: model, messages: [{ role: 'system', content: systemPrompt }, ...messagesForApi], temperature: state.globalSettings.apiTemperature || 1.0 })
        });
      if (!response.ok) throw new Error(`API 错误: ${response.statusText}`);
      const data = await response.json();
      const aiResponseContent = getGeminiResponseText(data);
      const cleanedJson = aiResponseContent.replace(/^```json\s*/, '').replace(/```$/, '');
      let keywords;
      try { keywords = JSON.parse(cleanedJson); } catch (e) { throw new Error("AI返回格式错误，无法解析JSON"); }
      if (!Array.isArray(keywords) || keywords.length === 0) throw new Error("AI没有返回有效的关键词数组。");
      await showCustomAlert("搜索中...", `AI 生成了 ${keywords.length} 个兴趣关键词，正在聚合全网内容... (这一步可能需要十几秒，请耐心等待)`);
      const listEl = document.getElementById('char-reddit-list');
      listEl.innerHTML = '<div class="spinner" style="margin-top:50px;"></div>';
      const queries = keywords;
      let aggregatedPosts = [];
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      const fetchRedditData = async (query) => {
        try {
          let tUrl;
          if (query.startsWith('r/')) { tUrl = `https://www.reddit.com/${query}/hot.json?limit=5&raw_json=1`; }
          else { tUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=5&raw_json=1&sort=relevance`; }
          const pUrl = `https://corsproxy.io/?${encodeURIComponent(tUrl)}`;
          const res = await fetch(pUrl);
          if (!res.ok) return [];
          const json = await res.json();
          return json.data.children;
        } catch (e) { console.warn(`搜索关键词 ${query} 失败:`, e); return []; }
      };
      for (const [index, query] of queries.entries()) {
        console.log(`[Reddit生成流] 正在搜索 (${index + 1}/${queries.length}): ${query}`);
        const posts = await fetchRedditData(query);
        if (posts && posts.length > 0) { aggregatedPosts.push(...posts); }
        await delay(600);
      }
      if (aggregatedPosts.length === 0) { throw new Error("所有关键词都未能搜索到内容，可能是网络问题或关键词太偏门。"); }
      const uniquePosts = []; const seenIds = new Set();
      for (let i = aggregatedPosts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [aggregatedPosts[i], aggregatedPosts[j]] = [aggregatedPosts[j], aggregatedPosts[i]]; }
      aggregatedPosts.forEach(item => { const post = item.data; if (!seenIds.has(post.id)) { seenIds.add(post.id); uniquePosts.push(item); } });
      const finalFeed = uniquePosts.slice(0, 30);
      chat.simulatedRedditFeed = finalFeed;
      await db.chats.put(chat);
      renderRedditList(finalFeed);
    } catch (error) {
      console.error("生成 Reddit 推荐失败:", error);
      await showCustomAlert("生成失败", `无法生成推荐内容。\n错误: ${error.message}`);
      handleRedditSearch('popular');
    }
  }

  window.handleGenerateSimulatedReddit = handleGenerateSimulatedReddit;
