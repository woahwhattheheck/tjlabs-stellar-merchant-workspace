// MIT. Original IATI console client. All values and native query parameters retain their source strings.
import { createOrganisationReconciliationClient } from './organisation_reconciliation_client.mjs';
import { createDocumentEvidenceClient } from './document_evidence_client.mjs';
import { open, lstat, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { Readable } from 'node:stream';
import { isAbsolute, resolve, dirname } from 'node:path';
const HASH=/^[0-9a-f]{64}$/;
const problem=(code,message)=>Object.assign(new Error(message),{code:'IATI_'+code});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hash=value=>{if(!HASH.test(value??''))throw problem('SELECTION','Use the full retained source, plan, build or portfolio SHA-256.');return value;};
const revision=value=>{if(value!==undefined&&(!Number.isSafeInteger(value)||value<1))throw problem('REVISION','Select a positive original portfolio revision.');return value;};
const query=values=>{const q=new URLSearchParams();for(const[key,value]of Object.entries(values))if(value!==undefined)q.set(key,String(value));return q.toString();};


// Original consoles use HTTP/1.0. Use the same native HTTP carrier as Merchant:
// affected built-in Undici versions crash on socket EOF while a body is paused
// (nodejs/undici#5360). Request/Response keep the public body APIs; node:http
// carries the socket and Readable adapters preserve backpressure and cancellation.
function originalConsoleResponse(url, options) {
 const input=new Request(url,{...options,redirect:'error',duplex:'half'});
 const headers=Object.fromEntries(input.headers);
 if(!input.headers.has('content-length')){
  if(typeof options.body==='string'||Buffer.isBuffer(options.body))
   headers['content-length']=String(Buffer.byteLength(options.body));
  else if(options.body instanceof Blob)headers['content-length']=String(options.body.size);
 }
 return new Promise((resolveResponse,reject)=>{
  const outgoing=httpRequest(url,{method:input.method,headers,signal:input.signal},incoming=>{
   incoming.once('error',reject);
   try{
    const status=incoming.statusCode??0;
    if([301,302,303,307,308].includes(status))
     throw problem('REDIRECT','The original local console cannot redirect this request.');
    const responseHeaders=new Headers();
    for(let index=0;index<incoming.rawHeaders.length;index+=2)
     responseHeaders.append(incoming.rawHeaders[index],incoming.rawHeaders[index+1]);
    const empty=[204,205,304].includes(status)||input.method==='HEAD';
    const response=new Response(empty?null:Readable.toWeb(incoming,{strategy:{highWaterMark:incoming.readableHighWaterMark,size:chunk=>chunk.byteLength}}),{
     status,statusText:incoming.statusMessage??'',headers:responseHeaders});
    Object.defineProperty(response,'url',{value:url});
    if(empty)incoming.resume();
    resolveResponse(response);
   }catch(error){incoming.destroy(error);reject(error);}
  });
  outgoing.once('error',reject);
  if(input.body){
   const source=Readable.fromWeb(input.body);
   const sourceError=error=>outgoing.destroy(error);
   source.once('error',sourceError);
   outgoing.once('close',()=>{
    source.off('error',sourceError);source.unpipe(outgoing);source.destroy();
   });
   source.pipe(outgoing);
  }else outgoing.end();
 });
}

/** Connect to the exact private URL printed by the original local IATI server.
 * The client borrows that running workspace and never stops its process.
 * Calling dispose aborts only this client's pending HTTP reads and requests.
 */
export class IatiWorkspaceClient{
 #origin;#token;#controller=new AbortController();#pending=new Set();#closed=false;#timeout;
 constructor(consoleUrl,{timeoutMs=240000}={}){
  let selected;try{selected=new URL(consoleUrl);}catch{throw problem('CONNECTION','Use the original private console URL.');}
  const port=selected.port===''?80:Number(selected.port);
  if(selected.protocol!=='http:'||selected.hostname!=='127.0.0.1'||
    !Number.isInteger(port)||port<1||port>65535||
    selected.pathname!=='/'||selected.username||selected.password||selected.search||
    !/^[A-Za-z0-9_-]{32,256}$/.test(selected.hash.slice(1)))
    throw problem('CONNECTION','Use the complete loopback console URL without altering its private fragment.');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>900000)throw problem('TIMEOUT','Choose a request timeout from 1 to 900000 milliseconds.');
  this.#origin=selected.origin;this.#token=selected.hash.slice(1);this.#timeout=timeoutMs;
  Object.defineProperty(this, 'organisationReconciliation', { enumerable: true, value:
   createOrganisationReconciliationClient((path, options) => this.#request(path, options)) });
  Object.defineProperty(this, 'documentEvidence', { enumerable: true, value:
   createDocumentEvidenceClient((path, options) => this.#request(path, options)) });
 }
 get origin(){return this.#origin;}
 async #request(path,{body,headers={},signal,raw=false,maximum=16*1024*1024}={}){
  if(this.#closed)throw problem('CLOSED','This borrowed console client is closed.');
  const signals=[this.#controller.signal,AbortSignal.timeout(this.#timeout),...(signal?[signal]:[])];
  const selected=AbortSignal.any(signals);
  const task=(async()=>{
   const response=await originalConsoleResponse(this.#origin+path,{method:body===undefined?'GET':'POST',redirect:'error',
    headers:{...headers,authorization:'Bearer '+this.#token},signal:selected,
    ...(body===undefined?{}:{body,...(typeof body==='string'||Buffer.isBuffer(body)||body instanceof Blob?{}:{duplex:'half'})})});
   if(raw&&response.ok)return response;
   let total=0;const chunks=[];
   for await(const chunk of response.body??[]){total+=chunk.length;if(total>maximum)throw problem('RESPONSE_LIMIT','Read the full native file export for this response.');chunks.push(chunk);}
   let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,total)));}
   catch{throw problem('RESPONSE','The original console returned no complete JSON response.');}
   if(!response.ok){const error=problem('HTTP_'+response.status,typeof value.error==='string'?value.error:'The original local operation was rejected.');error.status=response.status;error.details=value;throw error;}
   return value;
  })();
  this.#pending.add(task);try{return await task;}finally{this.#pending.delete(task);}
 }
 #post(path,value,options){if(!object(value))throw problem('INPUT','Use an original object payload.');
  const data=JSON.stringify(value);if(Buffer.byteLength(data)>131072)throw problem('INPUT_LIMIT','The native JSON selection exceeds 128 KiB.');
  return this.#request(path,{...options,headers:{'content-type':'application/json'},body:data});}
 async state(options){const result=await this.#request('/api/state',options);
  if(result.schema!=='stellar-forge.iati-workspace.v1')throw problem('WORKSPACE','This console names a different source format.');return result;}
 launch(options){return this.#request('/api/launch',options);}
 source(id,options){return this.#request('/api/source?'+query({id:hash(id)}),options);}
 plan(id,options){return this.#request('/api/plan?'+query({id:hash(id)}),options);}
 savePlan(plan,options){return this.#post('/api/plan',plan,options);}
 build(source,plan,options){return this.#post('/api/build',{source:hash(source),plan:hash(plan)},options);}
 query(build,params={},options){if(!object(params)||Object.values(params).some(v=>typeof v!=='string'))throw problem('QUERY','Pass native query parameters as exact scalar strings.');
  return this.#post('/api/query',{build:hash(build),query:params},options);}
 compare(before,after,options){return this.#post('/api/compare',{before:hash(before),after:hash(after)},options);}
 changes(id,{offset=0,limit=50,...options}={}){if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>250)throw problem('PAGE','Choose a bounded original change page.');
  return this.#request('/api/changes?'+query({id:hash(id),offset,limit}),options);}
 presets(options){return this.#request('/api/iati/presets',options);}
 profile(source,options){return this.#request('/api/iati/profile?'+query({source:hash(source)}),options);}
 portfolios(options){return this.#request('/api/iati/portfolios',options);}
 portfolio(id,{revision:selectedRevision,...options}={}){return this.#request('/api/iati/portfolio?'+query({id:hash(id),revision:revision(selectedRevision)}),options);}
 history(id,options){return this.#request('/api/iati/history?'+query({portfolio:hash(id)}),options);}
 savePortfolio(input,options){return this.#post('/api/iati/portfolio',input,options);}
 report(id,{revision:selectedRevision,...options}={}){return this.#request('/api/iati/report?'+query({portfolio:hash(id),revision:revision(selectedRevision)}),options);}
 comparePortfolio(input,options){return this.#post('/api/iati/compare',input,options);}
 /** Returned Response owns the full native ZIP/JSONL stream; consume or cancel it. */
 export(kind,id,{revision:selectedRevision,...options}={}){
  const routes={project:['/api/export','build'],dataset:['/api/dataset-export','build'],
   changes:['/api/changes/download','id'],portfolio:['/api/iati/export','portfolio'],
   report:['/api/iati/report/export','portfolio']};
  if(!routes[kind])throw problem('EXPORT','Choose the complete native project, dataset, changes, portfolio or report export.');
  if(selectedRevision!==undefined&&!['portfolio','report'].includes(kind))throw problem('REVISION','Native build and change IDs already select immutable editions.');
  const [path,key]=routes[kind];
  return this.#request(path+'?'+query({[key]:hash(id),revision:revision(selectedRevision)}),{...options,raw:true});
 }
 /** The caller supplies a complete original source stream and its observed byte count. */
 ingest({body,bytes,name='source.xml',label=name},options={}){
  if(!Number.isSafeInteger(bytes)||bytes<1||bytes>256*1024*1024)throw problem('SOURCE_SIZE','Choose a complete source up to 256 MiB.');
  return this.#request('/api/source',{...options,body,headers:{'content-type':'application/xml','content-length':String(bytes),
   'X-IATI-Name':encodeURIComponent(name),'X-IATI-Label':encodeURIComponent(label)}});
 }
 receive({body,bytes,kind='portfolio'},options={}){
  if(!['portfolio','project'].includes(kind)||!Number.isSafeInteger(bytes)||bytes<1||bytes>4*1024*1024*1024)
   throw problem('PACKET','Choose a complete original source packet up to 4 GiB.');
  return this.#request(kind==='portfolio'?'/api/iati/receive':'/api/import',{...options,body,
   headers:{'content-type':'application/zip','content-length':String(bytes)}});
 }

 /** Native DQA: selected provider credentials stay in that console's host environment. */
 #dqaPost(route,value,options={}){if(!object(value))throw problem('INPUT','Use a complete DQA object payload.');
  const data=JSON.stringify(value);if(Buffer.byteLength(data)>64*1024*1024)throw problem('INPUT_LIMIT','The complete DQA selection exceeds 64 MiB.');
  return this.#request('/api/iati/dqa/'+route,{...options,maximum:64*1024*1024,headers:{'content-type':'application/json'},body:data});}
 dqaProviders(options){return this.#request('/api/iati/dqa/providers',options);}
 dqaSaveProvider(input,options){return this.#dqaPost('provider',input,options);}
 dqaCapture(input,options){return this.#dqaPost('capture',input,options);}
 dqaAssessments(options){return this.#request('/api/iati/dqa/assessments',{...options,maximum:64*1024*1024});}
 dqaAssessment(id,options){return this.#request('/api/iati/dqa/assessment?'+query({id:hash(id)}),{...options,maximum:64*1024*1024});}
 dqaFindings(id,{offset=0,limit=50,status='',search='',...options}={}){return this.#request('/api/iati/dqa/findings?'+query({id:hash(id),offset,limit,status,search}),{...options,maximum:64*1024*1024});}
 dqaCases(options){return this.#request('/api/iati/dqa/cases',{...options,maximum:64*1024*1024});}
 dqaCase(id,{revision:selectedRevision,...options}={}){return this.#request('/api/iati/dqa/case?'+query({id:hash(id),revision:revision(selectedRevision)}),{...options,maximum:64*1024*1024});}
 dqaHistory(id,options){return this.#request('/api/iati/dqa/history?'+query({case:hash(id)}),{...options,maximum:64*1024*1024});}
 dqaSaveCase(input,options){return this.#dqaPost('case',input,options);}
 dqaCompare(before,after,options){return this.#dqaPost('compare',{before:hash(before),after:hash(after)},options);}
 dqaComparison(id,{offset=0,limit=50,...options}={}){return this.#request('/api/iati/dqa/comparison?'+query({id:hash(id),offset,limit}),{...options,maximum:64*1024*1024});}
 dqaOperations({offset=0,limit=50,...options}={}){return this.#request('/api/iati/dqa/operations?'+query({offset,limit}),{...options,maximum:64*1024*1024});}
 dqaExport(id,{revision:selectedRevision,...options}={}){return this.#request('/api/iati/dqa/export?'+query({case:hash(id),revision:revision(selectedRevision)}),{...options,raw:true});}
 dqaFile(id,kind,options){if(!['response','request','configuration-before','configuration-after'].includes(kind))throw problem('DQA_FILE','Select the complete original response, request or configuration observation.');
  return this.#request('/api/iati/dqa/file?'+query({assessment:hash(id),kind}),{...options,raw:true});}
 dqaReceive({body,bytes},options={}){if(!Number.isSafeInteger(bytes)||bytes<1||bytes>4*1024*1024*1024)throw problem('PACKET','Choose a complete original DQA customer ZIP up to 4 GiB.');
  return this.#request('/api/iati/dqa/receive',{...options,maximum:64*1024*1024,body,headers:{'content-type':'application/zip','content-length':String(bytes)}});}


 /** Participant publishing uses the same saved source, revision and native finance workspace. */
 #publishingPost(route,value,options={}){if(!object(value))throw problem('INPUT','Use a complete participant object.');
  const data=JSON.stringify(value);if(Buffer.byteLength(data)>64*1024*1024)throw problem('INPUT_LIMIT','The complete participant selection exceeds 64 MiB.');
  return this.#request('/api/iati/publishing/'+route,{...options,maximum:64*1024*1024,headers:{'content-type':'application/json'},body:data});}
 publishingContext(options){return this.#request('/api/iati/publishing/context',options);}
 publishingMethodology(options){return this.#request('/api/iati/publishing/methodology',options);}
 publishingProjects(options){return this.#request('/api/iati/publishing/projects',{...options,maximum:64*1024*1024});}
 publishingProject(id,{revision:selectedRevision,...options}={}){return this.#request('/api/iati/publishing/project?'+query({id:hash(id),revision:revision(selectedRevision)}),{...options,maximum:64*1024*1024});}
 publishingHistory(id,options){return this.#request('/api/iati/publishing/history?'+query({id:hash(id)}),{...options,maximum:64*1024*1024});}
 publishingRequest(requestId,options){if(typeof requestId!=='string'||!requestId||requestId.length>160)throw problem('REQUEST','Use the original participant request ID.');
  return this.#request('/api/iati/publishing/request?'+query({requestId}),{...options,maximum:64*1024*1024});}
 publishingActivities(id,{offset=0,limit=50,revision:selectedRevision,...options}={}){return this.#request('/api/iati/publishing/activities?'+query({id:hash(id),offset,limit,revision:revision(selectedRevision)}),{...options,maximum:64*1024*1024});}
 publishingFields(id,activity,{revision:selectedRevision,...options}={}){if(typeof activity!=='string'||!activity||activity.length>1000)throw problem('ACTIVITY','Use one original activity identifier.');
  return this.#request('/api/iati/publishing/fields?'+query({id:hash(id),activity,revision:revision(selectedRevision)}),{...options,maximum:64*1024*1024});}
 publishingPreview(input,options){return this.#publishingPost('preview',input,options);}
 publishingSave(action,input,options){if(!['create','feedback','evidence','triage','correct','candidate','finance','review','release'].includes(action))throw problem('ACTION','Choose a supported participant action.');
  return this.#publishingPost(action,input,options);}
 publishingExport(id,{revision:selectedRevision,...options}={}){return this.#request('/api/iati/publishing/export?'+query({id:hash(id),revision:revision(selectedRevision)}),{...options,raw:true});}
 publishingSource(id,{revision:selectedRevision,edition='candidate',...options}={}){if(!['candidate','baseline'].includes(edition))throw problem('SOURCE','Select the original baseline or candidate.');
  return this.#request('/api/iati/publishing/source?'+query({id:hash(id),revision:revision(selectedRevision),edition}),{...options,raw:true});}
 publishingReceive({body,bytes},options={}){if(!Number.isSafeInteger(bytes)||bytes<1||bytes>4*1024*1024*1024)throw problem('PACKET','Choose a complete original participant release up to 4 GiB.');
  return this.#request('/api/iati/publishing/receive',{...options,maximum:64*1024*1024,body,headers:{'content-type':'application/zip','content-length':String(bytes)}});}

 #refreshPost(action,input,options){return this.#post('/api/iati/refresh/'+action,input,{...options,maximum:64*1024*1024});}
 #refreshPage(route,selected,{offset=0,limit=50,snapshot,...options}={}){
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>250)
   throw problem('PAGE','Choose a saved refresh offset and a limit from 1 to 250.');
  if(offset>0&&snapshot===undefined)throw problem('PAGE','Continue the original refresh page snapshot.');
  if(snapshot!==undefined)hash(snapshot);
  return this.#request('/api/iati/refresh/'+route+'?'+query({...selected,offset,limit,snapshot}),{...options,maximum:64*1024*1024});
 }
 refreshContext(options){return this.#request('/api/iati/refresh/context',options);}
 refreshStatus(plan,options){return this.#request('/api/iati/refresh/status?'+query({plan:hash(plan)}),{...options,maximum:64*1024*1024});}
 refreshPlans(options){return this.#refreshPage('plans',{},options);}
 refreshPlan(id,{revision:selectedRevision,...options}={}){return this.#request('/api/iati/refresh/plan?'+query({id:hash(id),revision:revision(selectedRevision)}),{...options,maximum:64*1024*1024});}
 refreshHistory(plan,options){return this.#refreshPage('history',{plan:hash(plan)},options);}
 refreshRuns(plan,options){return this.#refreshPage('runs',{plan:hash(plan)},options);}
 refreshRun(plan,id,{revision:selectedRevision,...options}={}){return this.#request('/api/iati/refresh/run?'+query({plan:hash(plan),id:hash(id),revision:revision(selectedRevision)}),{...options,maximum:64*1024*1024});}
 refreshRunHistory(plan,id,options){return this.#refreshPage('run-history',{plan:hash(plan),id:hash(id)},options);}
 refreshRequest(requestId,options){if(typeof requestId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(requestId))throw problem('REQUEST','Use the original refresh request ID.');
  return this.#request('/api/iati/refresh/request?'+query({requestId}),{...options,maximum:64*1024*1024});}
 refreshPreview(input,options){return this.#refreshPost('preview',input,options);}
 refreshSave(action,input,options){if(!['plan-save','start','review','promote','cancel','abandon'].includes(action))throw problem('ACTION','Choose an original saved publisher-refresh action.');
  return this.#refreshPost(action,input,options);}
 refreshResume(requestId,options){if(typeof requestId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(requestId))throw problem('REQUEST','Use the exact saved refresh request ID.');
  return this.#refreshPost('resume',{requestId},options);}
 refreshExport(plan,{snapshot,...options}={}){if(snapshot!==undefined)hash(snapshot);
  return this.#request('/api/iati/refresh/export?'+query({plan:hash(plan),snapshot}),{...options,raw:true});}
 refreshReceive({body,bytes},options={}){if(!Number.isSafeInteger(bytes)||bytes<1||bytes>4*1024*1024*1024)throw problem('PACKET','Select the complete original refresh ZIP, up to 4 GiB.');
  return this.#request('/api/iati/refresh/receive',{...options,maximum:64*1024*1024,body,headers:{'content-type':'application/zip','content-length':String(bytes)}});}

 /** Complete organisation planning through the same original authenticated console. */
 #organisationPost(route,input,options={}){
  if(!object(input))throw problem('INPUT','Use a complete organisation action object.');
  const body=JSON.stringify(input);
  if(Buffer.byteLength(body)>64*1024*1024)throw problem('INPUT_LIMIT','The complete organisation request exceeds 64 MiB.');
  return this.#request('/api/iati/organisation/'+route,{...options,maximum:64*1024*1024,headers:{'content-type':'application/json'},body});
 }
 #organisationSelection(input){
  if(!object(input))throw problem('SELECTION','Select the original organisation source or saved revision.');
  const selected={...input};
  if(Object.hasOwn(selected,'sourceId')){
   hash(selected.sourceId);
   if(Object.hasOwn(selected,'id')||Object.hasOwn(selected,'revision')||selected.view!==undefined&&selected.view!=='source')
    throw problem('SELECTION','Select one original source edition for this read.');
  }else{
   hash(selected.id);
   if(selected.revision===undefined)throw problem('REVISION','Select the explicit saved organisation revision.');
   revision(selected.revision);
   if(selected.view!==undefined&&!['source','candidate'].includes(selected.view))throw problem('SELECTION','Select source or candidate records.');
  }
  if(selected.expectedSnapshot!==undefined)hash(selected.expectedSnapshot);
  if(selected.organisationKey!==undefined)hash(selected.organisationKey);
  return selected;
 }
 organisationStatus(options){return this.#request('/api/iati/organisation/status',{...options,maximum:64*1024*1024});}
 organisationProfile(sourceId,options){return this.#request('/api/iati/organisation/profile?'+query({sourceId:hash(sourceId)}),{...options,maximum:64*1024*1024});}
 organisationPlan(id,{revision:selectedRevision,...options}={}){return this.#request('/api/iati/organisation/plan?'+query({id:hash(id),revision:revision(selectedRevision)}),{...options,maximum:64*1024*1024});}
 organisationHistory(id,options){return this.#request('/api/iati/organisation/history?'+query({id:hash(id)}),{...options,maximum:64*1024*1024});}
 organisationRequest(requestId,options){
  if(typeof requestId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(requestId))throw problem('REQUEST','Use the original organisation request ID.');
  return this.#request('/api/iati/organisation/request?'+query({requestId}),{...options,maximum:64*1024*1024});
 }
 organisationRows(input,options){
  const selected=this.#organisationSelection(input);
  if(!['budgets','documents','issues'].includes(selected.section))throw problem('SECTION','Select budgets, documents or issues.');
  for(const [key,fallback,min,max]of [['offset',0,0,Number.MAX_SAFE_INTEGER],['limit',50,1,250]]){
   selected[key]??=fallback;
   if(!Number.isSafeInteger(selected[key])||selected[key]<min||selected[key]>max)throw problem('PAGE','Choose an original organisation register page.');
  }
  return this.#request('/api/iati/organisation/rows?'+query(selected),{...options,maximum:64*1024*1024});
 }
 organisationDetail(input,options){
  const selected=this.#organisationSelection(input);hash(selected.rowId);if(selected.targetId!==undefined)hash(selected.targetId);
  return this.#request('/api/iati/organisation/detail?'+query(selected),{...options,maximum:64*1024*1024});
 }
 organisationSave(input,options){return this.#organisationPost('save',input,options);}
 organisationReview(input,options){return this.#organisationPost('review',input,options);}
 organisationRelease(input,options){return this.#organisationPost('release',input,options);}
 organisationCompare(input,options){return this.#organisationPost('compare',input,options);}
 organisationExport(id,{revision:selectedRevision,...options}={}){
  return this.#request('/api/iati/organisation/export?'+query({id:hash(id),revision:revision(selectedRevision)}),{...options,raw:true});
 }
 organisationFile(id,kind,{revision:selectedRevision,...options}={}){
  if(!['source','candidate','report','budgets','documents'].includes(kind))throw problem('FILE','Select a complete organisation source, candidate, report, budget register or document register.');
  return this.#request('/api/iati/organisation/file?'+query({id:hash(id),kind,revision:revision(selectedRevision)}),{...options,raw:true});
 }
 organisationReceive({body,bytes},options={}){
  if(!Number.isSafeInteger(bytes)||bytes<1||bytes>4*1024*1024*1024)throw problem('PACKET','Choose the complete original organisation ZIP up to 4 GiB.');
  return this.#request('/api/iati/organisation/receive',{...options,maximum:64*1024*1024,body,headers:{'content-type':'application/zip','content-length':String(bytes)}});
 }

 // Results reuse this exact borrowed console and its original request journal.
 #resultsPost(route,value,options={}){if(!object(value))throw problem('INPUT','Use a complete results definition.');
  const data=JSON.stringify(value);if(Buffer.byteLength(data)>64*1024*1024)throw problem('INPUT_LIMIT','The complete results selection exceeds 64 MiB.');
  return this.#request('/api/iati/results/'+route,{...options,maximum:64*1024*1024,headers:{'content-type':'application/json'},body:data});}
 resultsInventory(options){return this.#request('/api/iati/results',{...options,maximum:64*1024*1024});}
 resultsSource(source,options){return this.#resultsPost('source',{source:hash(source)},options);}
 resultsIndicators(projection,{offset=0,limit=50,search='',measure='',...options}={}){
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100||typeof search!=='string'||search.length>256||typeof measure!=='string')
   throw problem('PAGE','Select an original projection, nonnegative offset, 1–100 rows and bounded search.');
  return this.#request('/api/iati/results/indicators?'+query({projection:hash(projection),offset,limit,search,measure}),{...options,maximum:64*1024*1024});}
 resultsIndicator(projection,key,options){return this.#request('/api/iati/results/indicator?'+query({projection:hash(projection),key:hash(key)}),{...options,maximum:64*1024*1024});}
 resultsPreview(definition,options){return this.#resultsPost('preview',definition,options);}
 resultsSave(input,options){return this.#resultsPost('save',input,options);}
 resultsCompare(input,options){return this.#resultsPost('compare',input,options);}
 resultsAdopt(input,options){return this.#resultsPost('adopt',input,options);}
 resultsCancel(input,options){return this.#resultsPost('cancel',input,options);}
 resultsRequest(requestId,options){if(typeof requestId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(requestId))throw problem('REQUEST','Use the original complete results request ID.');
  return this.#request('/api/iati/results/operation?'+query({requestId}),{...options,maximum:64*1024*1024});}
 resultsProject(id,{revision:selectedRevision,...options}={}){return this.#request('/api/iati/results/project?'+query({id:hash(id),revision:revision(selectedRevision)}),{...options,maximum:64*1024*1024});}
 resultsReport(id,{revision:selectedRevision,...options}={}){return this.#request('/api/iati/results/report?'+query({id:hash(id),revision:revision(selectedRevision)}),{...options,maximum:64*1024*1024});}
 resultsHistory(id,options){return this.#request('/api/iati/results/history?'+query({id:hash(id)}),{...options,maximum:64*1024*1024});}
 resultsComparisons(id,options){return this.#request('/api/iati/results/comparisons?'+query({id:hash(id)}),{...options,maximum:64*1024*1024});}
 resultsExport(id,{revision:selectedRevision,reportOnly=false,...options}={}){
  if(typeof reportOnly!=='boolean')throw problem('EXPORT','Select the complete editable project or report-only packet.');
  return this.#request('/api/iati/results/'+(reportOnly?'report/export':'export')+'?'+query({id:hash(id),revision:revision(selectedRevision)}),{...options,raw:true});}
 resultsOriginalSource(source,options){return this.#request('/api/iati/results/source/download?'+query({source:hash(source)}),{...options,raw:true});}
 resultsReceive({body,bytes,sha256},options={}){
  if(!Number.isSafeInteger(bytes)||bytes<1||bytes>4*1024*1024*1024)throw problem('PACKET','Choose the complete original results packet up to 4 GiB.');
  if(sha256!==undefined)hash(sha256);
  return this.#request('/api/iati/results/receive',{...options,maximum:64*1024*1024,body,
   headers:{'content-type':'application/zip','content-length':String(bytes),'X-IATI-Results-Bytes':String(bytes),...(sha256===undefined?{}:{'X-IATI-Results-Sha256':sha256})}});}


 // AMP uses the same original authenticated console and full retained native JSON strings.
 #ampPost(route,input,options={}){
  if(!object(input))throw problem('AMP_INPUT','Supply the complete original AMP action.');
  if(!['decision/preview','native/continue'].includes(route)&&
    (typeof input.requestId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(input.requestId)))
   throw problem('AMP_REQUEST','Retain the original AMP requestId.');
  const body=JSON.stringify(input);if(Buffer.byteLength(body)>64*1024*1024)throw problem('AMP_INPUT','Supply a complete AMP JSON request within 64 MiB.');
  return this.#request('/api/iati/amp/'+route,{...options,body,headers:{'content-type':'application/json'},maximum:64*1024*1024});
 }
 ampStatus(options={}){return this.#request('/api/iati/amp/status',{...options,maximum:64*1024*1024});}
 ampCapture(id,options={}){return this.#request('/api/iati/amp/capture?'+query({id:hash(id)}),{...options,maximum:64*1024*1024});}
 ampPlan(id,{revision:selectedRevision,...options}={}){return this.#request('/api/iati/amp/plan?'+query({id:hash(id),revision:revision(selectedRevision)}),{...options,maximum:64*1024*1024});}
 ampHistory(id,options={}){return this.#request('/api/iati/amp/history?'+query({id:hash(id)}),{...options,maximum:64*1024*1024});}
 ampRows(input,options={}){
  if(!object(input))throw problem('AMP_PAGE','Select an original AMP plan and page.');
  const selected={...input,id:hash(input.id),revision:revision(input.revision),offset:input.offset??0,limit:input.limit??50};
  if(!Number.isSafeInteger(selected.offset)||selected.offset<0||selected.offset>1000000||!Number.isSafeInteger(selected.limit)||selected.limit<1||selected.limit>250||
    selected.state!==undefined&&!['included','excluded','review'].includes(selected.state))throw problem('AMP_PAGE','Select an original financial row page.');
  return this.#request('/api/iati/amp/rows?'+query(selected),{...options,maximum:64*1024*1024});
 }
 ampRuns(id,options={}){return this.#request('/api/iati/amp/runs?'+query({id:id===undefined?undefined:hash(id)}),{...options,maximum:64*1024*1024});}
 ampRun(id,options={}){return this.#request('/api/iati/amp/run?'+query({id:hash(id)}),{...options,maximum:64*1024*1024});}
 ampEvents(id,{after=0,limit=100,...options}={}){
  if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>250)throw problem('AMP_PAGE','Select an original native event page.');
  return this.#request('/api/iati/amp/events?'+query({id:hash(id),after,limit}),{...options,maximum:64*1024*1024});
 }
 ampRequest(requestId,options={}){if(typeof requestId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(requestId))throw problem('AMP_REQUEST','Use the original AMP requestId.');return this.#request('/api/iati/amp/request?'+query({requestId}),{...options,maximum:64*1024*1024});}
 ampCaptureImport(input,options){return this.#ampPost('capture',input,options);}
 ampSave(input,options){return this.#ampPost('plan',input,options);}
 ampDecisionPreview(input,options){return this.#ampPost('decision/preview',input,options);}
 ampDecisions(input,options){return this.#ampPost('decision/apply',input,options);}
 ampAdvance(input,options){return this.#ampPost('advance',input,options);}
 ampReview(input,options){return this.#ampPost('review',input,options);}
 ampPrepare(input,options){return this.#ampPost('prepare',input,options);}
 ampNativeCapture(input,options){return this.#ampPost('native/capture',input,options);}
 ampNativeStart(input,options){return this.#ampPost('native/start',input,options);}
 ampNativeContinue(input,options){return this.#ampPost('native/continue',input,options);}
 ampNativeReconcile(input,options){return this.#ampPost('native/reconcile',input,options);}
 ampExport(id,{revision:selectedRevision,...options}={}){return this.#request('/api/iati/amp/export?'+query({id:hash(id),revision:revision(selectedRevision)}),{...options,raw:true});}
 ampFile(id,kind,{revision:selectedRevision,...options}={}){
  if(!['analysis','sourceRows','comparison','prepared','report'].includes(kind))throw problem('AMP_FILE','Select the complete original AMP file.');
  return this.#request('/api/iati/amp/file?'+query({id:hash(id),revision:revision(selectedRevision),kind}),{...options,raw:true});
 }
 ampAsset(sha256,options={}){return this.#request('/api/iati/amp/asset?'+query({sha256:hash(sha256)}),{...options,raw:true});}
 ampReceive({body,bytes},options={}){
  if(!Number.isSafeInteger(bytes)||bytes<1||bytes>4*1024*1024*1024)throw problem('AMP_PACKET','Choose the complete AMP handover ZIP up to 4 GiB.');
  return this.#request('/api/iati/amp/receive',{...options,maximum:64*1024*1024,body,headers:{'content-type':'application/zip','content-length':String(bytes)}});
 }

 async dispose(){if(this.#closed)return;this.#closed=true;this.#controller.abort(problem('CLOSED','The local IATI client is closing.'));
  await Promise.allSettled([...this.#pending]);}
}
async function privateConnection(path){
 if(typeof path!=='string'||!isAbsolute(path)||path.includes('\0'))throw problem('CONNECTION_FILE','Select one absolute private connection file.');
 const target=resolve(path);
 if(await realpath(target)!==target)throw problem('CONNECTION_FILE','Select the real original connection file without symlink aliases.');
 const selected=await lstat(target),parent=await lstat(dirname(target));
 const owner=typeof process.getuid==='function'?process.getuid():selected.uid;
 if(!selected.isFile()||selected.nlink!==1||selected.uid!==owner||(selected.mode&0o077)!==0||
   selected.size<1||selected.size>4096||!parent.isDirectory()||parent.uid!==owner||(parent.mode&0o077)!==0)
  throw problem('CONNECTION_FILE','The original connection must be a private regular file in its private directory.');
 const handle=await open(target,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const first=await handle.stat();
  if(first.dev!==selected.dev||first.ino!==selected.ino||first.size!==selected.size||first.nlink!==1)
   throw problem('CONNECTION_FILE_CHANGED','The selected connection file changed while opening.');
  const data=Buffer.alloc(first.size);let offset=0;
  while(offset<data.length){const {bytesRead}=await handle.read(data,offset,data.length-offset,offset);
   if(!bytesRead)throw problem('CONNECTION_FILE_CHANGED','The selected connection is incomplete.');offset+=bytesRead;}
  const extra=await handle.read(Buffer.alloc(1),0,1,offset),last=await handle.stat(),attached=await lstat(target);
  if(extra.bytesRead||last.dev!==first.dev||last.ino!==first.ino||last.size!==first.size||
    last.mtimeNs!==first.mtimeNs||last.mtimeMs!==first.mtimeMs||last.ctimeMs!==first.ctimeMs||
    last.nlink!==1||attached.dev!==first.dev||attached.ino!==first.ino)
   throw problem('CONNECTION_FILE_CHANGED','The original connection changed during its bounded read.');
  try{return new TextDecoder('utf-8',{fatal:true}).decode(data).trim();}
  catch{throw problem('CONNECTION_FILE','The private connection is not complete UTF-8.');}
 }finally{await handle.close();}
}
export async function connectIatiWorkspace({consoleUrl,consoleUrlFile,timeoutMs}={}){
 if((consoleUrl===undefined)===(consoleUrlFile===undefined))throw problem('CONNECTION','Choose one original console URL or private connection file.');
 if(consoleUrlFile!==undefined)consoleUrl=await privateConnection(consoleUrlFile);
 return new IatiWorkspaceClient(consoleUrl,{timeoutMs});
}
