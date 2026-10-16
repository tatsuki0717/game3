// Antigravity CLI（agy）で背景画像を生成し、public/img/ に保存して manifest.json を更新する。
//   node tools/agy/generate.mjs            … 未生成の画像だけ作る
//   node tools/agy/generate.mjs --force    … すべて作り直す
//   node tools/agy/generate.mjs title shop … 指定した画像だけ作る
// AGY_CMD で agy の実行ファイルを差し替えられる（例: AGY_CMD=/path/to/agy）。
// 注意：agy -p はファイル書き込みなどのツールを承認なしで実行する。信頼できる作業ディレクトリでのみ使うこと。

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const outDir = join(root, 'public/img');
const manifestPath = join(outDir, 'manifest.json');
const { style, images } = JSON.parse(readFileSync(join(here, 'prompts.json'), 'utf8'));
const agy = process.env.AGY_CMD ?? 'agy';

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

mkdirSync(outDir, { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

let failed = 0;
for (const img of images) {
  if (only.length && !only.includes(img.id)) continue;
  const target = join(outDir, img.file);
  if (existsSync(target) && !force) {
    console.log(`skip  ${img.id}（${img.file} は生成済み。--force で作り直し）`);
    manifest[img.id] = img.file;
    continue;
  }
  const instruction = [
    `Generate an image and save it as a PNG file at exactly this path: ${target}`,
    `Size: ${img.size} pixels (landscape).`,
    `Style: ${style}`,
    `Subject: ${img.prompt}`,
    'Do not modify any other file. Reply only with the saved file path.',
  ].join('\n');
  console.log(`gen   ${img.id} → public/img/${img.file}`);
  const r = spawnSync(agy, ['-p', instruction], { cwd: root, stdio: 'inherit' });
  if (r.error) {
    console.error(`\n${agy} を実行できなかった: ${r.error.message}\nAntigravity CLI をインストールしてログインするか、AGY_CMD でパスを指定してほしい。`);
    process.exit(1);
  }
  if (existsSync(target)) manifest[img.id] = img.file;
  else {
    failed += 1;
    console.error(`  ✖ ${img.file} が作られなかった（agy の出力を確認）`);
  }
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\nmanifest: ${Object.keys(manifest).length} 枚を登録（public/img/manifest.json）。${failed ? `${failed} 枚失敗。` : ''}`);
console.log('登録されていない画像は、ゲーム内蔵の SVG 背景で表示される。');
process.exit(failed ? 1 : 0);
