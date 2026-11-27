import { test, expect } from '@playwright/test';
import { memberFixture } from './memberFixture';

test('a draft reflows across Responsive-mode breakpoints without being lost or clipped', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await memberFixture(page);
  await page.route('**/api/v1/catalog', route => route.fulfill({ status: 503, json: {} }));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/?screen=chat_ai');
  const draft = 'Daun kangkung mulai kuning sejak kemarin.';
  const field = page.getByRole('textbox', { name: 'Tulis pertanyaan', exact: true });
  await field.fill(draft);
  for (const width of [320, 360, 393, 412, 430, 600, 601, 767, 768, 820, 860, 861, 1023, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(field).toHaveValue(draft);
    await expect.poll(() => field.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
    await expect.poll(() => page.evaluate(() => {
      const composer = document.querySelector('.consultation-composer')!.getBoundingClientRect();
      const nav = document.querySelector('.app-nav')!.getBoundingClientRect();
      return document.documentElement.scrollWidth <= innerWidth + 1 && composer.left >= 0 && composer.right <= innerWidth &&
        (innerWidth >= 1024 ? composer.left >= nav.right : composer.bottom <= nav.top + 1);
    })).toBe(true);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await expect.poll(() => field.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = '18px'; });
  await expect(field).toHaveValue(draft);
  await expect.poll(() => field.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: '.artifacts/responsive-2026-11-27/resized-draft-360.png' });
  expect(errors).toEqual([]);
});
