// MIT. Receive the whole original case and customer dossier with their existing writers.
import {join,resolve} from 'node:path';
import {exists,digest} from '../../node/store.mjs';
import {readResearchHostFile} from '../workspace-files.mjs';
import {customerDirectory,withCustomerOperation,readCustomerJson,retainCustomerBytes} from '../customer-updates/files.mjs';
import {receiveCustomerHandover} from '../customer-updates/operator.mjs';
import {QUOTE_REQUEST_LIMIT,QUOTE_FILE_LIMIT,fields,id,hash,need,same,fingerprint} from './contracts.mjs';
import {captureResearchQuoteInput,validateResearchQuoteOperation} from './client.mjs';
import {caseTransferSelection} from './case-transfer.mjs';
import {submitResearchQuote,readResearchQuoteRun} from './operator.mjs';
import {readResearchQuoteProgrammeJson} from './programme.mjs';
import {copyResearchQuoteHandover,inspectResearchQuoteHandover,researchQuoteDistinctDirectories} from './programme-files.mjs';

export const RESEARCH_QUOTE_PROGRAMME_RECEIVING='sf88-research-quotation-programme-receiving/v1';
const REQUEST='sf88-research-quotation-programme-receiving-request/v1',
 REVIEW='sf88-research-quotation-programme-receiving-review/v1',
 RESULT='sf88-research-quotation-programme-received/v1';
const bytes=value=>Buffer.from(JSON.stringify(value));
const clone=value=>JSON.parse(JSON.stringify(value));
const workspace=value=>need(/^research_[a-f0-9]{64}$/.test(value??''),'RESEARCH_QUOTE_PROGRAMME_WORKSPACE_REQUIRED');
async function retain(root,name,value){
 const body=bytes(value);need(body.length<=QUOTE_FILE_LIMIT,'RESEARCH_QUOTE_PROGRAMME_RECEIVING_LIMIT',413);
 return retainCustomerBytes(root,name,body);
}
export function researchQuoteProgrammeReceivingInput(value){
 const input=captureResearchQuoteInput(value);
 fields(input,['schema','requestId','expectedWorkspaceId','expectedCasesWorkspaceId','expectedRevision','sourceActor']);
 need(input.schema===RESEARCH_QUOTE_PROGRAMME_RECEIVING,'RESEARCH_QUOTE_PROGRAMME_RECEIVING_INPUT_REQUIRED');
 id(input.requestId);workspace(input.expectedWorkspaceId);hash(input.expectedCasesWorkspaceId);
 if(input.expectedRevision!==null)hash(input.expectedRevision);
 need(input.sourceActor===null||typeof input.sourceActor==='string'&&input.sourceActor.trim()&&input.sourceActor.length<=200&&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.sourceActor),'RESEARCH_QUOTE_PROGRAMME_SOURCE_ACTOR_REQUIRED');
 return input;
}
function requestRecord(record){
 need(record?.schema===REQUEST&&record.requestSha256===fingerprint(researchQuoteProgrammeReceivingInput(record.input))&&
  record.sourceSha256===fingerprint(record.source)&&record.inputFile?.name==='receiving-input.json'&&
  Number.isSafeInteger(record.inputFile.bytes)&&record.inputFile.bytes>0&&record.inputFile.bytes<=QUOTE_REQUEST_LIMIT,
  'RESEARCH_QUOTE_PROGRAMME_RECEIVING_CHANGED');
 hash(record.manifestSha256);hash(record.inputFile.sha256);return record;
}
function nativeTransfer(operation,request,{complete=false}={}){
 validateResearchQuoteOperation(operation,{requestId:request.input.requestId,kind:'CASE_TRANSFER'});
 need(operation.workspaceId===request.input.expectedWorkspaceId&&
  operation.casesWorkspaceId===request.input.expectedCasesWorkspaceId&&
  operation.request.caseId===request.source.caseId&&operation.request.expectedRevision===request.input.expectedRevision&&
  operation.review&&(!complete||operation.status==='COMPLETE'),
  'RESEARCH_QUOTE_PROGRAMME_CASE_RECEIVING_CHANGED');
 return operation;
}
function reviewRecord(value,request){
 const {reviewSha256,...proof}=value??{};
 hash(reviewSha256);
 need(proof.schema===REVIEW&&fingerprint(proof)===reviewSha256&&proof.requestSha256===request.requestSha256&&
  proof.manifestSha256===request.manifestSha256&&same(proof.source,request.source)&&
  proof.workspaceId===request.input.expectedWorkspaceId&&proof.casesWorkspaceId===request.input.expectedCasesWorkspaceId&&
  same(proof.customer,request.source.customer)&&proof.sourceActor===request.input.sourceActor,
  'RESEARCH_QUOTE_PROGRAMME_RECEIVING_REVIEW_CHANGED');
 const operation=nativeTransfer(proof.caseTransfer.operation,request);
 need(proof.caseTransfer.id===operation.id&&proof.caseTransfer.reviewSha256===operation.review.reviewSha256,
  'RESEARCH_QUOTE_PROGRAMME_RECEIVING_REVIEW_CHANGED');
 return value;
}
function resultRecord(value,request,review){
 need(value?.schema===RESULT&&value.manifestSha256===request.manifestSha256&&value.requestSha256===request.requestSha256&&
  value.reviewSha256===review.reviewSha256&&value.workspaceId===request.input.expectedWorkspaceId&&
  value.casesWorkspaceId===request.input.expectedCasesWorkspaceId&&same(value.source,request.source),
  'RESEARCH_QUOTE_PROGRAMME_RECEIVING_RESULT_CHANGED');
 nativeTransfer(value.caseTransfer,request,{complete:true});
 need(value.caseTransfer.review.reviewSha256===review.caseTransfer.reviewSha256&&
  same(value.case,value.caseTransfer.result.case)&&value.case?.id===request.source.caseId&&
  value.customer?.workspaceId===value.workspaceId&&value.customer.dossierId===request.source.dossierId&&
  value.customer.projectId===request.source.projectId&&value.customer.deliveryId===request.source.deliveryId&&
  value.customer.revision===request.source.revision&&
  value.customer.manifestSha256===request.source.customer.manifestSha256,
  'RESEARCH_QUOTE_PROGRAMME_RECEIVING_RESULT_CHANGED');
 hash(value.case.revision);
 need(same(value.destination,{workspaceId:value.workspaceId,casesWorkspaceId:value.casesWorkspaceId,
  caseId:value.case.id,caseRevision:value.case.revision,dossierId:value.customer.dossierId,
  projectId:value.customer.projectId,deliveryId:value.customer.deliveryId,revision:value.customer.revision}),
  'RESEARCH_QUOTE_PROGRAMME_RECEIVING_RESULT_CHANGED');
 return value;
}
async function checkedClient(source,input,signal){
 const client=typeof source==='function'?await source():source;
 need(client&&typeof client.status==='function'&&typeof client.customerQuotes==='function'&&
  typeof client.customerUpdates==='function'&&typeof client.reopenFile==='function',
  'RESEARCH_QUOTE_PROGRAMME_ORIGINAL_CLIENT_REQUIRED');
 const status=await client.status({signal}),configuration=await client.customerQuotes().configuration({signal});
 need(status.workspaceId===input.expectedWorkspaceId&&configuration.workspaceId===input.expectedWorkspaceId&&
  configuration.cases?.workspaceId===input.expectedCasesWorkspaceId,'RESEARCH_QUOTE_PROGRAMME_RECEIVING_WORKSPACE_CHANGED');
 return client;
}
function lazyReceiver(source,input,signal){
 let original;
 const connect=()=>original??=checkedClient(source,input,signal);
 const scope=method=>new Proxy({}, {get:(_,key)=>(...args)=>connect().then(client=>client[method]()[key](...args))});
 return {status:(...args)=>connect().then(client=>client.status(...args)),
  reopenFile:(...args)=>connect().then(client=>client.reopenFile(...args)),
  customerUpdates:()=>scope('customerUpdates'),europePmc:()=>scope('europePmc')};
}
async function originalRequest(root,{input,inputFile,source}){
 let record=await readResearchQuoteProgrammeJson(root,'receiving-request.json'),body;
 if(inputFile&&await exists(inputFile))body=await readResearchHostFile(inputFile,QUOTE_REQUEST_LIMIT);
 else if(input!==undefined)body=bytes(input);
 if(record){
  requestRecord(record);
  const retained=await readResearchHostFile(join(root,'receiving-input.json'),QUOTE_REQUEST_LIMIT,{sha256:record.inputFile.sha256});
  need(retained.length===record.inputFile.bytes&&same(researchQuoteProgrammeReceivingInput(JSON.parse(retained)),record.input)&&
   record.manifestSha256===source.manifestSha256&&same(record.source,source.selection),
   'RESEARCH_QUOTE_PROGRAMME_RECEIVING_CHANGED');
  if(body)need(inputFile?body.length===record.inputFile.bytes&&digest(body)===record.inputFile.sha256:
   same(researchQuoteProgrammeReceivingInput(JSON.parse(body)),record.input),'RESEARCH_QUOTE_PROGRAMME_RECEIVING_CHANGED');
  return record;
 }
 if(!body&&await exists(join(root,'receiving-input.json')))body=await readResearchHostFile(join(root,'receiving-input.json'),QUOTE_REQUEST_LIMIT);
 need(body?.length,'RESEARCH_QUOTE_PROGRAMME_RECEIVING_INPUT_REQUIRED');
 const selected=researchQuoteProgrammeReceivingInput(JSON.parse(body));
 need(!source.selection.customer.selection.sourceWorkspace||selected.sourceActor!==null,
  'RESEARCH_QUOTE_PROGRAMME_SOURCE_ACTOR_REQUIRED');
 record={schema:REQUEST,input:selected,requestSha256:fingerprint(selected),source:source.selection,
  sourceSha256:fingerprint(source.selection),manifestSha256:source.manifestSha256,
  inputFile:{name:'receiving-input.json',bytes:body.length,sha256:digest(body)},createdAt:new Date().toISOString()};
 await retainCustomerBytes(root,'receiving-input.json',body);await retain(root,'receiving-request.json',record);return record;
}
async function sourcePackage(root,{sourceDirectory,manifestSha256}={}){
 const input=await customerDirectory(join(root,'input'));
 if(await exists(join(input,'quotation-programme.json'))){
  const saved=await inspectResearchQuoteHandover(input,{manifestSha256});
  if(sourceDirectory&&await exists(join(sourceDirectory,'quotation-programme.json'))){
   const source=await readCustomerJson(join(sourceDirectory,'quotation-programme.json'),QUOTE_FILE_LIMIT);
   need(source.sha256===saved.manifestSha256,'RESEARCH_QUOTE_HANDOVER_SOURCE_CHANGED');
  }
  return saved;
 }
 need(sourceDirectory,'RESEARCH_QUOTE_HANDOVER_SOURCE_REQUIRED');
 return copyResearchQuoteHandover({sourceDirectory,directory:input,manifestSha256});
}
async function state(root){
 const request=requestRecord(await readResearchQuoteProgrammeJson(root,'receiving-request.json')),
  source=await inspectResearchQuoteHandover(join(root,'input'),{manifestSha256:request.manifestSha256});
 await originalRequest(root,{source});
 const savedReview=await readResearchQuoteProgrammeJson(root,'receiving-review.json'),review=savedReview?reviewRecord(savedReview,request):null,
  savedResult=await readResearchQuoteProgrammeJson(root,'receiving-result.json');
 need(!savedResult||review,'RESEARCH_QUOTE_PROGRAMME_RECEIVING_REVIEW_CHANGED');
 const result=savedResult?resultRecord(savedResult,request,review):null;
 if(review){
  need(same(review.caseTransfer.operation.request,caseTransferSelection({requestId:request.input.requestId,
   caseId:request.source.caseId,expectedRevision:request.input.expectedRevision,source:source.caseRecord})),
   'RESEARCH_QUOTE_PROGRAMME_CASE_RECEIVING_CHANGED');
  const native=await readResearchQuoteRun(join(root,'case-review'));
  need(native.result&&same(native.result.result,review.caseTransfer.operation),'RESEARCH_QUOTE_PROGRAMME_RECEIVING_REVIEW_CHANGED');
 }
 if(result){
  const native=await readResearchQuoteRun(join(root,'case-apply'));
  need(native.result&&same(native.result.result,result.caseTransfer),'RESEARCH_QUOTE_PROGRAMME_RECEIVING_RESULT_CHANGED');
  const customer=(await readCustomerJson(join(root,'customer-receiving','result.json'),QUOTE_FILE_LIMIT)).value;
  need(same(customer,result.customer),'RESEARCH_QUOTE_PROGRAMME_RECEIVING_RESULT_CHANGED');
 }
 return {schema:RESEARCH_QUOTE_PROGRAMME_RECEIVING,directory:root,status:result?'COMPLETE':review?'REVIEWED':'PREPARING',
  request,review,result,source:{directory:source.directory,manifestSha256:source.manifestSha256,
   manifestBytes:source.manifestBytes,selection:source.selection,files:source.files}};
}
/** Complete retained donor files precede preparation in either native destination. */
export function prepareResearchQuoteProgrammeReceiving({client,directory,sourceDirectory,input,inputFile,manifestSha256,signal}={}){
 need(!(input!==undefined&&inputFile),'RESEARCH_QUOTE_SELECT_ONE_INPUT');
 const selected=input===undefined?undefined:researchQuoteProgrammeReceivingInput(input),
  file=inputFile?resolve(inputFile):null,source=sourceDirectory?resolve(sourceDirectory):null,target=resolve(directory);
 if(manifestSha256!==undefined)hash(manifestSha256);
 if(source)researchQuoteDistinctDirectories(source,target);
 return withCustomerOperation(target,async root=>{
  need(!await exists(join(root,'programme-input.json'))&&!await exists(join(root,'programme.json'))&&
   !await exists(join(root,'input.json'))&&!await exists(join(root,'request.json'))&&!await exists(join(root,'export.json'))&&
   !await exists(join(root,'package-input.json'))&&!await exists(join(root,'package-request.json'))&&
   !await exists(join(root,'quotation-programme.json'))&&!await exists(join(root,'handover-copy.json')),
   'RESEARCH_QUOTE_DISTINCT_DIRECTORY_REQUIRED');
  const incoming=await sourcePackage(root,{sourceDirectory:source,manifestSha256}),
   request=await originalRequest(root,{input:selected,inputFile:file,source:incoming}),
   saved=await readResearchQuoteProgrammeJson(root,'receiving-review.json');
  if(saved){reviewRecord(saved,request);return {...await state(root),reused:true};}
  signal?.throwIfAborted();
  const nativeInput={requestId:request.input.requestId,caseId:request.source.caseId,
   expectedRevision:request.input.expectedRevision,source:incoming.caseRecord},
   native=await submitResearchQuote({client:async()=>checkedClient(client,request.input,signal),
    directory:join(root,'case-review'),command:'prepare-case-transfer',input:nativeInput,signal}),
   operation=nativeTransfer(native.result,request);
  need(same(operation.request,caseTransferSelection(nativeInput)),'RESEARCH_QUOTE_PROGRAMME_CASE_RECEIVING_CHANGED');
  const proof={schema:REVIEW,requestSha256:request.requestSha256,manifestSha256:incoming.manifestSha256,
   source:incoming.selection,workspaceId:request.input.expectedWorkspaceId,casesWorkspaceId:request.input.expectedCasesWorkspaceId,
   caseTransfer:{id:operation.id,reviewSha256:operation.review.reviewSha256,operation:clone(operation)},
   customer:incoming.selection.customer,sourceActor:request.input.sourceActor,createdAt:request.createdAt};
  const review={...proof,reviewSha256:fingerprint(proof)};
  reviewRecord(review,request);await retain(root,'receiving-review.json',review);return {...await state(root),reused:false};
 });
}
/** Resume the same original case save, then the same complete customer receiver. */
export function receiveResearchQuoteProgramme({client,directory,reviewSha256,signal}={}){
 hash(reviewSha256);
 return withCustomerOperation(directory,async root=>{
  const current=await state(root),request=current.request,review=current.review;
  need(review?.reviewSha256===reviewSha256,'RESEARCH_QUOTE_PROGRAMME_RECEIVING_REVIEW_CHANGED');
  if(current.result)return {...current.result,directory:root,sourceDirectory:join(root,'input'),reused:true};
  try{
   signal?.throwIfAborted();
   const applied=await submitResearchQuote({client:async()=>checkedClient(client,request.input,signal),
    directory:join(root,'case-apply'),command:'apply-case-transfer',
    input:{id:review.caseTransfer.id,reviewSha256:review.caseTransfer.reviewSha256},signal}),
    caseTransfer=nativeTransfer(applied.result,request,{complete:true});
   need(caseTransfer.review.reviewSha256===review.caseTransfer.reviewSha256&&
    caseTransfer.result.case?.id===request.source.caseId,'RESEARCH_QUOTE_PROGRAMME_CASE_RECEIVING_CHANGED');
   signal?.throwIfAborted();
   const received=await receiveCustomerHandover({client:lazyReceiver(client,request.input,signal),
    directory:join(root,'customer-receiving'),sourceDirectory:join(root,'input','customer'),
    manifestSha256:request.source.customer.manifestSha256,sourceActor:request.input.sourceActor??undefined}),
    {directory:originalDirectory,reused:originalReused,...customer}=received;
   const destination={workspaceId:request.input.expectedWorkspaceId,casesWorkspaceId:request.input.expectedCasesWorkspaceId,
    caseId:caseTransfer.result.case.id,caseRevision:caseTransfer.result.case.revision,dossierId:customer.dossierId,
    projectId:customer.projectId,deliveryId:customer.deliveryId,revision:customer.revision};
   const result={schema:RESULT,requestSha256:request.requestSha256,manifestSha256:request.manifestSha256,
    reviewSha256,workspaceId:request.input.expectedWorkspaceId,casesWorkspaceId:request.input.expectedCasesWorkspaceId,
    source:request.source,destination,case:clone(caseTransfer.result.case),caseTransfer:clone(caseTransfer),customer,
    completedAt:customer.completedAt};
   resultRecord(result,request,review);await retain(root,'receiving-result.json',result);
   return {...result,directory:root,sourceDirectory:join(root,'input'),reused:false};
  }catch(error){
   error.researchQuoteProgrammeReceiving={directory:root,reviewSha256,manifestSha256:request.manifestSha256,
    caseRequestId:request.input.requestId,sourceDirectory:join(root,'input')};throw error;
  }
 });
}
export async function readResearchQuoteProgrammeReceiving(directory){
 const root=await customerDirectory(directory,{create:false});return withCustomerOperation(root,()=>state(root));
}
