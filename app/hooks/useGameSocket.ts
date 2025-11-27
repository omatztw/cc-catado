"use client";

/**
 * useGameSocket - ゲームサーバーとの通信を管理するカスタムフック
 * Socket.ioクライアントの接続管理、イベントリスナーの登録、
 * ゲームアクションの送信を担当
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  GameState,
  GameAction,
  Player,
  ChatMessage,
  RoomInfo,
} from "@/types/game";

// ============================================
// 型定義
// ============================================

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface UseGameSocketOptions {
  /** Socket.ioサーバーのURL */
  serverUrl?: string;
  /** 自動接続するかどうか */
  autoConnect?: boolean;
}

export interface UseGameSocketReturn {
  /** ソケットの接続状態 */
  isConnected: boolean;
  /** 接続中かどうか */
  isConnecting: boolean;
  /** 現在のゲーム状態 */
  gameState: GameState | null;
  /** 現在のプレイヤーID */
  playerId: string | null;
  /** エラーメッセージ */
  error: string | null;
  /** チャットメッセージ一覧 */
  chatMessages: ChatMessage[];
  /** 公開ルーム一覧 */
  publicRooms: RoomInfo[];
  /** ルームを作成 */
  createRoom: (data: {
    playerName: string;
    roomName: string;
    isPublic: boolean;
    password?: string;
  }) => void;
  /** ルームに参加 */
  joinRoom: (roomId: string, playerName: string, password?: string) => void;
  /** ルームから退出 */
  leaveRoom: () => void;
  /** 公開ルーム一覧を取得 */
  fetchPublicRooms: () => void;
  /** ゲームアクションを送信 */
  sendAction: (action: Omit<GameAction, "roomId">) => void;
  /** チャットメッセージを送信 */
  sendChatMessage: (message: string) => void;
  /** 接続を再試行 */
  reconnect: () => void;
}

// ============================================
// 定数
// ============================================

const DEFAULT_SERVER_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

// ============================================
// カスタムフック
// ============================================

export function useGameSocket(
  options: UseGameSocketOptions = {}
): UseGameSocketReturn {
  const { serverUrl = DEFAULT_SERVER_URL, autoConnect = false } = options;

  // ============================================
  // 状態
  // ============================================

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [publicRooms, setPublicRooms] = useState<RoomInfo[]>([]);

  // Ref でソケットインスタンスと現在のルームIDを保持
  const socketRef = useRef<GameSocket | null>(null);
  const roomIdRef = useRef<string | null>(null);

  // ============================================
  // ソケット接続の初期化
  // ============================================

  const initializeSocket = useCallback((): GameSocket => {
    if (socketRef.current) {
      return socketRef.current;
    }

    console.log("[useGameSocket] Initializing socket connection...");
    setIsConnecting(true);

    const socket: GameSocket = io(serverUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      autoConnect: true,
    });

    // ============================================
    // 接続イベントハンドラー
    // ============================================

    socket.on("connect", () => {
      console.log("[useGameSocket] Connected to server");
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
    });

    socket.on("disconnect", (reason) => {
      console.log("[useGameSocket] Disconnected:", reason);
      setIsConnected(false);

      if (reason === "io server disconnect") {
        // サーバーから切断された場合は手動で再接続
        socket.connect();
      }
    });

    socket.on("connect_error", (err) => {
      console.error("[useGameSocket] Connection error:", err.message);
      setIsConnecting(false);
      setError(`接続エラー: ${err.message}`);
    });

    // ============================================
    // ゲームイベントハンドラー
    // ============================================

    socket.on("room_created", (data) => {
      console.log("[useGameSocket] Room created:", data);

      if (data.success) {
        setPlayerId(data.playerId);
        setGameState(data.gameState);
        roomIdRef.current = data.roomId;
        setError(null);
      } else {
        setError(data.error || "ルームの作成に失敗しました");
      }
    });

    socket.on("room_joined", (data) => {
      console.log("[useGameSocket] Room joined:", data);

      if (data.success) {
        setPlayerId(data.playerId);
        setGameState(data.gameState);
        roomIdRef.current = data.roomId;
        setError(null);
      } else {
        setError(data.error || "ルームへの参加に失敗しました");
      }
    });

    socket.on("public_rooms", (data) => {
      console.log("[useGameSocket] Public rooms received:", data.rooms.length);
      setPublicRooms(data.rooms);
    });

    socket.on("update_state", (data) => {
      console.log("[useGameSocket] State updated");
      setGameState(data.gameState);
    });

    socket.on("player_joined", (data) => {
      console.log("[useGameSocket] Player joined:", data.player.name);
    });

    socket.on("player_left", (data) => {
      console.log("[useGameSocket] Player left:", data.playerId);
    });

    socket.on("action_result", (data) => {
      if (!data.success) {
        console.error("[useGameSocket] Action failed:", data.error);
        setError(data.error || `アクション ${data.action} に失敗しました`);

        // エラーを3秒後にクリア
        setTimeout(() => setError(null), 3000);
      }
    });

    socket.on("chat_received", (data) => {
      console.log("[useGameSocket] Chat received:", data.message);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `${data.playerId}-${data.timestamp}`,
          playerId: data.playerId,
          playerName: data.playerName,
          message: data.message,
          timestamp: data.timestamp,
        },
      ]);
    });

    socket.on("error", (data) => {
      console.error("[useGameSocket] Server error:", data);
      setError(data.message);
    });

    socketRef.current = socket;
    return socket;
  }, [serverUrl]);

  // ============================================
  // アクション関数
  // ============================================

  /**
   * ルームを作成
   */
  const createRoom = useCallback(
    (data: {
      playerName: string;
      roomName: string;
      isPublic: boolean;
      password?: string;
    }) => {
      const socket = initializeSocket();

      if (!socket.connected) {
        socket.once("connect", () => {
          socket.emit("create_room", data);
        });
      } else {
        socket.emit("create_room", data);
      }
    },
    [initializeSocket]
  );

  /**
   * ルームに参加
   */
  const joinRoom = useCallback(
    (roomId: string, playerName: string, password?: string) => {
      const socket = initializeSocket();

      if (!socket.connected) {
        // 接続完了後に参加
        socket.once("connect", () => {
          socket.emit("join_room", { roomId, playerName, password });
        });
      } else {
        socket.emit("join_room", { roomId, playerName, password });
      }
    },
    [initializeSocket]
  );

  /**
   * ルームから退出
   */
  const leaveRoom = useCallback(() => {
    if (!socketRef.current || !roomIdRef.current) {
      return;
    }

    socketRef.current.emit("leave_room", { roomId: roomIdRef.current });
    setGameState(null);
    setPlayerId(null);
    setChatMessages([]);
    roomIdRef.current = null;
  }, []);

  /**
   * 公開ルーム一覧を取得
   */
  const fetchPublicRooms = useCallback(() => {
    const socket = initializeSocket();

    if (!socket.connected) {
      socket.once("connect", () => {
        socket.emit("get_public_rooms");
      });
    } else {
      socket.emit("get_public_rooms");
    }
  }, [initializeSocket]);

  /**
   * ゲームアクションを送信
   */
  const sendAction = useCallback(
    (action: Omit<GameAction, "roomId">) => {
      if (!socketRef.current || !roomIdRef.current) {
        setError("サーバーに接続されていません");
        return;
      }

      const fullAction = {
        ...action,
        roomId: roomIdRef.current,
      } as GameAction;

      socketRef.current.emit("game_action", fullAction);
    },
    []
  );

  /**
   * チャットメッセージを送信
   */
  const sendChatMessage = useCallback((message: string) => {
    if (!socketRef.current || !roomIdRef.current) {
      return;
    }

    socketRef.current.emit("chat_message", {
      roomId: roomIdRef.current,
      message,
    });
  }, []);

  /**
   * 接続を再試行
   */
  const reconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setError(null);
    initializeSocket();
  }, [initializeSocket]);

  // ============================================
  // エフェクト
  // ============================================

  // 自動接続
  useEffect(() => {
    if (autoConnect) {
      initializeSocket();
    }

    // クリーンアップ
    return () => {
      if (socketRef.current) {
        console.log("[useGameSocket] Cleaning up socket connection");
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [autoConnect, initializeSocket]);

  // ============================================
  // 戻り値
  // ============================================

  return {
    isConnected,
    isConnecting,
    gameState,
    playerId,
    error,
    chatMessages,
    publicRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    fetchPublicRooms,
    sendAction,
    sendChatMessage,
    reconnect,
  };
}

// ============================================
// ユーティリティフック
// ============================================

/**
 * 現在のプレイヤー情報を取得するフック
 */
export function useCurrentPlayer(
  gameState: GameState | null,
  playerId: string | null
): Player | null {
  if (!gameState || !playerId) {
    return null;
  }
  return gameState.players.find((p) => p.id === playerId) || null;
}

/**
 * 自分のターンかどうかを判定するフック
 */
export function useIsMyTurn(
  gameState: GameState | null,
  playerId: string | null
): boolean {
  if (!gameState || !playerId) {
    return false;
  }
  return gameState.currentPlayerId === playerId;
}

/**
 * 特定のアクションが実行可能かどうかを判定するフック
 */
export function useCanPerformAction(
  gameState: GameState | null,
  playerId: string | null,
  actionType: string
): boolean {
  if (!gameState || !playerId) {
    return false;
  }

  const isMyTurn = gameState.currentPlayerId === playerId;

  switch (actionType) {
    case "start_game":
      return (
        gameState.phase === "waiting" && gameState.players.length >= 3
      );

    case "roll_dice":
      return isMyTurn && gameState.phase === "roll_dice";

    case "build_settlement":
      return (
        isMyTurn &&
        (gameState.phase === "main" ||
          gameState.phase === "setup_settlement_1" ||
          gameState.phase === "setup_settlement_2")
      );

    case "build_road":
      return (
        isMyTurn &&
        (gameState.phase === "main" ||
          gameState.phase === "setup_road_1" ||
          gameState.phase === "setup_road_2")
      );

    case "end_turn":
      return isMyTurn && gameState.phase === "main";

    default:
      return false;
  }
}

export default useGameSocket;
