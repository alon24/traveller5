import { test, expect } from '@playwright/test';

test('app loads and home screen is visible', async ({ page }) => {
  // Use mobile viewport so the header (lg:hidden) is visible
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173');

  // App shell renders
  await expect(page.locator('#root')).not.toBeEmpty();

  // Header title is visible
  await expect(page.getByRole('banner').getByText('TransitIL')).toBeVisible({ timeout: 10000 });

  // Quick action buttons are present on the home screen
  const main = page.locator('main');
  await expect(main.getByText('Plan a Trip')).toBeVisible();
  await expect(main.getByText('Nearby Stops')).toBeVisible();
  await expect(main.getByText('Train Times')).toBeVisible();
  await expect(main.getByText('My Alerts')).toBeVisible();

  // Bottom nav is present
  await expect(page.getByRole('navigation')).toBeVisible();
});
