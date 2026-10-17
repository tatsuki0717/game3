import * as Phaser from 'phaser';
import './style.css';
import { CounterScene } from './scenes/CounterScene';
import { EndingScene } from './scenes/EndingScene';
import { MorningScene } from './scenes/MorningScene';
import { NightScene } from './scenes/NightScene';
import { TitleScene } from './scenes/TitleScene';
import * as store from './ui/store';
import { H, W } from './ui/theme';

/** キャンバスに描く前に日本語フォントを読み込んでおく（遅い回線では 3 秒で諦める） */
async function loadFonts(): Promise<void> {
  const faces = ['400 16px "Noto Sans JP"', '700 16px "Noto Sans JP"', '700 16px "Noto Serif JP"', '900 16px "Noto Serif JP"'];
  const timeout = new Promise((r) => setTimeout(r, 3000));
  await Promise.race([Promise.all(faces.map((f) => document.fonts.load(f, '質屋あア¥0'))), timeout]).catch(() => undefined);
}

function boot(): void {
  document.getElementById('loading')?.remove();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    width: W,
    height: H,
    backgroundColor: '#1f1a15',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { mouse: { preventDefaultWheel: false } },
    scene: [TitleScene, MorningScene, CounterScene, NightScene, EndingScene],
  });
  // 開発時だけ、ブラウザのコンソールや自動テストから触れるようにする
  if (import.meta.env.DEV) Object.assign(window, { game, store });
}

void loadFonts().then(boot);
