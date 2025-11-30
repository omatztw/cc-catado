"use client";

/**
 * GameRoom - ゲームルームのメインコンポーネント
 * ゲームボード、プレイヤーパネル、チャット、アクションボタンを統合
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useGameSocket, useCurrentPlayer, useIsMyTurn, SessionInfo } from "../hooks/useGameSocket";
import { useSound } from "../hooks/useSound";
import { useNotification } from "../hooks/useNotification";
import { useGameSettings } from "../hooks/useGameSettings";
import { GameBoard } from "./GameBoard";
import type {
  GameState,
  GamePhase,
  GameAction,
  Player,
  HoldableResource,
  ChatMessage,
  RoomInfo,
  DevelopmentCardType,
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

const DEV_CARD_LABELS: Record<DevelopmentCardType, string> = {
  knight: "騎士",
  victoryPoint: "勝利点",
  roadBuilding: "街道建設",
  yearOfPlenty: "収穫",
  monopoly: "独占",
};

const DEV_CARD_ICONS: Record<DevelopmentCardType, string> = {
  knight: "⚔️",
  victoryPoint: "⭐",
  roadBuilding: "🛤️",
  yearOfPlenty: "🌽",
  monopoly: "💰",
};

const PHASE_LABELS: Record<GamePhase, string> = {
  waiting: "プレイヤー待機中",
  setup_settlement_1: "初期配置（開拓地1）",
  setup_road_1: "初期配置（道1）",
  setup_settlement_2: "初期配置（開拓地2）",
  setup_road_2: "初期配置（道2）",
  roll_dice: "サイコロを振る",
  main: "メインフェーズ",
  robber_move: "盗賊を移動",
  robber_steal: "資源を奪う",
  discard: "資源を破棄",
  trade_offer: "交易提案中",
  game_over: "ゲーム終了",
};

// ============================================
// サブコンポーネント
// ============================================

/**
 * ルーム作成モーダル
 */
function CreateRoomModal({
  playerName,
  onClose,
  onCreate,
  isLoading,
}: {
  playerName: string;
  onClose: () => void;
  onCreate: (data: {
    playerName: string;
    roomName: string;
    isPublic: boolean;
    password?: string;
  }) => void;
  isLoading: boolean;
}) {
  const [roomName, setRoomName] = useState(`${playerName}のルーム`);
  const [isPublic, setIsPublic] = useState(true);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      playerName,
      roomName: roomName.trim(),
      isPublic,
      password: usePassword ? password : undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4">ルームを作成</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ルーム名
            </label>
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="ルーム名を入力"
              maxLength={30}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              公開設定
            </label>
            <div className="flex gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  checked={isPublic}
                  onChange={() => setIsPublic(true)}
                  className="mr-2"
                />
                <span className="text-sm">公開（一覧に表示）</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  checked={!isPublic}
                  onChange={() => setIsPublic(false)}
                  className="mr-2"
                />
                <span className="text-sm">非公開</span>
              </label>
            </div>
          </div>

          <div>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={usePassword}
                onChange={(e) => setUsePassword(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm font-medium text-gray-700">
                パスワードを設定
              </span>
            </label>
            {usePassword && (
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="パスワードを入力"
                required={usePassword}
              />
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isLoading || !roomName.trim()}
              className="flex-1 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
            >
              {isLoading ? "作成中..." : "作成"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * パスワード入力モーダル
 */
function PasswordModal({
  roomName,
  onClose,
  onSubmit,
  isLoading,
}: {
  roomName: string;
  onClose: () => void;
  onSubmit: (password: string) => void;
  isLoading: boolean;
}) {
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(password);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
        <h2 className="text-xl font-bold text-gray-800 mb-2">パスワード入力</h2>
        <p className="text-sm text-gray-600 mb-4">
          「{roomName}」に参加するにはパスワードが必要です
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="パスワードを入力"
            required
            autoFocus
          />

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isLoading || !password}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
            >
              {isLoading ? "参加中..." : "参加"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * 公開ルーム一覧
 */
function PublicRoomList({
  rooms,
  onJoin,
  isLoading,
}: {
  rooms: RoomInfo[];
  onJoin: (room: RoomInfo) => void;
  isLoading: boolean;
}) {
  if (rooms.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>公開ルームはまだありません</p>
        <p className="text-sm mt-1">新しいルームを作成してみましょう</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rooms.map((room) => (
        <div
          key={room.id}
          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-800">{room.name}</span>
              {room.hasPassword && (
                <span className="text-yellow-600" title="パスワード保護">
                  🔒
                </span>
              )}
              {room.status === "playing" && (
                <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded">
                  プレイ中
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              ホスト: {room.hostName} ・ {room.playerCount}/{room.maxPlayers}人
            </div>
          </div>
          <button
            onClick={() => onJoin(room)}
            disabled={isLoading || room.status === "finished"}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            {room.status === "playing" ? "観戦" : "参加"}
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * ロビー画面（ルーム参加前）
 */
function Lobby({
  publicRooms,
  onCreateRoom,
  onJoinRoom,
  onJoinPrivateRoom,
  onRejoinRoom,
  onRefreshRooms,
  savedSession,
  onClearSavedSession,
  error,
  isConnecting,
}: {
  publicRooms: RoomInfo[];
  onCreateRoom: (data: {
    playerName: string;
    roomName: string;
    isPublic: boolean;
    password?: string;
  }) => void;
  onJoinRoom: (roomId: string, playerName: string, password?: string) => void;
  onJoinPrivateRoom: (roomId: string, playerName: string, password?: string) => void;
  onRejoinRoom: (roomId: string, playerId: string) => void;
  onRefreshRooms: () => void;
  savedSession: SessionInfo | null;
  onClearSavedSession: () => void;
  error: string | null;
  isConnecting: boolean;
}) {
  const [playerName, setPlayerName] = useState("");
  const [privateRoomId, setPrivateRoomId] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState<{
    room: RoomInfo;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<"public" | "private">("public");

  // 初回ロード時にルーム一覧を取得
  useEffect(() => {
    onRefreshRooms();
  }, [onRefreshRooms]);

  const handleJoinPublicRoom = (room: RoomInfo) => {
    if (!playerName.trim()) {
      alert("プレイヤー名を入力してください");
      return;
    }

    if (room.hasPassword) {
      setPasswordModal({ room });
    } else {
      onJoinRoom(room.id, playerName.trim());
    }
  };

  const handlePasswordSubmit = (password: string) => {
    if (passwordModal) {
      onJoinRoom(passwordModal.room.id, playerName.trim(), password);
      setPasswordModal(null);
    }
  };

  const handleJoinPrivateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (playerName.trim() && privateRoomId.trim()) {
      onJoinPrivateRoom(privateRoomId.trim(), playerName.trim());
    }
  };

  const handleCreateRoom = (data: {
    playerName: string;
    roomName: string;
    isPublic: boolean;
    password?: string;
  }) => {
    onCreateRoom(data);
    setShowCreateModal(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 p-4">
      <div className="max-w-2xl mx-auto">
        {/* ヘッダー */}
        <div className="text-center mb-6 pt-8">
          <h1 className="text-4xl font-bold text-white mb-2">カタド</h1>
          <p className="text-blue-200">カタン風ボードゲーム</p>
        </div>

        {/* メインカード */}
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
          {/* プレイヤー名入力 */}
          <div className="p-6 border-b bg-gray-50">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              プレイヤー名
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="名前を入力してください"
              maxLength={20}
            />
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="bg-red-100 border-b border-red-400 text-red-700 px-6 py-3 text-sm">
              {error}
            </div>
          )}

          {/* 再接続バナー */}
          {savedSession && (
            <div className="bg-yellow-50 border-b border-yellow-300 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-yellow-800">
                    前回のゲームセッションが見つかりました
                  </p>
                  <p className="text-xs text-yellow-700 mt-1">
                    ルーム: {savedSession.roomId} / プレイヤー: {savedSession.playerName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onRejoinRoom(savedSession.roomId, savedSession.playerId)}
                    disabled={isConnecting}
                    className="px-4 py-2 bg-yellow-600 text-white text-sm rounded-lg font-medium hover:bg-yellow-700 disabled:bg-gray-400 transition"
                  >
                    {isConnecting ? "接続中..." : "再接続"}
                  </button>
                  <button
                    onClick={onClearSavedSession}
                    className="px-3 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* タブ */}
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab("public")}
              className={`flex-1 py-3 text-sm font-medium transition ${
                activeTab === "public"
                  ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              公開ルーム
            </button>
            <button
              onClick={() => setActiveTab("private")}
              className={`flex-1 py-3 text-sm font-medium transition ${
                activeTab === "private"
                  ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              ルームIDで参加
            </button>
          </div>

          {/* タブコンテンツ */}
          <div className="p-6">
            {activeTab === "public" ? (
              <>
                {/* アクションバー */}
                <div className="flex justify-between items-center mb-4">
                  <button
                    onClick={onRefreshRooms}
                    disabled={isConnecting}
                    className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                  >
                    ↻ 更新
                  </button>
                  <button
                    onClick={() => {
                      if (!playerName.trim()) {
                        alert("プレイヤー名を入力してください");
                        return;
                      }
                      setShowCreateModal(true);
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
                  >
                    + 新しいルームを作成
                  </button>
                </div>

                {/* ルーム一覧 */}
                <PublicRoomList
                  rooms={publicRooms}
                  onJoin={handleJoinPublicRoom}
                  isLoading={isConnecting}
                />
              </>
            ) : (
              <form onSubmit={handleJoinPrivateRoom} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ルームID
                  </label>
                  <input
                    type="text"
                    value={privateRoomId}
                    onChange={(e) => setPrivateRoomId(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="ルームIDを入力"
                  />
                </div>
                <button
                  type="submit"
                  disabled={
                    isConnecting || !playerName.trim() || !privateRoomId.trim()
                  }
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                >
                  {isConnecting ? "接続中..." : "参加"}
                </button>
                <p className="text-xs text-gray-500 text-center">
                  ルームIDは作成者から共有してもらってください
                </p>
              </form>
            )}
          </div>
        </div>

        {/* フッター */}
        <p className="mt-6 text-xs text-center text-blue-200">
          3〜4人でプレイ可能
        </p>
      </div>

      {/* モーダル */}
      {showCreateModal && (
        <CreateRoomModal
          playerName={playerName}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateRoom}
          isLoading={isConnecting}
        />
      )}

      {passwordModal && (
        <PasswordModal
          roomName={passwordModal.room.name}
          onClose={() => setPasswordModal(null)}
          onSubmit={handlePasswordSubmit}
          isLoading={isConnecting}
        />
      )}
    </div>
  );
}

/**
 * プレイヤー情報パネル
 */
function PlayerPanel({
  player,
  isCurrentTurn,
  isSelf,
}: {
  player: Player;
  isCurrentTurn: boolean;
  isSelf: boolean;
}) {
  const borderColor = {
    red: "border-red-500",
    blue: "border-blue-500",
    orange: "border-orange-500",
    white: "border-gray-300",
  }[player.color];

  const bgColor = {
    red: "bg-red-50",
    blue: "bg-blue-50",
    orange: "bg-orange-50",
    white: "bg-gray-50",
  }[player.color];

  // 発展カードの枚数集計
  const devCardCounts = useMemo(() => {
    const counts: Partial<Record<DevelopmentCardType, number>> = {};
    player.developmentCards.forEach((card) => {
      counts[card] = (counts[card] || 0) + 1;
    });
    return counts;
  }, [player.developmentCards]);

  return (
    <div
      className={`p-3 rounded-lg border-2 ${borderColor} ${bgColor} ${
        isCurrentTurn ? "ring-2 ring-yellow-400" : ""
      } ${!player.isConnected ? "opacity-50" : ""}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-800">
          {player.name}
          {isSelf && " (あなた)"}
        </span>
        <span className="text-sm text-gray-600">
          VP: {isSelf
            ? player.visibleVictoryPoints + player.developmentCards.filter(c => c === "victoryPoint").length
            : player.visibleVictoryPoints}
          {isSelf && player.developmentCards.filter(c => c === "victoryPoint").length > 0 && (
            <span className="text-xs text-purple-600 ml-1" title="勝利点カード（非公開）">
              (+{player.developmentCards.filter(c => c === "victoryPoint").length})
            </span>
          )}
        </span>
      </div>

      {/* 特殊バッジ（最長交易路・最大騎士力） */}
      <div className="flex gap-1 mb-2">
        {player.hasLongestRoad && (
          <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full" title="最長交易路 (+2VP)">
            🛤️ 最長交易路
          </span>
        )}
        {player.hasLargestArmy && (
          <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded-full" title="最大騎士力 (+2VP)">
            ⚔️ 最大騎士力
          </span>
        )}
      </div>

      {/* 騎士使用数 */}
      {player.knightsPlayed > 0 && (
        <div className="text-xs text-gray-600 mb-1">
          騎士使用: {player.knightsPlayed}枚
        </div>
      )}

      {/* 資源（自分のみ表示） */}
      {isSelf && (
        <div className="grid grid-cols-5 gap-1 text-xs mb-2">
          {(Object.keys(player.resources) as HoldableResource[]).map(
            (resource) => (
              <div
                key={resource}
                className="text-center bg-white rounded p-1"
                title={RESOURCE_LABELS[resource]}
              >
                <div>{RESOURCE_ICONS[resource]}</div>
                <div className="font-medium">{player.resources[resource]}</div>
              </div>
            )
          )}
        </div>
      )}

      {/* 発展カード（自分のみ詳細表示、他者は枚数のみ） */}
      {isSelf ? (
        player.developmentCards.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="text-xs text-gray-600 mb-1">発展カード:</div>
            <div className="flex flex-wrap gap-1">
              {(Object.entries(devCardCounts) as [DevelopmentCardType, number][]).map(
                ([card, count]) => (
                  <span
                    key={card}
                    className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded"
                    title={DEV_CARD_LABELS[card]}
                  >
                    {DEV_CARD_ICONS[card]} {DEV_CARD_LABELS[card]} ×{count}
                  </span>
                )
              )}
            </div>
          </div>
        )
      ) : (
        player.developmentCards.length > 0 && (
          <div className="text-xs text-gray-600">
            発展カード: {player.developmentCards.length}枚
          </div>
        )
      )}

      {/* 接続状態 */}
      {!player.isConnected && (
        <div className="text-xs text-red-600 mt-1">切断中</div>
      )}
    </div>
  );
}

/**
 * アクションパネル
 */
function ActionPanel({
  gameState,
  playerId,
  isSpectator,
  onAction,
  onResetGame,
  onTakeSeat,
  onLeaveSeat,
}: {
  gameState: GameState;
  playerId: string;
  isSpectator: boolean;
  onAction: (action: Omit<GameAction, "roomId">) => void;
  onResetGame: () => void;
  onTakeSeat: () => void;
  onLeaveSeat: () => void;
}) {
  const isMyTurn = gameState.currentPlayerId === playerId;
  const phase = gameState.phase;
  const currentPlayer = gameState.players.find((p) => p.id === playerId);
  const isHost = gameState.hostId === playerId;

  // 資源破棄用のstate
  const [discardResources, setDiscardResources] = useState<
    Record<HoldableResource, number>
  >({
    wood: 0,
    brick: 0,
    wheat: 0,
    ore: 0,
    sheep: 0,
  });

  // 銀行交易用のstate
  const [showBankTrade, setShowBankTrade] = useState(false);
  const [tradeGiveResource, setTradeGiveResource] =
    useState<HoldableResource>("wood");
  const [tradeReceiveResource, setTradeReceiveResource] =
    useState<HoldableResource>("brick");

  // 発展カード使用用のstate
  const [showDevCardUse, setShowDevCardUse] = useState(false);
  const [yearOfPlentyResources, setYearOfPlentyResources] = useState<
    [HoldableResource, HoldableResource]
  >(["wood", "brick"]);
  const [monopolyResource, setMonopolyResource] =
    useState<HoldableResource>("wood");

  // プレイヤー間交易用のstate
  const [showPlayerTrade, setShowPlayerTrade] = useState(false);
  const [tradeOffering, setTradeOffering] = useState<Record<HoldableResource, number>>({
    wood: 0, brick: 0, wheat: 0, ore: 0, sheep: 0,
  });
  const [tradeRequesting, setTradeRequesting] = useState<Record<HoldableResource, number>>({
    wood: 0, brick: 0, wheat: 0, ore: 0, sheep: 0,
  });

  // 港による最良交換レートを計算
  const getBestTradeRatio = useCallback(
    (resource: HoldableResource): number => {
      if (!currentPlayer) return 4;
      let bestRatio = 4;

      gameState.intersections.forEach((intersection) => {
        if (
          intersection.building?.playerId === playerId &&
          intersection.port
        ) {
          const port = intersection.port;
          // 汎用港
          if (port.resourceType === null && port.ratio < bestRatio) {
            bestRatio = port.ratio;
          }
          // 専門港
          if (port.resourceType === resource && port.ratio < bestRatio) {
            bestRatio = port.ratio;
          }
        }
      });

      return bestRatio;
    },
    [gameState.intersections, playerId, currentPlayer]
  );

  const tradeRatio = getBestTradeRatio(tradeGiveResource);

  const handleStartGame = () => {
    onAction({ type: "start_game" } as Omit<GameAction, "roomId">);
  };

  const handleRollDice = () => {
    onAction({ type: "roll_dice" } as Omit<GameAction, "roomId">);
  };

  const handleEndTurn = () => {
    onAction({ type: "end_turn" } as Omit<GameAction, "roomId">);
  };

  const handleStealResource = (targetPlayerId: string) => {
    onAction({ type: "steal_resource", targetPlayerId } as Omit<GameAction, "roomId">);
  };

  const handleDiscardResources = () => {
    onAction({ type: "discard_resources", resources: discardResources } as Omit<GameAction, "roomId">);
  };

  const handleBankTrade = () => {
    onAction({
      type: "trade_with_bank",
      give: { resource: tradeGiveResource, amount: tradeRatio },
      receive: tradeReceiveResource,
    } as Omit<GameAction, "roomId">);
    setShowBankTrade(false);
  };

  const handleBuyDevCard = () => {
    onAction({ type: "buy_development_card" } as Omit<GameAction, "roomId">);
  };

  const handleUseDevCard = (
    cardType: DevelopmentCardType,
    params?: {
      resources?: [HoldableResource, HoldableResource];
      resource?: HoldableResource;
    }
  ) => {
    onAction({ type: "use_development_card", cardType, params } as Omit<GameAction, "roomId">);
    setShowDevCardUse(false);
  };

  const handleProposeTrade = () => {
    const offering: Partial<Record<HoldableResource, number>> = {};
    const requesting: Partial<Record<HoldableResource, number>> = {};

    for (const [resource, amount] of Object.entries(tradeOffering)) {
      if (amount > 0) offering[resource as HoldableResource] = amount;
    }
    for (const [resource, amount] of Object.entries(tradeRequesting)) {
      if (amount > 0) requesting[resource as HoldableResource] = amount;
    }

    onAction({ type: "propose_trade", offering, requesting } as Omit<GameAction, "roomId">);
    setShowPlayerTrade(false);
    // リセット
    setTradeOffering({ wood: 0, brick: 0, wheat: 0, ore: 0, sheep: 0 });
    setTradeRequesting({ wood: 0, brick: 0, wheat: 0, ore: 0, sheep: 0 });
  };

  const handleRespondTrade = (response: "accept" | "reject") => {
    if (gameState.activeTradeOffer) {
      onAction({
        type: "respond_to_trade",
        tradeId: gameState.activeTradeOffer.id,
        response,
      } as Omit<GameAction, "roomId">);
    }
  };

  // 破棄に必要な枚数を計算
  const totalResources = currentPlayer
    ? Object.values(currentPlayer.resources).reduce((sum, c) => sum + c, 0)
    : 0;
  const requiredDiscard = Math.floor(totalResources / 2);
  const currentDiscardCount = Object.values(discardResources).reduce(
    (sum, c) => sum + c,
    0
  );

  // 盗賊に隣接するプレイヤーを取得（サーバー側と同じロジック）
  const getStealablePlayerIds = (): string[] => {
    const robberHex = gameState.hexes.find((h) => h.hasRobber);
    if (!robberHex) return [];

    const adjacentPlayerIds = new Set<string>();

    // サーバー側と同じロジックで隣接頂点IDを計算
    const cubeToId = (coord: { q: number; r: number; s: number }) =>
      `${coord.q},${coord.r},${coord.s}`;

    const hex = robberHex.coordinate;
    const adjacentVertexIds = [
      // 上 (Top)
      `${cubeToId(hex)}_N`,
      // 下 (Bottom)
      `${cubeToId(hex)}_S`,
      // 右上 (Upper-right): NE隣の下
      `${cubeToId({ q: hex.q + 1, r: hex.r - 1, s: hex.s })}_S`,
      // 右下 (Lower-right): SE隣の上
      `${cubeToId({ q: hex.q, r: hex.r + 1, s: hex.s - 1 })}_N`,
      // 左下 (Lower-left): SW隣の上
      `${cubeToId({ q: hex.q - 1, r: hex.r + 1, s: hex.s })}_N`,
      // 左上 (Upper-left): NW隣の下
      `${cubeToId({ q: hex.q, r: hex.r - 1, s: hex.s + 1 })}_S`,
    ];

    for (const vertexId of adjacentVertexIds) {
      const intersection = gameState.intersections.find(
        (i) => i.id === vertexId
      );
      if (
        intersection?.building &&
        intersection.building.playerId !== playerId
      ) {
        adjacentPlayerIds.add(intersection.building.playerId);
      }
    }

    return Array.from(adjacentPlayerIds);
  };

  // 待機中
  if (phase === "waiting") {
    const canStartGame = gameState.players.length >= 3 && gameState.players.length <= 4;
    const canTakeSeat = isSpectator && gameState.players.length < 4;
    const canLeaveSeat = !isSpectator && !isHost;

    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-800 mb-2">待機中</h3>

        {/* プレイヤー席 */}
        <div className="mb-3">
          <p className="text-sm text-gray-600">
            プレイヤー: {gameState.players.length}/4 人
          </p>
        </div>

        {/* 観戦者リスト */}
        {gameState.spectators.length > 0 && (
          <div className="mb-3 p-2 bg-gray-50 rounded">
            <p className="text-xs text-gray-500 mb-1">観戦者:</p>
            <div className="flex flex-wrap gap-1">
              {gameState.spectators.map((s) => (
                <span
                  key={s.id}
                  className={`px-2 py-0.5 text-xs rounded ${
                    s.id === playerId
                      ? "bg-blue-100 text-blue-800"
                      : "bg-gray-200 text-gray-700"
                  } ${!s.isConnected ? "opacity-50" : ""}`}
                >
                  {s.name}
                  {s.id === playerId && " (あなた)"}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 席の操作 */}
        {isSpectator ? (
          <button
            onClick={onTakeSeat}
            disabled={!canTakeSeat}
            className="w-full py-2 mb-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            {canTakeSeat ? "席に着く" : "席が満員です"}
          </button>
        ) : (
          canLeaveSeat && (
            <button
              onClick={onLeaveSeat}
              className="w-full py-2 mb-2 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600 transition"
            >
              席を立つ
            </button>
          )
        )}

        {/* ゲーム開始ボタン（プレイヤーのみ） */}
        {!isSpectator && canStartGame && (
          <button
            onClick={handleStartGame}
            className="w-full py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition"
          >
            ゲーム開始
          </button>
        )}

        {!isSpectator && gameState.players.length < 3 && (
          <p className="text-xs text-gray-500">
            ゲームを開始するには3人以上必要です
          </p>
        )}

        {isHost && (
          <p className="text-xs text-blue-600 mt-2">
            あなたはこのルームのホストです
          </p>
        )}

        {isSpectator && (
          <p className="text-xs text-purple-600 mt-2">
            あなたは観戦者です
          </p>
        )}
      </div>
    );
  }

  // ゲーム終了
  if (phase === "game_over") {
    const winner = gameState.players.find(
      (p) => p.id === gameState.winnerId
    );
    return (
      <div className="bg-white rounded-lg shadow p-4 text-center">
        <h3 className="text-xl font-bold text-yellow-600 mb-2">ゲーム終了</h3>
        {winner && (
          <p className="text-lg mb-4">
            勝者: <span className="font-semibold">{winner.name}</span>
          </p>
        )}
        {isHost && !isSpectator && (
          <button
            onClick={onResetGame}
            className="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            新しいゲームを始める
          </button>
        )}
        {!isHost && !isSpectator && (
          <p className="text-xs text-gray-500 mt-2">
            ホストがゲームをリセットするのを待っています
          </p>
        )}
        {isSpectator && (
          <p className="text-xs text-purple-600 mt-2">
            観戦中
          </p>
        )}
      </div>
    );
  }

  // 観戦者用のビュー（ゲーム中）
  if (isSpectator) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        {/* 観戦者バッジ */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">{PHASE_LABELS[phase]}</h3>
          <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
            観戦中
          </span>
        </div>

        {/* サイコロ結果 */}
        {gameState.diceResult && (
          <div className="mb-3 p-2 bg-blue-50 rounded text-center">
            <span className="text-lg font-bold">
              🎲 {gameState.diceResult.die1} + {gameState.diceResult.die2} = {gameState.diceResult.total}
            </span>
          </div>
        )}

        {/* 現在のターンプレイヤー */}
        <p className="text-sm text-gray-600 text-center">
          {
            gameState.players.find(
              (p) => p.id === gameState.currentPlayerId
            )?.name
          }{" "}
          のターンです
        </p>

        {/* 観戦者リスト */}
        {gameState.spectators.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-gray-500 mb-1">観戦者:</p>
            <div className="flex flex-wrap gap-1">
              {gameState.spectators.map((s) => (
                <span
                  key={s.id}
                  className={`px-2 py-0.5 text-xs rounded ${
                    s.id === playerId
                      ? "bg-purple-100 text-purple-800"
                      : "bg-gray-200 text-gray-700"
                  }`}
                >
                  {s.name}
                  {s.id === playerId && " (あなた)"}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      {/* フェーズ表示 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">{PHASE_LABELS[phase]}</h3>
        {isMyTurn && (
          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
            あなたのターン
          </span>
        )}
      </div>

      {/* アクションボタン */}
      <div className="space-y-2">
        {/* サイコロを振る */}
        {phase === "roll_dice" && isMyTurn && (
          <button
            onClick={handleRollDice}
            className="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            サイコロを振る
          </button>
        )}

        {/* メインフェーズのアクション */}
        {phase === "main" && isMyTurn && (
          <>
            <p className="text-xs text-gray-500 mb-2">
              建設: ボード上でクリック
            </p>

            {/* 発展カード購入 */}
            <button
              onClick={handleBuyDevCard}
              disabled={
                !currentPlayer ||
                currentPlayer.resources.wheat < 1 ||
                currentPlayer.resources.ore < 1 ||
                currentPlayer.resources.sheep < 1 ||
                gameState.developmentCardDeckCount === 0
              }
              className="w-full py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:bg-gray-400 transition"
            >
              発展カード購入 (小麦1,鉱石1,羊1) 残{gameState.developmentCardDeckCount}枚
            </button>

            {/* 発展カード使用 */}
            {currentPlayer && currentPlayer.developmentCards.length > 0 && (
              <>
                {!showDevCardUse ? (
                  <button
                    onClick={() => setShowDevCardUse(true)}
                    className="w-full py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition"
                  >
                    発展カードを使用
                  </button>
                ) : (
                  <div className="bg-indigo-50 p-3 rounded-lg space-y-2">
                    <div className="text-sm font-medium text-gray-700">使用するカード:</div>

                    {/* 騎士カード */}
                    {currentPlayer.developmentCards.includes("knight") && (
                      <button
                        onClick={() => handleUseDevCard("knight")}
                        className="w-full py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 transition"
                      >
                        ⚔️ 騎士（盗賊を移動）
                      </button>
                    )}

                    {/* 街道建設 */}
                    {currentPlayer.developmentCards.includes("roadBuilding") && (
                      <button
                        onClick={() => handleUseDevCard("roadBuilding")}
                        className="w-full py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 transition"
                      >
                        🛤️ 街道建設（道2本分の資源）
                      </button>
                    )}

                    {/* 収穫 */}
                    {currentPlayer.developmentCards.includes("yearOfPlenty") && (
                      <div className="space-y-1">
                        <div className="text-xs">🌽 収穫（資源2つ獲得）:</div>
                        <div className="flex gap-1">
                          <select
                            value={yearOfPlentyResources[0]}
                            onChange={(e) =>
                              setYearOfPlentyResources([
                                e.target.value as HoldableResource,
                                yearOfPlentyResources[1],
                              ])
                            }
                            className="flex-1 px-1 py-1 border rounded text-xs"
                          >
                            {(Object.keys(RESOURCE_LABELS) as HoldableResource[]).map((r) => (
                              <option key={r} value={r}>
                                {RESOURCE_ICONS[r]}
                              </option>
                            ))}
                          </select>
                          <select
                            value={yearOfPlentyResources[1]}
                            onChange={(e) =>
                              setYearOfPlentyResources([
                                yearOfPlentyResources[0],
                                e.target.value as HoldableResource,
                              ])
                            }
                            className="flex-1 px-1 py-1 border rounded text-xs"
                          >
                            {(Object.keys(RESOURCE_LABELS) as HoldableResource[]).map((r) => (
                              <option key={r} value={r}>
                                {RESOURCE_ICONS[r]}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() =>
                              handleUseDevCard("yearOfPlenty", {
                                resources: yearOfPlentyResources,
                              })
                            }
                            className="px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 transition"
                          >
                            使用
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 独占 */}
                    {currentPlayer.developmentCards.includes("monopoly") && (
                      <div className="space-y-1">
                        <div className="text-xs">💰 独占（全員からその資源を奪う）:</div>
                        <div className="flex gap-1">
                          <select
                            value={monopolyResource}
                            onChange={(e) =>
                              setMonopolyResource(e.target.value as HoldableResource)
                            }
                            className="flex-1 px-1 py-1 border rounded text-xs"
                          >
                            {(Object.keys(RESOURCE_LABELS) as HoldableResource[]).map((r) => (
                              <option key={r} value={r}>
                                {RESOURCE_ICONS[r]} {RESOURCE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() =>
                              handleUseDevCard("monopoly", { resource: monopolyResource })
                            }
                            className="px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 transition"
                          >
                            使用
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => setShowDevCardUse(false)}
                      className="w-full py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400 transition"
                    >
                      キャンセル
                    </button>
                  </div>
                )}
              </>
            )}

            {/* 銀行交易 */}
            {!showBankTrade ? (
              <button
                onClick={() => setShowBankTrade(true)}
                className="w-full py-2 bg-yellow-600 text-white rounded-lg font-semibold hover:bg-yellow-700 transition"
              >
                銀行と交易
              </button>
            ) : (
              <div className="bg-yellow-50 p-3 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">渡す:</span>
                  <select
                    value={tradeGiveResource}
                    onChange={(e) =>
                      setTradeGiveResource(e.target.value as HoldableResource)
                    }
                    className="flex-1 px-2 py-1 border rounded text-sm"
                  >
                    {(Object.keys(RESOURCE_LABELS) as HoldableResource[]).map(
                      (r) => (
                        <option key={r} value={r}>
                          {RESOURCE_ICONS[r]} {RESOURCE_LABELS[r]} (
                          {currentPlayer?.resources[r] || 0})
                        </option>
                      )
                    )}
                  </select>
                  <span className="text-sm">×{tradeRatio}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">受取:</span>
                  <select
                    value={tradeReceiveResource}
                    onChange={(e) =>
                      setTradeReceiveResource(e.target.value as HoldableResource)
                    }
                    className="flex-1 px-2 py-1 border rounded text-sm"
                  >
                    {(Object.keys(RESOURCE_LABELS) as HoldableResource[]).map(
                      (r) => (
                        <option key={r} value={r}>
                          {RESOURCE_ICONS[r]} {RESOURCE_LABELS[r]}
                        </option>
                      )
                    )}
                  </select>
                  <span className="text-sm">×1</span>
                </div>
                {tradeRatio < 4 && (
                  <p className="text-xs text-green-600">
                    港ボーナス適用中 ({tradeRatio}:1)
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleBankTrade}
                    disabled={
                      !currentPlayer ||
                      currentPlayer.resources[tradeGiveResource] < tradeRatio
                    }
                    className="flex-1 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700 disabled:bg-gray-400 transition"
                  >
                    交換
                  </button>
                  <button
                    onClick={() => setShowBankTrade(false)}
                    className="px-3 py-1 bg-gray-300 rounded text-sm hover:bg-gray-400 transition"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {/* プレイヤー間交易 */}
            {!showPlayerTrade ? (
              <button
                onClick={() => setShowPlayerTrade(true)}
                className="w-full py-2 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition"
              >
                他プレイヤーと交易
              </button>
            ) : (
              <div className="bg-teal-50 p-3 rounded-lg space-y-2">
                <div className="text-sm font-medium text-gray-700 mb-2">プレイヤー間交易</div>

                {/* 提供する資源 */}
                <div className="text-xs text-gray-600">あげる:</div>
                <div className="grid grid-cols-5 gap-1">
                  {(Object.keys(RESOURCE_LABELS) as HoldableResource[]).map((r) => (
                    <div key={`offer-${r}`} className="text-center">
                      <div className="text-sm">{RESOURCE_ICONS[r]}</div>
                      <div className="text-xs text-gray-500">{currentPlayer?.resources[r] || 0}</div>
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => setTradeOffering(prev => ({
                            ...prev,
                            [r]: Math.max(0, prev[r] - 1)
                          }))}
                          className="w-4 h-4 bg-gray-200 rounded text-xs"
                        >-</button>
                        <span className="text-xs w-3">{tradeOffering[r]}</span>
                        <button
                          onClick={() => setTradeOffering(prev => ({
                            ...prev,
                            [r]: Math.min(currentPlayer?.resources[r] || 0, prev[r] + 1)
                          }))}
                          className="w-4 h-4 bg-gray-200 rounded text-xs"
                        >+</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 要求する資源 */}
                <div className="text-xs text-gray-600 mt-2">もらう:</div>
                <div className="grid grid-cols-5 gap-1">
                  {(Object.keys(RESOURCE_LABELS) as HoldableResource[]).map((r) => (
                    <div key={`req-${r}`} className="text-center">
                      <div className="text-sm">{RESOURCE_ICONS[r]}</div>
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => setTradeRequesting(prev => ({
                            ...prev,
                            [r]: Math.max(0, prev[r] - 1)
                          }))}
                          className="w-4 h-4 bg-gray-200 rounded text-xs"
                        >-</button>
                        <span className="text-xs w-3">{tradeRequesting[r]}</span>
                        <button
                          onClick={() => setTradeRequesting(prev => ({
                            ...prev,
                            [r]: prev[r] + 1
                          }))}
                          className="w-4 h-4 bg-gray-200 rounded text-xs"
                        >+</button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleProposeTrade}
                    disabled={
                      Object.values(tradeOffering).reduce((a, b) => a + b, 0) === 0 ||
                      Object.values(tradeRequesting).reduce((a, b) => a + b, 0) === 0
                    }
                    className="flex-1 py-1 bg-teal-600 text-white rounded text-sm hover:bg-teal-700 disabled:bg-gray-400 transition"
                  >
                    提案する
                  </button>
                  <button
                    onClick={() => {
                      setShowPlayerTrade(false);
                      setTradeOffering({ wood: 0, brick: 0, wheat: 0, ore: 0, sheep: 0 });
                      setTradeRequesting({ wood: 0, brick: 0, wheat: 0, ore: 0, sheep: 0 });
                    }}
                    className="px-3 py-1 bg-gray-300 rounded text-sm hover:bg-gray-400 transition"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleEndTurn}
              className="w-full py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition"
            >
              ターン終了
            </button>
          </>
        )}

        {/* 初期配置フェーズ */}
        {(phase === "setup_settlement_1" || phase === "setup_settlement_2") &&
          isMyTurn && (
            <p className="text-sm text-gray-600">
              ボード上で開拓地を配置する場所をクリックしてください
            </p>
          )}

        {(phase === "setup_road_1" || phase === "setup_road_2") &&
          isMyTurn && (
            <p className="text-sm text-gray-600">
              ボード上で道を配置する場所をクリックしてください
            </p>
          )}

        {/* 盗賊移動フェーズ */}
        {phase === "robber_move" && isMyTurn && (
          <p className="text-sm text-gray-600">
            盗賊を移動させる六角形をクリックしてください
          </p>
        )}

        {/* 盗賊略奪フェーズ */}
        {phase === "robber_steal" && isMyTurn && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              資源を奪うプレイヤーを選択:
            </p>
            {getStealablePlayerIds().map((targetId) => {
              const targetPlayer = gameState.players.find(
                (p) => p.id === targetId
              );
              return (
                <button
                  key={targetId}
                  onClick={() => handleStealResource(targetId)}
                  className="w-full py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition"
                >
                  {targetPlayer?.name} から奪う
                </button>
              );
            })}
          </div>
        )}

        {/* 資源破棄フェーズ */}
        {phase === "discard" && totalResources > 7 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              {requiredDiscard}枚の資源を破棄してください ({currentDiscardCount}/
              {requiredDiscard})
            </p>
            <div className="grid grid-cols-5 gap-1">
              {(Object.keys(RESOURCE_LABELS) as HoldableResource[]).map(
                (resource) => (
                  <div key={resource} className="text-center">
                    <div className="text-lg">{RESOURCE_ICONS[resource]}</div>
                    <div className="text-xs">
                      {currentPlayer?.resources[resource] || 0}
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() =>
                          setDiscardResources((prev) => ({
                            ...prev,
                            [resource]: Math.max(0, prev[resource] - 1),
                          }))
                        }
                        className="w-5 h-5 bg-gray-200 rounded text-xs"
                      >
                        -
                      </button>
                      <span className="text-sm font-medium">
                        {discardResources[resource]}
                      </span>
                      <button
                        onClick={() =>
                          setDiscardResources((prev) => ({
                            ...prev,
                            [resource]: Math.min(
                              currentPlayer?.resources[resource] || 0,
                              prev[resource] + 1
                            ),
                          }))
                        }
                        className="w-5 h-5 bg-gray-200 rounded text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
            <button
              onClick={handleDiscardResources}
              disabled={currentDiscardCount !== requiredDiscard}
              className="w-full py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 disabled:bg-gray-400 transition"
            >
              破棄する
            </button>
          </div>
        )}

        {/* 交易提案フェーズ */}
        {phase === "trade_offer" && gameState.activeTradeOffer && (
          <div className="space-y-2 bg-teal-50 p-3 rounded-lg">
            <p className="text-sm font-medium text-gray-700">
              交易提案: {gameState.players.find(p => p.id === gameState.activeTradeOffer?.fromPlayerId)?.name}
            </p>

            {/* 提案内容 */}
            <div className="text-xs">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-gray-600">あげる:</span>
                {Object.entries(gameState.activeTradeOffer.offering).map(([r, amount]) =>
                  amount ? (
                    <span key={r} className="bg-white px-1 rounded">
                      {RESOURCE_ICONS[r as HoldableResource]} ×{amount}
                    </span>
                  ) : null
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-600">もらう:</span>
                {Object.entries(gameState.activeTradeOffer.requesting).map(([r, amount]) =>
                  amount ? (
                    <span key={r} className="bg-white px-1 rounded">
                      {RESOURCE_ICONS[r as HoldableResource]} ×{amount}
                    </span>
                  ) : null
                )}
              </div>
            </div>

            {/* 応答状況 */}
            <div className="text-xs text-gray-500">
              {Object.entries(gameState.activeTradeOffer.responses).map(([pid, status]) => {
                const responder = gameState.players.find(p => p.id === pid);
                return (
                  <div key={pid}>
                    {responder?.name}: {
                      status === "pending" ? "検討中..." :
                      status === "accepted" ? "受諾" : "拒否"
                    }
                  </div>
                );
              })}
            </div>

            {/* 提案者用: キャンセルボタン */}
            {playerId === gameState.activeTradeOffer.fromPlayerId ? (
              <button
                onClick={() => handleRespondTrade("reject")}
                className="w-full py-2 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600 transition"
              >
                提案をキャンセル
              </button>
            ) : (
              /* 他プレイヤー用: 受諾/拒否ボタン */
              gameState.activeTradeOffer.responses[playerId] === "pending" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRespondTrade("accept")}
                    disabled={
                      !currentPlayer ||
                      Object.entries(gameState.activeTradeOffer!.requesting).some(
                        ([r, amount]) => amount && currentPlayer.resources[r as HoldableResource] < amount
                      )
                    }
                    className="flex-1 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 transition"
                  >
                    受諾
                  </button>
                  <button
                    onClick={() => handleRespondTrade("reject")}
                    className="flex-1 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition"
                  >
                    拒否
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {/* 他のプレイヤーのターン */}
        {!isMyTurn && phase !== "discard" && phase !== "trade_offer" && (
          <p className="text-sm text-gray-500 text-center">
            {
              gameState.players.find(
                (p) => p.id === gameState.currentPlayerId
              )?.name
            }{" "}
            のターンです
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * チャットパネル
 */
function ChatPanel({
  messages,
  onSendMessage,
}: {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
}) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput("");
    }
  };

  return (
    <div className="bg-white rounded-lg shadow flex flex-col h-64">
      <div className="p-2 border-b">
        <h3 className="font-semibold text-gray-800">チャット</h3>
      </div>

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {messages.length === 0 ? (
          <p className="text-xs text-gray-400 text-center">
            メッセージはまだありません
          </p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="text-sm">
              <span className="font-semibold text-gray-700">
                {msg.playerName}:
              </span>{" "}
              <span className="text-gray-600">{msg.message}</span>
            </div>
          ))
        )}
      </div>

      {/* 入力フォーム */}
      <form onSubmit={handleSubmit} className="p-2 border-t flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 px-3 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-transparent"
          placeholder="メッセージを入力..."
          maxLength={200}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-400 transition"
        >
          送信
        </button>
      </form>
    </div>
  );
}

// ============================================
// メインコンポーネント
// ============================================

export function GameRoom() {
  const {
    isConnected,
    isConnecting,
    gameState,
    playerId,
    isSpectator,
    error,
    chatMessages,
    publicRooms,
    savedSession,
    createRoom,
    joinRoom,
    rejoinRoom,
    leaveRoom,
    takeSeat,
    leaveSeat,
    fetchPublicRooms,
    sendAction,
    sendChatMessage,
    resetGame,
    clearSavedSession,
  } = useGameSocket();

  // ゲーム設定（効果音・通知）
  const { settings, toggleSound, toggleNotification } = useGameSettings();
  const { playSound } = useSound(settings.soundEnabled);
  const { notifyTurn, requestPermission, permission, isSupported: isNotificationSupported } = useNotification(settings.notificationEnabled);

  // 前回のゲーム状態を追跡（変更検知用）
  const prevGameStateRef = useRef<GameState | null>(null);
  const prevCurrentPlayerIdRef = useRef<string | null>(null);

  // ゲームイベントに応じて効果音・通知を発動
  useEffect(() => {
    if (!gameState || !playerId) return;

    const prevState = prevGameStateRef.current;
    const prevCurrentPlayerId = prevCurrentPlayerIdRef.current;

    // ターンが自分に変わった時
    if (
      gameState.currentPlayerId === playerId &&
      prevCurrentPlayerId !== playerId &&
      prevCurrentPlayerId !== null
    ) {
      playSound("turnStart");
      notifyTurn();
    }

    // サイコロが振られた時
    if (
      gameState.diceResult &&
      (!prevState?.diceResult ||
        prevState.diceResult.die1 !== gameState.diceResult.die1 ||
        prevState.diceResult.die2 !== gameState.diceResult.die2)
    ) {
      playSound("diceRoll");
    }

    // 盗賊が移動した時（7が出た時など）
    if (prevState && gameState.phase === "robber_move" && prevState.phase !== "robber_move") {
      playSound("robber");
    }

    // 勝者が決まった時
    if (gameState.winnerId && !prevState?.winnerId) {
      playSound("victory");
    }

    // 状態を更新
    prevGameStateRef.current = gameState;
    prevCurrentPlayerIdRef.current = gameState.currentPlayerId;
  }, [gameState, playerId, playSound, notifyTurn]);

  // 選択可能な要素（観戦者は何も選択できない）
  const selectableIntersections = useMemo(() => {
    if (!gameState || !playerId || isSpectator) return [];

    const phase = gameState.phase;
    const isMyTurn = gameState.currentPlayerId === playerId;

    // 初期配置フェーズで自分のターンなら全ての空き頂点を選択可能に
    if (
      isMyTurn &&
      (phase === "setup_settlement_1" || phase === "setup_settlement_2")
    ) {
      return gameState.intersections
        .filter((i) => !i.building)
        .map((i) => i.id);
    }

    // メインフェーズ: 空き頂点（開拓地用）と自分の開拓地（都市化用）
    if (isMyTurn && phase === "main") {
      const emptyIntersections = gameState.intersections
        .filter((i) => !i.building)
        .map((i) => i.id);
      const mySettlements = gameState.intersections
        .filter(
          (i) =>
            i.building?.playerId === playerId &&
            i.building.type === "settlement"
        )
        .map((i) => i.id);
      return [...emptyIntersections, ...mySettlements];
    }

    return [];
  }, [gameState, playerId, isSpectator]);

  const selectableEdges = useMemo(() => {
    if (!gameState || !playerId || isSpectator) return [];

    const phase = gameState.phase;
    const isMyTurn = gameState.currentPlayerId === playerId;

    // 初期配置フェーズで自分のターンなら全ての空き辺を選択可能に
    if (
      isMyTurn &&
      (phase === "setup_road_1" || phase === "setup_road_2")
    ) {
      return gameState.edges.filter((e) => !e.road).map((e) => e.id);
    }

    // メインフェーズ: 空き辺
    if (isMyTurn && phase === "main") {
      return gameState.edges.filter((e) => !e.road).map((e) => e.id);
    }

    return [];
  }, [gameState, playerId, isSpectator]);

  const selectableHexes = useMemo(() => {
    if (!gameState || !playerId || isSpectator) return [];

    const phase = gameState.phase;
    const isMyTurn = gameState.currentPlayerId === playerId;

    // 盗賊移動フェーズで自分のターンなら盗賊がいない六角形を選択可能に
    if (isMyTurn && phase === "robber_move") {
      return gameState.hexes.filter((h) => !h.hasRobber).map((h) => h.id);
    }

    return [];
  }, [gameState, playerId, isSpectator]);

  // イベントハンドラー
  const handleIntersectionClick = useCallback(
    (intersectionId: string) => {
      if (!gameState || !playerId) return;

      const phase = gameState.phase;
      const intersection = gameState.intersections.find(
        (i) => i.id === intersectionId
      );

      if (
        phase === "setup_settlement_1" ||
        phase === "setup_settlement_2"
      ) {
        playSound("build");
        sendAction({ type: "build_settlement", intersectionId } as Omit<GameAction, "roomId">);
      } else if (phase === "main") {
        // 自分の開拓地をクリックしたら都市化
        if (
          intersection?.building?.playerId === playerId &&
          intersection.building.type === "settlement"
        ) {
          playSound("build");
          sendAction({ type: "build_city", intersectionId } as Omit<GameAction, "roomId">);
        } else {
          // 空の頂点なら開拓地建設
          playSound("build");
          sendAction({ type: "build_settlement", intersectionId } as Omit<GameAction, "roomId">);
        }
      }
    },
    [gameState, playerId, sendAction, playSound]
  );

  const handleEdgeClick = useCallback(
    (edgeId: string) => {
      if (!gameState || !playerId) return;

      const phase = gameState.phase;
      if (
        phase === "setup_road_1" ||
        phase === "setup_road_2" ||
        phase === "main"
      ) {
        playSound("build");
        sendAction({ type: "build_road", edgeId } as Omit<GameAction, "roomId">);
      }
    },
    [gameState, playerId, sendAction, playSound]
  );

  const handleHexClick = useCallback(
    (hexId: string) => {
      if (!gameState || !playerId) return;

      if (gameState.phase === "robber_move") {
        playSound("robber");
        sendAction({ type: "move_robber", hexId } as Omit<GameAction, "roomId">);
      }
    },
    [gameState, playerId, sendAction, playSound]
  );

  // ゲーム状態がない場合はロビー画面を表示
  if (!gameState) {
    return (
      <Lobby
        publicRooms={publicRooms}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        onJoinPrivateRoom={joinRoom}
        onRejoinRoom={rejoinRoom}
        onRefreshRooms={fetchPublicRooms}
        savedSession={savedSession}
        onClearSavedSession={clearSavedSession}
        error={error}
        isConnecting={isConnecting}
      />
    );
  }

  // ゲーム画面
  return (
    <div className="min-h-screen bg-gray-100">
      {/* ヘッダー */}
      <header className="bg-blue-800 text-white py-3 px-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">カタド</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm opacity-80 flex items-center gap-1">
              ルーム: {gameState.id}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(gameState.id).then(() => {
                    // 短時間のフィードバック表示用にボタンテキストを変更
                    const btn = document.getElementById('copy-room-id-btn');
                    if (btn) {
                      btn.textContent = '✓';
                      setTimeout(() => {
                        btn.textContent = '📋';
                      }, 1500);
                    }
                  });
                }}
                id="copy-room-id-btn"
                className="ml-1 px-1 py-0.5 text-xs bg-blue-700 hover:bg-blue-600 rounded transition"
                title="ルームIDをコピー"
              >
                📋
              </button>
            </span>
            {/* 設定ボタン */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSound}
                className={`px-2 py-1 rounded text-sm transition ${
                  settings.soundEnabled
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-gray-600 hover:bg-gray-700"
                }`}
                title={settings.soundEnabled ? "効果音: ON" : "効果音: OFF"}
              >
                {settings.soundEnabled ? "🔊" : "🔇"}
              </button>
              <button
                onClick={() => {
                  if (!settings.notificationEnabled && permission !== "granted") {
                    requestPermission().then((granted) => {
                      if (granted) toggleNotification();
                    });
                  } else {
                    toggleNotification();
                  }
                }}
                className={`px-2 py-1 rounded text-sm transition ${
                  settings.notificationEnabled && permission === "granted"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-gray-600 hover:bg-gray-700"
                }`}
                title={
                  !isNotificationSupported
                    ? "通知非対応"
                    : permission !== "granted"
                    ? "通知許可が必要"
                    : settings.notificationEnabled
                    ? "通知: ON"
                    : "通知: OFF"
                }
              >
                {settings.notificationEnabled && permission === "granted" ? "🔔" : "🔕"}
              </button>
            </div>
            {/* 観戦者インジケーター */}
            {isSpectator && (
              <span className="px-2 py-1 bg-purple-600 rounded text-xs">
                観戦中
              </span>
            )}
            {gameState.hostId === playerId && !isSpectator && gameState.phase !== "waiting" && gameState.phase !== "game_over" && (
              <button
                onClick={() => {
                  if (window.confirm("ゲームをリセットしますか？全員の進行状況がクリアされます。")) {
                    resetGame();
                  }
                }}
                className="px-3 py-1 bg-yellow-600 rounded text-sm hover:bg-yellow-700 transition"
              >
                リセット
              </button>
            )}
            <button
              onClick={leaveRoom}
              className="px-3 py-1 bg-red-600 rounded text-sm hover:bg-red-700 transition"
            >
              退出
            </button>
          </div>
        </div>
      </header>

      {/* フローティングエラー通知 */}
      {error && (
        <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50 animate-pulse">
          <div className="bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg text-sm font-medium">
            {error}
          </div>
        </div>
      )}

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* 左サイドバー: プレイヤーリスト */}
          <div className="lg:col-span-1 space-y-3">
            <h2 className="font-semibold text-gray-700">プレイヤー</h2>
            {gameState.players.map((player) => (
              <PlayerPanel
                key={player.id}
                player={player}
                isCurrentTurn={player.id === gameState.currentPlayerId}
                isSelf={player.id === playerId}
              />
            ))}
          </div>

          {/* 中央: ゲームボード */}
          <div className="lg:col-span-2">
            <GameBoard
              gameState={gameState}
              currentPlayerId={playerId}
              onIntersectionClick={handleIntersectionClick}
              onEdgeClick={handleEdgeClick}
              onHexClick={handleHexClick}
              selectableIntersections={selectableIntersections}
              selectableEdges={selectableEdges}
              selectableHexes={selectableHexes}
              debug={process.env.NEXT_PUBLIC_DEBUG_BOARD === "true"}
            />
          </div>

          {/* 右サイドバー: アクションとチャット */}
          <div className="lg:col-span-1 space-y-4">
            {playerId && (
              <ActionPanel
                gameState={gameState}
                playerId={playerId}
                isSpectator={isSpectator}
                onAction={sendAction}
                onResetGame={resetGame}
                onTakeSeat={takeSeat}
                onLeaveSeat={leaveSeat}
              />
            )}
            <ChatPanel
              messages={chatMessages}
              onSendMessage={sendChatMessage}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default GameRoom;
