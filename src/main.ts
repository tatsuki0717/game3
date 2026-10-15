import './style.css';
import { CONFIG } from './core/config';
import { formatClock } from './core/dates';
import { counterScreen } from './ui/counter';
import { h } from './ui/dom';
import { nightScreen } from './ui/night';
import { endingScreen, morningScreen, titleScreen } from './ui/screens';
import { act, getState, hasState, notify, subscribe, ui } from './ui/store';

const root = document.getElementById('app')!;

function render(): void {
  const scrollY = window.scrollY;
  const refBody = document.querySelector('.tab-body');
  const refScroll = refBody?.scrollTop ?? 0;
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
  root.replaceChildren(screen);
  if (ui.toast) root.append(h('div', { class: 'toast' }, ui.toast));
  const chat = root.querySelector('.chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
  const nb = root.querySelector('.tab-body');
  if (nb) nb.scrollTop = refScroll;
  window.scrollTo(0, scrollY);
}

subscribe(render);
render();

// 営業時間中は実時間で時計が進む（0.8 秒でゲーム内 1 分）
const TICK_MS = 800;
setInterval(() => {
  if (!hasState() || ui.screen !== 'game' || document.hidden) return;
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
  if (before < CONFIG.closeMinute && after >= CONFIG.closeMinute) notify();
}, TICK_MS);

// キーボード操作：Esc で照合・道具の選択を解除
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (ui.compareMode || ui.pendingTool)) {
    ui.compareMode = false;
    ui.compareFirst = null;
    ui.pendingTool = null;
    notify();
  }
});
