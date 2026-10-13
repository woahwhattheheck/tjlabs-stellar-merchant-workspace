import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {createReadOnlyTransport} from "../../settlement-audit/native-http.mjs";
import {openSDPSource} from "../../settlement-audit/sdp-native.mjs";
import {SDPContractError,SDP_SOURCE,EVENT_TYPES,validateScope,verifyPrepared,reconcileBatch} from "./sdp-contract.mjs";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function fail(code,message,detail){throw new SDPContractError(code,message,detail);}
function identifier(value,label){if(typeof value!=="string"||!value||value.length>255||/[\x00-\x20\x7f/?#\\]/.test(value))fail("INVALID_ID",label+" is not a provider identifier");return value;}
function canonical(value){if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";return JSON.stringify(value);}
export function strictJSON(bytes){
 const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);let p=0;
 function ws(){while(/\s/.test(text[p]??"")&&p<text.length)p++;}
 function str(){const start=p++;while(p<text.length){if(text[p]==="\\"){p+=2;continue;}if(text[p++]==='"')return JSON.parse(text.slice(start,p));}fail("INVALID_JSON","Unclosed JSON string");}
 function value(depth){if(depth>128)fail("INVALID_JSON","JSON nesting exceeds128");ws();const c=text[p];
  if(c==='"')return str();
  if(c==="{"){p++;ws();const keys=new Set();if(text[p]==="}"){p++;return;}for(;;){ws();if(text[p]!=='"')fail("INVALID_JSON","Object key required");const key=str();if(keys.has(key))fail("DUPLICATE_JSON_KEY","Duplicate JSON key "+key);keys.add(key);ws();if(text[p++]!==":")fail("INVALID_JSON","Colon required");value(depth+1);ws();const end=text[p++];if(end==="}")return;if(end!==",")fail("INVALID_JSON","Object separator required");}}
  if(c==="["){p++;ws();if(text[p]==="]"){p++;return;}for(;;){value(depth+1);ws();const end=text[p++];if(end==="]")return;if(end!==",")fail("INVALID_JSON","Array separator required");}}
  const token=text.slice(p).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/)?.[0];
  if(!token)fail("INVALID_JSON","Invalid JSON value");
  if(/^-?\d/.test(token)){const n=Number(token);if(!Number.isFinite(n)||(Number.isInteger(n)&&!Number.isSafeInteger(n)))fail("UNSAFE_JSON_NUMBER","Provider numeric value cannot be represented exactly");}
  p+=token.length;
 }
 value(0);ws();if(p!==text.length)fail("INVALID_JSON","Trailing JSON content");return JSON.parse(text);
}
export class SDPNativeError extends Error {
 constructor(code,message,result=null){super(message);this.name="SDPNativeError";this.code=code;this.result=result;}
}
export function verifyWebhook({rawBody,headers,secret,scope,nowSeconds=Math.floor(Date.now()/1000),toleranceSeconds=300,singleTenantInstallation=false}){
 const selected=validateScope(scope);
 if(!(rawBody instanceof Uint8Array)||rawBody.length>5*1024*1024)fail("INVALID_WEBHOOK","Exact raw body bytes are required, maximum5MiB");
 if(typeof secret!=="string"||!secret)fail("WEBHOOK_SECRET_REQUIRED","Use the existing selected SDP organization webhook secret");
 if(!Number.isSafeInteger(nowSeconds)||!Number.isSafeInteger(toleranceSeconds)||toleranceSeconds<0||toleranceSeconds>3600)fail("INVALID_WEBHOOK_CLOCK","Invalid delivery clock/tolerance");
 const get=name=>{if(headers?.get)return headers.get(name);const matches=Object.entries(headers??{}).filter(([k])=>k.toLowerCase()===name.toLowerCase());if(matches.length!==1||Array.isArray(matches[0][1]))fail("INVALID_WEBHOOK_HEADERS","Exactly one "+name+" header is required");return matches[0][1];};
 const timestamp=get("X-SDP-Timestamp"),signature=get("X-SDP-Signature");
 if(typeof timestamp!=="string"||!/^(?:0|[1-9]\d{0,12})$/.test(timestamp)||typeof signature!=="string"||!/^sha256=[0-9a-f]{64}$/.test(signature))fail("INVALID_WEBHOOK_SIGNATURE","Invalid SDP signature or timestamp encoding");
 const t=Number(timestamp);if(!Number.isSafeInteger(t)||Math.abs(nowSeconds-t)>toleranceSeconds)fail("STALE_WEBHOOK_DELIVERY","SDP delivery is outside the selected timestamp tolerance");
 const expected=createHmac("sha256",secret).update(timestamp+".","utf8").update(rawBody).digest();
 if(!timingSafeEqual(expected,Buffer.from(signature.slice(7),"hex")))fail("INVALID_WEBHOOK_SIGNATURE","SDP HMAC verification failed");
 const event=strictJSON(rawBody);
 if(!event||Array.isArray(event)||typeof event!=="object")fail("INVALID_WEBHOOK_EVENT","Event envelope must be an object");
 identifier(event.event_id,"event_id");
 if(!EVENT_TYPES.includes(event.event_type)||event.schema_version!==1)fail("UNSUPPORTED_WEBHOOK_EVENT","Unsupported provider event type or schema version");
 if((event.tenant_id!==selected.tenantId&&!(singleTenantInstallation===true&&event.tenant_id===undefined))||event.source_wallet_id!==selected.sourceWalletId)fail("WEBHOOK_SCOPE_MISMATCH","Event tenant and source wallet must match the original selected endpoint");
 if(typeof event.occurred_at!=="string"||!Number.isFinite(Date.parse(event.occurred_at))||!event.data||Array.isArray(event.data)||typeof event.data!=="object")fail("INVALID_WEBHOOK_EVENT","Provider event time and data are required");
 if(event.event_type.startsWith("disbursement."))identifier(event.data.disbursement_id,"disbursement_id");
 if(event.event_type.startsWith("wallet.")){
  identifier(event.data.wallet_id,"wallet_id");
  if(event.data.wallet_id!==selected.sourceWalletId)fail("WEBHOOK_SCOPE_MISMATCH","Wallet event data must select the same original distribution wallet");
 }
 return {schema:"commons.sdp.verified-event.v1",providerSource:SDP_SOURCE,scope:selected,event,rawBodyBase64:Buffer.from(rawBody).toString("base64"),rawBodySHA256:hash(rawBody),deliveryTimestamp:timestamp,signatureHeaders:{"X-SDP-Timestamp":timestamp,"X-SDP-Signature":signature},verifiedAt:new Date(nowSeconds*1000).toISOString(),eventKey:[selected.origin,selected.tenantId,selected.sourceWalletId,event.event_id].join("\n")};
}
export async function receiveWebhook(options,{acceptEvent}){
 if(typeof acceptEvent!=="function")fail("TRANSACTION_ADAPTER_REQUIRED","Pass the original application transaction that atomically records event identity and its effect");
 const verified=verifyWebhook(options);
 // The original application inserts this exact eventKey/payload digest and its effect in one
 // transaction. A repeated key/different digest is a conflict, never another ledger credit.
 const outcome=await acceptEvent(verified);
 if(!outcome||!["accepted","duplicate","conflict"].includes(outcome.status))fail("INVALID_TRANSACTION_RESULT","Event transaction must report accepted, duplicate or conflict");
 return {eventId:verified.event.event_id,status:outcome.status,outcome};
}
export class SDPClient {
 constructor({scope,getToken,onObservation,admitMutation,recordMutation,executeMutation,fetchImpl=globalThis.fetch,timeoutMs=30000,maxResponseBytes=32*1024*1024,allowLoopback=false}){
  this.scope=Object.freeze({...validateScope(scope),asset:Object.freeze({...scope.asset})});
  const base=new URL(this.scope.origin);
  if(base.username||base.password||base.search||base.hash)fail("INVALID_ORIGIN","SDP base URL cannot include credentials/query/fragment");
  if(base.protocol!=="https:"&&!(allowLoopback&&base.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(base.hostname)))fail("INVALID_ORIGIN","SDP uses HTTPS; only an explicitly selected local installation may use loopback HTTP");
  base.pathname=base.pathname.replace(/\/+$/,"")+"/";this.base=base;
  if(typeof getToken!=="function"||typeof fetchImpl!=="function"||typeof onObservation!=="function")fail("NATIVE_ADAPTER_REQUIRED","getToken, original durable onObservation and fetch are required");
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1)fail("INVALID_LIMIT","Invalid explicit response/timeout limits");
  this.getToken=getToken;this.onObservation=onObservation;this.admitMutation=admitMutation;this.recordMutation=recordMutation;this.executeMutation=executeMutation;this.fetch=fetchImpl;this.timeoutMs=timeoutMs;this.maxResponseBytes=maxResponseBytes;this.allowLoopback=allowLoopback;
 }
 url(path){
  const u=new URL(path,this.base);
  if(u.origin!==this.base.origin||u.username||u.password||u.hash||!u.pathname.startsWith(this.base.pathname))fail("CROSS_ORIGIN_REQUEST","Request must stay within the selected original SDP base");
  return u;
 }
 async observe(result){
  try{const retained=await this.onObservation(result);if(retained!==undefined)result.retainedSources=retained;}catch(error){throw new SDPNativeError("OBSERVATION_SAVE_FAILED","Retain the original provider outcome before continuing: "+error.message,result);}
 }
 connection(token){return {baseUrl:this.scope.origin,network:this.scope.networkPassphrase,tenantName:this.scope.tenantName,walletId:this.scope.sourceWalletId,token,timeoutMs:this.timeoutMs,maximumResponseBytes:this.maxResponseBytes,allowHttp:this.allowLoopback===true};}
 async interpretRead(native,descriptor,requestSHA256,transportDescriptor,{text=false}={}){
  const raw=native.response.body,response=native.response;
  const result={schema:"commons.sdp.observation.v1",providerSource:SDP_SOURCE,descriptor,requestSHA256,
   startedAt:response.startedAt,finishedAt:response.observedAt,dispatch:"attempted",status:response.status,
   headers:response.headers,bodyBase64:raw.toString("base64"),bodySHA256:hash(raw),complete:response.bodyComplete,
   nativeRequest:native.request,nativeContinuation:native.continuation,
   nativeTransport:{source:"settlement-audit/native-http.mjs",descriptor:transportDescriptor,elapsedMs:response.elapsedMs}};
  const contentType=response.headers["content-type"]??"";
  if(raw.length&&(!text||contentType.toLowerCase().includes("json"))){
   try{result.data=strictJSON(raw);}catch(error){result.parseError={code:error.code??"INVALID_JSON",message:error.message};}
  }
  if(native.error&&!(text&&native.error.code==="INVALID_NATIVE_JSON"&&response.bodyComplete&&response.status>=200&&response.status<300))result.error=native.error;
  await this.observe(result);
  if(!result.complete)throw new SDPNativeError("READ_INCOMPLETE","Original native transport returned incomplete bytes",result);
  if(result.status<200||result.status>=300)throw new SDPNativeError(result.status===401?"AUTHENTICATION":result.status===403?"PERMISSION":result.status===429?"RATE_LIMITED":"PROVIDER_ERROR","SDP returned HTTP "+result.status,result);
  if(result.parseError)throw new SDPNativeError("INVALID_PROVIDER_JSON",result.parseError.message,result);
  if(result.error)throw new SDPNativeError(result.error.code,result.error.message,result);
  return result;
 }
 async readOriginal(url,descriptor,requestSHA256,token,signal){
  const transport=createReadOnlyTransport("sdp",this.connection(token));
  const native=await transport.get(url,{method:"GET",url:url.href,scope:this.scope},signal);
  return this.interpretRead(native,descriptor,requestSHA256,transport.descriptor,{text:url.pathname.endsWith("/instructions")});
 }
 async readSource(input,{signal}={}){
  const token=await this.getToken();
  if(typeof token!=="string"||!token||/[\r\n]/.test(token))fail("INVALID_CREDENTIAL","Original SDP credential is unavailable");
  const source=openSDPSource(this.connection(token));
  const native=await source.read({...input,signal});
  const u=new URL(native.request.path.replace(/^\/+/,""),this.base);
  for(const [key,value] of Object.entries(native.request.query))u.searchParams.set(key,value);
  const descriptor={method:"GET",url:u.href,scope:this.scope,bodyBase64:null,contentType:null,operationId:null};
  return this.interpretRead(native,descriptor,hash(Buffer.from(canonical(descriptor))),source.describe());
 }
 async request(path,{method="GET",body=null,contentType=null,operationId=null,signal,beforeDispatch=null}={}){
  const url=this.url(path),writing=method!=="GET";
  const rawBody=body===null?null:Buffer.from(body);
  const descriptor={method,url:url.href,scope:this.scope,bodyBase64:rawBody?.toString("base64")??null,contentType,operationId};
  const requestSHA256=hash(Buffer.from(canonical(descriptor)));
  if(signal?.aborted)throw new SDPNativeError("NOT_STARTED","Operation canceled before dispatch");
  if(writing&&typeof this.executeMutation==="function"){
   identifier(operationId,"operationId");
   // The selected company service owns admission, wire encoding, financial validation,
   // dispatch and recovery. This branch never performs a second HTTP mutation.
   const result=await this.executeMutation({descriptor,requestSHA256,signal,beforeDispatch});
   if(!result||result.requestSHA256!==requestSHA256||canonical(result.descriptor)!==canonical(descriptor))fail("MUTATION_IDENTITY_MISMATCH","The company outcome must bind this complete SDK intent");
   const retainedBody=Buffer.from(result.bodyBase64??"","base64");
   if(retainedBody.toString("base64")!==result.bodyBase64||hash(retainedBody)!==result.bodySHA256)fail("MUTATION_BODY_MISMATCH","Retain the complete original company response bytes");
   if(retainedBody.length&&(result.headers?.["content-type"]??"").toLowerCase().includes("json")){
    try{result.data=strictJSON(retainedBody);}catch(error){result.parseError={code:error.code??"INVALID_JSON",message:error.message};}
   }
   await this.observe(result);
   if(!result.complete)throw new SDPNativeError("WRITE_OUTCOME_UNCERTAIN","Reconcile the same original company operation",result);
   if(result.status<200||result.status>=300)throw new SDPNativeError(result.status===401?"AUTHENTICATION":result.status===403?"PERMISSION":result.status===429?"RATE_LIMITED":result.status===409?"CONFLICT":"PROVIDER_ERROR","SDP returned HTTP "+result.status,result);
   if(result.parseError)throw new SDPNativeError("WRITE_RESPONSE_UNREADABLE",result.parseError.message,result);
   if(result.error)throw new SDPNativeError(result.error.code??"COMPANY_OUTCOME_REQUIRES_REVIEW",result.error.message??"Reconcile the original company operation",result);
   return result;
  }
  let token;
  try{token=await this.getToken();}catch(error){throw new SDPNativeError("CREDENTIAL_UNAVAILABLE",error.message);}
  if(typeof token!=="string"||!token||/[\r\n]/.test(token))fail("INVALID_CREDENTIAL","Original SDP credential is unavailable");
  if(signal?.aborted)throw new SDPNativeError("NOT_STARTED","Operation canceled before dispatch");
  if(!writing)return this.readOriginal(url,descriptor,requestSHA256,token,signal);
  if(writing){
   identifier(operationId,"operationId");
   if(typeof this.admitMutation!=="function"||typeof this.recordMutation!=="function")fail("MUTATION_JOURNAL_REQUIRED","Use the original durable mutation admission and outcome writer");
   const admission=await this.admitMutation({descriptor,requestSHA256});
   if(!admission||admission.requestSHA256!==requestSHA256)fail("MUTATION_IDENTITY_MISMATCH","Admission must bind the exact original request");
   if(admission.dispatch!==true){
    if(admission.result){const prior=admission.result;if(prior.requestSHA256!==requestSHA256)fail("MUTATION_IDENTITY_MISMATCH","Saved mutation result belongs to another exact request");if(!prior.complete||prior.status<200||prior.status>=300||prior.parseError)throw new SDPNativeError("PREVIOUS_PROVIDER_OUTCOME","Reconcile the retained original provider outcome",prior);return prior;}
    throw new SDPNativeError("RECONCILIATION_REQUIRED","This original request already has an attempt; reconcile its provider outcome before dispatching again",admission);
   }
  }
  if(beforeDispatch){
   try{await beforeDispatch();if(signal?.aborted)throw new SDPNativeError("NOT_STARTED","Operation canceled before dispatch");}
   catch(error){
    const at=new Date().toISOString(),result={schema:"commons.sdp.observation.v1",providerSource:SDP_SOURCE,descriptor,requestSHA256,startedAt:at,finishedAt:at,dispatch:"not_started",status:null,headers:{},bodyBase64:"",bodySHA256:hash(Buffer.alloc(0)),complete:false,error:{code:error.code??"PRE_DISPATCH_FAILED",message:error.message}};
    try{await this.recordMutation({descriptor,requestSHA256,result});}catch(saveError){throw new SDPNativeError("MUTATION_SAVE_FAILED","Original action was admitted but not dispatched; save its exact outcome: "+saveError.message,result);}
    throw new SDPNativeError(error.code??"PRE_DISPATCH_FAILED",error.message,result);
   }
  }
  const startedAt=new Date().toISOString(),controller=new AbortController(),abort=()=>controller.abort(signal?.reason);
  signal?.addEventListener("abort",abort,{once:true});if(signal?.aborted)abort();
  const timeout=setTimeout(()=>controller.abort(new Error("SDP request timed out")),this.timeoutMs);
  let result={schema:"commons.sdp.observation.v1",providerSource:SDP_SOURCE,descriptor,requestSHA256,startedAt,dispatch:"attempted",status:null,headers:{},bodyBase64:"",bodySHA256:hash(Buffer.alloc(0)),complete:false};
  const chunks=[];let total=0;
  try{
   const response=await this.fetch(url,{method,headers:{"Authorization":"Bearer "+token,"SDP-Tenant-Name":this.scope.tenantName,"X-Wallet-Id":this.scope.sourceWalletId,"Accept":"application/json",...(contentType?{"Content-Type":contentType}:{})},body:rawBody,redirect:"manual",signal:controller.signal});
   result.status=response.status;
   for(const name of ["content-type","date","retry-after","x-request-id","request-id"]) {const v=response.headers.get(name);if(v!==null)result.headers[name]=v;}
   const reader=response.body?.getReader();
   if(reader)try{for(;;){const part=await reader.read();if(part.done)break;const remaining=this.maxResponseBytes-total;if(part.value.byteLength>remaining){if(remaining>0)chunks.push(Buffer.from(part.value.subarray(0,remaining)));total=this.maxResponseBytes;await reader.cancel();throw new SDPNativeError("RESPONSE_LIMIT","Provider response exceeds configured retention limit");}chunks.push(Buffer.from(part.value));total+=part.value.byteLength;}}finally{reader.releaseLock();}
   const raw=Buffer.concat(chunks);result.bodyBase64=raw.toString("base64");result.bodySHA256=hash(raw);result.complete=true;result.finishedAt=new Date().toISOString();
   if((result.headers["content-type"]??"").toLowerCase().includes("json")&&raw.length){try{result.data=strictJSON(raw);}catch(error){result.parseError={code:error.code??"INVALID_JSON",message:error.message};}}
  }catch(error){
   const raw=Buffer.concat(chunks);result.bodyBase64=raw.toString("base64");result.bodySHA256=hash(raw);result.finishedAt=new Date().toISOString();result.error={code:error.code??"TRANSPORT_ERROR",message:error.message};
  }finally{clearTimeout(timeout);signal?.removeEventListener("abort",abort);}
  // Retain every response/partial body before interpreting success or advancing state.
  try{await this.observe(result);}catch(error){if(writing){try{await this.recordMutation({descriptor,requestSHA256,result});}catch(second){error.outcomeSaveError=second.message;}}throw error;}
  if(writing)try{await this.recordMutation({descriptor,requestSHA256,result});}catch(error){throw new SDPNativeError("MUTATION_SAVE_FAILED","Provider outcome retained; reconcile the same original operation: "+error.message,result);}
  if(!result.complete)throw new SDPNativeError(writing?"WRITE_OUTCOME_UNCERTAIN":"READ_INCOMPLETE","Original request did not return a complete response",result);
  if(result.status<200||result.status>=300){
   const code=result.status===401?"AUTHENTICATION":result.status===403?"PERMISSION":result.status===429?"RATE_LIMITED":result.status===409?"CONFLICT":result.status>=500&&writing?"WRITE_OUTCOME_UNCERTAIN":"PROVIDER_ERROR";
   throw new SDPNativeError(code,"SDP returned HTTP "+result.status,result);
  }
  if(result.parseError)throw new SDPNativeError(writing?"WRITE_RESPONSE_UNREADABLE":"INVALID_PROVIDER_JSON",result.parseError.message,result);
  return result;
 }
 async getDisbursement(id,options){return this.readSource({kind:"disbursement",id:identifier(id,"disbursementId")},options);}
 async getInstructions(id,options){return this.request("disbursements/"+encodeURIComponent(identifier(id,"disbursementId"))+"/instructions",options);}
 async getPayment(id,options){return this.readSource({kind:"payment",id:identifier(id,"paymentId")},options);}
 async list(read,{maxPages=1000,signal}={}){
  if(!Number.isSafeInteger(maxPages)||maxPages<1)fail("INVALID_LIMIT","maxPages must be a positive integer");
  if(read.cursor)fail("INVALID_PAGINATION","A complete collection starts at the original first page");
  let current={...read},declaredTotal=null,declaredPages=null,complete=false;
  const seenCursor=new Set(),seenID=new Set(),observations=[],data=[],issues=[];
  for(let page=1;page<=maxPages;page++){
   const observation=await this.readSource(current,{signal});observations.push(observation);
   const value=observation.data,p=value?.pagination;
   if(!value||!Array.isArray(value.data)||!p)fail("INVALID_PAGINATION","Expected the original complete SDP data and pagination envelope");
   if(!Number.isSafeInteger(p.total)||p.total<0||!Number.isSafeInteger(p.pages)||p.pages<0)fail("INVALID_PAGINATION","Invalid provider counts");
   if(declaredTotal===null){declaredTotal=p.total;declaredPages=p.pages;}
   else if(p.total!==declaredTotal||p.pages!==declaredPages)issues.push({kind:"collection_changed_during_capture",page,total:p.total,pages:p.pages});
   for(const row of value.data){
    if(!row||typeof row.id!=="string"||seenID.has(row.id))issues.push({kind:"duplicate_or_missing_record_id",page,id:row?.id??null});
    else seenID.add(row.id);
    data.push(row);
   }
   const continuation=observation.nativeContinuation;
   if(continuation?.done===true){
    complete=true;if(data.length!==p.total||page!==Math.max(1,p.pages))issues.push({kind:"terminal_count_mismatch",page,total:p.total,observed:data.length,pages:p.pages});
    break;
   }
   if(!continuation?.next?.cursor||seenCursor.has(continuation.next.cursor))fail("PAGINATION_CYCLE","The original SDP continuation did not advance");
   seenCursor.add(continuation.next.cursor);current=continuation.next;
  }
  if(!complete)issues.push({kind:"page_limit_reached",maxPages,next:current});
  return {data,observations,complete:complete&&issues.length===0,issues,declaredTotal,declaredPages,next:complete?null:current,consistency:"sequential_provider_observations"};
 }
 async captureDisbursement(id,{maxPages=1000,signal}={}){
  identifier(id,"disbursementId");const startedAt=new Date().toISOString();
  const before=await this.getDisbursement(id,{signal});
  const instructions=await this.getInstructions(id,{signal});
  const receivers=await this.list({kind:"disbursementReceivers",id,pageSize:100,filters:{sort:"created_at",direction:"asc"}},{maxPages,signal});
  const payments=await this.list({kind:"payments",pageSize:100,filters:{type:"DISBURSEMENT",sort:"created_at",direction:"asc"}},{maxPages,signal});
  const after=await this.getDisbursement(id,{signal});
  const changes=[];
  if(canonical(before.data)!==canonical(after.data))changes.push({kind:"disbursement_changed_during_capture"});
  if(before.data?.id!==id||after.data?.id!==id||before.data?.source_wallet_id!==this.scope.sourceWalletId||after.data?.source_wallet_id!==this.scope.sourceWalletId)changes.push({kind:"disbursement_scope_mismatch"});
  const snapshot={schema:"commons.sdp.snapshot.v1",providerSource:SDP_SOURCE,scope:this.scope,startedAt,finishedAt:new Date().toISOString(),complete:receivers.complete&&payments.complete&&changes.length===0,disbursement:after.data,instructions:new TextDecoder("utf-8",{fatal:true}).decode(Buffer.from(instructions.bodyBase64,"base64")),receivers:receivers.data,payments:payments.data,changes,collections:{receivers,payments},observations:{before,instructions,after},consistency:"Full sequential API collection; not an atomic database snapshot. Original per-request bodies and times are retained."};
  return snapshot;
 }
 async createDraft(prepared,{validateAddress,signal}={}){
  const p=verifyPrepared(prepared,{validateAddress});this.assertScope(p);
  return this.request("disbursements",{method:"POST",body:Buffer.from(JSON.stringify(p.request)+"\n"),contentType:"application/json",operationId:p.operationId+":create",signal});
 }
 assertScope(p){if(canonical(p.scope)!==canonical(this.scope))fail("SCOPE_MISMATCH","Prepared batch belongs to another original account/asset/network");}
 async uploadInstructions(prepared,id,{validateAddress,expectedBefore,signal}={}){
  const p=verifyPrepared(prepared,{validateAddress});this.assertScope(p);identifier(id,"disbursementId");
  if(!expectedBefore?.complete||!expectedBefore.data||expectedBefore.data.id!==id||expectedBefore.data.source_wallet_id!==this.scope.sourceWalletId||!["DRAFT","READY"].includes(expectedBefore.data.status))fail("CURRENT_DRAFT_REQUIRED","Pass the actual current original draft/ready disbursement observation");
  const digest=hash(Buffer.from(p.instructions)),boundary="commons-sdp-"+digest.slice(0,40);
  const body=Buffer.from("--"+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="instructions.csv"\r\nContent-Type: text/csv\r\n\r\n'+p.instructions+"\r\n--"+boundary+"--\r\n");
  return this.request("disbursements/"+encodeURIComponent(id)+"/instructions",{method:"POST",body,contentType:"multipart/form-data; boundary="+boundary,operationId:p.operationId+":instructions",signal,beforeDispatch:async()=>{
  const now=await this.getDisbursement(id,{signal});
  if(now.data?.name!==p.request.name||now.data?.asset?.id!==p.scope.asset.id||now.data?.asset?.code!==p.scope.asset.code||now.data?.asset?.issuer!==p.scope.asset.issuer||now.data?.registration_contact_type!==p.request.registration_contact_type||(p.request.wallet_id&&now.data?.wallet?.id!==p.request.wallet_id)||(now.data?.verification_field??"")!==(p.request.verification_field??""))fail("BATCH_BINDING_MISMATCH","Selected provider draft differs from this exact prepared batch");
  if(canonical(now.data)!==canonical(expectedBefore.data))fail("PROVIDER_CHANGED","Provider disbursement changed since the selected original observation");
  }});
 }
 async changeStatus(prepared,id,status,{validateAddress,snapshot,signal}={}){
  const p=verifyPrepared(prepared,{validateAddress});this.assertScope(p);identifier(id,"disbursementId");
  if(!["STARTED","PAUSED","CANCELED"].includes(status))fail("INVALID_STATUS","SDP supports STARTED, PAUSED or CANCELED status requests");
  if(!snapshot||snapshot.disbursement?.id!==id)fail("CURRENT_SNAPSHOT_REQUIRED","Use the original full disbursement snapshot");
  if(status==="STARTED"){
   const review=reconcileBatch(p,snapshot);
   if(review.requiresReview)fail("RECONCILIATION_REQUIRED","Resolve actual source/recipient/payment discrepancies in the original application before starting this selected payroll batch",{review});
  }
  // Pause and cancellation remain available for the original selected disbursement even
  // when receiving exposes discrepancies; the provider enforces its real transitions.
  const operationId="sdp:status:"+hash(Buffer.from(canonical({operationId:p.operationId,scope:this.scope,disbursementId:id,status,predecessor:snapshot.disbursement})));
  // Admission replays an identical original intent before another provider read. A
  // different reviewed predecessor produces a distinct pause/resume action.
  return this.request("disbursements/"+encodeURIComponent(id)+"/status",{method:"PATCH",body:Buffer.from(JSON.stringify({status})+"\n"),contentType:"application/json",operationId,signal,beforeDispatch:async()=>{
   const current=await this.getDisbursement(id,{signal});
   if(current.data?.id!==id||current.data?.source_wallet_id!==this.scope.sourceWalletId)fail("BATCH_SCOPE_MISMATCH","Current provider batch belongs to another source wallet");
   if(canonical(current.data)!==canonical(snapshot.disbursement))fail("PROVIDER_CHANGED","Refresh original provider observations before changing status");
   // The provider retains authorization, maker/checker and transition checks.
  }});
 }
}
