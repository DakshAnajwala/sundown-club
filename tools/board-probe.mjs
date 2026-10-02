/**
 * Browser probe: the club boards end to end against tools/dev-api.mjs (memory store, dev clock).
 * Seeds 12 players through the real API, then checks the hub's board, a real game page's heartbeat
 * (idle earns nothing, play does), "New name" limits, and "Show me on the boards" off. Takes ~2 minutes.
 *   node tools/dev-api.mjs 5181 &  node tools/board-probe.mjs
 */
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://localhost:5181';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${x}`); if (!ok) failed++; };
const id = (k) => `${String(k).padStart(8, '0')}-1111-4111-8111-000000000000`;
const post = (body, now) => fetch(BASE + '/api/club/play', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${body.player ? parseInt(body.player.slice(0, 8)) % 200 : 1}`, ...(now ? { 'x-dev-now': String(now) } : {}) }, body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({})));
const get = (q) => fetch(`${BASE}/api/club/board?${q}`).then((r) => r.json());

// 12 seeded players, 5..16 minutes each, this week
const t0 = Date.now() - 30 * 60000;
for (let i = 1; i <= 12; i++) {
  const s = await post({ a: 'session', player: id(i), game: i % 2 ? 'blackjack' : 'parking' }, t0);
  for (let m = 1; m <= 4 + i; m++) await post({ a: 'beat', token: s.token }, t0 + m * 60000);
}
const b0 = await get('tab=time&win=week');
check('seeded board has 12 players and ranks', b0.total === 12 && b0.rows.length === 10 && b0.rows[0].rank === 1, JSON.stringify(b0.rows.slice(0, 2)));
check('no ids or typed text in the response', !JSON.stringify(b0).match(/[0-9a-f]{8}-1111/) && b0.rows.every((r) => /^[A-Z][a-z]+ [A-Z][a-z]+ \d+$/.test(r.name)));

const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await b.createBrowserContext();
  // a real game page: heartbeat every 35 s (probe override), idle first
  const g = await ctx.newPage();
  await g.setViewport({ width: 1100, height: 700 });
  const calls = [];
  g.on('request', (r) => { if (r.url().includes('/api/club/play')) calls.push(r.postData() || ''); });
  await g.evaluateOnNewDocument(() => { globalThis.__scBeatMs = 35000; try { localStorage.setItem('tut.v1.videopoker', 'seen'); } catch {} });
  await g.goto(BASE + '/videopoker/', { waitUntil: 'load', timeout: 90000 });
  await sleep(2000);
  const pid = await g.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile')).id);
  const mine = async () => (await get(`tab=time&win=all&player=${pid}`)).you;
  await sleep(2500);
  check('session started, still no time credited', (await mine()) === null || (await mine()).value === 0, JSON.stringify(await mine()));
  // keep "playing" (key presses) across two beats; first beat needs >= 30 s after the session start
  for (let i = 0; i < 26; i++) { await g.keyboard.press('b'); await sleep(3000); }
  const credited = await mine();
  check('real play earns time (about a minute)', credited && credited.value >= 30 && credited.value <= 80, JSON.stringify(credited));
  // idle: no input for the next beat window (2 min rule would need 2+ min; instead hide the tab)
  const beatsBefore = calls.filter((c) => c.includes('"beat"')).length;
  await g.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(40000);
  check('a hidden tab sends no beats', calls.filter((c) => c.includes('"beat"')).length === beatsBefore);
  check('no names or text sent from the page', !calls.join('').match(/handle|Heron|name/i));

  // hub
  const h = await ctx.newPage();
  await h.setViewport({ width: 1280, height: 900 });
  const errs = []; h.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
  await h.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await h.evaluate(() => window.scrollTo(0, document.querySelector('#board').getBoundingClientRect().top + scrollY - 40));
  await sleep(2500);
  const rows = await h.$$eval('#bRows .brow', (rs) => rs.map((r) => r.innerText.replace(/\s+/g, ' ')));
  check('board renders ten rows, ranked', rows.length >= 10 && rows[0].startsWith('01'), rows.slice(0, 2).join(' | '));
  check('you are shown (your play time counted)', rows.some((r) => /You/.test(r)) || (await h.$eval('#bYouBig', (e) => e.textContent)).includes('#'), await h.$eval('#bYouBig', (e) => e.textContent));
  const name1 = await h.$eval('#bName', (e) => e.textContent);
  check('a made-up name is shown', /^[A-Z][a-z]+ [A-Z][a-z]+ \d+$/.test(name1), name1);
  const seen = new Set([name1]);
  for (let i = 0; i < 4; i++) { await h.click('#bReroll'); await sleep(300); seen.add(await h.$eval('#bName', (e) => e.textContent)); }
  check('three new names a day, then no more', seen.size === 4 && /three new names/i.test(await h.$eval('#bNameNote', (e) => e.textContent)), [...seen].join(' | '));
  await h.click('#bWin button[data-w="all"]'); await sleep(600);
  check('all-time window works', (await h.$$('#bRows .brow')).length >= 10);
  for (const [k, label] of [['streak', 'Streak'], ['bj', 'Blackjack']]) { await h.evaluate((kk) => document.querySelector(`#bTabs [data-k="${kk}"]`).click(), k); await sleep(500); check(`${label} tab loads without error`, (await h.$$('#bRows .brow, #bRows .bempty')).length >= 1); }
  // off: removed, nothing more sent
  await h.click('#bOpt'); await sleep(800);
  check('switch off removes you from the board', (await get(`tab=time&win=all&player=${pid}`)).you === null);
  check('switch off says so', /Hidden/.test(await h.$eval('#bName', (e) => e.textContent)));
  check('no page errors', errs.length === 0, errs.join('|'));
  await h.screenshot({ path: '/private/tmp/claude-506/-Users-dakshgiis/0f82758b-9957-4e48-882e-693172ca5154/scratchpad/board.png' });
} finally { await b.close(); }
process.exit(failed ? 1 : 0);
