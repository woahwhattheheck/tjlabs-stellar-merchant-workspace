// MIT. Customer returned Support work over the original OperatingPlanReturn engine.
import {inspectOperatingPlan, operatingPlanDraft, saveOperatingPlanRevision,
  inspectOperatingFile, operatingFileBytes} from './operating-plan.mjs';
import {inspectSupportOperatingSource, recordSupportOperatingResult,
  SUPPORT_OPERATING_PHASES} from './support-operating-plan.mjs';
import {inspectOperatingPlanReturn, createOperatingPlanReturn, compareOperatingPlanReturn,
  reviseOperatingPlanReturn, decideOperatingPlanReturn, applyOperatingPlanReturn,
  renderOperatingPlanReturnHTML, OPERATING_RETURN_MAX_BYTES} from './operating-plan-return.mjs';

export const SUPPORT_OPERATING_RETURN_SCHEMA = 'stellar-forge.oauth-support-operating-return.v1';
export const SUPPORT_OPERATING_WORK_SCHEMA = 'stellar-forge.oauth-support-operating-work.v1';
const LEGACY_RESULT = 'stellar-forge.oauth-support-operating-result.v1';
const BINDING = 'stellar-forge.oauth-support-operating-binding.v1';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = value => JSON.parse(JSON.stringify(value));
const canonical = value => Array.isArray(value) ? value.map(canonical) : plain(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const fail = (code,message) => { throw Object.assign(new TypeError(message),{code}); };
const need = (condition,code,message) => { if(!condition)fail(code,message); };
function fields(value, allowed, label) {
  need(plain(value) && Object.keys(value).every(key => allowed.includes(key)),
    'SUPPORT_RETURN_FIELDS',label+' contains unsupported fields.');
}
function bounded(value) {
  let text;
  try { text=JSON.stringify(value); } catch { fail('SUPPORT_RETURN_JSON','Use complete JSON without cycles.'); }
  need(typeof text==='string' && new TextEncoder().encode(text).length<=OPERATING_RETURN_MAX_BYTES,
    'SUPPORT_RETURN_SIZE','The complete Support return must fit the original 128 MiB receiving limit.');
}
function originalBinding(plan) {
  let value;
  try { value=JSON.parse(plan.revisions[0].notes); } catch {}
  need(value?.schema===BINDING && plain(value.case) && plain(value.artifacts),
    'SUPPORT_RETURN_BINDING','Use the complete plan originally prepared from a Support case.');
  return value;
}
const sourceKey = source => JSON.stringify([source.id,source.capturedAt,source.case.id,source.case.revision]);
const resultKey = source => JSON.stringify([source.id,source.capturedAt,source.case.id,source.case.revision]);
const selectedBinding = source => ({schema:BINDING,sourceId:source.id,capturedAt:source.capturedAt,
  case:{id:source.case.id,revision:source.case.revision},
  artifacts:{caseSnapshot:source.artifacts.caseSnapshot,workspace:source.artifacts.workspace,runtime:source.artifacts.runtime},
  incidentSource:source.incidentSource});
function sourcesFor(plan, values) {
  need(Array.isArray(values)&&values.length>0,'SUPPORT_RETURN_SOURCES','Retain the original source descriptor and every result source.');
  const binding=originalBinding(plan), sources=values.map(inspectSupportOperatingSource), byKey=new Map();
  for(const source of sources) {
    need(source.case.id===binding.case.id && (source.case.revision===binding.case.revision ||
      source.case.ancestors.includes(binding.case.revision)), 'SUPPORT_RETURN_CASE_LINEAGE',
      'Every selected source must belong to the original case revision or its retained continuation.');
    const key=sourceKey(source);
    need(!byKey.has(key),'SUPPORT_RETURN_SOURCE_DUPLICATE','Each complete source selection must appear once.');
    byKey.set(key,source);
  }
  need(sources.some(source=>same(selectedBinding(source),binding)),
    'SUPPORT_RETURN_ORIGINAL_SOURCE','Retain the exact source descriptor used to create the original plan.');
  return {sources,byKey,binding};
}
async function fileHash(file, cache) {
  const inspected=inspectOperatingFile(file);
  let digest=cache.get(inspected.content);
  if(!digest) {
    need(globalThis.crypto?.subtle,'SUPPORT_RETURN_CRYPTO','This receiving runtime needs WebCrypto SHA-256.');
    digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',operatingFileBytes(inspected))),
      value=>value.toString(16).padStart(2,'0')).join('');
    cache.set(inspected.content,digest);
  }
  return digest;
}
function parseResult(step) {
  let value;
  try { value=JSON.parse(step.recordedResult); } catch {}
  if(value?.schema!==LEGACY_RESULT && value?.schema!==SUPPORT_OPERATING_WORK_SCHEMA) {
    need(step.status!=='completed','SUPPORT_RETURN_COMPLETION_EVIDENCE',
      'A completed Support step needs its original source-bound result and selected evidence.');
    return null;
  }
  fields(value,['schema','summary','reviewedBy','source','evidence',...(value.schema===SUPPORT_OPERATING_WORK_SCHEMA?['files']:[])],
    'Support result');
  need(typeof value.summary==='string'&&value.summary.trim()&&value.summary.length<=16000 &&
    typeof value.reviewedBy==='string'&&value.reviewedBy.length<=300,
    'SUPPORT_RETURN_RESULT','Retain the complete result summary and attributed operator.');
  fields(value.source,['id','capturedAt','case'],'Result source');
  fields(value.source.case,['id','revision'],'Result case');
  need(Array.isArray(value.evidence)&&value.evidence.length<=100 &&
    new Set(value.evidence.map(row=>row?.id)).size===value.evidence.length,
    'SUPPORT_RETURN_EVIDENCE','Retain distinct original evidence references.');
  need(step.status!=='completed'||value.evidence.length>0,'SUPPORT_RETURN_COMPLETION_EVIDENCE',
    'A completed Support step needs at least one selected returned artifact.');
  return value;
}
async function validatePlan(plan, context, cache) {
  const saved=inspectOperatingPlan(plan);
  need(same(originalBinding(saved),context.binding),'SUPPORT_RETURN_BINDING',
    'The complete plans must retain the same original Support source binding.');
  for(const revision of saved.revisions) for(const step of revision.steps) {
    if(!SUPPORT_OPERATING_PHASES.some(phase=>step.id==='support-'+phase))continue;
    const result=parseResult(step);if(!result)continue;
    const source=context.byKey.get(resultKey(result.source));
    need(source,'SUPPORT_RETURN_RESULT_SOURCE','Retain the complete descriptor for every recorded Support result.');
    for(const row of result.evidence) need(source.evidence.some(original=>same(original,row)),
      'SUPPORT_RETURN_EVIDENCE','A recorded artifact differs from its original selected source.');
    if(result.schema!==SUPPORT_OPERATING_WORK_SCHEMA)continue;
    need(Array.isArray(result.files)&&result.files.length===result.evidence.length &&
      new Set(result.files.map(row=>row?.evidenceId)).size===result.files.length,
      'SUPPORT_RETURN_FILES','Keep one complete carried-file association for each selected artifact.');
    for(const association of result.files) {
      fields(association,['evidenceId','fileId','artifact'],'Carried evidence association');
      const evidence=result.evidence.find(row=>row.id===association.evidenceId);
      need(evidence&&same(evidence.artifact,association.artifact),'SUPPORT_RETURN_FILES',
        'The carried file must retain its selected original artifact identity.');
      const file=step.files?.find(row=>row.id===association.fileId);
      need(file&&file.bytes===evidence.artifact.bytes,'SUPPORT_RETURN_FILES',
        'The complete selected artifact is missing from its original Support step.');
      need(await fileHash(file,cache)===evidence.artifact.sha256,'SUPPORT_RETURN_FILE_HASH',
        'The carried artifact bytes differ from their selected source SHA-256.');
    }
  }
  return saved;
}
/** Record actual returned files without altering the native case. Existing unrelated files remain. */
export async function recordSupportOperatingWork(plan, options) {
  fields(options,['source','stepId','status','result','owner','savedAt','files'],'Returned Support work');
  const {files,...request}=options;
  const selected=inspectSupportOperatingSource(request.source), current=inspectOperatingPlan(plan);
  need(typeof request.savedAt==='string'&&request.savedAt,'SUPPORT_RETURN_TIME',
    'Retain the exact savedAt before recording the original returned work.');
  const recorded=recordSupportOperatingResult(current,request);
  need(Array.isArray(files)&&files.length===request.result.evidenceIds.length,
    'SUPPORT_RETURN_FILES','Supply the complete file for every selected evidence ID.');
  const resultStep=copy(recorded.revisions.at(-1).steps.find(row=>row.id===request.stepId));
  const result=JSON.parse(resultStep.recordedResult), associations=[], seen=new Set(), cache=new Map();
  const carried=[...(resultStep.files??[])];
  for(const row of files) {
    fields(row,['evidenceId','file'],'Returned evidence file');
    need(!seen.has(row.evidenceId),'SUPPORT_RETURN_FILES','Each evidence ID may be supplied once.');
    seen.add(row.evidenceId);
    const evidence=result.evidence.find(value=>value.id===row.evidenceId);
    need(evidence,'SUPPORT_RETURN_FILES','Choose a file for an explicitly selected evidence ID.');
    const file=inspectOperatingFile(row.file);
    need(file.bytes===evidence.artifact.bytes&&await fileHash(file,cache)===evidence.artifact.sha256,
      'SUPPORT_RETURN_FILE_HASH','The complete file does not match its retained source size and hash.');
    const previous=carried.find(value=>value.id===file.id);
    need(!previous||same(previous,file),'SUPPORT_RETURN_FILE_ID',
      'That original file ID already carries different work; retain it and select a new file ID.');
    if(!previous)carried.push(file);
    associations.push({evidenceId:row.evidenceId,fileId:file.id,artifact:copy(evidence.artifact)});
  }
  need(result.evidence.every(row=>seen.has(row.id)),'SUPPORT_RETURN_FILES','A selected evidence body is missing.');
  resultStep.files=carried;
  resultStep.recordedResult=JSON.stringify({...result,schema:SUPPORT_OPERATING_WORK_SCHEMA,files:associations},null,2);
  const draft=operatingPlanDraft(current),index=draft.content.steps.findIndex(row=>row.id===request.stepId);
  draft.content.steps[index]=resultStep;
  const output=saveOperatingPlanRevision(current,draft,{savedAt:request.savedAt});
  bounded(output);
  return output;
}
/** Verify complete original histories and every source-bound carried body. Native companion receiving remains separate. */
export async function inspectSupportOperatingReturn(value) {
  fields(value,['schema','sources','review'],'Support returned work');
  need(value.schema===SUPPORT_OPERATING_RETURN_SCHEMA,'SUPPORT_RETURN_SCHEMA','Choose a complete Support returned-work package.');
  bounded(value);
  const review=inspectOperatingPlanReturn(value.review), context=sourcesFor(review.current,value.sources),cache=new Map();
  await validatePlan(review.current,context,cache);
  await validatePlan(review.incoming,context,cache);
  if(review.completion)await validatePlan(review.completion.plan,context,cache);
  return {schema:SUPPORT_OPERATING_RETURN_SCHEMA,sources:context.sources,review};
}
export async function createSupportOperatingReturn(current,incoming,{sources,...options}={}) {
  need(typeof options.createdAt==='string'&&options.createdAt,'SUPPORT_RETURN_TIME',
    'Retain the original review createdAt before preparing returned work.');
  return inspectSupportOperatingReturn({schema:SUPPORT_OPERATING_RETURN_SCHEMA,sources,
    review:createOperatingPlanReturn(current,incoming,options)});
}
export async function compareSupportOperatingReturn(value) {
  const selected=await inspectSupportOperatingReturn(value);
  const compared=compareOperatingPlanReturn(selected.review);
  if(compared.issues.length===0) {
    try {
      const projected=saveOperatingPlanRevision(selected.review.current,compared.draft,
        {savedAt:selected.review.current.revisions.at(-1).savedAt});
      await validatePlan(projected,sourcesFor(selected.review.current,selected.sources),new Map());
    } catch(error) {
      compared.issues.push({key:'/support-source',message:(error.code?error.code+': ':'')+error.message});
      compared.ready=false;
    }
  }
  return compared;
}
export async function reviseSupportOperatingReturn(value,updates) {
  const selected=await inspectSupportOperatingReturn(value);
  return inspectSupportOperatingReturn({...selected,review:reviseOperatingPlanReturn(selected.review,updates)});
}
export async function decideSupportOperatingReturn(value,key,decision=null) {
  const selected=await inspectSupportOperatingReturn(value);
  return inspectSupportOperatingReturn({...selected,review:decideOperatingPlanReturn(selected.review,key,decision)});
}
/** Persist value before writing plan through the original destination's guarded transaction. */
export async function applySupportOperatingReturn(value,{current=value?.review?.current,savedAt}={}) {
  const selected=await inspectSupportOperatingReturn(value);
  need(typeof savedAt==='string'&&savedAt,'SUPPORT_RETURN_TIME','Retain the exact savedAt for this review completion.');
  const result=applyOperatingPlanReturn(selected.review,{current,savedAt});
  const completed=await inspectSupportOperatingReturn({...selected,review:result.review});
  return {value:completed,plan:result.plan,alreadyPresent:result.alreadyPresent,
    addedRevisions:result.addedRevisions,reviewedRevisions:result.reviewedRevisions};
}
export async function renderSupportOperatingReturnHTML(value) {
  const selected=await inspectSupportOperatingReturn(value);
  const escape=value=>String(value).replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
  const detail='<details><summary>Complete Support source descriptors and returned-work package</summary><pre>'+
    escape(JSON.stringify(selected,null,2))+'</pre></details>';
  return renderOperatingPlanReturnHTML(selected.review).replace('</body>',detail+'</body>');
}
