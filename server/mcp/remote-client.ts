/**
 * リモートゲームサーバーに接続するSocket.ioクライアント
 * AIが人間プレイヤーと対戦できるようにする
 */

import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  GameState,
  GameAction,
  RoomInfo,
  ChatMessage,
  HoldableResource,
} from "@/types/game";
import { BUILD_COSTS } from "@/types/game";

// ============================================
// 型定義
// ============================================

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface RemoteGameInfo {
  roomId: string;
  playerId: string;
  playerName: string;
  isSpectator: boolean;
  state: GameState | null;
}

export interface AvailableAction {
  type: string;
  description: string;
  params?: Record<string, unknown>;
}

// ============================================
// リモートクライアントクラス
// ============================================

class RemoteClient {
  private socket: GameSocket | null = null;
  private serverUrl: string = "http://localhost:3001";
  private currentGame: RemoteGameInfo | null = null;
  private publicRooms: RoomInfo[] = [];
  private chatMessages: ChatMessage[] = [];
  private isLoggedIn: boolean = false;
  private loggedInUsername: string | null = null;

  // Promise resolvers for async operations
  private loginResolver: ((result: {
    success: boolean;
    playerId?: string;
    error?: string;
  }) => void) | null = null;
  private roomResolver: ((result: {
    success: boolean;
    roomId?: string;
    error?: string;
  }) => void) | null = null;
  private actionResolver: ((result: {
    success: boolean;
    error?: string;
  }) => void) | null = null;

  /**
   * サーバーに接続
   */
  connect(serverUrl?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (serverUrl) {
        this.serverUrl = serverUrl;
      }

      if (this.socket?.connected) {
        resolve();
        return;
      }

      this.socket = io(this.serverUrl, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on("connect", () => {
        this.setupEventListeners();
        resolve();
      });

      this.socket.on("connect_error", (error) => {
        reject(new Error(`Connection failed: ${error.message}`));
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.socket?.connected) {
          reject(new Error("Connection timeout"));
        }
      }, 10000);
    });
  }

  /**
   * 接続を切断
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentGame = null;
    this.isLoggedIn = false;
    this.loggedInUsername = null;
  }

  /**
   * 接続状態を取得
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * イベントリスナーをセットアップ
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // ログイン結果
    this.socket.on("login_result", (data) => {
      if (this.loginResolver) {
        if (data.success && data.playerId) {
          this.isLoggedIn = true;
          this.loggedInUsername = data.username || null;
        }
        this.loginResolver({
          success: data.success,
          playerId: data.playerId,
          error: data.error,
        });
        this.loginResolver = null;
      }
    });

    // ルーム作成結果
    this.socket.on("room_created", (data) => {
      if (this.roomResolver) {
        if (data.success) {
          this.currentGame = {
            roomId: data.roomId,
            playerId: data.playerId,
            playerName: this.loggedInUsername || "AI Player",
            isSpectator: data.isSpectator,
            state: data.gameState,
          };
        }
        this.roomResolver({
          success: data.success,
          roomId: data.roomId,
          error: data.error,
        });
        this.roomResolver = null;
      }
    });

    // ルーム参加結果
    this.socket.on("room_joined", (data) => {
      if (this.roomResolver) {
        if (data.success) {
          this.currentGame = {
            roomId: data.roomId,
            playerId: data.playerId,
            playerName: this.loggedInUsername || "AI Player",
            isSpectator: data.isSpectator,
            state: data.gameState,
          };
        }
        this.roomResolver({
          success: data.success,
          roomId: data.roomId,
          error: data.error,
        });
        this.roomResolver = null;
      }
    });

    // 席変更結果
    this.socket.on("seat_changed", (data) => {
      if (data.success && this.currentGame) {
        this.currentGame.isSpectator = data.isSpectator;
      }
    });

    // ゲーム状態更新
    this.socket.on("update_state", (data) => {
      if (this.currentGame) {
        this.currentGame.state = data.gameState;
      }
    });

    // アクション結果
    this.socket.on("action_result", (data) => {
      if (this.actionResolver) {
        this.actionResolver({
          success: data.success,
          error: data.error,
        });
        this.actionResolver = null;
      }
    });

    // 公開ルーム一覧
    this.socket.on("public_rooms", (data) => {
      this.publicRooms = data.rooms;
    });

    // チャット受信
    this.socket.on("chat_received", (data) => {
      this.chatMessages.push({
        id: `chat_${Date.now()}`,
        playerId: data.playerId,
        playerName: data.playerName,
        message: data.message,
        timestamp: data.timestamp,
      });
      // 最新100件のみ保持
      if (this.chatMessages.length > 100) {
        this.chatMessages = this.chatMessages.slice(-100);
      }
    });

    // エラー
    this.socket.on("error", (data) => {
      console.error("Server error:", data.message);
    });
  }

  /**
   * ログイン
   */
  login(username: string, password: string): Promise<{
    success: boolean;
    playerId?: string;
    error?: string;
  }> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected to server"));
        return;
      }

      this.loginResolver = resolve;
      this.socket.emit("login", { username, password });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.loginResolver) {
          this.loginResolver = null;
          reject(new Error("Login timeout"));
        }
      }, 10000);
    });
  }

  /**
   * 公開ルーム一覧を取得
   */
  fetchPublicRooms(): Promise<RoomInfo[]> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected to server"));
        return;
      }

      const handler = (data: { rooms: RoomInfo[] }) => {
        resolve(data.rooms);
      };

      this.socket.once("public_rooms", handler);
      this.socket.emit("get_public_rooms");

      setTimeout(() => {
        this.socket?.off("public_rooms", handler);
        resolve(this.publicRooms);
      }, 5000);
    });
  }

  /**
   * ルームを作成
   */
  createRoom(roomName: string, isPublic: boolean = true, password?: string): Promise<{
    success: boolean;
    roomId?: string;
    error?: string;
  }> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected to server"));
        return;
      }

      if (!this.isLoggedIn) {
        reject(new Error("Not logged in"));
        return;
      }

      this.roomResolver = resolve;
      this.socket.emit("create_room", { roomName, isPublic, password });

      setTimeout(() => {
        if (this.roomResolver) {
          this.roomResolver = null;
          reject(new Error("Create room timeout"));
        }
      }, 10000);
    });
  }

  /**
   * ルームに参加
   */
  joinRoom(roomId: string, password?: string): Promise<{
    success: boolean;
    roomId?: string;
    error?: string;
  }> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected to server"));
        return;
      }

      if (!this.isLoggedIn) {
        reject(new Error("Not logged in"));
        return;
      }

      this.roomResolver = resolve;
      this.socket.emit("join_room", { roomId, password });

      setTimeout(() => {
        if (this.roomResolver) {
          this.roomResolver = null;
          reject(new Error("Join room timeout"));
        }
      }, 10000);
    });
  }

  /**
   * ルームから退出
   */
  leaveRoom(): void {
    if (!this.socket?.connected || !this.currentGame) return;

    this.socket.emit("leave_room", { roomId: this.currentGame.roomId });
    this.currentGame = null;
  }

  /**
   * 席に着く
   */
  takeSeat(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected || !this.currentGame) {
        reject(new Error("Not in a room"));
        return;
      }

      const handler = (data: {
        success: boolean;
        isSpectator: boolean;
        error?: string;
      }) => {
        if (data.success) {
          this.currentGame!.isSpectator = data.isSpectator;
        }
        resolve({ success: data.success, error: data.error });
      };

      this.socket.once("seat_changed", handler);
      this.socket.emit("take_seat", { roomId: this.currentGame.roomId });

      setTimeout(() => {
        this.socket?.off("seat_changed", handler);
        reject(new Error("Take seat timeout"));
      }, 10000);
    });
  }

  /**
   * ゲームアクションを送信
   */
  sendAction(action: Omit<GameAction, "roomId">): Promise<{
    success: boolean;
    error?: string;
  }> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected || !this.currentGame) {
        reject(new Error("Not in a room"));
        return;
      }

      this.actionResolver = resolve;
      const fullAction = {
        ...action,
        roomId: this.currentGame.roomId,
      } as GameAction;

      this.socket.emit("game_action", fullAction);

      setTimeout(() => {
        if (this.actionResolver) {
          this.actionResolver = null;
          reject(new Error("Action timeout"));
        }
      }, 10000);
    });
  }

  /**
   * チャットメッセージを送信
   */
  sendChat(message: string): void {
    if (!this.socket?.connected || !this.currentGame) return;

    this.socket.emit("chat_message", {
      roomId: this.currentGame.roomId,
      message,
    });
  }

  /**
   * 現在のゲーム情報を取得
   */
  getCurrentGame(): RemoteGameInfo | null {
    return this.currentGame;
  }

  /**
   * ゲーム状態を取得
   */
  getGameState(): GameState | null {
    return this.currentGame?.state ?? null;
  }

  /**
   * 状態更新を待機（ポーリング）
   */
  waitForStateUpdate(timeoutMs: number = 30000): Promise<GameState> {
    return new Promise((resolve, reject) => {
      if (!this.currentGame) {
        reject(new Error("Not in a room"));
        return;
      }

      const startState = JSON.stringify(this.currentGame.state);

      const checkInterval = setInterval(() => {
        if (this.currentGame?.state) {
          const currentState = JSON.stringify(this.currentGame.state);
          if (currentState !== startState) {
            clearInterval(checkInterval);
            resolve(this.currentGame.state);
          }
        }
      }, 500);

      setTimeout(() => {
        clearInterval(checkInterval);
        if (this.currentGame?.state) {
          resolve(this.currentGame.state);
        } else {
          reject(new Error("State update timeout"));
        }
      }, timeoutMs);
    });
  }

  /**
   * 自分のターンまで待機
   */
  async waitForMyTurn(timeoutMs: number = 300000): Promise<GameState> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const state = this.currentGame?.state;
      if (!state) {
        throw new Error("Not in a game");
      }

      if (state.phase === "game_over") {
        return state;
      }

      if (state.currentPlayerId === this.currentGame?.playerId) {
        return state;
      }

      // discardフェーズで自分が破棄する必要があるかチェック
      if (state.phase === "discard") {
        const myPlayer = state.players.find(
          (p) => p.id === this.currentGame?.playerId
        );
        if (myPlayer) {
          const totalResources = Object.values(myPlayer.resources).reduce(
            (a, b) => a + b,
            0
          );
          if (totalResources > 7) {
            return state;
          }
        }
      }

      // 500ms待機
      await new Promise((r) => setTimeout(r, 500));
    }

    throw new Error("Wait for my turn timeout");
  }

  /**
   * 実行可能なアクションを取得
   */
  getAvailableActions(): AvailableAction[] {
    const state = this.currentGame?.state;
    if (!state) return [];

    const playerId = this.currentGame?.playerId;
    if (!playerId) return [];

    const isMyTurn = state.currentPlayerId === playerId;
    const player = state.players.find((p) => p.id === playerId);

    if (!player) return [];

    const actions: AvailableAction[] = [];

    switch (state.phase) {
      case "waiting":
        if (state.players.length >= 3 && state.hostId === playerId) {
          actions.push({
            type: "start_game",
            description: "ゲームを開始する",
          });
        }
        break;

      case "setup_settlement_1":
      case "setup_settlement_2":
        if (isMyTurn) {
          actions.push({
            type: "build_settlement",
            description: "開拓地を建設する（初期配置）",
          });
        }
        break;

      case "setup_road_1":
      case "setup_road_2":
        if (isMyTurn) {
          actions.push({
            type: "build_road",
            description: "道を建設する（初期配置）",
          });
        }
        break;

      case "roll_dice":
        if (isMyTurn) {
          actions.push({
            type: "roll_dice",
            description: "サイコロを振る",
          });
        }
        break;

      case "discard":
        const totalResources = Object.values(player.resources).reduce(
          (a, b) => a + b,
          0
        );
        if (totalResources > 7) {
          const discardCount = Math.floor(totalResources / 2);
          actions.push({
            type: "discard_resources",
            description: `資源を${discardCount}枚破棄する`,
            params: {
              currentResources: player.resources,
              discardCount,
            },
          });
        }
        break;

      case "robber_move":
        if (isMyTurn) {
          actions.push({
            type: "move_robber",
            description: "盗賊を移動する",
          });
        }
        break;

      case "robber_steal":
        if (isMyTurn) {
          actions.push({
            type: "steal_resource",
            description: "資源を奪う対象を選ぶ",
          });
        }
        break;

      case "road_building_1":
      case "road_building_2":
        if (isMyTurn) {
          actions.push({
            type: "build_road",
            description: "道を建設する（街道建設カード）",
          });
        }
        break;

      case "main":
        if (isMyTurn) {
          // 建設アクション
          if (this.canBuild(player, "settlement")) {
            actions.push({
              type: "build_settlement",
              description: "開拓地を建設する",
              params: { cost: BUILD_COSTS.settlement },
            });
          }
          if (this.canBuild(player, "city")) {
            actions.push({
              type: "build_city",
              description: "都市を建設する",
              params: { cost: BUILD_COSTS.city },
            });
          }
          if (this.canBuild(player, "road")) {
            actions.push({
              type: "build_road",
              description: "道を建設する",
              params: { cost: BUILD_COSTS.road },
            });
          }
          if (
            this.canBuild(player, "developmentCard") &&
            state.developmentCardDeckCount > 0
          ) {
            actions.push({
              type: "buy_development_card",
              description: "発展カードを購入する",
              params: { cost: BUILD_COSTS.developmentCard },
            });
          }

          // 発展カード使用
          const usableCards = player.developmentCards.filter(
            (card) =>
              !state.cardsBoughtThisTurn.includes(card) &&
              card !== "victoryPoint"
          );
          if (usableCards.length > 0) {
            actions.push({
              type: "use_development_card",
              description: "発展カードを使用する",
              params: { availableCards: [...new Set(usableCards)] },
            });
          }

          // 銀行交易
          actions.push({
            type: "trade_with_bank",
            description: "銀行と交易する",
          });

          // ターン終了
          actions.push({
            type: "end_turn",
            description: "ターンを終了する",
          });
        }
        break;
    }

    return actions;
  }

  private canBuild(
    player: { resources: Record<HoldableResource, number>; remainingPieces: { settlements: number; cities: number; roads: number } },
    type: "settlement" | "city" | "road" | "developmentCard"
  ): boolean {
    const cost = BUILD_COSTS[type];
    for (const [resource, amount] of Object.entries(cost)) {
      if (player.resources[resource as HoldableResource] < (amount as number)) {
        return false;
      }
    }

    if (type === "settlement" && player.remainingPieces.settlements <= 0) {
      return false;
    }
    if (type === "city" && player.remainingPieces.cities <= 0) {
      return false;
    }
    if (type === "road" && player.remainingPieces.roads <= 0) {
      return false;
    }

    return true;
  }
}

// シングルトンインスタンス
export const remoteClient = new RemoteClient();
