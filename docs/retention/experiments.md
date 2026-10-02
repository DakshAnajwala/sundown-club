# Experiments (A/B tests)

How they work: `packages/shared/flags.js` and `apps/hub/flags.json` (see the file header). Every experiment is **off**. A player's variant is a hash of their random id and the experiment name, so it is stable and needs no server. While an experiment is off everyone gets its `default`, the recommended behaviour. When one is on, events carry `exp: "name:variant"` and the metrics page (`/admin/metrics/`, "Experiments") shows players per variant and how many were active this week.

**Rules**
1. Do not switch one on until its hypothesis, primary metric, guardrails and stop rule below are agreed, and **only when enough players exist to answer it**. With the audience today (nobody measured yet) the right call is: ship the default, wait. "Not enough users yet" is a valid result.
2. Switch on by editing `apps/hub/flags.json` (`"enabled": true`) and deploying. Players pick up the change within a day (the config is cached for 24 hours).
3. Run each test alone. Two at once split the players four ways and slow both.
4. A test ends when its stop rule is met, then the winner becomes the new `default` and `enabled` goes back to `false`.
5. Sample size: aim for at least 400 new players per variant for a 5-point change in D7 return (rule of thumb, 80 percent power). Fewer than that, do not read the result.

## 1. `round_panel`: the after-round note (built)

- **Variants:** `on` (default), `off`. Off: nothing is shown after a round; XP, quests and streak still count.
- **Hypothesis:** seeing XP and quest progress straight after a round makes people play one more round and come back tomorrow.
- **Primary metric:** rounds per player per active day; D1 return.
- **Guardrails:** session length does not fall; no rise in players leaving straight after a round.
- **Stop rule:** 400 new players per variant, or 28 days, whichever is later; adopt `on` only if D1 return is not lower and rounds per day is higher.

## 2. `quests_count`: three quests or four (built)

- **Variants:** `3` (default), `4` (an extra wild quest).
- **Hypothesis:** a fourth quest lifts sessions per day without making the table feel like homework.
- **Primary metric:** days a player finishes at least one quest; share who clear the whole table.
- **Guardrails:** clean-sweep rate must stay above 40 percent (otherwise four is too many); quest swaps per day do not rise sharply.
- **Stop rule:** 400 new players per variant and 14 days.

## 3. `onboarding_start`: ask first, or sit down (built)

- **Variants:** `ask` (default: the one-question picker), `auto` (a brand-new visitor goes straight into Blackjack).
- **Hypothesis:** skipping the question gets people to a first win sooner.
- **Primary metric:** share of new players who reach `first_win` within their first session; D1 return.
- **Guardrails:** bounce (a session under 20 seconds) does not rise; players who wanted cars and got cards do not leave faster.
- **Stop rule:** 300 new players per variant.

## 4. `freeze_rate`: a streak freeze every 7 days or every 5 (built)

- **Variants:** `7` (default), `5`.
- **Hypothesis:** earning freezes sooner softens the first missed day and keeps more runs alive past day 7.
- **Primary metric:** share of players who reach a 14-day run; D30 return.
- **Guardrails:** average run length is not shorter; freezes held at the cap (3) do not pile up.
- **Stop rule:** 500 new players per variant and 45 days (the metric is slow).

## 5. `daily_claim_place`: claim on the hub or inside a game (designed, not built)

- **Variants:** `hub` (default), `game` (a claim button on the after-round note).
- **Hypothesis:** claiming where players already are gets more claims, so more evenings count.
- **Primary metric:** claims per active day; share of days with a claim.
- **Why not built:** it needs a clickable control in every game's HUD (the note ignores the pointer on purpose) and a design pass for each; the experiment is not worth that until traffic exists.
- **Stop rule:** 400 new players per variant.

## Reading the numbers

The metrics page gives per-variant players and how many were active this week. For D1/D7 by variant, add the variant tag to the cohort query (a `t:expv:<tag>` set per variant already exists; intersect it with a cohort set: `SINTERCARD 2 t:expv:round_panel:off t:cohort:<day>`). That query is not on the page yet.
