// MIT. TJLabs: one actual Flowable 8 job producer/operator/cold-receiving course.
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,open,rename,link,unlink,readdir,lstat} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {startFlowableWorkspaceServer} from './workspace/server.mjs';
import {FlowableWorkspaceHttpClient} from './workspace/http-client.mjs';
import {createFlowableTransport,executeFlowableRequest} from './native.mjs';
import {FLOWABLE_RECORD_KINDS} from './workspace/actions.mjs';
import {FLOWABLE_JOB_COLLECTIONS} from './job-native.mjs';
import {operationLease} from '../../distribution/runtime-workspace/storage.mjs';
import {inspectJobRecoveryBrowser} from './job-native-browser.mjs';
const SCHEMA='stellar-forge.flowable-job-native-course.v1';
const OP='FLOWABLE-NATIVE-JOB-RECOVERY-B43A-20261013';
const sha=b=>createHash('sha256').update(b).digest('hex');
const canon=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const need=(v,m)=>{if(!v)throw Object.assign(new Error(m),{code:'FLOWABLE_JOB_COURSE_MISMATCH'});};
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
export async function runJobNativeCourse(configPath,phase,{signal}={}){
 need(['prepare','failure','operate'].includes(phase),'Select the original course phase.');
 const configRaw=await bytes(resolve(configPath)),c=JSON.parse(configRaw),root=resolve(c.outputDirectory);
 need(c.schema===SCHEMA&&c.operation===OP&&c.engineCommit==='0779d68e5a3385b74d8acb8bc37901ff54513249'&&c.engineVersion==='8.0.0','Select the original pinned engine and operation.');
 need(c.isolatedDemonstration===true&&c.connection.id==='tjlabs-job-recovery-demo','Only the explicit isolated native demonstration is writable.');
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
  async function operation(label,kind,selection){
   const title=kind[0].toUpperCase()+kind.slice(1),prepared=await request(label+':prepare','prepare'+title,{connectionId:connection.id,label:OP+' '+label,note:'Explicit TJLabs isolated demonstration; complete native evidence retained.',selection});
   need(prepared.value.phase==='PREPARED'||prepared.value.dispatchedAt,'The original preparation did not finish: '+label+' '+prepared.value.state);
   let dispatch=state.inputs[label+':dispatch'];
   if(!dispatch){need(!prepared.value.dispatchedAt,'Recover the original dispatch input before continuing.');dispatch=await freeze(label+':dispatch',{requestId:uuid(label+':dispatch'),id:prepared.id,expectedRevision:prepared.revision,planSha256:prepared.value.planSha256});}
   await retainReview(prepared);let current=await call('dispatch'+title,dispatch);
   if(['UNKNOWN','DISPATCHED','READBACK'].includes(current.value.state))current=await request(label+':reconcile','reconcileOperation',{kind,id:current.id});
   await retainReview(current);need(['CONFIRMED','ACCEPTED','OBSERVED'].includes(current.value.state),'Retain actual unresolved native outcome for '+label+': '+current.value.state);
   return current;
  }
  async function capture(label){
   const r=await request(label+':capture','captureJobPortfolio',{connectionId:connection.id,label:OP+' '+label});need(r.value.state==='CAPTURED','Original five-queue inventory is incomplete.');return r;
  }
  async function collection(portfolio,name){const all=[];let offset=0;for(;;){const p=await call('readJobPortfolio',{id:portfolio.id,revision:portfolio.revision,collection:name,offset,limit:11});need(p.complete===true,'Original native queue is incomplete.');all.push(...p.items);if(p.nextOffset===null)return all;need(p.nextOffset>offset,'Queue paging must advance.');offset=p.nextOffset;}}
  async function jobAt(portfolio,name,pid){const rows=(await collection(portfolio,name)).filter(x=>x.processInstanceId===pid);need(rows.length===1,'Expected one actual '+name+' job for the selected original demonstration process.');return rows[0];}
  const native=createFlowableTransport(c.connection,{fetch:nativeFetch,environment:process.env,signal});
  async function nativeRead(path,query={}){let full;await executeFlowableRequest({execute:(spec,opt)=>native.request(spec,opt.signal)},{method:'GET',path,query,mutation:false},{onExchange:e=>{full=e;}});need(full?.complete&&full.ok,'Original native source read failed.');return full;}
  async function producerMutation(label,method,path,body,confirmed){
   const target=join(root,'producer-'+label+'.private.json'),request={method,path,body,bodySha256:sha(Buffer.from(body))};
   let old=await exists(target)?await read(target):null;
   if(old){need(canon(old.request)===canon(request),'Original producer request changed.');if(old.response?.complete&&old.response.ok){await put(join(artifacts,'producer',label+'.json'),{request:old.request,response:old.response});return old;}const observed=await confirmed();need(observed,'The original producer outcome is uncertain or was rejected; inspect the retained native process before continuing.');const next={...old,reconciled:observed};await put(target,next,true);await put(join(artifacts,'producer',label+'.json'),{request:old.request,...(old.response?{response:old.response}:{}),reconciled:observed});return next;}
   old={request,attemptedAt:new Date().toISOString()};await put(target,old);
   let response;
   await executeFlowableRequest({execute:(spec,opt)=>native.request(spec,opt.signal)},{method,path,query:{},mutation:true,contentType:'application/json',bodyBase64:Buffer.from(body).toString('base64'),bodyBytes:Buffer.byteLength(body),bodySha256:request.bodySha256},{onExchange:e=>{response=e;}});
   await put(target,{...old,response},true);need(response?.complete&&response.ok,'Original isolated producer action was not accepted.');
   await put(join(artifacts,'producer',label+'.json'),{request,response});return{request,response};
  }
  const deployment=await step('native-demonstration-source',async()=>{
   const b=await bytes(new URL('./examples/job-recovery-demo.bpmn20.xml',import.meta.url));
   await put(join(artifacts,'job-recovery-demo.bpmn20.xml'),b);
   const r=await operation('deploy isolated recovery processes','release',{action:'deploy',deploymentName:OP+' original BPMN',deploymentKey:'tjlabs-job-recovery-demo',resource:{filename:'job-recovery-demo.bpmn20.xml',contentType:'application/xml',contentBase64:b.toString('base64')}});
   const after=await source(r.value.after),definitions=Object.fromEntries(after.definitions.filter(x=>x.key.startsWith('tjlabs_job_')).map(x=>[x.key,x]));
   need(['failure','timer','executable','suspended'].every(k=>definitions['tjlabs_job_'+k]?.id),'Retain all four actually deployed native definitions.');
   return{record:ref(r),definitions,bpmn:{bytes:b.length,sha256:sha(b)}};
  });
  async function start(kind){return step('native-process-'+kind,async()=>{
   const r=await operation('start '+kind,'process',{action:'start',bodyText:JSON.stringify({processDefinitionId:deployment.definitions['tjlabs_job_'+kind].id,businessKey:OP+'-'+kind})});
   const after=await source(r.value.after),rows=[...(after.processes??[]),...(after.historicProcesses??[])].filter(x=>x.businessKey===OP+'-'+kind);
   const ids=[...new Set(rows.map(x=>x.id))];need(ids.length===1,'Bind one original native demonstration instance.');return{processId:ids[0],record:ref(r)};
  });}
  const failing=await start('failure');
  if(phase==='prepare'){await close(author);author=null;return{schema:SCHEMA,state:'PREPARED_NATIVE_FAILURE',processId:failing.processId};}
  if(phase==='failure'){
   const result=await step('actual-native-dead-letter',async()=>{
    const deadline=Date.now()+(c.failureWaitMs??180000);let observed;
    for(;;){signal?.throwIfAborted();const r=await nativeRead('/management/deadletter-jobs',{processInstanceId:failing.processId,size:'100'}),rows=r.json?.data;
     need(Array.isArray(rows),'Original dead-letter collection response required.');observed=rows.filter(x=>x.processInstanceId===failing.processId);
     if(observed.length===1){await put(join(artifacts,'producer','actual-dead-letter.json'),r);break;}
     need(Date.now()<deadline,'Native failure has not reached the real dead-letter queue; retain this original course.');await delay(500,undefined,{signal});}
    need(observed[0].exceptionMessage,'Native failed execution must retain its original exception.');
    return{processId:failing.processId,jobId:observed[0].id,nativeJob:observed[0]};
   });
   await close(author);author=null;return{schema:SCHEMA,state:'NATIVE_FAILURE_RETAINED',...result};
  }
  need(state.steps['actual-native-dead-letter'],'Run the same original async failure phase first.');
  const timer=await start('timer'),executable=await start('executable'),suspended=await start('suspended');
  await step('native-suspended-process',async()=>{
   const path='/runtime/process-instances/'+encodeURIComponent(suspended.processId);
   return producerMutation('suspend','PUT',path,JSON.stringify({action:'suspend'}),async()=>(await nativeRead(path)).json?.suspended===true);
  });
  const initial=await step('complete-five-queue-capture',async()=>{
   const p=await capture('all five native queues'),selected={};
   for(const [name,pid]of [['jobs',executable.processId],['timerJobs',timer.processId],['suspendedJobs',suspended.processId],['deadLetterJobs',failing.processId]])selected[name]=await jobAt(p,name,pid);
   const history=await collection(p,'historyJobs');need(history.length>0,'The isolated engine must retain genuine asynchronous history jobs.');selected.historyJobs=history[0];
   for(const [name,j]of Object.entries(selected)){const detail=await call('readJob',{portfolioId:p.id,revision:p.revision,collection:name,jobId:j.id});await put(join(artifacts,'jobs',name+'.json'),detail);
    for(const r of detail.resources??[]){const ref=r.originalResource??r.definitionRef;if(ref)await author.client.downloadSource(ref,join(artifacts,'originals',ref.sha256+'.bin'));}}
   return{portfolio:ref(p),selected};
  });
  await step('timer-reschedule',async()=>ref(await operation('reschedule original timer','jobOperation',{collection:'timerJobs',jobId:initial.selected.timerJobs.id,action:'reschedule',dueDate:c.timerDueDate})));
  const browserPath=join(artifacts,'author-browser','result.json');
  if(!(await exists(browserPath))){
   const {chromium}=await import(pathToFileURL(resolve(c.playwrightModule)).href);
   context=await chromium.launchPersistentContext(join(root,'browser-profile'),{headless:true,executablePath:c.chromiumExecutable,timeout:10000,viewport:{width:1440,height:1000},acceptDownloads:true,args:['--no-sandbox']});
   const page=context.pages()[0]??await context.newPage();
   const operated=await inspectJobRecoveryBrowser({page,context,url:author.host.url,directory:join(artifacts,'author-browser'),mode:'author',selection:{inputSha256:state.inputSha256,connectionId:connection.id,portfolio:initial.portfolio,selected:initial.selected,timerDueDate:c.browserTimerDueDate},client:author.client,signal});
   await context.close();context=null;await put(browserPath,{...operated,state:'COMPLETE',browserClosed:true});
  }else{const b=await read(browserPath);need(b.state==='COMPLETE'&&b.inputSha256===state.inputSha256,'Retain the completed original browser selection.');await verify(dirname(browserPath),b.files);}
  await step('timer-move',async()=>ref(await operation('move original timer','jobOperation',{collection:'timerJobs',jobId:initial.selected.timerJobs.id,action:'move'})));
  await step('timer-execute',async()=>ref(await operation('execute original timer','jobOperation',{collection:'jobs',jobId:initial.selected.timerJobs.id,action:'execute'})));
  await step('executable-native-work',async()=>ref(await operation('execute retained job','jobOperation',{collection:'jobs',jobId:initial.selected.jobs.id,action:'execute'})));
  await step('repair-native-input',async()=>{
   const path='/runtime/process-instances/'+encodeURIComponent(failing.processId)+'/variables';
   return producerMutation('repair','POST',path,JSON.stringify([{name:'repairValue',type:'string',value:'TJLabs explicit repaired native input',scope:'local'}]),
    async()=>{const r=await nativeRead(path);return Array.isArray(r.json)&&r.json.some(x=>x.name==='repairValue'&&x.value==='TJLabs explicit repaired native input');});
  });
  await step('dead-letter-move',async()=>ref(await operation('recover actual dead-letter','jobOperation',{collection:'deadLetterJobs',jobId:initial.selected.deadLetterJobs.id,action:'move'})));
  await step('repaired-native-execute',async()=>ref(await operation('execute repaired original job','jobOperation',{collection:'jobs',jobId:initial.selected.deadLetterJobs.id,action:'execute'})));
  await step('original-history-execution',async()=>ref(await operation('execute retained native history','jobOperation',{collection:'historyJobs',jobId:initial.selected.historyJobs.id,action:'execute'})));
  const final=await step('final-native-and-complete-export',async()=>{
   const p=await capture('after explicit recovery');
   const delivery=await request('complete-export','exportWorkspace',{label:OP+' complete original source, jobs, exceptions and recovery history'});
   const downloaded=await author.client.downloadDelivery(delivery.id,join(artifacts,'Complete_Flowable_Job_Workspace.ndjson'));
   const heads={};for(const kind of FLOWABLE_RECORD_KINDS)if(!['delivery','receiving'].includes(kind))heads[kind]=await records(author.client,kind);
   return{portfolio:ref(p),delivery:ref(delivery),downloaded,heads};
  });
  await close(author);author=null;author=await host('author');
  await author.client.downloadDelivery(final.delivery.id,join(artifacts,'Complete_Flowable_Job_Workspace_Reopened.ndjson'));
  receiver=await host('receiver');
  const received=await step('receive-final-workspace',async()=>{
   const inspect=await receiver.client.inspectFile(final.downloaded.path,{requestId:uuid('final-inspect'),label:'Full actual native jobs receiving',expectedSha256:final.downloaded.sha256});
   const adopted=await receiver.client.action('adoptDelivery',{requestId:uuid('final-adopt'),id:inspect.id,expectedRevision:inspect.revision,manifestSha256:inspect.value.manifestSha256});
   need(adopted.value.state==='ADOPTED','Full native job workspace receiving must finish.');return{inspection:ref(inspect),adoption:ref(adopted)};
  });
  await close(receiver);receiver=null;receiver=await host('receiver');
  const parity=await step('every-original-and-current-revision',async()=>{
   const counts={};for(const [kind,heads]of Object.entries(final.heads)){let revisions=0;
    for(const h of heads)for(let revision=1;revision<=h.revision;revision++){const [a,b]=await Promise.all([author.client.action('getRecord',{kind,id:h.id,revision}),receiver.client.action('getRecord',{kind,id:h.id,revision})]);need(a.sha256===b.sha256&&a.parentSha256===b.parentSha256,'Cold receiving changed original '+kind+' revision.');revisions++;}
    for(const h of inherited.heads[kind]??[]){const old=await receiver.client.action('getRecord',{kind,id:h.id,revision:h.revision});need(old.sha256===h.sha256,'An inherited original customer edition changed.');}
    counts[kind]={records:heads.length,revisions};
   }return counts;
  });
  const receivedBrowser=join(artifacts,'received-browser','result.json');
  if(!(await exists(receivedBrowser))){
   const {chromium}=await import(pathToFileURL(resolve(c.playwrightModule)).href);
   context=await chromium.launchPersistentContext(join(root,'received-browser-profile'),{headless:true,executablePath:c.chromiumExecutable,timeout:10000,viewport:{width:1440,height:1000},acceptDownloads:true,args:['--no-sandbox']});
   const page=context.pages()[0]??await context.newPage();
   const operated=await inspectJobRecoveryBrowser({page,context,url:receiver.host.url,directory:dirname(receivedBrowser),mode:'received',selection:{inputSha256:state.inputSha256,connectionId:connection.id,portfolio:initial.portfolio,selected:initial.selected},client:receiver.client,signal});
   await context.close();context=null;await put(receivedBrowser,{...operated,state:'COMPLETE',browserClosed:true});
  }else{const b=await read(receivedBrowser);need(b.state==='COMPLETE'&&b.inputSha256===state.inputSha256,'Retain the completed cold browser selection.');await verify(dirname(receivedBrowser),b.files);}
  await close(author);author=null;await close(receiver);receiver=null;await tail;
  await put(join(artifacts,'Native_Recovery_Summary.json'),{schema:SCHEMA,operation:OP,sourceRevision:c.sourceRevision,engineCommit:c.engineCommit,isolatedDemonstration:true,originalArchive:c.workspaceArchive,initial,final,received,parity,steps:state.steps});
  const files=await inventory(artifacts),result={schema:SCHEMA,state:'COMPLETE',operation:OP,inputSha256:state.inputSha256,completedAt:new Date().toISOString(),originalArchive:c.workspaceArchive,finalWorkspace:final.downloaded,files};
  await put(resultsPath,result);state.completed=true;await persist();return result;
 }catch(e){error=e;if(state){state.failure={code:e.code??null,message:String(e.message),at:new Date().toISOString()};await persist();}throw e;}
 finally{
  const failures=[];if(context)try{await context.close();}catch(e){failures.push(e);}
  for(const h of [author,receiver])if(h)try{await h.client.close();await h.host.close();}catch(e){failures.push(e);}
  try{await tail;}catch(e){failures.push(e);}await lease.close();if(failures.length)throw new AggregateError([...(error?[error]:[]),...failures],'Original course cleanup must finish before receiving.');
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const abort=new AbortController();for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>abort.abort(new Error('Original job course interrupted.')));
 runJobNativeCourse(process.argv[2],process.argv[3],{signal:abort.signal}).then(r=>process.stdout.write(JSON.stringify(r)+'\n')).catch(e=>{process.stderr.write(JSON.stringify({error:e.code??'FLOWABLE_JOB_COURSE_FAILED',message:e.message})+'\n');process.exitCode=1;});
}
