// MIT. Complete installed HILA Applications, typed-client, CLI and browser receiving.
// The caller owns the native foreground; the original core workspace is closed.
import { constants } from 'node:fs';
import { mkdir, open, readFile, lstat, realpath, rename, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join, resolve, isAbsolute, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runHilaBrowserReceiving, inspectHilaReceivedPage } from './browser.mjs';

const SCHEMA='stellar-forge.hila-operator-receiving.v1';
const ROOT='stellar/scf-starforge-20261009/';
const SDK=ROOT+'sf30-seller-sdk/';
const HILA=SDK+'hila/';
const FIELDS=['name','notes','editions','rules','selection','review','rowDecisions','cellDecisions'];
const HASH=/^[a-f0-9]{64}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const sorted=value=>Array.isArray(value)?value.map(sorted):plain(value)?
 Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
const encode=value=>Buffer.from(JSON.stringify(sorted(value),null,2)+'\n');
const compact=value=>Buffer.from(JSON.stringify(sorted(value))+'\n');
const sha=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>encode(a).equals(encode(b));
const need=(value,message)=>{if(!value)throw Object.assign(new Error(message),{code:'HILA_OPERATOR_RECEIVING'});};
const detail=error=>({code:String(error.code??'HILA_OPERATOR_ERROR'),message:String(error.message??error),stack:String(error.stack??'')});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const uuid=value=>{const id=sha(value);return id.slice(0,8)+'-'+id.slice(8,12)+'-4'+id.slice(13,16)+'-a'+id.slice(17,20)+'-'+id.slice(20,32);};
const inside=(path,root)=>path===root||path.startsWith(root+'/');
const terminal=app=>!app.current?.active&&!['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(app.current?.phase);
const definition=view=>Object.fromEntries(FIELDS.map(key=>[key,view[key]]));
const selectedView=view=>({id:view.id,revision:view.revision,definitionSha256:view.definitionSha256});
const RUNTIME_FIELDS=['installationId','profileId','profileSha256','lockSha256','sourceCommit',
 'sourceManifestSha256','directory','sourceRoot','dependencyCount'];
const runtimeBinding=value=>Object.fromEntries(RUNTIME_FIELDS.map(key=>[key,value[key]]));
const CRITICAL=[
 ...['hila_questionnaire.py','hila_source.py','hila_rules.py','hila_workspace.py','hila_portable.py',
 'hila_html.py','hila_http.py','hila_cli.py','hila_managed.py','cli.mjs','client.mjs','client.d.mts',
 'public/index.html','public/app.js','public/style.css','README.md','METHODOLOGY.md',
 'receiving/native.py','receiving/NATIVE_RECEIVING.md','receiving/runtime.mjs','receiving/RUNTIME.md',
 'receiving/operator.mjs','receiving/OPERATOR.md','receiving/browser.mjs','receiving/BROWSER.md'].map(name=>HILA+name),
 ...['xml_source.py','workspace.py','server.py','native.mjs'].map(name=>SDK+'xml/'+name),
 SDK+'dataset-handler.mjs',ROOT+'distribution/contributions/hila.json',
 ROOT+'distribution/selections/hila-operator.json',ROOT+'distribution/runtime-workspace/application-hila.mjs',
 ROOT+'distribution/runtime-workspace/providers/hila.mjs',ROOT+'distribution/runtime-workspace/model.mjs',
 ROOT+'distribution/runtime-workspace/server.mjs',ROOT+'distribution/runtime-workspace/applications-core.mjs',
 ROOT+'distribution/runtime-workspace/application-providers.mjs',
 ROOT+'distribution/runtime-workspace/application-provider.mjs',ROOT+'distribution/runtime-workspace/managed-workspace.mjs',
 ROOT+'sf46-release/runtime-package.mjs',ROOT+'merchant-fleet-gateway/state-lease.mjs'
];
async function selectLocalPort(){
 return new Promise((resolvePort,reject)=>{
  const server=createServer();
  server.unref();server.once('error',reject);
  server.listen({host:'127.0.0.1',port:0,exclusive:true},()=>{
   const address=server.address(),port=typeof address==='object'&&address?address.port:null;
   server.close(error=>{
    if(error)return reject(error);
    try{need(Number.isSafeInteger(port)&&port>0&&port<=65535,'The original local port selection failed.');resolvePort(port);}
    catch(error){reject(error);}
   });
  });
 });
}
async function stat(path){try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function json(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function privateDirectory(path){
 need(isAbsolute(path)&&resolve(path)===path&&path!=='/','Choose a complete absolute private directory.');
 await mkdir(path,{recursive:true,mode:0o700});
 const value=await lstat(path);
 need(value.isDirectory()&&!value.isSymbolicLink()&&await realpath(path)===path&&!(value.mode&0o077)&&
  (!process.getuid||value.uid===process.getuid()),'Retain the original owned private directory: '+path);
}
async function syncDirectory(path){const file=await open(path,constants.O_RDONLY);try{await file.sync();}finally{await file.close();}}
async function identity(path){
 const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{
  const first=await file.stat({bigint:true});need(first.isFile(),'Select a complete regular original file: '+path);
  const hash=createHash('sha256'),git=createHash('sha1').update('blob '+first.size+'\0');let bytes=0;
  for await(const block of file.createReadStream({autoClose:false})){hash.update(block);git.update(block);bytes+=block.length;}
  const last=await file.stat({bigint:true}),named=await lstat(path,{bigint:true});
  need(BigInt(bytes)===first.size&&['dev','ino','size','mtimeNs','ctimeNs'].every(key=>first[key]===last[key])&&
   first.dev===named.dev&&first.ino===named.ino,'An original file changed during complete verification: '+path);
  return{bytes,sha256:hash.digest('hex'),gitBlob:git.digest('hex')};
 }finally{await file.close();}
}
async function publish(path,value,{immutable=false}={}){
 const body=Buffer.isBuffer(value)?value:encode(value);
 await privateDirectory(dirname(path));
 if(immutable&&await stat(path)){
  const current=await readFile(path);need(current.equals(body),'A retained complete selection changed: '+path);return path;
 }
 const stage=join(dirname(path),'.hila-operator-'+randomUUID()+'.partial'),file=await open(stage,'wx',0o600);
 try{await file.writeFile(body);await file.sync();}finally{await file.close();}
 need((await readFile(stage)).equals(body),'The complete private publication stage changed.');
 await rename(stage,path);await syncDirectory(dirname(path));return path;
}
async function verified(file){
 need(plain(file)&&typeof file.path==='string'&&isAbsolute(file.path)&&Number.isSafeInteger(file.bytes)&&
  file.bytes>=0&&HASH.test(file.sha256??''),'Retain a complete original file descriptor.');
 const actual=await identity(file.path);
 need(actual.bytes===file.bytes&&actual.sha256===file.sha256,'Complete returned file changed: '+file.path);
 return file;
}
async function bounded(response,max=64*1024*1024){
 const blocks=[];let bytes=0;
 for await(const block of response.body??[]){bytes+=block.length;need(bytes<=max,'The complete native JSON response exceeds its original bound.');blocks.push(block);}
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(blocks,bytes)));
 if(!response.ok)throw Object.assign(new Error(String(value.message??value.error??'Original Applications request failed')),
  {code:'HILA_APPLICATION_HTTP',status:response.status,body:value});
 return value;
}
async function until(read,accept,message,timeout=240000){
 const end=Date.now()+timeout;let last;
 do{last=await read();if(await accept(last))return last;await pause(500);}while(Date.now()<end);
 throw Object.assign(new Error(message),{code:'HILA_ORIGINAL_WAIT',last});
}
function verifyView(view,selected){
 need(view?.schema==='stellar-forge.hila-review.v1'&&view.id===selected.id&&view.revision===selected.revision&&
  view.definitionSha256===selected.definitionSha256,'The complete selected review identity changed.');
 need(sha(compact(definition(view)))===view.definitionSha256,'The saved complete definition does not match its native SHA.');
 return view;
}
function verifyReport(report,view){
 need(report?.reviewId===view.id&&report.revision===view.revision&&report.definitionSha256===view.definitionSha256,
  'The full private report is not from the selected native review.');
 const body=compact(report);
 need(body.length===view.report.bytes&&sha(body)===view.report.sha256,'The whole original report differs from its saved native descriptor.');
 return report;
}
function sameCounts(before,after){return equal(before.editions.map(x=>({edition:x.edition,counts:x.counts})),
 after.editions.map(x=>({edition:x.edition,counts:x.counts})));}
async function coreSelection(file,expected){
 await verified(file);const value=await json(file.path);
 need(value?.schema==='stellar-forge.hila-native-receiving-result.v1'&&value.state==='COMPLETE',
  'Use the completed original HILA native receiving result.');
 need(equal(value.sourceReview,expected),'The core receiving selected a different original source review.');
 const root=dirname(file.path);
 for(const [name,wanted]of Object.entries(value.files)){
  need(typeof name==='string'&&name&&!isAbsolute(name)&&name.split('/').every(x=>x&&x!=='.'&&x!=='..'),
   'The core result contains an invalid complete member name.');
  await verified({path:join(root,name),...wanted});
 }
 return value;
}

/** All storage/model/controller lifetimes belong to the calling original operation. */
export async function runHilaOperatorReceiving({
 directory,outputDirectory,sourceRoot,runtimeDirectory,operationId,actor,expected,coreResult,
 pythonExecutable,chromiumExecutable,playwrightModule
}={}){
 process.umask(0o077);
 need(typeof operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,139}$/.test(operationId),
  'Continue one original HILA operation.');
 need(plain(actor)&&typeof actor.id==='string'&&actor.id.trim()&&actor.id.length<=160&&
  typeof actor.label==='string'&&actor.label.trim()&&actor.label.length<=160,'Name the actual receiving operator.');
 need(plain(expected)&&HASH.test(expected.id??'')&&HASH.test(expected.definitionSha256??'')&&
  Number.isSafeInteger(expected.revision)&&expected.revision>0,'Select the complete native source review.');
 for(const path of [directory,outputDirectory,sourceRoot,runtimeDirectory,pythonExecutable,chromiumExecutable,playwrightModule])
  need(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path,'Use explicit original filesystem/runtime paths.');
 need(!inside(outputDirectory,directory)&&!inside(directory,outputDirectory)&&!inside(outputDirectory,sourceRoot)&&
  !inside(sourceRoot,outputDirectory),'Keep the receiving output beside the closed original workspace and selected source.');
 await privateDirectory(outputDirectory);
 const original=path=>import(pathToFileURL(join(sourceRoot,path)).href);
 const {acquireStateLease}=await original(ROOT+'merchant-fleet-gateway/state-lease.mjs');
 const lease=await acquireStateLease(outputDirectory);
 let progress,selection,result,failure,appsModel,appsServer,appApi,installedRoot,runtime,sourceClient,receivedClient;
 const contexts=new Set(),clients=new Set(),files=new Map();
 const progressPath=join(outputDirectory,'progress.json');
 let writing=Promise.resolve();
 const save=()=>{
  const next=writing.then(async()=>{lease.assertHeld();progress.updatedAt=new Date().toISOString();await publish(progressPath,progress);});
  writing=next.catch(()=>{});return next;
 };
 const retainBrowser=(name,value)=>{progress.browser[name]=value;return save();};
 const remember=async(name,path)=>{const actual=await identity(path),file={name,path,bytes:actual.bytes,sha256:actual.sha256};
  files.set(name,file);return file;};
 const stage=async(name,value)=>{
  const path=join(outputDirectory,'observations',name+'.json');
  await publish(path,value,{immutable:true});
  progress.stages[name]=value;await save();return value;
 };
 let appState,stopApplication;
 try{
  for(const name of ['observations','downloads','cli','browser','browser-profiles','attempts','connections','requests'])
   await privateDirectory(join(outputDirectory,name));
  const core=await coreSelection(coreResult,expected);
  need(core.sourceDirectory===directory,'Use the same closed core-created source workspace.');
  const {inspectMerchantRuntime}=await original(ROOT+'sf46-release/runtime-package.mjs');
  runtime=await inspectMerchantRuntime(runtimeDirectory,{load:false});
  need(runtime.state==='READY'&&runtime.dependencyCount===0,'Use the original READY HILA operator installation.');
  installedRoot=await realpath(runtime.sourceRoot);
  const installed=path=>import(pathToFileURL(join(installedRoot,path)).href);
  const sources=[];
  for(const path of CRITICAL){
   const selected=await identity(join(sourceRoot,path)),actual=await identity(join(installedRoot,path));
   need(equal(selected,actual),'Installed source differs from the selected whole component: '+path);
   sources.push({path,...actual});
  }
  const markerPath=join(directory,'workspace.json'),marker=await identity(markerPath),workspace=await lstat(directory,{bigint:true});
  need(equal(await json(markerPath),{schema:'stellar-forge.hila-workspace.v1'})&&await realpath(directory)===directory,
   'Choose the same original HILA workspace.');
  selection={schema:SCHEMA,operationId,actor,directory,outputDirectory,sourceRoot,runtime:runtimeBinding(runtime),
   expected,coreResult,workspace:{marker,device:String(workspace.dev),inode:String(workspace.ino)},sources,
   receiverDirectory:join(outputDirectory,'received-workspace'),
   execution:{node:process.execPath,nodeVersion:process.versions.node,pythonExecutable,chromiumExecutable,playwrightModule}};
  await publish(join(outputDirectory,'selection.json'),selection,{immutable:true});
  progress=await json(progressPath)??{schema:SCHEMA,operationId,createdAt:new Date().toISOString(),
   applications:{},stages:{},browser:{},downloads:{},cli:{}};
  need(progress.schema===SCHEMA&&progress.operationId===operationId,'Receiving progress belongs to another original operation.');
  const complete=await json(join(outputDirectory,'result.json'));
  if(complete){
   need(complete.state==='COMPLETE'&&complete.selectionSha256===sha(encode(selection)),'The completed selection differs.');
   for(const file of complete.files)await verified(file);
   result=complete;return{...complete,reused:true};
  }
  const workflow=await json(join(outputDirectory,'completed-workflow.json'));
  if(workflow){
   need(workflow.state==='COMPLETE'&&workflow.selectionSha256===sha(encode(selection)),'The retained workflow differs.');
   for(const file of workflow.files)await verified(file);
  }
  const {createRuntimeWorkspace,openRuntimeWorkspace}=await installed(ROOT+'distribution/runtime-workspace/model.mjs');
  const appsDirectory=join(outputDirectory,'applications');
  if(!await json(join(appsDirectory,'workspace.json'))){
   if(await stat(appsDirectory))await rename(appsDirectory,join(outputDirectory,'attempts','unpublished-applications-'+randomUUID()));
   await createRuntimeWorkspace({directory:appsDirectory});
  }
  appsModel=await openRuntimeWorkspace({directory:appsDirectory});
  const {startRuntimeWorkspace}=await installed(ROOT+'distribution/runtime-workspace/server.mjs');
  appsServer=await startRuntimeWorkspace({directory:appsDirectory,port:0});
  const appURL=new URL(appsServer.url),token=appURL.hash.slice(1);
  appApi=async(path,value)=>{
   const response=await fetch(appURL.origin+path,{method:value===undefined?'GET':'POST',redirect:'error',
    signal:AbortSignal.timeout(240000),headers:{'x-runtime-workspace-token':token,
     ...(value===undefined?{}:{origin:appURL.origin,'content-type':'application/json'})},
    ...(value===undefined?{}:{body:JSON.stringify(value)})});
   return bounded(response);
  };
  appState=async id=>(await appApi('/api/applications/state?historyLimit=30')).applications.find(item=>item.id===id);
  stopApplication=async owned=>{
   if(!owned?.id)return null;
   let value=await appState(owned.id);need(value,'The retained original Application entry is missing.');
   if(value.current){
    const run=(owned.runs??[]).find(run=>(run.operationId??run.requestId)===value.current.id);
    need(run,'The current Application run is not one of this receiving operation\'s original requests.');
    run.operationId=value.current.id;await save();
   }
   if(!terminal(value)){
    const selected=value.current.id;
    await appApi('/api/applications/stop',{applicationId:owned.id,operationId:selected});
    value=await until(()=>appState(owned.id),x=>x&&terminal(x),'The original HILA Application is still finishing Stop.',120000);
    need(!value.current||value.current.id===selected,'Another original application run appeared during Stop.');
   }
   owned.lastStopped=value.current?{operationId:value.current.id,phase:value.current.phase}:null;
   for(const run of owned.runs??[])if((run.operationId??run.requestId)===value.current?.id){run.operationId=value.current.id;run.terminal=value.current.phase;}
   await save();return value;
  };
  // The original private Applications journal reconciles all prior attempts before
  // either source workspace is opened again. No PID-based replacement is created.
  for(const owned of Object.values(progress.applications))if(owned.id)await stopApplication(owned);
  if(workflow){result=workflow;}
  else{
   const unauthenticated=await fetch(appURL.origin+'/api/applications/state');
   need(unauthenticated.status===401,'The original Applications authentication boundary changed.');
   await unauthenticated.body?.cancel();
   const attached=await appApi('/api/attach',{directory:runtimeDirectory,label:'HILA selected original operator'});
   need(attached.status==='READY','Applications did not receive the original READY runtime.');
   const {createHilaClient,downloadHilaFile}=await installed(HILA+'client.mjs');
   const loaded=await import(pathToFileURL(await realpath(playwrightModule)).href),playwright=loaded.chromium?loaded:loaded.default;
   need(playwright?.chromium?.launchPersistentContext,'Select the actual installed Playwright module.');
   async function setup(name,workspaceDirectory){
    let owned=progress.applications[name];
    if(!owned){owned={name,workspace:workspaceDirectory,label:actor.label.slice(0,90)+' / '+name+' HILA',
      port:await selectLocalPort(),browserProfile:join(outputDirectory,'browser-profiles',name),
      saveRequestId:uuid(operationId+':application:'+name),runs:[]};progress.applications[name]=owned;await save();}
    need(owned.workspace===workspaceDirectory&&Number.isSafeInteger(owned.port)&&owned.port>0&&owned.port<=65535&&
     owned.browserProfile===join(outputDirectory,'browser-profiles',name),'The original application workspace, port or browser profile changed.');
    if(!owned.reviewId){const value=await appApi('/api/applications/review',{runtimeId:attached.runtimeId,kind:'hila',
      label:owned.label,settings:{workspaceDirectory,pythonExecutable,port:owned.port}});owned.reviewId=value.id;await save();}
    if(!owned.id){const value=await appApi('/api/applications/save',{requestId:owned.saveRequestId,reviewId:owned.reviewId});
     owned.id=value.applicationId;owned.revision=value.revision;await save();}
    let value=await appState(owned.id);
    if(!value?.release)await appApi('/api/applications/connect',{applicationId:owned.id});
    value=await until(()=>appState(owned.id),x=>{
     need(x&&!x.error,'The original HILA application is unavailable.');
     if(x.adoption?.phase==='FAILED'&&!x.adoption.active)throw Object.assign(new Error(x.adoption.state?.error?.message??'Original runtime adoption failed'),
      {code:'HILA_APPLICATION_ADOPTION',original:x.adoption});
     return Boolean(x.release);
    },'Original HILA runtime adoption did not complete.');
    owned.release=value.release;await save();return owned;
   }
   async function start(owned){
    let current=await appState(owned.id);
    if(current?.current&&!current.current.active&&['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(current.current.phase)){
     await appApi('/api/applications/recover',{applicationId:owned.id,operationId:current.current.id});current=await appState(owned.id);
    }
    if(terminal(current)){
     let run=owned.runs.at(-1);
     if(!run||run.terminal){run={requestId:uuid(operationId+':run:'+owned.name+':'+owned.runs.length),
       createdAt:new Date().toISOString()};owned.runs.push(run);await save();}
     if(!run.reviewId){const value=await appApi('/api/applications/start-review',{applicationId:owned.id});run.reviewId=value.id;await save();}
     const started=await appApi('/api/applications/start',{applicationId:owned.id,requestId:run.requestId,reviewId:run.reviewId});
     need(started.operationId===run.requestId,'Original Applications start returned a different retained request identity.');
     run.operationId=started.operationId;await save();
    }
    current=await until(()=>appState(owned.id),x=>{
     need(x&&!x.error,'The original saved application became unavailable.');
     if(x.current&&!x.current.active&&['FAILED','SUCCEEDED','CANCELLED'].includes(x.current.phase))
      throw Object.assign(new Error('Original HILA command ended before its verified startup'),{code:'HILA_APPLICATION_START',original:x.current});
     return x.phase==='RUNNING'&&x.current?.active&&typeof x.current.privateUrl==='string';
    },'The original HILA application produced no verified startup.');
    need(owned.runs.some(run=>(run.operationId??run.requestId)===current.current.id),
     'The active Application is not this receiving operation\'s original run.');
    const launched=current.current.url?.original;
    need(launched?.schema==='stellar-forge.hila-workspace-launch.v1'&&launched.workspace===owned.workspace&&
     new URL(current.current.privateUrl).origin==='http://127.0.0.1:'+owned.port,
     'Original Applications observed a different HILA workspace or original browser origin.');
    await publish(join(outputDirectory,'connections',owned.name+'.json'),{url:current.current.privateUrl,launch:launched});
    const client=createHilaClient(current.current.privateUrl,{timeoutMs:240000});clients.add(client);
    const actual=await client.launch();
    need(actual.workspace===owned.workspace&&actual.bindingSha256===launched.bindingSha256&&actual.pid===launched.pid,
     'Authenticated HILA startup differs from its original Applications observation.');
    owned.lastObserved={operationId:current.current.id,bindingSha256:launched.bindingSha256};await save();
    return{owned,client,url:current.current.privateUrl};
   }
   async function pageFor(opened,name){
    await privateDirectory(opened.owned.browserProfile);
    const context=await playwright.chromium.launchPersistentContext(opened.owned.browserProfile,{
     executablePath:chromiumExecutable,headless:true,acceptDownloads:true,
     downloadsPath:join(outputDirectory,'downloads'),args:['--disable-dev-shm-usage']});
    contexts.add(context);
    const page=context.pages()[0]??await context.newPage();page.setDefaultTimeout(90000);
    await page.goto(opened.url,{waitUntil:'domcontentloaded'});
    return{page,context,name,profile:opened.owned.browserProfile};
   }
   async function closePage(view){if(!view)return;await view.context.close();contexts.delete(view.context);}
   async function closeClient(client){if(!client)return;await client.close();clients.delete(client);}
   async function originalCliProcesses(workspaceDirectory,args){
    const nodeArgs=[join(installedRoot,HILA+'cli.mjs'),'--python',pythonExecutable,'--workspace',workspaceDirectory,...args];
    const pythonArgs=['-B',join(installedRoot,HILA+'hila_cli.py'),'--workspace',workspaceDirectory,...args];
    const selected=[];
    for(const name of await readdir('/proc')){
     if(!/^\d+$/.test(name)||Number(name)===process.pid)continue;
     let body;
     try{body=await readFile('/proc/'+name+'/cmdline');}
     catch(error){if(['ENOENT','ESRCH'].includes(error.code))continue;throw error;}
     const argv=body.toString('utf8').split('\0').filter(Boolean);
     if(equal(argv.slice(1),nodeArgs)||equal(argv.slice(1),pythonArgs))selected.push(Number(name));
    }
    return selected;
   }
   async function drainOriginalCli(workspaceDirectory,args){
    const observed=await originalCliProcesses(workspaceDirectory,args);
    if(observed.length)await until(()=>originalCliProcesses(workspaceDirectory,args),value=>value.length===0,
     'The accepted original HILA CLI process is still completing; retain its same operation.',240000);
    return observed;
   }
   async function cli(name,workspaceDirectory,args,{repeat=false}={}){
    const folder=join(outputDirectory,'cli',name);await privateDirectory(folder);
    const request={executable:process.execPath,args:[join(installedRoot,HILA+'cli.mjs'),'--python',pythonExecutable,
      '--workspace',workspaceDirectory,...args],workspaceDirectory};
    await publish(join(folder,'request.json'),request,{immutable:true});
    await drainOriginalCli(workspaceDirectory,args);
    let prior=await json(join(folder,'result.json'));
    const names=(await readdir(folder)).filter(name=>/^attempt-\d+\.json$/.test(name)).sort();
    if(!prior&&!repeat){
     for(const name of names){
      const observed=await json(join(folder,name));
      if(observed?.exitCode!==0)continue;
      need(equal(observed.request,request),'The retained original CLI request changed.');
      await verified(observed.stdoutFile);await verified(observed.stderrFile);
      JSON.parse(await readFile(observed.stdoutFile.path,'utf8'));
      prior=observed;await publish(join(folder,'result.json'),prior);break;
     }
    }
    if(prior&&!repeat){await verified(prior.stdoutFile);await verified(prior.stderrFile);
     need(prior.exitCode===0,'The retained CLI failure needs its original continuation.');return JSON.parse(await readFile(prior.stdoutFile.path,'utf8'));}
    const attempt=(await readdir(folder)).filter(name=>/^attempt-\d+\.json$/.test(name)).length;
    const tag=String(attempt).padStart(4,'0')+'-'+randomUUID(),stdout=join(folder,'stdout-'+tag+'.json'),stderr=join(folder,'stderr-'+tag+'.log');
    const out=await open(stdout,'wx',0o600),err=await open(stderr,'wx',0o600);
    const intent={schema:SCHEMA,operationId,name,index:attempt,request,stdout,stderr,createdAt:new Date().toISOString()};
    await publish(join(folder,'intent-'+tag+'.json'),intent,{immutable:true});
    let exit,child;
    try{
     child=spawn(request.executable,request.args,{shell:false,cwd:outputDirectory,
      env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',SF30_XML_NODE:process.execPath},stdio:['ignore',out.fd,err.fd]});
     exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
     await out.sync();await err.sync();
    }catch(error){
     await publish(join(folder,'failed-'+tag+'.json'),{...intent,error:detail(error),observedAt:new Date().toISOString()},{immutable:true});throw error;
    }finally{await out.close();await err.close();}
    const receipt={...intent,exitCode:exit.code,signal:exit.signal,endedAt:new Date().toISOString(),
     stdoutFile:{path:stdout,...await identity(stdout)},stderrFile:{path:stderr,...await identity(stderr)}};
    await publish(join(folder,'attempt-'+String(attempt).padStart(4,'0')+'.json'),receipt,{immutable:true});
    need(exit.code===0,'Original HILA CLI failed; exact complete stderr is retained at '+stderr);
    await publish(join(folder,'result.json'),receipt);
    const value=JSON.parse(await readFile(stdout,'utf8'));
    progress.cli[name]={stdoutFile:receipt.stdoutFile,stderrFile:receipt.stderrFile};await save();return value;
   }
   async function cliCall(name,workspaceDirectory,operation,args,options){
    const input=join(outputDirectory,'requests',name+'.json');
    await publish(input,{operation,args},{immutable:true});
    return cli(name,workspaceDirectory,['call','--input',input],options);
   }
   async function download(name,call){
    const old=progress.downloads[name];
    if(old){await verified(old);files.set('downloads/'+name,old);return old;}
    const path=join(outputDirectory,'downloads',name);
    const value=await downloadHilaFile(await call(),path);
    const file={name:'downloads/'+name,path,bytes:value.bytes,sha256:value.sha256};
    progress.downloads[name]=file;await save();files.set(file.name,file);return file;
   }
   async function completeRows(client,edition){
    const rows=[];let offset=0;
    do{const page=await client.rows(edition.id,{offset,limit:1000});
     need(page.edition===edition.id&&page.offset===offset&&page.total===edition.rows&&Array.isArray(page.rows),
      'The original respondent cursor changed its complete edition.');
     rows.push(...page.rows);if(page.nextOffset===null)break;
     need(page.nextOffset===offset+page.rows.length&&page.nextOffset>offset,'The original respondent cursor did not advance.');
     offset=page.nextOffset;
    }while(true);
    need(rows.length===edition.rows,'The typed client did not receive every original coded source row.');return rows;
   }
   const sourceOwned=await setup('source',directory),opened=await start(sourceOwned);
   sourceClient=opened.client;
   const before=verifyView(await sourceClient.review(expected.id,expected.revision),expected);
   const beforeReport=verifyReport(await sourceClient.report(before.id,{revision:before.revision}),before);
   need(equal(beforeReport.editions.map(x=>x.counts),core.counts),'The installed original report changed the core-observed full counts.');
   await stage('source-before-review',before);await stage('source-before-report',beforeReport);
   const sourceState=await sourceClient.state();
   need(sourceState.questionnaires.length>=1&&before.editions.length===2,'Retain both original response editions and their questionnaire.');
   const editions=[];
   for(const id of before.editions){
    const edition=await sourceClient.edition(id),rows=await completeRows(sourceClient,edition);
    const recorded=core.editions.find(x=>x.id===edition.id);
    need(recorded&&recorded.rows===edition.rows&&recorded.source===edition.source,'Original native edition identity changed.');
    editions.push(edition);await stage('coded-rows-'+edition.id,{edition:edition.id,rows});
   }
   const form=await sourceClient.questionnaire(editions[0].questionnaire);
   need(form.sha256===core.questionnaire.sha256&&form.bytes===core.questionnaire.bytes&&form.languages.length===4&&
    Object.values(form.dimensions).reduce((count,rows)=>count+rows.length,0)===46,'The complete original questionnaire changed.');
   await stage('questionnaire',form);await stage('editions',editions);
   const browserFolder=join(outputDirectory,'browser','source');await privateDirectory(browserFolder);
   const sourcePage=await pageFor(opened,'source');
   const reviewed=await runHilaBrowserReceiving({page:sourcePage.page,client:sourceClient,directory,
    outputDirectory:browserFolder,operationId:operationId+'-source-browser',actor,before,
    checkpoint:progress.browser.source??null,retain:value=>retainBrowser('source',value)});
   need(reviewed?.reviewed&&reviewed.request&&Array.isArray(reviewed.files),'The complete original browser result is required.');
   verifyView(reviewed.reviewed,{id:before.id,revision:before.revision+1,definitionSha256:reviewed.reviewed.definitionSha256});
   verifyReport(reviewed.report,reviewed.reviewed);
   need(equal(beforeReport.editions,reviewed.report.editions)&&equal(beforeReport.comparison,reviewed.report.comparison)&&
    equal(reviewed.reviewed.name,before.name)&&equal(reviewed.reviewed.notes,before.notes)&&
    equal(reviewed.reviewed.editions,before.editions)&&
    equal(reviewed.reviewed.rules,before.rules)&&equal(reviewed.reviewed.selection,before.selection)&&
    equal(reviewed.reviewed.cellDecisions,before.cellDecisions),'The named browser review changed source membership, rules or prior cell decisions.');
   need(reviewed.reviewed.rowDecisions.length===before.rowDecisions.length+1&&
    before.rowDecisions.every(row=>reviewed.reviewed.rowDecisions.some(x=>equal(x,row))),
    'The original browser review must preserve every earlier row decision and add its one named note.');
   const addedDecision=reviewed.reviewed.rowDecisions.find(row=>!before.rowDecisions.some(x=>equal(x,row)));
   need(addedDecision?.decision==='note'&&addedDecision.reviewer===actor.label,
    'The browser adds one attributed source-row note.');
   const lookup=await sourceClient.request(reviewed.request.requestId);
   need(lookup.kind==='review.save'&&equal(lookup.input,reviewed.request)&&equal(lookup.result,reviewed.reviewed),
    'The saved UI request did not replay through the original complete native lookup.');
   need(equal(await sourceClient.saveReview(reviewed.request),reviewed.reviewed),'Typed-client replay changed the original UI request.');
   await stage('browser-request',reviewed.request);await stage('browser-native-lookup',lookup);
   await stage('source-reviewed',reviewed.reviewed);await stage('source-reviewed-report',reviewed.report);
   const browserFiles=new Map();
   for(const file of reviewed.files){
    need(typeof file.name==='string'&&!browserFiles.has(file.name)&&inside(file.path,browserFolder),'The browser file selection is invalid.');
    await verified(file);browserFiles.set(file.name,file);
   }
   const downloads=[
    ['review.zip',()=>sourceClient.exportReview(before.id,{revision:reviewed.reviewed.revision})],
    ['report.zip',()=>sourceClient.exportReport(before.id,{revision:reviewed.reviewed.revision})],
    ['public.zip',()=>sourceClient.exportReport(before.id,{revision:reviewed.reviewed.revision,public:true})],
    ['report.html',()=>sourceClient.offlineHtml(before.id,{revision:reviewed.reviewed.revision})]
   ];
   for(const [name,call]of downloads){
    const actual=await download('source-'+name,call),browserFile=browserFiles.get(name);
    need(browserFile&&browserFile.bytes===actual.bytes&&browserFile.sha256===actual.sha256,
     'Whole typed-client and browser downloads differ: '+name);
   }
   const browserJson=browserFiles.get('report.json');need(browserJson,'The full original browser JSON export is missing.');
   need(equal(JSON.parse(await readFile(browserJson.path,'utf8')),reviewed.report),'The complete browser JSON report changed.');
   for(const file of reviewed.files)files.set('browser/source/'+file.name,{...file,name:'browser/source/'+file.name});
   const sourcePacket=progress.downloads['source-review.zip'];
   await closePage(sourcePage);await closeClient(sourceClient);sourceClient=null;
   await stopApplication(sourceOwned);
   const savedByCli=await cliCall('source-same-ui-request',directory,'review.save',reviewed.request);
   need(equal(savedByCli,reviewed.reviewed),'Original installed CLI did not replay the same saved browser request.');
   const cliReport=await cliCall('source-full-report',directory,'report',{id:before.id,revision:reviewed.reviewed.revision});
   need(equal(cliReport,reviewed.report),'Original installed CLI returned another complete report.');
   const cliPath=join(outputDirectory,'downloads','cli-source-review.zip');
   const exported=await cliCall('source-full-packet',directory,'review.export',{id:before.id,revision:reviewed.reviewed.revision,output:cliPath});
   const repeated=await cliCall('source-full-packet',directory,'review.export',{id:before.id,revision:reviewed.reviewed.revision,output:cliPath},{repeat:true});
   need(exported.file===cliPath&&exported.bytes===sourcePacket.bytes&&exported.sha256===sourcePacket.sha256&&
    equal(repeated,exported),'The original complete CLI archive or same-output replay changed.');
   const cliPacket=await remember('downloads/cli-source-review.zip',cliPath);
   need(cliPacket.bytes===sourcePacket.bytes&&cliPacket.sha256===sourcePacket.sha256,
    'The retained complete CLI packet differs from the original selected browser packet.');
   await stage('source-cli-report',cliReport);

   const receiver=selection.receiverDirectory,initializedPath=join(outputDirectory,'receiver-initialized.json');
   const initialized=await json(initializedPath);
   if(!initialized){
    need(!progress.applications.received&&!progress.browser.received,
     'The uninitialized recipient already has an original receiving consumer.');
    progress.receiverInitialization??={attempts:[]};
    const state=progress.receiverInitialization;
    need(Array.isArray(state.attempts),'Retain the original recipient initialization attempts.');
    let attempt=state.attempts.at(-1);
    if(!attempt||attempt.preserved){
     attempt={index:state.attempts.length,directory:receiver,createdAt:new Date().toISOString()};
     state.attempts.push(attempt);await save();
    }
    need(attempt.directory===receiver,'The original recipient initialization directory changed.');
    await drainOriginalCli(receiver,['init']);await drainOriginalCli(receiver,['list']);
    if(attempt.preserve){
     const retained=await stat(attempt.preserve),current=await stat(receiver);
     need(!(retained&&current),'Both original initialization locations are occupied; preserve them.');
     if(current)await rename(receiver,attempt.preserve);
     need(await stat(attempt.preserve),'The retained initialization attempt disappeared.');
     attempt.preserved=true;await save();
     attempt={index:state.attempts.length,directory:receiver,createdAt:new Date().toISOString()};
     state.attempts.push(attempt);await save();
    }
    let initial;
    try{
     if(!await stat(receiver))await cli('receiver-init-'+attempt.index,receiver,['init']);
     initial=await cli('receiver-initial-state-'+attempt.index,receiver,['list'],{repeat:true});
    }catch(error){
     await drainOriginalCli(receiver,['init']);await drainOriginalCli(receiver,['list']);
     attempt.failure={error:detail(error),observedAt:new Date().toISOString()};await save();
     if(await stat(receiver)){
      const preserve=join(outputDirectory,'attempts','recipient-init-'+String(attempt.index).padStart(4,'0'));
      need(!await stat(preserve),'The previous recipient attempt already occupies its retained path.');
      attempt.preserve=preserve;await save();
      await rename(receiver,preserve);attempt.preserved=true;await save();
     }
     throw error;
    }
    need(Array.isArray(initial.reviews)&&initial.reviews.length===0,
     'The original pre-import recipient contains saved review history; preserve its complete state.');
    const marker=await identity(join(receiver,'workspace.json'));
    await publish(initializedPath,{directory:receiver,marker,attempt:attempt.index},{immutable:true});
   }else{
    need(initialized.directory===receiver&&equal(initialized.marker,await identity(join(receiver,'workspace.json'))),
     'The original detached receiving workspace identity changed.');
   }
   const receivedOwned=await setup('received',receiver),receivedOpened=await start(receivedOwned);receivedClient=receivedOpened.client;
   const receivedFolder=join(outputDirectory,'browser','received');await privateDirectory(receivedFolder);
   const receivedPage=await pageFor(receivedOpened,'received');
   const receivedBrowser=await inspectHilaReceivedPage({page:receivedPage.page,client:receivedClient,directory:receiver,
    outputDirectory:receivedFolder,operationId:operationId+'-received-browser',actor,
    review:reviewed.reviewed,report:reviewed.report,name:'independent-received',
    checkpoint:progress.browser.received??null,retain:value=>retainBrowser('received',value),receiveFile:sourcePacket});
   verifyView(await receivedClient.review(before.id,reviewed.reviewed.revision),selectedView(reviewed.reviewed));
   need(equal(await receivedClient.report(before.id,{revision:reviewed.reviewed.revision}),reviewed.report),
    'The complete independently rebuilt report differs from the original selected source.');
   const receivedPacket=await download('received-revision-'+reviewed.reviewed.revision+'.zip',
    ()=>receivedClient.exportReview(before.id,{revision:reviewed.reviewed.revision}));
   need(receivedPacket.sha256===sourcePacket.sha256&&receivedPacket.bytes===sourcePacket.bytes,
    'The independent full packet export changed original source/history/report bytes.');
   const receiveReplay=await receivedClient.receive(await readFile(sourcePacket.path));
   need(receiveReplay.review.id===before.id&&receiveReplay.review.revision===reviewed.reviewed.revision,
    'The full typed-client packet replay selected another original review.');
   await stage('received-browser',receivedBrowser.receipt??receivedBrowser);
   const localPath=join(outputDirectory,'requests','received-local-review.json');
   let localInput=await json(localPath);
   if(!localInput){
    localInput={requestId:uuid(operationId+':received-local-review'),id:before.id,expectedRevision:reviewed.reviewed.revision,
     ...definition(reviewed.reviewed),review:{status:'reviewed',reviewer:actor.label,
      note:'Independent receiving confirmed the complete original questionnaire, both synthetic editions and retained review decisions.'}};
    await publish(localPath,localInput,{immutable:true});
   }
   const local=await receivedClient.saveReview(localInput);
   need(local.id===before.id&&local.revision===reviewed.reviewed.revision+1&&
    equal(definition(local),Object.fromEntries(FIELDS.map(key=>[key,localInput[key]]))),
    'The original recipient local continuation changed its complete definition.');
   const localLookup=await receivedClient.request(localInput.requestId);
   need(equal(localLookup.input,localInput)&&equal(localLookup.result,local),'Recipient native request lookup lost its full source/input.');
   const localReport=verifyReport(await receivedClient.report(local.id,{revision:local.revision}),local);
   need(sameCounts(reviewed.report,localReport),'Recipient named continuation changed the original full source cohort.');
   const older=await receivedClient.receive(await readFile(sourcePacket.path));
   need(older.currentRevision===local.revision&&equal(await receivedClient.review(local.id),local),
    'Receiving the older complete packet lost the later local review.');
   await stage('received-local-review',local);await stage('received-local-report',localReport);
   const finalPacket=await download('received-complete-history.zip',()=>receivedClient.exportReview(local.id,{revision:local.revision}));
   await download('received-private-report.zip',()=>receivedClient.exportReport(local.id,{revision:local.revision}));
   await download('received-public-aggregates.zip',()=>receivedClient.exportReport(local.id,{revision:local.revision,public:true}));
   await download('received-report.html',()=>receivedClient.offlineHtml(local.id,{revision:local.revision}));
   await closePage(receivedPage);await closeClient(receivedClient);receivedClient=null;await stopApplication(receivedOwned);
   const cold=await cliCall('recipient-cold-reopen',receiver,'review',{id:local.id,revision:local.revision});
   need(equal(cold,local),'Cold installed CLI reopen lost the complete recipient continuation.');
   const coldReport=await cliCall('recipient-cold-report',receiver,'report',{id:local.id,revision:local.revision});
   need(equal(coldReport,localReport),'Cold CLI reopen changed the complete recipient report.');
   await stage('recipient-cold-reopen',cold);
   const finalOpened=await start(receivedOwned);receivedClient=finalOpened.client;
   const finalPage=await pageFor(finalOpened,'reopened'),reopenFolder=join(outputDirectory,'browser','reopened');
   await privateDirectory(reopenFolder);
   const reopened=await inspectHilaReceivedPage({page:finalPage.page,client:receivedClient,directory:receiver,
    outputDirectory:reopenFolder,operationId:operationId+'-reopened-browser',actor,review:local,report:localReport,
    name:'cold-reopened',checkpoint:progress.browser.reopened??null,
    retain:value=>retainBrowser('reopened',value)});
   await stage('reopened-browser',reopened.receipt??reopened);
   await closePage(finalPage);await closeClient(receivedClient);receivedClient=null;await stopApplication(receivedOwned);
   const applications=(await appApi('/api/applications/state?historyLimit=30')).applications.filter(x=>[sourceOwned.id,receivedOwned.id].includes(x.id));
   need(applications.length===2&&applications.every(x=>terminal(x)&&x.phase==='STOPPED'),'Both original HILA Applications must complete Stop.');
   const history=await cliCall('recipient-final-history',receiver,'history',{id:local.id});
   need(history.length===local.revision&&equal(history.at(-1),local),'Original full recipient history did not survive reopen.');
   await stage('recipient-history',history);
   // Every customer file is selected explicitly. Private connections, process
   // records, browser storage and transient request logs remain in this operation.
   for(const [name,file]of Object.entries(progress.downloads)){await verified(file);files.set('downloads/'+name,{...file,name:'downloads/'+name});}
   for(const name of ['source-before-review','source-before-report','source-reviewed','source-reviewed-report',
    'questionnaire','editions','source-cli-report','received-local-review','received-local-report','recipient-cold-reopen','recipient-history'])
    await remember('observations/'+name+'.json',join(outputDirectory,'observations',name+'.json'));
   result={schema:SCHEMA,state:'COMPLETE',operationId,actor,selectionSha256:sha(encode(selection)),completedAt:new Date().toISOString(),
    runtime:runtimeBinding(runtime),coreResult,
    source:{directory,original:expected,reviewed:selectedView(reviewed.reviewed),report:reviewed.reviewed.report},
    received:{directory:receiver,review:selectedView(local),report:local.report,historyRevisions:history.length,packet:finalPacket},
    applications:applications.map(x=>({id:x.id,label:x.label,phase:x.phase,revision:x.revision,totalRuns:x.totalRuns})),
    browser:{source:reviewed.receipt,received:receivedBrowser.receipt,reopened:reopened.receipt},
    files:[...files.values()].sort((a,b)=>a.name.localeCompare(b.name)),
    notice:core.notice,
    checks:{originalQuestionnaire:true,completeNativeEditions:true,sameUiRequest:true,typedClient:true,installedCli:true,
     fullDownloads:true,independentReceiving:true,olderPacketPreservesLocal:true,coldReopen:true,applicationsStopped:true}};
   await publish(join(outputDirectory,'completed-workflow.json'),result,{immutable:true});
  }
 }catch(error){failure=error;await publish(join(outputDirectory,'attempts','error-'+randomUUID()+'.json'),
   {schema:SCHEMA,operationId,at:new Date().toISOString(),error:detail(error)}).catch(()=>{});}
 finally{
  const errors=[];
  for(const context of [...contexts])try{await context.close();contexts.delete(context);}catch(error){errors.push(detail(error));}
  for(const client of [...clients])try{await client.close();clients.delete(client);}catch(error){errors.push(detail(error));}
  if(appApi&&stopApplication)for(const owned of Object.values(progress?.applications??{}))
   try{await stopApplication(owned);}catch(error){errors.push({applicationId:owned.id,...detail(error)});}
  if(appsServer)try{await appsServer.close();}catch(error){errors.push(detail(error));}
  if(appsModel)try{await appsModel.close();}catch(error){errors.push(detail(error));}
  await writing;
  if(errors.length){await publish(join(outputDirectory,'attempts','cleanup-'+randomUUID()+'.json'),errors).catch(()=>{});
   failure??=Object.assign(new Error('Original HILA cleanup is retained for the same Applications continuation.'),{code:'HILA_OPERATOR_CLEANUP',errors});}
  try{if(result&&!failure)await publish(join(outputDirectory,'result.json'),result,{immutable:true});}
  finally{await lease.close();}
 }
 if(failure)throw failure;
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 need(process.argv.length===3,'node operator.mjs /absolute/retained-input.json');
 const input=await json(resolve(process.argv[2]));const result=await runHilaOperatorReceiving(input);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
