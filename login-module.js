// ========== EPhone 登录模块 ==========
// 独立的登录系统，可被多个版本共享使用

// API验证地址
const VERIFY_API_URL = 'https://puppy-subscription-api.zeabur.app/api/verify';

// API验证函数
async function ephoneVerify(account, password) {
    if (!account || !password) {
        return { success: false, message: '请输入账号和密码' };
    }

    try {
        const res = await fetch(VERIFY_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account: account, password: password })
        });

        const data = await res.json();
        return data;
    } catch (error) {
        console.error('验证请求失败:', error);
        return { success: false, message: '网络连接失败，请检查网络后重试' };
    }
}

// 渲染登录界面
function renderLoginOverlay() {
    // 防止重复生成
    if (document.getElementById('login-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'login-overlay';
    
    // 整体背景：温暖的米白/淡粉色调
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background-color: #fff9fb; 
        z-index: 99999; 
        display: flex; flex-direction: column; 
        justify-content: center; align-items: center; 
        font-family: 'Georgia', 'Times New Roman', serif;
        overflow: hidden;
    `;

    overlay.innerHTML = `
        <style>
            /* ====================
               开场动画：天使之蛋 (点击消失)
               ==================== */
            #intro-layer {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #fff9fb;
                z-index: 10;
                display: flex;
                justify-content: center;
                align-items: center;
                cursor: pointer; /* 提示可点击 */
                transition: opacity 1s ease, visibility 1s ease;
            }

            /* 蛋的容器，用于整体浮动 */
            .egg-container {
                position: relative;
                animation: eggFloat 3s ease-in-out infinite;
                display: flex;
                justify-content: center;
                align-items: center;
            }

            /* 纯白蛋体 */
            .pure-egg {
                width: 120px;
                height: 160px;
                background: #fff;
                border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
                box-shadow: 
                    inset -10px -10px 20px rgba(255, 183, 197, 0.2), 
                    0 0 30px rgba(255, 255, 255, 0.8), 
                    0 10px 40px rgba(255, 183, 197, 0.3);
                position: relative;
                z-index: 2;
            }

            /* 蛋的光泽 */
            .pure-egg::after {
                content: '';
                position: absolute;
                top: 20px;
                left: 25px;
                width: 30px;
                height: 40px;
                background: rgba(255, 255, 255, 0.8);
                border-radius: 50%;
                transform: rotate(-20deg);
            }

            /* 小翅膀 (CSS绘制) */
            .wing {
                position: absolute;
                width: 60px;
                height: 40px;
                background: #fff;
                z-index: 1;
                top: 60px; /* 翅膀位置 */
                border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
                box-shadow: 0 0 15px rgba(255, 183, 197, 0.2);
            }
            .wing-left {
                left: -45px;
                transform-origin: right center;
                animation: wingFlapLeft 3s ease-in-out infinite;
            }
            .wing-right {
                right: -45px;
                transform-origin: left center;
                animation: wingFlapRight 3s ease-in-out infinite;
            }

            /* 点击提示文字 */
            .tap-hint {
                position: absolute;
                bottom: 20%;
                color: #ffb7c5;
                font-size: 14px;
                letter-spacing: 2px;
                opacity: 0.6;
                animation: pulse 2s infinite;
            }

            @keyframes eggFloat {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-15px); }
            }
            @keyframes wingFlapLeft {
                0%, 100% { transform: rotate(10deg); }
                50% { transform: rotate(-10deg); }
            }
            @keyframes wingFlapRight {
                0%, 100% { transform: rotate(-10deg); }
                50% { transform: rotate(10deg); }
            }
            @keyframes pulse {
                0%, 100% { opacity: 0.4; }
                50% { opacity: 0.8; }
            }

            /* ====================
               登录卡片
               ==================== */
            .sc-card {
                position: relative;
                width: 340px;
                padding: 50px 40px;
                background: #fff;
                border: 4px double #ffcdd2; 
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(255, 183, 197, 0.2);
                text-align: center;
                opacity: 0;
                transform: translateY(20px);
                transition: all 1s ease-out; /* 由JS控制显示 */
            }
            
            /* 四个角落的扑克牌花色 - 淡彩版 */
            .sc-corner {
                position: absolute;
                font-size: 24px;
                opacity: 0.6;
            }
            .sc-tl { top: 15px; left: 15px; color: #ffb7c5; } /* 红桃 */
            .sc-tr { top: 15px; right: 15px; color: #b0c4de; } /* 黑桃 */
            .sc-bl { bottom: 15px; left: 15px; color: #98fb98; } /* 梅花 */
            .sc-br { bottom: 15px; right: 15px; color: #ffe4b5; } /* 方块 */

            .sc-title {
                font-size: 26px;
                color: #8b4513;
                margin-bottom: 8px;
                font-weight: normal;
                letter-spacing: 2px;
            }
            .sc-subtitle {
                font-size: 13px;
                color: #bc8f8f;
                margin-bottom: 40px;
                font-style: italic;
                letter-spacing: 1px;
            }

            .lock-cross {
                width: 44px;
                height: 44px;
                background: #ffe4b5;
                margin: 0 auto 25px auto;
                position: relative;
                clip-path: polygon(20% 0%, 80% 0%, 100% 20%, 100% 80%, 80% 100%, 20% 100%, 0% 80%, 0% 20%);
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 10px rgba(0,0,0,0.05);
            }
            .lock-cross::after {
                content: '';
                width: 32px;
                height: 32px;
                background: #fff;
                clip-path: polygon(20% 0%, 80% 0%, 100% 20%, 100% 80%, 80% 100%, 20% 100%, 0% 80%, 0% 20%);
            }
            .lock-gem {
                position: absolute;
                width: 18px;
                height: 18px;
                background: #ffb7c5;
                border-radius: 50%;
                z-index: 2;
                box-shadow: inset 2px 2px 4px rgba(255,255,255,0.8);
            }

            .sc-input {
                width: 100%;
                padding: 14px;
                margin-bottom: 18px;
                border: 1px solid #ffe4e1;
                background: #fffbfb; 
                color: #8b4513;
                border-radius: 12px;
                font-family: inherit;
                font-size: 14px;
                box-sizing: border-box;
                outline: none;
                transition: all 0.3s;
                text-align: center;
            }
            .sc-input:focus {
                border-color: #ffb7c5;
                background: #fff;
                box-shadow: 0 0 10px rgba(255, 183, 197, 0.1);
            }
            .sc-input::placeholder {
                color: #d8bfd8;
                font-size: 13px;
            }

            .sc-btn {
                width: 100%;
                padding: 14px;
                background: #ffb7c5;
                color: #fff;
                border: none;
                border-radius: 12px;
                font-family: inherit;
                font-size: 15px;
                cursor: pointer;
                margin-top: 10px;
                transition: background 0.3s, transform 0.2s;
                letter-spacing: 1px;
            }
            .sc-btn:hover {
                background: #ff9eb0;
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(255, 183, 197, 0.4);
            }
            .sc-btn:disabled {
                background: #eee;
                color: #999;
                cursor: not-allowed;
            }

        </style>

        <!-- 开场动画层 (点击触发) -->
        <div id="intro-layer">
            <div class="egg-container">
                <div class="wing wing-left"></div>
                <div class="pure-egg"></div>
                <div class="wing wing-right"></div>
            </div>
            <div class="tap-hint">Tap to Unlock</div>
        </div>

        <!-- 登录卡片 -->
        <div class="sc-card" id="login-card">
            <!-- 四个角落装饰 -->
            <div class="sc-corner sc-tl">♥</div>
            <div class="sc-corner sc-tr">♠</div>
            <div class="sc-corner sc-bl">♣</div>
            <div class="sc-corner sc-br">♦</div>

            <!-- Humpty Lock -->
            <div class="lock-cross">
                <div class="lock-gem"></div>
            </div>

            <div class="sc-title">Unlock</div>
            <div class="sc-subtitle">My True Self</div>

            <input type="text" id="ephone-account" class="sc-input" placeholder="Account Name">
            <input type="password" id="ephone-password" class="sc-input" placeholder="Secret Key">
            
            <button id="ephone-login-btn" class="sc-btn">
                Open Heart
            </button>

            <div style="margin-top: 15px; font-size: 12px; color: #bc8f8f;">
                报错和不知道怎么获取的看 <a href="https://discord.com/channels/1379304008157499423/1417316084465270854/1463764186139197563" target="_blank" style="color: #ffb7c5; text-decoration: underline; cursor: pointer;">DC</a>
            </div>

            <p id="login-msg" style="margin-top: 20px; font-size: 12px; min-height: 20px; color: #ff9eb0;"></p>
        </div>
    `;

    document.body.prepend(overlay);

    // 绑定事件
    document.getElementById('ephone-login-btn').onclick = tryLogin;
    document.getElementById('ephone-password').onkeypress = function(e) {
        if (e.key === 'Enter') tryLogin();
    };

    // 点击开场层 -> 孵化(消失)并显示登录卡片
    const introLayer = document.getElementById('intro-layer');
    const loginCard = document.getElementById('login-card');
    
    introLayer.onclick = function() {
        introLayer.style.opacity = '0';
        introLayer.style.visibility = 'hidden';
        
        // 显示卡片
        loginCard.style.opacity = '1';
        loginCard.style.transform = 'translateY(0)';
    };
}

// 验证与启动函数
async function tryLogin() {
    const accountEl = document.getElementById('ephone-account');
    const passwordEl = document.getElementById('ephone-password');
    const msgEl = document.getElementById('login-msg');
    const btn = document.getElementById('ephone-login-btn');

    // 安全检查
    if (!accountEl || !passwordEl) {
        console.error("找不到登录输入框，请刷新页面");
        return;
    }

    const account = accountEl.value.trim();
    const password = passwordEl.value.trim();

    if (!account || !password) {
        msgEl.style.color = "#ff453a";
        msgEl.textContent = "请输入账号和密码";
        return;
    }

    // 显示验证中状态
    btn.disabled = true;
    btn.textContent = "验证中...";
    msgEl.style.color = "#ffd60a";
    msgEl.textContent = "正在验证，请稍候...";

    // 调用API验证
    const result = await ephoneVerify(account, password);

    if (result.success) {
        msgEl.style.color = "#32d74b";
        msgEl.textContent = "验证成功，正在进入...";

        try {
            // 保存登录状态
            localStorage.setItem('ephone_auth', 'true');
            localStorage.setItem('ephone_account', account);

            // 初始化数据库（需要主程序提供此函数）
            if (typeof initDatabase === 'function') {
                initDatabase(account);
            }
            
            // 移除遮罩
            const overlay = document.getElementById('login-overlay');
            if (overlay) {
                overlay.style.transition = 'opacity 0.5s ease';
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 500);
            }
            
            // 启动 App（需要主程序提供此函数）
            if (typeof init === 'function') {
                init();
            }
            
        } catch (e) {
            console.error(e);
            msgEl.style.color = "#ff453a";
            msgEl.textContent = "初始化失败，请重试";
            btn.disabled = false;
            btn.textContent = "验 证";
        }
    } else {
        msgEl.style.color = "#ff453a";
        msgEl.textContent = result.message || "验证失败，请检查账号密码";
        btn.style.background = "#ff453a";
        setTimeout(() => {
            btn.style.background = "#007aff";
            btn.disabled = false;
            btn.textContent = "验 证";
        }, 1000);
    }
}

// 初始化登录系统（自动执行）
function initLoginSystem() {
    // 检查本地是否已登录
    const isAuthenticated = localStorage.getItem('ephone_auth');
    const savedAccount = localStorage.getItem('ephone_account');

    if (isAuthenticated === 'true' && savedAccount) {
        console.log(`[Auto Login] 检测到已登录账号: ${savedAccount}`);
        try {
            // 已登录：直接初始化数据库并启动，不显示登录框
            if (typeof initDatabase === 'function') {
                initDatabase(savedAccount);
            }
            if (typeof init === 'function') {
                init();
            }
        } catch (e) {
            console.error("自动登录出错，重置状态:", e);
            localStorage.removeItem('ephone_auth');
            localStorage.removeItem('ephone_account');
            renderLoginOverlay();
        }
    } else {
        // 未登录：显示登录框
        renderLoginOverlay();
    }
}

// 绑定退出登录按钮
function bindLogoutButton() {
    setTimeout(() => {
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            // 移除旧的监听器防止重复
            const newBtn = logoutBtn.cloneNode(true);
            logoutBtn.parentNode.replaceChild(newBtn, logoutBtn);
            
            newBtn.addEventListener('click', async () => {
                // 使用原生的 confirm
                if (confirm("确定要退出登录吗？")) {
                    localStorage.removeItem('ephone_auth');
                    localStorage.removeItem('ephone_account');
                    window.location.reload();
                }
            });
        }
    }, 1000);
}

// 导出API供主程序使用
window.EPhoneLoginModule = {
    initLoginSystem,
    bindLogoutButton,
    renderLoginOverlay,
    tryLogin,
    ephoneVerify
};
