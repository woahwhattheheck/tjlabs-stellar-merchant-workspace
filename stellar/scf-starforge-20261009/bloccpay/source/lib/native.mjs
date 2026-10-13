import {randomUUID} from 'node:crypto';
import {invariant,sha256,canonicalJSON} from './source-json.mjs';
import {validateSchema} from './schema.mjs';
import {NATIVE_ACTIONS,actionContract,resolveReference} from './catalogue.mjs';
export {NATIVE_ACTIONS} from './catalogue.mjs';
export {executeProvider} from './transport.mjs';
export {projectResource,reconcileVersions} from './resources.mjs';
export {verifyWebhook} from './webhooks.mjs';
export {validateOperation} from './validation.mjs';
const clone=value=>JSON.parse(JSON.stringify(value));
const plain=value=>value && typeof value==='object'&&!Array.isArray(value);
const scalar=value=>typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value);
const BRIDGE={production:'https://api.bridge.xyz/v0',sandbox:'https://api.sandbox.bridge.xyz/v0'};
function baseURL(config) {
 invariant(['sdp','horizon','bridge'].includes(config?.provider),'PROVIDER_UNSUPPORTED');
 invariant(['production','sandbox'].includes(config.environment),'PROVIDER_ENVIRONMENT_REQUIRED');
 invariant(typeof config.baseUrl==='string'&&config.baseUrl.length,'PROVIDER_BASE_URL_REQUIRED');
 const url=new URL(config.baseUrl),loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 invariant(url.protocol==='https:'||url.protocol==='http:'&&loopback,'PROVIDER_HTTPS_REQUIRED');
 invariant(!url.username&&!url.password&&!url.hash&&!url.search,'PROVIDER_BASE_URL_INVALID');
 url.pathname=url.pathname.replace(/\/+$/,'')||'/';
 if(config.provider==='bridge')invariant(url.href.replace(/\/$/,'')===BRIDGE[config.environment],'BRIDGE_ORIGIN_REQUIRED');
 return url;
}
export function describeConnection(config) {
 const base=baseURL(config),baseUrl=base.href.replace(/\/$/,'');
 const descriptor={provider:config.provider,environment:config.environment,baseUrl,
   tenant:config.tenantName??null,sourceWalletId:config.sourceWalletId??null,
   customerId:config.customerId??null,developerId:config.developerId??null,
   network:config.networkPassphrase??null,networkPassphrase:config.networkPassphrase??null,
   actorLabel:config.actorId??null,
   credentialBinding:config.provider==='horizon'?null:sha256(Buffer.from('bloccpay-provider-binding\0'+config.provider+'\0'+(config.token??config.apiKey??'')))};
 if(config.provider==='sdp')invariant(typeof descriptor.tenant==='string'&&descriptor.tenant.length&&
   typeof descriptor.sourceWalletId==='string'&&descriptor.sourceWalletId.length,'SDP_TENANT_SOURCE_WALLET_REQUIRED');
 if(config.provider==='horizon')invariant(typeof descriptor.network==='string'&&descriptor.network.length,'HORIZON_NETWORK_REQUIRED');
 // Actor labels are configuration, not an assertion about the authenticated provider principal.
 descriptor.sourceScope=sha256(Buffer.from(canonicalJSON({...descriptor,actorLabel:null,
   customerId:null,credentialBinding:config.provider==='bridge'&&!descriptor.developerId?descriptor.credentialBinding:null})));
 descriptor.providerScope=descriptor.sourceScope;
 return descriptor;
}
function requestInput(original,contract) {
 invariant(plain(original),'OPERATION_INPUT_REQUIRED');
 invariant(Object.keys(original).every(k=>['params','query','body','file'].includes(k)),'OPERATION_INPUT_UNKNOWN_FIELD');
 const input=clone(original);
 input.params??={};input.query??={};
 invariant(plain(input.params)&&plain(input.query),'OPERATION_PARAMETER_OBJECT');
 const {entry,operation,spec}=contract;
 if(entry.pagination==='sdp'){input.query.page??=1;input.query.page_limit??=100;}
 if(entry.pagination==='bridge')input.query.limit??=100;
 if(entry.pagination==='horizon'){
  input.query.limit??=100;input.query.order??='asc';input.query.include_failed??=true;
  if(operation.parameters.some(p=>p.name==='join'))input.query.join??='transactions';
 }
 for(const [kind,location]of [['params','path'],['query','query']]){
  const selected=input[kind],parameters=operation.parameters.filter(p=>p.in===location);
  for(const name of Object.keys(selected))invariant(parameters.some(p=>p.name===name),'OPERATION_PARAMETER_UNKNOWN',{kind,name});
  for(const parameter of parameters){
   const present=Object.hasOwn(selected,parameter.name);
   invariant(present||!parameter.required,'OPERATION_PARAMETER_REQUIRED',{kind,name:parameter.name});
   if(present)validateSchema(selected[parameter.name],parameter.schema,spec,kind+'.'+parameter.name);
  }
 }
 if(entry.pagination==='sdp')invariant(Number.isSafeInteger(input.query.page)&&input.query.page>=1&&
   Number.isSafeInteger(input.query.page_limit)&&input.query.page_limit>=1&&input.query.page_limit<=100,'SDP_PAGE_RANGE');
 if(entry.provider==='bridge'){
  invariant(!(input.query.starting_after&&input.query.ending_before),'BRIDGE_CURSOR_EXCLUSIVE');
  if(input.query.updated_after_ms!==undefined&&input.query.updated_before_ms!==undefined)
   invariant(input.query.updated_after_ms<input.query.updated_before_ms,'BRIDGE_UPDATED_TIME_RANGE');
 }
 const multipart=entry.id==='sdp.disbursement.instructions.upload';
 if(multipart){
  invariant(input.body===undefined&&plain(input.file),'SDP_ORIGINAL_CSV_FILE_REQUIRED');
 }else{
  invariant(input.file===undefined,'FILE_UNSUPPORTED_FOR_OPERATION');
  invariant(input.body!==undefined||!operation.requestBody?.required,'OPERATION_BODY_REQUIRED');
  if(input.body!==undefined){
   invariant(plain(input.body),'OPERATION_BODY_OBJECT_REQUIRED');
   const content=operation.requestBody?.content;
   const schema=(content?.['application/json']??content?.['*/*'])?.schema;
   invariant(schema,'OPERATION_JSON_BODY_UNSUPPORTED');
   validateSchema(input.body,schema,spec,'body');
  }
 }
 return input;
}
function appendQuery(url,query,parameters) {
 for(const [key,value]of Object.entries(query)){
  if(value===null||value===undefined)continue;
  const parameter=parameters.find(p=>p.in==='query'&&p.name===key);
  if(Array.isArray(value)){
   invariant(value.every(scalar),'QUERY_ARRAY_SCALARS_REQUIRED');
   if(parameter?.explode===false)url.searchParams.set(key,value.join(','));
   else for(const item of value)url.searchParams.append(key,String(item));
  }else {invariant(scalar(value),'QUERY_SCALAR_REQUIRED',{key});url.searchParams.set(key,String(value));}
 }
}
function readbackFor(entry,input) {
 const id=input.params.id;
 if(entry.id==='sdp.distribution-wallet.get'&&id)return{
   action:'sdp.distribution-wallet.get',input:{params:{id}},resourceKind:'sdp-distribution-wallet',resourceId:id};
 if(entry.id.startsWith('sdp.disbursement.')&&id)return{
   action:'sdp.disbursement.get',input:{params:{id}},resourceKind:'sdp-disbursement',resourceId:id};
 if(entry.id==='sdp.payment.status')return{
   action:'sdp.payment.get',input:{params:{id}},resourceKind:'sdp-payment',resourceId:id};
 if(entry.id==='bridge.virtual-account.simulate-deposit')return{
   action:'bridge.virtual-account.history',input:{params:clone(input.params)},resourceKind:'bridge-virtual-account-event',resourceId:null};
 return null;
}
export function buildRequest(config,action,original={}) {
 const descriptor=describeConnection(config),contract=actionContract(action),{entry,operation}=contract;
 invariant(entry.provider===descriptor.provider,'ACTION_PROVIDER_MISMATCH');
 const input=requestInput(original,contract),headers={Accept:entry.responseFormat==='csv'?'text/csv':'application/json'};
 if(action==='bridge.virtual-account.simulate-deposit')invariant(descriptor.environment==='sandbox','SANDBOX_ONLY_ACTION');
 let path=entry.path.replace(/\{([^}]+)\}/g,(_,key)=>{
  const value=input.params[key];invariant(typeof value==='string'&&value.length&&value!=='.'&&value!=='..'&&!/[\0\/\\]/.test(value),'UNSAFE_PROVIDER_PATH_ID',{key});
  return encodeURIComponent(value);
 });
 const base=baseURL(config),url=new URL(base.href);url.pathname=base.pathname.replace(/\/$/,'')+path;
 appendQuery(url,input.query,operation.parameters);
 if(entry.provider==='sdp'){
  headers['SDP-Tenant-Name']=descriptor.tenant;headers['X-Wallet-Id']=descriptor.sourceWalletId;
 }
 if(entry.provider==='bridge'&&entry.method==='POST')headers['Idempotency-Key']=randomUUID();
 let body=null;
 if(action==='sdp.disbursement.instructions.upload'){
  const file=input.file;
  invariant(typeof file.filename==='string'&&file.filename.length<=255&&!/[\r\n\0"\/\\]/.test(file.filename),'ORIGINAL_FILE_NAME_INVALID');
  invariant(typeof file.bodyBase64==='string','ORIGINAL_FILE_BODY_REQUIRED');
  const raw=Buffer.from(file.bodyBase64,'base64');
  invariant(raw.toString('base64')===file.bodyBase64&&raw.length===file.bytes&&sha256(raw)===file.sha256,'ORIGINAL_FILE_IDENTITY_MISMATCH');
  invariant(raw.length>0&&raw.length<=5000000,'SDP_INSTRUCTIONS_FILE_LIMIT');
  // Freeze the boundary and all multipart bytes at prepare time; resume dispatch reuses these exact bytes.
  const boundary='bloccpay-'+randomUUID();
  body=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+file.filename+'"\r\nContent-Type: text/csv\r\n\r\n'),raw,Buffer.from('\r\n--'+boundary+'--\r\n')]);
  headers['Content-Type']='multipart/form-data; boundary='+boundary;
 }else if(input.body!==undefined){
  body=Buffer.from(canonicalJSON(input.body));headers['Content-Type']='application/json';
 }
 const request={schema:'bloccpay.prepared-provider-request.v1',action,provider:descriptor.provider,
  environment:descriptor.environment,baseUrl:descriptor.baseUrl,url:url.href,path,method:entry.method,headers,
  mutation:entry.mutation,resourceKind:entry.resourceKind,
  resourceId:input.params.id??input.params.transferID??input.params.virtualAccountID??input.params.customerID??null,
  input,context:descriptor,bodyBase64:body?.toString('base64')??null,bodyBytes:body?.length??0,
  bodySha256:body?sha256(body):null,responseFormat:entry.responseFormat,
  allowEmptyResponse:entry.responseFormat!=='json'||entry.method==='DELETE',
  readback:readbackFor(entry,input),source:entry.source,preparedAt:new Date().toISOString()};
 request.requestSha256=sha256(Buffer.from(canonicalJSON(request)));
 return request;
}
function safeContinuation(request,href,cursor) {
 invariant(typeof href==='string'&&href.length,'NATIVE_NEXT_LINK_REQUIRED');
 const current=new URL(request.url),next=new URL(href,current);
 invariant(next.origin===current.origin&&next.pathname===current.pathname&&!next.username&&!next.password&&!next.hash,'NATIVE_CURSOR_SCOPE_CHANGED');
 const strip=url=>{const out=new URL(url);out.searchParams.delete(cursor);out.searchParams.sort();return out.href;};
 invariant(strip(next)===strip(current),'NATIVE_CURSOR_FILTER_CHANGED');
 invariant(next.searchParams.getAll(cursor).length===1,'NATIVE_CURSOR_REQUIRED');
 return next;
}
export function nextPageRequest({request,exchange}) {
 invariant(exchange.classification?.outcome==='accepted'&&exchange.response?.complete,'COMPLETE_ACCEPTED_PAGE_REQUIRED');
 const entry=actionContract(request.action).entry,value=exchange.parsed?.value;
 if(!entry.pagination)return{done:true};
 const input=clone(request.input),query=input.query??={};
 if(entry.pagination==='sdp'){
  invariant(plain(value)&&Array.isArray(value.data)&&plain(value.pagination),'SDP_PAGE_SCHEMA');
  const {pages,total,next}=value.pagination,current=query.page??1;
  invariant(Number.isSafeInteger(pages)&&pages>=0&&Number.isSafeInteger(total)&&total>=0,'SDP_PAGINATION_COUNTS');
  if(!next){invariant(current>=pages,'SDP_NEXT_LINK_MISSING');return{done:true};}
  const url=safeContinuation(request,next,'page'),page=Number(url.searchParams.get('page'));
  invariant(Number.isSafeInteger(page)&&page===current+1,'SDP_PAGE_SKIPPED');query.page=page;
 }else if(entry.pagination==='horizon'){
  invariant(Array.isArray(value?._embedded?.records),'HORIZON_PAGE_SCHEMA');
  const rows=value._embedded.records;if(!rows.length)return{done:true};
  const url=safeContinuation(request,value._links?.next?.href,'cursor'),cursor=url.searchParams.get('cursor'),last=rows.at(-1).paging_token;
  invariant(typeof cursor==='string'&&/^\d+$/.test(cursor)&&cursor===last&&cursor!==query.cursor,'HORIZON_CURSOR_MISMATCH');
  if(query.cursor&&/^\d+$/.test(query.cursor))invariant(query.order==='desc'?BigInt(cursor)<BigInt(query.cursor):BigInt(cursor)>BigInt(query.cursor),'HORIZON_CURSOR_DIRECTION');
  query.cursor=cursor;
 }else{
  invariant(Array.isArray(value?.data),'BRIDGE_PAGE_SCHEMA');
  if(value.count!==undefined)invariant(Number.isSafeInteger(value.count)&&value.count===value.data.length,'BRIDGE_PAGE_COUNT');
  if(!value.data.length)return{done:true};
  const key=query.ending_before?'ending_before':'starting_after',id=(key==='ending_before'?value.data[0]:value.data.at(-1)).id;
  invariant(typeof id==='string'&&id.length&&id!==query[key],'BRIDGE_CURSOR_STALLED');
  query[key]=id;
 }
 return{done:false,action:request.action,input};
}
export function initialReadPlan(config) {
 const descriptor=describeConnection(config),tasks=[],missingBindings=[];
 const add=(action,input={},required=true)=>tasks.push({id:action,action,input,required});
 if(descriptor.provider==='sdp'){
  add('sdp.organization.get');add('sdp.distribution-wallets.list');add('sdp.wallets.list');add('sdp.assets.list');
  add('sdp.distribution-wallet.capabilities',{params:{id:descriptor.sourceWalletId}});
  add('sdp.disbursements.list');add('sdp.payments.list');add('sdp.receivers.list');
 }else if(descriptor.provider==='horizon'){
  add('horizon.network.get');
  const ids=config.accountIds??(config.accountId?[config.accountId]:[]);
  invariant(Array.isArray(ids),'HORIZON_ACCOUNT_IDS_INVALID');
  if(!ids.length)missingBindings.push('accountId or accountIds for account-scoped history');
  for(const id of ids){
   for(const [action,input]of [['horizon.account.get',{params:{accountId:id}}],
      ['horizon.payments.account',{params:{accountId:id}}],['horizon.transactions.account',{params:{accountId:id}}]]){
     add(action,input);tasks.at(-1).id=action+':'+id;
   }
  }
 }else{
  add('bridge.transfers.list');add('bridge.virtual-accounts.history');
  if(descriptor.customerId){add('bridge.customer.get',{params:{customerID:descriptor.customerId}});
   add('bridge.virtual-accounts.list',{params:{customerID:descriptor.customerId}});}
  else missingBindings.push('customerId for customer-specific endorsement and virtual-account discovery');
 }
 return{tasks,missingBindings};
}
