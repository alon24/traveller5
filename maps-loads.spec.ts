import { test, expect } from '@playwright/test';

test('Google Maps loads without error', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173');

  // Navigate to the Map page where Google Maps is rendered
  await page.goto('http://localhost:5173/map');

  // Wait for the map canvas/iframe to appear — Google Maps renders a div with gm-style
  await expect(page.locator('.gm-style')).toBeVisible({ timeout: 15000 });

  // The "This page can't load Google Maps correctly" error shows as an iframe or div with specific text
  const errorBanner = page.getByText(/this page can.t load google maps correctly/i);
  await expect(errorBanner).toHaveCount(0);
});
