import { DARK, GRAYSCALE, LIGHT, layers } from '@protomaps/basemaps';
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { Flavor } from '../prefs';

export interface StyleOptions {
  basemapKey: string;
  baseUrl: string;
  flavor: Flavor;
  /** PMTiles key of the Terrarium DEM. Source is always declared so toggling never reloads the style. */
  terrainKey?: string;
  terrainVisible: boolean;
}

const FLAVORS: Record<Flavor, typeof LIGHT> = { light: LIGHT, dark: DARK, grayscale: GRAYSCALE };
const ALL_FLAVORS: Flavor[] = ['light', 'dark', 'grayscale'];

/**
 * Basemap style with all assets self-hosted under the app's base URL.
 * All three sprite sheets are declared up front and icon names are prefixed
 * with the flavor, so switching Day/Night/Gray is a diffable change (no full reload).
 */
export function buildStyle(o: StyleOptions): StyleSpecification {
  // Plain string concat: `new URL()` would percent-encode the {fontstack}/{range} tokens.
  const origin = window.location.origin;
  const base = o.baseUrl.startsWith('http') ? o.baseUrl : origin + o.baseUrl;
  let specs = prefixIcons(latinLabelsOnly(layers('protomaps', FLAVORS[o.flavor], { lang: 'en' })), o.flavor);
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
      maxzoom: 9,
      attribution: 'Terrain: Mapzen / AWS',
    };
    specs = withHillshade(specs, o.flavor, o.terrainVisible);
  }
  return {
    version: 8,
    glyphs: `${base}glyphs/{fontstack}/{range}.pbf`,
    sprite: ALL_FLAVORS.map((f) => ({ id: f, url: `${base}sprites/${f}` })),
    sources,
    layers: specs,
  };
}

/** Insert a hillshade layer just below the first water layer so lakes stay flat. */
function withHillshade(specs: LayerSpecification[], flavor: Flavor, visible: boolean): LayerSpecification[] {
  const dark = flavor === 'dark';
  const hill: LayerSpecification = {
    id: 'hillshade',
    type: 'hillshade',
    source: 'terrain',
    layout: { visibility: visible ? 'visible' : 'none' },
    paint: {
      'hillshade-exaggeration': dark ? 0.35 : 0.45,
      'hillshade-shadow-color': dark ? '#000000' : '#5b4a3a',
      'hillshade-highlight-color': dark ? '#3a3a3a' : '#ffffff',
      'hillshade-accent-color': dark ? '#000000' : '#6b5a4a',
    },
  };
  const idx = specs.findIndex((l) => l.id === 'water' || l.id.startsWith('water'));
  const out = [...specs];
  out.splice(idx === -1 ? 1 : idx, 0, hill);
  return out;
}

/** With multiple sprites, icon names must be `<spriteId>:<name>`. */
function prefixIcons(specs: LayerSpecification[], flavor: Flavor): LayerSpecification[] {
  return specs.map((l) => {
    if (l.type !== 'symbol' || !l.layout || !('icon-image' in l.layout)) return l;
    const icon = l.layout['icon-image'] as string | ExpressionSpecification;
    const prefixed = prefixExpr(icon as unknown as Expr, `${flavor}:`) as unknown as ExpressionSpecification;
    return { ...l, layout: { ...l.layout, 'icon-image': prefixed } };
  });
}

type Expr = string | number | boolean | null | Expr[];

/**
 * Prefix every string output of an icon expression. Zoom-driven `step` must stay top-level,
 * so we descend into branch outputs instead of wrapping the whole thing in `concat`.
 */
export function prefixExpr(e: Expr, prefix: string): Expr {
  if (typeof e === 'string') return prefix + e;
  if (!Array.isArray(e)) return e;
  const op = e[0];
  const rest = e.slice(1);
  switch (op) {
    case 'literal':
      return ['literal', typeof e[1] === 'string' ? prefix + e[1] : e[1]!];
    case 'step': {
      // ['step', input, out0, stop1, out1, stop2, out2, ...]
      const out: Expr[] = ['step', rest[0]!, prefixExpr(rest[1]!, prefix)];
      for (let i = 2; i < rest.length; i += 2) out.push(rest[i]!, prefixExpr(rest[i + 1]!, prefix));
      return out;
    }
    case 'case': {
      // ['case', cond1, out1, ..., default]
      const out: Expr[] = ['case'];
      for (let i = 0; i < rest.length - 1; i += 2) out.push(rest[i]!, prefixExpr(rest[i + 1]!, prefix));
      out.push(prefixExpr(rest[rest.length - 1]!, prefix));
      return out;
    }
    case 'match': {
      // ['match', input, label1, out1, ..., default]
      const out: Expr[] = ['match', rest[0]!];
      for (let i = 1; i < rest.length - 1; i += 2) out.push(rest[i]!, prefixExpr(rest[i + 1]!, prefix));
      out.push(prefixExpr(rest[rest.length - 1]!, prefix));
      return out;
    }
    case 'coalesce':
      return ['coalesce', ...rest.map((r) => prefixExpr(r, prefix))];
    default:
      return ['concat', prefix, e];
  }
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
