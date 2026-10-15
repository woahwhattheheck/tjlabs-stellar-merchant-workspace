// MIT. Portable provenance for completed original CSV imports; no native writes.
import {sha256Text} from './awards-import-hash.mjs';
import {materializeAwardCsvRowReview} from './awards-import-row-review.mjs';
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const canonical=v=>Array.isArray(v)?v.map(canonical):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const clone=v=>JSON.parse(JSON.stringify(v)),same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const digest=v=>sha256Text(JSON.stringify(canonical(v)));
const HASH=/^[0-9a-f]{64}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const need=(ok,m)=>{if(!ok)throw Object.assign(new Error(m),{code:'GRANT_AWARDS_CONTINUATION'});};
const exact=(v,keys)=>need(plain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),'Keep the complete original continuation fields.');
export const AWARD_CSV_CONTINUATION_SCHEMA='stellar-forge.awards-csv-completed-continuation.v1';
function sealed(value){
  need(plain(value)&&HASH.test(value.sha256??''),'Keep a sealed complete predecessor.');
  const {sha256,...body}=value;need(digest(body)===sha256,'The retained predecessor or completion evidence has changed.');
}
function identity(value){
  exact(value,['id','revision','snapshot']);need(UUID.test(value.id??'')&&Number.isSafeInteger(value.revision)&&value.revision>0&&HASH.test(value.snapshot??''),'Keep the historical result portfolio identity.');
}
function checked(value,csv,depth=0){
  need(depth<64,'Keep this continuation within 64 explicitly retained generations.');
  exact(value,['schema','previous','outcomes','sha256']);sealed(value);
  need(value.schema===AWARD_CSV_CONTINUATION_SCHEMA,'Open a completed original row continuation.');
  const previous=value.previous;sealed(previous);
  need(['stellar-forge.awards-csv-import-session.v2','stellar-forge.awards-csv-import-session.v3'].includes(previous.schema)&&previous.input?.rowReview,
    'Continue a complete original reviewed session.');
  const review=previous.input.rowReview,materialized=materializeAwardCsvRowReview(review,csv);
  need(previous.source.sha256===review.source.sha256&&previous.source.bytes===review.source.bytes&&previous.source.filename===review.source.filename&&
    previous.portfolio.id===review.portfolio.id&&same(previous.round,review.round),'Keep the same complete original source, portfolio and round.');
  const older=previous.input.continuation?checked(previous.input.continuation,csv,depth+1):[];
  if(previous.input.continuation)compatible(previous.input.continuation,review,csv,older);
  const carried=new Set(older.map(row=>row.rowIndex)),expected=new Set(materialized.acceptedRowIndexes.filter(i=>!carried.has(i))),seen=new Set();
  need(Array.isArray(previous.batches)&&Array.isArray(value.outcomes)&&value.outcomes.length===previous.batches.length,
    'Retain one completed original outcome for every predecessor batch.');
  const rows=[...older];
  for(const [index,outcome]of value.outcomes.entries()){
    exact(outcome,['index','operationId','requestSha256','inputSha256','result','applications']);
    const batch=previous.batches[index];identity(outcome.result);
    need(outcome.index===index&&outcome.operationId===batch.operationId&&HASH.test(outcome.requestSha256??'')&&HASH.test(outcome.inputSha256??'')&&
      outcome.result.id===previous.portfolio.id&&outcome.result.revision>previous.portfolio.revision,
      'Keep each completed original operation and its actual resulting portfolio.');
    need(Array.isArray(outcome.applications)&&outcome.applications.length===batch.rowIndexes.length,'Retain every completed original application row.');
    for(const [position,row]of outcome.applications.entries()){
      exact(row,['rowIndex','originalRowSha256','applicationId','revision','sha256']);
      const decision=review.rows[row.rowIndex];
      need(row.rowIndex===batch.rowIndexes[position]&&expected.has(row.rowIndex)&&!seen.has(row.rowIndex)&&decision?.disposition==='accepted'&&
        row.originalRowSha256===decision.originalRowSha256&&row.applicationId===decision.applicationId&&Number.isSafeInteger(row.revision)&&row.revision>0&&HASH.test(row.sha256??''),
        'Keep the exact accepted original row, application and historical result identity.');
      seen.add(row.rowIndex);rows.push({...row,sessionId:previous.sessionId,sessionSha256:previous.sha256,
        operationId:outcome.operationId,requestSha256:outcome.requestSha256,result:clone(outcome.result)});
    }
  }
  need(seen.size===expected.size,'Every previously accepted row must have one completed original result.');
  return rows.sort((a,b)=>a.rowIndex-b.rowIndex);
}
function compatible(continuation,review,csv,rows){
  const previous=continuation.previous,old=previous.input.rowReview;
  materializeAwardCsvRowReview(review,csv);
  need(same(old.source,review.source)&&old.portfolio.id===review.portfolio.id&&same(old.round,review.round)&&
    old.status===review.status&&same(old.mapping,review.mapping)&&review.previousReviewSha256===old.sha256,
    'Keep the original source, round, mapped meanings, submission status and preceding review identity.');
  for(const row of rows){
    const before=old.rows[row.rowIndex],after=review.rows[row.rowIndex];
    need(same(before,after),'A completed original accepted decision cannot be relabelled or corrected; preserve its recorded history.');
  }
  const oldRows=materializeAwardCsvRowReview(old,csv).rows,map=old.mapping;
  for(const row of rows){
    const value=oldRows[row.rowIndex],partner=value[map.partnerKey],project=map.projectKey&&value[map.projectKey];
    need(old.identities.partners[partner]===review.identities.partners[partner]&&
      (!project||old.identities.projects?.[project]===review.identities.projects?.[project]),
      'A carried application keeps its original selected organisation and project identities.');
  }
}
export function verifyAwardCsvContinuation(value,csv){
  const out=clone(value);checked(out,csv);
  need(new TextEncoder().encode(JSON.stringify(canonical(out))+'\n').length<=32*1024*1024,'Keep the complete predecessor history and outcomes within 32 MiB.');
  return out;
}
export function prepareAwardCsvContinuation(previous,outcomes,csv){
  const body={schema:AWARD_CSV_CONTINUATION_SCHEMA,previous:clone(previous),outcomes:clone(outcomes)};
  return verifyAwardCsvContinuation({...body,sha256:digest(body)},csv);
}
export function carriedAwardCsvRows(continuation,review,csv){
  const rows=checked(continuation,csv);compatible(continuation,review,csv,rows);return clone(rows);
}
export function completedAwardCsvRows(continuation,csv){return clone(checked(continuation,csv));}
export function encodeAwardCsvContinuation(value){
  sealed(value);return new TextEncoder().encode(JSON.stringify(canonical(value))+'\n');
}
