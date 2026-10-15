# 03. 技術設計

## 1. 技術スタック

| 用途 | 採用 | 理由 |
|---|---|---|
| 言語 | TypeScript | 型でデータ定義（品物・規則・イベント）を守れる |
| 描画 / 入力 | Phaser 3 | 2D・ドラッグ&ドロップ・シーン管理が揃っている。ブラウザで即配布可能 |
| ビルド | Vite | 高速な開発サーバと HMR |
| テスト | Vitest | ゲームロジックを Node 上でテスト |
| データ | JSON（＋ zod でスキーマ検証） | 品物・客・規則・イベントを非エンジニアでも追加可能に |
| 配布 | Web（itch.io 等）→ 将来 Electron / Tauri で Steam | |

**設計原則**：ゲームロジック（`core/`）は Phaser に一切依存しない純粋な TypeScript とし、描画層（`scenes/`, `ui/`）から分離する。これにより
- ロジックを単体テスト・自動バランスシミュレーションできる
- 将来エンジンを変えても `core/` を流用できる

## 2. ディレクトリ構成

```
game3/
├─ docs/                     企画・設計ドキュメント
├─ data/                     マスターデータ（JSON）
│  ├─ items/                 品目カタログ
│  ├─ customers/             客テンプレート・ストーリー客
│  ├─ rules/                 規則定義
│  ├─ events/                ストーリー・ニュースイベント
│  └─ days/                  日ごとのシナリオ定義
├─ src/
│  ├─ core/                  ★ 純粋ロジック（Phaser 非依存）
│  │  ├─ model/              型定義（Item, Customer, Loan ...）
│  │  ├─ systems/            各システム（下記）
│  │  ├─ rng.ts              シード付き乱数
│  │  ├─ gameState.ts        状態ルート
│  │  └─ actions.ts          状態遷移（reducer）
│  ├─ data/                  JSON ローダ・zod スキーマ
│  ├─ scenes/                Phaser シーン（Title, Morning, Counter, Ledger, Ending）
│  ├─ ui/                    机・書類・道具・ダイアログ等の UI 部品
│  └─ main.ts
├─ tools/
│  └─ simulate.ts            自動プレイによるバランス検証
└─ tests/
```

## 3. 状態管理

単一の `GameState` を **アクション → reducer** で更新する（Redux 風）。

```ts
type Action =
  | { type: 'START_DAY' }
  | { type: 'NEXT_CUSTOMER' }
  | { type: 'USE_TOOL'; tool: ToolId; targetId: string }
  | { type: 'POINT_OUT'; discrepancy: DiscrepancyId }
  | { type: 'OFFER'; amount: number }
  | { type: 'REJECT'; reason?: RejectReason }
  | { type: 'REPORT_TO_POLICE' }
  | { type: 'SET_PRICE'; itemId: string; price: number }
  | { type: 'SEND_TO_AUCTION'; itemId: string }
  | { type: 'PAY_EXPENSE'; expenseId: string; pay: boolean }
  | { type: 'BUY_UPGRADE'; upgradeId: string }
  | { type: 'END_DAY' };

function reduce(state: GameState, action: Action, ctx: Ctx): GameState;
```

- 乱数はすべて `GameState.rngSeed` から派生するシード付き RNG を使い、**同じシード＋同じ操作列なら同じ結果** になるようにする（リプレイ・バグ再現・テストのため）。
- セーブデータ＝`GameState` の JSON シリアライズ（＋バージョン番号でマイグレーション）。

## 4. データモデル

```ts
// 品目マスター（カタログに載る情報）
interface ItemDef {
  id: string;                 // "watch_rolex_sub"
  name: string;
  category: Category;         // 'watch' | 'jewelry' | 'electronics' | 'instrument' | 'kimono' | 'antique' ...
  basePrice: number;
  catalog: {
    weightG: number;
    hallmark?: string;        // 正規刻印
    serialPattern?: string;   // シリアル書式（正規表現）
    features: string[];       // カタログ記載の特徴
  };
  counterfeit?: {             // 偽物が存在する場合の差異候補
    weightDeltaG: [number, number];
    hallmarkVariants: string[];
    magnetic?: boolean;
  };
  sprite: string;
}

// 個体（実際に持ち込まれる 1 品）
interface ItemInstance {
  instanceId: string;
  defId: string;
  serial?: string;
  truth: {                    // ★プレイヤーには見えない
    authentic: boolean;
    condition: 'S' | 'A' | 'B' | 'C' | 'D';
    stolen: boolean;
    actualWeightG: number;
    hallmark?: string;
    defects: DefectId[];
  };
  revealed: Set<FactId>;      // 道具で判明した事実
}

interface IdDocument {
  kind: 'driver_license' | 'health_insurance' | 'passport' | 'residence_card';
  name: string;
  birthDate: GameDate;
  address: string;
  expiry: GameDate;
  photoId: string;            // 顔パーツ ID の組
  forged?: ForgeryFlaw[];     // 偽造の痕跡（UV で判明する透かし欠如など）
}

interface Customer {
  id: string;
  storyId?: string;           // ストーリー客なら紐づく
  face: FaceParts;
  intent: 'pawn' | 'sell' | 'redeem' | 'pay_interest' | 'buy' | 'special';
  documents: IdDocument[];
  items: ItemInstance[];
  personality: 'timid' | 'aggressive' | 'liar' | 'regular' | 'desperate';
  askPrice: number;
  minAcceptable: number;      // 隠し
  patience: number;           // 交渉で減る
  finance: number;            // 請け出し確率に影響
}

interface Loan {               // 質札
  ticketNo: number;
  customerId: string;
  itemInstanceId: string;
  principal: number;
  ratePerPeriod: number;
  issuedOn: GameDate;
  dueOn: GameDate;
  status: 'active' | 'redeemed' | 'extended' | 'forfeited';
}

interface GameState {
  version: number;
  rngSeed: number;
  day: number;
  clock: number;               // 営業時間内の分
  money: number;
  debt: number;
  reputation: number;
  violationPoints: number;
  conscience: number;          // 隠し
  appraisalLevel: number;
  tools: ToolId[];
  upgrades: UpgradeId[];
  activeRules: RuleId[];
  queue: Customer[];
  current?: CounterSession;    // 今応対中の客・机の上の物・交渉状態
  inventory: InventoryItem[];
  loans: Loan[];
  market: Record<Category, number>;   // 相場係数
  flags: Record<string, boolean | number>;
  log: LedgerEntry[];          // 当日の取引記録
  pendingCitations: Citation[];
}
```

## 5. システム一覧（`src/core/systems/`）

| システム | 責務 | 主な関数 |
|---|---|---|
| `CustomerGenerator` | 日次シナリオ＋テンプレートから客の行列を生成。偽物・盗品・偽造の混入率は日ごとの難易度テーブルで制御 | `generateQueue(day, state, rng)` |
| `AppraisalSystem` | 道具使用で `revealed` に事実を追加し、所要時間を返す | `useTool(tool, target) → {facts, minutes}` |
| `DiscrepancySystem` | 書類同士・品物とカタログ間の不一致を判定（照合モードの中身） | `compare(a, b) → Discrepancy \| null` |
| `NegotiationSystem` | 提示額に対する客の反応を決定 | `respond(customer, offer, pointedOut) → Reaction` |
| `ComplianceSystem` | 有効な規則に対して取引を評価し、違反を記録。発覚判定は夜に実施 | `evaluate(tx, rules) → Violation[]` |
| `LoanSystem` | 質札発行・満期処理・請け出し/延長/質流れ判定 | `issue()`, `processDue(day)` |
| `MarketSystem` | ニュースイベントから相場係数を更新 | `applyNews(news)` |
| `InventorySystem` | 陳列・店頭販売シミュレーション・オークション | `simulateShopSales(day)`, `auction()` |
| `FinanceSystem` | 日次収支、固定費、借金返済 | `closeBooks(state)` |
| `StoryDirector` | 日付・フラグ・閾値条件でイベントを発火 | `pollEvents(state) → Event[]` |
| `EndingResolver` | 最終日・ゲームオーバー時のエンディング決定 | `resolve(state) → EndingId` |

### 5.1 規則のデータ駆動化

規則は「条件式」と「違反時ペナルティ」を JSON で記述し、`ComplianceSystem` が汎用的に評価する。

```json
{
  "id": "minor_prohibited",
  "unlockDay": 4,
  "text": "18歳未満の者とは取引してはならない。",
  "appliesTo": ["pawn", "sell", "buy"],
  "violation": { "if": { "customerAgeLt": 18 } },
  "penalty": { "fine": 20000, "points": 2 },
  "detectChance": 0.6
}
```

条件ノードの種類（`customerAgeLt`, `documentExpired`, `itemStolen`, `itemCategoryIn`, `amountGt`, `addressNotIn`, `documentCountLt`, `and`, `or`, `not` …）を小さな評価器として実装し、組み合わせで新ルールを追加できるようにする。

### 5.2 請け出し判定（例）

```
p(請け出し) = clamp( base[personality]
                   + k1 * (finance / principal)
                   + k2 * (itemSentimentalValue)
                   - k3 * (principal / trueValue - 0.6) , 0, 1 )
```

「真の価値より高く貸しすぎるほど、客は品物を流す」という経済的に合理的な挙動を式で表現する。

### 5.3 イベント定義

```json
{
  "id": "sanae_week2",
  "trigger": { "day": 8, "flag": "sanae_met" },
  "customer": "story/sanae",
  "dialogue": "dialogue/sanae_week2",
  "choices": [
    { "label": "相場どおり査定する", "effects": {} },
    { "label": "少し色をつける", "effects": { "money": -5000, "conscience": 2, "flag:sanae_trust": 1 } }
  ]
}
```

## 6. シーン構成（Phaser）

```
TitleScene → MorningScene（新聞・通達・規則帳更新・陳列）
          → CounterScene（窓口：メインゲーム）
          → LedgerScene（帳簿・収支・投資・イベント）
          → [翌日 MorningScene] / EndingScene
```

- `CounterScene` は `core` の状態を購読して描画するだけにし、ユーザ操作は必ず `Action` として dispatch する。
- 机の上の物（書類・品物）は `DeskObject` 共通クラス：ドラッグ、前面化、拡大表示（ルーペ）、照合モード時のハイライトを持つ。

## 7. テスト・検証戦略

1. **単体テスト**：各 system の純粋関数（規則評価、利息計算、交渉反応、請け出し確率）。
2. **シナリオテスト**：シード固定で 1 日分のアクション列を流し、最終状態をスナップショット比較。
3. **バランスシミュレーション**（`tools/simulate.ts`）：
   「全部検査する慎重 AI」「何も見ずに即決する AI」「買い叩き AI」などのボットで 30 日を数千回回し、完済率・平均資金推移・違反数を出力。どの戦略も極端に強くならないよう調整する。
4. **データ検証**：起動時と CI で全 JSON を zod スキーマで検証。

## 8. 開発マイルストーン

| # | マイルストーン | 内容 | 完了条件 |
|---|---|---|---|
| M0 | 環境構築 | Vite + TS + Phaser + Vitest、CI | 空画面が表示されテストが走る |
| M1 | コアロジック | GameState / reducer / RNG / 規則評価 / 質札 / 収支 | テストで 1 日を回せる（UI なし） |
| M2 | 窓口プロトタイプ | 机・ドラッグ・ルーペ・天秤・身分証照合・金額提示 | Day 1〜3 を仮素材で遊べる |
| M3 | 経営ループ | 夜の帳簿、店頭販売、オークション、相場 | 7 日間通しで遊べる（縦切り完成） |
| M4 | バランス | シミュレータ、数値調整、難易度カーブ | 外部プレイテスト実施 |
| M5 | コンテンツ | 30 日分シナリオ、ストーリー客、エンディング | 本編完走可能 |
| M6 | 仕上げ | アート差し替え、サウンド、演出、ローカライズ（英語） | リリース候補 |

## 9. 今後決めること（オープン課題）

- アートスタイル最終決定（ドット絵 or イラスト）
- 1 日の実時間（6 分 / 8 分）と客数のバランス
- 本作の「質流れ期限」をゲーム内で何日にするか（短いほど結果が早く返り、長いほど資金繰りが苦しくなる）
- 重いテーマ（貧困・犯罪）の描写の度合いとレーティング
