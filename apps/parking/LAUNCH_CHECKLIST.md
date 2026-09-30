# Going public: legal/compliance checklist

You asked two things: (1) is there a security/data risk in publishing this
repo and deploying it, and (2) what should you have in place so you don't get
sued. Read `⚠` items first — those are the only real risks found; everything
else is standard due diligence for any public web app.

**I'm not a lawyer, and this isn't legal advice** — it's a practical
engineering checklist for a solo/small dev shipping a free hobby game. For
anything beyond that (ads, payments, a company entity, a large audience),
have an actual lawyer review this before you rely on it.

## What I actually checked, and found

I scanned the whole repo for secrets, personal data, and network calls before
writing any of this. Results:

- ✅ **No API keys, tokens, or secrets** anywhere in the code, config, or git
  history that exists so far.
- ✅ **No `.env` files, no credentials.**
- ✅ **No network calls at all.** The game makes zero `fetch`/`XMLHttpRequest`
  calls — it's 100% client-side with no backend to attack or leak from.
- ✅ **No personal data collected.** The only persistence is `localStorage`,
  holding your best scores and your settings — nothing identifying (see
  `PRIVACY.md` for the exact keys and fields).
- ✅ **No third-party trackers, analytics, or ad scripts.**
- ✅ **No imported assets.** Every model, texture-equivalent, and sound is
  generated in code — nothing to license or attribute except two open-source
  libraries (below), which is exactly why v1's design rules banned imported
  assets in the first place.

**Bottom line: there is nothing confidential or sensitive in this codebase.**
The security/privacy risk of publishing it as-is is close to zero. The real
work below is about *legal hygiene* (licensing, disclosures, disclaimers), not
plugging a leak.

## ⚠ The two things that actually needed a decision or a fix

1. **Third-party license compliance.** This project bundles three.js and
   cannon-es (both MIT). MIT requires their license text to survive into any
   distribution of the software — a minified bundle on Vercel counts. This
   wasn't being done. **Fixed:** `THIRD_PARTY_NOTICES.md` now carries both
   full license texts, and it's linked from the in-game Settings panel
   (Legal → the same panel as Privacy/Terms) so it's reachable from the
   deployed build too, not just buried in the repo.

2. **Your own code's license.** A public GitHub repo with no `LICENSE` file
   is *legally* "all rights reserved" by default, but that's easy to get
   wrong by accident (e.g., GitHub sometimes prompts people to add a license,
   and some tooling assumes MIT if nothing's specified). You said you want
   **all rights reserved** — done explicitly in `LICENSE`, so there's no
   ambiguity for anyone who finds the repo.

## Files added this session

| File | Purpose |
|---|---|
| `LICENSE` | States your code is all-rights-reserved, public repo notwithstanding. |
| `THIRD_PARTY_NOTICES.md` | Full MIT license text for three.js and cannon-es, as required by their licenses. |
| `PRIVACY.md` / `public/privacy.html` | Plain-language privacy policy — reflects what the code actually does (nothing) rather than a boilerplate template. The `.html` version ships with the deployed game so it's reachable at `/privacy.html`. |
| `TERMS.md` / `public/terms.html` | Terms of use: ownership, no-affiliation-with-real-cars disclaimer, no warranty, liability cap, acceptable use. Same dual-file pattern. |
| `src/ui/Hud.js` | Added a "Legal" row in Settings linking to both pages, so they're discoverable in the actual game, not just in the repo. |
| `package.json` | `"license": "UNLICENSED"` — the npm-standard string meaning "proprietary, no license granted," matching `LICENSE`. |

## Filled in

Name, contact, and publish date are filled in throughout (Daksh Anajwala,
daksh.anajwala@gmail.com, September 14, 2026). One thing was deliberately left
open rather than guessed:

- **Governing law** (Terms §9) currently reads "the jurisdiction in which the
  developer resides" instead of naming a specific state or country — that's a
  genuine legal choice only you can make (and matters more once real money or
  a real dispute is involved than it does for a free hobby game). Replace it
  in `TERMS.md` and `public/terms.html` with something like "the laws of the
  State of California" or "the laws of India" whenever you're ready to commit
  to one.

## Trademark / IP: why the car itself is low-risk

`CAR_DESIGN.md` already documents that every vehicle is procedurally
generated, generic geometry — explicitly **not** modeled on, textured from,
or branded as any real manufacturer's car, and this was a deliberate design
constraint from early in the project (see `NOTES.md`'s "Asset licensing
note"). That's the single biggest thing that keeps a parking game low-risk on
the IP front: no logos, no badges, no traced body panels. `TERMS.md` §3
states this explicitly for anyone who finds a resemblance and wonders. You
don't need to do anything further here unless you start adding real brand
names, logos, or licensed music.

## The name "Parking Precision"

A quick gut-check, not a substitute for a real trademark search:

- Before you commit to the name for a public launch, a 2-minute search on
  the USPTO's TESS database (or your country's equivalent) and a browser
  search for "parking precision game" costs nothing and catches an obvious
  conflict early. This is optional for a free hobby project, but cheap
  insurance if you ever want to put it on app stores or take it further.
- You don't need to *register* a trademark to publish a free game under a
  name — trademark registration matters much more if you plan to monetize,
  put it in app stores, or build a brand around it.

## Cookies specifically (since you asked)

**The game sets zero cookies.** `localStorage` is a different browser
mechanism — it's not sent to a server automatically the way a cookie is, and
under most cookie-law frameworks (the EU's ePrivacy Directive/GDPR, for
example), storage used *strictly* for the site's own core functionality (like
saving your high score) is exempt from requiring a consent banner. That's why
there's no cookie banner in this game — one genuinely isn't required for what
it currently does. `PRIVACY.md` §2 discloses the storage anyway, in plain
language, which is the right level of transparency without over-engineering
a banner nobody needs yet.

**This changes the moment you add:** Google Analytics, Vercel Web Analytics,
any ad network, a login/account system, or anything that sets a *real*
cookie or tracks users across sites. If/when you do, you'll need:
- an actual cookie consent banner (for EU/UK visitors, and recommended for
  everyone) that lets people opt out before non-essential cookies fire,
- an updated `PRIVACY.md` naming the specific services and what they collect,
- for California visitors specifically (CCPA/CPRA), a "Do Not Sell or Share
  My Personal Information" mechanism if you ever sell/share data with an ad
  network — most small ad-free games never trigger this threshold, but
  analytics + ads together often does.

## Deploying on Vercel — practical notes

- **Environment variables:** if you ever add one (an API key for anything),
  set it in Vercel's dashboard, never commit it to the repo. Not applicable
  today since this game makes zero network calls, but worth stating for
  future-you.
- **Vercel's own logs:** Vercel's edge network logs standard request
  metadata (IP, path, timestamp) as part of normal operation — this is
  covered by Vercel's own privacy policy as the processor, not something you
  configure. `PRIVACY.md` §3 already discloses this.
- **Custom domain:** if you put this behind your own domain, WHOIS privacy
  protection (most registrars offer it free now) keeps your personal
  registration details out of public WHOIS lookups — unrelated to the game
  itself, but a common thing people forget when they "make it official."
- **Vercel Analytics / Speed Insights:** if you turn these on later (they're
  one click in the Vercel dashboard), treat that as "adding a tracker" per
  the cookies section above and update `PRIVACY.md` accordingly — check
  Vercel's current documentation on whether their analytics product sets
  cookies or is cookie-free before deciding if a banner is needed.

## Accessibility / consumer-protection odds and ends (low priority, free tier)

These rarely create legal exposure for a free hobby game, but are good
practice and take little effort if you have time before launch:

- A brief note that the game requires a keyboard (already present — the
  build's touch-device notice in `dist/artifact.html`/`tools/artifact-page.mjs`
  covers this).
- Respecting `prefers-reduced-motion` isn't currently implemented anywhere
  in the render loop; not a legal requirement for a game, just worth knowing
  if someone asks.

## Things that do NOT apply to you right now

So you don't waste time on them:

- **GDPR/CCPA data processing agreements, DPOs, breach notification plans** —
  these apply once you're actually *processing personal data at scale* or
  operating as a business entity handling EU/CA residents' data. A
  no-account, no-server, `localStorage`-only game doesn't meet that bar.
- **DMCA takedown policy / safe harbor registration** — relevant to sites
  that host *user-submitted* content (comments, uploads, user levels). This
  game has none, so there's nothing for anyone to submit.
- **COPPA (children's privacy, US)** — triggers when you *knowingly* collect
  personal information from under-13s. You collect no personal information
  from anyone, so this doesn't apply; `PRIVACY.md` §4 states this plainly
  rather than adding a compliance program you don't need.
- **PCI-DSS / payment handling** — no purchases exist in the game.
- **Export control** — a browser game with no encryption of its own, no
  restricted technology, isn't a concern here.

## One-time pre-launch pass

1. Fill in the bracketed placeholders (above).
2. `npm run build && node tools/artifact-page.mjs` (or your normal Vercel
   build) and confirm `/privacy.html` and `/terms.html` load on the deployed
   URL, not just localhost.
3. Click "Legal" in Settings on the live deployed game once, end to end.
4. Re-read `TERMS.md` §9 (governing law) and `PRIVACY.md`/`TERMS.md` contact
   lines — those are the only two places a placeholder left unfilled would
   actually weaken the document.
5. Optional: run the trademark gut-check on the name above.

That's the whole list. Nothing here is exotic — it's the standard "free,
ad-free, account-free browser game" playbook, sized to what this project
actually does.
