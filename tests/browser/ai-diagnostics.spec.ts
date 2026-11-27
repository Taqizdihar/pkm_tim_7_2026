import {test,expect} from '@playwright/test';

test('CMS AI diagnostics stays read-only until an explicit quota-consuming test',async({page})=>{
  let calls=0;
  const status={enabled:true,primary:'gemini',fallback:'local',localFallback:true,externalMode:'demo',memberAccess:'authenticated_members',
    gemini:{configured:true,state:'not_tested',model:'gemini-3.5-flash-lite',keys:[{slot:'primary',state:'ready'},{slot:'fallback',state:'ready'}]},rag:{state:'awaiting_contract'},lastTest:null as any};
  await page.route('**/api/v1/admin/**',route=>{
    const p=new URL(route.request().url()).pathname;
    if(p.endsWith('/auth/me'))return route.fulfill({json:{success:true,data:{id:'9',name:'Fixture',csrfToken:'fixture'}}});
    if(p.endsWith('/settings'))return route.fulfill({json:{success:true,data:{app_name:'Dewi Sri',welcome_message:''}}});
    if(p.endsWith('/ai/test')){calls++;status.gemini.state='verified';status.lastTest={state:'verified',at:'2026-11-27T00:00:00Z',latencyMs:123,model:'fixture-model'};return route.fulfill({json:{success:true,data:status.lastTest}});}
    if(p.endsWith('/ai/status'))return route.fulfill({json:{success:true,data:status}});
    throw Error(p);
  });
  for(const width of [320,768,1440]){
    await page.setViewportSize({width,height:900});await page.goto('/admin/settings');
    await expect(page.getByRole('heading',{name:'Integrasi AI',exact:true})).toBeVisible();await expect(page.getByText('Semua anggota yang masuk',{exact:true})).toBeVisible();expect(calls).toBe(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  await page.getByRole('button',{name:'Uji Koneksi AI',exact:true}).click();await expect(page.getByText(/Uji terakhir: Berhasil diuji/)).toBeVisible();expect(calls).toBe(1);
  await page.screenshot({path:'.artifacts/tanya-tani-review/cms-ai-1440.png',fullPage:true});
});
