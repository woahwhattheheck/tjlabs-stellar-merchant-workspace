#!/usr/bin/env node
// MIT. Complete remote programme terminal over the original Research operation owner.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {ResearchProgrammeOperator,RESEARCH_PROGRAMME_OPERATOR_COMMANDS,
 readResearchProgrammeOperatorConfiguration} from './research-programme-operator.mjs';
import {need,QUOTE_CASE_TRANSFER_LIMIT,QUOTE_FILE_LIMIT}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-quotes/contracts.mjs';
import {readResearchHostFile,openResearchSource}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/workspace-files.mjs';
import {writePortableFile}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/portable.mjs';
import {exists}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/store.mjs';

export const RESEARCH_PROGRAMME_TERMINAL_USAGE=String.raw`Research programme remote operator

node research-programme-cli.mjs help
node research-programme-cli.mjs configuration --configuration /private/operator.json
node research-programme-cli.mjs COMMAND --configuration /private/operator.json --workspace ALIAS
  [--arguments /private/complete-command.json] [--arguments-sha256 SHA256]
  [--wait-ms MILLISECONDS] [--out /private/complete-response.json]
node research-programme-cli.mjs export --configuration /private/operator.json --workspace ALIAS
  --arguments /private/exact-file-selection.json --file /private/complete-original-file
  [--out /private/export-response.json]

COMMAND:
  info jobs job resume state step submit receiving bundle files file-info
  retain retained read release archive upload upload-source transfer transfer-status

All command arguments are one complete original JSON object. Hyphenated terminal
names map to the maintained underscore tool names. This terminal borrows the
configured Research hosts; it never starts or stops their native listeners/jobs.

Use submit with a declared programme-input source:
  {"id":"ORIGINAL-JOB-UUID","source":"reviewed-original-input"}
The source file itself contains the complete original CREATE, SUBMIT, APPLY,
REPLAY, EXPORT, IMPORT, ARCHIVE, RECEIVE_REVIEW or RECEIVE native job input.
The original source bytes are retained before dispatch and reopened on retry.

Other complete examples:
  job/resume:       {"id":"ORIGINAL-JOB-UUID"}
  state:            {"programmeId":"ORIGINAL-PROGRAMME-UUID","offset":0,"limit":20}
  step:             {"programmeId":"ORIGINAL-PROGRAMME-UUID","stepId":"ORIGINAL-STEP-UUID"}
  bundle/files:     {"id":"ORIGINAL-BUNDLE-JOB-UUID"}
  receiving:        {"id":"ORIGINAL-RECEIVE-REVIEW-JOB-UUID"}
  archive/upload:   {"id":"ORIGINAL-ARCHIVE-OR-UPLOAD-UUID"}
  file-info:        {"kind":"BUNDLE","id":"BUNDLE-UUID","name":"COMPLETE-RELATIVE-NAME"}
  retain/export:    {"kind":"BUNDLE","id":"BUNDLE-UUID","name":"COMPLETE-RELATIVE-NAME",
                     "bytes":123,"sha256":"EXACT-ORIGINAL-FILE-SHA256"}
  archive export:   {"kind":"ARCHIVE","id":"ARCHIVE-UUID","bytes":123,"sha256":"EXACT-ARCHIVE-SHA256"}
  upload-source:   {"operationId":"STABLE-UUID","uploadId":"STABLE-UUID","source":"original-archive",
                     "bytes":123,"sha256":"EXACT-ARCHIVE-SHA256"}
  transfer:        {"operationId":"STABLE-UUID","archiveId":"ORIGINAL-ARCHIVE-UUID",
                     "bytes":123,"sha256":"EXACT-ARCHIVE-SHA256","manifestSha256":"EXACT-MANIFEST-SHA256",
                     "destination":"receiving","destinationWorkspaceId":"research_EXACT64HEX",
                     "uploadId":"STABLE-DESTINATION-UPLOAD-UUID"}
  transfer-status: {"operationId":"ORIGINAL-TRANSFER-UUID"}
  read:            {"exportId":"EXACT-RETAINED-64HEX-ID","offset":0,"limit":65536}
  release:         {"readId":"ORIGINAL-READER-ID"}

Jobs are durable asynchronous native operations. Optional --wait-ms (1–900000)
follows this same job for submit/job/resume only, then returns its actual current
state; it never substitutes a new ID or automatically replays a failed action.
RETRY_REQUIRED needs the explicit resume command after reviewing its error.
A completed quoted review still requires an explicit APPLY/RECEIVE job input.

--out saves the whole response to an exclusive file; the same complete bytes can
be reopened. export copies the complete original member/archive to --file and
checks full length/SHA. A completed copy reopens before host or donor access.
Use file-info/files for the exact original names, byte counts and hashes.

Configuration schema: stellar-forge.research-programme-operator.v1
  {"schema":"stellar-forge.research-programme-operator.v1",
   "directory":"/private/research-programme-operations",
   "workspaces":[{"id":"source","connectionFile":"/private/source.connection.json",
                   "workspaceId":"research_EXACT64HEX"},
                 {"id":"receiving","connectionFile":"/private/receiving.connection.json",
                   "workspaceId":"research_EXACT64HEX"}],
   "sources":[{"id":"reviewed-original-input","kind":"programme-input",
               "file":"/private/original-job.json","sha256":"EXACT-FILE-SHA256"},
              {"id":"original-archive","kind":"programme-archive",
               "file":"/private/original.sf88q.gz","sha256":"EXACT-ARCHIVE-SHA256"}]}

Keep the configuration private (0600), all selections absolute and canonical,
and the original output directory apart from configuration, connections and
declared source files. Obtain workspace IDs from the original authenticated
Research host. Connection files use its unchanged original schema.

See RESEARCH_PROGRAMME_TERMINAL.md for the complete source-to-receiving journey,
saved operation recovery, large-file streaming and installed product paths.
`;
const MAX_INPUT=QUOTE_CASE_TRANSFER_LIMIT+65536,MAX_OUTPUT=Math.max(QUOTE_FILE_LIMIT,MAX_INPUT);
const commands=new Set([...RESEARCH_PROGRAMME_OPERATOR_COMMANDS.map(name=>name.replaceAll('_','-')),'export','configuration','help']);
function parse(argv){
 const args=[...argv],command=args.shift()??'help',options={};
 need(commands.has(command),'RESEARCH_PROGRAMME_COMMAND_INVALID');
 while(args.length){const key=args.shift();need(/^--[a-z-]+$/.test(key??'')&&args.length>0&&
  !args[0].startsWith('--')&&!Object.hasOwn(options,key.slice(2)),'RESEARCH_PROGRAMME_TERMINAL_ARGUMENT_INVALID');
  options[key.slice(2)]=args.shift();}
 need(Object.keys(options).every(key=>['configuration','workspace','arguments','arguments-sha256','wait-ms','out','file'].includes(key)),
  'RESEARCH_PROGRAMME_TERMINAL_ARGUMENT_INVALID');
 if(command==='help'){need(!Object.keys(options).length,'RESEARCH_PROGRAMME_TERMINAL_ARGUMENT_INVALID');return {command,options};}
 need(typeof options.configuration==='string'&&options.configuration.length>0,'RESEARCH_PROGRAMME_OPERATOR_CONFIGURATION_REQUIRED');
 if(command==='configuration')need(!options.workspace&&!options.arguments&&!options['arguments-sha256']&&!options['wait-ms']&&!options.file,
  'RESEARCH_PROGRAMME_TERMINAL_ARGUMENT_INVALID');
 else need(typeof options.workspace==='string'&&options.workspace.length>0,'RESEARCH_PROGRAMME_OPERATOR_WORKSPACE_NOT_DECLARED');
 need(!options['arguments-sha256']||options.arguments,'RESEARCH_PROGRAMME_TERMINAL_ARGUMENT_INVALID');
 need(command==='export'?!!options.file:options.file===undefined,'RESEARCH_PROGRAMME_TERMINAL_ARGUMENT_INVALID');
 if(options['wait-ms']!==undefined)need(['submit','job','resume'].includes(command)&&/^[1-9][0-9]*$/.test(options['wait-ms'])&&
  Number(options['wait-ms'])<=900000,'RESEARCH_PROGRAMME_TERMINAL_WAIT_INVALID');
 return {command,options};
}
function streamText(stream,text){
 return new Promise((resolve_,reject)=>{
  const cleanup=()=>{stream.removeListener('error',failed);stream.removeListener('close',closed);};
  const failed=error=>{cleanup();reject(error);};
  const closed=()=>{cleanup();reject(stream.errored??new Error('The output stream closed before its write completed.'));};
  stream.once('error',failed);stream.once('close',closed);
  try{stream.write(text,error=>{
   if(error){if(stream.closed)cleanup();reject(error);return;}
   cleanup();resolve_();
  });}catch(error){cleanup();reject(error);}
 });
}
async function outputFile(file,value,owners){
 const body=Buffer.from(JSON.stringify(value,null,2)+'\n'),path=resolve(file);
 need(body.length<=MAX_OUTPUT,'RESEARCH_PROGRAMME_RESULT_TOO_LARGE');
 const sha256=createHash('sha256').update(body).digest('hex');
 if(await exists(path)){
  const source=await openResearchSource(path,MAX_OUTPUT,{sha256});owners.add(source);let primary;
  try{need(source.bytes===body.length,'RESEARCH_PROGRAMME_RESULT_CHANGED');}catch(error){primary=error;}
  try{await source.close();owners.delete(source);}catch(error){primary??=error;}
  if(primary)throw primary;return {path,bytes:body.length,sha256,reused:true};
 }
 return writePortableFile(path,{body:[body],filename:'research-programme-result.json',contentType:'application/json'});
}
/** Complete process lifetime, including output and retryable original cleanup.
 * Injected streams/factory support embedding without taking a host listener.
 */
export async function main(argv=process.argv.slice(2),{stdout=process.stdout,stderr=process.stderr,
 operatorFactory=configuration=>new ResearchProgrammeOperator(configuration)}={}){
 const {command,options}=parse(argv);if(command==='help'){await streamText(stdout,RESEARCH_PROGRAMME_TERMINAL_USAGE);return 0;}
 let operator,stopRequested=false,active=null,closing=null,keepAlive=null,primary=null,result;
 const owners=new Set(),pendingClosers=new Set(),stop=new AbortController();
 const retain=()=>{if(!keepAlive)keepAlive=setInterval(()=>{},1000);};
 const clear=()=>{if(keepAlive){clearInterval(keepAlive);keepAlive=null;}};
 const cleanup=()=>{
  if(closing)return closing;
  closing=(async()=>{
   if(active)await active.catch(()=>{});
   const failures=[];
   for(const owner of [...owners,...pendingClosers]){
    try{await owner.close();owners.delete(owner);pendingClosers.delete(owner);}
    catch(error){failures.push(error);}
   }
   if(failures.length){retain();const error=failures[0];if(failures.length>1)error.closeErrors=failures.slice(1);throw error;}
   clear();
  })().catch(error=>{closing=null;throw error;});return closing;
 };
 const report=error=>streamText(stderr,(error?.code??error?.message??String(error))+'\n').catch(()=>{});
 const onSignal=()=>{
  stopRequested=true;stop.abort();retain();
  // Wait for the admitted command/output before closing its original clients.
  cleanup().catch(async error=>{process.exitCode=1;await report(error);});
 };
 process.on('SIGINT',onSignal);process.on('SIGTERM',onSignal);
 try{
  active=(async()=>{
   const selected=await readResearchProgrammeOperatorConfiguration(resolve(options.configuration));
   const guardOutput=path=>{
    const target=resolve(path),root=selected.configuration.directory;
    need(target!==root&&!target.startsWith(root+'/')&&target!==selected.file&&
     !selected.configuration.workspaces.some(item=>item.connectionFile===target)&&
     !selected.configuration.sources.some(item=>item.file===target)&&
     (!options.arguments||target!==resolve(options.arguments)),
     'RESEARCH_PROGRAMME_OPERATOR_EXPORT_DIRECTORY_INVALID');
   };
   if(options.out)guardOutput(options.out);
   if(options.file)guardOutput(options.file);
   need(!options.out||!options.file||resolve(options.out)!==resolve(options.file),
    'RESEARCH_PROGRAMME_OPERATOR_DISTINCT_OUTPUT_REQUIRED');
   let input={};
   if(options.arguments){
    const body=await readResearchHostFile(resolve(options.arguments),MAX_INPUT,
     {sha256:options['arguments-sha256']});
    input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));
    need(input&&typeof input==='object'&&!Array.isArray(input),'RESEARCH_PROGRAMME_COMMAND_INPUT_INVALID');
   }
   need(!stopRequested,'RESEARCH_PROGRAMME_TERMINAL_STOPPED');
   if(command==='configuration')result={schema:selected.configuration.schema,file:selected.file,
    bytes:selected.bytes,sha256:selected.sha256,configuration:selected.configuration};
   else{
    operator=operatorFactory(selected.configuration);
    if(operator&&typeof operator.close==='function')owners.add(operator);
    need(operator&&typeof operator.call==='function'&&typeof operator.close==='function',
     'RESEARCH_PROGRAMME_OPERATOR_CLIENT_REQUIRED');
    result=command==='export'?await operator.exportFile(options.workspace,input,{file:resolve(options.file)}):
     await operator.call(options.workspace,command.replaceAll('-','_'),input);
    const deadline=Date.now()+Number(options['wait-ms']??0);
    while(options['wait-ms']&&!stopRequested&&['READY','RUNNING'].includes(result.status)&&Date.now()<deadline){
     await delay(Math.min(1000,deadline-Date.now()),undefined,{signal:stop.signal}).catch(error=>{
      if(!stopRequested)throw error;
     });
     if(!stopRequested&&Date.now()<deadline)result=await operator.call(options.workspace,'job',{id:result.id});
    }
   }
   if(options.out){
    const copied=await outputFile(options.out,result,owners);
    return {state:'SAVED',command,file:copied,nativeJob:result?.id??null,nativeStatus:result?.status??null};
   }
   return result;
  })();
  result=await active;
 }catch(error){primary=error;if(typeof error?.close==='function')pendingClosers.add(error);}
 active=null;
 try{await cleanup();}catch(error){primary??=error;}
 // Flush output after the owned command/clients have drained. Keep the signal
 // handlers and any failed original closer alive until this output settles.
 try{if(primary)await report(primary);else await streamText(stdout,JSON.stringify(result,null,2)+'\n');}
 catch(error){primary??=error;await report(error);}
 finally{
  if(!owners.size&&!pendingClosers.size){
   clear();process.off('SIGINT',onSignal);process.off('SIGTERM',onSignal);
  }
 }
 return primary?1:stopRequested?130:0;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().then(code=>{process.exitCode=code;},async error=>{
  process.exitCode=1;await streamText(process.stderr,(error?.code??error?.message??String(error))+'\n').catch(()=>{});
 });
}
