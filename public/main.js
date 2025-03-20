const ELEMENTS = {
  titleScreen: document.getElementById("titleScreen"),
  gameScreen: document.getElementById("gameScreen"),
  canvas: document.getElementById("gameCanvas"),
  gameInfo: document.getElementById("gameInfo"),
  controls: document.getElementById("controls"),
  nicknameInput: document.getElementById("nicknameInput"),
  startButton: document.getElementById("startButton"),
  startMessage: document.getElementById("kickIt"),
  countdown: document.getElementById("countdown"),
};

const CTX = ELEMENTS.canvas.getContext("2d");

// Sprite assets
const SPRITES = {
  idle: document.getElementById("idleSprite"),
  run: document.getElementById("runSprite"),
  kick: document.getElementById("kickSprite"),
};

// Constants
const SPRITE_DIMENSIONS = {
  baseWidth: 16,
  idle: { width: 16, height: 32 },
  run: { width: 16, height: 32 },
  kick: { width: 24, height: 32 },
};

const PLAYER_COLORS = ["#f47521", "#4a9fff"]; // Orange and blue

// Game state
class GameState {
  constructor() {
    this.playerId = null;
    this.roomId = null;
    this.players = {};
    this.playerRenderPositions = [];
    this.state = "waiting";
    this.roundWinner = null;
    this.nickname = "";
    this.ws = null;
  }
}

let game = new GameState();

// Main functions
function init() {
  ELEMENTS.startButton.addEventListener("click", start_game);
  ELEMENTS.nicknameInput.focus();
  ELEMENTS.nicknameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      start_game();
    }
  });
}

function start_game() {
  game.nickname = ELEMENTS.nicknameInput.value.trim();
  if (game.nickname.length === 0) {
    game.nickname = `Player${Math.floor(Math.random() * 1000)}`;
  }

  // Show game screen, hide title screen
  ELEMENTS.titleScreen.style.display = "none";
  ELEMENTS.gameScreen.classList.remove("hidden");
  ELEMENTS.canvas.style.display = "block";
  ELEMENTS.controls.style.display = "block";

  connect_to_server();
}

function connect_to_server() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  game.ws = new WebSocket(`${protocol}//${window.location.host}`);

  game.ws.onopen = () => {
    console.log("Connected to server");
    game.ws.send(
      JSON.stringify({
        type: "join",
        nickname: game.nickname,
      }),
    );
  };

  game.ws.onmessage = handle_message;
  game.ws.onclose = handle_connection_close;

  setup_input_handlers();
}

function handle_message(event) {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case "init": {
      game.playerId = data.playerId;
      game.roomId = data.roomId;
      break;
    }
    case "gameState": {
      const prevState = game.state;

      game.players = data.players;
      game.state = data.gameState;
      game.roundWinner = data.roundWinner;

      if (game.state === "starting" && prevState !== "starting") {
        game.playerRenderPositions = [];
        Object.values(game.players).forEach(
          (p, i) => (game.playerRenderPositions[i] = { x: p.x, y: p.y }),
        );
        ELEMENTS.countdown.textContent = "3";
        setTimeout(() => (ELEMENTS.countdown.textContent = "2"), 500);
        setTimeout(() => (ELEMENTS.countdown.textContent = "1"), 1000);
        setTimeout(() => (ELEMENTS.countdown.textContent = "KICK IT!"), 1500);
        setTimeout(() => (ELEMENTS.countdown.textContent = ""), 2100);
      }

      update_game_info();
      break;
    }
    case "playerLeft": {
      ELEMENTS.gameInfo.textContent =
        "Opponent left the game. Waiting for new opponent...";
      game.state = "waiting";
      break;
    }
  }
}

function update_game_info() {
  if (game.state === "waiting") {
    ELEMENTS.gameInfo.textContent = "Waiting for opponent...";
  } else if (game.state === "playing") {
    const playerInfos = Object.values(game.players)
      .map((p) => `${p.nickname}: ${p.score}`)
      .join(" vs ");
    ELEMENTS.gameInfo.textContent = playerInfos;
  } else if (game.state === "round_end") {
    const winner = Object.values(game.players).find(
      (p) => p.id === game.roundWinner,
    );
    ELEMENTS.gameInfo.textContent = `${winner.nickname} wins the round!`;
  }
}

function handle_connection_close() {
  ELEMENTS.gameInfo.textContent = "Connection lost. Please refresh the page.";
}

function setup_input_handlers() {
  // Keyboard handlers
  document.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      do_jump();
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      do_dive();
    }
  });

  // Mouse handlers
  ELEMENTS.canvas.addEventListener("mousedown", () => {
    do_jump();
  });

  ELEMENTS.canvas.addEventListener("mouseup", () => {
    do_dive();
  });

  // Touch handlers for mobile
  ELEMENTS.canvas.addEventListener("touchstart", (event) => {
    event.preventDefault(); // Prevent scrolling
    do_jump();
  });

  ELEMENTS.canvas.addEventListener("touchend", (event) => {
    event.preventDefault(); // Prevent scrolling
    do_dive();
  });
}

function send_action(action) {
  game.ws.send(
    JSON.stringify({
      type: "action",
      action: action,
    }),
  );
}

function do_jump() {
  if (!game.playerId || game.state !== "playing") return;
  send_action("jump");
  game.players[game.playerId].y -= 20;
}

function do_dive() {
  if (!game.playerId || game.state !== "playing") return;
  send_action("dive");
}

// Rendering functions
function render() {
  // Only render if game screen is active
  if (ELEMENTS.gameScreen.classList.contains("hidden")) {
    requestAnimationFrame(render);
    return;
  }

  // Clear canvas
  CTX.clearRect(0, 0, ELEMENTS.canvas.width, ELEMENTS.canvas.height);

  draw_background();
  draw_players();
  draw_foreground();

  requestAnimationFrame(render);
}

function draw_background() {
  // Sky gradient
  const gradient = CTX.createLinearGradient(0, 0, 0, ELEMENTS.canvas.height);
  gradient.addColorStop(0, "#1a2b47"); // Dark blue at top
  gradient.addColorStop(0.5, "#2a4070"); // Medium blue in middle
  gradient.addColorStop(1, "#4a6090"); // Lighter blue at bottom
  CTX.fillStyle = gradient;
  CTX.fillRect(0, 0, ELEMENTS.canvas.width, ELEMENTS.canvas.height);

  draw_skyline();
  draw_stars();
  draw_clouds();
  draw_floor();
}

function draw_skyline() {
  CTX.fillStyle = "#101830";
  // Draw several mountain/building shapes with fixed heights
  const mountainHeights = [100, 120, 90, 110, 105];
  for (let i = 0; i < 5; i++) {
    const width = ELEMENTS.canvas.width / 3;
    const height = 80 + mountainHeights[i % mountainHeights.length];
    const x = i * (ELEMENTS.canvas.width / 4);

    // Draw a building or mountain shape
    CTX.beginPath();
    CTX.moveTo(x, ELEMENTS.canvas.height - height);
    CTX.lineTo(x + width / 4, ELEMENTS.canvas.height - height - 20);
    CTX.lineTo(x + width / 2, ELEMENTS.canvas.height - height);
    CTX.lineTo(x + (3 * width) / 4, ELEMENTS.canvas.height - height - 15);
    CTX.lineTo(x + width, ELEMENTS.canvas.height - height);
    CTX.lineTo(x + width, ELEMENTS.canvas.height);
    CTX.lineTo(x, ELEMENTS.canvas.height);
    CTX.fill();
  }
}

function draw_stars() {
  CTX.fillStyle = "#ffffff";
  const starPositions = [
    { x: 50, y: 30, size: 1.5, alpha: 0.8 },
    { x: 120, y: 50, size: 1.0, alpha: 0.6 },
    // ... rest of the star data
  ];

  for (let i = 0; i < 50 && i < starPositions.length; i++) {
    const star = starPositions[i];
    CTX.globalAlpha = star.alpha;
    CTX.fillRect(star.x, star.y, star.size, star.size);
  }
  CTX.globalAlpha = 1.0;
}

function draw_clouds() {
  CTX.fillStyle = "rgba(255, 255, 255, 0.2)";
  const cloudData = [
    { width: 150, height: 25, yOffset: 30 },
    { width: 130, height: 20, yOffset: 60 },
    { width: 170, height: 30, yOffset: 90 },
  ];

  for (let i = 0; i < 3; i++) {
    const x =
      (((i * ELEMENTS.canvas.width) / 3 +
        (((Date.now() / 10000) * ELEMENTS.canvas.width) %
          ELEMENTS.canvas.width)) %
        (ELEMENTS.canvas.width * 1.5)) -
      100;
    const y = 50 + cloudData[i].yOffset;
    const width = cloudData[i].width;
    const height = cloudData[i].height;

    // Draw cloud
    CTX.beginPath();
    CTX.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
    CTX.fill();
  }
}

function draw_floor() {
  const floorHeight = 40;
  const floorY = ELEMENTS.canvas.height - floorHeight;

  // Main floor
  const floorGradient = CTX.createLinearGradient(
    0,
    floorY,
    0,
    ELEMENTS.canvas.height,
  );
  floorGradient.addColorStop(0, "#f47521"); // Orange at top of floor
  floorGradient.addColorStop(1, "#d35400"); // Darker orange at bottom
  CTX.fillStyle = floorGradient;
  CTX.fillRect(0, floorY, ELEMENTS.canvas.width, floorHeight);

  // Add grid lines to floor
  CTX.strokeStyle = "#0a1c35";
  CTX.lineWidth = 1;

  // Horizontal grid lines
  for (let y = floorY; y <= ELEMENTS.canvas.height; y += 10) {
    CTX.beginPath();
    CTX.moveTo(0, y);
    CTX.lineTo(ELEMENTS.canvas.width, y);
    CTX.stroke();
  }

  // Vertical grid lines with perspective effect
  for (let i = 0; i <= 20; i++) {
    const perspectiveSpacing = i * (ELEMENTS.canvas.width / 20);
    CTX.beginPath();
    CTX.moveTo(perspectiveSpacing, floorY);
    CTX.lineTo(perspectiveSpacing, ELEMENTS.canvas.height);
    CTX.stroke();
  }

  // Add floor highlights
  CTX.fillStyle = "rgba(255, 255, 255, 0.1)";
  CTX.fillRect(0, floorY, ELEMENTS.canvas.width, 2);
}

function draw_players() {
  if (game.players && Object.keys(game.players).length > 0) {
    Object.values(game.players).forEach((player, index) => {
      draw_player(player, index);
    });
  }
}

function draw_player(player, playerIndex) {
  const renderPos = game.playerRenderPositions[playerIndex];
  const alpha = 0.6;
  const smoothedX = renderPos.x + (player.x - renderPos.x) * alpha;
  const smoothedY = renderPos.y + (player.y - renderPos.y) * alpha;
  renderPos.x = smoothedX;
  renderPos.y = smoothedY;

  // Update the render position for next frame
  game.playerRenderPositions[playerIndex] = { x: smoothedX, y: smoothedY };

  CTX.save();

  // Handle facing direction
  if (!player.facingRight) {
    CTX.translate(renderPos.x + player.width, 0);
    CTX.scale(-1, 1);
    CTX.translate(-renderPos.x, 0);
  }
  CTX.translate(0, -20);

  // Apply a color tint
  CTX.globalAlpha = 0.8;
  CTX.fillStyle = PLAYER_COLORS[playerIndex];
  CTX.fillRect(renderPos.x, renderPos.y, player.width, player.height);
  CTX.globalAlpha = 1.0;

  if (player.isDiving) {
    const scaleX = SPRITE_DIMENSIONS.kick.width / SPRITE_DIMENSIONS.baseWidth;
    CTX.drawImage(
      SPRITES.kick,
      0,
      0,
      SPRITE_DIMENSIONS.kick.width,
      SPRITE_DIMENSIONS.kick.height,
      renderPos.x - 50,
      renderPos.y,
      player.width * scaleX,
      player.height,
    );
  } else if (player.isJumping) {
    // Draw jumping sprite (second frame of run)
    CTX.drawImage(
      SPRITES.run,
      SPRITE_DIMENSIONS.run.width * 1,
      0,
      SPRITE_DIMENSIONS.run.width,
      SPRITE_DIMENSIONS.run.height,
      renderPos.x,
      renderPos.y,
      player.width,
      player.height,
    );
  } else {
    // Draw idle animation
    CTX.drawImage(
      SPRITES.idle,
      SPRITE_DIMENSIONS.idle.width * player.animFrame,
      0,
      SPRITE_DIMENSIONS.idle.width,
      SPRITE_DIMENSIONS.idle.height,
      renderPos.x,
      renderPos.y,
      player.width,
      player.height,
    );
  }

  // Draw nickname above player
  CTX.restore();
  CTX.fillStyle = PLAYER_COLORS[playerIndex];
  CTX.font = "12px 'Press Start 2P'";
  CTX.textAlign = "center";
  CTX.fillText(
    player.nickname,
    renderPos.x + player.width / 2,
    renderPos.y - 30,
  );
}

function draw_foreground() {
  // Add foreground elements - maybe some side elements
  CTX.fillStyle = "#0a1c35";
  const pillarWidth = 30;
  CTX.fillRect(0, 0, pillarWidth, ELEMENTS.canvas.height);
  CTX.fillRect(
    ELEMENTS.canvas.width - pillarWidth,
    0,
    pillarWidth,
    ELEMENTS.canvas.height,
  );
}

// Main execution
function main() {
  init();
  render();
}

main();
