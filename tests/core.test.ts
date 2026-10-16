import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { ageOn, dateOfDay, toWareki } from '../src/core/dates';
import { itemDef } from '../src/core/data/items';
import { RULE_MAP } from '../src/core/data/rules';
import { dispatch, migrate, newGame, type Action } from '../src/core/game';
import { Rng } from '../src/core/rng';
import { applyTool, compare } from '../src/core/systems/appraisal';
import { evalCond, type TxContext } from '../src/core/systems/compliance';
import { interestOf, redeemProbability } from '../src/core/systems/economy';
import { isSuspicious, makeDoc, makeItem, randomPerson } from '../src/core/systems/generate';
import { computeLayout } from '../src/ui/settings';
import { respondToOffer } from '../src/core/systems/negotiation';
import type { Customer, GameState, Session } from '../src/core/types';
import { playthrough } from '../tools/simulate';

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

describe('suspicious customers', () => {
  it('mixes at least three suspicious walk-ins into day 1', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = newGame(seed);
      const today = dateOfDay(1);
      expect(s.queue.filter((c) => !c.storyId && isSuspicious(c, today)).length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('borrowing', () => {
  it('adds a credit-union loan with its fee to the debt', () => {
    let s = run(newGame(20), { type: 'BEGIN_COUNTER' });
    s = run(s, { type: 'BORROW', lender: 'credit', amount: 100_000 });
    expect(s.money).toBe(CONFIG.startMoney + 100_000);
    expect(s.debt).toBe(CONFIG.startDebt + 110_000);
    const r = dispatch(s, { type: 'BORROW', lender: 'credit', amount: 200_000 });
    expect(r.state).toBe(s);
    expect(r.message).toMatch(/あと/);
  });

  it('refuses credit to a shop with a bad reputation', () => {
    const s = { ...newGame(21), reputation: 10 };
    expect(dispatch(s, { type: 'BORROW', lender: 'credit', amount: 50_000 }).message).toMatch(/評判/);
  });

  it('grows the loan-shark balance every morning and can be repaid at night', () => {
    let s = run(newGame(22), { type: 'BORROW', lender: 'shark', amount: 100_000 }, { type: 'BEGIN_COUNTER' }, { type: 'CLOSE_SHOP' }, { type: 'END_NIGHT' });
    expect(s.shark).toBe(103_000);
    s = run(s, { type: 'BEGIN_COUNTER' }, { type: 'CLOSE_SHOP' }, { type: 'PAY_DEBT', target: 'shark', amount: 103_000 });
    expect(s.shark).toBe(0);
  });

  it('migrates version-1 saves', () => {
    const old = { ...newGame(23), version: 1 } as Record<string, unknown>;
    delete old.shark;
    delete old.creditBorrowed;
    const s = migrate(old as never)!;
    expect(s.shark).toBe(0);
    expect(s.creditBorrowed).toBe(0);
  });
});

describe('stage layout', () => {
  const base = { resolution: 'auto' as const, fit: true, uiScale: 1, speed: 1, volume: 0, effects: true };
  it('keeps the same logical height in auto mode and fits the window', () => {
    const a = computeLayout(1920, 1080, base);
    const b = computeLayout(1280, 720, base);
    expect(a.h).toBe(b.h);
    expect(a.w * a.scale).toBeCloseTo(1920, 0);
  });
  it('letterboxes fixed resolutions and never goes below the minimum size', () => {
    const l = computeLayout(1000, 1000, { ...base, resolution: '1280x720' });
    expect(l.w).toBe(1280);
    expect(l.y).toBeGreaterThan(0);
    const tiny = computeLayout(800, 450, { ...base, resolution: '1280x720', uiScale: 1.2 });
    expect(tiny.w).toBeGreaterThanOrEqual(1180);
  });
});

describe('balance', () => {
  it('a careful bot can finish the 30 days', () => {
    const endings = [1002, 1003, 1004].map((seed) => playthrough(seed, 'careful').ending);
    expect(endings.filter((e) => e === 'revival' || e === 'cold_lender' || e === 'town_light').length).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('a naive bot that pays any asking price goes under', () => {
    const s = playthrough(2000, 'naive');
    expect(['foreclosed', 'revoked', 'closed']).toContain(s.ending);
  });
});
