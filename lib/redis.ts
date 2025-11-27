/**
 * Redis クライアント設定
 * ゲーム状態の永続化とPub/Sub通信に使用
 */

import Redis from "ioredis";
import type { GameState, RoomInfo } from "@/types/game";

// ============================================
// 環境変数
// ============================================

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REDIS_PREFIX = process.env.REDIS_PREFIX || "catado:";

// ============================================
// Redisクライアント作成
// ============================================

/**
 * Redisクライアントを作成する
 * @param name - クライアント識別名（ログ用）
 */
export function createRedisClient(name: string = "default"): Redis {
  const client = new Redis(REDIS_URL, {
    // 再接続設定
    retryStrategy: (times) => {
      if (times > 10) {
        console.error(
          `[Redis:${name}] Maximum reconnection attempts reached`
        );
        return null; // 再接続を停止
      }
      const delay = Math.min(times * 100, 3000);
      console.log(
        `[Redis:${name}] Reconnecting in ${delay}ms (attempt ${times})`
      );
      return delay;
    },
    // 接続タイムアウト
    connectTimeout: 10000,
    // コマンドタイムアウト
    commandTimeout: 5000,
    // 自動再接続
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
  });

  // イベントハンドラー
  client.on("connect", () => {
    console.log(`[Redis:${name}] Connecting...`);
  });

  client.on("ready", () => {
    console.log(`[Redis:${name}] Connected and ready`);
  });

  client.on("error", (err) => {
    console.error(`[Redis:${name}] Error:`, err.message);
  });

  client.on("close", () => {
    console.log(`[Redis:${name}] Connection closed`);
  });

  client.on("reconnecting", () => {
    console.log(`[Redis:${name}] Reconnecting...`);
  });

  return client;
}

// ============================================
// シングルトンインスタンス
// ============================================

let pubClient: Redis | null = null;
let subClient: Redis | null = null;
let dataClient: Redis | null = null;

/**
 * Pub/Sub用のPublisherクライアントを取得
 */
export function getPubClient(): Redis {
  if (!pubClient) {
    pubClient = createRedisClient("pub");
  }
  return pubClient;
}

/**
 * Pub/Sub用のSubscriberクライアントを取得
 */
export function getSubClient(): Redis {
  if (!subClient) {
    subClient = createRedisClient("sub");
  }
  return subClient;
}

/**
 * データ操作用のクライアントを取得
 */
export function getDataClient(): Redis {
  if (!dataClient) {
    dataClient = createRedisClient("data");
  }
  return dataClient;
}

/**
 * すべてのRedisクライアントを終了
 */
export async function closeAllClients(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  if (pubClient) {
    closePromises.push(
      pubClient.quit().then(() => {
        pubClient = null;
      })
    );
  }
  if (subClient) {
    closePromises.push(
      subClient.quit().then(() => {
        subClient = null;
      })
    );
  }
  if (dataClient) {
    closePromises.push(
      dataClient.quit().then(() => {
        dataClient = null;
      })
    );
  }

  await Promise.all(closePromises);
  console.log("[Redis] All clients closed");
}

// ============================================
// Redisキー生成
// ============================================

export const RedisKeys = {
  /** ゲーム状態のキー */
  gameState: (roomId: string) => `${REDIS_PREFIX}game:${roomId}:state`,

  /** ルーム情報のキー */
  roomInfo: (roomId: string) => `${REDIS_PREFIX}room:${roomId}:info`,

  /** アクティブルーム一覧のキー */
  activeRooms: () => `${REDIS_PREFIX}rooms:active`,

  /** プレイヤーのソケットマッピング */
  playerSocket: (playerId: string) =>
    `${REDIS_PREFIX}player:${playerId}:socket`,

  /** ソケットのプレイヤーマッピング */
  socketPlayer: (socketId: string) =>
    `${REDIS_PREFIX}socket:${socketId}:player`,

  /** ソケットのルームマッピング */
  socketRoom: (socketId: string) => `${REDIS_PREFIX}socket:${socketId}:room`,

  /** ルームのプレイヤー一覧 */
  roomPlayers: (roomId: string) => `${REDIS_PREFIX}room:${roomId}:players`,

  /** チャット履歴 */
  chatHistory: (roomId: string) => `${REDIS_PREFIX}room:${roomId}:chat`,
};

// ============================================
// ゲーム状態操作
// ============================================

/**
 * ゲーム状態を保存
 */
export async function saveGameState(
  roomId: string,
  gameState: GameState
): Promise<void> {
  const client = getDataClient();
  const key = RedisKeys.gameState(roomId);

  // 更新日時を設定
  gameState.updatedAt = new Date().toISOString();

  await client.set(key, JSON.stringify(gameState));

  // 24時間後に自動削除（TTL）
  await client.expire(key, 86400);

  console.log(`[Redis] Game state saved for room: ${roomId}`);
}

/**
 * ゲーム状態を取得
 */
export async function getGameState(
  roomId: string
): Promise<GameState | null> {
  const client = getDataClient();
  const key = RedisKeys.gameState(roomId);

  const data = await client.get(key);
  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as GameState;
  } catch (error) {
    console.error(
      `[Redis] Failed to parse game state for room: ${roomId}`,
      error
    );
    return null;
  }
}

/**
 * ゲーム状態を削除
 */
export async function deleteGameState(roomId: string): Promise<void> {
  const client = getDataClient();
  const key = RedisKeys.gameState(roomId);
  await client.del(key);
  console.log(`[Redis] Game state deleted for room: ${roomId}`);
}

// ============================================
// ルーム管理
// ============================================

/**
 * ルーム情報を保存
 */
export async function saveRoomInfo(
  roomId: string,
  roomInfo: RoomInfo
): Promise<void> {
  const client = getDataClient();
  const key = RedisKeys.roomInfo(roomId);

  await client.set(key, JSON.stringify(roomInfo));
  await client.expire(key, 86400);

  // アクティブルーム一覧に追加
  await client.sadd(RedisKeys.activeRooms(), roomId);
}

/**
 * ルーム情報を取得
 */
export async function getRoomInfo(roomId: string): Promise<RoomInfo | null> {
  const client = getDataClient();
  const key = RedisKeys.roomInfo(roomId);

  const data = await client.get(key);
  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as RoomInfo;
  } catch (error) {
    console.error(
      `[Redis] Failed to parse room info for room: ${roomId}`,
      error
    );
    return null;
  }
}

/**
 * ルーム情報を削除
 */
export async function deleteRoomInfo(roomId: string): Promise<void> {
  const client = getDataClient();

  await client.del(RedisKeys.roomInfo(roomId));
  await client.srem(RedisKeys.activeRooms(), roomId);

  console.log(`[Redis] Room info deleted for room: ${roomId}`);
}

/**
 * アクティブルーム一覧を取得
 */
export async function getActiveRooms(): Promise<string[]> {
  const client = getDataClient();
  return await client.smembers(RedisKeys.activeRooms());
}

// ============================================
// ソケット・プレイヤーマッピング
// ============================================

/**
 * ソケットとプレイヤーの関連付けを保存
 */
export async function setSocketPlayerMapping(
  socketId: string,
  playerId: string,
  roomId: string
): Promise<void> {
  const client = getDataClient();
  const ttl = 86400; // 24時間

  await Promise.all([
    client.set(RedisKeys.socketPlayer(socketId), playerId, "EX", ttl),
    client.set(RedisKeys.socketRoom(socketId), roomId, "EX", ttl),
    client.set(RedisKeys.playerSocket(playerId), socketId, "EX", ttl),
    client.sadd(RedisKeys.roomPlayers(roomId), playerId),
  ]);
}

/**
 * ソケットに関連付けられたプレイヤーIDを取得
 */
export async function getPlayerIdBySocket(
  socketId: string
): Promise<string | null> {
  const client = getDataClient();
  return await client.get(RedisKeys.socketPlayer(socketId));
}

/**
 * ソケットに関連付けられたルームIDを取得
 */
export async function getRoomIdBySocket(
  socketId: string
): Promise<string | null> {
  const client = getDataClient();
  return await client.get(RedisKeys.socketRoom(socketId));
}

/**
 * プレイヤーIDに関連付けられたソケットIDを取得
 */
export async function getSocketIdByPlayer(
  playerId: string
): Promise<string | null> {
  const client = getDataClient();
  return await client.get(RedisKeys.playerSocket(playerId));
}

/**
 * ソケットとプレイヤーの関連付けを削除
 */
export async function removeSocketPlayerMapping(
  socketId: string
): Promise<{ playerId: string | null; roomId: string | null }> {
  const client = getDataClient();

  const [playerId, roomId] = await Promise.all([
    client.get(RedisKeys.socketPlayer(socketId)),
    client.get(RedisKeys.socketRoom(socketId)),
  ]);

  const deletePromises: Promise<number>[] = [
    client.del(RedisKeys.socketPlayer(socketId)),
    client.del(RedisKeys.socketRoom(socketId)),
  ];

  if (playerId) {
    deletePromises.push(client.del(RedisKeys.playerSocket(playerId)));
  }

  if (roomId && playerId) {
    deletePromises.push(
      client.srem(RedisKeys.roomPlayers(roomId), playerId)
    );
  }

  await Promise.all(deletePromises);

  return { playerId, roomId };
}

/**
 * ルームのプレイヤー一覧を取得
 */
export async function getRoomPlayerIds(roomId: string): Promise<string[]> {
  const client = getDataClient();
  return await client.smembers(RedisKeys.roomPlayers(roomId));
}

// ============================================
// チャット履歴
// ============================================

/**
 * チャットメッセージを保存
 */
export async function saveChatMessage(
  roomId: string,
  message: {
    playerId: string;
    playerName: string;
    message: string;
    timestamp: string;
  }
): Promise<void> {
  const client = getDataClient();
  const key = RedisKeys.chatHistory(roomId);

  // リストの末尾に追加
  await client.rpush(key, JSON.stringify(message));

  // 最新100件のみ保持
  await client.ltrim(key, -100, -1);

  // TTL設定
  await client.expire(key, 86400);
}

/**
 * チャット履歴を取得
 */
export async function getChatHistory(
  roomId: string,
  limit: number = 50
): Promise<
  Array<{
    playerId: string;
    playerName: string;
    message: string;
    timestamp: string;
  }>
> {
  const client = getDataClient();
  const key = RedisKeys.chatHistory(roomId);

  const messages = await client.lrange(key, -limit, -1);

  return messages.map((msg) => JSON.parse(msg));
}

// ============================================
// ヘルスチェック
// ============================================

/**
 * Redis接続のヘルスチェック
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const client = getDataClient();
    const result = await client.ping();
    return result === "PONG";
  } catch (error) {
    console.error("[Redis] Health check failed:", error);
    return false;
  }
}
