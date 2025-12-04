/**
 * AI プレイヤー管理
 * CPUプレイヤーの作成・ターン実行を管理
 */

import { v4 as uuidv4 } from "uuid";
import type {
  GameState,
  Player,
  GameAction,
  AvailableAction,
  HoldableResource,
  PlayerColor,
  DevelopmentCardType,
} from "../../types/game";
import { BUILD_COSTS, INITIAL_RESOURCES, INITIAL_PIECES } from "../../types/game";
import { AIClient, getAIClient, isAIAvailable } from "./ai-client";

// CPUプレイヤー名のプール
const CPU_NAMES = [
  "CPU Alice",
  "CPU Bob",
  "CPU Carol",
  "CPU Dave",
];

// AIリアクションのテンプレート（アクションタイプ別）
const AI_REACTIONS: Record<string, string[]> = {
  roll_dice: [
    "お、サイコロだ",
    "何が出るかな？",
    "ドキドキ...",
    "いい目出ろ〜",
  ],
  dice_seven: [
    "7かー...",
    "盗賊だ！",
    "やられた...",
    "うわ、7だ",
  ],
  dice_good: [
    "いい目じゃん！",
    "おお！資源ゲット",
    "ラッキー！",
    "やるな〜",
  ],
  dice_bad: [
    "外れか...",
    "残念",
    "うーん",
    "まあそんな時もある",
  ],
  build_settlement: [
    "開拓地か〜",
    "やるなぁ",
    "先を越された",
    "いい場所だ",
  ],
  build_city: [
    "都市！すごい",
    "強くなってきた",
    "負けてられない",
    "うわ、都市だ",
  ],
  build_road: [
    "道を伸ばすか",
    "どこまで行くんだ？",
    "拡張してるな",
    "ふむふむ",
  ],
  buy_development_card: [
    "発展カード買ったか",
    "何のカードだろ",
    "秘密兵器？",
    "カードか〜",
  ],
  use_knight: [
    "騎士カード！",
    "盗賊移動か",
    "こっち来ないで...",
    "うわっ",
  ],
  end_turn: [
    "ターン終了か",
    "次は誰だ？",
    "さて...",
    "よし",
  ],
  trade_with_bank: [
    "銀行交易か",
    "交換してる",
    "なるほど",
    "うまいな",
  ],
  default: [
    "ふむふむ",
    "なるほど",
    "そうくるか",
    "へぇ〜",
  ],
};

/**
 * AIプレイヤーのリアクションつぶやきを生成（ランダム）
 * @param actionType 他のプレイヤーが行ったアクションタイプ
 * @param diceTotal サイコロの合計値（サイコロアクションの場合）
 * @param aiPlayer リアクションするAIプレイヤー
 * @returns つぶやき文字列
 */
export function generateAIReaction(
  actionType: string,
  diceTotal?: number,
  aiPlayer?: Player
): string {
  let reactions: string[];

  if (actionType === "roll_dice" && diceTotal !== undefined) {
    if (diceTotal === 7) {
      reactions = AI_REACTIONS.dice_seven;
    } else if (diceTotal >= 6 && diceTotal <= 8) {
      reactions = AI_REACTIONS.dice_good;
    } else {
      reactions = [...AI_REACTIONS.roll_dice, ...AI_REACTIONS.dice_bad];
    }
  } else {
    reactions = AI_REACTIONS[actionType] || AI_REACTIONS.default;
  }

  const reaction = reactions[Math.floor(Math.random() * reactions.length)];
  return reaction;
}

// 利用可能な色
const COLORS: PlayerColor[] = ["red", "blue", "orange", "white"];

/**
 * CPUプレイヤーを作成
 */
export function createCPUPlayer(existingPlayers: Player[]): Player | null {
  // AIが利用可能かチェック
  if (!isAIAvailable()) {
    console.warn("[AIPlayer] AI is not available. Cannot create CPU player.");
    return null;
  }

  // 利用可能な色を取得
  const usedColors = existingPlayers.map((p) => p.color);
  const availableColors = COLORS.filter((c) => !usedColors.includes(c));

  if (availableColors.length === 0) {
    console.warn("[AIPlayer] No available colors for CPU player.");
    return null;
  }

  // CPUの人数をカウント
  const cpuCount = existingPlayers.filter((p) => p.isAI).length;
  const cpuName = CPU_NAMES[cpuCount] || `CPU ${cpuCount + 1}`;

  const player: Player = {
    id: `cpu_${uuidv4()}`,
    name: cpuName,
    color: availableColors[0],
    resources: { ...INITIAL_RESOURCES },
    developmentCards: [],
    knightsPlayed: 0,
    hasLongestRoad: false,
    hasLargestArmy: false,
    visibleVictoryPoints: 0,
    remainingPieces: { ...INITIAL_PIECES },
    isConnected: true,
    isAI: true,
  };

  console.log(`[AIPlayer] Created CPU player: ${player.name} (${player.id})`);
  return player;
}

/**
 * プレイヤーがAIかどうか
 */
export function isAIPlayer(player: Player): boolean {
  return player.isAI === true;
}

/**
 * ゲーム状態からAIプレイヤーの利用可能なアクションを取得
 */
export function getAvailableActionsForAI(
  state: GameState,
  playerId: string
): AvailableAction[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];

  const isMyTurn = state.currentPlayerId === playerId;
  const actions: AvailableAction[] = [];

  switch (state.phase) {
    case "waiting":
      // AIは自分でゲーム開始しない
      break;

    case "setup_settlement_1":
    case "setup_settlement_2":
      if (isMyTurn) {
        const validIntersections = getValidSettlementLocations(state, playerId, true);
        for (const intersection of validIntersections) {
          actions.push({
            type: "build_settlement",
            description: `開拓地を建設 (位置: ${intersection.id})`,
            params: { intersectionId: intersection.id },
          });
        }
      }
      break;

    case "setup_road_1":
    case "setup_road_2":
      if (isMyTurn) {
        const validEdges = getValidRoadLocations(state, playerId);
        for (const edge of validEdges) {
          actions.push({
            type: "build_road",
            description: `道を建設 (位置: ${edge.id})`,
            params: { edgeId: edge.id },
          });
        }
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
        // 破棄する資源の組み合わせを提案
        const discardOptions = generateDiscardOptions(player.resources, discardCount);
        for (const option of discardOptions.slice(0, 5)) {
          actions.push({
            type: "discard_resources",
            description: `資源を${discardCount}枚破棄`,
            params: { resources: option },
          });
        }
      }
      break;

    case "robber_move":
      if (isMyTurn) {
        const validHexes = getValidRobberLocations(state);
        for (const hex of validHexes) {
          actions.push({
            type: "move_robber",
            description: `盗賊を移動 (${hex.resourceType}タイル、数字${hex.numberToken || "なし"})`,
            params: { hexId: hex.id },
          });
        }
      }
      break;

    case "robber_steal":
      if (isMyTurn) {
        const stealTargets = getStealTargets(state, playerId);
        for (const target of stealTargets) {
          actions.push({
            type: "steal_resource",
            description: `${target.name}から資源を奪う`,
            params: { targetPlayerId: target.id },
          });
        }
        // 対象がいない場合は空のアクション
        if (stealTargets.length === 0) {
          actions.push({
            type: "steal_resource",
            description: "奪える対象がいない",
            params: { targetPlayerId: "" },
          });
        }
      }
      break;

    case "road_building_1":
    case "road_building_2":
      if (isMyTurn) {
        const validEdges = getValidRoadLocations(state, playerId);
        for (const edge of validEdges) {
          actions.push({
            type: "build_road",
            description: `道を建設 (位置: ${edge.id})`,
            params: { edgeId: edge.id },
          });
        }
      }
      break;

    case "main":
      if (isMyTurn) {
        // 開拓地建設
        if (canBuild(player, "settlement")) {
          const validIntersections = getValidSettlementLocations(state, playerId, false);
          for (const intersection of validIntersections) {
            actions.push({
              type: "build_settlement",
              description: `開拓地を建設 (位置: ${intersection.id})`,
              params: { intersectionId: intersection.id },
            });
          }
        }

        // 都市建設
        if (canBuild(player, "city")) {
          const validCityLocations = getValidCityLocations(state, playerId);
          for (const intersection of validCityLocations) {
            actions.push({
              type: "build_city",
              description: `都市を建設 (位置: ${intersection.id})`,
              params: { intersectionId: intersection.id },
            });
          }
        }

        // 道建設
        if (canBuild(player, "road")) {
          const validEdges = getValidRoadLocations(state, playerId);
          for (const edge of validEdges.slice(0, 10)) {
            actions.push({
              type: "build_road",
              description: `道を建設 (位置: ${edge.id})`,
              params: { edgeId: edge.id },
            });
          }
        }

        // 発展カード購入
        if (
          canBuild(player, "developmentCard") &&
          state.developmentCardDeckCount > 0
        ) {
          actions.push({
            type: "buy_development_card",
            description: "発展カードを購入",
          });
        }

        // 発展カード使用
        const usableCards = player.developmentCards.filter(
          (card) =>
            !state.cardsBoughtThisTurn.includes(card) &&
            card !== "victoryPoint"
        );
        const uniqueCards = [...new Set(usableCards)];
        for (const cardType of uniqueCards) {
          actions.push({
            type: "use_development_card",
            description: `${getCardName(cardType)}を使用`,
            params: { cardType },
          });
        }

        // 銀行交易
        const bankTradeOptions = getBankTradeOptions(state, player);
        for (const option of bankTradeOptions.slice(0, 5)) {
          actions.push({
            type: "trade_with_bank",
            description: `銀行交易: ${option.give.resource}${option.give.amount}枚 → ${option.receive}1枚`,
            params: option,
          });
        }

        // ターン終了
        actions.push({
          type: "end_turn",
          description: "ターンを終了",
        });
      }
      break;
  }

  return actions;
}

/**
 * AIプレイヤーのターンを実行
 * @returns アクションとつぶやき（thinking）を返す
 */
export async function executeAITurn(
  state: GameState,
  playerId: string
): Promise<{ action: GameAction | null; thinking: string | null }> {
  const aiClient = getAIClient();
  if (!aiClient) {
    console.error("[AIPlayer] AI client not available");
    return { action: null, thinking: null };
  }

  const availableActions = getAvailableActionsForAI(state, playerId);
  if (availableActions.length === 0) {
    console.warn("[AIPlayer] No available actions for AI");
    return { action: null, thinking: null };
  }

  console.log(
    `[AIPlayer] ${state.players.find((p) => p.id === playerId)?.name} is deciding...`,
    `Phase: ${state.phase}, Available actions: ${availableActions.length}`
  );

  const result = await aiClient.decideAction(state, playerId, availableActions);
  return result;
}

// ============================================
// ヘルパー関数
// ============================================

function canBuild(
  player: Player,
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

function getValidSettlementLocations(
  state: GameState,
  playerId: string,
  isSetup: boolean
): Array<{ id: string }> {
  const validLocations: Array<{ id: string }> = [];

  for (const intersection of state.intersections) {
    // 既に建物がある場所はスキップ
    if (intersection.building) continue;

    // 隣接する頂点に建物がないかチェック（2マスルール）
    const adjacentIntersections = getAdjacentIntersections(state, intersection.id);
    const hasAdjacentBuilding = adjacentIntersections.some(
      (adjId) => state.intersections.find((i) => i.id === adjId)?.building
    );
    if (hasAdjacentBuilding) continue;

    // 初期配置でなければ、自分の道に隣接している必要がある
    if (!isSetup) {
      const adjacentEdges = getAdjacentEdges(state, intersection.id);
      const hasOwnRoad = adjacentEdges.some(
        (edgeId) =>
          state.edges.find((e) => e.id === edgeId)?.road?.playerId === playerId
      );
      if (!hasOwnRoad) continue;
    }

    validLocations.push({ id: intersection.id });
  }

  return validLocations;
}

function getValidCityLocations(
  state: GameState,
  playerId: string
): Array<{ id: string }> {
  return state.intersections
    .filter(
      (i) =>
        i.building?.playerId === playerId && i.building?.type === "settlement"
    )
    .map((i) => ({ id: i.id }));
}

function getValidRoadLocations(
  state: GameState,
  playerId: string
): Array<{ id: string }> {
  const validLocations: Array<{ id: string }> = [];

  for (const edge of state.edges) {
    // 既に道がある場所はスキップ
    if (edge.road) continue;

    // 自分の建物または道に隣接している必要がある
    const adjacentIntersections = getEdgeAdjacentIntersections(state, edge.id);
    const adjacentEdges = getEdgeAdjacentEdges(state, edge.id);

    const hasOwnBuilding = adjacentIntersections.some(
      (intId) =>
        state.intersections.find((i) => i.id === intId)?.building?.playerId ===
        playerId
    );
    const hasOwnRoad = adjacentEdges.some(
      (edgeId) =>
        state.edges.find((e) => e.id === edgeId)?.road?.playerId === playerId
    );

    if (hasOwnBuilding || hasOwnRoad) {
      validLocations.push({ id: edge.id });
    }
  }

  return validLocations;
}

function getValidRobberLocations(
  state: GameState
): Array<{ id: string; resourceType: string; numberToken: number | null }> {
  return state.hexes
    .filter((h) => !h.hasRobber && h.resourceType !== "desert")
    .map((h) => ({
      id: h.id,
      resourceType: h.resourceType,
      numberToken: h.numberToken,
    }));
}

function getStealTargets(
  state: GameState,
  robberPlayerId: string
): Array<{ id: string; name: string }> {
  const robberHex = state.hexes.find((h) => h.hasRobber);
  if (!robberHex) return [];

  // 盗賊のいるタイルに隣接する建物を持つプレイヤー
  const targets = new Set<string>();
  for (const intersection of state.intersections) {
    if (
      intersection.building &&
      intersection.building.playerId !== robberPlayerId
    ) {
      // この頂点が盗賊のタイルに隣接しているかチェック
      const adjacentHexes = getIntersectionAdjacentHexes(state, intersection.id);
      if (adjacentHexes.includes(robberHex.id)) {
        const player = state.players.find(
          (p) => p.id === intersection.building?.playerId
        );
        if (player) {
          const totalResources = Object.values(player.resources).reduce(
            (a, b) => a + b,
            0
          );
          if (totalResources > 0) {
            targets.add(player.id);
          }
        }
      }
    }
  }

  return Array.from(targets).map((id) => ({
    id,
    name: state.players.find((p) => p.id === id)?.name || "Unknown",
  }));
}

function generateDiscardOptions(
  resources: Record<HoldableResource, number>,
  discardCount: number
): Array<Partial<Record<HoldableResource, number>>> {
  // 簡易的な実装: 最も多い資源から順に破棄
  const sorted = Object.entries(resources)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  const result: Partial<Record<HoldableResource, number>> = {};
  let remaining = discardCount;

  for (const [resource, count] of sorted) {
    if (remaining <= 0) break;
    const toDiscard = Math.min(count, remaining);
    result[resource as HoldableResource] = toDiscard;
    remaining -= toDiscard;
  }

  return [result];
}

function getBankTradeOptions(
  state: GameState,
  player: Player
): Array<{ give: { resource: HoldableResource; amount: number }; receive: HoldableResource }> {
  const options: Array<{ give: { resource: HoldableResource; amount: number }; receive: HoldableResource }> = [];
  const resources: HoldableResource[] = ["wood", "brick", "wheat", "ore", "sheep"];

  // 各資源について交換レートを計算
  for (const giveResource of resources) {
    const tradeRate = getTradeRate(state, player.id, giveResource);
    if (player.resources[giveResource] >= tradeRate) {
      for (const receiveResource of resources) {
        if (giveResource !== receiveResource) {
          options.push({
            give: { resource: giveResource, amount: tradeRate },
            receive: receiveResource,
          });
        }
      }
    }
  }

  return options;
}

function getTradeRate(
  state: GameState,
  playerId: string,
  resource: HoldableResource
): number {
  // プレイヤーの建物がある港をチェック
  let bestRate = 4; // デフォルトは4:1

  for (const intersection of state.intersections) {
    if (intersection.building?.playerId === playerId && intersection.port) {
      if (intersection.port.resourceType === resource) {
        return intersection.port.ratio; // 2:1港
      }
      if (intersection.port.resourceType === null) {
        bestRate = Math.min(bestRate, intersection.port.ratio); // 3:1港
      }
    }
  }

  return bestRate;
}

function getCardName(cardType: DevelopmentCardType): string {
  const names: Record<DevelopmentCardType, string> = {
    knight: "騎士カード",
    victoryPoint: "勝利点カード",
    roadBuilding: "街道建設",
    yearOfPlenty: "収穫",
    monopoly: "独占",
  };
  return names[cardType] || cardType;
}

// ============================================
// 隣接関係の取得（簡易実装）
// 実際にはボードの構造に基づいて計算する必要があります
// ============================================

function getAdjacentIntersections(
  state: GameState,
  intersectionId: string
): string[] {
  // 隣接頂点のIDを取得（実装はボード構造に依存）
  // ここでは簡易的に、IDから座標を解析して隣接を計算
  const intersection = state.intersections.find((i) => i.id === intersectionId);
  if (!intersection) return [];

  const adjacent: string[] = [];
  const coord = intersection.coordinate;

  // 隣接する辺を経由して隣接頂点を探す
  for (const edge of state.edges) {
    const edgeCoord = edge.coordinate;
    // 頂点と辺の隣接関係をチェック
    if (isEdgeAdjacentToIntersection(edgeCoord, coord)) {
      // この辺のもう一方の端点を取得
      for (const otherInt of state.intersections) {
        if (
          otherInt.id !== intersectionId &&
          isEdgeAdjacentToIntersection(edgeCoord, otherInt.coordinate)
        ) {
          adjacent.push(otherInt.id);
        }
      }
    }
  }

  return [...new Set(adjacent)];
}

function getAdjacentEdges(state: GameState, intersectionId: string): string[] {
  const intersection = state.intersections.find((i) => i.id === intersectionId);
  if (!intersection) return [];

  return state.edges
    .filter((e) => isEdgeAdjacentToIntersection(e.coordinate, intersection.coordinate))
    .map((e) => e.id);
}

function getEdgeAdjacentIntersections(
  state: GameState,
  edgeId: string
): string[] {
  const edge = state.edges.find((e) => e.id === edgeId);
  if (!edge) return [];

  return state.intersections
    .filter((i) => isEdgeAdjacentToIntersection(edge.coordinate, i.coordinate))
    .map((i) => i.id);
}

function getEdgeAdjacentEdges(state: GameState, edgeId: string): string[] {
  const edge = state.edges.find((e) => e.id === edgeId);
  if (!edge) return [];

  // 辺の両端点を取得
  const endpoints = getEdgeAdjacentIntersections(state, edgeId);

  // 両端点に隣接する他の辺を取得
  const adjacentEdges: string[] = [];
  for (const intId of endpoints) {
    const edges = getAdjacentEdges(state, intId);
    for (const e of edges) {
      if (e !== edgeId) {
        adjacentEdges.push(e);
      }
    }
  }

  return [...new Set(adjacentEdges)];
}

function getIntersectionAdjacentHexes(
  state: GameState,
  intersectionId: string
): string[] {
  const intersection = state.intersections.find((i) => i.id === intersectionId);
  if (!intersection) return [];

  // 頂点に隣接するヘックスを取得
  return state.hexes
    .filter((h) => isHexAdjacentToIntersection(h.coordinate, intersection.coordinate))
    .map((h) => h.id);
}

// ============================================
// 座標ベースの隣接判定
// ============================================

function isEdgeAdjacentToIntersection(
  edgeCoord: { hex: { q: number; r: number; s: number }; direction: "NE" | "E" | "SE" },
  intCoord: { hex: { q: number; r: number; s: number }; direction: "N" | "S" }
): boolean {
  const eh = edgeCoord.hex;
  const ih = intCoord.hex;

  // 辺と頂点の隣接パターン
  if (edgeCoord.direction === "NE") {
    if (intCoord.direction === "N") {
      return (eh.q === ih.q && eh.r === ih.r) || (eh.q === ih.q + 1 && eh.r === ih.r - 1);
    } else {
      return eh.q === ih.q + 1 && eh.r === ih.r;
    }
  } else if (edgeCoord.direction === "E") {
    if (intCoord.direction === "N") {
      return eh.q === ih.q + 1 && eh.r === ih.r - 1;
    } else {
      return eh.q === ih.q + 1 && eh.r === ih.r;
    }
  } else {
    // SE
    if (intCoord.direction === "N") {
      return eh.q === ih.q + 1 && eh.r === ih.r;
    } else {
      return (eh.q === ih.q && eh.r === ih.r) || (eh.q === ih.q + 1 && eh.r === ih.r);
    }
  }
}

function isHexAdjacentToIntersection(
  hexCoord: { q: number; r: number; s: number },
  intCoord: { hex: { q: number; r: number; s: number }; direction: "N" | "S" }
): boolean {
  const h = hexCoord;
  const ih = intCoord.hex;

  if (intCoord.direction === "N") {
    // 北向き頂点に隣接するヘックス
    return (
      (h.q === ih.q && h.r === ih.r) ||
      (h.q === ih.q && h.r === ih.r - 1) ||
      (h.q === ih.q + 1 && h.r === ih.r - 1)
    );
  } else {
    // 南向き頂点に隣接するヘックス
    return (
      (h.q === ih.q && h.r === ih.r) ||
      (h.q === ih.q && h.r === ih.r + 1) ||
      (h.q === ih.q - 1 && h.r === ih.r + 1)
    );
  }
}
