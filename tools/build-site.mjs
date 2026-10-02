/**
 * build-site.mjs — assembles the one Sundown Club site in dist/ after each app
 * has built itself. Run by `npm run build` at the repo root.
 *
 *   dist/                 apps/hub          (static page + media)
 *   dist/blackjack/       apps/blackjack    (static page)
 *   dist/holdem/          apps/holdem       (static page + engine/bot modules)
 *   dist/videopoker/      apps/videopoker   (static page)
 *   dist/parking/         apps/parking/dist (Vite build: homepage, /play/, legal pages, design previews)
 *   dist/racing/          apps/racing/dist  (Vite build: Night Drive test drive)
 *   dist/shared/          packages/shared (incl. lounge/), for the static pages' import maps
 *   dist/vendor/          three.js, GSAP and the fonts, copied from node_modules so no page
 *                         loads anything from another company's server (privacy policy §4)
 *   dist/privacy.html …   the club's legal pages (apps/hub/legal/)
 *   dist/robots.txt, sitemap.xml, favicon.svg   for search engines (docs/seo.md)
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync('apps/hub/index.html', `${out}/index.html`);
cpSync('apps/hub/media', `${out}/media`, { recursive: true });
cpSync('apps/hub/favicon.svg', `${out}/favicon.svg`);

// Search engines (docs/seo.md): one list of public pages feeds robots.txt and sitemap.xml.
// Parking Precision is left out on purpose: its pages still name parking-precision.vercel.app
// as canonical, and a sitemap must only list canonical URLs.
const SITE = 'https://sundown-club.vercel.app';
const PAGES = ['/', '/blackjack/', '/holdem/', '/videopoker/', '/racing/'];
writeFileSync(`${out}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join('\n')}
</urlset>
`);
writeFileSync(`${out}/robots.txt`, `User-agent: *
Allow: /
Disallow: /parking/design/
Disallow: /api/
Disallow: /admin/

Sitemap: ${SITE}/sitemap.xml
`);

// Owner-only pages (noindex, password in the API): metrics.
mkdirSync(`${out}/admin/metrics`, { recursive: true });
cpSync('apps/hub/admin/metrics.html', `${out}/admin/metrics/index.html`);

// Static game pages: index.html plus any sibling .js modules (engine, bots).
for (const app of ['blackjack', 'holdem', 'videopoker']) {
  mkdirSync(`${out}/${app}`, { recursive: true });
  for (const f of readdirSync(`apps/${app}`).filter((n) => n === 'index.html' || n.endsWith('.js'))) cpSync(`apps/${app}/${f}`, `${out}/${app}/${f}`);
}

// Shared modules for static pages, mapped by their import map: "@sundown/shared/" -> "/shared/".
cpSync('packages/shared', `${out}/shared`, { recursive: true, filter: (src) => !/(node_modules|\.md$|package\.json$)/.test(src) });


// Third-party code and fonts, served from this site (never from a CDN or Google Fonts).
const nm = 'node_modules';
mkdirSync(`${out}/vendor/three`, { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) cpSync(`${nm}/three/build/${f}`, `${out}/vendor/three/${f}`);
mkdirSync(`${out}/vendor/gsap`, { recursive: true });
for (const f of ['gsap.min.js', 'ScrollTrigger.min.js']) cpSync(`${nm}/gsap/dist/${f}`, `${out}/vendor/gsap/${f}`);
mkdirSync(`${out}/vendor/fonts`, { recursive: true });
const FONTS = [['Young Serif', 'young-serif', [400]], ['Schibsted Grotesk', 'schibsted-grotesk', [400, 500, 600, 700]], ['IBM Plex Mono', 'ibm-plex-mono', [400, 500, 600]]];
let css = '/* Self-hosted fonts (SIL Open Font License 1.1), copied from @fontsource by tools/build-site.mjs */\n';
for (const [family, pkg, weights] of FONTS) for (const w of weights) {
  const file = `${pkg}-latin-${w}-normal.woff2`;
  cpSync(`${nm}/@fontsource/${pkg}/files/${file}`, `${out}/vendor/fonts/${file}`);
  css += `@font-face { font-family: "${family}"; font-style: normal; font-weight: ${w}; font-display: swap; src: url("/vendor/fonts/${file}") format("woff2"); }\n`;
}
writeFileSync(`${out}/vendor/fonts.css`, css);

// The club's legal pages live at the site root.
for (const f of readdirSync('apps/hub/legal').filter((n) => /\.(html|css)$/.test(n))) cpSync(`apps/hub/legal/${f}`, `${out}/${f}`);

if (!existsSync('apps/parking/dist/index.html')) throw new Error('apps/parking/dist is missing: run the parking build first');
cpSync('apps/parking/dist', `${out}/parking`, { recursive: true });

if (!existsSync('apps/racing/dist/index.html')) throw new Error('apps/racing/dist is missing: run the racing build first');
cpSync('apps/racing/dist', `${out}/racing`, { recursive: true });

console.log('Sundown Club site assembled in dist/');
