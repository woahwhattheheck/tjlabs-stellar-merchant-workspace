#!/usr/bin/env node
// MIT. Bridge source reviews through the original Bloccpay workspace.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {constants} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {openBloccpayWorkspace} from './lib/workspace.mjs';
import {createBridgeIntake} from './lib/bridge-intake.mjs';
import {need,writeExact,jsonBytes,publicError,hash} from './lib/files.mjs';
import {parseSourceJSON} from './lib/source-json.mjs';

const HELP=[
 'Bridge intake — existing company sources, immutable review, incident decisions and receiving',
 'node bridge-cli.mjs summary --directory /private/workspace [--configuration /private/config.json]',
 'node bridge-cli.mjs preview --directory /private/workspace --input /private/review-selection.json --output /private/preview.json',
 'node bridge-cli.mjs decision-preview --directory /private/workspace --input /private/decision.json --output /private/decision-preview.json',
 'node bridge-cli.mjs save --directory /private/workspace --input /private/exact-save-request.json',
 'node bridge-cli.mjs read --directory /private/workspace --request-id ORIGINAL --output /private/original-review.json',
 'node bridge-cli.mjs inspect --directory /private/received/workspace [--input /private/selected-request-ids.json] --output /private/bridge-receiving.json',
 'node bridge-cli.mjs original --directory /private/workspace --table sources --id ORIGINAL --output /private/original-body.bin',
 '',
 'All commands use the original company SQLite and private object files. No provider request is issued.',
 'Inputs are complete strict JSON. Preview timestamps, actor, note and native revision are explicit.',
 'Save input: {requestId,expectedRevision,document,expectedPreviewSha256}. Keep that exact file and ID.',
 'Output paths are create-only and may reopen only with identical bytes. No output file is overwritten.',
 'Use the original cli.mjs capture/import, export, package-inspect and package-receive commands.',
].join('\n')+'\n';
function parse(argv) {
 const [command='help',...rest]=argv,flags={};
 need(rest.length%2===0,'ARGUMENT_REQUIRED');
 for(let i=0;i<rest.length;i+=2){need(rest[i].startsWith('--')&&!Object.hasOwn(flags,rest[i].slice(2)),'DUPLICATE_ARGUMENT');flags[rest[i].slice(2)]=rest[i+1];}
 const allowed=['directory','configuration','input','output','request-id','table','id','runtime','runtime-sha256','source-directory'];
 need(Object.keys(flags).every(k=>allowed.includes(k)),'UNKNOWN_ARGUMENT');return {command,flags};
}
async function readInput(filename) {
 need(filename&&path.isAbsolute(filename),'ABSOLUTE_INPUT_REQUIRED');
 const handle=await fs.open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
 try {const stat=await handle.stat();need(stat.isFile()&&stat.size<=40*1024*1024,'INPUT_FILE_REQUIRED');
  return parseSourceJSON(await handle.readFile(),{maxBytes:40*1024*1024}).value;
 }finally{await handle.close();}
}
function output(stream,bytes) {return new Promise((resolve,reject)=>{stream.write(bytes,error=>error?reject(error):resolve());});}
export async function runBridgeCLI(argv=process.argv.slice(2),{signal}={}) {
 const {command,flags}=parse(argv);
 if(command==='help'){await output(process.stdout,HELP);return null;}
 need(['summary','preview','decision-preview','save','read','inspect','original'].includes(command),'UNKNOWN_COMMAND');
 need(flags.directory&&path.isAbsolute(flags.directory),'ABSOLUTE_DIRECTORY_REQUIRED');
 const aborter=new AbortController();let first=null,workspace=null,intake=null,result,body;
 const stop=reason=>{first??=reason instanceof Error?reason:Object.assign(new Error(String(reason)),{code:'ABORTED'});aborter.abort(first);};
 const interrupted=()=>stop(signal.reason??'caller-interrupted'),term=()=>stop('SIGTERM'),interrupt=()=>stop('SIGINT'),streamError=error=>stop(error);
 signal?.addEventListener('abort',interrupted,{once:true});
 process.on('SIGTERM',term);process.on('SIGINT',interrupt);
 process.stdout.on('error',streamError);process.stderr.on('error',streamError);
 try {
  signal?.throwIfAborted();const configuration=flags.configuration?await readInput(flags.configuration):{};
  aborter.signal.throwIfAborted();
  workspace=await openBloccpayWorkspace({directory:flags.directory,connections:configuration.connections??{},name:configuration.name,
   sourceDirectory:flags['source-directory']??configuration.sourceDirectory,
   runtimeDirectory:flags.runtime??configuration.runtimeDirectory,
   expectedManifestSha256:flags['runtime-sha256']??configuration.expectedManifestSha256});
  intake=createBridgeIntake({workspace});aborter.signal.throwIfAborted();
  if(command==='summary')result=await intake.summary();
  else if(command==='preview')result=await intake.previewReview(await readInput(flags.input));
  else if(command==='decision-preview')result=await intake.previewDecision(await readInput(flags.input));
  else if(command==='save')result=await intake.save({...await readInput(flags.input),signal:aborter.signal});
  else if(command==='read')result=await intake.read(flags['request-id']);
  else if(command==='inspect')result=await intake.inspect(flags.input?await readInput(flags.input):{});
  else {need(flags.output,'ORIGINAL_OUTPUT_REQUIRED');const original=await intake.originalBody({table:flags.table,id:flags.id});body=original.body;
    result={schema:'bloccpay.bridge-original-download.v1',file:original.descriptor};}
  aborter.signal.throwIfAborted();
  if(flags.output) {
   need(path.isAbsolute(flags.output),'ABSOLUTE_OUTPUT_REQUIRED');
   const bytes=body??jsonBytes(result),descriptor=await writeExact(flags.output,bytes);
   result={schema:'bloccpay.bridge-cli-output.v1',command,output:{path:flags.output,bytes:descriptor.bytes,sha256:descriptor.sha256}};
  }
 }catch(error){first??=error;}
 finally {
  // Retain actual acquired owners until closure. No replacement connection, exit,
  // lock release or database reopen is used to disguise a failed drain.
  while(intake||workspace) {
   try {if(intake){await intake.close();intake=null;}if(workspace){await workspace.close();workspace=null;}}
   catch(error){first??=error;await new Promise(resolve=>setTimeout(resolve,100));}
  }
 }
 try {
  if(first)throw first;
  await output(process.stdout,jsonBytes(result));
  await new Promise(resolve=>setImmediate(resolve));if(first)throw first;
  return result;
 }finally{
  signal?.removeEventListener('abort',interrupted);process.off('SIGTERM',term);process.off('SIGINT',interrupt);
  process.stdout.off('error',streamError);process.stderr.off('error',streamError);
 }
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 runBridgeCLI().catch(async error=>{
  process.exitCode=1;const failed=()=>{};process.stderr.on('error',failed);
  try{await output(process.stderr,jsonBytes({error:publicError(error)}));await new Promise(resolve=>setImmediate(resolve));}
  catch{}finally{process.stderr.off('error',failed);}
 });
}
