import { dispatch, newGame, SAVE_VERSION, type Action } from '../core/game';
import type { GameState } from '../core/types';
import { feedback } from './feedback';

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
  catalogFilter: string;
  toast: string | null;
  paused: boolean;
  /** 判子のアニメーションを再生済みの客 ID */
  stampFor: string | null;
  /** 登場アニメーションを再生済みの客 ID */
  faceFor: string | null;
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
  stampFor: null,
  faceFor: null,
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

let toastTimer: number | undefined;
export function toast(msg: string): void {
  ui.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    ui.toast = null;
    const el = document.querySelector('.toast');
    el?.remove();
  }, 2600);
}

/** 状態を更新する。silent のときは再描画しない（時計の進行など） */
export function act(action: Action, opts: { silent?: boolean } = {}): boolean {
  if (!state) return false;
  const prev = state;
  const r = dispatch(state, action);
  state = r.state;
  const failed = r.state === prev && !!r.message;
  if (!opts.silent) feedback(action, prev, r.state, failed);
  if (failed && r.message) toast(r.message);
  else if (r.message && ['WHOLESALE', 'BUY_UPGRADE', 'PAY_DEBT', 'BUY_LOT', 'HIRE_CLERK', 'FIRE_CLERK', 'BORROW', 'REPAY_BANK'].includes(action.type)) toast(r.message);
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
