// MIT. TJLabs: one actual Flowable 8 typed task-form producer/operator/cold-receiving course.
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,open,rename,link,unlink,readdir,lstat} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {startFlowableWorkspaceServer} from './workspace/server.mjs';
import {FlowableWorkspaceHttpClient} from './workspace/http-client.mjs';
import {createFlowableTransport,executeFlowableRequest} from './native.mjs';
import {FLOWABLE_RECORD_KINDS} from './workspace/actions.mjs';
import {operationLease} from '../../distribution/runtime-workspace/storage.mjs';
import {inspectTaskFormBrowser} from './task-form-native-browser.mjs';
const SCHEMA='stellar-forge.flowable-task-form-native-course.v1';
const OP='FLOWABLE-NATIVE-TASK-FORMS-B43A-20261013';
const sha=b=>createHash('sha256').update(b).digest('hex');
const canon=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const need=(v,m)=>{if(!v)throw Object.assign(new Error(m),{code:'FLOWABLE_TASK_FORM_COURSE_MISMATCH'});};
const ref=r=>({kind:r.kind,id:r.id,revision:r.revision,sha256:r.sha256});
const uuid=s=>{const h=sha(OP+'\n'+s);return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32);};
async function bytes(path){const h=await open(path,'r');try{const s=await h.stat();need(s.isFile(),'Read an original regular file.');const b=await h.readFile(),t=await h.stat();need(s.size===b.length&&s.ino===t.ino&&s.mtimeMs===t.mtimeMs,'Original file changed.');return b;}finally{await h.close();}}
async function file(path){const b=await bytes(path);return{path,bytes:b.length,sha256:sha(b)};}
async function exists(path){try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function put(path,value,replace=false){await mkdir(dirname(path),{recursive:true,mode:0o700});const b=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value,null,2)+'\n');
 const temp=path+'.partial-'+randomUUID(),h=await open(temp,'wx',0o600);try{await h.writeFile(b);await h.sync();}finally{await h.close();}
 try{if(replace)await rename(temp,path);else try{await link(temp,path);}catch(e){if(e.code!=='EEXIST')throw e;need((await bytes(path)).equals(b),'An immutable original file differs: '+path);}
 const d=await open(dirname(path),'r');try{await d.sync();}finally{await d.close();}}finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}return file(path);}
async function read(path){return JSON.parse(await bytes(path));}
async function inventory(root){const out=[];async function walk(p){for(const ent of await readdir(p,{withFileTypes:true})){if(ent.name.startsWith('.')||ent.name==='result.json')continue;const q=join(p,ent.name);need(!ent.isSymbolicLink(),'No symbolic member in operated evidence.');if(ent.isDirectory())await walk(q);else if(ent.isFile())out.push({...await file(q),path:relative(root,q)});}}await walk(root);return out.sort((a,b)=>a.path.localeCompare(b.path));}
async function verify(root,entries){for(const x of entries){const y=await file(join(root,x.path));need(y.bytes===x.bytes&&y.sha256===x.sha256,'Retained operated evidence changed: '+x.path);}}
export async function runTaskFormNativeCourse(configPath,phase,{signal}={}){
 need(phase==='operate','Select the original single forms course phase.');
 const configRaw=await bytes(resolve(configPath)),c=JSON.parse(configRaw),root=resolve(c.outputDirectory);
 need(c.schema===SCHEMA&&c.operation===OP&&c.engineCommit==='0779d68e5a3385b74d8acb8bc37901ff54513249'&&c.engineVersion==='8.0.0','Select the original pinned engine and operation.');
 need(c.isolatedDemonstration===true&&c.connection.id==='tjlabs-task-forms-demo','Only the explicit isolated native demonstration is writable.');
 need(!root.startsWith(resolve(c.sourceRoot)+'/')&&!resolve(c.sourceRoot).startsWith(root+'/')&&root!==resolve(c.sourceRoot),'Keep operation output disjoint from complete source.');
 await mkdir(root,{recursive:true,mode:0o700});
 const lease=await operationLease(join(root,'course.lock')),statePath=join(root,'course.private.json');
 let state,author,receiver,context,error,tail=Promise.resolve();
 const artifacts=join(root,'artifacts'),resultsPath=join(artifacts,'result.json');
 await mkdir(artifacts,{recursive:true,mode:0o700});await mkdir(join(artifacts,'originals'),{recursive:true,mode:0o700});
 const persist=()=>{const snap=JSON.parse(JSON.stringify(state));tail=tail.then(()=>put(statePath,snap,true));return tail;};
 const freeze=async(key,value)=>{if(Object.hasOwn(state.inputs,key)){need(canon(state.inputs[key])===canon(value),'Frozen original input changed: '+key);return state.inputs[key];}state.inputs[key]=value;await persist();return value;};
 async function step(key,fn){signal?.throwIfAborted();if(Object.hasOwn(state.steps,key))return state.steps[key];state.phase=key;await persist();const v=await fn();state.steps[key]=v;await persist();return v;}
 try{
  state=await exists(statePath)?await read(statePath):{schema:SCHEMA,inputSha256:sha(configRaw),operation:OP,inputs:{},steps:{},nativeInvocations:[],createdAt:new Date().toISOString()};
  need(state.schema===SCHEMA&&state.inputSha256===sha(configRaw),'Continue the exact original configuration.');
  const original=await file(c.workspaceArchive.path);need(original.bytes===c.workspaceArchive.bytes&&original.sha256===c.workspaceArchive.sha256,'Receive the exact original complete workspace archive.');
  if(phase==='operate'&&await exists(resultsPath)){const done=await read(resultsPath);need(done.inputSha256===state.inputSha256&&done.state==='COMPLETE','Original completed course differs.');await verify(artifacts,done.files);return done;}
  await persist();
  const nativeFetch=async(input,options={})=>{
   const url=new URL(String(input)),body=options.body==null?Buffer.alloc(0):Buffer.from(options.body),entry={sequence:state.nativeInvocations.length,method:options.method??'GET',origin:url.origin,path:url.pathname,query:url.search,bodyBytes:body.length,bodySha256:sha(body),startedAt:new Date().toISOString()};
   state.nativeInvocations.push(entry);await persist();
   try{const response=await fetch(input,options);entry.status=response.status;entry.returnedAt=new Date().toISOString();await persist();return response;}catch(e){entry.failure={code:e.code??null,message:String(e.message)};await persist();throw e;}
  };
  async function host(which){
   const urlFile=join(root,which+'-origin.private.json'),old=await exists(urlFile)?await read(urlFile):null;
   const h=await startFlowableWorkspaceServer({directory:join(root,which),connections:[],fetch:nativeFetch,environment:process.env,port:old?.port??0,signal});
   if(!old)await put(urlFile,{port:h.port,workspaceId:h.workspaceId});else need(old.workspaceId===h.workspaceId,'Original host now identifies another workspace.');
   const client=new FlowableWorkspaceHttpClient({url:h.url,workspaceId:h.workspaceId,signal});await client.ready();return{host:h,client};
  }
  async function close(h){if(h){await h.client.close();await h.host.close();}}
  author=await host('author');const call=(method,args={})=>author.client.action(method,args,{signal});
  async function request(key,method,args){const input=await freeze(key,{requestId:uuid(key),...args});return call(method,input);}
  async function records(client,kind){let offset=0,snapshot,all=[];for(;;){const p=await client.action('listRecords',{kind,offset,limit:31,...(snapshot?{snapshot}:{})});need(p.offset===offset&&(!snapshot||p.snapshot===snapshot),'Read complete saved heads from one original snapshot.');snapshot=p.snapshot;all.push(...p.items);if(p.nextOffset===null){need(all.length===p.total,'Saved record census incomplete.');return all;}need(p.nextOffset>offset,'Saved record paging did not advance.');offset=p.nextOffset;}}
  const inherited=await step('receive-original-workspace',async()=>{
   const inspected=await author.client.inspectFile(c.workspaceArchive.path,{requestId:uuid('original-inspect'),label:'Existing complete Flowable source for isolated native recovery',expectedSha256:c.workspaceArchive.sha256});
   const adopted=await request('original-adopt','adoptDelivery',{id:inspected.id,expectedRevision:inspected.revision,manifestSha256:inspected.value.manifestSha256});
   need(adopted.value.state==='ADOPTED','Original complete source receiving must finish.');
   const heads={};for(const kind of FLOWABLE_RECORD_KINDS)if(!['delivery','receiving'].includes(kind))heads[kind]=await records(author.client,kind);
   return{inspection:ref(inspected),adoption:ref(adopted),heads};
  });
  const connection=await step('demo-connection',async()=>ref(await request('demo-connection','saveConnection',{connection:c.connection})));
  async function source(reference){return(await call('readSource',{reference})).value;}
  async function retainReview(record){
   const review=await call('readReview',{kind:record.kind,id:record.id,revision:record.revision}),out=join(artifacts,'reviews',record.id+'-'+record.revision);
   await put(out+'.json',review);for(const item of review.originals)await author.client.downloadSource(item.reference,join(artifacts,'originals',item.reference.sha256+'.bin'),{signal});
   return review;
  }
  async function operation(label,kind,selection,extra={},expected=['CONFIRMED','ACCEPTED','OBSERVED']){
   const title=kind[0].toUpperCase()+kind.slice(1),prepared=await request(label+':prepare','prepare'+title,{connectionId:connection.id,label:OP+' '+label,note:'Explicit TJLabs isolated demonstration; complete native evidence retained.',selection,...extra});
   need(prepared.value.phase==='PREPARED'||prepared.value.dispatchedAt,'The original preparation did not finish: '+label+' '+prepared.value.state);
   let dispatch=state.inputs[label+':dispatch'];
   if(!dispatch){need(!prepared.value.dispatchedAt,'Recover the original dispatch input before continuing.');dispatch=await freeze(label+':dispatch',{requestId:uuid(label+':dispatch'),id:prepared.id,expectedRevision:prepared.revision,planSha256:prepared.value.planSha256});}
   await retainReview(prepared);let current=await call('dispatch'+title,dispatch);
   if(['UNKNOWN','DISPATCHED','READBACK'].includes(current.value.state))current=await request(label+':reconcile','reconcileOperation',{kind,id:current.id});
   await retainReview(current);need(expected.includes(current.value.state),'Retain actual unresolved native outcome for '+label+': '+current.value.state);
   return current;
  }
  async function capture(label,id){
   const r=await request(label+':capture','captureTaskForm',{connectionId:connection.id,taskId:id,label:OP+' '+label,note:'Exact isolated native task/form source.'});
   need(r.value.state==='CAPTURED','Original task form capture did not finish.');const detail=await call('readTaskForm',{id:r.id,revision:r.revision});
   await put(join(artifacts,'captures',label+'.json'),detail);
   for(const item of detail.originals??[])await author.client.downloadSource(item.reference,join(artifacts,'originals',item.reference.sha256+'.bin'),{signal});
   for(const item of detail.resources??[]){const original=item.originalResource??item.definitionRef;if(original)await author.client.downloadSource(original,join(artifacts,'originals',original.sha256+'.bin'),{signal});}
   return{record:ref(r),detail};
  }
  const deployment=await step('native-task-form-source',async()=>{
   const b=await bytes(new URL('./examples/task-forms-demo.bpmn20.xml',import.meta.url));await put(join(artifacts,'task-forms-demo.bpmn20.xml'),b);
   const r=await operation('deploy original task forms','release',{action:'deploy',deploymentName:OP+' original BPMN',deploymentKey:'tjlabs-task-forms-demo',resource:{filename:'task-forms-demo.bpmn20.xml',contentType:'application/xml',contentBase64:b.toString('base64')}});
   const after=await source(r.value.after),definitions=Object.fromEntries(after.definitions.filter(x=>['tjlabs_task_forms','tjlabs_form_key_only'].includes(x.key)).map(x=>[x.key,x]));
   need(definitions.tjlabs_task_forms?.id&&definitions.tjlabs_form_key_only?.id,'Retain both actual deployed original form definitions.');
   return{record:ref(r),definitions,bpmn:{bytes:b.length,sha256:sha(b)}};
  });
  async function start(label,definitionKey='tjlabs_task_forms'){return step('native-process-'+label,async()=>{
   const variables=[{name:'reference',type:'string',value:'Original '+label},{name:'quantity',type:'string',value:'9007199254740993'},
    {name:'comment',type:'string',value:'KEEP_ORIGINAL_COMMENT'},{name:'lockedCode',type:'string',value:'READ_ONLY_SOURCE'},
    {name:'clearLong',type:'long',value:17},{name:'blankString',type:'string',value:'BEFORE_EMPTY'}];
   const r=await operation('start '+label,'process',{action:'start',bodyText:JSON.stringify({processDefinitionId:deployment.definitions[definitionKey].id,businessKey:OP+'-'+label,variables})});
   const after=await source(r.value.after),rows=[...(after.processes??[]),...(after.historicProcesses??[])].filter(x=>x.businessKey===OP+'-'+label);
   const ids=[...new Set(rows.map(x=>x.id))];need(ids.length===1,'Bind one actual native form demonstration instance.');
   const tasks=(after.tasks??[]).filter(t=>t.processInstanceId===ids[0]);need(tasks.length===1,'Bind the actual selected native user task.');
   return{processId:ids[0],taskId:tasks[0].id,record:ref(r)};
  });}
  const native=await start('native-fields'),browser=await start('browser-fields'),keyOnly=await start('form-key-only','tjlabs_form_key_only');
  const keyCapture=await step('capture-key-only',async()=>capture('key-only',keyOnly.taskId));
  need(keyCapture.detail.form.formKey==='tjlabs:retained-custom-form'&&keyCapture.detail.form.formProperties.length===0,'Retain native formKey without fabricating custom fields.');
  const initial=await step('capture-before-raw-task-action',async()=>capture('before-claim',native.taskId));
  await step('original-raw-task-claim',async()=>ref(await operation('claim original form task','task',{action:'claim',taskId:native.taskId,bodyText:JSON.stringify({action:'claim',assignee:'tjlabs-form-reviewer'})})));
  const values=(label,quantity)=>[
   {id:'reference',value:'TJLabs '+label+' — original form ✓'},
   {id:'quantity',value:quantity},{id:'approved',value:'false'},{id:'scheduled',value:'13/10/2026'},
   {id:'category',value:'tier-b'},{id:'blankString',value:''},{id:'clearLong',value:null}
  ];
  const nativeProperties=values('native fields','9007199254740993'),browserProperties=values('browser fields','9223372036854775807');
  const stale=await step('retain-stale-native-capture',async()=>{
   const r=await request('stale-form:prepare','prepareTaskFormOperation',{connectionId:connection.id,captureId:initial.record.id,captureRevision:initial.record.revision,selection:{taskId:native.taskId,properties:nativeProperties},label:OP+' stale captured task'});
   need(r.value.state==='STALE'&&!r.value.dispatchedAt,'The changed native task must preserve the old form and require a fresh capture.');
   await retainReview(r);return ref(r);
  });
  const current=await step('capture-current-native-form',async()=>capture('current-native',native.taskId));
  function inspectDefinition(capture){
   const fields=capture.detail.form.formProperties,ids=fields.map(p=>p.id);
   need(!ids.includes('hiddenToken'),'Native GET must omit unreadable fields.');
   need(ids.length===9&&new Set(ids).size===9,'Preserve all nine actual readable native properties.');
   need(fields.find(p=>p.id==='lockedCode')?.writable===false&&fields.find(p=>p.id==='lockedCode')?.value==='READ_ONLY_SOURCE','Retain original read-only field.');
   need(fields.find(p=>p.id==='scheduled')?.datePattern==='dd/MM/yyyy','Retain the original Java date pattern.');
   need(canon(fields.find(p=>p.id==='category')?.enumValues)===canon([{id:'tier-a',name:'Standard priority'},{id:'tier-b',name:'Business priority'}]),'Retain exact enum IDs, labels and order.');
   need(fields.find(p=>p.id==='quantity')?.value==='9007199254740993','Preserve the large native long spelling before submission.');
  }
  inspectDefinition(current);
  const rejected=await step('retain-actual-native-date-rejection',async()=>{
   const bad=nativeProperties.map(p=>p.id==='scheduled'?{id:p.id,value:'not-a-native-date'}:p);
   const r=await operation('native date rejection','taskFormOperation',{taskId:native.taskId,properties:bad},{captureId:current.record.id,captureRevision:current.record.revision},['REJECTED']);
   const response=await source(r.value.response),before=await source(r.value.before),after=await source(r.value.after);
   need(response.complete&&!response.ok&&response.status>=400&&response.status<500,'Retain actual original date-parser rejection.');
   need(before.task?.id===native.taskId&&after.task?.id===native.taskId,'Rejected original form must leave the same task present.');
   return ref(r);
  });
  const nativeDone=await step('accepted-original-native-form',async()=>{
   const r=await operation('submit exact supported native values','taskFormOperation',{taskId:native.taskId,properties:nativeProperties},{captureId:current.record.id,captureRevision:current.record.revision},['CONFIRMED']);
   return ref(r);
  });
  async function verifyCompletion(reference,selected,quantity){
   const r=await call('getRecord',{kind:'taskFormOperation',id:reference.id,revision:reference.revision}),plan=await source(r.value.plan),after=await source(r.value.after),response=await source(r.value.response),reconciliation=await source(r.value.reconciliation);
   need(r.value.state==='CONFIRMED'&&response.status===204&&response.bodyBytes===0,'Require actual native form acknowledgment and completed history.');
   need(after.task===null&&after.nativeState.historicTasks.some(t=>t.id===selected.taskId&&t.processInstanceId===selected.processId&&t.endTime),'Inspect the original completed native task.');
   const formBody=JSON.parse(Buffer.from(plan.bodyBase64,'base64'));
   need(formBody.taskId===selected.taskId&&!formBody.properties.some(p=>['comment','lockedCode','hiddenToken'].includes(p.id)),'Omitted/read-only/hidden fields must remain absent from original submission.');
   const variables=(after.nativeState.variableEvidence??[]).filter(v=>v.processInstanceId===selected.processId);
   const value=name=>{const rows=variables.map(v=>v.variable??v).filter(v=>v.name===name);need(rows.length===1,'Require one exact native historical variable '+name);return rows[0];};
   need(value('quantity').type==='long'&&canon(value('quantity').value)===canon({number:quantity,exponent:'0'}),'The actual native long lost exact precision.');
   need(value('approved').value===false&&value('category').value==='tier-b','Original native boolean/enum conversion differs.');
   need(value('comment').value==='KEEP_ORIGINAL_COMMENT'&&value('lockedCode').value==='READ_ONLY_SOURCE','Omission or readonly source was overwritten.');
   need(value('blankString').value===''&&value('clearLong').value===null,'Original empty and null values were collapsed.');
   need(value('hiddenToken').value==='native-default','The native hidden default was not applied by its original handler.');
   need(value('scheduled').type==='date'&&/^2026-10-13T00:00:00/u.test(value('scheduled').value),'Inspect actual native date in the explicitly UTC isolated engine.');
   await put(join(artifacts,'native-completion',reference.id+'.json'),{record:ref(r),plan,response,reconciliation,after,exactVariables:variables});
   return ref(r);
  }
  await step('verify-native-conversion',()=>verifyCompletion(nativeDone,native,'9007199254740993'));
  const browserCapture=await step('capture-browser-native-form',async()=>capture('browser-native',browser.taskId));inspectDefinition(browserCapture);
  const baseSelection={inputSha256:state.inputSha256,connectionId:connection.id,capture:browserCapture.record,taskId:browser.taskId,properties:browserProperties,readonlyValues:{lockedCode:'READ_ONLY_SOURCE'},hiddenPropertyIds:['hiddenToken'],nativeOperation:nativeDone,keyOnlyCapture:keyCapture.record,rejectedOperation:rejected,staleOperation:stale};
  const browserPath=join(artifacts,'author-browser','result.json');
  let browserResult;
  if(!(await exists(browserPath))){
   const {chromium}=await import(pathToFileURL(resolve(c.playwrightModule)).href);
   context=await chromium.launchPersistentContext(join(root,'browser-profile'),{headless:true,executablePath:c.chromiumExecutable,timeout:10000,viewport:{width:1440,height:1000},acceptDownloads:true,args:['--no-sandbox']});
   const page=context.pages()[0]??await context.newPage();
   browserResult=await inspectTaskFormBrowser({page,context,url:author.host.url,directory:dirname(browserPath),mode:'author',selection:baseSelection,client:author.client,signal});
   await context.close();context=null;browserResult={...browserResult,state:'COMPLETE',browserClosed:true};await put(browserPath,browserResult);
  }else{browserResult=await read(browserPath);need(browserResult.state==='COMPLETE'&&browserResult.browserClosed===true&&browserResult.inputSha256===state.inputSha256,'Retain the original completed browser result.');await verify(dirname(browserPath),browserResult.files);}
  need(browserResult.operation?.kind==='taskFormOperation','Actual browser must return its original saved submitted form operation.');
  const browserDone=await step('verify-browser-native-conversion',()=>verifyCompletion(browserResult.operation,browser,'9223372036854775807'));
  const final=await step('complete-form-workspace-export',async()=>{
   const delivery=await request('complete-export','exportWorkspace',{label:OP+' complete original task forms, native request/history and source'});
   const downloaded=await author.client.downloadDelivery(delivery.id,join(artifacts,'Complete_Flowable_Task_Form_Workspace.ndjson'));
   const heads={};for(const kind of FLOWABLE_RECORD_KINDS)if(!['delivery','receiving'].includes(kind))heads[kind]=await records(author.client,kind);
   return{delivery:ref(delivery),downloaded,heads};
  });
  await close(author);author=null;author=await host('author');
  const reopened=await author.client.downloadDelivery(final.delivery.id,join(artifacts,'Complete_Flowable_Task_Form_Workspace_Reopened.ndjson'));
  need(reopened.bytes===final.downloaded.bytes&&reopened.sha256===final.downloaded.sha256,'Reopening changed the complete original exported workspace.');
  receiver=await host('receiver');
  const received=await step('receive-final-workspace',async()=>{
   const inspected=await receiver.client.inspectFile(final.downloaded.path,{requestId:uuid('final-inspect'),label:'Full actual native task forms receiving',expectedSha256:final.downloaded.sha256});
   const adopted=await receiver.client.action('adoptDelivery',{requestId:uuid('final-adopt'),id:inspected.id,expectedRevision:inspected.revision,manifestSha256:inspected.value.manifestSha256});
   need(adopted.value.state==='ADOPTED','Complete form workspace receiving must finish.');return{inspection:ref(inspected),adoption:ref(adopted)};
  });
  await close(receiver);receiver=null;receiver=await host('receiver');
  const parity=await step('every-original-and-current-revision',async()=>{
   const counts={};for(const [kind,heads]of Object.entries(final.heads)){let revisions=0;
    for(const h of heads)for(let revision=1;revision<=h.revision;revision++){const [a,b]=await Promise.all([author.client.action('getRecord',{kind,id:h.id,revision}),receiver.client.action('getRecord',{kind,id:h.id,revision})]);need(a.sha256===b.sha256&&a.parentSha256===b.parentSha256,'Cold receiving changed original '+kind+' revision.');revisions++;}
    for(const h of inherited.heads[kind]??[]){const old=await receiver.client.action('getRecord',{kind,id:h.id,revision:h.revision});need(old.sha256===h.sha256,'An inherited customer edition changed.');}
    counts[kind]={records:heads.length,revisions};
   }
   for(const x of [current,browserCapture,keyCapture]){const a=await author.client.action('readTaskForm',{id:x.record.id,revision:x.record.revision}),b=await receiver.client.action('readTaskForm',{id:x.record.id,revision:x.record.revision});need(canon(a)===canon(b),'Cold receiving changed complete native form/source view.');}
   return counts;
  });
  const receivedBrowser=join(artifacts,'received-browser','result.json');
  if(!(await exists(receivedBrowser))){
   const {chromium}=await import(pathToFileURL(resolve(c.playwrightModule)).href);
   context=await chromium.launchPersistentContext(join(root,'received-browser-profile'),{headless:true,executablePath:c.chromiumExecutable,timeout:10000,viewport:{width:1440,height:1000},acceptDownloads:true,args:['--no-sandbox']});
   const page=context.pages()[0]??await context.newPage();
   const operated=await inspectTaskFormBrowser({page,context,url:receiver.host.url,directory:dirname(receivedBrowser),mode:'received',selection:{...baseSelection,completedOperation:browserDone},client:receiver.client,signal});
   await context.close();context=null;await put(receivedBrowser,{...operated,state:'COMPLETE',browserClosed:true});
  }else{const b=await read(receivedBrowser);need(b.state==='COMPLETE'&&b.browserClosed===true&&b.inputSha256===state.inputSha256,'Retain completed cold browser selection.');await verify(dirname(receivedBrowser),b.files);}
  await close(author);author=null;await close(receiver);receiver=null;await tail;
  await put(join(artifacts,'Native_Task_Form_Summary.json'),{schema:SCHEMA,operation:OP,sourceRevision:c.sourceRevision,engineCommit:c.engineCommit,isolatedDemonstration:true,originalArchive:c.workspaceArchive,deployment,native,browser,keyOnly,initial,current,browserCapture,keyCapture,nativeDone,browserDone,rejected,stale,final,received,parity,steps:state.steps});
  const files=await inventory(artifacts),result={schema:SCHEMA,state:'COMPLETE',operation:OP,inputSha256:state.inputSha256,completedAt:new Date().toISOString(),originalArchive:c.workspaceArchive,finalWorkspace:final.downloaded,files};
  await put(resultsPath,result);state.completed=true;await persist();return result;
 }catch(e){error=e;if(state){state.failure={code:e.code??null,message:String(e.message),at:new Date().toISOString()};await persist();}throw e;}
 finally{
  const failures=[];if(context)try{await context.close();}catch(e){failures.push(e);}
  for(const h of [author,receiver])if(h)try{await h.client.close();await h.host.close();}catch(e){failures.push(e);}
  try{await tail;}catch(e){failures.push(e);}await lease.close();if(failures.length)throw new AggregateError([...(error?[error]:[]),...failures],'Original forms cleanup must finish before receiving.');
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const abort=new AbortController();for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>abort.abort(new Error('Original form course interrupted.')));
 runTaskFormNativeCourse(process.argv[2],process.argv[3],{signal:abort.signal}).then(r=>process.stdout.write(JSON.stringify(r)+'\n')).catch(e=>{process.stderr.write(JSON.stringify({error:e.code??'FLOWABLE_FORM_COURSE_FAILED',message:e.message})+'\n');process.exitCode=1;});
}
