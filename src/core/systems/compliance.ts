// 規則の評価。プレイヤーが何を見抜いたかではなく「真実」に対して評価する。

import { CONFIG } from '../config';
import { ageOn, compareDate, dateOfDay } from '../dates';
import { itemDef } from '../data/items';
import { activeRules, type Cond, type RuleDef } from '../data/rules';
import type { Customer, FaceParts, GameState, IdDoc, Intent } from '../types';

export interface TxContext {
  intent: Intent;
  amount: number;
  customer: Customer;
  today: string;
  /** 本日すでに取引した人物キー */
  visitors: string[];
}

export function personKey(c: Customer): string {
  return `${c.person.name}|${c.person.birth}`;
}

function sameFace(a: FaceParts, b: FaceParts): boolean {
  return (Object.keys(a) as (keyof FaceParts)[]).every((k) => a[k] === b[k]);
}

export function isValidPhotoId(doc: IdDoc, c: Customer, today: string): boolean {
  return (
    (doc.kind === 'license' || doc.kind === 'passport') &&
    !doc.forged &&
    compareDate(doc.expiry, today) >= 0 &&
    !!doc.photo &&
    sameFace(doc.photo, c.person.face) &&
    doc.name === c.person.name
  );
}

export function evalCond(cond: Cond, tx: TxContext): boolean {
  const c = tx.customer;
  if ('all' in cond) return cond.all.every((x) => evalCond(x, tx));
  if ('any' in cond) return cond.any.some((x) => evalCond(x, tx));
  if ('not' in cond) return !evalCond(cond.not, tx);
  if ('intentIn' in cond) return cond.intentIn.includes(tx.intent);
  if ('noValidPhotoId' in cond) return !c.docs.some((d) => isValidPhotoId(d, c, tx.today));
  if ('itemStolen' in cond) return !!c.item?.stolen;
  if ('ageLt' in cond) return ageOn(c.person.birth, tx.today) < cond.ageLt;
  if ('amountGt' in cond) return tx.amount > cond.amountGt;
  if ('outOfTown' in cond) return !c.person.address.startsWith(CONFIG.town);
  if ('docCountLt' in cond) return c.docs.filter((d) => d.kind !== 'employment').length < cond.docCountLt;
  if ('categoryIn' in cond) return !!c.item && cond.categoryIn.includes(itemDef(c.item.defId).category);
  if ('repeatToday' in cond) return tx.visitors.includes(personKey(c));
  if ('lacksDocKind' in cond) return !c.docs.some((d) => d.kind === cond.lacksDocKind && !d.forged && d.name === c.person.name);
  if ('ticketMismatch' in cond) return !!c.impostor;
  return false;
}

export function violations(state: GameState, intent: Intent, amount: number, customer: Customer): RuleDef[] {
  const tx: TxContext = { intent, amount, customer, today: dateOfDay(state.day), visitors: state.todayVisitors };
  return activeRules(state.day).filter((r) => evalCond(r.violation, tx));
}

/** 断る正当な理由があったか（金額不問で、取引すれば違反になるか） */
export function hadLegalReason(state: GameState, customer: Customer): boolean {
  const intent = customer.intent;
  if (intent === 'special') return true;
  // 金額条件は「普通に取引した場合の金額」で判定する
  const amount = intent === 'pawn' || intent === 'sell' ? customer.min : customer.ticket?.principal ?? 0;
  return violations(state, intent, amount, customer).length > 0;
}
