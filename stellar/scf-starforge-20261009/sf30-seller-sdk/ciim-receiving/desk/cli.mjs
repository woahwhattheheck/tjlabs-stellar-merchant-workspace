#!/usr/bin/env node
// MIT. Typed operator commands over one retained CIIM receiving desk.
import {constants} from 'node:fs';
import {open,realpath,unlink,link} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {openCiimDesk,describeCiimDesk} from './model.mjs';
import {describeDeskOperations,executeDeskOperation} from './client.mjs';
import {LIMITS,fault,parseJson,copyOriginal} from './portable.mjs';
import {syncDirectory} from '../../postgres/publisher/files.mjs';

export const HELP=String.raw`CIIM receiving desk

Open and operate the same retained native metadata and named receiving reviews.

  ciim-desk connected --help             Operate an already running receiving desk.
  ciim-desk init --workspace ABS [--python PYTHON]
  ciim-desk serve --workspace ABS [--python PYTHON] [--port PORT]
      [--expected-workspace-id ID --expected-marker-sha256 SHA256]
  ciim-desk describe
  ciim-desk operations
  ciim-desk status --workspace ABS
  ciim-desk list --workspace ABS --view records --edition ID
      [--offset N --limit N --status active --query TEXT]
  ciim-desk record --workspace ABS --edition ID --record ID
  ciim-desk import --workspace ABS --file ORIGINAL.zip
      [--filename ORIGINAL_NAME --sha256 SHA256 --bytes COUNT]
  ciim-desk accept --workspace ABS --candidate ID --label TEXT
      [--edition ID ...] WRITE_FLAGS
  ciim-desk context --workspace ABS --file CONTEXT.json WRITE_FLAGS
  ciim-desk review edition --workspace ABS --edition ID REVIEW_FLAGS WRITE_FLAGS
  ciim-desk review profile --workspace ABS --edition ID --profile SHA256 REVIEW_FLAGS WRITE_FLAGS
  ciim-desk review records --workspace ABS --edition ID
      (--record ID ... | --population SHA256) REVIEW_FLAGS WRITE_FLAGS
  ciim-desk compare --workspace ABS --before ID --after ID --label TEXT WRITE_FLAGS
  ciim-desk review comparison --workspace ABS --comparison ID REVIEW_FLAGS WRITE_FLAGS
  ciim-desk handback --workspace ABS --edition ID ... [--comparison ID ...]
      --label TEXT --authority ID (--note TEXT | --note-file ABS) WRITE_FLAGS
  ciim-desk restore --workspace ABS --candidate ID
      (--note TEXT | --note-file ABS) WRITE_FLAGS
  ciim-desk act --workspace ABS --request ORIGINAL_REQUEST.json
  ciim-desk export --workspace ABS --kind workspace [--out ABS]
  ciim-desk export --workspace ABS --kind handback --handback ID [--out ABS]
  ciim-desk attachment --workspace ABS --edition ID --kind xml --id REQUEST_ID --out ABS

WRITE_FLAGS: --operation ORIGINAL_ID --revision EXACT_CURRENT_REVISION --actor NAME
REVIEW_FLAGS: --decision accept|needs_changes|reopen --authority ID
              (--note TEXT | --note-file ABS) [--reference TEXT]
Record decisions also support exclude.

import retains and inspects the exact original ZIP. accept selects its original
native editions; restore reopens a complete workspace or handback into a fresh
revision-zero desk. The original workspace/edition/record IDs and full decision
history survive restoration. Initialize or restore before selecting Applications.

context reads the declared context.save data object. Omitted context fields remain
unchanged; explicit null clears an optional institutional choice. operations emits
the complete machine-readable typed schema and original review requirements.

Use the same complete original write request after a lost response. Saved operation
IDs replay before revision checks. A changed payload must have a new operation ID.

Original record strings, repeated arrays, null and absence stay distinct. Explicit
OAI deletion remains withdrawal; absence from another edition does not create one.
Workspace exports contain complete original archives and retained history. Reviewed
handbacks include readable named decisions and the complete original input coverage.
`;

const common=['workspace','python'];
const write=['operation','revision','actor'];
const reviewFlags=['decision','authority','note','note-file','reference'];
const kinds=new Map([
  ['init',[]],['status',[]],['describe',[]],['operations',[]],
  ['serve',['port','host','expected-workspace-id','expected-marker-sha256']],
  ['list',['view','edition','comparison','offset','limit','status','query']],
  ['record',['edition','record']],
  ['import',['file','filename','sha256','bytes']],
  ['accept',['candidate','label','edition',...write]],
  ['context',['file',...write]],
  ['review',['edition','record','profile','comparison','population',...reviewFlags,...write]],
  ['compare',['before','after','label',...write]],
  ['handback',['edition','comparison','label','authority','note','note-file',...write]],
  ['restore',['candidate','note','note-file',...write]],
  ['act',['request']],['export',['kind','handback','out']],
  ['attachment',['edition','kind','id','out']],
]);
function parseArgs(args) {
  if(!Array.isArray(args)||args.some(value=>typeof value!=='string'))throw fault('CLI_ARGUMENTS','Use string command arguments.');
  if(!args.length||args[0]==='help'||args.includes('--help'))return {command:'help',options:{}};
  const command=args[0];
  if(!kinds.has(command))throw fault('CLI_COMMAND','Choose a declared receiving command. See --help.');
  let index=1,scope;
  if(command==='review'){
    scope=args[index++];
    if(!['edition','profile','records','comparison'].includes(scope))throw fault('CLI_REVIEW_SCOPE','Choose edition, profile, records or comparison.');
  }
  const scopeFlags={edition:['edition'],profile:['edition','profile'],records:['edition','record','population'],comparison:['comparison']};
  const declared=command==='review'?[...scopeFlags[scope],...reviewFlags,...write]:kinds.get(command);
  const allowed=new Set([...common,...declared]),options={};
  for(;index<args.length;index++){
    const name=args[index];
    if(!/^--[a-z][a-z-]*$/.test(name)||!allowed.has(name.slice(2)))throw fault('CLI_ARGUMENT','Unknown argument '+name+'.');
    const key=name.slice(2),value=args[++index];
    if(value===undefined||value.startsWith('--'))throw fault('CLI_ARGUMENT','Provide a value for '+name+'.');
    if(['edition','record','comparison'].includes(key)){
      options[key]??=[];options[key].push(value);
    }else{
      if(Object.hasOwn(options,key))throw fault('CLI_ARGUMENT','Provide '+name+' once.');
      options[key]=value;
    }
  }
  return {command,scope,options};
}
function required(options,key) {
  const value=options[key];
  if(typeof value!=='string'||!value.length)throw fault('CLI_REQUIRED','Provide --'+key+'.');
  return value;
}
function absolute(value,label) {
  if(typeof value!=='string'||!value||resolve(value)!==value||value==='/')throw fault('CLI_ABSOLUTE_PATH','Use an absolute '+label+' path.');
  return value;
}
function integer(value,label,{minimum=0,maximum=Number.MAX_SAFE_INTEGER}={}) {
  if(typeof value!=='string'||!/^(0|[1-9]\d*)$/.test(value)||!Number.isSafeInteger(Number(value))||
      Number(value)<minimum||Number(value)>maximum)throw fault('CLI_INTEGER','Use an exact integer for --'+label+'.');
  return Number(value);
}
function one(options,key,needed=true) {
  const values=options[key]??[];
  if(values.length>1||needed&&values.length!==1)throw fault('CLI_SELECTION','Choose '+(needed?'exactly one':'at most one')+' --'+key+'.');
  return values[0];
}
function many(options,key,needed=true) {
  const values=options[key]??[];
  if(needed&&!values.length||new Set(values).size!==values.length)throw fault('CLI_SELECTION','Choose each original --'+key+' once.');
  return values;
}
async function originalFile(path,maximum=16*1024*1024) {
  absolute(path,'input');
  if(await realpath(path)!==path)throw fault('CLI_SOURCE_LINK','Read the exact original regular input.');
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const before=await handle.stat({bigint:true});
    if(!before.isFile()||before.size>BigInt(maximum))throw fault('CLI_SOURCE_LIMIT','The original input exceeds its size limit.',413);
    const body=await handle.readFile();
    const after=await handle.stat({bigint:true});
    if(body.length>maximum||BigInt(body.length)!==before.size||before.size!==after.size||
        before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs)throw fault('CLI_SOURCE_CHANGED','The original input changed during reading.',409);
    return body;
  }finally{await handle.close();}
}
async function note(options) {
  if(Object.hasOwn(options,'note')===Object.hasOwn(options,'note-file'))
    throw fault('CLI_NOTE','Choose --note or --note-file.');
  if(options['note-file']){
    try{return new TextDecoder('utf-8',{fatal:true}).decode(await originalFile(options['note-file'],32768));}
    catch(error){if(error.code)throw error;throw fault('CLI_NOTE_ENCODING','The original note must be UTF-8.');}
  }
  return required(options,'note');
}
async function reviewData(options) {
  return {decision:required(options,'decision'),authorityId:required(options,'authority'),note:await note(options),
    ...(Object.hasOwn(options,'reference')?{reference:options.reference}:{})};
}
function writeRequest(type,data,options) {
  return {operationId:required(options,'operation'),expectedRevision:integer(required(options,'revision'),'revision'),
    actor:required(options,'actor'),type,data};
}
async function outputFile(item,path,{body}={}) {
  absolute(path,'output');
  const temporary=resolve(dirname(path),'.ciim-output-'+randomUUID()+'.pending');
  try{
    if(body){
      if(body.length!==item.bytes||createHash('sha256').update(body).digest('hex')!==item.sha256)
        throw fault('ATTACHMENT_CHANGED','The original attachment bytes differ.',409);
      const handle=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      try{await handle.writeFile(body);await handle.sync();}finally{await handle.close();}
    }else await copyOriginal(item.file,temporary,{sha256:item.sha256,bytes:item.bytes});
    try{await link(temporary,path);}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      if(await realpath(path)!==path)throw fault('OUTPUT_EXISTS','The existing output is a link.',409);
      const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
      try{
        const before=await handle.stat({bigint:true});
        if(!before.isFile()||before.size!==BigInt(item.bytes))throw fault('OUTPUT_EXISTS','The existing output differs.',409);
        const hash=createHash('sha256');let size=0;
        for await(const part of handle.createReadStream({autoClose:false})){
          size+=part.length;
          if(size>item.bytes)throw fault('OUTPUT_EXISTS','The existing output grew during reading.',409);
          hash.update(part);
        }
        const after=await handle.stat({bigint:true});
        if(size!==item.bytes||before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs||
            hash.digest('hex')!==item.sha256)throw fault('OUTPUT_EXISTS','The existing output differs.',409);
      }finally{await handle.close();}
    }
    await syncDirectory(dirname(path));
    const {body:ignored,...descriptor}=item;
    return {...descriptor,file:path};
  }finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
async function serve(options,emit) {
  const {startCiimDeskServer}=await import('./server.mjs');
  const started=await startCiimDeskServer({directory:absolute(required(options,'workspace'),'workspace'),
    python:options.python??'python3',host:options.host??'127.0.0.1',
    port:options.port===undefined?0:integer(options.port,'port',{maximum:65535}),
    expectedWorkspaceId:options['expected-workspace-id'],expectedMarkerSha256:options['expected-marker-sha256']});
  let stopping=false,stop;
  try{
    emit(started.startup);
    await new Promise((yes,no)=>{
      stop=()=>{if(stopping)return;stopping=true;started.close().then(yes,no);};
      process.once('SIGINT',stop);process.once('SIGTERM',stop);
      if(started.closed)yes();
    });
  }finally{
    if(stop){process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
    await started.close();
  }
}
export async function main(args=process.argv.slice(2),{stdout=process.stdout,stderr=process.stderr}={}) {
  if(args[0]==='connected')return (await import('./connected-cli.mjs')).main(args.slice(1),{stdout,stderr});
  const emit=value=>stdout.write(JSON.stringify(value)+'\n');
  const parsed=parseArgs(args),{command,scope,options}=parsed;
  if(command==='help'){stdout.write(HELP);return;}
  if(command==='describe'){emit(describeCiimDesk());return;}
  if(command==='operations'){emit(describeDeskOperations());return;}
  if(command==='serve')return serve(options,emit);
  const directory=absolute(required(options,'workspace'),'workspace');
  const desk=await openCiimDesk({directory,create:command==='init',python:options.python??'python3'});
  try{
    let result;
    if(command==='init'||command==='status')result=desk.state();
    else if(command==='list'){
      const parameters={view:required(options,'view')};
      if(options.edition)parameters.editionId=one(options,'edition');
      if(options.comparison)parameters.comparisonId=one(options,'comparison');
      for(const key of ['offset','limit'])if(options[key]!==undefined)parameters[key]=integer(options[key],key);
      for(const key of ['status','query'])if(options[key]!==undefined)parameters[key]=options[key];
      result=await desk.view(parameters);
    }else if(command==='record')result=await desk.record({editionId:one(options,'edition'),recordId:one(options,'record')});
    else if(command==='import'){
      const file=absolute(required(options,'file'),'original ZIP');
      result=await desk.prepareImport({archiveFile:file,filename:options.filename??basename(file),
        ...(options.sha256===undefined?{}:{sha256:options.sha256}),...(options.bytes===undefined?{}:{bytes:integer(options.bytes,'bytes',{minimum:1,maximum:LIMITS.archiveBytes})})});
    }else if(command==='act'){
      const original=parseJson(await originalFile(absolute(required(options,'request'),'request')),'Original operation request');
      result=await executeDeskOperation(desk,{name:original.type,arguments:original});
    }else if(command==='export'){
      const kind=required(options,'kind');
      if(kind==='workspace'){
        if(options.handback)throw fault('CLI_EXPORT_SCOPE','A workspace export has no selected handback ID.');
        result=await desk.exportWorkspace();
      }else if(kind==='handback')result=await desk.exportHandback({handbackId:required(options,'handback')});
      else throw fault('CLI_EXPORT_KIND','Choose workspace or handback.');
      if(options.out)result=await outputFile(result,options.out);
    }else if(command==='attachment'){
      result=await desk.attachment({editionId:one(options,'edition'),kind:required(options,'kind'),...(options.id?{id:options.id}:{})});
      result=await outputFile(result,required(options,'out'),{body:result.body});
    }else{
      let type,data;
      if(command==='accept'){
        type='intake.import';data={candidateId:required(options,'candidate'),label:required(options,'label'),
          ...(options.edition?{editionIds:many(options,'edition')}:{})};
      }else if(command==='context'){
        type='context.save';data=parseJson(await originalFile(absolute(required(options,'file'),'context')),'Context data');
      }else if(command==='compare'){
        type='comparison.create';data={beforeEditionId:required(options,'before'),afterEditionId:required(options,'after'),label:required(options,'label')};
      }else if(command==='handback'){
        type='handback.create';data={editionIds:many(options,'edition'),comparisonIds:many(options,'comparison',false),
          label:required(options,'label'),authorityId:required(options,'authority'),note:await note(options)};
      }else if(command==='restore'){
        type='workspace.restore';data={candidateId:required(options,'candidate'),note:await note(options)};
      }else if(command==='review'){
        data=await reviewData(options);
        if(scope==='comparison'){type='comparison.review';data.comparisonId=one(options,'comparison');}
        else{
          data.editionId=one(options,'edition');
          if(scope==='edition')type='edition.review';
          if(scope==='profile'){type='profile.review';data.profileSha256=required(options,'profile');}
          if(scope==='records'){
            type='records.review';
            if(Boolean(options.record)===Object.hasOwn(options,'population'))throw fault('CLI_REVIEW_SCOPE','Choose --record or --population.');
            if(options.record)data.recordIds=many(options,'record');else data.populationDigest=required(options,'population');
          }
        }
      }
      if(!type)throw fault('CLI_COMMAND','Choose a declared typed operator command.');
      result=await desk.act(writeRequest(type,data,options));
    }
    emit(result);return result;
  }finally{await desk.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{process.stderr.write(JSON.stringify({error:{code:error.code??'CIIM_DESK_ERROR',
    message:error.message,status:error.status??500,details:error.details??{}}})+'\n');process.exitCode=1;});
}
