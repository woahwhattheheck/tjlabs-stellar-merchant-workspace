// MIT. Agent catalogue for original invoice intake and complete project handover.
import {MAX_RETAINED_CHUNK_BYTES} from './retained-file-contracts.mjs';
export const MERCHANT_INVOICE_PREFIX='merchant_invoice_';
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const sha={type:'string',pattern:'^[a-f0-9]{64}$'};
const id={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'};
const text={type:'string',maxLength:256};
const source={type:'object',properties:{name:{type:'string',minLength:1,maxLength:200},format:{type:'string',enum:['csv','json']},
 text:{type:'string',maxLength:1048576}},required:['name','format','text'],additionalProperties:false};
const mapping={type:'object',properties:{...Object.fromEntries(['key','reference','title','assetId','amount','invoiceId'].map(k=>[k,text])),
 amountMode:{type:'string',enum:['atomic','decimal']}},required:['key','reference','title','assetId','amount','amountMode'],additionalProperties:false};
const selection={type:'object',properties:Object.fromEntries(['q','state','from','to','assetId','network'].map(k=>[k,text])),additionalProperties:false};
const defs={
 merchants:[{},[],'List configured live Merchant owner aliases, pinned connection identity and host-selected input names.'],
 context:[{merchant:alias},['merchant'],'Retain the complete original intake context and current configuration; returns its original configuration digest for review.'],
 source:[{merchant:alias,source,sourceFile:alias},['merchant'],'Inspect exact CSV/JSON bytes with the original server parser. Supply source or a configured sourceFile alias. Returns columns and full source artifact.'],
 prepare:[{merchant:alias,operation:id,configurationSha256:sha,sourceSha256:sha,source,sourceFile:alias,mapping},
 ['merchant','operation','configurationSha256','sourceSha256','mapping'],'Retain the complete original request, then prepare the same original intake once. Review its saved plan before run.'],
 resume_prepare:[{merchant:alias,operation:id,expectedRequestSha256:sha},['merchant','operation','expectedRequestSha256'],
 'Explicitly resend the byte-selected retained original preparation after inspecting status. Reuses its original source, mapping, owner and operation.'],
 status:[{merchant:alias,operation:id},['merchant','operation'],'Read the original intake status and retain all normalized invoices, source selection and progress. Use after an uncertain preparation or run.'],
 intakes:[{merchant:alias,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:50}},['merchant'],
 'Page the current original intake list and retain its complete snapshot. Offset refers to this call’s list; use the full artifact for a stable complete list.'],
 plan:[{merchant:alias,operation:id},['merchant','operation'],'Retain the complete original plan, full CSV/JSON source, configuration and current status as one artifact for review.'],
 run:[{merchant:alias,operation:id,expectedPlanSha256:sha},['merchant','operation','expectedPlanSha256'],
 'Create or recover the reviewed plan’s original local invoice drafts using the maintained owner. The original engine never charges or authorizes payment.'],
 register:[{merchant:alias,selection,limit:{type:'integer',minimum:1,maximum:200},cursor:text,revision:text},['merchant'],
 'Read an original revision-pinned invoice page. Preserve its source revision and cursor across pages.'],
 invoice:[{merchant:alias,invoiceId:id},['merchant','invoiceId'],'Retain the original complete invoice and history; returns its concise state.'],
 envelope:[{merchant:alias,invoiceId:id},['merchant','invoiceId'],'Retain the original payment request envelope for an existing invoice.'],
 result:[{merchant:alias,invoiceId:id},['merchant','invoiceId'],'Retain the whole original completed result through the maintained verified download.'],
 register_export:[{merchant:alias,selection,revision:text,format:{type:'string',enum:['csv','json']}},['merchant','revision','format'],
 'Retain a complete original invoice register JSON/CSV from the reviewed selection and revision.'],
 project:[{merchant:alias},['merchant'],'Inspect the original owner’s complete project export capability.'],
 project_begin:[{merchant:alias,operation:id},['merchant','operation'],'Retain the original project request UUID, then ask the existing owner to prepare its complete handover once.'],
 project_status:[{merchant:alias,operation:id},['merchant','operation'],'Read the same original project operation after preparation or interruption.'],
 project_manifest:[{merchant:alias,operation:id},['merchant','operation'],'Retain the full original completed project manifest.'],
 project_download:[{merchant:alias,operation:id},['merchant','operation'],'Retain the complete SHA-verified project ZIP, ready for the original Applications project intake.'],
 artifacts:[{merchant:alias,after:sha,limit:{type:'integer',minimum:1,maximum:50}},['merchant'],
 'Page complete input, request, plan and delivery artifacts, including after the server stops.'],
 file:[{merchant:alias,artifactId:sha,expectedSha256:sha,readId:text,offset:{type:'integer',minimum:0},
 limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}},['merchant','artifactId'],
 'Read exact artifact bytes using original descriptor ownership, SHA and offset. Continue until nextOffset is null.'],
 file_release:[{merchant:alias,readId:text},['merchant','readId'],'Release one temporary artifact descriptor while preserving its complete retained bytes.'],
};
const mutation=new Set(['prepare','resume_prepare','run','project_begin']);
export function merchantInvoiceTools(tool) {
 return Object.entries(defs).map(([k,[properties,required,description]])=>
  tool(MERCHANT_INVOICE_PREFIX+k,description,properties,required,{readOnly:!mutation.has(k),idempotent:true,openWorld:false}));
}
function valid(v,s) {
 if(s.type==='string')return typeof v==='string'&&(!s.pattern||new RegExp(s.pattern).test(v))&&
  (s.minLength===undefined||v.length>=s.minLength)&&(s.maxLength===undefined||v.length<=s.maxLength)&&(!s.enum||s.enum.includes(v));
 if(s.type==='integer')return Number.isSafeInteger(v)&&v>=s.minimum&&(s.maximum===undefined||v<=s.maximum);
 if(s.type==='object')return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  (s.required??[]).every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>Object.hasOwn(s.properties,k)&&valid(v[k],s.properties[k]));
 return false;
}
export function merchantInvoiceArguments(kind,value) {
 const d=defs[kind];
 if(!d||value===null||typeof value!=='object'||Array.isArray(value)||!d[1].every(k=>Object.hasOwn(value,k))||
  !Object.keys(value).every(k=>Object.hasOwn(d[0],k)&&valid(value[k],d[0][k])))
  throw Object.assign(new TypeError('Use the declared original Merchant invoice arguments.'),{code:'MERCHANT_INVOICE_ARGUMENTS'});
 return structuredClone(value);
}
