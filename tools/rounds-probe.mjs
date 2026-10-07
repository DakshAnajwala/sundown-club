/**
 * Browser probe: finished rounds reach the club's daily loop in the real pages.
 * Plays Video Poker (deal + draw, space) and checks the profile, the round
 * panel and telemetry. Needs WebGL (swiftshader flags below).
 *   node tools/dev-api.mjs 5181 &  node tools/rounds-probe.mjs
 */
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://localhost:5181';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${x}`); if (!ok) failed++; };
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('tut.v1.videopoker', 'seen'); } catch {} });
  await p.goto(BASE + '/videopoker/', { waitUntil: 'networkidle2' });
  await sleep(2500);
  const prof = () => p.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile') || '{}'));
  for (let i = 0; i < 3; i++) { await p.keyboard.press('Space'); await sleep(1500); await p.keyboard.press('Space'); await sleep(3200); }
  const pr = await prof();
  check('three rounds counted', pr.daily?.rounds === 3, `(${pr.daily?.rounds})`);
  check('round xp earned', pr.xp >= 12, `(${pr.xp} xp)`);
  check('three quests exist', pr.daily?.quests?.length === 3);
  const panel = await p.evaluate(() => document.querySelector('.sc-rp')?.innerText || '');
  check('after-round panel is on screen', /XP|Round done/.test(panel), panel.replace(/\n/g, ' | '));
  check('no page errors', errs.length === 0, errs.join('|'));
  await p.screenshot({ path: process.env.SHOT || '/private/tmp/claude-506/-Users-dakshgiis/0f82758b-9957-4e48-882e-693172ca5154/scratchpad/vp-panel.png' });
  await p.goto('about:blank');   // stop its render loop before the next page (software GL is slow)
  // Blackjack: chip, deal, stand
  const bj = await (await b.createBrowserContext()).newPage();
  await bj.setViewport({ width: 1280, height: 800 });
  await bj.evaluateOnNewDocument(() => { try { localStorage.setItem('tut.v1.blackjack', 'seen'); } catch {} });
  await bj.goto(BASE + '/blackjack/', { waitUntil: 'load', timeout: 90000 });
  await sleep(2500);
  for (let i = 0; i < 2; i++) {
    await bj.keyboard.press('2'); await bj.keyboard.press('Space'); await sleep(5000);
    for (let k = 0; k < 4; k++) { await bj.keyboard.press('s'); await sleep(2500); }
    await sleep(2500);
  }
  const bjp = await bj.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile') || '{}'));
  check('blackjack rounds counted', bjp.daily?.rounds >= 1, `(${bjp.daily?.rounds} rounds, ${bjp.xp} xp)`);
  // Hold'em: fold a few hands
  const hd = await (await b.createBrowserContext()).newPage();
  await hd.setViewport({ width: 1280, height: 800 });
  await hd.evaluateOnNewDocument(() => { try { localStorage.setItem('tut.v1.holdem', 'seen'); } catch {} });
  await bj.close();
  await hd.goto(BASE + '/holdem/', { waitUntil: 'load', timeout: 90000 });
  await sleep(3000);
  for (let i = 0; i < 24; i++) { await hd.keyboard.press('f'); await sleep(1200); await hd.keyboard.press('Space'); }
  const hdp = await hd.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile') || '{}'));
  check("hold'em hands counted", hdp.daily?.rounds >= 1, `(${hdp.daily?.rounds} rounds, ${hdp.xp} xp)`);
  await hd.close();
  const q = await (await b.createBrowserContext()).newPage();
  await q.goto(BASE + '/', { waitUntil: 'load' });
  await sleep(500);
  const bodies = await (await fetch(BASE + '/dev/bodies')).json();
  check('round_end telemetry sent', bodies.join('').includes('round_end'));
} finally { await b.close(); }
process.exit(failed ? 1 : 0);
