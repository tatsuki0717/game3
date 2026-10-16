// モーダル（メニュー・設定・遊び方・借入）。

import { CONFIG } from '../core/config';
import { yen } from '../core/dates';
import { borrowLimit, type Lender } from '../core/game';
import { h } from './dom';
import { howToPlay } from './screens';
import { RESOLUTIONS, SPEEDS, UI_SCALES, isFullscreen, settings, toggleFullscreen, updateSettings, type Resolution } from './settings';
import { sfx } from './sfx';
import { act, getState, hasState, notify, toTitle, ui } from './store';

function close(): void {
  ui.modal = null;
  notify();
}

function frame(title: string, body: (Node | null)[], wide = false): HTMLElement {
  return h('div', { class: 'modal-back', onclick: (e: Event) => { if (e.target === e.currentTarget) close(); } },
    h('div', { class: `modal ${wide ? 'wide' : ''}` },
      h('div', { class: 'modal-head' }, h('span', null, title), h('button', { class: 'modal-x', onclick: close, title: '閉じる（Esc）' }, '✕')),
      h('div', { class: 'modal-body' }, ...body),
    ),
  );
}

function menu(): HTMLElement {
  const inGame = ui.screen === 'game' && hasState();
  return frame('メニュー', [
    h('div', { class: 'modal-menu' },
      h('button', { class: 'menu-btn primary', onclick: close }, h('span', null, inGame ? 'ゲームに戻る' : '閉じる')),
      h('button', { class: 'menu-btn', onclick: () => { ui.modal = 'settings'; notify(); } }, h('span', null, '設定')),
      h('button', { class: 'menu-btn', onclick: () => { ui.modal = 'howto'; notify(); } }, h('span', null, '遊び方')),
      h('button', { class: 'menu-btn', onclick: () => void toggleFullscreen() }, h('span', null, isFullscreen() ? 'ウィンドウ表示' : 'フルスクリーン')),
      inGame ? h('button', { class: 'menu-btn', onclick: () => toTitle() }, h('span', null, 'タイトルへ（自動保存済み）')) : null,
    ),
    inGame ? h('p', { class: 'muted center' }, 'メニューを開いている間、時計は止まっている。') : null,
  ]);
}

function seg<T extends string | number>(value: T, options: { id: T; label: string }[], onPick: (v: T) => void): HTMLElement {
  return h('div', { class: 'seg' }, ...options.map((o) =>
    h('button', { class: `seg-btn ${o.id === value ? 'on' : ''}`, onclick: () => { onPick(o.id); notify(); } }, o.label),
  ));
}

function settingsModal(): HTMLElement {
  const row = (label: string, control: Node, note?: string) =>
    h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, label, note ? h('small', null, note) : null), control);
  return frame('設定', [
    row('解像度', h('select', {
      class: 'set-select',
      onchange: (e: Event) => { updateSettings({ resolution: (e.target as HTMLSelectElement).value as Resolution }); notify(); },
    }, ...RESOLUTIONS.map((r) => h('option', { value: r.id, selected: r.id === settings.resolution }, r.label))), '自動は常に同じ見た目で拡大。固定解像度は高いほど作業領域が広くなる'),
    row('拡大表示', seg(settings.fit ? 'on' : 'off', [{ id: 'on', label: '画面に合わせる' }, { id: 'off', label: '等倍（ドットバイドット）' }], (v) => updateSettings({ fit: v === 'on' })), '固定解像度のときの表示方法'),
    row('文字・UI の大きさ', seg(settings.uiScale, UI_SCALES.map((v) => ({ id: v, label: `${Math.round(v * 100)}%` })), (v) => updateSettings({ uiScale: v }))),
    row('時間の速さ', seg(settings.speed, SPEEDS.map((v) => ({ id: v, label: `×${v}` })), (v) => updateSettings({ speed: v })), '営業中の時計の進み方'),
    row('効果音', h('input', {
      type: 'range', min: '0', max: '1', step: '0.05', value: String(settings.volume), class: 'set-range',
      onchange: (e: Event) => { updateSettings({ volume: Number((e.target as HTMLInputElement).value) }); sfx.coin(); },
    })),
    row('画面効果', seg(settings.effects ? 'on' : 'off', [{ id: 'on', label: 'オン' }, { id: 'off', label: 'オフ' }], (v) => updateSettings({ effects: v === 'on' })), '走査線・ビネット・アニメーション'),
    row('表示モード', h('button', { class: 'btn', onclick: () => void toggleFullscreen() }, isFullscreen() ? 'ウィンドウに戻す' : 'フルスクリーンにする'), 'F キーでも切り替え'),
  ]);
}

function lenderCard(lender: Lender): HTMLElement {
  const s = getState();
  const lim = borrowLimit(s, lender);
  const credit = lender === 'credit';
  const amounts = [10_000, 50_000, 100_000, 200_000].filter((a) => a <= lim.room);
  return h('div', { class: `lender ${credit ? 'credit' : 'shark'}` },
    h('div', { class: 'lender-name' }, credit ? '潮見信用金庫' : '鮫島ファイナンス', h('small', null, credit ? '堅実な地元金融' : '審査なし・即日融資')),
    h('ul', { class: 'lender-terms' },
      credit
        ? [
          h('li', null, `手数料 ${Math.round(CONFIG.creditFee * 100)}%（借金残高に上乗せ）`),
          h('li', null, '返済は本来の借金と一緒（期限 30 日目）'),
          h('li', null, `条件：評判 ${CONFIG.creditMinReputation} 以上・違反点 ${CONFIG.creditMaxViolation} 未満`),
          h('li', null, `融資枠 ${yen(CONFIG.creditLimit)}（借入済み ${yen(s.creditBorrowed)}）`),
        ]
        : [
          h('li', { class: 'neg' }, `日利 ${Math.round(CONFIG.sharkDailyRate * 100)}%（毎朝、複利で膨らむ）`),
          h('li', null, '夜の帳簿でいつでも返済できる'),
          h('li', null, '30 日目までに完済できなければ店は終わり'),
          h('li', null, `上限 ${yen(CONFIG.sharkLimit)}（残高 ${yen(s.shark)}）`),
        ],
    ),
    lim.reason
      ? h('p', { class: 'lender-ng' }, lim.reason)
      : h('div', { class: 'lender-amounts' },
        ...amounts.map((a) => h('button', { class: `btn ${credit ? 'primary' : 'danger'}`, onclick: () => act({ type: 'BORROW', lender, amount: a }) }, `${yen(a)} 借りる`)),
        lim.room > 0 && !amounts.includes(lim.room)
          ? h('button', { class: `btn ${credit ? '' : 'danger'}`, onclick: () => act({ type: 'BORROW', lender, amount: lim.room }) }, `上限まで（${yen(lim.room)}）`)
          : null,
      ),
  );
}

function borrowModal(): HTMLElement {
  const s = getState();
  return frame('追加の借入', [
    h('div', { class: 'borrow-summary' },
      h('span', null, '所持金 ', h('b', null, yen(s.money))),
      h('span', null, '借金残高 ', h('b', null, yen(s.debt))),
      s.shark ? h('span', { class: 'neg' }, '鮫島 ', h('b', null, yen(s.shark))) : null,
    ),
    h('div', { class: 'lenders' }, lenderCard('credit'), lenderCard('shark')),
    h('p', { class: 'muted center small' }, '借りたお金はすぐ所持金に入る。定期返済は本来の借金からのみ引かれる。'),
  ], true);
}

export function modalLayer(): HTMLElement | null {
  switch (ui.modal) {
    case 'menu':
      return menu();
    case 'settings':
      return settingsModal();
    case 'howto':
      return frame('遊び方', [howToPlay()], true);
    case 'borrow':
      return hasState() ? borrowModal() : null;
    default:
      return null;
  }
}
