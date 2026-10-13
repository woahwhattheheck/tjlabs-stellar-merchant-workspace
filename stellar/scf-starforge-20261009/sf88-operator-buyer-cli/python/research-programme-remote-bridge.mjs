// MIT. Python bridge to the original remote programme owner, with full-file replies.
import {resolve,dirname,join,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ResearchProgrammeOperator,readResearchProgrammeOperatorConfiguration,RESEARCH_PROGRAMME_OPERATOR_COMMANDS}
 from '../../../../stellar-forge/mcp-merchant-operator/research-programme-operator.mjs';
import {readResearchHostFile,openResearchSource} from '../research-dossiers/workspace-files.mjs';
import {writePortableFile} from '../research-dossiers/portable.mjs';
import {exists} from '../node/store.mjs';
import {need,fingerprint} from '../research-dossiers/customer-quotes/contracts.mjs';

const SCHEMA='stellar-forge.research-remote-python.v1',MODE='RESEARCH_PROGRAMME_REMOTE_BRIDGE';
const REQUEST_LIMIT=2*1024*1024,ARGUMENT_LIMIT=16*1024*1024,REPLY_LIMIT=603027776;
const HASH=/^[a-f0-9]{64}$/,WORKSPACE=/^research_[a-f0-9]{64}$/;
const sha=body=>createHash('sha256').update(body).digest('hex');
const same=(a,b)=>fingerprint(a)===fingerprint(b);
const json=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
const inside=(root,path)=>path===root||path.startsWith(root+sep);
const canonical=value=>{
 need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&!/[\u0000-\u001f\u007f]/.test(value),
  'RESEARCH_REMOTE_PATH_INVALID');return value;
};
// Python's sorted, compact, UTF-8 JSON is reproduced for the retained request
// hash. Strings are encoded with literal Unicode by both original runtimes.
function sorted(value){
 if(Array.isArray(value))return value.map(sorted);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])]));
 return value;
}
function requestSha(value){return sha(Buffer.from(JSON.stringify(sorted(value))));}
function streamText(stream,text){
 return new Promise((resolve_,reject)=>{
  const cleanup=()=>{stream.removeListener('error',failed);stream.removeListener('close',closed);};
  const failed=error=>{cleanup();reject(error);};
  const closed=()=>{cleanup();reject(stream.errored??new Error('The output stream closed before its write completed.'));};
  stream.once('error',failed);stream.once('close',closed);
  try{stream.write(text,error=>{
   if(error){if(stream.closed)cleanup();reject(error);return;}cleanup();resolve_();
  });}catch(error){cleanup();reject(error);}
 });
}
async function exactFile(path,body,owners){
 if(await exists(path)){
  const source=await openResearchSource(path,body.length,{sha256:sha(body)});owners.add(source);
  let primary;try{need(source.bytes===body.length,'RESEARCH_REMOTE_RETAINED_FILE_CHANGED');}catch(error){primary=error;}
  try{await source.close();owners.delete(source);}catch(error){primary??=error;}
  if(primary)throw primary;
  return {path,bytes:body.length,sha256:sha(body)};
 }
 const result=await writePortableFile(path,{body,filename:'research-remote-result.json',contentType:'application/json'});
 return {path,bytes:result.bytes,sha256:result.sha256};
}
async function verifyFile(file,owners){
 need(file&&Number.isSafeInteger(file.bytes)&&file.bytes>=0&&HASH.test(file.sha256),'RESEARCH_REMOTE_FILE_INVALID');
 canonical(file.path);const source=await openResearchSource(file.path,file.bytes,{sha256:file.sha256});owners.add(source);
 let primary;try{need(source.bytes===file.bytes,'RESEARCH_REMOTE_FILE_CHANGED');}catch(error){primary=error;}
 try{await source.close();owners.delete(source);}catch(error){primary??=error;}
 if(primary)throw primary;
}
async function work(input,owners,stopped,{operatorFactory}){
 const request=input.request,journal=canonical(input.journalDirectory);
 need(input.schema===SCHEMA&&request?.schema===SCHEMA&&HASH.test(input.requestSha256)&&
  requestSha(request)===input.requestSha256,'RESEARCH_REMOTE_REQUEST_CHANGED');
 need(typeof request.callId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(request.callId)&&
  typeof request.workspace==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(request.workspace)&&
  WORKSPACE.test(request.workspaceId)&&
  [...RESEARCH_PROGRAMME_OPERATOR_COMMANDS,'export'].includes(request.command),'RESEARCH_REMOTE_REQUEST_CHANGED');
 const root=join(journal,'calls',sha(Buffer.from(request.callId))),reply=canonical(input.replyFile),
  receipt=canonical(input.receiptFile),captured=join(root,'native-reply.json');
 need(reply===join(root,'reply.json')&&receipt===join(root,'native-completed.json')&&
  request.arguments?.path===join(root,'arguments.json')&&
  input.configuration?.file===join(journal,'configuration.json')&&
  input.configuration.sha256===request.configurationSha256,'RESEARCH_REMOTE_REQUEST_CHANGED');
 const retainedRequest=json(await readResearchHostFile(join(root,'request.json'),1024*1024,{privateFile:true}));
 need(same(retainedRequest,request),'RESEARCH_REMOTE_REQUEST_CHANGED');

 async function completed(){
  const value=json(await readResearchHostFile(receipt,1024*1024,{privateFile:true}));
  need(value.schema===SCHEMA&&value.requestSha256===input.requestSha256&&
   value.workspaceId===request.workspaceId&&value.file?.path===reply&&
   (request.command==='export')===(value.exportedFile!==null)&&
   (request.command!=='export'||value.exportedFile?.path===request.file),
   'RESEARCH_REMOTE_RESULT_CHANGED');
  await verifyFile(value.file,owners);if(value.exportedFile)await verifyFile(value.exportedFile,owners);
  return value;
 }
 if(await exists(receipt))return completed();

 async function publish(envelope){
  need(envelope.schema===SCHEMA&&envelope.requestSha256===input.requestSha256&&
   envelope.workspaceId===request.workspaceId&&Object.hasOwn(envelope,'result'),'RESEARCH_REMOTE_RESULT_CHANGED');
  const body=Buffer.from(JSON.stringify(envelope.result)+'\n');
  need(body.length<=REPLY_LIMIT,'RESEARCH_REMOTE_REPLY_LIMIT');
  const file=await exactFile(reply,body,owners);
  const exportedFile=request.command==='export'?envelope.result?.file:null;
  if(exportedFile){need(exportedFile.path===request.file,'RESEARCH_REMOTE_FILE_CHANGED');await verifyFile(exportedFile,owners);}
  need(request.command!=='export'||exportedFile,'RESEARCH_REMOTE_FILE_CHANGED');
  const result={schema:SCHEMA,requestSha256:input.requestSha256,workspaceId:request.workspaceId,
   file,exportedFile,completedAt:envelope.completedAt};
  await exactFile(receipt,Buffer.from(JSON.stringify(result)+'\n'),owners);return result;
 }
 // A first full response is retained independently of output-file publication.
 // Finish that exact response after a lost stdout reply or stopped publisher.
 if(await exists(captured))return publish(json(await readResearchHostFile(captured,REPLY_LIMIT+65536,{privateFile:true})));
 need(!stopped(),'RESEARCH_REMOTE_STOPPED');
 const selected=await readResearchProgrammeOperatorConfiguration(input.configuration.file);
 need(selected.sha256===input.configuration.sha256&&selected.bytes===input.configuration.bytes,
  'RESEARCH_REMOTE_CONFIGURATION_CHANGED');
 need(!inside(selected.configuration.directory,journal)&&!inside(journal,selected.configuration.directory),
  'RESEARCH_REMOTE_DIRECTORY_OVERLAP');
 const definition=selected.configuration.workspaces.find(item=>item.id===request.workspace);
 need(definition?.workspaceId===request.workspaceId,'RESEARCH_REMOTE_WORKSPACE_CHANGED');
 const argumentsBody=await readResearchHostFile(request.arguments.path,ARGUMENT_LIMIT,
  {privateFile:true,sha256:request.arguments.sha256});
 need(argumentsBody.length===request.arguments.bytes,'RESEARCH_REMOTE_INPUT_CHANGED');
 const args=json(argumentsBody);need(args&&typeof args==='object'&&!Array.isArray(args),'RESEARCH_REMOTE_ARGUMENTS_INVALID');
 if(request.command==='export'){
  const destination=canonical(request.file);
  need(!inside(journal,destination)&&destination!==input.configuration.source&&
   destination!==request.arguments.source,'RESEARCH_REMOTE_OUTPUT_OVERLAP');
 }else need(request.file===null,'RESEARCH_REMOTE_REQUEST_CHANGED');
 need(!stopped(),'RESEARCH_REMOTE_STOPPED');
 const operator=operatorFactory(selected.configuration);
 if(operator&&typeof operator.close==='function')owners.add(operator);
 need(operator&&typeof operator.call==='function'&&typeof operator.exportFile==='function'&&
  typeof operator.close==='function','RESEARCH_REMOTE_OPERATOR_REQUIRED');
 const result=request.command==='export'?
  await operator.exportFile(request.workspace,args,{file:request.file}):
  await operator.call(request.workspace,request.command,args);
 const envelope={schema:SCHEMA,requestSha256:input.requestSha256,workspaceId:request.workspaceId,
  result,completedAt:new Date().toISOString()};
 const body=Buffer.from(JSON.stringify(envelope)+'\n');
 need(body.length<=REPLY_LIMIT+65536,'RESEARCH_REMOTE_REPLY_LIMIT');
 await exactFile(captured,body,owners);
 return publish(envelope);
}
/** Own the original runtime until accepted work, all closers and output settle. */
export async function main(argv=process.argv.slice(2),{stdout=process.stdout,stderr=process.stderr,
 operatorFactory=configuration=>new ResearchProgrammeOperator(configuration)}={}){
 const owners=new Set();let active,closing,keepAlive,stopping=false,primary,result,acquired=false;
 const retain=()=>{keepAlive??=setInterval(()=>{},1000);};
 const clear=()=>{if(keepAlive){clearInterval(keepAlive);keepAlive=null;}};
 const cleanup=()=>{
  if(closing)return closing;
  closing=(async()=>{
   if(active)await active.catch(()=>{});
   const failures=[];
   for(const owner of [...owners]){
    try{await owner.close();owners.delete(owner);}catch(error){failures.push(error);}
   }
   if(failures.length){retain();const error=failures[0];error.closeErrors=failures.slice(1);throw error;}
   clear();
  })().catch(error=>{closing=null;throw error;});return closing;
 };
 const onSignal=()=>{stopping=true;retain();cleanup().catch(()=>{process.exitCode=1;});};
 process.on('SIGINT',onSignal);process.on('SIGTERM',onSignal);
 try{
  need(argv.length===2&&argv[0]==='--request','RESEARCH_REMOTE_ARGUMENTS_REQUIRED');
  active=(async()=>{
   const input=json(await readResearchHostFile(canonical(argv[1]),REQUEST_LIMIT,{privateFile:true}));
   acquired=true;return work(input,owners,()=>stopping,{operatorFactory});
  })();
  result=await active;
 }catch(error){primary=error;if(typeof error?.close==='function')owners.add(error);}
 active=null;
 try{await cleanup();}catch(error){primary??=error;}
 const output=result?{mode:MODE,ok:true,result,sourceCleanupFailed:primary?.code??primary?.message??null}:
  {mode:MODE,ok:false,error:primary?.code??primary?.message??'RESEARCH_REMOTE_FAILED',outcomeUnknown:acquired};
 try{await streamText(stdout,JSON.stringify(output)+'\n');}
 catch(error){primary??=error;await streamText(stderr,JSON.stringify({error:'RESEARCH_REMOTE_OUTPUT_FAILED'})+'\n').catch(()=>{});}
 if(!owners.size){clear();process.off('SIGINT',onSignal);process.off('SIGTERM',onSignal);}
 return primary?1:stopping?130:0;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().then(code=>{process.exitCode=code;},()=>{process.exitCode=1;});
}
