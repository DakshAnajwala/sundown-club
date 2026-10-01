---
name: Sundown Club
description: A small club of browser games, lit by a setting sun and then a lamp.
colors:
  club-espresso: "#15100e"
  club-dusk-floor: "#0d0b12"
  club-cream: "#f3e7d8"
  club-taupe: "#b9a896"
  club-dim-taupe: "#8a7c70"
  club-hairline: "rgba(243, 231, 216, 0.14)"
  club-smoked-glass: "rgba(21, 16, 14, 0.5)"
  club-wood: "#3b2c24"
  blackjack-apricot: "#f0a868"
  parking-mint: "#8fe3cf"
  holdem-rose: "#d98a93"
  videopoker-brass: "#e8b860"
  nightdrive-periwinkle: "#9aa6ff"
  on-accent-umber: "#1b1209"
  table-paper: "rgba(248, 243, 234, 0.86)"
  table-paper-solid: "#f8f3ea"
  table-ink: "#2c2a30"
  table-ink-soft: "#6b6670"
  table-hairline: "rgba(44, 42, 48, 0.14)"
  table-felt-teal: "#3f5f59"
  table-focus-blue: "#3d5f86"
  result-win: "#2f6b4f"
  result-lose: "#8a3b33"
  result-push: "#5b5866"
  result-natural: "#8a6a1f"
  parking-asphalt: "#15161d"
  parking-bay-green: "#76d6a8"
  parking-hud-mint: "#8fe6bb"
  lab-teal: "#4fc2b8"
typography:
  display:
    fontFamily: "Young Serif, Georgia, Times New Roman, serif"
    fontSize: "clamp(46px, 6.6vw, 92px)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Young Serif, Georgia, serif"
    fontSize: "32px"
    fontWeight: 400
    lineHeight: 1.1
  title:
    fontFamily: "Young Serif, Georgia, serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.15
  body:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  lead:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "0.14em"
  number:
    fontFamily: "IBM Plex Mono, ui-monospace, Menlo, monospace"
    fontSize: "20px"
    fontWeight: 500
    fontFeature: "tnum"
rounded:
  key: "4px"
  control: "8px"
  button: "10px"
  tile: "12px"
  card: "14px"
  dialog: "16px"
  pill: "999px"
spacing:
  gutter: "clamp(16px, 4.5vw, 64px)"
  xs: "8px"
  sm: "10px"
  md: "16px"
  lg: "22px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.blackjack-apricot}"
    textColor: "{colors.on-accent-umber}"
    rounded: "{rounded.button}"
    padding: "13px 20px"
  button-glass:
    backgroundColor: "{colors.club-smoked-glass}"
    textColor: "{colors.club-cream}"
    rounded: "{rounded.button}"
    padding: "13px 20px"
  table-button:
    backgroundColor: "{colors.table-paper-solid}"
    textColor: "{colors.table-ink}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  table-button-primary:
    backgroundColor: "{colors.table-felt-teal}"
    textColor: "{colors.table-paper-solid}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  table-panel:
    backgroundColor: "{colors.table-paper}"
    textColor: "{colors.table-ink}"
    rounded: "{rounded.button}"
    padding: "12px 16px"
  leave-card:
    backgroundColor: "#1b1512"
    textColor: "{colors.club-cream}"
    rounded: "{rounded.dialog}"
    padding: "26px 26px 22px"
  sample-chip:
    textColor: "{colors.club-taupe}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

<!-- Incumbent record, written 1 Oct 2026 before the design overhaul
     (docs/prompts/design-overhaul.md, phase 2). It describes the system as it
     ships today, drift included; docs/design/AUDIT.md says what fails. The
     replacement system is proposed in docs/design/SYSTEM.md and lives in
     packages/shared/design/. Re-run /impeccable document once it is built.
     The North Star, surface and component phrases below are proposed, not yet
     confirmed by the owner. -->

# Design System: Sundown Club

## Overview

**Creative North Star: "The Last Hour of Daylight"** *(proposed)*

The club is one evening. The hub is a dark espresso page lit from behind by a
fixed sky that sets as you scroll: golden hour, dusk, then stars and a moon.
Each game is a soft, flat-shaded 3D room, slowroads.io in spirit, with a window
onto low-poly hills and a lamp over the table. Faceless mannequin figures deal,
play and drive. The interface is meant to be the quiet part: small panels, calm
mono numerals and one warm accent per game.

In practice the system has split four ways:

- **The hub:** warm espresso, Young Serif, smoked glass.
- **The card tables:** translucent cream "paper" panels with a felt-teal
  primary button. They keep the hub's fonts but invert its ink.
- **Parking Precision:** its own slate-and-mint world, with a condensed
  display face on the homepage and system-UI menus in the game.
- **Night Drive:** an engineering lab, in a cool teal on navy.

The shared tutorial and leave cards hard-code the hub's palette and
Blackjack's apricot in every game.

**Key Characteristics:**
- Dark, warm, low-contrast backgrounds, with light coming from the scene, not
  from the chrome.
- A serif display face for names and moments, a grotesk for UI, and a mono
  face for every number and label.
- One accent per game, used for the eyebrow, the primary button, the
  selection ring and the XP bar.
- Translucent panels with backdrop blur over moving 3D.
- Keycaps on every control; keyboard first.

## Colors

The palette is warm and muted, set against a near-black espresso, with five
game accents that are pastel rather than neon.

### Primary
- **Blackjack Apricot** (blackjack-apricot): the club's default accent. It
  drives the hub's Play button, eyebrows, XP ring and wordmark dot. It is also
  hard-coded into the shared leave card and the tutorial pulse in every game.
- **Per-game accents:**
  - Parking Mint (parking-mint);
  - Hold'em Rose (holdem-rose);
  - Video Poker Brass (videopoker-brass);
  - Night Drive Periwinkle (nightdrive-periwinkle).

  The hub swaps its `--accent` to the selected game. Only Blackjack and
  Parking are tokens; the other three are written inline.

### Neutral
- **Club Espresso** (club-espresso): the hub's token background. The body is
  actually painted Dusk Floor (club-dusk-floor), a cooler violet-black.
- **Club Cream** (club-cream): primary text on dark.
- **Club Taupe** and **Dim Taupe** (club-taupe, club-dim-taupe): secondary
  and tertiary text.
- **Hairline** (club-hairline) and **Smoked Glass** (club-smoked-glass): tile
  edges, dividers and glass buttons.
- **Table Paper** (table-paper, table-paper-solid) with **Table Ink**
  (table-ink, table-ink-soft): the card games' HUD panels, copied verbatim
  into Blackjack, Hold'em and Video Poker. `--ink` means cream on the hub and
  near-black at the tables.

### Result colours (tables only)
- **Win** (result-win), **Lose** (result-lose), **Push** (result-push),
  **Natural** (result-natural): the small result text on Blackjack's hand
  tags.

### Drift (documented, not endorsed)
- **Felt Teal** (table-felt-teal): the primary button colour on the card
  tables and in the shared tutorial card.
- **Focus Blue** (table-focus-blue): the focus ring on the card tables.
- **Parking Asphalt**, **Bay Green**, **HUD Mint** (parking-asphalt,
  parking-bay-green, parking-hud-mint): three mints across one game and the
  hub.
- **Lab Teal** (lab-teal): Night Drive's lab accent.

**The One Accent Rule.** Each screen is tinted by exactly one game accent. The
hub follows it; the games do not yet.

## Typography

**Display Font:** Young Serif (with Georgia)
**Body Font:** Schibsted Grotesk (with system-ui)
**Label/Mono Font:** IBM Plex Mono (with ui-monospace, Menlo)

**Character:** A soft, slightly old-fashioned serif for names and moments,
against a sturdy, plain grotesk for doing things. The mono face carries every
number and every keycap, so values line up and read as measured. All three
are self-hosted from `@fontsource`. Parking's homepage adds Big Shoulders
Display (condensed caps), which appears nowhere else.

### Hierarchy
- **Display** (400, clamp(46px, 6.6vw, 92px), line-height 1, −0.01em):
  - the hub hero title and chapter titles;
  - `text-wrap: balance`.
- **Headline** (400, 32px): section titles such as "Your evening", the
  coach card at 24px and the leave card at 30px.
- **Title** (400, 18px): rail tile names, FAQ questions.
- **Lead** (400, 18px / 1.55, max 44ch): the hero blurb.
- **Body** (400–600, 14–15px / 1.5): UI text, table HUD labels, buttons
  (600).
- **Label** (500, 10–12px, 0.06–0.16em, uppercase, mono): eyebrows, room
  names, tile genre tags, keycaps.
- **Number** (500–600, 15–22px, mono, tabular): chips, bets, facts, ledger.

**The Mono for Measures Rule.** Any value a player compares (chips, bets,
scores, times, distances) is set in IBM Plex Mono with tabular figures.

## Layout

The hub is a long scroll of full-viewport stages. The side gutter is
clamp(16px, 4.5vw, 64px).

- **First screen.** A full-bleed game image under four stacked gradient
  overlays. The hero sits in a left column (max 640px), with a horizontal rail
  of 16:10 tiles below it. Tiles are clamp(200px, 17vw, 260px) wide with
  clamp(12px, 1.8vw, 24px) gaps.
- **Story chapters.** Sticky stages 320–420vh tall, scrubbed by GSAP
  ScrollTrigger. With reduced motion or without GSAP, `html.static` lays every
  section out at its end state.

Games are a full-window canvas with fixed corner panels: stats top-left, keys
top-right, the action bar bottom-centre, the tutorial card top-centre. Panels
are 16px from the edges. The bottom bar is centred with `left:50%` plus a
transform, which caps it at half the viewport (see AUDIT #11).

## Elevation & Depth

Depth comes from the 3D scene and from translucency, not from stacked
surfaces.

- **The hub** is flat dark planes with soft, long, low-opacity drop shadows
  under imagery. Glass buttons use `backdrop-filter: blur(10px)`.
- **The games** float translucent paper panels over the canvas, with a short
  soft shadow.
- **Dialogs** (the leave card) sit on a dimmed, blurred veil with one deep
  shadow.

### Shadow Vocabulary
- **Tile rest:** `box-shadow: 0 0 0 1px rgba(243,231,216,.14), 0 14px 30px -18px rgba(0,0,0,.8)`. A hairline ring plus a low cast shadow.
- **Tile selected:** `box-shadow: 0 0 0 2px var(--accent), 0 22px 44px -16px var(--accent)`. A ring plus a coloured glow in the game's accent.
- **Table panel:** `box-shadow: 0 6px 24px rgba(30,24,30,.12)`. Barely lifted paper.
- **Coach card:** `box-shadow: 0 18px 50px -18px rgba(30,24,30,.45)`.
- **Dialog:** `box-shadow: 0 30px 80px -30px rgba(0,0,0,.8)`.

**The Light Comes From the Scene Rule.** Chrome never glows on its own. The
only glow is the selected tile picking up its game's accent.

## Shapes

Gently rounded throughout, with no sharp corners and no full circles except
chips and avatars. Radii:

- keycaps 4px;
- table buttons 8px;
- hub buttons and table panels 10px;
- tiles 12px;
- cards 14px;
- dialogs 16px;
- pills 999px.

In practice there are about ten distinct radii between 2px and 22px.

Borders are 1px hairlines at 14% ink. Keycaps add a 2px bottom border at the
tables. Chip buttons are true circles with inset rings, drawn to match the 3D
chips.

## Components

### Buttons
- **Character:** quiet and tactile *(proposed)*. Small, soft and pressable,
  with each one showing its key.
- **Hub primary:** accent fill, umber text, 10px radius, 13px 20px padding,
  600 weight. On hover it lifts 1px.
- **Hub glass:** smoked glass with a hairline border and cream text.
- **Table button:** solid paper, ink text, 8px radius, 9px 14px padding. On
  hover it lifts 1px and goes to `#fffaf1`. When disabled it drops to 38%
  opacity.
- **Table primary:** felt-teal fill with paper text.
- **Keycap:** mono 11px in a 1px currentColor box. On the hub it is shown at
  60% opacity, which fails contrast.

### Chips (labels)
- **Sample / status pill:** mono 11px, taupe, dashed hairline, pill radius.
- **Coming-soon / lock pill:** mono 10px uppercase on smoked glass.

### Cards / Containers
- **Table panel:** translucent paper, 10px radius, 12px 16px padding, blurred.
- **Coach card:** near-opaque paper, 14px radius, Young Serif 24px title, a
  step label in brown-gold mono, and a felt-teal primary button. It sits
  top-centre in every game.
- **Leave card:** espresso `#1b1512`, 16px radius, an apricot eyebrow, a
  30px Young Serif question, an apricot "Leave (Esc)" button and a glass
  "Stay (Enter)" button. It sits on a 56% veil.

### Navigation
- **Hub header:** the wordmark (a sun glyph plus lowercase Young Serif 24px),
  six links at 14px taupe, the active link shown with a glass pill, and a
  profile chip (avatar initials, "handle · Lv N", a 72×4 XP bar).
- **Game picker rail:** tiles with 16:10 screenshots.
  - Selected: the tile rises 6px, gets an accent ring and glow, the image
    brightens, and a 2px accent bar grows under the name.
  - Arrow keys select, Enter plays, C continues.

### Signature: the setting sky
A fixed full-viewport sky behind the hub, which GSAP drives through golden
hour, dusk and night as the page scrolls. The sun sinks behind SVG hills, and
stars and a moon fade in. It is the hub's spine; nothing else on the site
moves with it yet.

## Do's and Don'ts

### Do:
- **Do** give every game exactly one accent and let the hub inherit it.
- **Do** set every compared value in IBM Plex Mono with tabular figures.
- **Do** show the key on every control.
- **Do** let the 3D room carry the mood. Chrome stays small and translucent.
- **Do** keep the `html.static` end-state layout working for reduced motion.

### Don't:
- **Don't** use flat bright casino green, glossy bevelled logos, heavy black
  buttons, clip-art icons, bento dashboards or arched "window" tiles (owner's
  taste record).
- **Don't** shout money: no "$", no exclamation marks, no yellow jackpot type.
- **Don't** load fonts or libraries from another company's server.
- **Don't** add a fourth surface style. Paper, espresso, slate and lab teal
  already disagree (see AUDIT #5).
