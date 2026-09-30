/**
 * artifact-page.mjs — turns the Vite build into a page the Artifact publisher
 * accepts, at dist/artifact.html.
 *
 * The publisher wraps content in its own <!doctype>/<head>/<body>, so the page
 * must be body content only: title, style, the #app mount and the module
 * script, with relative asset paths. `vite build` empties dist/, so this runs
 * after every build rather than being a hand-edited file.
 *
 *   npm run build && node tools/artifact-page.mjs
 *
 * The page commits to the game's single dark look (the HUD's slate + mint), so
 * it paints its own background and has no light variant. Touch-only visitors
 * get a note that the game needs a keyboard, instead of a canvas that ignores
 * them.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const built = readFileSync('dist/play/index.html', 'utf8');
const script = built.match(/<script type="module"[^>]*src="\.?\/?([^"]+)"/)?.[1];
if (!script) throw new Error('no module script found in dist/play/index.html — run npm run build first');

const page = `<title>Parking Precision</title>
<style>
  html, body {
    margin: 0; padding: 0; overflow: hidden; height: 100%;
    background: #0d1113; color: #eef3f2;
    -webkit-user-select: none; user-select: none;
  }
  #app { position: relative; width: 100vw; height: 100vh; }
  canvas { display: block; }
  .touch-note {
    display: none; position: fixed; inset: 0; z-index: 50;
    align-items: center; justify-content: center; padding: 16px;
    background: radial-gradient(ellipse at center, rgba(12,16,18,.8), rgba(8,11,13,.96));
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .touch-note div {
    max-width: 34ch; text-align: center; line-height: 1.5; font-size: 15px;
    background: rgba(18,23,26,.92); border: 1px solid rgba(190,210,208,.16);
    border-radius: 18px; padding: 24px 22px;
  }
  .touch-note b { display: block; color: #8fe6bb; font-size: 12px; letter-spacing: .18em;
    text-transform: uppercase; margin-bottom: 8px; font-weight: 600; }
  @media (hover: none) and (pointer: coarse) { .touch-note { display: flex; } }
</style>
<div id="app"></div>
<div class="touch-note" role="note">
  <div><b>Keyboard required</b>Parking Precision is driven with W A S D, the gear keys and the mouse. Open this page on a computer to play.</div>
</div>
<script type="module" src="${script}"></script>
`;

writeFileSync('dist/artifact.html', page);
console.log(`dist/artifact.html -> ${script}`);
