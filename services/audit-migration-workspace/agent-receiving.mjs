#!/usr/bin/env node
// MIT. Continue the original installed Audit programme through its existing CLI and merchant Tools.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as Engine from './engine.mjs';
import * as Portable from './portable.mjs';
import {main as originalCLI,readWorking} from './cli.mjs';
import {AuditMigrationClient} from './agent-client.mjs';
import {MerchantAuditMigration} from './agent-merchant.mjs';
import {initializeAuditMerchant} from './agent-setup.mjs';
import {operationLease} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
import {sha,canonical,need,regular,optional,directory,publish,json,utf8} from './agent-io.mjs';
const SCHEMA='stellar-forge.audit-agent-receiving.v1';
const equal=(a,b,message)=>need(canonical(a)===canonical(b),message);
const identify=(file)=>{const bytes=regular(file,512*1024*1024);return{path:path.resolve(file),bytes:bytes.length,sha256:sha(bytes)};};
const get=file=>{const bytes=optional(file,128*1024*1024);return bytes?JSON.parse(utf8(bytes)):null;};
export async function runAuditAgentReceiving({workspacePath,outputDirectory,operationId,at,actor}){
 need(path.isAbsolute(workspacePath)&&path.isAbsolute(outputDirectory),'Select complete absolute original input and output paths.');
 need(typeof operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/.test(operationId),'Retain one original operation identity.');
 need(typeof actor==='string'&&actor.trim()&&typeof at==='string'&&Number.isFinite(Date.parse(at)),'Retain the original actor and start time.');
 const root=directory(outputDirectory),lease=await operationLease(path.join(root,'original-audit-receiving.lock'));
 let client,exportClient,merchant;
 try{
  const inputPath=path.join(root,'Original_Working_Recovery.json'),manifestPath=path.join(root,'Original_Inputs.json');
  let manifest=get(manifestPath),input=optional(inputPath),present=optional(workspacePath);
  if(!manifest){
   need(present,'Retain the complete original working input.');publish(inputPath,present);input=present;
   manifest={schema:SCHEMA,operationId,at,actor,input:{path:path.resolve(workspacePath),bytes:input.length,sha256:sha(input)}};publish(manifestPath,json(manifest));
  }else{
   equal({schema:manifest.schema,operationId:manifest.operationId,at:manifest.at,actor:manifest.actor,path:manifest.input.path},
    {schema:SCHEMA,operationId,at,actor,path:path.resolve(workspacePath)},'Continue the exact original native receiving arguments.');
   if(!input){need(present&&present.length===manifest.input.bytes&&sha(present)===manifest.input.sha256,'Restore the original selected working input.');publish(inputPath,present);input=present;}
  }
  need(input.length===manifest.input.bytes&&sha(input)===manifest.input.sha256,'Keep the original full selected input.');
  if(present)need(present.equals(input),'The selected original input changed.');
  const selected=Portable.parseRecovery(utf8(input)),base=selected.workspace;
  const scope=base.selections.at(-1);need(scope,'Select the complete original mapped source with a retained scope.');
  const code=sha(Buffer.from(operationId)).slice(0,24),copyId=selected.copyId||'audit-agent-'+code,draft='agent-receiving-'+code;
  const seed=Portable.recovery(base,{...selected.drafts,[draft]:{baseRevision:base.revision,baseHead:Portable.head(base),fields:{note:'Unfinished receiving note: 0, false, café 日本語',confirmed:false}}},selected.selection,copyId);
  const seedPath=path.join(root,'Initial_Working_Recovery.json');publish(seedPath,Portable.json(seed));
  const working=path.join(root,'Working_Recovery.json');await originalCLI(['receive','--workspace',working,'--input',seedPath]);
  const entry={label:'Original Audit receiving',workspacePath:working,operationsDirectory:path.join(root,'operations'),genesis:{id:base.id,title:base.title,createdAt:base.createdAt},inputs:{}};
  client=new AuditMigrationClient(entry);
  const requests=[];
  for(let n=1;n<=2;n++){
   const request={operationId:operationId+':review-'+n,expectedRevision:base.revision+n-1,at,actor,selectionId:scope.id,decision:'needs-work',
    note:n===1?'Receiving operator opened the retained complete source and coverage. This continuation does not assert supplier or audit acceptance.':'Independent native continuation retains unresolved source and supplier checks; original findings and earlier reviews remain unchanged.'};
   publish(path.join(root,'Original_Review_'+n+'.json'),json({action:'saveReview',input:request}));requests.push(request);
   await client.mutate('saveReview',request);
  }
  equal(readWorking(working).record.drafts,seed.drafts,'The native writer must preserve exact unfinished browser work.');
  equal(readWorking(working).record.selection,seed.selection,'The native writer must preserve current browser selection.');
  need(readWorking(working).record.copyId===copyId,'Retain the independent original browser copy.');
  await client.close();client=new AuditMigrationClient(entry);
  const replay=await client.replay(requests[0].operationId);need(replay.replayed&&replay.revision===base.revision+1,'Reopen the original review receipt after a later operation.');
  let refused=false;try{await client.mutate('saveReview',{...requests[0],note:'Different later request'});}catch(error){refused=error.code==='AUDIT_AGENT_OPERATION_CONFLICT';}
  need(refused,'A changed complete request must not replace its original operation.');
  const acceptedPath=path.join(root,'Accepted_Working_Recovery.json');let accepted=optional(acceptedPath);
  if(!accepted){const current=readWorking(working);need(current.record.workspace.revision===base.revision+2,'Retain the first exact accepted native source before further edits.');publish(acceptedPath,current.text);accepted=Buffer.from(current.text);}
  const snapshot=readWorking(acceptedPath);need(snapshot.record.workspace.revision===base.revision+2,'Preserve the first complete receiving source revision.');
  equal(snapshot.record.workspace.operations.slice(0,base.revision),base.operations,'Retain all original source operations.');
  const exportEntry={...entry,workspacePath:acceptedPath,operationsDirectory:path.join(root,'accepted-operations')};
  exportClient=new AuditMigrationClient(exportEntry);
  const pin={expectedRevision:snapshot.record.workspace.revision,expectedHead:snapshot.headSha256};
  const outputs=[identify(inputPath),identify(manifestPath),identify(seedPath),identify(acceptedPath)];
  const emit=async(name,selection)=>{const file=await exportClient.originalFile({...pin,...selection}),filePath=path.join(root,'delivery',name);publish(filePath,file.bytes);outputs.push(identify(filePath));};
  await emit('Working_Recovery.json',{kind:'workspace'});
  await emit('Audit_Source_Workspace.html',{kind:'working-html'});
  await emit('Audit_Complete_Workspace.zip',{kind:'handover'});
  const ws=snapshot.record.workspace;
  for(let i=0;i<ws.selections.length;i++){const id=ws.selections[i].id;await emit('source-'+i+'.html',{kind:'report',selectionId:id});await emit('source-'+i+'.json',{kind:'analysis',selectionId:id});}
  for(let i=0;i<ws.preparations.length;i++){
   const item=ws.preparations[i];await emit('prepared-'+i+'.html',{kind:'report',selectionId:item.selectionId,preparationId:item.id});
   for(let j=0;j<item.assessment.tables.length;j++)await emit('prepared-'+i+'-table-'+j+'.csv',{kind:'target',id:item.id,tableId:item.assessment.tables[j].id});
  }
  for(let i=0;i<ws.returns.length;i++){const item=ws.returns[i],prepared=ws.preparations.find(x=>x.id===item.preparationId);need(prepared,'Retain the return’s original prepared selection.');await emit('returned-'+i+'.html',{kind:'report',selectionId:prepared.selectionId,preparationId:prepared.id,returnId:item.id});await emit('returned-'+i+'.json',{kind:'returned',id:item.id});}
  const cliExit=await originalCLI(['handover','--workspace',acceptedPath,'--out',path.join(root,'Complete_CLI_Handover')]);
  const recovery=cliExit.files.find(x=>x.path==='Working_Recovery.json');need(recovery,'The CLI exit must retain the whole recovery envelope.');
  need(regular(path.join(cliExit.directory,recovery.path)).equals(accepted),'Complete CLI exit must keep exact recovery bytes.');
  outputs.push(identify(path.join(cliExit.directory,recovery.path)));
  const independent=path.join(root,'Independent_Working_Recovery.json');
  await originalCLI(['receive','--workspace',independent,'--input',acceptedPath]);
  const recipient=readWorking(independent),relationship=Portable.compare(recipient.record.workspace,ws);
  need(['identical','incoming_ancestor'].includes(relationship),'Preserve complete original ancestry in independent receiving.');
  if(relationship==='identical')equal(recipient.record.drafts,seed.drafts,'Independent receiving retains every original unfinished form.');
  // A later receiver may have deliberately edited drafts; preserve that full current envelope.
  merchant=new MerchantAuditMigration({auditMigration:{workspaces:{original:exportEntry}},exportsDirectory:directory(path.join(root,'merchant-exports'))});
  const chunks=[];let offset=0,readId,expectedSha256;
  for(;;){
   const part=await merchant.call('merchant_audit_migration_file_read',{workspace:'original',kind:'workspace',...pin,offset,limit:65536,...(readId?{readId,expectedSha256}:{})});
   need(typeof part.data==='string','Retain the original complete file response.');
   chunks.push(Buffer.from(part.data,'base64'));readId=part.readId;expectedSha256=part.file.sha256;
   if(part.nextOffset===null)break;need(part.nextOffset>offset,'Advance through complete original bytes.');offset=part.nextOffset;
  }
  need(Buffer.concat(chunks).equals(accepted),'The original merchant transport must preserve all complete recovery bytes.');
  await merchant.close();merchant=null;
  const configPath=path.join(root,'audit-connection.json');publish(configPath,json({schema:'stellar-forge.audit-migration-agent.v1',workspaces:{original:entry}}));
  const setup=await initializeAuditMerchant({directory:path.join(root,'merchant'),connection:configPath,name:'Original Audit source receiving'});
  need(setup.auditMigrationConfigured,'Retain the source-owned original merchant provider.');
  const currentOriginal=optional(workspacePath);if(currentOriginal)need(currentOriginal.equals(input),'The original source changed during native receiving.');
  const result={schema:SCHEMA,state:'NATIVE_SOURCE_COMPLETE',operationId,at,actor,input:manifest.input,
   workspaceId:base.id,originalRevision:base.revision,accepted:identify(acceptedPath),copyId,
   operations:requests.map(x=>x.operationId),originalReceiptReplayed:true,changedRequestRefused:refused,
   configuration:setup.configuration,outputs,
   renderedInspection:'Pending the same equipped browser course and producing-peer LOOK of these exact attachments, all report sections/print pages, usable ZIP and reopened work.'};
  publish(path.join(root,'Native_Result.json'),json(result));
  return{...result,current:client.status(),independent:{revision:recipient.record.workspace.revision,relationship,copyId:recipient.record.copyId??null}};
 }finally{await Promise.allSettled([client?.close(),exportClient?.close(),merchant?.close()]);await lease.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={};try{
  for(let i=2;i<process.argv.length;i+=2){need(['--workspace','--out','--operation','--at','--actor'].includes(process.argv[i])&&process.argv[i+1]&&!options[process.argv[i]],'Use the original documented flags once.');options[process.argv[i]]=process.argv[i+1];}
  const result=await runAuditAgentReceiving({workspacePath:options['--workspace'],outputDirectory:options['--out'],operationId:options['--operation'],at:options['--at'],actor:options['--actor']});
  process.stdout.write(json(result));
 }catch(error){process.stderr.write(json({error:error.code??error.name,message:error.message}));process.exitCode=1;}
}
