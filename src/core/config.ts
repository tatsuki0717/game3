// バランス調整用の定数をここに集約する。

export const CONFIG = {
  totalDays: 30,
  startDate: '1991-11-01',
  town: '潮見市',

  openMinute: 9 * 60,
  closeMinute: 18 * 60,

  startMoney: 300_000,
  startDebt: 1_000_000,
  startReputation: 50,
  /** 定期返済（日 → 金額）。残りは 30 日目の夜に一括 */
  installments: { 7: 80_000, 14: 120_000, 21: 160_000, 28: 240_000 } as Record<number, number>,

  loanTermDays: 5,
  defaultRate: 0.1,
  maxRate: 0.15,
  maxRateAfterCap: 0.09,
  rateCapDay: 12,

  violationLimit: 10,
  startShelfSlots: 6,

  /** 来店 1 人あたりの基本応対時間（分） */
  greetMinutes: 6,
  offerMinutes: 3,
  pointMinutes: 2,
  compareMinutes: 1,

  wholesaleRate: 0.65,
  policeReward: 10_000,

  rent: 5_000,
  food: 3_000,
  heating: 2_500,
  heatingFromDay: 10,
  medicine: 8_000,
  hospital: 50_000,

  /** 業者の仕入れ品：1 晩の点数と、見えている価値に対する卸値の範囲（業者売却 65% より必ず高い） */
  dealerLots: 3,
  dealerPrice: [0.68, 0.85] as [number, number],

  /** 広告（翌日に効く） */
  adFlyer: { price: 6_000, customers: 3 },
  adBuy: { price: 8_000, customers: 2, share: 0.5 },
  adSale: { price: 5_000, boost: 1.35 },

  /** 店員：日給。質札の用件（請け出し・利払い）を代わりに応対する。偽の名義人を見逃す率 */
  clerkWage: 4_000,
  clerkMissImpostor: 0.4,

  /** 信用金庫の融資：上限（基本＋評判 1 あたり）と日利 */
  bankBase: 50_000,
  bankPerReputation: 3_000,
  bankDailyRate: 0.01,
} as const;

export const CONDITION_FACTOR: Record<string, number> = {
  S: 1.0,
  A: 0.85,
  B: 0.7,
  C: 0.5,
  D: 0.3,
};

export const CONDITION_LABEL: Record<string, string> = {
  S: 'S（新品同様）',
  A: 'A（美品）',
  B: 'B（使用感あり）',
  C: 'C（難あり）',
  D: 'D（ジャンク）',
};

export const DEFECT_LABEL: Record<string, string> = {
  scratch: '目立つ傷',
  dent: '打痕・へこみ',
  stain: 'シミ・汚れ',
  missing_part: '部品欠品',
  broken: '動作不良',
  repaired: '素人修理の痕',
};

/** 欠陥 1 つあたりの価値の減り方 */
export const DEFECT_FACTOR: Record<string, number> = {
  scratch: 0.9,
  dent: 0.85,
  stain: 0.85,
  missing_part: 0.75,
  broken: 0.4,
  repaired: 0.7,
};

export const FAKE_VALUE_FACTOR = 0.03;
