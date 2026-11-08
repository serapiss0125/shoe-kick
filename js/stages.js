// ステージ（到達地点）・距離と速さの表示・速度の節目

const LY = 9.4607e15; // 1光年（m）

// from = このステージに入る距離（m）
export const STAGES = [
  { id: 'park', name: '公園', from: 0, color: '#ffd23f', banner: null },
  { id: 'town', name: '住宅街の上', from: 60, color: '#ffb347', banner: '住宅街を越えた！' },
  { id: 'city', name: '街の上空', from: 400, color: '#ff8a5b', banner: '街の上空へ！' },
  { id: 'clouds', name: '雲の上', from: 2500, color: '#7fd3ff', banner: '雲を突き抜けた！！' },
  { id: 'strato', name: '成層圏', from: 15000, color: '#5aa9ff', banner: '成層圏に突入！！' },
  { id: 'space', name: '宇宙', from: 100000, color: '#7d7bff', banner: '宇宙に到達！！！' },
  { id: 'station', name: '宇宙ステーション', from: 400000, color: '#9fb4ff', banner: '宇宙ステーションを追い越した！' },
  { id: 'moon', name: '月', from: 3.844e8, color: '#e8e4d8', banner: '月に到達！！！' },
  { id: 'mars', name: '火星', from: 7.8e10, color: '#ff6a3d', banner: '火星まで来た！！' },
  { id: 'asteroids', name: '小惑星帯', from: 3e11, color: '#c9a27a', banner: '小惑星帯を突破！' },
  { id: 'jupiter', name: '木星', from: 6.3e11, color: '#f2b57a', banner: '木星に到達！！！' },
  { id: 'saturn', name: '土星', from: 1.27e12, color: '#f5dc9a', banner: '土星の輪をくぐった！！' },
  { id: 'edge', name: '太陽系の果て', from: 1.8e13, color: '#8fe3ff', banner: '太陽系を飛び出した！！！' },
  { id: 'oort', name: 'オールトの雲', from: 1 * LY, color: '#b8f0ff', banner: '1光年突破！！' },
  { id: 'galaxy', name: '銀河の中心', from: 2.6e4 * LY, color: '#ffcf6b', banner: '銀河の中心へ！！！' },
  { id: 'andromeda', name: 'アンドロメダ銀河', from: 2.5e6 * LY, color: '#ff8af0', banner: 'アンドロメダ銀河に到達！！！' },
  { id: 'cosmos', name: '宇宙の果て', from: 1e9 * LY, color: '#ffffff', banner: '宇宙の果てが見えてきた……！' },
];
export const END_DISTANCE = 4.65e10 * LY; // 観測できる宇宙の果て

export function stageIndexAt(d) {
  let i = 0;
  while (i < STAGES.length - 1 && d >= STAGES[i + 1].from) i++;
  return i;
}

// ステージ内の進み具合（0〜1、対数）
export function stageProgress(d) {
  const i = stageIndexAt(d);
  const a = Math.max(1, STAGES[i].from);
  const b = i < STAGES.length - 1 ? STAGES[i + 1].from : END_DISTANCE;
  return Math.max(0, Math.min(1, Math.log(Math.max(d, 1) / a) / Math.log(b / a)));
}

// 速度の節目（m/s）
export const MILESTONES = [
  { v: 83, text: '新幹線より速い！' },
  { v: 343, text: '音速突破！！' },
  { v: 3430, text: 'マッハ10！！' },
  { v: 7900, text: '第一宇宙速度！！' },
  { v: 11200, text: '第二宇宙速度！！' },
  { v: 16700, text: '第三宇宙速度！！！' },
  { v: 3e6, text: '光速の1％！！' },
  { v: 2.998e8, text: '光速突破！！！！' },
  { v: 3e11, text: '光速の1000倍！！' },
  { v: 3e14, text: '光速の100万倍！！！' },
  { v: 3e17, text: '光速の10億倍！！！' },
  { v: 3e20, text: 'もう何もかも置き去り！！！' },
];

// ===== 表示 =====
function trim(x, digits) {
  return x.toFixed(digits);
}

function fixed3(x) {
  // 有効数字3〜4桁くらい
  if (x >= 1000) return Math.round(x).toLocaleString('ja-JP');
  if (x >= 100) return trim(x, 1);
  if (x >= 10) return trim(x, 2);
  return trim(x, 2);
}

// 距離 → { num, unit }
export function formatDistance(m) {
  if (m < 1000) return { num: m.toFixed(1), unit: 'm' };
  const km = m / 1000;
  if (km < 10000) return { num: km < 100 ? km.toFixed(2) : km < 1000 ? km.toFixed(1) : Math.round(km).toLocaleString('ja-JP'), unit: 'km' };
  if (m < 0.1 * LY) {
    if (km < 1e8) return { num: fixed3(km / 1e4), unit: '万km' };
    if (km < 1e12) return { num: fixed3(km / 1e8), unit: '億km' };
    return { num: fixed3(km / 1e12), unit: '兆km' };
  }
  const ly = m / LY;
  if (ly < 10000) return { num: ly < 10 ? ly.toFixed(2) : ly < 100 ? ly.toFixed(1) : Math.round(ly).toLocaleString('ja-JP'), unit: '光年' };
  if (ly < 1e8) return { num: fixed3(ly / 1e4), unit: '万光年' };
  return { num: fixed3(ly / 1e8), unit: '億光年' };
}

export function distanceText(m) {
  const f = formatDistance(m);
  return `${f.num}${f.unit}`;
}

// 速さ → { num, unit }
export function formatSpeed(v) {
  const kmh = v * 3.6;
  if (kmh < 100000) return { num: Math.round(kmh).toLocaleString('ja-JP'), unit: 'km/h' };
  const kms = v / 1000;
  if (v < 3e6) return { num: kms < 100 ? kms.toFixed(1) : Math.round(kms).toLocaleString('ja-JP'), unit: 'km/s' };
  const c = v / 2.998e8;
  if (c < 1) return { num: c.toFixed(3), unit: '光速' };
  if (c < 10000) return { num: c < 10 ? c.toFixed(2) : c < 100 ? c.toFixed(1) : Math.round(c).toLocaleString('ja-JP'), unit: '×光速' };
  if (c < 1e8) return { num: fixed3(c / 1e4), unit: '万×光速' };
  if (c < 1e12) return { num: fixed3(c / 1e8), unit: '億×光速' };
  return { num: fixed3(c / 1e12), unit: '兆×光速' };
}

// 称号（到達ステージで決まる）
export const TITLES = [
  'ブランコ見習い',
  'ご近所の星',
  '街のヒーロー',
  '雲の上の人',
  '成層圏ライダー',
  '宇宙飛行士',
  'スペースキッカー',
  '月面キッカー',
  '火星の開拓者',
  '小惑星ハンター',
  '木星の覇者',
  '土星リングマスター',
  '太陽系の外の人',
  '星間旅行者',
  '銀河の英雄',
  '銀河を越えし者',
  '宇宙の果ての靴',
];
