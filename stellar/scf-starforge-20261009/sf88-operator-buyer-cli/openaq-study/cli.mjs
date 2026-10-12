#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {prepareOpenAQBuyerHandoff,readOpenAQHandoff} from './handoff.mjs';
import {prepareOpenAQBuyer,inspectOpenAQBuyer,runOpenAQBuyer,recoverOpenAQBuyer,
 accountOpenAQBuyer,deliverOpenAQBuyer} from './customer.mjs';
import {exportOpenAQBuyerDelivery,inspectOpenAQBuyerDelivery,receiveOpenAQBuyerDelivery,
 reopenOpenAQBuyerDelivery} from './delivery.mjs';
import {need,json,path} from './files.mjs';

export const USAGE=String.raw`OpenAQ study → original Buyer → complete customer delivery

Create/read an exact handoff from a completed original project export and staged release:
  handoff --project ABS --stage UUID --export UUID --release-sha256 SHA --out ABS [--connection FILE]
  handoff-inspect --dir ABS --sha256 HANDOFF_FILE_SHA

Prepare the original Dataset acquisition without loading keys or buying:
  prepare --dir ABS --handoff ABS --handoff-sha256 SHA --workspace ORIGINAL_BUYER
    --intent ID --accept N --max-pages N --max-total-atomic DECIMAL
    [--query 'where_parameter=pm25&limit=50'] [--max-rows N --max-page-bytes N]
    [--resume-preparation]
  inspect --dir ABS
  run --dir ABS
  recover --dir ABS

Only the native reviewed attempt continuation may retry an unfulfilled page:
  run --dir ABS --retry-unpaid --expected-attempt-sha256 SHA
  run --dir ABS --retry-expired ORIGINAL_SELECTION.json --expected-attempt-sha256 SHA

View/finalize original SF36 accounting and produce the complete SF100 output:
  account --dir ABS [--finalize]
  deliver --dir ABS --out ABS

Export and receive all original source, output and native session members:
  export --dir ABS --out ABS --id ID [--python EXEC --max-bytes N]
  export-inspect --dir ABS [--sha256 MANIFEST_FILE_SHA]
  receive --source ABS --sha256 MANIFEST_FILE_SHA --dir ABS --id ID
    [--python EXEC --max-bytes N]
  reopen --dir ABS [--python EXEC]

All directories are canonical absolute private paths under an existing private
parent. prepare/run retain the selected original Buyer; receive/reopen are offline.
The full OPERATING.md explains caps, accounting, source review and host receiving.
`;
const textOption={type:'string'};
const booleanOption={type:'boolean',default:false};
const schemas={
 handoff:{project:textOption,stage:textOption,export:textOption,'release-sha256':textOption,out:textOption,connection:textOption},
 'handoff-inspect':{dir:textOption,sha256:textOption},
 prepare:{dir:textOption,handoff:textOption,'handoff-sha256':textOption,workspace:textOption,intent:textOption,
  accept:textOption,query:textOption,'max-pages':textOption,'max-total-atomic':textOption,
  'max-rows':textOption,'max-page-bytes':textOption,'resume-preparation':booleanOption},
 inspect:{dir:textOption},
 run:{dir:textOption,'retry-unpaid':booleanOption,'retry-expired':textOption,'expected-attempt-sha256':textOption},
 recover:{dir:textOption},
 account:{dir:textOption,finalize:booleanOption},
 deliver:{dir:textOption,out:textOption},
 export:{dir:textOption,out:textOption,id:textOption,python:textOption,'max-bytes':textOption},
 'export-inspect':{dir:textOption,sha256:textOption},
 receive:{source:textOption,sha256:textOption,dir:textOption,id:textOption,python:textOption,'max-bytes':textOption},
 reopen:{dir:textOption,python:textOption},
};
function integer(value,{optional=false}={}){
 if(optional&&value===undefined)return undefined;
 need(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)&&Number.isSafeInteger(Number(value)),
 'OPENAQ_BUYER_INTEGER_REQUIRED');return Number(value);
}
async function output(stream,value){
 await new Promise((accept,reject)=>{
  const fail=error=>{stream.off?.('error',fail);reject(error);};
  stream.once?.('error',fail);
  try{
   stream.write(value,error=>{
    // Node calls this callback before the associated error event. Retain the
    // listener on failure so the original completed owner can return normally.
    if(error){reject(error);return;}
    stream.off?.('error',fail);accept();
   });
  }catch(error){stream.off?.('error',fail);reject(error);}
 });
}
export async function main(argv=process.argv.slice(2),{environment=process.env,stdout=process.stdout,stderr=process.stderr}={}){
 const command=argv[0];
 if(!command||command==='help'||argv.includes('--help')){await output(stdout,USAGE+'\n');return 0;}
 need(Object.hasOwn(schemas,command),'OPENAQ_BUYER_COMMAND_REQUIRED');
 const {values:v}=parseArgs({args:argv.slice(1),strict:true,allowPositionals:false,options:schemas[command]});
 const controller=new AbortController();let interrupted=0;
 const interrupt=code=>{interrupted||=code;controller.abort();};
 const onInt=()=>interrupt(130),onTerm=()=>interrupt(143);
 process.on('SIGINT',onInt);process.on('SIGTERM',onTerm);
 try{
  const signal=controller.signal;let result;
  if(command==='handoff')result=await prepareOpenAQBuyerHandoff({
   projectDirectory:path(v.project),stageRequestId:v.stage,exportRequestId:v.export,
   expectedReleaseDigest:v['release-sha256'],directory:path(v.out),connectionFile:v.connection===undefined?undefined:path(v.connection),environment,signal});
  else if(command==='handoff-inspect'){
   const value=await readOpenAQHandoff({directory:path(v.dir),sha256:v.sha256});
   result={directory:value.directory,sha256:value.sha256,bytes:value.bytes,handoff:value.handoff};
  }else if(command==='prepare')result=await prepareOpenAQBuyer({
   directory:path(v.dir),handoffDirectory:path(v.handoff),handoffSha256:v['handoff-sha256'],
   operatorDirectory:path(v.workspace),intentId:v.intent,acceptIndex:integer(v.accept),query:v.query??'',
   maxPages:integer(v['max-pages']),maxTotalAtomic:v['max-total-atomic'],
   maxRows:integer(v['max-rows'],{optional:true}),maxPageBytes:integer(v['max-page-bytes'],{optional:true}),
   resumePreparation:v['resume-preparation'],signal});
  else if(command==='inspect')result=await inspectOpenAQBuyer({directory:path(v.dir)});
  else if(command==='recover')result=await recoverOpenAQBuyer({directory:path(v.dir)});
  else if(command==='run'){
   const expired=v['retry-expired']===undefined?undefined:await json(path(v['retry-expired']),262144);
   result=await runOpenAQBuyer({directory:path(v.dir),environment,signal,retryUnpaid:v['retry-unpaid'],
    retryExpired:expired,expectedAttemptSha256:v['expected-attempt-sha256']});
  }else if(command==='account')result=await accountOpenAQBuyer({directory:path(v.dir),finalize:v.finalize,signal});
  else if(command==='deliver')result=await deliverOpenAQBuyer({directory:path(v.dir),destination:path(v.out)});
  else if(command==='export')result=await exportOpenAQBuyerDelivery({directory:path(v.dir),destination:path(v.out),
   exportId:v.id,python:v.python,maxBytes:integer(v['max-bytes'],{optional:true}),environment,signal});
  else if(command==='export-inspect')result=await inspectOpenAQBuyerDelivery({directory:path(v.dir),manifestSha256:v.sha256,signal});
  else if(command==='receive')result=await receiveOpenAQBuyerDelivery({sourceDirectory:path(v.source),
   manifestSha256:v.sha256,directory:path(v.dir),receivingId:v.id,python:v.python,
   maxBytes:integer(v['max-bytes'],{optional:true}),environment,signal});
  else if(command==='reopen')result=await reopenOpenAQBuyerDelivery({directory:path(v.dir),python:v.python,environment,signal});
  await output(stdout,JSON.stringify(result,null,2)+'\n');
  return interrupted||0;
 }catch(error){
  const code=typeof error?.code==='string'?error.code:'OPENAQ_BUYER_COMMAND_FAILED';
  await output(stderr,JSON.stringify({error:code,
   ...(typeof error?.outcomeUnknown==='boolean'?{outcomeUnknown:error.outcomeUnknown}:{})})+'\n');
  return interrupted||1;
 }finally{
  // Every function settles its accepted native child/operation before returning;
  // no new listener/model exists in this CLI. Remove signals only after that drain.
  process.off('SIGINT',onInt);process.off('SIGTERM',onTerm);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await main();
