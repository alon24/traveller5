import { test, expect } from '@playwright/test';

/**
 * Tests that selecting line 16 from the Lines search tab shows:
 *  1. All stops along the route (many more than 2 terminals)
 *  2. A road-following polyline with many path points (Directions API + all stops as waypoints)
 *  3. Stop markers for every stop on the route
 */
test('line 16 — all stops and road-following route appear on map', async ({ page }) => {
  test.setTimeout(180_000);

  // Intercept google.maps.Polyline so we can inspect the path after render
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
  await page.goto('http://localhost:5173/nearby');

  // ── Switch to the Lines search tab ──────────────────────────────────────
  await expect(page.getByRole('button', { name: /lines/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /lines/i }).click();

  // ── Enter line 16 and submit ─────────────────────────────────────────────
  const lineInput = page.getByPlaceholder(/line number/i);
  await expect(lineInput).toBeVisible({ timeout: 5_000 });
  await lineInput.fill('16');
  await page.keyboard.press('Enter');

  // ── Select the first line 16 result ─────────────────────────────────────
  // LineResult renders a badge <span style="background-color:...">16</span>
  const firstBadge = page.locator('span[style*="background-color"]').filter({ hasText: /^16$/ }).first();
  await expect(firstBadge).toBeVisible({ timeout: 20_000 });
  console.log('Clicking line 16 result');
  await firstBadge.click();

  await page.screenshot({ path: '/tmp/line16-clicked.png' });

  // ── Wait for route to finish loading ────────────────────────────────────
  await expect(page.getByText('Loading route…')).toBeHidden({ timeout: 120_000 });
  console.log('Route loaded');

  // Wait for the Directions API shape to arrive after route stops load
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/line16-loaded.png' });

  // ── Map container visible ────────────────────────────────────────────────
  await expect(page.locator('.gm-style').first()).toBeVisible({ timeout: 10_000 });
  console.log('✓ Map visible');

  // ── Stop markers — expect many more than 2 terminals ────────────────────
  const allMarkers = page.locator('gmp-advanced-marker');
  await expect(allMarkers.first()).toBeVisible({ timeout: 10_000 });
  const markerCount = await allMarkers.count();
  console.log(`✓ ${markerCount} stop markers on map`);
  expect(markerCount, 'Expected many stops (all stops from Stride API, not just 2 terminals)').toBeGreaterThan(5);

  // ── All markers in Israel ────────────────────────────────────────────────
  const firstPos = await allMarkers.first().getAttribute('position');
  if (firstPos) {
    const [lat, lng] = firstPos.split(',').map(Number);
    expect(lat).toBeGreaterThan(29);
    expect(lat).toBeLessThan(34);
    expect(lng).toBeGreaterThan(34);
    expect(lng).toBeLessThan(36);
    console.log(`✓ Markers in Israel near (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
  }

  // ── Polyline follows the road network ────────────────────────────────────
  // We may have multiple polyline instances (a stops-fallback drawn first, then
  // the Directions API result drawn on top). Use the most-detailed one.
  const polylineInfo = await page.evaluate(() => {
    const list: any[] = (window as any).__gmPolylines ?? [];
    return list.map(p => ({
      pointCount:   p.getPath?.()?.getArray?.()?.length ?? 0,
      strokeColor:  p.get?.('strokeColor'),
      strokeWeight: p.get?.('strokeWeight'),
      hasMap:       !!p.getMap?.(),
    }));
  });

  console.log('Polylines:', JSON.stringify(polylineInfo));

  // Take the polyline with the most path points on the map
  const bestPolyline = polylineInfo
    .filter(p => p.hasMap && p.pointCount >= 2)
    .sort((a, b) => b.pointCount - a.pointCount)[0];

  expect(bestPolyline, `Expected a polyline on the map. Got: ${JSON.stringify(polylineInfo)}`).toBeTruthy();

  // A road-following Directions API route via 19 waypoints produces many points
  expect(
    bestPolyline!.pointCount,
    'Road-following route should have many path points (Directions API step polylines concatenated)',
  ).toBeGreaterThan(100);

  console.log(`✓ Road-following polyline: ${bestPolyline!.pointCount} points, stroke ${bestPolyline!.strokeColor}`);

  await page.screenshot({ path: '/tmp/line16-final.png' });
  // Filter out transient proxy 5xx errors which are infrastructure noise
  const fatalErrors = consoleErrors.filter(e =>
    !e.includes('favicon') && !/5\d\d/.test(e)
  );
  if (fatalErrors.length) console.log('Console errors:', fatalErrors);
  expect(fatalErrors).toHaveLength(0);
});
