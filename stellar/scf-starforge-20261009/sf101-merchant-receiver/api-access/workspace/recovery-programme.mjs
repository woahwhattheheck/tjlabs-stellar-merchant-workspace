#!/usr/bin/env node
// MIT. Original-data capture / independent receiving, with durable same-ID phases.
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openApiPassRecovery} from './recovery-jobs.mjs';
import {serveConfiguredWorkspace} from './cli.mjs';
import {initializationDirectory,retainInitializationRecord,retainInitializationFile} from '../../../sf88-operator-buyer-cli/initialization.mjs';
import {absolute,need,UUID,sha,canonical,same,codeOf,jsonFile,optionalJson,file,present} from './recovery-files.mjs';
export const API_PASS_RECOVERY_PROGRAMME_SCHEMA='stellar-forge.sf101.api-customer-recovery-programme.v1';
function phaseId(operationId,name){const h=sha(operationId+'\n'+name).slice(0,32).split('');h[12]='4';h[16]='89ab'[parseInt(h[16],16)%4];const s=h.join('');return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');}
async function http(app,path,body){
 const url=new URL(app.url),token=url.hash.slice(1);url.hash='';const base=url.origin;
 const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json',Origin:base})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const bytes=Buffer.from(await response.arrayBuffer());need(response.ok,'API_RECOVERY_PROGRAMME_HTTP_FAILED');
 return {bytes,headers:response.headers,json:()=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))};
}
export async function runApiPassRecoveryProgramme(input,{environment=process.env}={}){
 need(input?.schema===API_PASS_RECOVERY_PROGRAMME_SCHEMA&&UUID.test(input.operationId??'')&&['capture','receive'].includes(input.mode),'API_RECOVERY_PROGRAMME_INPUT_REQUIRED');
 need(Object.keys(input).every(k=>['schema','operationId','mode','directory','journalDirectory','source','bundle','output','passEnv','python','expectedStateRoot','recipientEdit','browser','quiesced'].includes(k)),'API_RECOVERY_PROGRAMME_INPUT_INVALID');
 const out=absolute(input.directory),journalDirectory=absolute(input.journalDirectory),passEnv=input.passEnv??'SF88_BACKUP_PASSPHRASE',python=input.python??'/usr/bin/python3';
 await initializationDirectory(out,{create:true});
 await retainInitializationRecord(join(out,'programme-input.json'),input,{resume:true});
 const terminal=await optionalJson(join(out,'programme-result.json'));
 if(terminal){
  need(terminal.operationId===input.operationId&&terminal.inputSha256===sha(canonical(input)),'API_RECOVERY_PROGRAMME_BINDING_CHANGED');
  for(const a of terminal.artifacts){const x=await file(a.path);need(x.bytes===a.bytes&&x.sha256===a.sha256,'API_RECOVERY_PROGRAMME_ARTIFACT_CHANGED');}
  return {...terminal,reused:true};
 }
 const r=await openApiPassRecovery({directory:journalDirectory,...(input.mode==='capture'?{source:input.source}:{}),environment});
 let app=null,runResult;const artifacts=[];
 async function retain(name,value){
  const path=join(out,name);await retainInitializationRecord(path,value,{resume:true});
  artifacts.push({name,...await file(path)});return value;
 }
 async function operation(name,kind,options){
  const requestId=phaseId(input.operationId,name),prior=await optionalJson(join(out,name+'.json'));
  let current=await r.start({requestId,kind,options});
  if(current.state!=='COMPLETED'){
   if(current.state!=='RUNNING'&&current.state!=='CANCELLING')current=await r.resume(requestId);
   current=await r.wait(requestId);
  }
  need(current.state==='COMPLETED','API_RECOVERY_PROGRAMME_OPERATION_INCOMPLETE');
  if(prior){need(prior.requestId===requestId&&prior.kind===kind&&same(prior.result,current.result),'API_RECOVERY_PROGRAMME_PHASE_CHANGED');return retain(name+'.json',prior);}
  return retain(name+'.json',current);
 }
 try{
  if(input.mode==='capture'){
   need(input.source&&input.output&&input.quiesced===true,'API_RECOVERY_PROGRAMME_SOURCE_REQUIRED');
   let review=await optionalJson(join(out,'source-review.json'));if(!review)review=await r.review();
   await retain('source-review.json',review);
   const capture=await operation('capture','SNAPSHOT',{output:absolute(input.output),expectedReviewSha256:review.profile.reviewSha256,passEnv,quiesced:true});
   const verified=await operation('verify','VERIFY',{bundle:capture.result.bundle,passEnv,python});
   need(capture.result.recordSha256===verified.result.recordSha256,'API_RECOVERY_PROGRAMME_CAPTURE_CHANGED');
   const files=await r.encryptedFiles(verified.requestId);await retain('encrypted-files.json',files);
   runResult={mode:input.mode,captureRequestId:capture.requestId,verifyRequestId:verified.requestId,recordSha256:verified.result.recordSha256,
    workspaceId:review.profile.workspaceId,revision:review.profile.revision,bundle:files.bundle,encryptedFileCount:files.files.length,executionStarted:false};
  }else{
   need(input.bundle&&input.expectedStateRoot,'API_RECOVERY_PROGRAMME_RECEIVING_REQUIRED');
   const verified=await operation('verify','VERIFY',{bundle:absolute(input.bundle),passEnv,python});
   const restored=await operation('restore','RESTORE',{verifiedRequestId:verified.requestId,expectedStateRoot:absolute(input.expectedStateRoot),passEnv,python});
   const launch=await r.openResult(restored.requestId);
   app=await serveConfiguredWorkspace({...launch,environment,approvalMode:'terminal'});
   const before=(await http(app,'/api/state')).json();need(before.id===launch.workspaceId,'API_RECOVERY_PROGRAMME_CUSTOMER_CHANGED');
   const savedBefore=await optionalJson(join(out,'customer-first-open.json'));
   if(savedBefore)need(savedBefore.id===before.id,'API_RECOVERY_PROGRAMME_CUSTOMER_CHANGED');
   const baseline=await retain('customer-first-open.json',savedBefore??before);
   const histories=[];
   for(const profile of baseline.profiles){
    const history=(await http(app,'/api/profiles/'+profile.id+'/export')).json();need(history.profile.id===profile.id,'API_RECOVERY_PROGRAMME_HISTORY_CHANGED');
    histories.push({id:profile.id,orderReference:history.profile.orderReference,calls:history.calls.length,tasks:history.tasks.length});
   }
   const inventory={workspaceId:before.id,profiles:histories,executionStarted:false};
   await retain('original-history-inventory.json',await optionalJson(join(out,'original-history-inventory.json'))??inventory);
   if(input.recipientEdit){
    const v=input.recipientEdit;need(UUID.test(v.profileId??'')&&typeof v.label==='string'&&Object.keys(v).every(k=>['profileId','label'].includes(k)),'API_RECOVERY_PROGRAMME_EDIT_INVALID');
    const profile=before.profiles.find(p=>p.id===v.profileId);need(profile,'API_RECOVERY_PROGRAMME_EDIT_PROFILE_MISSING');
    const intent=await optionalJson(join(out,'recipient-edit-request.json'))??{operationId:phaseId(input.operationId,'recipient-edit'),expectedRevision:before.revision,label:v.label,archived:profile.archived};
    await retain('recipient-edit-request.json',intent);
    const returned=(await http(app,'/api/profiles/'+v.profileId+'/update',intent)).json();
    need(returned.state.id===before.id&&returned.state.profiles.find(p=>p.id===v.profileId)?.label===v.label,'API_RECOVERY_PROGRAMME_EDIT_CHANGED');
    await retain('recipient-edit-result.json',await optionalJson(join(out,'recipient-edit-result.json'))??returned);
   }
   const after=(await http(app,'/api/state')).json();
   need(after.id===baseline.id&&same(after.profiles.map(p=>[p.id,p.orderReference,p.manifestSha256]),baseline.profiles.map(p=>[p.id,p.orderReference,p.manifestSha256])),'API_RECOVERY_PROGRAMME_NATIVE_IDENTITY_CHANGED');
   await retain('customer-after.json',await optionalJson(join(out,'customer-after.json'))??after);
   await app.close();app=null;
   app=await serveConfiguredWorkspace({...await r.openResult(restored.requestId),environment,approvalMode:'terminal'});
   const cold=(await http(app,'/api/state')).json();
   need(cold.id===after.id&&(!input.recipientEdit||cold.profiles.find(p=>p.id===input.recipientEdit.profileId)?.label===input.recipientEdit.label),'API_RECOVERY_PROGRAMME_COLD_REOPEN_CHANGED');
   await retain('cold-reopen.json',await optionalJson(join(out,'cold-reopen.json'))??cold);
   let browserResult=null;
   if(input.browser){
    need(typeof input.browser.module==='string'&&typeof input.browser.executable==='string','API_RECOVERY_PROGRAMME_BROWSER_REQUIRED');
    const {chromium}=await import(pathToFileURL(absolute(input.browser.module)).href),browser=await chromium.launch({headless:true,executablePath:absolute(input.browser.executable),args:['--no-sandbox']});
    try{
     const page=await browser.newPage({viewport:{width:1280,height:900}});const failures=[];page.on('pageerror',e=>failures.push(e.message));
     const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/state'&&r.ok());
     await page.goto(app.url,{waitUntil:'networkidle'});
     const received=await (await response).json();need(received.id===cold.id&&failures.length===0,'API_RECOVERY_PROGRAMME_BROWSER_STATE_CHANGED');
     const image=await page.screenshot({fullPage:true}),path=join(out,'restored-customer.png');
     if(!(await present(path)))await retainInitializationFile(path,image);
     artifacts.push({name:'restored-customer.png',...await file(path)});
     browserResult={originalStateReceived:true,urlOrigin:new URL(app.url).origin,workspaceId:cold.id};
    }finally{await browser.close();}
   }
   await app.close();app=null;
   runResult={mode:input.mode,verifyRequestId:verified.requestId,restoreRequestId:restored.requestId,recordSha256:restored.result.recordSha256,
    workspaceId:cold.id,baselineRevision:baseline.revision,currentRevision:cold.revision,recipientEdit:input.recipientEdit??null,browser:browserResult,
    originalCustomerReopened:true,coldReopened:true,executionStarted:false};
  }
 }finally{try{await app?.close();}finally{await r.close();}}
 const result={schema:API_PASS_RECOVERY_PROGRAMME_SCHEMA,operationId:input.operationId,inputSha256:sha(canonical(input)),status:'COMPLETED',completedAt:new Date().toISOString(),...runResult,artifacts};
 await retainInitializationRecord(join(out,'programme-result.json'),result);return result;
}
export async function main(argv=process.argv.slice(2)){
 need(argv.length===2&&argv[0]==='--input','API_RECOVERY_PROGRAMME_INPUT_REQUIRED');
 const result=await runApiPassRecoveryProgramme((await jsonFile(absolute(argv[1]),65536)).value);process.stdout.write(JSON.stringify(result)+'\n');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{process.stderr.write(JSON.stringify({error:codeOf(e)})+'\n');process.exitCode=1;});
