#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {readCommissioningCustomerConfiguration} from './agent-connection.mjs';
import {CommissioningCustomerAgent} from './agent-customer.mjs';
import {commissioningCustomerTools,TOOL_PREFIX,need,MAX_JSON_BYTES} from './agent-contracts.mjs';
import {readWorkflowSeriesPrivateFile,workflowSeriesPrivateDirectory} from '../../stellar-forge/mcp-merchant-operator/workflow-series-connection.mjs';
import {writeConsoleWorkflowFile,writeConsoleWorkflowStream,inspectConsoleWorkflowFile} from '../../stellar-forge/mcp-merchant-operator/console/client-files.mjs';
const HELP='Complete commissioning customer — same original operator and native requests\n\n'+
'  tools\n'+
'  call --connection PRIVATE_JSON --exports PRIVATE_DIR --tool merchant_commissioning_NAME --input PRIVATE_JSON\n'+
'  download --connection PRIVATE_JSON --exports PRIVATE_DIR --instance ALIAS --capture-id UUID --out NEW_PRIVATE_FILE\n\n'+
'call retains source and complete requests in the configured private exports directory. Use receive after an interrupted apply.\n'+
'download receives every original byte and the complete manifest; the same output path resumes only that exact saved capture.\n'+
'The original facilitator-commissioning serve process remains the sole seller owner. This command does not start another listener.\n';
function options(args){
  const [command,...rest]=args;if(!command||command==='help'||command==='--help')return{command:'help'};
  if(command==='tools'){need(rest.length===0,'tools takes no connection or runtime.');return{command};}
  const out={command},allowed=command==='call'?['connection','exports','tool','input']:command==='download'?['connection','exports','instance','capture-id','out']:null;
  need(allowed,'Choose call, download or tools.');
  for(let i=0;i<rest.length;i+=2){need(rest[i]?.startsWith('--')&&rest[i+1]!==undefined&&allowed.includes(rest[i].slice(2))&&!Object.hasOwn(out,rest[i].slice(2)),'Use each documented option once.');out[rest[i].slice(2)]=rest[i+1];}
  need(allowed.every(key=>Object.hasOwn(out,key)),'Supply every documented option for this complete operation.');return out;
}
async function download(agent,o){
  const instance=o.instance,captureId=o['capture-id'],out=resolve(o.out);await workflowSeriesPrivateDirectory(dirname(out));
  const selected=await agent.call(TOOL_PREFIX+'manifest',{instance,captureId}),file=selected.manifest.file;
  const manifestOut=out+'.manifest.json';
  await writeConsoleWorkflowFile(manifestOut,selected.manifest);
  const intent={instance,captureId,manifestSha256:selected.manifestFile.sha256,file};
  await writeConsoleWorkflowFile(out+'.request.json',intent);
  let complete=false;
  try{const existing=await inspectConsoleWorkflowFile(out,file);need(existing.bytes===file.bytes&&existing.sha256===file.sha256,'This path retains another original file.','COMMISSIONING_DOWNLOAD_CHANGED');complete=true;}
  catch(e){if(e.code!=='ENOENT')throw e;}
  if(complete)return{state:'DOWNLOADED',path:out,manifest:manifestOut,...file,replayed:true};
  let readId,offset=0,returned,primary;
  try{
    const result=await writeConsoleWorkflowStream(out,async handle=>{
      const hash=createHash('sha256');
      for(;;){
        const part=await agent.call(TOOL_PREFIX+'file',{instance,captureId,expectedManifestSha256:selected.manifestFile.sha256,expectedSha256:file.sha256,...(readId?{readId}:{}),offset,limit:196608});
        need(part.instance===instance&&part.captureId===captureId&&part.manifestSha256===selected.manifestFile.sha256&&part.file.bytes===file.bytes&&part.file.sha256===file.sha256&&part.offset===offset&&part.encoding==='base64','The complete original download selection changed.','COMMISSIONING_DOWNLOAD_CHANGED');
        const bytes=Buffer.from(part.data,'base64');need(bytes.toString('base64')===part.data&&bytes.length===part.bytesRead&&offset+bytes.length<=file.bytes,'The original byte chunk differs.','COMMISSIONING_DOWNLOAD_CHANGED');
        hash.update(bytes);let used=0;while(used<bytes.length){const written=await handle.write(bytes,used,bytes.length-used);need(written.bytesWritten>0,'The complete source could not be saved.');used+=written.bytesWritten;}
        offset+=bytes.length;readId=part.readId;
        if(part.nextOffset===null){need(offset===file.bytes,'The complete original file ended early.','COMMISSIONING_DOWNLOAD_CHANGED');break;}
        need(part.nextOffset===offset&&bytes.length>0,'The original byte cursor made no progress.','COMMISSIONING_DOWNLOAD_CHANGED');
      }
      need(hash.digest('hex')===file.sha256,'The complete original download checksum differs.','COMMISSIONING_DOWNLOAD_CHANGED');
      return{bytes:offset,sha256:file.sha256};
    });
    returned={state:'DOWNLOADED',path:out,manifest:manifestOut,...file,replayed:result.state==='REOPENED'};
  }catch(e){primary=e;}finally{if(readId)try{await agent.call(TOOL_PREFIX+'file_release',{instance,captureId,readId});}catch(e){primary=primary?new AggregateError([primary,e],'Original download and read release both failed.'):e;}}
  if(primary)throw primary;return returned;
}
export async function main(args=process.argv.slice(2)){
  const o=options(args);if(o.command==='help'){process.stdout.write(HELP);return;}
  if(o.command==='tools'){const tools=commissioningCustomerTools((name,description,properties,required,annotations)=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations}));process.stdout.write(JSON.stringify({tools},null,2)+'\n');return{tools};}
  const configuration=await readCommissioningCustomerConfiguration(o.connection),exportsDirectory=resolve(o.exports);
  await workflowSeriesPrivateDirectory(exportsDirectory);
  const agent=new CommissioningCustomerAgent({facilitatorCommissioning:configuration,exportsDirectory});let result,error;
  const onSignal=()=>agent.requestClose();process.on('SIGINT',onSignal);process.on('SIGTERM',onSignal);
  try{
    if(o.command==='call'){const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readWorkflowSeriesPrivateFile(resolve(o.input),MAX_JSON_BYTES)));result=await agent.call(o.tool,input);}
    else result=await download(agent,o);
  }catch(e){error=e;}
  finally{try{await agent.close();}catch(e){error=error?new AggregateError([error,e],'The original customer action and client close both failed.'):e;}process.off('SIGINT',onSignal);process.off('SIGTERM',onSignal);}
  if(error)throw error;process.stdout.write(JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error=>{process.stderr.write(JSON.stringify({code:error.code??'COMMISSIONING_CUSTOMER_ERROR',message:error.message})+'\n');process.exitCode=1;});
