# SPEC — Profile v2 and the save code

Loop served: progress (and the base for all others). Status: built on `feat/retention`, 2 Oct 2026. Brief: `GOAL.md` §2.2.

## 1. Storage

`hub.v2.profile` replaces `hub.v1.profile`. `readProfile()` migrates on first read: it normalises the old value, writes it to the new key, and **never touches the old key** (backup). Anything unreadable becomes an empty profile. Unknown top-level keys survive every read-modify-write, so later phases can add fields (`daily`, `quests`, ...) without another migration.

```
{ v: 2, id, handle, createdAt, xp, tokens, badges: [id x3],
  streak: { days, last, best },
  inv: { owned: [id], equipped: { <slot>: id } }, found: { <id>: time },
  games: { <id>: { lastPlayed, timeMs, resume, facts, ledger } } }
```

Item ids match `^[a-z0-9][a-z0-9._-]{0,47}$` (for example `cardback.dusk`); slots are camelCase words (`cardBack`, `chipSet`, `felt`, `livery`, `frame`, `backdrop`).

## 2. Levels and titles (owner asked for 1 to 100)

Cost to go from level L to L+1 = `200 + 50 L` XP (L1→2 is 250, as before; L99→100 is 5,150; level 100 needs 267,500 XP in total). Level 100 is the cap; at the cap the hub shows "top level". Nobody had XP before this change (no game called `addXp`), so no player is moved.

Titles by level: 1 Newcomer, 5 Regular, 10 Night Owl, 20 Insider, 30 Fixture, 45 Old Hand, 60 Club Legend, 100 Keeper of the Lamp.

## 3. API (`packages/shared/profile.js`)

`grantXp(n)` → `{ xp, level, from, leveled }` (`addXp` kept, returns XP). `addTokens(n)` clamps 0..99. `grantItem(id)` (true when new, also logs in `found`). `equip(slot, id|null)`. `setBadges(ids)` (owned only, max 3). `markFound(id)`. `titleFor(level)`, `xpToNext(level)`, `levelFor(xp)`.

## 4. Save code (`packages/shared/save.js`)

`SC1.<base64url JSON>.<FNV-1a checksum>`. Exports every key the club owns (prefixes `hub.v`, `club.v1.`, `tut.v1.`, `bj.v1.`, `holdem.v1`, `vp.v1`, `handling-lab:`, `parking-precision:`), never anything else. Import accepts only those keys, string values, ≤ 2 MB, and replaces the club's keys (two-step confirm in the UI). A bad checksum, cut-off paste or foreign magic is refused with a plain message. It is the player's own data, so the checksum guards typos, not tampering (server trust is handled separately for boards, see `SPEC-leaderboard.md` §5).

UI: hub, Your evening → "Save & settings": download file, copy code, paste or pick a file to load, usage-counters switch, erase.

## 5. Acceptance (all pass)

`node tools/profile-check.mjs` (in `npm run check`): v1→v2 lossless and old key untouched, junk never throws, identity survives game writes, curve, titles, XP/tokens/items/equip/badges, unknown keys survive, save round trip, damaged and forged saves refused, foreign keys dropped, reset only removes club keys. Browser: `node tools/save-probe.mjs`.

## 6. Open

Sync across devices (`GOAL.md` §2.3) is not built: needs a server store and the owner's go-ahead on the privacy text.
