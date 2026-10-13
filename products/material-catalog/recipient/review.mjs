// MIT. Named offline proposals over the unchanged original material catalogue.
import {canonical,openText} from './core.mjs';
import {sha256Utf8,utf8ByteLength} from './sha256.mjs';
export const REVIEW_SCHEMA='stellar-forge.material-recipient-review.v1';
export const REVIEW_WORKING_SCHEMA='stellar-forge.material-recipient-working.v1';
export const MAX_REVIEW_BYTES=4*1024*1024;
export const MAX_WORKING_BYTES=400*1024*1024;
const copy=x=>JSON.parse(JSON.stringify(x));
const hash=x=>sha256Utf8(typeof x==='string'?x:canonical(x)).sha256;
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const need=(ok,code,message)=>{if(!ok)fail(code,message);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=(x,label,max=4000)=>{need(typeof x==='string'&&x.trim()&&x.length<=max&&!x.includes('\0'),'REVIEW_FIELD',label+' is required and must fit '+max+' characters.');utf8ByteLength(x);return x;};
const stamp=x=>{need(typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x,'REVIEW_TIME','Use an exact ISO timestamp.');return x;};
const identifier=x=>{need(typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(x),'REVIEW_ID','Use a retained identifier of at most 96 characters.');return x;};
const same=(a,b)=>canonical(a)===canonical(b);
function validateDraft(draft){need(object(draft)&&Object.keys(draft).every(k=>['reviewer','customerId','description','materialKey','status','note','materialSearch'].includes(k)&&typeof draft[k]==='string'&&draft[k].length<=3000),'REVIEW_DRAFT','The complete unfinished proposal form is invalid.');return draft;}
function validateAuthor(author,bundle){
 need(object(author)&&object(author.choices)&&object(author.receiving),'REVIEW_AUTHOR','Keep the full original author review state.');
 const actual=compareRecipientReview(recipientView(bundle),validateRecipientReview(author.returned));need(actual.sha256===author.comparisonSha256,'REVIEW_AUTHOR','The author comparison differs.');
 need(Object.entries(author.choices).every(([id,choice])=>actual.rows.some(x=>x.id===id)&&['','keep','adopt'].includes(choice)),'REVIEW_CHOICES','Saved choices differ from the retained comparison.');
 need(Object.entries(author.receiving).every(([k,v])=>['actor','reason','requestId','requestSignature'].includes(k)&&typeof v==='string')&&utf8ByteLength(JSON.stringify(author.receiving))<=16384,'REVIEW_AUTHOR','The complete saved receiving form is invalid.');
 return author;
}
const seal=x=>({...x,sha256:hash(x)});
export function recipientDecisionReference(d){
 if(d===null||d===undefined)return null;
 const fields=['schema','id','revision','catalogId','catalogRevision','editionId','tenantId','customerId','description','materialKey','materialId','materialSha256','status','note','createdAt','updatedAt'];
 return {...Object.fromEntries(fields.map(k=>[k,d[k]])),recordSha256:hash(d)};
}
export function recipientContext(customerId,description){return hash([customerId,description.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/gu,' ').trim()]);}
function materialValid(m,tenant){
 need(object(m)&&m.schema==='stellar-forge.material-catalog-record.v1'&&m.tenantId===tenant,'REVIEW_MATERIAL','The complete original material is required.');
 const {sha256,...body}=m;need(sha256===hash(body)&&m.key===hash([tenant,m.materialId]),'REVIEW_MATERIAL','The original material identity differs.');
}
function proposalValid(p,base){
 need(object(p),'REVIEW_PROPOSAL','A complete proposal is required.');
 text(p.customerId,'Customer',256);text(p.description,'Customer description',2000);text(p.note,'Review reason',3000);
 need(['APPROVED','REJECTED'].includes(p.status),'REVIEW_STATUS','Choose Approve or Reject.');
 need(p.id===recipientContext(p.customerId,p.description),'REVIEW_CONTEXT','Customer context differs.');
 materialValid(p.material,base.catalog.tenantId);
 need(p.editionId===base.edition.id,'REVIEW_EDITION','Proposal must keep its original reviewed edition.');
 need(Number.isSafeInteger(p.revision)&&p.revision>0,'REVIEW_REVISION','Proposal revision is invalid.');
 stamp(p.at);need(p.at>=base.catalog.createdAt,'REVIEW_TIME','The proposal predates its original catalogue.');
 if(p.originalDecision!==null){
  const d=p.originalDecision;need(object(d)&&d.schema==='stellar-forge.material-catalog-decision.v1'&&d.catalogId===base.catalog.id&&d.tenantId===base.catalog.tenantId&&recipientContext(d.customerId,d.description)===p.id,'REVIEW_BASE_DECISION','Original decision scope differs.');
  need(Number.isSafeInteger(d.revision)&&d.revision>0,'REVIEW_BASE_DECISION','Original decision revision is invalid.');
 }
}
export function validateRecipientReview(value){
 need(object(value)&&value.schema===REVIEW_SCHEMA,'REVIEW_SCHEMA','Choose a complete material recipient review.');
 identifier(value.id);text(value.reviewer,'Named reviewer',160);stamp(value.createdAt);
 const {sha256,...body}=value;need(sha256===hash(body),'REVIEW_CHANGED','The complete review differs from its saved identity.');
 const b=value.base;
 need(object(b)&&object(b.catalog)&&object(b.edition)&&object(b.bundle),'REVIEW_BASE','The complete original catalogue selection is required.');
 need(b.catalog.schema==='stellar-forge.material-catalog.v1'&&b.edition.schema==='stellar-forge.material-catalog-edition.v1'&&b.catalog.id===b.edition.catalogId&&b.catalog.tenantId===b.edition.tenantId&&b.catalog.activeEditionId===b.edition.id,'REVIEW_BASE','Original catalogue and selected edition differ.');
 need(/^[a-f0-9]{64}$/.test(b.bundle.sha256)&&Number.isSafeInteger(b.bundle.bytes)&&b.bundle.bytes>0,'REVIEW_BUNDLE','Original bundle identity is required.');
 need(Array.isArray(value.entries)&&Array.isArray(value.history)&&value.entries.length<=2000&&value.history.length<=5000,'REVIEW_LIMIT','Keep at most 2,000 proposed contexts and 5,000 complete saved revisions in one review.');
 const latest=new Map();let previous=null;
 for(let i=0;i<value.history.length;i++){
  const event=value.history[i],{sha256:eh,...eb}=event;proposalValid(event.proposal,b);
  need(event.sequence===i+1&&event.previous===previous&&eh===hash(eb),'REVIEW_HISTORY','The complete proposal history differs.');
  need(event.proposal.at>=value.createdAt&&(i===0||event.proposal.at>=value.history[i-1].proposal.at),'REVIEW_TIME','Proposal history timestamps are out of order.');
  const prior=latest.get(event.proposal.id);
  need(event.proposal.revision===(prior?.revision??0)+1,'REVIEW_HISTORY','A proposal history revision is missing.');
  if(prior)need(same(prior.originalDecision,event.proposal.originalDecision),'REVIEW_HISTORY','Original decision changed between proposal revisions.');
  latest.set(event.proposal.id,event.proposal);previous=eh;
 }
 const expected=[...latest.values()].sort((a,b)=>a.id.localeCompare(b.id));
 need(same(expected,value.entries),'REVIEW_HISTORY','Current proposals differ from their complete history.');
 need(utf8ByteLength(JSON.stringify(value))<=MAX_REVIEW_BYTES,'REVIEW_LIMIT','This complete review exceeds 4 MiB. Keep every earlier saved review and create a separate named review.');
 return value;
}
export function createRecipientReview(bundle,{id,reviewer,at}){
 need(bundle.catalog.activeEditionId&&bundle.editions.has(bundle.catalog.activeEditionId),'REVIEW_EDITION','The original author must select a catalogue edition before review.');
 return validateRecipientReview(seal({schema:REVIEW_SCHEMA,id:identifier(id),reviewer:text(reviewer,'Named reviewer',160),createdAt:stamp(at),
  base:{bundle:{name:bundle.name,bytes:bundle.identity.bytes,sha256:bundle.identity.sha256},catalog:copy(bundle.catalog),edition:copy(bundle.editions.get(bundle.catalog.activeEditionId))},entries:[],history:[]}));
}
export function saveRecipientProposal(value,bundle,input,{at}){
 const review=validateRecipientReview(value);
 need(bundle.identity.sha256===review.base.bundle.sha256&&bundle.identity.bytes===review.base.bundle.bytes,'REVIEW_OTHER_BUNDLE','Open the exact original bundle belonging to this review.');
 const customerId=text(input.customerId,'Customer',256),description=text(input.description,'Customer description',2000),id=recipientContext(customerId,description);
 const material=bundle.materials.get(review.base.edition.id)?.get(input.materialKey);
 need(material,'REVIEW_MATERIAL','Select a material from the reviewed original edition.');
 const prior=review.entries.find(x=>x.id===id);
 const original=prior?prior.originalDecision:recipientDecisionReference([...bundle.decisions.values()].find(x=>recipientContext(x.customerId,x.description)===id)??null);
 const proposal={id,revision:(prior?.revision??0)+1,at:stamp(at),customerId,description,status:input.status,note:text(input.note,'Review reason',3000),editionId:review.base.edition.id,material:copy(material),originalDecision:copy(original)};
 proposalValid(proposal,review.base);
 const event=seal({sequence:review.history.length+1,previous:review.history.at(-1)?.sha256??null,proposal});
 const entries=[...review.entries.filter(x=>x.id!==id),proposal].sort((a,b)=>a.id.localeCompare(b.id));
 const {sha256,...body}=review;
 return validateRecipientReview(seal({...body,entries,history:[...review.history,event]}));
}
export function exportRecipientReview(review){validateRecipientReview(review);const result=JSON.stringify(review,null,2)+'\n';need(utf8ByteLength(result)<=MAX_REVIEW_BYTES,'REVIEW_LIMIT','The complete return file exceeds 4 MiB.');return result;}
export function openRecipientReview(source){
 need(typeof source==='string'&&utf8ByteLength(source)<=MAX_REVIEW_BYTES,'REVIEW_LIMIT','Choose a complete review file of at most 4 MiB.');
 let value;try{value=JSON.parse(source);}catch{fail('REVIEW_JSON','The review is not complete JSON.');}return validateRecipientReview(value);
}
export function recipientView(bundle){
 return {catalog:bundle.catalog,catalogAt:revision=>bundle.tables.catalog_history.find(x=>x.revision===revision)?.record??null,
  edition:id=>bundle.editions.get(id)??null,material:(id,key)=>bundle.materials.get(id)?.get(key)??null,
  decisions:[...bundle.decisions.values()],decisionAt:(id,revision)=>bundle.tables.catalog_decision_history.find(x=>x.decision_id===id&&x.revision===revision)?.record??null};
}
export function compareRecipientReview(view,review){
 validateRecipientReview(review);
 need(view.catalog.id===review.base.catalog.id&&view.catalog.tenantId===review.base.catalog.tenantId,'REVIEW_CATALOG','Choose the same original catalogue and tenant.');
 need(same(view.catalogAt(review.base.catalog.revision),review.base.catalog)&&same(view.edition(review.base.edition.id),review.base.edition),'REVIEW_ORIGINAL_CHANGED','The author workspace must retain the exact originally reviewed catalogue and edition.');
 const checkedMaterials=new Set(),checkedDecisions=new Set();
 for(const event of review.history){
  const proposal=event.proposal,key=proposal.editionId+':'+proposal.material.key+':'+proposal.material.sha256;
  if(!checkedMaterials.has(key)){
   need(same(view.material(proposal.editionId,proposal.material.key),proposal.material),'REVIEW_ORIGINAL_CHANGED','Original material differs in retained proposal history: '+proposal.material.materialId);
   checkedMaterials.add(key);
  }
  if(proposal.originalDecision){
   const d=proposal.originalDecision,identity=hash(d);
   if(!checkedDecisions.has(identity)){need(same(recipientDecisionReference(view.decisionAt(d.id,d.revision)),d),'REVIEW_ORIGINAL_CHANGED','An original decision revision differs in retained proposal history.');checkedDecisions.add(identity);}
  }
 }
 const currentDecisions=new Map(view.decisions.map(x=>[recipientContext(x.customerId,x.description),x]));
 const rows=review.entries.map(proposal=>{
  const current=recipientDecisionReference(currentDecisions.get(proposal.id)??null);
  const material=view.catalog.activeEditionId?view.material(view.catalog.activeEditionId,proposal.material.key):null;
  const eligible=Boolean(material&&material.sha256===proposal.material.sha256);
  const unchanged=Boolean(current&&current.status===proposal.status&&current.note===proposal.note&&current.materialSha256===proposal.material.sha256&&current.editionId===view.catalog.activeEditionId);
  return {id:proposal.id,proposal:copy(proposal),current:copy(current),currentMaterial:copy(material),eligible,unchanged,
   conflict:!same(current,proposal.originalDecision),
   reason:!eligible?'The current selected material is missing or changed. Keep current and request a new review of the current catalogue.':unchanged?'The current decision already has these exact values.':!same(current,proposal.originalDecision)?'The author changed this customer decision after the original bundle. Choose explicitly.':'The original customer decision is unchanged; choose explicitly.'};
 });
 return seal({schema:'stellar-forge.material-recipient-comparison.v1',reviewId:review.id,returnSha256:review.sha256,reviewer:review.reviewer,
  catalog:copy(view.catalog),rows});
}
export function selectRecipientAdoption(review,comparison,{requestId,actor,reason,choices}){
 validateRecipientReview(review);
 const {sha256,...body}=comparison;need(sha256===hash(body)&&comparison.returnSha256===review.sha256,'REVIEW_COMPARISON','Use the exact complete current comparison.');
 identifier(requestId);text(actor,'Receiving operator',160);text(reason,'Receiving reason',3000);
 need(Array.isArray(choices)&&choices.length===comparison.rows.length,'REVIEW_CHOICES','Choose Keep current or Adopt for every returned context.');
 const selected=new Map();for(const choice of choices){need(object(choice)&&!selected.has(choice.id)&&['keep','adopt'].includes(choice.choice),'REVIEW_CHOICES','Each context needs one explicit choice.');selected.set(choice.id,choice.choice);}
 for(const row of comparison.rows){need(selected.has(row.id),'REVIEW_CHOICES','A returned context has no choice.');if(selected.get(row.id)==='adopt')need(row.eligible&&!row.unchanged,'REVIEW_NOT_ADOPTABLE','Keep unchanged or changed-material decisions; request a new source review where needed.');}
 const request={requestId,reviewText:exportRecipientReview(review),expectedComparisonSha256:comparison.sha256,actor,reason,
  choices:comparison.rows.map(row=>({id:row.id,choice:selected.get(row.id)}))};
 need(utf8ByteLength(JSON.stringify(request,null,2)+'\n')<=8*1024*1024,'REVIEW_LIMIT','The complete receiving request exceeds 8 MiB. Preserve this review and split the proposed work.');return request;
}
export function exportRecipientWorking(bundle,review,draft={},author=null){
 if(review){validateRecipientReview(review);need(review.base.bundle.sha256===bundle.identity.sha256,'REVIEW_OTHER_BUNDLE','The working copy must contain its original bundle.');}
 validateDraft(draft);
 need(utf8ByteLength(JSON.stringify(draft))<=16384,'REVIEW_DRAFT','The unfinished form exceeds 16 KiB.');
 if(review)compareRecipientReview(recipientView(bundle),review);
 if(author)validateAuthor(author,bundle);
 const value={schema:REVIEW_WORKING_SCHEMA,bundle:{name:bundle.name,text:bundle.text,sha256:bundle.identity.sha256},review,draft:copy(draft),author:copy(author)};
 const source=JSON.stringify(value);need(utf8ByteLength(source+'\n')<=MAX_WORKING_BYTES,'REVIEW_LIMIT','The complete working copy exceeds 400 MiB.');return source+'\n';
}
export function openRecipientWorking(source){
 need(typeof source==='string'&&utf8ByteLength(source)<=MAX_WORKING_BYTES,'REVIEW_LIMIT','Choose a complete working copy of at most 400 MiB.');
 let value;try{value=JSON.parse(source);}catch{fail('REVIEW_JSON','The working copy is not complete JSON.');}
 need(value?.schema===REVIEW_WORKING_SCHEMA&&object(value.bundle)&&object(value.draft),'REVIEW_WORKING','Choose the complete original working review.');
 const bundle=openText(value.bundle.text,{name:value.bundle.name});
 need(bundle.identity.sha256===value.bundle.sha256,'REVIEW_OTHER_BUNDLE','The retained original bundle differs.');
 if(value.review){validateRecipientReview(value.review);need(value.review.base.bundle.sha256===bundle.identity.sha256&&value.review.base.bundle.bytes===bundle.identity.bytes,'REVIEW_OTHER_BUNDLE','The review belongs to another original bundle.');}
 need(utf8ByteLength(JSON.stringify(value.draft))<=16384,'REVIEW_DRAFT','The unfinished form exceeds 16 KiB.');
 validateDraft(value.draft);if(value.review)compareRecipientReview(recipientView(bundle),value.review);
 if(value.author)validateAuthor(value.author,bundle);
 return {bundle,review:value.review,draft:copy(value.draft),author:copy(value.author??null)};
}
