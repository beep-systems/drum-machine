# Working on Drum Machine

A browser drum machine for guitar practice: rock, hard rock and metal. Documentation is in English. The UI supports English (default), German and Russian. Main browsers: desktop Chrome and Edge. The server serves static files; audio is generated on the client.

## Architecture

- `src/model.ts`: types, eight instruments, two bars of 4/4, 32 steps and presets.
- `src/audio/`: React-independent engine, timing and track rendering.
- `src/storage.ts`: versioned state, validated import and export.
- `src/messages.ts`: locale-independent domain error and notice descriptors.
- `src/i18n/`: bundled, typed dictionaries and language preference; no network translations.
- `src/App.tsx`, `src/styles.css`: UI and accessibility.
- `public/samples/`: Salamander recordings, attribution, license and manifest. Builds never download samples.
- Docker: Node.js 24 → Nginx on 8080; Compose publishes `${PORT:-8080}`.
- GitHub Actions checks PRs into master and publishes successful master builds to GitHub Pages at `drum.beep.systems`. Vite base is `/`.

## Commands

Node.js 24, npm, committed `package-lock.json`.

```sh
npm ci
npm run dev
npm run format:check
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run test:preview
```

Browser tests: `npx playwright install --with-deps chromium`. An installed Chrome can be selected with `PLAYWRIGHT_CHANNEL=chrome` (PowerShell: `$env:PLAYWRIGHT_CHANNEL='chrome'`); Edge uses `msedge`. Tests start their own servers. `test:e2e` uses Vite dev; `test:preview` requires a prior build and serves `dist`. In restricted environments use `--cache .cache/npm`.

## Rules

- Use strict TypeScript. Keep calculations and validation independent of the DOM and Web Audio.
- Schedule hits using the audio clock; JavaScript timers and requestAnimationFrame must not schedule individual hits. Animation only displays position.
- BPM must not change sample pitch. New patterns start at loop boundaries. Volume and mute apply immediately with short smoothing.
- Async startup/rendering must check freshness before enabling sound. Stop cancels loading startup, count-in and future sources. Errors must not cause automatic retries.
- Preserve tails across loop boundaries and closed-hat choking of open hats, including the end-to-start transition.
- Validate JSON and localStorage. Invalid imports must not change the library; corrupt saved state must not be overwritten automatically.
- Preserve the version 1 music storage and export format. Store language separately in `drum-machine:locale`; use English for missing, invalid or unavailable preferences.
- Translate UI and accessibility labels through typed dictionaries. Return message codes and parameters from domain modules, and translate at render time. Language changes must not restart audio or rename existing user data.
- Do not add external CDNs, fonts or runtime network dependencies for practice. Support HTTP LAN hosting without mandatory secure-context APIs.
- Record audio sources, licenses and processing. Do not replace acoustic recordings with synthesis unless requested.
- Run relevant checks; audio changes require start/stop/update race tests and browser Web Audio checks. Do not claim listening or Docker verification unless performed.
- Preserve user changes. Do not publish the app or configure a home server without a specific request.
