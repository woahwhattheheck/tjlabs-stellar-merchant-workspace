// MIT. Original local Support host routes for its Grafana delivery adapter.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {openGrafanaCaseDelivery,GRAFANA_DELIVERY_BASE} from './case-grafana-delivery.mjs';
const BASE=GRAFANA_DELIVERY_BASE,MAX=24*1024*1024;
const assets=new Map([
 ['/grafana-delivery',['grafana-delivery.html','text/html; charset=utf-8']],
 ['/grafana-delivery/app.mjs',['grafana-delivery.mjs','text/javascript; charset=utf-8']],
 ['/grafana-delivery/style.css',['grafana-delivery.css','text/css; charset=utf-8']]
]);
const error=(code,message,status=422)=>Object.assign(new Error(message),{code,status});
function send(res,status,value){
 if(res.destroyed)return;
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
 res.end(JSON.stringify(value));
}
async function body(req){
 if(req.headers['content-type']?.split(';')[0]?.trim()!=='application/json')throw error('GRAFANA_JSON_REQUIRED','Use a JSON request.',415);
 if(req.headers['content-encoding']&&req.headers['content-encoding']!=='identity')throw error('GRAFANA_ENCODING','Send the original unencoded request.',415);
 if(req.headers['content-length']!==undefined&&(!/^\d+$/.test(req.headers['content-length'])||Number(req.headers['content-length'])>MAX))
   throw error('GRAFANA_REQUEST_LIMIT','The original delivery metadata exceeds 24 MiB.',413);
 let bytes=0;const chunks=[];
 for await(const chunk of req){bytes+=chunk.length;if(bytes>MAX)throw error('GRAFANA_REQUEST_LIMIT','The original delivery metadata exceeds 24 MiB.',413);chunks.push(chunk);}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
 catch{throw error('GRAFANA_JSON_INVALID','Supply one complete original JSON request.');}
}
function query(url,allowed){
 const result={};for(const [key,value]of url.searchParams){
  if(!allowed.includes(key)||Object.hasOwn(result,key))throw error('GRAFANA_QUERY_INVALID','Select each original query field once.');
  result[key]=value;
 }
 return result;
}
export async function createGrafanaDeliveryRoutes({store,sourceDelivery,grafanaSource,casesDirectory,casePackages,python,environment}){
 async function resolveReceiving({caseId}){
   if(!casePackages)throw error('GRAFANA_RECEIVING_CONTEXT_REQUIRED','Open the original full case-package receiver.',409);
   let offset=0;
   for(;;){
     const page=await casePackages.list({offset,limit:100});
     for(const row of page.rows??[]){
       if(row.state!=='COMPLETE'||!['receive','remote'].includes(row.request?.kind??row.kind))continue;
       const received=await casePackages.receivedCase(row.id);
       if(received.case.id===caseId)return received;
     }
     if(page.nextOffset===null||page.nextOffset===undefined)break;
     if(!Number.isSafeInteger(page.nextOffset)||page.nextOffset<=offset)throw error('GRAFANA_RECEIVING_PAGE','The original receiving page did not advance.',409);
     offset=page.nextOffset;
   }
   throw error('GRAFANA_RECEIVING_CONTEXT_REQUIRED','No completed original package receiving operation identifies this case.',409);
 }
 const api=await openGrafanaCaseDelivery({store,sourceDelivery,grafanaSource,python,environment,resolveReceiving});
 const binding=createHash('sha256').update('grafana-support/1\0'+resolve(casesDirectory)+'\0'+resolve(sourceDelivery.directory)).digest('hex');
 const requests=new Set();let closing=false,closePromise;
 return {
  api,
  async handle(req,res,{origin}){
   const url=new URL(req.url,origin),isAsset=assets.has(url.pathname);
   if(!isAsset&&url.pathname!==BASE&&!url.pathname.startsWith(BASE+'/'))return false;
   let done;const complete=new Promise(r=>{done=r;});const owned={req,res,complete};requests.add(owned);
   try{
    if(closing)throw error('GRAFANA_OWNER_CLOSING','The original delivery owner is closing.',503);
    if(req.headers.host!==new URL(origin).host||(req.headers.origin&&req.headers.origin!==origin)||
       (req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))||
       (!['GET','HEAD'].includes(req.method)&&req.headers.origin!==origin))
       throw error('GRAFANA_ORIGIN_MISMATCH','Use the original local Support workspace.',403);
    if(isAsset){
     if(!['GET','HEAD'].includes(req.method)||url.search)throw error('GRAFANA_METHOD','Open the original delivery page.',405);
     const [path,type]=assets.get(url.pathname),bytes=await readFile(new URL('./'+path,import.meta.url));
     res.writeHead(200,{'content-type':type,'content-length':bytes.length,'cache-control':'no-store'});
     res.end(req.method==='HEAD'?undefined:bytes);return true;
    }
    const action=url.pathname.slice(BASE.length+1);
    if(req.method==='GET'&&action==='config'){
     if(url.search)throw error('GRAFANA_QUERY_INVALID','No configuration query is needed.');
     send(res,200,{schema:'stellar-forge.grafana-delivery-host.v1',workspaceId:binding,
       nativeWrites:false,archiveBytes:8*1024**3,sourceDelivery:'/api/commissioning/source-bundles'});return true;
    }
    if(req.method==='GET'&&['status','history'].includes(action)){
     const args=query(url,action==='status'?['caseId','requestId']:['caseId','offset','limit']);
     for(const key of ['offset','limit'])if(key in args){if(!/^\d+$/.test(args[key]))throw error('GRAFANA_QUERY_INVALID','Use integer page bounds.');args[key]=Number(args[key]);}
     send(res,200,await api[action==='status'?'inspectCase':'list'](args));return true;
    }
    if(req.method==='POST'&&['inspect','review','apply','reopen'].includes(action)){
     if(url.search)throw error('GRAFANA_QUERY_INVALID','Use the complete original operation body.');
     const input=await body(req);if(closing)throw error('GRAFANA_OWNER_CLOSING','The original owner is closing.',503);
     send(res,200,await api[action](input));return true;
    }
    throw error('GRAFANA_ROUTE_NOT_FOUND','Unknown Grafana delivery operation.',404);
   }catch(e){
    if(res.headersSent)res.destroy();
    else send(res,Number.isInteger(e.status)?e.status:503,{error:typeof e.code==='string'?e.code:'GRAFANA_DELIVERY_FAILED',
      detail:typeof e.code==='string'?String(e.message).slice(0,1000):'The original request remains available for inspection and continuation.',
      requestState:'UNKNOWN'});
    return true;
   }finally{requests.delete(owned);done();}
  },
  async close(){
   if(closePromise)return closePromise;closing=true;
   closePromise=(async()=>{for(const row of requests){if(!row.req.complete)row.req.destroy(error('GRAFANA_OWNER_CLOSING','The original owner is closing.',503));}await api.close();await Promise.allSettled([...requests].map(row=>row.complete));})();return closePromise;
  }
 };
}
