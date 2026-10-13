#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/** Continue a real customer review against its original saved economic project. */
import { readFile, mkdir } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openWorkspace } from './workspace.mjs';
import { identity,sha,canonical,key,readJson,writeJson,writeAtomic,workspaceLease,now,decodePacket } from './io.mjs';

export async function receiveCustomerReview(input){
 const operation=key(input.operation_id),work=resolve(input.work_directory),source=resolve(input.source_project),customer=resolve(input.customer_project);
 if(new Set([work,source,customer]).size!==3)throw new Error('Use distinct original source, receiving project and operation directories');
 await mkdir(work,{recursive:true,mode:0o700});const release=await workspaceLease(work),path=join(work,'review-receiving.json');
 let state=await readJson(path,null),workspace,received;
 try{
  if(state&&state.input_sha256!==identity(input))throw new Error('Continue the complete original review receiving selection');
  state??={schema:'tjl.economic-client-review-receiving.v1',input,input_sha256:identity(input),operation_id:operation,started_at:now(),steps:{}};
  async function save(){state.updated_at=now();await writeJson(path,state);}
  async function stage(name,run){
   if(state.steps[name]?.state==='COMPLETE')return state.steps[name].result;
   state.steps[name]={...state.steps[name],state:'RUNNING'};await save();
   try{const result=await run();state.steps[name]={state:'COMPLETE',result,completed_at:now()};await save();return result;}
   catch(error){state.steps[name]={...state.steps[name],state:'ATTENTION',error:{name:error.name,message:error.message,at:now()}};await save();throw error;}
  }
  async function file(name,body){
   const destination=join(work,name);let prior;try{prior=await readFile(destination);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(prior&&!prior.equals(body))throw new Error('The complete retained original output differs: '+name);
   if(!prior)await writeAtomic(destination,body);
   return {path:destination,bytes:body.length,sha256:sha(body)};
  }
  workspace=await openWorkspace(source);
  const original=workspace.briefing(input.briefing_id);
  const pkg=await stage('create-review',()=>workspace.reviewCreate(operation+'-create',{
   briefing_id:original.id,recipient:input.recipient,label:input.label}));
  const downloads=await stage('complete-review-files',async()=>{
   const result={};for(const name of Object.keys(pkg.files))result[name]=await file(name,(await workspace.reviewFile(pkg.id,name)).body);
   return result;
  });
  let returned;
  try{returned=await readFile(input.return_file);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!returned){
   state.state='WAITING_CUSTOMER_REVIEW';await save();
   return {state:state.state,operation_id:operation,receiving:path,package:pkg,downloads,
    next:'Open the exact review.html offline, inspect its complete report/source files, make the actual selected customer decisions, save and export Return JSON to the configured return_file. Repeat this same operation.'};
  }
  const returnBinding={bytes:returned.length,sha256:sha(returned)};
  if(state.return_binding&&canonical(state.return_binding)!==canonical(returnBinding))throw new Error('Continue this original customer return; a following return needs a new receiving operation');
  state.return_binding=returnBinding;await save();
  const accepted=await stage('receive-customer-return',()=>workspace.reviewReceive(operation+'-return',returned));
  await stage('repeat-original-return',async()=>{
   const again=await workspace.reviewReceive(operation+'-return',returned);
   if(canonical(again)!==canonical(accepted))throw new Error('The original return did not reopen unchanged');
   return {return_id:again.id,edition_id:again.edition_id};
  });
  let resolved=state.steps['apply-editorial-dispositions']?.state==='COMPLETE'?state.steps['apply-editorial-dispositions'].result:null;
  if(!resolved&&state.active_resolution_operation){
   try{
    const originalRequest=workspace.request(state.active_resolution_operation);
    if(originalRequest.state==='COMPLETE'){
     resolved=originalRequest.result;
     state.steps['apply-editorial-dispositions']={state:'COMPLETE',result:resolved,recovered_at:now()};await save();
    }
   }catch(error){if(error.message!=='Unknown saved operation')throw error;}
  }
  if(!resolved){
   const comparison=await workspace.reviewPreview(accepted.id);
   const comparisonBytes=Buffer.from(JSON.stringify(comparison,null,2)+'\n');
   const retainedComparison=await file('comparison-'+comparison.comparison_sha256+'.json',comparisonBytes);
   // This pointer selects the current view; each complete immutable comparison stays above.
   await writeJson(join(work,'current-comparison.json'),{comparison:retainedComparison,value:comparison});
   state.current_comparison=retainedComparison;await save();
   let resolutionBytes;
   try{resolutionBytes=await readFile(input.resolution_file);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(!resolutionBytes){
    state.state='WAITING_ANALYST_DISPOSITION';await save();
    return {state:state.state,operation_id:operation,receiving:path,return_id:accepted.id,comparison,comparison_file:retainedComparison,
     next:'Review the current complete comparison and save explicit original target/current hashes, dispositions and conflict confirmations in resolution_file, then repeat this operation. No proposal has changed the draft.'};
   }
   const resolution=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(resolutionBytes));
   if(resolution.return_id!==accepted.id)throw new Error('The selected dispositions belong to another original customer return');
   const resolutionBinding=identity(resolution);
   const retainedResolution=await file('disposition-'+sha(resolutionBytes)+'.json',resolutionBytes);
   state.resolution_attempts||={};
   state.resolution_attempts[resolutionBinding]={input:retainedResolution,comparison:retainedComparison};
   state.active_resolution_operation=operation.slice(0,75)+'-resolve-'+resolutionBinding;
   await save();
   // Rejected stale choices remain retained. A corrected explicit file receives its
   // own immutable operation; an accepted operation is recovered before this branch.
   resolved=await stage('apply-editorial-dispositions',()=>workspace.reviewResolve(state.active_resolution_operation,resolution));
  }
  const following=await stage('save-following-briefing',()=>{
   let revision;try{revision=workspace.request(operation+'-following').request.input.expected_revision;}
   catch(error){if(error.message!=='Unknown saved operation')throw error;revision=workspace.state().revision;}
   return workspace.saveBriefing(operation+'-following',{expected_revision:revision,draft:workspace.state().draft});
  });
  const reportFiles=await stage('following-report-files',async()=>{
   const files={};for(const name of Object.keys(workspace.briefing(following.id).files))
    files[name]=await file('following-'+name,(await workspace.file(following.id,name)).body);
   return files;
  });
  const archive=await stage('whole-reviewed-project',async()=>{
   const name='reviewed-project.json.gz',destination=join(work,name);let bytes;
   try{bytes=await readFile(destination);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(bytes){
    const packet=decodePacket(bytes),digest=packet.content_sha256;delete packet.content_sha256;
    if(identity(packet)!==digest||packet.project.project_id!==workspace.state().project_id||
     !packet.project.review_returns?.[accepted.id]||!packet.project.review_resolutions?.[resolved.id]||
     !packet.project.briefings?.[following.id])throw new Error('The existing full review archive belongs to another accepted edition');
   }else bytes=await workspace.exportProject();
   return file(name,bytes);
  });
  const frozenBytes=await readFile(archive.path);
  if(frozenBytes.length!==archive.bytes||sha(frozenBytes)!==archive.sha256)throw new Error('The retained complete review archive differs');
  const frozen=decodePacket(frozenBytes),frozenHash=frozen.content_sha256;delete frozen.content_sha256;
  if(identity(frozen)!==frozenHash)throw new Error('The retained complete review packet differs');
  const originalReviewState={packages:Object.values(frozen.project.review_packages||{}),returns:Object.values(frozen.project.review_returns||{}),resolutions:Object.values(frozen.project.review_resolutions||{})};
  await workspace.close();workspace=null;
  received=await openWorkspace(customer,{create:true,label:'Received customer review project',config:input.receiving_config||{}});
  await stage('independent-project-receive',async()=>{
   const bytes=await readFile(archive.path);if(bytes.length!==archive.bytes||sha(bytes)!==archive.sha256)throw new Error('Original reviewed project archive differs');
   await received.importProject(bytes,{config:input.receiving_config});
   await received.importProject(bytes,{config:input.receiving_config});
   if(canonical(received.reviews())!==canonical(originalReviewState))throw new Error('Complete customer review history differs after receiving');
   return {project_id:received.state().project_id,review:received.reviews()};
  });
  await received.close();received=null;
  received=await openWorkspace(customer);
  await stage('closed-project-reopen',async()=>{
   if(canonical(received.reviews())!==canonical(originalReviewState))throw new Error('The saved review history changed on reopening');
   for(const[name,expected]of Object.entries(reportFiles)){
    const actual=await received.file(following.id,name);
    if(actual.body.length!==expected.bytes||sha(actual.body)!==expected.sha256)throw new Error('The following report changed on reopening');
   }
   const originalReturn=await received.reviewReturnFile(accepted.id);
   if(originalReturn.body.length!==returned.length||!originalReturn.body.equals(returned))throw new Error('The complete original returned customer bytes changed');
   return {project_id:received.state().project_id,following_briefing:following.id,return_id:accepted.id,resolution_id:resolved.id,report_files:reportFiles};
  });
  state.state='RECEIVED_AWAITING_RENDERED_INSPECTION';await save();
  return {state:state.state,operation_id:operation,receiving:path,source_project:source,customer_project:customer,
   downloads,return_id:accepted.id,resolution_id:resolved.id,following_briefing:following.id,report_files:reportFiles,archive,
   next:'Open the received project with the original operator, view the exact returned review and following report at wide and narrow widths, exercise the saved controls and inspect every downloaded attachment.'};
 }finally{if(workspace)await workspace.close();if(received)await received.close();await release();}
}
export async function main(args=process.argv.slice(2)){
 if(args.length!==2||args[0]!=='--input')throw new Error('Use receive-review.mjs --input /private/original-review-receiving.json');
 const result=await receiveCustomerReview(JSON.parse(await readFile(args[1],'utf8')));
 process.stdout.write(JSON.stringify(result,null,2)+'\n');return 0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
