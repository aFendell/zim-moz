import './style.css';
import seed from './data/locations.json';
import precomputed from './data/legs.json';
import type { Location, PrecomputedLeg } from './data/types';
import { mergeLocations } from './data/merge';
import { buildLegs, formatKm, totalKm } from './data/legs';
import { BASEMAP_URL, ESTIMATE_ROAD_FACTOR } from './config';
import { TripMap } from './map';
import { renderLocationCard } from './ui/popup';
import { navigate, onRouteChange } from './router';

const baseUrl = import.meta.env.BASE_URL;
const app = document.getElementById('app')!;

app.innerHTML = `
  <div id="map"></div>
  <div id="total" class="total-pill"></div>
`;

const overrides = {}; // TODO(edit stage): load from IndexedDB
const locations = mergeLocations(seed as Location[], overrides);
const legs = buildLegs(locations, precomputed as PrecomputedLeg[], ESTIMATE_ROAD_FACTOR);

const totalEl = document.getElementById('total')!;
const anyEstimated = legs.some((l) => l.source === 'estimated');
totalEl.textContent = `Total ${formatKm(totalKm(legs), anyEstimated ? 'estimated' : 'routed')}`;

const tripMap = new TripMap({
  container: document.getElementById('map')!,
  pmtilesUrl: BASEMAP_URL,
  baseUrl,
  onSelect: (id) => navigate({ locationId: id, edit: false }),
  renderPopup: (loc, legIn, legOut) => renderLocationCard(loc, legIn, legOut, baseUrl),
});
tripMap.render(locations, legs);
// Debug handle for browser tooling; not part of the app API.
(window as unknown as { __tripMap: TripMap }).__tripMap = tripMap;

tripMap.map.on('load', () => {
  tripMap.fitAll();
  onRouteChange((route) => tripMap.select(route.locationId));
});
