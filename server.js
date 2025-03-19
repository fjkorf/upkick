const WebSocket = require("ws");
const http = require("http");
const express = require("express");

// ========== Constants ==========
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const PLAYER_WIDTH = 100;
const PLAYER_HEIGHT = 140;
const GRAVITY = 0.5;
const JUMP_FORCE = -15;
const DIVE_SPEED = 10;
const PORT = process.env.PORT || 3000;

// ========== Data Structures ==========
class Player {
  constructor(id, nickname) {
    this.id = id;
    this.nickname = nickname || `Player ${id}`;
    this.x = id % 2 === 1 ? 160 : 560;
    this.y = GAME_HEIGHT - PLAYER_HEIGHT;
    this.width = PLAYER_WIDTH;
    this.height = PLAYER_HEIGHT;
    this.velocityY = 0;
    this.velocityX = 0;
    this.isJumping = false;
    this.isDiving = false;
    this.score = 0;
    this.facingRight = id % 2 === 1;
    this.animFrame = 0;
    this.lastAnimUpdate = Date.now();
  }
}

class Room {
  constructor(id) {
    this.id = id;
    this.players = {};
    this.gameState = "waiting"; // waiting, playing, round_end
    this.roundWinner = null;
  }

  addPlayer(player) {
    this.players[player.id] = player;
  }

  removePlayer(playerId) {
    delete this.players[playerId];
  }

  get playerCount() {
    return Object.keys(this.players).length;
  }

  getPlayerIds() {
    return Object.keys(this.players);
  }
}

// ========== Game State ==========
class GameState {
  constructor() {
    this.players = {};
    this.rooms = {};
    this.nextPlayerId = 1;
    this.nextRoomId = 1;
  }

  createPlayer(nickname, ws) {
    const playerId = this.nextPlayerId++;
    const player = new Player(playerId, nickname);
    this.players[playerId] = {
      ...player,
      ws,
    };
    return player;
  }

  createRoom() {
    const roomId = this.nextRoomId++;
    const room = new Room(roomId);
    this.rooms[roomId] = room;
    return room;
  }

  findAvailableRoom() {
    // Find a room with only one player
    for (const roomId in this.rooms) {
      if (this.rooms[roomId].playerCount === 1) {
        return this.rooms[roomId];
      }
    }

    // Create a new room if none available
    return this.createRoom();
  }

  findPlayerRoom(playerId) {
    for (const roomId in this.rooms) {
      if (this.rooms[roomId].players[playerId]) {
        return this.rooms[roomId];
      }
    }
    return null;
  }

  removePlayer(playerId) {
    const room = this.findPlayerRoom(playerId);
    if (room) {
      room.removePlayer(playerId);
      if (room.playerCount === 0) {
        delete this.rooms[room.id];
      }
    }
    delete this.players[playerId];
    return room;
  }
}

// ========== Game Logic ==========
class GameLogic {
  static checkCollision(player1, player2) {
    return (
      player1.x < player2.x + player2.width &&
      player1.x + player1.width > player2.x &&
      player1.y < player2.y + player2.height &&
      player1.y + player1.height > player2.y
    );
  }

  static updatePlayerPhysics(player) {
    if (player.isJumping || player.isDiving) {
      player.velocityY += GRAVITY;
      player.y += player.velocityY;
      player.x += player.velocityX;

      // Check floor collision
      if (player.y >= GAME_HEIGHT - PLAYER_HEIGHT) {
        player.y = GAME_HEIGHT - PLAYER_HEIGHT;
        player.velocityY = 0;
        player.velocityX = 0;
        player.isJumping = false;
        player.isDiving = false;
      }
    }
  }

  static updatePlayerAnimation(player) {
    if (!player.isJumping && !player.isDiving) {
      // Only animate idle players
      const now = Date.now();
      if (now - player.lastAnimUpdate > 150) {
        // Animation speed
        player.animFrame = (player.animFrame + 1) % 4;
        player.lastAnimUpdate = now;
      }
    }
  }

  static resetRound(room) {
    room.getPlayerIds().forEach((playerId, index) => {
      const player = room.players[playerId];
      player.x = index === 0 ? 160 : 560;
      player.y = GAME_HEIGHT - PLAYER_HEIGHT;
      player.velocityY = 0;
      player.velocityX = 0;
      player.isJumping = false;
      player.isDiving = false;
      player.facingRight = index === 0;
      player.animFrame = 0;
    });

    room.gameState = "playing";
    room.roundWinner = null;
    return room;
  }

  static handlePlayerAction(player, action) {
    switch (action) {
      case "jump":
        if (!player.isJumping && !player.isDiving) {
          player.isJumping = true;
          player.velocityY = JUMP_FORCE;
        }
        break;
      case "dive":
        if (player.isJumping && !player.isDiving) {
          player.isDiving = true;
          player.velocityY = DIVE_SPEED;
          player.velocityX = player.facingRight ? DIVE_SPEED : -DIVE_SPEED;
        }
        break;
    }
  }

  static updateGame(room) {
    const playerIds = room.getPlayerIds();
    if (playerIds.length !== 2 || room.gameState !== "playing") return false;

    const player1 = room.players[playerIds[0]];
    const player2 = room.players[playerIds[1]];

    // Update animations
    this.updatePlayerAnimation(player1);
    this.updatePlayerAnimation(player2);

    // Update physics
    this.updatePlayerPhysics(player1);
    this.updatePlayerPhysics(player2);

    // Check player collision
    let stateChanged = false;
    if (this.checkCollision(player1, player2)) {
      if (player1.isDiving && !player2.isDiving) {
        room.roundWinner = player1.id;
        room.gameState = "round_end";
        player1.score++;
        stateChanged = true;
      } else if (player2.isDiving && !player1.isDiving) {
        room.roundWinner = player2.id;
        room.gameState = "round_end";
        player2.score++;
        stateChanged = true;
      } else if (player1.isDiving && player2.isDiving) {
        room.gameState = "round_end";
        stateChanged = true;
        // If both diving, the one who is higher wins
        if (player1.y > player2.y) {
          room.roundWinner = player1.id;
          player1.score++;
        } else {
          room.roundWinner = player2.id;
          player2.score++;
        }
      }
    }

    return stateChanged;
  }
}

// ========== Network Communication ==========
class NetworkManager {
  static broadcastGameState(room, gameState) {
    room.getPlayerIds().forEach((playerId) => {
      const client = gameState.players[playerId].ws;
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "gameState",
            players: room.players,
            gameState: room.gameState,
            roundWinner: room.roundWinner,
          }),
        );
      }
    });
  }

  static sendInitMessage(ws, playerId, roomId) {
    ws.send(
      JSON.stringify({
        type: "init",
        playerId,
        roomId,
      }),
    );
  }

  static notifyPlayerLeft(ws) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "playerLeft",
        }),
      );
    }
  }
}

// ========== Server Setup ==========
class GameServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.gameState = new GameState();
    this.roomIntervals = {};

    this.setupRoutes();
    this.setupWebSocketHandlers();
  }

  setupRoutes() {
    this.app.use(express.static("public"));
  }

  setupWebSocketHandlers() {
    this.wss.on("connection", (ws) => {
      let playerId = null;

      ws.on("message", (message) => {
        const data = JSON.parse(message);

        if (data.type === "join") {
          this.handleJoin(ws, data, (id) => (playerId = id));
        } else if (data.type === "action") {
          this.handleAction(playerId, data);
        }
      });

      ws.on("close", () => {
        if (!playerId) return;
        this.handlePlayerDisconnect(playerId);
      });
    });
  }

  handleJoin(ws, data, setPlayerId) {
    // New player joining with nickname
    const nickname =
      data.nickname.trim() || `Player ${this.gameState.nextPlayerId}`;
    const player = this.gameState.createPlayer(nickname, ws);
    setPlayerId(player.id);

    // Assign to room
    const room = this.gameState.findAvailableRoom();
    room.addPlayer(player);

    // Send initial data to client
    NetworkManager.sendInitMessage(ws, player.id, room.id);

    // Start game if room is full
    if (room.playerCount === 2) {
      const playerIds = room.getPlayerIds();
      playerIds.forEach((pid, i) => {
        room.players[pid].x = i === 0 ? 160 : 560;
        room.players[pid].facingRight = i === 0;
      });
      room.gameState = "starting";
      NetworkManager.broadcastGameState(room, this.gameState);
      setTimeout(() => {
        room.gameState = "playing";
        NetworkManager.broadcastGameState(room, this.gameState);
      }, 2000);

      // Start game loop for this room
      this.startGameLoop(room);
    }
  }

  handleAction(playerId, data) {
    if (!playerId) return;

    const room = this.gameState.findPlayerRoom(playerId);
    if (!room || room.gameState !== "playing") return;

    const player = room.players[playerId];
    GameLogic.handlePlayerAction(player, data.action);
  }

  handlePlayerDisconnect(playerId) {
    const room = this.gameState.removePlayer(playerId);
    if (room) {
      // Notify other player
      const otherPlayerId = room.getPlayerIds()[0];
      if (otherPlayerId) {
        const otherPlayerWs = this.gameState.players[otherPlayerId].ws;
        NetworkManager.notifyPlayerLeft(otherPlayerWs);
      }

      // Stop game loop if room was deleted
      if (room.playerCount === 0) {
        this.stopGameLoop(room.id);
      }
    }
  }

  startGameLoop(room) {
    const roomId = room.id;
    this.stopGameLoop(roomId); // Clear any existing interval

    this.roomIntervals[roomId] = setInterval(() => {
      const currentRoom = this.gameState.rooms[roomId];
      if (!currentRoom || currentRoom.playerCount !== 2) {
        this.stopGameLoop(roomId);
        return;
      }

      const stateChanged = GameLogic.updateGame(currentRoom);
      NetworkManager.broadcastGameState(currentRoom, this.gameState);

      if (currentRoom.gameState === "round_end") {
        setTimeout(() => {
          const updatedRoom = this.gameState.rooms[roomId];
          if (updatedRoom) {
            GameLogic.resetRound(updatedRoom);
            NetworkManager.broadcastGameState(updatedRoom, this.gameState);
          }
        }, 2000);
      }
    }, 1000 / 60); // 60 FPS
  }

  stopGameLoop(roomId) {
    if (this.roomIntervals[roomId]) {
      clearInterval(this.roomIntervals[roomId]);
      delete this.roomIntervals[roomId];
    }
  }

  start() {
    this.server.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
    });
  }
}

// ========== Initialize and Start Server ==========
const gameServer = new GameServer();
gameServer.start();
