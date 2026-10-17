// 所持金と借金残高の推移グラフ、返済の進捗メーター（夜とエンディングで使う）。

import { CONFIG } from '../core/config';
import { yen } from '../core/dates';
import type { GameState } from '../core/types';
import { h } from './dom';

// 紙の面（--paper）に対して検証済みの 2 色（dataviz の validate_palette で全項目 PASS）
const SERIES = [
  { key: 'money', label: '所持金', color: '#9a7420' },
  { key: 'debt', label: '借金残高', color: '#2a6aa8' },
] as const;

type Point = { day: number; money: number; debt: number };

const W = 560;
const H = 220;
const PAD = { l: 52, r: 74, t: 14, b: 32 };
const NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

/** 軸目盛り用の短い表記（¥250K / ¥1M） */
function compactYen(n: number): string {
  if (n === 0) return '0';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}${+(a / 1_000_000).toFixed(2)}M`;
  return `${sign}${Math.round(a / 1000)}K`;
}

function niceStep(max: number): number {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

/**
 * これまでの推移。今日の点は常に現在の値にする（夜は支払い前、エンディングは最終返済後の値）。
 * history は夜の支払い後・最終返済前に記録されるため、そのままだと末尾が現在値とずれる。
 */
export function historyPoints(s: GameState): Point[] {
  const pts: Point[] = [{ day: 0, money: CONFIG.startMoney, debt: CONFIG.startDebt }, ...s.history.filter((p) => p.day < s.day)];
  pts.push({ day: s.day, money: s.money, debt: s.debt });
  return pts;
}

export function historyChart(s: GameState): HTMLElement {
  const pts = historyPoints(s);
  const maxV = Math.max(CONFIG.startDebt, ...pts.map((p) => p.money));
  const minV = Math.min(0, ...pts.map((p) => p.money));
  const step = niceStep(maxV - minV);
  const top = Math.ceil(maxV / step) * step;
  const bottom = Math.floor(minV / step) * step;
  const x = (d: number) => PAD.l + (d / CONFIG.totalDays) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + ((top - v) / (top - bottom)) * (H - PAD.t - PAD.b);

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': '所持金と借金残高の推移' });

  // 目盛りと格子（1px の実線、控えめ）
  for (let v = bottom; v <= top + 1; v += step) {
    root.append(svg('line', { x1: PAD.l, x2: W - PAD.r, y1: y(v), y2: y(v), class: v === 0 ? 'axis' : 'grid' }));
    root.append(svg('text', { x: PAD.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, compactYen(v)));
  }
  for (let d = 0; d <= CONFIG.totalDays; d += 5) {
    root.append(svg('text', { x: x(d), y: H - 4, 'text-anchor': 'middle', class: 'tick' }, d === 0 ? '開始' : `${d}日`));
  }
  // 定期返済の日
  for (const d of Object.keys(CONFIG.installments).map(Number)) {
    root.append(svg('line', { x1: x(d), x2: x(d), y1: PAD.t, y2: H - PAD.b, class: 'due-line' }));
    root.append(svg('text', { x: x(d) + 3, y: PAD.t + 8, class: 'due-label' }, `−${compactYen(CONFIG.installments[d])}`));
  }

  for (const sr of SERIES) {
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)} ${y(p[sr.key]).toFixed(1)}`).join(' ');
    root.append(svg('path', { d: path, fill: 'none', stroke: sr.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    const end = pts[pts.length - 1];
    root.append(svg('circle', { cx: x(end.day), cy: y(end[sr.key]), r: 4.5, fill: sr.color, class: 'end-dot' }));
  }

  // 末尾の直接ラベル。近すぎるときは凡例とツールチップに任せる
  const end = pts[pts.length - 1];
  const gap = Math.abs(y(end.money) - y(end.debt));
  if (gap >= 14) {
    for (const sr of SERIES) {
      root.append(svg('text', { x: x(end.day) + 8, y: y(end[sr.key]) + 4, class: 'end-label' }, compactYen(end[sr.key])));
    }
  }

  // ホバー：十字線とツールチップ
  const cross = svg('line', { x1: 0, x2: 0, y1: PAD.t, y2: H - PAD.b, class: 'crosshair', visibility: 'hidden' });
  root.append(cross);
  const tip = h('div', { class: 'chart-tip', hidden: true });
  const hit = svg('rect', { x: PAD.l, y: PAD.t, width: W - PAD.l - PAD.r, height: H - PAD.t - PAD.b, fill: 'transparent' });
  const showAt = (clientX: number) => {
    const box = root.getBoundingClientRect();
    const vx = ((clientX - box.left) / box.width) * W;
    const p = pts.reduce((best, q) => (Math.abs(x(q.day) - vx) < Math.abs(x(best.day) - vx) ? q : best), pts[0]);
    cross.setAttribute('x1', String(x(p.day)));
    cross.setAttribute('x2', String(x(p.day)));
    cross.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.replaceChildren(
      h('b', null, p.day === 0 ? '開始時' : `${p.day} 日目`),
      ...SERIES.map((sr) => h('div', null, h('i', { class: 'key', style: { background: sr.color } }), `${sr.label} `, h('span', { class: 'num' }, yen(p[sr.key])))),
    );
    const left = (x(p.day) / W) * box.width;
    tip.style.left = `${Math.min(box.width - 150, Math.max(0, left + 10))}px`;
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  hit.addEventListener('pointermove', (e) => showAt(e.clientX));
  hit.addEventListener('pointerdown', (e) => showAt(e.clientX));
  hit.addEventListener('pointerleave', hide);
  root.append(hit);

  return h('figure', { class: 'chart' },
    h('div', { class: 'chart-legend' },
      ...SERIES.map((sr) => h('span', null, h('i', { class: 'key', style: { background: sr.color } }), sr.label)),
      h('span', { class: 'muted' }, h('i', { class: 'key due' }), '定期返済日'),
    ),
    h('div', { class: 'chart-wrap' }, root, tip),
    h('details', { class: 'chart-table' },
      h('summary', null, '表で見る'),
      h('table', null,
        h('tr', null, h('th', null, '日'), ...SERIES.map((sr) => h('th', null, sr.label))),
        ...pts.map((p) => h('tr', null, h('td', null, p.day === 0 ? '開始' : `${p.day}`), h('td', { class: 'num' }, yen(p.money)), h('td', { class: 'num' }, yen(p.debt)))),
      ),
    ),
  );
}

/** 返済の進捗メーター */
export function debtMeter(s: GameState): HTMLElement {
  const paid = CONFIG.startDebt - s.debt;
  const ratio = Math.max(0, Math.min(1, paid / CONFIG.startDebt));
  return h('div', { class: 'debt-meter' },
    h('div', { class: 'debt-meter-head' },
      h('span', null, '返済済み'),
      h('b', null, yen(paid)),
      h('span', { class: 'muted' }, ` / ${yen(CONFIG.startDebt)}（${Math.round(ratio * 100)}%）`),
    ),
    h('div', { class: 'meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': CONFIG.startDebt, 'aria-valuenow': paid },
      h('div', { class: 'meter-fill', style: { width: `${ratio * 100}%` } }),
    ),
  );
}
