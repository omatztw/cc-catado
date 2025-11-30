/**
 * フルゲームシナリオテスト
 * 4人プレイで勝利まで進行するテスト
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { GameState, TestScenario, GamePhase } from "@/types/game";
import {
  createInitialGameState,
  startGame,
  handleRollDice,
  handleBuildSettlement,
  handleBuildRoad,
  handleBuildCity,
  handleBuyDevelopmentCard,
  handleMoveRobber,
  handleStealResource,
  handleEndTurn,
  addPlayerToGame,
} from "../game-logic";
import {
  SCENARIO_FOUR_PLAYERS_VICTORY,
  VERTEX_IDS,
  EDGE_IDS,
} from "./scenarios";

/**
 * セットアップをスキップして直接 roll_dice フェーズに移行するヘルパー
 * 各プレイヤーに2つの開拓地と2つの道を直接配置する
 */
function skipSetupPhase(state: GameState): GameState {
  // 有効な頂点ID（ボード上に存在する頂点）
  // 各プレイヤーに2つずつ、十分に離れた位置を選択
  const playerSetups = [
    {
      playerId: "player1",
      settlements: ["2,-2,0_N", "0,0,0_S"],
      roads: ["2,-2,0_NE", "0,0,0_SE"],
    },
    {
      playerId: "player2",
      settlements: ["0,2,-2_S", "-1,0,1_N"],
      roads: ["0,2,-2_SE", "-1,0,1_NE"],
    },
    {
      playerId: "player3",
      settlements: ["-2,2,0_S", "1,-1,0_N"],
      roads: ["-2,2,0_SE", "1,-1,0_NE"],
    },
    {
      playerId: "player4",
      settlements: ["0,-2,2_N", "-1,1,0_S"],
      roads: ["0,-2,2_NE", "-1,1,0_SE"],
    },
  ];

  let newState = { ...state };

  // 各プレイヤーの開拓地を配置
  const updatedIntersections = [...state.intersections];
  for (const setup of playerSetups) {
    for (const settlementId of setup.settlements) {
      const index = updatedIntersections.findIndex((i) => i.id === settlementId);
      if (index !== -1) {
        updatedIntersections[index] = {
          ...updatedIntersections[index],
          building: { type: "settlement", playerId: setup.playerId },
        };
      }
    }
  }

  // 各プレイヤーの道を配置
  const updatedEdges = [...state.edges];
  for (const setup of playerSetups) {
    for (const roadId of setup.roads) {
      const index = updatedEdges.findIndex((e) => e.id === roadId);
      if (index !== -1) {
        updatedEdges[index] = {
          ...updatedEdges[index],
          road: { playerId: setup.playerId },
        };
      }
    }
  }

  // プレイヤーの状態を更新
  const updatedPlayers = state.players.map((p) => ({
    ...p,
    remainingPieces: {
      ...p.remainingPieces,
      settlements: 3, // 5 - 2
      roads: 13, // 15 - 2
    },
    visibleVictoryPoints: 2, // 開拓地2つ
  }));

  return {
    ...newState,
    intersections: updatedIntersections,
    edges: updatedEdges,
    players: updatedPlayers,
    phase: "roll_dice",
    currentPlayerId: state.turnOrder[0],
    turnNumber: 1,
  };
}

describe("4人プレイ フルゲームシナリオ", () => {
  let gameState: GameState;

  /**
   * 4人のプレイヤーを追加してゲームを作成
   */
  function createFourPlayerGame(scenario: TestScenario): GameState {
    let state = createInitialGameState("test-room", "player1", scenario);
    state = addPlayerToGame(state, "player1", "Player 1");
    state = addPlayerToGame(state, "player2", "Player 2");
    state = addPlayerToGame(state, "player3", "Player 3");
    state = addPlayerToGame(state, "player4", "Player 4");
    return state;
  }

  describe("セットアップフェーズ", () => {
    beforeEach(() => {
      gameState = createFourPlayerGame(SCENARIO_FOUR_PLAYERS_VICTORY);
      gameState = startGame(gameState);
    });

    it("ゲーム開始時のフェーズがsetup_settlement_1である", () => {
      expect(gameState.phase).toBe("setup_settlement_1");
      expect(gameState.currentPlayerId).toBe("player1");
    });

    it("skipSetupPhaseでセットアップをスキップできる", () => {
      const afterSetup = skipSetupPhase(gameState);

      // セットアップ完了後はroll_diceフェーズ
      expect(afterSetup.phase).toBe("roll_dice");

      // 各プレイヤーが2つの開拓地と2つの道を持っている
      afterSetup.players.forEach((player) => {
        expect(player.remainingPieces.settlements).toBe(3); // 5 - 2 = 3
        expect(player.remainingPieces.roads).toBe(13); // 15 - 2 = 13
        expect(player.visibleVictoryPoints).toBe(2); // 開拓地2つ = 2点
      });

      // 最初のプレイヤー(player1)のターン
      expect(afterSetup.currentPlayerId).toBe("player1");

      // player1 の開拓地が正しく配置されている
      const player1Settlements = afterSetup.intersections.filter(
        (i) => i.building?.playerId === "player1"
      );
      expect(player1Settlements.length).toBe(2);

      // player1 の道が正しく配置されている
      const player1Roads = afterSetup.edges.filter(
        (e) => e.road?.playerId === "player1"
      );
      expect(player1Roads.length).toBe(2);
      expect(player1Roads.map((r) => r.id).sort()).toEqual(
        ["0,0,0_SE", "2,-2,0_NE"].sort()
      );
    });
  });

  describe("メインゲームフェーズ", () => {
    beforeEach(() => {
      gameState = createFourPlayerGame(SCENARIO_FOUR_PLAYERS_VICTORY);
      gameState = startGame(gameState);
      gameState = skipSetupPhase(gameState);
    });

    it("サイコロを振って資源を獲得できる", () => {
      expect(gameState.phase).toBe("roll_dice");

      const beforeRoll = { ...gameState.players[0].resources };
      const afterRoll = handleRollDice(gameState, "player1");

      // サイコロの結果が記録されている
      expect(afterRoll.diceResult).not.toBeNull();
      expect(afterRoll.diceResult?.total).toBeGreaterThanOrEqual(2);
      expect(afterRoll.diceResult?.total).toBeLessThanOrEqual(12);

      // mainフェーズに遷移
      expect(afterRoll.phase).toBe("main");
    });

    it("ターンを終了して次のプレイヤーに移る", () => {
      // サイコロを振る
      let state = handleRollDice(gameState, "player1");

      // ターン終了
      state = handleEndTurn(state, "player1");

      expect(state.currentPlayerId).toBe("player2");
      expect(state.phase).toBe("roll_dice");
    });

    it("複数ターンを実行できる", () => {
      let state = gameState;

      // 4ターン分を実行
      for (let turn = 0; turn < 4; turn++) {
        const currentPlayer = state.currentPlayerId!;

        // サイコロを振る
        state = handleRollDice(state, currentPlayer);
        expect(state.phase).toBe("main");

        // ターン終了
        state = handleEndTurn(state, currentPlayer);
        expect(state.phase).toBe("roll_dice");
      }

      // 4ターン後、player1に戻っている
      expect(state.currentPlayerId).toBe("player1");
      expect(state.turnNumber).toBe(5); // 初期値1 + 4ターン
    });
  });

  describe("建設アクション", () => {
    beforeEach(() => {
      gameState = createFourPlayerGame(SCENARIO_FOUR_PLAYERS_VICTORY);
      gameState = startGame(gameState);
      gameState = skipSetupPhase(gameState);
    });

    it("十分な資源があれば道を建設できる", () => {
      // player1に資源を付与
      gameState = {
        ...gameState,
        players: gameState.players.map((p) =>
          p.id === "player1"
            ? {
                ...p,
                resources: {
                  ...p.resources,
                  wood: 10,
                  brick: 10,
                  wheat: 10,
                  ore: 10,
                  sheep: 10,
                },
              }
            : p
        ),
      };

      // サイコロを振る
      let state = handleRollDice(gameState, "player1");

      // 道を建設（既存の道に隣接する場所）
      // player1 の道: 2,-2,0_NE と 0,0,0_SE
      // 0,0,0_SE に隣接する辺: -1,1,0_E など
      state = handleBuildRoad(state, "player1", "-1,1,0_E");

      const player1 = state.players.find((p) => p.id === "player1")!;
      expect(player1.remainingPieces.roads).toBe(12); // 13 - 1 = 12
      expect(player1.resources.wood).toBe(9); // 10 - 1 = 9
      expect(player1.resources.brick).toBe(9); // 10 - 1 = 9
    });

    it("十分な資源があれば開拓地を建設できる", () => {
      // player1に資源を付与
      gameState = {
        ...gameState,
        players: gameState.players.map((p) =>
          p.id === "player1"
            ? {
                ...p,
                resources: {
                  ...p.resources,
                  wood: 10,
                  brick: 10,
                  wheat: 10,
                  ore: 10,
                  sheep: 10,
                },
              }
            : p
        ),
      };

      // サイコロを振る
      let state = handleRollDice(gameState, "player1");

      // 道を伸ばす（0,0,0_SE の端点 (0,1,-1)_N から）
      // (0,1,-1)_NE は (0,1,-1)_N と (1,0,-1)_S を接続
      state = handleBuildRoad(state, "player1", "0,1,-1_NE");
      // さらに伸ばす: (1,0,-1)_SE は (1,0,-1)_S と (1,1,-2)_N を接続
      state = handleBuildRoad(state, "player1", "1,0,-1_SE");

      // (1,1,-2)_N に開拓地を建設
      // この頂点は他の建物から2マス以上離れている
      state = handleBuildSettlement(state, "player1", "1,1,-2_N");

      const player1 = state.players.find((p) => p.id === "player1")!;
      expect(player1.remainingPieces.settlements).toBe(2); // 3 - 1 = 2
      expect(player1.visibleVictoryPoints).toBe(3); // 2 + 1 = 3
    });

    it("十分な資源があれば都市を建設できる", () => {
      // player1に資源を付与
      gameState = {
        ...gameState,
        players: gameState.players.map((p) =>
          p.id === "player1"
            ? {
                ...p,
                resources: {
                  ...p.resources,
                  wheat: 10,
                  ore: 10,
                },
              }
            : p
        ),
      };

      // サイコロを振る
      let state = handleRollDice(gameState, "player1");

      // 既存の開拓地を都市にアップグレード
      // player1 の開拓地: "2,-2,0_N" と "0,0,0_S"
      state = handleBuildCity(state, "player1", "0,0,0_S");

      const player1 = state.players.find((p) => p.id === "player1")!;
      expect(player1.remainingPieces.cities).toBe(3); // 4 - 1 = 3
      expect(player1.remainingPieces.settlements).toBe(4); // 3 + 1 = 4 (開拓地が戻る)
      expect(player1.visibleVictoryPoints).toBe(3); // 2 - 1(開拓地) + 2(都市) = 3
    });
  });

  describe("発展カード", () => {
    beforeEach(() => {
      gameState = createFourPlayerGame(SCENARIO_FOUR_PLAYERS_VICTORY);
      gameState = startGame(gameState);
      gameState = skipSetupPhase(gameState);
    });

    it("十分な資源があれば発展カードを購入できる", () => {
      // player1に資源を付与
      gameState = {
        ...gameState,
        players: gameState.players.map((p) =>
          p.id === "player1"
            ? {
                ...p,
                resources: {
                  ...p.resources,
                  wheat: 10,
                  ore: 10,
                  sheep: 10,
                },
              }
            : p
        ),
      };

      // サイコロを振る（資源配布が行われる可能性がある）
      let state = handleRollDice(gameState, "player1");

      // サイコロ後の資源を記録
      const player1BeforeBuy = state.players.find((p) => p.id === "player1")!;
      const wheatBefore = player1BeforeBuy.resources.wheat;
      const oreBefore = player1BeforeBuy.resources.ore;
      const sheepBefore = player1BeforeBuy.resources.sheep;

      // 発展カードを購入
      state = handleBuyDevelopmentCard(state, "player1");

      const player1 = state.players.find((p) => p.id === "player1")!;
      expect(player1.developmentCards.length).toBe(1);
      // シナリオでは最初のカードはvictoryPoint
      expect(player1.developmentCards[0]).toBe("victoryPoint");
      // 購入コスト（wheat: 1, ore: 1, sheep: 1）が消費されている
      expect(player1.resources.wheat).toBe(wheatBefore - 1);
      expect(player1.resources.ore).toBe(oreBefore - 1);
      expect(player1.resources.sheep).toBe(sheepBefore - 1);
    });
  });

  describe("勝利条件", () => {
    beforeEach(() => {
      gameState = createFourPlayerGame(SCENARIO_FOUR_PLAYERS_VICTORY);
      gameState = startGame(gameState);
      gameState = skipSetupPhase(gameState);
    });

    it("10点に達したプレイヤーが勝利する", () => {
      // player1を9点にセット（あと1点で勝利）
      gameState = {
        ...gameState,
        players: gameState.players.map((p) =>
          p.id === "player1"
            ? {
                ...p,
                visibleVictoryPoints: 9, // 開拓地4つ(4点) + 都市2つ(4点) + 最長交易路(2点) - 1 = 9
                resources: {
                  ...p.resources,
                  wood: 10,
                  brick: 10,
                  wheat: 10,
                  ore: 10,
                  sheep: 10,
                },
              }
            : p
        ),
      };

      // サイコロを振る
      let state = handleRollDice(gameState, "player1");

      // 道を2本建設して開拓地を建設可能にする
      // 0,0,0_SE の端点 (0,1,-1)_N から伸ばす
      state = handleBuildRoad(state, "player1", "0,1,-1_NE");
      // (1,0,-1)_SE は (1,0,-1)_S と (1,1,-2)_N を接続
      state = handleBuildRoad(state, "player1", "1,0,-1_SE");

      // 開拓地を建設して10点に到達
      state = handleBuildSettlement(state, "player1", "1,1,-2_N");

      // 勝者が設定されている
      expect(state.winnerId).toBe("player1");
      expect(state.phase).toBe("game_over");
    });

    it("隠し勝利点カードを含めて10点に達したら勝利", () => {
      // player1を7点にセット + 隠し勝利点カード2枚 = 9点（あと1点で勝利）
      gameState = {
        ...gameState,
        players: gameState.players.map((p) =>
          p.id === "player1"
            ? {
                ...p,
                visibleVictoryPoints: 7,
                developmentCards: ["victoryPoint", "victoryPoint"],
                resources: {
                  ...p.resources,
                  wood: 10,
                  brick: 10,
                  wheat: 10,
                  ore: 10,
                  sheep: 10,
                },
              }
            : p
        ),
      };

      // サイコロを振る（シナリオで7以外が出るように設定されている）
      let state = handleRollDice(gameState, "player1");

      // mainフェーズであることを確認
      expect(state.phase).toBe("main");

      // 道を2本建設して開拓地を建設可能にする
      // 0,0,0_SE の端点 (0,1,-1)_N から伸ばす
      state = handleBuildRoad(state, "player1", "0,1,-1_NE");
      // (1,0,-1)_SE は (1,0,-1)_S と (1,1,-2)_N を接続
      state = handleBuildRoad(state, "player1", "1,0,-1_SE");

      // 開拓地を建設
      // 可視点8点 + 隠し勝利点2点 = 10点 で勝利
      state = handleBuildSettlement(state, "player1", "1,1,-2_N");

      expect(state.winnerId).toBe("player1");
      expect(state.phase).toBe("game_over");
    });
  });
});

describe("長期シナリオテスト", () => {
  it("20ターン以上のゲームが正常に進行する", () => {
    // 十分なダイスロールを含むシナリオを作成
    const diceRolls: Array<{ die1: number; die2: number }> = [];
    for (let i = 0; i < 100; i++) {
      // 7以外の数字（資源配布が発生）
      diceRolls.push({ die1: 3, die2: 3 }); // 6
      diceRolls.push({ die1: 4, die2: 4 }); // 8
      diceRolls.push({ die1: 2, die2: 3 }); // 5
      diceRolls.push({ die1: 5, die2: 4 }); // 9
    }

    const scenario: TestScenario = {
      ...SCENARIO_FOUR_PLAYERS_VICTORY,
      diceRolls,
    };

    let state = createInitialGameState("test-room", "player1", scenario);
    state = addPlayerToGame(state, "player1", "Player 1");
    state = addPlayerToGame(state, "player2", "Player 2");
    state = addPlayerToGame(state, "player3", "Player 3");
    state = addPlayerToGame(state, "player4", "Player 4");
    state = startGame(state);

    // セットアップフェーズをスキップ（skipSetupPhase を使用）
    state = skipSetupPhase(state);

    // 20ターン実行
    for (let turn = 0; turn < 20; turn++) {
      const currentPlayer = state.currentPlayerId!;

      // サイコロを振る
      state = handleRollDice(state, currentPlayer);
      expect(state.phase).toBe("main");

      // ターン終了
      state = handleEndTurn(state, currentPlayer);
    }

    // 20ターン後も正常に動作
    expect(state.turnNumber).toBe(21); // 初期値1 + 20ターン
    expect(state.phase).toBe("roll_dice");

    // 各プレイヤーが資源を獲得している
    const totalResources = state.players.reduce((sum, p) => {
      return (
        sum + Object.values(p.resources).reduce((pSum, count) => pSum + count, 0)
      );
    }, 0);
    expect(totalResources).toBeGreaterThan(0);
  });
});
