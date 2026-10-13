import { createHmac, timingSafeEqual } from 'node:crypto';
import { VERSION, assert, id, text, safeUrl, integer, canonical, jsonDigest, digest, RozoError, validatePayment } from './model.mjs';

export const MERCHANT_BASE='https://intentapiv4.rozo.ai/functions/v1/payment-api';
export const MPP_BASE='https://apiserver.mpprouter.dev/v1/services/rozo-agent-api';
export const TESTNET_BASE='https://intentapitestnet.rozo.ai';
export function connectionFor(connections,alias,environment=process.env){
  const source=connections?.[alias];assert(source,'CONNECTION_MISSING','Bind the original host connection '+alias+'.',409);
  const c={...source,alias};
  if(c.apiKeyEnv){assert(/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.apiKeyEnv),'CONNECTION_ENV','Invalid key environment name.');c.apiKey=environment[c.apiKeyEnv];assert(c.apiKey,'CONNECTION_KEY','The selected merchant key is not available on this host.',409);}
  if(c.webhookSecretEnv){assert(/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.webhookSecretEnv),'CONNECTION_ENV','Invalid webhook environment name.');c.webhookSecret=environment[c.webhookSecretEnv];}
  const base=c.baseUrl??(c.type==='merchant-key-v2'?MERCHANT_BASE:c.type==='rozo-testnet-v1'?TESTNET_BASE:null);
  if(base)c.baseUrl=safeUrl(base,'provider base URL',{loopback:c.allowLocal===true});
  if(c.rpcUrl)c.rpcUrl=safeUrl(c.rpcUrl,'Stellar RPC URL',{loopback:c.allowLocal===true});
  if(c.horizonUrl)c.horizonUrl=safeUrl(c.horizonUrl,'Stellar Horizon URL',{loopback:c.allowLocal===true});
  return c;
}
export function connectionBinding(c){
  return {alias:c.alias,type:c.type,baseUrl:c.baseUrl??null,rpcUrl:c.rpcUrl??null,horizonUrl:c.horizonUrl??null,appId:c.appId??null,sourceSelectionSha256:c.sourceSelectionSha256??null,apiKeyEnv:c.apiKeyEnv??null,webhookSecretEnv:c.webhookSecretEnv??null};
}
export function requireProfileConnection(profile,c){
  assert(c.type===profile.type,'CONNECTION_PROFILE','The configured connection uses another original provider profile.',409);
  if(profile.type==='merchant-key-v2'){assert(c.apiKey,'CONNECTION_KEY','Bind the selected merchant API key on this host.',409);assert(c.appId===profile.appId,'MERCHANT_BINDING','The host connection must declare the same observed merchant appId.',409);}
}
export function retryAfter(headers,at=Date.now()){
  const raw=headers?.['retry-after'];if(!raw)return null;
  if(/^[0-9]+(?:\.[0-9]+)?$/.test(raw))return new Date(at+Math.ceil(Number(raw)*1000)).toISOString();
  const date=Date.parse(raw);return Number.isFinite(date)?new Date(date).toISOString():null;
}
export async function capturedHttp(workspace,{requestId=null,profileId,kind,url,method='GET',bodyText=null,headers={},authAlias=null,timeoutMs=30000,maxBytes=32*1024*1024,signal,fetchImpl=globalThis.fetch}){
  integer(timeoutMs,'HTTP timeout',100,300000);integer(maxBytes,'maximum response bytes',1024,256*1024*1024);
  const publicHeaders=Object.fromEntries(Object.entries(headers).filter(([k])=>!['authorization','x-api-key','cookie','proxy-authorization'].includes(k.toLowerCase())));
  const request={method,url,headers:publicHeaders,authAlias,bodyText};
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(new Error('HTTP timeout')),timeoutMs);
  const signals=signal?AbortSignal.any([signal,abort.signal]):abort.signal;
  let response,capture,partial=null;const chunks=[];
  try{
    response=await fetchImpl(url,{method,headers,body:bodyText??undefined,redirect:'manual',signal:signals});
    const responseHeaders=Object.fromEntries(response.headers.entries());let size=0;
    if(response.body){const reader=response.body.getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){const remaining=maxBytes-(size-value.byteLength);if(remaining>0)chunks.push(Buffer.from(value.subarray(0,remaining)));partial=Buffer.concat(chunks);await reader.cancel();throw new RozoError('RESPONSE_TOO_LARGE','The complete provider response exceeded the selected capture size.',502,{receivedAtLeast:size,limit:maxBytes});}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}}
    const raw=Buffer.concat(chunks);
    capture=workspace.capture({requestId,profileId,kind,request,status:response.status,headers:responseHeaders,body:raw});
    let value=null;try{value=JSON.parse(raw.toString('utf8'));}catch{}
    if(!response.ok)throw new RozoError('PROVIDER_HTTP','The original provider returned HTTP '+response.status+'.',502,{captureId:capture.id,nativeStatus:response.status,retryAfter:retryAfter(responseHeaders)});
    assert(value!==null,'PROVIDER_JSON','The complete original response is not JSON.',502,{captureId:capture.id});
    return {value,capture};
  }catch(error){
    if(!capture){if(partial===null&&chunks.length)partial=Buffer.concat(chunks);capture=workspace.capture({requestId,profileId,kind,request,status:response?.status??null,headers:response?Object.fromEntries(response.headers.entries()):{},body:partial,error:{code:error.code??(signals.aborted?'HTTP_ABORTED':'HTTP_TRANSPORT'),message:error.message,partial:partial!==null}});}
    if(error instanceof RozoError){error.details={...error.details,captureId:capture.id};throw error;}
    throw new RozoError(signals.aborted?'HTTP_ABORTED':'HTTP_TRANSPORT','The original HTTP request did not return a complete response.',502,{captureId:capture.id});
  }finally{clearTimeout(timer);}
}
export function merchantCall(workspace,profile,c,{requestId,path='',method='GET',body,kind='merchant',signal,fetchImpl}){
  requireProfileConnection(profile,c);
  assert(profile.type==='merchant-key-v2','INVALID_PROFILE','Select the keyed merchant API.');
  return capturedHttp(workspace,{requestId,profileId:profile.id,kind,url:c.baseUrl+path,method,bodyText:body===undefined?null:canonical(body),headers:{accept:'application/json','content-type':'application/json','X-API-Key':c.apiKey},authAlias:c.alias,signal,fetchImpl});
}
export async function readPayment(workspace,profile,c,paymentId,options={}){
  text(paymentId,'paymentId');
  const response=profile.type==='merchant-key-v2'?await merchantCall(workspace,profile,c,{...options,path:'/payments/'+encodeURIComponent(paymentId),kind:'payment_get'}):await capturedHttp(workspace,{...options,profileId:profile.id,url:c.baseUrl+'/payments/'+encodeURIComponent(paymentId),kind:'payment_get'});
  validatePayment(profile,response.value,{paymentId});
  const observation=workspace.observe({profileId:profile.id,kind:'payment',identity:paymentId,captureId:response.capture.id,value:response.value});
  return {...response,observation};
}
export async function readOriginalOrder(workspace,profile,c,orderId,options={}){
  text(orderId,'orderId');
  const response=await merchantCall(workspace,profile,c,{...options,path:'/payments/order/'+encodeURIComponent(profile.appId)+'/'+encodeURIComponent(orderId),kind:'original_order_lookup'});
  validatePayment(profile,response.value,{orderId});
  const observation=workspace.observe({profileId:profile.id,kind:'payment',identity:response.value.id,captureId:response.capture.id,value:response.value});
  return {...response,observation};
}
export async function paymentPage(workspace,profile,c,{requestId,fromDate,toDate,offset,limit=100,status,signal,fetchImpl}){
  integer(offset,'offset');integer(limit,'limit',1,100);
  const query=new URLSearchParams({fromDate,toDate,offset:String(offset),limit:String(limit)});if(status)query.set('status',status);
  const response=await merchantCall(workspace,profile,c,{requestId,path:'/payments?'+query.toString(),kind:'payment_page',signal,fetchImpl});
  assert(Array.isArray(response.value.data),'PROVIDER_PAGE','The original list has no data array.',502,{captureId:response.capture.id});
  const p=response.value.pagination;assert(p && Number.isSafeInteger(p.total)&&p.total>=0&&p.offset===offset&&Number.isSafeInteger(p.limit)&&p.limit>=1&&p.limit<=100,'PROVIDER_PAGINATION','The original pagination did not match this selected page.',502,{captureId:response.capture.id});
  assert(response.value.data.length<=p.limit,'PROVIDER_PAGINATION','The original page exceeds its reported limit.',502,{captureId:response.capture.id});
  for(const payment of response.value.data)validatePayment(profile,payment);
  const observations=response.value.data.map(payment=>workspace.observe({profileId:profile.id,kind:'payment',identity:payment.id,captureId:response.capture.id,value:payment}));
  return {...response,observations};
}
export function receiveCallback(workspace,profile,c,{rawBody,headers,receivedAt=Date.now()}){
  requireProfileConnection(profile,c);assert(c.webhookSecret,'WEBHOOK_SECRET','Bind the original webhook secret on this host.',409);
  assert(Buffer.isBuffer(rawBody),'CALLBACK_BYTES','Supply the exact HTTP body bytes.');
  const normalized=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),Array.isArray(v)?v.join(','):String(v)]));
  const timestamp=normalized['x-rozo-timestamp'],signature=normalized['x-rozo-signature'];
  const capture=workspace.capture({profileId:profile.id,kind:'callback',request:{method:'POST',path:'/callbacks/'+profile.id,headers:normalized,receivedAt:new Date(receivedAt).toISOString()},headers:{'content-type':normalized['content-type']??'application/octet-stream'},body:rawBody});
  const base={captureId:capture.id,bodySha256:capture.body.sha256};
  assert(typeof timestamp==='string'&&/^[0-9]{10,16}$/.test(timestamp)&&Number.isSafeInteger(Number(timestamp)),'CALLBACK_TIMESTAMP','Invalid original callback timestamp.',401,base);
  assert(typeof signature==='string'&&/^sha256=[a-f0-9]{64}$/.test(signature),'CALLBACK_SIGNATURE','Invalid original callback signature format.',401,base);
  const expected=createHmac('sha256',Buffer.from(c.webhookSecret,'utf8')).update(Buffer.from(timestamp+'.','utf8')).update(rawBody).digest(),actual=Buffer.from(signature.slice(7),'hex');
  assert(actual.length===expected.length&&timingSafeEqual(actual,expected),'CALLBACK_SIGNATURE','The original callback signature did not match.',401,base);
  let event;try{event=JSON.parse(rawBody.toString('utf8'));}catch{throw new RozoError('CALLBACK_JSON','The signed callback body is not JSON.',400,base);}
  assert(event && typeof event==='object'&&!Array.isArray(event),'CALLBACK_JSON','The signed callback envelope is invalid.',400,base);
  text(event.event_id,'event_id');assert(['payment_payin_completed','payment_payout_completed'].includes(event.type),'CALLBACK_TYPE','The original event type is not one of the two documented callbacks.',400,base);
  validatePayment(profile,event.data);text(event.timestamp,'original event timestamp');
  const previous=workspace.callbackReceipt(profile.id,event.event_id);
  if(previous?.bodySha256===capture.body.sha256)return {...previous,reused:true,duplicateCaptureId:capture.id};
  assert(Math.abs(receivedAt-Number(timestamp))<=300000,'CALLBACK_CLOCK','The signed original callback is outside the five-minute clock window.',401,base);
  return workspace.callback(profile.id,event,capture.body.sha256,capture.id);
}
export async function rpcCall(workspace,profile,c,method,params,{requestId,signal,fetchImpl}={}){
  assert(['getNetwork','getHealth','getLatestLedger','getEvents','getTransaction','getVersionInfo'].includes(method),'RPC_METHOD','This source adapter only reads original network/event/transaction methods.');
  const body={jsonrpc:'2.0',id:requestId??'rozo-read',method,params};
  const response=await capturedHttp(workspace,{requestId,profileId:profile.id,kind:'stellar_'+method,url:c.rpcUrl,method:'POST',bodyText:canonical(body),headers:{'content-type':'application/json'},authAlias:c.alias,signal,fetchImpl});
  assert(response.value.jsonrpc==='2.0' && response.value.id===body.id,'RPC_RESPONSE','The RPC returned another response identity.',502,{captureId:response.capture.id});
  assert(!response.value.error && response.value.result,'RPC_ERROR','The original Stellar RPC returned an error.',502,{captureId:response.capture.id,rpcError:response.value.error??null});
  return {value:response.value.result,capture:response.capture};
}
