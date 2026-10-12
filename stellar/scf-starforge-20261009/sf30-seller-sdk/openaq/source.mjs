// SPDX-License-Identifier: MIT
// Fixed official origins and retained GET editions. No token is put in a URL, record or error.
import { mkdir, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { createSupplierQuotaRegistry } from '../supplier-quota/application.mjs';
import { privateDirectory, readJson, readPrivate, createFile, atomicJson, digest, identity, bytes, fault, stamp } from '../postgres/publisher/files.mjs';
import { need, metadataContext, archiveURL, whole } from './contract.mjs';
import { parseAPI, apiRows, archiveRows, encodeRows, seriesSummary } from './projection.mjs';
const unzip=promisify(gunzip),API='https://api.openaq.org',ARCHIVE='https://openaq-data-archive.s3.amazonaws.com';
const HEADERS=['content-type','content-length','etag','last-modified','date','retry-after','x-ratelimit-used','x-ratelimit-reset','x-ratelimit-limit','x-ratelimit-remaining'];
const delay=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted){reject(fault('OPENAQ_CAPTURE_PAUSED'));return;}
 const timer=setTimeout(done,ms);function done(){signal?.removeEventListener('abort',abort);resolve();}
 function abort(){clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(fault('OPENAQ_CAPTURE_PAUSED'));}signal?.addEventListener('abort',abort,{once:true});
});
async function exists(path){try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function immutable(path,data){
 try{await createFile(path,data);}catch(e){if(e.code!=='EEXIST')throw e;const old=await readPrivate(path,Math.max(data.length,1));need(old.equals(data),'OPENAQ_RETAINED_BYTES_CHANGED','The retained original file differs from this operation.',409);}
}
function safeError(e){return {code:typeof e?.code==='string'&&/^[A-Z0-9_]+$/.test(e.code)?e.code:'OPENAQ_PROVIDER_READ_FAILED',
 ...(Number.isInteger(e?.status)?{status:e.status}:{}),...(Number.isFinite(e?.retryAfter)?{retryAfter:e.retryAfter}:{})};}
export function createOpenAQSource({configuration,environment=process.env,fetchImpl=globalThis.fetch}={}){
 need(configuration&&typeof fetchImpl==='function','OPENAQ_SOURCE_CONFIGURATION_REQUIRED');
 let closed=false,closing,registry=null,admission=null,key=null,registryCloseFailed=false;
 const pending=new Set(),controllers=new Set();
 function prepareAPI(){
  need(!closed,'OPENAQ_SOURCE_CLOSED');
  if(admission)return;
  const api=configuration.api;need(api,'OPENAQ_API_ACCOUNT_REQUIRED','Choose the private OpenAQ account declaration before API acquisition.');
  const candidate=environment[api.apiKeyEnv];need(typeof candidate==='string'&&candidate.length>=8&&candidate.length<=1024&&!/[\r\n\0]/.test(candidate),'OPENAQ_API_KEY_REQUIRED','Set the declared OpenAQ API key on this host.');
  registry=createSupplierQuotaRegistry({supplierAccounts:{openaq:{directory:api.quotaDirectory,account:api.account,apiKeyEnv:api.apiKeyEnv,
   requestsPerSecond:api.requestsPerSecond,callsPerDay:api.callsPerDay}},bindings:{openaq:{supplierAccount:'openaq'}}});
  admission=registry.controller('openaq');key=candidate;
 }
 async function request(url,directory,{signal,role,archiveLocalDay=null,onProgress=()=>{}}={}){
  need(!closed,'OPENAQ_SOURCE_CLOSED');
  const u=new URL(url);need([API,ARCHIVE].includes(u.origin)&&!u.username&&!u.password&&!u.hash,'OPENAQ_ORIGIN_INVALID');
  const isAPI=u.origin===API;need(isAPI?u.pathname.startsWith('/v3/'):!u.search&&/^\/records\/csv\.gz\/locationid=\d+\/year=\d{4}\/month=\d{2}\/location-\d+-\d{8}\.csv\.gz$/.test(u.pathname),'OPENAQ_SOURCE_PATH_INVALID');
  // Credential and original account-controller construction happens before the dispatch marker.
  if(isAPI)prepareAPI();
  const id=identity({method:'GET',url:u.href}),rd=join(directory,'requests',id);
  await privateDirectory(rd,true);
  const recordPath=join(rd,'receipt.json');
  if(await exists(recordPath)){
   const receipt=await readJson(recordPath),data=await readPrivate(join(rd,'response.bin'),32*1024*1024);
   need(receipt.url===u.href&&receipt.method==='GET'&&receipt.sha256===digest(data)&&receipt.bytes===data.length,'OPENAQ_RESPONSE_CHANGED',undefined,409);
   return {data,receipt:{...receipt,file:'requests/'+id+'/response.bin',role,archiveLocalDay,reopened:true}};
  }
  const attempts=(await readdir(rd)).filter(n=>/^attempt-\d+\.json$/.test(n)).sort();
  const attempt=attempts.length+1,controller=new AbortController();
  const abort=()=>controller.abort();if(signal?.aborted)abort();signal?.addEventListener('abort',abort,{once:true});controllers.add(controller);
  let timeout=null,started=false;
  try{
   if(isAPI){
    for(;;){
     need(!closed&&!controller.signal.aborted,'OPENAQ_CAPTURE_PAUSED');
     const result=await admission.reserve({signal:controller.signal});
     if(result===true)break;
     if(result.status!==429)throw Object.assign(fault('OPENAQ_ACCOUNT_ADMISSION_UNAVAILABLE','The original account controller refused dispatch.',result.status??503),{retryAfter:Number(result.headers?.['retry-after']??60)});
     const seconds=Math.max(1,Number(result.headers?.['retry-after']??1));
     // Minute pacing is automatic. A longer account/provider cooldown remains an explicit saved continuation.
     if(seconds>60)throw Object.assign(fault('OPENAQ_ACCOUNT_COOLDOWN','The retained account cooldown is still active.',429),{retryAfter:seconds});
     onProgress({phase:'waiting-account',retryAfter:seconds});await delay(seconds*1000,controller.signal);
    }
   }
   need(!closed&&!controller.signal.aborted,'OPENAQ_CAPTURE_PAUSED');
   await immutable(join(rd,'attempt-'+String(attempt).padStart(5,'0')+'.json'),bytes({
    schema:'stellar-forge.openaq-get-attempt.v1',requestId:id,attempt,method:'GET',url:u.href,startedAt:stamp(),
    priorUnresolvedGet:attempt>1,account:isAPI?configuration.api.account:null}));
   started=true;timeout=setTimeout(()=>controller.abort(),60000);
   onProgress({phase:'reading-provider',role,attempt});
   let response;
   try{response=await fetchImpl(u,{method:'GET',headers:isAPI?{'X-API-Key':key,accept:'application/json'}:{accept:'application/gzip'},redirect:'manual',signal:controller.signal});}
   catch(e){throw fault(controller.signal.aborted?'OPENAQ_CAPTURE_PAUSED':'OPENAQ_PROVIDER_READ_FAILED','The original GET has no complete retained response; inspect and explicitly continue this same capture.',503);}
   const headers=Object.fromEntries(HEADERS.filter(name=>response.headers.has(name)).map(name=>[name,response.headers.get(name)]));
   if(isAPI&&response.status===429)await admission.observe({status:429,headers});
   if(response.status!==200){
    await response.body?.cancel().catch(()=>{});
    const result={schema:'stellar-forge.openaq-get-result.v1',requestId:id,attempt,url:u.href,status:response.status,headers,finishedAt:stamp()};
    await immutable(join(rd,'failure-'+String(attempt).padStart(5,'0')+'.json'),bytes(result));
    throw Object.assign(fault('OPENAQ_PROVIDER_STATUS','OpenAQ returned HTTP '+response.status+'. Response credentials and error bodies are not exported.',response.status===429?429:502),
     {upstreamStatus:response.status,retryAfter:response.status===429?Math.max(1,Number(headers['retry-after'])||60):undefined});
   }
   const maximum=isAPI?8*1024*1024:32*1024*1024,chunks=[];let size=0;
   const announced=response.headers.get('content-length');if(announced&&/^\d+$/.test(announced))need(Number(announced)<=maximum,'OPENAQ_RESPONSE_TOO_LARGE');
   if(response.body)for await(const chunk of response.body){size+=chunk.length;need(size<=maximum,'OPENAQ_RESPONSE_TOO_LARGE');chunks.push(Buffer.from(chunk));}
   const data=Buffer.concat(chunks);
   if(isAPI)parseAPI(data);
   const receipt={schema:'stellar-forge.openaq-response.v1',requestId:id,method:'GET',url:u.href,status:200,headers,
    acquiredAt:stamp(),attempt,bytes:data.length,sha256:digest(data)};
   await immutable(join(rd,'response.bin'),data);await immutable(recordPath,bytes(receipt));
   return {data,receipt:{...receipt,file:'requests/'+id+'/response.bin',role,archiveLocalDay,reopened:false}};
  }catch(e){
   if(started)await immutable(join(rd,'outcome-'+String(attempt).padStart(5,'0')+'.json'),bytes({attempt,recordedAt:stamp(),error:safeError(e)})).catch(writeError=>{e.recordError=writeError.code;});
   throw e;
  }finally{if(timeout)clearTimeout(timeout);controllers.delete(controller);signal?.removeEventListener('abort',abort);}
 }
 async function capture(capture,directory,{signal,onProgress=()=>{}}={}){
  need(!closed,'OPENAQ_SOURCE_CLOSED');
  const receipts=[],rows=[],pageObservations=[],flags=[];let context=capture.context;
  const retain=got=>{receipts.push(got.receipt);return got;};
  const apiURL=(path,query={})=>{const u=new URL('/v3/'+path,API);for(const[k,v]of Object.entries(query))u.searchParams.set(k,String(v));return u.href;};
  async function get(path,query,role){return retain(await request(apiURL(path,query),directory,{signal,role,onProgress}));}
  async function pages(path,query,role,consume){
   let page=1;
   for(;;){
    need(page<=capture.plan.maxPages,'OPENAQ_PAGE_LIMIT_REACHED','The original response has more pages than the reviewed bound; no partial dataset is published.');
    const got=await get(path,{...query,limit:capture.plan.pageSize,page},role),value=parseAPI(got.data);
    const rawFound=value.meta?.found??null,found=typeof rawFound==='string'&&/^\d+$/.test(rawFound)&&Number.isSafeInteger(Number(rawFound))?Number(rawFound):null;
    pageObservations.push({url:got.receipt.url,rows:value.results.length,found:rawFound,acquiredAt:got.receipt.acquiredAt,sha256:got.receipt.sha256});
    need(value.results.length<=capture.plan.pageSize,'OPENAQ_PAGE_SIZE_CHANGED');
    if(value.meta?.page!==undefined&&value.meta.page!==null)need(whole(value.meta.page,'returned page')===page,'OPENAQ_RETURNED_PAGE_CHANGED');
    if(found!==null)need(found>=(page-1)*capture.plan.pageSize+value.results.length,'OPENAQ_PAGINATION_CHANGED');
    await consume(value,got);
    onProgress({phase:'capturing',rows:rows.length,pages:pageObservations.length,requests:receipts.length});
    // No ordering/snapshot guarantee is inferred from meta.found. A terminal short page closes this exact query.
    if(value.results.length<capture.plan.pageSize){if(found!==null&&found>(page-1)*capture.plan.pageSize+value.results.length)throw fault('OPENAQ_PAGINATION_CHANGED','A short page disagrees with its original found count; retain it for source review.',409);break;}
    if(found!==null&&found===page*capture.plan.pageSize)break;
    page++;
   }
  }
  if(capture.plan.mode==='api'){
   prepareAPI();
   const got=await get('locations/'+capture.plan.locationId,{},'location'),location=parseAPI(got.data).results[0];
   need(location&&whole(location.id,'location ID')===capture.plan.locationId,'OPENAQ_LOCATION_CHANGED');
   const known=new Set();
   await pages('locations/'+capture.plan.locationId+'/sensors',{},'location-sensors',async value=>{for(const row of value.results)known.add(whole(row.id,'location sensor ID'));});
   for(const sensor of capture.plan.sensorIds)need(known.has(sensor),'OPENAQ_SENSOR_FROM_ANOTHER_LOCATION','The original location-sensor relation does not include the selected sensor.');
   const licenses=[];
   for(const original of location.licenses??[]){
    const id=whole(original.id,'license ID'),licenseGot=await get('licenses/'+id,{},'license'),license=parseAPI(licenseGot.data).results[0];
    need(license&&whole(license.id,'license ID')===id,'OPENAQ_LICENSE_CHANGED');licenses.push({...license,...original,licenseDefinition:license});
   }
   const providerId=location.provider?.id;if(providerId!==undefined)await get('providers/'+whole(providerId,'provider ID'),{},'provider');
   context=metadataContext({kind:'api-response',location:{...location,licenses},observedAt:got.receipt.acquiredAt,
    sources:[{url:got.receipt.url,title:'Original OpenAQ v3 location response'},{url:'https://docs.openaq.org/using-the-api/dates-datetimes',title:'OpenAQ period semantics'}]},capture.plan);
   const selected={...capture,context};
   for(const sensor of capture.plan.sensorIds){
    const info=await get('sensors/'+sensor,{},'sensor'),sensorValue=parseAPI(info.data).results[0];
    need(sensorValue&&whole(sensorValue.id,'sensor ID')===sensor,'OPENAQ_SENSOR_CHANGED');
    let flagged=false;
    await pages('sensors/'+sensor+'/'+capture.plan.resolution,{datetime_from:capture.plan.datetimeFrom,datetime_to:capture.plan.datetimeTo},'measurements',async(value,item)=>{
     const incoming=apiRows(selected,item.receipt,sensor,capture.plan.resolution,item.data);if(incoming.some(r=>r.has_flags==='true'))flagged=true;
     rows.push(...incoming);need(rows.length<=capture.plan.maxRows,'OPENAQ_ROW_LIMIT_REACHED','The complete query exceeds the reviewed row bound; no truncated dataset is published.');
    });
    if(flagged)await pages('sensors/'+sensor+'/flags',{datetime_from:capture.plan.datetimeFrom,datetime_to:capture.plan.datetimeTo},'flags',async(value,item)=>flags.push({sensorId:sensor,rows:value.results.length,sourceFile:item.receipt.file,sha256:item.receipt.sha256}));
   }
  }else{
   context=metadataContext(context,capture.plan);
   for(const date of capture.plan.dates){
    const got=retain(await request(archiveURL(capture.plan.locationId,date),directory,{signal,role:'archive',archiveLocalDay:date,onProgress}));
    let unpacked;try{unpacked=await unzip(got.data,{maxOutputLength:64*1024*1024});}catch{throw fault('OPENAQ_ARCHIVE_GZIP_INVALID','The retained object must be the original bounded gzip CSV.');}
    const projected=archiveRows({...capture,context},got.receipt,unpacked);rows.push(...projected.rows);
    need(rows.length<=capture.plan.maxRows,'OPENAQ_ROW_LIMIT_REACHED','The full selected local-day archive exceeds the reviewed row bound.');
    got.receipt.originalHeaders=projected.originalHeaders;got.receipt.sourceRows=projected.sourceRows;got.receipt.uncompressedBytes=unpacked.length;got.receipt.uncompressedSha256=digest(unpacked);
    onProgress({phase:'capturing',rows:rows.length,requests:receipts.length});
   }
  }
  const csv=Buffer.from(encodeRows(rows));need(csv.length<=64*1024*1024,'OPENAQ_PROJECTION_TOO_LARGE');
  await immutable(join(directory,'measurements.csv'),csv);
  const result={...capture,context,state:'COMPLETE',completedAt:stamp(),receipts,pageObservations,flags,
   projection:{file:'measurements.csv',bytes:csv.length,sha256:digest(csv),rows:rows.length},series:seriesSummary(rows)};
  const{captureSha256,...body}=result;result.captureSha256=identity(body);
  await immutable(join(directory,'capture.json'),bytes(result));return result;
 }
 function tracked(work){const result=Promise.resolve().then(work);pending.add(result);result.finally(()=>pending.delete(result)).catch(()=>{});return result;}
 return Object.freeze({
  capture:(...args)=>tracked(()=>capture(...args)),request:(...args)=>tracked(()=>request(...args)),
  async account(){need(!closed,'OPENAQ_SOURCE_CLOSED');prepareAPI();return admission.read();},
  close(){if(closing)return closing;closed=true;for(const c of controllers)c.abort();closing=(async()=>{await Promise.allSettled([...pending]);try{if(registryCloseFailed)await admission?.close();else await registry?.close();registry=null;admission=null;key=null;registryCloseFailed=false;}catch(e){registryCloseFailed=true;closing=null;throw e;}})();return closing;}
 });
}
