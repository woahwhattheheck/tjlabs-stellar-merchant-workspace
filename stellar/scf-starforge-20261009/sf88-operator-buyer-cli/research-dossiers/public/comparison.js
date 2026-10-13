// SPDX-License-Identifier: MIT
// Comparisons in the existing Research dossier, with complete saved requests.
import {openProtocolDraftStore} from './study-protocol-storage.js';
const SCHEMA='sf88-comparison-browser-draft/v1';
const MAX_RUN=64*1024*1024;
const clone=x=>structuredClone(x);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
const option=(value,label)=>{const n=node('option',label);n.value=value;return n;};
const json=x=>JSON.stringify(x,null,2);
const lines=x=>String(x??'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
const saveFile=(body,name,type='application/json')=>{const url=URL.createObjectURL(new Blob([body],{type})),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
const sha=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
function runSummary(v){return{schema:v.schema,externalRunId:v.externalRunId,kind:v.kind,status:v.status,startedAt:v.startedAt,finishedAt:v.finishedAt,elapsedMs:v.elapsedMs,engine:v.engine,input:v.input,metricCount:v.metrics?.length,artifacts:(v.artifacts??[]).map(({bodyBase64,...descriptor})=>descriptor),limitations:v.limitations};}
function detail(label,value){const d=node('details'),s=node('summary',label);d.append(s,node('pre',json(value)));return d;}
function section(title,...children){const s=node('section',null,'comparison-card');s.append(node('h3',title),...children);return s;}
function button(label,fn){const n=node('button',label);n.type='button';n.addEventListener('click',fn);return n;}
function table(headers,rows){const wrap=node('div',null,'comparison-table');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',headers.join(', '));const t=node('table'),head=node('tr');headers.forEach(x=>head.append(node('th',x)));const thead=node('thead');thead.append(head);t.append(thead);const body=node('tbody');for(const row of rows){const r=node('tr');for(const v of row){const cell=node('td');cell.append(v instanceof Node?v:node('span',v??''));r.append(cell);}body.append(r);}t.append(body);wrap.append(t);return wrap;}
function field(name,label,value='',type='text',options=null){const l=node('label',null,'comparison-field');l.append(node('span',label));let e;if(options){e=node('select');e.append(option('','Choose a value'),...options.map(x=>option(x[0],x[1])));}else e=node(type==='area'?'textarea':'input');if(!options&&type!=='area')e.type=type;e.name=name;e.value=value??'';if(type==='area')e.rows=5;l.append(e);return l;}
const group=(...children)=>{const n=node('div',null,'comparison-grid');n.append(...children);return n;};
const named=(form,name)=>form.elements.namedItem(name)?.value??'';
function parsed(value,label,kind){let v;try{v=JSON.parse(value);}catch{throw new Error(label+' must contain complete valid JSON.');}if(kind==='object'&&(!v||typeof v!=='object'||Array.isArray(v)))throw new Error(label+' must be a JSON object.');if(kind==='array'&&!Array.isArray(v))throw new Error(label+' must be a JSON array.');return v;}
export function createComparisonPanel({root,api,task,notify,getDossier,getWorkspace,isBusy,onReceived}){
  let visible=false,epoch=0,busy=false,overview=null,page=null,selectedCase=null,kind='candidates',offset=0,current=null,storageFailure=null;
  let storePromise=null,writer=Promise.resolve(),seenSelection=null;
  const drafts=new Map(),diskRevisions=new Map(),unwritten=new Map();
  const store=()=>storePromise??=openProtocolDraftStore().catch(e=>{storePromise=null;throw e;});
  const selection=()=>({workspaceId:getWorkspace()?.workspaceId,dossierId:getDossier()?.id});
  const same=(a,b)=>a.workspaceId===b.workspaceId&&a.dossierId===b.dossierId;
  const endpoint=(suffix='',sel=selection())=>'/api/dossiers/'+encodeURIComponent(sel.dossierId)+'/comparison'+suffix;
  const selectedApi=(path,opts={},sel=selection())=>api(path,{...opts,workspaceId:sel.workspaceId});
  const activeCase=()=>overview?.cases?.find(x=>x.id===selectedCase)??null;
  const actorFields=d=>group(field('actorId','Operator identifier',d.actor?.id??''),field('actorName','Operator name',d.actor?.name??''));
  const runTask=fn=>task(async()=>{if(busy)return;busy=true;updateBusy();try{await fn();}finally{busy=false;updateBusy();}});
  const changed=d=>{const x={...d,commitId:crypto.randomUUID(),updatedAt:new Date().toISOString()};drafts.set(x.id,x);unwritten.set(x.id,clone(x));if(current?.id===x.id)current=x;return x;};
  function persist(d){
    const snap=clone(d);unwritten.set(snap.id,snap);
    const work=writer.catch(()=>{}).then(async()=>{const r=await(await store()).write(snap,diskRevisions.get(snap.id)??0);diskRevisions.set(snap.id,r.revision);if(unwritten.get(snap.id)?.commitId===snap.commitId)unwritten.delete(snap.id);if(!unwritten.size)storageFailure=null;return r;});
    writer=work;work.catch(e=>{storageFailure=e.message;notify('The complete entered draft remains here. Download it or preserve a separate copy: '+e.message,'error');}).finally(updateBusy);return work;
  }
  async function loadDrafts(){
    const rows=await(await store()).list();
    for(const r of rows){const d=r.snapshot;if(d?.schema!==SCHEMA)continue;if(!unwritten.has(d.id)){const changedElsewhere=current?.id===d.id&&diskRevisions.has(d.id)&&diskRevisions.get(d.id)!==r.revision;drafts.set(d.id,d);diskRevisions.set(d.id,r.revision);if(current?.id===d.id)current=clone(d);if(changedElsewhere)notify('This clean working copy was refreshed with the complete version saved in another tab.','info');}}
  }
  function contextOK(sel,ticket){return visible&&ticket===epoch&&same(sel,selection());}
  async function refresh(proposed={}){
    const sel=selection(),ticket=++epoch;if(!sel.dossierId||!sel.workspaceId)return;
    let nextCase=Object.hasOwn(proposed,'caseId')?proposed.caseId:selectedCase;const nextKind=proposed.kind??kind,nextOffset=proposed.offset??offset;
    try{
    const q=new URLSearchParams({section:'overview',offset:'0',limit:'100'});
    if(nextCase)q.set('caseId',nextCase);
    let nextOverview=await selectedApi(endpoint('?'+q,sel),{},sel);
    if(!contextOK(sel,ticket))return;
    if(nextCase&&!nextOverview.cases.some(x=>x.id===nextCase))nextCase=null;
    if(!nextCase&&nextOverview.cases.length)nextCase=nextOverview.cases[0].id;
    if(nextCase&&nextOverview.caseId!==nextCase){
      const oq=new URLSearchParams({section:'overview',caseId:nextCase,revision:String(nextOverview.revision),offset:'0',limit:'100'});
      nextOverview=await selectedApi(endpoint('?'+oq,sel),{},sel);
      if(!contextOK(sel,ticket))return;
    }
    let nextPage=null;
    if(nextCase){
      const qp=new URLSearchParams({section:nextKind,caseId:nextCase,offset:String(nextOffset),limit:'25',revision:String(nextOverview.revision)});
      nextPage=await selectedApi(endpoint('?'+qp,sel),{},sel);
      if(!contextOK(sel,ticket))return;
    }
    await loadDrafts();if(!contextOK(sel,ticket))return;
    selectedCase=nextCase;kind=nextKind;offset=nextOffset;overview=nextOverview;page=nextPage;render();
    }catch(error){if(contextOK(sel,ticket))render();throw error;}
  }
  function sourceRefsEditor(form,d){
    const box=node('fieldset');box.dataset.sourceRefs='';box.append(node('legend','Original source references'));
    const selectedQuestion=d.action==='case.save'?d.form.questionId:activeCase()?.definition.questionId;
    const editions=(getDossier()?.editions??[]).filter(x=>!selectedQuestion||x.questionId===selectedQuestion);
    const rows=node('div');rows.dataset.refsRows='';
    const add=value=>{const r=node('div',null,'comparison-source-row');r.dataset.refRow='';const opts=editions.map(e=>[e.id,e.label??e.title??e.id]);if(value?.editionId&&!opts.some(x=>x[0]===value.editionId))opts.push([value.editionId,'Saved original: '+value.editionId]);r.append(field('refEdition','Retained edition',value?.editionId??'', 'text',opts),field('refLocator','Page, row or other exact location',value?.locator??''),field('refNote','Relevance',value?.note??''),button('Remove reference',()=>{if(current?.request)return;r.remove();capture(form);}));rows.append(r);};
    (d.form.sourceRefs??[]).forEach(add);box.append(rows,button('Add source reference',()=>{if(current?.request)return;add({});capture(form);}));return box;
  }
  function criteriaEditor(form,d){
    const box=node('fieldset');box.dataset.criteria='';box.append(node('legend','Comparison criteria'));
    const rows=node('div');rows.dataset.criteriaRows='';
    const add=value=>{const r=node('div',null,'comparison-criterion');r.dataset.criterionRow='';r.append(group(field('criterionId','Stable criterion identifier',value?.id??''),field('criterionLabel','Label',value?.label??''),field('criterionKind','Evidence kind',value?.kind??'MEASURED','text',[['MEASURED','Measured result'],['JUDGMENT','Researcher judgment']]),field('criterionUnit','Unit',value?.unit??''),field('criterionDirection','Direction',value?.direction??'DESCRIPTIVE','text',[['DESCRIPTIVE','Describe without ranking'],['HIGHER','Higher is preferred'],['LOWER','Lower is preferred']]),field('criterionDescription','Definition and comparability',value?.description??'','area')),button('Remove criterion',()=>{if(current?.request)return;r.remove();capture(form);}));rows.append(r);};
    (d.form.criteria??[]).forEach(add);box.append(rows,button('Add criterion',()=>{if(current?.request)return;add({});capture(form);}));return box;
  }
  function capture(form){
    if(!current||current.request)return current;
    const values={...current.form};
    for(const e of form.elements){if(e.name&&!e.closest('[data-criterion-row],[data-ref-row]')&&!['actorId','actorName'].includes(e.name)&&e.type!=='file')values[e.name]=e.value;}
    if(form.querySelector('[data-criteria]'))values.criteria=[...form.querySelectorAll('[data-criterion-row]')].map(r=>Object.fromEntries([['id','criterionId'],['label','criterionLabel'],['kind','criterionKind'],['unit','criterionUnit'],['direction','criterionDirection'],['description','criterionDescription']].map(([k,n])=>[k,r.querySelector('[name="'+n+'"]').value])));
    if(form.querySelector('[data-source-refs]'))values.sourceRefs=[...form.querySelectorAll('[data-ref-row]')].map(r=>({editionId:r.querySelector('[name=refEdition]').value,locator:r.querySelector('[name=refLocator]').value,note:r.querySelector('[name=refNote]').value}));
    const d=changed({...current,form:values,actor:{id:named(form,'actorId'),name:named(form,'actorName')}});persist(d).catch(()=>{});return d;
  }
  function prepareDraft(action,record=null){
    const sel=selection(),c=activeCase(),def=record?.definition??{};
    if(!sel.workspaceId||!sel.dossierId)throw new Error('Open the original dossier.');
    if(action!=='case.save'&&!c)throw new Error('Create or select the comparison case first.');
    const d={schema:SCHEMA,id:'comparison:'+sel.workspaceId+':'+sel.dossierId+':'+crypto.randomUUID(),...sel,
      action,expectedRevision:overview?.revision??getDossier().revision,caseId:action==='case.save'?(record?.id??null):c.id,
      caseVersionId:action==='case.save'?(record?.versionId??null):c.versionId,
      recordId:record?.id??null,previousVersionId:record?.versionId??null,
      actor:current?.actor??{id:'',name:''},form:{...clone(def),sourceRefs:clone(def.sourceRefs??[])},request:null,result:null};
    if(action==='case.save')d.form={questionId:'',title:'',purpose:'',scope:'',criteria:[],...d.form};
    if(action==='candidate.save')d.form={name:'',kind:'MODEL',version:'',description:'',...d.form,configuration:json(def.configuration??{})};
    if(action==='judgment.save')d.form={candidateVersionId:'',criterionId:'',value:'',reviewer:'',reviewedAt:new Date().toISOString(),rationale:'',...d.form,runIds:(def.runIds??[]).join('\n')};
    if(action==='decision.save')d.form={title:'',reviewer:'',reviewedAt:new Date().toISOString(),recommendation:'',rationale:'',limitations:'',...d.form,candidateVersionIds:(def.candidateVersionIds??[]).join('\n'),runIds:(def.runIds??[]).join('\n'),judgmentVersionIds:(def.judgmentVersionIds??[]).join('\n')};
    if(action==='run.import')d.form={candidateVersionId:'',rawText:'',sourceName:'',sourceBytes:null,sourceSha256:null,...d.form};
    current=changed(d);persist(current).catch(()=>{});render();
  }
  function payload(d){
    const v=d.form,sourceRefs=clone(v.sourceRefs??[]),common={caseId:d.caseId,caseVersionId:d.caseVersionId};
    if(d.action==='case.save')return{caseId:d.caseId,previousVersionId:d.previousVersionId,definition:{questionId:v.questionId,title:v.title,purpose:v.purpose,scope:v.scope,criteria:clone(v.criteria),sourceRefs}};
    if(d.action==='candidate.save')return{...common,candidateId:d.recordId,previousVersionId:d.previousVersionId,definition:{name:v.name,kind:v.kind,version:v.version,description:v.description,configuration:parsed(v.configuration,'Complete candidate configuration','object'),sourceRefs}};
    if(d.action==='judgment.save')return{...common,judgmentId:d.recordId,previousVersionId:d.previousVersionId,definition:{candidateVersionId:v.candidateVersionId,criterionId:v.criterionId,value:v.value,reviewer:v.reviewer,reviewedAt:v.reviewedAt,rationale:v.rationale,sourceRefs,runIds:lines(v.runIds)}};
    if(d.action==='decision.save')return{...common,decisionId:d.recordId,previousVersionId:d.previousVersionId,definition:{title:v.title,candidateVersionIds:lines(v.candidateVersionIds),runIds:lines(v.runIds),judgmentVersionIds:lines(v.judgmentVersionIds),reviewer:v.reviewer,reviewedAt:v.reviewedAt,recommendation:v.recommendation,rationale:v.rationale,limitations:v.limitations,sourceRefs}};
    if(d.action==='run.import')return{...common,candidateVersionId:v.candidateVersionId,rawText:v.rawText};
    throw new Error('Select a documented comparison action.');
  }
  async function sendSaved(){
    const d=current;if(!d?.request)throw new Error('Prepare the complete request first.');
    const sel=selection();if(!same(sel,d))throw new Error('Reopen this request in its original workspace and dossier.');
    await writer;await persist(d);
    const result=await selectedApi(endpoint('/reviews?projection=metadata',d),{method:'POST',body:d.request},d);
    const saved=changed({...drafts.get(d.id),result});await persist(saved);
    if(current?.id===d.id)current=saved;
    if(same(sel,selection())){
      const complete=await selectedApi('/api/dossiers/'+encodeURIComponent(d.dossierId),{},d);
      if(same(sel,selection()))await onReceived(complete);
      if(same(sel,selection())&&visible)await refresh();
    }
    notify('Original comparison request received and retained.');
  }
  async function freeze(form){
    capture(form);await writer;const d=current;
    if(!same(d,selection()))throw new Error('The original dossier selection changed.');
    if(d.request)return;
    if(d.action!=='case.save'&&d.caseId!==selectedCase)throw new Error('Reopen this working copy’s original comparison case before preparing it.');
    if(!d.actor.id.trim()||!d.actor.name.trim())throw new Error('Enter the actual operator identifier and name.');
    const request={requestId:crypto.randomUUID(),expectedRevision:d.expectedRevision,actor:clone(d.actor),action:d.action,payload:payload(d)};
    current=changed({...d,request});await persist(current);render();
  }
  async function openDownloaded(file){
    if(!file||file.size>128*1024*1024)throw new Error('Choose a complete saved comparison working copy up to 128 MiB.');
    let d=JSON.parse(await file.text());if(d?.schema!==SCHEMA||typeof d.id!=='string'||!d.id.startsWith('comparison:')||typeof d.action!=='string'||!d.form||!Number.isSafeInteger(d.expectedRevision))throw new Error('Choose an original complete comparison working copy.');
    if(!same(d,selection()))throw new Error('This working copy belongs to another original workspace or dossier.');
    const old=drafts.get(d.id);if(old&&JSON.stringify(old)!==JSON.stringify(d))d={...d,id:'comparison:'+d.workspaceId+':'+d.dossierId+':'+crypto.randomUUID(),importedFromWorkingCopyId:d.id,commitId:crypto.randomUUID()};
    current=d;drafts.set(d.id,d);await persist(d);render();
  }
  function draftEditor(){
    const d=current;if(!d)return section('Prepare and review',node('p','Create a case, select a candidate or reopen a complete saved working copy.'));
    const form=node('form');form.dataset.comparisonForm='';
    if(d.caseId&&d.caseId!==selectedCase)form.append(node('p','This working copy belongs to its original case '+d.caseId+'.'),button('Reopen this working copy’s case',()=>runTask(async()=>{await refresh({caseId:d.caseId,offset:0});})));form.addEventListener('submit',e=>{e.preventDefault();runTask(()=>freeze(form));});
    form.append(node('h3',d.action.replace('.save','').replace('.import',' import')),node('p','Saved basis: dossier revision '+d.expectedRevision+(d.caseVersionId?' · case edition '+d.caseVersionId:''),'comparison-hint'),actorFields(d));
    const v=d.form,candidates=overview?.candidates??[],c=activeCase();
    const candidateOptions=candidates.filter(x=>x.caseVersionId===d.caseVersionId).map(x=>[x.versionId,x.definition.name+' · '+x.definition.version+' · '+x.versionId]);
    if(v.candidateVersionId&&!candidateOptions.some(x=>x[0]===v.candidateVersionId))candidateOptions.push([v.candidateVersionId,'Original selected edition: '+v.candidateVersionId]);
    if(d.action==='case.save'){
      form.append(group(field('title','Case title',v.title),field('questionId','Original research question',v.questionId,'text',(getDossier()?.questions??[]).map(x=>[x.id,x.text])),field('purpose','Decision or research purpose',v.purpose,'area'),field('scope','Population, context and comparison scope',v.scope,'area')),criteriaEditor(form,d),sourceRefsEditor(form,d));
    }else if(d.action==='candidate.save'){
      form.append(group(field('name','Candidate name',v.name),field('kind','Candidate type',v.kind,'text',[['MODEL','Model'],['PLATFORM','Platform'],['ARCHITECTURE','Architecture']]),field('version','Original release or configuration edition',v.version),field('description','Method and operating context',v.description,'area')),field('configuration','Complete configuration JSON',v.configuration,'area'),sourceRefsEditor(form,d));
    }else if(d.action==='run.import'){
      form.append(field('candidateVersionId','Exact candidate edition',v.candidateVersionId,'text',candidateOptions));
      const label=node('label',null,'comparison-field'),f=node('input');f.type='file';f.accept='.json,application/json';label.append(node('span','Complete original run bundle'),f);
      f.addEventListener('change',()=>runTask(async()=>{const file=f.files[0],basis=current?.id,sel=selection();if(!file||file.size>MAX_RUN)throw new Error('Select the complete original run JSON up to 64 MiB.');const b=new Uint8Array(await file.arrayBuffer()),rawText=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b);JSON.parse(rawText);const hash=await sha(b);if(current?.id!==basis||current.request||!same(sel,selection()))return;current=changed({...current,form:{...current.form,rawText,sourceName:file.name,sourceBytes:b.length,sourceSha256:hash}});await persist(current);render();}));
      form.append(label,node('p',v.sourceName?v.sourceName+' · '+v.sourceBytes+' bytes · SHA256 '+v.sourceSha256:'Select the evaluator’s complete original run and attachment bundle.','comparison-hint'),detail('Original run summary',v.rawText?runSummary(parsed(v.rawText,'Original run','object')):{}),button('Download selected complete run',()=>saveFile(v.rawText,v.sourceName||'original-run.json')));
    }else if(d.action==='judgment.save'){
      const criteria=(c?.definition.criteria??[]).filter(x=>x.kind==='JUDGMENT').map(x=>[x.id,x.label+' · '+x.unit]);
      if(v.criterionId&&!criteria.some(x=>x[0]===v.criterionId))criteria.push([v.criterionId,'Original criterion: '+v.criterionId]);
      form.append(group(field('candidateVersionId','Exact candidate edition',v.candidateVersionId,'text',candidateOptions),field('criterionId','Judgment criterion',v.criterionId,'text',criteria),field('value','Researcher’s entered assessment',v.value),field('reviewer','Actual reviewer',v.reviewer),field('reviewedAt','Reviewed at (UTC ISO timestamp)',v.reviewedAt),field('rationale','Reasoning and qualification',v.rationale,'area')),field('runIds','Referenced original run IDs, one per line',v.runIds,'area'),sourceRefsEditor(form,d));
    }else if(d.action==='decision.save'){
      form.append(group(field('title','Decision title',v.title),field('reviewer','Actual reviewer',v.reviewer),field('reviewedAt','Reviewed at (UTC ISO timestamp)',v.reviewedAt)),field('recommendation','Recommendation',v.recommendation,'area'),field('rationale','Reasoning across the selected evidence',v.rationale,'area'),field('limitations','Limitations and unresolved questions',v.limitations,'area'),group(field('candidateVersionIds','Exact candidate edition IDs, one per line',v.candidateVersionIds,'area'),field('runIds','Original measured run IDs, one per line',v.runIds,'area'),field('judgmentVersionIds','Exact judgment edition IDs, one per line',v.judgmentVersionIds,'area')),sourceRefsEditor(form,d));
    }
    form.addEventListener('input',()=>capture(form));form.addEventListener('change',()=>capture(form));
    const actions=node('div',null,'comparison-actions');
    if(!d.request){
      const submit=node('button','Prepare complete request');submit.type='submit';actions.append(submit,button('Review current basis',()=>runTask(async()=>{capture(form);await writer;await refresh();if(!current||current.id!==d.id||current.request)return;if(current.action!=='case.save'&&current.caseId!==selectedCase)throw new Error('Select this working copy’s original comparison case before reviewing its basis.');const nowCase=activeCase();current=changed({...current,expectedRevision:overview?.revision??getDossier().revision,...(current.action!=='case.save'?{caseVersionId:nowCase?.versionId??current.caseVersionId}:{}),basisReview:{at:new Date().toISOString(),previousRevision:d.expectedRevision,previousCaseVersionId:d.caseVersionId}});await persist(current);render();})));
    }
    actions.append(button('Download complete working copy',()=>{capture(form);saveFile(json(current)+'\n','comparison-working-copy.json');}),button('Preserve a separate working copy',()=>runTask(async()=>{capture(form);const value={...clone(current),id:'comparison:'+current.workspaceId+':'+current.dossierId+':'+crypto.randomUUID()};current=changed(value);await persist(current);storageFailure=null;render();})));
    form.append(actions);
    if(d.request){for(const e of form.elements)if(e.tagName!=='BUTTON')e.disabled=true;form.append(detail('Complete saved original request',d.request),button(d.result?'Receive original saved result':'Apply or receive this original request',()=>runTask(sendSaved)),button('Download original request',()=>saveFile(json(d.request)+'\n','comparison-request.json')));}
    if(d.request)form.append(button('Create editable successor working copy',()=>runTask(async()=>{await writer;const original=clone(current);const successor={...original,id:'comparison:'+original.workspaceId+':'+original.dossierId+':'+crypto.randomUUID(),request:null,result:null,expectedRevision:overview?.revision??getDossier().revision,supersedesWorkingCopyId:original.id,supersedesRequestId:original.request.requestId};current=changed(successor);await persist(current);render();})));
    if(d.result)form.append(detail('Original saved result',d.result));
    if(storageFailure)form.prepend(node('p','Working copy could not be saved: '+storageFailure+'. The entered fields remain here; download them or preserve a separate copy.','comparison-error'));
    return section('Working copy',form);
  }
  function listRows(){
    if(!page)return node('p','Choose an existing case or prepare a new one.');
    return table(['Record','Original edition and basis','Read and continue'],page.items.map(r=>{
      const controls=node('div',null,'comparison-actions');controls.append(detail('Complete original record',r));
      const actions={'candidates':'candidate.save','candidate-editions':'candidate.save','case-editions':'case.save','judgments':'judgment.save','decisions':'decision.save'};
      const rowAction=actions[kind];if(rowAction)controls.append(button('Prepare successor',()=>runTask(async()=>prepareDraft(rowAction,r))));
      if(kind==='case-editions'){controls.append(button('Read this protocol report',()=>runTask(()=>showReport(r))));for(const f of ['html','json','csv'])controls.append(button('This edition '+f.toUpperCase(),()=>runTask(()=>exportCase(f,r))));}
      if(kind==='runs'){
        controls.append(button('Download complete original run',()=>runTask(()=>downloadRun(r))));
        for(const a of r.artifacts??[])controls.append(button('Download '+(a.path??a.name??a.id),()=>runTask(()=>downloadRun(r,a))));
      }
      return[r.definition?.name??r.definition?.title??r.definition?.criterionId??r.id??r.requestId,r.versionId??r.id,controls];
    }));
  }
  async function downloadRun(run,artifact=null){
    const sel=selection(),q=new URLSearchParams({revision:String(overview.revision),runId:run.id});if(artifact)q.set('artifactId',artifact.id);
    const r=await selectedApi(endpoint('/file?'+q,sel),{download:true},sel),b=new Uint8Array(await r.arrayBuffer());
    const expected=artifact??run.raw,expectedHash=expected.sha256,expectedBytes=expected.bytes;
    if(b.length!==expectedBytes||await sha(b)!==expectedHash)throw new Error('The complete original file did not match its recorded identity.');
    saveFile(b,artifact?.path?.split('/').pop()??artifact?.name??'original-run.json',artifact?.mediaType??'application/json');
  }
  async function exportCase(format,record=null){
    const sel=selection(),c=record??activeCase();if(!c)return;
    const q=new URLSearchParams({revision:String(overview.revision),caseId:c.id,caseVersionId:c.versionId,format});
    const r=await selectedApi(endpoint('/export?'+q,sel),{download:true},sel);
    const body=await r.arrayBuffer(),expected=r.headers.get('X-Content-SHA256');if(!/^[a-f0-9]{64}$/.test(expected??'')||await sha(body)!==expected)throw new Error('The complete comparison export did not match its declared original SHA256.');saveFile(body,'research-comparison.'+format,format==='html'?'text/html':format==='csv'?'text/csv':'application/json');
  }
  async function showReport(record=null){
    const sel=selection(),c=record??activeCase(),ticket=epoch;if(!c)return;
    const q=new URLSearchParams({revision:String(overview.revision),caseId:c.id,caseVersionId:c.versionId});
    const r=await selectedApi(endpoint('/report?'+q,sel),{},sel);if(!contextOK(sel,ticket))return;
    const output=root.querySelector('[data-comparison-report]');output.replaceChildren();
    const candidateNames=new Map([...(r.candidates??[]),...(r.candidateEditions??[])].map(x=>[x.versionId,x.definition.name+' · '+x.definition.version]));
    const criterionNames=new Map([r.case,...(r.caseEditions??[])].filter(Boolean).flatMap(x=>(x.definition.criteria??[]).map(y=>[x.versionId+':'+y.id,y.label])));
    function matrix(title,rows,measured){
      const box=section(title),content=node('div');let index=0;
      function draw(){
        content.replaceChildren(table(['Candidate edition','Criterion','Recorded result','Original basis'],rows.slice(index,index+25).map(x=>[
          candidateNames.get(x.candidateVersionId)??x.candidateVersionId,
          criterionNames.get(x.caseVersionId+':'+x.criterionId)??x.criterionId,
          x.value===null?'Undefined: '+x.undefinedReason:String(x.value)+(measured&&x.unit?' '+x.unit:''),
          detail(measured?'Run, cohort and denominator':'Reviewer, reasoning and source references',x)
        ])));
        const nav=node('div',null,'comparison-actions'),prev=button('Previous values',()=>{index=Math.max(0,index-25);draw();}),next=button('Next values',()=>{index+=25;draw();});
        prev.disabled=index===0;next.disabled=index+25>=rows.length;
        nav.append(prev,node('span',(rows.length?index+1:0)+'–'+Math.min(index+25,rows.length)+' of '+rows.length),next);content.append(nav);
      }
      if(measured)box.append(node('p','Values keep their original unit, source cohort and denominator. Undefined results remain explicit. Training and imported measurements retain their original kind and run status.'));
      box.append(content);draw();return box;
    }
    output.append(node('h3',r.case.definition.title+' · protocol '+r.case.versionId),matrix('Measured results',r.measurementRows??[],true),matrix('Researcher judgments',r.judgmentRows??[],false),
      section('Named decisions',...(r.decisions??[]).map(x=>section(x.definition.title,node('p',x.definition.recommendation),node('p',x.definition.rationale),detail('Selected original versions and limitations',x)))),
      detail('Complete case report and source identities',r));
  }
  function render(){
    if(!visible)return;root.replaceChildren();
    root.append(node('h2','Model, platform and architecture comparisons'),node('p','Keep the original case, candidate editions, measured runs and named judgments together. Each decision selects the exact evidence it used.'));
    if(!getDossier()){root.append(node('p','Open a dossier and create its research question first.'));return;}
    const controls=node('div',null,'comparison-actions'),select=node('select');select.setAttribute('aria-label','Comparison case');select.append(option('','Choose a saved case'),...(overview?.cases??[]).map(c=>option(c.id,c.definition.title)));select.value=selectedCase??'';
    select.addEventListener('change',()=>runTask(async()=>{await refresh({caseId:select.value||null,offset:0});}));
    controls.append(select,button('New comparison case',()=>runTask(async()=>prepareDraft('case.save'))),button('Refresh saved work',()=>runTask(refresh)));root.append(controls);
    const c=activeCase();
    if(c){
      root.append(section(c.definition.title,node('p',c.definition.purpose),node('p',c.definition.scope),detail('Exact protocol and original sources',c),button('Prepare case successor',()=>runTask(async()=>prepareDraft('case.save',c)))));
      const actions=node('div',null,'comparison-actions');
      [['Candidate','candidate.save'],['Import measured run','run.import'],['Named judgment','judgment.save'],['Decision','decision.save']].forEach(([label,a])=>actions.append(button(label,()=>runTask(async()=>prepareDraft(a)))));
      root.append(actions);
      const picker=node('select');picker.setAttribute('aria-label','Comparison records');['candidates','candidate-editions','runs','judgments','decisions','case-editions','operations'].forEach(v=>picker.append(option(v,v.replaceAll('-',' '))));picker.value=kind;picker.addEventListener('change',()=>runTask(async()=>{await refresh({kind:picker.value,offset:0});}));
      root.append(section('Saved records',picker,listRows()));
      if(page){const nav=node('div',null,'comparison-actions'),prev=button('Previous records',()=>runTask(async()=>{await refresh({offset:Math.max(0,offset-25)});})),next=button('Next records',()=>runTask(async()=>{await refresh({offset:page.nextOffset});}));prev.disabled=page.offset===0;next.disabled=page.nextOffset===null;nav.append(prev,node('span',(page.items.length?page.offset+1:0)+'–'+(page.offset+page.items.length)+' of '+page.total),next);root.append(nav);}
      const reports=node('div',null,'comparison-actions');reports.append(button('Read comparison report',()=>runTask(showReport)));for(const f of ['html','json','csv'])reports.append(button('Download '+f.toUpperCase(),()=>runTask(()=>exportCase(f))));root.append(reports,node('p','Use the dossier’s Export control for the complete editable source, history and original files. Reopen that complete dossier before continuing on another machine.','comparison-hint'));const report=node('div');report.dataset.comparisonReport='';root.append(report);
    }
    const saved=node('select');saved.setAttribute('aria-label','Saved comparison working copies');saved.append(option('','Choose a saved working copy'),...[...drafts.values()].filter(d=>same(d,selection())).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).map(d=>option(d.id,(d.form.title??d.form.name??d.action)+' · '+d.updatedAt+(d.request?' · original request saved':''))));saved.value=current?.id??'';
    saved.addEventListener('change',()=>runTask(async()=>{await writer;current=drafts.get(saved.value)??null;render();}));
    const upload=node('input');upload.type='file';upload.accept='.json,application/json';upload.setAttribute('aria-label','Open complete comparison working copy');upload.addEventListener('change',()=>runTask(()=>openDownloaded(upload.files[0])));
    root.append(section('Saved working copies',saved,upload),draftEditor());updateBusy();
  }
  function updateBusy(){for(const e of root.querySelectorAll('button,input,select,textarea')){if(e.closest('form')&&current?.request&&e.tagName!=='BUTTON'){e.disabled=true;continue;}if(busy||isBusy()){if(e.dataset.comparisonDisabled===undefined)e.dataset.comparisonDisabled=e.dataset.wasDisabled??(e.disabled?'1':'0');e.disabled=true;}else if(e.dataset.comparisonDisabled!==undefined){e.disabled=e.dataset.comparisonDisabled==='1';delete e.dataset.comparisonDisabled;}}root.setAttribute('aria-busy',String(busy||isBusy()));}
  return{show(value){visible=value;const sel=selection();if(!same(sel,seenSelection??{})){++epoch;seenSelection=sel;overview=null;page=null;selectedCase=null;current=null;offset=0;if(value)render();}if(value)refresh().catch(e=>notify(e.message,'error'));else ++epoch;},updateBusy};
}
