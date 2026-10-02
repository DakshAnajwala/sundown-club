# Search engines (SEO)

How Sundown Club is set up to be found on Google, Bing and other search
engines. Read before changing a page's `<head>`, adding a page or game, or
moving the site to a new address.

## What is in place (2 Oct 2026)

| Thing | Where | Notes |
|---|---|---|
| `robots.txt` | made by `tools/build-site.mjs` | Allows everything except `/parking/design/` (design previews) and `/api/`. Names the sitemap. |
| `sitemap.xml` | made by `tools/build-site.mjs` from its `PAGES` list | `/`, `/blackjack/`, `/holdem/`, `/videopoker/`. No `lastmod`, because Vercel builds without git history. |
| Favicon | `apps/hub/favicon.svg`, served at `/favicon.svg` | The sun on the horizon. Search results show the home page's icon. |
| Title + description | every page's `<head>` | A title under about 60 characters, with the words people search for first ("Blackjack: free 3D blackjack in your browser"). A description of 140–160 characters. |
| Canonical URL | every page | An absolute `https://sundown-club.vercel.app/...` with the trailing slash. |
| Share cards | every page | Open Graph and Twitter tags. Images are 1200 × 630 in `apps/hub/media/og/`, cropped from real in-game frames. |
| Structured data | JSON-LD in every page | Hub: `WebSite`, `Person` and an `ItemList` of the games. Each game: `VideoGame`. No ratings or reviews: there are none, so none may be invented (PRODUCT.md). |
| A heading on game pages | `<h1 class="sr-only">` | The 3D games have no visible heading. This one is for screen readers and crawlers, and it matches the game's name. |
| Crawlable links | hub | The hub's game buttons are real `href`s (`/blackjack/` and so on), so crawlers can follow them. JavaScript only takes over inside a sandboxed preview frame. |

## Parking Precision: canonical stays on the old site (for now)

Parking's pages (`apps/parking/index.html`, `play/index.html`) still name
`https://parking-precision.vercel.app/` as canonical, and they carry that
site's Search Console verification tag. Today Google ranks the old address,
so searches for "Parking Precision" already find the game. Sundown Club's
sitemap leaves Parking out, because a sitemap may only list canonical URLs.

When the owner redirects the old site to `/parking/` (`docs/deploy.md`, "Old
site"), do all of these in the same change:

- Point Parking's canonical, `og:url` and JSON-LD `url` at `https://sundown-club.vercel.app/parking/...`.
- Add `/parking/` and `/parking/play/` to `PAGES` in `tools/build-site.mjs`.
- Change the hub's `ItemList` entry for Parking.
- Use 301 (permanent) redirects on the old site.

## Night Drive: kept out of search (for now)

Night Drive is in development (owner, 2 Oct 2026). Its test drive at
`/racing/` has `<meta name="robots" content="noindex">`, is not in the sitemap
or the hub's `ItemList`, and nothing on the hub links to it. Its share card
still works when someone is sent the link. When it is ready, do all of these:

- Remove the `noindex` tag.
- Add `/racing/` to `PAGES`.
- Add it back to the hub's `ItemList` and description.

## What only the owner can do

These steps need the owner's own Google and Microsoft accounts.

1. **Google Search Console.**
   - Go to https://search.google.com/search-console.
   - Choose Add property, then URL prefix, and enter `https://sundown-club.vercel.app/`.
   - Choose the "HTML tag" method. Send the `content="…"` code to whoever is working on the site; it goes into the hub's `<head>` as `<meta name="google-site-verification" content="…">` and is deployed.
   - Press Verify.
   - Under Sitemaps, submit `sitemap.xml`.
   - Under URL inspection, request indexing for `/`, `/blackjack/`, `/holdem/` and `/videopoker/`.
2. **Bing Webmaster Tools** (this also covers DuckDuckGo, Yahoo and Ecosia).
   - Go to https://www.bing.com/webmasters.
   - Choose "Import from Google Search Console".
3. **Links from outside.** Nothing helps ranking more than other sites linking here. Put the URL on the GitHub profile and the repo description, on itch.io or Newgrounds pages for the games, and anywhere the games are shared.

## What to expect

- New pages take days to weeks to appear.
- Searches for the names will work first: "Sundown Club", "Parking Precision", "Sundown Club blackjack".
- Plain "blackjack" or "video poker" are dominated by large sites; a small site will not rank for them soon.
- A custom domain (for example `sundownclub.com`) would rank and share better than a `vercel.app` address. If the site moves, change `SITE` in `tools/build-site.mjs` and every canonical, `og:` and JSON-LD URL.

## Rules

- Every new public page gets a title, a description, a canonical URL, share tags, JSON-LD that matches what is on the page, and an entry in `PAGES`.
- Never invent ratings, reviews, player counts or awards in structured data.
- Copy rules still apply in titles and descriptions: plain English, play chips only (never "$"), no mention of AI, no school name.
- No analytics or search tracking script: the privacy policy says there is none (§3).
- The React rebuild (Phase 3) must keep every tag above. Check that the built HTML, not only the rendered page, carries them.
