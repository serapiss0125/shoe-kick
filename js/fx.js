// 2D エフェクト：粒子・衝撃波・文字・画面の揺れ・フラッシュ
import { glow, rgba, INK } from './art.js';

export const IMPACT_FONT = '"Dela Gothic One", "M PLUS Rounded 1c", "Hiragino Sans", sans-serif';
export const UI_FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", sans-serif';

export function createFx() {
  const parts = [];
  const rings = [];
  const texts = [];
  const bolts = [];
  let banner = null;
  const cam = { shake: 0, punch: 0, flash: 0, flashColor: '#ffffff', tilt: 0 };
  let bright = false; // 明るい背景では加算合成をやめる（白く飛ばないように）
  const queue = [];
  const MAX = 1400;

  function add(p) {
    if (parts.length >= MAX) parts.splice(0, parts.length - MAX + 1);
    parts.push(p);
  }

  // kind: spark（線）, glow（光）, dust（円）, petal（花びら）, star（星）
  function burst(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = o.angle !== undefined ? o.angle + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2) : Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 300) * (0.35 + Math.random() * 0.9);
      const cols = o.colors || ['#ffffff'];
      add({
        kind: o.kind || 'glow',
        x: x + (Math.random() - 0.5) * (o.jitter ?? 0),
        y: y + (Math.random() - 0.5) * (o.jitter ?? 0),
        vx: Math.cos(a) * sp + (o.vx ?? 0),
        vy: Math.sin(a) * sp + (o.vy ?? 0),
        life: (o.life ?? 0.6) * (0.6 + Math.random() * 0.8),
        age: 0,
        size: (o.size ?? 6) * (0.6 + Math.random() * 0.8),
        color: cols[Math.floor(Math.random() * cols.length)],
        grav: o.grav ?? 0,
        drag: o.drag ?? 2,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 12,
        grow: o.grow ?? 0,
      });
    }
  }

  function ring(x, y, color, r1, life = 0.5, width = 10) {
    rings.push({ x, y, color, r1, life, age: 0, width });
  }

  function text(str, x, y, o = {}) {
    texts.push({
      str,
      x,
      y,
      size: o.size ?? 34,
      color: o.color ?? '#ffffff',
      color2: o.color2 ?? null,
      sub: o.sub ?? null,
      life: o.life ?? 0.9,
      age: 0,
      vy: o.vy ?? -60,
      rot: o.rot ?? (Math.random() - 0.5) * 0.15,
    });
    if (texts.length > 8) texts.shift();
  }

  function showBanner(str, o = {}) {
    if (banner && banner.age < banner.life * 0.55 && !o.force) {
      // 表示中なら順番待ち（古い順に最大2つ）
      queue.push([str, o]);
      if (queue.length > 3) queue.shift();
      return;
    }
    banner = {
      str,
      sub: o.sub ?? null,
      color: o.color ?? '#ffd23f',
      color2: o.color2 ?? '#ff5a3c',
      life: o.life ?? 1.6,
      age: 0,
      lines: o.lines ?? true,
      size: o.size ?? 1,
    };
  }

  function lightning(x1, y1, x2, y2, color = '#bfe9ff') {
    const pts = [[x1, y1]];
    const n = 9;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const len = Math.hypot(x2 - x1, y2 - y1);
      pts.push([x1 + (x2 - x1) * t + (Math.random() - 0.5) * len * 0.18, y1 + (y2 - y1) * t + (Math.random() - 0.5) * len * 0.18]);
    }
    pts.push([x2, y2]);
    bolts.push({ pts, color, life: 0.18, age: 0 });
  }

  function shake(v) {
    cam.shake = Math.max(cam.shake, v);
  }
  function punch(v) {
    cam.punch = Math.max(cam.punch, v);
  }
  function flash(v, color = '#ffffff') {
    cam.flash = Math.max(cam.flash, v);
    cam.flashColor = color;
  }

  function update(dt) {
    for (const p of parts) {
      p.age += dt;
      p.vy += p.grav * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].age >= parts[i].life) parts.splice(i, 1);
    for (const r of rings) r.age += dt;
    for (let i = rings.length - 1; i >= 0; i--) if (rings[i].age >= rings[i].life) rings.splice(i, 1);
    for (const t of texts) t.age += dt;
    for (let i = texts.length - 1; i >= 0; i--) if (texts[i].age >= texts[i].life) texts.splice(i, 1);
    for (const b of bolts) b.age += dt;
    for (let i = bolts.length - 1; i >= 0; i--) if (bolts[i].age >= bolts[i].life) bolts.splice(i, 1);
    if (banner) {
      banner.age += dt;
      if (banner.age >= banner.life) banner = null;
    }
    if ((!banner || banner.age > banner.life * 0.7) && queue.length) {
      const [s, o] = queue.shift();
      banner = null;
      showBanner(s, o);
    }
    cam.shake *= Math.exp(-6 * dt);
    cam.punch *= Math.exp(-7 * dt);
    cam.flash = Math.max(0, cam.flash - dt * 2.6);
  }

  // 世界の動きに合わせて粒子を流す（飛行中は背景が左へ流れる）
  function scroll(dx, dy) {
    for (const p of parts) {
      p.x += dx;
      p.y += dy;
    }
    for (const r of rings) {
      r.x += dx;
      r.y += dy;
    }
  }

  function drawParticles(g) {
    for (const p of parts) {
      const t = p.age / p.life;
      const a = Math.min(1, p.age / 0.04) * (1 - t * t);
      const s = p.size * (1 + p.grow * t);
      if (p.kind === 'spark') {
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = rgba(p.color, a);
        g.lineWidth = Math.max(1, s * 0.35);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        g.stroke();
      } else if (p.kind === 'glow' || p.kind === 'star') {
        g.globalCompositeOperation = bright ? 'source-over' : 'lighter';
        g.globalAlpha = bright ? a * 0.85 : a;
        g.drawImage(glow(p.color), p.x - s * 2, p.y - s * 2, s * 4, s * 4);
        if (p.kind === 'star') {
          g.fillStyle = '#ffffff';
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillRect(-s * 1.2, -s * 0.12, s * 2.4, s * 0.24);
          g.fillRect(-s * 0.12, -s * 1.2, s * 0.24, s * 2.4);
          g.restore();
        }
        g.globalAlpha = 1;
      } else if (p.kind === 'petal') {
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = a;
        g.fillStyle = p.color;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.beginPath();
        g.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
        g.globalAlpha = 1;
      } else {
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = a * 0.9;
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, s, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
    }
    g.globalCompositeOperation = 'lighter';
    for (const r of rings) {
      const t = r.age / r.life;
      const e = 1 - Math.pow(1 - t, 3);
      g.strokeStyle = rgba(r.color, (1 - t) * 0.9);
      g.lineWidth = r.width * (1 - t) + 1;
      g.beginPath();
      g.arc(r.x, r.y, r.r1 * e + 4, 0, Math.PI * 2);
      g.stroke();
    }
    for (const b of bolts) {
      const a = 1 - b.age / b.life;
      for (const [w, col] of [
        [10, rgba(b.color, a * 0.35)],
        [4, rgba('#ffffff', a)],
      ]) {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(b.pts[0][0], b.pts[0][1]);
        for (const p of b.pts) g.lineTo(p[0], p[1]);
        g.stroke();
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  function outlined(g, str, x, y, size, fill, fill2, strokeW) {
    g.font = `${size}px ${IMPACT_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = strokeW ?? size * 0.28;
    g.strokeStyle = INK;
    g.strokeText(str, x, y + size * 0.06);
    g.strokeText(str, x, y);
    if (fill2) {
      const grd = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
      grd.addColorStop(0, fill);
      grd.addColorStop(1, fill2);
      g.fillStyle = grd;
    } else g.fillStyle = fill;
    g.fillText(str, x, y);
    // つや
    g.save();
    g.globalAlpha = 0.35;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.rect(x - 2000, y - size * 0.5, 4000, size * 0.32);
    g.clip();
    g.fillText(str, x, y);
    g.restore();
  }

  function easeBack(t) {
    const c1 = 2.2;
    return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function drawTexts(g, W) {
    for (const t of texts) {
      const k = t.age / t.life;
      const sc = k < 0.18 ? easeBack(k / 0.18) : 1;
      const a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      let x = t.x;
      const y = t.y + t.vy * t.age;
      g.font = `${t.size}px ${IMPACT_FONT}`;
      const half = g.measureText(t.str).width / 2 + 16;
      x = Math.max(half, Math.min(W - half, x));
      g.save();
      g.globalAlpha = a;
      g.translate(x, y);
      g.rotate(t.rot);
      g.scale(sc, sc);
      outlined(g, t.str, 0, 0, t.size, t.color, t.color2);
      if (t.sub) {
        g.font = `900 ${Math.round(t.size * 0.42)}px ${UI_FONT}`;
        g.lineWidth = 6;
        g.strokeStyle = INK;
        g.fillStyle = '#ffffff';
        g.strokeText(t.sub, 0, t.size * 0.8);
        g.fillText(t.sub, 0, t.size * 0.8);
      }
      g.restore();
    }
  }

  // 画面中央の特大文字（集中線つき）
  function drawBanner(g, W, H) {
    if (!banner) return;
    const b = banner;
    const k = b.age / b.life;
    const inK = Math.min(1, b.age / 0.22);
    const sc = 2.4 - 1.4 * easeBack(inK);
    const a = k > 0.78 ? 1 - (k - 0.78) / 0.22 : 1;
    const cx = W / 2;
    const cy = H * 0.4;
    if (b.lines) {
      g.save();
      g.globalAlpha = a * 0.32 * (1 - k * 0.6);
      g.translate(cx, cy);
      g.fillStyle = '#ffffff';
      const n = 46;
      const R = Math.hypot(W, H);
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + Math.sin(i * 7.3) * 0.05;
        const w = 0.012 + (Math.sin(i * 3.7) * 0.5 + 0.5) * 0.02;
        const r0 = Math.min(W, H) * (0.32 + (Math.sin(i * 5.1 + b.age * 30) * 0.5 + 0.5) * 0.12);
        g.beginPath();
        g.moveTo(Math.cos(ang - w) * R, Math.sin(ang - w) * R);
        g.lineTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
        g.lineTo(Math.cos(ang + w) * R, Math.sin(ang + w) * R);
        g.closePath();
        g.fill();
      }
      g.restore();
    }
    const size = Math.min(W * 0.13, 84) * b.size;
    g.save();
    g.globalAlpha = a;
    g.translate(cx + (Math.random() - 0.5) * (1 - inK) * 20, cy);
    g.rotate(-0.05);
    g.scale(sc, sc);
    // 文字が長いときは縮める
    g.font = `${size}px ${IMPACT_FONT}`;
    const tw = g.measureText(b.str).width;
    const fit = Math.min(1, (W * 0.92) / tw);
    g.scale(fit, fit);
    outlined(g, b.str, 0, 0, size, b.color, b.color2);
    if (b.sub) {
      g.font = `900 ${Math.round(size * 0.36)}px ${UI_FONT}`;
      g.lineWidth = 8;
      g.lineJoin = 'round';
      g.strokeStyle = INK;
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.strokeText(b.sub, 0, size * 0.85);
      g.fillText(b.sub, 0, size * 0.85);
    }
    g.restore();
  }

  function drawFlash(g, W, H) {
    if (cam.flash <= 0) return;
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = rgba(cam.flashColor, Math.min(1, cam.flash));
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  }

  return {
    cam,
    burst,
    ring,
    text,
    showBanner,
    lightning,
    shake,
    punch,
    flash,
    update,
    scroll,
    drawParticles,
    drawTexts,
    drawBanner,
    drawFlash,
    outlined,
    get bannerActive() {
      return !!banner;
    },
    set bright(v) {
      bright = v;
    },
    clear() {
      parts.length = 0;
      rings.length = 0;
      texts.length = 0;
      bolts.length = 0;
      banner = null;
      queue.length = 0;
    },
  };
}
