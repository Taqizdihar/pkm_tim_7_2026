import { expect, test } from '@playwright/test';
import {memberFixture} from './memberFixture';

const screens = ['beranda', 'pet_saya', 'jadwal', 'jurnal', 'chat_ai', 'chat_history', 'pengaturan', 'rank_petani', 'edit_profile'];

for (const width of [320, 768, 1440]) test(`member screens reflow at ${width}px`, async ({ page }) => {
  await memberFixture(page);
  await page.route('**/api/v1/catalog', route => route.fulfill({ status: 503, json: { error: 'fixture offline' } }));
  await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
  for (const screen of screens) {
    await page.goto(`/?screen=${screen}`);
    await expect(page.locator('.garden-shell')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), screen).toBe(true);
    if (screen === 'chat_ai') {
      const overlap = await page.evaluate(() => {
        const a = document.querySelector('.consultation-composer')!.getBoundingClientRect();
        const b = document.querySelector('.app-nav')!.getBoundingClientRect();
        return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      });
      expect(overlap).toBe(0);
    }
  }
  await page.goto('/?screen=beranda');
  if (width === 320) await expect(page.getByRole('button', { name: /suara/ })).toBeVisible();
  const picker = page.getByRole('button', { name: 'Pilih Pet' });
  await picker.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(picker).toBeFocused();
  await page.locator('.app-nav').getByRole('button', { name: 'Jadwal' }).click();
  await expect(page.getByRole('heading', { name: 'Jadwal perawatan' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Kebun hari ini' })).toBeVisible();
  await page.locator('.app-nav').getByRole('button', { name: 'Profil' }).click();
  await page.locator('.sc-text-options').getByRole('button', { name: /Besar/ }).click();
  await page.locator('.app-nav').getByRole('button', { name: 'Beranda' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
