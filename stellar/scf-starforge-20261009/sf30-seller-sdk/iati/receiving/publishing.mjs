// MIT. Complete installed participant publisher workflow and independent receiving on the original IATI Application.
// The caller owns the admitted native operation and closes its core workspace first.
import { constants } from 'node:fs';
import { mkdir, open, readFile, lstat, realpath, rename, readdir } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { openInstalledIatiPage } from './browser.mjs';

const SCHEMA='stellar-forge.iati-participant-operator-receiving.v1';
const ROOT='stellar/scf-starforge-20261009/';
const SDK=ROOT+'sf30-seller-sdk/';
const OPERATOR='stellar-forge/mcp-merchant-operator/';
const SHA=/^[0-9a-f]{64}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):plain(value)?
 Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const encode=value=>Buffer.from(JSON.stringify(canonical(value),null,2)+'\n');
const hash=value=>createHash('sha256').update(value).digest('hex');
const same=(left,right)=>encode(left).equals(encode(right));
const check=(value,message)=>{if(!value)throw Object.assign(new Error(message),{code:'IATI_RECEIVING_ASSERTION'});};
const uuid=value=>{const x=hash(value);return x.slice(0,8)+'-'+x.slice(8,12)+'-4'+x.slice(13,16)+'-a'+x.slice(17,20)+'-'+x.slice(20,32);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const errorValue=error=>({code:error.code??'IATI_RECEIVING_ERROR',message:String(error.message??error).slice(0,3000)});
const CRITICAL=[
 ...['publishing.py','publishing_http.py','publishing_cli.py','publishing_xml.py','publishing_validation.py',
  'publishing-methodology.json','publishing-schema-source.json','PUBLISHING.md','PUBLISHING_SOURCES.md',
  'receiving/publishing.py','receiving/publishing.mjs','receiving/PUBLISHING.md','receiving/browser.mjs',
  'public/publishing.js','public/publishing.css','iati_source.py','iati_workspace.py','cli.py','cli.mjs',
  'managed.py','server.py','client.mjs','client.d.mts','public/index.html','public/app.js','public/style.css'].map(name=>SDK+'iati/'+name),
 ...['xml_source.py','workspace.py','server.py','native.mjs'].map(name=>SDK+'xml/'+name),
 SDK+'dataset-handler.mjs',ROOT+'distribution/contributions/iati.json',
 ROOT+'distribution/runtime-workspace/application-iati.mjs',ROOT+'distribution/runtime-workspace/providers/iati.mjs',
 ROOT+'distribution/runtime-workspace/model.mjs',ROOT+'distribution/runtime-workspace/server.mjs',
 ROOT+'distribution/runtime-workspace/applications.mjs',ROOT+'distribution/runtime-workspace/managed-workspace.mjs',
 ROOT+'distribution/runtime-workspace/application-provider.mjs',ROOT+'distribution/runtime-install.mjs',
 ROOT+'sf46-release/runtime-package.mjs',ROOT+'merchant-fleet-gateway/state-lease.mjs',
 OPERATOR+'source-workspace.mjs',OPERATOR+'catalog/source-workspace.mjs',
 OPERATOR+'retained-file-reads.mjs',OPERATOR+'retained-file-contracts.mjs',
 'stellar-forge/mcp-paid-agent/http-tools.mjs',ROOT+'sf33-failure-contract/contract.mjs'
];
async function exists(path){try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function json(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function privateDirectory(path){
 check(isAbsolute(path)&&resolve(path)===path&&path!=='/','Select a canonical private directory.');
 await mkdir(path,{recursive:true,mode:0o700});
 const info=await lstat(path);
 check(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077)&&(!process.getuid||info.uid===process.getuid())&&
  await realpath(path)===path,'The receiver requires its original owned private directory without aliases.');
}
async function syncDirectory(path){const h=await open(path,constants.O_RDONLY);try{await h.sync();}finally{await h.close();}}
async function publish(path,data,immutable=false){
 data=Buffer.isBuffer(data)?data:encode(data);
 if(immutable&&await exists(path)){check((await readFile(path)).equals(data),'A retained immutable receiving selection changed.');return;}
 const temporary=join(dirname(path),'.iati-receiving-'+randomUUID()+'.partial');
 const handle=await open(temporary,'wx',0o600);
 try{await handle.writeFile(data);await handle.sync();}finally{await handle.close();}
 check((await readFile(temporary)).equals(data),'A complete staged receiving record changed.');
 // The complete callback holds the original kernel lease. Rename avoids an
 // interrupted extra hard link on private connection files requiring nlink=1.
 await rename(temporary,path);await syncDirectory(dirname(path));
}
async function identity(path){
 const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{
  const before=await handle.stat({bigint:true});check(before.isFile(),'Select a complete regular original file.');
  const sha=createHash('sha256'),git=createHash('sha1').update(Buffer.from('blob '+before.size+'\0'));
  let bytes=0;
  for await(const chunk of handle.createReadStream({autoClose:false})){sha.update(chunk);git.update(chunk);bytes+=chunk.length;}
  const after=await handle.stat({bigint:true});
  check(BigInt(bytes)===before.size&&['dev','ino','size','mtimeNs','ctimeNs'].every(key=>before[key]===after[key]),
   'An original file changed while its complete bytes were retained.');
  return{bytes,sha256:sha.digest('hex'),gitBlob:git.digest('hex')};
 }finally{await handle.close();}
}
async function boundedJson(response,maximum=64*1024*1024){
 let bytes=0;const chunks=[];
 for await(const chunk of response.body??[]){bytes+=chunk.length;check(bytes<=maximum,'The original JSON response exceeds its full metadata boundary.');chunks.push(chunk);}
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes)));
 if(!response.ok)throw Object.assign(new Error(value.message??value.error??'Original HTTP operation failed.'),{code:value.error??'IATI_HTTP',status:response.status});
 return value;
}
const runtimeBinding=value=>Object.fromEntries(['installationId','profileId','profileSha256','lockSha256',
 'sourceCommit','sourceManifestSha256','directory','sourceRoot','dependencyCount'].map(key=>[key,value[key]]));
async function until(read,accept,message,{timeoutMs=240000}={}){
 const deadline=Date.now()+timeoutMs;let value;
 do{value=await read();if(await accept(value))return value;await pause(750);}while(Date.now()<deadline);
 throw Object.assign(new Error(message),{code:'IATI_RECEIVING_WAIT',last:value});
}


/** Operate the caller's one READY installation after the original complete Python core closes. */
export async function runIatiPublishingReceiving({
 coreInputFile,outputDirectory,sourceRoot,runtimeDirectory,operationId,actor,
 pythonExecutable,chromiumExecutable,playwrightModule
}={}){
 process.umask(0o077);
 check(typeof operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,139}$/.test(operationId),'Retain one original participant operator operation.');
 check(plain(actor)&&typeof actor.id==='string'&&actor.id.trim()&&actor.id.length<=160&&
  typeof actor.label==='string'&&actor.label.trim()&&actor.label.length<=160,'Pass the actual named receiving operator.');
 for(const path of [coreInputFile,outputDirectory,sourceRoot,runtimeDirectory,pythonExecutable,chromiumExecutable,playwrightModule])
  check(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path&&path!=='/','Select complete canonical original paths.');
 check(await realpath(sourceRoot)===sourceRoot,'Retain the actual selected repository source without aliases.');
 await privateDirectory(outputDirectory);
 const original=path=>import(pathToFileURL(join(sourceRoot,path)).href);
 const {acquireStateLease}=await original(ROOT+'merchant-fleet-gateway/state-lease.mjs');
 const lease=await acquireStateLease(outputDirectory);
 const contexts=new Set(),activeApplications=new Map(),mcpOwners=new Set();
 let appsServer,appApi,appsModel,browser,mcp,sourceClient,receivedClient,progress,selection,result,failure;
 const progressPath=join(outputDirectory,'progress.json');
 const save=async()=>{lease.assertHeld();progress.updatedAt=new Date().toISOString();await publish(progressPath,progress);};
 const stage=async(name,value)=>{progress.stages[name]=value;await save();return value;};
 const endpointDocument=async(name,url)=>publish(join(outputDirectory,'connections',name+'.txt'),Buffer.from(url+'\n'));
 try{
  const coreInputIdentity=await identity(coreInputFile),coreInputBytes=await readFile(coreInputFile);
  check(coreInputBytes.length===coreInputIdentity.bytes&&hash(coreInputBytes)===coreInputIdentity.sha256,'The complete core input changed.');
  const coreConfig=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(coreInputBytes));
  check(plain(coreConfig)&&typeof coreConfig.operationId==='string'&&coreConfig.operationId!==operationId&&
   typeof coreConfig.actor==='string'&&typeof coreConfig.reviewer==='string'&&
   coreConfig.actor.trim().toLocaleLowerCase()!==coreConfig.reviewer.trim().toLocaleLowerCase(),
   'Retain the original core operation and two distinct named domain reviewers.');
  const directory=coreConfig.workspaceDirectory,receivedDirectory=coreConfig.receivedDirectory,coreOutput=coreConfig.outputDirectory;
  const scopes=[directory,receivedDirectory,coreOutput,outputDirectory];
  for(const path of scopes)check(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path&&path!=='/','Keep the exact original private core directories.');
  for(let i=0;i<scopes.length;i++)for(let j=i+1;j<scopes.length;j++)
   check(scopes[i]!==scopes[j]&&!scopes[i].startsWith(scopes[j]+'/')&&!scopes[j].startsWith(scopes[i]+'/'),
    'Keep the source, detached receiver, core output and operator output as separate private directories.');
  const {inspectMerchantRuntime}=await original(ROOT+'sf46-release/runtime-package.mjs');
  const runtime=await inspectMerchantRuntime(runtimeDirectory,{load:false});
  check(runtime.state==='READY'&&runtime.dependencyCount===0,'Use the actual original READY zero-dependency operator installation.');
  const installedRoot=await realpath(runtime.sourceRoot),installed=path=>import(pathToFileURL(join(installedRoot,path)).href);
  check(coreConfig.sourceRoot===installedRoot,'The unchanged complete core input must select this actual installed source root.');
  const schemaIndex=await json(join(installedRoot,SDK+'iati/publishing-schema-source.json'));
  check(plain(schemaIndex?.files),'The selected installation must retain the full original IATI validation source.');
  const critical=[...CRITICAL];
  for(const name of Object.keys(schemaIndex.files)){
   check(name.length>0&&!name.includes('/')&&!name.includes('\\')&&name!=='.'&&name!=='..','Retain an original schema leaf name.');
   critical.push(SDK+'iati/publishing-schema/'+name);
  }
  const sources=[];
  for(const path of [...new Set(critical)]){
   const selected=await identity(join(sourceRoot,path)),actual=await identity(join(installedRoot,path));
   check(same(selected,actual),'The READY installation differs from the complete selected original '+path);
   sources.push({path,...actual});
  }
  const callback=await identity(fileURLToPath(import.meta.url)),browserSource=await identity(fileURLToPath(new URL('./browser.mjs',import.meta.url)));
  check(same(callback,await identity(join(installedRoot,SDK+'iati/receiving/publishing.mjs')))&&
   same(browserSource,await identity(join(installedRoot,SDK+'iati/receiving/browser.mjs'))),
   'Execute the complete receiver and original browser helper from the actual selected installation.');
  const inputs=[];
  for(const path of [coreConfig.publisherFile,coreConfig.publisherReceipt,coreConfig.feedbackFile,...(coreConfig.evidenceFiles??[]).map(row=>row.path)]){
   check(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path,'Retain each complete original domain input.');
   inputs.push({path,...await identity(path)});
  }
  selection={schema:SCHEMA,operationId,actor,sourceRoot,runtime:runtimeBinding(runtime),coreInput:{path:coreInputFile,...coreInputIdentity},
   coreConfiguration:coreConfig,inputs,sources,callback,browserSource,
   execution:{node:process.execPath,nodeVersion:process.versions.node,pythonExecutable,chromiumExecutable,playwrightModule}};
  await publish(join(outputDirectory,'selection.json'),selection,true);
  await publish(join(outputDirectory,'core-input.json'),coreInputBytes,true);
  progress=await json(progressPath)??{schema:SCHEMA,operationId,createdAt:new Date().toISOString(),stages:{},applications:{},downloads:{}};
  check(progress.schema===SCHEMA&&progress.operationId===operationId,'The retained operator progress belongs to another operation.');
  for(const name of ['connections','mcp','downloads','cli','views','temporary','attempts','packet','processes','reads'])
   await privateDirectory(join(outputDirectory,name));
  const final=await json(join(outputDirectory,'result.json'));
  if(final){
   check(final.state==='COMPLETE'&&final.selectionSha256===hash(encode(selection)),'The completed original operator selection changed.');
   for(const item of final.files){const actual=await identity(item.path);check(actual.bytes===item.bytes&&actual.sha256===item.sha256,'A complete original returned file changed.');}
   return{...final,reused:true};
  }
  let core=await json(join(coreOutput,'result.json'));
  if(!core)core=await runProcess('complete-native-core',[pythonExecutable,'-B',join(installedRoot,SDK+'iati/receiving/publishing.py'),'--input',coreInputFile]);
  check(core?.schema==='stellar-forge.iati-participant-core-receiving.v1'&&core.state==='COMPLETE'&&
   core.operationId===coreConfig.operationId&&core.workspaceDirectory===directory&&core.receivedDirectory===receivedDirectory&&
   core.project?.schema==='stellar-forge.iati-participant-project.v1'&&core.project.state==='RELEASED'&&
   core.project.release?.publicationState==='READY_FOR_PUBLISHER'&&Array.isArray(core.files),
   'The one original complete core must finish source, explicit corrections, finance, independent review and detached receiving.');
  const durableCore=await json(join(coreOutput,'result.json'));
  check(durableCore&&same({...core,reused:undefined},{...durableCore,reused:undefined}),'The complete core result differs from its original durable result.');
  core=durableCore;
  const coreSelection=await json(join(coreOutput,'selection.json'));
  check(coreSelection?.schema===core.schema&&same(coreSelection.configuration,coreConfig)&&
   hash(encode(coreSelection))===core.selectionSha256,'The native core result is not bound to the complete original input.');
  for(const item of core.files){const actual=await identity(item.path);check(actual.bytes===item.bytes&&actual.sha256===item.sha256,'A complete original core file changed.');}
  const nativePacket={...core.customerHandover},packetIdentity=await identity(nativePacket.path);
  check(packetIdentity.bytes===nativePacket.bytes&&packetIdentity.sha256===nativePacket.sha256,'The native complete release changed.');
  const project=core.project,id=project.id,releaseRevision=project.revision;
  check(SHA.test(id)&&Number.isSafeInteger(releaseRevision)&&releaseRevision>core.correctedRevision&&
   core.correctedRevision>core.baselineRevision&&core.baselineRevision>0&&
   core.historyRevisions===releaseRevision,'Keep the complete original participant history and its baseline/corrected revisions.');
  const sourceHeader=await json(join(directory,'workspace.json')),receivedHeader=await json(join(receivedDirectory,'workspace.json'));
  check(sourceHeader?.schema==='stellar-forge.iati-workspace.v1'&&receivedHeader?.schema===sourceHeader.schema,
   'The complete core must close both original source workspaces before independent operators reopen them.');
  await stage('nativeCore',{result:{path:join(coreOutput,'result.json'),...await identity(join(coreOutput,'result.json'))},
   operationId:core.operationId,project:id,revision:releaseRevision,baselineRevision:core.baselineRevision,
   correctedRevision:core.correctedRevision,packet:nativePacket,files:core.files.length});
  const {createRuntimeWorkspace,openRuntimeWorkspace}=await installed(ROOT+'distribution/runtime-workspace/model.mjs');
  const applicationsDirectory=join(outputDirectory,'applications');
  if(!await json(join(applicationsDirectory,'workspace.json'))){
   if(await exists(applicationsDirectory))await rename(applicationsDirectory,join(outputDirectory,'attempts','unpublished-applications-'+randomUUID()));
   await createRuntimeWorkspace({directory:applicationsDirectory});
  }
  appsModel=await openRuntimeWorkspace({directory:applicationsDirectory});
  const {startRuntimeWorkspace}=await installed(ROOT+'distribution/runtime-workspace/server.mjs');
  appsServer=await startRuntimeWorkspace({directory:applicationsDirectory,port:0});
  const appsUrl=new URL(appsServer.url),appsToken=appsUrl.hash.slice(1);
  appApi=async(path,value)=>{
   const response=await fetch(appsUrl.origin+path,{method:value===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(240000),
    headers:{'x-runtime-workspace-token':appsToken,...(value===undefined?{}:{origin:appsUrl.origin,'content-type':'application/json'})},
    ...(value===undefined?{}:{body:JSON.stringify(value)})});
   return boundedJson(response);
  };
  const unauthenticated=await fetch(appsUrl.origin+'/api/applications/state');
  check(unauthenticated.status===401,'Retain the actual authenticated Applications boundary.');await unauthenticated.body?.cancel();
  const attached=await appApi('/api/attach',{directory:runtimeDirectory,label:'Selected participant publishing runtime'});
  check(attached.status==='READY','The installed Applications runtime must remain READY.');
  await stage('installedRuntime',{...runtimeBinding(runtime),runtimeId:attached.runtimeId,sourceFiles:sources.length,applicationsDirectory});
  const {connectIatiWorkspace}=await installed(SDK+'iati/client.mjs');
  const appState=async id=>(await appApi('/api/applications/state?historyLimit=30')).applications.find(item=>item.id===id);
  async function setupApplication(name,workspace){
   let owned=progress.applications[name];
   if(!owned){
    owned={name,workspace,label:actor.label.slice(0,80)+' · '+(name==='source'?'Original participant publisher work':'Received participant publisher work'),
     saveRequestId:uuid(operationId+':application:'+name),runs:[]};
    progress.applications[name]=owned;await save();
   }
   if(!owned.reviewId){
    const reviewed=await appApi('/api/applications/review',{runtimeId:attached.runtimeId,kind:'iati',label:owned.label,
     settings:{workspaceDirectory:workspace,pythonExecutable,port:0}});
    owned.reviewId=reviewed.id;await save();
   }
   if(!owned.id){
    const saved=await appApi('/api/applications/save',{requestId:owned.saveRequestId,reviewId:owned.reviewId});
    owned.id=saved.applicationId;owned.revision=saved.revision;owned.connection=saved.connection;await save();
   }
   let connected=await appState(owned.id);
   if(!connected?.release)await appApi('/api/applications/connect',{applicationId:owned.id});
   connected=await until(()=>appState(owned.id),value=>{
    check(value&&!value.error,'The original Applications entry is unavailable.');
    if(value.adoption?.phase==='FAILED'&&!value.adoption.active)throw Object.assign(new Error(value.adoption.state?.error?.message??'Original runtime adoption failed.'),{code:'IATI_RECEIVING_ADOPTION'});
    return Boolean(value.release);
   },'The original full managed-runtime adoption did not finish.');
   owned.release=connected.release;await save();return owned;
  }
  async function startApplication(owned){
   let current=await appState(owned.id);
   if(current.current&&!current.current.active&&['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(current.current.phase)){
    await appApi('/api/applications/recover',{applicationId:owned.id,operationId:current.current.id});
    current=await appState(owned.id);
   }
   if(!current.current?.active&&!['PENDING','QUEUED','RUNNING'].includes(current.current?.phase)){
    let attempt=owned.runs.at(-1);
    if(!attempt||attempt.dispatched||attempt.finished){
     attempt={requestId:uuid(operationId+':run:'+owned.name+':'+owned.runs.length),createdAt:new Date().toISOString()};
     owned.runs.push(attempt);await save();
    }
    if(!attempt.reviewId){const reviewed=await appApi('/api/applications/start-review',{applicationId:owned.id});attempt.reviewId=reviewed.id;await save();}
    const started=await appApi('/api/applications/start',{applicationId:owned.id,requestId:attempt.requestId,reviewId:attempt.reviewId});
    attempt.dispatched=true;attempt.operationId=started.operationId;await save();
   }
   current=await until(()=>appState(owned.id),value=>{
    check(value&&!value.error,'The saved original Applications entry became unavailable.');
    if(value.current&&!value.current.active&&['FAILED','SUCCEEDED','CANCELLED'].includes(value.current.phase))
     throw Object.assign(new Error('The original IATI command ended before its verified startup.'),{code:'IATI_RECEIVING_START',original:value.current});
    return value.phase==='RUNNING'&&value.current?.active&&typeof value.current.privateUrl==='string';
   },'The original managed IATI command produced no verified startup.');
   activeApplications.set(owned.id,current.current.id);
   const launched=current.current.url?.original;
   check(launched?.schema==='stellar-forge.iati-workspace-launch.v1'&&launched.workspace===owned.workspace,
    'The Applications observer must verify the exact original workspace before Open.');
   await endpointDocument(owned.name,current.current.privateUrl);
   const client=await connectIatiWorkspace({consoleUrlFile:join(outputDirectory,'connections',owned.name+'.txt'),timeoutMs:900000});
   const actual=await client.launch();
   check(actual.bindingSha256===launched.bindingSha256&&actual.workspace===owned.workspace&&actual.pid===launched.pid,
    'The authenticated original launch differs from the actual Applications observation.');
   owned.current={operationId:current.current.id,origin:client.origin,bindingSha256:launched.bindingSha256,pid:launched.pid};
   await save();
   return{client,url:current.current.privateUrl,owned};
  }
  async function stopApplication(owned){
   let current=await appState(owned.id);
   if(current.current&&(current.current.active||['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(current.current.phase))){
    await appApi('/api/applications/stop',{applicationId:owned.id,operationId:current.current.id});
    current=await until(()=>appState(owned.id),value=>!value.current?.active&&
     !['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(value.current?.phase),'The original IATI command has not completed its Stop.',{timeoutMs:90000});
   }
   activeApplications.delete(owned.id);
   if(owned.runs.at(-1)){owned.runs.at(-1).finished=true;owned.runs.at(-1).terminal=current.current?.phase??null;}
   owned.stopped=current.current?{operationId:current.current.id,phase:current.current.phase,result:current.current.result}:null;
   await save();
   const output=current.current?await appApi('/api/applications/output?'+new URLSearchParams({applicationId:owned.id,operationId:current.current.id})):null;
   if(output)await publish(join(outputDirectory,'applications-'+owned.name+'-'+current.current.id+'.json'),output);
   return owned.stopped;
  }
  async function runCli(name,workspace,args,{repeat=false}={}){
   const folder=join(outputDirectory,'cli',name);await privateDirectory(folder);
   const request={node:process.execPath,args:[join(installedRoot,SDK+'iati/cli.mjs'),'--python',pythonExecutable,'--workspace',workspace,...args]};
   await publish(join(folder,'request.json'),request,true);
   const done=await json(join(folder,'result.json'));
   if(done&&!repeat){check(done.exitCode===0,'A retained original CLI command failed.');return JSON.parse(await readFile(done.stdout,'utf8'));}
   const attempt=(await readdir(folder)).filter(file=>/^stdout-\d+\.json$/.test(file)).length;
   const stdout=join(folder,'stdout-'+attempt+'.json'),stderr=join(folder,'stderr-'+attempt+'.log');
   const out=await open(stdout,'wx',0o600),err=await open(stderr,'wx',0o600);let child;
   try{
    child=spawn(request.node,request.args,{shell:false,cwd:outputDirectory,
     env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',SF30_XML_NODE:process.execPath},stdio:['ignore',out.fd,err.fd]});
    const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
    await out.sync();await err.sync();
    const receipt={...request,stdout,stderr,exitCode:exit.code,signal:exit.signal,endedAt:new Date().toISOString(),
     stdoutFile:await identity(stdout),stderrFile:await identity(stderr)};
    await publish(join(folder,'attempt-'+attempt+'.json'),receipt);
    check(exit.code===0,'Original IATI CLI failed; its exact stderr is retained at '+stderr);
    await publish(join(folder,'result.json'),receipt);
    return JSON.parse(await readFile(stdout,'utf8'));
   }finally{await out.close();await err.close();}
  }
  const {MerchantSourceWorkspaces,readSourceWorkspaceConfiguration}=await installed(OPERATOR+'source-workspace.mjs');
  const {sourceWorkspaceTools}=await installed(OPERATOR+'catalog/source-workspace.mjs');
  const {createMcpToolHandler,MCP_VERSION}=await installed('stellar-forge/mcp-paid-agent/http-tools.mjs');
  const tools=sourceWorkspaceTools((name,description,properties,required,flags={})=>({
   name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},
   annotations:{readOnlyHint:flags.readOnly===true,idempotentHint:flags.idempotent===true}
  }));
  async function startMcp(){
   const configFile=join(outputDirectory,'mcp','connections.json');
   await publish(configFile,{schema:'stellar-forge.source-workspace-connection.v1',workspaces:{
    source:{format:'iati',label:actor.label.slice(0,120)+' / original participant work',consoleUrlFile:join(outputDirectory,'connections','source.txt')},
    received:{format:'iati',label:actor.label.slice(0,120)+' / received participant work',consoleUrlFile:join(outputDirectory,'connections','received.txt')}
   }},true);
   const sourceWorkspaces=await readSourceWorkspaceConfiguration(configFile);
   const adapter=new MerchantSourceWorkspaces({sourceWorkspaces,exportsDirectory:join(outputDirectory,'mcp')});
   const token=randomBytes(32).toString('hex'),requests=new Set(),sockets=new Set();
   let closing=false,server=null,adapterClosed=false,closePromise=null;
   const close=()=>{
    if(closePromise)return closePromise;
    closePromise=(async()=>{
     closing=true;
     const errors=[];
     const closed=new Promise(resolve=>{
      if(!server?.listening){resolve();return;}
      server.close(error=>{if(error&&error.code!=='ERR_SERVER_NOT_RUNNING')errors.push(error);resolve();});
     });
     try{
      server?.closeIdleConnections();
      await Promise.allSettled([...requests]);
      if(!adapterClosed){await adapter.close();adapterClosed=true;}
     }catch(error){errors.push(error);}
     finally{
      for(const socket of sockets)socket.destroy();
      server?.closeAllConnections();
      await closed;
     }
     if(errors.length)throw new AggregateError(errors,'The original MCP adapter close needs its retained cleanup continuation.');
    })().finally(()=>{closePromise=null;if(adapterClosed&&!server?.listening&&sockets.size===0)mcpOwners.delete(owner);});
    return closePromise;
   };
   const owner={close};mcpOwners.add(owner);
   try{
    const handler=createMcpToolHandler({tools,call:(name,args)=>adapter.call(name,args)},{
     bearerToken:token,serverName:'Original IATI source receiving',serverVersion:'1.0.0',
     instructions:'Operate the declared original IATI participant consoles with their retained publisher, cohort, reviewed revisions and full release.'
    });
    server=createServer((request,response)=>{
     if(closing){response.writeHead(503);response.end();return;}
     const pending=handler(request,response).catch(error=>{if(!response.headersSent)response.writeHead(500);response.end();});
     requests.add(pending);pending.finally(()=>requests.delete(pending));
    });
    server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
    server.requestTimeout=240000;server.headersTimeout=10000;server.keepAliveTimeout=1000;
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const endpoint='http://127.0.0.1:'+server.address().port+'/mcp';
    let next=0;
    const rpc=async(method,params)=>{
     const id=++next;
     const response=await fetch(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(240000),
      headers:{authorization:'Bearer '+token,'content-type':'application/json',
       accept:'application/json, text/event-stream','mcp-protocol-version':MCP_VERSION},
      body:JSON.stringify({jsonrpc:'2.0',id,method,...(params===undefined?{}:{params})})});
     const envelope=await boundedJson(response);
     check(envelope.id===id&&!envelope.error,'The original MCP response envelope was rejected.');
     if(envelope.result?.isError)throw Object.assign(new Error(envelope.result.structuredContent?.reason??'Original source MCP call failed.'),
      {code:envelope.result.structuredContent?.code??'IATI_MCP'});
     return envelope.result;
    };
    await rpc('initialize',{protocolVersion:MCP_VERSION,capabilities:{},clientInfo:{name:actor.label,version:'1.0.0'}});
    const catalog=(await rpc('tools/list')).tools;
    check(['merchant_source_iati_publishing_project','merchant_source_iati_publishing_request','merchant_source_iati_publishing_save','merchant_source_iati_publishing_export','merchant_source_file_read'].every(name=>catalog.some(tool=>tool.name===name)),
     'The actual original MCP catalog omitted the IATI operating tools.');
    const missing=await fetch(endpoint,{method:'POST',signal:AbortSignal.timeout(240000),headers:{'content-type':'application/json'},body:'{}'});
    check(missing.status===401,'The actual source MCP endpoint must require the original bearer token.');await missing.body?.cancel();
    return{adapter,endpoint,call:async(name,args={})=>(await rpc('tools/call',{name,arguments:args})).structuredContent,close};
   }catch(error){
    try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Original MCP startup failed and retained adapter cleanup remains pending.');}
    throw error;
   }
  }
  async function downloadMcp(kind,metadata,{interrupt=false}={}){
   const path=join(outputDirectory,'downloads','mcp-'+kind+'.zip'),partial=path+'.partial';
   let selected=progress.downloads[kind];
   if(await exists(path)){
    const saved=await identity(path);check(saved.sha256===metadata.sha256&&saved.bytes===metadata.bytes,'A completed original archive changed.');
    selected.file={path,...saved};await save();return selected.file;
   }
   const handle=await open(partial,(await exists(partial)?'r+':'wx+'),0o600);
   let readId=null;
   try{
    let offset=selected.offset??0;
    const size=(await handle.stat()).size;check(size>=offset,'The retained download is shorter than its committed offset.');
    if(size>offset)await handle.truncate(offset);
    while(offset<metadata.bytes){
     const chunk=await mcp.call('merchant_source_file_read',{workspace:'source',exportId:metadata.exportId,
      ...(readId?{readId}:{}),offset,limit:interrupt&&!selected.interrupted?Math.min(16384,Math.max(1,Math.floor(metadata.bytes/2))):196608});
     check(chunk.file.sha256===metadata.sha256&&chunk.file.bytes===metadata.bytes&&chunk.offset===offset&&chunk.encoding==='base64',
      'The original retained file reader changed its source binding.');
     const bytes=Buffer.from(chunk.data,'base64');
     check(bytes.length===chunk.bytesRead&&bytes.length>0&&offset+bytes.length<=metadata.bytes,'The original file range is incomplete.');
     let written=0;
     while(written<bytes.length){const result=await handle.write(bytes,written,bytes.length-written,offset+written);
      check(result.bytesWritten>0,'The retained native file range could not be written.');written+=result.bytesWritten;}
     await handle.sync();offset+=bytes.length;selected.offset=offset;readId=chunk.nextOffset===null?null:chunk.readId;await save();
     if(interrupt&&!selected.interrupted&&offset<metadata.bytes){
      if(readId)await mcp.call('merchant_source_file_release',{workspace:'source',readId});
      await mcp.close();mcp=null;selected.interrupted={offset,at:new Date().toISOString()};await save();
      mcp=await startMcp();readId=null;
     }
    }
   }finally{
    await handle.close();
    if(readId&&mcp)await mcp.call('merchant_source_file_release',{workspace:'source',readId}).catch(()=>{});
   }
   const complete=await identity(partial);check(complete.bytes===metadata.bytes&&complete.sha256===metadata.sha256,'The full returned archive differs from the original selected SHA256.');
   await rename(partial,path);await syncDirectory(dirname(path));
   selected.file={path,...complete};await save();return selected.file;
  }
  async function saveResponse(name,response){
   check(response.ok,'The authenticated original download failed.');
   const destination=join(outputDirectory,'downloads',name),temporary=destination+'.partial';
   if(await exists(temporary))await rename(temporary,temporary+'.interrupted-'+randomUUID());
   const handle=await open(temporary,'wx',0o600);let bytes=0;
   const length=response.headers.get('content-length'),declared=length&&/^\d+$/.test(length)?Number(length):null;
   try{
    for await(const chunk of response.body??[]){bytes+=chunk.length;check(bytes<=4*1024*1024*1024,'The original archive exceeds its native limit.');await handle.writeFile(chunk);}
    await handle.sync();
   }finally{await handle.close();}
   check(declared===null||declared===bytes,'The authenticated native download ended before its declared byte count.');
   if(await exists(destination))await rename(destination,destination+'.previous-'+randomUUID());
   await rename(temporary,destination);await syncDirectory(dirname(destination));
   return{path:destination,...await identity(destination)};
  }


  async function runProcess(name,argv,{repeat=false,acceptedExitCodes=[0]}={}){
   const folder=join(outputDirectory,'processes',name);await privateDirectory(folder);
   await publish(join(folder,'request.json'),{argv},true);
   const done=await json(join(folder,'result.json'));
   if(done&&!repeat){
    check(acceptedExitCodes.includes(done.exitCode),'The retained original process did not finish successfully.');
    return JSON.parse(await readFile(done.stdout,'utf8'));
   }
   const number=(await readdir(folder)).filter(file=>/^stdout-\d+\.json$/.test(file)).length;
   const stdout=join(folder,'stdout-'+number+'.json'),stderr=join(folder,'stderr-'+number+'.log');
   const out=await open(stdout,'wx',0o600),err=await open(stderr,'wx',0o600);
   try{
    const child=spawn(argv[0],argv.slice(1),{shell:false,cwd:outputDirectory,
     env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore',out.fd,err.fd]});
    const ended=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
    await out.sync();await err.sync();
    const receipt={argv,exitCode:ended.code,signal:ended.signal,stdout,stderr,
     stdoutFile:await identity(stdout),stderrFile:await identity(stderr),endedAt:new Date().toISOString()};
    await publish(join(folder,'attempt-'+number+'.json'),receipt,true);
    check(acceptedExitCodes.includes(ended.code),'The original process failed; complete output remains at '+folder);
    const result=JSON.parse(await readFile(stdout,'utf8'));
    await publish(join(folder,'result.json'),receipt);
    return result;
   }finally{await out.close();await err.close();}
  }

  function verifyProject(actual,expected){
   check(actual?.schema==='stellar-forge.iati-participant-project.v1'&&same(actual,expected),'The complete original participant revision changed.');
   return actual;
  }
  async function nativeHistory(alias,expected){
   let offset=0,snapshot,total,all=[];const pages=[];
   while(true){
    const value=(await mcp.call('merchant_source_iati_publishing_history',{workspace:alias,participant:id,revision:releaseRevision,
     offset,limit:250,...(snapshot?{expectedSnapshot:snapshot}:{})})).native;
    check(plain(value)&&Array.isArray(value.items)&&SHA.test(value.snapshot??'')&&value.offset===offset&&
     Number.isSafeInteger(value.total)&&value.total>=0,'The original full history page is invalid.');
    if(snapshot)check(snapshot===value.snapshot&&total===value.total,'The original immutable history snapshot changed.');
    else{snapshot=value.snapshot;total=value.total;}
    check(same(value.items,expected.slice(offset,offset+value.items.length)),'The complete MCP history page differs from its original revisions.');
    const path=join(outputDirectory,'reads',alias+'-history-'+offset+'.json');await publish(path,value,true);pages.push({path,...await identity(path)});
    all.push(...value.items);
    if(value.nextOffset===null)break;
    check(Number.isSafeInteger(value.nextOffset)&&value.nextOffset===offset+value.items.length&&value.nextOffset>offset,'The history page did not advance.');
    offset=value.nextOffset;
   }
   check(all.length===total&&same(all,expected),'The native MCP history omitted an original revision.');
   return{snapshot,total,pages};
  }
  async function activities(client,revision,sourceId,alias){
   let offset=0,total=null;const rows=[],pages=[];
   while(true){
    const value=await client.publishingActivities(id,{revision,offset,limit:200});
    check(value.project===id&&value.revision===revision&&value.sourceId===sourceId&&value.offset===offset&&
     value.limit===200&&Array.isArray(value.rows)&&Number.isSafeInteger(value.total)&&value.total>=0,
     'The historical activity page selected a different original publisher revision.');
    if(total===null)total=value.total;else check(total===value.total,'The original cohort census changed between pages.');
    const samePage=(await mcp.call('merchant_source_iati_publishing_activities',{workspace:alias,participant:id,revision,offset,limit:200})).native;
    check(same(value,samePage),'The typed client and original MCP selected different activity rows.');
    const path=join(outputDirectory,'reads',alias+'-r'+revision+'-activities-'+offset+'.json');
    await publish(path,value,true);pages.push({path,...await identity(path)});rows.push(...value.rows);
    if(rows.length===total)break;
    check(value.rows.length>0&&rows.length<total,'The complete original activity page did not advance.');
    offset+=value.rows.length;
   }
   check(rows.length===project.activityIds.length&&new Set(rows.map(row=>row.activityId)).size===rows.length&&
    rows.every(row=>project.activityIds.includes(row.activityId)),'The complete historical activity cohort changed.');
   return{revision,sourceId,total,rows,pages};
  }
  async function retainedExport(key,alias='source'){
   const selected={workspace:alias,participant:id,revision:releaseRevision};
   if(progress.downloads[key]?.metadata){
    check(same(progress.downloads[key].selection,selected),'The retained export request changed its participant revision.');
    return progress.downloads[key].metadata;
   }
   const metadata=await mcp.call('merchant_source_iati_publishing_export',selected);
   check(metadata.format==='iati'&&metadata.kind==='publishing'&&metadata.sha256===metadata.exportId&&
    metadata.sha256===nativePacket.sha256&&metadata.bytes===nativePacket.bytes,
    'The original MCP selected a different complete participant release.');
   progress.downloads[key]={metadata,selection:selected,offset:0};await save();return metadata;
  }
  async function idle(page){
   await page.waitForFunction(()=>document.querySelector('#main')?.getAttribute('aria-busy')==='false',{},{timeout:1000000});
   const status=await page.locator('#status').textContent();
   check(!await page.locator('#status').evaluate(el=>el.classList.contains('error')),status||'Original browser action failed.');
   return status;
  }
  async function openPublishing(page){
   await page.locator('#pub-open-view[data-view="publishing"]').click();await idle(page);
   await page.locator('#publishing-panel').waitFor({state:'visible'});
   await page.locator('#pub-actor').fill(coreConfig.actor);
  }
  async function tab(page,name){
   await page.locator('[data-pub-view="'+name+'"]').click();
   await page.locator('[data-pub-panel="'+name+'"]').waitFor({state:'visible'});
  }
  async function openProjectPage(page,expected){
   await page.locator('#pub-project-select').selectOption(id);
   const selected=page.waitForResponse(response=>{
    const url=new URL(response.url());return url.pathname==='/api/iati/publishing/project'&&url.searchParams.get('id')===id;
   },{timeout:1000000});
   await page.locator('#pub-open').click();const response=await selected;
   check(response.ok(),'The original browser could not open the saved participant work.');
   verifyProject(await response.json(),expected);await idle(page);
  }
  async function openRevision(page,expected){
   await tab(page,'overview');
   const selected=page.waitForResponse(response=>{
    const url=new URL(response.url());return url.pathname==='/api/iati/publishing/project'&&
     url.searchParams.get('id')===id&&url.searchParams.get('revision')===String(expected.revision);
   },{timeout:1000000});
   await page.locator('#pub-history').getByRole('button',{name:'Open r'+expected.revision,exact:true}).click();
   const response=await selected;check(response.ok(),'The original browser could not reopen its selected historical revision.');
   verifyProject(await response.json(),expected);await idle(page);
   const mode=await page.locator('#pub-mode').textContent(),source=await page.locator('#pub-source-summary').textContent();
   check(mode.includes(expected.revision===releaseRevision?'Current saved work':'Earlier revision')&&
    source.includes(expected.baselineSource)&&source.includes(expected.candidateSource),
    'The visible history/source selection differs from its complete original revision.');
   check((await page.locator('#pub-summary').textContent()).includes('Saved revision'),'The selected browser revision is not visible.');
  }
  async function originalFieldPage(page,expected,field){
   await tab(page,'corrections');
   const activityId=field.activityId;
   const option=page.locator('#pub-activity option').filter({hasText:activityId});
   check(await option.count()===1,'The selected original field activity must be on the displayed complete source page.');
   await page.locator('#pub-activity').selectOption(activityId);
   const selected=page.waitForResponse(response=>{
    const url=new URL(response.url());return url.pathname==='/api/iati/publishing/fields'&&
     url.searchParams.get('id')===id&&url.searchParams.get('activity')===activityId&&url.searchParams.get('revision')===String(expected.revision);
   },{timeout:1000000});
   await page.locator('#pub-load-fields').click();const response=await selected;
   check(response.ok()&&same(await response.json(),field),'The browser historical field body differs from the original complete native field.');
   await idle(page);check((await page.locator('#pub-original-field').textContent()).trim().length>0,'The original field view is empty.');
  }
  async function viewReceipt(page,receipt,name,width){
   await page.setViewportSize({width,height:940});await idle(page);
   const path=join(outputDirectory,'views',name+'-'+width+'.png');
   await page.screenshot({path,fullPage:true});
   const measured=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,
    bodyWidth:document.body.scrollWidth,heading:document.querySelector('#publishing-panel h1')?.textContent,
    section:document.querySelector('[data-pub-panel]:not([hidden])')?.dataset.pubPanel,
    mode:document.querySelector('#pub-mode')?.textContent}));
   check(measured.documentWidth<=width+1&&measured.bodyWidth<=width+1,'The original participant view overflows the selected viewport.');
   const file={path,...await identity(path),...measured};receipt.views.push(file);return file;
  }
  async function browserDownload(page,button,name,expected){
   const selected=page.waitForEvent('download',{timeout:1000000});await page.locator('#'+button).click();
   const download=await selected,path=join(outputDirectory,'downloads',name),temporary=path+'.browser-partial';
   if(await exists(temporary))await rename(temporary,temporary+'.interrupted-'+randomUUID());
   await download.saveAs(temporary);check(!await download.failure(),'The complete original browser download failed.');
   const actual=await identity(temporary);
   check(actual.sha256===expected.sha256&&(expected.bytes===undefined||actual.bytes===expected.bytes),'The full browser file differs from its original publisher/release.');
   if(await exists(path)){const prior=await identity(path);check(prior.bytes===actual.bytes&&prior.sha256===actual.sha256,'A retained complete browser download changed.');
    await rename(temporary,temporary+'.verified-retry-'+randomUUID());
   }else{await rename(temporary,path);await syncDirectory(dirname(path));}
   await idle(page);return{path,...actual};
  }
  async function receivePacket(client){
   const handle=await open(nativePacket.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
   try{return await client.publishingReceive({body:handle.createReadStream({autoClose:false,start:0}),bytes:nativePacket.bytes});}
   finally{await handle.close();}
  }
  function verifyReceived(value){
   check(value?.schema==='stellar-forge.iati-participant-receiving.v1'&&value.state==='COMPLETE'&&
    value.revisions===core.historyRevisions&&value.packet?.sha256===nativePacket.sha256&&value.packet.bytes===nativePacket.bytes,
    'The original complete participant receiver changed its release or history.');
   verifyProject(value.project,project);return value;
  }
const packetTool=String.raw`
import hashlib,json,os,stat,sys,uuid,zipfile
from pathlib import Path,PurePosixPath
def need(ok,message):
 if not ok: raise ValueError(message)
def canonical(v): return (json.dumps(v,sort_keys=True,indent=2,ensure_ascii=False)+"\n").encode()
def identity(path):
 path=Path(path);s=path.lstat()
 need(stat.S_ISREG(s.st_mode),"Select complete regular source files")
 h=hashlib.sha256();n=0
 with path.open("rb") as f:
  for b in iter(lambda:f.read(1024*1024),b""):h.update(b);n+=len(b)
 after=path.lstat()
 need((s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) and n==s.st_size,"Original source changed")
 return {"bytes":n,"sha256":h.hexdigest()}
def safe(name):
 p=PurePosixPath(name)
 need(isinstance(name,str) and str(p)==name and not p.is_absolute() and not any(v in ("",".","..") for v in p.parts),"Unsafe complete packet member")
 return p
def syncdir(path):
 fd=os.open(path,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
def publish(path,data):
 path=Path(path)
 if path.exists():
  need(path.read_bytes()==data,"An immutable receiving record changed");return
 temp=path.with_name("."+path.name+"."+uuid.uuid4().hex+".partial")
 with temp.open("xb") as f:os.chmod(temp,0o600);f.write(data);f.flush();os.fsync(f.fileno())
 os.replace(temp,path);syncdir(path.parent)
def describe(z):
 rows=z.infolist();need(len(rows)==len({x.filename for x in rows}),"Duplicate archive members")
 for row in rows:
  safe(row.filename);need(not row.is_dir() and stat.S_IFMT(row.external_attr>>16) in (0,stat.S_IFREG),"Archive contains a nonregular member")
 return {x.filename:x for x in rows}
def verify(path,spec,extract=None):
 with zipfile.ZipFile(path) as z:
  rows=describe(z);need(set(rows)==set(spec)|{"manifest.json"},"Complete archive inventory differs")
  need(z.read("manifest.json")==canonical(selection_manifest) if mode=="bundle" else True,"Saved bundle selection changed")
  result=[]
  for name,expected in sorted(spec.items()):
   need(isinstance(expected,dict) and isinstance(expected.get("bytes"),int) and expected["bytes"]>=0 and len(expected.get("sha256",""))==64,"Invalid member identity")
   row=rows[name];need(row.file_size==expected["bytes"],"Member size differs")
   target=Path(extract).joinpath(*safe(name).parts) if extract else None
   temp=None;output=None
   if target:
    target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    if target.exists():need(identity(target)==expected,"Existing extracted source changed")
    else:
     temp=target.with_name("."+target.name+"."+uuid.uuid4().hex+".partial")
     output=temp.open("xb");os.chmod(temp,0o600)
   h=hashlib.sha256();n=0
   try:
    with z.open(row) as f:
     for b in iter(lambda:f.read(1024*1024),b""):
      h.update(b);n+=len(b)
      if output:output.write(b)
    need(n==expected["bytes"] and h.hexdigest()==expected["sha256"],"Full member hash differs")
    if output:output.flush();os.fsync(output.fileno())
   finally:
    if output:output.close()
   if temp:os.replace(temp,target);syncdir(target.parent)
   result.append({"name":name,**expected,**({"path":str(target)} if target else {})})
  return result
configuration=json.loads(Path(sys.argv[1]).read_text())
mode=configuration["mode"]
if mode=="inspect":
 packet=Path(configuration["packet"]);need(identity(packet)==configuration["identity"],"Selected full participant ZIP changed")
 with zipfile.ZipFile(packet) as z:
  rows=describe(z);need("manifest.json" in rows,"The full native manifest is missing")
  manifest=json.loads(z.read("manifest.json"));need(manifest.get("schema")=="stellar-forge.iati-participant-release.v1","Select the original participant release")
  spec=manifest["files"]
  need(isinstance(spec,dict),"The original native file map is missing")
 extract=Path(configuration["directory"]);extract.mkdir(parents=True,exist_ok=True,mode=0o700)
 publish(extract/"selection.json",canonical(configuration))
 members=verify(packet,spec,extract)
 with zipfile.ZipFile(packet) as z:publish(extract/"manifest.json",z.read("manifest.json"))
 result={"schema":"stellar-forge.iati-participant-packet-inspection.v1","packet":str(packet),**identity(packet),"directory":str(extract),"members":members,
  "manifest":{"path":str(extract/"manifest.json"),**identity(extract/"manifest.json")}}
 print(json.dumps(result,separators=(",",":")))
elif mode=="bundle":
 output=Path(configuration["output"]);selected=configuration["files"]
 need(isinstance(selected,list) and len(selected)==len({v["name"] for v in selected}),"Retain each selected customer member once")
 spec={}
 for row in selected:
  safe(row["name"]);need(row["name"]!="manifest.json","Manifest name is reserved")
  expected={"bytes":row["bytes"],"sha256":row["sha256"]}
  need(identity(row["path"])==expected,"Selected customer source changed")
  spec[row["name"]]=expected
 selection_manifest={"schema":"stellar-forge.iati-participant-complete-handover.v1","operationId":configuration["operationId"],
  "createdAt":configuration["createdAt"],"project":configuration["project"],"source":configuration["source"],
  "historyRevisions":configuration["historyRevisions"],"files":spec}
 if output.exists():
  members=verify(output,spec)
  print(json.dumps({"schema":selection_manifest["schema"],"path":str(output),**identity(output),"members":len(members),"reused":True},separators=(",",":")));sys.exit()
 temp=output.with_name("."+output.name+".partial")
 if temp.exists():os.replace(temp,temp.with_name(temp.name+".interrupted-"+uuid.uuid4().hex));syncdir(temp.parent)
 with temp.open("xb") as f:
  os.chmod(temp,0o600)
  with zipfile.ZipFile(f,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
   def info(name):
    i=zipfile.ZipInfo(name,(1980,1,1,0,0,0));i.create_system=3;i.external_attr=(stat.S_IFREG|0o600)<<16;i.compress_type=zipfile.ZIP_DEFLATED;return i
   z.writestr(info("manifest.json"),canonical(selection_manifest))
   for row in sorted(selected,key=lambda v:v["name"]):
    h=hashlib.sha256();n=0
    with Path(row["path"]).open("rb") as src,z.open(info(row["name"]),"w",force_zip64=True) as dest:
     for b in iter(lambda:src.read(1024*1024),b""):dest.write(b);h.update(b);n+=len(b)
    need(n==row["bytes"] and h.hexdigest()==row["sha256"],"Customer source changed during full ZIP publication")
  f.flush();os.fsync(f.fileno())
 members=verify(temp,spec);os.replace(temp,output);syncdir(output.parent)
 print(json.dumps({"schema":selection_manifest["schema"],"path":str(output),**identity(output),"members":len(members),"reused":False},separators=(",",":")))
else:raise ValueError("Choose complete inspect or bundle")
`;
  const packetToolFile=join(outputDirectory,'packet','complete-packet.py');
  await publish(packetToolFile,Buffer.from(packetTool),true);
  async function inspectPacket(packet){
   const folder=join(outputDirectory,'packet','extracted');
   const input={mode:'inspect',packet:packet.path,identity:{bytes:packet.bytes,sha256:packet.sha256},directory:folder};
   const path=join(outputDirectory,'packet','inspect-input.json');await publish(path,input,true);
   const inspected=await runProcess('complete-packet-inspection',[pythonExecutable,'-B',packetToolFile,path]);
   check(inspected.schema==='stellar-forge.iati-participant-packet-inspection.v1'&&
    inspected.sha256===packet.sha256&&inspected.bytes===packet.bytes,'The complete extracted participant packet changed.');
   for(const file of inspected.members){const actual=await identity(file.path);
    check(actual.bytes===file.bytes&&actual.sha256===file.sha256,'A complete extracted native release member changed.');}
   const originalProject=await json(join(inspected.directory,'participant.json'));
   verifyProject(originalProject,project);
   const originalHistory=await json(join(inspected.directory,'history.json'));
   check(Array.isArray(originalHistory)&&originalHistory.length===core.historyRevisions&&
    same(originalHistory.at(-1),project),'The whole native archive omitted the original participant history.');
   const published=inspected.members.find(row=>row.name==='publisher-release.xml');
   check(published?.sha256===project.candidateSource,'The customer XML is not the original reviewed candidate.');
   for(const required of ['requests.json','methodology.json','feedback.csv','corrections.json','validation.json','evidence.json','activities.csv','release.html'])
    check(inspected.members.some(row=>row.name===required),'The complete native archive omitted '+required);
   return inspected;
  }
  async function verifySummary(summary){
   check(summary?.schema===SCHEMA&&summary.operationId===operationId&&same(summary.actor,actor)&&
    summary.sourceRoot===sourceRoot&&same(summary.runtime,runtimeBinding(runtime))&&
    summary.core?.operationId===core.operationId&&summary.source?.directory===directory&&
    summary.source.participant===id&&summary.source.revision===releaseRevision&&
    summary.source.baselineSource===project.baselineSource&&summary.source.candidateSource===project.candidateSource&&
    same(summary.source.activityIds,project.activityIds)&&summary.source.historyRevisions===core.historyRevisions&&
    same(summary.finance,project.finance)&&summary.received?.directory===receivedDirectory&&
    summary.received.participant===id&&summary.received.revision===releaseRevision&&
    Array.isArray(summary.applications)&&summary.applications.length===2&&
    summary.applications.every(row=>row.phase==='STOPPED'&&Object.values(progress.applications).some(owned=>owned.id===row.id))&&
    Array.isArray(summary.browser?.errors)&&summary.browser.errors.length===0&&Array.isArray(summary.browser.views),
    'The complete retained summary must select the same stopped Applications and original participant source.');
   const selected=new Map(),walk=value=>{
    if(Array.isArray(value)){for(const child of value)walk(child);return;}
    if(!plain(value))return;
    if(typeof value.path==='string'&&Number.isSafeInteger(value.bytes)&&SHA.test(value.sha256)){
     const prior=selected.get(value.path);
     check(!prior||prior.bytes===value.bytes&&prior.sha256===value.sha256,'The summary selected conflicting original file identities.');
     selected.set(value.path,value);
    }
    for(const child of Object.values(value))if(child&&typeof child==='object')walk(child);
   };
   walk(summary);
   for(const item of selected.values()){
    const actual=await identity(item.path);
    check(actual.bytes===item.bytes&&actual.sha256===item.sha256,
     'A retained completed receiving observation changed before final bundle publication.');
   }
   const selectedCore=await identity(join(coreOutput,'result.json'));
   check(summary.core.result.path===join(coreOutput,'result.json')&&summary.core.result.bytes===selectedCore.bytes&&
    summary.core.result.sha256===selectedCore.sha256,'The summary lost its original complete core result.');
   return summary;
  }
  async function completeBundle({inspection,summary}={}){
   const input=join(outputDirectory,'packet','complete-bundle-input.json');
   const summaryFile=join(outputDirectory,'packet','receiving-summary.json');
   let selected=await json(input);
   if(selected){
    check(selected.operationId===operationId&&same(selected.project,project)&&same(selected.source,core.source)&&
     selected.historyRevisions===core.historyRevisions&&selected.selectionSha256===hash(encode(selection))&&
     Array.isArray(selected.files),'A retained full customer bundle selected different native work.');
    summary=await verifySummary(selected.summary);
   }else{
    // Reconcile the old complete observation before any browser replay. The new
    // full intent is published before its summary companion below.
    const oldSummary=await json(summaryFile);
    summary=await verifySummary(oldSummary??summary);
    inspection??=await inspectPacket(nativePacket);
    const files=[],names=new Set();
    const add=async(name,path)=>{
     check(!names.has(name)&&!name.startsWith('/')&&!name.split('/').some(part=>!part||part==='.'||part==='..'),
      'Retain every complete customer member once under a safe name.');
     names.add(name);const item=await identity(path);files.push({name,path,bytes:item.bytes,sha256:item.sha256});
    };
    await add('customer/IATI_Participant_Release.zip',nativePacket.path);
    await add('customer/native-manifest.json',inspection.manifest.path);
    for(const member of inspection.members)await add('customer/expanded/'+member.name,member.path);
    await add('publisher/original-full-publisher.xml',core.source.path);
    await add('publisher/original-acquisition-receipt.json',coreConfig.publisherReceipt);
    await add('publisher/original-selected-input'+(coreConfig.publisherFile.endsWith('.gz')?'.xml.gz':'.xml'),coreConfig.publisherFile);
    await add('inputs/core-input.json',coreInputFile);
    await add('inputs/full-participant-feedback.csv',coreConfig.feedbackFile);
    for(const [index,evidence]of(coreConfig.evidenceFiles??[]).entries())
     await add('inputs/evidence-'+index+'.bin',evidence.path);
    await add('receiving/core/selection.json',join(coreOutput,'selection.json'));
    await add('receiving/core/result.json',join(coreOutput,'result.json'));
    for(const item of core.files){
     check(item.path.startsWith(coreOutput+'/'),'The original core output file must belong to its complete retained output directory.');
     await add('receiving/core/files/'+item.path.slice(coreOutput.length+1),item.path);
    }
    const summaryBytes=encode(summary);
    files.push({name:'receiving/summary.json',path:summaryFile,bytes:summaryBytes.length,sha256:hash(summaryBytes)});
    await add('receiving/selected-source.json',join(outputDirectory,'selection.json'));
    for(const name of(await readdir(join(outputDirectory,'reads'))).sort())
     if(name.endsWith('.json'))await add('receiving/reads/'+name,join(outputDirectory,'reads',name));
    for(const folder of(await readdir(join(outputDirectory,'cli'))).sort()){
     const base=join(outputDirectory,'cli',folder),receipt=await json(join(base,'result.json'));
     if(receipt){await add('receiving/cli/'+folder+'/request.json',join(base,'request.json'));
      await add('receiving/cli/'+folder+'/stdout.json',receipt.stdout);}
    }
    for(const name of(await readdir(join(outputDirectory,'downloads'))).sort()){
     const path=join(outputDirectory,'downloads',name),info=await lstat(path);
     if(info.isFile()&&!name.includes('.partial')&&!name.includes('.interrupted')&&!name.includes('.verified-retry'))
      await add('receiving/downloads/'+name,path);
    }
    for(const name of ['PUBLISHING.md','PUBLISHING_SOURCES.md','receiving/PUBLISHING.md'])
     await add('guides/'+name,join(installedRoot,SDK+'iati',name));
    for(const name of ['receiving/publishing.py','receiving/publishing.mjs','receiving/browser.mjs'])
     await add('operator/'+name,join(installedRoot,SDK+'iati',name));
    selected={mode:'bundle',output:join(outputDirectory,'IATI_Participant_Complete_Customer_Receiving.zip'),
     operationId,createdAt:progress.createdAt,selectionSha256:hash(encode(selection)),summary,
     project,source:core.source,historyRevisions:core.historyRevisions,files};
    await publish(input,selected,true);
   }
   // Exact original summary bytes can now be repaired after any interrupted
   // write. The full selected input exists first and retains all file hashes.
   await publish(summaryFile,selected.summary,true);
   for(const item of selected.files){
    const actual=await identity(item.path);
    check(actual.bytes===item.bytes&&actual.sha256===item.sha256,'A complete selected customer member changed.');
   }
   const bundle=await runProcess('complete-customer-bundle',[pythonExecutable,'-B',packetToolFile,input]);
   const actual=await identity(bundle.path);
   check(actual.sha256===bundle.sha256&&actual.bytes===bundle.bytes,'The complete customer package differs from its verified native output.');
   return{bundle,summary:selected.summary,files:selected.files};
  }
  async function finishCustomerWorkflow(completed){
   await stage('completeCustomerHandover',completed.bundle);
   const fileMap=new Map();
   for(const item of [completed.bundle,nativePacket,core.source,...core.files,...completed.files,
    {path:join(coreOutput,'result.json')},{path:join(outputDirectory,'selection.json')}])
    fileMap.set(item.path,{path:item.path,...await identity(item.path)});
   const outcome={...completed.summary,state:'COMPLETE',selectionSha256:hash(encode(selection)),completedAt:new Date().toISOString(),
    customerHandover:completed.bundle,files:[...fileMap.values()],stages:Object.keys(progress.stages)};
   await publish(join(outputDirectory,'completed-workflow.json'),outcome,true);
   return outcome;
  }

  // Recover only the Applications entries selected by this original operation.
  // The Python core is already durably COMPLETE and is never recreated here.
  for(const owned of Object.values(progress.applications)){
   if(!owned.id)continue;
   const current=await appState(owned.id);
   if(current?.current&&(current.current.active||['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(current.current.phase)))
    await stopApplication(owned);
  }
  const completedCandidate=await json(join(outputDirectory,'completed-workflow.json'));
  if(completedCandidate){
   check(completedCandidate.state==='COMPLETE'&&completedCandidate.selectionSha256===hash(encode(selection)),
    'The retained completed customer workflow belongs to another selection.');
   for(const item of completedCandidate.files){const actual=await identity(item.path);
    check(actual.bytes===item.bytes&&actual.sha256===item.sha256,'A complete customer file changed before final cleanup.');}
   result=completedCandidate;
  }else if(await exists(join(outputDirectory,'packet','complete-bundle-input.json'))||
   await exists(join(outputDirectory,'packet','receiving-summary.json'))){
   result=await finishCustomerWorkflow(await completeBundle());
  }else{
   const inspection=await inspectPacket(nativePacket);
   const history=await json(join(inspection.directory,'history.json'));
   const requests=await json(join(inspection.directory,'requests.json'));
   const baseline=history.find(row=>row.revision===core.baselineRevision);
   const corrected=history.find(row=>row.revision===core.correctedRevision);
   check(baseline&&corrected&&baseline.candidateSource===core.source.sha256&&
    corrected.candidateSource===project.candidateSource&&baseline.candidateSource!==corrected.candidateSource,
    'The native correction must retain its original baseline and exact changed candidate.');
   check(Array.isArray(requests)&&requests.length===history.length&&
    requests.every(row=>typeof row.input==='string'&&row.project===id&&Number.isSafeInteger(row.revision)),
    'The complete archive must retain every original action input and historical result.');
   const nativeFinance=await json(join(coreOutput,'results','native-finance.json'));
   check(same(nativeFinance?.selection,project.finance)&&project.finance?.portfolioId,
    'The original paired finance selection is missing from the completed core.');
   const baselineFields=await json(join(coreOutput,'results','baseline-fields.json'));
   const correctedFields=await json(join(coreOutput,'results','corrected-fields.json'));
   const selectedRevisions=[baseline,corrected,project];
   const expectedFields=(selected,activityId)=>{
    const original=selected.revision===baseline.revision?baseline:corrected;
    const reference=selected.revision===baseline.revision?baselineFields[activityId]:correctedFields[activityId];
    check(reference&&reference.project===id&&reference.revision===original.revision&&
     reference.sourceId===original.candidateSource&&selected.id===id&&
     selected.candidateSource===reference.sourceId,
     'The selected historical fields must retain the exact original project and candidate source.');
    return {...reference,project:id,revision:selected.revision,sourceId:selected.candidateSource};
   };
   const cliReads=[];
   verifyProject(await runCli('source-latest',directory,['publishing-project','--id',id]),project);
   const cliHistory=await runCli('source-history',directory,['publishing-history','--id',id,'--revision',String(releaseRevision)]);
   check(same(cliHistory.history,history),'The original CLI omitted a complete participant revision.');
   for(const selected of selectedRevisions){
    verifyProject(await runCli('source-project-r'+selected.revision,directory,
     ['publishing-project','--id',id,'--revision',String(selected.revision)]),selected);
    const page=await runCli('source-activities-r'+selected.revision,directory,
     ['publishing-activities','--id',id,'--revision',String(selected.revision),'--offset','0','--limit','200']);
    check(page.sourceId===selected.candidateSource&&page.revision===selected.revision&&
     page.total===project.activityIds.length&&page.rows.length===page.total,
     'The original CLI historical source or whole declared cohort changed.');
    for(const activityId of project.activityIds){
     const fields=await runCli('source-fields-r'+selected.revision+'-'+hash(activityId).slice(0,16),directory,
      ['publishing-fields','--id',id,'--revision',String(selected.revision),'--activity',activityId]);
     const expected=expectedFields(selected,activityId);
     check(same(fields,expected),'The original CLI selected different complete historical XML fields.');
     cliReads.push({revision:selected.revision,activityId,activitySha256:fields.activitySha256});
    }
   }
   const nativeBefore=await runCli('source-finance-baseline',directory,
    ['portfolio','--id',project.finance.portfolioId,'--revision',String(project.finance.beforeRevision)]);
   const nativeAfter=await runCli('source-finance-candidate',directory,
    ['portfolio','--id',project.finance.portfolioId,'--revision',String(project.finance.candidateRevision)]);
   check(same(nativeBefore,nativeFinance.baseline)&&same(nativeAfter,nativeFinance.candidate),
    'The original CLI finance portfolio changed its complete paired report.');
   const cliPacketPath=join(outputDirectory,'downloads','cli-source-complete-release.zip');
   await runCli('source-complete-export',directory,['publishing-export','--id',id,'--revision',String(releaseRevision),'--out',cliPacketPath]);
   const cliPacket={path:cliPacketPath,...await identity(cliPacketPath)};
   check(cliPacket.bytes===nativePacket.bytes&&cliPacket.sha256===nativePacket.sha256,'The full original CLI archive differs from the accepted release.');
   await stage('nativeCli',{historyRevisions:history.length,fields:cliReads,packet:cliPacket,
    finance:{portfolioId:project.finance.portfolioId,beforeRevision:project.finance.beforeRevision,candidateRevision:project.finance.candidateRevision}});

   const sourceOwned=await setupApplication('source',directory),sourceOpened=await startApplication(sourceOwned);
   sourceClient=sourceOpened.client;
   const receivedOwned=await setupApplication('received',receivedDirectory),receivedOpened=await startApplication(receivedOwned);
   receivedClient=receivedOpened.client;
   mcp=await startMcp();
   await stage('openedApplications',{source:{id:sourceOwned.id,workspace:directory,binding:sourceOwned.current.bindingSha256},
    received:{id:receivedOwned.id,workspace:receivedDirectory,binding:receivedOwned.current.bindingSha256}});
   const typedHistory=(await sourceClient.publishingHistory(id)).history;
   check(same(typedHistory,history),'The typed source client omitted an original action revision.');
   const mcpHistory=await nativeHistory('source',history);
   const sourceActivitySets=[];
   for(const selected of selectedRevisions){
    verifyProject(await sourceClient.publishingProject(id,{revision:selected.revision}),selected);
    verifyProject((await mcp.call('merchant_source_iati_publishing_project',
     {workspace:'source',participant:id,revision:selected.revision})).native,selected);
    const set=await activities(sourceClient,selected.revision,selected.candidateSource,'source');sourceActivitySets.push(set);
    for(const activityId of project.activityIds){
     const expected=expectedFields(selected,activityId);
     const fields=await sourceClient.publishingFields(id,activityId,{revision:selected.revision});
     check(same(fields,expected),'The full typed historical fields changed their source bytes.');
     const native=(await mcp.call('merchant_source_iati_publishing_fields',
      {workspace:'source',participant:id,revision:selected.revision,activity:activityId})).native;
     check(same(native,expected),'The full MCP historical fields changed their source bytes.');
     await publish(join(outputDirectory,'reads','source-r'+selected.revision+'-fields-'+hash(activityId).slice(0,16)+'.json'),fields,true);
    }
   }
   const replayed=[];
   for(const row of requests){
    const input=JSON.parse(row.input),expected=history.find(item=>item.revision===row.revision);
    check(input.requestId===row.id&&expected&&expected.lastAction.requestId===row.id,'An original request history binding differs.');
    const recorded=await sourceClient.publishingRequest(row.id);
    check(recorded.state==='RECORDED'&&recorded.requestId===row.id&&recorded.inputSha256===row.input_sha&&same(recorded.input,input),
     'The typed request lookup changed the complete original action input.');
    verifyProject(recorded.project,expected);
    const native=(await mcp.call('merchant_source_iati_publishing_request',{workspace:'source',requestId:row.id})).native;
    check(same(native,recorded),'The original MCP request lookup differs from the original complete native input/result.');
    await publish(join(outputDirectory,'reads','request-r'+row.revision+'.json'),recorded,true);
    const replayAction={create:'create',correction:'correct',release:'release'}[expected.lastAction.kind];
    if(replayAction){
     const typed=await sourceClient.publishingSave(replayAction,input);
     const repeated=(await mcp.call('merchant_source_iati_publishing_save',
      {workspace:'source',action:replayAction,definition:input})).native;
     verifyProject(typed,expected);verifyProject(repeated,expected);
     replayed.push({requestId:row.id,revision:row.revision,action:expected.lastAction.kind});
    }
   }
   check(replayed.length===3&&replayed.some(row=>row.action==='correction'),'Retain actual original create, correction and release replay through both interfaces.');
   verifyProject(await sourceClient.publishingProject(id),project);
   check(same((await sourceClient.publishingHistory(id)).history,history),'Replaying original requests changed the latest participant work.');
   check(same(await sourceClient.portfolio(project.finance.portfolioId,{revision:project.finance.beforeRevision}),nativeFinance.baseline)&&
    same(await sourceClient.portfolio(project.finance.portfolioId,{revision:project.finance.candidateRevision}),nativeFinance.candidate),
    'The actual typed finance reports differ from the original paired native portfolio.');
   await stage('typedAndMcp',{history:mcpHistory,activities:sourceActivitySets,replayedOriginalRequests:replayed,
    finance:{portfolioId:project.finance.portfolioId,baselineRevision:project.finance.beforeRevision,candidateRevision:project.finance.candidateRevision}});

   const packetExport=await retainedExport('release'),packetFile=await downloadMcp('release',packetExport,{interrupt:true});
   check(progress.downloads.release.interrupted&&progress.downloads.release.interrupted.offset>0&&
    progress.downloads.release.interrupted.offset<nativePacket.bytes,
    'The complete retained download must demonstrate its actual committed prefix and reconnect.');
   const httpPacket=await saveResponse('http-complete-release.zip',await sourceClient.publishingExport(id,{revision:releaseRevision}));
   check(httpPacket.sha256===nativePacket.sha256&&httpPacket.bytes===nativePacket.bytes,'The complete authenticated HTTP release differs.');
   const sourceFiles=[];
   for(const selected of selectedRevisions){
    const file=await saveResponse('http-r'+selected.revision+'-candidate.xml',
     await sourceClient.publishingSource(id,{revision:selected.revision,edition:'candidate'}));
    check(file.sha256===selected.candidateSource,'The complete original historical publisher XML changed.');
    sourceFiles.push({revision:selected.revision,edition:'candidate',...file});
   }
   const originalSource=await saveResponse('http-original-baseline.xml',
    await sourceClient.publishingSource(id,{revision:releaseRevision,edition:'baseline'}));
   check(originalSource.sha256===core.source.sha256&&originalSource.bytes===core.source.bytes,
    'The full publisher file was reduced to the selected cohort or otherwise changed.');
   sourceFiles.push({revision:releaseRevision,edition:'baseline',...originalSource});
   await stage('completeDownloads',{packet:packetFile,httpPacket,interruption:progress.downloads.release.interrupted,sources:sourceFiles});

   const playwrightLoaded=await import(pathToFileURL(playwrightModule).href);
   const playwright=playwrightLoaded.chromium?playwrightLoaded:playwrightLoaded.default;
   check(playwright?.chromium&&typeof playwright.chromium.launch==='function','Use the actual existing Playwright installation.');
   browser=await playwright.chromium.launch({executablePath:chromiumExecutable,headless:true,
    downloadsPath:join(outputDirectory,'temporary'),args:['--disable-dev-shm-usage']});
   const sourcePage=await openInstalledIatiPage({browser,applicationsUrl:appsServer.url,applicationLabel:sourceOwned.label,
    consoleUrl:sourceOpened.url,outputDirectory:join(outputDirectory,'views'),name:'source-participant'});
   contexts.add(sourcePage.context);const page=sourcePage.page,sourceReceipt=sourcePage.receipt;
   await openPublishing(page);await openProjectPage(page,project);
   for(const section of ['overview','feedback','review','handover']){
    await tab(page,section);await viewReceipt(page,sourceReceipt,'source-'+section,1360);
    await viewReceipt(page,sourceReceipt,'source-'+section,390);
   }
   await page.setViewportSize({width:1360,height:940});
   const firstActivity=sourceActivitySets[0].rows[0].activityId;
   for(const selected of [baseline,corrected]){
    await openRevision(page,selected);
    await originalFieldPage(page,selected,selected.revision===baseline.revision?baselineFields[firstActivity]:correctedFields[firstActivity]);
    await viewReceipt(page,sourceReceipt,'historical-r'+selected.revision+'-original-fields',1360);
    await viewReceipt(page,sourceReceipt,'historical-r'+selected.revision+'-original-fields',390);
    await page.setViewportSize({width:1360,height:940});
   }
   await openRevision(page,project);await tab(page,'handover');
   await page.locator('#pub-release-revision').selectOption(String(releaseRevision));
   const browserPacket=await browserDownload(page,'pub-download-release','browser-complete-release.zip',nativePacket);
   const browserBaseline=await browserDownload(page,'pub-download-baseline','browser-original-baseline.xml',core.source);
   const browserCandidate=await browserDownload(page,'pub-download-candidate','browser-reviewed-candidate.xml',{sha256:project.candidateSource});
   await stage('sourceBrowser',{receipt:sourceReceipt,selectedHistory:[baseline.revision,corrected.revision,releaseRevision],
    packet:browserPacket,originalPublisher:browserBaseline,reviewedPublisher:browserCandidate});
   await sourcePage.context.close();contexts.delete(sourcePage.context);

   const previousReceive=await json(join(coreOutput,'results','independent-receiving.json'));
   const received=verifyReceived(await receivePacket(receivedClient));
   check(same(received,previousReceive.first)&&same(previousReceive.first,previousReceive.replay),
    'The installed receiver changed the complete original core receiving result.');
   verifyProject(await receivedClient.publishingProject(id),project);
   check(same((await receivedClient.publishingHistory(id)).history,history),'The received typed client lost original history.');
   const receivedMcpHistory=await nativeHistory('received',history);
   const receivedActivitySets=[];
   for(const selected of selectedRevisions){
    verifyProject(await receivedClient.publishingProject(id,{revision:selected.revision}),selected);
    verifyProject((await mcp.call('merchant_source_iati_publishing_project',
     {workspace:'received',participant:id,revision:selected.revision})).native,selected);
    receivedActivitySets.push(await activities(receivedClient,selected.revision,selected.candidateSource,'received'));
    for(const activityId of project.activityIds){
     const expected=expectedFields(selected,activityId);
     check(same(await receivedClient.publishingFields(id,activityId,{revision:selected.revision}),expected),
      'The detached receiver selected the latest XML for an earlier revision.');
    }
   }
   check(same(await receivedClient.portfolio(project.finance.portfolioId,{revision:project.finance.beforeRevision}),nativeFinance.baseline)&&
    same(await receivedClient.portfolio(project.finance.portfolioId,{revision:project.finance.candidateRevision}),nativeFinance.candidate),
    'The detached receiver lost the original baseline/candidate finance reports.');
   const imported=verifyReceived((await mcp.call('merchant_source_import',
    {workspace:'received',fromWorkspace:'source',exportId:packetExport.exportId})).native);
   check(same(imported,received),'The original generic MCP import changed the complete saved release.');
   await stage('detachedReceiving',{directory:receivedDirectory,result:received,mcpReplay:imported,
    history:receivedMcpHistory,activities:receivedActivitySets,finance:project.finance});

   const receivedPage=await openInstalledIatiPage({browser,applicationsUrl:appsServer.url,applicationLabel:receivedOwned.label,
    consoleUrl:receivedOpened.url,outputDirectory:join(outputDirectory,'views'),name:'received-participant'});
   contexts.add(receivedPage.context);
   await openPublishing(receivedPage.page);await tab(receivedPage.page,'handover');
   await receivedPage.page.locator('#pub-receive-file').setInputFiles(packetFile.path);
   const receivingResponse=receivedPage.page.waitForResponse(response=>
    new URL(response.url()).pathname==='/api/iati/publishing/receive'&&response.request().method()==='POST',{timeout:1000000});
   await receivedPage.page.locator('#pub-receive-form button[type="submit"]').click();
   const actualReceive=await receivingResponse;
   check(actualReceive.ok()&&same(await actualReceive.json(),received),'The actual original file-input receive changed its complete packet.');
   const receiveStatus=await idle(receivedPage.page);
   check(receiveStatus.includes('Complete participant history and native finance received and reopened.'),
    'The original browser did not report its complete receiving outcome.');
   await openProjectPage(receivedPage.page,project);
   await viewReceipt(receivedPage.page,receivedPage.receipt,'received-release',1360);
   await viewReceipt(receivedPage.page,receivedPage.receipt,'received-release',390);
   await receivedPage.page.setViewportSize({width:1360,height:940});
   await openRevision(receivedPage.page,baseline);
   await originalFieldPage(receivedPage.page,baseline,baselineFields[firstActivity]);
   await viewReceipt(receivedPage.page,receivedPage.receipt,'received-baseline-fields',1360);
   await openRevision(receivedPage.page,corrected);
   await originalFieldPage(receivedPage.page,corrected,correctedFields[firstActivity]);
   await viewReceipt(receivedPage.page,receivedPage.receipt,'received-candidate-fields',390);
   await stage('receivedBrowser',{receipt:receivedPage.receipt,receive:received,history:[baseline.revision,corrected.revision]});
   await receivedPage.context.close();contexts.delete(receivedPage.context);

   await sourceClient.dispose();sourceClient=null;await receivedClient.dispose();receivedClient=null;
   await mcp.close();mcp=null;
   await stopApplication(sourceOwned);await stopApplication(receivedOwned);
   const cliReceived=verifyReceived(await runCli('recipient-receive-repeat',receivedDirectory,['publishing-receive','--file',packetFile.path]));
   check(same(cliReceived,received),'The original native CLI receive retry changed the complete original result.');
   verifyProject(await runCli('recipient-latest-reopen',receivedDirectory,['publishing-project','--id',id]),project);
   const recipientHistory=await runCli('recipient-history-reopen',receivedDirectory,['publishing-history','--id',id,'--revision',String(releaseRevision)]);
   check(same(recipientHistory.history,history),'The full received history changed after Stop and CLI reopen.');
   for(const selected of selectedRevisions){
    verifyProject(await runCli('recipient-project-r'+selected.revision,receivedDirectory,
     ['publishing-project','--id',id,'--revision',String(selected.revision)]),selected);
    const fields=await runCli('recipient-fields-r'+selected.revision,receivedDirectory,
     ['publishing-fields','--id',id,'--revision',String(selected.revision),'--activity',firstActivity]);
    check(same(fields,expectedFields(selected,firstActivity)),
     'The original received CLI selected a different historical XML field.');
   }
   const cliReceivedPacketPath=join(outputDirectory,'downloads','cli-received-complete-release.zip');
   await runCli('recipient-complete-export',receivedDirectory,
    ['publishing-export','--id',id,'--revision',String(releaseRevision),'--out',cliReceivedPacketPath]);
   const cliReceivedPacket={path:cliReceivedPacketPath,...await identity(cliReceivedPacketPath)};
   check(cliReceivedPacket.sha256===nativePacket.sha256&&cliReceivedPacket.bytes===nativePacket.bytes,
    'The independently received full CLI export differs from the original release.');

   const reopened=await startApplication(receivedOwned);receivedClient=reopened.client;
   verifyProject(await receivedClient.publishingProject(id),project);
   check(same((await receivedClient.publishingHistory(id)).history,history),'The same restarted Application lost complete participant history.');
   for(const selected of [baseline,corrected])
    verifyProject(await receivedClient.publishingProject(id,{revision:selected.revision}),selected);
   const reopenedPage=await openInstalledIatiPage({browser,applicationsUrl:appsServer.url,applicationLabel:receivedOwned.label,
    consoleUrl:reopened.url,outputDirectory:join(outputDirectory,'views'),name:'reopened-participant'});
   contexts.add(reopenedPage.context);await openPublishing(reopenedPage.page);await openProjectPage(reopenedPage.page,project);
   await tab(reopenedPage.page,'handover');
   await viewReceipt(reopenedPage.page,reopenedPage.receipt,'reopened-release',1360);
   await viewReceipt(reopenedPage.page,reopenedPage.receipt,'reopened-release',390);
   await stage('reopenedBrowser',{receipt:reopenedPage.receipt,applicationId:receivedOwned.id,
    participant:id,revision:releaseRevision,historyRevisions:history.length});
   await reopenedPage.context.close();contexts.delete(reopenedPage.context);
   await receivedClient.dispose();receivedClient=null;await stopApplication(receivedOwned);
   const finalApps=await appApi('/api/applications/state?historyLimit=30');
   const ownedApps=finalApps.applications.filter(row=>[sourceOwned.id,receivedOwned.id].includes(row.id));
   check(ownedApps.length===2&&ownedApps.every(row=>row.phase==='STOPPED'),
    'Both original saved Applications must finish Stop before the complete customer handover.');
   const receipts=[sourceReceipt,receivedPage.receipt,reopenedPage.receipt];
   const browserErrors=receipts.flatMap(row=>[...(row.pageErrors??[]),...(row.consoleErrors??[]),...(row.assetErrors??[])]);
   check(browserErrors.length===0,'The actual participant browser produced an error; retain the complete private QA record.');
   const compact={schema:SCHEMA,operationId,actor,sourceRoot,runtime:runtimeBinding(runtime),
    core:{operationId:core.operationId,result:{path:join(coreOutput,'result.json'),...await identity(join(coreOutput,'result.json'))}},
    source:{directory,originalPublisher:core.source,publisherRef:project.publisherRef,participant:id,revision:releaseRevision,
     baselineSource:project.baselineSource,candidateSource:project.candidateSource,activityIds:project.activityIds,
     feedback:project.feedback.length,historyRevisions:history.length,baselineRevision:core.baselineRevision,correctedRevision:core.correctedRevision},
    finance:project.finance,received:{directory:receivedDirectory,participant:id,revision:releaseRevision,historyRevisions:history.length,result:received},
    download:{fullPacket:packetFile,httpPacket,cliSource:cliPacket,cliReceived:cliReceivedPacket,browserPacket,
     interruption:progress.downloads.release.interrupted,fullPublisher:browserBaseline,candidatePublisher:browserCandidate},
    browser:{errors:browserErrors,views:receipts.flatMap(row=>row.views??[])},
    applications:ownedApps.map(row=>({id:row.id,label:row.label,phase:row.phase,revision:row.revision,totalRuns:row.totalRuns}))};
   result=await finishCustomerWorkflow(await completeBundle({inspection,summary:compact}));
  }

 }catch(error){
  failure=error;
  if(progress)await publish(join(outputDirectory,'error-'+Date.now()+'.json'),
   {schema:SCHEMA,operationId,error:errorValue(error),stages:Object.keys(progress.stages),at:new Date().toISOString()}).catch(()=>{});
 }finally{
  const cleanup=[];
  for(const context of contexts)try{await context.close();}catch(error){cleanup.push(errorValue(error));}
  for(const client of[sourceClient,receivedClient])if(client)try{await client.dispose();}catch(error){cleanup.push(errorValue(error));}
  for(const owned of [...mcpOwners])try{await owned.close();}catch(error){cleanup.push(errorValue(error));}
  if(appApi)for(const owned of Object.values(progress?.applications??{})){
   if(!owned.id)continue;
   let selectedOperation=activeApplications.get(owned.id)??owned.runs.at(-1)?.operationId;
   try{
    const state=await appApi('/api/applications/state?historyLimit=1');
    const current=state.applications.find(item=>item.id===owned.id)?.current;
    if(!current||!current.active&&!['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(current.phase))continue;
    selectedOperation=current.id;
    await appApi('/api/applications/stop',{applicationId:owned.id,operationId:selectedOperation});
    await until(()=>appApi('/api/applications/state?historyLimit=1'),value=>{
     const app=value.applications.find(item=>item.id===owned.id);
     return app&&!app.current?.active&&!['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(app.current?.phase);
    },'The original participant Application is still finishing its Stop.',{timeoutMs:90000});
   }catch(error){cleanup.push({applicationId:owned.id,operationId:selectedOperation,...errorValue(error)});}
  }
  if(browser)try{await browser.close();}catch(error){cleanup.push(errorValue(error));}
  if(appsServer)try{await appsServer.close();}catch(error){cleanup.push(errorValue(error));}
  if(appsModel)try{await appsModel.close();}catch(error){cleanup.push(errorValue(error));}
  if(cleanup.length){
   await publish(join(outputDirectory,'cleanup-'+Date.now()+'.json'),cleanup).catch(()=>{});
   failure??=Object.assign(new Error('The original participant receiving cleanup remains pending in its retained records.'),{code:'IATI_RECEIVING_CLEANUP'});
  }
  try{if(result&&!failure)await publish(join(outputDirectory,'result.json'),result,true);}
  finally{await lease.close();}
 }
 if(failure)throw failure;
 return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length===3&&['--help','-h','help'].includes(process.argv[2])){
   process.stdout.write('node publishing.mjs --input /absolute/operator-input.json --runtime-ready /absolute/original-runtime-ready.json\n');
  }else{
   const args=process.argv.slice(2),allowed=new Set(['--input','--runtime-ready']),selected={};
   check(args.length===4,'Pass the complete original operator configuration and actual runtime READY result.');
   for(let index=0;index<args.length;index+=2){
    check(allowed.has(args[index])&&!selected[args[index]]&&typeof args[index+1]==='string'&&
     isAbsolute(args[index+1])&&resolve(args[index+1])===args[index+1],'Pass each original input file once.');
    selected[args[index]]=args[index+1];
   }
   const configuration=await json(selected['--input']),runtime=await json(selected['--runtime-ready']);
   check(plain(configuration)&&Object.keys(configuration).every(key=>
    ['coreInputFile','outputDirectory','operationId','actor','pythonExecutable','chromiumExecutable','playwrightModule'].includes(key)),
    'Retain the complete caller-owned original operator configuration.');
   check(runtime?.state==='READY'&&typeof runtime.sourceRoot==='string'&&typeof runtime.runtimeDirectory==='string'&&
    /^[0-9a-f]{40}$/.test(runtime.sourceCommit),'Select the actual original complete runtime preparer result.');
   const {inspectMerchantRuntime}=await import(pathToFileURL(join(runtime.sourceRoot,ROOT+'sf46-release/runtime-package.mjs')).href);
   const observed=await inspectMerchantRuntime(runtime.runtimeDirectory,{load:false});
   check(observed.state==='READY'&&observed.sourceCommit===runtime.sourceCommit&&observed.sourceRoot===runtime.sourceRoot&&
    observed.dependencyCount===0&&(!runtime.sourceManifestSha256||observed.sourceManifestSha256===runtime.sourceManifestSha256),
    'The selected READY receipt must match the actual installed original source/profile before receiving.');
   const result=await runIatiPublishingReceiving({...configuration,sourceRoot:runtime.sourceRoot,runtimeDirectory:runtime.runtimeDirectory});
   process.stdout.write(JSON.stringify(result)+'\n');
  }
 }catch(error){
  process.stderr.write(JSON.stringify({schema:SCHEMA,state:'INTERRUPTED',error:errorValue(error)})+'\n');process.exitCode=1;
 }
}
