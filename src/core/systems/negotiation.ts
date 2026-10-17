// 交渉。提示額に対する客の反応と、欠陥の指摘。

import { DEFECT_FACTOR } from '../config';
import { ACCEPT_LINES, COUNTER_LINES, LEAVE_LINES } from '../data/people';
import type { Rng } from '../rng';
import type { Finding, Session } from '../types';
import { roundPrice } from './generate';

export type Reaction =
  | { kind: 'accept'; line: string }
  | { kind: 'counter'; line: string; ask: number }
  | { kind: 'leave'; line: string };

export function respondToOffer(session: Session, offer: number, rng: Rng): Reaction {
  const p = session.customer.personality;
  if (offer >= session.ask) return { kind: 'accept', line: rng.pick(ACCEPT_LINES[p]) };
  if (offer >= session.min) {
    session.patience -= 1;
    if (session.patience <= 1 || offer >= session.ask * 0.92) return { kind: 'accept', line: rng.pick(ACCEPT_LINES[p]) };
    session.ask = Math.max(session.min, roundPrice((session.ask + offer) / 2));
    return { kind: 'counter', line: rng.pick(COUNTER_LINES[p]), ask: session.ask };
  }
  session.patience -= offer < session.min * 0.6 ? 2 : 1;
  if (session.patience <= 0) return { kind: 'leave', line: rng.pick(LEAVE_LINES[p]) };
  session.ask = Math.max(session.min, roundPrice(session.ask * 0.93));
  return { kind: 'counter', line: rng.pick(COUNTER_LINES[p]), ask: session.ask };
}

export interface PointResult {
  line: string;
  /** 客が逃げ出した */
  fled: boolean;
}

/** 欠陥・偽物の指摘。客の希望額と最低額が下がる。 */
export function pointOut(session: Session, finding: Finding, rng: Rng): PointResult {
  const c = session.customer;
  if (finding.kind === 'doc_expired') {
    if (!c.spareDoc) return { line: '…期限切れでしたか。出直します。', fled: true };
    // 別の身分証を出してくる。それが本物かどうかは、また照合して確かめるしかない
    c.docs.push(c.spareDoc);
    c.spareDoc = undefined;
    return { line: 'えっ、期限切れ！？ …じゃあ、こっちの免許証で。', fled: false };
  }
  const fake = finding.kind.startsWith('fake_');
  if (fake) {
    const alreadyFake = session.pointed.some((k) => k.startsWith('fake_'));
    if (c.personality === 'liar' && rng.chance(0.5)) {
      return { line: 'ちっ…バレたか。じゃあな！（品物をひったくって出ていった）', fled: true };
    }
    if (!alreadyFake) {
      session.ask = roundPrice(session.ask * 0.12);
      session.min = roundPrice(session.min * 0.08);
    }
    return {
      line: c.item?.authentic === false && c.personality !== 'liar'
        ? 'そんな…偽物だなんて。騙されてたのか…'
        : 'ま、まあ確かに…じゃあ値段は相談で。',
      fled: false,
    };
  }
  const d = finding.key.split(':')[1];
  const f = DEFECT_FACTOR[d] ?? 0.9;
  session.ask = roundPrice(session.ask * f);
  session.min = roundPrice(session.min * Math.min(1, f + 0.05));
  const lines = ['…確かに、それは気づきませんでした。', 'う…そこを突かれると弱いな。', 'まあ、多少はね…'];
  return { line: rng.pick(lines), fled: false };
}
