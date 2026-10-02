/**
 * build-three-lite.mjs — writes dist/vendor/three/three.module.js as a tree-shaken build of three.js with only
 * the classes the static pages (hub aside: Blackjack, Hold'em, Video Poker and the shared lounge kit) actually use.
 * The full library is ~1.5 MB (300 KB compressed) and every first load paid for all of it. The names come from
 * scanning the sources for `THREE.<Name>`, so new use is picked up by the next build; dynamic access (THREE[x])
 * would defeat that, so it fails the build. Parking and Night Drive are bundled by Vite and shake their own.
 */
import { readFileSync, readdirSync, statSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { rolldown } from 'rolldown';

const SOURCES = ['apps/blackjack/index.html', 'apps/holdem', 'apps/videopoker', 'packages/shared/lounge', 'packages/shared'];
function files(p, out = []) {
  const st = statSync(p);
  if (st.isDirectory()) { if (/node_modules|\.git/.test(p)) return out; for (const f of readdirSync(p)) files(join(p, f), out); }
  else if (/\.(js|mjs|html)$/.test(p)) out.push(p);
  return out;
}

export async function buildThreeLite(out = 'dist/vendor/three/three.module.js') {
  const names = new Set();
  for (const src of SOURCES) for (const f of files(src)) {
    const text = readFileSync(f, 'utf8');
    if (!/from ['"]three['"]/.test(text) && !/THREE\./.test(text)) continue;
    if (/THREE\[/.test(text)) throw new Error(`${f} reads THREE[...] by a computed name; three-lite cannot know which classes it needs`);
    for (const m of text.matchAll(/\bTHREE\.([A-Za-z_][A-Za-z0-9_]*)/g)) names.add(m[1]);
    for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]three['"]/g)) for (const n of m[1].split(',')) { const t = n.trim().split(/\s+as\s+/)[0]; if (t) names.add(t); }
  }
  const dir = '.three-lite-tmp';
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/entry.mjs`, `export { ${[...names].sort().join(', ')} } from 'three';\n`);
  const bundle = await rolldown({ input: resolve(`${dir}/entry.mjs`), logLevel: 'silent' });
  mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
  await bundle.write({ file: out, format: 'esm', minify: true });
  rmSync(dir, { recursive: true, force: true });
  // Every name the pages use must really be in the bundle (a typo or a class three.js renamed would otherwise only fail in the browser).
  const mod = await import(pathToFileURL(resolve(out)).href);
  const missing = [...names].filter((n) => !(n in mod));
  if (missing.length) throw new Error(`three-lite is missing: ${missing.join(', ')}`);
  return [...names].sort();
}

if (process.argv[1].endsWith('build-three-lite.mjs')) {
  const names = await buildThreeLite(process.argv[2] || 'dist/vendor/three/three.module.js');
  console.log(`three-lite: ${names.length} exports`);
}
