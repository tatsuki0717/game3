// 質札・店頭販売・相場。

import { CONDITION_FACTOR, CONFIG, DEFECT_FACTOR } from '../config';
import { dateOfDay } from '../dates';
import { CATEGORIES, ITEMS, itemDef } from '../data/items';
import { greetingsFor } from '../data/people';
import { NEWS, difficulty } from '../data/schedule';
import type { Rng } from '../rng';
import type { Customer, DealerLot, DefectId, GameState, InventoryItem, ItemInstance, Loan, Personality } from '../types';
import { makeDoc, makeItem, newId, perceivedValue, randomPerson, roundPrice, trueValue } from './generate';

const REDEEM_BASE: Record<Personality, number> = { regular: 0.65, timid: 0.55, desperate: 0.4, aggressive: 0.45, liar: 0.2 };

export function interestOf(loan: Loan): number {
  return Math.round((loan.principal * loan.rate) / 100) * 100;
}

export function redeemProbability(state: GameState, loan: Loan): number {
  const c = loan.customer;
  if (!loan.item.authentic && c.personality === 'liar') return 0;
  const value = loan.item.authentic ? trueValue(state, loan.item) : perceivedValue(state, loan.item, c.personality);
  const overLent = Math.max(0, loan.principal / Math.max(1, value) - 0.6);
  const p = REDEEM_BASE[c.personality] + 0.25 * (c.finance - 0.5) + loan.item.sentimental - overLent - 2 * (loan.rate - 0.06);
  return Math.min(0.95, Math.max(0.05, p));
}

export interface DueResult {
  visitors: Customer[];
  notes: string[];
}

function loanVisitor(state: GameState, rng: Rng, loan: Loan, intent: 'redeem' | 'pay_interest', impostor: boolean): Customer {
  const today = dateOfDay(state.day);
  const base = loan.customer;
  const person = impostor ? randomPerson(rng, today) : base.person;
  const docs = impostor ? [makeDoc(rng, person, 'license', today)] : base.docs.map((d) => ({ ...makeDoc(rng, person, d.kind, today), idNo: d.idNo, company: d.company }));
  const interest = interestOf(loan);
  const greeting =
    base.storyId === 'sanae' && intent === 'redeem' && !impostor
      ? '店主さん！ 新しい仕事が見つかったんです。待ってくださって、本当にありがとうございました…！'
      : rng.pick(greetingsFor(intent, impostor ? 'liar' : base.personality));
  return {
    id: newId(state, 'c'),
    person,
    docs,
    intent,
    personality: impostor ? 'liar' : base.personality,
    ticket: {
      ticketNo: loan.ticketNo,
      name: base.person.name,
      itemName: itemDef(loan.item.defId).name,
      principal: loan.principal,
      interest,
      dueDay: loan.dueDay,
    },
    cash: intent === 'redeem' ? loan.principal + interest : interest,
    ask: 0,
    min: 0,
    patience: 3,
    finance: base.finance,
    greeting,
    storyId: base.storyId,
    impostor,
  };
}

/** 満期を迎えた質札の処理（朝） */
export function processDueLoans(state: GameState, rng: Rng): DueResult {
  const visitors: Customer[] = [];
  const notes: string[] = [];
  const d = difficulty(state.day);
  for (const loan of state.loans) {
    if (loan.status !== 'active' || loan.dueDay > state.day) continue;
    let outcome: 'redeem' | 'extend' | 'forfeit';
    if (loan.redeemFlag) {
      outcome = state.flags[loan.redeemFlag] ? 'redeem' : 'forfeit';
    } else if (loan.pendingVisit) {
      outcome = loan.pendingVisit;
    } else {
      const p = redeemProbability(state, loan);
      const r = rng.next();
      if (r < p) outcome = 'redeem';
      else if (r < p + (1 - p) * (loan.customer.finance > 0.3 ? 0.45 : 0.15) && loan.extensions < 2) outcome = 'extend';
      else outcome = 'forfeit';
    }
    if (outcome === 'forfeit') {
      loan.status = 'forfeited';
      state.inventory.push({ item: loan.item, acquiredDay: state.day, cost: loan.principal, shelved: false, price: 0, source: 'forfeit' });
      notes.push(`質札 No.${loan.ticketNo}（${itemDef(loan.item.defId).name}）は期限までに請け出されず、質流れになった。`);
      continue;
    }
    loan.pendingVisit = outcome;
    const impostor = outcome === 'redeem' && !loan.customer.storyId && rng.chance(d.impostor * 0.5);
    visitors.push(loanVisitor(state, rng, loan, outcome === 'redeem' ? 'redeem' : 'pay_interest', impostor));
  }
  return { visitors, notes };
}

export function findLoan(state: GameState, ticketNo: number): Loan | undefined {
  return state.loans.find((l) => l.ticketNo === ticketNo);
}

/** 店頭で買い手が感じる価値（偽物も本物に見える） */
export function shopperValue(state: GameState, inv: InventoryItem): number {
  const def = itemDef(inv.item.defId);
  let v = def.basePrice * CONDITION_FACTOR[inv.item.condition] * (state.market[def.category] ?? 1);
  for (const d of [...inv.item.defects, ...inv.item.hiddenDefects]) v *= DEFECT_FACTOR[d];
  return v;
}

export function saleProbability(state: GameState, inv: InventoryItem, ad = state.adToday): number {
  const ratio = inv.price / Math.max(1, shopperValue(state, inv));
  const base = Math.min(0.9, Math.max(0.03, 1.3 - ratio));
  const boost = ad?.id === 'sale' ? CONFIG.adSale.boost : 1;
  return Math.min(0.95, base * (0.8 + state.reputation / 250) * boost);
}

export interface SaleResult {
  sold: InventoryItem[];
  revenue: number;
}

/** 店頭販売（朝に前日の陳列分を精算） */
export function simulateShopSales(state: GameState, rng: Rng): SaleResult {
  const sold: InventoryItem[] = [];
  let revenue = 0;
  for (const inv of state.inventory) {
    if (!inv.shelved || inv.price <= 0) continue;
    if (rng.chance(saleProbability(state, inv))) {
      sold.push(inv);
      revenue += inv.price;
    }
  }
  state.inventory = state.inventory.filter((i) => !sold.includes(i));
  return { sold, revenue };
}

/** 相場の更新：ニュースの倍率 + 小さなランダム変動。1.0 へ緩やかに回帰する。 */
export function updateMarket(state: GameState, rng: Rng): string[] {
  const headlines: string[] = [];
  for (const cat of CATEGORIES) {
    const m = state.market[cat];
    state.market[cat] = Math.round((m + (1 - m) * 0.08 + rng.range(-0.03, 0.03)) * 1000) / 1000;
  }
  for (const n of NEWS.filter((x) => x.day === state.day)) {
    headlines.push(n.headline);
    for (const [cat, f] of Object.entries(n.market ?? {})) {
      state.market[cat as keyof typeof state.market] = Math.round(state.market[cat as keyof typeof state.market] * f * 1000) / 1000;
    }
  }
  return headlines;
}

export function wholesalePrice(state: GameState, inv: InventoryItem): number {
  return Math.round((trueValue(state, inv.item) * CONFIG.wholesaleRate) / 100) * 100;
}

// ---------------------------------------------------------------- 仕入れ・広告・融資

/** 持っている道具で分かる隠れた欠陥（業者の品は道具を持っていれば検品済みとして扱う） */
export function knownHiddenDefects(state: GameState, item: ItemInstance): DefectId[] {
  return item.hiddenDefects.filter((d) => (d === 'broken' && state.tools.includes('tester')) || (d === 'repaired' && state.tools.includes('uv')));
}

/** 店主から見た品物の価値（見えていない欠陥は無いものとして見積もる） */
export function apparentValue(state: GameState, item: ItemInstance): number {
  return trueValue(state, { ...item, hiddenDefects: knownHiddenDefects(state, item) });
}

/** 業者が持ってくる仕入れ品。本物だが、道具が無いと分からない欠陥が混じっていることがある */
export function makeDealerLots(state: GameState, rng: Rng): DealerLot[] {
  const n = CONFIG.dealerLots + (state.reputation >= 70 ? 1 : 0);
  const pool = ITEMS.filter((i) => i.category !== 'blade');
  const lots: DealerLot[] = [];
  for (let i = 0; i < n; i++) {
    // 相場が上がっているカテゴリの品ほど回ってきにくい（業者も高く売りたい）
    const def = rng.weighted(pool, (d) => 1 / Math.pow(d.basePrice / 10_000, 0.3) / (state.market[d.category] ?? 1));
    const item = makeItem(state, rng, def.id);
    item.sentimental = 0;
    const [lo, hi] = CONFIG.dealerPrice;
    const value = apparentValue(state, item);
    // 仕入れてすぐ業者に売り戻して儲からないよう、卸値は業者売却額より必ず高くする
    const floor = Math.ceil((value * CONFIG.wholesaleRate) / 100) * 100 + 500;
    lots.push({ item, price: Math.max(floor, roundPrice(value * rng.range(lo, hi))) });
  }
  return lots;
}

export function bankLimit(state: GameState): number {
  return CONFIG.bankBase + state.reputation * CONFIG.bankPerReputation;
}

export function bankInterest(state: GameState): number {
  return Math.round(((state.bankLoan ?? 0) * CONFIG.bankDailyRate) / 100) * 100;
}

export function adCost(state: GameState): number {
  switch (state.adNext?.id) {
    case 'flyer':
      return CONFIG.adFlyer.price;
    case 'buy':
      return CONFIG.adBuy.price;
    case 'sale':
      return CONFIG.adSale.price;
    default:
      return 0;
  }
}

/** 純資産の内訳（貸付は元金、在庫は業者売却額で評価する） */
export function balanceSheet(state: GameState): { cash: number; loans: number; stock: number; debt: number; bank: number; net: number } {
  const loans = state.loans.filter((l) => l.status === 'active').reduce((a, l) => a + l.principal, 0);
  const stock = state.inventory.reduce((a, i) => a + wholesalePrice(state, i), 0);
  const bank = state.bankLoan ?? 0;
  return { cash: state.money, loans, stock, debt: state.debt, bank, net: state.money + loans + stock - state.debt - bank };
}
