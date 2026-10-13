// MIT. First-use intake of an original published customer handover into reviewed returns.
import {join,resolve,dirname,basename,isAbsolute} from 'node:path';
import {readdir,lstat} from 'node:fs/promises';
import {withPrivateLock} from '../../../sf30-seller-sdk/routescan/quota.mjs';
import {jsonBytes,digest,exists} from '../../node/store.mjs';
import {customerDirectory,readCustomerJson,retainCustomerJson,retainCustomerBytes,
  describeCustomerFile,inspectCustomerHandover} from './files.mjs';
import {createCustomerHandover} from './operator.mjs';
import {readCustomerReturnHead} from '../customer-programme/returns.mjs';
import {HANDOVER_RETURNS_SCHEMA,prepareCustomerHandoverReturns,
  validateCustomerHandoverReturnSelection,readCustomerHandoverReturnEngine,
  readCustomerHandoverReturnHistory} from './handover-returns.mjs';

export const INTAKE_SCHEMA='sf88.research-customer-handover-intake.v1';
const LIMIT=16*1024*1024,WIRE_LIMIT=256*1024*1024;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const canonical=x=>Array.isArray(x)?x.map(canonical):object(x)?
  Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function need(ok,code,status=409){if(!ok)throw Object.assign(new Error(code),{code,status});}
function fields(value,allowed){need(object(value)&&Object.keys(value).every(k=>allowed.includes(k)),'INTAKE_FIELDS_INVALID',400);}
function hash(value){need(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'INTAKE_HASH_INVALID',400);return value;}
function absolute(value){need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&value!=='/','INTAKE_PATH_INVALID',400);return value;}
function dossier(value){need(/^d_[a-f0-9-]{36}$/.test(value??''),'INTAKE_DOSSIER_INVALID',400);return value;}
function integer(value,minimum=0,maximum=Number.MAX_SAFE_INTEGER){need(Number.isSafeInteger(value)&&value>=minimum&&value<=maximum,'INTAKE_INTEGER_INVALID',400);return value;}
function member(value){need(typeof value==='string'&&value&&!value.startsWith('/')&&!value.includes('\\')&&
  !/[\u0000-\u001f\u007f]/.test(value)&&value.split('/').every(x=>x&&x!=='.'&&x!=='..'),'INTAKE_MEMBER_INVALID',400);return value;}
async function optional(file){try{return await readCustomerJson(file,LIMIT);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function save(root,name,value){
  const file=join(root,...member(name).split('/'));await customerDirectory(dirname(file));
  const wire=jsonBytes(value);need(wire.length<=LIMIT,'INTAKE_RETAINED_JSON_TOO_LARGE',413);
  return retainCustomerBytes(dirname(file),basename(file),wire);
}
async function saveWire(root,name,body){
  const file=join(root,...member(name).split('/'));await customerDirectory(dirname(file));
  return retainCustomerBytes(dirname(file),basename(file),body);
}
function partialDraft(value){
  fields(value,['baselineId','operationId','customerLabel','sourceActor','maximumTotalItems','maximumTotalReturns','rounds','output']);
  for(const key of ['baselineId','operationId','customerLabel','sourceActor'])
    if(value[key]!==undefined&&value[key]!==null)need(typeof value[key]==='string'&&value[key].length<=512,'INTAKE_DRAFT_INVALID',400);
  for(const key of ['maximumTotalItems','maximumTotalReturns'])
    if(value[key]!==undefined&&value[key]!==null)integer(value[key],0,100000);
  if(value.rounds!==undefined&&value.rounds!==null){
    need(Array.isArray(value.rounds)&&value.rounds.length<=32,'INTAKE_DRAFT_INVALID',400);
    for(const row of value.rounds){
      fields(row,['key','maximumItems','maximumSourceBytes']);
      if(row.key!==undefined&&row.key!==null)need(typeof row.key==='string'&&row.key.length<=120,'INTAKE_DRAFT_INVALID',400);
      if(row.maximumItems!==undefined&&row.maximumItems!==null)integer(row.maximumItems,0,100000);
      if(row.maximumSourceBytes!==undefined&&row.maximumSourceBytes!==null)integer(row.maximumSourceBytes,0,WIRE_LIMIT);
    }
  }
  if(value.output!==undefined&&value.output!==null){
    fields(value.output,['filenameStem','maximumArchiveBytes']);
    if(value.output.filenameStem!==undefined&&value.output.filenameStem!==null)
      need(typeof value.output.filenameStem==='string'&&value.output.filenameStem.length<=120,'INTAKE_DRAFT_INVALID',400);
    if(value.output.maximumArchiveBytes!==undefined&&value.output.maximumArchiveBytes!==null)integer(value.output.maximumArchiveBytes,0,WIRE_LIMIT);
  }
  need(jsonBytes(value).length<=LIMIT-8192,'INTAKE_DRAFT_TOO_LARGE',413);return value;
}
function baselineRequest(value){
  fields(value,['dossierId','deliveryId','revision','sourceWorkspace']);dossier(value.dossierId);integer(value.revision,1);
  need(typeof value.deliveryId==='string'&&/^cud_[a-f0-9]{64}$/.test(value.deliveryId),'INTAKE_DELIVERY_INVALID',400);
  let sourceWorkspace=null;
  if(value.sourceWorkspace!==undefined&&value.sourceWorkspace!==null){
    fields(value.sourceWorkspace,['library','actor']);
    need(value.sourceWorkspace.library==='original'||/^received-[a-f0-9]{64}$/.test(value.sourceWorkspace.library??''),
      'INTAKE_SOURCE_LIBRARY_INVALID',400);
    need(typeof value.sourceWorkspace.actor==='string'&&value.sourceWorkspace.actor.trim()&&
      value.sourceWorkspace.actor.length<=200,'INTAKE_SOURCE_ACTOR_REQUIRED',400);
    sourceWorkspace={library:value.sourceWorkspace.library,actor:value.sourceWorkspace.actor};
  }
  return {dossierId:value.dossierId,deliveryId:value.deliveryId,revision:value.revision,sourceWorkspace};
}
function engineSummary(engine){
  return {repository:engine.repository,ref:engine.ref,manifestSha256:engine.manifestSha256,
    sourceFiles:engine.files.length,sourceBytes:engine.files.reduce((n,row)=>n+row.bytes,0)};
}
function preparedPublic(value){
  if(!value)return null;
  const {directory,selectionFile,...publicValue}=value;return publicValue;
}

/** Read the exact prepared course after its intake host has closed. No new client or write. */
export async function readCustomerHandoverIntakePreparation(directory){
  const root=await customerDirectory(absolute(directory),{create:false}),
    binding=(await readCustomerJson(join(root,'PREPARE_SELECTION.json'),LIMIT)).value,
    prepared=(await readCustomerJson(join(root,'PREPARED.json'),LIMIT)).value,
    selectionFile=join(root,'SELECTION.original.json'),courseDirectory=join(root,'course');
  hash(binding.previewSha256);hash(binding.draftSha256);hash(binding.selectionSha256);
  need(binding.schema===INTAKE_SCHEMA+'.prepare'&&prepared.state==='INITIALIZED'&&
    prepared.selectionSha256===binding.selectionSha256&&prepared.directory===courseDirectory&&
    prepared.selectionFile===selectionFile,'INTAKE_PREPARATION_CHANGED');
  const selected=await readCustomerJson(selectionFile,LIMIT);
  need(selected.sha256===binding.selectionSha256,'INTAKE_PREPARATION_CHANGED');
  validateCustomerHandoverReturnSelection(selected.value);
  need(prepared.operationId===selected.value.operation_id&&prepared.workspaceId===selected.value.workspace_id&&
    prepared.dossierId===selected.value.dossier_id,'INTAKE_PREPARATION_CHANGED');
  return {directory:courseDirectory,selectionFile,selectionSha256:binding.selectionSha256,prepared};
}

/** Owns no client lifetime. All mutating calls serialize in the same retained intake. */
export async function openCustomerHandoverIntake({client,directory,engineRoot,engineManifest,engineManifestSha256}={}){
  need(client&&typeof client.status==='function'&&typeof client.customerUpdates==='function','INTAKE_CLIENT_REQUIRED',400);
  const root=await customerDirectory(absolute(directory)),engineSelection={root:absolute(engineRoot),
    manifestFile:absolute(engineManifest),manifestSha256:hash(engineManifestSha256)};
  const currentWorkspace=await client.status();
  need(/^research_[a-f0-9]{64}$/.test(currentWorkspace.workspaceId??''),'INTAKE_WORKSPACE_INVALID');
  const workspaceId=currentWorkspace.workspaceId,engine=await readCustomerHandoverReturnEngine({engine:engineSelection}),
    summary=engineSummary(engine);
  const binding={schema:INTAKE_SCHEMA+'.binding',workspaceId,engine:engineSelection,source:summary,
    files:engine.files.map(({path,mode,bytes,sha256})=>({path,mode,bytes,sha256}))};
  await withPrivateLock(root,'handover-intake.lock',()=>save(root,'INTAKE.json',binding));
  const courseDirectory=join(root,'course'),downloads=new Map(),descriptorCache=new Map();
  const locked=fn=>withPrivateLock(root,'handover-intake.lock',fn);
  async function workspace(){need((await client.status()).workspaceId===workspaceId,'INTAKE_WORKSPACE_CHANGED');return {workspaceId};}
  async function frozen(){const row=await optional(join(root,'PREPARE_SELECTION.json'));return row?.value??null;}
  async function drafts(){
    const location=join(root,'drafts');if(!await exists(location))return null;
    await customerDirectory(location,{create:false});
    const names=(await readdir(location)).filter(name=>/^[0-9]{8}\.json$/.test(name)).sort();let previous=null;
    for(let i=0;i<names.length;i++){
      need(Number(names[i].slice(0,8))===i+1,'INTAKE_DRAFT_HISTORY_CHANGED');
      const raw=await readCustomerJson(join(location,names[i]),LIMIT),row=raw.value;
      need(row.schema===INTAKE_SCHEMA+'.draft'&&row.workspaceId===workspaceId&&row.generation===i+1&&
        row.previousSha256===(previous?.sha256??null),'INTAKE_DRAFT_HISTORY_CHANGED');partialDraft(row.value);
      previous={sha256:raw.sha256,value:row.value,generation:row.generation,previousSha256:row.previousSha256,
        file:join(location,names[i])};
    }
    return previous;
  }
  async function previews(){
    const location=join(root,'previews');if(!await exists(location))return null;
    await customerDirectory(location,{create:false});
    const names=(await readdir(location)).filter(name=>/^[0-9]{8}\.json$/.test(name)).sort();let previous=null;
    for(let i=0;i<names.length;i++){
      need(Number(names[i].slice(0,8))===i+1,'INTAKE_PREVIEW_HISTORY_CHANGED');
      const raw=await readCustomerJson(join(location,names[i]),LIMIT),row=raw.value;
      need(row.schema===INTAKE_SCHEMA+'.preview-envelope'&&row.generation===i+1&&
        row.previousSha256===(previous?.sha256??null)&&row.value?.schema===INTAKE_SCHEMA+'.preview',
        'INTAKE_PREVIEW_HISTORY_CHANGED');
      previous={sha256:raw.sha256,value:row.value,generation:row.generation,file:join(location,names[i])};
    }
    return previous;
  }
  async function baseline(id,{verify=true}={}){
    need(/^hib_[a-f0-9]{64}$/.test(id??''),'INTAKE_BASELINE_UNKNOWN',404);
    const location=join(root,'baselines',id),row=(await readCustomerJson(join(location,'BASELINE.json'),LIMIT)).value;
    need(row.schema===INTAKE_SCHEMA+'.baseline'&&row.id===id&&row.workspaceId===workspaceId,'INTAKE_BASELINE_CHANGED');
    const original=verify?await inspectCustomerHandover(join(location,'handover'),{manifestSha256:row.manifestSha256}):null;
    if(original)need(original.selection.dossierId===row.dossierId&&original.selection.delivery.id===row.deliveryId&&
      original.portable.revision===row.revision&&original.portable.headSha256===row.headSha256&&
      original.selection.workspaceId===workspaceId,'INTAKE_BASELINE_CHANGED');
    return {row,original,directory:join(location,'handover')};
  }
  async function publicBaseline(row){
    const files=[];
    for(const file of row.files)files.push(await fileDescriptor(join(root,'baselines',row.id,'handover',file.name),
      file.kind==='report'?file.format+' delivery report':file.name,file.name,file));
    files.push(await fileDescriptor(join(root,'baselines',row.id,'handover','handover.json'),'Original handover manifest',
      'handover.json',{sha256:row.manifestSha256,bytes:row.manifestBytes}));
    return {id:row.id,dossierId:row.dossierId,deliveryId:row.deliveryId,revision:row.revision,
      manifestSha256:row.manifestSha256,customerLabel:row.customerLabel,title:row.title,
      sourceWorkspace:row.sourceWorkspace,files};
  }
  async function baselineRows(){
    const location=join(root,'baselines');if(!await exists(location))return [];
    const result=[];
    for(const name of (await readdir(location)).sort()){
      need(/^hib_[a-f0-9]{64}$/.test(name),'INTAKE_BASELINE_DIRECTORY_CHANGED');
      const path=join(location,name);await customerDirectory(path,{create:false});
      if(!await exists(join(path,'BASELINE.json')))continue;
      result.push((await baseline(name,{verify:false})).row);
    }
    return result;
  }
  async function fileDescriptor(file,label,filename,expected={}){
    const stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.mode,s.uid].join(':');
    const before=await lstat(file,{bigint:true});need(before.isFile()&&!before.isSymbolicLink(),'INTAKE_FILE_CHANGED');
    const key=stamp(before),cached=descriptorCache.get(file);let descriptor;
    if(cached?.stamp===key)descriptor=cached.descriptor;
    else{
      descriptor=await describeCustomerFile(file,{maximum:WIRE_LIMIT});
      const after=await lstat(file,{bigint:true});need(stamp(after)===key,'INTAKE_FILE_CHANGED');
      descriptorCache.set(file,{stamp:key,descriptor});
    }
    need((expected.bytes===undefined||expected.bytes===descriptor.bytes)&&
      (expected.sha256===undefined||expected.sha256===descriptor.sha256),'INTAKE_FILE_CHANGED');
    need(file.startsWith(root+'/'),'INTAKE_FILE_SCOPE_CHANGED');
    const id='if_'+digest(jsonBytes(file.slice(root.length+1))),value={id,label,filename,bytes:descriptor.bytes,sha256:descriptor.sha256};
    downloads.set(id,{...value,path:file});return value;
  }
  async function selectedFiles(){
    const rows=[];
    for(const name of ['INTAKE.json','PREPARE_SELECTION.json','SELECTION.original.json','PREPARED.json']){
      const file=join(root,name);if(await exists(file))rows.push(await fileDescriptor(file,name,name));
    }
    const draft=await drafts(),preview=await previews();
    if(draft)rows.push(await fileDescriptor(draft.file,'Complete scope draft','INTAKE_DRAFT.json',{sha256:draft.sha256}));
    if(preview)rows.push(await fileDescriptor(preview.file,'Complete reviewed preview','INTAKE_PREVIEW.json',{sha256:preview.sha256}));
    return rows;
  }
  async function status(){
    const currentDraft=await drafts(),currentPreview=await previews(),binding=await frozen(),
      prepared=await optional(join(root,'PREPARED.json'));
    const baselines=await Promise.all((await baselineRows()).map(publicBaseline));
    return {schema:INTAKE_SCHEMA,workspace:{workspaceId},engine:summary,baselines,
      draft:currentDraft?{sha256:currentDraft.sha256,value:currentDraft.value,locked:!!binding}:null,
      preview:currentPreview?{sha256:currentPreview.sha256,value:currentPreview.value}:null,
      prepared:preparedPublic(prepared?.value??null),
      frozen:binding?{previewSha256:binding.previewSha256,draftSha256:binding.draftSha256,selectionSha256:binding.selectionSha256}:null,
      files:[...baselines.flatMap(row=>row.files),...await selectedFiles()]};
  }
  async function listDossiers({offset=0,snapshot}={}){
    integer(offset);if(snapshot!==undefined)hash(snapshot);need(offset===0||snapshot,'INTAKE_SNAPSHOT_REQUIRED',400);
    await workspace();const page=await client.list({offset,limit:100,...(snapshot?{snapshot}:{})});
    need(page.workspaceId===workspaceId&&page.offset===offset&&Array.isArray(page.items),'INTAKE_INVENTORY_CHANGED');
    return page;
  }
  async function listDeliveries({dossierId,revision,offset=0}={}){
    dossier(dossierId);integer(offset);if(revision!==undefined)integer(revision,1);
    need(offset===0||revision!==undefined,'INTAKE_REVISION_REQUIRED',400);await workspace();
    const head=await readCustomerReturnHead(client,dossierId,revision);
    const page=await client.customerUpdates().list(dossierId,{section:'deliveries',revision:head.revision,offset,limit:100});
    need(page.dossierId===dossierId&&page.revision===head.revision&&page.offset===offset&&Array.isArray(page.items),
      'INTAKE_DELIVERIES_CHANGED');
    return {dossier:{id:dossierId,title:head.metadata.title,revision:head.revision,sha256:head.sha256},page};
  }
  async function createBaseline(input){
    const request=baselineRequest(input),id='hib_'+digest(jsonBytes({workspaceId,request}));
    return locked(async()=>{
      await workspace();need(!await frozen(),'INTAKE_SELECTION_LOCKED');
      const location=await customerDirectory(join(root,'baselines',id));
      await save(location,'REQUEST.json',{schema:INTAKE_SCHEMA+'.baseline-request',workspaceId,request});
      const sourceWorkspace=request.sourceWorkspace?{...request.sourceWorkspace,requestId:'intake-source-'+id.slice(4)}:undefined;
      await createCustomerHandover({client,directory:join(location,'handover'),dossierId:request.dossierId,
        deliveryId:request.deliveryId,revision:request.revision,sourceWorkspace});
      const original=await inspectCustomerHandover(join(location,'handover'));
      need(original.selection.workspaceId===workspaceId&&original.selection.dossierId===request.dossierId&&
        original.selection.delivery.id===request.deliveryId,'INTAKE_BASELINE_CHANGED');
      const row={schema:INTAKE_SCHEMA+'.baseline',id,workspaceId,dossierId:request.dossierId,deliveryId:request.deliveryId,
        revision:original.portable.revision,headSha256:original.portable.headSha256,manifestSha256:original.manifestSha256,
        manifestBytes:original.manifestBytes,title:original.selection.delivery.title,customerLabel:'',
        sourceWorkspace:original.selection.sourceWorkspace,
        files:original.manifest.files};
      await save(location,'BASELINE.json',row);return publicBaseline(row);
    });
  }
  async function saveDraft({expectedSha256,value}={}){
    if(expectedSha256!==null)hash(expectedSha256);partialDraft(value);
    return locked(async()=>{
      need(!await frozen(),'INTAKE_SELECTION_LOCKED');const current=await drafts();
      if(current&&same(current.value,value)&&
        (expectedSha256===current.sha256||expectedSha256===current.previousSha256))
        return {sha256:current.sha256,value:current.value,locked:false};
      need((current?.sha256??null)===expectedSha256,'INTAKE_DRAFT_CONFLICT');
      const generation=(current?.generation??0)+1;need(generation<=99999999,'INTAKE_DRAFT_LIMIT');
      const result=await save(root,'drafts/'+String(generation).padStart(8,'0')+'.json',{
        schema:INTAKE_SCHEMA+'.draft',workspaceId,generation,previousSha256:current?.sha256??null,value});
      return {sha256:result.sha256,value,locked:false};
    });
  }
  async function previewValue(draft){
    await workspace();const value=draft.value,{row,original,directory:sourceDirectory}=await baseline(value.baselineId);
    const at=await readCustomerReturnHead(client,row.dossierId);
    need(at.history[original.portable.revision-1]?.sha256===original.portable.headSha256,'INTAKE_BASELINE_HISTORY_CHANGED');
    const selected=validateCustomerHandoverReturnSelection({
      schema:HANDOVER_RETURNS_SCHEMA,operation_id:value.operationId,customer_label:value.customerLabel,
      baseline:{directory:sourceDirectory,manifest_sha256:row.manifestSha256},workspace_id:workspaceId,dossier_id:row.dossierId,
      expected_revision:at.revision,expected_revision_sha256:at.sha256,
      ...(value.sourceActor?{source_actor:value.sourceActor}:{}),
      maximum_total_items:value.maximumTotalItems,maximum_total_returns:value.maximumTotalReturns,
      rounds:(value.rounds??[]).map(round=>({key:round.key,maximum_items:round.maximumItems,maximum_source_bytes:round.maximumSourceBytes})),
      engine:engineSelection,output:{filename_stem:value.output?.filenameStem,maximum_archive_bytes:value.output?.maximumArchiveBytes}});
    need(!original.selection.sourceWorkspace||selected.source_actor,'INTAKE_RECEIVING_SOURCE_ACTOR_REQUIRED',400);
    const actualEngine=engineSummary(await readCustomerHandoverReturnEngine(selected));
    need(same(actualEngine,summary),'INTAKE_ENGINE_CHANGED');
    const inherited=await readCustomerHandoverReturnHistory(client,selected,at),
      reviewedItemCount=inherited.reduce((n,receipt)=>n+receipt.decisions.length,0);
    need(inherited.length+selected.rounds.length<=selected.maximum_total_returns,'HANDOVER_RETURN_CUMULATIVE_ROUND_LIMIT');
    need(reviewedItemCount<=selected.maximum_total_items,'HANDOVER_RETURN_CUMULATIVE_ITEM_LIMIT');
    return {schema:INTAKE_SCHEMA+'.preview',draftSha256:draft.sha256,selection:selected,
      baseline:await publicBaseline(row),current:{revision:at.revision,sha256:at.sha256},history:at.history,
      inheritedReceipts:inherited,inheritedReturns:inherited.length,reviewedItemCount,engine:actualEngine};
  }
  async function preview({draftSha256}={}){
    hash(draftSha256);return locked(async()=>{
      need(!await frozen(),'INTAKE_SELECTION_LOCKED');const draft=await drafts();
      need(draft&&draft.sha256===draftSha256,'INTAKE_DRAFT_CHANGED');
      const value=await previewValue(draft),previous=await previews();
      if(previous&&same(previous.value,value))return {sha256:previous.sha256,value};
      const generation=(previous?.generation??0)+1;need(generation<=99999999,'INTAKE_PREVIEW_LIMIT');
      const result=await save(root,'previews/'+String(generation).padStart(8,'0')+'.json',{
        schema:INTAKE_SCHEMA+'.preview-envelope',generation,previousSha256:previous?.sha256??null,value});
      return {sha256:result.sha256,value};
    });
  }
  async function prepare({previewSha256}={}){
    hash(previewSha256);return locked(async()=>{
      const prior=await frozen(),draft=await drafts(),chosen=await previews();
      need(draft&&chosen&&chosen.sha256===previewSha256&&chosen.value.draftSha256===draft.sha256,'INTAKE_PREVIEW_CHANGED');
      const wire=jsonBytes(chosen.value.selection),selectionSha256=digest(wire);
      if(prior){
        need(prior.previewSha256===previewSha256&&prior.draftSha256===draft.sha256&&
          prior.selectionSha256===selectionSha256,'INTAKE_FROZEN_SELECTION_CHANGED');
      }else{
        const now=await previewValue(draft);
        need(same(now,chosen.value),'INTAKE_PREVIEW_STALE');
        await save(root,'PREPARE_SELECTION.json',{schema:INTAKE_SCHEMA+'.prepare',previewSha256,
          draftSha256:draft.sha256,selectionSha256});
      }
      const selectionFile=join(root,'SELECTION.original.json');
      await saveWire(root,'SELECTION.original.json',wire);
      const result=await prepareCustomerHandoverReturns({client,directory:courseDirectory,selectionFile,selectionSha256});
      const prepared={...result,selectionSha256,selectionFile};
      await save(root,'PREPARED.json',prepared);return prepared;
    });
  }
  async function launchSelection(){return readCustomerHandoverIntakePreparation(root);}
  async function download(id){
    need(/^if_[a-f0-9]{64}$/.test(id??''),'INTAKE_DOWNLOAD_UNKNOWN',404);
    if(!downloads.has(id))await status();
    const row=downloads.get(id);need(row,'INTAKE_DOWNLOAD_UNKNOWN',404);
    return {...row};
  }
  return {directory:root,workspaceId,engine:summary,status,listDossiers,listDeliveries,createBaseline,saveDraft,preview,prepare,
    launchSelection,download};
}
