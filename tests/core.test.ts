import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { ageOn, dateOfDay, toWareki } from '../src/core/dates';
import { itemDef } from '../src/core/data/items';
import { RULE_MAP } from '../src/core/data/rules';
import { committedExpenses, dispatch, newGame, type Action } from '../src/core/game';
import { Rng } from '../src/core/rng';
import { applyTool, compare } from '../src/core/systems/appraisal';
import { evalCond, type TxContext } from '../src/core/systems/compliance';
import { bankLimit, interestOf, redeemProbability } from '../src/core/systems/economy';
import { makeDoc, makeItem, randomPerson } from '../src/core/systems/generate';
import { respondToOffer } from '../src/core/systems/negotiation';
import type { Customer, GameState, Session } from '../src/core/types';
import { playthrough } from '../tools/simulate';
import { ICON_ROWS } from '../src/ui/pixel';

function run(s: GameState, ...actions: Action[]): GameState {
  for (const a of actions) s = dispatch(s, a).state;
  return s;
}

function sessionFor(_s: GameState, c: Customer): Session {
  return { customer: c, revealed: [], findings: [], pointed: [], offers: [], ask: c.ask, min: c.min, patience: c.patience, chat: [], closed: false };
}

function customerWith(s: GameState, defId: string, opts: { fake?: boolean; stolen?: boolean } = {}): Customer {
  const rng = new Rng(42);
  const today = dateOfDay(s.day);
  const person = randomPerson(rng, today);
  return {
    id: 'test', person, docs: [makeDoc(rng, person, 'license', today)], intent: 'pawn', personality: 'regular',
    item: makeItem(s, rng, defId, opts), cash: 0, ask: 50_000, min: 30_000, patience: 3, finance: 0.5, greeting: '',
  };
}

describe('dates', () => {
  it('converts game day to date and wareki', () => {
    expect(dateOfDay(1)).toBe('1991-11-01');
    expect(dateOfDay(31)).toBe('1991-12-01');
    expect(toWareki('1991-11-01')).toBe('平成3年11月1日');
    expect(toWareki('1960-05-14')).toBe('昭和35年5月14日');
    expect(toWareki('1909-11-24')).toBe('明治42年11月24日');
    expect(toWareki('1916-04-29')).toBe('大正5年4月29日');
    expect(toWareki('1989-01-07')).toBe('昭和64年1月7日');
    expect(toWareki('1989-01-08')).toBe('平成元年1月8日');
  });
  it('computes age with birthday not yet reached', () => {
    expect(ageOn('1974-11-02', '1991-11-01')).toBe(16);
    expect(ageOn('1974-11-01', '1991-11-01')).toBe(17);
  });
});

describe('rng', () => {
  it('is deterministic', () => {
    const a = new Rng(7);
    const b = new Rng(7);
    expect([a.next(), a.next(), a.int(1, 6)]).toEqual([b.next(), b.next(), b.int(1, 6)]);
  });
});

describe('new game', () => {
  it('starts on day 1 morning with a queue', () => {
    const s = newGame(1);
    expect(s.day).toBe(1);
    expect(s.phase).toBe('morning');
    expect(s.money).toBe(CONFIG.startMoney);
    expect(s.queue.length).toBeGreaterThan(5);
    expect(s.morning.newRules.length).toBeGreaterThan(0);
  });

  it('is reproducible from the seed', () => {
    expect(JSON.stringify(newGame(99))).toBe(JSON.stringify(newGame(99)));
  });
});

describe('appraisal', () => {
  it('detects a fake hallmark only after the loupe reveals it', () => {
    const s = newGame(3);
    let c = customerWith(s, 'bag_birkin', { fake: true });
    // 刻印の綻びを持つ偽物になるまで作り直す
    for (let i = 0; c.item!.hallmark === itemDef('bag_birkin').hallmark && i < 50; i++) {
      c = { ...c, item: makeItem(s, new Rng(100 + i), 'bag_birkin', { fake: true }) };
    }
    const ses = sessionFor(s, c);
    expect(compare(s, ses, 'item.hallmark', 'catalog.hallmark').invalid).toBe(true);
    const r = applyTool(s, ses, 'loupe', 'item');
    ses.revealed.push(...r.revealed);
    const cmp = compare(s, ses, 'catalog.hallmark', 'item.hallmark');
    expect(cmp.match).toBe(false);
    expect(cmp.finding?.kind).toBe('fake_hallmark');
  });

  it('flags an expired document against today', () => {
    const s = newGame(4);
    const c = customerWith(s, 'ring_k18');
    c.docs[0].expiry = '1991-10-01';
    const res = compare(s, sessionFor(s, c), 'doc.0.expiry', 'today');
    expect(res.finding?.kind).toBe('doc_expired');
  });

  it('matches stolen serials', () => {
    const s = newGame(5);
    const c = customerWith(s, 'camera_f3', { stolen: true });
    const ses = sessionFor(s, c);
    ses.revealed.push('item.serial');
    expect(compare(s, ses, 'item.serial', `stolen.${c.item!.serial}`).finding?.kind).toBe('stolen');
    expect(compare(s, ses, 'item.serial', 'stolen.XX-00000').match).toBe(true);
  });

  it('refuses tools the shop does not own', () => {
    const s = newGame(6);
    const c = customerWith(s, 'ring_k18');
    expect(applyTool(s, sessionFor(s, c), 'magnet', 'item').ok).toBe(false);
  });
});

describe('compliance', () => {
  it('evaluates the photo-ID rule against the truth', () => {
    const s = newGame(7);
    const c = customerWith(s, 'ring_k18');
    const tx: TxContext = { intent: 'pawn', amount: 10_000, customer: c, today: dateOfDay(1), visitors: [] };
    expect(evalCond(RULE_MAP.photo_id.violation, tx)).toBe(false);
    c.docs[0].forged = true;
    expect(evalCond(RULE_MAP.photo_id.violation, tx)).toBe(true);
  });

  it('applies the outsider rule only above the amount', () => {
    const s = newGame(8);
    const c = customerWith(s, 'ring_k18');
    c.person.address = '東京都江東区1-1';
    const base = { intent: 'pawn' as const, customer: c, today: dateOfDay(8), visitors: [] };
    expect(evalCond(RULE_MAP.outsider.violation, { ...base, amount: 40_000 })).toBe(false);
    expect(evalCond(RULE_MAP.outsider.violation, { ...base, amount: 60_000 })).toBe(true);
  });
});

describe('negotiation', () => {
  it('accepts at the asking price and leaves when insulted', () => {
    const s = newGame(9);
    const c = customerWith(s, 'ring_k18');
    expect(respondToOffer(sessionFor(s, c), 50_000, new Rng(1)).kind).toBe('accept');
    const ses = sessionFor(s, c);
    let r = respondToOffer(ses, 1_000, new Rng(1));
    while (r.kind === 'counter') r = respondToOffer(ses, 1_000, new Rng(1));
    expect(r.kind).toBe('leave');
  });
});

describe('game flow', () => {
  it('issues a pawn ticket when a deal closes', () => {
    let s = run(newGame(10), { type: 'BEGIN_COUNTER' });
    // 質入れの客が来るまで進める
    for (let i = 0; i < 20; i++) {
      s = run(s, { type: 'NEXT_CUSTOMER' });
      if (s.session?.customer.intent === 'pawn') break;
      s = run(s, { type: 'REFUSE' }, { type: 'DISMISS' });
    }
    const ses = s.session!;
    expect(ses.customer.intent).toBe('pawn');
    const before = s.money;
    s = run(s, { type: 'OFFER', amount: ses.ask });
    expect(s.session!.outcome).toBe('deal');
    expect(s.loans).toHaveLength(1);
    expect(s.money).toBe(before - s.loans[0].principal);
    expect(interestOf(s.loans[0])).toBeGreaterThan(0);
    expect(redeemProbability(s, s.loans[0])).toBeGreaterThan(0);
  });

  it('cannot offer more than the cash on hand', () => {
    let s = run(newGame(11), { type: 'BEGIN_COUNTER' });
    for (let i = 0; i < 20 && s.session?.customer.item === undefined; i++) {
      s = run(s, ...(s.session ? [{ type: 'REFUSE' } as Action, { type: 'DISMISS' } as Action] : []), { type: 'NEXT_CUSTOMER' });
    }
    const r = dispatch(s, { type: 'OFFER', amount: s.money + 1000 });
    expect(r.state).toBe(s);
    expect(r.message).toMatch(/足りない/);
  });

  it('does not charge time for repeating the same inspection or comparison', () => {
    let s = run(newGame(14), { type: 'BEGIN_COUNTER' });
    for (let i = 0; i < 20 && !s.session?.customer.item; i++) {
      s = run(s, ...(s.session ? [{ type: 'REFUSE' } as Action, { type: 'DISMISS' } as Action] : []), { type: 'NEXT_CUSTOMER' });
    }
    s = run(s, { type: 'USE_TOOL', tool: 'loupe', target: 'item' });
    const again = dispatch(s, { type: 'USE_TOOL', tool: 'loupe', target: 'item' });
    expect(again.state).toBe(s);
    expect(again.message).toMatch(/もう調べた/);
    s = run(s, { type: 'COMPARE', a: 'item.hallmark', b: 'catalog.hallmark' });
    const twice = dispatch(s, { type: 'COMPARE', a: 'catalog.hallmark', b: 'item.hallmark' });
    expect(twice.state).toBe(s);
    expect(twice.message).toMatch(/もう照合した/);
  });

  it('keeps a log of the day for the night report', () => {
    let s = run(newGame(15), { type: 'BEGIN_COUNTER' }, { type: 'NEXT_CUSTOMER' });
    if (s.session?.customer.intent === 'special') s = run(s, { type: 'CHOOSE', index: 0 }, { type: 'DISMISS' }, { type: 'NEXT_CUSTOMER' });
    s = run(s, { type: 'REFUSE' });
    expect(s.todayLog).toEqual({ deals: 0, reports: 0, refused: 1, walkouts: 0 });
    s = run(s, { type: 'DISMISS' }, { type: 'CLOSE_SHOP' }, { type: 'END_NIGHT' });
    expect(s.todayLog).toEqual({ deals: 0, reports: 0, refused: 0, walkouts: 0 });
  });

  it('moves from counter to night to the next morning', () => {
    let s = run(newGame(12), { type: 'BEGIN_COUNTER' }, { type: 'CLOSE_SHOP' });
    expect(s.phase).toBe('night');
    expect(s.expenses.some((e) => e.id === 'rent')).toBe(true);
    s = run(s, { type: 'END_NIGHT' });
    expect(s.day).toBe(2);
    expect(s.phase).toBe('morning');
  });

  it('forecloses when the installment cannot be paid', () => {
    let s = newGame(13);
    s.day = 6;
    s = run(s, { type: 'END_NIGHT' }); // phase は morning なので無視される
    s = { ...s, phase: 'night', day: 7, money: 1_000 };
    s = run(s, { type: 'CLOSE_SHOP' });
    s.expenses = [{ id: 'installment', label: '定期返済', amount: 50_000, pay: true, mandatory: true }];
    s = run(s, { type: 'END_NIGHT' });
    expect(s.phase).toBe('ending');
    expect(s.ending).toBe('foreclosed');
  });
});

describe('management', () => {
  const night = (seed: number) => run(newGame(seed), { type: 'BEGIN_COUNTER' }, { type: 'CLOSE_SHOP' });

  it('offers dealer lots at night that can be bought into stock', () => {
    let s = night(21);
    expect(s.dealerLots!.length).toBeGreaterThanOrEqual(CONFIG.dealerLots);
    const lot = s.dealerLots![0];
    const before = s.money;
    s = run(s, { type: 'BUY_LOT', itemId: lot.item.id });
    expect(s.money).toBe(before - lot.price);
    expect(s.inventory.find((i) => i.item.id === lot.item.id)?.source).toBe('dealer');
    expect(s.dealerLots!.some((l) => l.item.id === lot.item.id)).toBe(false);
    s = run(s, { type: 'END_NIGHT' });
    expect(s.dealerLots).toEqual([]);
  });

  it('charges the ad at night and brings more customers the next day', () => {
    const plain = run(night(22), { type: 'END_NIGHT' });
    let s = run(night(22), { type: 'SET_AD', ad: { id: 'flyer' } });
    expect(committedExpenses(s)).toBe(committedExpenses(night(22)) + CONFIG.adFlyer.price);
    s = run(s, { type: 'END_NIGHT' });
    expect(s.adToday?.id).toBe('flyer');
    expect(s.adNext).toBeUndefined();
    expect(s.queue.length).toBeGreaterThan(plain.queue.length);
  });

  it('focuses walk-in items on the advertised category', () => {
    let s = run(night(23), { type: 'SET_AD', ad: { id: 'buy', category: 'camera' } }, { type: 'END_NIGHT' });
    const cams = s.queue.filter((c) => !c.ticket && !c.storyId && c.item && itemDef(c.item.defId).category === 'camera').length;
    expect(cams).toBeGreaterThanOrEqual(3);
    expect(dispatch(night(23), { type: 'SET_AD', ad: { id: 'buy', category: 'blade' } }).message).toMatch(/品目/);
  });

  it('lends from the bank within the limit and accrues daily interest', () => {
    let s = run(night(24), { type: 'BORROW', amount: 10_000_000 });
    expect(s.bankLoan).toBe(bankLimit(s));
    const owed = s.bankLoan!;
    s = run(s, { type: 'END_NIGHT' });
    expect(s.bankLoan).toBe(owed + Math.round((owed * CONFIG.bankDailyRate) / 100) * 100);
    s = run(s, { type: 'BEGIN_COUNTER' }, { type: 'CLOSE_SHOP' }, { type: 'REPAY_BANK', amount: 50_000 });
    expect(s.bankLoan).toBe(owed + Math.round((owed * CONFIG.bankDailyRate) / 100) * 100 - 50_000);
  });

  it('adds unpaid bank loans to the debt at the end', () => {
    let s = night(25);
    s = { ...s, day: CONFIG.totalDays, money: 10_000, debt: 0, bankLoan: 100_000, expenses: [] };
    s = run(s, { type: 'END_NIGHT' });
    expect(s.phase).toBe('ending');
    expect(s.debt).toBe(101_000 - 10_000); // 最後の夜の利息がついてから取り立てられる
  });

  it('lets a hired clerk settle due pawn tickets before opening', () => {
    let s = night(26);
    s = run(s, { type: 'HIRE_CLERK' });
    const c = newGame(26).queue.find((q) => !q.storyId && !q.ticket)!;
    s.loans.push({
      ticketNo: 99, customer: c, item: makeItem(s, new Rng(1), 'ring_k18'), principal: 20_000, rate: 0.1,
      issuedDay: 1, dueDay: 2, status: 'active', extensions: 0, pendingVisit: 'redeem',
    });
    s = run(s, { type: 'END_NIGHT' });
    expect(s.loans.find((l) => l.ticketNo === 99)?.status).toBe('redeemed');
    expect(s.queue.some((q) => q.ticket?.ticketNo === 99)).toBe(false);
    expect(s.morning.notes.some((n) => n.startsWith('店員：'))).toBe(true);
    s = run(s, { type: 'BEGIN_COUNTER' }, { type: 'CLOSE_SHOP' });
    expect(s.expenses.find((e) => e.id === 'wage')?.amount).toBe(CONFIG.clerkWage);
  });
});

describe('pixel icons', () => {
  it('are 12×12 maps using only palette characters', () => {
    for (const rows of Object.values(ICON_ROWS)) {
      expect(rows).toHaveLength(12);
      for (const row of rows) expect(row).toMatch(/^[.kwgGsSrbnc]{12}$/);
    }
  });
});

describe('balance', () => {
  it('a careful bot can still finish some of the 30 days, but not most', () => {
    const endings = Array.from({ length: 10 }, (_, i) => playthrough(1000 + i, 'careful').ending);
    const cleared = endings.filter((e) => e === 'revival' || e === 'cold_lender' || e === 'town_light').length;
    expect(cleared).toBeGreaterThanOrEqual(2);
    expect(cleared).toBeLessThanOrEqual(7);
  }, 120_000);

  it('a naive bot that pays any asking price goes under', () => {
    const s = playthrough(2000, 'naive');
    expect(['foreclosed', 'revoked', 'closed']).toContain(s.ending);
  });
});
