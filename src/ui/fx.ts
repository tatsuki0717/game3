// 再描画の影響を受けない演出レイヤー（ハンコ、日付の幕間、トースト、画面フラッシュ）。

function layer(): HTMLElement | null {
  return document.getElementById('fx');
}

function spawn(cls: string, html: string, ms: number): void {
  const l = layer();
  if (!l) return;
  const el = document.createElement('div');
  el.className = cls;
  el.innerHTML = html;
  l.append(el);
  window.setTimeout(() => el.remove(), ms);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let toastEl: HTMLElement | null = null;
let toastTimer: number | undefined;

export const fx = {
  toast(msg: string): void {
    const l = layer();
    if (!l) return;
    toastEl?.remove();
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.textContent = msg;
    l.append(toastEl);
    clearTimeout(toastTimer);
    const el = toastEl;
    toastTimer = window.setTimeout(() => el.remove(), 2800);
  },
  /** 取引結果のハンコ */
  stamp(text: string, tone: 'good' | 'bad' | 'mute' | 'police'): void {
    spawn(`stamp stamp-${tone}`, `<span>${esc(text)}</span>`, 1500);
  },
  flash(tone: 'bad' | 'good'): void {
    spawn(`flash flash-${tone}`, '', 450);
  },
  banner(text: string, tone: 'bad' | 'good'): void {
    spawn(`banner banner-${tone}`, esc(text), 1100);
  },
  /** 日付の幕間 */
  splash(title: string, sub: string): void {
    spawn('splash', `<div class="splash-inner"><div class="splash-sub">${esc(sub)}</div><div class="splash-title">${esc(title)}</div></div>`, 2200);
  },
};
