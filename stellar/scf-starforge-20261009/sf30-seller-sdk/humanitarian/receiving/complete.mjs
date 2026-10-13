// MIT. One complete original HUMANITARIAN source -> READY -> operated handover continuation.
import { constants } from 'node:fs';
import { open, readFile, mkdir, lstat, realpath, rename, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { acquireStateLease } from '../../../merchant-fleet-gateway/state-lease.mjs';
import { prepareHumanitarianOperatorRuntime } from './runtime.mjs';
import { runHumanitarianOperatorReceiving } from './operator.mjs';

const SCHEMA='stellar-forge.humanitarian-installed-complete.v1';
const PREFIX='stellar/scf-starforge-20261009/';
const HUMANITARIAN=PREFIX+'sf30-seller-sdk/humanitarian/';
const ownRoot=resolve(fileURLToPath(new URL('../../../../../',import.meta.url)));
const sha=value=>createHash('sha256').update(value).digest('hex');
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const ordered=value=>Array.isArray(value)?value.map(ordered):isRecord(value)?
 Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const encode=value=>Buffer.from(JSON.stringify(ordered(value),null,2)+'\n');
const same=(a,b)=>encode(a).equals(encode(b));
const need=(value,message)=>{if(!value)throw Object.assign(new Error(message),{code:'HUMANITARIAN_COMPLETE_RECEIVING'});};
const detail=error=>({code:String(error.code??'HUMANITARIAN_COMPLETE_ERROR'),message:String(error.message??error),stack:String(error.stack??'')});
const inside=(path,root)=>path===root||path.startsWith(root+'/');
const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function exists(path){try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function json(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function directory(path){
 need(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path&&path!=='/','Select a full original private directory.');
 await mkdir(path,{recursive:true,mode:0o700});const info=await lstat(path);
 need(info.isDirectory()&&!info.isSymbolicLink()&&await realpath(path)===path&&!(info.mode&0o077)&&
  (!process.getuid||info.uid===process.getuid()),'The complete operation directory must remain private and operator-owned.');
 return path;
}
async function identity(path){
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const first=await file.stat({bigint:true});need(first.isFile()&&first.size<=4n*1024n*1024n*1024n,'Read one complete bounded original file.');
  let bytes=0;const hash=createHash('sha256');
  for await(const block of file.createReadStream({autoClose:false})){bytes+=block.length;hash.update(block);}
  const last=await file.stat({bigint:true}),named=await lstat(path,{bigint:true});
  need(BigInt(bytes)===first.size&&['dev','ino','size','mtimeNs','ctimeNs'].every(key=>first[key]===last[key])&&
   first.dev===named.dev&&first.ino===named.ino,'A complete selected original file changed.');
  return{path,bytes,sha256:hash.digest('hex')};
 }finally{await file.close();}
}
async function verified(value){const found=await identity(value.path);
 need(found.bytes===value.bytes&&found.sha256===value.sha256,'The complete retained file differs: '+value.path);return found;}
async function publish(path,value,{immutable=false}={}){
 const bytes=Buffer.isBuffer(value)?value:encode(value);await directory(dirname(path));
 if(immutable&&await exists(path)){need((await readFile(path)).equals(bytes),'The complete saved input changed: '+path);return path;}
 const temporary=join(dirname(path),'.humanitarian-complete-'+randomUUID()+'.partial'),file=await open(temporary,'wx',0o600);
 try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
 need((await readFile(temporary)).equals(bytes),'The complete original publication stage changed.');
 await rename(temporary,path);const parent=await open(dirname(path),constants.O_RDONLY);try{await parent.sync();}finally{await parent.close();}
 return path;
}
function selectedInput(input){
 need(isRecord(input)&&input.schema===SCHEMA,'Use the complete original installed receiving input.');
 const keys=['schema','operationId','outputDirectory','sourceRoot','sourceCommit','coreResult','runtime','actor',
  'pythonExecutable','chromiumExecutable','playwrightModule'];
 need(Object.keys(input).length===keys.length&&keys.every(key=>Object.hasOwn(input,key)),'Retain the exact complete input fields.');
 need(typeof input.operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,110}$/.test(input.operationId)&&
  /^[a-f0-9]{40}$/.test(input.sourceCommit),'Name the original source-selected operation.');
 for(const key of ['outputDirectory','sourceRoot','pythonExecutable','chromiumExecutable','playwrightModule'])
  need(typeof input[key]==='string'&&isAbsolute(input[key])&&resolve(input[key])===input[key],
   'Select complete existing original paths.');
 need(isRecord(input.coreResult)&&typeof input.coreResult.path==='string'&&Number.isSafeInteger(input.coreResult.bytes)&&
  /^[a-f0-9]{64}$/.test(input.coreResult.sha256),'Select the complete native receiving result.');
 need(isRecord(input.runtime)&&typeof input.runtime.repository==='string'&&isRecord(input.runtime.sourceReceiving)&&
  isRecord(input.actor),'Retain the original source-receiving and named operator inputs.');
 need(Object.keys(input.runtime).every(key=>['repository','sourceReceiving','npmExecutable','sourceOffline','dependencyOffline'].includes(key)),
  'Use only the maintained original runtime preparation options.');
 return input;
}
async function matchingHandover(request){
 const matched=[];
 for(const name of await readdir('/proc')){
  if(!/^\d+$/.test(name)||Number(name)===process.pid)continue;
  let body;
  try{body=await readFile('/proc/'+name+'/cmdline');}catch(error){if(['ENOENT','ESRCH'].includes(error.code))continue;throw error;}
  const argv=body.toString('utf8').split('\0').filter(Boolean);
  if(same(argv.slice(1),request.args))matched.push(Number(name));
 }
 return matched;
}
async function handoverProcess(request,folder){
 await directory(folder);await publish(join(folder,'request.json'),request,{immutable:true});
 while((await matchingHandover(request)).length)await pause(500);
 const completed=await json(join(dirname(request.args.at(-1)),'result.json'));
 if(completed?.state==='COMPLETE')return completed;
 const index=(await readdir(folder)).filter(name=>name.startsWith('attempt-')&&name.endsWith('.json')).length;
 const stamp=String(index).padStart(4,'0')+'-'+randomUUID();
 const stdout=join(folder,'stdout-'+stamp+'.json'),stderr=join(folder,'stderr-'+stamp+'.log');
 const out=await open(stdout,'wx',0o600),err=await open(stderr,'wx',0o600);
 const intent={request,index,stdout,stderr,selectedAt:new Date().toISOString()};
 await publish(join(folder,'intent-'+stamp+'.json'),intent,{immutable:true});
 let child,exit;
 try{
  child=spawn(request.executable,request.args,{shell:false,cwd:request.cwd,
   env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore',out.fd,err.fd]});
  exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
  await out.sync();await err.sync();
 }catch(error){await publish(join(folder,'failure-'+stamp+'.json'),{...intent,error:detail(error),observedAt:new Date().toISOString()},{immutable:true});throw error;}
 finally{await out.close();await err.close();}
 const receipt={...intent,exit,stdoutFile:await identity(stdout),stderrFile:await identity(stderr),endedAt:new Date().toISOString()};
 await publish(join(folder,'attempt-'+stamp+'.json'),receipt,{immutable:true});
 need(exit.code===0,'The original complete handover retained an error in '+stderr);
 return JSON.parse(await readFile(stdout,'utf8'));
}

export async function completeHumanitarianInstalledReceiving(raw){
 process.umask(0o077);
 const input=selectedInput(raw),output=await directory(input.outputDirectory);
 need(await realpath(input.sourceRoot)===await realpath(ownRoot),'Run the controller from its selected original source root.');
 need(!inside(output,input.sourceRoot)&&!inside(input.sourceRoot,output),'Use a separate complete receiving output directory.');
 await verified(input.coreResult);
 const core=await json(input.coreResult.path);
 need(core?.status==='COMPLETE'&&core.schema==='stellar-forge.humanitarian-operated-case.v1',
  'Continue the complete original native core result.');
 need(!inside(output,core.sourceWorkspace)&&!inside(core.sourceWorkspace,output),
  'Keep the complete receiving output beside the original core workspace.');
 const lease=await acquireStateLease(output);
 let progress,answer,failure;
 const progressPath=join(output,'progress.json'),inputSha256=sha(encode(input));
 const save=async()=>{lease.assertHeld();progress.updatedAt=new Date().toISOString();await publish(progressPath,progress);};
 try{
  for(const name of ['attempts','operator','handover','handover-process'])await directory(join(output,name));
  await publish(join(output,'input.json'),input,{immutable:true});
  progress=await json(progressPath)??{schema:SCHEMA,operationId:input.operationId,inputSha256,createdAt:new Date().toISOString(),phase:'SELECTED'};
  need(progress.schema===SCHEMA&&progress.operationId===input.operationId&&progress.inputSha256===inputSha256,
   'The complete original operation selection changed.');
  const prior=await json(join(output,'result.json'));
  if(prior){
   need(prior.state==='COMPLETE'&&prior.inputSha256===inputSha256,'The complete retained result selects another input.');
   for(const file of prior.files)await verified(file);
   return{...prior,reused:true};
  }
  progress.phase='PREPARING_RUNTIME';await save();
  const runtime=await prepareHumanitarianOperatorRuntime({...input.runtime,sourceRoot:input.sourceRoot,sourceCommit:input.sourceCommit,
   outputDirectory:join(output,'runtime'),operationId:input.operationId+'-runtime',pythonExecutable:input.pythonExecutable,
   onProgress:value=>process.stderr.write(JSON.stringify({operationId:input.operationId,stage:'runtime',...value})+'\n')});
  need(runtime.state==='READY'&&runtime.sourceCommit===input.sourceCommit,'The original runtime preparation did not return READY.');
  const runtimeResult=await identity(runtime.records.ready);
  progress.runtimeResult=runtimeResult;progress.phase='OPERATING_ORIGINAL_CASE';await save();
  const operatorInput={directory:core.sourceWorkspace,outputDirectory:join(output,'operator'),sourceRoot:input.sourceRoot,
   runtimeDirectory:runtime.runtimeDirectory,operationId:input.operationId+'-operator',actor:input.actor,
   expected:{id:core.review,revision:core.sourceRevision},coreResult:input.coreResult,pythonExecutable:input.pythonExecutable,
   chromiumExecutable:input.chromiumExecutable,playwrightModule:input.playwrightModule};
  await publish(join(output,'operator-input.json'),operatorInput,{immutable:true});
  const operated=await runHumanitarianOperatorReceiving(operatorInput);
  need(operated.state==='COMPLETE'&&operated.checks.applicationsStopped===true,'Complete the operated original case before packaging.');
  const operatorResult=await identity(join(output,'operator','result.json'));
  progress.operatorResult=operatorResult;progress.phase='COMPLETE_HANDOVER';await save();
  const guideSelection=[
   [HUMANITARIAN+'README.md','HUMANITARIAN_README.md'],
   [HUMANITARIAN+'OPERATOR.md','CONSOLE_OPERATOR.md'],
   [HUMANITARIAN+'receiving/INPUTS_AND_HANDOVER.md','INPUTS_AND_HANDOVER.md'],
   [HUMANITARIAN+'receiving/BROWSER.md','BROWSER.md'],
   [HUMANITARIAN+'receiving/INSTALLED.md','INSTALLED.md'],
   [PREFIX+'distribution/selections/HUMANITARIAN_OPERATOR.md','HUMANITARIAN_OPERATOR_SELECTION.md']
  ];
  const guides=[];
  for(const [path,name]of guideSelection)guides.push({name,...await identity(join(runtime.sourceRoot,path))});
  const handoverInput={schema:'stellar-forge.humanitarian-customer-handover.v1',operationId:input.operationId,
   sourceCommit:input.sourceCommit,output:join(output,'handover','HUMANITARIAN_Complete_Installed_Operator_Package.zip'),
   coreResult:input.coreResult,operatorResult,runtimeResult,guides};
  const handoverInputPath=join(output,'handover','selected-input.json');
  await publish(handoverInputPath,handoverInput,{immutable:true});
  const helper=join(runtime.sourceRoot,HUMANITARIAN+'receiving/package.py'),actualHelper=await identity(helper),
   sourceHelper=await identity(join(input.sourceRoot,HUMANITARIAN+'receiving/package.py'));
  need(actualHelper.bytes===sourceHelper.bytes&&actualHelper.sha256===sourceHelper.sha256,
   'The installed complete handover helper differs from its original source.');
  const request={executable:input.pythonExecutable,args:['-B',helper,'--input',handoverInputPath],cwd:output};
  const saved=await handoverProcess(request,join(output,'handover-process'));
  need(saved.schema===handoverInput.schema&&saved.state==='COMPLETE'&&saved.operationId===input.operationId&&
   saved.sourceCommit===input.sourceCommit&&saved.output===handoverInput.output,'The full handover returned another selected operation.');
  const customer=await identity(saved.output);
  need(customer.bytes===saved.bytes&&customer.sha256===saved.sha256,'The complete saved customer ZIP differs from its native receipt.');
  const handoverResult=await identity(join(output,'handover','result.json'));
  answer={schema:SCHEMA,state:'COMPLETE',operationId:input.operationId,inputSha256,sourceCommit:input.sourceCommit,
   completedAt:new Date().toISOString(),sourceReview:operated.source.reviewed,receivedReview:operated.received.review,
   sourceManifestSha256:runtime.sourceManifestSha256,installationId:runtime.installationId,profileId:runtime.profileId,
   customer,notice:core.purpose,checks:operated.checks,files:[input.coreResult,runtimeResult,operatorResult,handoverResult,customer]};
  progress.phase='COMPLETE';progress.customer=customer;await save();
  await publish(join(output,'result.json'),answer,{immutable:true});
 }catch(error){
  failure=error;
  await publish(join(output,'attempts','error-'+randomUUID()+'.json'),
   {schema:SCHEMA,operationId:input.operationId,observedAt:new Date().toISOString(),error:detail(error)}).catch(()=>{});
 }finally{await lease.close();}
 if(failure)throw failure;
 return answer;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 need(process.argv.length===3,'node complete.mjs /absolute/original-complete-input.json');
 const input=await json(resolve(process.argv[2]));
 process.stdout.write(JSON.stringify(await completeHumanitarianInstalledReceiving(input),null,2)+'\n');
}
