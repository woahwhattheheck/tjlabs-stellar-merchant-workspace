#!/usr/bin/env node
// MIT. Additive receiving in the original populated Econdb operation; exact native/MCP/transfer.
import {readFile,open,lstat,link,unlink,mkdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {operatorStatus,originalRequest,inspectOperatorTransfer} from '../../../stellar/scf_2026/sf49_data_commissioning/econdb/operator.mjs';
import {privateDirectory,withPrivateLock} from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/routescan/quota.mjs';
import {initializeEcondbWorkspaceMerchant} from '../econdb-workspace.mjs';
import {startMerchantMcp} from '../serve.mjs';
import {openMerchantFileClient} from '../retained-download.mjs';
import {downloadEcondbHandover,receiveEcondbHandover} from '../econdb-download.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),encoded=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
function need(ok,message){if(!ok)throw Error(message);}
async function exists(p){try{return await lstat(p)}catch(e){if(e.code==='ENOENT')return null;throw e}}
async function put(p,b){
 if(await exists(p)){need((await readFile(p)).equals(b),'Retained receiving member changed: '+p);return;}
 const tmp=p+'.writing-'+randomUUID(),f=await open(tmp,'wx',0o600);try{await f.writeFile(b);await f.sync()}finally{await f.close()}
 try{await link(tmp,p);const d=await open(dirname(p),constants.O_RDONLY|constants.O_DIRECTORY);try{await d.sync()}finally{await d.close()}}catch(e){if(e.code!=='EEXIST')throw e;need((await readFile(p)).equals(b),'Concurrent receiving member differs.');}finally{await unlink(tmp).catch(()=>{})}
}
export async function receiveEcondbMerchant({workspaceDirectory,analysisRecordId,outputDirectory,sourceCommit}){
 const original=resolve(workspaceDirectory),root=await privateDirectory(resolve(outputDirectory));
 need(root!==original&&!root.startsWith(original+'/')&&!original.startsWith(root+'/'),'Use a separate original receiving output directory.');
 return withPrivateLock(root,'receiving.lock',async()=>{
  const sourceStatus=await operatorStatus(original),analysis=sourceStatus.records.find(r=>r.id===analysisRecordId&&r.kind==='analysis');
  need(analysis,'Select an actual completed analysis from the existing Econdb operator course.');
  const originalCommand=await originalRequest(original,analysisRecordId);
  const binding={schema:'econdb.mcp-receiving.v1',workspaceDirectory:original,workspaceId:sourceStatus.workspace.id,analysisRecordId,analysisRequestSha256:analysis.requestSha256,sourceCommit};
  await put(join(root,'binding.json'),encoded(binding));
  const completedPath=join(root,'native-result.json');
  if(await exists(completedPath)){
   const prior=JSON.parse(await readFile(completedPath,'utf8'));
   need(prior.schema==='econdb.mcp-receiving-result.v1'&&prior.sourceCommit===sourceCommit,'Existing receiving result belongs to another source.');
   const saved=await inspectOperatorTransfer(join(root,'complete-download'));
   const restored=await operatorStatus(join(root,'independent-workspace'));
   need(saved.manifest.workspaceId===binding.workspaceId&&restored.workspace.id===binding.workspaceId&&restored.records.some(r=>r.id===prior.applied.record.id),'Original completed receiving workspace changed identity or lost its record.');
   return{...prior,reopened:true,currentIndependentRevision:restored.revision};
  }
  const requestPath=join(root,'analysis-command.json');
  if(!await exists(requestPath)){
   need(!sourceStatus.pending,'Resolve the original workspace pending command before this continuation.');
   await put(requestPath,encoded({id:randomUUID(),expectedRevision:sourceStatus.revision,action:'analyze',input:structuredClone(originalCommand.input)}));
  }
  const requestBytes=await readFile(requestPath),request=JSON.parse(requestBytes);
  const exportsDirectory=await privateDirectory(join(root,'exports')),destination=join(root,'independent-workspace');
  const connection={schema:'stellar-forge.econdb-workspace-connections.v1',workspaces:{original:{directory:original,workspaceId:sourceStatus.workspace.id,exportsDirectory,inputs:{course:requestPath,replay:join(original,'operations',analysisRecordId,'request.json')},destinations:{independent:destination}}}};
  const connectionPath=join(root,'connection.json');await put(connectionPath,encoded(connection));
  const configured=await initializeEcondbWorkspaceMerchant({directory:join(root,'merchant'),connection:connectionPath,name:'Original Econdb MCP receiving'});
  const env={...process.env,MCP_ACCESS_TOKEN:randomBytes(32).toString('hex')};
  let server=await startMerchantMcp({configPath:configured.configuration,port:0,environment:env});
  const args={workspace:'original',workspaceId:sourceStatus.workspace.id};
  let client=await openMerchantFileClient({url:server.url,environment:env,errorPrefix:'ECONDB'});
  const stepFile=join(root,'native-result.json'),observed={};
  try{
   observed.workspaces=await client.call('merchant_econdb_workspaces',{});
   observed.before=await client.call('merchant_econdb_status',{...args,offset:0,limit:100});
   const reviewed=await client.call('merchant_econdb_input_inspect',{...args,input:'course'});
   need(reviewed.sha256===sha(requestBytes)&&reviewed.request.id===request.id,'MCP command receiving differs from the exact retained original.');
   const applied=await client.call('merchant_econdb_command',{...args,input:'course',expectedSha256:sha(requestBytes)});
   const replay=await client.call('merchant_econdb_command',{...args,input:'course',expectedSha256:sha(requestBytes)});
   need(replay.replayed===true&&applied.record.id===request.id&&replay.record.id===applied.record.id,'Exact command replay created a different result.');
   observed.applied=applied;observed.replay=replay;
   const historic=await client.call('merchant_econdb_input_inspect',{...args,input:'replay'});
   const retained=await client.call('merchant_econdb_command',{...args,input:'replay',expectedSha256:historic.sha256});
   need(retained.replayed===true&&retained.record.id===analysisRecordId,'Original older analysis replay changed identity.');
   const requestInfo=await client.call('merchant_econdb_request',{...args,id:request.id});
   const received=[];let offset=0,readId;
   for(;;){
    const c=await client.call('merchant_econdb_request_file',{...args,id:request.id,expectedSha256:requestInfo.requestFile.sha256,offset,limit:65536,...(readId?{readId}:{})});
    const b=Buffer.from(c.data,'base64');need(c.offset===offset&&c.bytesRead===b.length&&c.file.sha256===requestInfo.requestFile.sha256,'Original request chunk changed.');received.push(b);
    if(c.nextOffset===null)break;offset=c.nextOffset;readId=c.readId;
   }
   const exactRequest=Buffer.concat(received);need(sha(exactRequest)===requestInfo.requestFile.sha256,'Complete retained request differs.');
   await put(join(root,'original-command.json'),exactRequest);
   const files=[];offset=0;
   do{const p=await client.call('merchant_econdb_files',{...args,id:request.id,offset,limit:100});files.push(...p.items);offset=p.nextOffset;}while(offset!==null);
   observed.files=files;
   const report=files.find(f=>f.name==='report.html');need(report,'Original complete HTML report is absent.');
   const part=await client.call('merchant_econdb_file_read',{...args,id:request.id,file:report.name,expectedSha256:report.sha256,offset:0,limit:1});
   if(part.nextOffset!==null)await client.call('merchant_econdb_file_release',{...args,readId:part.readId});
   const exportId='merchant-course';
   let exported;
   // A retained exact export is authoritative after an interrupted continuation.
   try{exported=await client.call('merchant_econdb_handover_manifest',{...args,exportId});}
   catch(e){if(e.code!=='ENOENT')throw e;await client.call('merchant_econdb_handover',{...args,exportId});exported=await client.call('merchant_econdb_handover_manifest',{...args,exportId});}
   await server.close();server=null;
   server=await startMerchantMcp({configPath:configured.configuration,port:0,environment:env});
   client=await openMerchantFileClient({url:server.url,environment:env,errorPrefix:'ECONDB'});
   const cold=await client.call('merchant_econdb_request',{...args,id:request.id});
   need(cold.state==='recorded'&&cold.receipt.id===request.id,'Original request did not survive the Merchant restart.');
   // Endpoint identity is the stable original source operation, even when this owned loopback port changes.
   const stableClient={endpoint:'econdb-native:'+sourceStatus.workspace.id,call:client.call.bind(client)};
   const download=await downloadEcondbHandover({client:stableClient,...args,exportId,directory:join(root,'complete-download'),expectedManifestSha256:exported.manifestFile.sha256});
   const reread=await downloadEcondbHandover({client:stableClient,...args,exportId,directory:join(root,'complete-download'),expectedManifestSha256:exported.manifestFile.sha256});
   const native=await receiveEcondbHandover({directory:download.directory,destination});
   need(native.status.workspace.id===sourceStatus.workspace.id&&native.status.records.some(r=>r.id===request.id),'Independent original workspace lost its saved command.');
   const independentRequest=await originalRequest(destination,request.id);
   need(JSON.stringify(independentRequest)===JSON.stringify(request),'Independent retained request changed.');
   observed.download=download;observed.reopenedDownload=reread;observed.independent={workspaceId:native.status.workspace.id,revision:native.status.revision,records:native.status.records.length};
   observed.sourceCommit=sourceCommit;observed.schema='econdb.mcp-receiving-result.v1';
   observed.state='NATIVE_COMPLETE_PENDING_RENDERED_ATTACHMENT_REVIEW';
   observed.review={report:join(destination,applied.record.directory,'report.html'),completeWorkspace:destination,guide:'ECONDB_WORKSPACE.md#actual-original-receiving'};
   // Keep the first original complete result; a later exact run verifies current outputs and returns its new observation separately.
   if(!await exists(stepFile))await put(stepFile,encoded(observed));
   return observed;
  }finally{await server?.close()}
 });
}
async function main(){
 const options={},a=process.argv.slice(2);
 for(let i=0;i<a.length;i+=2){need(['--workspace','--analysis','--out','--source-commit'].includes(a[i])&&a[i+1]&&!Object.hasOwn(options,a[i]),'Use each required original path/ID option once.');options[a[i]]=a[i+1];}
 need(Object.keys(options).length===4,'Supply --workspace --analysis --out --source-commit.');
 process.stdout.write(JSON.stringify(await receiveEcondbMerchant({workspaceDirectory:options['--workspace'],analysisRecordId:options['--analysis'],outputDirectory:options['--out'],sourceCommit:options['--source-commit']}),null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{process.stderr.write(JSON.stringify({error:e.message,code:e.code??'ECONDB_RECEIVING'})+'\n');process.exitCode=1});
