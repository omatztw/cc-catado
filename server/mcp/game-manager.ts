/**
 * MCP用ゲームマネージャー
 * ローカルメモリでゲーム状態を管理し、AIプレイヤーがMCPを通じてプレイできるようにする
 */

import { v4 as uuidv4 } from "uuid";
import type {
  GameState,
  GameAction,
  GamePhase,
  Player,
  HoldableResource,
  Intersection,
  Edge,
  Hex,
  PlayerResources,
  DevelopmentCardType,
} from "@/types/game";
import { BUILD_COSTS } from "@/types/game";
import {
  createInitialGameState,
  addPlayerToGame,
  takeSeat,
  startGame,
  processGameAction,
  filterStateForPlayer,
} from "../game-logic";

// ============================================
// 型定義
// ============================================

export interface GameInfo {
  gameId: string;
  state: GameState;
  aiPlayerId: string;
  createdAt: string;
}

export interface AvailableAction {
  type: string;
  description: string;
  params?: Record<string, unknown>;
}

export interface BuildableLocation {
  id: string;
  description: string;
}

// ============================================
// ゲームマネージャークラス
// ============================================

class GameManager {
  private games: Map<string, GameInfo> = new Map();

  /**
   * 新しいゲームを作成
   * AIプレイヤーとCPUプレイヤーを追加
   */
  createGame(aiPlayerName: string, cpuCount: number = 2): GameInfo {
    const gameId = uuidv4().substring(0, 8);
    const aiPlayerId = `ai_${uuidv4().substring(0, 8)}`;

    // 初期ゲーム状態を作成
    let state = createInitialGameState(gameId, aiPlayerId);

    // AIプレイヤーを追加
    state = addPlayerToGame(state, aiPlayerId, aiPlayerName);
    state = takeSeat(state, aiPlayerId);

    // CPUプレイヤーを追加（2-3人）
    const cpuNames = ["CPU 1", "CPU 2", "CPU 3"];

    for (let i = 0; i < Math.min(cpuCount, 3); i++) {
      const cpuId = `cpu_${uuidv4().substring(0, 8)}`;
      state = addPlayerToGame(state, cpuId, cpuNames[i]);
      state = takeSeat(state, cpuId);
    }

    const gameInfo: GameInfo = {
      gameId,
      state,
      aiPlayerId,
      createdAt: new Date().toISOString(),
    };

    this.games.set(gameId, gameInfo);
    return gameInfo;
  }

  /**
   * ゲームを取得
   */
  getGame(gameId: string): GameInfo | undefined {
    return this.games.get(gameId);
  }

  /**
   * すべてのゲームを取得
   */
  getAllGames(): GameInfo[] {
    return Array.from(this.games.values());
  }

  /**
   * ゲームを開始
   */
  startGame(gameId: string): GameState {
    const gameInfo = this.games.get(gameId);
    if (!gameInfo) {
      throw new Error(`Game not found: ${gameId}`);
    }

    if (gameInfo.state.phase !== "waiting") {
      throw new Error(`Game already started or finished`);
    }

    if (gameInfo.state.players.length < 3) {
      throw new Error(`Need at least 3 players to start`);
    }

    gameInfo.state = startGame(gameInfo.state);
    return gameInfo.state;
  }

  /**
   * ゲームアクションを実行
   */
  executeAction(
    gameId: string,
    action: { type: string; [key: string]: unknown },
    playerId?: string
  ): GameState {
    const gameInfo = this.games.get(gameId);
    if (!gameInfo) {
      throw new Error(`Game not found: ${gameId}`);
    }

    const effectivePlayerId = playerId || gameInfo.aiPlayerId;
    const fullAction = { ...action, roomId: gameId } as GameAction;

    gameInfo.state = processGameAction(
      gameInfo.state,
      fullAction,
      effectivePlayerId
    );

    return gameInfo.state;
  }

  /**
   * AIプレイヤー用にフィルタリングされた状態を取得
   */
  getFilteredState(gameId: string): GameState {
    const gameInfo = this.games.get(gameId);
    if (!gameInfo) {
      throw new Error(`Game not found: ${gameId}`);
    }

    return filterStateForPlayer(gameInfo.state, gameInfo.aiPlayerId);
  }

  /**
   * 現在実行可能なアクションを取得
   */
  getAvailableActions(gameId: string): AvailableAction[] {
    const gameInfo = this.games.get(gameId);
    if (!gameInfo) {
      throw new Error(`Game not found: ${gameId}`);
    }

    const state = gameInfo.state;
    const aiPlayerId = gameInfo.aiPlayerId;
    const isMyTurn = state.currentPlayerId === aiPlayerId;
    const player = state.players.find((p) => p.id === aiPlayerId);

    if (!player) {
      return [];
    }

    const actions: AvailableAction[] = [];

    switch (state.phase) {
      case "waiting":
        if (state.players.length >= 3) {
          actions.push({
            type: "start_game",
            description: "ゲームを開始する",
          });
        }
        break;

      case "setup_settlement_1":
      case "setup_settlement_2":
        if (isMyTurn) {
          const locations = this.getBuildableSettlementLocations(
            state,
            aiPlayerId,
            true
          );
          if (locations.length > 0) {
            actions.push({
              type: "build_settlement",
              description: `開拓地を建設する（初期配置）。建設可能な場所: ${locations.map((l) => l.id).join(", ")}`,
              params: { availableLocations: locations },
            });
          }
        }
        break;

      case "setup_road_1":
      case "setup_road_2":
        if (isMyTurn) {
          const locations = this.getBuildableRoadLocations(
            state,
            aiPlayerId,
            true
          );
          if (locations.length > 0) {
            actions.push({
              type: "build_road",
              description: `道を建設する（初期配置）。建設可能な場所: ${locations.map((l) => l.id).join(", ")}`,
              params: { availableLocations: locations },
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
        // 破棄が必要かチェック
        const totalResources = Object.values(player.resources).reduce(
          (a, b) => a + b,
          0
        );
        if (totalResources > 7) {
          const discardCount = Math.floor(totalResources / 2);
          actions.push({
            type: "discard_resources",
            description: `資源を${discardCount}枚破棄する（合計${totalResources}枚所持）`,
            params: {
              currentResources: player.resources,
              discardCount,
            },
          });
        }
        break;

      case "robber_move":
        if (isMyTurn) {
          const validHexes = this.getValidRobberDestinations(state);
          actions.push({
            type: "move_robber",
            description: `盗賊を移動する。移動可能な場所: ${validHexes.map((h) => h.id).join(", ")}`,
            params: { availableHexes: validHexes },
          });
        }
        break;

      case "robber_steal":
        if (isMyTurn) {
          const stealTargets = this.getStealTargets(state, aiPlayerId);
          if (stealTargets.length > 0) {
            actions.push({
              type: "steal_resource",
              description: `資源を奪う対象を選ぶ。対象プレイヤー: ${stealTargets.map((t) => `${t.name}(${t.id})`).join(", ")}`,
              params: { targets: stealTargets },
            });
          }
        }
        break;

      case "road_building_1":
      case "road_building_2":
        if (isMyTurn) {
          const locations = this.getBuildableRoadLocations(
            state,
            aiPlayerId,
            true
          );
          if (locations.length > 0) {
            actions.push({
              type: "build_road",
              description: `道を建設する（街道建設カード）。建設可能な場所: ${locations.map((l) => l.id).join(", ")}`,
              params: { availableLocations: locations },
            });
          }
        }
        break;

      case "main":
        if (isMyTurn) {
          // 開拓地建設
          if (this.canBuild(player, "settlement")) {
            const locations = this.getBuildableSettlementLocations(
              state,
              aiPlayerId,
              false
            );
            if (locations.length > 0) {
              actions.push({
                type: "build_settlement",
                description: `開拓地を建設する（木材1、レンガ1、小麦1、羊毛1）。建設可能な場所: ${locations.map((l) => l.id).join(", ")}`,
                params: {
                  cost: BUILD_COSTS.settlement,
                  availableLocations: locations,
                },
              });
            }
          }

          // 都市建設
          if (this.canBuild(player, "city")) {
            const locations = this.getBuildableCityLocations(state, aiPlayerId);
            if (locations.length > 0) {
              actions.push({
                type: "build_city",
                description: `都市を建設する（小麦2、鉱石3）。建設可能な場所: ${locations.map((l) => l.id).join(", ")}`,
                params: {
                  cost: BUILD_COSTS.city,
                  availableLocations: locations,
                },
              });
            }
          }

          // 道建設
          if (this.canBuild(player, "road")) {
            const locations = this.getBuildableRoadLocations(
              state,
              aiPlayerId,
              false
            );
            if (locations.length > 0) {
              actions.push({
                type: "build_road",
                description: `道を建設する（木材1、レンガ1）。建設可能な場所: ${locations.map((l) => l.id).join(", ")}`,
                params: {
                  cost: BUILD_COSTS.road,
                  availableLocations: locations,
                },
              });
            }
          }

          // 発展カード購入
          if (
            this.canBuild(player, "developmentCard") &&
            state.developmentCardDeckCount > 0
          ) {
            actions.push({
              type: "buy_development_card",
              description: `発展カードを購入する（小麦1、鉱石1、羊毛1）`,
              params: { cost: BUILD_COSTS.developmentCard },
            });
          }

          // 発展カード使用（このターンに購入したものは除く）
          const usableCards = player.developmentCards.filter(
            (card) =>
              !state.cardsBoughtThisTurn.includes(card) &&
              card !== "victoryPoint"
          );
          for (const cardType of [...new Set(usableCards)]) {
            actions.push({
              type: "use_development_card",
              description: this.getCardDescription(cardType),
              params: { cardType },
            });
          }

          // 銀行交易
          const bankTrades = this.getAvailableBankTrades(state, player);
          if (bankTrades.length > 0) {
            actions.push({
              type: "trade_with_bank",
              description: `銀行と交易する`,
              params: { availableTrades: bankTrades },
            });
          }

          // ターン終了
          actions.push({
            type: "end_turn",
            description: "ターンを終了する",
          });
        }
        break;

      case "game_over":
        // ゲーム終了
        break;
    }

    return actions;
  }

  /**
   * CPUプレイヤーのターンを自動的に実行
   */
  executeCpuTurn(gameId: string): GameState {
    const gameInfo = this.games.get(gameId);
    if (!gameInfo) {
      throw new Error(`Game not found: ${gameId}`);
    }

    const state = gameInfo.state;
    const currentPlayer = state.players.find(
      (p) => p.id === state.currentPlayerId
    );

    if (!currentPlayer || currentPlayer.id === gameInfo.aiPlayerId) {
      throw new Error("Not CPU's turn");
    }

    // CPUの簡易AI処理
    let newState = state;

    switch (state.phase) {
      case "setup_settlement_1":
      case "setup_settlement_2": {
        const locations = this.getBuildableSettlementLocations(
          newState,
          currentPlayer.id,
          true
        );
        if (locations.length > 0) {
          const randomLocation =
            locations[Math.floor(Math.random() * locations.length)];
          newState = processGameAction(
            newState,
            {
              type: "build_settlement",
              roomId: gameId,
              intersectionId: randomLocation.id,
            },
            currentPlayer.id
          );
        }
        break;
      }

      case "setup_road_1":
      case "setup_road_2": {
        const locations = this.getBuildableRoadLocations(
          newState,
          currentPlayer.id,
          true
        );
        if (locations.length > 0) {
          const randomLocation =
            locations[Math.floor(Math.random() * locations.length)];
          newState = processGameAction(
            newState,
            {
              type: "build_road",
              roomId: gameId,
              edgeId: randomLocation.id,
            },
            currentPlayer.id
          );
        }
        break;
      }

      case "roll_dice":
        newState = processGameAction(
          newState,
          { type: "roll_dice", roomId: gameId },
          currentPlayer.id
        );
        break;

      case "discard": {
        const totalResources = Object.values(currentPlayer.resources).reduce(
          (a, b) => a + b,
          0
        );
        if (totalResources > 7) {
          const discardCount = Math.floor(totalResources / 2);
          const toDiscard = this.selectResourcesToDiscard(
            currentPlayer.resources,
            discardCount
          );
          newState = processGameAction(
            newState,
            {
              type: "discard_resources",
              roomId: gameId,
              resources: toDiscard,
            },
            currentPlayer.id
          );
        }
        break;
      }

      case "robber_move": {
        const validHexes = this.getValidRobberDestinations(newState);
        if (validHexes.length > 0) {
          const randomHex =
            validHexes[Math.floor(Math.random() * validHexes.length)];
          newState = processGameAction(
            newState,
            {
              type: "move_robber",
              roomId: gameId,
              hexId: randomHex.id,
            },
            currentPlayer.id
          );
        }
        break;
      }

      case "robber_steal": {
        const targets = this.getStealTargets(newState, currentPlayer.id);
        if (targets.length > 0) {
          const randomTarget =
            targets[Math.floor(Math.random() * targets.length)];
          newState = processGameAction(
            newState,
            {
              type: "steal_resource",
              roomId: gameId,
              targetPlayerId: randomTarget.id,
            },
            currentPlayer.id
          );
        }
        break;
      }

      case "road_building_1":
      case "road_building_2": {
        const locations = this.getBuildableRoadLocations(
          newState,
          currentPlayer.id,
          true
        );
        if (locations.length > 0) {
          const randomLocation =
            locations[Math.floor(Math.random() * locations.length)];
          newState = processGameAction(
            newState,
            {
              type: "build_road",
              roomId: gameId,
              edgeId: randomLocation.id,
            },
            currentPlayer.id
          );
        }
        break;
      }

      case "main":
        // CPUは単純にターンを終了
        newState = processGameAction(
          newState,
          { type: "end_turn", roomId: gameId },
          currentPlayer.id
        );
        break;
    }

    gameInfo.state = newState;
    return newState;
  }

  /**
   * 自分のターンまでCPUを自動実行
   */
  runUntilMyTurn(gameId: string): GameState {
    const gameInfo = this.games.get(gameId);
    if (!gameInfo) {
      throw new Error(`Game not found: ${gameId}`);
    }

    let iterations = 0;
    const maxIterations = 100; // 無限ループ防止

    while (iterations < maxIterations) {
      const state = gameInfo.state;

      // ゲーム終了チェック
      if (state.phase === "game_over") {
        break;
      }

      // 自分のターンならブレイク
      if (state.currentPlayerId === gameInfo.aiPlayerId) {
        break;
      }

      // discardフェーズで自分が破棄する必要があるかチェック
      if (state.phase === "discard") {
        const aiPlayer = state.players.find(
          (p) => p.id === gameInfo.aiPlayerId
        );
        if (aiPlayer) {
          const totalResources = Object.values(aiPlayer.resources).reduce(
            (a, b) => a + b,
            0
          );
          if (totalResources > 7) {
            break; // AIが破棄する必要がある
          }
        }
      }

      // CPUターンを実行
      try {
        this.executeCpuTurn(gameId);
      } catch {
        // エラーが発生した場合はブレイク
        break;
      }

      iterations++;
    }

    return gameInfo.state;
  }

  /**
   * ゲームを削除
   */
  deleteGame(gameId: string): void {
    this.games.delete(gameId);
  }

  // ============================================
  // プライベートヘルパーメソッド
  // ============================================

  private canBuild(
    player: Player,
    type: "settlement" | "city" | "road" | "developmentCard"
  ): boolean {
    const cost = BUILD_COSTS[type];
    for (const [resource, amount] of Object.entries(cost)) {
      if (
        player.resources[resource as HoldableResource] < (amount as number)
      ) {
        return false;
      }
    }

    // 残り建造物数チェック
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

  private getBuildableSettlementLocations(
    state: GameState,
    playerId: string,
    isSetup: boolean
  ): BuildableLocation[] {
    const locations: BuildableLocation[] = [];

    for (const intersection of state.intersections) {
      // 既に建物がある場所はスキップ
      if (intersection.building) continue;

      // 2マスルールチェック（隣接する頂点に建物がないか）
      const adjacentIds = this.getAdjacentIntersectionIds(
        intersection.id,
        state.intersections
      );
      const hasAdjacentBuilding = adjacentIds.some((id) => {
        const adj = state.intersections.find((i) => i.id === id);
        return adj?.building !== null;
      });
      if (hasAdjacentBuilding) continue;

      // 初期配置以外では、自分の道に隣接している必要がある
      if (!isSetup) {
        const adjacentEdgeIds = this.getAdjacentEdgeIds(
          intersection.id,
          state.edges
        );
        const hasOwnRoad = adjacentEdgeIds.some((id) => {
          const edge = state.edges.find((e) => e.id === id);
          return edge?.road?.playerId === playerId;
        });
        if (!hasOwnRoad) continue;
      }

      locations.push({
        id: intersection.id,
        description: intersection.port
          ? `港付き (${intersection.port.ratio}:1 ${intersection.port.resourceType || "汎用"})`
          : "通常",
      });
    }

    return locations;
  }

  private getBuildableCityLocations(
    state: GameState,
    playerId: string
  ): BuildableLocation[] {
    const locations: BuildableLocation[] = [];

    for (const intersection of state.intersections) {
      if (
        intersection.building?.type === "settlement" &&
        intersection.building.playerId === playerId
      ) {
        locations.push({
          id: intersection.id,
          description: "自分の開拓地",
        });
      }
    }

    return locations;
  }

  private getBuildableRoadLocations(
    state: GameState,
    playerId: string,
    isSetup: boolean
  ): BuildableLocation[] {
    const locations: BuildableLocation[] = [];

    for (const edge of state.edges) {
      // 既に道がある場所はスキップ
      if (edge.road) continue;

      // 自分の建物または道に隣接している必要がある
      const adjacentIntersectionIds = this.getEdgeAdjacentIntersectionIds(
        edge.id,
        state.intersections
      );
      const adjacentEdgeIds = this.getEdgeAdjacentEdgeIds(edge.id, state.edges);

      // 初期配置時：直前に建てた開拓地に隣接する道のみ
      if (isSetup) {
        const hasOwnBuilding = adjacentIntersectionIds.some((id) => {
          const intersection = state.intersections.find((i) => i.id === id);
          return intersection?.building?.playerId === playerId;
        });
        if (!hasOwnBuilding) continue;
      } else {
        // 通常時：自分の建物または道に隣接
        const hasOwnBuilding = adjacentIntersectionIds.some((id) => {
          const intersection = state.intersections.find((i) => i.id === id);
          return intersection?.building?.playerId === playerId;
        });
        const hasOwnRoad = adjacentEdgeIds.some((id) => {
          const e = state.edges.find((ed) => ed.id === id);
          return e?.road?.playerId === playerId;
        });
        if (!hasOwnBuilding && !hasOwnRoad) continue;
      }

      locations.push({
        id: edge.id,
        description: "建設可能",
      });
    }

    return locations;
  }

  private getValidRobberDestinations(
    state: GameState
  ): Array<{ id: string; resourceType: string }> {
    return state.hexes
      .filter((hex) => !hex.hasRobber && hex.resourceType !== "desert")
      .map((hex) => ({
        id: hex.id,
        resourceType: hex.resourceType,
      }));
  }

  private getStealTargets(
    state: GameState,
    playerId: string
  ): Array<{ id: string; name: string }> {
    const robberHex = state.hexes.find((h) => h.hasRobber);
    if (!robberHex) return [];

    // 盗賊がいるタイルに隣接する建物を持つプレイヤーを取得
    const adjacentPlayerIds = new Set<string>();
    for (const intersection of state.intersections) {
      if (
        intersection.building &&
        intersection.building.playerId !== playerId
      ) {
        // このintersectionがrobberHexに隣接しているかチェック
        if (this.isIntersectionAdjacentToHex(intersection, robberHex)) {
          const targetPlayer = state.players.find(
            (p) => p.id === intersection.building!.playerId
          );
          // 資源を持っているプレイヤーのみ
          if (
            targetPlayer &&
            Object.values(targetPlayer.resources).reduce((a, b) => a + b, 0) > 0
          ) {
            adjacentPlayerIds.add(intersection.building.playerId);
          }
        }
      }
    }

    return Array.from(adjacentPlayerIds).map((id) => {
      const player = state.players.find((p) => p.id === id);
      return { id, name: player?.name || "Unknown" };
    });
  }

  private isIntersectionAdjacentToHex(
    intersection: Intersection,
    hex: Hex
  ): boolean {
    // 頂点座標からhexの座標との関係をチェック
    const vertexHex = intersection.coordinate.hex;
    const direction = intersection.coordinate.direction;

    // 頂点に隣接する3つのhexを取得
    let adjacentHexCoords: Array<{ q: number; r: number; s: number }>;
    if (direction === "N") {
      adjacentHexCoords = [
        vertexHex,
        { q: vertexHex.q, r: vertexHex.r - 1, s: vertexHex.s + 1 },
        { q: vertexHex.q + 1, r: vertexHex.r - 1, s: vertexHex.s },
      ];
    } else {
      adjacentHexCoords = [
        vertexHex,
        { q: vertexHex.q, r: vertexHex.r + 1, s: vertexHex.s - 1 },
        { q: vertexHex.q - 1, r: vertexHex.r + 1, s: vertexHex.s },
      ];
    }

    return adjacentHexCoords.some(
      (c) =>
        c.q === hex.coordinate.q &&
        c.r === hex.coordinate.r &&
        c.s === hex.coordinate.s
    );
  }

  private getAdjacentIntersectionIds(
    intersectionId: string,
    intersections: Intersection[]
  ): string[] {
    // 簡易実装：座標からの計算
    const intersection = intersections.find((i) => i.id === intersectionId);
    if (!intersection) return [];

    const { hex, direction } = intersection.coordinate;
    const adjacentCoords =
      direction === "N"
        ? [
            {
              hex: { q: hex.q + 1, r: hex.r - 1, s: hex.s },
              direction: "S" as const,
            },
            {
              hex: { q: hex.q, r: hex.r - 1, s: hex.s + 1 },
              direction: "S" as const,
            },
            {
              hex: { q: hex.q + 1, r: hex.r - 2, s: hex.s + 1 },
              direction: "S" as const,
            },
          ]
        : [
            {
              hex: { q: hex.q, r: hex.r + 1, s: hex.s - 1 },
              direction: "N" as const,
            },
            {
              hex: { q: hex.q - 1, r: hex.r + 1, s: hex.s },
              direction: "N" as const,
            },
            {
              hex: { q: hex.q - 1, r: hex.r + 2, s: hex.s - 1 },
              direction: "N" as const,
            },
          ];

    return adjacentCoords
      .map(
        (c) =>
          `${c.hex.q},${c.hex.r},${c.hex.s}_${c.direction}`
      )
      .filter((id) => intersections.some((i) => i.id === id));
  }

  private getAdjacentEdgeIds(
    intersectionId: string,
    edges: Edge[]
  ): string[] {
    const intersection = intersectionId.split("_");
    if (intersection.length !== 2) return [];

    const [coordStr, direction] = intersection;
    const [q, r, s] = coordStr.split(",").map(Number);

    const adjacentEdgeCoords =
      direction === "N"
        ? [
            { hex: { q, r, s }, direction: "NE" as const },
            { hex: { q, r: r - 1, s: s + 1 }, direction: "E" as const },
            { hex: { q, r: r - 1, s: s + 1 }, direction: "SE" as const },
          ]
        : [
            { hex: { q, r, s }, direction: "SE" as const },
            { hex: { q: q - 1, r: r + 1, s }, direction: "E" as const },
            { hex: { q: q - 1, r: r + 1, s }, direction: "NE" as const },
          ];

    return adjacentEdgeCoords
      .map(
        (c) =>
          `${c.hex.q},${c.hex.r},${c.hex.s}_${c.direction}`
      )
      .filter((id) => edges.some((e) => e.id === id));
  }

  private getEdgeAdjacentIntersectionIds(
    edgeId: string,
    intersections: Intersection[]
  ): string[] {
    // エッジに隣接する2つの頂点を取得
    const parts = edgeId.split("_");
    if (parts.length !== 2) return [];

    const [coordStr, direction] = parts;
    const [q, r, s] = coordStr.split(",").map(Number);

    let adjacentVertexCoords: Array<{
      hex: { q: number; r: number; s: number };
      direction: "N" | "S";
    }>;

    switch (direction) {
      case "NE":
        adjacentVertexCoords = [
          { hex: { q, r, s }, direction: "N" },
          { hex: { q: q + 1, r: r - 1, s }, direction: "S" },
        ];
        break;
      case "E":
        adjacentVertexCoords = [
          { hex: { q: q + 1, r: r - 1, s }, direction: "S" },
          { hex: { q, r: r + 1, s: s - 1 }, direction: "N" },
        ];
        break;
      case "SE":
        adjacentVertexCoords = [
          { hex: { q, r: r + 1, s: s - 1 }, direction: "N" },
          { hex: { q, r, s }, direction: "S" },
        ];
        break;
      default:
        return [];
    }

    return adjacentVertexCoords
      .map(
        (c) =>
          `${c.hex.q},${c.hex.r},${c.hex.s}_${c.direction}`
      )
      .filter((id) => intersections.some((i) => i.id === id));
  }

  private getEdgeAdjacentEdgeIds(
    edgeId: string,
    edges: Edge[]
  ): string[] {
    // 簡易実装：隣接する頂点を経由して隣接するエッジを取得
    const parts = edgeId.split("_");
    if (parts.length !== 2) return [];

    const [coordStr, direction] = parts;
    const [q, r, s] = coordStr.split(",").map(Number);

    // 各エッジ方向に隣接するエッジのパターン
    const adjacentPatterns: Record<
      string,
      Array<{ hex: { q: number; r: number; s: number }; direction: string }>
    > = {
      NE: [
        { hex: { q, r: r - 1, s: s + 1 }, direction: "E" },
        { hex: { q, r: r - 1, s: s + 1 }, direction: "SE" },
        { hex: { q: q + 1, r: r - 1, s }, direction: "SE" },
        { hex: { q: q + 1, r: r - 2, s: s + 1 }, direction: "E" },
      ],
      E: [
        { hex: { q, r, s }, direction: "NE" },
        { hex: { q: q + 1, r: r - 1, s }, direction: "SE" },
        { hex: { q, r, s }, direction: "SE" },
        { hex: { q, r: r + 1, s: s - 1 }, direction: "NE" },
      ],
      SE: [
        { hex: { q, r, s }, direction: "E" },
        { hex: { q, r, s }, direction: "NE" },
        { hex: { q: q - 1, r: r + 1, s }, direction: "E" },
        { hex: { q: q - 1, r: r + 1, s }, direction: "NE" },
      ],
    };

    const pattern = adjacentPatterns[direction] || [];
    return pattern
      .map((c) => `${c.hex.q},${c.hex.r},${c.hex.s}_${c.direction}`)
      .filter((id) => edges.some((e) => e.id === id) && id !== edgeId);
  }

  private selectResourcesToDiscard(
    resources: PlayerResources,
    count: number
  ): Partial<PlayerResources> {
    const result: Partial<PlayerResources> = {};
    let remaining = count;
    const resourceTypes: HoldableResource[] = [
      "wood",
      "brick",
      "wheat",
      "ore",
      "sheep",
    ];

    // ランダムに資源を選択
    while (remaining > 0) {
      const availableResources = resourceTypes.filter(
        (r) => resources[r] - (result[r] || 0) > 0
      );
      if (availableResources.length === 0) break;

      const randomResource =
        availableResources[
          Math.floor(Math.random() * availableResources.length)
        ];
      result[randomResource] = (result[randomResource] || 0) + 1;
      remaining--;
    }

    return result;
  }

  private getCardDescription(cardType: DevelopmentCardType): string {
    switch (cardType) {
      case "knight":
        return "騎士カードを使用する（盗賊を移動）";
      case "roadBuilding":
        return "街道建設カードを使用する（道を2本建設）";
      case "yearOfPlenty":
        return "収穫カードを使用する（好きな資源を2枚獲得）";
      case "monopoly":
        return "独占カードを使用する（指定した資源を全員から奪う）";
      default:
        return `${cardType}カードを使用する`;
    }
  }

  private getAvailableBankTrades(
    state: GameState,
    player: Player
  ): Array<{
    give: { resource: HoldableResource; amount: number };
    receive: HoldableResource;
  }> {
    const trades: Array<{
      give: { resource: HoldableResource; amount: number };
      receive: HoldableResource;
    }> = [];
    const resourceTypes: HoldableResource[] = [
      "wood",
      "brick",
      "wheat",
      "ore",
      "sheep",
    ];

    // プレイヤーが持っている港を確認
    const playerPorts = new Map<HoldableResource | "any", number>();

    for (const intersection of state.intersections) {
      if (
        intersection.building?.playerId === player.id &&
        intersection.port
      ) {
        if (intersection.port.resourceType) {
          const current =
            playerPorts.get(intersection.port.resourceType) || 4;
          playerPorts.set(
            intersection.port.resourceType,
            Math.min(current, intersection.port.ratio)
          );
        } else {
          const current = playerPorts.get("any") || 4;
          playerPorts.set("any", Math.min(current, intersection.port.ratio));
        }
      }
    }

    // 各資源について交換可能かチェック
    for (const giveResource of resourceTypes) {
      // 交換レートを決定
      let rate = 4; // デフォルト4:1
      if (playerPorts.has(giveResource)) {
        rate = playerPorts.get(giveResource)!;
      } else if (playerPorts.has("any")) {
        rate = playerPorts.get("any")!;
      }

      if (player.resources[giveResource] >= rate) {
        for (const receiveResource of resourceTypes) {
          if (receiveResource !== giveResource) {
            trades.push({
              give: { resource: giveResource, amount: rate },
              receive: receiveResource,
            });
          }
        }
      }
    }

    return trades;
  }
}

// シングルトンインスタンスをエクスポート
export const gameManager = new GameManager();
