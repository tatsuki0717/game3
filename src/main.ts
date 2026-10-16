import './style.css';
import { CONFIG } from './core/config';
import { dateOfDay, formatClock, toWareki } from './core/dates';
import { loadArt } from './ui/art';
import { counterScreen } from './ui/counter';
import { fx } from './ui/fx';
import { nightScreen } from './ui/night';
import { modalLayer } from './ui/overlay';
import { endingScreen, morningScreen, titleScreen } from './ui/screens';
import { layoutStage, settings, toggleFullscreen } from './ui/settings';
import { sfx } from './ui/sfx';
import { act, getState, hasState, notify, subscribe, ui } from './ui/store';

const root = document.getElementById('screen')!;
const modalRoot = document.getElementById('modal')!;

let splashDay = -1;
let lastPhase = '';

function render(): void {
  const keep = [...root.querySelectorAll<HTMLElement>('.scroll, .tab-body, .chat')].map((el) => el.scrollTop);
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
    const phaseKey = `${s.day}:${s.phase}`;
    if (s.phase === 'morning' && splashDay !== s.day) {
      splashDay = s.day;
      fx.splash(`第 ${s.day} 日`, toWareki(dateOfDay(s.day)));
    } else if (s.phase === 'night' && lastPhase !== phaseKey) fx.splash('閉　店', '帳場で一日を締めくくる');
    if (lastPhase !== phaseKey) screen.classList.add('fade-in');
    lastPhase = phaseKey;
  }
  root.replaceChildren(screen);
  root.querySelectorAll<HTMLElement>('.scroll, .tab-body').forEach((el, i) => { el.scrollTop = keep[i] ?? 0; });
  const chat = root.querySelector('.chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
  const modal = modalLayer();
  modalRoot.replaceChildren(...(modal ? [modal] : []));
}

subscribe(render);
loadArt();
layoutStage();
render();

window.addEventListener('resize', layoutStage);
document.addEventListener('fullscreenchange', () => { layoutStage(); render(); });

// 営業時間中は実時間で時計が進む（速さ ×1 で 0.8 秒にゲーム内 1 分）。メニューを開いている間は止まる。
let acc = 0;
const STEP = 100;
setInterval(() => {
  if (!hasState() || ui.screen !== 'game' || document.hidden || ui.modal) return;
  const s = getState();
  if (s.phase !== 'counter' || s.clock >= CONFIG.closeMinute) return;
  acc += STEP * settings.speed;
  if (acc < 800) return;
  acc -= 800;
  const before = s.clock;
  act({ type: 'TICK', minutes: 1 }, { silent: true });
  const after = getState().clock;
  const el = document.getElementById('hud-clock');
  if (el) {
    el.textContent = formatClock(Math.min(after, CONFIG.closeMinute));
    el.classList.toggle('late', after >= CONFIG.closeMinute - 60);
  }
  if (before < CONFIG.closeMinute && after >= CONFIG.closeMinute) {
    fx.banner('閉店時間', 'bad');
    notify();
  }
}, STEP);

// キーボード：Esc で選択解除／メニュー、F で全画面
window.addEventListener('keydown', (e) => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
  if (e.key === 'Escape') {
    if (ui.compareMode || ui.pendingTool) {
      ui.compareMode = false;
      ui.compareFirst = null;
      ui.pendingTool = null;
    } else ui.modal = ui.modal ? null : 'menu';
    notify();
  } else if ((e.key === 'f' || e.key === 'F') && !typing) {
    void toggleFullscreen();
  }
});

// ボタンのクリック音
document.addEventListener('pointerdown', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (b && !b.disabled) sfx.click();
});
