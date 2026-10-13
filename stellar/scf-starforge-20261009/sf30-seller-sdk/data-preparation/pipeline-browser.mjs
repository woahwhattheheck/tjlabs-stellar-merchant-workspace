// MIT. Run the original pipeline browser on its existing private Applications owner.
const originalFetch=globalThis.fetch.bind(globalThis);
const message=text=>{
  const node=document.querySelector('#notice')??document.querySelector('main')??document.body;
  node.textContent=text;node.hidden=false;node.dataset.error='true';
};
try{
  const key='preparation:'+location.origin,fromLink=location.hash.slice(1);
  const token=/^[a-f0-9]{64}$/.test(fromLink)?fromLink:sessionStorage.getItem(key);
  if(!/^[a-f0-9]{64}$/.test(token||''))throw Error('Open this workspace from its saved Applications entry.');
  const response=await originalFetch('/api/managed/connection',{
    headers:{Authorization:'Bearer '+token},redirect:'error'
  });
  const connection=await response.json();
  if(!response.ok||response.headers.get('x-preparation-instance-id')!==connection.instanceId)
    throw Error(connection.error||'The original application changed. Reopen its current Applications link.');
  sessionStorage.setItem(key,token);history.replaceState(null,'',location.pathname);
  globalThis.fetch=async(input,options={})=>{
    const target=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.origin);
    if(target.origin!==location.origin||!target.pathname.startsWith('/api/'))return originalFetch(input,options);
    if(!target.pathname.startsWith('/api/pipelines/')&&!target.pathname.startsWith('/api/managed/'))
      target.pathname='/api/pipelines/'+target.pathname.slice(5);
    const headers=new Headers(options.headers??(input instanceof Request?input.headers:undefined));
    headers.set('Authorization','Bearer '+token);headers.set('X-Preparation-Instance-ID',connection.instanceId);
    headers.set('X-Preparation-Request','1');
    const request=input instanceof Request?new Request(target,input):target;
    const result=await originalFetch(request,{...options,headers,redirect:'error'});
    if(result.headers.get('x-preparation-instance-id')!==connection.instanceId){
      await result.body?.cancel();throw Error('The original application restarted. Open its current Applications link.');
    }
    return result;
  };
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href]');
    if(!link)return;
    const target=new URL(link.href,location.origin);
    if(target.origin!==location.origin||target.pathname.startsWith('/managed-download/'))return;
    if(target.pathname.startsWith('/downloads/'))target.pathname='/api/pipelines'+target.pathname;
    else if(target.pathname==='/api/result')target.pathname='/api/pipelines/result';
    else if(target.pathname==='/api/commissioning/file')target.pathname='/api/pipelines/commissioning/file';
    if(!target.pathname.startsWith('/api/pipelines/downloads/')&&target.pathname!=='/api/pipelines/result'&&target.pathname!=='/api/pipelines/commissioning/file')return;
    event.preventDefault();event.stopImmediatePropagation();
    (async()=>{
      const result=await fetch('/api/managed/ticket',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({path:target.pathname+target.search})});
      const value=await result.json();
      if(!result.ok)throw Error(value.error||'The complete original file is unavailable.');
      const download=document.createElement('a');download.href=value.url;
      download.download=link.download||'';document.body.append(download);download.click();download.remove();
    })().catch(error=>message(error.message));
  },true);
  const navigation=document.createElement('p'),sources=document.createElement('a');
  sources.href='/#'+token;sources.textContent='Open source preparation';navigation.append(sources);
  (document.querySelector('aside')??document.querySelector('header')??document.body).append(navigation);
  await import('/pipelines/app.js');
}catch(error){message(error.message);}
