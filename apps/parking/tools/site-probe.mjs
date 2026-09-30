/**
 * site-probe.mjs — the website around the game: every public page loads
 * cleanly, makes no third-party requests, fits a phone, respects reduced
 * motion, and carries the tags search engines and link previews read.
 *
 *   node tools/site-probe.mjs                       # against the dev server
 *   node tools/site-probe.mjs http://localhost:5176 # e.g. `vite preview`
 *   node tools/site-probe.mjs <base> --shots label  # also save screenshots
 *
 * Link previews are checked against the BUILT pages when <base> serves a
 * build; under the dev server the same tags come straight from the source.
 */
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const BASE = (args.find((a) => /^https?:/.test(a)) || 'http://localhost:5175').replace(/\/$/, '');
const shotsAt = args.indexOf('--shots');
const SHOTS = shotsAt >= 0 ? args[shotsAt + 1] || 'site' : null;
const CANONICAL = 'https://parking-precision.vercel.app';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 180000,
  args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'],
});

const origin = new URL(BASE).origin;

async function visit(path, { width, height, reducedMotion = false, touch = false, settle = 1200 }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, isMobile: touch, hasTouch: touch });
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const errors = [];
  const foreign = [];
  const failed = [];
  const api = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  // A local server (dev or `vite preview`) has no serverless functions, so the
  // game's leaderboard calls would 404. Answer them with an empty 200, which
  // the client treats as "leaderboard unavailable", exactly as offline.
  const local = /^(localhost|127\.)/.test(new URL(BASE).hostname);
  if (local) {
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/api/')) {
        api.push(new URL(r.url()).pathname);
        r.respond({ status: 200, contentType: 'application/json', body: '{}' });
      } else r.continue();
    });
  }
  page.on('request', (r) => {
    const u = r.url();
    if (/^(data|blob):/.test(u)) return;
    if (new URL(u).origin !== origin) foreign.push(u);
  });
  page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
  await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(settle);
  return { page, errors, foreign, failed, api };
}

const staticPages = ['/', '/privacy.html', '/terms.html', '/notices.html'];

// --- 1. every public page, desktop and phone ---------------------------------
for (const path of staticPages) {
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844, touch: true }]) {
    const { page, errors, foreign, failed } = await visit(path, vp);
    const tag = `${path} @${vp.width}`;
    check(`${tag}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    check(`${tag}: no third-party requests`, foreign.length === 0, foreign.slice(0, 3).join(' '));
    check(`${tag}: no failed requests`, failed.length === 0, failed.slice(0, 3).join(' | '));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${tag}: no horizontal overflow`, overflow <= 1, `${overflow}px`);
    if (path === '/') {
      // The first "Begin to play" must be visible and clickable on arrival,
      // without scrolling. It once sat at opacity 0 until the footer arrived.
      const cta = await page.evaluate(() => {
        const c = document.querySelector('.cta');
        const r = c.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { op: +getComputedStyle(c).opacity, bottom: Math.round(r.bottom), vh: innerHeight, hit: c.contains(hit) };
      });
      check(`${tag}: hero "Begin to play" visible above the fold`, cta.op > 0.95 && cta.bottom <= cta.vh && cta.hit, JSON.stringify(cta));
    }
    if (SHOTS && path === '/') {
      await page.screenshot({ path: `tools/shots/${SHOTS}-home-${vp.width}.png` });
      await page.screenshot({ path: `tools/shots/${SHOTS}-home-${vp.width}-full.png`, fullPage: true });
    }
    await page.close();
  }
}

// --- 2. the game page boots without errors -----------------------------------
{
  const { page, errors, foreign, failed, api } = await visit('/play/', { width: 1280, height: 800, settle: 4000 });
  // PRIVACY.md: the name and identifier leave the device only when a score is
  // posted. Opening the game must not claim one.
  // Only meaningful against a production build: under the dev server the
  // leaderboard is switched off entirely, so nothing would ever be requested.
  const isDev = await page.evaluate(() => !!document.querySelector('script[src*="@vite/client"]'));
  if (isDev) console.log('SKIP  /play/: no identity claimed on load  (dev server: leaderboard off; run against `vite preview`)');
  else if (/^(localhost|127\.)/.test(new URL(BASE).hostname)) {
    check('/play/: leaderboard active (run token requested)', api.includes('/api/run'), api.join(' ') || 'no api calls');
    check('/play/: no identity claimed on load', !api.includes('/api/identity'), api.join(' ') || 'no api calls');
  }
  check('/play/: no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  check('/play/: no third-party requests', foreign.length === 0, foreign.slice(0, 3).join(' '));
  check('/play/: no failed requests', failed.length === 0, failed.slice(0, 3).join(' | '));
  if (SHOTS) await page.screenshot({ path: `tools/shots/${SHOTS}-play-menu.png` });
  await page.close();
}

// --- 3. reduced motion: nothing pinned, nothing hidden ------------------------
{
  const { page } = await visit('/', { width: 1440, height: 900, reducedMotion: true });
  const r = await page.evaluate(async () => {
    const pinned = document.querySelectorAll('.pin-spacer').length;
    window.scrollTo(0, document.body.scrollHeight / 2);
    await new Promise((res) => setTimeout(res, 400));
    const hidden = [...document.querySelectorAll('h1, h2, h3, .line, .lede')]
      .filter((el) => parseFloat(getComputedStyle(el).opacity) < 0.95).length;
    return { pinned, hidden };
  });
  check('reduced motion: no pinned sections', r.pinned === 0, `${r.pinned} pin spacers`);
  check('reduced motion: all text fully visible', r.hidden === 0, `${r.hidden} faded`);
  await page.close();
}

// --- 4. what crawlers and link previews read -----------------------------------
async function head(path) {
  const { page } = await visit(path, { width: 1280, height: 800, settle: path === '/play/' ? 2000 : 300 });
  const h = await page.evaluate(() => {
    const m = (sel) => document.querySelector(sel)?.getAttribute('content') ?? null;
    let ld = null;
    const ldEl = document.querySelector('script[type="application/ld+json"]');
    try { ld = ldEl ? JSON.parse(ldEl.textContent) : null; } catch { ld = 'invalid'; }
    return {
      title: document.title,
      description: m('meta[name="description"]'),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
      robots: m('meta[name="robots"]'),
      ogTitle: m('meta[property="og:title"]'),
      ogUrl: m('meta[property="og:url"]'),
      ogImage: m('meta[property="og:image"]'),
      ogType: m('meta[property="og:type"]'),
      twitter: m('meta[name="twitter:card"]'),
      h1: document.querySelectorAll('h1').length,
      lang: document.documentElement.lang,
      imgNoAlt: [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length,
      appleIcon: !!document.querySelector('link[rel="apple-touch-icon"]'),
      ld,
    };
  });
  await page.close();
  return h;
}

const abs = (u) => typeof u === 'string' && u.startsWith(CANONICAL + '/');
for (const path of ['/', '/play/']) {
  const h = await head(path);
  check(`${path}: descriptive <title>`, h.title.length >= 25 && h.title.length <= 65, `"${h.title}"`);
  check(`${path}: meta description 70-160 chars`, !!h.description && h.description.length >= 70 && h.description.length <= 160, `${h.description?.length ?? 0} chars`);
  check(`${path}: canonical on the production domain`, abs(h.canonical), h.canonical ?? 'none');
  check(`${path}: indexable`, !h.robots || !/noindex/.test(h.robots), h.robots ?? '');
  check(`${path}: og:title/og:type/og:url`, !!h.ogTitle && !!h.ogType && abs(h.ogUrl), `${h.ogType} ${h.ogUrl}`);
  check(`${path}: og:image is an absolute production URL`, abs(h.ogImage) && /\.(png|jpe?g)$/.test(h.ogImage), h.ogImage ?? 'none');
  check(`${path}: twitter:card summary_large_image`, h.twitter === 'summary_large_image', h.twitter ?? 'none');
  check(`${path}: lang set`, !!h.lang);
  check(`${path}: apple-touch-icon`, h.appleIcon);
  if (path === '/') {
    check('/: exactly one <h1>', h.h1 === 1, `${h.h1}`);
    check('/: every <img> has alt', h.imgNoAlt === 0, `${h.imgNoAlt} missing`);
    const ldOk = !!h.ld && h.ld !== 'invalid' && h.ld['@type'] === 'VideoGame' && h.ld.url === CANONICAL + '/';
    check('/: JSON-LD VideoGame', ldOk, JSON.stringify(h.ld)?.slice(0, 80) ?? 'none');
  }
}

// the og:image itself must exist on this server at the right size
{
  const h = await head('/');
  if (h.ogImage && abs(h.ogImage)) {
    const local = BASE + h.ogImage.slice(CANONICAL.length);
    const page = await browser.newPage();
    const res = await page.goto(local);
    const size = res.ok()
      ? await page.evaluate(() => { const i = document.querySelector('img'); return i ? [i.naturalWidth, i.naturalHeight] : null; })
      : null;
    check('og:image served at 1200x630', !!size && size[0] === 1200 && size[1] === 630, `${res.status()} ${size}`);
    await page.close();
  } else check('og:image served at 1200x630', false, 'no absolute og:image');
}

for (const path of ['/robots.txt', '/sitemap.xml']) {
  const page = await browser.newPage();
  const res = await page.goto(BASE + path);
  const body = res.ok() ? await res.text() : '';
  check(`${path} served`, res.ok() && body.includes(CANONICAL), `${res.status()}`);
  await page.close();
}

// internal tool pages must not be indexed
for (const path of ['/design/', '/design/wheel-lab/index.html', '/design/level13/sheet.html']) {
  const page = await browser.newPage();
  const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  const robots = res.ok() ? await page.evaluate(() => document.querySelector('meta[name="robots"]')?.content ?? '') : 'missing';
  check(`${path}: noindex`, /noindex/.test(robots) || !res.ok(), robots || 'none');
  await page.close();
}

await browser.close();
const failedCount = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failedCount}/${results.length} checks pass`);
process.exit(failedCount ? 1 : 0);
