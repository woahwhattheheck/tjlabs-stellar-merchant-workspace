// MIT. Private operator desk over the original customer handover return course.
import {createServer} from 'node:http';
import {join,resolve,dirname,basename,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {open,lstat,readdir,link,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {withPrivateLock} from '../../../sf30-seller-sdk/routescan/quota.mjs';
import {jsonBytes,digest,exists} from '../../node/store.mjs';
import {readResearchHostFile,openResearchSource} from '../workspace-files.mjs';
import {customerDirectory,readCustomerJson,retainCustomerBytes,retainCustomerJson,describeCustomerFile} from './files.mjs';
import {validateCustomerReturnRequest} from '../customer-programme/returns.mjs';
import {HANDOVER_RETURNS_SCHEMA,prepareCustomerHandoverReturns,prepareCustomerHandoverReturn,
  applyCustomerHandoverReturn,completeCustomerHandoverReturns,readCustomerHandoverReturns} from './handover-returns.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const JSON_LIMIT=16*1024*1024,WIRE_LIMIT=256*1024*1024;
const SCHEMA='sf88.research-customer-handover-desk.v1';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(left,right)=>JSON.stringify(canonical(left))===JSON.stringify(canonical(right));
function need(value,code,status=409){if(!value)throw Object.assign(new Error(code),{code,status});}
function keys(value,allowed){need(object(value)&&Object.keys(value).every(key=>allowed.includes(key)),'DESK_FIELDS_INVALID',400);}
function hash(value){need(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'DESK_HASH_INVALID',400);return value;}
function absolute(value){need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&value!=='/','DESK_DIRECTORY_INVALID',400);return value;}
function member(value){need(typeof value==='string'&&value&&!value.startsWith('/')&&!value.includes('\\')&&
  !/[\u0000-\u001f\u007f]/.test(value)&&value.split('/').every(part=>part&&part!=='.'&&part!=='..'),'DESK_MEMBER_INVALID',400);return value;}
const errorCode=error=>/^[A-Z][A-Z0-9_]{0,119}$/.test(error?.code??'')?error.code:'DESK_OPERATION_FAILED';
async function maybe(file){try{return await readCustomerJson(file,JSON_LIMIT);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function save(root,name,value){
  const file=join(root,...member(name).split('/'));await customerDirectory(dirname(file));
  return retainCustomerJson(dirname(file),basename(file),value);
}
async function saveBytes(root,name,body){
  const file=join(root,...member(name).split('/'));await customerDirectory(dirname(file));
  return retainCustomerBytes(dirname(file),basename(file),body);
}
function publicSelection(selected){
  return {operationId:selected.operation_id,customerLabel:selected.customer_label,dossierId:selected.dossier_id,
    workspaceId:selected.workspace_id,expectedRevision:selected.expected_revision,
    expectedRevisionSha256:selected.expected_revision_sha256,maximumTotalItems:selected.maximum_total_items,
    maximumTotalReturns:selected.maximum_total_returns,rounds:selected.rounds.map(row=>({key:row.key,
      maximumItems:row.maximum_items,maximumSourceBytes:row.maximum_source_bytes}))};
}
function validateDeskSelection(selected){
  need(object(selected)&&selected.schema===HANDOVER_RETURNS_SCHEMA&&
    typeof selected.operation_id==='string'&&typeof selected.customer_label==='string'&&
    /^d_[a-f0-9-]{36}$/.test(selected.dossier_id??'')&&/^research_[a-f0-9]{64}$/.test(selected.workspace_id??'')&&
    Array.isArray(selected.rounds)&&selected.rounds.length>0&&selected.rounds.length<=32,'DESK_SELECTION_INVALID',400);
  const names=new Set();
  for(const round of selected.rounds){
    need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(round.key??'')&&!names.has(round.key)&&
      Number.isSafeInteger(round.maximum_source_bytes)&&round.maximum_source_bytes>0&&round.maximum_source_bytes<=WIRE_LIMIT,
      'DESK_ROUND_INVALID',400);names.add(round.key);
  }
  return selected;
}
function partialDraft(value,comparison){
  keys(value,['reviewedBy','reviewNote','decisions']);
  need(typeof value.reviewedBy==='string'&&value.reviewedBy.length<=512&&
    (value.reviewNote===undefined||typeof value.reviewNote==='string'&&value.reviewNote.length<=16000)&&
    Array.isArray(value.decisions)&&value.decisions.length<=comparison.total,'DESK_DRAFT_INVALID',400);
  const items=new Map(comparison.items.map(item=>[item.id,item])),seen=new Set();
  for(const decision of value.decisions){
    keys(decision,['itemId','choice','value']);const item=items.get(decision.itemId);
    need(item&&!seen.has(decision.itemId)&&item.allowedChoices.includes(decision.choice),'DESK_DRAFT_DECISION_INVALID',400);
    need(decision.choice==='EDIT'?Object.hasOwn(decision,'value'):!Object.hasOwn(decision,'value'),'DESK_DRAFT_EDIT_INVALID',400);
    seen.add(decision.itemId);
  }
  need(jsonBytes(value).length<=JSON_LIMIT-8192,'DESK_DRAFT_TOO_LARGE',413);
  return value;
}
async function readBody(request,limit){
  const declared=request.headers['content-length'];
  if(declared!==undefined)need(/^(0|[1-9][0-9]*)$/.test(declared)&&Number(declared)<=limit,'DESK_BODY_TOO_LARGE',413);
  let count=0;const parts=[];
  for await(const chunk of request){count+=chunk.length;need(count<=limit,'DESK_BODY_TOO_LARGE',413);parts.push(chunk);}
  need(declared===undefined||count===Number(declared),'DESK_BODY_INCOMPLETE',400);
  return Buffer.concat(parts,count);
}
async function bodyJson(request){
  need((request.headers['content-type']??'').split(';')[0].trim()==='application/json','DESK_JSON_REQUIRED',415);
  const wire=await readBody(request,JSON_LIMIT);let value;
  need(Buffer.from(wire.toString('utf8'),'utf8').equals(wire),'DESK_JSON_UTF8_INVALID',400);
  try{value=JSON.parse(wire.toString('utf8'));}catch{need(false,'DESK_JSON_INVALID',400);}
  return value;
}
function headers(response,status,type='application/json; charset=utf-8'){
  response.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Cross-Origin-Resource-Policy':'same-origin'});
}
function reply(response,status,value){
  if(response.destroyed||response.writableEnded)return;
  headers(response,status);response.end(JSON.stringify(value)+'\n');
}
function filenameHeader(value){
  const safe=value.replace(/[\u0000-\u001f\u007f]/g,'_').replace(/[\\/]/g,'_');
  return 'attachment; filename="'+safe.replace(/[^\x20-\x7e]|["\\]/g,'_')+'"; filename*=UTF-8\'\''+
    encodeURIComponent(safe).replace(/['()*]/g,character=>'%'+character.charCodeAt(0).toString(16).toUpperCase());
}
async function ordinaryTree(root){
  const result=[];
  if(!await exists(root))return result;
  await customerDirectory(root,{create:false});
  async function visit(directory,prefix){
    for(const name of (await readdir(directory)).sort()){
      const relative=prefix?prefix+'/'+name:name;member(relative);
      const file=join(directory,name),stat=await lstat(file);
      need(!stat.isSymbolicLink(),'DESK_SELECTED_FILE_CHANGED');
      if(stat.isDirectory())await visit(file,relative);
      else{need(stat.isFile(),'DESK_SELECTED_FILE_CHANGED');result.push({file,relative});}
    }
  }
  await visit(root,'');return result;
}

/** A single original course and one private loopback host; close waits for its current job. */
export async function startCustomerHandoverDesk({client,directory,selectionFile,selectionSha256,
  port=0,python='python3',node=process.execPath}={}){
  need(client&&typeof client.dossierReturns==='function','DESK_CLIENT_REQUIRED',400);
  absolute(directory);absolute(selectionFile);hash(selectionSha256);
  need(Number.isInteger(port)&&port>=0&&port<=65535,'DESK_PORT_INVALID',400);
  const selectedWire=await readResearchHostFile(selectionFile,JSON_LIMIT,{sha256:selectionSha256});
  const selected=validateDeskSelection(JSON.parse(selectedWire.toString('utf8')));
  need((await client.status()).workspaceId===selected.workspace_id,'DESK_WORKSPACE_CHANGED');
  const root=await customerDirectory(directory),privateRoot=await customerDirectory(join(root,'desk-private'));
  await saveBytes(privateRoot,'SELECTION.original.json',selectedWire);
  const coreSelection=await maybe(join(root,'SELECTION.original.json'));
  need(!coreSelection||coreSelection.body.equals(selectedWire),'DESK_SELECTED_COURSE_CHANGED');
  const token=randomBytes(32).toString('base64url'),tokenBytes=Buffer.from(token);
  let server,origin,closing=false,active=null,currentJob=null,resolveStop,resolveReady,rejectReady,clientClosed=false;
  const closeClient=async()=>{if(!clientClosed){await client.close();clientClosed=true;}};
  const stopped=new Promise(resolvePromise=>{resolveStop=resolvePromise;});
  const ready=new Promise((resolvePromise,rejectPromise)=>{resolveReady=resolvePromise;rejectReady=rejectPromise;});
  const downloads=new Map(),descriptorCache=new Map();
  const roundFor=key=>{
    const row=selected.rounds.find(round=>round.key===key);need(row,'DESK_ROUND_UNKNOWN',404);return row;
  };
  const stage=key=>join(root,'rounds',roundFor(key).key);
  const ownStage=async key=>customerDirectory(join(privateRoot,'rounds',roundFor(key).key));
  async function comparisonFor(key){
    const result=await maybe(join(stage(key),'COMPARISON.json'));if(!result)return null;
    const comparison=result.value;
    need(comparison.reviewId&&comparison.comparisonSha256&&Array.isArray(comparison.items)&&
      comparison.items.length===comparison.total&&comparison.source?.id&&comparison.current?.revision,
      'DESK_COMPARISON_INVALID');
    return comparison;
  }
  async function draftFor(key,comparison){
    const location=join(await ownStage(key),'drafts');if(!await exists(location))return null;
    const names=(await readdir(location)).filter(name=>/^[0-9]{8}\.json$/.test(name)).sort();let previous=null,index=0;
    for(const name of names){
      need(/^[0-9]{8}\.json$/.test(name)&&Number(name.slice(0,8))===index+1,'DESK_DRAFT_HISTORY_CHANGED');
      const raw=await readCustomerJson(join(location,name),JSON_LIMIT),row=raw.value;index++;
      need(row.schema===SCHEMA+'.draft'&&row.key===key&&row.generation===index&&
        row.previousSha256===(previous?.sha256??null)&&row.selectionSha256===selectionSha256&&
        row.reviewId===comparison.reviewId&&row.comparisonSha256===comparison.comparisonSha256&&
        row.expectedRevision===comparison.current.revision,'DESK_DRAFT_HISTORY_CHANGED');
      partialDraft(row.value,comparison);
      need(row.requestId===requestId(key,comparison),'DESK_DRAFT_REQUEST_CHANGED');
      previous={sha256:raw.sha256,value:row.value,requestId:row.requestId,reviewId:row.reviewId,
        comparisonSha256:row.comparisonSha256,expectedRevision:row.expectedRevision,
        generation:row.generation,previousSha256:row.previousSha256,file:join(location,name)};
    }
    return previous;
  }
  function requestId(key,comparison){
    return 'handover-desk-'+digest(jsonBytes({selectionSha256,key,reviewId:comparison.reviewId}));
  }
  async function originalRequest(key,comparison){
    const local=await maybe(join(await ownStage(key),'REQUEST.original.json'));
    const native=await maybe(join(stage(key),'REQUEST.original.json'));
    if(local&&native)need(local.body.equals(native.body),'DESK_ORIGINAL_REQUEST_CHANGED');
    const raw=local??native;
    if(raw){need(comparison,'DESK_COMPARISON_REQUIRED');validateCustomerReturnRequest(raw.value,comparison);}
    return raw;
  }
  async function sourceFor(key){
    const location=await ownStage(key),local=await maybe(join(location,'SOURCE.json'));
    const native=await maybe(join(stage(key),'SOURCE.json'));
    if(local&&native)for(const field of ['filename','contentType','bytes','sha256'])
      need(local.value[field]===native.value[field],'DESK_ORIGINAL_SOURCE_CHANGED');
    if(local)return {...local.value,file:join(location,'source.bin')};
    if(native)return {...native.value,file:join(stage(key),'original-return.bin')};
    return null;
  }
  async function addDownload(file,label,filename,expected={}){
    const stamp=value=>[value.dev,value.ino,value.size,value.mtimeNs,value.ctimeNs,value.mode,value.uid].join(':');
    const before=await lstat(file,{bigint:true});need(before.isFile()&&!before.isSymbolicLink(),'DESK_SELECTED_FILE_CHANGED');
    const currentStamp=stamp(before),cached=descriptorCache.get(file);let descriptor;
    if(cached?.stamp===currentStamp)descriptor=cached.descriptor;
    else{
      descriptor=await describeCustomerFile(file,{...expected,maximum:WIRE_LIMIT});
      need(stamp(await lstat(file,{bigint:true}))===currentStamp,'DESK_SELECTED_FILE_CHANGED');
      descriptorCache.set(file,{stamp:currentStamp,descriptor});
    }
    need((expected.bytes===undefined||descriptor.bytes===expected.bytes)&&
      (expected.sha256===undefined||descriptor.sha256===expected.sha256),'DESK_SELECTED_FILE_CHANGED');
    const id='df_'+digest(jsonBytes({file:resolve(file),bytes:descriptor.bytes,sha256:descriptor.sha256}));
    downloads.set(id,{...descriptor,filename:filename??descriptor.name});
    return {id,label,filename:filename??descriptor.name,bytes:descriptor.bytes,sha256:descriptor.sha256};
  }
  async function roundFiles(key){
    const result=[],used=new Set(),base=stage(key);
    async function add(file,label,filename,expected){
      if(used.has(file)||!await exists(file))return;used.add(file);
      result.push(await addDownload(file,label,filename,expected));
    }
    for(const name of ['SOURCE.json','COMPARISON.json','REQUEST.original.json','ACCEPTED.json','DISPATCH.json'])
      await add(join(base,name),name);
    for(const row of await ordinaryTree(join(base,'public')))
      await add(row.file,row.relative,basename(row.relative));
    const source=await sourceFor(key);
    if(source)await add(source.file,'Original returned file',source.filename,source);
    const own=await ownStage(key),request=join(own,'REQUEST.original.json');
    await add(request,'Exact reviewed request');
    const comparison=await comparisonFor(key);
    if(comparison){const draft=await draftFor(key,comparison);if(draft)await add(draft.file,'Complete saved draft','draft.json');}
    return result;
  }
  async function courseFiles(){
    const result=[];
    for(const name of ['SELECTION.original.json','INITIAL.json','ENGINE_SELECTION.json','PACKAGE_SELECTION.json',
      'PACKAGE_BUILT.json','PACKAGE_RECEIVED.json','COMPLETE.json'])
      if(await exists(join(root,name)))result.push(await addDownload(join(root,name),name));
    const complete=await maybe(join(root,'COMPLETE.json')),built=await maybe(join(root,'PACKAGE_BUILT.json'));
    const archive=complete?.value.archive??built?.value.archive;
    if(archive){
      const expected=join(root,selected.output.filename_stem+'.zip');
      need(archive.file===expected,'DESK_ARCHIVE_PATH_CHANGED');
      result.push(await addDownload(expected,'Complete editable handover',basename(expected),archive));
    }
    for(const name of ['COURSE.json','PACKAGE_MANIFEST.json','START_HERE.html','HANDOVER_RETURNS.md',
      'dossier/current.json.gz','dossier/current.metadata.json','dossier/history.json','dossier/current.html','dossier/current.md'])
      if(await exists(join(root,'public',name)))result.push(await addDownload(join(root,'public',name),name));
    return result;
  }
  async function roundView(key){
    roundFor(key);const comparison=await comparisonFor(key),request=await originalRequest(key,comparison);
    const draft=comparison?await draftFor(key,comparison):null,accepted=await maybe(join(stage(key),'ACCEPTED.json'));
    const source=await sourceFor(key);
    return {key,comparison,request:request?.value??null,requestSha256:request?.sha256??null,
      draft:draft?{sha256:draft.sha256,value:draft.value,requestId:draft.requestId,reviewId:draft.reviewId,
        comparisonSha256:draft.comparisonSha256,expectedRevision:draft.expectedRevision,
        locked:!!request||await exists(join(await ownStage(key),'REQUEST_BINDING.json'))}:null,
      source:source?{filename:source.filename,contentType:source.contentType,bytes:source.bytes,sha256:source.sha256}:null,
      accepted:accepted?.value??null,files:await roundFiles(key)};
  }
  async function status(){
    const initialized=await exists(join(root,'INITIAL.json'));
    let course=null;
    if(await exists(join(root,'SELECTION.original.json')))course=await readCustomerHandoverReturns({directory:root});
    return {selection:publicSelection(selected),initialized,course,job:currentJob,files:await courseFiles()};
  }
  async function initialize(){return prepareCustomerHandoverReturns({client,directory:root,
    selectionFile:join(privateRoot,'SELECTION.original.json'),selectionSha256});}
  async function draftSave(input){
    keys(input,['key','expectedSha256','value']);roundFor(input.key);
    need(input.expectedSha256===null||typeof input.expectedSha256==='string','DESK_DRAFT_EXPECTED_REQUIRED',400);
    if(input.expectedSha256!==null)hash(input.expectedSha256);
    const comparison=await comparisonFor(input.key);need(comparison,'DESK_COMPARISON_REQUIRED');
    const value=partialDraft(input.value,comparison);
    need(!await originalRequest(input.key,comparison)&&!await exists(join(await ownStage(input.key),'REQUEST_BINDING.json')),'DESK_REQUEST_ALREADY_FROZEN');
    const previous=await draftFor(input.key,comparison);
    if(previous&&previous.previousSha256===input.expectedSha256&&same(previous.value,value))
      return {sha256:previous.sha256,value:previous.value,requestId:previous.requestId,
        reviewId:previous.reviewId,comparisonSha256:previous.comparisonSha256,expectedRevision:previous.expectedRevision,locked:false};
    need((previous?.sha256??null)===input.expectedSha256,'DESK_DRAFT_CONFLICT');
    const next={schema:SCHEMA+'.draft',key:input.key,selectionSha256,generation:(previous?.generation??0)+1,
      previousSha256:previous?.sha256??null,requestId:requestId(input.key,comparison),
      reviewId:comparison.reviewId,comparisonSha256:comparison.comparisonSha256,expectedRevision:comparison.current.revision,value};
    need(next.generation<=99999999,'DESK_DRAFT_HISTORY_LIMIT');
    const location=await ownStage(input.key),saved=await save(location,'drafts/'+String(next.generation).padStart(8,'0')+'.json',next);
    return {sha256:saved.sha256,value,requestId:next.requestId,reviewId:next.reviewId,
      comparisonSha256:next.comparisonSha256,expectedRevision:next.expectedRevision,locked:false};
  }
  async function apply(input){
    keys(input,['key','draftSha256']);roundFor(input.key);
    need(input.draftSha256===null||typeof input.draftSha256==='string','DESK_DRAFT_EXPECTED_REQUIRED',400);
    if(input.draftSha256!==null)hash(input.draftSha256);
    const comparison=await comparisonFor(input.key);need(comparison,'DESK_COMPARISON_REQUIRED');
    const location=await ownStage(input.key);let request=await originalRequest(input.key,comparison);
    if(!request){
      const draft=await draftFor(input.key,comparison);
      need(draft&&input.draftSha256===draft.sha256,'DESK_DRAFT_CONFLICT');
      const value={requestId:draft.requestId,reviewId:draft.reviewId,expectedRevision:draft.expectedRevision,
        comparisonSha256:draft.comparisonSha256,...draft.value};
      validateCustomerReturnRequest(value,comparison);
      // A partial draft may contain an allowed EDIT whose full native state
      // dependencies are invalid. Keep that draft editable until the original
      // read-only validator accepts this exact candidate.
      const choices=await client.dossierReturns(selected.dossier_id).previewChoices({
        reviewId:value.reviewId,expectedRevision:value.expectedRevision,
        comparisonSha256:value.comparisonSha256,decisions:value.decisions});
      need(choices.valid===true&&choices.reviewId===comparison.reviewId&&
        choices.comparisonSha256===comparison.comparisonSha256&&same(choices.current,comparison.current),
        'DESK_NATIVE_CHOICES_INVALID');
      await save(location,'REQUEST_BINDING.json',{selectionSha256,key:input.key,draftSha256:draft.sha256,
        requestSha256:digest(jsonBytes(value))});
      await save(location,'REQUEST.original.json',value);
      request=await readCustomerJson(join(location,'REQUEST.original.json'),JSON_LIMIT);
    }else{
      const binding=await maybe(join(location,'REQUEST_BINDING.json'));
      if(input.draftSha256!==null)need(binding&&binding.value.draftSha256===input.draftSha256,'DESK_REQUEST_ALREADY_FROZEN');
      await saveBytes(location,'REQUEST.original.json',request.body);
      if(binding)need(binding.value.requestSha256===request.sha256&&binding.value.selectionSha256===selectionSha256&&
        binding.value.key===input.key,'DESK_ORIGINAL_REQUEST_CHANGED');
    }
    return applyCustomerHandoverReturn({client,directory:root,key:input.key,
      reviewFile:join(location,'REQUEST.original.json'),reviewSha256:request.sha256});
  }
  async function upload(request,key,filename,contentType){
    const round=roundFor(key);need(typeof filename==='string'&&filename.length>0&&filename.length<=512&&
      !/[\u0000-\u001f\u007f\\/]/.test(filename)&&filename!=='.'&&filename!=='..','DESK_FILENAME_INVALID',400);
    need(typeof contentType==='string'&&contentType.length>0&&contentType.length<=200&&
      !/[\u0000-\u001f\u007f]/.test(contentType),'DESK_CONTENT_TYPE_INVALID',400);
    need(['application/json','application/gzip','application/x-gzip','application/octet-stream'].includes(contentType),'DESK_CONTENT_TYPE_INVALID',400);
    need(request.headers['content-type']==='application/octet-stream','DESK_BINARY_REQUIRED',415);
    const declared=request.headers['content-length'];
    if(declared!==undefined)need(/^(0|[1-9][0-9]*)$/.test(declared)&&Number(declared)<=round.maximum_source_bytes,
      'DESK_BODY_TOO_LARGE',413);
    const location=await ownStage(key),candidate=join(location,'upload-'+randomUUID()+'.part');
    const file=await open(candidate,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    let count=0;const hasher=createHash('sha256');
    try{
      for await(const chunk of request){
        count+=chunk.length;need(count<=round.maximum_source_bytes,'DESK_BODY_TOO_LARGE',413);hasher.update(chunk);
        let offset=0;while(offset<chunk.length){const written=await file.write(chunk,offset,chunk.length-offset);
          need(written.bytesWritten>0,'DESK_UPLOAD_WRITE_FAILED');offset+=written.bytesWritten;}
      }
      need(count>0&&(declared===undefined||count===Number(declared)),'DESK_BODY_INCOMPLETE',400);
      await file.sync();
    }finally{await file.close();}
    const source={filename,contentType,bytes:count,sha256:hasher.digest('hex')};
    const previous=await sourceFor(key);
    if(previous)need(['filename','contentType','bytes','sha256'].every(field=>previous[field]===source[field]),
      'DESK_ORIGINAL_SOURCE_CHANGED');
    const destination=join(location,'source.bin');
    try{await link(candidate,destination);}catch(error){if(error.code!=='EEXIST')throw error;}
    await describeCustomerFile(destination,{...source,maximum:round.maximum_source_bytes});
    await save(location,'SOURCE.json',source);
    await unlink(candidate);return source;
  }
  async function startJob(action,key,work){
    need(!closing,'DESK_CLOSING',503);need(!active,'DESK_JOB_RUNNING');
    const job={id:Date.now()+'-'+randomUUID(),action,key:key??null,state:'RUNNING'};
    // Reserve before the first await so concurrent tabs cannot start another job.
    let resolveActive;active=new Promise(resolvePromise=>{resolveActive=resolvePromise;});
    currentJob=job;
    try{await save(privateRoot,'jobs/'+job.id+'.started.json',job);}
    catch(error){active=null;resolveActive();currentJob={...job,state:'FAILED',error:{code:errorCode(error)}};throw error;}
    void (async()=>{
      try{
        const result=await work();
        const finished={...job,state:'SUCCEEDED'};
        await save(privateRoot,'jobs/'+job.id+'.result.json',{...finished,result});
        currentJob=finished;
      }catch(error){
        const finished={...job,state:action==='apply'?'OUTCOME_UNCONFIRMED':'FAILED',error:{code:errorCode(error)}};
        try{await save(privateRoot,'jobs/'+job.id+'.result.json',finished);}catch{finished.retentionPending=true;}
        currentJob=finished;
      }finally{active=null;resolveActive();}
    })();
    return job;
  }
  async function synchronous(action,key,work){
    let resolveActive;need(!closing,'DESK_CLOSING',503);need(!active,'DESK_JOB_RUNNING');
    active=new Promise(resolvePromise=>{resolveActive=resolvePromise;});
    const job={id:Date.now()+'-'+randomUUID(),action,key:key??null,state:'RUNNING'};currentJob=job;
    try{const result=await work();currentJob={...job,state:'SUCCEEDED'};return result;}
    catch(error){currentJob={...job,state:'FAILED',error:{code:errorCode(error)}};throw error;}
    finally{active=null;resolveActive();}
  }
  async function recoverJob(){
    const location=join(privateRoot,'jobs');if(!await exists(location))return;
    const names=(await readdir(location)).filter(name=>/^[0-9]+-[a-f0-9-]+\.started\.json$/.test(name)).sort();
    const last=names.at(-1);if(!last)return;
    const started=(await readCustomerJson(join(location,last),JSON_LIMIT)).value;
    const result=await maybe(join(location,last.replace('.started.json','.result.json')));
    currentJob=result?{id:started.id,action:started.action,key:started.key,state:result.value.state,
      ...(result.value.error?{error:result.value.error}:{})}:
      {...started,state:started.action==='apply'?'OUTCOME_UNCONFIRMED':'INTERRUPTED'};
  }
  async function download(response,id){
    need(typeof id==='string'&&/^df_[a-f0-9]{64}$/.test(id),'DESK_DOWNLOAD_UNKNOWN',404);
    if(!downloads.has(id)){await courseFiles();for(const round of selected.rounds)await roundFiles(round.key);}
    const row=downloads.get(id);need(row,'DESK_DOWNLOAD_UNKNOWN',404);
    const source=await openResearchSource(row.path,WIRE_LIMIT,{sha256:row.sha256});
    try{
      need(source.bytes===row.bytes,'DESK_DOWNLOAD_CHANGED');
      response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':row.bytes,
        'Content-Disposition':filenameHeader(row.filename),'X-Content-SHA256':row.sha256,
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'none'; sandbox",'Cross-Origin-Resource-Policy':'same-origin'});
      await pipeline(source.stream,response);
    }finally{await source.close();}
  }
  async function valueFor(key,itemId,side){
    const comparison=await comparisonFor(key);need(comparison,'DESK_COMPARISON_REQUIRED');
    need(['base','current','returned'].includes(side),'DESK_SIDE_INVALID',400);
    const item=comparison.items.find(row=>row.id===itemId);
    need(item&&item[side]?.present,'DESK_VALUE_UNKNOWN',404);
    need(/^dri_[a-f0-9]{64}$/.test(itemId),'DESK_VALUE_UNKNOWN',404);
    const raw=await readCustomerJson(join(stage(key),'public','values',itemId+'-'+side+'.json'),WIRE_LIMIT),value=raw.value;
    need(value.reviewId===comparison.reviewId&&value.itemId===itemId&&value.side===side&&value.present===true&&
      value.sha256===item[side].sha256&&Object.hasOwn(value,'value'),'DESK_VALUE_CHANGED');
    return value;
  }
  function authorize(request){
    need(request.headers.host===new URL(origin).host,'DESK_HOST_INVALID',403);
    const fetchSite=request.headers['sec-fetch-site'];
    need(!fetchSite||fetchSite==='same-origin'||fetchSite==='none','DESK_ORIGIN_INVALID',403);
    if(request.headers.origin!==undefined)need(request.headers.origin===origin,'DESK_ORIGIN_INVALID',403);
    const value=request.headers.authorization??'',prefix='Bearer ';
    const actual=Buffer.from(value.startsWith(prefix)?value.slice(prefix.length):'');
    need(actual.length===tokenBytes.length&&timingSafeEqual(actual,tokenBytes),'DESK_AUTH_REQUIRED',401);
    if(request.method==='POST')need(request.headers.origin===origin,'DESK_ORIGIN_REQUIRED',403);
  }
  async function handler(request,response){
    try{
      need(request.headers.host===new URL(origin).host,'DESK_HOST_INVALID',403);
      const url=new URL(request.url,origin);
      if(request.method==='GET'&&['/','/index.html','/desk.js','/desk.css'].includes(url.pathname)){
        need(!url.search,'DESK_ROUTE_UNKNOWN',404);
        if(request.headers.origin!==undefined)need(request.headers.origin===origin,'DESK_ORIGIN_INVALID',403);
        const filename=url.pathname==='/'?'index.html':url.pathname.slice(1);
        const body=await readResearchHostFile(join(HERE,'handover-desk-public',filename),2*1024*1024);
        headers(response,200,filename.endsWith('.js')?'text/javascript; charset=utf-8':
          filename.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');response.end(body);return;
      }
      authorize(request);
      if(request.method==='GET'){
        if(url.pathname==='/api/status'){reply(response,200,await status());return;}
        if(url.pathname==='/api/round'){reply(response,200,await roundView(url.searchParams.get('key')));return;}
        if(url.pathname==='/api/value'){reply(response,200,await valueFor(url.searchParams.get('key'),
          url.searchParams.get('item'),url.searchParams.get('side')));return;}
        if(url.pathname==='/api/download'){await download(response,url.searchParams.get('id'));return;}
      }
      if(request.method==='POST'){
        if(url.pathname==='/api/source'){
          const key=url.searchParams.get('key');roundFor(key);
          const result=await synchronous('source',key,()=>upload(request,key,url.searchParams.get('filename'),url.searchParams.get('contentType')));
          reply(response,200,{key,source:result});return;
        }
        const input=await bodyJson(request);
        if(url.pathname==='/api/draft'){reply(response,200,await synchronous('draft',input.key,()=>draftSave(input)));return;}
        if(url.pathname==='/api/init'){keys(input,[]);reply(response,202,{job:await startJob('init',null,initialize)});return;}
        if(url.pathname==='/api/prepare'){
          keys(input,['key']);roundFor(input.key);
          reply(response,202,{job:await startJob('prepare',input.key,async()=>{
            const source=await sourceFor(input.key);need(source,'DESK_SOURCE_REQUIRED');
            return prepareCustomerHandoverReturn({client,directory:root,key:input.key,source});
          })});return;
        }
        if(url.pathname==='/api/apply'){
          keys(input,['key','draftSha256']);roundFor(input.key);
          reply(response,202,{job:await startJob('apply',input.key,()=>apply(input))});return;
        }
        if(url.pathname==='/api/complete'){
          keys(input,[]);reply(response,202,{job:await startJob('complete',null,()=>
            completeCustomerHandoverReturns({client,directory:root,python,node}))});return;
        }
      }
      need(false,'DESK_ROUTE_UNKNOWN',404);
    }catch(error){
      if(response.headersSent){response.destroy();return;}
      reply(response,error.status??(error.code==='ENOENT'?404:409),{error:{code:errorCode(error),
        message:'The selected operation could not complete. Keep the current source and request, refresh its status, and resolve the reported condition.'}});
    }
  }
  const lifetime=withPrivateLock(privateRoot,'handover-desk.lock',async()=>{
    try{
      await recoverJob();
      server=createServer((request,response)=>{void handler(request,response);});
      server.requestTimeout=0;server.headersTimeout=30000;
      await new Promise((resolveListen,rejectListen)=>{
        server.once('error',rejectListen);server.listen(port,'127.0.0.1',()=>{server.off('error',rejectListen);resolveListen();});
      });
      origin='http://127.0.0.1:'+server.address().port;
      let closePromise;
      const close=()=>closePromise??=(async()=>{
        closing=true;
        if(active)await active;
        // Keep the host/lock available for an explicit close retry if the
        // original client cannot yet confirm its own shutdown.
        await closeClient();
        const closed=new Promise(resolveClosed=>server.close(resolveClosed));
        server.closeIdleConnections?.();await closed;resolveStop();
      })().catch(error=>{closePromise=null;throw error;});
      resolveReady({url:origin+'/#token='+token,port:server.address().port,close});
      await stopped;
    }catch(error){rejectReady(error);throw error;}
    finally{if(server?.listening)server.close();await closeClient();}
  });
  void lifetime.catch(error=>{rejectReady(error);});
  return ready;
}
