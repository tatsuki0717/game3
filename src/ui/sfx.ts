// 効果音。音源ファイルを持たず、WebAudio で合成する。

import { settings } from './settings';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (settings.volume <= 0) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
  const peak = (opts.gain ?? 0.2) * settings.volume;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + (opts.delay ?? 0);
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = opts.freq ?? 1200;
  const g = a.createGain();
  g.gain.value = (opts.gain ?? 0.3) * settings.volume;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  click: () => tone(520, 0.05, { type: 'triangle', gain: 0.08 }),
  hover: () => tone(880, 0.03, { type: 'sine', gain: 0.025 }),
  bell: () => {
    tone(1320, 0.9, { gain: 0.12 });
    tone(1760, 0.7, { gain: 0.06, delay: 0.02 });
  },
  stamp: () => {
    noise(0.18, { gain: 0.6, freq: 500 });
    tone(90, 0.18, { type: 'sine', gain: 0.4, slide: 50 });
  },
  coin: () => {
    tone(1500, 0.08, { type: 'square', gain: 0.05 });
    tone(2000, 0.25, { type: 'square', gain: 0.05, delay: 0.07 });
  },
  match: () => tone(660, 0.12, { type: 'triangle', gain: 0.1 }),
  alert: () => {
    tone(220, 0.16, { type: 'sawtooth', gain: 0.08 });
    tone(196, 0.22, { type: 'sawtooth', gain: 0.08, delay: 0.14 });
  },
  error: () => tone(140, 0.15, { type: 'square', gain: 0.06 }),
  page: () => noise(0.25, { gain: 0.15, freq: 3000 }),
  siren: () => {
    for (let i = 0; i < 3; i++) {
      tone(700, 0.2, { type: 'triangle', gain: 0.07, delay: i * 0.4, slide: 950 });
      tone(950, 0.2, { type: 'triangle', gain: 0.07, delay: i * 0.4 + 0.2, slide: 700 });
    }
  },
  tool: () => noise(0.08, { gain: 0.2, freq: 2500 }),
};
