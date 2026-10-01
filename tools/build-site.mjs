/**
 * build-site.mjs — assembles the one Sundown Club site in dist/ after each app
 * has built itself. Run by `npm run build` at the repo root.
 *
 *   dist/                 apps/hub          (static page + media)
 *   dist/blackjack/       apps/blackjack    (static page)
 *   dist/holdem/          apps/holdem       (static page + engine/bot modules)
 *   dist/videopoker/      apps/videopoker   (static page)
 *   dist/parking/         apps/parking/dist (Vite build: homepage, /play/, legal pages, design previews)
 *   dist/shared/          packages/shared (incl. lounge/), for the static pages' import maps
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync('apps/hub/index.html', `${out}/index.html`);
cpSync('apps/hub/media', `${out}/media`, { recursive: true });

// Static game pages: index.html plus any sibling .js modules (engine, bots).
for (const app of ['blackjack', 'holdem', 'videopoker']) {
  mkdirSync(`${out}/${app}`, { recursive: true });
  for (const f of readdirSync(`apps/${app}`).filter((n) => n === 'index.html' || n.endsWith('.js'))) cpSync(`apps/${app}/${f}`, `${out}/${app}/${f}`);
}

// Shared modules for static pages, mapped by their import map: "@sundown/shared/" -> "/shared/".
cpSync('packages/shared', `${out}/shared`, { recursive: true, filter: (src) => !/(node_modules|\.md$|package\.json$)/.test(src) });

if (!existsSync('apps/parking/dist/index.html')) throw new Error('apps/parking/dist is missing: run the parking build first');
cpSync('apps/parking/dist', `${out}/parking`, { recursive: true });

console.log('Sundown Club site assembled in dist/');
