// MIT. Original merchant snapshot in the existing SF74 Support case.
import {isDeepStrictEqual} from 'node:util';
export function x402ObservationView({meta,source,summary}) {
  return {...structuredClone(summary),registration:structuredClone(meta.registration),
    selection:structuredClone(meta.selection),collectedAt:meta.generatedAt,sourceFile:{...meta.source},
    originalObservation:structuredClone(source)};
}
export function x402CaptureView(capture,currentInputs) {
  const {meta,summary}=capture.original;
  return {kind:'X402_MERCHANT',scope:structuredClone(capture.scope),
    caseMatches:isDeepStrictEqual(capture.scope.inputs,currentInputs),capturedAt:meta.generatedAt,
    startedAt:summary.storeCreatedAt,sessionId:meta.selection.storeId,mode:'ORIGINAL_READ_ONLY_MERCHANT',
    observerAttached:null,observerErrors:0,route:{id:meta.registration.id,method:'GET'},native:null,
    x402:x402ObservationView(capture.original),
    alerts:[...(summary.coverage==='COMPLETE'?[]:['Merchant source coverage is '+summary.coverage+'. Missing values remain unknown.']),
      'Receipt verification and fulfillment are retained original outcomes. This view does not query a ledger or reverify result bytes.'],
    files:Object.entries(capture.files).map(([name,value])=>({name,bytes:value.bytes,sha256:value.sha256}))};
}
export function compareX402Captures(before,after) {
  if(before.kind!=='X402_MERCHANT'||after.kind!=='X402_MERCHANT')return {state:'DIFFERENT_OBSERVATION_KINDS',
    detail:'Merchant orders and the other source kind have distinct source identities. Review their original captures separately.',interval:null};
  const a=before.x402,b=after.x402,view={before:a,after:b,changes:[]};
  const result=(state,detail)=>({state,detail,interval:null,x402:view});
  if(!isDeepStrictEqual(a.selection,b.selection))return result('X402_REGISTRATION_CHANGED',
    'The reviewed merchant identity or observation policy changed. Each capture keeps its original selection.');
  if(a.coverage!=='COMPLETE'||b.coverage!=='COMPLETE')return result('X402_COVERAGE_INCOMPLETE',
    'Both original observations remain available; incomplete coverage cannot establish a recovered order or result.');
  if(b.sourceCapturedAt<=a.sourceCapturedAt)return result('X402_CAPTURE_ORDER',
    'Select a later original source capture for the after observation.');
  const priorSource=a.originalObservation,laterSource=b.originalObservation;
  for(const group of ['history','exchanges']) {
    const later=new Map(laterSource[group].map(row=>[row.sequence,row]));
    if(priorSource[group].some(row=>!isDeepStrictEqual(row,later.get(row.sequence))))
      return result('X402_SOURCE_HISTORY_CHANGED','An earlier immutable history or exchange descriptor is missing or changed. Preserve both original captures and reconcile the merchant store.');
  }
  const old=new Map(a.orders.map(row=>[row.id,row])),next=new Map(b.orders.map(row=>[row.id,row]));
  if([...old.keys()].some(id=>!next.has(id)))return result('X402_SOURCE_HISTORY_MISSING',
    'An original order is absent from the later complete snapshot. Preserve both captures and reconcile the source before claiming recovery.');
  for(const row of b.orders){const prior=old.get(row.id);if(!prior||!isDeepStrictEqual(prior,row))
    view.changes.push({id:row.id,reference:row.reference,before:prior??null,after:row});}
  return result('X402_ORDERS_COMPARED',
    'Original order states, recorded receipt verification and recorded result completion are compared independently. Age advances with the capture clock; a later outcome does not establish which action caused it.');
}
export function x402RepairQueue(capture,side) {
  const s=capture.x402,queue=[],add=(condition,action)=>queue.push({source:side,routeId:capture.scope.routeId,kind:'x402',condition,action});
  if(s.coverage!=='COMPLETE')add('X402_SOURCE_UNAVAILABLE','Resolve the original registered owner, credential reference or complete source coverage; retain this capture and obtain a later read-only observation.');
  if(s.identityMatches===false)add('X402_IDENTITY_CHANGED','Review the original store, tenant, resource version and configuration with the merchant owner before explicitly changing the registration.');
  if(s.orders.some(r=>r.unresolved))add('X402_PAYMENT_UNRESOLVED','Reconcile each unresolved original order through its existing merchant operation and provider history. Keep its original charge/payment identity.');
  if(s.orders.some(r=>r.receiptOutputPending))add('X402_VERIFIED_RECEIPT_OUTPUT_PENDING','Review the recorded verified receipt beside the original fulfillment record. Resume the owner’s saved delivery operation; do not submit another payment to produce output.');
  if(s.orders.some(r=>r.fulfillmentInterrupted))add('X402_FULFILLMENT_INTERRUPTED','Inspect the original interrupted fulfillment and its owner-runtime record. Use the merchant’s existing reconciliation path.');
  if(s.orders.some(r=>r.contradiction))add('X402_RESULT_CONTRADICTION','Reconcile the original receipt, payment ID and recorded result hashes before accepting the completed projection.');
  if(s.orders.some(r=>r.authorityRejected))add('X402_AUTHORITY_REJECTED','Inspect the retained authority rejection with the original merchant operator. Preserve receipt-signature and binding requirements.');
  return queue;
}
