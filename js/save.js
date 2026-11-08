// 保存（ブラウザ内の localStorage）
import { SKINS } from './skins.js';

const KEY = 'shoeKick.ultra.v1';
const LIMIT = 10;

function defaults() {
  return {
    best: 0,
    bestStage: 0,
    ranking: [],
    unlocked: ['sneaker'],
    selected: 'sneaker',
    stats: { plays: 0, perfectGates: 0, maxCombo: 0, maxLevel: 0 },
    settings: { sound: true },
    seenHowto: false,
    name: '',
  };
}

function load() {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      Object.assign(d, p);
      d.stats = { ...defaults().stats, ...(p.stats || {}) };
      d.settings = { ...defaults().settings, ...(p.settings || {}) };
    }
  } catch {
    // 読めなくても遊べる
  }
  if (!Array.isArray(d.ranking)) d.ranking = [];
  d.unlocked = [...new Set(['sneaker', ...(Array.isArray(d.unlocked) ? d.unlocked : [])])].filter((id) => SKINS.some((s) => s.id === id));
  return d;
}

let data = load();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 保存できなくても続ける
  }
}

export function getData() {
  return data;
}

export function set(key, value) {
  data[key] = value;
  persist();
}

export function setSetting(key, value) {
  data.settings[key] = value;
  persist();
}

// 1回遊んだ結果を記録。新記録か、新しく手に入った靴を返す
export function recordRun(g) {
  data.stats.plays += 1;
  data.stats.perfectGates += g.gateStats.perfect;
  data.stats.maxCombo = Math.max(data.stats.maxCombo, g.maxCombo);
  data.stats.maxLevel = Math.max(data.stats.maxLevel, g.level);
  const prevBest = data.best;
  const newBest = g.d > data.best;
  if (newBest) data.best = g.d;
  data.bestStage = Math.max(data.bestStage, g.stage);
  const got = [];
  for (const s of SKINS) {
    if (!data.unlocked.includes(s.id) && data.bestStage >= s.unlock) {
      data.unlocked.push(s.id);
      got.push(s);
    }
  }
  persist();
  return { newBest, prevBest, unlocked: got };
}

export function predictRank(d) {
  const rank = data.ranking.filter((e) => e.d >= d).length + 1;
  return rank <= LIMIT ? rank : null;
}

export function saveScore(entry) {
  data.ranking = [...data.ranking, entry].sort((a, b) => b.d - a.d).slice(0, LIMIT);
  persist();
  const i = data.ranking.indexOf(entry);
  return i >= 0 ? i + 1 : null;
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
