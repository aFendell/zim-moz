# zim-moz — Offline trip map

PWA showing a driving loop Harare → Gonarezhou → Mozambique coast → Chimoio → Harare. Works fully offline after one wifi load. Spec: `.claude/prds/ZIMMOZ-001-offline-trip-map.md`.

## Stack
- Vanilla TypeScript + Vite + plain CSS. No framework. Do not add React.
- MapLibre GL JS + PMTiles for the offline vector basemap.
- Workbox via vite-plugin-pwa for the service worker.
- IndexedDB via idb-keyval for local edits.
- Vitest for unit tests. ESLint + Prettier.

## Commands
- `yarn dev` — dev server
- `yarn build` — production build to `dist/`
- `yarn test` — vitest run
- `yarn typecheck` — `tsc --noEmit`
- `yarn lint` — eslint
- `yarn route` — regenerate `src/data/legs.json` from seed locations via OSRM (needs network)
- `yarn tiles` — extract basemap PMTiles for trip bbox (auto-downloads `pmtiles` binary to `.tools/`; output gitignored, ~75 MB)
- `yarn assets` — refresh self-hosted glyphs/sprites in `public/` (committed)
- `yarn landmarks` — regenerate `src/data/landmarks.json`: towns from our PMTiles (z12 tiles along the route) + fuel/hospital/police/ATM from Overpass within 2.5 km of the route (network). Re-run after `yarn route`.
- `python3 scripts/terrain.py [maxzoom]` — build Terrarium DEM PMTiles for hillshade (z0-9 ≈ 31 MB; z10 ≈ 93 MB). Output gitignored, upload as Release asset `terrain-vN`, set repo variable `TERRAIN_URL`.

## Visual checks
- Chrome `--headless --screenshot` renders a blank map (fetches abort). Use puppeteer-core instead: script lives in the session scratchpad (`shot.js`), reads `window.__tripMap` for map state. Run `yarn preview --port 4173` first.
- `line-dasharray` is not data-driven in MapLibre: routed vs estimated legs are separate layers.
- Route layers live in the style; `TripMap` re-adds them on every `style.load` (Light/Dark/Terrain switch uses `setStyle`).
- Label override (`latinLabelsOnly`) must skip layers whose text-field isn't a `name` (road shields use `shield_text`), else shields render as empty ovals.
- Display prefs (`src/prefs.ts`: flavor day/night/gray, terrain, landmarks + groups, route colours) persist in localStorage `zim-moz:prefs`. `TripMap.setPrefs` restyles only when flavor/terrain change; colours/toggles use setPaintProperty/setFilter.
- UI pattern (Google Maps-like): one bottom drawer (`ui/drawer.ts`, drag/tap handle, peek strip with quick chips) holding all settings (`ui/settings.ts`: map type, details, colours, offline files, my edits). No top-right buttons; top-left has Total + offline chip (tap -> drawer at Offline). The location edit form (`ui/sheet.ts`) is a separate sheet above the drawer.
- Style switching is flicker-free: all three sprite sheets are declared up front with flavor-prefixed icon names (`prefixExpr`), terrain source is always present with hillshade visibility toggled, and overlay layers (route, landmarks) are part of the built style so `setStyle(…, {diff:true})` diffs instead of rebuilding.
- Basemap tiles (maxzoom 12) contain no fuel/POIs, hence Overpass for landmarks. Terrain is optional, second file in the offline panel.

## Layout
- `src/data/` — seed `locations.json`, generated `legs.json`, pure modules (`merge`, `legs`, `geo`), `store` (IndexedDB)
- `src/map/` — MapLibre setup, layers, markers, popups
- `src/ui/` — bottom sheet edit form, offline download/readiness UI
- `src/router.ts` — hash <-> `{ locationId, edit }`
- `scripts/` — `route.ts` (OSRM build step), `tiles.sh`
- `public/` — style JSON, glyphs, sprites, seed images

## Rules
- Offline first: nothing fetched from third parties at runtime. Style, fonts, sprites, images all self-hosted.
- Never show time/duration estimates. Distances only.
- Route order = array order in `locations.json`. Stops are added/removed only by editing seed data.
- Local edits are overrides keyed by location id; override wins field-by-field; seed is never mutated.
- Legs are precomputed at build time. If a location's coords are overridden at runtime, affected legs fall back to haversine × 1.3 marked as estimate.
- UI state lives in the URL hash only. No state library.
- Pure modules (`merge`, `legs`, `geo`, `router`) must stay DOM-free and tested.

## Pre-commit
Run `yarn typecheck` and `yarn lint` before committing.

## Git / deploy
- Local-only for now. No remote configured.
- GitHub account for this repo: personal `aFendell` (https://github.com/aFendell), NOT the work account. Repo-local identity already set: `user.name=aFendell`, `user.email=78854935+aFendell@users.noreply.github.com`. Never commit here with the work email.
- `gh` CLI: global active account stays the WORK account (`assaf-upstream`). Never run `gh auth switch`. For this project prefix every gh command: `GH_TOKEN=$(gh auth token --user aFendell) gh ...`.
- SSH: key `~/.ssh/id_ed25519_afendell` + host alias `github-personal` in `~/.ssh/config` already set. Remote must be `git@github-personal:aFendell/zim-moz.git` (NOT `github.com`, that hits the work key). Public repo required for free Pages.
- Commit per stage: `setup`, `base` (map + route), `data` (cards/legs), `edit`, `offline`, etc. One commit per stage, prefix message with stage name.
- Deploy details in PRD "Deployment" section. Basemap PMTiles goes to a GitHub Release asset, never into git.
