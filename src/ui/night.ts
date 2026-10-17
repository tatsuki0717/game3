// 夜の帳簿画面。

import { CONDITION_LABEL, CONFIG } from '../core/config';
import { yen } from '../core/dates';
import { itemDef } from '../core/data/items';
import { UPGRADES } from '../core/data/schedule';
import { committedExpenses, maxRate, shelfSlots } from '../core/game';
import { interestOf, saleProbability, shopperValue, wholesalePrice } from '../core/systems/economy';
import type { GameState, InventoryItem } from '../core/types';
import { debtMeter, historyChart } from './chart';
import { h } from './dom';
import { hud } from './screens';
import { act } from './store';

const priceDrafts = new Map<string, string>();

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
    h('td', null, `${def.emoji} ${def.name}`, h('small', null, inv.source === 'forfeit' ? '質流れ' : inv.source === 'story' ? '祖父の金庫' : '買取')),
    h('td', null, CONDITION_LABEL[inv.item.condition].slice(0, 1)),
    h('td', null, yen(inv.cost)),
    h('td', null, yen(wholesalePrice(s, inv))),
    h('td', null,
      h('input', {
        class: 'price-input', type: 'text', inputmode: 'numeric', value: draft,
        oninput: (e: Event) => priceDrafts.set(id, (e.target as HTMLInputElement).value),
      }),
      h('small', { class: 'chance' }, `売れ行き ${chance}`),
    ),
    h('td', { class: 'row-actions' },
      inv.shelved
        ? h('button', { class: 'btn small', onclick: () => act({ type: 'UNSHELVE', itemId: id }) }, '下げる')
        : null,
      h('button', {
        class: 'btn small primary',
        onclick: () => act({ type: 'SHELVE', itemId: id, price: Number((priceDrafts.get(id) ?? draft).replace(/[^\d]/g, '')) }),
      }, inv.shelved ? '値札更新' : '陳列'),
      h('button', { class: 'btn small', onclick: () => { priceDrafts.delete(id); act({ type: 'WHOLESALE', itemId: id }); } }, '業者へ'),
    ),
  );
}

function nextDueText(s: GameState): string {
  const next = Object.entries(CONFIG.installments).map(([d, v]) => [Number(d), v] as const).find(([d]) => d >= s.day);
  if (next) {
    const days = next[0] - s.day;
    return `次の定期返済：${days === 0 ? '今夜' : `${days} 日後（${next[0]} 日目の夜）`}に ${yen(Math.min(next[1], s.debt))}`;
  }
  return `最終返済：${CONFIG.totalDays} 日目の夜に残額 ${yen(s.debt)}`;
}

export function nightScreen(s: GameState): HTMLElement {
  const income = s.ledger.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
  const outgo = s.ledger.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);
  const committed = committedExpenses(s);
  const after = s.money - committed;
  const installment = s.expenses.find((e) => e.id === 'installment');
  const activeLoans = s.loans.filter((l) => l.status === 'active').sort((a, b) => a.dueDay - b.dueDay);
  const shelved = s.inventory.filter((i) => i.shelved).length;
  const f = s.family;
  const familyState = f.sick ? '祖母が寝込んでいる' : f.hunger > 0 ? 'お腹を空かせている' : f.cold > 0 ? '寒がっている' : '元気';
  let debtDraft = '';

  const log = s.todayLog;
  const stat = (label: string, value: string) => h('div', { class: 'stat' }, h('span', null, label), h('b', null, value));

  return h('div', { class: 'screen night' },
    hud(s),
    h('div', { class: 'night-grid' },
      h('section', { class: 'panel wide report' },
        h('h3', null, `${s.day} 日目の日報`),
        h('div', { class: 'stats' },
          stat('応対', `${s.served} 人`),
          log ? stat('成立', `${log.deals} 件`) : null,
          log ? stat('通報', `${log.reports} 件`) : null,
          log ? stat('断った・帰られた', `${log.refused + log.walkouts} 人`) : null,
          stat('本日の収支', `${income + outgo >= 0 ? '+' : ''}${yen(income + outgo)}`),
        ),
        h('div', { class: 'report-grid' },
          h('div', null,
            debtMeter(s),
            h('p', { class: 'muted small' }, nextDueText(s)),
          ),
          historyChart(s),
        ),
      ),
      h('section', { class: 'panel' },
        h('h3', null, '本日の帳簿'),
        h('ul', { class: 'ledger' },
          ...s.ledger.map((l) => h('li', null, h('span', null, l.label), h('b', { class: l.amount < 0 ? 'neg' : 'pos' }, yen(l.amount)))),
        ),
        h('div', { class: 'ledger-total' },
          h('span', null, `収入 ${yen(income)}`), h('span', null, `支出 ${yen(outgo)}`),
        ),
      ),
      h('section', { class: 'panel' },
        h('h3', null, '支払い'),
        h('ul', { class: 'expenses' }, ...s.expenses.map((e) => h('li', null,
          h('label', null,
            h('input', { type: 'checkbox', checked: e.pay, disabled: e.mandatory, onchange: () => act({ type: 'TOGGLE_EXPENSE', id: e.id }) }),
            ` ${e.label}`,
          ),
          h('b', null, yen(e.amount)),
        ))),
        h('p', null, '家族：', h('b', null, familyState)),
        h('p', { class: after < 0 ? 'neg' : '' }, `支払い後の所持金：${yen(after)}`),
        installment && s.money < committed
          ? h('p', { class: 'warn-text' }, '⚠ 定期返済に足りない！ このまま眠ると店は差し押さえられる。在庫を業者に売ってでも現金を作れ。')
          : null,
      ),
      h('section', { class: 'panel' },
        h('h3', null, '借金'),
        h('p', null, `残高 ${yen(s.debt)}`),
        h('p', { class: 'muted small' }, `定期返済：${Object.entries(CONFIG.installments).map(([d, v]) => `${d}日目 ${yen(v)}`).join(' / ')}。残りは ${CONFIG.totalDays} 日目の夜に所持金から自動で返済。`),
        h('div', { class: 'offer-row' },
          h('span', { class: 'yen' }, '¥'),
          h('input', { class: 'offer-input', type: 'text', inputmode: 'numeric', placeholder: '繰り上げ返済額', oninput: (e: Event) => { debtDraft = (e.target as HTMLInputElement).value; } }),
          h('button', { class: 'btn', onclick: () => act({ type: 'PAY_DEBT', amount: Number(debtDraft.replace(/[^\d]/g, '')) }) }, '返済'),
        ),
        h('h3', null, '貸付利率'),
        h('div', { class: 'rate-row' },
          h('button', { class: 'btn small', onclick: () => act({ type: 'SET_RATE', rate: s.rate - 0.01 }) }, '−'),
          h('b', null, `${Math.round(s.rate * 100)}%`),
          h('button', { class: 'btn small', onclick: () => act({ type: 'SET_RATE', rate: s.rate + 0.01 }) }, '＋'),
          h('small', null, `（${CONFIG.loanTermDays} 日あたり・上限 ${Math.round(maxRate(s) * 100)}%）`),
        ),
        h('p', { class: 'muted small' }, '利率が高いほど利息収入は増えるが、客は請け出しを諦めやすくなる。'),
      ),
      h('section', { class: 'panel wide' },
        h('h3', null, `在庫（陳列 ${shelved} / ${shelfSlots(s)}）`),
        s.inventory.length
          ? h('table', { class: 'inventory' },
            h('tr', null, h('th', null, '品物'), h('th', null, '状態'), h('th', null, '仕入'), h('th', null, '業者買取'), h('th', null, '店頭価格'), h('th', null, '')),
            ...s.inventory.map((inv) => inventoryRow(s, inv)),
          )
          : h('p', { class: 'muted' }, '在庫はない。'),
        h('p', { class: 'muted small' }, '陳列した品は翌朝までに売れることがある。高すぎる値札は売れにくい。業者への売却は即金だが安い（偽物はほぼ値がつかない）。'),
      ),
      h('section', { class: 'panel' },
        h('h3', null, `質札（${activeLoans.length} 件）`),
        activeLoans.length
          ? h('table', { class: 'loans' },
            h('tr', null, h('th', null, 'No.'), h('th', null, '名義'), h('th', null, '品物'), h('th', null, '元金'), h('th', null, '期限')),
            ...activeLoans.map((l) => h('tr', { class: l.dueDay <= s.day + 1 ? 'due' : '' },
              h('td', null, String(l.ticketNo)),
              h('td', null, l.customer.person.name),
              h('td', null, itemDef(l.item.defId).name),
              h('td', null, `${yen(l.principal)}（利 ${yen(interestOf(l))}）`),
              h('td', null, `${l.dueDay} 日目`),
            )),
          )
          : h('p', { class: 'muted' }, 'なし'),
      ),
      h('section', { class: 'panel' },
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
      ),
    ),
    h('div', { class: 'night-foot' },
      h('button', { class: 'btn primary big', onclick: () => { priceDrafts.clear(); act({ type: 'END_NIGHT' }); } }, s.day >= CONFIG.totalDays ? '最終日を終える' : '眠る（翌日へ）'),
    ),
  );
}
