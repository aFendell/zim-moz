import maplibregl, { type LngLatBoundsLike, Map as MlMap, Marker, Popup } from 'maplibre-gl';
import { PMTiles, Protocol, type Source } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import type { Leg, MergedLocation } from '../data/types';
import type { Landmark } from '../data/landmarks';
import { landmarkGroup, landmarkLabel } from '../data/landmarks';
import { formatKm } from '../data/legs';
import type { Prefs } from '../prefs';
import { buildStyle } from './style';

export interface TripMapOptions {
  container: HTMLElement;
  /** PMTiles byte source for the vector basemap (cache-aware). */
  basemap: Source;
  /** Optional PMTiles byte source for the Terrarium DEM. */
  terrain?: Source;
  baseUrl: string;
  prefs: Prefs;
  landmarks: Landmark[];
  onSelect: (id: string | null) => void;
  renderPopup: (loc: MergedLocation, legIn: Leg | undefined, legOut: Leg | undefined) => HTMLElement;
}

const ROUTE_SRC = 'route';
const LM_SRC = 'landmarks';
const LM_LAYERS = ['lm-circle', 'lm-label'] as const;

const GROUP_COLOR: Record<string, string> = {
  towns: '#111827',
  fuel: '#ea580c',
  services: '#0891b2',
};

let protocol: Protocol | null = null;
function getProtocol(): Protocol {
  if (!protocol) {
    protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
  }
  return protocol;
}

export class TripMap {
  readonly map: MlMap;
  private markers = new Map<string, Marker>();
  private popup: Popup | null = null;
  private locations: MergedLocation[] = [];
  private legs: Leg[] = [];
  private opts: TripMapOptions;
  private prefs: Prefs;
  private ready = false;
  private clickBound = false;

  constructor(opts: TripMapOptions) {
    this.opts = opts;
    this.prefs = { ...opts.prefs };
    getProtocol().add(new PMTiles(opts.basemap));
    if (opts.terrain) getProtocol().add(new PMTiles(opts.terrain));
    this.map = new MlMap({
      container: opts.container,
      style: this.style(),
      center: [32.5, -21],
      zoom: 5,
      attributionControl: { compact: true },
    });
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    this.map.on('load', () => {
      this.ready = true;
      this.addOverlayLayers();
      this.render(this.locations, this.legs);
    });
    // Overlay layers live in the style, so re-add them after every setStyle().
    this.map.on('style.load', () => {
      if (!this.ready) return;
      this.addOverlayLayers();
      this.setRouteData();
    });
  }

  private style() {
    return buildStyle({
      basemapKey: this.opts.basemap.getKey(),
      baseUrl: this.opts.baseUrl,
      flavor: this.prefs.flavor,
      terrainKey: this.prefs.terrain && this.opts.terrain ? this.opts.terrain.getKey() : undefined,
    });
  }

  /** Apply display prefs. Restyles only when flavor/terrain changed; colors and toggles are cheap. */
  setPrefs(next: Prefs) {
    const prev = this.prefs;
    this.prefs = { ...next };
    if (next.flavor !== prev.flavor || next.terrain !== prev.terrain) {
      this.map.setStyle(this.style());
      return; // style.load re-adds overlays with the new prefs
    }
    if (!this.ready) return;
    this.applyRoutePaint();
    this.applyLandmarkFilter();
  }

  private addOverlayLayers() {
    if (!this.map.getSource(ROUTE_SRC)) {
      this.map.addSource(ROUTE_SRC, { type: 'geojson', data: emptyFC() });
      this.map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: ROUTE_SRC,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': this.prefs.routeCasing, 'line-width': 7, 'line-opacity': 0.9 },
      });
      // line-dasharray is not data-driven in MapLibre, so routed and estimated legs are separate layers.
      this.map.addLayer({
        id: 'route-line',
        type: 'line',
        source: ROUTE_SRC,
        filter: ['==', ['get', 'source'], 'routed'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': this.prefs.routeColor, 'line-width': 4 },
      });
      this.map.addLayer({
        id: 'route-line-est',
        type: 'line',
        source: ROUTE_SRC,
        filter: ['==', ['get', 'source'], 'estimated'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#d97706', 'line-width': 4, 'line-dasharray': [2, 2] },
      });
    }
    if (!this.map.getSource(LM_SRC)) {
      this.map.addSource(LM_SRC, { type: 'geojson', data: landmarksFC(this.opts.landmarks) });
      this.map.addLayer({
        id: 'lm-circle',
        type: 'circle',
        source: LM_SRC,
        minzoom: 6,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 10, 5, 13, 7],
          'circle-color': ['match', ['get', 'group'], 'towns', GROUP_COLOR.towns!, 'fuel', GROUP_COLOR.fuel!, GROUP_COLOR.services!],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-opacity': ['case', ['==', ['get', 'kind'], 'village'], 0.6, 0.95],
        },
      });
      this.map.addLayer({
        id: 'lm-label',
        type: 'symbol',
        source: LM_SRC,
        minzoom: 8,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 12, 12],
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-optional': true,
          'symbol-sort-key': ['get', 'rank'],
        },
        paint: {
          'text-color': this.prefs.flavor === 'dark' ? '#e5e7eb' : '#1f2937',
          'text-halo-color': this.prefs.flavor === 'dark' ? '#111827' : '#ffffff',
          'text-halo-width': 1.2,
        },
      });
    }
    this.applyLandmarkFilter();
    this.bindClicks();
  }

  private applyRoutePaint() {
    if (!this.map.getLayer('route-line')) return;
    this.map.setPaintProperty('route-line', 'line-color', this.prefs.routeColor);
    this.map.setPaintProperty('route-casing', 'line-color', this.prefs.routeCasing);
  }

  private applyLandmarkFilter() {
    if (!this.map.getLayer('lm-circle')) return;
    const groups: string[] = this.prefs.landmarks ? this.prefs.landmarkGroups : [];
    const inGroups = (): maplibregl.ExpressionSpecification => ['in', ['get', 'group'], ['literal', groups]];
    this.map.setFilter(LM_LAYERS[0], inGroups());
    // Basemap already labels towns; our label layer only names fuel/services.
    this.map.setFilter(LM_LAYERS[1], ['all', inGroups(), ['!=', ['get', 'group'], 'towns']]);
  }

  private bindClicks() {
    if (this.clickBound) return;
    this.clickBound = true;
    for (const layer of ['route-line', 'route-line-est', 'lm-circle', 'lm-label']) {
      this.map.on('mouseenter', layer, () => (this.map.getCanvas().style.cursor = 'pointer'));
      this.map.on('mouseleave', layer, () => (this.map.getCanvas().style.cursor = ''));
    }
    this.map.on('click', (e) => {
      const lm = this.map.queryRenderedFeatures(e.point, { layers: ['lm-circle', 'lm-label'] })[0];
      if (lm) {
        const p = lm.properties as { label: string; kindLabel: string; km: number };
        this.closePopup();
        this.popup = new Popup({ closeButton: false, className: 'leg-popup', offset: 8 })
          .setLngLat((lm.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(`<strong>${escapeHtml(p.label)}</strong><br>${escapeHtml(p.kindLabel)} · km ${p.km} from Harare`)
          .addTo(this.map);
        return;
      }
      const f = this.map.queryRenderedFeatures(e.point, { layers: ['route-line', 'route-line-est'] })[0];
      if (!f) return;
      const { label, distance } = f.properties as { label: string; distance: string };
      this.closePopup();
      this.popup = new Popup({ closeButton: false, className: 'leg-popup' })
        .setLngLat(e.lngLat)
        .setHTML(`<strong>${escapeHtml(label)}</strong><br>${escapeHtml(distance)}`)
        .addTo(this.map);
    });
  }

  private setRouteData() {
    const src = this.map.getSource(ROUTE_SRC) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const byId = new Map(this.locations.map((l) => [l.id, l]));
    src.setData({
      type: 'FeatureCollection',
      features: this.legs.map((leg) => ({
        type: 'Feature',
        properties: {
          index: leg.index,
          source: leg.source,
          label: `${byId.get(leg.fromId)?.name ?? leg.fromId} → ${byId.get(leg.toId)?.name ?? leg.toId}`,
          distance: formatKm(leg.distanceKm, leg.source),
        },
        geometry: { type: 'LineString', coordinates: leg.geometry },
      })),
    });
  }

  /** Replace all data. Safe to call before map load. */
  render(locations: MergedLocation[], legs: Leg[]) {
    this.locations = locations;
    this.legs = legs;
    if (!this.ready) return;
    this.setRouteData();

    for (const m of this.markers.values()) m.remove();
    this.markers.clear();
    locations.forEach((loc, i) => {
      const el = document.createElement('button');
      el.className = `marker marker-${loc.type}${loc.modified ? ' marker-modified' : ''}`;
      el.type = 'button';
      el.setAttribute('aria-label', loc.name);
      el.textContent = loc.type === 'border' ? '⛿' : String(stopNumber(locations, i));
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.opts.onSelect(loc.id);
      });
      const marker = new Marker({ element: el, anchor: 'center' })
        .setLngLat([loc.lng, loc.lat])
        .addTo(this.map);
      this.markers.set(loc.id, marker);
    });
  }

  fitAll() {
    if (this.locations.length === 0) return;
    const b = new maplibregl.LngLatBounds();
    for (const l of this.locations) b.extend([l.lng, l.lat]);
    this.map.fitBounds(b as LngLatBoundsLike, { padding: 48, duration: 0 });
  }

  /** Open popup for a location id (null closes). Flies to it if not in view. */
  select(id: string | null) {
    this.closePopup();
    if (!id) return;
    const loc = this.locations.find((l) => l.id === id);
    if (!loc) return;
    const legIn = this.legs.find((l) => l.toId === id);
    const legOut = this.legs.find((l) => l.fromId === id);
    const content = this.opts.renderPopup(loc, legIn, legOut);
    this.popup = new Popup({
      closeButton: true,
      maxWidth: 'min(320px, calc(100vw - 40px))',
      className: 'loc-popup',
      offset: 18,
    })
      .setLngLat([loc.lng, loc.lat])
      .setDOMContent(content)
      .addTo(this.map);
    this.popup.on('close', () => {
      this.popup = null;
      this.opts.onSelect(null);
    });
    if (!this.map.getBounds().contains([loc.lng, loc.lat])) {
      this.map.flyTo({ center: [loc.lng, loc.lat], zoom: Math.max(this.map.getZoom(), 7) });
    }
  }

  private closePopup() {
    if (!this.popup) return;
    const p = this.popup;
    this.popup = null;
    p.remove();
  }
}

function landmarksFC(landmarks: Landmark[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: landmarks.map((l) => ({
      type: 'Feature',
      properties: {
        id: l.id,
        label: l.name,
        kind: l.kind,
        kindLabel: landmarkLabel(l.kind),
        group: landmarkGroup(l.kind),
        km: l.km,
        rank: l.kind === 'city' ? 0 : l.kind === 'town' ? 1 : l.kind === 'fuel' ? 2 : l.kind === 'village' ? 4 : 3,
      },
      geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
    })),
  };
}

/** Sequential number among stops only (borders are unnumbered). */
function stopNumber(locations: MergedLocation[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index; i++) if (locations[i]!.type === 'stop') n++;
  return n;
}

function emptyFC(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
