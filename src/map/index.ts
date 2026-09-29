import maplibregl, { type LngLatBoundsLike, Map as MlMap, Marker, Popup } from 'maplibre-gl';
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
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
  private landmarksFC: FeatureCollection;
  private userPos: { lat: number; lng: number } | null = null;
  private selectedId: string | null = null;

  /** Last GPS fix, if the user enabled location. */
  getUserPosition() {
    return this.userPos;
  }

  constructor(opts: TripMapOptions) {
    this.opts = opts;
    this.prefs = structuredClone(opts.prefs);
    this.landmarksFC = landmarksFC(opts.landmarks);
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
    const geo = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
      trackUserLocation: true,
      showUserLocation: true,
      showAccuracyCircle: true,
    });
    this.map.addControl(geo, 'top-right');
    geo.on('geolocate', (e: GeolocationPosition) => {
      this.userPos = { lat: e.coords.latitude, lng: e.coords.longitude };
      // Refresh an open stop card so it shows distance from here.
      if (this.popup && this.selectedId) this.select(this.selectedId);
    });
    geo.on('trackuserlocationend', () => {
      /* keep last fix; card keeps showing distance */
    });
    this.map.on('load', () => {
      this.ready = true;
      this.bindClicks();
      this.render(this.locations, this.legs);
    });
  }

  /** Full style: basemap + overlay sources/layers, so setStyle() can diff instead of reload. */
  private style(): StyleSpecification {
    const base = buildStyle({
      basemapKey: this.opts.basemap.getKey(),
      baseUrl: this.opts.baseUrl,
      flavor: this.prefs.flavor,
      terrainKey: this.opts.terrain?.getKey(),
      terrainVisible: this.prefs.terrain,
    });
    const sources = { ...base.sources, [ROUTE_SRC]: { type: 'geojson', data: this.routeFC() }, [LM_SRC]: { type: 'geojson', data: this.landmarksFC } } as StyleSpecification['sources'];
    return { ...base, sources, layers: [...base.layers, ...this.overlayLayers()] };
  }

  private overlayLayers(): LayerSpecification[] {
    const p = this.prefs;
    const groups: string[] = p.landmarks ? p.landmarkGroups : [];
    const inGroups: maplibregl.ExpressionSpecification = ['in', ['get', 'group'], ['literal', groups]];
    const dark = p.flavor === 'dark';
    return [
      {
        id: 'route-casing',
        type: 'line',
        source: ROUTE_SRC,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': p.routeCasing, 'line-width': 7, 'line-opacity': 0.9 },
      },
      // line-dasharray is not data-driven in MapLibre, so routed and estimated legs are separate layers.
      {
        id: 'route-line',
        type: 'line',
        source: ROUTE_SRC,
        filter: ['==', ['get', 'source'], 'routed'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': p.routeColor, 'line-width': 4 },
      },
      {
        id: 'route-line-est',
        type: 'line',
        source: ROUTE_SRC,
        filter: ['==', ['get', 'source'], 'estimated'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#d97706', 'line-width': 4, 'line-dasharray': [2, 2] },
      },
      {
        id: 'lm-circle',
        type: 'circle',
        source: LM_SRC,
        minzoom: 6,
        filter: inGroups,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 10, 5, 13, 7],
          'circle-color': ['match', ['get', 'group'], 'towns', p.landmarkColors.towns, 'fuel', p.landmarkColors.fuel, p.landmarkColors.services],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-opacity': ['case', ['==', ['get', 'kind'], 'village'], 0.6, 0.95],
        },
      },
      {
        id: 'lm-label',
        type: 'symbol',
        source: LM_SRC,
        minzoom: 8,
        // Basemap already labels towns; only name fuel/services.
        filter: ['all', inGroups, ['!=', ['get', 'group'], 'towns']],
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
          'text-color': dark ? '#e5e7eb' : '#1f2937',
          'text-halo-color': dark ? '#111827' : '#ffffff',
          'text-halo-width': 1.2,
        },
      },
    ];
  }

  /** Apply display prefs via a diffed setStyle (no flicker) plus marker colours. */
  setPrefs(next: Prefs) {
    this.prefs = structuredClone(next);
    if (!this.ready) return;
    this.map.setStyle(this.style(), { diff: true });
    this.applyMarkerColors();
  }

  private applyMarkerColors() {
    this.opts.container.style.setProperty('--stop-color', this.prefs.stopColor);
    this.opts.container.style.setProperty('--border-color', this.prefs.borderColor);
  }

  private bindClicks() {
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

  private routeFC(): FeatureCollection {
    const byId = new Map(this.locations.map((l) => [l.id, l]));
    return {
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
    };
  }

  /** Replace all data. Safe to call before map load. */
  render(locations: MergedLocation[], legs: Leg[]) {
    this.locations = locations;
    this.legs = legs;
    if (!this.ready) return;
    (this.map.getSource(ROUTE_SRC) as maplibregl.GeoJSONSource | undefined)?.setData(this.routeFC());
    this.applyMarkerColors();

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
    this.selectedId = id;
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
      this.selectedId = null;
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

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
