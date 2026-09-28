import maplibregl, { type LngLatBoundsLike, Map as MlMap, Marker, Popup } from 'maplibre-gl';
import { PMTiles, Protocol, type Source } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import type { Leg, MergedLocation } from '../data/types';
import { formatKm } from '../data/legs';
import { buildStyle } from './style';

export interface TripMapOptions {
  container: HTMLElement;
  /** PMTiles byte source (cache-aware). Its key becomes the style's pmtiles:// URL. */
  source: Source;
  baseUrl: string;
  onSelect: (id: string | null) => void;
  renderPopup: (loc: MergedLocation, legIn: Leg | undefined, legOut: Leg | undefined) => HTMLElement;
}

const ROUTE_SRC = 'route';

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
  private ready = false;

  constructor(opts: TripMapOptions) {
    this.opts = opts;
    getProtocol().add(new PMTiles(opts.source));
    this.map = new MlMap({
      container: opts.container,
      style: buildStyle(opts.source.getKey(), opts.baseUrl),
      center: [32.5, -21],
      zoom: 5,
      attributionControl: { compact: true },
    });
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    this.map.on('load', () => {
      this.ready = true;
      this.addRouteLayers();
      this.render(this.locations, this.legs);
    });
  }

  private addRouteLayers() {
    this.map.addSource(ROUTE_SRC, { type: 'geojson', data: emptyFC() });
    this.map.addLayer({
      id: 'route-casing',
      type: 'line',
      source: ROUTE_SRC,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 },
    });
    // line-dasharray is not data-driven in MapLibre, so routed and estimated legs are separate layers.
    this.map.addLayer({
      id: 'route-line',
      type: 'line',
      source: ROUTE_SRC,
      filter: ['==', ['get', 'source'], 'routed'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#2563eb', 'line-width': 4 },
    });
    this.map.addLayer({
      id: 'route-line-est',
      type: 'line',
      source: ROUTE_SRC,
      filter: ['==', ['get', 'source'], 'estimated'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#d97706', 'line-width': 4, 'line-dasharray': [2, 2] },
    });
    for (const layer of ['route-line', 'route-line-est']) {
      this.map.on('mouseenter', layer, () => (this.map.getCanvas().style.cursor = 'pointer'));
      this.map.on('mouseleave', layer, () => (this.map.getCanvas().style.cursor = ''));
    }
    this.map.on('click', (e) => {
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

  /** Replace all data. Safe to call before map load. */
  render(locations: MergedLocation[], legs: Leg[]) {
    this.locations = locations;
    this.legs = legs;
    if (!this.ready) return;

    const byId = new Map(locations.map((l) => [l.id, l]));
    const src = this.map.getSource(ROUTE_SRC) as maplibregl.GeoJSONSource;
    src.setData({
      type: 'FeatureCollection',
      features: legs.map((leg) => ({
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
