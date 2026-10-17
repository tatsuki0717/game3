import type { FaceParts } from '../core/types';

const SKIN = ['#f3d2b3', '#e8b98f', '#d19c6e', '#a8754d'];
const HAIR = ['#1d1a18', '#3b2a1e', '#6b4a2b', '#8d8d8d', '#d9d9d9'];

/**
 * 窓口での表情。写真と見比べる眉・口などのパーツは変えず、汗・赤面・涙などの記号を重ねるだけにする
 * （表情でパーツが変わると、正直な客まで写真と別人に見えてしまう）。
 */
export type Mood = 'neutral' | 'happy' | 'angry' | 'nervous' | 'sad' | 'shock';

/** 顔パーツから SVG 文字列を作る。写真と本人の比較に使うので、パーツ差が目で分かるようにする。 */
export function faceSvg(f: FaceParts, opts: { size?: number; photo?: boolean; mood?: Mood } = {}): string {
  const mood = opts.photo ? 'neutral' : opts.mood ?? 'neutral';
  const size = opts.size ?? 120;
  const skin = SKIN[f.skin % SKIN.length];
  const hair = HAIR[f.hairColor % HAIR.length];
  const parts: string[] = [];
  const bg = opts.photo ? '#cfd8dc' : 'none';
  parts.push(`<rect x="0" y="0" width="100" height="120" fill="${bg}"/>`);
  // 首と肩
  parts.push(`<rect x="40" y="88" width="20" height="16" fill="${skin}"/>`);
  parts.push(`<path d="M10 120 Q14 98 50 100 Q86 98 90 120 Z" fill="${f.gender === 'm' ? '#3d4a5c' : '#7a4a5a'}"/>`);
  // 後ろ髪（長髪）
  if (f.hair === 2 || f.hair === 4) parts.push(`<path d="M20 45 Q18 95 30 98 L70 98 Q82 95 80 45 Z" fill="${hair}"/>`);
  // 輪郭
  parts.push(`<ellipse cx="50" cy="58" rx="27" ry="33" fill="${skin}"/>`);
  parts.push(`<ellipse cx="23" cy="60" rx="4" ry="7" fill="${skin}"/><ellipse cx="77" cy="60" rx="4" ry="7" fill="${skin}"/>`);
  // 前髪
  const hairPaths = [
    'M23 50 Q22 22 50 22 Q78 22 77 50 Q70 34 50 34 Q30 34 23 50 Z', // 短髪
    'M22 52 Q20 18 50 20 Q80 18 78 52 Q74 30 60 30 L50 38 L42 30 Q26 30 22 52 Z', // 分け目
    'M21 56 Q18 18 50 19 Q82 18 79 56 Q76 32 50 30 Q24 32 21 56 Z', // 長髪
    'M22 46 Q24 14 50 16 Q76 14 78 46 L72 30 L64 40 L56 28 L48 40 L40 28 L32 40 L28 30 Z', // ツンツン
    'M23 54 Q20 20 50 21 Q80 20 77 54 Q72 40 64 36 Q50 44 36 36 Q28 40 23 54 Z', // おかっぱ
  ];
  parts.push(`<path d="${hairPaths[f.hair % hairPaths.length]}" fill="${hair}"/>`);
  if (f.wrinkles) {
    parts.push('<path d="M36 40 Q50 37 64 40" stroke="#00000033" stroke-width="1" fill="none"/>');
    parts.push('<path d="M34 76 Q36 80 39 82 M66 76 Q64 80 61 82" stroke="#00000033" stroke-width="1" fill="none"/>');
  }
  // 眉
  const browY = 48;
  const brows = [
    `M34 ${browY} L45 ${browY}`,
    `M34 ${browY + 1} Q40 ${browY - 3} 45 ${browY}`,
    `M33 ${browY - 1} L46 ${browY + 2}`,
  ];
  const b = brows[f.brows % brows.length];
  parts.push(`<path d="${b}" stroke="${hair === '#d9d9d9' ? '#888' : '#222'}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`);
  parts.push(`<path d="${b}" transform="translate(100 0) scale(-1 1)" stroke="${hair === '#d9d9d9' ? '#888' : '#222'}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`);
  // 目
  const eyeY = 56;
  const eyes = [
    (x: number) => `<circle cx="${x}" cy="${eyeY}" r="2.6" fill="#222"/>`,
    (x: number) => `<ellipse cx="${x}" cy="${eyeY}" rx="4" ry="2.2" fill="#fff" stroke="#222"/><circle cx="${x}" cy="${eyeY}" r="1.7" fill="#222"/>`,
    (x: number) => `<path d="M${x - 4} ${eyeY} Q${x} ${eyeY - 3} ${x + 4} ${eyeY}" stroke="#222" stroke-width="2" fill="none"/>`,
    (x: number) => `<rect x="${x - 4}" y="${eyeY - 1}" width="8" height="2.4" fill="#222"/>`,
  ];
  parts.push(eyes[f.eyes % eyes.length](40), eyes[f.eyes % eyes.length](60));
  // 鼻
  const noses = [
    'M50 58 L47 68 L52 68',
    'M50 58 Q55 66 50 70',
    'M46 68 Q50 71 54 68',
  ];
  parts.push(`<path d="${noses[f.nose % noses.length]}" stroke="#00000066" stroke-width="1.6" fill="none"/>`);
  // 口
  const mouths = [
    '<path d="M42 78 L58 78" stroke="#7a3b3b" stroke-width="2.2"/>',
    '<path d="M42 77 Q50 83 58 77" stroke="#7a3b3b" stroke-width="2.2" fill="none"/>',
    '<path d="M42 80 Q50 75 58 80" stroke="#7a3b3b" stroke-width="2.2" fill="none"/>',
    '<ellipse cx="50" cy="79" rx="4" ry="3" fill="#7a3b3b"/>',
  ];
  // 髭
  if (f.beard === 1) parts.push(`<path d="M40 74 Q50 70 60 74 L58 76 Q50 73 42 76 Z" fill="${hair}"/>`);
  if (f.beard === 2) parts.push(`<path d="M30 70 Q32 92 50 94 Q68 92 70 70 Q64 86 50 86 Q36 86 30 70 Z" fill="${hair}"/>`);
  parts.push(mouths[f.mouth % mouths.length]);
  if (mood === 'angry') {
    parts.push('<ellipse cx="34" cy="68" rx="6" ry="3" fill="#e0505044"/><ellipse cx="66" cy="68" rx="6" ry="3" fill="#e0505044"/>');
    parts.push('<path d="M70 30 l6 0 M73 27 l0 6 M68 27 l3 3 M78 33 l-3 -3" stroke="#c0392b" stroke-width="2" stroke-linecap="round"/>');
  }
  if (mood === 'nervous') parts.push('<path d="M76 40 Q72 48 76 51 Q80 48 76 40 Z" fill="#8fd3ff" stroke="#3b8cc0" stroke-width="0.8"/>');
  if (mood === 'sad') parts.push('<path d="M40 61 Q37 68 40 71 Q43 68 40 61 Z" fill="#8fd3ff" stroke="#3b8cc0" stroke-width="0.6"/>');
  if (mood === 'shock') parts.push('<path d="M22 24 l-6 -6 M30 18 l-3 -8 M78 24 l6 -6 M70 18 l3 -8" stroke="#fff" stroke-width="2" stroke-linecap="round"/><rect x="28" y="40" width="44" height="10" fill="#4a6fa544"/>');
  if (mood === 'happy') parts.push('<ellipse cx="34" cy="68" rx="5" ry="2.6" fill="#ff8a8a55"/><ellipse cx="66" cy="68" rx="5" ry="2.6" fill="#ff8a8a55"/>');
  if (f.glasses) {
    parts.push('<g stroke="#222" stroke-width="1.6" fill="#ffffff22"><circle cx="40" cy="56" r="7"/><circle cx="60" cy="56" r="7"/><path d="M47 56 L53 56"/></g>');
  }
  return `<svg viewBox="0 0 100 120" width="${size}" height="${Math.round(size * 1.2)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="顔">${parts.join('')}</svg>`;
}

// ---------------------------------------------------------------- ドット絵化

/** 顔を描く解像度。表示時に整数倍で拡大し、ドット絵として見せる */
const FACE_W = 48;
const FACE_H = 58;
const faceCache = new Map<string, string>();
const pending = new Set<string>();

function faceKey(f: FaceParts, mood: Mood, photo: boolean): string {
  return `${Object.values(f).join(',')}|${mood}|${photo ? 1 : 0}`;
}

/** SVG を低解像度の canvas に描き、半透明を切り捨ててドットの輪郭をはっきりさせる */
function rasterize(key: string, markup: string): void {
  if (pending.has(key)) return;
  pending.add(key);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = FACE_W;
    canvas.height = FACE_H;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.drawImage(img, 0, 0, FACE_W, FACE_H);
    const data = g.getImageData(0, 0, FACE_W, FACE_H);
    for (let i = 3; i < data.data.length; i += 4) data.data[i] = data.data[i] >= 110 ? 255 : 0;
    g.putImageData(data, 0, 0);
    const url = canvas.toDataURL();
    faceCache.set(key, url);
    pending.delete(key);
    for (const el of document.querySelectorAll<HTMLImageElement>(`img[data-face="${CSS.escape(key)}"]`)) el.src = url;
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

/** ドット絵の顔。scale は整数倍の拡大率 */
export function faceImg(f: FaceParts, opts: { scale: number; photo?: boolean; mood?: Mood }): HTMLImageElement {
  const mood = opts.photo ? 'neutral' : opts.mood ?? 'neutral';
  const key = faceKey(f, mood, !!opts.photo);
  const img = document.createElement('img');
  img.className = 'px-face';
  img.width = FACE_W * opts.scale;
  img.height = FACE_H * opts.scale;
  img.alt = opts.photo ? '証明写真' : '客の顔';
  img.dataset.face = key;
  const cached = faceCache.get(key);
  if (cached) img.src = cached;
  else rasterize(key, faceSvg(f, { size: FACE_W, photo: opts.photo, mood }));
  return img;
}
