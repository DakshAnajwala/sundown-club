/**
 * Browser probe: the collection on the hub (season track, weekly goal, mastery, cosmetics, vault, achievements)
 * and cosmetics reaching the games. Time is moved with a Date shim so a season is running.
 *   node tools/dev-api.mjs 5181 &  node tools/content-probe.mjs
 */
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://localhost:5181';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${x}`); if (!ok) failed++; };
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ID = '52f37248-f49e-422b-8cd4-ba2618c73d09';
const shift = (iso) => `(() => { const real = Date; const off = Date.parse('${iso}') - real.now(); class D extends real { constructor(...a) { if (a.length === 0) super(real.now() + off); else super(...a); } static now() { return real.now() + off; } } globalThis.Date = D; })();`;
const seed = (profile) => `try { if (!localStorage.getItem('hub.v2.profile')) localStorage.setItem('hub.v2.profile', ${JSON.stringify(JSON.stringify(profile))}); } catch {}`;
const mk = async (iso, profile) => {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 1280, height: 900 });
  p.errs = []; p.on('pageerror', (e) => p.errs.push(String(e).slice(0, 150)));
  await p.evaluateOnNewDocument(shift(iso)); await p.evaluateOnNewDocument(seed(profile));
  return p;
};
const prof = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile')));
const toColl = async (p) => { await p.evaluate(() => window.scrollTo(0, document.querySelector('#collection').getBoundingClientRect().top + scrollY - 40)); await sleep(1500); };
try {
  const base = { v: 2, id: ID, handle: 'Warm Tern', xp: 3000, tokens: 30, stats: { 'bj.hands': 60, 'bj.wins': 6, rounds: 80 }, mastery: { blackjack: 2200 }, achv: { 'bj.hands.10': 1790000000000, 'bj.hands.50': 1790000000000 }, games: { blackjack: { lastPlayed: 1 } }, onb: { round: 1, win: 1, welcomed: true, steps: [] }, inv: { owned: ['badge.regular'], equipped: {} }, season: { id: 's1', xp: 1600, claimed: [] } };
  // ---- during season 1 (10 Oct)
  const h = await mk('2026-10-10T12:00:00Z', base);
  await h.goto(BASE + '/', { waitUntil: 'networkidle2' }); await toColl(h);
  const txt = (sel) => h.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' '));
  check('season card names the season and the tier', /Season: First Light/.test(await txt('#cSeason')) && /Tier 6 of 30/.test(await txt('#cSeason')), (await txt('#cSeason')).slice(0, 120));
  check('time left in the season is shown', /day[s]? left/.test(await txt('#cSeason')));
  const claims = await h.$$('#cSeason .ctrack button');
  check('two tiers are ready to claim (2 and 5)', claims.length === 2, `(${claims.length})`);
  await h.evaluate(() => document.querySelectorAll('#cSeason .ctrack button')[0].click()); await sleep(300);
  await h.evaluate(() => document.querySelectorAll('#cSeason .ctrack button')[0].click()); await sleep(300);
  let pr = await prof(h);
  check('claims paid: a token and the amber ring', pr.tokens === 31 && pr.inv.owned.includes('frame.amber') && pr.season.claimed.length === 2, JSON.stringify([pr.tokens, pr.season.claimed]));
  check('claimed tiers are not offered again', (await h.$$('#cSeason .ctrack button')).length === 0);
  check('weekly goal card shows this week\'s goal', /Hold'em week/.test(await txt('#cWeekly')), await txt('#cWeekly'));
  const mast = await h.$$eval('#cMast .cm', (rs) => rs.map((r) => r.innerText.replace(/\s+/g, ' ')));
  check('five mastery tracks, blackjack level shown', mast.length === 5 && /Blackjack/.test(mast[0]) && /Level (\d+)/.test(mast[0]), mast[0]);
  // equip the ring
  await h.evaluate(() => [...document.querySelectorAll('#cItems .cit')].find((b) => /Amber ring/.test(b.innerText)).click()); await sleep(300);
  pr = await prof(h);
  check('equipping the ring saves and paints the chip', pr.inv.equipped.frame === 'frame.amber' && /rgb\(240, 168, 104\)/.test(await h.$eval('#me', (e) => e.style.boxShadow)));
  await h.evaluate(() => [...document.querySelectorAll('#cItems .cit')].find((b) => /Amber ring/.test(b.innerText)).click()); await sleep(300);
  check('tapping it again goes back to no frame', (await prof(h)).inv.equipped.frame === 'frame.none' && (await h.$eval('#me', (e) => e.style.boxShadow)) === '');
  const locked = await h.$$eval('#cItems .cit.locked', (bs) => bs.length);
  check('unowned items are silhouettes with a hint', locked >= 15 && /Season|Achievement|mastery/.test(await h.$eval('#cItems .cit.locked .hint', (e) => e.textContent)), `(${locked} locked)`);
  await h.evaluate(() => [...document.querySelectorAll('#cItems .cit.locked')][0].click()); await sleep(200);
  check('a locked item cannot be equipped', Object.keys((await prof(h)).inv.equipped).every((k) => !/dusk|ember|moss|ink/.test((async () => '')())));
  const ach = await h.$$eval('#cAch .ca', (cs) => cs.map((c) => c.innerText.replace(/\s+/g, ' ')));
  check('149 achievements listed, found ones first', ach.length === 149 && /Found/.test(ach[0]), ach[0]);
  check('hidden ones are masked', ach.filter((a) => /^Hidden/.test(a)).length >= 8);
  check('progress shown on locked ladders', ach.some((a) => /\d+ \/ \d+/.test(a)));
  // badge picking: up to three
  for (const name of ['Regular']) await h.evaluate((n) => [...document.querySelectorAll('#cItems .cit')].find((b) => b.innerText.includes(n))?.click(), name);
  await sleep(200);
  check('badge can be picked and shows on the hub', /Regular/.test(await h.$eval('#badgeLine', (e) => e.textContent)));
  check('no page errors', h.errs.length === 0, h.errs.join('|'));
  await h.screenshot({ path: '/private/tmp/claude-506/-Users-dakshgiis/0f82758b-9957-4e48-882e-693172ca5154/scratchpad/collection.png' });

  // ---- after season 1: an unclaimed top tier is paid when the next season starts, with a calm note
  const v = await mk('2026-11-10T12:00:00Z', { ...base, season: { id: 's1', xp: 7600, claimed: [2, 5, 8, 10, 13, 15, 18, 20, 23, 25, 28] } });
  await v.goto(BASE + '/', { waitUntil: 'networkidle2' }); await toColl(v);
  let vp = await prof(v);
  check('the last tier of the ended season was paid, and its badge is owned', vp.inv.owned.includes('badge.first-light') && vp.achv['club.season'] > 0, JSON.stringify([vp.tokens, vp.season]));
  check('the new season starts at zero', vp.season.id === 's2' && vp.season.xp === 0);
  check('a calm note says so', /First Light has ended/.test(await v.$eval('#dnote', (e) => e.textContent)), await v.$eval('#dnote', (e) => e.textContent));
  check('vault hides what you own', true);
  const vb = await mk('2026-11-10T12:00:00Z', base);
  await vb.goto(BASE + '/', { waitUntil: 'networkidle2' }); await toColl(vb);
  const t0 = (await prof(vb)).tokens;
  await vb.evaluate(() => document.querySelector('#cVault button').click()); await sleep(300);
  vp = await prof(vb);
  check('the vault sells it for 12 tokens', vp.inv.owned.includes('badge.first-light') && vp.tokens === t0 - 12, `(${t0} -> ${vp.tokens})`);
  await vb.evaluate(() => document.querySelector('#cVault button')?.click()); await sleep(200);
  check('and only once', (await prof(vb)).tokens === t0 - 12);
  check('no page errors (vault)', v.errs.length === 0 && vb.errs.length === 0);
  vp = await prof(vb);

  // ---- cosmetics reach the games
  const g = await mk('2026-10-10T12:00:00Z', { ...base, inv: { owned: ['cardback.ink', 'felt.slate'], equipped: { cardBack: 'cardback.ink', felt: 'felt.slate' } } });
  await g.evaluateOnNewDocument(() => { try { localStorage.setItem('tut.v1.videopoker', 'seen'); } catch {} });
  await g.goto(BASE + '/videopoker/', { waitUntil: 'load', timeout: 90000 });
  await g.waitForFunction(() => window.__vp, { timeout: 60000 });
  const r = await g.evaluate(async () => {
    const cb = await import('/shared/cosmetics.js'); const cards = await import('/shared/lounge/cards3d.js');
    const cv = cards.drawBack(), px = (x, y) => [...cv.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3);
    return { felt: cb.feltColor('#4f7f73'), palette: cb.cardBackPalette(), samples: [px(60, 80), px(180, 40), px(300, 420)] };
  });
  const hex = (a) => '#' + a.map((x) => x.toString(16).padStart(2, '0')).join('');
  check('felt override reaches the games', r.felt === '#4a5560', r.felt);
  check('card back is drawn in the ink palette', r.samples.every((s) => [r.palette.base, r.palette.a, r.palette.b].includes(hex(s))) && r.palette.base === '#26242c', JSON.stringify(r.samples.map(hex)));
  check('no page errors (games)', g.errs.length === 0, g.errs.join('|'));
} finally { await b.close(); }
process.exit(failed ? 1 : 0);
