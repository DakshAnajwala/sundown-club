/** Browser probe for the hub's Save & settings dialog. node tools/dev-api.mjs 5181 &  node tools/save-probe.mjs */
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://localhost:5181';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${x}`); if (!ok) failed++; };
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
try {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const openDlg = async () => { await p.evaluate(() => window.scrollTo(0, document.querySelector('#evening').getBoundingClientRect().top + scrollY - 40)); await sleep(2500); await p.click('#saveBtn'); await sleep(200); };
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  // an old v1 profile must migrate and show
  await p.evaluateOnNewDocument(() => { if (!localStorage.getItem('hub.v1.profile') && !localStorage.getItem('hub.v2.profile') && !sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('hub.v1.profile', JSON.stringify({ id: '52f37248-f49e-422b-8cd4-ba2618c73d09', handle: 'Warm Tern', xp: 1340, streak: { days: 3, last: '2020-01-01' }, games: {} })); localStorage.setItem('club.v1.chips', '{"bankroll":4321}'); } });
  await p.goto(BASE + '/', { waitUntil: 'networkidle2' });
  check('v1 migrated to v2 key', await p.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile') || '{}').handle === 'Warm Tern'));
  check('v1 key left alone', await p.evaluate(() => !!localStorage.getItem('hub.v1.profile')));
  const lvl = await p.$eval('#meLvl', (e) => e.textContent);
  check('1340 xp shows level 5', lvl === '5', `(Lv ${lvl})`);
  await openDlg();
  check('dialog opens', await p.$eval('#clubDlg', (d) => d.open));
  const code = await p.evaluate(async () => { const m = await import('/shared/save.js'); return m.exportSave(localStorage); });
  check('export is a club code', code.startsWith('SC1.'));
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('club.v1.chips', '{"bankroll":1}'); });
  await p.type('#svIn', code.slice(0, code.length - 6) + 'abcdef');
  await p.click('#svLoad');
  check('bad checksum refused', /damaged|cut short/.test(await p.$eval('#svLoadMsg', (e) => e.textContent)));
  await p.$eval('#svIn', (e) => { e.value = ''; });
  await p.type('#svIn', code);
  await p.click('#svLoad');
  check('first press asks to confirm', /replaces/.test(await p.$eval('#svLoadMsg', (e) => e.textContent)));
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2' }), p.click('#svLoad')]);
  check('import restored handle and chips', await p.evaluate(() => JSON.parse(localStorage.getItem('hub.v2.profile')).handle === 'Warm Tern' && localStorage.getItem('club.v1.chips').includes('4321')));
  await openDlg();
  check('telemetry switch matches setting', (await p.$eval('#svTele', (e) => e.checked)) === true);
  await p.click('#svTele');
  check('switch turns counters off', await p.evaluate(() => JSON.parse(localStorage.getItem('hub.v1.settings')).telemetry === false));
  check('footer button follows', /off/.test(await p.$eval('#teleToggle', (e) => e.textContent)));
  await p.click('#svReset'); await p.click('#svReset'); await sleep(900);
  check('erase clears club keys', await p.evaluate(() => !localStorage.getItem('club.v1.chips') || localStorage.getItem('club.v1.chips') === null));
  check('no page errors', errs.length === 0, errs.join('|'));
} finally { await b.close(); }
process.exit(failed ? 1 : 0);
