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
  getPublicRooms,
  verifyRoomPassword,
  hasRoomPassword,
  setSocketPlayerMapping,
  getPlayerIdBySocket,
  getRoomIdBySocket,
  removeSocketPlayerMapping,
  saveChatMessage,
  getChatHistory,
  healthCheck,
  updateRoomActivity,
  getInactiveRoomIds,
  deleteRoomCompletely,
} from "../lib/redis";

import {
  createInitialGameState,
  addPlayerToGame,
  removePlayerFromGame,
  addSpectatorToGame,
  removeSpectatorFromGame,
  takeSeat,
  leaveSeat,
  filterStateForSpectator,
  filterStateForPlayer,
  isSpectator as checkIsSpectator,
  isPlayer as checkIsPlayer,
  processGameAction,
  resetGameState,
} from "./game-logic";

// ============================================
// 設定
// ============================================

const PORT = parseInt(process.env.SOCKET_PORT || "3001", 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

// 非アクティブルーム自動削除の設定
// ROOM_INACTIVE_TIMEOUT_MS: 非アクティブとみなすまでの時間（ミリ秒）デフォルト: 30分
const ROOM_INACTIVE_TIMEOUT_MS = parseInt(
  process.env.ROOM_INACTIVE_TIMEOUT_MS || String(30 * 60 * 1000),
  10
);
// ROOM_CLEANUP_INTERVAL_MS: クリーンアップチェックの間隔（ミリ秒）デフォルト: 5分
const ROOM_CLEANUP_INTERVAL_MS = parseInt(
  process.env.ROOM_CLEANUP_INTERVAL_MS || String(5 * 60 * 1000),
  10
);

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
// ヘルパー関数
// ============================================

/**
 * ルーム内の全クライアントにゲーム状態を送信（各クライアントに適切なフィルタリングを適用）
 */
async function broadcastGameState(roomId: string, gameState: GameState): Promise<void> {
  const sockets = await io.in(roomId).fetchSockets();

  for (const sock of sockets) {
    const oduserId = await getPlayerIdBySocket(sock.id);
    if (!oduserId) continue;

    // プレイヤーか観戦者かで送信する状態をフィルタリング
    const filteredState = checkIsPlayer(gameState, oduserId)
      ? filterStateForPlayer(gameState, oduserId)
      : filterStateForSpectator(gameState);

    sock.emit("update_state", { gameState: filteredState });
  }
}

// ============================================
// イベントハンドラー
// ============================================

/**
 * ルーム作成ハンドラー
 */
async function handleCreateRoom(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  data: {
    playerName: string;
    roomName: string;
    isPublic: boolean;
    password?: string;
  }
): Promise<void> {
  const { playerName, roomName, isPublic, password } = data;

  try {
    // ルームIDとプレイヤーIDを生成
    const roomId = `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const playerId = uuidv4();

    // 新しいゲーム状態を作成（作成者をホストに設定）
    let gameState = createInitialGameState(roomId, playerId);

    // プレイヤーを追加
    gameState = addPlayerToGame(gameState, playerId, playerName);

    // Socket.ioルームに参加
    await socket.join(roomId);

    // Redis にマッピングを保存
    await setSocketPlayerMapping(socket.id, playerId, roomId);

    // ゲーム状態を保存
    await saveGameState(roomId, gameState);

    // ルーム情報を作成・保存
    const now = new Date().toISOString();
    const roomInfo: RoomInfo = {
      id: roomId,
      name: roomName,
      playerCount: gameState.players.length,
      spectatorCount: gameState.spectators.length,
      maxPlayers: 4,
      status: "waiting",
      isPublic,
      hasPassword: !!password,
      hostId: playerId,
      hostName: playerName,
      createdAt: gameState.createdAt,
      lastActivityAt: now,
    };
    await saveRoomInfo(roomId, roomInfo, password);

    // 作成者に通知
    socket.emit("room_created", {
      success: true,
      roomId,
      playerId,
      gameState,
    });

    console.log(
      `[Server] Room ${roomId} created by ${playerName} (public: ${isPublic}, password: ${!!password})`
    );
  } catch (error) {
    console.error("[Server] Error in handleCreateRoom:", error);
    socket.emit("room_created", {
      success: false,
      roomId: "",
      playerId: "",
      gameState: null,
      error: "Failed to create room",
    });
  }
}

/**
 * 公開ルーム一覧取得ハンドラー
 */
async function handleGetPublicRooms(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>
): Promise<void> {
  try {
    const rooms = await getPublicRooms();
    socket.emit("public_rooms", { rooms });
    console.log(`[Server] Sent ${rooms.length} public rooms to ${socket.id}`);
  } catch (error) {
    console.error("[Server] Error in handleGetPublicRooms:", error);
    socket.emit("public_rooms", { rooms: [] });
  }
}

/**
 * ルーム参加ハンドラー
 */
async function handleJoinRoom(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  data: { roomId: string; playerName: string; password?: string }
): Promise<void> {
  const { roomId, playerName, password } = data;

  try {
    // 既存のルーム情報を取得
    const existingRoomInfo = await getRoomInfo(roomId);

    // ルームが存在しない場合はエラー
    if (!existingRoomInfo) {
      socket.emit("room_joined", {
        success: false,
        roomId,
        playerId: "",
        gameState: null,
        isSpectator: false,
        error: "ルームが見つかりません",
      });
      return;
    }

    // パスワードチェック
    if (existingRoomInfo.hasPassword) {
      const isValidPassword = await verifyRoomPassword(roomId, password || "");
      if (!isValidPassword) {
        socket.emit("room_joined", {
          success: false,
          roomId,
          playerId: "",
          gameState: null,
          isSpectator: false,
          error: "パスワードが正しくありません",
        });
        return;
      }
    }

    // プレイヤーIDを生成
    const oduserId = uuidv4();

    // 既存のゲーム状態を取得
    let gameState = await getGameState(roomId);

    if (!gameState) {
      socket.emit("room_joined", {
        success: false,
        roomId,
        playerId: "",
        gameState: null,
        isSpectator: false,
        error: "ゲーム状態が見つかりません",
      });
      return;
    }

    // 常に観戦者として追加（ゲーム中でも参加可能）
    gameState = addSpectatorToGame(gameState, oduserId, playerName);
    const isJoiningAsSpectator = true;

    // Socket.ioルームに参加
    await socket.join(roomId);

    // Redis にマッピングを保存
    await setSocketPlayerMapping(socket.id, oduserId, roomId);

    // ゲーム状態を保存
    await saveGameState(roomId, gameState);

    // ルーム情報を更新
    const roomInfo: RoomInfo = {
      ...existingRoomInfo,
      playerCount: gameState.players.length,
      spectatorCount: gameState.spectators.length,
      status: gameState.phase === "waiting" ? "waiting" :
              gameState.phase === "game_over" ? "finished" : "playing",
      lastActivityAt: new Date().toISOString(),
    };
    await saveRoomInfo(roomId, roomInfo);

    // 参加者に通知（観戦者の場合は手札情報を隠す）
    const filteredState = isJoiningAsSpectator
      ? filterStateForSpectator(gameState)
      : filterStateForPlayer(gameState, oduserId);

    socket.emit("room_joined", {
      success: true,
      roomId,
      playerId: oduserId,
      gameState: filteredState,
      isSpectator: isJoiningAsSpectator,
    });

    // ルーム全体に更新された状態を送信（各クライアントには適切にフィルタ済みの状態を送る）
    await broadcastGameState(roomId, gameState);

    console.log(
      `[Server] ${isJoiningAsSpectator ? "Spectator" : "Player"} ${playerName} (${oduserId}) joined room ${roomId}`
    );
  } catch (error) {
    console.error("[Server] Error in handleJoinRoom:", error);
    socket.emit("room_joined", {
      success: false,
      roomId,
      playerId: "",
      gameState: null,
      isSpectator: false,
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
    const oduserId = await getPlayerIdBySocket(socket.id);

    if (!oduserId) {
      return;
    }

    // ゲーム状態を更新
    let gameState = await getGameState(roomId);

    if (gameState) {
      // プレイヤーか観戦者かで処理を分ける
      if (checkIsPlayer(gameState, oduserId)) {
        gameState = removePlayerFromGame(
          gameState,
          oduserId,
          gameState.phase === "waiting"
        );
        // 他のプレイヤーに通知
        socket.to(roomId).emit("player_left", { playerId: oduserId });
      } else if (checkIsSpectator(gameState, oduserId)) {
        gameState = removeSpectatorFromGame(gameState, oduserId, true);
      }

      await saveGameState(roomId, gameState);

      // ルーム情報を更新
      const existingRoomInfo = await getRoomInfo(roomId);
      if (existingRoomInfo) {
        const roomInfo: RoomInfo = {
          ...existingRoomInfo,
          playerCount: gameState.players.length,
          spectatorCount: gameState.spectators.length,
        };
        await saveRoomInfo(roomId, roomInfo);
      }

      // ルーム全体に更新された状態を送信
      await broadcastGameState(roomId, gameState);

      // プレイヤーも観戦者もいなくなったらルームを削除
      if (gameState.players.length === 0 && gameState.spectators.length === 0) {
        await deleteGameState(roomId);
        await deleteRoomInfo(roomId);
        console.log(`[Server] Room ${roomId} deleted (empty)`);
      }
    }

    // マッピングを削除
    await removeSocketPlayerMapping(socket.id);

    // Socket.ioルームから退出
    await socket.leave(roomId);

    console.log(`[Server] User ${oduserId} left room ${roomId}`);
  } catch (error) {
    console.error("[Server] Error in handleLeaveRoom:", error);
  }
}

/**
 * 席に着くハンドラー（観戦者→プレイヤー）
 */
async function handleTakeSeat(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  data: { roomId: string }
): Promise<void> {
  const { roomId } = data;

  try {
    const oduserId = await getPlayerIdBySocket(socket.id);

    if (!oduserId) {
      socket.emit("seat_changed", {
        success: false,
        isSpectator: true,
        error: "ユーザーが見つかりません",
      });
      return;
    }

    let gameState = await getGameState(roomId);

    if (!gameState) {
      socket.emit("seat_changed", {
        success: false,
        isSpectator: true,
        error: "ゲーム状態が見つかりません",
      });
      return;
    }

    try {
      gameState = takeSeat(gameState, oduserId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "席に着けませんでした";
      socket.emit("seat_changed", {
        success: false,
        isSpectator: true,
        error: errorMessage,
      });
      return;
    }

    await saveGameState(roomId, gameState);

    // ルーム情報を更新
    const existingRoomInfo = await getRoomInfo(roomId);
    if (existingRoomInfo) {
      const roomInfo: RoomInfo = {
        ...existingRoomInfo,
        playerCount: gameState.players.length,
        spectatorCount: gameState.spectators.length,
      };
      await saveRoomInfo(roomId, roomInfo);
    }

    // 席変更の結果を送信
    socket.emit("seat_changed", {
      success: true,
      isSpectator: false,
    });

    // ルーム全体に更新された状態を送信
    await broadcastGameState(roomId, gameState);

    console.log(`[Server] User ${oduserId} took a seat in room ${roomId}`);
  } catch (error) {
    console.error("[Server] Error in handleTakeSeat:", error);
    socket.emit("seat_changed", {
      success: false,
      isSpectator: true,
      error: "Internal server error",
    });
  }
}

/**
 * 席を立つハンドラー（プレイヤー→観戦者）
 */
async function handleLeaveSeat(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  data: { roomId: string }
): Promise<void> {
  const { roomId } = data;

  try {
    const oduserId = await getPlayerIdBySocket(socket.id);

    if (!oduserId) {
      socket.emit("seat_changed", {
        success: false,
        isSpectator: false,
        error: "ユーザーが見つかりません",
      });
      return;
    }

    let gameState = await getGameState(roomId);

    if (!gameState) {
      socket.emit("seat_changed", {
        success: false,
        isSpectator: false,
        error: "ゲーム状態が見つかりません",
      });
      return;
    }

    try {
      gameState = leaveSeat(gameState, oduserId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "席を立てませんでした";
      socket.emit("seat_changed", {
        success: false,
        isSpectator: false,
        error: errorMessage,
      });
      return;
    }

    await saveGameState(roomId, gameState);

    // ルーム情報を更新
    const existingRoomInfo = await getRoomInfo(roomId);
    if (existingRoomInfo) {
      const roomInfo: RoomInfo = {
        ...existingRoomInfo,
        playerCount: gameState.players.length,
        spectatorCount: gameState.spectators.length,
      };
      await saveRoomInfo(roomId, roomInfo);
    }

    // 席変更の結果を送信
    socket.emit("seat_changed", {
      success: true,
      isSpectator: true,
    });

    // ルーム全体に更新された状態を送信
    await broadcastGameState(roomId, gameState);

    console.log(`[Server] User ${oduserId} left seat in room ${roomId}`);
  } catch (error) {
    console.error("[Server] Error in handleLeaveSeat:", error);
    socket.emit("seat_changed", {
      success: false,
      isSpectator: false,
      error: "Internal server error",
    });
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

    // ルームのアクティビティを更新
    await updateRoomActivity(roomId);

    // 成功を通知
    socket.emit("action_result", {
      success: true,
      action: action.type,
    });

    // ルーム全体に更新を配信（各クライアントに適切にフィルタリング）
    await broadcastGameState(roomId, gameState);

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
    const oduserId = await getPlayerIdBySocket(socket.id);

    if (!oduserId) {
      return;
    }

    const gameState = await getGameState(roomId);
    if (!gameState) {
      return;
    }

    // プレイヤーか観戦者かを確認して名前を取得
    const player = gameState.players.find((p) => p.id === oduserId);
    const spectator = gameState.spectators.find((s) => s.id === oduserId);

    if (!player && !spectator) {
      return;
    }

    const userName = player?.name || spectator?.name || "Unknown";

    const chatMessage = {
      playerId: oduserId,
      playerName: userName,
      message,
      timestamp: new Date().toISOString(),
    };

    // チャット履歴を保存
    await saveChatMessage(roomId, chatMessage);

    // ルームのアクティビティを更新
    await updateRoomActivity(roomId);

    // ルーム全体に配信
    io.to(roomId).emit("chat_received", chatMessage);

    console.log(`[Server] Chat message in room ${roomId} from ${userName}`);
  } catch (error) {
    console.error("[Server] Error in handleChatMessage:", error);
  }
}

/**
 * ルーム再参加ハンドラー（再接続用）
 */
async function handleRejoinRoom(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  data: { roomId: string; playerId: string }
): Promise<void> {
  const { roomId, playerId } = data;

  try {
    // ゲーム状態を取得
    let gameState = await getGameState(roomId);

    if (!gameState) {
      socket.emit("room_rejoined", {
        success: false,
        roomId,
        playerId,
        gameState: null,
        isSpectator: false,
        error: "ルームが見つかりません",
      });
      return;
    }

    // プレイヤーまたは観戦者として存在するか確認
    const existingPlayer = gameState.players.find((p) => p.id === playerId);
    const existingSpectator = gameState.spectators.find((s) => s.id === playerId);

    if (!existingPlayer && !existingSpectator) {
      socket.emit("room_rejoined", {
        success: false,
        roomId,
        playerId,
        gameState: null,
        isSpectator: false,
        error: "ユーザーが見つかりません",
      });
      return;
    }

    const isRejoinAsSpectator = !existingPlayer;

    // 再接続状態に更新
    if (existingPlayer) {
      gameState = {
        ...gameState,
        players: gameState.players.map((p) =>
          p.id === playerId ? { ...p, isConnected: true } : p
        ),
        updatedAt: new Date().toISOString(),
      };
    } else {
      gameState = {
        ...gameState,
        spectators: gameState.spectators.map((s) =>
          s.id === playerId ? { ...s, isConnected: true } : s
        ),
        updatedAt: new Date().toISOString(),
      };
    }

    // Socket.ioルームに参加
    await socket.join(roomId);

    // Redis にマッピングを保存
    await setSocketPlayerMapping(socket.id, playerId, roomId);

    // ゲーム状態を保存
    await saveGameState(roomId, gameState);

    // 再参加者に適切にフィルタリングされた状態を送信
    const filteredState = isRejoinAsSpectator
      ? filterStateForSpectator(gameState)
      : filterStateForPlayer(gameState, playerId);

    socket.emit("room_rejoined", {
      success: true,
      roomId,
      playerId,
      gameState: filteredState,
      isSpectator: isRejoinAsSpectator,
    });

    // 他のプレイヤーに再接続を通知
    const userName = existingPlayer?.name || existingSpectator?.name || "Unknown";
    socket.to(roomId).emit("player_reconnected", {
      playerId,
      playerName: userName,
    });

    // ルーム全体に更新された状態を送信
    await broadcastGameState(roomId, gameState);

    console.log(
      `[Server] ${isRejoinAsSpectator ? "Spectator" : "Player"} ${userName} (${playerId}) rejoined room ${roomId}`
    );
  } catch (error) {
    console.error("[Server] Error in handleRejoinRoom:", error);
    socket.emit("room_rejoined", {
      success: false,
      roomId,
      playerId,
      gameState: null,
      isSpectator: false,
      error: "再接続に失敗しました",
    });
  }
}

/**
 * ゲームリセットハンドラー（ホストのみ）
 */
async function handleResetGame(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  data: { roomId: string }
): Promise<void> {
  const { roomId } = data;

  try {
    const playerId = await getPlayerIdBySocket(socket.id);

    if (!playerId) {
      socket.emit("error", {
        message: "プレイヤーが見つかりません",
        code: "PLAYER_NOT_FOUND",
      });
      return;
    }

    // ゲーム状態を取得
    const gameState = await getGameState(roomId);

    if (!gameState) {
      socket.emit("error", {
        message: "ゲームが見つかりません",
        code: "GAME_NOT_FOUND",
      });
      return;
    }

    // ホストかどうか確認
    if (gameState.hostId !== playerId) {
      socket.emit("error", {
        message: "ゲームをリセットできるのはホストのみです",
        code: "NOT_HOST",
      });
      return;
    }

    // ゲーム状態をリセット
    const newGameState = resetGameState(gameState);

    // 保存
    await saveGameState(roomId, newGameState);

    // ルーム情報を更新
    const roomInfo = await getRoomInfo(roomId);
    if (roomInfo) {
      const updatedRoomInfo: RoomInfo = {
        ...roomInfo,
        status: "waiting",
      };
      await saveRoomInfo(roomId, updatedRoomInfo);
    }

    // ルーム全体にリセット通知
    io.to(roomId).emit("game_reset", { gameState: newGameState });

    // 各クライアントに適切にフィルタリングした状態を送信
    await broadcastGameState(roomId, newGameState);

    console.log(`[Server] Game reset in room ${roomId} by host ${playerId}`);
  } catch (error) {
    console.error("[Server] Error in handleResetGame:", error);
    socket.emit("error", {
      message: "ゲームのリセットに失敗しました",
      code: "RESET_FAILED",
    });
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
        // プレイヤーか観戦者かで処理を分ける
        if (checkIsPlayer(gameState, playerId)) {
          gameState = removePlayerFromGame(gameState, playerId, false);
          // 他のプレイヤーに通知
          socket.to(roomId).emit("player_left", { playerId });
        } else if (checkIsSpectator(gameState, playerId)) {
          gameState = removeSpectatorFromGame(gameState, playerId, false);
        }

        await saveGameState(roomId, gameState);

        // ルーム全体に更新された状態を送信
        await broadcastGameState(roomId, gameState);
      }

      console.log(
        `[Server] User ${playerId} disconnected from room ${roomId}`
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
  socket.on("create_room", (data) => handleCreateRoom(socket, data));
  socket.on("join_room", (data) => handleJoinRoom(socket, data));
  socket.on("rejoin_room", (data) => handleRejoinRoom(socket, data));
  socket.on("leave_room", (data) => handleLeaveRoom(socket, data));
  socket.on("take_seat", (data) => handleTakeSeat(socket, data));
  socket.on("leave_seat", (data) => handleLeaveSeat(socket, data));
  socket.on("get_public_rooms", () => handleGetPublicRooms(socket));
  socket.on("game_action", (action) => handleGameAction(socket, action));
  socket.on("chat_message", (data) => handleChatMessage(socket, data));
  socket.on("reset_game", (data) => handleResetGame(socket, data));
  socket.on("disconnect", () => handleDisconnect(socket));

  // エラーハンドリング
  socket.on("error", (error) => {
    console.error(`[Server] Socket error for ${socket.id}:`, error);
  });
});

// ============================================
// 非アクティブルーム自動削除
// ============================================

let cleanupIntervalId: NodeJS.Timeout | null = null;

/**
 * 非アクティブなルームをクリーンアップ
 */
async function cleanupInactiveRooms(): Promise<void> {
  try {
    const inactiveRoomIds = await getInactiveRoomIds(ROOM_INACTIVE_TIMEOUT_MS);

    if (inactiveRoomIds.length === 0) {
      return;
    }

    console.log(
      `[Server] Found ${inactiveRoomIds.length} inactive room(s) to clean up`
    );

    for (const roomId of inactiveRoomIds) {
      // ルーム内の全ソケットに通知
      io.to(roomId).emit("error", {
        message: "ルームは非アクティブのため削除されました",
        code: "ROOM_INACTIVE_DELETED",
      });

      // ルーム内の全ソケットを退出させる
      const sockets = await io.in(roomId).fetchSockets();
      for (const socket of sockets) {
        socket.leave(roomId);
      }

      // ルームを完全に削除
      await deleteRoomCompletely(roomId);
      console.log(`[Server] Inactive room ${roomId} deleted`);
    }
  } catch (error) {
    console.error("[Server] Error in cleanupInactiveRooms:", error);
  }
}

/**
 * 定期的なクリーンアップタイマーを開始
 */
function startCleanupTimer(): void {
  if (cleanupIntervalId) {
    return;
  }

  cleanupIntervalId = setInterval(cleanupInactiveRooms, ROOM_CLEANUP_INTERVAL_MS);

  const timeoutMinutes = Math.round(ROOM_INACTIVE_TIMEOUT_MS / 60000);
  const intervalMinutes = Math.round(ROOM_CLEANUP_INTERVAL_MS / 60000);
  console.log(
    `[Server] Inactive room cleanup started (timeout: ${timeoutMinutes}min, interval: ${intervalMinutes}min)`
  );
}

/**
 * クリーンアップタイマーを停止
 */
function stopCleanupTimer(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    console.log("[Server] Inactive room cleanup stopped");
  }
}

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

    // 非アクティブルームのクリーンアップタイマーを開始
    startCleanupTimer();
  } catch (error) {
    console.error("[Server] Failed to start server:", error);
    process.exit(1);
  }
}

// グレースフルシャットダウン
async function gracefulShutdown(): Promise<void> {
  console.log("[Server] Shutting down...");

  // クリーンアップタイマーを停止
  stopCleanupTimer();

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
