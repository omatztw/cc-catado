/**
 * AI クライアント
 * Gemini / DeepSeek API を使用してゲームアクションを決定
 */

import {
  type AIConfig,
  type AIProvider,
  type GameState,
  type GameAction,
  type AvailableAction,
} from "../../types/game";
import { CATAN_RULES, CATAN_STRATEGY } from "../mcp/resources";

// デフォルトモデル
const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: "gemini-2.0-flash-exp",
  deepseek: "deepseek-chat",
};

// API エンドポイント
const API_ENDPOINTS: Record<AIProvider, string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/models",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
};

/**
 * AI クライアントクラス
 */
export class AIClient {
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = {
      ...config,
      model: config.model || DEFAULT_MODELS[config.provider],
      thinkingDelay: config.thinkingDelay ?? 1000,
    };
  }

  /**
   * ゲーム状態と利用可能なアクションからAIの決定を取得
   */
  async decideAction(
    gameState: GameState,
    playerId: string,
    availableActions: AvailableAction[]
  ): Promise<GameAction | null> {
    const prompt = this.buildPrompt(gameState, playerId, availableActions);

    try {
      const response = await this.callAPI(prompt);
      const action = this.parseResponse(response, gameState.id, availableActions);

      // 人間らしさのための遅延
      if (this.config.thinkingDelay && this.config.thinkingDelay > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.config.thinkingDelay)
        );
      }

      return action;
    } catch (error) {
      console.error("[AIClient] Error deciding action:", error);
      return null;
    }
  }

  /**
   * プロンプトを構築
   */
  private buildPrompt(
    gameState: GameState,
    playerId: string,
    availableActions: AvailableAction[]
  ): string {
    const player = gameState.players.find((p) => p.id === playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }

    // ゲーム状態のサマリーを作成
    const stateSummary = this.buildStateSummary(gameState, player);

    // 利用可能なアクションをJSON形式で
    const actionsJson = JSON.stringify(availableActions, null, 2);

    return `あなたはカタンをプレイするAIです。以下のルールと戦略を理解し、最適なアクションを選択してください。

## ゲームルール
${CATAN_RULES}

## 戦略ガイド
${CATAN_STRATEGY}

## 現在のゲーム状態

${stateSummary}

## あなたの情報
- プレイヤー名: ${player.name}
- 色: ${player.color}
- 資源: 木材=${player.resources.wood}, レンガ=${player.resources.brick}, 小麦=${player.resources.wheat}, 鉱石=${player.resources.ore}, 羊毛=${player.resources.sheep}
- 発展カード: ${player.developmentCards.length}枚
- 使用済み騎士: ${player.knightsPlayed}枚
- 勝利点(公開): ${player.visibleVictoryPoints}

## 利用可能なアクション
以下のアクションから1つを選択してください:

${actionsJson}

## 回答形式
JSONで回答してください。以下の形式のみ使用可能です:

{"action": {"type": "アクション名", ...必要なパラメータ}, "reasoning": "選択理由"}

重要:
- 必ず上記の利用可能なアクションリストから選択してください
- type以外に必要なパラメータは、上記リストのparamsを参照してください
- roomIdは不要です（自動で追加されます）
- reasoningは日本語で簡潔に記載してください
`;
  }

  /**
   * ゲーム状態のサマリーを構築
   */
  private buildStateSummary(
    gameState: GameState,
    currentPlayer: { id: string }
  ): string {
    const phase = gameState.phase;
    const turnNumber = gameState.turnNumber;
    const diceResult = gameState.diceResult;

    let summary = `- フェーズ: ${phase}\n`;
    summary += `- ターン番号: ${turnNumber}\n`;

    if (diceResult) {
      summary += `- 直前のサイコロ: ${diceResult.die1} + ${diceResult.die2} = ${diceResult.total}\n`;
    }

    summary += `\n### 各プレイヤーの状況:\n`;
    for (const p of gameState.players) {
      const isMe = p.id === currentPlayer.id;
      const marker = isMe ? "（あなた）" : "";
      summary += `- ${p.name}${marker} [${p.color}]: 勝利点=${p.visibleVictoryPoints}, `;
      summary += `開拓地残=${p.remainingPieces.settlements}, 都市残=${p.remainingPieces.cities}, 道残=${p.remainingPieces.roads}`;
      if (p.hasLongestRoad) summary += ", 最長交易路";
      if (p.hasLargestArmy) summary += ", 最大騎士力";
      summary += "\n";
    }

    // 建造物情報（簡略化）
    const buildings = gameState.intersections.filter((i) => i.building);
    const roads = gameState.edges.filter((e) => e.road);

    summary += `\n### ボード状況:\n`;
    summary += `- 建造物数: ${buildings.length}（開拓地・都市）\n`;
    summary += `- 道数: ${roads.length}\n`;

    // 盗賊の位置
    const robberHex = gameState.hexes.find((h) => h.hasRobber);
    if (robberHex) {
      summary += `- 盗賊: ${robberHex.resourceType}タイル（数字${robberHex.numberToken || "なし"}）\n`;
    }

    return summary;
  }

  /**
   * API を呼び出し
   */
  private async callAPI(prompt: string): Promise<string> {
    if (this.config.provider === "gemini") {
      return this.callGeminiAPI(prompt);
    } else {
      return this.callDeepSeekAPI(prompt);
    }
  }

  /**
   * Gemini API を呼び出し
   */
  private async callGeminiAPI(prompt: string): Promise<string> {
    const url = `${API_ENDPOINTS.gemini}/${this.config.model}:generateContent?key=${this.config.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("No response from Gemini API");
    }

    return text;
  }

  /**
   * DeepSeek API を呼び出し
   */
  private async callDeepSeekAPI(prompt: string): Promise<string> {
    const url = API_ENDPOINTS.deepseek;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: "system",
            content:
              "あなたはカタンをプレイするAIです。JSONで回答してください。",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: { content?: string };
      }>;
    };
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error("No response from DeepSeek API");
    }

    return text;
  }

  /**
   * APIレスポンスをパースしてGameActionを取得
   */
  private parseResponse(
    response: string,
    roomId: string,
    availableActions: AvailableAction[]
  ): GameAction | null {
    try {
      // JSON部分を抽出（```json ... ``` や前後のテキストを除去）
      let jsonStr = response;

      // Markdownコードブロックを除去
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      } else {
        // { } で囲まれた部分を抽出
        const braceMatch = response.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          jsonStr = braceMatch[0];
        }
      }

      const parsed = JSON.parse(jsonStr);
      const actionData = parsed.action || parsed;

      // roomIdを追加
      const action = {
        ...actionData,
        roomId,
      } as GameAction;

      // アクションが有効かチェック
      const isValid = availableActions.some((a) => a.type === action.type);
      if (!isValid) {
        console.warn(
          `[AIClient] Invalid action type: ${action.type}. Available: ${availableActions.map((a) => a.type).join(", ")}`
        );
        // フォールバック: 最初の利用可能なアクションを選択
        return this.createFallbackAction(roomId, availableActions);
      }

      console.log(
        `[AIClient] AI decided: ${action.type}`,
        parsed.reasoning || ""
      );
      return action;
    } catch (error) {
      console.error("[AIClient] Failed to parse AI response:", error);
      console.error("[AIClient] Response was:", response);
      return this.createFallbackAction(roomId, availableActions);
    }
  }

  /**
   * フォールバックアクションを作成
   */
  private createFallbackAction(
    roomId: string,
    availableActions: AvailableAction[]
  ): GameAction | null {
    if (availableActions.length === 0) {
      return null;
    }

    // 優先順位: end_turn > roll_dice > その他
    const priorities = ["roll_dice", "end_turn"];
    for (const priority of priorities) {
      const action = availableActions.find((a) => a.type === priority);
      if (action) {
        console.log(`[AIClient] Fallback action: ${priority}`);
        return { type: priority, roomId } as GameAction;
      }
    }

    // 最初のアクションを選択
    const firstAction = availableActions[0];
    console.log(`[AIClient] Fallback to first action: ${firstAction.type}`);

    const baseAction = { type: firstAction.type, roomId };

    // パラメータがある場合は追加
    if (firstAction.params) {
      return { ...baseAction, ...firstAction.params } as GameAction;
    }

    return baseAction as GameAction;
  }
}

/**
 * AIクライアントのシングルトンインスタンスを作成
 */
let aiClientInstance: AIClient | null = null;

export function getAIClient(): AIClient | null {
  if (aiClientInstance) {
    return aiClientInstance;
  }

  // 環境変数から設定を読み込み
  const provider = (process.env.AI_PROVIDER as AIProvider) || "gemini";
  const apiKey =
    provider === "gemini"
      ? process.env.GEMINI_API_KEY
      : process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    console.warn(
      `[AIClient] No API key found for ${provider}. AI CPU players will not be available.`
    );
    return null;
  }

  aiClientInstance = new AIClient({
    provider,
    apiKey,
    model: process.env.AI_MODEL,
    thinkingDelay: parseInt(process.env.AI_THINKING_DELAY || "1500", 10),
  });

  console.log(`[AIClient] Initialized with ${provider} provider`);
  return aiClientInstance;
}

/**
 * AIクライアントが利用可能かどうか
 */
export function isAIAvailable(): boolean {
  return getAIClient() !== null;
}
