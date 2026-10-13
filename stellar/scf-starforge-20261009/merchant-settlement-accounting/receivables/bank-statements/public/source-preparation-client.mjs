// MIT. Same-origin source preparations through the installed original accounting owner.
import {ReceivablesClient,ReceivablesApiError} from './receivables-client.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const canonical=v=>Array.isArray(v)?v.map(canonical):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const utf8=v=>new TextEncoder().encode(v),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const need=(ok,message,code='INVALID_RESPONSE')=>{if(!ok)throw new ReceivablesApiError(message,{code:'BANK_SOURCE_DESK_'+code});};
const hash=async bytes=>hex(await crypto.subtle.digest('SHA-256',bytes));
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const query=value=>{const q=new URLSearchParams();for(const[k,v]of Object.entries(value??{}))if(v!==undefined&&v!==null)q.set(k,String(v));return q.size?'?'+q:'';};
export async function bankSourceReceiptSha256(value){return hash(utf8(JSON.stringify(canonical(value))));}
export class BankSourcePreparationsClient extends ReceivablesClient{
 constructor({baseUrl,...options}={}){
  need(typeof baseUrl==='string'&&baseUrl.startsWith('/')&&!baseUrl.startsWith('//')&&!/[?#\\\u0000-\u0020]/.test(baseUrl)&&!baseUrl.split('/').some(x=>x==='.'||x==='..'),'Use the configured same-origin source preparation route.','CONFIGURATION');
  need(sha(options.expectedWorkspaceId)&&sha(options.expectedSourcesSha256),'Retain both original workspace and accounting source identities.','WORKSPACE');
  super({baseUrl,...options});this.alias=null;this.preparationSources=new Map();
 }
 check(value,id){
  need(object(value)&&value.workspaceId===this.expectedWorkspaceId&&typeof value.workspace==='string','The reply belongs to another original accounting workspace.','WORKSPACE');
  if(this.alias!==null)need(value.workspace===this.alias,'The configured accounting alias changed.','WORKSPACE');
  this.alias??=value.workspace;
  if(id!==undefined){
   need(value.preparationId===id,'The reply belongs to another preparation.','REQUEST');
   if(value.state==='NOT_FOUND')return value;
   need(value.schema==='stellar-forge.accounting-bank-source-preparation.v1'&&
    ['RETAINING','PREPARED','COMPLETE'].includes(value.state)&&sha(value.requestSha256)&&sha(value.sourceSha256)&&
    Array.isArray(value.inputs)&&Array.isArray(value.files),'Keep the complete original source receipt.','RECEIPT');
   if(this.preparationSources.has(id))need(this.preparationSources.get(id)===value.sourceSha256,'The retained preparation operating source changed.','SOURCE_CHANGED');
   this.preparationSources.set(id,value.sourceSha256);
   const names=new Set();for(const pin of value.files){
    need(object(pin)&&typeof pin.name==='string'&&pin.name!=='.'&&pin.name!=='..'&&!/[/\\\u0000-\u001f\u007f]/.test(pin.name)&&
     !names.has(pin.name)&&Number.isSafeInteger(pin.bytes)&&pin.bytes>=0&&sha(pin.sha256),'The complete original file inventory is invalid.','RECEIPT');names.add(pin.name);
   }
  }
  return value;
 }
 async status(options){const r=this.check(await super.request('/status',options));need(sha(r.sourceSha256)&&Array.isArray(r.configuredSources)&&object(r.limits),'The source preparation status is incomplete.');return r;}
 async source(args,options){const r=this.check(await super.request('/source'+query(args),options));need(r.sourceAlias===args.sourceAlias&&r.name===args.name&&sha(r.sha256)&&Number.isSafeInteger(r.bytes)&&r.bytes>0,'The original source pin changed.');return r;}
 async list(args={},options){const r=this.check(await super.request('/list'+query(args),options));need(sha(r.inventorySha256)&&object(r.page)&&Array.isArray(r.page.items),'The original preparation inventory is incomplete.');for(const item of r.page.items)this.check(item,item.preparationId);return r;}
 async lookup(preparationId,options){need(uuid(preparationId),'Select an original preparation UUID.');return this.check(await super.request('/request'+query({preparationId}),options),preparationId);}
 async prepare({request},options){
  need(object(request)&&request.workspaceId===this.expectedWorkspaceId&&uuid(request.requestId),'Keep the full original request and workspace identity.','REQUEST');
  const expected=await bankSourceReceiptSha256(request);
  const r=this.check(await super.request('/prepare',{...options,method:'POST',body:{request}}),request.requestId);
  need(r.requestSha256===expected,'The saved request differs from the exact submitted request.','REQUEST_CHANGED');return r;
 }
 async execute(args,options){
  need(uuid(args?.preparationId)&&sha(args?.expectedRequestSha256),'Select the exact retained preparation and request SHA.','REQUEST');
  const r=this.check(await super.request('/execute',{...options,method:'POST',body:args}),args.preparationId);
  need(r.requestSha256===args.expectedRequestSha256,'The executed original request differs.','REQUEST_CHANGED');return r;
 }
 async view(args,options){const r=this.check(await super.request('/view'+query(args),options));need(r.preparationId===args.preparationId&&object(r.view)&&object(r.view.page),'The original output view is incomplete.');return r;}
 async download(receipt,name,options){
  this.check(receipt,receipt.preparationId);const bundle=name===undefined;
  const pin=bundle?null:receipt.files.find(x=>x.name===name);
  need(bundle?receipt.state==='COMPLETE':pin,'Select a complete capsule or an exact retained receipt file.','FILE');
  const receiptSha256=await bankSourceReceiptSha256(receipt);
  const response=await super.request((bundle?'/bundle':'/file')+query({preparationId:receipt.preparationId,receiptSha256,...(bundle?{}:{name})}),{...options,binary:true});
  const expected=response.headers.get('x-content-sha256'),length=response.headers.get('content-length');
  need(sha(expected)&&/^\d+$/.test(length??'')&&response.headers.get('x-accounting-workspace-id')===this.expectedWorkspaceId&&response.headers.get('x-source-receipt-sha256')===receiptSha256,'The download lost its original identity.','FILE');
  let value;try{value=new Uint8Array(await response.arrayBuffer());}catch(error){throw new ReceivablesApiError('The original download was interrupted. Keep its receipt and download that same file again.',{code:'BANK_SOURCE_DESK_DOWNLOAD_FAILED',details:{outcome:'read_failed',cause:String(error?.message??error)}});}
  const actual=await hash(value);
  need(value.length===Number(length)&&actual===expected&&(!pin||(value.length===pin.bytes&&actual===pin.sha256)),'The complete downloaded bytes differ from their original receipt.','FILE_CHANGED');
  return{name:bundle?'bank-source-'+receipt.preparationId+'.source-preparation.json':name,type:response.headers.get('content-type')||'application/octet-stream',bytes:value,sha256:actual};
 }
 file(receipt,name,options){return this.download(receipt,name,options);}
 bundle(receipt,options){return this.download(receipt,undefined,options);}
}
