/**
 * design-pages.mjs — after `vite build`, copies the design files Vite doesn't
 * bundle into dist/design/:
 *   - wheel-lab/params.json (the lab fetches it at boot)
 *   - homepage/directions/*.html + media (static pages; they were written as
 *     body-only artifact pages, so each gets a doctype + html wrapper to stay
 *     out of quirks mode)
 *
 *   npm run build   (runs vite build, then this)
 */
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

mkdirSync('dist/design/wheel-lab', { recursive: true });
cpSync('design/wheel-lab/params.json', 'dist/design/wheel-lab/params.json');

const src = 'design/homepage/directions';
const out = 'dist/design/homepage/directions';
mkdirSync(out, { recursive: true });
cpSync(`${src}/media`, `${out}/media`, { recursive: true });
for (const f of readdirSync(src).filter((n) => n.endsWith('.html'))) {
  let html = readFileSync(`${src}/${f}`, 'utf8');
  if (!/^\s*<!doctype/i.test(html)) {
    // No explicit <head>/<body>: the parser then files the page's leading
    // <meta>/<title>/<link> tags into the head itself.
    html = `<!doctype html>\n<html lang="en">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex">\n<link rel="icon" href="data:,">\n${html}\n</html>\n`;
  }
  writeFileSync(`${out}/${f}`, html);
}
console.log('design pages copied into dist/design/');
