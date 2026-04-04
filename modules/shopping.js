// ========== 购物中心模块 ==========
// 来源：script.js 第 2846~2877 行（购物车变量与持久化）
//        + 第 20932~21040 行（checkAndClearShoppingCart）
//        + 第 34505~35224 行（商品展示、购物车、结算、送礼、商品编辑）
//        + 第 53978~54415 行（分类管理、款式、AI生成商品、购物设置）

// 闭包变量，挂载到 window 以便其他模块访问
let shoppingCart = [];
window.shoppingCart = shoppingCart;
let editingProductId = null;
let activeProductId = null;
let selectedProducts = new Set();
let isProductManagementMode = false;
let activeShoppingCategoryId = 'all';

// ========== 购物车持久化功能 ==========
// 保存购物车到localStorage
function saveShoppingCart() {
  try {
    localStorage.setItem('shoppingCart', JSON.stringify(shoppingCart));
    console.log('购物车已保存', shoppingCart.length, '件商品');
  } catch (error) {
    console.error('保存购物车失败:', error);
  }
}

// 从localStorage加载购物车
function loadShoppingCart() {
  try {
    const saved = localStorage.getItem('shoppingCart');
    if (saved) {
      shoppingCart = JSON.parse(saved);
      window.shoppingCart = shoppingCart;
      console.log('购物车已恢复', shoppingCart.length, '件商品');
      updateCartCount();
    }
  } catch (error) {
    console.error('加载购物车失败:', error);
    shoppingCart = [];
    window.shoppingCart = shoppingCart;
  }
}
// ========== 购物车持久化功能结束 ==========

  // renderShoppingProducts 第一个版本已删除（管理按钮无条件渲染的旧版）
  // 保留下方的改进版（管理按钮仅在管理模式下渲染）

  function switchShoppingCategory(categoryId) {
    activeShoppingCategoryId = categoryId;
    renderShoppingProducts();
    updateDeleteCategoryButtonVisibility();
  }

  function updateDeleteCategoryButtonVisibility() {
    const deleteBtn = document.getElementById('delete-current-category-btn');
    if (!deleteBtn) return;




    const isVisible = isProductManagementMode && activeShoppingCategoryId !== 'all';
    deleteBtn.style.display = isVisible ? 'flex' : 'none';
  }


  async function handleDeleteCurrentCategory() {
    if (activeShoppingCategoryId === 'all') return;

    const categoryId = activeShoppingCategoryId;
    const category = await db.shoppingCategories.get(categoryId);
    if (!category) {
      alert("错误：找不到要删除的分类。");
      return;
    }

    const confirmMessage = `确定要永久删除分类 "${category.name}" 吗？\n\n此操作【不会】删除分类下的商品，它们将被移至"未分类"。`;
    const confirmed = await showCustomConfirm('确认删除分类', confirmMessage, {
      confirmButtonClass: 'btn-danger',
      confirmText: '确认删除'
    });

    if (confirmed) {

      await deleteProductCategory(categoryId);


      activeShoppingCategoryId = 'all';
      await renderShoppingProducts();


      updateDeleteCategoryButtonVisibility();

      await showCustomAlert("成功", `分类 "${category.name}" 已被删除。`);
    }
  }



  async function openShoppingScreen() {
    activeShoppingCategoryId = 'all';
    await renderShoppingProducts();
    showScreen('shopping-screen');
    updateDeleteCategoryButtonVisibility();
  }


  async function renderShoppingProducts() {
    const gridEl = document.getElementById('product-grid');
    const tabsContainer = document.getElementById('product-category-tabs');
    const shoppingScreen = document.getElementById('shopping-screen');
    gridEl.innerHTML = '';
    tabsContainer.innerHTML = '';


    const [allProducts, allCategories] = await Promise.all([
      db.shoppingProducts.toArray(),
      db.shoppingCategories.orderBy('name').toArray()
    ]);

    shoppingScreen.classList.toggle('management-mode', isProductManagementMode);


    const allTab = document.createElement('button');
    allTab.className = 'product-category-tab';
    allTab.textContent = '全部';
    allTab.dataset.categoryId = 'all';
    if (activeShoppingCategoryId === 'all') allTab.classList.add('active');
    tabsContainer.appendChild(allTab);

    allCategories.forEach(cat => {
      const tab = document.createElement('button');
      tab.className = 'product-category-tab';
      tab.textContent = cat.name;
      tab.dataset.categoryId = cat.id;
      if (activeShoppingCategoryId === cat.id) tab.classList.add('active');
      tabsContainer.appendChild(tab);
    });


    let productsToShow;
    if (activeShoppingCategoryId === 'all') {
      productsToShow = allProducts;
    } else {
      productsToShow = allProducts.filter(p => p.categoryId === activeShoppingCategoryId);
    }


    if (productsToShow.length === 0) {
      const message = activeShoppingCategoryId === 'all' ?
        '商店空空如也，点击"管理"添加商品吧！' :
        '这个分类下还没有商品哦~';
      gridEl.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); margin-top: 50px;">${message}</p>`;
      return;
    }

    productsToShow.forEach(product => {
      const item = document.createElement('div');
      item.className = 'product-item';
      item.dataset.id = product.id;

      const managementControls = isProductManagementMode ? `
            <div class="product-management-overlay">
                <button class="edit-product-btn">编辑</button>
                <button class="delete-product-btn">删除</button>
            </div>
        ` : '';

      item.innerHTML = `
            ${managementControls}
            <img src="${product.imageUrl}" class="product-image">
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                <div class="product-footer">
                    <div class="product-price">${product.price.toFixed(2)}</div>
                    <button class="add-to-cart-btn">加入购物车</button>
                </div>
            </div>
        `;
      gridEl.appendChild(item);
    });
  }


  async function addToCart(productId, quantity = 1, variation = null) {

    const existingItem = variation ?
      shoppingCart.find(item => item.productId === productId && item.variation?.name === variation.name) :
      shoppingCart.find(item => item.productId === productId && !item.variation);

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      const product = await db.shoppingProducts.get(productId);
      if (product) {
        shoppingCart.push({
          productId: product.id,
          quantity: quantity,
          variation: variation
        });
      }
    }
    updateCartCount();
    saveShoppingCart(); // 保存购物车
  }


  function updateCartItemQuantity(productId, change) {
    const itemIndex = shoppingCart.findIndex(item => item.productId === productId);
    if (itemIndex > -1) {
      shoppingCart[itemIndex].quantity += change;
      if (shoppingCart[itemIndex].quantity <= 0) {
        shoppingCart.splice(itemIndex, 1);
      }
      updateCartCount();
      renderCartItems();
      saveShoppingCart(); // 保存购物车
    }
  }


  function updateCartCount() {
    const totalItems = shoppingCart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cart-count').textContent = totalItems;
    document.getElementById('cart-title').textContent = `购物车(${totalItems})`;
    document.getElementById('checkout-btn').textContent = `结算(${totalItems})`;
  }


  function openCartScreen() {
    renderCartItems();
    showScreen('cart-screen');
  }



  async function renderCartItems() {
    const listEl = document.getElementById('cart-items-list');
    listEl.innerHTML = '';
    let total = 0;

    if (shoppingCart.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary); margin-top: 50px;">购物车是空的哦~</p>';
    } else {
      const productIds = shoppingCart.map(item => item.productId);
      const products = await db.shoppingProducts.where('id').anyOf(productIds).toArray();
      const productMap = new Map(products.map(p => [p.id, p]));

      shoppingCart.forEach(item => {
        const product = productMap.get(item.productId);
        if (product) {
          const itemEl = document.createElement('div');
          itemEl.className = 'cart-item';


          const variationHtml = item.variation ?
            `<div class="cart-item-variation" style="font-size: 12px; color: #8a8a8a; margin-top: 4px;">款式: ${item.variation.name}</div>` :
            '';

          itemEl.innerHTML = `
                            <input type="checkbox" class="cart-item-checkbox" data-id="${product.id}" checked>
                            <img src="${item.variation?.imageUrl || product.imageUrl}" class="cart-item-image">
                            <div class="cart-item-info">
                                <div class="cart-item-name">${product.name}</div>
                                ${variationHtml}
                                <div class="cart-item-footer">
                                    <div class="cart-item-price">¥${(item.variation?.price || product.price).toFixed(2)}</div>
                                    <div class="quantity-control">
                                        <button class="quantity-btn decrease-qty-btn" data-id="${product.id}">-</button>
                                        <span class="quantity-display">${item.quantity}</span>
                                        <button class="quantity-btn increase-qty-btn" data-id="${product.id}">+</button>
                                    </div>
                                </div>
                            </div>
                        `;
          listEl.appendChild(itemEl);
        }
      });
    }
    updateCartTotal();
  }



  async function updateCartTotal() {
    let total = 0;
    const selectedCheckboxes = document.querySelectorAll('.cart-item-checkbox:checked');
    const selectedProductIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.id));

    if (selectedProductIds.length > 0) {
      const products = await db.shoppingProducts.where('id').anyOf(selectedProductIds).toArray();
      const productMap = new Map(products.map(p => [p.id, p]));

      shoppingCart.forEach(cartItem => {
        if (selectedProductIds.includes(cartItem.productId)) {
          const product = productMap.get(cartItem.productId);
          if (product) {

            const price = cartItem.variation ? cartItem.variation.price : product.price;
            total += price * cartItem.quantity;
          }
        }
      });
    }
    document.getElementById('cart-total').textContent = `合计: ¥${total.toFixed(2)}`;
  }


  async function openGiftRecipientPicker() {
    const chat = state.chats[state.activeChatId];
    if (!chat || !chat.isGroup) return;

    const modal = document.getElementById('gift-recipient-modal');
    const listEl = document.getElementById('gift-recipient-list');
    listEl.innerHTML = '';


    const myNickname = chat.settings.myNickname || '我';
    const members = chat.members.filter(m => m.groupNickname !== myNickname);

    members.forEach(member => {
      const item = document.createElement('div');
      item.className = 'contact-picker-item';

      item.dataset.recipientName = member.originalName;

      item.innerHTML = `
                    <div class="checkbox"></div>
                    <img src="${member.avatar || defaultGroupMemberAvatar}" class="avatar">
                    <span class="name">${member.groupNickname}</span>
                `;
      listEl.appendChild(item);
    });


    document.getElementById('select-all-recipients').checked = false;
    modal.classList.add('visible');
  }


  // --- 修复版V2：购物结算 (修复ID解析bug，确保扣款和记账) ---
  async function handleCheckout() {
    const chat = state.chats[state.activeChatId];
    const selectedItems = shoppingCart.filter(item =>
      document.querySelector(`.cart-item-checkbox[data-id="${item.productId}"]:checked`)
    );

    if (selectedItems.length === 0) {
      alert("请先在购物车中选择要结算的商品。");
      return;
    }

    // 计算总价
    const productIds = selectedItems.map(item => item.productId);
    const products = await db.shoppingProducts.where('id').anyOf(productIds).toArray();
    const productMap = new Map(products.map(p => [p.id, p]));

    let totalCost = 0;
    selectedItems.forEach(cartItem => {
      const product = productMap.get(cartItem.productId);
      if (product) {
        const price = cartItem.variation ? cartItem.variation.price : product.price;
        totalCost += price * cartItem.quantity;
      }
    });

    // 1. 准备支付选项
    const wallet = await db.userWallet.get('main') || { balance: 0, kinshipCards: [] };
    const balance = wallet.balance || 0;
    const kinshipCards = wallet.kinshipCards || [];

    const iconWallet = `<div class="pay-opt-icon" style="background:#1677ff; display:flex; align-items:center; justify-content:center; color:white; font-size:14px; border-radius:4px;">支</div>`;
    const iconKinship = `<div class="pay-opt-icon" style="background:linear-gradient(135deg, #ff5252, #ff1744); display:flex; align-items:center; justify-content:center; color:white; font-size:14px; border-radius:4px;">亲</div>`;

    const paymentOptions = [];

    if (balance >= totalCost) {
      paymentOptions.push({
        text: `<div class="pay-opt-left">${iconWallet}<div class="pay-opt-info"><span class="pay-opt-title">账户余额</span><span class="pay-opt-desc">剩余 ¥${balance.toFixed(2)}</span></div></div>`,
        value: 'balance'
      });
    }

    kinshipCards.forEach(card => {
      const providerChat = state.chats[card.chatId];
      const name = providerChat ? providerChat.name : '未知';
      const remaining = card.limit - (card.spent || 0);

      if (remaining >= totalCost) {
        paymentOptions.push({
          text: `<div class="pay-opt-left">${iconKinship}<div class="pay-opt-info"><span class="pay-opt-title">亲属卡 - ${name}</span><span class="pay-opt-desc">剩余额度 ¥${remaining.toFixed(2)}</span></div></div>`,
          value: `kinship_${card.chatId}`
        });
      }
    });

    if (paymentOptions.length === 0) {
      await showCustomAlert('支付失败', `余额或亲属卡额度不足！\n需要: ¥${totalCost.toFixed(2)}`);
      return;
    }

    // 2. 弹出支付选择
    const paymentMethod = await showChoiceModal(`支付 ¥${totalCost.toFixed(2)}`, paymentOptions);
    if (!paymentMethod) return;

    let transactionDesc = selectedItems.length === 1 ? `购买-${productMap.get(selectedItems[0].productId).name}` : `购买-${selectedItems.length}件商品`;

    // 3. 执行扣款和记账
    if (paymentMethod === 'balance') {
      const success = await processTransaction(totalCost, 'expense', transactionDesc);
      if (!success) return;
    } else if (paymentMethod.startsWith('kinship_')) {
      const cardChatId = paymentMethod.replace('kinship_', '');
      const cardIndex = wallet.kinshipCards.findIndex(c => c.chatId === cardChatId);

      if (cardIndex > -1) {
        // A. 扣额度
        wallet.kinshipCards[cardIndex].spent = (wallet.kinshipCards[cardIndex].spent || 0) + totalCost;
        await db.userWallet.put(wallet);

        // B. 记账
        await db.userTransactions.add({
          timestamp: Date.now(),
          type: 'expense',
          amount: totalCost,
          description: `亲属卡-${transactionDesc}`
        });

        // C. 通知金主 (生成可见的系统通知，方便删除)
        const providerChat = state.chats[cardChatId];
        if (providerChat) {
          const itemNames = selectedItems.map(i => productMap.get(i.productId).name).join('、');
          const remaining = wallet.kinshipCards[cardIndex].limit - wallet.kinshipCards[cardIndex].spent;

          const notifyMsg = {
            role: 'system',
            type: 'pat_message', // 【修改】使用灰色系统消息样式
            content: `你使用亲属卡消费 ¥${totalCost.toFixed(2)} 购买了：${itemNames} (余 ¥${remaining.toFixed(2)})`,
            timestamp: Date.now()
            // 【修改】移除 isHidden: true，使其可见
          };
          providerChat.history.push(notifyMsg);
          await db.chats.put(providerChat);

          // 如果当前就在该聊天，立即显示
          if (state.activeChatId === cardChatId) {
            appendMessage(notifyMsg, providerChat);
          }
        }
      } else {
        alert("系统错误：找不到对应的亲属卡记录，支付取消。");
        return;
      }
    }

    // 4. 后续逻辑：选择用途 (送礼 vs 自用)
    if (chat.isGroup) {
      // 群聊逻辑保持不变：选择群友赠送
      openGiftRecipientPicker();
    } else {
      // 单聊逻辑：增加选择弹窗
      const usageChoice = await showChoiceModal('购买成功！请选择用途', [
        { text: '🎁 送给 TA', value: 'gift' },
        { text: '🛍️ 留给自己', value: 'self' }
      ]);

      if (usageChoice === 'gift') {
        // 送礼流程 (sendGiftMessage 内部会处理购物车清理和跳转)
        await sendGiftMessage(selectedItems);
      } else {
        // 自用流程
        // 1. 从购物车移除商品
        shoppingCart = shoppingCart.filter(item => !selectedItems.some(sent => sent.productId === item.productId));
        updateCartCount();
        saveShoppingCart(); // 保存购物车

        // 2. 如果是余额支付，也补一条可见通知 (亲属卡刚才已经发过了)
        if (paymentMethod === 'balance') {
          const itemNames = selectedItems.map(i => productMap.get(i.productId).name).join('、');
          const selfBuyMsg = {
            role: 'system',
            type: 'pat_message',
            content: `你购买了：${itemNames}`,
            timestamp: Date.now()
          };
          chat.history.push(selfBuyMsg);
          await db.chats.put(chat);
        }

        // 3. 返回聊天界面
        showScreen('chat-interface-screen');
        // 如果刚才有新消息推入（余额支付通知），刷新一下界面
        if (paymentMethod === 'balance') {
          renderChatInterface(state.activeChatId);
        }
      }
    }
  }


  async function sendGiftMessage(itemsToSend, recipients = null) {
    if (!state.activeChatId) return;
    const chat = state.chats[state.activeChatId];

    const productIds = itemsToSend.map(item => item.productId);
    const products = await db.shoppingProducts.where('id').anyOf(productIds).toArray();
    const productMap = new Map(products.map(p => [p.id, p]));

    const itemsForMessage = itemsToSend.map(cartItem => {
      const product = productMap.get(cartItem.productId);
      if (cartItem.variation) {

        return {
          name: `${product.name} - ${cartItem.variation.name}`,
          price: cartItem.variation.price,
          imageUrl: cartItem.variation.imageUrl || product.imageUrl,
          quantity: cartItem.quantity
        };
      } else {

        return {
          name: product.name,
          price: product.price,
          imageUrl: product.imageUrl,
          quantity: cartItem.quantity
        };
      }
    });
    const giftMessage = {
      role: 'user',
      type: 'gift',
      timestamp: Date.now(),
      items: itemsForMessage,
      total: itemsForMessage.reduce((sum, item) => sum + item.price * item.quantity, 0),
      recipients: recipients
    };

    chat.history.push(giftMessage);


    if (recipients && recipients.length > 0) {
      const recipientDisplayNames = recipients.map(originalName => getDisplayNameInGroup(chat, originalName)).join('、');
      const hiddenMessage = {
        role: 'system',
        content: `[系统提示：用户 (${chat.settings.myNickname || '我'}) 送出了一份礼物，收礼人是：${recipientDisplayNames}。请收礼的角色表示感谢，其他角色可以自由发挥。]`,
        timestamp: Date.now() + 1,
        isHidden: true
      };
      chat.history.push(hiddenMessage);
    }

    await db.chats.put(chat);

    appendMessage(giftMessage, chat);
    renderChatList();


    shoppingCart = shoppingCart.filter(item => !itemsToSend.some(sent => sent.productId === item.productId));
    updateCartCount();
    saveShoppingCart(); // 保存购物车
    showScreen('chat-interface-screen');

    await showCustomAlert('成功', '礼物已成功送出！');
  }


  function showGiftReceipt(timestamp) {

    const chat = state.chats[state.activeChatId];
    const message = chat.history.find(m => m.timestamp === timestamp);
    if (!message || message.type !== 'gift') return;
    const receiptBody = document.getElementById('gift-receipt-body');
    let itemsHtml = '';
    message.items.forEach(item => {
      itemsHtml += `<tr><td class="item-name">${item.name}</td><td class="item-qty">${item.quantity}</td><td class="item-price">¥${item.price.toFixed(2)}</td><td class="item-subtotal">¥${(item.price * item.quantity).toFixed(2)}</td></tr>`;
    });
    receiptBody.innerHTML = `<div class="receipt-header"><h3>购物中心</h3><p>交易时间: ${new Date(message.timestamp).toLocaleString()}</p></div><table class="receipt-items-table"><thead><tr><th class="item-name">商品</th><th class="item-qty">数量</th><th class="item-price">单价</th><th class="item-subtotal">小计</th></tr></thead><tbody>${itemsHtml}</tbody></table><div class="receipt-total">总计: ¥${message.total.toFixed(2)}</div><div class="receipt-footer">感谢您的惠顾，欢迎再次光临！</div>`;
    document.getElementById('gift-receipt-modal').classList.add('visible');
  }


  async function openProductEditor(productId = null) {
    editingProductId = productId;
    const modal = document.getElementById('product-editor-modal');
    const title = document.getElementById('product-editor-title');
    const nameInput = document.getElementById('product-name-input');
    const priceInput = document.getElementById('product-price-input');
    const descInput = document.getElementById('product-description-input');
    const imagePreview = document.getElementById('product-image-preview');
    const categorySelect = document.getElementById('product-category-select');
    const variationsContainer = document.getElementById('product-variations-container');


    variationsContainer.innerHTML = '';


    categorySelect.innerHTML = '<option value="">-- 未分类 --</option>';
    const categories = await db.shoppingCategories.toArray();
    categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = cat.name;
      categorySelect.appendChild(option);
    });

    if (productId) {
      title.textContent = '编辑商品';
      const product = await db.shoppingProducts.get(productId);
      nameInput.value = product.name;
      priceInput.value = product.price;
      descInput.value = product.description || '';
      imagePreview.src = product.imageUrl;
      categorySelect.value = product.categoryId || '';


      if (product.variations && product.variations.length > 0) {
        product.variations.forEach(v => addProductVariationInput(v));
      }

    } else {
      title.textContent = '添加商品';
      nameInput.value = '';
      priceInput.value = '';
      descInput.value = '';
      imagePreview.src = 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1756206115802_qdqqd_0c99bh.jpeg';
      categorySelect.value = '';
    }
    modal.classList.add('visible');
  }
  async function saveProduct() {
    const name = document.getElementById('product-name-input').value.trim();
    const price = parseFloat(document.getElementById('product-price-input').value);
    const description = document.getElementById('product-description-input').value.trim();
    const imageUrl = document.getElementById('product-image-preview').src;
    const categoryId = parseInt(document.getElementById('product-category-select').value) || null;

    if (!name) {
      alert('商品名称不能为空！');
      return;
    }
    if (isNaN(price) || price < 0) {
      alert('请输入有效的默认价格！');
      return;
    }


    const variations = [];
    document.querySelectorAll('.variation-block').forEach(block => {
      const varName = block.querySelector('.variation-name-input').value.trim();
      const varPrice = parseFloat(block.querySelector('.variation-price-input').value);
      const varImageUrl = block.querySelector('.variation-image-preview').src;

      if (varName && !isNaN(varPrice) && varPrice >= 0) {
        variations.push({
          name: varName,
          price: varPrice,
          imageUrl: varImageUrl.includes('placeholder.png') ? null : varImageUrl
        });
      }
    });

    const productData = {
      name,
      price,
      description,
      imageUrl,
      categoryId,
      variations
    };

    if (editingProductId) {
      await db.shoppingProducts.update(editingProductId, productData);
    } else {
      await db.shoppingProducts.add(productData);
    }
    document.getElementById('product-editor-modal').classList.remove('visible');
    await renderShoppingProducts();
  }


  async function openProductCategoryManager() {
    await renderProductCategoriesInManager();
    document.getElementById('product-category-manager-modal').classList.add('visible');
  }


  async function renderProductCategoriesInManager() {
    const listEl = document.getElementById('existing-product-categories-list');
    const categories = await db.shoppingCategories.toArray();
    listEl.innerHTML = '';
    if (categories.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">还没有任何分类</p>';
      return;
    }
    categories.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'existing-group-item';
      item.innerHTML = `
            <span class="group-name">${cat.name}</span>
            <span class="delete-group-btn" data-id="${cat.id}">×</span>
        `;
      listEl.appendChild(item);
    });
  }


  async function addNewProductCategory() {
    const input = document.getElementById('new-product-category-name-input');
    const name = input.value.trim();
    if (!name) return alert('分类名不能为空！');
    const existing = await db.shoppingCategories.where('name').equals(name).first();
    if (existing) return alert(`分类 "${name}" 已经存在了！`);

    await db.shoppingCategories.add({
      name
    });
    input.value = '';
    await renderProductCategoriesInManager();
  }


  async function deleteProductCategory(categoryId) {
    const confirmed = await showCustomConfirm('确认删除', '删除分类后，该分类下的所有商品将变为"未分类"。确定吗？', {
      confirmButtonClass: 'btn-danger'
    });
    if (confirmed) {
      await db.shoppingCategories.delete(categoryId);
      await db.shoppingProducts.where('categoryId').equals(categoryId).modify({
        categoryId: null
      });
      await renderProductCategoriesInManager();
    }
  }


  function addProductVariationInput(variation = {}) {
    const container = document.getElementById('product-variations-container');
    const block = document.createElement('div');
    block.className = 'message-editor-block variation-block'; // 复用样式
    block.innerHTML = `
        <button class="delete-block-btn" title="删除此款式">×</button>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="form-group">
                <label style="font-size: 0.8em;">款式名称</label>
                <input type="text" class="variation-name-input" placeholder="例如: 红色" value="${variation.name || ''}">
            </div>
            <div class="form-group">
                <label style="font-size: 0.8em;">价格 (元)</label>
                <input type="number" class="variation-price-input" min="0" step="0.01" value="${variation.price || ''}">
            </div>
        </div>
        <div class="form-group">
            <label style="font-size: 0.8em;">款式图片 (可选)</label>
            <div class="avatar-upload">
                <img class="variation-image-preview" src="${variation.imageUrl || 'https://i.postimg.cc/PqYp5T5M/image.png'}">
                <button type="button" class="form-button-secondary upload-variation-image-btn" style="margin: 0; padding: 8px 12px;">上传</button>
                <input type="file" class="variation-image-input" accept="image/*" hidden>
            </div>
        </div>
    `;

    block.querySelector('.delete-block-btn').addEventListener('click', () => block.remove());
    block.querySelector('.upload-variation-image-btn').addEventListener('click', () => {
      block.querySelector('.variation-image-input').click();
    });
    block.querySelector('.variation-image-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (re) => {
          block.querySelector('.variation-image-preview').src = re.target.result;
        };
        reader.readAsDataURL(file);
      }
    });

    container.appendChild(block);
    return block;
  }

  async function openVariationSelector(productId) {
    const product = await db.shoppingProducts.get(productId);
    if (!product || !product.variations || product.variations.length === 0) return;

    const modal = document.getElementById('variation-selection-modal');
    document.getElementById('variation-product-image').src = product.imageUrl;
    document.getElementById('variation-product-name').textContent = product.name;

    const optionsContainer = document.getElementById('variation-options-container');
    optionsContainer.innerHTML = '';

    product.variations.forEach((variation, index) => {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'variation-select';
      radio.id = `var-${productId}-${index}`;
      radio.value = index;
      radio.style.display = 'none';
      if (index === 0) radio.checked = true;

      const label = document.createElement('label');
      label.htmlFor = `var-${productId}-${index}`;
      label.textContent = variation.name;
      label.style.cssText = `
            padding: 6px 12px;
            border: 1px solid #ccc;
            border-radius: 15px;
            cursor: pointer;
            transition: all 0.2s;
        `;

      optionsContainer.appendChild(radio);
      optionsContainer.appendChild(label);
    });

    const updateSelectionUI = () => {
      const selectedRadio = optionsContainer.querySelector('input[name="variation-select"]:checked');
      optionsContainer.querySelectorAll('label').forEach(lbl => {
        lbl.style.borderColor = '#ccc';
        lbl.style.color = '#333';
        lbl.style.backgroundColor = 'white';
      });
      if (selectedRadio) {
        const selectedLabel = optionsContainer.querySelector(`label[for="${selectedRadio.id}"]`);
        selectedLabel.style.borderColor = 'var(--accent-color)';
        selectedLabel.style.color = 'var(--accent-color)';
        selectedLabel.style.backgroundColor = '#e7f3ff';

        const selectedVariation = product.variations[parseInt(selectedRadio.value)];
        document.getElementById('variation-selected-price').textContent = `¥${selectedVariation.price.toFixed(2)}`;
        if (selectedVariation.imageUrl) {
          document.getElementById('variation-product-image').src = selectedVariation.imageUrl;
        } else {
          document.getElementById('variation-product-image').src = product.imageUrl;
        }
      }
    };

    optionsContainer.addEventListener('change', updateSelectionUI);
    updateSelectionUI();

    document.getElementById('variation-quantity-display').textContent = '1';

    const confirmBtn = document.getElementById('confirm-variation-selection-btn');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', async () => {
      const selectedRadio = optionsContainer.querySelector('input[name="variation-select"]:checked');
      const quantity = parseInt(document.getElementById('variation-quantity-display').textContent);
      if (selectedRadio) {
        const selectedVariation = product.variations[parseInt(selectedRadio.value)];
        await addToCart(productId, quantity, selectedVariation);
        modal.classList.remove('visible');
        await showCustomAlert('成功', '已成功加入购物车！');
      }
    });

    modal.classList.add('visible');
  }


  function openShoppingSettingsModal() {
    const modal = document.getElementById('shopping-settings-modal');

    // 从全局设置中读取已保存的值，如果没有就使用默认值
    document.getElementById('shopping-category-count-input').value = state.globalSettings.shoppingCategoryCount || 3;
    document.getElementById('shopping-product-count-input').value = state.globalSettings.shoppingProductCount || 8;

    modal.classList.add('visible');
  }


  async function saveShoppingSettings() {
    const categoryInput = document.getElementById('shopping-category-count-input');
    const productInput = document.getElementById('shopping-product-count-input');

    const categoryCount = parseInt(categoryInput.value);
    const productCount = parseInt(productInput.value);


    if (isNaN(categoryCount) || isNaN(productCount) || categoryCount < 1 || productCount < 1) {
      alert("请输入有效的正整数！");
      return;
    }


    state.globalSettings.shoppingCategoryCount = categoryCount;
    state.globalSettings.shoppingProductCount = productCount;
    await db.globalSettings.put(state.globalSettings);


    document.getElementById('shopping-settings-modal').classList.remove('visible');
    await showCustomAlert('保存成功', '购物中心生成设置已更新！');
  }


  async function handleGenerateShoppingItems() {

    if (!state.activeChatId) {
      await showCustomAlert("操作失败", "请先进入一个聊天页面，再返回购物中心进行生成，以便AI了解要为哪个角色生成商品。");
      return;
    }
    const chat = state.chats[state.activeChatId];

    const confirmed = await showCustomConfirm(
      `为"${chat.name}"生成商品？`,
      '此操作将使用AI生成新的商品和分类，并【添加】到现有列表中。确定要继续吗？', {
      confirmText: '确认生成'
    }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", `正在根据"${chat.name}"的特点生成专属商品...`);


    const useSecondaryApi = state.apiConfig.secondaryProxyUrl && state.apiConfig.secondaryApiKey && state.apiConfig.secondaryModel;
    const {
      proxyUrl,
      apiKey,
      model
    } = useSecondaryApi
        ?
        {
          proxyUrl: state.apiConfig.secondaryProxyUrl,
          apiKey: state.apiConfig.secondaryApiKey,
          model: state.apiConfig.secondaryModel
        } :
        state.apiConfig;

    if (!proxyUrl || !apiKey || !model) {
      await showCustomAlert("API未配置", "请先在API设置中配置好（主或副）API。");
      return;
    }

    const categoryCount = state.globalSettings.shoppingCategoryCount || 3;
    const productCount = state.globalSettings.shoppingProductCount || 8;

    const existingCategories = await db.shoppingCategories.toArray();
    let existingCategoriesContext = "";
    if (existingCategories.length > 0) {
      existingCategoriesContext = `
# 【分类复用铁律 (最高优先级！)】
在为新商品指定分类时，你【必须】首先检查下面的"已有分类列表"。
-   如果一个新商品可以被归入某个【已存在的分类】，你【必须】复用那个分类的名称，而不是创造一个相似的新分类！
-   只有当你确定商品【绝对】不属于任何一个已有分类时，你才能创造一个新的分类名称。
-   **已有分类列表**: [${existingCategories.map(c => `"${c.name}"`).join(', ')}]
`;
    }

    const userNickname = state.qzoneSettings.nickname || '我';
    const longTermMemoryContext = chat.longTermMemory && chat.longTermMemory.length > 0 ?
      chat.longTermMemory.map(mem => `- (记录于 ${formatTimeAgo(mem.timestamp)}) ${mem.content}`).join('\n') :
      '无';
    const recentHistoryContext = chat.history.slice(-10).map(msg =>
      `${msg.role === 'user' ? userNickname : chat.name}: ${String(msg.content).substring(0, 30)}...`
    ).join('\n');

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
        const enabledEntries = worldBook.content
          .filter(entry => entry.enabled !== false)
          .map(entry => `- ${entry.content}`)
          .join('\n');
        return enabledEntries ? `\n## 来自《${worldBook.name}》:\n${enabledEntries}` : '';
      }).filter(Boolean).join('');

      if (linkedContents) {
        worldBookContext = `\n# 世界观设定 (必须参考)\n${linkedContents}\n`;
      }
    }

    const systemPrompt = `
# 你的任务
你是一个虚拟的、极具创造力的商品规划师。你的任务是为下面的角色"${chat.name}"量身打造一个专属的商品列表。

# 核心规则
1.  **【角色定制(最高优先级)】**: 你生成的所有商品和分类【必须】深度绑定角色的性格、记忆和最近的对话。它们应该是角色会真正感兴趣、购买或制作的东西。
2.  **创造性与合理性**: 商品和分类必须合理且多样化。
3.  **格式铁律 (最高优先级)**: 
    - 你的回复【必须且只能】是一个【单一的JSON对象】。
    - 你的回复必须以 \`{\` 开始，并以 \`}\` 结束。
    - 【绝对禁止】在JSON对象前后添加任何多余的文字、解释或 markdown 标记。
    - 格式【必须】如下:
    \`\`\`json
    {
      "categories": [
        {
          "name": "分类名称1",
          "products": [
            {
              "name": "商品名称1",
              "price": 99.80,
              "description": "这是商品的详细描述，不少于50字...",
              "variations": [
                { "name": "款式1", "price": 108.80, "image_prompt": "款式1的图片【英文】关键词..." },
                { "name": "款式2", "price": 118.80, "image_prompt": "款式2的图片【英文】关键词..." }
              ],
              "image_prompt": "商品主图的【英文】关键词, 风格为 realistic product photo, high quality, on a clean white background"
            }
          ]
        }
      ]
    }
    \`\`\`
    - **categories**: 生成 ${categoryCount} 个分类。
    - **products**: 每个分类下生成 ${productCount} 个商品。
    - **variations**: 每个商品【必须】包含【2到4个】不同的款式。

# 角色与上下文 (你的灵感来源)
- **角色名称**: ${chat.name}
- **角色人设**: ${chat.settings.aiPersona}
- **长期记忆**: ${longTermMemoryContext}
- **世界书设定**: ${worldBookContext}
${existingCategoriesContext}
- **最近对话摘要**:
${recentHistoryContext}

现在，请根据以上【所有上下文信息】，开始为"${chat.name}"生成这组【与角色高度相关】的商品数据。`;

    try {
      const messagesForApi = [{
        role: 'user',
        content: "请根据以上设定，生成商品数据。"
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
      const generatedData = JSON.parse(jsonMatch[0]);

      if (!generatedData.categories || !Array.isArray(generatedData.categories)) {
        throw new Error("AI返回的JSON格式不正确，缺少 'categories' 数组。");
      }


      await db.transaction('rw', db.shoppingProducts, db.shoppingCategories, async () => {
        for (const category of generatedData.categories) {
          let categoryId;
          const existingCategory = await db.shoppingCategories.where('name').equalsIgnoreCase(category.name).first();
          if (existingCategory) {
            categoryId = existingCategory.id;
          } else {
            categoryId = await db.shoppingCategories.add({
              name: category.name
            });
          }
          const productsToAdd = category.products.map(product => {
            return {
              name: product.name,
              price: product.price || 0,
              description: product.description || '',
              imageUrl: getPollinationsImageUrl(product.image_prompt),
              variations: (product.variations || []).map(v => ({
                ...v,
                imageUrl: getPollinationsImageUrl(v.image_prompt)
              })),
              categoryId: categoryId
            };
          });
          if (productsToAdd.length > 0) {
            await db.shoppingProducts.bulkAdd(productsToAdd);
          }
        }
      });

      activeShoppingCategoryId = 'all';
      await renderShoppingProducts();
      await showCustomAlert('生成成功！', `为"${chat.name}"量身定制的商品已上架！`);

    } catch (error) {
      console.error("生成购物中心商品失败:", error);
      await showCustomAlert("生成失败", `无法生成商品，请检查(主/副)API配置或稍后再试。\n错误: ${error.message}`);
    }
  }


  // 检查是否有待处理的购物车清空通知（来源：script.js 第 20898~20931 行）
  async function checkPendingCartNotifications() {
    try {
      const allChats = Object.values(state.chats);
      
      for (const chat of allChats) {
        if (chat.pendingCartClearNotification && !chat.isGroup) {
          const notification = chat.pendingCartClearNotification;
          const itemCount = notification.items.reduce((sum, item) => sum + item.quantity, 0);
          
          // 构建物品列表
          const itemsList = notification.items.map(item => 
            `${item.name} x${item.quantity} (¥${(item.price * item.quantity).toFixed(2)})`
          ).join('\n');
          
          await showCustomAlert(
            `${chat.name} 帮你清空了购物车！`,
            `${chat.name} 已经用自己的钱帮你购买了购物车中的所有商品！\n\n共 ${itemCount} 件商品，总价 ¥${notification.totalCost.toFixed(2)}\n\n${itemsList}\n\n所有物品都在路上啦~`
          );
          
          // 清除通知标记
          delete chat.pendingCartClearNotification;
          await db.chats.put(chat);
          
          // 只显示第一个通知，避免一次性弹出太多
          break;
        }
      }
    } catch (error) {
      console.error("检查待处理通知失败:", error);
    }
  }

  // 检查角色是否可以帮助用户清空购物车
  async function checkAndClearShoppingCart(chatId) {
    try {
      const chat = state.chats[chatId];
      
      // 检查是否启用了自动清空购物车功能
      if (!chat || !chat.settings.enableAutoCartClear) {
        return;
      }
      
      // 检查购物车是否为空
      if (!shoppingCart || shoppingCart.length === 0) {
        return;
      }
      
      // 检查是否已经有待处理的通知（避免重复通知）
      if (chat.pendingCartClearNotification) {
        return;
      }
      
      // 获取角色的钱包余额
      const taobaoHistory = chat.simulatedTaobaoHistory || {};
      const characterBalance = taobaoHistory.totalBalance || 0;
      
      // 计算购物车总价
      const productIds = shoppingCart.map(item => item.productId);
      const products = await db.products.bulkGet(productIds);
      const productMap = new Map(products.filter(p => p).map(p => [p.id, p]));
      
      let totalCost = 0;
      shoppingCart.forEach(cartItem => {
        const product = productMap.get(cartItem.productId);
        if (product) {
          const price = cartItem.variation ? cartItem.variation.price : product.price;
          totalCost += price * cartItem.quantity;
        }
      });
      
      // 检查余额是否足够
      if (characterBalance < totalCost) {
        return;
      }
      
      // 随机决定是否执行（避免每次都触发）
      if (Math.random() > 0.3) {
        return;
      }
      
      console.log(`角色 "${chat.name}" 准备帮助清空购物车，总价: ¥${totalCost.toFixed(2)}, 余额: ¥${characterBalance.toFixed(2)}`);
      
      // 扣除角色余额
      if (!chat.simulatedTaobaoHistory) chat.simulatedTaobaoHistory = { totalBalance: 0, purchases: [] };
      if (!chat.simulatedTaobaoHistory.purchases) chat.simulatedTaobaoHistory.purchases = [];
      
      chat.simulatedTaobaoHistory.totalBalance -= totalCost;
      
      // 记录购买记录
      const purchaseItems = [];
      shoppingCart.forEach(cartItem => {
        const product = productMap.get(cartItem.productId);
        if (product) {
          const price = cartItem.variation ? cartItem.variation.price : product.price;
          const itemName = cartItem.variation ? `${product.name} - ${cartItem.variation.name}` : product.name;
          
          chat.simulatedTaobaoHistory.purchases.unshift({
            itemName: itemName,
            price: price * cartItem.quantity,
            quantity: cartItem.quantity,
            status: '已发货',
            reason: '帮你清空购物车',
            image_prompt: `${itemName}, product photography`,
            timestamp: Date.now()
          });
          
          purchaseItems.push({
            name: itemName,
            quantity: cartItem.quantity,
            price: price
          });
        }
      });
      
      // 保存角色数据
      await db.chats.put(chat);
      
      // 清空购物车
      const clearedItems = [...shoppingCart];
      shoppingCart = [];
      updateCartCount();
      saveShoppingCart(); // 保存购物车
      
      // 如果用户正在查看购物车页面，刷新页面
      const cartScreen = document.getElementById('cart-screen');
      if (cartScreen && cartScreen.classList.contains('active')) {
        renderCartItems();
      }
      
      // 标记有待处理的通知
      chat.pendingCartClearNotification = {
        items: purchaseItems,
        totalCost: totalCost,
        timestamp: Date.now()
      };
      await db.chats.put(chat);
      
      console.log(`✅ 角色 "${chat.name}" 已清空购物车，总价: ¥${totalCost.toFixed(2)}`);
      
    } catch (error) {
      console.error("检查和清空购物车失败:", error);
    }
  }

  // ========== 全局暴露 ==========
  window.openShoppingScreen = openShoppingScreen;
  window.openCartScreen = openCartScreen;
  window.openProductCategoryManager = openProductCategoryManager;
  window.openShoppingSettingsModal = openShoppingSettingsModal;
  window.renderShoppingProducts = renderShoppingProducts;
  window.renderCartItems = renderCartItems;
  window.saveProduct = saveProduct;
  window.addNewProductCategory = addNewProductCategory;
  window.deleteProductCategory = deleteProductCategory;
  window.saveShoppingCart = saveShoppingCart;
  window.saveShoppingSettings = saveShoppingSettings;
  window.switchShoppingCategory = switchShoppingCategory;
  window.handleCheckout = handleCheckout;
  window.openProductEditor = openProductEditor;
  window.addToCart = addToCart;
  window.updateCartItemQuantity = updateCartItemQuantity;
  window.updateCartCount = updateCartCount;
  window.updateCartTotal = updateCartTotal;
  window.loadShoppingCart = loadShoppingCart;
  window.handleGenerateShoppingItems = handleGenerateShoppingItems;

  // ========== 从 script.js 迁移：openVariationSelector, handlePaymentButtonClick ==========
  async function openVariationSelector(productId) {
    const product = await db.shoppingProducts.get(productId);
    if (!product || !product.variations || product.variations.length === 0) return;
    const modal = document.getElementById('variation-selection-modal');
    document.getElementById('variation-product-image').src = product.imageUrl;
    document.getElementById('variation-product-name').textContent = product.name;
    const optionsContainer = document.getElementById('variation-options-container');
    optionsContainer.innerHTML = '';
    product.variations.forEach((variation, index) => {
      const radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'variation-select'; radio.id = `var-${productId}-${index}`; radio.value = index; radio.style.display = 'none';
      if (index === 0) radio.checked = true;
      const label = document.createElement('label');
      label.htmlFor = `var-${productId}-${index}`;
      label.textContent = variation.name;
      label.style.cssText = 'padding: 6px 12px; border: 1px solid #ccc; border-radius: 15px; cursor: pointer; transition: all 0.2s;';
      optionsContainer.appendChild(radio);
      optionsContainer.appendChild(label);
    });
    const updateSelectionUI = () => {
      const selectedRadio = optionsContainer.querySelector('input[name="variation-select"]:checked');
      optionsContainer.querySelectorAll('label').forEach(lbl => { lbl.style.borderColor = '#ccc'; lbl.style.color = '#333'; lbl.style.backgroundColor = 'white'; });
      if (selectedRadio) {
        const selectedLabel = optionsContainer.querySelector(`label[for="${selectedRadio.id}"]`);
        selectedLabel.style.borderColor = 'var(--accent-color)'; selectedLabel.style.color = 'var(--accent-color)'; selectedLabel.style.backgroundColor = '#e7f3ff';
        const selectedVariation = product.variations[parseInt(selectedRadio.value)];
        document.getElementById('variation-selected-price').textContent = `¥${selectedVariation.price.toFixed(2)}`;
        if (selectedVariation.imageUrl) document.getElementById('variation-product-image').src = selectedVariation.imageUrl;
        else document.getElementById('variation-product-image').src = product.imageUrl;
      }
    };
    optionsContainer.addEventListener('change', updateSelectionUI);
    updateSelectionUI();
    document.getElementById('variation-quantity-display').textContent = '1';
    const confirmBtn = document.getElementById('confirm-variation-selection-btn');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', async () => {
      const selectedRadio = optionsContainer.querySelector('input[name="variation-select"]:checked');
      const quantity = parseInt(document.getElementById('variation-quantity-display').textContent);
      if (selectedRadio) {
        const selectedVariation = product.variations[parseInt(selectedRadio.value)];
        await addToCart(productId, quantity, selectedVariation);
        modal.classList.remove('visible');
        await showCustomAlert('成功', '已成功加入购物车！');
      }
    });
    modal.classList.add('visible');
  }

  async function handlePaymentButtonClick() {
    const amountInput = document.getElementById('transfer-amount-input');
    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount <= 0) { await showCustomAlert('错误', '请输入有效的转账金额'); return; }
    if (typeof processPayment === 'function') await processPayment(amount);
    else await showCustomAlert('提示', '支付功能暂未实现');
  }

  window.openVariationSelector = openVariationSelector;
  window.handlePaymentButtonClick = handlePaymentButtonClick;
