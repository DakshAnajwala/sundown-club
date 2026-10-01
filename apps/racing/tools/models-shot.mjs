/**
 * models-shot.mjs — boots the Model Lab in Chrome on the GPU, runs the model
 * checks (design/SPEC-models.md §5), screenshots every view to
 * tools/shots/models/, and fails on any check failure or console error.
 *
 *   node tools/models-shot.mjs [baseUrl] [--only name,name]
 *
 * Needs the dev server (npm run dev, port 5177) and puppeteer-core
 * (npm install --no-save puppeteer-core).
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5177';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const URL = `${BASE}/design/models/index.html`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = 'tools/shots/models';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 180000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || /GL_INVALID/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__models, { timeout: 30000 });

const shot = async (name, kind, id, view) => {
  if (only && !only.includes(name)) return;
  await page.evaluate((k, i) => __models.show(k, i ?? undefined), kind, id ?? null);
  if (view) await page.evaluate((v) => __models.setView(...v), view);
  await page.evaluate(() => __models.step(30));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  shot ${name}.png`);
};

const report = await page.evaluate(() => __models.checks());
writeFileSync(`${OUT}/checks.json`, JSON.stringify(report, null, 2));

await shot('01-scene-keys', 'sceneKeys');
await shot('02-scene-maras', 'sceneMaras');
await shot('03-scene-juno', 'sceneJuno');
await shot('04-roadblock', 'roadblock');
await shot('05-cast', 'cast');
await shot('06-cast-close-left', 'cast', null, [[-3.3, 1.2, 0], 5.5, 0.15, 0.08]);
await shot('07-cast-close-right', 'cast', null, [[3.3, 1.2, 0], 5.5, -0.15, 0.08]);
await shot('08-poses', 'poses');
await shot('09-cars', 'cars');
await shot('10-crowd', 'crowd');
for (const id of ['you', 'mara', 'jax', 'juno', 'voss', 'hale', 'officer', 'brandt']) await shot(`20-char-${id}`, 'character', id);
for (const id of ['juno', 'coupe', 'police', 'unmarked', 'tow', 'brandt', 'kai', 'selene', 'voss', 'pike']) await shot(`30-car-${id}`, 'car', id);
await shot('40-booth', 'booth');
await shot('41-key', 'key');
await shot('42-garage', 'garage');
await shot('43-rooftop', 'rooftop');

const summary = {
  cast: Object.fromEntries(Object.entries(report.cast).map(([k, v]) => [k, `${v.measured} m, ${v.tris} tris, ${v.meshes} meshes`])),
  cars: Object.fromEntries(Object.entries(report.cars).map(([k, v]) => [k, `${v.body}: ${v.tris} tris, head clear ${v.clearanceCm} cm, hip ${v.hipAboveFloorCm} cm, over belt ${v.headAboveBeltCm} cm`])),
  sets: Object.fromEntries(Object.entries(report.sets).map(([k, v]) => [k, `${v.tris} tris, ${v.meshes} meshes, ${v.colliders} colliders`])),
};
console.log(JSON.stringify(summary, null, 2));
console.log(report.failures.length ? `CHECK FAILURES (${report.failures.length}):\n  ${report.failures.join('\n  ')}` : 'all checks pass');
console.log(errors.length ? `ERRORS (${errors.length}):\n${errors.slice(0, 10).join('\n')}` : '0 console errors');
await browser.close();
process.exit(errors.length || report.failures.length ? 1 : 0);
