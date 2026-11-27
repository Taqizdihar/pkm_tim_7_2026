import {test,expect} from '@playwright/test';

test('admin reads bounded member Pets and separate dashboard totals at phone, tablet and desktop sizes',async({page})=>{
  const summary={ready:true,active:3,individual:2,group:1,archived:1,unconfirmed:1};let requestedPage='';
  await page.route('**/api/v1/admin/**',r=>{const url=new URL(r.request().url()),p=url.pathname;let data:unknown;
    if(p.endsWith('/auth/me'))data={id:'9',name:'Admin Fixture',csrfToken:'fixture'};
    else if(p.endsWith('/dashboard'))data={species:11,categories:6,published:10,draft:1,guides:2,recent:[],memberPets:summary};
    else if(p.endsWith('/members'))data={items:[{id:'7',name:'Anggota KWT',status:'active',must_change_password:0,petSummary:summary}],total:1};
    else if(p.endsWith('/members/7/cultivations')){requestedPage=url.searchParams.get('page')||'';data={summary,total:21,items:[{id:'9007199254740993',nickname:'Kandang Belakang untuk pengujian nama panjang',speciesName:'Ayam petelur',categoryName:'Ayam',petMode:'group',quantity:12,locationLabel:'Pekarangan belakang rumah',status:'active',ownershipConfirmed:true}],page:Number(requestedPage)};}
    else throw Error(`Unexpected monitoring fixture ${p}`);return r.fulfill({json:{success:true,data}});
  });
  for(const width of [320,768,1440]){
    await page.setViewportSize({width,height:900});await page.goto('/admin');await expect(page.getByText('Jenis dalam katalog',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Pet milik anggota'})).toBeVisible();
    await page.goto('/admin/members');await page.getByRole('button',{name:'Lihat Pet Anggota',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Pet · Anggota KWT'})).toBeVisible();await expect(dialog.getByText('Kandang Belakang untuk pengujian nama panjang',{exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:/rawat|ubah pet|hapus|foto|percakapan/i})).toHaveCount(0);await expect(dialog.getByText('Halaman 1 · 21 Pet')).toBeVisible();await dialog.getByRole('button',{name:'Berikutnya',exact:true}).click();await expect(dialog.getByText('Halaman 2 · 21 Pet')).toBeVisible();expect(requestedPage).toBe('2');expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
    if(width===320||width===1440)await page.screenshot({path:`.artifacts/multi-pet-review/admin-${width}.png`});await page.keyboard.press('Escape');
  }
});
