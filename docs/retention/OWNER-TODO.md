# Owner to do (retention programme)

Nothing here blocks the code. Each item turns a built feature on in production.

- [ ] **Telemetry store.** In the `sundown-club` Vercel project set `KV_REST_API_URL` and `KV_REST_API_TOKEN` (the Upstash database the Parking board already uses is fine; keys are prefixed `t:`). Until then `/api/club/event` runs on an in-memory store that is lost between invocations.
- [ ] **Metrics password.** Set `METRICS_PASSWORD` in the same project. Then open `https://sundown-club.vercel.app/admin/metrics/`. Unset = the page says "not set up yet".
- [ ] **Deploy.** Nothing on branch `feat/retention` is live. Say "deploy" when you want it (see `docs/deploy.md`; the privacy page changed, so read section 6 first).
- [ ] After deploying, check the rewrite: `/api/club/event` must reach this project, not `parking-precision.vercel.app` (the rewrite now skips paths starting with `club/`).
