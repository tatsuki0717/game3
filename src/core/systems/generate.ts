// 客・品物・身分証の生成。

import { CONFIG, CONDITION_FACTOR, DEFECT_FACTOR, FAKE_VALUE_FACTOR } from '../config';
import { addDays, ageOn, dateOfDay } from '../dates';
import { ITEMS, itemDef } from '../data/items';
import {
  COMPANIES, FAMILY_NAMES, GIVEN_NAMES_F, GIVEN_NAMES_M, OTHER_CITIES, TOWN_DISTRICTS, greetingsFor,
} from '../data/people';
import { difficulty, type Difficulty } from '../data/schedule';
import type { Rng } from '../rng';
import type {
  Condition, Customer, DefectId, FaceParts, GameState, IdDoc, Intent, ItemInstance, Person, Personality,
} from '../types';

export function newId(state: GameState, prefix: string): string {
  state.nextId += 1;
  return `${prefix}${state.nextId}`;
}

export function randomFace(rng: Rng, gender: 'm' | 'f', old: boolean): FaceParts {
  return {
    gender,
    skin: rng.int(0, 3),
    hair: rng.int(0, 4),
    hairColor: old ? rng.pick([3, 4]) : rng.int(0, 2),
    eyes: rng.int(0, 3),
    brows: rng.int(0, 2),
    nose: rng.int(0, 2),
    mouth: rng.int(0, 3),
    glasses: rng.chance(0.25),
    beard: gender === 'm' ? (rng.chance(0.3) ? rng.int(1, 2) : 0) : 0,
    wrinkles: old,
  };
}

/** 写真の顔を少しだけ変える（別人の写真） */
export function alterFace(rng: Rng, face: FaceParts): FaceParts {
  const f = { ...face };
  const keys: (keyof FaceParts)[] = ['eyes', 'nose', 'mouth', 'brows', 'hair'];
  const k1 = rng.pick(keys);
  const mods: Record<string, number> = { eyes: 4, nose: 3, mouth: 4, brows: 3, hair: 5 };
  (f[k1] as number) = ((f[k1] as number) + rng.int(1, mods[k1] - 1)) % mods[k1];
  if (rng.chance(0.5)) f.glasses = !f.glasses;
  return f;
}

export function randomPerson(rng: Rng, today: string, opts: { minor?: boolean; outsider?: boolean } = {}): Person {
  const gender = rng.chance(0.5) ? 'm' : 'f';
  const age = opts.minor ? rng.int(15, 17) : rng.int(19, 82);
  const birthYear = Number(today.slice(0, 4)) - age - (rng.chance(0.5) ? 1 : 0);
  const birth = `${birthYear}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`;
  const name = `${rng.pick(FAMILY_NAMES)} ${rng.pick(gender === 'm' ? GIVEN_NAMES_M : GIVEN_NAMES_F)}`;
  const address = opts.outsider
    ? `${rng.pick(OTHER_CITIES)}${rng.int(1, 5)}-${rng.int(1, 30)}`
    : `${CONFIG.town}${rng.pick(TOWN_DISTRICTS)}${rng.int(1, 5)}-${rng.int(1, 30)}`;
  return { name, birth, address, face: randomFace(rng, gender, ageOn(birth, today) >= 60) };
}

function idNo(rng: Rng): string {
  return `${rng.int(10, 99)}-${rng.int(100000, 999999)}`;
}

export function makeDoc(rng: Rng, person: Person, kind: IdDoc['kind'], today: string): IdDoc {
  const doc: IdDoc = {
    kind,
    idNo: idNo(rng),
    name: person.name,
    birth: person.birth,
    address: person.address,
    expiry: addDays(today, rng.int(40, 1500)),
    forged: false,
  };
  if (kind === 'license' || kind === 'passport') doc.photo = { ...person.face };
  if (kind === 'employment') doc.company = rng.pick(COMPANIES);
  return doc;
}

export function makeItem(state: GameState, rng: Rng, defId: string, opts: { fake?: boolean; stolen?: boolean } = {}): ItemInstance {
  const def = itemDef(defId);
  const authentic = !opts.fake || def.fakeHallmarks.length === 0;
  const condition = rng.weighted<Condition>(['S', 'A', 'B', 'C', 'D'], (c) => ({ S: 1, A: 4, B: 5, C: 2, D: 0.7 })[c]);
  const defects: DefectId[] = [];
  const hidden: DefectId[] = [];
  const nDefects = { S: 0, A: 0, B: 1, C: 1, D: 2 }[condition];
  const visiblePool: DefectId[] = ['scratch', 'dent', 'stain', 'missing_part'];
  for (let i = 0; i < nDefects; i++) {
    const d = rng.pick(visiblePool);
    if (!defects.includes(d)) defects.push(d);
  }
  if (def.electric && rng.chance(condition === 'D' ? 0.7 : 0.15)) hidden.push('broken');
  if (rng.chance(0.08)) hidden.push('repaired');

  let weightG = def.weightG * rng.range(0.98, 1.02);
  let hallmark = def.hallmark;
  let magnetic = def.material === 'steel';
  let purityOk = true;
  if (!authentic) {
    // 偽物の「綻び」は 1〜2 個だけ。全部の道具を使わないと見抜けないことがある。
    const tells = rng.shuffle(['hallmark', 'weight', 'metal'] as const);
    const count = rng.chance(0.4) ? 2 : 1;
    const chosen = tells.slice(0, count);
    const isPrecious = def.material === 'gold' || def.material === 'platinum';
    if (!isPrecious && chosen.includes('metal') && !chosen.includes('hallmark')) chosen.push('hallmark');
    if (chosen.includes('hallmark')) hallmark = rng.pick(def.fakeHallmarks);
    if (chosen.includes('weight')) weightG = def.weightG * rng.range(def.fakeWeight[0], def.fakeWeight[1]);
    if (chosen.includes('metal') && isPrecious) {
      purityOk = false;
      magnetic = rng.chance(0.6);
    }
  }
  const serial = def.serialPrefix ? `${def.serialPrefix}-${rng.int(10000, 99999)}` : undefined;
  return {
    id: newId(state, 'it'),
    defId,
    serial,
    condition,
    authentic,
    stolen: !!opts.stolen,
    weightG: Math.round(weightG * 10) / 10,
    hallmark,
    magnetic,
    purityOk,
    defects,
    hiddenDefects: hidden,
    sentimental: rng.chance(0.3) ? rng.range(0.1, 0.3) : 0,
  };
}

/** 真の市場価値 */
export function trueValue(state: GameState, item: ItemInstance): number {
  const def = itemDef(item.defId);
  let v = def.basePrice * CONDITION_FACTOR[item.condition] * (state.market[def.category] ?? 1);
  for (const d of [...item.defects, ...item.hiddenDefects]) v *= DEFECT_FACTOR[d];
  if (!item.authentic) v *= FAKE_VALUE_FACTOR;
  return Math.round(v / 100) * 100;
}

/** 客が思っている価値（本物で、状態も実際より 1 段階良いと思っている） */
export function perceivedValue(state: GameState, item: ItemInstance, personality: Personality): number {
  const def = itemDef(item.defId);
  const order: Condition[] = ['S', 'A', 'B', 'C', 'D'];
  const better = order[Math.max(0, order.indexOf(item.condition) - 1)];
  let v = def.basePrice * CONDITION_FACTOR[better] * (state.market[def.category] ?? 1);
  for (const d of item.defects) v *= DEFECT_FACTOR[d];
  if (!item.authentic && personality === 'liar') v *= 1.0; // 嘘つきは偽物を本物の値段で売りつけようとする
  return v;
}

const ASK_GREED: Record<Personality, number> = { timid: 0.85, aggressive: 1.2, liar: 1.35, regular: 1.0, desperate: 0.95 };
const MIN_RATIO: Record<Personality, [number, number]> = {
  timid: [0.3, 0.4],
  aggressive: [0.45, 0.55],
  liar: [0.4, 0.5],
  regular: [0.36, 0.46],
  desperate: [0.22, 0.32],
};

export function setPrices(state: GameState, rng: Rng, c: Customer): void {
  if (!c.item) return;
  const v = perceivedValue(state, c.item, c.personality);
  const askRatio = c.intent === 'pawn' ? 0.7 : 0.6;
  const [lo, hi] = MIN_RATIO[c.personality];
  const minRatio = rng.range(lo, hi) * (c.intent === 'pawn' ? 1 : 0.9);
  c.ask = roundPrice(v * askRatio * ASK_GREED[c.personality]);
  c.min = roundPrice(v * minRatio);
  c.patience = { timid: 3, aggressive: 2, liar: 3, regular: 3, desperate: 4 }[c.personality];
}

export function roundPrice(n: number): number {
  if (n >= 100_000) return Math.round(n / 5000) * 5000;
  if (n >= 10_000) return Math.round(n / 1000) * 1000;
  return Math.max(500, Math.round(n / 500) * 500);
}

function pickPersonality(rng: Rng, fake: boolean): Personality {
  if (fake && rng.chance(0.6)) return 'liar';
  return rng.weighted<Personality>(['timid', 'aggressive', 'liar', 'regular', 'desperate'], (p) =>
    ({ timid: 3, aggressive: 2, liar: 1, regular: 3, desperate: 3 })[p],
  );
}

function pickItemDef(rng: Rng, d: Difficulty, blade: boolean): string {
  const pool = ITEMS.filter((i) => (blade ? i.category === 'blade' : i.category !== 'blade'));
  // 高額品ほど出にくい
  return rng.weighted(pool, (i) => 1 / Math.pow(i.basePrice / 10_000, 0.35) + (d.customers > 9 ? 0.05 : 0)).id;
}

/** ランダムな新規客（質入れ / 買取） */
export function randomCustomer(state: GameState, rng: Rng, d: Difficulty): Customer {
  const today = dateOfDay(state.day);
  const minor = rng.chance(d.minor);
  const outsider = rng.chance(d.outsider);
  const person = randomPerson(rng, today, { minor, outsider });
  const fakeRoll = rng.next();
  const blade = rng.chance(d.blade);
  const defId = pickItemDef(rng, d, blade);
  const def = itemDef(defId);
  const fake = fakeRoll < d.fake * (def.fakeRate / 0.25);
  const stolen = !fake && rng.chance(d.stolen);
  const personality = pickPersonality(rng, fake || stolen);
  const intent: Intent = rng.chance(0.6) ? 'pawn' : 'sell';

  const docs: IdDoc[] = [];
  const noPhoto = rng.chance(d.noPhotoId);
  docs.push(makeDoc(rng, person, noPhoto ? 'insurance' : rng.chance(0.85) ? 'license' : 'passport', today));
  if (rng.chance(outsider ? 0.5 : 0.35)) docs.push(makeDoc(rng, person, noPhoto ? 'license' : 'insurance', today));
  if (rng.chance(state.day >= 20 ? 0.55 : 0.2)) docs.push(makeDoc(rng, person, 'employment', today));
  // 無写真の客の 2 枚目が免許だった場合は「写真付き無し」を保つため保険証に揃える
  if (noPhoto) for (const doc of docs) if (doc.kind === 'license') { doc.kind = 'insurance'; delete doc.photo; }

  const main = docs[0];
  if (rng.chance(d.expired)) main.expiry = addDays(today, -rng.int(1, 200));
  if (rng.chance(d.forged)) {
    main.forged = true;
    if (minor) {
      // 未成年が偽造免許で成人を装う
      const adultYear = Number(today.slice(0, 4)) - rng.int(20, 25);
      main.birth = `${adultYear}${main.birth.slice(4)}`;
    }
  }
  if (main.photo && rng.chance(d.photoMismatch)) main.photo = alterFace(rng, person.face);
  if (docs.length > 1 && rng.chance(0.06 + d.forged * 0.5)) {
    // 2 枚目の書類の名前・生年月日が食い違う（借り物）
    const other = docs[1];
    if (rng.chance(0.5)) other.name = `${rng.pick(FAMILY_NAMES)} ${person.name.split(' ')[1]}`;
    else other.birth = `${Number(other.birth.slice(0, 4)) + rng.int(1, 3)}${other.birth.slice(4)}`;
  }

  const c: Customer = {
    id: newId(state, 'c'),
    person,
    docs,
    intent,
    personality,
    item: makeItem(state, rng, defId, { fake, stolen }),
    cash: 0,
    ask: 0,
    min: 0,
    patience: 3,
    finance: rng.range(0, 1),
    greeting: rng.pick(greetingsFor(intent, personality)),
  };
  setPrices(state, rng, c);
  return c;
}

/** 同日 2 回目の来店（変装）。午前の客を元に作る */
export function repeatCustomer(state: GameState, rng: Rng, base: Customer): Customer {
  const today = dateOfDay(state.day);
  const person: Person = { ...base.person, face: { ...base.person.face, glasses: !base.person.face.glasses, hair: (base.person.face.hair + 2) % 5 } };
  const defId = pickItemDef(rng, difficulty(state.day), false);
  const c: Customer = {
    id: newId(state, 'c'),
    person,
    docs: [{ ...makeDoc(rng, person, 'license', today), idNo: base.docs[0].idNo }],
    intent: rng.chance(0.5) ? 'pawn' : 'sell',
    personality: 'liar',
    item: makeItem(state, rng, defId, { stolen: rng.chance(0.5) }),
    cash: 0,
    ask: 0,
    min: 0,
    patience: 3,
    finance: 0.2,
    greeting: '（帽子を目深にかぶっている）これ、お願いできますか。',
    repeat: true,
  };
  setPrices(state, rng, c);
  return c;
}
