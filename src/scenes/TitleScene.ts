// タイトル画面。

import { button, hbox, rect, Stack, txt } from '../ui/kit';
import { clearSave, continueGame, loadSave, notify, startNew, ui } from '../ui/store';
import { COLOR, H, INK, W } from '../ui/theme';
import { BaseScene } from './BaseScene';

const HOWTO = [
  '朝：新聞・通達・盗品手配書を確認して開店する。',
  '窓口：客を呼び、道具（ルーペ・天秤など）で品物を調べる。調べると時間が進む。書類や品物は机の上でドラッグして並べられる。',
  '「照合」ボタンで照合モードにし、2 つの項目（例：品物の刻印とカタログの刻印、身分証の写真と客の顔、有効期限と今日の日付）をクリックすると、不一致を発見できる。',
  '見つけた欠陥や偽物の証拠は「指摘」して値下げ交渉に使える。盗品や偽造身分証は「通報」で謝礼がもらえる。',
  '金額を提示して交渉する。質入れなら質札を発行し、期限内に客が元金＋利息を払えば利益、来なければ質流れ品として売れる。',
  '規則帳に違反する取引は、後日発覚すると罰金と違反点。10 点で営業許可取消。',
  '夜：生活費を払い、在庫を陳列・売却し、道具に投資する。返済日には定期返済がある。',
];

export class TitleScene extends BaseScene {
  constructor() {
    super('title');
  }

  protected background(): number {
    return 0x15100c;
  }

  protected build(): void {
    // 中央がほのかに明るい背景
    for (let i = 6; i >= 1; i--) {
      this.add.ellipse(W / 2, H / 2, W * 0.22 * i, H * 0.24 * i, 0x3d2d1f, 0.18).setDepth(-2);
    }

    const cx = W / 2;
    const title = txt(this, 0, 0, '七つ屋', { size: 110, color: INK.brass, font: 'serif', black: true });
    title.setLetterSpacing(16).setShadow(0, 5, '#000000', 0, false, true);
    title.setPosition(cx - title.width / 2, 70);
    this.tweens.add({ targets: title, alpha: { from: 0, to: 1 }, y: { from: 50, to: 70 }, duration: 700, ease: 'Cubic.easeOut' });

    const sub = txt(this, 0, 0, 'NANATSUYA — 質屋経営シミュレーション', { size: 14, color: INK.paperDark });
    sub.setLetterSpacing(4).setPosition(cx - sub.width / 2, 222);

    const lead = txt(this, 0, 0,
      '平成三年、不況にあえぐ港町・潮見市。亡き祖父の質屋を継いだあなたには、¥1,000,000 の借金が残された。\n身分証を照合し、品物の真贋を見抜き、値をつけ、店を守れ。期限は 30 日。',
      { size: 16, color: INK.paper, wrap: 640, align: 'center', lineSpacing: 12 });
    lead.setPosition(cx - lead.width / 2, 280);

    const saved = loadSave();
    const btns = hbox(this, [
      button(this, '新しく始める', () => { clearSave(); startNew(); }, { variant: 'primary', size: 18 }),
      saved && saved.phase !== 'ending' ? button(this, `続きから（${saved.day} 日目）`, () => continueGame(), { size: 18 }) : null,
      button(this, ui.showHowto ? '遊び方を閉じる' : '遊び方', () => { ui.showHowto = !ui.showHowto; notify(); }, { variant: 'dark', size: 18 }),
    ], 16);
    btns.setPosition(cx - btns.width / 2, 410);

    if (ui.showHowto) {
      const w = 760;
      const x = cx - w / 2;
      const y = 476;
      const st = new Stack(null, x + 20, y + 14, 6);
      HOWTO.forEach((line, i) => {
        st.add(txt(this, 0, 0, `${i + 1}. ${line}`, { size: 14, color: INK.paper, wrap: w - 40, lineSpacing: 4 }));
      });
      rect(this, x, y, w, st.y - y + 8, COLOR.black, { alpha: 0.6, radius: 6, stroke: COLOR.white, strokeAlpha: 0.15 }).setDepth(-1);
    }
  }
}
