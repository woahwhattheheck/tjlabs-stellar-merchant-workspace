#!/usr/bin/env node
// MIT. Explicit original request files and a foreground borrowed procedure editor.
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {connectProject} from './client.mjs';
import {createOperatingPlanServer} from './operating-server.mjs';
import {json,readBytes,durable,jsonBytes,absolute,need} from './common.mjs';
const HELP='Lightdash customer operating procedures\n\n'+
 'starforge lightdash-operating-plan serve --project ABSOLUTE_DIRECTORY [--port 8856]\n'+
 'starforge lightdash-operating-plan call --project ABSOLUTE_DIRECTORY --request COMPLETE_JSON [--output RESULT_JSON]\n'+
 'starforge lightdash-operating-plan export --project ABSOLUTE_DIRECTORY --id PLAN_ID --format json|plan|markdown|html --output FILE\n\n'+
 'Run lightdash-project serve for this original project first. The procedure editor borrows that MCP owner.\n'+
 'A request is {method:"create|adopt|save|capture|receive|return_preview|return_apply|read|list|source|request",args:{...}}.\n'+
 'Every mutation supplies planId, requestId and expectedVersion. Preserve the exact file after a lost response.\n'+
 'No procedure action executes or refreshes dbt, Lightdash, warehouse, preview or payment work.\n';
function options(argv){
 const out={};for(let i=0;i<argv.length;i++){
  if(argv[i]==='--startup-json'){need(!out.startupJson,'LIGHTDASH_PROCEDURE_ARGUMENT','Duplicate startup flag.');out.startupJson=true;continue;}
  const k=argv[i];need(['--project','--port','--request','--output','--id','--format','--expected-project-sha256','--expected-workspace-id','--expected-workspace-identity','--expected-manifest-sha256','--expected-host-instance-id','--expected-authoring-instance-id'].includes(k)&&!Object.hasOwn(out,k.slice(2))&&i+1<argv.length,
   'LIGHTDASH_PROCEDURE_ARGUMENT','Use the documented complete flags.');
  out[k.slice(2)]=argv[++i];
 }return out;
}
export async function main(argv=process.argv.slice(2)){
 const [action,...rest]=argv;if(!action||['--help','help','-h'].includes(action)){process.stdout.write(HELP);return;}
 const o=options(rest),projectDirectory=absolute(o.project);
 if(action==='serve'){
  const flags={'expected-project-sha256':'projectSha256','expected-workspace-id':'workspaceId','expected-workspace-identity':'workspaceIdentity','expected-manifest-sha256':'manifestSha256','expected-host-instance-id':'hostInstanceId','expected-authoring-instance-id':'authoringInstanceId'};
  need(Object.keys(o).every(k=>['project','port','startupJson',...Object.keys(flags)].includes(k)),'LIGHTDASH_PROCEDURE_ARGUMENT','Use documented serve identity flags.');
  if(o.startupJson)need(Object.keys(flags).every(k=>typeof o[k]==='string'),'LIGHTDASH_PROCEDURE_ARGUMENT','Managed startup requires every reviewed identity.');
  const expected=Object.fromEntries(Object.entries(flags).filter(([k])=>o[k]!==undefined).map(([k,v])=>[v,o[k]]));
  const controller=new AbortController();let service,stopped=false,wake,keepalive,drained=false;
  const stop=()=>{stopped=true;controller.abort();wake?.();};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  const drain=async close=>{
   for(;;){try{await close();return;}catch(error){
    process.stderr.write(JSON.stringify({state:'CLOSE_INCOMPLETE',code:error.code??'LIGHTDASH_PROCEDURE_CLOSE_FAILED',
     message:'Editor ownership retained. Inspect its failure, then signal this same process to retry draining.'})+'\n');
    keepalive??=setInterval(()=>{},60000);
    await new Promise(resolve=>{wake=resolve;});wake=null;
   }}
  };
  try{
   try{service=await createOperatingPlanServer({projectDirectory,port:o.port===undefined?0:Number(o.port),expected,startupSignal:controller.signal});}
   catch(error){if(error.close)await drain(error.close);if(stopped&&error.code==='LIGHTDASH_PROCEDURE_START_CANCELLED')return;throw error;}
   if(!stopped){
    process.stdout.write(JSON.stringify(o.startupJson?service.announcement:{state:'OPEN',url:service.url,workspaceId:service.workspaceId,instanceId:service.announcement.instanceId,nativeDispatch:false})+'\n');
    await new Promise(resolve=>{wake=resolve;if(stopped)resolve();});wake=null;
   }
   await drain(service.close);drained=true;
  }finally{
   if(service&&!drained)await drain(service.close);
   if(keepalive)clearInterval(keepalive);
   process.off('SIGINT',stop);process.off('SIGTERM',stop);
  }
  return;
 }
 const client=await connectProject(projectDirectory);
 try{
  if(action==='call'){
   need(Object.keys(o).every(k=>['project','request','output'].includes(k)),'LIGHTDASH_PROCEDURE_ARGUMENT','Use project/request/output for call.');
   const r=await json(absolute(o.request),{maximum:28*1024*1024});
   need(r&&Object.keys(r).every(k=>['method','args'].includes(k))&&['create','adopt','save','capture','receive','return_preview','return_apply','read','list','source','request'].includes(r.method)&&r.args&&
    !Object.hasOwn(r.args,'workspace'),'LIGHTDASH_PROCEDURE_ARGUMENT','Supply a complete procedure request.');
   const result=await client.call('merchant_lightdash_operating_'+r.method,r.args),bytes=jsonBytes(result);
   if(o.output)await durable(absolute(o.output),bytes,{createOnly:true});else process.stdout.write(bytes);
   return;
  }
  if(action==='export'){
   need(Object.keys(o).every(k=>['project','id','format','output'].includes(k))&&o.output,'LIGHTDASH_PROCEDURE_ARGUMENT','Supply id/format/output for export.');
   const result=await client.call('merchant_lightdash_operating_export',{planId:o.id,format:o.format??'json'});
   await durable(absolute(o.output),Buffer.from(result.content),{createOnly:true});
   process.stdout.write(JSON.stringify({path:o.output,bytes:result.bytes,sha256:result.sha256,version:result.version})+'\n');return;
  }
  throw new Error(HELP);
 }finally{await client.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
