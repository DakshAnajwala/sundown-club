/**
 * build-site.mjs — assembles the one Sundown Club site in dist/ after each app
 * has built itself. Run by `npm run build` at the repo root.
 *
 *   dist/                 apps/hub          (static page + media)
 *   dist/blackjack/       apps/blackjack    (static page for now)
 *   dist/parking/         apps/parking/dist (Vite build: homepage, /play/, legal pages, design previews)
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync('apps/hub/index.html', `${out}/index.html`);
cpSync('apps/hub/media', `${out}/media`, { recursive: true });

mkdirSync(`${out}/blackjack`, { recursive: true });
cpSync('apps/blackjack/index.html', `${out}/blackjack/index.html`);

if (!existsSync('apps/parking/dist/index.html')) throw new Error('apps/parking/dist is missing: run the parking build first');
cpSync('apps/parking/dist', `${out}/parking`, { recursive: true });

console.log('Sundown Club site assembled in dist/');
