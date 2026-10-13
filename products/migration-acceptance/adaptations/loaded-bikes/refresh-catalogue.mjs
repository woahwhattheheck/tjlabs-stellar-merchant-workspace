#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Refresh an explicitly selected public family; never invoke or replace the native migration engine.
import {mkdir,readFile,writeFile,rename,stat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {parseExactJSON} from '../../workbench/vendor/dlt/vendor/sling/vendor/stellar-expert/exact-json.mjs';
import {createSHA256} from '../../workbench/web/sha256.mjs';
import {projectExpectedCatalogue,verifySourceClaims} from './acceptance.mjs';

const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const fail=(message,details={})=>{const error=new Error(message);error.code='LOADED_BIKES_REFRESH';error.details=details;throw error;};
const check=(condition,message,details={})=>{if(!condition)fail(message,details);};
const utf8=bytes=>decodeURIComponent(Array.from(bytes,b=>'%'+b.toString(16).padStart(2,'0')).join(''));
const sha256=bytes=>createSHA256().update(bytes).hex();
const originalId=value=>{const text=String(value);check(/^[1-9][0-9]*$/.test(text),'Select literal positive original WooCommerce IDs.');return text;};
const chunks=(items,size)=>Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size));
function base64(bytes){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let text='';
  for(let i=0;i<bytes.length;i+=3){const a=bytes[i],b=bytes[i+1],c=bytes[i+2];text+=alphabet[a>>2]+alphabet[((a&3)<<4)|((b??0)>>4)]+(b===undefined?'=':alphabet[((b&15)<<2)|((c??0)>>6)])+(c===undefined?'=':alphabet[c&63]);}
  return text;
}
function positiveCounter(value,label,{allowZero=false}={}){
  if(value===null||value===undefined||value==='')return null;
  check(/^(?:0|[1-9][0-9]*)$/.test(String(value)),label+' is not a complete integer.');
  const number=Number(value);check(Number.isSafeInteger(number)&&number>=(allowZero?0:1),label+' is outside its supported range.');return number;
}
function retryDelay(header,attempt,clock){
  if(header!==null&&header!==undefined&&header!==''){
    if(/^[0-9]+(?:\.[0-9]+)?$/.test(header))return Math.ceil(Number(header)*1000);
    const timestamp=Date.parse(header);check(Number.isFinite(timestamp),'The provider supplied an unrecognized Retry-After value.',{retry_after:header});return Math.max(0,timestamp-clock());
  }
  return Math.min(1000*2**attempt,10000);
}
async function responseBytes(response,limit){
  const length=response.headers.get('content-length');
  if(length!==null)check(positiveCounter(length,'Content-Length',{allowZero:true})<=limit,'The original response exceeds the bounded byte limit.');
  if(!response.body?.getReader){const bytes=new Uint8Array(await response.arrayBuffer());check(bytes.length<=limit,'The original response exceeds the bounded byte limit.');return bytes;}
  const reader=response.body.getReader(),parts=[];let size=0;
  try{for(;;){const value=await reader.read();if(value.done)break;size+=value.value.byteLength;check(size<=limit,'The original response exceeds the bounded byte limit.');parts.push(value.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}

/**
 * Read complete exact public Store API responses. Injection points permit a
 * deterministic transport exercise; production defaults are Node's original fetch.
 */
export async function captureLoadedBikesCatalogue({
  parentIds=[],slugs=[],baseUrl='https://www.loadedbikes.co.uk',
  fetchImpl=globalThis.fetch,sleep=ms=>delay(ms),clock=()=>Date.now(),signal,
  onProgress=()=>{},onResponse=()=>{},
  maxRetries=2,maxRetryDelayMs=30000,requestTimeoutMs=30000,
  maxResponseBytes=8388608,maxTotalBytes=67108864,
}={}){
  check(typeof fetchImpl==='function','Use Node 24 or newer with its original fetch implementation.');
  check(/^https:\/\/(?:www\.)?loadedbikes\.co\.uk\/?$/.test(baseUrl),'Select the public Loaded Bikes HTTPS origin; credentials and arbitrary destinations are not accepted.');
  const origin=baseUrl.replace(/\/$/,'');
  check(Array.isArray(parentIds)&&Array.isArray(slugs),'Select explicit parent ID and slug arrays.');
  const ids=[...new Set(parentIds.map(originalId))],selectedSlugs=[...new Set(slugs.map(value=>{
    check(typeof value==='string'&&/^[a-z0-9][a-z0-9-]{0,159}$/.test(value),'Select literal published lowercase product slugs.');return value;
  }))];
  check(ids.length+selectedSlugs.length>0&&ids.length+selectedSlugs.length<=200,'Select one to two hundred original parent IDs or product slugs.');
  check(Number.isSafeInteger(maxRetries)&&maxRetries>=0&&maxRetries<=3,'Use at most three bounded retries.');
  for(const [label,value,min,max]of [['retry delay',maxRetryDelayMs,0,60000],['request timeout',requestTimeoutMs,1000,60000],['response byte limit',maxResponseBytes,2,16777216],['total byte limit',maxTotalBytes,2,134217728]])
    check(Number.isSafeInteger(value)&&value>=min&&value<=max,'Select a bounded '+label+'.');
  const started=new Date(clock()).toISOString(),responses=[],attempts=[],records=new Map(),occurrences=new Map();let totalBytes=0;
  const abort=()=>{if(signal?.aborted)fail('The source refresh was canceled.');};
  async function request(url){
    for(let attempt=0;attempt<=maxRetries;attempt++){
      abort();const controller=new AbortController(),forward=()=>controller.abort(signal?.reason);
      signal?.addEventListener('abort',forward,{once:true});
      const timer=setTimeout(()=>controller.abort(new Error('Source request timeout')),requestTimeoutMs);
      try{
        const response=await fetchImpl(url,{method:'GET',headers:{Accept:'application/json'},redirect:'error',signal:controller.signal});
        const retryAfter=response.headers.get('retry-after');
        attempts.push({url,attempt:attempt+1,at:new Date(clock()).toISOString(),status:response.status,retry_after:retryAfter});
        if(!response.ok){
          await response.body?.cancel?.().catch(()=>{});
          const retryable=[429,502,503,504].includes(response.status);
          if(!retryable||attempt===maxRetries)fail('The public source returned HTTP '+response.status+'. No incomplete capture is accepted.',{url,status:response.status,retry_after:retryAfter});
          const wait=retryDelay(retryAfter,attempt,clock);
          check(wait<=maxRetryDelayMs,'The provider requests a longer Retry-After interval. Preserve the partial capture and start a new edition after that interval; do not retry early.',{url,status:response.status,retry_after:retryAfter,wait_ms:wait});
          clearTimeout(timer);onProgress({phase:'retry',url,attempt:attempt+1,wait_ms:wait});await sleep(wait);continue;
        }
        const contentType=response.headers.get('content-type')??'';
        check(/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(contentType),'The public response is not declared JSON.',{url,content_type:contentType});
        // Keep the request timeout active through complete body consumption.
        const bytes=await responseBytes(response,maxResponseBytes);let body;
        try{body=parseExactJSON(utf8(bytes));}catch(error){fail('The complete source is not valid exact UTF-8 JSON.',{url,error:error.message});}
        check(Array.isArray(body),'The Store API returned an incomplete or non-array response.',{url});
        totalBytes+=bytes.length;check(totalBytes<=maxTotalBytes,'The complete selected family exceeds its explicit byte cap.');
        return{bytes,body,contentType,total:positiveCounter(response.headers.get('x-wp-total'),'X-WP-Total',{allowZero:true}),pages:positiveCounter(response.headers.get('x-wp-totalpages'),'X-WP-TotalPages',{allowZero:true})};
      }catch(error){
        if(error.code==='LOADED_BIKES_REFRESH')throw error;
        attempts.push({url,attempt:attempt+1,at:new Date(clock()).toISOString(),status:null,error:String(error.message??error)});
        if(signal?.aborted)fail('The source refresh was canceled.');
        if(attempt===maxRetries)fail('The original public source could not be read after bounded retries.',{url,attempts:attempt+1,error:String(error.message??error)});
        const wait=Math.min(1000*2**attempt,maxRetryDelayMs);clearTimeout(timer);onProgress({phase:'retry',url,attempt:attempt+1,wait_ms:wait});await sleep(wait);
      }finally{clearTimeout(timer);signal?.removeEventListener('abort',forward);}
    }
  }
  async function collect(parameters,label){
    let page=1,declaredTotal=null,declaredPages=null,count=0;
    for(;;){
      abort();check(page<=100,'The selected source query exceeds one hundred pages.');
      const params={...parameters,per_page:'100',page:String(page)},url=origin+'/wp-json/wc/store/v1/products?'+Object.entries(params).map(([key,value])=>encodeURIComponent(key)+'='+encodeURIComponent(value)).join('&');
      onProgress({phase:'request',url,page});
      const result=await request(url);
      check(result.body.length<=100,'The source exceeded the requested complete page size.');
      if(page===1){declaredTotal=result.total;declaredPages=result.pages;check(declaredPages===null||declaredPages<=100,'The selected source declares more than one hundred pages.');}
      else{
        if(declaredTotal!==null)check(result.total===declaredTotal,'The source population changed between pages; retain this partial capture and refresh a new edition.');
        if(declaredPages!==null)check(result.pages===declaredPages,'The source page count changed between pages; retain this partial capture and refresh a new edition.');
      }
      const path='originals/'+label+'-page-'+String(page).padStart(3,'0')+'.json';
      const response={id:label+'-page-'+page,path,url,retrieved_date:new Date(clock()).toISOString().slice(0,10),retrieved_at:new Date(clock()).toISOString(),provider:'Node built-in fetch; complete public Store API response',content_type:result.contentType,bytes:result.bytes.length,sha256:sha256(result.bytes),product_ids:result.body.map(product=>originalId(product.id)),content_base64:base64(result.bytes)};
      responses.push(response);await onResponse(response,result.bytes);
      for(const product of result.body){
        const id=originalId(product.id);check(typeof product.parent==='string'&&/^(?:0|[1-9][0-9]*)$/.test(product.parent),'Retain each original parent token.');
        if(records.has(id))check(canonical(records.get(id))===canonical(product),'A product changed between complete source responses. Preserve the partial edition rather than mixing revisions.',{id});
        else records.set(id,product);
        occurrences.set(id,(occurrences.get(id)??0)+1);
      }
      count+=result.body.length;
      if(declaredPages!==null){check(declaredPages!==0||result.body.length===0,'An empty page count conflicts with a nonempty response.');if(page>=declaredPages)break;}
      else if(result.body.length<100)break;
      page++;
    }
    if(declaredTotal!==null)check(count===declaredTotal,'The complete returned population differs from X-WP-Total.');
  }
  let batch=0;
  for(const selected of chunks(ids,100))await collect({include:selected.join(',')},'parents-ids-'+String(++batch).padStart(3,'0'));
  batch=0;for(const selected of chunks(selectedSlugs,20))await collect({slug:selected.join(',')},'parents-slugs-'+String(++batch).padStart(3,'0'));
  const parents=[...records.values()].filter(p=>p.parent==='0');
  check(parents.length>0&&parents.length<=200,'The selected public source contains no parents or exceeds the bounded family.');
  for(const id of ids)check(parents.some(p=>p.id===id),'A requested ID is absent or is a variation rather than a parent.',{id});
  for(const slug of selectedSlugs)check(parents.some(p=>p.slug===slug),'A requested product slug has no complete original parent.',{slug});
  check(parents.every(p=>ids.includes(p.id)||selectedSlugs.includes(p.slug)),'The source returned an unselected parent; review the original API query.');
  const variants=new Set();
  for(const parent of parents){
    check(['simple','variable'].includes(parent.type)&&Array.isArray(parent.variations),'The selected source is not an original simple/variable product.');
    for(const variation of parent.variations){const id=originalId(variation.id);check(!variants.has(id),'Two selected parents declare the same original variant.',{id});variants.add(id);}
  }
  check(variants.size<=10000,'The selected family exceeds ten thousand declared variants.');
  batch=0;for(const selected of chunks([...variants],100))await collect({type:'variation',include:selected.join(',')},'variants-'+String(++batch).padStart(3,'0'));
  check([...records.values()].every(p=>p.parent==='0'||variants.has(p.id)),'The source returned an unrelated undeclared variation.');
  const completed=new Date(clock()).toISOString(),capture={
    schema:'tjlabs.loaded-bikes.catalogue-capture.v1',
    scope:{seller:'Loaded Bikes Limited',site:origin,family:'Explicitly selected public product parents and all their declared variations',retrieved_date:completed.slice(0,10),parent_product_count:parents.length,declared_variation_count:variants.size,original_response_count:responses.length,all_declared_variations_received:true,original_customer_stock_supplier_bom_or_target_erp_data:false},
    selection:{parent_ids:ids,slugs:selectedSlugs,resolved_parent_ids:parents.map(p=>p.id)},
    acquisition:{started_at:started,completed_at:completed,source_atomicity:'Separate original public HTTP responses; changed duplicate records and inconsistent pagination are rejected, not presented as an atomic database snapshot.',attempts},
    responses,
    source_semantics:{product_identity:'Original WooCommerce ID and parent; slug and SKU are not assumed unique.',variation_identity:'Every original parent declaration binds the complete original variation response.',prices:'Original exact minor-unit tokens and currency scale; parent ranges are distinct from child prices.',availability:'Public boolean availability; missing stock counts are unknown, never zero.',description:'Complete original publisher HTML remains source text; no source claim is silently corrected.',source_scope:'Public retail catalogue and published claims only; no private ERP, supplier, production BOM or stock data.'},
    duplicate_snapshots:[...occurrences].filter(([,count])=>count>1).map(([id,count])=>({id,equal_complete_object:true,occurrences:count})),
  };
  // The independent original-source validator checks all children, fields and types.
  const expected=projectExpectedCatalogue(capture);
  onProgress({phase:'complete',parents:parents.length,variants:variants.size,responses:responses.length,bytes:totalBytes});
  return{capture,summary:{parents:parents.length,variants:variants.size,responses:responses.length,bytes:totalBytes,tables:Object.fromEntries(Object.entries(expected).map(([name,rows])=>[name,rows.length]))}};
}

const usage='Usage: node refresh-catalogue.mjs --output NEW_DIRECTORY (--parent-id ORIGINAL_ID | --slug ORIGINAL_SLUG)... [--prior-capture FILE --prior-claims FILE]';
function argumentsFor(argv){
  const options={parentIds:[],slugs:[]};const names={'--output':'output','--prior-capture':'priorCapture','--prior-claims':'priorClaims','--base-url':'baseUrl'};
  for(let i=0;i<argv.length;i++){
    const key=argv[i];if(key==='--help'||key==='-h')return{help:true};
    check(key==='--parent-id'||key==='--slug'||ownArgument(names,key),'Unknown refresh argument: '+key);
    const value=argv[++i];check(value!==undefined&&!value.startsWith('--'),'Supply a value after '+key+'.');
    if(key==='--parent-id')options.parentIds.push(value);else if(key==='--slug')options.slugs.push(value);else{check(options[names[key]]===undefined,'Do not repeat '+key+'.');options[names[key]]=value;}
  }
  check(options.output,'Choose a new output directory.');check(!options.priorClaims||options.priorCapture,'A previous semantic companion needs its complete original capture.');return options;
}
const ownArgument=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
async function absent(path){try{await stat(path);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}}
async function writeExclusive(path,bytes){await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes,{flag:'wx',mode:0o600});}
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');

export async function runRefreshCLI(argv=process.argv.slice(2)){
  const options=argumentsFor(argv);if(options.help){process.stdout.write(usage+'\n');return null;}
  const output=resolve(options.output);check(await absent(output),'Use a new output directory; an existing source edition is never overwritten.',{output});
  let priorCaptureBytes=null,priorClaimsBytes=null,priorCapture=null,priorClaims=null;
  if(options.priorCapture){
    priorCaptureBytes=await readFile(resolve(options.priorCapture));priorCapture=JSON.parse(priorCaptureBytes.toString('utf8'));projectExpectedCatalogue(priorCapture);
    if(options.priorClaims){priorClaimsBytes=await readFile(resolve(options.priorClaims));priorClaims=JSON.parse(priorClaimsBytes.toString('utf8'));verifySourceClaims({catalogue:priorCapture,claims:priorClaims});}
  }
  await mkdir(dirname(output),{recursive:true});
  const staging=output+'.partial-'+randomUUID();await mkdir(staging,{recursive:false,mode:0o700});
  const written=[];let capture=null;
  try{
    const result=await captureLoadedBikesCatalogue({
      parentIds:options.parentIds,slugs:options.slugs,baseUrl:options.baseUrl,
      onProgress:value=>process.stderr.write(JSON.stringify(value)+'\n'),
      onResponse:async(response,bytes)=>{await writeExclusive(join(staging,response.path),bytes);written.push({path:response.path,bytes:response.bytes,sha256:response.sha256,url:response.url});},
    });
    capture=result.capture;const complete=jsonBytes(capture);await writeExclusive(join(staging,'catalogue-capture.json'),complete);
    const prior=[];
    if(priorCaptureBytes){await writeExclusive(join(staging,'prior-edition/catalogue-capture.json'),priorCaptureBytes);prior.push({path:'prior-edition/catalogue-capture.json',bytes:priorCaptureBytes.length,sha256:sha256(priorCaptureBytes)});}
    if(priorClaimsBytes){await writeExclusive(join(staging,'prior-edition/source-claims.json'),priorClaimsBytes);prior.push({path:'prior-edition/source-claims.json',bytes:priorClaimsBytes.length,sha256:sha256(priorClaimsBytes)});}
    const oldIdentity=priorCapture?.responses.map(r=>({path:r.path,bytes:r.bytes,sha256:r.sha256})).sort((a,b)=>a.path.localeCompare(b.path));
    const newIdentity=capture.responses.map(r=>({path:r.path,bytes:r.bytes,sha256:r.sha256})).sort((a,b)=>a.path.localeCompare(b.path));
    const receipt={schema:'tjlabs.loaded-bikes-catalogue-refresh.v1',complete:true,capture:{path:'catalogue-capture.json',bytes:complete.length,sha256:sha256(complete)},summary:result.summary,originals:written,prior_edition:prior,
      prior_claims:{status:priorClaims?'preserved-as-prior-edition':'not-supplied',original_response_identities_unchanged:oldIdentity?canonical(oldIdentity)===canonical(newIdentity):null,current_claims_generated:false,meaning:'Prior semantic claims remain bound to their original source. Review a new semantic edition against the new response pointers before presenting it as current.'}};
    await writeExclusive(join(staging,'REFRESH.json'),jsonBytes(receipt));
    // Atomically reserve this new edition; never rename over a pre-existing destination.
    await mkdir(output,{recursive:false,mode:0o700});
    await rename(staging,output);process.stdout.write(JSON.stringify({directory:output,...receipt},null,2)+'\n');return receipt;
  }catch(error){
    const failure={schema:'tjlabs.loaded-bikes-catalogue-refresh.v1',complete:false,originals:written,error:{code:error.code??error.name,message:error.message,details:error.details??{}},meaning:'This is an incomplete preserved acquisition, not a usable catalogue or current semantic claim edition.'};
    await writeExclusive(join(staging,'FAILED_REFRESH.json'),jsonBytes(failure)).catch(()=>{});
    error.message+=' Partial original responses, if any, are retained at '+staging;throw error;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runRefreshCLI().catch(error=>{process.stderr.write(JSON.stringify({error:{code:error.code??error.name,message:error.message,details:error.details??{}}})+'\n');process.exitCode=1;});
}
