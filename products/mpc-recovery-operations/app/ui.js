const STORAGE='mpc-recovery-operations.v1';
let reviewClockPinned=false;
let workspace,tab='overview',draftPlan=null,editingRecovery=null,importDraft=null,previewRows=null;
const $=s=>document.querySelector(s),html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),json=v=>JSON.stringify(v,null,2);
const id=prefix=>prefix+'-'+crypto.randomUUID();
const arr=value=>Array.isArray(value)?value:Object.values(value||{});
const stamp=()=>new Date().toISOString();
const reviewTime=()=>reviewClockPinned&&$('#asof').value?new Date($('#asof').value+'Z').toISOString():stamp();
const actor=()=>{const value=$('#actor').value.trim();if(!value)throw Error('Enter the operating engineer before saving.');return value;};
const option=(value,label,selected)=>'<option value="'+html(value)+'"'+(String(value)===String(selected)?' selected':'')+'>'+html(label)+'</option>';
const input=(name,label,value='',type='text',extra='')=>'<label>'+html(label)+'<input id="'+html(name)+'" type="'+type+'" value="'+html(value??'')+'" '+extra+'></label>';
const area=(name,label,value='',rows=3)=>'<label>'+html(label)+'<textarea id="'+html(name)+'" rows="'+rows+'">'+html(value)+'</textarea></label>';
const select=(name,label,values,value='')=>'<label>'+html(label)+'<select id="'+name+'">'+values.map(v=>Array.isArray(v)?option(v[0],v[1],value):option(v,v,value)).join('')+'</select></label>';
const check=(name,label,value=false)=>'<label><input type="checkbox" id="'+name+'"'+(value?' checked':'')+'>'+html(label)+'</label>';
const nullableNumber=value=>value===''||value===null||value===undefined?null:Number(value);
const list=value=>String(value||'').split(',').map(v=>v.trim()).filter(Boolean);
const badge=value=>'<span class="badge">'+html(value??'Unrecorded')+'</span>';
const empty=message=>'<div class="empty">'+html(message)+'</div>';
const cells=(headers,rows)=>rows.length?'<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th>'+html(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':empty('No records have been saved.');
const panel=(title,body)=>'<section class="panel"><h3>'+html(title)+'</h3>'+body+'</section>';
const details=(title,value)=>'<details><summary>'+html(title)+'</summary><pre>'+html(json(value))+'</pre></details>';
const heading=(title,description,actions='')=>'<div class="section-heading"><div><h2>'+html(title)+'</h2><p>'+html(description)+'</p></div><div class="actions">'+actions+'</div></div>';
const sourceOptions=()=>[['','Choose retained source'],...arr(workspace.sources).map(s=>[s.id,s.name])];
const sourceRefFields=(prefix,refs=[])=>select(prefix+'-source','Retained source',sourceOptions(),refs[0]?.sourceId||'')+input(prefix+'-locator','Source location',refs[0]?.locator||'whole-file');
const readRefs=prefix=>{const sourceId=$('#'+prefix+'-source')?.value;return sourceId?[{sourceId,locator:$('#'+prefix+'-locator').value||'whole-file'}]:[];};
const plans=()=>arr(workspace.plans);
const currentPlan=()=>plans().find(p=>p.id===workspace.activePlanId)||plans().at(-1);
const planOptions=()=>[['','Choose plan edition'],...plans().map(p=>[p.id,p.title])];
const pickPlan=planId=>plans().find(p=>p.id===planId);
const formatTime=value=>value?new Date(value).toISOString().replace('T',' ').replace('.000Z',' UTC'):'Unrecorded';
function notice(message,error=false){$('#notice').textContent=message;$('#notice').classList.toggle('error',error);}
let branchStore,branchRecord,branchCatalog=[],operating=false,actionContext=null,draftBasis=null;
const rememberedEditors=new Map(),SESSION_BRANCH='mpc-recovery-selected-branch.v1';
function selectedContext(){return{id:branchRecord.id,workspaceId:workspace.id,revision:workspace.revision,snapshotSha256:branchRecord.snapshotSha256};}
function sameBranch(c){if(!branchRecord||c.id!==branchRecord.id||c.workspaceId!==workspace.id)throw Error('Reopen the exact selected browser branch before continuing this operation.');}
function lockControls(){const previous=[...document.querySelectorAll('button,input,select,textarea')].map(el=>[el,el.disabled]);previous.forEach(([el,value])=>{if(!value)el.dataset.mpcTemporaryDisabled='true';el.disabled=true;});return()=>previous.forEach(([el,value])=>{if(el.isConnected){el.disabled=value;delete el.dataset.mpcTemporaryDisabled;}});}
function action(fn){return async event=>{event?.preventDefault();if(operating)return;operating=true;actionContext=branchRecord?{...(draftBasis||selectedContext())}:null;const unlock=lockControls();try{await fn(event);}catch(e){notice(e.message,true);}finally{unlock();actionContext=null;operating=false;}};}
async function commitBatch(commands,message){
 const expected={...(actionContext||draftBasis||selectedContext())};sameBranch(expected);
 let next=workspace;const operator=actor();
 for(const {type,payload} of commands){const outcome=Model.applyCommand(next,{id:id('cmd'),actor:operator,at:stamp(),expectedRevision:next.revision,type,payload});next=outcome.workspace;}
 await persist(next,expected);render();notice(message||'Saved in this browser branch with the original source and operation history.');
}
async function command(type,payload,message){return commitBatch([{type,payload}],message);}
async function persist(next,expected=actionContext||draftBasis||selectedContext()){
 sameBranch(expected);const snapshot=Model.exportSnapshot(next);
 const saved=await branchStore.save({id:expected.id,expected,snapshot});sameBranch(expected);
 branchRecord=saved;workspace=Model.receiveSnapshot(saved.snapshot);draftBasis=null;rememberedEditors.delete(saved.id);
 $('#storage').textContent='Saved independently in this browser';await refreshBranchChoices();
}
function editorState(){
 if(tab==='plan')retainPlanFields();
 return{basis:{...(draftBasis||selectedContext())},tab,draftPlan,editingRecovery,importDraft,previewRows,proposalSelected,proposalComparison,editWorkload,editRepository,jobsPlanId,jobCorrection,recoveryCorrection,incidentCorrection,hurricaneCorrection,reportFrom,reportTo,
 fields:[...document.querySelectorAll('#main input[id],#main select[id],#main textarea[id]')].map(el=>({id:el.id,value:el.type==='file'?'':el.value,checked:el.checked,files:el.type==='file'?[...el.files]:null}))};
}
function rememberEditors(){if(branchRecord)rememberedEditors.set(branchRecord.id,structuredClone(editorState()));}
function resetEditors(){draftPlan=null;editingRecovery=null;importDraft=null;previewRows=null;proposalSelected=null;proposalComparison=null;editWorkload=null;editRepository=null;jobsPlanId=null;jobCorrection=null;recoveryCorrection=null;incidentCorrection=null;hurricaneCorrection=null;reportFrom=null;reportTo=null;draftBasis=null;}
function restoreEditors(saved){
 if(!saved)return;({tab,draftPlan,editingRecovery,importDraft,previewRows,proposalSelected,proposalComparison,editWorkload,editRepository,jobsPlanId,jobCorrection,recoveryCorrection,incidentCorrection,hurricaneCorrection,reportFrom,reportTo}=saved);draftBasis=saved.basis;
}
function restoreFields(saved){for(const f of saved?.fields||[]){const el=document.getElementById(f.id);if(!el)continue;if(f.files){if(typeof DataTransfer!=='undefined'){const dt=new DataTransfer();for(const file of f.files)dt.items.add(file);el.files=dt.files;}}else{el.value=f.value;if(el.type==='checkbox'||el.type==='radio')el.checked=!!f.checked;}}}
async function refreshBranchChoices(){try{branchCatalog=await branchStore.list();const el=$('#browser-branch');if(el)el.innerHTML=branchCatalog.map(r=>option(r.id,r.label+' · r'+r.revision+' · '+r.id.slice(-8),branchRecord?.id)).join('');}catch(error){const el=$('#browser-branch');if(el&&branchRecord)el.innerHTML=option(branchRecord.id,branchRecord.label+' · r'+branchRecord.revision,branchRecord.id);$('#storage').textContent='Current branch retained; reopen to refresh the branch list. '+error.message;}}
async function activateBranch(record,{remember=true,discard=false}={}){
 if(remember)rememberEditors();branchRecord=record;workspace=Model.receiveSnapshot(record.snapshot);
 if(discard)rememberedEditors.delete(record.id);resetEditors();const saved=rememberedEditors.get(record.id);restoreEditors(saved);
 try{sessionStorage.setItem(SESSION_BRANCH,record.id);}catch{}
 await refreshBranchChoices();render();restoreFields(saved);
 if(saved&&saved.basis.snapshotSha256!==record.snapshotSha256)notice('This branch advanced in another tab. Its remembered form remains visible; discard that draft and reopen the saved edition before another save.',true);
 else notice('Opened '+record.label+' as an independent browser workspace.');
}
function installBranchControls(){
 const box=document.createElement('div');box.dataset.mpcBranchControls='true';box.className='toolbar no-print';box.innerHTML='<label class="operator">Browser workspace<select id="browser-branch"></select></label><button type="button" id="open-browser-branch">Open selected workspace</button><button type="button" id="reload-browser-branch">Discard form and reload saved edition</button><span id="branch-identity" class="metadata"></span>';document.querySelector('.app-header').append(box);
 $('#open-browser-branch').onclick=action(async()=>{const next=await branchStore.read($('#browser-branch').value);await activateBranch(next);});
 $('#reload-browser-branch').onclick=action(async()=>{if(!window.confirm('Discard this branch’s unsaved form values and reopen its saved edition? Saved history and other branches stay intact.'))return;const original=selectedContext(),next=await branchStore.read(original.id);sameBranch(original);await activateBranch(next,{remember:false,discard:true});});
}
function download(name,body,type='application/json'){
 const blob=body instanceof Blob?body:new Blob([body],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function exportWorkspace(){
 const snapshot=Model.exportSnapshot(workspace),content=Model.canonical(snapshot);
 download(workspace.id+'-r'+workspace.revision+'.json',json({format:'mpc-recovery-portable.v1',sha256:Codec.sha256(content),snapshot}));notice('Complete source editions, operational records and history exported.');
}
async function receiveFile(file){
 const original=selectedContext(),creationId='branch-'+crypto.randomUUID(),raw=await file.text();sameBranch(original);
 const p=JSON.parse(raw);if(p.format!=='mpc-recovery-portable.v1'||p.sha256!==Codec.sha256(Model.canonical(p.snapshot)))throw Error('The workspace checksum or format differs.');
 const received=Model.receiveSnapshot(p.snapshot);
 const next=await branchStore.create({id:creationId,label:'Received '+file.name.slice(0,180),snapshot:Model.exportSnapshot(received),origin:{kind:'PORTABLE_RECEIVE',parentBrowserBranch:original.id,originalWorkspaceId:original.workspaceId,originalRevision:original.revision,originalSnapshotSha256:original.snapshotSha256,receivedFileName:file.name,receivedFileSha256:Codec.sha256(raw),receivedSnapshotSha256:p.sha256}});
 sameBranch(original);await activateBranch(next);notice('Complete workspace received and reopened as a separate browser branch. The prior saved branch and its forms remain available.');
}
function recordSource(file,text,origin){
 return {id:id('source'),name:file.name,mediaType:file.type||'text/plain',encoding:'utf8',content:text,bytes:new TextEncoder().encode(text).length,sha256:Codec.sha256(text),origin:origin||'Operator-selected file',observedAt:stamp()};
}
function sourceRow(source){return [html(source.name),html(source.mediaType),html(source.bytes),html(source.origin),'<code>'+html(source.sha256)+'</code>','<button data-source-download="'+html(source.id)+'">Download original</button>'];}
function sourceLinks(refs){return (refs||[]).map(r=>'<span class="source-link">'+html(arr(workspace.sources).find(s=>s.id===r.sourceId)?.name||r.sourceId)+' · '+html(r.locator)+'</span>').join('');}
function render(){
 if(!reviewClockPinned)$('#asof').value=new Date().toISOString().slice(0,19);
 $('#workspace-title').textContent=workspace.title;
 $('#revision').textContent='Revision '+workspace.revision;
 if($('#branch-identity'))$('#branch-identity').textContent=branchRecord.label+' · '+branchRecord.id;
 if($('#browser-branch'))$('#browser-branch').value=branchRecord.id;
 $('#scope').textContent=plans().length+' plan editions · '+arr(workspace.sources).length+' retained sources';
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 ({overview:renderOverview,proposal:renderProposal,plan:renderPlan,jobs:renderJobs,recovery:renderRecovery,incidents:renderIncidents,acceptance:renderAcceptance,sources:renderSources,history:renderHistory})[tab]();
}
function renderSources(){
 $('#main').innerHTML=heading('Source editions and intake','Retain the complete planning export, provider logs, installation inventory and recovery observations before mapping their contents.')+
 panel('Import an original file','<form id="source-form" class="form-grid">'+input('source-file','Original UTF-8 file','','file')+input('source-origin','Source and acquisition details')+'<div class="actions"><button class="primary">Retain complete source</button></div></form>')+
 panel('Retained source editions',cells(['File','Format','Bytes','Origin','SHA-256','Original'],arr(workspace.sources).map(sourceRow)))+
 panel('Issued planning baseline',cells(['Planning input','Published value'],[['Server sizing','Up to 25; around 20–22 normally'],['Protected server data','41 TB'],['Existing local storage','About 30 TB'],['Microsoft 365 users','30–35'],['Transfer assumption','4 Gbps; validate at installation']].map(r=>r.map(html)))+'<p class="small">'+html(BASELINE.notes)+'</p>')+
 panel('Source register',BASELINE.sources.map(s=>'<p><a href="'+html(s.url)+'" target="_blank" rel="noreferrer">'+html(s.title)+'</a></p>').join(''));
 $('#source-form').onsubmit=action(async()=>{const file=$('#source-file').files[0];if(!file)throw Error('Choose a source file.');const bytes=new Uint8Array(await file.arrayBuffer());let payload;try{const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);payload=recordSource(file,text,$('#source-origin').value);}catch{payload={id:id('source'),name:file.name,mediaType:file.type||'application/octet-stream',encoding:'base64',content:Codec.base64(bytes),bytes:bytes.length,sha256:Codec.sha256(bytes),origin:$('#source-origin').value||'Operator-selected file',observedAt:stamp()};}await command('source.import',payload,'Complete original file retained.');});
 document.querySelectorAll('[data-source-download]').forEach(b=>b.onclick=action(()=>{const s=arr(workspace.sources).find(s=>s.id===b.dataset.sourceDownload);download(s.name,s.encoding==='base64'?new Blob([Uint8Array.from(atob(s.content),c=>c.charCodeAt(0))],{type:s.mediaType}):s.content,s.mediaType);}));
}
function renderHistory(){
 const events=arr(workspace.operations);
 $('#main').innerHTML=heading('Operation history','Each saved command carries the operating engineer, original payload, revision and result. The complete history travels with the workspace.')+
 (events.length?events.slice().reverse().map(e=>details((e.command?.type||e.type||'Operation')+' · '+(e.command?.actor||e.actor||'')+' · '+(e.command?.at||e.at||''),e)).join(''):empty('No operations yet. Import the actual source or save a planning edition to begin.'));
}

function standaloneHtml(){const root=document.documentElement.cloneNode(true);root.querySelectorAll('[data-mpc-runtime],[data-mpc-branch-controls]').forEach(s=>s.remove());root.querySelectorAll('[data-mpc-temporary-disabled]').forEach(el=>{el.disabled=false;delete el.dataset.mpcTemporaryDisabled;});return '<!doctype html>\n'+root.outerHTML;}

let proposalSelected=null,proposalComparison=null,proposalRegister=null,applicationSource=null;
function selectedProposal(){const all=Proposal.retainedProposals(workspace,proposalRegister);return all.find(x=>x.source.id===proposalSelected)||all.at(-1);}
function proposalSummary(record,full=false){
 const p=record.proposal,r=p.result,money=v=>v===null?'Unquoted':'$'+Number(v).toLocaleString(undefined,{maximumFractionDigits:2}),num=v=>v===null?'Unmeasured':Number(v).toLocaleString(undefined,{maximumFractionDigits:3});
 const out=panel('Capacity and transfer assumptions',cells(['Server repository measure','Local','Off-site'],[['Protected server data','rawTB'],['Required capacity with reserve','requiredTB'],['Available capacity','availableTB'],['Headroom / shortfall','headroomTB'],['Retained restore points','retainedRestorePoints']].map(([label,key])=>[html(label),html(num(r.local[key])+(key==='retainedRestorePoints'?'':' TB')),html(num(r.cloud[key])+(key==='retainedRestorePoints'?'':' TB'))]))+
 '<p>Initial off-site seed '+html(num(r.cloud.initialSeedHours))+' h · largest changed-copy transfer '+html(num(r.cloud.dailyHours))+' h · serial transfer age bound '+html(num(r.cloud.transferOnlyWorstAgeBoundHours))+' h.</p><ul>'+r.warnings.map(w=>'<li>'+html(w)+'</li>').join('')+'</ul>'+details('Complete saved assumptions',{assumptions:p.case.assumptions,repositories:p.case.repositories}))+
 panel('Supplier quotes and four-year pricing','<p>'+badge(r.quote.complete?'All quote rows complete':'Missing quote data: '+r.quote.missing.join(', '))+'</p>'+cells(['Component','Quantity','Unit price','Period','Source','Years 1–4'],r.quote.rows.map(q=>[html(q.label),html(num(q.effectiveQuantity)),html(money(q.unitPrice)),html(q.period),html(q.source||'Source required'),html(q.yearly.map(money).join(' / '))]))+'<p>Known annual subtotals: '+html(r.quote.yearlyKnownSubtotal.map(money).join(' / '))+'. '+(r.quote.complete?'All rows have quote sources.':'Partial until every required quote is supplied.')+'</p>')+
 panel('All '+p.requirements.length+' response items',p.requirements.map(q=>'<details'+(full?' open':'')+'><summary>'+html(q.id+' · '+q.topic+' · '+q.decision.status)+'</summary><p>'+html(q.issuedFactOrDerivedFinding)+'</p><p>'+html(q.responseAction)+'</p><p>'+html(q.proposedOwner)+' · <a href="'+html(q.sourceUrl)+'">'+html(q.sourceLocator)+'</a></p><p class="preserve">'+html(q.decision.notes||'Approach and supporting record to be entered in the proposal case.')+'</p></details>').join(''))+
 panel('All '+p.acceptance.length+' proposal acceptance steps',p.acceptance.map(q=>'<details'+(full?' open':'')+'><summary>'+html(q.id+' · '+q.title+' · '+q.decision.status)+'</summary><p>'+html(q.action)+'</p><p>'+html(q.owner)+' · '+html(q.output)+'</p><p><a href="'+html(q.sourceUrl)+'">'+html(q.sourceLocator)+'</a></p><p class="preserve">'+html(q.decision.notes||'Actual result remains to be recorded by the performing team.')+'</p></details>').join(''))+
 panel('Proposal notes','<p class="preserve">'+html(p.case.notes||'No additional case notes.')+'</p>');
 return out;
}
function renderProposal(){
 const all=Proposal.retainedProposals(workspace,proposalRegister),selected=selectedProposal();if(selected)proposalSelected=selected.source.id;
 $('#main').innerHTML=heading('Proposal to operations','Receive the complete saved case from the original capacity planner. Keep its assumptions, actual quote inputs and decisions connected to the installation plan.','<button id="open-original-planner">Download original planner</button>')+
 panel('Receive a complete planning case','<form id="proposal-import" class="form-grid">'+input('proposal-file','Saved proposal case JSON','','file','accept=".json"')+input('proposal-origin','Source and acquisition details')+'<div class="actions"><button class="primary">Receive proposal case</button></div></form><p class="small">Proposal decisions and acceptance notes retain their original planning status. Operational decisions are recorded against the actual installation and recovery records.</p>')+
 panel('Retained proposal editions',cells(['Case','Received','Source','Open'],all.map(({source,proposal})=>[html(proposal.case.name),html(formatTime(source.observedAt)),'<code>'+html(source.sha256)+'</code>','<button data-proposal="'+html(source.id)+'">Open edition</button>'])))+
 (selected?panel('Selected edition','<h3>'+html(selected.proposal.case.name)+'</h3><p>'+html(selected.source.origin)+'</p><div class="actions"><button id="proposal-original">Download exact case</button><button id="proposal-plan">Use for next plan edition</button><button id="proposal-report">Download full planning review</button></div><div class="form-grid">'+select('proposal-compare','Compare against',all.filter(x=>x.source.id!==selected.source.id).map(x=>[x.source.id,x.proposal.case.name+' · '+x.source.observedAt]),proposalComparison||'')+'<button id="compare-proposals">Compare complete editions</button></div><div id="proposal-diff"></div>')+proposalSummary(selected):empty('Receive the case JSON saved by the original proposal workspace.'));
 $('#open-original-planner').onclick=action(()=>{const f=applicationSource.files.find(f=>f.path==='proposal/workspace.html');if(!f)throw Error('Original planner source is missing.');download('MPC-backup-proposal-workspace.html',f.content,'text/html');});
 $('#proposal-import').onsubmit=action(async()=>{const file=$('#proposal-file').files[0];if(!file)throw Error('Choose the original saved case JSON.');const content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());
 const outcome=Proposal.importProposal(workspace,{id:id('proposal-source'),actor:actor(),at:stamp(),name:file.name,origin:$('#proposal-origin').value||'Original MPC planner saved case',content},proposalRegister);
 await persist(outcome.workspace);proposalSelected=outcome.sourceId;render();notice(outcome.reused?'This exact proposal case is already retained.':'Complete proposal received with original bytes, assumptions, quote inputs and all decisions.');});
 document.querySelectorAll('[data-proposal]').forEach(b=>b.onclick=()=>{proposalSelected=b.dataset.proposal;renderProposal();});
 if(!selected)return;
 $('#proposal-original').onclick=()=>download(selected.source.name,selected.source.content,'application/json');
 $('#proposal-plan').onclick=action(()=>{if(draftPlan&&$('#plan-title'))retainPlanFields();const next=Proposal.proposalPlanDraft(workspace,selected.source.id,{id:id('plan')},proposalRegister);if(draftPlan){next.workloads=structuredClone(draftPlan.workloads);next.repositories=structuredClone(draftPlan.repositories);next.note=draftPlan.note+'\n'+next.note;next.sourceRefs=[{sourceId:selected.source.id,locator:'whole-file'},...structuredClone(draftPlan.sourceRefs).filter(r=>r.sourceId!==selected.source.id)];}draftPlan=next;editWorkload=editRepository=null;tab='plan';render();notice('Proposal source linked to a new installation draft. Existing inventory and targets retained.');});
 $('#proposal-report').onclick=()=>download('MPC_Proposal_Operations_Review.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MPC complete planning review</title><style>'+APP_CSS+'</style></head><body><main><h1>'+html(selected.proposal.case.name)+'</h1><p>Complete retained planning case · '+html(selected.source.sha256)+'</p>'+proposalSummary(selected,true)+'</main></body></html>','text/html');
 $('#compare-proposals').onclick=action(()=>{const previous=all.find(x=>x.source.id===$('#proposal-compare').value);if(!previous)throw Error('Receive another proposal edition to compare.');proposalComparison=previous.source.id;const diff=Proposal.compareProposals(previous.source.content,selected.source.content,proposalRegister);$('#proposal-diff').innerHTML=cells(['Saved field','Previous edition','Selected edition'],diff.changes.map(x=>[html(x.path),'<pre>'+html(json(x.previous))+'</pre>','<pre>'+html(json(x.current))+'</pre>']));if(!diff.changes.length)$('#proposal-diff').innerHTML=empty('The complete saved cases have the same values.');});
}

let editWorkload=null,editRepository=null;
function prepareDraft(){
 if(draftPlan)return;
 const old=currentPlan();
 draftPlan=old?{id:id('plan'),title:old.title,previousPlanId:old.id,note:'',sourceRefs:structuredClone(old.sourceRefs),repositories:structuredClone(old.repositories),workloads:structuredClone(old.workloads)}:{id:id('plan'),title:'Recovery plan',previousPlanId:null,note:'',sourceRefs:[],repositories:[],workloads:[]};
}
function retainPlanFields(){if(!$('#plan-title'))return;draftPlan.title=$('#plan-title').value;draftPlan.note=$('#plan-note').value;const refs=readRefs('plan');if(json(refs)!==json((draftPlan.sourceRefs||[]).slice(0,1)))draftPlan.sourceRefs=[...refs,...(draftPlan.sourceRefs||[]).slice(1)];}
function renderPlan(){
 prepareDraft();const p=draftPlan,w=p.workloads.find(w=>w.id===editWorkload),r=p.repositories.find(r=>r.id===editRepository);
 $('#main').innerHTML=heading('Recovery plan','Build an edition from the actual installation inventory. Each saved edition preserves its sources, workload dependencies, repository assignments and recovery targets.','<button id="save-plan" class="primary">Save new plan edition</button>')+
 panel('Plan edition','<div class="form-grid">'+input('plan-title','Edition title',p.title)+select('plan-source','Plan source',sourceOptions(),p.sourceRefs[0]?.sourceId||'')+input('plan-locator','Source location',p.sourceRefs[0]?.locator||'whole-file')+'<div class="wide">'+area('plan-note','Design changes and assumptions',p.note)+'</div></div><p class="metadata">Previous edition: '+html(p.previousPlanId||'Initial plan')+' · '+p.workloads.length+' workloads · '+p.repositories.length+' repositories</p>')+
 '<div class="grid">'+panel('Repositories',cells(['Repository','Location','Kind','Edit'],p.repositories.map(x=>[html(x.name)+'<br><code>'+html(x.id)+'</code>',html(x.location),html(x.kind),'<button data-edit-repository="'+html(x.id)+'">Edit</button> <button data-remove-repository="'+html(x.id)+'">Remove</button>']))+
 '<form id="repository-form" class="form-grid">'+input('repo-id','Stable repository ID',r?.id||'')+input('repo-name','Repository name',r?.name||'')+select('repo-location','Location',['local','offsite'],r?.location||'local')+input('repo-kind','Storage or platform type',r?.kind||'')+sourceRefFields('repo',r?.sourceRefs)+'<div class="actions"><button>'+html(r?'Update draft repository':'Add repository')+'</button><button type="button" id="clear-repository">Clear editor</button></div></form>')+
 panel('Current saved editions',cells(['Edition','Saved','Targets','Actions'],plans().map(x=>[html(x.title)+'<br><code>'+html(x.id)+'</code>',html(formatTime(x.createdAt)),badge(arr(workspace.approvals).filter(a=>a.planId===x.id).at(-1)?.decision||'proposed'),'<button data-open-plan="'+html(x.id)+'">Base next edition on this</button>']))+
 '<form id="approval-form" class="form-grid">'+select('approval-plan','Saved edition',planOptions(),currentPlan()?.id)+select('approval-decision','Recorded decision',['approved','withdrawn'],'approved')+sourceRefFields('approval')+'<div class="wide">'+area('approval-note','Decision and named authority')+'</div><div class="actions"><button>Record plan decision</button></div></form>')+'</div>'+
 panel('Workloads',cells(['Workload','Recovery targets','Dependencies','Repositories','Edit'],p.workloads.map(x=>[html(x.name)+'<br><code>'+html(x.id)+'</code><br>'+html(x.kind),html(x.rpoMinutes??'—')+' min RPO / '+html(x.rtoMinutes??'—')+' min RTO<br>'+html(x.restoreIntervalDays??'—')+' day restore interval',html(x.dependencies.join(', ')),html(x.repositoryIds.join(', ')),'<button data-edit-workload="'+html(x.id)+'">Edit</button> <button data-remove-workload="'+html(x.id)+'">Remove</button>']))+
 '<form id="workload-form" class="form-grid">'+input('wl-id','Stable workload ID',w?.id||'')+input('wl-name','Workload name',w?.name||'')+input('wl-kind','Kind: server, database, Microsoft365…',w?.kind||'')+input('wl-dependencies','Dependency IDs, comma-separated',w?.dependencies?.join(', ')||'')+input('wl-repos','Repository IDs, comma-separated',w?.repositoryIds?.join(', ')||'')+input('wl-rpo','Proposed RPO, minutes',w?.rpoMinutes,'number','min="0" step="any"')+input('wl-rto','Proposed RTO, minutes',w?.rtoMinutes,'number','min="0" step="any"')+input('wl-interval','Restore interval, days',w?.restoreIntervalDays,'number','min="0" step="any"')+sourceRefFields('wl',w?.sourceRefs)+'<div class="wide">'+area('wl-description','Workload and recovery notes',w?.description||'')+'</div><div class="actions"><button>'+html(w?'Update draft workload':'Add workload')+'</button><button type="button" id="clear-workload">Clear editor</button></div></form>');
 $('#save-plan').onclick=action(async()=>{retainPlanFields();await command('plan.save',draftPlan,'Complete plan edition saved.');draftPlan=null;editWorkload=null;editRepository=null;render();});
 $('#repository-form').onsubmit=action(()=>{retainPlanFields();const next={id:$('#repo-id').value.trim(),name:$('#repo-name').value.trim(),location:$('#repo-location').value,kind:$('#repo-kind').value.trim(),sourceRefs:readRefs('repo')};if(!next.id||!next.name)throw Error('Repository ID and name are required.');const found=p.repositories.findIndex(x=>x.id===editRepository);if(p.repositories.some(x=>x.id===next.id&&x.id!==editRepository))throw Error('Repository ID already exists.');if(found>=0)p.repositories[found]=next;else p.repositories.push(next);editRepository=null;renderPlan();notice('Repository saved in the draft. Save the complete plan edition when ready.');});
 $('#workload-form').onsubmit=action(()=>{retainPlanFields();const next={id:$('#wl-id').value.trim(),name:$('#wl-name').value.trim(),kind:$('#wl-kind').value.trim(),description:$('#wl-description').value,dependencies:list($('#wl-dependencies').value),repositoryIds:list($('#wl-repos').value),rpoMinutes:nullableNumber($('#wl-rpo').value),rtoMinutes:nullableNumber($('#wl-rto').value),restoreIntervalDays:nullableNumber($('#wl-interval').value),sourceRefs:readRefs('wl')};if(!next.id||!next.name)throw Error('Workload ID and name are required.');const found=p.workloads.findIndex(x=>x.id===editWorkload);if(p.workloads.some(x=>x.id===next.id&&x.id!==editWorkload))throw Error('Workload ID already exists.');if(found>=0)p.workloads[found]=next;else p.workloads.push(next);editWorkload=null;renderPlan();notice('Workload saved in the draft. Save the complete plan edition when ready.');});
 $('#clear-workload').onclick=()=>{retainPlanFields();editWorkload=null;renderPlan();};$('#clear-repository').onclick=()=>{retainPlanFields();editRepository=null;renderPlan();};
 for(const entity of ['workload','repository'])for(const actionName of ['edit','remove'])document.querySelectorAll('[data-'+actionName+'-'+entity+']').forEach(b=>b.onclick=action(()=>{retainPlanFields();const value=b.dataset[actionName+entity[0].toUpperCase()+entity.slice(1)];if(actionName==='edit'){if(entity==='workload')editWorkload=value;else editRepository=value;}else{const key=entity==='workload'?'workloads':'repositories';p[key]=p[key].filter(x=>x.id!==value);}renderPlan();}));
 document.querySelectorAll('[data-open-plan]').forEach(b=>b.onclick=()=>{const selected=pickPlan(b.dataset.openPlan);draftPlan={id:id('plan'),title:selected.title,previousPlanId:workspace.activePlanId,note:'Draft based on retained plan '+selected.id+'.',sourceRefs:structuredClone(selected.sourceRefs),workloads:structuredClone(selected.workloads),repositories:structuredClone(selected.repositories)};editWorkload=editRepository=null;renderPlan();notice('New draft based on the selected retained edition.');});
 $('#approval-form').onsubmit=action(async()=>{retainPlanFields();await command('plan.approve',{planId:$('#approval-plan').value,decision:$('#approval-decision').value,note:$('#approval-note').value,sourceRefs:readRefs('approval')},'Plan decision recorded against its saved edition.');});
}

let jobsPlanId=null,jobCorrection=null;
const currentRecords=key=>arr(workspace[key]).map(Model.currentRecord);
const latestVersion=(key,recordId)=>Model.recordVersion(arr(workspace[key]).find(x=>x.id===recordId));
const JOB_FIELDS=[
['id','Stable job-record ID','string',true],['externalId','Provider job ID','string',true],['workloadId','Workload ID','string',true],['repositoryId','Repository ID','string',true],
['startedAt','Started at','timestamp',true],['completedAt','Completed at','timestamp',false],['status','Provider status','enum',true],['recoveryPoint','Recovery point','timestamp',false],
['complete','Complete recovery point','boolean',true],['verifiedAt','Verified at','timestamp',false],['bytes','Transferred bytes','number',false],['note','Job notes','string',false]];
function readImportMapping(){
 if(!$('#true-value').value||!$('#false-value').value||$('#true-value').value===$('#false-value').value)throw Error('Use distinct nonempty source values for true and false.');
 const fields=JOB_FIELDS.map(([name,label,type,required])=>({name,type,required,column:$('#map-'+name).value||null}));
 for(const field of fields)if(field.type==='enum')field.values=Object.fromEntries([...document.querySelectorAll('[data-status-from]')].map(e=>[e.dataset.statusFrom,e.value]));
 return {fields,utcOffset:$('#import-offset').value,booleanValues:Object.fromEntries([[$('#true-value').value,true],[$('#false-value').value,false]]),bytesUnit:$('#bytes-unit').value,planId:$('#import-plan').value,delimiter:$('#import-delimiter').value};
}
function mappedImport(){
 const mapping=readImportMapping();if(!mapping.planId)throw Error('Select the saved plan edition represented by these jobs.');
 const rows=Delimited.mapRecords(importDraft.parsed,mapping).map((row,index)=>({id:row.payload.id,externalId:row.payload.externalId,rawLocator:importDraft.kind==='json'?'/'+index:'line:'+row.line,planId:mapping.planId,workloadId:row.payload.workloadId,repositoryId:row.payload.repositoryId,startedAt:row.payload.startedAt,completedAt:row.payload.completedAt??null,status:row.payload.status,recoveryPoint:row.payload.recoveryPoint??null,complete:row.payload.complete,verifiedAt:row.payload.verifiedAt??null,bytes:row.payload.bytes===undefined?null:row.payload.bytes*Number(mapping.bytesUnit),note:row.payload.note||''}));
 return {mapping,rows};
}
function renderJobs(){
 const jobs=currentRecords('backups'),correction=jobCorrection?latestVersion('backups',jobCorrection):null;
 $('#main').innerHTML=heading('Backup jobs','Import complete provider exports. Map workload IDs, recovery points, status and units explicitly; every job retains its original record location.')+
 panel('Recorded jobs',cells(['Job / provider','Workload / repository','Result','Recovery point','Completion / verification','Bytes','Review'],jobs.map(j=>[html(j.id)+'<br>'+html(j.externalId),html(j.workloadId)+'<br>'+html(j.repositoryId),badge(j.status)+(j.complete?'<br>Complete point':''),html(formatTime(j.recoveryPoint)),html(formatTime(j.completedAt))+'<br>'+html(formatTime(j.verifiedAt)),html(j.bytes??'—'),'<button data-correct-job="'+html(j.id)+'">Correct record</button>'])))+
 panel('Import provider export','<form id="job-load-form" class="form-grid">'+input('job-file','CSV, TSV or JSON array file','','file')+select('import-delimiter','Delimited-file separator',[[',','Comma'],['\t','Tab'],[';','Semicolon']],',')+input('import-origin','Provider and acquisition details')+'<div class="actions"><button>Read complete file</button></div></form><div id="import-mapping"></div>')+
 (correction?panel('Correct an existing observation','<form id="job-correction-form" class="form-grid"><div class="wide">'+area('job-replacement','Complete corrected record',json(correction.data),12)+'</div><div class="wide">'+area('job-reason','Reason and supporting source')+'</div><div class="actions"><button class="primary">Retain corrected version</button><button type="button" id="cancel-job-correction">Cancel</button></div></form>'):'');
 $('#job-load-form').onsubmit=action(async()=>{const file=$('#job-file').files[0];if(!file)throw Error('Choose the provider export.');const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());let parsed,kind;if(/\.json$/i.test(file.name)){const rows=JSON.parse(text);if(!Array.isArray(rows)||!rows.every(r=>r&&typeof r==='object'&&!Array.isArray(r)))throw Error('JSON input must be an array of provider job objects.');const headers=[...new Set(rows.flatMap(r=>Object.keys(r)))];parsed={headers,records:rows.map((values,i)=>({line:i+1,values}))};kind='json';}else{parsed=Delimited.parseDelimited(text,$('#import-delimiter').value);kind='delimited';}
 importDraft={file:{name:file.name,type:file.type},text,parsed,kind,origin:$('#import-origin').value,delimiter:$('#import-delimiter').value};previewRows=null;renderImportMapping();notice(parsed.records.length+' source records loaded for explicit mapping.');});
 if(importDraft)renderImportMapping();
 document.querySelectorAll('[data-correct-job]').forEach(b=>b.onclick=()=>{jobCorrection=b.dataset.correctJob;renderJobs();});
 if(correction){$('#cancel-job-correction').onclick=()=>{jobCorrection=null;renderJobs();};$('#job-correction-form').onsubmit=action(async()=>{await command('backup.correct',{id:jobCorrection,previousSha256:correction.sha256,replacement:JSON.parse($('#job-replacement').value),reason:$('#job-reason').value},'Corrected version retained beside the original.');jobCorrection=null;renderJobs();});}
}
function renderImportMapping(){
 const columns=[['','Unmapped'],...importDraft.parsed.headers.map(h=>[h,h])];
 $('#import-mapping').innerHTML='<hr><h4>'+html(importDraft.file.name)+' · '+importDraft.parsed.records.length+' records</h4><div class="form-grid">'+select('import-plan','Saved plan',planOptions(),jobsPlanId||currentPlan()?.id)+input('import-offset','UTC offset for timestamps without one','','text','placeholder="Z or -04:00"')+select('bytes-unit','Source transfer unit',[['1','Bytes'],['1000','kB'],['1000000','MB'],['1000000000','GB'],['1024','KiB'],['1048576','MiB'],['1073741824','GiB']],'1')+input('true-value','Source value meaning true','true')+input('false-value','Source value meaning false','false')+'</div><div class="grid"><div>'+JOB_FIELDS.map(([name,label,type,required])=>'<div class="mapping-row"><span>'+html(label)+(required?' *':'')+'</span><select id="map-'+name+'">'+columns.map(c=>option(c[0],c[1],importDraft.parsed.headers.includes(name)?name:'')).join('')+'</select></div>').join('')+'</div><div><h4>Provider status mapping</h4><div id="status-mapping"></div><p class="small">Select the source status column first. A completed job and a verified complete recovery point are separate observations.</p><h4>Original source preview</h4>'+details('First five source records',importDraft.parsed.records.slice(0,5))+'</div></div><div class="actions"><button id="preview-import">Preview mapped records</button><button id="save-import" class="primary">Import complete file</button></div><div id="mapped-preview"></div>';
 const statuses=()=>{const column=$('#map-status').value,values=[...new Set(importDraft.parsed.records.map(r=>String(r.values[column]??'')))];$('#status-mapping').innerHTML=values.map(v=>'<label>'+html(v||'(empty)')+'<select data-status-from="'+html(v)+'">'+[['','Choose status'],['running','Running'],['succeeded','Succeeded'],['partial','Partial'],['failed','Failed']].map(x=>option(x[0],x[1],['running','succeeded','partial','failed'].includes(v)?v:'')).join('')+'</select></label>').join('');};$('#map-status').onchange=statuses;statuses();
 $('#preview-import').onclick=action(()=>{const mapped=mappedImport();previewRows=mapped.rows;$('#mapped-preview').innerHTML=details('First five mapped records; all '+mapped.rows.length+' retained on import',mapped.rows.slice(0,5));});
 $('#save-import').onclick=action(async()=>{const {mapping,rows}=mappedImport(),source=recordSource(importDraft.file,importDraft.text,importDraft.origin),mappingText=json({sourceId:source.id,sourceSha256:source.sha256,kind:importDraft.kind,mapping}),mappingSource=recordSource({name:source.name+'.mapping.json',type:'application/json'},mappingText,'Operating engineer column and unit mapping');await commitBatch([{type:'source.import',payload:source},{type:'source.import',payload:mappingSource},{type:'backup.import',payload:{sourceId:source.id,rows}}],rows.length+' complete provider records imported with original source and mapping.');importDraft=null;previewRows=null;renderJobs();});
}

let recoveryCorrection=null;
function recoveryForm(prefix,value={}){
 const p=pickPlan(value.planId)||currentPlan(),backups=currentRecords('backups');
 return select(prefix+'-plan','Saved plan',planOptions(),value.planId||p?.id)+input(prefix+'-id','Stable recovery run ID',value.id||'')+
 select(prefix+'-workload','Workload',[['','Choose workload'],...(p?.workloads||[]).map(w=>[w.id,w.name])],value.workloadId||'')+
 select(prefix+'-repository','Repository',[['','Choose repository'],...(p?.repositories||[]).map(r=>[r.id,r.name])],value.repositoryId||'')+
 select(prefix+'-method','Recovery method',['bare-metal','vm','file','application','m365','entra'],value.method||'bare-metal')+
 select(prefix+'-backup','Recorded backup point',[['','Independent recovery observation'],...backups.map(b=>[b.id,b.id+' · '+b.workloadId+' · '+(b.recoveryPoint||'no point')])],value.backupId||'')+
 input(prefix+'-point','Recovered point, ISO time',value.recoveryPoint||'','text','placeholder="2026-10-13T10:00:00Z"')+
 input(prefix+'-incident','Incident / exercise reference time',value.incidentAt||'','text','placeholder="ISO time with timezone"')+
 input(prefix+'-start','Recovery started',value.startedAt||'','text','placeholder="ISO time with timezone"')+
 input(prefix+'-ready','Service ready',value.serviceReadyAt||'','text','placeholder="Leave empty while running"')+
 select(prefix+'-status','Observed result',['running','succeeded','failed'],value.status||'running')+
 '<div class="checklist">'+check(prefix+'-verified','Recovery verified by the operator',value.verified||false)+'</div>'+
 sourceRefFields(prefix,value.sourceRefs)+'<div class="wide">'+area(prefix+'-note','Scope, method, observations and remaining issues',value.note||'')+'</div>';
}
function readRecovery(prefix){
 const backupId=$('#'+prefix+'-backup').value||null;
 return {id:$('#'+prefix+'-id').value.trim(),planId:$('#'+prefix+'-plan').value,workloadId:$('#'+prefix+'-workload').value,repositoryId:$('#'+prefix+'-repository').value,backupId,backupSha256:backupId?latestVersion('backups',backupId).sha256:null,method:$('#'+prefix+'-method').value,recoveryPoint:Delimited.utcTimestamp($('#'+prefix+'-point').value),incidentAt:Delimited.utcTimestamp($('#'+prefix+'-incident').value),startedAt:Delimited.utcTimestamp($('#'+prefix+'-start').value),serviceReadyAt:$('#'+prefix+'-ready').value?Delimited.utcTimestamp($('#'+prefix+'-ready').value):null,status:$('#'+prefix+'-status').value,verified:$('#'+prefix+'-verified').checked,note:$('#'+prefix+'-note').value,sourceRefs:readRefs(prefix)};
}
function refreshRecoveryChoices(prefix){
 const p=pickPlan($('#'+prefix+'-plan').value);
 for(const [field,rows] of [['workload',p?.workloads],['repository',p?.repositories]])$('#'+prefix+'-'+field).innerHTML=option('','Choose '+field,'')+(rows||[]).map(r=>option(r.id,r.name,'')).join('');
}
function renderRecovery(){
 const runs=currentRecords('recoveries'),correction=recoveryCorrection?latestVersion('recoveries',recoveryCorrection):null;
 $('#main').innerHTML=heading('Restore programme','Retain the recovered point, incident reference, start and service-ready time. RPO measures the recovery point gap; RTO includes the full time until service is ready.')+
 panel('Recovery runs',cells(['Run','Workload / method','Result','Recovery gap','Time to ready','Review'],runs.map(r=>[html(r.id),html(r.workloadId)+'<br>'+html(r.method),badge(r.status)+(r.verified?' · verified':''),html(((Date.parse(r.incidentAt)-Date.parse(r.recoveryPoint))/60000).toFixed(1))+' min',r.serviceReadyAt?html(((Date.parse(r.serviceReadyAt)-Date.parse(r.incidentAt))/60000).toFixed(1))+' min':'In progress','<button data-correct-recovery="'+html(r.id)+'">Correct record</button>'])))+
 panel(correction?'Correct recovery observation':'Record a recovery run','<form id="recovery-form" class="form-grid">'+recoveryForm('rec',correction?.data||{})+(correction?'<div class="wide">'+area('rec-reason','Reason for correction')+'</div>':'')+'<div class="actions"><button class="primary">'+(correction?'Retain corrected version':'Save recovery observation')+'</button><button type="button" id="clear-recovery">Clear editor</button></div></form>')+
 '<div class="grid">'+panel('Recurring restore schedule','<form id="schedule-form" class="form-grid">'+select('schedule-plan','Plan',planOptions(),currentPlan()?.id)+input('schedule-workload','Workload ID')+input('schedule-interval','Interval, days','','number','min="1" step="1"')+input('schedule-first','First due, ISO time')+sourceRefFields('schedule')+'<div class="wide">'+area('schedule-note','Schedule and coverage notes')+'</div><div class="actions"><button>Save schedule edition</button></div></form>')+
 panel('Recorded schedules',cells(['Workload','Interval','First due','Notes'],arr(workspace.restoreSchedules).map(s=>[html(s.workloadId),html(s.intervalDays)+' days',html(formatTime(s.firstDueAt)),html(s.note)])))+'</div>';
 $('#rec-plan').onchange=()=>refreshRecoveryChoices('rec');
 $('#rec-backup').onchange=()=>{const b=currentRecords('backups').find(b=>b.id===$('#rec-backup').value);if(b){$('#rec-point').value=b.recoveryPoint||'';$('#rec-plan').value=b.planId;refreshRecoveryChoices('rec');$('#rec-workload').value=b.workloadId;$('#rec-repository').value=b.repositoryId;}};
 $('#recovery-form').onsubmit=action(async()=>{const payload=readRecovery('rec');if(correction)await command('recovery.correct',{id:recoveryCorrection,previousSha256:correction.sha256,replacement:payload,reason:$('#rec-reason').value},'Corrected recovery version retained.');else await command('recovery.record',payload,'Actual recovery observation saved.');recoveryCorrection=null;renderRecovery();});
 $('#clear-recovery').onclick=()=>{recoveryCorrection=null;renderRecovery();};
 document.querySelectorAll('[data-correct-recovery]').forEach(b=>b.onclick=()=>{recoveryCorrection=b.dataset.correctRecovery;renderRecovery();});
 $('#schedule-form').onsubmit=action(async()=>await command('restoreSchedule.save',{id:id('schedule'),planId:$('#schedule-plan').value,workloadId:$('#schedule-workload').value.trim(),intervalDays:Number($('#schedule-interval').value),firstDueAt:Delimited.utcTimestamp($('#schedule-first').value),note:$('#schedule-note').value,sourceRefs:readRefs('schedule')},'Recurring restore schedule saved.'));
}

let incidentCorrection=null,hurricaneCorrection=null;
const human=value=>String(value).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
function viewValue(value){
 if(value===null||value===undefined)return '<span class="subtle">Unrecorded</span>';
 if(typeof value==='boolean')return value?'Yes':'No';
 if(typeof value==='string')return html(value);
 if(typeof value==='number')return html(value);
 if(Array.isArray(value)){if(!value.length)return '<span class="subtle">None</span>';if(value.every(x=>!x||typeof x!=='object'))return value.map(x=>html(x)).join(', ');return viewTable(value);}
 return '<dl>'+Object.entries(value).map(([k,v])=>'<dt class="small"><strong>'+html(human(k))+'</strong></dt><dd>'+viewValue(v)+'</dd>').join('')+'</dl>';
}
function viewTable(rows,columns=null){
 if(!rows?.length)return empty('No matching records.');
 const keys=columns||[...new Set(rows.flatMap(row=>Object.keys(row)))];
 return cells(keys.map(human),rows.map(row=>keys.map(key=>viewValue(row[key]))));
}
function incidentFields(v={}){
 return input('inc-id','Stable incident ID',v.id||'')+input('inc-title','Incident title',v.title||'')+select('inc-plan','Plan',planOptions(),v.planId||currentPlan()?.id)+input('inc-occurred','Service impact began, ISO time',v.occurredAt||'')+input('inc-detected','Detected at, ISO time',v.detectedAt||'')+select('inc-status','Current status',['open','restored'],v.status||'open')+input('inc-restored','Service restored at',v.restoredAt||'')+'<div class="checklist">'+check('inc-remote','Loss of remote backup or support capability',v.remoteServiceLoss||false)+check('inc-significant','Significant incident affecting backup or recovery',v.significant||false)+check('inc-extended','Service outage expected to exceed 24 hours',v.expectedOver24Hours||false)+'</div>'+sourceRefFields('inc',v.sourceRefs)+'<div class="wide">'+area('inc-note','Impact, actions, restoration estimate and follow-up',v.note||'')+'</div>';
}
function hurricaneFields(v={}){
 return input('storm-id','Stable event ID',v.id||'')+input('storm-name','Event name',v.name||'')+select('storm-plan','Plan',planOptions(),v.planId||currentPlan()?.id)+input('storm-impact','Earliest anticipated impact, ISO time',v.expectedImpactAt||'')+input('storm-trigger','MPC operational trigger, ISO time',v.mpcTriggeredAt||'')+input('storm-received','Trigger received, ISO time',v.noticeReceivedAt||'')+sourceRefFields('storm',v.sourceRefs)+'<div class="wide">'+area('storm-note','Current forecast source, operational direction and exceptions',v.note||'')+'</div>';
}
function renderIncidents(){
 const incidents=currentRecords('incidents'),storms=currentRecords('hurricanes'),ic=incidentCorrection?latestVersion('incidents',incidentCorrection):null,hc=hurricaneCorrection?latestVersion('hurricanes',hurricaneCorrection):null;
 $('#main').innerHTML=heading('Incidents and hurricane preparation','Record the observed service impact and communications. Hurricane coverage uses verified recovery points from the selected complete plan.')+
 panel('Open and restored incidents',cells(['Incident','Detected','Status','Remote loss','Review'],incidents.map(i=>[html(i.title)+'<br><code>'+html(i.id)+'</code>',html(formatTime(i.detectedAt)),badge(i.status),i.remoteServiceLoss?'Immediate notice applicable':'See incident due time','<button data-correct-incident="'+html(i.id)+'">Update observation</button>'])))+
 panel(ic?'Correct incident observation':'Record an incident','<form id="incident-form" class="form-grid">'+incidentFields(ic?.data||{})+(ic?'<div class="wide">'+area('inc-reason','Reason for the corrected observation')+'</div>':'')+'<div class="actions"><button class="primary">Save incident observation</button><button type="button" id="clear-incident">Clear editor</button></div></form>')+
 panel('Record a communication','<form id="communication-form" class="form-grid">'+select('comm-incident','Incident',incidents.map(i=>[i.id,i.title]))+select('comm-channel','Communication channel',['email','telephone','status-update'],'email')+input('comm-time','Actual communication time, ISO')+input('comm-recipient','Recipient or operational contact')+sourceRefFields('comm')+'<div class="wide">'+area('comm-summary','Delivered summary and outcome')+'</div><div class="actions"><button>Record communication</button></div></form>'+details('Communication record',workspace.communications))+
 panel('Post-incident written report','<form id="incident-report-form" class="form-grid">'+select('report-incident','Restored incident',incidents.filter(i=>i.status==='restored').map(i=>[i.id,i.title]))+sourceRefFields('ir')+'<div class="wide">'+area('ir-cause','Cause')+area('ir-impact','Impact')+area('ir-actions','Corrective actions')+area('ir-recurrence','Recurrence prevention and recommendations')+'</div><div class="actions"><button>Record written report</button></div></form>')+
 panel('Hurricane events',storms.length?storms.map(s=>'<details><summary>'+html(s.name)+' · '+html(formatTime(s.expectedImpactAt))+'</summary>'+viewValue(Model.hurricaneStatus(workspace,s.id))+'<button data-correct-hurricane="'+html(s.id)+'">Update forecast / trigger observation</button></details>').join(''):empty('No hurricane events have been recorded.'))+
 panel(hc?'Correct hurricane event':'Record an operational hurricane trigger','<form id="hurricane-form" class="form-grid">'+hurricaneFields(hc?.data||{})+(hc?'<div class="wide">'+area('storm-reason','Reason for revised forecast or trigger details')+'</div>':'')+'<div class="actions"><button class="primary">Save hurricane event</button><button type="button" id="clear-hurricane">Clear editor</button></div></form>');
 $('#incident-form').onsubmit=action(async()=>{const payload={id:$('#inc-id').value.trim(),planId:$('#inc-plan').value,title:$('#inc-title').value,occurredAt:Delimited.utcTimestamp($('#inc-occurred').value),detectedAt:Delimited.utcTimestamp($('#inc-detected').value),remoteServiceLoss:$('#inc-remote').checked,significant:$('#inc-significant').checked,expectedOver24Hours:$('#inc-extended').checked,status:$('#inc-status').value,restoredAt:$('#inc-restored').value?Delimited.utcTimestamp($('#inc-restored').value):null,note:$('#inc-note').value,sourceRefs:readRefs('inc')};if(ic)await command('incident.correct',{id:incidentCorrection,previousSha256:ic.sha256,replacement:payload,reason:$('#inc-reason').value},'Incident update retained with its earlier observation.');else await command('incident.record',payload,'Incident observation saved.');incidentCorrection=null;renderIncidents();});
 $('#hurricane-form').onsubmit=action(async()=>{const payload={id:$('#storm-id').value.trim(),name:$('#storm-name').value,planId:$('#storm-plan').value,expectedImpactAt:Delimited.utcTimestamp($('#storm-impact').value),mpcTriggeredAt:Delimited.utcTimestamp($('#storm-trigger').value),noticeReceivedAt:Delimited.utcTimestamp($('#storm-received').value),note:$('#storm-note').value,sourceRefs:readRefs('storm')};if(hc)await command('hurricane.correct',{id:hurricaneCorrection,previousSha256:hc.sha256,replacement:payload,reason:$('#storm-reason').value},'Revised hurricane observation retained.');else await command('hurricane.record',payload,'Hurricane event saved.');hurricaneCorrection=null;renderIncidents();});
 $('#communication-form').onsubmit=action(async()=>await command('communication.record',{id:id('communication'),incidentId:$('#comm-incident').value,channel:$('#comm-channel').value,at:Delimited.utcTimestamp($('#comm-time').value),recipient:$('#comm-recipient').value,summary:$('#comm-summary').value,sourceRefs:readRefs('comm')},'Actual communication recorded.'));
 $('#incident-report-form').onsubmit=action(async()=>await command('incidentReport.record',{id:id('incident-report'),incidentId:$('#report-incident').value,cause:$('#ir-cause').value,impact:$('#ir-impact').value,correctiveActions:$('#ir-actions').value,recurrenceMeasures:$('#ir-recurrence').value,sourceRefs:readRefs('ir')},'Written post-incident report recorded.'));
 $('#clear-incident').onclick=()=>{incidentCorrection=null;renderIncidents();};$('#clear-hurricane').onclick=()=>{hurricaneCorrection=null;renderIncidents();};
 document.querySelectorAll('[data-correct-incident]').forEach(b=>b.onclick=()=>{incidentCorrection=b.dataset.correctIncident;renderIncidents();});
 document.querySelectorAll('[data-correct-hurricane]').forEach(b=>b.onclick=()=>{hurricaneCorrection=b.dataset.correctHurricane;renderIncidents();});
}

let reportFrom=null,reportTo=null;
function period(){
 const to=reportTo||reviewTime(),from=reportFrom||new Date(Date.parse(to)-30*86400000).toISOString();return{from,to,asOf:to};
}
function reportBody(){
 const range=period(),r=Model.serviceReview(workspace,range),a=r.acceptance,p=pickPlan(r.planId),snapshot=Model.exportSnapshot(workspace);
 return '<div class="report"><h1>Backup and recovery service review</h1><p>'+html(workspace.title)+'</p><p class="subtle">'+html(formatTime(range.from))+' to '+html(formatTime(range.to))+' · Revision '+workspace.revision+'</p>'+
 '<section><h2>Recorded service activity</h2>'+viewValue(r.counts||r.summary||{backups:r.backupCounts,recoveries:r.recoveryCounts})+'</section>'+
 '<section><h2>Exceptions and operating actions</h2>'+viewValue(r.backupExceptions||r.exceptions||[]) +viewValue(r.actions||[])+'</section>'+
 '<section><h2>Recovery observations</h2>'+viewTable(r.recoveryMetrics||r.recoveries||[],['id','workloadId','method','status','rpoMinutes','rtoMinutes','executionMinutes','targetsApproved','rpoMet','rtoMet'])+'</section>'+
 '<section><h2>Recurring restore programme</h2>'+viewTable(r.restoreDue||[],['workloadId','name','lastRestoredAt','dueAt','status','daysUntilDue'])+'</section>'+
 '<section><h2>Acceptance review</h2><p>'+badge(a.status)+'</p>'+viewValue(a.missing||[]) +viewValue(a.checks||[])+'</section>'+
 '<section><h2>Incident follow-through</h2>'+viewValue(r.incidents||[])+'</section>'+
 '<section><h2>Saved recovery plan</h2><p>'+html(p?.title||'No installation plan saved')+'</p>'+(p?viewTable(Model.recoveryOrder(workspace,{planId:p.id}).items,['order','stage','name','dependencies','rpoMinutes','rtoMinutes']):'')+'</section>'+
 '<section><h2>Source and handover</h2><p>The accompanying complete workspace preserves every source edition, command, correction and recorded result used for this review.</p>'+cells(['Original file','Bytes','SHA-256'],arr(workspace.sources).map(s=>[html(s.name),html(s.bytes),'<code>'+html(s.sha256)+'</code>']))+'</section>'+
 '<p class="foot small">Workspace '+html(workspace.id)+' · Snapshot SHA-256 '+html(Codec.sha256(Model.canonical(snapshot)))+' · Generated '+html(formatTime(stamp()))+'</p></div>';
}
function renderAcceptance(){
 const a=Model.overview(workspace,reviewTime()).acceptance,runs=currentRecords('recoveries'),p=currentPlan(),range=period();
 $('#main').innerHTML=heading('Acceptance and handover','Review the actual recovery cycle, operating procedures and remaining deficiencies. Freeze the complete source and results for the receiving operator.')+
 panel('Current acceptance review','<p>'+badge(a.status)+'</p>'+viewValue(a.missing||[])+viewValue(a.workloads||[]))+
 '<div class="grid">'+panel('Record recovery acceptance','<form id="run-acceptance-form" class="form-grid">'+select('accept-run','Recovery run',runs.map(r=>[r.id,r.id+' · '+r.workloadId]))+select('accept-decision','Engineering decision',['accepted','rejected'],'accepted')+sourceRefFields('accept')+'<div class="wide">'+area('accept-note','Review findings and decision')+'</div><div class="actions"><button>Record run decision</button></div></form>')+
 panel('Record operational acceptance','<form id="check-form" class="form-grid">'+select('check-plan','Plan',planOptions(),p?.id)+select('check-criterion','Criterion',[['monitoring','Monitoring and job alerts'],['reporting','Service reporting'],['administrative-access','Administrative access'],['training','Operator training'],['deficiency-closeout','Deficiency closeout']],'monitoring')+select('check-decision','Recorded decision',['accepted','rejected'],'accepted')+sourceRefFields('check')+'<div class="wide">'+area('check-note','Performed work, operator and result')+'</div><div class="actions"><button>Record operating review</button></div></form>')+'</div>'+
 panel('Service review period','<div class="form-grid">'+input('report-from','From, ISO time',range.from)+input('report-to','To, ISO time',range.to)+'<div class="actions"><button id="refresh-report">Refresh review</button><button id="print-report">Print / save PDF</button><button id="freeze-handover" class="primary">Download complete handover</button></div></div>')+
 '<section id="handover-report">'+reportBody()+'</section>';
 $('#run-acceptance-form').onsubmit=action(async()=>{const runId=$('#accept-run').value;if(!runId)throw Error('Choose a recorded recovery.');await command('acceptance.record',{id:id('acceptance'),runId,runSha256:latestVersion('recoveries',runId).sha256,decision:$('#accept-decision').value,note:$('#accept-note').value,sourceRefs:readRefs('accept')},'Engineering decision saved against the exact recovery version.');});
 $('#check-form').onsubmit=action(async()=>await command('acceptance.check',{id:id('check'),planId:$('#check-plan').value,criterion:$('#check-criterion').value,decision:$('#check-decision').value,note:$('#check-note').value,sourceRefs:readRefs('check')},'Operational acceptance review recorded.'));
 const refresh=()=>{reportFrom=Delimited.utcTimestamp($('#report-from').value);reportTo=Delimited.utcTimestamp($('#report-to').value);if(Date.parse(reportFrom)>Date.parse(reportTo))throw Error('The review start must be before the end.');$('#handover-report').innerHTML=reportBody();};
 $('#refresh-report').onclick=action(refresh);$('#print-report').onclick=action(()=>{refresh();window.print();});$('#freeze-handover').onclick=action(async()=>{refresh();const snapshot=Model.exportSnapshot(workspace),body=Model.canonical(snapshot),packet={format:'mpc-recovery-portable.v1',sha256:Codec.sha256(body),snapshot},report='<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Backup and recovery service review</title><style>'+APP_CSS+'</style></head><body>'+reportBody()+'</body></html>';
 const files=[{path:'workspace.json',content:json(packet)},{path:'service-review.html',content:report},{path:'service-review.json',content:json(Model.serviceReview(workspace,period()))},{path:'recovery-order.json',content:json(Model.recoveryOrder(workspace))},{path:'README.txt',content:'Open service-review.html for the retained operating review. Open recovery-operations.html and receive workspace.json to continue with the full sources, records and history. The original source files are in sources/. Snapshot identity: '+packet.sha256+'\n'}];
 for(const s of arr(workspace.sources))files.push({path:'sources/'+s.id.replace(/[^a-zA-Z0-9_-]/g,'_')+'/'+s.name.replace(/[^a-zA-Z0-9._-]/g,'_'),content:s.encoding==='base64'?Uint8Array.from(atob(s.content),c=>c.charCodeAt(0)):s.content});
 files.push({path:'recovery-operations.html',content:standaloneHtml()});
 files.push({path:'manifest.json',content:json({workspaceId:workspace.id,revision:workspace.revision,createdAt:stamp(),period:period(),snapshotSha256:packet.sha256,files:files.map(f=>({path:f.path,bytes:typeof f.content==='string'?new TextEncoder().encode(f.content).length:f.content.length,sha256:Codec.sha256(f.content)}))})});
 download('Recovery_Operations_Handover_r'+workspace.revision+'.zip',zipFiles(files));notice('Complete handover downloaded with original sources, saved review and receiving application.');});
}
function renderOverview(){
 const v=Model.overview(workspace,reviewTime()),p=pickPlan(v.activePlan?.id),backups=currentRecords('backups'),recoveries=currentRecords('recoveries');
 $('#main').innerHTML=heading('Service overview','Review the recorded installation and service state at the selected time. Imported observations drive the results.')+
 '<div class="grid four">'+[['Workloads',v.activePlan?.workloads||0],['Repositories',v.activePlan?.repositories||0],['Backup observations',backups.length],['Recovery observations',recoveries.length]].map(([label,n])=>'<div class="stat"><strong>'+n+'</strong><span>'+html(label)+'</span></div>').join('')+'</div><br>'+
 '<div class="grid">'+panel('Active plan',v.activePlan?'<h3>'+html(v.activePlan.title)+'</h3><p>'+badge(v.activePlan.approved?'Targets approved':'Targets proposed')+'</p><p class="small">All timings below remain linked to the actual saved plan edition.</p>':empty('Import the installation source, then save its first recovery plan.'))+
 panel('Acceptance and immediate work','<p>'+badge(v.acceptance?.status)+'</p>'+viewValue(v.acceptance?.missing||[]))+'</div>'+
 panel('Recurring restore programme',viewTable(v.restoreDue||[],['name','intervalDays','lastRestoredAt','dueAt','status','daysUntilDue']))+
 panel('Observed recovery performance',viewTable(v.recoveryMetrics||[],['id','workloadId','method','status','rpoMinutes','rtoMinutes','executionMinutes','targetsApproved','rpoMet','rtoMet']))+
 panel('Recovery dependency order',p?viewTable(Model.recoveryOrder(workspace,{planId:p.id}).items,['order','stage','name','dependencies','rpoMinutes','rtoMinutes']):empty('Save a plan to compute the recovery order.'))+
 panel('Incident follow-through',viewValue(v.incidents||[]))+
 panel('Hurricane preparation',viewValue(v.hurricanes||[]));
}

async function boot(){
 try{
  const initial=JSON.parse(INITIAL_SNAPSHOT);
  applicationSource=JSON.parse(await new Response(new Blob([Uint8Array.from(atob(APP_SOURCE_GZIP),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  proposalRegister={requirements:JSON.parse(applicationSource.files.find(f=>f.path==='proposal/requirements.json').content),steps:JSON.parse(applicationSource.files.find(f=>f.path==='proposal/acceptance-steps.json').content)};
  let saved;try{saved=localStorage.getItem(STORAGE);}catch{}
  branchStore=createBrowserWorkspaceStore({indexedDB:window.indexedDB,canonical:Model.canonical,sha256:Codec.sha256,receiveSnapshot:Model.receiveSnapshot,exportSnapshot:Model.exportSnapshot,uuid:()=>crypto.randomUUID(),now:stamp});
  let preferredId;try{preferredId=sessionStorage.getItem(SESSION_BRANCH);}catch{}
  branchRecord=await branchStore.initialize({initialSnapshot:initial,legacyRaw:saved??null,preferredId});
  workspace=Model.receiveSnapshot(branchRecord.snapshot);
  try{sessionStorage.setItem(SESSION_BRANCH,branchRecord.id);}catch{}
  installBranchControls();await refreshBranchChoices();$('#storage').textContent='Saved in an independent browser branch';
  $('#asof').value=new Date().toISOString().slice(0,16);
  try{$('#actor').value=sessionStorage.getItem('mpc-operating-engineer')||'';}catch{}
  $('#actor').onchange=()=>{try{sessionStorage.setItem('mpc-operating-engineer',$('#actor').value);}catch{}};
  $('#asof').onchange=action(()=>{reviewClockPinned=true;render();});
  $('#live-asof').onclick=action(()=>{reviewClockPinned=false;render();});
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=action(()=>{if(tab==='plan')retainPlanFields();tab=b.dataset.tab;render();}));
  $('#export').onclick=action(exportWorkspace);
  $('#receive').onchange=action(async()=>{const file=$('#receive').files[0];if(file)await receiveFile(file);$('#receive').value='';});
  $('#download-app').onclick=action(async()=>{
   const selected=selectedContext(),snapshot=Model.exportSnapshot(workspace);
   const bytes=Uint8Array.from(atob(APP_SOURCE_GZIP),c=>c.charCodeAt(0));
   const payload=JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
   sameBranch(selected);
   const files=payload.files.filter(f=>f.path!=='initial-snapshot.json').map(f=>({path:f.path,content:f.content}));
   files.push({path:'initial-snapshot.json',content:INITIAL_SNAPSHOT});
   files.push({path:'current-workspace.json',content:json({format:'mpc-recovery-portable.v1',sha256:Codec.sha256(Model.canonical(snapshot)),snapshot})});
   files.push({path:'recovery-operations.html',content:standaloneHtml()});
   download('MPC_Recovery_Operations_Application.zip',zipFiles(files));notice('Complete application source and current workspace downloaded.');
  });
  render();notice('Opened '+branchRecord.label+'. Receive creates an independent branch; existing saved work remains available.');
 }catch(e){notice('Unable to open the workspace: '+e.message,true);}
}
boot();
