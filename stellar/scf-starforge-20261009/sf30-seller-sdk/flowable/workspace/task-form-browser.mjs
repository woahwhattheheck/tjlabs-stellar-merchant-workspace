// MIT. Native task forms in the original Flowable workspace.
const SCHEMA='stellar-forge.flowable-task-form-working.v1';
const MAX=32*1024*1024;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const RECORD=/^[a-f0-9]{24}$/;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const copy=x=>JSON.parse(JSON.stringify(x));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const has=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'FLOWABLE_TASK_FORM_WORKING_INVALID'});};
const text=(value)=>typeof value==='string'&&value.length<=1048576;
const key=value=>JSON.stringify([value.capture.id,value.capture.revision]);
function properties(original){
  if(original.form===null)return [];
  need(plain(original.form)&&Array.isArray(original.form.formProperties),'This capture does not contain an original native task form.');
  const result=original.form.formProperties,ids=new Set();
  for(const p of result){need(plain(p)&&typeof p.id==='string'&&!ids.has(p.id),'The original form must have distinct property IDs.');ids.add(p.id);}
  return result;
}
function selection(draft){
  return {taskId:draft.original.taskId,properties:draft.fields.filter(x=>x.mode!=='omit').map(x=>({id:x.id,value:x.mode==='null'?null:x.value}))};
}
function validate(value,workspace){
  need(plain(value)&&value.schema===SCHEMA&&value.workspaceId===workspace&&UUID.test(value.instanceId),'Open a complete task-form working file from this workspace.');
  need(text(value.updatedAt)&&typeof value.activeKey==='string'&&Array.isArray(value.drafts)&&value.drafts.length<=2000,'Retain the complete working-copy identity and drafts.');
  need(plain(value.captureDraft)&&['taskId','label','note'].every(k=>text(value.captureDraft[k])),'Retain the unfinished capture fields.');
  if(value.captureDraft.request){
    const r=value.captureDraft.request;
    need(plain(r)&&UUID.test(r.requestId)&&RECORD.test(r.connectionId)&&r.taskId===value.captureDraft.taskId&&r.label===value.captureDraft.label&&r.note===value.captureDraft.note,'Retain the exact original capture request.');
  }
  const keys=new Set();
  for(const d of value.drafts){
    const o=d?.original;
    need(plain(d)&&plain(o)&&plain(o.capture)&&RECORD.test(o.capture.id)&&Number.isSafeInteger(o.capture.revision)&&o.capture.revision>0&&RECORD.test(o.connectionId)&&typeof o.taskId==='string','Retain the actual form capture, revision, engine and task.');
    need(d.key===key(o)&&!keys.has(d.key),'Each captured form has one draft in this copy.');keys.add(d.key);
    need(text(d.label)&&text(d.note)&&Array.isArray(d.fields),'Retain complete label, note and property edits.');
    const writable=properties(o).filter(p=>p.writable===true);
    need(d.fields.length===writable.length,'Retain one explicit submission choice for every captured writable property.');
    for(let i=0;i<writable.length;i++){
      const f=d.fields[i];need(plain(f)&&f.id===writable[i].id&&['omit','value','null'].includes(f.mode)&&text(f.value),'Preserve exact native property IDs, text and omission/null choice.');
    }
    if(d.preparation){
      const r=d.preparation;
      need(plain(r)&&UUID.test(r.requestId)&&r.connectionId===o.connectionId&&r.captureId===o.capture.id&&r.captureRevision===o.capture.revision&&
        r.label===d.label&&r.note===d.note&&same(r.selection,selection(d)),'A frozen preparation must match all visible fields and the exact source capture.');
    }
  }
  need(Array.isArray(value.dispatches)&&value.dispatches.length<=2000,'Retain complete original form submission requests.');
  const operations=new Set();
  for(const d of value.dispatches){
    need(plain(d)&&plain(d.operation)&&d.operation.kind==='taskFormOperation'&&RECORD.test(d.operation.id)&&
      Number.isSafeInteger(d.operation.revision)&&d.operation.revision>0&&/^[a-f0-9]{64}$/.test(d.operation.sha256)&&
      plain(d.review)&&plain(d.request)&&UUID.test(d.request.requestId)&&d.request.id===d.operation.id&&
      d.request.expectedRevision===d.operation.revision&&d.request.planSha256===d.review.request?.planSha256&&
      !operations.has(d.operation.id),'Retain one exact reviewed operation and original submission request per operation.');
    operations.add(d.operation.id);
  }
  need(value.activeKey===''||keys.has(value.activeKey),'The active form draft must be retained.');
  return copy(value);
}
export function installFlowableTaskForms(host){
  const {api,write,busy,button,node,pre,keyValues,table,originalLink,notice,reload,openRecord,requireEngine,records,forEngine,workspaceId}=host;
  const $=s=>document.querySelector(s);
  let working=null,db=null,queue=Promise.resolve(),generation=0,scope='',selected='',search='',fileProof=null,storageError=null;
  const rejections=new Map();
  const active=()=>working?.drafts.find(d=>d.key===working.activeKey);
  const currentScope=()=>JSON.stringify([workspaceId(),host.engine()??'']);
  const identity=()=>({scope:currentScope(),instance:working?.instanceId,generation});
  const current=x=>x.scope===currentScope()&&x.instance===working?.instanceId&&x.generation===generation;
  const bounded=value=>{const raw=JSON.stringify(value)+'\n';need(new TextEncoder().encode(raw).length<=MAX,'The complete task-form working file exceeds 32 MiB. Preserve this copy before opening another source.');return raw;};
  function status(message,error=false){$('#task-native-working-status').textContent=message;$('#task-native-working-status').dataset.level=error?'error':'info';}
  async function database(){
    if(db)return db;
    db=await new Promise((resolve,reject)=>{
      const r=indexedDB.open('flowable-task-form-working',1);
      r.onupgradeneeded=()=>r.result.createObjectStore('copies',{keyPath:'key'});
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });return db;
  }
  async function storage(mode,fn){
    const d=await database();return new Promise((resolve,reject)=>{
      const tx=d.transaction('copies',mode),r=fn(tx.objectStore('copies'));let value;
      r.onsuccess=()=>value=r.result;tx.oncomplete=()=>resolve(value);
      tx.onerror=()=>reject(tx.error??r.error);tx.onabort=()=>reject(tx.error??new Error('Task-form working copy was not saved.'));
    });
  }
  function retain(){
    if(!working)return Promise.resolve();
    const snapshot=copy(working);bounded(snapshot);
    const task=queue.catch(()=>{}).then(()=>storage('readwrite',s=>s.put({key:snapshot.workspaceId+':'+snapshot.instanceId,value:snapshot})));
    queue=task;
    task.then(()=>{if(working?.instanceId===snapshot.instanceId){storageError=null;status('Saved independent browser copy '+snapshot.instanceId+'.');}},
      error=>{if(working?.instanceId===snapshot.instanceId){storageError=error;status('Browser storage is unavailable. Download this complete working file, then continue the same request.',true);}});
    return task;
  }
  function changed(){working.updatedAt=new Date().toISOString();fileProof=null;void retain().catch(()=>{});}
  async function durable(){
    const snapshot=bounded(working);
    try{await retain();}catch(error){need(fileProof===snapshot,'Download the complete current working file before continuing while browser storage is unavailable.');}
    need(snapshot===bounded(working),'The working copy changed while it was being saved.');
  }
  function download(value,name,{proof=false}={}){
    const raw=bounded(value),url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=node('a',null,{href:url,download:name});
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    if(proof&&working&&raw===bounded(working))fileProof=raw;
    return raw;
  }
  const fresh=()=>({schema:SCHEMA,workspaceId:workspaceId(),instanceId:crypto.randomUUID(),updatedAt:new Date().toISOString(),
    captureDraft:{taskId:'',label:'Native task form',note:''},activeKey:'',drafts:[],dispatches:[]});
  async function copies(){
    const values=await storage('readonly',s=>s.getAll()),select=$('#task-native-copy-select'),old=select.value;
    select.replaceChildren(node('option','Choose an earlier browser copy',{value:''}));
    for(const row of values.filter(x=>x.value?.workspaceId===workspaceId()).sort((a,b)=>b.value.updatedAt.localeCompare(a.value.updatedAt)))
      select.append(node('option',row.value.updatedAt+' · '+row.value.instanceId,{value:row.key}));
    if([...select.options].some(o=>o.value===old))select.value=old;
  }
  async function initialize(){
    if(working?.workspaceId===workspaceId())return;
    if(working)await durable();
    working=fresh();scope=currentScope();fileProof=null;await retain().catch(()=>{});await copies().catch(()=>{});
  }
  function locked(input,yes){input.disabled=!!yes;input.dataset.pagerDisabled=String(!!yes);return input;}
  function control(label,input){const wrap=node('label',label);wrap.append(input);return wrap;}
  function option(select,value,label){select.append(node('option',label,{value}));}
  function drawCapture(){
    if(!working)return;const d=working.captureDraft,form=$('#task-native-capture-form');
    for(const name of ['taskId','label','note']){form.elements[name].value=d[name];locked(form.elements[name],!!d.request);}
    $('#task-native-capture-submit').textContent=d.request?'Read original form capture':'Capture native task form';
    $('#task-native-capture-another').hidden=!d.request;
    $('#task-native-capture-request').textContent=d.request?'Original capture request '+d.request.requestId+'.':'Capture reads the selected engine’s runtime task, original form and native state.';
  }
  function fieldHelp(p){
    const hints=['Required: '+(p.required===true?'yes':'no'),'Readable: '+(p.readable===true?'yes':'no'),'Writable: '+(p.writable===true?'yes':'no')];
    if(p.type==='long')hints.push('Signed 64-bit integer text. Preserve every digit; no browser number conversion.');
    else if(p.type==='date')hints.push('Original Java date pattern: '+(p.datePattern??'native default')+'. The engine interprets text in its own timezone; no browser date conversion.');
    else if(p.type==='boolean')hints.push('Explicit native boolean text, empty text or null. Omission remains a separate choice.');
    else if(p.type==='enum')hints.push('Select an exact native option ID. Option labels are descriptive.');
    else if(p.type!=='string')hints.push('Custom/native type: retain explicit original text. The native converter determines validity.');
    return hints.join(' · ');
  }
  function editorValue(p,f,frozen){
    let input;
    if(p.type==='boolean'||p.type==='enum'){
      input=node('select');
      const options=p.type==='boolean'?[{id:'true',name:'true'},{id:'false',name:'false'},{id:'',name:'Empty string'}]:
        (Array.isArray(p.enumValues)?p.enumValues:[]).map(x=>({id:x.id,name:(x.name??x.id)+' · '+x.id}));
      if(!options.some(x=>x.id===f.value))option(input,f.value,'Retained text: '+JSON.stringify(f.value));
      for(const v of options)option(input,v.id,v.name);
      input.value=f.value;
    }else if(p.type==='long')input=node('input',null,{type:'text',spellcheck:'false'});
    else input=node('textarea',null,{rows:p.type==='date'?'2':'3',spellcheck:'false'});
    input.value=f.value;input.dataset.formProperty=p.id;input.dataset.formControl='value';
    locked(input,frozen||f.mode!=='value');
    input.addEventListener('input',()=>{if(active()?.preparation)return;f.value=input.value;changed();drawWarnings();});
    return input;
  }
  function drawWarnings(){
    const d=active(),target=$('#task-native-warnings');target.replaceChildren();if(!d)return;
    const omitted=properties(d.original).filter(p=>p.required===true&&p.writable===true&&d.fields.find(f=>f.id===p.id)?.mode==='omit');
    if(omitted.length)target.append(node('p','Required properties omitted: '+omitted.map(p=>p.name??p.id).join(', ')+'. Native defaults may be hidden; the engine remains authoritative. Select each intended property explicitly.'));
    const count=d.fields.filter(f=>f.mode!=='omit').length;
    target.append(node('p',count+' explicitly submitted properties. Omitted properties are absent from the request. Empty text and null remain different values.'));
    target.append(node('p','Successful native form submission completes this task. Preparation saves a review; dispatch is a separate action.'));
  }
  function drawEditor(){
    const d=active(),panel=$('#task-native-editor');panel.hidden=!d;
    if(!d){$('#task-native-editing-label').textContent='Open a saved native form capture to author its submission.';return;}
    $('#task-native-editing-label').textContent='Task '+d.original.taskId+' · capture '+d.original.capture.id+' / revision '+d.original.capture.revision;
    const form=$('#task-native-submit-form'),frozen=!!d.preparation;
    for(const name of ['label','note']){form.elements[name].value=d[name];locked(form.elements[name],frozen);}
    const fields=$('#task-native-fields');fields.replaceChildren();
    for(const p of properties(d.original)){
      const section=node('section',null,{class:'task-native-property'});section.dataset.propertyId=p.id;
      section.append(node('h3',p.name??p.id),node('p','Native ID: '+p.id+' · type: '+(p.type??'unspecified')),node('p',fieldHelp(p)));
      section.append(keyValues([['Captured value',has(p,'value')?JSON.stringify(p.value):'Not supplied in native response']]));
      if(p.writable===true){
        const f=d.fields.find(x=>x.id===p.id),mode=node('select');mode.dataset.formProperty=p.id;mode.dataset.formControl='mode';
        option(mode,'omit','Omit this property');option(mode,'value','Submit exact text');option(mode,'null','Submit null');mode.value=f.mode;
        locked(mode,frozen);section.append(control('Submission choice',mode),control('Native value',editorValue(p,f,frozen)));
        mode.addEventListener('change',()=>{if(active()?.preparation)return;f.mode=mode.value;changed();drawEditor();});
      }else section.append(node('p','Read-only native property. This editor does not submit it.'));
      if(Array.isArray(p.enumValues)){
        const options=node('details');options.append(node('summary','Complete original options'));
        const list=node('dl');for(const v of p.enumValues){list.append(node('dt',v.id),node('dd',v.name??v.id));}options.append(list);section.append(options);
      }
      const metadata=node('details');metadata.append(node('summary','Complete original property metadata'),pre(p));section.append(metadata);fields.append(section);
    }
    if(!d.original.task||!d.original.form)fields.append(node('p','The captured observation has no live task or available native form. Read its complete original sources and capture the current task before preparing a submission.'));
    if(!properties(d.original).length)fields.append(node('p','This original response has no readable legacy form properties. A form key alone does not expose a modern Form Engine schema. Review the complete native form before authoring a submission.'));
    locked($('#task-native-prepare'),!frozen&&(!d.original.task||!d.original.form));
    $('#task-native-prepare').textContent=frozen?'Read original prepared submission':'Prepare native form submission';
    $('#task-native-another').hidden=!frozen;
    $('#task-native-preparation').textContent=frozen?'Frozen original request '+d.preparation.requestId+'. All fields and source identity remain retained.':'Field edits are an unfinished browser copy until prepared.';
    const outcome=$('#task-native-outcome');outcome.replaceChildren();
    if(d.result)outcome.append(node('p','Saved operation '+d.result.id+' · '+d.result.state),button('Open original submission review',()=>openRecord('taskFormOperation',d.result.id)));
    drawWarnings();drawOriginal(d);
  }
  function drawOriginal(d){
    const target=$('#task-native-original');target.replaceChildren();
    target.append(keyValues([['Capture',d.original.capture.id],['Revision',d.original.capture.revision],['Connection',d.original.connectionId],['Task',d.original.taskId],['Captured',d.original.capturedAt],['Native form status',d.original.formStatus],['Availability',d.original.availability]]));
    for(const [label,value] of [['Original runtime task',d.original.task],['Complete native form',d.original.form],['Native state at capture',d.original.nativeState],['Native form response',d.original.formObservation],['Original type guidance',d.original.description]]){
      const details=node('details');details.append(node('summary',label),pre(value));target.append(details);
    }
    for(const r of d.original.resources??[]){
      const group=node('section');group.append(node('h3',r.filename??r.path??'Original native resource'),keyValues([['Bytes',r.bytes],['SHA-256',r.sha256]]));
      const ref=r.originalResource??r.definitionRef;
      if(ref){group.append(originalLink(ref,'Download complete original',r.filename),button('Read complete original',async()=>{
        const result=await api('readSource',{reference:ref});group.append(pre(result.text??result.value??result));
      }));}else group.append(pre(r));target.append(group);
    }
    for(const source of d.original.originals??[]){const row=node('p');row.append(originalLink(source.reference,source.role,source.filename));target.append(row);}
    target.append(button('Download complete captured form JSON',async()=>download(d.original,'Flowable_Task_Form_Source.json')));
  }
  async function openCapture(id,revision){
    await initialize();const expected=identity();
    const original=await api('readTaskForm',{id,...(revision===undefined?{}:{revision})});
    need(current(expected),'The selected workspace or form changed while reading its original capture.');
    properties(original);need(original.connectionId===requireEngine(),'Select the captured form’s original engine.');
    const k=key(original);let draft=working.drafts.find(d=>d.key===k);
    if(!draft){
      draft={key:k,original,label:'Submit task form '+original.taskId,note:'',fields:properties(original).filter(p=>p.writable===true)
        .map(p=>({id:p.id,mode:'omit',value:typeof p.value==='string'?p.value:''}))};
      const candidate=copy(working);candidate.drafts.push(draft);bounded(candidate);working.drafts.push(draft);
    }else need(same(draft.original,original),'The saved capture differs from this working copy’s original source.');
    working.activeKey=k;selected=id;changed();drawEditor();$('#task-native-editor').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function drawCaptures(){
    const all=(host.engine()?forEngine(records('taskFormCapture')):[]).filter(r=>!search||[r.label,r.summary?.taskId,r.id].some(x=>String(x??'').toLocaleLowerCase().includes(search)));
    table($('#task-native-captures'),[{label:'Capture',key:'label'},{label:'Task',render:r=>node('span',r.summary?.taskId??'')},{label:'State',key:'state'},{label:'Saved',key:'updatedAt'},
      {label:'Open',render:r=>button(r.state==='CAPTURED'?'Open typed form':'Read capture',()=>r.state==='CAPTURED'?openCapture(r.id,r.revision):openRecord('taskFormCapture',r.id))}],all,{empty:'Capture an actual native task form from the selected engine.'});
    table($('#taskFormOperation-records'),[{label:'Submission review',key:'label'},{label:'State',key:'state'},{label:'Saved',key:'updatedAt'},
      {label:'Open',render:r=>button('Review',()=>openRecord('taskFormOperation',r.id))}],host.engine()?forEngine(records('taskFormOperation')):[],{empty:'Prepared submissions and their full original results appear here.'});
  }
  async function render(){
    await initialize();const next=currentScope();if(scope!==next){scope=next;generation++;selected='';}
    drawCapture();drawCaptures();drawEditor();drawDispatches();
  }
  async function adopt(value){
    const incoming=validate(value,workspaceId()),expected=identity();
    // Validate every original source before replacing any live unfinished work.
    for(const d of incoming.drafts){
      const actual=await api('readTaskForm',{id:d.original.capture.id,revision:d.original.capture.revision});
      need(current(expected),'The original scope changed while opening the working file.');
      need(same(actual,d.original),'A working draft must retain the exact original captured task form.');
    }
    for(const d of incoming.dispatches){
      const record=await api('getRecord',{kind:'taskFormOperation',id:d.operation.id,revision:d.operation.revision});
      const review=await api('readReview',{kind:'taskFormOperation',id:d.operation.id,revision:d.operation.revision});
      need(current(expected),'The original scope changed while validating retained submission requests.');
      need(record.sha256===d.operation.sha256&&same(review,d.review),'The imported submission does not match its original saved operation review.');
    }
    const prior=working;await durable();need(current(expected),'The original scope changed before opening the working copy.');
    download(prior,'Flowable_Task_Form_Before_Open.json');
    incoming.openedFrom={instanceId:incoming.instanceId,openedAt:new Date().toISOString()};
    incoming.instanceId=crypto.randomUUID();incoming.updatedAt=new Date().toISOString();
    bounded(incoming);working=incoming;fileProof=null;generation++;
    // Imported outcomes are observations. Continuation always replays the original frozen request.
    await retain().catch(()=>{});drawCapture();drawEditor();drawDispatches();await copies().catch(()=>{});
    notice('Opened all form drafts in a separate browser copy. Exact original request IDs are retained.');
  }
  function drawDispatches(){
    const target=$('#task-native-submissions');target.replaceChildren();
    for(const d of working?.dispatches??[]){
      const row=node('section',null,{class:'panel'});row.dataset.submissionId=d.operation.id;
      row.append(node('h3',d.review.label??'Original task-form submission'),
        node('p','Operation '+d.operation.id+' · original request '+d.request.requestId),
        node('p',d.outcome?'Last retained observation: '+d.outcome.state+'. Read the original result to establish current state.':'Original submission retained. Read its outcome with the same request.'),
        button('Read original submission result',async()=>{
          const expected=identity();await durable();need(current(expected),'The original working scope changed.');
          const result=await owned('dispatchTaskFormOperation',d.request);
          d.outcome={id:result.id,revision:result.revision,state:result.value.state};changed();await retain().catch(()=>{});
          if(current(expected)){await reload();await openRecord('taskFormOperation',result.id);}
        }),
        button('Open saved review',()=>openRecord('taskFormOperation',d.operation.id)));
      const original=node('details');original.append(node('summary','Complete frozen submission and original review'),pre(d));row.append(original);target.append(row);
    }
  }
  async function dispatch(record,review){
    await initialize();const expected=identity();
    need(record.kind==='taskFormOperation'&&review.record?.id===record.id,'Select the original task-form operation review.');
    let d=working.dispatches.find(x=>x.operation.id===record.id);
    if(!d){
      need(record.value.phase==='PREPARED'&&review.phase==='PREPARED','Select the prepared original form submission.');
      d={operation:{kind:record.kind,id:record.id,revision:record.revision,sha256:record.sha256},review:copy(review),
        request:{requestId:crypto.randomUUID(),id:record.id,expectedRevision:record.revision,planSha256:review.request.planSha256}};
      const candidate=copy(working);candidate.dispatches.push(d);bounded(candidate);working.dispatches.push(d);changed();
    }
    drawDispatches();await durable();need(current(expected),'The original scope changed before native submission.');
    const result=await owned('dispatchTaskFormOperation',d.request);
    d.outcome={id:result.id,revision:result.revision,state:result.value.state};changed();await retain().catch(()=>{});
    need(current(expected),'The original submission is retained in its earlier working copy; the visible scope changed.');
    return result;
  }
  $('#task-native-capture-form').addEventListener('input',event=>{
    const d=working?.captureDraft;if(!d||d.request||!['taskId','label','note'].includes(event.target.name))return;
    d[event.target.name]=event.target.value;changed();
  });
  async function owned(method,args){
    // Frozen requests use the original HTTP/model writer. A complete explicit working
    // download can back the same request when the browser cannot retain IndexedDB.
    rejections.delete(args.requestId);
    try{return await api(method,copy(args));}
    catch(error){
      if([400,409,422].includes(error.status)&&/^FLOWABLE_.*(?:INVALID|REQUIRED|UNSUPPORTED|MISMATCH|CHANGED|CONFLICT|ABSENT|UNAVAILABLE)$/.test(error.code??''))
        rejections.set(args.requestId,{method,args:copy(args),code:error.code,status:error.status,message:error.message});
      throw error;
    }
  }
  async function settledOrRejected(method,args,kind){
    const expected=identity();
    try{
      const result=await owned(method,args);
      need(current(expected),'The original scope changed while reading the request.');
      need(!['CAPTURING','PREPARING','INTERRUPTED'].includes(result.value.phase),'Continue the original incomplete request.');
      return {record:{id:result.id,revision:result.revision,state:result.value.state}};
    }catch(error){
      const rejected=rejections.get(args.requestId);
      if(!rejected||rejected.method!==method||!same(rejected.args,args))throw error;
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(args.requestId));
      const id=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,24);
      need(current(expected),'The original scope changed while checking rejected input.');
      try{await api('getRecord',{kind,id});}
      catch(readError){
        if(readError.status===404&&readError.code==='FLOWABLE_RECORD_NOT_FOUND'){
          need(current(expected),'The original scope changed before correcting input.');
          return {rejection:copy(rejected),checkedRecordId:id,checkedAt:new Date().toISOString()};
        }
        throw readError;
      }
      throw new Error('The original request has a saved record. Read and continue that record before authoring another request.');
    }
  }
  async function capture(){
    await initialize();const d=working.captureDraft,expected=identity();
    if(!d.request){need(d.taskId.length>0,'Supply the exact native task ID.');d.request={requestId:crypto.randomUUID(),connectionId:requireEngine(),taskId:d.taskId,label:d.label,note:d.note};changed();}
    need(d.request.connectionId===requireEngine(),'Select the original capture request’s engine.');drawCapture();await durable();need(current(expected),'The original form capture scope changed.');
    const result=await owned('captureTaskForm',d.request);
    d.result={id:result.id,revision:result.revision,state:result.value.state};changed();await retain().catch(()=>{});
    if(!current(expected))return;
    await reload();
    if(result.value.state==='CAPTURED')await openCapture(result.id,result.revision);else await openRecord('taskFormCapture',result.id);
    notice('Native task-form capture: '+result.value.state+'.');
  }
  $('#task-native-capture-form').addEventListener('submit',event=>{event.preventDefault();void busy('Capture original native task form',capture);});
  $('#task-native-capture-another').addEventListener('click',()=>busy('Keep original capture and author another',async()=>{
    const d=working.captureDraft;need(d.request,'Read the original capture first.');
    await durable();const resolution=await settledOrRejected('captureTaskForm',d.request,'taskFormCapture');
    d.resolution=resolution;
    await durable();const prior=copy(working);download(prior,'Flowable_Task_Form_Prior_Capture.json');working=copy(prior);working.instanceId=crypto.randomUUID();
    working.openedFrom={instanceId:prior.instanceId,openedAt:new Date().toISOString()};
    delete working.captureDraft.request;delete working.captureDraft.result;fileProof=null;generation++;changed();drawCapture();await copies().catch(()=>{});
  }));
  $('#task-native-submit-form').addEventListener('input',event=>{
    const d=active();if(!d||d.preparation||!['label','note'].includes(event.target.name))return;d[event.target.name]=event.target.value;changed();
  });
  $('#task-native-submit-form').addEventListener('submit',event=>{
    event.preventDefault();void busy('Prepare exact native task-form submission',async()=>{
      const d=active();need(d,'Open an actual captured form.');const expected=identity();
      need(d.original.connectionId===requireEngine(),'Select this captured form’s original engine.');
      if(!d.preparation){d.preparation={requestId:crypto.randomUUID(),connectionId:d.original.connectionId,captureId:d.original.capture.id,
        captureRevision:d.original.capture.revision,selection:selection(d),label:d.label,note:d.note};changed();}
      drawEditor();await durable();need(current(expected),'The selected source changed before preparation.');
      const result=await owned('prepareTaskFormOperation',d.preparation);
      d.result={id:result.id,revision:result.revision,state:result.value.state};changed();await retain().catch(()=>{});
      if(!current(expected))return;await reload();await openRecord('taskFormOperation',result.id);
      notice('Native form submission review: '+result.value.state+'. Review the exact body and original state before separate dispatch.');
    });
  });
  $('#task-native-another').addEventListener('click',()=>busy('Preserve original and author another submission review',async()=>{
    const d=active();need(d?.preparation,'Read the original preparation first.');const expected=identity();
    await durable();const resolution=await settledOrRejected('prepareTaskFormOperation',d.preparation,'taskFormOperation');
    need(current(expected),'The original source changed.');d.resolution=resolution;
    await durable();const prior=copy(working);download(prior,'Flowable_Task_Form_Prior_Review.json');working=copy(prior);working.instanceId=crypto.randomUUID();
    working.openedFrom={instanceId:prior.instanceId,openedAt:new Date().toISOString()};delete active().preparation;delete active().result;
    fileProof=null;generation++;changed();drawEditor();await copies().catch(()=>{});
  }));
  $('#task-native-working-download').addEventListener('click',()=>{if(working){download(working,'Flowable_Task_Form_Working.json',{proof:true});status('Complete current working file requested for download. Retain the file with its original request IDs.');}});
  $('#task-native-working-file').addEventListener('change',event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    void busy('Open complete task-form working file',async()=>{need(file.size<=MAX,'Open a complete working file within 32 MiB.');const expected=identity(),raw=await file.text();
      need(current(expected),'The original scope changed while reading the file.');await adopt(JSON.parse(raw));});
  });
  $('#task-native-copies-refresh').addEventListener('click',()=>busy('Read saved browser copies',copies));
  $('#task-native-copy-open').addEventListener('click',()=>busy('Open earlier form working copy',async()=>{
    const key=$('#task-native-copy-select').value;need(key,'Choose an earlier browser copy.');const expected=identity(),row=await storage('readonly',s=>s.get(key));
    need(current(expected)&&row,'The selected browser copy or workspace changed.');await adopt(row.value);
  }));
  $('#task-native-search').addEventListener('input',event=>{search=event.target.value.toLocaleLowerCase();drawCaptures();});
  window.addEventListener('beforeunload',event=>{if(storageError&&working&&fileProof!==bounded(working)){event.preventDefault();event.returnValue='';}});
  return {render,openCapture,dispatch,working:()=>working?copy(working):null,
    async selectTask(taskId){await initialize();const d=working.captureDraft;
      if(d.request||d.taskId&&d.taskId!==taskId){await durable();const prior=copy(working);download(prior,'Flowable_Task_Form_Before_Task.json');
        working=copy(prior);working.instanceId=crypto.randomUUID();working.openedFrom={instanceId:prior.instanceId,openedAt:new Date().toISOString()};
        working.captureDraft={taskId,label:'Native task form '+taskId,note:''};fileProof=null;generation++;
      }else d.taskId=taskId;changed();drawCapture();$('#task-native-capture-form').scrollIntoView({behavior:'smooth',block:'start'});
    },
    async reuse(review){notice('Open the original captured form and keep the previous review before authoring another submission.');$('#task-native-editor').scrollIntoView();},
  };
}
