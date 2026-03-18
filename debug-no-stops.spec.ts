import { test, expect } from '@playwright/test';

test('debug: why no stations/lines on nearby page', async ({ page }) => {
  test.setTimeout(120_000);

  const errors: string[] = [];
  const networkFails: string[] = [];
  const requests: string[] = [];
  const consoleLines: string[] = [];

  page.on('console', msg => {
    const text = msg.text();
    consoleLines.push(`[${msg.type()}] ${text.slice(0, 300)}`);
    if (msg.type() === 'error') errors.push(text.slice(0, 300));
  });

  page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message.slice(0, 300)));

  page.on('requestfailed', req => {
    networkFails.push(`FAILED: ${req.method()} ${req.url().slice(0, 120)} — ${req.failure()?.errorText}`);
  });

  page.on('response', async res => {
    const url = res.url();
    const status = res.status();
    if (!res.ok() && !url.includes('favicon')) {
      networkFails.push(`HTTP ${status}: ${url.slice(0, 120)}`);
    }
    if (url.includes('gtfsfiles') || url.includes('overpass') || url.includes('stride') || url.includes('mot')) {
      requests.push(`${status} ${res.request().method()} ${url.slice(0, 120)}`);
    }
  });

  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 31.7767, longitude: 35.2345 }); // Jerusalem
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('http://localhost:5173/nearby');
  console.log('Page loaded, waiting 25s for data...');

  // Wait up to 25s for ANY line badge to appear
  let hasBadges = false;
  try {
    await expect(page.locator('button[style*="background-color"]').first()).toBeVisible({ timeout: 25_000 });
    hasBadges = true;
  } catch {
    console.log('No line badges appeared within 25s');
  }

  // Also check for stop name text
  const stopNames = await page.locator('[class*="text-white"]').allInnerTexts();
  const anyStopText = stopNames.filter(t => t.trim().length > 2).slice(0, 10);

  console.log('\n=== DOM STATE ===');
  console.log('Has line badges:', hasBadges);
  console.log('Text elements sample:', anyStopText);

  // Check specifically what's in the nearby list area
  const nearbyListHtml = await page.locator('main, [class*="overflow-y"]').first().innerHTML().catch(() => '(not found)');
  console.log('\nNearby list HTML (first 1000 chars):', nearbyListHtml.slice(0, 1000));

  console.log('\n=== NETWORK (GTFS/API) ===');
  requests.forEach(r => console.log(' ', r));

  console.log('\n=== NETWORK FAILURES ===');
  networkFails.forEach(r => console.log(' ', r));

  console.log('\n=== CONSOLE ERRORS ===');
  errors.forEach(r => console.log(' ', r));

  console.log('\n=== ALL CONSOLE (last 40) ===');
  consoleLines.slice(-40).forEach(r => console.log(' ', r));

  await page.screenshot({ path: '/tmp/debug-no-stops.png', fullPage: true });
  console.log('\nScreenshot: /tmp/debug-no-stops.png');

  // If no badges, check if there's a loading spinner or error message
  const loadingText = await page.locator('text=/loading|טוען|error|שגיאה/i').allInnerTexts().catch(() => []);
  console.log('Loading/error text on page:', loadingText);

  // Print useNearbyStops state via window
  const storeState = await page.evaluate(() => {
    // Try to access any global debug info
    return {
      hasGoogle: !!(window as any).google,
      hasGoogleMaps: !!(window as any).google?.maps,
    };
  });
  console.log('Window state:', storeState);
});
