"use client";

/**
 * GameLog - ゲームログを表示するコンポーネント
 */

import React, { useEffect, useRef } from "react";
import type {
  GameLogEntry,
  GameLogType,
  HoldableResource,
  PlayerColor,
  PlayerResources,
} from "@/types/game";

// ============================================
// 定数
// ============================================

const RESOURCE_LABELS: Record<HoldableResource, string> = {
  wood: "木材",
  brick: "レンガ",
  wheat: "小麦",
  ore: "鉱石",
  sheep: "羊毛",
};

const RESOURCE_ICONS: Record<HoldableResource, string> = {
  wood: "🌲",
  brick: "🧱",
  wheat: "🌾",
  ore: "⛏️",
  sheep: "🐑",
};

const PLAYER_COLOR_STYLES: Record<PlayerColor, string> = {
  red: "#dc2626",
  blue: "#2563eb",
  orange: "#ea580c",
  white: "#6b7280",
};

// ============================================
// ヘルパー関数
// ============================================

/**
 * 資源一覧を表示用文字列に変換
 */
function formatResources(resources: Partial<PlayerResources>): string {
  const parts: string[] = [];
  for (const [resource, amount] of Object.entries(resources)) {
    if (amount && amount > 0) {
      const icon = RESOURCE_ICONS[resource as HoldableResource];
      const label = RESOURCE_LABELS[resource as HoldableResource];
      parts.push(`${icon}${label}×${amount}`);
    }
  }
  return parts.join(", ");
}

/**
 * ログエントリをメッセージに変換
 */
function formatLogMessage(log: GameLogEntry): string {
  switch (log.type) {
    case "game_start":
      return "ゲームが開始されました";
    case "turn_start":
      return `${log.playerName}のターン開始`;
    case "dice_roll":
      return `🎲 ${log.data?.die1} + ${log.data?.die2} = ${log.data?.total}`;
    case "resource_gain":
      if (log.data?.resources) {
        return `${formatResources(log.data.resources)} を獲得`;
      }
      return "資源を獲得";
    case "build_settlement":
      return "🏠 開拓地を建設";
    case "build_city":
      return "🏰 都市を建設";
    case "build_road":
      return "🛤️ 道を建設";
    case "buy_development_card":
      return "📜 発展カードを購入";
    case "use_knight":
      return "⚔️ 騎士カードを使用";
    case "use_road_building":
      return "🛤️ 街道建設カードを使用";
    case "use_year_of_plenty":
      if (log.data?.resources) {
        return `🌽 収穫: ${formatResources(log.data.resources)}`;
      }
      return "🌽 収穫カードを使用";
    case "use_monopoly":
      if (log.data?.resource) {
        const icon = RESOURCE_ICONS[log.data.resource];
        const label = RESOURCE_LABELS[log.data.resource];
        const amount = log.data.amount || 0;
        return `💰 独占(${icon}${label}): ${amount}枚獲得`;
      }
      return "💰 独占カードを使用";
    case "move_robber":
      return "🦹 盗賊を移動";
    case "steal_resource":
      if (log.data?.targetPlayerName) {
        return `${log.data.targetPlayerName}から資源を奪った`;
      }
      return "資源を奪った";
    case "discard_resources":
      if (log.data?.resources) {
        return `${formatResources(log.data.resources)} を破棄`;
      }
      return "資源を破棄";
    case "trade_with_bank":
      if (log.data?.give && log.data?.receive) {
        const giveIcon = RESOURCE_ICONS[log.data.give.resource];
        const giveLabel = RESOURCE_LABELS[log.data.give.resource];
        const receiveIcon = RESOURCE_ICONS[log.data.receive];
        const receiveLabel = RESOURCE_LABELS[log.data.receive];
        return `🏦 ${giveIcon}${giveLabel}×${log.data.give.amount} → ${receiveIcon}${receiveLabel}`;
      }
      return "🏦 銀行と交易";
    case "player_trade":
      if (log.data?.tradePartnerName && log.data?.offering && log.data?.requesting) {
        return `🤝 ${log.data.tradePartnerName}と交易: ${formatResources(log.data.offering)} ⇄ ${formatResources(log.data.requesting)}`;
      }
      return "🤝 プレイヤーと交易";
    case "longest_road":
      return "🏆 最長交易路を獲得";
    case "largest_army":
      return "🏆 最大騎士力を獲得";
    case "game_end":
      if (log.data?.winnerName) {
        return `🎉 ${log.data.winnerName}の勝利！`;
      }
      return "🎉 ゲーム終了";
    default:
      return log.type;
  }
}

// ============================================
// メインコンポーネント
// ============================================

interface GameLogProps {
  logs: GameLogEntry[];
  maxHeight?: string;
}

export function GameLog({ logs, maxHeight = "200px" }: GameLogProps) {
  const logEndRef = useRef<HTMLDivElement>(null);

  // 新しいログが追加されたらスクロール
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  if (logs.length === 0) {
    return (
      <div
        style={{
          padding: "12px",
          color: "#9ca3af",
          fontSize: "14px",
          textAlign: "center",
        }}
      >
        ログはまだありません
      </div>
    );
  }

  return (
    <div
      style={{
        maxHeight,
        overflowY: "auto",
        fontSize: "13px",
        lineHeight: "1.6",
      }}
    >
      {logs.map((log) => (
        <div
          key={log.id}
          style={{
            padding: "4px 8px",
            borderBottom: "1px solid #374151",
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
          }}
        >
          {/* プレイヤー名 */}
          <span
            style={{
              color: PLAYER_COLOR_STYLES[log.playerColor],
              fontWeight: "bold",
              flexShrink: 0,
              minWidth: "60px",
            }}
          >
            {log.playerName}
          </span>
          {/* ログメッセージ */}
          <span style={{ color: "#e5e7eb" }}>
            {formatLogMessage(log)}
          </span>
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  );
}

export default GameLog;
