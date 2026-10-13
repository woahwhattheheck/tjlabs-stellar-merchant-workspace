// SPDX-License-Identifier: MIT
// Complete original-output working copies beside the existing comparison UI.
import {openProtocolDraftStore} from './study-protocol-storage.js';
const SCHEMA='sf88-original-output-browser/v1',SOURCE='sf88-original-output-browser-source/v1',SAVED='sf88-original-output-browser-record/v1';
const LIMIT=64*1024*1024,clone=x=>structuredClone(x),json=x=>JSON.stringify(x,null,2);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const option=(v,t)=>{const n=node('option',t);n.value=v;return n;};
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const sha=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
const utf=x=>new TextEncoder().encode(x);
const encode=b=>{let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s);};
const decode=s=>Uint8Array.from(atob(s),x=>x.charCodeAt(0));
const save=(body,name,type='application/json')=>{const u=URL.createObjectURL(new Blob([body],{type})),a=node('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);};
const detail=(title,value)=>{const d=node('details');d.append(node('summary',title),node('pre',typeof value==='string'?value:json(value)));return d;};
const section=(title,...children)=>{const s=node('section',undefined,'output-card');s.append(node('h3',title),...children);return s;};
const group=(...children)=>{const d=node('div',undefined,'output-grid');d.append(...children);return d;};
const table=(headers,rows)=>{const wrap=node('div',undefined,'output-table');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',headers.join(', '));const t=node('table'),head=node('tr');headers.forEach(x=>head.append(node('th',x)));const th=node('thead');th.append(head);t.append(th);const body=node('tbody');for(const row of rows){const tr=node('tr');for(const x of row){const td=node('td');td.append(x instanceof Node?x:node('span',x??''));tr.append(td);}body.append(tr);}t.append(body);wrap.append(t);return wrap;};
function field(label,value,change,{type='text',options=null,rows=3}={}){
 const l=node('label',undefined,'output-field'),n=options?node('select'):node(type==='area'?'textarea':'input');l.append(node('span',label));
 if(options)n.append(...options.map(x=>option(x[0],x[1])));else if(type==='area')n.rows=rows;else n.type=type;
 n.value=value??'';n.addEventListener(options?'change':'input',()=>change(n.value));l.append(n);return l;
}
function parsed(s,label){try{return JSON.parse(s);}catch{throw Error(label+' must contain complete valid JSON.');}}
export function createOriginalOutputDesk({api,task,notify,getSelection,getCase,getRevision,getWorkspace,isBusy=()=>false,onReceived}){
 let root=null,current=null,visible=false,busy=false,storageError=null,storePromise=null,writer=Promise.resolve(),epoch=0,rowsOffset=0,rowsFilter='',rowsSearch='',prepared=null;
 const copies=new Map(),revisions=new Map(),unwritten=new Map(),sourceCache=new Map(),recordCache=new Map();
 const store=()=>storePromise??=openProtocolDraftStore({databaseName:'sf88-original-output-drafts'}).catch(e=>{storePromise=null;throw e;});
 const selected=()=>getSelection(),context=d=>d&&d.workspaceId===selected().workspaceId&&d.dossierId===selected().dossierId;
 const endpoint=(suffix,d=current)=>'/api/dossiers/'+encodeURIComponent(d.dossierId)+'/comparison'+suffix;
 const call=(path,options={},d=current)=>api(path,{...options,sourceProjection:'full',workspaceId:d.workspaceId});
 const button=(label,fn)=>{const b=node('button',label);b.type='button';b.addEventListener('click',()=>run(fn));return b;};
 const editButton=(label,fn)=>{const b=button(label,fn);b.dataset.outputEdit='1';return b;};
 const run=fn=>task(async()=>{if(busy)return;busy=true;updateBusy();try{await writer.catch(()=>{});await fn();}finally{busy=false;updateBusy();}});
 const changed=d=>({...d,commitId:crypto.randomUUID(),updatedAt:new Date().toISOString()});
 async function write(d){
  const snapshot=clone(d);unwritten.set(snapshot.id,snapshot);copies.set(snapshot.id,snapshot);
  const work=writer.catch(()=>{}).then(async()=>{
   const saved=await(await store()).write(snapshot,revisions.get(snapshot.id)??0);
   revisions.set(snapshot.id,saved.revision);
   if(unwritten.get(snapshot.id)?.commitId===snapshot.commitId)unwritten.delete(snapshot.id);
   if(!unwritten.has(snapshot.id))copies.set(snapshot.id,snapshot);
   if(current?.id===snapshot.id&&!unwritten.has(snapshot.id))storageError=null;
   return saved;
  });
  writer=work;work.catch(e=>{storageError=e.message;notify('The complete output working copy remains available to download or preserve separately: '+e.message,'error');}).finally(updateBusy);return work;
 }
 async function update(next){current=changed(next);await write(current);}
 function edit(fn,{invalidate=true,allowBusy=false}={}){
  if(!current||current.frozen||current.attempts.length||busy&&!allowBusy)return;
  const d=clone(current);fn(d);if(invalidate){d.preparation=null;d.preparationRequest=null;prepared=null;}current=changed(d);write(current).catch(()=>{});
 }
 const mutate=fn=>edit(fn,{allowBusy:true});
 async function immutable(id,value){
  const db=await store(),existing=await db.read(id);
  if(existing){if(!same(existing.snapshot.value,value))throw Error('The original saved source or request changed.');return existing.snapshot.value;}
  const snapshot={schema:SAVED,id,commitId:id,value};await db.write(snapshot,0);return value;
 }
 async function record(id){
  if(recordCache.has(id))return recordCache.get(id);
  const row=await(await store()).read(id);if(!row||row.snapshot.schema!==SAVED)throw Error('The complete saved request or preparation is unavailable.');
  recordCache.set(id,row.snapshot.value);return row.snapshot.value;
 }
 async function source(ref){
  if(sourceCache.has(ref.id))return sourceCache.get(ref.id);
  const r=await(await store()).read(ref.id),v=r?.snapshot;
  if(v?.schema!==SOURCE||v.bytes!==ref.bytes||v.sha256!==ref.sha256||typeof v.bodyBase64!=='string')throw Error('The retained complete original file is unavailable.');
  const b=decode(v.bodyBase64);if(b.length!==v.bytes||await sha(b)!==v.sha256)throw Error('The retained original file changed.');
  sourceCache.set(ref.id,v);return v;
 }
 async function retainFile(file,path){
  if(!file||file.size>LIMIT)throw Error('Select an original file up to 64 MiB.');
  const b=new Uint8Array(await file.arrayBuffer()),hash=await sha(b),sel=selected();
  const id='output-source:'+sel.workspaceId+':'+hash,db=await store(),old=await db.read(id);
  const value={schema:SOURCE,id,commitId:hash,bytes:b.length,sha256:hash,bodyBase64:encode(b)};
  if(old){if(!same(old.snapshot,value))throw Error('An existing original source identity changed.');}
  else await db.write(value,0);
  sourceCache.set(id,value);return{id,path,name:file.name,bytes:b.length,sha256:hash};
 }
 async function reload(){
  await writer.catch(()=>{});
  const sel=selected();if(!sel.workspaceId||!sel.dossierId)return;
  const rows=await(await store()).listPrefix('output:'+sel.workspaceId+':'+sel.dossierId+':');
  for(const r of rows)if(r.snapshot?.schema===SCHEMA&&!unwritten.has(r.id)){
   copies.set(r.id,r.snapshot);revisions.set(r.id,r.revision);
   if(current?.id===r.id&&current.commitId!==r.snapshot.commitId){current=clone(r.snapshot);prepared=null;}
  }
  if(!current){
   const dirty=[...unwritten.values()].filter(context).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
   if(dirty){current=clone(dirty);storageError='This complete working copy still has unsaved changes; preserve it separately or download it.';}
  }
  if(current?.preparation)prepared=await record(current.preparation);
 }
 async function ensureCurrent(){
  if(!context(current))throw Error('Reopen this working copy in its original workspace and dossier.');
  if(storageError)throw Error('Save or download the complete local work before proceeding.');
  await writer;const saved=await(await store()).read(current.id);
  if(!saved||saved.revision!==revisions.get(current.id)||saved.snapshot.commitId!==current.commitId)throw Error('This working copy changed in another tab. Reopen its retained edition.');
 }
 function blank(){
  const c=getCase(),s=selected();if(!c||!s.workspaceId||!s.dossierId)throw Error('Select the original comparison case and protocol first.');
  return{schema:SCHEMA,id:'output:'+s.workspaceId+':'+s.dossierId+':'+crypto.randomUUID(),...s,
   expectedRevision:getRevision(),caseId:c.id,caseVersionId:c.versionId,actor:{id:'',name:''},
   plan:{schema:'sf88-original-output-plan/v1',source:{file:'table.csv',bytes:0,sha256:''},originals:[],
    protocol:clone(c.definition),candidate:{name:'',kind:'MODEL',version:'',description:'',configuration:{},sourceRefs:[]},
    run:{externalRunId:'',kind:'IMPORTED_MEASUREMENT',status:'SUCCEEDED',startedAt:'',finishedAt:'',elapsedMs:null,
     engine:{name:'',version:'',command:[],runtime:{},configuration:{}},
     input:{cohortId:'',protocolId:'',definition:{},sourceRefs:[],artifactIds:[]},limitations:[]},
    mapping:{delimiter:',',rowKeyColumns:[],selection:[],exclude:[],fields:Object.fromEntries(['criterionId','label','value','unit','definition','cohortRef'].map(k=>[k,{column:''}])),
     denominator:{basis:{literal:''},value:{column:''}},missingTokens:[''],missingReason:{literal:''}}},
   files:[],table:null,advanced:{},filterTexts:[],preparation:null,preparationRequest:null,frozen:false,attempts:[],candidateResult:null,runResult:null};
 }
 async function newCopy(){await ensureIfDirty();current=changed(blank());prepared=null;rowsOffset=0;await write(current);render();}
 async function ensureIfDirty(){await writer;if(storageError)throw Error('Preserve the visible working copy before changing selection.');}
 async function inspectTable(){
  await ensureCurrent();if(current.frozen)throw Error('This preparation is frozen. Read its retained rows, or create an editable successor.');const ref=current.files.find(f=>f.path===current.plan.source.file);if(!ref)throw Error('Select the complete original table.');
  const original=await source(ref),result=await call(endpoint('/output/table'),{method:'POST',body:{file:{...ref, id:undefined,bodyBase64:original.bodyBase64},delimiter:current.plan.mapping.delimiter}});
  if(result.source.sha256!==ref.sha256||result.source.bytes!==ref.bytes)throw Error('The inspected table is another source.');
  await update({...current,table:{headers:result.headers,rows:result.rows},preparation:null,preparationRequest:null});prepared=null;render();
 }
 async function uploadTable(file){
  await ensureCurrent();if(current.frozen)throw Error('Create an editable successor to change retained sources.');
  const ref=await retainFile(file,'table.csv'),d=clone(current);d.files=[ref,...d.files.filter(f=>f.path!==d.plan.source.file)];d.plan.source={file:ref.path,originalName:ref.name,bytes:ref.bytes,sha256:ref.sha256};d.table=null;d.preparation=null;d.preparationRequest=null;await update(d);prepared=null;await inspectTable();
 }
 async function uploadOriginal(file){
  await ensureCurrent();if(current.frozen)throw Error('Create an editable successor to change retained sources.');
  const key=crypto.randomUUID(),path='originals/'+key,ref=await retainFile(file,path),d=clone(current);d.files.push(ref);
  d.plan.originals.push({id:'original-'+key,file:path,path:'original/'+file.name.replace(/[^A-Za-z0-9._-]/g,'_').slice(0,120)+'-'+key,role:'original producer file',mediaType:file.type||'application/octet-stream',bytes:ref.bytes,sha256:ref.sha256});
  d.preparation=null;d.preparationRequest=null;await update(d);prepared=null;render();
 }
 function selectedPlan(d){
  const p=clone(d.plan);for(const [path,value]of Object.entries(d.advanced??{})){
   if(!["candidate.configuration","candidate.sourceRefs","run.engine.command","run.engine.runtime","run.engine.configuration","run.input.definition","run.input.sourceRefs","run.limitations","mapping.missingTokens"].includes(path))throw Error('Unknown saved advanced field.');
   const v=parsed(value,path);let target=p;const keys=path.split('.');for(const k of keys.slice(0,-1))target=target[k];target[keys.at(-1)]=v;
  }if(d.filterTexts)for(let i=0;i<p.mapping.selection.length;i++)if(d.filterTexts[i]!==undefined)p.mapping.selection[i].values=parsed(d.filterTexts[i],'Exact filter values');return p;
 }
 function checkPreparationBasis(d){
  const logical=d.preparationRequest;
  if(!logical){if(d.preparation||d.attempts.length)throw Error('The complete original preparation request is missing.');return;}
  if(typeof logical.requestId!=='string'||logical.caseId!==d.caseId||logical.caseVersionId!==d.caseVersionId||logical.expectedRevision!==d.expectedRevision||!same(logical.plan,selectedPlan(d))||!same(logical.files,d.files))throw Error('The working copy and its retained preparation select different original inputs.');
 }
 async function prepare(){
  await ensureCurrent();if(current.frozen)throw Error('Use the retained preparation or create a successor working copy.');
  const p=selectedPlan(current),c=getCase();if(!c||c.id!==current.caseId||c.versionId!==current.caseVersionId||!same(p.protocol,c.definition))throw Error('Reopen this working copy’s exact original protocol edition.');
  if(!current.preparationRequest){
   const request={requestId:crypto.randomUUID(),expectedRevision:current.expectedRevision,caseId:current.caseId,caseVersionId:current.caseVersionId,plan:p,files:clone(current.files)};
   await update({...current,preparationRequest:request});
  }
  checkPreparationBasis(current);const logical=current.preparationRequest,files=[];
  for(const ref of logical.files){const f=await source(ref);files.push({path:ref.path,name:ref.name,bytes:ref.bytes,sha256:ref.sha256,bodyBase64:f.bodyBase64});}
  const request={...logical,files},result=await call(endpoint('/output/prepare'),{method:'POST',body:request});
  const planSha=await sha(utf(json(logical.plan)+'\n'));
  if(result.requestId!==logical.requestId||result.planSha256!==planSha||result.basis.dossierId!==current.dossierId||result.basis.caseId!==current.caseId||result.basis.caseVersionId!==current.caseVersionId||result.basis.revision!==logical.expectedRevision)throw Error('The preparation result belongs to another selected source or protocol.');
  if(result.rawText&&(await sha(utf(result.rawText))!==result.rawIdentity.sha256||utf(result.rawText).length!==result.rawIdentity.bytes))throw Error('The complete prepared run changed.');
  const id='output-prepared:'+current.workspaceId+':'+logical.requestId;await immutable(id,result);recordCache.set(id,result);prepared=result;
  await update({...current,plan:logical.plan,advanced:{},preparation:id});rowsOffset=0;render();
 }
 const pending=d=>d.attempts.find(a=>!a.receipt&&!a.superseded)??d.attempts.at(-1);
 async function command(phase){
  await ensureCurrent();if(!prepared||prepared.review.status!=='READY'||!prepared.rawText)throw Error('Complete the source and mapping review first.');
  if(!current.actor.id.trim()||!current.actor.name.trim())throw Error('Enter the actual operator identifier and name.');
  const last=pending(current);if(last&&!last.receipt&&!last.superseded)throw Error('Receive the original pending request before preparing another.');
  if(phase==='candidate'&&current.candidateResult)throw Error('This candidate is already retained.');
  if(phase==='run'&&!current.candidateResult)throw Error('Receive the original candidate first.');
  if(current.runResult)throw Error('This original output is already retained.');
  const request={requestId:crypto.randomUUID(),expectedRevision:phase==='candidate'?current.expectedRevision:current.candidateResult.operation.dossierRevision,
   actor:clone(current.actor),action:phase==='candidate'?'candidate.save':'run.import',payload:phase==='candidate'
    ?{caseId:current.caseId,caseVersionId:current.caseVersionId,candidateId:null,previousVersionId:null,definition:clone(prepared.review.candidate)}
    :{caseId:current.caseId,caseVersionId:current.caseVersionId,candidateVersionId:current.candidateResult.operation.record.versionId,rawText:prepared.rawText}};
  const id='output-command:'+current.workspaceId+':'+request.requestId;await immutable(id,request);recordCache.set(id,request);
  await update({...current,frozen:true,attempts:[...current.attempts,{id:request.requestId,phase,command:id,receipt:null,failure:null}]});render();
 }
 async function apply(){
  await ensureCurrent();const a=pending(current);if(!a)throw Error('Prepare the complete request first.');
  const request=await record(a.command),d=current;let result;
  try{result=await call(endpoint('/reviews?projection=metadata',d),{method:'POST',body:request},d);}
  catch(e){const next=clone(current);next.attempts.find(x=>x.id===a.id).failure={code:e.code??e.message,status:e.status??null,at:new Date().toISOString()};await update(next);render();throw e;}
  if(result.operation?.requestId!==request.requestId||result.operation.action!==request.action)throw Error('The original request result changed.');
  const recordId='output-receipt:'+d.workspaceId+':'+request.requestId;
  // The immutable native operation is stable even when the live dossier summary advances.
  await immutable(recordId,result.operation);recordCache.set(recordId,result.operation);
  const next=clone(current);next.attempts.find(x=>x.id===a.id).receipt=recordId;next.attempts.find(x=>x.id===a.id).failure=null;
  next[a.phase==='candidate'?'candidateResult':'runResult']={operation:result.operation};
  await update(next);
  const full=await call('/api/dossiers/'+encodeURIComponent(d.dossierId),{},d);if(context(d))await onReceived(full);
  render();notify(a.phase==='candidate'?'The exact candidate edition is retained. Prepare its original output import.':'The complete original output, files and plan are retained in the dossier.');
 }
 async function rebase(){
  await ensureCurrent();const a=pending(current);if(!a||a.receipt||a.failure?.code!=='REVISION_CONFLICT')throw Error('First receive the original request and its actual revision-conflict result.');
  const original=await record(a.command),sel=current;
  const status=await call(endpoint('/output/request'),{method:'POST',body:{request:original}});
  if(status.state==='COMPLETE'){await apply();return;}
  if(status.state!=='NOT_FOUND'||status.revision<=original.expectedRevision)throw Error('The original request outcome is not settled at a newer revision.');
  const overview={revision:status.revision};
  const request={...original,requestId:crypto.randomUUID(),expectedRevision:overview.revision},id='output-command:'+sel.workspaceId+':'+request.requestId;
  await immutable(id,request);recordCache.set(id,request);
  const next=clone(current);next.attempts.find(x=>x.id===a.id).superseded={at:new Date().toISOString(),currentRevision:overview.revision,originalRequestAbsent:true};
  next.attempts.push({id:request.requestId,phase:a.phase,command:id,receipt:null,failure:null,previousRequestId:a.id});
  await update(next);render();
 }
 async function preserveSeparate(){
  await writer.catch(()=>{});if(!context(current))throw Error('Reopen the original dossier before preserving its working copy.');
  const previous=clone(current),copy=changed({...previous,id:'output:'+previous.workspaceId+':'+previous.dossierId+':'+crypto.randomUUID(),
   copiedFrom:{id:previous.id,browserRevision:revisions.get(previous.id)??0,commitId:previous.commitId}});
  current=copy;await write(copy);
  unwritten.delete(previous.id);copies.delete(previous.id);storageError=null;
  await reload();render();notify('The complete visible work is saved separately. The other tab’s original edition remains unchanged.');
 }
 async function completeDownload(){
  await writer.catch(()=>{});const d=clone(current),files=[];for(const ref of d.files)files.push({...ref,...await source(ref)});
  const records={};for(const id of [d.preparation,...d.attempts.flatMap(a=>[a.command,a.receipt])].filter(Boolean))records[id]=await record(id);
  save(json({schema:'sf88-original-output-working-copy-file/v1',workingCopy:d,files,records})+'\n','original-output-working-copy.json');
 }
 async function verifyImportedReceipts(d,records){
  const next=clone(d);next.candidateResult=null;next.runResult=null;
  for(const a of next.attempts){
   const request=records[a.command],preparation=records[next.preparation];
   if(!['candidate','run'].includes(a.phase)||!request||request.requestId!==a.id||!same(request.actor,next.actor)||request.payload?.caseId!==next.caseId||request.payload.caseVersionId!==next.caseVersionId||!preparation||preparation.review?.status!=='READY'||!preparation.rawText)throw Error('The original command basis changed.');
   const wanted=a.phase==='candidate'
    ?{caseId:next.caseId,caseVersionId:next.caseVersionId,candidateId:null,previousVersionId:null,definition:preparation.review.candidate}
    :{caseId:next.caseId,caseVersionId:next.caseVersionId,candidateVersionId:next.candidateResult?.operation.record.versionId,rawText:preparation.rawText};
   if(request.action!==(a.phase==='candidate'?'candidate.save':'run.import')||!same(request.payload,wanted))throw Error('The frozen original command differs from its reviewed preparation.');
   const response=await call(endpoint('/output/request',next),{method:'POST',body:{request}},next);
   if(response.state==='COMPLETE'){
    if(a.receipt&&!same(records[a.receipt],response.operation))throw Error('The selected receipt differs from the original dossier history.');
    a.receipt='output-receipt:'+next.workspaceId+':'+a.id;records[a.receipt]=response.operation;
    next[a.phase==='candidate'?'candidateResult':'runResult']={operation:response.operation};a.failure=null;
   }else if(response.state==='NOT_FOUND'){
    if(a.receipt){a.importedReceipt=a.receipt;a.receipt=null;}
    a.failure={code:'ORIGINAL_REQUEST_NOT_RECEIVED',at:new Date().toISOString()};
   }else throw Error('The actual original request could not be reconciled.');
  }return next;
 }
 async function importPlan(file){
  await ensureCurrent();if(current.frozen)throw Error('Create an editable successor before changing the original plan.');
  if(!file||file.size>4*1024*1024)throw Error('Choose a complete original preparation plan up to 4 MiB.');
  const raw=new Uint8Array(await file.arrayBuffer()),p=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw).replace(/^\uFEFF/,''));
  if(p.schema!=='sf88-original-output-plan/v1'||!same(p.protocol,current.plan.protocol)||!Array.isArray(p.originals))throw Error('The complete plan must select this exact original protocol.');
  const d=clone(current),used=new Set();
  for(const spec of [p.source,...p.originals]){
   const matches=d.files.filter(f=>f.bytes===spec.bytes&&f.sha256===spec.sha256);
   const exact=matches.find(f=>f.path===spec.file||f.name===spec.file||f.name===String(spec.file).split('/').at(-1));
   const selected=exact??(matches.length===1?matches[0]:null);
   if(!selected)throw Error('Select the original file matching '+spec.file+' before opening this plan.');
   spec.file=selected.path;used.add(selected.path);
  }
  if(used.size!==d.files.length)throw Error('The selected plan must account for every currently selected original file.');
  const ref=await retainFile(file,'original-plan/'+crypto.randomUUID()+'.json');
  d.files.push(ref);p.originals.push({id:'original-plan-'+crypto.randomUUID(),file:ref.path,path:ref.path,role:'complete original selected preparation plan',mediaType:'application/json',bytes:ref.bytes,sha256:ref.sha256});
  p.mapping.selection??=[];p.mapping.exclude??=[];p.mapping.delimiter??=',';
  d.plan=p;d.advanced={};d.filterTexts=p.mapping.selection.map(x=>json(x.values));d.preparation=null;d.preparationRequest=null;d.table=null;
  await update(d);prepared=null;await inspectTable();
 }
 async function openWorkingCopy(file){
  if(!file||file.size>256*1024*1024)throw Error('Choose the complete saved output working copy up to 256 MiB.');
  const p=JSON.parse(await file.text());let d=p.workingCopy;
  if(p.schema!=='sf88-original-output-working-copy-file/v1'||d?.schema!==SCHEMA||!context(d)||!Array.isArray(d.files)||!Array.isArray(d.attempts)||!Array.isArray(p.files)||!p.records)throw Error('Choose this original workspace and dossier’s complete working copy.');
  for(const f of p.files){
   if(f.id!=='output-source:'+d.workspaceId+':'+f.sha256)throw Error('The original source belongs to another workspace.');
   const b=decode(f.bodyBase64);if(b.length!==f.bytes||await sha(b)!==f.sha256||!d.files.some(x=>x.id===f.id&&x.sha256===f.sha256&&x.bytes===f.bytes))throw Error('The full original source changed.');
   const value={schema:SOURCE,id:f.id,commitId:f.sha256,bytes:f.bytes,sha256:f.sha256,bodyBase64:f.bodyBase64},db=await store(),old=await db.read(f.id);
   if(old&&!same(old.snapshot,value))throw Error('Existing source differs.');if(!old)await db.write(value,0);sourceCache.set(f.id,value);
  }
  for(const ref of d.files)if(!p.files.some(f=>f.id===ref.id&&f.sha256===ref.sha256))throw Error('A complete original file is missing.');
  checkPreparationBasis(d);d.frozen=d.attempts.length>0;
  if(d.preparation){
   const retained=p.records[d.preparation],logical=d.preparationRequest;
   if(!retained||!logical||logical.requestId!==retained.requestId)throw Error('The complete original preparation is missing.');
   const files=logical.files.map(ref=>{const f=p.files.find(v=>v.id===ref.id&&v.bytes===ref.bytes&&v.sha256===ref.sha256);if(!f)throw Error('The original preparation source is missing.');return{path:ref.path,name:ref.name,bytes:ref.bytes,sha256:ref.sha256,bodyBase64:f.bodyBase64};});
   const actual=await call(endpoint('/output/verify',d),{method:'POST',body:{...logical,files}},d);
   for(const name of ['basis','planSha256','review','rawText','rawIdentity'])if(!same(actual[name],retained[name]))throw Error('The retained preparation no longer matches its complete original sources: '+name);
  }
  d=await verifyImportedReceipts(d,p.records);
  for(const [id,value]of Object.entries(p.records)){if(!['output-prepared:','output-command:','output-receipt:'].some(prefix=>id.startsWith(prefix+d.workspaceId+':')))throw Error('The retained record belongs to another workspace.');await immutable(id,value);}
  for(const id of [d.preparation,...d.attempts.flatMap(a=>[a.command,a.receipt])].filter(Boolean))if(!Object.hasOwn(p.records,id))throw Error('A complete original request or result is missing.');
  if(typeof d.id!=='string'||!d.id.startsWith('output:'+d.workspaceId+':'+d.dossierId+':')||!Array.isArray(d.attempts)||!Number.isSafeInteger(d.expectedRevision))throw Error('Invalid original working-copy identity.');
  const old=await(await store()).read(d.id);current=clone(d);
  if(old&&!same(old.snapshot,d))current={...current,id:'output:'+d.workspaceId+':'+d.dossierId+':'+crypto.randomUUID(),importedFrom:d.id};
  else if(old)revisions.set(d.id,old.revision);
  current=changed(current);await write(current);prepared=current.preparation?await record(current.preparation):null;storageError=null;render();
 }
 function binding(label,object,key,headers,{valueOnly=false}={}){
  const b=object[key]??{column:''},wrap=node('div',undefined,'output-binding'),kind=Object.hasOwn(b,'column')?'column':'literal';
  const types=valueOnly?[['column','Original column']]:[['column','Original column'],['literal','Reviewed literal']];
  wrap.append(field(label+' source',kind,v=>{edit(d=>{const target=key.startsWith('denominator:')?d.plan.mapping.denominator:d.plan.mapping.fields;target[key.replace('denominator:','')]={[v]:''};});render();},{options:types}));
  const change=v=>edit(d=>{const target=key.startsWith('denominator:')?d.plan.mapping.denominator:d.plan.mapping.fields;target[key.replace('denominator:','')]={[kind]:v};});
  wrap.append(field(label,kind==='column'?b.column:b.literal,change,kind==='column'?{options:[['','Select exact header'],...headers.map(x=>[x,x])]}:{}));return wrap;
 }
 function jsonField(label,path,value){
  return field(label,current.advanced[path]??json(value),v=>edit(d=>{d.advanced[path]=v;}),{type:'area'});
 }
 function mapping(){
  const d=current,p=d.plan,m=p.mapping,headers=d.table?.headers??[];
  const box=section('Map the original table');
  box.append(field('Delimiter',m.delimiter,v=>{edit(x=>{x.plan.mapping.delimiter=v;x.table=null;});render();},{options:[[',','Comma'],['\t','Tab'],[';','Semicolon']]}),editButton('Read exact headers and source rows',inspectTable));
  if(!headers.length){box.append(node('p','Select the original table and read its headers before mapping.'));return box;}
  const keys=node('fieldset');keys.append(node('legend','Complete original row key'));
  headers.forEach(h=>{const l=node('label'),c=node('input');c.type='checkbox';c.checked=m.rowKeyColumns.includes(h);c.addEventListener('change',()=>edit(x=>{x.plan.mapping.rowKeyColumns=c.checked?[...x.plan.mapping.rowKeyColumns,h]:x.plan.mapping.rowKeyColumns.filter(y=>y!==h);}));l.append(c,node('span',h));keys.append(l);});box.append(keys);
  const fields=group();for(const [k,l]of Object.entries({criterionId:'Measured criterion',label:'Metric label',value:'Original numeric value',unit:'Unit',definition:'Complete measure definition',cohortRef:'Population or segment'}))fields.append(binding(l,m.fields,k,headers,{valueOnly:k==='value'}));box.append(fields);
  const denom=section('Original denominator');
  for(const [k,b]of Object.entries(m.denominator)){const wrap=node('div');wrap.append(binding(k,{['denominator:'+k]:b},'denominator:'+k,headers),editButton('Remove denominator '+k,async()=>{mutate(x=>{delete x.plan.mapping.denominator[k];});render();}));denom.append(wrap);}
  const key=field('New denominator field','',()=>{});const input=key.querySelector('input');denom.append(key,editButton('Add denominator field',async()=>{const name=input.value.trim();if(!/^[A-Za-z][A-Za-z0-9 _.-]{0,79}$/.test(name)||Object.hasOwn(m.denominator,name))throw Error('Choose a new descriptive denominator field.');mutate(x=>{x.plan.mapping.denominator[name]={literal:''};});render();}));box.append(denom);
  box.append(jsonField('Exact unavailable tokens (JSON array)','mapping.missingTokens',m.missingTokens));
  const miss=node('div');const kind=Object.hasOwn(m.missingReason,'column')?'column':'literal';
  miss.append(field('Unavailable explanation source',kind,v=>{edit(x=>{x.plan.mapping.missingReason={[v]:''};});render();},{options:[['column','Original column'],['literal','Reviewed explanation']]}),
   field('Unavailable explanation',m.missingReason[kind],v=>edit(x=>{x.plan.mapping.missingReason={[kind]:v};}),kind==='column'?{options:[['','Choose exact header'],...headers.map(x=>[x,x])]}:{type:'area'}));box.append(miss);
  const filters=section('Exact source selection');
  m.selection.forEach((f,index)=>filters.append(group(field('Original filter column',f.column,v=>edit(x=>{x.plan.mapping.selection[index].column=v;}),{options:headers.map(x=>[x,x])}),field('Allowed exact values (JSON array)',d.filterTexts?.[index]??json(f.values),v=>edit(x=>{x.filterTexts??=[];x.filterTexts[index]=v;}),{type:'area'}),editButton('Remove filter',async()=>{mutate(x=>{x.plan.mapping.selection.splice(index,1);x.filterTexts?.splice(index,1);});render();}))));
  filters.append(editButton('Add source filter',async()=>{mutate(x=>{x.plan.mapping.selection.push({column:headers[0],values:[]});x.filterTexts??=[];x.filterTexts.push('[]');});render();}),node('p','Different filters combine with AND; exact values within one filter match any listed value. Outside-selection rows remain in the review.'));
  box.append(filters,detail('Retained reviewed exclusions',m.exclude));
  m.exclude.forEach((e,index)=>box.append(editButton('Remove reviewed exclusion '+e.key.join(' / '),async()=>{mutate(x=>{x.plan.mapping.exclude.splice(index,1);});render();})));return box;
 }
 function metadata(){
  const p=current.plan,r=p.run,c=p.candidate,box=section('Original edition and execution');
  const set=(path,value)=>edit(d=>{let t=d.plan;const keys=path.split('.');for(const k of keys.slice(0,-1))t=t[k];t[keys.at(-1)]=value;});
  box.append(group(field('Candidate name',c.name,v=>set('candidate.name',v)),field('Candidate release',c.version,v=>set('candidate.version',v)),field('Candidate type',c.kind,v=>set('candidate.kind',v),{options:[['MODEL','Model'],['PLATFORM','Platform'],['ARCHITECTURE','Architecture']]}),field('Candidate context',c.description,v=>set('candidate.description',v),{type:'area'})),jsonField('Complete original candidate configuration','candidate.configuration',c.configuration),jsonField('Candidate source references','candidate.sourceRefs',c.sourceRefs));
  box.append(group(field('Original run identifier',r.externalRunId,v=>set('run.externalRunId',v)),field('Run kind',r.kind,v=>set('run.kind',v),{options:[['IMPORTED_MEASUREMENT','Imported producer measurement'],['SOURCE_NATIVE','Original native execution'],['TRAINING_FIXTURE','Explicit training fixture']]}),field('Actual result state',r.status,v=>set('run.status',v),{options:[['SUCCEEDED','Succeeded'],['FAILED','Failed'],['CANCELLED','Cancelled']]}),field('Original start (ISO timestamp)',r.startedAt,v=>set('run.startedAt',v)),field('Original finish (ISO timestamp)',r.finishedAt,v=>set('run.finishedAt',v)),field('Actual elapsed milliseconds (blank if unavailable)',r.elapsedMs??'',v=>set('run.elapsedMs',v===''?null:Number(v)))));
  box.append(group(field('Original producer',r.engine.name,v=>set('run.engine.name',v)),field('Producer version',r.engine.version,v=>set('run.engine.version',v)),field('Original cohort identifier',r.input.cohortId,v=>set('run.input.cohortId',v)),field('Original protocol identifier',r.input.protocolId,v=>set('run.input.protocolId',v))),
   jsonField('Original command (JSON array)','run.engine.command',r.engine.command),jsonField('Actual runtime','run.engine.runtime',r.engine.runtime),jsonField('Original producer configuration','run.engine.configuration',r.engine.configuration),
   jsonField('Population, period, as-of dates, source release, denominator and method','run.input.definition',r.input.definition),jsonField('Original input source references','run.input.sourceRefs',r.input.sourceRefs),jsonField('Original limitations (JSON array)','run.limitations',r.limitations));return box;
 }
 function rowReview(){
  const review=prepared?.review,d=current,raw=d.table?.rows??[],headers=review?.headers??d.table?.headers??[],all=review?.rows??raw.map(r=>({...r,disposition:'SOURCE_ROW',key:d.plan.mapping.rowKeyColumns.map(k=>r.record[k]),issues:[]}));
  let rows=all.filter(r=>(!rowsFilter||r.disposition===rowsFilter)&&(!rowsSearch||JSON.stringify(r).toLocaleLowerCase().includes(rowsSearch.toLocaleLowerCase())));
  rowsOffset=Math.min(rowsOffset,Math.max(0,Math.floor((rows.length-1)/25)*25));const box=section('Complete row review');
  if(review)box.append(node('p',review.status+' · '+review.coverage.sourceRows+' source rows · '+review.coverage.selectedValues+' measured · '+review.coverage.selectedUndefined+' unavailable · '+review.coverage.reviewRequired+' needing review'),detail('Complete coverage and findings',review.coverage));
  box.append(group(field('Search complete original rows',rowsSearch,v=>{rowsSearch=v;rowsOffset=0;draw();}),field('Disposition',rowsFilter,v=>{rowsFilter=v;rowsOffset=0;draw();},{options:[['','All source rows'],...[...new Set(all.map(r=>r.disposition))].map(x=>[x,x.replaceAll('_',' ')])]})));
  for(const e of box.querySelectorAll('input,select'))e.dataset.outputRead='1';
  const content=node('div');box.append(content);
  function draw(){
   rows=all.filter(r=>(!rowsFilter||r.disposition===rowsFilter)&&(!rowsSearch||JSON.stringify(r).toLocaleLowerCase().includes(rowsSearch.toLocaleLowerCase())));
   const values=rows.slice(rowsOffset,rowsOffset+25).map(r=>{
    const original=Object.fromEntries(headers.map((h,i)=>[h,r.values[i]])),controls=node('div');controls.append(detail('All original values and finding',original),detail('Complete row disposition',r));
    if(!d.frozen)controls.append(button('Review exclusion for row '+r.ordinal,async()=>{
     const dialog=node('dialog',undefined,'output-dialog'),reason=field('Exclusion reason','',()=>{},{type:'area'}),reviewer=field('Actual reviewer',d.actor.name,()=>{});
     dialog.append(node('h3','Review original row '+r.ordinal),detail('Exact original row and key',{key:r.key,original}),reason,reviewer,
      button('Retain this reviewed exclusion',async()=>{
       const note=reason.querySelector('textarea').value.trim(),name=reviewer.querySelector('input').value.trim();if(!note||!name)throw Error('Enter the reason and actual reviewer.');
       const key=current.plan.mapping.rowKeyColumns.map(k=>original[k]);if(!key.length||key.some(v=>typeof v!=='string'))throw Error('Select the complete original row key first.');
       mutate(x=>{x.plan.mapping.exclude=x.plan.mapping.exclude.filter(e=>!same(e.key,key));x.plan.mapping.exclude.push({key,reason:note,reviewer:name,reviewedAt:new Date().toISOString()});});await writer;dialog.close();dialog.remove();render();
      }),button('Close',async()=>{dialog.close();dialog.remove();}));document.body.append(dialog);dialog.showModal();
    }));return[r.ordinal,r.key?.join(' / ')??'',r.disposition,(r.issues??[]).join(', '),controls];
   });
   content.replaceChildren(table(['Row','Original key','Disposition','Findings','Read or review'],values));
   const nav=node('div',undefined,'output-actions'),prev=button('Previous rows',async()=>{rowsOffset=Math.max(0,rowsOffset-25);draw();}),next=button('Next rows',async()=>{rowsOffset+=25;draw();});prev.disabled=rowsOffset===0;next.disabled=rowsOffset+25>=rows.length;nav.append(prev,node('span',(rows.length?rowsOffset+1:0)+'–'+Math.min(rowsOffset+25,rows.length)+' of '+rows.length),next);content.append(nav);updateBusy();
  }draw();return box;
 }
 function operations(){
  const d=current,box=section('Retain in the original comparison');
  box.append(group(field('Operator identifier',d.actor.id,v=>edit(x=>{x.actor.id=v;},{invalidate:false})),field('Operator name',d.actor.name,v=>edit(x=>{x.actor.name=v;},{invalidate:false}))));
  const a=pending(d);if(a&&!a.receipt&&!a.superseded){
   box.append(node('p','Original '+a.phase+' request '+a.id+' is retained. Receive this same request after an interrupted reply.'),button('Apply or receive original '+a.phase,apply));
   if(a.failure)box.append(detail('Last observed failure',a.failure));
   if(a.failure?.code==='REVISION_CONFLICT')box.append(button('Review current revision and prepare successor',rebase));
  }else if(d.runResult)box.append(node('p','Original output retained as '+d.runResult.operation.record.id+'. Open the comparison report, source files and full dossier export.'),detail('Original import receipt',d.runResult));
  else if(d.candidateResult)box.append(node('p','Candidate edition '+d.candidateResult.operation.record.versionId+' is retained.'),button('Prepare original output import',()=>command('run')));
  else if(prepared?.review.status==='READY')box.append(button('Freeze and prepare candidate request',()=>command('candidate')));
  if(d.attempts.length)box.append(detail('Complete operation continuation',d.attempts));return box;
 }
 function render(){
  if(!root||!visible)return;root.replaceChildren();root.className='output-desk';
  root.append(node('h2','Prepare original output'),node('p','Keep the producer’s complete table and original files, review exact mappings and retain the result in the selected comparison protocol.'));
  const nav=node('div',undefined,'output-actions'),saved=node('select');saved.setAttribute('aria-label','Saved original-output working copies');saved.append(option('','Choose a working copy'),...[...copies.values()].filter(context).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).map(x=>option(x.id,(x.plan.candidate.name||'Original output')+' · '+x.updatedAt)));saved.value=current?.id??'';
  saved.addEventListener('change',()=>run(async()=>{await ensureIfDirty();current=clone(copies.get(saved.value)??null);prepared=current?.preparation?await record(current.preparation):null;rowsOffset=0;render();}));
  nav.append(saved,button('New original output',newCopy),button('Reopen saved browser work',async()=>{await ensureIfDirty();await reload();render();}));root.append(nav);
  const imported=node('input');imported.type='file';imported.accept='.json';imported.setAttribute('aria-label','Open complete output working copy');imported.dataset.outputRead='1';imported.addEventListener('change',()=>run(()=>openWorkingCopy(imported.files[0])));root.append(imported);
  if(!current){root.append(node('p','Choose an exact comparison protocol, then begin or reopen its working copy.'));updateBusy();return;}
  const d=current,c=getCase();root.append(node('p','Original dossier revision '+d.expectedRevision+' · protocol '+d.caseVersionId));
  if(!context(d)||c?.id!==d.caseId||c?.versionId!==d.caseVersionId)root.append(node('p','This working copy keeps its original case and protocol. Reopen that protocol before preparing or changing its basis.','output-error'));
  if(storageError)root.append(node('p','Browser storage could not retain the last change: '+storageError+'. Download the complete visible work before leaving.','output-error'));
  const files=section('Complete original files'),tableFile=node('input');tableFile.type='file';tableFile.accept='.csv,.tsv,.txt';tableFile.setAttribute('aria-label','Select original output table');tableFile.addEventListener('change',()=>run(()=>uploadTable(tableFile.files[0])));files.append(tableFile);
  const attachment=node('input');attachment.type='file';attachment.multiple=true;attachment.setAttribute('aria-label','Add original workbooks, reports or logs');attachment.addEventListener('change',()=>run(async()=>{for(const f of attachment.files)await uploadOriginal(f);}));files.append(attachment);
  const planFile=node('input');planFile.type='file';planFile.accept='.json';planFile.setAttribute('aria-label','Open existing complete preparation plan');planFile.addEventListener('change',()=>run(()=>importPlan(planFile.files[0])));files.append(node('p','To open an existing plan, select all its original files first. Its exact original plan is retained alongside the selected browser edition.'),planFile);
  files.append(table(['Original filename','Bytes','Read and retain'],d.files.map(ref=>[ref.name,ref.bytes,button('Download original '+ref.name,async()=>{const f=await source(ref);save(decode(f.bodyBase64),ref.name,'application/octet-stream');})])));
  d.plan.originals.forEach((spec,index)=>files.append(group(field('Original artifact label',spec.role,v=>edit(x=>{x.plan.originals[index].role=v;})),field('Original package member path',spec.path,v=>edit(x=>{x.plan.originals[index].path=v;})),field('Original media type',spec.mediaType,v=>edit(x=>{x.plan.originals[index].mediaType=v;})),editButton('Remove selected original',async()=>{mutate(x=>{const removed=x.plan.originals.splice(index,1)[0];if(removed.file!==x.plan.source.file&&!x.plan.originals.some(s=>s.file===removed.file))x.files=x.files.filter(f=>f.path!==removed.file);});render();}))));
  root.append(files,detail('Exact selected protocol',d.plan.protocol),mapping(),metadata(),rowReview());
  const actions=node('div',undefined,'output-actions');if(storageError||unwritten.has(d.id))actions.append(button('Preserve visible work as separate copy',preserveSeparate));actions.append(editButton('Prepare and review complete output',prepare),button('Download complete working copy',completeDownload),button('Download selected plan',async()=>save(json(selectedPlan(current))+'\n','original-output-plan.json')));
  if(prepared)actions.append(button('Download full mapping review',async()=>save(json(prepared.review)+'\n','original-output-review.json')),button('Download prepared complete run',async()=>{if(!prepared.rawText)throw Error('Resolve all mapping findings first.');save(prepared.rawText,'original-output-run.json');}));
  actions.append(button('Create editable successor',async()=>{await ensureCurrent();const protocol=getCase();if(!protocol||protocol.id!==current.caseId||protocol.versionId!==current.caseVersionId)throw Error('Select this original protocol before creating its editable successor.');const successor=clone(current);successor.expectedRevision=getRevision();successor.id='output:'+successor.workspaceId+':'+successor.dossierId+':'+crypto.randomUUID();successor.predecessor=current.id;successor.frozen=false;successor.attempts=[];successor.candidateResult=null;successor.runResult=null;successor.preparation=null;successor.preparationRequest=null;current=changed(successor);prepared=null;await write(current);render();}));
  root.append(actions,operations());updateBusy();
 }
 function updateBusy(){
  if(!root)return;root.setAttribute('aria-busy',String(busy||isBusy()));
  for(const e of root.querySelectorAll('button,input,select,textarea')){
   const disable=busy||isBusy()||Boolean(current?.frozen&&(e.dataset.outputEdit||!e.dataset.outputRead&&e.tagName!=='BUTTON'&&e!==root.querySelector('select[aria-label="Saved original-output working copies"]')));
   if(disable){if(e.dataset.outputDisabled===undefined)e.dataset.outputDisabled=e.disabled?'1':'0';e.disabled=true;}
   else if(e.dataset.outputDisabled!==undefined){e.disabled=e.dataset.outputDisabled==='1';delete e.dataset.outputDisabled;}
  }
 }
 return{
  mount(element){root=element;visible=true;if(current&&!context(current)){current=null;prepared=null;storageError=null;}const ticket=++epoch;reload().then(()=>{if(ticket===epoch)render();}).catch(e=>{storageError=e.message;if(ticket===epoch)render();});},
  hide(){visible=false;++epoch;root=null;},
  updateBusy,
 };
}
