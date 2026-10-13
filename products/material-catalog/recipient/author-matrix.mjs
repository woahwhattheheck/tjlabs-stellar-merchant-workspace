// MIT. Cross-reviewer reading of original Material returns; no decision writer.
import {canonical} from './core.mjs';
import {sha256Utf8} from './sha256.mjs';
import {validateAuthorWorklist} from './author-worklist.mjs';
import {openRecipientReview} from './review.mjs';
export const AUTHOR_MATRIX_SCHEMA='stellar-forge.material-author-matrix.v1';
const need=(ok,message)=>{if(!ok)throw Error(message);};
const hash=value=>sha256Utf8(canonical(value)).sha256;
const same=(a,b)=>canonical(a)===canonical(b);
const copy=value=>JSON.parse(JSON.stringify(value));
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
/** Each observation comes from the unchanged preview in ONE original read snapshot. */
export function buildAuthorDecisionMatrix(worklist,{catalog,observedAt,inputSha256,observations}){
 validateAuthorWorklist(worklist);
 need(object(catalog)&&typeof catalog.id==='string'&&typeof catalog.tenantId==='string','Select the complete original catalogue.');
 need(typeof observedAt==='string'&&Number.isFinite(Date.parse(observedAt))&&/^[a-f0-9]{64}$/.test(inputSha256),'Retain the observation time and exact uploaded worklist SHA256.');
 const selected=worklist.items.filter(item=>item.catalogId===catalog.id);
 need(Array.isArray(observations)&&observations.length===selected.length,'Retain one complete observation for every return in this catalogue.');
 const seen=new Set(),groups=new Map(),returns=[];
 for(let index=0;index<selected.length;index++){
  const item=selected[index],review=openRecipientReview(item.returnText),observed=observations[index];
  need(object(observed)&&observed.returnId===item.id&&!seen.has(item.id),'Original return order or identity differs.');seen.add(item.id);
  need(review.base.catalog.tenantId===catalog.tenantId,'The return tenant differs from this catalogue.');
  let comparison=null,blocked=null;
  if(observed.comparison!==null&&observed.comparison!==undefined){
   need(observed.error===undefined,'Use either a complete comparison or a source error.');
   comparison=observed.comparison;
   const {sha256,...body}=comparison;
   need(sha256===hash(body)&&comparison.schema==='stellar-forge.material-recipient-comparison.v1'&&comparison.reviewId===review.id&&comparison.returnSha256===review.sha256&&same(comparison.catalog,catalog),'The original complete comparison or catalogue identity differs.');
   need(Array.isArray(comparison.rows)&&comparison.rows.length===review.entries.length&&comparison.rows.every((row,i)=>row.id===review.entries[i].id&&same(row.proposal,review.entries[i])),'The comparison must retain every original proposal in order.');
  }else{
   need(object(observed.error)&&typeof observed.error.code==='string'&&typeof observed.error.message==='string','Retain the original blocked-source explanation.');
   blocked=copy(observed.error);
  }
  returns.push({returnId:item.id,reviewId:review.id,reviewSha256:review.sha256,reviewer:review.reviewer,createdAt:review.createdAt,
   base:copy(review.base),contexts:review.entries.length,comparisonSha256:comparison?.sha256??null,blocked,
   savedDraft:item.draft?{comparisonSha256:item.draft.comparison.sha256,catalog:copy(item.draft.comparison.catalog),
    matchesObservation:comparison?item.draft.comparison.sha256===comparison.sha256:false,choices:copy(item.draft.choices),
    actor:item.draft.actor,reason:item.draft.reason}:null,
   historicalDrafts:item.history.length,requests:item.requests.map(x=>({requestId:x.request.requestId,sha256:sha256Utf8(x.raw).sha256})),
   outcomes:item.outcomes.map(x=>({requestId:x.id,state:x.state}))});
  review.entries.forEach((proposal,rowIndex)=>{
   let group=groups.get(proposal.id);
   if(!group){group={id:proposal.id,customerId:proposal.customerId,description:proposal.description,current:null,currentObserved:false,
    proposals:[],absentReturnIds:[],disagreement:false,staleBasis:false,blocked:false};groups.set(proposal.id,group);}
   need(group.customerId===proposal.customerId,'The original customer identity differs.');
   // The unchanged review validator already binds this ID to its normalized customer context.
   // Keep every literal description in its complete attributed proposal; spelling is not a new context.
   const row=comparison?.rows[rowIndex]??null;
   if(row){if(group.currentObserved)need(same(group.current,row.current),'Current decisions changed across observations. Refresh the one original snapshot.');else{group.current=copy(row.current);group.currentObserved=true;}}
   const sourceStale=Boolean(row&&(!row.eligible||row.conflict));
   group.proposals.push({returnId:item.id,rowIndex,proposal:copy(proposal),originalDecision:copy(proposal.originalDecision),currentMaterial:row?copy(row.currentMaterial):null,
    eligible:row?.eligible??null,unchanged:row?.unchanged??null,decisionChanged:row?.conflict??null,
    reason:row?.reason??blocked.message,sourceStale,blocked:Boolean(blocked),
    authorChoice:item.draft?.choices[proposal.id]??null,choiceMatchesObservation:Boolean(comparison&&item.draft?.comparison.sha256===comparison.sha256)});
   group.staleBasis||=sourceStale;group.blocked||=Boolean(blocked);
  });
 }
 const rows=[...groups.values()];
 for(const row of rows){
  const choices=new Set(row.proposals.map(x=>canonical({status:x.proposal.status,note:x.proposal.note,materialKey:x.proposal.material.key,materialSha256:x.proposal.material.sha256})));
  row.disagreement=choices.size>1;
  const supplied=new Set(row.proposals.map(x=>x.returnId));row.absentReturnIds=returns.filter(x=>!supplied.has(x.returnId)).map(x=>x.returnId);
 }
 rows.sort((a,b)=>a.customerId.localeCompare(b.customerId)||a.description.localeCompare(b.description)||a.id.localeCompare(b.id));
 const body={schema:AUTHOR_MATRIX_SCHEMA,workspaceId:worklist.workspaceId,inputSha256,observedAt,catalog:copy(catalog),
  summary:{returns:returns.length,contexts:rows.length,disagreements:rows.filter(x=>x.disagreement).length,
   staleBases:rows.filter(x=>x.staleBasis).length,blockedReturns:returns.filter(x=>x.blocked).length,
   missingProposals:rows.reduce((n,x)=>n+x.absentReturnIds.length,0)},
  returns,rows,observations:copy(observations),
  interpretation:'A missing proposal is absence, never Keep current. Each return remains separately attributed even when reviewers share a name. This is one read-only snapshot; opening a return requires a new complete comparison and explicit original choices before adoption.'};
 return {...body,sha256:hash(body)};
}
export function validateAuthorDecisionMatrix(worklist,value){
 need(object(value)&&value.schema===AUTHOR_MATRIX_SCHEMA,'Open a complete author decision matrix.');
 const expected=buildAuthorDecisionMatrix(worklist,value);
 need(same(expected,value),'The complete matrix differs from its retained original observations.');
 return value;
}
