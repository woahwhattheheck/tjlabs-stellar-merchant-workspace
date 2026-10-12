// MIT. Publisher-owned subscription editions over complete retained OData collections.
import {mkdtemp,rm,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {restoreCollection,openCollection,collectionRetainedFiles} from '../collection.mjs';
import {define,compatible,sourceCollection,sourceRecord,scope,derive,DEFINITION_SCHEMA,EDITION_SCHEMA,TRANSFER_SCHEMA} from './engine.mjs';
import {need,plain,shape,text,integer,HASH,LIMITS,sha,same,bytes,identity,read,readJSON,maybeJSON,
  privateDirectory,pathAt,measureChecked,immutable,copy,atomic,inventory,leased,lines,syncDir} from './files.mjs';

export const STATE_SCHEMA='stellar-forge.odata-subscription-state.v1';
export const editionDirectory=revision=>'editions/'+String(revision).padStart(6,'0');
const requestKey=id=>sha(Buffer.from(text(id,'request ID',200)));
const definitionPath='definition.json';
function recordShape(record){
  need(plain(record)&&record.schema===EDITION_SCHEMA&&Number.isSafeInteger(record.revision)&&record.revision>0&&
    HASH.test(record.definitionSha256)&&plain(record.source)&&HASH.test(record.source.collectionSha256)&&plain(record.files)&&
    plain(record.counts)&&record.counts.after===record.rows&&HASH.test(record.files['rows.jsonl']?.sha256)&&HASH.test(record.files['changes.jsonl']?.sha256),
    'EDITION','Choose a complete original subscription edition.');return record;
}
async function selected(root){
  const definitionRaw=await read(await pathAt(root,definitionPath),1048576),definition=JSON.parse(definitionRaw);
  need(definition.schema===DEFINITION_SCHEMA,'DEFINITION','Choose an original collection subscription.');
  const intent=await maybeJSON(root,'restore-intent.json');need(!intent||intent.state==='COMMITTED','RESTORE_PENDING','Complete the original backup receiving before opening this subscription.');
  const state=await readJSON(root,'state.json');need(state.schema===STATE_SCHEMA&&state.definitionSha256===sha(definitionRaw)&&
    Array.isArray(state.editions)&&state.editions.length<=LIMITS.editions&&state.head===state.editions.length,
    'STATE','The subscription state differs from its original definition.');
  const cancelled=state.cancelledRequests??[];need(Array.isArray(cancelled)&&cancelled.length<=LIMITS.editions&&new Set(cancelled.map(r=>r.requestId)).size===cancelled.length&&cancelled.every(r=>plain(r)&&typeof r.requestId==='string'&&HASH.test(r.requestSha256)&&typeof r.cancelledAt==='string'&&!state.editions.some(e=>e.requestId===r.requestId)),'STATE','The terminal cancelled request history changed.');
  for(let i=0;i<state.editions.length;i++){const row=state.editions[i];need(row.revision===i+1&&HASH.test(row.sha256)&&
    typeof row.requestId==='string'&&HASH.test(row.requestSha256),'STATE','The published edition order changed.');}
  return {definition,definitionRaw,definitionSha256:sha(definitionRaw),state};
}
async function editionAt(root,selected,revision){
  integer(revision,1,selected.state.head,'published edition');const row=selected.state.editions[revision-1],name=editionDirectory(revision)+'/edition.json';
  const raw=await read(await pathAt(root,name),1048576);need(sha(raw)===row.sha256,'EDITION_CHANGED','The selected edition manifest changed.');
  const edition=recordShape(JSON.parse(raw));need(edition.revision===revision&&edition.definitionSha256===selected.definitionSha256&&
    edition.previousSha256===(revision===1?null:selected.state.editions[revision-2].sha256),
    'EDITION_CHAIN','The published source edition chain changed.');
  return {edition,raw,sha256:row.sha256,directory:editionDirectory(revision)};
}
function publicEdition(value){const {directory,...result}=value;return {...result.edition,manifestSha256:value.sha256};}
async function receiptFor(root,selection,entry){
  const value=await editionAt(root,selection,entry.revision);return {schema:'stellar-forge.odata-subscription-append.v1',
    requestId:entry.requestId,requestSha256:entry.requestSha256,revision:entry.revision,manifestSha256:entry.sha256,
    rows:value.edition.rows,changes:value.edition.counts,source:value.edition.source,scopeChanged:value.edition.scopeChanged};
}
function requestBody(input,create){
  shape(input,create?['collectionDirectory','collectionSha256','title','fields','requestId']:
    ['collectionDirectory','collectionSha256','requestId','expectedRevision','note','allowScopeChange'],'publisher request');
  text(input.requestId,'request ID',200);need(typeof input.collectionDirectory==='string'&&HASH.test(input.collectionSha256),'SOURCE','Select the complete original collection directory and SHA.',400);
  if(create)return {kind:'create',requestId:input.requestId,collectionSha256:input.collectionSha256,title:input.title,fields:input.fields??null};
  integer(input.expectedRevision,1,LIMITS.editions,'expected edition');text(input.note,'edition note',4000);
  need(input.allowScopeChange===undefined||typeof input.allowScopeChange==='boolean','SCOPE','Choose explicit scope-change consent.',400);
  return {kind:'append',requestId:input.requestId,collectionSha256:input.collectionSha256,
    expectedRevision:input.expectedRevision,note:input.note,allowScopeChange:input.allowScopeChange===true};
}
async function appendUnlocked(root,input,{create=false}={}){
  const body=requestBody(input,create),bodySha=sha(bytes(body)),requestName='requests/'+requestKey(body.requestId)+'.json';
  let request=await maybeJSON(root,requestName),selection;
  if(request){need(same(request.body,body)&&request.bodySha256===bodySha,'REQUEST_CHANGED','Reuse the exact original request ID and body.');
    need(request.state!=='CANCELLED','REQUEST_CANCELLED','This original request was cancelled. Choose a new request ID for new work.');}
  const existingState=await maybeJSON(root,'state.json');
  if(existingState){
    selection=await selected(root);
    if(!request&&selection.state.pending===body.requestId&&selection.state.pendingRequest)request=selection.state.pendingRequest;
    if(request)need(same(request.body,body)&&request.bodySha256===bodySha,'REQUEST_CHANGED','Continue the exact originally selected publisher request.');
    const prior=selection.state.editions.find(e=>e.requestId===body.requestId);
    if(prior){need(prior.requestSha256===bodySha,'REQUEST_CHANGED','This original request ID already selected another body.');
      const result=await receiptFor(root,selection,prior);if(request?.state!=='COMMITTED')await atomic(root,requestName,{...request,body,bodySha256:bodySha,state:'COMMITTED',result});
      return {...result,reused:true};}
    need(create?selection.state.head===0:selection.state.head===body.expectedRevision,'REVISION','The subscription advanced. Review its current edition before appending.');
    need(!selection.state.pending||selection.state.pending===body.requestId,'PENDING','Continue or cancel the existing selected publisher request before another append.');
  }else need(create,'MISSING','Create the original subscription before appending.');
  const source=await sourceCollection(resolve(input.collectionDirectory),selection?.definition);
  need(source.collection.manifestSha256===body.collectionSha256,'SOURCE_CHANGED','The selected original collection changed.');
  const definition=selection?.definition??define(source.collection,{title:body.title,...(body.fields===null?{}:{fields:body.fields})});
  if(create&&selection)need(same(define(source.collection,{title:body.title,...(body.fields===null?{}:{fields:body.fields})}),definition),'DEFINITION_CHANGED','The original creation definition changed.');
  if(!selection){
    const definitionRaw=bytes(definition);await immutable(root,definitionPath,definitionRaw);
    const state={schema:STATE_SCHEMA,definitionSha256:sha(definitionRaw),head:0,editions:[],cancelledRequests:[],pending:null,pendingRequest:null};
    await atomic(root,'state.json',state);selection=await selected(root);
  }
  compatible(selection.definition,source.collection);const previous=selection.state.head?await editionAt(root,selection,selection.state.head):null;
  const previousScope=previous?scope({query:previous.edition.source.query}):selection.definition.initialScope;
  const scopeChanged=!same(previousScope,scope(source.collection));
  need(!scopeChanged||body.allowScopeChange===true,'SCOPE_CHANGED','The original query scope changed. Review it and explicitly allow the new membership scope.');
  const revision=selection.state.head+1;integer(revision,1,LIMITS.editions,'new edition');
  if(!request)request={schema:'stellar-forge.odata-subscription-request.v1',body,bodySha256:bodySha,state:'SELECTED',selectedAt:new Date().toISOString()};
  if(selection.state.pending!==body.requestId||!selection.state.pendingRequest){selection.state.pending=body.requestId;selection.state.pendingRequest=request;await atomic(root,'state.json',selection.state);}
  await atomic(root,requestName,request);
  const collectionPath='collections/'+source.collection.manifestSha256;
  await restoreCollection({sourceManifest:join(source.collection.directory,'analysis/source.json'),
    expectedSha256:source.collection.analysis.sha256,directory:await pathAt(root,collectionPath,{create:true})});
  const retained=await sourceCollection(join(root,collectionPath),selection.definition);
  need(retained.collection.manifestSha256===body.collectionSha256,'SOURCE_CHANGED','The retained publisher source differs.');
  const working=await mkdtemp(join(root,'.subscription-work-'));await privateDirectory(working);
  try{
    const result=await derive({definition:selection.definition,source:retained,working,
      previous:previous?{rows:previous.edition.rows,path:await pathAt(root,previous.directory+'/rows.jsonl'),identity:previous.edition.files['rows.jsonl']}:null});
    const directory=editionDirectory(revision);
    for(const [name,file]of Object.entries(result.files))await copy(root,directory+'/'+name,join(working,name),file);
    const edition={schema:EDITION_SCHEMA,engine:selection.definition.engine,revision,definitionSha256:selection.definitionSha256,
      previousSha256:previous?.sha256??null,requestId:body.requestId,requestSha256:bodySha,selectedAt:request.selectedAt,
      note:create?'Initial selected complete collection.':body.note,scopeChanged,source:sourceRecord(retained.collection),
      rows:result.counts.after,counts:result.counts,files:result.files};
    const raw=bytes(edition);await immutable(root,directory+'/edition.json',raw);
    const entry={revision,sha256:sha(raw),requestId:body.requestId,requestSha256:bodySha};
    selection.state.editions.push(entry);selection.state.head=revision;selection.state.pending=null;selection.state.pendingRequest=null;
    await atomic(root,'state.json',selection.state);
    const resultReceipt=await receiptFor(root,selection,entry);await atomic(root,requestName,{...request,state:'COMMITTED',result:resultReceipt});
    return {...resultReceipt,reused:false};
  }finally{await rm(working,{recursive:true,force:true});}
}
export async function createSubscription({directory,...input}){return leased(directory,root=>appendUnlocked(root,input,{create:true}));}
export async function appendSubscription({directory,...input}){return leased(directory,root=>appendUnlocked(root,input));}
export async function inspectSubscription(directory){
  return leased(directory,async root=>{const s=await selected(root);return {schema:'stellar-forge.odata-subscription-inspection.v1',
    definition:s.definition,definitionSha256:s.definitionSha256,head:s.state.head,pending:s.state.pending,
    current:s.state.head?publicEdition(await editionAt(root,s,s.state.head)):null};});
}
export async function subscriptionEditions(directory,{offset=0,limit=100}={}){
  integer(offset,0,LIMITS.editions,'edition offset');integer(limit,1,500,'edition page size');
  return leased(directory,async root=>{const s=await selected(root),end=Math.min(s.state.head,offset+limit),items=[];
    for(let n=offset+1;n<=end;n++)items.push(publicEdition(await editionAt(root,s,n)));
    return {definitionSha256:s.definitionSha256,total:s.state.head,offset,items,nextOffset:end<s.state.head?end:null};});
}
export async function subscriptionRows(directory,{revision,kind='rows',offset=0,limit=100}={}){
  integer(offset,0,2*LIMITS.rows,'row offset');integer(limit,1,500,'row page size');need(['rows','changes'].includes(kind),'KIND','Choose rows or changes.',400);
  return leased(directory,async root=>{const s=await selected(root);revision??=s.state.head;const selectedEdition=await editionAt(root,s,revision),name=kind+'.jsonl',items=[];let total=0;
    for await(const row of lines(await pathAt(root,selectedEdition.directory+'/'+name),selectedEdition.edition.files[name])){
      if(total>=offset&&items.length<limit)items.push(row);total++;}
    need(total===(kind==='rows'?selectedEdition.edition.rows:selectedEdition.edition.counts.events),'ROW_COUNT','The complete row count changed.');
    return {revision,editionSha256:selectedEdition.sha256,kind,offset,total,items,nextOffset:offset+items.length<total?offset+items.length:null};});
}
async function isolateCancelledEdition(root,requestId,revision){
  const from=join(root,editionDirectory(revision)),to=await pathAt(root,'cancelled/'+requestKey(requestId)+'/edition',{create:true});
  async function exists(path){try{await privateDirectory(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
  const sourceExists=await exists(from),destinationExists=await exists(to);
  need(!sourceExists||!destinationExists,'CANCEL_FILES','The cancelled request has conflicting unpublished edition directories. Preserve both for inspection.');
  if(sourceExists){await rename(from,to);await syncDir(join(root,'editions'));await syncDir(join(root,'cancelled',requestKey(requestId)));}
}
export async function cancelSubscriptionRequest(directory,{requestId}){
  text(requestId,'request ID',200);return leased(directory,async root=>{const s=await selected(root),name='requests/'+requestKey(requestId)+'.json',request=await maybeJSON(root,name)??s.state.pendingRequest;
    const terminal=(s.state.cancelledRequests??[]).find(r=>r.requestId===requestId);
    if(terminal){need(request?.state==='CANCELLED'&&request.bodySha256===terminal.requestSha256,'CANCEL','The terminal cancelled request changed.');return {requestId,state:'CANCELLED',cancelledAt:terminal.cancelledAt,reused:true};}
    need(s.state.pending===requestId&&!s.state.editions.some(e=>e.requestId===requestId)&&request&&['SELECTED','CANCELLED'].includes(request.state),'CANCEL','Only the selected unpublished request can be cancelled.');
    need((s.state.cancelledRequests??[]).length<LIMITS.editions,'HISTORY_LIMIT','The cancelled request history has reached its retained limit.');
    const cancelled={...request,state:'CANCELLED',cancelledAt:request.cancelledAt??new Date().toISOString()};
    await atomic(root,name,cancelled);
    // Keep the request selected until its unpublished revision is isolated. A resumed
    // cancellation adopts the same directory move; a new request cannot inherit its files.
    await isolateCancelledEdition(root,requestId,s.state.head+1);
    s.state.cancelledRequests=[...(s.state.cancelledRequests??[]),{requestId,requestSha256:request.bodySha256,cancelledAt:cancelled.cancelledAt}];
    s.state.pending=null;s.state.pendingRequest=null;await atomic(root,'state.json',s.state);
    return {requestId,state:'CANCELLED',cancelledAt:cancelled.cancelledAt,reused:false};});
}
export async function exportSubscription(directory,{output,fromRevision=0,toRevision}={}){
  integer(fromRevision,0,LIMITS.editions,'starting edition');need(typeof output==='string','OUTPUT','Choose a private transfer directory.',400);
  return leased(directory,async root=>{const s=await selected(root);toRevision??=s.state.head;integer(toRevision,1,s.state.head,'ending edition');
    need(fromRevision<toRevision,'EDITION_RANGE','Select at least one new edition.');need(fromRevision===0||toRevision-fromRevision<=LIMITS.transferEditions,'EDITION_RANGE','Select at most100 new editions per incremental delivery.');
    const destination=await privateDirectory(output,{create:true});need(destination!==root&&!destination.startsWith(root+'/'),'OUTPUT','Place customer transfers outside the publisher subscription.');
    const target=await editionAt(root,s,toRevision),names=[definitionPath],mode=fromRevision===0?'baseline':'changes';
    const from=fromRevision?await editionAt(root,s,fromRevision):null,selectedEditions=[];
    if(mode==='baseline'){names.push(target.directory+'/edition.json',target.directory+'/rows.jsonl');selectedEditions.push({revision:toRevision,sha256:target.sha256});}
    else for(let n=fromRevision+1;n<=toRevision;n++){const e=await editionAt(root,s,n);names.push(e.directory+'/edition.json',e.directory+'/changes.jsonl');selectedEditions.push({revision:n,sha256:e.sha256});}
    const files=await inventory(root,names);
    for(const file of files)await copy(destination,file.path,await pathAt(root,file.path),{bytes:file.bytes,sha256:file.sha256});
    const manifest={schema:TRANSFER_SCHEMA,mode,definitionSha256:s.definitionSha256,fromRevision,
      fromEditionSha256:from?.sha256??null,toRevision,toEditionSha256:target.sha256,editions:selectedEditions,files,
      meaning:s.definition.presenceMeaning};
    const raw=bytes(manifest);await immutable(destination,'transfer.json',raw);
    return {schema:'stellar-forge.odata-subscription-delivery.v1',directory:destination,manifest:'transfer.json',...identity(raw),
      mode,fromRevision,toRevision,fromEditionSha256:from?.sha256??null,toEditionSha256:target.sha256,files:files.length,bytesTotal:files.reduce((n,f)=>n+f.bytes,raw.length)};
  });
}
export async function exportSubscriptionOriginal(directory,{revision,output}={}){
  return leased(directory,async root=>{const s=await selected(root);revision??=s.state.head;const selectedEdition=await editionAt(root,s,revision),
      collection=await openCollection(join(root,'collections',selectedEdition.edition.source.collectionSha256));
    need(collection.manifestSha256===selectedEdition.edition.source.collectionSha256,'SOURCE_CHANGED','The original published collection changed.');
    const destination=await privateDirectory(output,{create:true}),files=await collectionRetainedFiles(collection);
    need(destination!==root&&!destination.startsWith(root+'/'),'OUTPUT','Export the original source outside its publisher directory.');
    for(const file of files)await copy(destination,file.path,join(collection.directory,file.path),{bytes:file.bytes,sha256:file.sha256});
    const reopened=await openCollection(destination);return {revision,collectionSha256:reopened.manifestSha256,analysis:reopened.analysis,files:files.length,directory:destination};});
}
export async function subscriptionBackup(directory,{output,expectedRevision}={}){
  return leased(directory,async root=>{const s=await selected(root);need(!s.state.pending,'PENDING','Finish or cancel the selected publisher append before backup.');
    if(expectedRevision!==undefined)need(s.state.head===expectedRevision,'REVISION','The selected publisher edition advanced before backup.');
    const names=[definitionPath,'state.json',...(s.state.cancelledRequests??[]).map(r=>'requests/'+requestKey(r.requestId)+'.json')];
    for(const entry of s.state.editions){const e=await editionAt(root,s,entry.revision),requestName='requests/'+requestKey(entry.requestId)+'.json',request=await readJSON(root,requestName);
      need(request.bodySha256===entry.requestSha256&&sha(bytes(request.body))===entry.requestSha256&&request.state!=='CANCELLED','BACKUP_REQUEST','The committed edition request differs from its retained body.');
      if(request.state!=='COMMITTED')await atomic(root,requestName,{...request,state:'COMMITTED',result:await receiptFor(root,s,entry)});
      names.push(e.directory+'/edition.json',e.directory+'/rows.jsonl',e.directory+'/changes.jsonl',requestName);const c=await openCollection(join(root,'collections',e.edition.source.collectionSha256));
      for(const file of await collectionRetainedFiles(c))names.push('collections/'+c.manifestSha256+'/'+file.path);}
    const destination=await privateDirectory(output,{create:true});need(destination!==root&&!destination.startsWith(root+'/'),'OUTPUT','Place the complete backup outside the original publisher.');
    const files=await inventory(root,names);for(const file of files)await copy(destination,file.path,await pathAt(root,file.path),{bytes:file.bytes,sha256:file.sha256});
    const manifest={schema:'stellar-forge.odata-subscription-backup.v1',definitionSha256:s.definitionSha256,head:s.state.head,files};
    const raw=bytes(manifest);await immutable(destination,'backup.json',raw);return {directory:destination,...identity(raw),head:s.state.head,files:files.length};});
}
export async function restoreSubscription({directory,source,expectedSha256}={}){
  need(HASH.test(expectedSha256),'BACKUP_IDENTITY','Select the exact complete backup manifest SHA.',400);
  const input=await privateDirectory(source),raw=await read(await pathAt(input,'backup.json'),16777216);
  need(sha(raw)===expectedSha256,'BACKUP_CHANGED','The selected backup manifest changed.');const backup=JSON.parse(raw);
  need(backup.schema==='stellar-forge.odata-subscription-backup.v1'&&Array.isArray(backup.files)&&backup.files.length<=LIMITS.files,'BACKUP','Choose an original complete subscription backup.');
  return leased(directory,async root=>{const existing=await maybeJSON(root,'restored.json');
    if(existing){need(existing.sha256===expectedSha256,'RESTORE_EXISTS','This directory already received another backup.');await atomic(root,'restore-intent.json',{sha256:expectedSha256,state:'COMMITTED'});const current=await selected(root);return {...existing,head:current.state.head,reused:true};}
    const intent=await maybeJSON(root,'restore-intent.json'),currentState=await maybeJSON(root,'state.json');
    need(!intent||intent.sha256===expectedSha256,'RESTORE_SELECTED','Continue the same original backup receiving.');
    need(!currentState||intent&&same(currentState,await readJSON(input,'state.json')),'RESTORE_EXISTS','Restore into an empty subscription directory.');
    if(!intent)await atomic(root,'restore-intent.json',{sha256:expectedSha256,state:'SELECTED'});
    const names=new Set();let total=0;
    for(const file of backup.files){need(plain(file)&&!names.has(file.path)&&/^(definition\.json|state\.json|requests\/[a-f0-9]{64}\.json|editions\/[0-9]{6}\/(?:edition\.json|rows\.jsonl|changes\.jsonl)|collections\/[a-f0-9]{64}\/.+)$/.test(file.path),
      'BACKUP_FILE','A backup repeats or adds an undeclared subscription file.');names.add(file.path);total+=file.bytes;need(total<=LIMITS.totalBytes,'BACKUP_LIMIT','The complete backup exceeds its limit.');await measureChecked(await pathAt(input,file.path),{bytes:file.bytes,sha256:file.sha256});}
    need(names.has(definitionPath)&&names.has('state.json'),'BACKUP_MISSING','The complete backup omits its definition or state.');
    // Restore all immutable bodies first. The public state is committed only after complete native source replay.
    for(const file of backup.files)if(file.path!=='state.json')await copy(root,file.path,await pathAt(input,file.path),{bytes:file.bytes,sha256:file.sha256});
    const state=await readJSON(input,'state.json'),definitionRaw=await read(await pathAt(root,definitionPath),1048576);
    need(state.schema===STATE_SCHEMA&&state.head===backup.head&&state.definitionSha256===sha(definitionRaw)&&state.definitionSha256===backup.definitionSha256&&state.pending===null,'BACKUP_STATE','The backup state differs from its manifest.');
    const selection={definition:JSON.parse(definitionRaw),definitionRaw,definitionSha256:sha(definitionRaw),state};
    let previous=null;const required=new Set([definitionPath,'state.json']);
    for(const entry of state.editions){
      const edition=await editionAt(root,selection,entry.revision),c=await sourceCollection(join(root,'collections',edition.edition.source.collectionSha256),selection.definition);
      need(same(sourceRecord(c.collection),edition.edition.source),'BACKUP_SOURCE','The backup edition points at another original source.');
      for(const f of await collectionRetainedFiles(c.collection))required.add('collections/'+c.collection.manifestSha256+'/'+f.path);
      for(const name of ['edition.json','rows.jsonl','changes.jsonl'])required.add(edition.directory+'/'+name);
      const requestName='requests/'+requestKey(entry.requestId)+'.json';required.add(requestName);
      const request=await readJSON(root,requestName);need(request.state==='COMMITTED'&&request.bodySha256===entry.requestSha256&&sha(bytes(request.body))===entry.requestSha256,'BACKUP_REQUEST','The original publisher request changed.');
      const working=await mkdtemp(join(root,'.subscription-replay-'));
      try{const replay=await derive({definition:selection.definition,source:c,previous,working});
        need(same(replay.counts,edition.edition.counts)&&same(replay.files,edition.edition.files),'BACKUP_REPLAY','The backup no longer reproduces its original change delivery.');
      }finally{await rm(working,{recursive:true,force:true});}
      previous={rows:edition.edition.rows,path:await pathAt(root,edition.directory+'/rows.jsonl'),identity:edition.edition.files['rows.jsonl']};
    }
    const cancelled=state.cancelledRequests??[];need(Array.isArray(cancelled)&&cancelled.length<=LIMITS.editions&&new Set(cancelled.map(r=>r.requestId)).size===cancelled.length,'BACKUP_REQUEST','The cancelled request history is invalid.');
    for(const terminal of cancelled){const name='requests/'+requestKey(terminal.requestId)+'.json',request=await readJSON(root,name);required.add(name);
      need(!state.editions.some(e=>e.requestId===terminal.requestId)&&request.schema==='stellar-forge.odata-subscription-request.v1'&&request.state==='CANCELLED'&&request.body?.requestId===terminal.requestId&&request.bodySha256===terminal.requestSha256&&sha(bytes(request.body))===terminal.requestSha256&&request.cancelledAt===terminal.cancelledAt,'BACKUP_REQUEST','A terminal cancelled request differs from its original selection.');}
    need(names.size===required.size&&[...required].every(n=>names.has(n)),'BACKUP_CLOSURE','The backup must include exactly its complete selected source and edition closure.');
    await atomic(root,'state.json',state);const result={schema:'stellar-forge.odata-subscription-restored.v1',sha256:expectedSha256,definitionSha256:backup.definitionSha256,head:backup.head};
    await atomic(root,'restored.json',result);await atomic(root,'restore-intent.json',{sha256:expectedSha256,state:'COMMITTED'});return {...result,reused:false};});
}
