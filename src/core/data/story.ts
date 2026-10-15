// ストーリー（名前付きキャラクターの来店と、朝の手紙）。

import type { Condition, Effects, FaceParts, Intent, Personality } from '../types';

export type { Effects };

export interface StoryChoice {
  label: string;
  reply: string;
  effects: Effects;
}

export interface StoryCharacter {
  name: string;
  birth: string;
  address: string;
  face: FaceParts;
  title?: string;
}

export interface StoryVisit {
  id: string;
  day: number;
  who: keyof typeof CHARACTERS;
  when?: (flags: Record<string, boolean>) => boolean;
  /** 行列の何番目に入るか（0 = 先頭） */
  position: number;
  intent: Intent;
  personality: Personality;
  greeting: string;
  /** special の会話（複数行） */
  lines?: string[];
  choices?: StoryChoice[];
  item?: { defId: string; condition: Condition; stolen?: boolean; listStolen?: boolean };
  /** 客の希望額（推定価値に対する比率） */
  askRatio?: number;
  minRatio?: number;
  loanTermDays?: number;
  loanRedeemFlag?: string;
  /** 取引成立時に立てるフラグ */
  dealFlag?: string;
  sting?: boolean;
  expiredLicense?: boolean;
}

export interface MorningLetter {
  day: number;
  when?: (flags: Record<string, boolean>, upgrades: string[]) => boolean;
  text: string;
  effects?: Effects;
}

const face = (p: Partial<FaceParts> & Pick<FaceParts, 'gender'>): FaceParts => ({
  skin: 1, hair: 0, hairColor: 0, eyes: 0, brows: 0, nose: 0, mouth: 0, glasses: false, beard: 0, wrinkles: false, ...p,
});

export const CHARACTERS = {
  sanae: {
    name: '森田 早苗', birth: '1959-06-12', address: '潮見市漁師町3-12',
    face: face({ gender: 'f', hair: 2, hairColor: 0, eyes: 1, mouth: 2, skin: 0 }),
  },
  kuroda: {
    name: '黒田 剛', birth: '1948-02-03', address: '潮見市本町1-1', title: '潮見署 刑事',
    face: face({ gender: 'm', hair: 1, hairColor: 1, eyes: 3, brows: 2, mouth: 1, beard: 1, skin: 2 }),
  },
  taka: {
    name: '鷹野 誠', birth: '1966-09-21', address: '潮見市港町4-7',
    face: face({ gender: 'm', hair: 3, hairColor: 2, eyes: 2, brows: 1, mouth: 3, skin: 1, glasses: true }),
  },
  kanemori: {
    name: '金森 正雄', birth: '1945-12-01', address: '東京都港区赤坂2-5', title: '金森不動産 社長',
    face: face({ gender: 'm', hair: 4, hairColor: 3, eyes: 1, brows: 0, mouth: 0, skin: 3, glasses: true, wrinkles: true }),
  },
  genzo: {
    name: '大西 源蔵', birth: '1916-04-29', address: '潮見市本町5-3',
    face: face({ gender: 'm', hair: 0, hairColor: 4, eyes: 0, brows: 2, mouth: 1, skin: 2, beard: 2, wrinkles: true }),
  },
} satisfies Record<string, StoryCharacter>;

export const STORY_VISITS: StoryVisit[] = [
  // --- 刑事・黒田 ---
  {
    id: 'kuroda_intro', day: 2, who: 'kuroda', position: 0, intent: 'special', personality: 'regular',
    greeting: '潮見署の黒田だ。あんたが新しい店主か。',
    lines: [
      '最近、空き巣が多くてな。盗まれた品が質屋に流れてる。',
      '毎朝、盗品手配書を届ける。シリアル番号を必ず照合しろ。',
      '盗品と気づいたら「通報」してくれ。礼は出す。…見逃したら、わかってるな？',
    ],
    choices: [{ label: '協力します', reply: 'よろしく頼む。', effects: { setFlags: ['kuroda_met'] } }],
  },
  {
    id: 'kuroda_ally', day: 10, who: 'kuroda', position: 2, intent: 'special', personality: 'regular',
    greeting: '少し時間をもらえるか。',
    lines: [
      '窃盗団の「タカ」って男が、この辺の質屋に盗品をさばいてる。',
      'あんたの店に来たら、俺に知らせてほしい。協力してくれるなら、多少のことには目をつぶる。',
    ],
    choices: [
      { label: '協力する', reply: '話がわかるな。頼んだぞ。', effects: { setFlags: ['kuroda_ally'], conscience: 1 } },
      { label: '店の客は売れない', reply: '…そうか。なら、こっちも手加減はしないぞ。', effects: { setFlags: ['kuroda_cold'] } },
    ],
  },
  {
    id: 'kuroda_sting', day: 20, who: 'kuroda', position: 4, intent: 'pawn', personality: 'timid',
    greeting: '（見覚えのない男が）あの、これでお金を借りたいんですが。',
    item: { defId: 'watch_grand', condition: 'A' }, sting: true, expiredLicense: true,
  },
  {
    id: 'kuroda_taka', day: 23, who: 'kuroda', position: 0, intent: 'special', personality: 'regular',
    when: (f) => !!f.taka_deal && !!f.kuroda_ally,
    greeting: '…単刀直入に聞く。',
    lines: ['タカがあんたの店に出入りしてるって情報がある。', '明日、ガサ入れだ。今ここで全部話せば、あんたは協力者として扱う。'],
    choices: [
      { label: 'タカのことを話す', reply: '賢明だ。報奨金も出るよう掛け合っておく。', effects: { setFlags: ['betray_taka'], money: 100_000, conscience: 2 } },
      { label: '何も知らない', reply: '…そうか。後悔するなよ。', effects: {} },
    ],
  },

  // --- 窃盗団・タカ ---
  {
    id: 'taka_first', day: 5, who: 'taka', position: 3, intent: 'sell', personality: 'aggressive',
    greeting: 'カメラ、買い取ってくれよ。拾った…じゃなくて、もらいもんだ。',
    item: { defId: 'camera_f3', condition: 'A', stolen: true, listStolen: true }, askRatio: 0.45, minRatio: 0.25,
    dealFlag: 'taka_bought',
  },
  {
    id: 'taka_offer', day: 11, who: 'taka', position: 5, intent: 'special', personality: 'aggressive',
    greeting: 'よう、店主。話がある。',
    lines: [
      'いい品を相場の三割で回してやる。手配書には載らないブツだ。',
      'あんたは店を守れる、俺はさばける。悪い話じゃないだろ？',
    ],
    choices: [
      { label: '話に乗る', reply: 'へへ、話がわかるねえ。じゃあ、また来るぜ。', effects: { setFlags: ['taka_deal'], conscience: -5 } },
      { label: '帰ってくれ', reply: '…後悔するなよ。', effects: { setFlags: ['taka_refused'], conscience: 1 } },
    ],
  },
  ...[14, 17, 21].map((day, i): StoryVisit => ({
    id: `taka_goods_${day}`, day, who: 'taka', position: 1, intent: 'sell', personality: 'aggressive',
    when: (f) => !!f.taka_deal,
    greeting: '約束のブツだ。三割でいい。',
    item: { defId: ['watch_ocean', 'ring_diamond', 'bag_birkin'][i], condition: 'A', stolen: true },
    askRatio: 0.3, minRatio: 0.25,
  })),

  // --- 地上げ屋・金森 ---
  {
    id: 'kanemori_first', day: 9, who: 'kanemori', position: 1, intent: 'special', personality: 'regular',
    greeting: 'どうも、金森不動産の者です。',
    lines: ['この商店街、再開発の計画がありましてね。', 'こんな古い店、いつまで続けられます？ いい値で買い取りますよ。'],
    choices: [
      { label: 'お断りします', reply: 'まあ、気が変わったらいつでも。', effects: {} },
      { label: '考えておきます', reply: 'ええ、ええ。賢いご判断を。', effects: { setFlags: ['kanemori_maybe'] } },
    ],
  },
  {
    id: 'kanemori_final', day: 23, who: 'kanemori', position: 3, intent: 'special', personality: 'regular',
    greeting: '最後のご提案に参りました。',
    lines: ['あなたの借金、うちが全額肩代わりしましょう。', 'その代わり、この店と土地を譲っていただく。これで楽になれますよ。'],
    choices: [
      { label: '店を譲る', reply: '賢明なご判断です。では、書類はこちらで。', effects: { ending: 'sold' } },
      { label: '祖父の店は渡さない', reply: '…後悔しますよ。', effects: { setFlags: ['kanemori_refused'] } },
    ],
  },

  // --- 母子家庭・早苗 ---
  {
    id: 'sanae_ring', day: 3, who: 'sanae', position: 2, intent: 'pawn', personality: 'desperate',
    greeting: '子供の給食費が払えなくて…結婚指輪なんですけど、必ず取りに来ます。',
    item: { defId: 'ring_k18', condition: 'A' }, askRatio: 0.6, minRatio: 0.3,
    loanTermDays: 23, loanRedeemFlag: 'sanae_saved', dealFlag: 'sanae_loan',
  },
  {
    id: 'sanae_kimono', day: 8, who: 'sanae', position: 4, intent: 'pawn', personality: 'desperate',
    greeting: '母の形見の着物です…これもお願いできますか。',
    item: { defId: 'kimono', condition: 'B' }, askRatio: 0.6, minRatio: 0.3,
    loanTermDays: 18, loanRedeemFlag: 'sanae_saved', dealFlag: 'sanae_loan',
  },
  {
    id: 'sanae_pearl', day: 13, who: 'sanae', position: 3, intent: 'sell', personality: 'desperate',
    greeting: 'これは…もう売ってしまいます。娘の誕生日に何か買ってあげたくて。',
    item: { defId: 'pearl', condition: 'A' }, askRatio: 0.55, minRatio: 0.25,
  },
  {
    id: 'sanae_plea', day: 19, who: 'sanae', position: 2, intent: 'special', personality: 'desperate',
    when: (f) => !!f.sanae_loan,
    greeting: '店主さん…お願いがあって来ました。',
    lines: ['工場をクビになってしまって…でも来月から新しい仕事が決まりそうなんです。', '預けた品、期限が来ても流さずに待っていただけませんか…？'],
    choices: [
      { label: '待ちましょう', reply: '本当に…本当にありがとうございます！', effects: { setFlags: ['sanae_saved'], conscience: 3, reputation: 3 } },
      { label: '規則は規則です', reply: '…そう、ですよね。無理を言ってすみませんでした。', effects: { conscience: -2 } },
    ],
  },

  // --- 祖父の旧友・源蔵 ---
  {
    id: 'genzo_intro', day: 6, who: 'genzo', position: 0, intent: 'special', personality: 'regular',
    greeting: 'おお、若いの。じいさんによう似とる。',
    lines: [
      'あんたのじいさんとは五十年来の付き合いでな。この町の者はみんな、困ったらこの店に来たもんだ。',
      'じいさんの口癖はな、「品物を見る前に、人を見ろ」じゃった。',
      'そうそう、じいさんは奥の金庫の鍵をわしに預けとった。いずれ渡そう。',
    ],
    choices: [{ label: 'ありがとうございます', reply: 'また来るよ。', effects: { setFlags: ['genzo_met'] } }],
  },
  {
    id: 'genzo_watch', day: 16, who: 'genzo', position: 2, intent: 'pawn', personality: 'regular',
    greeting: 'わしも年金が出るまで、ちと苦しくてな。この時計、預かってくれるか。',
    item: { defId: 'pocket_watch', condition: 'A' }, askRatio: 0.6, minRatio: 0.35,
  },
  {
    id: 'genzo_key', day: 27, who: 'genzo', position: 1, intent: 'special', personality: 'regular',
    when: (f) => !!f.genzo_met,
    greeting: '約束の鍵を持ってきたぞ。',
    lines: [
      '金庫の中には、じいさんが若い頃から貯めた金貨が入っとる。',
      'じいさんはこう言っとった。「店が本当に困ったら使え。もし余裕があるなら、町のために使え」とな。',
    ],
    choices: [
      { label: '店の借金返済に使う', reply: 'そうか。じいさんも喜ぶじゃろう。', effects: { addItems: [{ defId: 'coin_maple', condition: 'S' }, { defId: 'coin_maple', condition: 'S' }] } },
      { label: '町の子供たちに寄付する', reply: '…あんたは本物の七つ屋の主人じゃ。', effects: { reputation: 15, conscience: 5, setFlags: ['donated'] } },
    ],
  },
];

export const LETTERS: MorningLetter[] = [
  {
    day: 1,
    text: '祖父の遺した質屋「七つ屋」を継いで初日。債権者からの通知：借金 ¥1,000,000。7・14・21・28 日目の夜に定期返済（¥50,000 / ¥100,000 / ¥150,000 / ¥200,000）があり、残りは 30 日目の夜までに完済すること。払えなければ店は差し押さえられる。',
  },
  { day: 6, text: '【債権者より】明日の夜は第 1 回の返済日です。¥50,000 をご用意ください。' },
  { day: 11, text: '寒波が来た。今日から暖房費がかかる。祖母の咳が心配だ。' },
  {
    day: 15, when: (f, u) => !!f.taka_refused && !u.includes('alarm'),
    text: '朝、店のショーウィンドウが割られていた。修理代 ¥20,000。タカの仕業だろうか…', effects: { money: -20_000 },
  },
  {
    day: 15, when: (f, u) => !!f.taka_refused && u.includes('alarm'),
    text: '夜中に防犯ベルが鳴り、誰かが逃げていった。被害はなかった。',
  },
  {
    day: 24, when: (f) => !!f.taka_deal && !f.betray_taka,
    text: '早朝、警察がなだれ込んできた。タカから買った盗品が次々と押収されていく…',
    effects: { ending: 'arrested' },
  },
  {
    day: 24, when: (f) => !!f.betray_taka,
    text: '新聞の片隅に「窃盗団リーダー逮捕」の記事。黒田刑事の協力者として、店はお咎めなしとなった。',
  },
  {
    day: 27, when: (f) => !!f.sanae_loan && !f.sanae_saved,
    text: '森田さん一家が町を出たと噂で聞いた。指輪は、もう取りに来ないだろう。', effects: { conscience: -2 },
  },
];
