# AI リアクション RAG 実装アイデア

## 概要

他プレイヤーのアクションに対してAIがリアクション（つぶやき）を返す機能を、LLM APIを使わずにRAG（Retrieval-Augmented Generation）で実現するアイデア。

## 現状

- AIの自分のターン時: LLM（Gemini/OpenRouter）が`thinking`を生成
- 他プレイヤーのターン時: リアクションなし（ランダムテンプレートは削除済み）

## RAG方式の提案

### フロー

```
1. 事前準備
   - シチュエーション + リアクションのペアを作成
   - 各シチュエーションをEmbedding APIでベクトル化
   - ベクトルDBに保存

2. 実行時
   - GameState + Action → テキスト化
   - Embedding APIでベクトル化
   - ベクトルDBで類似検索
   - マッチしたリアクションを返す
```

### データ例

```json
[
  {
    "situation": "他のプレイヤーがサイコロで7を出した",
    "context": { "diceTotal": 7 },
    "reactions": ["うわ、7だ！", "盗賊か...", "やられた"]
  },
  {
    "situation": "他のプレイヤーが都市を建設した",
    "context": { "action": "build_city" },
    "reactions": ["都市！強くなってきた", "負けてられない", "すごいな"]
  },
  {
    "situation": "他のプレイヤーが自分の近くに開拓地を建てた",
    "context": { "action": "build_settlement", "nearMe": true },
    "reactions": ["ここに来るか...", "先を越された", "邪魔だな"]
  }
]
```

## ベクトルDB候補

### 1. Redis Stack (推奨)

このプロジェクトは既にRedisを使用しているため、追加のインフラ不要。

```typescript
// Redis Stackのベクトル検索
import { createClient } from 'redis';

// インデックス作成
await client.ft.create('idx:reactions', {
  '$.embedding': {
    type: SchemaFieldTypes.VECTOR,
    ALGORITHM: 'HNSW',
    TYPE: 'FLOAT32',
    DIM: 1536,  // OpenAI embedding dimension
    DISTANCE_METRIC: 'COSINE'
  }
}, { ON: 'JSON', PREFIX: 'reaction:' });

// 検索
const results = await client.ft.search('idx:reactions',
  `*=>[KNN 3 @embedding $vec AS score]`,
  { PARAMS: { vec: queryVector }, DIALECT: 2 }
);
```

**メリット:**
- 既存インフラ活用
- 追加コストなし
- 低レイテンシ

**デメリット:**
- Redis Stackへのアップグレードが必要（通常のRedisでは不可）

### 2. Supabase Vector

PostgreSQL + pgvector。Supabaseなら無料枠あり。

```typescript
const { data } = await supabase.rpc('match_reactions', {
  query_embedding: embedding,
  match_threshold: 0.8,
  match_count: 3
});
```

### 3. Pinecone

マネージドサービス。無料枠あり（100k vectors）。

```typescript
const index = pinecone.Index('reactions');
const results = await index.query({
  vector: embedding,
  topK: 3,
  includeMetadata: true
});
```

### 4. Chroma

ローカルで動作、シンプル。開発/テスト向き。

```typescript
const collection = await client.getCollection({ name: 'reactions' });
const results = await collection.query({
  queryEmbeddings: [embedding],
  nResults: 3
});
```

### 5. Qdrant

Rust製、高速。Dockerで簡単にセルフホスト。

```typescript
const results = await qdrantClient.search('reactions', {
  vector: embedding,
  limit: 3
});
```

## Embedding API候補

| プロバイダー | モデル | 次元数 | コスト |
|------------|--------|--------|--------|
| OpenAI | text-embedding-3-small | 1536 | $0.02/1M tokens |
| OpenAI | text-embedding-3-large | 3072 | $0.13/1M tokens |
| Cohere | embed-english-v3.0 | 1024 | 無料枠あり |
| Google | textembedding-gecko | 768 | 無料枠あり |
| Voyage AI | voyage-2 | 1024 | $0.10/1M tokens |

## 実装ステップ（案）

1. **データ準備**
   - シチュエーション + リアクションのJSONを作成（50-100ペア程度）
   - カタンの典型的な状況をカバー

2. **Embeddingスクリプト**
   - シチュエーションテキストをEmbedding
   - Redis Stackに保存

3. **検索API**
   - GameState + Action → シチュエーションテキスト生成
   - Embedding → 類似検索
   - リアクションを返す

4. **サーバー統合**
   - `handleGameAction`でリアクション検索を呼び出し
   - `ai_thinking`イベントで送信

## コスト試算

- 1ゲーム = 約100アクション
- 各アクションでEmbedding = 100 tokens程度
- 1ゲーム = 10,000 tokens = $0.0002（OpenAI small）

→ 非常に低コスト

## 注意点

- Embedding APIのレイテンシ（50-200ms）を考慮
- キャッシュの活用（同じシチュエーションは再利用）
- Redis Stack未対応の場合は別のDBを検討

## 参考リンク

- [Redis Vector Similarity](https://redis.io/docs/stack/search/reference/vectors/)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
- [Supabase Vector](https://supabase.com/docs/guides/ai/vector-columns)
