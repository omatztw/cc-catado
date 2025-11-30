/**
 * テストシナリオ定義
 */

import type { TestScenario, ResourceType, DevelopmentCardType } from "@/types/game";

// ============================================
// 基本シナリオ
// ============================================

/**
 * 7が出るシナリオ（盗賊テスト用）
 */
export const SCENARIO_ROLL_SEVEN: TestScenario = {
  diceRolls: [
    { die1: 3, die2: 4 }, // 7
  ],
};

/**
 * 連続で同じ数字が出るシナリオ（資源配布テスト用）
 */
export const SCENARIO_ROLL_SAME_NUMBER: TestScenario = {
  diceRolls: [
    { die1: 3, die2: 3 }, // 6
    { die1: 3, die2: 3 }, // 6
    { die1: 3, die2: 3 }, // 6
  ],
};

/**
 * 標準ボード配置（確定的な配置）
 * 中央が砂漠、その周りに資源タイルを螺旋状に配置
 */
export const STANDARD_BOARD_SETUP: {
  terrains: ResourceType[];
  numberTokens: (number | null)[];
} = {
  terrains: [
    // 中央
    "desert",
    // 内側リング（6タイル）
    "wood",
    "brick",
    "wheat",
    "ore",
    "sheep",
    "wood",
    // 外側リング（12タイル）
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
    "brick",
  ],
  numberTokens: [
    // 中央（砂漠）
    null,
    // 内側リング
    5, 6, 9, 10, 3, 11,
    // 外側リング
    4, 8, 2, 5, 6, 9, 10, 3, 11, 4, 8, 12,
  ],
};

// ============================================
// 3人プレイ用シナリオ
// ============================================

/**
 * 3人プレイ基本シナリオ
 */
export const SCENARIO_THREE_PLAYERS_BASIC: TestScenario = {
  turnOrder: ["player1", "player2", "player3"],
  boardSetup: STANDARD_BOARD_SETUP,
  developmentCardOrder: [
    "knight", "knight", "knight", "knight", "knight",
    "knight", "knight", "knight", "knight", "knight",
    "knight", "knight", "knight", "knight",
    "victoryPoint", "victoryPoint", "victoryPoint", "victoryPoint", "victoryPoint",
    "roadBuilding", "roadBuilding",
    "yearOfPlenty", "yearOfPlenty",
    "monopoly", "monopoly",
  ],
};

// ============================================
// 4人プレイ用シナリオ
// ============================================

/**
 * 4人プレイ基本シナリオ
 */
export const SCENARIO_FOUR_PLAYERS_BASIC: TestScenario = {
  turnOrder: ["player1", "player2", "player3", "player4"],
  boardSetup: STANDARD_BOARD_SETUP,
  developmentCardOrder: [
    "knight", "knight", "knight", "knight", "knight",
    "knight", "knight", "knight", "knight", "knight",
    "knight", "knight", "knight", "knight",
    "victoryPoint", "victoryPoint", "victoryPoint", "victoryPoint", "victoryPoint",
    "roadBuilding", "roadBuilding",
    "yearOfPlenty", "yearOfPlenty",
    "monopoly", "monopoly",
  ],
};

/**
 * 4人プレイ 勝利までの完全シナリオ
 *
 * プレイヤー1が最短で10点に到達するシナリオ
 * - 開拓地2つ（初期配置）= 2点
 * - 都市2つ = 4点（開拓地を都市に昇格）
 * - 追加開拓地3つ = 3点
 * - 勝利点カード1枚 = 1点
 * 合計 = 10点
 *
 * ダイスの出目は player1 が有利になるよう設計
 */
export const SCENARIO_FOUR_PLAYERS_VICTORY: TestScenario = {
  turnOrder: ["player1", "player2", "player3", "player4"],
  boardSetup: {
    terrains: [
      // 中央を ore にして player1 が ore を集めやすくする
      "ore",
      // 内側リング - 様々な資源
      "wheat", "wood", "brick", "sheep", "ore", "wheat",
      // 外側リング
      "brick", "wood", "sheep", "wheat", "ore", "brick",
      "wood", "sheep", "desert", "wheat", "brick", "wood",
    ],
    numberTokens: [
      // 中央 ore に 6 を配置（高確率）
      6,
      // 内側リング - player1 が建設しやすい場所に良い数字
      8, 5, 9, 4, 10, 3,
      // 外側リング
      11, 6, 8, 5, 9, 4, 10, 3, null, 11, 12, 2,
    ],
  },
  // 発展カードの順序（最初に勝利点カードを引けるようにする）
  developmentCardOrder: [
    "victoryPoint", // player1 が引く
    "knight", "knight", "knight",
    "victoryPoint", // 後で他のプレイヤーが引く可能性
    "knight", "knight", "knight", "knight", "knight",
    "knight", "knight", "knight", "knight", "knight",
    "victoryPoint", "victoryPoint", "victoryPoint",
    "roadBuilding", "roadBuilding",
    "yearOfPlenty", "yearOfPlenty",
    "monopoly", "monopoly",
  ],
  // ダイスの出目（player1 に有利な出目を多くする）
  // 6 と 8 が多めに出て ore と wheat が集まりやすい
  diceRolls: [
    // ラウンド1: 全員が1回ずつ振る
    { die1: 3, die2: 3 }, // 6 - ore (player1)
    { die1: 4, die2: 4 }, // 8 - wheat (player2)
    { die1: 2, die2: 3 }, // 5 - wood (player3)
    { die1: 5, die2: 4 }, // 9 - brick (player4)
    // ラウンド2
    { die1: 3, die2: 3 }, // 6 - ore
    { die1: 4, die2: 4 }, // 8 - wheat
    { die1: 2, die2: 3 }, // 5 - wood
    { die1: 2, die2: 2 }, // 4 - sheep
    // ラウンド3
    { die1: 3, die2: 3 }, // 6 - ore
    { die1: 4, die2: 4 }, // 8 - wheat
    { die1: 5, die2: 5 }, // 10 - ore
    { die1: 2, die2: 3 }, // 5 - wood
    // ラウンド4
    { die1: 3, die2: 3 }, // 6 - ore
    { die1: 4, die2: 4 }, // 8 - wheat
    { die1: 2, die2: 3 }, // 5 - wood
    { die1: 5, die2: 4 }, // 9 - brick
    // ラウンド5
    { die1: 3, die2: 3 }, // 6 - ore
    { die1: 4, die2: 4 }, // 8 - wheat
    { die1: 2, die2: 3 }, // 5 - wood
    { die1: 2, die2: 2 }, // 4 - sheep
    // ラウンド6
    { die1: 3, die2: 3 }, // 6 - ore
    { die1: 4, die2: 4 }, // 8 - wheat
    { die1: 2, die2: 3 }, // 5 - wood
    { die1: 5, die2: 4 }, // 9 - brick
    // ラウンド7
    { die1: 3, die2: 3 }, // 6 - ore
    { die1: 4, die2: 4 }, // 8 - wheat
    { die1: 5, die2: 5 }, // 10 - ore
    { die1: 2, die2: 3 }, // 5 - wood
    // ラウンド8
    { die1: 3, die2: 3 }, // 6 - ore
    { die1: 4, die2: 4 }, // 8 - wheat
    { die1: 2, die2: 3 }, // 5 - wood
    { die1: 2, die2: 2 }, // 4 - sheep
    // 追加のダイスロール（必要に応じて）
    { die1: 3, die2: 3 }, // 6
    { die1: 4, die2: 4 }, // 8
    { die1: 3, die2: 3 }, // 6
    { die1: 4, die2: 4 }, // 8
    { die1: 3, die2: 3 }, // 6
    { die1: 4, die2: 4 }, // 8
    { die1: 3, die2: 3 }, // 6
    { die1: 4, die2: 4 }, // 8
  ],
  // 略奪時のインデックス（使用する場合）
  stealIndices: [0, 0, 0, 0, 0],
};

/**
 * 頂点IDのヘルパー
 * 標準的な配置場所のID
 */
export const VERTEX_IDS = {
  // 中央タイル (0,0,0) の頂点
  CENTER_N: "0,0,0_N",
  CENTER_S: "0,0,0_S",

  // 内側リング周辺の頂点（player1 の初期配置に適した場所）
  INNER_1_N: "1,-1,0_N",
  INNER_1_S: "1,-1,0_S",
  INNER_2_N: "1,0,-1_N",
  INNER_2_S: "1,0,-1_S",
  INNER_3_N: "0,1,-1_N",
  INNER_3_S: "0,1,-1_S",
  INNER_4_N: "-1,1,0_N",
  INNER_4_S: "-1,1,0_S",
  INNER_5_N: "-1,0,1_N",
  INNER_5_S: "-1,0,1_S",
  INNER_6_N: "0,-1,1_N",
  INNER_6_S: "0,-1,1_S",
};

/**
 * 辺IDのヘルパー
 */
export const EDGE_IDS = {
  // 中央タイル (0,0,0) の辺
  CENTER_NE: "0,0,0_NE",
  CENTER_E: "0,0,0_E",
  CENTER_SE: "0,0,0_SE",

  // 内側リング周辺の辺
  INNER_1_NE: "1,-1,0_NE",
  INNER_1_E: "1,-1,0_E",
  INNER_1_SE: "1,-1,0_SE",
  INNER_2_NE: "1,0,-1_NE",
  INNER_2_E: "1,0,-1_E",
  INNER_2_SE: "1,0,-1_SE",
};
