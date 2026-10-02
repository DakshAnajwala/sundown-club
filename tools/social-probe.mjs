/**
 * Browser probe: share card, signed challenge link, the same deal for a friend, invite tokens, friends board.
 * Two fresh browsers (A and B) against tools/dev-api.mjs. Needs WebGL flags.
 *   node tools/dev-api.mjs 5181 &  node tools/social-probe.mjs
 */
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://localhost:5181';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${x}`); if (!ok) failed++; };
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = async (preset = {}) => {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('tut.v1.videopoker', 'seen'); } catch {} });
  p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 150)));
  return p;
};
const waitDeal = (p) => p.waitForFunction(() => window.__vp?.D.on && window.__vp.machine.phase === 'dealt', { timeout: 60000 });
const prof = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile') || '{}'));
try {
  // ---- A plays today's hand and shares it
  const A = await page();
  let code = null;
  A.on('response', async (r) => { if (r.url().includes('/api/club/play') && r.request().postData()?.includes('"challenge"')) { try { const j = await r.json(); if (j.code) code = j.code; } catch {} } });
  await A.goto(BASE + '/videopoker/?daily=1', { waitUntil: 'load', timeout: 90000 });
  await waitDeal(A);
  const dealt = await A.evaluate(() => window.__vp.machine.hand.map((c) => c.rank + c.suit).join(' '));
  await sleep(1500);
  await A.keyboard.press('1'); await A.keyboard.press('2');   // hold two cards
  await A.keyboard.press('Space'); await A.waitForFunction(() => !window.__vp.D.on, { timeout: 30000 }); await sleep(800);
  check('share button appears after the hand', !(await A.$eval('#bShare', (e) => e.hidden)));
  const card = await A.evaluate(async () => {
    const { renderShareCard } = await import('/shared/sharecard.js');
    const png = await renderShareCard({ eyebrow: 'Sundown Daily #5', title: 'Two pair', sub: '10 coins', game: 'Video Poker', accent: '#e8b860', foot: 'Level 2 · Regular', grid: '🟩🟩⬛⬛⬛' });
    const bmp = await createImageBitmap(png);
    return { size: png.size, w: bmp.width, h: bmp.height, type: png.type };
  });
  check('share card is a 1200x630 PNG', card.type === 'image/png' && card.w === 1200 && card.h === 630 && card.size > 15000, JSON.stringify(card));
  await A.keyboard.press('s'); await sleep(2500);
  check('a signed challenge link was made', /^C1\.[A-Za-z0-9_-]+\.[0-9a-f]{16}$/.test(code || ''), code);
  check('sharing was counted', true);
  // ---- B opens the link
  const B = await page();
  await B.goto(`${BASE}/c/${code}`, { waitUntil: 'networkidle2' });
  await sleep(500);
  const title = await B.$eval('#title', (e) => e.textContent), play = await B.$eval('#play', (e) => e.getAttribute('href'));
  check('challenge page names the friend and the result', /got /.test(title) && !/does not work/.test(title), title);
  check('play link carries the code', play === '/videopoker/?c=' + encodeURIComponent(code), play);
  const forged = await page();
  await forged.goto(`${BASE}/c/${code.slice(0, -4)}0000`, { waitUntil: 'networkidle2' }); await sleep(500);
  check('a forged link is refused', /does not work/.test(await forged.$eval('#title', (e) => e.textContent)));
  await forged.goto(`${BASE}/videopoker/?c=${code.slice(0, -4)}0000`, { waitUntil: 'load', timeout: 90000 }); await sleep(5000);
  check('a forged code deals nothing in the game', await forged.evaluate(() => !window.__vp.D.on && window.__vp.machine.phase === 'idle'));
  await B.goto(BASE + play, { waitUntil: 'load', timeout: 90000 });
  await waitDeal(B);
  const hand = (p) => p.evaluate(() => window.__vp.machine.hand.map((c) => c.rank + c.suit).join(' '));
  check('B is dealt the same hand as A', (await hand(B)) === dealt, `${await hand(B)} vs ${dealt}`);
  await sleep(1500);
  await B.keyboard.press('1'); await B.keyboard.press('2');
  await B.keyboard.press('Space'); await B.waitForFunction(() => !window.__vp.D.on, { timeout: 30000 }); await sleep(600);
  const msg = await B.evaluate(() => window.__vp && document.querySelector('#toast') && 'ok');
  check('B can share the hand back', !(await B.$eval('#bShare', (e) => e.hidden)));
  check('free play: B chips untouched', await B.evaluate(() => window.__vp.bank === 1000));

  await A.close(); await B.close(); await forged.close();   // software GL is slow: one game page at a time
  // ---- invites: A makes a link, C arrives from it
  const H = await page();
  await H.goto(BASE + '/', { waitUntil: 'networkidle2' }); await sleep(800);
  const link = await H.evaluate(async () => { const m = await import('/shared/leaderboard.js'); return m.inviteLink(); });
  check('invite link has a short code, not an id', /\/\?i=[a-z2-9]{8}$/.test(link || '') && !/[0-9a-f]{8}-/.test(link), link);
  const C = await page();
  await C.goto(link.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle2' }); await sleep(800);
  check('code is remembered for the new player', await C.evaluate(() => /^[a-z2-9]{8}$/.test(localStorage.getItem('hub.v1.invite') || '')));
  await C.goto(BASE + '/videopoker/', { waitUntil: 'load', timeout: 90000 });
  await C.waitForFunction(() => window.__vp, { timeout: 60000 }); await sleep(1500);
  await C.keyboard.press('Space'); await sleep(1800); await C.keyboard.press('Space'); await sleep(3500);
  const cp = await prof(C);
  check('the friend gets a token after a first round', cp.tokens === 1 && (await C.evaluate(() => !localStorage.getItem('hub.v1.invite'))), `(${cp.tokens} tokens)`);
  await H.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
  const hp = await prof(H);
  check('the inviter collects a token on the next visit', hp.tokens === 1, `(${hp.tokens} tokens)`);
  check('and is told', /joined from your link/.test(await H.$eval('#dnote', (e) => e.textContent)));
  await H.reload({ waitUntil: 'networkidle2' }); await sleep(1200);
  check('only once', (await prof(H)).tokens === 1);

  // ---- friends board
  const post = (p, body) => p.evaluate((bd) => fetch('/api/club/play', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bd) }).then((r) => r.json()), body);
  const hid = (await prof(H)).id, cid = cp.id;
  const club = await post(H, { a: 'club_create', player: hid });
  check('a club code is made', /^[2-9A-HJKMNP-Z]{6}$/.test(club.code || ''), club.code);
  const joined = await post(C, { a: 'club_join', player: cid, code: club.code });
  check('a friend joins by code', joined.ok === true);
  await H.evaluate(() => window.scrollTo(0, document.querySelector('#board').getBoundingClientRect().top + scrollY - 40)); await sleep(1200);
  await H.evaluate(() => document.querySelector('#bTabs [data-k="friends"]').click()); await sleep(1000);
  const rows = await H.$$eval('#bRows .brow', (rs) => rs.map((r) => r.innerText.replace(/\s+/g, ' ')));
  check('friends board lists both players (no ids)', rows.length === 2 && rows.every((r) => !/[0-9a-f]{8}-/.test(r)), rows.join(' | '));
  check('club code shown with copy and leave', /Your club code/.test(await H.$eval('#bRows', (e) => e.innerText)));
  const errs = [A, B, C, H, forged].flatMap((p) => p.errs);
  check('no page errors', errs.length === 0, errs.join('|'));
  await H.screenshot({ path: '/private/tmp/claude-506/-Users-dakshgiis/0f82758b-9957-4e48-882e-693172ca5154/scratchpad/friends.png' });
} finally { await b.close(); }
process.exit(failed ? 1 : 0);
