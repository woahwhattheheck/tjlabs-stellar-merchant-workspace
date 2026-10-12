// MIT. Original managed Applications receiving over a completed subscription connection.
import {constants} from 'node:fs';
import {open,lstat,readFile,rename,link,unlink} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createConnection} from 'node:net';
import {setTimeout as pause} from 'node:timers/promises';
import {inspectMerchantRuntime} from '../../../../sf46-release/runtime-package.mjs';
import {odataWorkspaceIdentity,odataLiveIdentity,odataLoopback} from '../startup.mjs';
import {odataSubscriptionSelection} from './managed.mjs';
import {need,plain,shape,text,HASH,LIMITS,relative,same,canonical,bytes,sha,identity,read,parse,
 privateDirectory,pathAt,atomic,immutable,maybeJSON,readJSON,measureChecked,leased,syncDir} from './files.mjs';

export const MANAGED_RECEIVING_SCHEMA='stellar-forge.odata-managed-subscription-receiving-input.v1';
const SCHEMA='stellar-forge.odata-managed-subscription-receiving.v1';
const PREFIX='stellar/scf-starforge-20261009/';
const SOURCE=PREFIX+'sf30-seller-sdk/odata/live/subscriptions/';
const maximumJson=64*1024*1024;
const absolute=value=>{
 need(typeof value==='string'&&value===resolve(value)&&!value.includes('\0'),'MANAGED_PATH','Use an absolute original receiving path.',400);
 return value;
};
const uuid=value=>{
 const h=sha(Buffer.from(value));return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);
};
const selectedArtifact=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='reused'));
const publicError=error=>({code:error.code??'ODATA_MANAGED_RECEIVING',message:String(error.message??error).slice(0,4000)});
const phaseKeys=['first','reopened'];
async function exists(path){try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function closed(url){
 const selected=new URL(odataLoopback(url));
 return new Promise(done=>{
  const socket=createConnection({host:'127.0.0.1',port:Number(selected.port)});let settled=false;
  const finish=value=>{if(!settled){settled=true;socket.destroy();done(value);}};
  socket.once('connect',()=>finish(false));socket.once('error',error=>finish(error.code==='ECONNREFUSED'));
  socket.setTimeout(1000,()=>finish(false));
 });
}
async function boundedResponse(response,max=maximumJson){
 const parts=[];let count=0;
 try{for await(const chunk of response.body){count+=chunk.length;need(count<=max,'MANAGED_RESPONSE_LIMIT','The original HTTP response exceeds this receiving command limit.');parts.push(chunk);}}
 finally{if(count>max)await response.body?.cancel().catch(()=>{});}
 return Buffer.concat(parts);
}
function exactExpected(input,configuration){
 shape(input.expected,['publishers','customers'],'complete expected subscription states');
 for(const group of ['publishers','customers']){
  const rows=input.expected[group];need(plain(rows)&&same(Object.keys(rows).sort(),Object.keys(configuration[group]).sort()),
   'MANAGED_EXPECTED','Bind every configured '+group+' alias from the completed source operation.',400);
  for(const value of Object.values(rows)){
   shape(value,group==='publishers'?['head','definitionSha256','editionSha256','rows']:['revision','definitionSha256','editionSha256','rows'],'expected subscription identity');
   const revision=group==='publishers'?value.head:value.revision;
   need(Number.isSafeInteger(revision)&&revision>0&&revision<=LIMITS.editions&&HASH.test(value.definitionSha256)&&
    HASH.test(value.editionSha256)&&Number.isSafeInteger(value.rows)&&value.rows>=0&&value.rows<=LIMITS.rows,
    'MANAGED_EXPECTED','Use the exact completed edition and row identities.',400);
  }
 }
 need(Object.keys(configuration.publishers).length>0&&Object.keys(configuration.customers).length>0,
  'MANAGED_EXPECTED','Select a completed publisher and customer connection.',400);
}
function matchesExpected(group,value,expected){
 const actual=group==='publishers'?{head:value.head,definitionSha256:value.definitionSha256,editionSha256:value.current?.manifestSha256,rows:value.current?.rows}:
  {revision:value.revision,definitionSha256:value.definitionSha256,editionSha256:value.editionSha256,rows:value.rows};
 need(same(actual,expected)&&value.pending===null,'MANAGED_SOURCE_CHANGED','Complete and retain the selected original subscription state before managed receiving.');
}
async function fullNativeState(api,configuration,expected){
 const result={publishers:{},customers:{}};
 for(const group of ['publishers','customers'])for(const name of Object.keys(configuration[group]).sort()){
  const value=await api[group==='publishers'?'inspectSubscription':'inspectSubscriptionCustomer'](configuration[group][name].directory);
  matchesExpected(group,value,expected[group][name]);result[group][name]=value;
 }
 return result;
}

/** Capture actual completed identities for a reviewable input; no application is started. */
export async function prepareManagedSubscriptionReceiving(options){
 shape(options,['operationId','runtimeDirectory','workspaceDirectory','subscriptionConnection','outputDirectory','liveServiceId','environmentFile'],
  'managed receiving selection');
 text(options.operationId,'original managed operation ID',160);
 need(Number(process.versions.node.split('.')[0])>=24,'MANAGED_NODE','Use the existing selected Node24 runtime.');
 for(const name of ['runtimeDirectory','workspaceDirectory','subscriptionConnection','outputDirectory'])absolute(options[name]);
 if(options.environmentFile)absolute(options.environmentFile);
 const runtime=await inspectMerchantRuntime(options.runtimeDirectory,{load:false});
 const selected=await odataSubscriptionSelection(options.subscriptionConnection);
 const api=await import(pathToFileURL(join(runtime.sourceRoot,SOURCE,'index.mjs')).href),expected={publishers:{},customers:{}};
 await odataWorkspaceIdentity(options.workspaceDirectory);
 if(options.liveServiceId)await odataLiveIdentity(options.workspaceDirectory,options.liveServiceId);
 for(const group of ['publishers','customers'])for(const name of Object.keys(selected.configuration[group]).sort()){
  const value=await api[group==='publishers'?'inspectSubscription':'inspectSubscriptionCustomer'](selected.configuration[group][name].directory);
  need(value.pending===null,'MANAGED_PENDING','Complete the original subscription operation before preparing managed receiving.');
  expected[group][name]=group==='publishers'?{head:value.head,definitionSha256:value.definitionSha256,
   editionSha256:value.current?.manifestSha256,rows:value.current?.rows}:{revision:value.revision,definitionSha256:value.definitionSha256,
   editionSha256:value.editionSha256,rows:value.rows};
 }
 const result={schema:MANAGED_RECEIVING_SCHEMA,...options,expectedRuntimeSourceManifestSha256:runtime.sourceManifestSha256,
  expectedConnectionSha256:selected.identity.sha256,expected};exactExpected(result,selected.configuration);return result;
}

/** Operate one supplied READY runtime and completed connection through the original controller. */
export async function runManagedSubscriptionReceiving(input){
 shape(input,['schema','operationId','runtimeDirectory','expectedRuntimeSourceManifestSha256','workspaceDirectory',
  'subscriptionConnection','expectedConnectionSha256','outputDirectory','expected','liveServiceId','environmentFile'],'managed receiving input');
 need(input.schema===MANAGED_RECEIVING_SCHEMA,'MANAGED_INPUT','Choose the maintained managed-subscription receiving input.',400);
 text(input.operationId,'original managed operation ID',160);
 need(Number(process.versions.node.split('.')[0])>=24,'MANAGED_NODE','Use the existing selected Node24 runtime.');
 need(HASH.test(input.expectedRuntimeSourceManifestSha256)&&HASH.test(input.expectedConnectionSha256),
  'MANAGED_IDENTITY','Select the exact runtime manifest and connection SHA256.',400);
 const output=absolute(input.outputDirectory),workspaceDirectory=absolute(input.workspaceDirectory),runtimeDirectory=absolute(input.runtimeDirectory);
 // A completed original request reopens its retained result even if the source
 // publishers later advance. It does not start or stop another application.
 if(await exists(output)){
  const complete=await leased(output,async root=>{
   const previous=await maybeJSON(root,'operation.json',maximumJson);if(previous?.state!=='COMPLETE')return null;
   need(previous.schema===SCHEMA&&previous.operationId===input.operationId&&
    same(previous.selection.program,identity(await readFile(fileURLToPath(import.meta.url)))),'MANAGED_SELECTION','Use the original completed receiving programme.');
   await measureChecked(join(root,'input.json'),identity(bytes(input)));
   for(const [name,value]of Object.entries(previous.files))await measureChecked(await pathAt(root,name),value);
   return parse(await read(join(root,'result.json'),maximumJson,previous.resultFile));
  });
  if(complete)return complete;
 }
 const selected=await odataSubscriptionSelection(absolute(input.subscriptionConnection),{expectedSha256:input.expectedConnectionSha256});
 const configuration=selected.configuration;exactExpected(input,configuration);
 if(input.environmentFile)absolute(input.environmentFile);
 const roots=[runtimeDirectory,workspaceDirectory,...['publishers','customers','collections','inputs'].flatMap(group=>Object.values(configuration[group]).map(x=>x.directory)),configuration.exportsDirectory];
 need(roots.every(path=>output!==path&&!output.startsWith(path+'/')&&!path.startsWith(output+'/'))&&
  !selected.identity.path.startsWith(output+'/'),'MANAGED_OUTPUT','Keep the complete operation directory separate from original runtime and subscription paths.',400);
 const runtime=await inspectMerchantRuntime(runtimeDirectory,{load:false,expectedManifest:input.expectedRuntimeSourceManifestSha256});
 const api=await import(pathToFileURL(join(runtime.sourceRoot,SOURCE,'index.mjs')).href);
 const {createRuntimeWorkspace,openRuntimeWorkspace}=await import(pathToFileURL(join(runtime.sourceRoot,PREFIX,'distribution/runtime-workspace/model.mjs')).href);
 const workspace=await odataWorkspaceIdentity(workspaceDirectory);
 const live=input.liveServiceId?await odataLiveIdentity(workspaceDirectory,input.liveServiceId):null;
 const original=await fullNativeState(api,configuration,input.expected);
 const selection={runtime,workspace,live,connection:selected.identity,original,
  program:identity(await readFile(fileURLToPath(import.meta.url)))};
 return leased(output,async root=>{
  await immutable(root,'input.json',bytes(input));
  let state=await maybeJSON(root,'operation.json',maximumJson);
  if(state)need(state.schema===SCHEMA&&state.operationId===input.operationId&&same(state.selection,selection),
   'MANAGED_SELECTION','Resume the same original source, connection, runtime and programme.');
  else{state={schema:SCHEMA,operationId:input.operationId,state:'SELECTED',selection,
   controller:join(root,'applications'),phases:{first:{attempts:[]},reopened:{attempts:[]}},exports:{},files:{},errors:[],createdAt:new Date().toISOString()};await atomic(root,'operation.json',state);}
  const save=()=>atomic(root,'operation.json',state);
  const retain=async(name,raw)=>{
   const result=await immutable(root,name,raw);
   if(state.files[name])need(same(state.files[name],result),'MANAGED_OUTPUT_CHANGED','A retained response identity changed.');
   else{state.files[name]=result;await save();}return result;
  };
  const verifyFiles=async()=>{for(const [name,value]of Object.entries(state.files))await measureChecked(await pathAt(root,name),value);};
  if(state.state==='COMPLETE'){
   await verifyFiles();await measureChecked(join(root,'result.json'),state.resultFile);
   return parse(await read(join(root,'result.json'),maximumJson,state.resultFile));
  }
  await verifyFiles();
  let model=null,active=null;
  const knownRun=id=>phaseKeys.some(key=>state.phases[key].attempts.some(run=>run.requestId===id));
  const current=async()=>{
   const value=(await model.applicationsState()).applications.find(item=>item.id===state.applicationId);
   need(value&&value.phase!=='UNAVAILABLE','MANAGED_APPLICATION','Reopen the retained original application.');
   need(!value.current||knownRun(value.current.id),'MANAGED_OTHER_RUN','Another operator selected an application run. Preserve and reopen that original operation.');
   if(state.applicationRevision)need(value.revision===state.applicationRevision,'MANAGED_APPLICATION_CHANGED','The saved application was edited.');
   return value;
  };
  const wait=async(readValue,ready,label)=>{
   const deadline=Date.now()+120000;let value;
   while(Date.now()<deadline){value=await readValue();if(ready(value))return value;
    if(['FAILED','UNAVAILABLE','CANCELLED'].includes(value?.phase)||['FAILED','UNAVAILABLE','CANCELLED'].includes(value?.adoption?.phase))
     need(false,'MANAGED_TERMINAL',label+' ended in its original retained '+String(value.adoption?.phase??value.phase)+' state.');
    await pause(350);}
   need(false,'MANAGED_WAIT',label+' did not finish; reopen the retained original operation. Last phase: '+String(value?.phase??'unknown'));
  };
  async function initializeController(){
   if(state.controllerRetirement){
    const chosen=state.controllerRetirement,from=await exists(chosen.from),to=await exists(chosen.to);
    need(chosen.from===state.controller&&chosen.to.startsWith(state.controller+'.incomplete-')&&!(from&&to),
     'MANAGED_CONTROLLER_CHANGED','Preserve the original controller initialization paths.');
    const observed=from??to;need(observed?.isDirectory()&&!observed.isSymbolicLink()&&observed.dev===chosen.dev&&observed.ino===chosen.ino,
     'MANAGED_CONTROLLER_CHANGED','The retained incomplete controller identity changed.');
    if(from){await rename(chosen.from,chosen.to);await syncDir(root);}
    state.controllerInitializations=[...(state.controllerInitializations??[]),chosen];state.controllerRetirement=null;await save();
   }
   if(await exists(state.controller)&&!await exists(join(state.controller,'workspace.json'))){
    // Preserve an interrupted original initializer before any model operation.
    await privateDirectory(state.controller);const observed=await lstat(state.controller);
    need(!state.runtimeId&&!state.review&&!state.applicationId&&!await exists(join(state.controller,'applications')),
     'MANAGED_CONTROLLER','The existing controller needs its original recovery; do not initialize over it.');
    state.controllerRetirement={from:state.controller,to:state.controller+'.incomplete-'+String((state.controllerInitializations??[]).length+1),
     dev:observed.dev,ino:observed.ino};await save();return initializeController();
   }
   if(!await exists(state.controller))await createRuntimeWorkspace({directory:state.controller});
   model=await openRuntimeWorkspace({directory:state.controller});
  }
  async function http(run,path,body,label,{maximum=maximumJson}={}){
   const url=new URL(path,run.url),record='http/'+run.requestId+'/'+run.instance+'/'+label;
   if(body!==undefined)await retain(record+'.request.json',bytes(body));
   const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000),
    headers:{Accept:'application/json',Origin:url.origin,...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
   const raw=await boundedResponse(response,maximum);let value;
   try{value=parse(raw);}catch{need(false,'MANAGED_HTTP','The original application did not return JSON.');}
   if(!response.ok){state.errors.push({at:new Date().toISOString(),run:run.requestId,path,status:response.status,value});await save();
    need(false,'MANAGED_HTTP','Original managed HTTP operation failed: '+JSON.stringify(value));}
   // An idempotent export may report reused:true on a repeat. Preserve its first
   // full response and separately validate stable native fields at the caller.
   const previous=state.files[record+'.response.json'];
   if(previous){const accepted=parse(await read(await pathAt(root,record+'.response.json'),maximum,previous));
    need(same(selectedArtifact(accepted),selectedArtifact(value)),'MANAGED_HTTP_CHANGED','The repeated original response changed.');
   }else await retain(record+'.response.json',raw);
   return value;
  }
  const operate=(run,operation,args,label)=>http(run,'/subscriptions/api/operate',{operation,args},label);
  async function startPhase(key){
   const phase=state.phases[key];let run=phase.attempts.at(-1),view=await current();
   if(run&&!run.closed){
    if(view.current?.id===run.requestId){
     if(view.phase==='INTERRUPTED'||view.phase==='QUEUED'||view.current.phase==='PENDING'){
      run.recoveries=(run.recoveries??0)+1;await save();
      await model.applicationsRecover({applicationId:state.applicationId,operationId:run.requestId});view=await current();
     }
     if(!view.current.active&&['STOPPED','FAILED','CANCELLED','SUCCEEDED'].includes(view.phase)){
      await stopRun(run);run=null;
     }
    }
   }else run=null;
   if(!run){
    need(!view.current?.active&&!['PENDING','QUEUED','RUNNING','INTERRUPTED','STARTING','STOPPING'].includes(view.phase),
     'MANAGED_RUNNING','Reconcile the original managed child before another Start.');
    const review=await model.applicationsStartReview({applicationId:state.applicationId});
    run={requestId:uuid(input.operationId+':'+key+':'+phase.attempts.length),review,selectedAt:new Date().toISOString(),closed:false};
    phase.attempts.push(run);await save();
   }
   active=run;
   if(view.current?.id!==run.requestId){
    const input={applicationId:state.applicationId,requestId:run.requestId,reviewId:run.review.id};
    await retain('requests/'+run.requestId+'.json',bytes(input));await model.applicationsStart(input);
   }
   view=await wait(current,v=>v.current?.id===run.requestId&&v.phase==='RUNNING'&&!!v.current.privateUrl,'Managed subscription Start');
   run.url=odataLoopback(view.current.privateUrl);
   need(same(view.current.url?.original?.workspace,workspace)&&same(view.current.url?.original?.subscriptions,selected.identity),
    'MANAGED_LOADED_CONNECTION','The managed child loaded another source workspace or connection.');
   need(view.current.privateLinks.some(value=>value.id==='odata-subscriptions'&&value.url===new URL('/subscriptions/',run.url).href),
    'MANAGED_OPEN_LINK','The original Applications result did not expose Open subscriptions.');
   if(live)need(view.current.url.original.live?.sha256===live.sha256,'MANAGED_LIVE','The selected live merchant changed.');
   const originalLaunch=view.current.url.original;
   need(typeof originalLaunch.launchId==='string'&&/^[a-f0-9-]{36}$/.test(originalLaunch.launchId),
    'MANAGED_LAUNCH','The original startup omitted its retained launch identity.');
   run.instances??=[];const found=run.instances.find(item=>item.original.launchId===originalLaunch.launchId);
   if(found)need(same(found.original,originalLaunch)&&found.url===run.url,'MANAGED_LAUNCH_CHANGED','The retained managed launch changed.');
   else run.instances.push({original:originalLaunch,url:run.url,links:view.current.privateLinks});
   run.instance=originalLaunch.launchId;run.original=originalLaunch;run.links=view.current.privateLinks;await save();
   const probe=await http(run,'/api/application',undefined,'application-probe',{maximum:16384});
   need(same(probe.workspace,workspace)&&same(probe.subscriptions,selected.identity)&&same(probe.process,view.current.url.original.process),
    'MANAGED_PROBE','The original listener does not match the selected managed child.');
   const response=await fetch(new URL('/subscriptions/',run.url),{redirect:'error',signal:AbortSignal.timeout(30000)});
   const html=await boundedResponse(response,2*1024*1024);
   need(response.ok&&response.headers.get('content-type')?.startsWith('text/html'),'MANAGED_UI','The original subscription UI did not open.');
   await retain('http/'+run.requestId+'/'+run.instance+'/subscriptions.html',html);
   return run;
  }
  async function stopRun(run){
   if(run.closed){active=null;return;}
   run.stopSelectedAt??=new Date().toISOString();await save();
   await model.applicationsStop({applicationId:state.applicationId,operationId:run.requestId});
   const value=await wait(current,v=>v.current?.id===run.requestId&&!v.current.active&&['STOPPED','FAILED','CANCELLED','SUCCEEDED'].includes(v.phase),'Managed Stop');
   const urls=[run.url,run.original?.live?.url,run.original?.live?.operationsUrl].filter(Boolean);
   if(urls.length)await wait(async()=>({closed:(await Promise.all(urls.map(closed))).every(Boolean)}),v=>v.closed,'Original listener closure');
   run.closed=true;run.stoppedAt=new Date().toISOString();run.terminal={phase:value.phase,current:value.current};active=null;await save();
  }
  async function pages(run,operation,args,label,expected){
   const hash=createHash('sha256');let offset=0,count=0,size=0;
   do{
    const page=await operate(run,operation,{...args,offset,limit:100},label+'-'+String(offset).padStart(8,'0'));
    need(page.offset===offset&&page.total===expected.total&&Array.isArray(page.items)&&page.items.length<=100&&
     (expected.revision===undefined||page.revision===expected.revision)&&(expected.editionSha256===undefined||page.editionSha256===expected.editionSha256),
     'MANAGED_PAGE','The original paged selection changed.');
    for(const row of page.items){const raw=Buffer.from(canonical(row)+'\n');hash.update(raw);size+=raw.length;count++;}
    const next=offset+page.items.length;
    need(next<=page.total&&page.nextOffset===(next<page.total?next:null)&&(page.nextOffset===null||page.items.length>0),
     'MANAGED_CURSOR','The original response omitted or repeated a selected page.');
    offset=page.nextOffset;
   }while(offset!==null);
   need(count===expected.total,'MANAGED_ROWS','The complete original row count changed.');
   return {representation:'canonical-jsonl',rows:count,bytes:size,sha256:hash.digest('hex')};
  }
  async function snapshot(run,key){
   const result={publishers:{},customers:{}},status=await http(run,'/subscriptions/api/status',undefined,'subscription-status');
   need(status.connectionSha256===selected.identity.sha256&&status.configured===true,'MANAGED_STATUS','The running operator has another configuration.');
   for(const group of ['publishers','customers','collections','inputs'])need(same(Object.keys(status[group]).sort(),Object.keys(configuration[group]).sort()),
    'MANAGED_STATUS','The running operator changed its configured aliases.');
   for(const group of ['publishers','customers'])for(const name of Object.keys(configuration[group]).sort()){
    const kind=group==='publishers'?'publisher':'customer',value=await operate(run,kind+'-inspect',{[kind]:name},group+'-'+name+'-inspect');
    need(same(value,original[group][name]),'MANAGED_STATE_CHANGED','The selected original subscription changed during managed receiving.');
    const revision=kind==='publisher'?value.head:value.revision,editionSha256=kind==='publisher'?value.current.manifestSha256:value.editionSha256;
    const count=kind==='publisher'?value.current.rows:value.rows;
    const rowState=await pages(run,kind+'-rows',{[kind]:name,...(kind==='publisher'?{revision,kind:'rows'}:{})},group+'-'+name+'-rows',{total:count,revision,editionSha256});
    const row={inspection:value,rows:rowState};
    if(kind==='publisher'){
     row.changes=await pages(run,'publisher-rows',{publisher:name,revision,kind:'changes'},group+'-'+name+'-changes',{total:value.current.counts.events,revision,editionSha256});
     row.editions=await pages(run,'publisher-editions',{publisher:name},group+'-'+name+'-editions',{total:revision});
    }
    result[group][name]=row;
   }
   if(key==='reopened')need(same(result,state.phases.first.snapshot),'MANAGED_REOPEN_CHANGED','The saved publisher/customer rows or edition history changed after Stop/reopen.');
   if(state.phases[key].snapshot)need(same(result,state.phases[key].snapshot),'MANAGED_SNAPSHOT_CHANGED','Resume the original saved subscription snapshot.');
   else{state.phases[key].snapshot=result;await save();}
   return result;
  }
  async function download(run,artifact,file,destination){
   const target=await pathAt(root,destination,{create:true});let found=false;
   try{await measureChecked(target,{bytes:file.bytes,sha256:file.sha256});found=true;}catch(error){if(error.code!=='ENOENT')throw error;}
   const candidate=join(dirname(target),'.managed-download-'+sha(Buffer.from(destination)).slice(0,32)+'.partial');
   if(!found){
    const handle=await open(candidate,constants.O_RDWR|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
    try{
     const before=await handle.stat();need(before.isFile()&&(before.mode&0o077)===0&&before.uid===process.getuid()&&before.size<=file.bytes,
      'MANAGED_DOWNLOAD','Preserve the selected private download candidate.');
     const url=new URL('/subscriptions/api/file',run.url);url.searchParams.set('artifact',artifact.artifact);url.searchParams.set('path',file.path);url.searchParams.set('sha256',file.sha256);
     const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(120000)});
     need(response.ok,'MANAGED_DOWNLOAD','The original artifact download did not succeed.');
     const hash=createHash('sha256');let offset=0;
     for await(const raw of response.body){
      need(offset+raw.length<=file.bytes,'MANAGED_DOWNLOAD','The original file exceeds its declared length.');
      hash.update(raw);const retained=Math.max(0,Math.min(raw.length,before.size-offset));
      if(retained){const old=Buffer.alloc(retained);const n=(await handle.read(old,0,retained,offset)).bytesRead;
       need(n===retained&&old.equals(Buffer.from(raw.subarray(0,retained))),'MANAGED_DOWNLOAD_CHANGED','The partial original download differs. Preserve it for inspection.');}
      let wrote=retained;while(wrote<raw.length){const n=(await handle.write(raw,wrote,raw.length-wrote,offset+wrote)).bytesWritten;need(n>0,'MANAGED_DOWNLOAD','The original download could not be retained.');wrote+=n;}
      offset+=raw.length;
     }
     need(offset===file.bytes&&hash.digest('hex')===file.sha256,'MANAGED_DOWNLOAD_CHANGED','The complete original download differs from its selected identity.');
     await handle.sync();
    }finally{await handle.close();}
    await measureChecked(candidate,{bytes:file.bytes,sha256:file.sha256});
    try{await link(candidate,target);}catch(error){if(error.code!=='EEXIST')throw error;await measureChecked(target,{bytes:file.bytes,sha256:file.sha256});}
    await syncDir(dirname(target));
   }
   const partial=await exists(candidate),final=await lstat(target);
   if(partial?.isFile()&&!partial.isSymbolicLink()&&partial.dev===final.dev&&partial.ino===final.ino){await unlink(candidate);await syncDir(dirname(target));}
   if(!state.files[destination]){state.files[destination]={bytes:file.bytes,sha256:file.sha256};await save();}
   else need(same(state.files[destination],{bytes:file.bytes,sha256:file.sha256}),'MANAGED_DOWNLOAD_CHANGED','The retained file selection changed.');
  }
  async function exportsAndRestore(run,{reopened=false}={}){
   for(const group of ['publishers','customers'])for(const name of Object.keys(configuration[group]).sort()){
    const kind=group==='publishers'?'publisher':'customer',key=group+'/'+name,value=original[group][name];
    let step=state.exports[key];
    if(!step){
     const artifact='managed-'+sha(Buffer.from(input.operationId+':'+key)).slice(0,40);
     const args={[kind]:name,artifact,expectedRevision:kind==='publisher'?value.head:value.revision,
      ...(kind==='customer'?{expectedEditionSha256:value.editionSha256}:{})};
     step=state.exports[key]={operation:kind+'-backup',args,directory:'downloads/'+artifact,restoreDirectory:'restored/'+artifact,state:'SELECTED'};await save();
    }
    const actual=await operate(run,reopened?'artifact':step.operation,reopened?{artifact:step.args.artifact}:step.args,
     (reopened?'reopen-':'export-')+step.args.artifact);
    const record=selectedArtifact(actual);
    need(record.state==='COMPLETE'&&record.kind===kind+'-backup'&&record.artifact===step.args.artifact&&same(record.selection,step.args)&&
     Array.isArray(record.files)&&record.files.length<=LIMITS.files,'MANAGED_ARTIFACT','The original operator did not retain the complete selected backup.');
    let total=0;const names=new Set();
    for(const file of record.files){shape(file,['path','bytes','sha256'],'artifact file');relative(file.path);
     need(!names.has(file.path)&&HASH.test(file.sha256)&&Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=LIMITS.fileBytes,
      'MANAGED_ARTIFACT','The complete native backup inventory changed.');names.add(file.path);total+=file.bytes;}
    need(total<=LIMITS.totalBytes&&record.bytesTotal===total&&record.manifest?.path==='backup.json'&&
     same(record.files.find(file=>file.path==='backup.json'),record.manifest),'MANAGED_ARTIFACT','The full native backup is not closed by its original manifest.');
    if(step.artifact)need(same(step.artifact,record),'MANAGED_ARTIFACT_CHANGED','The selected retained backup changed after reopen.');
    else{step.artifact=record;await save();}
    for(const file of record.files)await download(run,record,file,step.directory+'/'+file.path);
    const source=join(root,step.directory),directory=join(root,step.restoreDirectory);
    const restored=await api[kind==='publisher'?'restoreSubscription':'restoreSubscriptionCustomer']({directory,source,expectedSha256:record.manifest.sha256});
    if(step.restore)need(same(selectedArtifact(step.restore),selectedArtifact(restored)),'MANAGED_RESTORE_CHANGED','The original independent receiving result changed.');
    else{step.restore=restored;await save();}
    const inspection=await api[kind==='publisher'?'inspectSubscription':'inspectSubscriptionCustomer'](directory);
    need(same(inspection,value),'MANAGED_RESTORE_CHANGED','The independently restored subscription lost original state.');
    step.state='COMPLETE';if(reopened)step.reopened=true;await save();
   }
  }
  try{
   await initializeController();
   if(!state.runtimeId){const attached=await model.attach({directory:runtimeDirectory,label:'Completed subscription runtime'});state.runtimeId=attached.runtimeId;await save();}
   if(!state.review){
    const settings={workspaceDirectory,subscriptionConnection:selected.identity.path,port:0,
     ...(input.liveServiceId?{liveServiceId:input.liveServiceId}:{}),...(input.environmentFile?{environmentFile:input.environmentFile}:{})};
    state.review=await model.applicationsReview({runtimeId:state.runtimeId,kind:'odata',settings,label:'OData subscription receiving'});
    need(same(state.review.command.identity?.subscriptions,selected.identity),'MANAGED_REVIEW','Review did not retain the original subscription connection.');
    state.saveRequest={requestId:uuid(input.operationId+':save'),reviewId:state.review.id};await save();
   }
   if(!state.applicationId){
    const saved=await model.applicationsSave(state.saveRequest);need(!saved.superseded,'MANAGED_APPLICATION_CHANGED','Another saved application replaced this original request.');
    state.applicationId=saved.applicationId;state.applicationRevision=saved.revision;state.saveReceipt=saved;await save();
   }
   let view=await current();
   if(view.phase==='CONNECTING'){await model.applicationsConnect({applicationId:state.applicationId});await wait(current,v=>v.phase!=='CONNECTING','Original READY runtime adoption');}
   for(const key of phaseKeys){
    const phase=state.phases[key];
    if(phase.complete)continue;
    const exportKeys=['publishers','customers'].flatMap(group=>Object.keys(configuration[group]).map(name=>group+'/'+name));
    if(phase.snapshot&&phase.attempts.at(-1)?.closed&&exportKeys.every(name=>state.exports[name]?.state==='COMPLETE'&&
     (key==='first'||state.exports[name].reopened))){phase.complete=true;await save();continue;}
    const run=await startPhase(key);await snapshot(run,key);await exportsAndRestore(run,{reopened:key==='reopened'});await stopRun(run);
    phase.complete=true;await save();await model.close();model=await openRuntimeWorkspace({directory:state.controller});
   }
   need(phaseKeys.every(key=>state.phases[key].complete&&state.phases[key].attempts.at(-1)?.closed)&&
    Object.values(state.exports).every(item=>item.state==='COMPLETE'&&item.reopened),'MANAGED_INCOMPLETE','Complete both original managed phases and receiving.');
   await verifyFiles();state.completedAt??=new Date().toISOString();await save();
   const result={schema:SCHEMA,operationId:input.operationId,state:'COMPLETE',directory:root,controller:state.controller,
    applicationId:state.applicationId,applicationRevision:state.applicationRevision,selection,phases:state.phases,exports:state.exports,
    files:Object.entries(state.files).sort(([a],[b])=>a.localeCompare(b)).map(([path,value])=>({path,...value})),completedAt:state.completedAt};
   state.resultFile=await immutable(root,'result.json',bytes(result));state.state='COMPLETE';await save();return result;
  }catch(error){
   state.state='NEEDS_ATTENTION';state.errors.push({at:new Date().toISOString(),...publicError(error)});await save();
   if(active&&!active.closed)try{await stopRun(active);}catch(stopError){state.errors.push({at:new Date().toISOString(),phase:'owned-stop',...publicError(stopError)});await save();}
   throw error;
  }finally{await model?.close();}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=='--input')throw new TypeError('Use --input with the original private managed subscription receiving JSON.');
 runManagedSubscriptionReceiving(parse(await read(absolute(args[1]),1048576)))
  .then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
  .catch(error=>{process.stderr.write(JSON.stringify(publicError(error))+'\n');process.exitCode=1;});
}
