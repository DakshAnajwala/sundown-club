# SPEC — Social: boards, friends, share cards, challenge links, invites, ghosts

Loop served: social (primary), habit. Status: built on `feat/retention`, 2 Oct 2026, except Night Drive ghosts (see §6). Brief: `GOAL.md` §5.
Probes: `board-probe` (~2 min), `social-probe`, and a Parking ghost probe (§7). Pure checks: `tools/board-check.mjs` (in `npm run check`).

## 1. The board (the existing `apps/hub/SPEC-leaderboard.md`, built; its section 10 lists the differences)

Tabs: Play time (week or all time), Blackjack peak, Parking stars, Streak, **Friends**. Top ten, your row pinned below, ties share a rank, "unverified" labelled. Names are made by the server from the player's id, "New name" is three a day, "Show me on the boards" removes you and stops every message.

## 2. Friends board

A private board by code: "Make a club" gives a six-character code from an alphabet without look-alikes (`2-9 A-Z` minus I, L, O); typing the code joins (one club at a time, 50 members). It ranks play time among members only. Strangers cannot find a club; there is no list.

## 3. Share card

`packages/shared/sharecard.js` draws a 1200x630 PNG on a canvas in the browser (dusk sky, hills, Young Serif title, game accent) and shares through the system share sheet with the picture, else copies text and link, else downloads the PNG. Where it appears: Video Poker after a seeded hand (key S or the button), and "Share" on a finished Daily Seed row in the hub. The card shows level, title and streak, and a spoiler-free grid (held cards green, replaced black) so a pasted message does not reveal the cards.

## 4. Challenge links

`/c/<code>` (rewritten to `apps/hub/challenge.html`, `noindex`). The code is `C1.<base64url json>.<HMAC-SHA256, 16 hex>` signed on the server with `CLUB_SECRET` and holds the game, the shuffle seed, the sender's result number and label, and their made-up name; editing any of it fails the check. The page asks the server to verify, names the sender, and links to `/videopoker/?c=<code>`, which deals the **same five cards and same draw** (free play, chips untouched) and tells you whether you beat them. Production refuses to sign without the secret. Only Video Poker for now (it is the one game with a small, seedable deal); Blackjack and Hold'em challenges arrive with the Phase 4 events.

## 5. Invites and presence

- **Invite link** `/?i=<8 characters>`: a code that stands for you, never your id. When the friend finishes their first round the server records it once per friend id; both get 1 token (the inviter collects theirs on their next hub visit); five a month for the inviter, the friend always gets theirs. Nothing is rewarded on opening alone.
- **Who is here now**: the board response carries a count of players with a counted heartbeat in the last two minutes, `null` below three (an empty room does not advertise itself). Not yet shown in the hub UI.

## 6. Ghosts

- **Parking (built):** Parking already records your best run per level and replays it as a grey car. Now "Get a ghost link" (hub, Daily Seed card) uploads that run (checked: whole samples, plausible positions, 30,000 characters at most, ten a day) under an eight-character id for 30 days. `/parking/play/?g=<id>` stores it as the **rival** for that level; starting that level shows a **gold** car driving their run next to your grey one, with the same fade near your car and no physics body.
- **Night Drive (not built):** the test drive has no route or timed lap to race, only a straight and a drift pad, and `handling.js` is under another session's edits. The ghost needs a defined run (a quarter mile or a story lap). It is listed in `docs/retention/OWNER-TODO.md` as waiting for that.

## 7. Verification

`board-probe`: 12 seeded players through the real API, hub board renders, heartbeat earns time while playing and nothing while the tab is hidden, "New name" stops at three, all windows and tabs load, switching off removes you. `social-probe`: card is a 1200x630 PNG, challenge link made and verified, forged link refused, the friend is dealt the same hand, invite code remembered and both tokens paid once, friends board lists both. Parking ghosts: `autodrive` plays level 1 (it saves a ghost), the hub offers a link, the server stores it, a second browser opens `?g=` and the rival loads on level start (407 samples), unknown id is a 404. (The probe was a throwaway copy of `apps/parking/tools/autodrive.mjs` pointed at the built site; rebuild it the same way.)
