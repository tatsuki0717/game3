import { dispatch, newGame, SAVE_VERSION, type Action } from '../core/game';
import type { GameState } from '../core/types';

const SAVE_KEY = 'nanatsuya-save';

type Listener = () => void;

/** UI 側だけで持つ一時状態（照合モードの選択、入力欄など） */
export interface UiState {
  screen: 'title' | 'game';
  compareMode: boolean;
  compareFirst: string | null;
  pendingTool: string | null;
  refTab: 'rules' | 'catalog' | 'stolen' | 'today';
  offer: string;
  /** カタログの分類絞り込み（'' は全件） */
  catalogFilter: string;
  toast: string | null;
  paused: boolean;
  showHowto: boolean;
  /** 机の上でドラッグした書類・品物の位置（客ごと） */
  deskPos: Record<string, { x: number; y: number }>;
  /** 机の上の重なり順（後ろほど手前） */
  deskOrder: string[];
  /** 夜の画面：店頭価格の下書き・繰り上げ返済額 */
  priceDrafts: Record<string, number>;
  debtDraft: string;
}

export const ui: UiState = {
  screen: 'title',
  compareMode: false,
  compareFirst: null,
  pendingTool: null,
  refTab: 'rules',
  offer: '',
  catalogFilter: '',
  toast: null,
  paused: false,
  showHowto: false,
  deskPos: {},
  deskOrder: [],
  priceDrafts: {},
  debtDraft: '',
};

let state: GameState | null = null;
const listeners: Listener[] = [];
const toastListeners: ((msg: string) => void)[] = [];

/** 状態が変わるたびに増える番号。各シーンはこれを見て描き直す */
export let renderVersion = 0;

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
  renderVersion++;
  for (const fn of listeners) fn();
}

export function onToast(fn: (msg: string) => void): () => void {
  toastListeners.push(fn);
  return () => {
    const i = toastListeners.indexOf(fn);
    if (i >= 0) toastListeners.splice(i, 1);
  };
}

export function toast(msg: string): void {
  ui.toast = msg;
  for (const fn of toastListeners) fn(msg);
}

/** 今表示すべきシーンのキー */
export function currentSceneKey(): 'title' | 'morning' | 'counter' | 'night' | 'ending' {
  if (ui.screen === 'title' || !state) return 'title';
  return state.phase === 'title' ? 'title' : state.phase;
}

/** 状態を更新する。silent のときは再描画しない（時計の進行など） */
export function act(action: Action, opts: { silent?: boolean } = {}): boolean {
  if (!state) return false;
  const prev = state;
  const r = dispatch(state, action);
  state = r.state;
  const failed = r.state === prev && !!r.message;
  if (failed && r.message) toast(r.message);
  else if (r.message && (action.type === 'WHOLESALE' || action.type === 'BUY_UPGRADE' || action.type === 'PAY_DEBT')) toast(r.message);
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
  ui.deskPos = {};
  ui.deskOrder = [];
  ui.priceDrafts = {};
  ui.debtDraft = '';
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
    const s = JSON.parse(raw) as GameState;
    return s.version === SAVE_VERSION ? s : null;
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
  notify();
}
