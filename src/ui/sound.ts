// 効果音。音声ファイルを持たず、WebAudio でその場で合成する。

const MUTE_KEY = 'nanatsuya-mute';

export type Sfx =
  | 'bell' // 客が入ってくる（ドアベル）
  | 'tool' // 道具を使う
  | 'scale' // 天秤
  | 'match' // 照合：一致
  | 'mismatch' // 照合：不一致を発見
  | 'stamp' // 判子（取引成立・質札発行）
  | 'coin' // 現金を受け取る
  | 'refuse' // 断る・客が帰る
  | 'report' // 通報
  | 'error' // 操作できない
  | 'tick' // 閉店前の秒針
  | 'paper' // 新聞をめくる
  | 'night' // 閉店
  | 'cursor'; // メニューのカーソル移動・タブ切り替え

let ctx: AudioContext | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): void {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* 保存できなくても切り替えは効く */
  }
}

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 減衰する単音 */
function tone(ac: AudioContext, freq: number, start: number, dur: number, opts: { type?: OscillatorType; gain?: number; slide?: number } = {}): void {
  const t = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.2, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** 長さごとに一度だけ作る減衰ノイズ（秒針のように頻繁に鳴る音で毎回作らないように） */
const noiseBuffers = new Map<number, AudioBuffer>();

function noiseBuffer(ac: AudioContext, dur: number): AudioBuffer {
  let buf = noiseBuffers.get(dur);
  if (!buf) {
    const len = Math.ceil(ac.sampleRate * dur);
    buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    noiseBuffers.set(dur, buf);
  }
  return buf;
}

/** 短いノイズ（紙・打撃） */
function noise(ac: AudioContext, start: number, dur: number, opts: { gain?: number; freq?: number; q?: number } = {}): void {
  const t = ac.currentTime + start;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, dur);
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = opts.freq ?? 1200;
  filter.Q.value = opts.q ?? 0.8;
  const g = ac.createGain();
  g.gain.value = opts.gain ?? 0.3;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(t);
}

export function play(name: Sfx): void {
  const ac = audio();
  if (!ac) return;
  switch (name) {
    case 'bell':
      tone(ac, 1320, 0, 0.9, { type: 'triangle', gain: 0.12 });
      tone(ac, 1760, 0.12, 0.9, { type: 'triangle', gain: 0.09 });
      break;
    case 'tool':
      noise(ac, 0, 0.05, { freq: 3000, gain: 0.15 });
      break;
    case 'scale':
      tone(ac, 2400, 0, 0.25, { type: 'sine', gain: 0.07 });
      tone(ac, 3100, 0.06, 0.3, { type: 'sine', gain: 0.05 });
      break;
    case 'match':
      tone(ac, 880, 0, 0.12, { type: 'sine', gain: 0.1 });
      tone(ac, 1175, 0.08, 0.18, { type: 'sine', gain: 0.1 });
      break;
    case 'mismatch':
      tone(ac, 660, 0, 0.12, { type: 'square', gain: 0.06 });
      tone(ac, 494, 0.11, 0.25, { type: 'square', gain: 0.06 });
      break;
    case 'stamp':
      tone(ac, 140, 0, 0.18, { type: 'sine', gain: 0.4, slide: 60 });
      noise(ac, 0, 0.08, { freq: 500, gain: 0.35 });
      break;
    case 'coin':
      tone(ac, 1568, 0, 0.12, { type: 'square', gain: 0.05 });
      tone(ac, 2093, 0.07, 0.35, { type: 'square', gain: 0.05 });
      break;
    case 'refuse':
      tone(ac, 330, 0, 0.3, { type: 'triangle', gain: 0.12, slide: 220 });
      break;
    case 'report':
      for (let i = 0; i < 3; i++) {
        tone(ac, 960, i * 0.3, 0.15, { type: 'sawtooth', gain: 0.04 });
        tone(ac, 760, i * 0.3 + 0.15, 0.15, { type: 'sawtooth', gain: 0.04 });
      }
      break;
    case 'error':
      tone(ac, 180, 0, 0.15, { type: 'square', gain: 0.05 });
      break;
    case 'tick':
      noise(ac, 0, 0.02, { freq: 4000, gain: 0.08, q: 4 });
      break;
    case 'paper':
      noise(ac, 0, 0.25, { freq: 2200, gain: 0.12, q: 0.5 });
      break;
    case 'night':
      tone(ac, 523, 0, 0.6, { type: 'sine', gain: 0.08 });
      tone(ac, 392, 0.25, 0.8, { type: 'sine', gain: 0.08 });
      tone(ac, 262, 0.5, 1.2, { type: 'sine', gain: 0.08 });
      break;
    case 'cursor':
      tone(ac, 1046, 0, 0.05, { type: 'square', gain: 0.035 });
      break;
  }
}
