// SPDX-License-Identifier: MIT
import {join} from 'node:path';
import {createPublicHttpsFetch,normalizeBuyerTransport} from '../../sf31-buyer-client/public-transport.mjs';
import {readJson,publishJson,privateDirectory} from '../open-meteo-operations/files.mjs';
import {openStore} from './store.mjs';
import {need,now,newId,digest,sha,envelope,verifyEnvelope,normalizeProject,period,MAX_BODY,MAX_PACKAGE} from './contract.mjs';
import {MAP_CONNECTION,DEFAULT_DASHBOARD_CONNECTION,verifyConnection,dashboardConnection,acquisitionTasks,privateRequest,normalizeCapture,decodeJson,inspectDashboardDefinition} from './source.mjs';
import {reviewReport,freezeReport} from './analysis.mjs';
import {createHandover,inspectHandover,receiveHandover} from './portable.mjs';
import {deliveryFiles,publishDelivery,reopenDelivery,readPublishedDelivery} from './exports.mjs';
import {inspectSourcePacket,inspectSourceSet,sourceProject,retainedTasks,retainedCapture,verifyRetainedCapture} from './source-intake.mjs';

async function bodyBytes(response){
 const reader=response.body?.getReader();if(!reader)return Buffer.alloc(0);const chunks=[];let length=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;need(length<=MAX_BODY,'SOURCE_RESPONSE_TOO_LARGE');chunks.push(Buffer.from(value));}return Buffer.concat(chunks);}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
}
function retryTime(value,retrievedAt){
 if(!value)return null;const n=/^\d+$/.test(value)?Date.parse(retrievedAt)+Number(value)*1000:Date.parse(value);return Number.isFinite(n)?new Date(n).toISOString():null;
}
export async function inspectWorkspace(directory){
 await privateDirectory(directory);const configuration=await readJson(join(directory,'workspace.json'));
 need(configuration.schema==='stellar-forge.airgradient-workspace.v1'&&typeof configuration.workspaceId==='string','INVALID_WORKSPACE_CONFIGURATION');
 return {directory,configuration,configurationSha256:digest(configuration),workspaceId:configuration.workspaceId};
}
export async function openWorkspace(directory,{create=false,network={}}={}){
 const store=await openStore(directory);let configuration;
 try{
  try{configuration=(await inspectWorkspace(directory)).configuration;}
  catch(error){if(!create||error.code!=='ENOENT')throw error;
   const transport=network.trustedProxy?normalizeBuyerTransport(network.trustedProxy):null,routes={};
   for(const [origin,route]of Object.entries(network.routes??{})){
    need(['https://map-data.airgradient.com','https://api.airgradient.com'].includes(origin),'NETWORK_SOURCE_ORIGIN_REQUIRED');
    const trustedProxy=route.trustedProxy?normalizeBuyerTransport(route.trustedProxy):null;
    if(trustedProxy)need(trustedProxy.origin===origin,'NETWORK_PROXY_ORIGIN_CHANGED');
    routes[origin]={...(trustedProxy?{trustedProxy}:{}),...(route.sandboxGatewayIPv4?{sandboxGatewayIPv4:route.sandboxGatewayIPv4}:{})};
   }
   configuration={schema:'stellar-forge.airgradient-workspace.v1',workspaceId:store.workspaceId,createdAt:now(),network:{...(Object.keys(routes).length?{routes}:{}),...(transport?{trustedProxy:transport}:{}),...(network.sandboxGatewayIPv4?{sandboxGatewayIPv4:network.sandboxGatewayIPv4}:{})}};
   await publishJson(join(directory,'workspace.json'),configuration);
  }
  need(configuration.workspaceId===store.workspaceId,'WORKSPACE_ID_CHANGED');if(!store.object('connection',MAP_CONNECTION.id))store.put('connection',MAP_CONNECTION);if(!store.object('connection',DEFAULT_DASHBOARD_CONNECTION.id))store.put('connection',DEFAULT_DASHBOARD_CONNECTION);
 }catch(e){await store.close();throw e;}
 let active=null,closed=false;
 const networkOptions=origin=>{const {routes,...fallback}=configuration.network;return {...(routes?.[origin]??fallback),timeoutMs:60000};};
 const object=(kind,id)=>{const value=store.object(kind,id);need(value,kind.toUpperCase()+'_NOT_FOUND');return value;};
 const connection=id=>verifyConnection(object('connection',id));
 const sourceCache=new Map(),sourceSet=id=>{const value=object('source-set',id);if(!sourceCache.has(value.sha256))sourceCache.set(value.sha256,inspectSourceSet(value));return sourceCache.get(value.sha256);};
 const currentProject=()=>{const id=store.meta('current_project');return id?object('project-revision',id):null;};
 function review(planId){
  const plan=object('plan',planId),project=object('project-revision',plan.projectId),selected=connection(plan.connectionId);
  need(selected.sha256===plan.connectionSha256,'PLAN_CONNECTION_CHANGED');
  return reviewReport({plan,project,connection:selected,tasks:store.tasks(planId),captures:id=>store.capture(id),baseline:plan.baselineReportId?object('report',plan.baselineReportId):null});
 }
 const summarizeReport=report=>({id:report.id,sha256:report.sha256,planId:report.planId,projectId:report.projectId,title:report.title,createdAt:report.createdAt,period:report.period,baselineReportId:report.baselineReportId,readiness:report.readiness,rows:report.rows});
 async function acquire(plan,task,selected){
  const attemptId=store.startAttempt(plan.id,task.key);let status=null,captureId=null;
  try{
   const fetch=createPublicHttpsFetch(networkOptions(selected.origin)),url=privateRequest(task,selected);
   const response=await fetch(url,{method:'GET',headers:{accept:'application/json'},redirect:'manual',signal:active?.controller.signal});status=response.status;
   const raw=await bodyBytes(response),retrievedAt=now(),contentType=response.headers.get('content-type')??'',retryAfter=response.headers.get('retry-after');
   const metadata=envelope('capture',{id:newId('capture'),planId:plan.id,taskKey:task.key,attemptId,requestSha256:task.requestSha256,connectionSha256:selected.sha256,
    sourceUrl:task.url,retrievedAt,status,contentType,retryAfter,retryAt:retryTime(retryAfter,retrievedAt),bytes:raw.length,rawSha256:sha(raw)});
   store.transaction(()=>{store.putCapture(metadata,raw);store.markAttemptResponse(attemptId,{status,captureId:metadata.id});store.setTask(plan.id,task.key,'RUNNING',{captureId:metadata.id});
    if([429,503].includes(status)&&metadata.retryAt)store.setMeta('provider_retry_at:'+selected.origin,metadata.retryAt);});captureId=metadata.id;
   need(status===200,'SOURCE_HTTP_'+status);need(/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType),'SOURCE_JSON_REQUIRED');
   normalizeCapture(raw,task,selected,plan.period);
   store.transaction(()=>{store.finishAttempt(attemptId,{status,captureId});store.setTask(plan.id,task.key,'COMPLETE',{captureId});});
   return {status:'COMPLETE',task:task.key,captureId};
  }catch(error){
   const code=typeof error.code==='string'&&/^[A-Z0-9_]{1,120}$/.test(error.code)?error.code:active?.controller.signal.aborted?'ACQUISITION_INTERRUPTED':'SOURCE_REQUEST_FAILED';
   store.transaction(()=>{store.finishAttempt(attemptId,{status,captureId,error:code});store.setTask(plan.id,task.key,'FAILED',{captureId,error:code});});
   return {status:'FAILED',task:task.key,captureId,error:code,httpStatus:status};
  }
 }
 async function continueAcquisition(planId,{retryFailed=false}={}){
  need(!closed,'WORKSPACE_CLOSED');need(!active,'ACQUISITION_ALREADY_RUNNING');
  const plan=object('plan',planId),selected=connection(plan.connectionId);need(selected.sha256===plan.connectionSha256,'PLAN_CONNECTION_CHANGED');
  need(!plan.sourceSetId,'RETAINED_PLAN_USES_SAVED_SOURCE');
  const controller=new AbortController(),job={id:newId('run'),planId,controller,startedAt:now(),finishedAt:null,results:[]};active=job;
  job.promise=(async()=>{
   try{
    const providerRetryAt=store.meta('provider_retry_at:'+selected.origin);if(providerRetryAt&&Date.parse(providerRetryAt)>Date.now()){job.results.push({status:'RETRY_AT',retryAt:providerRetryAt});return {runId:job.id,planId,results:job.results,tasks:store.tasks(planId)};}
    for(const task of plan.tasks){
     if(controller.signal.aborted)break;store.assert();const state=store.task(planId,task.key);
     if(state?.status==='COMPLETE')continue;if(state&&state.status!=='PENDING'&&!retryFailed)continue;
     if(state?.capture_id){const previous=store.capture(state.capture_id).metadata;
      if(previous.retryAt&&Date.parse(previous.retryAt)>Date.now()){job.results.push({task:task.key,status:'RETRY_AT',retryAt:previous.retryAt});break;}}
     const result=await acquire(plan,task,selected);job.results.push(result);
     if([429,503].includes(result.httpStatus))break;
    }
    return {runId:job.id,planId,results:job.results,tasks:store.tasks(planId)};
   }finally{job.finishedAt=now();active=null;}
  })();return job;
 }
 const api={directory,workspaceId:store.workspaceId,configurationSha256:digest(configuration),store,review,
  state(){return {schema:'stellar-forge.airgradient-workspace-state.v1',workspaceId:store.workspaceId,currentProject:currentProject(),
   connections:store.objects('connection').map(({definition,binding,...v})=>({...v,...(binding?{binding:{...binding,tokenAvailable:Boolean(process.env[binding.tokenEnv])}}:{})})),
   sourceSets:store.objects('source-set').map(v=>sourceSet(v.id).summary),
   projects:store.objects('project-revision'),plans:store.objects('plan').map(p=>({...p,tasks:store.tasks(p.id)})),
   reports:store.objects('report').map(summarizeReport),receiving:store.objects('receiving'),deliveries:store.objects('delivery'),
   pendingDeliveries:store.objects('delivery-request').filter(request=>!store.object('delivery',request.id)),
   active:active?{runId:active.id,planId:active.planId,startedAt:active.startedAt,results:active.results}:null};},
  saveProject(input,{expectedCurrent=null}={}){
   const selected=connection(input.connectionId??MAP_CONNECTION.id),value=normalizeProject({...input,...(selected.kind==='dashboard'&&Array.isArray(input.locations)?{locations:input.locations.map(v=>({...v,sourceType:'dashboard'}))}:{})});if(selected.kind==='dashboard')need(value.measures.every(m=>selected.binding.measures[m]),'MEASURES_NOT_IN_CONNECTION');
   return store.transaction(()=>{const current=currentProject();need((current?.id??null)===expectedCurrent,'PROJECT_CHANGED_REOPEN_CURRENT');
    const record=envelope('project-revision',{id:newId('project'),createdAt:now(),parentId:current?.value.organisation===value.organisation?current.id:null,value});store.put('project-revision',record);store.setMeta('current_project',record.id);return record;});
  },
  selectProject(id){const selected=object('project-revision',id);store.setMeta('current_project',selected.id);return selected;},
  addDashboard(raw,binding){const selected=dashboardConnection(raw,binding);return store.put('connection',selected);},
  inspectSource:input=>inspectSourcePacket(input).summary,
  importSource(input,expectedPacketSha256){const selected=inspectSourcePacket(input);if(expectedPacketSha256)need(selected.record.packetSha256===expectedPacketSha256,'SOURCE_SELECTION_CHANGED');return store.transaction(()=>{store.put('connection',selected.connection);store.put('source-set',selected.record);return selected.summary;});},
  sourceProject(id,input){return sourceProject(sourceSet(id),input);},
  createPlan(input){
   const project=input.projectId?object('project-revision',input.projectId):currentProject();need(project,'SAVE_PROJECT_FIRST');need(input.expectedProjectId===project.id,'PROJECT_CHANGED_REOPEN_CURRENT');
   const selected=connection(project.value.connectionId),window=period(input.period,project.value.bucket);
   need(window.expectedBuckets*project.value.locations.length*project.value.measures.length<=500000,'SELECT_LARGER_BUCKET_FOR_THIS_PERIOD');
   const baseline=input.baselineReportId?object('report',input.baselineReportId):null;
   if(baseline)need(baseline.organisation===project.value.organisation,'BASELINE_ORGANISATION_CHANGED');
   const retained=input.sourceSetId?sourceSet(input.sourceSetId):null;
   const tasks=retained?retainedTasks(project.value,window,selected,retained):acquisitionTasks(project.value,window,selected),record=envelope('plan',{id:newId('plan'),createdAt:now(),projectId:project.id,connectionId:selected.id,connectionSha256:selected.sha256,
    title:typeof input.title==='string'&&input.title.trim()?input.title.trim().slice(0,300):project.value.title,notes:typeof input.notes==='string'?input.notes.slice(0,8000):'',period:window,baselineReportId:baseline?.id??null,...(retained?{sourceSetId:retained.record.id,sourceSetSha256:retained.record.sha256}:{}),tasks});
   return store.transaction(()=>{store.put('plan',record);for(const task of tasks){if(retained){const capture=retainedCapture(record,task,selected,retained);store.putCapture(capture.metadata,capture.raw);store.setTask(record.id,task.key,'COMPLETE',{captureId:capture.metadata.id});}else store.setTask(record.id,task.key,'PENDING');}return record;});
  },
  async run(planId,options){const job=await continueAcquisition(planId,options);return job.promise;},
  async start(planId,options){const job=await continueAcquisition(planId,options);job.promise.catch(()=>{});return {runId:job.id,planId,startedAt:job.startedAt};},
  stop(){if(active)active.controller.abort();return {requested:Boolean(active)};},
  commit(planId,expectedReviewSha){
   const existing=store.object('report','report_'+expectedReviewSha);if(existing){need(existing.planId===planId,'REPORT_SELECTION_CHANGED');return existing;}
   return store.transaction(()=>{const selected=review(planId);need(selected.reviewSha256===expectedReviewSha,'REVIEW_CHANGED_REOPEN_REPORT');const report=freezeReport(selected);return store.put('report',report);});
  },
  report:id=>object('report',id),
  handover:id=>createHandover(store,object('report',id)),
  inspectReceiving:input=>inspectHandover(input),
  receive:input=>receiveHandover(store,input),
  async files(id){return deliveryFiles(object('report',id),createHandover(store,object('report',id)));},
  async deliver(id,destination){
   const report=object('report',id),deliveryId='delivery_'+digest({reportId:id,directory:destination}),previous=store.object('delivery',deliveryId);
   if(previous){await reopenDelivery(previous,report);return previous;}
   let selected=store.object('delivery-request',deliveryId);
   if(!selected){
    const retained=await readPublishedDelivery(destination,report);let files;
    if(retained){
     const inspected=inspectHandover(retained.handoverBytes);need(inspected.root.id===report.id&&inspected.root.sha256===report.sha256,'DESTINATION_CONTAINS_DIFFERENT_EDITION');
     files=retained.files??deliveryFiles(report,inspected.value);
    }else files=await api.files(id);
    const manifest=JSON.parse(files.find(file=>file.name==='manifest.json').bytes.toString('utf8'));
    selected=store.retainDeliveryFiles(envelope('delivery-request',{id:deliveryId,workspaceId:store.workspaceId,createdAt:now(),directory:destination,
     reportId:report.id,reportSha256:report.sha256,packageId:manifest.packageId,packageSha256:manifest.packageSha256,
     files:files.map(file=>({name:file.name,bytes:file.bytes.length,sha256:sha(file.bytes)}))}),files);
   }
   verifyEnvelope(selected,'delivery-request');need(selected.workspaceId===store.workspaceId&&selected.directory===destination&&selected.reportId===report.id&&selected.reportSha256===report.sha256,'DELIVERY_SELECTION_CHANGED');
   const delivered=await publishDelivery(store.retainedDeliveryFiles(deliveryId),destination,report);
   return store.transaction(()=>store.object('delivery',deliveryId)??store.put('delivery',envelope('delivery',{id:deliveryId,completedAt:now(),...delivered})));
  },
  reprocess(planId){
   const plan=object('plan',planId),selected=connection(plan.connectionId),results=[];
   for(const task of plan.tasks){const state=store.task(planId,task.key);if(!state?.capture_id||state.status==='COMPLETE')continue;
    const capture=store.capture(state.capture_id);if(plan.sourceSetId)verifyRetainedCapture(capture.metadata,task,plan);else if(capture.metadata.status!==200)continue;
    try{normalizeCapture(capture.raw,task,selected,plan.period);store.setTask(planId,task.key,'COMPLETE',{captureId:capture.metadata.id});results.push({task:task.key,status:'COMPLETE',captureId:capture.metadata.id});}
    catch(error){results.push({task:task.key,status:'FAILED',error:error.code??'SOURCE_CONTRACT_CHANGED'});}
   }return {planId,results,tasks:store.tasks(planId)};
  },
  async definition(){
   const url='https://api.airgradient.com/public/docs/api/v1/swagger.json',fetch=createPublicHttpsFetch(networkOptions('https://api.airgradient.com'));
   const response=await fetch(url,{method:'GET',headers:{accept:'application/json'},redirect:'manual'}),raw=await bodyBytes(response);need(response.status===200,'SOURCE_HTTP_'+response.status);
   const metadata=envelope('capture',{id:newId('capture'),planId:'definition',taskKey:'dashboard-swagger',attemptId:null,requestSha256:digest({method:'GET',url}),connectionSha256:null,sourceUrl:url,retrievedAt:now(),status:response.status,contentType:response.headers.get('content-type')??'',retryAfter:null,retryAt:null,bytes:raw.length,rawSha256:sha(raw)});
   store.putCapture(metadata,raw);return {metadata,definitionBase64:raw.toString('base64'),inspection:inspectDashboardDefinition(raw)};
  },
  async catalogue(page=1,pagesize=50,sourceType='outdoor'){
   need(Number.isSafeInteger(page)&&page>=1&&Number.isSafeInteger(pagesize)&&pagesize>=1&&pagesize<=100,'INVALID_CATALOGUE_PAGE');
   need(['outdoor','indoor'].includes(sourceType),'PUBLIC_LOCATION_TYPE_REQUIRED');
   const url='https://map-data.airgradient.com/map/api/v1/'+(sourceType==='indoor'?'indoor/':'')+'locations?page='+page+'&pagesize='+pagesize,fetch=createPublicHttpsFetch(networkOptions('https://map-data.airgradient.com'));
   const response=await fetch(url,{method:'GET',headers:{accept:'application/json'},redirect:'manual'}),raw=await bodyBytes(response);need(response.status===200,'SOURCE_HTTP_'+response.status);
   const metadata=envelope('capture',{id:newId('capture'),planId:'catalogue',taskKey:sourceType+'-page-'+page,attemptId:null,requestSha256:digest({method:'GET',url}),connectionSha256:MAP_CONNECTION.sha256,sourceUrl:url,retrievedAt:now(),status:response.status,contentType:response.headers.get('content-type')??'',retryAfter:null,retryAt:null,bytes:raw.length,rawSha256:sha(raw)});
   store.putCapture(metadata,raw);const data=decodeJson(raw);need(Array.isArray(data.data)&&data.page===page&&data.pagesize===pagesize&&data.total===data.data.length,'CATALOGUE_PAGE_CHANGED');
   return {locations:data.data,sourceType,page,pagesize,returned:data.total,hasNext:data.data.length===pagesize,source:metadata};
  },
  async close(){closed=true;if(active){active.controller.abort();await active.promise.catch(()=>{});}await store.close();}
 };return api;
}
