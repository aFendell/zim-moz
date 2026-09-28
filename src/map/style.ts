import { DARK, LIGHT, layers } from '@protomaps/basemaps';
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

export type Flavor = 'light' | 'dark';

export interface StyleOptions {
  basemapKey: string;
  baseUrl: string;
  flavor: Flavor;
  /** PMTiles key of the Terrarium DEM; hillshade layer is added when set. */
  terrainKey?: string;
}

/** Basemap style with all assets self-hosted under the app's base URL. */
export function buildStyle(o: StyleOptions): StyleSpecification {
  // Plain string concat: `new URL()` would percent-encode the {fontstack}/{range} tokens.
  const origin = window.location.origin;
  const base = o.baseUrl.startsWith('http') ? o.baseUrl : origin + o.baseUrl;
  const flavor = o.flavor === 'dark' ? DARK : LIGHT;
  let specs = latinLabelsOnly(layers('protomaps', flavor, { lang: 'en' }));
  const sources: StyleSpecification['sources'] = {
    protomaps: {
      type: 'vector',
      url: `pmtiles://${o.basemapKey}`,
      attribution: '© OpenStreetMap contributors, Protomaps',
    },
  };
  if (o.terrainKey) {
    sources.terrain = {
      type: 'raster-dem',
      url: `pmtiles://${o.terrainKey}`,
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 10,
      attribution: 'Terrain: Mapzen / AWS',
    };
    specs = withHillshade(specs, o.flavor);
  }
  return {
    version: 8,
    glyphs: `${base}glyphs/{fontstack}/{range}.pbf`,
    sprite: `${base}sprites/${o.flavor}`,
    sources,
    layers: specs,
  };
}

/** Insert a hillshade layer just below the first water layer so lakes stay flat. */
function withHillshade(specs: LayerSpecification[], flavor: Flavor): LayerSpecification[] {
  const hill: LayerSpecification = {
    id: 'hillshade',
    type: 'hillshade',
    source: 'terrain',
    paint: {
      'hillshade-exaggeration': flavor === 'dark' ? 0.35 : 0.45,
      'hillshade-shadow-color': flavor === 'dark' ? '#000000' : '#5b4a3a',
      'hillshade-highlight-color': flavor === 'dark' ? '#3a3a3a' : '#ffffff',
      'hillshade-accent-color': flavor === 'dark' ? '#000000' : '#6b5a4a',
    },
  };
  const idx = specs.findIndex((l) => l.id === 'water' || l.id.startsWith('water'));
  const out = [...specs];
  out.splice(idx === -1 ? 1 : idx, 0, hill);
  return out;
}

/**
 * Replace Protomaps' multilingual label expression with English-or-local name.
 * The tileset carries name:ar/fa/ur etc.; without this MapLibre requests
 * non-Latin glyph ranges we deliberately do not ship.
 */
function latinLabelsOnly(specs: LayerSpecification[]): LayerSpecification[] {
  return specs.map((l) => {
    if (l.type !== 'symbol' || !l.layout || !('text-field' in l.layout)) return l;
    // Only place/feature names; leave road shields (shield_text) and similar alone.
    if (!JSON.stringify(l.layout['text-field']).includes('"name')) return l;
    return {
      ...l,
      layout: { ...l.layout, 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']] },
    };
  });
}
