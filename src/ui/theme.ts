// 画面共通の色・フォント・解像度。

/** 論理解像度（Scale.FIT で画面に合わせて拡大縮小する） */
export const W = 1280;
export const H = 800;

export const COLOR = {
  bg: 0x1f1a15,
  hud: 0x120e0b,
  wood: 0x3a2c20,
  woodLight: 0x4d3a2a,
  woodDark: 0x1a130e,
  paper: 0xefe4cc,
  paperDark: 0xe2d3b2,
  paperLight: 0xf7f0de,
  ink: 0x2b241c,
  muted: 0x7d6c57,
  brass: 0xc9a24a,
  brassDark: 0x8e6f2a,
  red: 0xb0412f,
  green: 0x4f7a3a,
  blue: 0x3b6a8f,
  tray: 0x2a211a,
  tool: 0x4b3b2c,
  white: 0xffffff,
  black: 0x000000,
};

/** テキスト色（CSS 文字列） */
export const INK = {
  ink: '#2b241c',
  paper: '#efe4cc',
  paperDark: '#e2d3b2',
  muted: '#7d6c57',
  faint: '#a99a84',
  brass: '#c9a24a',
  red: '#b0412f',
  green: '#4f7a3a',
  blue: '#3b6a8f',
  white: '#ffffff',
  clock: '#ffe9a8',
  late: '#ff8b6b',
};

export const FONT = {
  sans: '"Noto Sans JP", system-ui, sans-serif',
  serif: '"Noto Serif JP", "Noto Sans JP", serif',
  mono: 'ui-monospace, "Courier New", monospace',
};

/** テキストを描くキャンバスの解像度。拡大表示でも滲まないよう 2 倍で描く */
export const TEXT_RESOLUTION = 2;
