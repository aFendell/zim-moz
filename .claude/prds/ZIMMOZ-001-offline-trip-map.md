# ZIMMOZ-001 — Offline Trip Map: Harare → Mozambique → Harare

## Problem Statement

A group is driving a loop from Harare through Gonarezhou (Chipinda Pools, Mabalauta) into Mozambique (Tofo Beach, Chimoio) and back. Most of the trip is off-grid with occasional wifi. Members need to see the route, each stop, the border posts, how far the next driving leg is, and notes about each place — on their own phones, with no network. Sharing must be a plain WhatsApp link; nobody installs anything from an app store.

## Solution

A single static web app (PWA) opened from a link. On first load with wifi it caches itself plus an offline vector basemap for the trip region. Afterwards it works fully offline: a map with the highlighted route, markers for stops and border posts, popup cards per location with image/description/notes, road distance per leg and total. Members can edit text, notes and coordinates locally on their phone; edits persist in the browser and can be exported as JSON to send back to the trip organizer, who folds them into the seed data and redeploys.

## User Stories

1. As a trip member, I want to open the app from a WhatsApp link, so that I don't need to install anything.
2. As a trip member, I want the app to work with no network after a first load, so that I can use it in the bush.
3. As a trip member, I want a clear "Download offline map" button with progress, so that I know the basemap is stored before I leave wifi.
4. As a trip member, I want to see whether offline data is ready or missing, so that I don't discover a blank map at a campsite.
5. As an iPhone user, I want a prompt to add the app to my Home Screen, so that iOS doesn't evict the cached data.
6. As a trip member, I want to see a real basemap (roads, towns, rivers, parks) offline, so that the route means something in context.
7. As a trip member, I want the full route drawn as a highlighted line, so that I see the whole loop at a glance.
8. As a trip member, I want markers for each stop in order, so that I know where we sleep.
9. As a trip member, I want border posts shown with a distinct marker, so that I can spot crossings quickly.
10. As a trip member, I want to tap a marker and get a popup card, so that I see details without leaving the map.
11. As a trip member, I want each card to show a profile image, name, description and notes, so that I know what to expect at the place.
12. As a trip member, I want each card to show the road distance from the previous stop, so that I know how far the next drive is.
13. As a trip member, I want to tap a leg of the route line and see its distance, so that I can compare legs.
14. As a trip member, I want the total trip distance visible at all times, so that I have the big picture.
15. As a trip member, I want a border post card to show required documents, fees, hours and notes, so that crossings go smoothly.
16. As a trip member, I want no time estimates shown, so that I'm not misled by tar-road assumptions on gravel park tracks.
17. As a trip member, I want to edit a location's name, description and notes on my phone, so that I can record what I learn on the way.
18. As a trip member, I want to edit a location's coordinates, so that I can correct a wrong pin.
19. As a trip member, I want my edits to survive closing the browser, so that they are not lost.
20. As a trip member, I want a "modified" badge on locations I edited, so that I know what differs from the original.
21. As a trip member, I want a "reset to original" action per location, so that I can undo my edits.
22. As a trip member, I want an edit form as a bottom sheet with the map still visible, so that I can see the pin while editing.
23. As a trip member, I want a distance to fall back to a clearly-marked estimate when I move a pin, so that I still get a number.
24. As a trip member, I want to export my local edits as a JSON file via the share sheet, so that I can send them to the organizer on WhatsApp.
25. As a trip organizer, I want to import a member's JSON export, so that I can review it before merging into seed data.
26. As a trip organizer, I want locations, images and route legs defined in repo data, so that I can update and redeploy without a backend.
27. As a trip organizer, I want road geometry and distances precomputed at build time, so that the phone does no routing.
28. As a trip organizer, I want to add manual via-waypoints per leg, so that I can correct the router where park tracks are missing.
29. As a trip organizer, I want a build step that fails loudly if a leg cannot be routed, so that I fix it before shipping.
30. As a trip organizer, I want the offline basemap extracted for just the trip bounding box, so that the download stays around 100 MB.
31. As a trip member, I want a link with a location hash to open that location's popup and fly to it, so that I can share a specific stop.
32. As a trip member, I want the app updated automatically next time I'm on wifi, so that I get the organizer's latest data.
33. As a trip member, I want my local edits preserved across app updates, so that an update does not wipe my notes.
34. As a trip member, I want the app usable one-handed on a phone screen, so that it works in a moving car.

## Implementation Decisions

### Delivery
- Static PWA, no backend, no login. Hosted on any static host (GitHub Pages, Netlify, Cloudflare Pages).
- Service worker via Workbox (vite-plugin-pwa). App shell, seed data, generated legs, glyphs, sprites, seed images precached. Basemap file is not precached; it is fetched in full on explicit user action and stored in the Cache API under a versioned key. A custom PMTiles `Source` serves byte ranges from that cached blob when present and falls back to HTTP Range requests otherwise, so no service-worker range handling is needed and the map works even before the service worker controls the page.
- Basemap URL is a build-time constant (`VITE_BASEMAP_URL`); in dev it is served from `public/`. Cross-origin hosting (GitHub Release asset) works because the file is fetched with CORS and cached client-side.
- In-app banner on iOS Safari (not standalone) recommending Add to Home Screen.
- Offline readiness indicator derived from Cache API, not app state.

### Map
- MapLibre GL JS with PMTiles protocol. One PMTiles file extracted from a planet/regional vector tileset for the bounding box covering Zimbabwe and southern/central Mozambique, zoom 0–12 (assumption; tune to keep ≈100 MB).
- Style: a lightweight open style (e.g. Protomaps basemap style) with fonts/sprites self-hosted so nothing loads from third parties offline.
- Route rendered as a GeoJSON line layer, one feature per leg with leg id and distance properties, so leg tap yields a popup.
- Markers: two visual types, `stop` and `border`. Numbered in route order.

### Stack (pending final confirmation)
- Vanilla TypeScript + Vite + plain CSS. No React: cards are MapLibre popups and a bottom sheet, both natural in imperative DOM; React would need portals into popup elements.
- URL hash is the only UI state: `#<locationId>` opens popup and flies to it; `#<locationId>/edit` opens bottom sheet. Back button closes.
- Persistence via IndexedDB (idb-keyval).

### Data model
- Seed data in repo: `locations` ordered array. Each: `id`, `type` (`stop` | `border`), `name`, `lat`, `lng`, `image`, `description`, `notes`, and for borders: `documents`, `fees`, `hours`.
- Route order is the array order; first and last are Harare. Adding/removing/reordering stops is a repo change, not a user action.
- Legs generated at build time: for each consecutive pair, `fromId`, `toId`, `distanceKm`, `geometry` (LineString), `source` (`routed` | `estimated`). Optional per-leg `via` waypoints in seed data to steer the router.
- Local overrides in IndexedDB keyed by location id: partial object with any editable fields. Merge rule at load: override wins field-by-field; location flagged `modified` if any override exists.
- Editable fields: `name`, `description`, `notes`, `lat`, `lng`. Not editable: `type`, `id`, order, image (seed images only in v1).

### Distances
- Build script calls OSRM public routing API (driving profile) per leg, honoring `via` waypoints (on the arriving location) and `routeExit` (on the departing location: a nearby routable point joined to the pin by a straight stub, for park roads disconnected in OSM). Stores distance and geometry.
- If routing fails for a leg the build fails; organizer adds `via` or accepts estimate by explicit flag.
- Runtime fallback: if a location's `lat`/`lng` is overridden, affected legs recompute as haversine × 1.3 and display with an "≈" prefix and `estimated` styling. Precomputed geometry for those legs is hidden and replaced by a straight dashed line.
- Total = sum of all leg distances (routed or estimated). No time/duration anywhere.

### Editing
- Popup card has Edit button. Edit opens bottom sheet (half height) with form; map remains visible above.
- Save writes override to IndexedDB, re-merges, re-renders marker/popup/legs.
- Reset deletes the override for that id.
- Export: serialize all overrides as JSON, share via Web Share API (file) with download fallback. Import: file input, validated against schema, written as overrides.

### Modules (deep, testable in isolation)
- **data/merge** — pure: `(seed, overrides) -> merged locations`. No DOM, no IO.
- **data/legs** — pure: `(locations, precomputedLegs) -> legs to render`, applies estimate fallback and computes total.
- **data/geo** — pure: haversine.
- **data/store** — IndexedDB adapter: get/set/delete override, export/import. Thin.
- **build/route** — Node script: OSRM calls, via waypoints, writes legs JSON. Fails loudly.
- **build/tiles** — documented command (pmtiles extract) producing basemap file; not app code.
- **map** — MapLibre setup, layers, markers, popups, leg popups. Consumes merged data; emits nothing but hash changes.
- **ui/sheet** — bottom sheet edit form. Reads location, returns override on save.
- **ui/offline** — download button, progress, readiness indicator, iOS A2HS banner.
- **router** — hash parser/serializer: `hash <-> {locationId?, edit?}`.

### Deployment
- Repo: public GitHub repo. Pages and Release assets are free only for public repos.
- App: GitHub Pages, deployed by GitHub Actions on push to `main`. Vite `base` set to `/<repo-name>/`.
- Basemap: single PMTiles file uploaded as a GitHub Release asset (2 GB per-file limit, range requests and CORS supported). App fetches it from the release download URL; the URL is a build-time constant.
- Not deployed from the development machine. All deploy steps run in GitHub Actions or the GitHub UI.

#### One-time setup
1. Create public repo on GitHub, push code.
2. Repo Settings > Pages > Source: "GitHub Actions".
3. Add workflow `.github/workflows/deploy.yml`: on push to `main`, checkout, setup Node, install, `yarn test`, `yarn build`, upload `dist` with `actions/upload-pages-artifact`, deploy with `actions/deploy-pages`. Needs `permissions: pages: write, id-token: write`.
4. Generate basemap locally once (`yarn tiles`, see below). Do not commit it; it is gitignored.
5. Create a Release (e.g. tag `basemap-v1`) in GitHub UI or `gh release create`, attach the PMTiles file as asset.
6. Set the asset download URL (`https://github.com/<owner>/<repo>/releases/download/basemap-v1/<file>.pmtiles`) as `VITE_BASEMAP_URL` in the deploy workflow's build step (or a repo variable). Commit, push, Actions deploys.
7. Share `https://<owner>.github.io/<repo>/` on WhatsApp.

#### Routine updates
- Data/text/image change: edit seed JSON or images, push to `main`. Actions redeploys. Members get update next time online (service worker updates in background, applies on next launch).
- Route change (stop coords or `via` waypoints): run `yarn route` locally to regenerate legs JSON, commit, push.
- Basemap change (bbox or zoom): regenerate, upload as new release asset (`basemap-v2`), update constant, push. Members must re-download offline map; app shows "map update available".

#### Basemap generation (`yarn tiles`)
- Uses `pmtiles extract` CLI against a Protomaps daily build (or other OpenMapTiles-compatible planet PMTiles) with `--bbox` covering Zimbabwe + Mozambique south of ~16°S and `--maxzoom` 12. Target ≈100 MB; adjust maxzoom or bbox if larger.
- Style, fonts (glyphs) and sprites self-hosted in `public/` so nothing is fetched from third parties at runtime.

#### Verification after deploy
- Open link on iPhone Safari and Android Chrome, tap "Download offline map", wait for completion, add to Home Screen (iOS), enable airplane mode, relaunch, confirm map renders at all trip zoom levels and popups open.

## Testing Decisions

- Good tests exercise external behavior through the module's public interface. No testing of DOM internals or MapLibre calls.
- Vitest, no browser needed for pure modules.
- Tested: `data/merge` (override wins, modified flag, unknown override ids ignored), `data/legs` (estimate fallback triggered by coordinate override, total sums correctly, routed legs untouched), `data/geo` (known distance pairs), `router` (hash round-trip), `data/store` (with fake-indexeddb), `build/route` (with mocked fetch: via waypoints forwarded, failure aborts).
- Not tested: `map`, `ui/*`. Verified manually on iPhone Safari and Android Chrome in airplane mode.
- No prior art; greenfield repo.

## Out of Scope

- Shared/synced edits between members (no backend).
- Member-uploaded photos.
- Adding, deleting or reordering stops from the app.
- On-device routing engine.
- Time/duration estimates.
- Native wrapper (Capacitor) — reserved as escape hatch if iOS PWA caching proves unreliable.
- Search, geolocation tracking, turn-by-turn navigation.
- Authentication.

## Further Notes

- Stops (in order): Harare → Chipinda Pools → Swimuwini Chalets / Mabalauta → [border post, likely Sango/Chicualacuala] → Tofo Beach → Chimoio → [border post, likely Forbes/Machipanda] → Harare. Border posts to be confirmed by organizer after seeing router output.
- Gonarezhou legs are the routing risk: OSM coverage of park tracks may be thin. Expect `via` waypoints there.
- iOS Safari: installed-to-Home-Screen PWAs are not subject to the 7-day unused eviction that plain-tab sites are. Banner is the mitigation; keep basemap size modest.
- Trip departure date unknown; prioritize offline map + route + cards, then editing, then export/import.
- Open decision recorded here: vanilla TS vs thin React. PRD assumes vanilla.
