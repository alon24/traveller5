import { test, expect } from '@playwright/test';

/**
 * Selects a line from Nearby Stops and verifies:
 *  1. "Line X ×" badge in the panel header (line is active)
 *  2. Route data loads (spinner disappears)
 *  3. Google Maps container is rendered
 *  4. Multiple stop markers (gmp-advanced-marker) appear on the map
 *  5. Marker coordinates are in Israel (map centred on the route)
 *  6. Route terminal arrow (SVG polygon) + dot — proves routeStops ≥ 2
 *  7. A google.maps.Polyline with ≥ 2 path points was actually drawn
 *     (verified by intercepting the constructor before the app loads)
 */
test('select a nearby line — stops and route polyline appear on map', async ({ page }) => {
  test.setTimeout(120_000);

  // ── Intercept google.maps.Polyline before the app creates one ────
  // DEMO_MAP_ID forces WebGL vector mode, so polylines are not in the main
  // DOM as SVG elements.  We wrap the constructor once Google Maps loads so
  // we can later read back the path that was passed to the polyline.
  await page.addInitScript(() => {
    (window as any).__gmPolylines = [];
    const poll = setInterval(() => {
      const gm = (window as any).google?.maps;
      if (!gm?.Polyline) return;
      clearInterval(poll);
      const Original = gm.Polyline;
      function PolylineWrapper(this: any, opts: any) {
        const instance = new Original(opts);
        (window as any).__gmPolylines.push(instance);
        return instance;
      }
      PolylineWrapper.prototype = Original.prototype;
      gm.Polyline = PolylineWrapper;
    }, 50);
  });

  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 31.8942, longitude: 34.812 });

  await page.goto('http://localhost:5173/nearby');

  // ── Wait for stop list with line badges ──────────────────────────
  const firstLineBadge = page.locator('button[style*="background-color"]').first();
  await expect(firstLineBadge).toBeVisible({ timeout: 25_000 });

  const lineName = (await firstLineBadge.textContent())?.trim();
  console.log('Clicking line badge:', lineName);
  await firstLineBadge.click();

  await page.screenshot({ path: '/tmp/01-line-clicked.png' });

  // ── 1. Header badge confirms line is active ───────────────────────
  await expect(page.locator('span').filter({ hasText: /^Line / })).toBeVisible({ timeout: 10_000 });
  console.log('✓ Line badge in header');

  // ── 2. Route data loads ───────────────────────────────────────────
  await expect(page.getByText('Loading route…')).toBeHidden({ timeout: 90_000 });
  console.log('✓ Route data loaded');

  await page.waitForTimeout(800); // let fitBounds animation settle
  await page.screenshot({ path: '/tmp/02-route-loaded.png' });

  // ── 3. Map container visible ──────────────────────────────────────
  await expect(page.locator('.gm-style').first()).toBeVisible({ timeout: 10_000 });
  console.log('✓ Map container visible');

  // ── 4. Stop markers on map ────────────────────────────────────────
  const allMarkers = page.locator('gmp-advanced-marker');
  await expect(allMarkers.first()).toBeVisible({ timeout: 10_000 });
  const markerCount = await allMarkers.count();
  expect(markerCount).toBeGreaterThan(1);
  console.log(`✓ ${markerCount} stop markers on map`);

  // ── 5. Map centred on route area ─────────────────────────────────
  const firstPos = await allMarkers.first().getAttribute('position');
  const [lat, lng] = (firstPos ?? '').split(',').map(Number);
  expect(lat, 'marker lat should be in Israel').toBeGreaterThan(29);
  expect(lat).toBeLessThan(34);
  expect(lng, 'marker lng should be in Israel').toBeGreaterThan(34);
  expect(lng).toBeLessThan(36);
  console.log(`✓ Map centred near (${lat.toFixed(4)}, ${lng.toFixed(4)})`);

  // ── 6. Route terminal markers ─────────────────────────────────────
  const markerInfo = await page.evaluate(() => {
    const markers = Array.from(document.querySelectorAll('gmp-advanced-marker'));
    const hasArrow = markers.some(m => !!m.querySelector('polygon'));
    const hasDot = markers.some(m => {
      const div = m.querySelector('div[style*="border-radius: 50%"]');
      if (!div) return false;
      const bg = (div as HTMLElement).style.background || '';
      return !bg.includes('16, 185, 129') && !bg.includes('59, 130, 246');
    });
    return { hasArrow, hasDot };
  });
  expect(markerInfo.hasArrow, 'directional arrow at first route stop').toBe(true);
  expect(markerInfo.hasDot,   'coloured dot at last route stop').toBe(true);
  console.log('✓ Route terminal arrow + dot visible');

  // ── 7. Polyline was actually drawn on the map ─────────────────────
  // Read back the intercepted google.maps.Polyline instances and verify
  // that at least one has a path with ≥ 2 points and a visible stroke.
  const polylineInfo = await page.evaluate(() => {
    const list: any[] = (window as any).__gmPolylines ?? [];
    return list.map(p => {
      const path = p.getPath?.()?.getArray?.() ?? [];
      return {
        pointCount:   path.length,
        strokeColor:  p.get?.('strokeColor'),
        strokeWeight: p.get?.('strokeWeight'),
        strokeOpacity: p.get?.('strokeOpacity'),
        hasMap:       !!p.getMap?.(),
      };
    });
  });

  console.log('Polylines on map:', JSON.stringify(polylineInfo));

  const routePolyline = polylineInfo.find(p => p.pointCount >= 2 && p.hasMap);
  expect(routePolyline,
    `Expected a google.maps.Polyline with ≥ 2 points on the map. Got: ${JSON.stringify(polylineInfo)}`
  ).toBeTruthy();
  expect(routePolyline!.strokeWeight).toBeGreaterThan(0);
  console.log(
    `✓ Polyline drawn: ${routePolyline!.pointCount} points, ` +
    `stroke ${routePolyline!.strokeColor} weight ${routePolyline!.strokeWeight}`
  );

  await page.screenshot({ path: '/tmp/03-final.png' });
  expect(consoleErrors).toHaveLength(0);
});
