// 全シーン共通の土台：状態が変わったら描き直す、HUD、トースト、スクロール領域の管理。

import * as Phaser from 'phaser';
import { CONFIG } from '../core/config';
import { dateOfDay, formatClock, toWareki, yen } from '../core/dates';
import type { GameState } from '../core/types';
import { hbox, rect, ScrollView, txt, vbox } from '../ui/kit';
import { currentSceneKey, onToast, renderVersion, ui } from '../ui/store';
import { COLOR, H, INK, W } from '../ui/theme';

export const HUD_H = 56;
const OVERLAY_X = -20000;

export abstract class BaseScene extends Phaser.Scene {
  private builtVersion = -1;
  protected scrolls: ScrollView[] = [];
  private overlay!: Phaser.GameObjects.Container;
  private overlayCam!: Phaser.Cameras.Scene2D.Camera;
  private toastBox: Phaser.GameObjects.Container | null = null;
  private offToast: (() => void) | null = null;
  protected clockText: Phaser.GameObjects.Text | null = null;

  /** 画面の中身を作る（毎回ゼロから作り直す） */
  protected abstract build(): void;

  protected background(): number {
    return COLOR.bg;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(this.background());
    this.input.dragDistanceThreshold = 6;
    this.overlay = this.add.container(OVERLAY_X, 0).setData('persist', true);
    this.offToast = onToast((msg) => this.showToast(msg));
    this.events.once('shutdown', () => {
      this.offToast?.();
      this.toastAlive = false;
      this.toastTimer = null;
      this.clearScrolls();
      this.builtVersion = -1;
    });
    this.input.keyboard?.on('keydown-ESC', () => this.onEscape());
    this.rebuild();
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  update(time: number, delta: number): void {
    const want = currentSceneKey();
    if (want !== this.scene.key) {
      this.scene.start(want);
      return;
    }
    if (this.builtVersion !== renderVersion) this.rebuild();
    this.tick(time, delta);
  }

  protected tick(_time: number, _delta: number): void {}

  protected onEscape(): void {}

  private clearScrolls(): void {
    for (const s of this.scrolls) s.destroy();
    this.scrolls = [];
    ScrollView.resetSlots();
  }

  protected rebuild(): void {
    this.builtVersion = renderVersion;
    this.tweens.killAll();
    this.clearScrolls();
    if (this.overlayCam) this.cameras.remove(this.overlayCam);
    for (const o of [...this.children.list]) if (!o.getData('persist')) o.destroy();
    this.clockText = null;
    this.build();
    this.assignCameras();
  }

  /** スクロール領域を作る（この画面の build 中だけ有効） */
  protected scroll(id: string, x: number, y: number, w: number, h: number): ScrollView {
    const sv = new ScrollView(this, id, x, y, w, h);
    this.scrolls.push(sv);
    return sv;
  }

  /** 各カメラが自分の担当だけを描くように振り分ける */
  private assignCameras(): void {
    const all = this.children.list;
    const contents = new Set<Phaser.GameObjects.GameObject>(this.scrolls.map((s) => s.content));
    this.cameras.main.ignore(all.filter((o) => contents.has(o) || o === this.overlay));
    for (const s of this.scrolls) s.camera.ignore(all.filter((o) => o !== s.content));
    this.overlayCam = this.cameras.add(0, 0, W, H).setName('overlay').setScroll(OVERLAY_X, 0);
    this.overlayCam.transparent = true;
    this.overlayCam.ignore(all.filter((o) => o !== this.overlay));
    this.overlay.removeAll(true);
    this.toastBox = null;
    if (ui.toast && this.toastAlive) this.drawToast(ui.toast, 1);
  }

  // -------------------------------------------------------------- トースト

  private toastAlive = false;
  private toastTimer: Phaser.Time.TimerEvent | null = null;

  private showToast(msg: string): void {
    this.toastAlive = true;
    this.toastTimer?.remove();
    this.drawToast(msg, 0);
    this.toastTimer = this.time.delayedCall(2600, () => {
      this.toastAlive = false;
      ui.toast = null;
      const box = this.toastBox;
      if (box) this.tweens.add({ targets: box, alpha: 0, duration: 250, onComplete: () => box.destroy() });
    });
  }

  private drawToast(msg: string, alpha: number): void {
    this.toastBox?.destroy();
    const t = txt(this, 18, 10, msg, { size: 16, color: INK.white, wrap: 760 });
    const bw = t.width + 36;
    const bh = t.height + 20;
    const bg = rect(this, 0, 0, bw, bh, COLOR.black, { alpha: 0.85, radius: 6 });
    const box = this.add.container(Math.round((W - bw) / 2), H - bh - 24, [bg, t]);
    this.overlay.add(box);
    box.setAlpha(alpha);
    this.toastBox = box;
    if (alpha < 1) {
      box.y += 12;
      this.tweens.add({ targets: box, alpha: 1, y: box.y - 12, duration: 180, ease: 'Quad.easeOut' });
    }
  }

  // -------------------------------------------------------------- HUD

  protected hud(s: GameState): void {
    rect(this, 0, 0, W, HUD_H, COLOR.hud);
    rect(this, 0, HUD_H - 2, W, 2, COLOR.brassDark);
    const day = vbox(this, [
      txt(this, 0, 0, `${s.day} 日目`, { size: 20, color: INK.brass, font: 'serif', bold: true }),
      txt(this, 0, 0, toWareki(dateOfDay(s.day)), { size: 11, color: INK.paperDark }),
    ], -2);
    day.setPosition(16, 6);

    let x = 190;
    if (s.phase === 'counter') {
      rect(this, x, 10, 100, 36, COLOR.black, { radius: 4 });
      const clock = txt(this, 0, 0, formatClock(Math.min(s.clock, CONFIG.closeMinute)), { size: 24, font: 'mono', color: s.clock >= CONFIG.closeMinute - 60 ? INK.late : INK.clock });
      clock.setPosition(x + 50 - clock.width / 2, 28 - clock.height / 2);
      this.clockText = clock;
      x += 124;
    }
    const stat = (label: string, value: string, color: string = INK.paper) => {
      const b = vbox(this, [txt(this, 0, 0, label, { size: 11, color: INK.muted }), txt(this, 0, 0, value, { size: 17, color, bold: true })], -2);
      b.setPosition(x, 8);
      x += Math.max(90, b.width + 28);
    };
    stat('所持金', yen(s.money), s.money < 0 ? INK.late : INK.paper);
    stat('借金', yen(s.debt));
    stat('評判', String(s.reputation));
    const pts = Math.min(CONFIG.violationLimit, s.violationPoints);
    const pips = hbox(this, Array.from({ length: CONFIG.violationLimit }, (_, i) => rect(this, 0, 0, 9, 14, i < pts ? COLOR.red : 0x3a3129, { radius: 2 })), 2);
    const v = vbox(this, [txt(this, 0, 0, `違反点（${CONFIG.violationLimit} 点で営業許可取消）`, { size: 11, color: INK.muted }), pips], 4);
    v.setPosition(x, 9);
  }

  /** 時計だけ更新する（毎分の再描画を避ける） */
  protected updateClock(clock: number): void {
    if (!this.clockText) return;
    this.clockText.setText(formatClock(Math.min(clock, CONFIG.closeMinute)));
    this.clockText.setColor(clock >= CONFIG.closeMinute - 60 ? INK.late : INK.clock);
  }
}
