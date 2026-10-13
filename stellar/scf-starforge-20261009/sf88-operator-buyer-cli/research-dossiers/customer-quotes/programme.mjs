// MIT. A customer quotation programme retains the original native operating requests.
import {join,resolve} from 'node:path';
import {readdir} from 'node:fs/promises';
import {exists,digest} from '../../node/store.mjs';
import {readResearchHostFile} from '../workspace-files.mjs';
import {customerIdentifier,customerRevision} from '../customer-updates/contracts.mjs';
import {findCustomerRecord} from '../customer-updates/operator.mjs';
import {customerDirectory,withCustomerOperation,readCustomerJson,retainCustomerBytes}
 from '../customer-updates/files.mjs';
import {QUOTE_REQUEST_LIMIT,QUOTE_FILE_LIMIT,QUOTE_CASE_TRANSFER_LIMIT,fields,id,hash,dossier,text,need,same,fingerprint,
 caseSelection,briefSelection,responseSelection,normalizePublicationSelection,realizedSelection,applySelection}
 from './contracts.mjs';
import {caseTransferInput,caseTransferSelection} from './case-transfer.mjs';
import {captureResearchQuoteInput,validateResearchQuoteOperation,RESEARCH_QUOTES_CASE_ACTIONS,
 RESEARCH_QUOTES_PRICING_ACTIONS} from './client.mjs';
import {RESEARCH_QUOTES_WRITES,submitResearchQuote,replayResearchQuote,readResearchQuoteRun} from './operator.mjs';

export const RESEARCH_QUOTE_PROGRAMME_SCHEMA='sf88-research-quotation-programme/v1';
export const RESEARCH_QUOTE_PROGRAMME_STEP_SCHEMA='sf88-research-quotation-programme-step/v1';
export const RESEARCH_QUOTE_PROGRAMME_LIMIT=256;
const HEADER='sf88-research-quotation-programme-retained/v1';
const STEP_KEY=/^[a-z0-9][a-z0-9._-]{0,79}$/;
const workspace=value=>need(/^research_[a-f0-9]{64}$/.test(value??''),'RESEARCH_QUOTE_PROGRAMME_WORKSPACE_REQUIRED');
const clone=value=>JSON.parse(JSON.stringify(value));
const time=()=>new Date().toISOString();
const bytes=value=>Buffer.from(JSON.stringify(value));
export function researchQuoteProgrammeStepId(value){
 need(typeof value==='string'&&STEP_KEY.test(value)&&!['.','..'].includes(value),
  'RESEARCH_QUOTE_PROGRAMME_STEP_REQUIRED');return value;
}
export function researchQuoteProgrammeInput(value){
 const input=captureResearchQuoteInput(value);
 fields(input,['schema','id','name','dossierId','revision','projectId','caseId','caseMode']);
 need(input.schema===RESEARCH_QUOTE_PROGRAMME_SCHEMA,'RESEARCH_QUOTE_PROGRAMME_INPUT_REQUIRED');
 id(input.id);text(input.name,240);dossier(input.dossierId);customerRevision(input.revision);
 customerIdentifier(input.projectId);id(input.caseId);
 need(['CREATE','EXISTING'].includes(input.caseMode),'RESEARCH_QUOTE_PROGRAMME_CASE_MODE_REQUIRED');
 return input;
}
export async function readResearchQuoteProgrammeJson(root,name,limit=QUOTE_FILE_LIMIT){
 const path=join(root,name);if(!await exists(path))return null;
 const original=await readCustomerJson(path,limit);
 // Finish only this exact file's original stopped immutable publication.
 await retainCustomerBytes(root,name,original.body);return original.value;
}
async function save(root,name,value){
 const body=bytes(value);need(body.length<=QUOTE_FILE_LIMIT,'RESEARCH_QUOTE_PROGRAMME_RECORD_LIMIT',413);
 return retainCustomerBytes(root,name,body);
}
function header(value){
 need(value?.schema===HEADER&&value.inputSha256===fingerprint(researchQuoteProgrammeInput(value.input))&&
  value.sourceSha256===fingerprint(value.source)&&value.inputFile?.name==='programme-input.json'&&
  Number.isSafeInteger(value.inputFile.bytes)&&value.inputFile.bytes>0&&value.inputFile.bytes<=QUOTE_REQUEST_LIMIT,
  'RESEARCH_QUOTE_PROGRAMME_CHANGED');
 hash(value.inputFile.sha256);workspace(value.workspaceId);hash(value.casesWorkspaceId);
 need(value.source.workspaceId===value.workspaceId&&value.source.casesWorkspaceId===value.casesWorkspaceId&&
  value.source.dossierId===value.input.dossierId&&value.source.revision===value.input.revision&&
  value.source.project?.id===value.input.projectId&&
  (value.input.caseMode==='EXISTING'?value.source.case?.id===value.input.caseId:value.source.case===null),
  'RESEARCH_QUOTE_PROGRAMME_SOURCE_CHANGED');
 return value;
}
async function checkInput(root,record){
 const body=await readResearchHostFile(join(root,'programme-input.json'),QUOTE_REQUEST_LIMIT,{sha256:record.inputFile.sha256});
 need(body.length===record.inputFile.bytes&&same(researchQuoteProgrammeInput(JSON.parse(body)),record.input),
  'RESEARCH_QUOTE_PROGRAMME_INPUT_CHANGED');return body;
}
export async function readResearchQuoteProgrammeHeader(root){
 const value=header(await readResearchQuoteProgrammeJson(root,'programme.json'));
 await checkInput(root,value);return value;
}
async function connect(source,expected,signal){
 const client=typeof source==='function'?await source():source;
 need(client&&typeof client.status==='function'&&typeof client.customerQuotes==='function'&&
  typeof client.customerUpdates==='function','RESEARCH_QUOTE_PROGRAMME_ORIGINAL_CLIENT_REQUIRED');
 const current=await client.status({signal});workspace(current.workspaceId);
 need(expected===undefined||current.workspaceId===expected,'RESEARCH_QUOTE_PROGRAMME_WORKSPACE_CHANGED');
 return {client,quotes:client.customerQuotes(),workspaceId:current.workspaceId};
}
const inputLimit=command=>command==='prepare-case-transfer'?QUOTE_CASE_TRANSFER_LIMIT:QUOTE_REQUEST_LIMIT;
function captureInput(value,command){
 return command==='prepare-case-transfer'||command===undefined&&value?.source?.schema==='sf88-research-case-transfer/v1'?
  caseTransferInput(value):captureResearchQuoteInput(value);
}
async function originalInput(root,name,{input,inputFile,required=true,command}={}){
 let body;const maximum=inputLimit(command);
 if(inputFile)body=await readResearchHostFile(inputFile,maximum);
 else if(input!==undefined)body=bytes(input);
 else if(await exists(join(root,name)))body=await readResearchHostFile(join(root,name),maximum);
 need(!required||body?.length>0,'RESEARCH_QUOTE_PROGRAMME_INPUT_REQUIRED');
 if(!body)return null;
 need(body.length<=maximum,'RESEARCH_QUOTE_PROGRAMME_INPUT_LIMIT',413);
 return {body,value:captureInput(JSON.parse(body),command)};
}
function capturedArguments(input,inputFile,command){
 need(!(input!==undefined&&inputFile),'RESEARCH_QUOTE_SELECT_ONE_INPUT');
 return {input:input===undefined?undefined:captureInput(input,command),inputFile:inputFile?resolve(inputFile):null};
}
function retainedSelection(value){
 if(value?.command!=='prepare-case-transfer')return researchQuoteProgrammeCommand(value.command,value.input,value);
 fields(value,['command','input']);const input=captureResearchQuoteInput(value.input);
 fields(input,['requestId','caseId','expectedRevision','source','sourceSha256']);
 id(input.requestId);id(input.caseId);if(input.expectedRevision!==null)hash(input.expectedRevision);hash(input.sourceSha256);
 fields(input.source,['workspaceId','casesWorkspaceId','caseId','revision']);
 need(/^research_[a-f0-9]{64}$/.test(input.source.workspaceId??''),'RESEARCH_QUOTE_PROGRAMME_WORKSPACE_REQUIRED');
 hash(input.source.casesWorkspaceId);id(input.source.caseId);hash(input.source.revision);
 need(input.source.caseId===input.caseId,'RESEARCH_QUOTE_PROGRAMME_CASE_CHANGED');
 return {command:value.command,input};
}
/** Inspect the actual selected customer and optional existing case before retaining the programme. */
export function createResearchQuoteProgramme({client,directory,input,inputFile,signal}={}){
 const selected=capturedArguments(input,inputFile);
 return withCustomerOperation(directory,async root=>{
  need(!await exists(join(root,'input.json'))&&!await exists(join(root,'request.json'))&&!await exists(join(root,'export.json'))&&
   !await exists(join(root,'package-input.json'))&&!await exists(join(root,'package-request.json'))&&
   !await exists(join(root,'quotation-programme.json'))&&!await exists(join(root,'handover-copy.json'))&&
   !await exists(join(root,'receiving-input.json'))&&!await exists(join(root,'receiving-request.json'))&&
   !await exists(join(root,'input','handover-copy.json'))&&!await exists(join(root,'input','quotation-programme.json')),
   'RESEARCH_QUOTE_PROGRAMME_DIRECTORY_REQUIRED');
  let retained=await readResearchQuoteProgrammeJson(root,'programme.json');
  if(retained){
   header(retained);await checkInput(root,retained);
   if(selected.input!==undefined)need(same(researchQuoteProgrammeInput(selected.input),retained.input),
    'RESEARCH_QUOTE_PROGRAMME_INPUT_CHANGED');
   if(selected.inputFile&&await exists(selected.inputFile)){
    const body=await readResearchHostFile(selected.inputFile,QUOTE_REQUEST_LIMIT);
    need(body.length===retained.inputFile.bytes&&digest(body)===retained.inputFile.sha256,
     'RESEARCH_QUOTE_PROGRAMME_INPUT_CHANGED');
   }
   return {schema:RESEARCH_QUOTE_PROGRAMME_SCHEMA,directory:root,programme:retained,reused:true};
  }
  const original=await originalInput(root,'programme-input.json',selected),input=researchQuoteProgrammeInput(original.value);
  const connected=await connect(client,undefined,signal),configuration=await connected.quotes.configuration({signal}),
   selectedProject=await findCustomerRecord(connected.client,input.dossierId,'projects',input.projectId,{revision:input.revision});
  need(configuration.workspaceId===connected.workspaceId&&selectedProject.revision===input.revision,
   'RESEARCH_QUOTE_PROGRAMME_SOURCE_CHANGED');
  const caseFile=input.caseMode==='EXISTING'?await connected.quotes.caseFileInfo(input.caseId,
   {kind:'CASE_RECORD',scope:{workspaceId:configuration.cases.workspaceId,caseId:input.caseId}},{signal}):null;
  if(caseFile)need(caseFile.case?.id===input.caseId,'RESEARCH_QUOTE_PROGRAMME_CASE_CHANGED');
  const originalCase=caseFile?{...caseFile.case,file:caseFile.descriptor}:null;
  const source={workspaceId:connected.workspaceId,casesWorkspaceId:configuration.cases.workspaceId,
   dossierId:input.dossierId,revision:input.revision,project:selectedProject.record,case:originalCase,
   configuration:{cases:configuration.cases,pricing:configuration.pricing,
    merchants:configuration.merchants,launch:configuration.launch}};
  retained={schema:HEADER,input,inputSha256:fingerprint(input),workspaceId:connected.workspaceId,
   casesWorkspaceId:configuration.cases.workspaceId,source,sourceSha256:fingerprint(source),
   inputFile:{name:'programme-input.json',bytes:original.body.length,sha256:digest(original.body)},createdAt:time()};
  header(retained);
  await retainCustomerBytes(root,'programme-input.json',original.body);
  await save(root,'programme.json',retained);
  await customerDirectory(join(root,'steps'));
  return {schema:RESEARCH_QUOTE_PROGRAMME_SCHEMA,directory:root,programme:retained,reused:false};
 });
}
export function researchQuoteProgrammeCommand(command,value,{caseId,action,profile}={}){
 need(RESEARCH_QUOTES_WRITES.includes(command),'RESEARCH_QUOTE_PROGRAMME_COMMAND_REQUIRED');
 let input=command==='prepare-case-transfer'?caseTransferSelection(value):captureResearchQuoteInput(value),extra={};
 const normalizers={'create-case':caseSelection,prepare:briefSelection,'prepare-response':responseSelection,
  'prepare-publication':normalizePublicationSelection,'prepare-report':realizedSelection,apply:applySelection,
  'enroll-publication':applySelection,'apply-case-transfer':applySelection};
 if(normalizers[command])input=normalizers[command](input);
 else if(command==='prepare-case-transfer'){
  input=retainedSelection({command,input}).input;
 }else if(command==='native-case'){
  id(caseId);need(RESEARCH_QUOTES_CASE_ACTIONS.includes(action),'RESEARCH_QUOTE_CASE_ACTION_REQUIRED');
  need(input.id===undefined||input.id===caseId,'RESEARCH_QUOTE_CASE_CHANGED');extra={caseId,action};
 }else{
  need(typeof profile==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(profile)&&
   RESEARCH_QUOTES_PRICING_ACTIONS.includes(action),'RESEARCH_QUOTE_PRICING_ACTION_REQUIRED');extra={profile,action};
 }
 return {command,...extra,input};
}
export function assertResearchQuoteProgrammeOperation(record,programme){
 validateResearchQuoteOperation(record);
 need(record.workspaceId===programme.workspaceId&&record.casesWorkspaceId===programme.casesWorkspaceId,
  'RESEARCH_QUOTE_PROGRAMME_WORKSPACE_CHANGED');
 if(record.kind==='CASE_TRANSFER'){
  need(record.request.caseId===programme.input.caseId,'RESEARCH_QUOTE_PROGRAMME_CASE_CHANGED');return record;
 }
 const selection=record.review?.selection??record.request;
 const caseId=record.request.caseId??record.result?.caseId??selection.caseId;
 const dossierId=record.request.dossierId??record.result?.dossierId??selection.dossierId;
 const projectId=record.request.projectId??selection.projectId??record.review?.projectId;
 need(caseId===programme.input.caseId&&dossierId===programme.input.dossierId&&projectId===programme.input.projectId,
  'RESEARCH_QUOTE_PROGRAMME_CASE_CHANGED');
 return record;
}
async function scope(connected,programme,selected,signal){
 const configuration=await connected.quotes.configuration({signal});
 need(configuration.workspaceId===programme.workspaceId&&configuration.cases?.workspaceId===programme.casesWorkspaceId,
  'RESEARCH_QUOTE_PROGRAMME_WORKSPACE_CHANGED');
 const input=selected.input,sources={};
 if(['create-case','prepare'].includes(selected.command)){
  need(input.caseId===programme.input.caseId&&input.dossierId===programme.input.dossierId&&
   input.projectId===programme.input.projectId,'RESEARCH_QUOTE_PROGRAMME_CASE_CHANGED');
  need(selected.command!=='create-case'||programme.input.caseMode==='CREATE','RESEARCH_QUOTE_PROGRAMME_EXISTING_CASE');
 }else if(['prepare-response','prepare-publication','prepare-report'].includes(selected.command)){
  const binding=assertResearchQuoteProgrammeOperation(await connected.quotes.operation(input.bindingId,{signal}),programme);
  need(binding.kind==='BRIEF'&&binding.status==='COMPLETE','RESEARCH_QUOTE_APPLIED_BRIEF_REQUIRED');
  sources.binding=binding;
  if(input.dossierId!==undefined)need(input.dossierId===programme.input.dossierId,'RESEARCH_QUOTE_PROGRAMME_CASE_CHANGED');
  if(selected.command==='prepare-report'){
   const publication=assertResearchQuoteProgrammeOperation(await connected.quotes.operation(input.publicationId,{signal}),programme);
   need(publication.kind==='PUBLICATION'&&publication.status==='COMPLETE'&&
    publication.request.bindingId===input.bindingId,'RESEARCH_QUOTE_PROGRAMME_PUBLICATION_CHANGED');
   sources.publication=publication;
  }
 }else if(selected.command==='prepare-case-transfer'){
  need(input.caseId===programme.input.caseId,'RESEARCH_QUOTE_PROGRAMME_CASE_CHANGED');
 }else if(['apply','enroll-publication','apply-case-transfer'].includes(selected.command)){
  const original=assertResearchQuoteProgrammeOperation(await connected.quotes.operation(input.id,{signal}),programme);
  need(original.review?.reviewSha256===input.reviewSha256&&
   (selected.command==='apply'?['BRIEF','RESPONSE'].includes(original.kind):
    original.kind===(selected.command==='apply-case-transfer'?'CASE_TRANSFER':'PUBLICATION')),
   'RESEARCH_QUOTE_REVIEW_CHANGED');sources.operation=original;
 }else if(selected.command==='native-case'){
  need(selected.caseId===programme.input.caseId,'RESEARCH_QUOTE_PROGRAMME_CASE_CHANGED');
  if(input.scope)need(input.scope.caseId===programme.input.caseId&&input.scope.workspaceId===programme.casesWorkspaceId,
   'RESEARCH_QUOTE_PROGRAMME_CASE_CHANGED');
 }else{
  need(configuration.pricing.some(row=>row.id===selected.profile||row.profile===selected.profile),
   'RESEARCH_QUOTE_PROGRAMME_PRICING_CHANGED');
 }
 return sources;
}
function stepRecord(value,programme,key){
 need(value?.schema===RESEARCH_QUOTE_PROGRAMME_STEP_SCHEMA&&value.stepId===key&&value.programmeId===programme.input.id&&
  value.programmeSha256===fingerprint(programme)&&value.workspaceId===programme.workspaceId&&
  value.selectionSha256===fingerprint(value.selection)&&
  same(value.selection,retainedSelection(value.selection))&&
  value.sourceSha256===fingerprint(value.source)&&value.inputFile?.name==='step-input.json'&&
  Number.isSafeInteger(value.inputFile.bytes)&&value.inputFile.bytes>0&&value.inputFile.bytes<=inputLimit(value.selection.command),
  'RESEARCH_QUOTE_PROGRAMME_STEP_CHANGED');
 hash(value.inputFile.sha256);
 if(value.replayOf!==null)researchQuoteProgrammeStepId(value.replayOf);
 return value;
}
function pending(record,native){
 const value=native?.result?.result;
 return {stepId:record.stepId,command:record.selection.command,action:record.selection.action??null,
  profile:record.selection.profile??null,selectionSha256:record.selectionSha256,
  sourceSha256:record.sourceSha256,replayOf:record.replayOf,
  createdAt:record.createdAt,status:native?.result?'COMPLETE':'PENDING',
  nativeState:value?.status??value?.result?.state??null,requestId:value?.id??record.selection.input.requestId??
   record.selection.input.id??null,kind:value?.kind??null,resultSha256:native?.result?.resultSha256??null,
  inputFile:record.inputFile,next:value?.status==='REVIEWED'&&['BRIEF','RESPONSE','PUBLICATION','CASE_TRANSFER'].includes(value.kind)?
   {command:value.kind==='PUBLICATION'?'enroll-publication':value.kind==='CASE_TRANSFER'?'apply-case-transfer':'apply',
    input:{id:value.id,reviewSha256:value.review.reviewSha256}}:null};
}
export async function readResearchQuoteProgrammeStepIn(root,programme,key){
 researchQuoteProgrammeStepId(key);
 const directory=await customerDirectory(join(root,'steps',key),{create:false}),
  record=stepRecord(await readResearchQuoteProgrammeJson(directory,'step.json'),programme,key),
  input=await readResearchHostFile(join(directory,'step-input.json'),inputLimit(record.selection.command),{sha256:record.inputFile.sha256});
 need(input.length===record.inputFile.bytes&&same(
  researchQuoteProgrammeCommand(record.selection.command,JSON.parse(input),record.selection),record.selection),
  'RESEARCH_QUOTE_PROGRAMME_STEP_CHANGED');
 let native=null;
 if(await exists(join(directory,'operation','request.json')))native=await readResearchQuoteRun(join(directory,'operation'));
 if(native){
  need(native.request?.workspaceId===programme.workspaceId&&same(native.request.selection,record.selection),
   'RESEARCH_QUOTE_PROGRAMME_STEP_CHANGED');
  if(native.result?.result?.schema==='sf88-research-customer-quote-operation/v1')
   assertResearchQuoteProgrammeOperation(native.result.result,programme);
 }
 return {schema:RESEARCH_QUOTE_PROGRAMME_STEP_SCHEMA,directory,record,input:JSON.parse(input),native,
  summary:pending(record,native)};
}
async function steps(root,programme){
 const folder=await customerDirectory(join(root,'steps')),items=[];
 for(const key of (await readdir(folder)).filter(name=>STEP_KEY.test(name)).sort()){
  if(!await exists(join(folder,key,'step.json')))continue;
  need(items.length<RESEARCH_QUOTE_PROGRAMME_LIMIT,'RESEARCH_QUOTE_PROGRAMME_STEP_LIMIT');
  items.push((await readResearchQuoteProgrammeStepIn(root,programme,key)).summary);
 }
 items.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.stepId.localeCompare(b.stepId));
 return items;
}
export async function readResearchQuoteProgramme(directory){
 const root=await customerDirectory(directory,{create:false});
 return withCustomerOperation(root,async()=>{const programme=await readResearchQuoteProgrammeHeader(root),items=await steps(root,programme);
  return {schema:RESEARCH_QUOTE_PROGRAMME_SCHEMA,directory:root,programme,steps:items,snapshot:fingerprint({programme,steps:items})};});
}
export async function readResearchQuoteProgrammeStep({directory,stepId}={}){
 const root=await customerDirectory(directory,{create:false});researchQuoteProgrammeStepId(stepId);
 return withCustomerOperation(root,async()=>readResearchQuoteProgrammeStepIn(root,await readResearchQuoteProgrammeHeader(root),stepId));
}
/** The original operator owns input capture, native request, attempts and first response. */
export function submitResearchQuoteProgramme({client,directory,stepId,command,input,inputFile,action,profile,signal}={}){
 researchQuoteProgrammeStepId(stepId);
 const supplied=capturedArguments(input,inputFile,command),controls={command,action,profile};
 return withCustomerOperation(directory,async root=>{
  const programme=await readResearchQuoteProgrammeHeader(root),target=await customerDirectory(join(root,'steps',stepId));
  let record=await readResearchQuoteProgrammeJson(target,'step.json');
  if(record){
   stepRecord(record,programme,stepId);
   for(const key of ['command','action','profile'])if(controls[key]!==undefined)
    need(record.selection[key]===controls[key],'RESEARCH_QUOTE_PROGRAMME_STEP_CHANGED');
   if(supplied.input!==undefined)need(same(researchQuoteProgrammeCommand(record.selection.command,supplied.input,record.selection),record.selection),
    'RESEARCH_QUOTE_PROGRAMME_STEP_CHANGED');
   if(supplied.inputFile&&await exists(supplied.inputFile)){
    const body=await readResearchHostFile(supplied.inputFile,inputLimit(record.selection.command));
    need(body.length===record.inputFile.bytes&&digest(body)===record.inputFile.sha256,'RESEARCH_QUOTE_PROGRAMME_STEP_CHANGED');
   }
   await readResearchQuoteProgrammeStepIn(root,programme,stepId);
  }else{
   const keys=(await readdir(join(root,'steps'))).filter(key=>STEP_KEY.test(key));
   need(keys.length<=RESEARCH_QUOTE_PROGRAMME_LIMIT,'RESEARCH_QUOTE_PROGRAMME_STEP_LIMIT');
   const original=await originalInput(target,'step-input.json',{...supplied,command}),
    selection=researchQuoteProgrammeCommand(command,original.value,{caseId:programme.input.caseId,action,profile}),
    connected=await connect(client,programme.workspaceId,signal),source=await scope(connected,programme,selection,signal);
   record={schema:RESEARCH_QUOTE_PROGRAMME_STEP_SCHEMA,programmeId:programme.input.id,programmeSha256:fingerprint(programme),
    workspaceId:programme.workspaceId,stepId,selection,selectionSha256:fingerprint(selection),source,
    sourceSha256:fingerprint(source),replayOf:null,
    inputFile:{name:'step-input.json',bytes:original.body.length,sha256:digest(original.body)},createdAt:time()};
   stepRecord(record,programme,stepId);
   await retainCustomerBytes(target,'step-input.json',original.body);await save(target,'step.json',record);
  }
  const factory=async()=>(await connect(client,programme.workspaceId,signal)).client;
  await submitResearchQuote({client:factory,directory:join(target,'operation'),
   ...record.selection,inputFile:join(target,'step-input.json'),input:undefined,signal});
  return readResearchQuoteProgrammeStepIn(root,programme,stepId);
 });
}
/** Apply exactly the retained review; its complete source step stays independently reopenable. */
export async function applyResearchQuoteProgrammeReview({client,directory,sourceStepId,stepId,reviewSha256,signal}={}){
 researchQuoteProgrammeStepId(sourceStepId);researchQuoteProgrammeStepId(stepId);hash(reviewSha256);
 need(sourceStepId!==stepId,'RESEARCH_QUOTE_PROGRAMME_DISTINCT_STEP_REQUIRED');
 const source=await readResearchQuoteProgrammeStep({directory,stepId:sourceStepId}),next=source.summary.next;
 need(next?.input.reviewSha256===reviewSha256,'RESEARCH_QUOTE_REVIEW_CHANGED');
 return submitResearchQuoteProgramme({client,directory,stepId,command:next.command,input:next.input,signal});
}
/** Explicit replay reaches the original native request through a separate retained attempt. */
export async function replayResearchQuoteProgramme({client,directory,sourceStepId,stepId,signal}={}){
 researchQuoteProgrammeStepId(sourceStepId);researchQuoteProgrammeStepId(stepId);
 need(sourceStepId!==stepId,'RESEARCH_QUOTE_PROGRAMME_DISTINCT_STEP_REQUIRED');
 const root=await customerDirectory(directory,{create:false});
 return withCustomerOperation(root,async()=>{
  const programme=await readResearchQuoteProgrammeHeader(root),
   source=await readResearchQuoteProgrammeStepIn(root,programme,sourceStepId);
  need(source.native?.request,'RESEARCH_QUOTE_PROGRAMME_ORIGINAL_REQUEST_REQUIRED');
  const target=await customerDirectory(join(root,'steps',stepId));
  let record=await readResearchQuoteProgrammeJson(target,'step.json');
  if(record){
   stepRecord(record,programme,stepId);
   need(record.replayOf===sourceStepId&&same(record.selection,source.record.selection)&&
    same(record.inputFile,source.record.inputFile),'RESEARCH_QUOTE_PROGRAMME_REPLAY_CHANGED');
  }else{
   need((await readdir(join(root,'steps'))).filter(key=>STEP_KEY.test(key)).length<=RESEARCH_QUOTE_PROGRAMME_LIMIT,
    'RESEARCH_QUOTE_PROGRAMME_STEP_LIMIT');
   const original=await readResearchHostFile(join(source.directory,'step-input.json'),inputLimit(source.record.selection.command),
    {sha256:source.record.inputFile.sha256});
   record={...clone(source.record),stepId,replayOf:sourceStepId,createdAt:time()};
   await retainCustomerBytes(target,'step-input.json',original);await save(target,'step.json',record);
  }
  const factory=async()=>(await connect(client,programme.workspaceId,signal)).client;
  await replayResearchQuote({client:factory,directory:join(target,'operation'),
   sourceDirectory:join(source.directory,'operation'),signal});
  return readResearchQuoteProgrammeStepIn(root,programme,stepId);
 });
}
