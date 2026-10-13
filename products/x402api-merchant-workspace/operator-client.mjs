// MIT. Typed operator transport for the existing x402api merchant application.
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open,lstat,realpath,mkdtemp,link,rm} from 'node:fs/promises';
import {dirname,basename,resolve,isAbsolute,join} from 'node:path';
import {normalizeInvoiceSelection} from './invoice-register.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[0-9a-f]{64}$/;
const CONNECTION='stellar-forge.merchant-operator-connection.v1';
const own=info=>process.getuid===undefined||info.uid===process.getuid();
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
export class MerchantOperatorError extends Error {
  constructor(code,{status=null,outcome=null,recovery=null}={}) {
    super(code);this.name='MerchantOperatorError';this.code=code;this.status=status;
    if(outcome)this.outcome=outcome;if(recovery)this.recovery=recovery;
  }
}
const fail=(code,details)=>{throw new MerchantOperatorError(code,details);};
const need=(value,code,details)=>{if(!value)fail(code,details);};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const id=value=>{need(typeof value==='string'&&UUID.test(value),'MERCHANT_OPERATOR_ID_INVALID');return value;};
function origin(value) {
  let url;try{url=new URL(value);}catch{fail('MERCHANT_OPERATOR_URL_INVALID');}
  need(url.origin!=='null'&&url.href===url.origin+'/'&&!url.username&&!url.password,
    'MERCHANT_OPERATOR_ORIGIN_REQUIRED');
  need(url.protocol==='https:'||url.protocol==='http:'&&
    ['127.0.0.1','[::1]','localhost'].includes(url.hostname),'MERCHANT_OPERATOR_SECURE_ORIGIN_REQUIRED');
  return url.origin;
}
function token(value) {
  need(typeof value==='string'&&value.length>=32&&value.length<=8192&&!/[\u0000-\u0020\u007f]/.test(value),
    'MERCHANT_OPERATOR_TOKEN_REQUIRED');return value;
}
function integer(value,minimum,maximum,code) {
  need(Number.isSafeInteger(value)&&value>=minimum&&value<=maximum,code);return value;
}
function fileIdentity(value) {
  need(object(value)&&Number.isSafeInteger(value.bytes)&&value.bytes>=0&&
    typeof value.sha256==='string'&&SHA.test(value.sha256),'MERCHANT_OPERATOR_FILE_IDENTITY_REQUIRED');
  return {bytes:value.bytes,sha256:value.sha256};
}
async function limitedBody(response,maximum) {
  need(response.body,'MERCHANT_OPERATOR_RESPONSE_MISSING');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;
    need(size<=maximum,'MERCHANT_OPERATOR_RESPONSE_TOO_LARGE');parts.push(Buffer.from(next.value));}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  return Buffer.concat(parts);
}
function parseJSON(raw) {
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
  catch{fail('MERCHANT_OPERATOR_RESPONSE_INVALID');}
}
function requestOptions(input) {
  need(object(input),'MERCHANT_OPERATOR_OPTIONS_REQUIRED');
  return {url:origin(input.url),operatorToken:token(input.operatorToken),
    timeoutMs:integer(input.timeoutMs??30000,100,300000,'MERCHANT_OPERATOR_TIMEOUT_INVALID'),
    maxJSONBytes:integer(input.maxJSONBytes??8*1024*1024,1024,64*1024*1024,'MERCHANT_OPERATOR_RESPONSE_LIMIT_INVALID'),
    maxDownloadBytes:integer(input.maxDownloadBytes??8*1024*1024*1024,1,Number.MAX_SAFE_INTEGER,'MERCHANT_OPERATOR_DOWNLOAD_LIMIT_INVALID')};
}
function signalFor(timeoutMs,signal) {
  return signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs);
}
function owner(response,storeId,tenantId) {
  need(response.headers.get('x-merchant-store-id')===storeId&&
    response.headers.get('x-merchant-tenant-id')===tenantId,'MERCHANT_OPERATOR_OWNER_RESPONSE_CHANGED');
}
async function jsonRequest(options,path,{method='GET',body,signal,headers={},identity=null,recovery=null}={}) {
  const mutation=method!=='GET';
  try{
    const response=await fetch(options.url+path,{method,redirect:'error',
      signal:signalFor(options.timeoutMs,signal),headers:{
        authorization:'Bearer '+options.operatorToken,accept:'application/json',...headers,
        ...(identity?{'x-merchant-store-id':identity.storeId,'x-merchant-tenant-id':identity.tenantId}:{}),
        ...(body===undefined?{}:{'content-type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    const raw=await limitedBody(response,options.maxJSONBytes),value=parseJSON(raw);
    if(!response.ok)fail(typeof value?.error==='string'&&/^[A-Za-z0-9_.:-]{1,120}$/.test(value.error)?
      value.error:'MERCHANT_OPERATOR_HTTP_ERROR',{status:response.status,
        ...(mutation&&response.status>=500?{outcome:'UNKNOWN',recovery}:{})});
    if(identity)owner(response,identity.storeId,identity.tenantId);
    need(object(value),'MERCHANT_OPERATOR_RESPONSE_INVALID');return {value,response};
  }catch(error){
    if(error instanceof MerchantOperatorError){
      if(mutation&&error.status===null){error.outcome='UNKNOWN';error.recovery=recovery;}
      throw error;
    }
    fail(signal?.aborted?'MERCHANT_OPERATOR_ABORTED':'MERCHANT_OPERATOR_TRANSPORT_FAILED',
      mutation?{outcome:'UNKNOWN',recovery}:{});
  }
}
/** Read the actual server owner before retaining a connection. Returns no credential. */
export async function inspectMerchantOperator(input,{signal}={}) {
  const options=requestOptions(input);
  const {value,response}=await jsonRequest(options,'/api/register?limit=1',{signal});
  need(value.schema==='stellar-forge.merchant-invoice-register.v1'&&UUID.test(value.source?.storeId??'')&&
    UUID.test(value.config?.tenantId??''),'MERCHANT_OPERATOR_APPLICATION_REQUIRED');
  owner(response,value.source.storeId,value.config.tenantId);
  return {schema:CONNECTION,url:options.url+'/',storeId:value.source.storeId,tenantId:value.config.tenantId,
    mode:value.mode,historyRevision:value.source.revision,configuration:value.config};
}
async function syncDirectory(path) {
  const fd=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{await fd.sync();}finally{await fd.close();}
}
async function privateDestination(path) {
  need(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path&&basename(path)!=='.',
    'MERCHANT_OPERATOR_ABSOLUTE_DESTINATION_REQUIRED');
  const parent=dirname(path),info=await lstat(parent);
  need(info.isDirectory()&&!info.isSymbolicLink()&&own(info)&&!(info.mode&0o077)&&await realpath(parent)===parent,
    'MERCHANT_OPERATOR_PRIVATE_DESTINATION_REQUIRED');
  return parent;
}
async function existingFile(path,expected) {
  let fd;try{fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
  try{
    const before=await fd.stat();need(before.isFile()&&own(before)&&before.nlink>=1&&!(before.mode&0o077),
      'MERCHANT_OPERATOR_DESTINATION_INVALID');
    need(before.size===expected.bytes,'MERCHANT_OPERATOR_DESTINATION_CHANGED');
    const digest=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let bytes=0;
    for(;;){const next=await fd.read(buffer,0,buffer.length,null);if(!next.bytesRead)break;
      bytes+=next.bytesRead;digest.update(buffer.subarray(0,next.bytesRead));}
    need(same(before,await fd.stat())&&same(before,await lstat(path))&&bytes===expected.bytes&&
      digest.digest('hex')===expected.sha256,'MERCHANT_OPERATOR_DESTINATION_CHANGED');
    await fd.sync();return {path,bytes,sha256:expected.sha256,reused:true};
  }finally{await fd.close();}
}
async function receiveFile(options,identity,path,expected,destination,{signal,authenticated=true}={}) {
  expected=fileIdentity(expected);
  need(expected.bytes<=options.maxDownloadBytes,'MERCHANT_OPERATOR_DOWNLOAD_TOO_LARGE');
  const parent=await privateDestination(destination),old=await existingFile(destination,expected);
  if(old){await syncDirectory(parent);return old;}
  const stage=await mkdtemp(join(parent,'.merchant-download-')),temporary=join(stage,'complete');
  let fd=null,response=null;
  try{
    response=await fetch(options.url+path,{redirect:'error',signal:signalFor(options.timeoutMs,signal),
      headers:authenticated?{authorization:'Bearer '+options.operatorToken,
        'x-merchant-store-id':identity.storeId,'x-merchant-tenant-id':identity.tenantId}:{}}); 
    if(!response.ok){
      let code='MERCHANT_OPERATOR_DOWNLOAD_FAILED';
      try{const value=parseJSON(await limitedBody(response,Math.min(options.maxJSONBytes,65536)));
        if(typeof value.error==='string'&&/^[A-Za-z0-9_.:-]{1,120}$/.test(value.error))code=value.error;}catch{}
      fail(code,{status:response.status});
    }
    if(authenticated)owner(response,identity.storeId,identity.tenantId);
    need(response.body&&response.headers.get('content-length')===String(expected.bytes)&&
      response.headers.get('x-content-sha256')===expected.sha256&&
      (!response.headers.get('content-encoding')||response.headers.get('content-encoding')==='identity'),
      'MERCHANT_OPERATOR_DOWNLOAD_IDENTITY_CHANGED');
    fd=await open(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
    const digest=createHash('sha256');let bytes=0;
    const reader=response.body.getReader();
    try{for(;;){const next=await reader.read();if(next.done)break;const part=Buffer.from(next.value);
      bytes+=part.length;need(bytes<=expected.bytes,'MERCHANT_OPERATOR_DOWNLOAD_IDENTITY_CHANGED');
      digest.update(part);let offset=0;while(offset<part.length){
        const written=await fd.write(part,offset,part.length-offset,null);
        need(written.bytesWritten>0,'MERCHANT_OPERATOR_DOWNLOAD_WRITE');offset+=written.bytesWritten;
      }
    }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    need(bytes===expected.bytes&&digest.digest('hex')===expected.sha256,'MERCHANT_OPERATOR_DOWNLOAD_IDENTITY_CHANGED');
    await fd.sync();await fd.close();fd=null;
    let reused=false;
    try{await link(temporary,destination);}
    catch(error){if(error.code!=='EEXIST')throw error;const current=await existingFile(destination,expected);
      need(current,'MERCHANT_OPERATOR_DESTINATION_CHANGED');reused=true;}
    // Remove the temporary link before returning a private single-link original.
    await rm(temporary);await syncDirectory(parent);
    return {path:destination,...expected,reused};
  }catch(error){
    if(error instanceof MerchantOperatorError)throw error;
    fail(signal?.aborted?'MERCHANT_OPERATOR_ABORTED':'MERCHANT_OPERATOR_DOWNLOAD_INTERRUPTED');
  }finally{if(fd)await fd.close().catch(()=>{});if(response?.body&&!response.body.locked)await response.body.cancel().catch(()=>{});await rm(stage,{recursive:true,force:true});}
}
function query(selection,options={}) {
  const normalized=normalizeInvoiceSelection(selection),params=new URLSearchParams();
  for(const [key,value] of Object.entries(normalized))if(value!=='')params.set(key,value);
  for(const key of ['limit','cursor','revision','format'])if(options[key]!==undefined&&options[key]!==null)
    params.set(key,String(options[key]));
  return params.toString();
}
function register(value,identity) {
  need(value.schema==='stellar-forge.merchant-invoice-register.v1'&&
    value.source?.storeId===identity.storeId&&value.config?.tenantId===identity.tenantId&&
    Array.isArray(value.orders)&&object(value.page)&&object(value.selection),'MERCHANT_OPERATOR_REGISTER_CHANGED');
  return value;
}
/** Establish the exact existing owner; the client never retries a mutation. */
export async function createMerchantOperatorClient(input,{signal}={}) {
  const options=requestOptions(input),identity={storeId:id(input.storeId),tenantId:id(input.tenantId)};
  const request=async(path,settings={})=>(await jsonRequest(options,path,{...settings,identity})).value;
  register(await request('/api/register?limit=1',{signal}),identity);
  const invoicePath=value=>'/api/orders/'+id(value);
  const operationPath=value=>'/api/project/exports/'+id(value);
  const recoverInvoice=value=>({kind:'invoice',id:value,action:'inspect'});
  const readSettings=({signal}={})=>({signal});
  const invoiceResponse=(value,original)=>{
    need(value.order?.id===original,'MERCHANT_OPERATOR_INVOICE_CHANGED');return value;
  };
  const projectResponse=(value,operation)=>{
    need(value.operation===operation&&value.storeId===identity.storeId,'MERCHANT_OPERATOR_PROJECT_CHANGED');return value;
  };
  const client={
    connection:Object.freeze({schema:CONNECTION,url:options.url+'/',...identity}),
    async readRegister({selection={},limit=50,cursor=null,revision=null,signal}={}) {
      integer(limit,1,200,'INVOICE_REGISTER_LIMIT_INVALID');
      return register(await request('/api/register?'+query(selection,{limit,cursor,revision}),{signal}),identity);
    },
    async *registerPages({selection={},limit=50,signal}={}) {
      let page=await client.readRegister({selection,limit,signal});yield page;
      const revision=page.source.revision,normalized=page.selection;
      while(page.page.next){page=await client.readRegister({selection:normalized,limit,cursor:page.page.next,revision,signal});yield page;}
    },
    inspectInvoice: async(value,settings={})=>invoiceResponse(await request(invoicePath(value),readSettings(settings)),value),
    createInvoice: (input,settings={})=>{
      need(object(input)&&UUID.test(input.id??''),'MERCHANT_OPERATOR_ORIGINAL_INVOICE_ID_REQUIRED');
      return request('/api/orders',{...readSettings(settings),method:'POST',body:input,recovery:recoverInvoice(input.id)});
    },
    createCharge: (value,settings={})=>request(invoicePath(value)+'/charge',
      {...readSettings(settings),method:'POST',recovery:recoverInvoice(value)}),
    paymentEnvelope: (value,settings={})=>request(invoicePath(value)+'/envelope',readSettings(settings)),
    submitPaymentAuthorization: (value,paymentSignature,settings={})=>{
      need(typeof paymentSignature==='string'&&/^[\x21-\x7e]{1,65536}$/.test(paymentSignature),
        'PAYMENT_SIGNATURE_INVALID');
      return request(invoicePath(value)+'/payment-authorization',
        {...readSettings(settings),method:'POST',body:{paymentSignature},recovery:recoverInvoice(value)});
    },
    reconcileInvoice: (value,settings={})=>request(invoicePath(value)+'/reconcile',
      {...readSettings(settings),method:'POST',recovery:recoverInvoice(value)}),
    intakeContext: (settings={})=>request('/api/invoice-intake/context',readSettings(settings)),
    listIntakes: (settings={})=>request('/api/invoice-intake',readSettings(settings)),
    inspectIntakeSource: (source,settings={})=>request('/api/invoice-intake/inspect',
      {...readSettings(settings),method:'POST',body:{source},recovery:{kind:'intake-source',action:'inspect'}}),
    prepareIntake: (input,settings={})=>{
      need(object(input)&&UUID.test(input.operation??'')&&input.storeId===identity.storeId&&input.tenantId===identity.tenantId,
        'INTAKE_OWNER_CHANGED');
      return request('/api/invoice-intake',{...readSettings(settings),method:'POST',body:input,
        recovery:{kind:'intake',operation:input.operation,action:'status'}});
    },
    readIntake: async(operation,settings={})=>{
      const value=await request('/api/invoice-intake/'+id(operation),readSettings(settings));
      need(value.operation===operation&&value.storeId===identity.storeId&&value.tenantId===identity.tenantId,
        'INTAKE_OWNER_CHANGED');return value;
    },
    exportIntake: async(operation,settings={})=>{
      const value=await request('/api/invoice-intake/'+id(operation)+'/export',readSettings(settings));
      need(value.plan?.operation===operation&&value.plan?.storeId===identity.storeId&&value.plan?.tenantId===identity.tenantId,
        'INTAKE_OWNER_CHANGED');return value;
    },
    runIntake: (operation,planSha256,settings={})=>{
      need(SHA.test(planSha256??''),'INTAKE_REVIEW_REQUIRED');
      return request('/api/invoice-intake/'+id(operation)+'/run',{...readSettings(settings),method:'POST',body:{planSha256},
        recovery:{kind:'intake',operation,action:'status'}});
    },
    observation: (settings={})=>request('/api/observation',readSettings(settings)),
    observationSummary: ({historySequence,signal}={})=>request('/api/observation/summary',
      {signal,headers:historySequence===undefined?{}:{'x-merchant-history-sequence':String(historySequence)}}),
    project: (settings={})=>request('/api/project',readSettings(settings)),
    projectStatus: async(operation,settings={})=>projectResponse(await request(operationPath(operation),readSettings(settings)),operation),
    projectManifest: (operation,settings={})=>request(operationPath(operation)+'/manifest',readSettings(settings)),
    beginProject: (operation,settings={})=>request('/api/project/exports',
      {...readSettings(settings),method:'POST',body:{operation:id(operation)},recovery:{kind:'project',operation,action:'status'}}),
    async prepareRegisterExport({selection={},revision,format='json',signal}={}) {
      need(typeof revision==='string'&&revision.startsWith(identity.storeId+':'),'INVOICE_REGISTER_REVIEW_SELECTION_REQUIRED');
      need(['json','csv'].includes(format),'INVOICE_REGISTER_EXPORT_FORMAT');
      const value=await request('/api/register/export?'+query(selection,{revision,format}),{signal});
      fileIdentity(value);need(value.source?.storeId===identity.storeId&&value.source?.revision===revision&&
        /^\/downloads\/invoices\/[0-9a-f-]{36}$/.test(value.url??''),'MERCHANT_OPERATOR_EXPORT_CHANGED');
      return value;
    },
    async downloadRegisterExport(ticket,destination,{signal}={}) {
      need(object(ticket)&&ticket.source?.storeId===identity.storeId&&
        /^\/downloads\/invoices\/[0-9a-f-]{36}$/.test(ticket.url??''),'MERCHANT_OPERATOR_EXPORT_CHANGED');
      return receiveFile(options,identity,ticket.url,ticket,destination,{signal,authenticated:false});
    },
    async previewInvoiceDelivery(value,settings={}) {
      const original=id(value),preview=await request(invoicePath(original)+'/delivery',readSettings(settings));
      need(preview.schema==='stellar-forge.merchant-invoice-delivery.v1'&&preview.invoiceId===original&&
        preview.owner?.storeId===identity.storeId&&preview.owner?.tenantId===identity.tenantId&&SHA.test(preview.revision??'')&&
        Array.isArray(preview.members)&&Array.isArray(preview.offers),'MERCHANT_OPERATOR_INVOICE_DELIVERY_CHANGED');
      return preview;
    },
    async prepareInvoiceDelivery(value,revision,settings={}) {
      const original=id(value);need(SHA.test(revision??''),'INVOICE_DELIVERY_REVIEW_REQUIRED');
      const ticket=await request(invoicePath(original)+'/delivery/export?revision='+encodeURIComponent(revision),readSettings(settings));
      fileIdentity(ticket);need(ticket.source?.storeId===identity.storeId&&ticket.source?.tenantId===identity.tenantId&&
        ticket.source?.revision===revision&&ticket.selection?.invoiceId===original&&ticket.selection?.revision===revision&&
        /^\/downloads\/invoices\/[0-9a-f-]{36}$/.test(ticket.url??''),'MERCHANT_OPERATOR_INVOICE_DELIVERY_CHANGED');
      return ticket;
    },
    async downloadInvoiceDelivery(ticket,destination,{signal}={}) {
      need(object(ticket)&&ticket.source?.storeId===identity.storeId&&ticket.source?.tenantId===identity.tenantId&&
        SHA.test(ticket.source?.revision??'')&&ticket.selection?.revision===ticket.source.revision&&UUID.test(ticket.selection?.invoiceId??'')&&
        /^\/downloads\/invoices\/[0-9a-f-]{36}$/.test(ticket.url??''),'MERCHANT_OPERATOR_INVOICE_DELIVERY_CHANGED');
      return receiveFile(options,identity,ticket.url,ticket,destination,{signal,authenticated:false});
    },
    async downloadInvoiceResult(value,destination,{signal}={}) {
      const detail=await client.inspectInvoice(value,{signal});
      need(detail.order?.id===value&&object(detail.order.result),'MERCHANT_OPERATOR_RESULT_NOT_READY');
      return receiveFile(options,identity,invoicePath(value)+'/result',detail.order.result,destination,{signal});
    },
    async downloadProject(operation,destination,{signal}={}) {
      const status=await client.projectStatus(operation,{signal});
      need(status.state==='COMPLETE'&&object(status.archive),'MERCHANT_PROJECT_EXPORT_NOT_READY');
      const expected={bytes:Number(status.archive.bytes),sha256:status.archive.sha256};
      return receiveFile(options,identity,operationPath(operation)+'/archive',expected,destination,{signal});
    }
  };
  return Object.freeze(client);
}
export {CONNECTION as MERCHANT_OPERATOR_CONNECTION_SCHEMA};
