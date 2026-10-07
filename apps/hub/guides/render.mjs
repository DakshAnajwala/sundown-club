/**
 * Turns apps/hub/guides/guides.js into static pages: one per guide plus an
 * index. Called by tools/build-site.mjs. Every page gets a title, description,
 * canonical URL, share tags and JSON-LD that match what is on the page
 * (docs/seo.md rules). No script, no third-party file.
 */
import { GUIDES, GUIDE_BY_SLUG } from './guides.js';

const SITE = 'https://sundown-club.vercel.app';
const GAME = {
  blackjack: { name: 'Blackjack', href: '/blackjack/', og: 'blackjack' },
  holdem: { name: "Hold'em", href: '/holdem/', og: 'holdem' },
  videopoker: { name: 'Video Poker', href: '/videopoker/', og: 'videopoker' },
  parking: { name: 'Parking Precision', href: '/parking/play/', og: 'club' },
  racing: { name: 'Night Drive test drive', href: '/racing/', og: 'racing' },
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const head = ({ title, description, path, image, jsonld }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${path}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Sundown Club">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}/media/og/${image}.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}/media/og/${image}.jpg">
<script type="application/ld+json">
${JSON.stringify(jsonld, null, 2)}
</script>
<link rel="stylesheet" href="/vendor/fonts.css">
<link rel="stylesheet" href="/legal.css">
<style>.cta { display: inline-block; margin: 8px 0 0; padding: 12px 20px; border-radius: 10px; background: var(--accent); color: #1b1209; font-weight: 600; text-decoration: none; } .cta:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; } .lead { font-size: 19px; color: var(--ink); } .rel li { margin-bottom: 8px; } .list-index { list-style: none; padding: 0; } .list-index li { padding: 16px 0; border-bottom: 1px solid var(--line); } .list-index a { font: 400 22px var(--serif); color: var(--ink); text-decoration: none; } .list-index a:hover { color: var(--accent); } .list-index p { margin: 4px 0 0; color: var(--ink-2); }</style>
</head>`;

const shell = (inner, current) => `<body>
<header>
  <a class="word" href="/"><i aria-hidden="true"></i>sundown club</a>
  <nav aria-label="Site"><a href="/">Games</a><a href="/guides/"${current === 'guides' ? ' aria-current="page"' : ''}>Guides</a><a href="/privacy.html">Privacy</a></nav>
</header>
<main>
${inner}
</main>
<footer><span>© 2026 Daksh Anajwala · Sundown Club</span><span>Free, no sign-up, play money only.</span></footer>
</body>
</html>
`;

function table(t) {
  return `<div class="table"><table>\n<thead><tr>${t.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>\n<tbody>\n${t.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row" style="font:600 15px var(--sans);letter-spacing:0;text-transform:none;color:var(--ink)">${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('\n')}\n</tbody>\n</table></div>`;
}

export function renderGuide(g) {
  const path = `/guides/${g.slug}/`, game = GAME[g.game];
  const body = g.sections.map((s) => `<h2>${esc(s.h)}</h2>\n${(s.p || []).map((p) => `<p>${esc(p)}</p>`).join('\n')}${s.list ? `\n<ul>${s.list.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}${s.table ? `\n${table(s.table)}` : ''}`).join('\n');
  const related = (g.related || []).map((r) => GUIDE_BY_SLUG[r]).filter(Boolean);
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'Article', headline: g.h1, description: g.description, inLanguage: 'en', author: { '@type': 'Person', name: 'Daksh Anajwala' }, publisher: { '@type': 'Organization', name: 'Sundown Club', url: SITE }, mainEntityOfPage: `${SITE}${path}`, image: `${SITE}/media/og/${game.og}.jpg` },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Sundown Club', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/guides/` }, { '@type': 'ListItem', position: 3, name: g.h1, item: `${SITE}${path}` }] },
  ];
  const inner = `<p class="updated"><a href="/guides/" style="color:inherit">Guides</a> · ${esc(game.name)}</p>
<h1>${esc(g.h1)}</h1>
<p class="lead">${esc(g.intro)}</p>
<p><a class="cta" href="${game.href}">Play ${esc(game.name)}, free</a></p>
${body}
${related.length ? `<h2>Keep reading</h2>\n<ul class="rel">${related.map((r) => `<li><a href="/guides/${r.slug}/">${esc(r.h1)}</a></li>`).join('')}</ul>` : ''}
<p style="margin-top:32px"><a class="cta" href="${game.href}">Play ${esc(game.name)}</a></p>`;
  return head({ title: g.title, description: g.description, path, image: game.og, jsonld }) + '\n' + shell(inner, 'guides');
}

export function renderIndex() {
  const title = 'Guides: blackjack, poker, video poker, parking and drifting';
  const description = 'Short, plain guides to the games at Sundown Club: blackjack strategy, poker hands and pot odds, video poker, parking and drifting. Free to read, free to practise.';
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description, url: `${SITE}/guides/`, inLanguage: 'en' },
    { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: GUIDES.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/guides/${g.slug}/`, name: g.h1 })) },
  ];
  const inner = `<h1>Guides</h1>
<p class="lead">Short guides for the games in the club. Each one ends at a table where you can try it, with play chips and nothing to sign up for.</p>
<ul class="list-index">${GUIDES.map((g) => `<li><a href="/guides/${g.slug}/">${esc(g.h1)}</a><p>${esc(g.description)}</p></li>`).join('')}</ul>`;
  return head({ title, description, path: '/guides/', image: 'club', jsonld }) + '\n' + shell(inner, 'guides');
}

export const guidePaths = () => ['/guides/', ...GUIDES.map((g) => `/guides/${g.slug}/`)];
