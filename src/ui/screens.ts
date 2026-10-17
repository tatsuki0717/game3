// タイトル・朝・エンディング画面と共通 HUD。

import { CONFIG } from '../core/config';
import { dateOfDay, formatClock, toWareki, yen } from '../core/dates';
import { CATEGORIES, CATEGORY_LABEL } from '../core/data/items';
import { activeRules } from '../core/data/rules';
import type { EndingId, GameState } from '../core/types';
import { debtMeter, historyChart } from './chart';
import { h } from './dom';
import { isMuted, toggleMute } from './sound';
import { act, clearSave, continueGame, loadSave, notify, startNew, toTitle, ui } from './store';

export function hud(s: GameState): HTMLElement {
  const pts = Math.min(CONFIG.violationLimit, s.violationPoints);
  return h('header', { class: 'hud' },
    h('div', { class: 'hud-day' }, `${s.day} 日目`, h('small', null, toWareki(dateOfDay(s.day)))),
    s.phase === 'counter' ? h('div', { class: 'hud-clock', id: 'hud-clock' }, formatClock(Math.min(s.clock, CONFIG.closeMinute))) : null,
    h('div', { class: 'hud-stat' }, h('label', null, '所持金'), h('b', { id: 'hud-money', class: s.money < 0 ? 'neg' : '' }, yen(s.money))),
    h('div', { class: 'hud-stat' }, h('label', null, '借金'), h('b', null, yen(s.debt))),
    h('div', { class: 'hud-stat' }, h('label', null, '評判'), h('b', null, `${s.reputation}`)),
    h('div', { class: 'hud-stat', title: `${CONFIG.violationLimit} 点で営業許可取消` }, h('label', null, '違反点'),
      h('span', { class: 'pips' }, ...Array.from({ length: CONFIG.violationLimit }, (_, i) => h('i', { class: i < pts ? 'on' : '' })))),
    h('button', {
      class: 'hud-mute',
      title: isMuted() ? '効果音をオンにする' : '効果音をオフにする',
      'aria-label': isMuted() ? '効果音をオンにする' : '効果音をオフにする',
      onclick: () => { toggleMute(); notify(); },
    }, isMuted() ? '🔇' : '🔊'),
  );
}

export function titleScreen(): HTMLElement {
  const saved = loadSave();
  return h('div', { class: 'screen title-screen' },
    h('div', { class: 'title-box' },
      h('div', { class: 'title-kanji' }, '七つ屋'),
      h('div', { class: 'title-sub' }, 'NANATSUYA — 質屋経営シミュレーション'),
      h('p', { class: 'title-lead' },
        '平成三年、不況にあえぐ港町・潮見市。亡き祖父の質屋を継いだあなたには、¥1,000,000 の借金が残された。',
        h('br'),
        '身分証を照合し、品物の真贋を見抜き、値をつけ、店を守れ。期限は 30 日。'),
      h('div', { class: 'title-buttons' },
        h('button', { class: 'btn primary', onclick: () => { clearSave(); startNew(); } }, '新しく始める'),
        saved && saved.phase !== 'ending'
          ? h('button', { class: 'btn', onclick: () => continueGame() }, `続きから（${saved.day} 日目）`)
          : null,
      ),
      howToPlay(),
    ),
  );
}

function howToPlay(): HTMLElement {
  return h('details', { class: 'howto' },
    h('summary', null, '遊び方'),
    h('ol', null,
      h('li', null, '朝：新聞・通達・盗品手配書を確認して開店する。'),
      h('li', null, '窓口：客を呼び、道具（ルーペ・天秤など）で品物を調べる。調べると時間が進む。'),
      h('li', null, '「照合」ボタンで照合モードにし、2 つの項目（例：品物の刻印とカタログの刻印、身分証の写真と客の顔、有効期限と今日の日付）をクリックすると、不一致を発見できる。'),
      h('li', null, '見つけた欠陥や偽物の証拠は「指摘」して値下げ交渉に使える。盗品や偽造身分証は「通報」で謝礼がもらえる。'),
      h('li', null, '金額を提示して交渉する。質入れなら質札を発行し、期限内に客が元金＋利息を払えば利益、来なければ質流れ品として売れる。'),
      h('li', null, '規則帳に違反する取引は、後日発覚すると罰金と違反点。10 点で営業許可取消。'),
      h('li', null, '夜：生活費を払い、在庫を陳列・売却し、道具に投資する。返済日には定期返済がある。'),
    ),
  );
}

const TREND = (m: number) => (m >= 1.05 ? '▲' : m <= 0.95 ? '▼' : '―');

export function morningScreen(s: GameState): HTMLElement {
  const m = s.morning;
  const due = s.loans.filter((l) => l.status === 'active' && l.dueDay === s.day).length;
  const nextInstallment = Object.entries(CONFIG.installments).map(([d, v]) => [Number(d), v] as const).find(([d]) => d >= s.day);
  return h('div', { class: 'screen morning' },
    hud(s),
    h('div', { class: 'paper' },
      h('div', { class: 'paper-head' },
        h('span', { class: 'paper-name' }, '潮見新報'),
        h('span', null, toWareki(dateOfDay(s.day))),
      ),
      m.headlines.length
        ? h('div', { class: 'paper-headlines' }, ...m.headlines.map((t, i) => h(i === 0 ? 'h2' : 'h3', null, t)))
        : h('div', { class: 'paper-headlines' }, h('h3', null, '本日は大きなニュースなし')),
      h('div', { class: 'paper-cols' },
        h('section', null,
          h('h4', null, '店主の手帳'),
          m.notes.length ? h('ul', { class: 'notes' }, ...m.notes.map((n) => h('li', { class: n.startsWith('【指導票】') ? 'citation' : '' }, n))) : h('p', { class: 'muted' }, '特記事項なし。'),
        ),
        h('section', null,
          h('h4', null, '本日の予定'),
          h('ul', { class: 'notes' },
            h('li', null, `満期を迎える質札：${due} 件`),
            h('li', null, `盗品手配書：${s.stolenList.length} 件`),
            h('li', null, `有効な規則：${activeRules(s.day).length} 条`),
            nextInstallment ? h('li', null, `次の定期返済：${nextInstallment[0]} 日目の夜 ${yen(Math.min(nextInstallment[1], s.debt))}`) : h('li', null, `最終返済：${CONFIG.totalDays} 日目の夜に残額 ${yen(s.debt)}`),
          ),
          h('h4', null, '相場'),
          h('div', { class: 'market' }, ...CATEGORIES.map((c) =>
            h('span', { class: `mk ${s.market[c] >= 1.05 ? 'up' : s.market[c] <= 0.95 ? 'down' : ''}` }, `${CATEGORY_LABEL[c]} ${TREND(s.market[c])}${Math.round(s.market[c] * 100)}%`),
          )),
        ),
      ),
      m.newRules.length
        ? h('div', { class: 'new-rules' }, h('h4', null, '📜 新しい規則（規則帳に追加）'), ...m.newRules.map((r) => h('p', null, r)))
        : null,
      h('div', { class: 'paper-foot' },
        h('button', { class: 'btn primary big', 'data-key': 'next', onclick: () => act({ type: 'BEGIN_COUNTER' }) }, '店を開ける', h('kbd', null, 'Enter')),
      ),
    ),
  );
}

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

export function endingScreen(s: GameState): HTMLElement {
  const e = ENDINGS[s.ending ?? 'closed'];
  const loansActive = s.loans.filter((l) => l.status === 'active').length;
  return h('div', { class: `screen ending ${e.good ? 'good' : 'bad'}` },
    h('div', { class: 'ending-box' },
      h('div', { class: 'ending-label' }, 'ENDING'),
      h('h1', null, e.title),
      h('p', { class: 'ending-text' }, e.text),
      h('div', { class: 'panel ending-chart' }, debtMeter(s), historyChart(s)),
      h('table', { class: 'ending-stats' },
        h('tr', null, h('th', null, '到達日'), h('td', null, `${s.day} 日目`)),
        h('tr', null, h('th', null, '所持金'), h('td', null, yen(s.money))),
        h('tr', null, h('th', null, '借金残高'), h('td', null, yen(s.debt))),
        h('tr', null, h('th', null, '評判'), h('td', null, String(s.reputation))),
        h('tr', null, h('th', null, '違反点'), h('td', null, String(s.violationPoints))),
        h('tr', null, h('th', null, '発行した質札'), h('td', null, `${s.nextTicketNo - 1} 枚（未決済 ${loansActive}）`)),
        h('tr', null, h('th', null, '良心'), h('td', null, s.conscience >= 5 ? '清らか' : s.conscience >= 0 ? 'ふつう' : s.conscience > -10 ? 'すり減った' : '失われた')),
      ),
      h('div', { class: 'title-buttons' },
        h('button', { class: 'btn primary', onclick: () => { clearSave(); startNew(); } }, 'もう一度遊ぶ'),
        h('button', { class: 'btn', onclick: () => { ui.screen = 'title'; toTitle(); } }, 'タイトルへ'),
      ),
    ),
  );
}
