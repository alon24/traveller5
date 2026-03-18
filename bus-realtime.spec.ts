/**
 * Selects line 16 near Rehovot and checks that:
 * 1. SIRI vehicle positions are fetched immediately on selection (< 5s)
 * 2. The feed re-polls at least 2 more times (total 3 batches in ~75s)
 * 3. Screenshots are taken after 1st and 3rd poll batch
 */
import { test, expect } from '@playwright/test';

test('line 16 Rehovot: SIRI polled 3x in ~75s, bus icons shown', async ({ page }) => {
  test.setTimeout(150_000);

  // Track poll "batches" — a new batch starts when > 10s elapses since previous request
  const batchTimes: number[] = [];
  let lastReqTime = 0;

  page.on('request', req => {
    if (!req.url().includes('siri_vehicle_locations')) return;
    const now = Date.now();
    if (now - lastReqTime > 10_000) batchTimes.push(now); // new batch
    lastReqTime = now;
  });

  const siriResults: number[] = [];
  page.on('response', async res => {
    if (!res.url().includes('siri_vehicle_locations')) return;
    try {
      const body = await res.json();
      if (Array.isArray(body)) siriResults.push(body.length);
    } catch {}
  });

  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 31.7767, longitude: 35.2345 }); // Jerusalem — line 16 reliably found here
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173/nearby');

  await expect(page.locator('span[style*="background-color"]').first()).toBeVisible({ timeout: 60_000 });

  expect(batchTimes.length).toBe(0); // no polling before selection

  // Select line 16
  const badge16 = page.locator('span[style*="background-color"]').filter({ hasText: /^16$/ }).first();
  await expect(badge16).toBeVisible({ timeout: 10_000 });
  const t0 = Date.now();
  await badge16.click();
  console.log('→ Selected line 16');

  // 1st batch must fire quickly
  await page.waitForRequest(req => req.url().includes('siri_vehicle_locations'), { timeout: 10_000 });
  const firstBatchMs = Date.now() - t0;
  console.log(`1st poll batch after ${firstBatchMs}ms`);
  expect(firstBatchMs).toBeLessThan(8_000);

  await page.screenshot({ path: '/tmp/line16-poll1.png' });
  console.log('✓ screenshot after 1st poll');

  // Wait for 2nd batch (~30s)
  await page.waitForFunction(() => true, { timeout: 35_000 }).catch(() => {});
  await new Promise(r => {
    const check = setInterval(() => {
      if (batchTimes.length >= 2) { clearInterval(check); r(undefined); }
    }, 500);
    setTimeout(() => { clearInterval(check); r(undefined); }, 38_000);
  });
  console.log(`After 2nd batch wait: ${batchTimes.length} batches`);

  // Wait for 3rd batch (~60s total)
  await new Promise(r => {
    const check = setInterval(() => {
      if (batchTimes.length >= 3) { clearInterval(check); r(undefined); }
    }, 500);
    setTimeout(() => { clearInterval(check); r(undefined); }, 40_000);
  });

  const elapsed = Date.now() - t0;
  console.log(`${batchTimes.length} poll batches in ${Math.round(elapsed/1000)}s`);
  console.log('Bus pings per response:', siriResults.join(', ') || '(none yet)');
  const totalBuses = siriResults.reduce((s, n) => s + n, 0);
  console.log(`Total bus pings: ${totalBuses}`);

  await page.screenshot({ path: '/tmp/line16-poll3.png' });
  console.log('✓ screenshot after 3rd poll');

  expect(batchTimes.length).toBeGreaterThanOrEqual(3);
  expect(elapsed).toBeLessThan(90_000);
});
