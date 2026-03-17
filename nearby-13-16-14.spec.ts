import { test, expect } from '@playwright/test';
import * as fs from 'fs';

async function interceptPolylines(page: any) {
  await page.addInitScript(() => {
    (window as any).__gmPolylines = [];
    const poll = setInterval(() => {
      const gm = (window as any).google?.maps;
      if (!gm?.Polyline) return;
      clearInterval(poll);
      const Orig = gm.Polyline;
      function W(this: any, opts: any) {
        const i = new Orig(opts);
        (window as any).__gmPolylines.push(i);
        return i;
      }
      W.prototype = Orig.prototype;
      gm.Polyline = W;
    }, 50);
  });
}

async function debugPolylines(page: any, label: string) {
  const all = await page.evaluate(() => {
    const list: any[] = (window as any).__gmPolylines ?? [];
    return list.map(p => ({
      pts: p.getPath?.()?.getArray?.()?.length ?? 0,
      color: p.get?.('strokeColor'),
      onMap: !!p.getMap?.(),
    }));
  });
  console.log(`[${label}] polylines (${all.length} total):`, JSON.stringify(all));
  return all;
}

async function getActivePoly(page: any) {
  const all = await page.evaluate(() => {
    const list: any[] = (window as any).__gmPolylines ?? [];
    return list.map(p => ({
      pts: p.getPath?.()?.getArray?.()?.length ?? 0,
      color: p.get?.('strokeColor'),
      onMap: !!p.getMap?.(),
      mid: (() => {
        try {
          const arr = p.getPath?.()?.getArray?.() ?? [];
          if (arr.length < 2) return null;
          const m = arr[Math.floor(arr.length / 2)];
          return { lat: m.lat(), lng: m.lng() };
        } catch { return null; }
      })(),
    }));
  });
  return all.filter((p: any) => p.onMap && p.pts >= 2)
            .sort((a: any, b: any) => b.pts - a.pts)[0] ?? null;
}

async function clickNearbyLineBadge(page: any, lineNumber: string) {
  const badge = page.locator('button[style*="background-color"]')
    .filter({ hasText: new RegExp(`^${lineNumber}$`) })
    .first();
  for (let i = 0; i < 12; i++) {
    if (await badge.isVisible()) break;
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(300);
  }
  await expect(badge).toBeVisible({ timeout: 10_000 });
  console.log(`→ clicking badge "${lineNumber}"`);
  await badge.click();
}

async function selectAndCapture(page: any, lineNumber: string, shotPath: string) {
  // Deselect current line if any
  const closeBtn = page.locator('button').filter({ hasText: '×' }).first();
  if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(400);
  }
  // Reset scroll
  await page.evaluate(() => {
    document.querySelectorAll('[class*="overflow-y-auto"]').forEach((el: any) => el.scrollTop = 0);
  });
  await page.waitForTimeout(300);

  await clickNearbyLineBadge(page, lineNumber);
  await page.screenshot({ path: `/tmp/nearby-${lineNumber}-clicked.png` });

  // Wait for loading spinner if it appears
  try {
    await page.getByText('Loading route…').waitFor({ state: 'visible', timeout: 3_000 });
    await page.getByText('Loading route…').waitFor({ state: 'hidden', timeout: 120_000 });
  } catch { /* spinner may not appear if load is instant */ }

  await page.waitForTimeout(5_000);
  await page.screenshot({ path: shotPath });

  const markerCount = await page.locator('gmp-advanced-marker').count();
  await debugPolylines(page, `line-${lineNumber}`);
  const poly = await getActivePoly(page);

  console.log(`Line ${lineNumber}: ${markerCount} markers | poly: ${poly ? poly.pts + 'pts ' + poly.color : 'NONE'}`);

  expect(markerCount, `Line ${lineNumber}: should have markers`).toBeGreaterThan(1);
  expect(poly, `Line ${lineNumber}: expected a polyline on the map`).toBeTruthy();
  expect(poly!.pts).toBeGreaterThanOrEqual(2);
  if (poly!.mid) {
    expect(poly!.mid.lat, `Line ${lineNumber}: polyline must be in Israel`).toBeGreaterThan(29);
    expect(poly!.mid.lat).toBeLessThan(34);
    expect(poly!.mid.lng).toBeGreaterThan(34);
    expect(poly!.mid.lng).toBeLessThan(36);
  }

  console.log(`✓ Line ${lineNumber}: ${poly!.pts} pts, colour ${poly!.color}`);
  return poly;
}

test('nearby tab: lines 13, 16, 14 each show a polyline', async ({ page }) => {
  test.setTimeout(600_000);
  await interceptPolylines(page);

  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // Jerusalem — lines 13, 14, 16 are major Egged routes there
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 31.7767, longitude: 35.2345 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173/nearby');

  await expect(page.locator('button[style*="background-color"]').first()).toBeVisible({ timeout: 30_000 });
  const allBadges = await page.locator('button[style*="background-color"]').allTextContents();
  console.log('Initial badges:', allBadges.filter(Boolean).slice(0, 30).join(', '));

  await selectAndCapture(page, '13', '/tmp/nearby-line13.png');
  await selectAndCapture(page, '16', '/tmp/nearby-line16.png');
  await selectAndCapture(page, '14', '/tmp/nearby-line14.png');

  // Side-by-side
  const imgs = ['13','16','14'].map(n =>
    `data:image/png;base64,${fs.readFileSync(`/tmp/nearby-line${n}.png`).toString('base64')}`
  );
  await page.setViewportSize({ width: 1260, height: 920 });
  await page.setContent(`<html><body style="margin:0;background:#111;display:flex;gap:8px;padding:8px;">
    ${imgs.map((src, i) => `<div style="text-align:center">
      <p style="color:#fff;font:bold 16px sans-serif;margin:4px 0">Line ${['13','16','14'][i]}</p>
      <img src="${src}" style="height:870px;width:auto;border-radius:8px;"/>
    </div>`).join('')}
  </body></html>`);
  await page.screenshot({ path: '/tmp/nearby-lines-combined.png' });
  console.log('✓ /tmp/nearby-lines-combined.png');

  const fatal = errors.filter(e => !e.includes('favicon') && !/[45]\d\d/.test(e));
  if (fatal.length) console.log('Errors:', fatal);
  expect(fatal).toHaveLength(0);
});
