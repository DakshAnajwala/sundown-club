# SPEC — First-party telemetry and the metrics page

Loop served: all four (it measures them). Status: built on `feat/retention`, 2 Oct 2026.
Brief: `GOAL.md` §2.1.

## 1. What it is

Anonymous, first-party, opt-out counters. No cookies, no third-party script,
nothing typed by the player. It exists so the owner can see DAU/WAU/MAU,
D1/D7/D30 return and the funnel, and so later phases can be judged.

## 2. Decisions (recommended options taken; owner may overturn)

| Question | Choice |
|---|---|
| Raw events kept? | No. Only counters and per-day player sets (see §5). Less to leak, cheaper. |
| Player id | The existing random `hub.v1.profile` id (`ensureIdentity()`), never linked to a name server-side. The handle is never sent. |
| Default | On, with a one-click off in Settings (`hub.v1.settings.telemetry`), and off when `navigator.doNotTrack === "1"` or Global Privacy Control is on. |
| Retention of data | Every key expires after 180 days. |
| Day boundary | UTC date, server-assigned (clients cannot back-date). |
| Store | Upstash REST (same `KV_REST_API_URL` / `KV_REST_API_TOKEN` as the board) when set, else in-memory (dev only, lost on restart). |

## 3. Client (`packages/shared/telemetry.js`)

`initTelemetry({ game })` once per page; `track(name, props)` anywhere.

- Batches in memory, flushes at 10 events, after 5 s, and on `visibilitychange: hidden` / `pagehide` through `navigator.sendBeacon('/api/club/event')` (fallback `fetch keepalive`).
- Fires `session_start` once per tab session (sessionStorage flag) and `game_open` on every init; `game_leave` and `session_end` on page hide.
- `session_start` props: `game`, `ref` (`direct|internal|search|social|other`, derived from `document.referrer`, the URL itself is never sent), `day_index` (local days since first visit), `is_new`.
- Off = nothing queued, nothing sent, nothing stored but the setting.
- Never throws: every storage and network call is wrapped.

## 4. Server (`api/club/event.js`)

- POST only, body ≤ 8 KB, ≤ 20 events per batch, `Content-Type` json or text.
- Player id must match the UUID shape. Event name must be on the allow-list in `api/_lib/club.js`; props are filtered to an allow-list of keys with short string / number / boolean values.
- Rate limit per IP: 240 events a minute (IP hashed with a daily-rotating salt, counter expires in 120 s, never stored with events).
- Replies 204 always for valid shapes (the client never retries), 400 for malformed, 429 over the limit.

## 5. Keys written (all expire after 180 days)

| Key | Type | Meaning |
|---|---|---|
| `t:act:<day>` | set | players active that day |
| `t:act:<game>:<day>` | set | players who opened that game that day |
| `t:first` | hash player→day | first day seen (HSETNX) |
| `t:cohort:<day>` | set | players whose first day is `<day>` |
| `t:ev:<day>` | hash event→count | event counts |
| `t:sess:<day>` | hash bucket→count | session length histogram (buckets in minutes: 0-1, 1-3, 3-10, 10-20, 20-45, 45+) |
| `t:fun:<day>:<step>` | set | funnel steps: `landing`, `game_open`, `round_end`, `second_game` |
| `t:games:<day>:<player>` | set | games opened by a player that day (feeds `second_game`) |

## 6. Metrics (`api/club/metrics`, page `/admin/metrics/`)

- Bearer password from env `METRICS_PASSWORD` (owner sets it in Vercel; never read from `.env` by Claude). Unset → 503. Constant-time compare. 401 on mismatch.
- Returns: DAU for the last 30 days, WAU (rolling 7) and MAU (rolling 30) for today, DAU/MAU, cohort table (cohorts of the last 14 days × D1, D7, D30 counts and %), session histogram (last 7 days), funnel (last 7 days), per-game DAU (last 7 days), event totals (last 7 days).
- Page: static, `noindex`, password in `sessionStorage` only, club look, inline SVG charts.

## 7. Acceptance

- `node tools/telemetry-check.mjs`: validation, allow-list, cohort/retention math, histogram buckets, rate limit, opt-out.
- Headless probe `node tools/telemetry-probe.mjs` against `tools/dev-api.mjs`: fresh browser plays a round → events land; toggle off → zero requests.
- Privacy page states exactly this (what, why, opt-out, 180 days).

## 8. Owner to do

- Set `METRICS_PASSWORD` in the `sundown-club` Vercel project (and the two Upstash vars if not set; see `docs/deploy.md`). Until then the event endpoint stores nothing durable.
