let csrf = '';
let generation = 0;
let controller = new AbortController();
export class MemberApiError extends Error {
  constructor(public status: number,public code: string,message: string) {super(message);}
}
export function clearMemberMemory() { generation++;controller.abort();controller=new AbortController();csrf=''; }
export async function memberApi<T = any>(path: string,method='GET',body?: unknown): Promise<T> {
  const epoch=generation,form=body instanceof FormData;
  let response:Response;
  try {response=await fetch(`/api/v1${path}`,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,
    headers:{...(body&&!form?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-CSRF-Token':csrf}:{})},
    body:body?form?body:JSON.stringify(body):undefined});}
  catch(e) {if((e as Error).name==='AbortError')throw e;throw new Error('Server belum dapat dihubungi. Periksa koneksi lalu coba lagi.');}
  let result:any;
  try {result=await response.json();}catch {throw new Error('Server belum dapat memproses permintaan. Coba lagi nanti.');}
  if(epoch!==generation) throw new DOMException('Sesi telah berubah.','AbortError');
  if(!response.ok) {
    const error=new MemberApiError(response.status,result.error?.code,result.error?.message||'Permintaan belum berhasil. Coba lagi.');
    if(path!=='/auth/login'&&(error.status===401||error.code==='PASSWORD_CHANGE_REQUIRED')) window.dispatchEvent(new CustomEvent('member-auth-change',{detail:error.code}));
    throw error;
  }
  if(result.data?.csrfToken) csrf=result.data.csrfToken;
  return result.data;
}
export async function uploadDataImage(url:string,endpoint:string) {
  const blob=await (await fetch(url)).blob(),form=new FormData();form.set('image',blob,'foto.jpg');
  return memberApi(endpoint,'POST',form);
}
