// 夜の帳簿画面。左のタブで帳簿・在庫・質札・投資・借金を切り替え、右に支払いと「眠る」。

import { CONDITION_LABEL, CONFIG } from '../core/config';
import { yen } from '../core/dates';
import { itemDef } from '../core/data/items';
import { UPGRADES } from '../core/data/schedule';
import { committedExpenses, maxRate, shelfSlots } from '../core/game';
import { interestOf, saleProbability, shopperValue, wholesalePrice } from '../core/systems/economy';
import type { GameState, InventoryItem } from '../core/types';
import { h } from './dom';
import { hud } from './screens';
import { act, notify, openModal, ui, type NightTab } from './store';

const priceDrafts = new Map<string, string>();
const debtDrafts: Record<'main' | 'shark', string> = { main: '', shark: '' };
const PAGE = 7;

function suggested(s: GameState, inv: InventoryItem): number {
  return Math.round((shopperValue(s, inv) * 0.9) / 1000) * 1000;
}

function inventoryRow(s: GameState, inv: InventoryItem): HTMLElement {
  const def = itemDef(inv.item.defId);
  const id = inv.item.id;
  const draft = priceDrafts.get(id) ?? String(inv.shelved ? inv.price : suggested(s, inv));
  const p = inv.shelved ? saleProbability(s, inv) : saleProbability(s, { ...inv, price: Number(draft) || 0 });
  const chance = p >= 0.5 ? '高' : p >= 0.25 ? '中' : '低';
  return h('tr', { class: inv.shelved ? 'shelved' : '' },
    h('td', null, h('span', { class: 'inv-emoji' }, def.emoji), h('span', null, def.name, h('small', null, inv.source === 'forfeit' ? '質流れ' : inv.source === 'story' ? '祖父の金庫' : '買取'))),
    h('td', null, CONDITION_LABEL[inv.item.condition].slice(0, 1)),
    h('td', null, yen(inv.cost)),
    h('td', null, yen(wholesalePrice(s, inv))),
    h('td', null,
      h('input', {
        class: 'price-input', type: 'text', inputmode: 'numeric', value: draft,
        oninput: (e: Event) => priceDrafts.set(id, (e.target as HTMLInputElement).value),
      }),
      h('small', { class: `chance chance-${chance}` }, `売れ行き ${chance}`),
    ),
    h('td', { class: 'row-actions' },
      inv.shelved ? h('button', { class: 'btn small', onclick: () => act({ type: 'UNSHELVE', itemId: id }) }, '下げる') : null,
      h('button', {
        class: 'btn small primary',
        onclick: () => act({ type: 'SHELVE', itemId: id, price: Number((priceDrafts.get(id) ?? draft).replace(/[^\d]/g, '')) }),
      }, inv.shelved ? '値札更新' : '陳列'),
      h('button', { class: 'btn small', onclick: () => { priceDrafts.delete(id); act({ type: 'WHOLESALE', itemId: id }); } }, '業者へ'),
    ),
  );
}

function ledgerTab(s: GameState): HTMLElement {
  const income = s.ledger.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
  const outgo = s.ledger.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);
  return h('div', { class: 'tab-pane' },
    h('h3', null, '本日の帳簿'),
    h('ul', { class: 'ledger scroll' },
      ...s.ledger.map((l) => h('li', null, h('span', null, l.label), h('b', { class: l.amount < 0 ? 'neg' : 'pos' }, yen(l.amount)))),
      s.ledger.length ? null : h('li', { class: 'muted' }, '記帳なし'),
    ),
    h('div', { class: 'ledger-total' }, h('span', null, '収入 ', h('b', { class: 'pos' }, yen(income))), h('span', null, '支出 ', h('b', { class: 'neg' }, yen(outgo))), h('span', null, '差引 ', h('b', null, yen(income + outgo)))),
  );
}

function inventoryTab(s: GameState): HTMLElement {
  const shelved = s.inventory.filter((i) => i.shelved).length;
  const pages = Math.max(1, Math.ceil(s.inventory.length / PAGE));
  ui.invPage = Math.min(ui.invPage, pages - 1);
  const rows = s.inventory.slice(ui.invPage * PAGE, ui.invPage * PAGE + PAGE);
  return h('div', { class: 'tab-pane' },
    h('h3', null, `在庫（陳列 ${shelved} / ${shelfSlots(s)}）`),
    s.inventory.length
      ? h('table', { class: 'inventory' },
        h('tr', null, h('th', null, '品物'), h('th', null, '状態'), h('th', null, '仕入'), h('th', null, '業者買取'), h('th', null, '店頭価格'), h('th', null, '')),
        ...rows.map((inv) => inventoryRow(s, inv)),
      )
      : h('p', { class: 'muted empty-note' }, '在庫はない。'),
    pages > 1
      ? h('div', { class: 'pager' },
        h('button', { class: 'btn small', disabled: ui.invPage === 0, onclick: () => { ui.invPage -= 1; notify(); } }, '◀ 前'),
        h('span', null, `${ui.invPage + 1} / ${pages}`),
        h('button', { class: 'btn small', disabled: ui.invPage >= pages - 1, onclick: () => { ui.invPage += 1; notify(); } }, '次 ▶'),
      )
      : null,
    h('p', { class: 'muted small foot-note' }, '陳列した品は翌朝までに売れることがある。高すぎる値札は売れにくい。業者への売却は即金だが安い（偽物はほぼ値がつかない）。'),
  );
}

function loansTab(s: GameState): HTMLElement {
  const activeLoans = s.loans.filter((l) => l.status === 'active').sort((a, b) => a.dueDay - b.dueDay);
  return h('div', { class: 'tab-pane' },
    h('h3', null, `質札（${activeLoans.length} 件）`),
    activeLoans.length
      ? h('div', { class: 'scroll' }, h('table', { class: 'loans' },
        h('tr', null, h('th', null, 'No.'), h('th', null, '名義'), h('th', null, '品物'), h('th', null, '元金'), h('th', null, '利息'), h('th', null, '期限')),
        ...activeLoans.map((l) => h('tr', { class: l.dueDay <= s.day + 1 ? 'due' : '' },
          h('td', null, String(l.ticketNo)),
          h('td', null, l.customer.person.name),
          h('td', null, itemDef(l.item.defId).name),
          h('td', null, yen(l.principal)),
          h('td', null, yen(interestOf(l))),
          h('td', null, `${l.dueDay} 日目`),
        )),
      ))
      : h('p', { class: 'muted empty-note' }, '発行中の質札はない。'),
    h('h3', null, '貸付利率'),
    h('div', { class: 'rate-row' },
      h('button', { class: 'btn small', onclick: () => act({ type: 'SET_RATE', rate: s.rate - 0.01 }) }, '−'),
      h('b', null, `${Math.round(s.rate * 100)}%`),
      h('button', { class: 'btn small', onclick: () => act({ type: 'SET_RATE', rate: s.rate + 0.01 }) }, '＋'),
      h('small', null, `（${CONFIG.loanTermDays} 日あたり・上限 ${Math.round(maxRate(s) * 100)}%）`),
    ),
    h('p', { class: 'muted small' }, '利率が高いほど利息収入は増えるが、客は請け出しを諦めやすくなる。'),
  );
}

function investTab(s: GameState): HTMLElement {
  return h('div', { class: 'tab-pane' },
    h('h3', null, '投資'),
    h('ul', { class: 'upgrades' }, ...UPGRADES.map((u) => {
      const owned = s.upgrades.includes(u.id);
      const locked = s.day < u.availableDay;
      return h('li', { class: owned ? 'owned' : locked ? 'locked' : '' },
        h('div', null, h('b', null, u.name), h('small', null, u.desc)),
        owned
          ? h('span', { class: 'tag good' }, '導入済み')
          : locked
            ? h('span', { class: 'muted small' }, `${u.availableDay} 日目〜`)
            : h('button', { class: 'btn small', disabled: s.money < u.price, onclick: () => act({ type: 'BUY_UPGRADE', id: u.id }) }, yen(u.price)),
      );
    })),
  );
}

function repayRow(target: 'main' | 'shark', label: string, owed: number): HTMLElement {
  return h('div', { class: 'repay' },
    h('div', { class: 'repay-head' }, h('span', null, label), h('b', { class: target === 'shark' ? 'neg' : '' }, yen(owed))),
    h('div', { class: 'offer-row' },
      h('span', { class: 'yen' }, '¥'),
      h('input', { class: 'offer-input', type: 'text', inputmode: 'numeric', placeholder: '返済額', value: debtDrafts[target], oninput: (e: Event) => { debtDrafts[target] = (e.target as HTMLInputElement).value; } }),
      h('button', { class: 'btn', disabled: owed <= 0, onclick: () => { act({ type: 'PAY_DEBT', target, amount: Number(debtDrafts[target].replace(/[^\d]/g, '')) }); debtDrafts[target] = ''; } }, '返済'),
      h('button', { class: 'btn small', disabled: owed <= 0, onclick: () => act({ type: 'PAY_DEBT', target, amount: owed }) }, '全額'),
    ),
  );
}

function financeTab(s: GameState): HTMLElement {
  return h('div', { class: 'tab-pane' },
    h('h3', null, '借金'),
    repayRow('main', '本来の借金（債権者）', s.debt),
    s.shark > 0 ? repayRow('shark', `鮫島ファイナンス（日利 ${Math.round(CONFIG.sharkDailyRate * 100)}%）`, s.shark) : null,
    h('p', { class: 'muted small' }, `定期返済：${Object.entries(CONFIG.installments).map(([d, v]) => `${d}日目 ${yen(v)}`).join(' / ')}。残りは ${CONFIG.totalDays} 日目の夜に所持金から自動で返済（鮫島が先）。`),
    h('h3', null, '追加の借入'),
    h('p', null, '資金繰りが苦しいときは、信用金庫か鮫島ファイナンスから借りられる。'),
    h('button', { class: 'btn primary', onclick: () => openModal('borrow') }, '💴 借入の窓口を開く'),
  );
}

const TABS: [NightTab, string, string][] = [
  ['ledger', '📒', '帳簿'],
  ['inventory', '📦', '在庫'],
  ['loans', '🎫', '質札・利率'],
  ['invest', '🔧', '投資'],
  ['finance', '💴', '借金・借入'],
];

export function nightScreen(s: GameState): HTMLElement {
  const committed = committedExpenses(s);
  const after = s.money - committed;
  const installment = s.expenses.find((e) => e.id === 'installment');
  const f = s.family;
  const familyState = f.sick ? '祖母が寝込んでいる' : f.hunger > 0 ? 'お腹を空かせている' : f.cold > 0 ? '寒がっている' : '元気';
  const counts: Partial<Record<NightTab, number>> = { inventory: s.inventory.length, loans: s.loans.filter((l) => l.status === 'active').length };
  const body = { ledger: ledgerTab, inventory: inventoryTab, loans: loansTab, invest: investTab, finance: financeTab }[ui.nightTab](s);

  return h('div', { class: 'screen night' },
    hud(s),
    h('div', { class: 'night-layout' },
      h('nav', { class: 'night-tabs' },
        h('div', { class: 'night-title' }, '帳場', h('small', null, `${s.day} 日目の夜`)),
        ...TABS.map(([id, ico, label]) => h('button', { class: `night-tab ${ui.nightTab === id ? 'on' : ''}`, onclick: () => { ui.nightTab = id; notify(); } },
          h('span', { class: 'ico-e' }, ico), h('span', null, label), counts[id] ? h('em', null, String(counts[id])) : null,
        )),
      ),
      h('section', { class: 'panel night-main' }, body),
      h('aside', { class: 'panel night-side' },
        h('h3', null, '今夜の支払い'),
        h('ul', { class: 'expenses' }, ...s.expenses.map((e) => h('li', null,
          h('label', null,
            h('input', { type: 'checkbox', checked: e.pay, disabled: e.mandatory, onchange: () => act({ type: 'TOGGLE_EXPENSE', id: e.id }) }),
            ` ${e.label}`,
          ),
          h('b', null, yen(e.amount)),
        ))),
        h('div', { class: 'side-row' }, h('span', null, '家族'), h('b', { class: familyState === '元気' ? 'pos' : 'neg' }, familyState)),
        h('div', { class: 'side-row big' }, h('span', null, '支払い後'), h('b', { class: after < 0 ? 'neg' : '' }, yen(after))),
        installment && s.money < committed
          ? h('p', { class: 'warn-text' }, '⚠ 定期返済に足りない！ このまま眠ると店は差し押さえられる。在庫を業者に売るか、借入で現金を作れ。')
          : null,
        installment && s.money < committed ? h('button', { class: 'btn danger', onclick: () => openModal('borrow') }, '💴 借入する') : null,
        h('div', { class: 'grow' }),
        h('button', { class: 'btn primary huge', onclick: () => { priceDrafts.clear(); ui.nightTab = 'ledger'; ui.invPage = 0; act({ type: 'END_NIGHT' }); } }, s.day >= CONFIG.totalDays ? '最終日を終える' : '🌙 眠る（翌日へ）'),
      ),
    ),
  );
}
