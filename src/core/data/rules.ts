import type { Category, Intent } from '../types';

/** 規則の違反条件。小さな評価器（systems/compliance.ts）で解釈する。 */
export type Cond =
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond }
  | { intentIn: Intent[] }
  | { noValidPhotoId: true }
  | { itemStolen: true }
  | { ageLt: number }
  | { amountGt: number }
  | { outOfTown: true }
  | { docCountLt: number }
  | { categoryIn: Category[] }
  | { repeatToday: true }
  | { lacksDocKind: 'employment' }
  | { ticketMismatch: true }
  | { docConflict: true };

export interface RuleDef {
  id: string;
  unlockDay: number;
  title: string;
  text: string;
  violation: Cond;
  fine: number;
  points: number;
  detectChance: number;
}

const DEALS: Intent[] = ['pawn', 'sell'];

export const RULES: RuleDef[] = [
  {
    id: 'photo_id',
    unlockDay: 1,
    title: '本人確認',
    text: '質入れ・買取には、有効期限内の顔写真付き身分証（運転免許証・旅券）が必要。写真が本人と一致すること。偽造は無効。提示された書類どうしの氏名・生年月日も一致すること。',
    violation: { all: [{ intentIn: DEALS }, { any: [{ noValidPhotoId: true }, { docConflict: true }] }] },
    fine: 10_000,
    points: 1,
    detectChance: 0.45,
  },
  {
    id: 'stolen',
    unlockDay: 1,
    title: '盗品の禁止',
    text: '盗品を受け入れてはならない。警察の盗品手配書を確認し、該当品は通報すること。',
    violation: { all: [{ intentIn: DEALS }, { itemStolen: true }] },
    fine: 30_000,
    points: 3,
    detectChance: 0.6,
  },
  {
    id: 'redeem_holder',
    unlockDay: 4,
    title: '質札の本人確認',
    text: '請け出し・利払いは質札の名義人本人に限る。身分証の氏名と質札の名義を照合すること。',
    violation: { all: [{ intentIn: ['redeem', 'pay_interest'] }, { ticketMismatch: true }] },
    fine: 15_000,
    points: 2,
    detectChance: 0.7,
  },
  {
    id: 'minor',
    unlockDay: 5,
    title: '未成年者との取引禁止',
    text: '18 歳未満の者と取引してはならない。身分証の生年月日で年齢を確認すること。',
    violation: { all: [{ intentIn: DEALS }, { ageLt: 18 }] },
    fine: 20_000,
    points: 2,
    detectChance: 0.6,
  },
  {
    id: 'outsider',
    unlockDay: 8,
    title: '市外居住者の確認',
    text: `住所が潮見市外の者と ¥50,000 を超える取引をする場合、身分証を 2 点以上確認すること。`,
    violation: { all: [{ intentIn: DEALS }, { outOfTown: true }, { amountGt: 50_000 }, { docCountLt: 2 }] },
    fine: 10_000,
    points: 1,
    detectChance: 0.4,
  },
  {
    id: 'blade',
    unlockDay: 10,
    title: '刃物の取扱禁止',
    text: '市条例により、刀剣・刃物類の質入れ・買取を禁止する。',
    violation: { all: [{ intentIn: DEALS }, { categoryIn: ['blade'] }] },
    fine: 25_000,
    points: 2,
    detectChance: 0.7,
  },
  {
    id: 'once_a_day',
    unlockDay: 15,
    title: '同日再取引の禁止',
    text: '同一人物との同日 2 回目の取引を禁止する（盗品の分散持ち込み対策）。変装に注意し、氏名・生年月日で照合すること。',
    violation: { all: [{ intentIn: DEALS }, { repeatToday: true }] },
    fine: 15_000,
    points: 2,
    detectChance: 0.5,
  },
  {
    id: 'employment',
    unlockDay: 20,
    title: '高額取引の在職確認',
    text: '¥100,000 を超える質入れ・買取では、在職証明書を確認すること。',
    violation: { all: [{ intentIn: DEALS }, { amountGt: 100_000 }, { lacksDocKind: 'employment' }] },
    fine: 15_000,
    points: 1,
    detectChance: 0.5,
  },
];

export const RULE_MAP: Record<string, RuleDef> = Object.fromEntries(RULES.map((r) => [r.id, r]));

export function activeRules(day: number): RuleDef[] {
  return RULES.filter((r) => r.unlockDay <= day);
}
