/**
 * 视频通话优化功能
 * 从 script.js 第 80389 ~ 80888 行提取
 * 包含：视频通话优化设置、摄像头控制、对话提取、TTS文本处理
 */

// ========================================
// 视频通话优化功能
// ========================================

// 摄像头相关变量
let cameraStream = null;
let captureInterval = null;
let lastCapturedImage = null;

// 提取对话内容（只保留引号内的文本）
function extractDialogueOnly(text) {
  if (!text) return text;

  // 支持的引号类型：尽可能全面的引号格式
  const quotePatterns = [
    /"([^"]*)"/g,        // 英文双引号
    /'([^']*)'/g,        // 英文单引号
    /「([^」]*)」/g,     // 中文直角引号
    /『([^』]*)』/g,     // 中文直角双引号
    /\u201c([^\u201d]*)\u201d/g,        // 中文双引号
    /\u2018([^\u2019]*)\u2019/g,        // 中文单引号
    /‹([^›]*)›/g,        // 单书名号
    /«([^»]*)»/g,        // 双书名号
    /‚([^\u2019]*)\u2019/g,        // 德语单引号
    /„([^\u201d]*)\u201d/g,        // 德语双引号
    /【([^】]*)】/g,     // 方括号（部分场景用作对话）
    /『([^』]*)』/g      // 繁体中文引号
  ];

  let dialogues = [];

  // 提取所有引号内的内容
  for (const pattern of quotePatterns) {
    // 重置正则表达式的lastIndex，避免状态污染
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match[1] && match[1].trim()) {
        const dialogue = match[1].trim();
        // 避免重复添加相同的对话片段
        if (!dialogues.includes(dialogue)) {
          dialogues.push(dialogue);
        }
      }
    }
  }

  // 如果找到了引号内容，返回引号内容（只读对话）
  if (dialogues.length > 0) {
    console.log('[对话提取] 成功提取到 ' + dialogues.length + ' 段对话');
    return dialogues.join(' ');
  }

  // 如果没有找到任何引号，返回原文（保证TTS能正常工作）
  console.log('[对话提取] 未找到引号，返回原文');
  return text;
}


// 获取处理后的TTS文本
window.getProcessedTTSText = function (originalText, chatId) {
  if (!originalText) return '';

  // 检查是否启用了"仅读取对话"功能
  if (typeof state !== 'undefined' && state.chats && state.chats[chatId]) {
    const chat = state.chats[chatId];
    if (chat.videoOptimization && chat.videoOptimization.ttsDialogueOnly) {
      // extractDialogueOnly 会返回引号内容或原文，不会返回空
      return extractDialogueOnly(originalText);
    }
  }

  return originalText;
};

// 初始化视频通话优化事件监听
function initVideoOptimization() {
  // 视频通话优化开关
  const enableSwitch = document.getElementById('enable-video-optimization-switch');
  const configContainer = document.getElementById('video-optimization-config-container');

  if (enableSwitch) {
    enableSwitch.addEventListener('change', function () {
      if (this.checked) {
        configContainer.style.display = 'block';
      } else {
        configContainer.style.display = 'none';
      }
    });
  }

  // 对方视频图片 - 本地上传
  const remoteVideoInput = document.getElementById('remote-video-input');
  if (remoteVideoInput) {
    remoteVideoInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
          const imgUrl = event.target.result;
          document.getElementById('remote-video-preview').src = imgUrl;
          document.getElementById('remote-video-preview').style.display = 'block';
          document.getElementById('remote-video-placeholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // 对方视频图片 - URL上传
  const remoteVideoUrlBtn = document.getElementById('remote-video-url-btn');
  const remoteVideoUrlInput = document.getElementById('remote-video-url-input');
  if (remoteVideoUrlBtn && remoteVideoUrlInput) {
    remoteVideoUrlBtn.addEventListener('click', function () {
      const url = remoteVideoUrlInput.value.trim();
      if (url) {
        document.getElementById('remote-video-preview').src = url;
        document.getElementById('remote-video-preview').style.display = 'block';
        document.getElementById('remote-video-placeholder').style.display = 'none';
      }
    });

    remoteVideoUrlInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        remoteVideoUrlBtn.click();
      }
    });
  }

  // 我方视频图片 - 本地上传
  const localVideoInput = document.getElementById('local-video-input');
  if (localVideoInput) {
    localVideoInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
          const imgUrl = event.target.result;
          document.getElementById('local-video-preview').src = imgUrl;
          document.getElementById('local-video-preview').style.display = 'block';
          document.getElementById('local-video-placeholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // 我方视频图片 - URL上传
  const localVideoUrlBtn = document.getElementById('local-video-url-btn');
  const localVideoUrlInput = document.getElementById('local-video-url-input');
  if (localVideoUrlBtn && localVideoUrlInput) {
    localVideoUrlBtn.addEventListener('click', function () {
      const url = localVideoUrlInput.value.trim();
      if (url) {
        document.getElementById('local-video-preview').src = url;
        document.getElementById('local-video-preview').style.display = 'block';
        document.getElementById('local-video-placeholder').style.display = 'none';
      }
    });

    localVideoUrlInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        localVideoUrlBtn.click();
      }
    });
  }

  // 对方视频图片 - 重置按钮
  const remoteVideoResetBtn = document.getElementById('remote-video-reset-btn');
  if (remoteVideoResetBtn) {
    remoteVideoResetBtn.addEventListener('click', function () {
      document.getElementById('remote-video-preview').src = '';
      document.getElementById('remote-video-preview').style.display = 'none';
      document.getElementById('remote-video-placeholder').style.display = 'flex';
      document.getElementById('remote-video-url-input').value = '';
      const remoteVideoInput = document.getElementById('remote-video-input');
      if (remoteVideoInput) remoteVideoInput.value = '';
    });
  }

  // 我方视频图片 - 重置按钮
  const localVideoResetBtn = document.getElementById('local-video-reset-btn');
  if (localVideoResetBtn) {
    localVideoResetBtn.addEventListener('click', function () {
      document.getElementById('local-video-preview').src = '';
      document.getElementById('local-video-preview').style.display = 'none';
      document.getElementById('local-video-placeholder').style.display = 'flex';
      document.getElementById('local-video-url-input').value = '';
      const localVideoInput = document.getElementById('local-video-input');
      if (localVideoInput) localVideoInput.value = '';
    });
  }

  // 真实摄像头开关
  const enableRealCameraSwitch = document.getElementById('enable-real-camera-switch');
  const cameraIntervalSetting = document.getElementById('camera-interval-setting');
  if (enableRealCameraSwitch) {
    enableRealCameraSwitch.addEventListener('change', function () {
      if (this.checked) {
        cameraIntervalSetting.style.display = 'block';
      } else {
        cameraIntervalSetting.style.display = 'none';
        stopCamera();
      }
    });
  }

  // 后置摄像头开关 - 通话中实时切换
  const enableRearCameraSwitch = document.getElementById('enable-rear-camera-switch');
  if (enableRearCameraSwitch) {
    enableRearCameraSwitch.addEventListener('change', async function () {
      // 如果正在通话中且摄像头已启动，实时切换
      if (cameraStream && videoCallState && videoCallState.isActive) {
        stopCamera();
        const facingMode = this.checked ? 'environment' : 'user';
        const success = await startCamera(facingMode);
        if (success) {
          const chat = state.chats[videoCallState.activeChatId];
          const interval = (chat && chat.videoOptimization && chat.videoOptimization.cameraInterval) || 5;
          startCameraCapture(interval);
        }
      }
    });
  }

  // 点击小屏互换位置
  const localVideoSmall = document.getElementById('local-video-small');
  if (localVideoSmall) {
    localVideoSmall.addEventListener('click', swapVideoPosition);
  }
}


// 互换视频位置
function swapVideoPosition() {
  const remoteImg = document.getElementById('remote-video-img');
  const localImg = document.getElementById('local-video-img');

  const tempSrc = remoteImg.src;
  remoteImg.src = localImg.src;
  localImg.src = tempSrc;
}

// 加载视频通话优化设置
window.loadVideoOptimizationSettings = function (chat) {
  if (!chat) return;

  const settings = chat.videoOptimization || {};

  const enableSwitch = document.getElementById('enable-video-optimization-switch');
  const configContainer = document.getElementById('video-optimization-config-container');
  if (enableSwitch) {
    enableSwitch.checked = settings.enabled || false;
    configContainer.style.display = settings.enabled ? 'block' : 'none';
  }

  if (settings.remoteVideoUrl) {
    document.getElementById('remote-video-preview').src = settings.remoteVideoUrl;
    document.getElementById('remote-video-preview').style.display = 'block';
    document.getElementById('remote-video-placeholder').style.display = 'none';
    document.getElementById('remote-video-url-input').value = settings.remoteVideoUrl;
  } else {
    document.getElementById('remote-video-preview').style.display = 'none';
    document.getElementById('remote-video-placeholder').style.display = 'flex';
    document.getElementById('remote-video-url-input').value = '';
  }

  if (settings.localVideoUrl) {
    document.getElementById('local-video-preview').src = settings.localVideoUrl;
    document.getElementById('local-video-preview').style.display = 'block';
    document.getElementById('local-video-placeholder').style.display = 'none';
    document.getElementById('local-video-url-input').value = settings.localVideoUrl;
  } else {
    document.getElementById('local-video-preview').style.display = 'none';
    document.getElementById('local-video-placeholder').style.display = 'flex';
    document.getElementById('local-video-url-input').value = '';
  }

  // 加载真实摄像头设置
  const enableRealCameraSwitch = document.getElementById('enable-real-camera-switch');
  const cameraIntervalSetting = document.getElementById('camera-interval-setting');
  const cameraIntervalInput = document.getElementById('camera-capture-interval');

  if (enableRealCameraSwitch) {
    enableRealCameraSwitch.checked = settings.enableRealCamera || false;
    cameraIntervalSetting.style.display = settings.enableRealCamera ? 'block' : 'none';
  }

  if (cameraIntervalInput) {
    cameraIntervalInput.value = settings.cameraInterval || 5;
  }

  // 加载后置摄像头设置
  const enableRearCameraSwitch = document.getElementById('enable-rear-camera-switch');
  if (enableRearCameraSwitch) {
    enableRearCameraSwitch.checked = settings.useRearCamera || false;
  }

  // 加载仅读取对话设置
  const ttsDialogueOnlySwitch = document.getElementById('tts-dialogue-only-switch');
  if (ttsDialogueOnlySwitch) {
    ttsDialogueOnlySwitch.checked = settings.ttsDialogueOnly || false;
  }

  // 加载旁白对话穿插模式设置
  const videoInterleavedSwitch = document.getElementById('video-interleaved-mode-switch');
  if (videoInterleavedSwitch) {
    videoInterleavedSwitch.checked = settings.interleavedMode || false;
  }
};

// 保存视频通话优化设置
window.saveVideoOptimizationSettings = function (chat) {
  if (!chat) return;

  const enableSwitch = document.getElementById('enable-video-optimization-switch');
  const remoteVideoPreview = document.getElementById('remote-video-preview');
  const localVideoPreview = document.getElementById('local-video-preview');
  const enableRealCameraSwitch = document.getElementById('enable-real-camera-switch');
  const cameraIntervalInput = document.getElementById('camera-capture-interval');
  const ttsDialogueOnlySwitch = document.getElementById('tts-dialogue-only-switch');

  const videoInterleavedSwitch = document.getElementById('video-interleaved-mode-switch');

  chat.videoOptimization = {
    enabled: enableSwitch ? enableSwitch.checked : false,
    remoteVideoUrl: remoteVideoPreview.style.display === 'block' ? remoteVideoPreview.src : '',
    localVideoUrl: localVideoPreview.style.display === 'block' ? localVideoPreview.src : '',
    enableRealCamera: enableRealCameraSwitch ? enableRealCameraSwitch.checked : false,
    useRearCamera: document.getElementById('enable-rear-camera-switch') ? document.getElementById('enable-rear-camera-switch').checked : false,
    cameraInterval: cameraIntervalInput ? parseInt(cameraIntervalInput.value) || 5 : 5,
    ttsDialogueOnly: ttsDialogueOnlySwitch ? ttsDialogueOnlySwitch.checked : false,
    interleavedMode: videoInterleavedSwitch ? videoInterleavedSwitch.checked : false
  };

  // 不需要在这里put到数据库，因为调用方会统一保存
};


// 应用视频通话优化到视频界面
window.applyVideoOptimizationToCall = async function (chat) {
  const videoDisplayArea = document.getElementById('video-display-area');
  const avatarArea = document.querySelector('.video-call-avatar-area');

  if (!chat || !chat.videoOptimization || !chat.videoOptimization.enabled) {
    videoDisplayArea.style.display = 'none';
    if (avatarArea) avatarArea.style.display = 'flex';
    stopCamera();
    return;
  }

  const settings = chat.videoOptimization;
  if (settings.remoteVideoUrl || settings.localVideoUrl || settings.enableRealCamera) {
    videoDisplayArea.style.display = 'block';
    if (avatarArea) avatarArea.style.display = 'none';

    if (settings.remoteVideoUrl) {
      document.getElementById('remote-video-img').src = settings.remoteVideoUrl;
    }

    // 处理我方画面：真实摄像头或静态图片
    const localImg = document.getElementById('local-video-img');
    const localVideo = document.getElementById('local-camera-video');

    if (settings.enableRealCamera) {
      // 使用真实摄像头
      localImg.style.display = 'none';
      localVideo.style.display = 'block';

      const facingMode = settings.useRearCamera ? 'environment' : 'user';
      const success = await startCamera(facingMode);
      if (success) {
        // 启动定时截图
        const interval = settings.cameraInterval || 5;
        startCameraCapture(interval);
      }
    } else if (settings.localVideoUrl) {
      // 使用静态图片
      localVideo.style.display = 'none';
      localImg.style.display = 'block';
      localImg.src = settings.localVideoUrl;
      stopCamera();
    }
  } else {
    videoDisplayArea.style.display = 'none';
    if (avatarArea) avatarArea.style.display = 'flex';
    stopCamera();
  }
};

// 启动摄像头
async function startCamera(useFacingMode) {
  try {
    const facing = useFacingMode || 'user';
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: facing
      },
      audio: false
    });

    cameraStream = stream;
    const videoElement = document.getElementById('local-camera-video');
    if (videoElement) {
      videoElement.srcObject = stream;
    }

    // 更新状态显示
    updateCameraStatus(true, '摄像头已启动');

    return true;
  } catch (error) {
    console.error('无法访问摄像头:', error);
    updateCameraStatus(false, '摄像头启动失败: ' + error.message);
    return false;
  }
}

// 停止摄像头
function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }

  const videoElement = document.getElementById('local-camera-video');
  if (videoElement) {
    videoElement.srcObject = null;
  }

  updateCameraStatus(false, '摄像头已停止');
}

// 更新摄像头状态显示
function updateCameraStatus(isActive, message) {
  const statusDiv = document.getElementById('camera-status');
  const statusIcon = document.getElementById('camera-status-icon');
  const statusText = document.getElementById('camera-status-text');

  if (statusDiv && statusIcon && statusText) {
    statusDiv.style.display = 'block';
    statusIcon.style.background = isActive ? '#4cd964' : '#ccc';
    statusText.textContent = message;
  }
}

// 截取摄像头画面
function captureCameraFrame() {
  const videoElement = document.getElementById('local-camera-video');
  if (!videoElement || !cameraStream) return null;

  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, 0, 0);

  // 转换为base64
  const imageData = canvas.toDataURL('image/jpeg', 0.8);
  lastCapturedImage = imageData;

  return imageData;
}

// 启动定时截图
function startCameraCapture(intervalSeconds) {
  if (captureInterval) {
    clearInterval(captureInterval);
  }

  // 立即截取一次
  captureCameraFrame();

  // 定时截取
  captureInterval = setInterval(() => {
    captureCameraFrame();
    console.log('已截取摄像头画面');
  }, intervalSeconds * 1000);
}

// 获取最新截图
window.getLastCameraCapture = function () {
  return lastCapturedImage;
};

// 在页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
  initVideoOptimization();
});

// 如果DOMContentLoaded已经触发，立即初始化
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(initVideoOptimization, 1);
}