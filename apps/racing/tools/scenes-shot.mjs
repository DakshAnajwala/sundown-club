/**
 * scenes-shot.mjs — boots the Scene Lab on the GPU and checks every story
 * scene (design/SPEC-scenes.md §6): length 30-60 s, every line on screen
 * long enough to read and never over another, only known speakers (and never
 * "you"), cues inside the scene, the camera never inside a person or a car,
 * hold-to-skip ends the scene (or stops at its choice), a choice ends it.
 * Screenshots the middle of every shot to tools/shots/scenes/.
 *
 *   node tools/scenes-shot.mjs [baseUrl] [--only id,id] [--no-shots]
 *
 * Needs the dev server (npm run dev) and puppeteer-core. Scene time is
 * stepped with seek(), never with wall-clock sleeps.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5177';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const shots = !args.includes('--no-shots');
const OUT = 'tools/shots/scenes';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || /GL_INVALID/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${BASE}/design/scenes/index.html`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__scenes, { timeout: 30000 });

const list = await page.evaluate(() => __scenes.list());
const failures = [];
const report = {};
for (const s of list) {
  if (only && !only.includes(s.id)) continue;
  const fail = (m) => failures.push(`${s.id}: ${m}`);
  await page.evaluate((id) => __scenes.load(id), s.id);
  const info = await page.evaluate((id) => __scenes.info(id), s.id);
  if (info.duration < 30 || info.duration > 60) fail(`lasts ${info.duration.toFixed(1)} s (30-60)`);
  for (const [i, sh] of info.shots.entries()) if (sh.dur < 1.5) fail(`shot ${i + 1} is ${sh.dur} s (min 1.5)`);
  let prevEnd = 0;
  for (const l of info.lines) {
    if (l.dur < l.min - 1e-6) fail(`"${l.text}" up ${l.dur.toFixed(2)} s, needs ${l.min.toFixed(2)}`);
    if (l.t < prevEnd - 1e-6) fail(`"${l.text}" at ${l.t} s starts before the previous line ends (${prevEnd.toFixed(2)} s)`);
    if (l.t + l.dur > info.duration - 0.2) fail(`"${l.text}" still up at the end`);
    prevEnd = l.t + l.dur;
  }
  for (const sp of info.speakers) {
    if (!sp.known) fail(`unknown speaker ${sp.id}`);
    if (sp.castId === 'you' || sp.castId === 'youStreet') fail('you speak (you never speak on screen)');
  }
  for (const t of info.cues) if (t < 0 || t > info.duration) fail(`cue at ${t} s is outside the scene`);
  // Camera position in the middle of every shot, and a screenshot.
  for (const [i, sh] of info.shots.entries()) {
    for (const k of [0.1, 0.55, 0.95]) {
      const t = sh.t0 + sh.dur * k;
      await page.evaluate((tt) => __scenes.seek(tt), t);
      const w = await page.evaluate(() => __scenes.where());
      if (w.inside.length) fail(`shot ${i + 1} at ${t.toFixed(1)} s: camera inside ${w.inside.join(', ')}`);
      if (k === 0.55 && shots) {
        await page.evaluate(() => __scenes.render());
        await page.screenshot({ path: `${OUT}/${s.id}-${String(i + 1).padStart(2, '0')}.png` });
      }
    }
  }
  // Skip, then the choice.
  await page.evaluate((id) => __scenes.load(id), s.id);
  const sk = await page.evaluate(() => __scenes.skipTest());
  if (info.hasChoice) {
    if (!sk.waitingChoice) fail('skip did not stop at the choice');
    const c = await page.evaluate(() => __scenes.choose(1));
    if (!c.ended || c.lastEnd?.choice !== 1) fail(`choosing did not end the scene with choice 1 (${JSON.stringify(c.lastEnd)})`);
  } else if (!sk.ended || !sk.lastEnd?.skipped) fail('hold-to-skip did not end the scene');
  report[s.id] = { duration: +info.duration.toFixed(1), shots: info.shots.length, lines: info.lines.length };
  console.log(`  ${s.id}: ${report[s.id].duration} s, ${report[s.id].shots} shots, ${report[s.id].lines} lines`);
}
writeFileSync(`${OUT}/report.json`, JSON.stringify({ report, failures }, null, 2));
console.log(failures.length ? `CHECK FAILURES (${failures.length}):\n  ${failures.join('\n  ')}` : 'all checks pass');
console.log(errors.length ? `ERRORS (${errors.length}):\n${errors.slice(0, 10).join('\n')}` : '0 console errors');
await browser.close();
process.exit(errors.length || failures.length ? 1 : 0);
