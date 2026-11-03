/* Shared, keyboard-accessible choice sheet. Native selects remain the data source. */
(function () {
  'use strict';
  const bindings = new WeakMap();
  let active;
  function labelFor(select) {
    if (select.getAttribute('aria-label')) return select.getAttribute('aria-label');
    const label = select.labels?.[0] || select.closest('label') || select.parentElement?.querySelector('label');
    if (!label) return '请选择';
    const copy = label.cloneNode(true);
    copy.querySelectorAll('select, button, input, textarea').forEach(element => element.remove());
    return copy.textContent.trim() || '请选择';
  }
  function close() {
    if (!active) return;
    const { overlay, trigger } = active;
    active = null;
    overlay.remove();
    trigger.setAttribute('aria-expanded', 'false');
    if (trigger.isConnected) trigger.focus({ preventScroll: true });
  }
  function open(select, trigger) {
    close();
    const overlay = document.createElement('div');
    overlay.className = 'choice-sheet-overlay';
    const panel = document.createElement('section');
    panel.className = 'choice-sheet';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    const title = labelFor(select);
    panel.setAttribute('aria-label', title);
    const header = document.createElement('header');
    const heading = document.createElement('strong');
    heading.textContent = title;
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'choice-sheet-close'; cancel.textContent = '关闭'; cancel.onclick = close;
    header.append(heading, cancel);
    const list = document.createElement('div'); list.className = 'choice-sheet-options';
    for (const option of select.options) {
      if (option.hidden) continue;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'choice-sheet-option';
      button.setAttribute('aria-pressed', String(option.selected));
      button.disabled = option.disabled || option.parentElement?.disabled === true;
      const text = document.createElement('span'); text.textContent = option.textContent;
      const mark = document.createElement('span'); mark.className = 'choice-sheet-mark'; mark.textContent = option.selected ? '✓' : '';
      button.append(text, mark);
      button.onclick = () => {
        select.value = option.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        sync(select); close();
      };
      list.append(button);
    }
    panel.append(header, list); overlay.append(panel);
    overlay.onclick = event => { if (event.target === overlay) close(); };
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      const items = [...panel.querySelectorAll('button:not(:disabled)')];
      const index = items.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
      if (event.key === 'Tab' && ((!event.shiftKey && index === items.length - 1) || (event.shiftKey && index === 0))) {
        event.preventDefault(); items[event.shiftKey ? items.length - 1 : 0]?.focus();
      }
    });
    (document.getElementById('phone-screen') || document.body).append(overlay);
    active = { overlay, trigger };
    trigger.setAttribute('aria-expanded', 'true');
    (list.querySelector('[aria-pressed="true"]:not(:disabled)') || cancel).focus();
  }
  function sync(select) {
    const trigger = bindings.get(select);
    if (!trigger) return;
    trigger.textContent = select.selectedOptions[0]?.textContent || '请选择';
    trigger.disabled = select.disabled;
    const label = labelFor(select);
    if (label) trigger.setAttribute('aria-label', `${label}：${trigger.textContent}`);
  }
  function enhance(root) {
    for (const select of root.querySelectorAll('select')) {
      if (select.hidden && !bindings.has(select)) continue;
      if (!bindings.has(select)) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'choice-picker-trigger';
        button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', 'false');
        select.hidden = true; select.setAttribute('aria-hidden', 'true'); select.tabIndex = -1;
        select.insertAdjacentElement('afterend', button);
        bindings.set(select, button);
        select.addEventListener('change', () => sync(select));
        button.onclick = () => open(select, button);
      }
      sync(select);
    }
  }
  window.ChoicePicker = { enhance, close };
})();
