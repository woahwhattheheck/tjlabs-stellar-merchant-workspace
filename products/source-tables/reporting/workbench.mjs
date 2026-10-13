// MIT. Installed Reporting Programmes browser. The native engine owns every record.
import * as M from './workbench-model.mjs';
const $=id=>document.getElementById(id), $$=s=>[...document.querySelectorAll(s)];
const KEY='stellar-forge.reporting-workbench.v1', MAX_WORKBENCH=512*1024*1024;
let work=M.freshWorkbench(), generation=0, epoch=0, busy=false, dirty=false, saveTimer=null, knownRevision=null, storageBlocked=false, lastStorageIssue='', readSequence=0, identitySequence=0;
const groupRevision=new Map(),readTokens=new Map();
const writer=crypto.randomUUID(), pretty=x=>JSON.stringify(x,null,2)+'\n';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function storageStatus(text,warning=false){$('storage-status').textContent=text;$('storage-status').classList.toggle('warning',warning);}
function newContext(){work.context.operationId='record-'+crypto.randomUUID();work.context.at=new Date().toISOString();}
function touch(group){generation++;dirty=true;if(group)groupRevision.set(group,(groupRevision.get(group)||0)+1);clearTimeout(saveTimer);saveTimer=setTimeout(saveLocal,700);}
function readEnvelope(){const raw=localStorage.getItem(KEY);if(!raw)return null;const value=JSON.parse(raw);if(value.schema!=='stellar-forge.reporting-workbench-storage.v1'||typeof value.revision!=='string'||!value.work)throw Error('The saved browser copy has an unfamiliar format.');return value;}
function saveLocal(){
 if(storageBlocked)return false;
 try{const current=readEnvelope();if((current?.revision||null)!==knownRevision){storageBlocked=true;lastStorageIssue='Another tab changed or removed the browser copy. Your current work is retained here. Save a complete workbench, then Restore browser copy to inspect that successor.';storageStatus(lastStorageIssue,true);return false;}
 const revision=crypto.randomUUID();const envelope={schema:'stellar-forge.reporting-workbench-storage.v1',revision,writer,savedAt:new Date().toISOString(),work};
 localStorage.setItem(KEY,JSON.stringify(envelope));knownRevision=revision;lastStorageIssue='';storageStatus('Browser copy saved '+new Date(envelope.savedAt).toLocaleTimeString()+'. Keep a full downloaded workbench for portable custody.');return true;
 }catch(error){lastStorageIssue='Browser storage could not retain the full copy: '+error.message+'. Save workbench with drafts to keep every file.';storageStatus(lastStorageIssue,true);return false;}
}
function download(name,content,type='application/json'){
 const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function fileDownload(file){download(file.filename,M.originalBytes(file),file.mediaType||'application/octet-stream');}
function saveWorkbench(suffix=''){work.savedAt=new Date().toISOString();download((work.project?.reportingProgramme.id||'reporting')+'-workbench'+suffix+'.json',pretty(work));dirty=false;}
function hasWork(){return !!work.project||!!work.pending||Object.values(work.drafts).some(d=>Object.values(d).some(v=>Array.isArray(v)?v.length:v!==null&&typeof v==='object'))||work.drafts.definition.query||work.drafts.definition.title||work.drafts.create.label||generation>0;}
async function locked(label,fn){if(busy)return;busy=true;$('workbench-main').inert=true;status(label);try{await fn();}catch(error){status(error.message||String(error),true);}finally{busy=false;$('workbench-main').inert=false;}}
function options(select,rows,selected,empty){select.innerHTML='<option value="">'+escape(empty)+'</option>'+rows.map(r=>'<option value="'+escape(r.value)+'">'+escape(r.label)+'</option>').join('');select.value=selected||'';}
function tab(name){work.tab=['definition','run','delivery','source','history'].includes(name)?name:'definition';for(const b of $$('[data-tab]'))b.setAttribute('aria-selected',String(b.dataset.tab===work.tab));for(const p of $$('.panel'))p.hidden=p.id!=='panel-'+work.tab;}
function showFiles(id,files,group,field,multiple=false){$(id).innerHTML=files.filter(Boolean).map((f,i)=>'<div class="file-row"><div><strong>'+escape(f.filename)+'</strong><small>'+escape(f.bytes??new TextEncoder().encode(f.content).length)+' bytes · '+escape(f.encoding||'utf8')+'</small></div><div class="actions"><button type="button" data-draft-download="'+escape(group+'.'+field+'.'+i)+'">Download</button>'+(multiple?'<button type="button" data-remove="'+escape(group+'.'+field+'.'+i)+'">Remove</button>':'')+'</div></div>').join('')||'<p class="hint">No file selected.</p>';}
function renderFiles(){showFiles('definition-original',[work.drafts.definition.queryFile],'definition','queryFile');showFiles('run-result',[work.drafts.run.result],'run','result');showFiles('run-files-list',work.drafts.run.files,'run','files',true);showFiles('delivery-receipt',[work.drafts.delivery.receipt],'delivery','receipt');showFiles('source-files-list',work.drafts.source.files,'source','files',true);showFiles('desk-file-info',[work.drafts.desk.file],'desk','file');}
function renderHistory(){
 const p=work.project?.reportingProgramme;if(!p){$('history').textContent='Create or open a complete programme to inspect retained history.';$('definition-history').textContent='';renderOriginals();return;}
 $('definition-history').innerHTML='<details><summary>'+p.definitions.length+' retained definition revisions</summary>'+p.definitions.map(d=>'<div class="file-row"><div><strong>'+escape(d.id)+' · revision '+d.revision+'</strong><small>'+escape(d.value.title)+' · '+escape(d.at)+'</small><small>'+escape(d.sha256)+'</small></div><button type="button" data-load-definition="'+escape(d.sha256)+'">Load into editor</button></div>').join('')+'</details>';
 const histories=[['Definitions',p.definitions],['Runs',p.runs],['Delivery observations',p.deliveries],['Operations',p.operations]];
 $('history').innerHTML=histories.map(([label,rows])=>'<details><summary>'+label+' ('+rows.length+')</summary>'+rows.map((row,i)=>'<details><summary>'+escape(row.id)+' · '+escape(row.status||row.kind||(row.revision?'revision '+row.revision:''))+' · '+escape(row.at)+'</summary><pre>'+escape(pretty(row))+'</pre>'+(label==='Operations'?'<button type="button" data-select-operation="'+i+'">Select exact operation for recovery</button>':'')+'</details>').join('')+'</details>').join('');
 renderOriginals();
}
function renderOriginals(){const files=work.project?.reportingProgramme.files||[],filter=$('original-filter').value.toLowerCase();$('original-files').innerHTML=files.map((f,i)=>({f,i})).filter(({f})=>f.filename.toLowerCase().includes(filter)).map(({f,i})=>'<div class="file-row"><div><strong>'+escape(f.filename)+'</strong><small>'+f.bytes+' bytes · '+escape(f.mediaType)+'</small><small>'+escape(f.sha256)+'</small></div><button type="button" data-original="'+i+'">Download original</button></div>').join('')||'<p class="hint">No matching original files.</p>';}
function renderSelects(){const p=work.project?.reportingProgramme;options($('run-definition'),(p?.definitions||[]).map(d=>({value:d.sha256,label:d.id+' · r'+d.revision+' · '+d.value.title})),work.drafts.run.definitionSha256,'Choose the exact revision');options($('delivery-run'),(p?.runs||[]).map(r=>({value:r.id,label:r.id+' · '+r.status+' · '+r.reportId})),work.drafts.delivery.runId,'Choose original run');options($('delivery-predecessor'),(p?.deliveries||[]).filter(d=>d.runId===work.drafts.delivery.runId).map(d=>({value:d.id,label:d.id+' · '+d.status})),work.drafts.delivery.predecessorId,'No earlier attempt');}
function renderPending(){const held=work.heldOperations||[];$('held-operations').innerHTML=held.length?'<h3>Earlier unfinished operations</h3>'+held.map((o,i)=>'<div class="file-row"><span>'+escape(o.type==='desk'?o.context.operationId:o.request.operationId)+'</span><button type="button" data-select-held="'+i+'">Select exact held operation</button></div>').join(''):'';const p=work.pending;$('pending-status').textContent=p?(p.status==='applied'?'Applied operation retained for exact recovery.':'Prepared operation retained. Current forms are separate from this exact request.'):'No operation has been prepared.';$('pending-json').textContent=p?pretty(p.type==='desk'?{type:p.type,context:p.context,sourceFilename:p.sourceFilename,source:p.source}:p.request):'No operation selected.';for(const id of ['download-request','retry-operation'])$(id).disabled=!p;$('download-preimage').disabled=!p?.preimage;}
async function renderIdentity(){const serial=++identitySequence,project=work.project;if(!project){$('project-identity').textContent='No project selected.';return;}try{const identity=await M.programmeIdentity(project);if(serial===identitySequence&&project===work.project)$('project-identity').textContent=identity.projectSha256;}catch(error){if(serial===identitySequence)$('project-identity').textContent=error.message;}}
function render(){
 const p=work.project?.reportingProgramme;$('project-title').textContent=p?p.label:'Open or create a reporting programme';$('project-summary').textContent=p?p.id+' · '+p.definitions.length+' definition revisions · '+p.runs.length+' runs · '+p.deliveries.length+' delivery observations · '+p.files.length+' original files':'Open a complete project, restore an unfinished workbench, or create a programme with its first report below.';
 $('create-fields').hidden=!!p;$('record-definition').textContent=p?'Save report definition revision':'Create programme with this report';
 for(const e of $$('[data-group][data-field]')){const v=work.drafts[e.dataset.group][e.dataset.field];if(e.type==='checkbox')e.checked=v;else e.value=v;}
 for(const e of $$('[data-context]'))e.value=work.context[e.dataset.context];
 for(const id of ['save-project','export-handover'])$(id).disabled=!p;
 for(const e of $$('[data-record]'))e.disabled=e.dataset.record!=='desk'&&!p;
 renderSelects();renderFiles();renderHistory();renderPending();tab(work.tab);void renderIdentity();
}
async function record(kind){
 await locked('Preparing the complete operation…',async()=>{
  const selected=await M.prepareRequest(work,kind,work.context);if(work.pending?.status==='prepared')work.heldOperations.push(M.clone(work.pending));work.pending=selected;touch();saveLocal();renderPending();status('Applying the retained operation through the installed programme…');
  const result=await M.applyPrepared(work);work=result.work;newContext();touch();saveLocal();render();status(result.replayed?'Recovered the original operation; later project history is preserved.':'Recorded the complete operation. Save the project or full workbench to retain this successor.');
 });
}
async function recover(){await locked('Recovering the exact retained operation…',async()=>{const result=await M.applyPrepared(work);work=result.work;touch();saveLocal();render();status(result.replayed?'Exact operation recovered with all later project history intact.':'The retained original operation is now applied.');});}
async function selectFiles(event,group,field,{text=false,multiple=false}={}){
 const selected=[...event.target.files];if(!selected.length)return;
 const key=group+'.'+field,sequence=++readSequence,initialWork=work,initialEpoch=epoch,revision=groupRevision.get(group)||0;readTokens.set(key,sequence);
 try{const received=[];for(const file of selected)received.push(await M.fileInput(file,{text}));
 if(readTokens.get(key)!==sequence)return;
 if(busy||work!==initialWork||epoch!==initialEpoch||(groupRevision.get(group)||0)!==revision)throw Error('The workspace or '+group+' form changed while reading the selected file. Your current work is retained; choose that file again.');
 if(group==='definition'){work.drafts.definition.queryFile=received[0];work.drafts.definition.query=received[0].content;work.drafts.definition.queryFilename=received[0].filename;}
 else if(multiple)work.drafts[group][field].push(...received);
 else work.drafts[group][field]=received[0];
 touch(group);render();status('Retained '+received.length+' complete original file'+(received.length===1?'':'s')+' in the unfinished form.');
 }catch(error){if(readTokens.get(key)===sequence)status(error.message,true);}finally{if(readTokens.get(key)===sequence)event.target.value='';}
}
async function openFile(event){
 const file=event.target.files[0];if(!file)return;const token=++readSequence,key='open-project',initialWork=work,initialGeneration=generation,initialEpoch=epoch;readTokens.set(key,token);
 try{if(file.size>MAX_WORKBENCH)throw Error('Choose a workbench file smaller than 512 MiB.');const bytes=await file.arrayBuffer();const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);const candidate=await M.openWorkbench(JSON.parse(text.replace(/^\uFEFF/,'')));
 if(readTokens.get(key)!==token)return;if(busy||work!==initialWork||generation!==initialGeneration||epoch!==initialEpoch)throw Error('The workspace changed while this file was opening. Your current work is retained; choose the saved file again.');
 if(hasWork())saveWorkbench('-before-open');work=candidate;epoch++;generation++;dirty=false;groupRevision.clear();if(!work.context.operationId)newContext();render();saveLocal();status('Opened the complete project and retained workbench drafts. The previous workspace was downloaded when it contained work.');
 }catch(error){if(readTokens.get(key)===token)status(error.message,true);}finally{if(readTokens.get(key)===token)event.target.value='';}
}
async function restoreBrowser(){await locked('Opening the complete browser copy…',async()=>{const envelope=readEnvelope();if(!envelope)throw Error('No browser copy is stored on this origin.');const candidate=await M.openWorkbench(envelope.work);if(hasWork())saveWorkbench('-before-restore');work=candidate;epoch++;generation++;dirty=false;knownRevision=envelope.revision;storageBlocked=false;groupRevision.clear();if(!work.context.operationId)newContext();render();storageStatus('Restored the complete browser copy. Keep a downloaded workbench for portable custody.');status('Restored the browser copy; the prior in-memory workspace was downloaded.');});}
document.addEventListener('input',event=>{const e=event.target;if(e.dataset.group){work.drafts[e.dataset.group][e.dataset.field]=e.type==='checkbox'?e.checked:e.value;touch(e.dataset.group);}else if(e.dataset.context){work.context[e.dataset.context]=e.value;touch('context');}});
document.addEventListener('change',event=>{const e=event.target;if(e.dataset.group==='delivery'&&e.dataset.field==='runId'){work.drafts.delivery.predecessorId='';touch('delivery');renderSelects();}});
document.addEventListener('click',event=>{
 const b=event.target.closest('button');if(!b||busy)return;
 if(b.dataset.tab){tab(b.dataset.tab);touch();return;}
 if(b.dataset.record){void record(b.dataset.record);return;}
 if(b.dataset.clear){const[g,k]=b.dataset.clear.split('.');work.drafts[g][k]=null;touch(g);renderFiles();return;}
 if(b.dataset.remove){const[g,k,i]=b.dataset.remove.split('.');work.drafts[g][k].splice(Number(i),1);touch(g);renderFiles();return;}
 if(b.dataset.draftDownload){const[g,k,i]=b.dataset.draftDownload.split('.'),v=work.drafts[g][k];fileDownload(Array.isArray(v)?v[Number(i)]:v);return;}
 if(b.dataset.original!==undefined){fileDownload(work.project.reportingProgramme.files[Number(b.dataset.original)]);return;}
 if(b.dataset.loadDefinition){if(work.drafts.definition.query||work.drafts.definition.title)saveWorkbench('-before-definition-load');work.drafts.definition=M.definitionDraft(work.project,b.dataset.loadDefinition);touch('definition');render();status('Loaded the retained definition into the editor. Saving it creates a full successor revision.');return;}
 if(b.dataset.selectHeld!==undefined){const i=Number(b.dataset.selectHeld),chosen=work.heldOperations.splice(i,1)[0];if(work.pending?.status==='prepared')work.heldOperations.push(M.clone(work.pending));work.pending=chosen;touch();renderPending();status('Selected the exact earlier unfinished operation; current forms remain unchanged.');return;}
 if(b.dataset.selectOperation!==undefined){const op=work.project.reportingProgramme.operations[Number(b.dataset.selectOperation)];if(work.pending?.status==='prepared')work.heldOperations.push(M.clone(work.pending));work.pending={type:'programme',request:M.clone(op.request),preimage:null,status:'applied'};touch();renderPending();status('Selected the exact original operation for recovery.');}
});
$('record-definition').addEventListener('click',()=>record(work.project?'define':'create'));
$('new-context').addEventListener('click',()=>{newContext();touch('context');for(const e of $$('[data-context]'))e.value=work.context[e.dataset.context];status('Prepared a new operation identity; the previous exact prepared request remains retained.');});
$('retry-operation').addEventListener('click',recover);
$('download-request').addEventListener('click',()=>{if(!work.pending)return;const p=work.pending;if(p.type==='desk'){download('desk-receive-context.json',pretty(p.context));download(p.sourceFilename||'report-handover.json',p.source);}else download(p.request.operationId+'.json',pretty(p.request));});
$('download-preimage').addEventListener('click',()=>{if(work.pending?.preimage)download('programme-before-operation.json',pretty(work.pending.preimage));});
$('save-workbench').addEventListener('click',()=>{saveWorkbench();status('Downloaded the complete workbench, including unfinished forms and the exact retained operation.');});
$('save-project').addEventListener('click',()=>{if(work.project)download(work.project.reportingProgramme.id+'-project.json',pretty(work.project));});
$('export-handover').addEventListener('click',()=>locked('Exporting the complete native programme handover…',async()=>{const out=await M.exportProgramme(work.project);download(work.project.reportingProgramme.id+'-handover.zip',out.bytes,'application/zip');status('Downloaded the complete native handover with '+out.files.length+' members. Open its project and originals in the same installed workflow.');}));
$('new-workbench').addEventListener('click',()=>{if(hasWork())saveWorkbench('-before-new');work=M.freshWorkbench();newContext();epoch++;generation=0;dirty=false;groupRevision.clear();render();saveLocal();status('Started a new workbench. Existing work was downloaded before replacement.');});
$('restore-browser').addEventListener('click',restoreBrowser);
$('open-project').addEventListener('change',openFile);
for(const [id,g,k,o]of [['sql-file','definition','queryFile',{text:true}],['result-file','run','result',{text:true}],['run-files','run','files',{multiple:true}],['receipt-file','delivery','receipt',{}],['source-files','source','files',{multiple:true}],['desk-file','desk','file',{text:true}]])$(id).addEventListener('change',e=>selectFiles(e,g,k,o));
$('download-draft-sql').addEventListener('click',()=>download(work.drafts.definition.queryFilename||'report.sql',work.drafts.definition.query,'application/sql'));
$('original-filter').addEventListener('input',renderOriginals);
window.addEventListener('storage',event=>{if(event.key!==KEY)return;storageBlocked=true;lastStorageIssue='Another tab changed the saved browser copy. Current work remains here; download it before restoring the other copy.';storageStatus(lastStorageIssue,true);});
window.addEventListener('beforeunload',event=>{clearTimeout(saveTimer);if(!storageBlocked)saveLocal();if(dirty){event.preventDefault();event.returnValue='';}});
await locked('Opening the installed workbench…',async()=>{try{const envelope=readEnvelope();if(envelope){work=await M.openWorkbench(envelope.work);knownRevision=envelope.revision;storageStatus('Restored the complete browser copy, including unfinished forms.');}else storageStatus('No browser copy yet. Save a complete downloaded workbench as you work.');}catch(error){storageBlocked=true;storageStatus('The existing browser copy was preserved: '+error.message+' Open a valid downloaded workbench to continue.',true);}if(!work.context.operationId)newContext();render();status('Reporting Programmes is ready. Open a complete project or define the first report.');});
