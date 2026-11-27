import { test, expect, type Page } from '@playwright/test';
import {memberFixture} from './memberFixture';

// Browser fixtures exercise the UI without writing any records to dewi_sri.
async function fixture(page:Page) {
  let loggedIn=false;
  const cats=[{id:'3',name:'Ayam',slug:'ayam',parent_id:null,habitat_key:'kandang',sort_order:3,is_active:1}];
  let pets:any[]=[];
  const guides:any[]=[];
  const actions=[{id:'1',name:'Beri makan',code:'beri_makan',icon_key:'feed',is_active:1},{id:'2',name:'Beri minum',code:'beri_minum',icon_key:'water',is_active:1},{id:'3',name:'Bersihkan kandang',code:'bersihkan_kandang',icon_key:'clean',is_active:1}];
  await page.route('**/api/v1/**',async route=>{
    const req=route.request(), url=new URL(req.url()), endpoint=url.pathname.replace('/api/v1','');
    const send=(data:any,status=200)=>route.fulfill({status,json:status===200||status===201?{success:true,data}:{success:false,error:{message:'Silakan masuk.'}}});
    if(endpoint==='/catalog') return send({categories:cats.map(c=>({id:c.id,parentId:c.parent_id,slug:c.slug,habitatKey:c.habitat_key})),species:pets.filter(p=>p.status==='published').map(p=>({...p,categoryId:p.category_id,shortNote:p.short_note,media:(p.media||[]).map((m:any)=>({stateKey:m.state_key,storagePath:m.storage_path})),careActions:(p.actions||[]).map((a:any)=>({...actions.find(x=>x.id===a.care_action_id),slotKey:a.slot_key,speciesDescription:a.description,iconKey:actions.find(x=>x.id===a.care_action_id)?.icon_key,effects:a.effect_config_json}))}))});
    if(endpoint==='/admin/auth/login'){loggedIn=true;return send({csrfToken:'fixture'});}
    if(!loggedIn)return send(null,401);
    if(endpoint==='/admin/auth/me')return send({id:'9',name:'Browser fixture',csrfToken:'fixture'});
    if(endpoint==='/admin/auth/logout'){loggedIn=false;return send({});}
    if(endpoint==='/admin/dashboard')return send({species:pets.length,categories:1,published:pets.filter(p=>p.status==='published').length,draft:pets.filter(p=>p.status==='draft').length,guides:0,recent:pets});
    for(const [resource,items] of Object.entries({categories:cats,'care-actions':actions,guides})){
      if(endpoint===`/admin/${resource}`&&req.method()==='POST'){
        const item={...req.postDataJSON(),id:String(200+items.length)};(items as any[]).push(item);return send({id:item.id},201);
      }
    }
    if(endpoint==='/admin/categories')return send(cats);
    if(endpoint==='/admin/care-actions')return send(actions);
    if(endpoint==='/admin/guides')return send(guides);
    if(endpoint==='/admin/settings')return send({app_name:'Dewi Sri',welcome_message:''});
    if(endpoint==='/admin/ai/status')return send({enabled:false,primary:'gemini',fallback:'local',localFallback:true,externalMode:'off',memberAccess:'authenticated_members',gemini:{configured:false,state:'not_configured',model:'gemini-3.5-flash-lite',keys:[]},rag:{state:'awaiting_contract'},lastTest:null});
    if(endpoint==='/admin/species'&&req.method()==='POST'){const p={...req.postDataJSON(),id:'101',actions:[],media:[]};pets.push(p);return send({id:p.id},201);}
    if(endpoint==='/admin/species')return send(pets);
    if(endpoint==='/admin/species/101'&&req.method()==='PATCH'){Object.assign(pets[0],req.postDataJSON());return send({id:'101'});}
    if(endpoint==='/admin/species/101/care-actions'){pets[0].actions=req.postDataJSON();return send({});}
    if(endpoint==='/admin/species/101')return send(pets[0]);
    if(endpoint==='/admin/media'){pets[0].media=[{id:'1',state_key:'normal',storage_path:'/assets/generated/ayam-petelur.webp'}];return send({},201);}
    return send({});
  });
}
async function login(page:Page){await page.goto('/admin/login');await page.getByLabel('Email',{exact:true}).fill('developer@example.test');await page.getByLabel('Kata sandi',{exact:true}).fill('Fixture-Password123!');await page.getByRole('button',{name:'Masuk',exact:true}).click();await expect(page.getByRole('heading',{name:'Dashboard katalog'})).toBeVisible();}

for(const width of [320,390,768,1440])test(`CMS responsive navigation and forms at ${width}px`,async({page})=>{
  await fixture(page);await page.setViewportSize({width,height:900});await login(page);
  for(const path of ['/admin','/admin/categories','/admin/care-actions','/admin/guides','/admin/settings','/admin/pets']){
    await page.goto(path);await expect(page.locator('main h1')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(path==='/admin/pets'){await page.getByRole('button',{name:'Tambah Pet',exact:true}).click();await expect(page.getByRole('heading',{name:'Tambah Pet',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  }
  await page.screenshot({path:`.artifacts/cms-${width}.png`,fullPage:true});
});

test('CMS publish workflow appears in the public app and archive keeps journal data',async({page})=>{
  test.setTimeout(90000);
  await fixture(page);await page.setViewportSize({width:390,height:844});await login(page);
  const member=await memberFixture(page);
  await page.goto('/admin/pets');await page.getByRole('button',{name:'Tambah Pet',exact:true}).click();
  await page.getByLabel('Nama',{exact:true}).fill('Ayam Jantan');await page.getByLabel('Slug',{exact:true}).fill('ayam-jantan');await page.getByRole('combobox',{name:'Kategori',exact:true}).selectOption('3');
  await page.getByRole('button',{name:'Simpan',exact:true}).click();await expect(page.getByRole('heading',{name:'Ilustrasi Pet'})).toBeVisible();
  await page.getByLabel('Gambar (maksimal 5 MB)').setInputFiles('public/assets/generated/ayam-petelur.png');await expect(page.getByAltText('Pratinjau ilustrasi yang dipilih')).toBeVisible();await page.getByRole('button',{name:'Unggah ilustrasi'}).click();
  await expect(page.getByText('Ilustrasi tersimpan.',{exact:true})).toBeVisible();
  for(let i=0;i<3;i++)await page.locator('fieldset').nth(i).getByRole('combobox').selectOption(String(i+1));
  await page.getByRole('button',{name:'Simpan tindakan'}).click();await expect(page.getByText('Tindakan tersimpan.',{exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('published');await page.getByRole('button',{name:'Simpan',exact:true}).click();
  await page.reload();await expect(page.getByRole('heading',{name:'Kelola Pet',exact:true})).toBeVisible();
  await page.goto('/?screen=beranda');await page.getByRole('button',{name:'Pilih jenis ayam',exact:true}).click();
  await page.getByRole('button',{name:'Ayam Jantan',exact:false}).click();await expect(page.getByRole('heading',{name:'Ayam Jantan',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Buka perawatan Ayam Jantan'}).click();await expect(page.getByRole('button',{name:/Beri makan/})).toBeVisible();await page.getByRole('button',{name:/Beri makan/}).click();
  await expect.poll(()=>member.states.a?.careRecords.length).toBe(1);
  const journal=JSON.stringify(member.states.a.careRecords);expect(journal).toContain('ayam-jantan');
  await page.goto('/admin/pets');await page.getByRole('button',{name:'Edit Ayam Jantan'}).click();await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('archived');await page.getByRole('button',{name:'Simpan',exact:true}).click();await expect(page.getByText('Perubahan tersimpan.',{exact:true})).toBeVisible();
  await page.goto('/?screen=beranda');await page.getByRole('button',{name:'Pilih jenis ayam',exact:true}).click();await expect(page.getByRole('dialog').getByRole('button',{name:'Ayam Jantan',exact:false})).toHaveCount(0);
  expect(JSON.stringify(member.states.a.careRecords)).toBe(journal);
  expect(await page.evaluate(()=>localStorage.getItem('dewi_sri_care_journal'))).toBeNull();
});


test('category, care action, guide and settings forms submit and logout returns to login',async({page})=>{
  test.setTimeout(90000);
  await fixture(page);await page.setViewportSize({width:320,height:844});await login(page);
  await page.goto('/admin/categories');await page.getByRole('button',{name:'Tambah kategori',exact:true}).click();
  await page.getByLabel('Nama',{exact:true}).fill('Kebun tambahan');await page.getByLabel('Slug',{exact:true}).fill('kebun-tambahan');
  await page.getByRole('combobox',{name:'Habitat',exact:true}).selectOption('kebun');await page.getByRole('button',{name:'Simpan',exact:true}).click();
  await expect(page.getByText('Perubahan tersimpan.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Edit Kebun tambahan',exact:true})).toBeVisible();
  await page.goto('/admin/care-actions');await page.getByRole('button',{name:'Tambah tindakan',exact:true}).click();
  await page.getByLabel('Nama',{exact:true}).fill('Periksa tanah');await page.getByLabel('Kode',{exact:true}).fill('periksa_tanah');await page.getByRole('button',{name:'Simpan',exact:true}).click();await expect(page.getByRole('button',{name:'Edit Periksa tanah',exact:true})).toBeVisible();
  await page.goto('/admin/pets');await page.getByRole('button',{name:'Tambah Pet',exact:true}).click();
  await page.getByLabel('Nama',{exact:true}).fill('Pet panduan');await page.getByLabel('Slug',{exact:true}).fill('pet-panduan');await page.getByRole('combobox',{name:'Kategori',exact:true}).selectOption('3');await page.getByRole('button',{name:'Simpan',exact:true}).click();await expect(page.getByRole('heading',{name:'Ilustrasi Pet'})).toBeVisible();
  await page.goto('/admin/guides');await page.getByRole('button',{name:'Tambah panduan',exact:true}).click();
  await page.getByRole('combobox',{name:'Pet',exact:true}).selectOption('101');await page.getByLabel('Judul',{exact:true}).fill('Panduan pertama');await page.getByLabel('Isi panduan',{exact:true}).fill('Periksa kandang setiap pagi.');await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('published');await page.getByRole('button',{name:'Simpan',exact:true}).click();await expect(page.getByRole('button',{name:'Edit Panduan pertama',exact:true})).toBeVisible();
  await page.goto('/admin/settings');await page.getByLabel('Pesan sambutan',{exact:true}).fill('Selamat datang di kebun.');await page.getByRole('button',{name:'Simpan pengaturan'}).click();await expect(page.getByText('Pengaturan tersimpan.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Buka menu administrasi'}).click();
  await page.getByRole('button',{name:'Keluar',exact:true}).click();await expect(page.getByRole('heading',{name:'Masuk administrator'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('CMS mobile menu is keyboard operable and restores focus',async({page})=>{
  await fixture(page);await page.setViewportSize({width:390,height:844});await login(page);
  await page.getByRole('link',{name:'Tambah Pet'}).click();
  await expect(page.getByRole('heading',{name:'Tambah Pet',exact:true})).toBeVisible();
  await page.goto('/admin');
  const toggle=page.getByRole('button',{name:'Buka menu administrasi'});
  await toggle.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#admin-navigation')).toBeVisible();
  await expect(page.locator('#admin-navigation a').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#admin-navigation')).toBeHidden();
  await expect(toggle).toBeFocused();
});
