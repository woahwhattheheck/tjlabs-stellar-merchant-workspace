#!/usr/bin/env node
// MIT. Finish the original current-source operation through its maintained browser callback.
const fs=require('node:fs/promises'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto'),{pathToFileURL}=require('node:url');
const {createRequire}=require('node:module');
const OPERATION='SCF-GRANT-CURRENT-REVIEW-81CF-20261012';
const sha=body=>createHash('sha256').update(body).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const need=(value,message)=>{if(!value)throw Error(message);};
let browserServer,browser,context,listener,output,cfg,origin;
const ownedProcesses=[],launchStages=[];
async function existing(name){try{return JSON.parse(await fs.readFile(path.join(output,name),'utf8'));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function write(name,value){
  const target=path.join(output,name),temporary=target+'.'+randomUUID()+'.tmp';
  await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
  let handle;
  try{handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(json(value));await handle.sync();
    await handle.close();handle=null;await fs.rename(temporary,target);
    const directory=await fs.open(path.dirname(target),'r');try{await directory.sync();}finally{await directory.close();}}
  finally{if(handle)await handle.close().catch(()=>{});await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
async function nativeProcessIdentity(pid){
  const base='/proc/'+pid;
  const [raw,boot,namespace]=await Promise.all([
    fs.readFile(base+'/stat','utf8'),fs.readFile('/proc/sys/kernel/random/boot_id','utf8'),fs.readlink(base+'/ns/pid')
  ]);
  const fields=raw.slice(raw.lastIndexOf(')')+2).trim().split(/\s+/);
  return{pid,host_id:require('node:os').hostname(),boot_id:boot.trim(),pid_namespace:namespace,
    start_ticks:fields[19],parent_pid:Number(fields[1]),process_group_id:Number(fields[2]),
    session_id:Number(fields[3]),process_state:fields[0]};
}
async function checkpoint(){
  if(!context)return;
  const state=await context.storageState({indexedDB:true});
  need(state.origins.every(row=>row.origin===origin),
    'Preserve only this original local reader context in its saved case.');
  await write('browser-storage.json',{schema:'stellar-forge.current-source-browser-storage.v1',
    operationId:OPERATION,sourcePackageSha256:cfg.sourcePackageSha256,origin,
    storedAt:new Date().toISOString(),sha256:sha(json(state)),state});
}
async function stop(){
  if(browser)await Promise.race([browser.close().catch(()=>{}),new Promise(r=>setTimeout(r,5000))]);
  if(browserServer){await Promise.race([browserServer.close().catch(()=>{}),new Promise(r=>setTimeout(r,5000))]);
    const proc=browserServer.process();if(proc&&proc.exitCode===null)proc.kill('SIGKILL');}
  if(listener){listener.server.closeAllConnections?.();await Promise.race([listener.stop().catch(()=>{}),new Promise(r=>setTimeout(r,3000))]);}
}
(async()=>{
  cfg=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
  need(cfg.operationId===OPERATION&&cfg.nodeModules&&cfg.chromium,
    'Continue the original source phase with its explicit equipped browser paths.');
  output=path.resolve(cfg.outputDirectory);await fs.mkdir(output,{recursive:true,mode:0o700});
  const savedSession=await existing('browser-session.json'),savedStorage=await existing('browser-storage.json');
  if(savedSession)need(savedSession.operationId===OPERATION&&savedSession.sourcePackageSha256===cfg.sourcePackageSha256,
    'Retain the original source-specific browser session.');
  if(savedStorage)need(savedStorage.schema==='stellar-forge.current-source-browser-storage.v1'&&
    savedStorage.operationId===OPERATION&&savedStorage.sourcePackageSha256===cfg.sourcePackageSha256&&
    savedSession&&savedStorage.origin===savedSession.origin&&sha(json(savedStorage.state))===savedStorage.sha256,
    'Reopen the complete retained original browser store.');
  const req=createRequire(path.join(cfg.nodeModules,'playwright/package.json'));
  const {chromium}=req('playwright'),version=req('playwright/package.json').version.split('.').map(Number);
  need(version[0]>1||version[0]===1&&version[1]>=51,
    'Use the installed Playwright version that preserves IndexedDB in complete browser storage.');
  const site=path.join(path.resolve(cfg.sourceRoot),'stellar-forge/developer-site');
  const {startGrantApplication}=await import(pathToFileURL(path.join(site,'grant.mjs')));
  const selectedPort=savedSession?Number(new URL(savedSession.origin).port):0;
  listener=await startGrantApplication({port:selectedPort});
  origin=new URL(listener.url).origin;
  need(!savedSession||origin===savedSession.origin,
    'Reopen this source edition at its original retained local origin.');
  if(!savedSession)await write('browser-session.json',{schema:'stellar-forge.current-source-browser-session.v1',
    operationId:OPERATION,sourcePackageSha256:cfg.sourcePackageSha256,origin,startedAt:new Date().toISOString()});
  browserServer=await chromium.launchServer({headless:true,executablePath:cfg.chromium,
    args:['--no-sandbox','--disable-dev-shm-usage'],env:{...process.env,TMPDIR:cfg.temporaryDirectory||process.env.TMPDIR}});
  const launched=browserServer.process();need(launched&&launched.pid,'Retain the actual launched browser process.');
  ownedProcesses.push({owner:await nativeProcessIdentity(process.pid),process:await nativeProcessIdentity(launched.pid)});
  launchStages.push({name:'browser-process-started',at:new Date().toISOString(),owned_processes:ownedProcesses});
  await write('progress.json',{operationId:OPERATION,stages:launchStages});
  browser=await chromium.connect(browserServer.wsEndpoint());
  context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,
    ...(savedStorage?{storageState:savedStorage.state}:{})});
  const page=await context.newPage();
  page.on('dialog',dialog=>dialog.accept().catch(()=>{}));
  const {receiveCurrentSourceBrowser}=await import(pathToFileURL(path.join(__dirname,'receive-current-source-browser.mjs')));
  const result=await receiveCurrentSourceBrowser(page,{inputPath:cfg.browserInputPath,outputDirectory:output,
    expectedOrigin:origin,ownedProcesses,checkpoint});
  await checkpoint();
  need(result.state==='COMPLETE'&&result.sourcePackageSha256===cfg.sourcePackageSha256,
    'Complete the same selected source, editor, review and independent browser receiving.');
  console.log('SCF_SOURCE_BROWSER_COMPLETE '+JSON.stringify({operationId:OPERATION,
    sourceRecords:result.sourceRecords,originalDraftId:result.originalDraftId,
    originalReviewId:result.originalReviewId,retainedReviewActions:result.retainedReviewActions}));
})().catch(async error=>{
  if(output){let checkpointError=null;
    try{await checkpoint();}catch(failure){checkpointError=failure.message;}
    await write('BROWSER_RECEIVER_INCOMPLETE.json',{operationId:OPERATION,error:error.message,
      stack:error.stack,checkpointError,origin,ownedProcesses,at:new Date().toISOString()}).catch(()=>{});}
  console.error(error.stack||error.message);process.exitCode=1;
}).finally(stop);
