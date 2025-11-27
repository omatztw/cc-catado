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
  return [
    { hex, direction: "N" },
    { hex, direction: "S" },
    { hex: { q: hex.q + 1, r: hex.r - 1, s: hex.s }, direction: "S" },
    { hex: { q: hex.q + 1, r: hex.r, s: hex.s - 1 }, direction: "N" },
    { hex: { q: hex.q, r: hex.r + 1, s: hex.s - 1 }, direction: "N" },
    { hex: { q: hex.q - 1, r: hex.r + 1, s: hex.s }, direction: "N" },
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
 * 頂点（Intersection）を生成
 */
function generateIntersections(hexes: Hex[]): Intersection[] {
  const intersectionMap = new Map<string, Intersection>();

  for (const hex of hexes) {
    const vertices = getHexVertices(hex.coordinate);
    for (const vertex of vertices) {
      const id = vertexToId(vertex);
      if (!intersectionMap.has(id)) {
        intersectionMap.set(id, {
          id,
          coordinate: vertex,
          building: null,
          port: null,
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
export function createInitialGameState(roomId: string): GameState {
  const hexes = generateHexes();
  const intersections = generateIntersections(hexes);
  const edges = generateEdges(hexes);

  return {
    id: roomId,
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
    developmentCardDeckCount: 25,
    winnerId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
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
  const updatedPlayers = state.players.map((p) => {
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

  // フェーズ更新
  let nextPhase = state.phase;
  if (state.phase === "setup_settlement_1") {
    nextPhase = "setup_road_1";
  } else if (state.phase === "setup_settlement_2") {
    nextPhase = "setup_road_2";
  }

  return {
    ...state,
    intersections: updatedIntersections,
    players: updatedPlayers,
    phase: nextPhase as GamePhase,
    updatedAt: new Date().toISOString(),
  };
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

  if (!isSetupPhase) {
    if (state.phase !== "main") {
      throw new Error("Cannot build in current phase");
    }

    // コスト確認（wood:1, brick:1）
    if (player.resources.wood < 1 || player.resources.brick < 1) {
      throw new Error("Not enough resources");
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

  return {
    ...state,
    edges: updatedEdges,
    players: updatedPlayers,
    phase: nextPhase as GamePhase,
    currentPlayerId: nextPlayerId,
    updatedAt: new Date().toISOString(),
  };
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

    case "build_road":
      return handleBuildRoad(state, playerId, action.edgeId);

    case "end_turn":
      return handleEndTurn(state, playerId);

    case "move_robber":
      return handleMoveRobber(state, playerId, action.hexId);

    // 他のアクションは後続の実装で追加
    default:
      throw new Error(`Unknown action type: ${(action as GameAction).type}`);
  }
}
