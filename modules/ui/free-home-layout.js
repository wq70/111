// 自由桌面与经典桌面共用 App 入口，排列数据独立保存。
window.FreeHomeLayout = (() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const $ = id => document.getElementById(id);
  const escapePrompt = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  // 模板直接取自经典桌面。旧自由布局的四种组件仍可读取，但不再出现在添加库中。
  const legacyWidgets = { photo:{name:'照片'}, text:{name:'文字'}, date:{name:'日期'}, clock:{name:'时钟'} };
  const widgetTypes = {
    profile:{name:'个人资料',selector:'#profile-widget',w:4,h:4},
    quote:{name:'文字',selector:'.desktop-widget.text-only',w:2,h:1},
    quoteLeft:{name:'左图文字',selector:'.desktop-widget.icon-left',w:2,h:1},
    quoteRight:{name:'右图文字',selector:'.desktop-widget.icon-right',w:2,h:1},
    polaroid:{name:'拍立得',selector:'.polaroid-widget-container',w:4,h:3},
    largePhoto:{name:'大照片',selector:'.large-widget',w:2,h:2},
    vinyl:{name:'唱片',selector:'.vinyl-transparent-widget',w:4,h:3},
    profileCard:{name:'资料卡',selector:'.p3-profile-widget',w:4,h:2},
    anniversary:{name:'纪念日',selector:'.p3-anniversary-widget',w:2,h:3},
    post:{name:'动态',selector:'.p3-weibo-widget',w:2,h:3}
  };
  const allWidgetTypes = { ...legacyWidgets, ...widgetTypes };
  let state, db, layout, mode, root, registry = new Map();
  let page = 0, editing = false, history = [], drag = null, pressTimer = 0, edgeTimer = 0;
  let pendingSave = Promise.resolve();

  function sourceApps() {
    const pages = [...document.querySelectorAll('#home-screen-pages .home-screen-page')];
    pages.forEach((panel, pageIndex) => {
      panel.querySelectorAll('.desktop-app-icon, .small-widget').forEach(node => {
        const image = node.querySelector('img[id^="icon-img-"]');
        if (!image) return;
        const key = image.id.slice(9);
        registry.set(key, { node, image, clickable:node.hasAttribute('onclick'), name: node.querySelector('.label, .small-widget-label')?.textContent.trim() || image.alt || key, page: pageIndex });
      });
    });
    document.querySelectorAll('#desktop-dock .desktop-app-icon').forEach(node => {
      const image = node.querySelector('img[id^="icon-img-"]');
      if (!image) return;
      registry.set(image.id.slice(9), { node, image, clickable:node.hasAttribute('onclick'), name: node.querySelector('.label')?.textContent.trim() || image.alt, dock: true });
    });
    registry.set('widget-market', { name: '小组件库', icon: state.globalSettings.appIcons?.['widget-market'] || 'icons/icon-192.png', library: true, page: 0 });
  }

  function occupied(items, skipId = null) {
    const used = new Set();
    items.forEach(item => {
      if (item.id === skipId) return;
      for (let y = item.y; y < item.y + item.h; y++) for (let x = item.x; x < item.x + item.w; x++) used.add(`${x}:${y}`);
    });
    return used;
  }
  function fits(used, x, y, w, h) {
    if (x < 0 || x + w > 4 || y < 0) return false;
    for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) if (used.has(`${cx}:${cy}`)) return false;
    return true;
  }
  function firstFree(items, w, h, skipId = null) {
    const used = occupied(items, skipId);
    for (let y = 0; y < 200; y++) for (let x = 0; x <= 4 - w; x++) if (fits(used, x, y, w, h)) return { x, y };
    return { x: 0, y: 200 };
  }
  function makeItem(kind, key, x, y, extra = {}) {
    return { id: window.crypto?.randomUUID?.() || `home-${Date.now()}-${Math.random()}`, kind, key, x, y, w: extra.w || 1, h: extra.h || 1, ...extra };
  }
  function defaultLayout() {
    const pages = [[], [], [], []], dock = [];
    registry.forEach((entry, key) => {
      if (entry.dock) dock.push(key);
      else {
        const index = Math.min(entry.page || 0, pages.length - 1);
        const spot = firstFree(pages[index], 1, 1);
        pages[index].push(makeItem('app', key, spot.x, spot.y));
      }
    });
    return { schema: 1, pages, dock, homePage: 0, deletedWidgets: [] };
  }
  function normalize(input) {
    if (!input || input.schema !== 1 || !Array.isArray(input.pages) || !Array.isArray(input.dock)) throw new Error('桌面数据格式不受支持');
    const seenApps = new Set();
    const pages = input.pages.slice(0, 40).map(items => {
      const result = [];
      (Array.isArray(items) ? items : []).slice(0, 200).forEach(raw => {
        if (!raw || !['app','folder','widget'].includes(raw.kind)) return;
        const item = { ...raw, id: String(raw.id || makeItem('app', '').id), x: Math.max(0, Math.min(3, Math.floor(Number(raw.x) || 0))), y: Math.max(0, Math.min(200, Math.floor(Number(raw.y) || 0))) };
        if (item.kind === 'app') {
          item.key = String(item.key || '').slice(0, 100);
          if (!item.key || seenApps.has(item.key)) return;
          seenApps.add(item.key); item.w = item.h = 1;
        } else if (item.kind === 'folder') {
          item.apps = [...new Set(Array.isArray(item.apps) ? item.apps.map(key => String(key).slice(0, 100)) : [])].filter(key => key && !seenApps.has(key));
          item.apps.forEach(key => seenApps.add(key));
          if (!item.apps.length) return;
          item.name = String(item.name || '文件夹').slice(0, 30);
          item.w = item.h = 1;
        } else {
          if (!allWidgetTypes[item.key] && !String(item.key || '').startsWith('custom:')) return;
          item.w = Math.min(4, Math.max(1, Math.floor(Number(item.w) || widgetTypes[item.key]?.w || 2)));
          item.h = Math.min(4, Math.max(1, Math.floor(Number(item.h) || widgetTypes[item.key]?.h || 2)));
          item.text = String(item.text || '').slice(0, 500);
          item.image = String(item.image || '').slice(0, 2000000);
          item.fields = sanitizeFields(item.fields);
        }
        item.x = Math.min(item.x, 4 - item.w);
        const spot = fits(occupied(result), item.x, item.y, item.w, item.h) ? { x: item.x, y: item.y } : firstFree(result, item.w, item.h);
        item.x = spot.x; item.y = spot.y; result.push(item);
      });
      return result;
    });
    if (!pages.length) pages.push([]);
    const dock = [...new Set(input.dock.map(key => String(key).slice(0, 100)))].filter(key => key && !seenApps.has(key)).slice(0, 4);
    const deletedWidgets = (Array.isArray(input.deletedWidgets) ? input.deletedWidgets : []).filter(item => item?.kind === 'widget' && (allWidgetTypes[item.key] || item.key?.startsWith('custom:'))).slice(-10).map(item => ({ ...item, text:String(item.text || '').slice(0, 500), image:String(item.image || '').slice(0, 2000000), fields:sanitizeFields(item.fields) }));
    return { schema: 1, pages, dock, homePage: Math.max(0, Math.min(pages.length - 1, Number(input.homePage) || 0)), deletedWidgets };
  }
  function save() {
    state.globalSettings.homeLayoutMode = mode;
    state.globalSettings.freeHomeLayout = clone(layout);
    pendingSave = pendingSave.catch(() => {}).then(() => db.globalSettings.put(state.globalSettings));
    pendingSave.catch(error => { console.error('保存桌面失败', error); status('保存失败，请检查设备存储空间'); });
    return pendingSave;
  }
  function remember() { history.push(clone(layout)); if (history.length > 30) history.shift(); }
  function shareableLayout() { const value = clone(layout); value.deletedWidgets = []; return value; }
  function status(message) { ['free-home-status','home-layout-settings-status'].forEach(id => { const node = $(id); if (node) { node.textContent = message; clearTimeout(node._timer); node._timer = setTimeout(() => { node.textContent = ''; }, 3500); } }); }
  function setMode(next) {
    if (!['classic','free'].includes(next) || mode === next) return;
    editing = false;
    mode = next;
    $('home-screen').classList.toggle('free-home-active', mode === 'free');
    $('home-layout-select').value = mode;
    if (mode === 'free') render(); else closeSheet();
    save();
    status(mode === 'free' ? '已切换到自由布局' : '已切换到经典布局');
  }
  function openLayoutMenu() {
    const content = document.createElement('div');
    const note = document.createElement('p');
    note.className = 'free-home-layout-note';
    note.textContent = '两种布局各自保存页面、App 排列和组件。聊天、壁纸及图标设置保持共用。';
    content.append(note, actionList([
      ['经典布局 · 查看已有桌面与组件', () => setMode('classic')],
      ['自由布局 · 编辑页面与组件', () => setMode('free')]
    ]));
    showSheet('桌面布局', content);
  }
  function icon(key) {
    const entry = registry.get(key);
    return state.globalSettings.appIcons?.[key] || entry?.image?.src || entry?.icon || 'icons/icon-192.png';
  }
  function sanitizeFields(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    return Object.fromEntries(Object.entries(input).slice(0, 30).map(([key, value]) => [String(key).slice(0, 80), String(value ?? '').slice(0, 2000000)]));
  }
  function widgetSource(key) { return document.querySelector(`#home-screen-pages ${widgetTypes[key]?.selector}`); }
  function widgetFields(key) {
    const fields = {};
    const source = widgetSource(key);
    source?.querySelectorAll('[id]').forEach(node => {
      if (node.matches('img')) fields[node.id] = node.src;
      else if (node.classList.contains('editable-text')) fields[node.id] = node.id === 'p3-weibo-text' ? node.innerHTML.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '').trim() : node.textContent.trim();
    });
    return fields;
  }
  function widgetPreview(item) {
    const source = widgetSource(item.key);
    if (!source) return document.createTextNode(widgetTypes[item.key]?.name || '小组件');
    const copy = source.cloneNode(true);
    copy.classList.add('free-classic-widget', `free-template-${item.key}`);
    [copy, ...copy.querySelectorAll('*')].forEach(node => {
      node.removeAttribute('onclick');
      if (node.id) { node.dataset.widgetField = node.id; node.removeAttribute('id'); }
    });
    copy.querySelectorAll('[data-widget-field]').forEach(node => {
      const value = item.fields?.[node.dataset.widgetField];
      if (value === undefined) return;
      if (node.matches('img')) node.src = value;
      else if (node.classList.contains('editable-text')) {
        if (node.dataset.widgetField === 'profile-location' && node.querySelector('span')) node.querySelector('span').textContent = value;
        else node.textContent = value;
      }
    });
    if (item.key === 'anniversary') {
      const date = item.fields?.['p3-circle-date'];
      const count = copy.querySelector('[data-widget-field="p3-day-count"]');
      const parsed = date && new Date(date.replace(/\./g, '/'));
      if (count && parsed && !Number.isNaN(parsed.getTime())) count.textContent = Math.abs(Math.floor((Date.now() - parsed.getTime()) / 86400000));
    }
    return copy;
  }
  function tile(item, inDock = false) {
    const customWidget = item.kind === 'widget' && String(item.key || '').startsWith('custom:');
    const button = document.createElement(customWidget ? 'div' : 'button');
    if (!customWidget) button.type = 'button';
    button.className = `free-home-item free-home-${item.kind}`;
    button.dataset.id = item.id; button.dataset.kind = item.kind;
    if (item.kind === 'widget') button.classList.add(item.key.startsWith('custom:') ? 'free-widget-custom' : widgetTypes[item.key] ? 'free-widget-classic' : 'free-widget-legacy');
    button.style.gridColumn = `${item.x + 1} / span ${item.w}`;
    button.style.gridRow = `${item.y + 1} / span ${item.h}`;
    if (inDock) { button.style.gridColumn = 'auto'; button.style.gridRow = 'auto'; }
    if (item.kind === 'widget') {
      if (item.key.startsWith('custom:')) {
        const view = document.createElement('span'); view.className = 'cw-free-view'; view.dataset.customInstance = item.id;
        button.append(view); window.CustomWidgetStudio?.mount(item.key.slice(7), item.id, view);
        const manage = document.createElement('span'); manage.className = 'cw-free-manage'; manage.textContent = '⋯';
        manage.setAttribute('role', 'button'); manage.setAttribute('tabindex', '0'); manage.setAttribute('aria-label', '管理小组件');
        manage.onclick = event => { event.stopPropagation(); openItemActions(item, false); };
        manage.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); manage.click(); } };
        button.append(manage);
      } else if (widgetTypes[item.key]) button.append(widgetPreview(item));
      else if (item.key === 'photo') {
        const img = document.createElement('img'); img.alt = item.text || '照片'; img.src = item.image || 'icons/icon-192.png'; button.append(img);
      } else {
        const heading = document.createElement('span'); heading.className = 'free-widget-heading'; heading.textContent = item.text || legacyWidgets[item.key].name; button.append(heading);
        if (item.key === 'date' || item.key === 'clock') { const value = document.createElement('strong'); value.className = 'free-widget-value'; value.textContent = item.key === 'date' ? new Date().toLocaleDateString('zh-CN', { month:'long', day:'numeric', weekday:'long' }) : new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }); button.append(value); }
      }
    } else {
      const iconBox = document.createElement('span'); iconBox.className = 'free-home-icon';
      if (item.kind === 'app' && item.key === 'messages') {
        iconBox.dataset.smsIcon = '1';
        const unread = window.SmsApp?.unreadCount || 0;
        const badge = document.createElement('span'); badge.className = 'sms-app-badge'; badge.hidden = !unread; badge.textContent = unread > 99 ? '99+' : String(unread); iconBox.append(badge);
      }
      const keys = item.kind === 'folder' ? item.apps.slice(0, 4) : [item.key];
      keys.forEach(key => { const img = document.createElement('img'); img.src = icon(key); img.alt = ''; iconBox.append(img); });
      if (item.kind === 'folder') iconBox.classList.add('free-folder-icon');
      const label = document.createElement('span'); label.className = 'free-home-label'; label.textContent = item.kind === 'folder' ? item.name : registry.get(item.key)?.name || `暂不可用: ${item.key}`;
      const classicLabel = registry.get(item.kind === 'folder' ? item.apps[0] : item.key)?.node?.querySelector('.label, .small-widget-label');
      if (classicLabel) {
        const style = getComputedStyle(classicLabel);
        label.style.color = style.color; label.style.fontSize = style.fontSize;
        label.style.fontWeight = style.fontWeight; label.style.textShadow = style.textShadow;
      }
      button.append(iconBox, label);
    }
    button.querySelectorAll('img').forEach(img => { img.draggable = false; });
    button.addEventListener('pointerdown', event => pointerDown(event, item, inDock));
    button.addEventListener('click', event => {
      if (button.dataset.suppressClick === '1') { button.dataset.suppressClick = ''; event.preventDefault(); return; }
      if (editing) { openItemActions(item, inDock); return; }
      if (item.kind === 'app') launch(item.key);
      else if (item.kind === 'folder') openFolder(item);
      else if (item.key.startsWith('custom:')) window.CustomWidgetStudio?.openInstanceSettings(item.key.slice(7), item.id);
      else editWidget(item);
    });
    return button;
  }
  function launch(key) { const entry = registry.get(key); if (entry?.library) openLibrary(); else if (entry?.node && entry.clickable) entry.node.click(); else status(`「${entry?.name || key}」当前无法打开`); }
  function render() {
    if (!root) return;
    page = Math.min(page, layout.pages.length - 1);
    const pages = $('free-home-pages');
    const scrollLeft = page * pages.clientWidth;
    const panels = layout.pages.map((items, index) => {
      const grid = document.createElement('div');
      grid.className = 'free-home-grid'; grid.dataset.page = index;
      grid.setAttribute('aria-label', `桌面第 ${index + 1} 页`);
      if (Math.abs(index - page) <= 1) { items.forEach(item => grid.append(tile(item))); grid.dataset.ready = '1'; }
      return grid;
    });
    pages.replaceChildren(...panels);
    pages.scrollLeft = scrollLeft;
    const dots = $('free-home-dots'); dots.replaceChildren();
    layout.pages.forEach((_, index) => {
      const dot = document.createElement('button'); dot.type = 'button'; dot.className = `free-home-dot${page === index ? ' active' : ''}`; dot.setAttribute('aria-label', `第 ${index + 1} 页`); dot.onclick = () => movePage(index - page); dots.append(dot);
    });
    const dock = $('free-home-dock'); dock.replaceChildren();
    layout.dock.forEach((key, index) => dock.append(tile({ id:`dock:${key}`, kind:'app', key, x:index, y:0, w:1, h:1 }, true)));
    root.classList.toggle('is-editing', editing);
    $('free-home-edit').textContent = editing ? '完成' : '编辑';
    $('free-home-undo').disabled = !history.length;
  }
  function currentGrid() { return document.querySelector(`.free-home-grid[data-page="${page}"]`); }
  function syncPageFromScroll() {
    const pages = $('free-home-pages');
    if (!pages?.clientWidth) return;
    const nextPage = Math.max(0, Math.min(layout.pages.length - 1, Math.round(pages.scrollLeft / pages.clientWidth)));
    if (nextPage === page) return;
    page = nextPage;
    for (let index = Math.max(0, page - 1); index <= Math.min(layout.pages.length - 1, page + 1); index++) {
      const grid = pages.querySelector(`.free-home-grid[data-page="${index}"]`);
      if (grid?.dataset.ready) continue;
      layout.pages[index].forEach(item => grid.append(tile(item)));
      grid.dataset.ready = '1';
    }
    $('free-home-dots')?.querySelectorAll('.free-home-dot').forEach((dot, index) => dot.classList.toggle('active', index === page));
  }
  function showSheet(title, content, centered = false) {
    const sheet = $('free-home-sheet'); sheet.classList.toggle('is-centered', centered); $('free-home-sheet-title').textContent = title;
    const body = $('free-home-sheet-body'); body.replaceChildren(); if (content) body.append(content);
    sheet.hidden = false;
  }
  function closeSheet() { const sheet = $('free-home-sheet'); if (sheet) sheet.hidden = true; }
  function actionList(actions) {
    const box = document.createElement('div'); box.className = 'free-home-actions';
    actions.forEach(([label, callback]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => { closeSheet(); callback(); }; box.append(b); });
    return box;
  }
  function openLibrary() {
    const gallery = document.createElement('div'); gallery.className = 'free-widget-gallery';
    const custom = document.createElement('button'); custom.type = 'button'; custom.className = 'free-widget-choice free-widget-custom-entry';
    custom.textContent = '＋ 制作、导入或添加我的小组件';
    custom.onclick = () => { closeSheet(); window.CustomWidgetStudio?.openLibrary(); };
    Object.entries(widgetTypes).forEach(([key, type]) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'free-widget-choice';
      const preview = document.createElement('span'); preview.className = 'free-widget-choice-preview';
      preview.append(widgetPreview({ key, fields:widgetFields(key) }));
      const label = document.createElement('span'); label.textContent = type.name;
      button.append(preview, label);
      button.onclick = () => {
        remember(); const spot = firstFree(layout.pages[page], type.w, type.h);
        layout.pages[page].push(makeItem('widget', key, spot.x, spot.y, { w:type.w, h:type.h, fields:widgetFields(key) }));
        closeSheet(); save(); render(); status(`已添加${type.name}，点按组件可单独编辑`);
      };
      gallery.append(button);
    });
    const body = document.createElement('div'); body.append(custom, gallery);
    if (layout.deletedWidgets.length) body.append(actionList([['恢复最近删除的小组件', openDeletedWidgets]]));
    showSheet('添加小组件', body);
  }
  function openDeletedWidgets() {
    showSheet('最近删除的小组件', actionList(layout.deletedWidgets.map((item, index) => [
      item.text || allWidgetTypes[item.key]?.name || window.CustomWidgetStudio?.get(item.key.slice(7))?.name || '小组件',
      () => { remember(); const spot = firstFree(layout.pages[page], item.w, item.h); const restored = { ...item, id:item.key.startsWith('custom:') ? item.id : makeItem('widget', item.key, 0, 0).id, x:spot.x, y:spot.y }; layout.pages[page].push(restored); layout.deletedWidgets.splice(index, 1); save(); render(); status('组件已恢复'); }
    ])));
  }
  function openClassicWidgetCopy() {
    openLibrary();
  }
  function openAppLibrary() {
    const used = new Set(layout.dock);
    layout.pages.flat().forEach(item => { if (item.kind === 'app') used.add(item.key); if (item.kind === 'folder') item.apps.forEach(key => used.add(key)); });
    const actions = [...registry].filter(([key]) => !used.has(key)).map(([key, entry]) => [entry.name, () => {
      remember(); const spot = firstFree(layout.pages[page], 1, 1); layout.pages[page].push(makeItem('app', key, spot.x, spot.y)); save(); render();
    }]);
    showSheet('添加 App', actionList(actions.length ? actions : [['所有 App 已在桌面', () => {}]]));
  }
  async function editWidget(item) {
    if (item.key.startsWith('custom:')) return window.CustomWidgetStudio?.openInstanceSettings(item.key.slice(7), item.id);
    if (widgetTypes[item.key]) {
      const source = widgetSource(item.key);
      const fields = [...source.querySelectorAll('[id]')].filter(node => node.matches('img') || node.classList.contains('editable-text'));
      showSheet(`编辑${widgetTypes[item.key].name}`, actionList(fields.map(node => {
        const field = node.id, image = node.matches('img');
        const title = image ? (node.alt || field) : (node.textContent.trim().slice(0, 20) || field);
        return [`${image ? '图片' : '文字'} · ${title}`, async () => {
          if (image) return editWidgetImage(item, field);
          const value = await showCustomPrompt(`编辑${widgetTypes[item.key].name}`, escapePrompt(title), escapePrompt(item.fields?.[field] ?? node.textContent.trim()), 'textarea');
          if (value == null) return;
          remember(); item.fields = item.fields || {}; item.fields[field] = value.slice(0, 500); save(); render(); editWidget(item);
        }];
      })));
      return;
    }
    if (item.key === 'photo') {
      showSheet('编辑照片', actionList([
        ['本地图片', () => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.onchange = () => { const file = input.files?.[0]; if (!file) return; if (file.size > 8 * 1024 * 1024) return status('请选择小于 8 MB 的图片'); const reader = new FileReader(); reader.onload = () => { remember(); item.image = reader.result; save(); render(); }; reader.readAsDataURL(file); }; input.click(); }],
        ['图片 URL', async () => { const value = await showCustomPrompt('照片小组件', '输入图片 URL', item.image || '', 'url'); if (value == null) return; remember(); item.image = value.trim(); save(); render(); }],
        ['删除组件', () => removeItem(item)]
      ]));
    } else {
      const value = await showCustomPrompt('编辑小组件', '输入显示文字', item.text || '');
      if (value == null) return;
      remember(); item.text = value.slice(0, 500); save(); render();
    }
  }
  function editWidgetImage(item, field) {
    showSheet('编辑图片', actionList([
      ['选择本地图片', () => {
        const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
        input.onchange = () => { const file = input.files?.[0]; if (!file) return; if (file.size > 8 * 1024 * 1024) return status('请选择小于 8 MB 的图片'); const reader = new FileReader(); reader.onload = () => { remember(); item.fields = item.fields || {}; item.fields[field] = reader.result; save(); render(); editWidget(item); }; reader.readAsDataURL(file); };
        input.click();
      }],
      ['图片 URL', async () => { const value = await showCustomPrompt('编辑图片', '输入图片 URL', item.fields?.[field] || '', 'url'); if (value == null) return; remember(); item.fields = item.fields || {}; item.fields[field] = value.trim(); save(); render(); editWidget(item); }],
      ['恢复经典布局中的图片', () => { const source = document.getElementById(field); if (!source) return; remember(); item.fields = item.fields || {}; item.fields[field] = source.src; save(); render(); editWidget(item); }]
    ]));
  }
  function findItem(id) { for (const items of layout.pages) { const item = items.find(entry => entry.id === id); if (item) return { item, items }; } return null; }
  function removeItem(item) { const found = findItem(item.id); if (!found) return; remember(); if (item.kind === 'widget') layout.deletedWidgets.push(clone(item)); const expired = layout.deletedWidgets.slice(0, -10); layout.deletedWidgets = layout.deletedWidgets.slice(-10); expired.filter(entry => entry.key?.startsWith('custom:')).forEach(entry => db.customWidgetInstances.delete(entry.id).catch(console.error)); found.items.splice(found.items.indexOf(item), 1); save(); render(); }
  function openFolder(folder) {
    const body = document.createElement('div');
    const apps = document.createElement('div'); apps.className = 'free-folder-apps';
    folder.apps.forEach(key => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'free-folder-app';
      const img = document.createElement('img'); img.src = icon(key); img.alt = '';
      const label = document.createElement('span'); label.textContent = registry.get(key)?.name || key;
      button.append(img, label); button.onclick = () => { closeSheet(); launch(key); }; apps.append(button);
    });
    body.append(apps);
    const actions = [];
    if (editing) {
      actions.push(['重命名', async () => { const name = await showCustomPrompt('文件夹名称', '输入名称', folder.name); if (!name?.trim()) return; remember(); folder.name = name.trim().slice(0, 30); save(); render(); openFolder(folder); }]);
      folder.apps.forEach(key => actions.push([`移出 ${registry.get(key)?.name || key}`, () => {
      remember(); folder.apps = folder.apps.filter(value => value !== key);
      const found = findItem(folder.id); if (found) { const spot = firstFree(found.items, 1, 1); found.items.push(makeItem('app', key, spot.x, spot.y)); if (folder.apps.length === 1) { folder.kind = 'app'; folder.key = folder.apps[0]; delete folder.apps; } }
      save(); render();
      }]));
    }
    actions.push(['解散文件夹', () => {
        const found = findItem(folder.id); if (!found) return;
        remember(); found.items.splice(found.items.indexOf(folder), 1);
        folder.apps.forEach((key, index) => { const spot = index === 0 ? {x:folder.x,y:folder.y} : firstFree(found.items, 1, 1); found.items.push(makeItem('app', key, spot.x, spot.y)); });
        save(); render(); status('文件夹已解散，App 已保留');
    }]);
    body.append(actionList(actions));
    showSheet(folder.name, body, true);
  }
  function openItemActions(item, inDock) {
    if (item.kind === 'folder') return openFolder(item);
    if (item.kind === 'widget') return showSheet('小组件', actionList([
      ...(item.key.startsWith('custom:') && !editing ? [['排列桌面', () => { editing = true; render(); status('长按小组件即可拖动'); }]] : []),
      ['编辑内容', () => editWidget(item)],
      ['调整尺寸', () => showSheet('小组件尺寸', actionList([
        ...(widgetTypes[item.key] ? [['经典原尺寸', () => resizeWidget(item, widgetTypes[item.key].w, widgetTypes[item.key].h)]] : item.key.startsWith('custom:') ? [['作品原尺寸', () => { const size = window.CustomWidgetStudio?.get(item.key.slice(7))?.size; if (size) resizeWidget(item, size.w, size.h); }]] : []),
        ['方形 · 2 × 2', () => resizeWidget(item, 2, 2)],
        ['横条 · 4 × 2', () => resizeWidget(item, 4, 2)],
        ['大卡 · 4 × 3', () => resizeWidget(item, 4, 3)]
      ]))],
      ['删除组件', () => removeItem(item)]
    ]));
    showSheet(registry.get(item.key)?.name || 'App', actionList(inDock ? [
      ['移到当前页', () => { remember(); layout.dock = layout.dock.filter(key => key !== item.key); const spot = firstFree(layout.pages[page], 1, 1); layout.pages[page].push(makeItem('app', item.key, spot.x, spot.y)); save(); render(); }]
    ]
    : [
      ['移入 Dock', () => { if (layout.dock.length >= 4) return status('Dock 最多放 4 个 App'); remember(); removeItemWithoutSave(item); layout.dock.push(item.key); save(); render(); }],
      ['从桌面移除', () => removeItem(item)]
    ]));
  }
  function resizeWidget(item, w, h) {
    const found = findItem(item.id); if (!found) return;
    remember(); item.w = w; item.h = h;
    const used = occupied(found.items, item.id);
    if (!fits(used, item.x, item.y, w, h)) { const spot = firstFree(found.items, w, h, item.id); item.x = spot.x; item.y = spot.y; }
    save(); render();
  }
  function removeItemWithoutSave(item) { const found = findItem(item.id); if (found) found.items.splice(found.items.indexOf(item), 1); }
  function scrollToPage(index, smooth = true) {
    const pages = $('free-home-pages'), left = index * pages.clientWidth;
    try {
      if (pages.scrollTo) pages.scrollTo({ left, behavior:smooth && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
      else pages.scrollLeft = left;
    } catch (_) { pages.scrollLeft = left; }
  }
  function movePage(delta) {
    const next = page + delta; if (next < 0 || next >= layout.pages.length) return;
    page = next;
    scrollToPage(next);
    $('free-home-dots').querySelectorAll('.free-home-dot').forEach((dot, index) => dot.classList.toggle('active', index === page));
  }
  function addPage() {
    if (layout.pages.length >= 40) return status('最多可添加 40 页');
    remember(); layout.pages.splice(page + 1, 0, []); page++; save(); render(); status('已添加页面');
  }
  async function resetLayout() {
    if (!await showCustomConfirm('重置自由布局', '恢复自由布局的默认页面、App、Dock 和小组件排列？当前排列会被替换；已保存的布局预设、经典布局和聊天数据不会改变。')) return;
    remember(); layout = defaultLayout(); page = layout.homePage; save(); render(); status('自由布局已恢复默认排列');
  }
  function pageMenu() {
    showSheet('管理页面', actionList([
      ['添加页面', addPage],
      ['设为打开时的页面', () => { remember(); layout.homePage = page; save(); status('已设为默认页面'); }],
      ['页面前移', () => reorderPage(-1)], ['页面后移', () => reorderPage(1)],
      ['删除当前页面', deleteCurrentPage],
      ['重置初始布局', resetLayout]
    ]));
  }
  function deleteCurrentPage() {
    if (layout.pages.length === 1) return status('至少保留一页');
    const items = layout.pages[page];
    if (!items.length) return finishDeletePage(null);
    const targets = layout.pages.map((_, index) => index).filter(index => index !== page);
    showSheet('本页内容移到哪里？', actionList(targets.map(index => [`移到第 ${index + 1} 页`, () => finishDeletePage(index)])));
  }
  function finishDeletePage(targetIndex) {
    remember();
    if (targetIndex !== null) {
      const target = layout.pages[targetIndex];
      layout.pages[page].forEach(item => { const spot = firstFree(target, item.w, item.h); item.x = spot.x; item.y = spot.y; target.push(item); });
    }
    const removed = page;
    layout.pages.splice(removed, 1);
    if (layout.homePage === removed) layout.homePage = Math.min(removed, layout.pages.length - 1);
    else if (layout.homePage > removed) layout.homePage--;
    page = targetIndex === null ? Math.min(removed, layout.pages.length - 1) : targetIndex - (targetIndex > removed ? 1 : 0);
    save(); render(); status('页面已删除，App 和组件已保留');
  }
  function reorderPage(delta) { const target = page + delta; if (target < 0 || target >= layout.pages.length) return; remember(); [layout.pages[page], layout.pages[target]] = [layout.pages[target], layout.pages[page]]; if (layout.homePage === page) layout.homePage = target; else if (layout.homePage === target) layout.homePage = page; page = target; save(); render(); }
  function pointerDown(event, item, inDock) {
    if (event.button !== 0 || drag) return;
    const node = event.currentTarget;
    const pages = $('free-home-pages');
    const start = { x:event.clientX, y:event.clientY, id:event.pointerId, item, inDock, node, page, scrollLeft:pages.scrollLeft, swiping:false };
    clearTimeout(pressTimer);
    const begin = () => {
      const wasEditing = editing;
      editing = true; root.classList.add('is-editing'); $('free-home-edit').textContent = '完成';
      drag = { ...start, active:false, ghost:null };
      start.longPress = !wasEditing;
      try { node.setPointerCapture(event.pointerId); } catch (_) { /* Pointer may have ended during the hold. */ }
    };
    if (editing && event.pointerType === 'mouse') begin();
    else pressTimer = setTimeout(begin, editing ? 320 : 420);
    const move = e => {
      if (e.pointerId !== start.id) return;
      if (!drag) {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (editing && !inDock && (start.swiping || Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2)) {
          start.swiping = true; clearTimeout(pressTimer);
          pages.style.scrollSnapType = 'none'; pages.scrollLeft = start.scrollLeft - dx;
          e.preventDefault(); return;
        }
        if (Math.hypot(dx, dy) > 10) clearTimeout(pressTimer);
        return;
      }
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 7) {
        if (!drag.active) { drag.active = true; start.node.classList.add('is-dragging'); const ghost = start.node.cloneNode(true); ghost.classList.add('free-drag-ghost'); document.body.append(ghost); drag.ghost = ghost; }
        drag.ghost.style.transform = `translate3d(${e.clientX - 30}px, ${e.clientY - 30}px, 0)`;
        const hovered = document.elementFromPoint(e.clientX, e.clientY)?.closest('.free-home-item');
        if (drag.hoverEl !== hovered) { drag.hoverEl?.classList.remove('free-merge-target','free-swap-target'); drag.mergeIntent = false; }
        drag.hoverEl = hovered;
        if (hovered && hovered.dataset.id !== start.item.id && hovered.dataset.id !== drag.hoverId) {
          drag.hoverId = hovered.dataset.id; drag.hoverAt = Date.now();
        } else if (!hovered || hovered.dataset.id === start.item.id) { drag.hoverId = null; drag.hoverAt = 0; drag.mergeIntent = false; }
        if (hovered && hovered.dataset.id !== start.item.id) {
          const hoveredRect = hovered.getBoundingClientRect();
          const centered = Math.abs(e.clientX - (hoveredRect.left + hoveredRect.width / 2)) < hoveredRect.width * .28 && Math.abs(e.clientY - (hoveredRect.top + hoveredRect.height / 2)) < hoveredRect.height * .3;
          drag.mergeIntent = start.item.kind === 'app' && ['app','folder'].includes(hovered.dataset.kind) && centered;
          hovered.classList.toggle('free-merge-target', drag.mergeIntent);
          hovered.classList.toggle('free-swap-target', !drag.mergeIntent);
        }
        const rect = $('free-home-pages').getBoundingClientRect();
        const direction = e.clientX < rect.left + 24 ? -1 : e.clientX > rect.right - 24 ? 1 : 0;
        if (direction !== drag.edge) { clearTimeout(edgeTimer); drag.edge = direction; if (direction) edgeTimer = setTimeout(() => { movePage(direction); pages.scrollLeft = page * pages.clientWidth; drag.edge = 0; }, 650); }
        e.preventDefault();
      }
    };
    const end = e => {
      if (e.pointerId !== start.id) return;
      clearTimeout(pressTimer); clearTimeout(edgeTimer);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', cancel);
      if (!drag) {
        if (start.swiping) {
          const dx = e.clientX - start.x;
          const next = Math.max(0, Math.min(layout.pages.length - 1, start.page + (Math.abs(dx) > Math.min(45, pages.clientWidth * .15) ? dx < 0 ? 1 : -1 : 0)));
          pages.style.scrollSnapType = ''; page = next;
          scrollToPage(next);
          start.node.dataset.suppressClick = '1';
          setTimeout(() => { start.node.dataset.suppressClick = ''; }, 250);
        }
        return;
      }
      drag.ghost?.remove(); drag.hoverEl?.classList.remove('free-merge-target','free-swap-target'); start.node.classList.remove('is-dragging');
      if (drag.active) { start.node.dataset.suppressClick = '1'; drop(item, inDock, e.clientX, e.clientY, drag.hoverId, drag.hoverAt, drag.mergeIntent); render(); }
      else if (start.longPress) { start.node.dataset.suppressClick = '1'; setTimeout(() => { start.node.dataset.suppressClick = ''; }, 150); }
      drag = null;
    };
    const cancel = e => { if (e.pointerId !== start.id) return; clearTimeout(pressTimer); clearTimeout(edgeTimer); if (start.swiping) pages.style.scrollSnapType = ''; drag?.ghost?.remove(); drag?.hoverEl?.classList.remove('free-merge-target','free-swap-target'); start.node.classList.remove('is-dragging'); drag = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', cancel); };
    window.addEventListener('pointermove', move, { passive:false }); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', cancel);
  }
  function drop(item, inDock, clientX, clientY, hoverId, hoverAt, mergeIntent) {
    const dockRect = $('free-home-dock').getBoundingClientRect();
    if (item.kind === 'app' && clientY >= dockRect.top && clientY <= dockRect.bottom) {
      if (!inDock && layout.dock.length >= 4) return status('Dock 最多放 4 个 App');
      remember(); if (inDock) layout.dock = layout.dock.filter(key => key !== item.key); else removeItemWithoutSave(item);
      const index = Math.max(0, Math.min(layout.dock.length, Math.floor((clientX - dockRect.left) / (dockRect.width / 4))));
      layout.dock.splice(index, 0, item.key); save(); return;
    }
    const grid = currentGrid(), rect = grid.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
    const x = Math.max(0, Math.min(4 - item.w, Math.floor((clientX - rect.left) / (rect.width / 4))));
    const y = Math.max(0, Math.floor((clientY - rect.top + grid.scrollTop - 10) / 78));
    const items = layout.pages[page];
    const target = items.find(other => other.id !== item.id && other.x <= x && x < other.x + other.w && other.y <= y && y < other.y + other.h) || items.find(other => other.id === hoverId);
    const mergeReady = mergeIntent && target && target.id === hoverId && Date.now() - hoverAt >= 300;
    if (item.kind === 'app' && target?.kind === 'app' && mergeReady) {
      remember(); if (inDock) layout.dock = layout.dock.filter(key => key !== item.key); else removeItemWithoutSave(item);
      target.kind = 'folder'; target.name = '文件夹'; target.apps = [target.key, item.key]; delete target.key; save(); openFolder(target); return;
    }
    if (item.kind === 'app' && target?.kind === 'folder' && mergeReady) {
      remember(); if (inDock) layout.dock = layout.dock.filter(key => key !== item.key); else removeItemWithoutSave(item);
      if (!target.apps.includes(item.key)) target.apps.push(item.key); save(); openFolder(target); return;
    }
    if (!inDock && target && item.w === 1 && item.h === 1 && target.w === 1 && target.h === 1) {
      const source = findItem(item.id);
      if (source) {
        remember(); const old = { x:item.x, y:item.y }, destination = { x:target.x, y:target.y };
        if (source.items !== items) { source.items.splice(source.items.indexOf(item), 1); items.push(item); target.x = old.x; target.y = old.y; items.splice(items.indexOf(target), 1); source.items.push(target); }
        else { target.x = old.x; target.y = old.y; }
        item.x = destination.x; item.y = destination.y; save(); return;
      }
    }
    remember();
    if (inDock) { layout.dock = layout.dock.filter(key => key !== item.key); item = makeItem('app', item.key, x, y); }
    else removeItemWithoutSave(item);
    const overlapping = items.filter(other => !(x + item.w <= other.x || x >= other.x + other.w || y + item.h <= other.y || y >= other.y + other.h));
    overlapping.forEach(other => items.splice(items.indexOf(other), 1));
    item.x = x; item.y = y; items.push(item);
    overlapping.forEach(other => { const spot = firstFree(items, other.w, other.h); other.x = spot.x; other.y = spot.y; items.push(other); });
    save();
  }
  function bindPresets() {
    const select = $('home-layout-preset-select');
    async function refresh() {
      const records = await db.appearancePresets.where('type').equals('home_layout').toArray();
      select.replaceChildren(new Option('选择预设', ''));
      records.forEach(record => select.append(new Option(record.name, record.id)));
    }
    $('home-layout-preset-save').onclick = async () => {
      const name = await showCustomPrompt('保存自由布局', '输入预设名称'); if (!name?.trim()) return;
      const existing = await db.appearancePresets.where({ name:name.trim(), type:'home_layout' }).first();
      if (existing && !await showCustomConfirm('覆盖预设', `覆盖「${name.trim()}」？`)) return;
      if (existing) await db.appearancePresets.update(existing.id, { value:shareableLayout(), customPackages:window.CustomWidgetStudio?.packagesForLayout(layout) || [] });
      else await db.appearancePresets.add({ name:name.trim(), type:'home_layout', value:shareableLayout(), customPackages:window.CustomWidgetStudio?.packagesForLayout(layout) || [] });
      await refresh(); status('自由布局预设已保存');
    };
    select.onchange = async () => {
      if (!select.value) return;
      const record = await db.appearancePresets.get(Number(select.value)); if (!record) return;
      try {
        if (record.value?.schema !== 1 || !Array.isArray(record.value.pages)) throw new Error('桌面数据格式不受支持');
        const count = record.value.pages.reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0);
        if (!await showCustomConfirm('应用自由布局预设', `「${record.name}」包含 ${record.value.pages.length} 页、${count} 个桌面项目。应用后会替换当前自由布局排列，经典布局不受影响。确定应用吗？`)) { select.value = ''; return; }
        await window.CustomWidgetStudio?.installLayoutPackages(record.customPackages);
        const next = normalize(record.value);
        remember(); layout = await window.CustomWidgetStudio.freshenLayoutInstances(next); page = layout.homePage; save().then(() => window.CustomWidgetStudio.cleanupOrphans()).catch(console.error); render(); status(`已应用「${record.name}」${mode === 'classic' ? '，切换到自由布局查看' : ''}`);
      } catch (error) { status(error.message); }
    };
    $('home-layout-preset-delete').onclick = async () => { if (!select.value) return status('请先选择预设'); if (!await showCustomConfirm('删除预设', '删除当前自由布局预设？')) return; await db.appearancePresets.delete(Number(select.value)); await refresh(); status('预设已删除'); };
    $('home-layout-preset-export').onclick = () => {
      const blob = new Blob([JSON.stringify({ type:'ephone-home-layout', value:shareableLayout(), customPackages:window.CustomWidgetStudio?.packagesForLayout(layout) || [] }, null, 2)], { type:'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'ephone-自由布局.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    $('home-layout-preset-import').onclick = () => $('home-layout-preset-file').click();
    $('home-layout-preset-file').onchange = async event => {
      const file = event.target.files?.[0]; if (!file) return;
      try {
        const parsed = JSON.parse(await file.text()); if (parsed.type !== 'ephone-home-layout') throw new Error('不是自由布局预设文件');
        if (parsed.value?.schema !== 1 || !Array.isArray(parsed.value.pages)) throw new Error('桌面数据格式不受支持');
        const count = parsed.value.pages.reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0);
        if (!await showCustomConfirm('导入自由布局', `文件包含 ${parsed.value.pages.length} 页、${count} 个桌面项目。应用后会替换当前自由布局排列，经典布局不受影响。确定导入吗？`)) return;
        await window.CustomWidgetStudio?.installLayoutPackages(parsed.customPackages);
        const next = normalize(parsed.value);
        remember(); layout = await window.CustomWidgetStudio.freshenLayoutInstances(next); page = layout.homePage; save().then(() => window.CustomWidgetStudio.cleanupOrphans()).catch(console.error); render(); status(`自由布局已导入${mode === 'classic' ? '，切换布局查看' : ''}`);
      }
      catch (error) { status(`导入失败：${error.message}`); }
      event.target.value = '';
    };
    refresh().catch(console.error);
  }
  function build() {
    root = document.createElement('div'); root.id = 'free-home';
    root.innerHTML = `<div class="free-home-toolbar"><button id="free-home-edit" type="button">完成</button><button id="free-home-undo" type="button">撤销</button><button id="free-home-reset" type="button">重置布局</button></div><div id="free-home-pages"></div><div id="free-home-dots"></div><div class="free-home-controls"><button id="free-home-add-app" type="button">添加 App</button><button id="free-home-add-widget" type="button">添加小组件</button><button id="free-home-add-page" type="button">新增页</button><button id="free-home-manage" type="button">管理页</button><button id="free-home-switch" type="button">切换布局</button></div><div id="free-home-dock"></div><div id="free-home-status" role="status" aria-live="polite"></div><div id="free-home-sheet" hidden><div class="free-home-sheet-card"><div class="free-home-sheet-head"><strong id="free-home-sheet-title"></strong><button id="free-home-sheet-close" type="button" aria-label="关闭">×</button></div><div id="free-home-sheet-body"></div></div></div>`;
    $('home-screen').append(root);
    // 菜单在两种桌面共用，必须位于可被隐藏的自由布局容器之外。
    $('home-screen').append($('free-home-sheet'));
    $('free-home-edit').onclick = () => { editing = !editing; closeSheet(); render(); };
    $('free-home-undo').onclick = () => { if (!history.length) return; layout = history.pop(); page = Math.min(page, layout.pages.length - 1); save(); render(); };
    $('free-home-reset').onclick = resetLayout;
    $('free-home-add-app').onclick = openAppLibrary;
    $('free-home-add-widget').onclick = openLibrary;
    $('free-home-add-page').onclick = addPage;
    $('free-home-manage').onclick = pageMenu;
    $('free-home-switch').onclick = openLayoutMenu;
    $('free-home-sheet-close').onclick = closeSheet;
    $('free-home-sheet').onclick = e => { if (e.target.id === 'free-home-sheet') closeSheet(); };
    $('free-home-pages').addEventListener('scroll', syncPageFromScroll, { passive:true });
    $('home-layout-select').onchange = e => setMode(e.target.value);
    let swipeStart = null, blankPress = 0;
    $('free-home-pages').addEventListener('pointerdown', e => {
      if (e.target.closest('.free-home-item')) return;
      swipeStart = { x:e.clientX, y:e.clientY, id:e.pointerId, type:e.pointerType, page, scrollLeft:$('free-home-pages').scrollLeft, swiping:false };
      blankPress = setTimeout(() => { editing = true; render(); status('桌面已进入编辑状态'); swipeStart = null; }, 550);
    });
    window.addEventListener('pointermove', e => {
      if (swipeStart?.id !== e.pointerId) return;
      const dx = e.clientX - swipeStart.x, dy = e.clientY - swipeStart.y;
      if (Math.hypot(dx, dy) > 10) clearTimeout(blankPress);
      if (swipeStart.type === 'mouse' && (swipeStart.swiping || Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2)) {
        swipeStart.swiping = true;
        $('free-home-pages').style.scrollSnapType = 'none';
        $('free-home-pages').scrollLeft = swipeStart.scrollLeft - dx;
      }
    });
    window.addEventListener('pointerup', e => {
      if (swipeStart?.id !== e.pointerId) return;
      clearTimeout(blankPress);
      if (swipeStart.swiping) {
        const pages = $('free-home-pages'), dx = e.clientX - swipeStart.x;
        const next = Math.max(0, Math.min(layout.pages.length - 1, swipeStart.page + (Math.abs(dx) > 45 ? dx < 0 ? 1 : -1 : 0)));
        pages.style.scrollSnapType = ''; page = next;
        scrollToPage(next);
      }
      swipeStart = null;
    });
    window.addEventListener('pointercancel', e => { if (swipeStart?.id !== e.pointerId) return; clearTimeout(blankPress); $('free-home-pages').style.scrollSnapType = ''; swipeStart = null; });
    $('home-screen-pages-container').addEventListener('pointerdown', e => { if (mode !== 'classic' || e.target.closest('.desktop-app-icon,.small-widget,.editable-image,.editable-text')) return; clearTimeout(pressTimer); pressTimer = setTimeout(openLayoutMenu, 550); }, true);
    ['pointerup','pointermove','pointercancel'].forEach(type => $('home-screen-pages-container').addEventListener(type, () => clearTimeout(pressTimer), true));
    new MutationObserver(() => { if ($('home-screen').classList.contains('active') && mode === 'free') render(); }).observe($('home-screen'), { attributes:true, attributeFilter:['class'] });
  }
  async function init(appState, database) {
    state = appState; db = database; sourceApps(); build();
    if (window.CustomWidgetStudio) await window.CustomWidgetStudio.init({ db, state, notify:status, openApp:key => { if (!registry.has(key)) throw new Error('此应用入口不存在'); launch(key); }, addFree:async(packageId, size) => {
      const id = makeItem('widget', `custom:${packageId}`, 0, 0).id;
      const spot = firstFree(layout.pages[page], size.w, size.h);
      remember(); layout.pages[page].push({ id, kind:'widget', key:`custom:${packageId}`, x:spot.x, y:spot.y, w:size.w, h:size.h });
      await db.customWidgetInstances.put({ id, packageId, values:{}, updatedAt:Date.now() });
      await save(); render();
    } });
    try { layout = normalize(state.globalSettings.freeHomeLayout || defaultLayout()); }
    catch (error) { console.warn('自由布局数据无效，使用默认排列', error); layout = defaultLayout(); }
    mode = state.globalSettings.homeLayoutMode === 'free' ? 'free' : 'classic';
    if (registry.has('messages') && state.globalSettings.smsAppPlacementVersion !== 2) {
      let messagesItem;
      layout.pages = layout.pages.map(items => items.flatMap(item => {
        if (item.kind === 'app' && item.key === 'messages') { messagesItem ||= item; return []; }
        if (item.kind === 'folder' && item.apps?.includes('messages')) {
          const apps = item.apps.filter(key => key !== 'messages');
          return apps.length ? [{ ...item, apps }] : [];
        }
        return [item];
      }));
      layout.dock = layout.dock.filter(key => key !== 'messages');
      const lastPage = layout.pages[layout.pages.length - 1];
      const spot = firstFree(lastPage, 1, 1);
      lastPage.push({ ...(messagesItem || makeItem('app', 'messages', spot.x, spot.y)), x: spot.x, y: spot.y, w: 1, h: 1 });
      state.globalSettings.smsAppInstalled = true;
      state.globalSettings.smsAppPlacementVersion = 2;
      await save();
    }
    page = layout.homePage;
    $('home-screen').classList.toggle('free-home-active', mode === 'free');
    $('home-layout-select').value = mode;
    bindPresets(); render();
    setInterval(() => { if (mode === 'free' && !editing) document.querySelectorAll('.free-widget-value').forEach(node => { const item = findItem(node.closest('.free-home-item')?.dataset.id)?.item; if (item) node.textContent = item.key === 'clock' ? new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }) : new Date().toLocaleDateString('zh-CN', { month:'long', day:'numeric', weekday:'long' }); }); }, 30000);
  }
  return { init };
})();
