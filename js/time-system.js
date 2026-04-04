// ==================== 时间感知与自定义时间系统 ====================
(function() {
  'use strict';

  // 获取元素
  const timePerceptionToggle = document.getElementById('time-perception-toggle');
  const timeZoneGroup = document.getElementById('time-zone-group');
  const customTimeToggle = document.getElementById('custom-time-toggle');
  const customTimeSettingsGroup = document.getElementById('custom-time-settings-group');
  
  const customYearInput = document.getElementById('custom-year-input');
  const customMonthInput = document.getElementById('custom-month-input');
  const customDayInput = document.getElementById('custom-day-input');
  const customHourInput = document.getElementById('custom-hour-input');
  const customMinuteInput = document.getElementById('custom-minute-input');
  const customTimePreview = document.getElementById('custom-time-preview');

  // 从localStorage加载设置
  function loadSettings() {
    const timePerceptionEnabled = localStorage.getItem('time-perception-enabled') === 'true';
    const customTimeEnabled = localStorage.getItem('custom-time-enabled') === 'true';
    
    timePerceptionToggle.checked = timePerceptionEnabled;
    customTimeToggle.checked = customTimeEnabled;
    
    // 显示/隐藏相应的设置面板
    if (timePerceptionEnabled) {
      timeZoneGroup.style.display = 'block';
    }
    if (customTimeEnabled) {
      customTimeSettingsGroup.style.display = 'block';
    }
    
    // 加载自定义时间值
    customYearInput.value = localStorage.getItem('custom-time-year') || '';
    customMonthInput.value = localStorage.getItem('custom-time-month') || '';
    customDayInput.value = localStorage.getItem('custom-time-day') || '';
    customHourInput.value = localStorage.getItem('custom-time-hour') || '';
    customMinuteInput.value = localStorage.getItem('custom-time-minute') || '';
    
    updatePreview();
  }

  // 更新时间预览（显示流逝后的实时时间）
  let previewTimer = null;
  function updatePreview() {
    const customTimeEnabled = localStorage.getItem('custom-time-enabled') === 'true';
    if (customTimeEnabled) {
      const d = calcElapsedCustomTime();
      if (d) {
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        customTimePreview.textContent = `${y}年${mo}月${da}日 ${h}:${mi}`;
        // 每分钟刷新一次预览
        if (!previewTimer) {
          previewTimer = setInterval(updatePreview, 60000);
        }
        return;
      }
    }
    // 未启用或数据不完整
    const year = customYearInput.value;
    const month = customMonthInput.value;
    const day = customDayInput.value;
    const hour = customHourInput.value;
    const minute = customMinuteInput.value;
    if (year && month && day && hour !== '' && minute !== '') {
      customTimePreview.textContent = `${year}年${String(month).padStart(2, '0')}月${String(day).padStart(2, '0')}日 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    } else {
      customTimePreview.textContent = '未设置';
    }
    if (previewTimer) {
      clearInterval(previewTimer);
      previewTimer = null;
    }
  }

  // 保存自定义时间设置（同时记录设定时的真实时间戳，用于时间流逝计算）
  function saveCustomTimeSettings() {
    localStorage.setItem('custom-time-year', customYearInput.value);
    localStorage.setItem('custom-time-month', customMonthInput.value);
    localStorage.setItem('custom-time-day', customDayInput.value);
    localStorage.setItem('custom-time-hour', customHourInput.value);
    localStorage.setItem('custom-time-minute', customMinuteInput.value);
    // 记录设定这个时间时的真实时间戳，后续用 elapsed = Date.now() - anchor 来计算流逝
    localStorage.setItem('custom-time-anchor', String(Date.now()));
    updatePreview();
  }

  // 时间感知开关事件
  timePerceptionToggle.addEventListener('change', function() {
    const isEnabled = this.checked;
    localStorage.setItem('time-perception-enabled', isEnabled);
    
    if (isEnabled) {
      // 显示时区设置
      timeZoneGroup.style.display = 'block';
      
      // 关闭自定义时间
      if (customTimeToggle.checked) {
        customTimeToggle.checked = false;
        customTimeSettingsGroup.style.display = 'none';
        localStorage.setItem('custom-time-enabled', 'false');
      }
    } else {
      timeZoneGroup.style.display = 'none';
    }
  });

  // 自定义时间开关事件
  customTimeToggle.addEventListener('change', function() {
    const isEnabled = this.checked;
    localStorage.setItem('custom-time-enabled', isEnabled);
    
    if (isEnabled) {
      // 显示自定义时间设置
      customTimeSettingsGroup.style.display = 'block';
      
      // 关闭时间感知
      if (timePerceptionToggle.checked) {
        timePerceptionToggle.checked = false;
        timeZoneGroup.style.display = 'none';
        localStorage.setItem('time-perception-enabled', 'false');
      }
      
      // 如果没有设置值，使用当前时间作为默认值
      if (!customYearInput.value) {
        const now = new Date();
        customYearInput.value = now.getFullYear();
        customMonthInput.value = now.getMonth() + 1;
        customDayInput.value = now.getDate();
        customHourInput.value = now.getHours();
        customMinuteInput.value = now.getMinutes();
        saveCustomTimeSettings();
      }
    } else {
      customTimeSettingsGroup.style.display = 'none';
      // 关闭时清理预览定时器
      if (previewTimer) {
        clearInterval(previewTimer);
        previewTimer = null;
      }
    }
  });

  // 监听自定义时间输入变化
  [customYearInput, customMonthInput, customDayInput, customHourInput, customMinuteInput].forEach(input => {
    input.addEventListener('input', saveCustomTimeSettings);
    input.addEventListener('change', saveCustomTimeSettings);
  });

  // 根据用户设定的基准时间 + 真实流逝时间，计算当前自定义时间
  function calcElapsedCustomTime() {
    const year = localStorage.getItem('custom-time-year');
    const month = localStorage.getItem('custom-time-month');
    const day = localStorage.getItem('custom-time-day');
    const hour = localStorage.getItem('custom-time-hour');
    const minute = localStorage.getItem('custom-time-minute');
    const anchor = localStorage.getItem('custom-time-anchor');

    if (year && month && day && hour !== null && minute !== null && anchor) {
      const baseTime = new Date(
        parseInt(year), parseInt(month) - 1, parseInt(day),
        parseInt(hour), parseInt(minute)
      ).getTime();
      const elapsed = Date.now() - parseInt(anchor);
      return new Date(baseTime + elapsed);
    }
    return null;
  }

  // 获取当前时间（考虑自定义时间 + 自动流逝）
  window.getCustomTime = function() {
    const customTimeEnabled = localStorage.getItem('custom-time-enabled') === 'true';
    
    if (customTimeEnabled) {
      const d = calcElapsedCustomTime();
      if (d) {
        const y = d.getFullYear();
        const mo = d.getMonth() + 1;
        const da = d.getDate();
        const h = d.getHours();
        const mi = d.getMinutes();
        return {
          enabled: true,
          year: y,
          month: mo,
          day: da,
          hour: h,
          minute: mi,
          date: d,
          formatted: `${y}年${String(mo).padStart(2, '0')}月${String(da).padStart(2, '0')}日 ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
        };
      }
    }
    
    // 返回当前实际时间
    const now = new Date();
    return {
      enabled: false,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      date: now,
      formatted: `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    };
  };

  // 页面加载时初始化
  loadSettings();

  console.log('时间感知与自定义时间系统已初始化');
})();
