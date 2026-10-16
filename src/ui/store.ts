import { dispatch, migrate, newGame, type Action } from '../core/game';
import type { GameState } from '../core/types';
import { fx } from './fx';
import { sfx } from './sfx';

const SAVE_KEY = 'nanatsuya-save';

type Listener = () => void;

export type Modal = 'menu' | 'settings' | 'howto' | 'borrow' | null;
export type NightTab = 'ledger' | 'inventory' | 'loans' | 'invest' | 'finance';

/** UI 側だけで持つ一時状態（照合モードの選択、入力欄など） */
export interface UiState {
  screen: 'title' | 'game';
  compareMode: boolean;
  compareFirst: string | null;
  pendingTool: string | null;
  refTab: 'rules' | 'catalog' | 'stolen' | 'today';
  offer: string;
  catalogFilter: string;
  modal: Modal;
  nightTab: NightTab;
  invPage: number;
}

export const ui: UiState = {
  screen: 'title',
  compareMode: false,
  compareFirst: null,
  pendingTool: null,
  refTab: 'rules',
  offer: '',
  catalogFilter: '',
  modal: null,
  nightTab: 'ledger',
  invPage: 0,
};

let state: GameState | null = null;
const listeners: Listener[] = [];

export function getState(): GameState {
  if (!state) throw new Error('game not started');
  return state;
}

export function hasState(): boolean {
  return state !== null;
}

export function subscribe(fn: Listener): void {
  listeners.push(fn);
}

export function notify(): void {
  for (const fn of listeners) fn();
}

export function toast(msg: string): void {
  fx.toast(msg);
}

export function openModal(m: Modal): void {
  ui.modal = m;
  notify();
}

/** 操作に合わせた効果音と演出 */
function feedback(prev: GameState, next: GameState, action: Action): void {
  const ses = next.session;
  switch (action.type) {
    case 'NEXT_CUSTOMER':
      sfx.bell();
      break;
    case 'USE_TOOL':
      sfx.tool();
      if (ses && ses.findings.length > (prev.session?.findings.length ?? 0)) {
        sfx.alert();
        fx.flash('bad');
      }
      break;
    case 'COMPARE': {
      const last = ses?.chat[ses.chat.length - 1]?.text ?? '';
      if (last.startsWith('✖')) {
        sfx.alert();
        fx.flash('bad');
        fx.banner('不一致！', 'bad');
      } else sfx.match();
      break;
    }
    case 'END_NIGHT':
    case 'BEGIN_COUNTER':
      sfx.page();
      break;
    case 'BORROW':
    case 'WHOLESALE':
      sfx.coin();
      break;
  }
  if (ses?.closed && !prev.session?.closed && prev.session?.customer.id === ses.customer.id) {
    const map = { deal: ['成立', 'good'], refused: ['拒否', 'bad'], left: ['退店', 'mute'], reported: ['通報', 'police'], choice: null } as const;
    const st = map[ses.outcome ?? 'choice'];
    if (st) {
      fx.stamp(st[0], st[1]);
      if (ses.outcome === 'reported') sfx.siren();
      else sfx.stamp();
      if (ses.outcome === 'deal') window.setTimeout(sfx.coin, 220);
    }
  }
}

/** 状態を更新する。silent のときは再描画しない（時計の進行など） */
export function act(action: Action, opts: { silent?: boolean } = {}): boolean {
  if (!state) return false;
  const prev = state;
  const r = dispatch(state, action);
  state = r.state;
  const failed = r.state === prev && !!r.message;
  if (failed && r.message) {
    sfx.error();
    toast(r.message);
  } else if (r.message && ['WHOLESALE', 'BUY_UPGRADE', 'PAY_DEBT', 'BORROW'].includes(action.type)) toast(r.message);
  if (!failed && !opts.silent) feedback(prev, state, action);
  if (!opts.silent || failed) {
    save();
    notify();
  }
  return !failed;
}

export function startNew(): void {
  state = newGame(Math.floor(Math.random() * 2 ** 31));
  resetUi();
  ui.screen = 'game';
  save();
  notify();
}

export function resetUi(): void {
  ui.compareMode = false;
  ui.compareFirst = null;
  ui.pendingTool = null;
  ui.offer = '';
  ui.modal = null;
  ui.nightTab = 'ledger';
  ui.invPage = 0;
}

export function save(): void {
  if (!state) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* 保存できない環境でも遊べるようにする */
  }
}

export function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw) as GameState);
  } catch {
    return null;
  }
}

export function continueGame(): void {
  const s = loadSave();
  if (!s) return;
  state = s;
  ui.screen = 'game';
  resetUi();
  notify();
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function toTitle(): void {
  ui.screen = 'title';
  ui.modal = null;
  notify();
}
