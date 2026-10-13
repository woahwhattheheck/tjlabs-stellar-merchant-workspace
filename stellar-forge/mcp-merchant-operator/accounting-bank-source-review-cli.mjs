#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Named review proposals use the original Bank source preparation operation.
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,readdir,rename,link,unlink} from 'node:fs/promises';
import {resolve,join,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {privateSupportDirectory,writePrivate} from './host-files.mjs';
import {acquireStateLease} from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {connectAccountingBankSourcesClient} from './accounting-bank-sources-client.mjs';
import {prepareAccountingBankSourcesOperation,runAccountingBankSourcesOperation,downloadAccountingBankSourcesOperation}
 from './accounting-bank-sources-cli.mjs';
import {canonicalHash} from './accounting-bank-sources-contract.mjs';
import {
 REVIEW_SCHEMA,REVIEW_LIMITS,reviewBytes,reviewEqual,createSourceReview,
 readSourceReviewBytes,newReviewDraft,saveReviewEdition,previewSourceReviewReturn,
 decideSourceReviewReturn,verifyDecisionReceipt,captureBankSourceReviewCapsule,
 verifyBankSourceReviewForward,bankSourceReviewSummary
} from './accounting-bank-source-review-client.mjs';

const BINDING=REVIEW_SCHEMA+'.forwarding',CONTEXT_FILES=['issued.json','returned.json','current-capsule.json','decision.json'];
const now=()=>new Date().toISOString(),sha=b=>createHash('sha256').update(b).digest('hex');
const pin=(name,bytes)=>({name,bytes:bytes.length,sha256:sha(bytes)});
const problem=e=>({code:e?.code??'ERROR',message:String(e?.message??e),...(e?.releaseError?{releaseError:e.releaseError}:{})});
const need=(yes,message,code='SOURCE_REVIEW_ARGUMENTS')=>{if(!yes)throw Object.assign(new Error(message),{code});};
const json=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
async function sync(path){const f=await open(path,constants.O_RDONLY);try{await f.sync();}finally{await f.close();}}
async function directory(path){
 path=resolve(path);await privateSupportDirectory(path);const st=await lstat(path);
 need(await realpath(path)===path&&(!process.getuid||st.uid===process.getuid()),'Use an owner-controlled private directory without symlink ancestors.');
 return path;
}
async function exists(path){try{return await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function read(path,limit=REVIEW_LIMITS.packageBytes,{allowLinks=false,allowEmpty=false}={}){
 path=resolve(path);await directory(dirname(path));
 const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{const st=await f.stat();
  need(st.isFile()&&(st.size>0||allowEmpty)&&st.size<=limit&&!(st.mode&0o077)&&(!process.getuid||st.uid===process.getuid())&&(allowLinks||st.nlink===1),'Use a complete private regular source file within its limit.');
  const bytes=await f.readFile(),after=await f.stat();
  need(bytes.length===st.size&&st.dev===after.dev&&st.ino===after.ino&&st.size===after.size&&st.mtimeMs===after.mtimeMs,'The selected source file changed while reading.');
  return {bytes,stat:after};
 }finally{await f.close();}
}
// A killed link publication may retain only this writer's exact same-inode temporary.
// Settle it only on a mutating command with the complete expected bytes in hand.
async function settle(path,bytes){
 const selected=await read(path,bytes.length,{allowLinks:true});
 need(selected.bytes.equals(Buffer.from(bytes)),'Preserve the existing different file; choose a distinct destination.','SOURCE_REVIEW_OUTPUT_EXISTS');
 if(selected.stat.nlink!==1){
  for(const name of await readdir(dirname(path))){
   if(!/^\.bank-review-writing-[a-f0-9-]{36}$/.test(name))continue;
   const candidate=join(dirname(path),name),st=await lstat(candidate);
   if(st.isFile()&&st.dev===selected.stat.dev&&st.ino===selected.stat.ino){
    need(!(st.mode&0o077)&&(!process.getuid||st.uid===process.getuid()),'An interrupted publication has an unknown owner.');
    await unlink(candidate);
   }
  }
  await sync(dirname(path));
  const after=await read(path,bytes.length);
  need(after.bytes.equals(Buffer.from(bytes)),'The settled original file changed.');
 }
 return pin(basename(path),bytes);
}
async function retain(path,bytes){
 bytes=Buffer.from(bytes);path=resolve(path);const parent=await directory(dirname(path));
 need(bytes.length>0&&bytes.length<=REVIEW_LIMITS.workingBytes,'Keep the complete output within 256 MiB; no file was shortened.');
 if(await exists(path))return settle(path,bytes);
 const tmp=join(parent,'.bank-review-writing-'+randomUUID());let failure;
 try{
  await writePrivate(tmp,bytes);
  try{await link(tmp,path);}catch(e){if(e.code!=='EEXIST')throw e;await settle(path,bytes);}
  await unlink(tmp);await sync(parent);return await settle(path,bytes);
 }catch(e){failure=e;throw e;}
 finally{try{await unlink(tmp);}catch(e){if(e.code!=='ENOENT'){if(failure)failure.releaseError=problem(e);else throw e;}}}
}
async function locked(path,work){
 const lease=await acquireStateLease(path);let failure;
 try{return await work(lease);}catch(e){failure=e;throw e;}
 finally{try{await lease.close();}catch(e){if(failure)failure.releaseError=problem(e);else throw e;}}
}
function endpoint(value){
 const u=new URL(value);need(!u.username&&!u.password&&!u.hash&&!u.search&&(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','[::1]'].includes(u.hostname)),'Use the existing HTTPS or loopback HTTP endpoint without embedded credentials.');
 return u.href;
}
function target({url,workspace,tokenEnv='MCP_ACCESS_TOKEN'}){
 need(/^[a-z0-9][a-z0-9_-]{0,63}$/.test(workspace??'')&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(tokenEnv),'Keep the original configured workspace alias and token environment variable.');
 return {url:endpoint(url),workspace,tokenEnv};
}
function validateBinding(value){
 need(value?.schema===BINDING&&typeof value.sha256==='string','Open the complete retained forwarding binding.');
 const {sha256,...body}=value;
 need(canonicalHash(body)===sha256&&reviewEqual(value.target,target(value.target)),'The retained forwarding target or body changed.');
 need(Array.isArray(value.files)&&value.files.length===4&&value.files.every((p,i)=>p.name===CONTEXT_FILES[i]&&Number.isSafeInteger(p.bytes)&&p.bytes>0&&/^[a-f0-9]{64}$/.test(p.sha256)),'Keep the four complete original review inputs.');
 return value;
}
async function validateContext(path,{settleLinks=false}={}){
 path=await directory(path);
 const binding=validateBinding(json((await read(join(path,'binding.json'),9*1024*1024,{allowLinks:settleLinks})).bytes));
 if(settleLinks)await settle(join(path,'binding.json'),reviewBytes(binding,9*1024*1024));
 const bytes=[];
 for(const p of binding.files){
  const raw=(await read(join(path,p.name),p.bytes,{allowLinks:settleLinks})).bytes;
  need(raw.length===p.bytes&&sha(raw)===p.sha256,'A complete retained review input changed.');
  if(settleLinks)await settle(join(path,p.name),raw);bytes.push(raw);
 }
 const verified=await verifyBankSourceReviewForward({issuedBytes:bytes[0],returnedBytes:bytes[1],currentCapsuleBytes:bytes[2],decision:json(bytes[3])});
 need(verified.workspaceId===binding.workspaceId&&verified.decision.id===binding.decisionId&&verified.decision.sha256===binding.decisionSha256&&verified.requestSha256===binding.requestSha256&&reviewEqual(verified.request,binding.request),'The forwarding record no longer matches the complete author decision.');
 return {directory:path,binding,verified};
}
/** Retain four complete inputs and exact endpoint/request. No provider call occurs. */
export async function retainBankSourceReviewForward({directory:path,issuedBytes,returnedBytes,currentCapsuleBytes,decisionBytes,url,workspace,tokenEnv}={}){
 const decision=json(decisionBytes),verified=await verifyBankSourceReviewForward({issuedBytes,returnedBytes,currentCapsuleBytes,decision});
 const selectedTarget=target({url,workspace,tokenEnv}),all=[issuedBytes,returnedBytes,currentCapsuleBytes,decisionBytes];
 const body={schema:BINDING,workspaceId:verified.workspaceId,decisionId:decision.id,decisionSha256:decision.sha256,requestSha256:decision.requestSha256,
  target:selectedTarget,request:verified.request,files:all.map((b,i)=>pin(CONTEXT_FILES[i],b))};
 const binding={...body,sha256:canonicalHash(body)};
 need(all.reduce((n,b)=>n+b.length,0)+reviewBytes(binding).length<=REVIEW_LIMITS.workingBytes,'The full retained source/decision record exceeds 256 MiB.');
 path=resolve(path);await directory(dirname(path));
 try{await mkdir(path,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
 await directory(path);
 return locked(path,async lease=>{
  lease.assertHeld();for(let i=0;i<all.length;i++)await retain(join(path,CONTEXT_FILES[i]),all[i]);
  await retain(join(path,'binding.json'),reviewBytes(binding));await sync(path);
  const retained=await validateContext(path);
  return {directory:path,phase:verified.request?'LOCAL_REVIEW_RETAINED':'REVIEW_CLOSED_WITHOUT_EDIT',decisionId:decision.id,
   preparationId:verified.request?.requestId??null,requestSha256:verified.requestSha256,bindingSha256:retained.binding.sha256};
 });
}
/** Pure local inspection. It never repairs or contacts a provider. */
export async function inspectBankSourceReviewForward({directory:path}={}){
 const c=await validateContext(path);return {directory:c.directory,binding:c.binding,summary:bankSourceReviewSummary(c.verified.issued)};
}
async function checkOriginalOperation(path,c){
 await directory(path);const saved=json((await read(join(path,'request.json'),9*1024*1024)).bytes),{sha256,...body}=saved;
 need(saved.schema==='stellar-forge.accounting-bank-sources-client-request.v1'&&sha(Buffer.from(JSON.stringify(body)))===sha256&&
  saved.url===c.binding.target.url&&saved.workspace===c.binding.target.workspace&&saved.tokenEnv===c.binding.target.tokenEnv&&
  saved.requestSha256===c.binding.requestSha256&&reviewEqual(saved.request,c.verified.request),'The original retained source operation belongs to another complete request.');
 return path;
}
async function completeLocalStage(path,c){
 const entries=await readdir(path);
 need(entries.every(n=>['request.json','state.json'].includes(n)),'Preserve a local staging directory with unknown members.');
 if(!entries.includes('request.json')||!entries.includes('state.json'))return false;
 // Only the original local preparer can write here, and no provider effect is
 // permitted before rename. Preserve torn JSON as an incomplete owned attempt.
 let request,state;
 const rawRequest=(await read(join(path,'request.json'),9*1024*1024,{allowEmpty:true})).bytes;
 const rawState=(await read(join(path,'state.json'),32*1024*1024,{allowEmpty:true})).bytes;
 try{request=json(rawRequest);state=json(rawState);}catch{return false;}
 await checkOriginalOperation(path,c);
 need(state?.schema==='stellar-forge.accounting-bank-sources-client-state.v1'&&
  state.requestSha256===request.sha256&&state.sourceRequestSha256===request.requestSha256&&
  state.phase==='LOCAL_PREPARED'&&state.prepareAttempted===false&&state.executeAttempted===false&&
  state.observation===null&&state.preparedAt===request.preparedAt&&Number.isFinite(Date.parse(state.updatedAt)),
  'An unpublished original operation contains unexpected state; preserve it without dispatch.');
 return true;
}
async function sourceOperation(c,lease){
 const final=join(c.directory,'source-operation');
 if(await exists(final))return checkOriginalOperation(final,c);
 const attempts=join(c.directory,'local-preparation-attempts');
 try{await mkdir(attempts,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}await directory(attempts);
 // A staging directory cannot have caused any provider effect: only the published
 // original operation below is allowed to run. Preserve every interrupted attempt.
 for(const name of await readdir(attempts)){
  if(!/^[a-f0-9-]{36}\.json$/.test(name))continue;
  const markerPath=join(attempts,name),markerBytes=(await read(markerPath,1024*1024,{allowLinks:true})).bytes,marker=json(markerBytes);
  need(marker.schema===BINDING+'.local-prepare'&&marker.bindingSha256===c.binding.sha256&&marker.id===name.slice(0,-5),'A local preparation attempt has unknown ownership.');
  await settle(markerPath,markerBytes);
  const staging=join(c.directory,'.source-operation-'+marker.id);
  if(!(await exists(staging)))continue;
  await directory(staging);
  if(await completeLocalStage(staging,c)){
   await checkOriginalOperation(staging,c);lease.assertHeld();await rename(staging,final);await sync(c.directory);
   return checkOriginalOperation(final,c);
  }
  lease.assertHeld();await rename(staging,join(attempts,marker.id+'.incomplete'));await sync(attempts);await sync(c.directory);
 }
 const id=randomUUID(),staging=join(c.directory,'.source-operation-'+id);
 await retain(join(attempts,id+'.json'),reviewBytes({schema:BINDING+'.local-prepare',id,bindingSha256:c.binding.sha256,createdAt:now()}));
 lease.assertHeld();await prepareAccountingBankSourcesOperation({directory:staging,...c.binding.target,request:c.verified.request});
 await checkOriginalOperation(staging,c);lease.assertHeld();await rename(staging,final);await sync(c.directory);
 return checkOriginalOperation(final,c);
}
/** Read-only reconciliation by default. Only explicit retain/execute forwards mutation. */
export async function forwardBankSourceReview({directory:path,mode='reconcile',client,environment=process.env,signal}={}){
 need(['reconcile','retain','execute'].includes(mode),'Choose reconcile, retain or execute explicitly.');
 path=await directory(path);
 return locked(path,async lease=>{
  const c=await validateContext(path,{settleLinks:true});
  if(!c.verified.request)return {directory:path,mode,state:'REVIEW_CLOSED_WITHOUT_EDIT',decisionId:c.verified.decision.id,attempted:[]};
  const original=await sourceOperation(c,lease);lease.assertHeld();
  const result=await runAccountingBankSourcesOperation({directory:original,mode,client,environment,signal});
  if(result.receipt?.state!=='NOT_FOUND')await verifyDecisionReceipt(c.verified.decision,result.receipt);
  return {...result,reviewDirectory:path,decisionId:c.verified.decision.id};
 });
}
/** Download every actual immutable input/report/output through the unchanged reader. */
export async function downloadBankSourceReviewResult({directory:path,output,client,environment=process.env,signal}={}){
 path=await directory(path);
 return locked(path,async lease=>{
  const c=await validateContext(path,{settleLinks:true});need(c.verified.request,'This all-keep decision has no new source preparation.');
  const original=await checkOriginalOperation(join(path,'source-operation'),c);lease.assertHeld();
  return downloadAccountingBankSourcesOperation({directory:original,output,all:true,client,environment,signal});
 });
}
function options(args,allowed){
 const out={};for(let i=0;i<args.length;i+=2){need(allowed.includes(args[i])&&!Object.hasOwn(out,args[i])&&args[i+1]!==undefined,'Use documented option/value pairs without duplicates.');out[args[i]]=args[i+1];}return out;
}
function required(v,key){need(typeof v[key]==='string'&&v[key].length,'Supply '+key+'.');return v[key];}
const input=async(v,k,limit=REVIEW_LIMITS.packageBytes)=>(await read(resolve(required(v,k)),limit)).bytes;
async function output(v,value,limit=REVIEW_LIMITS.packageBytes){const path=resolve(required(v,'--out')),bytes=value instanceof Uint8Array?value:reviewBytes(value,limit);const selected=await retain(path,bytes);return {output:path,...selected};}
const HELP='Bank named source review through the original source collection engine\n\n'+
'capture --url URL --workspace ALIAS --preparation UUID --out PRIVATE_CAPSULE [--token-env NAME]\n'+
'issue --capsule FILE --name BASENAME --author NAME --recipient NAME --purpose TEXT --id UUID --at ISO --out PRIVATE_REVIEW [--collection-file NAME]\n'+
'inspect --file PRIVATE_REVIEW\n'+
'draft --review FILE --out PRIVATE_DRAFT\n'+
'edition --review FILE --draft FILE --status draft|submitted --id UUID --at ISO --out PRIVATE_RETURN\n'+
'compare --issued FILE --returned FILE --current CAPSULE --edition SHA --out PRIVATE_COMPARISON [--collection-file NAME]\n'+
'decide --issued FILE --returned FILE --current CAPSULE --selection PRIVATE_JSON --out PRIVATE_DECISION\n'+
'retain --issued FILE --returned FILE --current CAPSULE --decision FILE --dir PRIVATE_REVIEW_DIR --url URL --workspace ALIAS [--token-env NAME]\n'+
'inspect-retained --dir PRIVATE_REVIEW_DIR\n'+
'forward --dir ORIGINAL_REVIEW_DIR [--mode reconcile|retain|execute]\n'+
'download --dir ORIGINAL_REVIEW_DIR --out PRIVATE_RESULT_DIR\n\n'+
'retain is local only. forward defaults to read-only reconciliation; retain/execute are explicit modes.\n'+
'Every command preserves complete files, named reviewer history and exact original author request UUID.\n'+
'The original controller creates a new collection edition only; no financial import/match/close occurs.\n'+
'Use private 0700 directories/0600 files. Secrets stay in the token environment variable.\n'+
'Exit 0 local/read/complete; 3 an original forwarded preparation is not complete; 2 error. No retry loop.\n';
export async function main(args=process.argv.slice(2)){
 if(!args.length||args.length===1&&['help','--help'].includes(args[0])){process.stdout.write(HELP);return;}
 const [cmd,...rest]=args;let result;
 if(cmd==='capture'){
  const v=options(rest,['--url','--workspace','--preparation','--out','--token-env']);
  const client=await connectAccountingBankSourcesClient({url:required(v,'--url'),workspace:required(v,'--workspace'),tokenEnv:v['--token-env']??'MCP_ACCESS_TOKEN'});let failure;
  try{await client.open();const c=await captureBankSourceReviewCapsule({client,preparationId:required(v,'--preparation')});result=await output(v,c.bytes);}
  catch(e){failure=e;throw e;}finally{try{await client.disconnect();}catch(e){if(failure)failure.releaseError=problem(e);else throw e;}}
 }else if(cmd==='issue'){
  const v=options(rest,['--capsule','--name','--author','--recipient','--purpose','--id','--at','--out','--collection-file']);
  result=await output(v,await createSourceReview({capsuleBytes:await input(v,'--capsule',REVIEW_LIMITS.capsuleBytes),capsuleName:required(v,'--name'),author:required(v,'--author'),recipient:required(v,'--recipient'),purpose:required(v,'--purpose'),id:required(v,'--id'),createdAt:required(v,'--at'),collectionFile:v['--collection-file']??'collection.json'}));
 }else if(cmd==='inspect'){
  const v=options(rest,['--file']);result=bankSourceReviewSummary(await readSourceReviewBytes(await input(v,'--file')));
 }else if(cmd==='draft'){
  const v=options(rest,['--review','--out']);result=await output(v,newReviewDraft(await readSourceReviewBytes(await input(v,'--review'))));
 }else if(cmd==='edition'){
  const v=options(rest,['--review','--draft','--status','--id','--at','--out']);
  const original=await readSourceReviewBytes(await input(v,'--review'));
  result=await output(v,await saveReviewEdition(original.value,json(await input(v,'--draft')),{status:required(v,'--status'),id:required(v,'--id'),createdAt:required(v,'--at')}));
 }else if(['compare','decide','retain'].includes(cmd)){
  const keys=['--issued','--returned','--current',...(cmd==='compare'?['--edition','--collection-file','--out']:cmd==='decide'?['--selection','--out']:['--decision','--dir','--url','--workspace','--token-env'])];
  const v=options(rest,keys),issuedBytes=await input(v,'--issued'),returnedBytes=await input(v,'--returned'),currentCapsuleBytes=await input(v,'--current',REVIEW_LIMITS.capsuleBytes);
  if(cmd==='retain')result=await retainBankSourceReviewForward({directory:required(v,'--dir'),issuedBytes,returnedBytes,currentCapsuleBytes,decisionBytes:await input(v,'--decision'),url:required(v,'--url'),workspace:required(v,'--workspace'),tokenEnv:v['--token-env']??'MCP_ACCESS_TOKEN'});
  else{
   const issued=(await readSourceReviewBytes(issuedBytes)).value,returned=(await readSourceReviewBytes(returnedBytes)).value;
   if(cmd==='compare')result=await output(v,await previewSourceReviewReturn({issued,returned,currentCapsuleBytes,editionSha256:required(v,'--edition'),collectionFile:v['--collection-file']??'collection.json'}));
   else{
    const s=json(await input(v,'--selection'));
    need(s&&Object.keys(s).every(k=>['collectionFile','editionSha256','expectedComparisonSha256','choices','actor','reason','id','requestId','createdAt'].includes(k))&&['editionSha256','expectedComparisonSha256','choices','actor','reason','id','requestId','createdAt'].every(k=>Object.hasOwn(s,k)),'Keep the complete explicit comparison, decisions and original UUID/time in selection JSON.');
    result=await output(v,await decideSourceReviewReturn({...s,issued,returned,currentCapsuleBytes}));
   }
  }
 }else if(cmd==='inspect-retained'){
  const v=options(rest,['--dir']);result=await inspectBankSourceReviewForward({directory:required(v,'--dir')});
 }else if(cmd==='forward'){
  const v=options(rest,['--dir','--mode']);result=await forwardBankSourceReview({directory:required(v,'--dir'),mode:v['--mode']??'reconcile'});
  if(!['COMPLETE','REVIEW_CLOSED_WITHOUT_EDIT'].includes(result.state))process.exitCode=3;
 }else if(cmd==='download'){
  const v=options(rest,['--dir','--out']);result=await downloadBankSourceReviewResult({directory:required(v,'--dir'),output:required(v,'--out')});
 }else need(false,'Choose a documented command; use --help.');
 process.stdout.write(JSON.stringify(result)+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(error=>{process.stderr.write(JSON.stringify({error:problem(error)})+'\n');process.exitCode=2;});
