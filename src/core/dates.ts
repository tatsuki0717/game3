import { CONFIG } from './config';

const MS_DAY = 86_400_000;

function parse(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function format(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ゲーム内の日（1 始まり）を日付文字列に変換 */
export function dateOfDay(day: number): string {
  return format(parse(CONFIG.startDate) + (day - 1) * MS_DAY);
}

export function addDays(date: string, days: number): string {
  return format(parse(date) + days * MS_DAY);
}

/** a < b なら負 */
export function compareDate(a: string, b: string): number {
  return parse(a) - parse(b);
}

export function ageOn(birth: string, today: string): number {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age;
}

const ERAS: { name: string; start: string; year: number }[] = [
  { name: '平成', start: '1989-01-08', year: 1989 },
  { name: '昭和', start: '1926-12-25', year: 1926 },
  { name: '大正', start: '1912-07-30', year: 1912 },
  { name: '明治', start: '1868-01-25', year: 1868 },
];

/** 和暦表記（平成3年11月1日） */
export function toWareki(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const era = ERAS.find((e) => compareDate(date, e.start) >= 0) ?? ERAS[ERAS.length - 1];
  const n = y - era.year + 1;
  return `${era.name}${n === 1 ? '元' : n}年${m}月${d}日`;
}

export function formatClock(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function yen(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}¥${Math.abs(Math.round(n)).toLocaleString('ja-JP')}`;
}
