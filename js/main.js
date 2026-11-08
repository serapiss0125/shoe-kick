// 超ブランコ靴飛ばし — 進行・入力・演出
import { DT, CFG, createGame, step, perfectMult } from './logic.js';
import { createBot, botTap } from './bot.js';
import { createScene } from './scene.js';
import { createFx, UI_FONT } from './fx.js';
import { createHud } from './hud.js';
import { STAGES, MILESTONES, TITLES, formatDistance, formatSpeed, distanceText, stageIndexAt } from './stages.js';
import { SKINS, getSkin } from './skins.js';
import { drawShoe, drawGlow, INK, rgba } from './art.js';
import { initAudio, sound, setSound, setMusic, setHum, setWind, setMusicIntensity } from './audio.js';
import * as save from './save.js';

const params = new URLSearchParams(location.search);
const AUTOPLAY = params.has('autoplay');
const SLOW = Math.max(0.05, parseFloat(params.get('slow') || '1'));
const BOT_SIGMA = parseFloat(params.get('sigma') || '0.03');

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('game');
const ctx = canvas.getContext('2d');

const screens = {
  loading: $('screen-loading'),
  title: $('screen-title'),
  skins: $('screen-skins'),
  howto: $('screen-howto'),
  ranking: $('screen-ranking'),
  result: $('screen-result'),
  share: $('screen-share'),
};

const fx = createFx();
const scene = createScene(fx);
const hud = createHud(fx);

let mode = 'loading'; // title / skins / howto / ranking / game / result / share
let returnTo = 'title';
let game = createGame();
let bot = null;
let tapQueued = false;
let hitstop = 0;
let resultTimer = -1;
let resultReady = false;
let savedName = false;
let skinIndex = 0;
let lastRec = null;
let deferred = []; // 発射中は大きな文字を後回しに
let deferT = 0;
let W = 1;
let H = 1;
let safeTop = 0;

function skin() {
  return getSkin(save.getData().selected);
}

// ===== 画面 =====
function show(name) {
  mode = name;
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  $('btn-sound').hidden = name === 'game';
}

// ===== サイズ =====
const probe = document.createElement('div');
probe.style.cssText = 'position:absolute;top:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
document.body.appendChild(probe);
let dprCap = Math.min(window.devicePixelRatio || 1, 2);
function resize() {
  W = stage.clientWidth;
  H = stage.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scene.resize(W, H);
  safeTop = probe.offsetHeight || 0;
}
window.addEventListener('resize', resize);

// ===== 入力 =====
function tap() {
  initAudio();
  if (mode === 'game' && !AUTOPLAY) tapQueued = true;
}
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  tap();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
for (const ev of ['pointerdown', 'keydown', 'click']) document.addEventListener(ev, () => initAudio(), { capture: true });
window.addEventListener('keydown', (e) => {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (e.repeat) return;
    if (mode === 'game') tap();
    else if (mode === 'title') startGame();
    else if (mode === 'result' && resultReady) startGame();
  }
  if (mode === 'skins') {
    if (e.code === 'ArrowLeft') changeSkin(-1);
    if (e.code === 'ArrowRight') changeSkin(1);
  }
});
document.addEventListener('visibilitychange', () => {
  lastTime = null;
});

// ===== 進行 =====
function newRun(demo) {
  game = createGame();
  scene.reset();
  fx.clear();
  hud.reset();
  hitstop = 0;
  resultTimer = -1;
  deferred = [];
  bot = demo || AUTOPLAY ? createBot(demo ? 0.03 : BOT_SIGMA, Math.floor(Math.random() * 1e6)) : null;
}

function goTitle() {
  show('title');
  updateTitle();
  newRun(true);
  setMusicIntensity(0);
}

function startGame() {
  initAudio();
  sound.click();
  if (!save.getData().seenHowto && !AUTOPLAY) {
    save.set('seenHowto', true);
    returnTo = 'game';
    show('howto');
    return;
  }
  newRun(false);
  savedName = false;
  show('game');
  setMusicIntensity(1);
}

// ===== 演出 =====
const PUMP_TEXT = { perfect: 'PERFECT!', great: 'GREAT!', good: 'GOOD', miss: 'MISS' };
const PUMP_COL = { perfect: ['#fff27a', '#ffb300'], great: ['#bfffd6', '#3ccf7a'], good: ['#ffffff', '#9fe6ff'], miss: ['#ffb3b3', '#ff4d4d'] };
const LEVEL_COLORS = ['#ffffff', '#9fe6ff', '#7dffb0', '#ffe14d', '#ff9a2e', '#ff4d6d', '#d16bff'];
const JUDGE_JA = { perfect: 'パーフェクト', great: 'グレート', good: 'グッド', bad: 'イマイチ', late: 'おそい', early: 'はやい' };

function handle(e, demo) {
  // デモ中は大きな文字を出さない（ロゴとかぶるので）
  const banner = (...a) => {
    if (demo) return;
    if (game.phase === 'launch' && !a[1]?.force) deferred.push(a);
    else fx.showBanner(...a);
  };
  const sp = scene.seatPos(game.swing.theta);
  const shoe = scene.anchor;
  switch (e.type) {
    case 'start':
      if (!demo) sound.start();
      break;
    case 'pump': {
      scene.notePump();
      const c = PUMP_COL[e.kind];
      if (e.kind !== 'miss') {
        const lvc = LEVEL_COLORS[game.level];
        fx.ring(sp.x, sp.y, e.kind === 'perfect' ? '#ffe14d' : lvc, scene.L.R * (e.kind === 'perfect' ? 0.9 : 0.6), 0.45, 14);
        fx.burst(sp.x, sp.y, e.kind === 'perfect' ? 26 : 12, { kind: 'spark', colors: ['#ffffff', c[0], lvc], speed: 520, life: 0.4, size: 9 });
        fx.burst(sp.x, scene.L.groundY, 10, { kind: 'dust', colors: ['#b98a5a', '#d9b48a'], speed: 260, angle: -Math.PI / 2, spread: 2.4, life: 0.6, grav: 600, size: 7 });
        fx.shake(e.kind === 'perfect' ? 6 + game.level * 2 : 3);
        fx.punch(e.kind === 'perfect' ? 0.035 : 0.015);
      } else {
        fx.shake(2);
      }
      if (!demo) {
        fx.text(PUMP_TEXT[e.kind], sp.x, sp.y - scene.L.R * 0.45, { size: e.kind === 'perfect' ? 38 : 30, color: c[0], color2: c[1], life: 0.7 });
        sound.pump(e.kind, game.level);
      }
      break;
    }
    case 'level':
      if (e.level === 3) break; // 大車輪は loopStart で
      if (e.level === 6) {
        banner('MAX POWER!!!', { color: '#ffffff', color2: '#d16bff', sub: '限界突破！', life: 1.4 });
        fx.flash(0.7, '#e8b3ff');
        fx.shake(26);
        if (!demo) sound.max();
      } else if (!demo) {
        fx.text(`LV ${e.level}`, W / 2, H * 0.2 + safeTop, { size: 44, color: '#ffffff', color2: LEVEL_COLORS[e.level], life: 0.9, vy: -20, rot: 0 });
        sound.level(e.level);
      }
      break;
    case 'loopStart':
      banner('大車輪！！！', { color: '#fff27a', color2: '#ff7a00', sub: 'ぐるぐる回して加速しろ！', life: 1.6 });
      fx.flash(0.6, '#ffe9a8');
      fx.shake(22);
      fx.punch(0.08);
      fx.ring(scene.L.P.x, scene.L.P.y, '#ffe14d', scene.L.R * 2, 0.7, 24);
      if (!demo) sound.loopStart();
      break;
    case 'loop':
      if (game.level >= 5) {
        fx.ring(scene.L.P.x, scene.L.P.y, LEVEL_COLORS[game.level], scene.L.R * 1.4, 0.4, 8);
        if (!demo) sound.zap();
      }
      break;
    case 'timeup':
      if (!demo) {
        banner('RELEASE!!', { color: '#ffffff', color2: '#7df3ff', sub: '矢印の位置でタップ！', life: 1.2 });
        sound.timeup();
      }
      break;
    case 'release': {
      hitstop = 0.14;
      fx.flash(0.9, '#ffffff');
      fx.shake(34);
      fx.punch(0.16);
      fx.ring(sp.x, sp.y, '#ffffff', Math.max(W, H) * 0.7, 0.6, 30);
      fx.burst(sp.x, sp.y, 70, { kind: 'spark', colors: ['#ffffff', '#ffe14d', '#ff9a2e'], speed: 1200, life: 0.6, size: 12 });
      if (!demo) {
        const label = { perfect: 'PERFECT RELEASE!!', great: 'GREAT RELEASE!', good: 'RELEASE', bad: 'イマイチ…' }[e.kind];
        fx.text(label, W / 2, H * 0.3, { size: 34, color: '#ffffff', color2: e.kind === 'bad' ? '#ff4d4d' : '#ffe14d', life: 1.1 });
        sound.release(e.kind);
      }
      setMusicIntensity(2);
      break;
    }
    case 'kick': {
      hitstop = e.kind === 'perfect' ? 0.16 : 0.08;
      fx.flash(e.kind === 'perfect' ? 0.9 : 0.5, e.kind === 'perfect' ? '#fff1a8' : '#ffffff');
      fx.shake(e.kind === 'perfect' ? 30 : 16);
      fx.punch(0.12);
      const kx = scene.S.kid.x + scene.L.u * 4;
      const ky = scene.S.kid.y;
      fx.ring(kx, ky, '#ffe14d', Math.max(W, H) * 0.5, 0.5, 26);
      fx.burst(kx, ky, 60, { kind: 'spark', colors: ['#ffffff', '#ffe14d', '#ff5a3c'], speed: 1000, life: 0.5, size: 12 });
      if (!demo) {
        deferT = 0.9;
        if (e.kind === 'perfect') banner('ベストキック！！', { color: '#fff27a', color2: '#ff5a3c', life: 1.1, force: true });
        else fx.text({ great: 'グッドキック！', good: 'キック！', late: 'おそい…', early: 'はやすぎ…' }[e.kind], W / 2, H * 0.32, { size: 34, color: '#ffffff', color2: '#ff8a5b' });
        sound.kick(e.kind);
      }
      break;
    }
    case 'gate': {
      const x = shoe.x;
      const y = shoe.y;
      if (e.kind === 'miss') {
        fx.text('MISS', x, y - scene.L.shoeLen, { size: 36, color: '#ffb3b3', color2: '#ff3b3b' });
        fx.shake(18);
        fx.flash(0.35, '#ff3b3b');
        fx.burst(x, y, 20, { kind: 'spark', colors: ['#ff3b3b', '#ffffff'], speed: 500, life: 0.4 });
        if (!demo) sound.gate('miss', 0);
        break;
      }
      const col = STAGES[stageIndexAt(game.d)].color;
      fx.ring(x, y, col, scene.L.shoeLen * (e.kind === 'perfect' ? 3.2 : 2.2), 0.45, 18);
      fx.burst(x, y, e.kind === 'perfect' ? 40 : 20, { kind: 'spark', colors: ['#ffffff', col, '#ffe14d'], speed: 900, life: 0.45, size: 10 });
      fx.burst(x, y, 14, { kind: 'glow', colors: [col, '#ffffff'], speed: 300, life: 0.5, size: 14 });
      fx.shake(e.kind === 'perfect' ? 9 + Math.min(e.combo, 20) * 0.5 : 5);
      fx.punch(e.kind === 'perfect' ? 0.06 : 0.03);
      if (e.kind === 'perfect') hitstop = 0.045;
      if (e.kind === 'perfect' && e.combo % 10 === 0) {
        banner(`${e.combo} COMBO!!!`, { color: '#ffffff', color2: '#ff5af0', life: 1.0, size: 0.9 });
        fx.flash(0.4, '#ffd3f5');
      }
      if (!demo) {
        const label = e.kind === 'perfect' ? 'PERFECT' : e.kind === 'great' ? 'GREAT' : 'GOOD';
        const cc = PUMP_COL[e.kind];
        fx.text(label, x, y - scene.L.shoeLen * 1.05, { size: e.kind === 'perfect' ? 36 : 28, color: cc[0], color2: cc[1], sub: `速さ ×${e.mult.toFixed(1)}`, life: 0.75 });
        sound.gate(e.kind, e.combo);
      }
      break;
    }
    case 'heal':
      fx.text('LIFE UP!', 70, safeTop + 70, { size: 24, color: '#ffb3c6', color2: '#ff4d6d' });
      if (!demo) sound.heal();
      break;
    case 'stage': {
      const st = STAGES[e.stage];
      if (st.banner) {
        banner(st.banner, { color: '#ffffff', color2: st.color, life: 1.7, size: 0.85 });
        fx.flash(st.id === 'clouds' ? 0.95 : 0.4, st.id === 'clouds' ? '#ffffff' : st.color);
        fx.shake(14);
        if (!demo) sound.stage();
      }
      if (e.stage >= 5) setMusicIntensity(3);
      break;
    }
    case 'milestone': {
      const m = MILESTONES[e.i];
      banner(m.text, { color: '#ffffff', color2: '#7df3ff', life: 1.0, size: 0.8 });
      if (m.v >= 2.998e8 && m.v < 3e9) {
        fx.flash(0.8, '#bfe0ff');
        if (!demo) sound.warp();
      } else if (!demo) sound.milestone();
      break;
    }
    case 'stall':
      banner('失速……', { color: '#ffffff', color2: '#8a93b8', life: 1.6, lines: false });
      if (!demo) sound.stall();
      setMusicIntensity(1);
      break;
    case 'finale':
      banner('宇宙の果てに到達！！！', { color: '#ffffff', color2: '#ff5af0', life: 3.5, size: 0.8 });
      if (!demo) sound.fanfare();
      break;
    case 'done':
      resultTimer = 0.9;
      break;
    default:
      break;
  }
}

// ===== 結果 =====
function showResult() {
  const rec = save.recordRun(game);
  lastRec = rec;
  resultReady = false;
  const f = formatDistance(game.d);
  $('res-title').textContent = `称号：${TITLES[game.stage]}`;
  $('res-stage').textContent = game.reason === 'end' ? '宇宙の果てまで飛んだ！！！' : `${STAGES[game.stage].name}まで飛んだ！`;
  $('res-newbest').hidden = !rec.newBest;
  drawStageIcon($('res-icon'), game.stage);
  const sp = formatSpeed(game.maxV);
  const cells = [
    ['チャージ', game.level >= 6 ? 'MAX' : game.level >= 3 ? `大車輪${game.level}` : `LV${game.level}`, game.level >= 6],
    ['発射', JUDGE_JA[game.releaseJudge] || '—', game.releaseJudge === 'perfect'],
    ['キック', JUDGE_JA[game.kickJudge] || '—', game.kickJudge === 'perfect'],
    ['PERFECT', `${game.gateStats.perfect}回`, game.gateStats.perfect >= 10],
    ['最大コンボ', `${game.maxCombo}`, game.maxCombo >= 10],
    ['最高速度', `${sp.num}${sp.unit}`, game.maxV >= 2.998e8],
  ];
  const grid = $('res-grid');
  grid.innerHTML = '';
  cells.forEach(([k, v, hot], i) => {
    const el = document.createElement('div');
    if (hot) el.className = 'hot';
    el.style.animationDelay = `${0.9 + i * 0.07}s`;
    el.append(k);
    const b = document.createElement('b');
    b.textContent = v;
    if (v.length > 7) b.style.fontSize = `${Math.max(10, 15 - (v.length - 7) * 1.1)}px`;
    el.appendChild(b);
    grid.appendChild(el);
  });
  const input = $('name-input');
  input.value = save.getData().name || '';
  input.disabled = false;
  $('save-btn').disabled = false;
  const rank = save.predictRank(game.d);
  $('save-msg').textContent = rank ? `ランキング ${rank}位 相当！ 名前を登録しよう` : '';
  show('result');
  setMusicIntensity(0);
  // 距離を対数で一気にカウントアップ
  const target = Math.max(0, game.d);
  const t0 = performance.now();
  const dur = 2.0;
  let lastUnit = '';
  let lastTick = 0;
  const numEl = $('res-num');
  const unitEl = $('res-unit');
  function tick(now) {
    const k = Math.min(1, (now - t0) / 1000 / dur);
    const e = 1 - Math.pow(1 - k, 3);
    const v = target > 1 ? Math.exp(Math.log(target) * e) : target * e;
    const ff = formatDistance(k >= 1 ? target : Math.min(v, target));
    numEl.textContent = ff.num;
    unitEl.textContent = ff.unit;
    if (ff.unit !== lastUnit) {
      lastUnit = ff.unit;
      const box = numEl.parentElement;
      box.classList.remove('pop');
      void box.offsetWidth;
      box.classList.add('pop');
    }
    if (now - lastTick > 50 && k < 1) {
      lastTick = now;
      sound.tick(Math.floor(e * 30));
    }
    if (k < 1) requestAnimationFrame(tick);
    else {
      numEl.textContent = f.num;
      unitEl.textContent = f.unit;
      resultReady = true;
      if (rec.newBest) sound.fanfare();
      else sound.result(game.stage >= 5);
      if (rec.unlocked.length === 1) toast(`新しい靴「${rec.unlocked[0].name}」を手に入れた！`, '靴選びで使えるよ');
      else if (rec.unlocked.length > 1) toast(`新しい靴を${rec.unlocked.length}足手に入れた！`, rec.unlocked.map((s) => s.name).join('・'));
    }
  }
  requestAnimationFrame(tick);
}

function drawStageIcon(c, stIndex) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const st = STAGES[stIndex];
  const cx = c.width / 2;
  g.globalCompositeOperation = 'lighter';
  drawGlow(g, st.color, cx, cx, cx, 0.8);
  g.globalCompositeOperation = 'source-over';
  const grd = g.createRadialGradient(cx * 0.8, cx * 0.75, 2, cx, cx, cx * 0.55);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.3, st.color);
  grd.addColorStop(1, rgba('#000000', 0.6));
  g.fillStyle = grd;
  g.beginPath();
  g.arc(cx, cx, cx * 0.5, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = INK;
  g.stroke();
  if (st.id === 'saturn') {
    g.strokeStyle = '#f5dc9a';
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(cx, cx, cx * 0.85, cx * 0.25, -0.3, 0, Math.PI * 2);
    g.stroke();
  }
}

function toast(text, sub) {
  sound.unlock();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  if (sub) {
    const s = document.createElement('small');
    s.textContent = sub;
    el.appendChild(s);
  }
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function saveResult() {
  if (savedName || !lastRec) return;
  savedName = true;
  const name = $('name-input').value.trim().slice(0, 8) || 'ななし';
  save.set('name', name);
  const rank = save.saveScore({ name, d: game.d, stage: game.stage, skin: save.getData().selected, date: save.today() });
  $('save-btn').disabled = true;
  $('name-input').disabled = true;
  $('save-msg').textContent = rank ? `${rank}位で登録しました！` : '登録しました（圏外）';
}

// ===== タイトル =====
function updateTitle() {
  const d = save.getData();
  if (d.best > 0) {
    $('title-best').textContent = distanceText(d.best);
    $('title-stage').textContent = `${STAGES[d.bestStage].name}まで到達・称号「${TITLES[d.bestStage]}」`;
  } else {
    $('title-best').textContent = '—';
    $('title-stage').textContent = 'まだ記録がありません';
  }
  $('title-skin-count').textContent = `${d.unlocked.length}/${SKINS.length}`;
}

// ===== 靴選び =====
function openSkins() {
  sound.click();
  skinIndex = Math.max(0, SKINS.findIndex((s) => s.id === save.getData().selected));
  show('skins');
  renderSkin();
}

function renderSkin() {
  const s = SKINS[skinIndex];
  const unlocked = save.getData().unlocked.includes(s.id);
  $('skin-index').textContent = `${skinIndex + 1} / ${SKINS.length}`;
  $('skin-name').textContent = unlocked ? s.name : '？？？';
  $('skin-desc').textContent = unlocked ? s.desc : 'まだ手に入れていない靴。もっと遠くまで飛ぶと手に入る。';
  $('skin-lock').hidden = unlocked;
  $('skin-cond').textContent = `「${STAGES[s.unlock].name}」まで飛ぶと解放`;
  const ok = $('skin-ok');
  ok.disabled = !unlocked;
  ok.textContent = save.getData().selected === s.id ? '使用中' : 'この靴にする';
}

function changeSkin(d) {
  sound.click();
  skinIndex = (skinIndex + d + SKINS.length) % SKINS.length;
  renderSkin();
}

const skinCanvas = $('skin-canvas');
const sg = skinCanvas.getContext('2d');
const skinParts = [];
function drawSkinPreview(t, dt) {
  const s = SKINS[skinIndex];
  const unlocked = save.getData().unlocked.includes(s.id);
  const w = skinCanvas.width;
  const h = skinCanvas.height;
  sg.clearRect(0, 0, w, h);
  const cx = w * 0.56;
  const cy = h * 0.5;
  if (unlocked) {
    for (let i = 0; i < 3; i++) {
      skinParts.push({ x: cx - 40, y: cy + (Math.random() - 0.5) * 40, vx: -260 - Math.random() * 200, vy: (Math.random() - 0.5) * 40, life: 0.7, age: 0, c: s.trail[Math.floor(Math.random() * s.trail.length)], r: 14 + Math.random() * 14 });
    }
    sg.globalCompositeOperation = 'lighter';
    for (const p of skinParts) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      drawGlow(sg, p.c, p.x, p.y, Math.max(0.1, p.r * (1 - p.age / p.life)), Math.max(0, 1 - p.age / p.life));
    }
    drawGlow(sg, s.trail[1], cx, cy, 110, 0.6);
    sg.globalCompositeOperation = 'source-over';
  }
  for (let i = skinParts.length - 1; i >= 0; i--) if (skinParts[i].age >= skinParts[i].life) skinParts.splice(i, 1);
  sg.save();
  sg.translate(cx, cy + Math.sin(t * 2) * 6);
  sg.rotate(Math.sin(t * 1.3) * 0.25);
  if (!unlocked) sg.filter = 'brightness(0)';
  drawShoe(sg, s, 170);
  sg.restore();
  sg.filter = 'none';
}

// ===== 記録 =====
function showRanking() {
  sound.click();
  const list = $('ranking-list');
  list.innerHTML = '';
  const d = save.getData();
  if (!d.ranking.length) {
    const li = document.createElement('li');
    li.className = 'empty-row';
    li.textContent = 'まだ記録がありません。飛ばして名前を登録しよう！';
    list.appendChild(li);
  }
  d.ranking.forEach((e, i) => {
    const li = document.createElement('li');
    const rk = document.createElement('span');
    rk.className = 'rk';
    rk.textContent = String(i + 1);
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = e.name;
    const sm = document.createElement('small');
    sm.textContent = `${STAGES[e.stage]?.name || ''}・${e.date}`;
    nm.appendChild(sm);
    const sc = document.createElement('span');
    sc.className = 'sc';
    sc.textContent = distanceText(e.d);
    li.append(rk, nm, sc);
    list.appendChild(li);
  });
  const recs = [
    ['自己ベスト', d.best > 0 ? distanceText(d.best) : '—'],
    ['最遠ステージ', STAGES[d.bestStage].name],
    ['プレイ回数', `${d.stats.plays}回`],
    ['最大コンボ', `${d.stats.maxCombo}`],
  ];
  $('records').innerHTML = '';
  for (const [k, v] of recs) {
    const el = document.createElement('div');
    el.textContent = k;
    const b = document.createElement('b');
    b.textContent = v;
    el.appendChild(b);
    $('records').appendChild(el);
  }
  show('ranking');
}

// ===== シェア =====
async function share() {
  sound.click();
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1350;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, '#0a0d24');
  grd.addColorStop(0.6, '#2a1050');
  grd.addColorStop(1, '#ff5a3c');
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`;
    g.beginPath();
    g.arc(Math.random() * c.width, Math.random() * c.height * 0.8, Math.random() * 2.4, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'lighter';
  drawGlow(g, STAGES[game.stage].color, 540, 640, 420, 0.7);
  g.globalCompositeOperation = 'source-over';
  fx.outlined(g, '超ブランコ靴飛ばし', 540, 150, 92, '#ffffff', '#ffd23f', 26);
  g.font = `900 46px ${UI_FONT}`;
  g.textAlign = 'center';
  g.fillStyle = '#7df3ff';
  g.fillText('到達距離', 540, 420);
  const f = formatDistance(game.d);
  const size = f.num.length > 7 ? 150 : 190;
  fx.outlined(g, f.num, 540, 590, size, '#ffffff', '#ffe27a', 30);
  fx.outlined(g, f.unit, 540, 760, 96, '#ffe27a', '#ff9a2e', 22);
  g.save();
  g.translate(760, 1040);
  g.rotate(-0.3);
  drawShoe(g, skin(), 300);
  g.restore();
  g.font = `900 52px ${UI_FONT}`;
  g.fillStyle = '#ffffff';
  g.textAlign = 'left';
  g.fillText(`${STAGES[game.stage].name}まで`, 80, 960);
  g.fillText('飛んだ！', 80, 1030);
  g.font = `900 36px ${UI_FONT}`;
  g.fillStyle = '#ffe14d';
  g.fillText(`称号「${TITLES[game.stage]}」`, 80, 1110);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = `800 30px ${UI_FONT}`;
  const ms = formatSpeed(game.maxV);
  g.fillText(`最大コンボ ${game.maxCombo} ／ 最高速度 ${ms.num}${ms.unit}`, 80, 1260);

  const text = `超ブランコ靴飛ばしで靴を${distanceText(game.d)}飛ばした！（${STAGES[game.stage].name}まで到達）`;
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = blob ? new File([blob], 'shoe-kick.png', { type: 'image/png' }) : null;
  try {
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return;
    }
  } catch {
    // 共有できない → 画像を表示
  }
  const url = c.toDataURL('image/png');
  $('share-img').src = url;
  $('share-download').href = url;
  show('share');
}

// ===== ボタン =====
$('btn-start').addEventListener('click', startGame);
$('btn-skins').addEventListener('click', openSkins);
$('btn-ranking').addEventListener('click', showRanking);
$('btn-howto').addEventListener('click', () => {
  sound.click();
  returnTo = 'title';
  show('howto');
});
for (const el of document.querySelectorAll('[data-back]')) {
  el.addEventListener('click', () => {
    sound.click();
    if (mode === 'howto' && returnTo === 'game') {
      returnTo = 'title';
      startGame();
      return;
    }
    goTitle();
  });
}
$('skin-prev').addEventListener('click', () => changeSkin(-1));
$('skin-next').addEventListener('click', () => changeSkin(1));
$('skin-ok').addEventListener('click', () => {
  const s = SKINS[skinIndex];
  if (!save.getData().unlocked.includes(s.id)) return;
  save.set('selected', s.id);
  sound.unlock();
  renderSkin();
  setTimeout(goTitle, 250);
});
$('save-btn').addEventListener('click', saveResult);
$('name-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveResult();
});
$('retry-btn').addEventListener('click', startGame);
$('title-btn').addEventListener('click', () => {
  sound.click();
  goTitle();
});
$('share-btn').addEventListener('click', share);
$('share-close').addEventListener('click', () => {
  sound.click();
  show('result');
});
$('btn-sound').addEventListener('click', (e) => {
  e.stopPropagation();
  initAudio();
  const on = !save.getData().settings.sound;
  save.setSetting('sound', on);
  applySound();
  if (on) sound.click();
});
function applySound() {
  const on = save.getData().settings.sound;
  setSound(on);
  setMusic(on);
  $('btn-sound').classList.toggle('muted', !on);
}

// ===== ループ =====
let lastTime = null;
let acc = 0;
const frameTimes = [];
let perfT = 0;
let freeze = false;

function frame(now) {
  requestAnimationFrame(frame);
  if (lastTime === null) lastTime = now;
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  const t = now / 1000;

  // 重い端末では解像度を下げる
  frameTimes.push(dt);
  if (frameTimes.length > 90) frameTimes.shift();
  perfT += dt;
  if (perfT > 3 && frameTimes.length >= 90) {
    perfT = 0;
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    if (avg > 0.024 && dprCap > 1) {
      dprCap = Math.max(1, dprCap - 0.5);
      resize();
    }
  }

  const demo = mode === 'title' || mode === 'howto' || mode === 'ranking' || mode === 'skins';
  const active = (mode === 'game' || demo || mode === 'result' || mode === 'share') && !freeze;

  // 時間の流れ
  let scale = 1;
  if (hitstop > 0) {
    hitstop -= dt;
    scale = 0.03;
  } else if (game.phase === 'release') {
    scale = 0.45; // 発射前はスロー
  } else if (game.phase === 'stall') {
    scale = 0.6;
  }

  if (active) {
    acc += dt * scale * SLOW;
    let n = 0;
    while (acc >= DT && n < 40) {
      let tapped = false;
      if (bot && (demo || AUTOPLAY)) tapped = botTap(bot, game);
      else if (mode === 'game') tapped = tapQueued;
      tapQueued = false;
      step(game, tapped);
      for (const e of game.events) handle(e, demo);
      game.events.length = 0;
      acc -= DT;
      n++;
      // タイトルのデモはチャージだけを繰り返す
      if (demo && (game.phase === 'release' || game.phase === 'launch')) {
        newRun(true);
        break;
      }
    }
  }
  tapQueued = false;

  if (deferred.length && game.phase !== 'launch') {
    deferT -= dt;
    if (deferT <= 0) {
      fx.showBanner(...deferred.shift());
      deferT = 0.8;
    }
  }
  if (resultTimer > 0 && mode === 'game') {
    resultTimer -= dt;
    if (resultTimer <= 0) showResult();
  }

  // 音
  const charging = game.phase === 'charge' || game.phase === 'release' || game.phase === 'ready';
  setHum(Math.abs(game.swing.omega), charging && !demo && mode === 'game');
  setWind(mode === 'game' && !charging ? Math.min(1, Math.log10(Math.max(1, game.v)) / 8) : 0);

  // 明るい空のあいだは加算合成をやめる
  fx.bright = game.d < 12000;
  // 描画
  if (!freeze) {
    scene.update(dt * (hitstop > 0 ? 0.1 : 1), game, skin());
    fx.update(dt * (hitstop > 0 ? 0.15 : 1));
  }
  const cam = fx.cam;
  ctx.save();
  const sk = cam.shake;
  const z = 1 + cam.punch;
  ctx.translate(W / 2 + (Math.random() - 0.5) * sk, H / 2 + (Math.random() - 0.5) * sk);
  ctx.scale(z, z);
  ctx.rotate((Math.random() - 0.5) * sk * 0.0015);
  ctx.translate(-W / 2, -H / 2);
  scene.draw(ctx, game, skin(), demo ? 'demo' : 'game');
  ctx.restore();
  fx.drawTexts(ctx, W);
  if (mode === 'game') hud.draw(ctx, W, H, game, t, dt, 'game', safeTop);
  fx.drawBanner(ctx, W, H);
  fx.drawFlash(ctx, W, H);
  // 発射前のスローでは周りを暗く
  if (game.phase === 'release' && mode === 'game') {
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
  if (mode === 'skins') drawSkinPreview(t, dt);
}

// ===== 起動 =====
async function boot() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('40px "Dela Gothic One"'), document.fonts.load('900 40px "M PLUS Rounded 1c"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    // フォントがなくても続ける
  }
  resize();
  applySound();
  window.__booted = true;
  goTitle();
  requestAnimationFrame(frame);
  if (AUTOPLAY) startGame();
}

// 確認用（コンソールから触れる）
window.__sk = {
  get game() {
    return game;
  },
  get mode() {
    return mode;
  },
  set freeze(v) {
    freeze = v;
  },
  startGame,
  goTitle,
  save,
  perfectMult,
  CFG,
};

boot().catch((err) => {
  console.error(err);
  screens.loading.querySelector('p').textContent = '読み込みに失敗しました。再読み込みしてください。';
});
