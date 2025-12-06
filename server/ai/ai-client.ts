/**
 * AI クライアント
 * Gemini / DeepSeek / OpenRouter API を使用してゲームアクションを決定
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
  openrouter: "google/gemini-flash-1.5:free",
};

// API エンドポイント
const API_ENDPOINTS: Record<AIProvider, string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/models",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
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
  ): Promise<{ action: GameAction | null; thinking: string | null }> {
    const prompt = this.buildPrompt(gameState, playerId, availableActions);

    // レート制限を考慮して最大2回に削減
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[AIClient] Attempt ${attempt}/3 for player ${playerId}`);
        const response = await this.callAPI(prompt);
        const result = this.parseResponse(response, gameState.id, availableActions);

        if (result.action) {
          // 人間らしさのための遅延
          if (this.config.thinkingDelay && this.config.thinkingDelay > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, this.config.thinkingDelay)
            );
          }

          return result;
        } else {
          console.warn(`[AIClient] Attempt ${attempt} failed: no valid action`);
        }
      } catch (error) {
        console.error(`[AIClient] Attempt ${attempt} error:`, error);
        if (attempt === 3) {
          console.error("[AIClient] All attempts failed, using fallback");
          return { 
            action: this.createFallbackAction(gameState.id, availableActions), 
            thinking: "申し訳ないです...システムエラーです" 
          };
        }
        // 短い待機後にリトライ
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return { action: null, thinking: null };
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

    // フェーズ別のプロンプト生成
    const phase = gameState.phase;
    const isRoadPhase = phase.includes('road');
    const isSettlementPhase = phase.includes('settlement');
    const isDiscardPhase = phase === 'discard';
    const isRobberPhase = phase === 'robber_move' || phase === 'robber_steal';
    
    // 座標系アクション
    const intersections = availableActions.filter(a => a.params?.intersectionId).map(a => a.params.intersectionId);
    const edges = availableActions.filter(a => a.params?.edgeId).map(a => a.params.edgeId);
    
    // discard actions
    const discardActions = availableActions.filter(a => a.type === 'discard_resources');
    
    // 基本プロンプト
    let prompt = `カタンAI: ${player.name}[${player.color}]
フェーズ: ${phase}

`;

    if (isDiscardPhase && discardActions.length > 0) {
      // Discard フェーズ - 現在の手札情報を含める
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerId);
      const firstDiscard = discardActions[0];
      const totalToDiscard = firstDiscard.description?.match(/(\d+)枚破棄/)?.[1] || '?';
      
      prompt += `🚮 資源破棄フェーズ - ${totalToDiscard}枚破棄が必要

📋 現在の手札:
${Object.entries(currentPlayer?.resources || {}).map(([resource, count]) => {
  const resourceName = resource === 'wood' ? '木材' : resource === 'brick' ? '煉瓦' : resource === 'wheat' ? '小麦' : resource === 'ore' ? '鉱石' : resource === 'sheep' ? '羊毛' : resource;
  return `${resourceName}: ${count}枚`;
}).join(', ')}

利用可能なdiscardオプション:
${discardActions.map((a, i) => `${i + 1}. ${JSON.stringify(a.params?.resources)} (${a.description})`).join('\n')}

🚨 重要: 上記のオプションから選択せよ！手札にない資源は破棄不可！

回答例: {"action": {"type": "discard_resources", "params": {"resources": ${JSON.stringify(firstDiscard.params?.resources || {})}}}, "reasoning": "理由", "thinking": "つぶやき"}

🚨 必須: 上記のresources形式をそのままコピー&ペースト`;
      
    } else if (isRobberPhase) {
      // 盗賊移動/奪取フェーズ
      const moveActions = availableActions.filter(a => a.type === 'move_robber');
      const stealActions = availableActions.filter(a => a.type === 'steal_resource');
      
      if (moveActions.length > 0) {
        prompt += `🦹 盗賊移動フェーズ - 盗賊を移動
利用可能な移動先:
${moveActions.map((a, i) => `${i + 1}. hexId: "${a.params?.hexId}" - ${a.description}`).join('\n')}

回答例: {"action": {"type": "move_robber", "params": {"hexId": "${moveActions[0].params?.hexId || '0,0,0'}"}}, "reasoning": "理由", "thinking": "つぶやき"}

🚨 必須: 上記のhexIdをそのままコピー&ペースト`;
      } else if (stealActions.length > 0) {
        prompt += `🦹 盗賊奪取フェーズ - プレイヤーから資源を奪う
奪取可能なプレイヤー:
${stealActions.map((a, i) => `${i + 1}. ${a.description}`).join('\n')}

回答例: {"action": {"type": "steal_resource", "params": {"targetPlayerId": "${stealActions[0].params?.targetPlayerId || ''}"}}, "reasoning": "理由", "thinking": "つぶやき"}

🚨 必須: targetPlayerIdをそのまま使用`;
      }
      
    } else if (isRoadPhase || isSettlementPhase) {
      // 建設フェーズ - 詳細なボード情報を含める
      prompt += `${isRoadPhase ? '🛣️ 道路建設フェーズ - build_road を使用' : ''}
${isSettlementPhase ? '🏠 開拓地建設フェーズ - build_settlement を使用' : ''}

${this.buildDetailedBoardInfo(gameState)}

選択可能座標と資源情報:`;

      if (isSettlementPhase && intersections.length > 0) {
        prompt += `\n🏠 開拓地候補:\n`;
        intersections.forEach((intId, i) => {
          const resourceInfo = this.getIntersectionResourceInfo(gameState, intId);
          prompt += `${i + 1}. ${resourceInfo}\n`;
        });
        prompt += `\n回答: {"action": {"type": "build_settlement", "params": {"intersectionId": "${intersections[0]}"}}, "reasoning": "理由", "thinking": "つぶやき"}`;
      }

      if (isRoadPhase && edges.length > 0) {
        // Setup road フェーズの特別な制約を説明
        if (phase.includes('setup_road')) {
          const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerId);
          const setupInfo = this.getSetupRoadInfo(gameState, currentPlayer?.id || '');
          prompt += `\n🛣️ 初期道路配置 - 重要な制約:\n${setupInfo}\n`;
          prompt += `利用可能な道路（上記の開拓地に隣接するもののみ）:\n`;
          edges.forEach((edgeId, i) => {
            prompt += `${i + 1}. ${edgeId}\n`;
          });
          prompt += `\n🚨🚨🚨 絶対厳守 🚨🚨🚨:
⛔ 資源戦略は一切考えるな！木材や煉瓦は関係ない！
⛔ "木材タイル", "煉瓦タイル" などの言及禁止！
✅ 上記リストの1番目を選択せよ！
✅ 理由: "初期道路配置の制約により、対象開拓地に隣接する道路から選択"

上記の道路は既に検証済み。戦略不要。1番目を選択。`;
        } else {
          prompt += `\n🛣️ 道路候補:\n${edges.map((edgeId, i) => `${i + 1}. ${edgeId}`).join('\n')}`;
        }
        prompt += `\n\n回答: {"action": {"type": "build_road", "params": {"edgeId": "${edges[0]}"}}, "reasoning": "理由", "thinking": "つぶやき"}`;
      }

      prompt += `\n\n🚨 必須:
${isRoadPhase ? '- エッジ座標をedgeIdに使用' : ''}
${isSettlementPhase ? '- 交差点座標をintersectionIdに使用' : ''}
- 上記座標をそのままコピー&ペースト
- 資源価値と確率を考慮して戦略的に選択`;
    } else {
      // その他のフェーズ（メインフェーズなど）
      const tradeActions = availableActions.filter(a => a.type === 'propose_trade');
      const buildActions = availableActions.filter(a => a.type.includes('build'));
      const otherActions = availableActions.filter(a => !a.type.includes('build') && a.type !== 'propose_trade');
      
      prompt += `利用可能アクション:\n`;
      
      // 建設アクション
      if (buildActions.length > 0) {
        prompt += `\n🏗️ 建設:\n`;
        buildActions.forEach((action, i) => {
          prompt += `${i + 1}. ${action.type}`;
          if (action.params?.intersectionId) {
            prompt += ` - 交差点: ${action.params.intersectionId}`;
          } else if (action.params?.edgeId) {
            prompt += ` - エッジ: ${action.params.edgeId}`;
          }
          if (action.description) {
            prompt += ` (${action.description})`;
          }
          prompt += `\n`;
        });
      }
      
      // 交換アクション
      if (tradeActions.length > 0) {
        prompt += `\n💰 プレイヤー間交換:\n`;
        tradeActions.forEach((action, i) => {
          prompt += `${buildActions.length + i + 1}. ${action.description}\n`;
        });
        prompt += `\n🎯 交換戦略:\n- 余剰資源を有効活用\n- 不足している資源を優先取得\n- 建設に必要な資源を確保\n`;
      }
      
      // その他のアクション
      if (otherActions.length > 0) {
        prompt += `\n⚡ その他:\n`;
        otherActions.forEach((action, i) => {
          prompt += `${buildActions.length + tradeActions.length + i + 1}. ${action.type}`;
          if (action.description) {
            prompt += ` (${action.description})`;
          }
          prompt += `\n`;
        });
      }

      // サンプル回答を動的に生成
      const firstAction = availableActions[0];
      let sampleParams = '';
      if (firstAction) {
        if (firstAction.params?.intersectionId) {
          sampleParams = `, "params": {"intersectionId": "${firstAction.params.intersectionId}"}`;
        } else if (firstAction.params?.edgeId) {
          sampleParams = `, "params": {"edgeId": "${firstAction.params.edgeId}"}`;
        } else if (firstAction.params?.hexId) {
          sampleParams = `, "params": {"hexId": "${firstAction.params.hexId}"}`;
        } else if (firstAction.params) {
          sampleParams = `, "params": ${JSON.stringify(firstAction.params)}`;
        }
      }

      prompt += `\n回答例: {"action": {"type": "${firstAction?.type || 'end_turn'}"${sampleParams}}, "reasoning": "理由", "thinking": "つぶやき"}

🚨 必須: 
- 上記アクションから選択
- パラメータ名を正確に使用（intersectionId, edgeId, hexId等）
- JSONフォーマットで回答`;
    }
    
    return prompt;
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

    let summary = `フェーズ: ${phase}, ターン: ${turnNumber}`;

    if (diceResult) {
      summary += `, 直前サイコロ: ${diceResult.total}`;
    }

    summary += `\nプレイヤー: `;
    for (const p of gameState.players) {
      const marker = p.id === currentPlayer.id ? "*" : "";
      summary += `${p.name}${marker}[${p.color}]VP:${p.visibleVictoryPoints} `;
      if (p.hasLongestRoad) summary += "📏";
      if (p.hasLargestArmy) summary += "⚔️";
    }

    return summary;
  }

  /**
   * 詳細なボード情報を構築（交差点-タイル関係を含む）
   */
  private buildDetailedBoardInfo(gameState: GameState): string {
    let boardInfo = `\n📋 ボード詳細情報:\n`;
    
    // 各タイルの情報
    boardInfo += `🎲 タイル一覧:\n`;
    gameState.hexes.forEach(hex => {
      const resource = hex.resourceType === 'desert' ? '砂漠' : 
                      hex.resourceType === 'wood' ? '木材' :
                      hex.resourceType === 'brick' ? '煉瓦' :
                      hex.resourceType === 'wheat' ? '小麦' :
                      hex.resourceType === 'ore' ? '鉱石' :
                      hex.resourceType === 'sheep' ? '羊毛' : hex.resourceType;
      const number = hex.numberToken ? `[${hex.numberToken}]` : '[なし]';
      const robber = hex.hasRobber ? '🦹' : '';
      const coord = `(${hex.coordinate.q},${hex.coordinate.r},${hex.coordinate.s})`;
      boardInfo += `  ${coord}: ${resource}${number}${robber}\n`;
    });

    return boardInfo;
  }

  /**
   * 交差点の資源情報を取得
   */
  private getIntersectionResourceInfo(gameState: GameState, intersectionId: string): string {
    const intersection = gameState.intersections.find(i => i.id === intersectionId);
    if (!intersection) return "交差点が見つかりません";

    // この交差点に隣接するタイルを取得
    const adjacentHexes = this.getAdjacentHexesForIntersection(gameState, intersectionId);
    
    if (adjacentHexes.length === 0) {
      return `${intersectionId}: 隣接タイルなし`;
    }

    const resourceInfo = adjacentHexes.map(hex => {
      const resource = hex.resourceType === 'desert' ? '砂漠' : 
                      hex.resourceType === 'wood' ? '木材' :
                      hex.resourceType === 'brick' ? '煉瓦' :
                      hex.resourceType === 'wheat' ? '小麦' :
                      hex.resourceType === 'ore' ? '鉱石' :
                      hex.resourceType === 'sheep' ? '羊毛' : hex.resourceType;
      const number = hex.numberToken || 0;
      return `${resource}${number}`;
    });

    // 資源価値を計算（6と8は確率が高い）
    const totalValue = adjacentHexes.reduce((sum, hex) => {
      if (hex.resourceType === 'desert') return sum;
      const prob = hex.numberToken ? this.getDiceProbability(hex.numberToken) : 0;
      return sum + prob;
    }, 0);

    return `${intersectionId}: [${resourceInfo.join(', ')}] 価値=${totalValue.toFixed(1)}`;
  }

  /**
   * サイコロ確率を取得
   */
  private getDiceProbability(number: number): number {
    const probabilities: Record<number, number> = {
      2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1
    };
    return probabilities[number] || 0;
  }

  /**
   * 交差点に隣接するヘックスを取得（game-logic.tsのロジックを模倣）
   */
  private getAdjacentHexesForIntersection(gameState: GameState, intersectionId: string): any[] {
    const intersection = gameState.intersections.find(i => i.id === intersectionId);
    if (!intersection) return [];

    return gameState.hexes.filter(hex => {
      // 簡易的な隣接判定（実際のゲームロジックと同じ計算が必要）
      return this.isHexAdjacentToIntersection(hex.coordinate, intersection.coordinate);
    });
  }

  /**
   * ヘックスと交差点の隣接判定（ai-player.tsから移植）
   */
  private isHexAdjacentToIntersection(
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
   * Setup road フェーズの制約情報を取得
   */
  private getSetupRoadInfo(gameState: GameState, playerId: string): string {
    const playerSettlements = gameState.intersections.filter(
      (i) => i.building?.playerId === playerId && i.building.type === "settlement"
    );

    let targetSettlement;
    if (gameState.phase === "setup_road_1") {
      targetSettlement = playerSettlements[0];
      return `🏠 対象開拓地: ${targetSettlement?.id || 'なし'} (最初の開拓地)
📋 制約: 道路は上記の開拓地にのみ隣接可能`;
    } else if (gameState.phase === "setup_road_2") {
      // 道がない開拓地を探す
      targetSettlement = playerSettlements.find((settlement) => {
        const adjacentRoads = this.getAdjacentRoadsForIntersection(gameState, settlement.id, playerId);
        return adjacentRoads.length === 0;
      });
      return `🏠 対象開拓地: ${targetSettlement?.id || 'なし'} (2番目の開拓地、道路未接続)
📋 制約: 道路は上記の開拓地にのみ隣接可能`;
    }
    
    return "Setup road情報が見つかりません";
  }

  /**
   * 交差点に隣接する自分の道路を取得
   */
  private getAdjacentRoadsForIntersection(gameState: GameState, intersectionId: string, playerId: string): any[] {
    // 簡易実装 - 実際にはもっと複雑な隣接計算が必要
    return gameState.edges.filter(edge => {
      return edge.road?.playerId === playerId && this.isEdgeAdjacentToIntersection(edge, intersectionId);
    });
  }

  /**
   * エッジが交差点に隣接しているかの簡易判定
   */
  private isEdgeAdjacentToIntersection(edge: any, intersectionId: string): boolean {
    // 簡易実装 - 実際の隣接判定ロジックが必要
    // ここでは座標文字列の部分一致で判定
    const edgeCoordStr = edge.id;
    const intCoordStr = intersectionId;
    
    // 座標の基本部分を抽出して比較
    const edgeBase = edgeCoordStr.split('_')[0];
    const intBase = intCoordStr.split('_')[0];
    
    return edgeBase === intBase || Math.abs(edgeBase.length - intBase.length) <= 2;
  }

  /**
   * API を呼び出し
   */
  private async callAPI(prompt: string): Promise<string> {
    if (this.config.provider === "gemini") {
      return this.callGeminiAPI(prompt);
    } else if (this.config.provider === "openrouter") {
      return this.callOpenRouterAPI(prompt);
    } else {
      return this.callDeepSeekAPI(prompt);
    }
  }

  /**
   * Gemini API を呼び出し
   */
  private async callGeminiAPI(prompt: string): Promise<string> {
    const url = `${API_ENDPOINTS.gemini}/${this.config.model}:generateContent?key=${this.config.apiKey}`;

    console.log(`[AIClient] Calling Gemini API: ${this.config.model}`);
    console.log(`[AIClient] Request URL: ${url.replace(this.config.apiKey!, '[REDACTED]')}`);

    const requestBody = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    };

    console.log('[AIClient] Request body size:', JSON.stringify(requestBody).length, 'bytes');
    console.log('[AIClient] Prompt preview:', requestBody.contents[0].parts[0].text.substring(0, 800) + '...');

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`[AIClient] Response status: ${response.status} ${response.statusText}`);
    console.log('[AIClient] Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AIClient] Error response body:', errorText);
      
      // レート制限の場合は特別な処理
      if (response.status === 429) {
        try {
          const errorData = JSON.parse(errorText);
          const retryDelay = errorData.error?.details?.find((d: any) => d['@type']?.includes('RetryInfo'))?.retryDelay;
          if (retryDelay) {
            const seconds = parseInt(retryDelay.replace('s', '')) || 60;
            console.warn(`[AIClient] Rate limited. Waiting ${seconds} seconds...`);
            await new Promise(resolve => setTimeout(resolve, seconds * 1000));
            // リトライではなくフォールバックを使用
            throw new Error(`Rate limited, using fallback`);
          }
        } catch (parseError) {
          // JSONパースエラーは無視
        }
      }
      
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const responseText = await response.text();
    console.log('[AIClient] Raw response length:', responseText.length, 'bytes');
    console.log('[AIClient] Raw response preview:', responseText.substring(0, 500) + '...');

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[AIClient] Failed to parse response JSON:', parseError);
      console.error('[AIClient] Raw response:', responseText);
      throw new Error(`Failed to parse Gemini API response: ${parseError}`);
    }
    
    console.log('[AIClient] Parsed response structure:', {
      hasError: !!data.error,
      candidatesCount: data.candidates?.length || 0,
      firstCandidateFinishReason: data.candidates?.[0]?.finishReason,
      firstCandidateHasContent: !!data.candidates?.[0]?.content,
      firstCandidatePartsCount: data.candidates?.[0]?.content?.parts?.length || 0
    });

    if (data.error) {
      console.error('[AIClient] API returned error:', data.error);
      throw new Error(`Gemini API error: ${data.error.message || 'Unknown error'}`);
    }
    
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (!text || text.trim() === '') {
      console.warn('[AIClient] Empty or missing text response');
      console.warn('[AIClient] Candidate finish reason:', candidate?.finishReason);
      console.warn('[AIClient] Full response:', JSON.stringify(data, null, 2));
      throw new Error("No response from Gemini API");
    }

    console.log('[AIClient] Successfully extracted text, length:', text.length);
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
   * OpenRouter API を呼び出し
   * OpenAI互換のAPIフォーマットを使用
   */
  private async callOpenRouterAPI(prompt: string): Promise<string> {
    const url = API_ENDPOINTS.openrouter;

    console.log(`[AIClient] Calling OpenRouter API: ${this.config.model}`);
    console.log(`[AIClient] Request URL: ${url}`);

    const requestBody = {
      model: this.config.model,
      messages: [
        {
          role: "system",
          content: "あなたはカタンをプレイするAIです。JSONで回答してください。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    };

    console.log('[AIClient] Request body size:', JSON.stringify(requestBody).length, 'bytes');

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        "HTTP-Referer": "https://github.com/omatztw/cc-catado",
        "X-Title": "Catan AI Player",
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`[AIClient] Response status: ${response.status} ${response.statusText}`);
    console.log('[AIClient] Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AIClient] Error response body:', errorText);
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const responseText = await response.text();
    console.log('[AIClient] Raw response length:', responseText.length, 'bytes');
    console.log('[AIClient] Raw response preview:', responseText.substring(0, 500) + '...');

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[AIClient] Failed to parse response JSON:', parseError);
      console.error('[AIClient] Raw response:', responseText);
      throw new Error(`Failed to parse OpenRouter API response: ${parseError}`);
    }
    
    console.log('[AIClient] Parsed response structure:', {
      hasError: !!data.error,
      choicesCount: data.choices?.length || 0,
      firstChoiceHasMessage: !!data.choices?.[0]?.message,
      firstChoiceContent: data.choices?.[0]?.message?.content ? 'exists' : 'missing'
    });

    if (data.error) {
      console.error('[AIClient] API returned error:', data.error);
      throw new Error(`OpenRouter API error: ${data.error.message || 'Unknown error'}`);
    }
    
    const text = data.choices?.[0]?.message?.content;

    if (!text || text.trim() === '') {
      console.warn('[AIClient] Empty or missing text response');
      console.warn('[AIClient] Full response:', JSON.stringify(data, null, 2));
      throw new Error("No response from OpenRouter API");
    }

    console.log('[AIClient] Successfully extracted text, length:', text.length);
    return text;
  }

  /**
   * APIレスポンスをパースしてGameActionとthinkingを取得
   */
  private parseResponse(
    response: string,
    roomId: string,
    availableActions: AvailableAction[]
  ): { action: GameAction | null; thinking: string | null } {
    try {
      // JSON部分を抽出（```json ... ``` や前後のテキストを除去）
      let jsonStr = response.trim();

      // Markdownコードブロックを除去
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      } else {
        // { } で囲まれた部分を抽出
        const braceMatch = response.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          jsonStr = braceMatch[0];
        }
      }

      // 不完全なJSONを修復を試行
      jsonStr = this.repairIncompleteJson(jsonStr);

      const parsed = JSON.parse(jsonStr);
      const actionData = parsed.action || parsed;
      const thinking = parsed.thinking || null;

      console.log('[AIClient] Parsed JSON:', JSON.stringify(parsed, null, 2));
      console.log('[AIClient] Action data:', JSON.stringify(actionData, null, 2));

      if (!actionData || !actionData.type) {
        console.warn('[AIClient] No action type found in response');
        return { action: this.createFallbackAction(roomId, availableActions), thinking };
      }

      // パラメータを正しくマージ
      let transformedParams = actionData.params || {};
      
      // propose_tradeアクションの場合、パラメータ形式を変換
      if (actionData.type === "propose_trade" && actionData.params) {
        const { offer, request, targetPlayerId } = actionData.params;
        if (offer && request) {
          transformedParams = {
            targetPlayerId,
            offering: { [offer.resource]: offer.amount },
            requesting: { [request.resource]: request.amount }
          };
        }
      }
      
      // accept_trade/reject_tradeアクションをrespond_to_tradeに変換
      if (actionData.type === "accept_trade" || actionData.type === "reject_trade") {
        transformedParams = {
          tradeId: "current", // 現在のアクティブな交換提案
          response: actionData.type === "accept_trade" ? "accept" : "reject"
        };
        actionData.type = "respond_to_trade";
      }
      
      const action: GameAction = {
        type: actionData.type,
        roomId,
        ...transformedParams,
      };

      // 型チェックのみ実行（座標検証は無効化）
      const isValidType = availableActions.some((a) => a.type === action.type);
      
      if (!isValidType) {
        console.warn(`[AIClient] Invalid action type: ${action.type}`);
        return { action: null, thinking: "アクション種類が無効でした..." };
      }
      
      // 座標検証をスキップして、AIの選択をそのまま使用
      console.log(`[AIClient] Using AI selected coordinates without validation`);
      console.log(`[AIClient] Action: ${JSON.stringify(action)}`);
      

      console.log(
        `[AIClient] AI decided: ${action.type}`,
        parsed.reasoning || "",
        `(thinking: ${thinking || "none"})`
      );
      return { action, thinking };
    } catch (error) {
      console.error("[AIClient] Failed to parse AI response:", error);
      console.error("[AIClient] Response was:", response);
      return { action: this.createFallbackAction(roomId, availableActions), thinking: null };
    }
  }

  /**
   * 不完全なJSONを修復
   */
  private repairIncompleteJson(jsonStr: string): string {
    // 末尾の不完全な部分を修復
    if (!jsonStr.endsWith('}')) {
      // 最後のコンマまたはクオートを見つけて適切に終了
      const lines = jsonStr.split('\n');
      let repairedLines: string[] = [];
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine === '' || trimmedLine.startsWith('"') || trimmedLine === '{' || trimmedLine === '}') {
          repairedLines.push(line);
        } else {
          // 不完全な行は除外
          break;
        }
      }
      
      // 最後の行がコンマで終わっている場合は削除
      if (repairedLines.length > 0) {
        const lastLine = repairedLines[repairedLines.length - 1];
        if (lastLine.trim().endsWith(',')) {
          repairedLines[repairedLines.length - 1] = lastLine.replace(/,$/, '');
        }
      }
      
      // 閉じ括弧を追加
      if (!repairedLines.some(line => line.includes('}'))) {
        repairedLines.push('}');
      }
      
      return repairedLines.join('\n');
    }
    
    return jsonStr;
  }

  /**
   * フォールバックアクションを作成
   */
  private createFallbackAction(
    roomId: string,
    availableActions: AvailableAction[]
  ): GameAction | null {
    if (availableActions.length === 0) {
      console.log(`[AIClient] No available actions for fallback`);
      return null;
    }

    console.log(`[AIClient] Creating fallback action from ${availableActions.length} available actions`);

    // 優先順位: 単純なアクション > 建設系アクション
    const priorities = ["roll_dice", "end_turn", "pass"];
    for (const priority of priorities) {
      const action = availableActions.find((a) => a.type === priority);
      if (action) {
        console.log(`[AIClient] Fallback to safe action: ${priority}`);
        return { type: priority, roomId } as GameAction;
      }
    }

    // 建設系アクションの場合、より安全な選択を行う
    const buildActions = availableActions.filter(a => a.type.includes('build'));
    
    if (buildActions.length === 0) {
      // 建設系以外のアクション
      const chosenAction = availableActions[0];
      console.log(`[AIClient] Fallback to first available action: ${chosenAction.type}`);
      return this.createActionFromAvailable(chosenAction, roomId);
    }

    // 建設系アクションの場合、ランダムに選択（中間だけでなく）
    const randomIndex = Math.floor(Math.random() * buildActions.length);
    const chosenAction = buildActions[randomIndex];
    
    console.log(`[AIClient] Fallback to random build action: ${chosenAction.type} (${randomIndex + 1}/${buildActions.length})`);
    console.log(`[AIClient] Available action details:`, JSON.stringify(chosenAction, null, 2));

    return this.createActionFromAvailable(chosenAction, roomId);
  }

  /**
   * AvailableActionからGameActionを作成
   */
  private createActionFromAvailable(availableAction: AvailableAction, roomId: string): GameAction {
    const baseAction: GameAction = { 
      type: availableAction.type as any, 
      roomId 
    };

    // パラメータがある場合は追加
    if (availableAction.params) {
      console.log(`[AIClient] Adding params:`, availableAction.params);
      Object.assign(baseAction, availableAction.params);
    }

    console.log(`[AIClient] Final fallback action:`, JSON.stringify(baseAction, null, 2));
    return baseAction;
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
  let apiKey: string | undefined;
  switch (provider) {
    case "gemini":
      apiKey = process.env.GEMINI_API_KEY;
      break;
    case "deepseek":
      apiKey = process.env.DEEPSEEK_API_KEY;
      break;
    case "openrouter":
      apiKey = process.env.OPENROUTER_API_KEY;
      break;
  }

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
