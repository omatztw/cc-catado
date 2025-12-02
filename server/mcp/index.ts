#!/usr/bin/env node
/**
 * MCP Server for Catan Game
 * AIがカタンをプレイするためのMCPサーバー（リモートモード専用）
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { remoteClient } from "./remote-client";
import { RESOURCE_TEMPLATES } from "./resources";

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
    instructions: `このMCPサーバーはカタン（Catan）ボードゲームをリモートサーバーに接続してプレイするためのサーバーです。

## 利用可能な機能:
- リモートゲームサーバーへの接続
- ルームの作成・参加
- ゲーム状態の確認
- アクションの実行（建設、交易、発展カードなど）
- 人間プレイヤーとの対戦

## 基本的な流れ:
1. remote_connect でゲームサーバーに接続
2. remote_login でログイン
3. remote_create_room または remote_join_room でルームに参加
4. remote_get_actions で実行可能なアクションを確認
5. remote_action でアクションを実行
6. remote_wait_for_turn で自分のターンまで待機

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
// リモートモード用ツール
// ============================================

// リモートサーバーに接続
server.registerTool(
  "remote_connect",
  {
    description:
      "リモートのゲームサーバーに接続します。人間プレイヤーと対戦するために使用します。",
    inputSchema: z.object({
      serverUrl: z
        .string()
        .default("http://localhost:3001")
        .describe("ゲームサーバーのURL"),
    }),
  },
  async ({ serverUrl }) => {
    try {
      await remoteClient.connect(serverUrl);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: `サーバー ${serverUrl} に接続しました`,
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

// リモートサーバーから切断
server.registerTool(
  "remote_disconnect",
  {
    description: "リモートのゲームサーバーから切断します。",
    inputSchema: z.object({}),
  },
  async () => {
    remoteClient.disconnect();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            message: "サーバーから切断しました",
          }),
        },
      ],
    };
  }
);

// リモートサーバーにログイン
server.registerTool(
  "remote_login",
  {
    description: "リモートサーバーにログインします。",
    inputSchema: z.object({
      username: z.string().describe("ユーザー名"),
      password: z.string().describe("パスワード"),
    }),
  },
  async ({ username, password }) => {
    try {
      const result = await remoteClient.login(username, password);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: result.success,
              playerId: result.playerId,
              message: result.success
                ? `ログインしました: ${username}`
                : result.error,
            }),
          },
        ],
        isError: !result.success,
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

// 公開ルーム一覧を取得
server.registerTool(
  "remote_list_rooms",
  {
    description: "公開されているゲームルーム一覧を取得します。",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const rooms = await remoteClient.fetchPublicRooms();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                rooms: rooms.map((r) => ({
                  id: r.id,
                  name: r.name,
                  playerCount: r.playerCount,
                  maxPlayers: r.maxPlayers,
                  status: r.status,
                  hostName: r.hostName,
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

// ルームを作成
server.registerTool(
  "remote_create_room",
  {
    description: "新しいゲームルームを作成します。",
    inputSchema: z.object({
      roomName: z.string().describe("ルーム名"),
      isPublic: z.boolean().default(true).describe("公開ルームにするか"),
      password: z.string().optional().describe("パスワード（任意）"),
    }),
  },
  async ({ roomName, isPublic, password }) => {
    try {
      const result = await remoteClient.createRoom(roomName, isPublic, password);
      if (result.success) {
        // 自動的に席に着く
        await remoteClient.takeSeat();
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: result.success,
              roomId: result.roomId,
              message: result.success
                ? `ルーム「${roomName}」を作成しました`
                : result.error,
            }),
          },
        ],
        isError: !result.success,
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

// ルームに参加
server.registerTool(
  "remote_join_room",
  {
    description: "既存のゲームルームに参加します。",
    inputSchema: z.object({
      roomId: z.string().describe("ルームID"),
      password: z.string().optional().describe("パスワード（必要な場合）"),
    }),
  },
  async ({ roomId, password }) => {
    try {
      const result = await remoteClient.joinRoom(roomId, password);
      if (result.success) {
        // 自動的に席に着く
        await remoteClient.takeSeat();
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: result.success,
              roomId: result.roomId,
              message: result.success
                ? `ルーム ${roomId} に参加しました`
                : result.error,
            }),
          },
        ],
        isError: !result.success,
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

// リモートゲームの状態を取得
server.registerTool(
  "remote_get_state",
  {
    description: "リモートゲームの現在の状態を取得します。",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const gameInfo = remoteClient.getCurrentGame();
      if (!gameInfo) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "ルームに参加していません",
              }),
            },
          ],
          isError: true,
        };
      }

      const state = gameInfo.state;
      if (!state) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                message: "ゲームはまだ開始されていません",
                roomId: gameInfo.roomId,
                isSpectator: gameInfo.isSpectator,
              }),
            },
          ],
        };
      }

      const summary = {
        roomId: gameInfo.roomId,
        phase: state.phase,
        currentPlayer:
          state.players.find((p) => p.id === state.currentPlayerId)?.name ||
          null,
        isMyTurn: state.currentPlayerId === gameInfo.playerId,
        turnNumber: state.turnNumber,
        diceResult: state.diceResult,
        myPlayer: state.players.find((p) => p.id === gameInfo.playerId),
        otherPlayers: state.players
          .filter((p) => p.id !== gameInfo.playerId)
          .map((p) => ({
            id: p.id,
            name: p.name,
            color: p.color,
            visibleVictoryPoints: p.visibleVictoryPoints,
            resourceCount: Object.values(p.resources).reduce((a, b) => a + b, 0),
          })),
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

// リモートゲームで実行可能なアクションを取得
server.registerTool(
  "remote_get_actions",
  {
    description: "リモートゲームで現在実行可能なアクション一覧を取得します。",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const actions = remoteClient.getAvailableActions();
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

// リモートゲームでアクションを実行
server.registerTool(
  "remote_action",
  {
    description:
      "リモートゲームでアクションを実行します。アクションタイプと必要なパラメータを指定してください。",
    inputSchema: z.object({
      actionType: z
        .enum([
          "start_game",
          "roll_dice",
          "build_settlement",
          "build_city",
          "build_road",
          "move_robber",
          "steal_resource",
          "discard_resources",
          "buy_development_card",
          "use_development_card",
          "trade_with_bank",
          "end_turn",
        ])
        .describe("アクションの種類"),
      params: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("アクション固有のパラメータ（intersectionId, edgeId, hexId等）"),
    }),
  },
  async ({ actionType, params }) => {
    try {
      const action = { type: actionType, ...params };
      const result = await remoteClient.sendAction(action as Parameters<typeof remoteClient.sendAction>[0]);

      // アクション後の状態を取得
      const state = remoteClient.getGameState();
      const gameInfo = remoteClient.getCurrentGame();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: result.success,
              message: result.success
                ? `${actionType} を実行しました`
                : result.error,
              phase: state?.phase,
              isMyTurn: state?.currentPlayerId === gameInfo?.playerId,
            }),
          },
        ],
        isError: !result.success,
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

// 自分のターンまで待機
server.registerTool(
  "remote_wait_for_turn",
  {
    description:
      "他のプレイヤーのターンが終わるまで待機し、自分のターンになったら戻ります。",
    inputSchema: z.object({
      timeoutSeconds: z
        .number()
        .default(300)
        .describe("タイムアウト秒数（デフォルト300秒）"),
    }),
  },
  async ({ timeoutSeconds }) => {
    try {
      const state = await remoteClient.waitForMyTurn(timeoutSeconds * 1000);
      const gameInfo = remoteClient.getCurrentGame();
      const player = state.players.find((p) => p.id === gameInfo?.playerId);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message:
                state.phase === "game_over"
                  ? "ゲームが終了しました"
                  : "自分のターンになりました",
              phase: state.phase,
              isMyTurn: state.currentPlayerId === gameInfo?.playerId,
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

// チャットを送信
server.registerTool(
  "remote_chat",
  {
    description: "ゲームルームにチャットメッセージを送信します。",
    inputSchema: z.object({
      message: z.string().describe("メッセージ"),
    }),
  },
  async ({ message }) => {
    try {
      remoteClient.sendChat(message);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: "チャットを送信しました",
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
  console.error("Catan MCP Server started (remote mode)");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
