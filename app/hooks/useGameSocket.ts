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

/** セッション情報（localStorage保存用） - 後方互換性のため残す */
export interface SessionInfo {
  roomId: string;
  playerId: string;
  playerName: string;
  timestamp: number;
}

/** AIの思考（つぶやき）データ */
export interface AIThinking {
  playerId: string;
  playerName: string;
  thinking: string;
  timestamp: string;
}

export interface UseGameSocketReturn {
  /** ソケットの接続状態 */
  isConnected: boolean;
  /** 接続中かどうか */
  isConnecting: boolean;
  /** ログイン済みかどうか */
  isLoggedIn: boolean;
  /** ログイン中のユーザー名 */
  loggedInUsername: string | null;
  /** セッション復旧可能なルームID */
  activeRoomId: string | null;
  /** 現在のゲーム状態 */
  gameState: GameState | null;
  /** 現在のプレイヤーID */
  playerId: string | null;
  /** 観戦者かどうか */
  isSpectator: boolean;
  /** エラーメッセージ */
  error: string | null;
  /** チャットメッセージ一覧 */
  chatMessages: ChatMessage[];
  /** AIの思考（つぶやき）一覧 */
  aiThinkings: AIThinking[];
  /** 公開ルーム一覧 */
  publicRooms: RoomInfo[];
  /** 保存されたセッション情報（後方互換性） */
  savedSession: SessionInfo | null;
  /** ログイン */
  login: (username: string, password: string) => void;
  /** ログアウト */
  logout: () => void;
  /** ルームを作成（ログイン後に使用） */
  createRoom: (data: {
    roomName: string;
    isPublic: boolean;
    password?: string;
  }) => void;
  /** ルームに参加（ログイン後に使用） */
  joinRoom: (roomId: string, password?: string) => void;
  /** ルームに再参加（セッション復旧用、ログイン後に使用） */
  rejoinRoom: (roomId: string) => void;
  /** ルームから退出 */
  leaveRoom: () => void;
  /** 席に着く（観戦者→プレイヤー） */
  takeSeat: () => void;
  /** 席を立つ（プレイヤー→観戦者） */
  leaveSeat: () => void;
  /** 公開ルーム一覧を取得 */
  fetchPublicRooms: () => void;
  /** ゲームアクションを送信 */
  sendAction: (action: Omit<GameAction, "roomId">) => void;
  /** チャットメッセージを送信 */
  sendChatMessage: (message: string) => void;
  /** ゲームをリセット（ホストのみ） */
  resetGame: () => void;
  /** 接続を再試行 */
  reconnect: () => void;
  /** 保存されたセッションをクリア */
  clearSavedSession: () => void;
  /** CPUプレイヤーを追加（ホストのみ） */
  addCpuPlayer: () => void;
  /** CPUプレイヤーを削除（ホストのみ） */
  removeCpuPlayer: (cpuPlayerId: string) => void;
}

// ============================================
// 定数
// ============================================

const DEFAULT_SERVER_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

const SESSION_STORAGE_KEY = "catado_session";
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24時間

// ============================================
// セッション管理ヘルパー
// ============================================

function saveSession(session: SessionInfo): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }
}

function loadSession(): SessionInfo | null {
  if (typeof window === "undefined") return null;

  const stored = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) return null;

  try {
    const session = JSON.parse(stored) as SessionInfo;
    // 有効期限チェック
    if (Date.now() - session.timestamp > SESSION_EXPIRY_MS) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function clearSession(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loggedInUsername, setLoggedInUsername] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [aiThinkings, setAiThinkings] = useState<AIThinking[]>([]);
  const [publicRooms, setPublicRooms] = useState<RoomInfo[]>([]);
  const [savedSession, setSavedSession] = useState<SessionInfo | null>(null);

  // Ref でソケットインスタンスと現在のルームIDを保持
  const socketRef = useRef<GameSocket | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const playerNameRef = useRef<string | null>(null);

  // 初回マウント時にセッション情報を読み込み（後方互換性のため残す）
  useEffect(() => {
    const session = loadSession();
    setSavedSession(session);
  }, []);

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
    // ログインイベントハンドラー
    // ============================================

    socket.on("login_result", (data) => {
      console.log("[useGameSocket] Login result:", data);

      if (data.success && data.playerId && data.username) {
        setPlayerId(data.playerId);
        setLoggedInUsername(data.username);
        setIsLoggedIn(true);
        setActiveRoomId(data.activeRoomId || null);
        setError(null);
        playerNameRef.current = data.username;
      } else {
        setError(data.error || "ログインに失敗しました");
        setIsLoggedIn(false);
      }
    });

    // ============================================
    // ゲームイベントハンドラー
    // ============================================

    socket.on("room_created", (data) => {
      console.log("[useGameSocket] Room created:", data);

      if (data.success && data.gameState) {
        setPlayerId(data.playerId);
        setGameState(data.gameState);
        setIsSpectator(data.isSpectator); // ルーム作成者も最初は観戦者
        roomIdRef.current = data.roomId;
        setActiveRoomId(null); // ルームに参加したのでアクティブルーム表示をクリア
        setError(null);
        // セッション情報を保存（後方互換性のため）
        const player = data.gameState.players.find(p => p.id === data.playerId);
        const spectator = data.gameState.spectators.find(s => s.id === data.playerId);
        const playerName = player?.name || spectator?.name || "";
        playerNameRef.current = playerName;
        saveSession({
          roomId: data.roomId,
          playerId: data.playerId,
          playerName,
          timestamp: Date.now(),
        });
        setSavedSession(null);
      } else {
        setError(data.error || "ルームの作成に失敗しました");
      }
    });

    socket.on("room_joined", (data) => {
      console.log("[useGameSocket] Room joined:", data);

      if (data.success && data.gameState) {
        setPlayerId(data.playerId);
        setGameState(data.gameState);
        setIsSpectator(data.isSpectator); // 観戦者かどうかを設定
        roomIdRef.current = data.roomId;
        setActiveRoomId(null); // ルームに参加したのでアクティブルーム表示をクリア
        setError(null);
        // セッション情報を保存（後方互換性のため）
        const player = data.gameState.players.find(p => p.id === data.playerId);
        const spectator = data.gameState.spectators.find(s => s.id === data.playerId);
        const playerName = player?.name || spectator?.name || "";
        playerNameRef.current = playerName;
        saveSession({
          roomId: data.roomId,
          playerId: data.playerId,
          playerName,
          timestamp: Date.now(),
        });
        setSavedSession(null);
      } else {
        setError(data.error || "ルームへの参加に失敗しました");
      }
    });

    socket.on("room_rejoined", (data) => {
      console.log("[useGameSocket] Room rejoined:", data);

      if (data.success && data.gameState) {
        setPlayerId(data.playerId);
        setGameState(data.gameState);
        setIsSpectator(data.isSpectator); // 観戦者かどうかを設定
        roomIdRef.current = data.roomId;
        setActiveRoomId(null); // ルームに参加したのでアクティブルーム表示をクリア
        setError(null);
        // セッション情報を更新（後方互換性のため）
        const player = data.gameState.players.find(p => p.id === data.playerId);
        const spectator = data.gameState.spectators.find(s => s.id === data.playerId);
        const playerName = player?.name || spectator?.name || "";
        playerNameRef.current = playerName;
        saveSession({
          roomId: data.roomId,
          playerId: data.playerId,
          playerName,
          timestamp: Date.now(),
        });
        setSavedSession(null);
      } else {
        setError(data.error || "ルームへの再接続に失敗しました");
        // 再接続失敗したらセッション情報をクリア
        clearSession();
        setSavedSession(null);
        setActiveRoomId(null);
      }
    });

    socket.on("player_reconnected", (data) => {
      console.log("[useGameSocket] Player reconnected:", data.playerName);
    });

    socket.on("seat_changed", (data) => {
      console.log("[useGameSocket] Seat changed:", data);

      if (data.success) {
        setIsSpectator(data.isSpectator);
        setError(null);
      } else {
        setError(data.error || "席の変更に失敗しました");
        // エラーを3秒後にクリア
        setTimeout(() => setError(null), 3000);
      }
    });

    socket.on("game_reset", (data) => {
      console.log("[useGameSocket] Game reset");
      setGameState(data.gameState);
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

    socket.on("cpu_player_added", (data) => {
      console.log("[useGameSocket] CPU player added:", data);
      if (!data.success) {
        setError(data.error || "CPUプレイヤーの追加に失敗しました");
        setTimeout(() => setError(null), 3000);
      }
    });

    socket.on("cpu_player_removed", (data) => {
      console.log("[useGameSocket] CPU player removed:", data);
      if (!data.success) {
        setError(data.error || "CPUプレイヤーの削除に失敗しました");
        setTimeout(() => setError(null), 3000);
      }
    });

    socket.on("ai_thinking", (data) => {
      console.log("[useGameSocket] AI thinking:", data.thinking);
      setAiThinkings((prev) => [...prev, data]);
    });

    socketRef.current = socket;
    return socket;
  }, [serverUrl]);

  // ============================================
  // アクション関数
  // ============================================

  /**
   * ログイン
   */
  const login = useCallback(
    (username: string, password: string) => {
      const socket = initializeSocket();

      if (!socket.connected) {
        socket.once("connect", () => {
          socket.emit("login", { username, password });
        });
      } else {
        socket.emit("login", { username, password });
      }
    },
    [initializeSocket]
  );

  /**
   * ログアウト
   */
  const logout = useCallback(() => {
    setIsLoggedIn(false);
    setLoggedInUsername(null);
    setActiveRoomId(null);
    setPlayerId(null);
    setGameState(null);
    setIsSpectator(false);
    setChatMessages([]);
    setAiThinkings([]);
    roomIdRef.current = null;
    playerNameRef.current = null;
    clearSession();
    setSavedSession(null);
  }, []);

  /**
   * ルームを作成（ログイン後に使用）
   */
  const createRoom = useCallback(
    (data: {
      roomName: string;
      isPublic: boolean;
      password?: string;
    }) => {
      if (!socketRef.current) {
        setError("サーバーに接続されていません");
        return;
      }
      if (!isLoggedIn) {
        setError("ログインしてください");
        return;
      }

      socketRef.current.emit("create_room", data);
    },
    [isLoggedIn]
  );

  /**
   * ルームに参加（ログイン後に使用）
   */
  const joinRoom = useCallback(
    (roomId: string, password?: string) => {
      if (!socketRef.current) {
        setError("サーバーに接続されていません");
        return;
      }
      if (!isLoggedIn) {
        setError("ログインしてください");
        return;
      }

      socketRef.current.emit("join_room", { roomId, password });
    },
    [isLoggedIn]
  );

  /**
   * ルームに再参加（セッション復旧用、ログイン後に使用）
   */
  const rejoinRoom = useCallback(
    (roomId: string) => {
      if (!socketRef.current) {
        setError("サーバーに接続されていません");
        return;
      }
      if (!isLoggedIn) {
        setError("ログインしてください");
        return;
      }

      socketRef.current.emit("rejoin_room", { roomId });
    },
    [isLoggedIn]
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
    // playerId は維持（ログインセッション継続）
    setIsSpectator(false);
    setChatMessages([]);
    setAiThinkings([]);
    roomIdRef.current = null;
    // セッション情報をクリア（後方互換性のため）
    clearSession();
    setSavedSession(null);
  }, []);

  /**
   * 席に着く（観戦者→プレイヤー）
   */
  const takeSeat = useCallback(() => {
    if (!socketRef.current || !roomIdRef.current) {
      setError("サーバーに接続されていません");
      return;
    }

    socketRef.current.emit("take_seat", { roomId: roomIdRef.current });
  }, []);

  /**
   * 席を立つ（プレイヤー→観戦者）
   */
  const leaveSeat = useCallback(() => {
    if (!socketRef.current || !roomIdRef.current) {
      setError("サーバーに接続されていません");
      return;
    }

    socketRef.current.emit("leave_seat", { roomId: roomIdRef.current });
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
   * ゲームをリセット（ホストのみ）
   */
  const resetGame = useCallback(() => {
    if (!socketRef.current || !roomIdRef.current) {
      setError("サーバーに接続されていません");
      return;
    }

    socketRef.current.emit("reset_game", { roomId: roomIdRef.current });
  }, []);

  /**
   * 保存されたセッションをクリア
   */
  const clearSavedSession = useCallback(() => {
    clearSession();
    setSavedSession(null);
  }, []);

  /**
   * CPUプレイヤーを追加（ホストのみ）
   */
  const addCpuPlayer = useCallback(() => {
    if (!socketRef.current || !roomIdRef.current) {
      setError("サーバーに接続されていません");
      return;
    }

    socketRef.current.emit("add_cpu_player", { roomId: roomIdRef.current });
  }, []);

  /**
   * CPUプレイヤーを削除（ホストのみ）
   */
  const removeCpuPlayer = useCallback((cpuPlayerId: string) => {
    if (!socketRef.current || !roomIdRef.current) {
      setError("サーバーに接続されていません");
      return;
    }

    socketRef.current.emit("remove_cpu_player", {
      roomId: roomIdRef.current,
      playerId: cpuPlayerId,
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
    isLoggedIn,
    loggedInUsername,
    activeRoomId,
    gameState,
    playerId,
    isSpectator,
    error,
    chatMessages,
    aiThinkings,
    publicRooms,
    savedSession,
    login,
    logout,
    createRoom,
    joinRoom,
    rejoinRoom,
    leaveRoom,
    takeSeat,
    leaveSeat,
    fetchPublicRooms,
    sendAction,
    sendChatMessage,
    resetGame,
    reconnect,
    clearSavedSession,
    addCpuPlayer,
    removeCpuPlayer,
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
