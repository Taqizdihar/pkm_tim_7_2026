import { test, expect, type Locator, type Page } from '@playwright/test';
import { memberFixture } from './memberFixture';

test.use({ hasTouch: true });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', error => list.push(error.message));
  await page.route('**/api/v1/catalog', route => route.fulfill({ status: 503, json: {} }));
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function rest(sheet: Locator) {
  await sheet.evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  await expect.poll(() => sheet.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42)).toBe(0);
}

async function dragHandle(page: Page, distance = 180, horizontal = 0) {
  const handle = page.getByRole('button', { name: 'Tutup panel', exact: true });
  const bounds = (await handle.boundingBox())!;
  const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + horizontal, y + distance, { steps: 8 });
  await page.mouse.up();
}

async function touchDrag(page: Page, x: number, y: number, dx: number, dy: number, cancel = false) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 4, radiusY: 4 }] });
  for (let step = 1; step <= 8; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 8, y: y + dy * step / 8, radiusX: 4, radiusY: 4 }] });
  }
  const offset = await page.getByRole('dialog').evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42);
  await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  await cdp.detach();
  return offset;
}

for (const width of [320, 390]) test(`all member bottom sheets slide in and drag down at ${width}px`, async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(()=>{
    const animate=Element.prototype.animate;
    Element.prototype.animate=function(frames,options){
      if(this instanceof HTMLDialogElement)(this as any).__recordedFrames=frames;
      return animate.call(this,frames,options);
    };
  });
  const fixture = await memberFixture(page);
  await page.setViewportSize({ width, height: 844 });
  const cases = [
    ['beranda', 'Pilih jenis tanaman'], ['beranda', 'Pilih jenis ikan'], ['beranda', 'Pilih jenis ayam'],
    ['beranda', 'Buka perawatan Sorgum'], ['beranda', 'Panduan budidaya'], ['beranda', 'Cuaca tani'],
    ['jadwal', 'Tambah jadwal'], ['chat_ai', 'Lampirkan foto'],
    ['pengaturan', 'Bahasa Bahasa Indonesia'], ['pengaturan', 'Cara memakai Dewi Sri Pilihan jenis, perawatan, dan foto'],
    ['pengaturan', 'Tentang Dewi Sri Teman merawat kebun dan ternak'], ['pengaturan', 'Keluar ke layar awal'],
  ];
  for (const [screen, name] of cases) {
    await page.goto(`/?screen=${screen}`);
    const opener = page.getByRole('button', { name, exact: true });
    await opener.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toHaveAttribute('data-sheet', 'true');
    // Record the real call: a busy browser can finish the 280 ms entrance before inspection.
    const entrance = await sheet.evaluate(element => (element as any).__recordedFrames as Keyframe[]);
    expect(entrance[0]?.transform?.toString().startsWith('translateY('), name).toBe(true);
    await rest(sheet);
    const bounds = (await sheet.boundingBox())!;
    expect(Math.abs(bounds.y + bounds.height - 844), name).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
    if (width === 390 && ['Pilih jenis tanaman', 'Buka perawatan Sorgum', 'Lampirkan foto'].includes(name))
      await page.screenshot({ path: `.artifacts/sheet-${screen}-${name === 'Pilih jenis tanaman' ? 'species' : name === 'Lampirkan foto' ? 'photo' : 'care'}.png` });
    await dragHandle(page);
    await expect(sheet).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  }
  fixture.states.a.chats.push({ id: '1', title: 'Percakapan fixture', snippet: 'Panduan', messages: [], updatedAt: new Date().toISOString() });
  await page.goto('/?screen=chat_history');
  await page.getByRole('button', { name: 'Hapus percakapan Percakapan fixture' }).click();
  await rest(page.getByRole('dialog'));
  await dragHandle(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(fixture.states.a.chats).toHaveLength(1);
});

test('a short pull springs back without clicking the handle; keyboard and backdrop still dismiss', async ({ page }) => {
  await memberFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?screen=beranda');
  const opener = page.getByRole('button', { name: 'Pilih jenis tanaman', exact: true });
  await opener.click();
  const sheet = page.getByRole('dialog');
  await rest(sheet);
  await dragHandle(page, 20);
  await expect(sheet).toBeVisible();
  await rest(sheet);
  await dragHandle(page, 5, 80);
  await expect(sheet).toBeVisible();
  await rest(sheet);
  const search = page.getByRole('searchbox', { name: 'Cari jenis tanaman' });
  await search.fill('kangkung');
  await expect(search).toHaveValue('kangkung');
  await page.getByRole('button', { name: 'Tutup panel', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await rest(sheet);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await opener.click();
  await rest(sheet);
  await page.mouse.click(5, 5);
  await expect(sheet).toHaveCount(0);
});

test('real touch can pull the handle and unscrolled content, with cancellation and horizontal gestures preserved', async ({ page }) => {
  await memberFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?screen=beranda');
  const opener = page.getByRole('button', { name: 'Cuaca tani', exact: true });
  const sheet = page.getByRole('dialog');
  await opener.click();
  await rest(sheet);
  let handle = (await page.getByRole('button', { name: 'Tutup panel', exact: true }).boundingBox())!;
  expect(await touchDrag(page, 195, handle.y + 22, 0, 90, true)).toBeGreaterThan(40);
  await rest(sheet);
  await touchDrag(page, 195, handle.y + 22, 80, 5);
  await rest(sheet);
  expect(await touchDrag(page, 195, handle.y + 22, 0, 180)).toBeGreaterThan(100);
  await expect(sheet).toHaveCount(0);
  await opener.click();
  await rest(sheet);
  const heading = (await sheet.getByRole('heading', { name: 'Rencanakan perawatan' }).boundingBox())!;
  expect(await touchDrag(page, heading.x + 10, heading.y + heading.height / 2, 0, 180)).toBeGreaterThan(100);
  await expect(sheet).toHaveCount(0);
});

test('long content scrolls normally and the handle can dismiss a scrolled sheet', async ({ page }) => {
  await memberFixture(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/?screen=beranda');
  await page.getByRole('button', { name: 'Pilih jenis tanaman', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await rest(sheet);
  const bounds = (await sheet.boundingBox())!;
  await touchDrag(page, bounds.x + 8, bounds.y + bounds.height * .7, 0, -140);
  await expect.poll(() => sheet.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await rest(sheet);
  const offset = await touchDrag(page, bounds.x + 8, bounds.y + bounds.height * .4, 0, 25);
  expect(offset).toBe(0);
  await expect(sheet).toBeVisible();
  await dragHandle(page);
  await expect(sheet).toHaveCount(0);
});

test('reduced motion skips automatic animations while drag dismissal still works', async ({ page }) => {
  await memberFixture(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?screen=beranda');
  await page.getByRole('button', { name: 'Cuaca tani', exact: true }).click();
  const sheet = page.getByRole('dialog');
  expect(await sheet.evaluate(element => element.getAnimations().length)).toBe(0);
  await dragHandle(page);
  await expect(sheet).toHaveCount(0);
});

test('desktop dialogs stay centered; resizing a dragged sheet resets its transform', async ({ page }) => {
  await memberFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?screen=beranda');
  await page.getByRole('button', { name: 'Cuaca tani', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await rest(sheet);
  const handle = (await page.getByRole('button', { name: 'Tutup panel', exact: true }).boundingBox())!;
  await page.mouse.move(195, handle.y + 22); await page.mouse.down(); await page.mouse.move(195, handle.y + 72, { steps: 5 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.mouse.up();
  await expect(sheet).toHaveAttribute('data-sheet', 'false');
  await expect(page.getByRole('button', { name: 'Tutup panel', exact: true })).toBeHidden();
  await rest(sheet);
  const bounds = (await sheet.boundingBox())!;
  expect(Math.abs(bounds.y + bounds.height / 2 - 450)).toBeLessThan(2);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('CMS member sheet cannot be dragged away while saving', async ({ page }) => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/v1/admin/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (path.endsWith('/auth/me')) data = { id: '9', name: 'Fixture admin', csrfToken: 'fixture' };
    else if (route.request().method() === 'POST') { await pending; data = { id: '10' }; }
    else data = { items: [], total: 0 };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/members');
  await page.getByRole('button', { name: 'Tambah Anggota KWT', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await rest(sheet);
  await page.getByLabel('Nama lengkap').fill('Fixture');
  await page.getByLabel('Nomor HP', { exact: true }).fill('081234567890');
  await page.getByLabel('Kata sandi awal', { exact: true }).fill('awal12');
  await page.getByLabel('Konfirmasi kata sandi', { exact: true }).fill('awal12');
  await page.getByRole('button', { name: 'Simpan anggota', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tutup panel', exact: true })).toBeDisabled();
  await dragHandle(page);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeVisible();
  await rest(sheet);
  finish();
  await expect(sheet).toHaveCount(0);
});
