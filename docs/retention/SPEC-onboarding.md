# SPEC — First visit: one question, a gentle first win, the welcome table

Loop served: habit (the first day-one return) and progress. Status: built on `feat/retention`, 2 Oct 2026. Brief: `GOAL.md` §4.
Probe: `node tools/onboarding-probe.mjs` (fresh browser to Level 2 in about 30 s of real time; target was 4 minutes).

## 1. Decisions (recommended options taken)

| Question | Choice |
|---|---|
| Who counts as new | Nobody has finished a round and no game summary exists in the profile (`onboarding().isNew`). Old players never see any of this. |
| One question | "What brings you in? Cards, Cars, A bit of both." Answer is saved (`onb.pick`). Cards and both preselect Blackjack, cars preselects Parking. The share-link form `/?pick=cars` answers it without asking. The referrer cannot choose a game (browsers give only the host, and search engines give nothing). |
| Primary action | New visitors see "Take a seat" (cards) or "Take the wheel" (cars). Returning players see "Play". The first screen is otherwise unchanged. |
| Gentle first hand | Blackjack only: if the player has never finished a hand (and is not in the tutorial or practice), the first deal is you 10-9 (19) against a dealer 6 and 10, who draws a King and busts. A note says it was a practice deal and every hand after is a fair shuffle. Tutorials already use fixed cards and are untouched. Parking's Deck One and the Night Drive test drive already open on their friendliest stretch. |
| First win bonus | 150 XP the first time any game reports a win (Blackjack win or natural, Hold'em pot, Video Poker win, a Parking star, 100 km/h in Night Drive). With the round's XP and the daily reward this is Level 2 in the first sitting. |
| Install prompt | Not before the second session; built with the PWA in Phase 5. |
| Collection log with silhouettes | Needs the item catalog; built with Phase 4. `catalog.js` already holds the three starter badges. |

## 2. The path

1. **Hub, first visit.** Step `landing`. The picker shows under the hero text; one tap, step `picked`, game selected, picker gone for good.
2. **Game.** The first round is `first_round`; the first win is `first_win` and pays the bonus. The after-round note says "First win! +150 XP. Press Esc twice to open the club and set up your table."
3. **Hub again, welcome table** (a dialog, once): choose a name from three generated ones (or keep, or roll again), choose one of three starter badges (kept and equipped, shown on the hub), see the progress to Level 2, claim the daily reward right there. Steps `welcome_open`, `welcome_done`.
4. Closing the dialog any way counts as done; it never returns.
5. Copy for the next day (true): "Tomorrow there is a fresh Daily Table. Seven days in a row earns a streak freeze."

All steps are `onboarding_step` events (once per player), so the metrics page funnel shows where people leave.

## 3. Saved fields

`hub.v2.profile.onb`: `pick`, `round` and `win` (times), `welcomed`, `steps`. Listed on the privacy page.

## 4. Acceptance (all pass)

`onboarding-probe`: picker for a new visitor and the right button words, choice remembered across a reload, the gentle hand dealt, first-win bonus and note, welcome dialog opens, three suggestions and re-roll work, claim from the dialog reaches Level 2, badge saved and shown, header shows Level 2, dialog does not return, all six steps recorded, no page errors.
