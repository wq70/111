// 保留原生 select 作为选中值和 change 事件来源，搜索只影响展示列表。
(function () {
  'use strict';

  const selectIds = ['model-select', 'secondary-model-select', 'background-model-select',
    'vision-model-select', 'couplespace-model-select'];
  const controls = new Map();
  let panel, title, closeButton, search, list, status, current, matches = [], activeIndex = -1;
  const english = () => document.getElementById('language-select')?.value === 'en';
  const label = (zh, en) => english() ? en : zh;

  function close(restoreFocus = false) {
    if (!current) return;
    const button = current.button;
    button.setAttribute('aria-expanded', 'false');
    search.setAttribute('aria-expanded', 'false');
    search.removeAttribute('aria-activedescendant');
    current = null;
    panel.close();
    panel.hidden = true;
    if (restoreFocus) button.focus({ preventScroll: true });
  }

  function position() {
    if (!current) return;
    const viewport = window.visualViewport;
    const viewportWidth = viewport?.width || window.innerWidth;
    const viewportHeight = viewport?.height || window.innerHeight;
    const width = Math.min(480, Math.max(0, viewportWidth - 32));
    const height = Math.min(560, Math.max(0, viewportHeight - 32));
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
    panel.style.maxHeight = `${height}px`;
    panel.style.left = `${(viewport?.offsetLeft || 0) + (viewportWidth - width) / 2}px`;
    panel.style.top = `${(viewport?.offsetTop || 0) + (viewportHeight - height) / 2}px`;
  }

  function activate(index, scroll = true) {
    activeIndex = index;
    Array.from(list.children).forEach((row, i) => row.classList.toggle('is-active', i === index));
    const row = list.children[index];
    if (row) {
      search.setAttribute('aria-activedescendant', row.id);
      if (scroll) {
        const top = row.offsetTop;
        const bottom = top + row.offsetHeight;
        if (top < list.scrollTop) list.scrollTop = top;
        else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
      }
    } else search.removeAttribute('aria-activedescendant');
  }

  function choose(index) {
    if (!current || !matches[index]) return;
    current.select.value = matches[index].value;
    current.select.dispatchEvent(new Event('change', { bubbles: true }));
    close(true);
  }

  function render() {
    if (!current) return;
    const query = search.value.trim().toLocaleLowerCase();
    const options = Array.from(current.select.options);
    matches = options.filter(option => !option.disabled && option.value &&
      option.textContent.toLocaleLowerCase().includes(query));
    const fragment = document.createDocumentFragment();
    matches.forEach((option, index) => {
      const row = document.createElement('div');
      row.id = `model-search-option-${index}`;
      row.className = 'model-search-option';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(option.value === current.select.value));
      row.textContent = option.textContent;
      row.addEventListener('pointerdown', event => event.preventDefault());
      row.addEventListener('click', () => choose(index));
      fragment.appendChild(row);
    });
    list.replaceChildren(fragment);
    status.textContent = !options.length
      ? label('请先点击“拉取”获取模型列表', 'Fetch models to load the list')
      : !matches.length ? label('没有匹配的模型，试试其他关键词', 'No matching models. Try another keyword.')
      : label(`找到 ${matches.length} 个模型`, `${matches.length} models found`);
    list.scrollTop = 0;
    activate(matches.length ? Math.max(0, matches.findIndex(option => option.value === current.select.value)) : -1);
    position();
  }

  function sync(control) {
    const selected = control.select.selectedOptions[0];
    control.button.textContent = selected?.textContent || label('请选择模型', 'Select a model');
    control.button.title = selected?.textContent || '';
    control.button.disabled = control.select.disabled;
    if (current === control) render();
  }

  function open(control) {
    if (current === control) return close(true);
    close();
    current = control;
    panel.classList.toggle('is-dark', Boolean(control.select.closest('#phone-screen.dark-mode')));
    panel.classList.toggle('is-sakura', Boolean(control.select.closest('.api-scheme-2')));
    title.textContent = label('选择模型', 'Select a model');
    closeButton.setAttribute('aria-label', label('关闭模型选择', 'Close model selection'));
    search.placeholder = label('搜索模型名称…', 'Search model names…');
    search.setAttribute('aria-label', label('搜索模型名称', 'Search model names'));
    search.value = '';
    panel.hidden = false;
    position();
    panel.showModal();
    control.button.setAttribute('aria-expanded', 'true');
    search.setAttribute('aria-expanded', 'true');
    render();
    search.focus({ preventScroll: true });
    position();
  }

  function createPanel() {
    panel = document.createElement('dialog');
    panel.id = 'model-search-panel';
    panel.className = 'model-search-panel';
    panel.hidden = true;
    panel.setAttribute('aria-labelledby', 'model-search-title');
    const header = document.createElement('div');
    header.className = 'model-search-header';
    title = document.createElement('h2');
    title.id = 'model-search-title';
    closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'model-search-close';
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => close(true));
    header.append(title, closeButton);
    search = document.createElement('input');
    search.type = 'search';
    search.className = 'model-search-input';
    search.autocomplete = 'off';
    search.spellcheck = false;
    search.setAttribute('role', 'combobox');
    search.setAttribute('aria-autocomplete', 'list');
    search.setAttribute('aria-controls', 'model-search-results');
    search.setAttribute('aria-expanded', 'false');
    list = document.createElement('div');
    list.id = 'model-search-results';
    list.className = 'model-search-results';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', label('模型列表', 'Models'));
    status = document.createElement('div');
    status.className = 'model-search-status';
    status.setAttribute('role', 'status');
    panel.append(header, search, status, list);
    // 原生模态弹窗进入顶层，避免设置卡片和手机外框裁剪，同时限制焦点在弹窗内。
    document.body.appendChild(panel);
    search.addEventListener('input', render);
    search.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (matches.length) activate((activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        choose(activeIndex);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    });
    panel.addEventListener('cancel', event => {
      event.preventDefault();
      close(true);
    });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      (document.activeElement === search ? closeButton : search).focus();
    });
    panel.addEventListener('click', event => {
      if (event.target !== panel) return;
      const rect = panel.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom) close(true);
    });
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
  }

  window.initModelSearchSelects = function () {
    if (!panel) createPanel();
    selectIds.forEach(id => {
      const select = document.getElementById(id);
      if (!select || controls.has(id)) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `${id}-search-trigger`;
      button.className = 'model-search-trigger';
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', 'model-search-panel');
      button.setAttribute('aria-expanded', 'false');
      const control = { select, button };
      controls.set(id, control);
      select.after(button);
      select.classList.add('model-search-native');
      button.addEventListener('click', () => open(control));
      button.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (current !== control) open(control);
        }
      });
      select.addEventListener('change', () => sync(control));
      new MutationObserver(() => sync(control)).observe(select,
        { childList: true, subtree: true, attributes: true, characterData: true });
      sync(control);
    });
  };
})();
