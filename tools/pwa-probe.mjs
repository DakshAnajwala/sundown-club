/**
 * Browser probe: installable and offline. Service worker registers and caches, the club opens with the
 * network off, deploys replace old caches, the install offer waits for the second visit, the reminder
 * offer needs the server to have push on. Starts a second dev-api with test VAPID keys for that part.
 *   node tools/dev-api.mjs 5181 &  node tools/pwa-probe.mjs
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5181';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${x}`); if (!ok) failed++; };
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let push = null;
try {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
  await p.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => navigator.serviceWorker.ready);
  await sleep(2500);   // precache
  const info = await p.evaluate(async () => ({ keys: await caches.keys(), n: (await (await caches.open((await caches.keys()).find((k) => k.startsWith('club-')))).keys()).length, ctrl: !!navigator.serviceWorker.controller }));
  check('service worker registered and a build cache exists', info.keys.some((k) => /^club-\d{14}$/.test(k)), JSON.stringify(info.keys));
  check('the shell is precached (many files)', info.n >= 40, `(${info.n} entries)`);
  const man = await (await fetch(BASE + '/manifest.webmanifest')).json();
  check('manifest is standalone with three icons', man.display === 'standalone' && man.icons.length === 3 && man.start_url.startsWith('/'));
  for (const i of man.icons) check(`icon ${i.src} loads`, (await fetch(BASE + i.src)).ok);
  check('page links the manifest and a theme colour', await p.evaluate(() => !!document.querySelector('link[rel=manifest]') && !!document.querySelector('meta[name=theme-color]')));
  // visit more pages so they are cached, then go offline
  for (const path of ['/guides/how-to-park-a-car/', '/videopoker/']) { await p.goto(BASE + path, { waitUntil: 'load', timeout: 90000 }); await sleep(1500); }
  await p.goto(BASE + '/', { waitUntil: 'networkidle2' }); await sleep(800);
  await p.setOfflineMode(true);
  await p.reload({ waitUntil: 'load' }); await sleep(1500);
  check('the hub opens with the network off', (await p.title()).includes('Sundown Club') && (await p.$('#lobby')) !== null, await p.title());
  check('the hub still shows tonight\'s table offline', (await p.$$('#dq .q')).length === 3);
  await p.evaluate(() => window.scrollTo(0, document.querySelector('#board').getBoundingClientRect().top + scrollY - 40)); await sleep(1500);
  check('the board says it is resting instead of breaking', /resting/.test(await p.$eval('#bRows', (e) => e.innerText)));
  await p.goto(BASE + '/guides/how-to-park-a-car/', { waitUntil: 'load' });
  check('a guide opens offline', /park a car/i.test(await p.$eval('h1', (e) => e.textContent)));
  await p.goto(BASE + '/videopoker/', { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => window.__vp, { timeout: 60000 });
  check('Video Poker plays offline', await p.evaluate(() => { window.__vp.deal(); return window.__vp.machine.phase === 'dealt'; }));
  await p.setOfflineMode(false);
  // a new build replaces old caches: write a new build id into the served sw.js and let the browser update
  await p.goto(BASE + '/', { waitUntil: 'networkidle2' });
  const swPath = new URL('../dist/sw.js', import.meta.url);
  const original = readFileSync(swPath, 'utf8');
  try {
    writeFileSync(swPath, original.replace(/const BUILD = '\d{14}'/, "const BUILD = '20991231235959'"));
    await p.evaluate(async () => { await caches.open('club-19990101000000'); const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    await sleep(4000);
  } finally { writeFileSync(swPath, original); }
  const keys = await p.evaluate(() => caches.keys());
  check('a new build replaces the old caches on activate', keys.filter((k) => k.startsWith('club-')).join() === 'club-20991231235959', JSON.stringify(keys));
  check('the API is never cached', await p.evaluate(async () => { const c = await caches.open((await caches.keys())[0]); return (await c.keys()).every((r) => !new URL(r.url).pathname.startsWith('/api/')); }));
  check('no page errors', errs.length === 0, errs.join('|'));

  // ---- install offer waits for the second visit and "Not now" is final
  const f = await (await b.createBrowserContext()).newPage();
  await f.setViewport({ width: 1280, height: 900 });
  const fire = () => f.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  await f.goto(BASE + '/', { waitUntil: 'networkidle2' }); await fire(); await sleep(500);
  check('first visit: no install offer', await f.$eval('#offer', (e) => e.hidden));
  await f.goto(BASE + '/?second', { waitUntil: 'networkidle2' }); await sleep(300);
  check('same tab session: still counted once', (await f.evaluate(() => JSON.parse(localStorage.getItem('hub.v1.pwa')).sessions)) === 1);
  const g = await (await b.createBrowserContext()).newPage();
  await g.setViewport({ width: 1280, height: 900 });
  await g.evaluateOnNewDocument(() => { try { if (!localStorage.getItem('hub.v1.pwa')) localStorage.setItem('hub.v1.pwa', JSON.stringify({ sessions: 1 })); } catch {} });
  await g.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await g.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); }); await sleep(600);
  check('second visit: the offer shows', !(await g.$eval('#offer', (e) => e.hidden)) && /Install/.test(await g.$eval('#offerYes', (e) => e.textContent)));
  await g.click('#offerNo'); await sleep(200);
  check('"Not now" hides it for good', await g.$eval('#offer', (e) => e.hidden) && (await g.evaluate(() => JSON.parse(localStorage.getItem('hub.v1.pwa')).dismissed)) === true);
  await g.reload({ waitUntil: 'load' });
  await g.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); }); await sleep(500);
  check('and it does not come back', await g.$eval('#offer', (e) => e.hidden));

  // ---- reminders: only when the server has push on
  const noPush = await (await b.createBrowserContext()).newPage();
  await noPush.evaluateOnNewDocument(() => { try { localStorage.setItem('hub.v1.pwa', JSON.stringify({ sessions: 2 })); } catch {} });
  await noPush.goto(BASE + '/', { waitUntil: 'load' }); await sleep(800);
  check('server without push: no reminder offer, no switch', (await noPush.$eval('#offer', (e) => e.hidden)) && (await noPush.$eval('#svPushRow', (e) => e.hidden)));
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pj = publicKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(pj.x, 'base64url'), Buffer.from(pj.y, 'base64url')]).toString('base64url');
  push = spawn('node', ['tools/dev-api.mjs', '5183'], { env: { ...process.env, VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: privateKey.export({ format: 'jwk' }).d, VAPID_SUBJECT: 'mailto:owner@example.com', CRON_SECRET: 'cron' } });
  await sleep(1200);
  const P2 = 'http://localhost:5183';
  const wp = await (await b.createBrowserContext()).newPage();
  await wp.evaluateOnNewDocument(() => { try { localStorage.setItem('hub.v1.pwa', JSON.stringify({ sessions: 2 })); } catch {} });
  await wp.goto(P2 + '/', { waitUntil: 'load' }); await sleep(1200);
  check('server with push: after the third visit the reminder is offered', !(await wp.$eval('#offer', (e) => e.hidden)) && /Remind me/.test(await wp.$eval('#offerYes', (e) => e.textContent)), await wp.$eval('#offerText', (e) => e.textContent));
  check('and the settings dialog has the switch', !(await wp.$eval('#svPushRow', (e) => e.hidden)));
  const run1 = await fetch(P2 + '/api/club/push-run'); check('the cron endpoint refuses without its secret', run1.status === 401);
  const run2 = await fetch(P2 + '/api/club/push-run', { headers: { authorization: 'Bearer cron' } }); const body = await run2.json();
  check('and runs with it (nobody subscribed yet)', run2.status === 200 && body.sent === 0, JSON.stringify(body));
  const off = await fetch(BASE + '/api/club/push-run'); check('without VAPID keys the endpoint says so', off.status === 503);
  await wp.click('#offerNo'); await sleep(200);
  check('"Not now" on reminders is final too', (await wp.evaluate(() => JSON.parse(localStorage.getItem('hub.v1.pwa')).pushDismissed)) === true);
} finally { if (push) push.kill(); await b.close(); }
process.exit(failed ? 1 : 0);
