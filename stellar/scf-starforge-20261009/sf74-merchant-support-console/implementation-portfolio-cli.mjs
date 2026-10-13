#!/usr/bin/env node
// MIT. Complete original-case implementation portfolio through the maintained store.
import {resolve,dirname,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,open,link,unlink} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {openCaseStore} from './case-store.mjs';
import {commercialWorkspaceId} from './case-commercial.mjs';
import {createImplementationPortfolio} from './case-implementation-portfolio.mjs';
import {RESULT_SCHEMA,MAX_REPORT_BYTES,canonical} from './implementation-portfolio-model.mjs';
import {parseWorkspace} from './workspace-file.mjs';
import {commissioningSummary} from './commissioning.mjs';
import {readPrivateFile} from '../sf93-seller-support-bundle/incident-store.mjs';

const ACTIONS=['capture','page','detail','preview','apply','status','export'];
const MAX_INPUT_BYTES=64*1024*1024,MAX_OUTPUT_BYTES=128*1024*1024;
const json=value=>JSON.stringify(value,null,2)+'\n';
const sha=value=>createHash('sha256').update(value).digest('hex');
const fail=(message,code='IMPLEMENTATION_PORTFOLIO_CLI_INPUT')=>Object.assign(new Error(message),{code});
function absolute(value,label){
  if(typeof value!=='string'||!isAbsolute(value))throw fail(label+' must be an absolute path.');
  return resolve(value);
}
const decode=bytes=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
async function optionalExisting(path){
  try{return await readPrivateFile(path,MAX_OUTPUT_BYTES);}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
}
/** Publish complete files without replacing a previous result or user edit. */
async function publish(path,bytes,reconcileExisting=null){
  if(bytes.length>MAX_OUTPUT_BYTES)throw fail('The complete output exceeds 128 MiB.');
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const temporary=join(dirname(path),'.implementation-portfolio-'+randomUUID()+'.part');
  let handle,retained=null;
  try{
    handle=await open(temporary,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;
    try{await link(temporary,path);}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      const original=await readPrivateFile(path,MAX_OUTPUT_BYTES);
      if(original.length!==bytes.length||sha(original)!==sha(bytes)){
        if(reconcileExisting&&await reconcileExisting(original))retained=original;
        else throw fail('The output path contains different original bytes. Keep it and select another output path.','PORTFOLIO_OUTPUT_CONFLICT');
      }
    }
    const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}
    const selected=retained??bytes;
    return {path,bytes:selected.length,sha256:sha(selected),...(retained?{retained:true}:{})};
  }finally{await handle?.close();await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
/** Retain the first complete native receipt after lost stdout, including after
 * later case edits. Verify every field against its real historical case and
 * the same original save_tasks event still retained by the current case. */
async function originalReceipt(bytes,result,store){
  if(result?.state!=='COMPLETE'||!result.replayed)return false;
  let prior;try{prior=JSON.parse(decode(bytes));}catch{return false;}
  if(!prior||prior.schema!==RESULT_SCHEMA||prior.state!=='COMPLETE'||prior.workspaceId!==result.workspaceId||
    prior.case?.id!==result.case.id||prior.requestId!==result.requestId||
    prior.inputSha256!==result.inputSha256||prior.requestSha256!==result.requestSha256||
    canonical(prior.taskIds)!==canonical(result.taskIds)||canonical(prior.result)!==canonical(result.result)||
    typeof prior.replayed!=='boolean'||!/^[a-f0-9]{64}$/.test(prior.case.revision??''))return false;
  const historic=await store.read(prior.case.id,prior.case.revision),current=await store.read(prior.case.id);
  const oldState=(await parseWorkspace(historic.workspaceText)).commissioning,
    currentState=(await parseWorkspace(current.workspaceText)).commissioning,
    original=oldState?.events.find(row=>row.id===result.requestId),
    latest=currentState?.events.find(row=>row.id===result.requestId);
  if(!original||!latest||original.type!=='save_tasks'||original.requestSha256!==result.requestSha256||
    canonical(original)!==canonical(latest))return false;
  const expected={schema:RESULT_SCHEMA,state:'COMPLETE',workspaceId:result.workspaceId,
    case:{id:historic.id,revision:historic.revision,workspaceSha256:sha(historic.workspaceText),
      supportSha256:historic.supportText===null?null:sha(historic.supportText)},
    requestId:result.requestId,inputSha256:result.inputSha256,requestSha256:result.requestSha256,
    taskIds:result.taskIds,result:original.result,revision:oldState.revision,
    summary:commissioningSummary(oldState),replayed:prior.replayed};
  return canonical(prior)===canonical(expected);
}
export async function implementationPortfolioCli(argv=process.argv.slice(2)){
  const {values,positionals}=parseArgs({args:argv,allowPositionals:true,strict:true,
    options:{'cases-dir':{type:'string'},input:{type:'string'},out:{type:'string'},help:{type:'boolean'}}});
  if(values.help){
    if(positionals.length||Object.keys(values).length!==1)throw fail('Use --help on its own.');
    return {command:'merchant-implementation-portfolio',
      usage:'starforge merchant-implementation-portfolio ACTION --cases-dir ABS --input ABS --out ABS',
      actions:ACTIONS,input:'The complete JSON object accepted by the selected original portfolio service method.',
      capture:'Pin every selected saved case head. Input includes the actual asOf date and optional q/status/dueOn case filters.',
      page:'Read one complete task page from the original selection/query and returned cursor; preserve nextCursor until null.',
      detail:'Open the full original task, related material and receiving history at its pinned case revision.',
      preview:'Review owner, dueOn, status or notes changes for selected tasks in one actual current case.',
      apply:'Use the exact retained preview binding, original request UUID, actual actor and UTC recordedAt. Full receipt is retained.',
      status:'Reconcile the same complete original apply input and request; use a new output path for a later observation.',
      export:'Write the complete selected JSON or HTML operating report itself. Input format is json or html.',
      output:'Every action requires a complete create-only --out file. An existing valid first apply receipt is retained after same-request recovery.',
      source:'Reports refer to pinned case sources. Full files, history and receiving continue through original case and Handoffs.',
      guide:'IMPLEMENTATION_PORTFOLIO.md',
      limits:{inputBytes:MAX_INPUT_BYTES,reportBytes:MAX_REPORT_BYTES,outputBytes:MAX_OUTPUT_BYTES}};
  }
  if(positionals.length!==1||!ACTIONS.includes(positionals[0]))throw fail('Choose capture, page, detail, preview, apply, status or export.');
  if(Object.hasOwn(values,'help'))throw fail('Use --help on its own.');
  const action=positionals[0],directory=absolute(values['cases-dir'],'Original case directory'),
    inputPath=absolute(values.input,'Original complete JSON input'),outputPath=absolute(values.out,'Complete output');
  if(inputPath===outputPath)throw fail('Keep the original input and output in separate files.');
  const bytes=await readPrivateFile(inputPath,MAX_INPUT_BYTES);
  let args;try{args=JSON.parse(decode(bytes));}catch{throw fail('Use a complete UTF-8 JSON input object.');}
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.hasOwn(args,'signal'))throw fail('Use the original input object; signal belongs to this process.');
  const abort=new AbortController(),cancel=()=>abort.abort();
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  let service,primary;
  try{
    const store=await openCaseStore(directory);
    service=createImplementationPortfolio({store,workspaceId:commercialWorkspaceId(directory)});
    if(action==='apply'){
      const existing=await optionalExisting(outputPath);
      if(existing){
        const status=await service.status({...args,signal:abort.signal});
        if(!await originalReceipt(existing,status,store))
          throw fail('The existing output is not this request\'s complete original native receipt. Preserve it and choose another output path.','PORTFOLIO_OUTPUT_CONFLICT');
        return {...JSON.parse(decode(existing)),outputs:[{path:outputPath,bytes:existing.length,sha256:sha(existing),retained:true}]};
      }
    }
    const result=await service[action]({...args,signal:abort.signal});
    if(action==='export'){
      const output=Buffer.from(result.text);
      if(output.length!==result.bytes||sha(output)!==result.sha256)throw fail('The complete report identity differs from its original service result.');
      const published=await publish(outputPath,output);
      return {name:result.name,mediaType:result.mediaType,bytes:result.bytes,sha256:result.sha256,outputs:[published]};
    }
    const output=await publish(outputPath,Buffer.from(json(result)),
      action==='apply'&&result.replayed?original=>originalReceipt(original,result,store):null);
    return {...result,outputs:[output]};
  }catch(error){primary=error;throw error;}
  finally{
    process.off('SIGINT',cancel);process.off('SIGTERM',cancel);
    try{await service?.close();}catch(error){if(primary)primary.portfolioCloseError=error;else primary=error;}
    if(primary)throw primary;
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{process.stdout.write(json(await implementationPortfolioCli()));}
  catch(error){process.stderr.write(json({error:error.code??'IMPLEMENTATION_PORTFOLIO_FAILED',detail:error.message,
    ...(error.currentRevision?{currentRevision:error.currentRevision}:{})}));process.exitCode=1;}
}
