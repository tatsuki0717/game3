// 自動プレイによるバランス検証。
//   npm run simulate -- [runs] [strategy]
// strategy: careful（道具で調べる） / manager（careful＋仕入れ・広告・店員・融資を使う） / naive（何も見ずに希望額で即決）

import { CONFIG } from '../src/core/config';
import { committedExpenses, dispatch, newGame, shelfSlots, type Action } from '../src/core/game';
import { hadLegalReason } from '../src/core/systems/compliance';
import { apparentValue, bankLimit, shopperValue } from '../src/core/systems/economy';
import { trueValue } from '../src/core/systems/generate';
import type { GameState, ToolId } from '../src/core/types';

type Strategy = 'careful' | 'manager' | 'naive';

function act(s: GameState, a: Action): GameState {
  return dispatch(s, a).state;
}

function reserve(s: GameState): number {
  const next = Object.entries(CONFIG.installments).map(([d, v]) => [Number(d), v]).find(([d]) => d >= s.day);
  const base = 20_000;
  if (!next) return base;
  const daysLeft = next[0] - s.day;
  return base + next[1] * Math.max(0, 1 - daysLeft / 6);
}

function handleCustomer(s: GameState, strategy: Strategy): GameState {
  const ses = s.session!;
  const c = ses.customer;
  s = act(s, { type: 'TICK', minutes: strategy === 'naive' ? 2 : 5 });
  if (c.intent === 'special') return act(s, { type: 'CHOOSE', index: c.storyId === 'taka_offer' || c.storyId === 'kanemori_final' || c.storyId === 'genzo_key' ? (c.storyId === 'genzo_key' ? 0 : 1) : 0 });
  if (c.ticket) {
    const bad = strategy === 'naive' ? false : c.impostor;
    return act(s, bad ? { type: 'REFUSE' } : { type: 'ACCEPT_REQUEST' });
  }
  if (strategy !== 'naive') {
    for (const tool of s.tools as ToolId[]) s = act(s, { type: 'USE_TOOL', tool, target: 'item' });
    if (s.tools.includes('uv')) s = act(s, { type: 'USE_TOOL', tool: 'uv', target: 'doc.0' });
    for (const [a, b] of [['item.hallmark', 'catalog.hallmark'], ['item.weight', 'catalog.weight'], ['item.magnetic', 'catalog.material']]) {
      s = act(s, { type: 'COMPARE', a, b });
    }
    for (const e of s.stolenList) if (e.defId === c.item?.defId) s = act(s, { type: 'COMPARE', a: 'item.serial', b: `stolen.${e.serial}` });
  }
  const cur = () => s.session!;
  if (cur().closed) return s;
  const tv = trueValue(s, c.item!);
  const bad = !c.item!.authentic || c.item!.stolen || hadLegalReason(s, c);
  if (strategy !== 'naive' && bad) {
    if (cur().findings.some((f) => f.reportable)) return act(s, { type: 'REPORT' });
    return act(s, { type: 'REFUSE' });
  }
  if (strategy === 'naive') {
    if (cur().ask > s.money) return act(s, { type: 'REFUSE' });
    return act(s, { type: 'OFFER', amount: cur().ask });
  }
  for (const f of cur().findings) if (f.pointable && !cur().closed) s = act(s, { type: 'POINT_OUT', key: f.key });
  if (c.intent === 'pawn' && s.day + CONFIG.loanTermDays > CONFIG.totalDays) return act(s, { type: 'REFUSE' });
  const target = c.intent === 'pawn' ? tv * 0.6 : tv * 0.5;
  let offer = Math.min(cur().ask, target * 0.8);
  for (let i = 0; i < 4 && !cur().closed; i++) {
    if (offer > target || offer > s.money - reserve(s)) return act(s, { type: 'REFUSE' });
    s = act(s, { type: 'OFFER', amount: Math.max(100, offer) });
    offer = Math.min(cur().ask, offer * 1.15);
  }
  if (!cur().closed) s = act(s, { type: 'REFUSE' });
  return s;
}

function night(s: GameState, strategy: Strategy): GameState {
  // 古い在庫は業者へ、残りは陳列
  for (const inv of [...s.inventory]) {
    if (!inv.item.authentic || s.day - inv.acquiredDay >= 4 || s.day >= CONFIG.totalDays) s = act(s, { type: 'WHOLESALE', itemId: inv.item.id });
  }
  for (const inv of s.inventory) {
    if (s.inventory.filter((i) => i.shelved).length >= shelfSlots(s) && !inv.shelved) break;
    s = act(s, { type: 'SHELVE', itemId: inv.item.id, price: Math.round(shopperValue(s, inv) * 0.85) });
  }
  for (const id of ['magnet', 'tester', 'uv', 'acid', 'showcase', 'alarm', 'sign']) {
    if (s.money > 200_000 + reserve(s)) s = act(s, { type: 'BUY_UPGRADE', id });
  }
  if (strategy === 'manager') s = manage(s);
  if (s.day >= 29) s = act(s, { type: 'PAY_DEBT', amount: s.money - 30_000 });
  if (process.env.TRACE) {
    const sum: Record<string, number> = {};
    for (const l of s.ledger) {
      const k = l.label.split('：')[0];
      sum[k] = (sum[k] ?? 0) + l.amount;
    }
    const loans = s.loans.filter((l) => l.status === 'active').reduce((a, l) => a + l.principal, 0);
    const inv = s.inventory.reduce((a, i) => a + trueValue(s, i.item), 0);
    const deals = Object.keys(sum).length;
    console.log(`day ${s.day} money ${s.money} loans ${loans} inv ${inv}(${s.inventory.length}, shelved ${s.inventory.filter((i) => i.shelved).length}) worth ${s.money + loans + inv - s.debt} served ${s.served} ${deals}`, sum);
  }
  return act(s, { type: 'END_NIGHT' });
}

function manage(s: GameState): GameState {
  // 割安な仕入れ品を空いた陳列枠に並べる
  for (const lot of [...(s.dealerLots ?? [])]) {
    const room = shelfSlots(s) - s.inventory.filter((i) => i.shelved).length;
    if (room <= 0 || lot.price > apparentValue(s, lot.item) * 0.7 || s.money - lot.price < reserve(s) + 80_000) continue;
    s = act(s, { type: 'BUY_LOT', itemId: lot.item.id });
    const inv = s.inventory.find((i) => i.item.id === lot.item.id);
    if (inv) s = act(s, { type: 'SHELVE', itemId: inv.item.id, price: Math.round(shopperValue(s, inv) * 0.85) });
  }
  if (!s.clerk && s.day >= 5 && s.money > reserve(s) + 100_000) s = act(s, { type: 'HIRE_CLERK' });
  if (s.day < 29 && s.money > reserve(s) + 40_000) s = act(s, { type: 'SET_AD', ad: { id: 'flyer' } });
  // 定期返済に足りなければつなぎ融資、余裕があれば返す
  const short = committedExpenses(s) - s.money;
  if (short > 0 && bankLimit(s) > (s.bankLoan ?? 0)) s = act(s, { type: 'BORROW', amount: short + 1000 });
  if ((s.bankLoan ?? 0) > 0 && s.money - committedExpenses(s) > reserve(s)) s = act(s, { type: 'REPAY_BANK', amount: s.money - committedExpenses(s) - reserve(s) });
  return s;
}

export function playthrough(seed: number, strategy: Strategy): GameState {
  let s = newGame(seed);
  let guard = 0;
  while (s.phase !== 'ending' && guard++ < 10_000) {
    if (s.phase === 'morning') s = act(s, { type: 'BEGIN_COUNTER' });
    else if (s.phase === 'counter') {
      if (s.session && s.session.closed) {
        if (process.env.TRACE) {
          const c = s.session.customer;
          const tv = c.item ? trueValue(s, c.item) : 0;
          console.log(`  ${c.intent} ${c.personality} ${s.session.outcome} ask=${c.ask} min=${c.min} tv=${tv} deal=${s.session.dealAmount ?? '-'} fake=${c.item && !c.item.authentic} stolen=${c.item?.stolen} legal=${hadLegalReason(s, c)}`);
        }
        s = act(s, { type: 'DISMISS' });
      }
      else if (s.queue.length > 0 && s.clock < CONFIG.closeMinute) {
        s = act(s, { type: 'NEXT_CUSTOMER' });
        s = handleCustomer(s, strategy);
      } else s = act(s, { type: 'CLOSE_SHOP' });
    } else if (s.phase === 'night') s = night(s, strategy);
  }
  return s;
}

if (!process.env.VITEST) {
  const args = process.argv.slice(2).filter((a) => a !== '--' && !a.endsWith('.ts'));
  const runs = Number(args[0] ?? 200);
  const strategies: Strategy[] = args[1] ? [args[1] as Strategy] : ['careful', 'manager', 'naive'];
  for (const strategy of strategies) {
    const endings: Record<string, number> = {};
    let finalDay = 0;
    let debtLeft = 0;
    let money = 0;
    let points = 0;
    for (let i = 0; i < runs; i++) {
      const s = playthrough(1000 + i, strategy);
      endings[s.ending ?? 'none'] = (endings[s.ending ?? 'none'] ?? 0) + 1;
      finalDay += s.day;
      debtLeft += s.debt;
      money += s.money;
      points += s.violationPoints;
    }
    console.log(`\n[${strategy}] runs=${runs}`);
    console.log('  endings:', endings);
    console.log(`  avg final day ${(finalDay / runs).toFixed(1)}, avg debt left ${Math.round(debtLeft / runs)}, avg money ${Math.round(money / runs)}, avg violation pts ${(points / runs).toFixed(1)}`);
  }
}
