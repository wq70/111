// ========== API设置界面美化 ==========
// 独立模块：当 state.globalSettings.apiStyleBeautify 开启时，
// 为 #api-settings-screen 添加 api-scheme-2 类名，加载美化CSS

(function() {
  'use strict';

  let styleEl = null;

  function applyApiStyleBeautify() {
    const enabled = state.globalSettings.apiStyleBeautify || false;
    const screen = document.getElementById('api-settings-screen');
    if (!screen) return;

    if (enabled) {
      screen.classList.add('api-scheme-2');
      loadStyleSheet();
    } else {
      screen.classList.remove('api-scheme-2');
      removeStyleSheet();
    }
  }

  function loadStyleSheet() {
    if (styleEl) return;
    styleEl = document.createElement('link');
    styleEl.rel = 'stylesheet';
    styleEl.href = 'style-scheme-2.css?v=0.0.36';
    styleEl.id = 'api-style-beautify-css';
    document.head.appendChild(styleEl);
  }

  function removeStyleSheet() {
    if (styleEl) {
      styleEl.remove();
      styleEl = null;
    }
  }

  // 暴露给全局
  window.applyApiStyleBeautify = applyApiStyleBeautify;
})();
