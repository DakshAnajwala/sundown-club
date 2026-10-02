# Sundown Club hub (`apps/hub`)

The homepage at `/`: pick a game, scroll through the club. Root `CLAUDE.md`
rules apply. `SPEC.md` is the source of truth for look, behaviour and the
shared profile.

## Files

| Path | What |
|---|---|
| `index.html` | The whole page: styles, markup and script in one file (static, no build step yet) |
| `media/` | Backdrop and chapter images (real in-game frames, no HUD) |
| `SPEC.md` | Hub spec: tokens, first screen, rail, profile/XP storage (`hub.v1.*`), verification |
| `SPEC-leaderboard.md` | Club leaderboard ("The board") design, not built |
| `design/` | Direction samples, `leaderboard.html` board mock. `d-mix.html` is the approved first screen; A/B/C are rejected, kept for reference |

## The page, top to bottom

1. Fixed sky behind everything (`#sky`) that sets across the whole scroll:
   golden hour → dusk → night, sun sinks behind the hills, stars and moon.
2. Lobby: approved first screen. Selected game fills the backdrop; rail of
   game shots; ← → Enter C.
3. The door: manifesto, words light up with scroll.
4. Blackjack chapter (sticky, 340vh): card opens to full bleed, callouts, night.
5. Card room chapter (sticky, 320vh): Hold'em opens from a card on the left, then Video Poker takes over.
6. Parking chapter (sticky, 420vh): horizontal filmstrip, counter, progress.
7. Workshop: a quiet Night Drive teaser marked "In development", with no
   way in (owner, 2 Oct 2026). Night Drive is not in the rail, the menu or the
   ledger, and nothing on the hub links to `/racing/`; the test drive is
   reached only by its address.
7. Your evening: this browser's player (random name, changeable) with level,
   streak and a ledger of real numbers that count up.
8. The house: about + FAQ. 9. Night footer: giant wordmark rises.

Scroll animation: GSAP 3.15 + ScrollTrigger, self-hosted at `/vendor/gsap/`. With
`prefers-reduced-motion` or no GSAP, `html.static` lays everything out at its
end state. Keep that fallback working when adding sections.

## Rules

- Accent per game: Blackjack `#f0a868`, Parking `#8fe3cf`, Hold'em `#d98a93`,
  Video Poker `#e8b860`, Night Drive `#9aa6ff`.
- Links to games are site paths (`/blackjack/`, `/holdem/`, `/videopoker/`, `/parking/play/`). Inside a
  sandboxed preview frame they show a toast instead of navigating.
- Every number about the player is real, read from `hub.v1.profile` and
  `club.v1.chips` through `packages/shared/profile.js` and `chips.js`. Never
  show sample data. Each browser is its own player: `ensureIdentity()` gives
  it a random id and name on the first visit (SPEC §8). Saved summaries are
  rendered as text, never as markup.
- The hub script is a module (`<script type="module">`) importing
  `/shared/*.js`, so open the page from `dist/` (`npm run serve`).
- Legal pages: `legal/privacy.html`, `legal/terms.html`, `legal/notices.html`
  (+ `legal.css`), copied to the site root. `/parking/{privacy,terms,notices}.html`
  redirect to them (`vercel.json`), so Parking's in-game links land here too.
- Fonts and GSAP come from `/vendor/` (self-hosted); never add a CDN link.
- Search engines: `docs/seo.md`. Game links are real `href`s so crawlers can follow them; keep the `<head>` tags (canonical, share cards, JSON-LD) when editing.

## Open

- XP: no game calls `addXp` yet, so every player stays Level 1. The XP sources are in SPEC §8; wiring them changes saved data, so it needs the owner's yes.
- Leaderboard: designed in `SPEC-leaderboard.md` (mock `design/leaderboard.html`), waiting on the owner's answers (§9).
