import { LIGHT, layers } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';

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
    layers: layers('protomaps', LIGHT, { lang: 'en' }),
  };
}
