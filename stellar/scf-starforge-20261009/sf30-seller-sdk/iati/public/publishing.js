/* MIT. Complete participant feedback, source correction, review and release in the original IATI console. */
'use strict';
window.IatiPublishingUi=function(api){
 const $=id=>document.getElementById(id),base='/api/iati/publishing/',short=id=>String(id||'').slice(0,12);
 const {get,post,request,action,status,download,metrics,table,properties,details}=api;
 let projects=[],project=null,history=[],method=null,context=null,pending=null,activityPage=null,fields=null,patches=[],preview=null,currentTab='overview';
 let latestRevision=0,db;
 const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 const query=v=>new URLSearchParams(Object.entries(v).filter(([,value])=>value!==undefined).map(([key,value])=>[key,String(value)])).toString();
 const who=()=>{const value=$('pub-actor').value.trim();if(!value)throw new Error('Enter the named operator before saving this work.');return value;};
 function choose(id,items,selected){
  const el=$(id),old=selected??el.value;el.replaceChildren();
  el.add(new Option(items.length?'Choose a retained record':'No retained records',''));
  for(const item of items)el.add(new Option(item.label,item.id));
  el.value=items.some(x=>x.id===old)?old:items[0]?.id??'';
 }
 async function database(){
  if(db)return db;
  db=await new Promise((resolve,reject)=>{const r=indexedDB.open('sf30-iati-participant-actions',1);
   r.onupgradeneeded=()=>r.result.createObjectStore('actions',{keyPath:'key'});
   r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('The saved action could not be retained.'));});
  return db;
 }
 async function retained(mode,value){
  if(!context)throw new Error('Open the original participant workspace first.');
  const selected=await database(),key=context.workspaceSha256+(mode==='archive'?':rejected:'+value.input.requestId:'');
  return await new Promise((resolve,reject)=>{
   const tx=selected.transaction('actions',mode==='read'?'readonly':'readwrite'),store=tx.objectStore('actions');
   const op=mode==='read'?store.get(key):mode==='delete'?store.delete(key):store.put({key,...value});let result;
   op.onsuccess=()=>{result=op.result;};tx.oncomplete=()=>resolve(result);
   tx.onerror=tx.onabort=()=>reject(tx.error||new Error('The complete saved action could not be retained.'));
  });
 }
 function pendingView(){
  $('pub-pending').hidden=!pending;
  $('pub-revise').hidden=!pending?.rejected;
  $('pub-pending-description').textContent=pending?'The original '+pending.route+' action is retained with request '+pending.input.requestId+'. Continue this exact action after an interrupted reply.':'';
 }
 function editable(){return project&&project.revision===latestRevision;}
 function buttons(){
  const busy=api.isBusy?.()??false;
  for(const el of document.querySelectorAll('[data-pub-edit]'))el.disabled=busy||!editable()||!!pending;
  $('pub-apply').disabled=busy||!editable()||!!pending||!preview;
  $('pub-preview').disabled=busy||!editable()||!!pending||!patches.length;
  $('pub-finance').disabled=busy||!editable()||!!pending;
  $('pub-open').disabled=busy||!$('pub-project-select').value;
  for(const id of ['pub-open-finance','pub-download-finance'])$(id).disabled=busy||!project?.finance;
  for(const id of ['pub-download-candidate','pub-download-baseline'])$(id).disabled=busy||!project;
  $('pub-download-release').disabled=busy||!project||!$('pub-release-revision').value;
  $('pub-activities-prev').disabled=busy||!activityPage||activityPage.offset===0;
  $('pub-activities-next').disabled=busy||!activityPage||activityPage.offset+activityPage.limit>=activityPage.total;
  $('pub-retry').disabled=$('pub-reconcile').disabled=busy||!pending;
  $('pub-create-form').querySelector('button[type=submit]').disabled=busy||!!pending;
  for(const box of document.querySelectorAll('[data-pub-kind]')){
   const visible=box.dataset.pubKind.split(' ').includes($('pub-kind').value);box.hidden=!visible;
   box.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=busy||!visible);
  }
 }
 function tab(name){
  currentTab=name;
  document.querySelectorAll('[data-pub-panel]').forEach(el=>el.hidden=el.dataset.pubPanel!==name);
  document.querySelectorAll('[data-pub-view]').forEach(el=>el.setAttribute('aria-selected',String(el.dataset.pubView===name)));
 }
 async function refresh({open=false}={}){
  const results=await Promise.all([get(base+'projects'),get(base+'context'),get(base+'methodology')]);
  projects=results[0].projects;context=results[1];method=results[2];
  pending=await retained('read')||null;pendingView();
  choose('pub-project-select',projects.map(x=>({id:x.id,label:x.name+' · r'+x.revision+' · '+x.state})),project?.id);
  const sources=(api.workspaceState()?.sources||[]).map(x=>({id:x.id,label:(x.label||x.name)+' · '+short(x.id)}));
  choose('pub-source',sources);choose('pub-candidate-source',sources);
  table($('pub-methodology'),[{key:'id',label:'Indicator'},{key:'name',label:'Reference name'},{key:'component',label:'Component'}],method.body.indicators);
  if(open&&($('pub-project-select').value||project?.id))await openProject($('pub-project-select').value||project.id);
  else if(project)latestRevision=projects.find(x=>x.id===project.id)?.revision||project.revision;
  buttons();
 }
 async function openProject(id,revision){
  if(!id)throw new Error('Choose a retained participant work item.');
  const [selected,saved]=await Promise.all([get(base+'project?'+query({id,revision})),get(base+'history?'+query({id}))]);
  const changed=!project||project.id!==selected.id||project.revision!==selected.revision;
  project=selected;history=saved.history;latestRevision=history.at(-1).revision;
  $('pub-project-select').value=id;
  if(changed){patches=[];preview=null;fields=null;activityPage=null;patchView();$('pub-preview-result').replaceChildren();}
  render();await activities(0);buttons();
 }
 function empty(holder,message){holder.replaceChildren();holder.textContent=message;holder.classList.add('empty');}
 function render(){
  if(!project)return;
  metrics($('pub-summary'),[['Activities',project.activityIds.length],['Feedback findings',project.feedback.length],['Saved revision',project.revision],['State',project.state]]);
  $('pub-mode').textContent=(editable()?'Current saved work':'Earlier revision; open current work to edit')+' · '+project.name+' · '+project.publisherRef;
  const source=$('pub-source-summary');source.replaceChildren();source.classList.remove('empty');
  properties(source,{publisher:project.publisherRef,cutoff:project.cutoff,activities:project.activityIds.length,baseline:project.baselineSource,candidate:project.candidateSource,methodology:project.methodology.body.title||project.methodology.body.name||'2026 technical reference',lastEditor:project.lastEditor});
  details(source,'Read the retained source and methodology selection',project.methodology);
  const holder=$('pub-history');holder.replaceChildren();holder.classList.remove('empty');
  for(const row of history){
   const line=document.createElement('div');line.className='pub-file';
   const label=document.createElement('span');label.textContent='Revision '+row.revision+' · '+row.lastAction.kind+' · '+row.lastAction.actor+' · '+row.state;
   const button=document.createElement('button');button.type='button';button.className='pub-history-open';button.textContent='Open r'+row.revision;
   button.onclick=()=>action('Opening the original saved participant revision…',()=>openProject(row.id,row.revision));
   line.append(label,button);holder.append(line);
  }
  renderFeedback();renderEvidence();renderValidation();renderReview();renderRelease();
  choose('pub-release-revision',history.filter(x=>x.state==='RELEASED').map(x=>({id:String(x.revision),label:'Revision '+x.revision+' · '+x.release.label})),project.state==='RELEASED'?String(project.revision):undefined);
 }
 function renderFeedback(){
  const find=$('pub-feedback-search').value.trim().toLocaleLowerCase();
  const rows=project.feedback.filter(x=>!find||[x.id,x.activityId,x.finding,x.owner,x.status].join(' ').toLocaleLowerCase().includes(find));
  table($('pub-feedback-table'),['id','activityId','indicatorId','finding','owner','status','note'],rows);
  choose('pub-finding',rows.map(x=>({id:x.id,label:x.id+' · '+(x.activityId||'Organisation')+' · '+x.status})));
  finding();
 }
 function finding(){
  const f=project?.feedback.find(x=>x.id===$('pub-finding').value);
  $('pub-finding-original').textContent=f?(f.activityId||'Organisation')+'\n'+f.indicatorId+'\n'+f.finding+'\nOriginal file '+short(f.sourceAsset)+', row '+f.sourceRow:'Choose an imported finding.';
  $('pub-finding-owner').value=f?.owner||'';$('pub-finding-status').value=f?.status||'open';$('pub-finding-note').value=f?.note||'';
  const list=$('pub-finding-evidence');list.replaceChildren();
  for(const item of project?.evidence||[]){const label=document.createElement('label');label.className='source-choice';const input=document.createElement('input');
   input.type='checkbox';input.value=item.id;input.checked=f?.evidenceIds.includes(item.id)||false;
   const span=document.createElement('span');span.textContent=item.label+' · '+item.name;label.append(input,span);list.append(label);}
 }
 function renderEvidence(){
  const holder=$('pub-evidence-list');holder.replaceChildren();
  for(const item of [...project.feedbackAssets,...project.evidence]){
   const row=document.createElement('div');row.className='pub-file';const text=document.createElement('span');text.textContent=(item.label||item.name)+' · '+item.bytes+' original bytes';
   const button=document.createElement('button');button.type='button';button.textContent='Download original';
   button.onclick=()=>action('Reading the complete retained source file…',()=>download(base+'evidence?'+query({id:project.id,asset:item.id,revision:project.revision}),item.name));
   row.append(text,button);holder.append(row);
  }
  if(!holder.children.length)empty(holder,'No feedback or evidence file has been retained.');
 }
 function renderValidation(){
  const v=project.candidateValidation,holder=$('pub-validation');holder.replaceChildren();
  metrics(holder,[['Complete candidate',v.state],['Reported schema errors',(v.errors||[]).length]]);
  const text=document.createElement('p');text.textContent=v.message||'IATI '+(v.standardVersion||'2.03')+' · '+v.stage;holder.append(text);
  if(v.errors?.length){const list=document.createElement('div');holder.append(list);table(list,['line','column','message'],v.errors);}
  details(holder,'Original schema result and source identity',v);
  const finance=$('pub-finance-result');finance.replaceChildren();
  if(project.finance)properties(finance,{portfolio:project.finance.portfolioId,baselineRevision:project.finance.beforeRevision,candidateRevision:project.finance.candidateRevision,comparison:project.finance.comparisonId,comparedBy:project.finance.comparedBy});
  else empty(finance,'Prepare the full native finance comparison before release review.');
 }
 function renderReview(){
  const holder=$('pub-review-result');holder.replaceChildren();
  if(project.review)properties(holder,{decision:project.review.decision,reviewer:project.review.reviewer,note:project.review.note,source:project.review.sourceId});
 }
 function renderRelease(){
  const holder=$('pub-release-result');holder.replaceChildren();
  if(project.release)properties(holder,{label:project.release.label,state:project.release.publicationState,releasedBy:project.release.releasedBy,source:project.release.sourceId,note:project.release.note});
 }
 async function send(route,input){
  if(pending)throw new Error('Continue or reconcile the original saved action first.');
  if(!context)await refresh();
  const selected={route,input:{...input,requestId:crypto.randomUUID(),actor:who()},recordedAt:new Date().toISOString()};
  await retained('write',selected);pending=selected;pendingView();
  return await continueAction();
 }
 async function continueAction(){
  if(!pending)throw new Error('There is no saved participant action to continue.');
  const selected=pending;let result;
  try{result=await post(base+selected.route,selected.input);}
  catch(error){
   if([400,409,422].includes(error.status)){
    const saved=await get(base+'request?'+query({requestId:selected.input.requestId}));
    if(saved.state==='NOT_RECORDED'){
     pending={...selected,rejected:{status:error.status,message:error.message,observedAt:new Date().toISOString()}};
     await retained('write',pending);pendingView();
    }
   }
   throw error;
  }
  await retained('delete');pending=null;pendingView();
  await api.refreshWorkspace();await openProject(result.id);
  status('Participant '+selected.route+' saved at revision '+result.revision+'.');
  return result;
 }
 async function reconcile(){
  if(!pending)return;
  const selected=await get(base+'request?'+query({requestId:pending.input.requestId}));
  if(selected.state==='RECORDED'){
   if(!same(selected.input,pending.input))throw new Error('The saved request identity differs from the original browser action.');
   await retained('delete');pending=null;pendingView();await api.refreshWorkspace();await openProject(selected.project.id);
   status('The original completed action was reopened without another save.');
  }else status('The original action has no committed participant revision. Continue its saved request to complete the same selection.');
 }
 function editInput(extra={}){
  if(!editable())throw new Error('Open the current saved participant revision before editing.');
  return {id:project.id,expectedRevision:project.revision,...extra};
 }
 async function fileInput(file){
  if(!file||file.size>16*1024*1024)throw new Error('Choose one complete original file within 16 MiB.');
  const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
  for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(binary);
 }
 async function activities(offset){
  if(!project)return;
  activityPage=await get(base+'activities?'+query({id:project.id,revision:project.revision,offset,limit:50}));
  table($('pub-activities-table'),['activityId','title','status','hierarchy','documents'],activityPage.rows);
  choose('pub-activity',activityPage.rows.map(x=>({id:x.activityId,label:x.activityId+' · '+x.title})));
  $('pub-activities-page').textContent=(activityPage.total?offset+1:0)+'–'+Math.min(offset+activityPage.limit,activityPage.total)+' of '+activityPage.total;
  fields=null;fieldChoices();buttons();
 }
 function fieldChoices(){
  const kind=$('pub-kind').value;
  const allowed=kind==='organisation-reference'?['participating-org']:kind==='document-attributes'?['document-link']:['title','description','participating-org','document-link'];
  choose('pub-field',(fields?.fields||[]).filter(x=>allowed.includes(x.field)).map(x=>({id:x.field+':'+x.index,label:x.field+' '+(x.index+1)+' · '+(x.narratives[0]?.text||x.attributes.ref||x.attributes.url||'Original field')})));
  $('pub-field-label').hidden=kind==='add-document';renderField();buttons();
 }
 function selectedField(){return fields?.fields.find(x=>x.field+':'+x.index===$('pub-field').value);}
 function renderField(){
  const f=selectedField(),kind=$('pub-kind').value;
  const holder=$('pub-original-field');holder.replaceChildren();
  if(kind==='add-document')holder.textContent=fields?'Complete original activity '+fields.activityId+'\n'+fields.activitySha256:'Open the original activity fields first.';
  else if(f){properties(holder,f.attributes);const text=document.createElement('p');text.textContent=f.narratives.map(n=>(n.language||'Inherited language')+': '+n.text).join('\n');holder.append(text);}
  else holder.textContent='Open original activity fields, then choose a field.';
  const narratives=(f?.narratives||[]).map(n=>({id:String(n.index),label:(n.language||'Inherited default')+' · '+n.text.slice(0,100)}));
  choose('pub-narrative',[...narratives,{id:'new',label:'Add a distinct language narrative'}]);
  $('pub-org-ref').value=f?.attributes.ref||'';
  if(kind==='document-attributes'){$('pub-doc-url').value=f?.attributes.url||'';$('pub-doc-format').value=f?.attributes.format||'';}
  else if(kind==='add-document'){$('pub-doc-url').value='';$('pub-doc-format').value='';}
  narrative();
 }
 function narrative(){
  const f=selectedField(),n=f?.narratives.find(x=>String(x.index)===$('pub-narrative').value);
  $('pub-language').value=n?.language||'';$('pub-text').value=n?.text||'';
  $('pub-language').readOnly=!!n;
 }
 function makePatch(){
  if(!fields||fields.revision!==project.revision||fields.sourceId!==project.candidateSource)throw new Error('Reopen this activity from the current candidate before preparing a correction.');
  const kind=$('pub-kind').value,f=selectedField(),patch={kind,activityId:fields.activityId};
  if(kind==='add-document'){
   Object.assign(patch,{expectedSha256:fields.activitySha256,url:$('pub-doc-url').value,format:$('pub-doc-format').value,title:$('pub-doc-title').value,language:$('pub-doc-language').value,
    categories:[...$('pub-doc-categories').querySelectorAll('input:checked')].map(x=>x.value),documentDate:$('pub-doc-date').value});
  }else{
   if(!f)throw new Error('Select one complete original field.');
   Object.assign(patch,{field:f.field,index:f.index,expectedSha256:f.sha256});
   if(kind==='narrative'){
    const n=f.narratives.find(x=>String(x.index)===$('pub-narrative').value);
    Object.assign(patch,{narrativeIndex:n?n.index:null,text:$('pub-text').value,language:$('pub-language').value});
    if(n)patch.expectedNarrativeSha256=n.sha256;
   }else if(kind==='organisation-reference')patch.ref=$('pub-org-ref').value;
   else{if($('pub-doc-url').value)patch.url=$('pub-doc-url').value;if($('pub-doc-format').value)patch.format=$('pub-doc-format').value;}
  }
  return patch;
 }
 function patchView(){
  const holder=$('pub-patches');holder.replaceChildren();
  if(!patches.length){empty(holder,'No unsubmitted corrections.');buttons();return;}
  holder.classList.remove('empty');const list=document.createElement('ol');list.className='pub-stage-list';
  patches.forEach((p,i)=>{const li=document.createElement('li'),text=document.createElement('span'),button=document.createElement('button');
   text.textContent=p.activityId+' · '+p.kind+' · '+(p.field||p.title||'Document')+' ';
   button.type='button';button.textContent='Remove';button.onclick=()=>{patches.splice(i,1);preview=null;patchView();$('pub-preview-result').replaceChildren();};
   li.append(text,button);list.append(li);});holder.append(list);details(holder,'Exact selected field values',patches);buttons();
 }
 function showPreview(value){
  const holder=$('pub-preview-result');holder.replaceChildren();
  metrics(holder,[['Candidate schema',value.validation.state],['Reviewed field changes',value.audit.byteChanges.length],['Unchanged source bytes',value.audit.unchangedBytes]]);
  const note=document.createElement('p');note.textContent='Financial groups and original record census are unchanged. Candidate '+value.candidateId;holder.append(note);
  if(value.validation.errors?.length){const errors=document.createElement('div');holder.append(errors);table(errors,['line','column','message'],value.validation.errors);}
  details(holder,'Full correction spans and validation result',value);
 }
 const categories=[
  ['A01','Impact appraisal'],['A02','Objectives and purpose'],['A03','Intended beneficiaries'],['A04','Conditions'],['A05','Budget'],['A06','Contract summary'],['A07','Performance review and evaluation'],['A08','Results, outcomes and outputs'],['A09','Agreed memorandum'],['A10','Tender'],['A11','Contract'],['A12','Activity web page'],
  ['B01','Annual report'],['B02','Institutional strategy'],['B03','Country strategy'],['B04','Aid allocation policy'],['B05','Procurement policy'],['B06','Institutional audit'],['B07','Country audit'],['B08','Exclusions policy'],['B09','Institutional evaluation'],['B10','Country evaluation'],['B11','Sector strategy'],['B12','Thematic strategy'],['B13','Country memorandum'],['B14','Evaluation policy'],['B15','Terms and conditions'],['B16','Organisation web page'],['B17','Country or region web page'],['B18','Sector web page']];
 for(const [code,name]of categories){const label=document.createElement('label'),input=document.createElement('input'),span=document.createElement('span');input.type='checkbox';input.value=code;span.textContent=code+' · '+name;label.append(input,span);$('pub-doc-categories').append(label);}
 function submit(id,message,fn){$(id).addEventListener('submit',event=>{event.preventDefault();action(message,fn);});}
 document.querySelectorAll('[data-pub-view]').forEach(button=>button.onclick=()=>tab(button.dataset.pubView));
 $('pub-open-view').addEventListener('click',()=>action('Opening retained participant publishing work…',()=>refresh({open:true})));
 $('pub-refresh').onclick=()=>action('Refreshing original participant records…',()=>refresh({open:!!project}));
 $('pub-open').onclick=()=>action('Opening complete saved participant work…',()=>openProject($('pub-project-select').value));
 $('pub-new').onclick=()=>{tab('overview');$('pub-create-form').reset();$('pub-cutoff').value=new Date().toISOString().slice(0,10);$('pub-name').focus();};
 $('pub-actor').addEventListener('change',()=>{try{sessionStorage.setItem('sf30.iati.participant.actor',$('pub-actor').value);}catch{}});
 try{$('pub-actor').value=sessionStorage.getItem('sf30.iati.participant.actor')||'';}catch{}
 $('pub-cutoff').value=new Date().toISOString().slice(0,10);
 $('pub-retry').onclick=()=>action('Continuing the original saved participant action…',continueAction);
 $('pub-reconcile').onclick=()=>action('Reading the original saved action result…',reconcile);
 $('pub-revise').onclick=()=>action('Retaining the rejected input before revising the selection…',async()=>{
  if(!pending?.rejected)throw new Error('First reconcile the original completed rejection.');
  const result=await get(base+'request?'+query({requestId:pending.input.requestId}));
  if(result.state!=='NOT_RECORDED')return reconcile();
  await retained('archive',pending);await retained('delete');pending=null;pendingView();
  status('The original rejected input is retained. Correct the form and save a new reviewed selection.');
 });
 submit('pub-create-form','Saving the original publisher and agreed activity cohort…',async()=>{
  const value={name:$('pub-name').value,sourceId:$('pub-source').value,publisherRef:$('pub-publisher').value,cutoff:$('pub-cutoff').value,activityIds:$('pub-activity-ids').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),notes:$('pub-notes').value};
  await send('create',value);tab('feedback');
 });
 submit('pub-feedback-form','Retaining every original feedback row…',async()=>{const file=$('pub-feedback-file').files[0];await send('feedback',editInput({fileBase64:await fileInput(file),filename:file.name}));});
 $('pub-feedback-template').onclick=()=>action('Preparing the original feedback column template…',()=>download(base+'feedback-template','feedback-template.csv'));
 submit('pub-evidence-form','Retaining the complete original evidence…',async()=>{const file=$('pub-evidence-file').files[0];await send('evidence',editInput({fileBase64:await fileInput(file),filename:file.name,media:file.type||'application/octet-stream',label:$('pub-evidence-label').value,sourceUrl:$('pub-evidence-url').value}));});
 $('pub-feedback-search').oninput=()=>{if(project)renderFeedback();};
 $('pub-finding').onchange=finding;
 submit('pub-triage-form','Saving the original finding decision…',()=>send('triage',editInput({findingId:$('pub-finding').value,status:$('pub-finding-status').value,owner:$('pub-finding-owner').value,note:$('pub-finding-note').value,evidenceIds:[...$('pub-finding-evidence').querySelectorAll('input:checked')].map(x=>x.value)})));
 $('pub-activities-prev').onclick=()=>action('Reading the previous original activities…',()=>activities(Math.max(0,activityPage.offset-activityPage.limit)));
 $('pub-activities-next').onclick=()=>action('Reading the next original activity page…',()=>activities(activityPage.offset+activityPage.limit));
 $('pub-load-fields').onclick=()=>action('Opening the complete original activity fields…',async()=>{if(!project||!$('pub-activity').value)throw new Error('Choose an original activity.');fields=await get(base+'fields?'+query({id:project.id,revision:project.revision,activity:$('pub-activity').value}));fieldChoices();});
 $('pub-kind').onchange=fieldChoices;$('pub-field').onchange=renderField;$('pub-narrative').onchange=narrative;
 submit('pub-correction-form','Retaining the selected field for review…',async()=>{patches.push(makePatch());preview=null;patchView();$('pub-preview-result').replaceChildren();status('Field added to the unsubmitted correction preview.');});
 $('pub-clear-patches').onclick=()=>{patches=[];preview=null;patchView();$('pub-preview-result').replaceChildren();};
 $('pub-preview').onclick=()=>action('Checking the complete corrected source and unchanged finance…',async()=>{preview=await post(base+'preview',{id:project.id,expectedRevision:project.revision,patches});showPreview(preview);});
 $('pub-apply').onclick=()=>action('Saving the exact reviewed candidate XML…',async()=>{if(!preview)throw new Error('Review the complete correction preview first.');await send('correct',editInput({patches,expectedPreviewSha256:preview.previewSha256,note:$('pub-correction-note').value}));tab('review');});
 submit('pub-candidate-form','Retaining the publisher-supplied complete candidate…',()=>send('candidate',editInput({sourceId:$('pub-candidate-source').value,note:$('pub-candidate-note').value})));
 $('pub-finance').onclick=()=>action('Building and comparing all three native finance collections…',()=>send('finance',editInput()));
 $('pub-open-finance').onclick=()=>action('Opening the original complete finance portfolio…',async()=>{if(!project?.finance)throw new Error('Prepare finance first.');await api.openPortfolio(project.finance.portfolioId);api.show('portfolios');});
 $('pub-download-finance').onclick=()=>action('Preparing complete native finance reports and CSVs…',()=>download('/api/iati/report/export?'+query({portfolio:project.finance.portfolioId,revision:project.finance.candidateRevision}),'participant-finance.zip'));
 submit('pub-review-form','Saving the distinct named review…',()=>send('review',editInput({decision:$('pub-review-decision').value,note:$('pub-review-note').value})));
 submit('pub-release-form','Retaining the immutable publisher release…',()=>send('release',editInput({label:$('pub-release-label').value,note:$('pub-release-note').value})));
 $('pub-release-revision').onchange=buttons;
 $('pub-download-release').onclick=()=>action('Preparing every original participant deliverable…',()=>download(base+'export?'+query({id:project.id,revision:$('pub-release-revision').value}),'IATI_Participant_Release.zip'));
 for(const edition of ['candidate','baseline'])$('pub-download-'+edition).onclick=()=>action('Reading the complete original publisher edition…',()=>download(base+'source?'+query({id:project.id,revision:project.revision,edition}),edition+'-publisher.xml'));
 submit('pub-receive-form','Verifying the complete release and reopening its original history…',async()=>{const file=$('pub-receive-file').files[0];if(!file)throw new Error('Choose the complete original release ZIP.');
  const value=await(await request(base+'receive',{method:'POST',headers:{'content-type':'application/zip'},body:file})).json();
  const holder=$('pub-receive-result');holder.replaceChildren();properties(holder,{state:value.state,revisions:value.revisions,sources:value.sources,evidenceFiles:value.evidenceFiles});details(holder,'Complete original receiving result',value);
  await api.refreshWorkspace();await openProject(value.project.id,value.project.revision);tab('handover');status('Complete participant history and native finance received and reopened.');});
 buttons();return {refresh,buttons,openProject};
};
