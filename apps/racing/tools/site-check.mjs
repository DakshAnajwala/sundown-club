/**
 * site-check.mjs — Night Drive inside the assembled Sundown Club site.
 *
 * Serve the built site first (repo root: npm run build && npm run serve, port
 * 5180). Checks: the hub does not offer Night Drive as playable (owner, 2 Oct
 * 2026: in development, reached only by its address) and its teaser says so;
 * the test drive says it is in development, has no tuning controls, boots with
 * 0 console errors and draws; Esc opens the club's leave card and Esc again
 * saves the profile entry and lands on the hub.
 *
 *   node apps/racing/tools/site-check.mjs [base]
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://localhost:5180';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`${page.url()}: ${e}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`${page.url()}: ${m.text()}`));
const results = [];
const ok = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// Hub: Night Drive is a quiet teaser only, with no way in.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
const hub = await page.evaluate(() => ({
  tile: [...document.querySelectorAll('.tile')].some((el) => /Night Drive/.test(el.getAttribute('aria-label') || '')),
  links: [...document.querySelectorAll('a[href]')].filter((a) => /\/racing\//.test(a.getAttribute('href'))).length,
  teaser: document.querySelector('#workshop .teaser .lock')?.textContent ?? null,
}));
ok('hub has no Night Drive tile and no link to /racing/', !hub.tile && hub.links === 0, JSON.stringify(hub));
ok('hub teaser says it is in development', hub.teaser === 'In development', String(hub.teaser));
await page.goto(`${BASE}/racing/`, { waitUntil: 'networkidle0' });
const notice = await page.evaluate(() => ({
  badge: document.querySelector('.tune .dev')?.textContent ?? null,
  bugs: /expect bugs/.test(document.querySelector('.tune .about')?.textContent ?? ''),
  sliders: document.querySelectorAll('input[type=range], .fields').length,
  robots: document.querySelector('meta[name=robots]')?.content ?? null,
}));
ok('test drive says it is in development and may have bugs', notice.badge === 'In development' && notice.bugs, JSON.stringify(notice));
ok('test drive has no tuning controls', notice.sliders === 0, JSON.stringify(notice));
ok('test drive is kept out of search results', notice.robots === 'noindex', String(notice.robots));

// Test drive boots and draws something that is not black.
await page.waitForSelector('canvas', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 2500));
// Judge a real screenshot: reading a WebGL canvas back without
// preserveDrawingBuffer returns a cleared (black) buffer.
const shotB64 = await page.screenshot({ encoding: 'base64', type: 'jpeg' });
const lit = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = `data:image/jpeg;base64,${b64}`;
  await img.decode();
  const g = document.createElement('canvas');
  g.width = 64;
  g.height = 40;
  const x = g.getContext('2d');
  x.drawImage(img, 0, 0, 64, 40);
  const d = x.getImageData(0, 0, 64, 40).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
  return sum / (d.length / 4) / 3;
}, shotB64);
ok('test drive renders', lit > 8, `mean brightness ${lit.toFixed(1)}`);
ok('no debug hooks in the public build', await page.evaluate(() => typeof window.__lab === 'undefined'));

// Drive a little (real key events), then Esc, Esc.
await page.keyboard.down('KeyW');
await new Promise((r) => setTimeout(r, 1500));
await page.keyboard.up('KeyW');
await page.keyboard.press('Escape');
const card = await page.evaluate(() => {
  const el = document.querySelector('.sc-leave');
  return el && !el.hidden ? el.querySelector('h2').textContent : null;
});
ok('Esc opens the club leave card', card === 'Leave Night Drive?', String(card));
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.keyboard.press('Escape')]);
ok('Esc again lands on the hub', new URL(page.url()).pathname === '/', page.url());
const prof = await page.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile') || localStorage.getItem('hub.v1.profile') || '{}').games?.racing ?? null);
ok('profile entry saved for racing', prof && prof.resume === 'Test drive' && Array.isArray(prof.facts), JSON.stringify(prof));

ok('0 console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
