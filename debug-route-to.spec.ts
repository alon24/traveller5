import { test } from '@playwright/test';
test('sample route to/direction data', async ({ page }) => {
  test.setTimeout(60_000);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 31.8939, longitude: 34.8126 });
  await page.goto('http://localhost:5173/nearby');
  await page.waitForTimeout(35_000);
  // Read the ls cache to see route data including 'to' field
  const data = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('ns'));
    const result: any = {};
    for (const k of keys) {
      try {
        const { d } = JSON.parse(localStorage.getItem(k)!);
        if (d && d.byCode) {
          // Show first 3 stops' route data
          const sample = Object.entries(d.byCode).slice(0, 3).map(([code, routes]: any) => ({
            code, routes: routes.slice(0, 4).map((r: any) => ({ ref: r.ref, to: r.to, colour: r.colour }))
          }));
          result[k] = sample;
        }
      } catch {}
    }
    return result;
  });
  console.log(JSON.stringify(data, null, 2));
});
