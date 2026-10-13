// SPDX-License-Identifier: MIT
// Original supplier catalogue host integration inside the existing Material Source Desk.
import {createSupplierIntake,checkpointSupplierIntake,pendingSupplierRequests,intakeDigest,intakeCanonical,supplierPreviewBasis,supplierFileBytes,nativeSupplierRequestIdentity} from './operations_material_supplier_intake_model.mjs';
import {Sha256} from './operations_installation_source_hash.mjs';
const clone=v=>structuredClone(v),object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),same=(a,b)=>intakeCanonical(a)===intakeCanonical(b);
const need=(ok,message)=>{if(!ok)throw Error(message);},now=()=>new Date().toISOString(),pretty=v=>JSON.stringify(v,null,2)+'\n';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(label,action,attrs='')=>'<button type="button" data-ms-action="'+action+'" '+attrs+'>'+esc(label)+'</button>';
const field=(label,key,value,area=false)=>'<label>'+esc(label)+(area?'<textarea rows="6" data-ms-field="'+key+'">'+esc(value)+'</textarea>':'<input data-ms-field="'+key+'" value="'+esc(value)+'">')+'</label>';
const select=(label,key,value,rows)=>'<label>'+esc(label)+'<select data-ms-field="'+key+'">'+rows.map(([id,label])=>'<option value="'+esc(id)+'"'+(String(value)===String(id)?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label>';
const details=(label,value)=>'<details><summary>'+esc(label)+'</summary><pre>'+esc(pretty(value))+'</pre></details>';
const encode=b=>{let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s);};
const hash=b=>new Sha256().update(b).hex(),requestId=()=>crypto.randomUUID();
const mutationKinds={upload:'catalog-upload',save:'catalog-save',preview:'catalog-preview',select:'catalog-select'};
const MAX_SOURCE=16*1024*1024,MAX_BUNDLE=128*1024*1024;
export function createMaterialSupplierIntakeDesk(host){
 let connections=[],view='files',page=null,newName='',connectionId='',selectedPreview='',search='';
 const state=()=>host.state(),current=()=>(state().supplierIntakes??[]).find(v=>v.id===state().selectedSupplierIntake)||null;
 const currentCatalog=w=>w?.workspace?.catalogs?.find(c=>c.id===w.draft.catalogId);
 const currentSource=w=>w?.workspace?.sources?.find(s=>s.id===w.draft.sourceId);
 const frozenPreview=w=>w?.previews.find(p=>p.requestId===selectedPreview)||w?.previews.at(-1)||null;
 const globalPending=()=>pendingSupplierRequests(state());
 async function replace(w){const next=clone(state()),i=(next.supplierIntakes??[]).findIndex(v=>v.id===w.id);need(i>=0,'Reopen the original supplier intake.');next.supplierIntakes[i]=w;await host.commit(next);}
 function writable(){need(!host.readOnlyReason(),'Reopen an editable original Operations case.');need(!host.otherPending()&&!globalPending().length,'Recover the exact pending original operation before another mutation.');}
 function base(w,version=host.context().version){
  need(w?.connection,'Select a configured original catalogue workspace and read its state.');
  return {expectedVersion:version,connectionId:w.connection.id,expectedWorkspaceId:w.connection.workspaceId,expectedConnectionSha256:w.connection.configurationSha256};
 }
 function wrapper(value,body,w,action){
  need(value?.schema==='stellar-forge.material-catalogue-intake-result.v1'&&object(value.result),'Retain the complete original catalogue response.');
  if(value.result.dispatchStarted===false){
   const projected=clone(body);delete projected.actor;delete projected.contentBase64;
   need(value.result.caseId===host.scope.caseId&&value.result.action===action&&value.result.requestId===(body.nativeRequest?.requestId??body.requestId??null),'The pre-dispatch outcome belongs to another case, action or original request.');
   need(value.httpStatus===null&&Number.isInteger(value.localStatus)&&value.result.dispatchScope==='this-proxy-attempt'&&same(value.result.requestBody,projected)&&value.result.contentBase64Sha256===(body.contentBase64===undefined?null:hash(new TextEncoder().encode(body.contentBase64))),'The pre-dispatch result is not bound to this exact proxy attempt.');
   // Scope/connection here describe current observations, which may be exactly why preflight stopped.
   // The exact request projection and case/action/ID above bind the attempted original selection.
   return value;
  }
  need(value.scope?.caseId===host.scope.caseId&&value.scope.planId===host.scope.planId&&value.scope.expectedVersion===body.expectedVersion,'The catalogue response belongs to a different original case or requested version.');
  if(w)need(value.connection?.id===body.connectionId&&value.connection.workspaceId===body.expectedWorkspaceId&&value.connection.configurationSha256===body.expectedConnectionSha256,'The selected configured catalogue workspace changed.');
  need(Number.isInteger(value.httpStatus)&&object(value.result),'Retain the complete native response and HTTP status.');return value;
 }
 async function call(action,body,w){return wrapper(await host.api('/api/operations/'+host.scope.caseId+'/material-catalog-intake/'+action,body),body,w,action);}
 function readResult(response){
  if(response.httpStatus===null||response.httpStatus>=400)throw Error(response.result.message||response.result.error||'The original catalogue reader rejected this request.');
  return response.result;
 }
 async function refresh(){
  const w=current();need(w,'Open a named original supplier intake.');
  const response=await call('state',base(w),w),value=readResult(response);
  need(value.schema==='stellar-forge.material-catalog-workspace.v1'&&Array.isArray(value.catalogs)&&Array.isArray(value.sources)&&Array.isArray(value.editions),'Read the full original catalogue state.');
  const next=clone(w);next.workspace=clone(value);next.observations.push({at:now(),scope:clone(response.scope),value:clone(value)});next.updatedAt=now();await replace(next);return next;
 }
 function previewCurrent(w,p){
  const c=currentCatalog(w),s=currentSource(w);if(!c||!s||!p)return false;
  return p.basisSha256===intakeDigest(supplierPreviewBasis(w,c,s));
 }
 function render(){
  const w=current(),catalog=currentCatalog(w),source=currentSource(w),p=frozenPreview(w);
  let panel='<h3>Start from original supplier files</h3><p>Select a configured catalogue workspace and a named intake. Keep the original full and update files, review the mapping and explicit base, then select a retained edition before capturing its complete bundle.</p>';
  if(w){
   const pending=w.requests.filter(r=>['PREPARED','RUNNING'].includes(r.state));
   const nav='<nav aria-label="Supplier intake views">'+[['files','Supplier files'],['mapping','Catalogue mapping'],['review','Edition review'],['history','Native history']].map(([id,label])=>button(label,'view','data-view="'+id+'"'+(view===id?' aria-current="page"':''))).join('')+'</nav>';
   panel='<div class="mc-fields">'+field('Supplier intake name','name',w.name)+field('Supplier intake notes','notes',w.draft.notes,true)+'</div><p><strong>'+esc(w.connection?.title||'No configured workspace selected')+'</strong> · '+esc(w.connection?.workspaceId||'')+'</p>'+
    '<div class="mc-actions">'+button('Read current catalogue state','refresh')+button('Save supplier checkpoint','checkpoint')+'</div>'+nav;
   if(view==='files')panel+='<h3>Retain complete original supplier files</h3><p>Original bytes are preserved in the complete browser archive before upload. Full import validation occurs during native preview; a CSV/JSON upload sample does not prove the entire edition is valid.</p>'+
    '<label>Original supplier file (16 MiB maximum)<input type="file" data-ms-file accept=".xml,.csv,.tsv,.json,.jsonl"></label>'+
    select('Retained original file','sourceFileId',w.draft.sourceFileId,[['','Choose original file'],...w.files.map(f=>[f.id,f.name+' · '+f.bytes+' bytes · '+f.sha256.slice(0,12)])])+
    '<div class="mc-fields">'+field('Original input format JSON','formatText',w.draft.formatText,true)+field('Original provenance JSON','provenanceText',w.draft.provenanceText,true)+'</div>'+
    '<p>Supported native formats: csv, tsv, jsonl, json (row array or explicit JSON Pointer), xchange-json and bmecat-xml. Retain source URL/publisher/revision facts as supplied. The application does not infer a transaction from a filename.</p>'+
    button('Upload exact original supplier source','upload')+button('Download retained original file','file-download')+
    select('Native retained source','sourceId',w.draft.sourceId,[['','Select original native source'],...(w.workspace?.sources??[]).map(s=>[s.id,s.name+' · '+s.format.kind+' · '+s.sha256.slice(0,12)])])+
    (source?details('Full native source metadata and original sample',source):'')+
    (source?.format?.kind==='bmecat-xml'?button('Read original BMEcat profile','profile'):'')+
    w.profiles.filter(x=>x.sourceId===w.draft.sourceId).map((x,i)=>details('Retained original profile '+x.at,x.value)+button('Use this original catalogue mapping','use-profile','data-index="'+w.profiles.indexOf(x)+'"')).join('')+
    '<p>BMEcat profile use is an explicit mapping choice. Supplier recipient acceptance and subset agreements are not set by this action. Price-only and product-data transactions remain retained originals; native preview refuses to treat them as complete material replacements.</p>';
   if(view==='mapping')panel+='<h3>Original catalogue and field mapping</h3>'+select('Existing catalogue or explicit new catalogue','catalogId',w.draft.catalogId,[['','Create a separate new catalogue'],...(w.workspace?.catalogs??[]).map(c=>[c.id,c.title+' · revision '+c.revision])])+
    button('Receive selected catalogue mapping','load-catalogue')+'<div class="mc-fields">'+field('Catalogue title','title',w.draft.title)+field('Original tenant ID','tenantId',w.draft.tenantId)+'</div>'+
    field('Complete field, reference, unit and operation mapping JSON','mappingText',w.draft.mappingText,true)+
    '<p>Keep the original material identifier. BMEcat SUPPLIER_PID and new/update/delete semantics remain native requirements. Constants require a recorded reason; units, references and lookup sources remain explicit. A different tenant needs a separate catalogue.</p>'+
    (catalog?details('Current native catalogue and mapping revision',catalog):'<p>A new catalogue will receive its identity from the native engine.</p>')+
    button('Save original catalogue mapping','save');
   if(view==='review')panel+='<h3>Preview and explicitly select an edition</h3>'+
    '<div class="mc-fields">'+select('Edition meaning','mode',w.draft.mode,[['full','Complete replacement'],['delta','Explicit complete upserts and deletes']])+
    select('Exact comparison/base edition','baseEditionId',w.draft.baseEditionId,[['','No base (full only)'],...(w.workspace?.editions??[]).filter(e=>e.catalogId===w.draft.catalogId).map(e=>[e.id,e.id+' · '+e.mode+(catalog?.activeEditionId===e.id?' · currently selected':'')])])+'</div>'+
    '<p>Full replaces the material set; delta applies explicit operations to the chosen original base. No base is silently inferred. Preview retains a review edition; it does not activate it.</p>'+
    button('Preview complete original source','preview')+
    select('Retained native preview','preview',p?.requestId||'',[['','No preview selected'],...w.previews.map(x=>[x.requestId,x.edition.id+' · '+x.edition.mode])])+
    (p?'<p class="mc-notice">'+(previewCurrent(w,p)?'This preview matches the retained current source, mapping, revision, mode and base.':'Historical preview: source, draft selection, mapping or catalogue revision differs. Retain it; prepare a new preview before selection.')+'</p>'+
     details('Complete source-bound native edition and change counts',p.edition)+
     '<div class="mc-actions">'+button('Read original changed records','changes')+button('Read original edition materials','materials')+button('Download exact native preview','preview-download')+
     button('Select this exact reviewed edition','select')+'</div>':'')+
    field('Material search within this edition','search',search)+
    (page?details('Original page identity and totals',{kind:page.kind,editionId:page.editionId,offset:page.offset,total:page.value.total,nextOffset:page.value.nextOffset})+page.value.rows.map((r,i)=>details('Original record '+(page.offset+i),r)).join('')+(page.value.nextOffset!==null?button('Next original record page','next'):''):'')+
    '<h3>Capture the complete selected catalogue</h3>'+
    (catalog?details('Actual current catalogue selection',{id:catalog.id,revision:catalog.revision,tenantId:catalog.tenantId,mappingSha256:catalog.mappingSha256,activeEditionId:catalog.activeEditionId}):'')+
    '<p>Capture is a new read-only export with its original timestamp. Freeze complete verified bytes before attaching them. A retry of an uncertain attachment uses those frozen bytes and its original case request.</p>'+
    button('Capture complete selected bundle','bundle')+
    w.bundles.map(b=>'<section class="mc-intake"><h4>'+esc(b.file.name)+'</h4><p>'+b.file.bytes+' bytes · <code>'+esc(b.sha256)+'</code></p>'+details('Frozen capture selection',b.selection)+
      button('Download frozen complete bundle','bundle-download','data-id="'+b.id+'"')+
      button('Attach and open separate source review','bundle-attach','data-id="'+b.id+'"')+'</section>').join('');
   if(view==='history')panel+='<h3>Original native requests and outcomes</h3><p>Unknown transport outcomes keep the exact request pending. Recorded FAILED or INTERRUPTED operations remain historical; a new attempt is explicit and receives a new request ID. No operation is silently replaced.</p>'+
    w.requests.map(r=>'<section class="mc-intake"><strong>'+esc(r.action)+' · '+esc(r.state)+'</strong><p><code>'+esc(r.id)+'</code></p>'+details('Complete original request and native response',r)+
      (['PREPARED','RUNNING'].includes(r.state)?button('Reconcile original native operation','reconcile','data-id="'+r.id+'"')+button('Replay exact original request','replay','data-id="'+r.id+'"'):'')+'</section>').join('')+
    details('Complete workspace observations',w.observations)+
    w.history.map((h,i)=>'<section>'+esc(h.label)+' · '+esc(h.at)+button('Open complete supplier alternative','history-open','data-index="'+i+'"')+'</section>').join('');
   if(pending.length)panel='<section class="mc-notice"><h3>Original supplier operation needs reconciliation</h3>'+pending.map(r=>'<p>'+esc(r.action)+' · '+esc(r.id)+'</p>'+button('Reconcile original native operation','reconcile','data-id="'+r.id+'"')+button('Replay exact original request','replay','data-id="'+r.id+'"')).join('')+'</section>'+panel;
  }
  return '<section aria-label="Original supplier intake"><header><h2>Original supplier intake</h2></header>'+
   '<div class="mc-layout"><aside>'+button('Read configured catalogue workspaces','connections')+
   select('Configured catalogue workspace','connection',connectionId,[['','Select an original workspace'],...connections.map(c=>[c.id,c.title+' · '+c.workspaceId])])+
   field('New supplier intake name','newName',newName)+button('Open named supplier intake','new')+
   '<h3>Retained supplier intakes</h3>'+(state().supplierIntakes??[]).map(v=>button(v.name,'open','data-id="'+v.id+'"'+(v.id===state().selectedSupplierIntake?' aria-current="true"':''))).join('')+
   '<h3>Complete desk archive</h3><div class="mc-actions"><button type="button" data-mc-action="archive">Download all source and review history</button><button type="button" data-mc-action="import">Import complete archive</button><button type="button" data-mc-action="import-fork">Import as explicit alternatives</button><input type="file" data-mc-import hidden accept=".json,application/json"></div><p>The complete desk archive includes these exact originals, unfinished fields, native requests, previews and frozen bundles. Existing catalogue working copies and Installation drafts remain separate.</p></aside><main>'+panel+'</main></div></section>';
 }
 function edit(el){
  const key=el.dataset.msField;if(!key)return false;
  if(key==='newName'){newName=el.value;return true;}if(key==='connection'){connectionId=el.value;return true;}
  if(key==='search'){search=el.value;page=null;return true;}if(key==='preview'){selectedPreview=el.value;page=null;host.render();return true;}
  const w=current();if(!w)return true;
  if(key==='name')w.name=el.value;else if(Object.hasOwn(w.draft,key))w.draft[key]=el.value;else return false;
  w.updatedAt=now();host.changed();if(['catalogId','sourceId','sourceFileId','mode','baseEditionId'].includes(key)){page=null;host.render();}return true;
 }

 async function readConnections(){
  const body={expectedVersion:host.context().version},response=await call('connections',body,null),value=readResult(response);
  need(Array.isArray(value.connections)&&value.connections.every(c=>object(c)&&typeof c.id==='string'&&typeof c.title==='string'&&typeof c.workspaceId==='string'&&/^[a-f0-9]{64}$/.test(c.configurationSha256)),'Read the original configured catalogue workspace selections.');
  connections=clone(value.connections);host.notice('Select an explicitly configured original catalogue workspace.');
 }
 async function newIntake(){
  writable();const connection=connections.find(c=>c.id===connectionId);need(connection,'Read and select an original configured catalogue workspace.');
  const next=clone(state()),w=createSupplierIntake({id:requestId(),name:newName,scope:host.scope,at:now()});w.connection=clone(connection);
  next.supplierIntakes??=[];next.supplierIntakes.push(w);next.selectedSupplierIntake=w.id;await host.commit(next);await refresh();view='files';host.notice('The original native workspace is open in a separate retained supplier intake.');
 }
 async function retainFile(file){
  writable();const w=current();need(w&&file&&file.size>0&&file.size<=MAX_SOURCE,'Select a complete original supplier file within16 MiB.');
  const bytes=new Uint8Array(await file.arrayBuffer());need(bytes.length===file.size,'The selected complete file changed length.');
  const f={id:requestId(),name:file.name,bytes:bytes.length,sha256:hash(bytes),contentBase64:encode(bytes)};
  supplierFileBytes(f,MAX_SOURCE);const next=clone(w);next.files.push(f);next.draft.sourceFileId=f.id;next.updatedAt=now();await replace(next);
  host.notice('Exact original bytes retained in this complete browser archive. Choose their native format and provenance before upload.');
 }
 function parseObject(text,label){let value;try{value=JSON.parse(text);}catch{throw Error('Complete the '+label+' JSON before this native operation.');}need(object(value),'The '+label+' must be an object.');return value;}
 async function recordResponse(intakeId,requestId,response,attemptId,submittedBody){
  const w=(state().supplierIntakes??[]).find(x=>x.id===intakeId),next=clone(w),r=next.requests.find(x=>x.id===requestId);
  need(r,'The original saved request disappeared.');wrapper(response,submittedBody,next,r.attempts.find(x=>x.id===attemptId)?.kind==='operation-read'?'operation':r.action);
  const attempt=r.attempts.find(x=>x.id===attemptId);need(attempt&&attempt.bodySha256===intakeDigest(submittedBody),'The original proxy attempt disappeared or changed.');
  attempt.state=response.result.dispatchStarted===false?'UNSENT':response.httpStatus>=400&&response.result.requestRecorded===false?'UNRECORDED':'RESPONDED';attempt.response=clone(response);attempt.completedAt=now();
  r.exchanges??=[];r.exchanges.push({at:now(),attemptId,kind:attempt.kind,response:clone(response)});
  const op=response.result,states=['RUNNING','COMPLETE','FAILED','INTERRUPTED'];
  if(states.includes(op.state)){
   need(op.id===r.id&&op.kind===mutationKinds[r.action]&&same(op.request,nativeSupplierRequestIdentity(r.action,r.body.nativeRequest)),'The native operation result has a different original ID, kind or complete normalized request.');
   r.response=clone(response);r.state=op.state;r.observedAt=now();
   if(op.state==='COMPLETE'){
    need(object(op.result),'Retain the complete native operation result.');
    if(r.action==='upload'){
     const source=op.result.source,meta=r.body.nativeRequest;need(source?.bytes===meta.bytes&&source.sha256===meta.sha256&&source.name===meta.name,'The native upload result differs from its original file.');
     next.draft.sourceId=source.id;
    }
    if(r.action==='save'||r.action==='select'){need(op.result.catalog?.id,'Retain the exact native catalogue receipt.');next.draft.catalogId=op.result.catalog.id;if(r.action==='save')next.draft.mappingText=pretty(op.result.catalog.mapping);}
    if(r.action==='preview'){
     const edition=op.result.edition,q=r.body.nativeRequest;
     need(edition?.catalogId===q.catalogId&&edition.catalogRevision===q.expectedRevision&&edition.source?.id===q.sourceId&&edition.mode===q.mode&&edition.baseEditionId===q.baseEditionId,'The native preview has a different source, revision, meaning or base.');
     const existing=next.previews.find(p=>p.requestId===r.id),item={requestId:r.id,edition:clone(edition),basis:clone(r.previewBasis),basisSha256:intakeDigest(r.previewBasis)};
     if(existing)need(same(existing,item),'The original preview replay changed its retained edition.');else next.previews.push(item);
     selectedPreview=r.id;view='review';
    }
   }
  }else{
   r.lastExchange=clone(response);r.observedAt=now();
   const mutations=r.attempts.filter(x=>x.kind==='mutation');
   if(!r.uncertainLegacy&&mutations.length&&mutations.every(x=>['UNSENT','UNRECORDED'].includes(x.state))){r.state='REJECTED';r.response=clone(response);}
  }
  next.updatedAt=now();await replace(next);
  const pending=['PREPARED','RUNNING'].includes(r.state);
  host.notice(pending?'Original operation remains unresolved. Reconcile its saved ID or replay its exact body; do not replace it.':r.state==='COMPLETE'?'Original native operation completed and its exact result is retained.':'Original '+r.state.toLowerCase()+' outcome retained. Review its source/error before an explicit new attempt.');
  if(!pending){await host.refreshCase();if(state().selectedSupplierIntake===intakeId)await refresh();}
 }
 async function dispatch(intakeId,id,reconcile=false){
  const w=(state().supplierIntakes??[]).find(x=>x.id===intakeId),r=w?.requests.find(x=>x.id===id);
  need(r&&['PREPARED','RUNNING'].includes(r.state),'Select an original unresolved request.');
  const body=reconcile?{...base(w,r.body.expectedVersion),requestId:r.id}:clone(r.body);
  const next=clone(w),saved=next.requests.find(x=>x.id===id),attemptId=requestId();
  if(!Array.isArray(saved.attempts)){saved.uncertainLegacy=true;saved.attempts=[];}
  need(saved.attempts.length<200,'Retain the existing bounded attempt history before another dispatch.');
  saved.attempts.push({id:attemptId,kind:reconcile?'operation-read':'mutation',bodySha256:intakeDigest(body),state:'DISPATCHING',at:now()});await replace(next);
  try{
   const response=await call(reconcile?'operation':r.action,body,w);
   // Each source-bound preflight outcome describes only this exact attempt.
   await recordResponse(intakeId,id,response,attemptId,body);
  }catch(error){
   const actual=(state().supplierIntakes??[]).find(x=>x.id===intakeId),copy=clone(actual),request=copy.requests.find(x=>x.id===id),attempt=request.attempts.find(x=>x.id===attemptId);
   if(attempt.state==='DISPATCHING'){attempt.state='UNKNOWN';attempt.error=String(error.message||error);await replace(copy);}
   throw error;
  }
 }
 async function queue(action,nativeRequest,{sourceFileId=null,previewBasis=null,contentBase64}={}){
  writable();const w=current();need(w,'Open the original supplier intake.');
  await host.refreshCase();const body={...base(w),nativeRequest:clone(nativeRequest)};
  if(contentBase64!==undefined)body.contentBase64=contentBase64;
  need(new TextEncoder().encode(pretty(nativeRequest)).length<= (action==='upload'?12*1024:1024*1024),'The complete native request exceeds the proxy bound.');
  const row={id:nativeRequest.requestId,action,body,bodySha256:intakeDigest(body),sourceFileId,previewBasis:clone(previewBasis),state:'PREPARED',exchanges:[],attempts:[],createdAt:now()};
  const next=clone(w);next.requests.push(row);next.updatedAt=now();await replace(next);
  await dispatch(w.id,row.id);
 }
 async function uploadOriginal(){
  const w=current(),f=w?.files.find(x=>x.id===w.draft.sourceFileId);need(f,'Select the retained exact original supplier file.');supplierFileBytes(f,MAX_SOURCE);
  const format=parseObject(w.draft.formatText,'original input format'),provenance=parseObject(w.draft.provenanceText,'original provenance');
  return queue('upload',{requestId:requestId(),name:f.name,format,bytes:f.bytes,sha256:f.sha256,provenance},{sourceFileId:f.id,contentBase64:f.contentBase64});
 }
 async function readProfile(){
  const w=current(),source=currentSource(w);need(source?.format?.kind==='bmecat-xml','Select an original retained BMEcat source.');
  const response=await call('profile',{...base(w),sourceId:source.id},w),value=readResult(response);
  need(object(value.catalogMapping),'Read the complete native BMEcat profile.');
  const next=clone(w);next.profiles.push({at:now(),sourceId:source.id,value:clone(value)});await replace(next);
 }
 async function loadCatalog(){
  writable();const w=await refresh(),c=currentCatalog(w);need(c,'Select an existing original catalogue first, or enter a new catalogue explicitly.');
  const next=checkpointSupplierIntake(w,'Before receiving original catalogue mapping',now());
  next.draft.title=c.title;next.draft.tenantId=c.tenantId;next.draft.mappingText=pretty(c.mapping);await replace(next);
  host.notice('Original catalogue title, tenant and complete mapping received. Edit explicitly, then use the original Save mapping operation.');
 }
 async function saveCatalog(){
  const w=await refresh(),mapping=parseObject(w.draft.mappingText,'complete mapping'),catalog=currentCatalog(w);
  need(w.draft.title.trim()&&w.draft.tenantId.trim(),'Enter the original catalogue title and tenant ID.');
  if(w.draft.catalogId)need(catalog,'Reopen the selected existing catalogue.');
  const request={requestId:requestId(),title:w.draft.title,tenantId:w.draft.tenantId,mapping};
  if(catalog){request.catalogId=catalog.id;request.expectedRevision=catalog.revision;}
  await queue('save',request);
 }
 async function preview(){
  const w=await refresh(),catalog=currentCatalog(w),source=currentSource(w);
  need(catalog&&source,'Select the original saved catalogue and uploaded source.');parseObject(w.draft.mappingText,'complete mapping');
  need(same(JSON.parse(w.draft.mappingText),catalog.mapping),'Save or receive the exact original mapping before preview; typed mapping differs from the native catalogue.');
  const baseId=w.draft.baseEditionId||null;
  if(baseId)need(w.workspace.editions.some(e=>e.id===baseId&&e.catalogId===catalog.id),'Select a retained base from this exact catalogue.');
  need(['full','delta'].includes(w.draft.mode)&&!(w.draft.mode==='delta'&&!baseId),'A delta requires an explicit original catalogue base.');
  await queue('preview',{requestId:requestId(),catalogId:catalog.id,expectedRevision:catalog.revision,sourceId:source.id,mode:w.draft.mode,baseEditionId:baseId},{previewBasis:supplierPreviewBasis(w,catalog,source)});
 }
 async function selectEdition(){
  const chosen=frozenPreview(current());need(chosen,'Select the exact retained native preview.');
  const w=await refresh(),catalog=currentCatalog(w),p=w.previews.find(x=>x.requestId===chosen.requestId);
  need(previewCurrent(w,p),'The retained preview is historical. Prepare and inspect a current original edition before selection.');
  await queue('select',{requestId:requestId(),catalogId:catalog.id,expectedRevision:catalog.revision,editionId:p.edition.id,reviewSha256:p.edition.reviewSha256});
 }
 async function readPage(kind,offset=0){
  const w=current(),p=frozenPreview(w);need(p,'Select an original retained edition.');
  const response=await call(kind,{...base(w),editionId:p.edition.id,offset,limit:50,...(kind==='materials'?{search}:{})},w),value=readResult(response);
  need(Array.isArray(value.rows)&&Number.isSafeInteger(value.total)&&value.total>=0&&(value.nextOffset===null||Number.isSafeInteger(value.nextOffset)&&value.nextOffset>offset),'Read a complete original record page.');
  page={kind,editionId:p.edition.id,offset,value:clone(value)};
 }
 async function captureBundle(){
  writable();const w=await refresh(),catalog=currentCatalog(w);need(catalog?.activeEditionId,'Explicitly select an original edition before capturing its complete bundle.');
  const selection={catalogId:catalog.id,expectedCatalogRevision:catalog.revision,expectedActiveEditionId:catalog.activeEditionId,expectedTenantId:catalog.tenantId,expectedMappingSha256:catalog.mappingSha256};
  const body={...base(w),...selection};
  const response=await host.api('/api/operations/'+host.scope.caseId+'/material-catalog-intake/bundle',body,{download:true});
  if((response.headers.get('Content-Type')||'').toLowerCase().includes('application/json')){
   const original=wrapper(await response.json(),body,w,'bundle');const next=clone(w);next.observations.push({at:now(),bundleError:clone(original)});await replace(next);readResult(original);throw Error('The bundle capture returned JSON instead of its complete original NDJSON.');
  }
  const blob=await response.blob();need(blob.size>0&&blob.size<=MAX_BUNDLE,'Keep the complete selected bundle within128 MiB.');
  need((response.headers.get('Content-Type')||'').toLowerCase().split(';')[0].trim()==='application/x-ndjson','Use the original complete native NDJSON bundle response.');
  const expected=response.headers.get('X-Material-Catalog-Sha256'),declared=response.headers.get('X-Material-Catalog-Bytes'),encodedIdentity=response.headers.get('X-Material-Catalog-Identity');
  need(/^[a-f0-9]{64}$/.test(expected||'')&&/^[1-9][0-9]*$/.test(declared||'')&&Number(declared)===blob.size&&typeof encodedIdentity==='string'&&encodedIdentity.length<=65536,'The complete bundle capture has no matching byte/hash identity.');
  const headerBytes=Uint8Array.from(atob(encodedIdentity),c=>c.charCodeAt(0)),capturedIdentity=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(headerBytes));
  need(same(capturedIdentity,{workspaceId:w.connection.workspaceId,catalogId:catalog.id,revision:catalog.revision,activeEditionId:catalog.activeEditionId,tenantId:catalog.tenantId,mappingSha256:catalog.mappingSha256}),'The complete captured bundle differs from the exact reviewed catalogue selection.');
  const bytes=new Uint8Array(await blob.arrayBuffer());need(hash(bytes)===expected,'The complete downloaded bundle differs from its original capture identity.');
  new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  const frozen={id:requestId(),at:now(),selection:clone(selection),connection:clone(w.connection),request:clone(body),identity:clone(capturedIdentity),sha256:expected,
   file:{id:requestId(),name:'Material_Catalogue_'+catalog.id+'_'+catalog.revision+'.jsonl',bytes:bytes.length,sha256:expected,contentBase64:encode(bytes)}};
  supplierFileBytes(frozen.file,MAX_BUNDLE);const next=clone(w);next.bundles.push(frozen);await replace(next);
  host.notice('Complete native catalogue capture is frozen in the saved browser archive. Attach these exact bytes through the original case source command when ready.');
 }
 async function action(name,el){
  if(name==='connections')return readConnections();
  if(name==='new')return newIntake();
  if(name==='open'){const next=clone(state());need(next.supplierIntakes?.some(v=>v.id===el.dataset.id),'Select a retained original supplier intake.');next.selectedSupplierIntake=el.dataset.id;await host.commit(next);page=null;return;}
  if(name==='view'){view=el.dataset.view;return;}
  const w=current();need(w,'Open a complete named supplier intake first.');
  if(name==='refresh')return refresh();
  if(name==='upload')return uploadOriginal();
  if(name==='profile')return readProfile();
  if(name==='load-catalogue')return loadCatalog();
  if(name==='save')return saveCatalog();if(name==='preview')return preview();if(name==='select')return selectEdition();if(name==='bundle')return captureBundle();
  if(name==='reconcile'||name==='replay')return dispatch(w.id,el.dataset.id,name==='reconcile');
  if(name==='materials'||name==='changes')return readPage(name);
  if(name==='next'){need(page?.value.nextOffset!==null,'Read a current original page first.');return readPage(page.kind,page.value.nextOffset);}
  if(name==='use-profile'){
   writable();const p=w.profiles[Number(el.dataset.index)];need(p?.sourceId===w.draft.sourceId,'Select a retained profile for the current original source.');
   const next=checkpointSupplierIntake(w,'Before explicit BMEcat mapping selection',now());next.draft.mappingText=pretty(p.value.catalogMapping);await replace(next);view='mapping';return;
  }
  if(name==='file-download'){const f=w.files.find(x=>x.id===w.draft.sourceFileId);need(f,'Select a retained original file.');host.download(new Blob([supplierFileBytes(f,MAX_SOURCE)]),f.name,'application/octet-stream');return;}
  if(name==='preview-download'){const p=frozenPreview(w);need(p,'Select the exact retained preview.');host.download(pretty(p),'Supplier_Original_Edition_Review.json');return;}
  if(name==='bundle-download'||name==='bundle-attach'){
   const b=w.bundles.find(x=>x.id===el.dataset.id);need(b,'Select a frozen complete bundle.');const bytes=supplierFileBytes(b.file,MAX_BUNDLE);
   if(name==='bundle-download'){host.download(new Blob([bytes]),b.file.name,'application/x-ndjson');return;}
   writable();await host.attachBundle(new File([bytes],b.file.name,{type:'application/x-ndjson'}),w.name+' · selected catalogue');
   return;
  }
  if(name==='checkpoint'){const label=prompt('Name the complete original supplier checkpoint');if(label?.trim())await replace(checkpointSupplierIntake(w,label.trim(),now()));return;}
  if(name==='history-open'){
   const h=w.history[Number(el.dataset.index)];need(h,'Select the original supplier checkpoint.');const next=clone(state()),copy={...clone(h.snapshot),id:requestId(),name:h.snapshot.name.slice(0,260)+' · '+h.label.slice(0,30),history:[]};next.supplierIntakes.push(copy);next.selectedSupplierIntake=copy.id;await host.commit(next);page=null;return;
  }
  throw Error('Unknown original supplier intake control.');
 }
 function localAction(name){return ['connections','open','view','refresh','profile','reconcile','replay','materials','changes','next','file-download','preview-download','bundle-download','history-open'].includes(name);}
 return {render,edit,action,retainFile,localAction};

}
