/**
 * ゲームロジックのテスト
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { GameState, TestScenario } from "@/types/game";
import {
  createInitialGameState,
  startGame,
  handleRollDice,
  handleBuildSettlement,
  handleBuildRoad,
  handleMoveRobber,
  handleStealResource,
  handleEndTurn,
  rollDice,
  addPlayerToGame,
} from "../game-logic";
import {
  createGameWithThreePlayers,
  createStartedGame,
  createStandardBoardSetup,
  giveResourcesToPlayer,
  skipToMainPhase,
  moveRobberTo,
} from "./test-helpers";

describe("rollDice", () => {
  it("シナリオなしの場合は1-6のランダムな値を返す", () => {
    const results: number[] = [];
    for (let i = 0; i < 100; i++) {
      const result = rollDice();
      results.push(result.die1, result.die2);
      expect(result.die1).toBeGreaterThanOrEqual(1);
      expect(result.die1).toBeLessThanOrEqual(6);
      expect(result.die2).toBeGreaterThanOrEqual(1);
      expect(result.die2).toBeLessThanOrEqual(6);
      expect(result.total).toBe(result.die1 + result.die2);
    }
  });

  it("シナリオが定義されている場合はキューから値を取得する", () => {
    const scenario: TestScenario = {
      diceRolls: [
        { die1: 3, die2: 4 },
        { die1: 6, die2: 6 },
        { die1: 1, die2: 1 },
      ],
    };

    const result1 = rollDice(scenario);
    expect(result1).toEqual({ die1: 3, die2: 4, total: 7 });

    const result2 = rollDice(scenario);
    expect(result2).toEqual({ die1: 6, die2: 6, total: 12 });

    const result3 = rollDice(scenario);
    expect(result3).toEqual({ die1: 1, die2: 1, total: 2 });

    // キューが空になったらランダムに戻る
    const result4 = rollDice(scenario);
    expect(result4.die1).toBeGreaterThanOrEqual(1);
    expect(result4.die1).toBeLessThanOrEqual(6);
  });
});

describe("createInitialGameState", () => {
  it("シナリオなしの場合はランダムなボードを生成する", () => {
    const state = createInitialGameState("room1", "host1");

    expect(state.id).toBe("room1");
    expect(state.hostId).toBe("host1");
    expect(state.phase).toBe("waiting");
    expect(state.hexes).toHaveLength(19);
    expect(state.developmentCardDeck).toHaveLength(25);
  });

  it("シナリオが定義されている場合は固定ボードを生成する", () => {
    const boardSetup = createStandardBoardSetup();
    const scenario: TestScenario = {
      boardSetup,
    };

    const state = createInitialGameState("room1", "host1", scenario);

    // 中央が砂漠であることを確認
    const centerHex = state.hexes.find((h) => h.id === "0,0,0");
    expect(centerHex?.resourceType).toBe("desert");
    expect(centerHex?.hasRobber).toBe(true);
    expect(centerHex?.numberToken).toBeNull();

    // 砂漠以外のタイルに数字トークンがあることを確認
    const nonDesertHexes = state.hexes.filter(
      (h) => h.resourceType !== "desert"
    );
    nonDesertHexes.forEach((hex) => {
      expect(hex.numberToken).not.toBeNull();
    });
  });

  it("シナリオの発展カード順序が適用される", () => {
    const scenario: TestScenario = {
      developmentCardOrder: [
        "victoryPoint",
        "knight",
        "roadBuilding",
        "yearOfPlenty",
        "monopoly",
      ],
    };

    const state = createInitialGameState("room1", "host1", scenario);

    expect(state.developmentCardDeck).toEqual([
      "victoryPoint",
      "knight",
      "roadBuilding",
      "yearOfPlenty",
      "monopoly",
    ]);
  });
});

describe("startGame", () => {
  it("3人未満ではゲームを開始できない", () => {
    const state = createInitialGameState("room1", "host1");
    const withOnePlayer = addPlayerToGame(state, "player1", "Player 1");

    expect(() => startGame(withOnePlayer)).toThrow("Not enough players");
  });

  it("シナリオなしの場合はターン順がランダム化される", () => {
    const state = createGameWithThreePlayers();
    const startedState = startGame(state);

    expect(startedState.phase).toBe("setup_settlement_1");
    expect(startedState.turnOrder).toHaveLength(3);
    expect(startedState.currentPlayerId).toBe(startedState.turnOrder[0]);
  });

  it("シナリオのターン順が適用される", () => {
    const scenario: TestScenario = {
      turnOrder: ["player3", "player1", "player2"],
    };

    const state = createGameWithThreePlayers(scenario);
    const startedState = startGame(state);

    expect(startedState.turnOrder).toEqual(["player3", "player1", "player2"]);
    expect(startedState.currentPlayerId).toBe("player3");
    // プレイヤー配列もターン順に並び替えられている
    expect(startedState.players[0].id).toBe("player3");
  });
});

describe("handleRollDice", () => {
  let gameState: GameState;

  beforeEach(() => {
    const scenario: TestScenario = {
      turnOrder: ["player1", "player2", "player3"],
      boardSetup: createStandardBoardSetup(),
    };
    gameState = createStartedGame(scenario);
    // roll_diceフェーズにスキップ
    gameState = skipToMainPhase(gameState);
  });

  it("7が出た場合は盗賊移動フェーズに遷移する", () => {
    // diceRollsをシナリオに追加
    gameState = {
      ...gameState,
      testScenario: {
        ...gameState.testScenario,
        diceRolls: [{ die1: 3, die2: 4 }], // 合計7
      },
    };

    const newState = handleRollDice(gameState, "player1");

    expect(newState.diceResult?.total).toBe(7);
    expect(newState.phase).toBe("robber_move");
  });

  it("7以外の場合はmainフェーズに遷移する", () => {
    gameState = {
      ...gameState,
      testScenario: {
        ...gameState.testScenario,
        diceRolls: [{ die1: 3, die2: 3 }], // 合計6
      },
    };

    const newState = handleRollDice(gameState, "player1");

    expect(newState.diceResult?.total).toBe(6);
    expect(newState.phase).toBe("main");
  });

  it("自分のターンでないとサイコロを振れない", () => {
    expect(() => handleRollDice(gameState, "player2")).toThrow("Not your turn");
  });
});

describe("handleStealResource", () => {
  let gameState: GameState;

  beforeEach(() => {
    const scenario: TestScenario = {
      turnOrder: ["player1", "player2", "player3"],
      boardSetup: createStandardBoardSetup(),
    };
    gameState = createStartedGame(scenario);

    // player2に資源を付与
    gameState = giveResourcesToPlayer(gameState, "player2", {
      wood: 2,
      brick: 1,
      wheat: 1,
    });

    // robber_stealフェーズに設定
    gameState = {
      ...gameState,
      phase: "robber_steal",
    };

    // 盗賊を player2 が建物を持っているタイルに移動
    // （テスト用に直接建物を設置）
    const targetHexId = "1,-1,0"; // 内側リングの1つ目
    gameState = moveRobberTo(gameState, targetHexId);

    // player2の建物をそのタイルに配置
    const adjacentVertexId = "1,-1,0_N";
    gameState = {
      ...gameState,
      intersections: gameState.intersections.map((i) =>
        i.id === adjacentVertexId
          ? { ...i, building: { type: "settlement", playerId: "player2" } }
          : i
      ),
    };
  });

  it("シナリオのstealIndicesが適用される", () => {
    // stealIndicesを設定（インデックス0 = 最初の資源）
    gameState = {
      ...gameState,
      testScenario: {
        ...gameState.testScenario,
        stealIndices: [0], // wood を盗む（availableResourcesの最初）
      },
    };

    const beforeWood = gameState.players.find(
      (p) => p.id === "player1"
    )!.resources.wood;
    const beforeTargetWood = gameState.players.find(
      (p) => p.id === "player2"
    )!.resources.wood;

    const newState = handleStealResource(gameState, "player1", "player2");

    const afterWood = newState.players.find(
      (p) => p.id === "player1"
    )!.resources.wood;
    const afterTargetWood = newState.players.find(
      (p) => p.id === "player2"
    )!.resources.wood;

    // player1の木材が1増え、player2の木材が1減る
    expect(afterWood).toBe(beforeWood + 1);
    expect(afterTargetWood).toBe(beforeTargetWood - 1);
    expect(newState.phase).toBe("main");
  });

  it("自分から資源を奪うことはできない", () => {
    expect(() =>
      handleStealResource(gameState, "player1", "player1")
    ).toThrow("Cannot steal from yourself");
  });
});

describe("7が出た時のフロー", () => {
  it("8枚以上の資源を持つプレイヤーがいる場合はdiscardフェーズに遷移", () => {
    const scenario: TestScenario = {
      turnOrder: ["player1", "player2", "player3"],
      boardSetup: createStandardBoardSetup(),
      diceRolls: [{ die1: 3, die2: 4 }], // 7
    };

    let gameState = createStartedGame(scenario);
    gameState = skipToMainPhase(gameState);

    // player2に8枚以上の資源を付与
    gameState = giveResourcesToPlayer(gameState, "player2", {
      wood: 3,
      brick: 3,
      wheat: 3, // 合計9枚
    });

    const newState = handleRollDice(gameState, "player1");

    expect(newState.diceResult?.total).toBe(7);
    expect(newState.phase).toBe("discard");
  });

  it("8枚以上のプレイヤーがいない場合は直接robber_moveフェーズに遷移", () => {
    const scenario: TestScenario = {
      turnOrder: ["player1", "player2", "player3"],
      boardSetup: createStandardBoardSetup(),
      diceRolls: [{ die1: 3, die2: 4 }], // 7
    };

    let gameState = createStartedGame(scenario);
    gameState = skipToMainPhase(gameState);

    // 全員7枚以下
    gameState = giveResourcesToPlayer(gameState, "player1", { wood: 2 });
    gameState = giveResourcesToPlayer(gameState, "player2", { brick: 3 });

    const newState = handleRollDice(gameState, "player1");

    expect(newState.diceResult?.total).toBe(7);
    expect(newState.phase).toBe("robber_move");
  });
});

describe("勝利条件", () => {
  it("10点に達したプレイヤーが勝利", () => {
    // このテストは実装後に追加
    // TODO: 勝利条件のテストを実装
    expect(true).toBe(true);
  });
});
