import type { Category, ItemDef } from '../types';

// ブランド名はすべて架空。
export const ITEMS: ItemDef[] = [
  {
    id: 'watch_ocean', name: 'クロノスター・オーシャン', category: 'watch', emoji: '⌚',
    basePrice: 570_000, weightG: 155, hallmark: 'CS-OCEAN 316L', serialPrefix: 'CS',
    material: 'steel', fakeRate: 0.35, fakeHallmarks: ['CS-OCEAN 3I6L', 'C5-OCEAN 316L', 'CS-0CEAN 316L'],
    fakeWeight: [0.72, 0.88], desc: '舶来の高級ダイバーズウォッチ。偽物が多い。',
  },
  {
    id: 'watch_grand', name: 'セイカ・グランド', category: 'watch', emoji: '⌚',
    basePrice: 180_000, weightG: 110, hallmark: 'SEIKA GS', serialPrefix: 'SG',
    material: 'steel', fakeRate: 0.15, fakeHallmarks: ['SEIKO GS', 'SEIKA G5'],
    fakeWeight: [0.75, 0.9], desc: '国産高級機械式時計。',
  },
  {
    id: 'pocket_watch', name: 'ウォルサン 金側懐中時計', category: 'watch', emoji: '🕰️',
    basePrice: 135_000, weightG: 85, hallmark: 'K14 WALSAN', serialPrefix: 'WL',
    material: 'gold', fakeRate: 0.2, fakeHallmarks: ['K14 WALSON', 'GF WALSAN'],
    fakeWeight: [0.8, 0.92], desc: '金張りの偽物に注意。',
  },
  {
    id: 'ring_k18', name: '18金の指輪', category: 'jewelry', emoji: '💍',
    basePrice: 90_000, weightG: 6, hallmark: 'K18', material: 'gold', fakeRate: 0.25,
    fakeHallmarks: ['K18GP', 'KI8'], fakeWeight: [0.6, 0.8], desc: '刻印「K18」。GP はメッキ。',
  },
  {
    id: 'necklace_k18', name: '18金の喜平ネックレス', category: 'jewelry', emoji: '📿',
    basePrice: 210_000, weightG: 15, hallmark: 'K18 15.0g', material: 'gold', fakeRate: 0.3,
    fakeHallmarks: ['K18GP 15.0g', 'K18 I5.0g'], fakeWeight: [0.55, 0.8], desc: '重量刻印入り。',
  },
  {
    id: 'ring_diamond', name: 'プラチナ ダイヤモンドリング', category: 'jewelry', emoji: '💎',
    basePrice: 375_000, weightG: 5, hallmark: 'Pt900 D0.50', material: 'platinum', fakeRate: 0.25,
    fakeHallmarks: ['PT900 D0.50', 'Pt900 CZ'], fakeWeight: [0.7, 0.85], desc: '0.5 カラット。',
  },
  {
    id: 'pearl', name: '本真珠ネックレス', category: 'jewelry', emoji: '🦪',
    basePrice: 68_000, weightG: 30, hallmark: 'SV 8.0mm', material: 'other', fakeRate: 0.2,
    fakeHallmarks: ['SV 8.0mn', 'GLASS 8mm'], fakeWeight: [0.6, 0.8], desc: '貝パールの模造品が出回る。',
  },
  {
    id: 'coin_maple', name: 'メイプル金貨 1oz', category: 'coin', emoji: '🪙',
    basePrice: 240_000, weightG: 31.1, hallmark: 'FINE GOLD 1 OZ 9999', material: 'gold', fakeRate: 0.25,
    fakeHallmarks: ['FINE GOLD 1 OZ 999', 'FlNE GOLD 1 OZ 9999'], fakeWeight: [0.85, 0.95], desc: '純金。重量が命。',
  },
  {
    id: 'bag_birkin', name: 'エルメル・バーキナ', category: 'brand', emoji: '👜',
    basePrice: 675_000, weightG: 1100, hallmark: 'HERMEL PARIS', serialPrefix: 'HM',
    material: 'other', fakeRate: 0.4, fakeHallmarks: ['HERMEL PARlS', 'HERMEL PAR1S', 'HERMES PARIS'],
    fakeWeight: [0.7, 0.85], desc: '最高級バッグ。偽物の天国。',
  },
  {
    id: 'wallet_vt', name: 'ルイ・ヴァトン 長財布', category: 'brand', emoji: '👛',
    basePrice: 75_000, weightG: 180, hallmark: 'LOUIS VATON MADE IN FRANCE', serialPrefix: 'LV',
    material: 'other', fakeRate: 0.35, fakeHallmarks: ['LOUIS VATTON MADE IN FRANCE', 'LOUIS VATON MADE IN FRANSE'],
    fakeWeight: [0.75, 0.9], desc: '刻印の綴りを確認。',
  },
  {
    id: 'famicom', name: 'ファミコム本体', category: 'electronics', emoji: '🎮',
    basePrice: 18_000, weightG: 600, hallmark: 'NINTENDA FC-01', serialPrefix: 'FC',
    material: 'other', electric: true, fakeRate: 0.1, fakeHallmarks: ['NINTENDO FC-0I'],
    fakeWeight: [0.7, 0.85], desc: '子供に大人気。',
  },
  {
    id: 'pocket_tv', name: 'ポケットテレビ', category: 'electronics', emoji: '📺',
    basePrice: 45_000, weightG: 420, hallmark: 'SONYA WATCHMAN', serialPrefix: 'PT',
    material: 'other', electric: true, fakeRate: 0.05, fakeHallmarks: ['SONIA WATCHMAN'],
    fakeWeight: [0.7, 0.85], desc: '持ち運べる液晶テレビ。',
  },
  {
    id: 'vcr', name: 'ビデオデッキ', category: 'electronics', emoji: '📼',
    basePrice: 38_000, weightG: 5200, hallmark: 'NATIONALE NV-500', serialPrefix: 'NV',
    material: 'other', electric: true, fakeRate: 0.0, fakeHallmarks: [], fakeWeight: [1, 1],
    desc: 'VHS 方式。',
  },
  {
    id: 'walkman', name: 'ウォークメイト', category: 'electronics', emoji: '🎧',
    basePrice: 27_000, weightG: 280, hallmark: 'SONYA WM-30', serialPrefix: 'WM',
    material: 'other', electric: true, fakeRate: 0.15, fakeHallmarks: ['SONYA WN-30'],
    fakeWeight: [0.7, 0.85], desc: '若者に人気。',
  },
  {
    id: 'wordpro', name: 'ワープロ', category: 'electronics', emoji: '⌨️',
    basePrice: 60_000, weightG: 3800, hallmark: 'TOSHIBO RUPO', serialPrefix: 'RP',
    material: 'other', electric: true, fakeRate: 0.0, fakeHallmarks: [], fakeWeight: [1, 1],
    desc: '事務の必需品。',
  },
  {
    id: 'camera_f3', name: 'ニコラ F3', category: 'camera', emoji: '📷',
    basePrice: 128_000, weightG: 700, hallmark: 'NICOLA F3', serialPrefix: 'NF',
    material: 'other', fakeRate: 0.1, fakeHallmarks: ['NIC0LA F3'], fakeWeight: [0.7, 0.85],
    desc: 'プロ御用達の一眼レフ。',
  },
  {
    id: 'camera_ae1', name: 'キャノム AE-1', category: 'camera', emoji: '📷',
    basePrice: 52_000, weightG: 590, hallmark: 'CANOM AE-1', serialPrefix: 'CA',
    material: 'other', fakeRate: 0.05, fakeHallmarks: ['CANON AE-1'], fakeWeight: [0.7, 0.85],
    desc: '大衆向け一眼レフ。',
  },
  {
    id: 'lens', name: '望遠レンズ 200mm', category: 'camera', emoji: '🔭',
    basePrice: 60_000, weightG: 520, hallmark: 'NICOLA 200mm F4', serialPrefix: 'NL',
    material: 'other', fakeRate: 0.05, fakeHallmarks: ['NICOLA 200nn F4'], fakeWeight: [0.7, 0.85],
    desc: '交換レンズ。',
  },
  {
    id: 'guitar', name: 'フェンダル エレキギター', category: 'instrument', emoji: '🎸',
    basePrice: 180_000, weightG: 3600, hallmark: 'FENDAL U.S.A.', serialPrefix: 'FD',
    material: 'other', fakeRate: 0.25, fakeHallmarks: ['FENDAL JAPAM', 'FENDEL U.S.A.'],
    fakeWeight: [0.8, 0.92], desc: '米国製は高値。',
  },
  {
    id: 'violin', name: 'バイオリン', category: 'instrument', emoji: '🎻',
    basePrice: 300_000, weightG: 420, hallmark: 'Antonio Scarpa 1923', serialPrefix: 'VN',
    material: 'other', fakeRate: 0.3, fakeHallmarks: ['Antonio Scarpa 1823', 'Antonio Skarpa 1923'],
    fakeWeight: [0.85, 0.95], desc: 'ラベルの年号に注意。',
  },
  {
    id: 'kimono', name: '訪問着', category: 'kimono', emoji: '👘',
    basePrice: 120_000, weightG: 900, hallmark: '正絹 加賀友禅', material: 'other', fakeRate: 0.2,
    fakeHallmarks: ['化繊 加賀友禅風', '正絹 加賀友襌'], fakeWeight: [0.7, 0.85], desc: '証紙を確認。',
  },
  {
    id: 'obi', name: '西陣織の帯', category: 'kimono', emoji: '🎀',
    basePrice: 45_000, weightG: 700, hallmark: '西陣織工業組合 証紙', material: 'other', fakeRate: 0.15,
    fakeHallmarks: ['西陣織工業組合 証級'], fakeWeight: [0.75, 0.9], desc: '証紙の番号で真贋を見る。',
  },
  {
    id: 'scroll', name: '掛け軸（山水画）', category: 'antique', emoji: '📜',
    basePrice: 90_000, weightG: 400, hallmark: '落款「雪舟庵」', material: 'other', fakeRate: 0.35,
    fakeHallmarks: ['落款「雪洲庵」', '印刷 雪舟庵'], fakeWeight: [0.8, 0.95], desc: '印刷の複製品が多い。',
  },
  {
    id: 'vase', name: '古伊万里の壺', category: 'antique', emoji: '🏺',
    basePrice: 225_000, weightG: 2400, hallmark: '大明成化年製', material: 'other', fakeRate: 0.35,
    fakeHallmarks: ['大明成化年制', '大名成化年製'], fakeWeight: [0.75, 0.9], desc: '銘の字体を確認。',
  },
  {
    id: 'fountain_pen', name: 'モンブラム 万年筆', category: 'antique', emoji: '🖋️',
    basePrice: 45_000, weightG: 25, hallmark: 'MONTBLAM 4810 14K', serialPrefix: 'MB',
    material: 'other', fakeRate: 0.25, fakeHallmarks: ['MONTBLAM 4801 14K', 'MONTBLAM 4810 I4K'],
    fakeWeight: [0.7, 0.85], desc: 'ペン先の刻印を確認。',
  },
  {
    id: 'katana', name: '日本刀', category: 'blade', emoji: '🗡️',
    basePrice: 450_000, weightG: 1100, hallmark: '銘 備前長船', serialPrefix: 'TK',
    material: 'steel', fakeRate: 0.2, fakeHallmarks: ['銘 備前長舟'], fakeWeight: [0.85, 0.95],
    desc: '登録証が必要な刀剣類。',
  },
  {
    id: 'knife', name: '狩猟用ナイフ', category: 'blade', emoji: '🔪',
    basePrice: 22_000, weightG: 260, hallmark: 'GERBERA U.S.A.', serialPrefix: 'GK',
    material: 'steel', fakeRate: 0.1, fakeHallmarks: ['GERBERA U.5.A.'], fakeWeight: [0.8, 0.9],
    desc: '刃物。',
  },
];

export const ITEM_MAP: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((d) => [d.id, d]));

export function itemDef(id: string): ItemDef {
  const d = ITEM_MAP[id];
  if (!d) throw new Error(`unknown item ${id}`);
  return d;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  watch: '時計',
  jewelry: '宝飾品',
  brand: 'ブランド品',
  electronics: '家電',
  camera: 'カメラ',
  instrument: '楽器',
  kimono: '着物',
  antique: '骨董',
  blade: '刃物',
  coin: '金貨',
};

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];
