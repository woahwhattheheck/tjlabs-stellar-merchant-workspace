// MIT. Flowable 8 job inventory, original exceptions and explicit native recovery.
// Uses the original connection, HTTP transport and durable exchange sinks in native.mjs.
import {createHash} from 'node:crypto';
import {normalizeFlowableConnection,flowableConnectionSha256,createFlowableTransport,executeFlowableRequest,FLOWABLE_NATIVE_VERSION,FLOWABLE_NATIVE_COMMIT} from './native.mjs';

export const FLOWABLE_JOB_NATIVE_SCHEMA='stellar-forge.flowable-job-native-request.v1';
export const FLOWABLE_JOB_COLLECTIONS=Object.freeze(['jobs','timerJobs','suspendedJobs','deadLetterJobs','historyJobs']);
export const FLOWABLE_JOB_ACTIONS=Object.freeze({
 jobs:Object.freeze(['execute','delete']),
 timerJobs:Object.freeze(['move','reschedule','delete']),
 suspendedJobs:Object.freeze(['delete']),
 deadLetterJobs:Object.freeze(['move','moveToHistoryJob','delete']),
 historyJobs:Object.freeze(['execute','delete'])
});
export const FLOWABLE_JOB_EXCEPTION_KIND='job-exception-stacktrace';
export {FLOWABLE_NATIVE_VERSION,FLOWABLE_NATIVE_COMMIT,normalizeFlowableConnection};
const PATHS=Object.freeze({jobs:'/management/jobs',timerJobs:'/management/timer-jobs',suspendedJobs:'/management/suspended-jobs',deadLetterJobs:'/management/deadletter-jobs',historyJobs:'/management/history-jobs'});
const SHA=/^[a-f0-9]{64}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const hash=value=>createHash('sha256').update(value).digest('hex');
const now=()=>new Date().toISOString();
function fail(code,message,extra={}){return Object.assign(new Error(message),{code,...extra});}
function object(value,label){if(!plain(value))throw fail('FLOWABLE_INPUT_INVALID',label+' must be a JSON object.');return value;}
function keys(value,allowed,label){object(value,label);for(const key of Object.keys(value))if(!allowed.includes(key))throw fail('FLOWABLE_INPUT_INVALID',label+' contains unsupported field '+key+'.');}
function text(value,label,maximum=8192){if(typeof value!=='string'||!value.length||value.length>maximum||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))throw fail('FLOWABLE_INPUT_INVALID',label+' must be complete text within its declared bound.');return value;}
function nativeId(value){text(value,'Native job ID',2048);if(value==='.'||value==='..'||/[/\\\r\n]/u.test(value))throw fail('FLOWABLE_INPUT_INVALID','Native job ID must be one path component.');return value;}
function canonical(value){
 if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(plain(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
 throw fail('FLOWABLE_INPUT_INVALID','Value must be JSON serializable.');
}
const objectHash=value=>hash(canonical(value));
function captureOptions(value={}){
 object(value,'Capture options');
 const retainBodies=value.retainBodies??!(typeof value.onExchange==='function'&&typeof value.onDefinition==='function');
 if(typeof retainBodies!=='boolean')throw fail('FLOWABLE_INPUT_INVALID','retainBodies must be a boolean.');
 return {...value,retainBodies};
}
function sinkReference(value){
 if(!plain(value)||!SHA.test(value.sha256||'')||!Number.isSafeInteger(value.bytes)||value.bytes<0||typeof value.mediaType!=='string')throw fail('FLOWABLE_SINK_INVALID','The original exception sink must identify complete immutable resource bytes.');
 return value;
}
function requestCore(spec){return{connectionId:spec.connectionId,connectionSha256:spec.connectionSha256,method:spec.method,path:spec.path,query:spec.query??{},contentType:spec.contentType??null,bodyBytes:spec.bodyBytes??0,bodySha256:spec.bodySha256??null};}
function exactBytes(value,label){
 if(typeof value!=='string')throw fail('FLOWABLE_NATIVE_SHAPE_CHANGED',label+' lacks complete original Base64 bytes.');
 const bytes=Buffer.from(value,'base64');
 if(bytes.toString('base64')!==value)throw fail('FLOWABLE_NATIVE_SHAPE_CHANGED',label+' contains changed Base64 bytes.');
 return bytes;
}
export function planFlowableJobRequest(connectionInput,input){
 const connection=normalizeFlowableConnection(connectionInput);
 keys(input,['collection','jobId','action','dueDate'],'Native job selection');
 const {collection,action}=input,jobId=nativeId(input.jobId);
 if(!FLOWABLE_JOB_COLLECTIONS.includes(collection)||!FLOWABLE_JOB_ACTIONS[collection].includes(action))throw fail('FLOWABLE_INPUT_INVALID','Choose an action supported by the selected original job queue.');
 if(action==='reschedule')text(input.dueDate,'Original timer due date',8192);
 else if(Object.hasOwn(input,'dueDate'))throw fail('FLOWABLE_INPUT_INVALID','Only the native reschedule action accepts dueDate.');
 // The original controller owns parsing the dueDate string and uses configured
 // retry counts. Preserve that string; never turn it into a local date or retry count.
 const body=action==='delete'?null:JSON.stringify({action,...(action==='reschedule'?{dueDate:input.dueDate}:{})});
 const bytes=body===null?null:Buffer.from(body,'utf8');
 const plan={schema:FLOWABLE_JOB_NATIVE_SCHEMA,engineVersion:FLOWABLE_NATIVE_VERSION,
  connectionId:connection.id,connectionSha256:flowableConnectionSha256(connection),
  collection,jobId,action,mutation:true,method:action==='delete'?'DELETE':'POST',
  path:PATHS[collection]+'/'+encodeURIComponent(jobId),query:{},
  contentType:body===null?null:'application/json',bodyBytes:bytes?.length??0,
  bodySha256:bytes?hash(bytes):null,...(bytes?{bodyBase64:bytes.toString('base64')}:{}),
  readback:{collection,jobId,...(action==='reschedule'?{dueDate:input.dueDate}:{}),
   successStatus:204,jobIdPreservedAcrossMoves:true}};
 plan.requestSha256=objectHash(requestCore(plan));return plan;
}
function validatePlan(connectionInput,plan){
 const connection=normalizeFlowableConnection(connectionInput);object(plan,'Saved job plan');
 if(plan.schema!==FLOWABLE_JOB_NATIVE_SCHEMA||plan.engineVersion!==FLOWABLE_NATIVE_VERSION||
    plan.connectionId!==connection.id||plan.connectionSha256!==flowableConnectionSha256(connection))throw fail('FLOWABLE_PLAN_CHANGED','The saved job request belongs to a different original native connection.');
 const selection={collection:plan.collection,jobId:plan.jobId,action:plan.action,
  ...(plan.action==='reschedule'?{dueDate:plan.readback?.dueDate}:{})};
 if(canonical(planFlowableJobRequest(connection,selection))!==canonical(plan))throw fail('FLOWABLE_PLAN_CHANGED','The saved job action, original request bytes or selected native identity changed.');
 return plan;
}
export function createFlowableJobTransport(connectionInput,options={}){
 const native=createFlowableTransport(connectionInput,options);
 return Object.freeze({...native,execute:(plan,options={})=>native.request(validatePlan(native.connection,plan),options.signal)});
}
export async function executeFlowableJobRequest(transport,plan,callbacks={}){
 validatePlan(transport.connection,plan);
 return executeFlowableRequest(transport,plan,callbacks);
}
function metadataExchange(value){return{requestSha256:value.requestSha256,request:value.request,status:value.status,ok:value.ok,complete:value.complete,bodyBytes:value.bodyBytes,bodySha256:value.bodySha256,...(value.bodyRef?{bodyRef:value.bodyRef}:{})};}
async function retainException(full,callbacks){
 const ref=typeof callbacks.onDefinition==='function'?await callbacks.onDefinition(full):undefined;
 if(callbacks.retainBodies)return full;
 sinkReference(ref);const{contentBase64,...metadata}=full;return{...metadata,definitionRef:ref};
}
async function readNative(transport,path,query,callbacks,{allowMissing=false}={}){
 let full;
 const strings=Object.fromEntries(Object.entries(query).map(([key,value])=>[key,String(value)]));
 const exchange=await executeFlowableRequest({execute:(spec,options)=>transport.request(spec,options.signal)},
  {method:'GET',path,query:strings,mutation:false},
  {...callbacks,onExchange:async value=>{full=value;return typeof callbacks.onExchange==='function'?callbacks.onExchange(value):undefined;}});
 if(!full||full.complete!==true)throw fail('FLOWABLE_NATIVE_SHAPE_CHANGED','The original job reader did not receive a complete exchange.',{exchange});
 if(!full.ok&&!(allowMissing&&full.status===404))throw fail('FLOWABLE_NATIVE_READ_REJECTED','The original job read returned HTTP '+full.status+'.',{status:full.status,exchange});
 return{full,exchange,json:full.json,found:full.ok};
}
function validateJob(value,collection,id){
 if(!plain(value)||typeof value.id!=='string'||!value.id||(id!==undefined&&value.id!==id))throw fail('FLOWABLE_NATIVE_SHAPE_CHANGED','The original '+collection+' returned a missing or different job ID.');
 nativeId(value.id);return value;
}
async function readCollection(transport,collection,callbacks){
 const pageSize=callbacks.pageSize??100;
 if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>10000)throw fail('FLOWABLE_INPUT_INVALID','Native pageSize must be from 1 to 10000.');
 const items=[],pages=[],exchanges=[],seen=new Set();let start=0,total=null;
 for(;;){
  const response=await readNative(transport,PATHS[collection],{sort:'id',order:'asc',start,size:pageSize},callbacks),page=response.json;
  if(!plain(page)||!Array.isArray(page.data)||!Number.isSafeInteger(page.start)||!Number.isSafeInteger(page.size)||!Number.isSafeInteger(page.total)||page.start!==start||page.total<0||page.size!==page.data.length||page.data.length>pageSize)throw fail('FLOWABLE_NATIVE_SHAPE_CHANGED','The original '+collection+' page does not match its complete DataResponse.',{exchange:response.exchange});
  if(total===null)total=page.total;
  else if(total!==page.total)throw fail('FLOWABLE_INVENTORY_CHANGED','The original '+collection+' total changed during capture.',{capturedItems:items.length,previousTotal:total,currentTotal:page.total,exchange:response.exchange});
  for(const item of page.data){validateJob(item,collection);if(seen.has(item.id))throw fail('FLOWABLE_INVENTORY_CHANGED','The original '+collection+' pages repeated a native job ID.');seen.add(item.id);items.push(item);}
  exchanges.push(response.exchange);pages.push({start:page.start,size:page.size,total:page.total,sort:page.sort??null,order:page.order??null,...metadataExchange(response.exchange)});
  start+=page.data.length;if(start>total)throw fail('FLOWABLE_INVENTORY_CHANGED','Native job pages exceed their reported total.');
  if(start===total)break;
  if(!page.data.length)throw fail('FLOWABLE_INVENTORY_INCOMPLETE','The original '+collection+' stopped before its reported total.',{capturedItems:items.length,total});
 }
 return{items,pages,total,complete:true,atomicSnapshot:false,exchanges};
}
async function readJobDetail(transport,collection,jobId,callbacks){
 const result=await readNative(transport,PATHS[collection]+'/'+encodeURIComponent(jobId),{},callbacks,{allowMissing:true});
 if(result.found)validateJob(result.json,collection,jobId);
 return result;
}
async function readException(transport,collection,jobId,callbacks){
 // Flowable's pinned BPMN REST controller exposes stacktraces for these four
 // queues only. History job detail retains its original exceptionMessage/config.
 if(collection==='historyJobs')return{resources:[],exchanges:[],observations:[{collection,jobId,availability:'NO_NATIVE_STACKTRACE_ENDPOINT'}]};
 const result=await readNative(transport,PATHS[collection]+'/'+encodeURIComponent(jobId)+'/exception-stacktrace',{},callbacks,{allowMissing:true});
 const observation={collection,jobId,status:result.full.status,found:result.found,
  availability:result.found?'RETAINED':'NATIVE_404',bodyBytes:result.full.bodyBytes,bodySha256:result.full.bodySha256};
 const resources=[];
 if(result.found){
  const bytes=exactBytes(result.full.bodyBase64,'Original job exception');
  if(bytes.length!==result.full.bodyBytes||hash(bytes)!==result.full.bodySha256)throw fail('FLOWABLE_NATIVE_SHAPE_CHANGED','Original job exception byte identity changed.');
  resources.push(await retainException({schema:'stellar-forge.flowable-source-resource.v1',
   kind:FLOWABLE_JOB_EXCEPTION_KIND,collection,jobId,filename:collection+'-'+encodeURIComponent(jobId)+'.exception.txt',
   contentType:result.full.headers?.['content-type']??'text/plain',bytes:bytes.length,sha256:hash(bytes),
   contentBase64:bytes.toString('base64'),exchange:metadataExchange(result.exchange)},callbacks));
 }
 return{resources,exchanges:[result.exchange],observations:[observation]};
}
export async function captureFlowableJobPortfolio(transport,input={}){
 const callbacks=captureOptions(input),startedAt=now(),collections={},resources=[],exchanges=[],exceptionObservations=[];
 for(const collection of FLOWABLE_JOB_COLLECTIONS){
  const captured=await readCollection(transport,collection,callbacks);collections[collection]=captured;exchanges.push(...captured.exchanges);
  // Capture each original single-job response too: history detail includes
  // advancedJobHandlerConfiguration which the collection response can omit.
  const details=[];
  for(const listed of captured.items){
   const detail=await readJobDetail(transport,collection,listed.id,callbacks);exchanges.push(detail.exchange);
   if(!detail.found)throw fail('FLOWABLE_INVENTORY_CHANGED','A listed original job left '+collection+' during capture.',{collection,jobId:listed.id,exchange:detail.exchange});
   details.push(detail.json);
   const exception=await readException(transport,collection,listed.id,callbacks);
   resources.push(...exception.resources);exchanges.push(...exception.exchanges);exceptionObservations.push(...exception.observations);
  }
  captured.items=details;
 }
 return{schema:'stellar-forge.flowable-job-native-portfolio.v1',connectionId:transport.connection.id,
  connectionSha256:transport.connectionSha256,startedAt,completedAt:now(),collections,resources,exchanges,
  exceptionObservations,atomicSnapshot:false,detailCoverage:'ALL_CAPTURED_JOB_IDS',
  exceptionCoverage:'ALL_CAPTURED_IDS_WITH_NATIVE_STACKTRACE_ENDPOINT'};
}
function responseFor(plan,response){
 if(!response)return null;
 if(!plain(response)||response.connectionId!==plan.connectionId||response.connectionSha256!==plan.connectionSha256||response.requestSha256!==plan.requestSha256||
    response.request?.method!==plan.method||response.request?.path!==plan.path||
    response.request?.bodySha256!==plan.bodySha256||response.request?.bodyBytes!==plan.bodyBytes||
    (response.request?.contentType??null)!==plan.contentType||canonical(response.request?.query??{})!==canonical(plan.query))throw fail('FLOWABLE_RESPONSE_CHANGED','The retained response does not belong to this exact original job request.');
 if(response.bodyBase64!==undefined){
  const bytes=exactBytes(response.bodyBase64,'Original job response');
  if(bytes.length!==response.bodyBytes||hash(bytes)!==response.bodySha256)throw fail('FLOWABLE_RESPONSE_CHANGED','The original job response bytes changed.');
  if(response.complete){let parsed=null;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}catch{}if(canonical(parsed)!==canonical(response.json??null))throw fail('FLOWABLE_RESPONSE_CHANGED','Retained native response JSON differs from its original bytes.');}
 }else if(!plain(response.bodyRef)||!SHA.test(response.bodyRef.sha256??''))throw fail('FLOWABLE_RESPONSE_CHANGED','The original job response has no complete retained body reference.');
 return response;
}
export async function readFlowableJobRequestState(transport,plan,input={}){
 validatePlan(transport.connection,plan);const callbacks=captureOptions(input);
 responseFor(plan,callbacks.response);
 const state={schema:'stellar-forge.flowable-job-native-state.v1',connectionId:transport.connection.id,
  connectionSha256:transport.connectionSha256,collection:plan.collection,jobId:plan.jobId,action:plan.action,
  observedAt:now(),jobs:[],timerJobs:[],suspendedJobs:[],deadLetterJobs:[],historyJobs:[],
  resources:[],exchanges:[],exceptionObservations:[],atomicSnapshot:false};
 for(const collection of FLOWABLE_JOB_COLLECTIONS){
  const result=await readJobDetail(transport,collection,plan.jobId,callbacks);state.exchanges.push(result.exchange);
  if(!result.found)continue;
  state[collection].push(result.json);
  const exception=await readException(transport,collection,plan.jobId,callbacks);
  state.resources.push(...exception.resources);state.exchanges.push(...exception.exchanges);state.exceptionObservations.push(...exception.observations);
 }
 return state;
}
function stateFor(plan,state,label){
 if(!plain(state)||state.schema!=='stellar-forge.flowable-job-native-state.v1'||state.connectionId!==plan.connectionId||
    state.connectionSha256!==plan.connectionSha256||state.collection!==plan.collection||
    state.jobId!==plan.jobId||state.action!==plan.action)throw fail('FLOWABLE_STATE_CHANGED',label+' is not the selected original job state.');
 for(const name of [...FLOWABLE_JOB_COLLECTIONS,'resources','exchanges','exceptionObservations'])if(!Array.isArray(state[name]))throw fail('FLOWABLE_STATE_CHANGED',label+' lacks complete native '+name+'.');
 for(const collection of FLOWABLE_JOB_COLLECTIONS){
  if(state[collection].length>1)throw fail('FLOWABLE_STATE_CHANGED',label+' repeats the selected job.');
  for(const job of state[collection])validateJob(job,collection,plan.jobId);
 }
 return state;
}
export function flowableJobStateIdentity(state){
 object(state,'Original job state');
 stateFor({connectionId:state.connectionId,connectionSha256:state.connectionSha256,collection:state.collection,jobId:state.jobId,action:state.action},state,'Selected');
 const collection=state.collection,jobId=state.jobId;
 if(!FLOWABLE_JOB_COLLECTIONS.includes(collection))throw fail('FLOWABLE_STATE_CHANGED','The selected original queue is unknown.');
 // Bind the selected job and full original exception, excluding capture times,
 // exchange UUIDs, response headers and unrelated destination observations.
 return{connectionId:state.connectionId,connectionSha256:state.connectionSha256,collection,jobId,action:state.action,
  jobs:state[collection],
  exceptions:state.exceptionObservations.filter(item=>item.collection===collection&&item.jobId===jobId)
   .map(({collection,jobId,status,found,availability,bodyBytes,bodySha256})=>({collection,jobId,availability,
    ...(status===undefined?{}:{status}),...(found===undefined?{}:{found}),
    ...(found===true&&bodyBytes!==undefined?{bodyBytes}:{}),...(found===true&&bodySha256!==undefined?{bodySha256}:{})})),
  resources:state.resources.filter(item=>item.collection===collection&&item.jobId===jobId)
   .map(item=>({kind:item.kind,collection:item.collection,jobId:item.jobId,contentType:item.contentType,bytes:item.bytes,sha256:item.sha256}))};
}
export function reconcileFlowableJobRequest(plan,beforeInput,afterInput,responseInput){
 object(plan,'Saved job plan');
 const before=stateFor(plan,beforeInput,'Before'),after=stateFor(plan,afterInput,'After'),response=responseFor(plan,responseInput);
 const nativeAcknowledged=Boolean(response?.complete&&response.ok&&response.status===204&&response.bodyBytes===0);
 const locations=FLOWABLE_JOB_COLLECTIONS.filter(name=>after[name].length===1);
 const evidence={requestSha256:plan.requestSha256,collection:plan.collection,jobId:plan.jobId,action:plan.action,
  nativeAcknowledged,response:response?{id:response.id,status:response.status,complete:response.complete,bodySha256:response.bodySha256,bodyBytes:response.bodyBytes}:null,
  beforeLocations:FLOWABLE_JOB_COLLECTIONS.filter(name=>before[name].length===1),afterLocations:locations,
  selectedBefore:before[plan.collection][0]??null,selectedAfter:after[plan.collection][0]??null,
  afterExceptionObservations:after.exceptionObservations,replayAllowed:false};
 const finish=(state,summary,details={})=>({schema:'stellar-forge.flowable-job-native-reconciliation.v1',state,summary,evidence:{...evidence,...details}});
 if(response?.complete&&[400,401,403,404,405,409,415,422].includes(response.status))return finish('REJECTED','The original engine rejected the selected job action.',{nativeError:response.json??null});
 if(!nativeAcknowledged)return finish('UNKNOWN','The saved job action requires its original native response to establish execution; the current queue observations are retained.');
 if(plan.action==='execute')return finish('CONFIRMED','The engine acknowledged the original native job execution.',{confirmation:'ORIGINAL_NATIVE_EXECUTION_RESPONSE'});
 if(plan.action==='delete'){
  if(after[plan.collection].length===0)return finish('CONFIRMED','The engine acknowledged deletion and the selected queue no longer contains the job.',{confirmation:'ORIGINAL_NATIVE_RESPONSE_AND_SELECTED_ABSENCE'});
  return finish('ACCEPTED','The engine acknowledged deletion; the current selected queue still contains the job.');
 }
 if(plan.action==='reschedule')return finish('CONFIRMED','The engine acknowledged the original timer reschedule request.',{confirmation:'ORIGINAL_NATIVE_RESCHEDULE_RESPONSE',requestedDueDate:plan.readback.dueDate,observedDueDate:after.timerJobs[0]?.dueDate??null});
 if(plan.action==='move'||plan.action==='moveToHistoryJob'){
  const allowed=plan.action==='moveToHistoryJob'?['historyJobs']:plan.collection==='timerJobs'?['jobs']:['jobs','historyJobs'];
  const destinations=locations.filter(name=>allowed.includes(name));
  if(after[plan.collection].length===0&&destinations.length===1)return finish('CONFIRMED','The engine acknowledged the move and the original job ID is present in its observed native destination.',{confirmation:'ORIGINAL_NATIVE_RESPONSE_AND_DESTINATION',destination:destinations[0]});
  return finish('ACCEPTED','The engine acknowledged the native move; its current destination is retained as observed.',{possibleNativeDestinations:plan.collection==='deadLetterJobs'&&plan.action==='move'?['jobs','historyJobs','external-worker-jobs']:allowed,
   destinationObservation:'The async executor may consume a moved job before readback; external-worker routing follows the engine job type.'});
 }
 throw fail('FLOWABLE_INPUT_INVALID','Unknown original job reconciliation action.');
}
