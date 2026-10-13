// MIT. Native job inspection and durable operator drafts in the original Flowable desk.
const SCHEMA='stellar-forge.flowable-job-working.v1';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const RECORD=/^[a-f0-9]{24}$/;
const COLLECTIONS=['jobs','timerJobs','suspendedJobs','deadLetterJobs','historyJobs'];
const LABELS={jobs:'Executable jobs',timerJobs:'Timer jobs',suspendedJobs:'Suspended jobs',deadLetterJobs:'Dead-letter jobs',historyJobs:'History jobs'};
const ACTIONS={jobs:['execute','delete'],timerJobs:['move','reschedule','delete'],suspendedJobs:['delete'],deadLetterJobs:['move','moveToHistoryJob','delete'],historyJobs:['execute','delete']};
const ACTION_LABELS={execute:'Execute this native job',delete:'Delete this native job',move:'Move using native job type',reschedule:'Reschedule timer',moveToHistoryJob:'Move to native history queue'};
const HELP={execute:'Execute the selected job through the original native engine. Review its retained exception and corrective work before dispatch.',
 delete:'Delete the selected job through the native engine. This removes the job; it does not complete the associated process.',
 move:'Move the selected job using the native engine’s own queue and configured retry rules. A move receipt does not establish completed execution.',
 reschedule:'Supply the explicit native due date text for this timer. Retain the intended date, time and timezone.',
 moveToHistoryJob:'Move this dead-letter job to the native history queue. Inspect the captured history jobs afterward.'};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const copy=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'FLOWABLE_JOB_WORKING_INVALID'});};
const key=value=>JSON.stringify([value.portfolio.id,value.portfolio.revision,value.collection,value.job.id]);
function validate(value,workspaceId){
  need(plain(value)&&value.schema===SCHEMA&&value.workspaceId===workspaceId&&UUID.test(value.instanceId),'Open a complete job working file from this original workspace.');
  need(Array.isArray(value.drafts)&&value.drafts.length<=2000&&typeof value.activeKey==='string','The working file needs its complete drafts and selected entry.');
  need(typeof value.updatedAt==='string','Retain the working copy timestamp.');
  const keys=new Set();
  for(const draft of value.drafts){
    need(plain(draft)&&plain(draft.original)&&plain(draft.original.portfolio)&&
      RECORD.test(draft.original.portfolio.id)&&Number.isSafeInteger(draft.original.portfolio.revision)&&draft.original.portfolio.revision>0&&
      COLLECTIONS.includes(draft.original.collection)&&plain(draft.original.job)&&typeof draft.original.job.id==='string'&&
      RECORD.test(draft.original.connectionId),'Each draft must retain its actual captured native job and connection.');
    need(draft.key===key(draft.original)&&!keys.has(draft.key),'Each captured job has one distinct unfinished draft in this copy.');keys.add(draft.key);
    for(const field of ['label','note','action','dueDate'])need(typeof draft[field]==='string'&&draft[field].length<=1048576,'Retain complete bounded unfinished text.');
    need(draft.preparation===undefined||plain(draft.preparation)&&UUID.test(draft.preparation.requestId)&&
      draft.preparation.connectionId===draft.original.connectionId&&plain(draft.preparation.selection),'Retain the original preparation request.');
    if(draft.preparation)need(draft.preparation.selection.jobId===draft.original.job.id&&
      draft.preparation.selection.collection===draft.original.collection&&draft.preparation.selection.action===draft.action&&
      (draft.preparation.selection.dueDate??'')===draft.dueDate&&draft.preparation.label===draft.label&&draft.preparation.note===draft.note,
      'A pending preparation must retain the complete original visible definition.');
  }
  need(value.activeKey===''||keys.has(value.activeKey),'The selected unfinished entry must be present.');
  return copy(value);
}
export function installFlowableJobs(host){
  const {api,write,busy,node,button,pre,keyValues,table,originalLink,notice,reload,openRecord,requireEngine,records,forEngine,detail,workspaceId}=host;
  const $=selector=>document.querySelector(selector);
  let working=null,db=null,queue=Promise.resolve(),failure=null,scope=null,selected=null,collection='deadLetterJobs',search='',items=[],generation=0;
  const active=()=>working?.drafts.find(item=>item.key===working.activeKey);
  const scopeNow=()=>[workspaceId(),host.engine()??''].join(':');
  async function database(){
    if(db)return db;db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('flowable-job-working',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('copies',{keyPath:'key'});
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });return db;
  }
  async function storage(mode,fn){
    const d=await database();return new Promise((resolve,reject)=>{
      const tx=d.transaction('copies',mode),request=fn(tx.objectStore('copies'));let value;
      request.onsuccess=()=>value=request.result;tx.oncomplete=()=>resolve(value);
      tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('Working copy was not saved.'));
    });
  }
  function status(message,error=false){$('#job-working-status').textContent=message;$('#job-working-status').dataset.level=error?'error':'info';}
  function retain(){
    if(!working)return Promise.resolve();
    working.updatedAt=new Date().toISOString();
    const snapshot=copy(working);
    status('Saving this browser copy…');
    const task=queue.catch(()=>{}).then(()=>storage('readwrite',store=>store.put({key:snapshot.workspaceId+':'+snapshot.instanceId,value:snapshot})));
    queue=task;
    task.then(()=>{failure=null;if(working?.instanceId===snapshot.instanceId)status('Saved browser copy '+snapshot.instanceId+'.');},
      error=>{failure=error;if(working?.instanceId===snapshot.instanceId)status('Browser storage failed. Download the complete working file to retain all drafts and original requests.',true);});
    return task;
  }
  async function ensure(){await queue;need(!failure,'Retain the working copy before preparing native recovery. Download it while browser storage is unavailable.');await retain();}
  function download(value,name){
    const text=JSON.stringify(value,null,2)+'\n';need(new TextEncoder().encode(text).length<=32*1024*1024,'The complete working file exceeds 32 MiB.');
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=node('a',null,{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);return text;
  }
  async function copies(){
    const values=await storage('readonly',store=>store.getAll()),select=$('#job-copy-select'),prior=select.value;
    select.replaceChildren(node('option','Choose an earlier browser copy',{value:''}));
    for(const item of values.filter(x=>x.value?.workspaceId===workspaceId()).sort((a,b)=>(b.value.updatedAt??'').localeCompare(a.value.updatedAt??'')))
      select.append(node('option',(item.value.updatedAt??'Saved')+' · '+item.value.instanceId,{value:item.key}));
    if([...select.options].some(x=>x.value===prior))select.value=prior;
  }
  function newWorking(){return{schema:SCHEMA,workspaceId:workspaceId(),instanceId:crypto.randomUUID(),updatedAt:new Date().toISOString(),activeKey:'',drafts:[]};}
  async function initialize(){
    if(working?.workspaceId===workspaceId())return;
    if(working)await ensure();
    working=newWorking();scope=scopeNow();await retain().catch(()=>{});await copies().catch(()=>{});
  }
  function drawEditor(){
    const form=$('#jobOperation-form'),draft=active();form.hidden=!draft;
    if(!draft){$('#job-editing-label').textContent='Open an actual captured job to prepare its native recovery.';return;}
    $('#job-editing-label').textContent=LABELS[draft.original.collection]+' · '+draft.original.job.id+' · captured revision '+draft.original.portfolio.revision;
    const actionField=form.elements.action;actionField.replaceChildren(node('option','Select a native recovery action',{value:''}));
    for(const action of ACTIONS[draft.original.collection])actionField.append(node('option',ACTION_LABELS[action],{value:action}));
    for(const name of ['label','note','action','dueDate'])form.elements[name].value=draft[name];
    $('#job-due-date-field').hidden=draft.action!=='reschedule';$('#job-action-help').textContent=HELP[draft.action]??'Choose the exact native action for this captured job collection.';
    const frozen=!!draft.preparation;
    for(const input of form.querySelectorAll('input,select,textarea')){input.disabled=frozen;input.dataset.pagerDisabled=String(frozen);}
    $('#job-prepare').textContent=frozen?'Read original preparation':'Prepare selected job recovery';
    $('#job-new-review').hidden=!frozen;
    $('#job-request-label').textContent=frozen?'Retained request '+draft.preparation.requestId+'. Continue this exact request before authoring another review.':'Preparation reads current native state and retains the exact request for a separate dispatch review.';
  }
  async function inspect(item){
    const expected=scopeNow(),g=generation;
    const capture=records('jobPortfolio').find(x=>x.id===selected);need(capture?.state==='CAPTURED','Choose a completed original job capture.');
    const result=await api('readJob',{portfolioId:selected,revision:capture.revision,collection,jobId:item.id});
    need(expected===scopeNow()&&g===generation,'The selected workspace or job capture changed.');
    await initialize();const k=key(result);let draft=working.drafts.find(x=>x.key===k);
    if(!draft){draft={key:k,original:result,label:'Job recovery '+item.id,note:'',action:'',dueDate:''};working.drafts.push(draft);}
    working.activeKey=k;await retain().catch(()=>{});drawEditor();
    const target=detail('Native job '+item.id);
    target.append(keyValues([['Collection',LABELS[result.collection]],['Job',result.job.id],['Captured',result.capturedAt],
      ['Process',result.job.processInstanceId],['Execution',result.job.executionId],['Retries',result.job.retries],
      ['Due',result.job.dueDate],['Exception',result.job.exceptionMessage]]));
    const original=node('details');original.append(node('summary','Complete original native job'),pre(result.job));target.append(original);
    for(const observation of result.exceptionObservations??[]){
      const label=observation.availability==='NATIVE_404'?'No stacktrace returned at capture':
        observation.availability==='NO_NATIVE_STACKTRACE_ENDPOINT'?'Native detail retains exception/config; no stacktrace endpoint':
        'Complete native stacktrace retained';
      const observed=node('section');observed.append(node('h3',label),pre(observation));target.append(observed);
    }
    for(const resource of result.resources??[]){
      const section=node('section');section.append(node('h3',resource.filename??'Native exception'));
      section.append(keyValues([['Bytes',resource.bytes],['SHA-256',resource.sha256]]));
      const ref=resource.originalResource??resource.definitionRef;
      if(ref){
        section.append(originalLink(ref,'Download complete native exception',resource.filename));
        section.append(button('Read complete retained exception',async()=>{
          const selected=await api('readSource',{reference:ref});
          const view=pre(selected.text??selected.value??selected);
          section.append(view);
        }));
      }else section.append(pre(resource));
      target.append(section);
    }
    $('#jobOperation-form').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function drawTable(){
    const query=search.toLocaleLowerCase(),filtered=items.filter(item=>!query||[
      item.id,item.processInstanceId,item.executionId,item.elementId,item.exceptionMessage,item.tenantId
    ].some(value=>String(value??'').toLocaleLowerCase().includes(query)));
    $('#job-count').textContent=filtered.length+' shown of '+items.length+' retained '+LABELS[collection].toLowerCase()+'.';
    table($('#jobs-table'),[
      {label:'Native job',key:'id'},{label:'Process',key:'processInstanceId'},{label:'Execution',key:'executionId'},
      {label:'Retries',key:'retries'},{label:'Due',key:'dueDate'},{label:'Exception',key:'exceptionMessage'},
      {label:'Open',render:item=>button('Inspect / prepare',()=>inspect(item))}
    ],filtered,{empty:'This selected captured collection has no matching jobs.'});
  }
  async function refresh(){
    await initialize();
    const current=scopeNow();
    if(scope!==current){scope=current;generation++;selected=null;items=[];$('#detail').hidden=true;}
    const captures=(host.engine()?forEngine(records('jobPortfolio')):[]).filter(x=>x.state==='CAPTURED').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    const select=$('#job-portfolio-select');select.replaceChildren();
    if(!captures.length)select.append(node('option','Refresh native jobs to retain a capture',{value:''}));
    for(const capture of captures)select.append(node('option',capture.label+' · '+capture.updatedAt,{value:capture.id}));
    selected=captures.some(x=>x.id===selected)?selected:captures[0]?.id??null;select.value=selected??'';
    const g=++generation,expected=scopeNow();items=[];drawTable();drawEditor();
    if(selected){
      const record=captures.find(x=>x.id===selected);let offset=0,all=[];
      do{const page=await api('readJobPortfolio',{id:selected,revision:record.revision,collection,offset,limit:500});
        need(g===generation&&expected===scopeNow(),'The selected native job capture changed.');
        all.push(...page.items);offset=page.nextOffset;
      }while(offset!==null&&offset!==undefined);
      items=all;drawTable();
    }
  }
  async function adopt(value){
    const incoming=validate(value,workspaceId()),prior=working,expected=scopeNow(),g=generation;
    for(const draft of incoming.drafts){
      const source=await api('readJob',{portfolioId:draft.original.portfolio.id,revision:draft.original.portfolio.revision,
        collection:draft.original.collection,jobId:draft.original.job.id});
      need(expected===scopeNow()&&g===generation,'The original working scope changed while validating sources.');
      need(same(source,draft.original),'The imported draft does not retain its exact original captured job source.');
    }
    if(prior){download(prior,'Flowable_Job_Working_Before_Open.json');await retain().catch(()=>{});}
    const oldInstance=incoming.instanceId;incoming.instanceId=crypto.randomUUID();
    incoming.openedFrom={instanceId:oldInstance,openedAt:new Date().toISOString()};
    working=incoming;scope=scopeNow();await retain().catch(()=>{});drawEditor();await copies().catch(()=>{});
    notice('Opened the complete working copy in a separate browser instance. Original preparation IDs remain unchanged.');
  }
  $('#job-capture').addEventListener('click',()=>busy('Capture native jobs and exceptions',async()=>{
    const result=await write('captureJobPortfolio',{connectionId:requireEngine(),label:'Native jobs '+new Date().toISOString()});
    if(result.value.state==='CAPTURED')selected=result.id;
    await reload();if(result.value.state!=='CAPTURED')await openRecord('jobPortfolio',result.id);
    notice('Native job capture: '+result.value.state+'.');
  }));
  $('#job-portfolio-select').addEventListener('change',()=>busy('Open retained job capture',async()=>{selected=$('#job-portfolio-select').value;await refresh();}));
  $('#job-collection-select').addEventListener('change',()=>busy('Read retained job collection',async()=>{collection=$('#job-collection-select').value;await refresh();}));
  $('#job-search').addEventListener('input',event=>{search=event.target.value;drawTable();});
  $('#job-working-download').addEventListener('click',()=>{if(working)download(working,'Flowable_Job_Working.json');});
  $('#job-working-file').addEventListener('change',event=>{
    const file=event.target.files[0];if(!file)return;
    void busy('Open complete job working file',async()=>{
      need(file.size<=32*1024*1024,'Open a complete working file within 32 MiB.');const expected=scopeNow(),g=generation,text=await file.text();
      need(expected===scopeNow()&&g===generation,'The selected workspace changed while reading the file.');await adopt(JSON.parse(text));
    });event.target.value='';
  });
  $('#job-copies-refresh').addEventListener('click',()=>busy('Read browser working copies',copies));
  $('#job-copy-open').addEventListener('click',()=>busy('Open earlier browser copy',async()=>{
    const k=$('#job-copy-select').value;need(k,'Choose an original browser copy.');
    const value=await storage('readonly',store=>store.get(k));need(value,'The selected browser copy is absent.');await adopt(value.value);
  }));
  $('#jobOperation-form').addEventListener('input',event=>{
    const draft=active();if(!draft||draft.preparation||!['label','note','action','dueDate'].includes(event.target.name))return;
    draft[event.target.name]=event.target.value;
    if(event.target.name==='action'){if(draft.action!=='reschedule')draft.dueDate='';$('#job-due-date-field').hidden=draft.action!=='reschedule';$('#job-action-help').textContent=HELP[draft.action]??'Choose a native action.';}
    void retain().catch(()=>{});
  });
  $('#jobOperation-form').addEventListener('submit',event=>{
    event.preventDefault();void busy('Prepare original native job recovery',async()=>{
      const draft=active();need(draft,'Choose an actual captured job.');const expected=scopeNow(),g=generation;
      need(draft.original.connectionId===requireEngine(),'Select the original engine retained with this job draft.');
      if(!draft.preparation){
        need(ACTIONS[draft.original.collection].includes(draft.action),'Select a native recovery action for this job collection.');
        need(draft.action!=='reschedule'||draft.dueDate.trim(),'Supply the intended native due date.');
        draft.preparation={requestId:crypto.randomUUID(),connectionId:draft.original.connectionId,label:draft.label,note:draft.note,
          selection:{collection:draft.original.collection,jobId:draft.original.job.id,action:draft.action,...(draft.action==='reschedule'?{dueDate:draft.dueDate}:{})}};
      }
      drawEditor();await ensure();need(expected===scopeNow()&&g===generation,'The selected engine or job changed before preparation.');
      const result=await write('prepareJobOperation',copy(draft.preparation));
      draft.result={id:result.id,revision:result.revision,state:result.value.state};await retain();await reload();await openRecord('jobOperation',result.id);
      notice('Saved native recovery review: '+result.value.state+'.');
    });
  });
  $('#job-new-review').addEventListener('click',()=>busy('Keep original and author another job review',async()=>{
    const draft=active();need(draft?.preparation,'Read the original preparation first.');
    const result=await write('prepareJobOperation',copy(draft.preparation));
    need(!['PREPARING','INTERRUPTED'].includes(result.value.phase),'Continue the original incomplete preparation.');
    await ensure();const prior=copy(working);await retain();working=copy(prior);working.instanceId=crypto.randomUUID();
    const next=active();delete next.preparation;delete next.result;
    working.openedFrom={instanceId:prior.instanceId,openedAt:new Date().toISOString()};
    await retain();drawEditor();await copies();notice('Original review retained in its earlier browser copy and workspace history.');
  }));
  return {render:refresh,selectCapture(id){selected=id;},
    async reuse(review){await initialize();const current=active();need(current&&current.original.job.id===review.request?.jobId&&
      current.original.collection===review.request?.collection,'Open the corresponding captured job before authoring another recovery review.');
      notice('Use “Keep original and author another review” to preserve the previous request.');$('#jobOperation-form').scrollIntoView();},
    working(){return working?copy(working):null;}};
}
