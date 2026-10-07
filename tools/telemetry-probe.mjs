/**
 * Headless probe: fresh browser plays two pages, events land; opt-out sends nothing.
 *   node tools/dev-api.mjs 5181 &   then   node tools/telemetry-probe.mjs [http://localhost:5181]
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://localhost:5181';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!ok) failed++; };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const metrics = async () => (await fetch(`${BASE}/api/club/metrics`, { headers: { authorization: 'Bearer dev' } })).json();

try {
  // 1. fresh player, on
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const sent = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/holdem/`, { waitUntil: 'networkidle2' });
  await sleep(500);
  await page.goto(`${BASE}/videopoker/`, { waitUntil: 'networkidle2' });
  await sleep(500);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
  await sleep(500);
  await page.close();
  await sleep(500);
  const m = await metrics();
  check('DAU is 1', m.dau[29].n === 1, `(${m.dau[29].n})`);
  check('cohort today has the new player', m.cohorts[13].size === 1, `(${m.cohorts[13].size})`);
  check('holdem + videopoker counted', m.events['game_open|holdem'] === 1 && m.events['game_open|videopoker'] === 1);
  check('second game funnel step', m.funnel.second_game === 1 && m.funnel.game_open === 1);
  check('session_start once per tab session', m.events.session_start === 1, `(${m.events.session_start})`);
  check('session_end recorded', (m.events.session_end || 0) >= 1);
  check('no page errors', errors.length === 0, errors.join(' | '));
  const sent2 = await (await fetch(`${BASE}/dev/bodies`)).json();
  sent.push(...sent2);
  const body = JSON.parse(sent[0] || '{}');
  check('payload is only id + events', Object.keys(body).sort().join() === 'events,player');
  check('no handle in payload', !sent.join('').match(/Heron|Otter|handle/));
  await ctx.close();

  // 2. opt-out sends nothing
  const ctx2 = await browser.createBrowserContext();
  const p2 = await ctx2.newPage();
  let n = 0;
  p2.on('request', (r) => { if (r.url().includes('/api/club/event')) n++; });
  await p2.evaluateOnNewDocument(() => { try { localStorage.setItem('hub.v1.settings', JSON.stringify({ telemetry: false })); } catch {} });
  await p2.goto(`${BASE}/blackjack/`, { waitUntil: 'networkidle2' });
  await sleep(6500);
  await p2.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
  await sleep(500);
  check('opt-out: zero requests', n === 0, `(${n})`);
  await ctx2.close();

  // 3. wrong password
  const bad = await fetch(`${BASE}/api/club/metrics`, { headers: { authorization: 'Bearer nope' } });
  check('metrics rejects a wrong password', bad.status === 401);
  const junk = await fetch(`${BASE}/api/club/event`, { method: 'POST', body: '{"player":"x"}' });
  check('event rejects junk', junk.status === 400);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
