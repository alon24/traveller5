import { test, expect } from '@playwright/test';
test('debug relId for line 16 Rehovot', async ({ page }) => {
  test.setTimeout(60_000);
  const requests: string[] = [];
  page.on('request', req => {
    if (req.url().includes('stride') || req.url().includes('siri')) {
      requests.push(req.url().replace('http://localhost:5173', ''));
    }
  });
  page.on('console', m => {
    if (m.type() !== 'log') return;
    const t = m.text();
    if (t.includes('relId') || t.includes('siri') || t.includes('gtfs')) console.log('PAGE:', t);
  });

  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 31.8969, longitude: 34.8186 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173/nearby');
  await expect(page.locator('button[style*="background-color"]').first()).toBeVisible({ timeout: 45_000 });

  // Inject debug into React
  const relId = await page.evaluate(() => {
    // Find the first line 16 badge's data via DOM
    const buttons = Array.from(document.querySelectorAll('button[style*="background-color"]'));
    const btn16 = buttons.find(b => b.textContent?.trim() === '16');
    return btn16 ? btn16.getAttribute('title') : 'NOT FOUND';
  });
  console.log('Badge title:', relId);

  const badge16 = page.locator('button[style*="background-color"]').filter({ hasText: /^16$/ }).first();
  await badge16.click();
  await page.waitForTimeout(5000);
  console.log('Requests after click:', requests.slice(0,5).join('\n'));
  await page.screenshot({ path: '/tmp/debug-line16.png' });
});
