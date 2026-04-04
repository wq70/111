// ============================================================
// gomoku.js
// 来源：script.js 第 34115~34508 行（DOMContentLoaded 内部）
// 功能：五子棋 —— toggleGomokuBoard、initGomokuGame、renderGomokuBoard、
//       handleBoardClick、handleBoardHover、checkWin、
//       formatGomokuStateForAI、handleAiGomokuMove、addGameEndSystemMessage
// ============================================================

(function () {
  // state 通过全局作用域访问（window.state，由 init-and-state.js 初始化）

  let gomokuState = {};

  // ========== 来源：script.js 第 34115~34508 行 ==========

  async function toggleGomokuBoard() {
    if (!state.activeChatId) return;
    const chatId = state.activeChatId;
    const overlay = document.getElementById('gomoku-overlay');


    if (!overlay.classList.contains('visible')) {
      const header = document.querySelector('#chat-interface-screen > .header');

      overlay.style.top = `${header.offsetHeight}px`;
      overlay.style.display = 'block';

      if (!gomokuState[chatId] || !gomokuState[chatId].isActive) {
        initGomokuGame(chatId);
      }
      renderGomokuBoard(chatId);


      setTimeout(async () => {
        overlay.classList.add('visible');

        const startMessage = {
          role: 'system',
          content: '[系统提示：用户打开了五子棋棋盘，游戏开始了。]',
          timestamp: Date.now(),
          isHidden: true
        };
        state.chats[chatId].history.push(startMessage);
        await db.chats.put(state.chats[chatId]);
      }, 10);

    } else {

      await closeGomokuBoard();
    }
  }

  async function closeGomokuBoard() {
    if (!state.activeChatId) return;
    const chatId = state.activeChatId;
    const overlay = document.getElementById('gomoku-overlay');

    overlay.classList.remove('visible');



    setTimeout(() => {
      overlay.style.display = 'none';
    }, 300);

    if (gomokuState[chatId]) {
      gomokuState[chatId].isActive = false;

      const endMessage = {
        role: 'system',
        content: '[系统提示：用户关闭了五子棋棋盘，游戏结束了。]',
        timestamp: Date.now(),
        isHidden: true
      };
      state.chats[chatId].history.push(endMessage);
      await db.chats.put(state.chats[chatId]);
    }
  }


  function initGomokuGame(chatId) {
    const canvas = document.getElementById('gomoku-board');
    const overlay = document.getElementById('gomoku-overlay');
    const controls = document.getElementById('gomoku-controls');


    const availableWidth = overlay.offsetWidth - 40;
    const availableHeight = overlay.offsetHeight - controls.offsetHeight - 40;
    const boardSize = Math.floor(Math.min(availableWidth, availableHeight));

    const GRID_SIZE = 15;

    const cell_size = Math.floor(boardSize / GRID_SIZE);
    const final_size = cell_size * GRID_SIZE;

    canvas.width = final_size;
    canvas.height = final_size;

    gomokuState[chatId] = {
      isActive: true,
      board: Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0)),
      currentPlayer: 1,
      history: [],
      isGameOver: false,
      GRID_SIZE: GRID_SIZE,
      CELL_SIZE: cell_size
    };
  }

  function renderGomokuBoard(chatId) {
    const gameState = gomokuState[chatId];
    if (!gameState) return;

    const canvas = document.getElementById('gomoku-board');
    const ctx = canvas.getContext('2d');
    const {
      GRID_SIZE,
      CELL_SIZE
    } = gameState;
    const padding = CELL_SIZE / 2;


    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e4b591';
    ctx.fillRect(0, 0, canvas.width, canvas.height);


    ctx.strokeStyle = '#5b3a29';
    ctx.lineWidth = 1;
    for (let i = 0; i < GRID_SIZE; i++) {

      ctx.beginPath();
      ctx.moveTo(padding, padding + i * CELL_SIZE);
      ctx.lineTo(canvas.width - padding, padding + i * CELL_SIZE);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(padding + i * CELL_SIZE, padding);
      ctx.lineTo(padding + i * CELL_SIZE, canvas.height - padding);
      ctx.stroke();
    }


    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (gameState.board[y][x] !== 0) {
          drawStone(ctx, x, y, gameState.board[y][x], gameState);
        }
      }
    }
  }


  function drawStone(ctx, x, y, player, gameState) {
    const {
      CELL_SIZE
    } = gameState;
    const padding = CELL_SIZE / 2;
    const radius = CELL_SIZE / 2 - 2;

    ctx.beginPath();
    ctx.arc(padding + x * CELL_SIZE, padding + y * CELL_SIZE, radius, 0, 2 * Math.PI);

    if (player === 1) {
      ctx.fillStyle = 'black';
    } else {
      ctx.fillStyle = 'white';
    }
    ctx.fill();
  }


  function handleBoardHover(e) {
    const chatId = state.activeChatId;
    const gameState = gomokuState[chatId];
    if (!gameState || gameState.isGameOver || gameState.currentPlayer !== 1) return;

    const canvas = document.getElementById('gomoku-board');
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const gridX = Math.round((x - gameState.CELL_SIZE / 2) / gameState.CELL_SIZE);
    const gridY = Math.round((y - gameState.CELL_SIZE / 2) / gameState.CELL_SIZE);

    renderGomokuBoard(chatId);

    if (gridX >= 0 && gridX < gameState.GRID_SIZE && gridY >= 0 && gridY < gameState.GRID_SIZE && gameState.board[gridY][gridX] === 0) {
      const radius = gameState.CELL_SIZE / 2 - 2;
      ctx.beginPath();
      ctx.arc(gameState.CELL_SIZE / 2 + gridX * gameState.CELL_SIZE, gameState.CELL_SIZE / 2 + gridY * gameState.CELL_SIZE, radius, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fill();
    }
  }

  function handleBoardClick(e) {
    const chatId = state.activeChatId;
    const gameState = gomokuState[chatId];
    if (!gameState || gameState.isGameOver || gameState.currentPlayer !== 1) return;

    const canvas = document.getElementById('gomoku-board');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const gridX = Math.round((x - gameState.CELL_SIZE / 2) / gameState.CELL_SIZE);
    const gridY = Math.round((y - gameState.CELL_SIZE / 2) / gameState.CELL_SIZE);

    if (gridX >= 0 && gridX < gameState.GRID_SIZE && gridY >= 0 && gridY < gameState.GRID_SIZE && gameState.board[gridY][gridX] === 0) {

      gameState.board[gridY][gridX] = 1;
      gameState.history.push({
        x: gridX,
        y: gridY,
        player: 1
      });
      renderGomokuBoard(chatId);


      if (checkWin(gridX, gridY, 1, gameState)) {
        gameState.isGameOver = true;
        setTimeout(() => alert("恭喜你，你赢了！"), 100);

        addGameEndSystemMessage('user');


      } else {
        gameState.currentPlayer = 2;

      }
    }
  }


  function handleAiGomokuMove(move, isForcedMove = false) {
    const chatId = state.activeChatId;
    const gameState = gomokuState[chatId];


    if (!gameState || gameState.isGameOver) return;
    if (!isForcedMove && gameState.currentPlayer !== 2) return;

    const {
      x,
      y
    } = move;

    if (x >= 0 && x < gameState.GRID_SIZE && y >= 0 && y < gameState.GRID_SIZE && gameState.board[y][x] === 0) {
      gameState.board[y][x] = 2;
      gameState.history.push({
        x,
        y,
        player: 2
      });
      renderGomokuBoard(chatId);

      if (checkWin(x, y, 2, gameState)) {
        gameState.isGameOver = true;
        setTimeout(() => alert("AI 获胜了！"), 100);
        addGameEndSystemMessage('ai');
      } else {
        gameState.currentPlayer = 1;
      }
    } else {
      console.warn("AI 的下棋指令无效或位置已被占据:", move);

      gameState.currentPlayer = 1;
    }
  }


  function checkWin(x, y, player, gameState) {
    const {
      board,
      GRID_SIZE
    } = gameState;
    const directions = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1]
    ];
    for (const [dx, dy] of directions) {
      let count = 1;

      for (let i = 1; i < 5; i++) {
        const newX = x + i * dx;
        const newY = y + i * dy;
        if (newX >= 0 && newX < GRID_SIZE && newY >= 0 && newY < GRID_SIZE && board[newY][newX] === player) {
          count++;
        } else {
          break;
        }
      }

      for (let i = 1; i < 5; i++) {
        const newX = x - i * dx;
        const newY = y - i * dy;
        if (newX >= 0 && newX < GRID_SIZE && newY >= 0 && newY < GRID_SIZE && board[newY][newX] === player) {
          count++;
        } else {
          break;
        }
      }
      if (count >= 5) return true;
    }
    return false;
  }



  function formatGomokuStateForAI(gameState) {
    if (!gameState || !gameState.isActive) return "";

    let boardString = "棋盘状态 (1是你(黑棋), 2是AI(白棋)):\n";
    boardString += gameState.board.map(row => row.join(' ')).join('\n');

    let historyString = "下棋历史 (x,y坐标均从0开始):\n";
    historyString += gameState.history.map(move => `玩家${move.player}下在(${move.x},${move.y})`).join(' -> ');

    return `
# 当前五子棋局势
${boardString}

# ${historyString}

# 【【【五子棋核心规则与强制思考步骤 (最高优先级指令！)】】】

### **【【【落子铁律 (绝对禁止！)】】】**
你【绝对不能】选择一个棋盘上已经是 1 或 2 的坐标。你的落子点【必须】是 0。
---

### **第一步：逻辑分析 (内部思考，不要输出)**

1.  **【规则定义】**: 
    -   棋子: 1代表用户(黑棋)，2代表你(白棋)。
    -   获胜条件: 横、竖、斜线上有【连续五个】自己的棋子。

2.  **【防守分析 (必须执行)】**:
    -   **检查用户(1)是否有"四子连线"的威胁？** 如果有，我必须下在哪个坐标才能堵住？
    -   **检查用户(1)是否有"活三"的威胁？** 如果有，最佳的防守点是哪里？

3.  **【进攻分析 (必须执行)】**:
    -   **检查我(2)是否有"一步胜利"的机会？** (即已有四子连线) 如果有，我应该下在哪里？
    -   **检查我(2)是否有制造"活四"或"双三"的机会？** 如果有，最佳的进攻点是哪里？

### **第二步：决策与扮演 (内部思考，不要输出)**

1.  **【决策】**: 综合以上攻防分析，我的最佳棋步是落在坐标 (x, y)。

2.  **【融入角色扮演】**:
    -   我的性格是：(在此处回顾你的人设)。
    -   根据我的性格，我应该：
        a) **(聪明/好胜型)** 下在刚刚分析出的最佳位置。
        b) **(迷糊/放水型)** 故意选择一个次优的位置，但【前提是不能让用户立刻获胜】。
        c) **(其他性格)** 根据性格特点，选择一个合理的棋步。

3.  **【构思台词】**: 根据我选择的棋步和我的性格，我应该说一句什么样的台词来评论棋局？

---
### **第三步：生成最终回复 (你的唯一输出)**

现在，根据你第二步的最终决策，生成你的行动。
-   你的回复【必须且只能】是一个JSON数组。
-   **绝对不要**在最终回复中包含任何上述的思考过程。
-   格式: \`[{"type": "gomoku_move", "name": "你的角色本名", "x": (0-14), "y": (0-14)}, {"type": "text", "content": "你的台词..."}]\`
`;
  }

  async function addGameEndSystemMessage(winner) {
    const chatId = state.activeChatId;
    const chat = state.chats[chatId];
    if (!chat) return;



    const userDisplayName = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
    const aiDisplayName = chat.isGroup ? 'AI方' : chat.name;
    const winnerName = (winner === 'user') ? userDisplayName : aiDisplayName;
    const resultText = (winner === 'user') ? '你输了' : '你赢了';


    const systemContent = `[系统提示：五子棋游戏已结束。最终结果是：${winnerName} 获胜。也就是说，${resultText}。]`;


    const hiddenMessage = {
      role: 'system',
      content: systemContent,
      timestamp: Date.now(),
      isHidden: true
    };

    chat.history.push(hiddenMessage);
    await db.chats.put(chat);


    console.log(`游戏结束的系统提示已添加到历史记录中，等待AI下次查看。胜者: ${winner}`);
  }

  // ========== 全局暴露 ==========

  window.toggleGomokuBoard = toggleGomokuBoard;
  window.closeGomokuBoard = closeGomokuBoard;
  window.initGomokuGame = initGomokuGame;
  window.renderGomokuBoard = renderGomokuBoard;
  window.handleBoardClick = handleBoardClick;
  window.handleBoardHover = handleBoardHover;
  window.handleAiGomokuMove = handleAiGomokuMove;
  window.checkWin = checkWin;
  window.formatGomokuStateForAI = formatGomokuStateForAI;
  window.gomokuState = gomokuState;

})();
