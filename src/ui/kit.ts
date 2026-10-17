// Phaser 上で使う小さな UI 部品集（テキスト・ボタン・横並び/縦並び・スクロール領域・数値入力）。

import * as Phaser from 'phaser';
import { COLOR, FONT, INK, TEXT_RESOLUTION } from './theme';

type Scene = Phaser.Scene;
type Text = Phaser.GameObjects.Text;
type Container = Phaser.GameObjects.Container;
/** 位置とサイズを持つ表示物 */
export type Box = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & {
  displayWidth: number;
  displayHeight: number;
};

// ---------------------------------------------------------------- テキスト

export interface TextOpts {
  size?: number;
  color?: string;
  bold?: boolean;
  black?: boolean;
  font?: keyof typeof FONT;
  wrap?: number;
  align?: 'left' | 'center' | 'right';
  lineSpacing?: number;
}

const NO_LINE_START = '、。，．,.）)」』】〕〉》｝]・ー…‥！？!?ゃゅょっぁぃぅぇぉャュョッァィゥェォ％%';
const NO_LINE_END = '（(「『【〔〈《｛[¥￥';

/** 日本語向けの折り返し（文字単位＋簡単な禁則、英数字の連なりは分割しない） */
function jpWrap(width: number) {
  return (text: string, obj: Text): string[] => {
    const ctx = obj.context;
    const out: string[] = [];
    for (const para of text.split('\n')) {
      const tokens = para.match(/[A-Za-z0-9¥￥,.:%+\-/#()]+|./gu) ?? [''];
      let line = '';
      for (const t of tokens) {
        const next = line + t;
        if (line && ctx.measureText(next).width > width) {
          if (NO_LINE_START.includes(t[0])) {
            line = next; // ぶら下げ
            continue;
          }
          const last = line.slice(-1);
          if (NO_LINE_END.includes(last)) {
            out.push(line.slice(0, -1));
            line = last + t;
            continue;
          }
          out.push(line);
          line = t.trimStart();
        } else line = next;
      }
      out.push(line);
    }
    return out;
  };
}

export function txt(scene: Scene, x: number, y: number, s: string, o: TextOpts = {}): Text {
  const t = scene.add.text(x, y, s, {
    fontFamily: FONT[o.font ?? 'sans'],
    fontSize: `${o.size ?? 15}px`,
    color: o.color ?? INK.ink,
    fontStyle: o.black ? '900' : o.bold ? 'bold' : 'normal',
    align: o.align ?? 'left',
    lineSpacing: o.lineSpacing ?? 2,
    resolution: TEXT_RESOLUTION,
    padding: { top: 2, bottom: 2 },
  });
  if (o.wrap) t.setWordWrapCallback(jpWrap(o.wrap));
  return t.setOrigin(0, 0);
}

// ---------------------------------------------------------------- 図形

export function rect(scene: Scene, x: number, y: number, w: number, h: number, color: number, o: { alpha?: number; radius?: number; stroke?: number; strokeWidth?: number; strokeAlpha?: number } = {}) {
  const r = scene.add.rectangle(x, y, w, h, color, o.alpha ?? 1).setOrigin(0, 0);
  if (o.radius) r.setRounded(o.radius);
  if (o.stroke !== undefined) r.setStrokeStyle(o.strokeWidth ?? 1, o.stroke, o.strokeAlpha ?? 1);
  return r;
}

/** 影つきの紙パネル */
export function panel(scene: Scene, x: number, y: number, w: number, h: number, color: number = COLOR.paper, radius = 6, depth = 0) {
  rect(scene, x + 2, y + 3, w, h, COLOR.black, { alpha: 0.35, radius }).setDepth(depth);
  return rect(scene, x, y, w, h, color, { radius }).setDepth(depth);
}

// ---------------------------------------------------------------- レイアウト

/** 子を横に並べた Container を作る（縦方向は中央揃え） */
export function hbox(scene: Scene, items: (Box | null | undefined | false)[], gap = 6, align: 'center' | 'top' = 'center'): Container {
  const list = items.filter(Boolean) as Box[];
  const h = Math.max(0, ...list.map((o) => o.displayHeight));
  let x = 0;
  for (const o of list) {
    o.setPosition(x, align === 'center' ? Math.round((h - o.displayHeight) / 2) : 0);
    x += o.displayWidth + gap;
  }
  const c = scene.add.container(0, 0, list);
  c.setSize(Math.max(0, x - gap), h);
  return c;
}

/** 子を縦に並べた Container を作る */
export function vbox(scene: Scene, items: (Box | null | undefined | false)[], gap = 4): Container {
  const list = items.filter(Boolean) as Box[];
  let y = 0;
  for (const o of list) {
    o.setPosition(o.x, y);
    y += o.displayHeight + gap;
  }
  const c = scene.add.container(0, 0, list);
  c.setSize(Math.max(0, ...list.map((o) => o.x + o.displayWidth)), Math.max(0, y - gap));
  return c;
}

/** 上から順に積んでいくカーソル */
export class Stack {
  y: number;
  constructor(private parent: Container | null, public x: number, y: number, public gap = 6) {
    this.y = y;
  }
  add<T extends Box>(o: T | null | undefined | false, gap = this.gap, dx = 0): T | null {
    if (!o) return null;
    o.setPosition(this.x + dx, this.y);
    this.parent?.add(o);
    this.y += o.displayHeight + gap;
    return o;
  }
  space(n: number): void {
    this.y += n;
  }
  /** カーソルを進めずに好きな位置へ置く */
  put<T extends Box>(o: T, x: number, y: number): T {
    o.setPosition(this.x + x, y);
    this.parent?.add(o);
    return o;
  }
}

/** 固定サイズの空き（hbox の幅合わせに使う） */
export function spacer(scene: Scene, w: number, h = 1): Container {
  return scene.add.container(0, 0).setSize(w, h);
}

/** 中身を固定幅の枠に収める（左寄せ） */
export function fixedWidth(scene: Scene, o: Box, w: number): Container {
  const c = scene.add.container(0, 0, [o]);
  c.setSize(w, o.displayHeight);
  return c;
}

// ---------------------------------------------------------------- ボタン

export type ButtonVariant = 'normal' | 'primary' | 'danger' | 'warn' | 'active' | 'dark' | 'tab' | 'tabActive';

const VARIANT: Record<ButtonVariant, { fill: number; hover: number; stroke: number; color: string; bold?: boolean }> = {
  normal: { fill: 0xeadcba, hover: 0xf5ead2, stroke: COLOR.brassDark, color: INK.ink },
  primary: { fill: 0xc7a14b, hover: 0xd9b55c, stroke: 0x7a5c1c, color: INK.ink, bold: true },
  danger: { fill: 0xb8573f, hover: 0xd06a52, stroke: 0x7a2a1e, color: INK.white },
  warn: { fill: 0x4d7ba0, hover: 0x5f8db3, stroke: 0x24435c, color: INK.white },
  active: { fill: 0xf0d68a, hover: 0xfff3cf, stroke: COLOR.brass, color: INK.ink, bold: true },
  dark: { fill: COLOR.tool, hover: 0x5d4a37, stroke: COLOR.black, color: INK.paper },
  tab: { fill: COLOR.paperDark, hover: 0xeee2c4, stroke: COLOR.paperDark, color: INK.ink },
  tabActive: { fill: COLOR.brass, hover: COLOR.brass, stroke: COLOR.brass, color: INK.ink, bold: true },
};

export interface ButtonOpts {
  variant?: ButtonVariant;
  size?: number;
  w?: number;
  h?: number;
  padX?: number;
  disabled?: boolean;
  align?: 'center' | 'left';
}

/** 押下中にスクロールのドラッグが起きたらクリックを無効にするための印 */
export const pointerState = { dragScrolled: false };

export function button(scene: Scene, label: string, onClick: () => void, o: ButtonOpts = {}): Container {
  const v = VARIANT[o.variant ?? 'normal'];
  const size = o.size ?? 15;
  const t = txt(scene, 0, 0, label, { size, color: v.color, bold: v.bold, align: o.align === 'left' ? 'left' : 'center' });
  const padX = o.padX ?? Math.round(size * 0.9);
  const w = o.w ?? Math.ceil(t.width + padX * 2);
  const h = o.h ?? Math.ceil(t.height + size * 0.6);
  const bg = rect(scene, 0, 0, w, h, v.fill, { radius: 4, stroke: v.stroke });
  t.setPosition(o.align === 'left' ? padX : Math.round((w - t.width) / 2), Math.round((h - t.height) / 2));
  const c = scene.add.container(0, 0, [bg, t]);
  c.setSize(w, h);
  if (o.disabled) {
    c.setAlpha(0.45);
    return c;
  }
  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerover', () => bg.setFillStyle(v.hover));
  bg.on('pointerout', () => bg.setFillStyle(v.fill));
  bg.on('pointerdown', () => {
    pointerState.dragScrolled = false;
    t.setY(Math.round((h - t.height) / 2) + 1);
  });
  bg.on('pointerup', () => {
    t.setY(Math.round((h - t.height) / 2));
    if (!pointerState.dragScrolled) onClick();
  });
  return c;
}

/** チェックボックス風の切り替え */
export function checkbox(scene: Scene, label: string, checked: boolean, onToggle: () => void, o: { disabled?: boolean; size?: number } = {}): Container {
  const size = o.size ?? 15;
  const box = rect(scene, 0, 0, 16, 16, checked ? COLOR.brass : 0xfffdf6, { radius: 3, stroke: COLOR.brassDark });
  const mark = txt(scene, 2, -3, checked ? '✓' : '', { size: 15, bold: true });
  const t = txt(scene, 22, 0, label, { size });
  const c = hbox(scene, [scene.add.container(0, 0, [box, mark]).setSize(16, 16), t], 6);
  if (o.disabled) {
    box.setAlpha(0.6);
    return c;
  }
  const hit = scene.add.rectangle(0, 0, c.width, c.height, 0, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
  hit.on('pointerup', () => !pointerState.dragScrolled && onToggle());
  hit.on('pointerdown', () => { pointerState.dragScrolled = false; });
  c.add(hit);
  return c;
}

/** 小さな札（タグ） */
export function tag(scene: Scene, label: string, kind: 'bad' | 'good' | 'new' | 'plain' = 'plain', size = 12): Container {
  const colors = {
    bad: { fill: COLOR.red, alpha: 0.15, color: INK.red },
    good: { fill: COLOR.green, alpha: 0.15, color: INK.green },
    new: { fill: COLOR.red, alpha: 1, color: INK.white },
    plain: { fill: COLOR.black, alpha: 0.07, color: INK.ink },
  }[kind];
  const t = txt(scene, 5, 0, label, { size, color: colors.color, bold: kind !== 'plain' });
  const bg = rect(scene, 0, 0, t.width + 10, t.height, colors.fill, { alpha: colors.alpha, radius: 3 });
  return scene.add.container(0, 0, [bg, t]).setSize(t.width + 10, t.height);
}

// ---------------------------------------------------------------- スクロール領域

/**
 * 画面の一部をスクロールさせる領域。
 * 中身は画面外の離れた座標に置き、その位置を映す専用カメラ（ビューポート＝表示枠）で切り抜く。
 * マスクを使わないので軽く、入力判定もカメラ経由でそのまま効く。
 */
export class ScrollView {
  static positions = new Map<string, number>();
  private static slot = 0;

  readonly content: Container;
  readonly camera: Phaser.Cameras.Scene2D.Camera;
  readonly originX: number;
  readonly originY = 0;
  private contentHeight = 0;
  private bar: Phaser.GameObjects.Rectangle;
  private dragStartY: number | null = null;
  private dragStartScroll = 0;

  static resetSlots(): void {
    ScrollView.slot = 0;
  }

  constructor(private scene: Scene, readonly id: string, readonly x: number, readonly y: number, readonly w: number, readonly h: number) {
    this.originX = 10000 + ScrollView.slot++ * 2000;
    this.content = scene.add.container(this.originX, this.originY);
    this.camera = scene.cameras.add(x, y, w, h).setName(`scroll:${id}`);
    this.camera.transparent = true;
    this.bar = scene.add.rectangle(x + w - 4, y, 4, 10, COLOR.black, 0.25).setOrigin(0, 0).setVisible(false);
    this.bar.setDepth(1000);

    scene.input.on('wheel', this.onWheel, this);
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
  }

  /** 中身を積み終えたら高さを伝える */
  setContentHeight(hh: number, opts: { stickToBottom?: boolean } = {}): void {
    this.contentHeight = hh;
    const saved = ScrollView.positions.get(this.id);
    this.scrollTo(opts.stickToBottom ? Infinity : saved ?? 0);
  }

  get maxScroll(): number {
    return Math.max(0, this.contentHeight - this.h);
  }

  scrollTo(v: number): void {
    const s = Phaser.Math.Clamp(v, 0, this.maxScroll);
    ScrollView.positions.set(this.id, s);
    this.camera.setScroll(this.originX, this.originY + s);
    if (this.maxScroll > 0) {
      const bh = Math.max(24, (this.h * this.h) / this.contentHeight);
      this.bar.setVisible(true).setSize(4, bh).setY(this.y + ((this.h - bh) * s) / this.maxScroll);
    } else this.bar.setVisible(false);
  }

  private contains(p: Phaser.Input.Pointer): boolean {
    return p.x >= this.x && p.x <= this.x + this.w && p.y >= this.y && p.y <= this.y + this.h;
  }

  private onWheel(p: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number): void {
    if (this.contains(p) && this.maxScroll > 0) this.scrollTo((ScrollView.positions.get(this.id) ?? 0) + dy * 0.6);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.contains(p) || this.maxScroll === 0) return;
    this.dragStartY = p.y;
    this.dragStartScroll = ScrollView.positions.get(this.id) ?? 0;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.dragStartY === null || !p.isDown) return;
    const d = this.dragStartY - p.y;
    if (Math.abs(d) > 8) pointerState.dragScrolled = true;
    if (pointerState.dragScrolled) this.scrollTo(this.dragStartScroll + d);
  }

  private onUp(): void {
    this.dragStartY = null;
  }

  destroy(): void {
    this.scene.input.off('wheel', this.onWheel, this);
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
    this.scene.cameras.remove(this.camera);
  }
}

// ---------------------------------------------------------------- 数値入力

/**
 * キャンバス上の数値入力欄。フォーカス時は隠し <input> にキー入力を受けさせ、
 * スマホでも数字キーボードが出るようにする。
 */
export function numberField(scene: Scene, opts: { w: number; value: string; placeholder?: string; onChange: (v: string) => void; onEnter?: () => void; id: string }): Container {
  const h = 34;
  const bg = rect(scene, 0, 0, opts.w, h, 0xfffdf6, { radius: 4, stroke: COLOR.brassDark });
  const shown = () => (opts.value ? Number(opts.value).toLocaleString('ja-JP') : '');
  const t = txt(scene, 10, 7, shown() || opts.placeholder || '', { size: 16, color: opts.value ? INK.ink : INK.faint, font: 'mono' });
  const caret = rect(scene, 0, 8, 2, 18, COLOR.ink).setVisible(false);
  const c = scene.add.container(0, 0, [bg, t, caret]).setSize(opts.w, h);
  const input = document.getElementById('hidden-input') as HTMLInputElement | null;

  const render = () => {
    t.setText(shown() || opts.placeholder || '').setColor(opts.value ? INK.ink : INK.faint);
    caret.setX(opts.value ? 10 + t.width + 1 : 10);
  };
  let blink: Phaser.Time.TimerEvent | null = null;
  const focus = () => {
    if (!input) return;
    focusedField?.blur();
    input.value = opts.value;
    input.focus({ preventScroll: true });
    bg.setStrokeStyle(2, COLOR.brass);
    caret.setVisible(true);
    render();
    blink = scene.time.addEvent({ delay: 500, loop: true, callback: () => caret.setVisible(!caret.visible) });
    focusedField = { id: opts.id, blur };
    input.oninput = () => {
      opts.value = input.value.replace(/[^\d]/g, '').slice(0, 9);
      input.value = opts.value;
      opts.onChange(opts.value);
      render();
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        opts.onEnter?.();
        input.blur();
      }
    };
    input.onblur = () => blur();
  };
  const blur = () => {
    blink?.remove();
    blink = null;
    if (!c.active) return;
    caret.setVisible(false);
    bg.setStrokeStyle(1, COLOR.brassDark);
    if (focusedField?.id === opts.id) focusedField = null;
  };
  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerup', focus);
  c.once('destroy', () => {
    blink?.remove();
    if (input && focusedField?.id === opts.id) {
      input.oninput = null;
      input.onkeydown = null;
      input.onblur = null;
    }
  });
  if (focusedField?.id === opts.id) scene.time.delayedCall(0, focus);
  return c;
}

let focusedField: { id: string; blur: () => void } | null = null;

/** 再描画後もフォーカスを引き継ぐため、現在フォーカス中の入力欄 ID を覚えておく */
export function isFieldFocused(id: string): boolean {
  return focusedField?.id === id;
}
