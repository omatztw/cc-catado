"use client";

/**
 * GameRoom - ゲームルームのメインコンポーネント
 * ゲームボード、プレイヤーパネル、チャット、アクションボタンを統合
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useGameSocket, useCurrentPlayer, useIsMyTurn } from "../hooks/useGameSocket";
import { GameBoard } from "./GameBoard";
import type {
  GameState,
  GamePhase,
  Player,
  HoldableResource,
  ChatMessage,
  RoomInfo,
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
            disabled={isLoading || room.playerCount >= room.maxPlayers || room.status !== "waiting"}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            参加
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
  onRefreshRooms,
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
  onRefreshRooms: () => void;
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
          VP: {player.visibleVictoryPoints}
        </span>
      </div>

      {/* 資源（自分のみ表示） */}
      {isSelf && (
        <div className="grid grid-cols-5 gap-1 text-xs">
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
  onAction,
}: {
  gameState: GameState;
  playerId: string;
  onAction: (action: { type: string; [key: string]: unknown }) => void;
}) {
  const isMyTurn = gameState.currentPlayerId === playerId;
  const phase = gameState.phase;

  const handleStartGame = () => {
    onAction({ type: "start_game" });
  };

  const handleRollDice = () => {
    onAction({ type: "roll_dice" });
  };

  const handleEndTurn = () => {
    onAction({ type: "end_turn" });
  };

  // 待機中
  if (phase === "waiting") {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-800 mb-2">待機中</h3>
        <p className="text-sm text-gray-600 mb-3">
          {gameState.players.length}/4 人が参加中
        </p>
        {gameState.players.length >= 3 && (
          <button
            onClick={handleStartGame}
            className="w-full py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition"
          >
            ゲーム開始
          </button>
        )}
        {gameState.players.length < 3 && (
          <p className="text-xs text-gray-500">
            ゲームを開始するには3人以上必要です
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
          <p className="text-lg">
            勝者: <span className="font-semibold">{winner.name}</span>
          </p>
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

        {/* 他のプレイヤーのターン */}
        {!isMyTurn && phase !== "waiting" && phase !== "game_over" && (
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
    error,
    chatMessages,
    publicRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    fetchPublicRooms,
    sendAction,
    sendChatMessage,
  } = useGameSocket();

  // 選択可能な要素（初期配置フェーズ用）
  const selectableIntersections = useMemo(() => {
    if (!gameState || !playerId) return [];

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

    return [];
  }, [gameState, playerId]);

  const selectableEdges = useMemo(() => {
    if (!gameState || !playerId) return [];

    const phase = gameState.phase;
    const isMyTurn = gameState.currentPlayerId === playerId;

    // 初期配置フェーズで自分のターンなら全ての空き辺を選択可能に
    if (
      isMyTurn &&
      (phase === "setup_road_1" || phase === "setup_road_2")
    ) {
      return gameState.edges.filter((e) => !e.road).map((e) => e.id);
    }

    return [];
  }, [gameState, playerId]);

  const selectableHexes = useMemo(() => {
    if (!gameState || !playerId) return [];

    const phase = gameState.phase;
    const isMyTurn = gameState.currentPlayerId === playerId;

    // 盗賊移動フェーズで自分のターンなら盗賊がいない六角形を選択可能に
    if (isMyTurn && phase === "robber_move") {
      return gameState.hexes.filter((h) => !h.hasRobber).map((h) => h.id);
    }

    return [];
  }, [gameState, playerId]);

  // イベントハンドラー
  const handleIntersectionClick = useCallback(
    (intersectionId: string) => {
      if (!gameState || !playerId) return;

      const phase = gameState.phase;
      if (
        phase === "setup_settlement_1" ||
        phase === "setup_settlement_2" ||
        phase === "main"
      ) {
        sendAction({ type: "build_settlement", intersectionId });
      }
    },
    [gameState, playerId, sendAction]
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
        sendAction({ type: "build_road", edgeId });
      }
    },
    [gameState, playerId, sendAction]
  );

  const handleHexClick = useCallback(
    (hexId: string) => {
      if (!gameState || !playerId) return;

      if (gameState.phase === "robber_move") {
        sendAction({ type: "move_robber", hexId });
      }
    },
    [gameState, playerId, sendAction]
  );

  // ゲーム状態がない場合はロビー画面を表示
  if (!gameState) {
    return (
      <Lobby
        publicRooms={publicRooms}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        onJoinPrivateRoom={joinRoom}
        onRefreshRooms={fetchPublicRooms}
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
            <span className="text-sm opacity-80">
              ルーム: {gameState.id}
            </span>
            <button
              onClick={leaveRoom}
              className="px-3 py-1 bg-red-600 rounded text-sm hover:bg-red-700 transition"
            >
              退出
            </button>
          </div>
        </div>
      </header>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-100 border-b border-red-400 text-red-700 px-4 py-2 text-sm text-center">
          {error}
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
            />
          </div>

          {/* 右サイドバー: アクションとチャット */}
          <div className="lg:col-span-1 space-y-4">
            {playerId && (
              <ActionPanel
                gameState={gameState}
                playerId={playerId}
                onAction={sendAction}
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
