#!/usr/bin/env node
// MIT. Operate, carry and receive one original customer quotation programme.
import {parseArgs} from 'node:util';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ResearchWorkspaceClient} from '../workspace-client.mjs';
import {customerDirectory,retainCustomerBytes} from '../customer-updates/files.mjs';
import {QUOTE_FILE_LIMIT,need} from './contracts.mjs';
import {createResearchQuoteProgramme,readResearchQuoteProgramme,readResearchQuoteProgrammeStep,
 submitResearchQuoteProgramme,applyResearchQuoteProgrammeReview,replayResearchQuoteProgramme} from './programme.mjs';
import {createResearchQuoteHandover,inspectResearchQuoteHandover,copyResearchQuoteHandover} from './programme-files.mjs';
import {prepareResearchQuoteProgrammeReceiving,receiveResearchQuoteProgramme,readResearchQuoteProgrammeReceiving}
 from './programme-receiving.mjs';

export const RESEARCH_QUOTE_PROGRAMME_COMMANDS=Object.freeze([
 'quotes-programme-help','quotes-programme-create','quotes-programme-status','quotes-programme-step',
 'quotes-programme-submit','quotes-programme-apply','quotes-programme-replay','quotes-programme-export',
 'quotes-programme-inspect','quotes-programme-copy','quotes-programme-receive-prepare',
 'quotes-programme-receive','quotes-programme-receiving',
]);
export const RESEARCH_QUOTE_PROGRAMME_USAGE=String.raw`Research quotation programme

Original connection:
  --connection-file /private/research.connection.json [--directory /private/original-dossier-store]

Create and operate:
  quotes-programme-create --programme-directory DIR --input programme.json
  quotes-programme-status --programme-directory DIR
  quotes-programme-step --programme-directory DIR --step STEP
  quotes-programme-submit --programme-directory DIR --step STEP --command COMMAND --input native.json
      [--action ORIGINAL_CASE_OR_PRICING_ACTION --profile ORIGINAL_PRICING_PROFILE]
  quotes-programme-apply --programme-directory DIR --source-step REVIEW_STEP --step APPLY_STEP --review-sha256 SHA256
  quotes-programme-replay --programme-directory DIR --source-step ORIGINAL_STEP --step DISTINCT_REPLAY_STEP

COMMAND is an original native quotation write:
  create-case | native-case | pricing | prepare | apply | prepare-response
  prepare-publication | enroll-publication | prepare-report | prepare-case-transfer | apply-case-transfer

A stopped submit resumes with the same programme directory and STEP; omit --input and --command
to reopen its exact retained native request. --source-step replay creates a separate local attempt
with the original native request ID. It reaches the original native writer.

Carry the whole selected original source:
  quotes-programme-export --run-directory DIR --input handover.json
  quotes-programme-inspect --package-directory DIR [--manifest-sha256 SHA256]
  quotes-programme-copy --package-directory SOURCE --out-directory DESTINATION [--manifest-sha256 SHA256]

The handover input pins the original programme directory, saved case revision, complete selected
steps, frozen customer delivery/revision and optional original Europe PMC source-workspace export.
The complete output is RUN_DIRECTORY/package/, including native requests, all quote files, the
original case, dossier/history, four reports, work snapshot and exact paid-publication files.
Repeat export with the same run directory to finish missing files or reopen the completed package.

Receive into an existing native Research workspace:
  quotes-programme-receive-prepare --run-directory DIR --package-directory SOURCE --input receiving.json
  quotes-programme-receive --run-directory DIR --review-sha256 SHA256
  quotes-programme-receiving --run-directory DIR

Preparation first retains every source file, then returns the exact original native case review
and frozen customer selection. Receive consumes that SHA and delegates both writes to their
existing engines. Reuse the same directory and SHA after interruption or a lost reply.
Receiving inspection and all completed package/step inspections reopen before connection access.

All commands accept --out /private/result.json to retain the complete JSON response through the
original create-only publisher. The selected path must be a new file or contain the same bytes.
Signal handling drains this command's original client; it keeps the running application attached.
`;
const permissions={
 'quotes-programme-create':['programme-directory','input'],
 'quotes-programme-status':['programme-directory'],
 'quotes-programme-step':['programme-directory','step'],
 'quotes-programme-submit':['programme-directory','step','command','input','action','profile'],
 'quotes-programme-apply':['programme-directory','source-step','step','review-sha256'],
 'quotes-programme-replay':['programme-directory','source-step','step'],
 'quotes-programme-export':['run-directory','input'],
 'quotes-programme-inspect':['package-directory','manifest-sha256'],
 'quotes-programme-copy':['package-directory','out-directory','manifest-sha256'],
 'quotes-programme-receive-prepare':['run-directory','package-directory','input','manifest-sha256'],
 'quotes-programme-receive':['run-directory','review-sha256'],
 'quotes-programme-receiving':['run-directory'],
};
async function writeOutput(stream,body){
 return new Promise((accept,reject)=>{
  let settled=false;
  const failed=error=>done(error),done=error=>{
   if(settled)return;settled=true;
   // A failed Writable callback may still emit its matching error afterward.
   if(!error)stream.removeListener('error',failed);
   error?reject(error):accept();
  };
  stream.once('error',failed);
  try{stream.write(body,done);}catch(error){done(error);}
 });
}
function errorView(error,values,result){
 return {error:error?.code??'RESEARCH_QUOTE_PROGRAMME_FAILED',
  ...(typeof error?.outcomeUnknown==='boolean'?{outcomeUnknown:error.outcomeUnknown}:{}),
  ...(error?.researchQuoteRun?{operation:error.researchQuoteRun}:{}),
  ...(error?.researchQuoteProgrammeReceiving?{receiving:error.researchQuoteProgrammeReceiving}:{}),
  ...(error?.researchQuoteClose?{closeError:error.researchQuoteClose}:{}),
  ...(values['programme-directory']?{programmeDirectory:resolve(values['programme-directory'])}:{}),
  ...(values['run-directory']?{runDirectory:resolve(values['run-directory'])}:{}),
  ...(result?{retainedResult:result.schema,...(result.directory?{directory:result.directory}:{})}:{})};
}
async function retainOutput(path,value){
 const file=resolve(path),body=Buffer.from(JSON.stringify(value));
 need(body.length<=QUOTE_FILE_LIMIT,'RESEARCH_QUOTE_PROGRAMME_OUTPUT_LIMIT');
 return retainCustomerBytes(await customerDirectory(dirname(file)),basename(file),body);
}
export async function main(argv=process.argv.slice(2),{stdout=process.stdout,stderr=process.stderr}={}){
 const args=[...argv],command=args[0]??'quotes-programme-help';
 if(command==='quotes-programme-help'||args.includes('--help')){
  await writeOutput(stdout,RESEARCH_QUOTE_PROGRAMME_USAGE+'\n');return 0;
 }
 need(RESEARCH_QUOTE_PROGRAMME_COMMANDS.includes(command),'RESEARCH_QUOTE_PROGRAMME_COMMAND_REQUIRED');
 const allowed=['connection-file','directory','out',...(permissions[command]??[])],
  {values}=parseArgs({args:args.slice(1),options:Object.fromEntries(allowed.map(key=>[key,{type:'string'}])),
   strict:true,allowPositionals:false});
 const lifetime=new AbortController(),failedOwners=new Map();
 let clientOwner,working=true,settled=false,primary,result,closing,retention;
 const hasOwners=()=>clientOwner!==undefined||failedOwners.size>0;
 const release=()=>{
  if(retention){clearInterval(retention);retention=undefined;}
  if(settled){process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
 };
 const close=()=>{
  if(closing)return closing;
  return closing=(async()=>{
   const errors=[];
   for(const [owner,dispose]of [...failedOwners])try{await dispose();failedOwners.delete(owner);}catch(error){errors.push(error);}
   if(clientOwner)try{await clientOwner.close();clientOwner=undefined;}catch(error){errors.push(error);}
   if(errors.length){const [first,...rest]=errors;if(rest.length)first.researchQuoteCloseErrors=rest;throw first;}
   release();
  })().finally(()=>{closing=undefined;});
 };
 const report=async error=>{try{await writeOutput(stderr,JSON.stringify(errorView(error,values,result))+'\n');}catch{}};
 const stop=()=>{
  if(!lifetime.signal.aborted)lifetime.abort(Object.assign(new Error('RESEARCH_QUOTE_PROGRAMME_INTERRUPTED'),
   {code:'RESEARCH_QUOTE_PROGRAMME_INTERRUPTED'}));
  if(!working)void close().catch(error=>{
   retention??=setInterval(()=>{},1000);process.exitCode=1;void report(error);
  });
 };
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 const client=async()=>{
  lifetime.signal.throwIfAborted();
  if(!clientOwner){
   need(values['connection-file'],'RESEARCH_CONNECTION_REQUIRED');
   clientOwner=new ResearchWorkspaceClient({connectionFile:resolve(values['connection-file']),
    ...(values.directory?{directory:resolve(values.directory)}:{})},{
    fetch:(url,options)=>globalThis.fetch(url,{...options,signal:AbortSignal.any([
     lifetime.signal,...(options?.signal?[options.signal]:[])])}),
   });
  }
  return clientOwner;
 };
 const required=(name,code)=>{
  need(values[name],code??'RESEARCH_QUOTE_PROGRAMME_ARGUMENT_REQUIRED');return values[name];
 };
 try{
  const signal=lifetime.signal,programme=values['programme-directory']?resolve(values['programme-directory']):undefined,
   run=values['run-directory']?resolve(values['run-directory']):undefined,
   inputFile=values.input?resolve(values.input):undefined;
  if(['quotes-programme-create','quotes-programme-status','quotes-programme-step','quotes-programme-submit',
   'quotes-programme-apply','quotes-programme-replay'].includes(command))required('programme-directory');
  if(['quotes-programme-export','quotes-programme-receive-prepare','quotes-programme-receive',
   'quotes-programme-receiving'].includes(command))required('run-directory');
  if(command==='quotes-programme-create')
   result=await createResearchQuoteProgramme({client,directory:programme,inputFile,signal});
  else if(command==='quotes-programme-status')result=await readResearchQuoteProgramme(programme);
  else if(command==='quotes-programme-step')
   result=await readResearchQuoteProgrammeStep({directory:programme,stepId:required('step')});
  else if(command==='quotes-programme-submit')
   result=await submitResearchQuoteProgramme({client,directory:programme,stepId:required('step'),
    command:values.command,inputFile,action:values.action,profile:values.profile,signal});
  else if(command==='quotes-programme-apply')
   result=await applyResearchQuoteProgrammeReview({client,directory:programme,sourceStepId:required('source-step'),
    stepId:required('step'),reviewSha256:required('review-sha256'),signal});
  else if(command==='quotes-programme-replay')
   result=await replayResearchQuoteProgramme({client,directory:programme,sourceStepId:required('source-step'),stepId:required('step'),signal});
  else if(command==='quotes-programme-export')
   result=await createResearchQuoteHandover({client,directory:run,inputFile,signal});
  else if(command==='quotes-programme-inspect')
   result=await inspectResearchQuoteHandover(resolve(required('package-directory')),{manifestSha256:values['manifest-sha256']});
  else if(command==='quotes-programme-copy')
   result=await copyResearchQuoteHandover({sourceDirectory:values['package-directory']?resolve(values['package-directory']):undefined,
    directory:resolve(required('out-directory')),manifestSha256:values['manifest-sha256']});
  else if(command==='quotes-programme-receive-prepare')
   result=await prepareResearchQuoteProgrammeReceiving({client,directory:run,
    sourceDirectory:values['package-directory']?resolve(values['package-directory']):undefined,
    inputFile,manifestSha256:values['manifest-sha256'],signal});
  else if(command==='quotes-programme-receive')
   result=await receiveResearchQuoteProgramme({client,directory:run,reviewSha256:required('review-sha256'),signal});
  else if(command==='quotes-programme-receiving')result=await readResearchQuoteProgrammeReceiving(run);
  if(values.out)await retainOutput(values.out,result);
 }catch(error){primary=error;}
 working=false;
 if(typeof primary?.close==='function')failedOwners.set(primary,primary.close.bind(primary));
 try{await close();}
 catch(error){
  primary??=error;primary.researchQuoteClose=error.code??'RESEARCH_QUOTE_CLOSE_INCOMPLETE';
  retention??=setInterval(()=>{},1000);Object.defineProperty(primary,'close',{configurable:true,value:close});
 }
 if(!primary&&lifetime.signal.aborted)primary=lifetime.signal.reason;
 if(!primary)try{await writeOutput(stdout,JSON.stringify(result)+'\n');}catch(error){primary=error;}
 if(!primary&&lifetime.signal.aborted)primary=lifetime.signal.reason;
 if(primary)await report(primary);
 settled=true;
 if(!hasOwners())release();
 else{
  Object.defineProperty(primary,'close',{configurable:true,value:close});throw primary;
 }
 return primary?(lifetime.signal.aborted?130:1):0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().then(code=>{process.exitCode=code;}).catch(error=>{
  process.exitCode=1;void writeOutput(process.stderr,JSON.stringify({
   error:error.code??'RESEARCH_QUOTE_PROGRAMME_FAILED',...(error.researchQuoteClose?{closeError:error.researchQuoteClose}:{})
  })+'\n').catch(()=>{});
 });
