// DOM Elements
const titleScreen = document.getElementById("titleScreen");
const gameScreen = document.getElementById("gameScreen");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const gameInfo = document.getElementById("gameInfo");
const controls = document.getElementById("controls");
const nicknameInput = document.getElementById("nicknameInput");
const startButton = document.getElementById("startButton");

// Load sprite images
const idleSprite = document.getElementById("idleSprite");
const runSprite = document.getElementById("runSprite");
const kickSprite = document.getElementById("kickSprite");

// Sprite dimensions
const BASE_WIDTH = 16;
const IDLE_FRAME_WIDTH = 16;
const IDLE_FRAME_HEIGHT = 32;
const RUN_FRAME_WIDTH = 16;
const RUN_FRAME_HEIGHT = 32;
const KICK_WIDTH = 24;
const KICK_HEIGHT = 32;

// Game state
let playerId = null;
let roomId = null;
let players = {};
let gameState = "waiting";
let roundWinner = null;
let nickname = "";
let ws = null;

// Colors for player tinting (blue and orange)
const PLAYER_COLORS = ["#f47521", "#4a9fff"];

// Initialize game
function init() {
  // Add event listener to start button
  startButton.addEventListener("click", startGame);

  // Focus on nickname input
  nicknameInput.focus();

  // Allow Enter key to start game
  nicknameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      startGame();
    }
  });
}

// Start game and connect to server
function startGame() {
  console.log("starting game");
  nickname = nicknameInput.value.trim();
  if (nickname.length === 0) {
    nickname = "Player" + Math.floor(Math.random() * 1000);
  }

  // Show game screen, hide title screen
  titleScreen.style.display = "none";
  gameScreen.classList.remove("hidden");
  canvas.style.display = "block";
  controls.style.display = "block";

  // Connect to WebSocket server
  connectToServer();
}

function connectToServer() {
  // Connect to WebSocket server
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => {
    console.log("Connected to server");

    // Send join message with nickname
    ws.send(
      JSON.stringify({
        type: "join",
        nickname: nickname,
      }),
    );
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case "init":
        playerId = data.playerId;
        roomId = data.roomId;
        break;

      case "gameState":
        players = data.players;
        gameState = data.gameState;
        roundWinner = data.roundWinner;

        if (gameState === "waiting") {
          gameInfo.textContent = "Waiting for opponent...";
        } else if (gameState === "playing") {
          // Show nicknames and scores
          const playerInfos = Object.values(players)
            .map((p) => `${p.nickname}: ${p.score}`)
            .join(" vs ");
          gameInfo.textContent = playerInfos;
        } else if (gameState === "round_end") {
          const winner = Object.values(players).find(
            (p) => p.id === roundWinner,
          );
          gameInfo.textContent = `${winner.nickname} wins the round!`;
        }
        break;

      case "playerLeft":
        gameInfo.textContent =
          "Opponent left the game. Waiting for new opponent...";
        gameState = "waiting";
        break;
    }
  };

  ws.onclose = () => {
    gameInfo.textContent = "Connection lost. Please refresh the page.";
  };

  // Handle keyboard input
  document.addEventListener("keydown", (event) => {
    if (!playerId || gameState !== "playing") return;
    if (event.code === "Space") {
      ws.send(
        JSON.stringify({
          type: "action",
          action: "jump",
        }),
      );
    }
  });

  document.addEventListener("keyup", (event) => {
    if (!playerId || gameState !== "playing") return;
    if (event.code === "Space") {
      ws.send(
        JSON.stringify({
          type: "action",
          action: "dive",
        }),
      );
    }
  });

  // Handle mouse/touch input
  canvas.addEventListener("mousedown", (event) => {
    if (!playerId || gameState !== "playing") return;

    ws.send(
      JSON.stringify({
        type: "action",
        action: "jump",
      }),
    );
  });

  canvas.addEventListener("mouseup", (event) => {
    if (!playerId || gameState !== "playing") return;

    ws.send(
      JSON.stringify({
        type: "action",
        action: "dive",
      }),
    );
  });

  // Touch events for mobile
  canvas.addEventListener("touchstart", (event) => {
    if (!playerId || gameState !== "playing") return;
    event.preventDefault(); // Prevent scrolling

    ws.send(
      JSON.stringify({
        type: "action",
        action: "jump",
      }),
    );
  });

  canvas.addEventListener("touchend", (event) => {
    if (!playerId || gameState !== "playing") return;
    event.preventDefault(); // Prevent scrolling

    ws.send(
      JSON.stringify({
        type: "action",
        action: "dive",
      }),
    );
  });
}

function drawPlayer(player, playerIndex) {
  ctx.save();

  // Handle facing direction
  if (!player.facingRight) {
    ctx.translate(player.x + player.width, 0);
    ctx.scale(-1, 1);
    ctx.translate(-player.x, 0);
  }
  ctx.translate(0, -20);

  // Apply a color tint
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = PLAYER_COLORS[playerIndex];
  ctx.fillRect(player.x, player.y, player.width, player.height);
  ctx.globalAlpha = 1.0;

  if (player.isDiving) {
    const scaleX = KICK_WIDTH / BASE_WIDTH;
    ctx.drawImage(
      kickSprite,
      0,
      0,
      KICK_WIDTH,
      KICK_HEIGHT,
      player.x - 50,
      player.y,
      player.width * scaleX,
      player.height,
    );
  } else if (player.isJumping) {
    // Draw jumping sprite (second frame of run)
    ctx.drawImage(
      runSprite,
      RUN_FRAME_WIDTH * 1,
      0,
      RUN_FRAME_WIDTH,
      RUN_FRAME_HEIGHT,
      player.x,
      player.y,
      player.width,
      player.height,
    );
  } else {
    // Draw idle animation
    ctx.drawImage(
      idleSprite,
      IDLE_FRAME_WIDTH * player.animFrame,
      0,
      IDLE_FRAME_WIDTH,
      IDLE_FRAME_HEIGHT,
      player.x,
      player.y,
      player.width,
      player.height,
    );
  }

  // Draw nickname above player
  ctx.restore();
  ctx.fillStyle = PLAYER_COLORS[playerIndex];
  ctx.font = "12px 'Press Start 2P'";
  ctx.textAlign = "center";
  ctx.fillText(player.nickname, player.x + player.width / 2, player.y - 30);
}

// Render game
// Render game
function render() {
  // Only render if game screen is active
  if (gameScreen.classList.contains("hidden")) {
    requestAnimationFrame(render);
    return;
  }

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw skyline background
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#1a2b47"); // Dark blue at top
  gradient.addColorStop(0.5, "#2a4070"); // Medium blue in middle
  gradient.addColorStop(1, "#4a6090"); // Lighter blue at bottom
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw distant mountains/city skyline
  ctx.fillStyle = "#101830";
  // Draw several mountain/building shapes with fixed heights
  const mountainHeights = [100, 120, 90, 110, 105];
  for (let i = 0; i < 5; i++) {
    const width = canvas.width / 3;
    const height = 80 + mountainHeights[i % mountainHeights.length];
    const x = i * (canvas.width / 4);

    // Draw a building or mountain shape
    ctx.beginPath();
    ctx.moveTo(x, canvas.height - height);
    ctx.lineTo(x + width / 4, canvas.height - height - 20);
    ctx.lineTo(x + width / 2, canvas.height - height);
    ctx.lineTo(x + (3 * width) / 4, canvas.height - height - 15);
    ctx.lineTo(x + width, canvas.height - height);
    ctx.lineTo(x + width, canvas.height);
    ctx.lineTo(x, canvas.height);
    ctx.fill();
  }

  // Add stars with fixed positions
  ctx.fillStyle = "#ffffff";
  const starPositions = [
    { x: 50, y: 30, size: 1.5, alpha: 0.8 },
    { x: 120, y: 50, size: 1.0, alpha: 0.6 },
    { x: 200, y: 20, size: 2.0, alpha: 0.9 },
    { x: 280, y: 60, size: 1.2, alpha: 0.7 },
    { x: 350, y: 40, size: 1.8, alpha: 0.8 },
    { x: 400, y: 70, size: 1.0, alpha: 0.5 },
    { x: 450, y: 25, size: 1.3, alpha: 0.6 },
    { x: 500, y: 55, size: 1.7, alpha: 0.9 },
    { x: 550, y: 35, size: 1.1, alpha: 0.7 },
    { x: 600, y: 15, size: 1.4, alpha: 0.8 },
    { x: 75, y: 80, size: 1.2, alpha: 0.6 },
    { x: 150, y: 100, size: 1.6, alpha: 0.7 },
    { x: 230, y: 120, size: 1.3, alpha: 0.8 },
    { x: 320, y: 90, size: 1.8, alpha: 0.9 },
    { x: 380, y: 110, size: 1.1, alpha: 0.6 },
    { x: 430, y: 85, size: 1.5, alpha: 0.7 },
    { x: 490, y: 130, size: 1.9, alpha: 0.8 },
    { x: 540, y: 75, size: 1.2, alpha: 0.5 },
    { x: 590, y: 95, size: 1.4, alpha: 0.7 },
    { x: 640, y: 65, size: 1.7, alpha: 0.8 },
    { x: 40, y: 140, size: 1.3, alpha: 0.6 },
    { x: 100, y: 160, size: 1.6, alpha: 0.7 },
    { x: 180, y: 130, size: 1.1, alpha: 0.5 },
    { x: 250, y: 150, size: 1.5, alpha: 0.8 },
    { x: 310, y: 170, size: 1.8, alpha: 0.9 },
    { x: 370, y: 145, size: 1.2, alpha: 0.6 },
    { x: 420, y: 165, size: 1.4, alpha: 0.7 },
    { x: 480, y: 135, size: 1.9, alpha: 0.8 },
    { x: 530, y: 155, size: 1.3, alpha: 0.6 },
    { x: 580, y: 175, size: 1.6, alpha: 0.7 },
    { x: 630, y: 125, size: 1.1, alpha: 0.5 },
    { x: 90, y: 200, size: 1.7, alpha: 0.8 },
    { x: 160, y: 180, size: 1.4, alpha: 0.7 },
    { x: 220, y: 210, size: 1.2, alpha: 0.6 },
    { x: 290, y: 190, size: 1.8, alpha: 0.9 },
    { x: 360, y: 220, size: 1.5, alpha: 0.8 },
    { x: 410, y: 200, size: 1.1, alpha: 0.5 },
    { x: 470, y: 230, size: 1.3, alpha: 0.6 },
    { x: 520, y: 240, size: 1.6, alpha: 0.7 },
    { x: 570, y: 210, size: 1.2, alpha: 0.6 },
    { x: 620, y: 230, size: 1.4, alpha: 0.7 },
  ];

  for (let i = 0; i < 50 && i < starPositions.length; i++) {
    const star = starPositions[i];
    ctx.globalAlpha = star.alpha;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
  ctx.globalAlpha = 1.0;

  // Draw mid-ground elements (clouds)
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  const cloudData = [
    { width: 150, height: 25, yOffset: 30 },
    { width: 130, height: 20, yOffset: 60 },
    { width: 170, height: 30, yOffset: 90 },
  ];

  for (let i = 0; i < 3; i++) {
    const x =
      (((i * canvas.width) / 3 +
        (((Date.now() / 10000) * canvas.width) % canvas.width)) %
        (canvas.width * 1.5)) -
      100;
    const y = 50 + cloudData[i].yOffset;
    const width = cloudData[i].width;
    const height = cloudData[i].height;

    // Draw cloud
    ctx.beginPath();
    ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw floor with perspective (arena platform)
  const floorHeight = 40;
  const floorY = canvas.height - floorHeight;

  // Main floor
  const floorGradient = ctx.createLinearGradient(0, floorY, 0, canvas.height);
  floorGradient.addColorStop(0, "#f47521"); // Orange at top of floor
  floorGradient.addColorStop(1, "#d35400"); // Darker orange at bottom
  ctx.fillStyle = floorGradient;
  ctx.fillRect(0, floorY, canvas.width, floorHeight);

  // Add grid lines to floor
  ctx.strokeStyle = "#0a1c35";
  ctx.lineWidth = 1;

  // Horizontal grid lines
  for (let y = floorY; y <= canvas.height; y += 10) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Vertical grid lines with perspective effect
  for (let i = 0; i <= 20; i++) {
    const perspectiveSpacing = i * (canvas.width / 20);
    ctx.beginPath();
    ctx.moveTo(perspectiveSpacing, floorY);
    ctx.lineTo(perspectiveSpacing, canvas.height);
    ctx.stroke();
  }

  // Add floor highlights
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(0, floorY, canvas.width, 2);

  // Draw players
  if (players && Object.keys(players).length > 0) {
    Object.values(players).forEach((player, index) => {
      drawPlayer(player, index);
    });
  }

  // Add foreground elements - maybe some side elements
  ctx.fillStyle = "#0a1c35";
  const pillarWidth = 30;
  ctx.fillRect(0, 0, pillarWidth, canvas.height);
  ctx.fillRect(canvas.width - pillarWidth, 0, pillarWidth, canvas.height);

  requestAnimationFrame(render);
}

init();
render();
