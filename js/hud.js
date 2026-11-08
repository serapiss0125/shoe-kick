// 画面の上の表示（揺れない層）
import { INK, rgba } from './art.js';
import { CFG } from './logic.js';
import { STAGES, END_DISTANCE, formatDistance, formatSpeed, stageIndexAt } from './stages.js';
import { IMPACT_FONT, UI_FONT } from './fx.js';

const LEVEL_NAMES = ['', 'LV1', 'LV2', '大車輪', 'LV4', 'LV5', 'MAX'];
const LEVEL_COLORS = ['#ffffff', '#9fe6ff', '#7dffb0', '#ffe14d', '#ff9a2e', '#ff4d6d', '#d16bff'];

export function createHud(fx) {
  let comboPulse = 0;
  let lastCombo = 0;
  let distPulse = 0;
  let lastUnit = '';

  function pill(g, x, y, w, h, fill = 'rgba(12,16,32,0.55)') {
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(x, y, w, h, h / 2);
    g.fill();
  }

  function text(g, str, x, y, size, color, align = 'center', font = UI_FONT, weight = 900, stroke = 0) {
    g.font = `${weight} ${size}px ${font}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    if (stroke) {
      g.lineJoin = 'round';
      g.lineWidth = stroke;
      g.strokeStyle = INK;
      g.strokeText(str, x, y);
    }
    g.fillStyle = color;
    g.fillText(str, x, y);
  }

  function hint(g, W, y, str, t) {
    const size = Math.min(17, W * 0.042);
    g.font = `900 ${size}px ${UI_FONT}`;
    const w = g.measureText(str).width + 34;
    const a = 0.85 + Math.sin(t * 5) * 0.15;
    g.globalAlpha = a;
    pill(g, W / 2 - w / 2, y - size, w, size * 2);
    text(g, str, W / 2, y + 1, size, '#ffffff');
    g.globalAlpha = 1;
  }

  function bigPrompt(g, W, y, str, t, color = '#ffe14d') {
    const sc = 1 + Math.sin(t * 7) * 0.05;
    g.save();
    g.translate(W / 2, y);
    g.scale(sc, sc);
    fx.outlined(g, str, 0, 0, Math.min(46, W * 0.1), color, '#ff8a2e');
    g.restore();
  }

  function drawCharge(g, W, H, game, t, safeTop) {
    const top = safeTop + 14;
    const rem = game.phase === 'charge' ? Math.max(0, CFG.CHARGE_TIME - game.t) : game.phase === 'ready' ? CFG.CHARGE_TIME : 0;
    // 残り時間のバー
    const bw = Math.min(W * 0.7, 360);
    const bx = W / 2 - bw / 2;
    pill(g, bx - 6, top - 6, bw + 12, 30);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.roundRect(bx, top, bw, 18, 9);
    g.fill();
    const frac = rem / CFG.CHARGE_TIME;
    const grd = g.createLinearGradient(bx, 0, bx + bw, 0);
    grd.addColorStop(0, '#ff4d6d');
    grd.addColorStop(0.5, '#ffe14d');
    grd.addColorStop(1, '#7dffb0');
    g.fillStyle = grd;
    g.beginPath();
    g.roundRect(bx, top, Math.max(18, bw * frac), 18, 9);
    g.fill();
    text(g, game.phase === 'release' ? 'RELEASE!' : `CHARGE  ${rem.toFixed(1)}`, W / 2, top + 9, 12, '#1b1f2e', 'center', UI_FONT, 900);

    // パワー（下）
    const lv = game.level;
    const col = LEVEL_COLORS[lv];
    const py = H - Math.max(110, H * 0.14);
    const mw = Math.min(W * 0.82, 420);
    const mx = W / 2 - mw / 2;
    pill(g, mx - 10, py - 34, mw + 20, 72, 'rgba(12,16,32,0.6)');
    // 段階の目盛り
    const v = Math.min(1, game.omegaB / CFG.OMEGA_MAX);
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.beginPath();
    g.roundRect(mx, py + 4, mw, 20, 10);
    g.fill();
    const g2 = g.createLinearGradient(mx, 0, mx + mw, 0);
    g2.addColorStop(0, '#9fe6ff');
    g2.addColorStop(0.35, '#7dffb0');
    g2.addColorStop(0.55, '#ffe14d');
    g2.addColorStop(0.8, '#ff4d6d');
    g2.addColorStop(1, '#d16bff');
    g.fillStyle = g2;
    g.beginPath();
    g.roundRect(mx, py + 4, Math.max(20, mw * v), 20, 10);
    g.fill();
    if (lv >= 6) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255,255,255,${0.25 + Math.sin(t * 20) * 0.2})`;
      g.beginPath();
      g.roundRect(mx, py + 4, mw, 20, 10);
      g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    for (let i = 1; i < CFG.LEVELS.length; i++) {
      const x = mx + (CFG.LEVELS[i] / CFG.OMEGA_MAX) * mw;
      g.fillStyle = 'rgba(27,31,46,0.6)';
      g.fillRect(x - 1.5, py + 4, 3, 20);
    }
    const label = lv === 0 ? 'POWER' : LEVEL_NAMES[lv];
    text(g, label, mx + 4, py - 14, lv >= 6 ? 26 : 22, col, 'left', IMPACT_FONT, 400, 6);
    const kmh = Math.round(1.6 * game.omegaB * game.omegaB * 3.6);
    text(g, `${kmh.toLocaleString('ja-JP')}`, mx + mw - 54, py - 14, 22, '#ffffff', 'right', IMPACT_FONT, 400, 6);
    text(g, 'km/h', mx + mw - 4, py - 10, 12, '#bfe9ff', 'right', UI_FONT, 900, 4);
    text(g, '発射速度', mx + mw - 54, py - 36, 10, '#bfe9ff', 'right', UI_FONT, 900, 3);
    // 案内
    const hy = py - 66;
    if (game.phase === 'ready') {
      bigPrompt(g, W, H * 0.7 - 40, 'タップでスタート！', t);
      hint(g, W, H * 0.7 + 4, 'ブランコが一番下に来た瞬間にタップ', t);
    } else if (game.phase === 'charge') {
      if (game.t < 4) hint(g, W, hy, '一番下（光る輪）を通る瞬間にタップ！', t);
      else if (game.looping) hint(g, W, hy, '回るたびに一番下でタップ！ さらに加速！', t);
    } else if (game.phase === 'release') {
      hint(g, W, hy, '座面が黄色い矢印に来た瞬間にタップ！', t);
    }
  }

  function drawFlight(g, W, H, game, t, dt, safeTop) {
    const top = safeTop + 10;
    // 距離
    const f = formatDistance(game.d);
    if (f.unit !== lastUnit) {
      if (lastUnit) distPulse = 1;
      lastUnit = f.unit;
    }
    distPulse = Math.max(0, distPulse - dt * 2.5);
    let size = Math.min(W * 0.14, 76);
    g.font = `${size}px ${IMPACT_FONT}`;
    // ハートと速さの間に収める
    const fitW = (g.measureText(f.num).width + g.measureText(f.unit).width * 0.42 + 8) || 1;
    size *= Math.min(1, (W - 210) / fitW) * (1 + distPulse * 0.3);
    g.font = `${size}px ${IMPACT_FONT}`;
    const nw = g.measureText(f.num).width;
    const us = size * 0.42;
    g.font = `${us}px ${IMPACT_FONT}`;
    const uw = g.measureText(f.unit).width;
    const totalW = nw + uw + 8;
    const x0 = W / 2 - totalW / 2;
    g.save();
    g.textAlign = 'left';
    fx.outlined(g, f.num, x0 + nw / 2, top + size * 0.6, size, '#ffffff', '#ffe27a');
    fx.outlined(g, f.unit, x0 + nw + 8 + uw / 2, top + size * 0.78, us, '#ffe27a', '#ff9a2e', us * 0.3);
    g.restore();
    // ステージ名
    const st = STAGES[stageIndexAt(game.d)];
    g.font = `900 14px ${UI_FONT}`;
    const sw = g.measureText(st.name).width + 30;
    pill(g, W / 2 - sw / 2, top + size * 1.15, sw, 26, rgba(st.color, 0.9));
    text(g, st.name, W / 2, top + size * 1.15 + 13, 14, '#1b1f2e');

    // ライフ
    const hy = top + size * 1.15 + 50;
    for (let i = 0; i < CFG.HEARTS; i++) {
      const on = i < game.hearts;
      const x = 22 + i * 30;
      drawHeart(g, x, safeTop + 26, 11, on, t);
    }
    // 速さ
    const sp = formatSpeed(game.v);
    g.font = `400 18px ${IMPACT_FONT}`;
    text(g, sp.num, W - 14, safeTop + 22, 18, '#ffffff', 'right', IMPACT_FONT, 400, 5);
    text(g, sp.unit, W - 14, safeTop + 44, 12, '#bfe9ff', 'right', UI_FONT, 900, 4);

    // コンボ
    if (game.combo !== lastCombo) {
      if (game.combo > lastCombo) comboPulse = 1;
      lastCombo = game.combo;
    }
    comboPulse = Math.max(0, comboPulse - dt * 3);
    if (game.combo >= 2) {
      const sc = 1 + comboPulse * 0.45;
      g.save();
      g.translate(W - 20, hy + 40);
      g.scale(sc, sc);
      const col = game.combo >= 20 ? '#d16bff' : game.combo >= 10 ? '#ff4d6d' : game.combo >= 5 ? '#ffe14d' : '#7dffb0';
      g.textAlign = 'right';
      fx.outlined(g, `${game.combo}`, -40, 0, 46, '#ffffff', col);
      text(g, 'COMBO', 0, 18, 12, col, 'right', IMPACT_FONT, 400, 4);
      g.restore();
    }

    // 旅の進み具合（下）
    const by = H - 26;
    const bw = W - 40;
    const bx = 20;
    const lgEnd = Math.log10(END_DISTANCE);
    const pos = (d) => bx + (Math.log10(Math.max(1, d)) / lgEnd) * bw;
    pill(g, bx - 8, by - 10, bw + 16, 20, 'rgba(12,16,32,0.5)');
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.fillRect(bx, by - 2, bw, 4);
    const cur = pos(game.d);
    const grd = g.createLinearGradient(bx, 0, bx + bw, 0);
    grd.addColorStop(0, '#7dffb0');
    grd.addColorStop(0.4, '#5aa9ff');
    grd.addColorStop(0.7, '#d16bff');
    grd.addColorStop(1, '#ffffff');
    g.fillStyle = grd;
    g.fillRect(bx, by - 2, cur - bx, 4);
    for (const s of STAGES) {
      if (s.from < 1) continue;
      const x = pos(s.from);
      g.fillStyle = game.d >= s.from ? s.color : 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.arc(x, by, game.d >= s.from ? 4 : 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(cur, by, 6 + Math.sin(t * 10) * 1.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.stroke();

    // キックの案内
    if (game.phase === 'launch') {
      bigPrompt(g, W, H * 0.78, 'タップでキック！', t, '#ff8a5b');
    } else if (game.phase === 'flight' && game.t < 3.2) {
      hint(g, W, H * 0.8, '輪が重なる瞬間にタップでブースト！', t);
    }
  }

  function drawHeart(g, x, y, r, on, t) {
    g.save();
    g.translate(x, y);
    const s = on ? 1 + Math.sin(t * 6) * 0.04 : 0.85;
    g.scale(s, s);
    g.beginPath();
    g.moveTo(0, r * 0.9);
    g.bezierCurveTo(-r * 1.6, -r * 0.2, -r * 0.8, -r * 1.3, 0, -r * 0.45);
    g.bezierCurveTo(r * 0.8, -r * 1.3, r * 1.6, -r * 0.2, 0, r * 0.9);
    g.closePath();
    g.fillStyle = on ? '#ff4d6d' : 'rgba(255,255,255,0.18)';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.stroke();
    if (on) {
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath();
      g.ellipse(-r * 0.5, -r * 0.4, r * 0.25, r * 0.15, -0.6, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  function draw(g, W, H, game, t, dt, mode, safeTop = 0) {
    if (mode !== 'game') return;
    if (game.phase === 'ready' || game.phase === 'charge' || game.phase === 'release') drawCharge(g, W, H, game, t, safeTop);
    else if (game.phase !== 'done') drawFlight(g, W, H, game, t, dt, safeTop);
  }

  return {
    draw,
    reset() {
      lastCombo = 0;
      lastUnit = '';
      comboPulse = 0;
    },
  };
}
