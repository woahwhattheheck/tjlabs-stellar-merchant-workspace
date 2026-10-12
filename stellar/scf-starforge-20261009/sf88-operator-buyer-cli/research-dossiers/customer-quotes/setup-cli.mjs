#!/usr/bin/env node
// MIT. Local commissioning commands retain the same source and original native request.
import {parseArgs} from 'node:util';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareResearchQuotationSetup,readResearchQuotationSetup,saveResearchQuotationSetup,
 exportResearchQuotationSetup} from './setup.mjs';
import {customerDirectory,retainCustomerBytes} from '../customer-updates/files.mjs';
import {need} from './contracts.mjs';

export const RESEARCH_QUOTATION_SETUP_COMMANDS=Object.freeze([
 'quotes-setup-help','quotes-setup-prepare','quotes-setup-save','quotes-setup-status','quotes-setup-export',
]);
export const RESEARCH_QUOTATION_SETUP_USAGE="Research quotation commissioning\n\nUse the original installed Research runtime and selected customer/pricing paths.\nPreparation writes one complete retained setup; native case/pricing state opens\nonly through the existing Research application.\n\n  research-quotes-setup prepare --input /private/commissioning-input.json\n      --run-directory /private/research-commissioning [--out /private/review.json]\n  research-quotes-setup prepare --run-directory /private/research-commissioning\n  research-quotes-setup save --run-directory /private/research-commissioning\n      --review-sha256 ORIGINAL_REVIEW_SHA256 [--out /private/saved.json]\n  research-quotes-setup status --run-directory /private/research-commissioning\n  research-quotes-setup export --run-directory /private/research-commissioning\n      --out-directory /private/complete-commissioning-copy\n\nThe same commands are available as research-client quotes-setup-prepare,\nquotes-setup-save, quotes-setup-status and quotes-setup-export. They are local\nretained setup operations and need no running Research connection.\n\nComplete input JSON:\n{\n  \"schema\": \"sf88-research-quotation-commissioning/v1\",\n  \"requestId\": \"ORIGINAL_UUID\",\n  \"workspaceDirectory\": \"/srv/starforge/research\",\n  \"runtimeDirectory\": \"/srv/starforge/runtime\",\n  \"label\": \"Research customer delivery\",\n  \"configurationFile\": \"/srv/starforge/private/original-research-quotes.json\",\n  \"settings\": {\n    \"customerCommerceHost\": \"/srv/starforge/private/research-commerce.json\",\n    \"connectionFile\": \"/srv/starforge/private/research-connection.json\",\n    \"port\": 0\n  },\n  \"application\": {\"runtimeId\": \"ORIGINAL_24_HEX_RUNTIME_ID\"}\n}\n\nSelect configurationFile OR a complete configuration object using the original\nsf88-research-customer-quotes-host/v1 schema. A file retains its complete original\nbytes; relative paths resolve beside that original host file. Inline configuration\npaths resolve beside --input, or beside input.json when using the library API.\nThe generated research-quotes.json contains complete absolute native paths.\nAll pricing profiles and releaseRuntime objects are preserved.\n\nsettings accepts every maintained Research Applications setting: original Object,\nDocument, Pipeline, OpenAlex, Crossref, Zotero, extraction executable, paid host,\nconnection, port and private environment file. The setup keeps those values and\nselects its own generated quotation host. workspaceDirectory must agree.\napplication is optional; when supplied it retains runtimeId and optional\napplicationId + expectedRevision and homeId from the original Applications desk.\n\nPreparation creates:\n  research-quotes.json       Complete original native quotation configuration\n  application-settings.json  Complete settings for the existing Applications UI\n  application-review.json    Original Applications review request, when selected\n  direct-launch.json         Ordinary Research command and exact launch binding\n  source-host.json           Complete original selected host bytes\n  configuration-source.json  Source/path interpretation and full normalized host\n  input.json, request.json   Exact original commissioning input and identity\n  review.md, review.json     Human-readable complete review and saved source pins\n\nSave rechecks the original installed runtime, exact selected module bodies and\ncomplete pricing source hashes, then retains result.json. Ordinary native case\nchanges remain compatible with the same setup. A changed pricing source requires\na fresh review in a new retained setup directory. Completed save/status/export\nreopens before any donor/runtime access. A lost reply resumes these same files.\n\nApplications continuation:\n  starforge runtime-workspace application-review --workspace /private/apps\n      --request /private/research-commissioning/application-review.json\n  Use its returned original review ID with application-save.\n  Use application-start-review and application-start on that saved application.\n  Open the original Applications private URL or connection file.\n  Stop/reopen through the same application's managed controls.\n\nDirect continuation:\n  direct-launch.json contains command \"research-workspace\", complete args and the\n  original environmentFile selection. Its args include the reviewed quotation\n  binding. Apply that private environment through your existing native launcher,\n  or use Applications which already owns it. Keep one original listener.\n\nExport keeps every complete original setup file plus commissioning.json. It never\nchanges the saved source selections. For a receiving host, use the original case,\npricing and Research receiving operations, then prepare a new setup with those\nactual received paths and installed runtime. The complete old setup remains\navailable as its original reviewed history.";

const ALLOWED={
 'quotes-setup-prepare':['run-directory','input','out'],
 'quotes-setup-save':['run-directory','review-sha256','out'],
 'quotes-setup-status':['run-directory','out'],
 'quotes-setup-export':['run-directory','out-directory','out'],
};
async function writeOutput(stream,body){
 return new Promise((accept,reject)=>{
  let settled=false;
  const failed=error=>finish(error);
  function finish(error){
   if(settled)return;settled=true;
   // An asynchronous failed callback can precede its original error event.
   if(!error)stream.removeListener('error',failed);
   error?reject(error):accept();
  }
  stream.once('error',failed);
  try{stream.write(body,finish);}catch(error){finish(error);}
 });
}
function code(error){
 return /^[A-Z][A-Z0-9_]{1,159}$/.test(error?.code??'')?error.code:'RESEARCH_QUOTATION_SETUP_FAILED';
}
export async function main(argv=process.argv.slice(2),{stdout=process.stdout,stderr=process.stderr}={}){
 const args=[...argv],first=args[0]??'help',
  command=first.startsWith('quotes-setup-')?first:'quotes-setup-'+first;
 if(command==='quotes-setup-help'||args.includes('--help')){
  await writeOutput(stdout,RESEARCH_QUOTATION_SETUP_USAGE+'\n');return 0;
 }
 need(RESEARCH_QUOTATION_SETUP_COMMANDS.includes(command),'RESEARCH_QUOTATION_SETUP_COMMAND_REQUIRED');
 const {values}=parseArgs({args:args.slice(1),options:Object.fromEntries(ALLOWED[command].map(key=>[key,{type:'string'}])),
  allowPositionals:false,strict:true});
 need(values['run-directory'],'RESEARCH_QUOTATION_SETUP_DIRECTORY_REQUIRED');
 const directory=resolve(values['run-directory']),controller=new AbortController(),owners=new Map();
 let result,primary,working=true,settled=false,closing,retention;
 const release=()=>{
  if(owners.size)return;
  if(retention){clearInterval(retention);retention=undefined;}
  if(settled){process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
 };
 const report=async error=>{
  try{await writeOutput(stderr,JSON.stringify({error:code(error),directory,
   ...(result?{retainedStatus:result.status??'EXPORTED',retainedDirectory:result.directory}:{}),
   ...(owners.size?{cleanup:'RETRY_ORIGINAL_OWNER'}:{})})+'\n');}catch{}
 };
 const close=()=>{
  if(closing)return closing;
  return closing=(async()=>{
   const errors=[];
   for(const [owner,fn]of [...owners])try{await fn();owners.delete(owner);}catch(error){errors.push(error);}
   release();if(errors.length)throw errors[0];
  })().finally(()=>{closing=undefined;});
 };
 const stop=()=>{
  if(!controller.signal.aborted)controller.abort(Object.assign(new Error('RESEARCH_QUOTATION_SETUP_INTERRUPTED'),
   {code:'RESEARCH_QUOTATION_SETUP_INTERRUPTED'}));
  if(!working)void close().catch(error=>{retention??=setInterval(()=>{},1000);process.exitCode=1;void report(error);});
 };
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 try{
  const signal=controller.signal;
  if(command==='quotes-setup-prepare')
   result=await prepareResearchQuotationSetup({directory,...(values.input?{inputFile:resolve(values.input)}:{}),signal});
  else if(command==='quotes-setup-save'){
   need(values['review-sha256'],'RESEARCH_QUOTATION_SETUP_REVIEW_REQUIRED');
   result=await saveResearchQuotationSetup({directory,reviewSha256:values['review-sha256'],signal});
  }else if(command==='quotes-setup-status')result=await readResearchQuotationSetup(directory);
  else{
   need(values['out-directory'],'RESEARCH_QUOTATION_SETUP_EXPORT_REQUIRED');
   result=await exportResearchQuotationSetup({directory,outputDirectory:resolve(values['out-directory']),signal});
  }
  controller.signal.throwIfAborted();
  if(values.out){
   const path=resolve(values.out);
   need(dirname(path)!==directory&&dirname(path)!==result.directory,
    'RESEARCH_QUOTATION_SETUP_DISTINCT_OUTPUT_REQUIRED');
   await retainCustomerBytes(await customerDirectory(dirname(path)),basename(path),Buffer.from(JSON.stringify(result)+'\n'));
  }
 }catch(error){primary=error;}
 working=false;
 if(typeof primary?.close==='function')owners.set(primary,primary.close.bind(primary));
 try{await close();}catch(error){primary??=error;retention??=setInterval(()=>{},1000);}
 if(!primary&&controller.signal.aborted)primary=controller.signal.reason;
 if(!primary)try{await writeOutput(stdout,JSON.stringify(result)+'\n');}catch(error){primary=error;}
 if(!primary&&controller.signal.aborted)primary=controller.signal.reason;
 if(primary)await report(primary);
 settled=true;
 if(owners.size){
  retention??=setInterval(()=>{},1000);
  Object.defineProperty(primary,'close',{configurable:true,value:close});
  throw primary;
 }
 release();return primary?(controller.signal.aborted?130:1):0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().then(result=>{process.exitCode=result;}).catch(error=>{
  process.exitCode=1;void writeOutput(process.stderr,JSON.stringify({error:code(error)})+'\n').catch(()=>{});
 });
