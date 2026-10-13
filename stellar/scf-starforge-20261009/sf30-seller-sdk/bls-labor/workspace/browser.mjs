import {mountRegionalAnalysis} from './regional-browser.mjs';
// Complete local BLS analyst workflow. Source observations and working requests stay with their workspace.
const $=id=>document.getElementById(id);
const text=(tag,value,className)=>{const item=document.createElement(tag);item.textContent=String(value??'');if(className)item.className=className;return item;};
const id=()=>crypto.randomUUID();
const byteLength=value=>new TextEncoder().encode(value).byteLength;
const pretty=value=>JSON.stringify(value,null,2);
let token='',launch=null,state=null,pending=null,busy=false,working=false,noteRevision=0,noteSubject='';
let observation={edition:'',projection:'laus',filters:{},offset:0,next:null,total:0};
let pages={editions:[],reports:[],operations:[]},stateOffset=0;
const TERMINAL=new Set(['complete','failed','interrupted']);
const mutationButtons=()=>document.querySelectorAll('#source-form button[type=submit],#note-form button[type=submit],#report-form button[type=submit],#comparison-form button[type=submit],#receive-form button[type=submit],#native-form button[type=submit],#regional-form button[type=submit],[data-publisher],#stop-publishers,#export-project,[data-mutation]');
const notice=(message,error=false)=>{$('notice').textContent=message;$('notice').dataset.error=String(error);};
const scope=key=>'stellar-forge:bls:'+launch.workspaceId+':'+key;
function saveLocal(key,value){
  try{localStorage.setItem(scope(key),JSON.stringify(value));}
  catch(issue){throw new Error('The browser could not preserve this working request. Its local storage quota may be smaller than the 8 MiB API limit. Download the request JSON, then run the same request with the workspace CLI. '+issue.message);}
}
function readLocal(key){const raw=localStorage.getItem(scope(key));return raw?JSON.parse(raw):null;}
function removeLocal(key){try{localStorage.removeItem(scope(key));}catch{}}
function updateBusy(){
  mutationButtons().forEach(button=>{button.disabled=busy||Boolean(pending);});
  $('resume-pending').disabled=busy;
  $('pending').hidden=!pending;
  if(pending)$('pending-message').textContent='Operation '+pending.id+' · '+pending.kind+'. Its exact request is retained. Resume it to retrieve or continue the original result.';
}
function remember(request){
  const raw=JSON.stringify(request);
  if(byteLength(raw)>8*1024*1024)throw new Error('The complete encoded request exceeds 8 MiB.');
  pending=request;updateBusy();
  saveLocal('pending',request);
}
function forget(){removeLocal('pending');pending=null;updateBusy();}
async function api(path,{method='GET',body,raw=false,signal}={}){
  const headers={'X-BLS-Session':token};
  if(body!==undefined&&!raw)headers['Content-Type']='application/json';
  let response;
  try{response=await fetch(path,{method,headers,body:body===undefined?undefined:raw?body:JSON.stringify(body),cache:'no-store',credentials:'omit',signal});}
  catch(issue){if(issue.name==='AbortError')throw issue;throw Object.assign(new Error('The workspace response was interrupted. Resume the same operation after reconnecting. '+issue.message),{network:true});}
  const instance=response.headers.get('X-BLS-Instance');
  if(launch&&instance!==launch.instanceId)throw Object.assign(new Error('The original listener changed. Reopen this workspace from its current Applications link or connection file.'),{network:true});
  if(raw&&method==='GET'&&response.ok)return response;
  const payload=await response.json().catch(()=>null);
  if(!response.ok){const issue=new Error(payload?.error??('Workspace returned HTTP '+response.status));issue.status=response.status;throw issue;}
  return payload;
}
function query(path,values){const q=new URLSearchParams();for(const [key,value] of Object.entries(values))if(value!==undefined&&value!==null)q.set(key,typeof value==='object'?JSON.stringify(value):String(value));return path+'?'+q;}
function on(button,action){button.addEventListener('click',()=>run(action));return button;}
function button(label,action,mutation=false){const result=text('button',label);result.type='button';if(mutation)result.dataset.mutation='true';return on(result,action);}
async function run(action){try{await action();}catch(issue){notice(issue.message,true);}finally{updateBusy();}}
function downloadBytes(name,content,type='application/json'){
  const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');
  link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function download(kind,itemId,name){
  const path=query('/api/file',{kind,id:itemId,name});
  // Obtain a save handle in the original click turn, before the first asynchronous request.
  const picker=typeof window.showSaveFilePicker==='function'
    ?window.showSaveFilePicker({suggestedName:name||'bls-workspace.zip'}):null;
  let handle;
  try{handle=picker?await picker:null;}catch(issue){if(issue.name==='AbortError')return;throw issue;}
  const response=await api(path,{raw:true});
  if(handle&&response.body){const destination=await handle.createWritable();try{await response.body.pipeTo(destination);}catch(issue){await destination.abort().catch(()=>{});throw issue;}}
  else{const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name||'bls-workspace.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  notice('Saved the complete '+(name||'editable workspace ZIP')+'.');
}
function jsonInput(element,label){
  let value;try{value=JSON.parse(element.value);}catch{throw new Error(label+' must be valid JSON.');}
  if(!value||Array.isArray(value)||typeof value!=='object')throw new Error(label+' must be a JSON object.');
  return value;
}
async function mutate(kind,input){
  if(pending)throw new Error('Resume the retained operation before saving another change.');
  if(busy)throw new Error('The original operation is still being received.');
  const request={id:id(),kind,input,expected_revision:state.revision};
  remember(request);
  return sendPending();
}
async function sendPending(){
  if(!pending||busy)return;
  // Reading the exact saved request from the server also works after a port or host change.
  const request=pending;saveLocal('pending',request);busy=true;updateBusy();notice('Receiving original operation '+request.id+'…');
  try{
    let result;
    try{result=await api('/api/operation',{method:'POST',body:request});}
    catch(issue){
      if(issue.status===400||issue.status===409){
        try{result=await api(query('/api/operation',{id:request.id}));}
        catch(readIssue){
          if(readIssue.status===400&&readIssue.message==='The operation ID is not in this workspace.'){forget();await refresh();throw issue;}
          throw issue;
        }
      }else throw issue;
    }
    let nativeReadAt=0;
    while(!TERMINAL.has(result.state)){
      if(request.kind==='native-receive'&&Date.now()>=nativeReadAt){
        nativeReadAt=Date.now()+3500;
        try{renderNative(await api(query('/api/native-state',{id:request.id})));}
        catch(issue){$('native-result').replaceChildren(text('p','The last native progress could not be read: '+issue.message),text('p','Operation '+request.id+' remains saved. Its completion is being received.'));}
      }
      notice(request.kind+' is running in the original workspace. Operation '+request.id+'.');
      await new Promise(resolve=>setTimeout(resolve,900));
      result=await api(query('/api/operation',{id:request.id}));
    }
    forget();
    await refresh();
    renderResult(result);
    if(result.state!=='complete')throw new Error(result.error||('The original operation is '+result.state+'. Resume its saved request from Recent operations.'));
    notice('Saved '+request.kind+' · '+request.id+'.');
    return result;
  }finally{busy=false;updateBusy();}
}
async function resumeOperation(operationId){
  if(pending&&pending.id!==operationId)throw new Error('Resume the current retained operation first.');
  if(!pending)remember(await api(query('/api/request',{id:operationId})));
  return sendPending();
}
async function refresh(more=false){
  if(!launch)return;
  const offset=more?stateOffset:0,next=await api(query('/api/state',{offset,limit:100}));
  if(!more){pages={editions:[],reports:[],operations:[]};state=next;}
  else state={...state,revision:next.revision,source_sha256:next.source_sha256,publishers:next.publishers,pages:next.pages};
  for(const key of Object.keys(pages)){
    const known=new Map(pages[key].map(row=>[row.id,row]));
    for(const row of next[key])known.set(row.id,row);
    pages[key]=[...known.values()];
  }
  const nextOffsets=Object.values(next.pages).map(page=>page.next_offset).filter(value=>value!==null);
  stateOffset=nextOffsets.length?Math.min(...nextOffsets):null;
  $('more-state').disabled=stateOffset===null;
  renderState();updateBusy();
}
function selectOptions(element,rows){
  const previous=element.value;element.replaceChildren();
  for(const row of rows){const option=document.createElement('option');option.value=row.id;option.textContent=row.title+' · '+row.id;element.append(option);}
  if(rows.some(row=>row.id===previous))element.value=previous;
}
function renderState(){
  $('workspace-title').textContent=state.name;
  $('workspace-meta').textContent=state.directory+' · revision '+state.revision+' · '+state.workspace_id;
  $('editions-body').replaceChildren();
  for(const row of pages.editions){
    const tr=document.createElement('tr'),title=document.createElement('td');title.append(text('strong',row.title),text('p',row.id,'meta'));
    tr.append(title,text('td',row.source_count+' original files · '+row.created),text('td',row.counts.laus),text('td',row.counts.qcew));
    const actions=document.createElement('td');actions.append(
      button('Read original source',()=>showEdition(row.id)),
      button('Use for observations',async()=>{$('observation-edition').value=row.id;await readObservations(0);$('observations').scrollIntoView();}),
      button('Select for publishing',()=>mutate('select',{edition_id:row.id,expected_source_sha256:state.source_sha256}),true),
      button('Edit edition note',()=>openNote('edition:'+row.id)));
    tr.append(actions);$('editions-body').append(tr);
  }
  for(const key of ['observation-edition','comparison-before','comparison-after'])selectOptions($(key),pages.editions);
  $('reports-body').replaceChildren();
  for(const row of pages.reports){
    const tr=document.createElement('tr'),actions=document.createElement('td');
    for(const name of ['report.json','report.csv','report.html'])actions.append(button(name,()=>download('report',row.id,name)));
    actions.append(button(row.kind==='regional'?'Open regional analysis':'Read saved rows',()=>row.kind==='regional'?regional.show(row.id):showReport(row.id)));
    if(row.kind==='regional')actions.append(button('Revise this analysis',()=>regional.revise(row.id)));
    tr.append(text('td',row.title),text('td',row.projection+' · '+row.row_count+' complete rows · '+row.edition),actions);$('reports-body').append(tr);
  }
  $('operations').replaceChildren();
  for(const op of pages.operations){
    const card=text('details',''),summary=text('summary',op.kind+' · '+op.state+' · '+op.created+' · '+op.id);
    card.append(summary);
    if(op.error)card.append(text('p',op.error));
    if(op.result)card.append(text('pre',pretty(op.result)));
    card.append(button('Download original request',async()=>downloadBytes(op.id+'.json',pretty(await api(query('/api/request',{id:op.id})))+'\n')));
    if(op.state!=='complete')card.append(button('Resume this original operation',()=>resumeOperation(op.id)));
    if(op.state==='complete'&&op.kind==='export'&&op.download_available)card.append(button('Download complete workspace ZIP',()=>download('export',op.id,'bls-workspace.zip')));
    if(op.state==='complete'&&op.kind==='receive')card.append(text('p','Received workspace: '+op.result.workspace));
    $('operations').append(card);
  }
  regional.update();
  renderPublishers();
  $('native-connection').textContent=state.native_connection.configured?'Original host connection: '+state.native_connection.path:'Publication uses the original saved datasets. Customer receiving uses the existing host connection at '+state.native_connection.path+'.';
}
function renderPublishers(){
  const target=$('publisher-links');target.replaceChildren();
  for(const [projection,info] of Object.entries(state.publishers??{})){
    const p=text('p',projection+' · '+(info.running?'running':'stopped')+' ');
    if(info.running){const link=text('a','Open existing publisher');link.href=info.url;link.target='_blank';link.rel='noopener noreferrer';p.append(link);}
    target.append(p);
  }
}
async function showEdition(editionId){
  const item=await api(query('/api/edition',{id:editionId})),target=$('source-detail');target.replaceChildren(text('h3',item.title));
  const details=document.createElement('details');details.append(text('summary','Complete original capture manifest'),text('pre',pretty(item.data.manifest)));target.append(details,button('Download complete capture manifest',()=>download('source',editionId,'_bls/capture-manifest.json')));
  const files=item.data.manifest.files??[];
  const list=document.createElement('ul');
  for(const file of files){const li=document.createElement('li');li.append(text('span',file.path+' · '+file.bytes+' bytes '),button('Download original',()=>download('source',editionId,file.path)));list.append(li);}
  target.append(list);
}
function selection(){
  const edition=$('observation-edition').value,projection=$('observation-projection').value;
  if(!edition)throw new Error('Receive a complete original source edition first.');
  return {edition,projection,filters:jsonInput($('observation-filters'),'Original observation filters')};
}
async function readObservations(offset=0){
  const chosen=selection(),result=await api(query('/api/observations',{...chosen,offset,limit:100}));
  observation={...chosen,offset,next:result.next_offset,total:result.total};
  $('observation-count').textContent='Showing '+(result.rows.length?offset+1:0)+'–'+(offset+result.rows.length)+' of '+result.total+' original '+chosen.projection.toUpperCase()+' observations.';
  $('observations-body').replaceChildren();
  for(const row of result.rows){
    const tr=document.createElement('tr'),source=document.createElement('td');
    const detail=document.createElement('details');detail.append(text('summary','Original record and source'),text('pre',pretty(row)));
    source.append(detail,button('Edit note',()=>openNote('observation:'+chosen.edition+':'+chosen.projection+':'+row.observation_id)));
    if(row.source_url){let original;try{original=new URL(row.source_url);}catch{}if(original?.protocol==='https:'&&['download.bls.gov','data.bls.gov','www.bls.gov'].includes(original.hostname)){const link=text('a','Original BLS file');link.href=original.href;link.target='_blank';link.rel='noopener noreferrer';source.append(link);}}
    const measure=row.measure_name??row.metric,period=row.period??('Q'+row.quarter);
    const status=[row.value_status,row.footnotes,row.coverage_note,row.disclosure_code].filter(Boolean).join(' · ');
    tr.append(text('td',(row.area_name??row.county_name??row.area_fips??row.county_fips)),
      text('td',measure),text('td',row.year+' '+period),text('td',row.value_raw),
      text('td',row.unit),text('td',status),source);$('observations-body').append(tr);
  }
  $('observations-previous').disabled=offset===0;$('observations-next').disabled=result.next_offset===null;
}
function updateFilterHelp(){
  const laus=$('observation-projection').value==='laus';
  $('filter-help').textContent=laus
    ?'Exact keys: county_fips, measure_code, year, period, seasonal, value_status. Each value is an array; years are integers. Example: {"county_fips":["50005"],"year":[2025],"period":["M13"]}.'
    :'Exact keys: area_fips, ownership_code, industry_code, size_code, year, quarter, metric, value_status. Each value is an array; years and quarters are integers. Example: {"area_fips":["50005"],"year":[2026],"quarter":[1]}.';
}
async function openNote(subject){
  const note=await api(query('/api/note',{subject}));noteSubject=subject;noteRevision=note.revision;
  $('note-subject').value=subject;$('note-revision').textContent='Saved note revision '+note.revision;
  let draft;try{draft=readLocal('note:'+subject);}catch{}
  $('note-text').value=draft?.text??note.text;
  $('note-history').replaceChildren();
  for(const version of note.history){const detail=document.createElement('details');detail.append(text('summary','Revision '+version.revision+' · '+version.created),text('pre',version.text));$('note-history').append(detail);}
  $('note-panel').open=true;$('note-panel').scrollIntoView();$('note-text').focus();
  if(draft&&draft.baseRevision!==note.revision)notice('This browser has a draft from revision '+draft.baseRevision+'. The saved note is now revision '+note.revision+'; compare the retained history before saving.');
}
async function showReport(reportId){
  const data=await api(query('/api/report',{id:reportId,offset:0,limit:100}));
  let target=$('saved-report-detail');
  if(!target){target=document.createElement('details');target.id='saved-report-detail';$('reports').append(target);}
  target.replaceChildren(text('summary',data.metadata.title+' · '+data.total+' complete rows'),text('pre',pretty(data.metadata)));
  target.append(text('p','This screen reads '+data.rows.length+' rows. The JSON, CSV and HTML downloads contain every saved row.'));
  const rows=text('pre',pretty(data.rows));target.append(rows);
  if(data.next_offset!==null){
    let offset=data.next_offset;
    const more=button('Read next saved rows',async()=>{const next=await api(query('/api/report',{id:reportId,offset,limit:100}));rows.textContent=pretty(next.rows);offset=next.next_offset;more.disabled=offset===null;});
    target.append(more);
  }
  target.open=true;target.scrollIntoView();
}
function renderNative(value,complete=false){
  const target=$('native-result');
  const phases={source:'Opening the original source',laus:'Publishing resident labor',qcew:'Publishing workplace employment and wages',
    source_files:'Publishing complete source files',customer:'Receiving the original customer delivery',closing:'Closing owned dataset services',
    starting:'Starting the saved operation',complete:'Publication and receiving complete'};
  const title=complete?'Original publication and receiving result':(phases[value.phase]||String(value.phase||'Working'));
  const heading=text('h3',title),summary=text('p','Operation '+value.operation_id+(value.updated_at?' · '+value.updated_at:''));
  const table=document.createElement('table'),caption=text('caption','Selected original projections'),head=document.createElement('thead'),columns=document.createElement('tr');
  for(const label of ['Projection','Native state','Rows','Original plan and run']){const cell=text('th',label);cell.scope='col';columns.append(cell);}
  head.append(columns);const body=document.createElement('tbody');
  const items=Array.isArray(value.projections)?value.projections:Object.values(value.projections||{});
  for(const item of items){
    const row=document.createElement('tr'),name={laus:'LAUS resident labor',qcew:'QCEW workplace measures',source_files:'Complete original files'}[item.projection]||item.projection;
    row.append(text('td',name),text('td',item.native_state||(item.complete?'Complete':'Working')),
      text('td',Number.isSafeInteger(item.row_count)?item.row_count.toLocaleString():'—'),
      text('td',[item.plan_id===undefined?'':'Plan '+item.plan_id,item.run_id||''].filter(Boolean).join(' · ')));
    body.append(row);
  }
  table.append(caption,head,body);const wrap=document.createElement('div');wrap.className='table-wrap';wrap.append(table);
  const children=[heading,summary];
  if(value.source_sha256)children.push(text('p','Original source SHA-256 '+value.source_sha256,'meta'));
  if(value.capture_id)children.push(text('p','Capture SHA-256 '+value.capture_id,'meta'));
  if(items.length)children.push(wrap);
  if(value.customer){
    const received=value.customer.received||value.customer.result?.received;
    children.push(text('p',received?'Customer received '+received.source_files+' original files from '+received.acquired_rows+' delivered rows.':
      'Customer receiving: '+String(value.customer.state||'complete')+'.'));
  }
  if(value.error)children.push(text('p',typeof value.error==='string'?value.error:pretty(value.error)));
  if(complete){
    const detail=document.createElement('details');detail.append(text('summary','Complete publication and receiving record'),text('pre',pretty(value)));
    children.push(button('Download complete native result',()=>downloadBytes(value.operation_id+'-native-result.json',pretty(value)+'\n')),detail);
  }
  target.replaceChildren(...children);
}

function renderResult(operation){
  if(operation.state!=='complete')return;
  const value=operation.result;
  if(operation.kind==='export'){
    $('export-results').replaceChildren(text('p',value.file),text('pre',pretty(value.archive)),
      button('Download complete editable ZIP',()=>download('export',operation.id,'bls-workspace.zip')));
  }
  if(operation.kind==='receive'){
    $('receiving-result').replaceChildren(text('h3','Received editable workspace'),text('p',value.workspace),
      text('p','Workspace '+value.workspace_id+'. Select this directory in Applications to review and open the received project.'),
      text('pre',pretty(value.state.pages)));
  }
  if(operation.kind==='native-receive')renderNative(value,true);
  if(operation.kind==='regional')run(()=>regional.show(operation.id));
  if(operation.kind==='note'&&value.subject===noteSubject)run(async()=>{removeLocal('note:'+noteSubject);await openNote(noteSubject);});
}
async function upload(which){
  const file=$(which+'-file').files[0],target=$(which==='source'?'source-upload':'receive-upload');
  if(!file)throw new Error('Select the complete ZIP to upload.');
  if(file.size<=0||file.size>8*1024**3)throw new Error('Select a complete ZIP between 1 byte and 8 GiB.');
  const key='upload:'+which;
  let retained=readLocal(key);
  if(retained&&(retained.name!==file.name||retained.bytes!==file.size||retained.modified!==file.lastModified))
    throw new Error('There is an unfinished original upload for '+retained.name+'. Select that original file to resume it.');
  if(!retained){retained={id:id(),name:file.name,bytes:file.size,modified:file.lastModified};saveLocal(key,retained);}
  $(which==='source'?'upload-source':'upload-receive').disabled=true;
  try{
    let result;
    try{result=await api(query('/api/upload',{id:retained.id}));}
    catch(issue){
      if(!issue.status||issue.status>=500)throw issue;
      target.textContent='Uploading the complete '+file.size.toLocaleString()+' bytes. Keep this page open; the original upload ID is '+retained.id+'.';
      result=await api(query('/api/upload',{id:retained.id,name:file.name}),{method:'PUT',body:file,raw:true});
    }
    if(result.id!==retained.id||result.bytes!==file.size)throw new Error('The retained upload differs from the selected original file.');
    $(which+'-archive').value=result.path;
    if(which==='receive')$('receive-sha').value=result.sha256;
    else if($('source-sha').value&&$('source-sha').value!==result.sha256)
      notice('The uploaded ZIP SHA-256 differs from the supplied original SHA-256. Check the selected source before importing.',true);
    else $('source-sha').value=result.sha256;
    target.textContent='Complete upload: '+result.path+' · '+result.bytes+' bytes · SHA-256 '+result.sha256;
    removeLocal(key);
  }finally{$(which==='source'?'upload-source':'upload-receive').disabled=false;}
}
function form(id,action){$(id).addEventListener('submit',event=>{event.preventDefault();run(()=>action(new FormData(event.currentTarget)));});}
on($('refresh'),()=>refresh());
on($('more-state'),()=>refresh(true));
on($('resume-pending'),()=>sendPending());
on($('download-request'),()=>{if(pending)downloadBytes(pending.id+'.json',pretty(pending)+'\n');});
on($('upload-source'),()=>upload('source'));on($('upload-receive'),()=>upload('receive'));
$('source-mode').addEventListener('change',()=>{$('import-fields').hidden=$('source-mode').value!=='import';$('capture-fields').hidden=$('source-mode').value!=='capture';});
form('source-form',data=>{
  const input={edition_id:data.get('edition_id'),title:data.get('title'),selection:jsonInput($('source-selection'),'Original source selection'),
    activate:data.get('activate')==='on',expected_source_sha256:state.source_sha256};
  if(data.get('mode')==='import')Object.assign(input,{archive:data.get('archive'),archive_sha256:data.get('archive_sha256')});
  else input.laus_urls=String(data.get('laus_urls')).split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
  return mutate(data.get('mode'),input);
});
form('observation-form',()=>readObservations(0));
$('observation-projection').addEventListener('change',updateFilterHelp);
on($('observations-previous'),()=>readObservations(Math.max(0,observation.offset-100)));
on($('observations-next'),()=>readObservations(observation.next??0));
$('note-text').addEventListener('input',()=>{if(noteSubject)run(async()=>saveLocal('note:'+noteSubject,{text:$('note-text').value,baseRevision:noteRevision}));});
form('note-form',()=>mutate('note',{subject:noteSubject,text:$('note-text').value,expected_note_revision:noteRevision}));
form('report-form',data=>{const chosen=selection();return mutate('report',{edition_id:chosen.edition,projection:chosen.projection,filters:chosen.filters,
  title:data.get('title'),narrative:data.get('narrative'),calculation:data.get('calculation')});});
form('comparison-form',data=>mutate('compare',{before:data.get('before'),after:data.get('after'),projection:data.get('projection'),title:data.get('title')}));
form('native-form',data=>{
  const projections=data.getAll('projections');if(!projections.length)throw new Error('Choose at least one complete original projection.');
  const input={source_sha256:state.source_sha256,projections,reviewer:data.get('reviewer'),note:data.get('note')};
  const existing=jsonInput($('native-existing'),'Original publisher plan and run IDs');
  if(Object.keys(existing).length)input.existing=existing;
  if(data.get('receive'))input.receive=data.get('receive');
  const releases=data.getAll('releases');if(releases.length)input.releases=releases;
  return mutate('native-receive',input);
});
for(const item of document.querySelectorAll('[data-publisher]'))on(item,()=>mutate('publisher-open',{projection:item.dataset.publisher}));
on($('stop-publishers'),()=>mutate('publisher-stop',{}));
on($('export-project'),()=>mutate('export',{}));
form('receive-form',data=>mutate('receive',{archive:data.get('archive'),sha256:data.get('sha256'),destination:data.get('destination')}));
async function open(){
  const fragment=location.hash.slice(1);
  if(/^[a-f0-9]{32}$/.test(fragment)){token=fragment;sessionStorage.setItem('bls-local-session',token);history.replaceState(null,'',location.pathname);}
  else token=sessionStorage.getItem('bls-local-session')??'';
  if(!token)throw new Error('Open this workspace using its current Applications entry or the URL in bls.connection.json.');
  launch=await api('/api/launch');
  if(launch.schema!=='stellar-forge.bls-workspace-launch.v1'||!launch.workspaceId||!launch.instanceId)throw new Error('The selected listener is not the original BLS workspace.');
  try{pending=readLocal('pending');}catch(issue){throw new Error('The retained working request could not be read: '+issue.message);}
  await refresh();
  $('source-selection').value=pretty(await api('/api/default-selection'));
  updateFilterHelp();
  if(pending){updateBusy();notice('The original '+pending.kind+' request is retained. Resume it to recover its current result.');}
  else notice('Opened the complete original BLS workspace.');
  if(pages.editions.length)await readObservations(0);
}
const regional=mountRegionalAnalysis({api,query,mutate,download,run,notice,saveLocal,readLocal,
  getPages:()=>pages});
run(open);
