/** Checks the built site's guide pages (run after `npm run build`): tags, links, words, copy rules. node tools/seo-check.mjs */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { GUIDES } from '../apps/hub/guides/guides.js';

const SITE = 'https://sundown-club.vercel.app';
let n = 0;
const ok = (fn) => { fn(); n++; };
assert.ok(existsSync('dist/guides/index.html'), 'run npm run build first');
const read = (p) => readFileSync(p, 'utf8');
const sitemap = read('dist/sitemap.xml');
const pages = [['/guides/', 'dist/guides/index.html'], ...GUIDES.map((g) => [`/guides/${g.slug}/`, `dist/guides/${g.slug}/index.html`])];

for (const [path, file] of pages) {
  ok(() => {
    const h = read(file);
    const get = (re) => (h.match(re) || [])[1];
    const title = get(/<title>([^<]*)<\/title>/), desc = get(/<meta name="description" content="([^"]*)"/), canon = get(/<link rel="canonical" href="([^"]*)"/);
    assert.ok(title && title.length >= 25 && title.length <= 70, `${path} title (${title?.length})`);
    assert.ok(desc && desc.length >= 120 && desc.length <= 165, `${path} description (${desc?.length})`);
    assert.equal(canon, SITE + path, `${path} canonical`);
    assert.ok(canon.endsWith('/'));
    assert.equal((h.match(/<h1[ >]/g) || []).length, 1, `${path} one h1`);
    for (const t of ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:card', 'twitter:image']) assert.ok(h.includes(t), `${path} ${t}`);
    const img = get(/property="og:image" content="([^"]*)"/).replace(SITE, '');
    assert.ok(existsSync('dist' + img), `${path} og:image file ${img}`);
    const blocks = [...h.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map((m) => JSON.parse(m[1])).flat();
    assert.ok(blocks.length >= 1);
    assert.ok(sitemap.includes(`<loc>${SITE}${path}</loc>`), `${path} in sitemap`);
    const text = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
    if (path !== '/guides/') assert.ok(text.split(/\s+/).filter(Boolean).length >= 280, `${path} has ${text.split(/\s+/).length} words`);
    assert.ok(!/\$/.test(text), `${path} uses a dollar sign`);
    assert.ok(!/\bA\.?I\.?\b|artificial intelligence|\bClaude\b|Anthropic|\bGPT\b/.test(text), `${path} mentions AI`);
    for (const [, href] of h.matchAll(/href="(\/[^"#?]*)"/g)) {
      const f = href.endsWith('/') ? `dist${href}index.html` : `dist${href}`;
      assert.ok(existsSync(f), `${path}: broken link ${href}`);
    }
    if (path !== '/guides/') {
      assert.equal(blocks.some((b) => b['@type'] === 'Article' && b.headline), true, `${path} Article`);
      assert.ok(h.includes('class="cta"'), `${path} links to a game`);
    }
  });
}
ok(() => { assert.ok(readdirSync('dist/guides').filter((x) => x !== 'index.html').length === GUIDES.length); assert.ok(GUIDES.length >= 10); });
ok(() => { // no invented ratings in structured data
  for (const [, f] of pages) assert.ok(!/aggregateRating|"review"|ratingValue/.test(read(f)), f);
});
ok(() => { assert.ok(read('dist/robots.txt').includes('Sitemap:')); assert.ok(!read('dist/robots.txt').includes('Disallow: /guides')); });
console.log(`seo-check: ${n} groups passed (${pages.length} pages)`);
