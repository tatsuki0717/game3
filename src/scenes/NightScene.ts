// 夜の帳簿画面：帳簿・支払い・借金と利率・在庫・質札・投資。

import type * as Phaser from 'phaser';
import { CONDITION_LABEL, CONFIG } from '../core/config';
import { yen } from '../core/dates';
import { itemDef } from '../core/data/items';
import { UPGRADES } from '../core/data/schedule';
import { committedExpenses, maxRate, shelfSlots } from '../core/game';
import { interestOf, saleProbability, shopperValue, wholesalePrice } from '../core/systems/economy';
import type { GameState, InventoryItem } from '../core/types';
import { type Box, button, checkbox, fixedWidth, hbox, numberField, panel, rect, Stack, tag, txt, vbox } from '../ui/kit';
import { act, getState, notify, ui } from '../ui/store';
import { COLOR, INK, W } from '../ui/theme';
import { BaseScene, HUD_H } from './BaseScene';

type Container = Phaser.GameObjects.Container;

const TOP = HUD_H + 8;
const C1 = { x: 12, w: 400 };
const C2 = { x: 424, w: W - 424 - 12 };
const BOTTOM = 800 - 12;
const FOOT_H = 52;

function suggested(s: GameState, inv: InventoryItem): number {
  return Math.round((shopperValue(s, inv) * 0.9) / 1000) * 1000;
}

function priceStep(p: number): number {
  return Math.max(1000, Math.round((p * 0.1) / 1000) * 1000);
}

export class NightScene extends BaseScene {
  constructor() {
    super('night');
  }

  protected background(): number {
    return 0x14110f;
  }

  /** 見出しつきのパネル。中身はスクロール領域に積む */
  private section(id: string, title: string, x: number, y: number, w: number, h: number, fill: (st: Stack, iw: number) => void): void {
    panel(this, x, y, w, h);
    txt(this, x + 14, y + 10, title, { size: 17, bold: true, font: 'serif' });
    const sv = this.scroll(`night:${id}`, x + 12, y + 42, w - 24, h - 50);
    const st = new Stack(sv.content, 0, 0, 6);
    fill(st, w - 36);
    sv.setContentHeight(st.y);
  }

  private row(label: Box | string, value: Box | string, w: number, valueColor: string = INK.ink): Container {
    const l = typeof label === 'string' ? txt(this, 0, 0, label, { size: 14, wrap: w - 120 }) : label;
    const v = typeof value === 'string' ? txt(this, 0, 0, value, { size: 14, bold: true, color: valueColor }) : value;
    const h = Math.max(l.displayHeight, v.displayHeight);
    l.setPosition(0, (h - l.displayHeight) / 2);
    v.setPosition(w - v.displayWidth, (h - v.displayHeight) / 2);
    return this.add.container(0, 0, [l, v, rect(this, 0, h + 2, w, 1, COLOR.black, { alpha: 0.1 })]).setSize(w, h + 4);
  }

  private centered(t: Phaser.GameObjects.Text, w: number): Container {
    t.setPosition(Math.round((w - t.width) / 2), 0);
    return this.add.container(0, 0, [t]).setSize(w, t.height);
  }

  protected build(): void {
    const s = getState();
    this.hud(s);
    const h1 = 236;
    const h2 = 200;
    const h3 = BOTTOM - TOP - h1 - h2 - 16;
    this.ledger(s, TOP, h1);
    this.payments(s, TOP + h1 + 8, h2);
    this.debt(s, TOP + h1 + h2 + 16, h3);

    const invH = 410;
    this.inventory(s, TOP, invH);
    const lowY = TOP + invH + 8;
    const lowH = BOTTOM - FOOT_H - 8 - lowY;
    const half = (C2.w - 8) / 2;
    this.loans(s, C2.x, lowY, half, lowH);
    this.upgrades(s, C2.x + half + 8, lowY, half, lowH);

    const end = button(this, s.day >= CONFIG.totalDays ? '最終日を終える' : '眠る（翌日へ）  🌙', () => {
      ui.priceDrafts = {};
      act({ type: 'END_NIGHT' });
    }, { variant: 'primary', size: 20, padX: 36, h: FOOT_H });
    end.setPosition(C2.x + C2.w - end.width, BOTTOM - FOOT_H);
    const shelved = s.inventory.filter((i) => i.shelved).length;
    const note = txt(this, 0, 0, `陳列 ${shelved} / ${shelfSlots(s)}・質札 ${s.loans.filter((l) => l.status === 'active').length} 件`, { size: 14, color: INK.paperDark });
    note.setPosition(C2.x, BOTTOM - FOOT_H / 2 - note.height / 2);
  }

  private ledger(s: GameState, y: number, h: number): void {
    const income = s.ledger.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
    const outgo = s.ledger.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);
    this.section('ledger', '本日の帳簿', C1.x, y, C1.w, h, (st, iw) => {
      if (s.ledger.length === 0) st.add(txt(this, 0, 0, '取引なし。', { size: 14, color: INK.muted }));
      for (const l of s.ledger) st.add(this.row(l.label, yen(l.amount), iw, l.amount < 0 ? INK.red : INK.green), 2);
      st.space(4);
      st.add(this.row(txt(this, 0, 0, `収入 ${yen(income)}`, { size: 14, bold: true }), txt(this, 0, 0, `支出 ${yen(outgo)}`, { size: 14, bold: true }), iw));
    });
  }

  private payments(s: GameState, y: number, h: number): void {
    const committed = committedExpenses(s);
    const after = s.money - committed;
    const installment = s.expenses.find((e) => e.id === 'installment');
    const f = s.family;
    const familyState = f.sick ? '祖母が寝込んでいる' : f.hunger > 0 ? 'お腹を空かせている' : f.cold > 0 ? '寒がっている' : '元気';
    this.section('pay', '支払い', C1.x, y, C1.w, h, (st, iw) => {
      for (const e of s.expenses) {
        st.add(this.row(checkbox(this, e.label, e.pay, () => act({ type: 'TOGGLE_EXPENSE', id: e.id }), { disabled: e.mandatory, size: 14 }), yen(e.amount), iw), 2);
      }
      st.space(4);
      st.add(hbox(this, [txt(this, 0, 0, '家族：', { size: 14 }), txt(this, 0, 0, familyState, { size: 14, bold: true })], 0));
      st.add(txt(this, 0, 0, `支払い後の所持金：${yen(after)}`, { size: 14, color: after < 0 ? INK.red : INK.ink, bold: after < 0 }));
      if (installment && s.money < committed) {
        st.add(txt(this, 0, 0, '⚠ 定期返済に足りない！ このまま眠ると店は差し押さえられる。在庫を業者に売ってでも現金を作れ。', { size: 13, color: INK.red, bold: true, wrap: iw }));
      }
    });
  }

  private debt(s: GameState, y: number, h: number): void {
    this.section('debt', '借金と利率', C1.x, y, C1.w, h, (st, iw) => {
      st.add(hbox(this, [txt(this, 0, 0, '残高', { size: 14 }), txt(this, 0, 0, yen(s.debt), { size: 20, bold: true })], 10));
      st.add(txt(this, 0, 0, `定期返済：${Object.entries(CONFIG.installments).map(([d, v]) => `${d}日目 ${yen(v)}`).join(' / ')}。残りは ${CONFIG.totalDays} 日目の夜に所持金から自動で返済。`, { size: 12, color: INK.muted, wrap: iw }));
      const pay = () => act({ type: 'PAY_DEBT', amount: Number(ui.debtDraft.replace(/[^\d]/g, '')) });
      st.add(hbox(this, [
        txt(this, 0, 0, '¥', { size: 16, bold: true }),
        numberField(this, { id: 'debt', w: iw - 150, value: ui.debtDraft, placeholder: '繰り上げ返済額', onChange: (v) => { ui.debtDraft = v; }, onEnter: pay }),
        button(this, '返済', pay, { size: 14 }),
        button(this, '全額', () => { ui.debtDraft = String(Math.max(0, Math.min(s.money, s.debt))); notify(); }, { size: 12, padX: 8 }),
      ], 6));
      st.space(6);
      st.add(hbox(this, [
        txt(this, 0, 0, '貸付利率', { size: 14, bold: true }),
        button(this, '−', () => act({ type: 'SET_RATE', rate: s.rate - 0.01 }), { size: 14, w: 32 }),
        txt(this, 0, 0, `${Math.round(s.rate * 100)}%`, { size: 20, bold: true }),
        button(this, '＋', () => act({ type: 'SET_RATE', rate: s.rate + 0.01 }), { size: 14, w: 32 }),
        txt(this, 0, 0, `${CONFIG.loanTermDays} 日あたり・上限 ${Math.round(maxRate(s) * 100)}%`, { size: 12, color: INK.muted }),
      ], 8));
      st.add(txt(this, 0, 0, '利率が高いほど利息収入は増えるが、客は請け出しを諦めやすくなる。', { size: 12, color: INK.muted, wrap: iw }));
    });
  }

  private inventory(s: GameState, y: number, h: number): void {
    const shelved = s.inventory.filter((i) => i.shelved).length;
    this.section('inv', `在庫（陳列 ${shelved} / ${shelfSlots(s)}）`, C2.x, y, C2.w, h, (st, iw) => {
      st.add(txt(this, 0, 0, '陳列した品は翌朝までに売れることがある。高すぎる値札は売れにくい。業者への売却は即金だが安い（偽物はほぼ値がつかない）。', { size: 12, color: INK.muted, wrap: iw }));
      if (s.inventory.length === 0) {
        st.add(txt(this, 0, 0, '在庫はない。', { size: 14, color: INK.muted }));
        return;
      }
      const cols = [200, 36, 84, 84, 170, iw - 200 - 36 - 84 - 84 - 170 - 30];
      const line = (cells: (Box | null)[], bg?: number) => {
        const r = hbox(this, cells.map((c, i) => fixedWidth(this, c ?? this.add.container(0, 0).setSize(1, 1), cols[i])), 6);
        const parts: Box[] = [];
        if (bg !== undefined) parts.push(rect(this, -4, -3, iw + 8, r.height + 6, bg, { alpha: 0.1, radius: 3 }));
        parts.push(r, rect(this, 0, r.height + 3, iw, 1, COLOR.black, { alpha: 0.1 }));
        return this.add.container(0, 0, parts).setSize(iw, r.height + 4);
      };
      st.add(line(['品物', '状態', '仕入', '業者買取', '店頭価格', ''].map((t) => txt(this, 0, 0, t, { size: 12, color: INK.muted }))), 4);
      for (const inv of s.inventory) st.add(this.inventoryRow(s, inv, cols, line), 6);
    });
  }

  private inventoryRow(s: GameState, inv: InventoryItem, cols: number[], line: (cells: (Box | null)[], bg?: number) => Container): Container {
    const def = itemDef(inv.item.defId);
    const id = inv.item.id;
    const draft = ui.priceDrafts[id] ?? (inv.shelved ? inv.price : suggested(s, inv));
    const p = saleProbability(s, { ...inv, price: inv.shelved && ui.priceDrafts[id] === undefined ? inv.price : draft });
    const chance = p >= 0.5 ? '高' : p >= 0.25 ? '中' : '低';
    const setDraft = (v: number) => {
      ui.priceDrafts[id] = Math.max(1000, v);
      notify();
    };
    const name = vbox(this, [
      txt(this, 0, 0, `${def.emoji} ${def.name}`, { size: 13, wrap: cols[0] }),
      txt(this, 0, 0, inv.source === 'forfeit' ? '質流れ' : inv.source === 'story' ? '祖父の金庫' : '買取', { size: 11, color: INK.muted }),
    ], 0);
    const price = vbox(this, [
      hbox(this, [
        button(this, '−', () => setDraft(draft - priceStep(draft)), { size: 13, w: 26, h: 26 }),
        this.centered(txt(this, 0, 0, yen(draft), { size: 14, bold: true, font: 'mono' }), 92),
        button(this, '＋', () => setDraft(draft + priceStep(draft)), { size: 13, w: 26, h: 26 }),
      ], 4),
      txt(this, 0, 0, `売れ行き ${chance}`, { size: 11, color: p >= 0.5 ? INK.green : p >= 0.25 ? INK.muted : INK.red }),
    ], 2);
    const actions = hbox(this, [
      inv.shelved ? button(this, '下げる', () => act({ type: 'UNSHELVE', itemId: id }), { size: 12, padX: 8 }) : null,
      button(this, inv.shelved ? '値札更新' : '陳列', () => act({ type: 'SHELVE', itemId: id, price: draft }), { size: 12, padX: 8, variant: 'primary' }),
      button(this, '業者へ', () => {
        delete ui.priceDrafts[id];
        act({ type: 'WHOLESALE', itemId: id });
      }, { size: 12, padX: 8 }),
    ], 4);
    return line([
      name,
      txt(this, 0, 0, CONDITION_LABEL[inv.item.condition].slice(0, 1), { size: 14 }),
      txt(this, 0, 0, yen(inv.cost), { size: 13 }),
      txt(this, 0, 0, yen(wholesalePrice(s, inv)), { size: 13 }),
      price,
      vbox(this, [inv.shelved ? tag(this, '陳列中', 'good', 11) : null, actions], 2),
    ], inv.shelved ? COLOR.green : undefined);
  }

  private loans(s: GameState, x: number, y: number, w: number, h: number): void {
    const active = s.loans.filter((l) => l.status === 'active').sort((a, b) => a.dueDay - b.dueDay);
    this.section('loans', `質札（${active.length} 件）`, x, y, w, h, (st, iw) => {
      if (active.length === 0) {
        st.add(txt(this, 0, 0, 'なし', { size: 14, color: INK.muted }));
        return;
      }
      for (const l of active) {
        const due = l.dueDay <= s.day + 1;
        const head = hbox(this, [
          txt(this, 0, 0, `No.${l.ticketNo}`, { size: 12, font: 'mono', color: INK.muted }),
          txt(this, 0, 0, l.customer.person.name, { size: 13, bold: true }),
          txt(this, 0, 0, itemDef(l.item.defId).name, { size: 13 }),
        ], 8);
        const sub = txt(this, 0, 0, `${yen(l.principal)}（利 ${yen(interestOf(l))}）・期限 ${l.dueDay} 日目`, { size: 12, color: due ? INK.red : INK.muted, bold: due });
        st.add(this.row(vbox(this, [head, sub], 1), '', iw), 2);
      }
    });
  }

  private upgrades(s: GameState, x: number, y: number, w: number, h: number): void {
    this.section('upgrades', '投資', x, y, w, h, (st, iw) => {
      for (const u of UPGRADES) {
        const owned = s.upgrades.includes(u.id);
        const locked = s.day < u.availableDay;
        const right: Box = owned
          ? tag(this, '導入済み', 'good', 12)
          : locked
            ? txt(this, 0, 0, `${u.availableDay} 日目〜`, { size: 12, color: INK.muted })
            : button(this, yen(u.price), () => act({ type: 'BUY_UPGRADE', id: u.id }), { size: 13, disabled: s.money < u.price });
        const left = vbox(this, [
          txt(this, 0, 0, u.name, { size: 14, bold: true }),
          txt(this, 0, 0, u.desc, { size: 12, color: INK.muted, wrap: iw - right.displayWidth - 16 }),
        ], 1);
        const r = this.row(left, right, iw);
        if (locked) r.setAlpha(0.55);
        st.add(r, 4);
      }
    });
  }
}
