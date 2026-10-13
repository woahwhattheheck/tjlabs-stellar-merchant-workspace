#!/usr/bin/env node
// MIT. Continue one original prepared HPD job through the maintained commissioning API.
import {readFile,open,mkdir,lstat,link,unlink} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const normalize=v=>Array.isArray(v)?v.map(normalize):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
const stable=v=>JSON.stringify(normalize(v));
const bytes=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const fault=(code,message)=>Object.assign(new Error(message),{code});
function need(ok,code,message){if(!ok)throw fault(code,message);}
const json=async p=>JSON.parse(await readFile(p,'utf8'));
async function optional(p){try{return await json(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function save(path,raw){
 try{const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&(await readFile(path)).equals(raw),'HPD_RETAINED_CONTENT','Retained complete file differs: '+path);return;}
 catch(e){if(e.code!=='ENOENT')throw e;}
 const temp=path+'.'+randomUUID()+'.partial',h=await open(temp,'wx',0o600);
 try{try{await h.writeFile(raw);await h.sync();}finally{await h.close();}
  try{await link(temp,path);}catch(e){if(e.code!=='EEXIST')throw e;need((await readFile(path)).equals(raw),'HPD_RETAINED_CONTENT','Concurrent source differs.');}
  const d=await open(dirname(path),'r');try{await d.sync();}finally{await d.close();}
 }finally{await unlink(temp);}
}
function options(){
 const [action,...args]=process.argv.slice(2),out={action};
 need(['serve','receive','report','export'].includes(action),'HPD_COMMAND','Choose serve, receive, report or export.');
 for(let i=0;i<args.length;i+=2){const key=args[i];need(['--prepared','--provider','--returns','--out'].includes(key)&&args[i+1]&&!out[key],
   'HPD_ARGUMENT','Choose the documented original preparation/provider/returns/output arguments.');out[key]=args[i+1];}
 need(out['--prepared'],'HPD_ARGUMENT','--prepared is required.');
 if(action==='serve')need(['vellar','periplo'].includes(out['--provider']),'HPD_PROVIDER','Select vellar or periplo.');
 if(action==='receive')need(out['--returns'],'HPD_ARGUMENT','--returns must select actual original result files and the recorded customer decision.');
 if(action==='export')need(out['--out'],'HPD_ARGUMENT','--out must select the receiving directory.');
 return out;
}
async function main(){
 const o=options(),preparedFile=resolve(o['--prepared']),prepared=await json(preparedFile),root=dirname(preparedFile);
 need(prepared.schema==='commons.hpd-two-facilitator-prepared.v1'&&
  prepared.original?.customerId==='a3618289-2faa-4634-9ab6-f063995229ed'&&
  prepared.original?.sessionId==='socrata-hpd-queens-paid-customer-1fb3-20261011',
  'HPD_PREPARATION','Continue the original HPD commissioning preparation.');
 const source=prepared.source,selection=await json(prepared.selectionFile);
 const engine=await import(pathToFileURL(join(source,'products/facilitator-commissioning/commissioning.mjs')));
 const {renderCommissioningReport}=await import(pathToFileURL(join(source,'products/facilitator-commissioning/report.mjs')));
 const {readReleaseState,releaseStatus}=await import(pathToFileURL(join(source,'stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs')));
 const job=await engine.openCommissioningJob({directory:prepared.directory});
 async function command(label,action,payload){
  const path=join(root,'commands',label+'.json'),old=await optional(path);
  if(old)need(old.action===action&&stable(old.payload)===stable(payload),'HPD_COMMAND_CHANGED','Continue the exact original command.');
  const value=old??{operationId:randomUUID(),expectedRevision:(await job.inspect()).revision,action,payload};
  await save(path,bytes(value));
  const result=await job.execute(value);
  await save(join(root,'commands',label+'-result.json'),bytes({...result,replayed:undefined}));
  return result;
 }
 async function report(){
  const current=await job.inspect(),value=await job.report(),name='revision-'+current.revision+'-'+hash(stable({value,current})).slice(0,16);
  await save(join(root,'reports',name+'.json'),bytes(value));
  await save(join(root,'reports',name+'.html'),Buffer.from(renderCommissioningReport(value,current)));
  return {revision:current.revision,state:value.state,usefulTasks:value.usefulTasks,
    originalAttempts:value.originalAttempts,report:join(root,'reports',name+'.html')};
 }
 let result, primaryError;
 try{
  if(o.action==='serve'){
   const provider=o['--provider'],operationId=prepared.runIds[provider],status=await job.inspect();
   if(status.runs.some(r=>r.operationId===operationId)){
    result={state:'ORIGINAL_RUN_RETAINED',operationId,provider,runs:status.runs.filter(r=>r.operationId===operationId),
     native:await releaseStatus(selection.store),
     continuation:'Receive the retained original run and returned buyer files. An uncertain readiness receipt uses the existing receive-run action with its actual native instance.'};
   }else{
    const label='select-'+provider,path=join(root,'commands',label+'.json'),saved=await optional(path);
    const selected=selection.providers.find(p=>p.alias===provider);
    need(selected,'HPD_PROVIDER','The prepared job does not select this provider.');
    const state=await readReleaseState(selection.store);
    const payload=saved?.payload??{provider,expectedGeneration:state.generation,
      reason:'Operate the complete original 144-row Queens HPD customer task on '+provider+'.'};
    need(payload.provider===provider,'HPD_COMMAND_CHANGED','The saved selection belongs to another provider.');
    await command(label,'select',payload);
    const active=await readReleaseState(selection.store);
    need(active.active===selected.releaseId,'HPD_SELECTED_RELEASE_CHANGED','Inspect the original selected release before startup.');
    const run=await job.start({provider,operationId,expectedGeneration:active.generation});
    const {completion,close,...started}=run;
    process.stdout.write(JSON.stringify({state:'ORIGINAL_HPD_PROVIDER_READY',started,
      buyerPlan:prepared.plans.find(p=>p.provider===provider),
      instruction:'Keep this original foreground owner alive while the existing customer runs its two exact prepared buyer requests through the original merchant ingress.'})+'\n');
    await completion;
    result={state:'ORIGINAL_HPD_PROVIDER_STOPPED',provider,operationId,report:await report()};
   }
  }else if(o.action==='receive'){
   const file=resolve(o['--returns']),raw=await readFile(file),returned=JSON.parse(raw),sourceSha=hash(raw);
   need(returned.schema==='commons.hpd-commissioning-returned-attempts.v1'&&
    ['vellar','periplo'].includes(returned.provider)&&
    returned.runOperationId===prepared.runIds[returned.provider]&&Array.isArray(returned.attempts)&&
    returned.attempts.length>=1&&returned.attempts.length<=1000,'HPD_RETURNED_SOURCE','Select the original provider/run and actual complete returned attempts.');
   await save(join(root,'returned',sourceSha+'.json'),raw);
   const replies=[],seen=new Set();
   for(const item of returned.attempts){
    need(object(item)&&['page-1','page-2'].includes(item.requestId)&&
     typeof item.summaryFile==='string'&&typeof item.evidenceFile==='string'&&object(item.receiving),
     'HPD_RETURNED_ATTEMPT','Each returned attempt needs its original page, summary, evidence and actual receiving decision.');
    const payload={provider:returned.provider,requestId:item.requestId,runOperationId:returned.runOperationId,
      summaryFile:resolve(dirname(file),item.summaryFile),evidenceFile:resolve(dirname(file),item.evidenceFile),
      ...(item.outputFile?{outputFile:resolve(dirname(file),item.outputFile)}:{}),
      receiving:item.receiving,...(item.supersedesOperationId?{supersedesOperationId:item.supersedesOperationId}:{})};
    const inputFiles=await Promise.all([payload.summaryFile,payload.evidenceFile,...(payload.outputFile?[payload.outputFile]:[])].map(async path=>{
      const st=await lstat(path);need(st.isFile()&&!st.isSymbolicLink(),'HPD_RETURNED_FILE','Select complete ordinary native result files.');
      const data=await readFile(path),sha256=hash(data),retained=join(root,'returned','source-'+sha256);
      await save(retained,data);return {path,retained,bytes:data.length,sha256};
    }));
    const key=hash(stable({payload,inputFiles}));
    payload.summaryFile=inputFiles[0].retained;payload.evidenceFile=inputFiles[1].retained;
    if(payload.outputFile)payload.outputFile=inputFiles[2].retained;
    need(!seen.has(key),'HPD_RETURNED_DUPLICATE','Each original returned observation appears once in this source file.');seen.add(key);
    // Exact source file identity, command UUID and original revision survive a lost response.
    const received=await command('receive-'+key,'receive',payload);
    await save(join(root,'returned',key+'-sources.json'),bytes({sourceFileSha256:sourceSha,inputFiles,
      provider:returned.provider,requestId:item.requestId,runOperationId:returned.runOperationId,
      operationId:received.operationId}));
    replies.push(received);
   }
   result={state:'ORIGINAL_HPD_ATTEMPTS_RECEIVED',sourceSha256:sourceSha,
     operations:replies.map(x=>({operationId:x.operationId,requestId:x.result.requestId,
       intentId:x.result.intentId,payment:x.result.payment,outputState:x.result.outputState,receiving:x.result.receiving})),
     report:await report()};
  }else if(o.action==='report')result=await report();
  else{
   const out=resolve(o['--out']);
   result={state:'ORIGINAL_HPD_COMMISSIONING_EXPORTED',transfer:await job.export(out),
     originalArchive:prepared.originalArchive,report:await report(),
     completeCustomerIntake:prepared.sourceIntake,customerOutputs:prepared.customerOutputs,
     receiving:'Keep the original completed customer ZIP and complete prepared source/intake beside this commissioning transfer. Receive the original merchant/buyer stores with their maintained recovery tools.'};
  }
 }catch(error){primaryError=error;throw error;}
 finally{
  try{await job.close();}
  catch(closeError){
   if(primaryError){
    const combined=new AggregateError([primaryError,closeError],'The original operation and its job close both failed.');
    combined.code=primaryError.code??'HPD_OPERATION_AND_CLOSE_FAILED';
    throw combined;
   }
   throw closeError;
  }
 }
 if(o.action==='export')result.inspectedTransfer=await engine.inspectCommissioningTransfer(resolve(o['--out']));
 process.stdout.write(JSON.stringify(result)+'\n');
}
main().catch(error=>{process.stderr.write(JSON.stringify({code:error.code??error.name,message:error.message,...(error instanceof AggregateError?{errors:error.errors.map(e=>({code:e?.code??e?.name??'ERROR',message:e?.message??String(e)}))}:{})})+'\n');process.exitCode=1;});
