/**
 * Checks how many GTFS stops are loaded and what coords they have.
 */
import { test, expect } from '@playwright/test';

test('gtfs stops diagnostic', async ({ page }) => {
  test.setTimeout(120_000);

  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
  });

  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 31.7767, longitude: 35.2345 }); // Jerusalem
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173/nearby');

  // Clear all caches
  await page.evaluate(() => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k) localStorage.removeItem(k);
    }
  });
  await page.reload();

  console.log('Waiting 40s for GTFS load...');
  await page.waitForTimeout(40_000);

  // Inject a script to call getGtfsStops and check results
  const stopStats = await page.evaluate(async () => {
    try {
      // Access the module via dynamic import
      const mod = await import('/src/services/api/gtfsRoutes.js');
      const stops = await mod.getGtfsStops();
      if (!stops || !stops.length) return { count: 0, sample: [], error: null };

      // Sample stops near Jerusalem and Rehovot
      const jer = stops.filter((s: any) =>
        Math.abs(s.lat - 31.7767) < 0.05 && Math.abs(s.lng - 35.2345) < 0.05
      );
      const rehov = stops.filter((s: any) =>
        Math.abs(s.lat - 31.8942) < 0.05 && Math.abs(s.lng - 34.8120) < 0.05
      );
      return {
        totalCount: stops.length,
        nearJerusalem: jer.length,
        nearRehovot: rehov.length,
        sample: stops.slice(0, 3).map((s: any) => ({ code: s.stopCode, name: s.name, lat: s.lat, lng: s.lng })),
        lastSample: stops.slice(-3).map((s: any) => ({ code: s.stopCode, name: s.name, lat: s.lat, lng: s.lng })),
      };
    } catch (e: any) {
      return { error: e.message, count: 0 };
    }
  });

  console.log('\n=== GTFS STOPS ===');
  console.log(JSON.stringify(stopStats, null, 2));

  console.log('\n=== CONSOLE ERRORS ===');
  consoleErrors.forEach(e => console.log(' ', e));

  expect(stopStats.error ?? null).toBeNull();
});
