/**
 * Browser probe: the whole first visit. Fresh browser -> hub asks one question -> Blackjack's gentle first hand
 * -> win -> back to the hub -> welcome table (name, badge, claim) -> level 2. Needs WebGL flags.
 *   node tools/dev-api.mjs 5181 &  node tools/onboarding-probe.mjs
 */
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://localhost:5181';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${x}`); if (!ok) failed++; };
const t0 = Date.now();
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
  const prof = () => p.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile') || '{}'));
  await p.goto(BASE + '/', { waitUntil: 'networkidle2' });
  check('picker is shown to a new visitor', !(await p.$eval('#picker', (e) => e.hidden)));
  check('primary action says Take a seat', /Take a seat/.test(await p.$eval('#play', (e) => e.textContent)));
  await p.click('#picker [data-pick="cars"]'); await sleep(300);
  check('cars picks Parking and says Take the wheel', /Take the wheel/.test(await p.$eval('#play', (e) => e.textContent)) && /Parking/.test(await p.$eval('#title', (e) => e.textContent)));
  check('picker hides and the choice is remembered', (await p.$eval('#picker', (e) => e.hidden)) && (await prof()).onb?.pick === 'cars');
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(300);
  check('after a reload the picker stays away and Parking stays selected', (await p.$eval('#picker', (e) => e.hidden)) && /Parking/.test(await p.$eval('#title', (e) => e.textContent)));
  // play Blackjack: the gentle first hand
  const bj = await ctx.newPage();
  await bj.setViewport({ width: 1280, height: 800 });
  await bj.evaluateOnNewDocument(() => { try { localStorage.setItem('tut.v1.blackjack', 'seen'); } catch {} });
  await bj.goto(BASE + '/blackjack/', { waitUntil: 'load', timeout: 90000 });
  await bj.waitForFunction(() => window.__bj && window.__bj.G.phase === 'play', { timeout: 60000 });
  const cards = await bj.evaluate(() => ({ p: window.__bj.G.player.map((c) => c.rank + c.suit).join(' '), d: window.__bj.G.dealer.map((c) => c.rank + c.suit).join(' ') }));
  check('first hand is the gentle one (19 vs 6)', /10S 9H/.test(cards.p.replace(/\s+/g, ' ')) || (cards.p.includes('10') && cards.p.includes('9')), JSON.stringify(cards));
  await sleep(800);
  await bj.keyboard.press('s');
  await bj.waitForFunction(() => window.__bj.G.phase === 'bet', { timeout: 60000 });
  await sleep(800);
  const afterBj = await bj.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile')));
  check('first win recorded with the bonus', afterBj.onb?.win > 0 && afterBj.xp >= 150, `(${afterBj.xp} xp)`);
  check('panel says first win', /First win/.test(await bj.evaluate(() => document.querySelector('.sc-rp')?.innerText || '')));
  check('the practice deal is used once', await bj.evaluate(() => window.__bj.G.firstDone === true && window.__bj.G.firstHand === false));
  await bj.close();
  // hub: welcome table
  await p.bringToFront();
  await p.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => document.getElementById('welcomeDlg').open, { timeout: 10000 });
  check('welcome table opens after the first win', true);
  const t = await p.$eval('#wTitle', (e) => e.textContent);
  const sugg = await p.$$eval('#wNames button', (bs) => bs.map((x) => x.textContent));
  check('three name suggestions and a re-roll', sugg.length === 5, sugg.join(' | '));
  await p.click('#wNames button:nth-child(2)'); await sleep(200);
  const renamed = (await prof()).handle;
  check('picking a suggestion renames', sugg.slice(1, 4).includes(renamed) && (await p.$eval('#wTitle', (e) => e.textContent)).includes(renamed), renamed);
  await p.click('#wBadges button:nth-child(1)');
  await p.click('#wClaim'); await sleep(300);
  const claimed = await prof();
  check('claim from the welcome table: reward given, level 2', claimed.daily?.claimed === true && claimed.xp >= 250, `(${claimed.xp} xp)`);
  await p.click('#wDone'); await sleep(300);
  const done = await prof();
  check('welcome done: badge kept and equipped, never shown again', done.onb.welcomed && done.badges[0] === 'badge.night-owl' && done.inv.owned.includes('badge.night-owl'));
  check('badge line on the hub', /Night Owl/.test(await p.$eval('#badgeLine', (e) => e.textContent)));
  check('header shows level 2', (await p.$eval('#meLvl', (e) => e.textContent)) === '2');
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
  check('welcome does not return', !(await p.$eval('#welcomeDlg', (e) => e.open)));
  check('funnel steps recorded', ['landing', 'picked', 'first_round', 'first_win', 'welcome_open', 'welcome_done'].every((s) => done.onb.steps.includes(s)), done.onb.steps.join(','));
  check('no page errors', errs.length === 0, errs.join('|'));
  check('whole path inside 4 minutes of real time', Date.now() - t0 < 240000, `(${Math.round((Date.now() - t0) / 1000)} s)`);
} finally { await b.close(); }
process.exit(failed ? 1 : 0);
