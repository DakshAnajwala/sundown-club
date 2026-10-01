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
7. Workshop: Night Drive teaser (owner wants teasers kept). Since 1 Oct it
   is an early test drive with a "Test drive" button to `/racing/`.
7. Your evening: profile stats count up (sample data until profiles exist).
8. The house: about + FAQ. 9. Night footer: giant wordmark rises.

Scroll animation: GSAP 3.15 + ScrollTrigger, self-hosted at `/vendor/gsap/`. With
`prefers-reduced-motion` or no GSAP, `html.static` lays everything out at its
end state. Keep that fallback working when adding sections.

## Rules

- Accent per game: Blackjack `#f0a868`, Parking `#8fe3cf`, Hold'em `#d98a93`,
  Video Poker `#e8b860`, Night Drive `#9aa6ff`.
- Links to games are site paths (`/blackjack/`, `/holdem/`, `/videopoker/`, `/parking/play/`, `/racing/`). Inside a
  sandboxed preview frame they show a toast instead of navigating.
- Profile numbers on the page are sample data and must stay labelled so until
  `packages/shared` profile code feeds real values.
- Legal pages: `legal/privacy.html`, `legal/terms.html`, `legal/notices.html`
  (+ `legal.css`), copied to the site root. `/parking/{privacy,terms,notices}.html`
  redirect to them (`vercel.json`), so Parking's in-game links land here too.
- Fonts and GSAP come from `/vendor/` (self-hosted); never add a CDN link.

## Open

- Real profile data (read `hub.v1.profile`), sorting the rail by last played.
- Leaderboard: designed in `SPEC-leaderboard.md` (mock `design/leaderboard.html`), waiting on the owner's answers (§9).
- robots.txt and sitemap at the site root.
