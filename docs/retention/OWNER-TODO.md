# Owner to do (retention programme)

Nothing here blocks the code. Each item turns a built feature on in production.

- [ ] **Telemetry store.** In the `sundown-club` Vercel project set `KV_REST_API_URL` and `KV_REST_API_TOKEN` (the Upstash database the Parking board already uses is fine; keys are prefixed `t:`). Until then `/api/club/event` runs on an in-memory store that is lost between invocations.
- [ ] **Metrics password.** Set `METRICS_PASSWORD` in the same project. Then open `https://sundown-club.vercel.app/admin/metrics/`. Unset = the page says "not set up yet".
- [ ] **Deploy.** Nothing on branch `feat/retention` is live. Say "deploy" when you want it (see `docs/deploy.md`; the privacy page changed, so read section 6 first).
- [ ] After deploying, check the rewrite: `/api/club/event` must reach this project, not `parking-precision.vercel.app` (the rewrite now skips paths starting with `club/`).
- [ ] **Club boards need the same two Upstash variables** as telemetry (`KV_REST_API_URL`, `KV_REST_API_TOKEN`). Without them the boards run in memory on a serverless function, so they reset between requests and look empty. Keys are prefixed `b:` and `t:`, so sharing the Parking database is safe.
- [ ] **Challenge links need `CLUB_SECRET`.** Set a long random string in the Vercel project. Without it production refuses to sign, so Share still copies the result text but makes no link. (Never reuse the metrics password.)
- [ ] After the first deploy, open the hub, play a minute, and check the board shows you. If it says "resting", the store variables are missing.
- [ ] **Night Drive ghosts** are not built: the test drive has no route or timed lap to race, and `apps/racing/design/handling/handling.js` is being edited on another branch. Tell me which run a ghost should follow (quarter mile, a story lap) and it is a small job.
- [ ] The "who is here now" count is in the board response (hidden below 3 players) but the hub does not show it yet.
