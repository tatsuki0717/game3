import type { Category, ToolId } from '../types';

/** 日ごとの難易度パラメータ */
export interface Difficulty {
  customers: number;
  fake: number;
  stolen: number;
  expired: number;
  forged: number;
  photoMismatch: number;
  minor: number;
  outsider: number;
  blade: number;
  repeat: number;
  noPhotoId: number;
  impostor: number;
}

export function difficulty(day: number): Difficulty {
  const t = Math.min(1, (day - 1) / 22);
  return {
    customers: Math.round(7 + t * 7),
    fake: day < 2 ? 0.05 : 0.1 + t * 0.1,
    stolen: day < 2 ? 0 : 0.06 + t * 0.05,
    expired: 0.04 + t * 0.02,
    forged: day < 7 ? 0 : 0.03 + t * 0.04,
    photoMismatch: day < 3 ? 0 : 0.03 + t * 0.03,
    minor: day < 5 ? 0 : 0.05,
    outsider: day < 8 ? 0.05 : 0.15,
    blade: day < 10 ? 0.03 : 0.05,
    repeat: day < 15 ? 0 : 0.1,
    noPhotoId: 0.03 + t * 0.01,
    impostor: day < 9 ? 0 : 0.25,
  };
}

export interface NewsDef {
  day: number;
  headline: string;
  market?: Partial<Record<Category, number>>;
}

/** 相場に影響するニュース（倍率を掛ける） */
export const NEWS: NewsDef[] = [
  { day: 1, headline: '潮見造船、第二工場の閉鎖を発表　失業者 300 人超' },
  { day: 2, headline: '市内で空き巣相次ぐ　警察「質屋に盗品手配書を配布」' },
  { day: 3, headline: '年末商戦を前にファミコム品薄　中古価格も上昇', market: { electronics: 1.15 } },
  { day: 5, headline: '国際金価格が急騰　「有事の金」買い進む', market: { jewelry: 1.15, coin: 1.25 } },
  { day: 6, headline: '偽ブランド品の大量流入　税関が警告', market: { brand: 0.85 } },
  { day: 8, headline: '株価続落　「バブル崩壊」の声も' , market: { antique: 0.85, brand: 0.9 } },
  { day: 10, headline: '市議会、刃物の売買規制条例を可決' , market: { blade: 0.6 } },
  { day: 11, headline: '寒波到来　灯油価格が高騰' },
  { day: 12, headline: '質屋営業法の運用見直し　金利の上限を引き下げへ' },
  { day: 13, headline: '海外カメラ愛好家の間で国産一眼レフが人気', market: { camera: 1.2 } },
  { day: 15, headline: '盗品の分散持ち込み横行　同日複数店舗で換金' },
  { day: 16, headline: '金価格、反落　利益確定売り', market: { jewelry: 0.9, coin: 0.85 } },
  { day: 18, headline: '市内で質店強盗未遂事件　防犯対策呼びかけ' },
  { day: 19, headline: 'バンドブーム再燃　エレキギターが品薄', market: { instrument: 1.25 } },
  { day: 20, headline: '高額取引にかかわる本人確認、さらに厳格化' },
  { day: 22, headline: '成人式シーズンを前に着物需要が回復', market: { kimono: 1.3 } },
  { day: 24, headline: '古美術品の大型オークション、海外資本が参入', market: { antique: 1.3 } },
  { day: 26, headline: '年末ボーナス支給額、前年を大幅に下回る', market: { brand: 0.9, watch: 0.95 } },
  { day: 28, headline: '金価格、再び上昇基調へ', market: { jewelry: 1.1, coin: 1.15 } },
  { day: 30, headline: '潮見市、商店街の再開発計画を正式発表' },
];

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  price: number;
  availableDay: number;
  tool?: ToolId;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'magnet', name: '強力磁石', desc: '金・プラチナ製品の偽物（磁性あり）を見抜く。', price: 8_000, availableDay: 2, tool: 'magnet' },
  { id: 'tester', name: '通電テスター', desc: '家電の動作不良を確認できる。', price: 12_000, availableDay: 3, tool: 'tester' },
  { id: 'uv', name: 'UV ライト', desc: '身分証の偽造（透かし欠如）や品物の修理痕が分かる。', price: 15_000, availableDay: 6, tool: 'uv' },
  { id: 'acid', name: '試金石セット', desc: '貴金属の純度を判定する。', price: 20_000, availableDay: 9, tool: 'acid' },
  { id: 'showcase', name: 'ショーケース増設', desc: '店頭の陳列枠 +4。', price: 30_000, availableDay: 2 },
  { id: 'sign', name: '看板の新調', desc: '来客数 +2 / 日。評判 +5。', price: 40_000, availableDay: 4 },
  { id: 'alarm', name: '防犯ベル', desc: '強盗・嫌がらせの被害を防ぐ。', price: 25_000, availableDay: 5 },
  { id: 'heater', name: '石油ストーブ', desc: '暖房費が半額になる。', price: 15_000, availableDay: 9 },
];

export const UPGRADE_MAP: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export const TOOL_INFO: Record<ToolId, { name: string; minutes: number; target: 'item' | 'doc' | 'both'; emoji: string }> = {
  loupe: { name: 'ルーペ', minutes: 4, target: 'item', emoji: '🔍' },
  scale: { name: '天秤', minutes: 2, target: 'item', emoji: '⚖️' },
  magnet: { name: '磁石', minutes: 1, target: 'item', emoji: '🧲' },
  tester: { name: 'テスター', minutes: 3, target: 'item', emoji: '🔌' },
  uv: { name: 'UV ライト', minutes: 2, target: 'both', emoji: '🔦' },
  acid: { name: '試金石', minutes: 3, target: 'item', emoji: '🧪' },
};
