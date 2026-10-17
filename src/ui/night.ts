// 夜の帳簿画面。スクロールさせず、左のコマンドメニュー（タブ）で 1 画面ずつ切り替える。
// 件数が多い一覧（帳簿・在庫・質札）はページ送りにする。

import { CONDITION_LABEL, CONFIG, DEFECT_LABEL } from '../core/config';
import { dateOfDay, toWareki, yen } from '../core/dates';
import { CATEGORIES, CATEGORY_LABEL, itemDef } from '../core/data/items';
import { UPGRADES } from '../core/data/schedule';
import { committedExpenses, maxRate, shelfSlots } from '../core/game';
import {
  adCost, balanceSheet, bankInterest, bankLimit, interestOf, knownHiddenDefects, redeemProbability, saleProbability, shopperValue, wholesalePrice,
} from '../core/systems/economy';
import type { AdPlan, Category, DealerLot, GameState, InventoryItem } from '../core/types';
import { debtMeter, historyChart } from './chart';
import { h } from './dom';
import { categoryIcon } from './pixel';
import { hud } from './screens';
import { play } from './sound';
import { act, notify, ui, type NightTab } from './store';

const priceDrafts = new Map<string, string>();
let adCategory: Category = 'watch';
const SOURCE_LABEL: Record<InventoryItem['source'], string> = { forfeit: '質流れ', story: '祖父の金庫', bought: '買取', dealer: '仕入れ' };
const TREND = (m: number) => (m >= 1.05 ? '▲' : m <= 0.95 ? '▼' : '');

const isPortrait = () => document.getElementById('app')?.dataset.orientation === 'portrait';

const digits = (v: string) => Number(v.replace(/[^\d]/g, ''));

function suggested(s: GameState, inv: InventoryItem): number {
  return Math.round((shopperValue(s, inv) * 0.9) / 1000) * 1000;
}

function draftPrice(s: GameState, inv: InventoryItem): string {
  return priceDrafts.get(inv.item.id) ?? String(inv.shelved ? inv.price : suggested(s, inv));
}

function chanceOf(s: GameState, inv: InventoryItem, price: number): { label: string; level: number } {
  const p = saleProbability(s, { ...inv, price });
  return p >= 0.5 ? { label: '高', level: 3 } : p >= 0.25 ? { label: '中', level: 2 } : { label: '低', level: 1 };
}

function nextDueText(s: GameState): string {
  const next = Object.entries(CONFIG.installments).map(([d, v]) => [Number(d), v] as const).find(([d]) => d >= s.day);
  if (next) {
    const days = next[0] - s.day;
    return `次の定期返済：${days === 0 ? '今夜' : `${days} 日後（${next[0]} 日目の夜）`}に ${yen(Math.min(next[1], s.debt))}`;
  }
  return `最終返済：${CONFIG.totalDays} 日目の夜に残額 ${yen(s.debt)}`;
}

function familyText(s: GameState): string {
  const f = s.family;
  return f.sick ? '祖母が寝込んでいる' : f.hunger > 0 ? 'お腹を空かせている' : f.cold > 0 ? '寒がっている' : '元気';
}

function shortOfInstallment(s: GameState): boolean {
  return s.expenses.some((e) => e.id === 'installment') && s.money < committedExpenses(s);
}

// ---------- 共通部品 ----------

function setTab(tab: NightTab): void {
  if (ui.nightTab === tab) return;
  ui.nightTab = tab;
  play('cursor');
  notify();
}

/** 一覧を切り出し、ページ送りの部品を返す。ページ番号は範囲外なら丸める */
function paginate<T>(tab: NightTab, list: T[], perPage: number): { rows: T[]; pager: HTMLElement | null; page: number } {
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const page = Math.min(pages - 1, Math.max(0, ui.nightPage[tab] ?? 0));
  ui.nightPage[tab] = page;
  const go = (d: number) => () => {
    ui.nightPage[tab] = page + d;
    play('cursor');
    notify();
  };
  const pager = pages > 1
    ? h('div', { class: 'pager' },
      h('button', { class: 'btn small', 'data-key': 'page-prev', disabled: page === 0, onclick: go(-1), 'aria-label': '前のページ' }, '◀'),
      h('span', null, `${page + 1} / ${pages}`),
      h('button', { class: 'btn small', 'data-key': 'page-next', disabled: page >= pages - 1, onclick: go(1), 'aria-label': '次のページ' }, '▶'),
    )
    : null;
  return { rows: list.slice(page * perPage, (page + 1) * perPage), pager, page };
}

function head(title: string, ...extra: (HTMLElement | string | null)[]): HTMLElement {
  return h('div', { class: 'nt-head' }, h('h3', null, title), ...extra);
}

// ---------- 各タブ ----------

/** 今夜の要点を集めた概況。各カードから該当タブへ飛べる */
function reportTab(s: GameState): HTMLElement {
  const income = s.ledger.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
  const outgo = s.ledger.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);
  const net = income + outgo;
  const log = s.todayLog;
  // 集計のタイルは、その日に初めて開いたときだけ順番に並べて見せる
  const key = `${s.seed}:${s.day}`;
  const fresh = ui.reportFor !== key;
  ui.reportFor = key;
  const after = s.money - committedExpenses(s);
  const unshelved = s.inventory.filter((i) => !i.shelved).length;
  const shelved = s.inventory.length - unshelved;
  const active = s.loans.filter((l) => l.status === 'active');
  const dueTomorrow = active.filter((l) => l.dueDay <= s.day + 1).length;
  const buyable = UPGRADES.filter((u) => !s.upgrades.includes(u.id) && s.day >= u.availableDay && s.money >= u.price).length;
  const bs = balanceSheet(s);
  const lots = s.dealerLots ?? [];
  const familyBad = s.family.sick || s.family.hunger > 0 || s.family.cold > 0;
  const tile = (label: string, value: string, cls = '') => h('div', { class: `tile ${cls}` }, h('span', null, label), h('b', null, value));
  const card = (tab: NightTab, title: string, value: string, note: string, state: '' | 'warn' | 'todo' = '') =>
    h('button', { class: `dash-card ${state}`, onclick: () => setTab(tab) },
      h('span', { class: 'seal' }, TABS.find((t) => t.id === tab)!.seal),
      h('span', { class: 'dash-text' }, h('small', null, title), h('b', null, value), h('span', null, note)),
      h('span', { class: 'dash-go' }, '▶'),
    );
  return h('div', { class: 'nt-report' },
    head(`${s.day} 日目の概況`, h('small', { class: 'muted' }, toWareki(dateOfDay(s.day))),
      h('span', { class: 'days-left' }, `期限まで あと ${CONFIG.totalDays - s.day} 日`)),
    h('div', { class: `tiles ${fresh ? 'fresh' : ''}` },
      tile('応対', `${s.served} 人`),
      log ? tile('成立', `${log.deals} 件`) : null,
      log ? tile('通報', `${log.reports} 件`) : null,
      log ? tile('断った・帰られた', `${log.refused + log.walkouts} 人`) : null,
      tile('本日の収支', `${net >= 0 ? '+' : ''}${yen(net)}`, net > 0 ? 'pos' : net < 0 ? 'neg' : ''),
    ),
    h('div', { class: 'report-grid' },
      h('div', { class: 'report-side' },
        debtMeter(s),
        h('p', { class: 'small' }, nextDueText(s)),
        h('div', { class: 'balance-line', title: '現金＋貸付＋在庫（業者評価）−借金・借入' },
          h('span', null, '純資産 ', h('b', { class: bs.net < 0 ? 'neg' : '' }, yen(bs.net))),
          h('small', { class: 'muted' }, `現金 ${yen(bs.cash)}＋貸付 ${yen(bs.loans)}＋在庫 ${yen(bs.stock)}−借金・借入 ${yen(bs.debt + bs.bank)}`),
        ),
        historyChart(s, { table: false }),
      ),
      h('div', { class: 'dash-cards' },
        card('books', '支払い後の所持金', yen(after), `家族：${familyText(s)}`, after < 0 ? 'warn' : familyBad ? 'todo' : ''),
        card('stock', '在庫', `${s.inventory.length} 点`, `陳列 ${shelved} / ${shelfSlots(s)} 枠・未陳列 ${unshelved}`, unshelved && shelved < shelfSlots(s) ? 'todo' : ''),
        card('trade', '仕入れ・広告', lots.length ? `業者の品 ${lots.length} 点` : '業者の品なし', `明日の広告：${AD_NAME[s.adNext?.id ?? 'none']}`),
        card('loans', '質札', `${active.length} 件`, `明日までに満期 ${dueTomorrow} 件`, dueTomorrow ? 'todo' : ''),
        card('debt', '借金', yen(s.debt), `利率 ${Math.round(s.rate * 100)}%`, shortOfInstallment(s) ? 'warn' : CONFIG.installments[s.day] ? 'todo' : ''),
        card('shop', '投資・店員', buyable ? `${buyable} 件 購入可` : 'なし', s.clerk ? '店員あり' : '店員なし', buyable ? 'todo' : ''),
      ),
    ),
  );
}

function booksTab(s: GameState): HTMLElement {
  const income = s.ledger.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
  const outgo = s.ledger.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);
  const committed = committedExpenses(s);
  const after = s.money - committed;
  const { rows, pager } = paginate('books', s.ledger, isPortrait() ? 9 : 12);
  return h('div', { class: 'nt-split' },
    h('div', { class: 'nt-col' },
      head('本日の帳簿', pager),
      s.ledger.length
        ? h('ul', { class: 'ledger' }, ...rows.map((l) => h('li', null, h('span', null, l.label), h('b', { class: l.amount < 0 ? 'neg' : 'pos' }, yen(l.amount)))))
        : h('p', { class: 'muted' }, '今日の出入りはなかった。'),
      h('div', { class: 'ledger-total' },
        h('span', null, '収入 ', h('b', { class: 'pos' }, yen(income))),
        h('span', null, '支出 ', h('b', { class: 'neg' }, yen(outgo))),
        h('span', null, '差引 ', h('b', null, yen(income + outgo))),
      ),
    ),
    h('div', { class: 'nt-col' },
      head('今夜の支払い'),
      h('ul', { class: 'expenses' }, ...s.expenses.map((e) => h('li', null,
        h('label', { class: e.mandatory ? 'fixed' : '' },
          h('input', { type: 'checkbox', checked: e.pay, disabled: e.mandatory, onchange: () => act({ type: 'TOGGLE_EXPENSE', id: e.id }) }),
          ` ${e.label}`,
          e.mandatory ? h('small', { class: 'muted' }, '（必須）') : null,
        ),
        h('b', null, yen(e.amount)),
      )), adCost(s) ? h('li', null, h('span', null, `明日の広告費（${AD_NAME[s.adNext!.id]}）`), h('b', null, yen(adCost(s)))) : null),
      h('div', { class: 'receipt' },
        h('div', null, h('span', null, '所持金'), h('b', null, yen(s.money))),
        h('div', null, h('span', null, '支払い'), h('b', null, `− ${yen(committed)}`)),
        h('div', { class: 'receipt-total' }, h('span', null, '支払い後'), h('b', { class: after < 0 ? 'neg' : '' }, yen(after))),
      ),
      h('p', null, '家族：', h('b', null, familyText(s))),
      h('p', { class: 'muted small' }, '食費・暖房費・薬代を削ると、家族の具合が悪くなる。'),
    ),
  );
}

function stockSlot(inv: InventoryItem, selected: boolean): HTMLElement {
  const def = itemDef(inv.item.defId);
  return h('button', {
    class: `slot ${selected ? 'sel' : ''} ${inv.shelved ? 'shelved' : ''}`,
    'aria-pressed': selected ? 'true' : 'false',
    onclick: () => {
      if (ui.stockSel === inv.item.id) return;
      ui.stockSel = inv.item.id;
      play('cursor');
      notify();
    },
  },
  categoryIcon(def.category, 3),
  h('span', { class: 'slot-name' }, def.name),
  h('span', { class: 'slot-tag' }, inv.shelved ? `陳列 ${yen(inv.price)}` : SOURCE_LABEL[inv.source]),
  );
}

function stockDetail(s: GameState, inv: InventoryItem): HTMLElement {
  const def = itemDef(inv.item.defId);
  const id = inv.item.id;
  const draft = draftPrice(s, inv);
  const chance = chanceOf(s, inv, digits(draft));
  const chanceEl = h('span', { class: 'chance' },
    '売れ行き ',
    h('span', { class: 'pips' }, ...[1, 2, 3].map((n) => h('i', { class: n <= chance.level ? 'on' : '' }))),
    ` ${chance.label}`,
  );
  const setDraft = (v: number) => {
    priceDrafts.set(id, String(Math.max(0, v)));
    notify();
  };
  const age = s.day - inv.acquiredDay;
  return h('div', { class: 'stock-detail' },
    h('div', { class: 'stock-title' },
      categoryIcon(def.category, 4),
      h('div', null,
        h('b', null, def.name),
        h('small', null, `${SOURCE_LABEL[inv.source]}・${age === 0 ? '今日' : `${age} 日前`}に入荷`),
      ),
    ),
    h('table', { class: 'stock-facts' },
      h('tr', null, h('th', null, '状態'), h('td', null, CONDITION_LABEL[inv.item.condition])),
      h('tr', null, h('th', null, '仕入'), h('td', null, yen(inv.cost))),
      h('tr', null, h('th', null, '業者買取'), h('td', null, yen(wholesalePrice(s, inv)))),
      h('tr', null, h('th', null, '店頭'), h('td', null, inv.shelved ? `陳列中 ${yen(inv.price)}` : '未陳列')),
    ),
    h('div', { class: 'price-row' },
      h('span', { class: 'yen' }, '¥'),
      h('button', { class: 'btn small', 'aria-label': '1,000 円下げる', onclick: () => setDraft(digits(draftPrice(s, inv)) - 1000) }, '−'),
      h('input', {
        class: 'price-input', type: 'text', inputmode: 'numeric', value: draft, 'aria-label': '店頭価格',
        oninput: (e: Event) => {
          const v = (e.target as HTMLInputElement).value;
          priceDrafts.set(id, v);
          // 入力中は描き直さず、売れ行きの表示だけ差し替える（フォーカスを保つため）
          const c = chanceOf(s, inv, digits(v));
          chanceEl.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i < c.level));
          chanceEl.lastChild!.textContent = ` ${c.label}`;
        },
      }),
      h('button', { class: 'btn small', 'aria-label': '1,000 円上げる', onclick: () => setDraft(digits(draftPrice(s, inv)) + 1000) }, '＋'),
      h('button', { class: 'btn small', onclick: () => setDraft(suggested(s, inv)) }, '目安'),
    ),
    chanceEl,
    h('div', { class: 'btn-row' },
      h('button', {
        class: 'btn primary',
        onclick: () => act({ type: 'SHELVE', itemId: id, price: digits(draftPrice(s, inv)) }),
      }, inv.shelved ? '値札を更新' : '陳列する'),
      inv.shelved ? h('button', { class: 'btn', onclick: () => act({ type: 'UNSHELVE', itemId: id }) }, '棚から下げる') : null,
      h('button', {
        class: 'btn',
        onclick: () => {
          priceDrafts.delete(id);
          ui.stockSel = null;
          act({ type: 'WHOLESALE', itemId: id });
        },
      }, `業者へ ${yen(wholesalePrice(s, inv))}`),
    ),
  );
}

function stockTab(s: GameState): HTMLElement {
  const perPage = isPortrait() ? 8 : 12;
  const shelved = s.inventory.filter((i) => i.shelved).length;
  const slots = shelfSlots(s);
  const { rows, pager } = paginate('stock', s.inventory, perPage);
  // 選択が無い・在庫から消えたときは、今のページの先頭を選ぶ
  let sel = s.inventory.find((i) => i.item.id === ui.stockSel);
  if (!sel || !rows.includes(sel)) sel = rows[0];
  ui.stockSel = sel?.item.id ?? null;
  return h('div', { class: 'nt-stock' },
    head(`在庫 ${s.inventory.length} 点`,
      h('span', { class: 'shelf-meter', title: '陳列枠' }, '陳列 ',
        h('span', { class: 'pips' }, ...Array.from({ length: slots }, (_, i) => h('i', { class: i < shelved ? 'on' : '' }))),
        ` ${shelved} / ${slots}`),
      pager),
    h('div', { class: 'stock-body' },
      h('div', { class: 'slot-grid' },
        ...rows.map((inv) => stockSlot(inv, inv === sel)),
        ...Array.from({ length: perPage - rows.length }, () => h('div', { class: 'slot empty' })),
      ),
      sel
        ? stockDetail(s, sel)
        : h('div', { class: 'stock-detail empty' }, h('p', { class: 'muted' }, '在庫はない。質流れ品や買い取った品がここに並ぶ。')),
    ),
    h('p', { class: 'muted small' }, '陳列した品は翌朝までに売れることがある。高すぎる値札は売れにくい。業者は即金だが安い（偽物はほぼ値がつかない）。'),
  );
}

const AD_NAME: Record<AdPlan['id'], string> = { none: '出さない', flyer: '町内チラシ', buy: '高価買取チラシ', sale: '店頭セール' };

function lotCard(s: GameState, lot: DealerLot): HTMLElement {
  const def = itemDef(lot.item.defId);
  const known = knownHiddenDefects(s, lot.item);
  const notes = [...lot.item.defects, ...known].map((d) => DEFECT_LABEL[d]);
  // 道具が無いと調べきれない品には但し書きがつく
  const unchecked = def.electric && !s.tools.includes('tester');
  const resale = suggested(s, { item: { ...lot.item, hiddenDefects: known } } as InventoryItem);
  const m = s.market[def.category];
  return h('li', { class: 'lot' },
    categoryIcon(def.category, 3),
    h('div', { class: 'lot-text' },
      h('b', null, def.name),
      h('small', null, `${CONDITION_LABEL[lot.item.condition]}・相場 ${TREND(m)}${Math.round(m * 100)}%`),
      h('small', { class: notes.length ? 'neg' : '' }, notes.length ? notes.join('・') : '目立つ欠陥なし', unchecked ? '（動作未確認）' : ''),
    ),
    h('div', { class: 'lot-price' },
      h('span', null, '卸値 ', h('b', null, yen(lot.price))),
      h('small', null, `店頭の目安 〜${yen(resale)}`),
      h('button', { class: 'btn small primary', disabled: s.money < lot.price, onclick: () => act({ type: 'BUY_LOT', itemId: lot.item.id }) }, '仕入れる'),
    ),
  );
}

function adOption(s: GameState, ad: AdPlan, price: number, desc: string): HTMLElement {
  const on = (s.adNext?.id ?? 'none') === ad.id;
  return h('li', { class: on ? 'on' : '' },
    h('label', null,
      h('input', { type: 'radio', name: 'ad', checked: on, onchange: () => act({ type: 'SET_AD', ad }) }),
      h('span', null, h('b', null, AD_NAME[ad.id]), price ? h('span', { class: 'muted small' }, ` ${yen(price)}`) : null, desc ? h('small', null, desc) : null),
    ),
  );
}

function tradeTab(s: GameState): HTMLElement {
  const lots = s.dealerLots ?? [];
  return h('div', { class: 'nt-split' },
    h('div', { class: 'nt-col' },
      head('業者の仕入れ', h('small', { class: 'muted' }, `所持金 ${yen(s.money)}`)),
      lots.length
        ? h('ul', { class: 'lots' }, ...lots.map((lot) => lotCard(s, lot)))
        : h('p', { class: 'muted' }, s.day >= CONFIG.totalDays ? '最終日は業者も来ない。' : '今夜の品はもう無い。'),
      h('p', { class: 'muted small' }, '店頭で売れれば差額が儲けになるが、陳列枠と現金を食う。テスターや UV ライトが無いと、動作不良・修理痕を見落としたまま仕入れることがある。'),
    ),
    h('div', { class: 'nt-col' },
      head('明日の広告'),
      h('ul', { class: 'ads' },
        adOption(s, { id: 'none' }, 0, ''),
        adOption(s, { id: 'flyer' }, CONFIG.adFlyer.price, `来客 +${CONFIG.adFlyer.customers}。`),
        adOption(s, { id: 'buy', category: adCategory }, CONFIG.adBuy.price, `来客 +${CONFIG.adBuy.customers}。持ち込みの約半分が選んだ品目になる。`),
        adOption(s, { id: 'sale' }, CONFIG.adSale.price, '今夜陳列した品が売れやすくなる。'),
      ),
      h('div', { class: 'offer-row' },
        h('span', { class: 'small' }, '買取強化の品目'),
        h('select', {
          class: 'ad-select', 'aria-label': '高価買取チラシの品目',
          onchange: (e: Event) => {
            adCategory = (e.target as HTMLSelectElement).value as Category;
            if (s.adNext?.id === 'buy') act({ type: 'SET_AD', ad: { id: 'buy', category: adCategory } });
          },
        }, ...CATEGORIES.filter((c) => c !== 'blade').map((c) => {
          const o = h('option', { value: c }, `${CATEGORY_LABEL[c]} ${TREND(s.market[c])}${Math.round(s.market[c] * 100)}%`);
          o.selected = c === (s.adNext?.category ?? adCategory);
          return o;
        })),
      ),
      h('p', { class: 'muted small' }, adCost(s) ? `広告費 ${yen(adCost(s))} は眠る前に支払う。` : '相場の上がっている品目を集めれば、高く売れる在庫が増える。'),
    ),
  );
}

function redeemOutlook(p: number): string {
  return p >= 0.6 ? '高' : p >= 0.35 ? '中' : '低';
}

function loansTab(s: GameState): HTMLElement {
  const active = s.loans.filter((l) => l.status === 'active').sort((a, b) => a.dueDay - b.dueDay);
  const total = active.reduce((a, l) => a + l.principal, 0);
  const interest = active.reduce((a, l) => a + interestOf(l), 0);
  const { rows, pager } = paginate('loans', active, isPortrait() ? 14 : 11);
  return h('div', { class: 'nt-loans' },
    head(`質札 ${active.length} 件`, pager),
    h('div', { class: 'tiles small-tiles' },
      h('div', { class: 'tile' }, h('span', null, '貸付残高'), h('b', null, yen(total))),
      h('div', { class: 'tile pos' }, h('span', null, '見込み利息'), h('b', null, yen(interest))),
      h('div', { class: 'tile' }, h('span', null, '明日までに満期'), h('b', null, `${active.filter((l) => l.dueDay <= s.day + 1).length} 件`)),
    ),
    active.length
      ? h('table', { class: 'loans' },
        h('tr', null, h('th', null, 'No.'), h('th', null, '名義'), h('th', null, '品物'), h('th', null, '元金'), h('th', { class: 'col-int' }, '利息'), h('th', null, '期限'), h('th', { title: '請け出しに来る見込み' }, '見込')),
        ...rows.map((l) => {
          const left = l.dueDay - s.day;
          return h('tr', { class: left <= 1 ? 'due' : '' },
            h('td', null, String(l.ticketNo)),
            h('td', null, l.customer.person.name),
            h('td', null, h('span', { class: 'inv-name' }, categoryIcon(itemDef(l.item.defId).category), itemDef(l.item.defId).name)),
            h('td', null, yen(l.principal)),
            h('td', { class: 'col-int' }, yen(interestOf(l))),
            h('td', null, h('span', { class: 'due-day' }, `${l.dueDay} 日目`), h('span', { class: `tag ${left <= 1 ? 'bad' : ''}` }, left <= 0 ? '今日' : left === 1 ? '明日' : `あと ${left} 日`)),
            h('td', null, l.redeemFlag ? '―' : redeemOutlook(redeemProbability(s, l))),
          );
        }),
      )
      : h('p', { class: 'muted' }, '預かっている質札はない。'),
    h('p', { class: 'muted small' }, '見込みが低い質札は質流れになりやすい。流れた品は在庫になる。'),
  );
}

function debtTab(s: GameState): HTMLElement {
  let debtDraft = '';
  let bankDraft = '';
  const bank = s.bankLoan ?? 0;
  const spare = Math.max(0, s.money - committedExpenses(s));
  const input = h('input', {
    class: 'offer-input', type: 'text', inputmode: 'numeric', placeholder: '繰り上げ返済額', 'aria-label': '繰り上げ返済額',
    oninput: (e: Event) => { debtDraft = (e.target as HTMLInputElement).value; },
  });
  const quick = (label: string, v: number) => h('button', {
    class: 'btn small', disabled: v <= 0,
    onclick: () => { debtDraft = String(v); input.value = String(v); },
  }, label);
  const rate = Math.round(s.rate * 100);
  const max = Math.round(maxRate(s) * 100);
  return h('div', { class: 'nt-split nt-debt' },
    h('div', { class: 'nt-col' },
      head('借金', h('span', { class: 'big-num' }, yen(s.debt))),
      debtMeter(s),
      h('ol', { class: 'installments' },
        ...Object.entries(CONFIG.installments).map(([d, v]) => {
          const day = Number(d);
          const state = s.day > day ? 'done' : s.day === day ? 'now' : 'todo';
          return h('li', { class: state },
            h('span', null, `${day} 日目の夜`),
            h('b', null, yen(v)),
            h('span', { class: 'tag' }, state === 'done' ? '済' : state === 'now' ? '今夜' : `あと ${day - s.day} 日`),
          );
        }),
        h('li', { class: s.day === CONFIG.totalDays ? 'now' : 'todo' },
          h('span', null, `${CONFIG.totalDays} 日目の夜`), h('b', null, '残額すべて'), h('span', { class: 'tag' }, '最終'),
        ),
      ),
      h('h4', null, '繰り上げ返済'),
      h('div', { class: 'offer-row' },
        h('span', { class: 'yen' }, '¥'),
        input,
        h('button', { class: 'btn', onclick: () => act({ type: 'PAY_DEBT', amount: digits(debtDraft) }) }, '返済'),
      ),
      h('div', { class: 'btn-row' }, quick('¥10,000', Math.min(10_000, spare)), quick('¥50,000', Math.min(50_000, spare)), quick('支払い後の余り全部', spare)),
    ),
    h('div', { class: 'nt-col' },
      head('貸付利率'),
      h('div', { class: 'rate-row' },
        h('button', { class: 'btn', disabled: rate <= 3, onclick: () => act({ type: 'SET_RATE', rate: s.rate - 0.01 }), 'aria-label': '利率を下げる' }, '−'),
        h('b', null, `${rate}%`),
        h('button', { class: 'btn', disabled: rate >= max, onclick: () => act({ type: 'SET_RATE', rate: s.rate + 0.01 }), 'aria-label': '利率を上げる' }, '＋'),
      ),
      h('div', { class: 'meter rate-meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': rate },
        h('div', { class: 'meter-fill', style: { width: `${Math.min(100, (rate / max) * 100)}%` } }),
      ),
      h('p', { class: 'small' }, `${CONFIG.loanTermDays} 日あたり・上限 ${max}%`),
      h('p', { class: 'muted small' }, '利率が高いほど利息収入は増えるが、客は請け出しを諦めやすくなる。'),
      head('信用金庫', h('span', { class: 'big-num' }, yen(bank))),
      h('p', { class: 'small' }, `枠 ${yen(bankLimit(s))}・日利 ${CONFIG.bankDailyRate * 100}%${bank > 0 ? `・今夜の利息 ${yen(bankInterest(s))}` : ''}`),
      h('div', { class: 'offer-row' },
        h('span', { class: 'yen' }, '¥'),
        h('input', { class: 'offer-input', type: 'text', inputmode: 'numeric', placeholder: '金額', 'aria-label': '借入・返済の金額', oninput: (e: Event) => { bankDraft = (e.target as HTMLInputElement).value; } }),
        h('button', { class: 'btn', onclick: () => act({ type: 'BORROW', amount: digits(bankDraft) }) }, '借りる'),
        h('button', { class: 'btn', disabled: bank <= 0, onclick: () => act({ type: 'REPAY_BANK', amount: digits(bankDraft) || bank }) }, '返す'),
      ),
      h('p', { class: 'muted small' }, `つなぎ資金。枠は評判で増える。${CONFIG.totalDays} 日目の夜に残っていれば先に取り立てられ、返せない分は借金に加わる。`),
    ),
  );
}

function shopTab(s: GameState): HTMLElement {
  return h('div', { class: 'nt-shop' },
    head('投資・店員', h('small', { class: 'muted' }, `所持金 ${yen(s.money)}`)),
    h('div', { class: 'shop-grid' }, ...UPGRADES.map((u) => {
      const owned = s.upgrades.includes(u.id);
      const locked = s.day < u.availableDay;
      return h('div', { class: `shop-card ${owned ? 'owned' : locked ? 'locked' : ''}` },
        h('b', null, u.name, h('span', { class: 'tag' }, u.tool ? '道具' : '設備')),
        h('p', null, u.desc),
        owned
          ? h('span', { class: 'tag good' }, '導入済み')
          : locked
            ? h('span', { class: 'muted small' }, `${u.availableDay} 日目から・${yen(u.price)}`)
            : h('button', { class: 'btn small primary', disabled: s.money < u.price, onclick: () => act({ type: 'BUY_UPGRADE', id: u.id }) }, `購入 ${yen(u.price)}`),
      );
    }),
    h('div', { class: `shop-card ${s.clerk ? 'owned' : ''}` },
      h('b', null, s.clerk ? '店員（雇用中）' : '店員', h('span', { class: 'tag' }, '人')),
      h('p', null, `日給 ${yen(CONFIG.clerkWage)}。満期の請け出し・利払いを開店前に代わりに応対する。偽の名義人を見逃すことがある。`),
      s.clerk
        ? h('button', { class: 'btn small', onclick: () => act({ type: 'FIRE_CLERK' }) }, '暇を出す')
        : h('button', { class: 'btn small primary', onclick: () => act({ type: 'HIRE_CLERK' }) }, '雇う'),
    )),
  );
}

// ---------- 画面 ----------

const TABS: { id: NightTab; seal: string; label: string; badge: (s: GameState) => { text: string; warn?: boolean } | null }[] = [
  { id: 'report', seal: '報', label: '概況・日報', badge: () => null },
  {
    id: 'books', seal: '帳', label: '帳簿・支払い',
    badge: (s) => (s.money - committedExpenses(s) < 0 ? { text: '!', warn: true } : null),
  },
  {
    id: 'stock', seal: '蔵', label: '在庫',
    badge: (s) => {
      const n = s.inventory.filter((i) => !i.shelved).length;
      return n ? { text: String(n) } : null;
    },
  },
  {
    id: 'trade', seal: '商', label: '仕入れ・広告',
    badge: (s) => {
      const n = (s.dealerLots ?? []).filter((l) => s.money >= l.price).length;
      return n ? { text: String(n) } : null;
    },
  },
  {
    id: 'loans', seal: '札', label: '質札',
    badge: (s) => {
      const n = s.loans.filter((l) => l.status === 'active' && l.dueDay <= s.day + 1).length;
      return n ? { text: String(n), warn: true } : null;
    },
  },
  {
    id: 'debt', seal: '債', label: '借金・利率',
    badge: (s) => (CONFIG.installments[s.day] ? { text: '今夜', warn: true } : null),
  },
  {
    id: 'shop', seal: '投', label: '投資・店員',
    badge: (s) => {
      const n = UPGRADES.filter((u) => !s.upgrades.includes(u.id) && s.day >= u.availableDay && s.money >= u.price).length;
      return n ? { text: String(n) } : null;
    },
  },
];

function tabBody(s: GameState): HTMLElement {
  switch (ui.nightTab) {
    case 'books':
      return booksTab(s);
    case 'stock':
      return stockTab(s);
    case 'trade':
      return tradeTab(s);
    case 'loans':
      return loansTab(s);
    case 'debt':
      return debtTab(s);
    case 'shop':
      return shopTab(s);
    case 'report':
    default:
      return reportTab(s);
  }
}

export function nightScreen(s: GameState): HTMLElement {
  const committed = committedExpenses(s);
  const after = s.money - committed;
  const short = shortOfInstallment(s);

  return h('div', { class: 'screen night' },
    hud(s),
    h('nav', { class: 'night-tabs', role: 'tablist', 'aria-label': '夜の帳簿' }, ...TABS.map((t, i) => {
      const b = t.badge(s);
      const active = ui.nightTab === t.id;
      return h('button', {
        class: `ntab ${active ? 'active' : ''}`, role: 'tab', 'aria-selected': active ? 'true' : 'false',
        'data-key': `tab-${i + 1}`, onclick: () => setTab(t.id),
      },
      h('span', { class: 'seal' }, t.seal),
      h('span', { class: 'ntab-label' }, t.label),
      b ? h('span', { class: `badge ${b.warn ? 'warn' : ''}` }, b.text) : null,
      h('kbd', null, String(i + 1)),
      );
    })),
    h('main', { class: 'night-main', role: 'tabpanel' }, tabBody(s)),
    h('footer', { class: 'night-foot' },
      h('div', { class: 'foot-sum' },
        h('span', null, '所持金 ', h('b', null, yen(s.money))),
        h('span', null, '− 今夜の支払い ', h('b', null, yen(committed))),
        h('span', null, '＝ ', h('b', { class: after < 0 ? 'neg' : '' }, yen(after))),
      ),
      short ? h('p', { class: 'warn-text' }, '定期返済に足りない！ このまま眠ると店は差し押さえられる。在庫を業者に売ってでも現金を作れ。') : null,
      h('button', {
        class: 'btn primary big',
        onclick: () => {
          priceDrafts.clear();
          ui.nightTab = 'report';
          ui.nightPage = {};
          ui.stockSel = null;
          act({ type: 'END_NIGHT' });
        },
      }, s.day >= CONFIG.totalDays ? '最終日を終える' : '眠る（翌日へ）'),
    ),
  );
}
