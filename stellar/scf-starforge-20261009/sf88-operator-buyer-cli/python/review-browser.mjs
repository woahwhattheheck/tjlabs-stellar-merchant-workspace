// MIT — The Python owner opens the original browser on the same original library.
import {access} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {requireValue} from '../resource-library/files.mjs';

const PAGES={resources:'/',comparisons:'/comparisons',returns:'/comparison-returns',collections:'/collections'};
async function present(relative) {
  try {await access(new URL(relative,import.meta.url));return true;}
  catch(error) {if(error.code==='ENOENT')return false;throw error;}
}

/** Serialize the one listener's start/stop operations. A stale handle cannot stop a successor. */
export function createReviewBrowser(library) {
  let current=null, queue=Promise.resolve(), ended=false;
  const serialize=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
  const publicState=()=>current?{state:'RUNNING',sessionId:current.sessionId,operationId:current.operationId,
    origin:current.host.origin,pages:current.pages,port:current.port,pid:process.pid}:{state:ended?'CLOSED':'STOPPED',pid:process.pid};
  const connection=()=>({...publicState(),url:current.host.origin+PAGES[current.page]+'#'+current.host.token});
  return Object.freeze({
    status:()=>serialize(()=>publicState()),
    start:({operationId,port=0,page='resources'}={})=>serialize(async()=>{
      requireValue(!ended,'REVIEW_BROWSER_OWNER_CLOSED',409);
      requireValue(typeof operationId==='string'&&operationId.length>0&&operationId.length<=200,'OPERATION_ID_REQUIRED');
      requireValue(Number.isInteger(port)&&port>=0&&port<=65535,'PORT_INVALID');
      requireValue(Object.hasOwn(PAGES,page),'REVIEW_BROWSER_PAGE_INVALID');
      if(current){
        requireValue(current.operationId===operationId,'REVIEW_BROWSER_ALREADY_RUNNING',409);
        requireValue(current.requestedPort===port&&current.page===page,'REVIEW_BROWSER_START_CONFLICT',409);
        return connection();
      }
      // These are original source-owned extensions, not alternative UI implementations.
      // A partial extension whose entry exists fails normally; only an absent optional
      // Collections UI is omitted. Its native Python collection API remains available.
      const {serveLibrary}=await import('../resource-library/server.mjs');
      let options={port},pages={resources:PAGES.resources};
      if(await present('../resource-library/collection-ui.mjs')){
        const {collectionExtension}=await import('../resource-library/collection-ui.mjs');
        options={...await collectionExtension(library),port};pages.collections=PAGES.collections;
      }
      if(library.comparisons){
        const {withComparisons}=await import('../resource-library/comparison-extension.mjs');
        options=await withComparisons(library,options);
        pages.comparisons=PAGES.comparisons;pages.returns=PAGES.returns;
      }
      requireValue(Object.hasOwn(pages,page),'REVIEW_BROWSER_PAGE_UNAVAILABLE',409);
      const host=await serveLibrary(library,options);
      current={host,operationId,requestedPort:port,port:Number(new URL(host.origin).port),page,pages,sessionId:randomUUID()};
      return connection();
    }),
    stop:({sessionId}={})=>serialize(async()=>{
      requireValue(typeof sessionId==='string'&&sessionId.length>0,'REVIEW_BROWSER_SESSION_REQUIRED');
      if(!current)return publicState();
      requireValue(sessionId===current.sessionId,'REVIEW_BROWSER_STALE_SESSION',409);
      const selected=current;
      try{await selected.host.close();}finally{current=null;}
      return publicState();
    }),
    close:()=>serialize(async()=>{
      ended=true;const selected=current;
      try{if(selected)await selected.host.close();}finally{current=null;}
      return publicState();
    })
  });
}
