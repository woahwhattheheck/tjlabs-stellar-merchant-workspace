#!/usr/bin/env node
// MIT. Complete original Zarr source -> merchant -> Applications -> portable receiving.
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {delimiter} from 'node:path';
import {readFile as fsRead,open} from 'node:fs/promises';
import {
 assert,readFile,mkdir,join,dirname,resolve,hash,jsonBytes,save,saveBytes,optional,fileIdentity,
 absolute,contains,privateDirectory,verifyLease,verifySources,runJson,errorView,stamp,HASH,SDK
} from './receiving/common.mjs';
import {receiveZarrMerchant} from './receiving/merchant.mjs';
import {receiveZarrApplications} from './receiving/applications.mjs';
import {reopenZarrHandover} from './receiving/reopen.mjs';

const SELF=fileURLToPath(import.meta.url),PREFIX=SDK+'/zarr';
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
// Same permanent-fd handoff used by the original complete SeaTable receiver.
// The named lock inode is never replaced or removed during recovery.
const PYTHON_LEASE=[
 'import fcntl,os,stat,sys',
 'root,node,script,input_path=sys.argv[1:]',
 'os.umask(0o077)',
 'os.makedirs(root,mode=0o700,exist_ok=True)',
 'd=os.lstat(root)',
 'if not stat.S_ISDIR(d.st_mode) or stat.S_ISLNK(d.st_mode) or d.st_uid!=os.getuid() or d.st_mode&0o077 or os.path.realpath(root)!=root: raise SystemExit("PRIVATE_ORIGINAL_RECEIVING_ROOT_REQUIRED")',
 'fd=os.open(os.path.join(root,"operation.lock"),os.O_RDWR|os.O_CREAT|getattr(os,"O_NOFOLLOW",0),0o600)',
 's=os.fstat(fd)',
 'if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_uid!=os.getuid() or s.st_mode&0o077: raise SystemExit("PRIVATE_ORIGINAL_RECEIVING_LEASE_REQUIRED")',
 'try: fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)',
 'except BlockingIOError: raise SystemExit("ORIGINAL_RECEIVING_OPERATION_ACTIVE")',
 'os.set_inheritable(fd,True)',
 'os.environ["ZARR_RECEIVING_LEASE_FD"]=str(fd)',
 'os.execv(node,[node,script,"--locked-input",input_path])'
].join('\n')+'\n';
function child(command,args,options){
 return new Promise((done,reject)=>{
  const selected=spawn(command,args,options);
  const signal=name=>{if(selected.exitCode===null&&selected.signalCode===null)selected.kill(name);};
  const term=()=>signal('SIGTERM'),interrupt=()=>signal('SIGINT');
  process.on('SIGTERM',term);process.on('SIGINT',interrupt);
  const detach=()=>{process.off('SIGTERM',term);process.off('SIGINT',interrupt);};
  selected.once('error',error=>{detach();reject(error);});
  selected.once('close',(code,signal)=>{detach();done({code,signal});});
 });
}
function environment(input){
 const result={...process.env};
 if(input.pythonPaths.length)result.PYTHONPATH=input.pythonPaths.join(delimiter);
 result.PYTHONDONTWRITEBYTECODE='1';return result;
}
async function inputAt(file){
 file=absolute(file,'receiving input');
 const original=await readFile(file);assert(original.length<=1024*1024);
 const input=JSON.parse(original);
 assert.equal(input.schema,'stellar-forge.zarr-receiving-input.v1');assert(ID.test(input.operationId));
 for(const name of ['operationDirectory','workspaceDirectory','sourceRoot','runtimeDirectory','python'])absolute(input[name],name);
 assert(!contains(input.sourceRoot,input.operationDirectory)&&!contains(input.operationDirectory,input.sourceRoot));
 assert(!contains(input.workspaceDirectory,input.operationDirectory)&&!contains(input.operationDirectory,input.workspaceDirectory),'Original workspace and receiving output are separate roots');
 for(const name of ['file'])absolute(input.sourceManifest[name],'source manifest');
 assert(HASH.test(input.sourceManifest.sha256)&&HASH.test(input.consumerSha256));
 assert.equal(hash(await readFile(SELF)),input.consumerSha256,'The selected complete receiver changed');
 assert(Array.isArray(input.pythonPaths)&&input.pythonPaths.every(x=>absolute(x,'Python dependency root')));
 absolute(input.browser.module,'Playwright module');absolute(input.browser.executable,'Chromium executable');
 assert.equal(input.merchant?.payment?.network,'stellar:testnet','This receiver does not authorize a mainnet seller');
 assert(typeof input.merchant.payment.amount==='string'&&/^[1-9][0-9]*$/.test(input.merchant.payment.amount));
 assert(typeof input.merchant.nextAmount==='string'&&/^[1-9][0-9]*$/.test(input.merchant.nextAmount)&&input.merchant.nextAmount!==input.merchant.payment.amount);
 for(const name of ['inputFile','resultFile'])absolute(input.sourceStage[name],name);
 assert(HASH.test(input.sourceStage.inputSha256));
 if(input.sourceStage.completedResultSha256!==null)assert(HASH.test(input.sourceStage.completedResultSha256));
 assert.deepEqual(await fileIdentity(input.engineArchive.file),{bytes:input.engineArchive.bytes,sha256:input.engineArchive.sha256});
 assert.equal(hash(await readFile(input.sourceStage.inputFile)),input.sourceStage.inputSha256);
 const source=JSON.parse(await readFile(input.sourceStage.inputFile));
 assert.equal(source.schema,'stellar-forge.zarr-native-source-selection.v1');
 assert.equal(source.operationId,input.operationId);assert.equal(source.workspace,input.workspaceDirectory);
 assert.equal(join(source.outputRoot,'source-stage/result.json'),input.sourceStage.resultFile);
 assert(Array.isArray(source.sources)&&source.sources.length===2);
 for(const selected of source.sources){assert.equal(selected.provenance?.repository,'zarr-developers/pizzarr');assert(HASH.test(selected.sha256));assert.deepEqual(await fileIdentity(selected.file),{bytes:(await fileIdentity(selected.file)).bytes,sha256:selected.sha256});}
 for(const key of ['primary','secondary'])assert(input.frozenSelection[key]&&typeof input.frozenSelection[key].source==='string'&&typeof input.frozenSelection[key].array==='string');
 assert(Number(process.versions.node.split('.')[0])>=24&&process.platform!=='win32','Use original Node 24+ on POSIX');
 return {input,inputFile:file,inputSha256:hash(original),root:input.operationDirectory};
}
async function sourceAndRuntime(input){
 await verifySources(input);
 // The Applications continuation independently validates this same READY runtime
 // with the original inspectMerchantRuntime API before any managed start.
 const {inspectMerchantRuntime}=await import(pathToFileURL(join(input.sourceRoot,'stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs')).href);
 const runtime=await inspectMerchantRuntime(input.runtimeDirectory,{expectedManifest:input.sourceManifest.sha256,load:false});
 assert.equal(runtime.state,'READY');assert.equal(runtime.sourceRoot,input.sourceRoot);assert.equal(runtime.sourceManifestSha256,input.sourceManifest.sha256);
 const expected=resolve(input.runtimeDirectory,'package','source');
 assert.equal(input.sourceRoot,expected,'Use the original installed package source, not a repository checkout');
 assert.equal(input.sourceManifest.file,resolve(input.runtimeDirectory,'package','manifest.json'));
 assert.equal(hash(await readFile(input.sourceManifest.file)),input.sourceManifest.sha256);
}
async function prepare(selectionFile){
 const selected=JSON.parse(await readFile(absolute(selectionFile))),sourceInput=await readFile(absolute(selected.sourceStage?.inputFile));
 assert.equal(selected.schema,'stellar-forge.zarr-receiving-selection.v1');
 const resultFile=absolute(selected.sourceStage.resultFile),old=await optional(resultFile);
 if(old)assert.equal(old.state,'SOURCE_WORKSPACE_COMPLETE');
 const input={schema:'stellar-forge.zarr-receiving-input.v1',operationId:selected.operationId,
  consumerSha256:hash(await readFile(SELF)),sourceRoot:selected.sourceRoot,sourceManifest:selected.sourceManifest,
  runtimeDirectory:selected.runtimeDirectory,engineArchive:{file:absolute(selected.engineArchive.file),...await fileIdentity(selected.engineArchive.file)},
  operationDirectory:selected.operationDirectory,workspaceDirectory:selected.workspaceDirectory,python:selected.python,
  pythonPaths:selected.pythonPaths??[],browser:selected.browser,merchant:selected.merchant,
  sourceStage:{inputFile:selected.sourceStage.inputFile,inputSha256:hash(sourceInput),resultFile,completedResultSha256:old?hash(await readFile(resultFile)):null},
  frozenSelection:selected.frozenSelection??{primary:{source:'v3',array:'ragged_2d'},secondary:{source:'v3',array:'var_group/temperature',cut:'temperature-strided'}}};
 if(selected.engineArchive.sha256!==undefined)assert.equal(input.engineArchive.sha256,selected.engineArchive.sha256);
 if(selected.engineArchive.bytes!==undefined)assert.equal(input.engineArchive.bytes,selected.engineArchive.bytes);
 await sourceAndRuntime(input);await privateDirectory(dirname(absolute(selected.inputFile)));
 assert(!contains(input.sourceRoot,selected.inputFile)&&!contains(input.operationDirectory,selected.inputFile));
 await save(selected.inputFile,input,{createOnly:true});const context=await inputAt(selected.inputFile);
 console.log(JSON.stringify({state:'PREPARED',operationId:input.operationId,input:{file:selected.inputFile,...await fileIdentity(selected.inputFile)},sourceStage:input.sourceStage,sourceManifestSha256:input.sourceManifest.sha256,additionalArrayReads:0}));
 return context;
}
async function runSelected(ctx,command,args,lease){
 const ended=await child(command,args,{stdio:['ignore','inherit','inherit',lease],env:{...environment(ctx.input),ZARR_RECEIVING_LEASE_FD:'3'}});
 assert.equal(ended.code,0,'Original child did not complete; retain this same input and native requests');
}
async function execute(ctx){
 const {input,root}=ctx;await sourceAndRuntime(input);const lease=await verifyLease(root);
 await save(join(root,'input.json'),input,{createOnly:true});
 const resultFile=join(root,'result.json'),deliveryFile=join(root,'delivery.json');
 let result=await optional(resultFile),delivery=await optional(deliveryFile);
 if(result){assert.equal(result.inputSha256,ctx.inputSha256);assert.equal(result.operationId,input.operationId);}
 if(delivery?.state==='COMPLETE'){
  assert.equal(delivery.inputSha256,ctx.inputSha256);assert.deepEqual(await fileIdentity(delivery.archive.file),{bytes:delivery.archive.bytes,sha256:delivery.archive.sha256});
  assert.deepEqual(await fileIdentity(resultFile),delivery.result);console.log(JSON.stringify({...delivery,replayed:true}));return delivery;
 }
 try{
  if(result?.state!=='NATIVE_COMPLETE'){
   // This original source stage immediately adopts its completed result. A fresh
   // selected source stage uses its original UUID requests and native decoder.
   await runSelected(ctx,input.python,['-B',join(input.sourceRoot,PREFIX,'receiving/source-stage.py'),'--input',input.sourceStage.inputFile],lease);
   const baselineBytes=await readFile(input.sourceStage.resultFile),baseline=JSON.parse(baselineBytes);
   if(input.sourceStage.completedResultSha256)assert.equal(hash(baselineBytes),input.sourceStage.completedResultSha256);
   assert.equal(baseline.state,'SOURCE_WORKSPACE_COMPLETE');assert.equal(baseline.operationId,input.operationId);assert.equal(baseline.workspace,input.workspaceDirectory);
   const frozen={};
   for(const [name,selection]of Object.entries(input.frozenSelection)){
    const matches=baseline.frozen.filter(row=>row.source===selection.source&&row.array===selection.array&&(row.cut??null)===(selection.cut??null));
    assert.equal(matches.length,1,'Choose one actual original frozen selection: '+name);frozen[name]=matches[0].id;
   }
   const derived={...input,sourceStage:{...input.sourceStage,resultSha256:hash(baselineBytes)},frozen};
   await save(join(root,'derived-input.json'),derived,{createOnly:true});
   const merchant=await receiveZarrMerchant(derived,ctx.inputSha256);
   assert.equal(merchant.state,'COMPLETE');
   const applications=await receiveZarrApplications({operationId:input.operationId,inputSha256:ctx.inputSha256,
    sourceRoot:input.sourceRoot,sourceManifestSha256:input.sourceManifest.sha256,runtimeDirectory:input.runtimeDirectory,
    workspaceDirectory:input.workspaceDirectory,connectionsFile:merchant.connectionsFile,python:input.python,
    outputDirectory:join(root,'applications'),browser:input.browser});
   assert.equal(applications.value.state,'PASS');assert.equal(applications.value.sameWorkspaceId,baseline.workspaceId);
   result={schema:'stellar-forge.zarr-complete-receiving-result.v1',state:'NATIVE_COMPLETE',operationId:input.operationId,
    inputSha256:ctx.inputSha256,sourceManifestSha256:input.sourceManifest.sha256,completedAt:stamp(),
    workspace:{id:baseline.workspaceId,revision:baseline.revision},sourceStage:{file:input.sourceStage.resultFile,sha256:hash(baselineBytes)},
    merchant:{file:join(root,'merchant/result.json'),...await fileIdentity(join(root,'merchant/result.json'))},
    applications:{file:applications.file,sha256:applications.sha256},
    scope:{originalArrays:baseline.fullArrayCount,originalCells:baseline.fullArrayCells,selectedCells:baseline.additionalSelectedCells,
     nativeResults:baseline.results.length,newArrayReadsInMerchant:0,newPayments:0},
    frozen,engineArchive:input.engineArchive};
   await save(resultFile,result,{createOnly:true});
  }
  assert.equal(result.state,'NATIVE_COMPLETE');
  // Packaging can resume by itself, after all original publisher/browser/app owners close.
  await runSelected(ctx,input.python,['-B',join(input.sourceRoot,PREFIX,'receiving/package.py'),'build',
   '--input',ctx.inputFile,'--result',resultFile,'--directory',join(root,'handover')],lease);
  const packaged=JSON.parse(await readFile(join(root,'handover/package-result.json')));
  assert.equal(packaged.state,'COMPLETE');
  const received=await runJson(input.python,['-B',join(input.sourceRoot,PREFIX,'receiving/START.py'),'receive',
   '--archive',packaged.archive.file,'--sha256',packaged.archive.sha256,'--directory',join(root,'received-handover')],{env:environment(input)});
  assert.equal(received.state,'RECEIVED');assert.equal(received.workspaceId,result.workspace.id);
  delete received.replayed;delete received.currentRevision;
  const oldReceiving=await optional(join(root,'whole-receive.json'));
  if(oldReceiving)assert.deepEqual(received,oldReceiving,'The original independent receiving result changed');
  else await save(join(root,'whole-receive.json'),received,{createOnly:true});
  const reopened=await reopenZarrHandover({input,inputSha256:ctx.inputSha256,received,result,outputDirectory:join(root,'received-open')});
  assert.equal(reopened.state,'PASS');
  delivery={schema:'stellar-forge.zarr-complete-delivery.v1',state:'COMPLETE',operationId:input.operationId,
   inputSha256:ctx.inputSha256,completedAt:stamp(),private:true,workspace:result.workspace,
   result:await fileIdentity(resultFile),archive:packaged.archive,manifest:packaged.manifest,
   receiving:{file:join(root,'whole-receive.json'),...await fileIdentity(join(root,'whole-receive.json'))},
   reopen:{file:reopened.file,sha256:reopened.sha256},scope:result.scope};
  await save(deliveryFile,delivery,{createOnly:true});console.log(JSON.stringify(delivery));return delivery;
 }catch(error){
  await save(join(root,'receiving-failure.json'),{operationId:input.operationId,inputSha256:ctx.inputSha256,at:stamp(),error:errorView(error)}).catch(()=>{});
  throw error;
 }
}
const argv=process.argv.slice(2);
try{
 process.umask(0o077);
 assert(argv.length===2&&['--prepare','--input','--locked-input'].includes(argv[0]),'zarr-receive --prepare PRIVATE_SELECTION.json OR --input SAME_PREPARED_INPUT.json');
 if(argv[0]==='--prepare')await prepare(argv[1]);
 else{
  const ctx=await inputAt(argv[1]);
  if(argv[0]==='--input'){
   const ended=await child(ctx.input.python,['-I','-B','-c',PYTHON_LEASE,ctx.root,process.execPath,SELF,ctx.inputFile],{stdio:'inherit',env:environment(ctx.input)});
   process.exitCode=ended.code??2;
  }else await execute(ctx);
 }
}catch(error){console.error(JSON.stringify({state:'NOT_COMPLETE',code:error.code??'ZARR_RECEIVING_NOT_COMPLETE',message:error.message,recovery:'Keep this exact input, original operation lock, saved native requests and completed artifacts. Resume the same receiving input.'}));process.exitCode=2;}
