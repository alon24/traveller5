import { test, expect } from '@playwright/test';

test('debug: check relId and stops for nearby lines', async ({ page }) => {
  test.setTimeout(120_000);

  // Intercept network requests to overpass and stride
  const requests: string[] = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('overpass') || url.includes('stride') || url.includes('curlbus')) {
      requests.push(req.method() + ' ' + url.slice(0, 120));
    }
  });
  const responses: string[] = [];
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('stride') && url.includes('gtfs_route')) {
      try {
        const text = await res.text();
        responses.push('STRIDE ' + url.slice(url.lastIndexOf('/')) + ' → ' + text.slice(0, 200));
      } catch {}
    }
  });

  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 31.7767, longitude: 35.2345 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173/nearby');

  await expect(page.locator('button[style*="background-color"]').first()).toBeVisible({ timeout: 30_000 });

  // Find badge 13
  const badge13 = page.locator('button[style*="background-color"]').filter({ hasText: /^13$/ }).first();
  for (let i = 0; i < 12; i++) {
    if (await badge13.isVisible()) break;
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(300);
  }
  await expect(badge13).toBeVisible({ timeout: 10_000 });

  // Get the title attribute and style to understand the badge
  const badgeTitle = await badge13.getAttribute('title');
  const badgeStyle = await badge13.getAttribute('style');
  console.log('Badge 13 title:', badgeTitle, '| style:', badgeStyle);

  // Look at the route info from the parent stop row
  const stopInfo = await badge13.evaluate((el: Element) => {
    // Walk up to find a data attribute or the stop name
    let node: any = el;
    const texts: string[] = [];
    for (let i = 0; i < 8; i++) {
      node = node?.parentElement;
      if (!node) break;
      if (node.textContent) texts.push(node.textContent.trim().slice(0, 80));
    }
    return texts;
  });
  console.log('Stop context:', stopInfo.slice(0, 4));

  // Clear request log then click
  requests.length = 0;
  responses.length = 0;
  await badge13.click();
  await page.waitForTimeout(5000);

  console.log('Network requests after click:');
  requests.forEach(r => console.log(' ', r));
  console.log('Stride responses:');
  responses.forEach(r => console.log(' ', r));

  const markerCount = await page.locator('gmp-advanced-marker').count();
  console.log('Markers:', markerCount);
  await page.screenshot({ path: '/tmp/debug-line13.png' });
});
