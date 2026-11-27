import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** База GitHub Pages. */
const BASE = '/li-screener/'

// https://vite.dev/config/
export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg', 'pwa-180.png', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'LI Screener',
        short_name: 'LI Screener',
        description: 'Графики и арбитражи MOEX через Alor',
        lang: 'ru',
        theme_color: '#131317',
        background_color: '#131317',
        display: 'standalone',
        orientation: 'any',
        start_url: BASE,
        scope: BASE,
        id: BASE,
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        /** Не прекэшировать огромную charting library целиком. */
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2,png,webp,webmanifest}'],
        globIgnores: ['**/charting_library/**', '**/assets/charting_library/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [/^\/api/, /\/assets\/charting_library\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/charting_library/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'charting-library',
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.hostname === 'iss.moex.com' || url.pathname.startsWith('/moex-iss'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'moex-iss',
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 5,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Browser polyfill for Node `ws` — alor-api subscriptions
      ws: path.resolve(__dirname, './src/alias/ws.js'),
    },
  },
  server: {
    proxy: {
      /** MOEX ISS — ГО FORTS без CORS в dev */
      '/moex-iss': {
        target: 'https://iss.moex.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/moex-iss/, ''),
      },
    },
  },
})
