import {readFileSync} from 'node:fs';
import {invariant} from './source-json.mjs';
const sdp=JSON.parse(readFileSync(new URL('../sources/sdp-openapi.json',import.meta.url),'utf8'));
const bridge=JSON.parse(readFileSync(new URL('../sources/bridge-contracts.json',import.meta.url),'utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));
export function resolveReference(spec,value) {
  if(!value?.$ref)return value;
  invariant(value.$ref.startsWith('#/'),'EXTERNAL_SCHEMA_REFERENCE_UNSUPPORTED');
  const next=value.$ref.slice(2).split('/').map(x=>x.replaceAll('~1','/').replaceAll('~0','~')).reduce((v,k)=>v?.[k],spec);
  invariant(next,'SCHEMA_REFERENCE_MISSING',{ref:value.$ref});
  return resolveReference(spec,next);
}
const entries=[], contracts=new Map();
function requestComponents(spec,roots) {
 const output={},seen=new Set();
 function visit(value){
  if(!value||typeof value!=='object')return;
  if(value.$ref&&value.$ref.startsWith('#/components/')){
   if(seen.has(value.$ref))return;seen.add(value.$ref);
   const parts=value.$ref.slice(2).split('/').map(x=>x.replaceAll('~1','/').replaceAll('~0','~'));
   const original=parts.reduce((v,key)=>v?.[key],spec);
   invariant(original!==undefined,'SCHEMA_REFERENCE_MISSING',{ref:value.$ref});
   let target=output;for(const key of parts.slice(1,-1))target=target[key]??={};
   target[parts.at(-1)]=original;visit(original);
  }
  for(const child of Object.values(value))visit(child);
 }
 roots.forEach(visit);return output;
}
function register({id,provider,path,method,kind,pagination=null,spec,source,operation}) {
  const op=clone(operation ?? spec.paths[path]?.[method.toLowerCase()]);
  invariant(op,'ORIGINAL_OPERATION_MISSING',{id,path,method});
  const parameters=[...(spec.paths[path]?.parameters??[]),...(op.parameters??[])].map(p=>clone(resolveReference(spec,p)));
  const byKey=new Map(parameters.map(p=>[p.in+':'+p.name,p]));
  op.parameters=[...byKey.values()];
  if(op.requestBody)op.requestBody=clone(resolveReference(spec,op.requestBody));
  let responseFormat='text';
  for(const [status,raw] of Object.entries(op.responses??{}))if(/^2\d\d$/.test(status)){
    const response=resolveReference(spec,raw);
    if(response.content?.['application/json'])responseFormat='json';
    else if(response.content?.['text/csv'])responseFormat='csv';
  }
  const entry={id,action:id,label:op.summary??id,provider,method:method.toUpperCase(),path,
    mutation:!['GET','HEAD'].includes(method.toUpperCase()),resourceKind:kind,responseFormat,pagination,
    inputSchema:{parameters:op.parameters,requestBody:op.requestBody??null,components:requestComponents(spec,[op.parameters,op.requestBody])},source};
  entries.push(entry);contracts.set(id,{entry,operation:op,spec});
}
const SDP_SOURCE={repository:'stellar/stellar-disbursement-platform-backend',
  commit:'4330f131e8a2638a10767ec8db50a98f22672a61',docsRepository:'stellar/stellar-docs',
  docsCommit:'0886fb75182106bdd1b33c3aeae52bb5fe122b0a',version:'7.0.0',
  original:'sources/sdp-original.json',openapi:'sources/sdp-openapi.json'};
const sdps=[
 ['payments.list','/payments','get','payment','sdp'],
 ['payment.get','/payments/{id}','get','payment'],
 ['payments.retry','/payments/retry','patch','payment-result'],
 ['payment.status','/payments/{id}/status','patch','payment-result'],
 ['disbursements.list','/disbursements','get','disbursement','sdp'],
 ['disbursement.get','/disbursements/{id}','get','disbursement'],
 ['disbursement.create','/disbursements','post','disbursement'],
 ['disbursement.delete','/disbursements/{id}','delete','disbursement-result'],
 ['disbursement.receivers','/disbursements/{id}/receivers','get','receiver','sdp'],
 ['disbursement.instructions.download','/disbursements/{id}/instructions','get','export'],
 ['disbursement.instructions.upload','/disbursements/{id}/instructions','post','disbursement-result'],
 ['disbursement.status','/disbursements/{id}/status','patch','disbursement-result'],
 ['receivers.list','/receivers','get','receiver','sdp'],
 ['receiver.get','/receivers/{id}','get','receiver'],
 ['assets.list','/assets','get','asset'],
 ['wallets.list','/wallets','get','wallet'],
 ['distribution-wallets.list','/distribution-wallets','get','distribution-wallet'],
 ['distribution-wallet.get','/distribution-wallets/{id}','get','distribution-wallet'],
 ['distribution-wallet.balance','/distribution-wallets/{id}/balance','get','balance'],
 ['distribution-wallet.capabilities','/distribution-wallets/{id}/capabilities','get','capabilities'],
 ['organization.get','/organization','get','organization'],
 ['exports.disbursements','/exports/disbursements','get','export'],
 ['exports.payments','/exports/payments','get','export'],
 ['exports.receivers','/exports/receivers','get','export'],
];
for(const [id,path,method,kind,pagination]of sdps){
 invariant(sdp.paths[path]?.[method],'ORIGINAL_OPERATION_MISSING',{id,path,method});
 const operation=clone(sdp.paths[path][method]);
 invariant(operation,'ORIGINAL_OPERATION_MISSING',{id});
 if(id==='disbursement.status')operation.requestBody={required:true,content:{'application/json':{schema:{
   type:'object',required:['status'],additionalProperties:false,properties:{status:{type:'string',enum:['STARTED','PAUSED','CANCELED']}}}}}};
 register({id:'sdp.'+id,provider:'sdp',path,method,kind:'sdp-'+kind,pagination,spec:sdp,operation,
 source:{...SDP_SOURCE,...(id==='disbursement.status'?{requestBodySource:'internal/serve/disbursement_handler.go at original backend commit; documented OpenAPI omits its request body'}:{})}});
}
const bridges=[
 ['transfers.list','api-reference/transfers/get-all-transfers.md','get','transfer','bridge'],
 ['transfer.get','api-reference/transfers/get-a-transfer.md','get','transfer'],
 ['transfer.create','api-reference/transfers/create-a-transfer.md','post','transfer'],
 ['customer.get','api-reference/customers/get-a-single-customer-object.md','get','customer'],
 ['virtual-accounts.list','api-reference/virtual-accounts/list-virtual-accounts-by-customer.md','get','virtual-account','bridge'],
 ['virtual-account.get','api-reference/virtual-accounts/get-a-virtual-account.md','get','virtual-account'],
 ['virtual-account.create','api-reference/virtual-accounts/create-a-virtual-account.md','post','virtual-account'],
 ['virtual-account.history','api-reference/virtual-accounts/virtual-account-activity.md','get','virtual-account-event','bridge'],
 ['virtual-accounts.history','api-reference/virtual-accounts/virtual-account-activity-across-all-customers.md','get','virtual-account-event','bridge'],
];
for(const [id,document,method,kind,pagination]of bridges){
 const d=bridge[document];invariant(d,'ORIGINAL_DOCUMENT_MISSING',{document});
 const path=Object.keys(d.spec.paths).find(p=>d.spec.paths[p][method]);
 register({id:'bridge.'+id,provider:'bridge',path,method,kind:'bridge-'+kind,pagination,spec:d.spec,
   source:{url:d.url,sha256:d.sha256,original:document}});
}
function simple({id,path,kind,parameters=[],pagination=null,method='get',body=null,source}){
 const operation={summary:id,parameters,responses:{200:{content:{'application/json':{schema:{}}}}}};
 if(body)operation.requestBody={required:true,content:{'application/json':{schema:body}}};
 register({id,provider:id.split('.')[0],path,kind,method,pagination,spec:{paths:{[path]:{[method]:operation}}},source});
}
const parameter=(name,location,schema,required=false)=>({name,in:location,schema,required});
const horizonSource={repository:'stellar/js-stellar-sdk',tag:'v17.0.1',
 commit:'74ac883871396138e1882a3ca4bcec7e4ace76b5',original:'sources/horizon-original.json'};
const idSchemas={accountId:{type:'string',pattern:'^(?:G[A-Z2-7]{55}|M[A-Z2-7]{68})$'},
 transactionHash:{type:'string',pattern:'^[0-9a-fA-F]{64}$'},
 operationId:{type:'string',pattern:'^[1-9][0-9]*$'},ledger:{type:'string',pattern:'^[1-9][0-9]*$'}};
simple({id:'horizon.network.get',path:'/',kind:'horizon-network',source:horizonSource});
for(const [id,path,key]of [['account','accounts','accountId'],['transaction','transactions','transactionHash'],['operation','operations','operationId'],['ledger','ledgers','ledger']])
 simple({id:'horizon.'+id+'.get',path:'/'+path+'/{'+key+'}',kind:'horizon-'+id,
 parameters:[parameter(key,'path',idSchemas[key],true)],source:horizonSource});
for(const list of ['payments','operations','transactions'])for(const scope of ['all','account','ledger',...(list==='transactions'?[]:['transaction'])]){
 const key={account:'accountId',transaction:'transactionHash',ledger:'ledger'}[scope];
 const prefix={account:'accounts',transaction:'transactions',ledger:'ledgers'}[scope];
 const path=(scope==='all'?'':'/'+prefix+'/{'+key+'}')+'/'+list;
 const parameters=[...(key?[parameter(key,'path',idSchemas[key],true)]:[]),
 parameter('limit','query',{type:'integer',minimum:1,maximum:200}),
 parameter('cursor','query',{type:'string',pattern:'^(?:[0-9]+|now)$'}),
 parameter('order','query',{type:'string',enum:['asc','desc']}),
 parameter('include_failed','query',{type:'boolean'}),
 ...(list==='transactions'?[]:[parameter('join','query',{type:'string',enum:['transactions']})])];
 simple({id:'horizon.'+list+'.'+scope,path,kind:list==='transactions'?'horizon-transaction':'horizon-operation',
 parameters,pagination:'horizon',source:horizonSource});
}
simple({id:'bridge.virtual-account.simulate-deposit',
 path:'/customers/{customerID}/virtual_accounts/{virtualAccountID}/simulate_deposit',
 method:'post',kind:'bridge-simulation-result',parameters:[
 parameter('customerID','path',{type:'string',minLength:1},true),
 parameter('virtualAccountID','path',{type:'string',minLength:1},true),
 parameter('Idempotency-Key','header',{type:'string'},true)],
 body:{type:'object',required:['currency','amount'],additionalProperties:false,
 properties:{currency:{type:'string',minLength:1},amount:{type:'string',pattern:'^[0-9]+(?:\\.[0-9]+)?$'}}},
 source:{url:'https://apidocs.bridge.xyz/get-started/introduction/quick-start/setting-up-sandbox',
   provenance:'Literal sandbox virtual-account deposit route and request transcribed from original guide; this guide is not an OpenAPI response contract.'}});
export const NATIVE_ACTIONS=Object.freeze(entries.map(entry=>Object.freeze(entry)));
export function actionContract(action){const value=contracts.get(action);invariant(value,'UNKNOWN_NATIVE_ACTION',{action});return value;}
