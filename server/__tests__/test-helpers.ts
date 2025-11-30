/**
 * テスト用ヘルパー関数
 */

import type {
  GameState,
  Player,
  TestScenario,
  ResourceType,
  DevelopmentCardType,
  PlayerResources,
} from "@/types/game";
import {
  createInitialGameState,
  createPlayer,
  startGame,
  addPlayerToGame,
} from "../game-logic";

/**
 * テスト用のプレイヤーを作成
 */
export function createTestPlayer(
  id: string,
  name: string,
  resources?: Partial<PlayerResources>
): Omit<Player, "color"> & { color?: string } {
  return {
    id,
    name,
    resources: {
      wood: resources?.wood ?? 0,
      brick: resources?.brick ?? 0,
      wheat: resources?.wheat ?? 0,
      ore: resources?.ore ?? 0,
      sheep: resources?.sheep ?? 0,
    },
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
    isConnected: true,
  };
}

/**
 * テスト用の標準ボード配置を作成
 * 中央が砂漠、その周りに資源タイルを配置
 */
export function createStandardBoardSetup(): {
  terrains: ResourceType[];
  numberTokens: (number | null)[];
} {
  // 標準的な19タイル配置
  const terrains: ResourceType[] = [
    "desert", // 中央
    "wood",
    "brick",
    "wheat",
    "ore",
    "sheep",
    "wood", // 内側リング
    "wheat",
    "brick",
    "ore",
    "sheep",
    "wood",
    "wheat",
    "brick",
    "ore",
    "sheep",
    "wood",
    "wheat",
    "brick", // 外側リング
  ];

  // 数字トークン（砂漠はnull）
  const numberTokens: (number | null)[] = [
    null, // 砂漠
    2,
    3,
    3,
    4,
    4, // 内側リング
    5,
    5,
    6,
    6,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    12, // 外側リング
  ];

  return { terrains, numberTokens };
}

/**
 * 3人のプレイヤーでゲームを開始した状態を作成
 */
export function createGameWithThreePlayers(
  scenario?: TestScenario
): GameState {
  const state = createInitialGameState("test-room", "player1", scenario);

  // プレイヤーを追加
  let gameState = addPlayerToGame(state, "player1", "Player 1");
  gameState = addPlayerToGame(gameState, "player2", "Player 2");
  gameState = addPlayerToGame(gameState, "player3", "Player 3");

  return gameState;
}

/**
 * ゲームを開始した状態（初期配置フェーズ）を作成
 */
export function createStartedGame(scenario?: TestScenario): GameState {
  const gameState = createGameWithThreePlayers(scenario);
  return startGame(gameState);
}

/**
 * 標準的な発展カードデッキ順序を作成
 */
export function createStandardDevelopmentCardOrder(): DevelopmentCardType[] {
  return [
    "knight",
    "knight",
    "knight",
    "knight",
    "knight",
    "knight",
    "knight",
    "knight",
    "knight",
    "knight",
    "knight",
    "knight",
    "knight",
    "knight",
    "victoryPoint",
    "victoryPoint",
    "victoryPoint",
    "victoryPoint",
    "victoryPoint",
    "roadBuilding",
    "roadBuilding",
    "yearOfPlenty",
    "yearOfPlenty",
    "monopoly",
    "monopoly",
  ];
}

/**
 * プレイヤーに資源を付与するヘルパー
 */
export function giveResourcesToPlayer(
  state: GameState,
  playerId: string,
  resources: Partial<PlayerResources>
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId
        ? {
            ...p,
            resources: {
              ...p.resources,
              wood: p.resources.wood + (resources.wood ?? 0),
              brick: p.resources.brick + (resources.brick ?? 0),
              wheat: p.resources.wheat + (resources.wheat ?? 0),
              ore: p.resources.ore + (resources.ore ?? 0),
              sheep: p.resources.sheep + (resources.sheep ?? 0),
            },
          }
        : p
    ),
  };
}

/**
 * ゲームをメインフェーズに進めるためのヘルパー
 * セットアップをスキップしてroll_diceまたはmainフェーズに移行
 */
export function skipToMainPhase(state: GameState): GameState {
  return {
    ...state,
    phase: "roll_dice",
    turnNumber: 1,
  };
}

/**
 * 盗賊を特定のタイルに移動するヘルパー
 */
export function moveRobberTo(state: GameState, hexId: string): GameState {
  return {
    ...state,
    hexes: state.hexes.map((h) => ({
      ...h,
      hasRobber: h.id === hexId,
    })),
  };
}
