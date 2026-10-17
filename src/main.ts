import './style.css';
import { CONFIG } from './core/config';
import { formatClock, yen } from './core/dates';
import { counterScreen } from './ui/counter';
import { h } from './ui/dom';
import { nightScreen } from './ui/night';
import { endingScreen, morningScreen, titleScreen } from './ui/screens';
import { play } from './ui/sound';
import { act, getState, hasState, notify, subscribe, ui } from './ui/store';

const root = document.getElementById('app')!;

/** 所持金の増減を HUD に浮かべて見せるため、前回描画時の値を覚えておく */
let lastMoney: { key: string; money: number } | null = null;

function moneyFloater(): void {
  if (!hasState() || ui.screen !== 'game') {
    lastMoney = null;
    return;
  }
  const s = getState();
  const key = `${s.seed}:${s.day}`;
  const prev = lastMoney;
  lastMoney = { key, money: s.money };
  if (!prev || prev.key !== key || prev.money === s.money) return;
  const delta = s.money - prev.money;
  const anchor = document.getElementById('hud-money')?.parentElement;
  anchor?.append(h('span', { class: `floater ${delta > 0 ? 'pos' : 'neg'}` }, `${delta > 0 ? '+' : ''}${yen(delta)}`));
}

// 画面は固定幅のステージに描き、ウィンドウに合わせて拡大縮小する。
// 横長は 1280×720 固定。縦持ちは幅 540 で、高さは端末の縦横比に合わせて伸ばす（机を広く取るため）。
function fitStage(): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const portrait = vh > vw * 1.15;
  const w = portrait ? 540 : 1280;
  const hgt = portrait ? Math.max(960, Math.round((540 * vh) / vw)) : 720;
  root.style.setProperty('--stage-w', `${w}px`);
  root.style.setProperty('--stage-h', `${hgt}px`);
  root.style.setProperty('--scale', String(Math.min(vw / w, vh / hgt)));
  root.dataset.orientation = portrait ? 'portrait' : 'landscape';
}

function render(): void {
  // 中でスクロールする領域（机・資料・帳簿など）の位置を描き直しの前後で保つ
  const scrolls = new Map<string, number>();
  for (const el of root.querySelectorAll<HTMLElement>('[data-scroll]')) scrolls.set(el.dataset.scroll!, el.scrollTop);
  let screen: HTMLElement;
  if (ui.screen === 'title' || !hasState()) screen = titleScreen();
  else {
    const s = getState();
    switch (s.phase) {
      case 'morning':
        screen = morningScreen(s);
        break;
      case 'counter':
        screen = counterScreen(s);
        break;
      case 'night':
        screen = nightScreen(s);
        break;
      default:
        screen = endingScreen(s);
    }
  }
  screen.classList.add('stage');
  if (ui.toast) screen.append(h('div', { class: 'toast' }, ui.toast));
  root.replaceChildren(screen);
  for (const el of root.querySelectorAll<HTMLElement>('[data-scroll]')) {
    el.scrollTop = el.dataset.scroll === 'chat' ? el.scrollHeight : scrolls.get(el.dataset.scroll!) ?? 0;
  }
  moneyFloater();
}

fitStage();
window.addEventListener('resize', () => {
  const before = root.dataset.orientation;
  fitStage();
  if (before !== root.dataset.orientation) render();
});

subscribe(render);
render();

// 営業時間中は実時間で時計が進む（0.8 秒でゲーム内 1 分）
const TICK_MS = 800;
setInterval(() => {
  if (!hasState() || ui.screen !== 'game' || ui.paused || document.hidden) return;
  const s = getState();
  if (s.phase !== 'counter' || s.clock >= CONFIG.closeMinute) return;
  const before = s.clock;
  act({ type: 'TICK', minutes: 1 }, { silent: true });
  const after = getState().clock;
  const el = document.getElementById('hud-clock');
  if (el) {
    el.textContent = formatClock(Math.min(after, CONFIG.closeMinute));
    el.classList.toggle('late', after >= CONFIG.closeMinute - 60);
  }
  // 閉店前の 1 時間は秒針の音で急かす
  if (after >= CONFIG.closeMinute - 60 && after < CONFIG.closeMinute) play('tick');
  if (before < CONFIG.closeMinute && after >= CONFIG.closeMinute) notify();
}, TICK_MS);

// キーボード操作。ボタンに付けた data-key をクリックするだけにして、処理は画面側に一本化する。
//   Enter / Space：次の客・次へ・開店など主ボタン　1〜6：道具（夜はタブ）　C：照合　Esc：選択解除　← →：夜のページ送り
function pressKey(key: string): boolean {
  const btn = document.querySelector<HTMLButtonElement>(`[data-key="${key}"]`);
  if (!btn || btn.disabled) return false;
  btn.click();
  return true;
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (ui.compareMode || ui.pendingTool)) {
    ui.compareMode = false;
    ui.compareFirst = null;
    ui.pendingTool = null;
    notify();
    return;
  }
  const target = e.target as HTMLElement;
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || target.closest('input, textarea, select')) return;
  let handled = false;
  // フォーカス中のボタンやリンクはブラウザ自身が Enter / Space で押すので二重に押さない
  if (e.key === 'Enter' || e.key === ' ') handled = !target.closest('button, a, summary, [tabindex]') && pressKey('next');
  else if (/^[1-6]$/.test(e.key)) handled = pressKey(`tool-${e.key}`) || pressKey(`tab-${e.key}`);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') handled = pressKey(e.key === 'ArrowLeft' ? 'page-prev' : 'page-next');
  else if (e.key === 'c' || e.key === 'C') handled = pressKey('compare');
  if (handled) e.preventDefault();
});
