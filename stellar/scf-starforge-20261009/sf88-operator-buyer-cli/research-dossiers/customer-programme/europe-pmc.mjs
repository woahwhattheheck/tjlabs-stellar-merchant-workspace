// MIT. Customer-selected Europe PMC work through the maintained Research engine.
// This module owns no provider transport and never starts an acquisition.
import {join,dirname,resolve,isAbsolute} from 'node:path';
import {lstat,unlink} from 'node:fs/promises';
import {privateDirectory} from '../../node/store.mjs';
import {readResearchHostFile} from '../workspace-files.mjs';
import {withPrivateLock} from '../../../sf30-seller-sdk/routescan/quota.mjs';
import {canonical,jsonBytes,sha256,parseJson,need,object,searchSelection,sourceDocument,
  validateDocument,buildEdition,validateEdition,compareEditions,exportRIS,exportCSV}
  from '../../../sf30-seller-sdk/europe-pmc/source.mjs';
import {validateEuropePmcPortable} from '../europe-pmc-workspace.mjs';
import {nativeRead,nativeWrite,nativePath} from '../ris-source/native-support.mjs';

export const CUSTOMER_EUROPE_PMC_SCHEMA='sf88.research-customer-europe-pmc.v1';
const JOURNAL='sf88.research-customer-europe-pmc-journal.v1', LIMIT=128*1024*1024;
const clone=value=>JSON.parse(canonical(value)), same=(a,b)=>canonical(a)===canonical(b);
const hash=value=>sha256(Buffer.from(canonical(value))), stamp=()=>new Date().toISOString();
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const nativeId=(value,prefix)=>typeof value==='string'&&new RegExp('^'+prefix+'_[a-f0-9]{64}$').test(value);
const key=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value);
const requestId=value=>typeof value==='string'&&/^[A-Za-z0-9._:-]{8,160}$/.test(value);
const actor=value=>typeof value==='string'&&value.trim().length>0&&value.length<=200;
const text=(value,limit)=>typeof value==='string'&&value.trim().length>0&&value.length<=limit&&!value.includes('\0');
const fields=(value,allowed,required,code)=>{
  need(object(value)&&Object.keys(value).every(name=>allowed.includes(name))&&required.every(name=>Object.hasOwn(value,name)),code);
};
const predicted=(prefix,value)=>prefix+'_'+hash({requestId:value});
const descriptor=(file,bytes,kind)=>({file,bytes:bytes.length,sha256:sha256(bytes),kind});
const publicPlan=plan=>({id:plan.id,sha256:plan.sha256,payload:plan.payload,request:plan.request,preparedAt:plan.preparedAt,schema:plan.schema});
function checkedLibrary(value){
  fields(value,['name','scope','id','revision','inventorySha256'],['name','scope'],'CUSTOMER_EPMC_LIBRARY_SELECTION_REQUIRED');
  need(/^(?:original|received-[a-f0-9]{64})$/.test(value.name)&&
    ['dedicated-empty','complete-library'].includes(value.scope),'CUSTOMER_EPMC_LIBRARY_SELECTION_REQUIRED');
  if(value.scope==='complete-library')
    need(nativeId(value.id,'epw')&&integer(value.revision)&&digest(value.inventorySha256),
      'CUSTOMER_EPMC_COMPLETE_LIBRARY_INVENTORY_REQUIRED');
  else need((value.id===undefined||nativeId(value.id,'epw'))&&(value.revision===undefined||value.revision===0)&&
    (value.inventorySha256===undefined||digest(value.inventorySha256)),'CUSTOMER_EPMC_EMPTY_LIBRARY_SELECTION_INVALID');
}
function checkedSelection(value){
  fields(value,['schema','operationId','library','queries','operations','comparisons','workspaceExport','restore','adapters'],
    ['schema','operationId','library','queries','operations','comparisons','workspaceExport','restore'],
    'CUSTOMER_EPMC_SELECTION_INVALID');
  need(value.schema===CUSTOMER_EUROPE_PMC_SCHEMA&&requestId(value.operationId)&&Array.isArray(value.queries)&&
    Array.isArray(value.operations)&&value.operations.length>0&&Array.isArray(value.comparisons),
    'CUSTOMER_EPMC_SELECTION_INVALID');
  checkedLibrary(value.library);
  fields(value.workspaceExport,['requestId','actor'],['requestId','actor'],'CUSTOMER_EPMC_EXPORT_REQUEST_REQUIRED');
  fields(value.restore,['requestId','actor','library'],['requestId','actor','library'],'CUSTOMER_EPMC_RESTORE_REQUEST_REQUIRED');
  for(const row of [value.workspaceExport,value.restore])need(requestId(row.requestId)&&actor(row.actor),'CUSTOMER_EPMC_REQUEST_INVALID');
  checkedLibrary(value.restore.library);
  need(value.restore.library.scope==='dedicated-empty','CUSTOMER_EPMC_DEDICATED_RECEIVER_REQUIRED');
  const names=new Set(),requests=new Set(),rememberRequest=request=>{
    need(requestId(request.requestId)&&actor(request.actor)&&!requests.has(request.requestId),'CUSTOMER_EPMC_REQUEST_ID_DUPLICATED');
    requests.add(request.requestId);
  };
  rememberRequest(value.workspaceExport);rememberRequest(value.restore);
  for(const query of value.queries){
    fields(query,['key','request','existing'],['key'],'CUSTOMER_EPMC_QUERY_SELECTION_INVALID');
    need(key(query.key)&&!names.has(query.key)&&(query.request===undefined)!==(query.existing===undefined),
      'CUSTOMER_EPMC_QUERY_SELECTION_INVALID');names.add(query.key);
    if(query.request){
      const q=query.request;
      fields(q,['requestId','actor','id','expectedRevision','title','selection','sourceTerms'],
        ['requestId','actor','expectedRevision','title','selection'],'CUSTOMER_EPMC_QUERY_REQUEST_INVALID');
      need(integer(q.expectedRevision)&&text(q.title,300)&&(q.id===undefined||nativeId(q.id,'epq'))&&
        (q.sourceTerms===undefined||text(q.sourceTerms,16000)),'CUSTOMER_EPMC_QUERY_REQUEST_INVALID');
      searchSelection(q.selection);rememberRequest(q);
    }else{
      fields(query.existing,['id','revision','sha256'],['id','revision','sha256'],'CUSTOMER_EPMC_QUERY_PIN_REQUIRED');
      need(nativeId(query.existing.id,'epq')&&integer(query.existing.revision)&&query.existing.revision>0&&digest(query.existing.sha256),
        'CUSTOMER_EPMC_QUERY_PIN_REQUIRED');
    }
  }
  const operations=new Set();
  for(const operation of value.operations){
    fields(operation,['key','query','prepare','parent','continuation','existing','import','reviews','receives','expect'],
      ['key','query','reviews','receives'],'CUSTOMER_EPMC_OPERATION_SELECTION_INVALID');
    need(key(operation.key)&&!operations.has(operation.key)&&names.has(operation.query)&&
      [operation.prepare,operation.continuation,operation.existing].filter(item=>item!==undefined).length===1&&
      Array.isArray(operation.reviews)&&Array.isArray(operation.receives),'CUSTOMER_EPMC_OPERATION_SELECTION_INVALID');
    if(operation.continuation)need(operations.has(operation.parent),'CUSTOMER_EPMC_PARENT_MUST_PRECEDE_CHILD');
    else need(operation.parent===undefined,'CUSTOMER_EPMC_UNEXPECTED_PARENT');
    operations.add(operation.key);
    const prepared=operation.prepare??operation.continuation;
    if(prepared){
      fields(prepared,['requestId','actor','label'],['requestId','actor','label'],'CUSTOMER_EPMC_PREPARE_REQUEST_INVALID');
      need(text(prepared.label,300),'CUSTOMER_EPMC_PREPARE_REQUEST_INVALID');rememberRequest(prepared);
      fields(operation.import,['file','bytes','sha256'],['file','bytes','sha256'],'CUSTOMER_EPMC_PINNED_IMPORT_REQUIRED');
      need(typeof operation.import.file==='string'&&isAbsolute(operation.import.file)&&resolve(operation.import.file)===operation.import.file&&
        integer(operation.import.bytes)&&operation.import.bytes>0&&operation.import.bytes<=48*1024*1024&&digest(operation.import.sha256),
        'CUSTOMER_EPMC_PINNED_IMPORT_REQUIRED');
    }else{
      fields(operation.existing,['operationId','planSha256','editionSha256','editionBytes'],
        ['operationId','planSha256','editionSha256','editionBytes'],'CUSTOMER_EPMC_OPERATION_PIN_REQUIRED');
      need(nativeId(operation.existing.operationId,'epop')&&digest(operation.existing.planSha256)&&digest(operation.existing.editionSha256)&&
        integer(operation.existing.editionBytes)&&operation.existing.editionBytes>0&&operation.import===undefined,
        'CUSTOMER_EPMC_OPERATION_PIN_REQUIRED');
    }
    for(const review of operation.reviews){
      fields(review,['requestId','actor','recordKey','expectedRevision','decision','note'],
        ['requestId','actor','recordKey','expectedRevision','decision','note'],'CUSTOMER_EPMC_REVIEW_REQUEST_INVALID');
      need(text(review.recordKey,1000)&&integer(review.expectedRevision)&&['include','exclude','uncertain','follow-up'].includes(review.decision)&&
        typeof review.note==='string'&&review.note.length<=2*1024*1024,'CUSTOMER_EPMC_REVIEW_REQUEST_INVALID');rememberRequest(review);
    }
    for(const receiving of operation.receives){
      fields(receiving,['requestId','actor','question','label'],['requestId','actor','question','label'],'CUSTOMER_EPMC_RECEIVE_REQUEST_INVALID');
      need(key(receiving.question)&&text(receiving.label,240),'CUSTOMER_EPMC_RECEIVE_REQUEST_INVALID');rememberRequest(receiving);
    }
    if(operation.expect!==undefined){
      fields(operation.expect,['planSha256','editionSha256','editionBytes','records','pages','coverage'],
        [],'CUSTOMER_EPMC_EXPECTATION_INVALID');
      for(const name of ['planSha256','editionSha256'])if(operation.expect[name]!==undefined)
        need(digest(operation.expect[name]),'CUSTOMER_EPMC_EXPECTATION_INVALID');
      for(const name of ['editionBytes','records','pages'])if(operation.expect[name]!==undefined)
        need(integer(operation.expect[name]),'CUSTOMER_EPMC_EXPECTATION_INVALID');
      if(operation.expect.coverage!==undefined)need(object(operation.expect.coverage),'CUSTOMER_EPMC_EXPECTATION_INVALID');
    }
  }
  const comparisons=new Set();
  for(const comparison of value.comparisons){
    fields(comparison,['key','before','after','label','scope'],['key','before','after','label','scope'],'CUSTOMER_EPMC_COMPARISON_INVALID');
    need(key(comparison.key)&&!comparisons.has(comparison.key)&&operations.has(comparison.before)&&operations.has(comparison.after)&&
      comparison.before!==comparison.after&&text(comparison.label,300)&&['same-query','scope-change'].includes(comparison.scope),
      'CUSTOMER_EPMC_COMPARISON_INVALID');comparisons.add(comparison.key);
  }
  need(value.adapters===undefined||Array.isArray(value.adapters)&&value.adapters.every(item=>['browser','merchant'].includes(item))&&
    new Set(value.adapters).size===value.adapters.length,'CUSTOMER_EPMC_ADAPTER_SELECTION_INVALID');
  return clone(value);
}
export function validateCustomerEuropePmcSelection(value){return checkedSelection(value);}

async function readDownload(path,{optional=false}={}){
  let before;try{before=await lstat(path);}catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
  // The original writePortableFile can leave its final link plus its own
  // private temporary link after an abrupt exit. Verify the exact bytes and
  // retain them without replacing or deleting that unknown original alias.
  need(before.isFile()&&!before.isSymbolicLink()&&(before.mode&0o077)===0&&
    before.uid===process.getuid()&&before.nlink>=1&&before.nlink<=2&&before.size<=LIMIT,
    'CUSTOMER_EPMC_DOWNLOAD_FILE_CHANGED');
  const bytes=await readResearchHostFile(path,LIMIT),after=await lstat(path);
  need(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.nlink===after.nlink&&
    before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&bytes.length===before.size,
    'CUSTOMER_EPMC_DOWNLOAD_FILE_CHANGED');
  return bytes;
}
async function openJournal(directory,input){
  const selectionPath=join(directory,'selection.private.json'),statePath=join(directory,'journal.private.json');
  await nativeWrite(selectionPath,jsonBytes(input));
  const old=await nativeRead(statePath,{optional:true,maximum:LIMIT});
  const state=old?parseJson(old):{schema:JOURNAL,inputSha256:hash(input),startedAt:stamp(),stage:'PREPARED',
    requests:{},values:{},artifacts:{},preparedArtifacts:{},attempts:[]};
  need(state.schema===JOURNAL&&state.inputSha256===hash(input),'CUSTOMER_EPMC_REENTRY_SELECTION_CHANGED');
  const save=()=>nativeWrite(statePath,jsonBytes(state),{replace:true});
  const path=name=>nativePath(directory,name);
  const recover=async name=>{
    const selected=state.artifacts[name]??state.preparedArtifacts[name],body=await nativeRead(path(name),{optional:true,maximum:LIMIT});
    if(!body){need(!state.artifacts[name],'CUSTOMER_EPMC_RETAINED_FILE_MISSING');return null;}
    need(selected&&selected.file===name&&selected.bytes===body.length&&selected.sha256===sha256(body),
      'CUSTOMER_EPMC_RETAINED_FILE_CHANGED');
    await nativeWrite(path(name),body);
    if(!state.artifacts[name]){state.artifacts[name]=selected;await save();}
    return body;
  };
  const retain=async(name,inputBytes,kind)=>{
    const body=Buffer.from(inputBytes),selected=descriptor(name,body,kind),old=await recover(name);
    if(old){need(old.equals(body)&&same(state.artifacts[name],selected),'CUSTOMER_EPMC_RETAINED_FILE_CHANGED');return state.artifacts[name];}
    if(state.preparedArtifacts[name])need(same(state.preparedArtifacts[name],selected),'CUSTOMER_EPMC_PREPARED_FILE_CHANGED');
    state.preparedArtifacts[name]=selected;await save();await nativeWrite(path(name),body);
    state.artifacts[name]=selected;await save();return selected;
  };
  // Large original histories and replies are separate immutable records. The
  // small journal indexes them, so reentry does not load every source twice.
  const valuePath=name=>path('private-values/'+sha256(Buffer.from(name))+'.json');
  const value=async name=>{
    const selected=state.values[name],body=await nativeRead(valuePath(name),{optional:true,maximum:LIMIT});
    if(!body){need(!selected,'CUSTOMER_EPMC_RETAINED_VALUE_MISSING');return undefined;}
    const record=parseJson(body);
    need(record.schema==='sf88.research-customer-europe-pmc-value.v1'&&record.name===name&&
      record.inputSha256===state.inputSha256&&record.valueSha256===hash(record.value),'CUSTOMER_EPMC_RETAINED_VALUE_CHANGED');
    const info={bytes:body.length,sha256:sha256(body)};
    if(selected)need(same(selected,info),'CUSTOMER_EPMC_RETAINED_VALUE_CHANGED');
    else {state.values[name]=info;await save();}
    await nativeWrite(valuePath(name),body);return record.value;
  };
  const remember=async(name,next)=>{
    const prior=await value(name);
    if(prior!==undefined){need(same(prior,next),'CUSTOMER_EPMC_RETAINED_VALUE_CHANGED');return prior;}
    const record={schema:'sf88.research-customer-europe-pmc-value.v1',name,inputSha256:state.inputSha256,
      valueSha256:hash(next),value:clone(next)},body=jsonBytes(record);
    need(body.length<=LIMIT,'CUSTOMER_EPMC_NATIVE_CONTROL_LIMIT');
    await nativeWrite(valuePath(name),body);
    state.values[name]={bytes:body.length,sha256:sha256(body)};await save();return clone(next);
  };
  const request=async(name,next)=>{
    const file='requests/'+name+'.json',prior=await recover(file);
    if(prior){need(same(parseJson(prior),next),'CUSTOMER_EPMC_REQUEST_CHANGED');
      if(!state.requests[name]){state.requests[name]=state.artifacts[file];await save();}
      return parseJson(prior);
    }
    const saved=await retain(file,jsonBytes(next),'request');state.requests[name]=saved;await save();return clone(next);
  };
  const requests=async()=>{
    const result={};for(const [name,info]of Object.entries(state.requests)){
      const body=await recover(info.file);need(body,'CUSTOMER_EPMC_RETAINED_REQUEST_MISSING');result[name]=parseJson(body);
    }return result;
  };
  const step=async(name,selected,run,{project=item=>item,validate=()=>{}}={})=>{
    const retained=await request(name,selected);
    let result=await value('result:'+name);
    if(result===undefined){result=project(await run(retained));await validate(result);
      result=await remember('result:'+name,result);}
    else await validate(result);
    await retain('receipts/'+name+'.json',jsonBytes({request:retained,result}),'receipt');
    return clone(result);
  };
  const snapshot=async(name,read)=>{
    let result=await value('snapshot:'+name);
    if(result===undefined)result=await remember('snapshot:'+name,await read());
    await retain('observations/'+name+'.json',jsonBytes(result),'observation');return result;
  };
  const download=async(name,selected,create,validate,kind,{keep=true}={})=>{
    await request('download-'+sha256(Buffer.from(name)),{file:name,selection:selected});
    const previous=await recover(name);
    if(previous){await validate(previous);return previous;}
    const candidate=path('downloads/'+name+'.candidate');await privateDirectory(dirname(candidate));
    if(!keep){
      const proof=await recover(name+'.verified.json');
      if(proof){
        const certificate=parseJson(proof);need(same(certificate.selection,selected),'CUSTOMER_EPMC_DOWNLOAD_SELECTION_CHANGED');
        const pending=await readDownload(candidate,{optional:true});
        if(pending){await validate(pending);need(certificate.bytes===pending.length&&certificate.sha256===sha256(pending),
          'CUSTOMER_EPMC_DOWNLOAD_CANDIDATE_CHANGED');await unlink(candidate);}
        return null;
      }
    }
    let body=await readDownload(candidate,{optional:true});
    if(!body){
      try{
        const receipt=await create(candidate);
        body=await readDownload(candidate);await validate(body);
        await remember('download-receipt:'+name,{recoveredPublishedFile:false,receipt});
      }catch(error){
        body=await readDownload(candidate,{optional:true});
        if(!body)throw error;
        await validate(body);
        if(await value('download-receipt:'+name)===undefined)
          await remember('download-receipt:'+name,{recoveredPublishedFile:true,receipt:null,
            originalErrorCode:typeof error.code==='string'?error.code:'DOWNLOAD_RESPONSE_UNAVAILABLE'});
      }
    }else{
      await validate(body);
      if(await value('download-receipt:'+name)===undefined)
        await remember('download-receipt:'+name,{recoveredPublishedFile:true,receipt:null,originalErrorCode:null});
    }
    if(keep)await retain(name,body,kind);
    else await retain(name+'.verified.json',jsonBytes({file:name,bytes:body.length,sha256:sha256(body),selection:selected}),'verification');
    const named=await lstat(candidate),again=await readDownload(candidate);
    need(named.isFile()&&!named.isSymbolicLink()&&again.equals(body),'CUSTOMER_EPMC_DOWNLOAD_CANDIDATE_CHANGED');
    await unlink(candidate);return body;
  };
  const files=async()=>{
    for(const name of Object.keys(state.artifacts))await recover(name);
    return Object.values(state.artifacts).map(row=>({...row,path:path(row.file)}));
  };
  return {state,save,path,retain,recover,value,remember,request,requests,step,snapshot,download,files};
}

async function oneInventory(api){
  let offset=0,first=null;const operations=[],seen=new Set();
  do{
    const page=await api.list({offset,limit:30});first??=page;
    need(page.id===first.id&&page.revision===first.revision&&same(page.selection,first.selection)&&
      same(page.queries,first.queries)&&same(page.receiving,first.receiving)&&page.totalOperations===first.totalOperations&&
      Array.isArray(page.operations)&&Array.isArray(page.active)&&page.active.length===0,
      'CUSTOMER_EPMC_LIBRARY_CHANGED_DURING_READ');
    for(const item of page.operations){
      need(nativeId(item.plan?.id,'epop')&&!seen.has(item.plan.id)&&!item.running&&item.operation?.phase!=='RUNNING',
        'CUSTOMER_EPMC_LIBRARY_HAS_RUNNING_OPERATION');
      seen.add(item.plan.id);operations.push(item);
    }
    const next=page.nextOffset;
    need(next===null||integer(next)&&next>offset&&next===offset+page.operations.length,
      'CUSTOMER_EPMC_INVENTORY_PAGE_CHANGED');offset=next;
  }while(offset!==null);
  need(operations.length===first.totalOperations,'CUSTOMER_EPMC_LIBRARY_INVENTORY_INCOMPLETE');
  return {selection:first.selection,workspaceId:first.id,revision:first.revision,queries:first.queries,
    operations,receiving:first.receiving,totalOperations:first.totalOperations};
}
async function inventory(api){
  const first=await oneInventory(api),history=await api.history(),second=await oneInventory(api);
  need(same(first,second)&&history.workspaceId===first.workspaceId&&history.revision===first.revision&&
    Array.isArray(history.events)&&history.events.length===history.revision,'CUSTOMER_EPMC_LIBRARY_CHANGED_DURING_READ');
  const value={...first,history};return {...value,inventorySha256:hash(value)};
}
function checkSelectedLibrary(selected,actual){
  need(actual.selection.library===selected.name,'CUSTOMER_EPMC_SELECTED_LIBRARY_CHANGED');
  if(selected.id!==undefined)need(actual.workspaceId===selected.id,'CUSTOMER_EPMC_LIBRARY_ID_CHANGED');
  if(selected.revision!==undefined)need(actual.revision===selected.revision,'CUSTOMER_EPMC_LIBRARY_REVISION_CHANGED');
  if(selected.inventorySha256!==undefined)need(actual.inventorySha256===selected.inventorySha256,'CUSTOMER_EPMC_LIBRARY_INVENTORY_CHANGED');
  if(selected.scope==='dedicated-empty')need(actual.revision===0&&actual.queries.length===0&&actual.operations.length===0&&
    actual.history.events.length===0,'CUSTOMER_EPMC_DEDICATED_LIBRARY_NOT_EMPTY');
}
export async function inspectCustomerEuropePmcLibrary({client}={}){
  need(client&&typeof client.status==='function'&&typeof client.europePmc==='function','CUSTOMER_EPMC_ORIGINAL_CLIENT_REQUIRED');
  const connection=await client.status(),api=client.europePmc(),value=await inventory(api);
  return {schema:'sf88.research-customer-europe-pmc-inventory.v1',sourceWorkspaceId:connection.workspaceId,
    library:{name:value.selection.library,id:value.workspaceId,revision:value.revision,inventorySha256:value.inventorySha256},
    inventory:value};
}

async function readImport(selected,retained=null){
  const bytes=retained??await readResearchHostFile(selected.file,48*1024*1024,{sha256:selected.sha256});
  need(sha256(bytes)===selected.sha256,'CUSTOMER_EPMC_IMPORT_SOURCE_CHANGED');
  need(bytes.length===selected.bytes,'CUSTOMER_EPMC_IMPORT_LENGTH_CHANGED');
  const packet=parseJson(bytes);
  need(object(packet)&&packet.schema==='stellar-forge.europe-pmc-import.v1'&&
    (packet.documents===undefined)!==(packet.pages===undefined),'CUSTOMER_EPMC_ORIGINAL_IMPORT_REQUIRED');
  need(packet.stopReason===undefined||packet.stopReason===null||
    ['page-limit','byte-limit','operator-stop'].includes(packet.stopReason),'CUSTOMER_EPMC_STOP_REASON_INVALID');
  need(Array.isArray(packet.documents??packet.pages),'CUSTOMER_EPMC_ORIGINAL_DOCUMENTS_REQUIRED');
  const documents=packet.documents??packet.pages.map(page=>{
    need(object(page)&&typeof page.bodyBase64==='string'&&typeof page.retainedAt==='string','CUSTOMER_EPMC_ORIGINAL_PAGE_REQUIRED');
    const body=Buffer.from(page.bodyBase64,'base64');need(body.toString('base64')===page.bodyBase64,'CUSTOMER_EPMC_ORIGINAL_BASE64_CHANGED');
    return sourceDocument({url:page.url,bytes:body,kind:'retained-document',
      observation:{status:null,headers:null,retrievedAt:null,retainedAt:page.retainedAt},provenance:page.provenance??{}});
  });
  need(Array.isArray(documents)&&documents.length>0,'CUSTOMER_EPMC_ORIGINAL_DOCUMENTS_REQUIRED');
  for(const document of documents)validateDocument(document);
  return {bytes,packet,documents};
}
function checkVersion(version){
  need(object(version)&&nativeId(version.id,'epq')&&integer(version.revision)&&version.revision>0&&
    digest(version.sha256)&&requestId(version.requestId),'CUSTOMER_EPMC_QUERY_VERSION_CHANGED');
  const {sha256:expected,requestId:originalRequest,...body}=version;
  need(hash(body)===expected&&same(searchSelection(version.selection),version.selection),'CUSTOMER_EPMC_QUERY_VERSION_CHANGED');
  return version;
}
async function selectedQuery(api,journal,selected){
  let version;
  if(selected.request){
    const input=clone(selected.request);
    const response=await journal.step('query-'+selected.key,{method:'saveQuery',input},
      saved=>api.saveQuery(saved.input),{validate:value=>{
        need(value.id===(input.id??predicted('epq',input.requestId))&&value.requestId===input.requestId&&
          value.revision===input.expectedRevision+1&&value.title===input.title.trim()&&
          same(value.selection,searchSelection(input.selection))&&value.actor===input.actor&&
          (input.sourceTerms===undefined||value.sourceTerms===input.sourceTerms),'CUSTOMER_EPMC_QUERY_RECEIPT_CHANGED');
      }});
    version=response.versions.find(row=>row.revision===response.revision);
  }else{
    const response=await api.query(selected.existing.id);
    version=response.versions.find(row=>row.revision===selected.existing.revision);
    need(version&&version.sha256===selected.existing.sha256,'CUSTOMER_EPMC_SELECTED_QUERY_CHANGED');
  }
  checkVersion(version);
  const current=await api.query(version.id),retained=current.versions.find(row=>row.revision===version.revision);
  need(retained&&same(retained,version),'CUSTOMER_EPMC_QUERY_VERSION_NOT_RETAINED');
  await journal.retain('queries/'+selected.key+'.json',jsonBytes(version),'query');
  return version;
}
function checkPlanQuery(plan,query){
  need(plan?.schema==='stellar-forge.europe-pmc-plan.v1'&&nativeId(plan.id,'epop')&&
    digest(plan.sha256)&&hash(plan.payload)===plan.sha256&&same(plan.payload.query,query),
    'CUSTOMER_EPMC_OPERATION_QUERY_CHANGED');
}
function finalOperation(view){
  need(view?.operation?.phase==='READY'&&!view.running&&digest(view.operation.editionSha256)&&
    integer(view.operation.editionBytes)&&view.operation.editionBytes>0,'CUSTOMER_EPMC_EDITION_NOT_READY');
  return {operationId:view.plan.id,planSha256:view.plan.sha256,editionSha256:view.operation.editionSha256,
    editionBytes:view.operation.editionBytes,pages:view.operation.pages,coverage:view.operation.coverage};
}
function checkExpectation(expect,actual,edition){
  if(!expect)return;
  const observed={...actual,records:edition.results.length};
  for(const [name,value]of Object.entries(expect))need(same(observed[name],value),'CUSTOMER_EPMC_EXPECTED_EDITION_CHANGED');
}
async function allRecords(api,id,editionSha256){
  let offset=0,first=null;const items=[],seen=new Set();
  do{
    const page=await api.records(id,{offset,limit:100});first??=page;
    need(page.operationId===id&&page.editionSha256===editionSha256&&page.total===first.total&&
      same(page.coverage,first.coverage)&&Array.isArray(page.items),'CUSTOMER_EPMC_RECORD_PAGE_CHANGED');
    for(const item of page.items){need(!seen.has(item.id),'CUSTOMER_EPMC_DUPLICATE_RECORD_PAGE');seen.add(item.id);items.push(item);}
    const next=page.nextOffset;need(next===null||integer(next)&&next>offset&&next===offset+page.items.length,
      'CUSTOMER_EPMC_RECORD_PAGE_CHANGED');offset=next;
  }while(offset!==null);
  need(items.length===first.total,'CUSTOMER_EPMC_RECORDS_INCOMPLETE');return {...first,items,nextOffset:null};
}
function verifyRecords(value,edition){
  need(value.total===edition.results.length&&value.items.length===edition.results.length&&
    same(value.coverage,edition.usage.coverage),'CUSTOMER_EPMC_RECORDS_CHANGED');
  for(let i=0;i<edition.results.length;i++){
    const {review,...record}=value.items[i];
    need(same(record,edition.results[i]),'CUSTOMER_EPMC_RECORDS_CHANGED');
    if(review!==null)need(review.operationId===value.operationId&&review.editionSha256===value.editionSha256&&
      review.recordKey===record.id&&Array.isArray(review.history),'CUSTOMER_EPMC_RECORD_REVIEW_CHANGED');
  }
}
async function allComparison(api,before,after){
  let offset=0,first=null;const items=[];
  do{
    const page=await api.comparison({before,after,offset,limit:100,status:'all'});first??=page;
    const {items:unused,nextOffset:next,...metadata}=page;
    const {items:initialItems,nextOffset:initialNext,...initial}=first;
    need(same(metadata,initial)&&Array.isArray(page.items),'CUSTOMER_EPMC_COMPARISON_PAGE_CHANGED');
    items.push(...page.items);
    need(next===null||integer(next)&&next>offset&&next===offset+page.items.length,'CUSTOMER_EPMC_COMPARISON_PAGE_CHANGED');
    offset=next;
  }while(offset!==null);
  need(items.length===first.total,'CUSTOMER_EPMC_COMPARISON_INCOMPLETE');return {...first,items,nextOffset:null};
}
function checkReceipt(receipt,input,operation){
  need(receipt?.schema==='stellar-forge.europe-pmc-receipt.v1'&&receipt.requestId===input.requestId&&
    receipt.fingerprint===hash(input)&&receipt.operationId===operation.operationId&&receipt.dossierId===input.dossierId&&
    receipt.questionId===input.questionId&&receipt.sourceSha256===operation.editionSha256&&receipt.sourceBytes===operation.editionBytes&&
    receipt.originalRevision===input.expectedRevision&&receipt.revision===input.expectedRevision+1&&
    receipt.editionId==='e_'+sha256(Buffer.from(input.questionId+'\n'+'europe-pmc'+'\n'+operation.editionSha256+'\n'+'epmc-receive:'+input.requestId))&&
    same(receipt.coverage,operation.coverage),'CUSTOMER_EPMC_RECEIVE_RECEIPT_CHANGED');
}
async function checkReceived(client,dossierId,input,operation,receipt){
  checkReceipt(receipt,input,operation);
  const historical=await client.metadata(dossierId,{revision:receipt.revision});
  need(historical.id===dossierId&&historical.revision===receipt.revision&&
    historical.questions.some(row=>row.id===input.questionId)&&historical.editions.some(row=>
      row.id===receipt.editionId&&row.questionId===input.questionId&&row.raw?.sha256===operation.editionSha256&&
      row.raw.bytes===operation.editionBytes),'CUSTOMER_EPMC_RECEIVED_HISTORY_CHANGED');
}
async function operationSource(api,journal,selected,query,parent,imported){
  let plan;
  if(selected.existing){
    const view=await api.inspect(selected.existing.operationId);
    checkPlanQuery(view.plan,query);const actual=finalOperation(view);
    for(const [name,value]of Object.entries(selected.existing))need(actual[name]===value,'CUSTOMER_EPMC_SELECTED_OPERATION_CHANGED');
    plan=view.plan;
  }else{
    const chosen=selected.prepare??selected.continuation;
    let nativeInput,callInput;
    if(selected.prepare){
      nativeInput={...clone(chosen),queryId:query.id,queryRevision:query.revision,mode:'documents'};
      callInput={method:'prepare',input:nativeInput};
    }else{
      need(parent&&same(parent.plan.payload.query,query),'CUSTOMER_EPMC_PARENT_QUERY_CHANGED');
      nativeInput={...clone(chosen),queryId:query.id,queryRevision:query.revision,mode:'documents',
        continuation:{operationId:parent.operation.operationId,expectedEditionSha256:parent.operation.editionSha256,
          expectedPlanSha256:parent.operation.planSha256}};
      callInput={method:'continueSearch',operationId:parent.operation.operationId,input:{...clone(chosen),
        expectedEditionSha256:parent.operation.editionSha256,expectedPlanSha256:parent.operation.planSha256}};
    }
    const result=await journal.step('prepare-'+selected.key,callInput,saved=>saved.method==='prepare'?
      api.prepare(saved.input):api.continueSearch(saved.operationId,saved.input),
      {project:value=>({plan:publicPlan(value.plan)}),validate:value=>{
        checkPlanQuery(value.plan,query);
        need(value.plan.id===predicted('epop',chosen.requestId)&&same(value.plan.request,nativeInput)&&
          value.plan.payload.mode==='documents','CUSTOMER_EPMC_PLAN_RECEIPT_CHANGED');
      }});
    plan=result.plan;
    let documents=imported.documents;
    if(plan.payload.pagination.parent?.boundaryDocumentId){
      const inherited=parent.boundary;
      need(inherited&&inherited.documentId===plan.payload.pagination.parent.boundaryDocumentId,'CUSTOMER_EPMC_PARENT_BOUNDARY_MISSING');
      if(!same(documents[0],inherited))documents=[inherited,...documents];
    }
    // These are the original engine's validators and builder. The operation's
    // actual frozen query, clock and pagination are used without reconstruction.
    const expected=buildEdition({selection:query.selection,documents,label:plan.payload.label,createdAt:plan.preparedAt,
      sourceTerms:query.sourceTerms,pagination:plan.payload.pagination,stopReason:imported.packet.stopReason??null});
    const expectedBytes=jsonBytes(expected),expectedDigest=sha256(expectedBytes);
    const retainedFile=journal.path('inputs/'+selected.key+'.json');
    await journal.step('import-'+selected.key,{method:'importFile',operationId:plan.id,input:{
      file:retainedFile,sha256:selected.import.sha256,expectedPlanSha256:plan.sha256}},
      saved=>api.importFile(saved.operationId,saved.input),{project:value=>({plan:publicPlan(value.plan),operation:finalOperation(value)}),
      validate:value=>need(value.plan.id===plan.id&&value.plan.sha256===plan.sha256&&
        value.operation.editionSha256===expectedDigest&&value.operation.editionBytes===expectedBytes.length,
        'CUSTOMER_EPMC_IMPORTED_SOURCE_CHANGED')});
  }
  const view=await api.inspect(plan.id);checkPlanQuery(view.plan,query);
  need(same(publicPlan(view.plan),publicPlan(plan)),'CUSTOMER_EPMC_PLAN_CHANGED');
  const operation=finalOperation(view);
  const editionBytes=await journal.download('editions/'+selected.key+'/edition.json',operation,
    file=>api.exportEdition(plan.id,{file,format:'edition',expectedSha256:operation.editionSha256}),bytes=>{
      need(bytes.length===operation.editionBytes&&sha256(bytes)===operation.editionSha256,'CUSTOMER_EPMC_EDITION_EXPORT_CHANGED');
      const value=validateEdition(parseJson(bytes));
      need(same(value.metadata.selection,query.selection)&&same(value.metadata.pagination,plan.payload.pagination)&&
        value.metadata.createdAt===plan.preparedAt&&value.metadata.label===plan.payload.label&&value.sourceTerms===query.sourceTerms,
        'CUSTOMER_EPMC_EDITION_PLAN_CHANGED');
    },'edition');
  const edition=validateEdition(parseJson(editionBytes));
  checkExpectation(selected.expect,operation,edition);
  need(edition.originalDocuments.length===operation.pages&&same(edition.usage.coverage,operation.coverage),
    'CUSTOMER_EPMC_EDITION_COVERAGE_CHANGED');
  await journal.retain('editions/'+selected.key+'/plan.json',jsonBytes(publicPlan(plan)),'plan');
  const sources=[];
  for(let index=0;index<edition.originalDocuments.length;index++){
    const document=edition.originalDocuments[index],{bodyBase64,...expectedDescriptor}=document;
    const original=await api.source(plan.id,index);
    need(same(original,expectedDescriptor),'CUSTOMER_EPMC_SOURCE_DESCRIPTOR_CHANGED');
    await journal.retain('editions/'+selected.key+'/source-'+String(index+1).padStart(6,'0')+'.descriptor.json',
      jsonBytes(original),'source-descriptor');
    const name='editions/'+selected.key+'/source-'+String(index+1).padStart(6,'0')+'.json';
    await journal.download(name,{operationId:plan.id,index,documentId:document.documentId,bytes:document.bodyBytes,sha256:document.bodySha256},
      file=>api.exportSource(plan.id,{file,index,expectedSha256:document.bodySha256}),
      bytes=>need(bytes.length===document.bodyBytes&&sha256(bytes)===document.bodySha256&&
        bytes.toString('base64')===bodyBase64,'CUSTOMER_EPMC_ORIGINAL_PAGE_CHANGED'),'source');
    sources.push({index,file:name,documentId:document.documentId,bodyBytes:document.bodyBytes,bodySha256:document.bodySha256});
  }
  let boundary=null;
  if(view.boundary){
    const original=await api.source(plan.id,operation.pages,{boundary:true});
    need(original.documentId===view.boundary.documentId&&original.bodySha256===view.boundary.bodySha256&&
      original.bodyBytes===view.boundary.bodyBytes,'CUSTOMER_EPMC_BOUNDARY_DESCRIPTOR_CHANGED');
    const body=await journal.download('editions/'+selected.key+'/boundary.json',{operationId:plan.id,boundary:original},
      file=>api.exportSource(plan.id,{file,index:operation.pages,boundary:true,expectedSha256:original.bodySha256}),
      bytes=>need(bytes.length===original.bodyBytes&&sha256(bytes)===original.bodySha256,'CUSTOMER_EPMC_BOUNDARY_SOURCE_CHANGED'),'source');
    boundary={...original,bodyBase64:body.toString('base64')};validateDocument(boundary);
    await journal.retain('editions/'+selected.key+'/boundary.descriptor.json',jsonBytes(original),'source-descriptor');
  }
  return {plan,operation,edition,sources,boundary,nativeState:view.operation,boundaryDescriptor:view.boundary};
}

function assertLibraryChanges(baseline,current,requests,selectedIds,contexts=null){
  need(current.workspaceId===baseline.workspaceId&&current.selection.library===baseline.selection.library&&
    current.history.events.length>=baseline.history.events.length,'CUSTOMER_EPMC_LIBRARY_IDENTITY_CHANGED');
  for(let i=0;i<baseline.history.events.length;i++)
    need(same(current.history.events[i],baseline.history.events[i]),'CUSTOMER_EPMC_ORIGINAL_LIBRARY_HISTORY_CHANGED');
  const known=new Map(Object.values(requests).filter(row=>row.method==='saveQuery'||row.method==='review')
    .map(row=>[row.input.requestId,{kind:row.method==='saveQuery'?'query':'record-review',input:row.input}]));
  for(const event of current.history.events.slice(baseline.history.events.length)){
    const selected=known.get(event.requestId);
    need(selected&&event.kind===selected.kind&&same(event.input,selected.input)&&
      event.fingerprint===hash(selected),'CUSTOMER_EPMC_UNSELECTED_LIBRARY_MUTATION');
  }
  const old=new Map(baseline.operations.map(row=>[row.plan.id,row])),now=new Map(current.operations.map(row=>[row.plan.id,row]));
  for(const [id,operation]of old){
    need(now.has(id),'CUSTOMER_EPMC_ORIGINAL_OPERATION_MISSING');
    if(!selectedIds.has(id))need(same(now.get(id),operation),'CUSTOMER_EPMC_UNSELECTED_OPERATION_CHANGED');
    else need(same(now.get(id).plan,operation.plan),'CUSTOMER_EPMC_ORIGINAL_PLAN_CHANGED');
  }
  for(const id of now.keys())need(old.has(id)||selectedIds.has(id),'CUSTOMER_EPMC_UNSELECTED_OPERATION_ADDED');
  const receiving=new Map(Object.values(requests).filter(row=>row.method==='receive').map(row=>[row.input.requestId,row]));
  for(const id of selectedIds){
    const operation=now.get(id);if(!operation)continue;
    const previous=new Map((old.get(id)?.receipts??[]).map(row=>[row.requestId,row]));
    for(const receipt of operation.receipts){
      if(previous.has(receipt.requestId))need(same(receipt,previous.get(receipt.requestId)),'CUSTOMER_EPMC_ORIGINAL_RECEIPT_CHANGED');
      else {
        const selected=receiving.get(receipt.requestId);
        need(selected&&selected.operationId===id&&receipt.fingerprint===hash(selected.input)&&
          receipt.dossierId===selected.input.dossierId&&receipt.questionId===selected.input.questionId,
          'CUSTOMER_EPMC_UNSELECTED_RECEIPT_ADDED');
      }
    }
    for(const request of previous.keys())need(operation.receipts.some(row=>row.requestId===request),'CUSTOMER_EPMC_ORIGINAL_RECEIPT_MISSING');
    if(contexts){
      const selected=Object.values(contexts).find(row=>row.operation.operationId===id);
      need(selected&&same(operation.plan,selected.plan)&&same(operation.operation,selected.nativeState)&&
        same(operation.boundary,selected.boundaryDescriptor),'CUSTOMER_EPMC_SELECTED_OPERATION_CHANGED');
    }
  }
}
function assertPortableInventory(portable,inventory){
  const {value,files,library}=portable;
  need(library.id===inventory.workspaceId&&library.revision===inventory.revision&&
    same(library.events,inventory.history.events)&&same(Object.values(library.queries),inventory.queries),
    'CUSTOMER_EPMC_PORTABLE_LIBRARY_CHANGED');
  const ids=[...new Set([...files.keys()].filter(name=>name.startsWith('operations/')).map(name=>name.split('/')[1]))].sort();
  need(same(ids,inventory.operations.map(row=>row.plan.id).sort()),'CUSTOMER_EPMC_PORTABLE_OPERATION_INVENTORY_CHANGED');
  for(const operation of inventory.operations){
    const prefix='operations/'+operation.plan.id+'/';
    need(same(parseJson(files.get(prefix+'plan.json')),operation.plan)&&
      same(parseJson(files.get(prefix+'state.json')),operation.operation),'CUSTOMER_EPMC_PORTABLE_OPERATION_CHANGED');
    const receipts=[...files].filter(([name])=>name.startsWith(prefix+'receipts/')&&name.endsWith('.receipt.json'))
      .sort(([a],[b])=>a.localeCompare(b)).map(([,bytes])=>parseJson(bytes));
    need(same(receipts,operation.receipts),'CUSTOMER_EPMC_PORTABLE_RECEIPTS_CHANGED');
  }
  if(inventory.receiving===null)need(!files.has('receiving.json'),'CUSTOMER_EPMC_PORTABLE_RECEIVING_CHANGED');
  else need(files.has('receiving.json')&&same(parseJson(files.get('receiving.json')),inventory.receiving),'CUSTOMER_EPMC_PORTABLE_RECEIVING_CHANGED');
  need(value.workspace.id===inventory.workspaceId&&value.workspace.revision===inventory.revision,
    'CUSTOMER_EPMC_PORTABLE_WORKSPACE_CHANGED');
}

async function reviewAndReceive({api,client,journal,selected,context,dossierId,questionIds,revision}){
  const {plan,operation,edition}=context,reviewReceipts=[],receipts=[];
  for(let index=0;index<selected.reviews.length;index++){
    const chosen=selected.reviews[index];
    need(edition.results.some(row=>row.id===chosen.recordKey),'CUSTOMER_EPMC_REVIEW_RECORD_NOT_IN_EDITION');
    const input={...clone(chosen),operationId:operation.operationId,editionSha256:operation.editionSha256};
    const result=await journal.step('review-'+selected.key+'-'+index,{method:'review',input},
      saved=>api.review(saved.input),{validate:value=>{
        for(const name of ['requestId','operationId','editionSha256','recordKey','decision','note','actor'])
          need(value[name]===input[name],'CUSTOMER_EPMC_REVIEW_RECEIPT_CHANGED');
        need(value.revision===input.expectedRevision+1&&Array.isArray(value.history)&&value.history.length===value.revision&&
          value.history.at(-1).requestId===input.requestId,'CUSTOMER_EPMC_REVIEW_RECEIPT_CHANGED');
      }});
    reviewReceipts.push(result);
  }
  const records=await journal.snapshot('records-'+selected.key,()=>allRecords(api,operation.operationId,operation.editionSha256));
  verifyRecords(records,edition);
  for(const review of reviewReceipts){
    const row=records.items.find(item=>item.id===review.recordKey),saved=row?.review?.history.find(item=>item.requestId===review.requestId);
    need(saved&&same(saved,review.history.at(-1)),'CUSTOMER_EPMC_SELECTED_REVIEW_NOT_RETAINED');
  }
  await journal.retain('editions/'+selected.key+'/records.json',jsonBytes(records),'records');
  for(const format of ['ris','csv']){
    const expected=format==='ris'?exportRIS(edition):exportCSV(edition),identity={operationId:operation.operationId,
      editionSha256:operation.editionSha256,format,bytes:expected.length,sha256:sha256(expected)};
    await journal.download('editions/'+selected.key+'/records.'+format,identity,
      file=>api.exportEdition(operation.operationId,{file,format,expectedSha256:identity.sha256}),
      bytes=>need(bytes.equals(expected),'CUSTOMER_EPMC_FORMAT_EXPORT_CHANGED'),format);
  }
  const reviewProjection=await journal.snapshot('review-projection-'+selected.key,async()=>{
    const history=await api.history(),reviewMap=new Map();
    for(const event of history.events)if(event.kind==='record-review'&&event.input.operationId===operation.operationId)
      reviewMap.set(event.input.recordKey,event.result);
    return {operationId:operation.operationId,editionSha256:operation.editionSha256,reviews:[...reviewMap.values()]};
  });
  const reviewBytes=jsonBytes(reviewProjection);
  await journal.download('editions/'+selected.key+'/review.json',{operationId:operation.operationId,
    editionSha256:operation.editionSha256,bytes:reviewBytes.length,sha256:sha256(reviewBytes)},
    file=>api.exportEdition(operation.operationId,{file,format:'review',expectedSha256:sha256(reviewBytes)}),
    bytes=>need(bytes.equals(reviewBytes),'CUSTOMER_EPMC_REVIEW_EXPORT_CHANGED'),'review');
  for(let index=0;index<selected.receives.length;index++){
    const chosen=selected.receives[index],questionId=questionIds[chosen.question];
    need(typeof questionId==='string','CUSTOMER_EPMC_QUESTION_BINDING_MISSING');
    const input={requestId:chosen.requestId,actor:chosen.actor,dossierId,questionId,label:chosen.label,
      expectedRevision:revision,expectedPlanSha256:operation.planSha256,expectedEditionSha256:operation.editionSha256};
    const value=await journal.step('receive-'+selected.key+'-'+index,{method:'receive',operationId:operation.operationId,input},
      saved=>api.receive(saved.operationId,saved.input),{project:result=>({receipt:result.receipt}),
        validate:result=>checkReceived(client,dossierId,input,operation,result.receipt)});
    receipts.push(value.receipt);revision=value.receipt.revision;
  }
  const chain=await journal.snapshot('chain-'+selected.key,()=>api.chain(operation.operationId));
  need(Array.isArray(chain.parts)&&chain.parts.at(-1).operationId===operation.operationId&&
    chain.parts.at(-1).editionSha256===operation.editionSha256,'CUSTOMER_EPMC_CHAIN_CHANGED');
  await journal.retain('editions/'+selected.key+'/chain.json',jsonBytes(chain),'continuation');
  return {revision,reviewReceipts,receipts,chain};
}

function adapterFacade({api,client,journal,selection,dossierId,questionIds,contexts,requests,name}){
  const ids=new Set(Object.values(contexts).map(value=>value.operation.operationId));
  const queryIds=new Set(Object.values(contexts).map(value=>value.plan.payload.query.id));
  const chosen=id=>{need(ids.has(id),'CUSTOMER_EPMC_ADAPTER_OPERATION_NOT_SELECTED');return id;};
  const originals=Object.values(requests),known=(method,id)=>{
    const values=originals.filter(value=>value.method===method&&value.input.requestId===id);
    need(values.length===1,'CUSTOMER_EPMC_ADAPTER_ORIGINAL_REQUEST_REQUIRED');return values[0];
  };
  const read={
    list:input=>api.list(input),status:()=>api.status(),history:()=>api.history(),
    query:id=>{need(queryIds.has(id),'CUSTOMER_EPMC_ADAPTER_QUERY_NOT_SELECTED');return api.query(id);},
    inspect:id=>api.inspect(chosen(id)),records:(id,input)=>api.records(chosen(id),input),
    source:(id,index,options)=>api.source(chosen(id),index,options),chain:id=>api.chain(chosen(id)),
    comparison:input=>api.comparison({...input,before:chosen(input.before),after:chosen(input.after)}),
  };
  const replay={
    review:async requestId=>{
      const request=known('review',requestId),result=await api.review(request.input);
      need(result.requestId===requestId&&result.operationId===request.input.operationId&&
        result.editionSha256===request.input.editionSha256,'CUSTOMER_EPMC_ADAPTER_REPLAY_CHANGED');return result;
    },
    receive:async requestId=>{
      const request=known('receive',requestId),context=Object.values(contexts).find(value=>value.operation.operationId===request.operationId);
      const result=await api.receive(request.operationId,request.input);
      await checkReceived(client,dossierId,request.input,context.operation,result.receipt);
      need(result.duplicate===true,'CUSTOMER_EPMC_ADAPTER_EXPECTED_ORIGINAL_RECEIPT');return result;
    },
  };
  return {schema:'sf88.research-customer-europe-pmc-adapter.v1',operationId:selection.operationId,
    dossierId,questionIds:clone(questionIds),library:clone(selection.library),
    operations:Object.fromEntries(Object.entries(contexts).map(([key,value])=>[key,{
      ...value.operation,query:clone(value.plan.payload.query),label:value.plan.payload.label,
      sourcePages:clone(value.sources),reviewReceipts:clone(value.reviewReceipts),receipts:clone(value.receipts)}])),
    requests:clone(originals.filter(row=>['review','receive'].includes(row.method))),
    read,replay,directory:journal.path('adapters/'+name),
    retain:(file,bytes,kind='adapter')=>journal.retain('adapters/'+name+'/'+file,bytes,kind)};
}
async function runAdapters({api,client,journal,selection,dossierId,questionIds,contexts,adapters}){
  const results={};
  for(const name of selection.adapters??[]){
    need(typeof adapters[name]==='function','CUSTOMER_EPMC_SELECTED_ADAPTER_REQUIRED');
    const requests=await journal.requests(),facade=adapterFacade({api,client,journal,selection,dossierId,questionIds,contexts,requests,name});
    await privateDirectory(facade.directory);
    let value=await journal.value('adapter:'+name);
    if(value===undefined){
      value=await adapters[name](facade);
      need(object(value),'CUSTOMER_EPMC_ADAPTER_RESULT_REQUIRED');
      value=await journal.remember('adapter:'+name,value);
    }
    await journal.retain('adapters/'+name+'/result.json',jsonBytes(value),'adapter-receipt');results[name]=value;
  }
  return results;
}

async function verifyColdRestore({api,receivingClient,journal,selection,sourceWorkspaceId,finalInventory,contexts,archive,exportReceipt}){
  const identity=await receivingClient.status();
  need(identity.workspaceId!==sourceWorkspaceId,'CUSTOMER_EPMC_SEPARATE_RECEIVING_WORKSPACE_REQUIRED');
  const cold=receivingClient.europePmc(),expectedName='received-'+hash(selection.restore.requestId);
  let prepared=await journal.value('cold-preparation');
  if(!prepared){
    const initial=await inventory(cold);checkSelectedLibrary(selection.restore.library,initial);
    prepared=await journal.remember('cold-preparation',{workspaceId:identity.workspaceId,initial,
      requestId:selection.restore.requestId,archiveSha256:exportReceipt.sha256,archiveBytes:exportReceipt.bytes});
    await journal.retain('cold/original-library.json',jsonBytes(initial),'observation');
  }else need(prepared.workspaceId===identity.workspaceId&&prepared.requestId===selection.restore.requestId&&
    prepared.archiveSha256===exportReceipt.sha256&&prepared.archiveBytes===exportReceipt.bytes,'CUSTOMER_EPMC_COLD_SELECTION_CHANGED');
  const current=await inventory(cold);
  need(current.selection.library===prepared.initial.selection.library||current.selection.library===expectedName,
    'CUSTOMER_EPMC_COLD_LIBRARY_CHANGED');
  if(current.selection.library!==expectedName)need(same(current,prepared.initial),'CUSTOMER_EPMC_COLD_TARGET_HAS_CHANGED');
  const input={requestId:selection.restore.requestId,actor:selection.restore.actor,file:archive,
    expectedSha256:exportReceipt.sha256};
  const result=await journal.step('cold-restore',{method:'restoreFile',receivingWorkspaceId:identity.workspaceId,input},
    saved=>cold.restoreFile(saved.input),{project:value=>({receipt:value.receipt,selected:value.selected}),
      validate:value=>need(value.receipt?.schema==='stellar-forge.europe-pmc-selected-receiving.v1'&&
        value.receipt.requestId===input.requestId&&value.receipt.actor===input.actor&&value.receipt.archiveSha256===exportReceipt.sha256&&
        value.receipt.archiveBytes===exportReceipt.bytes&&value.receipt.library===expectedName&&
        value.receipt.workspaceId===finalInventory.workspaceId&&value.receipt.revision===finalInventory.revision&&
        value.selected.library===expectedName,'CUSTOMER_EPMC_RESTORED_RECEIPT_CHANGED')});
  const restored=await inventory(cold);
  need(restored.selection.library===expectedName&&restored.workspaceId===finalInventory.workspaceId&&
    restored.revision===finalInventory.revision&&same(restored.history,finalInventory.history)&&
    same(restored.queries,finalInventory.queries)&&same(restored.operations,finalInventory.operations),
    'CUSTOMER_EPMC_RESTORED_LIBRARY_CHANGED');
  const checks=[];
  for(const [name,context]of Object.entries(contexts)){
    const operation=context.operation;
    const originalBytes=await journal.recover(context.editionFile),edition=validateEdition(parseJson(originalBytes));
    const records=await allRecords(cold,operation.operationId,operation.editionSha256);verifyRecords(records,edition);
    const originalRecords=parseJson(await journal.recover('editions/'+name+'/records.json'));
    need(same(records,originalRecords),'CUSTOMER_EPMC_COLD_RECORD_REVIEW_CHANGED');
    await journal.download('cold/readback/'+name+'/edition.json',{operationId:operation.operationId,sha256:operation.editionSha256,
      bytes:operation.editionBytes},file=>cold.exportEdition(operation.operationId,{file,format:'edition',expectedSha256:operation.editionSha256}),
      bytes=>need(bytes.equals(originalBytes),'CUSTOMER_EPMC_COLD_EDITION_CHANGED'),'verification',{keep:false});
    for(const page of context.sources){
      const expected=edition.originalDocuments[page.index],{bodyBase64,...descriptor}=expected;
      const actual=await cold.source(operation.operationId,page.index);
      need(same(actual,descriptor),'CUSTOMER_EPMC_COLD_SOURCE_DESCRIPTOR_CHANGED');
      await journal.download('cold/readback/'+name+'/page-'+String(page.index+1)+'.json',page,
        file=>cold.exportSource(operation.operationId,{file,index:page.index,expectedSha256:page.bodySha256}),
        bytes=>need(bytes.length===page.bodyBytes&&sha256(bytes)===page.bodySha256&&bytes.toString('base64')===bodyBase64,
          'CUSTOMER_EPMC_COLD_SOURCE_CHANGED'),'verification',{keep:false});
    }
    if(context.boundaryFile){
      const original=parseJson(await journal.recover('editions/'+name+'/boundary.descriptor.json'));
      const actual=await cold.source(operation.operationId,operation.pages,{boundary:true});
      need(same(actual,original),'CUSTOMER_EPMC_COLD_BOUNDARY_CHANGED');
      await journal.download('cold/readback/'+name+'/boundary.json',original,
        file=>cold.exportSource(operation.operationId,{file,index:operation.pages,boundary:true,expectedSha256:original.bodySha256}),
        bytes=>need(bytes.length===original.bodyBytes&&sha256(bytes)===original.bodySha256,
          'CUSTOMER_EPMC_COLD_BOUNDARY_CHANGED'),'verification',{keep:false});
    }
    for(const format of ['ris','csv','review']){
      const original=await journal.recover('editions/'+name+'/'+(format==='review'?'review.json':'records.'+format));
      await journal.download('cold/readback/'+name+'/'+format,{operationId:operation.operationId,format,
        bytes:original.length,sha256:sha256(original)},file=>cold.exportEdition(operation.operationId,{
          file,format,expectedSha256:sha256(original)}),bytes=>need(bytes.equals(original),'CUSTOMER_EPMC_COLD_FORMAT_CHANGED'),
        'verification',{keep:false});
    }
    checks.push({...operation,records:records.total,originalPages:context.sources.length,allReviewsPreserved:true});
  }
  for(const comparison of selection.comparisons){
    const actual=await allComparison(cold,contexts[comparison.before].operation.operationId,contexts[comparison.after].operation.operationId);
    const original=parseJson(await journal.recover('comparisons/'+comparison.key+'.json'));
    need(same(actual,original.native),'CUSTOMER_EPMC_COLD_COMPARISON_CHANGED');
  }
  const summary={schema:'sf88.research-customer-europe-pmc-cold-receiving.v1',
    receivingWorkspaceId:identity.workspaceId,library:expectedName,originalLibraryId:finalInventory.workspaceId,
    nativeReceipt:result.receipt,sourceInventorySha256:finalInventory.inventorySha256,
    queries:restored.queries.map(row=>({id:row.id,revision:row.revision,sha256:row.sha256,versions:row.versions.length})),
    operations:checks,completeLibraryHistory:true};
  await journal.retain('cold/complete.json',jsonBytes(summary),'verification');
  return summary;
}

/**
 * Operate only the retained customer-selected Europe PMC work.
 * The caller owns both original clients/listeners and their resource lifetime.
 * A reentry must supply the same selection, dossier/question bindings and base.
 */
export async function runCustomerEuropePmc({client,receivingClient,selection,dossierId,questionIds,expectedRevision,directory,adapters={}}={}){
  selection=checkedSelection(selection);
  need(client&&receivingClient&&typeof client.status==='function'&&typeof client.europePmc==='function'&&
    typeof receivingClient.status==='function'&&typeof receivingClient.europePmc==='function',
    'CUSTOMER_EPMC_ORIGINAL_CLIENTS_REQUIRED');
  need(typeof dossierId==='string'&&dossierId.length>0&&dossierId.length<=160&&object(questionIds)&&
    Object.entries(questionIds).every(([name,id])=>key(name)&&typeof id==='string'&&id.length>0&&id.length<=160)&&
    integer(expectedRevision)&&expectedRevision>=1,'CUSTOMER_EPMC_DOSSIER_BINDING_REQUIRED');
  need(typeof directory==='string'&&isAbsolute(directory)&&resolve(directory)===directory,'CUSTOMER_EPMC_PRIVATE_DIRECTORY_REQUIRED');
  for(const name of selection.adapters??[])need(typeof adapters[name]==='function','CUSTOMER_EPMC_SELECTED_ADAPTER_REQUIRED');
  need(Object.keys(adapters).every(name=>(selection.adapters??[]).includes(name)),'CUSTOMER_EPMC_UNSELECTED_ADAPTER');
  const sourceIdentity=await client.status(),receiverIdentity=await receivingClient.status();
  need(sourceIdentity.workspaceId!==receiverIdentity.workspaceId,'CUSTOMER_EPMC_SEPARATE_RECEIVING_WORKSPACE_REQUIRED');
  await privateDirectory(directory);
  return withPrivateLock(directory,'customer-europe-pmc.lock',async()=>{
    const input={schema:selection.schema,selection,dossierId,questionIds:clone(questionIds),expectedRevision,
      directory,sourceWorkspaceId:sourceIdentity.workspaceId,receivingWorkspaceId:receiverIdentity.workspaceId};
    const journal=await openJournal(directory,input);
    const prior=await journal.value('complete');
    if(prior){
      const historical=await client.metadata(dossierId,{revision:prior.finalRevision});
      need(historical.id===dossierId&&historical.revision===prior.finalRevision,'CUSTOMER_EPMC_COMPLETED_DOSSIER_MISSING');
      return {...prior,files:await journal.files()};
    }
    const attempt={startedAt:stamp(),stage:journal.state.stage};journal.state.attempts.push(attempt);await journal.save();
    try{
      const api=client.europePmc(),selectedIds=new Set();
      for(const operation of selection.operations){
        const id=operation.existing?.operationId??predicted('epop',(operation.prepare??operation.continuation).requestId);
        need(!selectedIds.has(id),'CUSTOMER_EPMC_DUPLICATE_SELECTED_OPERATION');selectedIds.add(id);
        for(const receiving of operation.receives)need(Object.hasOwn(questionIds,receiving.question),'CUSTOMER_EPMC_QUESTION_BINDING_MISSING');
      }
      let baseline=await journal.value('baseline');
      if(!baseline){
        const library=await inventory(api);checkSelectedLibrary(selection.library,library);
        const dossier=await client.metadata(dossierId);
        need(dossier.id===dossierId&&dossier.revision===expectedRevision&&
          Object.values(questionIds).every(id=>dossier.questions.some(row=>row.id===id)),
          'CUSTOMER_EPMC_ORIGINAL_DOSSIER_CHANGED');
        baseline=await journal.remember('baseline',{library,dossier});
      }
      await journal.retain('library-before.json',jsonBytes(baseline.library),'library-inventory');
      await journal.retain('dossier-before.json',jsonBytes(baseline.dossier),'dossier-metadata');
      const currentLibrary=await inventory(api);
      assertLibraryChanges(baseline.library,currentLibrary,await journal.requests(),selectedIds);
      need(currentLibrary.selection.library===selection.library.name,'CUSTOMER_EPMC_SELECTED_LIBRARY_CHANGED');
      // Retain and validate every input before creating this selection's query
      // or plan. A reopened operation can consume its already retained copy.
      for(const operation of selection.operations)if(operation.import){
        const retained=await journal.recover('inputs/'+operation.key+'.json');
        const imported=await readImport(operation.import,retained);
        await journal.retain('inputs/'+operation.key+'.json',imported.bytes,'original-input');
      }
      const queries={};
      journal.state.stage='QUERIES';await journal.save();
      for(const selected of selection.queries)queries[selected.key]=await selectedQuery(api,journal,selected);
      const contexts={};let revision=expectedRevision;
      journal.state.stage='EDITIONS_AND_RECEIVING';await journal.save();
      for(const selected of selection.operations){
        let parent=selected.parent?contexts[selected.parent]:null;
        if(parent?.boundaryFile){
          const metadata=parseJson(await journal.recover('editions/'+selected.parent+'/boundary.descriptor.json'));
          const bytes=await journal.recover(parent.boundaryFile);parent={...parent,boundary:{...metadata,bodyBase64:bytes.toString('base64')}};
        }
        const imported=selected.import?await readImport(selected.import,await journal.recover('inputs/'+selected.key+'.json')):null;
        const context=await operationSource(api,journal,selected,queries[selected.query],parent,imported);
        const received=await reviewAndReceive({api,client,journal,selected,context,dossierId,questionIds,revision});
        revision=received.revision;
        contexts[selected.key]={plan:context.plan,operation:context.operation,sources:context.sources,
          nativeState:context.nativeState,boundaryDescriptor:context.boundaryDescriptor,
          editionFile:'editions/'+selected.key+'/edition.json',boundaryFile:context.boundary?'editions/'+selected.key+'/boundary.json':null,
          reviewReceipts:received.reviewReceipts,receipts:received.receipts,chain:received.chain};
      }
      journal.state.stage='COMPARISONS';await journal.save();const comparisons={};
      for(const selected of selection.comparisons){
        const before=contexts[selected.before],after=contexts[selected.after],
          old=validateEdition(parseJson(await journal.recover(before.editionFile))),
          current=validateEdition(parseJson(await journal.recover(after.editionFile))),
          expected=compareEditions(old,current);
        need((selected.scope==='scope-change')===expected.queryScopeChanged,'CUSTOMER_EPMC_COMPARISON_SCOPE_CHANGED');
        const native=await journal.snapshot('comparison-'+selected.key,()=>allComparison(api,before.operation.operationId,after.operation.operationId));
        need(same(native,{...expected,total:expected.items.length,nextOffset:null}),'CUSTOMER_EPMC_COMPARISON_CHANGED');
        const report={schema:'sf88.research-customer-europe-pmc-comparison.v1',selection:selected,
          before:before.operation,after:after.operation,native};
        await journal.retain('comparisons/'+selected.key+'.json',jsonBytes(report),'comparison');comparisons[selected.key]=report;
      }
      const adapterResults=await runAdapters({api,client,journal,selection,dossierId,questionIds,contexts,adapters});
      journal.state.stage='COMPLETE_LIBRARY_EXPORT';await journal.save();
      let finalInventory=await journal.value('final-library');
      if(!finalInventory){
        finalInventory=await inventory(api);
        assertLibraryChanges(baseline.library,finalInventory,await journal.requests(),selectedIds,contexts);
        finalInventory=await journal.remember('final-library',finalInventory);
      }else{
        const actual=await inventory(api);need(same(actual,finalInventory),'CUSTOMER_EPMC_LIBRARY_CHANGED_AFTER_EXPORT_SELECTION');
      }
      const dossier=await client.metadata(dossierId);
      need(dossier.id===dossierId&&dossier.revision===revision,'CUSTOMER_EPMC_DOSSIER_REVISION_CONFLICT');
      await journal.retain('library-after.json',jsonBytes(finalInventory),'library-inventory');
      await journal.retain('dossier-after.json',jsonBytes(dossier),'dossier-metadata');
      const exportReceipt=await journal.step('workspace-export',{method:'exportWorkspace',input:selection.workspaceExport},
        saved=>api.exportWorkspace(saved.input),{validate:value=>need(value.schema==='stellar-forge.europe-pmc-export.v1'&&
          value.requestId===selection.workspaceExport.requestId&&value.fingerprint===hash(selection.workspaceExport)&&
          value.workspace.id===finalInventory.workspaceId&&value.workspace.revision===finalInventory.revision&&
          digest(value.sha256)&&integer(value.bytes)&&value.bytes>0,'CUSTOMER_EPMC_WORKSPACE_EXPORT_CHANGED')});
      const archiveName='Europe_PMC_Workspace.json.gz';
      await journal.download(archiveName,{requestId:exportReceipt.requestId,bytes:exportReceipt.bytes,sha256:exportReceipt.sha256,
        inventorySha256:finalInventory.inventorySha256},
        file=>api.downloadWorkspace({requestId:exportReceipt.requestId,file,expectedSha256:exportReceipt.sha256}),
        bytes=>{
          need(bytes.length===exportReceipt.bytes&&sha256(bytes)===exportReceipt.sha256,'CUSTOMER_EPMC_WORKSPACE_ARCHIVE_CHANGED');
          assertPortableInventory(validateEuropePmcPortable(bytes),finalInventory);
        },'workspace');
      journal.state.stage='COLD_RESTORE';await journal.save();
      const coldRestore=await verifyColdRestore({api,receivingClient,journal,selection,sourceWorkspaceId:sourceIdentity.workspaceId,
        finalInventory,contexts,archive:journal.path(archiveName),exportReceipt});
      // The source library and dossier are read again after the receiving proof.
      // Restoring the separate receiver must not switch or edit this selection.
      const sourceAfter=await inventory(api);
      need(same(sourceAfter,finalInventory),'CUSTOMER_EPMC_SOURCE_LIBRARY_CHANGED_DURING_COLD_RESTORE');
      const currentDossier=await client.metadata(dossierId);
      need(currentDossier.revision===revision,'CUSTOMER_EPMC_DOSSIER_REVISION_CONFLICT');
      const result={schema:'sf88.research-customer-europe-pmc-result.v1',operationId:selection.operationId,
        selectionSha256:hash(selection),finalRevision:revision,native:{sourceWorkspaceId:sourceIdentity.workspaceId,dossierId,
          questionIds:clone(questionIds),library:{name:finalInventory.selection.library,id:finalInventory.workspaceId,
            revision:finalInventory.revision,initialInventorySha256:baseline.library.inventorySha256,
            finalInventorySha256:finalInventory.inventorySha256,scope:selection.library.scope},
          queries,operations:Object.fromEntries(Object.entries(contexts).map(([name,value])=>[name,{
            ...value.operation,queryId:value.plan.payload.query.id,queryRevision:value.plan.payload.query.revision,
            label:value.plan.payload.label,pagination:value.plan.payload.pagination,sourcePages:value.sources,
            reviewReceipts:value.reviewReceipts,receipts:value.receipts,chain:value.chain}])),
          comparisons,workspaceExport:exportReceipt,coldRestore,adapters:adapterResults}};
      await journal.retain('COMPLETE.json',jsonBytes(result),'completion');
      await journal.remember('complete',result);
      journal.state.stage='COMPLETE';attempt.completedAt=stamp();attempt.outcome='COMPLETE';await journal.save();
      return {...result,files:await journal.files()};
    }catch(error){
      attempt.endedAt=stamp();attempt.outcome='RECONCILE_ORIGINAL_REQUEST';
      journal.state.lastError={code:typeof error.code==='string'?error.code:'CUSTOMER_EPMC_FAILED',at:attempt.endedAt};
      await journal.save().catch(()=>{});throw error;
    }
  });
}
