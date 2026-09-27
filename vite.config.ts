import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base is set to the repo name for GitHub Pages; override via VITE_BASE if needed.
const base = process.env.VITE_BASE ?? '/zim-moz/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['img/*', 'style/*', 'glyphs/**/*', 'sprites/*'],
      manifest: {
        name: 'Zim–Moz Trip Map',
        short_name: 'Zim–Moz',
        display: 'standalone',
        start_url: base,
        scope: base,
        background_color: '#ffffff',
        theme_color: '#1f2937',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,png,jpg,webp,pbf,svg}'],
        // Basemap is fetched explicitly by the offline UI and stored in Cache API; never precached.
        globIgnores: ['**/*.pmtiles'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
});
