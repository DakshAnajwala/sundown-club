/**
 * media-shots.mjs — the homepage stills and the link-preview image, captured
 * from the real game so they never drift from what a player actually sees.
 *
 *   node tools/media-shots.mjs            # writes public/media/*
 *   node tools/media-shots.mjs --dry      # writes to tools/shots/media-* instead
 *
 * Needs the dev server (npx vite --port 5175 --strictPort). Uses the GPU
 * (Metal) rather than SwiftShader so AO, MSAA and shadows match a real
 * machine. Levels are looked up by name, never by index.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const DRY = process.argv.includes('--dry');
const OUT = DRY ? 'tools/shots/media-' : 'public/media/';
if (DRY) mkdirSync('tools/shots', { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'],
});
const errors = [];

async function gamePage(width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:5175/play/', { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(2500);
  // Stills are of the world, not of the menus: hide every DOM overlay.
  await page.addStyleTag({ content: '.hud { display: none !important; }' });
  return page;
}

/**
 * Put the car `back` metres behind the target along its heading (or ahead of
 * it when `back` is negative), in `gear`, and let the rig settle.
 */
async function stage(page, { level, back, gear, steer = 0, extra = 0.8 }) {
  await page.evaluate(
    ({ level, back, gear, steer, extra }) => {
      const g = window.__game;
      const i = g.debug().levelNames.indexOf(level);
      if (i < 0) throw new Error(`no level ${level}`);
      g.debugPlay(i);
      g.debugRig(0.3);
      const t = g.debug().target;
      const h = t.heading;
      // Forward (nose) for heading h is (-sin h, -cos h).
      g.debugTeleport(t.pos[0] + back * Math.sin(h), t.pos[1] + back * Math.cos(h), h + steer, t.y);
      g.debugSetGear(gear);
      g.debugRig(extra);
    },
    { level, back, gear, steer, extra }
  );
  await sleep(1500);
}

// --- 1. the driver's seat, rooftop at dusk, bay ahead ---------------------------
{
  const page = await gamePage(1600, 900);
  await stage(page, { level: 'Roof Three', back: 8.5, gear: 'D' });
  await page.screenshot({ path: `${OUT}driver-seat.webp`, type: 'webp', quality: 82 });
  await page.close();
}

// --- 2. reverse gear: the dash screen lit, the bay behind -----------------------
{
  const page = await gamePage(1600, 900);
  await stage(page, { level: 'Level B4', back: -6, gear: 'R', extra: 1.2 });
  await page.screenshot({ path: `${OUT}reverse-camera.webp`, type: 'webp', quality: 82 });
  await page.close();
}

// --- 2b. homepage hero: rooftop from outside, the bay in the right third -------
// Captured wider than the still and clipped from the left edge, so the parked
// car sits right of centre and the headline (left) never covers the bay.
{
  const page = await gamePage(2400, 900);
  await page.evaluate(() => {
    const g = window.__game;
    g.debugPlay(g.debug().levelNames.indexOf('Final Exam'));
    g.debugRig(0.3);
    const t = g.debug().target;
    g.debugTeleport(t.pos[0], t.pos[1], t.heading, t.y);
    g.debugSetGear('N');
    g.debugRig(0.8);
    g.debugExternalView((t.heading * 180) / Math.PI + 200, 9, 3.2);
    g.debugRig(0.1);
  });
  await sleep(1500);
  await page.screenshot({ path: `${OUT}rooftop-lane.webp`, type: 'webp', quality: 82, clip: { x: 0, y: 0, width: 1600, height: 900 } });
  await page.close();
}

// --- 3. link preview: 1200x630, the rooftop from outside, with the pitch ---------
{
  // Wider than the card and left-aligned in it, so the parked car sits right of
  // the headline instead of under it.
  const page = await gamePage(1760, 630);
  await page.evaluate(() => {
    const g = window.__game;
    const i = g.debug().levelNames.indexOf('Final Exam');
    g.debugPlay(i);
    g.debugRig(0.3);
    const t = g.debug().target;
    // Parked in the bay, in N: teleporting onto the target in P would finish
    // the level and start the review.
    g.debugTeleport(t.pos[0], t.pos[1], t.heading, t.y);
    g.debugSetGear('N');
    g.debugRig(0.8);
    g.debugExternalView(((t.heading * 180) / Math.PI) + 200, 11, 5.2);
    g.debugRig(0.1);
  });
  await sleep(1500);
  const frame = await page.screenshot({ type: 'png', encoding: 'base64' });
  await page.close();

  // Compose the pitch over the real frame in a plain page, using the homepage's
  // own self-hosted fonts.
  const card = await browser.newPage();
  await card.setViewport({ width: 1200, height: 630 });
  // Same origin as the dev server, or the font requests are cross-origin
  // from about:blank and silently fall back to Arial.
  await card.goto('http://localhost:5175/notices.html');
  const font = (f) => `http://localhost:5175/node_modules/@fontsource/${f}`;
  await card.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: BSD; font-weight: 900; src: url(${font('big-shoulders-display/files/big-shoulders-display-latin-900-normal.woff2')}) format('woff2'); }
    @font-face { font-family: Plex; font-weight: 500; src: url(${font('ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2')}) format('woff2'); }
    html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #15161d; }
    .bg { position: absolute; inset: 0; background: url(data:image/png;base64,${frame}) left center / auto 630px no-repeat; }
    .shade { position: absolute; inset: 0; background:
      linear-gradient(90deg, rgba(21,22,29,0.9) 0%, rgba(21,22,29,0.62) 34%, rgba(21,22,29,0) 56%),
      linear-gradient(0deg, rgba(21,22,29,0.6) 0%, rgba(21,22,29,0) 30%); }
    .copy { position: absolute; left: 64px; bottom: 64px; color: #f4eee8; }
    .k { font: 500 20px Plex, monospace; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(244,238,232,0.8); display: flex; align-items: center; gap: 12px; }
    .k i { width: 12px; height: 12px; border-radius: 50%; background: #76d6a8; box-shadow: 0 0 0 5px rgba(118,214,168,0.25), 0 0 18px #76d6a8; }
    h1 { margin: 18px 0 22px; font: 900 132px/0.84 BSD, sans-serif; text-transform: uppercase; }
    h1 span { color: #ffd9a0; }
    .n { font: 500 22px Plex, monospace; color: #f4eee8; }
    .n b { color: #76d6a8; font-weight: 500; }
  </style></head><body><div class="bg"></div><div class="shade"></div>
  <div class="copy"><div class="k"><i></i>Parking Precision</div>
  <h1>Park it<br><span>perfectly.</span></h1>
  <div class="n">Free 3D parking game · <b>plays in your browser</b></div></div></body></html>`, { waitUntil: 'networkidle0' });
  const fontsOk = await card.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('900 40px BSD') && [...document.fonts].every((f) => f.status === 'loaded');
  });
  if (!fontsOk) errors.push('og card: fonts did not load');
  await card.screenshot({ path: `${OUT}og-card.jpg`, type: 'jpeg', quality: 86 });
  await card.close();
}

// --- 4. home-screen icon: the favicon on an opaque square (iOS rounds it) -----
{
  const icon = await browser.newPage();
  await icon.setViewport({ width: 180, height: 180 });
  await icon.goto('http://localhost:5175/notices.html');
  const svg = await (await fetch('http://localhost:5175/favicon.svg')).text();
  await icon.setContent(`<body style="margin:0;background:#15161d">${svg.replace('<svg ', '<svg width="180" height="180" ')}</body>`);
  await icon.screenshot({ path: `${DRY ? OUT : 'public/'}apple-touch-icon.png` });
  await icon.close();
}

await browser.close();
console.log(`wrote ${OUT}{driver-seat.webp, reverse-camera.webp, rooftop-lane.webp, og-card.jpg} + apple-touch-icon.png; page errors: ${errors.length}`);
errors.slice(0, 3).forEach((e) => console.log('  ! ' + e));
process.exit(errors.length ? 1 : 0);
