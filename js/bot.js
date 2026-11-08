// 自動プレイ。sigma = タイミングのばらつき（秒）。小さいほど上手。
import { CFG, releaseTarget } from './logic.js';

function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1000000) / 1000000;
  };
}

function wrap(a) {
  const t = Math.PI * 2;
  return ((((a + Math.PI) % t) + t) % t) - Math.PI;
}

export function createBot(sigma = 0.05, seed = 1) {
  const r = rng(seed);
  const noise = () => (r() + r() + r() - 1.5) * sigma * 1.4;
  return { sigma, r, noise, offset: noise(), lastCross: -1, done: new Set(), sinceCross: 0, kickAt: null, gateOffsets: new Map(), released: false };
}

// このステップで押すか
export function botTap(bot, g) {
  const sw = g.swing;
  switch (g.phase) {
    case 'ready':
      return g.t > 0.6;
    case 'charge': {
      if (sw.crossings !== bot.lastCross) {
        bot.lastCross = sw.crossings;
        bot.sinceCross = 0;
      }
      bot.sinceCross += 1 / 120;
      const th = wrap(sw.theta);
      const w = Math.abs(sw.omega) || 0.001;
      const approaching = th * sw.omega < 0;
      const target = approaching ? sw.crossings + 1 : sw.crossings;
      if (bot.done.has(target) || Math.abs(th) > Math.PI / 2) return false;
      const tb = Math.abs(th) / w;
      // offset > 0：手前で押す、< 0：通り過ぎてから押す
      const fire = approaching ? bot.offset > 0 && tb <= bot.offset : bot.offset > 0 || bot.sinceCross >= -bot.offset;
      if (fire) {
        bot.done.add(target);
        bot.offset = bot.noise();
        return true;
      }
      return false;
    }
    case 'release': {
      if (g.t < 0.4 || sw.omega <= 0) return false;
      const tgt = releaseTarget(g);
      const dt = -wrap(sw.theta - tgt) / sw.omega; // 狙いまでの時間
      if (bot.relOffset === undefined) bot.relOffset = bot.noise();
      if (dt >= 0 && dt <= Math.max(0, bot.relOffset) + 1 / 120) return true;
      if (dt < 0 && dt > -0.3 && -dt >= -Math.min(0, bot.relOffset)) return true;
      return false;
    }
    case 'launch': {
      if (bot.kickAt === null) bot.kickAt = CFG.KICK_APPEAR + CFG.KICK_SHRINK + bot.noise();
      return g.t >= bot.kickAt && g.t - 1 / 120 < bot.kickAt;
    }
    case 'flight': {
      const gate = g.gates.find((x) => !x.judged);
      if (!gate) return false;
      if (!bot.gateOffsets.has(gate.i)) bot.gateOffsets.set(gate.i, bot.noise() * (1 + gate.i * 0.012));
      const at = gate.hit + bot.gateOffsets.get(gate.i);
      return g.t >= at && g.t - 1 / 120 < at;
    }
    default:
      return false;
  }
}
