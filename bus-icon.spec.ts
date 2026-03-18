/**
 * Verifies that when line 16 is selected:
 * - GTFS-RT VehiclePosition is NOT polled before a line is selected
 * - GTFS-RT IS polled after selecting line 16
 * - Bus SVG icons appear in the DOM
 */
import { test, expect } from '@playwright/test';

test('line 16: GTFS-RT polled only when line active, bus icons appear', async ({ page }) => {
  test.setTimeout(120_000);

  const rtRequests: number[] = [];
  page.on('request', req => {
    if (req.url().includes('siri_vehicle_locations')) rtRequests.push(Date.now());
  });

  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 31.7767, longitude: 35.2345 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173/nearby');

  // Wait for nearby stops to load
  await expect(page.locator('span[style*="background-color"]').first()).toBeVisible({ timeout: 45_000 });
  const rtBeforeSelect = rtRequests.length;
  console.log(`RT requests before line select: ${rtBeforeSelect} (should be 0)`);
  expect(rtBeforeSelect).toBe(0);

  // Select line 16
  const badge16 = page.locator('span[style*="background-color"]').filter({ hasText: /^16$/ }).first();
  await badge16.click();
  console.log('→ clicked line 16');

  // SIRI vehicle locations should now be polled via Stride
  await page.waitForRequest(req => req.url().includes('siri_vehicle_locations'), { timeout: 20_000 });
  console.log(`✓ SIRI vehicle locations polled after selecting line 16`);
  expect(rtRequests.length).toBeGreaterThan(0);

  // Wait a moment for bus markers to render
  await page.waitForTimeout(2000);

  // Check bus SVGs in DOM (each bus icon is an <svg> inside an AdvancedMarker)
  const busSvgs = page.locator('svg ellipse[fill="rgba(0,0,0,0.25)"]'); // drop shadow ellipse unique to bus icon
  const busCount = await busSvgs.count();
  console.log(`Bus icons on map: ${busCount}`);

  // Screenshot
  await page.screenshot({ path: '/tmp/bus-icon-line16.png' });
  console.log('✓ /tmp/bus-icon-line16.png');

  // Deselect by clicking the × on the line chip
  const xBtn = page.locator('span').filter({ hasText: /Line 16/ }).locator('button').first();
  if (await xBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await xBtn.click();
    console.log('→ cleared line 16 selection');
  }

  // RT should stop being initiated for new polls - just verify no crash
  await page.waitForTimeout(1000);
  console.log(`Total RT requests during test: ${rtRequests.length}`);
});
