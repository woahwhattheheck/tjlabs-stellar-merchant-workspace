// MIT. Paged views of the original handover records; no alternate state writer.
import { HASH, canonical, digest, exact } from './handover-files.mjs';

const fail=message=>{throw Object.assign(new Error(message),{code:'CAPTURED_HANDOVER_PAGE',status:409});};
const copy=value=>JSON.parse(JSON.stringify(value));
const snapshot=value=>digest(canonical(value));
function selected(value,allowed,defaultView) {
  exact(value,['view','offset','limit','expectedSnapshot']);
  const view=value.view??defaultView;
  if(!allowed.includes(view))fail('Select an original handover record view.');
  const offset=Number(value.offset??0),limit=Number(value.limit??25);
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)
    fail('Choose a nonnegative offset and a page of 1–100 original rows.');
  if(value.expectedSnapshot!==undefined&&!HASH.test(value.expectedSnapshot))
    fail('Continue the original returned snapshot SHA-256.');
  return {view,offset,limit,expectedSnapshot:value.expectedSnapshot};
}
function page(rows,input,identity) {
  if(input.expectedSnapshot!==undefined&&input.expectedSnapshot!==identity)
    fail('The original record advanced. Reopen its first page or select its saved revision.');
  return {snapshot:identity,offset:input.offset,limit:input.limit,total:rows.length,
    nextOffset:input.offset+input.limit<rows.length?input.offset+input.limit:null,
    rows:copy(rows.slice(input.offset,input.offset+input.limit))};
}
function checked(identity,input) {
  if(input.expectedSnapshot!==undefined&&input.expectedSnapshot!==identity)
    fail('The original record advanced. Reopen its first page or select its saved revision.');
  return identity;
}
function formSummary(form) {
  if(!form)return null;
  return {label:form.label,...(Array.isArray(form.packages)?{
    packages:form.packages.length,sources:form.sources.length,
  }:{bundle:form.bundle,manifestSha256:form.manifestSha256,names:Object.keys(form.names??{}).length})};
}
/** The exact complete inventory determines all pages, including other row kinds. */
export function capturedHandoverInventoryPage(native,value={}) {
  const input=selected(value,['summary','packages','sources'],'summary');
  const {packages,sources,...metadata}=native;
  if(!Array.isArray(packages)||!Array.isArray(sources))fail('Open the complete original handover inventory.');
  const identity=snapshot(native),base={...metadata,view:input.view,snapshot:checked(identity,input),
    packages:packages.length,sources:sources.length};
  return input.view==='summary'?base:{...base,...page(native[input.view],input,identity)};
}
/** Historical form pages stay bound to their immutable edition when the working draft advances. */
export function capturedHandoverDraftPage(native,value={}) {
  const input=selected(value,['summary','form','history','packages','sources','names'],'summary');
  const {edition,history,...metadata}=native,form=edition?.form;
  const {form:omitted,...editionMetadata}=edition??{};
  const base={...metadata,edition:edition?{...editionMetadata,form:formSummary(form)}:null,
    history:history.length,view:input.view};
  const identity=input.view==='history'||input.view==='summary'
    ?snapshot({id:native.id,revision:native.revision,currentRevision:native.currentRevision,history})
    :native.revision;
  checked(identity,input);
  if(input.view==='summary')return {...base,snapshot:identity};
  if(input.view==='form')return {...base,snapshot:identity,form:copy(form)};
  let rows;
  if(input.view==='history')rows=history;
  else if(input.view==='names'&&native.kind==='RECEIVING')
    rows=Object.entries(form.names).map(([name,targetName])=>({name,targetName})).sort((a,b)=>a.name.localeCompare(b.name));
  else if(['packages','sources'].includes(input.view)&&native.kind==='OUTGOING')rows=form[input.view];
  else fail('Select the row kind retained by this original outgoing or receiving draft.');
  return {...base,...page(rows,input,identity)};
}
function resultSummary(result) {
  if(!result)return null;
  const {packages,sources,binding,...rest}=result;
  const counts=rows=>Array.isArray(rows)?rows.length:rows;
  return {...rest,...(packages===undefined?{}:{packages:counts(packages)}),
    ...(sources===undefined?{}:{sources:counts(sources)}),
    ...(binding?{binding:{...binding,names:binding.names?.length??0}}:{})};
}
/** Native job IDs and request hashes remain unchanged by these read projections. */
export function capturedHandoverJobPage(native,value={}) {
  const input=selected(value,['summary','selection','packages','sources','names'],'summary');
  const {selected:selection,result,...metadata}=native;
  const base={...metadata,selected:selection?{...selection,
    ...(selection.form?{form:formSummary(selection.form)}:{})}:null,
    result:resultSummary(result),view:input.view};
  const identity=snapshot({id:native.id,requestSha256:native.requestSha256,state:native.state,
    selected:selection,result,completedAt:native.completedAt,attempts:native.attempts,error:native.error});
  checked(identity,input);
  if(input.view==='summary')return {...base,snapshot:identity};
  if(input.view==='selection')return {...base,snapshot:identity,selection:copy(selection)};
  const rows=input.view==='names'?result?.binding?.names:result?.[input.view];
  if(!Array.isArray(rows))
    fail('Use the original document tool for published collection rows, or a receiving job for result rows.');
  return {...base,...page(rows,input,identity)};
}

/** Every page stays bound to the same full original base/current/form/choice review. */
export function capturedDraftReviewPage(native,value={}) {
  const input=selected(value,['summary','conflicts','changes','form'],'summary');
  if(native.schema!=='stellar-forge.captured-draft-review.v1'||!HASH.test(native.reviewSha256??'')||
    !Array.isArray(native.merge?.conflicts)||!Array.isArray(native.merge?.changes))
    fail('Read the complete original draft reconciliation.');
  const identity=native.reviewSha256;checked(identity,input);
  const base={schema:native.schema,productId:native.productId,id:native.id,kind:native.kind,
    baseRevision:native.baseRevision,currentRevision:native.currentRevision,
    baseSequence:native.baseSequence,currentSequence:native.currentSequence,
    reviewSha256:identity,snapshot:identity,view:input.view,status:native.merge.status,
    conflicts:native.merge.conflicts.length,
    unresolved:native.merge.conflicts.filter(row=>!row.choice).length,
    changes:native.merge.changes.length,resolutions:copy(native.resolutions),
    working:formSummary(native.working),form:formSummary(native.merge.form)};
  if(input.view==='summary')return base;
  if(input.view==='form')return {...base,form:copy(native.merge.form)};
  return {...base,...page(native.merge[input.view],input,identity)};
}
