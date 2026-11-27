import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  base: '/li-screener/',
  plugins: [react(), tailwindcss()],
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
