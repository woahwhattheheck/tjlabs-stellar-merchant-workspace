import { normalizeCatalogConfiguration, selectCatalog } from './catalogs.mjs';
/**
 * SF-32 - MCP buyer-side discover/preview/approved paid call bridge.
 * MIT. MCP 2025-11-25 JSON-RPC Streamable HTTP (single-response subset) and
 * canonical x402 v2 HTTP and native remote MCP payment calls.
 * No wallet, payer, approval or private key lives in this source.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mcpAgentCommerceTool } from '../../stellar/scf-starforge-20261009/sf43-agent-commerce/mcp-buyer-acceptance.mjs';
import { explainFailure } from '../../stellar/scf-starforge-20261009/sf33-failure-contract/contract.mjs';
import { describeDiscoveredResource } from './descriptor.mjs';
import { prepareHttpQuery } from './query-requirements.mjs';
import { BAZAAR_DISCOVERY_TOOLS, normalizeDiscoveryArguments, discoveryRequestUrl,
  eligibleDiscoveryOptions, discoveryContinuation } from './discovery.mjs';
import { historyPage } from './quote-history.mjs';
import {paymentResponseSummary} from './payment-receipt.mjs';
import {retainPaymentObservation} from './result-store.mjs';
import { normalizeMcpPolicies, prepareMcpInvocation, connectRemoteMcp, extractMcpChallenge,
  requireMcpChallenge, requireMcpPayload, mcpResultContent } from './remote-mcp.mjs';

import { createMcpToolHandler } from './http-tools.mjs';
export { MCP_VERSION } from './http-tools.mjs';
const plain = x => x!==null && typeof x==='object' && !Array.isArray(x);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (code,message)=>{const e=new Error(message);e.code=code;throw e;};
const resourceOrigin = url => {const u=new URL(url);if(u.username||u.password||!['https:','http:'].includes(u.protocol)||u.hash)fail('INVALID_RESOURCE','Invalid resource URL');return u.origin;};
const maxText = (v,max=512)=>typeof v==='string'&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
const strictBytes = (v,max=256*1024)=>{
  if(typeof v!=='string'||v.length>max||!/^[A-Za-z0-9+/]*={0,2}$/.test(v)||v.length%4===1)fail('INVALID_ENCODING','Malformed canonical base64');
  try {return JSON.parse(Buffer.from(v,'base64').toString('utf8'));}catch {fail('INVALID_ENCODING','Bad JSON in base64 header');}
};
const sameTerms=(a,b)=>['scheme','network','asset','amount','payTo'].every(k=>a?.[k]===b?.[k]);
const sanitizedPrice=a=>({scheme:a.scheme,network:a.network,asset:a.asset,amount:a.amount,payTo:a.payTo});
const asBool=r=>r===true;
async function readData(response,max=64*1024,{retainBytes=false}={}){
  const reader=response.body?.getReader();if(!reader)return {body:'',contentType:null,truncated:false};
  const chunks=[];let size=0,truncated=false;
  try {for(;;){const {done,value}=await reader.read();if(done)break;
    if(size+value.byteLength>max){chunks.push(value.subarray(0,Math.max(0,max-size)));size=max;truncated=true;break;}
    chunks.push(value);size+=value.byteLength;
  }}finally{if(truncated)await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=Buffer.concat(chunks),body=bytes.toString('utf8');
  return {body,contentType:response.headers.get('content-type')??null,truncated,...(retainBytes?{bytes}: {})};
}
const statOf=q=>({quoteId:q.quoteId,status:q.status,resource:q.resource,requestUrl:q.url,method:q.method,
  ...(q.discoverySource?{source:structuredClone(q.discoverySource)}:{}),
  ...(q.invocation?{invocation:structuredClone(q.invocation)}:{}),
  selected:sanitizedPrice(q.accepted),acceptedTerms:structuredClone(q.accepted),expiresAt:q.expiresAt,attempts:q.attempts,
  createdAt:q.createdAt,updatedAt:q.updatedAt,phase:q.phase??null,
  signedRequestDispatched:q.signedRequestDispatched===true,
  result:structuredClone(q.result??null),failure:q.failure??null,
  ...(q.status==='INDETERMINATE'?{recovery:explainFailure({stage:'settle',
    response:{success:false,errorReason:q.result?.paymentResponse?.errorReason??'unexpected_settle_error',
      ...(q.result?.paymentResponse?.errorMessage?{errorMessage:q.result.paymentResponse.errorMessage}:{}),
      transaction:q.result?.paymentResponse?.transaction??null,
      network:q.result?.paymentResponse?.network??null},traceId:q.quoteId})}:{})});
const defaultFetch=(...args)=>fetch(...args);
const schemas={
  ...BAZAAR_DISCOVERY_TOOLS,
  bazaar_describe:{
    name:'bazaar_describe',description:'Inspect the cached original input examples, schema, output declaration and full payment alternatives for a discovered handle. No network request, quote, approval or payment.',
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
    inputSchema:{type:'object',properties:{handle:{type:'string'}},required:['handle'],additionalProperties:false}},
  bazaar_preview:{
    name:'bazaar_preview',description:'Validate a discovered HTTP request or remote MCP tool and exact arguments; return price/recipient/approval quote. Makes no provider request.',
    inputSchema:{type:'object',properties:{handle:{type:'string'},acceptIndex:{type:'integer',minimum:0},input:{type:'object'}},required:['handle'],additionalProperties:false}},
  bazaar_execute_approved:{
    name:'bazaar_execute_approved',description:'Attempt the quoted call ONLY when operator approval callback authorizes it; default denies. Never retries a potentially settled signed request.',
    inputSchema:{type:'object',properties:{quoteId:{type:'string'}},required:['quoteId'],additionalProperties:false}},
  bazaar_status:{name:'bazaar_status',description:'Inspect the exact state of a prior quote; no network call.',inputSchema:{type:'object',properties:{quoteId:{type:'string'}},required:['quoteId'],additionalProperties:false}},
  bazaar_spending_status:{name:'bazaar_spending_status',description:'Read this remote MCP quote’s original aggregate budget preview or retained SF36 reservation and finalization. Uses the host-configured ledger.',
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
    inputSchema:{type:'object',properties:{quoteId:{type:'string'}},required:['quoteId'],additionalProperties:false}},
  bazaar_reconcile_payment:{name:'bazaar_reconcile_payment',description:'Read the original transaction through the host-configured Stellar verifier and save its observation on this quote. No approval, signing, submission or purchase retry. Supply transaction only when an older result omitted its original hash.',
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true},
    inputSchema:{type:'object',properties:{quoteId:{type:'string'},transaction:{type:'string',pattern:'^[0-9a-fA-F]{64}$'}},required:['quoteId'],additionalProperties:false}},
  bazaar_history:{name:'bazaar_history',description:'List this operator workspace\'s quote history, including recovered interrupted operations. Read only; never resumes a payment.',annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},inputSchema:{type:'object',properties:{status:{type:'string'},limit:{type:'integer',minimum:1,maximum:100},cursor:{type:'string'}},additionalProperties:false}},
  bazaar_cancel:{name:'bazaar_cancel',description:'Cancel an unexecuted quote. Signed/unknown transactions require external reconciliation.',inputSchema:{type:'object',properties:{quoteId:{type:'string'}},required:['quoteId'],additionalProperties:false}},
  bazaar_results:{name:'bazaar_results',description:'List complete saved MCP results in this quote inbox. Returns file metadata without response bodies or provider calls.',
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
    inputSchema:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:100},cursor:{type:'string'}},additionalProperties:false}},
  bazaar_read_result:{name:'bazaar_read_result',description:'Read a verified byte range from the complete saved native MCP result for this quote. Never purchases or fetches linked resources.',
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
    inputSchema:{type:'object',properties:{quoteId:{type:'string'},byteOffset:{type:'integer',minimum:0},maxBytes:{type:'integer',minimum:1,maximum:65536}},required:['quoteId'],additionalProperties:false}},
  bazaar_recover_result:{name:'bazaar_recover_result',description:'Recover a completed local result and its recorded server completion after an interrupted metadata update or older database snapshot. No seller, signer or ledger call.',
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
    inputSchema:{type:'object',properties:{quoteId:{type:'string'}},required:['quoteId'],additionalProperties:false}},
};
const TOOLS=[...Object.values(schemas),mcpAgentCommerceTool];
if(new Set(TOOLS.map(tool=>tool.name)).size!==TOOLS.length)
  throw new Error('Duplicate MCP tool registration');

/**
 * Ownership of signPayment and approve stays with the embedding operator.
 * The configured discovery base + outbound origin allowlist are NEVER derived
 * from a model-supplied URL. Default approval=false, signer=null, origins=[].
 */
export class McpPaidToolBroker {
  #catalogUrl;#catalogs;#trustedOrigins;#approve;#sign;#fetch;#records=new Map();#quotes=new Map();
  #timeLimit;#quoteTTL;#maxRecords;#agentCommerce;
  #store;#scope;#closing=false;#storeClosed=false;#closePromise;#active=new Set();#shutdown=new AbortController();
  #mcpPolicies;#approvalControllers=new Map();#remoteControllers=new Map();#results;#reconcilePaymentAdapter;#reconciliations=new Map();#spendingStatusAdapter;
  constructor({discoveryUrl,discoveryCatalogs,allowedResourceOrigins=[],approve=()=>false,signPayment=null,
    fetchImpl=defaultFetch,timeoutMs=8000,quoteTTL=10*60*1000,maxRecords=500,
    agentCommerce=null,quoteStore=null,remoteMcpPolicies=[],resultStore=null,reconcilePayment=null,spendingStatus=null}={}){
    this.#catalogs=normalizeCatalogConfiguration({discoveryUrl,discoveryCatalogs});
    this.#catalogUrl=new URL(selectCatalog(this.#catalogs).url);
    this.#trustedOrigins=new Set(allowedResourceOrigins.map(resourceOrigin));
    if(typeof approve!=='function'||typeof fetchImpl!=='function')throw new TypeError('Operator hooks required');
    if(signPayment!==null&&typeof signPayment!=='function')throw new TypeError('Invalid signer callback');
    if(agentCommerce!==null&&typeof agentCommerce!=='function')throw new TypeError('Invalid SF43 agent-commerce adapter');
    if(reconcilePayment!==null&&typeof reconcilePayment!=='function')throw new TypeError('Invalid read-only reconciliation adapter');
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000)throw new TypeError('timeoutMs must be 1..300000');
    this.#approve=approve;this.#sign=signPayment;this.#fetch=fetchImpl;
    if(!Number.isSafeInteger(maxRecords)||maxRecords<1||maxRecords>10000)
      throw new TypeError('maxRecords must be 1..10000');
    this.#timeLimit=timeoutMs;this.#quoteTTL=quoteTTL;this.#maxRecords=maxRecords;
    this.#agentCommerce=agentCommerce;
    this.#reconcilePaymentAdapter=reconcilePayment;
    if(spendingStatus!==null&&typeof spendingStatus!=='function')throw new TypeError('Invalid spending status adapter');
    this.#spendingStatusAdapter=spendingStatus;
    this.#mcpPolicies=normalizeMcpPolicies(remoteMcpPolicies);
    if(quoteStore!==null&&['load','save','close'].some(name=>typeof quoteStore[name]!=='function'))
      throw new TypeError('Quote store must provide load/save/close');
    this.#store=quoteStore;
    if(resultStore!==null&&['prepare','file','read','recover','close'].some(name=>typeof resultStore[name]!=='function'))
      throw new TypeError('Result store must provide the native file lifecycle');
    this.#results=resultStore;
    this.#scope=hash({discoveryUrl:this.#catalogUrl.href,origins:[...this.#trustedOrigins].sort(),
      ...(this.#catalogs.catalogs.length===1 && this.#catalogs.defaultCatalogId==='default' ? {} : {
        discoveryCatalogs:{defaultCatalogId:this.#catalogs.defaultCatalogId,
          catalogs:this.#catalogs.catalogs.map(({id,url})=>({id,url})).sort((a,b)=>a.id.localeCompare(b.id))}}),
      ...(this.#mcpPolicies.length?{remoteMcpPolicies:this.#mcpPolicies}:{})});
    try{for(const saved of this.#store?.load()??[]){
      const q=structuredClone(saved);this.#quotes.set(q.quoteId,q);
      if(['APPROVAL_PENDING','EXECUTING','CANCEL_REQUESTED'].includes(q.status)){
        q.status=q.signedRequestDispatched?'INDETERMINATE':'INTERRUPTED';
        q.failure=q.signedRequestDispatched
          ?'Recovered interrupted signed dispatch; reconcile the original operation before any reattempt'
          :'Recovered interrupted approval or execution before signed dispatch; inspect the original operator reservation';
        this.#persist(q);
      }else if(q.status==='PREVIEWED'&&q.operatorScope!==this.#scope){
        q.status='CONFIG_CHANGED';q.failure='Operator discovery/origin configuration changed; search and review current terms';
        this.#persist(q);
      }else if(q.status==='PREVIEWED'&&Date.now()>q.expiresAt){
        q.status='EXPIRED';this.#persist(q);
      }
    }}catch(error){this.#store?.close();throw error;}
  }
  #running(){if(this.#closing)fail('BROKER_CLOSING','Operator workspace is closing');}
  #persist(q){
    q.updatedAt=Date.now();
    if(!this.#store)return;
    try{this.#store.save(q);}
    catch(error){
      q.status=q.signedRequestDispatched?'INDETERMINATE':'INTERRUPTED';
      q.failure='Quote persistence failed; preserve this workspace and inspect its original operation';
      fail(error?.code??'QUOTE_STORAGE_UNAVAILABLE',q.failure);
    }
  }
  #signal(){return AbortSignal.any([AbortSignal.timeout(this.#timeLimit),this.#shutdown.signal]);}
  // Resource/catalog redirects must never escape the operator-approved origin.
  // In particular, a 3xx must not forward PAYMENT-SIGNATURE to a new host.
  async #get(url){
    const resp=await this.#fetch(url,{method:'GET',headers:{accept:'application/json'},redirect:'error',signal:this.#signal()});
    if(!resp.ok)fail('DISCOVERY_UNAVAILABLE','Bazaar returned HTTP '+resp.status);
    const data=await readData(resp,2*1024*1024,{retainBytes:true});if(data.truncated)fail('DISCOVERY_TOO_LARGE','Bazaar response exceeds configured limit');
    let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data.bytes));}catch{fail('DISCOVERY_INVALID','Invalid Bazaar UTF-8 JSON');}
    if(!plain(value)||!Array.isArray(value.resources)||
      (value.partialResults!==undefined&&typeof value.partialResults!=='boolean')||
      (value.pagination!==undefined&&value.pagination!==null&&!plain(value.pagination)))
      fail('DISCOVERY_INVALID','Invalid Bazaar result');
    return {body:value,bytes:data.bytes};
  }
  catalogs(args={}){
    this.#running();
    if(!plain(args)||Object.keys(args).length)fail('INVALID_PARAMS','Catalog listing takes no arguments');
    return {...structuredClone(this.#catalogs),total:this.#catalogs.catalogs.length};
  }
  async search(args){return this.#discover('search',args);}
  async resources(args={}){return this.#discover('resources',args);}
  async #discover(mode,args){
    this.#running();
    const request=normalizeDiscoveryArguments(mode,args);
    const catalog=selectCatalog(this.#catalogs,request.catalogId);
    const url=discoveryRequestUrl(catalog.url,mode,request);
    const {body,bytes}=await this.#get(url);
    this.#running();
    const observedAt=Date.now(), source={url:url.href,observedAt:new Date(observedAt).toISOString(),
      mode,request:structuredClone(request),catalog:{...catalog},pageSha256:createHash('sha256').update(bytes).digest('hex'),pageBytes:bytes.length};
    const capture={bytes,source};
    const pending=[],listed=[];
    let filtered=0,invalid=0;
    for(let rowIndex=0;rowIndex<body.resources.length;rowIndex++){
      const row=body.resources[rowIndex],input=row?.extensions?.bazaar?.info?.input;
      // Native providers may publish a URL string. Keep that original source
      // while using the same internal resource object for describe and preview.
      const resource=typeof row?.resource==='string'?{url:row.resource}:row?.resource;
      const resourceUrl=resource?.url;
      if(!plain(row)||typeof resourceUrl!=='string'||!plain(input)||
        !['http','mcp'].includes(input.type)||!Array.isArray(row.accepts)||!row.accepts.length){
        invalid++;continue;
      }
      let origin;try{origin=resourceOrigin(resourceUrl);}catch{invalid++;continue;}
      if(!eligibleDiscoveryOptions(row,{}).length){invalid++;continue;}
      const eligible=eligibleDiscoveryOptions(row,request);
      if(!eligible.length){filtered++;continue;}
      if(pending.length>=this.#maxRecords)
        fail('DISCOVERY_TOO_MANY_RESULTS','The complete provider page exceeds the configured resource-handle capacity. Use more selective discovery filters or a larger operator cache.');
      const bazaar=structuredClone(row.extensions.bazaar);
      const info={resource:structuredClone(resource),input:bazaar.info.input,bazaar,accepts:eligible,origin,
        capture,providerAcceptIndexes:eligible.map(option=>row.accepts.indexOf(option)),
        source:{...source,resource:structuredClone(row.resource),rowIndex},
        fingerprint:hash([catalog.id,catalog.url,resourceUrl,input,eligible]),type:input.type,createdAt:observedAt};
      const handle=randomUUID();pending.push([handle,info]);
      listed.push({handle,catalogId:catalog.id,resource:structuredClone(resource),resourceType:input.type,
        method:input.method??null,toolName:input.toolName??null,
        accepts:eligible.map(sanitizedPrice),allowedOrigin:this.#trustedOrigins.has(origin)});
    }
    const continuation=discoveryContinuation(mode,request,body,body.resources.length);
    if(continuation.continuation && (request.catalogId!==undefined ||
        catalog.id!=='default' || this.#catalogs.catalogs.length>1))
      continuation.continuation.arguments.catalogId=catalog.id;
    // Retain the whole selected page together, then retire only older handles.
    for(const [handle,info] of pending)this.#records.set(handle,info);
    // Keep complete provider pages within the same ephemeral resource cache.
    // Every handle from a page shares one byte buffer.
    const pages=new Map();let retainedBytes=0;
    for(const row of this.#records.values()){
      const page=row.capture;if(!page)continue;
      if(!pages.has(page)){pages.set(page,0);retainedBytes+=page.bytes.length;}
      pages.set(page,pages.get(page)+1);
    }
    while(this.#records.size>this.#maxRecords||retainedBytes>16*1024*1024){
      const key=this.#records.keys().next().value,row=this.#records.get(key);
      this.#records.delete(key);
      if(row.capture){
        const remaining=pages.get(row.capture)-1;pages.set(row.capture,remaining);
        if(!remaining)retainedBytes-=row.capture.bytes.length;
      }
    }
    return {resources:listed,partialResults:body.partialResults??false,
      pagination:structuredClone(body.pagination??null),source:structuredClone(source),
      page:{received:body.resources.length,returned:listed.length,filtered,invalid,
        continuationError:continuation.continuationError},
      continuation:continuation.continuation};
  }
  #resolveDiscoverySelection(handle,acceptIndex=0){
    this.#running();
    const row=this.#records.get(handle);
    if(!row||Date.now()-row.createdAt>this.#quoteTTL)
      fail('RESOURCE_STALE','Discover this resource again before preparing a new request');
    if(!this.#trustedOrigins.has(row.origin))fail('ORIGIN_UNAPPROVED','Operator has not approved this exact resource origin');
    if(row.type!=='http')fail('MCP_NATIVE_HTTP_REQUIRED','The native HTTP workspace requires an HTTP resource');
    if(!Number.isSafeInteger(acceptIndex)||acceptIndex<0||acceptIndex>=row.accepts.length)
      fail('INVALID_PARAMS','Invalid accepted payment option');
    if(!row.capture)fail('RESOURCE_STALE','Discover this resource again to retain its complete provider page');
    return {
      handle,eligibleAcceptIndex:acceptIndex,
      source:structuredClone(row.capture.source),raw:Uint8Array.from(row.capture.bytes),
      rowIndex:row.source.rowIndex,acceptIndex:row.providerAcceptIndexes[acceptIndex],
    };
  }
  describe({handle}={}){
    const row=this.#records.get(handle);
    if(!row||Date.now()-row.createdAt>this.#quoteTTL)fail('RESOURCE_STALE','Search this resource again');
    return describeDiscoveredResource(row,{handle,allowedOrigin:this.#trustedOrigins.has(row.origin),
      expiresAt:row.createdAt+this.#quoteTTL,remoteMcpPolicies:this.#mcpPolicies});
  }
  preview({handle,acceptIndex=0,input={}}={}){
    this.#running();
    const row=this.#records.get(handle);
    if(!row||Date.now()-row.createdAt>this.#quoteTTL)fail('RESOURCE_STALE','Search this resource again');
    if(!this.#trustedOrigins.has(row.origin))fail('ORIGIN_UNAPPROVED','Operator has not approved this exact resource origin');
    if(!Number.isSafeInteger(acceptIndex)||acceptIndex<0||acceptIndex>=row.accepts.length)fail('INVALID_PARAMS','Invalid accepted payment option');
    let method,u,invocation;
    if(row.type==='mcp'){
      invocation=prepareMcpInvocation(row,input,this.#mcpPolicies);
      method='tools/call';u=new URL(invocation.endpoint);
    }else{
      method=row.input.method;
      // Probing non-idempotent operations before payment could perform work twice.
      if(!['GET','HEAD'].includes(method))fail('UNSAFE_PROBE','Only safely probeable GET/HEAD paid routes can execute in this adapter');
      u=prepareHttpQuery(row,input);
      if(resourceOrigin(u.href)!==row.origin||!this.#trustedOrigins.has(u.origin))
        fail('ORIGIN_UNAPPROVED','Discovered resource origin changed; search again');
    }
    const accepted=row.accepts[acceptIndex];
    if(!['exact','upto'].includes(accepted?.scheme)||!['stellar:testnet','stellar:pubnet'].includes(accepted?.network)||
      !/^(0|[1-9]\d*)$/.test(accepted?.amount??'')||
      ![accepted.payTo,accepted.asset].every(x=>typeof x==='string'&&x.length>0))fail('INVALID_PAYMENT_TERMS','Unsupported or invalid Stellar payment option');
    const quoteId=randomUUID();const q={quoteId,resource:row.resource.url,method,url:u.toString(),accepted:structuredClone(accepted),
      discoverySource:{...structuredClone(row.capture.source),rowIndex:row.source.rowIndex},
      ...(invocation?{invocation}:{}),
      status:'PREVIEWED',fingerprint:row.fingerprint,expiresAt:Date.now()+this.#quoteTTL,attempts:0,
      signedRequestDispatched:false,createdAt:Date.now(),operatorScope:this.#scope,phase:'PREVIEW'};
    this.#persist(q);
    this.#quotes.set(quoteId,q);
    if(!this.#store)while(this.#quotes.size>Math.max(500,this.#maxRecords*4))this.#quotes.delete(this.#quotes.keys().next().value);
    return {...statOf(q),warning:'No payment has been made. An independent operator approval and signer are required to execute.'};
  }
  status({quoteId}={}){const q=this.#quotes.get(quoteId);if(!q)fail('QUOTE_UNKNOWN','Unknown quote');return statOf(q);}
  history(args={}){return {...historyPage(this.#quotes.values(),args,statOf),durable:this.#store!==null};}
  results(args={}){
    const page=historyPage([...this.#quotes.values()].filter(q=>q.result?.responseFile?.status==='SAVED'),args,q=>({
      quoteId:q.quoteId,status:q.status,createdAt:q.createdAt,requestUrl:q.url,
      toolName:q.invocation?.toolName??null,paymentResponse:structuredClone(q.result.paymentResponse??null),
      responseFile:structuredClone(q.result.responseFile)}));
    return {results:page.quotes,total:page.total,nextCursor:page.nextCursor,durable:this.#store!==null};
  }
  async readResult({quoteId,byteOffset,maxBytes}={}){
    this.#running();
    const q=this.#quotes.get(quoteId);if(!q)fail('QUOTE_UNKNOWN','Unknown quote');
    if(!this.#results)fail('MCP_RESULT_STORAGE_NOT_CONFIGURED','Use a durable result workspace');
    return this.#results.read(q,{byteOffset,maxBytes});
  }
  async recoverResult({quoteId}={}){
    this.#running();
    const q=this.#quotes.get(quoteId);if(!q)fail('QUOTE_UNKNOWN','Unknown quote');
    if(!this.#results)fail('MCP_RESULT_STORAGE_NOT_CONFIGURED','Use a durable result workspace');
    if(['APPROVAL_PENDING','EXECUTING','CANCEL_REQUESTED'].includes(q.status))fail('MCP_RESULT_NOT_READY','The original operation is still active');
    const recovered=await this.#results.recover(q);this.#running();
    retainPaymentObservation(recovered,q);
    recovered.updatedAt=Date.now();
    this.#store?.save(recovered);
    Object.assign(q,recovered);return statOf(q);
  }
  async spendingStatus({quoteId}={}){
    this.#running();
    const q=this.#quotes.get(quoteId);if(!q)fail('QUOTE_UNKNOWN','Unknown quote');
    if(!q.invocation)fail('MCP_SPENDING_REMOTE_QUOTE_REQUIRED','Select a remote MCP quote.');
    if(!this.#spendingStatusAdapter)fail('MCP_SPENDING_NOT_CONFIGURED','Connect the native governed MCP operator.');
    const operation=Promise.resolve().then(async()=>{
      this.#running();
      const report=await this.#spendingStatusAdapter(quoteId,{
        quote:{quoteId,requestUrl:q.url,method:q.method,
          invocation:structuredClone(q.invocation),accepted:structuredClone(q.accepted)},
        signal:AbortSignal.any([this.#shutdown.signal,AbortSignal.timeout(Math.max(30000,this.#timeLimit))])});
      if(!plain(report)||report.schema!=='stellar-forge.mcp-spending.v1'||
          report.request_id!==quoteId||Buffer.byteLength(JSON.stringify(report))>65536)
        fail('MCP_SPENDING_RESULT_MISMATCH','The ledger response does not match this quote.');
      this.#running();return structuredClone(report);
    });
    this.#active.add(operation);
    try{return await operation;}finally{this.#active.delete(operation);}
  }
  async reconcilePayment({quoteId,transaction}={}){
    this.#running();
    const q=this.#quotes.get(quoteId);if(!q)fail('QUOTE_UNKNOWN','Unknown quote');
    if(!this.#reconcilePaymentAdapter)fail('MCP_RECONCILE_NOT_CONFIGURED','Connect the host read-only Stellar reconciliation adapter');
    if(!q.signedRequestDispatched||['APPROVAL_PENDING','EXECUTING','CANCEL_REQUESTED'].includes(q.status))
      fail('MCP_RECONCILE_NOT_READY','Inspect an original completed or interrupted signed dispatch');
    const reported=q.result?.paymentResponse?.transaction;
    if(transaction!==undefined&&(typeof transaction!=='string'||!/^[0-9a-f]{64}$/i.test(transaction)))
      fail('MCP_RECONCILE_TRANSACTION_INVALID','Use the original 64-character transaction hash');
    const reportedHash=typeof reported==='string'&&/^[0-9a-f]{64}$/i.test(reported)?reported.toLowerCase():null;
    if(reportedHash&&transaction!==undefined&&reportedHash!==transaction.toLowerCase())
      fail('MCP_RECONCILE_TRANSACTION_MISMATCH','The supplied transaction differs from the retained receipt');
    const selected=reportedHash??transaction?.toLowerCase();
    if(!selected)fail('MCP_RECONCILE_TRANSACTION_REQUIRED','This older result omitted its transaction hash; supply the original transaction reference');
    const existing=this.#reconciliations.get(quoteId);
    if(existing){
      if(existing.transaction!==selected)fail('MCP_RECONCILE_ACTIVE','A different transaction lookup for this quote is active');
      return existing.operation;
    }
    const operation=Promise.resolve().then(async()=>{
      this.#running();
      const receipt=structuredClone(q.result?.paymentResponse??null);
      const observation=await this.#reconcilePaymentAdapter(Object.freeze({quoteId,
        accepted:structuredClone(q.accepted),paymentResponse:receipt,
        ...(reportedHash?{}:{transaction:selected}),
        signal:AbortSignal.any([this.#shutdown.signal,AbortSignal.timeout(Math.max(30000,this.#timeLimit))])}));
      if(!plain(observation)||observation.schema!=='stellar-forge.sf86.payment-attempt.v1'||
          observation.intentId!==quoteId||observation.transaction!==selected||
          observation.network!==q.accepted.network||observation.asset!==q.accepted.asset||
          observation.recipient!==q.accepted.payTo||observation.atomicAmount!==q.accepted.amount||
          !['FAILED','NOT_FOUND','TRANSFER_MATCHED'].includes(observation.outcome)||
          Buffer.byteLength(JSON.stringify(observation))>65536)
        fail('MCP_RECONCILE_RESULT_MISMATCH','The observation does not match this original quote');
      this.#running();
      const report={...structuredClone(observation),checkedAt:new Date().toISOString()};
      const currentHash=q.result?.paymentResponse?.transaction;
      if(currentHash&&String(currentHash).toLowerCase()!==selected)
        return {...statOf(q),transactionObservation:{...report,saved:false,
          saveError:'MCP_RECONCILE_ORIGINAL_TRANSACTION_CHANGED'}};
      const candidate={...structuredClone(q),updatedAt:Date.now(),
        result:{...structuredClone(q.result??{}),reconciliation:report}};
      // This observation is separate from the original result/status, signer
      // reservation and authorization history. It cannot resume execution.
      // A read-only observation cannot downgrade a confirmed payment when its
      // local save fails. Return the usable observation without altering q.
      try{this.#store?.save(candidate);}
      catch(error){return {...statOf(q),transactionObservation:{...report,saved:false,
        saveError:String(error?.code??'MCP_RECONCILE_SAVE_FAILED')}};}
      Object.assign(q,candidate);return statOf(q);
    });
    this.#reconciliations.set(quoteId,{transaction:selected,operation});this.#active.add(operation);
    try{return await operation;}
    finally{this.#reconciliations.delete(quoteId);this.#active.delete(operation);}
  }
  cancel({quoteId}={}){
    const q=this.#quotes.get(quoteId);if(!q)fail('QUOTE_UNKNOWN','Unknown quote');
    if(q.status==='PREVIEWED'||q.status==='APPROVAL_PENDING'){
      q.status='CANCELLED';
      // End this quote's host prompt even when its cancellation cannot persist.
      try{this.#persist(q);}finally{this.#approvalControllers.get(quoteId)?.abort();}
      return statOf(q);
    }
    if(q.status==='EXECUTING'){
      q.status=q.signedRequestDispatched?'INDETERMINATE':'CANCEL_REQUESTED';
      q.failure=q.signedRequestDispatched?'Signed call may have reached merchant; reconcile before any reattempt':null;
      this.#persist(q);this.#remoteControllers.get(quoteId)?.abort();return statOf(q);
    }
    return statOf(q);
  }
  async execute({quoteId}={}){
    this.#running();
    const operation=this.#execute(quoteId);this.#active.add(operation);
    try{return await operation;}finally{this.#active.delete(operation);}
  }
  async #execute(quoteId){
    const q=this.#quotes.get(quoteId);if(!q)fail('QUOTE_UNKNOWN','Unknown quote');
    if(q.status!=='PREVIEWED')return statOf(q); // replay never dispatches a second request
    if(Date.now()>q.expiresAt){q.status='EXPIRED';this.#persist(q);return statOf(q);}
    if(q.operatorScope!==this.#scope||!this.#trustedOrigins.has(resourceOrigin(q.url))){
      q.status='CONFIG_CHANGED';q.failure='Operator configuration no longer allows this quote';this.#persist(q);return statOf(q);
    }
    if(!this.#sign)fail('SIGNER_NOT_CONNECTED','Operator has not connected an x402 v2 signer');
    // Approval is an out-of-model trusted callback; "approved":true tool args never count.
    // Reserve the quote synchronously before the first await: concurrent MCP
    // calls must not independently authorize/sign/dispatch the same payment.
    q.status='APPROVAL_PENDING';q.phase='APPROVAL';this.#persist(q);
    const approvalController=new AbortController();
    this.#approvalControllers.set(quoteId,approvalController);
    let permission;
    try {
      permission=await this.#approve(Object.freeze({quoteId:q.quoteId,resource:q.resource,requestUrl:q.url,method:q.method,
        accepted:structuredClone(q.accepted),...(q.discoverySource?{source:structuredClone(q.discoverySource)}:{}),
        ...(q.invocation?{invocation:structuredClone(q.invocation)}:{}),
        signal:AbortSignal.any([this.#shutdown.signal,approvalController.signal])}));
    }catch(e){
      if(this.#closing||q.status!=='APPROVAL_PENDING')return statOf(q);
      q.status='PREVIEWED'; // approval errors retain the original retry semantics
      this.#persist(q);
      throw e;
    }finally{
      this.#approvalControllers.delete(quoteId);approvalController.abort();
    }
    // Cancellation/expiration during asynchronous human approval must win.
    if(this.#closing||q.status!=='APPROVAL_PENDING')return statOf(q);
    if(Date.now()>q.expiresAt){q.status='EXPIRED';this.#persist(q);return statOf(q);}
    if(!asBool(permission)){
      q.status='PREVIEWED'; // a denial does not authorize or consume payment
      this.#persist(q);
      fail('APPROVAL_REQUIRED','Operator independently denied or has not authorized payment');
    }
    q.status='EXECUTING';q.phase='PROBE';q.attempts++;this.#persist(q);
    try {
      if(q.invocation)return await this.#executeMcp(q);
      const first=await this.#fetch(q.url,{method:q.method,headers:{accept:'application/json'},redirect:'error',signal:this.#signal()});
      if(q.status==='CANCEL_REQUESTED'){q.status='CANCELLED';if(!this.#storeClosed)this.#persist(q);return statOf(q);}
      if(this.#closing||q.status!=='EXECUTING')return statOf(q);
      if(first.status!==402){
        q.status=first.ok?'FREE_SUCCESS':'PROBE_REJECTED';
        q.result={httpStatus:first.status,paid:false,content:first.ok?await readData(first):null};this.#persist(q);return statOf(q);
      }
      const header=first.headers.get('payment-required');
      const required=strictBytes(header);
      // The catalog URL is provenance; payment binds to the concrete previewed request.
      if(required?.x402Version!==2||required?.resource?.url!==q.url||!Array.isArray(required.accepts)||
        !required.accepts.some(a=>sameTerms(a,q.accepted)))fail('CHALLENGE_MISMATCH','402 payment terms differ from quoted catalog');
      if(q.status==='CANCEL_REQUESTED'){q.status='CANCELLED';if(!this.#storeClosed)this.#persist(q);return statOf(q);}
      this.#running();
      q.phase='SIGNING';this.#persist(q);
      const payload=await this.#sign(Object.freeze({quoteId,resource:structuredClone(required.resource),
        accepted:structuredClone(q.accepted),paymentRequired:structuredClone(required),signal:this.#shutdown.signal}));
      if(q.status==='CANCEL_REQUESTED'){q.status='CANCELLED';if(!this.#storeClosed)this.#persist(q);return statOf(q);}
      if(this.#closing||q.status!=='EXECUTING')return statOf(q);
      if(payload?.x402Version!==2||payload?.resource?.url!==q.url||!sameTerms(payload?.accepted,q.accepted)||
        !plain(payload?.payload))fail('SIGNER_INVALID','Signer returned mismatched x402 v2 payload');
      this.#running();
      q.signedRequestDispatched=true;q.phase='SIGNED_DISPATCH';this.#persist(q);
      const second=await this.#fetch(q.url,{method:q.method,headers:{accept:'application/json','PAYMENT-SIGNATURE':Buffer.from(JSON.stringify(payload)).toString('base64')},redirect:'error',signal:this.#signal()});
      if(this.#closing||q.status!=='EXECUTING')return statOf(q);
      const responseHeader=second.headers.get('payment-response');
      let receipt=null;if(responseHeader){try{receipt=strictBytes(responseHeader);}catch{receipt=null;}}
      const content=second.ok?await readData(second):null;
      if(this.#closing||q.status!=='EXECUTING')return statOf(q);
      q.result={httpStatus:second.status,paidAttempted:true,content,paymentResponse:paymentResponseSummary(receipt)};
      // A server success header without the quoted Stellar network and a
      // valid transaction hash is not even a coherent x402 settlement claim.
      const receiptMatchesQuote=receipt?.success===true&&
        receipt.network===q.accepted.network&&
        typeof receipt.transaction==='string'&&/^[0-9a-f]{64}$/i.test(receipt.transaction);
      q.status=second.ok&&receiptMatchesQuote?'CONFIRMED_BY_SERVER':'INDETERMINATE';
      if(q.status==='INDETERMINATE')q.failure='Signed request dispatched; obtain provider reconciliation before any reattempt';
      q.phase='RESULT';this.#persist(q);
      return statOf(q);
    }catch(e){
      if(this.#storeClosed)return statOf(q);
      if(['INTERRUPTED','INDETERMINATE','CANCELLED'].includes(q.status))return statOf(q);
      q.status=q.signedRequestDispatched?'INDETERMINATE':this.#closing||q.status==='CANCEL_REQUESTED'?'CANCELLED':'REJECTED';
      q.failure=q.signedRequestDispatched?'Signed request outcome uncertain; do not retry automatically':q.status==='CANCELLED'?null:String(e.code||'PROVIDER_ERROR');
      this.#persist(q);
      return statOf(q);
    }
  }
  #mcpStopped(q){
    if(q.status==='CANCEL_REQUESTED'){
      q.status='CANCELLED';if(!this.#storeClosed)this.#persist(q);return true;
    }
    return this.#closing||q.status!=='EXECUTING';
  }
  async #executeMcp(q){
    const controller=new AbortController();this.#remoteControllers.set(q.quoteId,controller);
    const signal=AbortSignal.any([controller.signal,this.#shutdown.signal]);
    let remote,capture,captured=false;
    try{
      if(this.#results){
        capture=await this.#results.prepare(q);
        q.result={protocol:'mcp',responseFile:capture.reservation};q.phase='RESULT_RESERVED';this.#persist(q);
      }
      q.phase='MCP_CONNECT';this.#persist(q);
      remote=await connectRemoteMcp({invocation:q.invocation,fetchImpl:this.#fetch,signal,timeoutMs:this.#timeLimit});
      if(this.#mcpStopped(q))return statOf(q);
      q.phase='PROBE';this.#persist(q);
      const first=await remote.call();
      if(this.#mcpStopped(q))return statOf(q);
      const required=extractMcpChallenge(first);
      if(!required){
        const result=await this.#retainMcpResult(q,first,remote,capture,false);captured=true;return result;
      }
      requireMcpChallenge(required,q.invocation,q.accepted);
      q.phase='SIGNING';this.#persist(q);
      const payload=await this.#sign(Object.freeze({quoteId:q.quoteId,resource:structuredClone(required.resource),
        requestUrl:q.url,method:q.method,invocation:structuredClone(q.invocation),
        accepted:structuredClone(q.accepted),paymentRequired:structuredClone(required),signal}));
      if(this.#mcpStopped(q))return statOf(q);
      requireMcpPayload(payload,required,q.accepted);
      q.signedRequestDispatched=true;q.phase='SIGNED_DISPATCH';this.#persist(q);
      const second=await remote.call(payload);
      if(this.#storeClosed)return statOf(q);
      const result=await this.#retainMcpResult(q,second,remote,capture,true);captured=true;return result;
    }finally{
      try{
        if(capture&&!captured){
          await capture.abort().catch(()=>{});
          if(q.result?.responseFile?.status==='RESERVED'){
            q.result.responseFile={...capture.reservation,status:q.result.content?'NOT_SAVED':'NOT_RECEIVED'};
            if(!this.#storeClosed)this.#persist(q);
          }
        }
      }finally{
        await remote?.close().catch(()=>{});
        controller.abort();this.#remoteControllers.delete(q.quoteId);
      }
    }
  }
  async #retainMcpResult(q,result,remote,capture,paidAttempted){
    const receipt=paidAttempted?result?._meta?.['x402/payment-response']:null;
    q.result={protocol:'mcp',...(paidAttempted?{paidAttempted:true}:{paid:false}),peer:remote.peer,
      content:mcpResultContent(result),...(capture?{responseFile:capture.reservation}:{}),
      ...(paidAttempted?{paymentResponse:paymentResponseSummary(receipt)}:{})};
    // Retain any actual late result after cancellation without silently changing
    // the original uncertain payment state.
    if(q.status==='EXECUTING'){
      const matches=receipt?.success===true&&receipt.network===q.accepted.network&&
        typeof receipt.transaction==='string'&&/^[0-9a-f]{64}$/i.test(receipt.transaction);
      q.status=paidAttempted?(result.isError!==true&&matches?'CONFIRMED_BY_SERVER':'INDETERMINATE'):
        result.isError===true?'PROBE_REJECTED':'FREE_SUCCESS';
    }
    if(paidAttempted&&q.status==='INDETERMINATE')q.failure='Signed MCP call dispatched; reconcile the original payment before any reattempt';
    q.phase='RESULT';q.updatedAt=Date.now();
    if(capture){
      // The received result is local work. Retain it and its completion manifest
      // before the final SQLite update, including during the shutdown grace.
      // The result store owns its writer timeout and final close cancellation.
      try{q.result.responseFile=await capture.save(result);}
      catch(error){q.result.responseFile={...capture.reservation,status:'SAVE_FAILED',
        error:error.code??'MCP_RESULT_SAVE_FAILED',bytes:error.bytes??0,partialPath:error.partialPath??null};}
    }
    if(!this.#storeClosed)this.#persist(q);
    return statOf(q);
  }
  close({graceMs=5000}={}){
    if(this.#closePromise)return this.#closePromise;
    if(!Number.isSafeInteger(graceMs)||graceMs<0||graceMs>60000)throw new RangeError('Invalid close grace');
    this.#closing=true;
    this.#closePromise=(async()=>{
      let timer,firstFailure;
      try{
        for(const q of this.#quotes.values())if(['APPROVAL_PENDING','EXECUTING'].includes(q.status)){
          try{this.cancel({quoteId:q.quoteId});}catch(error){firstFailure??=error;}
        }
        this.#shutdown.abort();
        await Promise.race([Promise.allSettled([...this.#active]),new Promise(resolve=>{timer=setTimeout(resolve,graceMs);})]);
      }finally{
        clearTimeout(timer);this.#shutdown.abort();this.#storeClosed=true;
        try{await this.#results?.close();}finally{this.#store?.close();}
      }
      if(firstFailure)throw firstFailure;
    })();
    return this.#closePromise;
  }
  async call(name,args={}){
    switch(name){
      case 'bazaar_search':return this.search(args);
      case 'bazaar_resources':return this.resources(args);
      case 'bazaar_describe':return this.describe(args);
      case 'bazaar_preview':return this.preview(args);
      case 'bazaar_catalogs':return this.catalogs(args);
      case 'bazaar_execute_approved':return this.execute(args);
      case 'bazaar_status':return this.status(args);
      case 'bazaar_history':return this.history(args);
      case 'bazaar_cancel':return this.cancel(args);
      case 'bazaar_results':return this.results(args);
      case 'bazaar_read_result':return this.readResult(args);
      case 'bazaar_recover_result':return this.recoverResult(args);
      case 'bazaar_reconcile_payment':return this.reconcilePayment(args);
      case 'bazaar_spending_status':return this.spendingStatus(args);
      case 'sf43_discover_review_and_pay':{
        this.#running();
        if(!this.#agentCommerce)fail('AGENT_COMMERCE_UNAVAILABLE','SF43 requires an explicitly injected approved adapter');
        const operation=Promise.resolve().then(()=>{this.#running();return this.#agentCommerce(structuredClone(args),{signal:this.#shutdown.signal,
          resolveDiscoverySelection:(handle,acceptIndex)=>this.#resolveDiscoverySelection(handle,acceptIndex)});});
        this.#active.add(operation);
        try{return await operation;}finally{this.#active.delete(operation);}
      }
      default:fail('TOOL_NOT_FOUND','Unknown tool '+String(name));
    }
  }
}

/** Original buyer broker entrypoint; merchant tools reuse this same HTTP transport. */
export function createMcpHttpHandler(broker,options={}){
  if(!(broker instanceof McpPaidToolBroker))throw new TypeError('Broker required');
  return createMcpToolHandler({tools:TOOLS,call:(name,args)=>broker.call(name,args)},options);
}
