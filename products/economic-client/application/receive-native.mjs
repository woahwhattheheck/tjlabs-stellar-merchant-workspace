#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/** One complete original source -> client editions -> fresh customer operation. */
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openWorkspace } from './workspace.mjs';
import { serve } from './server.mjs';
import { sha, identity, canonical, readJson, writeJson, writeAtomic, key, workspaceLease, now, decodePacket } from './io.mjs';

export async function receiveNative(input){
 const operation=key(input.operation_id,'native operation');
 const work=resolve(input.work_directory),sourceDirectory=resolve(input.source_project),customerDirectory=resolve(input.customer_project);
 if(work===sourceDirectory||work===customerDirectory)throw new Error('Keep the original receiving journal in its own work directory');
 if(sourceDirectory===customerDirectory)throw new Error('Use a separate named customer project');
 const config=input.config;
 if(!config?.oecd?.client_module||!config.oecd.project_directory)throw new Error('Select the installed original OECD module and project');
 const customerConfig={...config,oecd:{...config.oecd,project_directory:resolve(input.customer_oecd_project),create:true}};
 if(resolve(config.oecd.project_directory)===customerConfig.oecd.project_directory)
  throw new Error('Use a separate original OECD customer workspace');
 await mkdir(work,{recursive:true,mode:0o700});
 const release=await workspaceLease(work),path=join(work,'receiving.json');
 let saved=await readJson(path,null);
 const binding=identity(input);
 if(saved&&saved.input_sha256!==binding){await release();throw new Error('Continue the original native programme input');}
 saved??={schema:'tjl.economic-client-native-receiving.v1',operation_id:operation,input,input_sha256:binding,
  started_at:now(),steps:{}};
 async function persist(){saved.updated_at=now();await writeJson(path,saved);}
 async function stage(name,run){
  if(saved.steps[name]?.state==='COMPLETE')return saved.steps[name].result;
  saved.steps[name]={...(saved.steps[name]||{}),state:'RUNNING',started_at:saved.steps[name]?.started_at||now()};await persist();
  try{const result=await run();saved.steps[name].state='COMPLETE';saved.steps[name].result=result;saved.steps[name].completed_at=now();await persist();return result;}
  catch(error){saved.steps[name].state='ATTENTION';saved.steps[name].error={message:error.message,name:error.name,at:now()};await persist();throw error;}
 }
 function originalRevision(workspace,id,fallback){
  try{return workspace.request(id).request.input.expected_revision;}
  catch(error){if(error.message!=='Unknown saved operation')throw error;return fallback;}
 }
 async function retainedFile(name,body){
  const output=join(work,name);let old;try{old=await readFile(output);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(old&&!old.equals(body))throw new Error('Original saved output differs: '+name);
  if(!old)await writeAtomic(output,body);
  return {path:output,bytes:body.length,sha256:sha(body)};
 }
 let original,customer;
 try{
  await persist();
  original=await openWorkspace(sourceDirectory,{create:true,label:input.label||'Comparative economic client briefing',config});
  const capture=await stage('oecd-source',()=>original.oecdSeed(operation+'-oecd-source',{}));
  const initial=await stage('oecd-initial',()=>original.oecdSave(operation+'-oecd-initial',{
    operation_id:operation+'-oecd-initial',capture_id:capture.id,countries:input.countries||['CAN','DEU','FRA','GBR','ITA','JPN','USA'],
    start_period:input.start_period||'2024-01',end_period:input.end_period??null,
    title:input.title||'Comparative leading-indicator client briefing',
    notes:'Original selected OECD observations, source dimensions, status and citation retained for the complete client edition.'}));
  const revised=await stage('oecd-revised',()=>original.oecdSave(operation+'-oecd-revised',{
    ...initial.selection,operation_id:operation+'-oecd-revised',project_id:initial.project_id,expected_revision:initial.project_revision,
    notes:initial.selection.notes+'\n\nCustomer edition: the full original source, dataset, report and source rights reopen together.'}));
  if(revised.project_id!==initial.project_id||revised.project_revision!==initial.project_revision+1)
    throw new Error('The original native OECD revision did not retain its source project');
  const companion=await stage('oecd-retained-client',()=>original.oecdAttach(operation+'-oecd-retained-client',{briefing_id:revised.id}));
  let draft={title:input.title||'Comparative economic client briefing',audience:input.audience||'Economic research client',
    prepared_by:input.prepared_by||'',summary:input.summary||'Complete source-qualified OECD companion edition with the original selected monthly observations.',
    editorial_notes:'The original OECD amplitude-adjusted leading indicator describes turning points relative to trend. The native report and source rights are attached unchanged.',
    series:[],rights:{},companion_ids:[companion.id]};
  if(input.econdata){
    const c=await stage('econdata-source',()=>original.capture(operation+'-econdata-source',input.econdata.selection));
    const reviews=input.econdata.series_review;
    if(!Array.isArray(reviews)||!reviews.length)throw new Error('Provide the complete selected EconData series review');
    draft.series=reviews.map(review=>{
      const series=c.series.find(s=>canonical(s.series_key)===canonical(review.series_key));
      if(!series)throw new Error('Reviewed native series key does not occur in the captured source');
      return {capture_id:c.capture_id,series_id:series.id,title:review.title,role:review.role,frequency:review.frequency,
        units:review.units,adjustment:review.adjustment||'',methodology:review.methodology||'',
        interpretation:review.interpretation||'',start:review.start||'',end:review.end||''};
    });
    draft.rights[c.capture_id]=input.econdata.rights;
  }
  const first=await stage('client-first',()=>original.saveBriefing(operation+'-client-first',{
    expected_revision:originalRevision(original,operation+'-client-first',original.state().revision),draft}));
  const second=await stage('client-revised',()=>original.saveBriefing(operation+'-client-revised',{
    expected_revision:originalRevision(original,operation+'-client-revised',original.state().revision),draft:{...draft,editorial_notes:draft.editorial_notes+
      '\n\nThe complete customer project retains all original source journals, report editions and the native OECD project.'}}));
  const comparison=await stage('client-comparison',async()=>{
    const result=original.compare(first.id,second.id);await writeJson(join(work,'client-comparison.json'),result);return result;
  });
  await stage('source-report-downloads',async()=>{
    const results={};
    for(const id of [first.id,second.id]){
      results[id]={};
      for(const name of Object.keys(original.briefing(id).files)){
        const file=await original.file(id,name);
        results[id][name]=await retainedFile(id+'-'+name,file.body);
      }
    }
    return results;
  });
  const archive=await stage('complete-project',async()=>{
    const output=join(work,'economic-client-project.json.gz');let body;
    try{body=await readFile(output);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(body){
      const packet=decodePacket(body),checksum=packet.content_sha256;delete packet.content_sha256;
      if(identity(packet)!==checksum||packet.project.project_id!==original.state().project_id||
        !packet.project.briefings[first.id]||!packet.project.briefings[second.id]||
        !packet.project.companions[companion.id])throw new Error('Saved complete customer archive belongs to another original edition');
      return {path:output,bytes:body.length,sha256:sha(body)};
    }
    return retainedFile('economic-client-project.json.gz',await original.exportProject());
  });
  await original.close();original=null;
  customer=await openWorkspace(customerDirectory,{create:true,label:'Received economic client project',config:customerConfig});
  await stage('customer-receive',async()=>{
    const body=await readFile(archive.path);
    if(body.length!==archive.bytes||sha(body)!==archive.sha256)throw new Error('Complete original customer packet differs');
    const result=await customer.importProject(body,{config:customerConfig});
    return {project_id:result.project_id,active_briefing:result.active_briefing,briefings:result.briefings};
  });
  await stage('customer-report-downloads',async()=>{
    const results={};
    for(const id of [first.id,second.id]){
      results[id]={};
      for(const[name,expected]of Object.entries(saved.steps['source-report-downloads'].result[id])){
        const file=await customer.file(id,name);
        if(file.body.length!==expected.bytes||sha(file.body)!==expected.sha256)throw new Error('Customer report bytes differ: '+name);
        results[id][name]={sha256:sha(file.body),bytes:file.body.length};
      }
    }
    return results;
  });
  await stage('original-oecd-customer-reopen',()=>customer.oecdReopen(operation+'-original-customer-reopen',{companion_id:companion.id}));
  const final=customer.state();
  await customer.close();customer=null;
  await stage('closed-and-reopened-state',async()=>{
    const reopened=await openWorkspace(customerDirectory);
    try{
      const current=reopened.state();
      if(current.project_id!==final.project_id||current.active_briefing!==final.active_briefing)
        throw new Error('Saved customer project state differs after reopening');
      for(const id of [first.id,second.id])for(const[name,expected]of Object.entries(saved.steps['customer-report-downloads'].result[id])){
        const file=await reopened.file(id,name);
        if(sha(file.body)!==expected.sha256)throw new Error('Saved customer report changed after reopening');
      }
      return {project_id:current.project_id,active_briefing:current.active_briefing,report_editions:current.briefings.length};
    }finally{await reopened.close();}
  });
  saved.state='COMPLETE';saved.finished_at=now();await persist();
  return {state:'COMPLETE',operation_id:operation,receiving:path,source_project:sourceDirectory,customer_project:customerDirectory,
    archive,initial_oecd:initial.id,revised_oecd:revised.id,client_editions:[first.id,second.id],comparison,
    browser:{command:process.execPath,arguments:[new URL('./cli.mjs',import.meta.url).pathname,'serve','--project',customerDirectory]}};
 }finally{if(original)await original.close();if(customer)await customer.close();await release();}
}
async function main(){
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--input')throw new Error('Use receive-native.mjs --input /private/original-receiving.json');
 const input=JSON.parse(await readFile(args[1],'utf8')),result=await receiveNative(input);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
