#!/usr/bin/env node
/**
 * One complete CanadaBuys bidder-desk receiving operation.
 * Original captured rows remain exact; all supplier/requirement/decision examples are labeled.
 * All product changes use the maintained v1 workspace or current HTTP/UI APIs.
 * Repeated invocations retain original commands, history, reports and completed artifacts.
 */
import {constants as FS} from 'node:fs';
import {open,readFile,mkdir,link,unlink,lstat,readdir,realpath,readlink,rename} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const SCHEMA='commons.canadabuys.bidder-desk-receiving.v1';
const OPERATION='CANADABUYS-BIDDER-DESK-RECEIVING-6BA15-20261012';
const arg={};
for(let i=2;i<process.argv.length;i+=2){
 const name=process.argv[i],value=process.argv[i+1];
 if(!name?.startsWith('--')||!value||value.startsWith('--')||Object.hasOwn(arg,name.slice(2)))throw new Error('Use each --name value exactly once');
 arg[name.slice(2)]=value;
}
const allowed=['application','legacy-application','fixture','output','playwright','chromium'];
for(const key of Object.keys(arg))if(!allowed.includes(key))throw new Error('Unknown option --'+key);
for(const key of allowed)if(!arg[key])throw new Error('Missing --'+key);
const OUT=path.resolve(arg.output),SUPPLIED_APP=await realpath(arg.application),SUPPLIED_LEGACY=await realpath(arg['legacy-application']);
const SELF=fileURLToPath(import.meta.url),FIXTURE_BYTES=await readFile(arg.fixture);
const fixture=JSON.parse(FIXTURE_BYTES.toString('utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>value===undefined?'null':value===null||typeof value!=='object'?JSON.stringify(value):
 Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
const same=(a,b)=>isDeepStrictEqual(a,b);
const need=(ok,message,detail)=>{if(!ok){const e=new Error(message);if(detail!==undefined)e.detail=detail;throw e;}};
const brief=error=>({name:error?.name||'Error',code:error?.code||null,message:String(error?.message||error),detail:error?.detail??error?.details??null,stack:error?.stack||null});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
const safeName=value=>{need(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(value),'Unsafe receiving label');return value;};
const relative=value=>{
 need(typeof value==='string'&&value&&!value.includes('\\')&&!value.startsWith('/')&&value.split('/').every(x=>x&&x!=='.'&&x!=='..')&&!/[\u0000-\u001f]/.test(value),'Unsafe relative member',value);return value;
};
const inOut=rel=>path.join(OUT,relative(rel));
const APP=inOut('application'),LEGACY=inOut('legacy-application'),WORKSPACE=inOut('workspaces/original'),COLD=inOut('workspaces/cold');
const FI=sha(FIXTURE_BYTES),attemptId=new Date().toISOString().replace(/[-:.TZ]/g,'')+'-'+randomUUID();
const ATTEMPT='attempts/'+attemptId;
let lock=null,mainServer=null,coldServer=null,browser=null,browserContext=null,page=null;
let Client=null,Workspace=null,Core=null,activeAction=null,wireNumber=0;
const resources=new Set(),routeTasks=new Set(),dialogs=[],pageErrors=[],browserErrors=[],drains=[],completedPhases=[];
let mainError=null,finalData=null,applicationAdoption=null;

async function exists(file){try{await lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function checked(file,expected){
 const descriptor=await open(file,FS.O_RDONLY|FS.O_NOFOLLOW);
 try{
  const before=await descriptor.stat();need(before.isFile()&&before.size<=128*1024*1024,'Receiving member is not a bounded regular file',file);
  const data=await descriptor.readFile(),after=await descriptor.stat();
  need(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&data.length===after.size,'Receiving member changed while reading',file);
  const value={bytes:data.length,sha256:sha(data)};
  if(expected)need(value.bytes===expected.bytes&&value.sha256===expected.sha256,'Exact receiving bytes differ',{file,expected,actual:value});
  return {data,...value};
 }finally{await descriptor.close();}
}
async function syncDirectory(dir){const h=await open(dir,FS.O_RDONLY);try{await h.sync();}finally{await h.close();}}
async function writeExact(file,bytes){
 const data=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
 const expected={bytes:data.length,sha256:sha(data)};
 if(await exists(file)){await checked(file,expected);return expected;}
 await mkdir(path.dirname(file),{recursive:true,mode:0o700});
 const temporary=path.join(path.dirname(file),'.'+path.basename(file)+'.'+randomUUID()+'.partial');
 let fd=null,published=false;
 try{
  fd=await open(temporary,FS.O_CREAT|FS.O_EXCL|FS.O_WRONLY|FS.O_NOFOLLOW,0o600);
  await fd.writeFile(data);await fd.sync();await fd.close();fd=null;
  try{await link(temporary,file);published=true;}catch(e){if(e.code!=='EEXIST')throw e;await checked(file,expected);}
  if(published)await syncDirectory(path.dirname(file));
  return expected;
 }finally{
  if(fd)await fd.close().catch(()=>{});
  await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});
 }
}
async function put(rel,value){return {path:relative(rel),...await writeExact(inOut(rel),jsonBytes(value))};}
async function putBytes(rel,bytes){return {path:relative(rel),...await writeExact(inOut(rel),bytes)};}
async function optional(rel){if(!await exists(inOut(rel)))return null;return JSON.parse((await checked(inOut(rel))).data.toString('utf8'));}
async function retained(rel,make){
 const prior=await optional(rel);if(prior!==null)return prior;
 const value=await make();await put(rel,value);return value;
}
async function descriptor(rel){const v=await checked(inOut(rel));return {path:rel,bytes:v.bytes,sha256:v.sha256};}
async function phase(name,work){
 safeName(name);const rel='phases/'+name+'.json',old=await optional(rel);
 if(old){need(old.schema===SCHEMA&&old.operationId===OPERATION&&old.inputSha256===FI&&old.name===name,'Saved phase identity differs',name);completedPhases.push({name,reused:true});return old.value;}
 const value=await work(),record={schema:SCHEMA,operationId:OPERATION,inputSha256:FI,name,completedAt:new Date().toISOString(),value};
 await put(rel,record);completedPhases.push({name,reused:false});
 console.log(JSON.stringify({operationId:OPERATION,phase:name,status:'PASS'}));return value;
}
async function originalAction(name,make){
 return retained('actions/'+safeName(name)+'/request.json',async()=>{
  const value=await make();need(typeof value.method==='string'&&Array.isArray(value.args),'Original action ABI is incomplete',name);
  return {schema:SCHEMA,operationId:OPERATION,inputSha256:FI,name,...value};
 });
}
async function action(name,make,{loseResponse=false,client=mainServer.client}={}){
 const request=await originalAction(name,make);need(request.operationId===OPERATION&&request.inputSha256===FI&&request.name===name,'Saved action binding differs');
 const rel='actions/'+name+'/result.json',old=await optional(rel);if(old)return old.value;
 const invoke=async()=>{
  activeAction={name,loseResponse};
  try{need(typeof client[request.method]==='function','Unknown original client operation');return await client[request.method](...request.args);}
  finally{activeAction=null;}
 };
 let value;
 try{value=await invoke();}
 catch(error){
  if(!loseResponse||!await optional('actions/'+name+'/lost-response.json'))throw error;
  await put(ATTEMPT+'/accepted-response-loss-'+name+'.json',{schema:SCHEMA,action:name,error:brief(error),at:new Date().toISOString()});
  value=await invoke();
 }
 await put(rel,{schema:SCHEMA,operationId:OPERATION,inputSha256:FI,name,value});return value;
}
async function replay(name,client=mainServer.client){
 const request=await optional('actions/'+name+'/request.json');need(request,'Original replay request is absent',name);
 const old=await optional('actions/'+name+'/result.json');need(old,'Original replay result is absent',name);
 activeAction={name:name+'-replay',loseResponse:false};
 let value;try{value=await client[request.method](...request.args);}finally{activeAction=null;}
 need(value.alreadyApplied===true&&same(value.record,old.value.record),'Stable command did not return its exact original record',name);return value;
}
async function expectedFailure(name,call,codes){
 let error;try{await call();}catch(e){error=e;}
 need(error&&codes.includes(error.code),'Expected product refusal was not returned',{name,codes,error:brief(error||'No error')});
 const value={schema:SCHEMA,name,code:error.code,status:error.status,detail:error.details??null};
 await put('observations/'+name+'.json',value);return value;
}
function clientFor(origin,label){
 return new Client(origin,{timeoutMs:30000,maxResponseBytes:32*1024*1024,fetch:async(url,init)=>{
  need(new URL(url).origin===origin,'The native receiving client escaped its local application');
  const number=++wireNumber,prefix=ATTEMPT+'/http/'+String(number).padStart(5,'0'),actionName=activeAction?.name||null;
  await put(prefix+'.request.json',{at:new Date().toISOString(),label,action:actionName,url:String(url),method:init.method,headers:init.headers,body:init.body??null});
  let response;
  try{
   response=await globalThis.fetch(url,init);
   const raw=Buffer.from(await response.clone().arrayBuffer());need(raw.length<=32*1024*1024,'Recorded application response exceeds receiving bound');
   const body=await putBytes(prefix+'.response.bin',raw);
   await put(prefix+'.response.json',{at:new Date().toISOString(),status:response.status,headers:Object.fromEntries(response.headers),body});
   if(activeAction?.loseResponse&&response.ok&&init.method==='POST'&&!await optional('actions/'+actionName+'/lost-response.json')){
    await put('actions/'+actionName+'/lost-response.json',{schema:SCHEMA,operationId:OPERATION,inputSha256:FI,action:actionName,request:prefix+'.request.json',response:prefix+'.response.json',body});
    throw new Error('DELIBERATE_RECEIVING_RESPONSE_LOSS_AFTER_ORIGINAL_COMMIT');
   }
   return response;
  }catch(error){await put(prefix+'.error.json',{at:new Date().toISOString(),error:brief(error)});throw error;}
 }});
}
async function startServer(directory,application,label){
 const module=await import(pathToFileURL(path.join(application,'server.mjs')));
 const owned=await module.startCanadaBuysServer({directory,operator:'Receiving operator — fictional decisions',title:'CanadaBuys bidder desk receiving',host:'127.0.0.1',port:0});
 const value={...owned,label,application,directory};value.client=clientFor(owned.origin,label);resources.add(value);
 await put(ATTEMPT+'/server-'+label+'.json',{origin:owned.origin,directory:path.relative(OUT,directory),application:path.relative(OUT,application),workspace:owned.workspace.metadata(),at:new Date().toISOString()});return value;
}
async function closeServer(server){
 if(!server||!resources.has(server))return;
 await server.close();resources.delete(server);
 const value={label:server.label,origin:server.origin,workspace:server.directory,serverClosed:true,workspaceClosed:true,at:new Date().toISOString()};
 drains.push(value);await put(ATTEMPT+'/drain-'+server.label+'.json',value);
}
const UI_ADOPTION={
 path:'operator/bidder-desk.html',
 original:{bytes:51465,sha256:'a52720fe56caf27da3eeb09cf7a2c157f4d9b575348d592811817af7291fa18f'},
 selected:{bytes:51500,sha256:'25e608ab4095944b10bc81ca0174b2d055bda4055d03a788ce7026f307b39835'},
 before:"if(parts.length>keys.length||!parts[0]||!parts[1])throw new Error('Complete row '+(index+1)+' using the stated family | code format.');",
 after:"if(parts.length<2||parts.length>keys.length||!parts[0])throw new Error('Complete row '+(index+1)+' using the stated family | code format; an unknown code may be blank.');",
 directory:'source-adoptions/blank-commodity-code',
 reason:'The original saved profile contains a deliberately unknown blank UNSPSC code. The original UI rejected that accepted domain value before submitting phase07. This exact parser correction preserves the unknown value and every original captured source row.'
};
function selectedApplicationMembers(){
 return fixture.originalApplication.files.map(member=>applicationAdoption&&member.path===UI_ADOPTION.path?{path:member.path,...UI_ADOPTION.selected}:member);
}
function exactUiVersions(raw){
 const selected=raw.bytes===UI_ADOPTION.selected.bytes&&raw.sha256===UI_ADOPTION.selected.sha256;
 need(selected||(raw.bytes===UI_ADOPTION.original.bytes&&raw.sha256===UI_ADOPTION.original.sha256),'Supplied operator page is neither the original nor the exact reviewed correction');
 let oldText=raw.data.toString('utf8');
 if(selected){need(oldText.split(UI_ADOPTION.after).length===2,'The selected parser postimage is not unique');oldText=oldText.replace(UI_ADOPTION.after,UI_ADOPTION.before);}
 need(Buffer.byteLength(oldText)===UI_ADOPTION.original.bytes&&sha(oldText)===UI_ADOPTION.original.sha256,'Original operator page reconstruction changed bytes');
 need(oldText.split(UI_ADOPTION.before).length===2,'The original parser preimage is not unique');
 const next=oldText.replace(UI_ADOPTION.before,UI_ADOPTION.after);
 need(Buffer.byteLength(next)===UI_ADOPTION.selected.bytes&&sha(next)===UI_ADOPTION.selected.sha256,'Selected operator page reconstruction changed bytes');
 return {original:Buffer.from(oldText),selected:Buffer.from(next)};
}
async function validateUiAdoption(){
 const folder=UI_ADOPTION.directory,plan=await optional(folder+'/plan.json');
 if(!plan)return null;
 need(plan.schema===SCHEMA+'.source-adoption'&&plan.operationId===OPERATION&&plan.inputSha256===FI&&plan.reason===UI_ADOPTION.reason&&
  plan.applicationPath===UI_ADOPTION.path&&same(plan.before,UI_ADOPTION.original)&&same(plan.after,UI_ADOPTION.selected),'Original operator source adoption differs');
 need(plan.sourceBinding.path==='source-binding.json'&&plan.original.path===folder+'/original.html'&&plan.selected.path===folder+'/selected.html','Source adoption selected a different original member');
 await checked(inOut(plan.sourceBinding.path),plan.sourceBinding);await checked(inOut(plan.original.path),UI_ADOPTION.original);await checked(inOut(plan.selected.path),UI_ADOPTION.selected);
 need(Array.isArray(plan.retainedPhases),'Original source adoption phase inventory is absent');
 const seen=new Set();
 for(const item of plan.retainedPhases){
  need(/^phases\/[A-Za-z0-9._-]+\.json$/.test(item.path)&&!seen.has(item.path),'Source adoption phase path differs');seen.add(item.path);
  await checked(inOut(item.path),item);
  const phase=await optional(item.path);need(phase.schema===SCHEMA&&phase.operationId===OPERATION&&phase.inputSha256===FI,'Original adopted phase binding differs');
 }
 if(plan.priorAttemptRecovery){need(plan.priorAttemptRecovery.path==='original-attempt-recovery.json','Prior attempt recovery selected a different member');await checked(inOut(plan.priorAttemptRecovery.path),plan.priorAttemptRecovery);}
 return plan;
}
async function adoptOriginalUi(versions){
 need(lock,'The original receiving lifetime lock is not held');
 const folder=UI_ADOPTION.directory,oldPath=inOut(folder+'/original.html'),newPath=inOut(folder+'/selected.html'),target=path.join(APP,UI_ADOPTION.path);
 await mkdir(path.dirname(oldPath),{recursive:true,mode:0o700});
 const current=await checked(target);
 if(current.sha256===UI_ADOPTION.original.sha256&&current.bytes===UI_ADOPTION.original.bytes){
  const originalInode=await lstat(target);
  if(!await exists(oldPath)){await link(target,oldPath);await syncDirectory(path.dirname(oldPath));}
  await checked(oldPath,UI_ADOPTION.original);
  const sameTarget=await lstat(target);
  need(sameTarget.dev===originalInode.dev&&sameTarget.ino===originalInode.ino,'Original UI inode changed while retaining its source');
  // A verified portable archive may materialize its historical copy as a
  // different inode. Retain this actual target inode as an additional history
  // member; the original plan and its former filesystem identity stay fixed.
  const inodeRelative=folder+'/original-inodes/'+String(originalInode.dev)+'-'+String(originalInode.ino)+'.html';
  await mkdir(path.dirname(inOut(inodeRelative)),{recursive:true,mode:0o700});
  if(!await exists(inOut(inodeRelative)))await link(target,inOut(inodeRelative));
  await checked(inOut(inodeRelative),UI_ADOPTION.original);
  const retainedInode=await lstat(inOut(inodeRelative));
  need(retainedInode.dev===sameTarget.dev&&retainedInode.ino===sameTarget.ino,'The actual original UI inode was not retained');
  await put(ATTEMPT+'/ui-source-inode.json',{schema:SCHEMA,operationId:OPERATION,inputSha256:FI,
   original:await descriptor(inodeRelative),dev:String(retainedInode.dev),ino:String(retainedInode.ino)});
 }else{
  need(current.sha256===UI_ADOPTION.selected.sha256&&current.bytes===UI_ADOPTION.selected.bytes,'Materialized operator page changed outside its exact adoption');
  await checked(oldPath,UI_ADOPTION.original);
  need(await optional(folder+'/plan.json'),'Selected operator page has no original adoption plan');
 }
 await writeExact(newPath,versions.selected);
 let plan=await validateUiAdoption();
 if(!plan){
  const retainedPhases=[];
  if(await exists(inOut('phases'))){
   for(const name of (await readdir(inOut('phases'))).sort()){
    need(/^[A-Za-z0-9._-]+\.json$/.test(name),'Unexpected original phase member');
    const rel='phases/'+name,value=await optional(rel);
    need(value.schema===SCHEMA&&value.operationId===OPERATION&&value.inputSha256===FI,'An original phase is not bound to this input');retainedPhases.push(await descriptor(rel));
   }
  }
  const priorRecovery=await optional('original-attempt-recovery.json');
  if(priorRecovery)need(priorRecovery.operationId===OPERATION,'Supplied original-attempt recovery belongs to another operation');
  const oldStat=await lstat(oldPath);
  plan={schema:SCHEMA+'.source-adoption',operationId:OPERATION,inputSha256:FI,applicationPath:UI_ADOPTION.path,
   reason:UI_ADOPTION.reason,before:UI_ADOPTION.original,after:UI_ADOPTION.selected,
   sourceBinding:await descriptor('source-binding.json'),original:await descriptor(folder+'/original.html'),selected:await descriptor(folder+'/selected.html'),
   originalInode:{dev:String(oldStat.dev),ino:String(oldStat.ino)},retainedPhases,
   priorAttemptRecovery:priorRecovery?await descriptor('original-attempt-recovery.json'):null,
   executionContext:retainedPhases.length?'CONTINUE_ORIGINAL_RETAINED_PHASES':priorRecovery?'FRESH_LOCAL_OUTPUT_WITH_ORIGINAL_ATTEMPT_HISTORY':'FRESH_LOCAL_OUTPUT',
   createdAt:new Date().toISOString()};
  await put(folder+'/plan.json',plan);
 }
 const actual=await checked(target);
 if(actual.sha256===UI_ADOPTION.original.sha256&&actual.bytes===UI_ADOPTION.original.bytes){
  const oldStat=await lstat(target);const retainedInode=await lstat(inOut(folder+'/original-inodes/'+String(oldStat.dev)+'-'+String(oldStat.ino)+'.html'));
  need(retainedInode.dev===oldStat.dev&&retainedInode.ino===oldStat.ino,'The actual target inode has no retained original history');
  const temporary=path.join(path.dirname(target),'.bidder-desk-'+UI_ADOPTION.selected.sha256+'.adoption.partial');
  try{
   if(!await exists(temporary))await link(newPath,temporary);else await checked(temporary,UI_ADOPTION.selected);
   const last=await lstat(target);need(last.dev===oldStat.dev&&last.ino===oldStat.ino,'Original UI target changed before replacement');
   await checked(target,UI_ADOPTION.original);await rename(temporary,target);await syncDirectory(path.dirname(target));
  }finally{await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 }
 await checked(target,UI_ADOPTION.selected);await validateUiAdoption();
 const complete={schema:SCHEMA+'.source-adoption-complete',operationId:OPERATION,inputSha256:FI,plan:await descriptor(folder+'/plan.json'),applicationPath:UI_ADOPTION.path,selected:UI_ADOPTION.selected};
 await put(folder+'/complete.json',complete);applicationAdoption=plan;return plan;
}

async function sourceClosure(){
 need(fixture.schema==='commons.canadabuys.bidder-desk-receiving-input.v1'&&fixture.operationId===OPERATION,'Wrong complete receiving fixture');
 await writeExact(inOut('receiving-input.json'),FIXTURE_BYTES);
 let uiVersions=null;
 for(const [root,destination,files] of [[SUPPLIED_APP,APP,fixture.originalApplication.files],[SUPPLIED_LEGACY,LEGACY,fixture.originalApplication.legacyFiles]]){
  for(const member of files){
   relative(member.path);
   if(destination===APP&&member.path===UI_ADOPTION.path){
    need(member.bytes===UI_ADOPTION.original.bytes&&member.sha256===UI_ADOPTION.original.sha256,'Original fixture UI identity differs');
    uiVersions=exactUiVersions(await checked(path.join(root,member.path)));
    const target=path.join(destination,member.path);
    if(!await exists(target))await writeExact(target,uiVersions.original);
    else{const current=await checked(target);exactUiVersions(current);}
   }else{const raw=await checked(path.join(root,member.path),member);await writeExact(path.join(destination,member.path),raw.data);}
  }
 }
 need(uiVersions,'The complete original application has no reviewed operator page');
 const self=await checked(SELF);await writeExact(inOut('receiving-source/'+self.sha256+'.mjs'),self.data);
 const binding=await retained('source-binding.json',()=>({schema:SCHEMA,operationId:OPERATION,inputSha256:FI,application:fixture.originalApplication,createdAt:new Date().toISOString()}));
 need(binding.inputSha256===FI&&same(binding.application,fixture.originalApplication),'Original application binding changed');
 await adoptOriginalUi(uiVersions);
 let observer={namespacePid:process.pid};
 try{const raw=await readFile('/proc/self/stat','utf8'),i=raw.lastIndexOf(')'),f=raw.slice(i+2).split(/\s+/);observer={...observer,hostPid:Number(raw.slice(0,raw.indexOf('(')).trim()),startTicks:f[19],bootId:(await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim(),pidNamespace:await readlink('/proc/self/ns/pid')};}catch(e){observer={...observer,procfsObservation:brief(e)};}
 await put(ATTEMPT+'/attempt.json',{schema:SCHEMA,operationId:OPERATION,inputSha256:FI,runner:{bytes:self.bytes,sha256:self.sha256},observer,argv:process.argv,startedAt:new Date().toISOString()});
 for(const [name,capture] of Object.entries(fixture.captures)){
  need(sha(Buffer.from(capture.rawText))===capture.projection.sha256&&Buffer.byteLength(capture.rawText)===capture.projection.bytes&&sha(canonical(capture.row))===capture.rowSha256,'Original capture identity differs',name);
  await putBytes('input/'+name+'.csv',Buffer.from(capture.rawText));
 }
 for(const [name,doc] of Object.entries(fixture.documents))need(sha(doc.content)===doc.sha256&&Buffer.byteLength(doc.content)===doc.bytes,'Generated document identity differs',name);
 Core=await import(pathToFileURL(path.join(APP,'core.mjs')));
 ({CanadaBuysClient:Client}=await import(pathToFileURL(path.join(APP,'client.mjs'))));
 ({CanadaBuysWorkspace:Workspace}=await import(pathToFileURL(path.join(APP,'workspace.mjs'))));
 need(Core.canonical(fixture.captures.tender.row)===canonical(fixture.captures.tender.row),'Receiving canonical serialization differs from original core');
 return binding;
}
async function importCapture(client,name){
 const capture=fixture.captures[name],sourceId='source-'+sha(capture.stream+'\n'+capture.projection.sha256);
 const request=await retained('imports/'+name+'.request.json',async()=>({schema:SCHEMA,name,sourceId,rawText:capture.rawText,meta:capture.meta,expectedRevision:(await client.workspace()).workspace.revision}));
 const view=await client.workspace();
 if(!view.sources.some(s=>s.id===sourceId))await client.importCsv(request.rawText,{...request.meta,expectedRevision:request.expectedRevision});
 const source=await client.source(sourceId);need(source.rawText===capture.rawText&&source.sha256===capture.projection.sha256&&source.rowCount===1,'Original row projection changed during import',name);
 const entry=await client.entry(source.entryIds[0]);need(same(entry.row,capture.row)&&entry.rowSha256===capture.rowSha256,'Original full row differs after import',name);
 return {sourceId,entry,source};
}
async function legacyIntake(){
 const capture=fixture.captures.tender;
 const {CanadaBuysWorkspace:OriginalV1}=await import(pathToFileURL(path.join(LEGACY,'workspace.mjs')));
 const old=new OriginalV1(WORKSPACE,{operator:'Original v1 receiving operator',title:'CanadaBuys saved bidder desk — original workspace'});
 try{
  const sourceId='source-'+sha(capture.stream+'\n'+capture.projection.sha256);
  if(!old.view().sources.some(s=>s.id===sourceId))old.importCsv(capture.rawText,capture.meta,old.metadata().revision);
  const source=old.getSource(sourceId),entry=old.getEntry(source.entryIds[0]);
  need(same(entry.row,capture.row)&&entry.rowSha256===capture.rowSha256,'Original v1 row intake changed bytes');
  const notice=old.getNotice(entry.noticeId);
  const wanted={shortlisted:true,owner:'Original v1 operator',note:'Retained before bidder-desk migration. No bid or supplier qualification is asserted.',nextAction:'Review exact original solicitation documents',disposition:'reviewing'};
  if(notice.review.revision===0)old.updateReview(notice.id,{expectedRevision:0,...wanted});
  const reviewed=old.getNotice(notice.id);
  need(Object.entries(wanted).every(([k,v])=>same(reviewed.review[k],v)),'Original v1 review differs');
  const pkg=await retained('packages/legacy-v1.json',()=>old.exportPackage({scope:'all'}));
  need(pkg.schema==='starforge.canadabuys.package.v1'&&pkg.workspace.id===old.metadata().id,'Original v1 package differs');
  return {workspace:old.metadata(),noticeId:entry.noticeId,sourceId,entryId:entry.id,review:reviewed.review,package:await descriptor('packages/legacy-v1.json')};
 }finally{old.close();}
}


const idFor=(kind,name)=>{
 const hex=sha(OPERATION+'\n'+kind+'\n'+name);
 return kind+'-'+hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);
};
const command=name=>OPERATION+':'+safeName(name);
const recordAt=(client,kind,id,revision)=>client.bidderRecord(kind,id,{revision,history:false});
async function currentRevision(client=mainServer.client){return (await client.workspace()).workspace.revision;}
async function savedRecord(kind,id,revision,client=mainServer.client){const value=await recordAt(client,kind,id,revision);need(value.id===id&&value.revision===revision,'Saved historical record identity differs');return value;}
async function createRecord(name,kind,input,{loseResponse=false,client=mainServer.client}={}){
 return action(name,async()=>({method:'bidderCreate',args:[kind,{...input,id:input.id||idFor(kind,name),commandId:command(name)},await currentRevision(client)]}),{loseResponse,client});
}
async function updateRecord(name,kind,id,patch,{client=mainServer.client}={}){
 return action(name,async()=>({method:'bidderUpdate',args:[kind,id,{expectedRevision:(await client.bidderRecord(kind,id)).revision,...patch,commandId:command(name)}]}),{client});
}
async function allRecords(client,kind){
 const records=[];let offset=0;const offsets=[];
 for(;;){
  need(!offsets.includes(offset),'Bidder pagination repeats an offset');offsets.push(offset);
  const page=await client.bidderList(kind,{offset,limit:2});need(page.kind===kind&&Array.isArray(page.records),'Bidder list shape differs');
  records.push(...page.records);if(page.page.nextOffset===null){need(records.length===page.page.total,'Bidder pagination lost a record');break;}offset=page.page.nextOffset;
 }
 return {records,offsets};
}
async function selection(client,noticeId,profileId){
 const [notice,profile]=await Promise.all([client.notice(noticeId),client.bidderRecord('profile',profileId)]);
 return {noticeId,sourceEntryId:notice.currentEntry.id,profileId,profileRevision:profile.revision};
}
async function packageFile(name,client,options){
 const rel='packages/'+safeName(name)+'.json',old=await optional(rel);
 if(old)return old;
 const pkg=await client.exportPackage(options);const {packageId,...body}=pkg;
 need(packageId===sha(canonical(body)),'Original package body does not match its identity');await put(rel,pkg);return pkg;
}
function graphRecord(pkg,kind,id,revision){
 const group=pkg.bidderDesk.records.find(g=>g.kind===kind&&g.id===id);
 need(group,'Saved graph record is missing',{kind,id});
 const record=group.editions[(revision||group.headRevision)-1];
 need(record&&record.id===id,'Saved graph edition is missing');return record;
}
async function receive(client,name,pkg){
 const rel='receives/'+safeName(name)+'.json',old=await optional(rel);if(old)return old.value;
 const request=await retained('receives/'+name+'.request.json',async()=>({schema:SCHEMA,packageId:pkg.packageId,expectedRevision:await currentRevision(client)}));
 need(request.packageId===pkg.packageId,'Receiving request selected another package');
 const value=await client.receivePackage(pkg,request.expectedRevision);
 await put(rel,{schema:SCHEMA,packageId:pkg.packageId,value});return value;
}
async function browserOpen(){
 if(browser)return;
 const selected=await realpath(arg.playwright),stat=await lstat(selected);
 let playwright;
 if(stat.isDirectory())playwright=createRequire(import.meta.url)(selected);
 else if(selected.endsWith('.mjs'))playwright=await import(pathToFileURL(selected));
 else {try{playwright=createRequire(import.meta.url)(selected);}catch(e){if(e.code!=='ERR_REQUIRE_ESM')throw e;playwright=await import(pathToFileURL(selected));}}
 const chromium=playwright.chromium||playwright.default?.chromium;need(chromium&&typeof chromium.launch==='function','Caller selected module has no actual Playwright Chromium');
 const executable=await realpath(arg.chromium);need((await lstat(executable)).isFile(),'Caller selected Chromium executable is not a file');
 browser=await chromium.launch({executablePath:executable,headless:true,args:['--disable-dev-shm-usage','--no-sandbox'],chromiumSandbox:false});
 browserContext=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,acceptDownloads:true});
 await browserContext.route('**/*',async route=>{
  const url=new URL(route.request().url());
  const origins=[mainServer?.origin,coldServer?.origin].filter(Boolean);
  if(!origins.includes(url.origin)){browserErrors.push({kind:'NETWORK_OUTSIDE_RECEIVING',url:url.href});await route.abort('blockedbyclient');return;}
  await route.continue();
 });
 await put(ATTEMPT+'/browser-runtime.json',{module:selected,executable,browserVersion:browser.version(),headless:true,at:new Date().toISOString()});
}
async function uiReady(){
 await page.waitForFunction(()=>!document.querySelector('#refresh').disabled&&
  !document.querySelector('#workspace-label').textContent.toLowerCase().includes('opening')&&
  document.querySelector('#workspace-label').textContent.includes('revision'),null,{timeout:30000});
}
async function openUi(server,noticeId,profileId){
 await browserOpen();if(page){await page.close();page=null;}
 page=await browserContext.newPage();page.setDefaultTimeout(20000);
 page.on('pageerror',error=>pageErrors.push({message:error.message,at:new Date().toISOString()}));
 page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('favicon'))browserErrors.push({kind:'CONSOLE',message:message.text()});});
 page.on('dialog',dialog=>{dialogs.push({type:dialog.type(),message:dialog.message()});dialog.accept().catch(()=>{});});
 await page.goto(server.origin+'/bidder-desk',{waitUntil:'domcontentloaded'});await uiReady();
 if(noticeId){await page.selectOption('#notice-select',noticeId);await uiReady();}
 if(profileId){await page.selectOption('#profile-select',profileId);await uiReady();}
 return page;
}
async function openUiRecord(kind,id){
 await page.click('[data-tab="'+kind+'"]');
 if(kind==='profile'){await page.selectOption('#profile-select',id);await uiReady();await page.click('[data-tab="profile"]');}
 else{await page.click('[data-open-kind="'+kind+'"][data-open-id="'+id+'"]');await uiReady();}
 await page.waitForFunction(k=>document.getElementById(k+'-revision').textContent.includes('Saved revision'),kind);
}
async function boundedUi(promise,milliseconds,label){
 let timer;
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>{const error=new Error(label);error.code='UI_RECEIVING_TIMEOUT';reject(error);},milliseconds);})]);}
 finally{clearTimeout(timer);}
}
async function uiFormObservation(kind){
 const selectedPage=page;
 if(!selectedPage||selectedPage.isClosed())return {closed:true};
 return boundedUi(selectedPage.evaluate(kind=>{
  const form=document.getElementById(kind+'-form'),status=document.querySelector('#status')||document.querySelector('.status');
  return {url:location.href,title:document.title,status:status?{text:status.textContent,error:status.dataset.error==='true'}:null,
   revision:document.getElementById(kind+'-revision')?.textContent||null,
   workspace:document.getElementById('workspace-label')?.textContent||null,
   form:form?{id:form.id,hidden:form.closest('section')?.hidden||false,
    controls:[...form.querySelectorAll('input,select,textarea,button')].map(el=>({
     id:el.id||null,name:el.name||null,type:el.type||el.tagName.toLowerCase(),disabled:el.disabled,
     value:el.type==='file'?null:el.value,checked:typeof el.checked==='boolean'?el.checked:null,
     files:el.type==='file'?[...el.files].map(file=>({name:file.name,bytes:file.size,type:file.type})):null,
     selectedValues:el.tagName==='SELECT'?[...el.selectedOptions].map(option=>option.value):null,
     willValidate:Boolean(el.willValidate),valid:el.validity?el.validity.valid:null,validationMessage:el.validationMessage||null
    }))}:null};
 },kind),5000,'The actual browser form observation did not return');
}
async function uiMutation(name,kind,fill,{id=null,hold=false,client=mainServer.client}={}){
 const base='ui-actions/'+safeName(name),prior=await optional(base+'/request.json');
 if(prior){
  need(prior.operationId===OPERATION&&prior.inputSha256===FI,'Original browser request binding differs');
  const result=await client.request(prior.pathname,{method:prior.method,body:prior.body});
  need(result.alreadyApplied===true||!await optional(base+'/result.json'),'A previously returned browser command was not replayed');
  const before=await optional(base+'/result.json');
  if(before)need(same(before.value.record,result.record),'Original browser result changed');
  else await put(base+'/result.json',{schema:SCHEMA,value:result});
  await put(ATTEMPT+'/reopened-ui-'+name+'.json',{schema:SCHEMA,originalRequest:base+'/request.json',recordId:result.record.id,revision:result.record.revision,alreadyApplied:result.alreadyApplied===true});
  return result;
 }
 let resolveDone,rejectDone,resolveHeld,rejectHeld,resolveSubmitted,rejectSubmitted,release;
 const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});done.catch(()=>{});
 const held=new Promise((resolve,reject)=>{resolveHeld=resolve;rejectHeld=reject;});held.catch(()=>{});
 const submitted=new Promise((resolve,reject)=>{resolveSubmitted=resolve;rejectSubmitted=reject;});submitted.catch(()=>{});
 const gate=new Promise(resolve=>{release=resolve;});
 const pathname='/api/bidder/records/'+kind+(id?'/'+encodeURIComponent(id):''),method=id?'PATCH':'POST';
 const pattern='**'+pathname,ownedPage=page,ownedTasks=new Set(),openRoutes=new Set();
 let handled=false,dispatched=false,result,originalError=null;
 const handler=async route=>{
  if(route.request().method()!==method){await route.continue();return;}
  openRoutes.add(route);
  const task=(async()=>{
   let fulfilled=false;
   try{
    need(!handled,'The browser submitted the same receiving form twice');handled=true;
    const body=route.request().postDataJSON();need(typeof body.commandId==='string'&&Number.isSafeInteger(body.expectedRevision),'Browser did not bind its original command/revision');
    const request={schema:SCHEMA,operationId:OPERATION,inputSha256:FI,name,pathname,method,body};
    await put(base+'/request.json',request);resolveSubmitted(request);
    dispatched=true;
    const response=await route.fetch({maxRetries:0,timeout:30000});
    const raw=await boundedUi(response.body(),15000,'The original browser response body did not finish');
    const responseFile=await putBytes(base+'/response.bin',raw);
    await put(base+'/response.json',{schema:SCHEMA,status:response.status(),headers:response.headers(),body:responseFile});
    const value=JSON.parse(raw.toString('utf8'));need(response.ok()&&value.record,'Original browser write failed',{status:response.status(),value});
    resolveHeld(value);
    if(hold)await boundedUi(gate,10000,'The receiving response gate was not released');
    await boundedUi(route.fulfill({response,body:raw}),10000,'The actual browser did not accept its original response');fulfilled=true;
    await put(base+'/result.json',{schema:SCHEMA,value});resolveDone(value);
   }catch(error){
    rejectSubmitted(error);rejectHeld(error);rejectDone(error);
    if(!fulfilled)await boundedUi(route.abort('failed'),3000,'The failed original browser route did not abort').catch(()=>{});
   }finally{openRoutes.delete(route);}
  })();
  routeTasks.add(task);ownedTasks.add(task);
  try{await task;}finally{routeTasks.delete(task);ownedTasks.delete(task);}
 };
 await ownedPage.route(pattern,handler);
 try{
  await fill();
  const observed=await uiFormObservation(kind);
  await put(ATTEMPT+'/ui-'+name+'-before-submit.json',{schema:SCHEMA,operationId:OPERATION,inputSha256:FI,name,pathname,method,observedAt:new Date().toISOString(),observed});
  need(observed.form&&!observed.form.hidden,'The selected original form is absent or hidden',observed);
  const invalid=observed.form.controls.filter(control=>control.willValidate&&control.valid===false);
  need(invalid.length===0,'The actual form refused submission during native validation',{name,invalid,status:observed.status});
  await ownedPage.locator('#'+kind+'-form button[type="submit"]').click();
  await boundedUi(submitted,10000,'The actual '+kind+' form did not publish its original '+method+' request');
  if(hold){
   const value=await boundedUi(held,45000,'The original held browser response did not return');
   const locked=await ownedPage.locator('#'+kind+'-form input, #'+kind+'-form select, #'+kind+'-form textarea').evaluateAll(nodes=>nodes.length>0&&nodes.every(node=>node.disabled));
   need(locked,'The actual pending save left editable form controls enabled');
   await put(base+'/pending-controls.json',{schema:SCHEMA,recordId:value.record.id,revision:value.record.revision,allFormControlsDisabled:true});
   release();
  }
  result=await boundedUi(done,60000,'The original browser mutation did not finish');
  await ownedPage.waitForFunction(({kind,revision})=>{
   const label=document.getElementById(kind+'-revision').textContent;
   return label.includes('Saved revision '+revision)&&!document.querySelector('#refresh').disabled;
  },{kind,revision:result.record.revision},{timeout:30000});
 }catch(error){
  originalError=error;
  let observed;try{observed=await uiFormObservation(kind);}catch(e){observed={observationError:brief(e)};}
  const diagnostic={schema:SCHEMA,operationId:OPERATION,inputSha256:FI,name,pathname,method,handled,dispatched,originalRequest:handled?base+'/request.json':null,
   observedAt:new Date().toISOString(),error:brief(error),observed,pageErrors:[...pageErrors],browserErrors:[...browserErrors],dialogs:[...dialogs]};
  try{const file=await put(ATTEMPT+'/ui-'+name+'-failure.json',diagnostic);error.detail={...error.detail,diagnostic:file,handled,dispatched,status:observed.status??null};}
  catch(e){error.diagnosticError=brief(e);}
 }finally{
  release();
  let cleanupError=null;
  try{await boundedUi(Promise.allSettled([...ownedTasks]),5000,'The original browser route did not drain');}
  catch(error){
   cleanupError=error;
   await Promise.allSettled([...openRoutes].map(route=>boundedUi(route.abort('failed'),3000,'The original route abort did not finish')));
   if(!ownedPage.isClosed()){
    try{await boundedUi(ownedPage.close(),5000,'The owned browser page did not close');if(page===ownedPage)page=null;}
    catch(e){cleanupError=Object.assign(error,{detail:{close:brief(e)}});}
   }
   try{await boundedUi(Promise.allSettled([...ownedTasks]),5000,'The closed browser route is still unresolved');cleanupError=null;}catch(e){cleanupError=e;}
  }
  try{if(!ownedPage.isClosed())await boundedUi(ownedPage.unroute(pattern,handler),5000,'The original browser handler did not detach');}
  catch(e){cleanupError=cleanupError||e;}
  if(cleanupError){if(originalError)originalError.cleanup=[...(originalError.cleanup||[]),{name:'ui-'+name+'-route',error:brief(cleanupError)}];else originalError=cleanupError;}
 }
 if(originalError)throw originalError;
 return result;
}
async function screenshot(name,{kind,id,revision,viewport={width:1440,height:1000}}={}){
 const final='screenshots/'+safeName(name)+'.json',old=await optional(final);
 if(old){await checked(inOut(old.image.path),old.image);return old;}
 await page.setViewportSize(viewport);await page.locator('body').waitFor({state:'visible'});
 const captureName=name+'-'+attemptId;
 const plan={schema:SCHEMA,operationId:OPERATION,inputSha256:FI,name,url:page.url(),kind:kind||null,id:id||null,revision:revision||null,viewport,capturedAt:new Date().toISOString()};
 await put('screenshots/'+captureName+'.plan.json',plan);
 const pixels=await page.screenshot({type:'png',fullPage:true,animations:'disabled'});
 const identity={path:'screenshots/'+captureName+'.png',bytes:pixels.length,sha256:sha(pixels)};
 await put('screenshots/'+captureName+'.identity.json',{...plan,image:identity});
 await putBytes(identity.path,pixels);
 const value={...plan,image:identity,independentVisualInspection:'PENDING'};await put(final,value);return value;
}
async function actualReportDownload(name,format,decision,client=mainServer.client){
 const rel='downloads/'+safeName(name)+'.'+format,receiptRel=rel+'.json';
 const old=await optional(receiptRel);if(old){await checked(inOut(rel),old.file);return old;}
 const expected=await client.bidderReport(decision.id,{revision:decision.revision,format});
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:20000}),
  page.locator('#decision-reports a[href*="format='+format+'"]').click()]);
 const stream=await download.createReadStream();need(stream,'Actual browser download is absent');
 const parts=[];let bytes=0;for await(const chunk of stream){bytes+=chunk.length;need(bytes<32*1024*1024,'Actual report download exceeds receiving bound');parts.push(chunk);}
 const raw=Buffer.concat(parts);need(raw.equals(Buffer.from(expected.body)),'Browser downloaded a different saved report');
 const file=await putBytes(rel,raw),value={schema:SCHEMA,decisionId:decision.id,revision:decision.revision,format,file,suggestedFilename:download.suggestedFilename(),completeBrowserDownload:true};
 await put(receiptRel,value);return value;
}


async function journey(){
 const legacy=await phase('01-original-v1-intake',legacyIntake);
 mainServer=await startServer(WORKSPACE,APP,'original');
 const client=mainServer.client,noticeId=legacy.noticeId;
 await phase('02-native-v2-migration',async()=>{
  const view=await client.workspace(),notice=await client.notice(noticeId),source=await client.source(legacy.sourceId);
  need(view.workspace.schema==='starforge.canadabuys.workspace.v2'&&view.workspace.id===legacy.workspace.id&&view.workspace.createdAt===legacy.workspace.createdAt,'V1 migration changed the original workspace identity');
  need(view.workspace.revision===legacy.workspace.revision+1,'V1 migration did not append one revision');
  need(same(notice.review,legacy.review)&&source.rawText===fixture.captures.tender.rawText,'V1 migration changed original source or review');
  return {workspace:view.workspace,originalReview:notice.review,sourceId:source.id};
 });
 const award=await phase('03-original-award-http-intake',()=>importCapture(client,'award'));
 const profileCreated=await phase('04-original-command-response-loss',async()=>{
  const result=await createRecord('profile-original','profile',fixture.profile,{loseResponse:true});
  need(result.record.revision===1,'Lost create response caused a new profile edition');
  const repeated=await replay('profile-original');
  const history=await client.bidderRecord('profile',result.record.id,{history:true});
  need(history.history.length===1&&same(history.history[0],result.record),'Original profile creation duplicated after retry');
  const request=await optional('actions/profile-original/request.json');
  await expectedFailure('changed-command-refused',()=>client.bidderCreate('profile',{...request.args[1],label:'Different input under original command'},request.args[2]),['COMMAND_ID_REUSED']);
  return {record:result.record,lostResponse:await descriptor('actions/profile-original/lost-response.json'),replay:repeated.alreadyApplied};
 });
 const profileId=profileCreated.record.id;
 const documents=await phase('05-evidence-bodies-and-unresolved-link',async()=>{
  const at=new Date().toISOString(),make=(doc,title,kind,version)=>({noticeId,title,kind,version,sourceUrl:'',localOrigin:title,language:'en',
   bodyBase64:Buffer.from(doc.content).toString('base64'),sha256:doc.sha256,bytes:doc.bytes,accessState:'CAPTURED',
   review:{state:'REVIEWED',reviewedBy:'Receiving example reviewer',reviewedAt:at,note:'Reviewed generated receiving text only; no official requirement or supplier claim.'},
   notes:'Generated local receiving document. Original CanadaBuys source rows are separate and unchanged.'});
  const clause=(await createRecord('original-clause','evidence',make(fixture.documents.clauseV1,'Generated clause R-1.txt','ANNEX','1'))).record;
  const supplier=(await createRecord('original-supplier','evidence',{...make(fixture.documents.supplierV1,'Fictional supplier record.txt','SUPPLIER','1'),noticeId:null})).record;
  const linkOnly=(await createRecord('original-unreviewed-listing','evidence',{noticeId,title:'Original CanadaBuys listing — attachment clauses unreviewed',kind:'SOLICITATION',sourceUrl:fixture.captures.tender.meta.url,accessState:'LINK_ONLY',notes:'The captured source listing does not establish the complete solicitation attachments or mandatory clauses.'})).record;
  for(const [record,doc] of [[clause,fixture.documents.clauseV1],[supplier,fixture.documents.supplierV1]]){
   const actual=await client.bidderEvidence(record.id,{revision:1});
   need(Buffer.from(actual.body).equals(Buffer.from(doc.content)),'Downloaded original evidence body differs');
   await putBytes('evidence/original-'+record.id+'.txt',Buffer.from(actual.body));
  }
  need(linkOnly.sha256===null&&linkOnly.bytes===null&&linkOnly.review.state==='UNREVIEWED','Uncaptured evidence gained a body or review');
  const profile=(await updateRecord('profile-evidence-link','profile',profileId,{evidenceIds:[supplier.id],commercial:{note:'Supplier evidence linked; original thresholds retained.'}})).record;
  need(profile.commercial.minimumContractValue===fixture.profile.commercial.minimumContractValue&&profile.commercial.maximumContractValue===fixture.profile.commercial.maximumContractValue&&profile.capacity.minimumLeadDays===14,'Partial nested profile update lost original values');
  return {clause,supplier,linkOnly,profile};
 });
 const requirements=await phase('06-explicit-requirement-revisions',async()=>{
  const mandatory=(await createRecord('original-mandatory','requirement',{noticeId,kind:'MANDATORY',applicability:'APPLIES',
   requirementText:'GENERATED RECEIVING CLAUSE R-1: identify a project lead with a dated project record.',
   sourceEvidence:[{evidenceId:documents.clause.id,revision:1,sha256:documents.clause.sha256,pageOrSection:'R-1',quote:'The example bidder must identify an experienced construction project lead and retain a dated project record.',note:'Generated clause only.'}],
   supplierEvidence:[{evidenceId:documents.supplier.id,revision:1,sha256:documents.supplier.sha256,pageOrSection:'Illustrative project record',quote:'Lead: Example Lead.',note:'Fictional supplier evidence only.'}],
   assessment:'MET',reviewedBy:'Receiving example reviewer',reviewedAt:new Date().toISOString(),owner:'Example bid coordinator',notes:'This resolved example does not assert that the real solicitation requirement inventory is complete.'})).record;
  const unresolved=(await createRecord('original-unknown-requirement','requirement',{noticeId,kind:'UNKNOWN',applicability:'UNKNOWN',
   requirementText:'Review the exact current solicitation attachments and amendments before identifying all mandatory requirements.',
   sourceEvidence:[{evidenceId:documents.linkOnly.id,revision:1,sha256:null,pageOrSection:'Original source listing',quote:'',note:'No attachment bytes have been captured.'}],
   supplierEvidence:[],assessment:'UNKNOWN',clarificationQuestion:'Which exact attachment revisions govern the opportunity?',owner:'Example bid coordinator'})).record;
  need(mandatory.sourceEvidence[0].revision===1&&mandatory.supplierEvidence[0].revision===1,'Original requirement did not retain exact evidence editions');
  need(unresolved.sourceEvidence[0].sha256===undefined,'An unresolved document reference invented a digest');
  const assessed=await client.bidderAssess(await selection(client,noticeId,profileId));
  need(assessed.contextSha256===sha(canonical(assessed.context)),'Assessment did not bind its complete context');
  need(assessed.assessment.deadline.utc===fixture.expected.originalTenderClosingUtc,'The fixed UTC-05:00 deadline changed');
  need(assessed.assessment.mandatoryReview.eligibility==='NOT_DETERMINED'&&assessed.assessment.mandatoryReview.automaticDecision===null,'Capability fit claimed an automatic compliance or bid decision');
  need(assessed.assessment.unknowns.some(x=>x.dimension==='classification')&&assessed.assessment.unknowns.some(x=>x.dimension==='delivery-region'),'Blank or literal-star classifications/regions were treated as established matches');
  const {assessCapabilityFit}=await import(pathToFileURL(path.join(APP,'bidder-desk-domain.mjs')));
  const historical=assessCapabilityFit({entry:award.entry,profile:documents.profile,now:Date.now()});
  need(historical.overall==='HISTORICAL_CONTEXT'&&award.entry.row['contractAmount-montantContrat']==='0.00'&&award.entry.row['totalContractValue-valeurTotaleContrat']==='750000.00'&&award.entry.row.unspsc==='*10100000','Award amount, cumulative value or source code was collapsed');
  await put('observations/original-assessment.json',assessed);await put('observations/award-context.json',historical);
  return {mandatory,unresolved,assessment:assessed};
 });
 const browserRecords=await phase('07-actual-operator-record-saves',async()=>{
  await openUi(mainServer,noticeId,profileId);
  const profile=await uiMutation('profile-description','profile',async()=>{
   await openUiRecord('profile',profileId);await page.fill('#p-description',fixture.profile.description+'\nEdited and saved in the actual operator page.');
  },{id:profileId,hold:true});
  need(profile.record.commercial.maximumBidCost==='2500.00'&&profile.record.evidenceIds.includes(documents.supplier.id),'Actual profile form discarded original evidence or commercial fields');
  const note=await uiMutation('operator-evidence-note','evidence',async()=>{
   await page.click('[data-tab="evidence"]');await page.click('#evidence-new');await uiReady();
   await page.selectOption('#e-kind','OTHER');
   await page.setInputFiles('#e-file',{name:'generated-operator-review-note.txt',mimeType:'text/plain',buffer:Buffer.from(fixture.documents.browserNote.content)});
   await page.fill('#e-title','Generated operator review note');await page.fill('#e-notes','Saved through the original file input. No source attachment or real qualification is asserted.');
  });
  need(note.record.sha256===fixture.documents.browserNote.sha256&&note.record.review.state==='UNREVIEWED','Actual evidence file input changed bytes or silently marked them reviewed');
  const unresolved=await uiMutation('operator-clarification','requirement',async()=>{
   await openUiRecord('requirement',requirements.unresolved.id);
   await page.fill('#r-question','Obtain the exact current solicitation attachments and confirm their revision identifiers.');
  },{id:requirements.unresolved.id});
  need(unresolved.record.assessment==='UNKNOWN'&&unresolved.record.sourceEvidence[0].revision===1,'Operator clarification silently resolved an unknown requirement');
  await page.click('[data-tab="notice"]');
  const shot=await screenshot('01-original-opportunity',{kind:'notice',id:noticeId,revision:legacy.review.revision});
  return {profile:profile.record,note:note.record,unresolved:unresolved.record,screenshot:shot};
 });
 const baseline=await phase('08-reviewed-decision-and-all-four-choices',async()=>{
  await openUi(mainServer,noticeId,profileId);
  const result=await uiMutation('original-investigate-decision','decision',async()=>{
   await page.click('[data-tab="decision"]');await page.click('#decision-new');await uiReady();
   await page.selectOption('#d-choice','INVESTIGATE');
   await page.fill('#d-rationale','GENERATED RECEIVING DECISION: investigate exact solicitation documents; the captured listing and example supplier evidence are insufficient for a real bid.');
   await page.fill('#d-owner','Example bid coordinator');await page.fill('#d-reviewer','Receiving example reviewer');
   await page.fill('#d-unknowns','Exact governing attachment revisions\nComplete mandatory requirement inventory');
   await page.fill('#d-conditions','Receiving example only. No bid is submitted and no real qualification is asserted.');
   await page.click('#decision-assess');await uiReady();
   await page.waitForFunction(()=>/^[a-f0-9]{64}$/.test(document.querySelector('#decision-form').dataset.contextSha256||''));
  });
  const decision=result.record;need(decision.choice==='INVESTIGATE'&&decision.context.entry.rowSha256===fixture.captures.tender.rowSha256&&decision.contextSha256===sha(canonical(decision.context)),'Original operator decision context was not frozen');
  need(decision.context.requirements.find(x=>x.id===requirements.mandatory.id).assessment==='MET','Original explicit requirement assessment was not frozen');
  const alternatives=[];
  for(const choice of ['BID','NO_BID','PARK']){
   const assessed=await retained('observations/alternative-'+choice+'-context.json',()=>client.bidderAssess({noticeId,sourceEntryId:decision.sourceEntryId,profileId,profileRevision:decision.profileRevision}));
   const record=(await createRecord('alternative-'+choice.toLowerCase(),'decision',{noticeId,sourceEntryId:decision.sourceEntryId,profileId,profileRevision:decision.profileRevision,contextSha256:assessed.contextSha256,
    choice,rationale:'GENERATED RECEIVING ALTERNATIVE '+choice+': a separate illustrative saved choice, not an actual procurement instruction.',reviewedBy:'Receiving example reviewer',owner:'Example bid coordinator',
    unknowns:['Original attachments remain unreviewed'],conditions:'Illustrative record only; no submission or real supplier eligibility claim.',nextActions:[]})).record;
   alternatives.push({id:record.id,choice:record.choice,revision:record.revision});
  }
  await openUi(mainServer,noticeId,profileId);await openUiRecord('decision',decision.id);
  const shot=await screenshot('02-saved-original-decision',{kind:'decision',id:decision.id,revision:decision.revision});
  const pkg=await packageFile('selected-before-changes',client,{scope:'selected',noticeIds:[noticeId]});
  need(new Set([decision.choice,...alternatives.map(x=>x.choice)]).size===4,'The four original saved choices did not round-trip');
  return {decision,alternatives,screenshot:shot,packageId:pkg.packageId};
 });
 const changed=await phase('09-document-change-and-stale-context',async()=>{
  const updated=(await updateRecord('clause-changed','evidence',documents.clause.id,{bodyBase64:Buffer.from(fixture.documents.clauseV2.content).toString('base64'),version:'2',notes:'Generated changed clause; original document revision remains retained.'})).record;
  need(updated.sha256===fixture.documents.clauseV2.sha256&&updated.review.state==='UNREVIEWED'&&!updated.review.reviewedAt,'Changed evidence inherited a previous review');
  const original=await client.bidderEvidence(documents.clause.id,{revision:1});
  need(Buffer.from(original.body).equals(Buffer.from(fixture.documents.clauseV1.content)),'Changed evidence overwrote the original bytes');
  const comparison=await client.bidderComparison(baseline.decision.id);
  need(comparison.changes.requiresReassessment&&comparison.assessment.reviewIssues.some(x=>x.code==='DOCUMENT_CHANGED_SINCE_ASSESSMENT'),'Document revision change did not surface for reassessment');
  const contextEvidence=comparison.current.evidence.filter(x=>x.id===documents.clause.id);
  need(contextEvidence.some(x=>x.revision===1)&&contextEvidence.some(x=>x.revision===updated.revision),'Current comparison lost the original assessed evidence edition');
  const staleRequest=await retained('observations/stale-context-request.json',async()=>({expectedRevision:(await client.bidderRecord('decision',baseline.decision.id)).revision,commandId:command('stale-context'),
   ...await selection(client,noticeId,profileId),contextSha256:baseline.decision.contextSha256,choice:'BID',rationale:'This stale context must be refused',reviewedBy:'Receiving example reviewer'}));
  await expectedFailure('stale-decision-context-refused',()=>client.bidderUpdate('decision',baseline.decision.id,staleRequest),['DECISION_CONTEXT_REVIEW_REQUIRED']);
  await put('observations/document-context-comparison.json',comparison);
  return {document:updated,comparison};
 });
 const administrative=await phase('10-administrative-edit-keeps-review',async()=>{
  const result=(await updateRecord('decision-owner-only','decision',baseline.decision.id,{owner:'Example follow-up coordinator',nextActions:[{id:'action-original-documents',task:'Obtain and review governing attachments',owner:'Example follow-up coordinator',dueAt:null,status:'OPEN'}]})).record;
  for(const key of ['context','contextSha256','assessment','changes','reviewedBy','reviewedAt'])need(same(result[key],baseline.decision[key]),'Administrative edit silently reassessed '+key);
  need(result.revision===baseline.decision.revision+1,'Administrative edit did not append an edition');return result;
 });
 const amendment=await phase('11-generated-amendment-source-history',async()=>{
  const value=await importCapture(client,'generatedAmendment'),notice=await client.notice(noticeId);
  need(value.entry.noticeId===noticeId&&notice.currentEntry.id===value.entry.id,'Generated amendment did not retain original notice identity or become current');
  need(notice.history.some(e=>e.id===legacy.entryId),'Original source edition disappeared after amendment');
  const original=await client.entry(legacy.entryId);need(same(original.row,fixture.captures.tender.row),'Generated amendment changed the actual captured original row');
  const comparison=await client.bidderComparison(baseline.decision.id);
  need(comparison.changes.requiresReassessment&&comparison.current.entry.id===value.entry.id,'New source edition did not require review');
  await put('observations/amendment-comparison.json',comparison);
  return {sourceId:value.sourceId,entry:value.entry,comparison};
 });
 const renewed=await phase('12-explicit-requirement-reassessment',async()=>{
  const reset=(await updateRecord('requirement-new-clause-unreviewed','requirement',requirements.mandatory.id,{sourceEvidence:[{evidenceId:documents.clause.id,revision:changed.document.revision,sha256:changed.document.sha256,pageOrSection:'R-1, generated revision 2',quote:'The example bidder must identify an experienced construction project lead, a deputy, and retain dated project records.',note:'Generated clause changed.'}]})).record;
  need(reset.assessment==='UNREVIEWED'&&!reset.reviewedAt&&!reset.reviewedBy,'Changing the assessed clause silently retained MET');
  const doc=(await updateRecord('review-new-clause','evidence',documents.clause.id,{review:{state:'REVIEWED',reviewedBy:'Receiving example reviewer',reviewedAt:new Date().toISOString(),note:'Read the generated changed clause; original real attachments remain unreviewed.'}})).record;
  const assessed=(await updateRecord('requirement-reviewed-gap','requirement',requirements.mandatory.id,{sourceEvidence:[{evidenceId:doc.id,revision:doc.revision,sha256:doc.sha256,pageOrSection:'R-1, generated revision 2',quote:'The example bidder must identify an experienced construction project lead, a deputy, and retain dated project records.',note:'Generated receiving clause only.'}],
   assessment:'NOT_MET',applicability:'APPLIES',reviewedBy:'Receiving example reviewer',reviewedAt:new Date().toISOString(),notes:'The unchanged fictional supplier document identifies a lead but no deputy. This is an illustrative documented gap.'})).record;
  need(assessed.assessment==='NOT_MET'&&assessed.sourceEvidence[0].revision===doc.revision&&assessed.supplierEvidence[0].revision===1,'Explicit new assessment did not bind original supplier and current clause revisions');
  const first=await savedRecord('requirement',requirements.mandatory.id,1);
  need(first.assessment==='MET'&&first.sourceEvidence[0].revision===1,'New review overwrote the original assessment');return {document:doc,requirement:assessed,reset};
 });
 const reviewed=await phase('13-operator-current-context-and-reports',async()=>{
  await openUi(mainServer,noticeId,profileId);
  const result=await uiMutation('reviewed-no-bid','decision',async()=>{
   await openUiRecord('decision',baseline.decision.id);
   await page.click('#decision-current');await uiReady();
   await page.selectOption('#d-choice','NO_BID');
   await page.fill('#d-rationale','GENERATED RECEIVING DECISION: the changed example clause requires a deputy, and the retained fictional supplier evidence does not demonstrate one. The original current solicitation attachments are still unreviewed.');
   await page.fill('#d-reviewer','Receiving example reviewer');
   await page.fill('#d-conditions','Example decision only. No customer contact, procurement submission, or real supplier judgment.');
   await page.click('#decision-assess');await uiReady();
   await page.waitForFunction(()=>/^[a-f0-9]{64}$/.test(document.querySelector('#decision-form').dataset.contextSha256||''));
  },{id:baseline.decision.id});
  const record=result.record;
  need(record.choice==='NO_BID'&&record.sourceEntryId===amendment.entry.id&&record.contextSha256!==baseline.decision.contextSha256&&record.changes.requiresReassessment,'Explicit operator reassessment did not preserve changed context');
  need(record.context.requirements.find(x=>x.id===requirements.mandatory.id).assessment==='NOT_MET','Reassessed decision lost the documented gap');
  const reports={};
  for(const format of ['html','json','csv'])reports[format]=await actualReportDownload('reviewed-decision',format,record);
  const json=JSON.parse((await checked(inOut(reports.json.file.path))).data.toString('utf8'));
  need(json.decision.id===record.id&&same(json.context,record.context),'Full decision JSON did not retain the exact saved context');
  const html=(await checked(inOut(reports.html.file.path))).data.toString('utf8');
  need(html.includes('NO_BID')||html.includes('No Bid')||html.includes('No bid'),'HTML report omitted the saved choice');
  const shot=await screenshot('03-reviewed-decision',{kind:'decision',id:record.id,revision:record.revision});
  await page.click('#decision-history summary');
  await page.click('[data-history-kind="decision"][data-history-id="'+record.id+'"][data-history-revision="1"]');
  await page.locator('#record-dialog').waitFor({state:'visible'});
  const historical=await screenshot('04-original-decision-history',{kind:'decision',id:record.id,revision:1});
  await page.click('#dialog-close');
  const pkg=await packageFile('selected-final',client,{scope:'selected',noticeIds:[noticeId]});
  need(same(graphRecord(pkg,'decision',record.id,1),baseline.decision),'Selected package lost the original decision history');
  need(pkg.bidderDesk.bodies.some(x=>x.sha256===fixture.documents.clauseV1.sha256)&&pkg.bidderDesk.bodies.some(x=>x.sha256===fixture.documents.clauseV2.sha256),'Selected package omitted an original evidence body');
  return {record,reports,screenshot:shot,historicalScreenshot:historical,packageId:pkg.packageId};
 });
 const cold=await phase('14-cold-receive-and-original-command',async()=>{
  const coldApplication=inOut('cold-application');
  for(const member of selectedApplicationMembers()){const raw=await checked(path.join(APP,member.path),member);await writeExact(path.join(coldApplication,member.path),raw.data);}
  coldServer=await startServer(COLD,coldApplication,'cold');
  const before=(await coldServer.client.workspace()).workspace;
  const old=await optional('packages/legacy-v1.json');await receive(coldServer.client,'cold-original-v1',old);
  const pkg=await optional('packages/selected-final.json'),received=await receive(coldServer.client,'cold-selected-final',pkg);
  need(received.receiving.bidderDesk.status==='RECEIVED','Cold receiver did not accept the full selected decision graph');
  const after=(await coldServer.client.workspace()).workspace;
  need(after.id===before.id&&after.createdAt===before.createdAt&&after.id!==legacy.workspace.id,'Receiving replaced the target workspace identity');
  const replayed=await replay('profile-original',coldServer.client);
  need(replayed.record.id===profileId&&replayed.record.revision===1,'Cold receiver lost the original command response');
  for(const group of pkg.bidderDesk.records){
   const got=await coldServer.client.bidderRecord(group.kind,group.id,{history:true});
   need(got.revision===group.headRevision&&same(got.history,group.editions),'Cold receiver changed original complete record history',{kind:group.kind,id:group.id});
  }
  for(const [revision,doc] of [[1,fixture.documents.clauseV1],[changed.document.revision,fixture.documents.clauseV2]]){
   const body=await coldServer.client.bidderEvidence(documents.clause.id,{revision});
   need(Buffer.from(body.body).equals(Buffer.from(doc.content)),'Cold receiver changed original evidence bytes');
  }
  return {workspace:after,receiving:received.receiving,originalCommandReplayed:true};
 });
 if(!coldServer)coldServer=await startServer(COLD,inOut('cold-application'),'cold');
 const concurrent=await phase('15-receiving-preserves-later-work-and-conflicts',async()=>{
  const coldClient=coldServer.client;
  const local=(await updateRecord('cold-owner-follow-up','decision',reviewed.record.id,{owner:'Receiving colleague — local follow-up'},{client:coldClient})).record;
  need(same(local.context,reviewed.record.context)&&local.reviewedAt===reviewed.record.reviewedAt,'Cold administrative change altered reviewed content');
  const older=await optional('packages/selected-before-changes.json');
  const oldReceipt=await receive(coldClient,'cold-older-selected-first-receive',older);
  const kept=await coldClient.bidderRecord('decision',local.id);
  need(same(kept,local),'First receipt of an older selected package replaced newer local work');
  const origin=(await updateRecord('origin-concurrent-follow-up','decision',reviewed.record.id,{owner:'Original desk colleague — separate follow-up'})).record;
  need(origin.revision===local.revision&&!same(origin,local),'The concurrent original/local editions were not distinct');
  const conflictPackage=await packageFile('origin-concurrent-edition',client,{scope:'selected',noticeIds:[noticeId]});
  const conflict=await receive(coldClient,'cold-original-concurrent-edition',conflictPackage);
  need(conflict.receiving.bidderDesk.status==='REVIEW_REQUIRED'&&conflict.receiving.bidderDesk.conflicts.some(x=>x.id===local.id),'Divergent saved histories were silently merged');
  need(same(conflict.receiving.bidderDesk.incoming,conflictPackage.bidderDesk),'The conflicting original history was not retained completely');
  need(same(await coldClient.bidderRecord('decision',local.id),local),'Conflicting receive overwrote the local saved edition');
  const repeat=await coldClient.receivePackage(conflictPackage,0);
  need(repeat.alreadyReceived===true&&same(repeat.receiving,conflict.receiving),'Same package receipt was duplicated or changed');
  return {local,origin,olderReceipt:oldReceipt.receiving,conflict:conflict.receiving,repeatAlreadyReceived:true};
 });
 const coldBrowser=await phase('16-cold-browser-and-complete-export',async()=>{
  await openUi(coldServer,noticeId,profileId);await openUiRecord('decision',reviewed.record.id);
  need(await page.inputValue('#d-owner')===concurrent.local.owner,'Cold operator page did not reopen the saved local edition');
  need(await page.inputValue('#d-choice')==='NO_BID','Cold operator page lost the original choice');
  const downloaded=await actualReportDownload('cold-local-decision','json',concurrent.local,coldServer.client);
  const shot=await screenshot('05-cold-narrow-decision',{kind:'decision',id:concurrent.local.id,revision:concurrent.local.revision,viewport:{width:390,height:844}});
  const full=await packageFile('complete-original-workspace',client,{scope:'all'});
  need(full.sources.some(x=>x.sha256===fixture.captures.award.projection.sha256),'Complete workspace export omitted original award context');
  const coldPackage=await packageFile('complete-cold-workspace',coldServer.client,{scope:'all'});
  need(coldPackage.receivingHistory.some(x=>x.packageId===concurrent.conflict.packageId&&x.bidderDesk?.status==='REVIEW_REQUIRED'),'Complete cold export omitted the conflicting receiving history');
  const pagination={};for(const kind of ['profile','evidence','requirement','decision'])pagination[kind]=(await allRecords(client,kind)).offsets;
  need(pagination.decision.length>=2,'Actual bidder list pagination was not exercised');
  return {workspace:(await coldServer.client.workspace()).workspace,screenshot:shot,download:downloaded,fullPackageId:full.packageId,coldPackageId:coldPackage.packageId,pagination};
 });
 await phase('17-full-package-independent-receiving',async()=>{
  const finalWorkspace=inOut('workspaces/independent-complete-receiver');
  const finalServer=await startServer(finalWorkspace,inOut('cold-application'),'independent');
  try{
   const pkg=await optional('packages/complete-cold-workspace.json');
   const result=await receive(finalServer.client,'independent-complete-cold-package',pkg);
   need(result.receiving.bidderDesk.status==='RECEIVED','Complete saved workspace did not reopen independently');
   const selected=await finalServer.client.bidderRecord('decision',reviewed.record.id,{history:true});
   need(same(selected.history,graphRecordGroup(pkg,'decision',reviewed.record.id).editions),'Independent receiver changed complete decision history');
   need(result.receiving.sourceReceivingHistory.some(x=>x.packageId===concurrent.conflict.packageId&&x.bidderDesk?.status==='REVIEW_REQUIRED'),'Independent receiving lost the retained original conflict');
   const full=await packageFile('independent-complete-workspace',finalServer.client,{scope:'all'});
   return {workspace:(await finalServer.client.workspace()).workspace,packageId:full.packageId,received:result.receiving,allHistoryRetained:true};
  }finally{await closeServer(finalServer);}
 });
 return {schema:SCHEMA,operationId:OPERATION,inputSha256:FI,nativeState:'RECEIVED_AND_VERIFIED',originalWorkspaceId:legacy.workspace.id,
  workspace:'workspaces/original',coldWorkspace:'workspaces/cold',independentWorkspace:'workspaces/independent-complete-receiver',
  originalNoticeId:noticeId,originalEntryId:legacy.entryId,generatedAmendmentEntryId:amendment.entry.id,profileId,
  decisionId:reviewed.record.id,originalDecisionRevision:1,reviewedDecisionRevision:reviewed.record.revision,
  originalFollowupRevision:concurrent.origin.revision,coldFollowupRevision:concurrent.local.revision,
  choices:[baseline.decision.choice,...baseline.alternatives.map(x=>x.choice)],
  sourceRows:{tender:{fields:fixture.expected.originalTenderFields,rowSha256:fixture.captures.tender.rowSha256,projection:fixture.captures.tender.projection},
   award:{fields:fixture.expected.originalAwardFields,rowSha256:fixture.captures.award.rowSha256,projection:fixture.captures.award.projection}},
  sourceClaims:'Original retained rows are unchanged. Amendment, supplier documents, assessments and decisions are generated receiving examples; no procurement or provider operation occurred.',
  completePackages:['packages/legacy-v1.json','packages/selected-before-changes.json','packages/selected-final.json','packages/origin-concurrent-edition.json','packages/complete-original-workspace.json','packages/complete-cold-workspace.json','packages/independent-complete-workspace.json'],
  screenshots:['screenshots/01-original-opportunity.json','screenshots/02-saved-original-decision.json','screenshots/03-reviewed-decision.json','screenshots/04-original-decision-history.json','screenshots/05-cold-narrow-decision.json'],
  independentVisualInspection:'PENDING',providerCalls:0,procurementSubmissions:0,sourceFetches:0,
  completedPhases,application:fixture.originalApplication,executionApplication:{...fixture.originalApplication,files:selectedApplicationMembers()},
  sourceAdoption:applicationAdoption?await descriptor(UI_ADOPTION.directory+'/complete.json'):null,
  priorAttemptRecovery:await optional('original-attempt-recovery.json')?await descriptor('original-attempt-recovery.json'):null};
}
function graphRecordGroup(pkg,kind,id){const group=pkg.bidderDesk.records.find(x=>x.kind===kind&&x.id===id);need(group,'Complete graph record is absent');return group;}


async function validateSavedBindings(){
 const original=await checked(inOut('receiving-input.json'),{bytes:FIXTURE_BYTES.length,sha256:FI});
 need(original.data.equals(FIXTURE_BYTES),'Saved receiving input changed');
 const binding=await optional('source-binding.json');
 need(binding?.schema===SCHEMA&&binding.operationId===OPERATION&&binding.inputSha256===FI&&same(binding.application,fixture.originalApplication),'Saved complete application identity differs');
 applicationAdoption=await validateUiAdoption();
 if(applicationAdoption){const completed=await optional(UI_ADOPTION.directory+'/complete.json'),expected={schema:SCHEMA+'.source-adoption-complete',operationId:OPERATION,inputSha256:FI,plan:await descriptor(UI_ADOPTION.directory+'/plan.json'),applicationPath:UI_ADOPTION.path,selected:UI_ADOPTION.selected};need(same(completed,expected),'Source adoption completion differs');}
 for(const [root,files] of [[APP,selectedApplicationMembers()],[LEGACY,fixture.originalApplication.legacyFiles]]){
  for(const member of files)await checked(path.join(root,relative(member.path)),member);
 }
}
async function cleanupOwned(){
 const failures=[];
 const complete=async(name,work)=>{
  try{await work();drains.push({name,closed:true,at:new Date().toISOString()});}
  catch(error){failures.push({name,error:brief(error)});}
 };
 await complete('browser-routes',async()=>{
  let results;
  try{results=await boundedUi(Promise.allSettled([...routeTasks]),5000,'Original browser routes are still active');}
  catch(error){
   if(page&&!page.isClosed()){const owned=page;await boundedUi(owned.close(),5000,'The route-owning browser page did not close');page=null;}
   results=await boundedUi(Promise.allSettled([...routeTasks]),5000,'Original browser routes did not drain after closing their page');
  }
  need(results.every(x=>x.status==='fulfilled'),'An original browser route did not drain');
 });
 if(page){const owned=page;await complete('browser-page',async()=>{if(!owned.isClosed())await owned.close();page=null;});}
 if(browserContext){const owned=browserContext;await complete('browser-context',async()=>{await owned.close();browserContext=null;});}
 if(browser){const owned=browser;await complete('chromium',async()=>{await owned.close();browser=null;});}
 for(const server of [...resources])await complete('server-'+server.label,()=>closeServer(server));
 if(resources.size||routeTasks.size||page||browserContext||browser)failures.push({name:'owned-resources',error:{message:'One or more acquired resources remain unresolved',servers:resources.size,routes:routeTasks.size,page:Boolean(page),context:Boolean(browserContext),browser:Boolean(browser)}});
 return failures;
}
function reportHtml(candidate){
 const r=candidate.outcome,e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const rows=r.completedPhases.map(x=>'<tr><td>'+e(x.name)+'</td><td>PASS</td><td>'+e(x.reused?'Original completed receipt reused':'Completed in this invocation')+'</td></tr>').join('');
 const packages=r.completePackages.map(file=>'<li><a href="'+e(file)+'">'+e(file)+'</a></li>').join('');
 const images=r.screenshots.map(file=>'<li><a href="'+e(file)+'">'+e(file)+'</a></li>').join('');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CanadaBuys bidder desk receiving</title>'+
 '<style>body{font:16px/1.6 system-ui,sans-serif;color:#202020;background:#fff;margin:0}main{max-width:1100px;margin:auto;padding:32px}h1,h2{line-height:1.2}h2{margin-top:2em}code{overflow-wrap:anywhere}a{color:#202020;text-underline-offset:.2em}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #bbb;padding:10px;text-align:left;vertical-align:top}th{background:#f1f1f1}.status{border:2px solid #333;padding:18px;background:#f5f5f5}.muted{color:#555}@media(max-width:640px){main{padding:18px}table{font-size:12px}td,th{padding:6px}}</style></head><body><main>'+
 '<h1>CanadaBuys saved bidder desk</h1><p class="status"><strong>Native and browser receiving: PASS.</strong> The original workspace, full record history, evidence bytes and seven portable packages were verified. Independent visual inspection of the five retained screenshots remains pending.</p>'+
 '<p>Operation <code>'+e(OPERATION)+'</code><br>Completed '+e(candidate.completedAt)+'<br>Input SHA256 <code>'+e(FI)+'</code></p>'+
 '<h2>Original sources and illustrative decisions</h2><p>'+e(r.sourceClaims)+'</p>'+
 '<p>The receiving input contains one unchanged '+e(r.sourceRows.tender.fields)+'-field tender row and one unchanged '+e(r.sourceRows.award.fields)+'-field award row, projected from the retained official captures. Their full original row hashes, source capture identities, URLs and retrieval metadata remain in <a href="receiving-input.json">the complete input</a>. The later amendment, supplier records and requirement text are explicitly generated examples.</p>'+
 '<p>The fixed UTC−05:00 tender deadline, blank and literal-star classifications, source geography unknowns, zero award amount and distinct cumulative award value were retained. The desk recorded BID, NO_BID, INVESTIGATE and PARK as human choices; it did not infer mandatory compliance or submit a procurement response.</p>'+
 '<h2>Saved decision and evidence history</h2><p>Original notice <code>'+e(r.originalNoticeId)+'</code><br>Decision <code>'+e(r.decisionId)+'</code><br>Original decision revision '+e(r.originalDecisionRevision)+'; reviewed revision '+e(r.reviewedDecisionRevision)+'; original and cold follow-up revisions '+e(r.originalFollowupRevision)+' and '+e(r.coldFollowupRevision)+'.</p>'+
 '<p>The actual UI saved a profile, an attached evidence file, a clarification and reviewed decisions. A committed create response was deliberately lost and recovered with the same command. Changed evidence required fresh review while its prior bytes stayed available. An administrative edit preserved the original assessed context. A cold receiver retained its newer local edition when an older package arrived, and preserved a conflicting incoming history for review.</p>'+
 '<h2>Complete lifecycle</h2><table><thead><tr><th>Original phase</th><th>Result</th><th>Receipt use</th></tr></thead><tbody>'+rows+'</tbody></table>'+
 '<h2>Portable outputs</h2><ul>'+packages+'</ul>'+
 '<p>The original five-file v1 application created the first workspace and package. The current complete application migrated that original database, and separate cold and independent receiving workspaces verified v1 compatibility and the complete v2 graph. Source, request/response bodies, command IDs, source editions, original evidence bodies and conflict receipts accompany these packages.</p>'+
 (r.sourceAdoption?'<h2>Retained source correction</h2><p>The original input and source binding remain fixed. The exact operator parser correction accepts the saved unknown blank code; the original and selected page bytes, previous phase hashes and actual source inode history remain in <a href="'+e(r.sourceAdoption.path)+'">the source-adoption receipt</a>.</p>':'')+
 (r.priorAttemptRecovery?'<p>The original interrupted execution observations remain in <a href="'+e(r.priorAttemptRecovery.path)+'">the prior-attempt recovery record</a>. Completed phases are reused only when their actual original receipts are present.</p>':'')+
 '<h2>Browser captures</h2><ul>'+images+'</ul><p class="muted">These links select the exact PNG identities and viewports. Screenshot generation and native assertions passed; visual approval is a separate retained observation.</p>'+
 '<h2>Drain and verification</h2><p>All acquired pages, browser contexts, Chromium and application servers closed before the immutable completion candidate was published. The final result is published only after the lifetime database lock closes. <a href="completion-candidate.json">Completion and drain receipt</a>; <a href="receiving-members.json">complete member hashes</a>; <a href="receiving-result.json">final result</a>.</p>'+
 '<p>Provider calls: 0. Procurement submissions: 0. New source fetches: 0. No credentials are used by this local receiving operation.</p></main></body></html>\n';
}
function inventoryExcluded(rel){
 return rel==='receiving-result.json'||rel==='receiving-members.json'||rel==='receiving-lock.sqlite'||
  rel.startsWith('receiving-lock.sqlite-')||rel==='runtime-tmp'||rel.startsWith('runtime-tmp/');
}
async function outputInventory(){
 const members=[];
 async function visit(directory,prefix=''){
  const names=(await readdir(directory)).sort();
  for(const name of names){
   const rel=prefix?prefix+'/'+name:name;if(inventoryExcluded(rel))continue;
   relative(rel);const file=path.join(directory,name),st=await lstat(file);
   need(!st.isSymbolicLink(),'Receiving output contains a symbolic link',rel);
   if(st.isDirectory())await visit(file,rel);
   else{need(st.isFile(),'Receiving output contains a special member',rel);const value=await checked(file);members.push({path:rel,bytes:value.bytes,sha256:value.sha256});}
  }
 }
 await visit(OUT);return members;
}
async function validateManifest(manifest){
 need(manifest?.schema===SCHEMA+'.members'&&manifest.operationId===OPERATION&&manifest.inputSha256===FI&&Array.isArray(manifest.files),'Final member manifest binding differs');
 const seen=new Set();
 for(const member of manifest.files){
  relative(member.path);need(!seen.has(member.path)&&!inventoryExcluded(member.path),'Final member manifest repeats or selects an excluded path',member.path);seen.add(member.path);
  await checked(inOut(member.path),member);
 }
 for(const required of ['receiving-input.json','source-binding.json','completion-candidate.json','receiving-report.html','packages/legacy-v1.json','packages/selected-final.json','packages/complete-cold-workspace.json','packages/independent-complete-workspace.json'])
  need(seen.has(required),'Final member manifest omits an original complete output',required);
}
function closeControlLock(){
 if(!lock)return;
 const selected=lock;let error=null;
 try{selected.exec('ROLLBACK');}catch(e){error=e;}
 try{selected.close();lock=null;}catch(e){error=error||e;}
 if(error)throw error;
}
async function finalPublication(candidate){
 need(candidate?.schema===SCHEMA+'.completion'&&candidate.operationId===OPERATION&&candidate.inputSha256===FI&&candidate.resourcesClosed===true,'Saved completion candidate differs');
 need(candidate.outcome?.nativeState==='RECEIVED_AND_VERIFIED'&&candidate.outcome.completedPhases.length===17,'Saved complete lifecycle is incomplete');
 await validateSavedBindings();
 await putBytes('receiving-report.html',Buffer.from(reportHtml(candidate)));
 let manifest=await optional('receiving-members.json');
 if(!manifest){
  manifest={schema:SCHEMA+'.members',operationId:OPERATION,inputSha256:FI,completedAt:candidate.completedAt,files:await outputInventory()};
  await put('receiving-members.json',manifest);
 }
 await validateManifest(manifest);
 const result={...candidate.outcome,status:'PASS',completedAt:candidate.completedAt,
  cleanup:{resourcesClosed:true,controlLockReleased:true,drains:candidate.drains},
  manifest:await descriptor('receiving-members.json'),report:await descriptor('receiving-report.html'),
  resultPath:'receiving-result.json',screenshotsRequireVisualInspection:true};
 // All result fields come from the committed candidate. A loss after releasing
 // the lock can publish this exact same final record without any application run.
 closeControlLock();
 await put('receiving-result.json',result);return result;
}
async function main(){
 await mkdir(OUT,{recursive:true,mode:0o700});const outStat=await lstat(OUT);
 need(outStat.isDirectory()&&!outStat.isSymbolicLink(),'Output is not an original regular directory');
 const lockFile=inOut('receiving-lock.sqlite');
 if(await exists(lockFile)){const st=await lstat(lockFile);need(st.isFile()&&!st.isSymbolicLink(),'Receiving control lock path differs');}
 lock=new DatabaseSync(lockFile);lock.exec('PRAGMA busy_timeout=1000; BEGIN EXCLUSIVE');
 const done=await optional('receiving-result.json');
 if(done){
  need(done.status==='PASS'&&done.operationId===OPERATION&&done.inputSha256===FI&&done.cleanup?.controlLockReleased===true,'Existing final result differs');
  await validateSavedBindings();await checked(inOut(done.manifest.path),done.manifest);
  await validateManifest(await optional(done.manifest.path));await checked(inOut(done.report.path),done.report);
  closeControlLock();return {...done,reused:true};
 }
 const candidate=await optional('completion-candidate.json');
 if(candidate)return finalPublication(candidate);
 const temporary=inOut('runtime-tmp');await mkdir(temporary,{recursive:true,mode:0o700});
 need((await lstat(temporary)).isDirectory()&&!((await lstat(temporary)).isSymbolicLink()),'Task runtime temporary directory differs');
 process.env.TMPDIR=temporary;
 await sourceClosure();
 let error=null;
 try{
  finalData=await journey();
  need(pageErrors.length===0,'The actual browser raised an uncaught page error',pageErrors);
  need(!browserErrors.some(x=>x.kind==='NETWORK_OUTSIDE_RECEIVING'),'The browser attempted an external provider request',browserErrors);
 }catch(e){error=e;}
 const cleanup=await cleanupOwned();
 await put(ATTEMPT+'/browser-observations.json',{schema:SCHEMA,operationId:OPERATION,pageErrors,browserErrors,dialogs,drains,cleanup});
 if(error||cleanup.length){if(error){error.cleanup=cleanup;throw error;}const e=new Error('An original receiving resource did not drain');e.detail=cleanup;throw e;}
 const completion={schema:SCHEMA+'.completion',operationId:OPERATION,inputSha256:FI,completedAt:new Date().toISOString(),resourcesClosed:true,drains,outcome:finalData};
 await put('completion-candidate.json',completion);
 return finalPublication(completion);
}
try{
 const result=await main();
 console.log(JSON.stringify({status:'PASS',operationId:OPERATION,result:inOut('receiving-result.json'),manifest:inOut(result.manifest.path),report:inOut(result.report.path),reused:result.reused===true,phases:result.completedPhases.length,independentVisualInspection:result.independentVisualInspection}));
}catch(error){
 mainError=error;
 const cleanup=await cleanupOwned();
 try{closeControlLock();}catch(e){cleanup.push({name:'control-lock',error:brief(e)});}
 const failure={schema:SCHEMA+'.failure',operationId:OPERATION,inputSha256:FI,status:'FAILED',failedAt:new Date().toISOString(),error:brief(error),cleanup:[...(error.cleanup||[]),...cleanup],completedPhases,drains};
 try{await put(ATTEMPT+'/failure.json',failure);}catch(e){failure.receiptError=brief(e);}
 console.error(JSON.stringify(failure));process.exitCode=1;
}
