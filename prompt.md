# 役割
あなたはリアルタイムWebゲーム開発のスペシャリストであるシニアフルスタックエンジニアです。
以下の要件に基づき、「カタン（Catan）」風のボードゲームのMVP（Minimum Viable Product）を作成するためのアーキテクチャ設計とコア実装コードを提示してください。

# プロジェクト概要
ブラウザで動作するマルチプレイヤー型のボードゲームです。
将来的なユーザー増加（スケールアウト）を見据え、ステートフルなWebSocketサーバーとRedisを活用した構成にします。

# 技術スタック
- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS
- **Game/Socket Server:** Node.js (Custom Server or Separate Service)
- **Communication:** Socket.io (Client & Server)
- **Scaling/State:** Redis (Pub/Sub & Key-Value Store)
- **Library:** `@socket.io/redis-adapter` (インスタンス間通信用)

# 機能要件
1. **プレイ人数:** 1つのルームにつき3〜4人でプレイ可能。
2. **ルーム管理:** ユーザーは「ルーム作成」または「ルームID入力による参加」ができる。
3. **リアルタイム通信:** 盤面の操作、サイコロの結果、チャットなどはWebSocketで即時同期する。
4. **スケーラビリティ:** 複数のサーバーインスタンスが立ち上がっても、Redis Pub/Subを通じて異なるインスタンスに接続されたユーザー同士が通信できるようにする。

# 実装すべき主要コンポーネントとロジック

## 1. データ構造 (TypeScript Interfaces)
六角形グリッド（Hex Grid）を表現するためのデータモデルを定義してください。
- `GameState`: 盤面情報、現在のターン、各プレイヤーの資源などを保持。
- `Hex`: 座標（q, r, sのキューブ座標推奨）、資源タイプ、数値トークン。
- `Intersection`: 開拓地/都市を配置する頂点。
- `Edge`: 道を配置する辺。

## 2. サーバーサイド実装 (Socket.io + Redis)
`server.ts` (または同等のエントリーポイント) のコードを書いてください。
- Redis Adapterを設定し、複数インスタンスでの動作を保証する。
- `join_room`: ルームへの参加とRedisへの状態保存。
- `game_action`: クライアントからのアクションを受け取り、サーバー側でロジックを検証した後、`update_state`をルーム全員にemitする。
- ゲームの状態（GameState）はメモリ上だけでなく、アクションごとにRedisに保存（永続化）する処理を含める。

## 3. クライアントサイド実装 (Next.js)
- `useSocket` カスタムフック: 接続管理とイベントリスナーの登録。
- `GameBoard` コンポーネント: 受信した `GameState` を基に盤面（簡易的なUIで可）を描画する。

# 制約事項
- コードはTypeScriptで記述すること。
- エラーハンドリング（Redis接続エラーなど）を考慮すること。
- Next.jsのEdge RuntimeとNode.js Runtimeの役割分担を明確にすること（WebSocketサーバーはNode.js環境で動く前提で良い）。

# 出力成果物
以下のファイル構造と、主要ファイルの具体的なコードを提示してください。
1. `types/game.ts` (型定義)
2. `server/index.ts` (Socket.io + Redisサーバー)
3. `lib/redis.ts` (Redisクライアント設定)
4. `app/hooks/useGameSocket.ts` (クライアント側フック)
5. `app/components/GameRoom.tsx` (メインコンポーネント)
