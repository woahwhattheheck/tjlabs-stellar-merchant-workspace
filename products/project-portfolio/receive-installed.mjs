#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Complete installed customer receiving over the original workspace, source and file readers.
import {constants} from 'node:fs';
import {StringDecoder} from 'node:string_decoder';
import {open} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {ProjectPortfolioClient,inspectProjectPortfolioFile} from './client.mjs';
import {MerchantProjectPortfolio,readProjectPortfolioMerchantConfiguration,PROJECT_PORTFOLIO_MERCHANT_SCHEMA} from './merchant.mjs';
import {PRODUCT_DIRECTORY,READY_SCHEMA,SOURCE_COMMIT,need,privateDirectory,atomicJson,readJson,sha,canonical,
 inspectProjectPortfolioSelection,readProjectPortfolioLaunch} from './workspace.mjs';
const text=value=>JSON.stringify(canonical(value))+'\n';
const request=(workspaceId,kind)=>sha(Buffer.from(text({workspaceId,kind,programme:'project-portfolio-installed-receiving.v1'})));
function launch(options){
 let child,ready=false,buffer='',failure=null;const decoder=new StringDecoder('utf8');
 const args=[join(PRODUCT_DIRECTORY,'cli.mjs'),'serve','--workspace',options.workspaceDirectory,'--port','0'];
 if(options.pythonExecutable)args.push('--python',options.pythonExecutable);
 if(options.profilesFile)args.push('--profiles',options.profilesFile);
 args.push('--source-directory',options.sourceDirectory,'--expected-selection-sha256',options.expectedSelectionSha256);
 const announced=new Promise((resolveReady,rejectReady)=>{
  child=spawn(process.execPath,args,{stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},shell:false});
  child.stdout.on('data',chunk=>{
   buffer+=decoder.write(chunk);
   try{
    need(buffer.length<65536,'PROJECT_PORTFOLIO_RECEIVING_STARTUP');
    let end;while((end=buffer.indexOf('\n'))>=0){
     const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line)continue;
     const value=JSON.parse(line);
     if(value.schema===READY_SCHEMA&&value.state==='LISTENING'&&!ready){ready=true;resolveReady(value);}
    }
   }catch(error){failure=error;rejectReady(error);child.kill('SIGTERM');}
  });
  child.stderr.on('data',chunk=>process.stderr.write(chunk));
  child.once('error',error=>{failure=error;rejectReady(error);});
  child.once('close',(code,signal)=>{if(!ready)rejectReady(failure??new Error('Original launch ended '+(signal??code)));});
 });
 void announced.catch(()=>{});
 const exited=new Promise(resolveExit=>child.once('close',(code,signal)=>resolveExit({code,signal})));
 let stop=null;
 return {announced,close(){
  if(!stop)stop=(async()=>{
   if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
   const result=await exited;need(!failure&&result.code===0,'PROJECT_PORTFOLIO_RECEIVING_HOST_EXIT');
  })();return stop;
 }};
}
async function allRows(client,collection){
 let cursor='',items=[];const seen=new Set();
 while(true){
  const page=await client[collection]({cursor,limit:100});
  need(Array.isArray(page.items),'PROJECT_PORTFOLIO_RECEIVING_PAGE');items.push(...page.items);
  if(page.complete||!page.next_cursor)return items;
  need(!seen.has(page.next_cursor),'PROJECT_PORTFOLIO_RECEIVING_CURSOR');
  seen.add(page.next_cursor);cursor=page.next_cursor;
 }
}
async function readExport(merchant,delivery,destination){
 const file=delivery.files[0],handle=await open(destination,constants.O_RDWR|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
 const hash=createHash('sha256');let offset=0,readId,interrupted=false;
 try{
  const before=await handle.stat();need(before.isFile()&&before.size<=file.bytes&&!(before.mode&0o077),
   'PROJECT_PORTFOLIO_RECEIVING_PREFIX');
  while(true){
   const value=await merchant.call('merchant_project_portfolio_export_file',{
    exportId:delivery.exportId,file:file.name,expectedManifestSha256:delivery.manifestSha256,
    expectedSha256:file.sha256,offset,limit:65536,...(readId?{readId}:{})
   });
   const bytes=Buffer.from(value.data,'base64');
   need(value.offset===offset&&value.bytesRead===bytes.length,'PROJECT_PORTFOLIO_RECEIVING_FILE_RANGE');
   const retained=Math.min(bytes.length,Math.max(0,before.size-offset));
   if(retained){
    const prefix=Buffer.alloc(retained);let read=0;
    while(read<retained){const part=await handle.read(prefix,read,retained-read,offset+read);
     need(part.bytesRead>0,'PROJECT_PORTFOLIO_RECEIVING_PREFIX');read+=part.bytesRead;}
    need(prefix.equals(bytes.subarray(0,retained)),'PROJECT_PORTFOLIO_RECEIVING_PREFIX_CHANGED');
   }
   let written=retained;
   while(written<bytes.length){const part=await handle.write(bytes,written,bytes.length-written,offset+written);
    need(part.bytesWritten>0,'PROJECT_PORTFOLIO_RECEIVING_WRITE');written+=part.bytesWritten;}
   hash.update(bytes);offset+=bytes.length;
   if(value.nextOffset===null){readId=null;break;}
   need(value.nextOffset===offset,'PROJECT_PORTFOLIO_RECEIVING_FILE_CURSOR');readId=value.readId;
   if(!interrupted){
    await merchant.call('merchant_project_portfolio_export_file_release',{exportId:delivery.exportId,readId});
    readId=null;interrupted=true;
   }
  }
  const actual=hash.digest('hex');need(offset===file.bytes&&actual===file.sha256,'PROJECT_PORTFOLIO_RECEIVING_FILE_CHANGED');
  await handle.sync();return {bytes:offset,sha256:actual,resumedAfterRelease:interrupted};
 }finally{
  await handle.close();
  if(readId)await merchant.call('merchant_project_portfolio_export_file_release',{exportId:delivery.exportId,readId});
 }
}
export async function receiveInstalledProjectPortfolio({workspaceDirectory,directory,pythonExecutable,profilesFile,originalFile,sourceDirectory}={}){
 workspaceDirectory=resolve(workspaceDirectory);directory=await privateDirectory(resolve(directory),{create:true});
 const selected=await inspectProjectPortfolioSelection({workspaceDirectory,pythonExecutable,profilesFile,sourceDirectory});
 const launchOptions={workspaceDirectory,pythonExecutable,profilesFile,sourceDirectory:selected.selection.sourceDirectory,
  expectedSelectionSha256:selected.selectionSha256};
 let first=null,second=null,client=null,merchant=null,failure=null;
 const resultFile=join(directory,'result.json');
 try{
  const prior=await readJson(resultFile,1024*1024,{privateFile:true});
  need(prior.schema==='stellar-forge.project-portfolio-installed-receiving.v1'&&prior.workspaceDirectory===workspaceDirectory&&
   prior.sourceCommit===SOURCE_COMMIT&&prior.sourceSelectionSha256===selected.selectionSha256,
   'PROJECT_PORTFOLIO_RECEIVING_SELECTION_CHANGED');
  for(const file of prior.files??[])await inspectProjectPortfolioFile(file.path,{expectedSha256:file.sha256});
  return {...prior,reopened:true};
 }catch(error){if(error.code!=='ENOENT')throw error;}
 try{
  first=launch(launchOptions);
  const original=await first.announced,connectionFile=join(original.controlDirectory,'connection.json');
  await readProjectPortfolioLaunch(launchOptions,original);
  client=new ProjectPortfolioClient({connectionFile,expectedWorkspaceId:original.workspaceId});
  const hello=await client.ready(),before=await allRows(client,'editions');
  let uploaded=null,source=null;
  if(originalFile){
   source=await inspectProjectPortfolioFile(resolve(originalFile));
   uploaded=await client.uploadFile(source.path,{expectedSha256:source.sha256});
   const downloaded=await client.download({sha256:uploaded.sha256,expectedBytes:uploaded.bytes,name:uploaded.filename},
    join(directory,'received-source.bin'));
   need(downloaded.sha256===source.sha256&&downloaded.bytes===source.bytes,'PROJECT_PORTFOLIO_RECEIVING_SOURCE');
  }
  const operation=request(original.workspaceId,'complete-workspace');
  await client.action(operation,'archive',{});
  const completed=await client.waitRequest(operation,{timeoutMs:0});
  need(completed.state==='COMPLETE'&&completed.result?.archive?.kind==='workspace_archive','PROJECT_PORTFOLIO_RECEIVING_ARCHIVE');
  const archive=completed.result.archive;
  const downloaded=await client.download({requestId:operation,expectedSha256:archive.sha256,expectedBytes:archive.bytes},
   join(directory,'workspace.zip'));
  const merchantConnection=join(directory,'merchant-connection.json');
  await atomicJson(merchantConnection,{schema:PROJECT_PORTFOLIO_MERCHANT_SCHEMA,workspaces:{
   portfolio:{label:'Receiving portfolio',workspaceId:original.workspaceId,connectionFile,
    files:source?{original:{label:'Original project',path:source.path,sha256:source.sha256}}:{}}
  }},{immutable:true});
  const exportsDirectory=await privateDirectory(join(directory,'agent-exports'),{create:true});
  merchant=new MerchantProjectPortfolio({exportsDirectory,
   projectPortfolioWorkspaces:await readProjectPortfolioMerchantConfiguration(merchantConnection)});
  const status=await merchant.call('merchant_project_portfolio_status',{workspace:'portfolio'});
  need(status.schema,'PROJECT_PORTFOLIO_RECEIVING_MERCHANT_STATE');
  const replay=await merchant.call('merchant_project_portfolio_archive',{workspace:'portfolio',requestId:operation,arguments:{}});
  need(replay.id===operation&&replay.state==='COMPLETE','PROJECT_PORTFOLIO_RECEIVING_REQUEST_REPLAY');
  const delivery=await merchant.call('merchant_project_portfolio_download',{workspace:'portfolio',requestId:operation,
   expectedSha256:archive.sha256,expectedBytes:archive.bytes});
  const roundtrip=await readExport(merchant,delivery,join(directory,'workspace-via-agent.zip'));
  need(roundtrip.sha256===downloaded.sha256&&roundtrip.bytes===downloaded.bytes,'PROJECT_PORTFOLIO_RECEIVING_AGENT_FILE');
  await merchant.close();merchant=null;await client.close();client=null;
  await first.close();first=null;
  const closed=await readJson(join(original.controlDirectory,'entry.json'),65536,{privateFile:true});
  need(closed.state==='CLOSED'&&closed.instanceId===original.instanceId,'PROJECT_PORTFOLIO_RECEIVING_STOP');
  second=launch(launchOptions);
  const reopened=await second.announced;
  await readProjectPortfolioLaunch(launchOptions,reopened);
  need(reopened.workspaceId===original.workspaceId&&reopened.instanceId!==original.instanceId&&reopened.url!==original.url,
   'PROJECT_PORTFOLIO_RECEIVING_REOPEN');
  client=new ProjectPortfolioClient({connectionFile,expectedWorkspaceId:original.workspaceId});
  await client.ready();const after=await allRows(client,'editions');
  need(JSON.stringify(before.map(row=>row.id))===JSON.stringify(after.map(row=>row.id)),'PROJECT_PORTFOLIO_RECEIVING_EDITIONS');
  const retained=await client.request(operation);
  need(retained.state==='COMPLETE'&&retained.result.archive.sha256===archive.sha256,'PROJECT_PORTFOLIO_RECEIVING_REQUEST');
  const output={schema:'stellar-forge.project-portfolio-installed-receiving.v1',sourceCommit:SOURCE_COMMIT,
   sourceSelectionSha256:selected.selectionSha256,sourceDirectory:selected.selection.sourceDirectory,
   executionSourceDirectory:selected.executionSourceDirectory,
   workspaceDirectory,workspaceId:hello.workspace_id,requestId:operation,
   originalInstance:original.instanceId,reopenedInstance:reopened.instanceId,
   nativeEditions:before.map(row=>({id:row.id,sha256:row.sha256??null})),uploaded,
   clientDownload:downloaded,agentDownload:{...roundtrip,exportId:delivery.exportId},
   files:[downloaded,{path:join(directory,'workspace-via-agent.zip'),...roundtrip},
    ...(source?[{path:join(directory,'received-source.bin'),bytes:source.bytes,sha256:source.sha256}]:[])]};
  await client.close();client=null;await second.close();second=null;
  await atomicJson(resultFile,output,{immutable:true});return output;
 }catch(error){failure=error;throw error;}
 finally{
  const results=await Promise.allSettled([merchant?.close(),client?.close(),first?.close(),second?.close()]);
  const failed=results.find(value=>value.status==='rejected');if(failed&&!failure)throw failed.reason;
 }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args={},map={'--workspace':'workspaceDirectory','--directory':'directory','--python':'pythonExecutable',
  '--profiles':'profilesFile','--original-file':'originalFile','--source-directory':'sourceDirectory'};
 for(let i=2;i<process.argv.length;i+=2){
  const key=map[process.argv[i]];need(key&&!Object.hasOwn(args,key)&&process.argv[i+1],'PROJECT_PORTFOLIO_RECEIVING_ARGUMENTS');
  args[key]=process.argv[i+1];
 }
 need(args.workspaceDirectory&&args.directory,'PROJECT_PORTFOLIO_RECEIVING_INPUT');
 receiveInstalledProjectPortfolio(args).then(value=>process.stdout.write(JSON.stringify(value)+'\n')).catch(error=>{
  process.stderr.write(JSON.stringify({error:{code:error.code??error.name,message:error.message}})+'\n');process.exitCode=1;
 });
}
