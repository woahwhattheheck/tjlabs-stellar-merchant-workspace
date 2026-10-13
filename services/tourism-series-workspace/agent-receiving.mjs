#!/usr/bin/env node
// MIT. Continue the original Tourism programme through the installed native client.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as Engine from './engine.mjs';
import * as Portable from './portable.mjs';
import {main as originalCLI,readWorking} from './cli.mjs';
import {TourismSeriesClient} from './agent-client.mjs';
import {MerchantTourismSeries} from './agent-merchant.mjs';
import {initializeTourismMerchant} from './agent-setup.mjs';
import {sha,canonical,need,regular,optional,directory,publish,json,utf8} from './agent-io.mjs';
const SCHEMA='stellar-forge.tourism-agent-receiving.v1';
function identical(a,b,message){need(canonical(a)===canonical(b),message);}
function original(file){const body=regular(file);return{path:path.resolve(file),bytes:body.length,sha256:sha(body)};}
function optionalJSON(file){const body=optional(file);return body?JSON.parse(utf8(body)):null;}
function readRetained(file){return JSON.parse(utf8(regular(file)));}
const slug=operation=>sha(Buffer.from(operation)).slice(0,24);
export async function runTourismAgentReceiving({workspacePath,outputDirectory,operationId,at,actor}){
 need(path.isAbsolute(workspacePath)&&path.isAbsolute(outputDirectory),'Use absolute original input and retained output paths.');
 need(typeof operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/.test(operationId),'Retain one original receiving operation ID.');
 need(typeof actor==='string'&&actor.trim()&&typeof at==='string'&&Number.isFinite(Date.parse(at)),'Retain the actual receiving actor and original start time.');
 const root=directory(outputDirectory),manifestPath=path.join(root,'original-input.json');
 let manifest=optionalJSON(manifestPath);
 if(!manifest){const bytes=regular(workspacePath);const identity={path:path.resolve(workspacePath),bytes:bytes.length,sha256:sha(bytes)};
  publish(path.join(root,'Original_Working_Recovery.json'),bytes);
  manifest={schema:SCHEMA,operationId,at,actor,input:identity};publish(manifestPath,json(manifest));
 }else{
  identical({schema:manifest.schema,operationId:manifest.operationId,at:manifest.at,actor:manifest.actor,inputPath:manifest.input.path},
   {schema:SCHEMA,operationId,at,actor,inputPath:path.resolve(workspacePath)},'Continue the same original receiving arguments.');
  const current=optional(workspacePath);if(current)need(current.length===manifest.input.bytes&&sha(current)===manifest.input.sha256,'The selected original input changed.');
 }
 const retainedInput=path.join(root,'Original_Working_Recovery.json'),inputBytes=regular(retainedInput);
 need(inputBytes.length===manifest.input.bytes&&sha(inputBytes)===manifest.input.sha256,'Keep the complete original input.');
 const selected=Portable.parseRecovery(utf8(inputBytes)),originalWS=selected.workspace,genesis={id:originalWS.id,title:originalWS.title,createdAt:originalWS.createdAt};
 const code=slug(operationId),working=path.join(root,'Working_Recovery.json'),oproot=path.join(root,'operations');
 const demoSource=originalWS.sources.find(x=>x.role==='source'&&originalWS.mappings[x.id]);
 need(demoSource&&originalWS.registries.length&&originalWS.analyses.length,'Use the complete original mapped Tourism reference with saved analyses.');
 const originalMapping=originalWS.mappings[demoSource.id],registry=originalWS.registries.find(x=>x.id===originalMapping.registryId);
 need(registry,'Retain the original selected source registry.');
 // This receiving note is authored software work. Original source and every caller draft remain untouched.
 const draftName='agent-receiving-'+code;
 const seed=Portable.recovery(originalWS,{...selected.drafts,[draftName]:{baseRevision:originalWS.revision,baseHead:Portable.head(originalWS),fields:{note:'Unfinished receiving note — retain exact 0, false and Unicode: café 日本語',confirmed:false}}},
  selected.selection,selected.copyId??'tourism-agent-'+code);
 const seedPath=path.join(root,'Initial_Working_Recovery.json');publish(seedPath,Portable.json(seed));
 await originalCLI(['receive','--workspace',working,'--input',seedPath]);
 const sourcePath=path.join(root,'Authored_Source_Input.csv'),templatePath=path.join(root,'Authored_Target_Template.csv');
 publish(sourcePath,demoSource.text);publish(templatePath,'row_id,metric_id,value,source_id\r\n');
 const metadata=(file,kind)=>({...original(file),filename:path.basename(file),kind,label:path.basename(file)});
 const entry={label:'Original Tourism agent receiving',workspacePath:working,operationsDirectory:oproot,genesis,
  inputs:{source:metadata(sourcePath,'csv'),template:metadata(templatePath,'original')}};
 const argsRoot=directory(path.join(root,'original-requests'));let client=new TourismSeriesClient(entry);
 const common=n=>({operationId:operationId+':'+n,expectedRevision:client.status().revision,at});
 async function apply(n,action,build,options={}){
  const file=path.join(argsRoot,n+'.json');let saved=optionalJSON(file);
  if(!saved){saved={action,input:{...common(n),...build()},options};publish(file,json(saved));}
  need(saved.action===action,'Retain the original native action.');
  const result=await client.mutate(saved.action,saved.input,saved.options);
  identical(readWorking(working).record.drafts,seed.drafts,'Native operations must retain every unfinished browser form.');
  identical(readWorking(working).record.selection,seed.selection,'Native operations must retain the original browser selection.');
  need(readWorking(working).record.copyId===seed.copyId,'Preserve original browser copy identity.');
  return result;
 }
 const sourceId='agent-source-'+code,registryId='agent-registry-'+code,templateId='agent-template-'+code,analysisId='agent-analysis-'+code,reportId='agent-report-'+code,planId='agent-plan-'+code,returnId='agent-return-'+code,targetId='agent-target-'+code;
 try{
  await apply('01-template','importFile',()=>({id:templateId,filename:path.basename(templatePath),mime_type:'text/csv',retrieved_at:at,representation:'authored_transcription',publisher:actor,note:'Authored software receiving template. The customer provider template is a separate original input.'}),{inputAlias:'template',expectedSha256:entry.inputs.template.sha256});
  await apply('02-source','importCsv',()=>({id:sourceId,filename:path.basename(sourcePath),role:'source'}),{inputAlias:'source',expectedSha256:entry.inputs.source.sha256});
  await apply('03-registry','saveRegistry',()=>({registry:{...registry,id:registryId}}));
  await apply('04-mapping','saveMapping',()=>({sourceId,registryId,columns:originalMapping.columns,constants:originalMapping.constants}));
  const correctionColumn=Object.values(originalMapping.columns)[0];need(Number.isSafeInteger(correctionColumn),'Retain an actual mapped original column.');
  await apply('05-review','saveCorrection',()=>({sourceId,rowId:sourceId+':r2',column:correctionColumn,value:demoSource.rows[0].cells[correctionColumn],actor,reason:'Receiving operator confirmed this exact original cell; preserve the raw source and attributed review.'}));
  const savedAnalysis=originalWS.analyses.find(x=>x.request.sourceIds.length===1&&x.request.sourceIds[0]===demoSource.id);
  need(savedAnalysis,'Choose a complete saved analysis of the original source edition.');
  await apply('06-analysis','saveAnalysis',()=>({id:analysisId,title:'Agent receiving: '+savedAnalysis.title,actor,note:'Exact source-derived selection in the authored receiving copy.',analysis:{...savedAnalysis.request,registryId,sourceIds:[sourceId],rowIds:savedAnalysis.request.rowIds.map(x=>sourceId+x.slice(demoSource.id.length))}}));
  await apply('07-report','saveReport',()=>({id:reportId,title:'Original source and agent receiving report',actor,note:'Complete immutable source-derived analysis and references.',analysisIds:[analysisId]}));
  const currentTarget=readWorking(working).record.workspace.targetPlans.find(x=>x.id===planId);
  const rows=currentTarget?currentTarget.rows:Engine.project(readWorking(working).record.workspace,{registryId,sourceIds:[sourceId]}).rows.filter(x=>x.valid&&x.normalized_value!==null).slice(0,2);
  need(rows.length===2,'Select two complete actual source observations for the authored target exercise.');
  await apply('08-target','prepareTarget',()=>({id:planId,registryId,sourceIds:[sourceId],rowIds:rows.map(x=>x.rowId),templateFileId:templateId,
   columns:[{column:0,field:'rowId'},{column:1,field:'metric_id'},{column:2,field:'normalized_value'},{column:3,field:'source_id'}],keyColumns:[0],actor,note:'Authored target receiving; actual supplier import remains a separate selected contract.'}));
  const plan=readWorking(working).record.workspace.targetPlans.find(x=>x.id===planId),returnedPath=path.join(root,'Authored_Target_Return.csv');publish(returnedPath,plan.csv);
  await client.close();entry.inputs.returned=metadata(returnedPath,'csv');client=new TourismSeriesClient(entry);
  await apply('09-return-source','importCsv',()=>({id:targetId,filename:path.basename(returnedPath),role:'target'}),{inputAlias:'returned',expectedSha256:entry.inputs.returned.sha256});
  await apply('10-return','recordTargetReturn',()=>({id:returnId,planId,sourceId:targetId,columns:[0,1,2,3].map(x=>({preparedColumn:x,returnedColumn:x})),actor,note:'Observed complete authored return file, exact original prepared rows.'}));
  const final=readWorking(working),returned=final.record.workspace.targetReturns.find(x=>x.id===returnId);need(returned.ready,'Reconcile the complete authored return.');
  // Recover an already committed request in a newly opened client after every later operation.
  await client.close();client=new TourismSeriesClient(entry);
  const replay=await client.replay(operationId+':02-source');need(replay.replayed&&replay.revision===originalWS.revision+2,'Recover the original source receipt, not the current descendant revision.');
  const sameId=readRetained(path.join(argsRoot,'02-source.json'));let conflict=false;
  try{await client.mutate('importCsv',{...sameId.input,filename:'Another_Source.csv'},sameId.options);}catch(error){conflict=error.code==='TOURISM_AGENT_OPERATION_CONFLICT';}need(conflict,'Changed request bodies must retain the original operation.');
  const snapshotPath=path.join(root,'Accepted_Working_Recovery.json'),existing=optional(snapshotPath);
  if(!existing){
   need(final.record.workspace.revision===originalWS.revision+10,'Preserve an original accepted snapshot before continuing later edits.');
   publish(snapshotPath,final.text);
  }
  const snapshot=readWorking(snapshotPath);need(snapshot.record.workspace.revision===originalWS.revision+10,'Retain the first complete accepted revision.');
  const exportEntry={...entry,workspacePath:snapshotPath,operationsDirectory:path.join(root,'accepted-operations')},exportClient=new TourismSeriesClient(exportEntry),outputs=[];
  try{
   for(const [kind,id,name] of [['workspace',null,'Accepted_Working_Recovery.json'],['report',reportId,'Agent_Receiving_Report.html'],['target',planId,'Prepared_Target.csv'],['returned',returnId,'Observed_Return.json'],['working-html',null,'Tourism_Series_Workspace.html'],['handover',null,'Tourism_Series_Complete.zip']]){
    const file=await exportClient.originalFile({kind,id,expectedRevision:snapshot.record.workspace.revision,expectedHead:snapshot.headSha256}),out=path.join(root,name);publish(out,file.bytes);outputs.push(original(out));
   }
   const cliHandover=await originalCLI(['handover','--workspace',snapshotPath,'--out',path.join(root,'Complete_CLI_Handover')]);
   const cliRecovery=cliHandover.files.find(x=>x.path==='Working_Recovery.json');need(cliRecovery&&regular(path.join(cliHandover.directory,cliRecovery.path)).equals(regular(snapshotPath)),'CLI full exit retains the exact complete recovery.');
   outputs.push(original(path.join(cliHandover.directory,cliRecovery.path)));
   const independent=path.join(root,'Independent_Working_Recovery.json');await originalCLI(['receive','--workspace',independent,'--input',snapshotPath]);
   const independentRecord=readWorking(independent);need(Portable.compare(independentRecord.record.workspace,snapshot.record.workspace)==='identical'||Portable.compare(independentRecord.record.workspace,snapshot.record.workspace)==='incoming_ancestor','Keep original ancestry during receiving.');
   identical(independentRecord.record.drafts,seed.drafts,'Reopen complete unfinished work independently.');
   // Exercise the actual merchant retained-file implementation and full offset assembly.
   const merchant=new MerchantTourismSeries({tourismSeries:{workspaces:{original:exportEntry}},exportsDirectory:directory(path.join(root,'merchant-exports'))});
   try{
    const chunks=[];let offset=0,readId,expectedSha256;
    for(;;){
     const part=await merchant.call('merchant_tourism_series_file_read',{workspace:'original',kind:'workspace',expectedRevision:snapshot.record.workspace.revision,expectedHead:snapshot.headSha256,offset,limit:65536,...(readId?{readId,expectedSha256}:{})});
     // Original retained-file reply contract is checked below using its actual complete body field.
     need(typeof part.data==='string','Read the actual retained-file byte reply.');
     chunks.push(Buffer.from(part.data,'base64'));readId=part.readId;expectedSha256=part.file.sha256;
     if(part.nextOffset===null)break;need(part.nextOffset>offset,'Advance through the original complete file.');offset=part.nextOffset;
    }
    need(Buffer.concat(chunks).equals(regular(snapshotPath)),'Retained-file Tools must return every original byte.');
   }finally{await merchant.close();}
   const connectionPath=path.join(root,'tourism-connection.json');publish(connectionPath,json({schema:'stellar-forge.tourism-series-agent.v1',workspaces:{original:entry}}));
   const setup=await initializeTourismMerchant({directory:path.join(root,'merchant'),connection:connectionPath,name:'Original Tourism receiving'});
   need(setup.tourismSeriesConfigured,'Install the original source-owned merchant provider.');
   const prior=optionalJSON(path.join(root,'Native_Result.json'));
   const result={schema:SCHEMA,state:'NATIVE_COMPLETE',operationId,at,actor,input:manifest.input,accepted:original(snapshotPath),workspaceId:originalWS.id,revision:snapshot.record.workspace.revision,
    operations:10,originalOperationReplayed:operationId+':02-source',requestBodyConflict:conflict,drafts:Object.keys(seed.drafts),copyId:seed.copyId,
    reportId,planId,returnId,configuration:setup.configuration,outputs,renderedInspection:'Continue the original equipped browser course, open these exact outputs and return actual desktop/mobile pixels for producing-peer inspection.'};
   if(prior)identical(prior,result,'Retain the original completed receiving result.');else publish(path.join(root,'Native_Result.json'),json(result));
   // Original staging may be removed; if it still exists it must still be the same whole input.
   const now=optional(workspacePath);if(now)need(now.length===manifest.input.bytes&&sha(now)===manifest.input.sha256,'The original source changed during receiving.');
   return{...result,current:client.status(),independent:readWorking(independent).record.workspace.revision};
  }finally{await exportClient.close();}
 }finally{await client.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={};for(let i=2;i<process.argv.length;i+=2){need(['--workspace','--out','--operation','--at','--actor'].includes(process.argv[i])&&process.argv[i+1]&&!options[process.argv[i]],'Use every documented flag once with its original value.');options[process.argv[i]]=process.argv[i+1];}
 try{process.stdout.write(json(await runTourismAgentReceiving({workspacePath:options['--workspace'],outputDirectory:options['--out'],operationId:options['--operation'],at:options['--at'],actor:options['--actor']})));}
 catch(error){process.stderr.write(json({error:error.code??error.name,message:error.message}));process.exitCode=1;}
}
