/**
 * Compare a complete adoption plan with an original frozen Operations cohort.
 * Native review classifications remain authoritative; this module joins them to
 * planned purchase opportunities without turning requests or task uses into sales.
 */
import {COHORT_PLAN_SCHEMA, COHORT_PLAN_REPORT_SCHEMA, evaluateCohortPlan} from './cohort_planning.mjs';

export const COHORT_DELIVERY_INPUT_SCHEMA = 'stellar-forge.sf47-cohort-delivery-input.v1';
export const COHORT_DELIVERY_COMPARISON_SCHEMA = 'stellar-forge.sf47-cohort-delivery-comparison.v1';
const EDITION_SCHEMA = 'stellar-forge.sf47-cohort-plan-edition.v1';
const REVIEW_SCHEMA = 'stellar-forge.sf47-cohort-evaluation.v1';
const LIMIT = 8 * 1024 * 1024;
const SCALE = 10n ** 30n;
const copy = value => JSON.parse(JSON.stringify(value));
const canonical = value => JSON.stringify(sortJson(value));
function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortJson(value[key])]));
  return value;
}
export class CohortDeliveryError extends Error {
  constructor(code, message, path = '') { super(message); this.name = 'CohortDeliveryError'; this.code = code; this.path = path; }
}
function fail(code, message, path = '') { throw new CohortDeliveryError(code, message, path); }
function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_COMPARISON', path + ' must be a JSON object.', path);
  return value;
}
function text(value, path, maximum = 20000) {
  if (typeof value !== 'string' || value.length > maximum) fail('INVALID_COMPARISON', path + ' must be text within ' + maximum + ' characters.', path);
  return value;
}
function list(value, path, maximum = 100000) {
  if (!Array.isArray(value) || value.length > maximum) fail('INVALID_COMPARISON', path + ' must be an array within ' + maximum + ' rows.', path);
  return value;
}
function unique(rows, key, path) {
  const found = new Set();
  for (const row of rows) {
    object(row, path);
    const id = text(row[key], path + '.' + key, 500);
    if (!id || found.has(id)) fail('DUPLICATE_IDENTITY', 'Each ' + path + ' needs a distinct ' + key + '.', path);
    found.add(id);
  }
  return rows;
}
function byteLength(value) {
  let length = 0;
  for (const char of value) { const code = char.codePointAt(0); length += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4; }
  return length;
}
function jsonSource(value, path) {
  object(value, path);
  let raw; try { raw = JSON.stringify(value); } catch { fail('INVALID_COMPARISON', path + ' must be complete JSON.', path); }
  if (byteLength(raw) > LIMIT) fail('COMPARISON_TOO_LARGE', path + ' exceeds the original 8 MiB attachment bound.', path);
  return copy(value);
}
function timestamp(value, path) {
  text(value, path, 100);
  const m = /^(\d{4}-\d{2}-\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,30}))?([Zz]|[+-]\d{2}(?::?\d{2})?)$/.exec(value);
  if (!m) fail('INVALID_COMPARISON_CLOCK', path + ' needs its original timezone-bearing ISO timestamp.', path);
  const source = m[1] + 'T' + m[2] + ':' + m[3] + ':' + (m[4] || '00') + '.000Z';
  const epoch = Date.parse(source);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== source) fail('INVALID_COMPARISON_CLOCK', path + ' is not a valid calendar time.', path);
  const zone = m[6], parts = zone.slice(1).replace(':', '');
  const hours = /^[Zz]$/.test(zone) ? 0 : Number(parts.slice(0, 2));
  const minutes = /^[Zz]$/.test(zone) || parts.length === 2 ? 0 : Number(parts.slice(2));
  if (hours > 23 || minutes > 59) fail('INVALID_COMPARISON_CLOCK', path + ' has an invalid timezone offset.', path);
  const offset = (hours * 60 + minutes) * 60000 * (zone[0] === '-' ? -1 : 1);
  const utc = epoch - offset;
  const day = new Date(utc).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail('INVALID_COMPARISON_CLOCK', path + ' exceeds the supported calendar.', path);
  return {source:value, ticks:BigInt(utc / 1000) * SCALE + BigInt((m[5] || '').padEnd(30, '0')), day};
}
function seconds(ticks) {
  const sign = ticks < 0n ? '-' : '', n = ticks < 0n ? -ticks : ticks;
  const fraction = (n % SCALE).toString().padStart(30, '0').replace(/0+$/, '');
  return sign + (n / SCALE).toString() + (fraction ? '.' + fraction : '');
}
function dayOf(value) { return value ? timestamp(value, 'Original observation time').day : null; }
function checkedPlan(document) {
  const source = object(document, 'planDocument');
  const plan = source.schema === EDITION_SCHEMA ? source.plan :
    source.schema === COHORT_PLAN_REPORT_SCHEMA && source.kind === 'PLAN' ? source.input : source;
  if (!plan || plan.schema !== COHORT_PLAN_SCHEMA) fail('PLAN_DOCUMENT_REQUIRED', 'Select the full adoption plan, saved edition, or original plan report.', 'planDocument');
  return evaluateCohortPlan(plan);
}
function checkedReview(document) {
  const review = object(document, 'review'), c = object(review.cohort, 'review.cohort');
  if (review.purpose !== 'COHORT_EVALUATION' || c.schema !== REVIEW_SCHEMA)
    fail('FROZEN_COHORT_REQUIRED', 'Select a complete original frozen COHORT_EVALUATION review.', 'review');
  text(review.id, 'review.id', 200);
  const snapshot = object(review.snapshot, 'review.snapshot');
  object(snapshot.program, 'review.snapshot.program'); object(c.source, 'review.cohort.source');
  if (snapshot.program.id !== c.source.programId) fail('REVIEW_SOURCE_CONFLICT', 'The frozen review and its original case identity differ.', 'review');
  if (!Number.isSafeInteger(review.version) || review.version !== c.source.version + 1)
    fail('REVIEW_SOURCE_CONFLICT', 'The frozen review must retain its original preparation version.', 'review.version');
  for (const [path, hash] of [['businessSha256',review.businessSha256],['measurementSha256',c.source.measurementSha256],['previewSha256',c.previewSha256],['planContentSha256',c.source.planContentSha256]])
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) fail('REVIEW_SOURCE_REQUIRED', 'Retain the original ' + path + '.', 'review.' + path);
  object(c.inputs, 'review.cohort.inputs'); object(c.window, 'review.cohort.window'); object(c.rule, 'review.cohort.rule');
  timestamp(c.window.asOfAt, 'review.cohort.window.asOfAt');
  for (const key of ['intents','selectedDeployments','targets']) unique(list(c[key], 'review.cohort.' + key, 10000), key === 'targets' ? 'key' : 'id', key);
  for (const key of ['observations','excludedObservations','issues','amounts','outcomes','products']) list(c[key], 'review.cohort.' + key, 10000);
  for (const key of ['operations','facilitators']) unique(list(c.inputs[key], 'review.cohort.inputs.' + key, 10000), 'id', key);
  unique(list(c.inputs.bindings, 'review.cohort.inputs.bindings', 10000), 'purchaseId', 'purchase associations');
  list(review.cohortHistory, 'review.cohortHistory', 100000);
  for (const intent of c.intents) {
    list(intent.purchaseIds, 'intent.purchaseIds', 10000); list(intent.completions, 'intent.completions', 100000);
    for (const field of ['inWindow','unplaced','attempted','settled','completeInWindow','independentCompleteInWindow','grossCompleteInWindow','laterCompletion','refundedAfterSettlement','cancelledAfterSettlement','teamOperated'])
      if (typeof intent[field] !== 'boolean') fail('REVIEW_FIELD_REQUIRED', 'Retain original intent classification ' + field + '.', 'intent.' + field);
    if (intent.firstAttemptAt) timestamp(intent.firstAttemptAt, 'intent.firstAttemptAt');
    for (const completion of intent.completions) timestamp(completion.completedAt, 'completion.completedAt');
  }
  return c;
}
export function seedCohortDeliveryComparison(planDocument, review, options = {}) {
  const plan = checkedPlan(planDocument); checkedReview(review);
  return {
    schema:COHORT_DELIVERY_INPUT_SCHEMA,
    planDocument:jsonSource(planDocument, 'planDocument'), review:jsonSource(review, 'review'),
    links:[], assignments:[],
    title:options.title || plan.input.name + ' — recorded delivery',
    note:options.note || '',
    recording:{editionId:options.editionId || '', createdAt:options.createdAt || '', actor:options.actor || '', planSourceId:options.planSourceId || ''}
  };
}
function normalizeInput(raw) {
  object(raw, 'input');
  if (raw.schema !== COHORT_DELIVERY_INPUT_SCHEMA) fail('INVALID_COMPARISON_SCHEMA', 'Use ' + COHORT_DELIVERY_INPUT_SCHEMA + '.', 'schema');
  const allowed = ['schema','planDocument','review','links','assignments','title','note','recording'];
  for (const key of Object.keys(raw)) if (!allowed.includes(key)) fail('UNKNOWN_COMPARISON_FIELD', 'Unknown comparison input: ' + key, key);
  const input = {
    schema:COHORT_DELIVERY_INPUT_SCHEMA,
    planDocument:jsonSource(raw.planDocument, 'planDocument'),review:jsonSource(raw.review, 'review'),
    links:list(raw.links || [], 'links', 10000).map((row,i) => {
      object(row, 'links.' + i);
      if (!['buyer','merchant','operation','facilitator'].includes(row.kind)) fail('INVALID_IDENTITY_LINK', 'Choose buyer, merchant, operation or facilitator.', 'links.' + i);
      return {kind:row.kind,plannedId:text(row.plannedId,'links.plannedId',500),observedId:text(row.observedId,'links.observedId',500),note:text(row.note || '','links.note')};
    }),
    assignments:list(raw.assignments || [], 'assignments', 10000).map(row => ({
      intentId:text(row.intentId,'assignments.intentId',500),targetId:text(row.targetId,'assignments.targetId',700),note:text(row.note || '','assignments.note')
    })),
    title:text(raw.title || 'Cohort delivery comparison','title',500),note:text(raw.note || '','note'),
    recording:{editionId:'',createdAt:'',actor:'',planSourceId:'',...object(raw.recording || {},'recording')}
  };
  for (const [key,value] of Object.entries(input.recording)) text(value,'recording.'+key,key === 'actor' ? 500 : 200);
  if (input.recording.createdAt) timestamp(input.recording.createdAt,'recording.createdAt');
  return input;
}
function buildJoins(plan, c, links) {
  const categories = {
    buyer:[plan.input.buyers,c.selectedDeployments.filter(row => ['BUYER','BOTH'].includes(row.role))],
    merchant:[plan.input.merchants,c.selectedDeployments.filter(row => ['MERCHANT','BOTH'].includes(row.role))],
    facilitator:[plan.input.facilitators,c.inputs.facilitators],
    operation:[plan.input.operations,c.inputs.operations]
  };
  const explicit = new Map();
  for (const link of links) {
    const key = link.kind + ':' + link.plannedId;
    if (explicit.has(key)) fail('DUPLICATE_IDENTITY_LINK', 'Each planned identity has one selected observed identity.', key);
    if (!link.note.trim()) fail('IDENTITY_LINK_NOTE_REQUIRED', 'Describe why these original identities refer to the same participant or useful operation.', key);
    const [planned,observed] = categories[link.kind];
    if (!planned.some(row => row.id === link.plannedId) || !observed.some(row => row.id === link.observedId))
      fail('UNKNOWN_IDENTITY_LINK', 'Select identities retained by these two original source documents.', key);
    explicit.set(key,link);
  }
  const joins = [], maps = Object.fromEntries(Object.keys(categories).map(key => [key,new Map()]));
  for (const kind of ['buyer','merchant','facilitator','operation']) {
    const [planned,observed] = categories[kind];
    for (const row of planned) {
      const chosen = explicit.get(kind + ':' + row.id);
      let match = chosen ? observed.find(value => value.id === chosen.observedId) : null, basis = chosen ? 'OPERATOR_ASSOCIATION' : 'UNMATCHED';
      if (!chosen) {
        const identity = row.deploymentId || row.id;
        const candidates = observed.filter(value => value.id === identity);
        if (candidates.length === 1) {
          const candidate = candidates[0];
          const same = kind === 'operation'
            ? maps.merchant.get(row.merchantId) === candidate.merchantDeploymentId && row.scope === candidate.scope && row.expectedOutput === candidate.expectedOutput
            : !!row.operatorId && row.operatorId === candidate.operatorId;
          if (same) { match = candidate; basis = 'ORIGINAL_IDENTITY'; }
        }
      }
      if (match) maps[kind].set(row.id,match.id);
      joins.push({kind,plannedId:row.id,plannedLabel:row.label || row.id,observedId:match?.id || null,
        observedLabel:match?.label || match?.name || match?.id || null,basis,note:chosen?.note || '',
        plannedOperatorId:row.operatorId || null,observedOperatorId:match?.operatorId || null,
        sourceIds:[...new Set([...(row.sourceIds || []),...(match?.sourceIds || [])])]});
    }
  }
  return {joins,maps};
}
function sum(rows,key) { return rows.reduce((n,row) => n + (row[key] || 0),0); }
function count(rows,key) { return rows.filter(row => row[key]).length; }
function delta(actual,planned) { return planned === null || planned === undefined || actual === null || actual === undefined ? null : actual - planned; }
function currentCompletion(intent, cutoff) {
  return intent.completions.filter(row => row.current && timestamp(row.completedAt,'completion.completedAt').ticks <= cutoff.ticks)
    .slice().sort((a,b) => timestamp(a.completedAt,'completion.completedAt').ticks < timestamp(b.completedAt,'completion.completedAt').ticks ? -1 : 1)[0] || null;
}
export function compareCohortDelivery(raw) {
  const input = normalizeInput(raw), plan = checkedPlan(input.planDocument), c = checkedReview(input.review);
  if (plan.source.programId !== c.source.programId) fail('COMPARISON_CASE_MISMATCH','Select the adoption plan and frozen cohort from the same original case.','review');
  if (plan.window.tranche !== c.inputs.tranche) fail('COMPARISON_TRANCHE_MISMATCH','Select the original review for the plan’s tranche.','review');
  const cutoff = timestamp(c.window.asOfAt,'review.window.asOfAt');
  const {joins,maps} = buildJoins(plan,c,input.links), issues = [];
  if (plan.source.planContentSha256 !== c.source.planContentSha256) issues.push({code:'PLAN_REVISION_CHANGED',message:'The recorded cohort uses a different pinned plan revision. Both original rules and sources are retained.'});
  if (canonical(plan.rule) !== canonical(c.rule)) issues.push({code:'PROPOSED_RULE_CHANGED',message:'The original proposed rules differ. Target columns preserve each document’s own requirement.'});
  if (plan.window.start !== c.window.start || plan.window.end !== c.window.end) issues.push({code:'WINDOW_CHANGED',message:'The planned and observed UTC windows differ. Dates are aligned as recorded; comparison does not shift either window.'});
  for (const join of joins) if (!join.observedId) issues.push({code:'IDENTITY_UNMATCHED',kind:join.kind,id:join.plannedId,message:'Associate '+join.plannedLabel+' with its original recorded '+join.kind+' to place matching intents.'});
  const schedules = new Map(plan.input.schedules.map(row => [row.id,row]));
  const plannedTargets = [
    ...plan.occurrences.filter(row => row.plannedPaymentRequests > 0).map(row => ({
      id:'occurrence:'+row.id,kind:'OCCURRENCE',sourceId:row.id,label:row.label,scheduleId:row.scheduleId,
      operationId:row.operationId,buyerId:row.buyerId,merchantId:row.merchantId,facilitatorId:row.facilitatorId,
      date:row.date,scheduledAt:row.scheduledAt,plannedCompleteAt:row.plannedCompleteAt,
      paymentKind:row.paymentKind,network:row.network,asset:row.asset,
      plannedPaymentRequests:row.plannedPaymentRequests,plannedPaidPurchases:row.plannedPaidPurchases,
      plannedCompletePurchases:row.plannedCompletePurchases,independentPurchaseOpportunities:row.independentPurchaseOpportunities,
      plannedUsefulTasks:row.scheduledTasks,atomicAmount:row.atomicAmount,sourceOccurrenceIds:[row.id]
    })),
    ...plan.fundingGroups.filter(row => row.plannedPaymentRequests > 0).map(row => ({
      id:'funding:'+row.id,kind:'FUNDING_GROUP',sourceId:row.id,label:row.label,scheduleId:null,
      operationId:row.operationId,buyerId:row.buyerId,merchantId:row.merchantId,facilitatorId:row.facilitatorId,
      date:row.date,scheduledAt:row.date+'T00:00:00Z',plannedCompleteAt:row.firstUsefulResultAt,
      paymentKind:'FUNDED',network:row.network,asset:row.asset,
      plannedPaymentRequests:row.plannedPaymentRequests,plannedPaidPurchases:row.plannedPaidPurchases,
      plannedCompletePurchases:row.plannedCompletePurchases,independentPurchaseOpportunities:row.independentPurchaseOpportunities,
      plannedUsefulTasks:row.scheduledTasks,atomicAmount:row.atomicAmount,sourceOccurrenceIds:row.useOccurrenceIds
    }))
  ];
  const targetMap = new Map(), index = new Map();
  for (const row of plannedTargets) {
    row.observedOperationId=maps.operation.get(row.operationId)||null;
    row.observedBuyerId=maps.buyer.get(row.buyerId)||null;
    row.observedMerchantId=maps.merchant.get(row.merchantId)||null;
    row.observedFacilitatorId=row.facilitatorId ? maps.facilitator.get(row.facilitatorId)||null : null;
    row.dueAtCutoff=!!row.plannedCompleteAt && timestamp(row.plannedCompleteAt,'plannedCompleteAt').ticks<=cutoff.ticks;
    row.intentIds=[]; targetMap.set(row.id,row);
    if (row.observedOperationId && row.observedBuyerId && row.observedMerchantId && (!row.facilitatorId || row.observedFacilitatorId)) {
      const key=canonical([row.observedOperationId,row.observedBuyerId,row.observedMerchantId,row.network]);
      if(!index.has(key))index.set(key,[]); index.get(key).push(row);
    }
  }
  const bindingMap=new Map(c.inputs.bindings.map(row=>[row.purchaseId,row]));
  const observedOperations=new Map(c.inputs.operations.map(row=>[row.id,row]));
  const observationMap=new Map(c.observations.map(row=>[row.purchaseId,row]));
  const assignments=new Map();
  for(const row of input.assignments) {
    if(assignments.has(row.intentId))fail('DUPLICATE_INTENT_ASSIGNMENT','Assign one original intent to one planned payment opportunity.','assignments');
    if(!c.intents.some(intent=>intent.id===row.intentId)||!targetMap.has(row.targetId))fail('UNKNOWN_INTENT_ASSIGNMENT','Select an original intent group and retained planned payment opportunity.','assignments');
    if(!row.note.trim())fail('INTENT_ASSIGNMENT_NOTE_REQUIRED','Describe the source basis for the selected placement.','assignments');
    assignments.set(row.intentId,row);
  }
  const records=[];
  for(const intent of c.intents) {
    const bindings=intent.purchaseIds.map(id=>bindingMap.get(id)).filter(Boolean);
    const one=key=>{const values=[...new Set(bindings.map(row=>row[key]).filter(Boolean))];return values.length===1?values[0]:null;};
    const operationId=one('operationId'),buyerDeploymentId=one('buyerDeploymentId'),facilitatorId=one('facilitatorId');
    const merchantDeploymentId=observedOperations.get(operationId)?.merchantDeploymentId||null;
    const assets=[...new Set(intent.purchaseIds.map(id=>observationMap.get(id)?.original?.asset).filter(Boolean))];
    const asset=assets.length===1?assets[0]:null,firstDay=dayOf(intent.firstAttemptAt);
    const candidates=operationId&&buyerDeploymentId&&merchantDeploymentId
      ?(index.get(canonical([operationId,buyerDeploymentId,merchantDeploymentId,intent.network]))||[])
        .filter(row=>row.asset===asset && (!row.facilitatorId || row.observedFacilitatorId===facilitatorId)):[];
    const dated=candidates.filter(row=>row.date===firstDay),selected=assignments.get(intent.id);
    // Explicit placement can retain a changed date, but cannot silently assign
    // another customer, operation, network or asset to the opportunity.
    if(selected&&!candidates.some(row=>row.id===selected.targetId))
      fail('INTENT_IDENTITY_CONFLICT','The selected opportunity has different participant, operation, facilitator, network or asset identities. Correct its identity associations before placing this intent.','assignments.'+intent.id);
    const target=selected?targetMap.get(selected.targetId):dated.length===1?dated[0]:null;
    const completed=currentCompletion(intent,cutoff);
    const lateness=target&&completed&&target.plannedCompleteAt ? timestamp(completed.completedAt,'completedAt').ticks-timestamp(target.plannedCompleteAt,'plannedCompleteAt').ticks:null;
    const row={
      id:intent.id,intentId:intent.intentId,purchaseIds:copy(intent.purchaseIds),buyerOperatorId:intent.buyerOperatorId,
      buyerDeploymentId,operationId,merchantDeploymentId,facilitatorId,network:intent.network,asset,
      firstAttemptAt:intent.firstAttemptAt,firstAttemptDate:firstDay,
      currentCompletedAt:completed?.completedAt||null,completionDate:completed?dayOf(completed.completedAt):null,
      targetId:target?.id||null,placement:selected?'OPERATOR_ASSIGNMENT':target?'ORIGINAL_IDENTITIES_AND_UTC_DATE':dated.length>1?'AMBIGUOUS_DATE':candidates.length?'DATE_UNMATCHED':'IDENTITY_UNMATCHED',
      candidateTargetIds:candidates.map(value=>value.id),assignmentNote:selected?.note||'',
      attempted:intent.attempted,settled:intent.settled,inWindow:intent.inWindow,unplaced:intent.unplaced,
      completeInWindow:intent.completeInWindow,independentCompleteInWindow:intent.independentCompleteInWindow,
      grossCompleteInWindow:intent.grossCompleteInWindow,laterCompletion:intent.laterCompletion,
      refundedAfterSettlement:intent.refundedAfterSettlement,cancelledAfterSettlement:intent.cancelledAfterSettlement,
      teamOperated:intent.teamOperated,lateAfterPlan:lateness!==null&&lateness>0n,
      latenessSeconds:lateness===null?null:seconds(lateness),sourceIssues:copy(intent.issues||[]),
      sourceIds:[...new Set(intent.purchaseIds.flatMap(id=>[...(observationMap.get(id)?.original?.sourceIds||[]),...(bindingMap.get(id)?.sourceIds||[])]))]
    };
    records.push(row);if(target)target.intentIds.push(intent.id);
  }
  const recordMap=new Map(records.map(row=>[row.id,row]));
  const rows=plannedTargets.map(target=>{
    const actual=target.intentIds.map(id=>recordMap.get(id));
    const observedIntents=actual.length,complete=count(actual,'completeInWindow'),independent=count(actual,'independentCompleteInWindow');
    return {...target,observedIntents,observedAttempted:count(actual,'attempted'),observedComplete:complete,observedIndependentComplete:independent,
      grossComplete:count(actual,'grossCompleteInWindow'),refunded:count(actual,'refundedAfterSettlement'),
      cancelledAfterSettlement:count(actual,'cancelledAfterSettlement'),lateAfterPlan:count(actual,'lateAfterPlan'),
      completionDelta:complete-target.plannedCompletePurchases,
      remainingDue:target.dueAtCutoff?Math.max(0,target.plannedCompletePurchases-complete):0,
      additionalIntents:Math.max(0,observedIntents-target.plannedPaymentRequests),
      state:!target.observedOperationId||!target.observedBuyerId||!target.observedMerchantId||(target.facilitatorId&&!target.observedFacilitatorId)?'ASSOCIATION_REQUIRED':!target.dueAtCutoff?'PLANNED_LATER':complete>=target.plannedCompletePurchases&&target.plannedCompletePurchases>0?'DELIVERED':
        actual.some(row=>row.refundedAfterSettlement||row.cancelledAfterSettlement)?'ADJUSTED':
        actual.some(row=>row.currentCompletedAt)?'DELIVERED_OUTSIDE_REVIEW_SCOPE':actual.length?'IN_PROGRESS':'AWAITING_RECORD',
      note:target.scheduleId?schedules.get(target.scheduleId)?.note||'':''
    };
  });
  const dayMap=new Map();
  function day(date){if(!date)return null;if(!dayMap.has(date))dayMap.set(date,{date,plannedPaymentRequests:0,plannedCompletePurchases:0,plannedUsefulTasks:0,observedIntents:0,completedFromAttempts:0,completedOnDate:0,independentCompletedOnDate:0,lateAfterPlan:0,unmatchedIntents:0});return dayMap.get(date);}
  for(const row of plan.days){const target=day(row.date);target.plannedUsefulTasks=row.scheduledTasks;}
  for(const row of rows){const target=day(row.date);target.plannedPaymentRequests+=row.plannedPaymentRequests;target.plannedCompletePurchases+=row.plannedCompletePurchases;}
  for(const record of records){
    const first=day(record.firstAttemptDate);
    if(first){first.observedIntents++;first.completedFromAttempts+=Number(record.completeInWindow);first.unmatchedIntents+=Number(!record.targetId);}
    const completion=day(record.completionDate);
    if(completion){completion.completedOnDate++;completion.independentCompletedOnDate+=Number(record.independentCompleteInWindow);completion.lateAfterPlan+=Number(record.lateAfterPlan);}
  }
  const operatorMap=new Map();
  function operator(id,label){const key=id||'unassigned';if(!operatorMap.has(key))operatorMap.set(key,{operatorId:id||null,labels:[],plannedBuyerIds:[],observedBuyerIds:[],plannedPaidPurchases:0,plannedIndependentOpportunities:0,observedIntents:0,observedComplete:0,observedIndependentComplete:0,unmatchedIntents:0});const value=operatorMap.get(key);if(label&&!value.labels.includes(label))value.labels.push(label);return value;}
  const deployments=new Map(c.selectedDeployments.map(row=>[row.id,row]));
  const opportunitiesByBuyer=new Map();
  for(const row of rows){if(!opportunitiesByBuyer.has(row.buyerId))opportunitiesByBuyer.set(row.buyerId,[]);opportunitiesByBuyer.get(row.buyerId).push(row);}
  for(const buyer of plan.input.buyers){
    const observed=deployments.get(maps.buyer.get(buyer.id)),row=operator(observed?.operatorId||buyer.operatorId,buyer.label);
    row.plannedBuyerIds.push(buyer.id);if(observed&&!row.observedBuyerIds.includes(observed.id))row.observedBuyerIds.push(observed.id);
    const selected=opportunitiesByBuyer.get(buyer.id)||[];row.plannedPaidPurchases+=sum(selected,'plannedPaidPurchases');row.plannedIndependentOpportunities+=sum(selected,'independentPurchaseOpportunities');
  }
  for(const record of records){const row=operator(record.buyerOperatorId,deployments.get(record.buyerDeploymentId)?.name);row.observedIntents++;row.observedComplete+=Number(record.completeInWindow);row.observedIndependentComplete+=Number(record.independentCompleteInWindow);row.unmatchedIntents+=Number(!record.targetId);if(record.buyerDeploymentId&&!row.observedBuyerIds.includes(record.buyerDeploymentId))row.observedBuyerIds.push(record.buyerDeploymentId);}
  const observedTargets=new Map(c.targets.map(row=>[row.key,row])),plannedTargetMap=new Map(plan.targets.map(row=>[row.key,row]));
  const targets=[...new Set([...plannedTargetMap.keys(),...observedTargets.keys()])].sort().map(key=>{
    const a=observedTargets.get(key),p=plannedTargetMap.get(key);
    return {key,plannedRequirement:p?.expected??null,observedRequirement:a?.expected??null,planned:p?.planned??null,observed:a?.actual??null,observedMet:a?.met??null,delta:delta(a?.actual,p?.planned),planningStatus:p?.status||null};
  });
  const unmatched=records.filter(row=>!row.targetId);
  if(unmatched.length)issues.push({code:'RECORDED_INTENTS_UNMATCHED',message:unmatched.length+' original intent groups remain visible without a planned opportunity. Review identity links and explicit placements.'});
  const summary={
    plannedUsefulTasks:plan.summary.scheduledTasks,plannedPaymentRequests:sum(rows,'plannedPaymentRequests'),plannedPaidPurchases:sum(rows,'plannedPaidPurchases'),
    plannedCompletePurchases:sum(rows,'plannedCompletePurchases'),plannedIndependentOpportunities:sum(rows,'independentPurchaseOpportunities'),
    observedIntents:records.length,observedInWindow:count(records,'inWindow'),observedAttempted:count(records,'attempted'),
    observedComplete:count(records,'completeInWindow'),observedIndependentComplete:count(records,'independentCompleteInWindow'),
    matchedIntents:records.length-unmatched.length,unmatchedIntents:unmatched.length,unplacedIntents:count(records,'unplaced'),
    grossComplete:count(records,'grossCompleteInWindow'),refundedAfterSettlement:count(records,'refundedAfterSettlement'),
    cancelledAfterSettlement:count(records,'cancelledAfterSettlement'),lateAfterPlan:count(records,'lateAfterPlan'),remainingDue:sum(rows,'remainingDue'),
    teamOperatedIntents:count(records,'teamOperated'),nativeReady:c.ready,
    completionDelta:count(records,'completeInWindow')-sum(rows,'plannedCompletePurchases')
  };
  return {
    schema:COHORT_DELIVERY_COMPARISON_SCHEMA,engineVersion:1,title:input.title,input,summary,
    source:{programId:plan.source.programId,plan:copy(plan.source),reviewId:input.review.id,reviewVersion:input.review.version,
      measurementSha256:c.source.measurementSha256,previewSha256:c.previewSha256,observed:copy(c.source),
      plannedWindow:copy(plan.window),observedWindow:copy(c.window),nativeMode:input.review.snapshot.program.mode},
    planReport:plan,joins,rows,records,unmatched,days:[...dayMap.values()].sort((a,b)=>a.date.localeCompare(b.date)),
    operators:[...operatorMap.values()].sort((a,b)=>(a.operatorId||'').localeCompare(b.operatorId||'')),targets,issues,
    nativeMetrics:copy(c.metrics),nativeIssues:copy(c.issues),amounts:copy(c.amounts),outcomes:copy(c.outcomes),products:copy(c.products)
  };
}
export function reopenCohortDeliveryComparison(document) {
  if(!document||document.schema!==COHORT_DELIVERY_COMPARISON_SCHEMA||document.engineVersion!==1)
    fail('COMPARISON_DOCUMENT_REQUIRED','Open the complete saved delivery comparison.','document');
  const fresh=compareCohortDelivery(document.input);
  if(canonical(fresh)!==canonical(document))fail('COMPARISON_SOURCE_CHANGED','The saved comparison differs from its retained plan, original review or identity associations. Keep the original file and regenerate from its complete input.','document');
  return fresh;
}
function cell(value) {
  if(value===null||value===undefined)return '';
  let s=typeof value==='object'?JSON.stringify(value):String(value);
  if(/^\s*[=+@]/.test(s)||/^[\t\r\n]/.test(s)||(/^\s*-/.test(s)&&!/^-\d+(?:\.\d+)?$/.test(s)))s="'"+s;
  return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
export function exportCohortDeliveryCsv(document) {
  const report=reopenCohortDeliveryComparison(document),rows=[['section','id','date','metric','planned','observed','difference','detail']];
  const add=(section,id,date,metric,planned,observed,difference,detail)=>rows.push([section,id,date,metric,planned,observed,difference,detail]);
  for(const row of report.targets)add('target',row.key,'','target',row.planned,row.observed,row.delta,row);
  for(const row of report.rows)add('opportunity',row.id,row.date,'completed purchases',row.plannedCompletePurchases,row.observedComplete,row.completionDelta,row);
  for(const row of report.records)add('original_intent',row.id,row.firstAttemptDate,'recorded classification',null,row.completeInWindow,null,row);
  for(const row of report.days)add('UTC_date',row.date,row.date,'completions from first attempts',row.plannedCompletePurchases,row.completedFromAttempts,row.completedFromAttempts-row.plannedCompletePurchases,row);
  for(const row of report.operators)add('buyer_operator',row.operatorId,'','independent completions',row.plannedIndependentOpportunities,row.observedIndependentComplete,row.observedIndependentComplete-row.plannedIndependentOpportunities,row);
  for(const row of report.joins)add('identity',row.plannedId,'',row.kind,null,row.observedId,null,row);
  for(const row of report.amounts)add('native_amount',row.network+':'+row.asset,'','amountAtomic',null,row.amountAtomic,null,row);
  for(const row of report.outcomes)add('native_outcome',row.id,dayOf(row.completedAt),'qualifies',null,row.qualifies,null,row);
  for(const row of report.products)add('native_product',row.id,dayOf(row.completedAt),'completeInWindow',null,row.completeInWindow,null,row);
  for(const row of [...report.issues,...report.nativeIssues])add('finding',row.id||row.code,'',row.code,null,null,null,row);
  return rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=value=>String(value).replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ');
function htmlTable(headers,rows) { return '<div class="table"><table><thead><tr>'+headers.map(v=>'<th scope="col">'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v===null||v===undefined?'—':typeof v==='object'?JSON.stringify(v):v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'; }
export function exportCohortDeliveryHtml(document) {
  const r=reopenCohortDeliveryComparison(document),s=r.source;
  const table=htmlTable;
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(r.title)+'</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#202020;background:#fff;max-width:1440px;margin:2rem auto;padding:0 1rem}h1{font-size:1.8rem}h2{font-size:1.2rem;margin-top:2rem}p,td{overflow-wrap:anywhere}.table{overflow:auto}table{width:100%;border-collapse:collapse;font-size:.88rem}th,td{padding:.6rem;border:1px solid #c4c4c4;text-align:left;vertical-align:top}th{background:#f3f3f3}small{color:#555}pre{white-space:pre-wrap;overflow-wrap:anywhere}details{margin:1rem 0}@media print{.table{overflow:visible}body{max-width:none;font-size:10pt}th{break-after:avoid}tr{break-inside:avoid}}</style></head><body>'+
    '<h1>'+esc(r.title)+'</h1><p>'+esc(r.input.planDocument.plan?.name||r.planReport.input.name)+'</p><p>Planned: '+esc(s.plannedWindow.start)+' through '+esc(s.plannedWindow.end)+' UTC. Recorded: '+esc(s.observedWindow.start)+' through '+esc(s.observedWindow.end)+' UTC, observed through '+esc(s.observedWindow.asOfAt)+'.</p>'+
    '<p>Case '+esc(s.programId)+' · '+esc(s.nativeMode)+' · tranche '+esc(s.plannedWindow.tranche)+' · frozen review '+esc(s.reviewId)+'.</p>'+
    '<p>'+esc(r.input.note)+'</p><h2>Delivery overview</h2>'+table(['Measure','Count'],Object.entries(r.summary).map(([k,v])=>[label(k),v]))+
    '<p>Useful tasks and payment opportunities retain their original units. The recorded completion and independence columns use the frozen cohort’s classifications. Each original intent appears once. Current completion dates include later delivered work; cohort completion columns retain the original window. Remaining due is calculated only for matched planned opportunities due by the recorded cutoff.</p>'+
    '<h2>Original proposed targets</h2>'+table(['Target','Plan requirement','Review requirement','Planned','Recorded','Difference','Review met'],r.targets.map(x=>[label(x.key),x.plannedRequirement,x.observedRequirement,x.planned,x.observed,x.delta,x.observedMet]))+
    '<h2>Planned payment opportunities</h2>'+table(['Opportunity / identity','UTC date','Planned completions','Recorded completions','Independent','Due remaining','Late','State','Original intents'],r.rows.map(x=>[x.label+'\n'+x.id,x.date,x.plannedCompletePurchases,x.observedComplete,x.observedIndependentComplete,x.remainingDue,x.lateAfterPlan,label(x.state),x.intentIds]))+
    '<h2>Daily delivery</h2><p>First-attempt columns group the original intent cohort. Delivered-on-date counts current completed outputs on their actual UTC completion date.</p>'+table(['UTC date','Planned purchases','Recorded first attempts','Completed from those attempts','Delivered on date','Independent on date','Unmatched'],r.days.map(x=>[x.date,x.plannedCompletePurchases,x.observedIntents,x.completedFromAttempts,x.completedOnDate,x.independentCompletedOnDate,x.unmatchedIntents]))+
    '<h2>Accountable buyer operators</h2>'+table(['Operator','Names','Planned paid','Planned independent','Recorded intents','Complete','Independent','Unmatched'],r.operators.map(x=>[x.operatorId,x.labels.join('; '),x.plannedPaidPurchases,x.plannedIndependentOpportunities,x.observedIntents,x.observedComplete,x.observedIndependentComplete,x.unmatchedIntents]))+
    '<h2>Original recorded intents</h2>'+table(['Original intent / group','Purchase observations','Operation','First attempt','Current completed output','Placement','Native complete / independent','Refund / cancellation','Source findings'],r.records.map(x=>[String(x.intentId||'Unidentified')+'\n'+x.id,x.purchaseIds,x.operationId,x.firstAttemptAt,x.currentCompletedAt,x.targetId||x.placement,String(x.completeInWindow)+' / '+String(x.independentCompleteInWindow),String(x.refundedAfterSettlement)+' / '+String(x.cancelledAfterSettlement),x.sourceIssues]))+
    '<h2>Selected identity associations</h2>'+table(['Kind','Planned identity','Recorded identity','Basis','Operator note'],r.joins.map(x=>[x.kind,x.plannedLabel+'\n'+x.plannedId,(x.observedLabel||'Unassigned')+'\n'+(x.observedId||''),x.basis,x.note]))+
    '<h2>Original amounts by network and asset</h2>'+table(['Network','Asset','Atomic amount','Settled in window','Native XLM fee stroops','Unknown fees','Unresolved amounts'],r.amounts.map(x=>[x.network,x.asset,x.amountAtomic,x.settledInWindowAtomic,x.knownFeesAtomic,x.unknownFeeTransactions,x.unresolvedAmountTransactions]))+
    '<h2>Recorded outcomes and complete products</h2>'+table(['Kind','Identity','Completed','Qualification / completion','Original detail'],[...r.outcomes.map(x=>[x.kind,x.id,x.completedAt,x.qualifies,x]),...r.products.map(x=>['Parent product',x.id,x.completedAt,x.completeInWindow,x])])+
    '<h2>Source differences and original review findings</h2>'+table(['Finding','Identity','Description'],[...r.issues,...r.nativeIssues].map(x=>[x.code,x.id||'',x.message]))+
    '<details><summary>Complete comparison JSON and original source documents</summary><pre>'+esc(JSON.stringify(r,null,2))+'</pre></details>'+
    '<small>Plan content '+esc(s.plan.planContentSha256)+' · cohort measurement '+esc(s.measurementSha256)+' · original review '+esc(s.previewSha256)+'</small></body></html>\n';
}
