let token: string | null = null;
export async function api<T>(url:string,body?:unknown):Promise<T> {
  if (!url.startsWith('/api/')) throw new Error('This API path is not allowed.');
  if(body!==undefined&&!token){const session=await fetch('/api/session',{credentials:'same-origin'});if(!session.ok)throw new Error('Could not establish a local authentication session.');token=(await session.json()).token;}
  const response=await fetch(url,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json','X-AccessFix-Token':token||''},body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok){let detail=`Request failed (${response.status})`;try{const parsed=await response.json();detail=typeof parsed.detail==='string'?parsed.detail:detail;}catch{}if(response.status===403)token=null;throw new Error(detail);}
  return response.json();
}
