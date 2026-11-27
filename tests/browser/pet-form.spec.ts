import {test,expect,type Page} from '@playwright/test';
import {memberFixture,fixtureCatalog} from './memberFixture';

async function setup(page:Page){
  const fixture=await memberFixture(page);
  await page.route('**/api/v1/catalog',route=>route.fulfill({json:{success:true,data:fixtureCatalog}}));
  await page.goto('/?screen=pet_saya');
  await page.getByRole('button',{name:'Tambah Pet',exact:true}).click();
  return fixture;
}

test('draft preview follows catalog choices and individual mode saves quantity one without an input',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const fixture=await setup(page),dialog=page.getByRole('dialog'),preview=dialog.getByRole('region',{name:'Pratinjau Pet'});
  await expect(preview.getByRole('img',{name:'Sorgum',exact:true})).toHaveAttribute('src','/assets/generated/sorgum.webp');
  await expect(dialog.getByRole('spinbutton')).toHaveCount(0);
  await expect(preview).toContainText('Individual · 1 tanaman');
  await dialog.getByRole('combobox',{name:'Jenis budidaya',exact:true}).selectOption('sawi');
  await expect(preview.getByRole('img',{name:'Sawi',exact:true})).toHaveAttribute('src','/assets/generated/sawi.webp');
  await dialog.getByLabel('Nama Pet',{exact:true}).fill('Sawi Teras');
  await expect(preview.locator('strong')).toHaveText('Sawi Teras');
  await dialog.getByRole('combobox',{name:'Kategori',exact:true}).selectOption('koki');
  await expect(preview.getByRole('img',{name:'Lele',exact:true})).toHaveAttribute('src','/assets/generated/lele.webp');
  await dialog.getByRole('radio',{name:'Kelompok budidaya'}).check();
  const quantity=dialog.getByRole('spinbutton',{name:'Jumlah ekor',exact:true});
  await quantity.fill('12');await expect(preview).toContainText('Kelompok · 12 ekor');
  await dialog.getByRole('combobox',{name:'Kategori',exact:true}).selectOption('kuning');
  await expect(preview.getByRole('img',{name:'Ayam petelur',exact:true})).toHaveAttribute('src','/assets/generated/ayam-petelur.webp');
  await expect(preview).toContainText('Kelompok · 12 ekor');
  await dialog.getByRole('radio',{name:'Satu tanaman / hewan',exact:true}).check();
  await expect(dialog.getByRole('spinbutton')).toHaveCount(0);await expect(preview).toContainText('Individual · 1 ekor');
  expect(fixture.states.a.cultivations).toHaveLength(3);
  await dialog.getByLabel('Nama Pet',{exact:true}).fill('Ayam Depan');await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button',{name:'Tambahkan Pet',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(fixture.states.a.cultivations.at(-1)).toMatchObject({nickname:'Ayam Depan',petMode:'individual',quantity:1});
});

test('edit preview reflects draft mode and quantity while preserving the owned Pet identity',async({page})=>{
  const fixture=await memberFixture(page);Object.assign(fixture.states.a.cultivations[0],{petMode:'group',quantity:8});
  await page.route('**/api/v1/catalog',route=>route.fulfill({json:{success:true,data:fixtureCatalog}}));
  await page.goto('/?screen=pet_saya');await page.getByRole('button',{name:/Sorgum/}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Ubah Pet',exact:true}).click();
  const dialog=page.getByRole('dialog'),preview=dialog.getByRole('region',{name:'Pratinjau Pet'});
  await expect(preview).toContainText('Kelompok · 8 tanaman');await dialog.getByLabel('Jumlah tanaman',{exact:true}).fill('5');await expect(preview).toContainText('Kelompok · 5 tanaman');
  await dialog.getByRole('radio',{name:'Satu tanaman / hewan',exact:true}).check();await expect(dialog.getByRole('spinbutton')).toHaveCount(0);await expect(preview).toContainText('Individual · 1 tanaman');
  await dialog.getByRole('button',{name:'Simpan perubahan'}).click();await expect(page.getByRole('dialog').getByRole('heading',{name:'Sorgum',exact:true})).toBeVisible();
  expect(fixture.states.a.cultivations[0]).toMatchObject({id:'1',petMode:'individual',quantity:1,metrics:{stat1:40,stat2:40,stat3:40}});
});

test('a new catalog species without media has a correctly named draft preview',async({page})=>{
  await memberFixture(page);
  const catalog={...fixtureCatalog,species:[...fixtureCatalog.species,{slug:'jenis-tambahan',name:'Jenis tambahan',categoryId:'1',shortNote:'',media:[],careActions:[]}]};
  await page.route('**/api/v1/catalog',route=>route.fulfill({json:{success:true,data:catalog}}));
  await page.goto('/?screen=pet_saya');await page.getByRole('button',{name:'Tambah Pet',exact:true}).click();
  const dialog=page.getByRole('dialog'),preview=dialog.getByRole('region',{name:'Pratinjau Pet'});
  await dialog.getByRole('combobox',{name:'Jenis budidaya',exact:true}).selectOption('jenis-tambahan');
  await expect(preview.locator('.pet-visual__fallback')).toContainText('Jenis tambahan');await expect(preview.getByRole('img')).toHaveCount(0);
});

for(const width of [320,390,768,1440])test(`Pet form preview fits at ${width}px with enlarged text`,async({page})=>{
  await page.setViewportSize({width,height:900});await setup(page);
  const dialog=page.getByRole('dialog'),preview=dialog.getByRole('region',{name:'Pratinjau Pet'});
  await expect(preview.getByRole('img')).toBeVisible();await preview.scrollIntoViewIfNeeded();
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:`.artifacts/pet-form-preview/preview-${width}.png`});
  await page.evaluate(()=>{document.documentElement.style.fontSize='20px';});
  await dialog.getByLabel('Nama Pet',{exact:true}).fill('Tanaman di pekarangan belakang bersama kelompok wanita tani');
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await dialog.getByRole('radio',{name:'Kelompok budidaya'}).check();await expect(dialog.getByRole('spinbutton',{name:'Jumlah tanaman',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});
