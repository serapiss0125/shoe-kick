// 効果音と BGM（すべて Web Audio で合成）
let ctx = null;
let master = null;
let sfx = null;
let music = null;
let noiseBuf = null;
let soundOn = true;
let musicOn = true;
// チャージのうなり
let hum = null;
// 風
let wind = null;

const PENTA = [0, 2, 4, 7, 9];

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 5;
  master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(comp).connect(ctx.destination);
  sfx = ctx.createGain();
  sfx.gain.value = soundOn ? 1 : 0;
  sfx.connect(master);
  music = ctx.createGain();
  music.gain.value = musicOn ? 0.3 : 0;
  music.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // チャージのうなり（のこぎり波×2 を低域フィルタで）
  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  o1.type = 'sawtooth';
  o2.type = 'sawtooth';
  o2.detune.value = 14;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 400;
  f.Q.value = 6;
  const gn = ctx.createGain();
  gn.gain.value = 0;
  o1.connect(f);
  o2.connect(f);
  f.connect(gn).connect(sfx);
  o1.start();
  o2.start();
  hum = { o1, o2, f, gn };

  const ws = ctx.createBufferSource();
  ws.buffer = noiseBuf;
  ws.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = 'bandpass';
  wf.frequency.value = 600;
  wf.Q.value = 0.8;
  const wg = ctx.createGain();
  wg.gain.value = 0;
  ws.connect(wf).connect(wg).connect(sfx);
  ws.start();
  wind = { wf, wg };

  startMusic();
}

export function setSound(on) {
  soundOn = on;
  if (sfx) sfx.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05);
}
export function setMusic(on) {
  musicOn = on;
  if (music) music.gain.setTargetAtTime(on ? 0.3 : 0, ctx.currentTime, 0.1);
}

function now() {
  return ctx ? ctx.currentTime : 0;
}
function midi(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}
function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone({ type = 'sine', f0, f1 = f0, t = now(), a = 0.005, d = 0.2, vol = 0.2, dest = sfx, glide = d, detune = 0 }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + glide);
  env(g, t, a, vol, d);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + a + d + 0.05);
}
function noise({ t = now(), d = 0.2, vol = 0.2, type = 'lowpass', f0 = 1000, f1 = f0, q = 1, a = 0.005, dest = sfx }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
  flt.Q.value = q;
  const g = ctx.createGain();
  env(g, t, a, vol, d);
  src.connect(flt).connect(g).connect(dest);
  src.start(t, Math.random() * 1.5);
  src.stop(t + a + d + 0.05);
}
function chord(notes, { t = now(), d = 0.6, vol = 0.08, type = 'sawtooth' } = {}) {
  for (const n of notes) {
    tone({ type, f0: midi(n), t, d, vol, a: 0.02, detune: -8 });
    tone({ type, f0: midi(n), t, d, vol: vol * 0.7, a: 0.02, detune: 9 });
  }
}

const raw = {
  click() {
    tone({ type: 'triangle', f0: 880, f1: 1320, d: 0.06, vol: 0.12 });
  },
  start() {
    chord([60, 64, 67], { d: 0.3, vol: 0.05 });
    tone({ type: 'square', f0: midi(72), f1: midi(84), d: 0.2, vol: 0.08, glide: 0.15 });
  },
  pump(kind, level) {
    const t = now();
    const base = 60 + level * 2;
    if (kind === 'miss') {
      tone({ type: 'square', f0: 180, f1: 90, d: 0.16, vol: 0.08, t });
      return;
    }
    const n = base + (kind === 'perfect' ? 12 : kind === 'great' ? 7 : 4);
    tone({ type: 'sine', f0: 120, f1: 40, d: 0.2, vol: 0.55, t }); // ドン
    noise({ type: 'highpass', f0: 3000, d: 0.05, vol: 0.18, t });
    tone({ type: 'triangle', f0: midi(n), d: 0.3, vol: 0.16, t: t + 0.01 });
    if (kind === 'perfect') {
      tone({ type: 'square', f0: midi(n + 12), d: 0.15, vol: 0.05, t: t + 0.04 });
      noise({ type: 'bandpass', f0: 6000, q: 3, d: 0.25, vol: 0.08, t });
    }
  },
  level(lv) {
    const t = now();
    const root = 60 + lv * 2;
    [0, 4, 7, 12, 16].forEach((k, i) => tone({ type: 'square', f0: midi(root + k), d: 0.18, vol: 0.06, t: t + i * 0.045 }));
    noise({ type: 'bandpass', f0: 500, f1: 4000, q: 1, d: 0.4, vol: 0.12, t });
  },
  loopStart() {
    const t = now();
    tone({ type: 'sine', f0: 60, f1: 30, d: 0.8, vol: 0.7, t });
    noise({ type: 'lowpass', f0: 3000, f1: 200, d: 1.0, vol: 0.4, t });
    chord([55, 62, 67, 74], { t, d: 1.2, vol: 0.06 });
    chord([60, 67, 72, 79], { t: t + 0.25, d: 1.4, vol: 0.06 });
  },
  max() {
    const t = now();
    for (let i = 0; i < 3; i++) noise({ type: 'bandpass', f0: 2000 + i * 1500, q: 2, d: 0.5, vol: 0.2, t: t + i * 0.08 });
    chord([62, 69, 74, 78, 81], { t, d: 1.6, vol: 0.07 });
    tone({ type: 'sine', f0: 50, f1: 25, d: 1.2, vol: 0.8, t });
  },
  zap() {
    noise({ type: 'highpass', f0: 2500, d: 0.08, vol: 0.12 });
    tone({ type: 'sawtooth', f0: 900, f1: 120, d: 0.1, vol: 0.05 });
  },
  timeup() {
    const t = now();
    tone({ type: 'square', f0: midi(84), d: 0.08, vol: 0.08, t });
    tone({ type: 'square', f0: midi(91), d: 0.25, vol: 0.08, t: t + 0.09 });
  },
  release(kind) {
    const t = now();
    tone({ type: 'sine', f0: 90, f1: 28, d: 0.9, vol: 0.9, t });
    noise({ type: 'lowpass', f0: 5000, f1: 120, d: 1.1, vol: 0.55, t });
    noise({ type: 'bandpass', f0: 300, f1: 5000, q: 0.7, d: 0.6, vol: 0.25, t: t + 0.05 });
    if (kind === 'perfect') chord([67, 71, 74, 79, 83], { t: t + 0.05, d: 0.8, vol: 0.06, type: 'square' });
  },
  kick(kind) {
    const t = now();
    tone({ type: 'sine', f0: 160, f1: 35, d: 0.4, vol: 0.8, t });
    noise({ type: 'highpass', f0: 1800, d: 0.08, vol: 0.4, t });
    noise({ type: 'bandpass', f0: 700, f1: 6000, q: 0.8, d: 0.7, vol: 0.25, t: t + 0.02 });
    if (kind === 'perfect') [79, 84, 88, 91, 96].forEach((n, i) => tone({ type: 'triangle', f0: midi(n), d: 0.3, vol: 0.1, t: t + 0.05 + i * 0.04 }));
  },
  gate(kind, combo) {
    const t = now();
    if (kind === 'miss') {
      tone({ type: 'sawtooth', f0: 220, f1: 55, d: 0.35, vol: 0.12, t });
      noise({ type: 'lowpass', f0: 800, d: 0.3, vol: 0.3, t });
      return;
    }
    const k = Math.min(combo - 1, 19);
    const n = 64 + PENTA[k % 5] + 12 * Math.floor(k / 5);
    tone({ type: 'sine', f0: 140, f1: 45, d: 0.18, vol: 0.5, t });
    noise({ type: 'bandpass', f0: 1200, f1: 7000, q: 0.8, d: 0.25, vol: 0.18, t });
    tone({ type: 'square', f0: midi(n), d: 0.18, vol: kind === 'perfect' ? 0.08 : 0.05, t });
    tone({ type: 'triangle', f0: midi(n + 12), d: 0.3, vol: kind === 'perfect' ? 0.1 : 0.05, t: t + 0.02 });
    if (kind === 'perfect') tone({ type: 'sine', f0: midi(n + 19), d: 0.35, vol: 0.05, t: t + 0.05 });
  },
  heal() {
    const t = now();
    [72, 76, 79, 84].forEach((n, i) => tone({ type: 'sine', f0: midi(n), d: 0.25, vol: 0.1, t: t + i * 0.06 }));
  },
  stage() {
    const t = now();
    chord([60, 64, 67, 72], { t, d: 0.9, vol: 0.06, type: 'square' });
    chord([65, 69, 72, 77], { t: t + 0.16, d: 1.0, vol: 0.06, type: 'square' });
    noise({ type: 'bandpass', f0: 300, f1: 8000, q: 0.6, d: 0.8, vol: 0.18, t });
  },
  milestone() {
    const t = now();
    noise({ type: 'bandpass', f0: 200, f1: 6000, q: 0.5, d: 0.6, vol: 0.3, t });
    tone({ type: 'sawtooth', f0: 200, f1: 1600, d: 0.5, vol: 0.06, t, glide: 0.4 });
  },
  warp() {
    const t = now();
    tone({ type: 'sawtooth', f0: 80, f1: 2400, d: 1.2, vol: 0.12, t, glide: 1.0 });
    noise({ type: 'bandpass', f0: 200, f1: 9000, q: 0.5, d: 1.3, vol: 0.35, t });
  },
  stall() {
    const t = now();
    tone({ type: 'sawtooth', f0: 600, f1: 80, d: 1.4, vol: 0.08, t, glide: 1.3 });
  },
  result(big) {
    const t = now();
    const seq = big ? [72, 76, 79, 84, 88] : [72, 76, 79];
    seq.forEach((n, i) => tone({ type: 'triangle', f0: midi(n), d: 0.35, vol: 0.12, t: t + i * 0.08 }));
  },
  fanfare() {
    const t = now();
    const notes = [
      [72, 0, 0.12],
      [72, 0.13, 0.12],
      [72, 0.26, 0.12],
      [76, 0.39, 0.3],
      [74, 0.7, 0.12],
      [77, 0.83, 0.12],
      [79, 0.96, 0.7],
    ];
    for (const [n, dt, d] of notes) {
      tone({ type: 'square', f0: midi(n), d, vol: 0.07, t: t + dt });
      tone({ type: 'triangle', f0: midi(n - 12), d, vol: 0.12, t: t + dt });
    }
    chord([67, 72, 76, 79], { t: t + 0.96, d: 1.2, vol: 0.05 });
  },
  tick(i = 0) {
    tone({ type: 'square', f0: 1000 + i * 30, d: 0.02, vol: 0.035 });
  },
  unlock() {
    const t = now();
    [79, 84, 88, 91, 96].forEach((n, i) => tone({ type: 'triangle', f0: midi(n), d: 0.4, vol: 0.1, t: t + i * 0.06 }));
  },
};

// 準備前・音オフのときは何もしない
export const sound = {};
for (const k of Object.keys(raw)) {
  sound[k] = (...args) => {
    if (!ctx || !soundOn) return;
    try {
      raw[k](...args);
    } catch {
      // 音が鳴らなくても続ける
    }
  };
}

// チャージのうなり：omega（回転の速さ）に応じて音程が上がる
export function setHum(omega, on) {
  if (!hum) return;
  const t = ctx.currentTime;
  const v = Math.min(1, omega / 17);
  hum.o1.frequency.setTargetAtTime(45 + v * 160, t, 0.08);
  hum.o2.frequency.setTargetAtTime(45 * 1.5 + v * 240, t, 0.08);
  hum.f.frequency.setTargetAtTime(200 + v * 2600, t, 0.08);
  hum.gn.gain.setTargetAtTime(on ? 0.03 + v * v * 0.12 : 0, t, 0.1);
}

export function setWind(level) {
  if (!wind) return;
  const t = ctx.currentTime;
  const v = Math.max(0, Math.min(1, level));
  wind.wg.gain.setTargetAtTime(v * 0.28, t, 0.15);
  wind.wf.frequency.setTargetAtTime(300 + v * 2200, t, 0.15);
}

// ===== BGM =====
const BPM = 150;
const STEP = 60 / BPM / 4;
const PROG = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];
const LEAD = [
  [76, null, 76, 79, null, 81, null, 79, 76, null, 74, null, 72, null, 74, null],
  [72, null, 72, 74, null, 76, null, 77, 76, null, 74, null, 72, null, null, null],
  [76, null, 79, null, 84, null, 83, null, 81, null, 79, null, 76, null, 79, null],
  [81, null, 79, null, 76, null, 74, null, 79, null, null, 81, 83, null, 86, null],
];
let nextTime = 0;
let stepI = 0;
let intensity = 0; // 0 静か / 1 チャージ / 2 飛行 / 3 最高潮

export function setMusicIntensity(v) {
  intensity = v;
}

function startMusic() {
  nextTime = ctx.currentTime + 0.1;
  setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    while (nextTime < ctx.currentTime + 0.12) {
      playStep(stepI, nextTime);
      nextTime += STEP;
      stepI = (stepI + 1) % 64;
    }
  }, 25);
}

function playStep(i, t) {
  if (!musicOn) return;
  const bar = Math.floor(i / 16) % 4;
  const s = i % 16;
  const ch = PROG[bar];
  const lv = intensity;
  // ベース（8分）
  if (s % 2 === 0 && lv >= 1) {
    const n = ch[0] - 12 + (s % 8 === 6 ? 12 : 0);
    tone({ type: 'sawtooth', f0: midi(n), t, d: STEP * 1.6, vol: 0.09, dest: music, a: 0.005 });
  } else if (lv < 1 && s % 8 === 0) {
    tone({ type: 'triangle', f0: midi(ch[0] - 12), t, d: STEP * 6, vol: 0.2, dest: music, a: 0.01 });
  }
  // キック・スネア・ハイハット
  if (lv >= 1 && s % 4 === 0) tone({ type: 'sine', f0: 150, f1: 40, t, d: 0.16, vol: 0.55, dest: music });
  if (lv >= 2 && (s === 4 || s === 12)) noise({ type: 'bandpass', f0: 1800, q: 0.7, t, d: 0.12, vol: 0.3, dest: music });
  if (lv >= 1 && s % 2 === 1) noise({ type: 'highpass', f0: 8000, t, d: 0.03, vol: 0.07 + lv * 0.02, dest: music });
  if (lv >= 3 && s % 2 === 0) noise({ type: 'highpass', f0: 9000, t, d: 0.02, vol: 0.06, dest: music });
  // 和音
  if (s === 0 || (lv >= 2 && s === 8)) {
    for (const n of ch) tone({ type: lv >= 2 ? 'sawtooth' : 'sine', f0: midi(n + 12), t, d: STEP * 7, vol: lv >= 2 ? 0.025 : 0.05, dest: music, a: 0.02 });
  }
  // メロディ
  if (lv >= 2) {
    const m = LEAD[bar][s];
    if (m) {
      tone({ type: 'square', f0: midi(m), t, d: STEP * 1.5, vol: 0.045, dest: music });
      if (lv >= 3) tone({ type: 'square', f0: midi(m + 12), t, d: STEP * 1.2, vol: 0.02, dest: music });
    }
  } else if (lv < 1 && s % 4 === 2) {
    tone({ type: 'triangle', f0: midi(ch[(s / 4) % 3 | 0] + 24), t, d: STEP * 2, vol: 0.04, dest: music });
  }
}
