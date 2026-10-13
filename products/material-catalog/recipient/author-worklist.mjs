// MIT. Complete author worklists; catalogue adoption remains the original Journal operation.
import {canonical} from './core.mjs';
import {sha256Utf8,utf8ByteLength} from './sha256.mjs';
import {openRecipientReview,selectRecipientAdoption} from './review.mjs';
export const AUTHOR_WORKLIST_SCHEMA='stellar-forge.material-author-worklist.v1';
export const MAX_AUTHOR_WORKLIST_BYTES=128*1024*1024;
const copy=value=>JSON.parse(JSON.stringify(value));
const validated=new WeakSet(),validatedItems=new WeakSet(),itemSizes=new WeakMap();
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function editableItem(value,id){const index=value.items.findIndex(item=>item.id===id);need(index>=0,'Select the original retained return.');const old=value.items[index];return value.items[index]={...old,history:old.history.slice(),requests:old.requests.slice(),outcomes:old.outcomes.slice()};}
const hash=value=>sha256Utf8(canonical(value)).sha256;
const need=(condition,message)=>{if(!condition)throw new Error(message);};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const pretty=value=>JSON.stringify(value,null,2)+'\n';
function comparisonFor(review,value){
 need(object(value)&&value.schema==='stellar-forge.material-recipient-comparison.v1'&&Array.isArray(value.rows),'Retain the complete original comparison.');
 const {sha256,...body}=value;
 need(sha256===hash(body)&&value.returnSha256===review.sha256&&value.reviewId===review.id&&value.catalog?.id===review.base.catalog.id&&value.catalog?.tenantId===review.base.catalog.tenantId,'The retained comparison identity differs.');
 need(value.rows.length===review.entries.length&&value.rows.every((row,i)=>row.id===review.entries[i].id&&canonical(row.proposal)===canonical(review.entries[i])),'The complete comparison must retain every original proposal in order.');
}
function draftFor(review,draft){
 need(object(draft)&&object(draft.choices)&&typeof draft.actor==='string'&&draft.actor.length<=160&&typeof draft.reason==='string'&&draft.reason.length<=3000,'Retain complete bounded author choices.');
 comparisonFor(review,draft.comparison);
 for(const [id,choice]of Object.entries(draft.choices)){
  const row=draft.comparison.rows.find(row=>row.id===id);
  need(row&&['','keep','adopt'].includes(choice)&&!(choice==='adopt'&&(!row.eligible||row.unchanged)),'A saved choice does not belong to this exact comparison.');
 }
}
export function createAuthorWorklist(workspaceId){
 need(typeof workspaceId==='string'&&workspaceId.length>0&&workspaceId.length<=256,'Select the original workspace first.');
 return validateAuthorWorklist({schema:AUTHOR_WORKLIST_SCHEMA,workspaceId,items:[]});
}
export function validateAuthorWorklist(value){
 if(validated.has(value))return value;
 need(object(value)&&Object.keys(value).every(key=>['schema','workspaceId','items'].includes(key))&&value.schema===AUTHOR_WORKLIST_SCHEMA&&typeof value.workspaceId==='string'&&value.workspaceId.length>0&&value.workspaceId.length<=256&&Array.isArray(value.items),'Select a complete original author worklist.');
 need(value.items.length<=1000,'The worklist exceeds 1,000 complete returns; preserve separate full worklists.');
 const ids=new Set();let itemBytes=0;
 for(const item of value.items){
  need(object(item)&&typeof item.id==='string'&&!ids.has(item.id),'A worklist return changed or is duplicated.');ids.add(item.id);
  if(validatedItems.has(item)){itemBytes+=itemSizes.get(item);continue;}
  need(typeof item.returnText==='string'&&item.id===sha256Utf8(item.returnText).sha256,'A worklist return changed.');
  const review=openRecipientReview(item.returnText);
  need(item.reviewSha256===review.sha256&&item.catalogId===review.base.catalog.id&&item.reviewer===review.reviewer,'The worklist source identity differs.');
  need(Array.isArray(item.history)&&Array.isArray(item.requests)&&Array.isArray(item.outcomes),'Retain all review history, requests and outcomes.');
  if(item.draft!==null)draftFor(review,item.draft);
  for(const draft of item.history)draftFor(review,draft);
  const requests=new Map();
  for(const saved of item.requests){
   need(object(saved)&&typeof saved.raw==='string'&&saved.raw===pretty(saved.request),'Keep the exact original pretty-JSON request.');
   const request=saved.request;
   const prior=[item.draft,...item.history].find(d=>d&&d.comparison.sha256===request.expectedComparisonSha256);
   need(prior,'The request lost its original comparison.');
   const rebuilt=selectRecipientAdoption(review,prior.comparison,{requestId:request.requestId,actor:request.actor,reason:request.reason,choices:request.choices});
   need(canonical(rebuilt)===canonical(request),'The saved request differs from its complete original review.');
   need(!requests.has(request.requestId)||requests.get(request.requestId)===saved.raw,'One request ID identifies different saved bytes.');
   requests.set(request.requestId,saved.raw);
  }
  for(const outcome of item.outcomes)need(object(outcome)&&typeof outcome.id==='string'&&outcome.kind==='catalog-recipient-review'&&requests.has(outcome.id)&&canonical(outcome.request)===canonical(JSON.parse(requests.get(outcome.id))),'The retained outcome lost its original saved request.');
  const raw=JSON.stringify(item,null,2),size=utf8ByteLength(raw)+4*(raw.split('\n').length);itemBytes+=size;freeze(item);validatedItems.add(item);itemSizes.set(item,size);
 }
 const emptyBytes=utf8ByteLength(pretty({schema:value.schema,workspaceId:value.workspaceId,items:[]}));
 need(emptyBytes+(value.items.length?4+itemBytes+2*(value.items.length-1):0)<=MAX_AUTHOR_WORKLIST_BYTES,'The complete worklist exceeds 128 MiB. Export it before opening a separate worklist.');
 freeze(value);validated.add(value);return value;
}
export function exportAuthorWorklist(value){validateAuthorWorklist(value);return pretty(value);}
export function openAuthorWorklist(text){
 need(typeof text==='string'&&utf8ByteLength(text)<=MAX_AUTHOR_WORKLIST_BYTES,'Choose a complete worklist within 128 MiB.');
 let value;try{value=JSON.parse(text);}catch{throw Error('The worklist is not complete JSON.');}
 return validateAuthorWorklist(value);
}
function checked(value){validateAuthorWorklist(value);return{...value,items:value.items.slice()};}
function retainDistinct(array,value){if(!array.some(old=>canonical(old)===canonical(value)))array.push(copy(value));}
export function retainAuthorReturn(value,returnText){
 const next=checked(value),review=openRecipientReview(returnText),id=sha256Utf8(returnText).sha256;
 if(!next.items.some(item=>item.id===id))next.items.push({id,returnText,reviewSha256:review.sha256,catalogId:review.base.catalog.id,reviewer:review.reviewer,draft:null,history:[],requests:[],outcomes:[]});
 validateAuthorWorklist(next);return{worklist:next,id};
}
export function retainAuthorDraft(value,id,draft,{archivePrevious=false}={}){
 const next=checked(value),item=editableItem(next,id);draftFor(openRecipientReview(item.returnText),draft);
 if(item.draft&&(archivePrevious||item.draft.comparison.sha256!==draft.comparison.sha256))retainDistinct(item.history,item.draft);
 item.draft=copy(draft);return validateAuthorWorklist(next);
}
export function retainAuthorRequest(value,id,request,raw=pretty(request)){
 const next=checked(value),item=editableItem(next,id),old=item.requests.find(x=>x.request.requestId===request.requestId);
 need(!old||old.raw===raw,'The original request ID already identifies different bytes.');
 if(!old)item.requests.push({request:copy(request),raw});
 return validateAuthorWorklist(next);
}
export function retainAuthorOutcome(value,id,outcome){
 const next=checked(value),item=editableItem(next,id);retainDistinct(item.outcomes,outcome);return validateAuthorWorklist(next);
}
export function mergeAuthorWorklists(current,incoming){
 const next=checked(current);validateAuthorWorklist(incoming);
 need(next.workspaceId===incoming.workspaceId,'Worklists belong to different original workspaces.');
 for(const source of incoming.items){
  let item=next.items.find(item=>item.id===source.id);
  if(!item){next.items.push(source);continue;}
  item=editableItem(next,source.id);
  need(item.returnText===source.returnText,'The complete return bytes differ.');
  for(const old of source.history)retainDistinct(item.history,old);
  if(source.draft&&canonical(source.draft)!==canonical(item.draft))retainDistinct(item.history,source.draft);
  for(const saved of source.requests){
   const old=item.requests.find(x=>x.request.requestId===saved.request.requestId);
   need(!old||old.raw===saved.raw,'A received request ID conflicts with retained request bytes.');
   if(!old)item.requests.push(copy(saved));
  }
  for(const result of source.outcomes)retainDistinct(item.outcomes,result);
 }
 return validateAuthorWorklist(next);
}
