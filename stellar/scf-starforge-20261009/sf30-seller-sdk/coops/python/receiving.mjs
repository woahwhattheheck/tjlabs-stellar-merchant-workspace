// MIT. Callable Python model-input continuation for an already-owned coastal console.
// The caller owns the original console, browser, admission record and restart.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {dirname,join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const stable=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
const sha=value=>createHash('sha256').update(value).digest('hex');
const assert=(value,message)=>{if(!value)throw new Error(message);};
function physical(path,kind='file'){
 assert(typeof path==='string'&&isAbsolute(path),'Select an absolute original '+kind+' path.');
 const full=resolve(path),s=fs.lstatSync(full);
 assert(!s.isSymbolicLink()&&fs.realpathSync(full)===full&&(kind==='directory'?s.isDirectory():s.isFile()),'Use the original physical '+kind+'.');
 return full;
}
function directory(path){fs.mkdirSync(path,{recursive:true,mode:0o700});return physical(resolve(path),'directory');}
function json(path,max=64*1024*1024){physical(path);assert(fs.statSync(path).size<=max,'Read the selected bounded original JSON.');return JSON.parse(fs.readFileSync(path,'utf8'));}
function atomic(path,value){
 const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n'),temp=path+'.'+randomUUID()+'.tmp';
 let fd;try{
  fd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
  fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=null;fs.renameSync(temp,path);
  const parent=fs.openSync(dirname(path),fs.constants.O_RDONLY);try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
 }finally{if(fd!==undefined&&fd!==null)fs.closeSync(fd);try{fs.unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
async function identity(path){physical(path);const h=createHash('sha256');let bytes=0;for await(const part of fs.createReadStream(path)){bytes+=part.length;h.update(part);}return{path,bytes,sha256:h.digest('hex')};}
function within(parent,path){const p=relative(parent,path);return p===''||p!=='..'&&!p.startsWith('../')&&!isAbsolute(p);}
const sourceNames=['receiving.mjs','cli.mjs','coops_model.py','stellar_coops/__init__.py','stellar_coops/transport.py','stellar_coops/journal.py','stellar_coops/client.py','stellar_coops/cli.py'];

/**
 * Continue one selected original receiving context.
 * Required: startupFile, outputDirectory, pythonExecutable, operationId, releaseId, datasetId, restart.
 * Choose existingReturnId OR returnedFile + returnNote + reviewReturn.
 * restart({phaseKey,workspaceId,baseURL}) -> {startupFile}; same origin, same original workspace.
 * reviewReturn({requestPath,requestSha256,packet,files}) -> response object or its absolute file path.
 * Response: {schema:'stellar-forge.coops-python-review-response.v1',requestSha256,decision:{...}}.
 */
export async function continueCoastalPythonReceiving(options={}){
 assert(typeof options.outputDirectory==='string'&&isAbsolute(options.outputDirectory),'Select the absolute receiving output directory.');
 const output=directory(resolve(options.outputDirectory)),python=fs.realpathSync(options.pythonExecutable??'');
 physical(python);
 assert(!within(here,output)&&!within(output,here),'Keep receiver state outside the application source.');
 for(const key of ['operationId','releaseId','datasetId'])assert(typeof options[key]==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(options[key]),'Keep the selected original '+key+'.');
 assert(typeof options.restart==='function','Use the existing same-origin restart callback.');
 assert(Boolean(options.existingReturnId)!==Boolean(options.returnedFile),'Select an existing original returned comparison or one actual returned file.');
 if(options.returnedFile)assert(typeof options.reviewReturn==='function'&&typeof options.returnNote==='string'&&options.returnNote.trim(),'Select the actual returned-file note and independent receiving callback.');
 const checkpointPath=join(output,'python-receiving-checkpoint.json'),resultPath=join(output,'python-receiving-result.json');
 let cp=fs.existsSync(checkpointPath)?json(checkpointPath):null;
 const selected={operationId:options.operationId,releaseId:options.releaseId,datasetId:options.datasetId,
  pythonExecutable:python,existingReturnId:options.existingReturnId??null,returnedFile:options.returnedFile?resolve(options.returnedFile):null,
  returnNote:options.returnNote??null,query:options.query??'limit=200'};
 const selectionSha256=sha(stable(selected));
 if(cp)assert(cp.selectionSha256===selectionSha256,'Preserve this original Python receiving selection and intent.');
 else cp={schema:'stellar-forge.coops-python-continuation.v1',selection:selected,selectionSha256,createdAt:new Date().toISOString(),phases:{},sourceHistory:[],state:'PREPARED'};
 const persist=()=>atomic(checkpointPath,cp);
 if(cp.state==='COMPLETE'){
  const file=await identity(resultPath);assert(file.bytes===cp.result.bytes&&file.sha256===cp.result.sha256,'The completed Python receiving result changed.');
  return json(resultPath);
 }
 const source=await Promise.all(sourceNames.map(async name=>({name,...await identity(join(here,name))})));
 const sourceSha256=sha(stable(source.map(({name,bytes,sha256})=>({name,bytes,sha256}))));
 if(cp.sourceHistory.length&&cp.sourceHistory.at(-1).sha256!==sourceSha256)assert(String(options.continuationNote??'').trim(),'Record the concrete source correction before continuing this incomplete receiving intent.');
 if(cp.sourceHistory.at(-1)?.sha256!==sourceSha256)cp.sourceHistory.push({sha256:sourceSha256,files:source,at:new Date().toISOString(),note:options.continuationNote??null});
 const receiver=directory(join(output,'receiver')),artifacts=directory(join(output,'artifacts'));
 let startup=physical(resolve(options.startupFile??'')),active=null,stopped=null;
 const progress=async(message,extra={})=>{await options.onProgress?.({message,operationId:options.operationId,...extra});};
 async function invoke(name,command,args=[],online=true){
  if(stopped)throw stopped;
  const file=join(artifacts,name+'.json'),argv=['-B',join(here,'coops_model.py'),'--directory',receiver,'--output',file,'--wait-seconds',String(options.waitSeconds??120)];
  if(online)argv.push('--startup',startup);
  argv.push(command,...args);
  const result=await new Promise((done,reject)=>{
   const child=spawn(python,argv,{stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});active=child;
   let stdout='',stderr='',excess=false;
   for(const [stream,key]of[[child.stdout,'stdout'],[child.stderr,'stderr']])stream.on('data',bytes=>{
    if(key==='stdout')stdout+=bytes.toString();else stderr+=bytes.toString();
    if(stdout.length+stderr.length>128*1024&&!excess){excess=true;child.kill('SIGTERM');}
   });
   child.once('error',error=>{active=null;reject(error);});
   child.once('exit',(code,signal)=>{
    active=null;
    if(code!==0||signal||excess){reject(new Error('Original Python receiving '+name+' remains incomplete: '+(stderr||signal||('exit '+code)).slice(0,6000)));return;}
    try{done(JSON.parse(stdout));}catch{reject(new Error('The original Python receiver did not return its complete output receipt.'));}
   });
  });
  const actual=await identity(file);assert(result.output===file&&result.bytes===actual.bytes&&result.sha256===actual.sha256,'The Python command changed its exact retained output.');
  return{file:actual,value:json(file)};
 }
 async function phase(name,run){
  if(stopped)throw stopped;
  const previous=cp.phases[name];
  if(previous?.state==='COMPLETE'){
   if(previous.file){const f=await identity(previous.file.path);assert(f.sha256===previous.file.sha256&&f.bytes===previous.file.bytes,'A completed Python receiving artifact changed.');}
   return previous.value;
  }
  cp.currentPhase=name;cp.state='RUNNING';cp.phases[name]={...previous,state:'STARTED',startedAt:previous?.startedAt??new Date().toISOString()};persist();
  await progress('Continuing original Python receiving: '+name,{phase:name});
  const result=await run();
  cp.phases[name]={...cp.phases[name],state:'COMPLETE',...result,completedAt:new Date().toISOString()};persist();
  return result.value;
 }
 const interrupted=signal=>{stopped=new Error('Original Python receiving was interrupted by '+signal+'.');if(active&&active.exitCode===null)active.kill(signal);};
 const onInt=()=>interrupted('SIGINT'),onTerm=()=>interrupted('SIGTERM');
 process.once('SIGINT',onInt);process.once('SIGTERM',onTerm);
 try{
  const connected=await phase('connect_original_workspace',()=>invoke('connection','connect'));
  cp.workspaceId=connected.workspaceId;cp.origin=connected.origin;persist();
  const released=await phase('receive_complete_reviewed_study',()=>invoke('study-release','receive-study',['--release',options.releaseId]));
  assert(released.status==='VERIFIED'&&released.workspaceId===cp.workspaceId,'The original complete study was not verified.');
  const native=await phase('receive_original_native_dataset',()=>invoke('native-dataset','receive-dataset',['--dataset',options.datasetId]));
  assert(native.dataset.studyReleaseId===options.releaseId&&native.dataset.studyManifestSha256===released.manifestSha256,'The native query selection changed its exact reviewed study.');
  const first=await phase('first_native_query',()=>invoke('native-first-query','query',['--dataset',options.datasetId,'--query',selected.query,'--intent',options.operationId+'/python/first-query']));
  const complete=await phase('complete_native_query_handoff',()=>invoke('complete-native-query','query',['--dataset',options.datasetId,'--query',selected.query,'--intent',options.operationId+'/python/complete-query','--all']));
  assert(complete.complete===true&&complete.rows===first.page.total,'The complete query handoff changed its original selected total.');
  let packet;
  if(options.existingReturnId){
   packet=await phase('receive_original_return_and_decision',()=>invoke('original-return','inspect-return',['--return-id',options.existingReturnId]));
   assert(packet.return.releaseId===options.releaseId&&packet.currentDecision&&
    packet.currentDecision.returnId===packet.return.id&&packet.currentDecision.comparisonSha256===packet.return.comparisonSha256,'Keep the original actual receiving decision for this release and comparison.');
  }else{
   packet=await phase('retain_selected_return_and_complete_comparison',async()=>{
    const args=['--release',options.releaseId,'--intent',options.operationId+'/python/return','--note',options.returnNote];
    if(fs.existsSync(selected.returnedFile))args.push('--file',physical(selected.returnedFile));
    return invoke('selected-return','return-file',args);
   });
   assert(packet.return.releaseId===options.releaseId,'The returned file changed its original study release.');
   await phase('independent_return_decision',async()=>{
    const requestPath=join(artifacts,'receiving-review-request.json'),responsePath=join(artifacts,'receiving-review-response.json');
    const request={schema:'stellar-forge.coops-python-review-request.v1',operationId:options.operationId,workspaceId:cp.workspaceId,
     returnId:packet.return.id,comparisonSha256:packet.return.comparisonSha256,packet,
     files:packet.files.map(f=>({...f,path:join(receiver,f.path)}))};
    const requestSha256=sha(stable(request));
    if(fs.existsSync(requestPath))assert(stable(json(requestPath))===stable(request),'The original independent receiving packet changed.');
    else atomic(requestPath,request);
    let response=fs.existsSync(responsePath)?json(responsePath,65536):null;
    if(!response){
     const supplied=await options.reviewReturn({requestPath,requestSha256,packet,files:request.files});
     response=typeof supplied==='string'?json(physical(supplied),65536):supplied;
     assert(response&&response.schema==='stellar-forge.coops-python-review-response.v1'&&response.requestSha256===requestSha256,'Retain the actual independent response to this exact packet.');
     atomic(responsePath,response);
    }
    assert(response.schema==='stellar-forge.coops-python-review-response.v1'&&response.requestSha256===requestSha256,'The independent response changed its original packet.');
    const d=response.decision;
    assert(d?.schema==='stellar-forge.coops-python-receiving-decision.v1'&&d.workspaceId===cp.workspaceId&&d.returnId===packet.return.id&&
     d.comparisonSha256===packet.return.comparisonSha256&&d.expectedDecisionId===packet.expectedDecisionId&&
     ['accepted','follow_up'].includes(d.status)&&typeof d.actor==='string'&&d.actor.trim()&&typeof d.note==='string'&&d.note.trim(),'The actual decision must retain its actor, note and original comparison/current-decision pins.');
    const decisionPath=join(artifacts,'actual-receiving-decision.json');
    if(fs.existsSync(decisionPath))assert(stable(json(decisionPath))===stable(d),'The original selected decision changed.');else atomic(decisionPath,d);
    return invoke('saved-receiving-decision','decide',['--intent',options.operationId+'/python/receiving','--decision',decisionPath]);
   });
  }
  cp.returnId=packet.return.id;persist();
  await phase('same_origin_native_restart',async()=>{
   const response=await options.restart({phaseKey:options.operationId+'/python/reopen',workspaceId:cp.workspaceId,baseURL:cp.origin});
   assert(response&&typeof response.startupFile==='string','The original restart must return its current private startup path.');
   startup=physical(resolve(response.startupFile));const opened=await invoke('reopened-connection','connect');
   assert(opened.value.workspaceId===cp.workspaceId&&opened.value.origin===cp.origin,'Reopen changed the original receiving workspace or origin.');
   return{...opened,startupFile:startup};
  });
  // The caller opens its current original listener on process continuation; the
  // current startup argument supplies its refreshed credential after a completed restart.
  const after=await phase('query_after_original_reopen',()=>invoke('query-after-reopen','query',['--dataset',options.datasetId,'--query',selected.query,'--intent',options.operationId+'/python/reopen-query']));
  assert(stable(after)===stable(first),'The original native query changed after same-origin reopen.');
  const receiving=await phase('return_after_original_reopen',()=>invoke('return-after-reopen','inspect-return',['--return-id',cp.returnId]));
  assert(receiving.return.comparisonSha256===packet.return.comparisonSha256&&receiving.currentDecision,'Reopen lost the original returned-file comparison or actual decision.');
  const verified=await phase('offline_complete_receiving_verification',()=>invoke('offline-verification','verify',[],false));
  assert(verified.status==='VERIFIED'&&verified.networkUsed===false,'The complete received files and original decisions did not reopen offline.');
  const result={schema:'stellar-forge.coops-python-operator-result.v1',status:'PASS',operationId:options.operationId,
   workspaceId:cp.workspaceId,releaseId:options.releaseId,datasetId:options.datasetId,returnId:cp.returnId,
   decision:receiving.currentDecision,manifestSha256:released.manifestSha256,sourceSha256,source,
   resultPath,checkpointPath,completedAt:new Date().toISOString(),checks:Object.fromEntries(Object.entries(cp.phases).map(([name,p])=>[name,p.value])),
   scope:'Complete selected reviewed-study files and archived source members, original native query/cursor handoff, actual returned-file comparison and receiving decision, same-workspace console reopen and offline file verification.'};
  atomic(resultPath,result);cp.result=await identity(resultPath);cp.state='COMPLETE';cp.currentPhase=null;delete cp.error;persist();return result;
 }catch(error){
  cp.state='INCOMPLETE';cp.error={phase:cp.currentPhase,message:String(error.message).slice(0,6000),at:new Date().toISOString()};try{persist();}catch{}
  error.checkpointPath=checkpointPath;throw error;
 }finally{process.removeListener('SIGINT',onInt);process.removeListener('SIGTERM',onTerm);}
}
