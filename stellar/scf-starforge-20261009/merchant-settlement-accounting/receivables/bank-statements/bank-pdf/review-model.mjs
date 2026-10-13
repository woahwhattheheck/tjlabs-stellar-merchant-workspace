// SPDX-License-Identifier: MIT
// Named PDF interpretation exchange. All source edits use the original PDF working-copy engine.
import {PDF_SCHEMA,PDF_LIMITS,canonical,digest,openWorkingCopy,editWorkingCopy,accountReview} from './model.mjs';
export const PDF_REVIEW_SCHEMAS=Object.freeze({
 issue:'stellar-forge.bank-pdf-review-issue.v1',record:'stellar-forge.bank-pdf-review-record.v1',
 returned:'stellar-forge.bank-pdf-review-return.v1',preview:'stellar-forge.bank-pdf-review-preview.v1',
 decision:'stellar-forge.bank-pdf-review-decision.v1'
});
export const PDF_REVIEW_LIMITS=Object.freeze({transferBytes:384*1024*1024,recordBytes:512*1024*1024,editions:256,history:20000,textBytes:262144});
const collections=Object.freeze({accounts:'id',regions:'id',rows:'id',balances:'id',pageReviews:'page'});
const actions=Object.freeze({accounts:'ACCOUNT',regions:'REGION',rows:'ROWS',balances:'BALANCE',pageReviews:'PAGE_REVIEW'});
const mutable=new Set([...Object.keys(collections),'history','revision','bankImports']);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),copy=v=>JSON.parse(JSON.stringify(v));
const fail=(code,message,details={})=>{throw Object.assign(new Error(message),{code,status:400,details});};
const need=(yes,code,message,details)=>{if(!yes)fail(code,message,details);};
const text=(v,label,max=4000,required=true)=>{need(typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)&&(!required||v.trim()),'PDF_REVIEW_FIELD','Provide '+label);return v;};
const uuid=(v,label='the original review identity')=>{need(typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),'PDF_REVIEW_ID','Retain '+label);return v;};
const stamp=v=>{need(typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v,'PDF_REVIEW_TIME','Retain an exact UTC timestamp');return v;};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const same=(a,b)=>canonical(a)===canonical(b);
const bytes=v=>new TextEncoder().encode(typeof v==='string'?v:canonical(v)).length;
function capacity(v,limit=PDF_REVIEW_LIMITS.transferBytes){const n=bytes(v);need(n<=limit,'PDF_REVIEW_CAPACITY','The complete review exceeds its '+limit+'-byte capacity; preserve the current whole record and use a smaller named review.',{bytes:n,limit});return v;}
function decoded(v){if(typeof v!=='string')return copy(capacity(v));capacity(v);try{return JSON.parse(v);}catch{fail('PDF_REVIEW_JSON','Open the complete original review JSON.');}}
async function sealed(v){const value=copy(v);delete value.sha256;return {...value,sha256:await digest(canonical(value))};}
async function verifySeal(v,code){need(plain(v)&&hash(v.sha256),'PDF_REVIEW_HASH','Retain the complete review identity');const result=await sealed(v);need(result.sha256===v.sha256,code||'PDF_REVIEW_CHANGED','The complete retained review bytes or decisions changed');}
function interpretation(work){return Object.fromEntries([...mutable].map(k=>[k,copy(work[k])]));}
function hydrate(issue,value){return {...copy(issue.workingCopy),...copy(value)};}
function sourcePart(work){return Object.fromEntries(Object.entries(work).filter(([k])=>!mutable.has(k)));}
function historyValue(row){return row.action==='REGION'?row.after?.region:row.after;}
function normalizedAction(work,row,{allowBank=false}={}){
 need(plain(row)&&['ACCOUNT','REGION','ROWS','BALANCE','PAGE_REVIEW',...(allowBank?['BANK_IMPORT']:[])].includes(row.action),'PDF_REVIEW_ACTION','Returned interpretation may edit accounts, regions, rows, balances and page reviews only');
 text(row.actor,'the named interpretation reviewer',160);text(row.reason,'the interpretation reason');stamp(row.at);
 const next=editWorkingCopy(work,row.action,historyValue(row),{actor:row.actor,reason:row.reason}),actual=next.history.at(-1);
 need(actual.revision===row.revision&&same(actual.before,row.before)&&same(actual.after,row.after),'PDF_REVIEW_HISTORY','The interpretation history does not replay through the original PDF engine',{revision:row.revision,action:row.action});
 actual.at=row.at;return next;
}
async function continuation(base,work,{allowBank=false}={}){
 const opened=await openWorkingCopy(canonical(work));
 need(opened.history.length<=PDF_REVIEW_LIMITS.history,'PDF_REVIEW_HISTORY_LIMIT','Keep the complete interpretation history within '+PDF_REVIEW_LIMITS.history+' operations');
 need(same(sourcePart(base),sourcePart(opened)),'PDF_REVIEW_SOURCE_CHANGED','This review belongs to its exact original PDF, extraction, working-copy identity and source metadata');
 need(opened.revision>=base.revision&&same(opened.history.slice(0,base.history.length),base.history),'PDF_REVIEW_ANCESTRY','The returned working copy must continue the complete issued interpretation history');
 let replay=copy(base);
 for(const row of opened.history.slice(base.history.length))replay=normalizedAction(replay,row,{allowBank});
 need(same(replay,opened),'PDF_REVIEW_UNRECORDED_EDIT','Every interpretation change must be retained by the original PDF edit operation; original bytes and source history cannot be replaced');
 return opened;
}
function duplicateIds(work){for(const [name,key]of Object.entries(collections)){const ids=new Set();for(const row of work[name]){need(plain(row)&&((key==='page'&&Number.isInteger(row[key]))||(key!=='page'&&typeof row[key]==='string'&&row[key])),'PDF_REVIEW_ITEM','A reviewed item needs its original identity',{collection:name});need(!ids.has(String(row[key])),'PDF_REVIEW_ITEM_DUPLICATE','Retain unique original interpretation identities',{collection:name,id:row[key]});ids.add(String(row[key]));}}}
function binding(work){return {workingCopyId:work.id,revision:work.revision,pdf:{name:work.file.name,bytes:work.file.bytes,sha256:work.file.sha256},extractionSha256:work.extractionSha256};}
export async function issuePdfReview({workingCopy,reviewId,author,recipient,purpose,createdAt}){
 const work=await openWorkingCopy(typeof workingCopy==='string'?workingCopy:canonical(workingCopy));duplicateIds(work);
 need(work.history.length<=PDF_REVIEW_LIMITS.history,'PDF_REVIEW_HISTORY_LIMIT','The original history exceeds this review capacity');
 const value={schema:PDF_REVIEW_SCHEMAS.issue,reviewId:uuid(reviewId),author:text(author,'the issuing author',160),recipient:text(recipient,'the named recipient',160),purpose:text(purpose,'the requested interpretation review',8000),createdAt:stamp(createdAt),source:binding(work),workingCopySha256:await digest(canonical(work)),workingCopy:work};
 return capacity(await sealed(value));
}
export async function openPdfReviewIssue(value){
 const issue=decoded(value);need(issue.schema===PDF_REVIEW_SCHEMAS.issue,'PDF_REVIEW_SCHEMA','Choose an issued PDF interpretation review');
 await verifySeal(issue);uuid(issue.reviewId);text(issue.author,'the issuing author',160);text(issue.recipient,'the named recipient',160);text(issue.purpose,'the review purpose',8000);stamp(issue.createdAt);
 const work=await openWorkingCopy(canonical(issue.workingCopy));duplicateIds(work);
 need(same(binding(work),issue.source)&&await digest(canonical(work))===issue.workingCopySha256,'PDF_REVIEW_SOURCE_CHANGED','The issued PDF working copy changed');
 need(work.history.length<=PDF_REVIEW_LIMITS.history,'PDF_REVIEW_HISTORY_LIMIT','The complete original history exceeds review capacity');return issue;
}
export async function createPdfReviewRecord(issued,{localId,openedAt}){
 const issue=await openPdfReviewIssue(issued);
 return capacity({schema:PDF_REVIEW_SCHEMAS.record,localId:uuid(localId,'the local working-record identity'),revision:0,issue,openedAt:stamp(openedAt),draft:{interpretation:interpretation(issue.workingCopy),reviewer:issue.recipient,comment:'',raw:'',rawDirty:false},editions:[],decisions:[],receivingObservations:[]},PDF_REVIEW_LIMITS.recordBytes);
}
async function validateEditions(issue,editions){
 need(Array.isArray(editions)&&editions.length<=PDF_REVIEW_LIMITS.editions,'PDF_REVIEW_EDITIONS','Keep all original review editions');
 let previous=null,lastWork=issue.workingCopy;const ids=new Set();
 for(let i=0;i<editions.length;i++){
  const e=editions[i];need(plain(e)&&e.sequence===i+1&&e.previousSha256===previous&&['draft','submitted'].includes(e.status),'PDF_REVIEW_EDITION_CHAIN','The complete ordered review edition chain is required');
  uuid(e.editionId,'the review edition identity');need(!ids.has(e.editionId),'PDF_REVIEW_EDITION_ID','Review edition identities must be unique');ids.add(e.editionId);
  text(e.reviewer,'the named reviewer',160);text(e.comment,'the review comment',8000,false);stamp(e.createdAt);await verifySeal(e,'PDF_REVIEW_EDITION_CHANGED');
  lastWork=await continuation(lastWork,hydrate(issue,e.interpretation));duplicateIds(lastWork);previous=e.sha256;
 }
 return lastWork;
}
export async function openPdfReviewRecord(value){
 const record=typeof value==='string'?(capacity(value,PDF_REVIEW_LIMITS.recordBytes),JSON.parse(value)):copy(capacity(value,PDF_REVIEW_LIMITS.recordBytes));
 need(record?.schema===PDF_REVIEW_SCHEMAS.record&&Number.isSafeInteger(record.revision)&&record.revision>=0,'PDF_REVIEW_RECORD','Open the complete PDF review working record');
 uuid(record.localId,'the local record identity');stamp(record.openedAt);const issue=await openPdfReviewIssue(record.issue);
 const latest=await validateEditions(issue,record.editions);
 need(plain(record.draft)&&typeof record.draft.rawDirty==='boolean'&&typeof record.draft.raw==='string'&&bytes(record.draft.raw)<=PDF_REVIEW_LIMITS.textBytes,'PDF_REVIEW_DRAFT','Preserve the complete editable request draft');
 text(record.draft.reviewer,'the reviewer',160,false);text(record.draft.comment,'the review comment',8000,false);
 await continuation(latest,hydrate(issue,record.draft.interpretation));
 need(Array.isArray(record.decisions)&&Array.isArray(record.receivingObservations),'PDF_REVIEW_RECORD','Keep author decisions and original receiving observations');
 for(const decision of record.decisions){await verifySeal(decision,'PDF_REVIEW_DECISION_CHANGED');need(decision.schema===PDF_REVIEW_SCHEMAS.decision&&decision.reviewId===issue.reviewId&&decision.issueSha256===issue.sha256,'PDF_REVIEW_WRONG_ISSUE','A retained author decision belongs to this exact issue');uuid(decision.decisionId,'the author decision identity');stamp(decision.createdAt);}
 return record;
}
export async function pdfReviewWorkingCopy(record,{editionId}={}){
 const checked=await openPdfReviewRecord(record);if(!editionId)return hydrate(checked.issue,checked.draft.interpretation);
 const edition=checked.editions.find(e=>e.editionId===editionId);need(edition,'PDF_REVIEW_EDITION','Choose an existing complete review edition');return hydrate(checked.issue,edition.interpretation);
}
export async function editPdfReviewDraft(record,{action,value,actor,reason}){
 const checked=await openPdfReviewRecord(record);need(!checked.draft.rawDirty,'PDF_REVIEW_RAW_DRAFT','Apply or preserve the current raw draft before a guided change');
 need(action!=='BANK_IMPORT'&&Object.values(actions).includes(action),'PDF_REVIEW_ACTION','A recipient proposes interpretations; financial receiving remains a separate original Bank operation');
 const next=editWorkingCopy(hydrate(checked.issue,checked.draft.interpretation),action,value,{actor,reason});duplicateIds(next);
 checked.draft.interpretation=interpretation(next);checked.draft.reviewer=actor;checked.revision++;
 return capacity(checked,PDF_REVIEW_LIMITS.recordBytes);
}
export async function receivePdfWorkingCopy(record,workingCopy,{reviewer,comment}){
 const checked=await openPdfReviewRecord(record);need(!checked.draft.rawDirty,'PDF_REVIEW_RAW_DRAFT','Apply or preserve the current raw draft before receiving another working copy');
 const current=hydrate(checked.issue,checked.draft.interpretation),candidate=typeof workingCopy==='string'?(capacity(workingCopy,PDF_LIMITS.transferBytes),JSON.parse(workingCopy)):workingCopy;
 const next=await continuation(current,candidate);duplicateIds(next);checked.draft.interpretation=interpretation(next);checked.draft.reviewer=text(reviewer,'the receiving reviewer',160);checked.draft.comment=text(comment,'the receiving comment',8000,false);checked.revision++;return capacity(checked,PDF_REVIEW_LIMITS.recordBytes);
}
export async function savePdfReviewEdition(record,{editionId,status,reviewer,comment,createdAt,expectedEditionSha256=null}){
 const checked=await openPdfReviewRecord(record);need(!checked.draft.rawDirty,'PDF_REVIEW_RAW_DRAFT','Apply the current raw interpretation before saving an edition');
 need(['draft','submitted'].includes(status),'PDF_REVIEW_STATUS','Save a draft or an explicitly submitted edition');
 need((checked.editions.at(-1)?.sha256??null)===expectedEditionSha256,'PDF_REVIEW_STALE','A newer review edition exists; reopen the current complete record');
 need(!checked.editions.some(e=>e.editionId===editionId),'PDF_REVIEW_EDITION_ID','Use a new identity for a new complete edition');
 const edition=await sealed({editionId:uuid(editionId,'the edition identity'),sequence:checked.editions.length+1,previousSha256:expectedEditionSha256,status,reviewer:text(reviewer,'the named reviewer',160),comment:text(comment,'the review comment',8000,status==='submitted'),createdAt:stamp(createdAt),interpretation:copy(checked.draft.interpretation)});
 checked.editions.push(edition);checked.draft.reviewer=reviewer;checked.draft.comment=comment;checked.revision++;return capacity(await openPdfReviewRecord(checked),PDF_REVIEW_LIMITS.recordBytes);
}
export async function exportPdfReviewReturn(record,{editionId}){
 const checked=await openPdfReviewRecord(record),index=checked.editions.findIndex(e=>e.editionId===editionId);
 need(index>=0&&checked.editions[index].status==='submitted','PDF_REVIEW_NOT_SUBMITTED','Select an explicitly submitted complete review edition');
 return capacity(await sealed({schema:PDF_REVIEW_SCHEMAS.returned,reviewId:checked.issue.reviewId,issueSha256:checked.issue.sha256,issue:checked.issue,editionId,editions:checked.editions.slice(0,index+1)}));
}
export async function openPdfReviewReturn(value,{issue}={}){
 const returned=decoded(value);need(returned.schema===PDF_REVIEW_SCHEMAS.returned,'PDF_REVIEW_RETURN_SCHEMA','Open the complete submitted PDF review return');await verifySeal(returned);
 const checked=await openPdfReviewIssue(returned.issue);need(returned.reviewId===checked.reviewId&&returned.issueSha256===checked.sha256,'PDF_REVIEW_WRONG_ISSUE','The return belongs to another original review');
 if(issue){const original=await openPdfReviewIssue(issue);need(same(original,checked),'PDF_REVIEW_WRONG_ISSUE','The author must select the exact original issue');}
 await validateEditions(checked,returned.editions);const last=returned.editions.at(-1);need(last&&last.editionId===returned.editionId&&last.status==='submitted','PDF_REVIEW_NOT_SUBMITTED','The selected returned edition is not submitted');return returned;
}
const keyOf=(collection,row)=>String(row[collections[collection]]);
function rowsBy(collection,rows){return new Map(rows.map(row=>[keyOf(collection,row),row]));}
function changedFields(before,after){return [...new Set([...Object.keys(before??{}),...Object.keys(after??{})])].sort().filter(key=>!same(before?.[key]??null,after?.[key]??null));}
function comparisonRows(issued,current,returned){
 const result=[];
 for(const collection of Object.keys(collections)){
  const a=rowsBy(collection,issued[collection]),b=rowsBy(collection,current[collection]),c=rowsBy(collection,returned[collection]);
  for(const [id,incoming]of c){
   const original=a.get(id),present=b.get(id);
   if(!original){result.push({key:JSON.stringify([collection,id,'$item']),collection,id,field:'$item',issued:null,current:copy(present??null),returned:copy(incoming),conflict:!!present&&!same(present,incoming),alreadyCurrent:!!present&&same(present,incoming)});continue;}
   for(const field of changedFields(original,incoming)){
    need(field!==collections[collection],'PDF_REVIEW_ID','Original interpretation identity cannot change');
    const was=original[field]??null,now=present?.[field]??null,next=incoming[field]??null;
    result.push({key:JSON.stringify([collection,id,field]),collection,id,field,issued:copy(was),current:copy(now),returned:copy(next),conflict:!same(was,now)&&!same(now,next),alreadyCurrent:same(now,next)});
   }
  }
 }
 return result;
}
function reviewResults(work){return work.accounts.map(account=>{try{return accountReview(work,account.id);}catch(error){return {accountId:account.id,ready:false,receivable:false,problems:[{code:error.code||'PDF_REVIEW',message:error.message}]};}});}
export async function validatePdfReviewCurrent(issue,currentWorkingCopy){const original=await openPdfReviewIssue(issue);const current=await continuation(original.workingCopy,typeof currentWorkingCopy==='string'?(capacity(currentWorkingCopy,PDF_LIMITS.transferBytes),JSON.parse(currentWorkingCopy)):currentWorkingCopy,{allowBank:true});duplicateIds(current);return current;}
export async function previewPdfReviewReturn({issue,returned,currentWorkingCopy}){
 const original=await openPdfReviewIssue(issue),incoming=await openPdfReviewReturn(returned,{issue:original});
 const current=await continuation(original.workingCopy,typeof currentWorkingCopy==='string'?JSON.parse(currentWorkingCopy):currentWorkingCopy,{allowBank:true});duplicateIds(current);
 const selected=incoming.editions.at(-1),proposed=hydrate(original,selected.interpretation),changes=comparisonRows(original.workingCopy,current,proposed);
 const preview={schema:PDF_REVIEW_SCHEMAS.preview,reviewId:original.reviewId,issueSha256:original.sha256,returnSha256:incoming.sha256,editionId:selected.editionId,editionSha256:selected.sha256,current:binding(current),currentWorkingCopySha256:await digest(canonical(current)),source:original.source,reviewer:selected.reviewer,comment:selected.comment,changes,counts:{changes:changes.length,conflicts:changes.filter(r=>r.conflict).length,alreadyCurrent:changes.filter(r=>r.alreadyCurrent).length},currentAccounts:reviewResults(current),returnedAccounts:reviewResults(proposed)};
 return capacity(await sealed(preview));
}
function selectChanges(current,preview,choices){
 need(plain(choices)&&Object.keys(choices).length===preview.changes.length,'PDF_REVIEW_CHOICES','Explicitly keep current or adopt returned for every proposed field');
 const target=copy(current),touched=new Map();
 for(const change of preview.changes){
  need(['keep','adopt'].includes(choices[change.key]),'PDF_REVIEW_CHOICES','Choose keep or adopt for each proposed change',{key:change.key});
  if(choices[change.key]==='keep')continue;
  const list=target[change.collection],key=collections[change.collection],index=list.findIndex(row=>String(row[key])===change.id);
  if(change.field==='$item'){if(index<0)list.push(copy(change.returned));else list[index]=copy(change.returned);}
  else {need(index>=0,'PDF_REVIEW_CURRENT_ITEM','The current source item no longer exists; preserve this return and recompare');if(change.returned===null)delete list[index][change.field];else list[index][change.field]=copy(change.returned);}
  if(!touched.has(change.collection))touched.set(change.collection,new Map());
  const items=touched.get(change.collection);if(!items.has(change.id))items.set(change.id,new Set());items.get(change.id).add(change.field);
 }
 return {target,touched};
}
function applySelected(current,target,touched,{actor,reason}){
 let work=copy(current);const applied=[];
 for(const collection of Object.keys(collections)){
  for(const [id,fields]of touched.get(collection)??[]){
   const selected=target[collection].find(row=>keyOf(collection,row)===id),prior=work[collection].find(row=>keyOf(collection,row)===id);
   const value=fields.has('$item')?copy(selected):copy(prior);
   if(!fields.has('$item'))for(const field of fields){if(Object.hasOwn(selected,field))value[field]=copy(selected[field]);else delete value[field];}
   if(same(prior??null,value??null))continue;
   const next=editWorkingCopy(work,actions[collection],collection==='rows'?[value]:value,{actor,reason});
   // REGION intentionally marks all existing rows for renewed review in the original engine.
   // Later explicitly selected row fields apply to that current result, preserving that invalidation.
   work=next;applied.push({collection,id,action:actions[collection],revision:work.revision});
  }
 }
 duplicateIds(work);return {workingCopy:work,applied};
}
export async function decidePdfReviewReturn({issue,returned,currentWorkingCopy,preview,choices,decisionId,author,reason,createdAt}){
 const actual=await previewPdfReviewReturn({issue,returned,currentWorkingCopy});
 need(preview?.sha256===actual.sha256&&same(preview,actual),'PDF_REVIEW_STALE','The issued, current or returned working copy changed; compare it again before adopting');
 const originalCurrent=typeof currentWorkingCopy==='string'?JSON.parse(currentWorkingCopy):copy(currentWorkingCopy),selected=selectChanges(originalCurrent,actual,choices);
 const identity={actor:text(author,'the deciding author',160),reason:text(reason,'the author decision reason',4000)};
 const result=applySelected(originalCurrent,selected.target,selected.touched,identity);
 const decision=await sealed({schema:PDF_REVIEW_SCHEMAS.decision,decisionId:uuid(decisionId,'the author decision identity'),reviewId:actual.reviewId,issueSha256:actual.issueSha256,returnSha256:actual.returnSha256,editionId:actual.editionId,currentWorkingCopySha256:actual.currentWorkingCopySha256,previewSha256:actual.sha256,choices:copy(choices),author:identity.actor,reason:identity.reason,createdAt:stamp(createdAt),applied:result.applied,resultingWorkingCopySha256:await digest(canonical(result.workingCopy)),resultingRevision:result.workingCopy.revision,resultingHistory:result.workingCopy.history.slice(originalCurrent.history.length),resultingAccounts:reviewResults(result.workingCopy)});
 return capacity({decision,workingCopy:result.workingCopy});
}
export async function applyPdfReviewDecision({issue,returned,currentWorkingCopy,decision}){
 await verifySeal(decision,'PDF_REVIEW_DECISION_CHANGED');need(decision.schema===PDF_REVIEW_SCHEMAS.decision,'PDF_REVIEW_DECISION','Select the complete original author decision');
 uuid(decision.decisionId,'the author decision identity');stamp(decision.createdAt);text(decision.author,'the deciding author',160);text(decision.reason,'the author decision reason',4000);
 const preview=await previewPdfReviewReturn({issue,returned,currentWorkingCopy});
 need(preview.reviewId===decision.reviewId&&preview.editionId===decision.editionId&&preview.sha256===decision.previewSha256&&preview.currentWorkingCopySha256===decision.currentWorkingCopySha256&&preview.returnSha256===decision.returnSha256&&preview.issueSha256===decision.issueSha256,'PDF_REVIEW_STALE','This original author decision no longer matches the current issued/returned/source state');
 const current=typeof currentWorkingCopy==='string'?JSON.parse(currentWorkingCopy):copy(currentWorkingCopy),selected=selectChanges(current,preview,decision.choices);
 let result=applySelected(current,selected.target,selected.touched,{actor:decision.author,reason:decision.reason});
 need(result.applied.length===decision.resultingHistory.length&&same(result.applied,decision.applied),'PDF_REVIEW_DECISION_CHANGED','The recorded application differs from the original engine');
 for(let i=0;i<decision.resultingHistory.length;i++){
  const row=decision.resultingHistory[i],at=current.history.length+i,actual=result.workingCopy.history[at];stamp(row.at);
  need(same({...actual,at:row.at},row),'PDF_REVIEW_DECISION_CHANGED','The retained original edit history changed');result.workingCopy.history[at]=copy(row);
 }
 need(await digest(canonical(result.workingCopy))===decision.resultingWorkingCopySha256&&result.workingCopy.revision===decision.resultingRevision&&same(reviewResults(result.workingCopy),decision.resultingAccounts),'PDF_REVIEW_DECISION_CHANGED','The complete decided PDF working copy changed');
 return {decision:copy(decision),workingCopy:result.workingCopy,financialReceiving:'SEPARATE_ORIGINAL_BANK_OPERATION'};
}
export function pdfReviewTransfer(value,{record=false}={}){const result=canonical(value)+'\n';capacity(result,record?PDF_REVIEW_LIMITS.recordBytes:PDF_REVIEW_LIMITS.transferBytes);return result;}
