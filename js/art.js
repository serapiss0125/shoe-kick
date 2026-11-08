// 絵の素材（画像ファイルは使わず、すべて Canvas で描く）
// 重いものは最初に一度だけ描いて画像として使い回す。

export const INK = '#1b1f2e';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function seeded(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1000000) / 1000000;
  };
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * t);
  const g = Math.round(A[1] + (B[1] - A[1]) * t);
  const bl = Math.round(A[2] + (B[2] - A[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ===== 光の玉（色ごとにキャッシュ） =====
const glowCache = new Map();
export function glow(color) {
  if (glowCache.has(color)) return glowCache.get(color);
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, rgba(color, 1));
  grd.addColorStop(0.2, rgba(color, 0.75));
  grd.addColorStop(0.5, rgba(color, 0.22));
  grd.addColorStop(1, rgba(color, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowCache.set(color, c);
  return c;
}

export function drawGlow(ctx, color, x, y, r, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(glow(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

// ===== 星空（3層のタイル） =====
export function makeStarTile(seed, n, maxSize, size = 512) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const r = seeded(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * size;
    const y = r() * size;
    const s = 0.4 + r() * maxSize;
    const tint = r();
    const col = tint < 0.15 ? '#ffd9a8' : tint < 0.3 ? '#a8c8ff' : '#ffffff';
    if (s > maxSize * 0.75) {
      g.globalAlpha = 0.5;
      g.drawImage(glow(col), x - s * 4, y - s * 4, s * 8, s * 8);
    }
    g.globalAlpha = 0.5 + r() * 0.5;
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return c;
}

// ===== 雲 =====
export function makeCloud(seed, w = 360) {
  const h = w * 0.5;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const r = seeded(seed);
  const puffs = [];
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const px = w * (0.18 + (i / (n - 1)) * 0.64) + (r() - 0.5) * w * 0.08;
    const pr = w * (0.1 + r() * 0.1) * (1 - Math.abs(i / (n - 1) - 0.5) * 0.8);
    puffs.push([px, h * 0.62 - pr * 0.4, pr]);
  }
  // 影
  g.fillStyle = '#c9dcf2';
  for (const [x, y, rr] of puffs) {
    g.beginPath();
    g.arc(x, y + rr * 0.18, rr, 0, Math.PI * 2);
    g.fill();
  }
  g.fillRect(w * 0.14, h * 0.62, w * 0.72, h * 0.16);
  // 本体
  g.fillStyle = '#ffffff';
  for (const [x, y, rr] of puffs) {
    g.beginPath();
    g.arc(x, y, rr * 0.96, 0, Math.PI * 2);
    g.fill();
  }
  g.fillRect(w * 0.16, h * 0.58, w * 0.68, h * 0.12);
  return c;
}

// ===== 地上のシルエット（横に繰り返す） =====
export function makeSkyline(kind, seed, w = 2048, h = 420) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const r = seeded(seed);
  if (kind === 'city-far') {
    g.fillStyle = '#8fb8e6';
    let x = 0;
    while (x < w) {
      const bw = 40 + r() * 90;
      const bh = 120 + r() * 260;
      g.fillRect(x, h - bh, bw, bh);
      if (r() < 0.25) g.fillRect(x + bw * 0.45, h - bh - 30, 4, 30);
      x += bw + r() * 8;
    }
  } else if (kind === 'city') {
    let x = 0;
    while (x < w) {
      const bw = 60 + r() * 110;
      const bh = 160 + r() * 240;
      const col = ['#5d7fb8', '#6a8cc4', '#5574aa', '#7896c8'][Math.floor(r() * 4)];
      g.fillStyle = col;
      g.fillRect(x, h - bh, bw, bh);
      // 窓
      g.fillStyle = 'rgba(255,240,190,0.55)';
      for (let yy = h - bh + 14; yy < h - 14; yy += 18) {
        for (let xx = x + 8; xx < x + bw - 10; xx += 14) {
          if (r() < 0.55) g.fillRect(xx, yy, 7, 9);
        }
      }
      if (r() < 0.3) {
        g.fillStyle = col;
        g.fillRect(x + bw * 0.4, h - bh - 40, bw * 0.2, 40);
        g.fillStyle = '#ff5a5a';
        g.fillRect(x + bw * 0.48, h - bh - 46, 5, 6);
      }
      x += bw + 4 + r() * 10;
    }
  } else if (kind === 'houses') {
    let x = 0;
    while (x < w) {
      const bw = 70 + r() * 60;
      const bh = 50 + r() * 40;
      const wall = ['#fff1dc', '#ffe0dc', '#e4f1ff', '#f3ffe2', '#fff6c9'][Math.floor(r() * 5)];
      const roof = ['#e0574c', '#3d6fb6', '#4f9a4b', '#8a5bc4', '#e08a2f'][Math.floor(r() * 5)];
      g.fillStyle = wall;
      g.fillRect(x, h - bh, bw, bh);
      g.fillStyle = roof;
      g.beginPath();
      g.moveTo(x - 8, h - bh);
      g.lineTo(x + bw / 2, h - bh - bw * 0.42);
      g.lineTo(x + bw + 8, h - bh);
      g.closePath();
      g.fill();
      g.fillStyle = '#8ccff0';
      g.fillRect(x + bw * 0.18, h - bh * 0.7, bw * 0.22, bh * 0.3);
      g.fillRect(x + bw * 0.6, h - bh * 0.7, bw * 0.22, bh * 0.3);
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(27,31,46,0.25)';
      g.strokeRect(x, h - bh, bw, bh);
      x += bw + 16 + r() * 30;
      // 木
      if (r() < 0.6) {
        const tx = x - 8;
        g.fillStyle = '#7a5235';
        g.fillRect(tx - 3, h - 34, 6, 34);
        g.fillStyle = ['#3fa34d', '#4fb85a', '#2f8f44'][Math.floor(r() * 3)];
        g.beginPath();
        g.arc(tx, h - 46, 20 + r() * 8, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (kind === 'trees') {
    let x = 0;
    while (x < w) {
      const s = 30 + r() * 40;
      g.fillStyle = '#6b4a30';
      g.fillRect(x - 4, h - s * 1.2, 8, s * 1.2);
      g.fillStyle = ['#3e9e4a', '#4cb257', '#2f8a3e', '#5cc062'][Math.floor(r() * 4)];
      if (r() < 0.6) {
        g.beginPath();
        g.arc(x, h - s * 1.5, s * 0.75, 0, Math.PI * 2);
        g.arc(x - s * 0.45, h - s * 1.15, s * 0.5, 0, Math.PI * 2);
        g.arc(x + s * 0.45, h - s * 1.15, s * 0.5, 0, Math.PI * 2);
        g.fill();
      } else {
        g.beginPath();
        g.moveTo(x, h - s * 2.6);
        g.lineTo(x - s * 0.7, h - s * 0.7);
        g.lineTo(x + s * 0.7, h - s * 0.7);
        g.closePath();
        g.fill();
      }
      x += s * 1.3 + r() * 60;
    }
  } else if (kind === 'mountains') {
    g.fillStyle = '#7ea6d6';
    g.beginPath();
    g.moveTo(0, h);
    let x = 0;
    while (x <= w) {
      g.lineTo(x, h - 120 - r() * 220);
      x += 80 + r() * 140;
    }
    g.lineTo(w, h);
    g.closePath();
    g.fill();
  }
  return c;
}

// ===== 惑星など（大きい1枚絵） =====
function planetBase(size, draw, shade = 0.55) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  g.save();
  g.beginPath();
  g.arc(r, r, r * 0.98, 0, Math.PI * 2);
  g.clip();
  draw(g, size);
  // 影（右下が暗い）
  const sh = g.createRadialGradient(r * 0.65, r * 0.6, r * 0.2, r, r, r * 1.05);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(0.7, `rgba(0,0,0,${shade * 0.35})`);
  sh.addColorStop(1, `rgba(0,0,0,${shade})`);
  g.fillStyle = sh;
  g.fillRect(0, 0, size, size);
  // 光
  const hl = g.createRadialGradient(r * 0.55, r * 0.45, 0, r * 0.55, r * 0.45, r * 0.7);
  hl.addColorStop(0, 'rgba(255,255,255,0.25)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.fillRect(0, 0, size, size);
  g.restore();
  return c;
}

export function makeEarth(size = 1024) {
  const r = seeded(5);
  return planetBase(size, (g, s) => {
    g.fillStyle = '#2a73d9';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#4ab35a';
    for (let i = 0; i < 26; i++) {
      const x = r() * s;
      const y = r() * s;
      g.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const rr = s * (0.04 + r() * 0.08);
        g.lineTo(x + Math.cos(a) * rr * 1.6, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 40; i++) {
      g.beginPath();
      g.ellipse(r() * s, r() * s, s * (0.03 + r() * 0.08), s * (0.008 + r() * 0.02), r() * 0.6 - 0.3, 0, Math.PI * 2);
      g.fill();
    }
  }, 0.6);
}

export function makeMoon(size = 512) {
  const r = seeded(9);
  return planetBase(size, (g, s) => {
    g.fillStyle = '#d9d6cc';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#b8b4a8';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.ellipse(r() * s, r() * s, s * (0.08 + r() * 0.12), s * (0.06 + r() * 0.1), r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 40; i++) {
      const x = r() * s;
      const y = r() * s;
      const cr = s * (0.01 + r() * 0.045);
      g.fillStyle = 'rgba(120,115,105,0.6)';
      g.beginPath();
      g.arc(x, y, cr, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,250,0.5)';
      g.beginPath();
      g.arc(x - cr * 0.2, y - cr * 0.2, cr * 0.75, 0, Math.PI * 2);
      g.fill();
    }
  }, 0.75);
}

export function makeMars(size = 512) {
  const r = seeded(13);
  return planetBase(size, (g, s) => {
    g.fillStyle = '#d9643a';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#a8432a';
    for (let i = 0; i < 18; i++) {
      g.beginPath();
      g.ellipse(r() * s, r() * s, s * (0.05 + r() * 0.15), s * (0.02 + r() * 0.05), r() * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#f7efe6';
    g.beginPath();
    g.ellipse(s * 0.5, s * 0.04, s * 0.22, s * 0.07, 0, 0, Math.PI * 2);
    g.fill();
  }, 0.7);
}

export function makeJupiter(size = 1024) {
  const r = seeded(17);
  return planetBase(size, (g, s) => {
    const cols = ['#f2d3a8', '#d9a066', '#f7e6c9', '#c47b4a', '#ead0aa', '#b86b3e', '#f4dcb5'];
    g.fillStyle = '#e2b98a';
    g.fillRect(0, 0, s, s);
    let y = -s * 0.02;
    let i = 0;
    while (y < s) {
      const bh = s * (0.03 + r() * 0.07);
      g.fillStyle = cols[i % cols.length];
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= s; x += s / 24) g.lineTo(x, y + Math.sin(x * 0.02 + i) * s * 0.008);
      g.lineTo(s, y + bh);
      for (let x = s; x >= 0; x -= s / 24) g.lineTo(x, y + bh + Math.sin(x * 0.025 + i * 2) * s * 0.008);
      g.closePath();
      g.fill();
      y += bh;
      i++;
    }
    // 大赤斑
    g.fillStyle = '#c4492f';
    g.beginPath();
    g.ellipse(s * 0.62, s * 0.62, s * 0.11, s * 0.06, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e0714f';
    g.beginPath();
    g.ellipse(s * 0.62, s * 0.62, s * 0.07, s * 0.035, 0, 0, Math.PI * 2);
    g.fill();
  }, 0.65);
}

export function makeSaturn(size = 1024) {
  // 輪を含めた横長の絵
  const w = size * 2;
  const h = size;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const body = planetBase(size * 0.55, (gg, s) => {
    const cols = ['#f5e2b0', '#e8c98a', '#f9edcb', '#d9b475'];
    for (let i = 0; i < 18; i++) {
      gg.fillStyle = cols[i % cols.length];
      gg.fillRect(0, (i / 18) * s, s, s / 18 + 1);
    }
  }, 0.6);
  const cx = w / 2;
  const cy = h / 2;
  const ring = (front) => {
    g.save();
    g.translate(cx, cy);
    g.rotate(-0.18);
    g.beginPath();
    if (front) g.rect(-w, 0, w * 2, h);
    else g.rect(-w, -h, w * 2, h);
    g.clip();
    for (let k = 0; k < 7; k++) {
      g.strokeStyle = ['rgba(240,220,170,0.85)', 'rgba(210,180,120,0.7)', 'rgba(250,235,190,0.9)', 'rgba(190,160,110,0.5)'][k % 4];
      g.lineWidth = size * 0.035;
      g.beginPath();
      g.ellipse(0, 0, size * (0.5 + k * 0.06), size * (0.12 + k * 0.014), 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  };
  ring(false);
  g.drawImage(body, cx - body.width / 2, cy - body.height / 2);
  ring(true);
  return c;
}

export function makeStation(size = 600) {
  const c = makeCanvas(size, size * 0.6);
  const g = c.getContext('2d');
  const w = c.width;
  const h = c.height;
  g.lineJoin = 'round';
  // 太陽電池パネル
  const panel = (x, y) => {
    g.fillStyle = '#2b4f9a';
    g.fillRect(x, y, w * 0.16, h * 0.32);
    g.strokeStyle = '#9fc0ff';
    g.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(x + (w * 0.16 * i) / 4, y);
      g.lineTo(x + (w * 0.16 * i) / 4, y + h * 0.32);
      g.stroke();
    }
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.strokeRect(x, y, w * 0.16, h * 0.32);
  };
  g.fillStyle = '#cfd6e2';
  g.fillRect(w * 0.08, h * 0.47, w * 0.84, h * 0.06);
  for (const x of [0.06, 0.24, 0.6, 0.78]) {
    panel(w * x, h * 0.08);
    panel(w * x, h * 0.6);
  }
  g.fillStyle = '#eef1f6';
  g.strokeStyle = INK;
  g.lineWidth = 5;
  g.beginPath();
  g.roundRect(w * 0.38, h * 0.36, w * 0.24, h * 0.28, 18);
  g.fill();
  g.stroke();
  g.fillStyle = '#ffcf4d';
  g.beginPath();
  g.arc(w * 0.5, h * 0.5, h * 0.06, 0, Math.PI * 2);
  g.fill();
  return c;
}

export function makeAsteroid(seed, size = 160) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const r = seeded(seed);
  const n = 9;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = size * (0.32 + r() * 0.15);
    g.lineTo(size / 2 + Math.cos(a) * rr, size / 2 + Math.sin(a) * rr);
  }
  g.closePath();
  const grd = g.createRadialGradient(size * 0.4, size * 0.35, 0, size / 2, size / 2, size * 0.5);
  grd.addColorStop(0, '#b8a28a');
  grd.addColorStop(1, '#5a4a3a');
  g.fillStyle = grd;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(20,16,12,0.8)';
  g.stroke();
  g.fillStyle = 'rgba(40,30,20,0.4)';
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(size * (0.3 + r() * 0.4), size * (0.3 + r() * 0.4), size * (0.04 + r() * 0.06), 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

export function makeGalaxy(size, colors, seed, arms = 3) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const r = seeded(seed);
  const cx = size / 2;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2600; i++) {
    const arm = i % arms;
    const t = r();
    const a = t * Math.PI * 3.2 + (arm / arms) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const rr = t * size * 0.46 + (r() - 0.5) * size * 0.04;
    const x = cx + Math.cos(a) * rr;
    const y = cx + Math.sin(a) * rr;
    const col = colors[Math.floor(r() * colors.length)];
    g.globalAlpha = 0.25 + (1 - t) * 0.5;
    const s = 1 + r() * 3 * (1 - t);
    g.drawImage(glow(col), x - s * 3, y - s * 3, s * 6, s * 6);
  }
  g.globalAlpha = 1;
  g.drawImage(glow(colors[0]), cx - size * 0.18, cx - size * 0.18, size * 0.36, size * 0.36);
  g.drawImage(glow('#ffffff'), cx - size * 0.07, cx - size * 0.07, size * 0.14, size * 0.14);
  g.globalCompositeOperation = 'source-over';
  return c;
}

export function makeNebula(seed, colors, size = 512) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const r = seeded(seed);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const x = size * (0.2 + r() * 0.6);
    const y = size * (0.2 + r() * 0.6);
    const rr = size * (0.12 + r() * 0.25);
    g.globalAlpha = 0.12 + r() * 0.12;
    g.drawImage(glow(colors[i % colors.length]), x - rr, y - rr, rr * 2, rr * 2);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return c;
}

export function makeBlackHole(size = 700) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const cx = size / 2;
  g.globalCompositeOperation = 'lighter';
  g.drawImage(glow('#ff9a3d'), cx - size * 0.5, cx - size * 0.5, size, size);
  g.globalCompositeOperation = 'source-over';
  // 降着円盤
  g.save();
  g.translate(cx, cx);
  g.scale(1, 0.32);
  for (let k = 0; k < 18; k++) {
    g.strokeStyle = `rgba(255,${170 + k * 4},${80 + k * 6},${0.5 - k * 0.02})`;
    g.lineWidth = size * 0.02;
    g.beginPath();
    g.arc(0, 0, size * (0.17 + k * 0.016), 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
  // 事象の地平線
  g.fillStyle = '#000';
  g.beginPath();
  g.arc(cx, cx, size * 0.14, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,230,180,0.95)';
  g.lineWidth = size * 0.012;
  g.beginPath();
  g.arc(cx, cx, size * 0.15, 0, Math.PI * 2);
  g.stroke();
  // 手前側の円盤
  g.save();
  g.translate(cx, cx);
  g.scale(1, 0.32);
  g.beginPath();
  g.rect(-size, 0, size * 2, size);
  g.clip();
  for (let k = 0; k < 18; k++) {
    g.strokeStyle = `rgba(255,${190 + k * 3},${110 + k * 6},${0.7 - k * 0.03})`;
    g.lineWidth = size * 0.02;
    g.beginPath();
    g.arc(0, 0, size * (0.17 + k * 0.016), 0, Math.PI);
    g.stroke();
  }
  g.restore();
  return c;
}

// ===== 靴 =====
// 横から見た靴。つま先が右、靴底が下。長さ len、中心が原点。
export function drawShoe(g, skin, len) {
  const L = len / 2;
  const H = len * 0.42;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const lw = Math.max(2, len * 0.045);
  if (skin.id === 'geta') {
    // 台
    g.fillStyle = skin.body;
    g.strokeStyle = INK;
    g.lineWidth = lw;
    g.beginPath();
    g.roundRect(-L, -H * 0.05, len, H * 0.32, H * 0.08);
    g.fill();
    g.stroke();
    // 歯
    g.fillStyle = skin.sole;
    for (const dx of [-0.55, 0.45]) {
      g.beginPath();
      g.roundRect(L * dx - len * 0.06, H * 0.27, len * 0.12, H * 0.34, 3);
      g.fill();
      g.stroke();
    }
    // 鼻緒
    g.strokeStyle = INK;
    g.lineWidth = lw * 2.4;
    g.beginPath();
    g.moveTo(-L * 0.45, -H * 0.05);
    g.quadraticCurveTo(L * 0.2, -H * 0.85, L * 0.55, -H * 0.05);
    g.stroke();
    g.strokeStyle = skin.accent;
    g.lineWidth = lw * 1.3;
    g.stroke();
    return;
  }
  // 靴底
  g.fillStyle = skin.sole;
  g.strokeStyle = INK;
  g.lineWidth = lw;
  g.beginPath();
  g.moveTo(-L, H * 0.18);
  g.lineTo(L * 0.86, H * 0.18);
  g.quadraticCurveTo(L * 1.06, H * 0.2, L * 1.02, H * 0.42);
  g.lineTo(-L * 0.96, H * 0.46);
  g.quadraticCurveTo(-L * 1.06, H * 0.4, -L, H * 0.18);
  g.closePath();
  g.fill();
  g.stroke();
  // 本体
  g.fillStyle = skin.body;
  g.beginPath();
  g.moveTo(-L * 0.98, H * 0.22);
  g.lineTo(-L * 1.0, -H * 0.42);
  g.quadraticCurveTo(-L * 0.92, -H * 0.62, -L * 0.62, -H * 0.6);
  g.quadraticCurveTo(-L * 0.38, -H * 0.36, -L * 0.1, -H * 0.42);
  g.lineTo(L * 0.3, -H * 0.12);
  g.quadraticCurveTo(L * 0.95, -H * 0.05, L * 0.98, H * 0.22);
  g.closePath();
  g.fill();
  g.stroke();
  // つま先
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.ellipse(L * 0.55, H * 0.02, L * 0.3, H * 0.13, -0.15, 0, Math.PI * 2);
  g.fill();
  // ライン
  g.strokeStyle = skin.accent;
  g.lineWidth = lw * 2.2;
  g.beginPath();
  g.moveTo(-L * 0.62, H * 0.08);
  g.quadraticCurveTo(-L * 0.1, -H * 0.05, L * 0.18, -H * 0.3);
  g.stroke();
  // ひも
  g.strokeStyle = skin.lace;
  g.lineWidth = lw * 1.1;
  for (let i = 0; i < 3; i++) {
    const x = -L * 0.08 + i * L * 0.16;
    const y = -H * 0.38 + i * H * 0.1;
    g.beginPath();
    g.moveTo(x - L * 0.06, y - H * 0.04);
    g.lineTo(x + L * 0.08, y + H * 0.06);
    g.stroke();
  }
  // かかとのタブ
  g.fillStyle = skin.accent;
  g.strokeStyle = INK;
  g.lineWidth = lw * 0.8;
  g.beginPath();
  g.roundRect(-L * 1.06, -H * 0.5, L * 0.16, H * 0.34, 3);
  g.fill();
  g.stroke();
  // ハイライト
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = lw * 0.8;
  g.beginPath();
  g.moveTo(-L * 0.85, -H * 0.4);
  g.lineTo(-L * 0.86, -H * 0.05);
  g.stroke();
}

const shoeCache = new Map();
export function shoeSprite(skin, len = 200) {
  const key = `${skin.id}|${len}`;
  if (shoeCache.has(key)) return shoeCache.get(key);
  const c = makeCanvas(len * 1.3, len * 1.0);
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  drawShoe(g, skin, len);
  shoeCache.set(key, c);
  return c;
}

// ===== 子ども =====
// 原点 = お尻（座面）、u = 大きさの単位。facing 右。pose は 0〜1 の値いろいろ。
function limb(g, pts, w, color) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.lineWidth = w + 5;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
  g.strokeStyle = color;
  g.lineWidth = w;
  g.stroke();
}

function polar(x, y, len, a) {
  // a = 真下から反時計回り（右に振ると前）
  return [x + Math.sin(a) * len, y + Math.cos(a) * len];
}

export function drawKid(g, u, pose, skin, opts = {}) {
  const { lean = 0, legKick = 0, armUp = 0.9, face = 'happy', shoeOn = [true, true], hairT = 0, tumble = false } = pose;
  const skinC = '#f6cfa8';
  const shirt = opts.shirt || '#ff5a3c';
  const pants = '#2f4f95';
  // 体の傾き
  const tor = -0.15 - lean * 0.5; // 後ろへ反る（負）
  const hip = [0, -u * 0.4];
  const neck = [hip[0] + Math.sin(-tor) * -u * 3.2 * 0 + Math.sin(tor) * u * 3.2, hip[1] - Math.cos(tor) * u * 3.2];
  // 脚（2本）
  const legA = 1.4 + legKick * 0.35;
  for (const k of [0, 1]) {
    const off = k === 0 ? 0 : -0.18;
    const knee = polar(hip[0], hip[1], u * 2.0, legA + off);
    const kneeBend = tumble ? -1.6 : -1.25 + legKick * 1.15;
    const foot = polar(knee[0], knee[1], u * 2.0, legA + off + kneeBend);
    limb(g, [hip, knee, foot], u * 1.05, k === 0 ? pants : '#284482');
    if (shoeOn[k]) {
      g.save();
      g.translate(foot[0] + u * 0.35, foot[1] + u * 0.15);
      g.rotate(-(legA + off + kneeBend) + Math.PI / 2 - 0.1);
      drawShoe(g, skin, u * 1.9);
      g.restore();
    }
  }
  // 胴体
  limb(g, [hip, neck], u * 1.9, shirt);
  // シャツの白線
  g.strokeStyle = '#ffffff';
  g.lineWidth = u * 0.4;
  g.beginPath();
  const mid = [(hip[0] + neck[0]) / 2, (hip[1] + neck[1]) / 2];
  g.moveTo(mid[0] - u * 0.85, mid[1] + u * 0.1);
  g.lineTo(mid[0] + u * 0.85, mid[1] - u * 0.1);
  g.stroke();
  // 腕（鎖をつかむ：上へ）
  for (const k of [0, 1]) {
    const sh = [neck[0], neck[1] + u * 0.4];
    const a = Math.PI - 0.25 + (1 - armUp) * 2.2 + (k ? 0.25 : 0);
    const el = polar(sh[0], sh[1], u * 1.6, a);
    const hand = polar(el[0], el[1], u * 1.5, a - 0.4);
    limb(g, [sh, el, hand], u * 0.85, k ? '#ff7a5c' : skinC);
    g.fillStyle = skinC;
    g.strokeStyle = INK;
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(hand[0], hand[1], u * 0.5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  // 頭
  const hc = [neck[0] + Math.sin(tor) * u * 1.4, neck[1] - Math.cos(tor) * u * 1.4];
  const hr = u * 1.55;
  g.fillStyle = skinC;
  g.strokeStyle = INK;
  g.lineWidth = 3.5;
  g.beginPath();
  g.arc(hc[0], hc[1], hr, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // 髪（なびく）
  g.fillStyle = '#3a2a1f';
  g.beginPath();
  g.arc(hc[0], hc[1], hr, Math.PI * 0.95, Math.PI * 2.05);
  g.closePath();
  g.fill();
  for (let i = 0; i < 3; i++) {
    const fl = Math.sin(hairT * 18 + i) * 0.25;
    g.beginPath();
    g.moveTo(hc[0] - hr * 0.6, hc[1] - hr * 0.5 + i * hr * 0.25);
    g.lineTo(hc[0] - hr * (1.5 + i * 0.15), hc[1] - hr * (0.6 - fl) + i * hr * 0.3);
    g.lineTo(hc[0] - hr * 0.7, hc[1] - hr * 0.1 + i * hr * 0.25);
    g.closePath();
    g.fill();
  }
  // 帽子
  g.fillStyle = '#2f6fd0';
  g.beginPath();
  g.arc(hc[0], hc[1] - hr * 0.1, hr * 1.02, Math.PI * 1.05, Math.PI * 1.98);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.ellipse(hc[0] + hr * 0.95, hc[1] - hr * 0.22, hr * 0.62, hr * 0.17, 0.08, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // 目
  g.fillStyle = INK;
  if (face === 'fierce') {
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.beginPath();
    g.moveTo(hc[0] + hr * 0.25, hc[1] - hr * 0.08);
    g.lineTo(hc[0] + hr * 0.7, hc[1] + hr * 0.02);
    g.stroke();
  }
  g.beginPath();
  g.ellipse(hc[0] + hr * 0.55, hc[1] + hr * 0.12, hr * 0.12, hr * 0.2, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(hc[0] + hr * 0.58, hc[1] + hr * 0.05, hr * 0.05, 0, Math.PI * 2);
  g.fill();
  // ほっぺ
  g.fillStyle = 'rgba(255,120,120,0.55)';
  g.beginPath();
  g.ellipse(hc[0] + hr * 0.35, hc[1] + hr * 0.45, hr * 0.2, hr * 0.12, 0, 0, Math.PI * 2);
  g.fill();
  // 口
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.beginPath();
  if (face === 'wow') {
    g.fillStyle = '#7a2a2a';
    g.ellipse(hc[0] + hr * 0.72, hc[1] + hr * 0.55, hr * 0.15, hr * 0.2, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else if (face === 'fierce') {
    g.fillStyle = '#fff';
    g.moveTo(hc[0] + hr * 0.45, hc[1] + hr * 0.5);
    g.lineTo(hc[0] + hr * 0.95, hc[1] + hr * 0.45);
    g.lineTo(hc[0] + hr * 0.85, hc[1] + hr * 0.7);
    g.closePath();
    g.fill();
    g.stroke();
  } else {
    g.arc(hc[0] + hr * 0.6, hc[1] + hr * 0.42, hr * 0.22, 0.2, Math.PI - 0.6);
    g.stroke();
  }
  return { head: hc };
}
