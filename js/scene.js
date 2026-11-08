// 画面の描画（背景・巨大ブランコ・子ども・靴・ゲート）
import {
  INK,
  makeCanvas,
  seeded,
  mix,
  rgba,
  glow,
  drawGlow,
  makeStarTile,
  makeCloud,
  makeSkyline,
  makeEarth,
  makeMoon,
  makeMars,
  makeJupiter,
  makeSaturn,
  makeStation,
  makeAsteroid,
  makeGalaxy,
  makeNebula,
  makeBlackHole,
  shoeSprite,
  drawKid,
} from './art.js';
import { STAGES, stageIndexAt, stageProgress } from './stages.js';
import { CFG, releaseTarget, gateWindowScale } from './logic.js';

const TAU = Math.PI * 2;

// ステージごとの空の色（上・下）
const SKY = {
  park: ['#2f9bff', '#bfe9ff'],
  town: ['#2b8ff5', '#cdeeff'],
  city: ['#2479e6', '#ffe2b8'],
  clouds: ['#1660d0', '#a9dcff'],
  strato: ['#071c5c', '#2f6fd0'],
  space: ['#03061c', '#0e2258'],
  station: ['#02041a', '#0b1a48'],
  moon: ['#02030f', '#10173a'],
  mars: ['#100307', '#3a1220'],
  asteroids: ['#0a0705', '#2a1e14'],
  jupiter: ['#120903', '#3c2410'],
  saturn: ['#0d0a03', '#302a12'],
  edge: ['#01050b', '#08202e'],
  oort: ['#000308', '#062438'],
  galaxy: ['#0c0308', '#3e1630'],
  andromeda: ['#090210', '#2c0a40'],
  cosmos: ['#000000', '#141428'],
};

const LEVEL_COLORS = ['#ffffff', '#9fe6ff', '#7dffb0', '#ffe14d', '#ff9a2e', '#ff4d6d', '#d16bff'];

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function ease(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}
function wrap(a) {
  return ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

export function createScene(fx) {
  // ===== 素材 =====
  const A = {
    stars: [makeStarTile(1, 220, 1.0), makeStarTile(2, 120, 1.6), makeStarTile(3, 45, 2.4)],
    clouds: [1, 2, 3, 4, 5, 6].map((s) => makeCloud(s * 31)),
    cityFar: makeSkyline('city-far', 3),
    city: makeSkyline('city', 4),
    houses: makeSkyline('houses', 5, 2048, 220),
    trees: makeSkyline('trees', 6, 2048, 200),
    mountains: makeSkyline('mountains', 7, 2048, 420),
    earth: null,
    lazy: {},
  };
  // 重い絵は必要になったときに作る
  function lazy(key, fn) {
    if (!A.lazy[key]) A.lazy[key] = fn();
    return A.lazy[key];
  }

  let W = 1;
  let H = 1;
  const L = { P: { x: 0, y: 0 }, R: 1, groundY: 1, u: 1, anchor: { x: 0, y: 0 }, shoeLen: 100 };

  const S = {
    t: 0,
    scroll: 0,
    vs: 0,
    alt: 0,
    seatTrail: [],
    kid: { x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, on: true },
    kidStart: null,
    shoe: { x: 0, y: 0, rot: 0, scale: 0 },
    kicked: false,
    kickT: 0,
    pieces: [],
    clouds: [],
    rocks: [],
    streaks: [],
    spawned: new Set(),
    lastStage: 0,
    sunburst: 0,
    lightningT: 0,
    whiteout: 0,
    gateFx: [],
    level: 0,
  };

  for (let i = 0; i < 90; i++) S.streaks.push({ x: Math.random(), y: Math.random(), l: Math.random(), s: 0.5 + Math.random() });

  function resize(w, h) {
    W = w;
    H = h;
    const portrait = W / H < 0.9;
    if (portrait) {
      L.P = { x: W * 0.5, y: H * 0.38 };
      L.R = Math.min(W * 0.36, H * 0.21);
    } else {
      L.P = { x: W * 0.5, y: H * 0.38 };
      L.R = H * 0.22;
    }
    L.groundY = L.P.y + L.R + Math.max(46, L.R * 0.5);
    L.u = L.R * 0.085;
    L.anchor = { x: portrait ? W * 0.4 : W * 0.36, y: H * 0.52 };
    L.shoeLen = Math.min(W, H) * (portrait ? 0.24 : 0.17);
  }

  function reset() {
    S.scroll = 0;
    S.vs = 0;
    S.alt = 0;
    S.seatTrail.length = 0;
    S.kicked = false;
    S.kickT = 0;
    S.kidStart = null;
    S.pieces.length = 0;
    S.clouds.length = 0;
    S.rocks.length = 0;
    S.spawned.clear();
    S.lastStage = 0;
    S.whiteout = 0;
    S.gateFx.length = 0;
    S.sunburst = 0;
    S.shoe.scale = 0;
    // 最初の空の雲
    for (let i = 0; i < 6; i++) {
      S.clouds.push({ x: Math.random() * W * 1.4, y: H * (0.06 + Math.random() * 0.26), s: 0.5 + Math.random() * 0.6, p: 0.12 + Math.random() * 0.2, img: A.clouds[i % 6] });
    }
  }

  function seatPos(theta) {
    return { x: L.P.x + Math.sin(theta) * L.R, y: L.P.y + Math.cos(theta) * L.R };
  }

  // 距離 → 地面がどれだけ下へ沈むか（px）
  function altFor(d) {
    return 230 * Math.log10(1 + d / 20) * (H / 800);
  }

  // ===== 更新 =====
  function update(dt, g, skin) {
    S.t += dt;
    const flying = g.phase === 'launch' || g.phase === 'flight' || g.phase === 'stall' || g.phase === 'finale' || (g.phase === 'done' && g.v > 0);
    // 見た目の速さ（px/秒）
    const targetVs = flying ? (420 + 300 * Math.log10(Math.max(10, g.v))) * (W / 600 + 0.4) : 0;
    S.vs += (targetVs - S.vs) * (1 - Math.exp(-(flying ? 3 : 6) * dt));
    if (g.phase === 'stall' || g.phase === 'done') S.vs *= Math.exp(-1.5 * dt);
    S.scroll += S.vs * dt;
    S.alt += (altFor(g.d) - S.alt) * (1 - Math.exp(-4 * dt));
    S.level = g.level;

    // 座面の軌跡
    if (!flying) {
      const sp = seatPos(g.swing.theta);
      S.seatTrail.unshift(sp);
      if (S.seatTrail.length > 26) S.seatTrail.pop();
      S.sunburst += (Math.max(0, g.level - 2) / 4 - S.sunburst) * (1 - Math.exp(-2 * dt));
      // MAX の稲妻
      if (g.level >= 6 && g.phase !== 'ready') {
        S.lightningT -= dt;
        if (S.lightningT <= 0) {
          S.lightningT = 0.12 + Math.random() * 0.25;
          const gx = L.P.x + (Math.random() - 0.5) * W * 0.9;
          fx.lightning(L.P.x + (Math.random() - 0.5) * 30, L.P.y - L.R * 0.2, gx, L.groundY + 10, Math.random() < 0.5 ? '#d9b3ff' : '#9fe6ff');
          fx.burst(gx, L.groundY, 10, { kind: 'spark', colors: ['#ffffff', '#d9b3ff'], speed: 380, angle: -Math.PI / 2, spread: 2.2, life: 0.4, grav: 900 });
        }
      }
      // オーラの炎
      if (g.level >= 4 && g.phase !== 'ready') {
        const sp = seatPos(g.swing.theta);
        const col = LEVEL_COLORS[g.level];
        const n = g.level >= 6 ? 2 : 1;
        fx.burst(sp.x, sp.y - L.u * 3, n, { kind: 'glow', colors: [col, '#ffffff'], speed: 50, vy: -120, life: 0.35, size: L.u * 0.7, drag: 1, jitter: L.u * 4 });
      }
    }

    // 発射
    if (g.phase === 'launch' || (flying && !S.kidStart)) {
      if (!S.kidStart) {
        const sp = seatPos(g.swing.theta);
        S.kidStart = { x: sp.x, y: sp.y };
        S.kid.x = sp.x;
        S.kid.y = sp.y;
        S.kid.rot = -g.swing.theta;
        S.kid.on = true;
      }
    }
    if (flying && S.kidStart && !S.kicked) {
      // キックまでは人が飛ぶ（画面の中央へ移動）
      const k = ease(g.t / 0.55);
      S.kid.x = lerp(S.kidStart.x, L.anchor.x - L.u * 3, k);
      S.kid.y = lerp(S.kidStart.y, L.anchor.y, k) - Math.sin(k * Math.PI) * H * 0.08;
      S.kid.rot = lerp(S.kid.rot, -0.35, 1 - Math.exp(-6 * dt));
    }
    if (g.kickJudge && !S.kicked) {
      S.kicked = true;
      S.kickT = 0;
      S.shoe.x = S.kid.x + L.u * 4;
      S.shoe.y = S.kid.y + L.u * 1;
      S.kid.vx = -W * 0.35;
      S.kid.vy = -H * 0.25;
      S.kid.vr = -9;
    }
    if (S.kicked) {
      S.kickT += dt;
      // 人はくるくる回りながら画面の外へ
      S.kid.vy += H * 1.4 * dt;
      S.kid.x += S.kid.vx * dt;
      S.kid.y += S.kid.vy * dt;
      S.kid.rot += S.kid.vr * dt;
      const k = ease(S.kickT / 0.35);
      S.shoe.x = lerp(S.shoe.x, L.anchor.x + Math.sin(S.t * 1.7) * W * 0.015, 1 - Math.exp(-10 * dt));
      S.shoe.y = lerp(S.shoe.y, L.anchor.y + Math.sin(S.t * 2.3) * H * 0.012, 1 - Math.exp(-10 * dt));
      S.shoe.scale = lerp(0.35, 1, k);
      const spin = g.phase === 'flight' ? 6 + Math.log10(Math.max(10, g.v)) * 1.6 : 3;
      S.shoe.rot += spin * dt;
      emitTrail(dt, g, skin);
    }

    // 粒子を背景と一緒に流す
    if (flying) fx.scroll(0, 0);

    updateClouds(dt, g);
    updatePieces(dt, g);
    if (stageIndexAt(g.d) !== S.lastStage) {
      S.lastStage = stageIndexAt(g.d);
    }
    S.whiteout = Math.max(0, S.whiteout - dt * 1.5);
  }

  function emitTrail(dt, g, skin) {
    const lvl = clamp(Math.log10(Math.max(10, g.v)) / 6, 0.3, 3);
    const n = Math.ceil((g.phase === 'flight' ? 3 : 1) * lvl);
    const back = -Math.cos(0) * L.shoeLen * 0.45;
    const cols = skin.trail;
    const vx = -S.vs * 0.9;
    for (let i = 0; i < n; i++) {
      fx.burst(S.shoe.x + back * S.shoe.scale, S.shoe.y, 1, {
        kind: 'glow',
        colors: skin.rainbow ? [cols[Math.floor((S.t * 8 + i) % cols.length)]] : cols,
        speed: 40,
        vx: vx * (0.7 + Math.random() * 0.4),
        vy: (Math.random() - 0.5) * 60,
        life: 0.45,
        size: L.shoeLen * 0.16 * (0.7 + lvl * 0.3),
        drag: 0.5,
        grow: -0.5,
      });
    }
    if (Math.random() < 0.5) {
      fx.burst(S.shoe.x, S.shoe.y, 1, { kind: 'spark', colors: ['#ffffff', cols[0]], speed: 120, vx: vx * 1.2, life: 0.35, size: 8, drag: 0.3 });
    }
    if (skin.petals && Math.random() < 0.6) {
      fx.burst(S.shoe.x, S.shoe.y, 1, { kind: 'petal', colors: ['#ffc4dc', '#ff9cc2', '#ffffff'], speed: 60, vx: vx * 0.6, life: 1.2, size: L.shoeLen * 0.05, drag: 0.8, grav: 80 });
    }
    if ((skin.id === 'gold' || skin.rainbow) && Math.random() < 0.5) {
      fx.burst(S.shoe.x, S.shoe.y, 1, { kind: 'star', colors: [cols[Math.floor(Math.random() * cols.length)]], speed: 90, vx: vx * 0.5, life: 0.8, size: L.shoeLen * 0.05, drag: 1 });
    }
  }

  function updateClouds(dt, g) {
    const st = STAGES[stageIndexAt(g.d)].id;
    const lgd = Math.log10(Math.max(1, g.d));
    const lowSky = (st === 'park' || st === 'town' || st === 'city' || st === 'clouds') && lgd < 3.9;
    const nearSea = lgd > 3.15 && lgd < 3.65;
    for (const c of S.clouds) c.x -= (S.vs * c.p + 12) * dt;
    S.clouds = S.clouds.filter((c) => c.x > -c.img.width * c.s - 50);
    if (lowSky && S.clouds.length < (nearSea ? 9 : 6)) {
      const thick = nearSea;
      S.clouds.push({
        x: W + Math.random() * W * 0.5,
        y: thick ? H * Math.random() : H * (0.04 + Math.random() * 0.32),
        s: thick ? 0.8 + Math.random() * 0.9 : 0.45 + Math.random() * 0.6,
        p: thick ? 0.6 + Math.random() * 0.6 : 0.12 + Math.random() * 0.22,
        img: A.clouds[Math.floor(Math.random() * 6)],
      });
    }
  }

  // ステージに入ったときの大物
  const PIECES = {
    station: () => ({ img: lazy('station', () => makeStation()), w: W * 0.85, y: H * 0.26, p: 0.45, rot: -0.12, vr: 0.05 }),
    moon: () => ({ img: lazy('moon', () => makeMoon()), w: Math.max(W, H) * 0.75, y: H * 0.28, p: 0.08 }),
    mars: () => ({ img: lazy('mars', () => makeMars()), w: Math.max(W, H) * 0.6, y: H * 0.72, p: 0.1 }),
    jupiter: () => ({ img: lazy('jupiter', () => makeJupiter()), w: Math.max(W, H) * 0.95, y: H * 0.98, p: 0.08 }),
    saturn: () => ({ img: lazy('saturn', () => makeSaturn()), w: Math.max(W, H) * 1.15, y: H * 0.24, p: 0.09 }),
    galaxy: () => ({ img: lazy('bh', () => makeBlackHole()), w: Math.max(W, H) * 0.9, y: H * 0.3, p: 0.06, add: true }),
    andromeda: () => ({ img: lazy('andromeda', () => makeGalaxy(900, ['#ffb3f0', '#b3c8ff', '#ffffff', '#ffd3a8'], 77, 2)), w: Math.max(W, H) * 1.5, y: H * 0.42, p: 0.04, add: true, rot: 0.5, squash: 0.45 }),
  };

  function updatePieces(dt, g) {
    const si = stageIndexAt(g.d);
    const id = STAGES[si].id;
    if (PIECES[id] && !S.spawned.has(id)) {
      S.spawned.add(id);
      const p = PIECES[id]();
      p.x = W + p.w * 0.55;
      p.a = 0;
      // 前の大物は急いで退場
      for (const old of S.pieces) old.exit = true;
      S.pieces.push(p);
    }
    for (const p of S.pieces) {
      p.x -= (S.vs * (p.exit ? p.p + 0.9 : p.p) + 18) * dt;
      p.a += (p.vr || 0) * dt;
    }
    S.pieces = S.pieces.filter((p) => p.x > -p.w * 0.7);
    // 小惑星・彗星
    if ((id === 'asteroids' || id === 'oort' || id === 'edge') && S.rocks.length < (id === 'asteroids' ? 26 : 8)) {
      const big = Math.random();
      S.rocks.push({
        img: lazy(`rock${Math.floor(Math.random() * 5)}`, () => makeAsteroid(Math.floor(Math.random() * 999) + 1)),
        x: W + 100 + Math.random() * W,
        y: Math.random() * H,
        s: (0.15 + big * big * 0.9) * Math.min(W, H) * 0.35,
        p: 0.4 + big * 1.2,
        r: Math.random() * 6,
        vr: (Math.random() - 0.5) * 3,
        comet: id !== 'asteroids',
      });
    }
    for (const r of S.rocks) {
      r.x -= (S.vs * r.p + 30) * dt;
      r.r += r.vr * dt;
    }
    S.rocks = S.rocks.filter((r) => r.x > -r.s * 2 - (r.comet ? W : 0));
  }

  // ===== 描画 =====
  function stageBlend(d) {
    const i = stageIndexAt(d);
    const p = stageProgress(d);
    const cur = SKY[STAGES[i].id];
    const next = SKY[STAGES[Math.min(STAGES.length - 1, i + 1)].id];
    const k = ease((p - 0.6) / 0.4);
    return { i, p, top: mix(cur[0], next[0], k), bot: mix(cur[1], next[1], k) };
  }

  function drawSky(g, d, level) {
    const b = stageBlend(d);
    let top = b.top;
    let bot = b.bot;
    // チャージ中、LV が上がると空が燃える
    if (d < 1 && level >= 3) {
      const k = Math.min(1, (level - 2) / 4);
      top = mix(b.top, level >= 6 ? '#16063a' : '#4b2cff', k * 0.85);
      bot = mix(b.bot, level >= 6 ? '#ff3d9a' : '#ff9ad0', k * 0.85);
    }
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, top);
    grd.addColorStop(1, bot);
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    return b;
  }

  function drawStars(g, d) {
    const lg = Math.log10(Math.max(1, d));
    const a = clamp((lg - 3.9) / 1.0, 0, 1);
    if (a <= 0) return;
    const blur = clamp(S.vs / 2600, 0, 1);
    const pars = [0.03, 0.08, 0.18];
    for (let k = 0; k < 3; k++) {
      const tile = A.stars[k];
      const ts = tile.width;
      const off = (S.scroll * pars[k]) % ts;
      const oy = (S.alt * pars[k] * 0.3) % ts;
      const copies = blur > 0.2 ? 3 : 1;
      for (let c = 0; c < copies; c++) {
        g.globalAlpha = (a / copies) * (k === 2 ? 1 : 0.85);
        const dx = c * blur * 18 * (k + 1);
        for (let x = -off - ts + dx; x < W; x += ts) {
          for (let y = -ts + oy; y < H; y += ts) g.drawImage(tile, x, y);
        }
      }
    }
    g.globalAlpha = 1;
  }

  function drawNebulae(g, d, b) {
    const lg = Math.log10(Math.max(1, d));
    if (lg < 12.5) return;
    const a = clamp((lg - 12.5) / 1.5, 0, 1);
    const id = STAGES[b.i].id;
    const sets = {
      edge: ['#3dd6ff', '#3d5bff'],
      oort: ['#7dfcff', '#3d8bff'],
      galaxy: ['#ff9a3d', '#ff4d6d', '#ffd36b'],
      andromeda: ['#ff5af0', '#8a5bff', '#3d8bff'],
      cosmos: ['#ff5af0', '#7df3ff', '#ffe27a', '#7dff9a'],
    };
    const cols = sets[id] || sets.edge;
    const key = `neb-${id}`;
    const img = lazy(key, () => makeNebula(id.length * 17, cols, 512));
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a * 0.9;
    const s = Math.max(W, H) * 1.3;
    const ox = (-S.scroll * 0.02) % (s * 1.2);
    g.drawImage(img, ox + W * 0.1, -H * 0.15, s, s);
    g.drawImage(img, ox + W * 0.1 + s * 1.2, -H * 0.05, s, s);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // 銀河の中心：明るい中心の光
    if (id === 'galaxy' || id === 'cosmos') drawGlow(g, id === 'galaxy' ? '#ffcf6b' : '#ffffff', W * 0.75, H * 0.35, Math.max(W, H) * 0.6, 0.5);
  }

  function drawEarth(g, d) {
    const lg = Math.log10(Math.max(1, d));
    if (lg < 3.95 || lg > 9.8) return;
    const keys = [
      [4.0, 5.0, 0.5, 1.02],
      [4.6, 3.6, 0.5, 0.82],
      [5.0, 2.4, 0.45, 0.72],
      [5.6, 1.2, 0.36, 0.64],
      [6.6, 0.55, 0.22, 0.62],
      [8.6, 0.14, 0.08, 0.72],
      [9.8, 0.05, -0.2, 0.8],
    ];
    let i = 0;
    while (i < keys.length - 2 && lg > keys[i + 1][0]) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const t = ease((lg - a[0]) / (b[0] - a[0]));
    const R = lerp(a[1], b[1], t) * W;
    const cx = lerp(a[2], b[2], t) * W;
    const top = lerp(a[3], b[3], t) * H;
    const cy = top + R;
    const img = lazy('earth', () => makeEarth(1024));
    // 大気の光
    g.globalCompositeOperation = 'lighter';
    g.drawImage(glow('#5ab8ff'), cx - R * 1.25, cy - R * 1.25, R * 2.5, R * 2.5);
    g.globalCompositeOperation = 'source-over';
    g.save();
    g.translate(cx, cy);
    g.rotate(S.t * 0.01);
    g.drawImage(img, -R, -R, R * 2, R * 2);
    g.restore();
    g.strokeStyle = 'rgba(160,220,255,0.8)';
    g.lineWidth = Math.max(2, R * 0.012);
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.stroke();
  }

  function drawGroundLayers(g, d, flying) {
    const alt = S.alt;
    const gy = L.groundY + alt;
    if (gy > H + 600) return;
    // 遠くの山・街（ゆっくり）
    const tile = (img, par, yBase, scale = 1, alpha = 1) => {
      const w = img.width * scale;
      const h = img.height * scale;
      const off = (S.scroll * par) % w;
      g.globalAlpha = alpha;
      for (let x = -off; x < W; x += w) g.drawImage(img, x, yBase - h, w, h);
      g.globalAlpha = 1;
    };
    const s = H / 800;
    tile(A.mountains, 0.04, L.groundY + alt * 0.35 + 10 * s, s * 0.9, 0.8);
    tile(A.cityFar, 0.08, L.groundY + alt * 0.55 + 6 * s, s * 0.55, 0.75);
    tile(A.houses, 0.25, gy - 4 * s, s * 0.8);
    // 地面
    const grd = g.createLinearGradient(0, gy, 0, gy + H * 0.5);
    grd.addColorStop(0, '#6fd05a');
    grd.addColorStop(0.15, '#4fb348');
    grd.addColorStop(1, '#2f7a34');
    g.fillStyle = grd;
    g.fillRect(-10, gy, W + 20, H + 1200);
    g.fillStyle = '#8ae070';
    g.fillRect(-10, gy, W + 20, 6 * s);
    tile(A.trees, 0.7, gy + 8 * s, s * 0.9);
    // 街のビル群（進むと現れる）
    if (flying && S.scroll > W * 0.8) {
      tile(A.city, 1.0, gy + 2 * s, s * 0.9);
    }
  }

  function drawCloudSea(g, d) {
    // 雲の層：下から近づき、突き抜けると下へ
    const lg = Math.log10(Math.max(1, d));
    const center = 3.4; // 約2.5km
    const y = H * 0.5 + (lg - center) * H * 3.2;
    if (y < -H * 0.6 || y > H * 1.6) return;
    const band = H * 0.26;
    const img = A.clouds[2];
    const cw = img.width * 1.1;
    const off = (S.scroll * 0.9) % cw;
    for (const edge of [-1, 1]) {
      for (let x = -off - cw; x < W + cw; x += cw * 0.55) {
        const yy = y + edge * band * 0.5 - img.height * 0.4 + Math.sin(x * 0.01) * 12;
        g.drawImage(img, x, yy, cw, img.height * 1.1);
      }
    }
    g.fillStyle = '#ffffff';
    g.fillRect(0, y - band * 0.42, W, band * 0.84);
  }

  function drawClouds(g) {
    for (const c of S.clouds) {
      g.globalAlpha = 0.95;
      g.drawImage(c.img, c.x, c.y, c.img.width * c.s, c.img.height * c.s);
    }
    g.globalAlpha = 1;
  }

  function drawPieces(g) {
    for (const p of S.pieces) {
      const w = p.w;
      const h = (p.img.height / p.img.width) * w * (p.squash || 1);
      g.save();
      g.translate(p.x, p.y);
      g.rotate((p.rot || 0) + (p.a || 0));
      if (p.add) g.globalCompositeOperation = 'lighter';
      g.drawImage(p.img, -w / 2, -h / 2, w, h);
      g.restore();
      g.globalCompositeOperation = 'source-over';
    }
  }

  function drawRocks(g) {
    for (const r of S.rocks) {
      if (r.comet) {
        g.globalCompositeOperation = 'lighter';
        const grd = g.createLinearGradient(r.x, r.y, r.x + r.s * 4, r.y);
        grd.addColorStop(0, 'rgba(190,240,255,0.7)');
        grd.addColorStop(1, 'rgba(190,240,255,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(r.x, r.y - r.s * 0.3);
        g.lineTo(r.x + r.s * 4, r.y);
        g.lineTo(r.x, r.y + r.s * 0.3);
        g.closePath();
        g.fill();
        g.globalCompositeOperation = 'source-over';
      }
      g.save();
      g.translate(r.x, r.y);
      g.rotate(r.r);
      g.drawImage(r.img, -r.s / 2, -r.s / 2, r.s, r.s);
      g.restore();
    }
  }

  // 速さの線
  function drawStreaks(g, v, d) {
    const k = clamp((S.vs - 700) / 2200, 0, 1) * 0.75;
    if (k <= 0) return;
    const warp = v > 2.998e8;
    const deep = Math.log10(Math.max(1, d)) > 4.5;
    g.globalCompositeOperation = deep ? 'lighter' : 'source-over';
    for (let i = 0; i < S.streaks.length; i++) {
      const s = S.streaks[i];
      if (i > 25 + k * 60) break;
      s.x -= (S.vs * (0.8 + s.s) * 0.0016) * (1 / 60);
      if (s.x < -0.3) {
        s.x = 1 + Math.random() * 0.3;
        s.y = Math.random();
      }
      const len = (60 + s.l * 260) * k * (warp ? 2 : 1);
      const x = s.x * W;
      const y = s.y * H;
      const col = warp ? (s.l > 0.5 ? '#9fd8ff' : '#e0b3ff') : deep ? '#ffffff' : '#ffffff';
      g.strokeStyle = rgba(col, (0.25 + s.s * 0.35) * k);
      g.lineWidth = 1 + s.s * 2.2 * k;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + len, y);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  }

  // ===== 巨大ブランコ =====
  function drawSwing(g, game, offX, offY, demo) {
    const { P, R, groundY, u } = L;
    const px = P.x + offX;
    const py = P.y + offY;
    const gy = groundY + offY;
    const spread = R * 1.25;
    const lw = Math.max(10, R * 0.09);
    const theta = game.swing.theta;
    // 後ろ側の A フレーム（暗い）
    const leg = (x1, y1, x2, y2, col, w) => {
      g.lineCap = 'round';
      g.strokeStyle = INK;
      g.lineWidth = w + 7;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      g.strokeStyle = col;
      g.lineWidth = w;
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = w * 0.25;
      g.beginPath();
      g.moveTo(x1 - w * 0.2, y1);
      g.lineTo(x2 - w * 0.2, y2);
      g.stroke();
    };
    leg(px + R * 0.12, py - R * 0.06, px - spread + R * 0.25, gy, '#a83a2c', lw * 0.85);
    leg(px + R * 0.12, py - R * 0.06, px + spread + R * 0.25, gy, '#a83a2c', lw * 0.85);
    // 土台
    g.fillStyle = '#6b7080';
    g.strokeStyle = INK;
    g.lineWidth = 4;
    for (const x of [px - spread, px + spread]) {
      g.beginPath();
      g.roundRect(x - R * 0.2, gy - R * 0.04, R * 0.4, R * 0.08, 6);
      g.fill();
      g.stroke();
    }

    // 回転の残像（大車輪のとき）
    if (game.looping && !demo) {
      const col = LEVEL_COLORS[Math.min(6, game.level)];
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = rgba(col, 0.18 + 0.1 * Math.sin(S.t * 20));
      g.lineWidth = R * 0.05;
      g.beginPath();
      g.arc(px, py, R, 0, TAU);
      g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
    // 座面の光の軌跡
    if (game.level >= 2) {
      const col = LEVEL_COLORS[Math.min(6, game.level)];
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      for (let i = 1; i < S.seatTrail.length; i++) {
        const a = S.seatTrail[i - 1];
        const b = S.seatTrail[i];
        const t = 1 - i / S.seatTrail.length;
        g.strokeStyle = rgba(col, t * 0.8);
        g.lineWidth = (6 + game.level * 5) * t;
        g.beginPath();
        g.moveTo(a.x + offX, a.y + offY);
        g.lineTo(b.x + offX, b.y + offY);
        g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    }

    // 鎖（鉄の棒）
    const sp = { x: px + Math.sin(theta) * R, y: py + Math.cos(theta) * R };
    const nx = Math.cos(theta);
    const ny = -Math.sin(theta);
    for (const side of [-1, 1]) {
      const ox = nx * u * 1.3 * side;
      const oy = ny * u * 1.3 * side;
      g.strokeStyle = INK;
      g.lineWidth = u * 0.7 + 4;
      g.beginPath();
      g.moveTo(px + ox * 0.3, py + oy * 0.3);
      g.lineTo(sp.x + ox, sp.y + oy);
      g.stroke();
      g.strokeStyle = '#c9ced8';
      g.lineWidth = u * 0.7;
      g.stroke();
    }
    // 子ども
    if (!S.kidStart) {
      g.save();
      g.translate(sp.x, sp.y);
      g.rotate(-theta);
      // 座面
      g.fillStyle = '#3a3f52';
      g.strokeStyle = INK;
      g.lineWidth = 4;
      g.beginPath();
      g.roundRect(-u * 2.6, -u * 0.2, u * 5.2, u * 0.9, u * 0.3);
      g.fill();
      g.stroke();
      const lvl = game.level;
      if (lvl >= 4) {
        g.globalCompositeOperation = 'lighter';
        drawGlow(g, LEVEL_COLORS[lvl], 0, -u * 4, u * (5 + lvl * 0.6), 0.45 + Math.sin(S.t * 14) * 0.12);
        g.globalCompositeOperation = 'source-over';
      }
      const pumpK = Math.max(0, 1 - (S.t - (S.lastPumpT || -9)) / 0.3);
      drawKid(
        g,
        u,
        {
          lean: Math.min(1, lvl / 6) * 0.6 + pumpK * 0.3,
          legKick: pumpK,
          armUp: 1,
          face: lvl >= 4 ? 'fierce' : 'happy',
          hairT: S.t * (1 + lvl),
          shoeOn: [true, true],
        },
        S.skin,
      );
      g.restore();
    }
    // 前側の A フレーム
    leg(px, py, px - spread, gy, '#ff4f3a', lw);
    leg(px, py, px + spread, gy, '#ff4f3a', lw);
    // 補強の横棒
    leg(px - spread * 0.86, py + (gy - py) * 0.86, px + spread * 0.86, py + (gy - py) * 0.86, '#ff4f3a', lw * 0.55);
    // 軸
    g.fillStyle = '#ffd23f';
    g.strokeStyle = INK;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(px, py, lw * 1.25, 0, TAU);
    g.fill();
    g.stroke();
    g.fillStyle = INK;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + theta;
      g.beginPath();
      g.arc(px + Math.cos(a) * lw * 0.75, py + Math.sin(a) * lw * 0.75, lw * 0.14, 0, TAU);
      g.fill();
    }
    return sp;
  }

  // こぐ位置（真下）の目印と、離す位置の目印
  function drawGuides(g, game) {
    const { P, R } = L;
    if (game.phase === 'charge' || game.phase === 'ready') {
      const sw = game.swing;
      const th = wrap(sw.theta);
      const tb = th * sw.omega < 0 ? Math.abs(th) / Math.max(0.1, Math.abs(sw.omega)) : 9;
      const near = clamp(1 - tb / 0.35, 0, 1);
      const x = P.x;
      const y = P.y + R;
      g.globalCompositeOperation = 'lighter';
      drawGlow(g, near > 0.75 ? '#ffe14d' : '#7dffb0', x, y, R * (0.25 + near * 0.25), 0.5 + near * 0.5);
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = near > 0.75 ? '#ffe14d' : 'rgba(255,255,255,0.9)';
      g.lineWidth = 4 + near * 4;
      g.setLineDash([8, 8]);
      g.beginPath();
      g.arc(x, y, R * 0.16 + (1 - near) * R * 0.1, 0, TAU);
      g.stroke();
      g.setLineDash([]);
    }
    if (game.phase === 'release') {
      const tgt = releaseTarget(game);
      const x = P.x + Math.sin(tgt) * R;
      const y = P.y + Math.cos(tgt) * R;
      // 狙いの区間
      const win = (CFG.RELEASE[1].win * Math.max(1, Math.abs(game.swing.omega)));
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(255,225,77,0.85)';
      g.lineWidth = R * 0.12;
      g.beginPath();
      // canvas の角度：右が 0、下が π/2。座面の位置 (sin θ, cos θ) は角度 π/2 - θ
      g.arc(P.x, P.y, R, Math.PI / 2 - tgt - win, Math.PI / 2 - tgt + win);
      g.stroke();
      drawGlow(g, '#ffe14d', x, y, R * 0.45, 0.6 + Math.sin(S.t * 18) * 0.3);
      g.globalCompositeOperation = 'source-over';
      // 矢印（飛ぶ方向）
      const dx = Math.cos(tgt);
      const dy = -Math.sin(tgt);
      g.save();
      g.translate(x + dx * R * 0.35, y + dy * R * 0.35);
      g.rotate(Math.atan2(dy, dx));
      g.fillStyle = '#ffe14d';
      g.strokeStyle = INK;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(R * 0.28, 0);
      g.lineTo(0, -R * 0.15);
      g.lineTo(0, -R * 0.06);
      g.lineTo(-R * 0.2, -R * 0.06);
      g.lineTo(-R * 0.2, R * 0.06);
      g.lineTo(0, R * 0.06);
      g.lineTo(0, R * 0.15);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
  }

  function drawSunburst(g, level) {
    if (S.sunburst <= 0.01) return;
    const { P } = L;
    g.save();
    g.translate(P.x, P.y);
    g.rotate(S.t * (0.3 + level * 0.15));
    g.globalCompositeOperation = 'lighter';
    const n = 18;
    const R = Math.hypot(W, H);
    const col = level >= 6 ? `hsl(${(S.t * 120) % 360},100%,70%)` : LEVEL_COLORS[Math.min(6, level)];
    g.fillStyle = col;
    g.globalAlpha = S.sunburst * 0.22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a - 0.08) * R, Math.sin(a - 0.08) * R);
      g.lineTo(Math.cos(a + 0.08) * R, Math.sin(a + 0.08) * R);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.restore();
  }

  // ===== ゲート =====
  function gateX(game, gate) {
    const speed = (W - L.anchor.x + W * 0.25) / gate.approach;
    return L.anchor.x + (gate.hit - game.t) * speed;
  }

  function gateColor(game) {
    return STAGES[stageIndexAt(game.d)].color;
  }

  function drawGateHalf(g, game, gate, front) {
    if (gate.judged) return;
    const x = gateX(game, gate);
    if (x > W + 200) return;
    const y = L.anchor.y;
    const Rg = L.shoeLen * 0.95;
    const col = gateColor(game);
    const appear = clamp((game.t - gate.appear) / 0.2, 0, 1);
    g.save();
    g.globalAlpha = appear;
    g.translate(x, y);
    // 半分だけ（front = 左半分＝手前）
    g.beginPath();
    if (front) g.rect(-Rg * 2, -Rg * 2, Rg * 2, Rg * 4);
    else g.rect(0, -Rg * 2, Rg * 2, Rg * 4);
    g.clip();
    g.globalCompositeOperation = 'lighter';
    g.drawImage(glow(col), -Rg * 1.4, -Rg * 1.4, Rg * 2.8, Rg * 2.8);
    g.globalCompositeOperation = 'source-over';
    for (const [w, c] of [
      [Rg * 0.22, INK],
      [Rg * 0.15, col],
      [Rg * 0.05, '#ffffff'],
    ]) {
      g.strokeStyle = c;
      g.lineWidth = w;
      g.beginPath();
      g.ellipse(0, 0, Rg * 0.36, Rg, 0, 0, TAU);
      g.stroke();
    }
    g.restore();
    if (front) {
      // 「>>>」
      g.save();
      g.globalAlpha = appear * 0.8;
      g.fillStyle = col;
      g.font = `${Math.round(Rg * 0.5)}px "Dela Gothic One", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('≫', x + Math.sin(S.t * 12) * 4, y);
      g.restore();
    }
  }

  // 靴のまわりのタイミングの輪
  function drawTimingRing(g, game) {
    const gate = game.gates.find((x) => !x.judged);
    if (!gate) return;
    const rem = gate.hit - game.t;
    const total = gate.approach;
    if (rem > total) return;
    const r0 = L.shoeLen * 0.72;
    const r = r0 + Math.max(0, rem / total) * Math.min(W, H) * 0.42;
    const perfectWin = CFG.GATE[0].win * gateWindowScale(gate.i);
    const inPerfect = Math.abs(rem) <= perfectWin;
    const inGreat = Math.abs(rem) <= CFG.GATE[1].win * gateWindowScale(gate.i);
    const { x, y } = S.shoe;
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 3;
    g.setLineDash([6, 6]);
    g.beginPath();
    g.arc(x, y, r0, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = inPerfect ? '#ffe14d' : inGreat ? '#7dffb0' : '#ffffff';
    g.lineWidth = inPerfect ? 9 : 5;
    g.globalAlpha = clamp(1 - rem / total + 0.3, 0, 1);
    g.beginPath();
    g.arc(x, y, Math.max(r0 * 0.6, r), 0, TAU);
    g.stroke();
    g.globalAlpha = 1;
  }

  function drawShoe(g, game, skin) {
    if (!S.kicked) return;
    const { x, y, rot, scale } = S.shoe;
    const len = L.shoeLen * scale;
    const lv = clamp(Math.log10(Math.max(10, game.v)) / 8, 0.1, 1.2);
    // 炎の円錐
    g.globalCompositeOperation = 'lighter';
    const fl = len * (1.2 + lv * 2.5);
    const grd = g.createLinearGradient(x, y, x - fl, y);
    grd.addColorStop(0, rgba(skin.trail[0], 0.9));
    grd.addColorStop(0.3, rgba(skin.trail[1], 0.6));
    grd.addColorStop(1, rgba(skin.trail[2] || skin.trail[1], 0));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x + len * 0.1, y - len * 0.32);
    g.quadraticCurveTo(x - fl * 0.5, y - len * 0.25 + Math.sin(S.t * 40) * 4, x - fl, y);
    g.quadraticCurveTo(x - fl * 0.5, y + len * 0.25 + Math.cos(S.t * 37) * 4, x + len * 0.1, y + len * 0.32);
    g.closePath();
    g.fill();
    drawGlow(g, skin.trail[1], x, y, len * (0.9 + lv * 0.6), 0.7);
    if (skin.aura) drawGlow(g, `#ffffff`, x, y, len * 1.4, 0.4 + Math.sin(S.t * 9) * 0.2);
    g.globalCompositeOperation = 'source-over';
    // 衝撃波（速いとき）
    if (game.v > 343) {
      const k = clamp(Math.log10(game.v / 343) / 6, 0.2, 1);
      g.strokeStyle = `rgba(255,255,255,${0.35 * k})`;
      g.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const off = ((S.t * 6 + i / 3) % 1) * len * 0.5;
        g.beginPath();
        g.arc(x + len * 0.25 - off, y, len * (0.55 + off / len), -1.1, 1.1);
        g.stroke();
      }
    }
    const img = shoeSprite(skin, 220);
    // 背景に溶けないよう、靴の後ろに濃い影
    drawGlow(g, '#0b0e1c', x, y, len * 0.85, 0.45);
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    const sw = len * 1.3;
    g.drawImage(img, -sw / 2, -sw * (img.height / img.width) / 2, sw, sw * (img.height / img.width));
    g.restore();
  }

  function drawFlyingKid(g, game) {
    if (!S.kidStart) return;
    if (S.kicked && S.kickT > 2.5) return;
    const u = L.u * (S.kicked ? 0.85 : 1);
    g.save();
    g.translate(S.kid.x, S.kid.y);
    g.rotate(S.kid.rot);
    drawKid(
      g,
      u,
      {
        lean: 0.6,
        legKick: S.kicked ? 1 : 0.3,
        armUp: S.kicked ? 0.4 : 0.9,
        face: S.kicked ? 'wow' : 'fierce',
        hairT: S.t * 4,
        shoeOn: [!S.kicked, true],
        tumble: S.kicked,
      },
      S.skin,
    );
    g.restore();
    // キックの輪
    if (game.phase === 'launch' && game.t >= CFG.KICK_APPEAR) {
      const hitT = CFG.KICK_APPEAR + CFG.KICK_SHRINK;
      const rem = hitT - game.t;
      const r0 = u * 5;
      const r = r0 + Math.max(0, rem / CFG.KICK_SHRINK) * Math.min(W, H) * 0.4;
      const perfect = Math.abs(rem) <= CFG.KICK[0].win;
      const cx = S.kid.x;
      const cy = S.kid.y - u * 2;
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = 3;
      g.setLineDash([6, 6]);
      g.beginPath();
      g.arc(cx, cy, r0, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = perfect ? '#ffe14d' : '#ff8a5b';
      g.lineWidth = perfect ? 10 : 6;
      g.beginPath();
      g.arc(cx, cy, Math.max(r0 * 0.6, r), 0, TAU);
      g.stroke();
    }
  }

  function draw(g, game, skin, mode) {
    S.skin = skin;
    const flying = !!S.kidStart;
    const d = game.d;
    const b = drawSky(g, d, flying ? 0 : game.level);
    drawStars(g, d);
    drawNebulae(g, d, b);
    if (!flying) drawSunburst(g, game.level);
    drawEarth(g, d);
    drawPieces(g);
    drawGroundLayers(g, d, flying);
    drawClouds(g);
    // ブランコ（飛んだ後は置き去りに）
    const offX = flying ? -S.scroll * 1.0 : 0;
    const offY = flying ? S.alt : 0;
    if (L.P.x + offX > -L.R * 3 && L.P.y + offY < H + L.R * 3) {
      drawSwing(g, game, offX, offY, mode === 'demo');
    }
    if (!flying && mode !== 'demo') drawGuides(g, game);
    drawCloudSea(g, d);
    drawRocks(g);
    drawStreaks(g, game.v, d);
    if (game.phase === 'flight') for (const gate of game.gates) drawGateHalf(g, game, gate, false);
    fx.drawParticles(g);
    drawShoe(g, game, skin);
    drawFlyingKid(g, game);
    if (game.phase === 'flight') {
      for (const gate of game.gates) drawGateHalf(g, game, gate, true);
      if (mode !== 'demo') drawTimingRing(g, game);
    }
    // 宇宙の果て：まばゆい光
    if (game.phase === 'finale') {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255,255,255,${clamp(game.t / 3, 0, 1)})`;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }
  }

  return {
    L,
    S,
    resize,
    reset,
    update,
    draw,
    seatPos,
    gateX,
    notePump() {
      S.lastPumpT = S.t;
    },
    get anchor() {
      return S.shoe;
    },
  };
}
