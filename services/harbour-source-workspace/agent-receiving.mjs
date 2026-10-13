#!/usr/bin/env node
// MIT. Continue the original installed Harbour programme through its existing CLI and merchant Tools.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as Engine from './engine.mjs';
import * as Portable from './portable.mjs';
import {main as originalCLI,readWorking} from './cli.mjs';
import {HarbourSourceClient} from './agent-client.mjs';
import {MerchantHarbourSource} from './agent-merchant.mjs';
import {initializeHarbourMerchant} from './agent-setup.mjs';
import {operationLease} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
import {sha,canonical,need,regular,optional,directory,publish,json,utf8} from './agent-io.mjs';
const SCHEMA='stellar-forge.harbour-agent-receiving.v1';
const equal=(a,b,message)=>need(canonical(a)===canonical(b),message);
const identify=(file)=>{const bytes=regular(file,512*1024*1024);return{path:path.resolve(file),bytes:bytes.length,sha256:sha(bytes)};};
const get=file=>{const bytes=optional(file,128*1024*1024);return bytes?JSON.parse(utf8(bytes)):null;};
export async function runHarbourAgentReceiving({workspacePath,outputDirectory,operationId,at,actor}){
 need(path.isAbsolute(workspacePath)&&path.isAbsolute(outputDirectory),'Select complete absolute original input and output paths.');
 need(typeof operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/.test(operationId),'Retain one original operation identity.');
 need(typeof actor==='string'&&actor.trim()&&typeof at==='string'&&Number.isFinite(Date.parse(at)),'Retain the original actor and start time.');
 const root=directory(outputDirectory),lease=await operationLease(path.join(root,'original-harbour-receiving.lock'));
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
  const code=sha(Buffer.from(operationId)).slice(0,24),copyId=selected.copyId||'harbour-agent-'+code,draft='agent-receiving-'+code;
  const seed=Portable.recovery(base,{...selected.drafts,[draft]:{baseRevision:base.revision,baseHead:Portable.head(base),fields:{note:'Unfinished receiving note: 0, false, café 日本語',confirmed:false}}},selected.selection,copyId);
  const seedPath=path.join(root,'Initial_Working_Recovery.json');publish(seedPath,Portable.json(seed));
  const working=path.join(root,'Working_Recovery.json');await originalCLI(['receive','--workspace',working,'--input',seedPath]);
  const entry={label:'Original Harbour receiving',workspacePath:working,operationsDirectory:path.join(root,'operations'),genesis:{id:base.id,title:base.title,createdAt:base.createdAt},inputs:{}};
  client=new HarbourSourceClient(entry);
  const operating=base.operatingProfiles.filter(x=>x.selectionId===scope.id).at(-1),financial=base.financialProfiles.filter(x=>x.selectionId===scope.id).at(-1);
  need(operating&&financial&&!Engine.analyse(base,{selectionId:scope.id}).stale,'Use the original full-role receiving edition with current source-bound operating and financial profiles. The separate public reference has no such population.');
  const take=(source,keys)=>Object.fromEntries(keys.map(key=>[key,JSON.parse(JSON.stringify(source[key]))]));
  const commonProfile=['selectionId','title','sourceFileIds','note','bindings'];
  const requests=[
   {action:'saveOperatingProfile',input:{...take(operating,commonProfile),operationId:operationId+':operating',expectedRevision:base.revision,at,actor}},
   {action:'saveFinancialProfile',input:{...take(financial,[...commonProfile,'amountBasis','signBasis','permittedNamespaceTriples','permittedPeriodTriples','coverage']),operationId:operationId+':financial',expectedRevision:base.revision+1,at,actor}},
   ...[1,2].map(n=>({action:'saveReview',input:{operationId:operationId+':review-'+n,expectedRevision:base.revision+1+n,at,actor,selectionId:scope.id,decision:'needs-work',
    note:n===1?'Receiving operator retained the exact original policy and financial basis with the complete source. No allocation, permit, financial or supplier acceptance is asserted.':'Independent continuation preserves original operating dates, authority decisions, exact currencies and prior target history; unresolved checks stay visible.'}}))
  ];
  for(let i=0;i<requests.length;i++){const request=requests[i];publish(path.join(root,'Original_Request_'+i+'.json'),json(request));await client.mutate(request.action,request.input);}
  await client.close();client=new HarbourSourceClient(entry);
  const replay=await client.replay(requests[0].input.operationId);need(replay.replayed&&replay.revision===base.revision+1,'Reopen the original review receipt after a later operation.');
  let refused=false;try{await client.mutate(requests[0].action,{...requests[0].input,note:'Different later request'});}catch(error){refused=error.code==='HARBOUR_AGENT_OPERATION_CONFLICT';}
  need(refused,'A changed complete request must not replace its original operation.');
  const acceptedPath=path.join(root,'Accepted_Working_Recovery.json');let accepted=optional(acceptedPath);
  if(!accepted){
   const current=readWorking(working);need(current.record.workspace.revision===base.revision+4,'Retain the first exact accepted native source before further edits.');
   equal(current.record.drafts,seed.drafts,'The native writer must preserve exact unfinished browser work.');
   equal(current.record.selection,seed.selection,'The native writer must preserve current browser selection.');
   need(current.record.copyId===copyId,'Retain the independent original browser copy.');
   publish(acceptedPath,current.text);accepted=Buffer.from(current.text);
  }
  const snapshot=readWorking(acceptedPath);need(snapshot.record.workspace.revision===base.revision+4,'Preserve the first complete receiving source revision.');
  let expected=base;
  for(const request of requests)expected=Engine[request.action](expected,request.input).workspace;
  equal(snapshot.record.workspace,expected,'Retain the complete original source and all four exact receiving operations.');
  equal(snapshot.record.drafts,seed.drafts,'Retain the originally accepted unfinished browser work.');
  equal(snapshot.record.selection,seed.selection,'Retain the originally accepted browser selection.');
  need(snapshot.record.copyId===copyId,'Retain the originally accepted browser copy.');
  const live=readWorking(working),liveRelationship=Portable.compare(live.record.workspace,snapshot.record.workspace);
  need(['identical','incoming_ancestor'].includes(liveRelationship),'Preserve the live descendant of the original accepted workspace.');
  const exportEntry={...entry,workspacePath:acceptedPath,operationsDirectory:path.join(root,'accepted-operations')};
  exportClient=new HarbourSourceClient(exportEntry);
  const pin={expectedRevision:snapshot.record.workspace.revision,expectedHead:snapshot.headSha256};
  const outputs=[identify(inputPath),identify(manifestPath),identify(seedPath),identify(acceptedPath)];
  const emit=async(name,selection)=>{const file=await exportClient.originalFile({...pin,...selection}),filePath=path.join(root,'delivery',name);publish(filePath,file.bytes);outputs.push(identify(filePath));};
  await emit('Working_Recovery.json',{kind:'workspace'});
  await emit('Harbour_Source_Workspace.html',{kind:'working-html'});
  await emit('Harbour_Complete_Workspace.zip',{kind:'handover'});
  const ws=snapshot.record.workspace;
  equal(ws.preparations,base.preparations,'A new receiving policy/review must retain every original prepared CSV and profile binding.');
  equal(ws.returns,base.returns,'A new receiving policy/review must retain every original returned comparison.');
  for(const section of ['operatingProfiles','financialProfiles'])await emit(section+'.json',{kind:'section',section});
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
  const existingRecipient=optional(independent);
  await originalCLI(['receive','--workspace',independent,'--input',acceptedPath]);
  const recipient=readWorking(independent),relationship=Portable.compare(recipient.record.workspace,ws);
  need(['identical','incoming_ancestor'].includes(relationship),'Preserve complete original ancestry in independent receiving.');
  if(!existingRecipient)equal(recipient.record.drafts,seed.drafts,'Independent first receiving retains every original unfinished form.');
  // A later receiver may have deliberately edited drafts; preserve that full current envelope.
  merchant=new MerchantHarbourSource({harbourSource:{workspaces:{original:exportEntry}},exportsDirectory:directory(path.join(root,'merchant-exports'))});
  const chunks=[];let offset=0,readId,expectedSha256;
  for(;;){
   const part=await merchant.call('merchant_harbour_source_file_read',{workspace:'original',kind:'workspace',...pin,offset,limit:65536,...(readId?{readId,expectedSha256}:{})});
   need(typeof part.data==='string','Retain the original complete file response.');
   chunks.push(Buffer.from(part.data,'base64'));readId=part.readId;expectedSha256=part.file.sha256;
   if(part.nextOffset===null)break;need(part.nextOffset>offset,'Advance through complete original bytes.');offset=part.nextOffset;
  }
  need(Buffer.concat(chunks).equals(accepted),'The original merchant transport must preserve all complete recovery bytes.');
  await merchant.close();merchant=null;
  const configPath=path.join(root,'harbour-connection.json');publish(configPath,json({schema:'stellar-forge.harbour-source-agent.v1',workspaces:{original:entry}}));
  const setup=await initializeHarbourMerchant({directory:path.join(root,'merchant'),connection:configPath,name:'Original Harbour source receiving'});
  need(setup.harbourSourceConfigured,'Retain the source-owned original merchant provider.');
  const currentOriginal=optional(workspacePath);if(currentOriginal)need(currentOriginal.equals(input),'The original source changed during native receiving.');
  const result={schema:SCHEMA,state:'NATIVE_SOURCE_COMPLETE',operationId,at,actor,input:manifest.input,
   workspaceId:base.id,originalRevision:base.revision,accepted:identify(acceptedPath),copyId,
   profiles:{originalOperatingId:operating.id,originalFinancialId:financial.id,receivedOperatingId:ws.operatingProfiles.at(-1).id,receivedFinancialId:ws.financialProfiles.at(-1).id},
   operations:requests.map(x=>({action:x.action,id:x.input.operationId})),originalReceiptReplayed:true,changedRequestRefused:refused,
   configuration:setup.configuration,outputs,
   renderedInspection:'Pending the same equipped browser course and producing-peer LOOK of these exact attachments, all report sections/print pages, usable ZIP and reopened work.'};
  publish(path.join(root,'Native_Result.json'),json(result));
  return{...result,current:client.status(),liveWorking:{revision:live.record.workspace.revision,relationship:liveRelationship,copyId:live.record.copyId??null,
   draftsSha256:sha(Buffer.from(canonical(live.record.drafts))),selectionSha256:sha(Buffer.from(canonical(live.record.selection)))},
   independent:{revision:recipient.record.workspace.revision,relationship,copyId:recipient.record.copyId??null,
    draftsSha256:sha(Buffer.from(canonical(recipient.record.drafts))),selectionSha256:sha(Buffer.from(canonical(recipient.record.selection)))}};
 }finally{await Promise.allSettled([client?.close(),exportClient?.close(),merchant?.close()]);await lease.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={};try{
  for(let i=2;i<process.argv.length;i+=2){need(['--workspace','--out','--operation','--at','--actor'].includes(process.argv[i])&&process.argv[i+1]&&!options[process.argv[i]],'Use the original documented flags once.');options[process.argv[i]]=process.argv[i+1];}
  const result=await runHarbourAgentReceiving({workspacePath:options['--workspace'],outputDirectory:options['--out'],operationId:options['--operation'],at:options['--at'],actor:options['--actor']});
  process.stdout.write(json(result));
 }catch(error){process.stderr.write(json({error:error.code??error.name,message:error.message}));process.exitCode=1;}
}
