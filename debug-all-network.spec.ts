/**
 * Shows ALL network responses (not just known URLs) and reads localStorage
 * to understand exactly why lines are not appearing.
 */
import { test } from '@playwright/test';

test('full network + localStorage debug', async ({ page }) => {
  test.setTimeout(90_000);

  const allResponses: string[] = [];
  const consoleErrors: string[] = [];

  page.on('response', async (res) => {
    const url = res.url();
    const status = res.status();
    // Skip boring static assets
    if (url.match(/\.(js|css|png|ico|woff|svg)(\?|$)/)) return;
    allResponses.push(`${status} ${res.request().method()} ${url.slice(0, 150)}`);
    // For non-2xx, try to read body snippet
    if (!res.ok() && status !== 206) {
      try {
        const body = await res.text();
        allResponses.push(`  body: ${body.slice(0, 200)}`);
      } catch {}
    }
  });

  page.on('requestfailed', (req) => {
    allResponses.push(`ERR_ABORTED ${req.method()} ${req.url().slice(0, 150)} — ${req.failure()?.errorText}`);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
  });

  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 31.8939, longitude: 34.8126 });
  await page.setViewportSize({ width: 390, height: 844 });

  // Clear localStorage so we start fresh (no stale cache)
  await page.goto('http://localhost:5173/nearby');
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter(k => k.startsWith('ns'))
      .forEach(k => localStorage.removeItem(k));
  });
  console.log('Cleared nearby cache, reloading...');
  await page.reload();

  await page.waitForTimeout(35_000); // give enough time for GTFS + Overpass

  console.log('\n=== ALL NETWORK RESPONSES ===');
  allResponses.forEach(r => console.log(' ', r));

  console.log('\n=== CONSOLE ERRORS ===');
  consoleErrors.forEach(e => console.log(' ', e));

  // Read localStorage cache state
  const lsState = await page.evaluate(() => {
    const result: Record<string, any> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (!key.startsWith('ns')) continue;
      try {
        const { d, t } = JSON.parse(localStorage.getItem(key)!);
        const age = Math.round((Date.now() - t) / 1000);
        if (Array.isArray(d)) {
          result[key] = `Array[${d.length}] age=${age}s`;
        } else if (d && typeof d === 'object') {
          const keys = Object.keys(d);
          const nodeLen = d.nodes?.length;
          const codeLen = d.byCode ? Object.keys(d.byCode).length : null;
          result[key] = `Object{${keys.join(',')}} byCode=${codeLen} nodes=${nodeLen} age=${age}s`;
        } else {
          result[key] = `${typeof d} age=${age}s`;
        }
      } catch (e: any) {
        result[key] = `parse error: ${e.message}`;
      }
    }
    return result;
  });

  console.log('\n=== LOCALSTORAGE CACHE STATE ===');
  Object.entries(lsState).forEach(([k, v]) => console.log(`  ${k} → ${v}`));

  // Check DOM
  const badges = await page.locator('button[style*="background-color"]').count();
  const noDataTexts = await page.locator('text=No line data').count();
  console.log(`\n=== DOM === badges=${badges} "No line data" elements=${noDataTexts}`);

  await page.screenshot({ path: '/tmp/debug-all-network.png', fullPage: true });
});
