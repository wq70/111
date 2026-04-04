// ==================== EPhone 验证系统 ====================
(function() {
  'use strict';

  const AUTH_KEY = 'ephone_auth';
  const introScreen = document.getElementById('intro-screen');
  const authScreen = document.getElementById('ephone-auth-screen');
  const phoneScreen = document.getElementById('phone-screen');
  const accountInput = document.getElementById('ephone-account');
  const passwordInput = document.getElementById('ephone-password');
  const loginBtn = document.getElementById('ephone-login-btn');
  const errorDiv = document.getElementById('ephone-auth-error');

  // 验证函数
  async function ephoneVerify() {
    const account = accountInput.value.trim();
    const password = passwordInput.value.trim();

    // 清除之前的错误信息
    errorDiv.textContent = '';

    if (!account || !password) {
      errorDiv.textContent = 'Please enter account and password';
      return;
    }

    // 禁用按钮，防止重复提交
    loginBtn.disabled = true;
    loginBtn.textContent = 'Unlocking...';

    try {
      const res = await fetch('https://puppy-subscription-api.zeabur.app/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: account, password: password })
      });

      const data = await res.json();

      if (data.success) {
        // 验证成功
        localStorage.setItem(AUTH_KEY, 'true');
        errorDiv.style.color = '#27ae60';
        errorDiv.textContent = 'Unlocked!';
        
        // 添加淡出动画
        authScreen.classList.add('fade-out');
        
        // 等待动画完成后隐藏验证界面
        setTimeout(() => {
          authScreen.classList.add('hidden');
          phoneScreen.style.display = 'block';
        }, 500);
      } else {
        // 验证失败
        errorDiv.style.color = '#ff6b81';
        errorDiv.textContent = 'Failed: ' + (data.message || 'Wrong Account or Password');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Unlock!';
      }
    } catch (error) {
      console.error('验证请求失败:', error);
      errorDiv.style.color = '#ff6b81';
      errorDiv.textContent = 'Network Error';
      loginBtn.disabled = false;
      loginBtn.textContent = 'Unlock!';
    }
  }

  // 检查验证状态
  function checkAuthStatus() {
    const isAuthenticated = localStorage.getItem(AUTH_KEY) === 'true';
    
    if (isAuthenticated) {
      // 已验证，隐藏所有验证相关界面
      introScreen.style.display = 'none';
      authScreen.classList.add('hidden');
      phoneScreen.style.display = 'block';
    } else {
      // 未验证，显示开场动画，隐藏主界面
      introScreen.classList.remove('hidden');
      authScreen.classList.add('hidden');
      phoneScreen.style.display = 'none';
      
      // 绑定开场动画点击事件
      introScreen.addEventListener('click', () => {
        introScreen.classList.add('hidden');
        setTimeout(() => {
            introScreen.style.display = 'none';
            authScreen.classList.remove('hidden');
        }, 500);
      });
    }
  }

  // 绑定事件
  loginBtn.addEventListener('click', ephoneVerify);

  // 支持回车键提交
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      ephoneVerify();
    }
  });

  accountInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      passwordInput.focus();
    }
  });

  // 页面加载时检查验证状态
  checkAuthStatus();

  // 可选：添加退出登录功能（可以在设置中调用）
  window.ephoneLogout = function() {
    localStorage.removeItem(AUTH_KEY);
    location.reload();
  };

  console.log('EPhone 验证系统已初始化');
})();
