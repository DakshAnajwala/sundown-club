/** Browser probe: the hub's Daily Table (draw, reroll, claim, streak, rest day). node tools/dev-api.mjs 5181 &  node tools/daily-probe.mjs */
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://localhost:5181';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${x}`); if (!ok) failed++; };
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
try {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 1280, height: 900 });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(BASE + '/', { waitUntil: 'networkidle2' });
  const goEvening = async () => { await p.evaluate(() => window.scrollTo(0, document.querySelector('#evening').getBoundingClientRect().top + scrollY - 40)); await sleep(1800); };
  const text = (sel) => p.$eval(sel, (e) => e.textContent);
  check('three quests drawn', (await p.$$('#dq .q')).length === 3);
  check('claim is offered', !(await p.$eval('#claim', (e) => e.disabled)) && /Claim daily reward/.test(await text('#claim')));
  check('lobby strip invites', /reward is waiting/.test(await text('#tonightTxt')));
  check('header dot shows', !(await p.$eval('#meDot', (e) => e.hidden)));
  const before = await p.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile')));
  check('profile has daily + 3 quests', before.daily.quests.length === 3 && before.daily.day);
  await goEvening();
  const q0 = await text('#dq .q .qt span');
  await p.click('#dq .q .qm button'); await sleep(200);
  check('swap changes the first quest and uses the reroll', (await text('#dq .q .qt span')) !== q0 && (await p.$$('#dq .qm button')).length === 0);
  await p.click('#claim'); await sleep(300);
  const after = await p.evaluate(() => ({ p: JSON.parse(localStorage.getItem('hub.v2.profile')), chips: JSON.parse(localStorage.getItem('club.v1.chips')) }));
  check('claim: +100 XP (and the First claim achievement, 25), +1 token, chips 1250', after.p.xp === 125 && after.p.tokens === 1 && after.chips.bankroll === 1250 && after.p.achv['club.claims.1'] > 0, JSON.stringify([after.p.xp, after.p.tokens, after.chips]));
  check('claim also counts the day', after.p.streak.days === 1 && after.p.streak.last);
  check('button locks', await p.$eval('#claim', (e) => e.disabled));
  await p.click('#claim').catch(() => {});
  check('no double claim', (await p.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile')).xp)) === 125);
  check('streak shows 1 day', (await text('#dstreak .bigdays')).startsWith('1'));
  await p.select('#restSel', '3'); await sleep(200);
  check('rest day saved', await p.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile')).streak.rest === 3));
  // yesterday's run with a missed day and one freeze: freeze is spent, note shown
  await p.evaluate(() => { const k = 'hub.v2.profile'; const pr = JSON.parse(localStorage.getItem(k)); const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }; pr.streak = { days: 9, last: d(2), best: 9, freezes: 1, rest: null }; pr.daily.day = d(1); localStorage.setItem(k, JSON.stringify(pr)); });
  await p.reload({ waitUntil: 'networkidle2' }); await goEvening();
  const sp = await p.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile')).streak);
  check('missed day covered by the freeze', sp.freezes === 0 && sp.days === 9 && sp.covered.length === 1, JSON.stringify(sp));
  check('calm note shown', /freeze covered/.test(await text('#dnote')), await text('#dnote'));
  check('new day, new table, claim open again', !(await p.$eval('#claim', (e) => e.disabled)));
  // broken run: no freezes
  await p.evaluate(() => { const k = 'hub.v2.profile'; const pr = JSON.parse(localStorage.getItem(k)); const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }; pr.streak = { days: 6, last: d(3), best: 9, freezes: 0, rest: null }; pr.tokens = 2; localStorage.setItem(k, JSON.stringify(pr)); });
  await p.reload({ waitUntil: 'networkidle2' }); await goEvening();
  check('broken run: calm note, restore offered', /run ended/.test(await text('#dnote')) && (await p.$$('#dstreak button.btn')).length === 1, await text('#dnote'));
  await p.click('#dstreak button.btn'); await sleep(300);
  check('restore brings the run back for one token', await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('hub.v2.profile')); return x.streak.days === 6 && x.tokens === 1; }));
  check('no page errors', errs.length === 0, errs.join('|'));
  await p.screenshot({ path: process.env.SHOT || '/private/tmp/claude-506/-Users-dakshgiis/0f82758b-9957-4e48-882e-693172ca5154/scratchpad/daily.png' });
} finally { await b.close(); }
process.exit(failed ? 1 : 0);
