// MIT. Complete installed HUMANITARIAN Applications, typed-client, CLI and browser receiving.
// The caller owns the native foreground; the original core workspace is closed.
import { constants } from 'node:fs';
import { mkdir, open, readFile, lstat, realpath, rename, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join, resolve, isAbsolute, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runHumanitarianBrowserReceiving, inspectHumanitarianReceivedPage } from './browser.mjs';

const SCHEMA='stellar-forge.humanitarian-operator-receiving.v1';
const ROOT='stellar/scf-starforge-20261009/';
const SDK=ROOT+'sf30-seller-sdk/';
const HUMANITARIAN=SDK+'humanitarian/';
const FIELDS=['id','name','editions','aliases','reviewer','notes','rowPolicy'];
const HASH=/^[a-f0-9]{64}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const sorted=value=>Array.isArray(value)?value.map(sorted):plain(value)?
 Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
const encode=value=>Buffer.from(JSON.stringify(sorted(value),null,2)+'\n');
const compact=value=>Buffer.from(JSON.stringify(sorted(value))+'\n');
const sha=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>encode(a).equals(encode(b));
const need=(value,message)=>{if(!value)throw Object.assign(new Error(message),{code:'HUMANITARIAN_OPERATOR_RECEIVING'});};
const detail=error=>({code:String(error.code??'HUMANITARIAN_OPERATOR_ERROR'),message:String(error.message??error),stack:String(error.stack??'')});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const uuid=value=>{const id=sha(value);return id.slice(0,8)+'-'+id.slice(8,12)+'-4'+id.slice(13,16)+'-a'+id.slice(17,20)+'-'+id.slice(20,32);};
const inside=(path,root)=>path===root||path.startsWith(root+'/');
const terminal=app=>!app.current?.active&&!['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(app.current?.phase);
const definition=view=>Object.fromEntries(FIELDS.map(key=>[key,view.definition[key]]));
const selectedView=view=>({id:view.id,revision:view.revision,report:view.report});
const semanticReport=report=>Object.fromEntries(Object.entries(report).filter(([key])=>key!=='files'));
const sameReport=(before,after)=>equal(semanticReport(before),semanticReport(after));
const RUNTIME_FIELDS=['installationId','profileId','profileSha256','lockSha256','sourceCommit',
 'sourceManifestSha256','directory','sourceRoot','dependencyCount'];
const runtimeBinding=value=>Object.fromEntries(RUNTIME_FIELDS.map(key=>[key,value[key]]));
const CRITICAL=[
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/_bootstrap.py",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/humanitarian_source.py",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/humanitarian_reference.py",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/humanitarian_reports.py",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/humanitarian_workspace.py",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/humanitarian_handover.py",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/humanitarian_http.py",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/humanitarian_cli.py",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/humanitarian_managed.py",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/cli.mjs",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/client.mjs",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/client.d.mts",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/public/index.html",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/public/style.css",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/public/app.js",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/README.md",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/OPERATOR.md",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/receiving/operate.py",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/receiving/INPUTS_AND_HANDOVER.md",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/receiving/runtime.mjs",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/receiving/operator.mjs",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/receiving/browser.mjs",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/receiving/BROWSER.md",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/receiving/complete.mjs",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/receiving/package.py",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/humanitarian/receiving/INSTALLED.md",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/xml/xml_source.py",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/xml/workspace.py",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/xml/server.py",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/xml/native.mjs",
  "stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-handler.mjs",
  "stellar/scf-starforge-20261009/distribution/contributions/humanitarian.json",
  "stellar/scf-starforge-20261009/distribution/selections/humanitarian-operator.json",
  "stellar/scf-starforge-20261009/distribution/selections/HUMANITARIAN_OPERATOR.md",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/application-humanitarian.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/providers/humanitarian.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/model.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/server.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/applications-core.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/application-providers.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/managed-workspace.mjs",
  "stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs",
  "stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs"
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
 const stage=join(dirname(path),'.humanitarian-operator-'+randomUUID()+'.partial'),file=await open(stage,'wx',0o600);
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
  {code:'HUMANITARIAN_APPLICATION_HTTP',status:response.status,body:value});
 return value;
}
async function until(read,accept,message,timeout=240000){
 const end=Date.now()+timeout;let last;
 do{last=await read();if(await accept(last))return last;await pause(500);}while(Date.now()<end);
 throw Object.assign(new Error(message),{code:'HUMANITARIAN_ORIGINAL_WAIT',last});
}
function verifyView(view,selected){
 need(view?.schema==='stellar-forge.humanitarian-review.v1'&&view.id===selected.id&&view.revision===selected.revision&&
  (!selected.report||view.report===selected.report)&&plain(view.definition)&&view.definition.id===view.id,
  'The complete selected native review identity changed.');
 need(FIELDS.filter(key=>key!=='editions').every(key=>equal(view.definition[key],view[key]))&&
  equal(view.definition.editions,view.editions.map(row=>Object.fromEntries(['source','mapping','label','period'].map(key=>[key,row[key]])))),
  'The saved full review and its original definition disagree.');
 return view;
}
function verifyReport(report,view){
 need(report?.schema==='stellar-forge.humanitarian-report.v1'&&report.review===view.id&&
  report.revision===view.revision&&report.id===view.report&&equal(report.definition,view.definition),
  'The full report is not from the original selected native review.');
 const semantic=Object.fromEntries(Object.entries(report).filter(([key])=>!['id','files'].includes(key)));
 need(sha(compact(semantic))===report.id,'The complete saved report semantic identity changed.');
 return report;
}
function sameResults(before,after){
 return equal(before.editions,after.editions)&&equal(before.outputs,after.outputs)&&
  equal(before.comparison,after.comparison)&&equal(before.counts,after.counts)&&
  equal(before.issues,after.issues)&&before.logicalSha256===after.logicalSha256;
}
async function coreSelection(file,expected){
 await verified(file);const value=await json(file.path);
 need(value?.schema==='stellar-forge.humanitarian-operated-case.v1'&&value.status==='COMPLETE'&&
  value.operation==='HUMANITARIAN-COMPLETE-RECEIVING-7108-20261013',
  'Use the completed original humanitarian operating result.');
 need(value.review===expected.id&&value.sourceRevision===expected.revision&&Array.isArray(value.files),
  'The operating case selected another original review.');
 const root=dirname(file.path),names=new Set();
 for(const wanted of value.files){
  const name=wanted.path;
  need(typeof name==='string'&&name&&!isAbsolute(name)&&name.split('/').every(x=>x&&x!=='.'&&x!=='..')&&!names.has(name),
   'The core result contains an invalid or duplicate complete member name.');
  names.add(name);await verified({path:join(root,name),bytes:wanted.bytes,sha256:wanted.sha256});
 }
 return value;
}

/** All storage/model/controller lifetimes belong to the calling original operation. */
export async function runHumanitarianOperatorReceiving({
 directory,outputDirectory,sourceRoot,runtimeDirectory,operationId,actor,expected,coreResult,
 pythonExecutable,chromiumExecutable,playwrightModule
}={}){
 process.umask(0o077);
 need(typeof operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,139}$/.test(operationId),
  'Continue one original HUMANITARIAN operation.');
 need(plain(actor)&&typeof actor.id==='string'&&actor.id.trim()&&actor.id.length<=160&&
  typeof actor.label==='string'&&actor.label.trim()&&actor.label.length<=160,'Name the actual receiving operator.');
 need(plain(expected)&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(expected.id??'')&&
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
 const browserObservations=async(folder,prefix,role)=>{
  need(/^[a-z0-9][a-z0-9-]{0,39}$/.test(prefix),'Select the original browser observation prefix.');
  const selected=[],pattern=new RegExp('^'+prefix+'-(history|reference|source-[a-f0-9]{64}|mapping-[a-f0-9]{64}|alias-[a-f0-9]{64}|rows-[0-9]+-[0-9]+|output-[0-9]+-[0-9]+|comparison-[0-9]+)\\.json$');
  for(const name of (await readdir(join(folder,'observations'))).sort()){
   if(!pattern.test(name))continue;
   selected.push(await remember('browser/'+role+'/observations/'+name,join(folder,'observations',name)));
  }
  need(selected.some(f=>f.path.endsWith('/'+prefix+'-history.json'))&&
   selected.some(f=>f.path.endsWith('/'+prefix+'-reference.json')),'Retain the complete Page history/reference observations.');
  await stage(role+'-browser-observations',selected);
  return selected;
 };
 let appState,stopApplication;
 try{
  for(const name of ['observations','downloads','cli','browser','browser-profiles','attempts','connections','requests'])
   await privateDirectory(join(outputDirectory,name));
  const core=await coreSelection(coreResult,expected);
  need(core.sourceWorkspace===directory,'Use the same closed core-created source workspace.');
  const {inspectMerchantRuntime}=await original(ROOT+'sf46-release/runtime-package.mjs');
  runtime=await inspectMerchantRuntime(runtimeDirectory,{load:false});
  need(runtime.state==='READY'&&runtime.dependencyCount===0,'Use the original READY HUMANITARIAN operator installation.');
  installedRoot=await realpath(runtime.sourceRoot);
  const installed=path=>import(pathToFileURL(join(installedRoot,path)).href);
  const sources=[];
  for(const path of CRITICAL){
   const selected=await identity(join(sourceRoot,path)),actual=await identity(join(installedRoot,path));
   need(equal(selected,actual),'Installed source differs from the selected whole component: '+path);
   sources.push({path,...actual});
  }
  const markerPath=join(directory,'workspace.json'),marker=await identity(markerPath),workspace=await lstat(directory,{bigint:true});
  need(equal(await json(markerPath),{schema:'stellar-forge.humanitarian-workspace.v1'})&&await realpath(directory)===directory,
   'Choose the same original HUMANITARIAN workspace.');
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
    value=await until(()=>appState(owned.id),x=>x&&terminal(x),'The original HUMANITARIAN Application is still finishing Stop.',120000);
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
   const attached=await appApi('/api/attach',{directory:runtimeDirectory,label:'HUMANITARIAN selected original operator'});
   need(attached.status==='READY','Applications did not receive the original READY runtime.');
   const {createHumanitarianClient,downloadHumanitarianFile}=await installed(HUMANITARIAN+'client.mjs');
   const loaded=await import(pathToFileURL(await realpath(playwrightModule)).href),playwright=loaded.chromium?loaded:loaded.default;
   need(playwright?.chromium?.launchPersistentContext,'Select the actual installed Playwright module.');
   async function setup(name,workspaceDirectory){
    let owned=progress.applications[name];
    if(!owned){owned={name,workspace:workspaceDirectory,label:actor.label.slice(0,90)+' / '+name+' HUMANITARIAN',
      port:await selectLocalPort(),browserProfile:join(outputDirectory,'browser-profiles',name),
      saveRequestId:uuid(operationId+':application:'+name),runs:[]};progress.applications[name]=owned;await save();}
    need(owned.workspace===workspaceDirectory&&Number.isSafeInteger(owned.port)&&owned.port>0&&owned.port<=65535&&
     owned.browserProfile===join(outputDirectory,'browser-profiles',name),'The original application workspace, port or browser profile changed.');
    if(!owned.reviewId){const value=await appApi('/api/applications/review',{runtimeId:attached.runtimeId,kind:'humanitarian',
      label:owned.label,settings:{workspaceDirectory,pythonExecutable,port:owned.port}});owned.reviewId=value.id;await save();}
    if(!owned.id){const value=await appApi('/api/applications/save',{requestId:owned.saveRequestId,reviewId:owned.reviewId});
     owned.id=value.applicationId;owned.revision=value.revision;await save();}
    let value=await appState(owned.id);
    if(!value?.release)await appApi('/api/applications/connect',{applicationId:owned.id});
    value=await until(()=>appState(owned.id),x=>{
     need(x&&!x.error,'The original HUMANITARIAN application is unavailable.');
     if(x.adoption?.phase==='FAILED'&&!x.adoption.active)throw Object.assign(new Error(x.adoption.state?.error?.message??'Original runtime adoption failed'),
      {code:'HUMANITARIAN_APPLICATION_ADOPTION',original:x.adoption});
     return Boolean(x.release);
    },'Original HUMANITARIAN runtime adoption did not complete.');
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
      throw Object.assign(new Error('Original HUMANITARIAN command ended before its verified startup'),{code:'HUMANITARIAN_APPLICATION_START',original:x.current});
     return x.phase==='RUNNING'&&x.current?.active&&typeof x.current.privateUrl==='string';
    },'The original HUMANITARIAN application produced no verified startup.');
    need(owned.runs.some(run=>(run.operationId??run.requestId)===current.current.id),
     'The active Application is not this receiving operation\'s original run.');
    const launched=current.current.url?.original;
    need(launched?.schema==='stellar-forge.humanitarian-workspace-launch.v1'&&launched.workspace===owned.workspace&&
     new URL(current.current.privateUrl).origin==='http://127.0.0.1:'+owned.port,
     'Original Applications observed a different HUMANITARIAN workspace or original browser origin.');
    await publish(join(outputDirectory,'connections',owned.name+'.json'),{url:current.current.privateUrl,launch:launched});
    const client=createHumanitarianClient(current.current.privateUrl,{timeoutMs:240000});clients.add(client);
    const actual=await client.launch();
    need(actual.workspace===owned.workspace&&actual.bindingSha256===launched.bindingSha256&&actual.pid===launched.pid,
     'Authenticated HUMANITARIAN startup differs from its original Applications observation.');
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
    const nodeArgs=[join(installedRoot,HUMANITARIAN+'cli.mjs'),'--python',pythonExecutable,'--workspace',workspaceDirectory,...args];
    const pythonArgs=['-B',join(installedRoot,HUMANITARIAN+'humanitarian_cli.py'),'--workspace',workspaceDirectory,...args];
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
     'The accepted original HUMANITARIAN CLI process is still completing; retain its same operation.',240000);
    return observed;
   }
   async function cli(name,workspaceDirectory,args,{repeat=false}={}){
    const folder=join(outputDirectory,'cli',name);await privateDirectory(folder);
    const request={executable:process.execPath,args:[join(installedRoot,HUMANITARIAN+'cli.mjs'),'--python',pythonExecutable,
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
     exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
     await out.sync();await err.sync();
    }catch(error){
     await publish(join(folder,'failed-'+tag+'.json'),{...intent,error:detail(error),observedAt:new Date().toISOString()},{immutable:true});throw error;
    }finally{await out.close();await err.close();}
    const receipt={...intent,exitCode:exit.code,signal:exit.signal,endedAt:new Date().toISOString(),
     stdoutFile:{path:stdout,...await identity(stdout)},stderrFile:{path:stderr,...await identity(stderr)}};
    await publish(join(folder,'attempt-'+String(attempt).padStart(4,'0')+'.json'),receipt,{immutable:true});
    need(exit.code===0,'Original HUMANITARIAN CLI failed; exact complete stderr is retained at '+stderr);
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
    const value=await downloadHumanitarianFile(await call(),path);
    const file={name:'downloads/'+name,path,bytes:value.bytes,sha256:value.sha256};
    progress.downloads[name]=file;await save();files.set(file.name,file);return file;
   }
   async function completeRows(client,view,edition){
    const rows=[];let offset=0,total=null;
    do{
     const page=await client.rows(view.id,{revision:view.revision,edition,offset,limit:1000});
     need(page.review===view.id&&page.revision===view.revision&&page.edition===edition&&page.offset===offset&&
      Array.isArray(page.rows)&&(total===null||page.total===total),'The full native row page changed selection.');
     total=page.total;rows.push(...page.rows);offset+=page.rows.length;
     need(offset<=total&&(offset===total||page.rows.length>0),'The original row cursor did not advance.');
    }while(offset<total);
    need(rows.length===view.editions[edition].counts.totalRows,'Retain every original normalized row.');
    return rows;
   }
   const sourceOwned=await setup('source',directory),opened=await start(sourceOwned);
   sourceClient=opened.client;
   const before=verifyView(await sourceClient.review(expected.id,expected.revision),expected);
   const beforeReport=verifyReport(await sourceClient.report(before.id,{revision:before.revision}),before);
   need(equal(beforeReport.counts,core.counts)&&before.editions.length===2,
    'The installed full report changed the completed operating case.');
   const originalHistory=await sourceClient.history(before.id);
   const beforeHistory={...originalHistory,revisions:originalHistory.revisions.filter(v=>v.revision<=before.revision)};
   need(beforeHistory.revisions.length===before.revision&&equal(beforeHistory.revisions.at(-1),before),
    'The complete original review prefix changed.');
   await stage('source-before-review',before);await stage('source-before-report',beforeReport);
   await stage('source-before-history',beforeHistory);
   const reference=await sourceClient.reference(before.reference);
   need(reference.id===core.reference,'The original full administrative reference changed.');
   await stage('reference',reference);
   const mappings=[],sources=[];
   for(let edition=0;edition<before.editions.length;edition++){
    const selected=before.editions[edition],mapping=await sourceClient.mapping(selected.mapping),
     source=await sourceClient.source(selected.source),rows=await completeRows(sourceClient,before,edition);
    need(mapping.id===selected.mapping&&mapping.reference===before.reference&&source.id===selected.source,
     'The original edition mapping/reference/source identity changed.');
    mappings.push(mapping);sources.push(source);await stage('normalized-rows-'+edition,{edition,rows});
   }
   await stage('mappings',mappings);await stage('sources',sources);
   const browserFolder=join(outputDirectory,'browser','source');await privateDirectory(browserFolder);
   const sourcePage=await pageFor(opened,'source');
   const reviewed=await runHumanitarianBrowserReceiving({page:sourcePage.page,client:sourceClient,directory,
    outputDirectory:browserFolder,operationId:operationId+'-source-browser',actor,before,report:beforeReport,history:beforeHistory,
    checkpoint:progress.browser.source??null,retain:value=>retainBrowser('source',value)});
   need(reviewed?.reviewed&&reviewed.request&&Array.isArray(reviewed.files),'Retain the full original browser result.');
   verifyView(reviewed.reviewed,{id:before.id,revision:before.revision+1});
   verifyReport(reviewed.report,reviewed.reviewed);
   need(sameResults(beforeReport,reviewed.report)&&
    FIELDS.filter(k=>!['reviewer','notes'].includes(k)).every(k=>equal(definition(before)[k],definition(reviewed.reviewed)[k]))&&
    reviewed.reviewed.reviewer===actor.label&&reviewed.reviewed.notes!==before.notes&&reviewed.reviewed.notes.startsWith(before.notes),
    'The named browser note must preserve every original source, mapping, alias, output and comparison.');
   const lookup=await sourceClient.request(reviewed.request.requestId);
   need(lookup.kind==='review'&&equal(lookup.input,reviewed.request)&&equal(lookup.result,reviewed.reviewed),
    'The saved UI request did not replay through the complete original native lookup.');
   need(equal(await sourceClient.saveReview(reviewed.request),reviewed.reviewed),'Original request replay changed the saved review.');
   await stage('browser-request',reviewed.request);await stage('browser-native-lookup',lookup);
   await stage('source-reviewed',reviewed.reviewed);await stage('source-reviewed-report',reviewed.report);
   const sourceHistory=await sourceClient.history(before.id);
   const reviewedHistory={...sourceHistory,revisions:sourceHistory.revisions.filter(v=>v.revision<=reviewed.reviewed.revision)};
   await stage('source-reviewed-history',reviewedHistory);
   const browserFiles=new Map();
   for(const file of reviewed.files){
    need(typeof file.name==='string'&&!browserFiles.has(file.name)&&inside(file.path,browserFolder),
     'The original browser file selection is invalid.');
    await verified(file);browserFiles.set(file.name,file);
   }
   for(const [name,call]of [
    ['review.zip',()=>sourceClient.exportReview(before.id,{revision:reviewed.reviewed.revision})],
    ['report.zip',()=>sourceClient.exportReport(before.id,{revision:reviewed.reviewed.revision})]
   ]){
    const actual=await download('source-'+name,call),browserFile=browserFiles.get(name);
    need(browserFile&&browserFile.bytes===actual.bytes&&browserFile.sha256===actual.sha256,
     'The complete typed-client and UI download differs: '+name);
   }
   const browserJson=browserFiles.get('report.json'),browserInput=browserFiles.get('review-input.json');
   need(browserJson&&browserInput&&equal(JSON.parse(await readFile(browserJson.path,'utf8')),reviewed.report)&&
    equal(JSON.parse(await readFile(browserInput.path,'utf8')),reviewed.request),
    'The complete browser report or original downloaded UI input changed.');
   for(const file of reviewed.files)files.set('browser/source/'+file.name,{...file,name:'browser/source/'+file.name});
   const coreRequests=await json(join(dirname(coreResult.path),'observations','source-requests.json'));
   need(Array.isArray(coreRequests),'Retain the complete original core request history.');
   const sourceRequests=[...coreRequests,lookup];
   for(const request of sourceRequests)need(equal(await sourceClient.request(request.id),request),'Original complete request history changed.');
   await stage('source-complete-requests',sourceRequests);
   await browserObservations(browserFolder,'source','source');
   const sourcePacket=progress.downloads['source-review.zip'];
   await closePage(sourcePage);await closeClient(sourceClient);sourceClient=null;await stopApplication(sourceOwned);
   const savedByCli=await cliCall('source-same-ui-request',directory,'review.save',reviewed.request);
   need(equal(savedByCli,reviewed.reviewed),'Installed CLI did not replay the original saved UI request.');
   const cliReport=await cliCall('source-full-report',directory,'report',{id:before.id,revision:reviewed.reviewed.revision});
   need(equal(cliReport,reviewed.report),'Installed CLI returned another complete report.');
   const cliPath=join(outputDirectory,'downloads','cli-source-review.zip');
   const exported=await cliCall('source-full-packet',directory,'review.export',{id:before.id,revision:reviewed.reviewed.revision,output:cliPath});
   const repeated=await cliCall('source-full-packet',directory,'review.export',{id:before.id,revision:reviewed.reviewed.revision,output:cliPath},{repeat:true});
   need(exported.path===cliPath&&exported.bytes===sourcePacket.bytes&&exported.sha256===sourcePacket.sha256&&
    equal(repeated,exported),'The complete CLI archive or same-output replay changed.');
   const cliPacket=await remember('downloads/cli-source-review.zip',cliPath);
   need(cliPacket.bytes===sourcePacket.bytes&&cliPacket.sha256===sourcePacket.sha256,'The complete retained CLI packet changed.');
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
   const receivedBrowser=await inspectHumanitarianReceivedPage({page:receivedPage.page,client:receivedClient,directory:receiver,
    outputDirectory:receivedFolder,operationId:operationId+'-received-browser',actor,
    review:reviewed.reviewed,report:reviewed.report,history:reviewedHistory,name:'independent-received',
    checkpoint:progress.browser.received??null,retain:value=>retainBrowser('received',value),receiveFile:sourcePacket});
   need(equal(await receivedClient.review(before.id,reviewed.reviewed.revision),reviewed.reviewed),
    'Independent receiving changed the selected complete review.');
   need(sameReport(await receivedClient.report(before.id,{revision:reviewed.reviewed.revision}),reviewed.report),
    'The independently rebuilt complete semantic report changed.');
   const receivedPacket=await download('received-revision-'+reviewed.reviewed.revision+'.zip',
    ()=>receivedClient.exportReview(before.id,{revision:reviewed.reviewed.revision}));
   await verified(receivedPacket);
   const importedHistory=await receivedClient.history(before.id);
   need(equal(importedHistory.revisions.filter(v=>v.revision<=reviewed.reviewed.revision),reviewedHistory.revisions),
    'Independent receiving changed the complete original saved history prefix.');
   need(equal(await receivedClient.reference(before.reference),reference),'Independent receiving changed the complete reference.');
   for(const mapping of mappings)need(equal(await receivedClient.mapping(mapping.id),mapping),'Independent receiving changed the complete mapping.');
   for(const request of sourceRequests)need(equal(await receivedClient.request(request.id),request),'Independent receiving changed an original full request.');
   // Original native builds may have platform-specific physical SQLite bytes.
   // Full receiving validates every member and reconstruction; compare its full
   // semantic inputs/history rather than requiring cross-platform ZIP identity.
   const receiveReplay=await receivedClient.receive(await readFile(sourcePacket.path));
   need(receiveReplay.review.id===before.id&&receiveReplay.review.revision>=reviewed.reviewed.revision,
    'Original packet replay selected another review or lost a later local revision.');
   await stage('received-browser',receivedBrowser.receipt??receivedBrowser);
   await browserObservations(receivedFolder,'independent-received','received');
   const localPath=join(outputDirectory,'requests','received-local-review.json');
   let localInput=await json(localPath);
   if(!localInput){
    localInput={...definition(reviewed.reviewed),requestId:'operator-'+uuid(operationId+':received-local-review'),
     expectedRevision:reviewed.reviewed.revision,reviewer:actor.label,
     notes:reviewed.reviewed.notes+'\nIndependent receiving confirmed the complete original reference, both engineering editions, saved mappings, aliases and reports.'};
    await publish(localPath,localInput,{immutable:true});
   }
   const local=await receivedClient.saveReview(localInput);
   need(local.id===before.id&&local.revision===reviewed.reviewed.revision+1&&
    equal(definition(local),Object.fromEntries(FIELDS.map(key=>[key,localInput[key]]))),
    'The original recipient continuation changed its complete selected definition.');
   const localLookup=await receivedClient.request(localInput.requestId);
   need(equal(localLookup.input,localInput)&&equal(localLookup.result,local),'Recipient lookup lost the original full input.');
   const localReport=verifyReport(await receivedClient.report(local.id,{revision:local.revision}),local);
   need(sameResults(reviewed.report,localReport),'Recipient named continuation changed the complete original source results.');
   const older=await receivedClient.receive(await readFile(sourcePacket.path));
   need(older.review.revision===local.revision&&equal(await receivedClient.review(local.id),local),
    'Older full receiving lost the later original local review.');
   await stage('received-local-review',local);await stage('received-local-report',localReport);
   const finalPacket=await download('received-complete-history.zip',()=>receivedClient.exportReview(local.id,{revision:local.revision}));
   await download('received-report.zip',()=>receivedClient.exportReport(local.id,{revision:local.revision}));
   for(const file of receivedBrowser.files??[]){await verified(file);need(inside(file.path,receivedFolder),'A received browser file escaped its selection.');
    files.set('browser/received/'+file.name,{...file,name:'browser/received/'+file.name});}
   await closePage(receivedPage);await closeClient(receivedClient);receivedClient=null;await stopApplication(receivedOwned);
   const cold=await cliCall('recipient-cold-reopen',receiver,'review',{id:local.id,revision:local.revision});
   need(equal(cold,local),'Cold installed CLI reopen lost the complete recipient continuation.');
   const coldReport=await cliCall('recipient-cold-report',receiver,'report',{id:local.id,revision:local.revision});
   need(equal(coldReport,localReport),'Cold CLI reopen changed the complete recipient report.');
   await stage('recipient-cold-reopen',cold);
   const finalOpened=await start(receivedOwned);receivedClient=finalOpened.client;
   const finalPage=await pageFor(finalOpened,'reopened'),reopenFolder=join(outputDirectory,'browser','reopened');
   await privateDirectory(reopenFolder);
   const reopened=await inspectHumanitarianReceivedPage({page:finalPage.page,client:receivedClient,directory:receiver,
    outputDirectory:reopenFolder,operationId:operationId+'-reopened-browser',actor,review:local,report:localReport,history:await receivedClient.history(local.id),
    name:'cold-reopened',checkpoint:progress.browser.reopened??null,
    retain:value=>retainBrowser('reopened',value)});
   await stage('reopened-browser',reopened.receipt??reopened);
   await browserObservations(reopenFolder,'cold-reopened','reopened');
   for(const file of reopened.files??[]){await verified(file);need(inside(file.path,reopenFolder),'A cold browser file escaped its selection.');files.set('browser/reopened/'+file.name,{...file,name:'browser/reopened/'+file.name});}
   await closePage(finalPage);await closeClient(receivedClient);receivedClient=null;await stopApplication(receivedOwned);
   const applications=(await appApi('/api/applications/state?historyLimit=30')).applications.filter(x=>[sourceOwned.id,receivedOwned.id].includes(x.id));
   need(applications.length===2&&applications.every(x=>terminal(x)&&x.phase==='STOPPED'),'Both original HUMANITARIAN Applications must complete Stop.');
   const history=await cliCall('recipient-final-history',receiver,'history',{id:local.id});
   need(history.revisions.length===local.revision&&equal(history.revisions.at(-1),local),'Original full recipient history did not survive reopen.');
   await stage('recipient-history',history);
   // Every customer file is selected explicitly. Private connections, process
   // records, browser storage and transient request logs remain in this operation.
   for(const [name,file]of Object.entries(progress.downloads)){await verified(file);files.set('downloads/'+name,{...file,name:'downloads/'+name});}
   for(const name of ['source-before-review','source-before-report','source-reviewed','source-reviewed-report',
    'reference','mappings','sources','source-before-history','source-reviewed-history','source-complete-requests','source-cli-report','received-local-review','received-local-report','recipient-cold-reopen','recipient-history'])
    await remember('observations/'+name+'.json',join(outputDirectory,'observations',name+'.json'));
   result={schema:SCHEMA,state:'COMPLETE',operationId,actor,selectionSha256:sha(encode(selection)),completedAt:new Date().toISOString(),
    runtime:runtimeBinding(runtime),coreResult,
    source:{directory,original:expected,reviewed:selectedView(reviewed.reviewed),report:reviewed.reviewed.report},
    received:{directory:receiver,review:selectedView(local),report:local.report,historyRevisions:history.revisions.length,packet:finalPacket},
    applications:applications.map(x=>({id:x.id,label:x.label,phase:x.phase,revision:x.revision,totalRuns:x.totalRuns})),
    browser:{source:reviewed.receipt,received:receivedBrowser.receipt,reopened:reopened.receipt},
    files:[...files.values()].sort((a,b)=>a.name.localeCompare(b.name)),
    notice:core.purpose,
    checks:{originalReference:true,completeNativeEditions:true,sameUiRequest:true,typedClient:true,installedCli:true,
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
   failure??=Object.assign(new Error('Original HUMANITARIAN cleanup is retained for the same Applications continuation.'),{code:'HUMANITARIAN_OPERATOR_CLEANUP',errors});}
  try{if(result&&!failure)await publish(join(outputDirectory,'result.json'),result,{immutable:true});}
  finally{await lease.close();}
 }
 if(failure)throw failure;
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 need(process.argv.length===3,'node operator.mjs /absolute/retained-input.json');
 const input=await json(resolve(process.argv[2]));const result=await runHumanitarianOperatorReceiving(input);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
