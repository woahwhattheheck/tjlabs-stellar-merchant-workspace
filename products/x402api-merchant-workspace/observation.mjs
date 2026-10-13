// MIT. Read-only projection of the already-owned x402api merchant SQLite store.
// No new MerchantStore, provider request, signature, settlement or fulfillment.
import {createHash} from 'node:crypto';
import {canonicalJson} from './protocol.mjs';
export const MERCHANT_OBSERVATION_SCHEMA='stellar-forge.x402api-merchant-observation.v1';
export const MERCHANT_OBSERVATION_LIMITS=Object.freeze({maxBytes:8*1024*1024,maxRecords:100000});
const sha=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value);
const parsed=value=>value===null?null:JSON.parse(value);
const integer=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw Object.assign(new Error('MERCHANT_OBSERVATION_INTEGER'),{code:'MERCHANT_OBSERVATION_INTEGER',status:409});return n;};
const err=code=>{throw Object.assign(new Error(code),{code,status:409});};
const publicCode=value=>typeof value?.code==='string'&&/^[A-Za-z0-9_.:-]{1,120}$/.test(value.code)?value.code:null;
const file=value=>value?{bytes:value.bytes,sha256:value.sha256,contentType:value.contentType,fileName:value.fileName}:null;
export function readMerchantObservation(workspace) {
  const store=workspace.store;store._assertOpen();
  if(workspace.closing||store._db.isTransaction)err('MERCHANT_OBSERVATION_BUSY');
  const startedAt=new Date().toISOString(),groups={orders:[],history:[],exchanges:[],events:[],fulfillments:[]};
  let budget=4096,count=0;
  function add(group,value) {
    const n=Buffer.byteLength(json(value));
    if(++count>MERCHANT_OBSERVATION_LIMITS.maxRecords||budget+n+1>MERCHANT_OBSERVATION_LIMITS.maxBytes)
      err('MERCHANT_OBSERVATION_WORKLOAD_LIMIT');
    budget+=n+1;groups[group].push(value);
  }
  // Every query is synchronous under the original owner's read transaction.
  // Rows are measured individually before accumulation; large BLOBs are never selected.
  store._db.exec('BEGIN');
  try {
    const meta=store._get('SELECT * FROM merchant_meta WHERE singleton=1');
    const runtime=store._get('SELECT id,opened_at,state FROM merchant_runtimes WHERE id=?',store.runtimeId);
    if(meta.store_id!==store.storeId||runtime?.state!=='OPEN')err('MERCHANT_OBSERVATION_OWNER_CHANGED');
    for(const row of store._statement('SELECT id,reference,title,frozen_json,charge_request_bytes,charge_request_sha256,signature_sha256,charge_identity_json,data_json,state,created_at,updated_at FROM merchant_orders ORDER BY created_at,id').iterate()) {
      const f=parsed(row.frozen_json),d=parsed(row.data_json),identity=parsed(row.charge_identity_json);
      add('orders',{id:row.id,reference:row.reference,title:row.title,state:row.state,createdAt:row.created_at,updatedAt:row.updated_at,
        tenantId:f.tenantId,resourceId:f.template.resourceId,resourceVersionId:f.template.resourceVersionId,
        resourceVersion:f.template.resourceVersion,fulfillmentBinding:f.fulfillmentBinding,rails:f.rails,
        chargeId:identity.chargeId??null,providerOrderId:identity.providerOrderId??null,paymentId:identity.paymentId??null,
        signatureRetained:row.signature_sha256!==null,
        chargeRequest:{bytes:integer(row.charge_request_bytes),sha256:row.charge_request_sha256},
        receiptVerification:d.receiptVerification??null,lastError:publicCode(d.lastError),
        source:{frozenSha256:sha(row.frozen_json),dataSha256:sha(row.data_json),identitySha256:sha(row.charge_identity_json)}});
    }
    for(const row of store._statement('SELECT sequence,order_id,kind,data_json,created_at FROM merchant_history ORDER BY sequence').iterate()) {
      const d=parsed(row.data_json);
      add('history',{sequence:integer(row.sequence),orderId:row.order_id,kind:row.kind,at:row.created_at,
        state:d.set?.state??null,paymentId:d.set?.paymentId??d.data?.paymentId??d.paymentId??null,
        code:publicCode(d.set?.lastError)??publicCode(d.data)??publicCode(d),
        receiptVerified:d.set?.receiptVerification!=null,exchangeId:d.exchangeId??null,sourceSha256:sha(row.data_json)});
    }
    for(const row of store._statement('SELECT sequence,order_id,kind,status,raw_bytes,raw_sha256,response_complete,error_json,created_at FROM merchant_exchanges ORDER BY sequence').iterate())
      add('exchanges',{sequence:integer(row.sequence),orderId:row.order_id,kind:row.kind,
        status:row.status===null?null:integer(row.status),responseComplete:row.response_complete===1n,
        bytes:row.raw_bytes===null?null:integer(row.raw_bytes),sha256:row.raw_sha256,
        code:publicCode(parsed(row.error_json)),at:row.created_at});
    for(const row of store._statement('SELECT delivery_id,order_id,kind,state,raw_bytes,raw_sha256,details_json,created_at,updated_at FROM merchant_events ORDER BY created_at,delivery_id').iterate()) {
      const d=parsed(row.details_json);
      add('events',{deliveryId:row.delivery_id,orderId:row.order_id,kind:row.kind,state:row.state,
        bytes:integer(row.raw_bytes),sha256:row.raw_sha256,code:publicCode(d),createdAt:row.created_at,updatedAt:row.updated_at});
    }
    for(const row of store._statement('SELECT payment_id,order_id,state,attempt,run_kind,returned_bytes,returned_sha256,content_type,file_name,result_file_json,created_at,updated_at FROM merchant_fulfillments ORDER BY created_at,payment_id').iterate())
      add('fulfillments',{paymentId:row.payment_id,orderId:row.order_id,state:row.state,attempt:integer(row.attempt),runKind:row.run_kind,
        createdAt:row.created_at,updatedAt:row.updated_at,
        returned:row.returned_sha256===null?null:{bytes:integer(row.returned_bytes),sha256:row.returned_sha256,contentType:row.content_type,fileName:row.file_name},
        result:file(parsed(row.result_file_json))});
    const configurationSha256=sha(canonicalJson(workspace.config));
    const value={schema:MERCHANT_OBSERVATION_SCHEMA,storeId:store.storeId,storeCreatedAt:meta.created_at,
      runtimeId:runtime.id,runtimeOpenedAt:runtime.opened_at,configurationSha256,tenantId:workspace.config.tenantId,
      resourceVersionId:workspace.config.template.resourceVersionId,startedAt,capturedAt:new Date().toISOString(),
      authority:'ORIGINAL_MERCHANT_OWNER_READ_ONLY',coverage:'COMPLETE',
      projection:'COMPLETE_ORDER_HISTORY_AND_EXCHANGE_METADATA; ORIGINAL_BLOBS_NOT_EXPORTED',
      limits:MERCHANT_OBSERVATION_LIMITS,counts:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),
      ...groups};
    value.snapshotSha256=sha(json(value));
    if(Buffer.byteLength(json(value))>MERCHANT_OBSERVATION_LIMITS.maxBytes)err('MERCHANT_OBSERVATION_WORKLOAD_LIMIT');
    store._assertOpen();store._db.exec('COMMIT');return value;
  } catch(error){try{store._db.exec('ROLLBACK');}catch{}throw error;}
}
