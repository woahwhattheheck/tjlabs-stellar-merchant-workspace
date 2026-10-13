// MIT. Explicit following-edition recipient review; original review and catalogue engines remain authoritative.
import {canonical,openText} from './core.mjs';
import {sha256Utf8,utf8ByteLength} from './sha256.mjs';
import {openRecipientWorking,exportRecipientWorking,createRecipientReview,saveRecipientProposal,exportRecipientReview,compareRecipientReview,recipientView,MAX_WORKING_BYTES} from './review.mjs';
export const RENEWAL_SCHEMA='stellar-forge.material-recipient-renewal.v1';
export const MAX_RENEWAL_BYTES=MAX_WORKING_BYTES;
const parsedModels=new WeakSet();
const hash=value=>sha256Utf8(typeof value==='string'?value:canonical(value)).sha256;
const copy=value=>JSON.parse(JSON.stringify(value));
const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'RENEWAL_INVALID'});};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const same=(a,b)=>canonical(a)===canonical(b);
const stamp=x=>{need(typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x,'Use an exact ISO timestamp.');return x;};
const identifier=x=>{need(typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(x),'Keep the original named review identifier.');return x;};
const text=(x,label,max,required=true)=>{need(typeof x==='string'&&x.length<=max&&!x.includes('\0')&&(!required||x.trim()),label+' is invalid.');utf8ByteLength(x);return x;};
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
function seal(value){const {sha256,...body}=value;return freeze({...body,sha256:hash(body)});}
function editable(value){need(object(value)&&Object.keys(value).every(k=>['disposition','materialKey','status','note','reason','search'].includes(k)),'Unknown re-review form field.');for(const [k,v]of Object.entries(value))text(v,k,k==='reason'||k==='note'?3000:k==='search'?200:96,false);return value;}
function rowFor(model,id){const row=model.comparison.rows.find(r=>r.id===id);need(row,'The original proposal is missing.');return row;}
function choiceFor(model,id,value){
 const row=rowFor(model,id);editable(value);
 need(['carry','revise','omit'].includes(value.disposition),'Choose carry, revise or leave out explicitly.');
 text(value.reason,'Reason for this re-review choice',3000);
 if(value.disposition==='carry')need(row.eligible,'The original material changed or is absent; explicitly choose a current material or leave this proposal out.');
 if(value.disposition==='revise'){
  need(model.next.materials.get(model.next.catalog.activeEditionId)?.has(value.materialKey),'Choose an actual material from the following edition.');
  need(['APPROVED','REJECTED'].includes(value.status),'Choose the new proposed decision explicitly.');
  text(value.note,'New review reason',3000);
 }
 return copy(value);
}
function resultingReview(model,choices,{id,at,reviewer}){
 let review=createRecipientReview(model.next,{id:identifier(id),at:stamp(at),reviewer:text(reviewer,'Reviewer',160)});
 need(at>=model.value.createdAt,'A new return cannot predate this re-review.');
 for(const row of model.comparison.rows){
  const choice=choices[row.id];need(choice,'Review every original context before completing the new return.');choiceFor(model,row.id,choice);
  if(choice.disposition==='omit')continue;
  const p=row.proposal;
  review=saveRecipientProposal(review,model.next,{customerId:p.customerId,description:p.description,
   materialKey:choice.disposition==='carry'?p.material.key:choice.materialKey,
   status:choice.disposition==='carry'?p.status:choice.status,
   note:choice.disposition==='carry'?p.note:choice.note},{at});
 }
 exportRecipientReview(review);return review;
}
function known(model){need(parsedModels.has(model),'Open the complete original re-review working file first.');return model;}
function modelFrom(value,previous,next,comparison){
 const model=Object.freeze({value:freeze(value),previous,next,comparison:freeze(comparison)});
 parsedModels.add(model);return model;
}
function withValue(model,value){
 known(model);
 const sealed=seal(value);need(utf8ByteLength(JSON.stringify(sealed)+'\n')<=MAX_RENEWAL_BYTES,'The complete re-review exceeds 400 MiB. Save the retained complete work; no source or history was discarded.');
 return modelFrom(sealed,model.previous,model.next,model.comparison);
}
export function beginRecipientRenewal(previousWorkingText,followingText,{id,reviewer,at,name='following-catalogue.jsonl'}){
 const previous=openRecipientWorking(previousWorkingText);
 need(previous.review&&previous.review.entries.length,'Keep a complete prior named review with at least one proposed context.');
 const next=openText(followingText,{name});
 need(next.catalog.id===previous.bundle.catalog.id&&next.catalog.tenantId===previous.bundle.catalog.tenantId,'Select a following bundle of the same original catalogue and tenant.');
 need(next.catalog.revision>=previous.bundle.catalog.revision&&next.catalog.activeEditionId&&next.catalog.activeEditionId!==previous.review.base.edition.id,'Select an explicitly following, different active catalogue edition.');
 // The unchanged comparison verifies every original reviewed catalogue/material/decision revision.
 const comparison=compareRecipientReview(recipientView(next),previous.review);
 const mutable=new Set(['catalog_catalogs','catalog_decisions','catalog_supplier_plans','catalog_supplier_corrections']);
 for(const [table,rows]of Object.entries(previous.bundle.tables)){
  if(mutable.has(table))continue;
  const retained=new Set(next.tables[table].map(row=>canonical(row)));
  for(const row of rows)need(retained.has(canonical(row)),'The following catalogue omits or changes original retained history: '+table);
 }
 for(const[id,source]of previous.bundle.sources)need(next.sources.get(id)?.manifest.sha256===source.manifest.sha256,'The following catalogue omits an original source file.');
 const value=seal({schema:RENEWAL_SCHEMA,id:identifier(id),createdAt:stamp(at),reviewer:text(reviewer,'Reviewer',160),
  previous:{text:previousWorkingText,bytes:utf8ByteLength(previousWorkingText),sha256:hash(previousWorkingText)},
  following:{name:next.name,text:followingText,bytes:next.identity.bytes,sha256:next.identity.sha256},
  comparisonSha256:comparison.sha256,drafts:{},choices:{},history:[],completions:[]});
 need(at>=previous.review.createdAt&&at>=next.editions.get(next.catalog.activeEditionId).createdAt,'The re-review predates an input.');
 const model=modelFrom(value,previous,next,comparison);
 return withValue(model,value);
}
export function openRecipientRenewal(source){
 need(typeof source==='string'&&utf8ByteLength(source)<=MAX_RENEWAL_BYTES,'Choose a complete re-review working file of at most 400 MiB.');
 let value;try{value=JSON.parse(source);}catch{need(false,'The re-review working file is not complete JSON.');}
 need(object(value)&&value.schema===RENEWAL_SCHEMA,'Choose a complete following-edition review.');
 const {sha256,...body}=value;need(sha256===hash(body),'The complete retained re-review changed.');
 need(object(value.previous)&&object(value.following),'Both complete original source files are required.');
 need(value.previous.bytes===utf8ByteLength(value.previous.text)&&value.previous.sha256===hash(value.previous.text),'The prior complete working review differs.');
 const base=beginRecipientRenewal(value.previous.text,value.following.text,{id:value.id,reviewer:value.reviewer,at:value.createdAt,name:value.following.name});
 need(same(base.value.following,value.following)&&base.comparison.sha256===value.comparisonSha256,'The following catalogue or full original comparison differs.');
 need(object(value.drafts)&&object(value.choices)&&Array.isArray(value.history)&&Array.isArray(value.completions)&&value.history.length<=10000&&value.completions.length<=100,'Keep complete re-review history within its stated limits.');
 const needed=new Set(value.completions.map(x=>x.sequence));
 const choices={},prefixes=new Map();if(needed.has(0))prefixes.set(0,{});let prior=null,lastAt=value.createdAt;
 for(let i=0;i<value.history.length;i++){
  const event=value.history[i];need(object(event),'Invalid choice history.');
  const {sha256:eh,...eb}=event;need(event.sequence===i+1&&event.previous===prior&&eh===hash(eb),'The original choice history differs.');
  stamp(event.at);need(event.at>=lastAt,'Choice history time moved backwards.');
  need(same(event.before,choices[event.id]??null),'An earlier complete choice is missing.');
  choiceFor(base,event.id,event.after);choices[event.id]=event.after;prior=eh;lastAt=event.at;
  if(needed.has(i+1))prefixes.set(i+1,{...choices});
 }
 need(same(choices,value.choices),'Current choices differ from complete history.');
 for(const[id,draft]of Object.entries(value.drafts)){rowFor(base,id);editable(draft);}
 const ids=new Set();
 for(const result of value.completions){
  need(object(result)&&Number.isSafeInteger(result.sequence)&&prefixes.has(result.sequence),'A completed return has no original choice revision.');
  identifier(result.id);need(!ids.has(result.id),'A complete return identifier appears twice.');ids.add(result.id);
  const expected=resultingReview(base,prefixes.get(result.sequence),result);
  need(result.at>=(value.history[result.sequence-1]?.at??value.createdAt)&&same(expected,result.review),'A completed new review differs from its original decisions.');
 }
 return modelFrom(value,base.previous,base.next,base.comparison);
}
export function editRecipientRenewal(model,id,draft){
 known(model);rowFor(model,id);editable(draft);
 return withValue(model,{...model.value,drafts:{...model.value.drafts,[id]:copy(draft)}});
}
export function saveRecipientRenewalChoice(model,id,choice,{at}){
 known(model);choiceFor(model,id,choice);stamp(at);
 need(model.value.history.length<10000,'Save the complete original re-review; its 10,000-choice-history limit has been reached.');
 need(at>=(model.value.history.at(-1)?.at??model.value.createdAt),'Choice time moved backwards.');
 const before=model.value.choices[id]??null,after=copy(choice);
 if(same(before,after))return model;
 const event=seal({sequence:model.value.history.length+1,previous:model.value.history.at(-1)?.sha256??null,id,before,after,at});
 return withValue(model,{...model.value,choices:{...model.value.choices,[id]:after},drafts:{...model.value.drafts,[id]:after},history:[...model.value.history,event]});
}
export function completeRecipientRenewal(model,{id,at,reviewer=model?.value?.reviewer}){
 known(model);need(model.value.completions.length<100,'Save the complete original re-review; its 100-completed-return limit has been reached.');
 const sequence=model.value.history.length;
 for(const row of model.comparison.rows)need(same(model.value.drafts[row.id]??model.value.choices[row.id],model.value.choices[row.id]),'Save the current unfinished choice for every context before completing.');
 const last=model.value.completions.at(-1);
 if(last?.sequence===sequence&&last.reviewer===reviewer)return model;
 need(!model.value.completions.some(x=>x.id===id),'Keep every original completed return identifier.');
 need(stamp(at)>=(model.value.history.at(-1)?.at??model.value.createdAt),'Completion time moved backwards.');
 const review=resultingReview(model,model.value.choices,{id,at,reviewer});
 return withValue(model,{...model.value,completions:[...model.value.completions,{id,at,reviewer,sequence,review}]});
}
export function exportRecipientRenewal(model){known(model);return JSON.stringify(model.value)+'\n';}
export function recipientRenewalWorking(model,index=model.value.completions.length-1){
 known(model);const result=model.value.completions[index];need(result,'Select a complete new review.');
 return exportRecipientWorking(model.next,result.review,{},null);
}
export function recipientRenewalReport(model){
 known(model);return {schema:'stellar-forge.material-recipient-renewal-report.v1',renewalId:model.value.id,
  originalWorking:{bytes:model.value.previous.bytes,sha256:model.value.previous.sha256},following:{name:model.next.name,...model.next.identity},
  originalReview:model.previous.review,comparison:model.comparison,choices:model.value.choices,drafts:model.value.drafts,
  history:model.value.history,completions:model.value.completions,
  interpretation:'A retained recipient re-review. Carry and revise produce new proposals only; omission is not rejection or deletion. Original author receiving still requires a fresh comparison and explicit original request.'};
}
