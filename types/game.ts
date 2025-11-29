/**
 * カタン風ボードゲームの型定義
 * 六角形グリッド（Hex Grid）をキューブ座標系で表現
 */

// ============================================
// 基本座標系
// ============================================

/**
 * キューブ座標系（q + r + s = 0 の制約を持つ）
 * 六角形グリッドを表現するのに最適な座標系
 */
export interface CubeCoordinate {
  q: number;
  r: number;
  s: number;
}

/**
 * 頂点（Intersection）の位置を示す座標
 * 隣接する3つの六角形の中心座標と、頂点の向き
 */
export interface VertexCoordinate {
  // 基準となる六角形の座標
  hex: CubeCoordinate;
  // 頂点の向き: 'N' = 北（上）, 'S' = 南（下）
  direction: "N" | "S";
}

/**
 * 辺（Edge）の位置を示す座標
 */
export interface EdgeCoordinate {
  // 基準となる六角形の座標
  hex: CubeCoordinate;
  // 辺の向き: 'NE' = 北東, 'E' = 東, 'SE' = 南東
  direction: "NE" | "E" | "SE";
}

// ============================================
// 資源・建造物タイプ
// ============================================

/**
 * 六角形タイルの資源タイプ
 */
export type ResourceType =
  | "wood" // 森林 → 木材
  | "brick" // 丘陵 → レンガ
  | "wheat" // 畑 → 小麦
  | "ore" // 山地 → 鉱石
  | "sheep" // 牧草地 → 羊毛
  | "desert"; // 砂漠（資源なし）

/**
 * プレイヤーが保持できる資源（砂漠を除く）
 */
export type HoldableResource = Exclude<ResourceType, "desert">;

/**
 * 建造物タイプ
 */
export type BuildingType = "settlement" | "city";

/**
 * 道のタイプ（現時点では単一）
 */
export type RoadType = "road";

// ============================================
// ゲーム要素
// ============================================

/**
 * 六角形タイル（Hex）
 */
export interface Hex {
  id: string;
  coordinate: CubeCoordinate;
  resourceType: ResourceType;
  // 数値トークン（2-12、砂漠は null）
  numberToken: number | null;
  // 盗賊がいるかどうか
  hasRobber: boolean;
}

/**
 * 頂点（Intersection）- 開拓地・都市を配置する場所
 */
export interface Intersection {
  id: string;
  coordinate: VertexCoordinate;
  // 建造物情報（未建造の場合は null）
  building: {
    type: BuildingType;
    playerId: string;
  } | null;
  // 港（Port）情報
  port: Port | null;
}

/**
 * 辺（Edge）- 道を配置する場所
 */
export interface Edge {
  id: string;
  coordinate: EdgeCoordinate;
  // 道情報（未建造の場合は null）
  road: {
    playerId: string;
  } | null;
}

/**
 * 港（Port）
 */
export interface Port {
  // 交換レート（通常 3:1 または 2:1）
  ratio: number;
  // 特定資源用の港の場合はその資源、汎用港は null
  resourceType: HoldableResource | null;
}

// ============================================
// プレイヤー
// ============================================

/**
 * プレイヤーの色
 */
export type PlayerColor = "red" | "blue" | "orange" | "white";

/**
 * プレイヤーの資源保有状況
 */
export type PlayerResources = Record<HoldableResource, number>;

/**
 * 発展カードの種類
 */
export type DevelopmentCardType =
  | "knight" // 騎士
  | "victoryPoint" // 勝利点
  | "roadBuilding" // 街道建設
  | "yearOfPlenty" // 収穫
  | "monopoly"; // 独占

/**
 * プレイヤー情報
 */
export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  // 保有資源
  resources: PlayerResources;
  // 発展カード（非公開）
  developmentCards: DevelopmentCardType[];
  // 使用済み騎士カード数
  knightsPlayed: number;
  // 最長交易路を持っているか
  hasLongestRoad: boolean;
  // 最大騎士力を持っているか
  hasLargestArmy: boolean;
  // 勝利点（公開分のみ）
  visibleVictoryPoints: number;
  // 残り建造物数
  remainingPieces: {
    settlements: number;
    cities: number;
    roads: number;
  };
  // 接続状態
  isConnected: boolean;
}

// ============================================
// ゲーム状態
// ============================================

/**
 * ゲームフェーズ
 */
export type GamePhase =
  | "waiting" // プレイヤー待機中
  | "setup_settlement_1" // 初期配置1（開拓地）
  | "setup_road_1" // 初期配置1（道）
  | "setup_settlement_2" // 初期配置2（開拓地、逆順）
  | "setup_road_2" // 初期配置2（道）
  | "roll_dice" // サイコロを振る
  | "main" // メインフェーズ（建設、交易など）
  | "robber_move" // 盗賊移動（7が出た時）
  | "robber_steal" // 盗賊による資源略奪
  | "discard" // 資源破棄（7が出た時、8枚以上持っている場合）
  | "trade_offer" // 交易提案中
  | "game_over"; // ゲーム終了

/**
 * サイコロの結果
 */
export interface DiceResult {
  die1: number;
  die2: number;
  total: number;
}

/**
 * 交易提案
 */
export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  // 提供する資源
  offering: Partial<PlayerResources>;
  // 要求する資源
  requesting: Partial<PlayerResources>;
  // 各プレイヤーの応答状態
  responses: Record<string, "pending" | "accepted" | "rejected">;
}

/**
 * ゲーム全体の状態
 */
export interface GameState {
  // ゲームID（ルームID）
  id: string;
  // ホスト（ルーム作成者）のプレイヤーID
  hostId: string;
  // ゲームフェーズ
  phase: GamePhase;
  // 六角形タイル一覧
  hexes: Hex[];
  // 頂点一覧
  intersections: Intersection[];
  // 辺一覧
  edges: Edge[];
  // プレイヤー一覧
  players: Player[];
  // 現在のターンのプレイヤーID
  currentPlayerId: string | null;
  // ターン順のプレイヤーID配列
  turnOrder: string[];
  // 現在のターン番号
  turnNumber: number;
  // サイコロの結果（振った後のみ）
  diceResult: DiceResult | null;
  // 進行中の交易提案
  activeTradeOffer: TradeOffer | null;
  // 発展カードデッキ（シャッフル済み）
  developmentCardDeck: DevelopmentCardType[];
  // 残り発展カードデッキ枚数
  developmentCardDeckCount: number;
  // このターンに購入したカード（使用不可）
  cardsBoughtThisTurn: string[];
  // 最長交易路保持者のプレイヤーID
  longestRoadPlayerId: string | null;
  // 最大騎士力保持者のプレイヤーID
  largestArmyPlayerId: string | null;
  // 勝者（ゲーム終了時のみ）
  winnerId: string | null;
  // 作成日時
  createdAt: string;
  // 最終更新日時
  updatedAt: string;
}

// ============================================
// Socket通信イベント
// ============================================

/**
 * クライアント → サーバー のイベント
 */
export interface ClientToServerEvents {
  // ルーム作成
  create_room: (data: {
    playerName: string;
    roomName: string;
    isPublic: boolean;
    password?: string;
  }) => void;
  // ルーム参加
  join_room: (data: {
    roomId: string;
    playerName: string;
    password?: string;
  }) => void;
  // ルーム再参加（再接続用）
  rejoin_room: (data: {
    roomId: string;
    playerId: string;
  }) => void;
  // ルーム退出
  leave_room: (data: { roomId: string }) => void;
  // 公開ルーム一覧取得
  get_public_rooms: () => void;
  // ゲームアクション
  game_action: (data: GameAction) => void;
  // チャットメッセージ送信
  chat_message: (data: { roomId: string; message: string }) => void;
  // ゲームリセット（ホストのみ）
  reset_game: (data: { roomId: string }) => void;
}

/**
 * サーバー → クライアント のイベント
 */
export interface ServerToClientEvents {
  // ルーム作成結果
  room_created: (data: {
    success: boolean;
    roomId: string;
    playerId: string;
    gameState: GameState | null;
    error?: string;
  }) => void;
  // ルーム参加結果
  room_joined: (data: {
    success: boolean;
    roomId: string;
    playerId: string;
    gameState: GameState | null;
    error?: string;
  }) => void;
  // ルーム再参加結果
  room_rejoined: (data: {
    success: boolean;
    roomId: string;
    playerId: string;
    gameState: GameState | null;
    error?: string;
  }) => void;
  // 公開ルーム一覧
  public_rooms: (data: { rooms: RoomInfo[] }) => void;
  // ゲーム状態更新
  update_state: (data: { gameState: GameState }) => void;
  // プレイヤー参加通知
  player_joined: (data: { player: Player }) => void;
  // プレイヤー退出通知
  player_left: (data: { playerId: string }) => void;
  // プレイヤー再接続通知
  player_reconnected: (data: { playerId: string; playerName: string }) => void;
  // アクション結果通知
  action_result: (data: {
    success: boolean;
    action: GameActionType;
    error?: string;
  }) => void;
  // チャットメッセージ受信
  chat_received: (data: {
    playerId: string;
    playerName: string;
    message: string;
    timestamp: string;
  }) => void;
  // ゲームリセット通知
  game_reset: (data: { gameState: GameState }) => void;
  // エラー通知
  error: (data: { message: string; code: string }) => void;
}

// ============================================
// ゲームアクション
// ============================================

/**
 * ゲームアクションの種類
 */
export type GameActionType =
  | "start_game" // ゲーム開始
  | "roll_dice" // サイコロを振る
  | "build_settlement" // 開拓地建設
  | "build_city" // 都市建設
  | "build_road" // 道建設
  | "buy_development_card" // 発展カード購入
  | "use_development_card" // 発展カード使用
  | "move_robber" // 盗賊移動
  | "steal_resource" // 資源略奪
  | "discard_resources" // 資源破棄
  | "propose_trade" // 交易提案
  | "respond_to_trade" // 交易応答
  | "trade_with_bank" // 銀行交易
  | "end_turn"; // ターン終了

/**
 * ゲームアクション（Union型）
 */
export type GameAction =
  | { type: "start_game"; roomId: string }
  | { type: "roll_dice"; roomId: string }
  | {
      type: "build_settlement";
      roomId: string;
      intersectionId: string;
    }
  | { type: "build_city"; roomId: string; intersectionId: string }
  | { type: "build_road"; roomId: string; edgeId: string }
  | { type: "buy_development_card"; roomId: string }
  | {
      type: "use_development_card";
      roomId: string;
      cardType: DevelopmentCardType;
      // カード固有のパラメータ
      params?: {
        // 騎士カード: 盗賊移動先
        targetHexId?: string;
        targetPlayerId?: string;
        // 収穫: 獲得する資源
        resources?: [HoldableResource, HoldableResource];
        // 独占: 指定資源
        resource?: HoldableResource;
        // 街道建設: 道の位置
        edgeIds?: [string, string];
      };
    }
  | {
      type: "move_robber";
      roomId: string;
      hexId: string;
    }
  | {
      type: "steal_resource";
      roomId: string;
      targetPlayerId: string;
    }
  | {
      type: "discard_resources";
      roomId: string;
      resources: Partial<PlayerResources>;
    }
  | {
      type: "propose_trade";
      roomId: string;
      offering: Partial<PlayerResources>;
      requesting: Partial<PlayerResources>;
    }
  | {
      type: "respond_to_trade";
      roomId: string;
      tradeId: string;
      response: "accept" | "reject";
    }
  | {
      type: "trade_with_bank";
      roomId: string;
      give: { resource: HoldableResource; amount: number };
      receive: HoldableResource;
    }
  | { type: "end_turn"; roomId: string };

// ============================================
// ユーティリティ型
// ============================================

/**
 * ルーム情報（ロビー表示用）
 */
export interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  status: "waiting" | "playing" | "finished";
  isPublic: boolean;
  hasPassword: boolean;
  hostId: string;
  hostName: string;
  createdAt: string;
}

/**
 * チャットメッセージ
 */
export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  message: string;
  timestamp: string;
}

/**
 * 建設コスト定義
 */
export const BUILD_COSTS: Record<
  "settlement" | "city" | "road" | "developmentCard",
  Partial<PlayerResources>
> = {
  settlement: { wood: 1, brick: 1, wheat: 1, sheep: 1 },
  city: { wheat: 2, ore: 3 },
  road: { wood: 1, brick: 1 },
  developmentCard: { wheat: 1, ore: 1, sheep: 1 },
} as const;

/**
 * 初期資源数（開拓地建設時）
 */
export const INITIAL_RESOURCES: PlayerResources = {
  wood: 0,
  brick: 0,
  wheat: 0,
  ore: 0,
  sheep: 0,
};

/**
 * プレイヤーの初期建造物数
 */
export const INITIAL_PIECES = {
  settlements: 5,
  cities: 4,
  roads: 15,
} as const;

/**
 * 勝利に必要な勝利点
 */
export const VICTORY_POINTS_TO_WIN = 10;
