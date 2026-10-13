// MIT. Software release operations on the original private Central listener.
const $=id=>document.getElementById(id),arr=x=>Array.isArray(x)?x:[],clone=x=>JSON.parse(JSON.stringify(x));
const S={state:null,op:null,editor:null,pending:null,busy:false,prefix:'',token:'',working:{reviewer:'',note:'',decisions:{}},storageError:false};
const API='/api/release-operations',tokenKey='central-release-operations-token:'+location.origin;
const uid=prefix=>prefix+'-'+crypto.randomUUID(),label=x=>String(x??'').replace(/[-_]/g,' ').replace(/^./,c=>c.toUpperCase());
function el(tag,text,className){const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(className)n.className=className;return n;}
function note(text,error=false){$('notice').textContent=String(text);$('notice').dataset.error=String(error);}
function lock(n,yes){n.dataset.locked=String(Boolean(yes));n.disabled=S.busy||Boolean(yes);}
function controls(){document.querySelectorAll('button,input,select,textarea').forEach(n=>{n.disabled=S.busy||n.dataset.locked==='true';});}
function button(text,fn,disabled=false){const b=el('button',text);b.type='button';lock(b,disabled);b.addEventListener('click',()=>run(fn));return b;}
function storageGet(key){try{return sessionStorage.getItem(key);}catch{return null;}}
function readStored(key){try{return JSON.parse(storageGet(key)||'null');}catch{return null;}}
function writeStored(key,value){const text=JSON.stringify(value);sessionStorage.setItem(key,text);if(sessionStorage.getItem(key)!==text)throw Error('The browser did not retain the original request.');}
function persistEditor(){
  if(!S.editor||!S.prefix)return true;
  try{writeStored(S.prefix+':draft:'+S.editor.id,{editor:S.editor,working:S.working});sessionStorage.setItem(S.prefix+':selected',S.editor.id);S.storageError=false;return true;}
  catch{S.storageError=true;note('The current local draft is still open, but this tab could not save its recovery copy. Download the draft before closing.',true);return false;}
}
function dirty(){if(S.editor){S.editor.dirty=true;persistEditor();renderDraftStatus();}}
function storePending(p){writeStored(S.prefix+':pending',p);S.pending=p;renderPending();}
function clearPending(){sessionStorage.removeItem(S.prefix+':pending');S.pending=null;renderPending();}
function applyToken(value){S.token=String(value||'').trim();try{sessionStorage.setItem(tokenKey,S.token);}catch{}document.querySelectorAll('a[data-path]').forEach(a=>{a.href=a.dataset.path+(S.token?'#token='+encodeURIComponent(S.token):'');a.rel='noreferrer';});}
async function api(path,body,options={}){
  const response=await fetch(path,{method:body===undefined?'GET':'POST',cache:'no-store',redirect:'error',credentials:'same-origin',
    headers:{Authorization:'Bearer '+S.token,...(body===undefined?{}:{'Content-Type':'application/json'}),...options.headers},
    ...(body===undefined?{}:{body:options.raw?body:JSON.stringify(body)})});
  if(options.blob&&response.ok)return response.blob();
  let value;try{value=await response.json();}catch{throw Object.assign(Error('The server returned an unreadable response. Check the original request before another write.'),{status:response.status,uncertain:true});}
  if(!response.ok||value?.ok===false){const e=value?.error??{};throw Object.assign(Error(e.message||'The operation did not finish.'),e,{status:response.status});}
  return Object.hasOwn(value??{},'result')?value.result:value;
}
async function run(fn){
  if(S.busy)return;S.busy=true;controls();
  try{await fn();}catch(error){note(error.message||String(error),true);if(error.status===401){$('unlock').hidden=false;}}
  finally{S.busy=false;controls();renderPending();}
}
function download(value,name,type='application/json;charset=utf-8'){
  const blob=value instanceof Blob?value:new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)+'\n'],{type});
  const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=String(name).replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,180);
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
}
async function sha(file){const bytes=await file.arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function options(select,values,value=select.value,prompt='Select original source'){
  select.replaceChildren();if(prompt!==null){const p=el('option',prompt);p.value='';select.append(p);}
  for(const row of values){const o=el('option',row.label);o.value=String(row.value);select.append(o);}
  if(select.multiple){
    for(const item of arr(value))if(![...select.options].some(o=>o.value===String(item))){const o=el('option','Saved selection unavailable: '+item);o.value=String(item);select.append(o);}
    for(const o of select.options)o.selected=arr(value).map(String).includes(o.value);
  }
  else select.value=String(value??'');
  if(!select.multiple&&value&&select.value===''){const absent=el('option','Saved selection unavailable: '+value);absent.value=String(value);select.append(absent);select.value=String(value);}
}
const sources=()=>arr(S.state?.sources),source=id=>sources().find(x=>x.id===id);
const sourceOptions=()=>sources().map(x=>({value:x.id,label:(x.name||x.id)+' · '+label(x.kind)+' · '+label(x.status)}));
function fillSource(select,value=select.value){options(select,sourceOptions(),value);}
function facts(value){
  const d=el('dl',null,'facts');
  for(const [key,val]of Object.entries(value??{})){if(val==null)continue;d.append(el('dt',label(key)),el('dd',typeof val==='object'?friendly(val):val));}return d;
}
function friendly(v){if(v==null)return 'Not recorded';if(Array.isArray(v))return v.map(friendly).join('\n');if(typeof v==='object')return Object.entries(v).map(([k,x])=>label(k)+': '+friendly(x)).join('\n');return String(v);}
function canon(x){if(Array.isArray(x))return '['+x.map(canon).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canon(x[k])).join(',')+'}';return JSON.stringify(x);}
function checkSourceSelection(record,pending){
  if(record.id!==pending.id)throw Error('The saved source has a different original identity.');
  if(pending.kind==='upload'){
    const resource=arr(record.resources).find(r=>r.key==='original');
    if(record.kind!==pending.sourceKind||record.name!==pending.name||resource?.sha256!==pending.sha256||resource?.bytes!==pending.bytes)
      throw Error('The saved source differs from the retained upload. Keep this original request for review.');
    if(pending.sourceKind==='gitlab-artifact'){
      const q=new URL(pending.url,location.origin).searchParams,req=record.request??{};
      if(req.gitlabSourceId!==q.get('gitlabSourceId')||String(req.jobId)!==q.get('jobId'))throw Error('The saved artifact belongs to a different original GitLab source or job.');
    }
  }else{
    const req=record.request??{},expected=pending.body;
    for(const key of ['connectionId','projectId','pipelineId'])if(String(req[key])!==String(expected[key]))throw Error('The saved GitLab source selection differs from the original request.');
    for(const key of ['jobIds','deploymentIds','artifactJobIds'])if(canon(arr(req[key]).map(String).sort())!==canon(arr(expected[key]).map(String).sort()))throw Error('The saved GitLab resource selection differs from the original request.');
  }
}
async function installResult(result,pending){
  await refreshState();
  if(pending.kind==='action'){
    const id=pending.body.id;
    if(S.editor&&S.editor.id!==id){if(!persistEditor())throw Error('Save the open local draft before receiving the original operation result.');const local=readStored(S.prefix+':draft:'+id);S.editor=local?.editor??null;S.working=local?.working??{reviewer:'',note:'',decisions:{}};}
    const record=await api(API+'/operations/'+encodeURIComponent(id));
    const current=S.editor&&S.editor.id===id?S.editor:readStored(S.prefix+':draft:'+id)?.editor;
    const changed=Boolean(current&&current.id===id&&current.dirty&&pending.editorSnapshot!==canon({name:current.name,definition:current.definition}));
    if(pending.action==='decide'&&Object.entries(S.working.decisions||{}).every(([id,value])=>{
      const saved=arr(pending.body.decisions).find(x=>x.issueId===id);return value.decision?canon(saved)===canon(value):!saved;
    })){
      S.working.decisions={};S.working.decisionRevision=null;
    }
    const draftKind=pending.action==='receiveStep'?'stepDrafts':pending.action==='recordCheck'?'checkDrafts':null;
    if(draftKind){
      const key=pending.body.stepId||pending.body.checkId,draft=S.working[draftKind]?.[key];
      if(draft&&Object.keys(draft).every(k=>canon(draft[k])===canon(pending.body[k])))delete S.working[draftKind][key];
    }
    installOperation(record,changed);
    note('Saved '+label(pending.action)+'.');
  }else{renderSources();if(S.editor){renderEditor();renderOperation();}note('Original source retained: '+label(result.status||'saved')+'.');}
}
async function performAction(action,body){
  if(S.pending)throw Error('Check the retained original request before another write.');
  const input={...body,requestId:uid('request')};
  const pending={kind:'action',action,body:input,id:input.id,requestId:input.requestId,
    editorSnapshot:S.editor?canon({name:S.editor.name,definition:S.editor.definition}):null,createdAt:new Date().toISOString()};
  storePending(pending);
  try{const result=await api(API+'/actions/'+action,input);clearPending();await installResult(result,pending);return result;}
  catch(error){if([400,401,403,409,422].includes(error.status)&&!error.uncertain)clearPending();throw error;}
}
function renderPending(){
  $('pending').hidden=!S.pending;
  if(S.pending)$('pending-description').textContent=label(S.pending.action||S.pending.sourceKind||S.pending.kind)+' · '+S.pending.id+' · retained '+S.pending.createdAt+'. Resume this same request after an interrupted response.';
  $('reselect').hidden=S.pending?.kind!=='upload';
}
async function recoverOriginal(){
  const p=S.pending;if(!p)return;
  if(p.kind==='action'){
    let receipt;try{receipt=await api(API+'/requests/'+encodeURIComponent(p.requestId));}
    catch(error){if(error.status!==404)throw error;}
    if(receipt){
      if(receipt.requestId!==p.requestId||receipt.action!==p.action||canon(receipt.input)!==canon(p.body))throw Error('The returned request is not the retained original. Keep it for review.');
      clearPending();await installResult(receipt.result,p);return;
    }
    const result=await api(API+'/actions/'+p.action,p.body);clearPending();await installResult(result,p);return;
  }
  let saved;try{saved=await api(API+'/sources/'+encodeURIComponent(p.id));}catch(error){if(error.status!==404)throw error;}
  if(saved){checkSourceSelection(saved,p);clearPending();await installResult(saved,p);return;}
  if(p.kind==='gitlab'){
    const result=await api(API+'/actions/receiveGitLab',p.body);checkSourceSelection(result,p);clearPending();await installResult(result,p);return;
  }
  const file=$('reselect-file').files[0];
  if(!file||file.size!==p.bytes||await sha(file)!==p.sha256)throw Error('Reselect the complete original file with the recorded byte length and SHA256.');
  const result=await api(p.url,file,{raw:true,headers:{'Content-Type':'application/octet-stream'}});
  checkSourceSelection(result,p);clearPending();await installResult(result,p);
}
async function recover(){
  try{await recoverOriginal();}catch(error){
    if([400,401,403,409,422].includes(error.status)&&!error.uncertain)clearPending();
    throw error;
  }
}
async function refreshState(){
  const next=await api(API+'/state'),changed=Boolean(S.state&&S.state.workspaceId!==next.workspaceId);
  if(changed&&S.editor&&!persistEditor())throw Error('Download the previous local draft before opening this different workspace.');
  if(changed){S.editor=null;S.op=null;S.working={reviewer:'',note:'',decisions:{}};}
  S.state=next;S.prefix='central-release-operations:'+location.origin+':'+S.state.workspaceId;
  if(changed)S.pending=readStored(S.prefix+':pending');
  $('workspace-name').textContent='Workspace '+S.state.workspaceId;renderSourceControls();renderOperations();renderSources();
  if(changed){renderEditor();renderPending();throw Error('A different workspace is now open. Your previous local draft is preserved; choose an operation from this workspace.');}
}
function renderSourceControls(){
  const connections=arr(S.state.connections??S.state.gitlabConnections);
  options($('gitlab-connection'),connections.map(x=>({value:x.id,label:x.name||x.id})),$('gitlab-connection').value,'Select configured connection');
  $('gitlab-help').textContent=connections.length?'The host retains provider authorization. Only these configured connections are available.':'The existing host operator can select the private GitLab connection file when opening this workspace. Original file receiving is available now.';
  lock($('gitlab-receive'),!connections.length);
  options($('original-kind'),arr(S.state.sourceKinds).map(x=>({value:typeof x==='string'?x:x.id,label:label(typeof x==='string'?x:x.label||x.id)})),$('original-kind').value,'Select original kind');
  options($('artifact-source'),sources().filter(x=>x.kind==='gitlab').map(x=>({value:x.id,label:x.name||x.id})),$('artifact-source').value);
}
async function openSource(id,container){
  const full=await api(API+'/sources/'+encodeURIComponent(id));container.replaceChildren();
  container.append(facts(full.facts));
  if(full.error)container.append(el('p',friendly(full.error),'notice'));
  if(['PAUSED','CAPTURING','FAILED'].includes(full.status))container.append(button('Resume same source request',async()=>{const next=await api(API+'/actions/resumeSource',{id});await refreshState();note('Source '+label(next.status)+'.');}));
  for(const resource of arr(full.resources)){
    const row=el('div',null,'resource'),body=el('div');body.append(el('strong',resource.name||resource.key),el('p',label(resource.kind)+' · '+String(resource.bytes??'—')+' bytes · '+String(resource.status??'')),el('p',resource.sha256||'','mono'));row.append(body);
    if(resource.sha256)row.append(button('Download original',async()=>{const blob=await api(API+'/files/'+encodeURIComponent(id)+'/'+encodeURIComponent(resource.key),undefined,{blob:true});if(blob.size!==resource.bytes||await sha(blob)!==resource.sha256)throw Error('The received file differs from its retained original.');download(blob,resource.name||resource.key);}));
    container.append(row);
  }
  if(arr(full.attempts).length){
    const history=el('details'),summary=el('summary','Original HTTP response history');history.append(summary);
    for(const [index,attempt]of full.attempts.entries()){
      const row=el('div',null,'resource'),description=el('div');
      description.append(el('strong',attempt.key+' · HTTP '+attempt.status),el('p',(attempt.observedAt||attempt.at||'')+' · '+attempt.bytes+' bytes'),el('p',attempt.sha256,'mono'));
      row.append(description,button('Download original response',async()=>{
        const blob=await api(API+'/files/'+encodeURIComponent(id)+'/'+encodeURIComponent('attempt:'+index),undefined,{blob:true});
        if(blob.size!==attempt.bytes||await sha(blob)!==attempt.sha256)throw Error('The received response differs from its retained original.');
        download(blob,'original-response-'+index+'.body');
      }));history.append(row);
    }
    container.append(history);
  }
}
function renderSources(){
  const target=$('sources');target.replaceChildren();
  if(!sources().length){target.append(el('p','No source editions have been retained yet.','muted'));return;}
  for(const item of sources()){
    const box=el('details'),sum=el('summary',(item.name||item.id)+' · '+label(item.kind)+' · '+label(item.status)),body=el('div');
    box.append(sum,body);box.addEventListener('toggle',()=>{if(box.open&&!body.childNodes.length)run(()=>openSource(item.id,body));});target.append(box);
  }
}
function defaultDefinition(){return {application:{baselineSourceId:'',candidateSourceId:'',projectId:'',environmentId:'',artifactKeys:[]},central:{baselineSourceId:'',candidateSourceId:'',connectionId:'',origin:''},dependencies:[],recovery:{snapshotSourceId:'',restoreSourceId:'',custodian:'',procedure:'',quiescence:'',acceptedLossWindow:'',coverage:[]},steps:[],checks:[]};}
function conflict(){return Boolean(S.op&&S.editor&&S.editor.expectedRevision!==S.op.revision);}
function definitionEditable(){return Boolean(S.editor&&!S.op?.planId&&!conflict());}
function cleanRequired(){if(!S.op)throw Error('Save the release definition first.');if(S.editor?.dirty)throw Error('Save or reload the current definition before reviewing its saved plan.');if(conflict())throw Error('Review the saved revision before continuing.');}
function reviewInput(){cleanRequired();const reviewer=$('reviewer').value.trim(),note=$('review-note').value.trim();if(!reviewer||!note)throw Error('Name the reviewer and record the review or receiving note.');return {id:S.op.id,expectedRevision:S.op.revision,reviewer,note};}
function installOperation(record,preserveDirty=true){
  const same=S.editor&&S.editor.id===record.id,stored=readStored(S.prefix+':draft:'+record.id);
  const retained=same?S.editor:stored?.editor;
  if(!same)S.working=stored?.working??{reviewer:'',note:'',decisions:{}};
  S.op=record;
  if(preserveDirty&&retained?.dirty)S.editor=retained;
  else S.editor={id:record.id,mode:'existing',expectedRevision:record.revision,name:record.name,definition:clone(record.definition),dirty:false};
  const local=readStored(S.prefix+':draft:'+record.id);if(local?.working&&!S.working.reviewer)S.working=local.working;
  persistEditor();renderEditor();renderOperation();
}
async function openOperation(id){
  if(S.editor&&!persistEditor())throw Error('Download the complete local draft before leaving it.');
  const local=readStored(S.prefix+':draft:'+id);
  let record;try{record=await api(API+'/operations/'+encodeURIComponent(id));}catch(error){if(error.status!==404||!local?.editor)throw error;}
  S.working=local?.working??{reviewer:'',note:'',decisions:{}};
  if(record)installOperation(record,true);else{S.op=null;S.editor=local.editor;renderEditor();renderOperation();}
}
function newOperation(previous=null){
  if(S.editor&&!persistEditor())throw Error('Download the complete local draft before leaving it.');
  S.editor={id:uid('release'),mode:previous?'successor':'new',fromId:previous?.id,expectedRevision:null,
    name:previous?previous.name+' — successor':'',definition:previous?clone(previous.definition):defaultDefinition(),dirty:true};
  S.op=null;S.working={reviewer:S.working.reviewer,note:'',decisions:{}};persistEditor();renderEditor();renderOperation();
}
function renderOperations(){
  const filter=$('operation-search').value.toLowerCase(),box=$('operations');box.replaceChildren();
  for(const item of arr(S.state.operations).filter(x=>(x.name+' '+x.id).toLowerCase().includes(filter))){
    const b=button('',()=>openOperation(item.id));b.append(el('strong',item.name||item.id),el('span',label(item.status)+' · revision '+item.revision));b.setAttribute('aria-pressed',String(S.op?.id===item.id));box.append(b);
  }if(!box.childNodes.length)box.append(el('p','No matching saved operations.','muted'));
}
function editorField(id,read,write){
  const n=$(id);
  if(id==='central-connection')options(n,arr(S.state.centralConnections).map(x=>({value:x.id,label:(x.name||x.id)+' · '+x.url})),read(),'Select saved Central connection');
  else if(n.tagName==='SELECT')fillSource(n,read());else n.value=read()??'';
  n.oninput=()=>{write(n.value);dirty();};lock(n,!definitionEditable());
}
function renderEditor(){
  $('empty').hidden=Boolean(S.editor);$('operation-content').hidden=!S.editor;if(!S.editor)return;
  const d=S.editor.definition;d.application??={};d.central??={};d.recovery??={};for(const key of ['dependencies','steps','checks'])d[key]??=[];d.recovery.coverage??=[];
  $('operation-name').value=S.editor.name;lock($('operation-name'),!definitionEditable());$('operation-name').oninput=()=>{S.editor.name=$('operation-name').value;dirty();};
  for(const [id,group,key]of [['app-baseline','application','baselineSourceId'],['app-candidate','application','candidateSourceId'],['app-project','application','projectId'],['app-environment','application','environmentId'],['central-baseline','central','baselineSourceId'],['central-candidate','central','candidateSourceId'],['central-connection','central','connectionId'],['central-origin','central','origin'],['snapshot-source','recovery','snapshotSourceId'],['restore-source','recovery','restoreSourceId'],['recovery-custodian','recovery','custodian'],['recovery-procedure','recovery','procedure'],['recovery-quiescence','recovery','quiescence'],['loss-window','recovery','acceptedLossWindow']]){
    editorField(id,()=>d[group][key],value=>{d[group][key]=value;if(id==='app-candidate')renderArtifacts();if(id==='central-connection'){const original=arr(S.state.centralConnections).find(x=>x.id===value);if(original){d.central.origin=original.url;$('central-origin').value=original.url;}}});
  }
  renderArtifacts();renderRows();renderDraftStatus();
}
async function candidateResources(){
  const id=S.editor?.definition.application.candidateSourceId;if(!id)return[];
  const value=await api(API+'/sources/'+encodeURIComponent(id));return arr(value.resources);
}
function renderArtifacts(){
  const select=$('app-artifacts'),editor=S.editor,id=editor.definition.application.candidateSourceId;
  function display(resources){
    if(S.editor!==editor||S.editor.definition.application.candidateSourceId!==id)return;
    const values=arr(resources).filter(x=>x.kind==='artifact'||/artifact/i.test(x.key)).map(x=>({value:x.key,label:(x.name||x.key)+' · '+String(x.bytes??'—')+' bytes'}));
    for(const item of sources().filter(x=>x.kind==='gitlab-artifact'&&x.status==='COMPLETE'))
      values.push({value:item.id+'/original',label:'Uploaded original: '+(item.name||item.id)});
    options(select,values,arr(editor.definition.application.artifactKeys),null);
    lock(select,!definitionEditable());
  }
  display([]);
  select.onchange=()=>{S.editor.definition.application.artifactKeys=[...select.selectedOptions].map(o=>o.value);dirty();};
  if(id)candidateResources().then(display).catch(error=>note(error.message,true));
}
const rowSpecs={
 dependencies:[['label','Requirement name'],['sourceId','Original requirement source','source'],['requirement','Version or compatibility requirement','area'],['owner','Responsible owner']],
 coverage:[['label','Recovery component'],['sourceId','Original coverage source','source'],['status','Coverage','select',['covered','not-applicable','missing']],['note','Coverage decision and scope','area']],
 steps:[['title','Step title'],['phase','Phase','select',['release','recovery']],['kind','Operation','select',['app-deploy','central-upgrade','restore','form-publish','verify']],['owner','Original operator'],['dependsOn','Predecessor steps','steps'],['procedure','Existing procedure and expected return','area'],['expectedSourceId','Expected original edition','source'],['evidenceKind','Returned evidence','select',['deployment','host','restore','form-publication','operator']],['formPlanId','Existing form publication plan','plans']],
 checks:[['label','Acceptance check'],['phase','Phase','select',['release','recovery']],['component','Component','select',['application','central','joint']],['expected','Expected observed result','area'],['sourceId','Original acceptance requirement','source'],['required','Required for acceptance','check'],['procedure','How the original operator observes the result','area']]
};
function rowList(kind){return kind==='coverage'?S.editor.definition.recovery.coverage:S.editor.definition[kind];}
function renderRows(){
  for(const [kind,spec]of Object.entries(rowSpecs)){
    const container=$(kind);container.replaceChildren();
    for(const [index,row]of rowList(kind).entries()){
      const box=el('section',null,'item'),head=el('div',null,'item-header');head.append(el('h4',(row.title||row.label||label(kind))+' · '+row.id),button('Remove',()=>{rowList(kind).splice(index,1);dirty();renderRows();},!definitionEditable()));box.append(head);
      const grid=el('div',null,'columns');
      for(const [key,title,type,values]of spec){
        const wrapper=el('label',title),n=el(type==='area'?'textarea':['select','source','steps','plans'].includes(type)?'select':'input');
        if(type==='area'){n.rows=3;n.maxLength=30000;n.value=row[key]??'';}
        else if(type==='source')fillSource(n,row[key]);
        else if(type==='select')options(n,values.map(x=>({value:x,label:label(x)})),row[key],null);
        else if(type==='steps'){n.multiple=true;n.size=Math.min(4,Math.max(2,S.editor.definition.steps.length));options(n,S.editor.definition.steps.filter(x=>x.id!==row.id).map(x=>({value:x.id,label:x.title||x.id})),row[key],null);}
        else if(type==='plans')options(n,arr(S.state.formPlans).map(x=>({value:x.id,label:x.name||x.title||x.id})),row[key],'No form plan');
        else if(type==='check'){n.type='checkbox';n.checked=row[key]!==false;wrapper.className='inline';}
        else{n.type='text';n.maxLength=key==='owner'?240:1000;n.value=row[key]??'';}
        lock(n,!definitionEditable());n.addEventListener('input',()=>{row[key]=type==='check'?n.checked:type==='steps'?[...n.selectedOptions].map(o=>o.value):n.value;dirty();});wrapper.append(n);grid.append(wrapper);
      }box.append(grid);container.append(box);
    }if(!container.childNodes.length)container.append(el('p','No '+kind+' selected yet.','muted'));
    lock($('add-'+({dependencies:'dependency',coverage:'coverage',steps:'step',checks:'check'}[kind])),!definitionEditable());
  }
}
function renderDraftStatus(){
  const p=$('draft-state');p.hidden=!S.editor||(!S.editor.dirty&&!conflict()&&!S.storageError);
  if(!p.hidden)p.textContent=conflict()?'Your retained local definition is based on revision '+S.editor.expectedRevision+'; the saved operation is revision '+S.op.revision+'. Download the local draft, then explicitly reload the saved definition before applying a revised edition.':S.storageError?'The complete current draft remains open. Download it before leaving this tab.':S.editor.dirty?'Local definition changes are retained in this tab. Save them to the shared workspace.':'';
  lock($('save-definition'),!definitionEditable()||Boolean(S.pending));
}
function mergedDecisions(){
  const all=new Map(arr(S.op?.decisions).map(x=>[x.issueId,x]));
  for(const [id,value]of Object.entries(S.working.decisions||{})){if(value.decision)all.set(id,value);else all.delete(id);}
  return [...all.values()];
}
function resultRows(value,title){
  const box=el('div');if(!arr(value).length)return el('p','No '+title+' retained.','muted');
  for(const row of value){const p=el('p',friendly(row),'outcome');box.append(p);}return box;
}
function renderOperation(){
  if(!S.editor)return;const op=S.op;
  $('operation-title').textContent=S.editor.name||'New software release operation';
  $('operation-status').textContent=op?label(op.status)+' · revision '+op.revision+' · '+label(op.activePhase||'release'):'Local preparation';
  $('reviewer').value=S.working.reviewer||'';$('review-note').value=S.working.note||'';
  $('successor').hidden=!op?.planId;lock($('discard-draft'),!op);
  $('inventory').replaceChildren(op?facts(op.assessment?.inventory):el('p','Save the definition to compare its original sources.','muted'));
  const issues=$('issues');issues.replaceChildren();
  for(const issue of arr(op?.assessment?.issues)){
    const card=el('section',null,'issue');card.dataset.severity=issue.severity;card.append(el('h4',issue.label||issue.code),el('p',issue.detail||''));
    const allowed=arr(issue.allowed).map(x=>typeof x==='string'?x:x.value);const select=el('select'),memo=el('textarea');
    const retained=S.working.decisions[issue.id]??arr(op.decisions).find(x=>x.issueId===issue.id)??{decision:'',note:''};
    options(select,allowed.map(x=>({value:x,label:label(x)})),retained.decision,'Choose disposition');memo.rows=2;memo.maxLength=20000;memo.value=retained.note||'';
    const l=el('label','Disposition'),m=el('label','Decision note');l.append(select);m.append(memo);card.append(l,m);
    const keep=()=>{S.working.decisionRevision??=op.revision;S.working.decisions[issue.id]={issueId:issue.id,decision:select.value,note:memo.value};persistEditor();lock($('freeze'),true);};
    select.onchange=keep;memo.oninput=keep;lock(select,Boolean(op?.planId)||!allowed.length);lock(memo,Boolean(op?.planId));issues.append(card);
  }
  if(op&&!issues.childNodes.length)issues.append(el('p','No unresolved source issues are listed.','muted'));
  $('decision-state').textContent=S.working.decisionRevision!=null&&S.working.decisionRevision!==op?.revision?
    'These local decisions were written against revision '+S.working.decisionRevision+'. The saved operation is now revision '+op.revision+'. Review the original source changes and explicitly reload saved decisions before applying a new decision edition.':
    Object.keys(S.working.decisions||{}).length?'Local decision notes are retained in this tab.':'';
  lock($('reload-decisions'),!op||Boolean(S.pending));
  const ready=op?.readiness??{};$('readiness').textContent=op?(op.planId?'Frozen plan '+op.planId+'. ':ready.canFreeze?'Ready to freeze the reviewed plan. ':'Resolve the current source and decision items before freezing. ')+friendly(ready.issues??[]):'Save an operation to review readiness.';
  lock($('save-decisions'),!op||Boolean(op.planId)||Boolean(S.pending));
  lock($('freeze'),!op||Boolean(op.planId)||!ready.canFreeze||Boolean(S.pending)||Object.keys(S.working.decisions||{}).length>0||S.working.decisionRevision!=null);
  lock($('download-plan'),!op?.planId);
  lock($('begin-recovery'),!op?.planId||op.activePhase==='recovery'||['ACCEPTED','RECOVERED'].includes(op.status)||Boolean(S.pending));
  lock($('accept-operation'),!op?.planId||!ready.canAccept||Boolean(S.pending));
  lock($('handover'),!op);lock($('print-plan'),!op);
  renderReceiving();$('history').replaceChildren(resultRows(op?.history,'history'));renderOperations();renderDraftStatus();
}
function sourceAndResource(form,draft,keep){
  const sourceLabel=el('label','Original returned source'),sourceSelect=el('select'),resourceLabel=el('label','Original resource'),resourceSelect=el('select');
  fillSource(sourceSelect,draft.sourceId);resourceLabel.append(resourceSelect);sourceLabel.append(sourceSelect);form.append(sourceLabel,resourceLabel);
  let sequence=0;
  async function update(){
    const turn=++sequence,id=sourceSelect.value,wanted=draft.resourceKey||'';
    options(resourceSelect,[],wanted,'Select original resource');if(!id)return;
    try{const full=await api(API+'/sources/'+encodeURIComponent(id));if(turn!==sequence||sourceSelect.value!==id)return;
      options(resourceSelect,arr(full.resources).filter(x=>x.sha256).map(x=>({value:x.key,label:(x.name||x.key)+' · '+String(x.bytes)+' bytes'})),wanted,'Select original resource');}
    catch(error){note(error.message,true);}
  }
  sourceSelect.onchange=()=>{draft.sourceId=sourceSelect.value;draft.resourceKey='';keep();void update();};
  resourceSelect.onchange=()=>{draft.resourceKey=resourceSelect.value;keep();};void update();
  return {source:sourceSelect,resource:resourceSelect};
}
function renderReceiving(){
  const op=S.op,steps=$('step-results'),checks=$('check-results');steps.replaceChildren();checks.replaceChildren();if(!op)return;
  S.working.stepDrafts??={};S.working.checkDrafts??={};
  for(const step of arr(op.definition.steps).filter(x=>x.phase===(op.activePhase||'release'))){
    const form=el('form',null,'result-form');form.append(el('h4',step.title),el('p',step.procedure||'','muted'));
    const prior=arr(op.results).filter(x=>x.stepId===step.id);
    if(prior.length){const last=prior.at(-1);form.append(el('p','Latest returned outcome: '+label(last.derivedOutcome||last.reportedOutcome)+' · '+(last.accepted?'Accepted':'Retained for review'),'outcome'));}
    const draft=S.working.stepDrafts[step.id]??={sourceId:'',resourceKey:'',reportedOutcome:'unknown'};
    const pick=sourceAndResource(form,draft,persistEditor),choice=el('select');
    options(choice,['success','failure','unknown'].map(x=>({value:x,label:label(x)})),draft.reportedOutcome,null);
    choice.onchange=()=>{draft.reportedOutcome=choice.value;persistEditor();};
    const l=el('label','Reported outcome');l.append(choice);form.append(l);
    const submit=el('button','Receive step result');submit.type='submit';lock(submit,!op.planId||['ACCEPTED','RECOVERED'].includes(op.status)||Boolean(S.pending));form.append(submit);
    form.onsubmit=e=>{e.preventDefault();run(async()=>{
      if(!pick.source.value||!pick.resource.value)throw Error('Select the complete original result and resource.');
      await performAction('receiveStep',{...reviewInput(),stepId:step.id,...clone(draft)});
    });};steps.append(form);
  }
  for(const check of arr(op.definition.checks).filter(x=>x.phase===(op.activePhase||'release'))){
    const form=el('form',null,'result-form');form.append(el('h4',check.label),el('p','Expected: '+check.expected),el('p',check.procedure||'','muted'));
    const draft=S.working.checkDrafts[check.id]??={sourceId:'',resourceKey:'',actual:'',decision:'pending'};
    const pick=sourceAndResource(form,draft,persistEditor),actual=el('textarea');actual.rows=3;actual.maxLength=30000;actual.value=draft.actual;
    actual.oninput=()=>{draft.actual=actual.value;persistEditor();};
    const actualLabel=el('label','Actually observed result');actualLabel.append(actual);form.append(actualLabel);
    const decision=el('select');options(decision,['pending','accept','reject'].map(x=>({value:x,label:label(x)})),draft.decision,null);
    decision.onchange=()=>{draft.decision=decision.value;persistEditor();};
    const dl=el('label','Staff acceptance');dl.append(decision);form.append(dl);
    const previous=arr(op.checkResults).filter(x=>x.checkId===check.id).at(-1);
    if(previous)form.append(el('p','Latest: '+label(previous.decision)+' · '+previous.actual,'outcome'));
    const submit=el('button','Record acceptance observation');submit.type='submit';lock(submit,!op.planId||['ACCEPTED','RECOVERED'].includes(op.status)||Boolean(S.pending));form.append(submit);
    form.onsubmit=e=>{e.preventDefault();run(async()=>{
      if(!pick.source.value||!pick.resource.value)throw Error('Select the complete original observation source.');
      await performAction('recordCheck',{...reviewInput(),checkId:check.id,...clone(draft)});
    });};checks.append(form);
  }
}
function preparePrint(){
  const view=$('print-view');view.replaceChildren();if(!S.op)return;
  const op=S.op;view.append(el('h1',op.name),el('p','Saved software release operation · '+op.id+' · revision '+op.revision+' · '+label(op.status)),
    el('p',op.planId?'Frozen plan: '+op.planId:'Preparation edition — a plan has not been frozen.'));
  for(const [title,value]of [['Selected source editions',op.definition.application],['Central edition',op.definition.central],['Dependencies',op.definition.dependencies],
    ['Recovery route',op.definition.recovery],['Ordered steps',op.definition.steps],['Acceptance requirements',op.definition.checks],
    ['Bound originals',op.assessment?.sourceBindings],['Reviewed source issues',op.assessment?.issues],['Staff decisions',op.decisions],
    ['Actual step outcomes',op.results],['Acceptance observations',op.checkResults],['Operation history',op.history]]){
    view.append(el('h2',title),el('div',friendly(value),'print-text'));
  }
}
function ids(value){if(!String(value).trim())return[];return String(value).split(/[,\s]+/).filter(Boolean).map(x=>{if(!/^\d+$/.test(x)||!Number.isSafeInteger(Number(x))||Number(x)<1)throw Error('Use the original positive numeric IDs separated by commas.');return Number(x);});}
function integer(value){const parsed=ids(value);if(parsed.length!==1)throw Error('Enter one original positive numeric ID.');return parsed[0];}
$('unlock-form').onsubmit=e=>{e.preventDefault();run(async()=>{applyToken($('token').value);await initialize();});};
$('gitlab-form').onsubmit=e=>{e.preventDefault();run(async()=>{
  if(S.pending)throw Error('Resolve the original retained request first.');
  const body={id:uid('gitlab'),name:$('gitlab-name').value.trim(),connectionId:$('gitlab-connection').value,projectId:integer($('gitlab-project').value),pipelineId:integer($('gitlab-pipeline').value),jobIds:ids($('gitlab-jobs').value),deploymentIds:ids($('gitlab-deployments').value),artifactJobIds:ids($('gitlab-artifacts').value)};
  const p={kind:'gitlab',id:body.id,body,createdAt:new Date().toISOString()};storePending(p);
  try{const result=await api(API+'/actions/receiveGitLab',body);checkSourceSelection(result,p);clearPending();await installResult(result,p);}
  catch(error){if([400,401,403,409,422].includes(error.status)&&!error.uncertain)clearPending();throw error;}
});};
$('original-kind').onchange=()=>{$('artifact-binding').hidden=$('original-kind').value!=='gitlab-artifact';};
$('original-file').onchange=()=>{if(!$('original-name').value)$('original-name').value=$('original-file').files[0]?.name||'';};
$('original-form').onsubmit=e=>{e.preventDefault();run(async()=>{
  if(S.pending)throw Error('Resolve the original retained request first.');
  const file=$('original-file').files[0];if(!file)throw Error('Choose the complete original file.');
  const id=uid('original'),kind=$('original-kind').value,name=$('original-name').value.trim();
  const query=new URLSearchParams({kind,name});if(kind==='gitlab-artifact'){if(!$('artifact-source').value)throw Error('Select the original retained GitLab source.');query.set('gitlabSourceId',$('artifact-source').value);query.set('jobId',String(integer($('artifact-job').value)));}
  const p={kind:'upload',id,name,sourceKind:kind,bytes:file.size,sha256:await sha(file),fileName:file.name,url:API+'/originals/'+encodeURIComponent(id)+'?'+query.toString(),createdAt:new Date().toISOString()};
  storePending(p);
  try{const result=await api(p.url,file,{raw:true,headers:{'Content-Type':'application/octet-stream'}});checkSourceSelection(result,p);clearPending();await installResult(result,p);}
  catch(error){if([400,401,403,409,422].includes(error.status)&&!error.uncertain)clearPending();throw error;}
});};
$('definition-form').onsubmit=e=>{e.preventDefault();run(async()=>{
  if(!S.editor||!definitionEditable())throw Error('Open a current editable definition or prepare a successor.');
  const editor=S.editor,base={id:editor.id,name:editor.name.trim(),definition:clone(editor.definition)};
  if(!base.name)throw Error('Name this operation.');
  if(editor.mode==='new')await performAction('createOperation',base);
  else if(editor.mode==='successor'){const reviewer=$('reviewer').value.trim();if(!reviewer)throw Error('Name the reviewer preparing this successor.');await performAction('successorOperation',{...base,fromId:editor.fromId,reviewer,note:$('review-note').value});}
  else{const reviewer=$('reviewer').value.trim();if(!reviewer)throw Error('Name the reviewer revising this definition.');await performAction('reviseOperation',{...base,expectedRevision:editor.expectedRevision,reviewer,note:$('review-note').value});}
});};
for(const [id,kind]of [['add-dependency','dependencies'],['add-coverage','coverage'],['add-step','steps'],['add-check','checks']])$(id).onclick=()=>run(()=>{
  if(!definitionEditable())throw Error('Open a current editable definition.');
  const row={id:uid(kind==='dependencies'?'dependency':kind==='coverage'?'coverage':kind==='steps'?'step':'check')};
  if(kind==='coverage')Object.assign(row,{status:'missing',note:''});
  if(kind==='steps')Object.assign(row,{phase:'release',kind:'verify',dependsOn:[],evidenceKind:'operator'});
  if(kind==='checks')Object.assign(row,{phase:'release',component:'joint',required:true});
  rowList(kind).push(row);dirty();renderRows();
});
$('new-operation').onclick=()=>run(()=>newOperation());
$('successor').onclick=()=>run(()=>newOperation(S.op));
$('operation-search').oninput=renderOperations;
$('discard-draft').onclick=()=>run(async()=>{if(!S.op)return;if(S.editor.dirty&&!confirm('Reload the saved definition and discard these local definition edits?'))return;const op=await api(API+'/operations/'+encodeURIComponent(S.op.id));installOperation(op,false);});
$('refresh').onclick=()=>run(async()=>{if(S.editor&&!persistEditor())throw Error('Save the complete local draft before refreshing.');await refreshState();if(S.op){const value=await api(API+'/operations/'+encodeURIComponent(S.op.id));installOperation(value,true);}else if(S.editor)renderEditor();note('Saved workspace refreshed; local definition edits are preserved.');});
$('reviewer').oninput=()=>{S.working.reviewer=$('reviewer').value;persistEditor();};
$('review-note').oninput=()=>{S.working.note=$('review-note').value;persistEditor();};
$('save-decisions').onclick=()=>run(async()=>{
  const decisions=mergedDecisions(),input=reviewInput();
  await performAction('decide',{...input,expectedRevision:S.working.decisionRevision??input.expectedRevision,decisions});
});
$('reload-decisions').onclick=()=>run(async()=>{
  if(!S.op||Object.keys(S.working.decisions||{}).length&&!confirm('Discard these local decision notes and reload the saved decisions?'))return;
  const op=await api(API+'/operations/'+encodeURIComponent(S.op.id));S.working.decisions={};S.working.decisionRevision=null;installOperation(op,true);
});
$('print-plan').onclick=()=>run(()=>{preparePrint();window.print();});
window.addEventListener('beforeprint',preparePrint);
$('freeze').onclick=()=>run(async()=>{if(Object.keys(S.working.decisions||{}).length||S.working.decisionRevision!=null)throw Error('Save these local decisions or explicitly reload saved decisions before freezing the plan.');await performAction('freeze',reviewInput());});
$('begin-recovery').onclick=()=>run(async()=>{const input=reviewInput();if(!confirm('Begin the recovery phase of this frozen plan? Existing release results remain retained.'))return;await performAction('beginRecovery',input);});
$('accept-operation').onclick=()=>run(async()=>{await performAction('acceptOperation',reviewInput());});
$('download-plan').onclick=()=>run(async()=>{if(S.op?.planId)download(await api(API+'/plans/'+encodeURIComponent(S.op.planId)),'release-plan-'+S.op.planId+'.json');});
$('handover').onclick=()=>run(async()=>{if(S.op)download(await api(API+'/operations/'+encodeURIComponent(S.op.id)+'/handover'),'release-handover-'+S.op.id+'.json');});
$('resume-request').onclick=()=>run(recover);
$('pending-download').onclick=()=>{if(S.pending)download(S.pending,'release-original-request-'+S.pending.id+'.json');};
$('draft-download').onclick=()=>download({schema:'stellar-forge.release-operation-local-draft.v1',workspaceId:S.state?.workspaceId,editor:S.editor,working:S.working,pending:S.pending},'release-operation-local-draft.json');
window.addEventListener('beforeunload',event=>{if(S.editor?.dirty||Object.keys(S.working.decisions||{}).length||S.pending||S.storageError){persistEditor();event.preventDefault();event.returnValue='';}});
async function initialize(){
  await refreshState();$('unlock').hidden=true;$('desk').hidden=false;S.pending=readStored(S.prefix+':pending');renderPending();
  const selected=storageGet(S.prefix+':selected');if(selected)try{await openOperation(selected);}catch(error){note(error.message,true);}
  note('Original workspace opened. Select retained sources or continue a saved operation.');
}
const params=new URLSearchParams(location.hash.slice(1)),incoming=params.get('token');applyToken(incoming||storageGet(tokenKey)||'');
if(incoming)history.replaceState(null,'',location.pathname+location.search);
if(S.token)void run(initialize);else{$('unlock').hidden=false;note('Open this private workspace with its operator link.');}
