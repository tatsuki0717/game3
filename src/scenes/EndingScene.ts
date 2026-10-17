// エンディング画面。

import { yen } from '../core/dates';
import type { EndingId } from '../core/types';
import { button, hbox, rect, txt } from '../ui/kit';
import { clearSave, getState, startNew, toTitle } from '../ui/store';
import { COLOR, H, INK, W } from '../ui/theme';
import { BaseScene } from './BaseScene';

const ENDINGS: Record<EndingId, { title: string; text: string; good: boolean }> = {
  revival: {
    title: '老舗再興',
    text: '借金を返し終えた七つ屋には、今日も町の人が品物と悩みを抱えてやってくる。「品物を見る前に、人を見ろ」――祖父の言葉の意味が、少しだけわかった気がする。',
    good: true,
  },
  cold_lender: {
    title: '冷徹な金貸し',
    text: '借金は完済した。帳簿は黒字だ。だが、町の人はもうこの店を「七つ屋さん」とは呼ばない。店先に灯る明かりは、どこか冷たい。',
    good: true,
  },
  town_light: {
    title: '町の灯',
    text: '借金は残った。だが、債権者の前に立ったのは町の人々だった。「この店がなくなったら困る」――集まったお金と嘆願で、返済は猶予された。七つ屋の灯は、まだ消えない。',
    good: true,
  },
  closed: {
    title: '閉店',
    text: '期限までに借金を返すことはできなかった。シャッターに貼られた差し押さえの紙を、冬の風が揺らしている。',
    good: false,
  },
  sold: {
    title: '売却',
    text: '店は金森不動産のものになった。借金は消えたが、祖父の店は取り壊され、跡地には駐車場ができるらしい。',
    good: false,
  },
  arrested: {
    title: '裏の質屋',
    text: '盗品売買の容疑で、あなたは逮捕された。タカとの取引記録が、何よりの証拠だった。七つ屋の看板は、警察の手で外された。',
    good: false,
  },
  revoked: {
    title: '営業許可取消',
    text: '度重なる違反で、公安委員会から営業許可を取り消された。規則を軽んじた店に、居場所はなかった。',
    good: false,
  },
  foreclosed: {
    title: '差し押さえ',
    text: '返済が滞り、店は債権者に差し押さえられた。祖父の店は、わずかな期間で人手に渡った。',
    good: false,
  },
};

export class EndingScene extends BaseScene {
  constructor() {
    super('ending');
  }

  protected background(): number {
    const s = getState();
    return ENDINGS[s.ending ?? 'closed'].good ? 0x15100c : 0x0c0c0f;
  }

  protected build(): void {
    const s = getState();
    const e = ENDINGS[s.ending ?? 'closed'];
    for (let i = 6; i >= 1; i--) {
      this.add.ellipse(W / 2, H / 2, W * 0.24 * i, H * 0.26 * i, e.good ? 0x4a3a22 : 0x2a2a30, 0.2);
    }
    const cx = W / 2;
    const label = txt(this, 0, 0, 'ENDING', { size: 14, color: INK.muted });
    label.setLetterSpacing(10).setPosition(cx - label.width / 2, 70);
    const title = txt(this, 0, 0, e.title, { size: 56, color: INK.brass, font: 'serif', black: true });
    title.setPosition(cx - title.width / 2, 100);
    this.tweens.add({ targets: title, alpha: { from: 0, to: 1 }, scale: { from: 0.92, to: 1 }, duration: 900, ease: 'Cubic.easeOut' });
    const text = txt(this, 0, 0, e.text, { size: 17, color: INK.paper, wrap: 620, align: 'center', lineSpacing: 14 });
    text.setPosition(cx - text.width / 2, 200);
    this.tweens.add({ targets: text, alpha: { from: 0, to: 1 }, duration: 1200, delay: 400 });

    const loansActive = s.loans.filter((l) => l.status === 'active').length;
    const rows: [string, string][] = [
      ['到達日', `${s.day} 日目`],
      ['所持金', yen(s.money)],
      ['借金残高', yen(s.debt)],
      ['評判', String(s.reputation)],
      ['違反点', String(s.violationPoints)],
      ['発行した質札', `${s.nextTicketNo - 1} 枚（未決済 ${loansActive}）`],
      ['良心', s.conscience >= 5 ? '清らか' : s.conscience >= 0 ? 'ふつう' : s.conscience > -10 ? 'すり減った' : '失われた'],
    ];
    const tw = 380;
    let y = text.y + text.height + 36;
    for (const [k, v] of rows) {
      txt(this, cx - tw / 2, y, k, { size: 15, color: INK.muted });
      txt(this, cx - tw / 2 + 150, y, v, { size: 15, color: INK.paper });
      y += 28;
      rect(this, cx - tw / 2, y - 4, tw, 1, COLOR.white, { alpha: 0.12 });
    }
    const btns = hbox(this, [
      button(this, 'もう一度遊ぶ', () => { clearSave(); startNew(); }, { variant: 'primary', size: 17 }),
      button(this, 'タイトルへ', () => toTitle(), { size: 17 }),
    ], 16);
    btns.setPosition(cx - btns.width / 2, y + 24);
  }
}
