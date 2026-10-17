// 窓口画面（メインゲーム）：店先・作業机・道具・応対・参照資料。

import * as Phaser from 'phaser';
import { CONDITION_LABEL, CONFIG, DEFECT_LABEL } from '../core/config';
import { dateOfDay, toWareki, yen } from '../core/dates';
import { CATEGORIES, CATEGORY_LABEL, ITEMS, itemDef } from '../core/data/items';
import { activeRules } from '../core/data/rules';
import { TOOL_INFO } from '../core/data/schedule';
import { STORY_VISITS } from '../core/data/story';
import type { Customer, DocKind, GameState, IdDoc, Session, ToolId } from '../core/types';
import { faceImage } from '../ui/faceTexture';
import { type Box, button, fixedWidth, hbox, numberField, panel, pointerState, rect, Stack, tag, txt, vbox } from '../ui/kit';
import { act, getState, notify, toast, ui } from '../ui/store';
import { COLOR, INK } from '../ui/theme';
import { BaseScene, HUD_H } from './BaseScene';

type Container = Phaser.GameObjects.Container;

const DOC_LABEL: Record<DocKind, string> = {
  license: '運転免許証',
  passport: '旅券（パスポート）',
  insurance: '健康保険証',
  employment: '在職証明書',
};

const DOC_COLOR: Record<DocKind, number> = {
  license: 0xdfe9d9,
  passport: 0xd8deec,
  insurance: 0xefdddd,
  employment: 0xfbfaf5,
};

const MATERIAL_LABEL = { gold: '金', platinum: 'プラチナ', steel: 'ステンレス鋼', other: 'その他' };

// 画面の区画
const L = { x: 12, w: 748 };
const R = { x: 772, w: 496 };
const SHOP = { y: HUD_H + 8, h: 200 };
const DESK = { x: L.x, y: SHOP.y + SHOP.h + 8, w: L.w, h: 0 };
DESK.h = 800 - 12 - DESK.y;
const TRAY = { y: HUD_H + 8, h: 108 };
const ACTION = { y: TRAY.y + TRAY.h + 8, h: 300 };
const REF = { y: ACTION.y + ACTION.h + 8, h: 0 };
REF.h = 800 - 12 - REF.y;

const TICK_MS = 800; // 実時間 0.8 秒でゲーム内 1 分

export class CounterScene extends BaseScene {
  private lastCustomerId: string | null = null;
  private lastOutcome: string | null = null;
  private tickAcc = 0;
  private cards: Container[] = [];

  constructor() {
    super('counter');
  }

  // -------------------------------------------------------------- 時計

  protected tick(_time: number, delta: number): void {
    const s = getState();
    if (s.phase !== 'counter' || s.clock >= CONFIG.closeMinute || document.hidden) return;
    this.tickAcc += delta;
    if (this.tickAcc < TICK_MS) return;
    this.tickAcc -= TICK_MS;
    act({ type: 'TICK', minutes: 1 }, { silent: true });
    const after = getState().clock;
    this.updateClock(after);
    if (after >= CONFIG.closeMinute) notify();
  }

  protected onEscape(): void {
    if (ui.compareMode || ui.pendingTool) {
      ui.compareMode = false;
      ui.compareFirst = null;
      ui.pendingTool = null;
      notify();
    }
  }

  // -------------------------------------------------------------- 照合・道具

  private refClick(refId: string): void {
    if (!ui.compareMode) return;
    if (!ui.compareFirst || ui.compareFirst === refId) {
      ui.compareFirst = ui.compareFirst === refId ? null : refId;
      notify();
      return;
    }
    const a = ui.compareFirst;
    ui.compareFirst = null;
    act({ type: 'COMPARE', a, b: refId });
  }

  private targetClick(target: string): void {
    if (!ui.pendingTool) return;
    const tool = ui.pendingTool as ToolId;
    ui.pendingTool = null;
    act({ type: 'USE_TOOL', tool, target });
  }

  private useTool(tool: ToolId): void {
    const info = TOOL_INFO[tool];
    if (info.target === 'item') {
      act({ type: 'USE_TOOL', tool, target: 'item' });
      return;
    }
    ui.pendingTool = ui.pendingTool === tool ? null : tool;
    ui.compareMode = false;
    if (ui.pendingTool) toast(`${info.name}：品物か書類をクリック`);
    notify();
  }

  /** 照合モードでクリックできる項目 */
  private ref(refId: string, content: Box | string, o: { mono?: boolean; size?: number } = {}): Container {
    const selected = ui.compareFirst === refId;
    const inner: Box = typeof content === 'string'
      ? txt(this, 0, 0, content, { size: o.size ?? 14, font: o.mono ? 'mono' : 'sans', color: selected ? INK.white : INK.ink })
      : content;
    const pad = 2;
    inner.setPosition(pad, pad);
    const w = inner.displayWidth + pad * 2;
    const h = inner.displayHeight + pad * 2;
    const bg = rect(this, 0, 0, w, h, selected ? COLOR.blue : COLOR.brass, { radius: 3, alpha: selected ? 1 : ui.compareMode ? 0.2 : 0 });
    if (ui.compareMode) bg.setStrokeStyle(1, selected ? COLOR.blue : COLOR.brass, 0.8);
    const c = this.add.container(0, 0, [bg, inner]).setSize(w, h);
    if (ui.compareMode) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => !selected && bg.setFillStyle(COLOR.brass, 0.45));
      bg.on('pointerout', () => !selected && bg.setFillStyle(COLOR.brass, 0.2));
      bg.on('pointerdown', () => { pointerState.dragScrolled = false; });
      bg.on('pointerup', () => !pointerState.dragScrolled && this.refClick(refId));
    }
    return c;
  }

  // -------------------------------------------------------------- 画面

  protected build(): void {
    const s = getState();
    this.hud(s);
    this.cards = [];
    const ses = s.session;
    const newCustomer = (ses?.customer.id ?? null) !== this.lastCustomerId;
    this.lastCustomerId = ses?.customer.id ?? null;

    const face = this.shopfront(s, ses);
    this.desk(s, ses);
    this.toolsTray(s);
    this.actionPanel(s);
    this.referencePanel(s);

    if (ses && newCustomer) {
      if (face) this.tweens.add({ targets: face, x: { from: face.x - 60, to: face.x }, alpha: { from: 0, to: 1 }, duration: 380, ease: 'Cubic.easeOut' });
      this.cards.forEach((c, i) => {
        this.tweens.add({ targets: c, y: { from: c.y - 40, to: c.y }, alpha: { from: 0, to: 1 }, duration: 320, delay: 120 + i * 90, ease: 'Back.easeOut' });
      });
    }
    const outcomeKey = ses?.closed ? `${ses.customer.id}:${ses.outcome}` : null;
    if (outcomeKey && outcomeKey !== this.lastOutcome && ses) this.stamp(ses);
    this.lastOutcome = outcomeKey;
  }

  /** 取引の結末を判子で見せる */
  private stamp(ses: Session): void {
    const label = { deal: '成立', refused: '謝絶', left: '退店', reported: '通報', choice: '' }[ses.outcome ?? 'choice'];
    if (!label) return;
    const color = ses.outcome === 'deal' ? COLOR.red : ses.outcome === 'reported' ? COLOR.blue : COLOR.muted;
    const cx = DESK.x + DESK.w - 110;
    const cy = DESK.y + DESK.h - 90;
    const ring = this.add.circle(0, 0, 58).setStrokeStyle(5, color, 0.85);
    const t = txt(this, 0, 0, label, { size: 38, font: 'serif', black: true, color: `#${color.toString(16).padStart(6, '0')}` });
    t.setOrigin(0.5).setAlpha(0.9);
    const st = this.add.container(cx, cy, [ring, t]).setAngle(-12);
    this.tweens.add({ targets: st, scale: { from: 2.4, to: 1 }, alpha: { from: 0, to: 1 }, duration: 260, ease: 'Quad.easeIn' });
    this.cameras.main.shake(120, 0.003);
  }

  // -------------------------------------------------------------- 店先

  private shopfront(s: GameState, ses: Session | null): Container | null {
    rect(this, L.x, SHOP.y, L.w, SHOP.h, 0x4b3d30, { radius: 6, stroke: COLOR.woodDark, strokeWidth: 2 });
    const px = L.x + 10;
    const py = SHOP.y + 10;
    rect(this, px, py, 150, SHOP.h - 20, 0x6f8594, { radius: 4 });
    let faceBox: Container | null = null;
    const c = ses?.customer;
    if (c) {
      faceBox = this.ref('face', faceImage(this, c.person.face, 130));
      faceBox.setPosition(px + 75 - faceBox.width / 2, py + 4);
    } else {
      const dots = txt(this, 0, 0, s.queue.length ? '…' : '', { size: 32, color: '#ffffff88' });
      dots.setPosition(px + 75 - dots.width / 2, py + 60);
    }
    const q = txt(this, 0, 0, `待ち ${s.queue.length} 人`, { size: 12, color: INK.white });
    q.setShadow(0, 1, '#000', 2).setPosition(px + 75 - q.width / 2, py + SHOP.h - 42);

    // 会話ログ
    const cx = px + 162;
    const cw = L.x + L.w - 10 - cx;
    const sv = this.scroll('chat', cx, py, cw, SHOP.h - 20);
    const lines = [...(ses?.chat ?? [{ who: 'system' as const, text: s.clock >= CONFIG.closeMinute ? '閉店の時間だ。' : '「次の方、どうぞ」で客を呼ぼう。' }])];
    if (ses && !ses.closed && s.day <= 2 && (ses.customer.intent === 'pawn' || ses.customer.intent === 'sell')) {
      lines.unshift({ who: 'system', text: 'ヒント：道具で品物を調べ、「照合」→ 品物の刻印 → カタログの刻印 のように 2 項目をクリックして不一致を探そう。身分証の有効期限は「本日」の日付と照合する。' });
    }
    let y = 0;
    for (const l of lines) {
      const maxW = Math.round(cw * 0.86);
      const style = {
        customer: { bg: COLOR.paper, alpha: 1, color: INK.ink, align: 'left' },
        player: { bg: 0x2f4f6a, alpha: 1, color: INK.white, align: 'right' },
        system: { bg: COLOR.black, alpha: 0.35, color: INK.clock, align: 'center' },
      }[l.who];
      const t = txt(this, 10, 6, l.text, { size: l.who === 'system' ? 13 : 14, color: style.color, wrap: maxW - 20, lineSpacing: 4 });
      const bw = t.width + 20;
      const bh = t.height + 12;
      const x = style.align === 'left' ? 0 : style.align === 'right' ? cw - 8 - bw : (cw - bw) / 2;
      const bubble = this.add.container(x, y, [rect(this, 0, 0, bw, bh, style.bg, { alpha: style.alpha, radius: 8 }), t]);
      sv.content.add(bubble);
      y += bh + 6;
    }
    sv.setContentHeight(y, { stickToBottom: true });
    return faceBox;
  }

  // -------------------------------------------------------------- 作業机

  private desk(s: GameState, ses: Session | null): void {
    const d = rect(this, DESK.x, DESK.y, DESK.w, DESK.h, COLOR.wood, { radius: 6, stroke: ui.compareMode ? COLOR.brass : COLOR.woodDark, strokeWidth: ui.compareMode ? 3 : 2 });
    // 木目
    for (let x = DESK.x + 60; x < DESK.x + DESK.w; x += 140) rect(this, x, DESK.y + 2, 2, DESK.h - 4, COLOR.woodLight);
    void d;
    const c = ses?.customer;
    if (!c) {
      const t = txt(this, 0, 0, '作業机', { size: 34, font: 'serif', color: '#ffffff30' });
      t.setPosition(DESK.x + DESK.w / 2 - t.width / 2, DESK.y + DESK.h / 2 - t.height / 2);
      return;
    }
    const list: [string, Container | null][] = [
      ...c.docs.map((doc, i) => [`doc.${i}`, this.docCard(s, doc, i, c)] as [string, Container]),
      ['item', this.itemCard(s, ses!)],
      ['ticket', this.ticketCard(c)],
    ];
    // 初期配置：左上から詰めて並べる
    let fx = 14;
    let fy = 14;
    let rowH = 0;
    const placed: { key: string; card: Container }[] = [];
    for (const [key, card] of list) {
      if (!card) continue;
      if (fx + card.width > DESK.w - 14) {
        fx = 14;
        fy += rowH + 12;
        rowH = 0;
      }
      const posKey = `${c.id}:${key}`;
      const saved = ui.deskPos[posKey];
      const x = saved?.x ?? DESK.x + fx;
      const y = saved?.y ?? DESK.y + fy;
      card.setPosition(...this.clampToDesk(x, y, card));
      fx += card.width + 12;
      rowH = Math.max(rowH, card.height);
      placed.push({ key: posKey, card });
    }
    // 重なり順を復元
    placed.sort((a, b) => ui.deskOrder.indexOf(a.key) - ui.deskOrder.indexOf(b.key));
    for (const p of placed) {
      this.children.bringToTop(p.card);
      this.makeDraggable(p.card, p.key);
      this.cards.push(p.card);
    }
  }

  private clampToDesk(x: number, y: number, card: Container): [number, number] {
    return [
      Phaser.Math.Clamp(x, DESK.x + 4, DESK.x + DESK.w - Math.min(card.width, 120) - 4),
      Phaser.Math.Clamp(y, DESK.y + 4, DESK.y + DESK.h - 40),
    ];
  }

  /** 机の上のカード：ドラッグで動かす／道具を使うときはクリックで対象にする */
  private makeDraggable(card: Container, key: string): void {
    const bg = card.getAt(1) as Phaser.GameObjects.Rectangle; // [影, 地, ...]
    bg.setInteractive({ draggable: true, useHandCursor: true, cursor: ui.pendingTool ? 'crosshair' : 'grab' });
    let start = { x: 0, y: 0, px: 0, py: 0 };
    let dragged = false;
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      dragged = false;
      start = { x: card.x, y: card.y, px: p.x, py: p.y };
      this.children.bringToTop(card);
      ui.deskOrder = [...ui.deskOrder.filter((k) => k !== key), key];
    });
    bg.on('dragstart', () => {
      dragged = true;
      card.setScale(1.02);
    });
    bg.on('drag', (p: Phaser.Input.Pointer) => {
      card.setPosition(...this.clampToDesk(start.x + p.x - start.px, start.y + p.y - start.py, card));
    });
    bg.on('dragend', () => {
      card.setScale(1);
      ui.deskPos[key] = { x: card.x, y: card.y };
    });
    bg.on('pointerup', () => {
      if (!dragged && ui.pendingTool) this.targetClick(key.split(':')[1]);
    });
  }

  /** カードの地と影を中身に合わせて敷く */
  private cardFrame(content: Container, w: number, color: number, o: { border?: number; badge?: string } = {}): Container {
    const h = content.height + 20;
    const shadow = rect(this, 3, 4, w, h, COLOR.black, { alpha: 0.35, radius: 6 });
    const bg = rect(this, 0, 0, w, h, color, { radius: 6 });
    if (ui.pendingTool) bg.setStrokeStyle(3, COLOR.brass);
    else if (o.border !== undefined) bg.setStrokeStyle(2, o.border);
    content.setPosition(12, 10);
    const card = this.add.container(0, 0, [shadow, bg, content]).setSize(w, h);
    if (o.badge) {
      const t = txt(this, 6, 0, o.badge, { size: 11, color: INK.paper });
      const b = this.add.container(w - t.width - 20, -9, [rect(this, 0, 0, t.width + 12, t.height, COLOR.ink, { radius: 3 }), t]);
      card.add(b);
    }
    return card;
  }

  private fact(label: string, value: Box | string, w: number): Container {
    const l = fixedWidth(this, txt(this, 0, 0, label, { size: 12, color: INK.muted }), 62);
    const v = typeof value === 'string' ? txt(this, 0, 0, value, { size: 14, wrap: w - 70 }) : value;
    const row = hbox(this, [l, v], 6);
    const line = rect(this, 0, row.height + 2, w, 1, COLOR.black, { alpha: 0.08 });
    return this.add.container(0, 0, [row, line]).setSize(w, row.height + 4);
  }

  private unknown(tool: string) {
    return txt(this, 0, 0, `？（${tool}）`, { size: 14, color: INK.faint });
  }

  private itemCard(s: GameState, ses: Session): Container | null {
    const item = ses.customer.item;
    if (!item) return null;
    const def = itemDef(item.defId);
    const r = (k: string) => ses.revealed.includes(k);
    const precious = def.material === 'gold' || def.material === 'platinum';
    const w = 296;
    const iw = w - 24;
    const title = hbox(this, [
      txt(this, 0, 0, def.emoji, { size: 34 }),
      vbox(this, [txt(this, 0, 0, def.name, { size: 15, bold: true, wrap: iw - 56 }), txt(this, 0, 0, `${CATEGORY_LABEL[def.category]}（自己申告）`, { size: 12, color: INK.muted })], 0),
    ], 8);
    const rows: (Box | null)[] = [
      title,
      this.fact('刻印', r('item.hallmark') ? this.ref('item.hallmark', item.hallmark, { mono: true }) : this.unknown('ルーペ'), iw),
      def.serialPrefix ? this.fact('シリアル', r('item.serial') ? this.ref('item.serial', item.serial ?? '', { mono: true }) : this.unknown('ルーペ'), iw) : null,
      this.fact('状態', r('item.condition')
        ? hbox(this, [txt(this, 0, 0, CONDITION_LABEL[item.condition], { size: 14 }), ...item.defects.map((d) => tag(this, DEFECT_LABEL[d], 'bad'))], 4)
        : this.unknown('ルーペ'), iw),
      this.fact('重さ', r('item.weight') ? this.ref('item.weight', `${item.weightG} g`, { mono: true }) : this.unknown('天秤'), iw),
      s.tools.includes('magnet') || r('item.magnetic')
        ? this.fact('磁性', r('item.magnetic') ? this.ref('item.magnetic', item.magnetic ? 'くっつく' : 'くっつかない') : this.unknown('磁石'), iw)
        : null,
      precious && (s.tools.includes('acid') || r('item.purity'))
        ? this.fact('純度', r('item.purity') ? (item.purityOk ? txt(this, 0, 0, '刻印どおり', { size: 14 }) : tag(this, 'メッキ（不足）', 'bad', 13)) : this.unknown('試金石'), iw)
        : null,
      def.electric && (s.tools.includes('tester') || r('item.works'))
        ? this.fact('動作', r('item.works') ? (item.hiddenDefects.includes('broken') ? tag(this, '動作不良', 'bad', 13) : txt(this, 0, 0, '正常', { size: 14 })) : this.unknown('テスター'), iw)
        : null,
      s.tools.includes('uv') || r('item.uv')
        ? this.fact('UV', r('item.uv') ? (item.hiddenDefects.includes('repaired') ? tag(this, '修理痕あり', 'bad', 13) : txt(this, 0, 0, '異常なし', { size: 14 })) : this.unknown('UV'), iw)
        : null,
    ];
    return this.cardFrame(vbox(this, rows, 4), w, COLOR.paperLight);
  }

  private docCard(s: GameState, doc: IdDoc, i: number, c: Customer): Container {
    const r = (k: string) => `doc.${i}.${k}`;
    const uvDone = s.session?.revealed.includes(`doc.${i}.uv`);
    const w = 336;
    const iw = w - 24;
    const headL = txt(this, 0, 0, DOC_LABEL[doc.kind], { size: 15, bold: true, font: 'serif' });
    const headR = txt(this, 0, 0, `No. ${doc.idNo}`, { size: 12, font: 'mono' });
    headR.setPosition(iw - headR.width, 2);
    const head = this.add.container(0, 0, [headL, headR, rect(this, 0, headL.height + 2, iw, 1, COLOR.black, { alpha: 0.2 })]).setSize(iw, headL.height + 4);
    const photoW = doc.photo ? 72 : 0;
    const fw = iw - photoW - (doc.photo ? 8 : 0);
    const fields = vbox(this, [
      this.fact('氏名', this.ref(r('name'), doc.name), fw),
      this.fact('生年月日', this.ref(r('birth'), toWareki(doc.birth)), fw),
      this.fact('住所', txt(this, 0, 0, doc.address, { size: 12, wrap: fw - 70 }), fw),
      doc.company ? this.fact('勤務先', doc.company, fw) : null,
      this.fact('有効期限', this.ref(r('expiry'), toWareki(doc.expiry)), fw),
      uvDone ? this.fact('透かし', tag(this, doc.forged ? 'なし（偽造）' : 'あり', doc.forged ? 'bad' : 'good', 13), fw) : null,
    ], 3);
    const body = hbox(this, [doc.photo ? this.ref(r('photo'), faceImage(this, doc.photo, 64, true)) : null, fields], 8, 'top');
    return this.cardFrame(vbox(this, [head, body], 6), w, DOC_COLOR[doc.kind], { badge: c.docs.length > 1 ? `書類 ${i + 1}` : undefined });
  }

  private ticketCard(c: Customer): Container | null {
    const t = c.ticket;
    if (!t) return null;
    const w = 250;
    const iw = w - 24;
    const headL = txt(this, 0, 0, '質札', { size: 16, bold: true, font: 'serif', color: INK.red });
    const headR = txt(this, 0, 0, `No. ${t.ticketNo}`, { size: 12, font: 'mono' });
    headR.setPosition(iw - headR.width, 2);
    const head = this.add.container(0, 0, [headL, headR]).setSize(iw, headL.height);
    return this.cardFrame(vbox(this, [
      head,
      this.fact('名義', this.ref('ticket.name', t.name), iw),
      this.fact('品名', t.itemName, iw),
      this.fact('元金', yen(t.principal), iw),
      this.fact('利息', yen(t.interest), iw),
      this.fact('期限', `${t.dueDay} 日目`, iw),
    ], 3), w, 0xfff8e8, { border: COLOR.red });
  }

  // -------------------------------------------------------------- 道具トレイ

  private toolsTray(s: GameState): void {
    rect(this, R.x, TRAY.y, R.w, TRAY.h, COLOR.tray, { radius: 6, stroke: COLOR.black });
    const disabled = !s.session || s.session.closed;
    const tools = hbox(this, s.tools.map((t) => {
      const info = TOOL_INFO[t];
      return button(this, `${info.emoji}\n${info.name}\n${info.minutes}分`, () => this.useTool(t), {
        variant: ui.pendingTool === t ? 'active' : 'dark', size: 12, w: 74, h: 62, disabled,
      });
    }), 6);
    tools.setPosition(R.x + 8, TRAY.y + 8);
    const compare = button(this, ui.compareMode ? '🔗 照合モード中（2 項目をクリック）' : '🔗 照合', () => {
      ui.compareMode = !ui.compareMode;
      ui.compareFirst = null;
      ui.pendingTool = null;
      notify();
    }, { variant: ui.compareMode ? 'active' : 'normal', size: 13, disabled });
    const today = this.ref('today', txt(this, 0, 0, `📅 本日 ${toWareki(dateOfDay(s.day))}`, { size: 13, color: INK.paper }));
    const row = hbox(this, [compare, today], 10);
    row.setPosition(R.x + 8, TRAY.y + TRAY.h - row.height - 7);
  }

  // -------------------------------------------------------------- 応対パネル

  private actionPanel(s: GameState): void {
    panel(this, R.x, ACTION.y, R.w, ACTION.h);
    const sv = this.scroll('action', R.x + 12, ACTION.y + 10, R.w - 24, ACTION.h - 20);
    const st = new Stack(sv.content, 0, 0, 8);
    const iw = R.w - 36;
    this.actionContent(s, st, iw);
    sv.setContentHeight(st.y);
  }

  private actionContent(s: GameState, st: Stack, iw: number): void {
    const ses = s.session;
    if (!ses) {
      const closing = s.clock >= CONFIG.closeMinute;
      st.add(closing
        ? txt(this, 0, 0, '閉店時間だ。', { size: 16, color: INK.red, bold: true })
        : txt(this, 0, 0, s.queue.length > 0 ? `店先に ${s.queue.length} 人並んでいる。` : 'もう客はいないようだ。', { size: 16 }));
      if (!closing && s.queue.length > 0) {
        st.add(button(this, '次の方、どうぞ', () => { ui.offer = ''; act({ type: 'NEXT_CUSTOMER' }); }, { variant: 'primary', size: 20, padX: 30 }));
      }
      st.add(button(this, closing || s.queue.length === 0 ? '店を閉める' : '早めに店を閉める', () => act({ type: 'CLOSE_SHOP' })));
      return;
    }
    const c = ses.customer;
    if (ses.closed) {
      const label = { deal: '取引成立', refused: 'お断りした', left: '客は帰っていった', reported: '通報した', choice: '' }[ses.outcome ?? 'choice'];
      const color = { deal: INK.green, refused: INK.muted, left: INK.muted, reported: INK.blue, choice: INK.ink }[ses.outcome ?? 'choice'];
      if (label) st.add(txt(this, 0, 0, `${label}${ses.dealAmount ? `（${yen(ses.dealAmount)}）` : ''}`, { size: 18, bold: true, color }));
      st.add(this.findingsList(ses, iw));
      st.add(button(this, '次へ', () => {
        ui.compareMode = false;
        ui.compareFirst = null;
        ui.pendingTool = null;
        act({ type: 'DISMISS' });
      }, { variant: 'primary', size: 20, padX: 40 }));
      return;
    }
    if (c.intent === 'special') {
      const story = STORY_VISITS.find((v) => v.id === c.storyId);
      (story?.choices ?? []).forEach((ch, i) => {
        st.add(button(this, ch.label, () => act({ type: 'CHOOSE', index: i }), { w: iw, align: 'left', size: 15 }));
      });
      return;
    }
    const reportable = ses.findings.some((f) => f.reportable);
    if (c.ticket) {
      st.add(txt(this, 0, 0, c.intent === 'redeem'
        ? `請け出し：元利 ${yen(c.ticket.principal + c.ticket.interest)} を受け取って品物を返す`
        : `利払い：利息 ${yen(c.ticket.interest)} を受け取り期限を延長する`, { size: 15, wrap: iw }));
      st.add(this.findingsList(ses, iw));
      st.add(hbox(this, [
        button(this, '応じる', () => act({ type: 'ACCEPT_REQUEST' }), { variant: 'primary', size: 16 }),
        button(this, '断る', () => act({ type: 'REFUSE' }), { variant: 'danger', size: 16 }),
      ], 8));
      return;
    }

    const offer = () => {
      const n = Number(ui.offer.replace(/[^\d]/g, ''));
      if (!n) return toast('金額を入力してほしい。');
      act({ type: 'OFFER', amount: n });
    };
    st.add(hbox(this, [
      txt(this, 0, 0, c.intent === 'pawn' ? '質入れ希望' : '買取希望', { size: 14 }),
      txt(this, 0, 0, yen(ses.ask), { size: 24, bold: true }),
      c.intent === 'pawn' ? txt(this, 0, 0, `利率 ${Math.round(s.rate * 100)}% / ${CONFIG.loanTermDays}日`, { size: 12, color: INK.muted }) : null,
    ], 10));
    st.add(this.findingsList(ses, iw));
    const field = numberField(this, {
      id: 'offer', w: iw - 120, value: ui.offer, placeholder: '金額を入力',
      onChange: (v) => { ui.offer = v; },
      onEnter: offer,
    });
    st.add(hbox(this, [txt(this, 0, 0, '¥', { size: 18, bold: true }), field, button(this, '提示', offer, { variant: 'primary', size: 16, padX: 22 })], 6));
    const nudge = (f: number) => {
      const base = Number(ui.offer.replace(/[^\d]/g, '')) || ses.ask;
      ui.offer = String(Math.max(100, Math.round((base * f) / 100) * 100));
      notify();
    };
    st.add(hbox(this, [
      button(this, '−10%', () => nudge(0.9), { size: 13 }),
      button(this, '+10%', () => nudge(1.1), { size: 13 }),
      button(this, '希望額', () => { ui.offer = String(ses.ask); notify(); }, { size: 13 }),
      button(this, '半額', () => { ui.offer = String(Math.round(ses.ask / 200) * 100); notify(); }, { size: 13 }),
    ], 6));
    st.add(hbox(this, [
      button(this, '断る', () => act({ type: 'REFUSE' }), { variant: 'danger', size: 15 }),
      button(this, reportable ? '🚓 通報' : '🚓 通報（証拠が必要）', () => act({ type: 'REPORT' }), { variant: 'warn', size: 15, disabled: !reportable }),
    ], 8));
  }

  private findingsList(ses: Session, iw: number): Container | null {
    if (ses.findings.length === 0) return null;
    const dealing = !ses.closed && (ses.customer.intent === 'pawn' || ses.customer.intent === 'sell');
    const rows: Box[] = [txt(this, 0, 0, '発見した問題', { size: 13, bold: true, color: INK.red })];
    for (const f of ses.findings) {
      const btn = f.pointable && dealing
        ? button(this, ses.pointed.includes(f.key) ? '指摘済み' : '指摘する', () => act({ type: 'POINT_OUT', key: f.key }), { size: 12, disabled: ses.pointed.includes(f.key) })
        : null;
      const label = txt(this, 0, 0, f.label, { size: 13, wrap: iw - 24 - (btn ? btn.width + 8 : 0) });
      const row = this.add.container(0, 0, [label]).setSize(iw - 16, Math.max(label.height, btn?.height ?? 0));
      label.setY((row.height - label.height) / 2);
      if (btn) {
        btn.setPosition(iw - 16 - btn.width, (row.height - btn.height) / 2);
        row.add(btn);
      }
      rows.push(row);
    }
    const inner = vbox(this, rows, 4);
    inner.setPosition(8, 6);
    const bg = rect(this, 0, 0, iw, inner.height + 12, COLOR.red, { alpha: 0.06, radius: 4, stroke: COLOR.red, strokeAlpha: 0.35 });
    return this.add.container(0, 0, [bg, inner]).setSize(iw, inner.height + 12);
  }

  // -------------------------------------------------------------- 参照資料

  private referencePanel(s: GameState): void {
    panel(this, R.x, REF.y, R.w, REF.h);
    const tabs: [typeof ui.refTab, string][] = [['rules', '規則帳'], ['catalog', 'カタログ'], ['stolen', `手配書 (${s.stolenList.length})`], ['today', '本日の取引']];
    const tw = (R.w - 24 - 6) / tabs.length;
    tabs.forEach(([id, label], i) => {
      const b = button(this, label, () => { ui.refTab = id; notify(); }, { variant: ui.refTab === id ? 'tabActive' : 'tab', size: 13, w: tw, h: 30 });
      b.setPosition(R.x + 12 + i * (tw + 2), REF.y + 8);
    });
    rect(this, R.x + 12, REF.y + 38, R.w - 24, 2, COLOR.brassDark);
    const sv = this.scroll(`ref:${ui.refTab}`, R.x + 12, REF.y + 44, R.w - 24, REF.h - 52);
    const st = new Stack(sv.content, 0, 4, 6);
    const iw = R.w - 36;
    this.refBody(s, st, iw);
    sv.setContentHeight(st.y + 4);
  }

  private refBody(s: GameState, st: Stack, iw: number): void {
    switch (ui.refTab) {
      case 'rules':
        activeRules(s.day).forEach((r, i) => {
          st.add(hbox(this, [txt(this, 0, 0, `${i + 1}. ${r.title}`, { size: 14, bold: true }), r.unlockDay === s.day ? tag(this, 'NEW', 'new', 11) : null], 6), 2);
          st.add(txt(this, 0, 0, r.text, { size: 13, wrap: iw - 16, lineSpacing: 4 }), 10, 16);
        });
        return;
      case 'stolen': {
        st.add(txt(this, 0, 0, '潮見署 盗品手配書（届出から 5 日間掲載）', { size: 12, color: INK.muted }));
        const cols = [130, 250, 80];
        const row = (cells: Box[], line = true) => {
          const r = hbox(this, cells.map((c, i) => fixedWidth(this, c, cols[i])), 6);
          const c = this.add.container(0, 0, [r]).setSize(iw, r.height + 6);
          if (line) c.add(rect(this, 0, r.height + 3, iw, 1, COLOR.black, { alpha: 0.12 }));
          return c;
        };
        st.add(row(['シリアル', '品名', '届出'].map((h) => txt(this, 0, 0, h, { size: 12, color: INK.muted }))), 2);
        for (const e of s.stolenList) {
          st.add(row([
            this.ref(`stolen.${e.serial}`, e.serial, { mono: true, size: 13 }),
            txt(this, 0, 0, itemDef(e.defId).name, { size: 13, wrap: cols[1] }),
            txt(this, 0, 0, `${e.reportedDay} 日目`, { size: 13 }),
          ]), 2);
        }
        return;
      }
      case 'today':
        st.add(txt(this, 0, 0, '本日取引した人物', { size: 14, bold: true, font: 'serif' }));
        if (s.todayVisitors.length === 0) st.add(txt(this, 0, 0, 'まだいない。', { size: 13, color: INK.muted }));
        for (const k of s.todayVisitors) {
          const [name, birth] = k.split('|');
          st.add(txt(this, 0, 0, `・${name}（${toWareki(birth)}生）`, { size: 13 }), 3);
        }
        st.space(8);
        st.add(txt(this, 0, 0, '本日の帳簿', { size: 14, bold: true, font: 'serif' }));
        for (const l of s.ledger) st.add(this.ledgerRow(l.label, l.amount, iw), 3);
        return;
      case 'catalog':
      default:
        this.catalog(s, st, iw);
    }
  }

  private ledgerRow(label: string, amount: number, w: number): Container {
    const l = txt(this, 0, 0, label, { size: 13, wrap: w - 110 });
    const a = txt(this, 0, 0, yen(amount), { size: 13, bold: true, color: amount < 0 ? INK.red : INK.green });
    a.setPosition(w - a.width, 0);
    return this.add.container(0, 0, [l, a]).setSize(w, Math.max(l.height, a.height));
  }

  private catalogEntry(s: GameState, defId: string, current: boolean, iw: number): Container {
    const d = itemDef(defId);
    const m = s.market[d.category];
    const price = Math.round((d.basePrice * m) / 1000) * 1000;
    const trend = m >= 1.05 ? ' ▲' : m <= 0.95 ? ' ▼' : '';
    if (!current) {
      // 一覧はテキストをまとめて軽くする（再描画のたびに数十件作り直すため）
      const name = txt(this, 0, 0, `${d.emoji} ${d.name}　${CATEGORY_LABEL[d.category]}`, { size: 14, bold: true, wrap: iw });
      const facts = txt(this, 0, 0, `相場 ${yen(price)}${trend}　刻印 ${d.hallmark}　重量 ${d.weightG} g　素材 ${MATERIAL_LABEL[d.material]}`, { size: 12, wrap: iw });
      const desc = txt(this, 0, 0, d.desc, { size: 12, color: INK.muted, wrap: iw, lineSpacing: 3 });
      const body = vbox(this, [name, facts, desc], 2);
      return this.add.container(0, 0, [body, rect(this, 0, body.height + 4, iw, 1, COLOR.black, { alpha: 0.12 })]).setSize(iw, body.height + 6);
    }
    const w = iw - 16;
    const name = hbox(this, [txt(this, 0, 0, d.emoji, { size: 18 }), txt(this, 0, 0, d.name, { size: 14, bold: true }), txt(this, 0, 0, CATEGORY_LABEL[d.category], { size: 12, color: INK.muted })], 6);
    const factRef = (label: string, value: string, refId: string, mono = false) => hbox(this, [
      txt(this, 0, 0, label, { size: 12, color: INK.muted }),
      this.ref(refId, value, { mono, size: 13 }),
    ], 4);
    const facts = hbox(this, [
      hbox(this, [txt(this, 0, 0, '相場', { size: 12, color: INK.muted }), txt(this, 0, 0, `${yen(price)}${trend}`, { size: 13, bold: true, color: trend === ' ▲' ? INK.green : trend === ' ▼' ? INK.red : INK.ink })], 4),
      factRef('刻印', d.hallmark, 'catalog.hallmark', true),
      factRef('重量', `${d.weightG} g`, 'catalog.weight', true),
      factRef('素材', MATERIAL_LABEL[d.material], 'catalog.material'),
    ], 12);
    const desc = txt(this, 0, 0, d.desc, { size: 12, color: INK.muted, wrap: w, lineSpacing: 3 });
    const body = vbox(this, [name, facts, desc], 3);
    body.setPosition(8, 8);
    const bg = rect(this, 0, 0, iw, body.height + 16, COLOR.brass, { alpha: 0.14, radius: 4, stroke: COLOR.brass, strokeWidth: 2 });
    return this.add.container(0, 0, [bg, body]).setSize(iw, body.height + 16);
  }

  private catalog(s: GameState, st: Stack, iw: number): void {
    const cur = s.session?.customer.item?.defId;
    st.add(txt(this, 0, 0, '状態による目安：A 85% / B 70% / C 50% / D 30%。欠陥ごとにさらに減額。', { size: 12, color: INK.muted, wrap: iw }));
    if (cur) st.add(this.catalogEntry(s, cur, true, iw), 10);
    // 分類で絞り込む札
    const chips = [['', 'すべて'], ...CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]])];
    let cx = 0;
    let cy = st.y;
    let rowH = 0;
    for (const [id, label] of chips) {
      const b = button(this, label, () => { ui.catalogFilter = id; notify(); }, { size: 12, variant: ui.catalogFilter === id ? 'active' : 'normal', padX: 8 });
      if (cx + b.width > iw) {
        cx = 0;
        cy += rowH + 4;
      }
      st.put(b, cx, cy);
      cx += b.width + 4;
      rowH = b.height;
    }
    st.y = cy + rowH + 10;
    const list = ITEMS.filter((d) => d.id !== cur && (!ui.catalogFilter || d.category === ui.catalogFilter));
    for (const d of list) st.add(this.catalogEntry(s, d.id, false, iw), 6);
  }
}
