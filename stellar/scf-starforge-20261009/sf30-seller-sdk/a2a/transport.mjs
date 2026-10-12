// SPDX-License-Identifier: MIT
// Official A2A SDK transport; this module does not implement an agent or a task scheduler.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicHttpsFetch } from '../../sf31-buyer-client/public-transport.mjs';
import { SDK_VERSION, SDK_COMMIT, LIMITS, fail, canonical, clone, object, text, identifier, checkedURL, decodeBase64, now, publicError } from './foundation.mjs';

let sdkPromise;
export async function loadA2ASdk() {
  if(!sdkPromise)sdkPromise=(async()=>{
    let directory=dirname(fileURLToPath(import.meta.resolve('@a2a-js/sdk'))),packageInfo;
    for(let i=0;i<8;i++){try{const p=JSON.parse(readFileSync(join(directory,'package.json'),'utf8'));if(p.name==='@a2a-js/sdk'){packageInfo=p;break;}}catch{}const parent=dirname(directory);if(parent===directory)break;directory=parent;}
    if(packageInfo?.version!==SDK_VERSION)fail('A2A_SDK_VERSION','Install the selected @a2a-js/sdk '+SDK_VERSION+' runtime.',409);
    const [types,client]=await Promise.all([import('@a2a-js/sdk'),import('@a2a-js/sdk/client')]);
    return{types,client,identity:{package:'@a2a-js/sdk',version:SDK_VERSION,commit:SDK_COMMIT}};
  })().catch(error=>{sdkPromise=null;throw error;});
  return sdkPromise;
}
export async function normalizeAgentCard(raw) {
  object(raw,'Agent Card');const {types}=await loadA2ASdk();const card=types.AgentCard.toJSON(types.AgentCard.fromJSON(raw));
  text(card.name,'agent name',1000);if(!Array.isArray(card.supportedInterfaces)||!card.supportedInterfaces.length)fail('AGENT_INTERFACES_REQUIRED');
  if(!Array.isArray(card.skills)||!card.skills.length)fail('AGENT_SKILLS_REQUIRED');
  return clone(card);
}
export async function normalizeMessageRequest(value) {
  object(value);object(value.message,'message');const m=value.message;
  identifier(m.messageId,'native messageId');
  if(m.role!=='ROLE_USER')fail('USER_MESSAGE_REQUIRED');
  if(!Array.isArray(m.parts)||!m.parts.length||m.parts.length>1000)fail('MESSAGE_PARTS_REQUIRED');
  for(const part of m.parts){
    object(part);if(['text','raw','url','data'].filter(k=>Object.hasOwn(part,k)).length!==1)fail('PART_CONTENT','Each part must select exactly one original A2A content field.');
    if(Object.hasOwn(part,'text'))text(part.text,'part text',LIMITS.requestBytes,{empty:true});
    if(Object.hasOwn(part,'raw'))decodeBase64(part.raw,LIMITS.requestBytes);
    if(Object.hasOwn(part,'url')){const url=new URL(part.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)fail('PART_URL');}
    if(Object.hasOwn(part,'data')&&part.data===null)fail('PART_DATA','This selected native SDK represents an absent data part as null; use an explicit JSON value.');
  }
  if(m.taskId)identifier(m.taskId,'native taskId');if(m.contextId)identifier(m.contextId,'native contextId');
  if(value.configuration?.taskPushNotificationConfig)fail('PUSH_NOT_CONFIGURED','Use the retained polling or subscription workflow; no push endpoint has been selected.');
  const {types}=await loadA2ASdk();
  const result=types.SendMessageRequest.toJSON(types.SendMessageRequest.fromJSON({...value,configuration:{returnImmediately:true,...(value.configuration??{})}}));
  if(Buffer.byteLength(canonical(result))>LIMITS.requestBytes)fail('MESSAGE_TOO_LARGE');
  return clone(result);
}
export function selectInterface(card,index,connection,extensions=[]) {
  if(!Number.isInteger(index)||index<0||index>=card.supportedInterfaces.length)fail('INTERFACE_INDEX');
  const selected=clone(card.supportedInterfaces[index]);
  if(selected.protocolVersion!=='1.0'||!['JSONRPC','HTTP+JSON'].includes(selected.protocolBinding))fail('UNSUPPORTED_A2A_INTERFACE','Select an original JSONRPC or HTTP+JSON A2A 1.0 interface.');
  checkedURL(selected.url,{trustedOrigins:connection.trustedOrigins,origins:connection.allowedOrigins});
  if(new URL(selected.url).search)fail('INTERFACE_QUERY','Select an interface without query credentials or routing parameters.');
  if(!Array.isArray(extensions)||extensions.some(x=>typeof x!=='string'||x.includes(',')))fail('INVALID_EXTENSIONS');
  const declared=card.capabilities?.extensions??[];
  for(const extension of declared)if(extension.required&&!extensions.includes(extension.uri))fail('REQUIRED_EXTENSION','Review each required native extension before selecting this agent.',409,{uri:extension.uri});
  for(const uri of extensions)if(!declared.some(x=>x.uri===uri))fail('UNDECLARED_EXTENSION');
  return selected;
}
const responseHeaderNames=['content-type','content-length','content-encoding','etag','last-modified','retry-after','request-id','x-request-id','a2a-version'];
const visibleHeaders=headers=>Object.fromEntries(responseHeaderNames.filter(n=>headers.has(n)).map(n=>[n,headers.get(n)]));
function credential(connection) {
  if(!connection.credential)return null;
  const value=process.env[connection.credential.env];if(!value)fail('CREDENTIAL_UNAVAILABLE','The selected host credential reference is unavailable.',409);
  const scheme=connection.credential.scheme;
  if(value.length>16384||/[\r\n\0]/.test(value)|| (scheme==='Bearer'&&!/^[A-Za-z0-9._~+/-]+=*$/.test(value)) || (scheme==='Basic'&&!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) || (scheme==='ApiKey'&&!/^[\x21-\x7e]+$/.test(value)))fail('CREDENTIAL_FORMAT');
  return{scheme,value,name:scheme==='ApiKey'?'api-key':'authorization',header:scheme==='ApiKey'?value:scheme+' '+value};
}
/** Capture every byte delivered to the SDK before parsing. Full responses and SSE
 * chunks retain their actual identities. Aborted streams explicitly remain incomplete. */
export function createCapturedFetch({connection,endpoint=null,kind='agent',onWire,signal,fetchImpl=null,maxBytes=LIMITS.responseBytes}) {
  let sequence=0;const activeReaders=new Map();
  const selectedEndpoint=endpoint?new URL(endpoint):null;
  const secret=credential(connection);
  const authenticatedOrigin=selectedEndpoint?.origin??new URL(connection.cardUrl).origin;
  const rawPublic=new Map();
  function transport(url,authenticate) {
    if(fetchImpl)return fetchImpl;
    if(connection.trustedOrigins.includes(url.origin))return globalThis.fetch;
    const scheme=authenticate?secret?.scheme:null,key=url.origin+':'+scheme;
    if(!rawPublic.has(key))rawPublic.set(key,createPublicHttpsFetch({timeoutMs:connection.streamMs,sourceAuthorization:scheme?{origin:url.origin,scheme}:null}));
    return rawPublic.get(key);
  }
  const captured=async(urlValue,init={})=>{
    const origins=kind==='artifact'?[...connection.allowedOrigins,...connection.artifactOrigins]:connection.allowedOrigins;
    const url=checkedURL(String(urlValue),{trustedOrigins:connection.trustedOrigins,origins});
    if(selectedEndpoint&&kind==='agent'){
      const base=selectedEndpoint.pathname.replace(/\/+$/,'');
      if(url.origin!==selectedEndpoint.origin||(url.pathname!==base&&url.pathname!==base+'/'&&!url.pathname.startsWith(base+'/')))fail('SDK_ENDPOINT_CHANGED','The SDK request left the exact selected agent interface.');
    }
    const method=String(init.method??'GET').toUpperCase();
    if(kind!=='agent'&&method!=='GET')fail('READ_METHOD_REQUIRED');
    const headers=new Headers(init.headers);
    for(const n of headers.keys())if(/authorization|cookie|api-key|payment|proxy-|^host$|^connection$|^content-length$|transfer-encoding/i.test(n))fail('CALLER_AUTH_HEADER','Credentials are selected only by the host connection.');
    const authenticate=!!secret&&kind!=='artifact'&&url.origin===authenticatedOrigin;
    if(authenticate)headers.set(secret.name,secret.header);
    const body=init.body===undefined?null:Buffer.from(init.body);
    if(body&&body.length>LIMITS.requestBytes)fail('REQUEST_TOO_LARGE');
    const wireId=++sequence;
    const notify=value=>onWire?.({...value,wireId,private:!!secret&&!!value.body&&Buffer.from(value.body).includes(Buffer.from(secret.value))});
    notify({phase:'request',at:now(),url:url.href,method,headers:Object.fromEntries([...headers].filter(([n])=>!['authorization','api-key'].includes(n))),body});
    const combined=AbortSignal.any([signal,init.signal].filter(Boolean));
    let response;try{response=await transport(url,authenticate)(url.href,{method,headers,body:body??undefined,redirect:'manual',signal:combined});}
    catch(error){notify({phase:'failure',at:now(),error:publicError(error)});throw error;}
    const receipt={phase:'response',at:now(),status:response.status,headers:visibleHeaders(response.headers),url:url.href};
    notify(receipt);
    if(response.status>=300&&response.status<400){await response.body?.cancel();notify({phase:'end',at:now(),complete:false,reason:'REDIRECT_NOT_FOLLOWED',bytes:0});fail('REDIRECT_NOT_FOLLOWED','Review the returned redirect as a new explicit source.',502);}
    if(!response.body){notify({phase:'end',at:now(),complete:true,bytes:0,body:Buffer.alloc(0)});return response;}
    const reader=response.body.getReader();let total=0,ended=false;const chunks=[];
    const finish=(complete,reason)=>{if(ended)return;ended=true;activeReaders.delete(reader);notify({phase:'end',at:now(),complete,reason:reason??null,bytes:total,body:Buffer.concat(chunks,total)});};
    activeReaders.set(reader,finish);
    const stream=new ReadableStream({
      async pull(controller) {
        try {
          combined.throwIfAborted();const item=await reader.read();
          if(item.done){finish(!combined.aborted,combined.aborted?'LOCAL_READER_CLOSED':null);controller.close();return;}
          const bytes=Buffer.from(item.value);
          if(total+bytes.length>maxBytes){await reader.cancel();finish(false,'RESPONSE_LIMIT');fail('RESPONSE_LIMIT','The complete native response exceeds the selected capture limit.');}
          // Persist before enqueue: a parsed task ID can never precede its source bytes.
          chunks.push(bytes);total+=bytes.length;notify({phase:'chunk',at:now(),offset:total-bytes.length,body:bytes});controller.enqueue(bytes);
        }catch(error){try{await reader.cancel();}catch{}finish(false,error?.code??'STREAM_INTERRUPTED');controller.error(error);}
      },
      async cancel(){try{await reader.cancel();}finally{finish(false,'LOCAL_READER_CLOSED');}}
    });
    const wrapped=new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
    Object.defineProperty(wrapped,'url',{value:url.href});return wrapped;
  };
  captured.close=async()=>{for(const [reader,finish]of [...activeReaders]){finish(false,'LOCAL_READER_CLOSED');try{await reader.cancel();}catch{}}};
  return captured;
}
export async function captureAgentCard(options) {
  const fetcher=createCapturedFetch({...options,kind:'card',maxBytes:LIMITS.cardBytes});
  try{const response=await fetcher(options.connection.cardUrl);const bytes=Buffer.from(await response.arrayBuffer());if(!response.ok)fail('CARD_HTTP','The selected Agent Card returned an unsuccessful status.',502,{status:response.status});let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{fail('CARD_JSON');}return{card:await normalizeAgentCard(value),bytes};}finally{await fetcher.close();}
}
export async function executeA2A({connection,card,selection,method,params,onWire,onEvent,signal,fetchImpl=null}) {
  const {types,client:library}=await loadA2ASdk();
  const selected=selectInterface(card,selection.interfaceIndex,connection,selection.extensions??[]);
  if(canonical(selected)!==canonical(selection.interface))fail('SELECTED_INTERFACE_CHANGED');
  const streaming=method==='sendMessageStream'||method==='resubscribeTask';
  if(streaming&&!card.capabilities?.streaming)fail('STREAMING_NOT_ADVERTISED');
  const fetcher=createCapturedFetch({connection,endpoint:selected.url,onWire,signal,fetchImpl});
  try{
    const nativeCard=types.AgentCard.fromJSON({...card,supportedInterfaces:[selected]});
    const factory=new library.ClientFactory({transports:[new library.JsonRpcTransportFactory({fetchImpl:fetcher}),new library.RestTransportFactory({fetchImpl:fetcher})],preferredTransports:[selected.protocolBinding],clientConfig:{polling:true}});
    const client=await factory.createFromAgentCard(nativeCard);
    const requestTypes={sendMessage:'SendMessageRequest',sendMessageStream:'SendMessageRequest',getTask:'GetTaskRequest',listTasks:'ListTasksRequest',cancelTask:'CancelTaskRequest',resubscribeTask:'SubscribeToTaskRequest'};
    if(!requestTypes[method])fail('UNSUPPORTED_NATIVE_METHOD');
    const native=types[requestTypes[method]].fromJSON(params);
    const options={signal,serviceParameters:selection.extensions?.length?{'A2A-Extensions':selection.extensions.join(',')}:{}};let result;
    if(streaming){
      let count=0;
      for await(const event of client[method](native,options)){if(++count>LIMITS.events)fail('EVENT_LIMIT','The retained stream reached its event cap; continue with GetTask or a new subscription.');result=types.StreamResponse.toJSON(event);await onEvent?.({kind:'stream',value:clone(result)});}
      return{kind:'stream',value:result??null,events:count,runtime:{package:'@a2a-js/sdk',version:SDK_VERSION,commit:SDK_COMMIT}};
    }
    const value=await client[method](native,options);
    if(method==='listTasks')result={kind:'task_list',value:types.ListTasksResponse.toJSON(value)};
    else if(value&&typeof value.id==='string'&&value.status)result={kind:'task',value:types.Task.toJSON(value)};
    else if(value?.messageId)result={kind:'message',value:types.Message.toJSON(value)};
    else fail('NATIVE_RESULT_SHAPE','The original SDK did not return a Task, Message, or task list.',502);
    await onEvent?.(clone(result));return{...clone(result),runtime:{package:'@a2a-js/sdk',version:SDK_VERSION,commit:SDK_COMMIT}};
  }finally{await fetcher.close();}
}
export async function fetchArtifact({connection,url,onWire,signal,fetchImpl}) {
  const fetcher=createCapturedFetch({connection,kind:'artifact',onWire,signal,fetchImpl,maxBytes:LIMITS.artifactBytes});
  try{const response=await fetcher(url);const bytes=Buffer.from(await response.arrayBuffer());if(!response.ok)fail('ARTIFACT_HTTP','The selected artifact returned an unsuccessful status.',502,{status:response.status});return{bytes,headers:visibleHeaders(response.headers)};}finally{await fetcher.close();}
}
