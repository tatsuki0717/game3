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

const ERA_HEISEI = 1989;
const ERA_SHOWA = 1926;

/** 和暦表記（平成3年11月1日） */
export function toWareki(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (y >= ERA_HEISEI) return `平成${y - ERA_HEISEI + 1 === 1 ? '元' : y - ERA_HEISEI + 1}年${m}月${d}日`;
  if (y >= ERA_SHOWA) return `昭和${y - ERA_SHOWA + 1}年${m}月${d}日`;
  return `大正${y - 1911}年${m}月${d}日`;
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
