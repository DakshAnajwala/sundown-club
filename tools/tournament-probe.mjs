/**
 * Browser probe: the Daily Blackjack tournament. Same shoe for two players, 20 hands, tournament chips of its own
 * (club chips, peak and hand count untouched), one go a day, leaving counts as it stands, weekly board, hub card.
 * Needs WebGL flags. node tools/dev-api.mjs 5181 &  node tools/tournament-probe.mjs
 */
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://localhost:5181';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${x}`); if (!ok) failed++; };
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = async () => { const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1280, height: 800 }); p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 150))); await p.evaluateOnNewDocument(() => { try { localStorage.setItem('tut.v1.blackjack', 'seen'); } catch {} }); return p; };
const prof = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile') || '{}'));
const start = async (p) => { await p.goto(BASE + '/blackjack/?tournament=1', { waitUntil: 'load', timeout: 90000 }); await p.waitForFunction(() => window.__bj?.TOUR.on, { timeout: 60000 }); };
const playHand = async (p) => {
  await p.evaluate(() => { window.__bj.TL.speed = 4; window.__bj.G.lastBet = 50; window.__bj.deal(); });
  await p.waitForFunction(() => ['play', 'bet'].includes(window.__bj.G.phase) && !window.__bj.TL.busy, { timeout: 60000 });
  if (await p.evaluate(() => window.__bj.G.phase === 'play')) { await p.evaluate(() => window.__bj.stand()); await p.waitForFunction(() => window.__bj.G.phase === 'bet' && !window.__bj.TL.busy, { timeout: 60000 }); }
};
const post = (body, now) => fetch(BASE + '/api/club/play', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.9.9.9', ...(now ? { 'x-dev-now': String(now) } : {}) }, body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({})));
try {
  const A = await page();
  await start(A);
  const first = async (p) => { await p.evaluate(() => { window.__bj.TL.speed = 4; window.__bj.G.lastBet = 50; window.__bj.deal(); }); await p.waitForFunction(() => window.__bj.G.player.length >= 2 && window.__bj.G.dealer.length >= 2, { timeout: 30000 }); return p.evaluate(() => [...window.__bj.G.player, ...window.__bj.G.dealer].map((c) => c.rank + c.suit).join(' ')); };
  check('tournament chips are separate and the tag shows', await A.evaluate(() => window.__bj.G.bank === 1000 && /Tournament 0 \/ 20/.test(document.getElementById('practiceTag').textContent)));
  const cardsA = await first(A);
  await A.waitForFunction(() => ['play', 'bet'].includes(window.__bj.G.phase) && !window.__bj.TL.busy, { timeout: 60000 });
  if (await A.evaluate(() => window.__bj.G.phase === 'play')) { await A.evaluate(() => window.__bj.stand()); await A.waitForFunction(() => window.__bj.G.phase === 'bet' && !window.__bj.TL.busy, { timeout: 60000 }); }
  // give the server the play time it expects before the final report (the dev clock lets us do this in one go)
  const pid = (await prof(A)).id, t0 = Date.now() - 10 * 60000;
  const s = await post({ a: 'session', player: pid, game: 'blackjack' }, t0); for (let m = 1; m <= 5; m++) await post({ a: 'beat', token: s.token }, t0 + m * 60000);
  for (let i = 1; i < 20; i++) await playHand(A);
  await A.waitForFunction(() => !window.__bj.TOUR.on, { timeout: 60000 });
  const done = await A.evaluate(() => ({ chips: localStorage.getItem('club.v1.chips'), bj: JSON.parse(localStorage.getItem('bj.v1.main') || '{}'), prof: JSON.parse(localStorage.getItem('hub.v2.profile')), bank: window.__bj.G.bank }));
  check('20 hands played, then the tournament ends', true);
  check('the result is kept with the stack', done.prof.seeds?.results?.blackjack && Number.isInteger(done.prof.seeds.results.blackjack.stack) && done.prof.seeds.results.blackjack.hands === 20, JSON.stringify(done.prof.seeds?.results?.blackjack));
  check('club chips, peak and hand count untouched by the tournament', (done.chips === null || JSON.parse(done.chips).bankroll === 1000) && !(done.bj.hands > 0 && done.bj.hands !== undefined && done.bj.hands > 0), JSON.stringify([done.chips, done.bj]));
  check('back at the club table with the club chips', done.bank === 1000);
  check('seed XP paid (+50 on top of round XP)', done.prof.xp >= 50 + 20 * 5, `(${done.prof.xp} xp)`);
  check('the share button is offered', !(await A.$eval('#bShare', (e) => e.hidden)));
  const board = await (await fetch(`${BASE}/api/club/board?tab=tour&player=${pid}`)).json();
  check('the weekly board has the stack', board.rows.length === 1 && board.you && board.you.value === done.prof.seeds.results.blackjack.stack, JSON.stringify(board.you));
  await A.keyboard.press('n'); await sleep(600);
  check('a second go is refused', await A.evaluate(() => !window.__bj.TOUR.on && /tournament/i.test(document.getElementById('toast').textContent)), await A.$eval('#toast', (e) => e.textContent));
  // same shoe for another player
  await A.close();
  const B = await page(); await start(B);
  const cardsB = await first(B);
  check('another player gets the same first hand', cardsA === cardsB, `${cardsA} vs ${cardsB}`);
  // leaving mid-tournament counts as it stands
  await B.waitForFunction(() => ['play', 'bet'].includes(window.__bj.G.phase) && !window.__bj.TL.busy, { timeout: 60000 });
  if (await B.evaluate(() => window.__bj.G.phase === 'play')) { await B.evaluate(() => window.__bj.stand()); await B.waitForFunction(() => window.__bj.G.phase === 'bet' && !window.__bj.TL.busy, { timeout: 60000 }); }
  await playHand(B);
  await B.keyboard.press('Escape'); await sleep(400); await B.keyboard.press('Escape'); await sleep(900);
  const left = await prof(B);
  check('leaving counts the tournament as it stands', left.seeds?.results?.blackjack && left.seeds.results.blackjack.hands === 2, JSON.stringify(left.seeds?.results?.blackjack));
  check('and the same shoe cannot be replayed', await (async () => { await B.goto(BASE + '/blackjack/?tournament=1', { waitUntil: 'load', timeout: 90000 }); await sleep(3500); return B.evaluate(() => !window.__bj.TOUR.on); })());
  // hub card
  const H = await page(); await H.evaluate(() => 0);
  await H.evaluateOnNewDocument((p) => { if (!localStorage.getItem('hub.v2.profile')) localStorage.setItem('hub.v2.profile', p); }, JSON.stringify(done.prof));
  await H.goto(BASE + '/', { waitUntil: 'networkidle2' });
  const txt = await H.$eval('#dseed', (e) => e.innerText.replace(/\s+/g, ' '));
  check('the hub shows the tournament and its result', /Blackjack tournament/.test(txt) && /chips/.test(txt), txt.slice(0, 160));
  check('no page errors', [A, B, H].every((p) => p.errs.length === 0), [A, B, H].flatMap((p) => p.errs).join('|'));
} finally { await b.close(); }
process.exit(failed ? 1 : 0);
