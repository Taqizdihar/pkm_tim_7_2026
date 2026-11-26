import {test,expect,type Page} from '@playwright/test';
import {memberFixture} from './memberFixture';
const errors=new WeakMap<Page,string[]>();
test.beforeEach(({page})=>{const list:string[]=[];errors.set(page,list);page.on('pageerror',e=>list.push(e.message));});
test.afterEach(({page})=>expect(errors.get(page)).toEqual([]));

const sizes=[[320,568],[360,800],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]];
for(const [width,height] of sizes)test(`member login and password form at ${width}×${height}`,async({page})=>{
  await memberFixture(page,false);await page.route('**/api/v1/catalog',r=>r.fulfill({status:503,json:{}}));
  await page.setViewportSize({width,height});await page.goto('/login');
  await expect(page.getByLabel('Nomor HP, username, atau email')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(width===390||width===1440)await page.screenshot({path:`.artifacts/member-login-${width}.png`,fullPage:true});
  await expect(page.getByRole('button',{name:/daftar|tanpa email|buat profil/i})).toHaveCount(0);
  await page.getByLabel('Nomor HP, username, atau email').fill('pertama');await page.getByLabel('Kata sandi',{exact:true}).fill('frasa awal cukup panjang');
  await page.getByRole('button',{name:'Tampilkan kata sandi',exact:true}).click();await expect(page.getByLabel('Kata sandi',{exact:true})).toHaveAttribute('type','text');
  await page.getByRole('button',{name:'Masuk',exact:true}).click();await expect(page).toHaveURL(/change-password/);await expect(page.getByRole('heading',{name:'Ubah Kata Sandi'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(width===390||width===1440)await page.screenshot({path:`.artifacts/member-password-${width}.png`,fullPage:true});
  await page.goto('/?screen=jadwal');await expect(page).toHaveURL(/change-password/);
  await page.getByLabel('Kata sandi saat ini',{exact:true}).fill('frasa awal cukup panjang');await page.getByLabel('Kata sandi baru',{exact:true}).fill('frasa pribadi lebih panjang');await page.getByLabel('Konfirmasi kata sandi baru',{exact:true}).fill('frasa pribadi lebih panjang');
  await page.getByRole('button',{name:'Simpan kata sandi',exact:true}).click();await expect(page.getByRole('heading',{name:'Kebun hari ini'})).toBeVisible();
});

test('closed routes, legacy data isolation, member switch, refresh and server failure',async({page})=>{
  await memberFixture(page,false);await page.route('**/api/v1/catalog',r=>r.fulfill({status:503,json:{}}));
  await page.addInitScript(()=>{localStorage.setItem('dewi_sri_profile',JSON.stringify({name:'Legacy pribadi',isLoggedIn:true}));localStorage.setItem('dewi_sri_points','999999');});
  for(const path of ['/?screen=beranda','/?screen=jadwal','/?screen=chat_ai','/register','/?screen=register','/?screen=forgot_password']){await page.goto(path);await expect(page).toHaveURL(/\/login$/);}
  const login=async(id:string)=>{await page.getByLabel('Nomor HP, username, atau email').fill(id);await page.getByLabel('Kata sandi',{exact:true}).fill('frasa anggota cukup panjang');await page.getByRole('button',{name:'Masuk',exact:true}).click();await expect(page.getByRole('heading',{name:'Kebun hari ini'})).toBeVisible();};
  await login('anggota.a');await expect(page.getByText('Legacy pribadi')).toHaveCount(0);
  await page.goto('/?screen=pengaturan');await expect(page.getByRole('heading',{name:'Anggota A'})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Anggota A'})).toBeVisible();
  await page.getByRole('button',{name:'Keluar ke layar awal',exact:true}).click();await page.getByRole('button',{name:'Ya, keluar'}).click();await expect(page).toHaveURL(/login/);
  await login('anggota.b');await page.goto('/?screen=pengaturan');await expect(page.getByRole('heading',{name:'Anggota B'})).toBeVisible();await expect(page.getByText('Anggota A',{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('dewi_sri_points'))).toBe('999999');
  await page.route('**/api/v1/auth/me',r=>r.fulfill({status:503,json:{error:{code:'DATABASE_UNAVAILABLE',message:'Database belum tersedia.'}}}));await page.reload();await expect(page.getByRole('heading',{name:'Akses belum tersedia'})).toBeVisible();await expect(page.locator('.app-nav')).toHaveCount(0);
});

for(const [width,height] of sizes)test(`CMS member forms and confirmation at ${width}×${height}`,async({page})=>{
  let items:any[]=[{id:'10',name:'Anggota Fixture',phone_number:'081234567890',username:null,email:null,status:'active',must_change_password:1,last_login_at:null,created_at:'2026-11-26T00:00:00Z'}];
  await page.route('**/api/v1/admin/**',async r=>{const p=new URL(r.request().url()).pathname,b=r.request().method()==='GET'?{}:r.request().postDataJSON();let data:any={};
    if(p.endsWith('/auth/me'))data={id:'9',name:'Admin Fixture',csrfToken:'admin-fixture'};
    else if(p.endsWith('/members')&&r.request().method()==='GET')data={items,total:items.length};
    else if(p.endsWith('/members')){items.push({...b,id:'11',must_change_password:1});data=items[1];}
    else if(p.endsWith('/status'))items[0].status=b.status;
    else if(p.endsWith('/reset-password'))expect(b).toMatchObject({must_change_password:true,password:'frasa sandi pengganti'});
    return r.fulfill({json:{success:true,data}});
  });
  await page.setViewportSize({width,height});await page.goto('/admin/members');await expect(page.getByRole('heading',{name:'Kelola Anggota KWT'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Tambah Anggota KWT'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByLabel('Nama lengkap').fill('Anggota Baru');await page.getByLabel('Nomor HP',{exact:true}).fill('085712345678');await page.getByLabel('Kata sandi awal',{exact:true}).fill('frasa awal anggota baru');await page.getByLabel('Konfirmasi kata sandi',{exact:true}).fill('frasa awal anggota baru');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('button',{name:'Simpan anggota'}).click();await expect(page.getByRole('heading',{name:'Anggota Baru'})).toBeVisible();
  await page.getByRole('button',{name:'Atur Ulang Kata Sandi',exact:true}).first().click();await page.getByLabel('Kata sandi baru',{exact:true}).fill('frasa sandi pengganti');await page.getByLabel('Konfirmasi kata sandi',{exact:true}).fill('frasa sandi pengganti');await page.getByRole('button',{name:'Simpan kata sandi'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Nonaktifkan anggota',exact:true}).first().click();await page.getByRole('button',{name:'Konfirmasi perubahan'}).click();await expect(page.getByRole('button',{name:'Aktifkan anggota',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Ubah anggota',exact:true}).first().click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  if(width===390||width===1440){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`.artifacts/members-${width}.png`,fullPage:true});}
});
