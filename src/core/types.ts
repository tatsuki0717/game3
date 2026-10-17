// ゲーム全体で使う型定義。core/ は描画に依存しない純粋なロジックだけを置く。

export type Category =
  | 'watch'
  | 'jewelry'
  | 'brand'
  | 'electronics'
  | 'camera'
  | 'instrument'
  | 'kimono'
  | 'antique'
  | 'blade'
  | 'coin';

export type Material = 'gold' | 'platinum' | 'steel' | 'other';
export type Condition = 'S' | 'A' | 'B' | 'C' | 'D';
export type Intent = 'pawn' | 'sell' | 'redeem' | 'pay_interest' | 'special';
export type Personality = 'timid' | 'aggressive' | 'liar' | 'regular' | 'desperate';
export type ToolId = 'loupe' | 'scale' | 'magnet' | 'uv' | 'acid' | 'tester';
export type DefectId = 'scratch' | 'dent' | 'stain' | 'missing_part' | 'broken' | 'repaired';
export type Phase = 'title' | 'morning' | 'counter' | 'night' | 'ending';

export interface ItemDef {
  id: string;
  name: string;
  category: Category;
  emoji: string;
  basePrice: number;
  weightG: number;
  hallmark: string;
  /** シリアル番号の接頭辞。無い品はシリアルなし。 */
  serialPrefix?: string;
  material: Material;
  /** 通電して動作確認できる品（テスター対象） */
  electric?: boolean;
  /** 偽物が出回る率（日ごとの難易度で倍率がかかる） */
  fakeRate: number;
  fakeHallmarks: string[];
  /** 偽物の重量倍率の範囲 */
  fakeWeight: [number, number];
  desc: string;
}

export interface ItemInstance {
  id: string;
  defId: string;
  serial?: string;
  condition: Condition;
  authentic: boolean;
  stolen: boolean;
  weightG: number;
  hallmark: string;
  /** 磁石にくっつくか（金・プラチナの偽物はくっつく） */
  magnetic: boolean;
  /** 試金石で本来の純度が出るか */
  purityOk: boolean;
  /** ルーペで見える傷 */
  defects: DefectId[];
  /** ルーペでは見えない欠陥（テスター・UV で判明） */
  hiddenDefects: DefectId[];
  /** 思い入れ（請け出し確率に加算） */
  sentimental: number;
}

export interface FaceParts {
  gender: 'm' | 'f';
  skin: number;
  hair: number;
  hairColor: number;
  eyes: number;
  brows: number;
  nose: number;
  mouth: number;
  glasses: boolean;
  beard: number;
  wrinkles: boolean;
}

export interface Person {
  name: string;
  birth: string; // YYYY-MM-DD
  address: string;
  face: FaceParts;
}

export type DocKind = 'license' | 'passport' | 'insurance' | 'employment';

export interface IdDoc {
  kind: DocKind;
  idNo: string;
  name: string;
  birth: string;
  address: string;
  expiry: string;
  /** 顔写真（保険証・在職証明には無い） */
  photo?: FaceParts;
  company?: string;
  /** 偽造（UV で透かしが無いことが分かる） */
  forged: boolean;
}

export interface PawnTicketView {
  ticketNo: number;
  name: string;
  itemName: string;
  principal: number;
  interest: number;
  dueDay: number;
}

export interface Customer {
  id: string;
  person: Person;
  docs: IdDoc[];
  intent: Intent;
  personality: Personality;
  item?: ItemInstance;
  /** 請け出し・利払いで提示する質札 */
  ticket?: PawnTicketView;
  /** 支払える額（請け出し・利払い時） */
  cash: number;
  ask: number;
  min: number;
  patience: number;
  /** 経済的余裕 0..1（請け出し確率に影響） */
  finance: number;
  greeting: string;
  storyId?: string;
  /** 警察のおとり（違反は必ず発覚する） */
  sting?: boolean;
  /** 他人の質札を持ってきた */
  impostor?: boolean;
  /** 本日 2 回目の来店（変装） */
  repeat?: boolean;
}

export type FindingKind =
  | 'fake_hallmark'
  | 'fake_weight'
  | 'fake_material'
  | 'fake_purity'
  | 'stolen'
  | 'doc_expired'
  | 'doc_forged'
  | 'photo_mismatch'
  | 'name_mismatch'
  | 'birth_mismatch'
  | 'underage'
  | 'ticket_mismatch'
  | 'defect';

export interface Finding {
  key: string;
  kind: FindingKind;
  label: string;
  /** 交渉で突きつけられるか */
  pointable: boolean;
  /** 通報の根拠になるか */
  reportable: boolean;
}

export interface ChatLine {
  who: 'customer' | 'player' | 'system';
  text: string;
}

export interface Session {
  customer: Customer;
  revealed: string[];
  /** 照合済みの組（"a|b" を辞書順に並べたもの。古いセーブには無い） */
  compared?: string[];
  findings: Finding[];
  pointed: string[];
  offers: number[];
  ask: number;
  min: number;
  patience: number;
  chat: ChatLine[];
  closed: boolean;
  outcome?: 'deal' | 'refused' | 'left' | 'reported' | 'choice';
  dealAmount?: number;
}

export interface InventoryItem {
  item: ItemInstance;
  acquiredDay: number;
  cost: number;
  shelved: boolean;
  price: number;
  source: 'forfeit' | 'bought' | 'story' | 'dealer';
}

/** 夜に古物業者が持ってくる仕入れ品 */
export interface DealerLot {
  item: ItemInstance;
  price: number;
}

export type AdId = 'none' | 'flyer' | 'buy' | 'sale';

/** 翌日の広告（夜に出稿し、翌日に効く） */
export interface AdPlan {
  id: AdId;
  /** 'buy'（高価買取チラシ）で強化するカテゴリ */
  category?: Category;
}

export interface Loan {
  ticketNo: number;
  customer: Customer;
  item: ItemInstance;
  principal: number;
  rate: number;
  issuedDay: number;
  dueDay: number;
  status: 'active' | 'redeemed' | 'forfeited';
  extensions: number;
  /** ストーリー用：このフラグが立っていれば満期に請け出す。立っていなければ流れる */
  redeemFlag?: string;
  /** 来店予定（満期処理で決まった行動。閉店までに応対できなければ翌日に持ち越す） */
  pendingVisit?: 'redeem' | 'extend';
}

export interface StolenEntry {
  serial: string;
  defId: string;
  reportedDay: number;
}

export interface PendingViolation {
  ruleId: string;
  day: number;
  customerName: string;
  detectChance: number;
  stolenItemId?: string;
}

export interface LedgerLine {
  label: string;
  amount: number;
}

export interface Expense {
  id: string;
  label: string;
  amount: number;
  pay: boolean;
  mandatory: boolean;
}

export interface Family {
  hunger: number;
  cold: number;
  sick: boolean;
  unpaidMedicine: number;
  hospitalized: boolean;
}

export interface MorningReport {
  headlines: string[];
  notes: string[];
  newRules: string[];
}

export type EndingId =
  | 'revival'
  | 'cold_lender'
  | 'town_light'
  | 'closed'
  | 'sold'
  | 'arrested'
  | 'revoked'
  | 'foreclosed';

export interface Effects {
  money?: number;
  reputation?: number;
  conscience?: number;
  violationPoints?: number;
  setFlags?: string[];
  ending?: EndingId;
  addItems?: { defId: string; condition: Condition }[];
}

export interface Scheduled {
  day: number;
  text: string;
  effects: Effects;
}

export interface DayLog {
  deals: number;
  reports: number;
  refused: number;
  walkouts: number;
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  day: number;
  phase: Phase;
  clock: number;

  money: number;
  debt: number;
  reputation: number;
  conscience: number;
  violationPoints: number;
  rate: number;

  tools: ToolId[];
  upgrades: string[];

  queue: Customer[];
  session: Session | null;
  served: number;
  todayVisitors: string[];

  inventory: InventoryItem[];
  loans: Loan[];
  nextTicketNo: number;
  nextId: number;

  market: Record<Category, number>;
  stolenList: StolenEntry[];
  flags: Record<string, boolean>;

  pendingViolations: PendingViolation[];
  ledger: LedgerLine[];
  expenses: Expense[];
  family: Family;
  morning: MorningReport;
  /** 次の朝に表示する出来事（夜の処理結果など） */
  carryNotes: string[];
  scheduled: Scheduled[];
  /** 夜の終わりに所持金がマイナスだった連続日数 */
  overdraft: number;
  history: { day: number; money: number; debt: number }[];
  /** 本日の応対結果（夜の日報用。古いセーブには無い） */
  todayLog?: DayLog;
  /** 以下は経営要素の拡張。古いセーブには無いので未定義を初期値として扱う */
  /** 今夜の業者の仕入れ品 */
  dealerLots?: DealerLot[];
  /** 今日に効いている広告と、今夜出稿して翌日に効く広告 */
  adToday?: AdPlan;
  adNext?: AdPlan;
  /** 店員を雇っているか */
  clerk?: boolean;
  /** 信用金庫からの借入残高 */
  bankLoan?: number;
  ending?: EndingId;
}
