// 顔 SVG を Phaser のテクスチャにして表示する。

import type * as Phaser from 'phaser';
import type { FaceParts } from '../core/types';
import { faceSvg } from './face';
import { notify } from './store';
import { COLOR } from './theme';

const SCALE = 2; // 拡大表示でも粗くならないよう 2 倍で焼く
const loading = new Set<string>();

function keyOf(f: FaceParts, photo: boolean): string {
  return `face:${photo ? 'p' : 'n'}:${Object.values(f).map((v) => (typeof v === 'boolean' ? Number(v) : v)).join('')}`;
}

/** 顔の画像を返す。テクスチャ未生成なら仮の枠を返し、生成後に描き直す */
export function faceImage(scene: Phaser.Scene, face: FaceParts, size: number, photo = false): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle {
  const key = keyOf(face, photo);
  if (scene.textures.exists(key)) {
    const img = scene.add.image(0, 0, key).setOrigin(0, 0);
    img.setDisplaySize(size, Math.round(size * 1.2));
    return img;
  }
  if (!loading.has(key)) {
    loading.add(key);
    const svg = faceSvg(face, { size: 100 * SCALE, photo });
    scene.textures.once(`addtexture-${key}`, () => {
      loading.delete(key);
      notify();
    });
    scene.textures.addBase64(key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  }
  return scene.add.rectangle(0, 0, size, Math.round(size * 1.2), photo ? 0xcfd8dc : COLOR.black, photo ? 1 : 0).setOrigin(0, 0);
}
