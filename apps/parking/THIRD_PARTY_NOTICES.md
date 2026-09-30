# Third-party notices

Parking Precision's own code is all-rights-reserved (see `LICENSE`), but it is
built on open-source libraries that remain under their own licenses, both of
which require this notice to be kept and shipped with the software. That's
this file, plus the "Legal" link in the game's Settings menu (`public/*.html`)
so it's reachable from the deployed build, not just the source repo.

## Runtime dependencies (bundled into the shipped game)

### three.js
- **License:** MIT
- **Used for:** 3D rendering, the WebGL renderer, post-processing (SAO,
  composer), scene graph.
- **Source:** https://github.com/mrdoob/three.js

```
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### cannon-es
- **License:** MIT
- **Used for:** physics simulation (the vehicle rig, collisions, the fixed
  timestep world).
- **Source:** https://github.com/pmndrs/cannon-es

```
Copyright (c) 2015 cannon.js Authors

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use, copy,
modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### GSAP (GreenSock) + ScrollTrigger — homepage only
- **License:** GSAP Standard "no charge" license — https://gsap.com/standard-license
- **Used for:** scroll-driven animation on the homepage (`index.html`, `src/site/home.js`). Not loaded by the game at `/play/`.
- **Source:** https://github.com/greensock/GSAP

### Fonts (homepage only, self-hosted via Fontsource)
- **Big Shoulders Display**, **Schibsted Grotesk**, **IBM Plex Mono**
- **License:** SIL Open Font License 1.1 — https://openfontlicense.org
- Served from this site's own build (npm packages `@fontsource/*`), never from Google Fonts, so no visitor data goes to a font CDN.

## Build-time only (not shipped in the deployed game)

- **Vite** (MIT) — the dev server and production bundler. Its own code never
  ships inside `dist/`; only the JavaScript it *compiles* does.
- **puppeteer-core** (Apache-2.0) — verification scripts in `tools/`, installed
  with `--no-save`; never shipped.

## Assets

The **game** (`/play/`) has no imported fonts, images, audio files, or 3D
models. Every visual (the car, the levels, the props) is procedural geometry
generated in code, and every sound is synthesized at runtime with the Web Audio
API — see `CAR_DESIGN.md` and `AudioSystem.js` for why.

The **homepage** (`/`) uses the fonts listed above and screenshots in
`public/media/` that were rendered from the game itself (no third-party
imagery). Anything else imported later must be added here with its license
before shipping. A web version of this file ships at `public/notices.html`.

## Keeping this file honest

If you add a new npm dependency that ships code into the bundle (check
`npm run build` and see what's actually imported by `src/`), add its license
here before publishing an update. `npx license-checker --summary` from the
project root will list every license in `node_modules`, though most of those
are dev-only and never reach `dist/`.
