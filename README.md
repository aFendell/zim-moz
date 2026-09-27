# zim-moz

Offline-first PWA trip map: Harare → Chipinda Pools → Mabalauta → Tofo → Chimoio → Harare.

## Develop

```sh
yarn
yarn dev
```

## Regenerate data

```sh
yarn route   # legs.json via OSRM (network)
yarn tiles   # basemap .pmtiles for trip bbox (network, pmtiles CLI)
```

## Deploy

See `.claude/prds/ZIMMOZ-001-offline-trip-map.md` → Deployment. Summary: public GitHub repo, Pages via Actions, basemap uploaded as a Release asset, URL set in `src/config.ts`.
