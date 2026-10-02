# SPEC — Game hub: Sundown Club

Status: **design approved by the owner, 30 Sep 2026** ("this is perfect"). Full scrolling page:
`apps/hub/index.html`, live at https://sundown-club.vercel.app (deploy notes in
`docs/deploy.md`).
Prototype, source of truth for look and motion: `apps/hub/design/d-mix.html`
(published: https://claude.ai/artifact/TtPngN4BwjLbumgaAk6MGh).
Lives in the Sundown Club monorepo: `apps/hub/`.
Related: `apps/blackjack/SPEC.md` (first hub game; its §13 storage contract is
extended here).

---

## 1. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Direction | Mix of sample A (console: full-screen backdrop of the chosen game, arrow-key rail) and sample B (warm dusk palette, serif, "Your evening"). |
| 2 | Rejected | C "Cabinet" bento ("too much going on"). Arched-window tiles ("I don't like the window type of thing"). Do not bring either back. |
| 3 | Name | **Sundown Club** (owner, 30 Sep). "afterglow" dropped (clashes with PDP's Afterglow gaming brand). |
| 4 | Routes | `/` hub. Parking homepage moves to `/parking/`. `/play/` unchanged. Blackjack at `/blackjack/`. |
| 5 | Rollout | Blackjack standalone first (SPEC-blackjack §1 #23), then the hub. The hub can be built in parallel on this branch; `/` only switches when both are ready. |
| 6 | Platform | Laptop/desktop browser first. Must not break at phone width (no sideways scroll), but no touch-specific layout. |
| 7 | Theme | Single dark look (no light theme). |
| 8 | Network | None. Everything is read from `localStorage`. |

The three rejected and superseded samples stay in `apps/hub/design/` for
reference (`a-console.html`, `b-windows.html`, `c-cabinet.html`).

## 2. Page structure

```
┌ first screen (min-height 100vh) ─────────────────────────────────────────┐
│ header: wordmark · nav (Games, Your evening, Settings, About) · profile │
│                                                                          │
│ hero (left, max 640px): eyebrow · title · blurb · Play / Continue · facts│
│                                                                          │
│ rail head: "Games"  ·  key hints (← → choose, Enter play, C continue)   │
│ rail: one tile per game, coming-soon tiles last                          │
└──────────────────────────────────────────────────────────────────────────┘
  backdrop behind all of it: the selected game's image + warm overlay
Your evening: level, XP bar, ledger (3 × 2)
footer: about line · Privacy · Terms · Third-party notices
```

Side gutter: `clamp(16px, 4.5vw, 64px)`.

## 3. Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#15100e` | Page |
| `--ink` | `#f3e7d8` | Text |
| `--ink-2` | `#b9a896` | Secondary text |
| `--line` | `rgba(243,231,216,.14)` | Hairlines, tile edge |
| `--glass` | `rgba(21,16,14,.5)` + `backdrop-filter: blur(10px)` | Profile chip, Continue button |
| `--wood` | `#3b2c24` | Avatar fill |
| `--accent` | per game (§6) | Dot, eyebrow, Play, ring, XP |

| Role | Face | Size |
|---|---|---|
| Wordmark | Young Serif 400 | 24 px, lowercase |
| Hero title | Young Serif 400 | `clamp(46px, 6.6vw, 92px)`, line-height 1, `text-wrap: balance` |
| Tile name, section titles | Young Serif 400 | 18 px (tile), 32 px ("Your evening") |
| UI text | Schibsted Grotesk 400–600 | 14–18 px |
| Numbers, eyebrows, keycaps | IBM Plex Mono 500–600 | 10–22 px, `tabular-nums` |

Fonts self-hosted with @fontsource (`young-serif` 5.3.0 is new; the other
two are already installed). Import `@fontsource/<family>/latin-<weight>`
without `.css` (repo gotcha).

## 4. First screen

### 4.1 Backdrop

- One `<img>` per game, stacked, `object-fit: cover`. The selected one fades
  in over 800 ms; the others fade out.
- Slow drift on the visible image: `scale(1.04)` → `scale(1.1) translate(-1.5%, -1%)`,
  26 s, ease-in-out, alternate, infinite. Off with `prefers-reduced-motion`.
- Overlay, top to bottom of the stack (exact, from the prototype):
  1. `radial-gradient(70% 60% at 85% 0%, accent 22%, transparent 70%)`
  2. `linear-gradient(90deg, bg .93 0%, bg .62 38%, bg .08 72%)`
  3. `linear-gradient(0deg, bg 1 0%, bg .55 26%, bg 0 50%)`
  4. `linear-gradient(180deg, bg .65 0%, bg 0 16%)`
- Image spec: 1600 × 900, WebP, ≤ 180 KB, real in-game frame, no HUD. Only
  the selected image loads eagerly; the rest load after first paint.

### 4.2 Header

- Wordmark: 12 px accent dot with `box-shadow: 0 0 16px accent`, then "afterglow".
- Nav links 14 px `--ink-2`, hover `--ink`. Hidden below 820 px.
- Profile chip: 30 px avatar (initials of the handle), "handle · Lv N" in mono
  12 px (handle cut with an ellipsis past 18 characters; below 520 px only
  "Lv N"), 72 × 4 px XP bar in accent. Click scrolls to "Your evening".

### 4.3 Hero

- Eyebrow: "<Genre> · <status>" in mono 12 px, `letter-spacing .12em`, uppercase, accent.
- Title: game name. Blurb: 18 px / 1.55, max 44ch, `#e2d5c5`.
- Buttons: Play (accent fill, text `#1b1209`, keycap "Enter"); Continue
  (glass, keycap "C", label from the game's resume text). Continue hidden
  when the game has no saved progress. Card games build the label from the
  live club bankroll ("Continue · 2,045 chips"), since chips are shared.
  Coming-soon: Play reads "In the workshop", disabled; no Continue.
- Facts: up to 3 pairs, value mono 20 px, label 12 px. Never played: facts
  about the game (Blackjack: 6 decks, 3 : 2, 1,000 starting chips). Played:
  the game's own `facts`, with any chips value replaced by the live bankroll.
- `aria-live="polite"` on the hero so selection changes are announced.

### 4.4 Rail

| Property | Value |
|---|---|
| Tile width | `clamp(200px, 17vw, 260px)`, gap `clamp(12px, 1.8vw, 24px)` |
| Shot | 16:10, radius 12 px, `box-shadow: 0 0 0 1px line, 0 14px 30px -18px rgba(0,0,0,.8)` |
| Rest image | `brightness(.78) saturate(.9)`, `scale(1.03)` |
| Selected | tile `translateY(-6px)`; ring `0 0 0 2px accent` + glow `0 22px 44px -16px accent`; image `brightness(1.02) saturate(1.05) scale(1.08)`; 2 px accent bar under the name grows `scaleX 0 → 1` |
| Hover | same image lift as selected, no ring |
| Motion | 300 ms `cubic-bezier(.2,.8,.2,1)` (bar 350 ms, image 400–600 ms) |
| Name row | Young Serif 18 px + genre tag in mono 10 px uppercase |
| Coming soon | image `grayscale(.7) brightness(.42) blur(1.5px)`; "Coming soon" pill top-left (mono 10 px, glass) |
| Overflow | horizontal scroll, scrollbar hidden; selected tile scrolled into view |

Semantics: rail is `role="tablist"`, tiles are `<button role="tab">` with
`aria-selected`. Visible `:focus-visible` ring (`0 0 0 3px ink`).

### 4.5 Order and default selection

- Playable games sorted by `lastPlayed` (newest first); never-played games
  after them in the order Blackjack, Parking Precision; coming-soon last.
- The first tile is selected on load, so the hub opens on the game you
  played last.

## 5. Controls

| Input | Action |
|---|---|
| `←` / `→` | Select previous / next tile (wraps) |
| `Enter` | Play the selected game (ignored for coming-soon) |
| `C` | Continue the selected game |
| Click a tile | Select it; click the selected tile again to play |
| Double-click a tile | Play |

Keys are ignored while focus is in a form field.

## 6. Game registry

`src/hub/games.js` is the only list of games. Adding a game = one entry
and one backdrop image.

| id | Name | Accent | Eyebrow | URL | Status |
|---|---|---|---|---|---|
| `blackjack` | Blackjack | `#f0a868` | Cards · New | `/blackjack/` | live when built |
| `parking` | Parking Precision | `#8fe3cf` | Driving · 17 car parks | `/play/` | live |
| `holdem` | Hold'em | `#d98a93` | Cards · New | `/holdem/` | live (1 Oct 2026) |
| `videopoker` | Video Poker | `#e8b860` | Cards · New | `/videopoker/` | live (1 Oct 2026) |
| `drive` | Night Drive | `#9aa6ff` | Driving · Coming soon | none | soon (placeholder) |

Coming-soon tiles stay as teasers (owner, 30 Sep).

## 7. "Your evening" and footer

- Heading: "So far tonight, <handle>." once anything has been played;
  "Pull up a chair, <handle>." for a newcomer. Under it: "Kept in this browser
  and never sent anywhere. Another browser or device starts its own evening."
- "Change name" (text button) opens an inline form: label "New name", input
  (max 24 characters), Save, Cancel. Enter saves, Esc or Cancel closes, focus
  returns to "Change name". An empty name is refused with "Type a name first,
  or press Cancel to keep this one."
- Left: level ring (hidden at 0 XP into the level), "into / next XP",
  "N XP to level L+1", 6 px XP bar (gradient `#c9733f` → accent), streak: the
  last seven days by weekday initial, lit for the current run.
- Right: ledger, 3 columns × 2 rows (2 columns below 900 px), 1 px `--line`
  gaps, each cell: label (mono 11 px uppercase, game accent), value (mono
  30 px), caption (13 px).
- Cells (owner, 2 Oct 2026): Card games · club chips (live bankroll); Card
  games · hands played (Blackjack + Hold'em + Video Poker); Parking · stars
  (x / 51); Parking · best park, out of 100; Night Drive · top speed, km/h;
  Everything · time played.
- Never-played game: its cells show "—" and caption "Not played yet".
- Footer: "Browser games by Daksh Anajwala · github.com/DakshAnajwala ·
  progress stays on this device"; links Privacy, Terms, Third-party notices.
  Homepage copy rules from CLAUDE.md apply (no AI mention, no school name).

## 8. Profile, XP, storage

Extends `apps/blackjack/SPEC.md` §13.

```js
// localStorage "hub.v2.profile" (2 Oct 2026; v1 is copied forward once, see docs/retention/SPEC-profile-v2.md)
{
  id: "52f37248-f49e-422b-8cd4-ba2618c73d09", // random, made on the first hub visit
  handle: "Warm Tern",        // random evening name until the player changes it
  xp: 1340,
  streak: { days: 3, last: "2026-09-30" },
  games: {
    blackjack: { lastPlayed: 1790740000000, resume: "Continue · 2,450 chips",
                 facts: [["2,450","Chips"],["4,100","Peak"],["312","Hands"]],
                 ledger: { peak: 4100, hands: 312 }, timeMs: 5400000 },
    parking:   { lastPlayed: …, resume: "Continue · Level 7, Rooftop",
                 facts: [["38 / 51","Stars"],["94","Best park"],["2h 40m","Played"]],
                 ledger: { stars: 38, starsMax: 51, best: 94 }, timeMs: … }
  }
}
```

- Identity (owner, 2 Oct 2026: "everyone should have their own unique user
  id"): `ensureIdentity()` in `packages/shared/profile.js` makes `id`
  (`crypto.randomUUID()`, random-bytes fallback outside a secure context) and
  `handle` (an adjective + night creature, e.g. "Amber Heron") on the first
  hub visit. `setHandle()` renames (trimmed, control characters removed, max
  24). Both stay in this browser: no network, no accounts, so another browser
  or device is another player. Syncing across devices would need accounts and
  a server (owner's call). The id is not shown on the page; it is kept for the
  club leaderboard. The handle is separate from Parking's server-owned
  leaderboard name.
- `readProfile()` keeps `id` and `handle`, so every game's read-modify-write
  preserves them.
- Each game writes its own entry when a session ends and on `pagehide`. The
  hub writes only the identity. Reads and writes are wrapped in try/catch;
  bad data = defaults.
- Level curve (changed 2 Oct 2026, cap 100): reaching level L+1 from L costs
  `200 + 50 × L` XP (L1→2 = 250, L7→8 = 550, L99→100 = 5,150). Titles per level
  band in `docs/retention/SPEC-profile-v2.md` §2.
- XP sources: Blackjack per its spec §6.1. Parking: finished park 5 XP + 5 per
  star, new personal best +10, first park of the day +10.
- Streak: a day counts when any game writes `lastPlayed` that local day.
- Shared settings (`hub.v1.settings`): master volume, reduced motion
  (default: follow OS), graphics quality. Games read them on load and may
  override locally.
- Each game's pause menu gets a "Hub" item linking to `/`.

## 9. Parking homepage move

- Current `index.html` → `parking/index.html`; `src/site/` stays; fix relative
  asset paths and the Vite `rollupOptions.input` map (add `hub`, `parking`,
  `blackjack`).
- Update canonical URL, Open Graph URL, `public/sitemap.xml`,
  and every internal link that points at `/` meaning the parking homepage.
- `/play/` keeps its URL. Its "Home" link goes to `/` (hub).
- No redirect needed: `/` still leads to Parking in one click.

## 10. Motion and accessibility

- `prefers-reduced-motion`: no backdrop drift, no tile lift/scale
  transitions, crossfade becomes instant, smooth scroll off.
- Contrast: hero text sits on the 93% overlay; keep blurb ≥ 4.5:1.
- Every interactive element reachable by Tab in visual order; the rail is
  also operable with ← →.

## 11. Performance

- No three.js on the hub. Plain HTML/CSS/JS, one small module.
- Largest Contentful Paint ≤ 2.0 s on a mid laptop over fast 4G (selected
  backdrop is the LCP image: preload it).
- Total hub transfer on first load ≤ 600 KB including fonts and the selected
  backdrop.

## 12. Architecture

```
index.html            hub page (vite input "hub")
parking/index.html    moved parking homepage (vite input "parking")
src/hub/main.js       render hero + rail + evening from games.js + profile
src/hub/games.js      registry (§6)
src/hub/profile.js    read/write hub.v1.profile, XP/level/streak helpers (used by games too)
src/hub/hub.css       tokens + layout from apps/hub/design/d-mix.html
public/media/hub/     backdrop images (§4.1)
```

## 13. Verification

| Check | Pass |
|---|---|
| `tools/hub-probe.mjs` (puppeteer) | loads `/`; ← → cycles all tiles; hero updates; Enter on a live game navigates to its URL; Enter on coming-soon does nothing; no console errors |
| Storage cases | empty storage → Blackjack selected, no Continue, ledger shows "—"; seeded profile → last-played game selected, Continue label matches |
| Layout | no horizontal scroll at 400, 1024, 1440, 1920 px widths |
| Links | `/parking/`, `/play/`, `/blackjack/`, legal pages all return 200 in `npm run build && npm run preview` |
| Reduced motion | emulate `prefers-reduced-motion: reduce`: no animations run |

## 14. Open (owner)

- Anything else on the first screen (daily challenge, what's new)? Default: nothing.
