// MIT. Original-workspace browser, retained job continuation and explicit candidate decisions.
import {createPublisherPanel} from './publisher.mjs';
const $=id=>document.getElementById(id),json=v=>JSON.stringify(v,null,2);
const node=(tag,value)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=typeof value==='object'?json(value):String(value??'—');return e;};
const detail=(title,value)=>{const e=node('details');e.append(node('summary',title),node('pre',value));return e;};
const button=(label,key,value)=>{const e=node('button',label);e.type='button';e.dataset[key]=value;return e;};
const facts=items=>{const e=node('dl');for(const[k,v]of items)e.append(node('dt',k),node('dd',v));return e;};
let state=null,busy=false,publisher=null,selected=null,reviewPage=null,reviewOffset=0,reviewCriteria={status:'',search:''},sourceOffset=0,sourcePage=null,queryResult=null,querySnapshot=null,initialized=false;
let noticeRevision=0;
let draft={schema:'stellar-forge.geoapify-editor.v1',fields:{},decisions:{},tab:'source'};
const tokenKey='starforge-geoapify-token:'+location.origin,fragment=new URLSearchParams(location.hash.slice(1));
const token=fragment.get('token')||sessionStorage.getItem(tokenKey);
if(token){sessionStorage.setItem(tokenKey,token);if(location.hash){const url=new URL(location);url.hash='';history.replaceState(null,'',url);}}
function notice(message,error=false){noticeRevision++;$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function draftKey(){return state?'geoapify-editor:'+state.id:null;}
function decisionKey(){return selected?selected.id+':'+(selected.responseSha256??'source'):null;}
function selectedDecisionDraft(){
  const key=decisionKey();if(!key)return;
  draft.decisions[key]={candidateId:document.querySelector('input[name=candidate]:checked')?.value??null,
    coordinateChoice:$('coordinate-choice').value,reviewer:$('reviewer').value,note:$('decision-note').value};
}
function capture(){
  selectedDecisionDraft();
  for(const e of document.querySelectorAll('input[id],select[id],textarea[id]')){
    if(e.type==='file'||e.id.startsWith('pub-')||['job-selection','coordinate-choice','reviewer','decision-note'].includes(e.id))continue;
    draft.fields[e.id]=e.type==='checkbox'?e.checked:e.value;
  }
  if(state){const job=selectedJob();draft.selection={jobId:job?.id??null,requestSha256:job?.request.sha256??null,
    queryId:selected?.id??draft.selection?.queryId??null,responseSha256:selected?.responseSha256??draft.selection?.responseSha256??null};
    draft.workspaceId=state.id;draft.savedAt=new Date().toISOString();}
  return structuredClone(draft);
}
function saveLocal(){if(!initialized||!state)return;try{localStorage.setItem(draftKey(),json(capture()));}catch{notice('The current browser cannot save working forms locally. Use Save working forms before closing.',true);}}
function applyDraft(value){
  if(!value||value.schema!=='stellar-forge.geoapify-editor.v1'||value.workspaceId!==state.id||typeof value.fields!=='object')return false;
  draft=structuredClone(value);draft.decisions??={};
  for(const[id,value]of Object.entries(draft.fields)){const e=$(id);if(!e||e.type==='file'||e.id.startsWith('pub-'))continue;
    if(e.type==='checkbox')e.checked=value===true;else if(typeof value==='string')e.value=value;}
  switchTab(draft.tab??'source');return true;
}
document.addEventListener('input',event=>{if(event.target.matches('input,textarea,select'))saveLocal();});
document.addEventListener('change',event=>{if(event.target.matches('input,textarea,select'))saveLocal();});
window.addEventListener('beforeunload',event=>{
  if(busy||[...document.querySelectorAll('input[type=file]')].some(e=>e.files?.length)){event.preventDefault();event.returnValue='';}
});
async function request(path,options={}){
  if(!token)throw new Error('Open the original private URL printed by this workspace.');
  const response=await fetch(path,{...options,headers:{authorization:'Bearer '+token,...options.headers}});
  if(!response.ok){let value;try{value=await response.json();}catch{}throw Object.assign(new Error(value?.message??'HTTP '+response.status),{code:value?.code,status:response.status});}
  return response;
}
async function perform(action,payload={}){
  const result=await(await request('/api/action',{method:'POST',headers:{'content-type':'application/json'},
    body:json({action,payload:action.startsWith('publisher.')?payload:{...payload,expectedRevision:state.revision}})})).json();
  state=result.state;render();return result.result;
}
async function refresh(){
  const next=await(await request('/api/state')).json();
  if(state&&next.id!==state.id){selected=null;reviewPage=null;queryResult=null;querySnapshot=null;initialized=false;draft={schema:'stellar-forge.geoapify-editor.v1',fields:{},decisions:{},tab:'source'};}
  state=next;render();
  if(!initialized){
    let local;try{local=JSON.parse(localStorage.getItem(draftKey())??'null');}catch{}
    applyDraft(local?.workspaceId===state.id?local:state.editor);await restoreSelection();initialized=true;
  }
  controls();
}
async function handle(work){
  if(busy)return;saveLocal();busy=true;document.querySelector('main').inert=true;controls();notice('Working with the original workspace…');const startingNotice=noticeRevision;
  try{await work();if(noticeRevision===startingNotice)notice('Original operation saved.');}
  catch(error){notice(error.message,true);try{await refresh();}catch{}}
  finally{busy=false;document.querySelector('main').inert=false;controls();saveLocal();}
}
function bind(id,work){$(id).addEventListener('submit',event=>{event.preventDefault();void handle(work);});}
function switchTab(name){
  const names=['source','jobs','review','dataset','delivery','publisher'];if(!names.includes(name))name='source';
  document.querySelectorAll('[data-section]').forEach(e=>e.hidden=e.dataset.section!==name);
  document.querySelectorAll('[data-tab]').forEach(e=>{if(e.dataset.tab===name)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});
  draft.tab=name;
}
document.querySelectorAll('[data-tab]').forEach(e=>e.addEventListener('click',()=>{if(!busy){switchTab(e.dataset.tab);saveLocal();}}));
const selectedJob=()=>state?.jobs.find(j=>j.id===$('job-selection').value);
function controls(){
  document.querySelectorAll('button').forEach(e=>{e.disabled=busy;});
  if(!state)return;
  $('source-form').querySelector('button').disabled=busy||Boolean(state.intake);
  $('restore-form').querySelector('button').disabled=busy||Boolean(state.intake);
  $('prepare-form').querySelector('button').disabled=busy||!state.intake;
  for(const id of ['inspect-source','review-prev','review-next','source-prev','source-next','inspect-source'])$(id).disabled=busy||!state.intake;
  $('source-prev').disabled=busy||sourceOffset===0;$('source-next').disabled=busy||!sourcePage||sourceOffset+25>=sourcePage.summary.rows;
  $('review-prev').disabled=busy||reviewOffset===0;$('review-next').disabled=busy||!reviewPage||reviewOffset+25>=reviewPage.total;
  const j=selectedJob(),providerWaiting=Boolean(state.api.notBefore&&Date.now()<Date.parse(state.api.notBefore));
  for(const id of ['show-request','download-request','download-provider-body'])$(id).disabled=busy||!j;
  $('send-job').disabled=busy||providerWaiting||!state.api.configured||j?.status!=='PREPARED';
  $('poll-job').disabled=busy||providerWaiting||!state.api.configured||!j?.jobId||['COMPLETE','PARTIAL','ABANDONED','REJECTED','EXPIRED'].includes(j.status)||
    Boolean(j.nextPollAt&&Date.now()<Date.parse(j.nextPollAt));
  $('response-form').querySelector('button').disabled=busy||!j||j.status==='ABANDONED';
  $('abandon-form').querySelector('button').disabled=busy||!j||['COMPLETE','PARTIAL','ABANDONED','REJECTED'].includes(j.status);
  $('edition-form').querySelector('button').disabled=busy||!state.intake;
  $('query-form').querySelector('button').disabled=busy||!state.activeEditionId;
  $('query-next').disabled=busy||!queryResult?.body?.page?.nextCursor||querySnapshot!==state.editions.find(e=>e.id===state.activeEditionId)?.snapshot;
  $('merchant-form').querySelector('button').disabled=busy||!state.activeEditionId;
  publisher?.controls(busy);
}
function renderJob(){
  const j=selectedJob(),area=$('job-summary');area.replaceChildren();$('request-body').hidden=true;
  if(j)area.append(facts([['Status',j.status],['Original request',j.id],['Prepared envelope SHA-256',j.request.sha256],['Provider POST body SHA-256',j.providerBodySha256],
    ['Queries',j.queryCount],['Provider job ID',j.jobId],['Next poll',j.nextPollAt],['Original returns',j.events.length]]),
    detail('Complete retained job and returned source identities',j));
  controls();
}
function render(){
  if(!state)return;
  $('workspace-summary').replaceChildren(facts([['Workspace',state.directory],['Original identity',state.id],
    ['Revision',state.revision],['Source records',state.summary?.rows??0],['Distinct queries',state.summary?.queries??0],
    ['Explicitly reviewed queries',state.summary?.reviewedQueries??0],['Provider key configured',state.api.configured?'Yes':'No'],['Retained provider retry floor',state.api.notBefore]]));
  const control=$('job-selection'),previous=control.value;control.replaceChildren();
  for(const j of [...state.jobs].reverse()){const o=node('option',j.status+' · '+j.queryCount+' queries · '+j.id);o.value=j.id;control.append(o);}
  if(state.jobs.some(j=>j.id===previous))control.value=previous;
  renderJob();
  $('editions').replaceChildren();
  for(const e of [...state.editions].reverse()){
    const card=node('article');card.className='card';card.append(node('h3',e.name),
      facts([['Edition',e.id],['Rows',e.rowCount],['Source scope',e.scope],['Native snapshot',e.snapshot]]));
    if(e.id===state.activeEditionId)card.append(node('strong','Selected edition'));else card.append(button('Select original edition','edition',e.id));
    $('editions').append(card);
  }
  $('exports').replaceChildren();
  for(const e of [...state.exports].reverse()){
    const card=node('article');card.className='card';card.append(node('h3',e.createdAt+' · '+(e.editionId?'Frozen edition + workspace':'Complete working workspace')),node('p',e.directory));
    const essential=e.files.filter(f=>!f.name.startsWith('raw/'));
    for(const f of essential){const b=button(f.name+' · '+f.bytes+' bytes','download',e.id);b.dataset.file=f.name;card.append(b);}
    const all=detail('Complete retained file manifest',e.files);card.append(all);$('exports').append(card);
  }
  if(querySnapshot&&querySnapshot!==state.editions.find(e=>e.id===state.activeEditionId)?.snapshot){queryResult=null;querySnapshot=null;$('query-result').textContent='Select a native query for this edition.';}
  publisher?.render(state);controls();
}
async function fileInput(id,pathId){
  const file=$(id).files?.[0],path=$(pathId).value.trim();
  if(file&&path)throw new Error('Choose a file from this computer OR a path on the operator host.');
  if(file){if(file.size>16*1024*1024)throw new Error('Use the original host file path for sources larger than16MiB.');
    return {text:new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer())};}
  if(!path)throw new Error('Choose the complete original file.');
  return {path};
}
async function sourceRows(offset=sourceOffset){
  const next=await perform('source.inspect',{offset,limit:25});sourceOffset=offset;sourcePage=next;$('source-results').replaceChildren(
    node('p','Original records '+(sourceOffset+1)+'–'+Math.min(sourceOffset+25,sourcePage.summary.rows)+' of '+sourcePage.summary.rows),
    detail('Original field mapping and source identity',{source:sourcePage.source,mapping:sourcePage.mapping}),
    detail('Original rows',sourcePage.rows),detail('Repeated business identities',sourcePage.duplicateIdentities));controls();
}
bind('source-form',async()=>{
  const original=await fileInput('source-file','source-path');
  await perform('intake.import',{...original,format:$('source-format').value,name:$('source-name').value,
    sourceURL:$('source-url').value||null,provenance:$('source-provenance').value,mapping:JSON.parse($('source-mapping').value)});
  $('source-file').value='';await sourceRows();switchTab('jobs');
});
$('inspect-source').onclick=()=>void handle(sourceRows);
$('source-prev').onclick=()=>void handle(()=>sourceRows(Math.max(0,sourceOffset-25)));
$('source-next').onclick=()=>void handle(()=>sourceRows(sourceOffset+25));
bind('prepare-form',async()=>{
  const ids=$('batch-ids').value.trim(),options={limit:Number($('candidate-limit').value),priority:Number($('priority').value),
    endpoint:$('endpoint').value,bias:$('bias').value};
  for(const[id,key]of [['language','lang'],['filter','filter'],['geocode-type','type']])if($(id).value)options[key]=$(id).value;
  const r=await perform('provider.prepare',{maximumInputs:Number($('batch-limit').value),...(ids?{queryIds:JSON.parse(ids)}:{}),refresh:$('batch-refresh').checked,options});
  $('job-selection').value=r.job.id;renderJob();$('prepared-summary').replaceChildren(
    node('p',r.selected+' queries prepared; '+r.remainingEligible+' eligible queries remain, out of '+r.totalQueries+' total distinct source queries.'),
    detail('Review the exact provider body, options and chosen endpoint',r.request));
});
$('job-selection').onchange=()=>{renderJob();};
async function requestBody(){const j=selectedJob();if(!j)throw new Error('Choose an original job.');return perform('provider.request',{id:j.id});}
$('show-request').onclick=()=>void handle(async()=>{const r=await requestBody();$('request-body').hidden=false;$('request-body').textContent=json(r);});
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('download-request').onclick=()=>void handle(async()=>{const r=await requestBody();saveBlob(new Blob([json(r.request)+'\n'],{type:'application/json'}),r.job.id+'-prepared-request.json');});
$('download-provider-body').onclick=()=>void handle(async()=>{const r=await requestBody();saveBlob(new Blob([json(r.request.body)+'\n'],{type:'application/json'}),r.job.id+'-provider-body.json');});
for(const[id,action]of [['send-job','provider.run'],['poll-job','provider.poll']])$(id).onclick=()=>void handle(async()=>{
  const j=selectedJob();if(!j)throw new Error('Choose an original job.');
  await perform(action,{id:j.id,expectedRequestSha256:j.request.sha256});
});
bind('response-form',async()=>{const j=selectedJob();if(!j)throw new Error('Choose the original job before importing.');
  const original=await fileInput('response-file','response-path');
  await perform('provider.import',{...original,id:j.id,expectedRequestSha256:j.request.sha256,status:Number($('response-status').value),retryAfter:$('response-retry').value||null});
  $('response-file').value='';});
bind('abandon-form',()=>perform('provider.abandon',{id:selectedJob()?.id,reviewer:$('abandon-reviewer').value,reason:$('abandon-reason').value}));
async function listReview({offset=reviewOffset,criteria=reviewCriteria}={}){
  const next=await perform('review.list',{offset,limit:25,...criteria});reviewOffset=offset;reviewCriteria={...criteria};reviewPage=next;
  $('review-count').textContent=reviewPage.total+' matching original queries; showing '+(reviewPage.rows.length?reviewOffset+1:0)+'–'+(reviewOffset+reviewPage.rows.length)+' · Loaded state: '+(reviewCriteria.status||'all')+' · Loaded search: '+(reviewCriteria.search||'none');
  $('review-rows').replaceChildren();
  for(const r of reviewPage.rows){
    const card=node('article');card.className='card';card.append(node('strong',Object.values(r.params).join(', ')),
      node('p',r.state+' · '+r.sourceOrdinals.length+' original records · '+r.candidates.length+' candidates'),button('Review original query','query',r.id));
    $('review-rows').append(card);
  }
  controls();
}
bind('review-filter',()=>listReview({offset:0,criteria:{status:$('review-status').value,search:$('review-search').value}}));
$('review-prev').onclick=()=>void handle(()=>listReview({offset:Math.max(0,reviewOffset-25)}));
$('review-next').onclick=()=>void handle(()=>listReview({offset:reviewOffset+25}));
async function openQuery(id,{captureCurrent=true,expectedResponseSha256}={}){
  if(captureCurrent)selectedDecisionDraft();
  const result=await perform('review.query',{queryId:id});selected=result;
  $('address-detail').hidden=false;$('address-title').textContent=Object.values(result.params).join(', ');
  $('address-original').replaceChildren(facts([['Original query',result.id],['State',result.state],['Current response SHA-256',result.responseSha256]]),
    detail('Every original source record',result.originalRows),detail('Retained decision',result.decision),detail('Original provider error',result.error));
  $('candidates').replaceChildren();
  const saved=draft.decisions[decisionKey()]??(result.decisionCurrent?result.decision:null);
  for(const c of result.candidates){
    const card=node('article');card.className='candidate';const label=node('label'),radio=node('input');radio.type='radio';radio.name='candidate';radio.value=c.id;
    radio.checked=saved?.candidateId===c.id;label.append(radio,node('span','Candidate '+(c.index+1)+' · '+(c.formatted??'Unformatted result')));
    card.append(label,facts([['Confidence',c.confidence],['Result type',c.resultType],['Match level',c.matchType],['Geometry',c.location],
      ['Datasource',c.datasource],['Warnings',c.warnings]]),detail('Original coordinates and displacement',c.sourceCoordinates),detail('Complete provider Feature',c.raw));$('candidates').append(card);
  }
  $('coordinate-choice').value=saved?.coordinateChoice??'preserve-source';$('reviewer').value=saved?.reviewer??draft.fields['abandon-reviewer']??'';
  $('decision-note').value=saved?.note??'';
  if(expectedResponseSha256!==undefined&&expectedResponseSha256!==result.responseSha256)
    $('address-original').append(node('p','The current provider response differs from the saved working selection. The current response is displayed; prior decision drafts remain tied to their original response.'));
  saveLocal();controls();
}
$('review-rows').onclick=event=>{const e=event.target.closest('[data-query]');if(e)void handle(()=>openQuery(e.dataset.query));};
async function decide(action){
  if(!selected)throw new Error('Open an original query first.');
  const id=selected.id;
  await perform('review.decide',{queryId:id,action,candidateId:document.querySelector('input[name=candidate]:checked')?.value,
    expectedResponseSha256:selected.responseSha256,coordinateChoice:$('coordinate-choice').value,reviewer:$('reviewer').value,note:$('decision-note').value});
  delete draft.decisions[decisionKey()];selected=null;await openQuery(id);await listReview();
}
bind('decision-form',()=>decide('accept'));$('keep-source').onclick=()=>void handle(()=>decide('keep-source'));
bind('edition-form',()=>perform('edition.build',{name:$('dataset-name').value,scope:$('dataset-scope').value,sourceColumns:JSON.parse($('dataset-columns').value)}));
$('editions').onclick=event=>{const e=event.target.closest('[data-edition]');if(e)void handle(()=>perform('edition.activate',{editionId:e.dataset.edition}));};
function queryInput(){const params=new URLSearchParams($('query').value),out={};for(const[k,v]of params){if(Object.hasOwn(out,k))throw new Error('Repeated native query parameter: '+k);out[k]=v;}return out;}
async function query(input){queryResult=await perform('dataset.query',{query:input});querySnapshot=state.editions.find(e=>e.id===state.activeEditionId)?.snapshot;$('query-result').textContent=json({snapshot:querySnapshot,...queryResult});controls();}
bind('query-form',()=>query(queryInput()));
$('query-next').onclick=()=>void handle(()=>query({...state.lastQuery.query,cursor:queryResult.body.page.nextCursor}));
bind('merchant-form',()=>perform('merchant.configure',{merchant:{origin:$('merchant-origin').value,path:$('merchant-path').value,payment:JSON.parse($('merchant-payment').value)}}));

async function restoreSelection(){
  const selection=draft.selection??{};
  const job=state.jobs.find(j=>j.id===selection.jobId&&j.request.sha256===selection.requestSha256);
  if(job){$('job-selection').value=job.id;renderJob();}
  const id=selection.queryId;selected=null;$('address-detail').hidden=true;
  if(typeof id==='string'&&/^q_[a-f0-9]{64}$/.test(id)){
    try{await openQuery(id,{captureCurrent:false,expectedResponseSha256:selection.responseSha256});}
    catch(error){$('address-detail').hidden=true;notice('Working forms restored; reopen the original query when available. '+error.message,true);}
  }
}

async function saveEditor(){return perform('editor.save',{editor:capture()});}
$('save-editor').onclick=()=>void handle(saveEditor);
$('restore-editor').onclick=()=>void handle(async()=>{if(!state.editor)throw new Error('Save working forms in this workspace first.');const saved=structuredClone(state.editor);selected=null;applyDraft(saved);await restoreSelection();});
$('export').onclick=()=>void handle(async()=>{
  if([...document.querySelectorAll('input[type=file]')].some(e=>e.files?.length))throw new Error('Import or explicitly clear selected files before exporting: their bytes are not yet retained.');
  await saveEditor();await perform('package.export');
});
bind('restore-form',async()=>{
  await perform('package.import',{path:$('restore-path').value});selected=null;reviewPage=null;queryResult=null;querySnapshot=null;initialized=false;
  await refresh();if(state.editor){selected=null;applyDraft(state.editor);await restoreSelection();}
});
async function download(id,name){
  const r=await request('/api/exports/'+encodeURIComponent(id)+'/'+encodeURIComponent(name));
  saveBlob(await r.blob(),name.split('/').at(-1));
}
$('exports').onclick=event=>{const e=event.target.closest('[data-download]');if(e)void handle(()=>download(e.dataset.download,e.dataset.file));};
async function publisherDownload(kind,id){
  const r=await request('/api/publisher/exports/'+encodeURIComponent(kind)+'/'+encodeURIComponent(id)),d=r.headers.get('content-disposition')??'';
  const match=/filename\*=UTF-8''([^;]+)/i.exec(d);saveBlob(await r.blob(),match?decodeURIComponent(match[1]):kind+'-'+id);
}
publisher=createPublisherPanel({getState:()=>state,perform,download:publisherDownload,handle,notice,selectSection:name=>switchTab(name==='exports'?'delivery':name)});
$('refresh').onclick=()=>void handle(refresh);
setInterval(()=>{if(!busy)controls();},1000);
controls();void handle(refresh);
