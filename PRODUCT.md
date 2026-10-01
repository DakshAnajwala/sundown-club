# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three audiences, all confirmed by the owner (1 Oct 2026):

- **Friends and people the owner shares it with.** They get the link, play an
  evening, and come back on other evenings. They expect the club to remember
  them: their chips, their level, the game they played last.
- **Anyone who finds it.** Strangers arriving from search, forums or game
  sites. They decide within seconds whether to stay, often with no idea what
  Sundown Club is.
- **People judging the owner's work.** University or job applications, and
  anyone looking at the craft. They notice details, finish and consistency.

All of them play on a laptop or desktop browser with a keyboard, usually for
one sitting: an evening's play.

## Product Purpose

Sundown Club is a small collection of browser games by one developer, Daksh
Anajwala, with a homepage (the hub) that ties them together. It exists so that
each game feels like part of one place, and so that one person's games read as
a body of work rather than a list of links.

Success over the next few months means:

1. **People come back.** Return evenings, with the hub picking up where they
   left off.
2. **The craft stands out.** It feels made with care, and people notice the
   details.
3. **A shared board.** The club leaderboard (designed in
   `apps/hub/SPEC-leaderboard.md`, not built) gives people a reason to return
   and compare.

## Positioning

One evening-long club rather than a game portal. The games share one world
(golden hour turning to night), one play-money bankroll for the card games, and
one local profile. There is nothing to install, no account and no ads. Every
3D world, car, figure and sound is made in code by the same person. Neighbouring
browser-game sites aggregate unrelated games; this one is a single authored
place.

## Operating Context

- Live at https://sundown-club.vercel.app, one Vercel project and one build,
  deployed by CLI only when the owner says so.
- Games today: Blackjack, Texas Hold'em (6 seats, 5 bots), Video Poker (Jacks
  or Better), Parking Precision (17 car parks plus a daily), and Night Drive
  (an early test drive of a street-racing story game).
- Play is keyboard-first. Every game shows its keys, and every game leaves the
  same way: the first Esc asks, the second Esc saves and returns to the hub.
- Saving is local only (`localStorage`, one origin): the club bankroll
  `club.v1.chips`, the hub profile `hub.v1.profile`, plus one key per game.
  The only network traffic is Parking Precision's opt-out leaderboard.
- Each game has a short plain-English tutorial with pretend chips, offered the
  first time a player sits down.

## Capabilities and Constraints

- **Play money only.** Chips, never "$", and nothing to buy.
- **No real brands.** No real car brands, badges or model names.
- **Nothing from other companies' servers.** Fonts, three.js and GSAP are
  self-hosted. No CDN, no Google Fonts link, no analytics.
- **Privacy text follows the code.** Any new network request, stored key or
  third-party file updates the privacy policy in the same change.
- **Laptop and desktop first.** No page may scroll sideways at 400 px. The hub
  must work on a phone today. The games need a keyboard, and say so.
- **`prefers-reduced-motion` is respected everywhere.**
- **Planned growth the system must hold:**
  - more card and casino games in the same lounge with the same chips;
  - more driving games: Night Drive's story career, more Parking venues;
  - phone play someday, with touch controls for some games.
- **Not planned:** accounts or online play beyond local saves and the
  leaderboard.
- **Licence:** all rights reserved.

## Brand Commitments

- **Name.** "Sundown Club" (chosen 30 Sep 2026; "afterglow" was dropped). The
  game names are Blackjack, Hold'em, Video Poker, Parking Precision and Night
  Drive. Night Drive's final title is still open.
- **Voice.** Plain, warm English with in-world verbs ("Take a seat", "Pull up a
  stool"). Copy never mentions AI or Claude Code, never claims to be
  hand-written, and never names a school.
- **About section.** Only the owner's name, his story, his GitHub link and his
  email.
- **Binding identity, set by the owner:**
  - golden hour to dusk to night across the hub;
  - soft, flat-shaded, slowroads.io-style 3D;
  - faceless mannequin figures;
  - one accent per game.
- **Taste record, never to return:**
  - flat bright casino green;
  - glossy bevelled logos;
  - heavy black buttons;
  - clip-art icons;
  - bento dashboards;
  - arched "window" tiles.
  
  The anti-reference image is `apps/blackjack/refs/not-this-247blackjack.png`.

## Evidence on Hand

- **Real in-game frames** with no HUD, in `apps/hub/media/` and
  `apps/parking/public/`.
- **The owner's story,** as used in the About copy: "made Parking Precision
  instead of revising for a physics test, and kept going".
- **Measured game facts:** 17 car parks, a 720° steering wheel, scores out of
  100, the full-pay 9/6 table, six seats.

There are no testimonials, player counts, press, ratings or reviews, so none
may be invented. Leaderboard scores are labelled unverified.

## Product Principles

1. **One place, not a portal.** Every game should feel like another room of
   the same club. Shared things are shared: bankroll, profile, the way you
   leave, the way you learn.
2. **Remember the player.** A returning player is greeted with their own
   evening (chips, level, last game), never with sample data.
3. **Calm until it matters.** The world and the game lead; the interface stays
   small until a decision or a result needs the player's attention.
4. **Fair and honest.** Play money is called chips. A bet is never lost to
   leaving. Scores say exactly where points went. Nothing is claimed that is
   not true.
5. **Craft is the proof.** Details are measured, not guessed, because the
   site doubles as a showcase of the owner's work.

## Accessibility & Inclusion

Target WCAG 2.1 AA:

- text contrast of at least 4.5:1;
- every control reachable and visible from the keyboard;
- focus never lost;
- dialogs trap focus and close on Esc without breaking Esc twice to leave.

Game state that lives only in 3D (cards, totals, results) also needs a text
equivalent for screen readers.
