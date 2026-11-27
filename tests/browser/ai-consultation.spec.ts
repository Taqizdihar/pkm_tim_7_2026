import {test,expect,type Page} from '@playwright/test';
import {memberFixture} from './memberFixture';

const longAnswer='### Yang perlu diperiksa\n\n**Periksa kelembapan** sebelum menyiram.\n\n1. Amati bagian bawah daun.\n2. Pastikan drainase baik.\n\n'+('Catat perubahan daun dan minta bantuan penyuluh jika meluas.\n\n'.repeat(12))+'<script>window.aiXss=true</script>';
async function fixture(page:Page,retry=false,externalEnabled=true){
  const state=await memberFixture(page);let attempts=0;const ids:string[]=[],payloads:any[]=[];
  await page.route('**/api/v1/catalog',r=>r.fulfill({status:503,json:{}}));
  await page.route('**/api/v1/member/chat/capabilities',r=>r.fulfill({json:{success:true,data:{externalEnabled,imageAnalysis:externalEnabled,connectionVerified:false,localFallback:true}}}));
  await page.route('**/api/v1/member/chat/conversations/*/messages',async route=>{
    attempts++;const b=route.request().postDataJSON();ids.push(b.client_request_id);payloads.push(b);
    const c=state.states.a.chats.find((c:any)=>c.id===new URL(route.request().url()).pathname.split('/')[6]);
    if(!c.messages.some((m:any)=>m.request?.client_request_id===b.client_request_id))c.messages.push({id:'1',sender:'user',text:b.content,timestamp:'07.00',...(b.media_id?{photoUrl:'/assets/generated/kangkung.png'}:{}),request:{...b,state:'pending'}});
    if(retry&&attempts===1)return route.fulfill({status:503,json:{success:false,error:{code:'CONSULTATION_UNAVAILABLE',message:'Koneksi sedang bermasalah. Silakan coba lagi.'}}});
    await new Promise(resolve=>setTimeout(resolve,180));
    c.messages[0].request.state='completed';
    c.messages.push({id:'2',sender:'assistant',text:longAnswer,timestamp:'07.01',providerMetadata:{provider:externalEnabled?'gemini':'local',model:externalEnabled?'fixture-model':undefined,imageAnalyzed:Boolean(b.media_id&&externalEnabled),fallbackUsed:!externalEnabled}});c.snippet='Periksa kelembapan';
    return route.fulfill({json:{success:true,data:c}});
  });
  return {state,ids,payloads,get attempts(){return attempts;}};
}
const sizes=[[320,568],[341,760],[360,800],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]];
for(const [width,height] of sizes)test(`AI consultation reflows safely at ${width}×${height}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const f=await fixture(page);await page.setViewportSize({width,height});await page.goto('/?screen=chat_ai');
  await expect(page.getByRole('heading',{name:'Ada yang bisa dibantu?'})).toBeVisible();
  if([341,768,1440].includes(width))await page.screenshot({path:`.artifacts/tanya-tani-review/empty-${width}.png`});
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByLabel('Tulis pertanyaan',{exact:true}).fill('Mengapa daun sorgum saya menguning?\nDaun bawah mulai berubah sejak kemarin.');
  await page.getByRole('button',{name:'Kirim pertanyaan',exact:true}).click();
  await expect(page.getByText('Jawaban AI',{exact:true})).toBeVisible();
  expect(f.payloads[0]).not.toHaveProperty('external_consent');
  await expect(page.locator('.consultation-answer h3')).toHaveText('Yang perlu diperiksa');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(await page.evaluate(()=>(window as any).aiXss)).toBeUndefined();
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  await expect.poll(()=>page.locator('.consultation-copy').evaluate(element=>element.getBoundingClientRect().bottom<=document.querySelector('.consultation-composer')!.getBoundingClientRect().top)).toBe(true);
  if([341,768,1440].includes(width))await page.screenshot({path:`.artifacts/tanya-tani-review/answer-${width}.png`});
  expect(errors).toEqual([]);
});

test('a failed turn retries the same saved question and request ID',async({page})=>{
  const f=await fixture(page,true,false);await page.goto('/?screen=chat_ai');
  await page.getByLabel('Tulis pertanyaan',{exact:true}).fill('Bagaimana merawat sorgum?');await page.getByRole('button',{name:'Kirim pertanyaan',exact:true}).click();
  await expect(page.getByRole('button',{name:'Coba lagi',exact:true})).toBeVisible();
  await expect(page.getByLabel('Tulis pertanyaan',{exact:true})).toHaveValue('Bagaimana merawat sorgum?');
  await page.getByRole('button',{name:'Coba lagi',exact:true}).click();await expect(page.locator('.consultation-attribution').getByText('Panduan lokal',{exact:true})).toBeVisible();
  expect(f.ids).toHaveLength(2);expect(f.ids[0]).toBe(f.ids[1]);expect(f.state.states.a.chats).toHaveLength(1);expect(f.state.states.a.chats[0].messages).toHaveLength(2);
});

test('unknown species photo submits directly to AI and reopens through private history',async({page})=>{
  const f=await fixture(page);await page.setViewportSize({width:360,height:800});await page.goto('/?screen=chat_ai');
  await page.locator('input[type=file]').last().setInputFiles('public/assets/generated/kangkung.png');
  await expect(page.getByLabel('Jenis tanaman atau hewan',{exact:true})).toHaveValue('');
  await page.getByLabel('Apa yang ingin diketahui?',{exact:true}).selectOption('identify');
  await expect(page.getByRole('checkbox')).toHaveCount(0);await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:'.artifacts/tanya-tani-review/photo-360.png'});
  await page.getByRole('button',{name:'Analisis foto',exact:true}).evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));await page.screenshot({path:'.artifacts/tanya-tani-review/photo-submit-360.png'});
  await page.getByRole('button',{name:'Analisis foto',exact:true}).click();await expect(page.getByText('Dianalisis menggunakan AI',{exact:true})).toBeVisible();
  expect(f.payloads[0]).not.toHaveProperty('external_consent');
  await page.getByRole('button',{name:'Perbesar foto konsultasi',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Riwayat',exact:true}).click();await page.getByRole('searchbox').fill('Identifikasi');await expect(page.getByRole('button',{name:/Buka percakapan/})).toHaveCount(1);
  await page.reload();await page.getByRole('button',{name:/Buka percakapan/}).click();await expect(page.getByText('Dianalisis menggunakan AI',{exact:true})).toBeVisible();
});
