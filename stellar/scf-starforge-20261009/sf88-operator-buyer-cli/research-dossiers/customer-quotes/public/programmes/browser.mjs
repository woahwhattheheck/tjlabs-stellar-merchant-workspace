// MIT. Complete programmes retain original jobs, full working forms and original package selections.
const $=id=>document.getElementById(id),uuid=()=>crypto.randomUUID(),clone=value=>structuredClone(value),
 now=()=>new Date().toISOString(),BASE='/api/customer-quote-programmes',MAX_RESPONSE=256*1024*1024;
const tokenKey='research-dossiers-session:'+location.origin,fragment=new URLSearchParams(location.hash.slice(1));
const state={token:fragment.get('token')??sessionStorage.getItem(tokenKey)??'',workspaceId:null,instanceId:null,
 info:null,tab:'programmes',programmeId:null,jobId:null,bundleId:null,form:null,serial:0,offset:0};
const pending=new Set(),failures=new Map(),working=new Map(),active=new Map();
let database,connecting=false,admitted=0,selectedUpload=null,uiQueue=Promise.resolve();
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const pretty=value=>JSON.stringify(value,null,2);
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?
 Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const sha=async body=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(n=>n.toString(16).padStart(2,'0')).join('');
const digest=value=>sha(new TextEncoder().encode(JSON.stringify(stable(value))));
const scope=()=>state.workspaceId+':';
const message=(text,error=false)=>{$('message').textContent=text;$('message').className=error?'error':'';};
function params(value){const query=new URLSearchParams();for(const [key,item]of Object.entries(value??{}))
 if(item!==undefined&&item!==null&&item!=='')query.set(key,String(item));return query.size?'?'+query.toString():'';}
function db(){return database??=new Promise((resolve,reject)=>{
 const request=indexedDB.open('research-quotation-programmes-v1',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('records',{keyPath:'key'});
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
async function transaction(mode,work){
 const connection=await db();return new Promise((resolve,reject)=>{
  const tx=connection.transaction('records',mode),store=tx.objectStore('records');let result;
  tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('Local save interrupted.'));
  work(store,value=>{result=value;});
 });
}
const get=key=>transaction('readonly',(store,set)=>{const request=store.get(key);request.onsuccess=()=>set(request.result);});
const put=value=>transaction('readwrite',store=>store.put(value));
const rows=prefix=>transaction('readonly',(store,set)=>{
 const values=[],request=store.openCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));
 request.onsuccess=()=>{const cursor=request.result;if(cursor){values.push(cursor.value);cursor.continue();}else set(values);};
});
function retain(value){
 const selected=clone(value),task=put(selected).then(()=>failures.delete(selected.key),error=>{
  failures.set(selected.key,error);message('This complete working form could not be saved locally. Export it before leaving. '+error.message,true);
 });pending.add(task);task.finally(()=>pending.delete(task));return task;
}
async function flush(){await Promise.all([...pending]);if(failures.size)throw failures.values().next().value;}
function edit(key,value){
 need(state.form,'Open a complete working form.');state.form.data[key]=clone(value);state.form.updatedAt=now();retain(state.form);
}
function selection(){return {key:'selection:'+scope(),tab:state.tab,programmeId:state.programmeId,jobId:state.jobId,
 bundleId:state.bundleId,formKey:state.form?.key??null,offset:state.offset};}
function headers(body,extra={}){
 return {Authorization:'Bearer '+state.token,...(state.workspaceId?{'X-Research-Workspace-Id':state.workspaceId}:{}),
  ...(state.instanceId?{'X-Research-Instance-Id':state.instanceId}:{}),
  ...(body===undefined?{}:{'Content-Type':'application/json'}),...extra};
}
async function api(path,{body,method,extraHeaders,signal}={}){
 const response=await fetch(path,{method:method??(body===undefined?'GET':'POST'),redirect:'error',
  signal:signal??AbortSignal.timeout(900000),headers:headers(body,extraHeaders),
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 const chunks=[];let length=0;
 for await(const chunk of response.body){length+=chunk.length;need(length<=MAX_RESPONSE,'The complete native response is too large.');chunks.push(chunk);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let result;try{result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch{throw Object.assign(new Error('The original listener returned an incomplete response.'),{outcomeUnknown:body!==undefined});}
 if(!response.ok)throw Object.assign(new Error(result.error??'The original operation failed.'),result,
  {status:response.status,outcomeUnknown:result.outcomeUnknown??(body!==undefined&&response.status>=500)});
 return result;
}
async function allPages(path,query={}){
 const items=[];let offset=0,snapshot,revision=query.revision;
 for(;;){
  const page=await api(path+params({...query,offset,limit:100,snapshot,revision}));
  need(Array.isArray(page.items)&&page.offset===offset,'The original page changed.');
  items.push(...page.items);need(items.length<=100000,'The original collection exceeds its reader limit.');
  snapshot=page.snapshot??snapshot;revision=page.revision??revision;
  if(page.nextOffset===null)return {items,snapshot,revision};
  need(page.nextOffset>offset,'The original page did not advance.');offset=page.nextOffset;
 }
}
const customer=(dossierId,section,query={})=>allPages('/api/dossiers/'+encodeURIComponent(dossierId)+'/customer-updates',{section,...query});
function act(work){
 const task=uiQueue.catch(()=>{}).then(async()=>{admitted++;$('activity').textContent='Processing the selected original operation…';
  try{return await work();}catch(error){message(error.message??String(error),true);}
  finally{admitted--;$('activity').textContent=admitted?'Processing the selected original operation…':'';}
 });uiQueue=task;return task;
}
function node(tag,text,attributes={}){
 const item=document.createElement(tag);if(text!==undefined&&text!==null)item.textContent=String(text);
 for(const [key,value]of Object.entries(attributes))if(value!==undefined&&value!==null)item.setAttribute(key,String(value));return item;
}
function button(label,work,{disabled=false,primary=false}={}){
 const item=node('button',label,{type:'button',...(primary?{class:'primary'}:{})});item.disabled=disabled;
 item.addEventListener('click',()=>act(work));return item;
}
function section(parent,title){
 const item=node('section',null,{class:'panel'});if(title)item.append(node('h2',title));parent.append(item);return item;
}
function bar(parent){const item=node('div',null,{class:'toolbar'});parent.append(item);return item;}
function details(parent,label,value){
 const item=node('details');item.append(node('summary',label));let opened=false;
 item.addEventListener('toggle',()=>{if(item.open&&!opened){item.append(node('pre',pretty(value)));opened=true;}});
 parent.append(item);return item;
}
function describe(parent,value){
 const item=node('dl');for(const [name,content]of Object.entries(value))if(content!==undefined&&content!==null)
  item.append(node('dt',name),node('dd',typeof content==='object'?pretty(content):content));parent.append(item);
}
function field(parent,label,value,{type='text',kind='input',choices=[],change,readOnly=false}={}){
 const row=node('div'),key='field-'+uuid();
 const actual=document.createElement(kind);actual.id=key;if(kind==='input')actual.type=type;
 if(kind==='textarea')actual.rows=8;
 if(kind==='select')for(const choice of choices)actual.append(node('option',choice.label,{value:choice.value}));
 actual.value=value??'';actual.readOnly=readOnly;row.append(node('label',label,{for:key}),actual);parent.append(row);
 if(change)actual.addEventListener(kind==='select'?'change':'input',()=>act(()=>change(actual.value)));
 return actual;
}
function grid(parent){const item=node('div',null,{class:'grid'});parent.append(item);return item;}
function link(parent,label,path){const item=node('a',label,{href:path});parent.append(item);return item;}
function table(parent,headings){
 const item=node('table'),head=node('thead'),row=node('tr');headings.forEach(value=>row.append(node('th',value)));
 head.append(row);const body=node('tbody');item.append(head,body);parent.append(item);return body;
}
function downloadBlob(blob,name){
 const url=URL.createObjectURL(blob),anchor=node('a',null,{href:url,download:name});anchor.click();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function saveJSON(value,name){downloadBlob(new Blob([pretty(value)+'\n'],{type:'application/json'}),name);}
async function newForm(kind,data={}){
 await flush();const record={key:'form:'+scope()+uuid(),schema:'sf88-research-quotation-programme-form/v1',
  workspaceId:state.workspaceId,kind,data:clone(data),createdAt:now(),updatedAt:now()};
 await put(record);return record;
}
async function go(tab,{programmeId=null,jobId=null,bundleId=null,form=null,offset=0}={}){
 await flush();Object.assign(state,{tab,programmeId,jobId,bundleId,form,offset});await put(selection());await render();
}
function formBar(parent,form){
 describe(parent,{'Working form':form.kind,'Saved':form.updatedAt});
 bar(parent).append(button('Export complete working form',async()=>{await flush();saveJSON(form,'research-programme-working-form.json');}),
  button('Copy as a new request',async()=>{
   await flush();const data=clone(form.data);data.jobId=uuid();
   if(form.kind==='CREATE'){data.id=uuid();if(data.caseMode==='CREATE')data.caseId=uuid();}
   const copied=await newForm(form.kind,data);await openWorking(copied);
  }));
}
async function submit(input){
 need(!connecting&&state.workspaceId,'Wait for the original workspace to open.');await flush();
 const selected=clone(input),key='request:'+scope()+selected.id,requestSha256=await digest(selected);
 if(active.has(key))return active.get(key);
 const work=(async()=>{
  const old=await get(key);if(old)need(old.workspaceId===state.workspaceId&&old.requestSha256===requestSha256&&same(old.input,selected),
   'This saved job belongs to another complete input.');
  let record=old??{key,schema:'sf88-research-quotation-programme-browser-request/v1',workspaceId:state.workspaceId,
   input:selected,requestSha256,createdAt:now(),status:'PENDING',firstResult:null};
  record={...record,status:'PENDING',lastAttempt:now()};await put(record);
  let result;try{result=await api(BASE+'/jobs'+(selected.kind==='SUBMIT'&&selected.command==='prepare-case-transfer'?'/case-transfer':''),{body:selected});}
  catch(error){try{await put({...record,error:{message:error.message,outcomeUnknown:error.outcomeUnknown!==false}});}catch(saveError){error.localSaveError=saveError.message;}throw error;}
  need(result.id===selected.id,'The original job identity changed.');
  await put({...record,status:result.status,firstResult:record.firstResult??result,lastResult:result,error:null});
  return result;
 })();active.set(key,work);try{return await work;}finally{active.delete(key);}
}
async function submitAndOpen(input){const job=await submit(input);await go('job',{jobId:job.id});}

async function programmeLibrary(parent){
 const panel=section(parent,'Customer programmes'),page=await api(BASE+'/jobs'+params({kind:'CREATE',offset:state.offset,limit:20}));
 const body=table(panel,['Programme','Created','Operation','Open']);
 for(const item of page.items){
  const row=node('tr'),actions=node('td',null,{class:'actions'});
  row.append(node('td',item.summary?.programmeName??'Programme being retained'),node('td',item.createdAt),node('td',item.status));
  if(item.status==='COMPLETE')actions.append(button('Open programme',()=>go('programme',{programmeId:item.summary.programmeId})));
  actions.append(button('Original operation',()=>go('job',{jobId:item.id})));row.append(actions);body.append(row);
 }
 if(!page.items.length)panel.append(node('p','No programmes have been created on this page.'));
 bar(panel).append(button('Previous',()=>go('programmes',{offset:Math.max(0,state.offset-20)}),{disabled:state.offset===0}),
  button('Next',()=>go('programmes',{offset:page.nextOffset}),{disabled:page.nextOffset===null}),
  button('New programme',()=>go('create'),{primary:true}));
}
async function createProgramme(parent,ticket){
 if(!state.form){
  state.form=await newForm('CREATE',{jobId:uuid(),schema:'sf88-research-quotation-programme/v1',id:uuid(),name:'',
   dossierId:'',revision:null,projectId:'',caseId:'',caseMode:'EXISTING'});
  await put(selection());
 }
 const form=state.form,data=form.data,panel=section(parent,'Start a complete customer programme');
 formBar(panel,form);field(panel,'Programme name',data.name,{change:value=>edit('name',value)});
 const dossiers=await allPages('/api/dossiers');if(ticket!==state.serial)return;
 const inputs=grid(panel);
 field(inputs,'Saved Research dossier',data.dossierId,{kind:'select',
  choices:[{value:'',label:'Select the original dossier'},...dossiers.items.map(row=>({value:row.id,label:row.title??row.id}))],
  change:async value=>{edit('dossierId',value);edit('revision',null);edit('projectId','');await render();}});
 if(data.dossierId){
  const projects=await customer(data.dossierId,'projects',data.revision===null?{}:{revision:data.revision});
  if(ticket!==state.serial)return;
  if(data.revision===null)edit('revision',projects.revision);
  field(inputs,'Commissioned customer project',data.projectId,{kind:'select',
   choices:[{value:'',label:'Select the original customer project'},...projects.items.map(row=>({value:row.id,label:row.name+' · '+row.customer.name}))],
   change:value=>edit('projectId',value)});
  describe(panel,{'Selected Research edition':data.revision});
  bar(panel).append(button('Use current Research edition',async()=>{edit('revision',null);await render();}));
 }
 field(inputs,'Commercial case',data.caseMode,{kind:'select',choices:[
  {value:'EXISTING',label:'Use an existing case'},{value:'CREATE',label:'Create the case within this programme'}],
  change:async value=>{edit('caseMode',value);edit('caseId',value==='CREATE'?uuid():'');await render();}});
 if(data.caseMode==='EXISTING'){
  const cases=await api('/api/customer-quotes/cases?offset=0&limit=100');if(ticket!==state.serial)return;
  field(inputs,'Existing case',data.caseId,{kind:'select',choices:[{value:'',label:'Select the original commercial case'},
   ...cases.result.cases.map(row=>({value:row.id,label:row.name+' · '+row.metadata.status}))],change:value=>edit('caseId',value)});
  field(inputs,'Case from another library page',data.caseId,{change:value=>edit('caseId',value)});
 }else panel.append(node('p','The programme retains its selected customer project first. Use its original quotation form to create and edit this case.'));
 bar(panel).append(button('Retain and open programme',async()=>{
  await flush();need(data.name.trim()&&data.dossierId&&Number.isSafeInteger(data.revision)&&data.projectId&&data.caseId,
   'Choose the original dossier, customer project and commercial case.');
  const {jobId,...value}=clone(data);await submitAndOpen({id:jobId,kind:'CREATE',value});
 },{primary:true}));
}
async function programmePanel(parent,ticket){
 const value=await api(BASE+'/programmes/'+state.programmeId);if(ticket!==state.serial)return;
 const programme=value.programme.input,panel=section(parent,programme.name);
 describe(panel,{'Customer project':programme.projectId,'Dossier':programme.dossierId,'Selected Research edition':programme.revision,
  'Commercial case':programme.caseId,'Saved steps':value.steps.length});
 const actions=bar(panel);
 link(actions,'Open the original quotation forms','/customer-quotes.html'+params({programme:programme.id}));
 link(actions,'Open customer research and delivery','/customer-updates.html'+params({dossier:programme.dossierId}));
 actions.append(button('Prepare complete handover',async()=>{
  const form=await newForm('EXPORT',{jobId:uuid(),programmeId:programme.id,caseRevision:'',deliveryId:'',
   revision:null,stepIds:null,sourceWorkspace:null});await go('export',{programmeId:programme.id,form});
 }),button('Refresh saved steps',()=>render()));
 const body=table(panel,['Saved step','Native operation','Status','Actions']);
 for(const item of value.steps){
  const row=node('tr'),controls=node('td',null,{class:'actions'});
  row.append(node('td',item.stepId),node('td',item.command+(item.kind?' · '+item.kind:'')),node('td',item.nativeState??item.status));
  controls.append(button('Open saved step',()=>showStep(parent,programme.id,item.stepId)));
  row.append(controls);body.append(row);
 }
 if(!value.steps.length)panel.append(node('p','Open the original quotation forms to prepare the case, quote, customer response and paid delivery. Each request returns here as its original saved step.'));
 const advanced=section(parent,'Receive an original step input');
 advanced.append(node('p','A complete JSON request from the installed terminal or another original operator can continue the same programme here.'));
 let command='prepare',input=null;
 field(advanced,'Original native command',command,{kind:'select',choices:[
  'create-case','native-case','pricing','prepare','apply','prepare-response','prepare-publication','enroll-publication',
  'prepare-report','prepare-case-transfer','apply-case-transfer'].map(value=>({value,label:value})),change:value=>{command=value;}});
 let action='',profile='';const original=grid(advanced);
 field(original,'Native case or pricing action',action,{change:value=>{action=value;}});
 field(original,'Pricing profile',profile,{change:value=>{profile=value;}});
 const file=field(advanced,'Complete original request file','',{type:'file'});file.accept='application/json,.json';
 file.addEventListener('change',()=>{input=file.files?.[0]??null;});
 bar(advanced).append(button('Retain complete input as a step',async()=>{
  need(input,'Select the complete original JSON request.');const maximum=command==='prepare-case-transfer'?state.info.caseInputLimit:state.info.inputLimit;
  need(input.size<=maximum,'The original input exceeds this native command’s limit.');
  const body=JSON.parse(await input.text()),job={id:uuid(),kind:'SUBMIT',programmeId:programme.id,
   stepId:'import-'+uuid(),command,value:body,...(action?{action}:{}),...(profile?{profile}:{})};
  await submitAndOpen(job);
 }));
 details(panel,'Original programme identity and source',value.programme);
}
async function showStep(parent,programmeId,stepId){
 const value=await api(BASE+'/programmes/'+programmeId+'/steps/'+encodeURIComponent(stepId)),
  panel=section(parent,'Original saved step '+stepId);
 describe(panel,{'Command':value.summary.command,'Status':value.summary.nativeState??value.summary.status,'Original request':value.summary.requestId});
 details(panel,'Complete native result',value.native?.result??value.native);details(panel,'Original step selection',value.record);
 const actions=bar(panel),next=value.summary.next;
 if(next)actions.append(button('Apply this exact reviewed selection',async()=>{
  await submitAndOpen({id:uuid(),kind:'APPLY',programmeId,sourceStepId:stepId,stepId:'apply-'+uuid(),
   reviewSha256:next.input.reviewSha256});
 },{primary:true}));
 actions.append(button('Replay the exact original request in a new step',async()=>{
  await submitAndOpen({id:uuid(),kind:'REPLAY',programmeId,sourceStepId:stepId,stepId:'replay-'+uuid()});
 }));
 panel.scrollIntoView({block:'start',behavior:'smooth'});
}
async function exportPanel(parent,ticket){
 const form=state.form;need(form?.kind==='EXPORT','Open the programme and prepare its handover.');const data=form.data;
 const value=await api(BASE+'/programmes/'+data.programmeId);if(ticket!==state.serial)return;
 const programme=value.programme.input,panel=section(parent,'Deliver '+programme.name),inputs=grid(panel);formBar(panel,form);
 const currentCase=await api('/api/customer-quotes/cases/'+programme.caseId);if(ticket!==state.serial)return;
 if(!data.caseRevision)edit('caseRevision',currentCase.result.revision);
 field(inputs,'Selected saved case revision',data.caseRevision,{readOnly:true});
 bar(panel).append(button('Use current saved case',async()=>{edit('caseRevision','');await render();}));
 const deliveries=await customer(programme.dossierId,'deliveries',data.revision===null?{projectId:programme.projectId}:
  {projectId:programme.projectId,revision:data.revision});if(ticket!==state.serial)return;
 if(data.revision===null)edit('revision',deliveries.revision);
 field(inputs,'Frozen customer delivery',data.deliveryId,{kind:'select',choices:[{value:'',label:'Select the complete customer delivery'},
  ...deliveries.items.map(row=>({value:row.id,label:(row.title??row.id)+' · '+(row.createdAt??'')}))],
  change:value=>edit('deliveryId',value)});
 describe(panel,{'Selected customer edition':data.revision,'Completed original steps':value.steps.filter(row=>row.status==='COMPLETE').length});
 const choose=section(parent,'Included steps');
 choose.append(node('p','All completed original steps are selected on the first export. A specific selection can be retained below.'));
 let selected=data.stepIds===null?null:new Set(data.stepIds);
 const all=node('input',null,{type:'checkbox'});all.checked=selected===null;
 const allRow=node('div',null,{class:'inline-check'});allRow.append(all,node('span','Include every completed step'));choose.append(allRow);
 all.addEventListener('change',()=>act(async()=>{edit('stepIds',all.checked?null:[]);await render();}));
 if(selected!==null)for(const row of value.steps.filter(item=>item.status==='COMPLETE')){
  const input=node('input',null,{type:'checkbox'});input.checked=selected.has(row.stepId);
  const line=node('div',null,{class:'inline-check'});line.append(input,node('span',row.stepId+' · '+row.command));choose.append(line);
  input.addEventListener('change',()=>{input.checked?selected.add(row.stepId):selected.delete(row.stepId);edit('stepIds',[...selected]);});
 }
 const source=section(parent,'Optional original literature workspace');
 const include=node('input',null,{type:'checkbox'});include.checked=data.sourceWorkspace!==null;
 const row=node('div',null,{class:'inline-check'});row.append(include,node('span','Include the registered original literature workspace'));source.append(row);
 include.addEventListener('change',()=>act(async()=>{
  edit('sourceWorkspace',include.checked?{library:'original',actor:'',requestId:'programme-'+uuid()}:null);await render();
 }));
 if(data.sourceWorkspace){
  const fields=grid(source);
  field(fields,'Registered library',data.sourceWorkspace.library,{change:value=>edit('sourceWorkspace',{...data.sourceWorkspace,library:value})});
  field(fields,'Receiving operator',data.sourceWorkspace.actor,{change:value=>edit('sourceWorkspace',{...data.sourceWorkspace,actor:value})});
 }
 bar(panel).append(button('Retain complete handover',async()=>{
  await flush();need(data.deliveryId&&data.caseRevision&&Number.isSafeInteger(data.revision),'Select the original saved case and frozen delivery.');
  need(data.stepIds===null||data.stepIds.length>0,'Select at least one completed original step.');
  const value={schema:'sf88-research-quotation-handover-request/v1',requestId:data.jobId,caseRevision:data.caseRevision,
   deliveryId:data.deliveryId,revision:data.revision,sourceWorkspace:clone(data.sourceWorkspace),stepIds:clone(data.stepIds)};
  await submitAndOpen({id:data.jobId,kind:'EXPORT',programmeId:data.programmeId,value});
 },{primary:true}));
 panel.append(node('p','This captures the original case, saved inputs and quote files, the complete editable dossier and frozen reports, and the selected publication and paid archive. The same saved handover can be reopened after later customer work.'));
}

async function jobsPanel(parent){
 const panel=section(parent,'Original operations'),page=await api(BASE+'/jobs'+params({offset:state.offset,limit:20})),
 body=table(panel,['Operation','Status','Retained','Open']);
 for(const item of page.items){
  const row=node('tr'),actions=node('td',null,{class:'actions'});
  row.append(node('td',item.kind+(item.summary?.programmeName?' · '+item.summary.programmeName:'')),
   node('td',item.status),node('td',item.createdAt));
  actions.append(button('Open original operation',()=>go('job',{jobId:item.id})));row.append(actions);body.append(row);
 }
 if(!page.items.length)panel.append(node('p','No original operations on this page.'));
 bar(panel).append(button('Previous',()=>go('jobs',{offset:Math.max(0,state.offset-20)}),{disabled:state.offset===0}),
  button('Next',()=>go('jobs',{offset:page.nextOffset}),{disabled:page.nextOffset===null}),button('Refresh',()=>render()));
}
async function jobPanel(parent,ticket){
 const job=await api(BASE+'/jobs/'+state.jobId);if(ticket!==state.serial)return;
 const panel=section(parent,job.request.kind+' · '+job.status);
 describe(panel,{'Original operation':job.id,'Created':job.createdAt,'Attempts':job.attempts,
  'Programme':job.summary?.programmeName??job.summary?.programmeId,'Native state':job.summary?.nativeState});
 if(job.error)panel.append(node('p',job.error.message??job.error.code,{class:'error'}));
 details(panel,'Exact original job selection',job.request);
 const actions=bar(panel);
 actions.append(button('Refresh original operation',()=>render()));
 if(job.status!=='COMPLETE')actions.append(button('Continue the same retained operation',async()=>{
  await api(BASE+'/jobs/'+job.id+'/resume',{body:{}});await render();
 },{primary:job.status!=='RUNNING',disabled:job.status==='RUNNING'}));
 if(job.request.bundleId)actions.append(button('Open selected complete source package',()=>go('bundle',{bundleId:job.request.bundleId})));
 if(job.request.receivingId)actions.append(button('Open original receiving review',()=>go('job',{jobId:job.request.receivingId})));
 actions.append(button('Download complete original request',()=>downloadMember(job.id,'job-input.json',{job:true})));
 if(job.status==='RUNNING'){
  panel.append(node('p','This original operation continues in the native application. Its request is saved and can be reopened from Operations.'));
  setTimeout(()=>{if(state.serial===ticket&&state.jobId===job.id)act(render);},2000);return;
 }
 if(job.status!=='COMPLETE')return;
 const summary=job.summary;
 if(summary.programmeId&&!['IMPORT','ARCHIVE','RECEIVE_REVIEW','RECEIVE'].includes(job.request.kind))actions.append(button('Open programme',()=>go('programme',{programmeId:summary.programmeId})));
 if(['EXPORT','IMPORT'].includes(job.request.kind))actions.append(button('Open complete package',()=>go('bundle',{bundleId:job.id}),{primary:true}));
 if(job.request.kind==='ARCHIVE')actions.append(button('Download complete archive',()=>downloadArchive(job.id),{primary:true}),
  button('Save archive information',async()=>saveJSON(await api(BASE+'/archives/'+job.id+'?metadata=true'),'research-programme-archive.json')));
 actions.append(button('Download full native result',()=>downloadMember(job.id,'result.json',{job:true})));
 const value=await api(BASE+'/jobs/'+job.id+'?result=true');if(ticket!==state.serial)return;
 if(job.request.kind==='RECEIVE_REVIEW'){
  const result=value.result,review=result.review;
  need(review?.reviewSha256,'The original receiving review is incomplete.');
  const reviewPanel=section(parent,'Review the destination save');
  describe(reviewPanel,{'Source case':review.source.caseId,'Source case edition':review.source.caseRevision,
   'Destination Research workspace':review.workspaceId,'Destination case workspace':review.casesWorkspaceId,
   'Customer project':review.source.projectId,'Frozen delivery':review.source.deliveryId,
   'Full package files':result.source.files.length,'Review':review.reviewSha256});
  details(reviewPanel,'Complete original case transfer review',review.caseTransfer.operation.review);
  details(reviewPanel,'Full receiving selection',review);
  bar(reviewPanel).append(button('Receive this exact reviewed programme',()=>submitAndOpen({
   id:uuid(),kind:'RECEIVE',receivingId:job.id,reviewSha256:review.reviewSha256}),{primary:true}));
 }else if(job.request.kind==='RECEIVE'){
  const result=value.result,panel=section(parent,'Programme received');
  describe(panel,result.destination);details(panel,'Original receiving result',result);
  link(bar(panel),'Continue the received customer research','/customer-updates.html'+params({dossier:result.destination.dossierId}));
  link(bar(panel),'Continue the original commercial case','/customer-quotes.html');
 }else details(panel,'Complete original native result',value.result);
}
async function bundlePanel(parent,ticket){
 const bundleId=state.bundleId,page=await api(BASE+'/bundles/'+bundleId+'/files'+params({offset:state.offset,limit:20}));
 if(ticket!==state.serial)return;
 const selected=page.selection,panel=section(parent,'Complete customer programme package');
 describe(panel,{'Programme':selected.programmeId,'Source Research workspace':selected.workspaceId,
  'Case':selected.caseId,'Case edition':selected.caseRevision,'Customer project':selected.projectId,
  'Frozen delivery':selected.deliveryId,'Research edition':selected.revision,'Complete files':page.total,
  'Original manifest':page.manifestSha256});
 const actions=bar(panel);
 actions.append(button('Prepare destination receiving',async()=>{
  const form=await newForm('RECEIVE_REVIEW',{jobId:uuid(),bundleId,manifestSha256:page.manifestSha256,
   source:clone(selected),expectedRevision:null,sourceActor:null});
  await go('receive',{bundleId,form});
 },{primary:true}),button('Prepare complete downloadable archive',()=>submitAndOpen({
  id:uuid(),kind:'ARCHIVE',bundleId,manifestSha256:page.manifestSha256})),
  button('Download original manifest',()=>downloadMember(bundleId,'quotation-programme.json')));
 const body=table(panel,['Original file','Bytes','Complete SHA256','Download']);
 for(const item of page.items){
  const row=node('tr'),control=node('td');
  row.append(node('td',item.name),node('td',item.bytes),node('td',item.sha256));
  control.append(button('Download file',()=>downloadMember(bundleId,item.name)));row.append(control);body.append(row);
 }
 bar(panel).append(button('Previous',()=>go('bundle',{bundleId,offset:Math.max(0,state.offset-20)}),{disabled:state.offset===0}),
  button('Next',()=>go('bundle',{bundleId,offset:page.nextOffset}),{disabled:page.nextOffset===null}));
 details(panel,'Original programme selection',selected);
}
async function receivePanel(parent,ticket){
 const form=state.form;need(form?.kind==='RECEIVE_REVIEW','Open a complete package and prepare its receiving.');
 const data=form.data,panel=section(parent,'Receive the complete customer programme');formBar(panel,form);
 describe(panel,{'Original case':data.source.caseId,'Original customer project':data.source.projectId,
  'Original dossier':data.source.dossierId,'Destination workspace':state.workspaceId,
  'Destination case workspace':state.info.configuration.cases.workspaceId});
 let target=null;
 try{target=(await api('/api/customer-quotes/cases/'+data.source.caseId)).result;}
 catch(error){if(error.status!==404&&!/NOT_FOUND|MISSING|ENOENT/.test(error.message))throw error;}
 if(ticket!==state.serial)return;
 if(target){
  panel.append(node('p','This original case already exists here. Select its current saved edition to merge the incoming native histories.'));
  describe(panel,{'Local case':target.case?.name??target.name,'Current local revision':target.revision});
  bar(panel).append(button('Use this current destination revision',async()=>{edit('expectedRevision',target.revision);await render();}));
 }else{
  panel.append(node('p','The destination will create this original case and receive the complete editable dossier through their existing writers.'));
  if(data.expectedRevision!==null)bar(panel).append(button('Select creation of this original local case',async()=>{edit('expectedRevision',null);await render();}));
 }
 field(panel,'Selected destination case revision',data.expectedRevision??'',{readOnly:true});
 field(panel,'Operator for an included literature workspace',data.sourceActor??'',{change:value=>edit('sourceActor',value.trim()||null)});
 bar(panel).append(button('Prepare the complete receiving review',async()=>{
  await flush();need(!target||data.expectedRevision===target.revision,'Select the current original destination case revision.');
  const value={schema:'sf88-research-quotation-programme-receiving/v1',requestId:data.jobId,
   expectedWorkspaceId:state.workspaceId,expectedCasesWorkspaceId:state.info.configuration.cases.workspaceId,
   expectedRevision:data.expectedRevision,sourceActor:data.sourceActor};
  await submitAndOpen({id:data.jobId,kind:'RECEIVE_REVIEW',bundleId:data.bundleId,manifestSha256:data.manifestSha256,value});
 },{primary:true}));
 details(panel,'Complete source selection',data.source);
}
async function downloadMember(key,name,{job=false}={}){
 const route=BASE+'/'+(job?'jobs':'bundles')+'/'+key+'/files',
  metadata=await api(route+params({name,metadata:true})),file=metadata.descriptor;
 need(Number.isSafeInteger(file.bytes)&&file.bytes>=0&&/^[a-f0-9]{64}$/.test(file.sha256),'The original file selection is incomplete.');
 await put({key:'download:'+scope()+key+':'+name,metadata:clone(metadata),createdAt:now()});
 const response=await fetch(route+params({name}),{headers:headers(),redirect:'error'});
 need(response.ok&&Number(response.headers.get('content-length'))===file.bytes&&
  response.headers.get('x-content-sha256')===file.sha256,'The original download selection changed.');
 const chunks=[];let bytes=0;
 for await(const chunk of response.body){bytes+=chunk.length;need(bytes<=file.bytes,'The original file grew.');chunks.push(chunk);}
 need(bytes===file.bytes,'The complete original file download was interrupted.');
 const blob=new Blob(chunks,{type:response.headers.get('content-type')??'application/octet-stream'});
 need(await sha(await blob.arrayBuffer())===file.sha256,'The original complete file checksum changed.');
 downloadBlob(blob,name.split('/').at(-1));
}


const UPLOAD_CHUNK=4*1024*1024,downloadOwners=new Map();
function uploadState(value,input){
 need(value&&value.id===input.uploadId&&value.name===input.name&&value.totalBytes===input.bytes&&
  value.chunkBytes===UPLOAD_CHUNK&&Number.isSafeInteger(value.receivedBytes)&&value.receivedBytes>=0&&
  value.receivedBytes<=value.totalBytes&&['UPLOADING','READY_TO_FINISH','COMPLETE'].includes(value.state),
  'The retained upload selection changed.');
 if(value.pendingChunk)need(Number.isSafeInteger(value.pendingChunk.offset)&&value.pendingChunk.offset>=0&&
  Number.isSafeInteger(value.pendingChunk.bytes)&&value.pendingChunk.bytes>0&&value.pendingChunk.bytes<=UPLOAD_CHUNK&&
  value.pendingChunk.offset+value.pendingChunk.bytes<=input.bytes&&/^[a-f0-9]{64}$/.test(value.pendingChunk.sha256),
  'The original interrupted chunk is invalid.');
 if(value.state==='COMPLETE')need(value.bytes===input.bytes&&value.sha256===input.sha256,
  'The completed archive differs from the selected source.');
 return value;
}
async function uploadChunk(id,offset,body,hash){
 const response=await fetch(BASE+'/uploads/'+id+params({offset,sha256:hash}),{
  method:'PUT',headers:headers(undefined,{'Content-Type':'application/octet-stream'}),body,redirect:'error',
  signal:AbortSignal.timeout(900000)});
 const text=await response.text();need(text.length<=65536,'The original upload reply is too large.');
 let result;try{result=JSON.parse(text);}catch{throw new Error('The upload reply was interrupted. Reopen and retry this same upload.');}
 if(!response.ok)throw Object.assign(new Error(result.error??'The archive chunk failed.'),result);
 return result;
}
async function importPanel(parent,ticket){
 if(!state.form){state.form=await newForm('IMPORT',{jobId:uuid(),uploadId:uuid(),name:'',bytes:null,sha256:'',
  manifestSha256:'',upload:null});await put(selection());}
 const form=state.form,data=form.data,panel=section(parent,'Receive a complete programme archive');formBar(panel,form);
 panel.append(node('p','Select the complete original .sf88q.gz archive. Upload can resume with the same file after an interruption. Its original case, programme, customer delivery and publication files are retained together before destination review.'));
 describe(panel,{'Original upload':data.uploadId,'Original import':data.jobId});
 const file=field(panel,'Complete programme archive','',{type:'file'});file.accept='.gz,.sf88q.gz,application/gzip';
 const hashInput=field(panel,'Complete archive SHA256',data.sha256,{change:value=>edit('sha256',value.trim().toLowerCase())});
 field(panel,'Original manifest SHA256 (when selected)',data.manifestSha256,{change:value=>edit('manifestSha256',value.trim().toLowerCase())});
 file.addEventListener('change',()=>act(async()=>{
  const picked=file.files?.[0];if(!picked)return;selectedUpload={formKey:form.key,file:picked};
  if(data.name){need(picked.size===data.bytes,'Select the same complete archive size.');}
  else{edit('name',picked.name);edit('bytes',picked.size);}
  const embedded=/^research-programme-([a-f0-9]{64})\.sf88q\.gz$/.exec(picked.name);
  if(embedded&&!data.sha256){edit('sha256',embedded[1]);hashInput.value=embedded[1];}
  await flush();message('Selected '+picked.name+' ('+picked.size+' bytes).');
 }));
 const output=section(parent,'Original upload progress');
 function progress(value){
  output.replaceChildren(node('h2','Original upload progress'));describe(output,{State:value.state,
   'Complete bytes retained':value.receivedBytes,'Total archive bytes':value.totalBytes});
  if(value.pendingChunk)describe(output,{'Interrupted original chunk offset':value.pendingChunk.offset,
   'Original chunk bytes':value.pendingChunk.bytes});
 }
 if(data.upload)progress(data.upload);
 bar(panel).append(button('Upload or resume the selected complete archive',async()=>{
  await flush();need(/^[a-f0-9]{64}$/.test(data.sha256),'Use the SHA256 from the original completed archive.');
  need(Number.isSafeInteger(data.bytes)&&data.bytes>0&&data.name,'Select the complete archive first.');
  let current=uploadState(await api(BASE+'/uploads',{body:{id:data.uploadId,name:data.name,bytes:data.bytes,sha256:data.sha256}}),data);
  edit('upload',current);await flush();progress(current);
  if(current.state!=='COMPLETE'){
   const picked=selectedUpload?.formKey===form.key?selectedUpload.file:null;
   need(picked&&picked.size===data.bytes,'Select the same original file to continue its retained upload.');
   while(current.state==='UPLOADING'){
    const part=current.pendingChunk??{offset:current.receivedBytes,bytes:Math.min(UPLOAD_CHUNK,data.bytes-current.receivedBytes)};
    need(part.bytes>0,'The original upload did not advance.');
    const body=new Uint8Array(await picked.slice(part.offset,part.offset+part.bytes).arrayBuffer()),hash=await sha(body);
    need(body.length===part.bytes&&(!current.pendingChunk||hash===part.sha256),'The selected file differs from the interrupted original chunk.');
    current=uploadState(await uploadChunk(data.uploadId,part.offset,body,hash),data);
    edit('upload',current);await flush();progress(current);
   }
   if(current.state==='READY_TO_FINISH'){
    current=uploadState(await api(BASE+'/uploads/'+data.uploadId+'/finish',{body:{}}),data);
    edit('upload',current);await flush();progress(current);
   }
  }
  need(current.state==='COMPLETE','Finish the same original upload before receiving.');
  message('The complete original archive is retained. Import it to review the package.');
 }),button('Refresh retained upload',async()=>{
  const current=uploadState(await api(BASE+'/uploads/'+data.uploadId),data);edit('upload',current);await flush();progress(current);
 }),button('Import the complete retained archive',async()=>{
  await flush();const current=uploadState(await api(BASE+'/uploads/'+data.uploadId),data);
  need(current.state==='COMPLETE','Finish the same original archive upload first.');
  const input={id:data.jobId,kind:'IMPORT',uploadId:data.uploadId,
   ...(data.manifestSha256?{manifestSha256:data.manifestSha256}:{})};
  await submitAndOpen(input);
 },{primary:true}));
}
async function archivePart(id,metadata,start){
 const end=Math.min(metadata.bytes-1,start+UPLOAD_CHUNK-1);
 const response=await fetch(BASE+'/archives/'+id,{redirect:'error',signal:AbortSignal.timeout(900000),
  headers:headers(undefined,{Range:'bytes='+start+'-'+end,'If-Match':'"'+metadata.sha256+'"'})});
 need(response.status===206&&response.headers.get('content-range')==='bytes '+start+'-'+end+'/'+metadata.bytes&&
  response.headers.get('etag')==='"'+metadata.sha256+'"'&&
  Number(response.headers.get('content-length'))===end-start+1,'The original archive range changed.');
 const chunkHash=response.headers.get('x-chunk-sha256');need(/^[a-f0-9]{64}$/.test(chunkHash??''),'The original range checksum is missing.');
 const bytes=new Uint8Array(await response.arrayBuffer());
 need(bytes.length===end-start+1&&await sha(bytes)===chunkHash,'The original archive chunk was interrupted or changed.');
 return bytes;
}
async function downloadArchive(id){
 const metadata=await api(BASE+'/archives/'+id+'?metadata=true');
 need(metadata.id===id&&Number.isSafeInteger(metadata.bytes)&&metadata.bytes>0&&
  /^[a-f0-9]{64}$/.test(metadata.sha256)&&/^[a-f0-9]{64}$/.test(metadata.manifestSha256),
  'The original completed archive is incomplete.');
 const key='archive-download:'+scope()+id,old=await get(key);
 if(old)need(same(old.metadata,metadata),'The selected original archive changed.');
 await put(old??{key,metadata:clone(metadata),createdAt:now(),complete:false});
 const previous=downloadOwners.get(key);
 if(previous){await previous.abort();downloadOwners.delete(key);}
 let writer,handle,completed=false,failure;
 const chunks=[];
 try{
  if(typeof window.showSaveFilePicker==='function'){
   handle=await window.showSaveFilePicker({suggestedName:metadata.name,types:[{description:'Complete Research programme',accept:{'application/gzip':['.gz']}}]});
   writer=await handle.createWritable();downloadOwners.set(key,writer);
  }else need(metadata.bytes<=256*1024*1024,
   'Use a browser with streaming file saving for this large archive, or the installed native programme client.');
  for(let offset=0;offset<metadata.bytes;){
   const bytes=await archivePart(id,metadata,offset);
   if(writer)await writer.write(bytes);else chunks.push(bytes);
   offset+=bytes.length;message('Downloading original archive: '+offset+' / '+metadata.bytes+' bytes.');
  }
  if(writer){await writer.close();downloadOwners.delete(key);}
  else{
   const blob=new Blob(chunks,{type:'application/gzip'});
   need(await sha(await blob.arrayBuffer())===metadata.sha256,'The completed archive checksum changed.');
   downloadBlob(blob,metadata.name);
  }
  completed=true;await put({key,metadata:clone(metadata),createdAt:old?.createdAt??now(),complete:true,completedAt:now()});
 }catch(error){failure=error;}
 if(writer&&!completed&&downloadOwners.has(key)){
  try{await writer.abort();downloadOwners.delete(key);}catch(error){
   if(failure)failure.downloadClose=error.message;else failure=error;
  }
 }
 if(failure)throw failure;
 message('Saved the complete original programme archive. Its name carries the full source SHA256.');
}

async function workingPanel(parent){
 const panel=section(parent,'Complete working forms'),forms=(await rows('form:'+scope())).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),
  body=table(panel,['Form','Last saved','Original selection','Open']);
 for(const form of forms){
  const row=node('tr'),controls=node('td',null,{class:'actions'});
  row.append(node('td',form.kind),node('td',form.updatedAt),
   node('td',form.data.name??form.data.programmeId??form.data.bundleId??form.data.id??''));
  controls.append(button('Reopen form',()=>openWorking(form)),
   button('Export whole form',()=>saveJSON(form,'research-programme-working-form.json')));
  row.append(controls);body.append(row);
 }
 if(!forms.length)panel.append(node('p','No saved complete forms in this workspace.'));
 const file=field(panel,'Receive a complete working form','',{type:'file'});file.accept='application/json,.json';
 bar(panel).append(button('Receive as a separate saved form',async()=>{
  const input=file.files?.[0];need(input&&input.size<=4*1024*1024,'Select a complete original working-form file.');
  const source=JSON.parse(await input.text());
  need(source?.schema==='sf88-research-quotation-programme-form/v1'&&source.workspaceId===state.workspaceId&&
   ['CREATE','EXPORT','RECEIVE_REVIEW','IMPORT'].includes(source.kind)&&source.data&&typeof source.data==='object'&&
   !Array.isArray(source.data),'This form belongs to another workspace or workflow.');
  const received={...clone(source),key:'form:'+scope()+uuid(),receivedAt:now()};
  await put(received);await openWorking(received);
 }));
 const requests=section(parent,'Retained browser requests'),records=await rows('request:'+scope());
 const requestsBody=table(requests,['Original operation','Kind','Local state','Reopen']);
 for(const record of records.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100)){
  const row=node('tr'),controls=node('td',null,{class:'actions'});
  row.append(node('td',record.input.id),node('td',record.input.kind),node('td',record.status));
  controls.append(button('Open native operation',()=>go('job',{jobId:record.input.id})),
   button('Resubmit this exact retained request',async()=>{const job=await submit(record.input);await go('job',{jobId:job.id});}));
  row.append(controls);requestsBody.append(row);
 }
}
async function openWorking(form){
 const tab={CREATE:'create',EXPORT:'export',RECEIVE_REVIEW:'receive',IMPORT:'import'}[form.kind];
 need(tab,'This working form has no maintained editor.');
 await go(tab,{form,programmeId:form.data.programmeId??null,bundleId:form.data.bundleId??null});
}
async function render(){
 if(!state.workspaceId)return;const ticket=++state.serial,parent=$('main');parent.replaceChildren();
 document.querySelectorAll('[data-tab]').forEach(item=>{
  if(item.dataset.tab===state.tab)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
 });
 if(state.tab==='programmes')return programmeLibrary(parent,ticket);
 if(state.tab==='create')return createProgramme(parent,ticket);
 if(state.tab==='programme')return programmePanel(parent,ticket);
 if(state.tab==='export')return exportPanel(parent,ticket);
 if(state.tab==='jobs')return jobsPanel(parent,ticket);
 if(state.tab==='job')return jobPanel(parent,ticket);
 if(state.tab==='bundle')return bundlePanel(parent,ticket);
 if(state.tab==='receive')return receivePanel(parent,ticket);
 if(state.tab==='working')return workingPanel(parent,ticket);
 if(state.tab==='import')return importPanel(parent,ticket);
 throw new Error('Open one of the maintained programme views.');
}
async function connect(){
 need(!connecting&&admitted<=1&&active.size===0,'Let the accepted original action finish before changing workspace.');
 connecting=true;
 try{
  await flush();state.token=$('token').value;need(state.token,'Enter the original Research session token.');
  state.workspaceId=null;state.instanceId=null;
  const status=await api('/api/status');need(status.api?.customerQuoteProgrammes&&/^research_[a-f0-9]{64}$/.test(status.workspaceId),
   'Install the complete programme source in this original Research application.');
  state.workspaceId=status.workspaceId;state.instanceId=status.instanceId;
  state.info=await api(BASE+'/info');need(state.info.workspaceId===state.workspaceId,'The original workspace changed.');
  sessionStorage.setItem(tokenKey,state.token);
  const saved=await get('selection:'+scope()),selected=new URLSearchParams(location.search);
  state.tab=saved?.tab??'programmes';state.programmeId=saved?.programmeId??null;state.jobId=saved?.jobId??null;
  state.bundleId=saved?.bundleId??null;state.offset=saved?.offset??0;state.form=saved?.formKey?await get(saved.formKey):null;
  if(selected.has('programme')){state.tab='programme';state.programmeId=selected.get('programme');}
  if(selected.has('job')){state.tab='job';state.jobId=selected.get('job');}
  $('identity').textContent='Research '+state.workspaceId+' · case workspace '+state.info.configuration.cases.workspaceId;
  message('Opened the original customer programme workspace.');await render();
 }finally{connecting=false;}
}
$('token').value=state.token;$('connect').addEventListener('click',()=>act(connect));
document.querySelectorAll('[data-tab]').forEach(item=>item.addEventListener('click',()=>act(()=>go(item.dataset.tab))));
window.addEventListener('beforeunload',event=>{if(pending.size||failures.size||admitted||active.size||downloadOwners.size){
 event.preventDefault();event.returnValue='';
}});
window.addEventListener('pagehide',()=>{if(state.form)retain(state.form);state.serial++;});
if(fragment.has('token'))history.replaceState(null,'',location.pathname+location.search);
if(state.token)act(connect);
