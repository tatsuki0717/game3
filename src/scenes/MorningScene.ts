// 朝の画面（新聞・手帳・本日の予定・相場・新しい規則）。

import { CONFIG } from '../core/config';
import { dateOfDay, toWareki, yen } from '../core/dates';
import { CATEGORIES, CATEGORY_LABEL } from '../core/data/items';
import { activeRules } from '../core/data/rules';
import { button, panel, rect, Stack, tag, txt } from '../ui/kit';
import { act, getState } from '../ui/store';
import { COLOR, INK, W } from '../ui/theme';
import { BaseScene, HUD_H } from './BaseScene';

const TREND = (m: number) => (m >= 1.05 ? '▲' : m <= 0.95 ? '▼' : '―');

export class MorningScene extends BaseScene {
  constructor() {
    super('morning');
  }

  protected background(): number {
    return 0x2a2119;
  }

  protected build(): void {
    const s = getState();
    const m = s.morning;
    this.hud(s);

    const px = 150;
    const pw = W - px * 2;
    const py = HUD_H + 16;
    const ph = 650;
    panel(this, px, py, pw, ph, COLOR.paper, 2);
    // 紙の罫線
    for (let y = py + 28; y < py + ph; y += 28) rect(this, px, y, pw, 1, COLOR.black, { alpha: 0.03 });

    const inner = px + 32;
    const iw = pw - 64;
    const name = txt(this, inner, py + 18, '潮見新報', { size: 34, font: 'serif', black: true });
    name.setLetterSpacing(8);
    const date = txt(this, 0, 0, toWareki(dateOfDay(s.day)), { size: 15, font: 'serif' });
    date.setPosition(inner + iw - date.width, py + 38);
    rect(this, inner, py + 72, iw, 2, COLOR.ink);
    rect(this, inner, py + 77, iw, 1, COLOR.ink);

    // 本文はスクロール領域に入れる（記事が多い日もある）
    const sv = this.scroll('morning', inner, py + 86, iw, ph - 86 - 70);
    const st = new Stack(sv.content, 0, 8, 6);
    if (m.headlines.length === 0) st.add(txt(this, 0, 0, '本日は大きなニュースなし', { size: 18, font: 'serif', bold: true }));
    m.headlines.forEach((h, i) => {
      if (i === 0) st.add(txt(this, 0, 0, h, { size: 26, font: 'serif', black: true, wrap: iw }), 8);
      else {
        const t = txt(this, 0, 0, h, { size: 18, font: 'serif', bold: true, wrap: iw - 14 });
        const bar = rect(this, 0, 0, 4, t.height, COLOR.ink);
        const c = this.add.container(0, 0, [bar, t.setPosition(12, 0)]).setSize(iw, t.height);
        st.add(c, 6);
      }
    });
    st.space(8);
    const lineY = st.y;
    sv.content.add(rect(this, 0, lineY, iw, 1, COLOR.ink));
    st.space(10);

    // 2 段組み：左に手帳、右に予定と相場
    const leftW = Math.round(iw * 0.56);
    const rightX = leftW + 32;
    const rightW = iw - rightX;
    const top = st.y;
    const left = new Stack(sv.content, 0, top, 4);
    left.add(this.heading('店主の手帳', leftW), 6);
    if (m.notes.length === 0) left.add(txt(this, 0, 0, '特記事項なし。', { size: 15, color: INK.muted }));
    for (const n of m.notes) {
      const citation = n.startsWith('【指導票】');
      left.add(txt(this, 0, 0, `・${n}`, { size: 15, wrap: leftW, color: citation ? INK.red : INK.ink, bold: citation, lineSpacing: 6 }), 6);
    }

    const due = s.loans.filter((l) => l.status === 'active' && l.dueDay === s.day).length;
    const nextInstallment = Object.entries(CONFIG.installments).map(([d, v]) => [Number(d), v] as const).find(([d]) => d >= s.day);
    const right = new Stack(sv.content, rightX, top, 4);
    right.add(this.heading('本日の予定', rightW), 6);
    for (const line of [
      `満期を迎える質札：${due} 件`,
      `盗品手配書：${s.stolenList.length} 件`,
      `有効な規則：${activeRules(s.day).length} 条`,
      nextInstallment
        ? `次の定期返済：${nextInstallment[0]} 日目の夜 ${yen(Math.min(nextInstallment[1], s.debt))}`
        : `最終返済：${CONFIG.totalDays} 日目の夜に残額 ${yen(s.debt)}`,
    ]) right.add(txt(this, 0, 0, `・${line}`, { size: 15, wrap: rightW, lineSpacing: 6 }), 4);
    right.space(10);
    right.add(this.heading('相場', rightW), 8);
    // 相場の札を折り返しながら並べる
    let cx = 0;
    let cy = right.y;
    for (const c of CATEGORIES) {
      const v = s.market[c];
      const chip = tag(this, `${CATEGORY_LABEL[c]} ${TREND(v)}${Math.round(v * 100)}%`, v >= 1.05 ? 'good' : v <= 0.95 ? 'bad' : 'plain', 13);
      if (cx + chip.width > rightW) {
        cx = 0;
        cy += chip.height + 6;
      }
      chip.setPosition(rightX + cx, cy);
      sv.content.add(chip);
      cx += chip.width + 6;
    }
    right.y = cy + 30;

    st.y = Math.max(left.y, right.y) + 10;
    if (m.newRules.length) {
      const box = new Stack(null, 16, 0, 6);
      const items = [txt(this, 0, 0, '📜 新しい規則（規則帳に追加）', { size: 16, color: INK.red, bold: true, font: 'serif' }),
        ...m.newRules.map((r) => txt(this, 0, 0, r, { size: 15, wrap: iw - 32, lineSpacing: 4 }))];
      const c = this.add.container(0, 0);
      box.y = 12;
      for (const it of items) {
        c.add(it);
        box.add(it);
      }
      const bh = box.y + 6;
      c.addAt(rect(this, 0, 0, iw, bh, COLOR.red, { alpha: 0.06, stroke: COLOR.red, strokeWidth: 2 }), 0);
      c.setSize(iw, bh);
      st.add(c, 10);
    }
    sv.setContentHeight(st.y + 10);

    const open = button(this, '店を開ける', () => act({ type: 'BEGIN_COUNTER' }), { variant: 'primary', size: 20, padX: 40 });
    open.setPosition(W / 2 - open.width / 2, py + ph - 58);
  }

  private heading(label: string, w: number) {
    const t = txt(this, 0, 0, label, { size: 17, bold: true, font: 'serif' });
    const line = rect(this, 0, t.height + 2, w, 1, COLOR.black, { alpha: 0.2 });
    return this.add.container(0, 0, [t, line]).setSize(w, t.height + 3);
  }
}
