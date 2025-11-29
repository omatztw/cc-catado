/**
 * ゲームロジック
 * ボード生成、アクション検証、状態更新などを担当
 */

import { v4 as uuidv4 } from "uuid";
import type {
  GameState,
  GameAction,
  GamePhase,
  Hex,
  Intersection,
  Edge,
  Player,
  PlayerColor,
  ResourceType,
  HoldableResource,
  CubeCoordinate,
  VertexCoordinate,
  EdgeCoordinate,
  DiceResult,
  PlayerResources,
  DevelopmentCardType,
  TradeOffer,
} from "@/types/game";
import {
  INITIAL_RESOURCES,
  INITIAL_PIECES,
} from "@/types/game";

// ============================================
// 定数
// ============================================

const PLAYER_COLORS: PlayerColor[] = ["red", "blue", "orange", "white"];

const RESOURCE_TYPES: ResourceType[] = [
  "wood",
  "brick",
  "wheat",
  "ore",
  "sheep",
  "desert",
];

// 標準的なカタンボードの資源タイル配置
const STANDARD_TERRAIN: ResourceType[] = [
  "wood",
  "wood",
  "wood",
  "wood",
  "brick",
  "brick",
  "brick",
  "wheat",
  "wheat",
  "wheat",
  "wheat",
  "ore",
  "ore",
  "ore",
  "sheep",
  "sheep",
  "sheep",
  "sheep",
  "desert",
];

// 標準的な数値トークン配置
const STANDARD_NUMBER_TOKENS = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

// 標準的な六角形のキューブ座標（中心からスパイラル状に配置）
const STANDARD_HEX_COORDS: CubeCoordinate[] = [
  // 中心
  { q: 0, r: 0, s: 0 },
  // 内側リング
  { q: 1, r: -1, s: 0 },
  { q: 1, r: 0, s: -1 },
  { q: 0, r: 1, s: -1 },
  { q: -1, r: 1, s: 0 },
  { q: -1, r: 0, s: 1 },
  { q: 0, r: -1, s: 1 },
  // 外側リング
  { q: 2, r: -2, s: 0 },
  { q: 2, r: -1, s: -1 },
  { q: 2, r: 0, s: -2 },
  { q: 1, r: 1, s: -2 },
  { q: 0, r: 2, s: -2 },
  { q: -1, r: 2, s: -1 },
  { q: -2, r: 2, s: 0 },
  { q: -2, r: 1, s: 1 },
  { q: -2, r: 0, s: 2 },
  { q: -1, r: -1, s: 2 },
  { q: 0, r: -2, s: 2 },
  { q: 1, r: -2, s: 1 },
];

// ボード上の有効な六角形座標のセット（検証用）
const VALID_HEX_IDS = new Set(STANDARD_HEX_COORDS.map(cubeToId));

// 港の配置（頂点IDと港情報のペア）
// カタン標準: 4つの3:1港、5つの2:1港（各資源1つ）
// 各港は隣接する2つの海岸頂点を指定（頂点は実際に辺で繋がっている必要あり）
const PORT_CONFIGURATIONS: {
  portId: string;
  vertexIds: string[];
  port: { ratio: number; resourceType: HoldableResource | null };
}[] = [
  // 3:1 汎用港 (4箇所) - 時計回りに配置
  { portId: "port-1", vertexIds: ["0,-2,2_N", "0,-3,3_S"], port: { ratio: 3, resourceType: null } },      // 上側
  { portId: "port-2", vertexIds: ["2,-2,0_N", "3,-3,0_S"], port: { ratio: 3, resourceType: null } },      // 右上
  { portId: "port-3", vertexIds: ["2,0,-2_S", "2,1,-3_N"], port: { ratio: 3, resourceType: null } },      // 右下
  { portId: "port-4", vertexIds: ["0,2,-2_S", "-1,3,-2_N"], port: { ratio: 3, resourceType: null } },     // 下側
  // 2:1 専門港 (5箇所)
  { portId: "port-ore", vertexIds: ["1,-2,1_N", "2,-3,1_S"], port: { ratio: 2, resourceType: "ore" } },   // 上右
  { portId: "port-wheat", vertexIds: ["-2,2,0_S", "-3,3,0_N"], port: { ratio: 2, resourceType: "wheat" } }, // 左下
  { portId: "port-sheep", vertexIds: ["1,1,-2_S", "1,2,-3_N"], port: { ratio: 2, resourceType: "sheep" } }, // 右下寄り
  { portId: "port-wood", vertexIds: ["-1,-1,2_N", "-1,-2,3_S"], port: { ratio: 2, resourceType: "wood" } }, // 左上
  { portId: "port-brick", vertexIds: ["-2,0,2_S", "-3,1,2_N"], port: { ratio: 2, resourceType: "brick" } }, // 左側
];

// 発展カードデッキの構成
const DEVELOPMENT_CARD_DECK: DevelopmentCardType[] = [
  // 騎士カード 14枚
  ...Array(14).fill("knight"),
  // 勝利点カード 5枚
  ...Array(5).fill("victoryPoint"),
  // 街道建設 2枚
  ...Array(2).fill("roadBuilding"),
  // 収穫 2枚
  ...Array(2).fill("yearOfPlenty"),
  // 独占 2枚
  ...Array(2).fill("monopoly"),
] as DevelopmentCardType[];

// ============================================
// ユーティリティ関数
// ============================================

/**
 * 配列をシャッフル（Fisher-Yates）
 */
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * キューブ座標を文字列IDに変換
 */
function cubeToId(coord: CubeCoordinate): string {
  return `${coord.q},${coord.r},${coord.s}`;
}

/**
 * 頂点座標を文字列IDに変換
 */
function vertexToId(coord: VertexCoordinate): string {
  return `${cubeToId(coord.hex)}_${coord.direction}`;
}

/**
 * 辺座標を文字列IDに変換
 */
function edgeToId(coord: EdgeCoordinate): string {
  return `${cubeToId(coord.hex)}_${coord.direction}`;
}

/**
 * 頂点に隣接する六角形座標を取得
 * 各頂点は最大3つの六角形に隣接
 */
function getAdjacentHexesForVertex(vertex: VertexCoordinate): CubeCoordinate[] {
  const { hex, direction } = vertex;
  if (direction === "N") {
    return [
      hex,
      { q: hex.q, r: hex.r - 1, s: hex.s + 1 },
      { q: hex.q + 1, r: hex.r - 1, s: hex.s },
    ];
  } else {
    // S
    return [
      hex,
      { q: hex.q, r: hex.r + 1, s: hex.s - 1 },
      { q: hex.q - 1, r: hex.r + 1, s: hex.s },
    ];
  }
}

/**
 * 頂点がボード上の有効な位置かどうかを確認
 * 少なくとも1つの有効な六角形に隣接している必要がある
 */
function isValidIntersection(vertex: VertexCoordinate): boolean {
  const adjacentHexes = getAdjacentHexesForVertex(vertex);
  return adjacentHexes.some((hex) => VALID_HEX_IDS.has(cubeToId(hex)));
}

/**
 * 頂点に隣接する頂点を取得（2マスルール検証用）
 */
function getAdjacentVertices(vertex: VertexCoordinate): VertexCoordinate[] {
  const { hex, direction } = vertex;
  if (direction === "N") {
    // N頂点（六角形の上）に隣接する3つの頂点
    return [
      // 右上コーナー（NE隣の下）
      { hex: { q: hex.q + 1, r: hex.r - 1, s: hex.s }, direction: "S" },
      // 左上コーナー（NW隣の下）
      { hex: { q: hex.q, r: hex.r - 1, s: hex.s + 1 }, direction: "S" },
      // NE隣とNW隣が共有する頂点（さらに上の頂点）
      { hex: { q: hex.q + 1, r: hex.r - 2, s: hex.s + 1 }, direction: "S" },
    ];
  } else {
    // S頂点（六角形の下）に隣接する3つの頂点
    return [
      // 右下コーナー（SE隣の上）
      { hex: { q: hex.q, r: hex.r + 1, s: hex.s - 1 }, direction: "N" },
      // 左下コーナー（SW隣の上）
      { hex: { q: hex.q - 1, r: hex.r + 1, s: hex.s }, direction: "N" },
      // SE隣とSW隣が共有する頂点（さらに下の頂点）
      { hex: { q: hex.q - 1, r: hex.r + 2, s: hex.s - 1 }, direction: "N" },
    ];
  }
}

/**
 * 頂点に隣接する辺を取得
 */
function getAdjacentEdgesForVertex(vertex: VertexCoordinate): EdgeCoordinate[] {
  const { hex, direction } = vertex;
  if (direction === "N") {
    return [
      { hex, direction: "NE" },
      { hex: { q: hex.q, r: hex.r - 1, s: hex.s + 1 }, direction: "E" },
      { hex: { q: hex.q, r: hex.r - 1, s: hex.s + 1 }, direction: "SE" },
    ];
  } else {
    // S
    return [
      { hex, direction: "SE" },
      { hex: { q: hex.q - 1, r: hex.r + 1, s: hex.s }, direction: "E" },
      { hex: { q: hex.q - 1, r: hex.r + 1, s: hex.s }, direction: "NE" },
    ];
  }
}

/**
 * 辺に隣接する頂点を取得
 */
function getAdjacentVerticesForEdge(edge: EdgeCoordinate): VertexCoordinate[] {
  const { hex, direction } = edge;
  switch (direction) {
    case "NE":
      // NE辺: N頂点（上）から右上コーナー（NE隣のS）へ
      return [
        { hex, direction: "N" },
        { hex: { q: hex.q + 1, r: hex.r - 1, s: hex.s }, direction: "S" },
      ];
    case "E":
      // E辺: 右上コーナー（NE隣のS）から右下コーナー（SE隣のN）へ
      return [
        { hex: { q: hex.q + 1, r: hex.r - 1, s: hex.s }, direction: "S" },
        { hex: { q: hex.q, r: hex.r + 1, s: hex.s - 1 }, direction: "N" },
      ];
    case "SE":
      // SE辺: 右下コーナー（SE隣のN）からS頂点（下）へ
      return [
        { hex: { q: hex.q, r: hex.r + 1, s: hex.s - 1 }, direction: "N" },
        { hex, direction: "S" },
      ];
    default:
      return [];
  }
}

/**
 * 頂点IDから座標を解析
 */
function parseVertexId(id: string): VertexCoordinate | null {
  const match = id.match(/^(-?\d+),(-?\d+),(-?\d+)_(N|S)$/);
  if (!match) return null;
  return {
    hex: { q: parseInt(match[1]), r: parseInt(match[2]), s: parseInt(match[3]) },
    direction: match[4] as "N" | "S",
  };
}

/**
 * 辺IDから座標を解析
 */
function parseEdgeId(id: string): EdgeCoordinate | null {
  const match = id.match(/^(-?\d+),(-?\d+),(-?\d+)_(NE|E|SE)$/);
  if (!match) return null;
  return {
    hex: { q: parseInt(match[1]), r: parseInt(match[2]), s: parseInt(match[3]) },
    direction: match[4] as "NE" | "E" | "SE",
  };
}

/**
 * サイコロを振る
 */
export function rollDice(): DiceResult {
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  return { die1, die2, total: die1 + die2 };
}

// ============================================
// ボード生成
// ============================================

/**
 * 六角形タイルを生成
 */
function generateHexes(): Hex[] {
  const terrains = shuffle(STANDARD_TERRAIN);
  const numberTokens = [...STANDARD_NUMBER_TOKENS];

  const hexes: Hex[] = [];
  let tokenIndex = 0;

  for (let i = 0; i < STANDARD_HEX_COORDS.length; i++) {
    const coord = STANDARD_HEX_COORDS[i];
    const terrain = terrains[i];
    const isDesert = terrain === "desert";

    hexes.push({
      id: cubeToId(coord),
      coordinate: coord,
      resourceType: terrain,
      numberToken: isDesert ? null : numberTokens[tokenIndex++],
      hasRobber: isDesert, // 砂漠に盗賊を初期配置
    });
  }

  return hexes;
}

/**
 * 六角形に隣接する頂点座標を取得
 */
function getHexVertices(hex: CubeCoordinate): VertexCoordinate[] {
  // pointy-top六角形の6つの頂点を正しく取得
  // 各頂点は (hex座標, N/S方向) で一意に表現される
  return [
    // 上 (Top)
    { hex, direction: "N" },
    // 下 (Bottom)
    { hex, direction: "S" },
    // 右上 (Upper-right): NE隣の下
    { hex: { q: hex.q + 1, r: hex.r - 1, s: hex.s }, direction: "S" },
    // 右下 (Lower-right): SE隣の上
    { hex: { q: hex.q, r: hex.r + 1, s: hex.s - 1 }, direction: "N" },
    // 左下 (Lower-left): SW隣の上
    { hex: { q: hex.q - 1, r: hex.r + 1, s: hex.s }, direction: "N" },
    // 左上 (Upper-left): NW隣の下
    { hex: { q: hex.q, r: hex.r - 1, s: hex.s + 1 }, direction: "S" },
  ];
}

/**
 * 六角形に隣接する辺座標を取得
 */
function getHexEdges(hex: CubeCoordinate): EdgeCoordinate[] {
  return [
    { hex, direction: "NE" },
    { hex, direction: "E" },
    { hex, direction: "SE" },
    { hex: { q: hex.q - 1, r: hex.r + 1, s: hex.s }, direction: "NE" },
    { hex: { q: hex.q - 1, r: hex.r, s: hex.s + 1 }, direction: "E" },
    { hex: { q: hex.q, r: hex.r - 1, s: hex.s + 1 }, direction: "SE" },
  ];
}

/**
 * 港IDマップを生成
 */
function createPortMap(): Map<string, { portId: string; ratio: number; resourceType: HoldableResource | null }> {
  const portMap = new Map<string, { portId: string; ratio: number; resourceType: HoldableResource | null }>();
  for (const config of PORT_CONFIGURATIONS) {
    for (const vertexId of config.vertexIds) {
      portMap.set(vertexId, { portId: config.portId, ...config.port });
    }
  }
  return portMap;
}

/**
 * 頂点（Intersection）を生成
 * ボード上の有効な位置のみ含める（海に突き出た頂点を除外）
 */
function generateIntersections(hexes: Hex[]): Intersection[] {
  const intersectionMap = new Map<string, Intersection>();
  const portMap = createPortMap();

  for (const hex of hexes) {
    const vertices = getHexVertices(hex.coordinate);
    for (const vertex of vertices) {
      const id = vertexToId(vertex);
      if (!intersectionMap.has(id) && isValidIntersection(vertex)) {
        const port = portMap.get(id) || null;
        intersectionMap.set(id, {
          id,
          coordinate: vertex,
          building: null,
          port,
        });
      }
    }
  }

  return Array.from(intersectionMap.values());
}

/**
 * 辺（Edge）を生成
 */
function generateEdges(hexes: Hex[]): Edge[] {
  const edgeMap = new Map<string, Edge>();

  for (const hex of hexes) {
    const edges = getHexEdges(hex.coordinate);
    for (const edge of edges) {
      const id = edgeToId(edge);
      if (!edgeMap.has(id)) {
        edgeMap.set(id, {
          id,
          coordinate: edge,
          road: null,
        });
      }
    }
  }

  return Array.from(edgeMap.values());
}

// ============================================
// ゲーム状態管理
// ============================================

/**
 * 新しいゲーム状態を作成
 */
export function createInitialGameState(roomId: string, hostId: string): GameState {
  const hexes = generateHexes();
  const intersections = generateIntersections(hexes);
  const edges = generateEdges(hexes);
  const developmentCardDeck = shuffle([...DEVELOPMENT_CARD_DECK]);

  return {
    id: roomId,
    hostId,
    phase: "waiting",
    hexes,
    intersections,
    edges,
    players: [],
    currentPlayerId: null,
    turnOrder: [],
    turnNumber: 0,
    diceResult: null,
    activeTradeOffer: null,
    developmentCardDeck,
    developmentCardDeckCount: developmentCardDeck.length,
    cardsBoughtThisTurn: [],
    longestRoadPlayerId: null,
    largestArmyPlayerId: null,
    winnerId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * ゲーム状態をリセットする（hostIdと既存プレイヤーを維持）
 */
export function resetGameState(state: GameState): GameState {
  const hexes = generateHexes();
  const intersections = generateIntersections(hexes);
  const edges = generateEdges(hexes);
  const developmentCardDeck = shuffle([...DEVELOPMENT_CARD_DECK]);

  // プレイヤーの状態をリセット
  const resetPlayers = state.players.map((player) => ({
    ...player,
    resources: { wood: 0, brick: 0, wheat: 0, ore: 0, sheep: 0 },
    developmentCards: [],
    knightsPlayed: 0,
    hasLongestRoad: false,
    hasLargestArmy: false,
    visibleVictoryPoints: 0,
    remainingPieces: {
      settlements: 5,
      cities: 4,
      roads: 15,
    },
  }));

  return {
    id: state.id,
    hostId: state.hostId,
    phase: "waiting",
    hexes,
    intersections,
    edges,
    players: resetPlayers,
    currentPlayerId: null,
    turnOrder: [],
    turnNumber: 0,
    diceResult: null,
    activeTradeOffer: null,
    developmentCardDeck,
    developmentCardDeckCount: developmentCardDeck.length,
    cardsBoughtThisTurn: [],
    longestRoadPlayerId: null,
    largestArmyPlayerId: null,
    winnerId: null,
    createdAt: state.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * プレイヤーの最良の交換レートを取得
 */
function getBestTradeRatio(
  state: GameState,
  playerId: string,
  resource: HoldableResource
): number {
  let bestRatio = 4; // デフォルト4:1

  // プレイヤーの建物がある頂点の港を確認
  for (const intersection of state.intersections) {
    if (
      intersection.building?.playerId === playerId &&
      intersection.port
    ) {
      const port = intersection.port;
      // 汎用港 (3:1)
      if (port.resourceType === null && port.ratio < bestRatio) {
        bestRatio = port.ratio;
      }
      // 専門港 (2:1) - 該当資源のみ
      if (port.resourceType === resource && port.ratio < bestRatio) {
        bestRatio = port.ratio;
      }
    }
  }

  return bestRatio;
}

/**
 * 新しいプレイヤーを作成
 */
export function createPlayer(
  playerId: string,
  playerName: string,
  existingPlayers: Player[]
): Player {
  // 使用されていない色を選択
  const usedColors = new Set(existingPlayers.map((p) => p.color));
  const availableColor = PLAYER_COLORS.find((c) => !usedColors.has(c));

  if (!availableColor) {
    throw new Error("No available colors");
  }

  return {
    id: playerId,
    name: playerName,
    color: availableColor,
    resources: { ...INITIAL_RESOURCES } as PlayerResources,
    developmentCards: [],
    knightsPlayed: 0,
    hasLongestRoad: false,
    hasLargestArmy: false,
    visibleVictoryPoints: 0,
    remainingPieces: { ...INITIAL_PIECES },
    isConnected: true,
  };
}

/**
 * プレイヤーをゲームに追加
 */
export function addPlayerToGame(
  state: GameState,
  playerId: string,
  playerName: string
): GameState {
  if (state.players.length >= 4) {
    throw new Error("Room is full");
  }

  if (state.phase !== "waiting") {
    throw new Error("Game has already started");
  }

  // 既存プレイヤーの再接続チェック
  const existingPlayer = state.players.find((p) => p.id === playerId);
  if (existingPlayer) {
    return {
      ...state,
      players: state.players.map((p) =>
        p.id === playerId ? { ...p, isConnected: true } : p
      ),
      updatedAt: new Date().toISOString(),
    };
  }

  const newPlayer = createPlayer(playerId, playerName, state.players);

  return {
    ...state,
    players: [...state.players, newPlayer],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * プレイヤーをゲームから削除/切断
 */
export function removePlayerFromGame(
  state: GameState,
  playerId: string,
  permanent: boolean = false
): GameState {
  if (permanent || state.phase === "waiting") {
    return {
      ...state,
      players: state.players.filter((p) => p.id !== playerId),
      updatedAt: new Date().toISOString(),
    };
  }

  // ゲーム中は切断状態にする
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, isConnected: false } : p
    ),
    updatedAt: new Date().toISOString(),
  };
}

// ============================================
// アクション処理
// ============================================

/**
 * ゲームを開始
 */
export function startGame(state: GameState): GameState {
  if (state.players.length < 3) {
    throw new Error("Not enough players (minimum 3)");
  }

  if (state.phase !== "waiting") {
    throw new Error("Game has already started");
  }

  // ターン順をランダム化
  const turnOrder = shuffle(state.players.map((p) => p.id));

  return {
    ...state,
    phase: "setup_settlement_1",
    currentPlayerId: turnOrder[0],
    turnOrder,
    turnNumber: 1,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * サイコロを振る
 */
export function handleRollDice(
  state: GameState,
  playerId: string
): GameState {
  if (state.phase !== "roll_dice") {
    throw new Error("Cannot roll dice in current phase");
  }

  if (state.currentPlayerId !== playerId) {
    throw new Error("Not your turn");
  }

  const diceResult = rollDice();

  // 7が出た場合
  if (diceResult.total === 7) {
    // 8枚以上持っているプレイヤーがいるか確認
    const playersToDiscard = state.players.filter((p) => {
      const totalResources = Object.values(p.resources).reduce(
        (sum, count) => sum + count,
        0
      );
      return totalResources > 7;
    });

    return {
      ...state,
      diceResult,
      phase: playersToDiscard.length > 0 ? "discard" : "robber_move",
      updatedAt: new Date().toISOString(),
    };
  }

  // 資源を配布
  const updatedPlayers = distributeResources(state, diceResult.total);

  return {
    ...state,
    diceResult,
    phase: "main",
    players: updatedPlayers,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 資源を配布
 */
function distributeResources(state: GameState, diceTotal: number): Player[] {
  const players = [...state.players];

  // 該当する数字のタイルを取得
  const matchingHexes = state.hexes.filter(
    (hex) => hex.numberToken === diceTotal && !hex.hasRobber
  );

  for (const hex of matchingHexes) {
    if (hex.resourceType === "desert") continue;

    const resource = hex.resourceType as HoldableResource;

    // このタイルに隣接する頂点を取得
    const adjacentVertexIds = getHexVertices(hex.coordinate).map(vertexToId);

    // 各頂点の建造物をチェック
    for (const vertexId of adjacentVertexIds) {
      const intersection = state.intersections.find((i) => i.id === vertexId);
      if (intersection?.building) {
        const playerIndex = players.findIndex(
          (p) => p.id === intersection.building!.playerId
        );
        if (playerIndex !== -1) {
          const amount =
            intersection.building.type === "city" ? 2 : 1;
          players[playerIndex] = {
            ...players[playerIndex],
            resources: {
              ...players[playerIndex].resources,
              [resource]: players[playerIndex].resources[resource] + amount,
            },
          };
        }
      }
    }
  }

  return players;
}

/**
 * 開拓地を建設
 */
export function handleBuildSettlement(
  state: GameState,
  playerId: string,
  intersectionId: string
): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");

  const intersection = state.intersections.find(
    (i) => i.id === intersectionId
  );
  if (!intersection) throw new Error("Intersection not found");

  if (intersection.building) {
    throw new Error("Intersection already occupied");
  }

  // 2マスルール: 隣接する頂点に建物がないことを確認
  const vertex = parseVertexId(intersectionId);
  if (!vertex) throw new Error("Invalid intersection ID");

  const adjacentVertexIds = getAdjacentVertices(vertex).map(vertexToId);
  for (const adjId of adjacentVertexIds) {
    const adjIntersection = state.intersections.find((i) => i.id === adjId);
    if (adjIntersection?.building) {
      throw new Error("開拓地は他の建物から2マス以上離す必要があります");
    }
  }

  // 初期配置フェーズでない場合はコストを確認
  const isSetupPhase =
    state.phase === "setup_settlement_1" ||
    state.phase === "setup_settlement_2";

  if (!isSetupPhase) {
    if (state.phase !== "main") {
      throw new Error("Cannot build in current phase");
    }

    // コスト確認（wood:1, brick:1, wheat:1, sheep:1）
    if (
      player.resources.wood < 1 ||
      player.resources.brick < 1 ||
      player.resources.wheat < 1 ||
      player.resources.sheep < 1
    ) {
      throw new Error("Not enough resources");
    }

    // メインフェーズでは自分の道に隣接している必要がある
    const adjacentEdgeIds = getAdjacentEdgesForVertex(vertex).map(edgeToId);
    const hasConnectedRoad = adjacentEdgeIds.some((edgeId) => {
      const edge = state.edges.find((e) => e.id === edgeId);
      return edge?.road?.playerId === playerId;
    });
    if (!hasConnectedRoad) {
      throw new Error("開拓地は自分の道に隣接している必要があります");
    }
  }

  // 残り建造物数を確認
  if (player.remainingPieces.settlements <= 0) {
    throw new Error("No remaining settlements");
  }

  // 頂点を更新
  const updatedIntersections = state.intersections.map((i) =>
    i.id === intersectionId
      ? { ...i, building: { type: "settlement" as const, playerId } }
      : i
  );

  // プレイヤーを更新
  let updatedPlayers = state.players.map((p) => {
    if (p.id !== playerId) return p;

    let updatedResources = { ...p.resources };
    if (!isSetupPhase) {
      updatedResources = {
        ...updatedResources,
        wood: updatedResources.wood - 1,
        brick: updatedResources.brick - 1,
        wheat: updatedResources.wheat - 1,
        sheep: updatedResources.sheep - 1,
      };
    }

    return {
      ...p,
      resources: updatedResources,
      remainingPieces: {
        ...p.remainingPieces,
        settlements: p.remainingPieces.settlements - 1,
      },
      visibleVictoryPoints: p.visibleVictoryPoints + 1,
    };
  });

  // 初期配置の2番目の開拓地では隣接する資源を獲得
  if (state.phase === "setup_settlement_2") {
    const adjacentHexes = getAdjacentHexesForVertex(vertex);
    const resourcesToGain: Partial<Record<HoldableResource, number>> = {};

    for (const hexCoord of adjacentHexes) {
      const hex = state.hexes.find((h) => h.id === cubeToId(hexCoord));
      if (hex && hex.resourceType !== "desert") {
        const resource = hex.resourceType as HoldableResource;
        resourcesToGain[resource] = (resourcesToGain[resource] || 0) + 1;
      }
    }

    updatedPlayers = updatedPlayers.map((p) => {
      if (p.id !== playerId) return p;
      const newResources = { ...p.resources };
      for (const [resource, amount] of Object.entries(resourcesToGain)) {
        newResources[resource as HoldableResource] += amount as number;
      }
      return { ...p, resources: newResources };
    });
  }

  // フェーズ更新
  let nextPhase = state.phase;
  if (state.phase === "setup_settlement_1") {
    nextPhase = "setup_road_1";
  } else if (state.phase === "setup_settlement_2") {
    nextPhase = "setup_road_2";
  }

  let newState: GameState = {
    ...state,
    intersections: updatedIntersections,
    players: updatedPlayers,
    phase: nextPhase as GamePhase,
    updatedAt: new Date().toISOString(),
  };

  // 勝利条件をチェック
  newState = checkVictoryCondition(newState);

  return newState;
}

/**
 * 道を建設
 */
export function handleBuildRoad(
  state: GameState,
  playerId: string,
  edgeId: string
): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");

  const edge = state.edges.find((e) => e.id === edgeId);
  if (!edge) throw new Error("Edge not found");

  if (edge.road) {
    throw new Error("Edge already has a road");
  }

  const isSetupPhase =
    state.phase === "setup_road_1" || state.phase === "setup_road_2";

  // 辺の座標を解析
  const edgeCoord = parseEdgeId(edgeId);
  if (!edgeCoord) throw new Error("Invalid edge ID");

  // 辺に隣接する頂点を取得
  const adjacentVertexIds = getAdjacentVerticesForEdge(edgeCoord).map(vertexToId);

  if (isSetupPhase) {
    // 初期配置フェーズでは、直前に配置した開拓地に隣接している必要がある

    // プレイヤーの開拓地を取得
    const playerSettlements = state.intersections.filter(
      (i) => i.building?.playerId === playerId && i.building.type === "settlement"
    );

    let targetSettlement: Intersection | undefined;

    if (state.phase === "setup_road_1") {
      // setup_road_1 では開拓地は1つしかないはず
      targetSettlement = playerSettlements[0];
    } else {
      // setup_road_2 では、まだ隣接する道がない開拓地を探す
      // （1つ目の開拓地には既にsetup_road_1で道が建設されているはず）
      targetSettlement = playerSettlements.find((settlement) => {
        const settlementCoord = parseVertexId(settlement.id);
        if (!settlementCoord) return false;

        // この開拓地に隣接する辺を取得
        const adjacentEdgeIds = getAdjacentEdgesForVertex(settlementCoord).map(edgeToId);

        // 隣接する辺にプレイヤーの道がないか確認
        const hasAdjacentRoad = adjacentEdgeIds.some((adjEdgeId) => {
          const adjEdge = state.edges.find((e) => e.id === adjEdgeId);
          return adjEdge?.road?.playerId === playerId;
        });

        // 道がない = 2番目に配置した開拓地
        return !hasAdjacentRoad;
      });
    }

    if (!targetSettlement) {
      throw new Error("開拓地が見つかりません");
    }

    // 道が開拓地に隣接しているか確認
    if (!adjacentVertexIds.includes(targetSettlement.id)) {
      throw new Error("道は直前に配置した開拓地に隣接している必要があります");
    }
  } else {
    if (state.phase !== "main") {
      throw new Error("Cannot build in current phase");
    }

    // コスト確認（wood:1, brick:1）
    if (player.resources.wood < 1 || player.resources.brick < 1) {
      throw new Error("Not enough resources");
    }

    // メインフェーズでは自分の道または建物に隣接している必要がある
    const hasConnection = adjacentVertexIds.some((vertexId) => {
      // 建物に隣接しているか
      const intersection = state.intersections.find((i) => i.id === vertexId);
      if (intersection?.building?.playerId === playerId) {
        return true;
      }

      // この頂点に隣接する他の道に接続しているか
      const vertex = parseVertexId(vertexId);
      if (!vertex) return false;

      const vertexAdjacentEdges = getAdjacentEdgesForVertex(vertex).map(edgeToId);
      return vertexAdjacentEdges.some((adjEdgeId) => {
        if (adjEdgeId === edgeId) return false; // 自分自身は除く
        const adjEdge = state.edges.find((e) => e.id === adjEdgeId);
        return adjEdge?.road?.playerId === playerId;
      });
    });

    if (!hasConnection) {
      throw new Error("道は自分の道または建物に隣接している必要があります");
    }
  }

  if (player.remainingPieces.roads <= 0) {
    throw new Error("No remaining roads");
  }

  // 辺を更新
  const updatedEdges = state.edges.map((e) =>
    e.id === edgeId ? { ...e, road: { playerId } } : e
  );

  // プレイヤーを更新
  const updatedPlayers = state.players.map((p) => {
    if (p.id !== playerId) return p;

    let updatedResources = { ...p.resources };
    if (!isSetupPhase) {
      updatedResources = {
        ...updatedResources,
        wood: updatedResources.wood - 1,
        brick: updatedResources.brick - 1,
      };
    }

    return {
      ...p,
      resources: updatedResources,
      remainingPieces: {
        ...p.remainingPieces,
        roads: p.remainingPieces.roads - 1,
      },
    };
  });

  // フェーズとターン更新
  let nextPhase = state.phase;
  let nextPlayerId = state.currentPlayerId;
  const currentIndex = state.turnOrder.indexOf(playerId);

  if (state.phase === "setup_road_1") {
    // 最後のプレイヤーなら逆順で2回目の配置へ
    if (currentIndex === state.turnOrder.length - 1) {
      nextPhase = "setup_settlement_2";
      // 同じプレイヤーが続ける（逆順の最初）
    } else {
      nextPhase = "setup_settlement_1";
      nextPlayerId = state.turnOrder[currentIndex + 1];
    }
  } else if (state.phase === "setup_road_2") {
    // 最初のプレイヤー（逆順の最後）ならメインゲームへ
    if (currentIndex === 0) {
      nextPhase = "roll_dice";
      nextPlayerId = state.turnOrder[0];
    } else {
      nextPhase = "setup_settlement_2";
      nextPlayerId = state.turnOrder[currentIndex - 1];
    }
  }

  let newState: GameState = {
    ...state,
    edges: updatedEdges,
    players: updatedPlayers,
    phase: nextPhase as GamePhase,
    currentPlayerId: nextPlayerId,
    updatedAt: new Date().toISOString(),
  };

  // 最長交易路を更新（初期配置フェーズ後も含む）
  newState = updateLongestRoad(newState);

  // 勝利条件をチェック
  newState = checkVictoryCondition(newState);

  return newState;
}

/**
 * ターンを終了
 */
export function handleEndTurn(
  state: GameState,
  playerId: string
): GameState {
  if (state.phase !== "main") {
    throw new Error("Cannot end turn in current phase");
  }

  if (state.currentPlayerId !== playerId) {
    throw new Error("Not your turn");
  }

  // 次のプレイヤーを決定
  const currentIndex = state.turnOrder.indexOf(playerId);
  const nextIndex = (currentIndex + 1) % state.turnOrder.length;
  const nextPlayerId = state.turnOrder[nextIndex];

  return {
    ...state,
    phase: "roll_dice",
    currentPlayerId: nextPlayerId,
    turnNumber: state.turnNumber + 1,
    diceResult: null,
    activeTradeOffer: null,
    cardsBoughtThisTurn: [], // ターン終了時にリセット
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 盗賊を移動
 */
export function handleMoveRobber(
  state: GameState,
  playerId: string,
  hexId: string
): GameState {
  if (state.phase !== "robber_move") {
    throw new Error("Cannot move robber in current phase");
  }

  if (state.currentPlayerId !== playerId) {
    throw new Error("Not your turn");
  }

  const targetHex = state.hexes.find((h) => h.id === hexId);
  if (!targetHex) throw new Error("Hex not found");

  if (targetHex.hasRobber) {
    throw new Error("Robber is already on this hex");
  }

  // 盗賊を移動
  const updatedHexes = state.hexes.map((h) => ({
    ...h,
    hasRobber: h.id === hexId,
  }));

  // 隣接するプレイヤーがいるか確認
  const adjacentVertexIds = getHexVertices(targetHex.coordinate).map(
    vertexToId
  );
  const adjacentPlayerIds = new Set<string>();

  for (const vertexId of adjacentVertexIds) {
    const intersection = state.intersections.find((i) => i.id === vertexId);
    if (intersection?.building && intersection.building.playerId !== playerId) {
      adjacentPlayerIds.add(intersection.building.playerId);
    }
  }

  // 略奪対象がいなければメインフェーズへ
  const nextPhase = adjacentPlayerIds.size > 0 ? "robber_steal" : "main";

  return {
    ...state,
    hexes: updatedHexes,
    phase: nextPhase,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 資源を略奪（盗賊）
 */
export function handleStealResource(
  state: GameState,
  playerId: string,
  targetPlayerId: string
): GameState {
  if (state.phase !== "robber_steal") {
    throw new Error("Cannot steal in current phase");
  }

  if (state.currentPlayerId !== playerId) {
    throw new Error("Not your turn");
  }

  if (targetPlayerId === playerId) {
    throw new Error("Cannot steal from yourself");
  }

  const targetPlayer = state.players.find((p) => p.id === targetPlayerId);
  if (!targetPlayer) throw new Error("Target player not found");

  // 対象プレイヤーが盗賊のいるタイルに隣接しているか確認
  const robberHex = state.hexes.find((h) => h.hasRobber);
  if (!robberHex) throw new Error("Robber hex not found");

  const adjacentVertexIds = getHexVertices(robberHex.coordinate).map(vertexToId);
  const isAdjacent = adjacentVertexIds.some((vertexId) => {
    const intersection = state.intersections.find((i) => i.id === vertexId);
    return intersection?.building?.playerId === targetPlayerId;
  });

  if (!isAdjacent) {
    throw new Error("Target player is not adjacent to the robber");
  }

  // 対象の持っている資源からランダムに1つ奪う
  const targetResources = targetPlayer.resources;
  const availableResources: HoldableResource[] = [];

  (Object.keys(targetResources) as HoldableResource[]).forEach((resource) => {
    for (let i = 0; i < targetResources[resource]; i++) {
      availableResources.push(resource);
    }
  });

  let updatedPlayers = state.players;

  if (availableResources.length > 0) {
    const stolenResource =
      availableResources[Math.floor(Math.random() * availableResources.length)];

    updatedPlayers = state.players.map((p) => {
      if (p.id === playerId) {
        return {
          ...p,
          resources: {
            ...p.resources,
            [stolenResource]: p.resources[stolenResource] + 1,
          },
        };
      }
      if (p.id === targetPlayerId) {
        return {
          ...p,
          resources: {
            ...p.resources,
            [stolenResource]: p.resources[stolenResource] - 1,
          },
        };
      }
      return p;
    });
  }

  return {
    ...state,
    players: updatedPlayers,
    phase: "main",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 都市を建設
 */
export function handleBuildCity(
  state: GameState,
  playerId: string,
  intersectionId: string
): GameState {
  if (state.phase !== "main") {
    throw new Error("Cannot build city in current phase");
  }

  if (state.currentPlayerId !== playerId) {
    throw new Error("Not your turn");
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");

  const intersection = state.intersections.find((i) => i.id === intersectionId);
  if (!intersection) throw new Error("Intersection not found");

  // 自分の開拓地がある場所のみ都市化可能
  if (
    !intersection.building ||
    intersection.building.playerId !== playerId ||
    intersection.building.type !== "settlement"
  ) {
    throw new Error("自分の開拓地がある場所にのみ都市を建設できます");
  }

  // コスト確認（wheat: 2, ore: 3）
  if (player.resources.wheat < 2 || player.resources.ore < 3) {
    throw new Error("資源が足りません（小麦2、鉱石3が必要）");
  }

  // 残り建造物数を確認
  if (player.remainingPieces.cities <= 0) {
    throw new Error("都市の残りがありません");
  }

  // 頂点を更新
  const updatedIntersections = state.intersections.map((i) =>
    i.id === intersectionId
      ? { ...i, building: { type: "city" as const, playerId } }
      : i
  );

  // プレイヤーを更新
  const updatedPlayers = state.players.map((p) => {
    if (p.id !== playerId) return p;

    return {
      ...p,
      resources: {
        ...p.resources,
        wheat: p.resources.wheat - 2,
        ore: p.resources.ore - 3,
      },
      remainingPieces: {
        ...p.remainingPieces,
        settlements: p.remainingPieces.settlements + 1, // 開拓地を回収
        cities: p.remainingPieces.cities - 1,
      },
      visibleVictoryPoints: p.visibleVictoryPoints + 1, // 都市は2点だが、開拓地の1点を置き換え
    };
  });

  let newState: GameState = {
    ...state,
    intersections: updatedIntersections,
    players: updatedPlayers,
    updatedAt: new Date().toISOString(),
  };

  // 勝利条件をチェック
  newState = checkVictoryCondition(newState);

  return newState;
}

/**
 * 資源を破棄（7が出た時、8枚以上持っている場合）
 */
export function handleDiscardResources(
  state: GameState,
  playerId: string,
  resources: Partial<Record<HoldableResource, number>>
): GameState {
  if (state.phase !== "discard") {
    throw new Error("Cannot discard in current phase");
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");

  // 現在の資源合計
  const totalResources = Object.values(player.resources).reduce(
    (sum, count) => sum + count,
    0
  );

  // 8枚以上持っていないプレイヤーは破棄不要
  if (totalResources <= 7) {
    throw new Error("破棄する必要はありません");
  }

  // 破棄する枚数を計算
  const discardCount = Object.values(resources).reduce(
    (sum, count) => sum + (count || 0),
    0
  );
  const requiredDiscard = Math.floor(totalResources / 2);

  if (discardCount !== requiredDiscard) {
    throw new Error(`${requiredDiscard}枚破棄する必要があります`);
  }

  // 破棄する資源が実際に持っているか確認
  for (const [resource, count] of Object.entries(resources)) {
    if (count && player.resources[resource as HoldableResource] < count) {
      throw new Error(`${resource}が足りません`);
    }
  }

  // プレイヤーの資源を更新
  const updatedPlayers = state.players.map((p) => {
    if (p.id !== playerId) return p;

    const newResources = { ...p.resources };
    for (const [resource, count] of Object.entries(resources)) {
      if (count) {
        newResources[resource as HoldableResource] -= count;
      }
    }

    return { ...p, resources: newResources };
  });

  // 全員が破棄完了したか確認
  const stillNeedToDiscard = updatedPlayers.some((p) => {
    const total = Object.values(p.resources).reduce((sum, c) => sum + c, 0);
    return total > 7;
  });

  return {
    ...state,
    players: updatedPlayers,
    phase: stillNeedToDiscard ? "discard" : "robber_move",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 銀行との交易
 */
export function handleTradeWithBank(
  state: GameState,
  playerId: string,
  give: { resource: HoldableResource; amount: number },
  receive: HoldableResource
): GameState {
  if (state.phase !== "main") {
    throw new Error("Cannot trade in current phase");
  }

  if (state.currentPlayerId !== playerId) {
    throw new Error("Not your turn");
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");

  // 交換レートを決定（港の効果を反映）
  const tradeRatio = getBestTradeRatio(state, playerId, give.resource);

  if (give.amount !== tradeRatio) {
    throw new Error(`${tradeRatio}:1の交換レートです`);
  }

  // 資源が足りるか確認
  if (player.resources[give.resource] < give.amount) {
    throw new Error(`${give.resource}が足りません`);
  }

  // プレイヤーの資源を更新
  const updatedPlayers = state.players.map((p) => {
    if (p.id !== playerId) return p;

    return {
      ...p,
      resources: {
        ...p.resources,
        [give.resource]: p.resources[give.resource] - give.amount,
        [receive]: p.resources[receive] + 1,
      },
    };
  });

  return {
    ...state,
    players: updatedPlayers,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 発展カードを購入
 */
export function handleBuyDevelopmentCard(
  state: GameState,
  playerId: string
): GameState {
  if (state.phase !== "main") {
    throw new Error("Cannot buy cards in current phase");
  }

  if (state.currentPlayerId !== playerId) {
    throw new Error("Not your turn");
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");

  // デッキが空でないか確認
  if (state.developmentCardDeck.length === 0) {
    throw new Error("発展カードデッキが空です");
  }

  // コスト確認（wheat: 1, ore: 1, sheep: 1）
  if (
    player.resources.wheat < 1 ||
    player.resources.ore < 1 ||
    player.resources.sheep < 1
  ) {
    throw new Error("資源が足りません（小麦1、鉱石1、羊毛1が必要）");
  }

  // カードを引く
  const [drawnCard, ...remainingDeck] = state.developmentCardDeck;
  const cardId = `${playerId}_${Date.now()}_${drawnCard}`;

  // プレイヤーを更新
  const updatedPlayers = state.players.map((p) => {
    if (p.id !== playerId) return p;

    return {
      ...p,
      resources: {
        ...p.resources,
        wheat: p.resources.wheat - 1,
        ore: p.resources.ore - 1,
        sheep: p.resources.sheep - 1,
      },
      developmentCards: [...p.developmentCards, drawnCard],
      // 勝利点カードは即座に加算
      visibleVictoryPoints:
        drawnCard === "victoryPoint"
          ? p.visibleVictoryPoints + 1
          : p.visibleVictoryPoints,
    };
  });

  let newState: GameState = {
    ...state,
    players: updatedPlayers,
    developmentCardDeck: remainingDeck,
    developmentCardDeckCount: remainingDeck.length,
    cardsBoughtThisTurn: [...state.cardsBoughtThisTurn, cardId],
    updatedAt: new Date().toISOString(),
  };

  // 勝利点カードの場合、勝利条件をチェック
  if (drawnCard === "victoryPoint") {
    newState = checkVictoryCondition(newState);
  }

  return newState;
}

/**
 * 発展カードを使用
 */
export function handleUseDevelopmentCard(
  state: GameState,
  playerId: string,
  cardType: DevelopmentCardType,
  params?: {
    targetHexId?: string;
    targetPlayerId?: string;
    resources?: [HoldableResource, HoldableResource];
    resource?: HoldableResource;
    edgeIds?: [string, string];
  }
): GameState {
  if (state.currentPlayerId !== playerId) {
    throw new Error("Not your turn");
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");

  // カードを持っているか確認
  const cardIndex = player.developmentCards.indexOf(cardType);
  if (cardIndex === -1) {
    throw new Error("そのカードを持っていません");
  }

  // 今ターン購入したカードは使用不可（勝利点カードを除く）
  // cardsBoughtThisTurn には "playerId_timestamp_cardType" 形式で保存されている
  const cardsBoughtThisTurnOfType = state.cardsBoughtThisTurn.filter(
    (cardId) => cardId.endsWith(`_${cardType}`)
  ).length;
  const totalCardsOfType = player.developmentCards.filter(
    (card) => card === cardType
  ).length;

  // 持っているカードがすべて今ターン購入したものなら使用不可
  if (cardsBoughtThisTurnOfType >= totalCardsOfType) {
    throw new Error("購入したターンには発展カードを使用できません");
  }

  // 勝利点カードは使用できない
  if (cardType === "victoryPoint") {
    throw new Error("勝利点カードは使用できません");
  }

  let updatedState = state;
  let updatedPlayers = state.players;

  switch (cardType) {
    case "knight": {
      // 騎士カード: 盗賊を移動して資源を奪う
      updatedPlayers = state.players.map((p) => {
        if (p.id !== playerId) return p;
        const newCards = [...p.developmentCards];
        newCards.splice(cardIndex, 1);
        return {
          ...p,
          developmentCards: newCards,
          knightsPlayed: p.knightsPlayed + 1,
        };
      });
      updatedState = {
        ...state,
        players: updatedPlayers,
        phase: "robber_move" as GamePhase,
      };
      // 最大騎士力を更新
      updatedState = updateLargestArmy(updatedState);
      break;
    }

    case "roadBuilding": {
      // 街道建設: 2本の道を無料で建設（後でUIで処理）
      updatedPlayers = state.players.map((p) => {
        if (p.id !== playerId) return p;
        const newCards = [...p.developmentCards];
        newCards.splice(cardIndex, 1);
        return { ...p, developmentCards: newCards };
      });
      // 実際の道建設は別途処理（簡易実装: 道2本分の資源を付与）
      updatedPlayers = updatedPlayers.map((p) => {
        if (p.id !== playerId) return p;
        return {
          ...p,
          resources: {
            ...p.resources,
            wood: p.resources.wood + 2,
            brick: p.resources.brick + 2,
          },
        };
      });
      updatedState = { ...state, players: updatedPlayers };
      break;
    }

    case "yearOfPlenty": {
      // 収穫: 任意の資源2つを獲得
      if (!params?.resources || params.resources.length !== 2) {
        throw new Error("獲得する資源を2つ指定してください");
      }
      updatedPlayers = state.players.map((p) => {
        if (p.id !== playerId) return p;
        const newCards = [...p.developmentCards];
        newCards.splice(cardIndex, 1);
        const newResources = { ...p.resources };
        newResources[params.resources![0]] += 1;
        newResources[params.resources![1]] += 1;
        return { ...p, developmentCards: newCards, resources: newResources };
      });
      updatedState = { ...state, players: updatedPlayers };
      break;
    }

    case "monopoly": {
      // 独占: 指定した資源を全員から奪う
      if (!params?.resource) {
        throw new Error("独占する資源を指定してください");
      }
      const targetResource = params.resource;
      let totalStolen = 0;

      // 他プレイヤーから資源を集める
      updatedPlayers = state.players.map((p) => {
        if (p.id === playerId) return p;
        const stolen = p.resources[targetResource];
        totalStolen += stolen;
        return {
          ...p,
          resources: { ...p.resources, [targetResource]: 0 },
        };
      });

      // カードを使用したプレイヤーに資源を渡す
      updatedPlayers = updatedPlayers.map((p) => {
        if (p.id !== playerId) return p;
        const newCards = [...p.developmentCards];
        newCards.splice(cardIndex, 1);
        return {
          ...p,
          developmentCards: newCards,
          resources: {
            ...p.resources,
            [targetResource]: p.resources[targetResource] + totalStolen,
          },
        };
      });
      updatedState = { ...state, players: updatedPlayers };
      break;
    }
  }

  return {
    ...updatedState,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * プレイヤーの道の長さを計算（DFS）
 */
function calculateRoadLength(
  state: GameState,
  playerId: string,
  startEdgeId: string,
  visited: Set<string>
): number {
  if (visited.has(startEdgeId)) return 0;

  const edge = state.edges.find((e) => e.id === startEdgeId);
  if (!edge || edge.road?.playerId !== playerId) return 0;

  visited.add(startEdgeId);

  const edgeCoord = parseEdgeId(startEdgeId);
  if (!edgeCoord) return 1;

  // 隣接する頂点を取得
  const adjacentVertices = getAdjacentVerticesForEdge(edgeCoord);
  let maxLength = 1;

  for (const vertex of adjacentVertices) {
    const vertexId = vertexToId(vertex);
    const intersection = state.intersections.find((i) => i.id === vertexId);

    // 他プレイヤーの建物があると道が途切れる
    if (
      intersection?.building &&
      intersection.building.playerId !== playerId
    ) {
      continue;
    }

    // この頂点から伸びる他の道を探す
    const adjacentEdges = getAdjacentEdgesForVertex(vertex);
    for (const adjEdge of adjacentEdges) {
      const adjEdgeId = edgeToId(adjEdge);
      if (adjEdgeId !== startEdgeId) {
        const length = 1 + calculateRoadLength(state, playerId, adjEdgeId, visited);
        maxLength = Math.max(maxLength, length);
      }
    }
  }

  visited.delete(startEdgeId);
  return maxLength;
}

/**
 * プレイヤーの最長道路を計算
 */
function getLongestRoadForPlayer(state: GameState, playerId: string): number {
  let longestRoad = 0;

  // プレイヤーの全ての道から開始点を試す
  for (const edge of state.edges) {
    if (edge.road?.playerId === playerId) {
      const length = calculateRoadLength(state, playerId, edge.id, new Set());
      longestRoad = Math.max(longestRoad, length);
    }
  }

  return longestRoad;
}

/**
 * 最長交易路ボーナスを更新
 */
function updateLongestRoad(state: GameState): GameState {
  let longestRoadPlayerId = state.longestRoadPlayerId;
  let longestRoadLength = 0;

  // 現在の保持者の道の長さ
  if (longestRoadPlayerId) {
    longestRoadLength = getLongestRoadForPlayer(state, longestRoadPlayerId);
  }

  // 各プレイヤーの道の長さを計算
  for (const player of state.players) {
    const roadLength = getLongestRoadForPlayer(state, player.id);

    // 5以上で、現在の最長を超えた場合に更新
    if (roadLength >= 5 && roadLength > longestRoadLength) {
      longestRoadLength = roadLength;
      longestRoadPlayerId = player.id;
    }
  }

  // 保持者が変わった場合、勝利点を更新
  if (longestRoadPlayerId !== state.longestRoadPlayerId) {
    const updatedPlayers = state.players.map((p) => {
      let vp = p.visibleVictoryPoints;
      if (p.id === state.longestRoadPlayerId) {
        vp -= 2; // 前の保持者から2点引く
        return { ...p, hasLongestRoad: false, visibleVictoryPoints: vp };
      }
      if (p.id === longestRoadPlayerId) {
        vp += 2; // 新しい保持者に2点加える
        return { ...p, hasLongestRoad: true, visibleVictoryPoints: vp };
      }
      return p;
    });

    return {
      ...state,
      players: updatedPlayers,
      longestRoadPlayerId,
    };
  }

  return state;
}

/**
 * 最大騎士力ボーナスを更新
 */
function updateLargestArmy(state: GameState): GameState {
  let largestArmyPlayerId = state.largestArmyPlayerId;
  let largestArmySize = 0;

  // 現在の保持者の騎士数
  if (largestArmyPlayerId) {
    const holder = state.players.find((p) => p.id === largestArmyPlayerId);
    largestArmySize = holder?.knightsPlayed || 0;
  }

  // 各プレイヤーの騎士数を確認
  for (const player of state.players) {
    // 3以上で、現在の最大を超えた場合に更新
    if (player.knightsPlayed >= 3 && player.knightsPlayed > largestArmySize) {
      largestArmySize = player.knightsPlayed;
      largestArmyPlayerId = player.id;
    }
  }

  // 保持者が変わった場合、勝利点を更新
  if (largestArmyPlayerId !== state.largestArmyPlayerId) {
    const updatedPlayers = state.players.map((p) => {
      let vp = p.visibleVictoryPoints;
      if (p.id === state.largestArmyPlayerId) {
        vp -= 2;
        return { ...p, hasLargestArmy: false, visibleVictoryPoints: vp };
      }
      if (p.id === largestArmyPlayerId) {
        vp += 2;
        return { ...p, hasLargestArmy: true, visibleVictoryPoints: vp };
      }
      return p;
    });

    return {
      ...state,
      players: updatedPlayers,
      largestArmyPlayerId,
    };
  }

  return state;
}

/**
 * 交易を提案
 */
export function handleProposeTrade(
  state: GameState,
  playerId: string,
  offering: Partial<Record<HoldableResource, number>>,
  requesting: Partial<Record<HoldableResource, number>>
): GameState {
  if (state.phase !== "main") {
    throw new Error("メインフェーズでのみ交易を提案できます");
  }

  if (state.currentPlayerId !== playerId) {
    throw new Error("自分のターンでのみ交易を提案できます");
  }

  if (state.activeTradeOffer) {
    throw new Error("既に交易提案が進行中です");
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");

  // 提供する資源を持っているか確認
  for (const [resource, amount] of Object.entries(offering)) {
    if (amount && player.resources[resource as HoldableResource] < amount) {
      throw new Error(`${resource}が足りません`);
    }
  }

  // 空の提案は無効
  const totalOffering = Object.values(offering).reduce((sum, v) => sum + (v || 0), 0);
  const totalRequesting = Object.values(requesting).reduce((sum, v) => sum + (v || 0), 0);
  if (totalOffering === 0 || totalRequesting === 0) {
    throw new Error("提供と要求の両方を指定してください");
  }

  // 交易提案を作成
  const tradeOffer: TradeOffer = {
    id: `trade_${Date.now()}`,
    fromPlayerId: playerId,
    offering,
    requesting,
    responses: {},
  };

  // 他のプレイヤーの応答を pending に初期化
  for (const p of state.players) {
    if (p.id !== playerId) {
      tradeOffer.responses[p.id] = "pending";
    }
  }

  return {
    ...state,
    activeTradeOffer: tradeOffer,
    phase: "trade_offer",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 交易に応答
 */
export function handleRespondToTrade(
  state: GameState,
  playerId: string,
  tradeId: string,
  response: "accept" | "reject"
): GameState {
  if (state.phase !== "trade_offer") {
    throw new Error("交易提案中ではありません");
  }

  const tradeOffer = state.activeTradeOffer;
  if (!tradeOffer) {
    throw new Error("交易提案がありません");
  }

  if (tradeOffer.id !== tradeId) {
    throw new Error("交易提案IDが一致しません");
  }

  if (playerId === tradeOffer.fromPlayerId) {
    // 提案者がキャンセル
    if (response === "reject") {
      return {
        ...state,
        activeTradeOffer: null,
        phase: "main",
        updatedAt: new Date().toISOString(),
      };
    }
    throw new Error("提案者は自分の提案を受諾できません");
  }

  const responder = state.players.find((p) => p.id === playerId);
  if (!responder) throw new Error("Player not found");

  if (tradeOffer.responses[playerId] !== "pending") {
    throw new Error("既に応答済みです");
  }

  // 応答を記録（accept → accepted, reject → rejected に変換）
  const updatedResponses: Record<string, "pending" | "accepted" | "rejected"> = {
    ...tradeOffer.responses,
    [playerId]: response === "accept" ? "accepted" : "rejected",
  };

  // 受諾の場合、交易を実行
  if (response === "accept") {
    // 受諾者が要求資源を持っているか確認
    for (const [resource, amount] of Object.entries(tradeOffer.requesting)) {
      if (amount && responder.resources[resource as HoldableResource] < amount) {
        throw new Error(`${resource}が足りません`);
      }
    }

    // 資源を交換
    const proposer = state.players.find((p) => p.id === tradeOffer.fromPlayerId);
    if (!proposer) throw new Error("Proposer not found");

    const updatedPlayers = state.players.map((p) => {
      if (p.id === tradeOffer.fromPlayerId) {
        // 提案者: offering を減らし、requesting を増やす
        const newResources = { ...p.resources };
        for (const [resource, amount] of Object.entries(tradeOffer.offering)) {
          if (amount) newResources[resource as HoldableResource] -= amount;
        }
        for (const [resource, amount] of Object.entries(tradeOffer.requesting)) {
          if (amount) newResources[resource as HoldableResource] += amount;
        }
        return { ...p, resources: newResources };
      }
      if (p.id === playerId) {
        // 受諾者: requesting を減らし、offering を増やす
        const newResources = { ...p.resources };
        for (const [resource, amount] of Object.entries(tradeOffer.requesting)) {
          if (amount) newResources[resource as HoldableResource] -= amount;
        }
        for (const [resource, amount] of Object.entries(tradeOffer.offering)) {
          if (amount) newResources[resource as HoldableResource] += amount;
        }
        return { ...p, resources: newResources };
      }
      return p;
    });

    return {
      ...state,
      players: updatedPlayers,
      activeTradeOffer: null,
      phase: "main",
      updatedAt: new Date().toISOString(),
    };
  }

  // 拒否の場合、全員が拒否したらメインフェーズに戻る
  const allRejected = Object.entries(updatedResponses).every(
    ([pid, resp]) => resp === "rejected"
  );

  if (allRejected) {
    return {
      ...state,
      activeTradeOffer: null,
      phase: "main",
      updatedAt: new Date().toISOString(),
    };
  }

  // 応答を更新
  return {
    ...state,
    activeTradeOffer: {
      ...tradeOffer,
      responses: updatedResponses,
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 勝利条件をチェック
 */
function checkVictoryCondition(state: GameState): GameState {
  for (const player of state.players) {
    if (player.visibleVictoryPoints >= 10) {
      return {
        ...state,
        phase: "game_over",
        winnerId: player.id,
      };
    }
  }
  return state;
}

// ============================================
// アクションディスパッチャー
// ============================================

/**
 * ゲームアクションを処理
 */
export function processGameAction(
  state: GameState,
  action: GameAction,
  playerId: string
): GameState {
  switch (action.type) {
    case "start_game":
      return startGame(state);

    case "roll_dice":
      return handleRollDice(state, playerId);

    case "build_settlement":
      return handleBuildSettlement(state, playerId, action.intersectionId);

    case "build_city":
      return handleBuildCity(state, playerId, action.intersectionId);

    case "build_road":
      return handleBuildRoad(state, playerId, action.edgeId);

    case "end_turn":
      return handleEndTurn(state, playerId);

    case "move_robber":
      return handleMoveRobber(state, playerId, action.hexId);

    case "steal_resource":
      return handleStealResource(state, playerId, action.targetPlayerId);

    case "discard_resources":
      return handleDiscardResources(state, playerId, action.resources);

    case "trade_with_bank":
      return handleTradeWithBank(state, playerId, action.give, action.receive);

    case "buy_development_card":
      return handleBuyDevelopmentCard(state, playerId);

    case "use_development_card":
      return handleUseDevelopmentCard(
        state,
        playerId,
        action.cardType,
        action.params
      );

    case "propose_trade":
      return handleProposeTrade(
        state,
        playerId,
        action.offering,
        action.requesting
      );

    case "respond_to_trade":
      return handleRespondToTrade(
        state,
        playerId,
        action.tradeId,
        action.response
      );

    default:
      throw new Error(`Unknown action type: ${(action as GameAction).type}`);
  }
}
