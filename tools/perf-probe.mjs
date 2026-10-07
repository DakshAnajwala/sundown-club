/**
 * Performance budget probe (headless Chrome, cold cache, throttled like a mid phone on 4G: 1.6 Mbit/s down,
 * 150 ms round trip, CPU x4). Reports and checks:
 *   hub:  largest contentful paint <= 2.5 s, first screen bytes
 *   game: time until Video Poker has dealt its first hand <= 5 s (software GL here, so this is a ceiling)
 * Usage: H2=1 node tools/dev-api.mjs 5184 &  node tools/perf-probe.mjs
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'https://localhost:5184';   // H2=1 node tools/dev-api.mjs 5184 (HTTP/2 + compression, like Vercel)
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${x}`); if (!ok) failed++; };
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// The hub needs no WebGL, so it is measured in a plain browser; software WebGL (needed for the game) slows painting itself.
const plain = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--ignore-certificate-errors'] });
const gl = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--ignore-certificate-errors', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(b) {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const c = await p.createCDPSession();
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 });
  await c.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU || 4) });
  const bytes = { total: 0, js: 0, css: 0, img: 0, font: 0, other: 0, n: 0 };
  c.on('Network.loadingFinished', (e) => { bytes.total += e.encodedDataLength; bytes.n++; });
  const types = new Map();
  c.on('Network.responseReceived', (e) => types.set(e.requestId, e.type));
  c.on('Network.loadingFinished', (e) => { const t = types.get(e.requestId); const k = t === 'Script' ? 'js' : t === 'Stylesheet' ? 'css' : t === 'Image' ? 'img' : t === 'Font' ? 'font' : 'other'; bytes[k] += e.encodedDataLength; });
  return { p, bytes };
}
try {
  const { p, bytes } = await open(plain);
  await p.evaluateOnNewDocument(() => { window.__lcp = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); });
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1500));
  const lcp = await p.evaluate(() => window.__lcp);
  console.log(`hub: LCP ${Math.round(lcp)} ms; ${bytes.n} requests, ${(bytes.total / 1024).toFixed(0)} KB (js ${(bytes.js / 1024).toFixed(0)}, css ${(bytes.css / 1024).toFixed(0)}, img ${(bytes.img / 1024).toFixed(0)}, font ${(bytes.font / 1024).toFixed(0)})`);
  check('hub LCP within 2.5 s on throttled 4G', lcp > 0 && lcp <= 2500, `(${Math.round(lcp)} ms)`);
  check('hub first load under 1.5 MB', bytes.total <= 1.5 * 1024 * 1024, `(${(bytes.total / 1048576).toFixed(2)} MB)`);

  const g = await open(gl);
  await g.p.evaluateOnNewDocument(() => { try { localStorage.setItem('tut.v1.videopoker', 'seen'); } catch {} });
  const t0 = Date.now();
  await g.p.goto(BASE + '/videopoker/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await g.p.waitForFunction(() => window.__vp && document.getElementById('loading')?.classList.contains('gone'), { timeout: 120000, polling: 100 });
  const ready = Date.now() - t0;
  console.log(`videopoker: playable in ${ready} ms; ${g.bytes.n} requests, ${(g.bytes.total / 1024).toFixed(0)} KB`);
  // Software WebGL makes the scene build about two seconds slower than on a real GPU, so this is a ceiling: the target is 5 s on a real device.
  check('first game playable within 6.5 s on throttled 4G with software WebGL (target 5 s on a real GPU)', ready <= 6500, `(${ready} ms)`);
  check('game first load under 2 MB', g.bytes.total <= 2 * 1048576, `(${(g.bytes.total / 1048576).toFixed(2)} MB)`);
} finally { await plain.close(); await gl.close(); }
process.exit(failed ? 1 : 0);
