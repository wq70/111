/**
 * 真实语音录制功能（带语音识别）
 * 从 script.js 第 80889 ~ 81252 行提取
 * 包含：录音控制、语音识别、语音消息发送
 * 注意：这是一个 IIFE，内部变量不会污染全局作用域
 */

// ========== 真实语音录制功能（带语音识别） ==========
(function () {
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let recordingStream = null;
  let recognition = null;
  let recognizedText = '';
  let recordingStartTime = 0;

  // 初始化录音按钮
  function initVoiceRecording() {
    const voiceRecordBtn = document.getElementById('voice-record-btn');
    if (!voiceRecordBtn) {
      console.warn('录音按钮未找到');
      return;
    }

    voiceRecordBtn.addEventListener('click', toggleRecording);

    // 检查浏览器是否支持语音识别
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.warn('浏览器不支持语音识别API');
    }
  }

  // 切换录音状态
  async function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  }

  // 开始录音
  async function startRecording() {
    try {
      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStream = stream;

      // 创建MediaRecorder
      const options = { mimeType: 'audio/webm' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'audio/mp4';
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options.mimeType = '';
        }
      }

      mediaRecorder = new MediaRecorder(stream, options);
      audioChunks = [];
      recognizedText = '';
      recordingStartTime = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });

        // 等待语音识别完成（关键修复：给移动端Chrome足够时间）
        if (recognition) {
          await new Promise((resolve) => {
            let resolved = false;
            const safeResolve = () => {
              if (!resolved) {
                resolved = true;
                resolve();
              }
            };

            // 监听识别结束事件
            const originalOnEnd = recognition.onend;
            recognition.onend = () => {
              console.log('语音识别已完成');
              if (originalOnEnd) originalOnEnd();
              safeResolve();
            };

            // 设置超时保护（移动端给5秒，桌面端3秒）
            const isMobileChrome = /Android.*Chrome/.test(navigator.userAgent);
            const timeout = isMobileChrome ? 5000 : 3000;
            
            setTimeout(() => {
              console.log('识别等待超时，使用当前结果');
              try {
                recognition.stop();
              } catch (e) {
                console.log('停止识别时出错:', e);
              }
              safeResolve();
            }, timeout);

            // 如果已经有识别结果，可以提前结束
            if (recognizedText.trim()) {
              console.log('已有识别结果，提前结束等待');
              setTimeout(() => {
                try {
                  recognition.stop();
                } catch (e) {
                  console.log('停止识别时出错:', e);
                }
                safeResolve();
              }, 1000); // 给1秒缓冲，确保最后的结果也能收到
            }
          });
        }

        // 现在处理录制的音频（此时recognizedText应该已经有值了）
        await handleRecordedAudio(audioBlob);

        // 清理资源
        if (recordingStream) {
          recordingStream.getTracks().forEach(track => track.stop());
          recordingStream = null;
        }
      };

      // 启动语音识别
      startSpeechRecognition();

      mediaRecorder.start();
      isRecording = true;
      updateRecordButtonUI(true);

      console.log('开始录音和语音识别...');
    } catch (error) {
      console.error('无法访问麦克风:', error);
      alert('无法访问麦克风，请检查浏览器权限设置');
    }
  }

  // 启动语音识别
  function startSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('浏览器不支持语音识别');
      return;
    }

    recognition = new SpeechRecognition();
    
    // 检测是否是移动端Chrome（移动端使用更稳定的设置）
    const isMobileChrome = /Android.*Chrome/.test(navigator.userAgent);
    
    if (isMobileChrome) {
      // 移动端Chrome：使用非连续模式，更稳定
      recognition.continuous = false;
      recognition.interimResults = false;
      console.log('检测到移动端Chrome，使用优化设置');
    } else {
      // 桌面端或其他浏览器：使用连续模式
      recognition.continuous = true;
      recognition.interimResults = true;
    }
    
    recognition.lang = 'zh-CN'; // 设置语言为中文

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // 更新识别文本
      if (finalTranscript) {
        recognizedText += finalTranscript;
      }

      console.log('识别中:', recognizedText + interimTranscript);
    };

    recognition.onerror = (event) => {
      console.error('语音识别错误:', event.error);
      if (event.error === 'no-speech') {
        console.log('没有检测到语音');
      } else if (event.error === 'network' || event.error === 'aborted') {
        console.log('网络问题或识别被中断');
      }
    };

    recognition.onend = () => {
      console.log('语音识别结束，当前识别文本:', recognizedText);
    };

    try {
      recognition.start();
      console.log('语音识别已启动');
    } catch (error) {
      console.error('启动语音识别失败:', error);
    }
  }

  // 停止录音
  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      isRecording = false;
      updateRecordButtonUI(false);
      console.log('停止录音');
    }
  }

  // 更新录音按钮UI
  function updateRecordButtonUI(recording) {
    const voiceRecordBtn = document.getElementById('voice-record-btn');
    if (!voiceRecordBtn) return;

    if (recording) {
      voiceRecordBtn.style.color = '#ff3b30';
      voiceRecordBtn.style.backgroundColor = '#ffe5e5';
      voiceRecordBtn.title = '停止录音';
    } else {
      voiceRecordBtn.style.color = '';
      voiceRecordBtn.style.backgroundColor = '';
      voiceRecordBtn.title = '录音';
    }
  }

  // 显示语音文字确认对话框
  function showVoiceTextConfirmDialog(recognizedText, audioBlob) {
    return new Promise((resolve) => {
      // 创建对话框
      const dialog = document.createElement('div');
      dialog.className = 'voice-text-confirm-dialog';
      dialog.innerHTML = `
        <div class="voice-text-confirm-overlay"></div>
        <div class="voice-text-confirm-content">
          <div class="voice-text-confirm-header">
            <h3>语音识别结果</h3>
            <p class="voice-text-hint">请确认或修改识别的文字后发送</p>
          </div>
          <div class="voice-text-confirm-body">
            <textarea class="voice-text-input" placeholder="未识别到语音内容，请手动输入...">${escapeHTML(recognizedText)}</textarea>
          </div>
          <div class="voice-text-confirm-footer">
            <button class="voice-text-cancel-btn">取消</button>
            <button class="voice-text-send-btn">发送</button>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      // 聚焦到文本框
      const textarea = dialog.querySelector('.voice-text-input');
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }, 100);

      // 取消按钮
      dialog.querySelector('.voice-text-cancel-btn').addEventListener('click', () => {
        document.body.removeChild(dialog);
        resolve(null);
      });

      // 发送按钮
      dialog.querySelector('.voice-text-send-btn').addEventListener('click', () => {
        const finalText = textarea.value.trim();
        document.body.removeChild(dialog);
        resolve(finalText);
      });

      // 点击遮罩层关闭
      dialog.querySelector('.voice-text-confirm-overlay').addEventListener('click', () => {
        document.body.removeChild(dialog);
        resolve(null);
      });

      // 支持Ctrl+Enter发送
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          const finalText = textarea.value.trim();
          document.body.removeChild(dialog);
          resolve(finalText);
        }
      });
    });
  }

  // 处理录制的音频
  async function handleRecordedAudio(audioBlob) {
    if (!state.activeChatId) {
      alert('请先选择一个聊天');
      return;
    }

    const chat = state.chats[state.activeChatId];
    if (!chat) return;

    // 显示确认对话框，让用户确认或修改识别的文字
    const confirmedText = await showVoiceTextConfirmDialog(recognizedText, audioBlob);

    if (confirmedText === null) {
      console.log('用户取消发送语音消息');
      return;
    }

    // 如果用户没有输入任何文字，使用默认文字
    const finalText = confirmedText || '[语音消息]';

    // 转换为base64
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Audio = reader.result;

      // 计算实际音频时长
      const actualDuration = Math.round((Date.now() - recordingStartTime) / 1000);
      const duration = Math.max(1, actualDuration);

      // 创建语音消息
      const msg = {
        role: 'user',
        type: 'voice_message',
        content: finalText, // 使用识别或用户修改后的文字
        audioData: base64Audio, // 真实音频数据
        audioMimeType: audioBlob.type,
        audioDuration: duration,
        timestamp: Date.now()
      };

      // 添加到聊天记录
      chat.history.push(msg);
      await db.chats.put(chat);

      // 渲染消息
      appendMessage(msg, chat);
      renderChatList();

      console.log('语音消息已发送，文字内容:', finalText);
    };

    reader.readAsDataURL(audioBlob);
  }

  // 在页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVoiceRecording);
  } else {
    initVoiceRecording();
  }

  // 导出到全局
  window.voiceRecording = {
    startRecording,
    stopRecording,
    isRecording: () => isRecording
  };
})();