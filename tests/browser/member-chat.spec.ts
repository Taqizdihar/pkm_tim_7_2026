import {test,expect,type Page} from '@playwright/test';
import {memberFixture} from './memberFixture';
const errors=new WeakMap<Page,string[]>();
test.beforeEach(({page})=>{const list:string[]=[];errors.set(page,list);page.on('pageerror',e=>list.push(e.message));});
test.afterEach(({page})=>expect(errors.get(page)).toEqual([]));

test('consultation saves server messages, restores on refresh, attaches a photo and deletes history',async({page})=>{
  await memberFixture(page);await page.route('**/api/v1/catalog',r=>r.fulfill({status:503,json:{}}));
  await page.goto('/?screen=chat_ai');await page.getByLabel('Tulis pertanyaan',{exact:true}).fill('Bagaimana merawat kangkung?');await page.getByRole('button',{name:'Kirim pertanyaan'}).click();
  await expect(page.getByText('Panduan umum: periksa kelembapan tanah.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Riwayat',exact:true}).click();await expect(page.getByRole('button',{name:/Buka percakapan/})).toHaveCount(1);await page.reload();await page.getByRole('button',{name:/Buka percakapan/}).click();
  await expect(page.getByText('Bagaimana merawat kangkung?',{exact:true})).toBeVisible();
  await page.locator('input[type=file]').first().setInputFiles('public/assets/generated/kangkung.png');await page.getByLabel('Jenis tanaman atau hewan',{exact:true}).selectOption('kangkung');await page.getByRole('button',{name:'Lihat panduan lokal'}).click();
  await expect(page.locator('.consultation-message')).toHaveCount(4);
  await page.getByRole('button',{name:'Riwayat',exact:true}).click();await page.getByRole('button',{name:/Hapus percakapan/}).click();await page.getByRole('button',{name:'Ya, hapus'}).click();await expect(page.getByRole('heading',{name:'Belum ada percakapan'})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('dewi_sri_chat_history'))).toBeNull();
});
