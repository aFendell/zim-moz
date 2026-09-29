import './style.css';
import seed from './data/locations.json';
import precomputed from './data/legs.json';
import landmarks from './data/landmarks.json';
import type { Leg, Location, MergedLocation, Overrides, PrecomputedLeg } from './data/types';
import type { Landmark } from './data/landmarks';
import { mergeLocations } from './data/merge';
import { buildLegs, formatKm, totalKm } from './data/legs';
import { haversineKm } from './data/geo';
import { createOverrideStore } from './data/store';
import { getBasemapCacheState } from './data/basemapCache';
import {
  BASEMAP_SIZE_MB,
  BASEMAP_URL,
  BASEMAP_VERSION,
  ESTIMATE_ROAD_FACTOR,
  TERRAIN_SIZE_MB,
  TERRAIN_URL,
  TERRAIN_VERSION,
} from './config';
import { loadPrefs, savePrefs, type Prefs } from './prefs';
import { TripMap } from './map';
import { CachedRangeSource } from './map/source';
import { mountOfflineChip, type OfflineFile } from './ui/offline';
import { mountDrawer } from './ui/drawer';
import { mountSettings } from './ui/settings';
import { renderLocationCard } from './ui/popup';
import { EditSheet } from './ui/sheet';
import { navigate, onRouteChange } from './router';

const baseUrl = import.meta.env.BASE_URL;
const app = document.getElementById('app')!;
app.innerHTML = `
  <div id="map"></div>
  <div class="topleft"><div id="total" class="total-pill"></div><div id="offline"></div></div>
`;
const totalEl = document.getElementById('total')!;

const store = createOverrideStore();
let overrides: Overrides = {};
let locations: MergedLocation[] = [];
let legs: Leg[] = [];
let prefs: Prefs = loadPrefs();

function recompute() {
  locations = mergeLocations(seed as Location[], overrides);
  legs = buildLegs(locations, precomputed as PrecomputedLeg[], ESTIMATE_ROAD_FACTOR);
  const anyEstimated = legs.some((l) => l.source === 'estimated');
  totalEl.textContent = `Total ${formatKm(totalKm(legs), anyEstimated ? 'estimated' : 'routed')}`;
  tripMap.render(locations, legs);
}

function setPrefs(next: Prefs) {
  prefs = next;
  savePrefs(prefs);
  tripMap.setPrefs(prefs);
}

const basemapUrl = new URL(BASEMAP_URL, window.location.href).toString();
const terrainUrl = new URL(TERRAIN_URL, window.location.href).toString();
const offlineFiles: OfflineFile[] = [
  { id: 'basemap', label: 'Basemap', url: basemapUrl, version: BASEMAP_VERSION, sizeHintMB: BASEMAP_SIZE_MB, required: true },
  { id: 'terrain', label: 'Terrain', url: terrainUrl, version: TERRAIN_VERSION, sizeHintMB: TERRAIN_SIZE_MB, required: false },
];

const tripMap: TripMap = new TripMap({
  container: document.getElementById('map')!,
  basemap: new CachedRangeSource(basemapUrl, BASEMAP_VERSION),
  terrain: new CachedRangeSource(terrainUrl, TERRAIN_VERSION),
  baseUrl,
  prefs,
  landmarks: landmarks as Landmark[],
  onSelect: (id) => navigate({ locationId: id, edit: false }),
  renderPopup: (loc, legIn, legOut) => {
    const me = tripMap.getUserPosition();
    const fromYou = me ? haversineKm(me, loc) : undefined;
    return renderLocationCard(loc, legIn, legOut, baseUrl, (id) => navigate({ locationId: id, edit: true }), fromYou);
  },
});

const sheet = new EditSheet(app, {
  onSave: async (id, override) => {
    await store.save(id, override);
    overrides = await store.loadAll();
    recompute();
    navigate({ locationId: id, edit: false });
  },
  onReset: async (id) => {
    await store.reset(id);
    overrides = await store.loadAll();
    recompute();
    navigate({ locationId: id, edit: false });
  },
  onClose: () => navigate({ locationId: sheetLocationId, edit: false }),
});
let sheetLocationId: string | null = null;

const drawer = mountDrawer(app);
mountSettings({
  drawer,
  getPrefs: () => prefs,
  onChange: setPrefs,
  terrainReady: async () => (await getBasemapCacheState(terrainUrl, TERRAIN_VERSION)).kind === 'ready',
  offlineFiles,
  getOverrides: () => overrides,
  onImport: async (imported) => {
    await store.replaceAll({ ...overrides, ...imported });
    overrides = await store.loadAll();
    recompute();
    navigate({ locationId: null, edit: false });
  },
  onClearAll: async () => {
    await store.replaceAll({});
    overrides = {};
    recompute();
    navigate({ locationId: null, edit: false });
  },
});
mountOfflineChip(document.getElementById('offline')!, offlineFiles, () => drawer.open('offline'));

// Tapping the map closes the drawer.
tripMap.map.on('click', () => drawer.close());

// Debug handle for browser tooling; not part of the app API.
(window as unknown as { __tripMap: TripMap }).__tripMap = tripMap;

(async () => {
  overrides = await store.loadAll();
  recompute();
  await new Promise<void>((r) => (tripMap.map.loaded() ? r() : tripMap.map.once('load', () => r())));
  tripMap.fitAll();
  onRouteChange((route) => {
    drawer.close();
    if (route.edit && route.locationId) {
      const loc = locations.find((l) => l.id === route.locationId);
      if (loc) {
        sheetLocationId = loc.id;
        tripMap.select(null);
        sheet.open(loc);
        return;
      }
    }
    sheetLocationId = null;
    sheet.close();
    tripMap.select(route.locationId);
  });
})();
