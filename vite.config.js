import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: 'all',
    hmr: true,
    proxy: {
      '/proxy/mot': {
        target: 'https://gtfs.mot.gov.il',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/mot/, ''),
        headers: {
          'Ocp-Apim-Subscription-Key': '4b652fd3ee4e4350a9c89fc78e0fd006',
        },
      },
      '/proxy/rail': {
        target: 'https://www.rail.co.il/apiinfo/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/rail/, ''),
      },
      '/proxy/weather': {
        target: 'https://api.openweathermap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/weather/, ''),
      },
      '/proxy/curlbus': {
        target: 'https://curlbus.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/curlbus/, ''),
      },
'/proxy/overpass/1': {
        target: 'https://overpass-api.de',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/overpass\/1/, ''),
      },
      '/proxy/overpass/2': {
        target: 'https://overpass.kumi.systems',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/overpass\/2/, ''),
      },
      '/proxy/overpass/3': {
        target: 'https://overpass.openstreetmap.fr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/overpass\/3/, ''),
      },
    },
  },
})
