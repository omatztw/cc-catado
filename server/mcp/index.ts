#!/usr/bin/env node
/**
 * MCP Server for Catan Game
 * AIがカタンをプレイするためのMCPサーバー
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { gameManager } from "./game-manager";
import { RESOURCE_TEMPLATES } from "./resources";
import type { HoldableResource, DevelopmentCardType } from "@/types/game";

// ============================================
// MCPサーバーの初期化
// ============================================

const server = new McpServer(
  {
    name: "catan-game-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
    instructions: `このMCPサーバーはカタン（Catan）ボードゲームをプレイするためのサーバーです。

## 利用可能な機能:
- ゲームの作成・管理
- ゲーム状態の確認
- アクションの実行（建設、交易、発展カードなど）
- AIとCPUの対戦

## 基本的な流れ:
1. create_game でゲームを作成
2. start_game でゲームを開始
3. get_available_actions で実行可能なアクションを確認
4. 各種アクションを実行
5. run_until_my_turn でCPUのターンをスキップ

## リソース:
- catan://rules - ゲームルールの詳細
- catan://strategy - 戦略ガイド`,
  }
);

// ============================================
// リソースの登録
// ============================================

server.registerResource(
  "rules",
  RESOURCE_TEMPLATES.rules.uri,
  {
    description: RESOURCE_TEMPLATES.rules.description,
    mimeType: RESOURCE_TEMPLATES.rules.mimeType,
  },
  async () => ({
    contents: [
      {
        uri: RESOURCE_TEMPLATES.rules.uri,
        mimeType: RESOURCE_TEMPLATES.rules.mimeType,
        text: RESOURCE_TEMPLATES.rules.content,
      },
    ],
  })
);

server.registerResource(
  "strategy",
  RESOURCE_TEMPLATES.strategy.uri,
  {
    description: RESOURCE_TEMPLATES.strategy.description,
    mimeType: RESOURCE_TEMPLATES.strategy.mimeType,
  },
  async () => ({
    contents: [
      {
        uri: RESOURCE_TEMPLATES.strategy.uri,
        mimeType: RESOURCE_TEMPLATES.strategy.mimeType,
        text: RESOURCE_TEMPLATES.strategy.content,
      },
    ],
  })
);

// ============================================
// ツールの登録
// ============================================

// ゲーム作成
server.registerTool(
  "create_game",
  {
    description:
      "新しいカタンゲームを作成します。AIプレイヤーとCPUプレイヤーが参加します。",
    inputSchema: z.object({
      playerName: z.string().describe("AIプレイヤーの名前"),
      cpuCount: z
        .number()
        .min(2)
        .max(3)
        .default(2)
        .describe("CPUプレイヤーの数（2-3）"),
    }),
  },
  async ({ playerName, cpuCount }) => {
    try {
      const gameInfo = gameManager.createGame(playerName, cpuCount || 2);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                gameId: gameInfo.gameId,
                aiPlayerId: gameInfo.aiPlayerId,
                message: `ゲーム「${gameInfo.gameId}」を作成しました。start_gameでゲームを開始してください。`,
                players: gameInfo.state.players.map((p) => ({
                  id: p.id,
                  name: p.name,
                  color: p.color,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ゲーム一覧
server.registerTool(
  "list_games",
  {
    description: "作成済みのゲーム一覧を取得します。",
    inputSchema: z.object({}),
  },
  async () => {
    const games = gameManager.getAllGames();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              games: games.map((g) => ({
                gameId: g.gameId,
                phase: g.state.phase,
                playerCount: g.state.players.length,
                createdAt: g.createdAt,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ゲーム状態取得
server.registerTool(
  "get_game_state",
  {
    description:
      "指定したゲームの現在の状態を取得します。ボード状況、プレイヤー情報、現在のフェーズなどを含みます。",
    inputSchema: z.object({
      gameId: z.string().describe("ゲームID"),
    }),
  },
  async ({ gameId }) => {
    try {
      const state = gameManager.getFilteredState(gameId);
      const gameInfo = gameManager.getGame(gameId);

      // 状態を読みやすい形式に変換
      const summary = {
        gameId: state.id,
        phase: state.phase,
        currentPlayer:
          state.players.find((p) => p.id === state.currentPlayerId)?.name ||
          null,
        isMyTurn: state.currentPlayerId === gameInfo?.aiPlayerId,
        turnNumber: state.turnNumber,
        diceResult: state.diceResult,
        myPlayer: state.players.find((p) => p.id === gameInfo?.aiPlayerId),
        otherPlayers: state.players
          .filter((p) => p.id !== gameInfo?.aiPlayerId)
          .map((p) => ({
            id: p.id,
            name: p.name,
            color: p.color,
            visibleVictoryPoints: p.visibleVictoryPoints,
            resourceCount: Object.values(p.resources).reduce((a, b) => a + b, 0),
            settlements: 5 - p.remainingPieces.settlements,
            cities: 4 - p.remainingPieces.cities,
            roads: 15 - p.remainingPieces.roads,
            knightsPlayed: p.knightsPlayed,
          })),
        specialAwards: {
          longestRoad: state.longestRoadPlayerId
            ? state.players.find((p) => p.id === state.longestRoadPlayerId)
                ?.name
            : null,
          largestArmy: state.largestArmyPlayerId
            ? state.players.find((p) => p.id === state.largestArmyPlayerId)
                ?.name
            : null,
        },
        developmentCardDeckCount: state.developmentCardDeckCount,
        activeTradeOffer: state.activeTradeOffer,
        winner: state.winnerId
          ? state.players.find((p) => p.id === state.winnerId)?.name
          : null,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// 実行可能なアクション取得
server.registerTool(
  "get_available_actions",
  {
    description:
      "現在実行可能なアクションの一覧を取得します。各アクションには説明と必要なパラメータが含まれます。",
    inputSchema: z.object({
      gameId: z.string().describe("ゲームID"),
    }),
  },
  async ({ gameId }) => {
    try {
      const actions = gameManager.getAvailableActions(gameId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                actions,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ゲーム開始
server.registerTool(
  "start_game",
  {
    description: "ゲームを開始します。全プレイヤーが揃っている必要があります。",
    inputSchema: z.object({
      gameId: z.string().describe("ゲームID"),
    }),
  },
  async ({ gameId }) => {
    try {
      const state = gameManager.startGame(gameId);
      const gameInfo = gameManager.getGame(gameId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: "ゲームを開始しました。初期配置フェーズです。",
              phase: state.phase,
              currentPlayer: state.players.find(
                (p) => p.id === state.currentPlayerId
              )?.name,
              isMyTurn: state.currentPlayerId === gameInfo?.aiPlayerId,
              turnOrder: state.turnOrder.map(
                (id) => state.players.find((p) => p.id === id)?.name
              ),
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// サイコロを振る
server.registerTool(
  "roll_dice",
  {
    description:
      "サイコロを振ります。roll_diceフェーズでのみ実行可能です。",
    inputSchema: z.object({
      gameId: z.string().describe("ゲームID"),
    }),
  },
  async ({ gameId }) => {
    try {
      const state = gameManager.executeAction(gameId, { type: "roll_dice" });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              diceResult: state.diceResult,
              message: `サイコロの目: ${state.diceResult?.die1} + ${state.diceResult?.die2} = ${state.diceResult?.total}`,
              nextPhase: state.phase,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// 開拓地建設
server.registerTool(
  "build_settlement",
  {
    description:
      "開拓地を建設します。初期配置フェーズまたはメインフェーズで使用。コスト: 木材1、レンガ1、小麦1、羊毛1",
    inputSchema: z.object({
      gameId: z.string().describe("ゲームID"),
      intersectionId: z
        .string()
        .describe("建設する頂点のID（get_available_actionsで確認可能）"),
    }),
  },
  async ({ gameId, intersectionId }) => {
    try {
      const state = gameManager.executeAction(gameId, {
        type: "build_settlement",
        intersectionId,
      });
      const gameInfo = gameManager.getGame(gameId);
      const player = state.players.find((p) => p.id === gameInfo?.aiPlayerId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: `開拓地を建設しました: ${intersectionId}`,
              phase: state.phase,
              resources: player?.resources,
              victoryPoints: player?.visibleVictoryPoints,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// 都市建設
server.registerTool(
  "build_city",
  {
    description:
      "都市を建設します。既存の開拓地を都市にアップグレードします。コスト: 小麦2、鉱石3",
    inputSchema: z.object({
      gameId: z.string().describe("ゲームID"),
      intersectionId: z
        .string()
        .describe("都市を建設する頂点のID（自分の開拓地がある場所）"),
    }),
  },
  async ({ gameId, intersectionId }) => {
    try {
      const state = gameManager.executeAction(gameId, {
        type: "build_city",
        intersectionId,
      });
      const gameInfo = gameManager.getGame(gameId);
      const player = state.players.find((p) => p.id === gameInfo?.aiPlayerId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: `都市を建設しました: ${intersectionId}`,
              phase: state.phase,
              resources: player?.resources,
              victoryPoints: player?.visibleVictoryPoints,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// 道建設
server.registerTool(
  "build_road",
  {
    description:
      "道を建設します。初期配置フェーズまたはメインフェーズで使用。コスト: 木材1、レンガ1",
    inputSchema: z.object({
      gameId: z.string().describe("ゲームID"),
      edgeId: z
        .string()
        .describe("建設する辺のID（get_available_actionsで確認可能）"),
    }),
  },
  async ({ gameId, edgeId }) => {
    try {
      const state = gameManager.executeAction(gameId, {
        type: "build_road",
        edgeId,
      });
      const gameInfo = gameManager.getGame(gameId);
      const player = state.players.find((p) => p.id === gameInfo?.aiPlayerId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: `道を建設しました: ${edgeId}`,
              phase: state.phase,
              resources: player?.resources,
              roadsBuilt: 15 - (player?.remainingPieces.roads || 0),
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// 盗賊移動
server.registerTool(
  "move_robber",
  {
    description:
      "盗賊を移動します。7が出た時または騎士カード使用時に実行。",
    inputSchema: z.object({
      gameId: z.string().describe("ゲームID"),
      hexId: z
        .string()
        .describe("移動先のタイルID（get_available_actionsで確認可能）"),
    }),
  },
  async ({ gameId, hexId }) => {
    try {
      const state = gameManager.executeAction(gameId, {
        type: "move_robber",
        hexId,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: `盗賊を移動しました: ${hexId}`,
              phase: state.phase,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// 資源略奪
server.registerTool(
  "steal_resource",
  {
    description: "盗賊移動後、隣接するプレイヤーから資源を1枚奪います。",
    inputSchema: z.object({
      gameId: z.string().describe("ゲームID"),
      targetPlayerId: z.string().describe("資源を奪う対象プレイヤーのID"),
    }),
  },
  async ({ gameId, targetPlayerId }) => {
    try {
      const state = gameManager.executeAction(gameId, {
        type: "steal_resource",
        targetPlayerId,
      });
      const gameInfo = gameManager.getGame(gameId);
      const player = state.players.find((p) => p.id === gameInfo?.aiPlayerId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: `資源を奪いました`,
              phase: state.phase,
              resources: player?.resources,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// 資源破棄
server.registerTool(
  "discard_resources",
  {
    description:
      "資源を破棄します。7が出た時に8枚以上持っている場合、半分を破棄する必要があります。",
    inputSchema: z.object({
      gameId: z.string().describe("ゲームID"),
      resources: z
        .object({
          wood: z.number().optional(),
          brick: z.number().optional(),
          wheat: z.number().optional(),
          ore: z.number().optional(),
          sheep: z.number().optional(),
        })
        .describe("破棄する資源の種類と枚数"),
    }),
  },
  async ({ gameId, resources }) => {
    try {
      const state = gameManager.executeAction(gameId, {
        type: "discard_resources",
        resources,
      });
      const gameInfo = gameManager.getGame(gameId);
      const player = state.players.find((p) => p.id === gameInfo?.aiPlayerId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: `資源を破棄しました`,
              phase: state.phase,
              resources: player?.resources,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// 発展カード購入
server.registerTool(
  "buy_development_card",
  {
    description: "発展カードを購入します。コスト: 小麦1、鉱石1、羊毛1",
    inputSchema: z.object({
      gameId: z.string().describe("ゲームID"),
    }),
  },
  async ({ gameId }) => {
    try {
      const state = gameManager.executeAction(gameId, {
        type: "buy_development_card",
      });
      const gameInfo = gameManager.getGame(gameId);
      const player = state.players.find((p) => p.id === gameInfo?.aiPlayerId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: `発展カードを購入しました（このターンは使用不可）`,
              resources: player?.resources,
              developmentCards: player?.developmentCards,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// 発展カード使用
server.registerTool(
  "use_development_card",
  {
    description:
      "発展カードを使用します。騎士、街道建設、収穫、独占カードが使用可能です。購入したターンは使用できません。",
    inputSchema: z.object({
      gameId: z.string().describe("ゲームID"),
      cardType: z
        .enum(["knight", "roadBuilding", "yearOfPlenty", "monopoly"])
        .describe("使用するカードの種類"),
      params: z
        .object({
          resources: z
            .array(z.enum(["wood", "brick", "wheat", "ore", "sheep"]))
            .optional()
            .describe("収穫カード: 獲得する2種類の資源"),
          resource: z
            .enum(["wood", "brick", "wheat", "ore", "sheep"])
            .optional()
            .describe("独占カード: 奪う資源の種類"),
        })
        .optional()
        .describe("カード固有のパラメータ"),
    }),
  },
  async ({ gameId, cardType, params }) => {
    try {
      const actionParams: {
        resources?: [HoldableResource, HoldableResource];
        resource?: HoldableResource;
      } = {};

      if (cardType === "yearOfPlenty" && params?.resources) {
        actionParams.resources = params.resources as [
          HoldableResource,
          HoldableResource
        ];
      }
      if (cardType === "monopoly" && params?.resource) {
        actionParams.resource = params.resource as HoldableResource;
      }

      const state = gameManager.executeAction(gameId, {
        type: "use_development_card",
        cardType: cardType as DevelopmentCardType,
        params: Object.keys(actionParams).length > 0 ? actionParams : undefined,
      });

      const gameInfo = gameManager.getGame(gameId);
      const player = state.players.find((p) => p.id === gameInfo?.aiPlayerId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: `${cardType}カードを使用しました`,
              phase: state.phase,
              resources: player?.resources,
              developmentCards: player?.developmentCards,
              knightsPlayed: player?.knightsPlayed,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// 銀行交易
server.registerTool(
  "trade_with_bank",
  {
    description:
      "銀行と交易します。デフォルトは4:1交換。港を持っていると有利なレートで交換できます。",
    inputSchema: z.object({
      gameId: z.string().describe("ゲームID"),
      give: z
        .object({
          resource: z.enum(["wood", "brick", "wheat", "ore", "sheep"]),
          amount: z.number(),
        })
        .describe("提供する資源"),
      receive: z
        .enum(["wood", "brick", "wheat", "ore", "sheep"])
        .describe("受け取る資源"),
    }),
  },
  async ({ gameId, give, receive }) => {
    try {
      const state = gameManager.executeAction(gameId, {
        type: "trade_with_bank",
        give: {
          resource: give.resource as HoldableResource,
          amount: give.amount,
        },
        receive: receive as HoldableResource,
      });
      const gameInfo = gameManager.getGame(gameId);
      const player = state.players.find((p) => p.id === gameInfo?.aiPlayerId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: `銀行と交易しました: ${give.resource} ${give.amount}枚 → ${receive} 1枚`,
              resources: player?.resources,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ターン終了
server.registerTool(
  "end_turn",
  {
    description: "ターンを終了し、次のプレイヤーに移行します。",
    inputSchema: z.object({
      gameId: z.string().describe("ゲームID"),
    }),
  },
  async ({ gameId }) => {
    try {
      const state = gameManager.executeAction(gameId, { type: "end_turn" });
      const gameInfo = gameManager.getGame(gameId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: "ターンを終了しました",
              nextPlayer: state.players.find(
                (p) => p.id === state.currentPlayerId
              )?.name,
              isMyTurn: state.currentPlayerId === gameInfo?.aiPlayerId,
              phase: state.phase,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// CPUターン自動実行
server.registerTool(
  "run_until_my_turn",
  {
    description:
      "CPUプレイヤーのターンを自動実行し、自分のターンまで進めます。ゲームの進行を早めるのに便利です。",
    inputSchema: z.object({
      gameId: z.string().describe("ゲームID"),
    }),
  },
  async ({ gameId }) => {
    try {
      const state = gameManager.runUntilMyTurn(gameId);
      const gameInfo = gameManager.getGame(gameId);
      const player = state.players.find((p) => p.id === gameInfo?.aiPlayerId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: "自分のターンまで進めました",
              phase: state.phase,
              currentPlayer: state.players.find(
                (p) => p.id === state.currentPlayerId
              )?.name,
              isMyTurn: state.currentPlayerId === gameInfo?.aiPlayerId,
              turnNumber: state.turnNumber,
              myResources: player?.resources,
              victoryPoints: player?.visibleVictoryPoints,
              winner: state.winnerId
                ? state.players.find((p) => p.id === state.winnerId)?.name
                : null,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ゲーム削除
server.registerTool(
  "delete_game",
  {
    description: "ゲームを削除します。",
    inputSchema: z.object({
      gameId: z.string().describe("ゲームID"),
    }),
  },
  async ({ gameId }) => {
    try {
      gameManager.deleteGame(gameId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: `ゲーム ${gameId} を削除しました`,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ============================================
// サーバー起動
// ============================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Catan MCP Server started");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
