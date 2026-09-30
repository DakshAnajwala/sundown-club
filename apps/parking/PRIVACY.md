# Privacy Policy — Parking Precision

**Last updated:** September 28, 2026

This is a short policy because the game does very little with data. Read it
end to end — it's five sections.

## 1. There is no account, and the game itself runs on your device

Parking Precision runs entirely in your browser. There is no login and no
password. Everything that makes the game work — physics, levels, scoring —
is computed on your own device.

There is one exception: the **leaderboard**. When you finish a level, your
score for that run is posted to a public board automatically. You can switch
that off, and section 4 explains exactly what is sent, what it is stored
against, and how to stop it. Nothing else about your play is sent anywhere.

## 2. What's stored on your device, and why

The game saves a few small things to your browser's `localStorage`:

- **Progress:** your best score, star rating, time, and bump count per level,
  the best medal you have earned there (Gold or Platinum) and your fastest
  park time, plus the offsets of your best park in each bay (used only to
  draw your "personal best" outline in the post-park review), so your record
  isn't lost when you close the tab. Stored under
  `parking-precision:progress:v5`; an older save under
  `parking-precision:progress:v4` is read once to carry your record over and
  is otherwise left as it was.
- **Daily challenge:** how many daily challenges you have parked in total,
  the number of the last one, and your best score, stars and time on today's
  (`parking-precision:daily:v1`). It is a plain count — nothing tracks
  whether you played on consecutive days.
- **Your best run, for the ghost car:** when a run becomes your best on a
  level, the path your car took (its position and heading, 10–20 times a
  second) so it can be replayed as a see-through "ghost" car next time
  (`parking-precision:ghost:v1`, at most about 30 KB per level and 400 KB in
  all). Switch it off in Settings → Personal best → "Race my best run".
- **Settings:** your graphics quality, field of view, driving-position
  adjustment, volume, unit preference (km/h vs mph), HUD layout, camera
  choice, personal-best display choices, and any keys you have rebound.
- **Leaderboard name and device identifier:** the randomly generated name you
  were given (e.g. "Swift Otter 412") under `parking-precision:handle:v1`, and
  the random identifier that name belongs to under
  `parking-precision:device:v1`, so your runs keep posting under the same name.
  You did not type the name and neither value is derived from anything about
  you or your device — see section 4.

That's the lot. No name you typed, no email address, no postal or physical
location, and nothing measured about your device, browser or network.

- **Your progress, daily results, ghost runs and settings never leave your
  device.** They are not transmitted to us or to anyone else. Daily
  challenge runs are never posted to the leaderboard, and the "Share result"
  button only copies text (or opens your device's share sheet): the page
  itself sends nothing.
- **The leaderboard name and identifier do leave it**, but only when a score
  is posted, and only to our own server — see section 4. They are not shared
  with anyone else and are not used for advertising or tracking.
- **None of it is a cookie**, technically — `localStorage` isn't sent with
  requests the way a cookie is — but it behaves the same way from your point
  of view: it's a small file your browser keeps for this site, and you can
  clear it.
- **It is yours to delete.** Settings → Reset progress clears your progress,
  medals, daily results and stored ghost runs.
  Clearing this site's data in your browser removes everything above,
  including the leaderboard name and identifier.

We don't use `localStorage` (or anything else) for advertising, tracking, or
fingerprinting, and there are no third-party ad scripts loaded by this game.

## 3. Hosting and analytics

This game is hosted on [Vercel](https://vercel.com). Like any web host,
Vercel's servers necessarily see standard connection information to deliver
the page to you — things like your IP address, browser type, and request
timestamps, in server logs. We do not access, collect, or use that
information ourselves. It's covered by
[Vercel's own privacy policy](https://vercel.com/legal/privacy-policy), not
this one, because it happens at the hosting layer, not inside the game.

**Vercel Web Analytics** is switched on for this project at the hosting
account. It measures aggregate traffic — page views, referring site, rough
location (country or region) and device/browser type. It does not use
cookies, does not fingerprint you, and does not follow you to other sites:
Vercel computes it from anonymised, aggregated request data, not from
anything the game sends. See
[Vercel Web Analytics' privacy policy](https://vercel.com/docs/analytics/privacy-policy)
for what it collects. It is used only to see roughly how many people play —
never to identify an individual player, which it cannot do.

The game's own pages do not load any analytics or measurement script: you can
check by viewing the page source. If that ever changes, this section will be
updated first.

If we later add ads or any service that sets cookies or tracks you across
sites, this policy will be updated first and, where required by law, you'll
be asked for consent before it happens.

## 4. The leaderboard (automatic, and switchable)

The game has a public leaderboard, and **it posts your score automatically
when you finish a level.** The first time that happens the game tells you so
on the results screen and offers a one-click way to stop it. You can also turn
it off at any time in **Settings → Leaderboard → "Post my scores
automatically"**. With it off, no score, name or identifier is sent unless
you press Post yourself.

**When a level starts**, the game asks our server for a one-time run token, so
that a score posted later can be checked against the time the server itself
measured. That request contains only the level number: no name, no
identifier, nothing about you or your device. It happens whether or not you
end up posting, because the token has to exist from the start of the run.

Each posted run sends and stores on our server:

- the level you played;
- your score, star rating, time, and the number of bumps, cones and kerbs you
  hit on that run;
- the randomly generated name described below;
- the moment the run was posted.

That's the whole record. In particular there is **no** name you typed, no
email address, no account, no message or comment field, and nothing you can
write yourself — the name is generated from a fixed word list, so no personal
information can be put on the board even on purpose.

**Your name, and the device identifier behind it.** So that one player keeps
one name instead of collecting rows under several, the server gives your
browser a random identifier the first time a score is posted, remembers which generated
name belongs to it, and refuses to post under any other name. The identifier
is a random string. It is **not** a fingerprint: nothing about your device,
browser, screen, network or behaviour is measured, collected or derived, and
it cannot be used to recognise you on any other website.

It identifies a browser, not a person. Clearing this site's data, or playing in
a private window, gives you a fresh identifier and a fresh name — we can't
prevent that without accounts, and we would rather not have accounts.

Posted rows are **public**: anyone can open the leaderboard and read them.
Only your best run per level is kept.

Our server also briefly records the IP address your request came from, in
order to limit how often one person can start runs or post. That counter expires by itself
within ten minutes and is never stored alongside your score or used to
identify you.

The leaderboard is hosted for us by Upstash (a database service) and Vercel
(see section 3). Scores are kept until you ask for them to be removed, or
until the board is reset.

**Removing your score.** Email the address below with the name shown on the
board (e.g. "Swift Otter 412") and the level, and the entry will be deleted.
Because there is no account, that name is the only way to identify a row — if
you have since generated a new name and cleared your browser storage, we may
not be able to find it.

**A word on how much the board means.** Scores are worked out in your own
browser, so they can be faked by someone determined enough. The board is
labelled unverified in the game for that reason. It is for fun.

## 5. Children's privacy

We don't knowingly collect personal information from anyone, including
children. The game has no account, no free-text field, and no way to enter a
name, an email address or a message — the leaderboard name is generated for
you from a fixed word list precisely so that nothing identifying can end up
on a public page, whoever is playing. If you believe something identifying
has ended up on the board anyway, tell us (see below) and we'll remove it.

## Contact

Questions about this policy: daksh.anajwala@gmail.com.

## Changes

If how the game handles data ever changes (e.g., analytics, ads, or an
account system are added), this file will be updated, the "Last updated"
date above will change, and — if the change requires it under GDPR, CCPA, or
similar law — you'll see an in-game notice before the change takes effect.
