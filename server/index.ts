/**
 * Socket.io + Redis サーバー
 * マルチインスタンス対応のリアルタイムゲームサーバー
 */

import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { v4 as uuidv4 } from "uuid";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
  GameState,
  GameAction,
  RoomInfo,
} from "../types/game";

import {
  getPubClient,
  getSubClient,
  getDataClient,
  closeAllClients,
  saveGameState,
  getGameState,
  deleteGameState,
  saveRoomInfo,
  getRoomInfo,
  deleteRoomInfo,
  setSocketPlayerMapping,
  getPlayerIdBySocket,
  getRoomIdBySocket,
  removeSocketPlayerMapping,
  saveChatMessage,
  getChatHistory,
  healthCheck,
} from "../lib/redis";

import {
  createInitialGameState,
  addPlayerToGame,
  removePlayerFromGame,
  processGameAction,
} from "./game-logic";

// ============================================
// 設定
// ============================================

const PORT = parseInt(process.env.SOCKET_PORT || "3001", 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

// ============================================
// サーバー初期化
// ============================================

const httpServer = createServer((req, res) => {
  // ヘルスチェックエンドポイント
  if (req.url === "/health") {
    healthCheck()
      .then((isHealthy) => {
        res.writeHead(isHealthy ? 200 : 503, {
          "Content-Type": "application/json",
        });
        res.end(
          JSON.stringify({
            status: isHealthy ? "healthy" : "unhealthy",
            redis: isHealthy,
            timestamp: new Date().toISOString(),
          })
        );
      })
      .catch(() => {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "unhealthy",
            redis: false,
            timestamp: new Date().toISOString(),
          })
        );
      });
    return;
  }

  res.writeHead(404);
  res.end();
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
  // 接続設定
  pingTimeout: 60000,
  pingInterval: 25000,
  // トランスポート設定
  transports: ["websocket", "polling"],
});

// ============================================
// Redis Adapter 設定
// ============================================

async function setupRedisAdapter(): Promise<void> {
  try {
    const pubClient = getPubClient();
    const subClient = getSubClient();

    // Redis接続を待機
    await Promise.all([
      new Promise<void>((resolve) => {
        if (pubClient.status === "ready") {
          resolve();
        } else {
          pubClient.once("ready", resolve);
        }
      }),
      new Promise<void>((resolve) => {
        if (subClient.status === "ready") {
          resolve();
        } else {
          subClient.once("ready", resolve);
        }
      }),
    ]);

    // Redis Adapterを設定
    io.adapter(createAdapter(pubClient, subClient));
    console.log("[Server] Redis adapter configured");
  } catch (error) {
    console.error("[Server] Failed to setup Redis adapter:", error);
    throw error;
  }
}

// ============================================
// イベントハンドラー
// ============================================

/**
 * ルーム参加ハンドラー
 */
async function handleJoinRoom(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  data: { roomId: string; playerName: string }
): Promise<void> {
  const { roomId, playerName } = data;

  try {
    // プレイヤーIDを生成（または再接続の場合は既存のIDを使用）
    const playerId = uuidv4();

    // 既存のゲーム状態を取得または新規作成
    let gameState = await getGameState(roomId);

    if (!gameState) {
      // 新しいルームを作成
      gameState = createInitialGameState(roomId);
      console.log(`[Server] Created new room: ${roomId}`);
    }

    // プレイヤーを追加
    try {
      gameState = addPlayerToGame(gameState, playerId, playerName);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to join room";
      socket.emit("room_joined", {
        success: false,
        roomId,
        playerId: "",
        gameState: null,
        error: errorMessage,
      });
      return;
    }

    // Socket.ioルームに参加
    await socket.join(roomId);

    // Redis にマッピングを保存
    await setSocketPlayerMapping(socket.id, playerId, roomId);

    // ゲーム状態を保存
    await saveGameState(roomId, gameState);

    // ルーム情報を更新
    const roomInfo: RoomInfo = {
      id: roomId,
      playerCount: gameState.players.length,
      maxPlayers: 4,
      status: gameState.phase === "waiting" ? "waiting" : "playing",
      createdAt: gameState.createdAt,
    };
    await saveRoomInfo(roomId, roomInfo);

    // 参加者に通知
    socket.emit("room_joined", {
      success: true,
      roomId,
      playerId,
      gameState,
    });

    // 他のプレイヤーに通知
    const newPlayer = gameState.players.find((p) => p.id === playerId);
    if (newPlayer) {
      socket.to(roomId).emit("player_joined", { player: newPlayer });
    }

    // ルーム全体に更新された状態を送信
    io.to(roomId).emit("update_state", { gameState });

    console.log(
      `[Server] Player ${playerName} (${playerId}) joined room ${roomId}`
    );
  } catch (error) {
    console.error("[Server] Error in handleJoinRoom:", error);
    socket.emit("room_joined", {
      success: false,
      roomId,
      playerId: "",
      gameState: null,
      error: "Internal server error",
    });
  }
}

/**
 * ルーム退出ハンドラー
 */
async function handleLeaveRoom(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  data: { roomId: string }
): Promise<void> {
  const { roomId } = data;

  try {
    const playerId = await getPlayerIdBySocket(socket.id);

    if (!playerId) {
      return;
    }

    // ゲーム状態を更新
    let gameState = await getGameState(roomId);

    if (gameState) {
      gameState = removePlayerFromGame(
        gameState,
        playerId,
        gameState.phase === "waiting"
      );
      await saveGameState(roomId, gameState);

      // 他のプレイヤーに通知
      socket.to(roomId).emit("player_left", { playerId });
      io.to(roomId).emit("update_state", { gameState });

      // プレイヤーがいなくなったらルームを削除
      if (gameState.players.length === 0) {
        await deleteGameState(roomId);
        await deleteRoomInfo(roomId);
        console.log(`[Server] Room ${roomId} deleted (empty)`);
      }
    }

    // マッピングを削除
    await removeSocketPlayerMapping(socket.id);

    // Socket.ioルームから退出
    await socket.leave(roomId);

    console.log(`[Server] Player ${playerId} left room ${roomId}`);
  } catch (error) {
    console.error("[Server] Error in handleLeaveRoom:", error);
  }
}

/**
 * ゲームアクションハンドラー
 */
async function handleGameAction(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  action: GameAction
): Promise<void> {
  const roomId = action.roomId;

  try {
    const playerId = await getPlayerIdBySocket(socket.id);

    if (!playerId) {
      socket.emit("action_result", {
        success: false,
        action: action.type,
        error: "Player not found",
      });
      return;
    }

    // ゲーム状態を取得
    let gameState = await getGameState(roomId);

    if (!gameState) {
      socket.emit("action_result", {
        success: false,
        action: action.type,
        error: "Game not found",
      });
      return;
    }

    // アクションを処理
    try {
      gameState = processGameAction(gameState, action, playerId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Invalid action";
      socket.emit("action_result", {
        success: false,
        action: action.type,
        error: errorMessage,
      });
      return;
    }

    // 状態を保存
    await saveGameState(roomId, gameState);

    // 成功を通知
    socket.emit("action_result", {
      success: true,
      action: action.type,
    });

    // ルーム全体に更新を配信
    io.to(roomId).emit("update_state", { gameState });

    console.log(
      `[Server] Action ${action.type} processed for room ${roomId} by player ${playerId}`
    );

    // 勝者チェック
    if (gameState.winnerId) {
      console.log(
        `[Server] Game over! Winner: ${gameState.winnerId} in room ${roomId}`
      );
    }
  } catch (error) {
    console.error("[Server] Error in handleGameAction:", error);
    socket.emit("action_result", {
      success: false,
      action: action.type,
      error: "Internal server error",
    });
  }
}

/**
 * チャットメッセージハンドラー
 */
async function handleChatMessage(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  data: { roomId: string; message: string }
): Promise<void> {
  const { roomId, message } = data;

  try {
    const playerId = await getPlayerIdBySocket(socket.id);

    if (!playerId) {
      return;
    }

    const gameState = await getGameState(roomId);
    if (!gameState) {
      return;
    }

    const player = gameState.players.find((p) => p.id === playerId);
    if (!player) {
      return;
    }

    const chatMessage = {
      playerId,
      playerName: player.name,
      message,
      timestamp: new Date().toISOString(),
    };

    // チャット履歴を保存
    await saveChatMessage(roomId, chatMessage);

    // ルーム全体に配信
    io.to(roomId).emit("chat_received", chatMessage);

    console.log(`[Server] Chat message in room ${roomId} from ${player.name}`);
  } catch (error) {
    console.error("[Server] Error in handleChatMessage:", error);
  }
}

/**
 * 切断ハンドラー
 */
async function handleDisconnect(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>
): Promise<void> {
  console.log(`[Server] Client disconnected: ${socket.id}`);

  try {
    const { playerId, roomId } = await removeSocketPlayerMapping(socket.id);

    if (playerId && roomId) {
      // ゲーム状態を更新（切断状態に）
      let gameState = await getGameState(roomId);

      if (gameState) {
        gameState = removePlayerFromGame(gameState, playerId, false);
        await saveGameState(roomId, gameState);

        // 他のプレイヤーに通知
        socket.to(roomId).emit("player_left", { playerId });
        io.to(roomId).emit("update_state", { gameState });
      }

      console.log(
        `[Server] Player ${playerId} disconnected from room ${roomId}`
      );
    }
  } catch (error) {
    console.error("[Server] Error in handleDisconnect:", error);
  }
}

// ============================================
// 接続ハンドラー
// ============================================

io.on("connection", (socket) => {
  console.log(`[Server] Client connected: ${socket.id}`);

  // イベントリスナーを登録
  socket.on("join_room", (data) => handleJoinRoom(socket, data));
  socket.on("leave_room", (data) => handleLeaveRoom(socket, data));
  socket.on("game_action", (action) => handleGameAction(socket, action));
  socket.on("chat_message", (data) => handleChatMessage(socket, data));
  socket.on("disconnect", () => handleDisconnect(socket));

  // エラーハンドリング
  socket.on("error", (error) => {
    console.error(`[Server] Socket error for ${socket.id}:`, error);
  });
});

// ============================================
// サーバー起動
// ============================================

async function startServer(): Promise<void> {
  try {
    // Redis Adapterを設定
    await setupRedisAdapter();

    // HTTPサーバーを起動
    httpServer.listen(PORT, () => {
      console.log(`[Server] Socket.io server running on port ${PORT}`);
      console.log(`[Server] CORS origin: ${CORS_ORIGIN}`);
    });
  } catch (error) {
    console.error("[Server] Failed to start server:", error);
    process.exit(1);
  }
}

// グレースフルシャットダウン
async function gracefulShutdown(): Promise<void> {
  console.log("[Server] Shutting down...");

  // 新しい接続を拒否
  httpServer.close();

  // 既存の接続を終了
  io.close();

  // Redisクライアントを終了
  await closeAllClients();

  console.log("[Server] Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// サーバー起動
startServer();
