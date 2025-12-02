# Catan-style Board Game MVP

カタン風マルチプレイヤーボードゲームのMVP実装です。

## 技術スタック

- **フロントエンド**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **ゲームサーバー**: Node.js + Socket.io
- **状態管理・スケーリング**: Redis + @socket.io/redis-adapter

## 必要環境

- Node.js 18+
- Redis Server

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定（オプション）

`.env.local` ファイルを作成:

```env
# Socket.io サーバーURL（フロントエンド用）
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001

# Socket.io サーバーポート
SOCKET_PORT=3001

# CORS設定
CORS_ORIGIN=http://localhost:3000

# Redis接続設定
REDIS_URL=redis://localhost:6379
```

## 起動方法

### 開発環境

3つのサービスを起動する必要があります:

#### 1. Redis サーバー

```bash
redis-server
```

#### 2. Socket.io ゲームサーバー（ポート3001）

```bash
npm run dev:server
```

#### 3. Next.js フロントエンド（ポート3000）

```bash
npm run dev:next
```

### 全サービス同時起動

```bash
# Redis が起動済みの状態で
npm run dev
```

### アクセス

ブラウザで http://localhost:3000 を開く

## 機能

### ルーム管理
- **パブリックルーム**: ロビーに一覧表示され、誰でも参加可能
- **プライベートルーム**: ルームIDを知っている人のみ参加可能
- **パスワード保護**: ルームにパスワードを設定可能

### ゲーム
- 3〜4人対応のマルチプレイヤー
- 六角形グリッドのボード
- ダイスロール、開拓地・道の建設
- リアルタイム同期
- チャット機能

### フェーズ
1. **waiting**: プレイヤー待機中
2. **setup**: 初期配置フェーズ
3. **roll_dice**: ダイスロール
4. **main**: メインアクション
5. **finished**: ゲーム終了

## プロジェクト構成

```
├── app/
│   ├── components/
│   │   ├── GameBoard.tsx    # 六角形ボード描画
│   │   └── GameRoom.tsx     # ゲームルームUI・ロビー
│   ├── hooks/
│   │   └── useGameSocket.ts # Socket.io クライアントフック
│   └── page.tsx
├── server/
│   ├── index.ts             # Socket.io サーバー
│   └── game-logic.ts        # ゲームロジック
├── lib/
│   └── redis.ts             # Redis クライアント
├── types/
│   └── game.ts              # 型定義
└── package.json
```

## スケーリング

Redis Pub/Sub を使用した `@socket.io/redis-adapter` により、複数のSocket.ioサーバーインスタンスをスケールアウト可能です。

```
[Client] ─────┐
[Client] ─────┼──→ [Socket.io Server 1] ──┐
[Client] ─────┘                           ├──→ [Redis] ←── 状態永続化
[Client] ─────┐                           │         ↓
[Client] ─────┼──→ [Socket.io Server 2] ──┘    Pub/Sub で
[Client] ─────┘                                 サーバー間同期
```

## ヘルスチェック

Socket.io サーバーのヘルスチェック:

```bash
curl http://localhost:3001/health
```

## MCP サーバー（AI対戦用）

MCPサーバーを使用すると、Claude等のAIがカタンをプレイできます。

### セットアップ

Claude Desktop の設定ファイル（`claude_desktop_config.json`）に以下を追加:

```json
{
  "mcpServers": {
    "catan": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/cc-catado"
    }
  }
}
```

### スタンドアロンモード（AI vs CPU）

| ツール | 説明 |
|--------|------|
| `create_game` | 新しいゲームを作成（AI vs CPU） |
| `start_game` | ゲームを開始 |
| `get_game_state` | 現在の状態を取得 |
| `get_available_actions` | 実行可能なアクションを取得 |
| `roll_dice` | サイコロを振る |
| `build_settlement` | 開拓地を建設 |
| `build_city` | 都市を建設 |
| `build_road` | 道を建設 |
| `move_robber` | 盗賊を移動 |
| `steal_resource` | 資源を奪う |
| `discard_resources` | 資源を破棄 |
| `buy_development_card` | 発展カードを購入 |
| `use_development_card` | 発展カードを使用 |
| `trade_with_bank` | 銀行と交易 |
| `end_turn` | ターン終了 |
| `run_until_my_turn` | CPUターンを自動実行 |

### リモートモード（人間と対戦）

| ツール | 説明 |
|--------|------|
| `remote_connect` | リモートサーバーに接続 |
| `remote_disconnect` | サーバーから切断 |
| `remote_login` | サーバーにログイン |
| `remote_list_rooms` | 公開ルーム一覧を取得 |
| `remote_create_room` | 新しいルームを作成 |
| `remote_join_room` | 既存のルームに参加 |
| `remote_get_state` | ゲーム状態を取得 |
| `remote_get_actions` | 実行可能なアクションを取得 |
| `remote_action` | アクションを実行 |
| `remote_wait_for_turn` | 自分のターンまで待機 |
| `remote_chat` | チャットを送信 |

### 利用可能なリソース

- `catan://rules` - カタンの完全なルール
- `catan://strategy` - 戦略ガイド

### 使い方例

**スタンドアロンモード（AI vs CPU）:**
```
カタンのゲームを作成して、プレイしてみてください。
```

**リモートモード（人間と対戦）:**
```
リモートサーバー http://example.com:3001 に接続して、
「AI対戦部屋」というルームを作成してください。
人間プレイヤーが参加したらゲームを開始します。
```

AIがゲームを作成し、ルールに従ってプレイします。

## ライセンス

MIT
