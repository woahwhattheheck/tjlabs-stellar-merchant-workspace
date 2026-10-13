#!/usr/bin/env node
// MIT. Allocation worksheet files over the original accounting workspace and compiler.
import {constants} from 'node:fs';
import {lstat,open,link,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {qboCheck as need,qboHash as hash,qboCanonical as canonical} from '../accountant/qbo.mjs';
import {QBO_WORKSHEET_CSV_BYTES} from '../accountant/qbo-worksheet.mjs';

export const QBO_WORKSHEET_HELP=[
  'Buyer QuickBooks allocation worksheets',
  '',
  'starforge merchant-accounting-workspace qbo-worksheet ACTION',
  '  status --url http://127.0.0.1:8446',
  '  export --url URL --input /private/export-request.json --out /private/worksheet.json --csv-out /private/allocations.csv --accounts-out /private/account-reference.csv',
  '  open --url URL --input /private/reopen-request.json --out /private/reopened.json --csv-out /private/original.csv',
  '  inspect --url URL --input /private/inspect-request.json --csv-in /private/edited.csv --out /private/inspection.json',
  '  plan-input --url URL --input /private/reviewed-request.json --csv-in /private/edited.csv --out /private/native-create-input.json',
  '',
  'Use --workspace /private/original-accounting instead of --url for a stopped',
  'workspace. This opens its original lease; it does not start a listener or provider.',
  'These commands read source and prepare files. The original journal preview,',
  'create and review workflow still owns every retained journal and posting.',
  '',
  'Export and keep the complete worksheet record before editing its CSV.',
  'Keep every allocation row, protected source cell and the one JOURNAL row.',
  'Inspect compares the exported base, returned file and current draft field by field.',
  'Resolve each conflict with its exact preview ID and current/returned choice.',
  'plan-input requires that inspected preview SHA and original journal metadata.',
  '',
  'Input is UTF-8 JSON up to 32 MiB; edited CSV is at most 16 MiB and the combined',
  'request must fit 32 MiB. Outputs are private create-only files with exact replay.',
  'See workspace/QBO_WORKSHEETS.md for complete schemas, examples and draft recovery.',
  ''
].join('\n');
const LIMIT=32*1024*1024,SCHEMA='stellar-forge.qbo-worksheet-response.v1';
const bytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const actions={status:[],export:['--input','--csv-out','--accounts-out'],open:['--input','--csv-out','--accounts-out'],
  inspect:['--input','--csv-in'],'plan-input':['--input','--csv-in']};
function argumentsFor(argv){
  const [action,...args]=argv;need(Object.hasOwn(actions,action),'QBO_WORKSHEET_ARGUMENTS',QBO_WORKSHEET_HELP);
  const allowed=new Set(['--workspace','--url','--out',...actions[action]]),options={};
  for(let index=0;index<args.length;index++){
    const key=args[index];need(allowed.has(key)&&!Object.hasOwn(options,key)&&args[index+1]&&!args[index+1].startsWith('--'),
      'QBO_WORKSHEET_ARGUMENTS',QBO_WORKSHEET_HELP);options[key]=args[++index];
  }
  need(Boolean(options['--workspace'])!==Boolean(options['--url']),'QBO_WORKSHEET_TARGET',
    'Choose the stopped original accounting workspace or its running loopback URL.');
  return {action,options};
}
function required(options,key){need(typeof options[key]==='string'&&options[key].trim(),'QBO_WORKSHEET_ARGUMENTS','Provide '+key+'.');return options[key];}
function endpoint(value){
  let url;try{url=new URL(value);}catch{}
  need(url&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)&&!url.username&&!url.password&&
    url.pathname==='/'&&!url.search&&!url.hash,'QBO_WORKSHEET_LOOPBACK','Use the original loopback accounting workspace URL.');
  return url;
}
async function readInput(filename,limit){
  const file=await open(resolve(filename),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const before=await file.stat();need(before.isFile()&&before.size>0&&before.size<=limit,
      'QBO_WORKSHEET_INPUT','Select the complete regular input file within its documented limit.');
    const raw=await file.readFile(),after=await file.stat();
    need(raw.length===before.size&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs,
      'QBO_WORKSHEET_INPUT_CHANGED','The selected original file changed during its read.',409);
    return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);
  }finally{await file.close();}
}
async function publish(filename,raw){
  const path=resolve(filename),parent=dirname(path),stat=await lstat(parent);
  need(stat.isDirectory()&&!stat.isSymbolicLink(),'QBO_WORKSHEET_OUTPUT_DIRECTORY','Choose an existing private output directory.');
  const temporary=resolve(parent,'.qbo-worksheet-'+randomUUID()+'.pending');
  const file=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{
    try{await file.writeFile(raw);await file.sync();}finally{await file.close();}
    try{await link(temporary,path);}catch(error){
      if(error.code!=='EEXIST')throw error;
      const saved=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
      try{
        const before=await saved.stat();need(before.isFile()&&before.size===raw.length,'QBO_WORKSHEET_OUTPUT_EXISTS',
          'The output already contains another file. Keep it and select another result filename.',409);
        const existing=await saved.readFile(),after=await saved.stat();
        need(existing.length===raw.length&&hash(existing)===hash(raw)&&before.size===after.size&&
          before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs,'QBO_WORKSHEET_OUTPUT_EXISTS',
          'The output already contains different bytes. Keep it and select another result filename.',409);
      }finally{await saved.close();}
    }
    const directory=await open(parent,'r');try{await directory.sync();}finally{await directory.close();}
    return {path,bytes:raw.length,sha256:hash(raw)};
  }finally{await rm(temporary,{force:true});}
}
export async function qboWorksheetMain(argv,{signal}={}){
  if(!argv.length||argv.includes('--help')||argv[0]==='help'){process.stdout.write(QBO_WORKSHEET_HELP);return;}
  const {action,options}=argumentsFor(argv),controller=signal?null:new AbortController();signal??=controller.signal;
  const stop=()=>controller?.abort();if(controller){process.once('SIGINT',stop);process.once('SIGTERM',stop);}
  let workspace,qbo,handleQboRequest;
  try{
    const url=options['--url']?endpoint(options['--url']):null;
    let value;
    if(action!=='status'){
      value=JSON.parse((await readInput(required(options,'--input'),LIMIT)).replace(/^\uFEFF/,''));
      need(value&&typeof value==='object'&&!Array.isArray(value),'QBO_WORKSHEET_INPUT','Use a complete worksheet request object.');
      if(options['--csv-in']){
        need(!Object.hasOwn(value,'csvText'),'QBO_WORKSHEET_INPUT','Choose csvText in the original JSON or --csv-in, once.');
        value.csvText=await readInput(options['--csv-in'],QBO_WORKSHEET_CSV_BYTES);
      }
      canonical(value);need(Buffer.byteLength(JSON.stringify(value),'utf8')<=LIMIT,'QBO_WORKSHEET_INPUT',
        'The complete worksheet request, base draft and edited CSV exceed 32 MiB.');
    }
    if(!url){
      const directory=resolve(options['--workspace']),stat=await lstat(resolve(directory,'workspace.json'));
      need(stat.isFile()&&!stat.isSymbolicLink(),'QBO_WORKSHEET_EXISTING_WORKSPACE','Select the original existing accounting workspace.');
      const [{openAccountingWorkspace},{AccountantWorkspace},native]=await Promise.all([
        import('./store.mjs'),import('./accountant-workspace.mjs'),import('./qbo-workspace.mjs')]);
      signal.throwIfAborted();workspace=await openAccountingWorkspace({directory});
      qbo=new native.QboWorkspace(workspace,new AccountantWorkspace(workspace));handleQboRequest=native.handleQboRequest;
      // No recover(), provider startup or financial dispatch is performed.
    }
    signal.throwIfAborted();
    const path='/api/qbo/worksheets'+(action==='status'?'':'/'+action);
    let result;
    if(qbo)result=(await handleQboRequest(qbo,{method:value===undefined?'GET':'POST',path,value})).value;
    else{
      let response;try{response=await fetch(new URL(path,url),{method:value===undefined?'GET':'POST',signal,redirect:'error',cache:'no-store',
        ...(value===undefined?{}:{headers:{'Content-Type':'application/json','X-Workspace-Request':'1',
          'X-Accounting-Workspace-Id':value.binding?.workspaceId??'','X-Accounting-Sources-Sha256':value.binding?.sourcesSha256??''},
          body:JSON.stringify(value)})});}
      catch(error){throw Object.assign(new Error('The read-only worksheet response was not received. Keep its exact input and retry after reconnecting.'),
        {code:'QBO_WORKSHEET_TRANSPORT',cause:error});}
      try{result=await response.json();}catch{throw Object.assign(new Error('The worksheet response was not readable JSON. Keep the original input.'),{code:'QBO_WORKSHEET_RESPONSE'});}
      if(!response.ok)throw Object.assign(new Error(result.message??'The worksheet could not be inspected.'),{code:result.error??'QBO_WORKSHEET_FAILED',status:response.status});
      need(response.headers.get('X-Accounting-Reopen-Required')!=='1','QBO_WORKSPACE_REOPEN_REQUIRED',
        'Reopen the original accounting workspace before relying on its worksheet source.',409);
      if(value?.binding)need(response.headers.get('X-Accounting-Workspace-Id')===value.binding.workspaceId&&
        response.headers.get('X-Accounting-Sources-Sha256')===value.binding.sourcesSha256,'QBO_WORKSHEET_WORKSPACE_CHANGED',
        'The listener now serves another workspace. Preserve the original worksheet and input.',409);
    }
    need(result?.schema===SCHEMA&&result.binding,'QBO_WORKSHEET_RESPONSE','The response is not the original worksheet envelope.');
    if(value?.binding)need(canonical(result.binding)===canonical(value.binding),'QBO_WORKSHEET_WORKSPACE_CHANGED',
      'The response belongs to another accounting workspace or source.',409);
    if(options['--csv-out']){
      need(typeof result.csvText==='string','QBO_WORKSHEET_RESPONSE','The original worksheet CSV is missing.');
      const csvFile=await publish(options['--csv-out'],Buffer.from(result.csvText,'utf8'));
      const {csvText,...record}=result;result={...record,csvFile};
    }
    if(options['--accounts-out']){
      need(typeof result.accountReference?.csvText==='string','QBO_WORKSHEET_RESPONSE','The original company account reference is missing.');
      const accountFile=await publish(options['--accounts-out'],Buffer.from(result.accountReference.csvText,'utf8'));
      const {csvText,...reference}=result.accountReference;result={...result,accountReference:{...reference,csvFile:accountFile}};
    }
    // The plan-input output itself is accepted by the original POST /api/qbo/plans.
    const delivered=action==='plan-input'?result.request:result;
    const saved=options['--out']?await publish(options['--out'],bytes(delivered)):null;
    const report=saved?{file:saved,...(result.csvFile?{csvFile:result.csvFile}:{}),...(result.accountReference?.csvFile?{accountReferenceFile:result.accountReference.csvFile}:{}),
      ...(action==='plan-input'?{worksheetPreviewSha256:result.worksheetPreviewSha256,previewSha256:result.previewSha256}: {})}:delivered;
    process.stdout.write(bytes(report));return report;
  }finally{
    const errors=[];for(const owner of [qbo,workspace])try{await owner?.close();}catch(error){errors.push(error);}
    if(controller){process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
    if(errors.length)throw new AggregateError(errors,'The original worksheet workspace did not close cleanly.');
  }
}
export const main=qboWorksheetMain;
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(error=>{
  console.error(JSON.stringify({code:error.code??'QBO_WORKSHEET_FAILED',message:error.message}));process.exitCode=1;
});
