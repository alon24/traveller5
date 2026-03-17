import { test, expect } from '@playwright/test';

test('search for Proxmox on Google', async ({ page }) => {
  await page.goto('https://www.google.com');

  // Dismiss "Switch to Chrome" dialog if present
  const dismissBtn = page.locator('button').filter({ hasText: /not interested|לא מעניין|no thanks/i });
  if (await dismissBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await dismissBtn.first().click();
  }

  // Accept cookies/consent if prompted
  const consentButton = page.locator('button').filter({ hasText: /accept all|i agree/i });
  if (await consentButton.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await consentButton.first().click();
  }

  // Use the search combobox (works regardless of language)
  const searchBox = page.locator('textarea[name="q"], input[name="q"]');
  await searchBox.fill('Proxmox');
  await searchBox.press('Enter');

  await expect(page).toHaveURL(/search/, { timeout: 15000 });
});
