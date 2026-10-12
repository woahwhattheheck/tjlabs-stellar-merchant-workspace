// MIT — Reading handovers compose into the original authenticated research listener.
import {readFile} from 'node:fs/promises';
import {openReadingExchange} from './exchange.mjs';
import {requireValue} from '../files.mjs';

export async function readingExchangeExtension(search,options={}){
  const exchange=await openReadingExchange(search,options),jobs=new Map();let closing=false;
  const additionalAssets=[{route:'/reading-exchange.js',type:'text/javascript',
    bytes:await readFile(new URL('./ui.mjs',import.meta.url))}];
  async function authenticatedRoute({request,url,send,body,registerDownload}){
    const prefix='/api/reading-exchange';
    if(!url.pathname.startsWith(prefix+'/'))return false;
    requireValue(!closing,'READING_EXCHANGE_CLOSING',503);
    const action=url.pathname.slice(prefix.length),method=request.method;
    if(action==='/status'&&method==='GET')send(exchange.status());
    else if(action==='/capture'&&method==='POST')send(exchange.capture(await body(4*1024*1024)));
    else if(action==='/capture'&&method==='GET')send(exchange.show(url.searchParams.get('sha')));
    else if(action==='/operation'&&method==='GET')send(exchange.operation(url.searchParams.get('id')));
    else if(action==='/prepare'&&method==='POST'){
      const value=await body();
      requireValue(typeof value.operationId==='string','OPERATION_ID_REQUIRED');
      if(jobs.has(value.operationId)){
        const current=exchange.operation(value.operationId);
        requireValue(JSON.stringify(current.request)===JSON.stringify({
          captureSha256:value.captureSha256,collectionId:value.collectionId,expectedRevision:value.expectedRevision}),
          'OPERATION_ID_CONFLICT',409);
        send(current,202);
      }else{
        // Server-owned preparation survives a browser navigation or lost response.
        let startupError=null;
        const job=exchange.prepare(value).then(()=>{},error=>{startupError=error;}).finally(()=>jobs.delete(value.operationId));
        jobs.set(value.operationId,job);
        // Surface a validation failure before a durable operation exists.
        await Promise.resolve();
        if(startupError)throw startupError;
        const current=exchange.operation(value.operationId);
        send(current,current.state==='COMPLETE'?200:202);
      }
    }else if(action==='/download'&&method==='POST'){
      const value=await body();send(await registerDownload(signal=>exchange.download(value.operationId,{signal})));
    }else requireValue(false,'READING_EXCHANGE_ROUTE_NOT_FOUND',404);
    return true;
  }
  return {exchange,additionalAssets,authenticatedRoute,async close(){closing=true;await exchange.close();await Promise.allSettled([...jobs]);}};
}
