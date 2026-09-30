/**
 * seat-shot.mjs — the driver's view, for tuning the cockpit and seat.
 *
 *   node tools/seat-shot.mjs <name> [level] [gear] [WxH] [seat json]
 *
 * seat json (optional) is applied through the real settings store, e.g.
 *   '{"seatY":0.05,"tilt":-6}'
 * The dash screen is lit in R, so shoot in R to judge the reversing camera.
 */
import puppeteer from 'puppeteer-core';

const [, , name = 'seat', lvl = '1', gear = 'R', size = '1440x900', seat = '{}'] = process.argv;
const [W, H] = size.split('x').map(Number);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  protocolTimeout: 180000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: W, height: H },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5175/play/?lowfx=1', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(
  (l, g, s) => {
    const game = window.__game;
    for (const [k, v] of Object.entries(JSON.parse(s))) game.settings.set(k, v);
    game.debugPlay(Number(l));
    game.debugSetGear(g);
    game.debugRig(1.5);
  },
  lvl,
  gear,
  seat
);
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: `tools/shots/${name}.png` });
console.log(`${name}.png ${W}x${H} level=${lvl} gear=${gear} seat=${seat} errors=${errors.length}`);
errors.slice(0, 3).forEach((e) => console.log('  ! ' + e));
await browser.close();
