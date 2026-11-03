// Shared, row-aware ordering for chat controls. Existing saved toolbar orders are retained.
const DEFAULT_BUTTON_ORDER = [
  'open-sticker-panel-btn', 'send-photo-btn', 'camera-capture-btn', 'upload-image-btn', 'send-video-btn',
  'transfer-btn', 'voice-message-btn', 'voice-record-btn', 'send-waimai-request-btn',
  'video-call-btn', 'group-video-call-btn', 'voice-call-btn', 'group-voice-call-btn', 'send-poll-btn',
  'share-link-btn', 'share-location-btn', 'gomoku-btn', 'open-shopping-btn', 'pat-btn',
  'edit-last-response-btn', 'regenerate-btn', 'generation-adjustments-btn', 'model-communication-btn',
  'propel-btn', 'show-announcement-board-btn', 'werewolf-game-btn', 'read-together-btn',
  'open-truth-game-btn', 'open-watch-together-btn', 'open-nai-gallery-btn', 'open-todo-list-btn',
  'open-quick-reply-btn', 'narration-btn', 'stop-api-call-btn'
];

const CHAT_BUTTON_ORDER_GROUPS = [
  { editor: 'button-order-editor', key: 'chatActionButtonsOrder', reset: 'reset-button-order-btn',
    container: '#chat-input-actions-top', defaults: DEFAULT_BUTTON_ORDER },
  { editor: 'header-button-order-editor', key: 'chatHeaderButtonsOrder', reset: 'reset-header-button-order-btn',
    container: '#chat-interface-screen .default-controls .header-actions',
    defaults: ['open-memory-screen-btn', 'listen-together-btn', 'chat-settings-btn'] },
  { editor: 'selection-button-order-editor', key: 'chatSelectionButtonsOrder', reset: 'reset-selection-button-order-btn',
    container: '#chat-interface-screen .selection-controls .header-actions',
    defaults: ['selection-screenshot-btn', 'selection-favorite-btn', 'selection-forward-btn',
      'selection-share-btn', 'selection-soft-delete-btn', 'selection-erase-btn'] },
  { editor: 'message-action-order-editor', key: 'messageActionsOrder', reset: 'reset-message-action-order-btn',
    container: '#message-actions-modal .custom-modal-footer',
    defaults: ['view-thought-chain-btn', 'edit-message-btn', 'copy-message-btn', 'copy-timestamp-btn',
      'recall-message-btn', 'publish-to-announcement-btn', 'translate-message-btn', 'quote-message-btn',
      'forward-message-btn', 'select-message-btn', 'delete-message-btn', 'erase-message-btn',
      'discuss-message-btn', 'download-ai-voice-btn', 'regenerate-ai-voice-btn'] }
];

function getChatButtonOrder(group) {
  const saved = state.globalSettings[group.key];
  return [...new Set([...(Array.isArray(saved) ? saved : []), ...group.defaults])]
    .filter(id => group.defaults.includes(id));
}

function renderButtonOrderEditor() {
  CHAT_BUTTON_ORDER_GROUPS.forEach(group => {
    const editor = document.getElementById(group.editor);
    if (!editor) return;
    editor.replaceChildren();
    editor.classList.add('button-order-editor');
    getChatButtonOrder(group).forEach(id => {
      const original = document.getElementById(id);
      if (!original) return;
      const label = original.getAttribute('aria-label') || original.title || original.textContent.trim();
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'draggable-button-item';
      item.dataset.buttonId = id;
      item.title = label;
      item.setAttribute('aria-label', label + '，方向键调整顺序');
      if (group.key === 'chatActionButtonsOrder') {
        item.innerHTML = original.innerHTML;
        item.querySelectorAll('[id]').forEach(child => child.removeAttribute('id'));
        item.querySelectorAll('img').forEach(img => { img.draggable = false; });
      } else {
        item.textContent = label;
      }
      editor.appendChild(item);
    });
  });
}

function applyButtonOrder() {
  CHAT_BUTTON_ORDER_GROUPS.forEach(group => {
    const container = document.querySelector(group.container);
    if (!container) return;
    getChatButtonOrder(group).forEach(id => {
      const button = document.getElementById(id);
      if (button && button.parentElement === container) container.appendChild(button);
    });
    if (group.key === 'messageActionsOrder') {
      const cancel = document.getElementById('cancel-message-action-btn');
      if (cancel) container.appendChild(cancel);
    }
  });
}

async function saveButtonOrder(group = CHAT_BUTTON_ORDER_GROUPS[0]) {
  const editor = document.getElementById(group.editor);
  if (!editor) return;
  state.globalSettings[group.key] = Array.from(editor.children, item => item.dataset.buttonId);
  applyButtonOrder();
  await db.globalSettings.put(state.globalSettings);
}

async function resetButtonOrder(group = CHAT_BUTTON_ORDER_GROUPS[0]) {
  // A click listener may pass an Event instead of a group.
  if (!group.key) group = CHAT_BUTTON_ORDER_GROUPS[0];
  state.globalSettings[group.key] = null;
  applyButtonOrder();
  renderButtonOrderEditor();
  await db.globalSettings.put(state.globalSettings);
}

function initializeButtonOrderEditor() {
  CHAT_BUTTON_ORDER_GROUPS.forEach(group => {
    const editor = document.getElementById(group.editor);
    if (!editor || editor.dataset.orderInitialized) return;
    editor.dataset.orderInitialized = 'true';
    let drag = null;

    const items = () => Array.from(editor.children);
    const persist = () => saveButtonOrder(group).catch(error => {
      console.error('保存按钮顺序失败', error);
      showCustomAlert('保存失败', '按钮顺序未能保存，请重试。');
    });
    const place = (item, index) => {
      const ordered = items();
      const previous = ordered.indexOf(item);
      if (index === previous || index < 0 || index >= ordered.length) return;
      editor.insertBefore(item, index > previous ? ordered[index].nextSibling : ordered[index]);
    };
    const scrollParent = () => {
      for (let node = editor.parentElement; node; node = node.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node;
      }
      return document.scrollingElement;
    };
    const update = () => {
      if (!drag || !drag.started) return;
      const { x, y, ghost, offsetX, offsetY } = drag;
      ghost.style.transform = `translate3d(${x - offsetX}px, ${y - offsetY}px, 0)`;
      const scroller = drag.scroller;
      const bounds = scroller === document.scrollingElement
        ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
      const edge = 40;
      const speed = y < bounds.top + edge ? -Math.min(12, (bounds.top + edge - y) / 3)
        : y > bounds.bottom - edge ? Math.min(12, (y - bounds.bottom + edge) / 3) : 0;
      if (speed) scroller.scrollTop += speed;
      // Include the placeholder: its grid slot remains a valid, stable drop target.
      const slots = items().map(item => item.getBoundingClientRect());
      let nearest = -1, distance = Infinity;
      slots.forEach((box, index) => {
        const value = (x - box.left - box.width / 2) ** 2 + (y - box.top - box.height / 2) ** 2;
        if (value < distance) { distance = value; nearest = index; }
      });
      place(drag.item, nearest);
    };
    const tick = () => {
      if (!drag || !drag.started) return;
      update();
      drag.frame = requestAnimationFrame(tick);
    };
    const finish = (cancelled = false) => {
      if (!drag) return;
      const current = drag;
      if (current.started && !cancelled) update();
      drag = null;
      cancelAnimationFrame(current.frame);
      current.ghost?.remove();
      current.item.classList.remove('dragging');
      current.item.removeAttribute('aria-pressed');
      editor.classList.remove('is-sorting');
      if (editor.hasPointerCapture(current.pointerId)) editor.releasePointerCapture(current.pointerId);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', cancelKey);
      if (cancelled) current.original.forEach(item => editor.appendChild(item));
      else if (current.started) persist();
    };
    const cancel = () => finish(true);
    const cancelKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); cancel(); }
    };
    editor.addEventListener('pointerdown', event => {
      const item = event.target.closest('.draggable-button-item');
      if (!item || drag || !event.isPrimary || event.button !== 0) return;
      const box = item.getBoundingClientRect();
      drag = { item, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
        startX: event.clientX, startY: event.clientY, offsetX: event.clientX - box.left,
        offsetY: event.clientY - box.top, original: items(), scroller: scrollParent(), started: false };
      editor.setPointerCapture(event.pointerId);
      window.addEventListener('blur', cancel);
      window.addEventListener('keydown', cancelKey);
    });
    editor.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.x = event.clientX; drag.y = event.clientY;
      if (!drag.started && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 6) {
        drag.started = true;
        const box = drag.item.getBoundingClientRect();
        const ghost = drag.item.cloneNode(true);
        ghost.classList.add('button-order-drag-ghost');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.removeAttribute('id');
        ghost.style.width = box.width + 'px';
        ghost.style.height = box.height + 'px';
        document.body.appendChild(ghost);
        drag.ghost = ghost;
        drag.item.classList.add('dragging');
        drag.item.setAttribute('aria-pressed', 'true');
        editor.classList.add('is-sorting');
        tick();
      }
      if (event.cancelable) event.preventDefault();
    });
    editor.addEventListener('pointerup', event => {
      if (drag && event.pointerId === drag.pointerId) finish();
    });
    editor.addEventListener('pointercancel', cancel);
    editor.addEventListener('lostpointercapture', cancel);
    editor.addEventListener('dragstart', event => event.preventDefault());
    editor.addEventListener('keydown', event => {
      if (event.key === 'Escape') { cancel(); return; }
      if (drag || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const item = event.target.closest('.draggable-button-item');
      if (!item) return;
      event.preventDefault();
      const ordered = items(), index = ordered.indexOf(item);
      let target = index + (event.key === 'ArrowLeft' ? -1 : 1);
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const box = item.getBoundingClientRect(), direction = event.key === 'ArrowUp' ? -1 : 1;
        let distance = Infinity;
        target = index;
        ordered.forEach((other, i) => {
          const rect = other.getBoundingClientRect();
          const dy = rect.top - box.top;
          const value = (rect.left - box.left) ** 2 + dy ** 2;
          if (dy * direction > box.height / 2 && value < distance) { target = i; distance = value; }
        });
      }
      place(item, target);
      item.focus();
      if (target !== index && target >= 0 && target < ordered.length) persist();
    });
    // The legacy toolbar reset is bound in init-features.js.
    if (group.key !== 'chatActionButtonsOrder') {
      document.getElementById(group.reset)?.addEventListener('click', () => resetButtonOrder(group));
    }
  });
}
