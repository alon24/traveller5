import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [react()],
  test: {
    // Browser mode: real Chromium via Playwright, no jsdom shims needed.
    // DecompressionStream, fetch, localStorage, etc. are all native.
    browser: {
      enabled: true,
      provider: playwright({ headless: true }),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
    // Proxy config mirrors vite.config.js so fetch('/proxy/...') works in tests
    server: {
      proxy: {
        '/proxy/mot': {
          target: 'https://gtfs.mot.gov.il',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/proxy\/mot/, ''),
          headers: { 'Ocp-Apim-Subscription-Key': '4b652fd3ee4e4350a9c89fc78e0fd006' },
        },
        '/proxy/stride': {
          target: 'https://open-bus-stride-api.hasadna.org.il',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/proxy\/stride/, ''),
        },
        '/proxy/overpass/1': {
          target: 'https://overpass-api.de',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/proxy\/overpass\/1/, ''),
        },
      },
    },
    testTimeout: 60_000,
    // Only pick up .test.ts / .test.js / .test.tsx files
    include: ['src/**/*.test.{ts,tsx,js,jsx}', 'tests/**/*.test.{ts,tsx,js,jsx}'],
  },
});
