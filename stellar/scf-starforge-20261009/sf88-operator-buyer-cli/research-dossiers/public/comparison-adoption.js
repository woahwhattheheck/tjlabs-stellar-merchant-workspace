// SPDX-License-Identifier: MIT
// Explicit returned-comparison adoption; original foreign history is never edited.
import {openAdoptionWorkingStore,ADOPTION_DRAFT,ADOPTION_WORKING_COPY,adoptionSame,adoptionPrefix,adoptionProposal} from './comparison-adoption-store.js';

const LIMIT=64*1024*1024,FILE_LIMIT=256*1024*1024,PAGE=25;
const clone=x=>structuredClone(x),json=x=>JSON.stringify(x,null,2)+'\n';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const option=(value,label)=>{const n=node('option',label);n.value=value;return n;};
const need=(ok,message)=>{if(!ok)throw Error(message);};
const sha=async body=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(x=>x.toString(16).padStart(2,'0')).join('');
const bodyBytes=x=>new TextEncoder().encode(json(x));
const detail=(label,value)=>{const d=node('details'),body=node('div');d.append(node('summary',label),body);d.addEventListener('toggle',()=>{body.replaceChildren();if(d.open)body.append(node('pre',json(value)));});return d;};
const card=(title,...children)=>{const n=node('section',undefined,'adoption-card');n.append(node('h3',title),...children);return n;};
const group=(...children)=>{const n=node('div',undefined,'adoption-grid');n.append(...children);return n;};
const download=(body,filename,type='application/json')=>{const url=URL.createObjectURL(new Blob([body],{type})),a=node('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
function field(label,value,change,{options=null,area=false,disabled=false}={}){
  const l=node('label',undefined,'adoption-field'),e=node(options?'select':area?'textarea':'input');
  l.append(node('span',label));if(options)e.append(...options.map(x=>option(x[0],x[1])));else if(area)e.rows=4;else e.type='text';
  e.value=value??'';e.disabled=disabled;e.addEventListener(options?'change':'input',()=>change(e.value));l.append(e);return l;
}
function table(headers,rows){
  const wrap=node('div',undefined,'adoption-table');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',headers.join(', '));
  const t=node('table'),head=node('thead'),tr=node('tr');headers.forEach(h=>tr.append(node('th',h)));head.append(tr);const body=node('tbody');
  rows.forEach(cells=>{const row=node('tr');cells.forEach(value=>{const td=node('td');td.append(value instanceof Node?value:node('span',value??''));row.append(td);});body.append(row);});t.append(head,body);wrap.append(t);return wrap;
}
const title=r=>r?.definition?.title??r?.definition?.name??r?.definition?.criterionId??r?.title??r?.name??r?.versionId??r?.id??'Retained record';
const version=r=>r.versionId??r.id;
const selectionKey={candidates:'candidateVersionIds',runs:'runIds',judgments:'judgmentVersionIds',decisions:'decisionVersionIds'};
const sourceId=r=>r.id??r.sourceId;
const params=value=>{const q=new URLSearchParams();for(const [k,v]of Object.entries(value))if(v!==undefined&&v!==null)q.set(k,String(v));return'?'+q;};

export function createComparisonAdoptionPanel({api,task,notify,getSelection,getRevision,getDossier,isBusy=()=>false,onReceived,openReturnedWork}){
  let root=null,visible=false,currentOwner=null,epoch=0;
  const owners=new Map();
  const sameContext=(a,b)=>a?.workspaceId===b?.workspaceId&&a?.dossierId===b?.dossierId;
  function ownerFor(context){
    const key=JSON.stringify(context);let o=owners.get(key);
    if(!o){o={context:clone(context),db:null,storePromise:null,drafts:new Map(),revisions:new Map(),records:new Map(),unwritten:new Map(),writer:Promise.resolve(),
      current:null,overview:null,browse:null,source:null,caseVersion:null,loaded:false,loadFlight:null,historyOffset:0,kind:'candidates',offset:0,search:'',busy:0,error:null,storageError:null};owners.set(key,o);}
    return o;
  }
  const active=o=>visible&&root&&o===currentOwner&&sameContext(o.context,getSelection());
  const db=o=>o.storePromise??=(openAdoptionWorkingStore(o.context).then(value=>(o.db=value,value)).catch(error=>{o.storePromise=null;throw error;}));
  const endpoint=(o,suffix='')=>'/api/dossiers/'+encodeURIComponent(o.context.dossierId)+'/comparison'+suffix;
  const call=(o,suffix,options={})=>api(endpoint(o,suffix),{...options,workspaceId:o.context.workspaceId,sourceProjection:'full'});
  const token=o=>({owner:o,epoch,root});
  const valid=t=>active(t.owner)&&t.epoch===epoch&&t.root===root;
  function error(o,e){o.error=e.message;if(active(o)){render();notify(e.message,'error');}}
  const button=(label,fn,o=currentOwner,options={})=>{const b=node('button',label);b.type='button';b.addEventListener('click',()=>run(o,fn,options));return b;};
  const displayButton=(label,fn)=>{const b=node('button',label);b.type='button';b.addEventListener('click',fn);return b;};
  function run(o,fn,{recoverWriter=false}={}){
    return task(async()=>{if(!active(o)||o.busy)return;o.busy++;updateBusy();try{if(recoverWriter)await o.writer.catch(()=>{});else await o.writer;await fn(o);o.error=null;}catch(e){error(o,e);throw e;}finally{o.busy--;if(active(o))render();updateBusy();}});
  }
  async function retained(o,id){
    if(!id)return null;if(o.records.has(id))return clone(o.records.get(id));
    const value=await(await db(o)).record(id);o.records.set(id,value);return clone(value);
  }
  async function keep(o,kind,value){
    const record=await(await db(o)).retain(kind,value);o.records.set(record.id,record);return record.id;
  }
  function setDraft(o,d){
    const value={...clone(d),commitId:crypto.randomUUID(),updatedAt:new Date().toISOString()};
    o.current=value;o.drafts.set(value.id,value);o.unwritten.set(value.id,value);
    const work=o.writer.catch(()=>{}).then(async()=>{
      const result=await(await db(o)).write(value,o.revisions.get(value.id)??0);
      o.revisions.set(value.id,result.revision);
      if(o.unwritten.get(value.id)?.commitId===value.commitId)o.unwritten.delete(value.id);
      if(!o.unwritten.size)o.storageError=null;
      return result;
    });
    o.writer=work;work.catch(e=>{o.storageError=e.message;if(active(o)){notify('The complete visible adoption work remains available to download or preserve separately: '+e.message,'error');updateBusy();}});
    return work;
  }
  function edit(o,fn){
    need(o.current&&!o.current.request&&!o.busy,'Reopen an editable adoption working copy first.');
    const d=clone(o.current);fn(d.form);d.proposal=null;d.preview=null;setDraft(o,d).catch(()=>{});updateBusy();
  }
  async function durable(o){
    await o.writer;need(o.current,'Choose an adoption working copy.');
    const saved=await(await db(o)).read(o.current.id);
    need(saved&&saved.snapshot.commitId===o.current.commitId&&adoptionSame(saved.snapshot,o.current),'This working copy changed in another tab. Refresh it or preserve the visible version separately.');
    need(!o.storageError,'Retain the complete visible work before submitting.');return clone(o.current);
  }
  async function loadDrafts(o){
    await o.writer;const rows=await(await db(o)).list();
    for(const row of rows)if(!o.unwritten.has(row.id)){
      o.drafts.set(row.id,row.snapshot);o.revisions.set(row.id,row.revision);
      if(o.current?.id===row.id){for(const id of row.snapshot.refs)await retained(o,id);o.current=clone(row.snapshot);}
    }
  }
  function checkPage(o,page,revision){
    need(page?.dossierId===o.context.dossierId&&Number.isSafeInteger(page.revision)&&Array.isArray(page.items),'The adoption inventory belongs to another dossier.');
    if(revision!==undefined)need(page.revision===revision,'The pinned author revision changed.');
  }
  async function overview(o,offset=0,revision){
    const value=await call(o,'/adoptions'+params({offset,limit:25,revision}));checkPage(o,value,revision);return value;
  }
  async function refresh(o){
    const serial=(o.refreshSerial??0)+1;o.refreshSerial=serial;
    const next=await overview(o,0);await loadDrafts(o);
    if(o.refreshSerial!==serial)return;o.overview=next;o.historyOffset=0;o.loaded=true;if(active(o))render();
  }
  async function sourcePages(o,{sourceId,revision,caseVersionId,section}){
    const items=[];let offset=0,first=null;
    do{
      const page=await call(o,'/adoption/source'+params({sourceId,revision,caseVersionId,section,offset,limit:200}));
      checkPage(o,page,revision);need(page.offset===offset,'The returned comparison page changed position.');
      need(sourceId===(page.source?.id??page.source?.sourceId),'The original returned source changed.');
      if(!first)first=page;else need(adoptionSame(page.source,first.source)&&adoptionSame(page.incomingHead,first.incomingHead)&&adoptionSame(page.ancestor,first.ancestor),'The original source generation changed between pages.');
      items.push(...page.items);const next=page.nextOffset;
      need(next===null||Number.isSafeInteger(next)&&next>offset,'The returned comparison page did not advance.');offset=next;
    }while(offset!==null);
    need(items.length===first.total,'The complete returned comparison inventory is missing records.');
    return{...first,items,offset:0,limit:items.length,nextOffset:null,complete:true};
  }
  async function browseSource(o){
    need(o.source,'Choose an original retained returned source.');
    const t=token(o),source=o.source,revision=o.overview?.revision??getRevision();
    const next=await sourcePages(o,{sourceId:source,revision,section:'cases'});
    if(!valid(t)||o.source!==source)return;o.browse=next;o.caseVersion=null;render();
  }
  async function inspectProtocol(o,selectedSource,caseVersionId,revision){
    const sections=['cases','candidates','runs','judgments','decisions','sources'],pages={};
    for(const section of sections)pages[section]=await sourcePages(o,{sourceId:selectedSource,caseVersionId:section==='cases'?undefined:caseVersionId,revision,section});
    const base=pages.candidates;
    for(const page of Object.values(pages))need(adoptionSame(page.source,base.source)&&adoptionSame(page.incomingHead,base.incomingHead),'The selected incoming history changed.');
    const incoming=pages.cases.items.find(x=>x.versionId===caseVersionId);
    need(incoming&&base.case?.versionId===caseVersionId,'The exact incoming protocol is missing.');
    return{schema:'sf88-comparison-adoption-browser-inspection/v1',dossierId:o.context.dossierId,revision,source:base.source,ancestor:base.ancestor,incomingHead:base.incomingHead,
      case:base.case,targets:base.targets,sourceBindings:base.sourceBindings,pages:Object.fromEntries(sections.map(key=>[key,pages[key].items]))};
  }
  function freshDraft(o,{inspectionId,inspection,continuationOf=null,previous=null}){
    const stamp=new Date().toISOString();
    return{schema:ADOPTION_DRAFT,id:adoptionPrefix(o.context)+'draft:'+crypto.randomUUID(),commitId:crypto.randomUUID(),...o.context,createdAt:stamp,updatedAt:stamp,
      basis:{revision:inspection.revision,sourceId:sourceId(inspection.source),sourceSha256:inspection.source.sha256,caseVersionId:inspection.case.versionId,incomingHead:inspection.incomingHead},
      inspection:inspectionId,refs:[inspectionId],form:{actor:clone(previous?.form.actor??{id:'',name:''}),reviewNote:'',
        continuationOf,selection:{candidateVersionIds:[],runIds:[],judgmentVersionIds:[],decisionVersionIds:[]},caseTarget:{mode:'NEW_CASE'},
        candidateTargets:inspection.pages.candidates.map(x=>({sourceVersionId:x.versionId,mode:'NEW'}))},
      proposal:null,preview:null,request:null,result:null,receipt:null,attempts:[],...(previous?{predecessor:previous.id}:{})};
  }
  async function startDraft(o){
    need(o.source&&o.caseVersion&&o.browse,'Choose and inspect an exact returned protocol.');
    const t=token(o),selectedSource=o.source,selectedVersion=o.caseVersion,revision=o.browse.revision;
    const inspected=await inspectProtocol(o,selectedSource,selectedVersion,revision);
    if(!valid(t)||o.source!==selectedSource||o.caseVersion!==selectedVersion)return;
    const id=await keep(o,'inspection',inspected);if(!valid(t))return;
    await setDraft(o,freshDraft(o,{inspectionId:id,inspection:inspected}));o.kind='candidates';o.offset=0;o.search='';render();
  }
  async function chooseDraft(o,id){
    await o.writer;if(!id){o.current=null;render();return;}
    const t=token(o),saved=await(await db(o)).read(id);need(saved,'The saved adoption working copy is missing.');
    const refs=await Promise.all(saved.snapshot.refs.map(ref=>retained(o,ref)));
    if(!valid(t))return;refs.forEach(r=>o.records.set(r.id,r));o.current=clone(saved.snapshot);o.revisions.set(id,saved.revision);o.drafts.set(id,saved.snapshot);
    o.kind='candidates';o.offset=0;o.search='';render();
  }
  function inputFor(d){return adoptionProposal(d,{requestId:crypto.randomUUID(),reviewedAt:new Date().toISOString()});}
  async function prepare(o){
    let d=await durable(o);need(!d.request,'The exact request is already frozen.');
    let proposal=d.proposal?(await retained(o,d.proposal)).value:null;
    if(!proposal){proposal=inputFor(d);const id=await keep(o,'proposal',proposal);await setDraft(o,{...d,proposal:id,refs:[...new Set([...d.refs,id])]});d=await durable(o);}
    const result=await call(o,'/adoption/preview',{method:'POST',body:proposal});
    need(result.dossierId===d.dossierId&&result.revision===proposal.expectedRevision&&result.plan&&adoptionSame(result.plan.request,proposal)&&typeof result.eligible==='boolean'&&Array.isArray(result.issues)&&(result.eligible?/^[a-f0-9]{64}$/.test(result.previewSha256??''):result.previewSha256===null),'The complete preview differs from its original request.');
    const id=await keep(o,'preview',result);const current=await durable(o);need(current.proposal===d.proposal,'The visible adoption proposal changed.');
    await setDraft(o,{...current,preview:id,refs:[...new Set([...current.refs,id])]});
  }
  async function freeze(o){
    const d=await durable(o);need(!d.request&&d.preview&&d.proposal,'Prepare the full adoption review first.');
    const preview=(await retained(o,d.preview)).value,proposal=(await retained(o,d.proposal)).value;
    need(preview.eligible&&adoptionSame(preview.plan.request,proposal),'Resolve every source, dependency and mapping finding first.');
    const request={...clone(proposal),previewSha256:preview.previewSha256},id=await keep(o,'request',request);
    await setDraft(o,{...d,request:id,refs:[...new Set([...d.refs,id])]});
  }
  async function event(o,entry){
    const d=await durable(o);await setDraft(o,{...d,attempts:[...d.attempts,{id:crypto.randomUUID(),at:new Date().toISOString(),...entry}]});
  }
  async function keepResult(o,result){
    const d=await durable(o),request=(await retained(o,d.request)).value;
    need(result.dossierId===d.dossierId&&result.requestId===request.requestId&&['COMPLETE','NEEDS_REVIEW','SUPERSEDED'].includes(result.status)&&result.plan&&result.plan.id===result.planId,
      'The adoption response belongs to another original request.');
    need(adoptionSame(result.plan.request,Object.fromEntries(Object.entries(request).filter(([key])=>key!=='previewSha256')))&&result.plan.previewSha256===request.previewSha256,'The returned adoption plan changed its original request.');
    const id=await keep(o,'result',result);
    await setDraft(o,{...d,result:id,receipt:result.status==='COMPLETE'?d.receipt??id:d.receipt,refs:[...new Set([...d.refs,id])]});
  }
  async function receive(o,dispatch=false){
    const d=await durable(o);need(d.request,'Freeze the complete original adoption request first.');const request=(await retained(o,d.request)).value;
    if(dispatch){
      await event(o,{kind:'DISPATCH_STARTED',requestId:request.requestId});
      try{const result=await call(o,'/adoption/reviews',{method:'POST',body:request});await keepResult(o,result);await event(o,{kind:'RESPONSE',requestId:request.requestId,status:result.status,planId:result.planId});}
      catch(e){await event(o,{kind:'DISPATCH_UNRESOLVED',requestId:request.requestId,code:e.code??e.message,status:e.status??null,details:e.details??null});throw e;}
    }else{
      const result=await call(o,'/adoption'+params({requestId:request.requestId}));
      need(result.dossierId===d.dossierId,'The original request lookup belongs to another dossier.');
      await event(o,{kind:'LOOKUP',requestId:request.requestId,found:Boolean(result.adoption),revision:result.revision});
      if(result.adoption)await keepResult(o,result.adoption);
      else notify('No saved original adoption is visible yet. The exact request remains frozen; Apply or receive uses that same request.','info');
    }
    const selected=clone(o.context),view=await api('/api/dossiers/'+encodeURIComponent(selected.dossierId),{workspaceId:selected.workspaceId,sourceProjection:'full'});
    if(active(o)){await onReceived(view);if(active(o))await refresh(o);}
  }
  async function continuation(o,selectedResult=null){
    const previous=selectedResult?null:await durable(o),saved=selectedResult??(previous?.result?(await retained(o,previous.result)).value:null);
    need(saved?.status==='NEEDS_REVIEW','Only an observed interrupted prefix awaiting review can create a continuation.');
    const t=token(o),lookup=await call(o,'/adoption'+params({planId:saved.planId})),result=lookup.adoption;
    need(result?.status==='NEEDS_REVIEW'&&result.planId===saved.planId,'Read the current adoption result before preparing its continuation.');
    const inspection=await inspectProtocol(o,result.plan.source.id,result.plan.case.versionId,lookup.revision);
    if(!valid(t))return;const id=await keep(o,'inspection',inspection),resultId=await keep(o,'result',result);
    const next=freshDraft(o,{inspectionId:id,inspection,continuationOf:result.planId,previous});
    const spec=result.plan.spec;next.form.selection=clone(spec.selection);next.form.caseTarget=clone(spec.caseTarget);next.form.candidateTargets=clone(spec.candidateTargets);
    next.form.actor=clone(previous?.form.actor??result.plan.request.actor);
    next.refs=[...new Set([...(previous?.refs??[]),id,resultId])];next.continuationSourceResult=resultId;
    if(!valid(t))return;await setDraft(o,next);notify('A separate continuation draft is selected at author revision '+lookup.revision+'. Review it explicitly before freezing; accepted source mappings remain with the original plan.','info');
  }
  async function revisedDraft(o){
    let previous=await durable(o);const t=token(o);
    if(previous.request){
      const request=(await retained(o,previous.request)).value,lookup=await call(o,'/adoption'+params({requestId:request.requestId}));
      need(lookup.dossierId===previous.dossierId&&!lookup.adoption&&lookup.revision>request.expectedRevision,
        'The frozen original request must remain recoverable. Look it up; only absence at a later immutable author revision establishes that its original compare-and-save can no longer commit.');
      await event(o,{kind:'ABSENT_AT_ADVANCED_HEAD',requestId:request.requestId,revision:lookup.revision});previous=await durable(o);
    }
    const head=await overview(o,0);
    const inspection=await inspectProtocol(o,previous.basis.sourceId,previous.basis.caseVersionId,head.revision);
    if(!valid(t))return;const id=await keep(o,'inspection',inspection),next=freshDraft(o,{inspectionId:id,inspection,previous});
    next.form=clone(previous.form);next.form.continuationOf=null;
    next.refs=[...new Set([...previous.refs,id])];
    if(!valid(t))return;await setDraft(o,next);
    notify('A separate editable working copy uses the newly inspected author revision. Recheck every target before preparing; the original draft and any frozen request remain unchanged.','info');
  }
  async function preserveSeparate(o){
    await o.writer.catch(()=>{});need(o.current,'No visible working copy.');
    const previous=clone(o.current),copy={...previous,id:adoptionPrefix(o.context)+'draft:'+crypto.randomUUID(),copiedFrom:{id:previous.id,commitId:previous.commitId}};
    await setDraft(o,copy);o.unwritten.delete(previous.id);o.storageError=null;
    notify('The complete visible work is retained separately. The other tab’s original working copy is preserved.','info');
  }
  async function downloadWorking(o){
    await o.writer.catch(()=>{});need(o.current,'Choose a working copy.');
    const value=await(await db(o)).workingCopy(o.current),body=json(value);need(bodyBytes(value).length<=LIMIT,'This complete working copy exceeds the supported browser transfer size.');
    download(body,'comparison-adoption-working-copy.json');
  }
  async function importWorking(o,file){
    need(file&&file.size<=LIMIT,'Choose a complete adoption working copy up to 64 MiB.');
    await o.writer;const t=token(o),commit=o.current?.commitId??null,body=await file.text();let value;
    try{value=JSON.parse(body);}catch{throw Error('Choose a complete saved adoption working-copy JSON file.');}
    need(valid(t)&&(o.current?.commitId??null)===commit,'The visible working copy changed while its file was being read. Import again after preserving the new work.');
    const database=await db(o);await database.inspectWorkingCopy(value);
    need(valid(t)&&(o.current?.commitId??null)===commit,'The selected adoption context changed during file verification.');
    const result=await database.importWorkingCopy(value);o.revisions.set(result.record.id,result.record.revision);o.drafts.set(result.record.id,result.record.snapshot);
    for(const ref of result.record.snapshot.refs)await retained(o,ref);
    if(valid(t)){o.current=clone(result.record.snapshot);notify(result.separate?'The incoming working copy is retained separately; the existing complete draft is unchanged.':'The complete original adoption working copy is reopened.','info');render();}
  }
  async function fileDownload(o,suffix,expected,name){
    const response=await call(o,suffix,{download:true}),declared=response.headers.get('Content-Length'),hash=response.headers.get('X-Content-SHA256');
    const pinned=new URLSearchParams(suffix.includes('?')?suffix.slice(suffix.indexOf('?')+1):'').get('revision');
    if(pinned!==null)need(response.headers.get('X-Research-Dossier-Revision')===pinned,'The downloaded report is not the selected immutable author revision.');
    need(declared!==null&&/^(0|[1-9][0-9]*)$/.test(declared)&&Number.isSafeInteger(Number(declared))&&Number(declared)<=FILE_LIMIT&&/^[a-f0-9]{64}$/.test(hash??''),'The complete original file descriptor is missing.');
    const size=Number(declared),buffer=new Uint8Array(size),reader=response.body?.getReader();need(reader,'The complete original file stream is unavailable.');let received=0,complete=false;try{for(;;){const part=await reader.read();if(part.done)break;need(received+part.value.byteLength<=size,'The downloaded file exceeds its declared original size.');buffer.set(part.value,received);received+=part.value.byteLength;}need(received===size,'The complete original file is truncated.');complete=true;}finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}const body=buffer.buffer;need(await sha(body)===hash,'The complete downloaded original file changed.');
    if(expected)need(expected.bytes===body.byteLength&&expected.sha256===hash,'The download differs from the selected original source member.');
    const disposition=response.headers.get('Content-Disposition')??'',encoded=/filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if(encoded){let actual;try{actual=decodeURIComponent(encoded[1]);}catch{}if(actual&&!/[/\\\u0000-\u001f\u007f]/.test(actual)&&actual.length<=512)name=actual;}
    download(body,name,response.headers.get('Content-Type')??'application/octet-stream');
  }

  function editField(o,label,value,change,options={}){
    const element=field(label,value,change,options);element.querySelector('input,select,textarea').dataset.adoptionEdit='';return element;
  }
  function inspectionFor(o){return o.current?.inspection?o.records.get(o.current.inspection)?.value:null;}
  function toggle(o,key,id,checked){
    edit(o,f=>{const values=new Set(f.selection[key]);if(checked)values.add(id);else values.delete(id);f.selection[key]=[...values];});render();
  }
  function includeDependencies(o,inspection){
    edit(o,f=>{
      const selected=Object.fromEntries(Object.entries(f.selection).map(([key,value])=>[key,new Set(value)]));
      for(const decision of inspection.pages.decisions)if(selected.decisionVersionIds.has(decision.versionId)){
        for(const id of decision.definition.candidateVersionIds)selected.candidateVersionIds.add(id);
        for(const id of decision.definition.runIds)selected.runIds.add(id);
        for(const id of decision.definition.judgmentVersionIds)selected.judgmentVersionIds.add(id);
      }
      for(const judgment of inspection.pages.judgments)if(selected.judgmentVersionIds.has(judgment.versionId)){
        selected.candidateVersionIds.add(judgment.definition.candidateVersionId);
        for(const id of judgment.definition.runIds)selected.runIds.add(id);
      }
      for(const run of inspection.pages.runs)if(selected.runIds.has(run.id))selected.candidateVersionIds.add(run.candidateVersionId);
      for(const [key,values]of Object.entries(selected))f.selection[key]=[...values];
    });render();
  }
  function sourceBindings(inspection){
    return card('Original question and source prerequisites',
      node('p','The original question and referenced source editions must match completely in the author’s dossier; the preview displays the original and current question texts. Use Returned work to review missing source material. This adoption never rewrites embedded source references.'),
      table(['Retained edition','Match','Original and current identity'],(inspection.sourceBindings??[]).map(x=>[x.editionId,x.status,detail('Original source binding',x)])),
      ...(openReturnedWork?[displayButton('Open Returned work review',()=>openReturnedWork())]:[]));
  }
  function targetForm(o,inspection){
    const d=o.current,f=d.form,targets=inspection.targets??{cases:[],protocols:[],candidates:[]};
    const mode=editField(o,'Author protocol destination',f.caseTarget.mode,value=>{
      edit(o,form=>{form.caseTarget={mode:value};form.candidateTargets=form.candidateTargets.map(x=>({sourceVersionId:x.sourceVersionId,mode:'NEW'}));});render();
    },{options:[['NEW_CASE','Create a new author comparison case'],['NEW_PROTOCOL','Create a protocol successor in an existing case'],['EXISTING','Use an exact existing author protocol']]});
    const controls=[mode];
    if(f.caseTarget.mode!=='NEW_CASE'){
      const candidates=f.caseTarget.mode==='NEW_PROTOCOL'?targets.cases:targets.protocols.filter(x=>adoptionSame(x.definition,inspection.case.definition));
      const current=f.caseTarget.caseVersionId??'';
      const opts=[['','Choose an explicit author protocol'],...candidates.map(x=>[x.versionId,title(x)+' · '+x.versionId])];
      if(current&&!opts.some(x=>x[0]===current))opts.push([current,'Saved target requiring review · '+current]);
      controls.push(editField(o,'Exact author protocol',current,value=>{
        const chosen=candidates.find(x=>x.versionId===value);
        edit(o,form=>{form.caseTarget=chosen?{mode:form.caseTarget.mode,caseId:chosen.id,caseVersionId:chosen.versionId}:{mode:form.caseTarget.mode};
          form.candidateTargets=form.candidateTargets.map(x=>({sourceVersionId:x.sourceVersionId,mode:'NEW'}));});render();
      },{options:opts}));
    }
    controls.push(node('p',f.caseTarget.mode==='NEW_PROTOCOL'?'The selected current case head is the explicit basis for its new protocol; a changed head requires a new review.':'Existing targets must have the complete same definition and correct protocol. No automatic matching is accepted.'));
    const selected=new Set(f.selection.candidateVersionIds);
    const rows=inspection.pages.candidates.filter(x=>selected.has(x.versionId)).map(source=>{
      const mapping=f.candidateTargets.find(x=>x.sourceVersionId===source.versionId)??{sourceVersionId:source.versionId,mode:'NEW'};
      const compatible=f.caseTarget.mode==='EXISTING'?targets.candidates.filter(x=>x.caseVersionId===f.caseTarget.caseVersionId&&adoptionSame(x.definition,source.definition)):[];
      const opts=[['NEW','Create a new author candidate'],...compatible.map(x=>[x.versionId,'Use exact '+title(x)+' · '+x.versionId])];
      if(mapping.mode==='EXISTING'&&!opts.some(x=>x[0]===mapping.targetVersionId))opts.push([mapping.targetVersionId,'Saved target requiring review · '+mapping.targetVersionId]);
      const selector=editField(o,'Destination for '+source.versionId,mapping.mode==='EXISTING'?mapping.targetVersionId:'NEW',value=>{
        edit(o,form=>{form.candidateTargets=form.candidateTargets.filter(x=>x.sourceVersionId!==source.versionId);form.candidateTargets.push(value==='NEW'?{sourceVersionId:source.versionId,mode:'NEW'}:{sourceVersionId:source.versionId,mode:'EXISTING',targetVersionId:value});});
      },{options:opts});
      return [title(source),source.versionId,selector,detail('Complete original candidate definition',source.definition)];
    });
    return card('Explicit author destinations',...controls,table(['Returned candidate','Original version','Author destination','Original content'],rows));
  }
  function records(o,inspection){
    const kind=o.kind,key=selectionKey[kind],all=inspection.pages[kind]??[],filter=o.search.trim().toLowerCase();
    const filtered=filter?all.filter(x=>JSON.stringify(x).toLowerCase().includes(filter)):all,offset=Math.min(o.offset,Math.max(0,Math.floor((filtered.length-1)/PAGE)*PAGE));
    o.offset=offset;const selected=new Set(o.current.form.selection[key]??[]);
    const picker=field('Returned record kind',kind,value=>{o.kind=value;o.offset=0;render();},{options:Object.keys(selectionKey).map(x=>[x,x])});
    const search=field('Search retained records',o.search,value=>{o.search=value;o.offset=0;const start=root.querySelector('[data-adoption-records]');if(start){start.replaceWith(records(o,inspection));updateBusy();}});
    const block=card('Select exact returned records',picker,search,node('p','Selection is explicit. The preview checks all recorded dependencies and source prerequisites before any author operation.'));
    block.dataset.adoptionRecords='';
    const rows=filtered.slice(offset,offset+PAGE).map(record=>{
      const id=version(record),label=node('label'),c=node('input');c.type='checkbox';c.checked=selected.has(id);c.dataset.adoptionEdit='';
      c.disabled=Boolean(o.current.request||o.current.form.continuationOf);c.setAttribute('aria-label','Select '+kind+' '+id);
      c.addEventListener('change',()=>toggle(o,key,id,c.checked));label.append(c,node('span','Include'));
      const actions=node('div',undefined,'adoption-actions');actions.append(detail('Complete retained record',record));
      if(kind==='runs'){
        actions.append(button('Download original run '+id,()=>fileDownload(o,'/adoption/file'+params({sourceId:o.current.basis.sourceId,runId:id,revision:o.current.basis.revision}),record.raw,'returned-run-'+id+'.json'),o));
        for(const a of record.artifacts??[])actions.append(button('Download '+a.path,()=>fileDownload(o,'/adoption/file'+params({sourceId:o.current.basis.sourceId,runId:id,artifactId:a.id,revision:o.current.basis.revision}),a,a.path.split('/').at(-1)),o));
      }
      const named=record.definition?.reviewer;return[label,title(record),id,named??record.kind??'',actions];
    });
    block.append(table(['Choose','Original label','Exact source version','Original reviewer or kind','Original details and files'],rows));
    const nav=node('div',undefined,'adoption-actions'),previous=displayButton('Previous returned records',()=>{o.offset=Math.max(0,offset-PAGE);render();}),next=displayButton('Next returned records',()=>{o.offset=offset+PAGE;render();});
    previous.disabled=offset===0;next.disabled=offset+PAGE>=filtered.length;
    nav.append(previous,node('span',(filtered.length?offset+1:0)+'–'+Math.min(offset+PAGE,filtered.length)+' of '+filtered.length+' matching records; '+all.length+' complete retained '+kind),next);block.append(nav);
    if(!o.current.request&&!o.current.form.continuationOf)block.append(displayButton('Include recorded dependencies of my selection',()=>includeDependencies(o,inspection)));
    block.append(detail('Complete explicit selected version IDs',o.current.form.selection));return block;
  }
  function previewView(o,value){
    const p=value.plan;
    return card('Complete adoption review',
      node('p',value.eligible?'Source, selection and mappings are eligible for the exact plan below.':'Resolve the listed source, dependency or mapping findings before freezing.'),
      table(['Finding','Original record or edition','Details'],(value.issues??[]).map(x=>[x.code,x.recordId??x.editionId??'',detail('Complete finding',x)])),
      table(['Step','Original record','Author action','Expected author revision','New or selected identity'],(p.steps??[]).map(x=>[x.index,x.sourceKind+' · '+x.sourceVersionId,x.action,x.expectedRevision,
        detail('Complete original step and mapping',x)])),
      detail('Original returned question',p.sourceQuestion),detail('Current author question',p.currentQuestion),
      detail('Complete original-to-author mapping',p.mappings),detail('Complete immutable plan and original request',p),
      node('p','Plan '+p.id+' · preview SHA256 '+value.previewSha256));
  }
  function resultView(o,result){
    const actions=node('div',undefined,'adoption-actions');
    for(const format of ['json','html','source'])actions.append(button('Download adoption '+(format==='source'?'original source':format.toUpperCase()),()=>fileDownload(o,
      '/adoption/export'+params({planId:result.planId,revision:result.revision,format}),format==='source'?result.plan.source:null,format==='source'?'returned-comparison-original.json':'comparison-adoption.'+format),o));
    return card('Original adoption result',
      node('p',result.status+' · '+result.progress.completed+' of '+result.progress.total+' native operations received · author revision '+result.revision),
      node('p','Plan '+result.planId+' · request '+result.requestId),
      ...(result.conflict?[node('p','The author advanced from expected revision '+result.conflict.expectedRevision+' to '+result.conflict.currentRevision+'. The accepted prefix remains retained; review a separate continuation before proceeding.','adoption-warning')]:[]),
      ...(result.successorPlanId?[node('p','Explicit successor plan '+result.successorPlanId)]:[]),
      table(['Native request','Action','Author revision','Retained original operation'],(result.progress.operations??[]).map(x=>[x.requestId,x.action,x.dossierRevision??x.revision,detail('Full native operation',x)])),
      detail('Complete accepted source mappings',result.progress.mappings),detail('Complete result and foreign source lineage',result),actions);
  }
  function draftView(o){
    const d=o.current;if(!d)return card('Adoption working copy',node('p','Inspect a retained returned source and start a review of its exact protocol, or reopen a saved working copy.'));
    const inspection=inspectionFor(o);if(!inspection)return card('Adoption working copy',node('p','Load the complete retained source inspection before editing.'));
    const form=card('Named adoption review',
      node('p','Original source '+d.basis.sourceId+' · incoming protocol '+d.basis.caseVersionId+' · author basis revision '+d.basis.revision),
      node('p','The accepting operator is recorded separately from the original contributor’s reviewers. Their original definitions, measured values and run files remain unchanged.'),
      group(editField(o,'Accepting operator identifier',d.form.actor.id,v=>edit(o,f=>{f.actor.id=v;})),
        editField(o,'Accepting operator name',d.form.actor.name,v=>edit(o,f=>{f.actor.name=v;}))),
      editField(o,'Adoption review note',d.form.reviewNote,v=>edit(o,f=>{f.reviewNote=v;}),{area:true}),
      detail('Complete original source, ancestor and protocol',{source:inspection.source,ancestor:inspection.ancestor,incomingHead:inspection.incomingHead,case:inspection.case}));
    if(d.form.continuationOf)form.append(node('p','Explicit continuation of '+d.form.continuationOf+'. Source selections and accepted mappings are inherited; only remaining native operations are replanned.','adoption-warning'));
    const content=node('div',undefined,'adoption-work');content.append(form,sourceBindings(inspection),records(o,inspection));
    if(!d.form.continuationOf)content.append(targetForm(o,inspection));
    const controls=node('div',undefined,'adoption-actions');
    if(!d.request){
      controls.append(button('Prepare complete adoption review',()=>prepare(o),o));
      const preview=d.preview?o.records.get(d.preview)?.value:null;
      if(preview){content.append(previewView(o,preview));const freezeButton=button('Freeze this exact adoption request',()=>freeze(o),o);freezeButton.disabled=!preview.eligible;controls.append(freezeButton);}
    }else{
      const request=o.records.get(d.request)?.value;
      content.append(card('Frozen original request',node('p','Retry and lookup preserve this complete request ID, source selection, author revision and preview hash.'),detail('Complete exact saved adoption request',request)));
      controls.append(button('Apply or receive original adoption',()=>receive(o,true),o),button('Look up original adoption result',()=>receive(o,false),o));
    }
    controls.append(button('Download complete adoption working copy',()=>downloadWorking(o),o,{recoverWriter:true}));
    if(!d.form.continuationOf&&(!d.request||d.attempts.some(x=>x.kind==='LOOKUP'&&!x.found&&x.revision>d.basis.revision)))controls.append(button('Inspect current author basis in a separate draft',()=>revisedDraft(o),o));
    if(o.storageError)controls.append(button('Preserve visible adoption work separately',()=>preserveSeparate(o),o,{recoverWriter:true}));
    content.append(controls);
    const result=d.result?o.records.get(d.result)?.value:null;
    if(result){content.append(resultView(o,result));if(result.status==='NEEDS_REVIEW')content.append(button('Review a separate continuation',()=>continuation(o),o));}
    if(d.attempts.length)content.append(detail('Complete request attempts and observations',d.attempts));
    return content;
  }
  async function readHistory(o,item){
    const t=token(o),result=await call(o,'/adoption'+params({planId:item.planId??item.id,revision:o.overview.revision}));
    need(result.adoption,'The retained adoption result is missing.');if(valid(t)){o.historyResult=result.adoption;render();}
  }
  function render(){
    const o=currentOwner;if(!active(o))return;root.replaceChildren();root.className='comparison-adoption';
    root.append(node('h2','Adopt returned comparison work'),node('p','Review selected returned records and create ordinary author-side comparison operations. The complete foreign branch, original reviewers, run bytes and measured values remain intact.'));
    if(o.error)root.append(node('p',o.error,'adoption-error'));
    if(o.storageError)root.append(node('p','Browser storage could not retain the last change. Download the complete visible working copy or preserve it separately before leaving. '+o.storageError,'adoption-error'));
    const controls=node('div',undefined,'adoption-actions'),sources=o.overview?.sources??[];
    const pick=field('Retained returned source',o.source??'',value=>{o.source=value||null;o.browse=null;o.caseVersion=null;render();},
      {options:[['','Choose an original received source'],...sources.map(x=>[sourceId(x),(x.filename??x.name??sourceId(x))+' · '+(x.sha256??'')])]});
    controls.append(button('Refresh adoption inventory',()=>refresh(o),o));root.append(card('Original returned source',pick,controls,
      node('p','New source files enter through the existing Returned work receiver. No parallel upload or rewritten foreign history is created here.')));
    if(o.source)root.append(button('Inspect returned protocols',()=>browseSource(o),o));
    if(o.browse){
      root.append(card('Returned protocol selection',field('Exact incoming protocol',o.caseVersion??'',value=>{o.caseVersion=value||null;},
        {options:[['','Choose an exact returned protocol'],...o.browse.items.map(x=>[x.versionId,title(x)+' · '+x.versionId])]}),
        detail('Original received source and common ancestor',{source:o.browse.source,ancestor:o.browse.ancestor,incomingHead:o.browse.incomingHead}),
        button('Start review of this returned protocol',()=>startDraft(o),o)));
    }
    const saved=field('Saved adoption working copies',o.current?.id??'',value=>run(o,()=>chooseDraft(o,value)),
      {options:[['','Choose a saved working copy'],...[...o.drafts.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(d=>[d.id,(d.form.continuationOf?'Continuation':'Adoption')+' · '+d.basis.caseVersionId+' · '+d.updatedAt+(d.request?' · exact request retained':'')])]});
    const imported=node('input');imported.type='file';imported.accept='.json,application/json';imported.setAttribute('aria-label','Open complete adoption working copy');
    imported.addEventListener('change',()=>run(o,()=>importWorking(o,imported.files[0])));
    root.append(card('Durable adoption working copies',saved,imported),draftView(o));
    if(o.overview){
      const rows=o.overview.items.map(item=>[item.status??'Retained plan',item.planId??item.id,item.requestId,button('Inspect adoption '+(item.planId??item.id),()=>readHistory(o,item),o)]);
      const previous=button('Previous adoption history',async()=>{const next=await overview(o,Math.max(0,o.historyOffset-25),o.overview.revision);o.historyOffset=next.offset;o.overview=next;},o);
      const next=button('Next adoption history',async()=>{const result=await overview(o,o.overview.nextOffset,o.overview.revision);o.historyOffset=result.offset;o.overview=result;},o);
      previous.disabled=o.historyOffset===0;next.disabled=o.overview.nextOffset===null;
      root.append(card('Author adoption history',table(['Status','Plan','Original request','Inspect'],rows),previous,node('span',(rows.length?o.historyOffset+1:0)+'–'+(o.historyOffset+rows.length)+' of '+o.overview.total),next));
    }
    if(o.historyResult){root.append(resultView(o,o.historyResult));if(o.historyResult.status==='NEEDS_REVIEW')root.append(button('Review continuation of inspected adoption',()=>continuation(o,o.historyResult),o));}updateBusy();
  }
  function updateBusy(){
    const o=currentOwner;if(!root||!o)return;
    const locked=Boolean(o.busy||isBusy());root.setAttribute('aria-busy',String(locked));
    for(const e of root.querySelectorAll('button,input,select,textarea')){
      const frozen=Boolean(o.current?.request&&e.dataset.adoptionEdit!==undefined);
      const continuation=Boolean(o.current?.form.continuationOf&&e.type==='checkbox');
      if(locked||frozen||continuation){if(e.dataset.adoptionDisabled===undefined)e.dataset.adoptionDisabled=e.disabled?'1':'0';e.disabled=true;}
      else if(e.dataset.adoptionDisabled!==undefined){e.disabled=e.dataset.adoptionDisabled==='1';delete e.dataset.adoptionDisabled;}
    }
  }
  return{
    mount(element){
      root=element;visible=true;epoch++;const context=getSelection();
      if(!context?.workspaceId||!context?.dossierId){root.replaceChildren(node('p','Open the original author dossier first.'));currentOwner=null;return;}
      currentOwner=ownerFor(context);const o=currentOwner;render();
      if(!o.loaded&&!o.loadFlight){const flight=refresh(o);o.loadFlight=flight;flight.catch(e=>error(o,e)).finally(()=>{if(o.loadFlight===flight)o.loadFlight=null;});}
    },
    hide(){visible=false;epoch++;root=null;},
    updateBusy,
  };
}
