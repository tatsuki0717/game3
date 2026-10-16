// 画面設定（解像度・表示倍率・速度・音量など）と、ゲーム画面（ステージ）の拡大縮小。
// ゲーム画面は常にウィンドウ内に収まる固定サイズの「ステージ」に描き、ページ自体はスクロールさせない。

export type Resolution = 'auto' | '1280x720' | '1600x900' | '1920x1080' | '2560x1440';

export interface Settings {
  resolution: Resolution;
  /** 固定解像度のとき、ウィンドウいっぱいまで拡大する */
  fit: boolean;
  /** 文字・UI の大きさ */
  uiScale: number;
  /** 営業中の時計の速さ */
  speed: number;
  /** 効果音の音量 0..1 */
  volume: number;
  /** 走査線・ビネットなどの画面効果 */
  effects: boolean;
}

export const RESOLUTIONS: { id: Resolution; label: string }[] = [
  { id: 'auto', label: '自動（ウィンドウに合わせて拡大）' },
  { id: '1280x720', label: '1280 × 720' },
  { id: '1600x900', label: '1600 × 900' },
  { id: '1920x1080', label: '1920 × 1080' },
  { id: '2560x1440', label: '2560 × 1440' },
];

export const UI_SCALES = [0.85, 1, 1.1, 1.2];
export const SPEEDS = [0.5, 1, 1.5, 2];

/** レイアウトが崩れない最小の論理サイズ */
export const MIN_W = 1180;
export const MIN_H = 660;
/** 自動のときの基準となる論理的な高さ（ウィンドウの大きさに関係なく同じ見た目に拡大縮小する） */
export const AUTO_H = 760;

const KEY = 'nanatsuya-settings';

const DEFAULTS: Settings = { resolution: 'auto', fit: true, uiScale: 1, speed: 1, volume: 0.6, effects: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* 保存できない環境でも既定値で遊べる */
  }
  return { ...DEFAULTS };
}

export const settings: Settings = load();

export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  layoutStage();
}

export interface StageLayout {
  /** 論理サイズ（CSS px） */
  w: number;
  h: number;
  /** 画面への拡大率 */
  scale: number;
  x: number;
  y: number;
}

/** ウィンドウの大きさと設定から、ステージの論理サイズと拡大率を決める */
export function computeLayout(vw: number, vh: number, s: Settings): StageLayout {
  let tw: number;
  let th: number;
  if (s.resolution === 'auto') {
    // 極端な縦長・横長はレターボックスにする（4:3 〜 21:9）
    const aspect = Math.min(21 / 9, Math.max(4 / 3, vw / vh));
    if (vw / vh > aspect) {
      th = vh;
      tw = vh * aspect;
    } else {
      tw = vw;
      th = vw / aspect;
    }
  } else {
    const [w, h] = s.resolution.split('x').map(Number);
    tw = w;
    th = h;
  }
  let w: number;
  let h: number;
  if (s.resolution === 'auto') {
    h = AUTO_H / s.uiScale;
    w = (h * tw) / th;
  } else {
    w = tw / s.uiScale;
    h = th / s.uiScale;
  }
  const grow = Math.max(1, MIN_W / w, MIN_H / h);
  w = Math.round(w * grow);
  h = Math.round(h * grow);
  const fitScale = Math.min(vw / w, vh / h);
  const native = tw / w;
  const scale = s.resolution === 'auto' || s.fit ? fitScale : Math.min(native, fitScale);
  return { w, h, scale, x: Math.round((vw - w * scale) / 2), y: Math.round((vh - h * scale) / 2) };
}

export function layoutStage(): void {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const l = computeLayout(window.innerWidth, window.innerHeight, settings);
  stage.style.width = `${l.w}px`;
  stage.style.height = `${l.h}px`;
  stage.style.transform = `translate(${l.x}px, ${l.y}px) scale(${l.scale})`;
  document.body.classList.toggle('fx-off', !settings.effects);
  const portrait = window.innerHeight > window.innerWidth * 1.1;
  document.body.classList.toggle('portrait', portrait);
}

export function isFullscreen(): boolean {
  return !!document.fullscreenElement;
}

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    /* 全画面にできない環境（iframe など）では何もしない */
  }
}
