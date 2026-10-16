// タイトル・朝・エンディング画面と共通 HUD。

import { CONFIG } from '../core/config';
import { dateOfDay, formatClock, toWareki, yen } from '../core/dates';
import { CATEGORIES, CATEGORY_LABEL } from '../core/data/items';
import { activeRules } from '../core/data/rules';
import type { EndingId, GameState } from '../core/types';
import { h } from './dom';
import { isFullscreen, toggleFullscreen } from './settings';
import { act, clearSave, continueGame, loadSave, openModal, startNew, toTitle } from './store';

const ICON = {
  coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#e8c25a" stroke="#7a5c1c" stroke-width="2"/><rect x="9" y="9" width="6" height="6" fill="none" stroke="#7a5c1c" stroke-width="2"/></svg>',
  debt: '<svg viewBox="0 0 24 24"><path d="M4 7h16v12H4z" fill="#b0412f" stroke="#4a140c" stroke-width="2"/><path d="M8 7V5h8v2" fill="none" stroke="#4a140c" stroke-width="2"/><path d="M8 13h8" stroke="#ffd" stroke-width="2"/></svg>',
  rep: '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8z" fill="#f0d27a" stroke="#7a5c1c" stroke-width="1.5"/></svg>',
  law: '<svg viewBox="0 0 24 24"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" fill="#3b6a8f" stroke="#1a3247" stroke-width="2"/><path d="M12 7v6M12 16v1" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
};

function icon(name: keyof typeof ICON): HTMLElement {
  return h('i', { class: 'ico', html: ICON[name] });
}

export function hud(s: GameState): HTMLElement {
  const pts = Math.min(CONFIG.violationLimit, s.violationPoints);
  const totalDebt = s.debt + s.shark;
  return h('header', { class: 'hud' },
    h('div', { class: 'hud-day' },
      h('b', null, `${s.day}`), h('span', null, '日目'),
      h('small', null, `${toWareki(dateOfDay(s.day))}・残り ${Math.max(0, CONFIG.totalDays - s.day)} 日`),
    ),
    s.phase === 'counter'
      ? h('div', { class: `hud-clock ${s.clock >= CONFIG.closeMinute - 60 ? 'late' : ''}`, id: 'hud-clock' }, formatClock(Math.min(s.clock, CONFIG.closeMinute)))
      : h('div', { class: 'hud-phase' }, s.phase === 'morning' ? '朝' : s.phase === 'night' ? '夜' : ''),
    h('div', { class: 'hud-stats' },
      h('div', { class: 'hud-stat' }, icon('coin'), h('div', null, h('label', null, '所持金'), h('b', { id: 'hud-money', class: s.money < 0 ? 'neg' : '' }, yen(s.money)))),
      h('div', { class: 'hud-stat', title: s.shark ? `本借金 ${yen(s.debt)} ／ 鮫島 ${yen(s.shark)}` : '' }, icon('debt'),
        h('div', null, h('label', null, '借金'), h('b', { class: s.shark ? 'neg' : '' }, yen(totalDebt)))),
      h('div', { class: 'hud-stat' }, icon('rep'),
        h('div', null, h('label', null, `評判 ${s.reputation}`), h('span', { class: 'meter' }, h('i', { style: { width: `${s.reputation}%` } })))),
      h('div', { class: 'hud-stat', title: `${CONFIG.violationLimit} 点で営業許可取消` }, icon('law'),
        h('div', null, h('label', null, `違反 ${s.violationPoints}/${CONFIG.violationLimit}`),
          h('span', { class: 'pips' }, ...Array.from({ length: CONFIG.violationLimit }, (_, i) => h('i', { class: i < pts ? 'on' : '' }))))),
    ),
    h('div', { class: 'hud-buttons' },
      h('button', { class: 'hud-btn borrow', title: '追加で借金する', onclick: () => openModal('borrow') }, '💴 借入'),
      h('button', { class: 'hud-btn', title: '全画面（F キー）', onclick: () => void toggleFullscreen() }, isFullscreen() ? '⤡' : '⛶'),
      h('button', { class: 'hud-btn', title: 'メニュー（Esc）', onclick: () => openModal('menu') }, '☰'),
    ),
  );
}

export function titleScreen(): HTMLElement {
  const saved = loadSave();
  return h('div', { class: 'screen title-screen' },
    h('div', { class: 'title-bg' }),
    h('div', { class: 'title-logo' },
      h('div', { class: 'title-kanji' }, '七つ屋'),
      h('div', { class: 'title-sub' }, 'NANATSUYA — 質屋経営シミュレーション'),
    ),
    h('p', { class: 'title-lead' },
      '平成三年、不況にあえぐ港町・潮見市。亡き祖父の質屋を継いだあなたには ¥1,000,000 の借金が残された。',
      h('br'),
      '身分証を照合し、品物の真贋を見抜き、値をつけ、店を守れ。期限は 30 日。'),
    h('nav', { class: 'title-menu' },
      saved && saved.phase !== 'ending'
        ? h('button', { class: 'menu-btn primary', onclick: () => continueGame() }, h('span', null, 'つづきから'), h('small', null, `${saved.day} 日目・所持金 ${yen(saved.money)}`))
        : null,
      h('button', { class: `menu-btn ${saved && saved.phase !== 'ending' ? '' : 'primary'}`, onclick: () => { clearSave(); startNew(); } }, h('span', null, 'はじめから')),
      h('button', { class: 'menu-btn', onclick: () => openModal('howto') }, h('span', null, '遊び方')),
      h('button', { class: 'menu-btn', onclick: () => openModal('settings') }, h('span', null, '設定')),
      h('button', { class: 'menu-btn', onclick: () => void toggleFullscreen() }, h('span', null, isFullscreen() ? 'ウィンドウ表示' : 'フルスクリーン')),
    ),
    h('div', { class: 'title-foot' }, 'F：全画面　Esc：メニュー　© 七つ屋'),
  );
}

export function howToPlay(): HTMLElement {
  return h('ol', { class: 'howto-list' },
    h('li', null, h('b', null, '朝'), '：新聞・通達・盗品手配書を確認して開店する。'),
    h('li', null, h('b', null, '窓口'), '：客を呼び、道具（ルーペ・天秤など）で品物を調べる。調べると時間が進む。'),
    h('li', null, h('b', null, '照合'), '：「照合」で 2 つの項目（品物の刻印↔カタログ、身分証の写真↔客の顔、有効期限↔本日 など）をクリックし、不一致を見つける。'),
    h('li', null, h('b', null, '怪しい客'), '：偽物・盗品・期限切れや他人の身分証を持った客が毎日まぎれている。挙動にも注意。'),
    h('li', null, h('b', null, '交渉'), '：欠陥は「指摘」して値下げ。盗品・偽造身分証は「通報」で謝礼。金額を提示して質札発行・買取。'),
    h('li', null, h('b', null, '規則'), '：規則帳に違反した取引は後日発覚すると罰金と違反点。10 点で営業許可取消。'),
    h('li', null, h('b', null, '夜'), '：生活費を払い、在庫を陳列・売却し、道具に投資する。返済日には定期返済がある。'),
    h('li', null, h('b', null, '借入'), '：資金が足りなければ HUD の「借入」から追加で借金できる。信用金庫は手数料、鮫島ファイナンスは日利 3% の闇金。'),
  );
}

const TREND = (m: number) => (m >= 1.05 ? '▲' : m <= 0.95 ? '▼' : '―');

export function morningScreen(s: GameState): HTMLElement {
  const m = s.morning;
  const due = s.loans.filter((l) => l.status === 'active' && l.dueDay === s.day).length;
  const nextInstallment = Object.entries(CONFIG.installments).map(([d, v]) => [Number(d), v] as const).find(([d]) => d >= s.day);
  return h('div', { class: 'screen morning' },
    hud(s),
    h('div', { class: 'morning-body' },
      h('div', { class: 'paper' },
        h('div', { class: 'paper-head' },
          h('span', { class: 'paper-name' }, '潮見新報'),
          h('span', { class: 'paper-date' }, `${toWareki(dateOfDay(s.day))}　第 ${s.day} 号`),
        ),
        h('div', { class: 'paper-headlines' },
          m.headlines.length
            ? m.headlines.map((t, i) => h(i === 0 ? 'h2' : 'h3', null, t))
            : h('h3', null, '本日は大きなニュースなし'),
        ),
        h('div', { class: 'paper-cols' },
          h('section', { class: 'paper-notes' },
            h('h4', null, '店主の手帳'),
            m.notes.length ? h('ul', { class: 'notes' }, ...m.notes.map((n) => h('li', { class: n.startsWith('【指導票】') ? 'citation' : '' }, n))) : h('p', { class: 'muted' }, '特記事項なし。'),
          ),
          h('section', null,
            h('h4', null, '相場'),
            h('div', { class: 'market' }, ...CATEGORIES.map((c) =>
              h('span', { class: `mk ${s.market[c] >= 1.05 ? 'up' : s.market[c] <= 0.95 ? 'down' : ''}` }, `${CATEGORY_LABEL[c]} ${TREND(s.market[c])}${Math.round(s.market[c] * 100)}%`),
            )),
            m.newRules.length
              ? h('div', { class: 'new-rules' }, h('h4', null, '📜 新しい規則'), ...m.newRules.map((r) => h('p', null, r)))
              : null,
          ),
        ),
      ),
      h('aside', { class: 'brief' },
        h('div', { class: 'brief-title' }, '本日の予定'),
        h('ul', { class: 'brief-list' },
          h('li', null, h('span', null, '満期の質札'), h('b', null, `${due} 件`)),
          h('li', null, h('span', null, '盗品手配書'), h('b', null, `${s.stolenList.length} 件`)),
          h('li', null, h('span', null, '有効な規則'), h('b', null, `${activeRules(s.day).length} 条`)),
          h('li', null, h('span', null, '店先の行列'), h('b', null, `${s.queue.length} 人`)),
          nextInstallment
            ? h('li', { class: nextInstallment[0] - s.day <= 1 ? 'warn' : '' }, h('span', null, `次の定期返済（${nextInstallment[0]} 日目の夜）`), h('b', null, yen(Math.min(nextInstallment[1], s.debt))))
            : h('li', { class: 'warn' }, h('span', null, `最終返済（${CONFIG.totalDays} 日目の夜）`), h('b', null, yen(s.debt + s.shark))),
          s.shark ? h('li', { class: 'warn' }, h('span', null, '鮫島ファイナンス残高'), h('b', null, yen(s.shark))) : null,
        ),
        h('button', { class: 'btn primary huge', onclick: () => act({ type: 'BEGIN_COUNTER' }) }, '店を開ける'),
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
  const text = s.ending === 'foreclosed' && s.shark > 0
    ? '鮫島ファイナンスの取り立て屋が、店の品物を根こそぎ運び出していった。膨れ上がった利息は、祖父の店ごと飲み込んだ。'
    : e.text;
  const loansActive = s.loans.filter((l) => l.status === 'active').length;
  return h('div', { class: `screen ending ${e.good ? 'good' : 'bad'}` },
    h('div', { class: 'ending-bg' }),
    h('div', { class: 'ending-box' },
      h('div', { class: 'ending-label' }, e.good ? '— ENDING —' : '— BAD END —'),
      h('h1', null, e.title),
      h('p', { class: 'ending-text' }, text),
      h('table', { class: 'ending-stats' },
        h('tr', null, h('th', null, '到達日'), h('td', null, `${s.day} 日目`)),
        h('tr', null, h('th', null, '所持金'), h('td', null, yen(s.money))),
        h('tr', null, h('th', null, '借金残高'), h('td', null, yen(s.debt + s.shark))),
        h('tr', null, h('th', null, '評判'), h('td', null, String(s.reputation))),
        h('tr', null, h('th', null, '違反点'), h('td', null, String(s.violationPoints))),
        h('tr', null, h('th', null, '発行した質札'), h('td', null, `${s.nextTicketNo - 1} 枚（未決済 ${loansActive}）`)),
        h('tr', null, h('th', null, '良心'), h('td', null, s.conscience >= 5 ? '清らか' : s.conscience >= 0 ? 'ふつう' : s.conscience > -10 ? 'すり減った' : '失われた')),
      ),
      h('div', { class: 'ending-buttons' },
        h('button', { class: 'btn primary big', onclick: () => { clearSave(); startNew(); } }, 'もう一度遊ぶ'),
        h('button', { class: 'btn big', onclick: () => toTitle() }, 'タイトルへ'),
      ),
    ),
  );
}
