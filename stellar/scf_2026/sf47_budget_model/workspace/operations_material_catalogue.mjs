// SPDX-License-Identifier: MIT
// Read-only catalogue preparation; the original Installation editor remains the writer.
import {clone,object,need,same,canonical,identity,hashBytes,originalSource,newCopy,sourceFor,
 inputValue,checkpoint,emptyState,archive,readArchive,mergeState,openStore,MAX_SOURCE,MAX_ARCHIVE} from './operations_material_catalogue_model.mjs';
import {createMaterialFollowingDesk} from './operations_material_following.mjs';
import {createMaterialSupplierIntakeDesk} from './operations_material_supplier_intake.mjs';
import {pendingSupplierRequests} from './operations_material_supplier_intake_model.mjs';
import {Sha256} from './operations_installation_source_hash.mjs';
import {staffDeskStorageKey} from './staff-session.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=v=>JSON.stringify(v,null,2),now=()=>new Date().toISOString();
const button=(label,action,attrs='')=>'<button type="button" data-mc-action="'+action+'" '+attrs+'>'+esc(label)+'</button>';
const field=(label,key,value,area=false)=>'<label>'+esc(label)+(area?'<textarea rows="5" data-mc-field="'+key+'">'+esc(value)+'</textarea>':'<input data-mc-field="'+key+'" value="'+esc(value)+'">')+'</label>';
const select=(label,key,value,rows)=>'<label>'+esc(label)+'<select data-mc-field="'+key+'">'+rows.map(([id,name])=>'<option value="'+esc(id)+'"'+(String(id)===String(value)?' selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label>';
const details=(label,value)=>'<details><summary>'+esc(label)+'</summary><pre>'+esc(json(value))+'</pre></details>';
const table=(heads,rows)=>'<div class="mc-table"><table><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
function download(value,name,type='application/json'){
 const url=URL.createObjectURL(value instanceof Blob?value:new Blob([value],{type}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function encoded(bytes){let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
function decoded(text){need(typeof text==='string'&&text.length<=4*Math.ceil(262144/3),'Read a bounded exact original byte range.');const raw=atob(text);return Uint8Array.from(raw,c=>c.charCodeAt(0));}
function inScope(value,scope){return value?.caseId===scope.caseId&&value?.planId===scope.planId&&value?.createdAt===scope.createdAt;}
function safeName(value,fallback){const s=String(value||fallback).replace(/[\/\\\u0000-\u001f]/g,'_');return s.slice(0,220)||fallback;}
export function mountMaterialCatalogueSourceDesk(root,host){
 const scope=clone(host.context()),prefix='/api/operations/'+scope.caseId;
 root.className='material-catalogue-desk';root.hidden=true;root.setAttribute('aria-label','Material catalogue source and Installation preparation');
 if(!document.querySelector('link[data-material-catalogue-desk]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/operations_material_catalogue.css';link.dataset.materialCatalogueDesk='true';document.head.append(link);}
 let alive=true,opened=false,busy=false,hostBusy=false,store=null,state=emptyState(),dirty=false,conflict=false;
 let timer=null,chain=Promise.resolve(),activeOperation=Promise.resolve(),generation=0,error='',notice='';
 let supplierMode=false;
 let sourceId='',copyName='',tab='overview',tableName='',recordPage=null,beforeId='',afterId='',comparison=null,memberPage=null,historyIndex='';
 const $=selector=>root.querySelector(selector),current=()=>state.copies.find(c=>c.id===state.selected)||null;
 const sources=()=>host.caseData().sources||[],reason=()=>host.readOnlyReason?.()||'';
 const pending=()=>[...state.intakes.filter(i=>i.state==='PREPARED'),...pendingSupplierRequests(state)];
 function checkScope(){need(inScope(host.context(),scope),'Reopen this original Operations case; its workspace identity changed.');}
 async function persist(){
  need(store,'Open browser storage before saving a complete review.');need(!conflict,'Preserve this tab and reconcile the other saved copy first.');
  const snapshot=clone(state),captured=generation;archive(snapshot);
  const job=chain.catch(()=>{}).then(async()=>{
   try{const saved=await store.write(state.revision,snapshot);state.revision=saved.revision;if(generation===captured)dirty=false;}
   catch(e){dirty=true;if(e.code==='MATERIAL_COPY_CONFLICT')conflict=true;throw e;}
  });chain=job;return job;
 }
 async function flush(){clearTimeout(timer);await chain.catch(()=>{});if(dirty)await persist();}
 async function commit(candidate,{expected=state.revision,resolveConflict=false}={}){
  need(!conflict||resolveConflict,'Download this complete alternative before reconciling browser storage.');
  const next=clone(candidate);archive(next);
  const job=chain.catch(()=>{}).then(()=>store.write(expected,next));chain=job;
  try{state=await job;dirty=false;conflict=false;++generation;}
  catch(e){if(e.code==='MATERIAL_COPY_CONFLICT')conflict=true;throw e;}
 }
 async function replaceCopy(copy){const next=clone(state);const i=next.copies.findIndex(x=>x.id===copy.id);need(i>=0,'Retain the selected review identity.');next.copies[i]=copy;await commit(next);}
 function changed(){dirty=true;++generation;clearTimeout(timer);timer=setTimeout(()=>persist().catch(e=>{error=e.message;render();}),700);}
 function preparedStatus(c){
  if(!c?.prepared)return 'No current native preparation. Typed work and prior editions remain retained.';
  if(c.prepared.scope.version!==host.context().version)return 'STALE: the case version changed after this preparation. Its frozen files remain available; prepare again before editor handoff or a new customer package.';
  return 'The retained preparation matches this case version and the selected complete source.';
 }
 function invalidate(c){if(c.prepared){const next=checkpoint(c,'Before changed preparation input',now());Object.assign(c,next);c.prepared=null;c.preparedInput=null;}}
 function controls(){
  root.setAttribute('aria-busy',String(busy||hostBusy));
  const localActions=new Set(['close','archive','source-download','view','copy-open','history-open','checkpoint-download','prepared-download','commercial-html','commercial-md','workorder-md','selection-download','reload-store','merge-store','import','import-fork','member-download','member-next','member','rows','rows-next','compare','compare-next','verify','supplier-mode','catalogue-mode']);
  for(const el of root.querySelectorAll('button,input,select,textarea')){
   const rawAction=el.dataset.msAction;
   if(rawAction||el.dataset.msField!==undefined||el.matches('[data-ms-file]')){
    const local=supplierDesk.localAction(rawAction),recovery=['reconcile','replay'].includes(rawAction);
    el.disabled=busy||hostBusy||conflict||((!!reason()||pending().length>0)&&!local&&!recovery);continue;
   }
   const action=el.dataset.mcAction;
   const recovery=action==='intake-recover',local=localActions.has(action);
   el.disabled=busy||hostBusy||(conflict&&!['archive','reload-store','merge-store','close'].includes(action))||
     (!!reason()&&!local&&!recovery)||(pending().length>0&&!local&&!recovery);
  }
 }
 function render(){
  if(!alive||!opened)return;
  const c=current(),s=c?sourceFor(state,c):null;
  const list=state.copies.map(x=>button(x.name||'Untitled review','copy-open','data-id="'+esc(x.id)+'"'+(x.id===state.selected?' aria-current="true"':''))).join('');
  const sourceChoices=[['','Select an attached complete catalogue'],...sources().filter(x=>x.materialCatalogue).map(x=>[x.id,x.filename+' · '+x.sha256.slice(0,12)])];
  let body='<h3>Open a complete catalogue</h3><p>Attach or select its original full bundle. The native catalogue reader retains original rows, editions, source bytes, plans and reviews. Start with the original commercial Workshare in the Installation editor.</p>';
  if(c){
   const header='<div class="mc-fields">'+field('Working-copy name','name',c.name)+field('Review notes','notes',c.notes,true)+'</div>'+
    '<p>'+esc(s.metadata.filename)+' · '+s.metadata.bytes+' bytes · <code>'+esc(s.metadata.sha256)+'</code></p>'+
    '<p class="mc-notice">'+esc(preparedStatus(c))+'</p><div class="mc-actions">'+
    button('Save named checkpoint','checkpoint')+button('Verify attached source','verify')+button('Download original catalogue','source-download')+'</div>'+
    '<nav aria-label="Material source views">'+['overview','records','sources','editions','installation','history'].map(x=>button(x[0].toUpperCase()+x.slice(1),'view','data-view="'+x+'"'+(tab===x?' aria-current="page"':''))).join('')+'</nav>';
   let panel='';
   if(tab==='overview')panel='<h3>Complete source inventory</h3>'+details('Catalogue identity and source summary',{catalogue:s.inspection.catalogue,summary:s.inspection.summary})+
    table(['Retained table','Original rows'],Object.entries(s.inspection.tables).map(([key,count])=>[esc(key),esc(count)]))+
    '<p>Record filters inspect this retained catalogue. Installation preparation always binds the entire catalogue, its revision, active edition and original bundle hash.</p>'+
    details('Retained edition index — complete original rows are in Records',s.inspection.editions)+details('Supplier plan and review inventory',{plans:s.inspection.supplierPlans,reviews:s.inspection.supplierReviews});
   if(tab==='records')panel='<h3>Original records</h3>'+select('Original table','table',tableName,[['','Select a table'],...Object.entries(s.inspection.tables).map(([k,n])=>[k,k+' ('+n+')'])])+button('Read records','rows')+
    (recordPage?'<p>Rows '+recordPage.offset+'–'+(recordPage.offset+recordPage.rows.length)+' of '+recordPage.total+' · '+esc(recordPage.table)+'</p>'+recordPage.rows.map((r,i)=>details('Original row '+(recordPage.offset+i),r)).join('')+(recordPage.nextOffset!==null?button('Next original records','rows-next'):''):'<p>No record page selected.</p>');
   if(tab==='sources')panel='<h3>Exact original feeds</h3>'+table(['Source identity','Original bytes','Actions'],s.inspection.sources.map(x=>[
    '<code>'+esc(x.manifest.id)+'</code>'+details('Original source metadata',x.manifest),
    esc(x.file.bytes)+'<br><code>'+esc(x.file.sha256)+'</code>',
    button('Read original bytes','member','data-id="'+esc(x.manifest.id)+'"')+button('Download complete original','member-download','data-id="'+esc(x.manifest.id)+'"')]))+
    (memberPage?'<h4>Source '+esc(memberPage.source.id)+' · byte offset '+memberPage.offset+'</h4><pre>'+esc(memberPage.text)+'</pre>'+
      (memberPage.nextOffset!==null?button('Next original bytes','member-next'):''):'');
   if(tab==='editions')panel='<h3>Compare retained editions</h3><p>Comparison preserves original added, changed and removed records. It does not change catalogue or preparation selection.</p><div class="mc-fields">'+
    select('Before edition','before',beforeId,[['','Select before'],...s.inspection.editions.map(e=>[e.id,e.id])])+
    select('After edition','after',afterId,[['','Select after'],...s.inspection.editions.map(e=>[e.id,e.id])])+'</div>'+button('Compare original editions','compare')+
    (comparison?details('Complete comparison counts',Object.fromEntries(Object.entries(comparison).filter(([k])=>!['rows'].includes(k))))+
     comparison.rows.map((r,i)=>details('Change '+(comparison.offset+i),r)).join('')+(comparison.nextOffset!==null?button('Next changes','compare-next'):''):'');
   if(tab==='installation'){
    let selection=null,bindings=null;try{selection=JSON.parse(c.selectionText);}catch{}try{bindings=JSON.parse(c.bindingsText);}catch{}
    const plans=s.inspection.supplierPlans,reviews=s.inspection.supplierReviews.filter(r=>r.planId===selection?.supplierPlanId);
    panel=followingDesk.panel(c)+'<h3>Prepare the original Installation</h3><p>Profile: <strong>supplier-catalogues</strong>. Receive a complete new commercial Workshare draft; review its unchanged terms and complete source bindings before handing a separate draft back to the original editor.</p>'+
     (!c.following?button('Receive complete current Workshare draft','template'):'')+
     (c.document?details('Complete original Workshare and Installation document',c.document):'<p>No Workshare draft received.</p>')+
     (c.template?details('Original source bindings and missing source decisions',{sourceBindings:c.template.sourceBindings,missingSources:c.template.missingSources,commercialCaseId:c.template.commercialCaseId}):'')+
     (c.template?'<div class="mc-fields">'+field('Stable preparation operation ID','operation',c.operationId)+
      select('Supplier plan (optional)','plan',selection?.supplierPlanId??'',[['','No supplier plan'],...plans.map(p=>[p.id,p.title+' · revision '+p.revision])])+
      select('Supplier review (optional)','review',selection?.supplierReviewId??'',[['','No supplier review'],...reviews.map(r=>[r.id,r.id+' · '+r.editionId])])+'</div>'+
      (object(bindings)?'<div class="mc-fields">'+[['name','Task name'],['purpose','Purpose'],['request','Requested result'],['completeOutput','Complete output']].map(([key,label])=>field(label,'task.'+key,bindings.task?.[key]??'',true)).join('')+'</div>':'')+
      field('Complete source-bound selection JSON','selectionText',c.selectionText,true)+field('Complete original profile bindings JSON','bindingsText',c.bindingsText,true)+
      '<p>Incomplete typed JSON is saved as draft text. Only a complete native preparation can be handed to the Installation editor.</p>'+button('Prepare and review complete Installation','prepare'):'')+
     (c.prepared?'<section><h4>Retained native preparation</h4><p>Case version '+c.prepared.scope.version+' · <code>'+esc(c.prepared.preparationSha256)+'</code></p>'+
      details('Original native preview',c.prepared.nativePreview)+details('Prepared document, complete source and commercial outputs',c.prepared.result)+
      '<div class="mc-actions">'+button(c.following?'Open same Installation draft':'Open as separate Installation draft','receive')+button('Download complete preparation','prepared-download')+
      button('Download exact selection','selection-download')+button('Download commercial HTML','commercial-html')+button('Download commercial Markdown','commercial-md')+
      button('Download workorder Markdown','workorder-md')+button('Build and download complete customer ZIP','handover')+'</div></section>':'');
   }
   if(tab==='history')panel='<h3>Complete review history</h3><p>Opening a checkpoint creates a separate named alternative. Existing review editions and original source bytes remain retained.</p>'+
    table(['Checkpoint','Identity','Actions'],c.history.map((h,i)=>[esc(h.label)+'<br>'+esc(h.at),'<code>'+esc(h.sha256)+'</code>',
     button('Open complete alternative','history-open','data-index="'+i+'"')+button('Download checkpoint','checkpoint-download','data-index="'+i+'"')]))+
    details('Editor handoff receipts',c.handoffs)+details('Complete customer package receipts',c.packages);
   body=header+panel;
  }
  const intakes=state.intakes.map(i=>'<section class="mc-intake"><strong>'+esc(i.body.data.filename)+'</strong><p>'+esc(i.state)+' · '+i.identity.bytes+' bytes</p><code>'+esc(i.identity.sha256)+'</code>'+
    (i.state==='PREPARED'?button('Recover exact original source intake','intake-recover','data-id="'+esc(i.id)+'"'):i.state==='COMMITTED'?button('Select accepted catalogue','intake-open','data-id="'+esc(i.id)+'"'):details('Original rejection',i.error))+'</section>').join('');
  root.innerHTML='<header><h2>Material catalogue source desk</h2><div>'+button('Original supplier intake','supplier-mode')+button('Complete catalogue reviews','catalogue-mode')+button('Return to Installation editor','close')+'</div></header>'+
   '<p class="mc-notice">Original Operations case '+esc(scope.caseId)+' · current version '+host.context().version+'. Preparation and package downloads use the maintained native catalogue and Workshare engines.</p>'+
   '<p role="'+(error?'alert':'status')+'" aria-live="polite" class="mc-status">'+esc(error||notice||'Open a named review to begin.')+'</p>'+
   (reason()?'<p class="mc-notice">'+esc(reason())+'</p>':'')+
   (conflict?'<section class="mc-notice"><h3>Another tab saved a different complete review</h3><p>This tab is still intact. Download it before reopening saved work, or explicitly retain both alternatives.</p>'+button('Download this full alternative','archive')+button('Reopen saved browser work','reload-store')+button('Retain both complete alternatives','merge-store')+'</section>':'')+
   '<div class="mc-layout"><aside>'+select('Complete attached material catalogue','source',sourceId,sourceChoices)+field('New working-copy name','newName',copyName)+button('Open named source review','open-source')+
   '<label>Attach original full catalogue (128 MiB maximum)<input type="file" data-mc-upload accept=".json,.jsonl,application/json,application/x-ndjson"></label><p>Original bytes are retained through the existing case command. A pending request is recovered with the same actor and request ID.</p>'+
   intakes+'<h3>Retained working copies</h3>'+list+'<h3>Complete browser work</h3>'+button('Download all source and review history','archive')+button('Import complete archive','import')+
   button('Import as explicit alternatives','import-fork')+'<input type="file" data-mc-import hidden accept=".json,application/json"></aside><main>'+body+'</main></div>';
  if(supplierMode)root.querySelector('.mc-layout').outerHTML=supplierDesk.render();
  controls();
 }
 async function run(fn){
  if(!alive||busy||hostBusy)return;busy=true;error='';controls();
  const job=(async()=>{try{await flush();checkScope();await fn();}catch(e){error=e.message||String(e);}finally{busy=false;render();}})();
  activeOperation=job;return job;
 }
 function requestBody(c,extra={}){
  checkScope();return {expectedVersion:host.context().version,sourceId:c.sourceId,expectedSourceSha256:c.sourceSha256,...extra};
 }
 async function request(action,c,extra={}){
  const body=requestBody(c,extra),response=await host.api(prefix+'/material-catalog/'+action,body);
  need(response.schema==='stellar-forge.material-source-desk-result.v1'&&response.scope?.caseId===scope.caseId&&response.scope.planId===scope.planId&&response.scope.version===body.expectedVersion&&response.source?.id===c.sourceId&&response.source.sha256===c.sourceSha256,'The original native result changed case, version or source identity.');
  return response;
 }
 async function readSource(id){
  await host.refreshCase();checkScope();const metadata=sources().find(x=>x.id===id&&x.materialCatalogue);
  need(metadata&&metadata.bytes>0&&metadata.bytes<=MAX_SOURCE,'Select a complete typed material catalogue attached to this case.');
  const response=await host.api(prefix+'/sources/'+id,undefined,{download:true});
  const blob=await response.blob();need(blob.size===metadata.bytes,'The complete source download length differs.');
  const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await blob.arrayBuffer());
  const inspection=await request('inspect',{sourceId:id,sourceSha256:metadata.sha256});
  return originalSource(metadata,raw,inspection.result);
 }
 async function verify(){
  const c=current();need(c,'Open a complete review first.');await host.refreshCase();checkScope();
  const metadata=sources().find(x=>x.id===c.sourceId);need(metadata?.sha256===c.sourceSha256,'The selected original catalogue is no longer attached with this exact identity.');
  const response=await request('inspect',c);need(same(response.result,sourceFor(state,c).inspection),'The native inspection differs from the retained complete source. Keep this original review and open a separate current source.');
 }
 function clearPages(){recordPage=null;comparison=null;memberPage=null;}
 async function openSource(){
  need(!reason()&&!pending().length,'Recover the current original operation before opening another source review.');
  const source=await readSource(sourceId);need(copyName.trim(),'Name this complete source review.');
  const next=clone(state),prior=next.sources.find(x=>x.metadata.id===source.metadata.id&&x.metadata.sha256===source.metadata.sha256);
  if(prior)need(same(prior,source),'The same attached source has a different complete retained inspection.');else next.sources.push(source);
  const copy=newCopy({id:crypto.randomUUID(),name:copyName,scope,source,at:now()});next.copies.push(copy);next.selected=copy.id;
  await commit(next);clearPages();tab='overview';notice='Complete original source opened and saved in this browser review.';
 }
 async function recoverIntake(id){
  const original=state.intakes.find(i=>i.id===id);need(original?.state==='PREPARED','Select the exact pending original intake.');
  let result;
  try{result=await host.saveApi(prefix+'/material-catalog-source',clone(original.body));}
  catch(e){
   if([400,409,413,415,422].includes(e.status)&&typeof e.code==='string'){
    const next=clone(state),item=next.intakes.find(i=>i.id===id);item.state='REJECTED';item.error={code:e.code,message:e.message};item.rejectedAt=now();await commit(next);
   }throw e;
  }
  need(result?.recordId,'The original source command returned no accepted record identity.');
  const next=clone(state),item=next.intakes.find(i=>i.id===id);item.state='COMMITTED';item.result=clone(result);item.completedAt=now();await commit(next);
  await host.refreshCase();const metadata=sources().find(x=>x.id===result.recordId);
  need(metadata?.materialCatalogue&&metadata.bytes===original.identity.bytes&&metadata.sha256===original.identity.sha256,'Read back the complete accepted original source before using it.');
  sourceId=metadata.id;notice='The exact complete catalogue is attached. Open its named source review.';
 }
 async function upload(file){
  need(!reason()&&!pending().length,'Recover the original case operation before a new source intake.');
  need(file&&file.size>0&&file.size<=MAX_SOURCE,'Select the complete original catalogue within128 MiB.');
  const bytes=new Uint8Array(await file.arrayBuffer()),id={bytes:bytes.length,sha256:hashBytes(bytes)};
  new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  await host.refreshCase();const existing=sources().find(x=>x.materialCatalogue&&x.sha256===id.sha256&&x.bytes===id.bytes);
  if(existing){sourceId=existing.id;notice='This exact full catalogue is already attached.';return;}
  const item={id:crypto.randomUUID(),scope:clone(scope),identity:id,state:'PREPARED',createdAt:now(),body:{
   requestId:crypto.randomUUID(),expectedVersion:host.context().version,actor:host.recordingActor(),action:'material-catalog-source.add',
   note:'Retain complete original Material Catalog bundle',data:{filename:safeName(file.name,'Material_Catalogue.jsonl'),mediaType:'application/x-ndjson',kind:'deployment',sourceUrl:'',observedAt:now(),expectedSha256:id.sha256,contentBase64:encoded(bytes)}}};
  const next=clone(state);next.intakes.push(item);await commit(next);await recoverIntake(item.id);
 }
 async function template(){
  need(!reason(),'Reopen the current original case before receiving a Workshare.');
  const c=current();need(c,'Open a complete source review.');await verify();
  need(!c.following,'Choose New Installation explicitly before receiving a new Workshare draft.');
  const target=host.currentDraft();need(target&&!target.installationId&&target.expectedRevision===0&&object(target.document?.workshare),'Receive a complete new commercial Workshare in the original Installation editor first.');
  const result=await request('template',c,{document:target.document,operationId:c.operationId});
  const next=checkpoint(c,'Before receiving current Workshare',now());next.document=clone(target.document);next.template=clone(result.result);
  next.selectionText=json(result.result.selection);next.bindingsText=json(result.result.bindings);next.prepared=null;next.preparedInput=null;next.updatedAt=now();
  await replaceCopy(next);notice='Complete original Workshare, profile bindings and source authority received. Review the fields before preparing.';
 }
 async function prepare(){
  need(!reason(),'Recover the current original case before preparing.');const c=current();need(c,'Open a complete review.');await verify();
  const input=inputValue(c,sourceFor(state,c)),body={...input,operationId:input.selection.operationId};
  const response=await request('prepare',c,body);
  need(response.preparationSha256&&response.nativePreview?.source?.caseId===scope.caseId&&response.nativePreview.source.version===response.scope.version&&same(response.nativePreview.document,response.result.prepared?.document),'The native prepared document differs from its original Installation preview.');
  const next=checkpoint(c,'Before new native preparation',now());next.prepared=clone(response);next.preparedInput=clone(body);next.updatedAt=now();
  await replaceCopy(next);notice='Complete native preparation retained. Review the document, then open a separate original Installation draft or download its full handover.';
 }
 async function receive(){
  need(!reason(),'Recover the original Installation operation first.');const c=current();need(c?.prepared,'Prepare this complete source first.');
  await verify();need(c.prepared.scope.version===host.context().version,'The case changed. Prepare again from its current original version.');
  const confirmed=await request('prepare',c,clone(c.preparedInput));need(same(confirmed,c.prepared),'The retained preparation differs from the current original native result. Prepare again before editor handoff.');
  const result=await host.receiveDraft(clone(confirmed));need(result?.applied,result?.message||'The original editor did not retain this prepared document.');
  const next=clone(c);next.handoffs.push({at:now(),preparationSha256:c.prepared.preparationSha256,result:clone(result)});await replaceCopy(next);
  notice='A separate complete unsaved draft is open in the Installation editor. Its original Review and Save controls remain authoritative.';
 }
 async function handover(){
  need(!reason(),'Recover the original case before preparing its complete package.');const c=current();need(c?.prepared&&c.preparedInput,'Retain a complete native preparation first.');
  await verify();need(c.prepared.scope.version===host.context().version,'The original case version changed; prepare again.');
  const body=requestBody(c,{...clone(c.preparedInput),expectedPreparationSha256:c.prepared.preparationSha256});
  const response=await host.api(prefix+'/material-catalog/handover',body,{download:true}),blob=await response.blob();
  need(blob.size>0&&blob.size<=MAX_ARCHIVE,'Keep the complete original package within512 MiB.');
  const expected=response.headers.get('X-Material-Package-Sha256'),preparation=response.headers.get('X-Material-Preparation-Sha256');
  need(/^[a-f0-9]{64}$/.test(expected||'')&&preparation===c.prepared.preparationSha256,'The complete native package has no matching preparation identity.');
  const hash=new Sha256();for(let offset=0;offset<blob.size;offset+=1024*1024)hash.update(new Uint8Array(await blob.slice(offset,offset+1024*1024).arrayBuffer()));
  need(hash.hex()===expected,'The exact downloaded complete customer package differs from its native identity.');
  const next=clone(c);next.packages.push({at:now(),bytes:blob.size,sha256:expected,preparationSha256:preparation,scope:clone(c.prepared.scope)});await replaceCopy(next);
  download(blob,'Material_Catalog_Complete_Handover.zip','application/zip');notice='Complete source and application ZIP verified against the native response and downloaded. Open every outgoing attachment in the original receiving course before customer-ready use.';
 }
 async function rows(offset=0){const c=current();need(c&&tableName,'Select an original table.');const response=await request('rows',c,{table:tableName,offset,limit:50});recordPage=response.result;}
 async function compare(offset=0){const c=current();need(c&&beforeId&&afterId,'Select both original editions.');const response=await request('compare',c,{beforeEditionId:beforeId,afterEditionId:afterId,offset,limit:50});comparison=response.result;}
 async function member(id,offset=0){
  const c=current();need(c,'Select an original source review.');
  const response=await request('member',c,{originalSourceId:id,offset,limit:65536}),value=response.result,expected=sourceFor(state,c).inspection.sources.find(x=>x.manifest.id===id);
  need(expected&&value.source?.id===id&&value.offset===offset&&same(value.file,expected.file),'The original byte range changed source identity.');
  const part=decoded(value.contentBase64);need(part.length<=65536&&offset+part.length<=value.file.bytes,'The original byte range exceeds its retained file.');
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(part);}catch{text='This range includes binary data or splits an encoded character. Download the complete original to inspect its exact bytes.';}
  memberPage={...value,text};return {value,part,expected};
 }
 async function downloadMember(id){
  const c=current(),original=sourceFor(state,c).inspection.sources.find(x=>x.manifest.id===id);
  need(original&&original.file.bytes<=MAX_SOURCE,'Select the complete retained original within128 MiB.');
  const parts=[],hash=new Sha256();let offset=0;
  do{
   const response=await request('member',c,{originalSourceId:id,offset,limit:262144}),v=response.result,b=decoded(v.contentBase64);
   need(v.source?.id===id&&v.offset===offset&&same(v.file,original.file)&&b.length<=262144&&(b.length>0||original.file.bytes===0),'The complete original range changed identity.');
   need(offset+b.length<=original.file.bytes&&v.nextOffset===(offset+b.length<original.file.bytes?offset+b.length:null),'The original source range is incomplete or discontinuous.');
   hash.update(b);parts.push(b);offset+=b.length;if(v.nextOffset===null)break;
  }while(offset<original.file.bytes);
  need(offset===original.file.bytes&&hash.hex()===original.file.sha256,'The full original source download differs from its retained identity.');
  download(new Blob(parts,{type:original.manifest.mediaType||'application/octet-stream'}),safeName(original.manifest.filename,id+'.bin'));
 }
 async function importWork(file,fork){
  need(file&&file.size<=MAX_ARCHIVE,'Select the complete bounded browser archive.');
  const incoming=readArchive(await file.text());for(const c of incoming.copies)need(inScope(c.scope,scope),'Receive this archive in its original Operations case.');for(const i of incoming.intakes)need(inScope(i.scope,scope),'Receive original source requests only in their original case.');
  for(const i of incoming.supplierIntakes??[])need(inScope(i.scope,scope),'Receive supplier intake work only in its original Operations case.');
  const next=mergeState(state,incoming,{fork});await commit(next);clearPages();notice='Complete original sources, drafts, preparation history and request receipts received.';
 }
 function edit(target){
  const key=target.dataset.mcField;if(!key)return;
  if(key==='source'){sourceId=target.value;return;}if(key==='newName'){copyName=target.value;return;}
  if(key==='table'){tableName=target.value;recordPage=null;return;}if(key==='before'){beforeId=target.value;comparison=null;return;}if(key==='after'){afterId=target.value;comparison=null;return;}
  const c=current();if(!c)return;
  try{
   if(['name','notes'].includes(key))c[key]=target.value;
   else{
    invalidate(c);
    if(key==='operation'){c.operationId=target.value;try{const s=JSON.parse(c.selectionText);s.operationId=target.value;c.selectionText=json(s);const el=$('[data-mc-field="selectionText"]');if(el)el.value=c.selectionText;}catch{}}
    else if(key==='selectionText'||key==='bindingsText')c[key]=target.value;
    else if(key==='plan'||key==='review'){
     const s=JSON.parse(c.selectionText),source=sourceFor(state,c);
     if(key==='plan'){const p=source.inspection.supplierPlans.find(x=>x.id===target.value);s.supplierPlanId=p?.id??null;s.supplierPlanRevision=p?.revision??null;s.supplierReviewId=null;}
     else s.supplierReviewId=target.value||null;c.selectionText=json(s);
    }else if(key.startsWith('task.')){const bindings=JSON.parse(c.bindingsText);need(object(bindings.task),'Retain the complete native task bindings.');bindings.task[key.slice(5)]=target.value;c.bindingsText=json(bindings);const el=$('[data-mc-field="bindingsText"]');if(el)el.value=c.bindingsText;}
   }
   c.updatedAt=now();changed();if(['plan','review'].includes(key))render();
  }catch(e){error=e.message;render();}
 }
 const followingDesk=createMaterialFollowingDesk({root,host,current,state:()=>state,request,verify,readSource,replaceCopy,commit,render,changed,invalidate,reason,download,
  checkpoint:(c,label)=>checkpoint(c,label,now()),notice:value=>{notice=value;}});
 const supplierDesk=createMaterialSupplierIntakeDesk({
  state:()=>state,scope,context:host.context,api:host.api,readOnlyReason:reason,
  otherPending:()=>state.intakes.some(i=>i.state==='PREPARED'),commit,changed,render,
  refreshCase:host.refreshCase,notice:value=>{notice=value;},download,
  attachBundle:async(file,name)=>{await upload(file);need(!state.intakes.some(i=>i.state==='PREPARED'),'Recover the exact original bundle attachment before opening its source review.');
   copyName=name;await openSource();supplierMode=false;tab='overview';
   notice='The exact frozen complete supplier catalogue is attached and open as a separate named source review. Existing Workshare and Installation drafts remain retained.';}
 });
 root.addEventListener('input',event=>{if(!busy&&!hostBusy&&!conflict){try{if(!supplierDesk.edit(event.target)&&!followingDesk.edit(event.target))edit(event.target);}catch(e){error=e.message;render();}}});
 root.addEventListener('change',event=>{
  if(event.target.matches('[data-ms-file]')){const file=event.target.files?.[0];event.target.value='';run(()=>supplierDesk.retainFile(file));}
  if(event.target.matches('[data-mc-upload]')){const file=event.target.files?.[0];event.target.value='';run(()=>upload(file));}
  if(event.target.matches('[data-mc-import]')){const file=event.target.files?.[0],fork=event.target.dataset.fork==='true';event.target.value='';run(()=>importWork(file,fork));}
 });
 root.addEventListener('click',event=>{
  const following=event.target.closest('[data-mf-action]');if(following&&root.contains(following)){run(()=>followingDesk.action(following.dataset.mfAction));return;}
  const raw=event.target.closest('[data-ms-action]');if(raw&&root.contains(raw)){run(()=>supplierDesk.action(raw.dataset.msAction,raw));return;}
  const el=event.target.closest('[data-mc-action]');if(!el||!root.contains(el))return;const action=el.dataset.mcAction;
  if(action==='import'||action==='import-fork'){const input=$('[data-mc-import]');input.dataset.fork=String(action==='import-fork');input.click();return;}
  if(action==='archive'){try{download(archive(state),'Material_Catalogue_Complete_Working_Review.json');}catch(e){error=e.message;render();}return;}
  if(action==='reload-store'||action==='merge-store'){
   if(busy||hostBusy)return;busy=true;controls();activeOperation=(async()=>{try{
    clearTimeout(timer);await chain.catch(()=>{});const saved=await store.read();
    if(action==='reload-store'){download(archive(state),'Material_Catalogue_Before_Reopening_Saved_Work.json');state=saved;conflict=false;dirty=false;++generation;}
    else await commit(mergeState(saved,state,{fork:true}),{expected:saved.revision,resolveConflict:true});
    clearPages();notice='Complete browser alternatives reconciled.';
   }catch(e){error=e.message;}finally{busy=false;render();}})();return;
  }
  run(async()=>{
   const c=current(),s=c?sourceFor(state,c):null;
   if(action==='supplier-mode'){supplierMode=true;return;}
   if(action==='catalogue-mode'){supplierMode=false;return;}
   if(action==='close'){opened=false;root.hidden=true;host.close?.();return;}
   if(action==='open-source')return openSource();
   if(action==='intake-recover')return recoverIntake(el.dataset.id);
   if(action==='intake-open'){sourceId=state.intakes.find(i=>i.id===el.dataset.id).result.recordId;await host.refreshCase();notice='Accepted original selected; name and open a review.';return;}
   if(action==='copy-open'){const next=clone(state);next.selected=el.dataset.id;await commit(next);clearPages();return;}
   if(action==='view'){tab=el.dataset.view;return;}
   if(action==='verify'){await verify();notice='The complete native source inspection matches this retained review.';return;}
   if(action==='source-download'){need(s,'Open a complete review.');download(s.raw,safeName(s.metadata.filename,'Material_Catalogue.jsonl'),'application/x-ndjson');return;}
   if(action==='checkpoint'){need(c,'Open a complete review.');const label=prompt('Name this complete review checkpoint');if(label?.trim())await replaceCopy(checkpoint(c,label.trim(),now()));return;}
   if(action==='template')return template();if(action==='prepare')return prepare();if(action==='receive')return receive();if(action==='handover')return handover();
   if(action==='rows')return rows();if(action==='rows-next')return rows(recordPage.nextOffset);
   if(action==='compare')return compare();if(action==='compare-next')return compare(comparison.nextOffset);
   if(action==='member')return member(el.dataset.id);if(action==='member-next')return member(memberPage.source.id,memberPage.nextOffset);if(action==='member-download')return downloadMember(el.dataset.id);
   if(action==='history-open'){
    const h=c.history[Number(el.dataset.index)];need(h,'Select the original checkpoint.');const next=clone(state),copy={...clone(h.snapshot),id:crypto.randomUUID(),name:(h.snapshot.name.slice(0,260)+' · '+h.label.slice(0,30)),history:[]};next.copies.push(copy);next.selected=copy.id;await commit(next);clearPages();notice='Opened the exact complete checkpoint as a separate alternative.';return;
   }
   if(action==='checkpoint-download'){const h=c.history[Number(el.dataset.index)];need(h,'Select the retained checkpoint.');download(json({schema:'stellar-forge.material-source-checkpoint.v1',source:s,checkpoint:h})+'\n','Material_Complete_Checkpoint.json');return;}
   need(c?.prepared,'Select a retained complete preparation.');
   if(action==='prepared-download')download(json({preparation:c.prepared,input:c.preparedInput})+'\n','Material_Prepared_Installation.json');
   if(action==='selection-download')download(json(c.preparedInput.selection)+'\n','Material_Selection.json');
   if(action==='commercial-html')download(c.prepared.result.commercialHtml,'Material_Commercial_Workshare.html','text/html');
   if(action==='commercial-md')download(c.prepared.result.commercialMarkdown,'Material_Commercial_Workshare.md','text/markdown');
   if(action==='workorder-md')download(typeof c.prepared.result.workorder==='string'?c.prepared.result.workorder:json(c.prepared.result.workorder),'Material_Workorder.md','text/markdown');
  });
 });
 const ready=(async()=>{store=await openStore(staffDeskStorageKey('sf47.material-catalogue.'+scope.caseId+'.'+scope.planId+'.'+scope.createdAt));state=await store.read();for(const c of state.copies)need(inScope(c.scope,scope),'This browser review belongs to another original case.');for(const i of state.supplierIntakes??[])need(inScope(i.scope,scope),'This supplier intake belongs to another original case.');})();
 return {ready,async open(){await ready;checkScope();opened=true;root.hidden=false;render();root.scrollIntoView({block:'start'});},
  setHostBusy(value){hostBusy=!!value;controls();},refresh(){if(opened&&!busy){controls();}},flush,
  dispose(){clearTimeout(timer);alive=false;Promise.allSettled([activeOperation,ready]).then(async()=>{try{await flush();}catch{}finally{await chain.catch(()=>{});store?.close();}});}
};

}
