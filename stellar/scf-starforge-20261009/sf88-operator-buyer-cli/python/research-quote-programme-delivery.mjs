// MIT. Python programme operations delegate to the retained original Node engines.
import {join,isAbsolute} from 'node:path';
import {readResearchHostFile} from '../research-dossiers/workspace-files.mjs';
import {digest} from '../node/store.mjs';
import {describeCustomerFile} from '../research-dossiers/customer-updates/files.mjs';
import {QUOTE_REQUEST_LIMIT,QUOTE_FILE_LIMIT,QUOTE_CASE_TRANSFER_LIMIT,need,hash}
 from '../research-dossiers/customer-quotes/contracts.mjs';
import {createResearchQuoteProgramme,readResearchQuoteProgramme,readResearchQuoteProgrammeStep,
 submitResearchQuoteProgramme,applyResearchQuoteProgrammeReview,replayResearchQuoteProgramme}
 from '../research-dossiers/customer-quotes/programme.mjs';
import {createResearchQuoteHandover,inspectResearchQuoteHandover,copyResearchQuoteHandover}
 from '../research-dossiers/customer-quotes/programme-files.mjs';
import {prepareResearchQuoteProgrammeReceiving,receiveResearchQuoteProgramme,readResearchQuoteProgrammeReceiving}
 from '../research-dossiers/customer-quotes/programme-receiving.mjs';
import {runResearchQuotePythonCall} from './research-quotes-delivery.mjs';

const INPUT=['inputFile','inputSha256','inputBytes'];
const allowed=Object.freeze({
 'quotes-programme-create':['directory',...INPUT],
 'quotes-programme-state':['directory'],
 'quotes-programme-step':['directory','stepId'],
 'quotes-programme-submit':['directory','stepId','command','action','profile',...INPUT],
 'quotes-programme-apply':['directory','sourceStepId','stepId','reviewSha256'],
 'quotes-programme-replay':['directory','sourceStepId','stepId'],
 'quotes-programme-export':['directory',...INPUT],
 'quotes-programme-inspect':['directory','manifestSha256'],
 'quotes-programme-copy':['directory','sourceDirectory','manifestSha256'],
 'quotes-programme-receive-prepare':['directory','sourceDirectory','manifestSha256',...INPUT],
 'quotes-programme-receive':['directory','reviewSha256'],
 'quotes-programme-receiving':['directory'],
});
const local=new Set(['quotes-programme-state','quotes-programme-step','quotes-programme-inspect',
 'quotes-programme-copy','quotes-programme-receiving']);
const mutable=new Set(['quotes-programme-create','quotes-programme-submit','quotes-programme-apply',
 'quotes-programme-replay','quotes-programme-export','quotes-programme-copy',
 'quotes-programme-receive-prepare','quotes-programme-receive']);
export const isResearchQuoteProgrammeCall=action=>Object.hasOwn(allowed,action);
async function retainedInput(input){
 const maximum=input.command==='prepare-case-transfer'?QUOTE_CASE_TRANSFER_LIMIT:QUOTE_REQUEST_LIMIT;
 need(typeof input.inputFile==='string'&&isAbsolute(input.inputFile)&&
  Number.isSafeInteger(input.inputBytes)&&input.inputBytes>0&&input.inputBytes<=maximum,
  'RESEARCH_QUOTE_PYTHON_INPUT_REQUIRED');
 hash(input.inputSha256);
 const bytes=await readResearchHostFile(input.inputFile,maximum,{privateFile:true,sha256:input.inputSha256});
 need(bytes.length===input.inputBytes&&digest(bytes)===input.inputSha256,'RESEARCH_QUOTE_PYTHON_INPUT_CHANGED');
 return input.inputFile;
}
function programmeResult(value){
 need(value?.programme?.workspaceId,'RESEARCH_QUOTE_PROGRAMME_CHANGED');
 return {...value,workspaceId:value.programme.workspaceId};
}
/** The complete source remains in its original retained file, outside the JSON reply. */
async function stepResult(value){
 const {input,...record}=value,selected=value.record?.inputFile;
 need(selected?.name==='step-input.json','RESEARCH_QUOTE_PROGRAMME_STEP_CHANGED');
 const maximum=value.record.selection.command==='prepare-case-transfer'?QUOTE_CASE_TRANSFER_LIMIT:QUOTE_REQUEST_LIMIT;
 const inputFile=await describeCustomerFile(join(value.directory,selected.name),{
  sha256:selected.sha256,bytes:selected.bytes,maximum});
 return {...record,workspaceId:value.record.workspaceId,inputFile};
}
function handoverResult(value){
 const {caseRecord,operations:originalOperations,...record}=value,selected=value.selection?.caseRecord,
  caseRecordFile=value.files?.find(file=>file.name===selected?.name);
 need(caseRecordFile&&caseRecordFile.bytes===selected.bytes&&caseRecordFile.sha256===selected.sha256,
  'RESEARCH_QUOTE_HANDOVER_CASE_CHANGED');
 // Each complete native operation already belongs to its original export.json.
 // Keep one selected file per operation so a full programme never duplicates
 // every large native source body into a second response object.
 const operations=originalOperations.map(original=>{
  const selected=value.selection.operations.find(item=>item.id===original.id),
   operationFile=value.files.find(file=>file.name===selected?.name);
  need(selected&&operationFile,'RESEARCH_QUOTE_HANDOVER_OPERATION_CHANGED');
  return {...selected,directory:original.directory,files:original.files,operationFile};
 });
 return {...record,workspaceId:value.selection.workspaceId,caseRecordFile,operations};
}
function receivingResult(value){
 return {...value,workspaceId:value.workspaceId??value.request?.input.expectedWorkspaceId};
}
async function execute(action,input,original,signal,{completed=false}={}){
 const client=completed?null:original.get;
 need(typeof input.directory==='string'&&isAbsolute(input.directory),'RESEARCH_QUOTE_PROGRAMME_DIRECTORY_REQUIRED');
 switch(action){
  case 'quotes-programme-create':
   return programmeResult(await createResearchQuoteProgramme({
    client,directory:input.directory,inputFile:await retainedInput(input),signal}));
  case 'quotes-programme-state':
   return programmeResult(await readResearchQuoteProgramme(input.directory));
  case 'quotes-programme-step':
   return stepResult(await readResearchQuoteProgrammeStep(input));
  case 'quotes-programme-submit':
   return stepResult(await submitResearchQuoteProgramme({client,directory:input.directory,
    stepId:input.stepId,command:input.command,action:input.action,profile:input.profile,
    inputFile:await retainedInput(input),signal}));
  case 'quotes-programme-apply':
   if(completed)return stepResult(await readResearchQuoteProgrammeStep(input));
   return stepResult(await applyResearchQuoteProgrammeReview({...input,client,signal}));
  case 'quotes-programme-replay':
   if(completed)return stepResult(await readResearchQuoteProgrammeStep(input));
   return stepResult(await replayResearchQuoteProgramme({...input,client,signal}));
  case 'quotes-programme-export':
   return handoverResult(await createResearchQuoteHandover({
    client,directory:input.directory,inputFile:await retainedInput(input),signal}));
  case 'quotes-programme-inspect':
   return handoverResult(await inspectResearchQuoteHandover(input.directory,{manifestSha256:input.manifestSha256}));
  case 'quotes-programme-copy':
   return handoverResult(await copyResearchQuoteHandover(input));
  case 'quotes-programme-receive-prepare':
   return receivingResult(await prepareResearchQuoteProgrammeReceiving({client,directory:input.directory,
    sourceDirectory:input.sourceDirectory,manifestSha256:input.manifestSha256,
    inputFile:await retainedInput(input),signal}));
  case 'quotes-programme-receive':
   return receivingResult(await receiveResearchQuoteProgramme({...input,client,signal}));
  case 'quotes-programme-receiving':
   return receivingResult(await readResearchQuoteProgrammeReceiving(input.directory));
  default:need(false,'RESEARCH_QUOTES_PYTHON_ACTION_INVALID');
 }
}
export function runResearchQuoteProgrammeCall(request,{signal,openClient}={}){
 return runResearchQuotePythonCall(request,{signal,openClient,operations:{allowed,local,mutable,execute}});
}
