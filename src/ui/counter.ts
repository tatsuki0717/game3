// 窓口画面（メインゲーム）。

import { CONDITION_LABEL, CONFIG, DEFECT_LABEL } from '../core/config';
import { dateOfDay, toWareki, yen } from '../core/dates';
import { CATEGORY_LABEL, ITEMS, itemDef } from '../core/data/items';
import { activeRules } from '../core/data/rules';
import { TOOL_INFO } from '../core/data/schedule';
import { STORY_VISITS } from '../core/data/story';
import { refLabel } from '../core/systems/appraisal';
import type { Customer, DocKind, GameState, IdDoc, Session, ToolId } from '../core/types';
import { h } from './dom';
import { faceImg, type Mood } from './face';
import { categoryIcon } from './pixel';
import { hud } from './screens';
import { act, notify, toast, ui } from './store';

const DOC_LABEL: Record<DocKind, string> = {
  license: '運転免許証',
  passport: '旅券（パスポート）',
  insurance: '健康保険証',
  employment: '在職証明書',
};

const MATERIAL_LABEL = { gold: '金', platinum: 'プラチナ', steel: 'ステンレス鋼', other: 'その他' };

function refClick(ref: string): void {
  if (!ui.compareMode) return;
  if (!ui.compareFirst) {
    ui.compareFirst = ref;
    // シリアルを選んだら手配書を開いて相手を探しやすくする（刻印・重量の相手は机上のカタログ控えにある）
    if (ref === 'item.serial') ui.refTab = 'stolen';
    notify();
    return;
  }
  if (ui.compareFirst === ref) {
    ui.compareFirst = null;
    notify();
    return;
  }
  const a = ui.compareFirst;
  ui.compareFirst = null;
  act({ type: 'COMPARE', a, b: ref });
}

/** 照合モードでクリックできる項目 */
function ref(refId: string, content: string | Node, extraClass = ''): HTMLElement {
  const cls = ['ref', extraClass, ui.compareMode ? 'armed' : '', ui.compareFirst === refId ? 'sel' : ''].filter(Boolean).join(' ');
  return h('span', {
    class: cls,
    title: ui.compareMode ? `${refLabel(refId)}を照合` : undefined,
    onclick: (e: Event) => {
      if (!ui.compareMode) return;
      e.stopPropagation();
      refClick(refId);
    },
  }, content);
}

function targetClick(target: string): void {
  if (!ui.pendingTool) return;
  const tool = ui.pendingTool as ToolId;
  ui.pendingTool = null;
  act({ type: 'USE_TOOL', tool, target });
}

function useTool(tool: ToolId): void {
  const info = TOOL_INFO[tool];
  if (info.target === 'item') {
    act({ type: 'USE_TOOL', tool, target: 'item' });
    return;
  }
  ui.pendingTool = ui.pendingTool === tool ? null : tool;
  ui.compareMode = false;
  if (ui.pendingTool) toast(`${info.name}：品物か書類をクリック`);
  notify();
}

// ---------------------------------------------------------------- カード

function fact(label: string, value: Node | string): HTMLElement {
  return h('div', { class: 'fact' }, h('span', { class: 'fact-label' }, label), h('span', { class: 'fact-value' }, value));
}

const unknown = (tool: string) => h('span', { class: 'unknown' }, `？（${tool}）`);

function itemCard(s: GameState, ses: Session): HTMLElement | null {
  const item = ses.customer.item;
  if (!item) return null;
  const def = itemDef(item.defId);
  const r = (k: string) => ses.revealed.includes(k);
  const precious = def.material === 'gold' || def.material === 'platinum';
  return h('div', {
    class: `card item-card ${ui.pendingTool ? 'targetable' : ''}`,
    onclick: () => targetClick('item'),
  },
    h('div', { class: 'card-title' }, categoryIcon(def.category, 3), h('div', null, h('b', null, def.name), h('small', null, `${CATEGORY_LABEL[def.category]}（自己申告）`))),
    fact('刻印', r('item.hallmark') ? ref('item.hallmark', item.hallmark, 'mono') : unknown('ルーペ')),
    def.serialPrefix ? fact('シリアル', r('item.serial') ? ref('item.serial', item.serial ?? '', 'mono') : unknown('ルーペ')) : null,
    fact('状態', r('item.condition')
      ? h('span', null, CONDITION_LABEL[item.condition], ...item.defects.map((d) => h('span', { class: 'tag bad' }, DEFECT_LABEL[d])))
      : unknown('ルーペ')),
    fact('重さ', r('item.weight') ? ref('item.weight', `${item.weightG} g`, 'mono') : unknown('天秤')),
    s.tools.includes('magnet') || r('item.magnetic')
      ? fact('磁性', r('item.magnetic') ? ref('item.magnetic', item.magnetic ? 'くっつく' : 'くっつかない') : unknown('磁石'))
      : null,
    precious && (s.tools.includes('acid') || r('item.purity'))
      ? fact('純度', r('item.purity') ? h('span', { class: item.purityOk ? '' : 'tag bad' }, item.purityOk ? '刻印どおり' : 'メッキ（不足）') : unknown('試金石'))
      : null,
    def.electric && (s.tools.includes('tester') || r('item.works'))
      ? fact('動作', r('item.works') ? h('span', { class: item.hiddenDefects.includes('broken') ? 'tag bad' : '' }, item.hiddenDefects.includes('broken') ? '動作不良' : '正常') : unknown('テスター'))
      : null,
    s.tools.includes('uv') || r('item.uv')
      ? fact('UV', r('item.uv') ? (item.hiddenDefects.includes('repaired') ? h('span', { class: 'tag bad' }, '修理痕あり') : '異常なし') : unknown('UV'))
      : null,
  );
}

function docCard(s: GameState, doc: IdDoc, i: number, c: Customer): HTMLElement {
  const r = (k: string) => `doc.${i}.${k}`;
  const uvDone = s.session?.revealed.includes(`doc.${i}.uv`);
  return h('div', {
    class: `card doc-card doc-${doc.kind} ${ui.pendingTool ? 'targetable' : ''}`,
    onclick: () => targetClick(`doc.${i}`),
  },
    h('div', { class: 'doc-head' }, DOC_LABEL[doc.kind], h('small', null, `No. ${doc.idNo}`)),
    h('div', { class: 'doc-body' },
      doc.photo ? ref(r('photo'), faceImg(doc.photo, { scale: 2, photo: true }), 'photo') : null,
      h('div', { class: 'doc-fields' },
        fact('氏名', ref(r('name'), doc.name)),
        fact('生年月日', ref(r('birth'), toWareki(doc.birth))),
        fact('住所', h('span', { class: 'small' }, doc.address)),
        doc.company ? fact('勤務先', doc.company) : null,
        fact('有効期限', ref(r('expiry'), toWareki(doc.expiry))),
        uvDone ? fact('透かし', h('span', { class: doc.forged ? 'tag bad' : 'tag good' }, doc.forged ? 'なし（偽造）' : 'あり')) : null,
      ),
    ),
    c.docs.length > 1 ? h('div', { class: 'doc-index' }, `書類 ${i + 1}`) : null,
  );
}

function ticketCard(c: Customer): HTMLElement | null {
  const t = c.ticket;
  if (!t) return null;
  return h('div', { class: 'card ticket-card' },
    h('div', { class: 'doc-head' }, '質札', h('small', null, `No. ${t.ticketNo}`)),
    fact('名義', ref('ticket.name', t.name)),
    fact('品名', t.itemName),
    fact('元金', yen(t.principal)),
    fact('利息', yen(t.interest)),
    fact('期限', `${t.dueDay} 日目`),
  );
}

/** 申告された品目のカタログ控え。照合の相手を机の上に置いておく。 */
function catalogCard(s: GameState, c: Customer): HTMLElement | null {
  if (!c.item) return null;
  const d = itemDef(c.item.defId);
  return h('div', { class: 'card catalog-card' },
    h('div', { class: 'doc-head' }, '品目カタログ（控え）', h('small', null, CATEGORY_LABEL[d.category])),
    fact('品名', d.name),
    fact('刻印', ref('catalog.hallmark', d.hallmark, 'mono')),
    fact('重量', ref('catalog.weight', `${d.weightG} g`, 'mono')),
    fact('素材', ref('catalog.material', MATERIAL_LABEL[d.material])),
    fact('相場', h('span', null, yen(catalogPrice(s, d.id)), h('small', { class: 'muted' }, '（新品同様）'))),
  );
}

const STAMP: Record<NonNullable<Session['outcome']>, string> = {
  deal: '成立',
  refused: '謝絶',
  left: '退店',
  reported: '通報',
  choice: '',
};

/** 応対が終わったときに机に押す判子。アニメーションは最初の描画だけ。 */
function stamp(ses: Session): HTMLElement | null {
  const label = ses.closed && ses.outcome ? STAMP[ses.outcome] : '';
  if (!label) return null;
  const fresh = ui.stampFor !== ses.customer.id;
  ui.stampFor = ses.customer.id;
  return h('div', { class: `stamp stamp-${ses.outcome} ${fresh ? 'fresh' : ''}` }, label);
}

const DISHONEST_FINDINGS = new Set(['fake_hallmark', 'fake_weight', 'fake_material', 'fake_purity', 'stolen', 'doc_forged', 'photo_mismatch', 'name_mismatch', 'birth_mismatch', 'ticket_mismatch']);

function moodOf(ses: Session): Mood {
  const c = ses.customer;
  if (ses.closed) {
    switch (ses.outcome) {
      case 'deal': return 'happy';
      case 'left': return 'angry';
      case 'reported': return 'shock';
      case 'refused': return c.personality === 'desperate' ? 'sad' : 'angry';
      default: return 'neutral';
    }
  }
  if (ses.findings.some((f) => DISHONEST_FINDINGS.has(f.kind))) return 'nervous';
  if (c.patience > 0 && ses.patience / c.patience <= 0.5) return 'angry';
  if (c.personality === 'desperate') return 'sad';
  return 'neutral';
}

/** 客が入ってきた最初の描画だけ登場アニメーションを付ける */
function arriving(id: string): boolean {
  const fresh = ui.faceFor !== id;
  ui.faceFor = id;
  return fresh;
}

function patienceMeter(ses: Session): HTMLElement | null {
  const c = ses.customer;
  if (c.intent !== 'pawn' && c.intent !== 'sell') return null;
  const max = Math.max(1, c.patience);
  const left = ses.closed && ses.outcome === 'left' ? 0 : Math.max(0, ses.patience);
  return h('div', { class: 'patience', title: '客の機嫌。低い額を提示し続けると帰ってしまう。' },
    h('span', null, '機嫌'),
    ...Array.from({ length: max }, (_, i) => h('i', { class: i < left ? 'on' : '' })),
  );
}

// ---------------------------------------------------------------- 右側パネル

/** 品物に対して道具を使い終えたか（UV は書類にも使えるので品物分だけ見る） */
const TOOL_REVEALS: Record<ToolId, string> = {
  loupe: 'item.hallmark',
  scale: 'item.weight',
  magnet: 'item.magnetic',
  tester: 'item.works',
  uv: 'item.uv',
  acid: 'item.purity',
};

function toolsTray(s: GameState): HTMLElement {
  const today = dateOfDay(s.day);
  const ses = s.session;
  return h('div', { class: 'tray' },
    h('div', { class: 'tray-tools' },
      ...s.tools.map((t, i) => {
        const info = TOOL_INFO[t];
        const used = !!ses?.revealed.includes(TOOL_REVEALS[t]);
        return h('button', {
          class: `tool ${ui.pendingTool === t ? 'active' : ''} ${used ? 'used' : ''}`,
          disabled: !ses || ses.closed || (info.target === 'item' && (!ses.customer.item || used)),
          title: `${info.name}（${info.minutes} 分）［${i + 1}］`,
          'data-key': `tool-${i + 1}`,
          onclick: () => useTool(t),
        }, h('kbd', null, String(i + 1)), h('span', { class: 'tool-name' }, info.name), h('small', null, used ? '済' : `${info.minutes}分`));
      }),
    ),
    h('div', { class: 'tray-row' },
      h('button', {
        class: `btn compare ${ui.compareMode ? 'active' : ''}`,
        disabled: !ses || ses.closed,
        'data-key': 'compare',
        title: '照合モード［C］',
        onclick: () => { ui.compareMode = !ui.compareMode; ui.compareFirst = null; ui.pendingTool = null; notify(); },
      }, h('kbd', null, 'C'), ui.compareMode ? '照合中：2 項目を選ぶ' : '照合'),
      ref('today', `本日 ${toWareki(today)}`, 'today-chip'),
    ),
  );
}

function findingsList(ses: Session): HTMLElement | null {
  if (ses.findings.length === 0) return null;
  const dealing = !ses.closed && (ses.customer.intent === 'pawn' || ses.customer.intent === 'sell');
  return h('div', { class: 'findings' },
    h('h4', null, '発見した問題'),
    ...ses.findings.map((f) => h('div', { class: 'finding' },
      h('span', null, f.label),
      f.pointable && dealing
        ? h('button', { class: 'btn small', disabled: ses.pointed.includes(f.key), onclick: () => act({ type: 'POINT_OUT', key: f.key }) }, ses.pointed.includes(f.key) ? '指摘済み' : '指摘する')
        : null,
    )),
  );
}

function actionPanel(s: GameState): HTMLElement {
  const ses = s.session;
  if (!ses) {
    const closing = s.clock >= CONFIG.closeMinute;
    return h('div', { class: 'panel actions' },
      closing
        ? h('p', { class: 'closing' }, '閉店時間だ。')
        : h('p', null, s.queue.length > 0 ? `店先に ${s.queue.length} 人並んでいる。` : 'もう客はいないようだ。'),
      !closing && s.queue.length > 0
        ? h('button', { class: 'btn primary big', 'data-key': 'next', onclick: () => { ui.offer = ''; act({ type: 'NEXT_CUSTOMER' }); } }, '次の方、どうぞ', h('kbd', null, 'Enter'))
        : null,
      h('button', { class: `btn ${closing || s.queue.length === 0 ? 'primary big' : ''}`, 'data-key': closing || s.queue.length === 0 ? 'next' : undefined, onclick: () => act({ type: 'CLOSE_SHOP' }) }, closing || s.queue.length === 0 ? '店を閉める' : '早めに店を閉める'),
    );
  }
  const c = ses.customer;
  if (ses.closed) {
    const label = { deal: '取引成立', refused: 'お断りした', left: '客は帰っていった', reported: '通報した', choice: '' }[ses.outcome ?? 'choice'];
    return h('div', { class: 'panel actions' },
      label ? h('p', { class: `outcome outcome-${ses.outcome}` }, label, ses.dealAmount ? `（${yen(ses.dealAmount)}）` : '') : null,
      findingsList(ses),
      h('button', { class: 'btn primary big', 'data-key': 'next', onclick: () => { ui.compareMode = false; ui.compareFirst = null; ui.pendingTool = null; act({ type: 'DISMISS' }); } }, '次へ', h('kbd', null, 'Enter')),
    );
  }
  if (c.intent === 'special') {
    const story = STORY_VISITS.find((v) => v.id === c.storyId);
    return h('div', { class: 'panel actions' },
      ...(story?.choices ?? []).map((ch, i) => h('button', { class: 'btn choice', onclick: () => act({ type: 'CHOOSE', index: i }) }, ch.label)),
    );
  }
  const reportable = ses.findings.some((f) => f.reportable);
  if (c.ticket) {
    const reduced = c.ticket.reducedInterest;
    const text = c.intent === 'redeem'
      ? `請け出し：元利 ${yen(c.ticket.principal + c.ticket.interest)} を受け取って品物を返す`
      : reduced === undefined
        ? `利払い：利息 ${yen(c.ticket.interest)} を受け取り期限を延長する`
        : `利払い：利息 ${yen(c.ticket.interest)} を ${yen(reduced)} にまけてほしいと頼まれた`;
    return h('div', { class: 'panel actions' },
      h('p', null, text),
      findingsList(ses),
      reduced !== undefined
        ? h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', onclick: () => act({ type: 'ACCEPT_REDUCTION' }) }, `${yen(reduced)} に減額する`),
          h('button', { class: 'btn', onclick: () => act({ type: 'ACCEPT_REQUEST' }) }, '元の利息で払ってもらう'),
        )
        : h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', onclick: () => act({ type: 'ACCEPT_REQUEST' }) }, '応じる'),
          // 名義人本人の請け出しは断れない。名義が違う人は断る
          c.intent === 'redeem' && !c.impostor ? null : h('button', { class: 'btn danger', onclick: () => act({ type: 'REFUSE' }) }, '断る'),
        ),
    );
  }
  const offer = () => {
    const n = Number(ui.offer.replace(/[^\d]/g, ''));
    if (!n) return toast('金額を入力してほしい。');
    act({ type: 'OFFER', amount: n });
  };
  const input = h('input', {
    class: 'offer-input',
    type: 'text',
    inputmode: 'numeric',
    placeholder: '金額',
    value: ui.offer,
    oninput: (e: Event) => { ui.offer = (e.target as HTMLInputElement).value; },
    onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') offer(); },
  });
  const nudge = (f: number) => {
    const base = Number(ui.offer.replace(/[^\d]/g, '')) || ses.ask;
    ui.offer = String(Math.max(100, Math.round((base * f) / 100) * 100));
    notify();
  };
  return h('div', { class: 'panel actions' },
    h('div', { class: 'ask' },
      h('span', null, c.intent === 'pawn' ? '質入れ希望' : '買取希望'),
      h('b', null, yen(ses.ask)),
      c.intent === 'pawn' ? h('small', null, `利率 ${Math.round(s.rate * 100)}% / ${CONFIG.loanTermDays}日`) : null,
    ),
    findingsList(ses),
    h('div', { class: 'offer-row' },
      h('span', { class: 'yen' }, '¥'), input,
      h('button', { class: 'btn primary', onclick: offer }, '提示'),
    ),
    h('div', { class: 'btn-row small-row' },
      h('button', { class: 'btn small', onclick: () => nudge(0.9) }, '−10%'),
      h('button', { class: 'btn small', onclick: () => nudge(1.1) }, '+10%'),
      h('button', { class: 'btn small', onclick: () => { ui.offer = String(ses.ask); notify(); } }, '希望額'),
      h('button', { class: 'btn small', onclick: () => { ui.offer = String(Math.round(ses.ask / 200) * 100); notify(); } }, '半額'),
    ),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn danger', onclick: () => act({ type: 'REFUSE' }) }, '断る'),
      h('button', { class: 'btn warn', disabled: !reportable, title: reportable ? '' : '盗品や偽造身分証の証拠が必要', onclick: () => act({ type: 'REPORT' }) }, '通報'),
    ),
  );
}

function referencePanel(s: GameState): HTMLElement {
  const tabs: [UiTab, string][] = [['rules', '規則帳'], ['catalog', 'カタログ'], ['stolen', `手配書 (${s.stolenList.length})`], ['today', '本日の取引']];
  return h('div', { class: 'panel reference' },
    h('div', { class: 'tabs' }, ...tabs.map(([id, label]) =>
      h('button', { class: `tab ${ui.refTab === id ? 'active' : ''}`, onclick: () => { ui.refTab = id; notify(); } }, label),
    )),
    h('div', { class: 'tab-body', 'data-scroll': 'ref' }, refBody(s)),
  );
}

type UiTab = typeof ui.refTab;

function refBody(s: GameState): HTMLElement {
  switch (ui.refTab) {
    case 'rules':
      return h('ol', { class: 'rules' }, ...activeRules(s.day).map((r) =>
        h('li', null, h('b', null, r.title, r.unlockDay === s.day ? h('span', { class: 'tag new' }, 'NEW') : null), h('p', null, r.text)),
      ));
    case 'stolen':
      return h('div', null,
        h('p', { class: 'muted small' }, '潮見署 盗品手配書（届出から 5 日間掲載）'),
        h('table', { class: 'stolen' },
          h('tr', null, h('th', null, 'シリアル'), h('th', null, '品名'), h('th', null, '届出')),
          ...s.stolenList.map((e) => h('tr', null,
            h('td', null, ref(`stolen.${e.serial}`, e.serial, 'mono')),
            h('td', null, itemDef(e.defId).name),
            h('td', null, `${e.reportedDay} 日目`),
          )),
        ),
      );
    case 'today': {
      return h('div', null,
        h('h4', null, '本日取引した人物'),
        s.todayVisitors.length
          ? h('ul', { class: 'visitors' }, ...s.todayVisitors.map((k) => {
            const [name, birth] = k.split('|');
            return h('li', null, `${name}（${toWareki(birth)}生）`);
          }))
          : h('p', { class: 'muted' }, 'まだいない。'),
        h('h4', null, '本日の帳簿'),
        h('ul', { class: 'ledger-mini' }, ...s.ledger.map((l) => h('li', null, h('span', null, l.label), h('b', { class: l.amount < 0 ? 'neg' : 'pos' }, yen(l.amount))))),
      );
    }
    case 'catalog':
    default:
      return catalog(s);
  }
}

/** カタログに載せる相場（新品同様の価格 × 相場係数、千円単位） */
function catalogPrice(s: GameState, defId: string): number {
  const d = itemDef(defId);
  return Math.round((d.basePrice * s.market[d.category]) / 1000) * 1000;
}

function catalogEntry(s: GameState, defId: string, current: boolean): HTMLElement {
  const d = itemDef(defId);
  const m = s.market[d.category];
  const price = catalogPrice(s, defId);
  return h('div', { class: `cat-entry ${current ? 'current' : ''}` },
    h('div', { class: 'cat-name' }, categoryIcon(d.category), h('b', null, d.name), h('small', null, CATEGORY_LABEL[d.category])),
    h('div', { class: 'cat-facts' },
      h('span', null, '相場（新品同様）', h('b', null, yen(price)), m >= 1.05 ? h('span', { class: 'up' }, '▲') : m <= 0.95 ? h('span', { class: 'down' }, '▼') : null),
      h('span', null, '刻印 ', current ? ref('catalog.hallmark', d.hallmark, 'mono') : h('span', { class: 'mono' }, d.hallmark)),
      h('span', null, '重量 ', current ? ref('catalog.weight', `${d.weightG} g`, 'mono') : h('span', { class: 'mono' }, `${d.weightG} g`)),
      h('span', null, '素材 ', current ? ref('catalog.material', MATERIAL_LABEL[d.material]) : MATERIAL_LABEL[d.material]),
    ),
    h('p', { class: 'cat-desc' }, d.desc),
  );
}

function catalog(s: GameState): HTMLElement {
  const cur = s.session?.customer.item?.defId;
  const filter = ui.catalogFilter.trim();
  const list = ITEMS.filter((d) => d.id !== cur && (!filter || d.name.includes(filter) || CATEGORY_LABEL[d.category].includes(filter)));
  return h('div', { class: 'catalog' },
    h('p', { class: 'muted small' }, '状態による目安：A 85% / B 70% / C 50% / D 30%。欠陥ごとにさらに減額。'),
    cur ? catalogEntry(s, cur, true) : null,
    h('input', {
      class: 'cat-filter', placeholder: '品名・分類で検索', value: ui.catalogFilter,
      oninput: (e: Event) => { ui.catalogFilter = (e.target as HTMLInputElement).value; const pos = (e.target as HTMLInputElement).selectionStart; notify(); const el = document.querySelector<HTMLInputElement>('.cat-filter'); el?.focus(); el?.setSelectionRange(pos, pos); },
    }),
    ...list.map((d) => catalogEntry(s, d.id, false)),
  );
}

// ---------------------------------------------------------------- 画面

export function counterScreen(s: GameState): HTMLElement {
  const ses = s.session;
  const c = ses?.customer;
  return h('div', { class: `screen counter ${ui.compareMode ? 'compare-on' : ''} ${ui.pendingTool ? 'tool-on' : ''}` },
    hud(s),
    h('div', { class: 'scene' },
      h('div', { class: 'street' }, ...Array.from({ length: Math.min(6, s.queue.length) }, (_, i) => h('i', { class: `waiting w${i % 3}` }))),
      h('div', { class: 'booth' },
        c
          ? ref('face', faceImg(c.person.face, { scale: 3, mood: moodOf(ses!) }), `face ${arriving(c.id) ? 'arrive' : ''}`)
          : h('div', { class: 'empty-portrait' }, s.queue.length ? '' : '本日の客は以上'),
      ),
      ses ? patienceMeter(ses) : null,
      h('div', { class: 'queue' }, `待ち ${s.queue.length} 人`),
    ),
    h('div', { class: 'chat', 'data-scroll': 'chat' },
      ...(ses?.chat ?? [{ who: 'system' as const, text: s.clock >= CONFIG.closeMinute ? '閉店の時間だ。' : '「次の方、どうぞ」で客を呼ぼう。' }]).map((l) =>
        h('div', { class: `line ${l.who}` }, l.text),
      ),
      s.day <= 2 && ses && !ses.closed && ses.customer.item
        ? h('div', { class: 'line hint' }, 'ヒント：道具で調べてから［照合］で 2 項目を選ぶ（品物の刻印とカタログの刻印、有効期限と本日 など）。')
        : null,
    ),
    h('div', { class: 'desk', 'data-scroll': 'desk' },
      c ? [
        ...c.docs.map((d, i) => docCard(s, d, i, c)),
        itemCard(s, ses!),
        catalogCard(s, c),
        ticketCard(c),
        stamp(ses!),
      ] : h('div', { class: 'desk-empty' }, '作業机'),
    ),
    toolsTray(s),
    h('div', { class: 'side' }, actionPanel(s), referencePanel(s)),
  );
}
