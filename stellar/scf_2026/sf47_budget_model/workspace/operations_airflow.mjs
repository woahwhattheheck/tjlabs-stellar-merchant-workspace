// SPDX-License-Identifier: MIT
import {SCHEMA,clone,same,need,identity,hashBytes,sourceOriginal,newCopy,checkpoint,compareEdition,applyComparison,
 completeSelection,validateCopy,validateArchive,archive,mergeCopies,openStore,refKey,validateIntake,mergeIntakes,MAX_SOURCE,MAX_ARCHIVE} from './operations_airflow_model.mjs';
import {staffDeskStorageKey} from './staff-session.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=v=>JSON.stringify(v,null,2);
const at=()=>new Date().toISOString();
function download(value,name,type='application/json'){
 const url=URL.createObjectURL(value instanceof Blob?value:new Blob([value],{type}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
const button=(name,action,attrs='')=>'<button type="button" data-af-action="'+action+'" '+attrs+'>'+esc(name)+'</button>';
const field=(name,key,value,type='text')=>'<label>'+esc(name)+(type==='area'?'<textarea rows="3" data-af-field="'+key+'">'+esc(value)+'</textarea>':'<input type="'+type+'" data-af-field="'+key+'" value="'+esc(value)+'">')+'</label>';
const select=(name,key,value,rows)=>'<label>'+esc(name)+'<select data-af-field="'+key+'">'+rows.map(([id,label])=>'<option value="'+esc(id)+'"'+(id===value?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label>';
const table=(heads,rows)=>'<div class="af-table"><table><thead><tr>'+heads.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
function base64(text){const bytes=new TextEncoder().encode(text);let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
export function mountAirflowSourceDesk(root,host){
 const scope=clone(host.context()),prefix='/api/operations/'+scope.caseId;
 root.className='airflow-source-desk';root.hidden=true;root.setAttribute('aria-label','Airflow source and Installation preparation');
 if(!document.querySelector('link[data-airflow-desk]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/operations_airflow.css';l.dataset.airflowDesk='true';document.head.append(l);}
 let alive=true,opened=false,busy=false,hostBusy=false,store=null,state={revision:0,copies:[],selected:null,intakes:[]},conflict=false;
 let error='',notice='',sourceId='',name='',filter='',memberPath='',pageText='',pageNext=null,pageOffset=0,pageFile=null,view='cohort';
 let sourceVerified=false,saveTimer=null,saveChain=Promise.resolve(),dirty=false,editVersion=0,importFork=false;
 const current=()=>state.copies.find(x=>x.id===state.selected)||null;
 const $=s=>root.querySelector(s);
 const sourceRows=()=>host.caseData().sources;
 const reason=()=>host.readOnlyReason?.()||'';
 const textSource=id=>sourceRows().find(x=>x.id===id);
 function recordState(){return {copies:state.copies,selected:state.selected,intakes:state.intakes||[]};}
 async function persist(){
  if(!store)throw new Error('Open browser storage before changing the complete working copy.');
  if(conflict)throw new Error('Download your full current work and resolve the other tab before saving.');
  archive(state.copies,state.selected,state.intakes||[]);
  const snapshot=clone(recordState()),generation=editVersion;
  saveChain=saveChain.catch(()=>{}).then(async()=>{
   try{const saved=await store.write(state.revision,snapshot);state.revision=saved.revision;dirty=editVersion!==generation;}
   catch(e){if(e.code==='AIRFLOW_COPY_CONFLICT')conflict=true;dirty=true;throw e;}
  });return saveChain;
 }
 async function publishCandidate(value,{expectedRevision=state.revision,resolveConflict=false}={}){
  need(store,'Open browser storage before changing the complete working copy.');
  need(!conflict||resolveConflict,'Preserve this tab before reconciling another saved state.');
  const candidate=clone(value);
  archive(candidate.copies,candidate.selected,candidate.intakes||[]);
  // A failed merge, capacity check or IndexedDB write must leave this tab's full work intact.
  const operation=saveChain.catch(()=>{}).then(()=>store.write(expectedRevision,candidate));
  saveChain=operation;
  let saved;try{saved=await operation;}catch(e){if(e.code==='AIRFLOW_COPY_CONFLICT')conflict=true;throw e;}
  state=saved;state.intakes??=[];conflict=false;dirty=false;++editVersion;
 }
 async function publishCopy(next){
  const copies=state.copies.map(value=>value.id===next.id?next:value);
  need(copies.some(value=>value.id===next.id),'Keep the original working-copy identity.');
  await publishCandidate({copies,selected:state.selected,intakes:state.intakes||[]});
 }
 function changed(){
  dirty=true;++editVersion;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{persist().catch(e=>{error=e.message;render();});},350);
 }
 function capture(){
  const c=current();if(!c)return;
  if($('[data-af-field="copyName"]'))c.name=$('[data-af-field="copyName"]').value;
  if($('[data-af-field="notes"]'))c.notes=$('[data-af-field="notes"]').value;
  for(const el of root.querySelectorAll('[data-af-row]')){
   const row=c.selection.cohort[Number(el.dataset.afRow)],key=el.dataset.afKey;
   if(row)row[key]=el.type==='checkbox'?el.checked:el.value;
  }
  if(c.bindings)for(const el of root.querySelectorAll('[data-af-binding]')){
   const [section,key]=el.dataset.afBinding.split('.');c.bindings[section][key]=el.value;
  }
  if(dirty)c.updatedAt=at();
 }
 function controls(){
  root.setAttribute('aria-busy',String(busy||hostBusy));
  for(const el of root.querySelectorAll('button,input,select,textarea')){
   const read=el.dataset.afAction&&['intake-open','download','close','source-download','selection-download','copy-open','view','member','page','history-open','member-download','download-conflict'].includes(el.dataset.afAction);
   el.disabled=busy||hostBusy||(conflict&&!['close','download','download-conflict','store-reload','conflict-fork'].includes(el.dataset.afAction))||(!read&&!!reason())||((!!current()?.pending||(state.intakes||[]).some(x=>x.state==='PREPARED'))&&!read&&!['recover','intake-recover','download','store-reload'].includes(el.dataset.afAction));
  }
 }
 function render(){
  if(!alive||!opened)return;
  const c=current(),context=host.context(),sources=[['','Select complete attached source'],...sourceRows().map(x=>[x.id,x.filename+' · '+x.sha256.slice(0,12)])];
  const list=state.copies.map(x=>button(x.name||'Untitled','copy-open','data-id="'+esc(x.id)+'"')).join('');
  const intake=(state.intakes||[]).map(x=>'<section class="af-intake"><strong>'+esc(x.body.data.filename)+'</strong><br>'+esc(x.state)+' · '+x.identity.bytes+' B<br><code>'+esc(x.identity.sha256)+'</code>'+
   (x.state==='PREPARED'?button('Recover original file intake','intake-recover','data-id="'+esc(x.id)+'"'):x.state==='COMMITTED'?button('Open retained handover','intake-open','data-id="'+esc(x.id)+'"'):
   '<p>'+esc(x.error?.message)+'</p>'+button('Prepare a new guarded attempt','intake-retry','data-id="'+esc(x.id)+'"'))+'</section>').join('');
  let body='<p>Choose a complete Airflow handover attached to this Operations case. Original source, commercial terms and native save remain together.</p>';
  if(c){
   const matching=c.source.report.cohort.map((r,i)=>({r,i})).filter(({r})=>(r.reference.dagId+' '+refKey(r.reference)+' '+r.namespace+' '+r.complete).toLowerCase().includes(filter.toLowerCase()));
   body='<div class="af-fields">'+field('Working-copy name','copyName',c.name)+field('Review notes','notes',c.notes,'area')+'</div>'+
    '<p>Workspace <code>'+esc(c.selection.workspaceId)+'</code> · '+c.source.metadata.bytes+' original bytes · <code>'+esc(c.source.metadata.sha256)+'</code></p>'+
    '<p>'+esc(sourceVerified?'Complete source re-read through the original native reader.':'Retained working copy. Verify the attached original source before preparing it.')+'</p>'+
    '<div class="af-actions">'+button('Verify original source','verify')+button('Save complete checkpoint','checkpoint')+button('Fork complete copy','fork')+button('Download original handover','source-download')+button('Download selected cohort','selection-download')+button('Download all working copies','download')+'</div>'+
    '<nav class="af-actions">'+['cohort','source','compare','prepare','history'].map(x=>button(x==='cohort'?'DAG cohort':x==='source'?'Complete source':x==='compare'?'Later handover':x==='prepare'?'Prepare Installation':'Saved history','view','data-view="'+x+'"')).join('')+'</nav>';
   if(view==='cohort')body+=field('Find DAG, logical date or run','filter',filter,'search')+
    table(['Original DAG and edition','Observed native coverage','Included','Edition role','Purpose or exclusion reason'],matching.map(({r,i})=>{
     const d=c.selection.cohort[i],ref=r.reference;
     return ['<strong>'+esc(ref.dagId)+'</strong><br>Logical date '+esc(ref.logicalDate)+'<br>Run '+esc(ref.airflowRunId??'Not bound')+
      '<br>Edition <code>'+esc(ref.editionId)+'</code><br>'+button('Read complete original review','member','data-path="'+esc(r.memberPath)+'"'),
      (r.complete?'Complete saved source':'Source has unresolved coverage')+'<br>Namespace '+esc(r.namespace)+'<br>Session '+esc(r.sessionId)+
       '<details><summary>Full native plan, tasks and observations</summary><pre>'+esc(json(r))+'</pre></details>',
      '<input type="checkbox" aria-label="Include '+esc(ref.dagId+' '+ref.logicalDate)+'" data-af-row="'+i+'" data-af-key="included"'+(d.included?' checked':'')+'>',
      '<select aria-label="Role for '+esc(ref.dagId+' '+ref.logicalDate)+'" data-af-row="'+i+'" data-af-key="role">'+['unassigned','baseline','corrected','following','other'].map(v=>'<option'+(v===d.role?' selected':'')+'>'+v+'</option>').join('')+'</select>',
      '<textarea rows="3" maxlength="4000" aria-label="Purpose for '+esc(ref.dagId+' '+ref.logicalDate)+'" data-af-row="'+i+'" data-af-key="purpose">'+esc(d.purpose)+'</textarea>'];
    }));
   if(view==='source')body+='<p>Every original package member is retained. Text paging uses Unicode characters; downloads retain original bytes.</p>'+
    select('Complete original member','memberPath',memberPath,[['','Select source member'],...c.source.report.members.map(x=>[x.path,x.path+' · '+x.bytes+' B'])])+
    '<div class="af-actions">'+button('Read member','member-open')+button('Download complete member','member-download')+'</div>'+
    (pageFile?'<p><code>'+esc(pageFile.path)+'</code> · '+pageFile.bytes+' B · '+esc(pageFile.sha256)+'</p>':'')+
    '<pre class="af-source">'+esc(pageText)+'</pre>'+ (pageNext!==null?button('Read next complete page','page'):'');
   if(view==='compare'){
    const cmp=c.comparison;
    body+=select('Later complete attached handover','sourceId',sourceId,sources)+button('Compare full later edition','compare')+
     (cmp?'<p>Incoming source <code>'+esc(cmp.source.metadata.sha256)+'</code>. Every changed/added/removed record needs an explicit choice. The earlier full copy is retained in history.</p>'+
      table(['Record','Source movement','Earlier decision','Carry-forward choice'],cmp.rows.map((r,i)=>[
       esc(r.key),esc(r.state)+'<br>'+esc(r.before?.reference.reviewSha256??'Absent')+'<br>→ '+esc(r.after?.reference.reviewSha256??'Absent'),
       r.decision?esc((r.decision.included?'Included':'Excluded')+' · '+r.decision.role+' · '+r.decision.purpose):'New record',
       '<select data-af-choice="'+i+'" aria-label="Choice for '+esc(r.key)+'">'+[['','Select explicit choice'],...(r.state==='REMOVED'?[['ACK_REMOVED','Acknowledge removed source']]:r.state==='ADDED'?[['RESET','Prepare new decision']]:r.state==='UNCHANGED'?[['KEEP','Keep unchanged decision']]:[['KEEP','Carry previous decision to this changed record'],['RESET','Prepare new decision']])].map(([v,l])=>'<option value="'+v+'"'+(r.choice===v?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select>']))+
      '<details><summary>Complete original member comparison ('+cmp.members.length+')</summary>'+table(['Member','Movement','Before / after bytes'],cmp.members.map(m=>[esc(m.path),esc(m.state),esc(m.before?.bytes??'Absent')+' / '+esc(m.after?.bytes??'Absent')]))+'</details>'+
      button('Apply all reviewed source choices','compare-apply'):'');
   }
   if(view==='prepare'){
    body+='<p>First receive the complete commercial Workshare in the original Installation editor. This prepares a new planned Installation; operated checks stay in their saved original edition.</p>'+
      button('Receive complete current Workshare draft','template')+
      (c.bindings?'<div class="af-fields">'+[['source.reference','Actual source edition / reference'],['source.authority','Source-use authority'],['receiving.host','Receiving host'],['receiving.operator','Receiving engineer']].map(([k,l])=>{const [s,f]=k.split('.');return '<label>'+esc(l)+'<textarea rows="2" data-af-binding="'+k+'" maxlength="4000">'+esc(c.bindings[s][f])+'</textarea></label>';}).join('')+'</div>'+
      '<details><summary>Complete preserved commercial document and technical bindings</summary><pre>'+esc(json({document:c.document,bindings:c.bindings}))+'</pre></details>'+
      '<div class="af-actions">'+button('Attach exact reviewed cohort','attach')+button('Prepare complete native Installation','prepare')+'</div>':'')+
      (c.cohortAttachment?'<p>Original cohort source <code>'+esc(c.cohortAttachment.id)+'</code> · '+esc(c.cohortAttachment.sha256)+'</p>':'')+
      (c.prepared?'<h4>Complete preparation</h4><p>Case version '+c.prepared.scope.version+'. Review the full original fields and remaining selections below.</p><pre>'+esc(json(c.prepared.result.prepared))+'</pre>'+
        '<details><summary>Whole source cohort and original native preview</summary><pre>'+esc(json({snapshot:c.prepared.result.snapshot,preview:c.prepared.result.nativePreview}))+'</pre></details>'+
        button('Open complete prepared Installation draft','receive')+button('Download complete preparation','prepared-download'):'');
   }
   if(view==='history')body+=table(['Saved checkpoint','Time','Full edition'],c.history.map((h,i)=>[esc(h.label),esc(h.at),button('Open as complete separate copy','history-open','data-index="'+i+'"')+'<br><code>'+esc(h.sha256)+'</code>']));
  }
  root.innerHTML='<header><div><h3>Airflow source and Installation</h3><p>Original case '+esc(scope.caseId)+' · current version '+context.version+'</p></div>'+button('Close source desk','close')+'</header>'+
   '<p role="'+(error?'alert':'status')+'" class="af-status">'+esc(error||notice)+'</p>'+
   (dirty?'<p>Current changes are awaiting a complete browser save.</p>':'')+
   (conflict?'<section class="af-warning"><h4>Another tab changed these working copies</h4><p>Your entire current work is still on this page. Download it before opening the other tab’s saved store, or keep it as a separate fork.</p>'+button('Download full current alternatives','download-conflict')+button('Reload saved store after preserving current work','store-reload')+button('Preserve current work as a new fork','conflict-fork')+'</section>':'')+
   (c?.pending?'<section class="af-warning"><h4>Original source attachment request retained</h4><code>'+esc(c.pending.body.requestId)+'</code><p>Recover this exact original request. A different edit does not replace it.</p>'+button('Recover original attachment','recover')+'</section>':'')+
   '<div class="af-layout"><aside><h4>Receive original Airflow handover</h4><p>Complete original JSON, up to128 MiB. Its original request and source stay in this case.</p>'+button('Choose complete Airflow file','intake-choose')+'<input type="file" data-af-source-file hidden accept=".json,application/json">'+intake+'<h4>Complete working copies</h4>'+list+'<h4>New original source</h4>'+select('Attached full handover','sourceId',sourceId,sources)+field('New copy name','name',name)+button('Inspect and open complete source','new')+button('Receive complete working-copy archive','import')+button('Receive conflicting copies as alternatives','import-fork')+'<input type="file" data-af-import hidden accept=".json,application/json"></aside><main>'+body+'</main></div>';
  controls();
 }
 async function run(fn){
  if(!alive||busy||hostBusy)return;busy=true;error='';controls();
  try{clearTimeout(saveTimer);capture();await saveChain.catch(()=>{});await fn();}
  catch(e){error=e.message||String(e);}
  finally{busy=false;render();}
 }
 async function request(action,c,extra={}){
  const context=host.context();
  const result=await host.api(prefix+'/airflow/'+action,{expectedVersion:context.version,sourceId:c.source.metadata.id,expectedSourceSha256:c.source.metadata.sha256,...extra});
  need(result.scope.caseId===scope.caseId&&result.scope.version===context.version&&result.source.sha256===c.source.metadata.sha256,'The original case/source response changed identity.');
  return result;
 }
 async function readSource(id){
  await host.refreshCase();const m=textSource(id);need(m,'Select an original handover attached to this case.');
  const original=await host.api(prefix+'/sources/'+id,undefined,{download:true}),raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await original.arrayBuffer());
  const probe={source:{metadata:m}},result=await request('inspect',probe);
  return sourceOriginal(m,raw,result.result);
 }
 async function verify(){
  const c=current();need(c,'Open a complete working copy first.');const actual=await readSource(c.source.metadata.id);
  need(actual.metadata.sha256===c.source.metadata.sha256&&actual.raw===c.source.raw&&same(actual.report,c.source.report),'The retained working source/report differs from the actual original case. Keep this file and reopen the original source.');
  sourceVerified=true;
 }
 async function readMember(path,offset=0){
  const c=current();need(c,'Open a complete source.');await verify();const result=await request('member',c,{path,offset,limit:16000});
  memberPath=path;pageFile=result.result.file;pageOffset=offset;
  if(result.result.encoding==='utf8'){pageText=result.result.text;pageNext=result.result.nextOffset;}
  else {pageText='This is a complete binary member. Download it from its original retained bytes.';pageNext=null;}
  view='source';
 }
 async function recoverIntake(id){
  const item=(state.intakes||[]).find(x=>x.id===id);need(item,'Select the complete original intake.');validateIntake(item);
  need(item.scope.caseId===scope.caseId&&item.scope.planId===scope.planId&&item.scope.createdAt===scope.createdAt,'This retained intake belongs to another original case.');
  if(item.state==='COMMITTED'){sourceId=item.result.recordId;await host.refreshCase();notice='The original intake is committed. Open its retained source.';return;}
  need(item.state==='PREPARED','Keep the rejected original request and prepare a new guarded attempt explicitly.');
  try{
   const result=await host.saveApi(prefix+'/airflow-source',item.body);
   item.state='COMMITTED';item.result=clone(result);item.completedAt=at();await persist();
  }catch(e){
   if([400,409,413,415,422].includes(e.status)&&typeof e.code==='string'){item.state='REJECTED';item.error={code:e.code,message:e.message};item.rejectedAt=at();await persist();}
   throw e;
  }
  sourceId=item.result.recordId;await host.refreshCase();
  const meta=textSource(sourceId);need(meta&&meta.bytes===item.identity.bytes&&meta.sha256===item.identity.sha256,'Read back the exact original Airflow attachment before opening it.');
  notice='The complete original Airflow source was retained in this case. Open a named working copy.';
 }
 async function prepareIntake(raw,filename){
  need(!current()?.pending&&!(state.intakes||[]).some(x=>x.state==='PREPARED'),'Recover the already retained original source command first.');
  const actual=identity(raw);need(actual.bytes>0&&actual.bytes<=MAX_SOURCE,'Receive the complete original file within128 MiB.');
  need(JSON.parse(raw.replace(/^\uFEFF/,''))?.schema==='commons.openlineage.airflow-handover.v1','Select a complete original Airflow handover JSON.');
  await host.refreshCase();
  const existing=sourceRows().find(x=>x.sha256===actual.sha256&&x.bytes===actual.bytes&&x.airflowHandover);
  if(existing){sourceId=existing.id;notice='This exact full Airflow handover is already attached to the case.';return;}
  const item={id:crypto.randomUUID(),scope:clone(scope),raw,identity:actual,state:'PREPARED',createdAt:at(),
   body:{requestId:crypto.randomUUID(),expectedVersion:host.context().version,actor:host.recordingActor(),action:'airflow-source.add',
    note:'Retain complete original Airflow commissioning handover',data:{filename,mediaType:'application/json',kind:'deployment',
     sourceUrl:'',observedAt:at(),expectedSha256:actual.sha256,contentBase64:base64(raw)}}};
  validateIntake(item);const next=[...(state.intakes||[]),item];archive(state.copies,state.selected,next);
  await publishCandidate({copies:state.copies,selected:state.selected,intakes:next});await recoverIntake(item.id);
 }
 async function recover(){
  const c=current(),p=c?.pending;need(c,'Open the original complete working copy.');validateCopy(c);need(p,'Select the retained original attachment request.');
  let result;
  try{result=await host.saveApi(prefix+'/command',p.body);}
  catch(e){
   if([400,409,413,415,422].includes(e.status)&&typeof e.code==='string'){
    c.rejected={body:clone(p.body),error:{code:e.code,message:e.message},at:at()};c.pending=null;await persist();
   }throw e;
  }
  c.pending=null;c.attachedReceipt={body:clone(p.body),result:clone(result)};await persist();
  await host.refreshCase();const meta=textSource(result.recordId);
  need(meta&&meta.sha256===p.identity.sha256&&meta.bytes===p.identity.bytes,'Recover the original complete cohort source receipt from this case.');
  c.cohortAttachment=clone(meta);c.prepared=null;await persist();notice='The exact selected cohort is retained in the original case.';
 }
 async function attach(){
  const c=current();need(c?.bindings,'Receive the original commercial draft first.');await verify();const raw=completeSelection(c),id=identity(raw);
  await host.refreshCase();const existing=sourceRows().find(m=>m.sha256===id.sha256&&m.bytes===id.bytes);
  if(existing){c.cohortAttachment=clone(existing);c.prepared=null;await persist();notice='Reused this exact original cohort attachment.';return;}
  const body={requestId:crypto.randomUUID(),expectedVersion:host.context().version,actor:host.recordingActor(),
   action:'source.add',note:'Retain complete reviewed Airflow DAG cohort',data:{filename:'Airflow_Selected_Cohort.json',mediaType:'application/json',kind:'deployment',contentBase64:base64(raw),observedAt:at()}};
  const next=clone(c);next.pending={body,identity:id,raw};await publishCopy(next);await recover();
 }
 async function template(){
  const c=current();need(c,'Open the complete original Airflow source.');await verify();const target=host.currentDraft();
  need(target&&!target.installationId&&target.expectedRevision===0&&target.document.workshare,'Receive a new complete commercial Workshare draft in the original Installation editor first.');
  const result=await request('template',c,{document:target.document});
  const next=clone(c);next.document=clone(target.document);next.bindings=result.result.bindings;next.prepared=null;await publishCopy(next);notice='Original commercial terms, checks and funded assignment retained in full.';
 }
 async function prepare(){
  const c=current();need(c?.document&&c.bindings&&c.cohortAttachment,'Receive the Workshare and attach the exact complete cohort first.');await verify();
  const raw=completeSelection(c),id=identity(raw);need(id.sha256===c.cohortAttachment.sha256,'The decisions changed after attachment. Retain the new exact cohort first.');
  const fresh=await request('template',c,{document:c.document});
  // Only the original case selection advances after attachment; every authored binding stays.
  const bindings={...clone(c.bindings),selection:fresh.result.bindings.selection};
  const result=await request('prepare',c,{document:c.document,bindings,cohortSourceId:c.cohortAttachment.id,expectedCohortSha256:id.sha256});
  const next=clone(c);next.bindings=bindings;next.prepared=result;await publishCopy(next);notice='The complete native Installation preview is retained. Open it in the original editor to review and save.';
 }
 root.addEventListener('input',e=>{
  if(e.target.matches('[data-af-field="filter"]')){filter=e.target.value;return;}
  if(e.target.matches('[data-af-field="sourceId"]'))sourceId=e.target.value;
  if(e.target.matches('[data-af-field="name"]'))name=e.target.value;
  if(e.target.matches('[data-af-row],[data-af-binding],[data-af-field="copyName"],[data-af-field="notes"]')){
   const c=current();capture();if(c){c.prepared=null;if(e.target.matches('[data-af-row]'))c.comparison=null;}changed();
  }
 });
 root.addEventListener('change',e=>{
  if(e.target.matches('[data-af-field="filter"]')){filter=e.target.value;render();}
  if(e.target.matches('[data-af-field="sourceId"]'))sourceId=e.target.value;
  if(e.target.matches('[data-af-field="memberPath"]'))memberPath=e.target.value;
  if(e.target.matches('[data-af-choice]')){current().comparison.rows[Number(e.target.dataset.afChoice)].choice=e.target.value;changed();}
  if(e.target.matches('[data-af-source-file]')&&e.target.files[0])run(async()=>{
   const file=e.target.files[0];need(file.size>0&&file.size<=MAX_SOURCE,'Receive the whole Airflow file within128 MiB.');
   const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());await prepareIntake(raw,file.name);
  });
  if(e.target.matches('[data-af-import]')&&e.target.files[0])run(async()=>{
   need(e.target.files[0].size<=MAX_ARCHIVE,'Receive the complete working-copy archive within 512 MiB.');
   const incoming=validateArchive(await e.target.files[0].text());
   for(const c of incoming.copies)need(c.scope.caseId===scope.caseId&&c.scope.planId===scope.planId,'These original working copies belong to another case. Open their original complete Operations case before editing.');
   for(const item of incoming.intakes||[])need(item.scope.caseId===scope.caseId&&item.scope.planId===scope.planId&&item.scope.createdAt===scope.createdAt,'Retained intakes belong to their original complete case.');
   const copies=mergeCopies(state.copies,incoming.copies,{forkConflict:importFork}),intakes=mergeIntakes(state.intakes||[],incoming.intakes||[]);
   await publishCandidate({copies,selected:state.selected,intakes});notice='Received every complete source, draft, history and original request.';sourceVerified=false;
  });
 });
 root.addEventListener('click',e=>{
  const target=e.target.closest('[data-af-action]');if(!target||target.disabled)return;
  const action=target.dataset.afAction;
  if(action==='intake-choose'){$('[data-af-source-file]').value='';$('[data-af-source-file]').click();return;}
  if(action==='import'||action==='import-fork'){importFork=action==='import-fork';$('[data-af-import]').value='';$('[data-af-import]').click();return;}
  run(async()=>{
   const c=current();
   if(action==='intake-recover')return recoverIntake(target.dataset.id);
   if(action==='intake-retry'){const item=state.intakes.find(x=>x.id===target.dataset.id);need(item?.state==='REJECTED','Select the retained no-effect rejection.');return prepareIntake(item.raw,item.body.data.filename);}
   if(action==='intake-open'){const item=state.intakes.find(x=>x.id===target.dataset.id);need(item?.state==='COMMITTED','Select a committed complete intake.');sourceId=item.result.recordId;const source=await readSource(sourceId);
    const copy=newCopy({id:crypto.randomUUID(),name:item.body.data.filename,scope,source,at:at()});const copies=[...state.copies,copy];await publishCandidate({copies,selected:copy.id,intakes:state.intakes||[]});sourceVerified=true;view='cohort';return;}
   if(action==='close'){if(!conflict&&dirty)await persist();root.hidden=true;opened=false;host.close?.();return;}
   if(action==='download'||action==='download-conflict'){download(archive(state.copies,state.selected,state.intakes||[]),'Airflow_Complete_Working_Copies.json');notice='Complete working copies downloaded.';return;}
   if(action==='store-reload'){need(conflict,'The saved store is already current.');download(archive(state.copies,state.selected,state.intakes||[]),'Airflow_Unmerged_Working_Copies.json');const saved=await store.read();archive(saved.copies,saved.selected,saved.intakes||[]);state=saved;conflict=false;dirty=false;sourceVerified=false;return;}
   if(action==='conflict-fork'){
    const alternatives=clone(state.copies),intakeAlternatives=clone(state.intakes||[]),saved=await store.read();
    const copies=clone(saved.copies),intakes=mergeIntakes(saved.intakes||[],intakeAlternatives);
    let selected=saved.selected;
    for(const old of alternatives){const original=copies.find(x=>x.id===old.id);if(original&&same(original,old)){if(old.id===state.selected)selected=old.id;continue;}const priorId=old.id;old.id=crypto.randomUUID();old.name+=' · recovered tab';copies.push(old);if(priorId===state.selected)selected=old.id;}
    await publishCandidate({copies,selected,intakes},{expectedRevision:saved.revision,resolveConflict:true});notice='Preserved all current-tab alternatives as distinct complete copies.';return;
   }
   if(action==='new'){
    const s=await readSource(sourceId),copy=newCopy({id:crypto.randomUUID(),name:name||s.metadata.filename,scope,source:s,at:at()});
    await publishCandidate({copies:[...state.copies,copy],selected:copy.id,intakes:state.intakes||[]});sourceVerified=true;view='cohort';return;
   }
   if(action==='copy-open'){if(dirty&&!conflict)await persist();state.selected=target.dataset.id;sourceVerified=false;pageText='';pageNext=null;view='cohort';await persist();return;}
   if(action==='verify'){await verify();notice='The complete original handover and every native cohort record were verified.';return;}
   if(action==='view'){view=target.dataset.view;if(dirty&&!conflict)await persist();return;}
   if(action==='checkpoint'){await publishCopy(checkpoint(c,'Named source review',at()));notice='Complete source, decisions and unfinished fields checkpointed.';return;}
   if(action==='fork'){const next=checkpoint(c,'Original complete fork basis',at());next.id=crypto.randomUUID();next.name+=' · fork';await publishCandidate({copies:[...state.copies,next],selected:next.id,intakes:state.intakes||[]});return;}
   if(action==='source-download'){download(c.source.raw,c.source.metadata.filename);return;}
   if(action==='selection-download'){download(json(c.selection)+'\n','Airflow_Selected_Cohort.json');return;}
   if(action==='member'||action==='member-open'){return readMember(target.dataset.path||memberPath);}
   if(action==='page'){need(pageNext!==null,'The whole member has been read.');return readMember(memberPath,pageNext);}
   if(action==='member-download'){
    await verify();need(memberPath,'Select the original member.');
    const selected=c.source.report.members.find(x=>x.path===memberPath);need(selected,'The member is absent.');
    let offset=0,encoding=null,text='',total=0;const chunks=[];
    do{
     const out=(await request('member',c,{path:memberPath,offset,limit:32000})).result;
     need(same(out.file,{...selected})||out.file.path===selected.path&&out.file.bytes===selected.bytes&&out.file.sha256===selected.sha256,'The original member changed while reading.');
     need(out.offset===offset&&out.end>=offset&&out.end<=out.total&&['utf8','base64'].includes(out.encoding),'The complete source page has an invalid range.');
     need(encoding===null||encoding===out.encoding,'The original member changed its encoding.');encoding=out.encoding;
     if(encoding==='utf8'){need(typeof out.text==='string'&&Array.from(out.text).length===out.end-offset,'The source page omitted text.');text+=out.text;}
     else{const chunk=Uint8Array.from(atob(out.base64),x=>x.charCodeAt(0));need(chunk.length===out.end-offset,'The source page omitted bytes.');chunks.push(chunk);total+=chunk.length;}
     need(out.nextOffset===null?out.end===out.total:out.nextOffset===out.end&&out.end>offset,'The original member pagination is incomplete.');
     offset=out.nextOffset;
    }while(offset!==null);
    let bytes;if(encoding==='utf8')bytes=new TextEncoder().encode(text);else{bytes=new Uint8Array(total);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}}
    need(bytes.length===selected.bytes&&hashBytes(bytes)===selected.sha256,'The complete downloaded member differs from the original file.');
    download(new Blob([bytes]),selected.path.split('/').at(-1),'application/octet-stream');notice='Complete original member received and its bytes verified.';return;
   }
   if(action==='compare'){const source=await readSource(sourceId),next=clone(c);next.comparison=compareEdition(c,source);await publishCopy(next);return;}
   if(action==='compare-apply'){await publishCopy(applyComparison(c,at()));sourceVerified=true;view='cohort';return;}
   if(action==='history-open'){const saved=c.history[Number(target.dataset.index)];need(saved,'Select a retained whole checkpoint.');const next=clone(saved.snapshot);next.history=[];next.id=crypto.randomUUID();next.name+=' · restored '+(Number(target.dataset.index)+1);await publishCandidate({copies:[...state.copies,next],selected:next.id,intakes:state.intakes||[]});sourceVerified=false;view='cohort';return;}
   if(action==='template')return template();
   if(action==='attach')return attach();
   if(action==='recover')return recover();
   if(action==='prepare')return prepare();
   if(action==='prepared-download'){need(c.prepared,'Prepare the original Installation first.');download(json(c.prepared)+'\n','Airflow_Complete_Installation_Preparation.json');return;}
   if(action==='receive'){
    await prepare();const preparedCopy=current();need(preparedCopy.prepared,'Prepare the complete original Installation first.');await host.refreshCase();
    need(preparedCopy.prepared.scope.version===host.context().version,'The original case changed. Prepare the selected cohort against its fresh source.');
    const result=await host.receiveDraft(preparedCopy.prepared);
    need(result.applied,result.message||'Retain this full preparation and reopen the original Installation editor.');
    const next=clone(preparedCopy);next.lastReceived={at:at(),draftKey:result.draftKey,preparation:clone(preparedCopy.prepared)};await publishCopy(next);notice='The complete prepared Installation is open in its original review/save editor.';return;
   }
  });
 });
 const ready=(async()=>{store=await openStore(staffDeskStorageKey('sf47.airflow.'+scope.caseId+'.'+scope.planId+'.'+scope.createdAt));state=await store.read();state.intakes??=[];archive(state.copies,state.selected,state.intakes);})();
 return {ready,async open(){await ready;opened=true;root.hidden=false;render();root.scrollIntoView({block:'start'});},
 setHostBusy(value){hostBusy=!!value;controls();},refresh(){if(opened&&!busy)render();},
 async flush(){capture();clearTimeout(saveTimer);if(dirty)await persist();},
 dispose(){capture();clearTimeout(saveTimer);if(dirty&&!conflict)persist().catch(()=>{});alive=false;saveChain.finally(()=>store?.close());}};
}
