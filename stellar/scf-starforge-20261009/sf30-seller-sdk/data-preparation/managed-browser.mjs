// MIT. Attach the unchanged original browser to its Applications-owned listener.
const originalFetch=globalThis.fetch.bind(globalThis);
const message=(text)=>{const node=document.querySelector('#message');node.textContent=text;node.hidden=false;node.dataset.error='true';};
try {
  const key='preparation:'+location.origin;
  const fromLink=location.hash.slice(1);
  const token=/^[a-f0-9]{64}$/.test(fromLink)?fromLink:sessionStorage.getItem(key);
  if(!/^[a-f0-9]{64}$/.test(token||'')) throw Error('Open this workspace from its saved Applications entry.');
  const connectionResponse=await originalFetch('/api/managed/connection',{headers:{Authorization:'Bearer '+token},redirect:'error'});
  const connection=await connectionResponse.json();
  if(!connectionResponse.ok||connectionResponse.headers.get('x-preparation-instance-id')!==connection.instanceId)
    throw Error(connection.error||'The original listener changed. Reopen its current Applications link.');
  sessionStorage.setItem(key,token);
  history.replaceState(null,'',location.pathname);
  globalThis.fetch=async(input,options={})=>{
    const target=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.origin);
    if(target.origin!==location.origin||!target.pathname.startsWith('/api/')) return originalFetch(input,options);
    const headers=new Headers(options.headers??(input instanceof Request?input.headers:undefined));
    headers.set('Authorization','Bearer '+token);headers.set('X-Preparation-Instance-ID',connection.instanceId);
    const response=await originalFetch(input,{...options,headers,redirect:'error'});
    if(response.headers.get('x-preparation-instance-id')!==connection.instanceId){
      await response.body?.cancel();throw Error('The original application restarted. Open its current Applications link.');
    }
    return response;
  };
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[download]');
    if(!link) return;
    const target=new URL(link.href,location.origin);
    if(target.origin!==location.origin||target.pathname.startsWith('/managed-download/')) return;
    if(!target.pathname.startsWith('/api/file')&&!target.pathname.startsWith('/downloads/')) return;
    event.preventDefault();event.stopImmediatePropagation();
    (async()=>{
      const response=await fetch('/api/managed/ticket',{method:'POST',headers:{
        'Content-Type':'application/json','X-Preparation-Request':'1'
      },body:JSON.stringify({path:target.pathname+target.search})});
      const result=await response.json();
      if(!response.ok) throw Error(result.error||'The original download is unavailable.');
      const download=document.createElement('a');
      download.href=result.url;download.download=link.download;document.body.append(download);download.click();download.remove();
    })().catch(error=>message(error.message));
  },true);
  await import('/app.js');
} catch(error) {message(error.message);}
