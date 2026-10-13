#!/usr/bin/env node
// MIT. Operate the original private handover desk with actual retained customer inputs.
import {join,resolve,dirname,basename,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {open,link,unlink} from 'node:fs/promises';
import {constants,createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import {withPrivateLock} from '../../../sf30-seller-sdk/routescan/quota.mjs';
import {ResearchWorkspaceClient} from '../workspace-client.mjs';
import {readResearchHostFile} from '../workspace-files.mjs';
import {customerDirectory,readCustomerJson,retainCustomerBytes,retainCustomerJson,
  describeCustomerFile,copyCustomerFile} from './files.mjs';
import {validateCustomerReturnRequest,validateCustomerReturnReceipt} from '../customer-programme/returns.mjs';
import {startCustomerHandoverDesk} from './handover-desk.mjs';

export const HANDOVER_DESK_RECEIVING_SCHEMA='sf88.research-customer-handover-desk-receiving.v1';
const JSON_LIMIT=16*1024*1024,WIRE_LIMIT=256*1024*1024;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const ordered=v=>Array.isArray(v)?v.map(ordered):object(v)?
 Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
const hash=body=>createHash('sha256').update(body).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
function need(value,code){if(!value)throw Object.assign(new Error(code),{code});}
function absolute(value){need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&value!=='/','DESK_RECEIVING_ABSOLUTE_PATH_REQUIRED');return value;}
function checksum(value){need(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'DESK_RECEIVING_HASH_REQUIRED');return value;}
function fields(value,allowed){need(object(value)&&Object.keys(value).every(k=>allowed.includes(k)),'DESK_RECEIVING_INPUT_FIELDS');}
function safeCode(error){return /^[A-Z][A-Z0-9_]{0,119}$/.test(error?.code??'')?error.code:'DESK_RECEIVING_INCOMPLETE';}
const pause=milliseconds=>new Promise(done=>setTimeout(done,milliseconds));
async function save(root,name,value){
 const file=join(root,name);await customerDirectory(dirname(file));
 return retainCustomerJson(dirname(file),basename(file),value);
}
async function retain(root,name,body){
 const file=join(root,name);await customerDirectory(dirname(file));
 return retainCustomerBytes(dirname(file),basename(file),body);
}
async function snapshot(root,category,value){
 const body=json(value),name=category+'/'+hash(body)+'.json';
 return retain(root,name,body);
}
async function maybe(file){
 try{return await readCustomerJson(file,JSON_LIMIT);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function syncDirectory(path){
 const file=await open(path,constants.O_RDONLY|constants.O_DIRECTORY);
 try{await file.sync();}finally{await file.close();}
}
function validateInput(input){
 fields(input,['schema','connectionFile','workspaceDirectory','selectionFile','selectionSha256','directory','deskDirectory',
  'rounds','playwrightModule','chromiumExecutable','python','node','jobTimeoutMs']);
 need(input.schema===HANDOVER_DESK_RECEIVING_SCHEMA,'DESK_RECEIVING_SCHEMA');
 for(const name of ['connectionFile','selectionFile','directory','playwrightModule','chromiumExecutable'])absolute(input[name]);
 if(input.workspaceDirectory!==undefined)absolute(input.workspaceDirectory);
 if(input.deskDirectory!==undefined)absolute(input.deskDirectory);
 checksum(input.selectionSha256);
 need(Array.isArray(input.rounds)&&input.rounds.length<=32,'DESK_RECEIVING_ROUNDS_REQUIRED');
 const keys=new Set();
 for(const round of input.rounds){
  fields(round,['key','source','review','rejectedReview']);
  need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(round.key??'')&&!keys.has(round.key),'DESK_RECEIVING_ROUND_INVALID');keys.add(round.key);
  if(round.source!==undefined){
   fields(round.source,['file','bytes','sha256','filename','contentType']);absolute(round.source.file);checksum(round.source.sha256);
   need(Number.isSafeInteger(round.source.bytes)&&round.source.bytes>0&&round.source.bytes<=WIRE_LIMIT,'DESK_RECEIVING_SOURCE_LIMIT');
   need(typeof round.source.filename==='string'&&round.source.filename.length>0&&round.source.filename.length<=512&&
    !/[\u0000-\u001f\u007f\\/]/.test(round.source.filename)&&!['.','..'].includes(round.source.filename),'DESK_RECEIVING_FILENAME');
   need(['application/json','application/gzip','application/x-gzip','application/octet-stream'].includes(round.source.contentType),'DESK_RECEIVING_CONTENT_TYPE');
  }
  if(round.review!==undefined){fields(round.review,['file','sha256']);absolute(round.review.file);checksum(round.review.sha256);}
  if(round.rejectedReview!==undefined){fields(round.rejectedReview,['file','sha256','expectedCode']);absolute(round.rejectedReview.file);checksum(round.rejectedReview.sha256);
   need(['RETURN_DECISION_INVALID','RETURN_DECISION_REQUIRED'].includes(round.rejectedReview.expectedCode),'DESK_RECEIVING_REJECTED_REVIEW_CODE');}
 }
 const timeout=input.jobTimeoutMs??30*60*1000;
 need(Number.isSafeInteger(timeout)&&timeout>=1000&&timeout<=24*60*60*1000,'DESK_RECEIVING_TIMEOUT_INVALID');
 return {...input,jobTimeoutMs:timeout,python:input.python??'python3',node:input.node??process.execPath};
}
async function readResponse(response,maximum){
 let bytes=0;const parts=[];
 for await(const chunk of response.body??[]){const part=Buffer.from(chunk);bytes+=part.length;need(bytes<=maximum,'DESK_RECEIVING_RESPONSE_TOO_LARGE');parts.push(part);}
 const body=Buffer.concat(parts,bytes);let value;
 need(Buffer.from(body.toString('utf8'),'utf8').equals(body),'DESK_RECEIVING_RESPONSE_UTF8');
 try{value=JSON.parse(body.toString('utf8'));}catch{throw Object.assign(new Error('DESK_RECEIVING_RESPONSE_JSON'),{code:'DESK_RECEIVING_RESPONSE_JSON'});}
 if(!response.ok)throw Object.assign(new Error(value?.error?.code??'DESK_RECEIVING_HTTP_FAILED'),
  {code:value?.error?.code??'DESK_RECEIVING_HTTP_FAILED',status:response.status});
 return {value,body};
}
function apiFor(url){
 const selected=new URL(url);
 need(selected.protocol==='http:'&&selected.hostname==='127.0.0.1'&&selected.pathname==='/'&&!selected.search,
  'DESK_RECEIVING_HOST_CHANGED');
 const token=new URLSearchParams(selected.hash.slice(1)).get('token');
 need(typeof token==='string'&&token.length>0,'DESK_RECEIVING_TOKEN_REQUIRED');
 const origin=selected.origin;
 const headers=()=>({Authorization:'Bearer '+token,Origin:origin});
 const request=async(path,{method='GET',body,raw,bytes,maximum=JSON_LIMIT}={})=>{
  const h=headers();let payload;
  if(raw!==undefined){h['Content-Type']='application/octet-stream';h['Content-Length']=String(bytes);payload=raw;}
  else if(body!==undefined){h['Content-Type']='application/json';payload=json(body);}
  const response=await fetch(origin+path,{method,headers:h,body:payload,
   ...(raw!==undefined?{duplex:'half'}:{}),redirect:'error',cache:'no-store'});
  return readResponse(response,maximum);
 };
 return {origin,request,headers};
}
function roundPath(key){return '/api/round?'+new URLSearchParams({key});}
function sourceMatch(actual,expected){
 need(actual&&['filename','contentType','bytes','sha256'].every(k=>actual[k]===expected[k]),'DESK_RECEIVING_SOURCE_CHANGED');
}
async function waitJob(api,job,timeout){
 need(job&&typeof job.id==='string','DESK_RECEIVING_JOB_REQUIRED');
 const until=Date.now()+timeout;
 for(;;){
  const status=(await api.request('/api/status')).value;
  need(status.job?.id===job.id,'DESK_RECEIVING_JOB_CHANGED');
  if(status.job.state!=='RUNNING')return status;
  need(Date.now()<until,'DESK_RECEIVING_JOB_TIMEOUT');await pause(250);
 }
}
async function operation(api,action,body,timeout){
 const started=(await api.request('/api/'+action,{method:'POST',body})).value;
 const status=await waitJob(api,started.job,timeout);
 need(status.job.state==='SUCCEEDED',status.job.error?.code??'DESK_RECEIVING_'+status.job.state);
 return status;
}
async function download(api,publicRoot,descriptor){
 need(descriptor&&/^df_[a-f0-9]{64}$/.test(descriptor.id??'')&&
  Number.isSafeInteger(descriptor.bytes)&&descriptor.bytes>=0&&descriptor.bytes<=WIRE_LIMIT,
  'DESK_RECEIVING_DOWNLOAD_DESCRIPTOR');checksum(descriptor.sha256);
 const root=await customerDirectory(join(publicRoot,'downloads')),file=join(root,descriptor.id+'.bin');
 await save(root,descriptor.id+'.json',descriptor);
 try{
  const existing=await describeCustomerFile(file,{maximum:WIRE_LIMIT,...descriptor});
  return {id:descriptor.id,file,bytes:existing.bytes,sha256:existing.sha256,filename:descriptor.filename};
 }catch(error){if(error.code!=='ENOENT')throw error;}
 const response=await fetch(api.origin+'/api/download?'+new URLSearchParams({id:descriptor.id}),
  {headers:api.headers(),redirect:'error',cache:'no-store'});
 need(response.ok&&response.headers.get('content-length')===String(descriptor.bytes)&&
  response.headers.get('x-content-sha256')===descriptor.sha256&&
  response.headers.get('x-content-type-options')==='nosniff'&&
  /^attachment;/.test(response.headers.get('content-disposition')??''),'DESK_RECEIVING_DOWNLOAD_HEADERS');
 const candidate=join(root,'.'+descriptor.id+'-'+randomUUID()+'.part');
 const fd=await open(candidate,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 let bytes=0;const sha=createHash('sha256');
 try{
  for await(const chunk of response.body){
   const body=Buffer.from(chunk);bytes+=body.length;need(bytes<=descriptor.bytes,'DESK_RECEIVING_DOWNLOAD_TOO_LARGE');sha.update(body);
   let offset=0;while(offset<body.length){const result=await fd.write(body,offset,body.length-offset);
    need(result.bytesWritten>0,'DESK_RECEIVING_DOWNLOAD_WRITE');offset+=result.bytesWritten;}
  }
  need(bytes===descriptor.bytes&&sha.digest('hex')===descriptor.sha256,'DESK_RECEIVING_DOWNLOAD_CHANGED');await fd.sync();
 }catch(error){await fd.close();await unlink(candidate).catch(()=>{});throw error;}
 await fd.close();
 try{await link(candidate,file);}catch(error){if(error.code!=='EEXIST')throw error;}
 await describeCustomerFile(file,{maximum:WIRE_LIMIT,...descriptor});await syncDirectory(root);await unlink(candidate);
 return {id:descriptor.id,file,bytes:descriptor.bytes,sha256:descriptor.sha256,filename:descriptor.filename};
}
async function allDownloads(api,root,files){
 const rows=[];for(const file of files??[])rows.push(await download(api,root,file));return rows;
}
async function selectRenderedRound(page,key){
 await page.locator('button[data-round="'+key+'"]').click();
 await page.waitForFunction(key=>document.querySelector('#round-title')?.textContent==='Return '+key,key);
 await page.waitForFunction(()=>!document.querySelector('#round-summary')?.textContent?.startsWith('Loading'));
}
async function reloadRenderedRound(page,key){
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('button[data-round="'+key+'"]').waitFor();await selectRenderedRound(page,key);
}
async function inspectRenderedReview(page,review,value){
 const decisions=new Map(value.decisions.map(row=>[row.itemId,row]));
 need(await page.locator('#reviewer').inputValue()===value.reviewedBy&&
  await page.locator('#review-note').inputValue()===(value.reviewNote??''),'DESK_RECEIVING_RENDERED_REVIEW_CHANGED');
 await page.locator('#filter').selectOption('all');
 const observed=new Set();
 for(;;){
  const rows=await page.locator('[data-item]').evaluateAll(nodes=>nodes.map(node=>{
   const itemId=node.dataset.item,choice=node.querySelector('select[data-choice]')?.value;
   return {itemId,choice,edit:node.querySelector('textarea[data-edit]')?.value};
  }));
  for(const row of rows){
   const selected=decisions.get(row.itemId);need(selected&&selected.choice===row.choice,'DESK_RECEIVING_RENDERED_CHOICE_CHANGED');
   if(selected.choice==='EDIT')need(same(JSON.parse(row.edit),selected.value),'DESK_RECEIVING_RENDERED_EDIT_CHANGED');
   need(!observed.has(row.itemId),'DESK_RECEIVING_RENDERED_ITEM_REPEATED');observed.add(row.itemId);
  }
  if(await page.locator('#next').isDisabled())break;
  await page.locator('#next').click();
 }
 need(observed.size===review.total,'DESK_RECEIVING_RENDERED_ITEM_MISSING');
}
async function retainValues(api,root,key,review){
 const rows=[];
 for(const item of review.items)for(const side of ['base','current','returned']){
  if(!item[side]?.present)continue;
  const {body,value}=await api.request('/api/value?'+new URLSearchParams({key,item:item.id,side}),{maximum:WIRE_LIMIT});
  need(value.reviewId===review.reviewId&&value.itemId===item.id&&value.side===side&&
   value.present===true&&value.sha256===item[side].sha256&&Object.hasOwn(value,'value'),'DESK_RECEIVING_VALUE_CHANGED');
  const saved=await retain(root,'values/'+item.id+'-'+side+'.json',body);
  rows.push({itemId:item.id,side,valueSha256:value.sha256,bytes:saved.bytes,sha256:saved.sha256});
 }
 return rows;
}
async function actualReview(round,root,comparison){
 if(!round?.review)return null;
 const raw=await readResearchHostFile(round.review.file,JSON_LIMIT,{sha256:round.review.sha256});
 need(Buffer.from(raw.toString('utf8'),'utf8').equals(raw),'DESK_RECEIVING_REVIEW_UTF8');
 const request=JSON.parse(raw.toString('utf8'));
 fields(request,['requestId','reviewId','expectedRevision','comparisonSha256','reviewedBy','reviewNote','decisions']);
 need(request.reviewId===comparison.reviewId&&request.comparisonSha256===comparison.comparisonSha256&&
  request.expectedRevision===comparison.current.revision,'DESK_RECEIVING_REVIEW_COMPARISON_CHANGED');
 await retain(root,'review-inputs/'+round.review.sha256+'.json',raw);
 return request;
}
function draftValue(request){
 return {reviewedBy:request.reviewedBy,...(Object.hasOwn(request,'reviewNote')?{reviewNote:request.reviewNote}:{}),decisions:request.decisions};
}
function nativeRequest(draft,value){
 return {requestId:draft.requestId,reviewId:draft.reviewId,expectedRevision:draft.expectedRevision,
  comparisonSha256:draft.comparisonSha256,...value};
}
async function ensureDraft(api,root,key,remote,reviewed){
 if(remote.request){
  if(reviewed){
   const expected={...reviewed,requestId:reviewed.requestId??remote.request.requestId};
   need(same(expected,remote.request),'DESK_RECEIVING_FROZEN_REQUEST_CHANGED');
  }
  return {request:remote.request,sha256:null};
 }
 const value=draftValue(reviewed);
 let draft=remote.draft;
 if(draft?.locked){need(same(draft.value,value),'DESK_RECEIVING_LOCKED_DRAFT_CHANGED');}
 else if(!draft||!same(draft.value,value)){
  const intent={key,expectedSha256:draft?.sha256??null,value};
  await snapshot(root,'draft-intents',intent);
  // The same retained payload is retriable if a successful HTTP response was lost.
  try{draft=(await api.request('/api/draft',{method:'POST',body:intent})).value;}
  catch(error){
   const latest=(await api.request(roundPath(key))).value;
   if(latest.draft&&same(latest.draft.value,value))draft=latest.draft;else throw error;
  }
 }
 need(draft&&same(draft.value,value),'DESK_RECEIVING_DRAFT_CHANGED');
 if(reviewed.requestId!==undefined)need(reviewed.requestId===draft.requestId,'DESK_RECEIVING_REQUEST_ID_CHANGED');
 const request=nativeRequest(draft,value);
 validateCustomerReturnRequest(request,remote.comparison);
 await snapshot(root,'drafts',draft);return {request,sha256:draft.sha256};
}
async function applyFromBrowser({api,page,root,key,request,sha256,timeout}){
 await snapshot(root,'proposed-requests',request);
 await reloadRenderedRound(page,key);
 await inspectRenderedReview(page,(await api.request(roundPath(key))).value.comparison,draftValue(request));
 let remote=(await api.request(roundPath(key))).value;
 if(!remote.accepted){
  // The page uses its own saved draft binding. Interrupt only the HTTP response after
  // the actual native apply handler has accepted it; never manufacture a receipt.
  let withheld=false,resolveIntercept,rejectIntercept;
  const intercepted=new Promise((ok,bad)=>{resolveIntercept=ok;rejectIntercept=bad;});
  void intercepted.catch(()=>{});
  const previousJob=(await api.request('/api/status')).value.job?.id;
  const route=async routing=>{
   try{
   if(routing.request().method()!=='POST'){await routing.continue();return;}
   const actual=JSON.parse(routing.request().postData()??'null');
   need(actual?.key===key&&actual.draftSha256===(remote.request?null:sha256),'DESK_RECEIVING_BROWSER_DISPATCH_CHANGED');
   const response=await routing.fetch();
   if(response.status()===202){withheld=true;await response.dispose();await routing.abort('failed');}
   else await routing.fulfill({response});
   resolveIntercept();
   }catch(error){rejectIntercept(error);await routing.abort('failed').catch(()=>{});}
  };
  await page.route('**/api/apply',route);
  try{
   const button=remote.request||remote.draft?.locked?'#recover':'#apply';
   await page.locator(button).click();
   const until=Date.now()+timeout;let started;
   for(;;){
    const status=(await api.request('/api/status')).value;
    if(status.job?.action==='apply'&&status.job.key===key&&status.job.id!==previousJob){started=status.job;break;}
    need(Date.now()<until,'DESK_RECEIVING_APPLY_NOT_STARTED');await pause(100);
   }
   const status=await waitJob(api,started,timeout);
   await intercepted;
   await snapshot(root,'jobs',status.job);
   need(status.job.state==='SUCCEEDED'||status.job.state==='OUTCOME_UNCONFIRMED',
    status.job.error?.code??'DESK_RECEIVING_APPLY_FAILED');
   await snapshot(root,'response-recovery',{key,requestId:request.requestId,
    responseWithheld:withheld,state:status.job.state});
  }finally{await page.unroute('**/api/apply',route);}
 }
 // Reload observes the saved exact request after an interrupted response. If the
 // native call succeeded but export retention failed, the same request finishes it.
 await reloadRenderedRound(page,key);remote=(await api.request(roundPath(key))).value;
 need(remote.request&&same(remote.request,request),'DESK_RECEIVING_RETAINED_REQUEST_CHANGED');
 await retain(root,'REQUEST.selected.json',json(request));
 await inspectRenderedReview(page,remote.comparison,draftValue(request));
 const prior=remote.accepted;
 const recovered=await operation(api,'apply',{key,draftSha256:null},timeout);
 await snapshot(root,'jobs',recovered.job);
 remote=(await api.request(roundPath(key))).value;
 need(remote.accepted?.receipt,'DESK_RECEIVING_ACCEPTED_RECEIPT_REQUIRED');
 validateCustomerReturnReceipt(remote.accepted.receipt,request,remote.comparison);
 if(prior)need(same(prior,remote.accepted),'DESK_RECEIVING_REPLAY_CHANGED');
 await save(root,'ACCEPTED.json',remote.accepted);return remote;
}

async function verifyRejectedReview(api,root,key,remote,round,timeout){
 if(!round?.rejectedReview||remote.request||remote.accepted||remote.draft?.locked)return;
 const marker=await maybe(join(root,'REJECTED_REVIEW.json'));
 if(marker){need(marker.value.inputSha256===round.rejectedReview.sha256,'DESK_RECEIVING_REJECTED_INPUT_CHANGED');return;}
 const candidate=await actualReview({review:round.rejectedReview},root,remote.comparison);
 const selected=await ensureDraft(api,root,key,remote,candidate);
 const before=(await api.request(roundPath(key))).value;
 const started=(await api.request('/api/apply',{method:'POST',body:{key,draftSha256:selected.sha256}})).value;
 const finished=await waitJob(api,started.job,timeout);
 const after=(await api.request(roundPath(key))).value;
 need(finished.job.state==='OUTCOME_UNCONFIRMED'&&finished.job.error?.code===round.rejectedReview.expectedCode,
  'DESK_RECEIVING_EXPECTED_NATIVE_REJECTION');
 need(!after.request&&!after.accepted&&!after.draft?.locked&&same(after.comparison,before.comparison)&&
  after.draft?.sha256===selected.sha256,'DESK_RECEIVING_REJECTED_REVIEW_FROZEN');
 await save(root,'REJECTED_REVIEW.json',{key,inputSha256:round.rejectedReview.sha256,
  code:finished.job.error.code,reviewId:remote.comparison.reviewId,comparisonSha256:remote.comparison.comparisonSha256,
  draftSha256:selected.sha256,requestRetained:false,draftEditable:true});
}

async function verifyStaleProvidedDraft(api,root,key,round,current){
 if(!round?.rejectedReview||current.request||current.accepted||current.draft?.locked)return;
 const marker=await maybe(join(root,'STALE_DRAFT_REJECTED.json'));
 if(marker)return;
 const rejected=await actualReview({review:round.rejectedReview},root,current.comparison);
 let rejectedCode=null;
 try{await api.request('/api/draft',{method:'POST',body:{key,expectedSha256:null,value:draftValue(rejected)}});}
 catch(error){rejectedCode=error.code;}
 need(rejectedCode==='DESK_DRAFT_CONFLICT','DESK_RECEIVING_STALE_DRAFT_NOT_REJECTED');
 const actual=(await api.request(roundPath(key))).value;
 need(actual.draft?.sha256===current.draft?.sha256&&same(actual.draft?.value,current.draft?.value),
  'DESK_RECEIVING_STALE_DRAFT_CHANGED');
 await save(root,'STALE_DRAFT_REJECTED.json',{key,rejectedInputSha256:round.rejectedReview.sha256,
  retainedDraftSha256:current.draft.sha256,code:rejectedCode});
}

/**
 * The supplied source/review files are real customer inputs. A missing round/source
 * or review returns a resumable input-required result; it never selects decisions.
 * A browser runtime is explicit. This function does not download or install one.
 */
export async function runCustomerHandoverDeskReceiving(options){
 const input=validateInput(options),root=await customerDirectory(input.directory);
 return withPrivateLock(root,'handover-desk-receiving.lock',async()=>{
  const privateRoot=await customerDirectory(join(root,'private')),publicRoot=await customerDirectory(join(root,'public'));
  const selection=await readResearchHostFile(input.selectionFile,JSON_LIMIT,{sha256:input.selectionSha256});
  need(Buffer.from(selection.toString('utf8'),'utf8').equals(selection),'DESK_RECEIVING_SELECTION_UTF8');
  const selected=JSON.parse(selection.toString('utf8'));
  need(selected.schema==='sf88.research-customer-handover-returns.v1'&&Array.isArray(selected.rounds),'DESK_RECEIVING_NATIVE_SELECTION');
  need(input.rounds.every(row=>selected.rounds.some(r=>r.key===row.key)),'DESK_RECEIVING_ROUND_NOT_SELECTED');
  const binding={schema:HANDOVER_DESK_RECEIVING_SCHEMA,selectionSha256:input.selectionSha256,
   operationId:selected.operation_id,workspaceId:selected.workspace_id,dossierId:selected.dossier_id,
   deskDirectory:input.deskDirectory??join(root,'desk'),playwrightModule:input.playwrightModule,chromiumExecutable:input.chromiumExecutable,
   python:input.python,node:input.node};
  await save(privateRoot,'BINDING.json',binding);await retain(publicRoot,'SELECTION.original.json',selection);
  const attempt=await customerDirectory(join(privateRoot,'attempts',randomUUID()));
  const client=ResearchWorkspaceClient.fromFile(input.connectionFile,input.workspaceDirectory?{directory:input.workspaceDirectory}:{});
  let desk,browser,page,outcome;
  try{
   need((await client.status()).workspaceId===selected.workspace_id,'DESK_RECEIVING_WORKSPACE_CHANGED');
   desk=await startCustomerHandoverDesk({client,directory:binding.deskDirectory,selectionFile:join(publicRoot,'SELECTION.original.json'),
    selectionSha256:input.selectionSha256,python:input.python,node:input.node});
   const api=apiFor(desk.url),playwright=await import(pathToFileURL(input.playwrightModule).href);
   need(playwright.chromium&&typeof playwright.chromium.launch==='function','DESK_RECEIVING_PLAYWRIGHT_REQUIRED');
   browser=await playwright.chromium.launch({executablePath:input.chromiumExecutable,headless:true});
   const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1050}});
   page=await context.newPage();
   page.on('dialog',dialog=>void dialog.accept());
   await page.goto(desk.url,{waitUntil:'domcontentloaded'});
   await page.locator('#customer').waitFor();
   await page.waitForFunction(()=>location.hash==='');
   let status=(await api.request('/api/status')).value;
   need(status.selection.operationId===selected.operation_id&&status.selection.workspaceId===selected.workspace_id&&
    status.selection.dossierId===selected.dossier_id,'DESK_RECEIVING_STATUS_CHANGED');
   if(!status.initialized)status=await operation(api,'init',{},input.jobTimeoutMs);
   await snapshot(publicRoot,'status',status);
   const results=[];
   for(const selectedRound of selected.rounds){
    const supplied=input.rounds.find(r=>r.key===selectedRound.key),key=selectedRound.key;
    const roundRoot=await customerDirectory(join(publicRoot,'rounds',key));
    let remote=(await api.request(roundPath(key))).value;
    if(supplied?.source){
     const expected=supplied.source;
     need(expected.bytes<=selectedRound.maximum_source_bytes,'DESK_RECEIVING_SELECTED_SOURCE_LIMIT');
     const sourceDirectory=await customerDirectory(join(privateRoot,'sources',key)),file=join(sourceDirectory,'original.bin');
     await copyCustomerFile(expected.file,file,{bytes:expected.bytes,sha256:expected.sha256,maximum:selectedRound.maximum_source_bytes});
     await save(sourceDirectory,'SOURCE.json',expected);
     if(!remote.source){
      const stream=createReadStream(file,{flags:constants.O_RDONLY|constants.O_NOFOLLOW});
      try{
       const result=(await api.request('/api/source?'+new URLSearchParams({key,filename:expected.filename,contentType:expected.contentType}),
        {method:'POST',raw:stream,bytes:expected.bytes})).value;
       sourceMatch(result.source,expected);
      }finally{stream.destroy();}
      remote=(await api.request(roundPath(key))).value;
     }
     sourceMatch(remote.source,expected);
    }
    if(!remote.source){
     outcome={schema:HANDOVER_DESK_RECEIVING_SCHEMA,state:'SOURCE_REQUIRED',operationId:selected.operation_id,key,results};
     return outcome;
    }
    if(!remote.comparison){await operation(api,'prepare',{key},input.jobTimeoutMs);remote=(await api.request(roundPath(key))).value;}
    const comparison=remote.comparison;
    need(comparison&&comparison.total===comparison.items.length,'DESK_RECEIVING_COMPARISON_INCOMPLETE');
    sourceMatch(remote.source,comparison.source);
    await save(roundRoot,'COMPARISON.json',comparison);
    await retainValues(api,roundRoot,key,comparison);
    await allDownloads(api,publicRoot,remote.files);
    await reloadRenderedRound(page,key);
    const reviewed=await actualReview(supplied,roundRoot,comparison);
    if(!reviewed&&!remote.request){
     await save(roundRoot,'REVIEW_REQUIRED.json',{schema:HANDOVER_DESK_RECEIVING_SCHEMA+'.review-required',
      operationId:selected.operation_id,key,reviewId:comparison.reviewId,comparisonSha256:comparison.comparisonSha256,
      expectedRevision:comparison.current.revision,source:remote.source,items:comparison.total,
      instruction:'Inspect all original values. Supply a separate complete JSON review with reviewer and one explicit allowed decision per item. No choice has been authored by this course.'});
     outcome={schema:HANDOVER_DESK_RECEIVING_SCHEMA,state:'REVIEW_REQUIRED',operationId:selected.operation_id,key,
      reviewId:comparison.reviewId,comparisonSha256:comparison.comparisonSha256,results};
     return outcome;
    }
    if(reviewed)await verifyRejectedReview(api,roundRoot,key,remote,supplied,input.jobTimeoutMs);
    remote=(await api.request(roundPath(key))).value;
    const chosen=await ensureDraft(api,roundRoot,key,remote,reviewed);
    if(reviewed)await verifyStaleProvidedDraft(api,roundRoot,key,supplied,(await api.request(roundPath(key))).value);
    remote=await applyFromBrowser({api,page,root:roundRoot,key,request:chosen.request,sha256:chosen.sha256,timeout:input.jobTimeoutMs});
    const files=await allDownloads(api,publicRoot,remote.files);
    results.push({key,source:remote.source,reviewId:comparison.reviewId,requestId:chosen.request.requestId,
     returnId:remote.accepted.receipt.id,revision:remote.accepted.receipt.revision,revisionSha256:remote.accepted.receipt.revisionSha256,
     itemCount:comparison.total,files});
   }
   status=(await api.request('/api/status')).value;
   if(status.course?.state!=='COMPLETE')status=await operation(api,'complete',{},input.jobTimeoutMs);
   need(status.course?.state==='COMPLETE','DESK_RECEIVING_COMPLETE_REQUIRED');
   const files=await allDownloads(api,publicRoot,status.files);
   const zip=status.files.find(row=>row.label==='Complete editable handover');
   need(zip&&zip.filename===selected.output.filename_stem+'.zip','DESK_RECEIVING_COMPLETE_ARCHIVE_REQUIRED');
   await page.reload({waitUntil:'domcontentloaded'});
   const button=page.locator('button[data-download="'+zip.id+'"]');
   await button.waitFor();
   const browserDownload=page.waitForEvent('download',{timeout:input.jobTimeoutMs});
   await button.click();const downloaded=await browserDownload;
   const downloadFile=join(attempt,'browser-complete.zip');await downloaded.saveAs(downloadFile);
   need(!await downloaded.failure(),'DESK_RECEIVING_BROWSER_DOWNLOAD_FAILED');
   await describeCustomerFile(downloadFile,{bytes:zip.bytes,sha256:zip.sha256,maximum:WIRE_LIMIT});
   const screenshot=join(attempt,'desk-complete.png');await page.screenshot({path:screenshot,fullPage:true});
   await snapshot(publicRoot,'status',status);
   outcome={schema:HANDOVER_DESK_RECEIVING_SCHEMA,state:'COMPLETE',operationId:selected.operation_id,
    workspaceId:selected.workspace_id,dossierId:selected.dossier_id,selectionSha256:input.selectionSha256,
    results,archive:{id:zip.id,filename:zip.filename,bytes:zip.bytes,sha256:zip.sha256},
    files,browser:{renderedAllDecisions:true,retainedRequestReload:true,fullArchiveDownload:true},
    nativeReceiving:status.course};
   return outcome;
  }catch(error){
   await save(attempt,'INCOMPLETE.json',{schema:HANDOVER_DESK_RECEIVING_SCHEMA,state:'INCOMPLETE',code:safeCode(error),
    operationId:selected.operation_id,meaning:'Keep the original desk directory, source and exact request. Reenter the same course after resolving the actual condition.'});
   throw error;
  }finally{
   // No early successful return while the actual native job or browser remains live.
   const errors=[];
   try{if(browser)await browser.close();}catch(error){errors.push(error);}
   try{if(desk)await desk.close();else await client.close();}catch(error){errors.push(error);}
   if(errors.length){
    await save(attempt,'CLOSURE_INCOMPLETE.json',{state:'INCOMPLETE',codes:errors.map(safeCode)});
    throw new AggregateError(errors,'DESK_RECEIVING_CLOSURE_INCOMPLETE');
   }
   if(outcome)await snapshot(publicRoot,'course-results',outcome);
  }
 });
}
export const HANDOVER_DESK_RECEIVING_USAGE='node handover-desk-receiving.mjs --input ABSOLUTE_JSON --sha256 SHA256\n'+
 'The input selects actual native course/source/review files and existing Playwright/Chromium paths.\n'+
 'SOURCE_REQUIRED or REVIEW_REQUIRED retains the same course. Add the missing actual input and reenter.\n';
export async function runCustomerHandoverDeskReceivingCli(argv=process.argv.slice(2)){
 if(!argv.length||argv.includes('--help')){process.stdout.write(HANDOVER_DESK_RECEIVING_USAGE);return;}
 const {values}=parseArgs({args:argv,options:{input:{type:'string'},sha256:{type:'string'}},strict:true,allowPositionals:false});
 absolute(values.input);checksum(values.sha256);
 const body=await readResearchHostFile(values.input,JSON_LIMIT,{sha256:values.sha256});
 need(Buffer.from(body.toString('utf8'),'utf8').equals(body),'DESK_RECEIVING_INPUT_UTF8');
 const result=await runCustomerHandoverDeskReceiving(JSON.parse(body.toString('utf8')));
 process.stdout.write(JSON.stringify(result)+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 runCustomerHandoverDeskReceivingCli().catch(error=>{process.stderr.write(JSON.stringify({state:'INCOMPLETE',code:safeCode(error)})+'\n');process.exitCode=1;});
