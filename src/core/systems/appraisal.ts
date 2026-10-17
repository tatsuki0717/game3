// 道具による検査と、照合モード（2 項目を比べて不一致を見つける）。

import { DEFECT_LABEL } from '../config';
import { ageOn, compareDate, dateOfDay } from '../dates';
import { itemDef } from '../data/items';
import { TOOL_INFO } from '../data/schedule';
import type { DefectId, FaceParts, Finding, GameState, Session, ToolId } from '../types';

export interface ToolResult {
  ok: boolean;
  minutes: number;
  message: string;
  revealed: string[];
  findings: Finding[];
}

function defectFinding(d: DefectId): Finding {
  return { key: `defect:${d}`, kind: 'defect', label: `欠陥：${DEFECT_LABEL[d]}`, pointable: true, reportable: false };
}

/** 道具を使う。target は 'item' または 'doc.<i>' */
export function applyTool(state: GameState, session: Session, tool: ToolId, target: string): ToolResult {
  const info = TOOL_INFO[tool];
  const fail = (message: string): ToolResult => ({ ok: false, minutes: 0, message, revealed: [], findings: [] });
  if (!state.tools.includes(tool)) return fail(`${info.name}を持っていない。`);
  const c = session.customer;
  const revealed: string[] = [];
  const findings: Finding[] = [];
  let message = '';

  if (target.startsWith('doc.')) {
    if (tool !== 'uv') return fail(`${info.name}は書類には使えない。`);
    const i = Number(target.split('.')[1]);
    const doc = c.docs[i];
    if (!doc) return fail('その書類はない。');
    revealed.push(`doc.${i}.uv`);
    if (doc.forged) {
      message = 'UV ライトを当てた…透かしが浮かばない。偽造だ！';
      findings.push({ key: `doc_forged:${i}`, kind: 'doc_forged', label: '身分証が偽造（透かしなし）', pointable: false, reportable: true });
    } else {
      message = 'UV ライトを当てた。正規の透かしが浮かび上がった。';
    }
    return { ok: true, minutes: info.minutes, message, revealed, findings };
  }

  const item = c.item;
  if (!item) return fail('品物がない。');
  const def = itemDef(item.defId);
  switch (tool) {
    case 'loupe':
      revealed.push('item.hallmark', 'item.condition');
      if (item.serial) revealed.push('item.serial');
      for (const d of item.defects) findings.push(defectFinding(d));
      message = `ルーペで細部を確認した。刻印「${item.hallmark}」${item.serial ? `、シリアル ${item.serial}` : ''}。`;
      break;
    case 'scale':
      revealed.push('item.weight');
      message = `重さは ${item.weightG}g。`;
      break;
    case 'magnet':
      revealed.push('item.magnetic');
      message = item.magnetic ? '磁石がピタリとくっついた。' : '磁石はくっつかない。';
      break;
    case 'tester':
      if (!def.electric) return fail('通電する品物ではない。');
      revealed.push('item.works');
      if (item.hiddenDefects.includes('broken')) {
        findings.push(defectFinding('broken'));
        message = '電源が入らない…動作不良だ。';
      } else message = '問題なく動作した。';
      break;
    case 'uv':
      revealed.push('item.uv');
      if (item.hiddenDefects.includes('repaired')) {
        findings.push(defectFinding('repaired'));
        message = 'UV を当てると、接着剤の跡が光った。素人修理だ。';
      } else message = 'UV を当てた。特に異常はない。';
      break;
    case 'acid':
      if (def.material !== 'gold' && def.material !== 'platinum') return fail('貴金属ではないので試金石は使えない。');
      revealed.push('item.purity');
      if (!item.purityOk) {
        findings.push({ key: 'fake_purity', kind: 'fake_purity', label: '偽物：純度が刻印と合わない（メッキ）', pointable: true, reportable: false });
        message = '試金石の条痕が溶けて消えた…メッキだ。';
      } else message = '試金石の条痕は刻印通りの純度を示した。';
      break;
  }
  return { ok: true, minutes: info.minutes, message, revealed, findings };
}

export interface CompareResult {
  match: boolean;
  message: string;
  finding?: Finding;
  /** 比べられない組み合わせ */
  invalid?: boolean;
}

function faceEqual(a: FaceParts, b: FaceParts): boolean {
  return (Object.keys(a) as (keyof FaceParts)[]).every((k) => a[k] === b[k]);
}

function docField(session: Session, ref: string): { i: number; field: string } | null {
  const m = /^doc\.(\d+)\.(\w+)$/.exec(ref);
  if (!m) return null;
  const i = Number(m[1]);
  if (!session.customer.docs[i]) return null;
  return { i, field: m[2] };
}

/** 照合モード：2 つの項目を比べる。順序は問わない。 */
export function compare(state: GameState, session: Session, a: string, b: string): CompareResult {
  const res = compareOrdered(state, session, a, b) ?? compareOrdered(state, session, b, a);
  return res ?? { match: false, invalid: true, message: 'その 2 つは比べようがない。' };
}

function needs(session: Session, ref: string): boolean {
  return ref.startsWith('item.') ? session.revealed.includes(ref) : true;
}

function compareOrdered(state: GameState, session: Session, a: string, b: string): CompareResult | null {
  const c = session.customer;
  const item = c.item;
  const today = dateOfDay(state.day);
  if (!needs(session, a) || !needs(session, b)) return { match: false, invalid: true, message: 'まだ調べていない項目だ。' };

  if (item) {
    const def = itemDef(item.defId);
    if (a === 'item.hallmark' && b === 'catalog.hallmark') {
      if (item.hallmark === def.hallmark) return { match: true, message: '刻印はカタログと一致する。' };
      return {
        match: false,
        message: `刻印がカタログと違う！（「${item.hallmark}」≠「${def.hallmark}」）`,
        finding: { key: 'fake_hallmark', kind: 'fake_hallmark', label: '偽物：刻印がカタログと違う', pointable: true, reportable: false },
      };
    }
    if (a === 'item.weight' && b === 'catalog.weight') {
      if (Math.abs(item.weightG - def.weightG) / def.weightG <= 0.05) return { match: true, message: '重量はカタログ値の誤差範囲内。' };
      return {
        match: false,
        message: `重量がカタログと合わない！（${item.weightG}g / 正規 ${def.weightG}g）`,
        finding: { key: 'fake_weight', kind: 'fake_weight', label: '偽物：重量がカタログと違う', pointable: true, reportable: false },
      };
    }
    if (a === 'item.magnetic' && b === 'catalog.material') {
      const precious = def.material === 'gold' || def.material === 'platinum';
      if (!precious || !item.magnetic) return { match: true, message: '素材と磁性に矛盾はない。' };
      return {
        match: false,
        message: '金・プラチナは磁石にくっつかないはずだ！',
        finding: { key: 'fake_material', kind: 'fake_material', label: '偽物：貴金属なのに磁石につく', pointable: true, reportable: false },
      };
    }
    if (a === 'item.serial' && b.startsWith('stolen.')) {
      const serial = b.slice('stolen.'.length);
      if (item.serial !== serial) return { match: true, message: 'シリアル番号は手配書のものと違う。' };
      return {
        match: false,
        message: `シリアル ${serial} は盗品手配書に載っている！`,
        finding: { key: 'stolen', kind: 'stolen', label: '盗品：手配書のシリアルと一致', pointable: false, reportable: true },
      };
    }
  }

  const da = docField(session, a);
  if (da) {
    const doc = c.docs[da.i];
    if (da.field === 'expiry' && b === 'today') {
      if (compareDate(doc.expiry, today) >= 0) return { match: true, message: '有効期限内だ。' };
      return {
        match: false,
        message: '有効期限が切れている！',
        finding: { key: `doc_expired:${da.i}`, kind: 'doc_expired', label: '身分証の期限切れ', pointable: true, reportable: false },
      };
    }
    if (da.field === 'birth' && b === 'today') {
      const age = ageOn(doc.birth, today);
      if (age >= 18) return { match: true, message: `${age} 歳。成人だ。` };
      return {
        match: false,
        message: `${age} 歳…未成年だ！`,
        finding: { key: 'underage', kind: 'underage', label: '未成年', pointable: false, reportable: false },
      };
    }
    if (da.field === 'photo' && b === 'face') {
      if (!doc.photo) return { match: false, invalid: true, message: 'この書類には写真がない。' };
      if (faceEqual(doc.photo, c.person.face)) return { match: true, message: '写真は本人と一致する。' };
      return {
        match: false,
        message: '写真の顔が目の前の客と違う！',
        finding: { key: `photo_mismatch:${da.i}`, kind: 'photo_mismatch', label: '写真が本人と一致しない', pointable: false, reportable: false },
      };
    }
    const db = docField(session, b);
    if (db && db.i !== da.i && da.field === db.field && (da.field === 'name' || da.field === 'birth')) {
      const other = c.docs[db.i];
      const field = da.field as 'name' | 'birth';
      if (doc[field] === other[field]) return { match: true, message: '書類間で一致している。' };
      const kind = da.field === 'name' ? 'name_mismatch' : 'birth_mismatch';
      return {
        match: false,
        message: da.field === 'name' ? '書類によって名前が違う！' : '書類によって生年月日が違う！',
        finding: { key: kind, kind, label: da.field === 'name' ? '書類間で氏名が不一致' : '書類間で生年月日が不一致', pointable: false, reportable: false },
      };
    }
    if (da.field === 'name' && b === 'ticket.name' && c.ticket) {
      if (doc.name === c.ticket.name) return { match: true, message: '質札の名義と一致する。' };
      return {
        match: false,
        message: '質札の名義と身分証の氏名が違う！',
        finding: { key: 'ticket_mismatch', kind: 'ticket_mismatch', label: '質札の名義人ではない', pointable: false, reportable: false },
      };
    }
  }
  return null;
}

/** 照合で調べられる項目の人間向けラベル */
export function refLabel(ref: string): string {
  const map: Record<string, string> = {
    'item.hallmark': '品物の刻印',
    'item.weight': '品物の重量',
    'item.serial': '品物のシリアル',
    'item.magnetic': '磁性',
    'catalog.hallmark': 'カタログの刻印',
    'catalog.weight': 'カタログの重量',
    'catalog.material': 'カタログの素材',
    today: '今日の日付',
    face: '客の顔',
    'ticket.name': '質札の名義',
  };
  if (map[ref]) return map[ref];
  if (ref.startsWith('stolen.')) return `手配書 ${ref.slice(7)}`;
  const m = /^doc\.(\d+)\.(\w+)$/.exec(ref);
  if (m) {
    const f: Record<string, string> = { name: '氏名', birth: '生年月日', expiry: '有効期限', photo: '写真', address: '住所' };
    return `書類${Number(m[1]) + 1}の${f[m[2]] ?? m[2]}`;
  }
  return ref;
}
