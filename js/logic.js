// ゲームの中身（描画とは無関係。固定ステップで step を呼ぶ）
// 流れ：ready → charge（こぐ15秒）→ release（離す）→ launch（人が飛ぶ・キック）→ flight（ブースト）→ stall → done
import { stageIndexAt, MILESTONES, END_DISTANCE } from './stages.js';

export const DT = 1 / 120;

export const CFG = {
  // ブランコ（角度 θ：0 = 真下、正 = 前へ。ω：角速度）
  G_L: 9, // 重力 / 鎖の長さ
  DAMP: 0.03,
  THETA0: 0.35,
  CHARGE_TIME: 15,
  RELEASE_TIME: 5,
  // こぐタイミング：真下を通る瞬間からのずれ（秒）と、増える勢い
  PUMP: [
    { kind: 'perfect', win: 0.07, add: 1.05 },
    { kind: 'great', win: 0.13, add: 0.75 },
    { kind: 'good', win: 0.21, add: 0.45 },
  ],
  MISS_KEEP: 0.93,
  OMEGA_MAX: 17,
  LEVELS: [0, 2.6, 4.4, 6.0, 9.0, 12.0, 15.0], // 真下での角速度で決まる LV（6.0 = 大車輪）
  // 離すタイミング（狙いの角度を通る瞬間からのずれ）
  RELEASE: [
    { kind: 'perfect', win: 0.05, mult: 1.6 },
    { kind: 'great', win: 0.1, mult: 1.3 },
    { kind: 'good', win: 0.18, mult: 1.0 },
  ],
  RELEASE_BAD: 0.6,
  RELEASE_ANGLE: Math.PI / 4,
  // キック
  KICK_APPEAR: 0.35, // 飛び出してから輪が出るまで
  KICK_SHRINK: 1.0, // 輪が縮みきるまで
  KICK: [
    { kind: 'perfect', win: 0.06, mult: 2.2 },
    { kind: 'great', win: 0.12, mult: 1.7 },
    { kind: 'good', win: 0.2, mult: 1.3 },
  ],
  KICK_LATE: 0.9,
  // 飛行
  FIRST_GATE: 1.1,
  DRAG: 0.22,
  HEARTS: 3,
  GATE: [
    { kind: 'perfect', win: 0.042 },
    { kind: 'great', win: 0.085 },
    { kind: 'good', win: 0.14 },
  ],
  GREAT_MULT: 1.4,
  GOOD_MULT: 1.12,
  MISS_MULT: 0.45,
  HEAL_EVERY: 15,
  STALL_TIME: 2.2,
};

export function launchSpeed(omegaB) {
  return 1.6 * omegaB * omegaB;
}

export function perfectMult(combo, chargeBonus) {
  return Math.min(3.4, 1.8 + 0.1 * combo) * chargeBonus;
}

// ゲートが迫ってくる時間（だんだん速くなる）
export function gateApproach(i) {
  return Math.max(0.44, 0.95 - 0.012 * i);
}

function wrap(a) {
  const t = Math.PI * 2;
  return ((((a + Math.PI) % t) + t) % t) - Math.PI;
}

export function createGame() {
  return {
    phase: 'ready',
    t: 0, // フェーズ内の時間
    total: 0,
    swing: { theta: CFG.THETA0, omega: 0, crossings: 0, tapped: -1, loops: 0, loopAngle: 0 },
    omegaB: 0,
    level: 0,
    looping: false,
    pumps: { perfect: 0, great: 0, good: 0, miss: 0 },
    releaseJudge: null,
    kickJudge: null,
    // 人と靴（launch 中の見た目用：0〜1 の進み）
    kickT: 0,
    v: 0,
    d: 0,
    maxV: 0,
    hearts: CFG.HEARTS,
    combo: 0,
    maxCombo: 0,
    gates: [], // { i, appear, hit, judged }
    gateIndex: 0,
    nextGateAt: 0,
    gateStats: { perfect: 0, great: 0, good: 0, miss: 0 },
    stage: 0,
    milestone: 0,
    chargeBonus: 1,
    finished: false,
    reason: null,
    events: [],
  };
}

function emit(g, type, data = {}) {
  g.events.push({ type, ...data });
}

function bottomSpeed(sw) {
  return Math.sqrt(sw.omega * sw.omega + 2 * CFG.G_L * (1 - Math.cos(sw.theta)));
}

function levelOf(ob) {
  let lv = 0;
  for (let i = 0; i < CFG.LEVELS.length; i++) if (ob >= CFG.LEVELS[i]) lv = i;
  return lv; // 0〜6（6 = MAX）
}

export function amplitude(g) {
  const sw = g.swing;
  const e = (sw.omega * sw.omega) / (2 * CFG.G_L) + (1 - Math.cos(sw.theta));
  if (e >= 2) return Math.PI;
  return Math.acos(1 - e);
}

function stepSwing(g, damp) {
  const sw = g.swing;
  const prev = wrap(sw.theta);
  sw.omega += (-CFG.G_L * Math.sin(sw.theta) - damp * sw.omega) * DT;
  sw.theta += sw.omega * DT;
  const cur = wrap(sw.theta);
  // 真下を通過（てっぺんでの折り返しは除く）
  if (Math.sign(prev) !== Math.sign(cur) && Math.abs(prev) < Math.PI / 2 && Math.abs(cur) < Math.PI / 2) {
    sw.crossings += 1;
  }
  // 一回転したか
  if (g.looping) {
    sw.loopAngle += Math.abs(sw.omega * DT);
    if (sw.loopAngle >= Math.PI * 2) {
      sw.loopAngle -= Math.PI * 2;
      sw.loops += 1;
      emit(g, 'loop', { n: sw.loops });
    }
  }
}

function judge(table, err, scale = 1) {
  const a = Math.abs(err);
  for (const row of table) if (a <= row.win * scale) return row;
  return null;
}

// 最初のうちはゲートの判定をやさしく（だんだん本気に）
export function gateWindowScale(i) {
  return 1 + 0.75 * Math.max(0, 1 - i / 16);
}

// こぐ：真下に一番近い通過との時間差で判定
function pump(g) {
  const sw = g.swing;
  const th = wrap(sw.theta);
  const w = Math.abs(sw.omega) || 0.001;
  const approaching = th * sw.omega < 0;
  const target = approaching ? sw.crossings + 1 : sw.crossings;
  if (target === sw.tapped) return; // 1回の通過につき1回だけ
  sw.tapped = target;
  const err = Math.abs(th) / w;
  const row = Math.abs(th) < Math.PI / 2 ? judge(CFG.PUMP, err) : null;
  if (row) {
    const dir = Math.sign(sw.omega) || 1;
    sw.omega += dir * row.add;
    g.pumps[row.kind] += 1;
    emit(g, 'pump', { kind: row.kind, err });
  } else {
    sw.omega *= CFG.MISS_KEEP;
    g.pumps.miss += 1;
    emit(g, 'pump', { kind: 'miss', err });
  }
  // 上限
  const ob = bottomSpeed(sw);
  if (ob > CFG.OMEGA_MAX) sw.omega *= CFG.OMEGA_MAX / ob;
}

function updateLevel(g) {
  g.omegaB = bottomSpeed(g.swing);
  const lv = levelOf(g.omegaB);
  if (lv > g.level) {
    g.level = lv;
    emit(g, 'level', { level: lv });
  }
  if (!g.looping && g.omegaB >= 2 * Math.sqrt(CFG.G_L) + 0.05) {
    g.looping = true;
    g.swing.loopAngle = 0;
    emit(g, 'loopStart');
  }
}

// 離す：狙いの角度を「前向きに」通る瞬間との時間差
export function releaseTarget(g) {
  const amp = amplitude(g);
  return Math.min(CFG.RELEASE_ANGLE, amp * 0.8);
}

function release(g) {
  const sw = g.swing;
  const target = releaseTarget(g);
  let row = null;
  if (sw.omega > 0) {
    const err = wrap(sw.theta - target) / sw.omega;
    row = judge(CFG.RELEASE, err);
  }
  g.releaseJudge = row ? row.kind : 'bad';
  const mult = row ? row.mult : CFG.RELEASE_BAD;
  g.v = launchSpeed(g.omegaB) * mult;
  g.chargeBonus = 1 + 0.025 * Math.max(0, g.omegaB - 6);
  g.phase = 'launch';
  g.t = 0;
  emit(g, 'release', { kind: g.releaseJudge, v: g.v, theta: sw.theta, omega: sw.omega });
}

function kick(g, late) {
  let row = null;
  if (!late) {
    const err = g.t - (CFG.KICK_APPEAR + CFG.KICK_SHRINK);
    row = judge(CFG.KICK, err);
  }
  g.kickJudge = row ? row.kind : late ? 'late' : 'early';
  g.v *= row ? row.mult : CFG.KICK_LATE;
  g.phase = 'flight';
  g.t = 0;
  g.nextGateAt = CFG.FIRST_GATE;
  emit(g, 'kick', { kind: g.kickJudge, v: g.v });
}

function spawnGates(g) {
  // 次のゲートを予約（appear = 見え始め、hit = ちょうど重なる時刻）
  while (g.gates.length < 2 && g.t + 3 > g.nextGateAt) {
    const i = g.gateIndex++;
    const ap = gateApproach(i);
    g.gates.push({ i, appear: g.nextGateAt, hit: g.nextGateAt + ap, approach: ap, judged: false });
    g.nextGateAt += ap + Math.max(0.18, 0.4 - i * 0.006);
  }
}

function hitGate(g, gate, kind) {
  gate.judged = true;
  gate.kind = kind;
  if (kind === 'miss') {
    g.v *= CFG.MISS_MULT;
    g.hearts -= 1;
    g.combo = 0;
    g.gateStats.miss += 1;
    emit(g, 'gate', { kind, mult: CFG.MISS_MULT, hearts: g.hearts, i: gate.i });
    if (g.hearts <= 0) {
      g.phase = 'stall';
      g.t = 0;
      emit(g, 'stall');
    }
    return;
  }
  g.combo += 1;
  g.maxCombo = Math.max(g.maxCombo, g.combo);
  g.gateStats[kind] += 1;
  const mult = kind === 'perfect' ? perfectMult(g.combo - 1, g.chargeBonus) : kind === 'great' ? CFG.GREAT_MULT : CFG.GOOD_MULT;
  g.v *= mult;
  emit(g, 'gate', { kind, mult, combo: g.combo, i: gate.i });
  if (g.combo % CFG.HEAL_EVERY === 0 && g.hearts < CFG.HEARTS) {
    g.hearts += 1;
    emit(g, 'heal', { hearts: g.hearts });
  }
}

function tapGate(g) {
  // まだ判定していない一番手前のゲート
  const gate = g.gates.find((x) => !x.judged);
  if (!gate) return;
  const err = g.t - gate.hit;
  if (err < -0.35) return; // 早すぎる連打は無視
  const row = judge(CFG.GATE, err, gateWindowScale(gate.i));
  hitGate(g, gate, row ? row.kind : 'miss');
}

function advanceDistance(g, dt) {
  g.d += g.v * dt;
  g.maxV = Math.max(g.maxV, g.v);
  const st = stageIndexAt(g.d);
  if (st > g.stage) {
    for (let k = g.stage + 1; k <= st; k++) emit(g, 'stage', { stage: k });
    g.stage = st;
  }
  while (g.milestone < MILESTONES.length && g.v >= MILESTONES[g.milestone].v) {
    emit(g, 'milestone', { i: g.milestone });
    g.milestone += 1;
  }
  if (g.d >= END_DISTANCE && !g.finished) {
    g.d = END_DISTANCE;
    g.phase = 'finale';
    g.t = 0;
    emit(g, 'finale');
  }
}

// tapped = このステップで押した
export function step(g, tapped) {
  g.t += DT;
  g.total += DT;
  switch (g.phase) {
    case 'ready':
      // 最初のタップでスタート（ゆっくり揺れて待つ）
      stepSwing(g, 0);
      if (tapped) {
        g.phase = 'charge';
        g.t = 0;
        emit(g, 'start');
        pump(g);
        updateLevel(g);
      }
      break;
    case 'charge':
      stepSwing(g, CFG.DAMP);
      if (tapped) pump(g);
      updateLevel(g);
      if (g.t >= CFG.CHARGE_TIME) {
        g.phase = 'release';
        g.t = 0;
        emit(g, 'timeup');
      }
      break;
    case 'release':
      stepSwing(g, 0);
      updateLevel(g);
      if (tapped) release(g);
      else if (g.t >= CFG.RELEASE_TIME) release(g);
      break;
    case 'launch':
      advanceDistance(g, DT);
      if (tapped && g.t >= CFG.KICK_APPEAR - 0.1) kick(g, false);
      else if (g.t > CFG.KICK_APPEAR + CFG.KICK_SHRINK + 0.2) kick(g, true);
      break;
    case 'flight': {
      g.v *= Math.exp(-CFG.DRAG * DT);
      advanceDistance(g, DT);
      if (g.phase !== 'flight') break;
      spawnGates(g);
      if (tapped) tapGate(g);
      for (const gate of g.gates) {
        if (!gate.judged && g.t - gate.hit > CFG.GATE[CFG.GATE.length - 1].win * gateWindowScale(gate.i)) hitGate(g, gate, 'miss');
        if (g.phase !== 'flight') break;
      }
      g.gates = g.gates.filter((x) => !x.judged || g.t - x.hit < 0.6);
      break;
    }
    case 'stall':
      g.v *= Math.exp(-2.2 * DT);
      advanceDistance(g, DT);
      if (g.t >= CFG.STALL_TIME) {
        g.phase = 'done';
        g.finished = true;
        g.reason = 'stall';
        emit(g, 'done');
      }
      break;
    case 'finale':
      if (g.t >= 4) {
        g.phase = 'done';
        g.finished = true;
        g.reason = 'end';
        emit(g, 'done');
      }
      break;
    default:
      break;
  }
}
