import { test, expect, type Page } from '@playwright/test';
import { memberFixture } from './memberFixture';

const sizes = [[360, 800], [393, 852], [412, 915], [430, 932], [667, 375], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const screens = ['beranda', 'jadwal', 'jurnal', 'chat_ai', 'chat_history', 'pengaturan', 'rank_petani', 'edit_profile'];
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', error => list.push(error.message));
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function separate(page: Page, selectors: string[]) {
  const intersections = await page.evaluate(selectors => {
    const boxes = selectors.map(selector => ({ selector, box: document.querySelector(selector)!.getBoundingClientRect() }));
    return boxes.flatMap((a, index) => boxes.slice(index + 1).filter(b =>
      Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 1 &&
      Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 1,
    ).map(b => `${a.selector} overlaps ${b.selector}`));
  }, selectors);
  expect(intersections).toEqual([]);
}
async function checkComposer(page: Page, width: number) {
  await separate(page, ['.consultation-heading', '.consultation-header-actions']);
  await separate(page, ['.consultation-composer-photo', '#consultation-question', '.consultation-send']);
  await separate(page, ['.consultation-composer', '.app-nav', '.consultation-header']);
  const field = page.getByRole('textbox', { name: 'Tulis pertanyaan', exact: true });
  expect(await field.evaluate(element => getComputedStyle(element).resize)).toBe('none');
  expect(await field.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  await field.fill('Daun kangkung mulai kuning sejak kemarin.');
  await expect.poll(() => field.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await field.fill('Ceritakan kondisi tanaman dan perawatan terakhir. '.repeat(20));
  await expect.poll(() => field.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(54);
  await separate(page, ['.consultation-composer-photo', '#consultation-question', '.consultation-send']);
  await separate(page, ['.consultation-composer', '.app-nav', '.consultation-header']);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => {
    const last = document.querySelector('.consultation-topics button:last-child')!.getBoundingClientRect();
    const composer = document.querySelector('.consultation-composer')!.getBoundingClientRect();
    return last.bottom <= composer.top - 8;
  })).toBe(true);
  if (width < 1024) {
    expect(await page.evaluate(() => {
      const form = document.querySelector('.consultation-composer')!.getBoundingClientRect();
      const nav = document.querySelector('.app-nav')!.getBoundingClientRect();
      return nav.top - form.bottom;
    })).toBeGreaterThanOrEqual(width < 768 ? 0 : 8);
  }
  await noOverflow(page);
}

async function adminFixture(page: Page) {
  const pets = ['Sorgum', 'Kangkung darat untuk kebun kelompok', 'Sawi', 'Selada'].map((name, i) => ({ id: String(i + 1), name, status: 'published', updated_at: '2026-11-27T00:00:00Z' }));
  await page.route('**/api/v1/admin/**', route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if (path.endsWith('/auth/me')) data = { id: '9', name: 'Layout fixture', csrfToken: 'fixture' };
    else if (path.endsWith('/dashboard')) data = { species: 11, categories: 6, published: 11, draft: 0, guides: 0, recent: pets };
    else if (path.endsWith('/members')) data = { items: [{ id: '10', name: 'Anggota dengan nama lengkap untuk pengujian tampilan', phone_number: '081234567890', username: 'anggota.fixture', email: 'anggota.fixture@example.test', status: 'active', must_change_password: 1, last_login_at: null, created_at: '2026-11-27T00:00:00Z' }], total: 1 };
    else if (path.endsWith('/species')) data = pets;
    else if (path.endsWith('/categories')) data = [{ id: '1', name: 'Tanaman', is_active: 1 }];
    else throw new Error(`Unexpected layout fixture ${path}`);
    return route.fulfill({ json: { success: true, data } });
  });
}

test('composer follows a taller navigation bar and visual viewport changes', async ({ page }) => {
  await memberFixture(page);
  await page.route('**/api/v1/catalog', route => route.fulfill({ status: 503, json: {} }));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/?screen=chat_ai');
  const field = page.getByRole('textbox', { name: 'Tulis pertanyaan', exact: true });
  await field.fill('Daun tanaman mulai menguning. '.repeat(20));
  await page.addStyleTag({ content: '.app-nav__item { font-size: 24px; line-height: 1.5; }' });
  await expect.poll(() => page.evaluate(() => {
    const nav = document.querySelector('.app-nav')!.getBoundingClientRect();
    const form = document.querySelector('.consultation-composer')!.getBoundingClientRect();
    return Math.abs(nav.top - form.bottom) < 1;
  })).toBe(true);
  await field.focus();
  // Emulate the visual-viewport signal from a keyboard without using a real device.
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, value: 420 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect.poll(() => page.locator('.consultation-composer').evaluate(element => Math.round(element.getBoundingClientRect().bottom))).toBe(408);
  await page.evaluate(() => {
    Reflect.deleteProperty(window.visualViewport!, 'height');
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect.poll(() => page.evaluate(() => {
    const nav = document.querySelector('.app-nav')!.getBoundingClientRect();
    const form = document.querySelector('.consultation-composer')!.getBoundingClientRect();
    return Math.abs(nav.top - form.bottom) < 1;
  })).toBe(true);
});

for (const [width, height] of sizes) test(`member and CMS layouts have no collisions at ${width}×${height}`, async ({ page }) => {
  test.setTimeout(120000);
  const fixture = await memberFixture(page);
  await page.route('**/api/v1/catalog', route => route.fulfill({ status: 503, json: {} }));
  await page.setViewportSize({ width, height });
  for (const screen of screens) {
    await page.goto(`/?screen=${screen}`);
    await expect(page.locator('.garden-shell')).toBeVisible();
    await noOverflow(page);
    if (screen === 'beranda') await separate(page, ['.gh-today', '.gh-journey', '.gh-main-actions', '.gh-more']);
    if (screen === 'chat_ai') await checkComposer(page, width);
  }
  fixture.states.a.profile.textSize = 'large';
  await page.goto('/?screen=chat_ai');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('18px');
  await checkComposer(page, width);
  await page.getByRole('textbox', { name: 'Tulis pertanyaan', exact: true }).fill('');
  await page.evaluate(() => scrollTo(0, 0));
  if ([360, 393, 412, 768, 1440].includes(width)) await page.screenshot({ path: `.artifacts/responsive-2026-11-27/chat-${width}.png` });
  await page.goto('/?screen=beranda');
  await expect(page.locator('.gh-today')).toBeVisible();
  await separate(page, ['.gh-today', '.gh-journey', '.gh-main-actions', '.gh-more']);
  await noOverflow(page);
  if ([768, 1440].includes(width)) await page.screenshot({ path: `.artifacts/responsive-2026-11-27/home-${width}.png`, fullPage: true });

  await adminFixture(page);
  await page.goto('/admin');
  await expect(page.locator('.admin-recent-list article')).toHaveCount(4);
  await noOverflow(page);
  expect(await page.locator('.admin-list-mark').evaluateAll(elements => elements.every(element => {
    const box = element.getBoundingClientRect(), icon = element.querySelector('svg')!.getBoundingClientRect();
    return box.width >= 40 && box.height >= 40 && Math.abs(box.x + box.width / 2 - icon.x - icon.width / 2) < 1 && Math.abs(box.y + box.height / 2 - icon.y - icon.height / 2) < 1;
  }))).toBe(true);
  for (const row of await page.locator('.admin-recent-list article').all()) {
    expect(await row.evaluate(element => {
      const icon = element.querySelector('.admin-list-mark')!.getBoundingClientRect(), copy = element.querySelector('.admin-list-copy')!.getBoundingClientRect();
      return copy.left >= icon.right + 8;
    })).toBe(true);
  }
  if ([360, 393, 412, 768, 1440].includes(width)) await page.screenshot({ path: `.artifacts/responsive-2026-11-27/admin-${width}.png`, fullPage: true });
  for (const path of ['/admin/members', '/admin/pets']) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    await noOverflow(page);
  }
});
