// MIT. Typed consumer of the original managed Merchant intake and received review.
import {createHash} from 'node:crypto';
import {canonicalJson,parseJSONBytes} from './protocol.mjs';
import {inspectMerchantOperator,createMerchantOperatorClient} from './operator-client.mjs';

export const MERCHANT_INTAKE_CONNECTION_SCHEMA='stellar-forge.merchant-intake-connection.v1';
const SCHEMA='stellar-forge.merchant-project-intake.v1';
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
export class MerchantIntakeClientError extends Error {
  constructor(code,{status=null,outcomeUnknown=false,recovery=null}={}) {
    super(code);this.name='MerchantIntakeClientError';this.code=code;this.status=status;
    this.outcomeUnknown=outcomeUnknown;if(recovery)this.recovery=recovery;
  }
}
const fail=(code,details)=>{throw new MerchantIntakeClientError(code,details);};
const need=(value,code,details)=>{if(!value)fail(code,details);};
function origin(value) {
  let parsed;try{parsed=new URL(value);}catch{fail('MERCHANT_INTAKE_CLIENT_URL_REQUIRED');}
  need(parsed.protocol==='http:'&&parsed.hostname==='127.0.0.1'&&parsed.port&&
    !parsed.username&&!parsed.password&&parsed.href===parsed.origin+'/',
    'MERCHANT_INTAKE_CLIENT_LOOPBACK_ORIGIN_REQUIRED');
  return parsed.origin;
}
function number(value,min,max,code) {
  need(Number.isSafeInteger(value)&&value>=min&&value<=max,code);return value;
}
function options(input) {
  need(object(input)&&SHA.test(input.selectionSha256??'')&&typeof input.operatorToken==='string'&&
    input.operatorToken.length>=32&&input.operatorToken.length<=8192&&
    !/[\u0000-\u0020\u007f]/.test(input.operatorToken),'MERCHANT_INTAKE_CLIENT_SELECTION_REQUIRED');
  return {url:origin(input.url),selectionSha256:input.selectionSha256,operatorToken:input.operatorToken,
    timeoutMs:number(input.timeoutMs??30000,100,300000,'MERCHANT_INTAKE_CLIENT_TIMEOUT_INVALID'),
    maximumJSONBytes:number(input.maximumJSONBytes??64*1024*1024,1024,64*1024*1024,
      'MERCHANT_INTAKE_CLIENT_CAPACITY_INVALID'),
    maximumDownloadBytes:number(input.maximumDownloadBytes??8*1024*1024*1024,1,Number.MAX_SAFE_INTEGER,
      'MERCHANT_INTAKE_CLIENT_CAPACITY_INVALID')};
}
async function request(selected,path,{signal,receive=false}={}) {
  const recovery=receive?{schema:MERCHANT_INTAKE_CONNECTION_SCHEMA,url:selected.url+'/',
    selectionSha256:selected.selectionSha256,action:'status'}:null;
  try {
    const response=await fetch(selected.url+path,{method:receive?'POST':'GET',redirect:'error',
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(selected.timeoutMs)]):AbortSignal.timeout(selected.timeoutMs),
      headers:{authorization:'Bearer '+selected.operatorToken,accept:'application/json',
        'x-merchant-intake-selection-sha256':selected.selectionSha256,
        ...(receive?{'content-type':'application/json'}:{})},...(receive?{body:'{}'}:{})});
    need(response.body,'MERCHANT_INTAKE_CLIENT_RESPONSE_MISSING');
    const reader=response.body.getReader(),parts=[];let size=0;
    try {for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;
      need(size<=selected.maximumJSONBytes,'MERCHANT_INTAKE_CLIENT_RESPONSE_TOO_LARGE');
      parts.push(Buffer.from(next.value));}}
    finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
    const value=parseJSONBytes(Buffer.concat(parts),{maximumBytes:selected.maximumJSONBytes});
    if(!response.ok)fail(/^[A-Za-z0-9_.:-]{1,160}$/.test(value?.error?.code??'')?
      value.error.code:'MERCHANT_INTAKE_CLIENT_HTTP_ERROR',{status:response.status,
        outcomeUnknown:receive&&response.status>=500,recovery});
    need(response.headers.get('x-merchant-intake-selection-sha256')===selected.selectionSha256,
      'MERCHANT_INTAKE_CLIENT_RESPONSE_SELECTION_CHANGED');
    return value;
  } catch(error) {
    if(error instanceof MerchantIntakeClientError) {
      if(receive&&error.status===null){error.outcomeUnknown=true;error.recovery=recovery;}throw error;
    }
    fail(signal?.aborted?'MERCHANT_INTAKE_CLIENT_ABORTED':'MERCHANT_INTAKE_CLIENT_REQUEST_FAILED',
      {outcomeUnknown:receive,recovery});
  }
}
function state(value,selected) {
  need(object(value)&&value.schema===SCHEMA&&value.selectionSha256===selected.selectionSha256&&
    object(value.selection)&&hash(canonicalJson(value.selection))===selected.selectionSha256&&
    value.selection.schema===SCHEMA&&UUID.test(value.selection.request?.operation??'')&&
    typeof value.selection.storeId==='string'&&SHA.test(value.selection.manifestSha256??'')&&
    ['READY','RECEIVING','RECEIVED','COMPLETE','RETRY_REQUIRED'].includes(value.state),
    'MERCHANT_INTAKE_CLIENT_STATE_CHANGED');
  return value;
}
/** No new request identity is generated. receive() sends the one server-retained request once. */
export async function createMerchantIntakeClient(input,{signal}={}) {
  const selected=options(input);
  const initial=state(await request(selected,'/api/state',{signal}),selected);
  const identity=initial.selection;
  const read=async(path,settings={})=>request(selected,path,settings);
  const client={
    connection:Object.freeze({schema:MERCHANT_INTAKE_CONNECTION_SCHEMA,url:selected.url+'/',
      selectionSha256:selected.selectionSha256,operation:identity.request.operation,
      storeId:identity.storeId,manifestSha256:identity.manifestSha256,archiveSha256:identity.archive.sha256}),
    async status(settings={}) {return state(await read('/api/state',settings),selected);},
    async receive(settings={}) {
      try {return state(await request(selected,'/api/receive',{...settings,receive:true}),selected);}
      catch(error) {
        if(error instanceof MerchantIntakeClientError&&error.status===null) {
          error.outcomeUnknown=true;error.recovery={schema:MERCHANT_INTAKE_CONNECTION_SCHEMA,
            url:selected.url+'/',selectionSha256:selected.selectionSha256,action:'status'};
        }
        throw error;
      }
    },
    async inventory({offset=0,limit=50,filter='',signal}={}) {
      number(offset,0,999999999,'MERCHANT_INTAKE_CLIENT_PAGE_INVALID');
      number(limit,1,100,'MERCHANT_INTAKE_CLIENT_PAGE_INVALID');
      need(typeof filter==='string'&&filter.length<=512,'MERCHANT_INTAKE_CLIENT_FILTER_INVALID');
      const query=new URLSearchParams({offset:String(offset),limit:String(limit),filter});
      const result=await read('/api/files?'+query,{signal});
      need(result?.manifestSha256===identity.manifestSha256&&result.offset===offset&&result.limit===limit&&
        Number.isSafeInteger(result.total)&&result.total>=0&&Array.isArray(result.rows)&&result.rows.length<=limit&&
        result.nextOffset===(offset+limit<result.total?offset+limit:null),'MERCHANT_INTAKE_CLIENT_INVENTORY_CHANGED');
      return result;
    },
    async *inventoryPages({limit=50,filter='',signal}={}) {
      let offset=0;
      for(;;){const page=await client.inventory({offset,limit,filter,signal});yield page;
        if(page.nextOffset===null)break;offset=page.nextOffset;}
    },
    async manifest(settings={}) {
      const value=await read('/api/manifest',settings);
      need(value?.schema==='stellar-forge.merchant-portable-project.v1'&&
        value.operation===identity.originalOperation&&value.original?.storeId===identity.storeId&&
        value.source?.sha256===identity.sourceSha256&&
        value.snapshot?.allRowsSha256===identity.originalRowsSha256&&Array.isArray(value.files),
        'MERCHANT_INTAKE_CLIENT_MANIFEST_CHANGED');
      return value;
    },
    async receipt(settings={}) {
      const value=await read('/api/receipt',settings);
      need(value?.schema==='stellar-forge.merchant-portable-result.v1'&&value.action==='receive'&&
        value.state==='COMPLETE'&&value.operation===identity.request.operation&&
        value.manifestSha256===identity.manifestSha256&&value.archive?.sha256===identity.archive.sha256&&
        value.received?.storeId===identity.storeId&&value.received.workspaceDirectory===identity.workspaceDirectory,
        'MERCHANT_INTAKE_CLIENT_RECEIPT_CHANGED');
      return value;
    },
    async review(settings={}) {
      const current=await client.status(settings);
      need(current.state==='COMPLETE'&&current.reviewUrl,'MERCHANT_INTAKE_CLIENT_REVIEW_NOT_READY');
      const url=origin(current.reviewUrl.endsWith('/')?current.reviewUrl:current.reviewUrl+'/')+'/';
      const found=await inspectMerchantOperator({url,operatorToken:selected.operatorToken,
        timeoutMs:selected.timeoutMs,maxJSONBytes:selected.maximumJSONBytes,
        maxDownloadBytes:selected.maximumDownloadBytes},settings);
      need(found.mode==='review'&&found.storeId===identity.storeId,'MERCHANT_INTAKE_CLIENT_REVIEW_CHANGED');
      const owner=await createMerchantOperatorClient({url,operatorToken:selected.operatorToken,
        storeId:found.storeId,tenantId:found.tenantId,timeoutMs:selected.timeoutMs,
        maxJSONBytes:selected.maximumJSONBytes,maxDownloadBytes:selected.maximumDownloadBytes},settings);
      return Object.freeze({connection:owner.connection,
        readRegister:owner.readRegister,registerPages:owner.registerPages,
        inspectInvoice:owner.inspectInvoice,paymentEnvelope:owner.paymentEnvelope,
        prepareRegisterExport:owner.prepareRegisterExport,downloadRegisterExport:owner.downloadRegisterExport,
        downloadInvoiceResult:owner.downloadInvoiceResult,observationSummary:owner.observationSummary});
    }
  };
  return Object.freeze(client);
}
