// MIT. Complete native DQA analyst workflow and portable receiving on the original IATI Application.
// The caller owns the admitted native operation and closes its core workspace first.
import { constants } from 'node:fs';
import { mkdir, open, readFile, lstat, realpath, rename, readdir } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { openInstalledIatiPage } from './browser.mjs';

const SCHEMA='stellar-forge.iati-dqa-operator-receiving.v1';
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
 ...['dqa.py','dqa_http.py','dqa_cli.py','DQA.md','receiving/dqa.mjs','receiving/browser.mjs','receiving/DQA.md','receiving/dqa-source/README.md','receiving/dqa-source/upstream.py','public/dqa.js','public/dqa.css','iati_source.py','iati_workspace.py','cli.py','cli.mjs','managed.py','server.py','client.mjs','client.d.mts',
  'public/index.html','public/app.js','public/style.css'].map(name=>SDK+'iati/'+name),
 ...['xml_source.py','workspace.py','server.py','native.mjs'].map(name=>SDK+'xml/'+name),
 SDK+'dataset-handler.mjs',
 ROOT+'distribution/contributions/iati.json',
 ROOT+'distribution/runtime-workspace/application-iati.mjs',
 ROOT+'distribution/runtime-workspace/providers/iati.mjs',
 ROOT+'distribution/runtime-workspace/model.mjs',
 ROOT+'distribution/runtime-workspace/server.mjs',
 ROOT+'distribution/runtime-workspace/applications.mjs',
 ROOT+'distribution/runtime-workspace/managed-workspace.mjs',
 ROOT+'distribution/runtime-workspace/application-provider.mjs',
 ROOT+'distribution/runtime-install.mjs',
 ROOT+'sf46-release/runtime-package.mjs',
 ROOT+'merchant-fleet-gateway/state-lease.mjs',
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
function validateDqaSelection(provider,assessments,portfolios){
 check(plain(provider)&&typeof provider.name==='string'&&provider.name.trim()&&provider.name.length<=160&&
  typeof provider.endpoint==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,159}$/.test(provider.authorizationEnv??''),
  'Select the existing native DQA provider and its authorization environment name.');
 check(Object.keys(provider).every(key=>['name','endpoint','authorizationEnv','timeoutSeconds','notes','previous'].includes(key)),
  'Use the original supported DQA provider fields.');
 check(provider.timeoutSeconds===undefined||Number.isSafeInteger(provider.timeoutSeconds)&&provider.timeoutSeconds>=1&&provider.timeoutSeconds<=900,
  'Use the native provider timeout from 1 to 900 seconds.');
 check(Array.isArray(assessments)&&assessments.length===2&&assessments.every(row=>plain(row)&&typeof row.label==='string'&&
  row.label.trim()&&row.label.length<=160&&plain(row.parameters)&&Object.keys(row).every(key=>['label','parameters','notes','sourceId'].includes(key))),
  'Supply two complete original native assessment selections.');
 for(const row of assessments){
  check(row.sourceId===undefined||typeof row.sourceId==='string'&&row.sourceId.length>0&&row.sourceId.length<=160,'Retain the selected provider request ID.');
  check(Object.keys(row.parameters).every(key=>['organisation','segmentation','require_funding_and_accountable','include_exemptions','optional_rules','skip_cache','failed_activities','use_budget_date_filter'].includes(key)),
   'Select only the complete original browser-supported native request fields.');
  if(row.parameters.segmentation)check(plain(row.parameters.segmentation)&&Object.keys(row.parameters.segmentation).every(key=>['countries','regions','sectors'].includes(key)),
   'Retain the original country, region and sector selections.');
  if(row.parameters.optional_rules)check(plain(row.parameters.optional_rules)&&Object.keys(row.parameters.optional_rules).every(key=>key==='check_acronyms'),
   'Retain the original optional rule selection.');
 }
 check(Array.isArray(portfolios)&&portfolios.length<=32&&portfolios.every(row=>plain(row)&&SHA.test(row.id??'')&&
  Number.isSafeInteger(row.revision)&&row.revision>0&&Object.keys(row).sort().join(',')==='id,revision'),
  'Keep each linked original IATI portfolio bound to its exact revision.');
}
function verifyCase(value,selected){
 check(plain(value)&&value.schema==='stellar-forge.iati-dqa-case.v1'&&value.id===selected.id&&value.revision===selected.revision&&
  value.definitionSha256===selected.definitionSha256&&same(value,selected),'The original DQA case revision changed.');
 return value;
}
function verifyAssessment(value,selected){
 check(plain(value)&&value.schema==='stellar-forge.iati-dqa-assessment.v1'&&value.id===selected.id&&same(value,selected),
  'The original complete DQA assessment changed.');
 return value;
}
const runtimeBinding=value=>Object.fromEntries(['installationId','profileId','profileSha256','lockSha256',
 'sourceCommit','sourceManifestSha256','directory','sourceRoot','dependencyCount'].map(key=>[key,value[key]]));
async function until(read,accept,message,{timeoutMs=240000}={}){
 const deadline=Date.now()+timeoutMs;let value;
 do{value=await read();if(await accept(value))return value;await pause(750);}while(Date.now()<deadline);
 throw Object.assign(new Error(message),{code:'IATI_RECEIVING_WAIT',last:value});
}

/**
 * sourceRoot is the complete selected repository source. runtimeDirectory is a
 * REAL READY original installation containing those exact production modules.
 * Existing source and native records are never copied into this procedure.
 */
export async function runIatiDqaReceiving({
 directory,outputDirectory,sourceRoot,runtimeDirectory,operationId,actor,provider,assessments,portfolios=[],upstreamReadyFile,
 pythonExecutable,chromiumExecutable,playwrightModule
}={}){
 process.umask(0o077);validateDqaSelection(provider,assessments,portfolios);
 check(typeof operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,139}$/.test(operationId),'Retain one original receiving operation ID.');
 check(plain(actor)&&typeof actor.id==='string'&&actor.id.length>0&&actor.id.length<=160&&
  typeof actor.label==='string'&&actor.label.trim()&&actor.label.length<=160,'Pass the actual named receiving operator.');
 for(const path of [directory,outputDirectory,sourceRoot,runtimeDirectory,pythonExecutable,chromiumExecutable,playwrightModule,upstreamReadyFile])
  check(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path,'Pass complete original runtime and private directory paths.');
 check((!await exists(directory)||await realpath(directory)===directory)&&await realpath(sourceRoot)===sourceRoot&&
  outputDirectory!==directory&&!outputDirectory.startsWith(directory+'/')&&!directory.startsWith(outputDirectory+'/'),
  'Keep the receiver beside the original closed source workspace.');
 await privateDirectory(outputDirectory);
 const original=path=>import(pathToFileURL(join(sourceRoot,path)).href);
 const {acquireStateLease}=await original(ROOT+'merchant-fleet-gateway/state-lease.mjs');
 const lease=await acquireStateLease(outputDirectory);
 let appsServer,appApi,browser,mcp,sourceClient,receivedClient,appsModel;
 const contexts=new Set(),activeApplications=new Map();
 let progress,selection,result,failure;
 const progressPath=join(outputDirectory,'progress.json');
 const save=async()=>{lease.assertHeld();progress.updatedAt=new Date().toISOString();await publish(progressPath,progress);};
 const stage=async(name,value)=>{progress.stages[name]=value;await save();};
 const endpointDocument=async(name,url)=>publish(join(outputDirectory,'connections',name+'.txt'),Buffer.from(url+'\n'));
 try{
  const {inspectMerchantRuntime}=await original(ROOT+'sf46-release/runtime-package.mjs');
  const runtime=await inspectMerchantRuntime(runtimeDirectory,{load:false});
  check(runtime.state==='READY'&&runtime.dependencyCount===0,'Use the original READY zero-dependency operator runtime for this complete receiving.');
  const installedRoot=await realpath(runtime.sourceRoot),installed=path=>import(pathToFileURL(join(installedRoot,path)).href);
  const source=[];
  for(const path of CRITICAL){
   const selected=await identity(join(sourceRoot,path)),actual=await identity(join(installedRoot,path));
   check(same(selected,actual),'The installed runtime does not contain the selected original '+path);
   source.push({path,...actual});
  }
  if(!await json(join(directory,'workspace.json'))){
   check(!await exists(join(outputDirectory,'selection.json')),'An originally selected workspace header is missing; preserve its original state.');
   const initializationFile=join(outputDirectory,'original-workspace-initialization.json');
   const initialization={directory,sourceCommit:runtime.sourceCommit,sourceRoot:installedRoot,operationId,pythonExecutable};
   const retained=await json(initializationFile);
   if(await exists(directory)){
    check(retained&&same(retained,initialization),'The selected existing directory has no original IATI workspace or owned initialization.');
    await privateDirectory(join(outputDirectory,'attempts'));
    await rename(directory,join(outputDirectory,'attempts','unpublished-source-'+randomUUID()));
   }
   await publish(initializationFile,initialization,true);
   await runCli('source-init',directory,['init']);
  }
  const marker=await identity(join(directory,'workspace.json')),info=await lstat(directory,{bigint:true});
  const header=await json(join(directory,'workspace.json'));
  check(header?.schema==='stellar-forge.iati-workspace.v1','The caller must close the original IATI workspace before operator receiving.');
  const upstream=await json(upstreamReadyFile);
  check(upstream?.schema==='commons.iati.dqa.upstream-ready.v1'&&upstream.state==='READY'&&
   upstream.engine_commit==='61a5e02420b936a39ebaf79dea7212fc0ce36683'&&
   provider.endpoint.replace(/\/$/,'')===upstream.api_base_url.replace(/\/$/,'')+'/dqa'&&
   provider.authorizationEnv===upstream.authorization_env&&Boolean(process.env[provider.authorizationEnv]),
   'Select the actual original DQA READY endpoint and its existing host authorization.');
  const evidenceArgv=upstream.source_evidence?.export_argv;
  check(Array.isArray(evidenceArgv)&&evidenceArgv.length===8&&evidenceArgv[1]==='-B'&&evidenceArgv[3]==='evidence'&&
   evidenceArgv[4]==='--ready'&&evidenceArgv[5]===upstreamReadyFile&&evidenceArgv[6]==='--output'&&
   evidenceArgv[7]==='ABS_OUTPUT_DIRECTORY','Use the original READY evidence command unchanged.');
  check(same(await identity(evidenceArgv[2]),await identity(join(sourceRoot,SDK+'iati/receiving/dqa-source/upstream.py'))),
   'The source evidence helper differs from its selected original source.');
  const upstreamIdentity=await identity(upstreamReadyFile);
  const originalUpstreamInputs=[];
  for(const [name,path] of [['ready.json',upstreamReadyFile],['provider-input.json',upstream.provider_input],
   ['assessment-requests.json',upstream.assessments_input]]){
   check(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path,'The actual upstream source input is missing.');
   const observed=await identity(path);check(observed.bytes<=8*1024*1024,'The original upstream input exceeds its metadata boundary.');
   originalUpstreamInputs.push({name,path,...observed});
  }
  const callback=await identity(fileURLToPath(import.meta.url)),browserSource=await identity(fileURLToPath(new URL('./browser.mjs',import.meta.url)));
  check(same(callback,await identity(join(installedRoot,SDK+'iati/receiving/dqa.mjs')))&&same(browserSource,await identity(join(installedRoot,SDK+'iati/receiving/browser.mjs'))),
   'The executing complete receiver differs from its selected installed source.');
  selection={schema:SCHEMA,operationId,actor,directory,outputDirectory,sourceRoot,runtime:runtimeBinding(runtime),
   provider,assessments,portfolios,upstream:{readyFile:upstreamReadyFile,identity:upstreamIdentity,evidenceArgv,inputs:originalUpstreamInputs},workspace:{marker,device:String(info.dev),inode:String(info.ino)},
   source,callback,browserSource,execution:{node:process.execPath,nodeVersion:process.versions.node,
    pythonExecutable,chromiumExecutable,playwrightModule}};
  await publish(join(outputDirectory,'selection.json'),selection,true);
  progress=await json(progressPath)??{schema:SCHEMA,operationId,createdAt:new Date().toISOString(),stages:{},applications:{},downloads:{},requests:{}};
  for(const name of ['connections','mcp','downloads','cli','views','temporary','attempts','actions','findings','source-evidence','packet','processes','upstream-inputs'])await privateDirectory(join(outputDirectory,name));
  for(const selected of originalUpstreamInputs){const data=await readFile(selected.path);check(data.length===selected.bytes&&hash(data)===selected.sha256,'An original upstream input changed.');
   await publish(join(outputDirectory,'upstream-inputs',selected.name),data,true);}
  const prior=await json(join(outputDirectory,'result.json'));
  if(prior){
   check(prior.state==='COMPLETE'&&same(prior.selectionSha256,hash(encode(selection))),'The completed receiver has a different original selection.');
   for(const file of prior.files)check((await identity(file.path)).sha256===file.sha256,'An original completed returned file changed.');
   return{...prior,reused:true};
  }
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
   const response=await fetch(appsUrl.origin+path,{method:value===undefined?'GET':'POST',redirect:'error',
    signal:AbortSignal.timeout(240000),headers:{'x-runtime-workspace-token':appsToken,
     ...(value===undefined?{}:{origin:appsUrl.origin,'content-type':'application/json'})},
    ...(value===undefined?{}:{body:JSON.stringify(value)})});
   return boundedJson(response);
  };
  const unauthenticated=await fetch(appsUrl.origin+'/api/applications/state');
  check(unauthenticated.status===401,'Applications must retain its original authenticated operating boundary.');await unauthenticated.body?.cancel();
  const attached=await appApi('/api/attach',{directory:runtimeDirectory,label:'Selected IATI source runtime'});
  check(attached.status==='READY','The actual original Applications runtime is not READY.');
  await stage('installedRuntime',{...runtimeBinding(runtime),runtimeId:attached.runtimeId,sourceFiles:source.length,applicationsDirectory});
  const {connectIatiWorkspace}=await installed(SDK+'iati/client.mjs');
  const playwrightLoaded=await import(pathToFileURL(await realpath(playwrightModule)).href);
  const playwright=playwrightLoaded.chromium?playwrightLoaded:playwrightLoaded.default;
  check(playwright?.chromium&&typeof playwright.chromium.launch==='function','Use the existing actual Playwright installation.');
  browser=await playwright.chromium.launch({executablePath:chromiumExecutable,headless:true,
   downloadsPath:join(outputDirectory,'temporary'),args:['--disable-dev-shm-usage']});
  const appState=async id=>(await appApi('/api/applications/state?historyLimit=30')).applications.find(item=>item.id===id);
  async function setupApplication(name,workspace){
   let owned=progress.applications[name];
   if(!owned){
    owned={name,workspace,label:actor.label.slice(0,80)+' · '+(name==='source'?'Original DQA customer work':'Received DQA customer work'),
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
    source:{format:'iati',label:actor.label.slice(0,120)+' / original DQA work',consoleUrlFile:join(outputDirectory,'connections','source.txt')},
    received:{format:'iati',label:actor.label.slice(0,120)+' / received DQA work',consoleUrlFile:join(outputDirectory,'connections','received.txt')}
   }},true);
   const sourceWorkspaces=await readSourceWorkspaceConfiguration(configFile);
   const adapter=new MerchantSourceWorkspaces({sourceWorkspaces,exportsDirectory:join(outputDirectory,'mcp')});
   const token=randomBytes(32).toString('hex'),requests=new Set(),sockets=new Set();
   let closing=false;
   const handler=createMcpToolHandler({tools,call:(name,args)=>adapter.call(name,args)},{
    bearerToken:token,serverName:'Original IATI source receiving',serverVersion:'1.0.0',
    instructions:'Operate the declared original IATI DQA consoles with their selected provider, assessments and retained named analyst work.'
   });
   const server=createServer((request,response)=>{
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
   check(['merchant_source_iati_dqa_capture','merchant_source_iati_dqa_save_case','merchant_source_iati_dqa_export','merchant_source_file_read'].every(name=>catalog.some(tool=>tool.name===name)),
    'The actual original MCP catalog omitted the IATI operating tools.');
   const missing=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
   check(missing.status===401,'The actual source MCP endpoint must require the original bearer token.');await missing.body?.cancel();
   return{adapter,endpoint,call:async(name,args={})=>(await rpc('tools/call',{name,arguments:args})).structuredContent,
    async close(){
     if(closing)return;closing=true;
     const closed=new Promise(resolve=>server.close(resolve));server.closeIdleConnections();
     await Promise.allSettled([...requests]);await adapter.close();
     for(const socket of sockets)socket.destroy();await closed;
    }};
  }
  async function retainedDqaExport(key,kind,selection){
   if(progress.downloads[key]?.metadata)return progress.downloads[key].metadata;
   const name=kind==='dqa'?'merchant_source_iati_dqa_export':'merchant_source_iati_dqa_file';
   const value=await mcp.call(name,{workspace:'source',...selection});
   check(value.sha256===value.exportId&&value.kind===kind&&value.format==='iati',
    'The original DQA export lost its selected complete file identity.');
   progress.downloads[key]={metadata:value,selection,offset:0};await save();return value;
  }
  async function downloadMcp(kind,metadata,{interrupt=false}={}){
   const path=join(outputDirectory,'downloads','mcp-'+kind+(metadata.kind==='dqa-file'?'.json':'.zip')),partial=path+'.partial';
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
  async function sourceEvidence(index){
   const folder=join(outputDirectory,'source-evidence','capture-'+(index+1));
   await privateDirectory(folder);
   const argv=[...evidenceArgv.slice(0,-1),folder];
   if(index)argv.push('--after-evidence',join(outputDirectory,'source-evidence','capture-1','manifest.json'));
   const returned=await runProcess('source-evidence-'+(index+1),argv,{acceptedExitCodes:[0,2]});
   const path=join(folder,'manifest.json'),manifest=await json(path);
   check(returned.manifest===path&&manifest?.schema==='commons.iati.dqa.source-evidence.v1'&&
    manifest.ready_sha256===upstreamIdentity.sha256&&manifest.engine_commit===upstream.engine_commit&&
    manifest.operation_id===upstream.operation_id,'The original provider source window changed.');
   const files=[];
   for(const item of manifest.files){
    check(plain(item)&&typeof item.path==='string'&&!isAbsolute(item.path)&&
     !item.path.split('/').some(p=>!p||p==='.'||p==='..')&&SHA.test(item.sha256)&&
     Number.isSafeInteger(item.bytes)&&item.bytes>=0,'An original source-evidence member has an invalid identity.');
    const selected=join(folder,item.path),actual=await identity(selected);
    check(actual.bytes===item.bytes&&actual.sha256===item.sha256,'A complete original source-evidence file changed.');
    files.push({path:selected,...actual,relative:item.path});
   }
   const evidence={directory:folder,manifest:{path,...await identity(path)},status:manifest.status,
    operationId:manifest.operation_id,exchangeIds:manifest.exchange_ids,observations:manifest.observations,
    successfulSearches:manifest.successful_searches,failures:manifest.failures,files};
   await stage('sourceEvidence'+(index+1),evidence);
   check(manifest.status==='COMPLETE'&&returned.status==='COMPLETE'&&manifest.failures.length===0&&
    manifest.successful_searches>=2&&manifest.observations.every(row=>row.source_complete===true),
    'The actual provider source window contains incomplete or missing native searches; its complete evidence is retained.');
   const queries=manifest.observations.filter(row=>row.route==='unchanged-native-search')
    .flatMap(row=>row.request_fields?.q??[]);
   check(queries.some(q=>/hierarchy\s*:\s*1\b/.test(q))&&queries.some(q=>/hierarchy\s*:\s*2\b/.test(q)),
    'The actual capture must retain both original H1 and H2 searches.');
   return evidence;
  }
  const uiParameters=raw=>({
   organisation:Array.isArray(raw.organisation)&&raw.organisation.length===1?raw.organisation[0]:raw.organisation,
   segmentation:{countries:raw.segmentation?.countries??[],regions:raw.segmentation?.regions??[],sectors:raw.segmentation?.sectors??[]},
   require_funding_and_accountable:raw.require_funding_and_accountable??false,
   include_exemptions:raw.include_exemptions??true,optional_rules:{check_acronyms:raw.optional_rules?.check_acronyms??false},
   skip_cache:raw.skip_cache??false,failed_activities:raw.failed_activities??true,use_budget_date_filter:raw.use_budget_date_filter??false
  });
  async function idle(page){
   await page.waitForFunction(()=>document.querySelector('#main')?.getAttribute('aria-busy')==='false',{},{timeout:1000000});
   const status=await page.locator('#status').textContent();
   check(!await page.locator('#status').evaluate(el=>el.classList.contains('error')),status);
   return status;
  }
  async function dqaOpen(page){
   await page.locator('#dqa-open').click();await idle(page);
   await page.locator('#dqa-panel').waitFor({state:'visible'});
  }
  async function section(page,name){await page.locator('[data-dqa-view="'+name+'"]').click();
   await page.locator('[data-dqa-section="'+name+'"]').waitFor({state:'visible'});}
  async function openCasePage(page,id){
   await section(page,'case');
   const row=page.locator('#dqa-cases .dqa-entry').filter({has:page.locator('code').filter({hasText:id})});
   check(await row.count()===1,'The browser case list must identify the original saved case.');
   await row.getByRole('button',{name:'Open',exact:true}).click();await idle(page);
   check((await page.locator('#dqa-case-edition').textContent()).includes(id),'The browser opened another saved case.');
  }
  async function openAssessmentPage(page,id){
   await section(page,'assess');
   const row=page.locator('#dqa-assessments .dqa-entry').filter({has:page.locator('code').filter({hasText:id})});
   check(await row.count()===1,'The browser assessment list must identify the complete native edition.');
   await row.getByRole('button',{name:'Open',exact:true}).click();await idle(page);
   check((await page.locator('#dqa-assessment-detail').textContent()).includes(id),'The browser opened another native assessment.');
  }
  async function recordBrowserAction(page,name,route,submit,verifyInput,replay){
   const requestPath=join(outputDirectory,'actions',name+'-request.json'),responsePath=join(outputDirectory,'actions',name+'-response.json');
   const originalRequest=await json(requestPath),originalResponse=await json(responsePath);
   if(originalRequest){
    check(plain(originalRequest)&&originalRequest.route===route&&plain(originalRequest.input)&&
     Object.keys(originalRequest).sort().join(',')==='input,route','The retained browser request belongs to another action.');
    verifyInput(originalRequest.input);
    const retained=progress.requests[name];
    if(retained)check(retained.route===route&&same(retained.input,originalRequest.input),'The retained progress disagrees with its original published request.');
    else progress.requests[name]={...originalRequest};
    if(originalResponse!==null){
     if(progress.requests[name].result)check(same(progress.requests[name].result,originalResponse),'The saved browser response changed.');
     progress.requests[name].result=originalResponse;
    }
    await save();
   }else{
    check(originalResponse===null,'A retained native response has no original request selection.');
    if(progress.requests[name]){
     const retained=progress.requests[name];check(retained.route===route,'The saved action route changed.');verifyInput(retained.input);
     await publish(requestPath,{route:retained.route,input:retained.input},true);
     if(retained.result)await publish(responsePath,retained.result,true);
    }
   }
   if(progress.requests[name]){
    const retained=progress.requests[name];verifyInput(retained.input);
    const value=await replay(retained.input);
    if(retained.result)check(same(value,retained.result),'The retained original request replay changed its result.');
    await publish(responsePath,value,true);
    retained.result=value;await save();return value;
   }
   let dispatched,routeError;
   const handler=async routeHandle=>{
    if(routeHandle.request().method()!=='POST')return routeHandle.continue();
    try{
     const input=routeHandle.request().postDataJSON();verifyInput(input);
     check(!dispatched,'The browser submitted the same receiving action twice.');
     dispatched={route,input};progress.requests[name]=dispatched;
     await publish(join(outputDirectory,'actions',name+'-request.json'),dispatched,true);await save();
     await routeHandle.continue();
    }catch(error){routeError=error;await routeHandle.abort('failed');}
   };
   await page.route('**/api/iati/dqa/'+route,handler);
   try{
    const waiting=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/iati/dqa/'+route&&
     response.request().method()==='POST',{timeout:1000000});
    waiting.catch(()=>{});
    await submit();
    let response;
    try{response=await waiting;}catch(error){throw routeError??error;}
    if(routeError)throw routeError;
    const value=await response.json();
    check(response.ok(),'The original DQA browser action failed: '+JSON.stringify(value));
    check(dispatched,'The browser action has no retained original request.');
    await publish(join(outputDirectory,'actions',name+'-response.json'),value,true);
    dispatched.result=value;await save();await idle(page);return value;
   }finally{await page.unroute('**/api/iati/dqa/'+route,handler);}
  }
  async function allFindings(client,assessment){
   const directory=join(outputDirectory,'findings',assessment.id);await privateDirectory(directory);
   let offset=0,total=null,first=null,count=0,aggregate=createHash('sha256');const pages=[];
   do{
    const page=await client.dqaFindings(assessment.id,{offset,limit:250});
    check(page.assessment===assessment.id&&page.offset===offset&&page.limit===250&&Array.isArray(page.items)&&
     (total===null||total===page.total),'The original complete finding pages changed their selected assessment.');
    total=page.total;first??=page.items[0]??null;count+=page.items.length;
    const data=encode(page),path=join(directory,String(offset)+'.json');await publish(path,data,true);
    aggregate.update(data);pages.push({path,...await identity(path)});
    if(page.nextOffset===null)break;
    check(page.nextOffset>offset&&page.nextOffset===offset+page.items.length,'The original finding cursor did not advance.');
    offset=page.nextOffset;
   }while(true);
   check(count===total&&total===assessment.listedRuleResults,'The full returned finding set is incomplete.');
   return{assessment:assessment.id,total,count,sha256:aggregate.digest('hex'),first,pages};
  }
  async function comparePages(client,id){
   let offset=0,total=null,count=0,original,aggregate=createHash('sha256');const pages=[];
   const directory=join(outputDirectory,'findings','comparison-'+id);await privateDirectory(directory);
   do{
    const response=await client.dqaComparison(id,{offset,limit:250}),{page,...record}=response;
    check(record.id===id&&page.offset===offset&&page.limit===250&&(total===null||total===page.total),
     'The original comparison page changed its identity.');
    if(original)check(same(record,original),'The original comparison record changed across pages.');else original=record;
    total=page.total;count+=page.items.length;
    const path=join(directory,String(offset)+'.json'),data=encode(response);await publish(path,data,true);aggregate.update(data);
    pages.push({path,...await identity(path)});
    if(page.nextOffset===null)break;
    check(page.nextOffset===offset+page.items.length&&page.nextOffset>offset,'The comparison cursor did not advance.');offset=page.nextOffset;
   }while(true);
   check(count===total&&count===original.counts['newly-listed']+original.counts['no-longer-listed']+original.counts.changed,
    'The complete activity comparison is missing changes.');
   return{record:original,total,count,sha256:aggregate.digest('hex'),pages};
  }
  async function viewReceipt(page,receipt,name,width){
   await page.setViewportSize({width,height:940});await idle(page);
   const path=join(outputDirectory,'views',name+'-'+width+'.png');
   await page.screenshot({path,fullPage:true});
   const measured=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,
    bodyWidth:document.body.scrollWidth,heading:document.querySelector('#dqa-panel h1')?.textContent,
    section:document.querySelector('[data-dqa-section]:not([hidden])')?.dataset.dqaSection}));
   check(measured.documentWidth<=width+1&&measured.bodyWidth<=width+1,'The complete DQA view overflows the selected viewport.');
   const file={path,...await identity(path),...measured};receipt.views.push(file);return file;
  }
  async function downloadBrowser(page,id,name){
   const selected=page.waitForEvent('download',{timeout:1000000});await page.locator('#'+id).click();
   const download=await selected,path=join(outputDirectory,'downloads',name);
   if(await exists(path))await rename(path,path+'.previous-'+randomUUID());
   await download.saveAs(path);check(!await download.failure(),'The complete original browser download failed.');
   const descriptor={path,...await identity(path)};await idle(page);return descriptor;
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
 packet=Path(configuration["packet"]);need(identity(packet)==configuration["identity"],"Selected full DQA ZIP changed")
 with zipfile.ZipFile(packet) as z:
  rows=describe(z);need("manifest.json" in rows,"The full native manifest is missing")
  manifest=json.loads(z.read("manifest.json"));need(manifest.get("schema")=="stellar-forge.iati-dqa-customer.v1","Select the original DQA customer packet")
  spec=manifest["files"]
  need(isinstance(spec,dict),"The original native file map is missing")
 extract=Path(configuration["directory"]);extract.mkdir(parents=True,exist_ok=True,mode=0o700)
 publish(extract/"selection.json",canonical(configuration))
 members=verify(packet,spec,extract)
 with zipfile.ZipFile(packet) as z:publish(extract/"manifest.json",z.read("manifest.json"))
 result={"schema":"stellar-forge.iati-dqa-packet-inspection.v1","packet":str(packet),**identity(packet),"directory":str(extract),"members":members,
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
 selection_manifest={"schema":"stellar-forge.iati-dqa-complete-handover.v1","operationId":configuration["operationId"],
  "createdAt":configuration["createdAt"],"case":configuration["case"],"assessments":configuration["assessments"],
  "comparison":configuration["comparison"],"files":spec}
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
   check(inspected.sha256===packet.sha256&&inspected.bytes===packet.bytes,'The full extracted packet changed its identity.');
   for(const file of inspected.members)check(same({bytes:file.bytes,sha256:file.sha256},
    (({bytes,sha256})=>({bytes,sha256}))(await identity(file.path))),'A complete extracted native member changed.');
   return inspected;
  }
  async function completeBundle({nativePacket,inspection,reviewed,selectedAssessments,comparison,summary}){
   const originalInput=join(outputDirectory,'packet','complete-bundle-input.json'),old=await json(originalInput);
   if(old){
    check(old.operationId===operationId&&old.case.id===reviewed.id&&old.case.revision===reviewed.revision&&old.case.definitionSha256===reviewed.definitionSha256&&
     same(old.assessments.map(row=>row.id),selectedAssessments.map(row=>row.id))&&old.comparison.id===comparison.id,
     'The retained full customer bundle belongs to another original selection.');
    const saved=await runProcess('complete-customer-bundle',[pythonExecutable,'-B',packetToolFile,originalInput]);
    const actual=await identity(saved.path);check(actual.bytes===saved.bytes&&actual.sha256===saved.sha256,'The retained complete customer ZIP changed.');
    return saved;
   }
   const files=[],names=new Set();
   const add=async(name,path)=>{check(!names.has(name),'A customer handover member was selected twice.');names.add(name);
    const item=await identity(path);files.push({name,path,bytes:item.bytes,sha256:item.sha256});};
   await add('customer/dqa-case.zip',nativePacket.path);
   await add('customer/native-manifest.json',inspection.manifest.path);
   for(const member of inspection.members)await add('customer/expanded/'+member.name,member.path);
   for(let index=0;index<2;index++){
    const evidence=progress.stages['sourceEvidence'+(index+1)];
    await add('source-evidence/capture-'+(index+1)+'/manifest.json',evidence.manifest.path);
    for(const file of evidence.files)await add('source-evidence/capture-'+(index+1)+'/'+file.relative,file.path);
   }
   for(const item of originalUpstreamInputs)await add('source-evidence/original-inputs/'+item.name,join(outputDirectory,'upstream-inputs',item.name));
   const summaryFile=join(outputDirectory,'packet','receiving-summary.json');await publish(summaryFile,summary,true);
   await add('receiving/summary.json',summaryFile);
   await add('receiving/selected-source.json',join(outputDirectory,'selection.json'));
   for(const name of (await readdir(join(outputDirectory,'actions'))).sort())
    if(name.endsWith('.json'))await add('receiving/actions/'+name,join(outputDirectory,'actions',name));
   for(const [name,request] of Object.entries(progress.requests)){
    check(request.input&&request.result,'A selected native action has no completed original result.');
   }
   for(const folder of (await readdir(join(outputDirectory,'cli'))).sort()){
    const base=join(outputDirectory,'cli',folder),receipt=await json(join(base,'result.json'));
    if(receipt){await add('receiving/cli/'+folder+'/request.json',join(base,'request.json'));
     await add('receiving/cli/'+folder+'/stdout.json',receipt.stdout);}
   }
   for(const name of ['DQA.md','receiving/DQA.md','receiving/dqa-source/README.md',
    'receiving/dqa-source/SETUP.md','receiving/dqa-source/complete.example.json'])
    await add('guides/'+name,join(installedRoot,SDK+'iati',name));
   const selected={mode:'bundle',output:join(outputDirectory,'DQA_Complete_Customer_Receiving.zip'),
    operationId,createdAt:progress.createdAt,case:{id:reviewed.id,revision:reviewed.revision,definitionSha256:reviewed.definitionSha256},
    assessments:selectedAssessments.map(row=>({id:row.id,requestId:row.requestId,response:row.response.body})),
    comparison:{id:comparison.id,before:comparison.before,after:comparison.after},files};
   const input=join(outputDirectory,'packet','complete-bundle-input.json');await publish(input,selected,true);
   const bundled=await runProcess('complete-customer-bundle',[pythonExecutable,'-B',packetToolFile,input]);
   check((await identity(bundled.path)).sha256===bundled.sha256,'The final complete customer ZIP changed.');
   return bundled;
  }

  // Continue only this callback's original saved Applications. No provider or
  // scheduler is created here; upstreamReadyFile names the caller-owned service.
  for(const owned of Object.values(progress.applications)){
   if(!owned.id)continue;
   const current=await appState(owned.id);
   if(current?.current&&(current.current.active||['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(current.current.phase)))
    await stopApplication(owned);
  }
  const completedCandidate=await json(join(outputDirectory,'completed-workflow.json'));
  if(completedCandidate){
   check(completedCandidate.state==='COMPLETE'&&completedCandidate.selectionSha256===hash(encode(selection)),
    'The retained completed workflow has another original selection.');
   for(const item of completedCandidate.files){const actual=await identity(item.path);check(actual.bytes===item.bytes&&actual.sha256===item.sha256,
    'A complete original customer file changed before final cleanup.');}
   result=completedCandidate;
  }else{
  const sourceOwned=await setupApplication('source',directory),sourceOpened=await startApplication(sourceOwned);
  sourceClient=sourceOpened.client;
  const sourceState=await sourceClient.state();
  await stage('openedSource',{workspace:sourceState.workspace??header.id??header.workspace??directory,
   applicationId:sourceOwned.id,sourceIdentity:selection.workspace});
  const sourcePage=await openInstalledIatiPage({browser,applicationsUrl:appsServer.url,applicationLabel:sourceOwned.label,
   consoleUrl:sourceOpened.url,outputDirectory:join(outputDirectory,'views'),name:'source-dqa'});
  contexts.add(sourcePage.context);
  const page=sourcePage.page,sourceReceipt=sourcePage.receipt;
  const refreshPage=async()=>{await page.goto(sourceOpened.url);await idle(page);await dqaOpen(page);};
  await dqaOpen(page);
  const withRequest=(value,expected)=>{
   check(plain(value)&&typeof value.requestId==='string'&&value.requestId.length>0&&value.requestId.length<=160,
    'Retain the original browser-generated request ID.');
   const {requestId,...body}=value;check(same(body,expected),'The browser changed its complete selected native request.');
  };
  const expectedProvider={name:provider.name,endpoint:provider.endpoint,authorizationEnv:provider.authorizationEnv,
   timeoutSeconds:provider.timeoutSeconds??900,notes:provider.notes??'',...(provider.previous?{previous:provider.previous}:{})};
  const selectedProvider=await recordBrowserAction(page,'provider','provider',async()=>{
   await section(page,'provider');
   for(const [name,value] of Object.entries({name:expectedProvider.name,endpoint:expectedProvider.endpoint,
    env:expectedProvider.authorizationEnv,timeout:String(expectedProvider.timeoutSeconds),notes:expectedProvider.notes}))
    await page.locator('#dqa-provider-'+name).fill(value);
   await page.locator('#dqa-provider-previous').selectOption(expectedProvider.previous??'');
   await page.locator('#dqa-provider-form button[type="submit"]').click();
  },value=>withRequest(value,expectedProvider),value=>sourceClient.dqaSaveProvider(value));
  check(selectedProvider.schema==='stellar-forge.iati-dqa-provider.v1'&&SHA.test(selectedProvider.id)&&
   selectedProvider.authorizationEnv===provider.authorizationEnv&&selectedProvider.endpoint===provider.endpoint,
   'The saved native provider differs from the selected original deployment.');
  await stage('provider',selectedProvider);
  await refreshPage();
  const selectedAssessments=[],findingSets=[],nativeFiles=[];
  const originalFile=(assessment,kind)=>kind==='response'?assessment.response.body:kind==='request'?assessment.request:
   kind==='configuration-before'?assessment.configurationBefore.file:assessment.configurationAfter.file;
  for(let index=0;index<assessments.length;index++){
   const selected=assessments[index],parameters=uiParameters(selected.parameters),name='capture-'+(index+1);
   const expectedInput={provider:selectedProvider.id,parameters,label:selected.label,operator:actor.label,notes:selected.notes??''};
   const assessed=await recordBrowserAction(page,name,'capture',async()=>{
    await section(page,'assess');
    await page.locator('#dqa-capture-form details').evaluateAll(nodes=>nodes.forEach(node=>node.open=true));
    await page.locator('#dqa-capture-provider').selectOption(selectedProvider.id);
    await page.locator('#dqa-capture-label').fill(selected.label);
    await page.locator('#dqa-operator').fill(actor.label);
    await page.locator('#dqa-organisation').fill(Array.isArray(parameters.organisation)?parameters.organisation.join('\n'):parameters.organisation);
    for(const key of ['countries','regions','sectors'])await page.locator('#dqa-'+key).fill(parameters.segmentation[key].join('\n'));
    for(const [id,value] of Object.entries({'require-funding':parameters.require_funding_and_accountable,
     'include-exemptions':parameters.include_exemptions,'check-acronyms':parameters.optional_rules.check_acronyms,
     'budget-filter':parameters.use_budget_date_filter,'skip-cache':parameters.skip_cache,'failed-activities':parameters.failed_activities}))
     await page.locator('#dqa-'+id).setChecked(value);
    await page.locator('#dqa-capture-notes').fill(expectedInput.notes);
    await page.locator('#dqa-capture-form button[type="submit"]').click();
   },value=>withRequest(value,expectedInput),value=>sourceClient.dqaCapture(value));
   check(assessed.schema==='stellar-forge.iati-dqa-assessment.v1'&&SHA.test(assessed.id)&&
    assessed.provider===selectedProvider.id&&same(assessed.parameters,parameters)&&
    assessed.requestId===progress.requests[name].input.requestId&&typeof assessed.summary.total_budget==='string',
    'The complete native assessment lost its exact request or financial text.');
   verifyAssessment(await sourceClient.dqaAssessment(assessed.id),assessed);
   verifyAssessment(await sourceClient.dqaCapture(progress.requests[name].input),assessed);
   selectedAssessments.push(assessed);
   await stage('assessment'+(index+1),assessed);
   // The original service swallows Solr errors. The source window is therefore
   // part of accepting this assessment, even if its response JSON is HTTP 200.
   await sourceEvidence(index);
   const files=[];
   for(const kind of ['request','response','configuration-before','configuration-after']){
    const key='nativeFile'+(index+1)+'-'+kind;
    let file=progress.stages[key];
    if(file)check((await identity(file.path)).sha256===originalFile(assessed,kind).sha256,'A retained original native file changed.');
    else{
     file=await saveResponse('capture-'+(index+1)+'-'+kind+'.json',await sourceClient.dqaFile(assessed.id,kind));
     const expected=originalFile(assessed,kind);
     check(file.sha256===expected.sha256&&file.bytes===expected.bytes,'The complete original native file is not the selected assessment file.');
     await stage(key,file);
    }
    files.push({kind,...file});
   }
   nativeFiles.push({assessment:assessed.id,files});
   const findings=await allFindings(sourceClient,assessed);findingSets.push(findings);
   await stage('findings'+(index+1),findings);
   await refreshPage();await openAssessmentPage(page,assessed.id);
   await viewReceipt(page,sourceReceipt,'source-assessment-'+(index+1),1360);
   if(index===0)await viewReceipt(page,sourceReceipt,'source-assessment-'+(index+1),390);
  }
  check(selectedAssessments[0].id!==selectedAssessments[1].id,'The two original captures must remain separate retained assessment editions.');
  await page.setViewportSize({width:1360,height:940});
  await section(page,'case');
  const caseName=('Native DQA customer review · '+operationId).slice(0,160);
  const caseDefinition={name:caseName,client:'Public aid programme quality review',
   notes:'Two complete original DQA captures, native source exchanges, analyst actions and exact receiving history.',
   assessmentIds:selectedAssessments.map(row=>row.id).sort(),portfolios:[...portfolios].sort((a,b)=>a.id.localeCompare(b.id)||a.revision-b.revision),
   review:{status:'draft',reviewer:actor.label,note:'Original source and native assessment review is in progress.'},reviewEdits:[]};
  const sameCaseInput=(value,expected)=>{
   check(plain(value)&&typeof value.requestId==='string'&&value.requestId.length>0,'Retain the original case request.');
   const {requestId,...body}=value;
   body.assessmentIds=[...body.assessmentIds].sort();
   body.portfolios=[...(body.portfolios??[])].sort((a,b)=>a.id.localeCompare(b.id)||a.revision-b.revision);
   check(same(body,expected),'The actual browser case selection or revision changed.');
  };
  const created=await recordBrowserAction(page,'case-create','case',async()=>{
   await page.locator('#dqa-new-case').click();
   for(const [name,value] of Object.entries({name:caseDefinition.name,client:caseDefinition.client,notes:caseDefinition.notes,
    reviewer:actor.label,note:caseDefinition.review.note}))await page.locator('#dqa-case-'+name).fill(value);
   await page.locator('#dqa-case-status').selectOption('draft');
   for(const selected of await page.locator('#dqa-case-assessments input:checked').all())await selected.uncheck();
   for(const id of caseDefinition.assessmentIds)await page.locator('#dqa-case-assessments input[value="'+id+'"]').check();
   for(const selected of await page.locator('#dqa-case-portfolios input:checked').all())await selected.uncheck();
   for(const row of caseDefinition.portfolios)await page.locator('#dqa-case-portfolios input[value="'+row.id+':'+row.revision+'"]').check();
   await page.locator('#dqa-case-form button[type="submit"]').click();
  },value=>sameCaseInput(value,caseDefinition),value=>sourceClient.dqaSaveCase(value));
  check(created.schema==='stellar-forge.iati-dqa-case.v1'&&created.revision===1&&created.review.status==='draft',
   'The original customer case was not created as its first retained revision.');
  await stage('createdCase',created);
  await refreshPage();await openCasePage(page,created.id);
  let actionCase=created;
  const findingIndex=findingSets.findIndex(value=>value.first!==null);
  let selectedFinding=null;
  if(findingIndex>=0){
   selectedFinding={assessment:selectedAssessments[findingIndex].id,...findingSets[findingIndex].first};
   await openAssessmentPage(page,selectedFinding.assessment);
   await page.locator('#dqa-findings button').filter({hasText:'Open finding'}).first().click();
   check((await page.locator('#dqa-review-selection').textContent()).includes(selectedFinding.rule),
    'The browser selected a different original finding.');
   await section(page,'case');
   const edit={assessment:selectedFinding.assessment,finding:selectedFinding.key,status:'investigate',owner:actor.label,dueDate:'',
    note:'Review the complete native result and source exchange before deciding this finding.'};
   const expectedAction={...caseDefinition,id:created.id,expectedRevision:created.revision,reviewEdits:[edit]};
   actionCase=await recordBrowserAction(page,'case-action','case',async()=>{
    await page.locator('#dqa-review-status').selectOption(edit.status);
    await page.locator('#dqa-review-owner').fill(edit.owner);await page.locator('#dqa-review-due').fill('');
    await page.locator('#dqa-review-note').fill(edit.note);
    await page.locator('#dqa-review-form button[type="submit"]').click();
   },value=>sameCaseInput(value,expectedAction),value=>sourceClient.dqaSaveCase(value));
   check(actionCase.revision===created.revision+1&&actionCase.actions.some(value=>same(value,edit)),
    'The named original finding action was not retained in the next case revision.');
   await stage('savedAction',{case:actionCase,finding:selectedFinding});
   await refreshPage();await openCasePage(page,actionCase.id);
  }else await stage('savedAction',{case:created,finding:null,reason:'The original native assessments returned no listed rule findings.'});
  const review={status:'reviewed',reviewer:actor.label,
   note:'Complete source requests, native responses, configuration observations and all listed findings have been reviewed; named actions remain explicit.'};
  const reviewed=await recordBrowserAction(page,'case-review','case',async()=>{
   await page.locator('#dqa-case-status').selectOption(review.status);
   await page.locator('#dqa-case-reviewer').fill(review.reviewer);await page.locator('#dqa-case-note').fill(review.note);
   await page.locator('#dqa-case-form button[type="submit"]').click();
  },value=>sameCaseInput(value,{...caseDefinition,id:actionCase.id,expectedRevision:actionCase.revision,review,reviewEdits:[]}),
  value=>sourceClient.dqaSaveCase(value));
  check(reviewed.revision===actionCase.revision+1&&same(reviewed.review,review)&&same(reviewed.actions,actionCase.actions),
   'The final named case review lost its original action history.');
  verifyCase(await sourceClient.dqaCase(reviewed.id),reviewed);
  verifyCase(await sourceClient.dqaSaveCase(progress.requests['case-create'].input),created);
  const history=(await sourceClient.dqaHistory(reviewed.id)).history;
  check(history.length===reviewed.revision&&history.every((row,index)=>row.revision===index+1)&&same(history[0],created)&&same(history.at(-1),reviewed),
   'The complete customer case revision history changed.');
  await stage('reviewedCase',{case:reviewed,history,originalReplay:created});
  await refreshPage();await openCasePage(page,reviewed.id);
  await viewReceipt(page,sourceReceipt,'source-reviewed-case',1360);
  await viewReceipt(page,sourceReceipt,'source-reviewed-case',390);
  await page.setViewportSize({width:1360,height:940});
  const [before,after]=selectedAssessments.map(row=>row.id);
  const compared=await recordBrowserAction(page,'compare','compare',async()=>{
   await section(page,'compare');await page.locator('#dqa-compare-before').selectOption(before);
   await page.locator('#dqa-compare-after').selectOption(after);
   await page.locator('#dqa-comparison-form button[type="submit"]').click();
  },value=>check(same(value,{before,after}),'The selected original comparison changed.'),value=>sourceClient.dqaCompare(value.before,value.after));
  check(compared.schema==='stellar-forge.iati-dqa-comparison.v1'&&compared.before===before&&compared.after===after,
   'The complete comparison selected another assessment pair.');
  const fullComparison=await comparePages(sourceClient,compared.id);
  check(same(fullComparison.record,compared),'The complete native comparison changed between create and page reads.');
  await stage('comparison',fullComparison);
  if(progress.requests.compare.result){
   await section(page,'compare');await page.locator('#dqa-compare-before').selectOption(before);
   await page.locator('#dqa-compare-after').selectOption(after);
   // The original comparison is immutable and has no request-ID mutation.
   const wait=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/iati/dqa/compare'&&response.request().method()==='POST');
   await page.locator('#dqa-comparison-form button[type="submit"]').click();await wait;await idle(page);
  }
  await viewReceipt(page,sourceReceipt,'source-comparison',1360);
  await viewReceipt(page,sourceReceipt,'source-comparison',390);
  await page.setViewportSize({width:1360,height:940});await openAssessmentPage(page,after);
  let browserResponse=progress.stages.browserResponse;
  if(!browserResponse){
   browserResponse=await downloadBrowser(page,'dqa-response-download','browser-native-response.json');
   check(browserResponse.sha256===selectedAssessments[1].response.body.sha256,'The actual browser response file differs from its native original.');
   await stage('browserResponse',browserResponse);
  }
  await openCasePage(page,reviewed.id);
  let browserPacket=progress.stages.browserPacket;
  if(!browserPacket){browserPacket=await downloadBrowser(page,'dqa-case-export','browser-dqa-case.zip');await stage('browserPacket',browserPacket);}
  await stage('sourceBrowser',{receipt:sourceReceipt,reviewed,comparison:compared.id,fullResponse:browserResponse,fullPacket:browserPacket});
  await sourcePage.context.close();contexts.delete(sourcePage.context);
  mcp=await startMcp();
  const mcpCase=(await mcp.call('merchant_source_iati_dqa_case',{workspace:'source',case:reviewed.id,revision:reviewed.revision})).native;
  verifyCase(mcpCase,reviewed);
  for(const assessed of selectedAssessments){
   verifyAssessment((await mcp.call('merchant_source_iati_dqa_assessment',{workspace:'source',assessment:assessed.id})).native,assessed);
   const nativePage=await sourceClient.dqaFindings(assessed.id,{offset:0,limit:250});
   check(same((await mcp.call('merchant_source_iati_dqa_findings',{workspace:'source',assessment:assessed.id,offset:0,limit:250})).native,nativePage),
    'The original MCP finding page changed its native identity.');
  }
  check(same((await mcp.call('merchant_source_iati_dqa_comparison',{workspace:'source',comparison:compared.id,offset:0,limit:250})).native,
   await sourceClient.dqaComparison(compared.id,{offset:0,limit:250})),'The original MCP comparison page changed.');
  const packetExport=await retainedDqaExport('case','dqa',{case:reviewed.id,revision:reviewed.revision});
  check(packetExport.case===reviewed.id&&packetExport.revision===reviewed.revision,'The full MCP packet lost its selected case revision.');
  const packetFile=await downloadMcp('case',packetExport,{interrupt:true});
  // Byte-identical request/config files may be shared by two assessments; every
  // descriptor must still name the particular assessment and kind requested.
  const mcpFiles=[];
  for(let index=0;index<2;index++)for(const kind of ['request','response','configuration-before','configuration-after']){
   const key='capture-'+(index+1)+'-'+kind,assessment=selectedAssessments[index];
   const metadata=await retainedDqaExport(key,'dqa-file',{assessment:assessment.id,kind});
   check(metadata.assessment===assessment.id&&metadata.fileKind===kind,
    'A reused SHA-addressed file returned a different requested assessment or kind.');
   const file=await downloadMcp(key,metadata),expected=originalFile(assessment,kind);
   check(file.sha256===expected.sha256&&file.bytes===expected.bytes,'The complete MCP native file changed.');
   mcpFiles.push({assessment:assessment.id,kind,...file});
  }
  const inspection=await inspectPacket(packetFile);
  const extracted=name=>join(inspection.directory,name);
  check(same(await json(extracted('case-history.json')),history)&&
   same(await json(extracted('reports/case.json')),reviewed),'The complete extracted customer history differs from its original saved work.');
  const packetAssessments=await json(extracted('assessments.json')),packetComparisons=await json(extracted('comparisons.json'));
  for(const value of selectedAssessments)verifyAssessment(packetAssessments.find(row=>row.id===value.id),value);
  check(packetComparisons.some(row=>same(row,compared)),'The complete native packet omitted its comparison.');
  await stage('completeFiles',{packet:packetFile,inspection,nativeFiles,mcpFiles,
   interruption:progress.downloads.case.interrupted??null});
  await sourceClient.dispose();sourceClient=null;
  await stopApplication(sourceOwned);
  await stage('sourceStopped',sourceOwned.stopped);
  const sourceCli={};
  for(const [name,args] of Object.entries({providers:['dqa-providers'],assessments:['dqa-assessments'],
   cases:['dqa-cases'],history:['dqa-history','--id',reviewed.id],case:['dqa-case','--id',reviewed.id,'--revision',String(reviewed.revision)],
   comparison:['dqa-comparison','--id',compared.id,'--offset','0','--limit','250'],operations:['dqa-operations','--offset','0','--limit','250']}))
   sourceCli[name]=await runCli('source-'+name,directory,args);
  verifyCase(sourceCli.case,reviewed);check(same(sourceCli.history,history),'The closed original CLI lost its complete case history.');
  for(let index=0;index<2;index++){
   const selected=selectedAssessments[index];
   verifyAssessment(await runCli('source-assessment-'+index,directory,['dqa-assessment','--id',selected.id]),selected);
   const page=await runCli('source-findings-'+index,directory,['dqa-findings','--id',selected.id,'--offset','0','--limit','250']);
   check(same(page,await json(findingSets[index].pages[0].path)),'The closed original CLI finding page changed.');
  }
  const replayInput=join(outputDirectory,'actions','original-case-replay.json');
  await publish(replayInput,progress.requests['case-create'].input,true);
  verifyCase(await runCli('source-historical-request-replay',directory,['dqa-case-save','--file',replayInput]),created);
  const cliPacketPath=join(outputDirectory,'downloads','cli-dqa-case.zip');
  const cliExport=await runCli('source-complete-case-export',directory,['dqa-export','--id',reviewed.id,'--revision',String(reviewed.revision),'--out',cliPacketPath]);
  const cliRepeated=await runCli('source-complete-case-export',directory,['dqa-export','--id',reviewed.id,'--revision',String(reviewed.revision),'--out',cliPacketPath],{repeat:true});
  check(cliRepeated.reused===true&&cliExport.sha256===cliRepeated.sha256&&cliExport.bytes===cliRepeated.bytes,
   'The complete native export did not retain its same destination on retry.');
  await stage('sourceCli',{...sourceCli,historicalReplay:created,export:cliExport,repeat:cliRepeated});

  const receivedDirectory=join(outputDirectory,'received-workspace');
  if(!await json(join(receivedDirectory,'workspace.json'))){
   if(await exists(receivedDirectory))await rename(receivedDirectory,join(outputDirectory,'attempts','unpublished-received-'+randomUUID()));
   await runCli('recipient-init',receivedDirectory,['init']);
  }
  const receivedOwned=await setupApplication('received',receivedDirectory),receivedOpened=await startApplication(receivedOwned);
  receivedClient=receivedOpened.client;
  const receivePacket=async client=>{
   const handle=await open(packetFile.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
   try{return await client.dqaReceive({body:handle.createReadStream({autoClose:false,start:0}),bytes:packetFile.bytes});}
   finally{await handle.close();}
  };
  const received=await receivePacket(receivedClient);
  verifyCase(received.case,reviewed);
  check(received.receiving?.schema==='stellar-forge.iati-dqa-receiving.v1'&&received.receiving.packetSha256===packetFile.sha256,
   'The detached original receiver did not retain the complete selected packet.');
  const receivedHistory=(await receivedClient.dqaHistory(reviewed.id)).history;
  check(same(receivedHistory,history),'The full case/action history changed during independent receiving.');
  for(const assessed of selectedAssessments)verifyAssessment(await receivedClient.dqaAssessment(assessed.id),assessed);
  for(const row of portfolios){
   const originalPortfolio=await runCli('source-linked-portfolio-'+row.id+'-'+row.revision,directory,['portfolio','--id',row.id,'--revision',String(row.revision)]);
   check(same(await receivedClient.portfolio(row.id,{revision:row.revision}),originalPortfolio),'A linked complete finance portfolio changed during receiving.');
  }
  const imported=(await mcp.call('merchant_source_import',{workspace:'received',fromWorkspace:'source',exportId:packetExport.exportId})).native;
  check(same(imported,received),'The same complete DQA packet replay changed through generic original MCP import.');
  const reverse=await receivedClient.dqaCompare(after,before);
  check(reverse.id!==compared.id&&reverse.before===after&&reverse.after===before,'The receiver did not retain its separate local comparison.');
  const repeatedReceive=await receivePacket(receivedClient);
  check(same(repeatedReceive,received),'Re-receiving the old packet changed its original receiving result.');
  const {page:reversePage,...receivedReverse}=await receivedClient.dqaComparison(reverse.id,{offset:0,limit:250});
  check(same(receivedReverse,reverse),'The complete old packet displaced a later local comparison.');
  const {page:originalPage,...receivedOriginal}=await receivedClient.dqaComparison(compared.id,{offset:0,limit:250});
  check(same(receivedOriginal,compared),'The original exported comparison changed in its detached receiver.');
  verifyCase((await mcp.call('merchant_source_iati_dqa_case',{workspace:'received',case:reviewed.id,revision:reviewed.revision})).native,reviewed);
  await stage('detachedReceiving',{directory:receivedDirectory,result:received,mcpReplay:imported,afterLocalComparisonReplay:repeatedReceive,
   originalComparison:compared.id,retainedLocalComparison:reverse.id,historyRevisions:receivedHistory.length});
  const receivedPage=await openInstalledIatiPage({browser,applicationsUrl:appsServer.url,applicationLabel:receivedOwned.label,
   consoleUrl:receivedOpened.url,outputDirectory:join(outputDirectory,'views'),name:'received-dqa'});
  contexts.add(receivedPage.context);
  await dqaOpen(receivedPage.page);
  await receivedPage.page.locator('#dqa-receive-file').setInputFiles(packetFile.path);
  const browserReceiveWait=receivedPage.page.waitForResponse(response=>new URL(response.url()).pathname==='/api/iati/dqa/receive'&&response.request().method()==='POST',{timeout:1000000});
  await receivedPage.page.locator('#dqa-receive-form button[type="submit"]').click();
  const browserReceiveResponse=await browserReceiveWait;
  check(browserReceiveResponse.ok()&&same(await browserReceiveResponse.json(),received),'The original file-input receiving changed the complete packet.');
  await idle(receivedPage.page);await openCasePage(receivedPage.page,reviewed.id);
  check((await receivedPage.page.locator('#dqa-case-detail').textContent()).includes(reviewed.name),'The received browser case is not the original selected work.');
  await viewReceipt(receivedPage.page,receivedPage.receipt,'received-reviewed-case',1360);
  await viewReceipt(receivedPage.page,receivedPage.receipt,'received-reviewed-case',390);
  await receivedPage.page.setViewportSize({width:1360,height:940});
  await openAssessmentPage(receivedPage.page,after);
  await viewReceipt(receivedPage.page,receivedPage.receipt,'received-native-assessment',1360);
  await stage('receivedBrowser',{receipt:receivedPage.receipt,case:reviewed.id,revision:reviewed.revision,receive:received});
  await receivedPage.context.close();contexts.delete(receivedPage.context);
  await receivedClient.dispose();receivedClient=null;
  await stopApplication(receivedOwned);
  const cliReceived=await runCli('recipient-receive-repeat',receivedDirectory,['dqa-receive','--file',packetFile.path]);
  check(same(cliReceived,received),'The original received work changed on native CLI repeat.');
  verifyCase(await runCli('recipient-case-reopen',receivedDirectory,['dqa-case','--id',reviewed.id,'--revision',String(reviewed.revision)]),reviewed);
  check(same(await runCli('recipient-history-reopen',receivedDirectory,['dqa-history','--id',reviewed.id]),history),
   'The received full history changed after Stop and CLI reopen.');
  const reopened=await startApplication(receivedOwned);receivedClient=reopened.client;
  verifyCase(await receivedClient.dqaCase(reviewed.id),reviewed);
  check(same((await receivedClient.dqaHistory(reviewed.id)).history,history),'The restarted original Application lost case history.');
  const {page:reopenedChanges,...reopenedComparison}=await receivedClient.dqaComparison(reverse.id,{offset:0,limit:250});
  check(same(reopenedComparison,reverse),'The restarted original Application lost the later local comparison.');
  const reopenedPage=await openInstalledIatiPage({browser,applicationsUrl:appsServer.url,applicationLabel:receivedOwned.label,
   consoleUrl:reopened.url,outputDirectory:join(outputDirectory,'views'),name:'reopened-dqa'});
  contexts.add(reopenedPage.context);await dqaOpen(reopenedPage.page);await openCasePage(reopenedPage.page,reviewed.id);
  await viewReceipt(reopenedPage.page,reopenedPage.receipt,'reopened-reviewed-case',1360);
  await viewReceipt(reopenedPage.page,reopenedPage.receipt,'reopened-reviewed-case',390);
  await stage('reopenedBrowser',{receipt:reopenedPage.receipt,case:reviewed.id,revision:reviewed.revision,retainedLocalComparison:reverse.id});
  await reopenedPage.context.close();contexts.delete(reopenedPage.context);
  await receivedClient.dispose();receivedClient=null;
  await mcp.close();mcp=null;
  await stopApplication(receivedOwned);
  const finalApps=await appApi('/api/applications/state?historyLimit=30');
  const ownedApps=finalApps.applications.filter(row=>[sourceOwned.id,receivedOwned.id].includes(row.id));
  check(ownedApps.length===2&&ownedApps.every(row=>row.phase==='STOPPED'),
   'Both saved original Applications must complete Stop before returning the full receiver.');
  const receipts=[sourceReceipt,receivedPage.receipt,reopenedPage.receipt];
  const browserErrors=receipts.flatMap(row=>[...(row.pageErrors??[]),...(row.consoleErrors??[]),...(row.assetErrors??[])]);
  check(browserErrors.length===0,'The actual installed browser emitted errors; its full private receiving record is retained.');
  const compact={
   schema:SCHEMA,operationId,actor,source:{directory,runtime:runtimeBinding(runtime),provider:selectedProvider.id,
    case:reviewed.id,revision:reviewed.revision,definitionSha256:reviewed.definitionSha256,historyRevisions:history.length},
   assessments:selectedAssessments.map((row,index)=>({id:row.id,sourceId:assessments[index].sourceId??null,requestId:row.requestId,parameters:row.parameters,
    response:row.response.body,summary:row.summary,counts:row.counts,listedActivities:row.listedActivities,
    listedRuleResults:row.listedRuleResults,allFindingPages:findingSets[index].pages.length,
    sourceEvidence:progress.stages['sourceEvidence'+(index+1)].manifest})),
   comparison:{id:compared.id,before:compared.before,after:compared.after,counts:compared.counts,scopeChanges:compared.scopeChanges,
    changes:compared.changes,fullPages:fullComparison.pages.length},
   received:{directory:receivedDirectory,case:reviewed.id,revision:reviewed.revision,receiving:received.receiving,
    historyRevisions:history.length,retainedLocalComparison:reverse.id},
   download:{fullPacket:packetFile,interruption:progress.downloads.case.interrupted??null},
   browser:{errors:browserErrors,views:receipts.flatMap(row=>row.views??[])},
   applications:ownedApps.map(row=>({id:row.id,label:row.label,phase:row.phase,revision:row.revision,totalRuns:row.totalRuns}))
  };
  const bundle=await completeBundle({nativePacket:packetFile,inspection,reviewed,selectedAssessments,comparison:compared,summary:compact});
  await stage('completeCustomerHandover',bundle);
  const files=[{path:bundle.path,...await identity(bundle.path)},packetFile,browserPacket,browserResponse,
   {path:cliPacketPath,...await identity(cliPacketPath)},inspection.manifest,
   ...nativeFiles.flatMap(row=>row.files),...mcpFiles,
   ...[1,2].map(index=>progress.stages['sourceEvidence'+index].manifest)];
  result={...compact,state:'COMPLETE',selectionSha256:hash(encode(selection)),completedAt:new Date().toISOString(),
   customerHandover:bundle,files,stages:Object.keys(progress.stages)};
  await publish(join(outputDirectory,'completed-workflow.json'),result);

  }
 }catch(error){failure=error;if(progress)await publish(join(outputDirectory,'error-'+Date.now()+'.json'),{
   schema:SCHEMA,operationId,error:errorValue(error),stages:Object.keys(progress.stages),at:new Date().toISOString()}).catch(()=>{});
 }finally{
  const cleanup=[];
  for(const context of contexts)try{await context.close();}catch(error){cleanup.push(errorValue(error));}
  for(const client of[sourceClient,receivedClient])if(client)try{await client.dispose();}catch(error){cleanup.push(errorValue(error));}
  if(mcp)try{await mcp.close();}catch(error){cleanup.push(errorValue(error));}
  if(appApi)for(const owned of Object.values(progress?.applications??{})){
   if(!owned.id)continue;
   let operationId=activeApplications.get(owned.id)??owned.runs.at(-1)?.requestId;
   try{
    const state=await appApi('/api/applications/state?historyLimit=1');
    const current=state.applications.find(item=>item.id===owned.id)?.current;
    if(!current||!current.active&&!['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(current.phase))continue;
    operationId=current.id;
    await appApi('/api/applications/stop',{applicationId:owned.id,operationId});
    await until(()=>appApi('/api/applications/state?historyLimit=1'),
     value=>{const app=value.applications.find(item=>item.id===owned.id);return app&&!app.current?.active&&
      !['PENDING','QUEUED','RUNNING','INTERRUPTED'].includes(app.current?.phase);},
     'The original retained application is still finishing its Stop.',{timeoutMs:90000});
   }catch(error){cleanup.push({applicationId:owned.id,operationId,...errorValue(error)});}
  }
  if(browser)try{await browser.close();}catch(error){cleanup.push(errorValue(error));}
  if(appsServer)try{await appsServer.close();}catch(error){cleanup.push(errorValue(error));}
  if(appsModel)try{await appsModel.close();}catch(error){cleanup.push(errorValue(error));}
  if(cleanup.length){await publish(join(outputDirectory,'cleanup-'+Date.now()+'.json'),cleanup).catch(()=>{});
   failure??=Object.assign(new Error('The original receiving cleanup remains pending in its retained records.'),{code:'IATI_RECEIVING_CLEANUP'});}
  try{if(result&&!failure)await publish(join(outputDirectory,'result.json'),result,true);}
  finally{await lease.close();}
 }
 if(failure)throw failure;
 return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length===3&&['--help','-h','help'].includes(process.argv[2])){
   process.stdout.write('node dqa.mjs --input /absolute/receiving.json --runtime-ready /absolute/runtime-ready.json --upstream-ready /absolute/original-ready.json --provider-file /absolute/provider.json --assessments-file /absolute/assessment-requests.json\n');
  }else{
   const args=process.argv.slice(2),allowed=new Set(['--input','--runtime-ready','--upstream-ready','--provider-file','--assessments-file']),selected={};
   check(args.length===10,'Pass the five complete original receiving input paths.');
   for(let index=0;index<args.length;index+=2){
    check(allowed.has(args[index])&&!selected[args[index]]&&typeof args[index+1]==='string'&&isAbsolute(args[index+1])&&resolve(args[index+1])===args[index+1],
     'Pass each original receiving input path once.');selected[args[index]]=args[index+1];
   }
   const configuration=await json(selected['--input']),runtime=await json(selected['--runtime-ready']),
    upstream=await json(selected['--upstream-ready']),providerInput=await json(selected['--provider-file']),
    requests=await json(selected['--assessments-file']);
   check(plain(configuration)&&Object.keys(configuration).every(key=>['directory','outputDirectory','operationId','actor','portfolios','pythonExecutable','chromiumExecutable','playwrightModule'].includes(key)),
    'Keep the complete caller-owned receiving configuration on its supported fields.');
   check(runtime?.state==='READY'&&typeof runtime.sourceRoot==='string'&&typeof runtime.runtimeDirectory==='string'&&
    /^[0-9a-f]{40}$/.test(runtime.sourceCommit),'Run the original complete runtime preparer and select its actual READY result.');
   check(upstream?.state==='READY'&&upstream.ready_file===selected['--upstream-ready']&&
    upstream.provider_input===selected['--provider-file']&&upstream.assessments_input===selected['--assessments-file'],
    'Select the original READY record and its complete original input paths.');
   check(providerInput?.schema==='commons.iati.dqa.upstream-provider-input.v1'&&
    providerInput.engine_commit==='61a5e02420b936a39ebaf79dea7212fc0ce36683'&&
    providerInput.api_base_url===upstream.api_base_url&&providerInput.authorization_env===upstream.authorization_env,
    'The provider source does not match the original native READY selection.');
   check(requests?.schema==='commons.iati.dqa.assessment-requests.v1'&&
    requests.engine_commit===providerInput.engine_commit&&Array.isArray(requests.assessments)&&requests.assessments.length===2&&
    requests.assessments.every(row=>plain(row)&&typeof row.id==='string'&&typeof row.name==='string'&&plain(row.request)),
    'Retain the complete two-request native assessment source.');
   const result=await runIatiDqaReceiving({...configuration,sourceRoot:runtime.sourceRoot,runtimeDirectory:runtime.runtimeDirectory,
    upstreamReadyFile:selected['--upstream-ready'],provider:{
     name:providerInput.name,endpoint:providerInput.api_base_url.replace(/\/$/,'')+'/dqa',
     authorizationEnv:providerInput.authorization_env,timeoutSeconds:900,
     notes:'Original DQA engine '+providerInput.engine_commit+' with the retained complete public-source exchanges.'},
    assessments:requests.assessments.map(row=>({sourceId:row.id,label:row.name,parameters:row.request}))});
   process.stdout.write(JSON.stringify(result)+'\n');
  }
 }catch(error){process.stderr.write(JSON.stringify({schema:SCHEMA,state:'INTERRUPTED',error:errorValue(error)})+'\n');process.exitCode=1;}
}
