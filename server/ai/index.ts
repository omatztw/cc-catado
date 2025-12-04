/**
 * AI モジュール
 * CPUプレイヤーの作成・管理・ターン実行
 */

export { AIClient, getAIClient, isAIAvailable } from "./ai-client";
export {
  createCPUPlayer,
  isAIPlayer,
  getAvailableActionsForAI,
  executeAITurn,
} from "./ai-player";
