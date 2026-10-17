// ドット絵のアイコン。12×12 の文字マップから canvas で描き、data URL をキャッシュする。

import type { Category } from '../core/types';

const PALETTE: Record<string, string> = {
  k: '#1b1712', // 輪郭
  w: '#efe4cc', // 紙・文字盤
  g: '#c9a24a', // 真鍮・金
  G: '#8e6f2a', // 濃い金
  s: '#9aa3a8', // 鋼
  S: '#5d666b', // 濃い鋼
  r: '#a8402c', // 朱
  b: '#3b6a8f', // 藍
  n: '#6b4a2b', // 革・木
  c: '#8fc6e0', // ガラス
};

const ICONS: Record<Category, string[]> = {
  watch: [
    '....kkkk....',
    '....kggk....',
    '...kkkkkk...',
    '..kwwwwwwk..',
    '.kwwwkwwwwk.',
    '.kwwwkwwwwk.',
    '.kwwwkkkwwk.',
    '.kwwwwwwwwk.',
    '..kwwwwwwk..',
    '...kkkkkk...',
    '....kggk....',
    '....kkkk....',
  ],
  jewelry: [
    '.....kk.....',
    '....kcck....',
    '.....kk.....',
    '...kkggkk...',
    '..kg....gk..',
    '.kg......gk.',
    '.kg......gk.',
    '.kg......gk.',
    '..kg....gk..',
    '...kggggk...',
    '....kkkk....',
    '............',
  ],
  brand: [
    '....kkkk....',
    '...k....k...',
    '...k....k...',
    '.kkkkkkkkkk.',
    '.knnnnnnnnk.',
    '.knnnggnnnk.',
    '.knnnggnnnk.',
    '.knnnnnnnnk.',
    '.knnnnnnnnk.',
    '.knnnnnnnnk.',
    '.kkkkkkkkkk.',
    '............',
  ],
  electronics: [
    '............',
    '.kkkkkkkkkk.',
    '.kSSSSSSSSk.',
    '.kSccccccSk.',
    '.kSccccccSk.',
    '.kSccccccSk.',
    '.kSSSSSSSSk.',
    '.kSSrSSSbSk.',
    '.kkkkkkkkkk.',
    '...k....k...',
    '..kk....kk..',
    '............',
  ],
  camera: [
    '............',
    '...kkkk.....',
    '.kkkkkkkkkk.',
    '.ksssssssrk.',
    '.ksskkkkssk.',
    '.kskcccckSk.',
    '.kskcwcckSk.',
    '.kskcccckSk.',
    '.ksskkkkssk.',
    '.kSSSSSSSSk.',
    '.kkkkkkkkkk.',
    '............',
  ],
  instrument: [
    '.........kk.',
    '........kGk.',
    '.......kGk..',
    '......kGk...',
    '..kkkkGk....',
    '.knnnnkk....',
    'knnnnnnk....',
    'knnkknnk....',
    'knnkknnk....',
    '.knnnnnk....',
    '..kkkkk.....',
    '............',
  ],
  kimono: [
    '............',
    '..kkk..kkk..',
    '.krrrkkrrrk.',
    'krrrrwwrrrrk',
    'krrkrwwrkrrk',
    '.kkkrggrkkk.',
    '...krggrk...',
    '...krrrrk...',
    '...krrrrk...',
    '...krrrrk...',
    '...kkkkkk...',
    '............',
  ],
  antique: [
    '....kkkk....',
    '....kwwk....',
    '.....kk.....',
    '....kwwk....',
    '...kwbbwk...',
    '..kwbwwbwk..',
    '..kwwbbwwk..',
    '..kwbwwbwk..',
    '...kwbbwk...',
    '....kwwk....',
    '....kkkk....',
    '............',
  ],
  blade: [
    '...........k',
    '..........ks',
    '.........ksk',
    '........ksk.',
    '.......ksk..',
    '......ksk...',
    '.....ksk....',
    '...kkkk.....',
    '..knnk......',
    '.knnk.......',
    '.kkk........',
    '............',
  ],
  coin: [
    '............',
    '....kkkk....',
    '..kkggggkk..',
    '.kggGGGGggk.',
    '.kgGggggGgk.',
    'kggGgGGgGggk',
    'kggGgGGgGggk',
    '.kgGggggGgk.',
    '.kggGGGGggk.',
    '..kkggggkk..',
    '....kkkk....',
    '............',
  ],
};

const cache = new Map<string, string>();

function render(rows: string[]): string {
  const canvas = document.createElement('canvas');
  canvas.width = 12;
  canvas.height = 12;
  const g = canvas.getContext('2d');
  if (!g) return '';
  rows.forEach((row, y) => {
    for (let x = 0; x < 12; x++) {
      const color = PALETTE[row[x]];
      if (!color) continue;
      g.fillStyle = color;
      g.fillRect(x, y, 1, 1);
    }
  });
  return canvas.toDataURL();
}

/** 品目分類のドット絵アイコン（12px を scale 倍で表示） */
export function categoryIcon(cat: Category, scale = 2): HTMLImageElement {
  let src = cache.get(cat);
  if (src === undefined) {
    src = render(ICONS[cat]);
    cache.set(cat, src);
  }
  const img = document.createElement('img');
  img.className = 'px-icon';
  img.src = src;
  img.width = 12 * scale;
  img.height = 12 * scale;
  img.alt = '';
  return img;
}

export const ICON_ROWS = ICONS;
