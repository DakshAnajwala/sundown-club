/**
 * needle-probe.mjs — samples the cluster needles against the values they
 * track, so "swings and settles without overshoot" is a number, not a vibe.
 *
 *   node tools/needle-probe.mjs
 */
import puppeteer from 'puppeteer-core';

const URL = 'http://localhost:5175/play/?lowfx=1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 180000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 640, height: 400 },
});
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(2000);

await page.evaluate(() => {
  const g = window.__game;
  g.debugPlay(0);
  g.debugRig(1.0);
  g.debugSetGear('D');
  g.debugRig(0.2);
});

const sample = () =>
  page.evaluate(() => {
    const d = window.__game.debugRig(0.1);
    return {
      kmh: d.car.speedKmh,
      rpm: d.car.rpm,
      speedNeedleKmh: d.needles.speed * 60,
      tachoNeedleRpm: d.needles.tacho * 7000,
    };
  });

console.log('   t   km/h  needle |   rpm   needle');
let t = 0;
await page.keyboard.down('w');
for (let i = 0; i < 12; i++) {
  const s = await sample();
  t += 0.1;
  console.log(row(t, s));
}
await page.keyboard.up('w');
await page.keyboard.down('s');
for (let i = 0; i < 12; i++) {
  const s = await sample();
  t += 0.1;
  console.log(row(t, s) + '  (braking)');
}
await page.keyboard.up('s');
// Hold still and look for overshoot below the settled value.
let minSpeedNeedle = Infinity;
for (let i = 0; i < 10; i++) {
  const s = await sample();
  minSpeedNeedle = Math.min(minSpeedNeedle, s.speedNeedleKmh);
}
console.log(`settled min speed needle: ${minSpeedNeedle.toFixed(3)} km/h (negative = overshoot)`);
await browser.close();

function row(t, s) {
  return `${t.toFixed(1).padStart(4)} ${s.kmh.toFixed(1).padStart(6)} ${s.speedNeedleKmh
    .toFixed(1)
    .padStart(6)} | ${Math.round(s.rpm).toString().padStart(5)} ${Math.round(s.tachoNeedleRpm)
    .toString()
    .padStart(6)}`;
}
