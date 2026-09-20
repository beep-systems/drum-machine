# Drum Machine

Acoustic drums for guitar practice: rock, hard rock and metal. The application runs entirely in your browser; the web server only serves static files. Audio plays on the **default output device of the computer running the browser**.

Production address: [drum.beep.systems](https://drum.beep.systems). First-time Pages and DNS setup is described below.

## Languages

Use the language selector in the header to choose **English**, **Deutsch** or **Русский**. English is the default on a new visit, regardless of your browser language. Your explicit choice is stored separately in `drum-machine:locale`. If storage is blocked or full, language switching still works for the current session.

Controls, presets, instruments, messages and accessibility labels are translated without reloading or interrupting playback. Choosing a preset copies its name in the current language. Names of already loaded, saved and imported rhythms are user data and are not automatically renamed.

## Controls

- **Presets:** 26 rhythms, with filters for basic, rock, hard rock, metal and song styles. Choosing one loads its pattern and BPM while preserving the mixer. Song styles are interpretations, not transcriptions of specific recordings.
- **Tempo:** 40–300 BPM, controlled with a number field, ± buttons or slider. Every pattern is two bars of 4/4 with 32 sixteenth-note steps.
- **Play / Stop:** use the button or Space outside interactive controls. Playback restarts at the beginning. The optional count-in plays four clicks.
- **Grid:** click to toggle a hit, Shift+click to toggle an accent. Arrow keys move focus; Space activates a cell; Shift+Enter toggles an accent.
- **Mixer:** volume and mute for each track. Click an instrument name to preview it. The kit has kick, snare, closed/open hi-hat, crash, ride and two toms.
- **During playback:** pattern and BPM changes take effect at the next loop boundary after audio preparation. Volume and mute apply immediately. Changing BPM never changes sample pitch.
- **Clear grid:** creates an empty working pattern while preserving your library.

Defaults: basic rock, 100 BPM, master volume 65%, count-in enabled. Normal tab switching does not stop playback. Computer sleep, tab unloading or browser audio suspension can interrupt audio; press Play to resume.

## Saving and transferring rhythms

The working pattern, BPM, mixer and library are stored in this browser's localStorage under `drum-machine:v1`. Reloading never starts audio automatically. Enter a name and select **Save rhythm**. Deleting a library entry leaves the working pattern intact.

**Export** downloads the saved library as JSON; save your working pattern first. **Import** adds entries, skips identical patterns with the same name and BPM, and never overwrites local rhythms. Limits: 128 entries, names up to 60 characters, files up to 1 MB. Invalid JSON and unsupported versions leave the library unchanged. The version 1 format remains compatible; language settings and translations are not exported.

Storage is separate for each browser and origin (scheme, host and port). **Moving from localhost or a LAN address to drum.beep.systems does not transfer your library. Export on the old address, then import on the new one.** If storage is unavailable, the app warns and works in memory. If saved data is corrupt, the app preserves it and disables automatic session saving.

## Development and checks

Requires Node.js 24 and npm. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). Use HTTP rather than opening the HTML file directly.

```sh
npm run format:check
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

Browser checks:

```sh
npx playwright install --with-deps chromium
npm run test:e2e
npm run build
npm run test:preview
```

`test:e2e` starts Vite on port 5173 and exercises the editor, localization and Web Audio, including source-module rendering tests. `test:preview` serves the already built `dist` directory on port 4173 and checks assets, samples, language persistence and playback. It does not import source modules in the browser.

To use installed Chrome in PowerShell: `$env:PLAYWRIGHT_CHANNEL='chrome'; npm run test:e2e`. Use `msedge` for Edge; the same variable works with `test:preview`. In restricted environments npm can use `--cache .cache/npm`.

React and TypeScript handle the interface; a React-independent Web Audio engine pre-renders tracks using OfflineAudioContext and schedules loops using the audio clock. Animation only displays position. See [AGENTS.md](AGENTS.md) for contributor guidance.

## GitHub Actions and GitHub Pages

The workflow in [.github/workflows/pages.yml](.github/workflows/pages.yml) checks pull requests into `master` and pushes to `master`. It uses Ubuntu, Node.js 24 and `npm ci`, then runs formatting, type checks, lint, unit tests, a production build and both browser suites. Chromium and its system dependencies are installed explicitly. Failed browser runs upload diagnostics for seven days.

Only a successful `master` run uploads the tested `dist` directory and deploys it to Pages. Manual runs are available in Actions; only manual runs from `master` can publish. Pull requests never deploy. Master workflows run serially without interrupting an active deployment; newer commits cancel stale checks for the same PR. Failed checks leave the current site unchanged.

The build job has read-only repository access. The deploy job uses GitHub's built-in token with `pages: write` and `id-token: write`, in the `github-pages` environment. No personal access token or separate `gh-pages` branch is needed.

### First-time setup for drum.beep.systems

These are owner/admin settings, not changes made by the build:

1. In [repository Pages settings](https://github.com/beep-systems/drum-machine/settings/pages), set **Build and deployment → Source → GitHub Actions**.
2. Set **Custom domain** to `drum.beep.systems` and save it.
3. At the DNS provider for `beep.systems`, create **CNAME** with host **drum** and target **beep-systems.github.io**. Do not include `https://` or `/drum-machine`. If a conflicting record already exists for this exact host, resolve it before adding the CNAME.
4. Allow deployments from `master` in the `github-pages` environment. Do not require manual reviewers if publication should remain automatic.
5. Push the implementation to `master`, or run **Check and publish Pages** manually from `master`. Inspect the build and deploy results.
6. Wait for the Pages DNS check and certificate to become available, then enable **Enforce HTTPS**. GitHub notes this option can take up to 24 hours to appear.
7. Check `https://drum.beep.systems` in Chrome and Edge: reload, switch languages, select a preset, Play/Stop, and open the sample attribution link. Verify the browser network panel has no missing JS, CSS or WAV resources.

The custom domain serves the application at the root, so Vite uses `base: '/'`, also suitable for local Docker hosting. For an Actions publishing workflow, a repository `CNAME` file is not required and does not configure the domain; use the Pages setting.

References: [GitHub custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site), [Vite deployment](https://vite.dev/guide/static-deploy).

### Rollback

Revert the problematic commit on `master` and push the revert. The same checks and publication workflow deploy the restored version. Use the Actions run and the `github-pages` environment to identify the last successful deployment.

## Docker / LAN hosting

On a server with Docker and Compose:

```sh
docker compose up -d --build
```

Open `http://<server-address>:8080` and press Play. Samples are bundled; Node.js is not required outside Docker. Set `PORT=8090` in a local `.env` file to change the published port.

```sh
docker compose logs -f
docker compose down
```

The image builds with Node.js 24 and serves with Nginx on port 8080, with a `/healthz` health check. No database, server audio devices or persistent volumes are needed. Serve the app from the root of its own host. A reverse proxy can terminate HTTPS. The Nginx health endpoint is specific to Docker and is not a GitHub Pages endpoint.

## Audio output

The app uses the default browser/OS output. In Windows, select speakers or your audio interface under **Settings → System → Sound**, or use the per-app volume mixer. If a device change is not picked up, stop audio and reload the page.

The app does not request microphone access, record your guitar or send audio to a server. Your guitar and amplifier work independently.

## Samples and scope

The bundled [Salamander Drumkit](https://github.com/endolith/Salamander-Drumkit) recordings are by **Alexander Holm**, licensed under **CC BY-SA 3.0**. Attribution, processing details, the license and checksums are in [public/samples/](public/samples/README.md). Practice uses only resources served with the app; there are no external CDN, font or translation requests. CI never re-downloads the original sample archive.

To reproduce sample preparation, run `npm run samples:prepare`; this downloads the original archive (~370 MiB) and requires `tar` with bzip2 support.

The main browsers are desktop Chrome and Edge; on small screens the sequencer scrolls horizontally. Audio recognition, MIDI, guitar recording, server synchronization, other time signatures and automatic fills are outside the current version.

## Industrial drums

Choose Acoustic or Industrial next to the playback controls. All patterns work
with either kit; the five Industrial presets select the electronic kit. Changes
apply at the next two-bar boundary after audio preparation. Volume and mute
remain immediate. Saved rhythms and v1 exports retain the optional kitId; older
files default to Acoustic. Older app versions can read these exports but ignore
the kit choice.

Industrial sounds are generated locally with npm run samples:industrial and
committed as WAV assets. See public/samples/industrial/README.md for provenance
and the CC0 dedication. No sample generation or downloads occur during builds.

Changing the kit, tempo or rhythm during count-in cancels the pending start and
restarts count-in after the new audio is ready. This prevents stale audio from
starting while another kit is loading.
