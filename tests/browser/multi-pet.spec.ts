import {test,expect,type Page} from '@playwright/test';
import {memberFixture,fixturePet,fixtureCatalog} from './memberFixture';

async function setup(page:Page,empty=false){const fixture=await memberFixture(page,true,{empty});await page.route('**/api/v1/catalog',r=>r.fulfill({json:{success:true,data:fixtureCatalog}}));return fixture;}
async function addPet(page:Page,name:string,quantity=1){
  await page.getByRole('button',{name:'Tambah Pet',exact:true}).first().click();const dialog=page.getByRole('dialog');
  await dialog.getByRole('combobox',{name:'Jenis budidaya',exact:true}).selectOption('sawi');await dialog.getByLabel('Nama Pet',{exact:true}).fill(name);
  if(quantity!==1){await dialog.getByRole('radio',{name:'Kelompok budidaya'}).check();await dialog.getByLabel('Jumlah tanaman',{exact:true}).fill(String(quantity));}
  await dialog.getByLabel('Lokasi (opsional)',{exact:true}).fill('Depan rumah');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Tambahkan Pet',exact:true}).click();await expect(dialog).toHaveCount(0);
}
test('empty garden, explicit same-species creation, selection, refresh, edit, archive and restore',async({page})=>{
  const fixture=await setup(page,true);await page.setViewportSize({width:360,height:800});const requests:string[]=[];page.on('request',r=>{if(r.method()==='POST')requests.push(new URL(r.url()).pathname);});
  await page.goto('/?screen=beranda');await expect(page.getByRole('heading',{name:'Belum ada Pet tanaman'})).toBeVisible();
  await page.getByRole('button',{name:'Ikan',exact:true}).click();await expect(page.getByRole('heading',{name:'Belum ada Pet ikan'})).toBeVisible();expect(fixture.states.a.cultivations).toHaveLength(0);expect(requests).toEqual([]);
  await page.getByRole('button',{name:'Tanaman',exact:true}).click();await addPet(page,'Sawi Depan');await expect(page.getByRole('heading',{name:'Sawi Depan',exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Pet Saya/}).click();await addPet(page,'Sawi Belakang',8);await expect(page.getByRole('button',{name:/Sawi Belakang/})).toBeVisible();expect(fixture.states.a.cultivations).toHaveLength(2);
  await page.reload();await page.getByRole('button',{name:/Sawi Depan/}).click();await page.getByRole('dialog').getByRole('button',{name:'Ubah Pet',exact:true}).click();await page.getByLabel('Nama Pet',{exact:true}).fill('Sawi Teras');await page.getByRole('button',{name:'Simpan perubahan'}).click();await expect(page.getByRole('dialog').getByRole('heading',{name:'Sawi Teras'})).toBeVisible();
  const id=fixture.states.a.cultivations[0].id;await page.getByRole('button',{name:'Arsipkan Pet',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Arsipkan Pet',exact:true}).click();expect(fixture.states.a.cultivations[0].id).toBe(id);
  await page.getByRole('button',{name:'Arsip',exact:true}).click();await page.getByRole('button',{name:/Sawi Teras/}).click();await page.getByRole('button',{name:'Pulihkan Pet',exact:true}).click();expect(fixture.states.a.cultivations[0].status).toBe('active');expect(fixture.states.a.totalCareCount).toBe(0);
  await page.goto('/?screen=beranda');await page.getByRole('button',{name:'Pilih Pet',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/Sawi Teras/}).click();await expect(page.getByRole('heading',{name:'Sawi Teras',exact:true})).toBeVisible();
});
test('legacy review keeps the original Pet and blocks care until confirmed',async({page})=>{
  const fixture=await setup(page);fixture.states.a.cultivations[0].ownershipConfirmed=false;await page.goto('/?screen=beranda');await expect(page.getByRole('button',{name:'Rawat',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Perlu konfirmasi · Tinjau Pet'}).click();await page.getByRole('dialog').getByRole('button',{name:'Tinjau Pet',exact:true}).click();await page.getByLabel('Nama Pet',{exact:true}).fill('Sorgum asli');await page.getByRole('dialog').getByRole('checkbox').check();await page.getByRole('button',{name:'Konfirmasi Pet',exact:true}).click();
  expect(fixture.states.a.cultivations[0].id).toBe('1');expect(fixture.states.a.totalCareCount).toBe(0);await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Rawat',exact:true})).toBeEnabled();
});
test('bulk care selects one species, distinguishes records and quantity, and groups journal snapshots',async({page})=>{
  const f=await setup(page,true);f.states.a.cultivations=[fixturePet('11','petelur',{nickname:'Kandang Belakang',petMode:'group',quantity:12}),fixturePet('12','petelur',{nickname:'Ayam Satu'}),fixturePet('13','petelur',{nickname:'Ayam Dua'}),fixturePet('14','petelur',{nickname:'Belum dikonfirmasi',ownershipConfirmed:false}),fixturePet('15','sawi')];
  await page.setViewportSize({width:390,height:844});await page.goto('/?screen=pet_saya');await page.getByRole('button',{name:'Rawat Bersama',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByText('Belum dikonfirmasi',{exact:true})).toHaveCount(0);await dialog.getByRole('button',{name:'Pilih semua jenis ini'}).click();await expect(dialog.getByText('3 Pet dipilih',{exact:true})).toBeVisible();await expect(dialog.locator('.pet-bulk-summary')).toContainText('Mewakili 14 ekor');
  await dialog.getByLabel('Saya sudah melakukan beri makan untuk semua Pet yang dipilih.').check();await dialog.getByRole('button',{name:'Catat beri makan bersama'}).click();await expect(dialog.getByText(/3 Pet, mewakili 14 ekor/)).toBeVisible();expect(f.states.a.totalCareCount).toBe(1);expect(f.states.a.careRecords[0].entries).toHaveLength(3);
  f.states.a.cultivations[0].nickname='Nama setelah perawatan';f.states.a.cultivations[0].quantity=10;
  await page.goto('/?screen=jurnal');await page.getByText('Lihat 3 Pet yang dirawat').click();await expect(page.getByText('Kandang Belakang',{exact:true})).toBeVisible();await expect(page.locator('.pet-journal-entry li').filter({hasText:'Kandang Belakang'})).toContainText('12 ekor');
});
test('failed care preserves retry UUID and shows success only after persistence; schedules address one Pet',async({page})=>{
  const f=await setup(page),ids:string[]=[];let fail=true;
  await page.route('**/api/v1/member/cultivations/1/care-actions',async r=>{ids.push(r.request().postDataJSON().client_event_id);if(fail){fail=false;return r.fulfill({status:503,json:{error:{message:'Penyimpanan belum berhasil.'}}});}return r.fallback();});
  await page.goto('/?screen=beranda');await page.getByRole('button',{name:'Rawat',exact:true}).click();const action=page.getByRole('button',{name:/Sudah siram/});await action.click();await expect(page.getByRole('dialog').getByText('Penyimpanan belum berhasil.',{exact:true})).toBeVisible();await expect(page.getByText('Siram berhasil dicatat.',{exact:true})).toHaveCount(0);await action.click();await expect(page.getByText('Siram berhasil dicatat.',{exact:true})).toBeVisible();expect(ids[0]).toBe(ids[1]);expect(f.states.a.totalCareCount).toBe(1);
  await page.goto('/?screen=jadwal');await page.getByRole('button',{name:'Tambah jadwal',exact:true}).first().click();await page.getByRole('dialog').getByRole('combobox',{name:'Pet',exact:true}).selectOption('1');await page.getByLabel('Waktu setiap hari (WIB)',{exact:true}).fill('08:15');await page.getByRole('button',{name:'Simpan jadwal'}).click();await expect(page.getByRole('heading',{name:'Siram · Sorgum'})).toBeVisible();expect(f.states.a.schedules[0].cultivationId).toBe('1');
});
for(const width of [320,341,360,390,430,768,1024,1366,1440,1920])test(`multi-Pet screens and sheets reflow at ${width}px`,async({page})=>{
  test.setTimeout(60000);
  const f=await setup(page);f.states.a.cultivations.push(fixturePet('91','sawi',{nickname:'Sawi kebun bersama dengan nama panjang untuk uji tampilan',petMode:'group',quantity:120,locationLabel:'Pekarangan belakang rumah kelompok wanita tani'}));await page.setViewportSize({width,height:width<768?844:1000});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(const screen of ['beranda','pet_saya','jadwal','jurnal','chat_ai']){await page.goto(`/?screen=${screen}`);await expect(page.locator('.garden-shell')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),screen).toBe(true);if(screen==='pet_saya'){await page.getByRole('button',{name:/Sawi kebun bersama/}).click();await expect(page.getByRole('dialog')).toBeVisible();expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.keyboard.press('Escape');}}
  await page.goto('/?screen=pet_saya');await page.getByRole('button',{name:'Tambah Pet',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();if([341,390,768,1440].includes(width))await page.screenshot({path:`.artifacts/multi-pet-review/form-${width}.png`});await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Rawat Bersama',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.keyboard.press('Escape');
  await page.evaluate(()=>document.documentElement.style.fontSize='20px');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if([341,390,768,1440].includes(width)){await page.goto('/?screen=beranda');await page.screenshot({path:`.artifacts/multi-pet-review/home-${width}.png`,fullPage:true});await page.goto('/?screen=pet_saya');await page.screenshot({path:`.artifacts/multi-pet-review/library-${width}.png`,fullPage:true});}expect(errors).toEqual([]);
});
test('missing Pet migration keeps general AI available and does not invent ownership',async({page})=>{const f=await setup(page,true);f.states.a.multiPetReady=false;await page.goto('/?screen=beranda');await expect(page.getByRole('heading',{name:'Pet sedang disiapkan'})).toBeVisible();await page.locator('.app-nav').getByRole('button',{name:'Tanya Tani'}).click();await expect(page.getByRole('textbox',{name:'Tulis pertanyaan',exact:true})).toBeVisible();expect(f.states.a.cultivations).toHaveLength(0);});
test('a missing catalog image renders the correct named neutral visual',async({page})=>{
  const f=await setup(page,true),pet=fixturePet('80','jenis-baru',{nickname:'Pet Baru'});pet.species.images={normal:'/assets/generated/missing-multi-pet-fixture.webp'};f.states.a.cultivations=[pet];
  await page.goto('/?screen=pet_saya');const card=page.getByRole('button',{name:/Pet Baru/});await expect(card.locator('.pet-visual__fallback')).toContainText('Jenis Baru');await expect(card.getByRole('img')).toHaveCount(0);expect(f.states.a.cultivations).toHaveLength(1);
});
