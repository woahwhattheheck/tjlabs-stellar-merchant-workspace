// MIT. Retained quotation commissioning uses the original configuration, runtime and publishers.
import {readdir} from 'node:fs/promises';
import {join,dirname,resolve,isAbsolute,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readResearchHostFile} from '../workspace-files.mjs';
import {customerDirectory,withCustomerOperation,readCustomerJson,retainCustomerBytes,retainCustomerJson}
 from '../customer-updates/files.mjs';
import {exists,digest,parseJson,jsonBytes} from '../../node/store.mjs';
import {inspectMerchantRuntime} from '../../../sf46-release/runtime-package.mjs';
import {QUOTE_HOST_SCHEMA,fields,id,hash,text,need,copy,same,fingerprint} from './contracts.mjs';
import {normalizeResearchQuoteConfiguration} from './configuration.mjs';

export const RESEARCH_QUOTATION_SETUP_SCHEMA='sf88-research-quotation-commissioning/v1';
const REQUEST='sf88-research-quotation-commissioning-request/v1',
 REVIEW='sf88-research-quotation-commissioning-review/v1',
 RESULT='sf88-research-quotation-commissioning-result/v1',
 SOURCE='sf88-research-quotation-configuration-source/v1',
 EXPORT='sf88-research-quotation-commissioning-export/v1';
const LIMIT=4*1024*1024,HOST_LIMIT=1024*1024;
const ROOT='stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers';
const MODULES=['customer-quotes/launch-inspection.mjs','customer-quotes/configuration.mjs',
 'customer-quotes/contracts.mjs','customer-quotes/workspace.mjs','server.mjs','workspace-client.mjs'];
const APP_ID=/^[a-f0-9]{24}$/;
const SETTINGS=Object.freeze({
 workspaceDirectory:'--dir',connectionFile:'--connection-file',objectStateDirectory:'--object-state',
 zoteroStateDirectory:'--zotero-state',extractionPython:'--extraction-python',
 customerCommerceHost:'--customer-commerce-host',customerQuotesHost:'--customer-quotes-host',
 openalexWorkspaceDirectory:'--openalex-workspace',openalexModule:'--openalex-module',
 editionAdapter:'--edition-adapter',crossrefState:'--crossref-state',crossrefConfig:'--crossref-config',
 documentSourceConfig:'--document-source',pipelineSourceConfig:'--pipeline-source',port:'--port',
});
const timestamp=()=>new Date().toISOString();
function absolute(value){
 need(typeof value==='string'&&isAbsolute(value)&&value===resolve(value)&&value!=='/'&&
  value.length<=4096&&!/[\0\r\n]/.test(value),'RESEARCH_QUOTATION_SETUP_ABSOLUTE_PATH');
 return value;
}
function checkpoint(signal){signal?.throwIfAborted();}
function signalInput(signal){
 need(signal===undefined||signal!==null&&typeof signal.throwIfAborted==='function'&&
  typeof signal.aborted==='boolean','RESEARCH_QUOTATION_SETUP_SIGNAL_INVALID');return signal;
}
function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function inputValue(value){
 const selected=parseJson(jsonBytes(value));
 fields(selected,['schema','requestId','workspaceDirectory','runtimeDirectory','label',
  'configurationFile','configuration','settings','application'],
  ['schema','requestId','workspaceDirectory','runtimeDirectory','label']);
 need(selected.schema===RESEARCH_QUOTATION_SETUP_SCHEMA,'RESEARCH_QUOTATION_SETUP_SCHEMA_REQUIRED');
 id(selected.requestId);absolute(selected.workspaceDirectory);absolute(selected.runtimeDirectory);text(selected.label,120);
 need(Object.hasOwn(selected,'configurationFile')!==Object.hasOwn(selected,'configuration'),
  'RESEARCH_QUOTATION_SETUP_CONFIGURATION_REQUIRED');
 if(selected.configurationFile!==undefined)absolute(selected.configurationFile);
 else fields(selected.configuration,['schema','casesDirectory','pricing'],['schema']);
 const settings=selected.settings??{};
 fields(settings,[...Object.keys(SETTINGS),'environmentFile'],[]);
 for(const [key,value]of Object.entries(settings)){
  if(key==='port')need(Number.isInteger(value)&&value>=0&&value<=65535,'WORKSPACE_PORT_INVALID');
  else absolute(value);
 }
 need(settings.workspaceDirectory===undefined||settings.workspaceDirectory===selected.workspaceDirectory,
  'RESEARCH_QUOTATION_SETUP_WORKSPACE_CHANGED');
 need(!settings.openalexModule||settings.openalexWorkspaceDirectory,'APPLICATION_OPENALEX_WORKSPACE_REQUIRED');
 need(!settings.crossrefConfig||settings.crossrefState,'APPLICATION_CROSSREF_STATE_REQUIRED');
 for(const key of ['objectStateDirectory','zoteroStateDirectory'])
  need(settings[key]===undefined||settings[key]!==selected.workspaceDirectory,'APPLICATION_DISTINCT_RESEARCH_DIRECTORY_REQUIRED');
 if(selected.application!==undefined){
  fields(selected.application,['runtimeId','applicationId','expectedRevision','homeId'],['runtimeId']);
  need(APP_ID.test(selected.application.runtimeId),'APPLICATION_ID_INVALID');
  if(selected.application.applicationId!==undefined){
   need(APP_ID.test(selected.application.applicationId),'APPLICATION_ID_INVALID');hash(selected.application.expectedRevision);
  }else need(selected.application.expectedRevision===undefined,'APPLICATION_REVISION_WITHOUT_ID');
  if(selected.application.homeId!==undefined)need(APP_ID.test(selected.application.homeId),'APPLICATION_ID_INVALID');
 }
 return selected;
}
function capture(options){
 fields(options,['directory','input','inputFile','signal'],['directory']);
 const selected={directory:absolute(options.directory),signal:signalInput(options.signal)};
 need(options.input===undefined||options.inputFile===undefined,'RESEARCH_QUOTATION_SETUP_SINGLE_INPUT');
 if(options.input!==undefined){
  selected.input=inputValue(options.input);selected.body=jsonBytes(options.input);
  need(selected.body.length<=LIMIT,'RESEARCH_QUOTATION_SETUP_INPUT_LIMIT');
 }
 if(options.inputFile!==undefined)selected.inputFile=absolute(options.inputFile);
 return selected;
}
async function retained(root,name,limit=LIMIT){
 const path=join(root,name);if(!await exists(path))return null;
 const saved=await readCustomerJson(path,limit);
 await retainCustomerBytes(root,name,saved.body);
 return saved;
}
async function retainedBody(root,name,limit=LIMIT){
 const path=join(root,name);if(!await exists(path))return null;
 const body=await readResearchHostFile(path,limit);
 await retainCustomerBytes(root,name,body);return body;
}
async function publish(root,name,value){
 const body=value instanceof Uint8Array?value:jsonBytes(value);
 need(body.length<=LIMIT,'RESEARCH_QUOTATION_SETUP_RECORD_LIMIT');
 return retainCustomerBytes(root,name,body);
}
function fileView(row){return {name:row.name,bytes:row.bytes,sha256:row.sha256};}
function requestRecord(value,root){
 need(value?.schema===REQUEST&&value.requestSha256===fingerprint(value.request)&&
  same(value.request,inputValue(value.request))&&value.id===value.request.requestId&&
  value.input?.name==='input.json'&&Number.isSafeInteger(value.input.bytes)&&value.input.bytes>0&&value.input.bytes<=LIMIT,
  'RESEARCH_QUOTATION_SETUP_REQUEST_CHANGED');
 hash(value.input.sha256);absolute(value.directory);
 need(value.directory===root,'RESEARCH_QUOTATION_SETUP_DIRECTORY_CHANGED');
 return value;
}
async function requestAt(root){
 const row=await retained(root,'request.json');if(!row)return null;
 const record=requestRecord(row.value,root),body=await retainedBody(root,'input.json');
 need(body&&body.length===record.input.bytes&&digest(body)===record.input.sha256&&
  same(inputValue(parseJson(body)),record.request),'RESEARCH_QUOTATION_SETUP_INPUT_CHANGED');
 return record;
}
async function currentInput(selected,old){
 let body=selected.body;
 if(selected.inputFile){
  try{body=await readResearchHostFile(selected.inputFile,LIMIT,{privateFile:true});}
  catch(error){if(error.code!=='ENOENT'||!old)throw error;}
 }
 if(body){
  const input=inputValue(parseJson(body));
  if(old)need(digest(body)===old.input.sha256&&same(input,old.request),
   'RESEARCH_QUOTATION_SETUP_INPUT_CHANGED',409);
  return {input,body,sourcePath:selected.inputFile??null};
 }
 need(old,'RESEARCH_QUOTATION_SETUP_INPUT_REQUIRED');
 return {input:copy(old.request),body:null,sourcePath:old.input.sourcePath};
}
async function firstRequest(root,selected,original){
 const input=original.input;
 need(root!==input.workspaceDirectory&&root!==input.runtimeDirectory,
  'RESEARCH_QUOTATION_SETUP_DISTINCT_DIRECTORY_REQUIRED');
 const allowed=new Set(['customer-update.lock','input.json']);
 for(const name of await readdir(root))
  need(allowed.has(name)||/^\.write-[a-f0-9-]{36}$/.test(name),'RESEARCH_QUOTATION_SETUP_DIRECTORY_IN_USE');
 checkpoint(selected.signal);
 const file=await publish(root,'input.json',original.body);
 const record={schema:REQUEST,directory:root,id:input.requestId,request:copy(input),
  requestSha256:fingerprint(input),input:{...fileView(file),sourcePath:original.sourcePath},createdAt:timestamp()};
 await publish(root,'request.json',record);return record;
}
function runtimeBinding(value){
 const names=['schema','directory','installationId','profileId','profileSha256','lockSha256',
  'sourceCommit','sourceManifestSha256','dependencyCount','sourceRoot'];
 return Object.fromEntries(names.map(key=>[key,value[key]]));
}
async function selectedRuntime(directory,signal){
 checkpoint(signal);
 const runtime=await inspectMerchantRuntime(directory,{load:false,source:false}),files=[];
 need(runtime.state==='READY'&&runtime.directory===directory,'RESEARCH_QUOTATION_SETUP_RUNTIME_REQUIRED');
 for(const name of MODULES){
  checkpoint(signal);
  const path=join(runtime.sourceRoot,ROOT,name),body=await readResearchHostFile(path,LIMIT);
  files.push({name,path,bytes:body.length,sha256:digest(body)});
 }
 const module=await import(pathToFileURL(join(runtime.sourceRoot,ROOT,'customer-quotes/launch-inspection.mjs')).href);
 need(typeof module.inspectResearchQuoteLaunch==='function'&&typeof module.assertResearchQuoteLaunch==='function',
  'RESEARCH_QUOTATION_SETUP_NATIVE_INSPECTOR_REQUIRED');
 return {runtime:runtimeBinding(runtime),modules:files,inspect:module.inspectResearchQuoteLaunch,
  assert:module.assertResearchQuoteLaunch};
}
async function captureConfiguration(root,request,signal){
 const original=request.request,sourceName='source-host.json';
 let bytes=await retainedBody(root,sourceName,HOST_LIMIT);
 if(!bytes){
  checkpoint(signal);
  bytes=original.configurationFile
   ?await readResearchHostFile(original.configurationFile,HOST_LIMIT,{privateFile:true})
   :jsonBytes(original.configuration);
  need(bytes.length<=HOST_LIMIT,'RESEARCH_QUOTATION_SETUP_HOST_LIMIT');
  await publish(root,sourceName,bytes);
 }
 const sourceFile=original.configurationFile??request.input.sourcePath??join(root,'input.json');
 const normalized=normalizeResearchQuoteConfiguration(parseJson(bytes),{
  directory:join(original.workspaceDirectory,'customer-quotes'),file:sourceFile,sha256:digest(bytes)});
 const configuration={schema:QUOTE_HOST_SCHEMA,casesDirectory:normalized.casesDirectory,pricing:copy(normalized.pricing)};
 need(root!==configuration.casesDirectory&&Object.values(configuration.pricing).every(profile=>profile.directory!==root),
  'RESEARCH_QUOTATION_SETUP_DISTINCT_DIRECTORY_REQUIRED');
 const source={schema:SOURCE,requestSha256:request.requestSha256,
  kind:original.configurationFile?'ORIGINAL_HOST':'COMPLETE_INLINE_HOST',path:sourceFile,
  file:{name:sourceName,bytes:bytes.length,sha256:digest(bytes)},configuration,
  configurationSha256:fingerprint(configuration)};
 await publish(root,'configuration-source.json',source);
 await publish(root,'research-quotes.json',configuration);
 return source;
}
function applicationSettings(root,request){
 const input=request.request,settings={...copy(input.settings??{}),
  workspaceDirectory:input.workspaceDirectory,customerQuotesHost:join(root,'research-quotes.json')};
 if(settings.connectionFile===undefined)settings.connectionFile=join(input.workspaceDirectory,'research-connection.json');
 return settings;
}
function directLaunch(request,settings,inspection){
 const args=[];
 for(const [key,flag]of Object.entries(SETTINGS))
  if(settings[key]!==undefined)args.push(flag,String(settings[key]));
 args.push('--customer-quotes-binding-sha256',inspection.bindingSha256);
 return {schema:'sf88-research-quotation-launch-command/v1',runtimeDirectory:request.request.runtimeDirectory,
  command:'research-workspace',args,environmentFile:settings.environmentFile??null,
  bindingSha256:inspection.bindingSha256,workspaceDirectory:request.request.workspaceDirectory,
  connectionFile:settings.connectionFile};
}
function applicationRequest(request,settings){
 if(!request.request.application)return null;
 return {...copy(request.request.application),runtimeDirectory:request.request.runtimeDirectory,
  kind:'research-dossiers',providerId:'research-dossiers',label:request.request.label,settings:copy(settings)};
}
function renderReview(request,proof){
 const input=request.request,lines=['# '+input.label,'',
  'This retained setup selects the original Research application, case store and pricing sources.','',
  '## Application','',
  '- Research directory: '+input.workspaceDirectory,
  '- Original runtime: '+proof.runtime.directory,
  '- Source commit: '+proof.runtime.sourceCommit,
  '- Case store: '+proof.launch.binding.casesDirectory,
  '- Quotation configuration: '+proof.launch.binding.configurationFile,
  '- Launch binding SHA-256: '+proof.launch.bindingSha256,
  '- Private connection: '+proof.settings.connectionFile,''];
 for(const section of proof.launch.review.sections){
  lines.push('## '+section.title,'');
  for(const row of section.rows){
   const values=Array.isArray(row.value)?row.value:[row.value];
   lines.push('- '+row.label+': '+values.map(String).join(' · '));
  }
  lines.push('');
 }
 lines.push('## Continue this original setup','',
  'Save the returned review SHA with quotes-setup-save. The save reopens the original runtime and hashes the selected pricing files again.',
  'Use application-review.json with the existing Applications review/save/start sequence. The generated settings preserve every selected original Research source option.',
  'direct-launch.json carries the ordinary original command arguments and its reviewed quotation binding. Its environmentFile identifies the existing private environment selection.',
  'After launch, quotations, customer updates, paid delivery, receiving and every source pane share this original Research listener.',
  '','## Receiving and changed source selections','',
  'Export preserves this complete setup and its original path selections. On another host, select the received original case/pricing state and installed runtime in a new setup input.',
  'Keep the full profile map and existing source settings when changing paths or adding a profile. Native case backups and Research dossier/history receiving remain their original workflows.',
  'The completed setup reopens from its retained files even if its original input file or runtime is later unavailable.','');
 return Buffer.from(lines.join('\n'));
}
function reviewedRecord(value,request){
 need(value?.schema===REVIEW&&value.requestSha256===request.requestSha256&&
  value.reviewSha256===fingerprint(value.proof)&&Array.isArray(value.proof?.files)&&
  value.proof.files.length>=5&&value.proof.files.length<=16,
  'RESEARCH_QUOTATION_SETUP_REVIEW_CHANGED');
 need(value.proof.launch?.bindingSha256===fingerprint(value.proof.launch.binding)&&
  value.proof.launch.binding.configurationFile===join(request.directory,'research-quotes.json')&&
  value.proof.launch.binding.directory===join(request.request.workspaceDirectory,'customer-quotes'),
  'RESEARCH_QUOTATION_SETUP_LAUNCH_CHANGED');
 return value;
}
async function verifyFiles(root,files){
 const names=new Set();
 for(const row of files){
  need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/.test(row.name??'')&&!names.has(row.name)&&
   Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=LIMIT,'RESEARCH_QUOTATION_SETUP_FILE_INVALID');
  hash(row.sha256);names.add(row.name);
  const body=await retainedBody(root,row.name,LIMIT);
  need(body&&body.length===row.bytes&&digest(body)===row.sha256,'RESEARCH_QUOTATION_SETUP_FILE_CHANGED');
 }
}
async function state(root){
 const request=await requestAt(root);need(request,'RESEARCH_QUOTATION_SETUP_NOT_FOUND',404);
 const reviewed=await retained(root,'review.json'),saved=await retained(root,'result.json');
 const review=reviewed?reviewedRecord(reviewed.value,request):null;
 if(review)await verifyFiles(root,review.proof.files);
 const result=saved?.value??null;
 if(result)need(review&&result.schema===RESULT&&result.requestSha256===request.requestSha256&&
  result.reviewSha256===review.reviewSha256&&result.resultSha256===fingerprint(result.result),
  'RESEARCH_QUOTATION_SETUP_RESULT_CHANGED');
 return {request,review,result};
}
function view(root,record){
 const {request,review,result}=record;
 return {schema:RESEARCH_QUOTATION_SETUP_SCHEMA,directory:root,id:request.id,
  status:result?'COMPLETE':review?'REVIEWED':'PREPARING',request:copy(request.request),
  requestSha256:request.requestSha256,reviewSha256:review?.reviewSha256??null,
  review:copy(review?.proof??null),result:copy(result?.result??null),
  createdAt:request.createdAt,completedAt:result?.completedAt??null};
}
export async function prepareResearchQuotationSetup(options){
 const selected=capture(options);checkpoint(selected.signal);
 return withCustomerOperation(selected.directory,async root=>{
  const old=await requestAt(root),original=await currentInput(selected,old);
  const request=old??await firstRequest(root,selected,original);
  const existing=await state(root);
  if(existing.review||existing.result)return view(root,existing);
  checkpoint(selected.signal);
  const runtime=await selectedRuntime(request.request.runtimeDirectory,selected.signal),
   source=await captureConfiguration(root,request,selected.signal);
  checkpoint(selected.signal);
  const launch=await runtime.inspect({directory:join(request.request.workspaceDirectory,'customer-quotes'),
   configurationFile:join(root,'research-quotes.json')});
  runtime.assert(launch,launch.bindingSha256);
  const settings=applicationSettings(root,request),application=applicationRequest(request,settings),
   command=directLaunch(request,settings,launch),files=[];
  for(const name of ['source-host.json','configuration-source.json','research-quotes.json']){
   const body=await retainedBody(root,name);files.push({name,bytes:body.length,sha256:digest(body)});
  }
  files.push(fileView(await publish(root,'application-settings.json',settings)));
  files.push(fileView(await publish(root,'direct-launch.json',command)));
  if(application)files.push(fileView(await publish(root,'application-review.json',application)));
  const proof={schema:REVIEW,requestSha256:request.requestSha256,runtime:runtime.runtime,
   modules:runtime.modules,configurationSource:{kind:source.kind,path:source.path,...source.file},
   launch:copy(launch),settings,application,command,files};
  // The complete readable review is part of the same immutable preparation.
  files.push(fileView(await publish(root,'review.md',renderReview(request,proof))));
  const record={schema:REVIEW,requestSha256:request.requestSha256,proof,
   reviewSha256:fingerprint(proof),reviewedAt:timestamp()};
  checkpoint(selected.signal);
  await publish(root,'review.json',record);
  return view(root,await state(root));
 });
}
export async function readResearchQuotationSetup(directory){
 const root=await customerDirectory(absolute(directory),{create:false});
 return withCustomerOperation(root,async selected=>view(selected,await state(selected)));
}
export async function saveResearchQuotationSetup(options){
 fields(options,['directory','reviewSha256','signal'],['directory','reviewSha256']);
 const directory=absolute(options.directory),expected=hash(options.reviewSha256),signal=signalInput(options.signal);
 checkpoint(signal);
 return withCustomerOperation(directory,async root=>{
  const current=await state(root);
  need(current.review&&current.review.reviewSha256===expected,'RESEARCH_QUOTATION_SETUP_REVIEW_CHANGED',409);
  if(current.result)return view(root,current);
  checkpoint(signal);
  const selected=await selectedRuntime(current.request.request.runtimeDirectory,signal),proof=current.review.proof;
  need(same(selected.runtime,proof.runtime)&&same(selected.modules,proof.modules),
   'RESEARCH_QUOTATION_SETUP_RUNTIME_CHANGED',409);
  const now=await selected.inspect({directory:proof.launch.binding.directory,
   configurationFile:proof.launch.binding.configurationFile});
  selected.assert(now,proof.launch.bindingSha256);
  const result={id:current.request.id,directory:root,workspaceDirectory:current.request.request.workspaceDirectory,
   runtime:copy(proof.runtime),configurationFile:join(root,'research-quotes.json'),
   connectionFile:proof.settings.connectionFile,launchBindingSha256:proof.launch.bindingSha256,
   applicationSettingsFile:join(root,'application-settings.json'),
   applicationRequestFile:proof.application===null?null:join(root,'application-review.json'),
   directLaunchFile:join(root,'direct-launch.json'),reviewFile:join(root,'review.md'),
   files:copy(proof.files),application:copy(proof.application),command:copy(proof.command)};
  checkpoint(signal);
  await publish(root,'result.json',{schema:RESULT,requestSha256:current.request.requestSha256,
   reviewSha256:expected,result,resultSha256:fingerprint(result),completedAt:timestamp()});
  return view(root,await state(root));
 });
}
async function exportSelection(root){
 const saved=await state(root);need(saved.result,'RESEARCH_QUOTATION_SETUP_SAVE_REQUIRED');
 const names=['input.json','request.json',...saved.review.proof.files.map(file=>file.name),'review.json','result.json'],
  files=[];
 for(const name of names){
  const body=await retainedBody(root,name,LIMIT);need(body,'RESEARCH_QUOTATION_SETUP_FILE_MISSING');
  files.push({name,bytes:body.length,sha256:digest(body)});
 }
 return {schema:EXPORT,sourceDirectory:root,id:saved.request.id,requestSha256:saved.request.requestSha256,
  reviewSha256:saved.review.reviewSha256,resultSha256:saved.result.resultSha256,files};
}
export async function exportResearchQuotationSetup(options){
 fields(options,['directory','outputDirectory','signal'],['directory','outputDirectory']);
 const source=absolute(options.directory),output=absolute(options.outputDirectory),signal=signalInput(options.signal);
 need(source!==output&&!source.startsWith(output+sep)&&!output.startsWith(source+sep),
  'RESEARCH_QUOTATION_SETUP_DISTINCT_EXPORT_REQUIRED');
 checkpoint(signal);
 return withCustomerOperation(output,async target=>{
  // A fully published export reopens without the source setup or runtime.
  const prior=await retained(target,'commissioning.json'),record=prior?.value;
  if(record){
   need(record.schema===EXPORT&&record.sourceDirectory===source&&Array.isArray(record.files)&&record.files.length<=20,
    'RESEARCH_QUOTATION_SETUP_EXPORT_CHANGED');
   let complete=true;
   for(const file of record.files)if(!await exists(join(target,file.name)))complete=false;
   if(complete){await verifyFiles(target,record.files);return {...record,directory:target,reused:true};}
  }else{
   const names=await readdir(target);
   need(names.every(name=>name==='customer-update.lock'||/^\.write-[a-f0-9-]{36}$/.test(name)),
    'RESEARCH_QUOTATION_SETUP_EXPORT_DIRECTORY_IN_USE');
  }
  const sourceRoot=await customerDirectory(source,{create:false});
  const selected=await withCustomerOperation(sourceRoot,()=>exportSelection(sourceRoot));
  need(!record||same(record,selected),'RESEARCH_QUOTATION_SETUP_EXPORT_CHANGED');
  await publish(target,'commissioning.json',selected);
  for(const file of selected.files){
   checkpoint(signal);
   let body=await retainedBody(target,file.name,LIMIT);
   if(!body)body=await readResearchHostFile(join(sourceRoot,file.name),LIMIT);
   need(body.length===file.bytes&&digest(body)===file.sha256,'RESEARCH_QUOTATION_SETUP_FILE_CHANGED');
   await publish(target,file.name,body);
  }
  await verifyFiles(target,selected.files);
  return {...selected,directory:target,reused:false};
 });
}
