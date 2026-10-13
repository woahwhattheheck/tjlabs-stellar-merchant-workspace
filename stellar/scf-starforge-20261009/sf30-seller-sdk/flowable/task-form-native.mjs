// MIT. Flowable 8 native BPMN task-form capture and explicit reviewed submission.
// Reuses the original connection, HTTP byte transport, source sinks and readback reader.
import {createHash} from 'node:crypto';
import {
 normalizeFlowableConnection,flowableConnectionSha256,createFlowableTransport,
 executeFlowableRequest,planFlowableRequest,readFlowableRequestState,
 FLOWABLE_NATIVE_VERSION,FLOWABLE_NATIVE_COMMIT
} from './native.mjs';

export {FLOWABLE_NATIVE_VERSION,FLOWABLE_NATIVE_COMMIT,normalizeFlowableConnection};
export const FLOWABLE_TASK_FORM_SCHEMA='stellar-forge.flowable-task-form-native-state.v1';
export const FLOWABLE_TASK_FORM_REQUEST_SCHEMA='stellar-forge.flowable-task-form-native-request.v1';
export const FLOWABLE_TASK_FORM_TYPES=Object.freeze(['string','long','date','boolean','enum']);
const PATH='/form/form-data',SHA=/^[a-f0-9]{64}$/;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const hash=v=>createHash('sha256').update(v).digest('hex');
const own=(v,k)=>Object.hasOwn(v,k);
function fail(code,message,extra={}){return Object.assign(new Error(message),{code,...extra});}
function object(v,label){if(!plain(v))throw fail('FLOWABLE_INPUT_INVALID',label+' must be a JSON object.');return v;}
function keys(v,allowed,label){object(v,label);for(const k of Object.keys(v))if(!allowed.includes(k))throw fail('FLOWABLE_INPUT_INVALID',label+' contains unsupported field '+k+'.');}
function exactText(v,label,max=2048){if(typeof v!=='string'||!v.length||v.length>max)throw fail('FLOWABLE_INPUT_INVALID',label+' must be nonempty original text within its declared bound.');return v;}
function taskId(v){exactText(v,'Native task ID');if(v==='.'||v==='..'||/[/\\\r\n\u0000]/u.test(v))throw fail('FLOWABLE_INPUT_INVALID','Native task ID must identify one original path component.');return v;}
function canonical(v){
 if(v===null||typeof v==='boolean'||typeof v==='string')return JSON.stringify(v);
 if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 if(plain(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
 throw fail('FLOWABLE_INPUT_INVALID','Native form material must be complete JSON.');
}
const objectHash=v=>hash(canonical(v));
const clone=v=>JSON.parse(canonical(v));
function captureOptions(v={}){
 object(v,'Capture options');
 const retainBodies=v.retainBodies??!(typeof v.onExchange==='function'&&typeof v.onDefinition==='function');
 if(typeof retainBodies!=='boolean')throw fail('FLOWABLE_INPUT_INVALID','retainBodies must be a boolean.');
 return {...v,retainBodies};
}
function exactBytes(v,label){
 if(typeof v!=='string')throw fail('FLOWABLE_NATIVE_SHAPE_CHANGED',label+' lacks complete Base64.');
 const b=Buffer.from(v,'base64');if(b.toString('base64')!==v)throw fail('FLOWABLE_NATIVE_SHAPE_CHANGED',label+' contains changed Base64.');
 return b;
}
function requestCore(p){return{connectionId:p.connectionId,connectionSha256:p.connectionSha256,method:p.method,path:p.path,query:p.query??{},contentType:p.contentType??null,bodyBytes:p.bodyBytes??0,bodySha256:p.bodySha256??null};}
function validateForm(form,id){
 object(form,'Original native form');
 if(form.taskId!==id||!Array.isArray(form.formProperties))throw fail('FLOWABLE_NATIVE_SHAPE_CHANGED','The native form lacks its selected task ID or complete property array.');
 const seen=new Set();
 for(const p of form.formProperties){
  object(p,'Original form property');exactText(p.id,'Original property ID',8192);
  if(seen.has(p.id))throw fail('FLOWABLE_NATIVE_SHAPE_CHANGED','The original form repeats property ID '+p.id+'.');seen.add(p.id);
  for(const k of ['readable','writable','required'])if(typeof p[k]!=='boolean')throw fail('FLOWABLE_NATIVE_SHAPE_CHANGED','The native property '+p.id+' lacks its '+k+' flag.');
  for(const k of ['name','type','value','datePattern'])if(p[k]!==null&&p[k]!==undefined&&typeof p[k]!=='string')throw fail('FLOWABLE_NATIVE_SHAPE_CHANGED','Native property '+p.id+'.'+k+' must retain its original string or null.');
  if(!Array.isArray(p.enumValues))throw fail('FLOWABLE_NATIVE_SHAPE_CHANGED','Native property '+p.id+' lacks the original enumValues array.');
  const ids=new Set();for(const option of p.enumValues){
   object(option,'Native enum option');if(typeof option.id!=='string'||typeof option.name!=='string'&&option.name!==null)throw fail('FLOWABLE_NATIVE_SHAPE_CHANGED','Native enum options must retain string IDs and names.');
   if(ids.has(option.id))throw fail('FLOWABLE_NATIVE_SHAPE_CHANGED','Native enum repeats an option ID.');ids.add(option.id);
  }
 }
 return form;
}
function validateIdentity(v){
 object(v,'Captured native identity');taskId(v.taskId);
 if(typeof v.connectionId!=='string'||!SHA.test(v.connectionSha256??''))throw fail('FLOWABLE_STATE_CHANGED','Captured form connection identity is missing.');
 if(v.task!==null){object(v.task,'Captured task');if(v.task.id!==v.taskId)throw fail('FLOWABLE_STATE_CHANGED','Captured task ID changed.');}
 if(v.form!==null)validateForm(v.form,v.taskId);
 return v;
}
export function flowableTaskFormStateIdentity(state){
 object(state,'Original task-form state');
 if(state.schema!==FLOWABLE_TASK_FORM_SCHEMA)throw fail('FLOWABLE_STATE_CHANGED','Unknown task-form state schema.');
 const identity={connectionId:state.connectionId,connectionSha256:state.connectionSha256,taskId:state.taskId,task:state.task,form:state.form};
 validateIdentity(identity);
 if(!plain(state.nativeState)||state.nativeState.connectionId!==state.connectionId||state.nativeState.connectionSha256!==state.connectionSha256||!Array.isArray(state.nativeState.tasks))throw fail('FLOWABLE_STATE_CHANGED','Task form lacks its original native state.');
 const selected=state.nativeState.tasks.filter(t=>t.id===state.taskId);
 if(selected.length>1||canonical(selected[0]??null)!==canonical(state.task))throw fail('FLOWABLE_STATE_CHANGED','Task form differs from the selected original task readback.');
 return clone(identity);
}
function propertyMode(p){
 if(!p.writable)return 'read-only';
 if(p.type===null||p.type===undefined||p.type==='string')return 'string';
 if(p.type==='date'&&typeof p.datePattern!=='string')return 'native-text';
 return FLOWABLE_TASK_FORM_TYPES.includes(p.type)?p.type:'native-text';
}
export function describeFlowableTaskForm(state){
 const identity=flowableTaskFormStateIdentity(state),form=identity.form;
 return{schema:'stellar-forge.flowable-task-form-description.v1',taskId:state.taskId,
  available:Boolean(identity.task&&form),formKey:form?.formKey??null,
  identitySha256:objectHash(identity),formSha256:form?objectHash(form):null,
  sourceCompleteness:'NATIVE_READABLE_PROPERTIES_ONLY',
  properties:(form?.formProperties??[]).map(p=>({id:p.id,mode:propertyMode(p),
   typed:propertyMode(p)!=='native-text'&&propertyMode(p)!=='read-only',
   native:clone(p),wireType:'string-or-null',omissionAllowed:true,
   ...(p.required?{requiredMeaning:'The original engine checks key presence or its unexposed default expression; it does not require nonempty text.'}:{}),
   ...(p.type==='date'?{dateMeaning:'Original Java datePattern; native server locale/timezone and parser remain authoritative. No browser conversion.'}:{}),
   ...(propertyMode(p)==='native-text'?{notice:'Custom or unsupported form type: exact native text only, with conversion and validation performed by the original engine.'}:{})})),
  notices:[
   'The endpoint omits unreadable properties. No hidden fields or defaults are inferred.',
   'Omitting a property, sending null and sending an empty string are different native requests.',
   'Submitting a task form may complete the original task and advance its process.',
   ...(form?.formKey&&!form.formProperties.length?['This is a form-key-only native response. No modern/custom form schema or external form document is inferred.']:[])
  ]};
}
function validateValue(property,value){
 if(value!==null&&typeof value!=='string')throw fail('FLOWABLE_INPUT_INVALID','Form value '+property.id+' must be an exact string or null; numbers, booleans and dates must not be coerced.');
 if(value===null)return;
 if(Buffer.byteLength(value)>64*1024*1024)throw fail('FLOWABLE_INPUT_INVALID','One original form value exceeds the native request bound.');
 if(property.type==='long'&&value!==''){
  // The guided editor supports decimal signed-long text. It never rounds through JS Number.
  if(!/^[+-]?[0-9]+$/u.test(value))throw fail('FLOWABLE_INPUT_INVALID','Long property '+property.id+' needs signed decimal integer text.');
  const n=BigInt(value);if(n< -9223372036854775808n||n>9223372036854775807n)throw fail('FLOWABLE_INPUT_INVALID','Long property '+property.id+' is outside the original signed 64-bit range.');
 }
 if(property.type==='boolean'&&!['true','false',''].includes(value))throw fail('FLOWABLE_INPUT_INVALID','Boolean property '+property.id+' requires explicit true, false, empty string or null.');
 if(property.type==='enum'&&!property.enumValues.some(o=>o.id===value))throw fail('FLOWABLE_INPUT_INVALID','Enum property '+property.id+' requires an exact original option ID or null.');
 // Date parsing is deliberately left to the original FastDateFormat server.
 // Custom types retain explicit native text; no invented schema or coercion.
}
function buildPlan(connection,input,identity){
 keys(input,['taskId','properties'],'Task-form selection');taskId(input.taskId);validateIdentity(identity);
 if(input.taskId!==identity.taskId||identity.connectionId!==connection.id||identity.connectionSha256!==flowableConnectionSha256(connection))throw fail('FLOWABLE_PLAN_CHANGED','Task-form selection does not match its exact captured task and connection.');
 if(!identity.task||!identity.form)throw fail('FLOWABLE_FORM_UNAVAILABLE','A live original task and native form response are required for form submission.');
 if(!Array.isArray(input.properties))throw fail('FLOWABLE_INPUT_INVALID','Task-form properties must be an explicit ordered array.');
 const byId=new Map(identity.form.formProperties.map(p=>[p.id,p])),seen=new Set(),properties=[],warnings=[];
 for(const row of input.properties){
  keys(row,['id','value'],'Submitted form property');exactText(row.id,'Submitted property ID',8192);
  if(!own(row,'value'))throw fail('FLOWABLE_INPUT_INVALID','A selected form property must explicitly contain value, including null.');
  if(seen.has(row.id))throw fail('FLOWABLE_INPUT_INVALID','A task-form request cannot repeat property ID '+row.id+'.');seen.add(row.id);
  const p=byId.get(row.id);if(!p)throw fail('FLOWABLE_INPUT_INVALID','Property '+row.id+' was not returned in this original captured form; hidden/unknown properties are not inferred.');
  if(!p.writable)throw fail('FLOWABLE_INPUT_INVALID','Property '+row.id+' is read-only in the native form.');
  validateValue(p,row.value);properties.push({id:row.id,value:row.value});
  if(propertyMode(p)==='native-text')warnings.push({code:'CUSTOM_NATIVE_TEXT',propertyId:p.id,type:p.type??null,message:'The original engine owns this custom type conversion.'});
  if(p.type==='date')warnings.push({code:'NATIVE_DATE_PARSE',propertyId:p.id,datePattern:p.datePattern??null,message:'This exact string will be parsed by the original server.'});
 }
 for(const p of identity.form.formProperties)if(p.required&&!seen.has(p.id))warnings.push({code:'REQUIRED_PROPERTY_OMITTED',propertyId:p.id,message:'The original engine will use an unexposed default or reject the missing property; current displayed value is not proof of a default.'});
 if(identity.form.formKey&&!identity.form.formProperties.length)warnings.push({code:'FORM_KEY_ONLY',formKey:identity.form.formKey,message:'No typed properties were returned; no external/custom form content is implied.'});
 const body=Buffer.from(JSON.stringify({taskId:input.taskId,properties}),'utf8');
 if(body.length>64*1024*1024)throw fail('FLOWABLE_INPUT_INVALID','The complete task-form request exceeds 64 MiB.');
 const plan={schema:FLOWABLE_TASK_FORM_REQUEST_SCHEMA,engineVersion:FLOWABLE_NATIVE_VERSION,engineCommit:FLOWABLE_NATIVE_COMMIT,
  connectionId:connection.id,connectionSha256:flowableConnectionSha256(connection),action:'submitTaskForm',taskId:input.taskId,
  selection:{taskId:input.taskId,properties},capturedIdentity:clone(identity),capturedIdentitySha256:objectHash(identity),
  formSnapshot:clone(identity.form),formSha256:objectHash(identity.form),warnings,
  mutation:true,method:'POST',path:PATH,query:{},contentType:'application/json',
  bodyBytes:body.length,bodySha256:hash(body),bodyBase64:body.toString('base64'),
  readback:{taskId:input.taskId,successStatus:204,completionRequiresOriginalHistory:true}};
 plan.requestSha256=objectHash(requestCore(plan));return plan;
}
export function planFlowableTaskFormRequest(connectionInput,input,capturedState){
 return buildPlan(normalizeFlowableConnection(connectionInput),input,flowableTaskFormStateIdentity(capturedState));
}
export function validateFlowableTaskFormPlan(connectionInput,plan){
 const connection=normalizeFlowableConnection(connectionInput);object(plan,'Saved task-form plan');
 if(plan.schema!==FLOWABLE_TASK_FORM_REQUEST_SCHEMA||plan.action!=='submitTaskForm'||canonical(buildPlan(connection,plan.selection,plan.capturedIdentity))!==canonical(plan))throw fail('FLOWABLE_PLAN_CHANGED','The complete saved task-form selection, captured contract or request bytes changed.');
 return plan;
}
export function createFlowableTaskFormTransport(connectionInput,options={}){
 const native=createFlowableTransport(connectionInput,options);
 return Object.freeze({...native,execute:(plan,options={})=>native.request(validateFlowableTaskFormPlan(native.connection,plan),options.signal)});
}
export async function executeFlowableTaskFormRequest(transport,plan,callbacks={}){
 validateFlowableTaskFormPlan(transport.connection,plan);
 return executeFlowableRequest(transport,plan,callbacks);
}
function metadataExchange(v){return{requestSha256:v.requestSha256,request:v.request,status:v.status,ok:v.ok,complete:v.complete,bodyBytes:v.bodyBytes,bodySha256:v.bodySha256,...(v.bodyRef?{bodyRef:v.bodyRef}:{})};}
async function getForm(transport,id,callbacks){
 let full;
 const exchange=await executeFlowableRequest({execute:(spec,options)=>transport.request(spec,options.signal)},
  {method:'GET',path:PATH,query:{taskId:id},mutation:false},
  {...callbacks,onExchange:async v=>{full=v;return typeof callbacks.onExchange==='function'?callbacks.onExchange(v):undefined;}});
 if(!full||!full.complete)throw fail('FLOWABLE_NATIVE_SHAPE_CHANGED','The native task-form endpoint did not return a complete original exchange.',{exchange});
 return{full,exchange};
}
export async function readFlowableTaskFormState(transport,selection,input={}){
 object(selection,'Task-form read selection');
 if(selection.schema===FLOWABLE_TASK_FORM_REQUEST_SCHEMA)validateFlowableTaskFormPlan(transport.connection,selection);
 else keys(selection,['taskId'],'Task-form read selection');
 const id=taskId(selection.taskId),callbacks=captureOptions(input);
 // Reuse the original complete-task reader only as a GET-only readback selector.
 // The fabricated read selector is never executed; every request is guarded GET.
 const readPlan=planFlowableRequest(transport.connection,{action:'complete',taskId:id,bodyText:'{"action":"complete"}'});
 const readOnly=Object.freeze({...transport,request:(spec,signal)=>{
  if(spec.method!=='GET'||spec.mutation)throw fail('FLOWABLE_READ_ONLY','The original task-form reader permits only native GET requests.');
  return transport.request(spec,signal);
 }});
 const {response:ignoredResponse,...readCallbacks}=callbacks;
 const nativeState=await readFlowableRequestState(readOnly,readPlan,readCallbacks);
 const task=nativeState.tasks.find(t=>t.id===id)??null;
 const result=await getForm(readOnly,id,callbacks);
 let form=null;if(result.full.ok)form=validateForm(result.full.json,id);
 const state={schema:FLOWABLE_TASK_FORM_SCHEMA,connectionId:transport.connection.id,
  connectionSha256:flowableConnectionSha256(transport.connection),taskId:id,observedAt:new Date().toISOString(),
  task,form,formStatus:result.full.status,formObservation:metadataExchange(result.exchange),
  availability:task&&form?'AVAILABLE':!task?'TASK_NOT_CURRENT':'NATIVE_FORM_UNAVAILABLE',
  nativeState,resources:nativeState.resources,exchanges:[...nativeState.exchanges,result.exchange],
  atomicSnapshot:false,sourceCompleteness:'NATIVE_READABLE_PROPERTIES_ONLY'};
 flowableTaskFormStateIdentity(state);return state;
}
export async function captureFlowableTaskForm(transport,input={}){
 object(input,'Task-form capture');const {taskId:id,...callbacks}=input;
 return readFlowableTaskFormState(transport,{taskId:id},callbacks);
}
function responseFor(plan,response){
 if(response===undefined||response===null)return null;
 if(!plain(response)||response.connectionId!==plan.connectionId||response.connectionSha256!==plan.connectionSha256||
  response.requestSha256!==plan.requestSha256||response.request?.method!==plan.method||response.request?.path!==plan.path||
  response.request?.bodySha256!==plan.bodySha256||response.request?.bodyBytes!==plan.bodyBytes||
  (response.request?.contentType??null)!==plan.contentType||canonical(response.request?.query??{})!==canonical(plan.query))throw fail('FLOWABLE_RESPONSE_CHANGED','The retained native response does not belong to this exact submitted task form.');
 if(response.bodyBase64!==undefined){
  const bytes=exactBytes(response.bodyBase64,'Original task-form response');
  if(bytes.length!==response.bodyBytes||hash(bytes)!==response.bodySha256)throw fail('FLOWABLE_RESPONSE_CHANGED','Original task-form response bytes changed.');
  if(response.complete){let parsed=null;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}catch{}
   if(canonical(parsed)!==canonical(response.json??null))throw fail('FLOWABLE_RESPONSE_CHANGED','Response JSON differs from its retained original bytes.');
  }
 }else if(!plain(response.bodyRef)||!SHA.test(response.bodyRef.sha256??'')||!Number.isSafeInteger(response.bodyRef.bytes)||response.bodyRef.bytes<0||typeof response.bodyRef.mediaType!=='string')throw fail('FLOWABLE_RESPONSE_CHANGED','The original task-form response has no matching complete retained byte reference.');
 return response;
}
export function reconcileFlowableTaskFormRequest(plan,before,after,responseInput){
 object(plan,'Saved task-form plan');const a=flowableTaskFormStateIdentity(before),b=flowableTaskFormStateIdentity(after);
 for(const state of [a,b])if(state.connectionId!==plan.connectionId||state.connectionSha256!==plan.connectionSha256||state.taskId!==plan.taskId)throw fail('FLOWABLE_STATE_CHANGED','Native form reconciliation belongs to another original task.');
 if(objectHash(a)!==plan.capturedIdentitySha256)throw fail('FLOWABLE_STATE_CHANGED','The original form preparation state differs from the reviewed captured contract.');
 const response=responseFor(plan,responseInput);
 const acknowledged=Boolean(response?.complete&&response.ok&&response.status===204&&response.bodyBytes===0);
 const histories=after.nativeState.historicTasks.filter(t=>t.id===plan.taskId),historic=histories.length===1?histories[0]:null;
 const evidence={requestSha256:plan.requestSha256,taskId:plan.taskId,formSha256:plan.formSha256,
  capturedIdentitySha256:plan.capturedIdentitySha256,nativeAcknowledged:acknowledged,replayAllowed:false,
  response:response?{id:response.id,status:response.status,complete:response.complete,bodySha256:response.bodySha256,bodyBytes:response.bodyBytes}:null,
  taskBefore:a.task,taskAfter:b.task,historicTask:historic,submittedProperties:plan.selection.properties,
  nativeFormAfter:after.formObservation,variableEvidence:after.nativeState.variableEvidence??[]};
 const finish=(state,summary,extra={})=>({schema:'stellar-forge.flowable-task-form-native-reconciliation.v1',state,summary,evidence:{...evidence,...extra}});
 if(response?.complete&&[400,401,403,404,405,409,415,422].includes(response.status))return finish('REJECTED','The original engine rejected this exact task-form request.',{nativeError:response.json??null});
 if(!acknowledged)return finish('UNKNOWN','The original submission response is required; task disappearance or variable coincidence does not authorize a repeat POST.');
 if(b.task===null&&historic&&typeof historic.endTime==='string'&&historic.endTime.length&&[null,undefined,'completed'].includes(historic.deleteReason)&&historic.processInstanceId===a.task?.processInstanceId)return finish('CONFIRMED','The engine acknowledged the exact form submission and its original task is recorded completed.',{confirmation:'ORIGINAL_SUBMISSION_RESPONSE_AND_COMPLETED_TASK_HISTORY'});
 return finish('ACCEPTED','The engine acknowledged the exact form submission; original task and history observations are retained without inventing completion.',{confirmation:'ORIGINAL_SUBMISSION_RESPONSE'});
}
