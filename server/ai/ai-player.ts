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
  playerId: string,
  blockedCoordinates: Set<string> = new Set()
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
        const validIntersections = getValidSettlementLocations(state, playerId, true)
          .filter(intersection => !blockedCoordinates.has(intersection.id));
        for (const intersection of validIntersections) {
          actions.push({
            type: "build_settlement",
            description: `開拓地を建設 (位置: ${intersection.id})`,
            params: { intersectionId: intersection.id },
          });
        }
        console.log(`[AIPlayer] Setup settlement phase: ${validIntersections.length} valid locations (${blockedCoordinates.size} blocked)`);
      }
      break;

    case "setup_road_1":
    case "setup_road_2":
      if (isMyTurn) {
        const validEdges = getValidRoadLocations(state, playerId)
          .filter(edge => !blockedCoordinates.has(edge.id));
        for (const edge of validEdges) {
          actions.push({
            type: "build_road",
            description: `道を建設 (位置: ${edge.id})`,
            params: { edgeId: edge.id },
          });
        }
        console.log(`[AIPlayer] Setup road phase: ${validEdges.length} valid locations (${blockedCoordinates.size} blocked)`);
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
      console.log(`[AIPlayer] Discard phase: player ${player.name} has ${totalResources} resources:`, player.resources);
      
      if (totalResources > 7) {
        const discardCount = Math.floor(totalResources / 2);
        console.log(`[AIPlayer] Player ${player.name} needs to discard ${discardCount} resources`);
        
        // 破棄する資源の組み合わせを提案
        const discardOptions = generateDiscardOptions(player.resources, discardCount);
        console.log(`[AIPlayer] Generated ${discardOptions.length} discard options:`, discardOptions);
        
        for (const option of discardOptions.slice(0, 5)) {
          actions.push({
            type: "discard_resources",
            description: `資源を${discardCount}枚破棄`,
            params: { resources: option },
          });
        }
      } else {
        console.log(`[AIPlayer] Player ${player.name} does not need to discard (${totalResources} <= 7)`);
      }
      break;

    case "robber_move":
      if (isMyTurn) {
        const validHexes = getValidRobberLocations(state);
        console.log(`[AIPlayer] Robber move phase: found ${validHexes.length} valid hexes:`, validHexes.map(h => ({ id: h.id, type: h.resourceType, number: h.numberToken })));
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
          const validIntersections = getValidSettlementLocations(state, playerId, false)
            .filter(intersection => !blockedCoordinates.has(intersection.id));
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
          const validCityLocations = getValidCityLocations(state, playerId)
            .filter(intersection => !blockedCoordinates.has(intersection.id));
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
          const validEdges = getValidRoadLocations(state, playerId)
            .filter(edge => !blockedCoordinates.has(edge.id))
            .slice(0, 10);
          for (const edge of validEdges) {
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

        // プレイヤー間交換提案（控えめに、1ターンに最大1回まで）
        if (!state.activeTradeOffer) {
          const playerTradeOptions = getPlayerTradeOptions(state, player);
          // 最初の1つのみを提案し、条件も厳しくする
          if (playerTradeOptions.length > 0) {
            const option = playerTradeOptions[0];
            const targetPlayerName = state.players.find(p => p.id === option.targetPlayerId)?.name || 'Unknown';
            actions.push({
              type: "propose_trade",
              description: `${targetPlayerName}に交換提案: ${option.offer.resource}${option.offer.amount}枚 ⇄ ${option.request.resource}${option.request.amount}枚`,
              params: {
                targetPlayerId: option.targetPlayerId,
                offer: option.offer,
                request: option.request
              },
            });
          }
        }
      }

      // 交易提案への応答処理（自分のターンでなくても応答可能）
      if (state.activeTradeOffer && 
          state.activeTradeOffer.fromPlayerId !== playerId &&
          !state.activeTradeOffer.responses[playerId]) {
        
        console.log(`[AIPlayer] ${player.name} evaluating trade offer from player ${state.activeTradeOffer.fromPlayerId}`);
        console.log(`[AIPlayer] Trade offer:`, {
          offering: state.activeTradeOffer.offering,
          requesting: state.activeTradeOffer.requesting
        });
        
        // 交易の価値を評価
        const shouldAccept = evaluateTradeOffer(state, playerId, state.activeTradeOffer);
        console.log(`[AIPlayer] ${player.name} trade evaluation result: ${shouldAccept ? "ACCEPT" : "REJECT"}`);
        
        actions.push({
          type: "respond_to_trade",
          description: shouldAccept ? "交易提案を受け入れる" : "交易提案を拒否する",
          params: {
            tradeId: state.activeTradeOffer.id,
            response: shouldAccept ? "accept" : "reject"
          },
        });
      }

      if (isMyTurn) {
        // ターン終了
        actions.push({
          type: "end_turn",
          description: "ターンを終了",
        });
      }
      break;

    case "trade_response":
      // 交換提案への回答フェーズ
      if (state.currentPlayerId === playerId) {
        // 現在の交換提案を取得（実装はゲームロジックに依存）
        actions.push({
          type: "accept_trade",
          description: "交換提案を受け入れる",
        });
        actions.push({
          type: "reject_trade", 
          description: "交換提案を拒否する",
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
  return executeAITurnWithBlocklist(state, playerId, new Set());
}

/**
 * ブロックリスト付きAIプレイヤーのターンを実行
 * @param blockedCoordinates 失敗した座標のセット
 * @returns アクションとつぶやき（thinking）を返す
 */
export async function executeAITurnWithBlocklist(
  state: GameState,
  playerId: string,
  blockedCoordinates: Set<string>
): Promise<{ action: GameAction | null; thinking: string | null }> {
  const aiClient = getAIClient();
  if (!aiClient) {
    console.error("[AIPlayer] AI client not available");
    return { action: null, thinking: null };
  }

  const availableActions = getAvailableActionsForAI(state, playerId, blockedCoordinates);
  if (availableActions.length === 0) {
    console.warn("[AIPlayer] No available actions for AI");
    return { action: null, thinking: null };
  }

  console.log(
    `[AIPlayer] ${state.players.find((p) => p.id === playerId)?.name} is deciding...`,
    `Phase: ${state.phase}, Available actions: ${availableActions.length}`
  );
  
  // Log available actions for debugging
  if (state.phase === 'robber_move') {
    console.log(`[AIPlayer] Available robber move actions:`, availableActions.map(a => ({
      type: a.type,
      description: a.description,
      params: a.params
    })));
  }

  if (blockedCoordinates.size > 0) {
    console.log(`[AIPlayer] Blocked coordinates: ${Array.from(blockedCoordinates).join(', ')}`);
  }

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
    // game-logic.tsと同じロジックを使用
    const adjacentIntersections = getAdjacentIntersections(state, intersection.id);
    const hasAdjacentBuilding = adjacentIntersections.some(
      (adjId) => state.intersections.find((i) => i.id === adjId)?.building
    );
    
    console.log(`[AIPlayer] Checking intersection ${intersection.id}:`, {
      hasBuilding: !!intersection.building,
      adjacentIntersections,
      hasAdjacentBuilding,
      adjacentBuildings: adjacentIntersections.map(adjId => {
        const adj = state.intersections.find(i => i.id === adjId);
        return { 
          id: adjId, 
          hasBuilding: !!adj?.building, 
          buildingType: adj?.building?.type,
          player: adj?.building?.playerId,
          playerName: state.players.find(p => p.id === adj?.building?.playerId)?.name 
        };
      })
    });
    
    if (hasAdjacentBuilding) {
      console.log(`[AIPlayer] ❌ Skipping ${intersection.id} due to adjacent building constraint`);
      continue;
    }

    // 初期配置でなければ、自分の道に隣接している必要がある
    if (!isSetup) {
      const adjacentEdges = getAdjacentEdges(state, intersection.id);
      const hasOwnRoad = adjacentEdges.some(
        (edgeId) =>
          state.edges.find((e) => e.id === edgeId)?.road?.playerId === playerId
      );
      if (!hasOwnRoad) continue;
    }

    console.log(`[AIPlayer] ✅ Adding valid location: ${intersection.id}`);
    validLocations.push({ id: intersection.id });
  }

  console.log(`[AIPlayer] Found ${validLocations.length} valid settlement locations for player ${playerId}:`, 
    validLocations.map(loc => loc.id));
  
  // 最終チェック: 返却する前に全ての座標を検証
  const finalValidated = validLocations.filter(loc => {
    const vertex = parseVertexId(loc.id);
    if (!vertex) {
      console.error(`[AIPlayer] ❌ Invalid vertex ID format: ${loc.id}`);
      return false;
    }
    
    const adjacentVertices = getAdjacentVerticesForAI(vertex);
    const adjacentIds = adjacentVertices.map(vertexToIdForAI);
    const hasAdjacentBuilding = adjacentIds.some(adjId => {
      const adj = state.intersections.find(i => i.id === adjId);
      return !!adj?.building;
    });
    
    if (hasAdjacentBuilding) {
      console.error(`[AIPlayer] ❌ Final validation failed for ${loc.id} - adjacent building found`);
      return false;
    }
    
    return true;
  });

  console.log(`[AIPlayer] After final validation: ${finalValidated.length} locations remain`);
  return finalValidated;
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
  
  // Setup フェーズかどうかを判定
  const isSetupPhase = state.phase === "setup_road_1" || state.phase === "setup_road_2";

  for (const edge of state.edges) {
    // 既に道がある場所はスキップ
    if (edge.road) continue;

    // 隣接する頂点を取得
    const adjacentIntersections = getEdgeAdjacentIntersections(state, edge.id);

    if (isSetupPhase) {
      // Setup フェーズでは、直前に配置された開拓地に隣接している必要がある
      const playerSettlements = state.intersections.filter(
        (i) => i.building?.playerId === playerId && i.building.type === "settlement"
      );
      
      let targetSettlement: any = undefined;
      if (state.phase === "setup_road_1") {
        // setup_road_1 では開拓地は1つしかないはず
        targetSettlement = playerSettlements[0];
      } else if (state.phase === "setup_road_2") {
        // setup_road_2 では最新の開拓地（道がまだない開拓地）
        console.log(`[AIPlayer] setup_road_2: Looking for settlement without adjacent road`);
        console.log(`[AIPlayer] Player ${playerId} settlements:`, playerSettlements.map(s => s.id));
        
        targetSettlement = playerSettlements.find((settlement) => {
          const settlementEdges = getAdjacentEdges(state, settlement.id);
          const adjacentRoads = settlementEdges.filter(
            (edgeId) => state.edges.find((e) => e.id === edgeId)?.road?.playerId === playerId
          );
          const hasAdjacentRoad = adjacentRoads.length > 0;
          
          console.log(`[AIPlayer] Settlement ${settlement.id}:`, {
            adjacentEdges: settlementEdges,
            adjacentRoads: adjacentRoads,
            hasAdjacentRoad
          });
          
          return !hasAdjacentRoad;
        });
        
        console.log(`[AIPlayer] Selected target settlement for setup_road_2:`, targetSettlement?.id || 'none');
      }
      
      if (!targetSettlement) {
        console.warn(`[AIPlayer] No target settlement found for ${playerId} in phase ${state.phase}`);
        console.warn(`[AIPlayer] Available settlements:`, playerSettlements.map(s => ({
          id: s.id,
          hasAdjacentRoad: getAdjacentEdges(state, s.id).some(edgeId => 
            state.edges.find(e => e.id === edgeId)?.road?.playerId === playerId
          )
        })));
        continue;
      }
      
      // この辺が対象の開拓地に隣接しているかチェック
      const isAdjacentToTarget = adjacentIntersections.includes(targetSettlement.id);
      
      console.log(`[AIPlayer] Setup road check for edge ${edge.id}:`, {
        phase: state.phase,
        targetSettlement: targetSettlement.id,
        adjacentIntersections,
        isAdjacentToTarget,
        allPlayerSettlements: playerSettlements.map(s => s.id)
      });
      
      if (isAdjacentToTarget) {
        validLocations.push({ id: edge.id });
      }
    } else {
      // 通常フェーズでは、自分の建物または道に隣接している必要がある
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
  }

  console.log(`[AIPlayer] Found ${validLocations.length} valid road locations for player ${playerId} in phase ${state.phase}:`, 
    validLocations.map(loc => loc.id));

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

/**
 * 交差点に隣接するタイルの情報を取得
 */
function getAdjacentTilesForIntersection(state: GameState, intersectionId: string) {
  const adjacentHexIds = getIntersectionAdjacentHexes(state, intersectionId);
  return state.hexes.filter(hex => adjacentHexIds.includes(hex.id));
}

function generateDiscardOptions(
  resources: Record<HoldableResource, number>,
  discardCount: number
): Array<Partial<Record<HoldableResource, number>>> {
  console.log(`[AIPlayer] Generating discard options for:`, resources, `need to discard: ${discardCount}`);
  
  // 利用可能な資源のみを考慮
  const availableResources = Object.entries(resources)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]); // 多い順にソート

  if (availableResources.length === 0) {
    console.warn(`[AIPlayer] No resources available for discard`);
    return [];
  }

  // 複数の破棄オプションを生成
  const options: Array<Partial<Record<HoldableResource, number>>> = [];

  // Option 1: 最も多い資源から破棄
  const option1: Partial<Record<HoldableResource, number>> = {};
  let remaining1 = discardCount;
  for (const [resource, count] of availableResources) {
    if (remaining1 <= 0) break;
    const toDiscard = Math.min(count, remaining1);
    if (toDiscard > 0) {
      option1[resource as HoldableResource] = toDiscard;
      remaining1 -= toDiscard;
    }
  }
  if (remaining1 === 0) options.push(option1);

  // Option 2: バランス良く破棄（各資源から少しずつ）
  const option2: Partial<Record<HoldableResource, number>> = {};
  let remaining2 = discardCount;
  let pass = 0;
  while (remaining2 > 0 && pass < discardCount) {
    let discardedThisPass = false;
    for (const [resource, count] of availableResources) {
      if (remaining2 <= 0) break;
      const alreadyDiscarded = option2[resource as HoldableResource] || 0;
      if (alreadyDiscarded < count) {
        option2[resource as HoldableResource] = alreadyDiscarded + 1;
        remaining2--;
        discardedThisPass = true;
      }
    }
    if (!discardedThisPass) break;
    pass++;
  }
  if (remaining2 === 0 && JSON.stringify(option2) !== JSON.stringify(option1)) {
    options.push(option2);
  }

  // Option 3: 価値の低い資源を優先的に破棄
  const resourcePriority = { sheep: 1, wood: 2, brick: 3, wheat: 4, ore: 5 }; // 低い数字ほど破棄優先
  const option3: Partial<Record<HoldableResource, number>> = {};
  const sortedByPriority = availableResources.sort((a, b) => {
    const priorityA = resourcePriority[a[0] as HoldableResource] || 3;
    const priorityB = resourcePriority[b[0] as HoldableResource] || 3;
    return priorityA - priorityB;
  });
  let remaining3 = discardCount;
  for (const [resource, count] of sortedByPriority) {
    if (remaining3 <= 0) break;
    const toDiscard = Math.min(count, remaining3);
    if (toDiscard > 0) {
      option3[resource as HoldableResource] = toDiscard;
      remaining3 -= toDiscard;
    }
  }
  if (remaining3 === 0 && !options.some(opt => JSON.stringify(opt) === JSON.stringify(option3))) {
    options.push(option3);
  }

  console.log(`[AIPlayer] Generated ${options.length} discard options:`, options);
  return options.length > 0 ? options : [option1]; // 最低1つのオプションは返す
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

/**
 * プレイヤー間交換のオプションを生成
 */
function getPlayerTradeOptions(
  state: GameState,
  player: Player
): Array<{ 
  targetPlayerId: string; 
  offer: { resource: HoldableResource; amount: number }; 
  request: { resource: HoldableResource; amount: number } 
}> {
  const options: Array<{ 
    targetPlayerId: string; 
    offer: { resource: HoldableResource; amount: number }; 
    request: { resource: HoldableResource; amount: number } 
  }> = [];
  
  const resources: HoldableResource[] = ["wood", "brick", "wheat", "ore", "sheep"];
  const otherPlayers = state.players.filter(p => p.id !== player.id && !p.isAI); // 人間プレイヤーのみ
  
  // 自分が多く持っている資源を特定（より厳しい条件）
  const playerResourceCounts = Object.entries(player.resources)
    .filter(([, count]) => count >= 4) // 4枚以上持っているもののみ
    .sort((a, b) => b[1] - a[1]); // 多い順

  // 自分が不足している資源を特定（建設に必要な資源のみ）
  const neededResources = resources.filter(resource => {
    const currentAmount = player.resources[resource];
    // 0枚しか持っていない資源のみを対象
    return currentAmount === 0;
  });

  // 条件をさらに厳しくする：
  // 1. 本当に必要な資源がある場合のみ
  // 2. 余剰資源が十分ある場合のみ
  if (playerResourceCounts.length === 0 || neededResources.length === 0) {
    return []; // 提案しない
  }

  for (const targetPlayer of otherPlayers) {
    for (const [offerResource, offerCount] of playerResourceCounts) {
      const offerAmount = Math.min(2, Math.floor(offerCount / 2)); // より保守的：半分まで
      
      for (const requestResource of neededResources) {
        const targetHasResource = targetPlayer.resources[requestResource] >= 2; // 相手も余裕がある場合のみ
        
        if (targetHasResource && offerAmount >= 1) {
          // 20%の確率でのみ提案（さらに控えめに）
          if (Math.random() < 0.2) {
            options.push({
              targetPlayerId: targetPlayer.id,
              offer: { resource: offerResource as HoldableResource, amount: offerAmount },
              request: { resource: requestResource, amount: 1 }
            });
          }
        }
      }
    }
  }

  console.log(`[AIPlayer] Generated ${options.length} player trade options for ${player.name}:`, options);
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

/**
 * 正しい隣接頂点計算（game-logic.tsと同じロジックを使用）
 */
function getAdjacentIntersections(
  state: GameState,
  intersectionId: string
): string[] {
  // IDから座標を解析
  const vertex = parseVertexId(intersectionId);
  if (!vertex) return [];

  // game-logic.tsと同じgetAdjacentVertices関数の結果を使用
  const adjacentVertices = getAdjacentVerticesForAI(vertex);
  return adjacentVertices.map(vertexToIdForAI);
}

/**
 * AI用のvertex ID解析（game-logic.tsのparseVertexIdと同じ）
 */
function parseVertexId(id: string): { hex: { q: number; r: number; s: number }; direction: "N" | "S" } | null {
  const match = id.match(/^(-?\d+),(-?\d+),(-?\d+)_(N|S)$/);
  if (!match) return null;
  return {
    hex: { q: parseInt(match[1]), r: parseInt(match[2]), s: parseInt(match[3]) },
    direction: match[4] as "N" | "S",
  };
}

/**
 * AI用の隣接頂点計算（game-logic.tsのgetAdjacentVerticesと同じ）
 */
function getAdjacentVerticesForAI(vertex: { hex: { q: number; r: number; s: number }; direction: "N" | "S" }): Array<{ hex: { q: number; r: number; s: number }; direction: "N" | "S" }> {
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
 * AI用のvertex座標をIDに変換（game-logic.tsのvertexToIdと同じ）
 */
function vertexToIdForAI(coord: { hex: { q: number; r: number; s: number }; direction: "N" | "S" }): string {
  return `${coord.hex.q},${coord.hex.r},${coord.hex.s}_${coord.direction}`;
}

function getAdjacentEdges(state: GameState, intersectionId: string): string[] {
  const intersection = state.intersections.find((i) => i.id === intersectionId);
  if (!intersection) {
    console.warn(`[AIPlayer] getAdjacentEdges: Intersection ${intersectionId} not found`);
    return [];
  }

  // 正確な隣接エッジを取得するために、全エッジをチェック
  const adjacentEdges = state.edges.filter((edge) => {
    const edgeAdjacentIntersections = getEdgeAdjacentIntersections(state, edge.id);
    return edgeAdjacentIntersections.includes(intersectionId);
  }).map((e) => e.id);

  console.log(`[AIPlayer] getAdjacentEdges for ${intersectionId}:`, adjacentEdges);
  return adjacentEdges;
}

/**
 * game-logic.tsと同じ正確な隣接判定ロジック
 */
function getEdgeAdjacentIntersections(
  state: GameState,
  edgeId: string
): string[] {
  // Edge IDから座標を解析
  const edgeCoord = parseEdgeIdForAI(edgeId);
  if (!edgeCoord) {
    console.warn(`[AIPlayer] Invalid edge ID format: ${edgeId}`);
    return [];
  }

  // game-logic.tsのgetAdjacentVerticesForEdge関数と同じロジック
  const adjacentVertices = getAdjacentVerticesForEdgeAI(edgeCoord);
  return adjacentVertices.map(vertexToIdForAI);
}

/**
 * Edge ID解析（game-logic.tsのparseEdgeIdと同じ）
 */
function parseEdgeIdForAI(id: string): { hex: { q: number; r: number; s: number }; direction: "NE" | "E" | "SE" } | null {
  const match = id.match(/^(-?\d+),(-?\d+),(-?\d+)_(NE|E|SE)$/);
  if (!match) return null;
  return {
    hex: { q: parseInt(match[1]), r: parseInt(match[2]), s: parseInt(match[3]) },
    direction: match[4] as "NE" | "E" | "SE",
  };
}

/**
 * エッジに隣接する頂点を取得（game-logic.tsのgetAdjacentVerticesForEdgeと同じ）
 */
function getAdjacentVerticesForEdgeAI(edge: { hex: { q: number; r: number; s: number }; direction: "NE" | "E" | "SE" }): Array<{ hex: { q: number; r: number; s: number }; direction: "N" | "S" }> {
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

/**
 * 交易提案を評価して受け入れるかどうかを決定
 */
function evaluateTradeOffer(
  state: GameState,
  playerId: string,
  tradeOffer: { offering: Partial<Record<string, number>>; requesting: Partial<Record<string, number>> }
): boolean {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return false;

  // 相手が要求する資源を持っているかチェック
  for (const [resource, amount] of Object.entries(tradeOffer.requesting)) {
    if (amount && (player.resources[resource as keyof typeof player.resources] || 0) < amount) {
      return false; // 要求された資源が足りない場合は拒否
    }
  }

  // 簡単な評価ロジック：
  // - 自分が必要な資源を相手が提供してくれる場合は受け入れる可能性が高い
  // - 自分が余っている資源を要求された場合は受け入れやすい

  const resourcePriority = getResourcePriority(state, player);
  
  let tradeValue = 0;
  
  // 受け取る資源の価値を計算
  for (const [resource, amount] of Object.entries(tradeOffer.offering)) {
    if (amount) {
      const priority = resourcePriority[resource as keyof typeof resourcePriority] || 1;
      tradeValue += amount * priority;
    }
  }
  
  // 失う資源の価値を計算
  for (const [resource, amount] of Object.entries(tradeOffer.requesting)) {
    if (amount) {
      const priority = resourcePriority[resource as keyof typeof resourcePriority] || 1;
      const currentAmount = player.resources[resource as keyof typeof player.resources] || 0;
      
      // 資源が少ない場合は手放したくない
      const scarcityMultiplier = currentAmount <= 2 ? 2 : 1;
      tradeValue -= amount * priority * scarcityMultiplier;
    }
  }

  // トレードの価値がプラスなら受け入れる（20%の確率で少し損でも受け入れる）
  return tradeValue > 0 || Math.random() < 0.2;
}

/**
 * 現在の状況に基づいて資源の優先度を計算
 */
function getResourcePriority(state: GameState, player: Player): Record<string, number> {
  const priority: Record<string, number> = {
    wood: 1,
    brick: 1,
    wheat: 1,
    ore: 1,
    sheep: 1
  };

  // 建設可能なもので優先度を調整
  if (canBuild(player, "settlement")) {
    priority.wood += 1;
    priority.brick += 1;
    priority.wheat += 1;
    priority.sheep += 1;
  }

  if (canBuild(player, "city")) {
    priority.ore += 2;
    priority.wheat += 2;
  }

  if (canBuild(player, "road")) {
    priority.wood += 0.5;
    priority.brick += 0.5;
  }

  // 発展カードが買える場合
  if (player.resources.ore >= 1 && player.resources.wheat >= 1 && player.resources.sheep >= 1) {
    priority.ore += 0.5;
    priority.wheat += 0.5;
    priority.sheep += 0.5;
  }

  return priority;
}
