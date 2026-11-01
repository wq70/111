// Keep page zoom separate from image-preview zoom, without blocking one-finger scrolling.
(function () {
  const previews = new WeakMap();
  const settings = () => window.state?.globalSettings || {};
  const locked = () => settings().lockInterfaceZoom === true;
  const imageZoomAllowed = () => locked() && settings().allowPreviewZoom !== false;
  const prevent = event => { if (event.cancelable) event.preventDefault(); };

  document.addEventListener('touchmove', event => {
    if (locked() && event.touches.length > 1) prevent(event);
  }, { passive: false, capture: true });
  for (const name of ['gesturestart', 'gesturechange']) {
    document.addEventListener(name, event => { if (locked()) prevent(event); }, { passive: false, capture: true });
  }
  document.addEventListener('wheel', event => {
    if (locked() && event.ctrlKey) prevent(event);
  }, { passive: false, capture: true });

  window.applyInterfaceZoomSettings = function () {
    document.documentElement.classList.toggle('interface-zoom-locked', locked());
    document.querySelectorAll('.locked-image-preview').forEach(surface => previews.get(surface)?.reset());
  };

  window.renderInterfaceZoomSettings = function () {
    const toggle = document.getElementById('lock-interface-zoom-switch');
    const previewToggle = document.getElementById('allow-preview-zoom-switch');
    if (!toggle || !previewToggle) return;
    toggle.checked = locked();
    previewToggle.checked = settings().allowPreviewZoom !== false;
    previewToggle.disabled = !toggle.checked;
  };
  document.getElementById('lock-interface-zoom-switch')?.addEventListener('change', event => {
    document.getElementById('allow-preview-zoom-switch').disabled = !event.target.checked;
  });

  window.prepareLockedImagePreview = function (surface, image) {
    if (!surface || !image) return;
    const previous = previews.get(surface);
    if (previous) { previous.reset(); return; }
    surface.classList.add('locked-image-preview');
    let scale = 1, x = 0, y = 0, gesture = null, suppressClickUntil = 0;
    const originalTransform = image.style.transform, originalTransition = image.style.transition;
    const reset = () => {
      scale = 1; x = 0; y = 0; gesture = null; suppressClickUntil = 0;
      image.style.transform = originalTransform;
      image.style.transition = originalTransition;
    };
    previews.set(surface, { reset });
    image.addEventListener('load', reset);
    const paint = () => {
      // Keep the image reachable when panning and when pinching back toward its original size.
      const maxX = Math.max(0, (image.offsetWidth * scale - surface.clientWidth) / 2);
      const maxY = Math.max(0, (image.offsetHeight * scale - surface.clientHeight) / 2);
      x = Math.max(-maxX, Math.min(maxX, x));
      y = Math.max(-maxY, Math.min(maxY, y));
      image.style.transition = 'none';
      image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    };
    const point = touches => ({
      x: touches.length > 1 ? (touches[0].clientX + touches[1].clientX) / 2 : touches[0].clientX,
      y: touches.length > 1 ? (touches[0].clientY + touches[1].clientY) / 2 : touches[0].clientY,
      distance: touches.length > 1 ? Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY) : 0
    });
    const start = event => {
      gesture = null;
      if (!imageZoomAllowed() || !event.touches.length) return;
      if (event.touches.length < 2 && scale === 1) return;
      // Leave close/previous/next buttons usable even when the image is enlarged.
      if (event.target.closest('button')) return;
      gesture = { ...point(event.touches), scale, imageX: x, imageY: y, count: event.touches.length };
      prevent(event);
    };
    surface.addEventListener('touchstart', start, { passive: false });
    surface.addEventListener('touchmove', event => {
      if (!imageZoomAllowed() || !gesture || !event.touches.length) return;
      if (event.touches.length !== gesture.count) { start(event); return; }
      const next = point(event.touches);
      const nextScale = gesture.distance ? Math.max(1, Math.min(5, gesture.scale * next.distance / gesture.distance)) : scale;
      const box = surface.getBoundingClientRect();
      const anchorX = gesture.x - box.left - box.width / 2;
      const anchorY = gesture.y - box.top - box.height / 2;
      x = next.x - gesture.x + anchorX - (anchorX - gesture.imageX) * nextScale / gesture.scale;
      y = next.y - gesture.y + anchorY - (anchorY - gesture.imageY) * nextScale / gesture.scale;
      scale = nextScale;
      paint();
      suppressClickUntil = Date.now() + 500;
      prevent(event);
    }, { passive: false });
    surface.addEventListener('touchend', event => {
      if (!gesture) return;
      suppressClickUntil = Date.now() + 500;
      start(event);
    }, { passive: false });
    surface.addEventListener('touchcancel', () => { gesture = null; });
    surface.addEventListener('click', event => {
      if (event.target.closest('button')) return;
      if (Date.now() < suppressClickUntil) {
        prevent(event);
        event.stopImmediatePropagation();
      }
    }, true);
    surface.addEventListener('wheel', event => {
      if (!imageZoomAllowed() || !event.ctrlKey) return;
      scale = Math.max(1, Math.min(5, scale * Math.exp(-event.deltaY / 300)));
      paint();
      prevent(event);
    }, { passive: false });
  };
})();
