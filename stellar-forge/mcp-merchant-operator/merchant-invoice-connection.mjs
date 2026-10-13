// MIT. Live original Merchant owners selected by the existing host.
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createMerchantOperatorClient,MERCHANT_OPERATOR_CONNECTION_SCHEMA} from '../../products/x402api-merchant-workspace/operator-client.mjs';
import {readMerchantInput} from '../../products/x402api-merchant-workspace/application-inputs.mjs';
import {canonicalJson} from '../../products/x402api-merchant-workspace/protocol.mjs';
import {projectJSON,projectPath,projectPrivateDirectory,projectNeed as need} from './merchant-project-connection.mjs';
const SHA=/^[a-f0-9]{64}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys,required=keys)=>need(plain(v)&&Object.keys(v).every(k=>keys.includes(k))&&required.every(k=>Object.hasOwn(v,k)),'MERCHANT_INVOICE_CONFIGURATION');
export const invoiceHash=value=>createHash('sha256').update(value).digest('hex');
export async function readMerchantInvoiceConfiguration(file) {
 file=projectPath(file);const raw=await projectJSON(file),base=dirname(file);
 exact(raw,['schema','merchants']);
 need(raw.schema==='stellar-forge.merchant-invoice-agent.v1'&&plain(raw.merchants)&&
  Object.keys(raw.merchants).length>0&&Object.keys(raw.merchants).length<=32,'MERCHANT_INVOICE_CONFIGURATION');
 const merchants=Object.create(null),seen=new Set();
 for(const [alias,value] of Object.entries(raw.merchants)) {
  need(/^[a-z0-9][a-z0-9_-]{0,63}$/.test(alias)&&!['constructor','prototype','__proto__'].includes(alias),'MERCHANT_INVOICE_ALIAS');
  exact(value,['label','connectionFile','connectionSha256','tokenEnvironment','exportsDirectory','sources'],
   ['connectionFile','connectionSha256','tokenEnvironment','exportsDirectory']);
  need(SHA.test(value.connectionSha256??'')&&/^[A-Z][A-Z0-9_]{0,127}$/.test(value.tokenEnvironment??'')&&
   (value.label===undefined||typeof value.label==='string'&&value.label.length<=160),'MERCHANT_INVOICE_CONFIGURATION');
  const entry={...value,label:value.label??alias,connectionFile:projectPath(value.connectionFile,base),
   exportsDirectory:projectPath(value.exportsDirectory,base),sources:Object.create(null)};
  const connection=await readMerchantInvoiceConnection(entry);
  entry.identity={storeId:connection.storeId,tenantId:connection.tenantId,connectionSha256:value.connectionSha256};
  entry.scope=invoiceHash(canonicalJson(entry.identity));
  need(!seen.has(entry.scope),'MERCHANT_INVOICE_DUPLICATE_OWNER');seen.add(entry.scope);
  await projectPrivateDirectory(entry.exportsDirectory);
  need(value.sources===undefined||plain(value.sources)&&Object.keys(value.sources).length<=100,'MERCHANT_INVOICE_SOURCES');
  for(const [source,selected] of Object.entries(value.sources??{})) {
   need(/^[a-z0-9][a-z0-9_-]{0,63}$/.test(source),'MERCHANT_INVOICE_SOURCE_ALIAS');
   exact(selected,['path','name','format','sha256']);
   need(typeof selected.name==='string'&&selected.name.length>0&&selected.name.length<=200&&
    !/[\u0000-\u001f\u007f/\\]/.test(selected.name)&&['csv','json'].includes(selected.format)&&SHA.test(selected.sha256??''),
    'MERCHANT_INVOICE_SOURCE_CONFIGURATION');
   entry.sources[source]={...selected,path:projectPath(selected.path,base)};
  }
  merchants[alias]=entry;
 }
 return {file,merchants};
}
export async function readMerchantInvoiceConnection(definition) {
 const input=await readMerchantInput(definition.connectionFile,{maximum:1024*1024,collect:true,privateOnly:true,allowMultipleLinks:true});
 need(input.descriptor.sha256===definition.connectionSha256,'MERCHANT_INVOICE_CONNECTION_CHANGED');
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(input.raw));
 need(value.schema===MERCHANT_OPERATOR_CONNECTION_SCHEMA&&UUID.test(value.storeId??'')&&UUID.test(value.tenantId??'')&&
  typeof value.url==='string','MERCHANT_INVOICE_CONNECTION_REQUIRED');
 const url=new URL(value.url);
 need(url.href===url.origin+'/'&&!url.username&&!url.password&&
  (url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','[::1]','localhost'].includes(url.hostname)),
  'MERCHANT_INVOICE_CONNECTION_ORIGIN');
 if(definition.identity)need(value.storeId===definition.identity.storeId&&value.tenantId===definition.identity.tenantId,
  'MERCHANT_INVOICE_OWNER_CHANGED');
 return {url:url.origin+'/',storeId:value.storeId,tenantId:value.tenantId};
}
export async function connectMerchantInvoice(definition,environment=process.env) {
 return createMerchantOperatorClient({...await readMerchantInvoiceConnection(definition),
  operatorToken:environment[definition.tokenEnvironment],timeoutMs:300000});
}
export async function selectedInvoiceSource(definition,args) {
 need((args.source!==undefined)!==(args.sourceFile!==undefined),'MERCHANT_INVOICE_ONE_SOURCE_REQUIRED');
 let source=args.source;
 if(args.sourceFile!==undefined) {
  const selected=definition.sources[args.sourceFile];need(selected,'MERCHANT_INVOICE_SOURCE_ALIAS_REQUIRED');
  const saved=await readMerchantInput(selected.path,{maximum:1048576,collect:true,privateOnly:true,allowMultipleLinks:true});
  need(saved.descriptor.sha256===selected.sha256,'MERCHANT_INVOICE_SOURCE_CHANGED');
  source={name:selected.name,format:selected.format,text:new TextDecoder('utf-8',{fatal:true}).decode(saved.raw)};
 }
 need(plain(source)&&typeof source.text==='string'&&Buffer.byteLength(source.text)<=1048576,'MERCHANT_INVOICE_SOURCE_CAPACITY');
 return structuredClone(source);
}
