// Basemap PMTiles URL. Set to the GitHub Release asset URL once uploaded, e.g.
// https://github.com/<owner>/zim-moz/releases/download/basemap-v1/zim-moz.pmtiles
// During local dev a file placed at public/zim-moz.pmtiles is served by Vite.
export const BASEMAP_URL = import.meta.env.VITE_BASEMAP_URL ?? `${import.meta.env.BASE_URL}zim-moz.pmtiles`;

// Bump when basemap changes so clients know to re-download.
export const BASEMAP_VERSION = 1;

// Multiplier applied to straight-line distance when a leg cannot use routed geometry.
export const ESTIMATE_ROAD_FACTOR = 1.3;
