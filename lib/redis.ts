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

  /** ルームパスワードのキー */
  roomPassword: (roomId: string) => `${REDIS_PREFIX}room:${roomId}:password`,

  /** アクティブルーム一覧のキー */
  activeRooms: () => `${REDIS_PREFIX}rooms:active`,

  /** 公開ルーム一覧のキー */
  publicRooms: () => `${REDIS_PREFIX}rooms:public`,

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

  /** ユーザーのユーザー名 */
  userUsername: (playerId: string) => `${REDIS_PREFIX}user:${playerId}:username`,

  /** ユーザーの現在のルーム */
  userRoom: (playerId: string) => `${REDIS_PREFIX}user:${playerId}:room`,
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
  roomInfo: RoomInfo,
  password?: string
): Promise<void> {
  const client = getDataClient();
  const key = RedisKeys.roomInfo(roomId);

  await client.set(key, JSON.stringify(roomInfo));
  await client.expire(key, 86400);

  // アクティブルーム一覧に追加
  await client.sadd(RedisKeys.activeRooms(), roomId);

  // 公開ルームの場合は公開ルーム一覧にも追加
  if (roomInfo.isPublic) {
    await client.sadd(RedisKeys.publicRooms(), roomId);
  }

  // パスワードを保存（ハッシュ化は省略、本番では bcrypt などを使用）
  if (password) {
    await client.set(RedisKeys.roomPassword(roomId), password, "EX", 86400);
  }
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
  await client.del(RedisKeys.roomPassword(roomId));
  await client.srem(RedisKeys.activeRooms(), roomId);
  await client.srem(RedisKeys.publicRooms(), roomId);

  console.log(`[Redis] Room info deleted for room: ${roomId}`);
}

/**
 * アクティブルーム一覧を取得
 */
export async function getActiveRooms(): Promise<string[]> {
  const client = getDataClient();
  return await client.smembers(RedisKeys.activeRooms());
}

/**
 * 公開ルーム一覧を取得
 */
export async function getPublicRooms(): Promise<RoomInfo[]> {
  const client = getDataClient();
  const roomIds = await client.smembers(RedisKeys.publicRooms());

  if (roomIds.length === 0) {
    return [];
  }

  const rooms: RoomInfo[] = [];

  for (const roomId of roomIds) {
    const roomInfo = await getRoomInfo(roomId);
    if (roomInfo && roomInfo.status !== "finished") {
      rooms.push(roomInfo);
    } else if (!roomInfo) {
      // 存在しないルームは一覧から削除
      await client.srem(RedisKeys.publicRooms(), roomId);
    }
  }

  // 作成日時の新しい順にソート
  return rooms.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * ルームパスワードを検証
 */
export async function verifyRoomPassword(
  roomId: string,
  password: string
): Promise<boolean> {
  const client = getDataClient();
  const storedPassword = await client.get(RedisKeys.roomPassword(roomId));

  // パスワードが設定されていない場合は true
  if (!storedPassword) {
    return true;
  }

  // パスワードを比較（本番では bcrypt.compare などを使用）
  return storedPassword === password;
}

/**
 * ルームにパスワードが設定されているか確認
 */
export async function hasRoomPassword(roomId: string): Promise<boolean> {
  const client = getDataClient();
  const password = await client.get(RedisKeys.roomPassword(roomId));
  return !!password;
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
// ルームアクティビティ管理
// ============================================

/**
 * ルームの最終アクティビティ日時を更新
 */
export async function updateRoomActivity(roomId: string): Promise<void> {
  const client = getDataClient();
  const key = RedisKeys.roomInfo(roomId);

  const data = await client.get(key);
  if (!data) {
    return;
  }

  try {
    const roomInfo = JSON.parse(data) as RoomInfo;
    roomInfo.lastActivityAt = new Date().toISOString();
    await client.set(key, JSON.stringify(roomInfo));
    await client.expire(key, 86400);
  } catch (error) {
    console.error(
      `[Redis] Failed to update room activity for room: ${roomId}`,
      error
    );
  }
}

/**
 * 指定した時間以上非アクティブなルームIDを取得
 * @param inactiveThresholdMs 非アクティブとみなすミリ秒数
 */
export async function getInactiveRoomIds(
  inactiveThresholdMs: number
): Promise<string[]> {
  const client = getDataClient();
  const roomIds = await client.smembers(RedisKeys.activeRooms());

  if (roomIds.length === 0) {
    return [];
  }

  const now = Date.now();
  const inactiveRoomIds: string[] = [];

  for (const roomId of roomIds) {
    const roomInfo = await getRoomInfo(roomId);

    if (!roomInfo) {
      // ルーム情報がない場合は削除対象
      inactiveRoomIds.push(roomId);
      continue;
    }

    // lastActivityAtがない場合はcreatedAtを使用（後方互換性）
    const lastActivity = roomInfo.lastActivityAt || roomInfo.createdAt;
    const lastActivityTime = new Date(lastActivity).getTime();

    if (now - lastActivityTime > inactiveThresholdMs) {
      inactiveRoomIds.push(roomId);
    }
  }

  return inactiveRoomIds;
}

/**
 * ルームを完全に削除（関連するすべてのデータを削除）
 */
export async function deleteRoomCompletely(roomId: string): Promise<void> {
  const client = getDataClient();

  // ゲーム状態を削除
  await client.del(RedisKeys.gameState(roomId));

  // ルーム情報を削除
  await client.del(RedisKeys.roomInfo(roomId));
  await client.del(RedisKeys.roomPassword(roomId));

  // ルームリストから削除
  await client.srem(RedisKeys.activeRooms(), roomId);
  await client.srem(RedisKeys.publicRooms(), roomId);

  // チャット履歴を削除
  await client.del(RedisKeys.chatHistory(roomId));

  // ルームプレイヤー一覧を削除
  await client.del(RedisKeys.roomPlayers(roomId));

  console.log(`[Redis] Room ${roomId} completely deleted`);
}

// ============================================
// ユーザー管理
// ============================================

/**
 * ユーザー情報を保存（ログイン時）
 */
export async function saveUserInfo(
  playerId: string,
  username: string
): Promise<void> {
  const client = getDataClient();
  const ttl = 86400 * 7; // 7日間有効

  await client.set(RedisKeys.userUsername(playerId), username, "EX", ttl);
}

/**
 * ユーザー名を取得
 */
export async function getUsernameByPlayerId(
  playerId: string
): Promise<string | null> {
  const client = getDataClient();
  return await client.get(RedisKeys.userUsername(playerId));
}

/**
 * ユーザーの現在のルームを保存
 */
export async function setUserActiveRoom(
  playerId: string,
  roomId: string
): Promise<void> {
  const client = getDataClient();
  const ttl = 86400; // 1日間有効

  await client.set(RedisKeys.userRoom(playerId), roomId, "EX", ttl);
}

/**
 * ユーザーの現在のルームを取得
 */
export async function getUserActiveRoom(
  playerId: string
): Promise<string | null> {
  const client = getDataClient();
  return await client.get(RedisKeys.userRoom(playerId));
}

/**
 * ユーザーの現在のルームをクリア
 */
export async function clearUserActiveRoom(playerId: string): Promise<void> {
  const client = getDataClient();
  await client.del(RedisKeys.userRoom(playerId));
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
