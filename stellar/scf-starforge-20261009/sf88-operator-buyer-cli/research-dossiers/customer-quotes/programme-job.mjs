// MIT. Shared original job selection; native engines validate their complete phase inputs.
import {fields,id,hash,need} from './contracts.mjs';
import {captureResearchQuoteInput,RESEARCH_QUOTES_CASE_ACTIONS,RESEARCH_QUOTES_PRICING_ACTIONS} from './client.mjs';
import {RESEARCH_QUOTES_WRITES} from './operator.mjs';
import {caseTransferInput} from './case-transfer.mjs';
import {researchQuoteProgrammeInput,researchQuoteProgrammeStepId} from './programme.mjs';
import {researchQuoteProgrammeReceivingInput} from './programme-receiving.mjs';

export const RESEARCH_QUOTE_PROGRAMME_JOB_FIELDS={
 CREATE:['value'],SUBMIT:['programmeId','stepId','command','value','action','profile'],
 APPLY:['programmeId','sourceStepId','stepId','reviewSha256'],REPLAY:['programmeId','sourceStepId','stepId'],
 EXPORT:['programmeId','value'],IMPORT:['uploadId','manifestSha256'],ARCHIVE:['bundleId','manifestSha256'],
 RECEIVE_REVIEW:['bundleId','manifestSha256','value'],RECEIVE:['receivingId','reviewSha256']
};
const REQUIRED={CREATE:['value'],SUBMIT:['programmeId','stepId','command','value'],APPLY:RESEARCH_QUOTE_PROGRAMME_JOB_FIELDS.APPLY,REPLAY:RESEARCH_QUOTE_PROGRAMME_JOB_FIELDS.REPLAY,
 EXPORT:RESEARCH_QUOTE_PROGRAMME_JOB_FIELDS.EXPORT,IMPORT:['uploadId'],ARCHIVE:RESEARCH_QUOTE_PROGRAMME_JOB_FIELDS.ARCHIVE,RECEIVE_REVIEW:RESEARCH_QUOTE_PROGRAMME_JOB_FIELDS.RECEIVE_REVIEW,RECEIVE:RESEARCH_QUOTE_PROGRAMME_JOB_FIELDS.RECEIVE};
export function researchQuoteProgrammeJobInput(value){
 need(value&&typeof value==='object'&&!Array.isArray(value),'RESEARCH_QUOTE_PROGRAMME_JOB_REQUIRED');
 const {value:input,...outer}=value,selected=captureResearchQuoteInput(outer);
 need(Object.hasOwn(RESEARCH_QUOTE_PROGRAMME_JOB_FIELDS,selected.kind),'RESEARCH_QUOTE_PROGRAMME_JOB_KIND_REQUIRED');
 fields(value,['id','kind',...RESEARCH_QUOTE_PROGRAMME_JOB_FIELDS[selected.kind]],['id','kind',...REQUIRED[selected.kind]]);
 id(selected.id);
 for(const key of ['programmeId','uploadId','bundleId','receivingId'])if(selected[key]!==undefined)id(selected[key]);
 for(const key of ['stepId','sourceStepId'])if(selected[key]!==undefined)researchQuoteProgrammeStepId(selected[key]);
 for(const key of ['reviewSha256','manifestSha256'])if(selected[key]!==undefined)hash(selected[key]);
 if(selected.stepId&&selected.sourceStepId)need(selected.stepId!==selected.sourceStepId,
  'RESEARCH_QUOTE_PROGRAMME_DISTINCT_STEP_REQUIRED');
 if(selected.kind==='CREATE')selected.value=researchQuoteProgrammeInput(input);
 else if(selected.kind==='SUBMIT'){
  need(RESEARCH_QUOTES_WRITES.includes(selected.command),'RESEARCH_QUOTE_PROGRAMME_COMMAND_REQUIRED');
  selected.value=selected.command==='prepare-case-transfer'?caseTransferInput(input):captureResearchQuoteInput(input);
  if(selected.command==='native-case')need(RESEARCH_QUOTES_CASE_ACTIONS.includes(selected.action),
   'RESEARCH_QUOTE_CASE_ACTION_REQUIRED');
  else if(selected.command==='pricing')need(RESEARCH_QUOTES_PRICING_ACTIONS.includes(selected.action)&&
   typeof selected.profile==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(selected.profile),'RESEARCH_QUOTE_PRICING_ACTION_REQUIRED');
  else need(selected.action===undefined&&selected.profile===undefined,'RESEARCH_QUOTE_PROGRAMME_JOB_CHANGED');
 }else if(selected.kind==='EXPORT'){
  selected.value=captureResearchQuoteInput(input);
  fields(selected.value,['schema','requestId','caseRevision','deliveryId','revision','sourceWorkspace','stepIds']);
  need(selected.value.requestId===selected.id,'RESEARCH_QUOTE_PROGRAMME_JOB_CHANGED');
 }else if(selected.kind==='RECEIVE_REVIEW'){
  selected.value=researchQuoteProgrammeReceivingInput(input);
  need(selected.value.requestId===selected.id,'RESEARCH_QUOTE_PROGRAMME_JOB_CHANGED');
 }
 return selected;
}
