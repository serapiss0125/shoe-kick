// 調整用：腕前ごとに飛距離を測る  node tools/sim.mjs
import { createGame, step } from '../js/logic.js';
import { createBot, botTap } from '../js/bot.js';
import { distanceText, formatSpeed, STAGES } from '../js/stages.js';

function run(sigma, seed) {
  const g = createGame();
  const bot = createBot(sigma, seed);
  for (let i = 0; i < 120 * 400 && g.phase !== 'done'; i++) {
    step(g, botTap(bot, g));
    g.events.length = 0;
  }
  return g;
}

for (const sigma of [0.02, 0.04, 0.06, 0.09, 0.13, 0.2]) {
  const res = [];
  for (let seed = 1; seed <= 40; seed++) res.push(run(sigma, seed));
  res.sort((a, b) => a.d - b.d);
  const med = res[20];
  const best = res[39];
  const worst = res[0];
  const avg = (k) => (res.reduce((s, g) => s + k(g), 0) / res.length).toFixed(1);
  console.log(
    `σ=${sigma}: 中央 ${distanceText(med.d)}(${STAGES[med.stage].name}) 最高 ${distanceText(best.d)}(${STAGES[best.stage].name}) 最低 ${distanceText(worst.d)} | LV平均 ${avg((g) => g.level)} 大車輪 ${res.filter((g) => g.looping).length}/40 ゲート数平均 ${avg((g) => g.gateIndex)} 時間 ${avg((g) => g.total)}s 最高速 ${formatSpeed(best.maxV).num}${formatSpeed(best.maxV).unit}`,
  );
}

// チャージ LV の分布
for (const sigma of [0.02, 0.05, 0.09, 0.15]) {
  const lv = [0, 0, 0, 0, 0, 0, 0];
  for (let seed = 1; seed <= 60; seed++) {
    const g = createGame();
    const bot = createBot(sigma, seed);
    for (let i = 0; i < 120 * 30 && g.phase !== 'launch'; i++) {
      step(g, botTap(bot, g));
      g.events.length = 0;
    }
    lv[g.level]++;
  }
  console.log(`charge σ=${sigma}: LV分布 ${lv.join(' / ')}`);
}
