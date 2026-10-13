// MIT. Invoice selection and complete operational exports from the original owner.
import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,openSync,writeSync,fsyncSync,closeSync,rmSync,constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export const INVOICE_REGISTER_SCHEMA='stellar-forge.merchant-invoice-register.v1';
export const INVOICE_STATES=Object.freeze(['CREATED','CHARGE_UNCERTAIN','CHARGE_REJECTED',
  'AWAITING_PAYMENT','PAYMENT_PENDING','PAYMENT_UNCERTAIN','PAYMENT_FAILED',
  'SETTLEMENT_CONFIRMED','FULFILLMENT_PENDING','FULFILLMENT_INTERRUPTED','COMPLETE']);
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(code,status=400)=>{throw Object.assign(new Error(code),{code,status});};
const need=(condition,code,status)=>{if(!condition)fail(code,status);};
const text=(value,maximum)=>typeof value==='string' && value.length<=maximum &&
  !/[\u0000-\u001f\u007f]/.test(value) && Buffer.from(value).toString('utf8')===value;
const number=value=>{
  const n=Number(value);need(Number.isSafeInteger(n)&&n>=0,'INVOICE_REGISTER_INTEGER',409);return n;
};
function day(value) {
  if(value==='')return '';
  need(typeof value==='string'&&/^\d{4}-\d\d-\d\d$/.test(value),'INVOICE_REGISTER_DATE_INVALID');
  const parsed=new Date(value+'T00:00:00.000Z');
  need(Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value,
    'INVOICE_REGISTER_DATE_INVALID');
  return value;
}
export function normalizeInvoiceSelection(input={}) {
  need(input&&typeof input==='object'&&!Array.isArray(input),'INVOICE_REGISTER_SELECTION_INVALID');
  need(Object.keys(input).every(key=>['q','state','from','to','assetId','network'].includes(key)),
    'INVOICE_REGISTER_SELECTION_INVALID');
  const q=input.q??'',state=input.state??'',assetId=input.assetId??'',network=input.network??'';
  need(text(q,512)&&text(assetId,512)&&text(network,512),'INVOICE_REGISTER_SELECTION_INVALID');
  need(state===''||INVOICE_STATES.includes(state),'INVOICE_REGISTER_STATE_INVALID');
  const from=day(input.from??''),to=day(input.to??'');
  need(!from||!to||from<=to,'INVOICE_REGISTER_DATE_ORDER');
  return {q:q.trim(),state,from,to,assetId,network};
}
export function invoiceRegisterQuery(parameters,{exporting=false}={}) {
  const allowed=['q','state','from','to','assetId','network','cursor','limit','revision',...(exporting?['format']:[])];
  for(const key of parameters.keys())
    need(allowed.includes(key)&&parameters.getAll(key).length===1,'INVOICE_REGISTER_QUERY_INVALID');
  const selection={};
  for(const key of ['q','state','from','to','assetId','network'])
    if(parameters.has(key))selection[key]=parameters.get(key);
  const limit=parameters.get('limit')??'50';
  need(/^[1-9][0-9]{0,2}$/.test(limit)&&Number(limit)<=200,'INVOICE_REGISTER_LIMIT_INVALID');
  if(exporting)need(!parameters.has('cursor'),'INVOICE_REGISTER_EXPORT_SELECTION_REQUIRED');
  return {selection:normalizeInvoiceSelection(selection),limit:Number(limit),
    cursor:parameters.get('cursor')??null,revision:parameters.get('revision')??null,
    ...(exporting?{format:parameters.get('format')??'csv'}:{})};
}
function where(selection) {
  const conditions=[],values=[];
  if(selection.q) {
    conditions.push('(instr(lower(o.id),lower(?))>0 OR instr(lower(o.reference),lower(?))>0 OR instr(lower(o.title),lower(?))>0)');
    values.push(selection.q,selection.q,selection.q);
  }
  if(selection.state){conditions.push('o.state=?');values.push(selection.state);}
  if(selection.from){conditions.push('o.created_at>=?');values.push(selection.from+'T00:00:00.000Z');}
  if(selection.to){conditions.push('substr(o.created_at,1,10)<=?');values.push(selection.to);}
  if(selection.assetId||selection.network) {
    const rails=[];
    if(selection.assetId){rails.push("json_extract(r.value,'$.assetId')=?");values.push(selection.assetId);}
    if(selection.network){rails.push("json_extract(r.value,'$.network')=?");values.push(selection.network);}
    conditions.push("EXISTS(SELECT 1 FROM json_each(o.frozen_json,'$.rails') r WHERE "+rails.join(' AND ')+')');
  }
  return {sql:conditions.length?' WHERE '+conditions.join(' AND '):'',values};
}
function inRead(workspace,work) {
  const store=workspace.store;store._assertOpen();
  need(!workspace.closing&&!store._db.isTransaction,'INVOICE_REGISTER_BUSY',409);
  store._db.exec('BEGIN');
  try {
    const meta=store._get('SELECT store_id FROM merchant_meta WHERE singleton=1');
    need(meta.store_id===store.storeId,'INVOICE_REGISTER_OWNER_CHANGED',409);
    const sequence=String(store._get('SELECT COALESCE(MAX(sequence),0) AS sequence FROM merchant_history').sequence);
    const source={storeId:store.storeId,historySequence:sequence,revision:store.storeId+':'+sequence,
      capturedAt:new Date().toISOString(),mode:workspace.readOnly?'review':'live'};
    const result=work(store,source);
    need(!result?.then,'INVOICE_REGISTER_SYNCHRONOUS_READ_REQUIRED',500);
    store._assertOpen();store._db.exec('COMMIT');return result;
  } catch(error){try{store._db.exec('ROLLBACK');}catch{}throw error;}
}
const selectedColumns='o.id,o.reference,o.title,o.state,o.created_at,o.updated_at,o.frozen_json,o.data_json,o.charge_identity_json,'+
  'f.payment_id AS fulfillment_payment_id,f.state AS fulfillment_state,f.returned_bytes,f.returned_sha256,f.result_file_json';
const joined=' FROM merchant_orders o LEFT JOIN merchant_fulfillments f ON f.order_id=o.id';
const file=value=>value?{fileName:value.fileName,contentType:value.contentType,bytes:value.bytes,sha256:value.sha256}:null;
export function invoiceRegisterRow(row) {
  const frozen=JSON.parse(row.frozen_json),data=JSON.parse(row.data_json),identity=JSON.parse(row.charge_identity_json);
  const jobResult=row.result_file_json===null?null:JSON.parse(row.result_file_json);
  const verified=data.receiptVerification;
  const receipt=verified?{status:'RECORDED_VERIFIED',verifiedAt:verified.verifiedAt,
    receiptDigest:verified.receiptDigest,signingKeyVersion:verified.signingKeyVersion}: {status:'NOT_RECORDED'};
  const returned=row.returned_sha256===null?null:{bytes:number(row.returned_bytes),sha256:row.returned_sha256};
  const saved=file(jobResult);
  const same=!!(saved&&returned&&saved.bytes===returned.bytes&&saved.sha256===returned.sha256);
  const orderResult=file(data.result);
  const projectionConsistent=!orderResult||!!(saved&&orderResult.bytes===saved.bytes&&
    orderResult.sha256===saved.sha256&&orderResult.fileName===saved.fileName&&orderResult.contentType===saved.contentType);
  const complete=row.fulfillment_state==='COMPLETE'&&same&&projectionConsistent&&
    row.fulfillment_payment_id===identity.paymentId;
  return {id:row.id,reference:row.reference,title:row.title,state:row.state,
    createdAt:row.created_at,updatedAt:row.updated_at,tenantId:frozen.tenantId,
    resourceId:frozen.template.resourceId,resourceVersionId:frozen.template.resourceVersionId,
    resourceVersion:frozen.template.resourceVersion,fulfillmentBinding:frozen.fulfillmentBinding,
    chargeId:identity.chargeId??null,providerOrderId:identity.providerOrderId??null,paymentId:identity.paymentId??null,
    offers:frozen.rails.map(rail=>({assetId:rail.assetId,asset:rail.asset,network:rail.network,
      recipient:rail.recipient,assetVersion:rail.assetVersion,walletVersion:rail.walletVersion,
      label:rail.label,decimals:rail.decimals,amountAtomic:rail.amountAtomic})),
    receipt,delivery:{state:row.fulfillment_state??'NOT_STARTED',paymentId:row.fulfillment_payment_id,
      recordedComplete:complete,orderProjectionPending:complete&&row.state!=='COMPLETE',
      returned,saved,projectionConsistent},
    lastError:typeof data.lastError?.code==='string'?data.lastError.code:null};
}
function summary(store,clause) {
  const selected=store._get('SELECT COUNT(*) AS n'+joined+clause.sql,...clause.values);
  const counts={};
  for(const row of store._all('SELECT state,COUNT(*) AS n FROM merchant_orders GROUP BY state'))
    counts[row.state]=number(row.n);
  const total=Object.values(counts).reduce((n,k)=>n+k,0);
  need(Number.isSafeInteger(total),'INVOICE_REGISTER_INTEGER',409);
  return {selected:number(selected.n),total,states:counts};
}
function options(store) {
  return store._all("SELECT DISTINCT json_extract(r.value,'$.assetId') AS assetId,"+
    "json_extract(r.value,'$.network') AS network,json_extract(r.value,'$.label') AS label "+
    "FROM merchant_orders o,json_each(o.frozen_json,'$.rails') r ORDER BY network,assetId,label")
    .map(row=>({assetId:row.assetId,network:row.network,label:row.label}));
}
function checkRevision(selected,source) {
  if(selected!==null&&selected!==undefined)
    need(selected===source.revision,'INVOICE_REGISTER_CHANGED',409);
}
function readCursor(cursor,selection,source) {
  if(!cursor)return 0;
  need(typeof cursor==='string'&&/^[A-Za-z0-9_-]{1,2048}$/.test(cursor),'INVOICE_REGISTER_CURSOR_INVALID');
  let selected;
  try {
    const raw=Buffer.from(cursor,'base64url');need(raw.toString('base64url')===cursor,'INVOICE_REGISTER_CURSOR_INVALID');
    selected=JSON.parse(raw.toString('utf8'));
  } catch {fail('INVOICE_REGISTER_CURSOR_INVALID');}
  need(selected&&selected.v===1&&selected.selection===hash(JSON.stringify(selection))&&
    Number.isSafeInteger(selected.offset)&&selected.offset>=0,'INVOICE_REGISTER_CURSOR_INVALID');
  need(typeof selected.revision==='string','INVOICE_REGISTER_CURSOR_INVALID');
  checkRevision(selected.revision,source);return selected.offset;
}
const cursorFor=(selection,source,offset)=>Buffer.from(JSON.stringify({
  v:1,selection:hash(JSON.stringify(selection)),revision:source.revision,offset})).toString('base64url');
export function readInvoiceRegister(workspace,{selection={},cursor=null,limit=50,revision=null}={}) {
  selection=normalizeInvoiceSelection(selection);
  need(Number.isInteger(limit)&&limit>=1&&limit<=200,'INVOICE_REGISTER_LIMIT_INVALID');
  return inRead(workspace,(store,source)=>{
    checkRevision(revision,source);
    const offset=readCursor(cursor,selection,source),clause=where(selection),counts=summary(store,clause);
    need(offset<=counts.selected,'INVOICE_REGISTER_PAGE_INVALID',409);
    const rows=store._all('SELECT '+selectedColumns+joined+clause.sql+
      ' ORDER BY o.created_at DESC,o.id DESC LIMIT ? OFFSET ?',...clause.values,limit,offset).map(invoiceRegisterRow);
    return {schema:INVOICE_REGISTER_SCHEMA,source,selection,counts,railOptions:options(store),orders:rows,
      page:{offset,limit,returned:rows.length,
        previous:offset?cursorFor(selection,source,Math.max(0,offset-limit)):null,
        next:offset+rows.length<counts.selected?cursorFor(selection,source,offset+rows.length):null}};
  });
}
const csvCell=value=>{
  let valueText=value===null||value===undefined?'':String(value);
  // Prefix only spreadsheet-active text; exact amounts remain canonical decimal strings.
  if(/^[\s]*[=+@-]/.test(valueText)||/^[\t\r\n]/.test(valueText))valueText="'"+valueText;
  return '"'+valueText.replaceAll('"','""')+'"';
};
const CSV_HEADERS=['store_id','history_sequence','captured_at','invoice_id','reference','title','state',
  'created_at','updated_at','tenant_id','resource_id','resource_version_id','resource_version',
  'charge_id','provider_order_id','payment_id','offer_index','offered_asset_id','offered_asset',
  'offered_network','offered_recipient','offered_asset_version','offered_wallet_version','offered_label',
  'offered_decimals','offered_amount_atomic','receipt_status','receipt_verified_at','receipt_digest',
  'delivery_state','recorded_complete_result','order_projection_pending','result_file_name',
  'result_content_type','result_bytes','result_sha256','last_error'];
export function invoiceRegisterCSV(source,row) {
  return row.offers.map((offer,i)=>[
    source.storeId,source.historySequence,source.capturedAt,row.id,row.reference,row.title,row.state,
    row.createdAt,row.updatedAt,row.tenantId,row.resourceId,row.resourceVersionId,row.resourceVersion,
    row.chargeId,row.providerOrderId,row.paymentId,i+1,offer.assetId,offer.asset,offer.network,
    offer.recipient,offer.assetVersion,offer.walletVersion,offer.label,offer.decimals,offer.amountAtomic,
    row.receipt.status,row.receipt.verifiedAt,row.receipt.receiptDigest,row.delivery.state,
    row.delivery.recordedComplete,row.delivery.orderProjectionPending,row.delivery.saved?.fileName,
    row.delivery.saved?.contentType,row.delivery.saved?.bytes,row.delivery.saved?.sha256,row.lastError
  ].map(csvCell).join(',')+'\r\n').join('');
}
/** Spool one consistent complete selection to a private file, without retaining all rows in RAM. */
export function createInvoiceRegisterExport(workspace,{selection={},revision=null,format='csv'}={}) {
  selection=normalizeInvoiceSelection(selection);
  need(['csv','json'].includes(format),'INVOICE_REGISTER_EXPORT_FORMAT');
  const directory=mkdtempSync(join(tmpdir(),'merchant-invoice-register-'));
  const path=join(directory,'invoices.'+format);let fd=null,bytes=0;
  const digest=createHash('sha256');
  const cleanup=()=>rmSync(directory,{recursive:true,force:true});
  try {
    fd=openSync(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);
    const write=text=>{
      const body=Buffer.from(text);let offset=0;
      while(offset<body.length){const written=writeSync(fd,body,offset,body.length-offset);need(written>0,'INVOICE_REGISTER_EXPORT_WRITE',500);offset+=written;}
      bytes+=body.length;need(Number.isSafeInteger(bytes),'INVOICE_REGISTER_EXPORT_SIZE',500);digest.update(body);
    };
    const report=inRead(workspace,(store,source)=>{
      checkRevision(revision,source);
      const clause=where(selection),counts=summary(store,clause);
      const metadata={schema:INVOICE_REGISTER_SCHEMA,source,selection,counts,
        amountMeaning:'Each offer is an alternative quoted price. Receipt and result outcomes are per invoice. Offered amounts are not settled revenue.',
        format,ordering:'createdAt descending, id descending'};
      if(format==='json')write(JSON.stringify(metadata).slice(0,-1)+',"invoices":[');
      else write(CSV_HEADERS.map(csvCell).join(',')+'\r\n');
      let invoiceCount=0,offerCount=0;
      for(const row of store._statement('SELECT '+selectedColumns+joined+clause.sql+
          ' ORDER BY o.created_at DESC,o.id DESC').iterate(...clause.values)) {
        const invoice=invoiceRegisterRow(row);
        if(format==='json')write((invoiceCount?',':'')+JSON.stringify(invoice));
        else write(invoiceRegisterCSV(source,invoice));
        invoiceCount++;offerCount+=invoice.offers.length;
      }
      need(invoiceCount===counts.selected,'INVOICE_REGISTER_EXPORT_COUNT',409);
      if(format==='json')write(']}\n');
      return {...metadata,invoiceCount,offerCount};
    });
    fsyncSync(fd);closeSync(fd);fd=null;
    return {operation:randomUUID(),path,bytes,sha256:digest.digest('hex'),
      fileName:'merchant-invoices-'+report.source.capturedAt.slice(0,10)+'.'+format,
      contentType:format==='json'?'application/json; charset=utf-8':'text/csv; charset=utf-8',
      report,cleanup};
  } catch(error){if(fd!==null)closeSync(fd);cleanup();throw error;}
}
