/** Browser probe: Video Poker's daily hand (same cards for two players, one go, chips untouched) and the hub card. Needs WebGL flags. */
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://localhost:5181';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${x}`); if (!ok) failed++; };
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const open = async (ctx) => { const p = await ctx.newPage(); await p.setViewport({ width: 1280, height: 800 }); await p.evaluateOnNewDocument(() => { try { localStorage.setItem('tut.v1.videopoker', 'seen'); } catch {} }); return p; };
const hand = (p) => p.evaluate(() => window.__vp.machine.hand.map((c) => c.rank + c.suit).join(' '));
try {
  const ctxA = await b.createBrowserContext(), ctxB = await b.createBrowserContext();
  const a = await open(ctxA);
  const errs = []; a.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
  await a.goto(BASE + '/videopoker/?daily=1', { waitUntil: 'load', timeout: 90000 });
  await a.waitForFunction(() => window.__vp?.D.on && window.__vp.machine.phase === 'dealt', { timeout: 60000 });
  const handA = await hand(a);
  check('daily hand dealt automatically', handA.split(' ').length === 5 && await a.evaluate(() => window.__vp.D.on), handA);
  check('no chips taken', await a.evaluate(() => window.__vp.bank === 1000));
  await sleep(1500); await a.keyboard.press('Space'); await a.waitForFunction(() => !window.__vp.D.on, { timeout: 30000 }); await sleep(500);   // draw with nothing held
  const prof = await a.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile') || '{}'));
  const keys = Object.keys(prof.seeds?.results || {});
  check('result kept once', keys.join() === 'videopoker', JSON.stringify(prof.seeds));
  check('+50 XP and the day counts', prof.xp >= 50 && prof.streak?.days === 1, `(${prof.xp} xp)`);
  check('chips unchanged, hands stat unchanged', await a.evaluate(() => JSON.parse(localStorage.getItem('club.v1.chips') || '{"bankroll":1000}').bankroll === 1000 && !(JSON.parse(localStorage.getItem('vp.v1') || '{}').hands)));
  check('mode off after the hand', await a.evaluate(() => !window.__vp.D.on));
  const before = JSON.stringify(prof.seeds);
  await a.keyboard.press('d'); await sleep(800);
  check('second go refused with a toast', await a.evaluate(() => !window.__vp.D.on && window.__vp.machine.phase === 'idle' && /Today.s hand/.test(document.getElementById('toast').textContent)));
  check('result untouched', JSON.stringify((await a.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile')))).seeds) === before);
  // another player, same cards
  const c = await open(ctxB);
  await c.goto(BASE + '/videopoker/?daily=1', { waitUntil: 'load', timeout: 90000 });
  await c.waitForFunction(() => window.__vp?.D.on && window.__vp.machine.phase === 'dealt', { timeout: 60000 });
  check('another browser gets the same five cards', (await hand(c)) === handA, `${await hand(c)} vs ${handA}`);
  // leaving mid-hand counts for nothing
  await c.keyboard.press('Escape'); await sleep(300); await c.keyboard.press('Escape'); await sleep(800);
  await c.close();
  // hub card
  const h = await (await b.createBrowserContext()).newPage();
  await h.setViewport({ width: 1280, height: 900 });
  await h.evaluateOnNewDocument((prof) => { if (!localStorage.getItem('hub.v2.profile')) localStorage.setItem('hub.v2.profile', prof); }, JSON.stringify(prof));
  await h.goto(BASE + '/', { waitUntil: 'networkidle2' });
  const txt = await h.$eval('#dseed', (e) => e.innerText);
  check('hub card names the daily and shows the result', /Sundown Daily #5|Sundown Daily #\d+/.test(txt) && /coins|No win/.test(txt), txt.replace(/\n+/g, ' | '));
  check('no page errors', errs.length === 0, errs.join('|'));
} finally { await b.close(); }
process.exit(failed ? 1 : 0);
