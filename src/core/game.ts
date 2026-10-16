// ゲームの状態遷移（reducer）。UI とテスト・シミュレータは必ずここを通して状態を変える。

import { CONFIG } from './config';
import { dateOfDay, yen } from './dates';
import { CATEGORIES, ITEMS, itemDef } from './data/items';
import { RULE_MAP, RULES } from './data/rules';
import { UPGRADE_MAP, difficulty } from './data/schedule';
import { CHARACTERS, LETTERS, STORY_VISITS, type StoryVisit } from './data/story';
import { Rng, hashSeed } from './rng';
import { applyTool, compare } from './systems/appraisal';
import { hadLegalReason, personKey, violations } from './systems/compliance';
import { findLoan, interestOf, processDueLoans, simulateShopSales, updateMarket, wholesalePrice } from './systems/economy';
import {
  assignTell, isSuspicious, makeDoc, makeItem, makeSuspicious, newId, perceivedValue, randomCustomer, randomPerson, repeatCustomer, roundPrice, trueValue,
  type Anomaly,
} from './systems/generate';
import { pointOut, respondToOffer } from './systems/negotiation';
import type {
  Category, Customer, Effects, EndingId, Expense, GameState, Session, ToolId,
} from './types';

export type Action =
  | { type: 'BEGIN_COUNTER' }
  | { type: 'TICK'; minutes: number }
  | { type: 'NEXT_CUSTOMER' }
  | { type: 'USE_TOOL'; tool: ToolId; target: string }
  | { type: 'COMPARE'; a: string; b: string }
  | { type: 'POINT_OUT'; key: string }
  | { type: 'OFFER'; amount: number }
  | { type: 'ACCEPT_REQUEST' }
  | { type: 'REFUSE' }
  | { type: 'REPORT' }
  | { type: 'CHOOSE'; index: number }
  | { type: 'DISMISS' }
  | { type: 'CLOSE_SHOP' }
  | { type: 'TOGGLE_EXPENSE'; id: string }
  | { type: 'PAY_DEBT'; amount: number; target?: 'main' | 'shark' }
  | { type: 'BORROW'; lender: Lender; amount: number }
  | { type: 'SHELVE'; itemId: string; price: number }
  | { type: 'UNSHELVE'; itemId: string }
  | { type: 'WHOLESALE'; itemId: string }
  | { type: 'BUY_UPGRADE'; id: string }
  | { type: 'SET_RATE'; rate: number }
  | { type: 'END_NIGHT' };

export type Lender = 'credit' | 'shark';

export interface Result {
  state: GameState;
  /** 操作できなかったときの理由など、UI に一時表示する文 */
  message?: string;
}

export const SAVE_VERSION = 2;

/** 古いセーブを現在の形式に揃える。読めないものは null */
export function migrate(raw: GameState): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.version === 1) {
    raw.creditBorrowed = 0;
    raw.shark = 0;
    raw.version = 2;
  }
  return raw.version === SAVE_VERSION ? raw : null;
}

export function newGame(seed: number): GameState {
  const market = Object.fromEntries(CATEGORIES.map((c) => [c, 1])) as Record<Category, number>;
  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    rngState: seed,
    day: 0,
    phase: 'morning',
    clock: CONFIG.openMinute,
    money: CONFIG.startMoney,
    debt: CONFIG.startDebt,
    reputation: CONFIG.startReputation,
    conscience: 0,
    violationPoints: 0,
    rate: CONFIG.defaultRate,
    creditBorrowed: 0,
    shark: 0,
    tools: ['loupe', 'scale'],
    upgrades: [],
    queue: [],
    session: null,
    served: 0,
    todayVisitors: [],
    inventory: [],
    loans: [],
    nextTicketNo: 1,
    nextId: 0,
    market,
    stolenList: [],
    flags: {},
    pendingViolations: [],
    ledger: [],
    expenses: [],
    family: { hunger: 0, cold: 0, sick: false, unpaidMedicine: 0, hospitalized: false },
    morning: { headlines: [], notes: [], newRules: [] },
    carryNotes: [],
    scheduled: [],
    overdraft: 0,
    history: [],
  };
  startDay(state);
  return state;
}

export function dispatch(prev: GameState, action: Action): Result {
  const state = structuredClone(prev);
  const rng = new Rng(state.rngState);
  const result = apply(state, rng, action);
  state.rngState = rng.state;
  if (result.message && result.ok === false) return { state: prev, message: result.message };
  return { state, message: result.message };
}

interface Inner {
  ok?: boolean;
  message?: string;
}

const fail = (message: string): Inner => ({ ok: false, message });

function apply(s: GameState, rng: Rng, a: Action): Inner {
  if (s.phase === 'ending') return fail('ゲームは終了している。');
  switch (a.type) {
    case 'BEGIN_COUNTER':
      if (s.phase !== 'morning') return fail('今は開店できない。');
      s.phase = 'counter';
      return {};
    case 'TICK':
      if (s.phase !== 'counter') return {};
      s.clock = Math.min(CONFIG.closeMinute + 60, s.clock + a.minutes);
      return {};
    case 'NEXT_CUSTOMER':
      return nextCustomer(s);
    case 'USE_TOOL':
      return useTool(s, a.tool, a.target);
    case 'COMPARE':
      return doCompare(s, a.a, a.b);
    case 'POINT_OUT':
      return doPoint(s, rng, a.key);
    case 'OFFER':
      return doOffer(s, rng, a.amount);
    case 'ACCEPT_REQUEST':
      return acceptRequest(s);
    case 'REFUSE':
      return refuse(s, rng);
    case 'REPORT':
      return report(s);
    case 'CHOOSE':
      return choose(s, a.index);
    case 'DISMISS':
      if (!s.session?.closed) return fail('まだ応対中だ。');
      s.session = null;
      return {};
    case 'CLOSE_SHOP':
      return closeShop(s);
    case 'TOGGLE_EXPENSE': {
      const e = s.expenses.find((x) => x.id === a.id);
      if (!e || e.mandatory) return fail('この支払いは外せない。');
      e.pay = !e.pay;
      return {};
    }
    case 'PAY_DEBT': {
      if (s.phase !== 'night') return fail('返済は夜に行う。');
      const shark = a.target === 'shark';
      const owed = shark ? s.shark : s.debt;
      const amount = Math.floor(Math.min(a.amount, owed, s.money - committedExpenses(s)));
      if (owed <= 0) return fail('その借金は残っていない。');
      if (amount <= 0) return fail('返済に回せるお金がない。');
      s.money -= amount;
      if (shark) s.shark -= amount;
      else s.debt -= amount;
      s.ledger.push({ label: shark ? '鮫島ファイナンスへ返済' : '借金の繰り上げ返済', amount: -amount });
      return { message: `${yen(amount)} を返済した。` };
    }
    case 'BORROW':
      return borrow(s, a.lender, a.amount);
    case 'SHELVE': {
      const inv = s.inventory.find((i) => i.item.id === a.itemId);
      if (!inv) return fail('その品物はない。');
      if (!inv.shelved && s.inventory.filter((i) => i.shelved).length >= shelfSlots(s)) return fail('陳列枠がいっぱいだ。');
      inv.shelved = true;
      inv.price = Math.max(500, Math.round(a.price / 100) * 100);
      return {};
    }
    case 'UNSHELVE': {
      const inv = s.inventory.find((i) => i.item.id === a.itemId);
      if (inv) inv.shelved = false;
      return {};
    }
    case 'WHOLESALE': {
      if (s.phase !== 'night') return fail('業者への売却は夜に行う。');
      const inv = s.inventory.find((i) => i.item.id === a.itemId);
      if (!inv) return fail('その品物はない。');
      const price = wholesalePrice(s, inv);
      s.inventory = s.inventory.filter((i) => i !== inv);
      s.money += price;
      s.ledger.push({ label: `業者売却：${itemDef(inv.item.defId).name}`, amount: price });
      return { message: `${itemDef(inv.item.defId).name}を ${yen(price)} で業者に売った。${inv.item.authentic ? '' : '（偽物と見抜かれ、二束三文だった）'}` };
    }
    case 'BUY_UPGRADE': {
      const u = UPGRADE_MAP[a.id];
      if (!u || s.upgrades.includes(a.id)) return fail('購入できない。');
      if (s.day < u.availableDay) return fail('まだ手に入らない。');
      if (s.money < u.price) return fail('お金が足りない。');
      s.money -= u.price;
      s.upgrades.push(u.id);
      if (u.tool) s.tools.push(u.tool);
      if (u.id === 'sign') s.reputation = Math.min(100, s.reputation + 5);
      s.ledger.push({ label: `投資：${u.name}`, amount: -u.price });
      return { message: `${u.name}を購入した。` };
    }
    case 'SET_RATE': {
      const max = maxRate(s);
      s.rate = Math.round(Math.min(max, Math.max(0.03, a.rate)) * 100) / 100;
      return {};
    }
    case 'END_NIGHT':
      return endNight(s, rng);
  }
}

/** 追加で借りられる残り枠と、借りられない理由 */
export function borrowLimit(s: GameState, lender: Lender): { room: number; reason?: string } {
  if (lender === 'credit') {
    const room = Math.max(0, CONFIG.creditLimit - s.creditBorrowed);
    if (s.reputation < CONFIG.creditMinReputation) return { room: 0, reason: `評判 ${CONFIG.creditMinReputation} 未満の店には貸せないそうだ。` };
    if (s.violationPoints >= CONFIG.creditMaxViolation) return { room: 0, reason: '違反点の多い店には貸せないそうだ。' };
    if (s.day >= CONFIG.totalDays) return { room: 0, reason: '最終日には貸付できないそうだ。' };
    return { room, reason: room <= 0 ? '融資枠を使い切った。' : undefined };
  }
  const room = Math.max(0, CONFIG.sharkLimit - s.shark);
  return { room, reason: room <= 0 ? 'これ以上は貸さねえ、と言われた。' : undefined };
}

function borrow(s: GameState, lender: Lender, amount: number): Inner {
  if (s.phase === 'ending') return fail('ゲームは終了している。');
  amount = Math.floor(amount / 10_000) * 10_000;
  if (amount <= 0) return fail('借りる額を選んでほしい。');
  const lim = borrowLimit(s, lender);
  if (lim.reason) return fail(lim.reason);
  if (amount > lim.room) return fail(`借りられるのはあと ${yen(lim.room)} までだ。`);
  s.money += amount;
  if (lender === 'credit') {
    const fee = Math.round(amount * CONFIG.creditFee);
    s.creditBorrowed += amount;
    s.debt += amount + fee;
    s.ledger.push({ label: '潮見信用金庫から借入', amount });
    return { message: `信用金庫から ${yen(amount)} を借りた（手数料 ${yen(fee)} は借金に上乗せ）。` };
  }
  s.shark += amount;
  s.ledger.push({ label: '鮫島ファイナンスから借入', amount });
  s.conscience -= amount >= 200_000 ? 1 : 0;
  return { message: `鮫島ファイナンスから ${yen(amount)} を借りた。日利 ${Math.round(CONFIG.sharkDailyRate * 100)}% だ…。` };
}

export function maxRate(s: GameState): number {
  return s.day >= CONFIG.rateCapDay ? CONFIG.maxRateAfterCap : CONFIG.maxRate;
}

export function shelfSlots(s: GameState): number {
  return CONFIG.startShelfSlots + (s.upgrades.includes('showcase') ? 4 : 0);
}

// ---------------------------------------------------------------- 朝

function applyEffects(s: GameState, e: Effects): void {
  if (e.money) {
    s.money += e.money;
    s.ledger.push({ label: e.money > 0 ? '臨時収入' : '臨時出費', amount: e.money });
  }
  if (e.reputation) s.reputation = clamp(s.reputation + e.reputation, 0, 100);
  if (e.conscience) s.conscience += e.conscience;
  if (e.violationPoints) s.violationPoints += e.violationPoints;
  for (const f of e.setFlags ?? []) s.flags[f] = true;
  for (const it of e.addItems ?? []) {
    const rng = new Rng(hashSeed(s.seed, 'story-item', s.nextId));
    const item = makeItem(s, rng, it.defId);
    item.condition = it.condition;
    item.authentic = true;
    item.defects = [];
    item.hiddenDefects = [];
    item.hallmark = itemDef(it.defId).hallmark;
    item.weightG = itemDef(it.defId).weightG;
    item.magnetic = false;
    item.purityOk = true;
    s.inventory.push({ item, acquiredDay: s.day, cost: 0, shelved: false, price: 0, source: 'story' });
  }
  if (e.ending && !s.ending) finish(s, e.ending);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function finish(s: GameState, ending: EndingId): void {
  s.ending = ending;
  s.phase = 'ending';
  s.session = null;
}

export function startDay(s: GameState): void {
  s.day += 1;
  s.phase = 'morning';
  s.clock = CONFIG.openMinute;
  s.served = 0;
  s.todayVisitors = [];
  s.ledger = [];
  s.session = null;
  const rng = new Rng(hashSeed(s.seed, 'day', s.day, s.rngState));
  const notes: string[] = [...s.carryNotes];
  s.carryNotes = [];

  const headlines = updateMarket(s, rng);
  if (s.shark > 0 && s.day > 1) {
    const interest = Math.ceil((s.shark * CONFIG.sharkDailyRate) / 100) * 100;
    s.shark += interest;
    notes.push(`鮫島ファイナンスの利息 ${yen(interest)} が付いた（残高 ${yen(s.shark)}）。`);
    if (s.shark >= 300_000) notes.push('店の前に黒い車が停まっている。鮫島の取り立て屋だ…。');
  }
  if (s.day >= CONFIG.rateCapDay && s.rate > maxRate(s)) {
    s.rate = maxRate(s);
    notes.push(`法改正により、貸付利率を ${Math.round(s.rate * 100)}% に引き下げた。`);
  }

  // 前日の違反の発覚
  for (const v of s.pendingViolations) {
    const rule = RULE_MAP[v.ruleId];
    let chance = v.detectChance;
    if (chance < 1) {
      if (s.flags.kuroda_ally) chance -= 0.15;
      if (s.flags.kuroda_cold) chance += 0.1;
    }
    if (!rng.chance(chance)) continue;
    s.money -= rule.fine;
    s.violationPoints += rule.points;
    s.ledger.push({ label: `罰金：${rule.title}`, amount: -rule.fine });
    notes.push(`【指導票】${v.customerName}との取引が「${rule.title}」違反と判明。罰金 ${yen(rule.fine)}、違反点 +${rule.points}。`);
    if (v.stolenItemId) {
      const before = s.inventory.length;
      s.inventory = s.inventory.filter((i) => i.item.id !== v.stolenItemId);
      const loan = s.loans.find((l) => l.item.id === v.stolenItemId && l.status === 'active');
      if (loan) loan.status = 'forfeited';
      if (before !== s.inventory.length || loan) notes.push('盗品は警察に押収された。');
    }
  }
  s.pendingViolations = [];

  // 予約された出来事（クレーム・補償など）
  for (const e of s.scheduled.filter((x) => x.day === s.day)) {
    notes.push(e.text);
    applyEffects(s, e.effects);
  }
  s.scheduled = s.scheduled.filter((x) => x.day !== s.day);

  // 店頭販売
  const sales = simulateShopSales(s, rng);
  for (const inv of sales.sold) {
    s.ledger.push({ label: `店頭販売：${itemDef(inv.item.defId).name}`, amount: inv.price });
    notes.push(`店頭の${itemDef(inv.item.defId).name}が ${yen(inv.price)} で売れた。`);
    if (!inv.item.authentic && rng.chance(0.7)) {
      s.scheduled.push({
        day: s.day + rng.int(1, 3),
        text: `先日売った${itemDef(inv.item.defId).name}が偽物だとクレームが来た。代金 ${yen(inv.price)} を返金。評判が下がった。`,
        effects: { money: -inv.price, reputation: -6 },
      });
    }
  }
  s.money += sales.revenue;

  // 満期の質札
  const due = processDueLoans(s, rng);
  notes.push(...due.notes);

  // 朝の手紙
  for (const l of LETTERS) {
    if (l.day !== s.day || (l.when && !l.when(s.flags, s.upgrades))) continue;
    notes.push(l.text);
    if (l.effects) applyEffects(s, l.effects);
  }

  // 盗品手配書の更新（5 日で期限切れ）
  s.stolenList = s.stolenList.filter((e) => s.day - e.reportedDay < 5);

  const newRules = RULES.filter((r) => r.unlockDay === s.day).map((r) => `${r.title}：${r.text}`);
  s.morning = { headlines, notes, newRules };

  // 行列
  s.queue = buildQueue(s, rng, due.visitors);

  if (s.violationPoints >= CONFIG.violationLimit) finish(s, 'revoked');
}

function storyCustomer(s: GameState, rng: Rng, v: StoryVisit): Customer {
  const ch = CHARACTERS[v.who];
  const today = dateOfDay(s.day);
  // おとり捜査の客は黒田ではなく見知らぬ人物
  const person = v.sting ? randomPerson(rng, today) : { name: ch.name, birth: ch.birth, address: ch.address, face: { ...ch.face } };
  const docs = [makeDoc(rng, person, 'license', today)];
  if (v.who === 'sanae' || v.who === 'genzo') docs.push(makeDoc(rng, person, 'insurance', today));
  if (v.expiredLicense) docs[0].expiry = dateOfDay(s.day - rng.int(10, 60));
  const c: Customer = {
    id: newId(s, 'c'),
    person,
    docs,
    intent: v.intent,
    personality: v.personality,
    cash: 0,
    ask: 0,
    min: 0,
    patience: 4,
    finance: v.who === 'genzo' ? 0.95 : 0.3,
    greeting: v.greeting,
    storyId: v.id,
    sting: v.sting,
  };
  if (v.item) {
    const item = makeItem(s, rng, v.item.defId, { stolen: v.item.stolen });
    item.condition = v.item.condition;
    item.authentic = true;
    item.hallmark = itemDef(v.item.defId).hallmark;
    item.weightG = itemDef(v.item.defId).weightG;
    item.magnetic = itemDef(v.item.defId).material === 'steel';
    item.purityOk = true;
    if (v.who === 'sanae' || v.who === 'genzo') item.sentimental = 0.4;
    c.item = item;
    const pv = perceivedValue(s, item, c.personality);
    c.ask = roundPrice(pv * (v.askRatio ?? 0.65));
    c.min = roundPrice(pv * (v.minRatio ?? 0.4));
    if (v.item.listStolen && item.serial) s.stolenList.push({ serial: item.serial, defId: item.defId, reportedDay: s.day });
  }
  return c;
}

/** その日の規則・道具で見抜ける「後ろ暗い事情」 */
function availableAnomalies(s: GameState): Anomaly[] {
  const list: Anomaly[] = ['fake', 'fake', 'stolen', 'stolen', 'expired', 'photo'];
  if (s.day >= 2) list.push('photo');
  if (s.day >= 5) list.push('minor_forged');
  if (s.day >= 6) list.push('forged');
  return list;
}

function ensureSuspicious(s: GameState, rng: Rng, queue: Customer[], min: number): void {
  const today = dateOfDay(s.day);
  let count = queue.filter((c) => isSuspicious(c, today)).length;
  const clean = rng.shuffle(queue.filter((c) => !isSuspicious(c, today)));
  const pool = availableAnomalies(s);
  for (const c of clean) {
    if (count >= min) break;
    if (makeSuspicious(s, rng, c, rng.pick(pool))) count += 1;
  }
  for (const c of queue) if (!c.tell) assignTell(rng, c, today);
}

function buildQueue(s: GameState, rng: Rng, loanVisitors: Customer[]): Customer[] {
  const d = difficulty(s.day);
  let n = d.customers + (s.upgrades.includes('sign') ? 2 : 0);
  if (s.reputation >= 70) n += 1;
  if (s.reputation < 30) n -= 2;
  const queue: Customer[] = [];
  for (let i = 0; i < n; i++) queue.push(randomCustomer(s, rng, d));
  ensureSuspicious(s, rng, queue, d.minSuspicious);

  // 盗品はすべて手配書に載せる（＋無関係の手配も混ぜる）
  for (const c of queue) {
    if (c.item?.stolen && c.item.serial) {
      s.stolenList.push({ serial: c.item.serial, defId: c.item.defId, reportedDay: s.day - rng.int(0, 2) });
    }
  }
  const decoys = rng.int(2, 4);
  for (let i = 0; i < decoys; i++) {
    const def = rng.pick(ITEMS.filter((x) => !!x.serialPrefix));
    s.stolenList.push({ serial: `${def.serialPrefix}-${rng.int(10000, 99999)}`, defId: def.id, reportedDay: s.day });
  }
  rng.shuffle(s.stolenList);

  // 変装した再来店
  if (rng.chance(d.repeat * 3) && queue.length > 3) {
    const base = queue[rng.int(0, Math.floor(queue.length / 2) - 1)];
    const rep = repeatCustomer(s, rng, base);
    queue.splice(rng.int(Math.floor(queue.length / 2) + 1, queue.length), 0, rep);
    if (rep.item?.stolen && rep.item.serial) s.stolenList.push({ serial: rep.item.serial, defId: rep.item.defId, reportedDay: s.day });
  }

  // 質札の客は営業時間中に散らばって来る
  for (const v of loanVisitors) queue.splice(rng.int(0, queue.length), 0, v);

  // ストーリー客
  for (const v of STORY_VISITS) {
    if (v.day !== s.day || (v.when && !v.when(s.flags))) continue;
    queue.splice(Math.min(v.position, queue.length), 0, storyCustomer(s, rng, v));
  }
  return queue;
}

// ---------------------------------------------------------------- 窓口

function nextCustomer(s: GameState): Inner {
  if (s.phase !== 'counter') return fail('開店していない。');
  if (s.session && !s.session.closed) return fail('まだ応対中だ。');
  if (s.clock >= CONFIG.closeMinute) return fail('もう閉店時間だ。');
  const c = s.queue.shift();
  if (!c) return fail('もう客はいない。');
  s.session = {
    customer: c,
    revealed: [],
    findings: [],
    pointed: [],
    offers: [],
    ask: c.ask,
    min: c.min,
    patience: c.patience,
    chat: [{ who: 'customer', text: c.greeting }],
    closed: false,
  };
  if (c.tell) s.session.chat.push({ who: 'system', text: c.tell });
  const story = STORY_VISITS.find((v) => v.id === c.storyId);
  if (c.intent === 'special' && story?.lines) for (const line of story.lines) s.session.chat.push({ who: 'customer', text: line });
  if ((c.intent === 'pawn' || c.intent === 'sell') && c.item) {
    s.session.chat.push({ who: 'customer', text: `${itemDef(c.item.defId).name}です。${yen(c.ask)}${c.intent === 'pawn' ? '貸してほしい' : 'で買い取ってほしい'}んですが。` });
  }
  if (c.ticket) {
    s.session.chat.push({ who: 'system', text: `質札 No.${c.ticket.ticketNo}：${c.intent === 'redeem' ? `元利 ${yen(c.ticket.principal + c.ticket.interest)} を支払って請け出し` : `利息 ${yen(c.ticket.interest)} を支払って延長`}` });
  }
  s.served += 1;
  s.clock += CONFIG.greetMinutes;
  return {};
}

function open(s: GameState): Session | null {
  return s.session && !s.session.closed ? s.session : null;
}

function useTool(s: GameState, tool: ToolId, target: string): Inner {
  const ses = open(s);
  if (!ses) return fail('応対中の客がいない。');
  const r = applyTool(s, ses, tool, target);
  if (!r.ok) return fail(r.message);
  s.clock += r.minutes;
  for (const k of r.revealed) if (!ses.revealed.includes(k)) ses.revealed.push(k);
  for (const f of r.findings) if (!ses.findings.some((x) => x.key === f.key)) ses.findings.push(f);
  ses.chat.push({ who: 'system', text: r.message });
  return { message: r.message };
}

function doCompare(s: GameState, a: string, b: string): Inner {
  const ses = open(s);
  if (!ses) return fail('応対中の客がいない。');
  const r = compare(s, ses, a, b);
  if (r.invalid) return fail(r.message);
  s.clock += CONFIG.compareMinutes;
  if (r.finding && !ses.findings.some((x) => x.key === r.finding!.key)) ses.findings.push(r.finding);
  ses.chat.push({ who: 'system', text: (r.match ? '✔ ' : '✖ ') + r.message });
  return { message: r.message };
}

function doPoint(s: GameState, rng: Rng, key: string): Inner {
  const ses = open(s);
  if (!ses) return fail('応対中の客がいない。');
  const f = ses.findings.find((x) => x.key === key);
  if (!f || !f.pointable) return fail('それは指摘できない。');
  if (ses.pointed.includes(key)) return fail('もう指摘した。');
  if (ses.customer.intent !== 'pawn' && ses.customer.intent !== 'sell') return fail('今は値段の話ではない。');
  ses.pointed.push(key);
  s.clock += CONFIG.pointMinutes;
  ses.chat.push({ who: 'player', text: `${f.label.replace(/^.+?：/, '')}…ですね。` });
  const r = pointOut(ses, f, rng);
  ses.chat.push({ who: 'customer', text: r.line });
  if (r.fled) {
    ses.closed = true;
    ses.outcome = 'left';
  }
  return {};
}

function doOffer(s: GameState, rng: Rng, amount: number): Inner {
  const ses = open(s);
  if (!ses) return fail('応対中の客がいない。');
  const c = ses.customer;
  if (c.intent !== 'pawn' && c.intent !== 'sell') return fail('金額を提示する相手ではない。');
  amount = Math.round(amount / 100) * 100;
  if (amount <= 0) return fail('金額を入力してほしい。');
  if (amount > s.money) return fail('手持ちの現金が足りない。');
  s.clock += CONFIG.offerMinutes;
  ses.offers.push(amount);
  ses.chat.push({ who: 'player', text: `${yen(amount)}でどうでしょう。` });
  const r = respondToOffer(ses, amount, rng);
  ses.chat.push({ who: 'customer', text: r.line + (r.kind === 'counter' ? `（${yen(r.ask)}なら…）` : '') });
  if (r.kind === 'leave') {
    ses.closed = true;
    ses.outcome = 'left';
    s.reputation = clamp(s.reputation - 1, 0, 100);
    return {};
  }
  if (r.kind === 'accept') closeDeal(s, ses, amount);
  return {};
}

function closeDeal(s: GameState, ses: Session, amount: number): void {
  const c = ses.customer;
  const item = c.item!;
  const def = itemDef(item.defId);
  ses.closed = true;
  ses.outcome = 'deal';
  ses.dealAmount = amount;
  s.money -= amount;

  const story = STORY_VISITS.find((v) => v.id === c.storyId);
  if (story?.dealFlag) s.flags[story.dealFlag] = true;

  if (c.intent === 'pawn') {
    const term = story?.loanTermDays ?? CONFIG.loanTermDays;
    s.loans.push({
      ticketNo: s.nextTicketNo++,
      customer: { ...c, storyId: story?.who ?? c.storyId },
      item,
      principal: amount,
      rate: s.rate,
      issuedDay: s.day,
      dueDay: s.day + term,
      status: 'active',
      extensions: 0,
      redeemFlag: story?.loanRedeemFlag,
    });
    s.ledger.push({ label: `貸付：${def.name}（${c.person.name}）`, amount: -amount });
    ses.chat.push({ who: 'system', text: `質札 No.${s.nextTicketNo - 1} を発行した。期限は ${term} 日後。` });
  } else {
    s.inventory.push({ item, acquiredDay: s.day, cost: amount, shelved: false, price: 0, source: 'bought' });
    s.ledger.push({ label: `買取：${def.name}（${c.person.name}）`, amount: -amount });
  }

  // 評判と良心
  const fair = c.intent === 'pawn' ? c.min * 1.2 : c.min * 1.15;
  if (amount >= c.ask * 0.9) s.reputation = clamp(s.reputation + 1, 0, 100);
  if (c.personality === 'desperate' && amount < fair * 0.8) s.conscience -= 1;
  if (c.personality === 'desperate' && amount >= c.ask) s.conscience += 1;
  if (item.stolen) s.conscience -= 1;

  for (const rule of violations(s, c.intent, amount, c)) {
    s.pendingViolations.push({
      ruleId: rule.id,
      day: s.day,
      customerName: c.person.name,
      detectChance: c.sting ? 1 : rule.id === 'stolen' && !s.stolenList.some((e) => e.serial === item.serial) ? 0.15 : rule.detectChance,
      stolenItemId: rule.id === 'stolen' ? item.id : undefined,
    });
  }
  s.todayVisitors.push(personKey(c));
}

function acceptRequest(s: GameState): Inner {
  const ses = open(s);
  if (!ses) return fail('応対中の客がいない。');
  const c = ses.customer;
  if (!c.ticket) return fail('この客の用件は請け出し・利払いではない。');
  const loan = findLoan(s, c.ticket.ticketNo);
  if (!loan || loan.status !== 'active') return fail('その質札は無効だ。');
  ses.closed = true;
  ses.outcome = 'deal';
  const name = itemDef(loan.item.defId).name;
  const interest = interestOf(loan);
  if (c.intent === 'redeem') {
    loan.status = 'redeemed';
    loan.pendingVisit = undefined;
    s.money += loan.principal + interest;
    s.ledger.push({ label: `請け出し：${name}（元金）`, amount: loan.principal });
    s.ledger.push({ label: `請け出し：${name}（利息）`, amount: interest });
    ses.chat.push({ who: 'system', text: `${name}を返却し、${yen(loan.principal + interest)} を受け取った。` });
    if (c.impostor) {
      s.scheduled.push({
        day: s.day + 1,
        text: `${loan.customer.person.name}さんが「質札を盗まれた」と店に来た。品物を別人に渡してしまったため、${yen(trueValue(s, loan.item))} を弁償した。`,
        effects: { money: -trueValue(s, loan.item), reputation: -5 },
      });
    } else if (loan.customer.storyId === 'sanae') {
      s.reputation = clamp(s.reputation + 3, 0, 100);
    }
  } else {
    loan.dueDay = s.day + CONFIG.loanTermDays;
    loan.extensions += 1;
    loan.pendingVisit = undefined;
    s.money += interest;
    s.ledger.push({ label: `利息：${name}`, amount: interest });
    ses.chat.push({ who: 'system', text: `利息 ${yen(interest)} を受け取り、期限を ${CONFIG.loanTermDays} 日延長した。` });
  }
  ses.chat.push({ who: 'customer', text: 'ありがとうございました。' });
  for (const rule of violations(s, c.intent, 0, c)) {
    s.pendingViolations.push({ ruleId: rule.id, day: s.day, customerName: c.person.name, detectChance: rule.detectChance });
  }
  return {};
}

function refuse(s: GameState, rng: Rng): Inner {
  const ses = open(s);
  if (!ses) return fail('応対中の客がいない。');
  const c = ses.customer;
  if (c.intent === 'special') return fail('返事を選んでほしい。');
  ses.closed = true;
  ses.outcome = 'refused';
  ses.chat.push({ who: 'player', text: '申し訳ありませんが、お取り引きできません。' });
  const legal = hadLegalReason(s, c);
  if (c.ticket) {
    const loan = findLoan(s, c.ticket.ticketNo);
    if (c.impostor) {
      ses.chat.push({ who: 'customer', text: '…ちっ。' });
      if (loan) loan.dueDay = s.day + 1;
    } else {
      ses.chat.push({ who: 'customer', text: 'どうしてですか！ 私の質札ですよ！' });
      s.reputation = clamp(s.reputation - 4, 0, 100);
      if (loan) loan.dueDay = s.day + 1;
    }
    return {};
  }
  const honest = !!c.item && c.item.authentic && !c.item.stolen;
  if (!legal && honest) {
    ses.chat.push({ who: 'customer', text: rng.pick(['え…どうしてですか？', 'なんだよ、ちゃんとした品なのに。']) });
    if (c.personality === 'desperate') s.conscience -= 1;
  } else {
    ses.chat.push({ who: 'customer', text: rng.pick(['…わかりました。', 'ちっ、他を当たるよ。']) });
  }
  return {};
}

function report(s: GameState): Inner {
  const ses = open(s);
  if (!ses) return fail('応対中の客がいない。');
  const reportable = ses.findings.find((f) => f.reportable);
  if (!reportable) return fail('通報する根拠が見つかっていない。');
  ses.closed = true;
  ses.outcome = 'reported';
  s.money += CONFIG.policeReward;
  s.reputation = clamp(s.reputation + 1, 0, 100);
  s.conscience += 1;
  s.ledger.push({ label: '警察からの謝礼', amount: CONFIG.policeReward });
  if (ses.customer.storyId === 'taka_first') s.flags.taka_reported = true;
  ses.chat.push({ who: 'player', text: '（こっそり警察に電話した）' });
  ses.chat.push({ who: 'system', text: `駆けつけた警官に${ses.customer.person.name}は連れて行かれた。謝礼 ${yen(CONFIG.policeReward)}。` });
  return {};
}

function choose(s: GameState, index: number): Inner {
  const ses = open(s);
  if (!ses) return fail('応対中の客がいない。');
  const story = STORY_VISITS.find((v) => v.id === ses.customer.storyId);
  const ch = story?.choices?.[index];
  if (!ch) return fail('選択肢がない。');
  ses.closed = true;
  ses.outcome = 'choice';
  ses.chat.push({ who: 'player', text: ch.label });
  ses.chat.push({ who: 'customer', text: ch.reply });
  s.clock += 5;
  applyEffects(s, ch.effects);
  return {};
}

// ---------------------------------------------------------------- 閉店・夜

function closeShop(s: GameState): Inner {
  if (s.phase !== 'counter') return fail('開店していない。');
  if (s.session && !s.session.closed) return fail('応対中の客がいる。');
  s.session = null;
  const left = s.queue.length;
  for (const c of s.queue) {
    if (c.ticket) {
      const loan = findLoan(s, c.ticket.ticketNo);
      if (loan) loan.dueDay = s.day + 1;
    }
  }
  if (left > 0) {
    s.reputation = clamp(s.reputation - Math.min(3, Math.ceil(left / 2)), 0, 100);
    s.carryNotes.push(`昨日は ${left} 人の客を待たせたまま閉店した。`);
  }
  s.queue = [];
  s.phase = 'night';
  s.expenses = buildExpenses(s);
  return {};
}

function buildExpenses(s: GameState): Expense[] {
  const list: Expense[] = [
    { id: 'rent', label: '家賃', amount: CONFIG.rent, pay: true, mandatory: true },
    { id: 'food', label: '食費', amount: CONFIG.food, pay: true, mandatory: false },
  ];
  if (s.day >= CONFIG.heatingFromDay + 1) {
    list.push({ id: 'heating', label: '暖房費', amount: s.upgrades.includes('heater') ? Math.round(CONFIG.heating / 2) : CONFIG.heating, pay: true, mandatory: false });
  }
  if (s.family.sick) list.push({ id: 'medicine', label: '祖母の薬代', amount: CONFIG.medicine, pay: true, mandatory: false });
  const inst = CONFIG.installments[s.day];
  if (inst) {
    list.push({ id: 'installment', label: '借金の定期返済', amount: Math.min(inst, s.debt), pay: true, mandatory: true });
  }
  return list.filter((e) => e.amount > 0);
}

export function committedExpenses(s: GameState): number {
  return s.expenses.filter((e) => e.pay).reduce((sum, e) => sum + e.amount, 0);
}

function endNight(s: GameState, rng: Rng): Inner {
  if (s.phase !== 'night') return fail('今は夜ではない。');
  const notes: string[] = [];
  const installment = s.expenses.find((e) => e.id === 'installment');
  if (installment && s.money < committedExpenses(s)) {
    finish(s, 'foreclosed');
    return {};
  }
  for (const e of s.expenses) {
    if (!e.pay) continue;
    s.money -= e.amount;
    s.ledger.push({ label: e.label, amount: -e.amount });
    if (e.id === 'installment') s.debt -= e.amount;
  }

  // 家族
  const paid = (id: string) => s.expenses.some((e) => e.id === id && e.pay);
  const f = s.family;
  f.hunger = paid('food') ? Math.max(0, f.hunger - 1) : f.hunger + 1;
  const heatingDue = s.expenses.some((e) => e.id === 'heating');
  f.cold = !heatingDue || paid('heating') ? Math.max(0, f.cold - 1) : f.cold + 1;
  if (f.sick) {
    if (paid('medicine')) {
      f.sick = false;
      f.unpaidMedicine = 0;
      notes.push('祖母の具合が良くなった。');
    } else {
      f.unpaidMedicine += 1;
      if (f.unpaidMedicine >= 2) {
        s.money -= CONFIG.hospital;
        s.ledger.push({ label: '祖母の入院費', amount: -CONFIG.hospital });
        f.sick = false;
        f.unpaidMedicine = 0;
        f.hospitalized = true;
        s.conscience -= 2;
        notes.push(`祖母の容体が悪化し、入院することになった。入院費 ${yen(CONFIG.hospital)}。`);
      }
    }
  } else if (f.hunger >= 2 || f.cold >= 2 || (heatingDue && rng.chance(0.04))) {
    f.sick = true;
    notes.push('祖母が寝込んでしまった。薬が要る。');
  }
  if (f.hunger >= 1) notes.push('昨夜は家族の食事を抜いた。');
  if (f.cold >= 1) notes.push('昨夜は寒さに震えて眠れなかった。');

  // 強盗（18 日目の夜）
  if (s.day === 18) {
    if (s.upgrades.includes('alarm')) notes.push('深夜、強盗が押し入ろうとしたが、防犯ベルに驚いて逃げていった。');
    else {
      const loss = Math.min(100_000, Math.max(0, Math.round(s.money * 0.25)));
      s.money -= loss;
      notes.push(`深夜、強盗に入られた！ レジの現金 ${yen(loss)} を奪われた。`);
    }
  }

  if (s.day % 7 === 0 && s.violationPoints > 0) {
    s.violationPoints -= 1;
    notes.push('警察の監視が少し緩んだ（違反点 -1）。');
  }

  s.history.push({ day: s.day, money: s.money, debt: s.debt });
  s.carryNotes.push(...notes);

  if (s.money < 0) {
    s.overdraft += 1;
    if (s.overdraft >= 3) {
      finish(s, 'foreclosed');
      return {};
    }
    s.carryNotes.push(`資金がマイナスだ（${s.overdraft}/3 日）。このままでは店がつぶれる。`);
  } else s.overdraft = 0;

  if (s.day >= CONFIG.totalDays) {
    if (s.shark > 0 && s.money > 0) {
      const pay = Math.min(s.money, s.shark);
      s.money -= pay;
      s.shark -= pay;
    }
    if (s.debt > 0 && s.money > 0) {
      const pay = Math.min(s.money, s.debt);
      s.money -= pay;
      s.debt -= pay;
    }
    finish(s, finalEnding(s));
    return {};
  }
  startDay(s);
  return {};
}

export function finalEnding(s: GameState): EndingId {
  if (s.shark > 0) return 'foreclosed';
  if (s.debt <= 0) return s.conscience < 0 || s.reputation < 40 ? 'cold_lender' : 'revival';
  return (s.reputation >= 70 && s.conscience >= 0) || s.flags.donated ? 'town_light' : 'closed';
}
