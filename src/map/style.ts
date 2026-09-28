import { LIGHT, layers } from '@protomaps/basemaps';
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

/** Basemap style with all assets self-hosted under the app's base URL. */
export function buildStyle(pmtilesUrl: string, baseUrl: string): StyleSpecification {
  // Plain string concat: `new URL()` would percent-encode the {fontstack}/{range} tokens.
  const origin = window.location.origin;
  const base = baseUrl.startsWith('http') ? baseUrl : origin + baseUrl;
  return {
    version: 8,
    glyphs: `${base}glyphs/{fontstack}/{range}.pbf`,
    sprite: `${base}sprites/light`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
        attribution: '© OpenStreetMap contributors, Protomaps',
      },
    },
    layers: latinLabelsOnly(layers('protomaps', LIGHT, { lang: 'en' })),
  };
}

/**
 * Replace Protomaps' multilingual label expression with English-or-local name.
 * The tileset carries name:ar/fa/ur etc.; without this MapLibre requests
 * non-Latin glyph ranges we deliberately do not ship.
 */
function latinLabelsOnly(specs: LayerSpecification[]): LayerSpecification[] {
  return specs.map((l) => {
    if (l.type !== 'symbol' || !l.layout || !('text-field' in l.layout)) return l;
    return {
      ...l,
      layout: { ...l.layout, 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']] },
    };
  });
}
