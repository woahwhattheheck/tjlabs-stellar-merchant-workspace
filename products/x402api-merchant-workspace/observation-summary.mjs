// MIT. Compact operational projection of the original owned merchant store.
import {createHash} from 'node:crypto';
import {canonicalJson} from './protocol.mjs';
import {merchantObservationHistoryRow,merchantObservationExchangeRow} from './observation.mjs';
export const MERCHANT_OBSERVATION_SUMMARY_SCHEMA='stellar-forge.x402api-merchant-observation-summary.v1';
export const MERCHANT_OBSERVATION_SUMMARY_LIMITS=Object.freeze({maxBytes:2*1024*1024,maxOrderDetails:1024});
const STATES=new Set(['CREATED','CHARGE_UNCERTAIN','CHARGE_REJECTED','AWAITING_PAYMENT','PAYMENT_PENDING','PAYMENT_UNCERTAIN',
  'PAYMENT_FAILED','SETTLEMENT_CONFIRMED','FULFILLMENT_PENDING','FULFILLMENT_INTERRUPTED','COMPLETE']);
const QUIET=new Set(['CREATED','AWAITING_PAYMENT','CHARGE_REJECTED','PAYMENT_FAILED','COMPLETE']);
const TERMINAL=new Set(['CHARGE_REJECTED','PAYMENT_FAILED','COMPLETE']);
const AUTHORITY=new Set(['EVENT_ORDER_BINDING_MISMATCH','EVENT_PAYMENT_BINDING_MISMATCH',
  'WEBHOOK_ADVERTISED_ALTERNATIVE_MISMATCH','WEBHOOK_FROZEN_RAIL_MISMATCH',
  'X402API_RECEIPT_SIGNATURE_INVALID','X402API_KEY_VERSION_NOT_CONFIGURED','X402API_DIGEST_MISMATCH','X402API_BINDING_MISMATCH']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const sha=value=>createHash('sha256').update(value).digest('hex');
const instant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};
const need=(value,code='MERCHANT_OBSERVATION_METADATA_INVALID')=>{if(!value)fail(code);};
const integer=value=>{const n=Number(value);need(Number.isSafeInteger(n)&&n>=0);return n;};
const parsed=value=>value===null?null:JSON.parse(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function fileMetadata(value) {
  if(value===null)return;
  need(plain(value)&&Number.isSafeInteger(value.bytes)&&value.bytes>=0&&HASH.test(value.sha256??'')&&
    typeof value.contentType==='string'&&typeof value.fileName==='string');
}
function receiptMetadata(value) {
  if(value===null)return;
  need(plain(value)&&/^sha256:[a-f0-9]{64}$/.test(value.receiptDigest??'')&&instant(value.verifiedAt)&&
    typeof value.signingKeyVersion==='string'&&typeof value.pinSource==='string'&&typeof value.deliveryId==='string');
}
const age=(value,now)=>instant(value)&&Date.parse(value)<=now+5000?Math.max(0,Math.floor((now-Date.parse(value))/1000)):null;
const active=(state,signature,receipt)=>!receipt&&(!QUIET.has(state)||signature&&!TERMINAL.has(state));
const emptyAges=()=>({requests:0,unknown:0,oldestPendingSeconds:0,oldestSince:null});
function addAge(group,at,now) {
  group.requests++;
  const seconds=age(at,now);
  if(seconds===null){group.unknown++;return;}
  group.oldestPendingSeconds=Math.max(group.oldestPendingSeconds,seconds);
  if(group.oldestSince===null||at<group.oldestSince)group.oldestSince=at;
}
export function merchantSummaryHistorySequence(value) {
  if(value===null||value===undefined)return null;
  if(typeof value!=='string'||!/^[1-9][0-9]*$/.test(value)||!Number.isSafeInteger(Number(value)))
    fail('MERCHANT_OBSERVATION_HISTORY_SEQUENCE_INVALID',400);
  return Number(value);
}
export function merchantSummaryPrefixRows(value) {
  if(value===null||value===undefined)return null;
  if(typeof value!=='string'||!/^(0|[1-9][0-9]*)$/.test(value)||!Number.isSafeInteger(Number(value)))
    fail('MERCHANT_OBSERVATION_PREFIX_ROWS_INVALID',400);
  return Number(value);
}
function immutablePrefixProjection(statement,project,requested) {
  const canonical=value=>Array.isArray(value)?value.map(canonical):plain(value)?
    Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const whole=createHash('sha256'),prefix=requested===null?null:createHash('sha256');
  let rows=0,prefixRows=0;
  whole.update('[');prefix?.update('[');
  for(const raw of statement.iterate()) {
    const encoded=JSON.stringify(canonical(project(raw)));
    if(rows)whole.update(',');whole.update(encoded);
    if(prefix&&rows<requested) {
      if(prefixRows)prefix.update(',');prefix.update(encoded);prefixRows++;
    }
    rows++;need(Number.isSafeInteger(rows));
  }
  whole.update(']');prefix?.update(']');
  return {current:{rows,sha256:whole.digest('hex')},
    prefix:prefix?{rows:prefixRows,sha256:prefix.digest('hex')}:null};
}
function historicalAnchors(store,id,unresolved) {
  const first=store._get('SELECT kind FROM merchant_history WHERE order_id=? ORDER BY sequence LIMIT 1',id);
  const last=store._get("SELECT json_extract(data_json,'$.set.state') AS state FROM merchant_history WHERE order_id=? AND json_type(data_json,'$.set.state')='text' ORDER BY sequence DESC LIMIT 1",id);
  const receipt=store._get("SELECT sequence,created_at FROM merchant_history WHERE order_id=? AND json_type(data_json,'$.set.receiptVerification') IS NOT NULL AND json_type(data_json,'$.set.receiptVerification')!='null' ORDER BY sequence LIMIT 1",id);
  need(first?.kind==='ORDER_CREATED','MERCHANT_OBSERVATION_HISTORY_DISAGREES');
  let episode=null;
  if(unresolved&&!receipt) {
    let state='CREATED',signature=false;
    // The existing per-order sequence index is reused. Unrelated history payloads
    // and all BLOBs stay in SQLite; only state/signature changes are streamed.
    for(const event of store._statement("SELECT sequence,kind,created_at,json_extract(data_json,'$.set.state') AS state FROM merchant_history WHERE order_id=? AND (json_type(data_json,'$.set.state')='text' OR kind='SIGNATURE_RETAINED') ORDER BY sequence").iterate(id)) {
      if(event.state!==null){need(STATES.has(event.state));state=event.state;}
      if(event.kind==='SIGNATURE_RETAINED')signature=true;
      if(!active(state,signature,false))episode=null;
      else if(episode===null)episode={at:event.created_at,sequence:integer(event.sequence)};
    }
  }
  return {lastState:last?.state??'CREATED',receiptAt:receipt?.created_at??null,episode};
}
function sourceBinding(workspace,configurationSha256,storeId) {
  const selected=workspace.observationBinding;
  const value={storeId,tenantId:workspace.config.tenantId,resourceVersionId:workspace.config.template.resourceVersionId,
    configurationSha256,kind:selected?.kind??'programmatic-config',
    inputsSha256:selected?.inputsSha256??null,configFileSha256:selected?.configSha256??null};
  need(['reviewed-file-inputs','configuration-file','programmatic-config'].includes(value.kind));
  need(value.inputsSha256===null||HASH.test(value.inputsSha256));
  need(value.configFileSha256===null||HASH.test(value.configFileSha256));
  return {...value,bindingSha256:sha(JSON.stringify(value))};
}
export function readMerchantObservationSummary(workspace,{historySequence=null,historyPrefixRows=null,exchangesPrefixRows=null}={}) {
  const store=workspace.store;
  need(!workspace.readOnly&&!store.readOnly,'MERCHANT_OBSERVATION_LIVE_OWNER_REQUIRED');
  store._assertOpen();
  need(!workspace.closing&&!store._db.isTransaction,'MERCHANT_OBSERVATION_BUSY');
  need(historySequence===null||Number.isSafeInteger(historySequence)&&historySequence>0,'MERCHANT_OBSERVATION_HISTORY_SEQUENCE_INVALID');
  need((historyPrefixRows===null&&exchangesPrefixRows===null)||
    Number.isSafeInteger(historyPrefixRows)&&historyPrefixRows>=0&&
    Number.isSafeInteger(exchangesPrefixRows)&&exchangesPrefixRows>=0,'MERCHANT_OBSERVATION_PREFIX_ROWS_INVALID');
  const startedAt=new Date().toISOString();
  const counts={orders:0,receiptVerified:0,unresolved:0,receiptOutputPending:0,recordedResultComplete:0,resultProjectionPending:0,
    fulfillmentInterrupted:0,contradictions:0,authorityRejected:0,authorityRejectionRecords:0,
    providerExchanges:0,incompleteProviderExchanges:0,pendingWebhooks:0};
  const ages={unresolved:emptyAges(),receiptOutputPending:emptyAges()},orders=[];
  let matchingOrders=0,detailBytes=0;
  const authorityCodes=[...AUTHORITY],slots=authorityCodes.map(()=>'?').join(',');
  store._db.exec('BEGIN');
  try {
    const meta=store._get('SELECT * FROM merchant_meta WHERE singleton=1');
    const capturedAt=new Date().toISOString(),now=Date.parse(capturedAt);
    const runtime=store._get('SELECT id,opened_at,state FROM merchant_runtimes WHERE id=?',store.runtimeId);
    need(meta?.store_id===store.storeId&&runtime?.state==='OPEN','MERCHANT_OBSERVATION_OWNER_CHANGED');
    const boundary=store._get('SELECT sequence,data_json FROM merchant_history ORDER BY sequence DESC LIMIT 1');
    const historyBoundary=boundary?{sequence:integer(boundary.sequence),sourceSha256:sha(boundary.data_json)}:null;
    const original=historySequence===null?null:store._get('SELECT data_json FROM merchant_history WHERE sequence=?',historySequence);
    const continuity=historySequence===null?null:{sequence:historySequence,sourceSha256:original?sha(original.data_json):null};
    // Hash the same original full-observation descriptors without accumulating
    // either array or selecting any request/response BLOB.
    const historyProof=immutablePrefixProjection(store._statement(
      'SELECT sequence,order_id,kind,data_json,created_at FROM merchant_history ORDER BY sequence'),
      merchantObservationHistoryRow,historyPrefixRows);
    const exchangesProof=immutablePrefixProjection(store._statement(
      'SELECT sequence,order_id,kind,status,raw_bytes,raw_sha256,response_complete,error_json,created_at FROM merchant_exchanges ORDER BY sequence'),
      merchantObservationExchangeRow,exchangesPrefixRows);
    const immutablePrefixes={history:historyProof.current,exchanges:exchangesProof.current};
    const prefixContinuity=historyPrefixRows===null?null:{history:historyProof.prefix,exchanges:exchangesProof.prefix};
    const exchanges=store._get('SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN response_complete=0 THEN 1 ELSE 0 END),0) AS incomplete FROM merchant_exchanges');
    counts.providerExchanges=integer(exchanges.total);counts.incompleteProviderExchanges=integer(exchanges.incomplete);
    counts.pendingWebhooks=integer(store._get("SELECT COUNT(*) AS total FROM merchant_events WHERE state='PENDING'").total);
    counts.authorityRejectionRecords=integer(store._get("SELECT COUNT(*) AS total FROM merchant_events WHERE state='REJECTED' AND json_extract(details_json,'$.code') IN ("+slots+")",...authorityCodes).total);
    const rows=store._statement("SELECT o.id,o.reference,o.title,o.state,o.created_at,o.updated_at,o.signature_sha256,"+
      "json_extract(o.frozen_json,'$.tenantId') AS tenant_id,json_extract(o.frozen_json,'$.template.resourceVersionId') AS resource_version_id,"+
      "json_extract(o.charge_identity_json,'$.paymentId') AS payment_id,"+
      "json_extract(o.data_json,'$.receiptVerification') AS receipt_verification,json_extract(o.data_json,'$.lastError.code') AS last_error,"+
      "f.payment_id AS fulfillment_payment_id,f.state AS fulfillment_state,f.attempt,f.created_at AS fulfillment_created_at,f.updated_at AS fulfillment_updated_at,"+
      "f.returned_bytes,f.returned_sha256,f.content_type,f.file_name,f.result_file_json,"+
      "COALESCE(e.rejected,0) AS rejected "+
      "FROM merchant_orders o LEFT JOIN merchant_fulfillments f ON f.order_id=o.id "+
      "LEFT JOIN (SELECT order_id,1 AS rejected FROM merchant_events WHERE state='REJECTED' AND json_extract(details_json,'$.code') IN ("+slots+") GROUP BY order_id) e ON e.order_id=o.id ORDER BY o.created_at,o.id");
    for(const raw of rows.iterate(...authorityCodes)) {
      need(UUID.test(raw.id)&&UUID.test(raw.tenant_id)&&UUID.test(raw.resource_version_id)&&STATES.has(raw.state));
      need(instant(raw.created_at)&&instant(raw.updated_at));
      need(raw.payment_id===null||UUID.test(raw.payment_id));
      const retainedReceipt=parsed(raw.receipt_verification);receiptMetadata(retainedReceipt);
      const result=parsed(raw.result_file_json);fileMetadata(result);
      if(raw.fulfillment_payment_id!==null) {
        need(UUID.test(raw.fulfillment_payment_id)&&['CLAIMED','RUNNING','INTERRUPTED','RETURNED','COMPLETE'].includes(raw.fulfillment_state)&&
          instant(raw.fulfillment_created_at)&&instant(raw.fulfillment_updated_at));
        integer(raw.attempt);
        fileMetadata(raw.returned_sha256===null?null:{bytes:integer(raw.returned_bytes),sha256:raw.returned_sha256,
          contentType:raw.content_type,fileName:raw.file_name});
      }
      const verified=retainedReceipt!==null,unresolved=active(raw.state,raw.signature_sha256!==null,verified);
      const anchors=historicalAnchors(store,raw.id,unresolved);
      need(anchors.lastState===raw.state,'MERCHANT_OBSERVATION_HISTORY_DISAGREES');
      const resultComplete=raw.fulfillment_state==='COMPLETE'&&result!==null&&raw.returned_sha256!==null;
      const contradiction=raw.state==='COMPLETE'&&!resultComplete||resultComplete&&
        (!verified||raw.payment_id!==raw.fulfillment_payment_id||result.bytes!==integer(raw.returned_bytes)||result.sha256!==raw.returned_sha256);
      const row={id:raw.id,reference:raw.reference,title:raw.title,state:raw.state,paymentId:raw.payment_id??null,
        receiptVerified:verified,receiptVerifiedAt:anchors.receiptAt,unresolved,
        unresolvedSince:unresolved?anchors.episode?.at??null:null,
        unresolvedAgeSeconds:unresolved?age(anchors.episode?.at,now):0,
        recordedResultComplete:resultComplete,resultProjectionPending:resultComplete&&raw.state!=='COMPLETE',
        receiptOutputPending:verified&&!resultComplete,receiptOutputAgeSeconds:verified&&!resultComplete?age(anchors.receiptAt,now):0,
        fulfillmentState:raw.fulfillment_state??null,fulfillmentInterrupted:raw.fulfillment_state==='INTERRUPTED',
        contradiction,authorityRejected:AUTHORITY.has(raw.last_error)||!verified&&integer(raw.rejected)===1,
        source:{tenantId:raw.tenant_id,resourceVersionId:raw.resource_version_id}};
      counts.orders++;
      for(const [field,key] of [['receiptVerified','receiptVerified'],['unresolved','unresolved'],['receiptOutputPending','receiptOutputPending'],
        ['recordedResultComplete','recordedResultComplete'],['resultProjectionPending','resultProjectionPending'],
        ['fulfillmentInterrupted','fulfillmentInterrupted'],['contradiction','contradictions'],['authorityRejected','authorityRejected']])
        if(row[field])counts[key]++;
      if(unresolved)addAge(ages.unresolved,row.unresolvedSince,now);
      if(row.receiptOutputPending)addAge(ages.receiptOutputPending,row.receiptVerifiedAt,now);
      if(unresolved||row.receiptOutputPending||row.fulfillmentInterrupted||contradiction||row.authorityRejected||row.resultProjectionPending) {
        matchingOrders++;
        const size=Buffer.byteLength(JSON.stringify(row))+1;
        if(orders.length<MERCHANT_OBSERVATION_SUMMARY_LIMITS.maxOrderDetails&&detailBytes+size<=MERCHANT_OBSERVATION_SUMMARY_LIMITS.maxBytes-16384){
          orders.push(row);detailBytes+=size;
        }
      }
    }
    for(const group of Object.values(ages))if(group.requests>0&&group.unknown===group.requests)group.oldestPendingSeconds=null;
    const configurationSha256=sha(canonicalJson(workspace.config));
    const value={schema:MERCHANT_OBSERVATION_SUMMARY_SCHEMA,storeId:store.storeId,storeCreatedAt:meta.created_at,
      runtimeId:runtime.id,runtimeOpenedAt:runtime.opened_at,configurationSha256,tenantId:workspace.config.tenantId,
      resourceVersionId:workspace.config.template.resourceVersionId,startedAt,capturedAt,
      authority:'ORIGINAL_MERCHANT_OWNER_READ_ONLY',coverage:'COMPLETE',
      projection:'COMPLETE_CONDITIONS_WITH_BOUNDED_ORDER_DETAILS',limits:MERCHANT_OBSERVATION_SUMMARY_LIMITS,
      binding:sourceBinding(workspace,configurationSha256,store.storeId),historyBoundary,continuity,immutablePrefixes,prefixContinuity,counts,ages,
      details:{matchingOrders,returnedOrders:orders.length,omittedOrders:matchingOrders-orders.length,limit:MERCHANT_OBSERVATION_SUMMARY_LIMITS.maxOrderDetails},
      orders};
    value.snapshotSha256=sha(JSON.stringify(value));
    need(Buffer.byteLength(JSON.stringify(value))<=MERCHANT_OBSERVATION_SUMMARY_LIMITS.maxBytes,'MERCHANT_OBSERVATION_WORKLOAD_LIMIT');
    store._assertOpen();store._db.exec('COMMIT');return value;
  }catch(error){try{store._db.exec('ROLLBACK');}catch{}throw error;}
}
