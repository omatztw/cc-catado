/**
 * MCP ツール定義
 * AIがカタンをプレイするためのツール群
 */

import { z } from "zod";
import type { HoldableResource, DevelopmentCardType } from "@/types/game";

// ============================================
// ツールスキーマ定義
// ============================================

export const CreateGameSchema = z.object({
  playerName: z.string().describe("AIプレイヤーの名前"),
  cpuCount: z
    .number()
    .min(2)
    .max(3)
    .default(2)
    .describe("CPUプレイヤーの数（2-3）"),
});

export const GetGameStateSchema = z.object({
  gameId: z.string().describe("ゲームID"),
});

export const GetAvailableActionsSchema = z.object({
  gameId: z.string().describe("ゲームID"),
});

export const StartGameSchema = z.object({
  gameId: z.string().describe("ゲームID"),
});

export const RollDiceSchema = z.object({
  gameId: z.string().describe("ゲームID"),
});

export const BuildSettlementSchema = z.object({
  gameId: z.string().describe("ゲームID"),
  intersectionId: z.string().describe("建設する頂点のID"),
});

export const BuildCitySchema = z.object({
  gameId: z.string().describe("ゲームID"),
  intersectionId: z.string().describe("都市を建設する頂点のID（既存の開拓地の場所）"),
});

export const BuildRoadSchema = z.object({
  gameId: z.string().describe("ゲームID"),
  edgeId: z.string().describe("建設する辺のID"),
});

export const MoveRobberSchema = z.object({
  gameId: z.string().describe("ゲームID"),
  hexId: z.string().describe("盗賊を移動するタイルのID"),
});

export const StealResourceSchema = z.object({
  gameId: z.string().describe("ゲームID"),
  targetPlayerId: z.string().describe("資源を奪う対象プレイヤーのID"),
});

export const DiscardResourcesSchema = z.object({
  gameId: z.string().describe("ゲームID"),
  resources: z
    .object({
      wood: z.number().optional(),
      brick: z.number().optional(),
      wheat: z.number().optional(),
      ore: z.number().optional(),
      sheep: z.number().optional(),
    })
    .describe("破棄する資源の数"),
});

export const BuyDevelopmentCardSchema = z.object({
  gameId: z.string().describe("ゲームID"),
});

export const UseDevelopmentCardSchema = z.object({
  gameId: z.string().describe("ゲームID"),
  cardType: z
    .enum(["knight", "roadBuilding", "yearOfPlenty", "monopoly"])
    .describe("使用するカードの種類"),
  params: z
    .object({
      // 収穫カード用
      resources: z
        .array(z.enum(["wood", "brick", "wheat", "ore", "sheep"]))
        .length(2)
        .optional()
        .describe("収穫カード: 獲得する2種類の資源"),
      // 独占カード用
      resource: z
        .enum(["wood", "brick", "wheat", "ore", "sheep"])
        .optional()
        .describe("独占カード: 奪う資源の種類"),
    })
    .optional()
    .describe("カード固有のパラメータ"),
});

export const TradeWithBankSchema = z.object({
  gameId: z.string().describe("ゲームID"),
  give: z
    .object({
      resource: z.enum(["wood", "brick", "wheat", "ore", "sheep"]),
      amount: z.number(),
    })
    .describe("提供する資源と枚数"),
  receive: z
    .enum(["wood", "brick", "wheat", "ore", "sheep"])
    .describe("受け取る資源"),
});

export const EndTurnSchema = z.object({
  gameId: z.string().describe("ゲームID"),
});

export const RunUntilMyTurnSchema = z.object({
  gameId: z.string().describe("ゲームID"),
});

export const ListGamesSchema = z.object({});

export const DeleteGameSchema = z.object({
  gameId: z.string().describe("ゲームID"),
});

// ============================================
// ツール定義
// ============================================

export const TOOL_DEFINITIONS = [
  {
    name: "create_game",
    description:
      "新しいカタンゲームを作成します。AIプレイヤーとCPUプレイヤーが参加します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        playerName: {
          type: "string",
          description: "AIプレイヤーの名前",
        },
        cpuCount: {
          type: "number",
          description: "CPUプレイヤーの数（2-3）。デフォルトは2。",
          minimum: 2,
          maximum: 3,
        },
      },
      required: ["playerName"],
    },
  },
  {
    name: "list_games",
    description: "作成済みのゲーム一覧を取得します。",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_game_state",
    description:
      "指定したゲームの現在の状態を取得します。ボード状況、プレイヤー情報、現在のフェーズなどを含みます。",
    inputSchema: {
      type: "object" as const,
      properties: {
        gameId: {
          type: "string",
          description: "ゲームID",
        },
      },
      required: ["gameId"],
    },
  },
  {
    name: "get_available_actions",
    description:
      "現在実行可能なアクションの一覧を取得します。各アクションには説明と必要なパラメータが含まれます。",
    inputSchema: {
      type: "object" as const,
      properties: {
        gameId: {
          type: "string",
          description: "ゲームID",
        },
      },
      required: ["gameId"],
    },
  },
  {
    name: "start_game",
    description: "ゲームを開始します。全プレイヤーが揃っている必要があります。",
    inputSchema: {
      type: "object" as const,
      properties: {
        gameId: {
          type: "string",
          description: "ゲームID",
        },
      },
      required: ["gameId"],
    },
  },
  {
    name: "roll_dice",
    description:
      "サイコロを振ります。roll_diceフェーズでのみ実行可能です。",
    inputSchema: {
      type: "object" as const,
      properties: {
        gameId: {
          type: "string",
          description: "ゲームID",
        },
      },
      required: ["gameId"],
    },
  },
  {
    name: "build_settlement",
    description:
      "開拓地を建設します。初期配置フェーズまたはメインフェーズで使用。コスト: 木材1、レンガ1、小麦1、羊毛1",
    inputSchema: {
      type: "object" as const,
      properties: {
        gameId: {
          type: "string",
          description: "ゲームID",
        },
        intersectionId: {
          type: "string",
          description: "建設する頂点のID（get_available_actionsで確認可能）",
        },
      },
      required: ["gameId", "intersectionId"],
    },
  },
  {
    name: "build_city",
    description:
      "都市を建設します。既存の開拓地を都市にアップグレードします。コスト: 小麦2、鉱石3",
    inputSchema: {
      type: "object" as const,
      properties: {
        gameId: {
          type: "string",
          description: "ゲームID",
        },
        intersectionId: {
          type: "string",
          description: "都市を建設する頂点のID（自分の開拓地がある場所）",
        },
      },
      required: ["gameId", "intersectionId"],
    },
  },
  {
    name: "build_road",
    description:
      "道を建設します。初期配置フェーズまたはメインフェーズで使用。コスト: 木材1、レンガ1",
    inputSchema: {
      type: "object" as const,
      properties: {
        gameId: {
          type: "string",
          description: "ゲームID",
        },
        edgeId: {
          type: "string",
          description: "建設する辺のID（get_available_actionsで確認可能）",
        },
      },
      required: ["gameId", "edgeId"],
    },
  },
  {
    name: "move_robber",
    description:
      "盗賊を移動します。7が出た時またはの騎士カード使用時に実行。",
    inputSchema: {
      type: "object" as const,
      properties: {
        gameId: {
          type: "string",
          description: "ゲームID",
        },
        hexId: {
          type: "string",
          description: "移動先のタイルID（get_available_actionsで確認可能）",
        },
      },
      required: ["gameId", "hexId"],
    },
  },
  {
    name: "steal_resource",
    description: "盗賊移動後、隣接するプレイヤーから資源を1枚奪います。",
    inputSchema: {
      type: "object" as const,
      properties: {
        gameId: {
          type: "string",
          description: "ゲームID",
        },
        targetPlayerId: {
          type: "string",
          description: "資源を奪う対象プレイヤーのID",
        },
      },
      required: ["gameId", "targetPlayerId"],
    },
  },
  {
    name: "discard_resources",
    description:
      "資源を破棄します。7が出た時に8枚以上持っている場合、半分を破棄する必要があります。",
    inputSchema: {
      type: "object" as const,
      properties: {
        gameId: {
          type: "string",
          description: "ゲームID",
        },
        resources: {
          type: "object",
          description: "破棄する資源の種類と枚数",
          properties: {
            wood: { type: "number" },
            brick: { type: "number" },
            wheat: { type: "number" },
            ore: { type: "number" },
            sheep: { type: "number" },
          },
        },
      },
      required: ["gameId", "resources"],
    },
  },
  {
    name: "buy_development_card",
    description:
      "発展カードを購入します。コスト: 小麦1、鉱石1、羊毛1",
    inputSchema: {
      type: "object" as const,
      properties: {
        gameId: {
          type: "string",
          description: "ゲームID",
        },
      },
      required: ["gameId"],
    },
  },
  {
    name: "use_development_card",
    description:
      "発展カードを使用します。騎士、街道建設、収穫、独占カードが使用可能です。購入したターンは使用できません。",
    inputSchema: {
      type: "object" as const,
      properties: {
        gameId: {
          type: "string",
          description: "ゲームID",
        },
        cardType: {
          type: "string",
          enum: ["knight", "roadBuilding", "yearOfPlenty", "monopoly"],
          description: "使用するカードの種類",
        },
        params: {
          type: "object",
          description: "カード固有のパラメータ",
          properties: {
            resources: {
              type: "array",
              items: {
                type: "string",
                enum: ["wood", "brick", "wheat", "ore", "sheep"],
              },
              description: "収穫カード: 獲得する2種類の資源",
            },
            resource: {
              type: "string",
              enum: ["wood", "brick", "wheat", "ore", "sheep"],
              description: "独占カード: 奪う資源の種類",
            },
          },
        },
      },
      required: ["gameId", "cardType"],
    },
  },
  {
    name: "trade_with_bank",
    description:
      "銀行と交易します。デフォルトは4:1交換。港を持っていると有利なレートで交換できます。",
    inputSchema: {
      type: "object" as const,
      properties: {
        gameId: {
          type: "string",
          description: "ゲームID",
        },
        give: {
          type: "object",
          description: "提供する資源",
          properties: {
            resource: {
              type: "string",
              enum: ["wood", "brick", "wheat", "ore", "sheep"],
            },
            amount: { type: "number" },
          },
          required: ["resource", "amount"],
        },
        receive: {
          type: "string",
          enum: ["wood", "brick", "wheat", "ore", "sheep"],
          description: "受け取る資源",
        },
      },
      required: ["gameId", "give", "receive"],
    },
  },
  {
    name: "end_turn",
    description: "ターンを終了し、次のプレイヤーに移行します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        gameId: {
          type: "string",
          description: "ゲームID",
        },
      },
      required: ["gameId"],
    },
  },
  {
    name: "run_until_my_turn",
    description:
      "CPUプレイヤーのターンを自動実行し、自分のターンまで進めます。ゲームの進行を早めるのに便利です。",
    inputSchema: {
      type: "object" as const,
      properties: {
        gameId: {
          type: "string",
          description: "ゲームID",
        },
      },
      required: ["gameId"],
    },
  },
  {
    name: "delete_game",
    description: "ゲームを削除します。",
    inputSchema: {
      type: "object" as const,
      properties: {
        gameId: {
          type: "string",
          description: "ゲームID",
        },
      },
      required: ["gameId"],
    },
  },
];

// ============================================
// ツールハンドラーの型定義
// ============================================

export type ToolName =
  | "create_game"
  | "list_games"
  | "get_game_state"
  | "get_available_actions"
  | "start_game"
  | "roll_dice"
  | "build_settlement"
  | "build_city"
  | "build_road"
  | "move_robber"
  | "steal_resource"
  | "discard_resources"
  | "buy_development_card"
  | "use_development_card"
  | "trade_with_bank"
  | "end_turn"
  | "run_until_my_turn"
  | "delete_game";

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
