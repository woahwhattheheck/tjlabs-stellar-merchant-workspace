// SPDX-License-Identifier: MIT
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { acquireDatasetLease } from '../dataset-refresh/writer-lease.mjs';
import { SCHEMA, LIMITS, SDK_VERSION, SDK_COMMIT, A2AWorkspaceError, fail, sha, id, now, canonical, clone, object, text, identifier, integer, decodeBase64, privateDirectory, objectStore, normalizeConnections, connectionView, publicError, safeName, mediaType, atomicFile, nativeOutputParts } from './foundation.mjs';
import { normalizeAgentCard, normalizeMessageRequest, selectInterface, captureAgentCard, executeA2A, fetchArtifact } from './transport.mjs';
import { encodePacket, decodePacket, makePacket, receiveIntoWorkspace, makeResultPacket } from './portable.mjs';
import { prepareA2APublication } from './merchant.mjs';
import { IDENTITY_SCHEMA, IDENTITY_FILE } from './managed-launch.mjs';
import { COMMISSIONING_ACTIONS, commissioningMessageInput, applyCommissioning, assertCommissioningSend, commissioningView } from './commissioning.mjs';

const NETWORK=new Set(['capture_card','send_message','get_task','list_tasks','subscribe_task','cancel_task','adopt_task','capture_artifacts']);
const parsed=row=>row?JSON.parse(row.body):null;
function chosen(list,key,label='record'){const found=list.find(x=>x.id===key);if(!found)fail('NOT_FOUND',label+' was not found.',404);return found;}
export async function openA2AWorkspace(options) {
  object(options);const directory=privateDirectory(options.directory),lease=await acquireDatasetLease(directory);
  try{return new A2AWorkspace({...options,directory,lease});}catch(error){await lease.close();throw error;}
}
export class A2AWorkspace {
  constructor({directory,operator='Agent service operator',connections=[],lease,fetchImpl=null}) {
    this.directory=directory;this.operator=text(operator,'operator',200);this.lease=lease;this.objects=objectStore(directory);
    this.connections=normalizeConnections(connections);this.credentialValues=[...new Set(this.connections.map(c=>c.credential?process.env[c.credential.env]:null).filter(Boolean))];this.fetchImpl=fetchImpl;this.active=new Map();this.closed=false;
    this.db=new DatabaseSync(join(directory,'workspace.sqlite3'));this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
    this.db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
    const existing=this.db.prepare('SELECT value FROM metadata WHERE key=?').get('workspace_id');
    this.workspaceId=existing?JSON.parse(existing.value):id();if(!existing)this.db.prepare('INSERT INTO metadata VALUES(?,?)').run('workspace_id',canonical(this.workspaceId));
    atomicFile(join(directory,IDENTITY_FILE),Buffer.from(canonical({schema:IDENTITY_SCHEMA,workspaceId:this.workspaceId})));
    // A stopped local caller does not prove a remote mutation did not execute.
    this.transaction(()=>{
      for(const row of this.db.prepare("SELECT * FROM requests WHERE state='running' OR state='prepared'").all()){
        const state=['send_message','cancel_task'].includes(row.action)?'unknown':'interrupted',error={code:'CALLER_INTERRUPTED',message:'The saved original operation has no live local caller. Inspect retained evidence; SendMessage is never automatically replayed.'};
        const project=this.append(row.project_id,'operation_interrupted',{requestId:row.id},p=>{const op=p.operations.find(x=>x.requestId===row.id);if(op){op.state=state;op.error=error;op.finishedAt=now();}});
        this.db.prepare('UPDATE requests SET state=?,error=?,revision=? WHERE id=?').run(state,canonical(error),project.revision,row.id);
      }
    });
  }
  assertOpen(){if(this.closed)fail('WORKSPACE_CLOSED',undefined,409);this.lease.assertHeld();}
  transaction(fn){this.assertOpen();this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  raw(projectId,revision=null) {
    identifier(projectId,'project id');const row=revision==null?this.db.prepare('SELECT * FROM projects WHERE id=?').get(projectId):this.db.prepare('SELECT * FROM history WHERE project_id=? AND revision=?').get(projectId,integer(revision,'revision',1,Number.MAX_SAFE_INTEGER));
    if(!row)fail('PROJECT_NOT_FOUND','The selected project revision does not exist.',404);
    if(sha(row.body)!==row.sha256)fail('CORRUPT_REVISION',undefined,500);return parsed(row);
  }
  append(projectId,kind,payload,mutate) {
    const before=this.raw(projectId),project=clone(before);mutate(project);project.revision=before.revision+1;project.updatedAt=now();
    const body=canonical(project),hash=sha(body),previous=this.db.prepare('SELECT sha256 FROM history WHERE project_id=? AND revision=?').get(projectId,before.revision);
    const event={revision:project.revision,kind,actor:this.operator,at:project.updatedAt,previousSha256:previous.sha256,sha256:hash,payload:clone(payload)};
    this.db.prepare('UPDATE projects SET revision=?,body=?,sha256=? WHERE id=?').run(project.revision,body,hash,projectId);
    this.db.prepare('INSERT INTO history VALUES(?,?,?,?,?)').run(projectId,project.revision,body,hash,canonical(event));return project;
  }
  list(){this.assertOpen();return{schema:SCHEMA,workspaceId:this.workspaceId,sdk:{name:'@a2a-js/sdk',version:SDK_VERSION,commit:SDK_COMMIT},connections:this.connections.map(connectionView),projects:this.db.prepare('SELECT body FROM projects ORDER BY id').all().map(x=>{const p=parsed(x);return{id:p.id,title:p.title,notes:p.notes,revision:p.revision,updatedAt:p.updatedAt,connectionId:p.connectionId,taskCount:new Set(p.observations.filter(x=>x.kind==='task').map(x=>x.value.id)).size,editionCount:p.editions.length,handoffCount:p.handoffs.length};})};}
  publicValue(value){const visit=v=>typeof v==='string'?this.credentialValues.reduce((s,secret)=>s.split(secret).join('[host credential removed]'),v):Array.isArray(v)?v.map(visit):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[visit(k),visit(x)])):v;return visit(value);}
  publicProject(project){
    const p=this.publicValue(project),privateHash=hash=>!!this.db.prepare('SELECT private FROM objects WHERE sha256=?').get(hash)?.private;
    for(const source of p.sources)source.private=privateHash(source.sha256);
    for(const card of p.cards)if(privateHash(card.sha256)){card.private=true;card.card={name:'Private original Agent Card',description:'The source contains a selected host credential and stays in private custody.',supportedInterfaces:[],skills:[]};}
    for(const observation of p.observations)if(privateHash(observation.sha256)){observation.private=true;observation.value={private:true};}
    for(const message of p.messages)if(privateHash(message.sha256)){message.private=true;message.native={message:{messageId:'Private original message',role:'ROLE_USER',parts:[]}};}
    for(const operation of p.operations)if(operation.sourceIds?.some(key=>p.sources.some(s=>s.id===key&&s.private))){operation.private=true;operation.params={private:true};operation.result={private:true};operation.wire=operation.wire.map(w=>({...w,headers:w.headers?{private:'Retained in private source custody'}:null}));}
    return p;
  }
  commissioningContext() { return { read: hash=>this.objects.get(hash), result:(project,editionId)=>makeResultPacket(this,project,editionId,{includePrivate:true}) }; }
  commissioningReport(projectId,{revision=null}={}) { const p=this.get(projectId,{revision}); return {schema:'stellar-forge.a2a-commissioning-report.v1',projectId:p.id,revision:p.revision,historical:p.historical,workspaceId:this.workspaceId,commissioning:p.commissioningView}; }
  get(projectId,{revision=null}={}) {
    this.assertOpen();const project=this.raw(projectId,revision),head=this.db.prepare('SELECT revision FROM projects WHERE id=?').get(projectId).revision;
    return this.publicProject({...project,commissioningView:commissioningView(project,this.commissioningContext()),currentRevision:head,historical:project.revision!==head,localWorkspaceId:this.workspaceId,networkEnabled:project.revision===head&&this.bindingAllowed(project),history:this.db.prepare('SELECT event FROM history WHERE project_id=? AND revision<=? ORDER BY revision').all(projectId,project.revision).map(x=>JSON.parse(x.event))});
  }
  request(requestId){this.assertOpen();identifier(requestId,'requestId');const row=this.db.prepare('SELECT * FROM requests WHERE id=?').get(requestId);if(!row)fail('REQUEST_NOT_FOUND','No retained request exists for this ID.',404);return{id:row.project_id,requestId:row.id,action:row.action,state:row.state,createdAt:row.created,revision:row.revision,result:row.result?JSON.parse(row.result):null,error:row.error?JSON.parse(row.error):null,active:this.active.has(requestId)};}
  response(requestId){const record=this.request(requestId);return{...record,project:this.get(record.id)};}
  bindingAllowed(project){const row=this.db.prepare('SELECT value FROM metadata WHERE key=?').get('connection_binding:'+project.id),c=this.connections.find(x=>x.id===project.connectionId);if(!row||!c)return false;const binding=JSON.parse(row.value);return binding.workspaceId===this.workspaceId&&binding.connectionId===c.id&&binding.sha256===sha(canonical(c));}
  bindLocal(project,connection){this.db.prepare('INSERT INTO metadata VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('connection_binding:'+project.id,canonical({workspaceId:this.workspaceId,connectionId:connection.id,sha256:sha(canonical(connection))}));}
  connection(project) {
    if(!this.bindingAllowed(project))fail('RECEIVED_CONNECTION_REVIEW','Bind a host connection explicitly before continuing a received remote task.',409);
    const connection=this.connections.find(x=>x.id===project.connectionId);if(!connection)fail('CONNECTION_UNAVAILABLE','Configure this connection on the selected host.',409);return connection;
  }
  put(bytes,metadata={}) {
    const ref=this.objects.put(bytes);const isPrivate=metadata.private===true||this.credentialValues.some(value=>Buffer.from(bytes).includes(Buffer.from(value)));
    this.db.prepare('INSERT INTO objects(sha256,bytes,private) VALUES(?,?,?) ON CONFLICT(sha256) DO UPDATE SET private=MAX(private,excluded.private)').run(ref.sha256,ref.bytes,isPrivate?1:0);
    return{...ref,...clone(metadata),private:isPrivate};
  }
  addSource(project,source){const existing=project.sources.find(x=>x.sha256===source.sha256&&x.role===source.role&&x.operationId===source.operationId&&(source.role!=='artifact'||x.filename===source.filename&&x.mediaType===source.mediaType));if(existing){if(source.private)existing.private=true;return existing;}const added={id:id(),createdAt:now(),...source};project.sources.push(added);return added;}
  readSource(projectId,hash,{revision=null,includePrivate=false}={}) {this.assertOpen();const p=this.raw(projectId,revision),source=p.sources.find(x=>x.sha256===hash);if(!source)fail('SOURCE_NOT_IN_REVISION',undefined,404);if(!includePrivate&&this.db.prepare('SELECT private FROM objects WHERE sha256=?').get(hash)?.private)fail('PRIVATE_SOURCE','This original source contains a host credential and requires explicit local private-custody access.',403);const bytes=this.objects.get(hash);return{filename:source.filename??hash,mediaType:source.mediaType??'application/octet-stream',sha256:hash,bytes,metadata:clone(source)};}
  async dispatch(action,payload) {
    this.assertOpen();object(payload);identifier(payload.requestId,'requestId');
    const fingerprint=sha(canonical({action,payload})),prior=this.db.prepare('SELECT * FROM requests WHERE id=?').get(payload.requestId);
    if(prior){if(prior.fingerprint!==fingerprint)fail('REQUEST_ID_CONFLICT','This request ID belongs to different exact input.',409);if(this.active.has(payload.requestId))await this.active.get(payload.requestId).promise;return{...this.response(payload.requestId),replay:true};}
    let prepared=clone(payload);
    if(action==='prepare_message')prepared.normalized=await normalizeMessageRequest({message:payload.message,...(payload.configuration?{configuration:payload.configuration}:{}),...(payload.metadata?{metadata:payload.metadata}:{})});
    if(action==='commission_prepare_job'){const message=commissioningMessageInput(this.raw(payload.id),payload,this.commissioningContext());if(message)prepared.normalized=await normalizeMessageRequest(message);}
    let captured;
    this.transaction(()=>{
      if(this.db.prepare('SELECT id FROM requests WHERE id=?').get(payload.requestId))fail('REQUEST_RACE',undefined,409);
      if(action==='create'){
        const connection=this.connections.find(x=>x.id===payload.connectionId);if(!connection)fail('CONNECTION_UNAVAILABLE',undefined,409);
        const at=now(),p={schema:SCHEMA,id:id(),title:text(payload.title,'title',300),notes:text(payload.notes??'','notes',30000,{empty:true}),revision:1,createdAt:at,updatedAt:at,originWorkspaceId:this.workspaceId,executionWorkspaceId:this.workspaceId,connectionId:connection.id,connection:connectionView(connection),cards:[],selection:null,messages:[],observations:[],operations:[],sources:[],artifactCaptures:[],reviews:[],editions:[],handoffs:[],publications:[]};
        this.bindLocal(p,connection);
        const body=canonical(p),hash=sha(body),event={revision:1,kind:'create',actor:this.operator,at,previousSha256:null,sha256:hash,payload:clone(payload)};
        this.db.prepare('INSERT INTO projects VALUES(?,?,?,?)').run(p.id,1,body,hash);this.db.prepare('INSERT INTO history VALUES(?,?,?,?,?)').run(p.id,1,body,hash,canonical(event));
        this.db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?,?)').run(payload.requestId,p.id,action,fingerprint,canonical(payload),'complete',at,1,canonical({projectId:p.id,revision:1}),null);return;
      }
      const p=this.raw(payload.id);if(p.revision!==payload.expectedRevision)fail('REVISION_CONFLICT','Reload and review the current project before a new action.',409,{expected:payload.expectedRevision,current:p.revision});
      if(NETWORK.has(action)){
        captured=this.prepareNetwork(p,action,prepared);
        const next=this.append(p.id,'operation_prepared',{requestId:payload.requestId,action},draft=>{
          draft.operations.push({id:payload.requestId,requestId:payload.requestId,action,state:'prepared',createdAt:now(),selection:captured.selection??null,params:captured.params??null,wire:[],observationIds:[],sourceIds:[],target:captured.target??null});
          if(action==='send_message')chosen(draft.messages,payload.messageId,'message').sendRequestId=payload.requestId;
        });
        this.db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?,?)').run(payload.requestId,p.id,action,fingerprint,canonical(payload),'prepared',now(),next.revision,null,null);
      }else{
        let result={};const next=this.append(p.id,action,{requestId:payload.requestId},draft=>{result=this.local(draft,action,prepared);});
        this.db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?,?)').run(payload.requestId,p.id,action,fingerprint,canonical(payload),'complete',now(),next.revision,canonical({...result,revision:next.revision}),null);
      }
    });
    if(!captured)return this.response(payload.requestId);
    const controller=new AbortController(),entry={controller,promise:null};
    // Install ownership synchronously before the first network await.
    this.active.set(payload.requestId,entry);
    entry.promise=this.runNetwork(action,prepared,captured,controller).finally(()=>this.active.delete(payload.requestId));
    await entry.promise;return this.response(payload.requestId);
  }
  local(p,action,v) {
    if(COMMISSIONING_ACTIONS.has(action))return applyCommissioning(this,p,action,v,this.commissioningContext());
    if(action==='update'){p.title=text(v.title??p.title,'title',300);p.notes=text(v.notes??p.notes,'notes',30000,{empty:true});return{};}
    if(action==='bind_connection'){const c=this.connections.find(x=>x.id===v.connectionId);if(!c)fail('CONNECTION_UNAVAILABLE');text(v.note,'connection review',10000);if(p.selection){const card=chosen(p.cards,p.selection.cardId);selectInterface(card.card,p.selection.interfaceIndex,c,p.selection.extensions);}p.connectionId=c.id;p.connection=connectionView(c);p.executionWorkspaceId=this.workspaceId;this.bindLocal(p,c);return{connectionId:c.id};}
    if(action==='select_agent'){
      const card=chosen(p.cards,v.cardId,'Agent Card'),connection=this.connection(p),extensions=v.extensions??[];
      const selected=selectInterface(card.card,v.interfaceIndex,connection,extensions);
      if(!Array.isArray(v.skillIds)||!v.skillIds.length||v.skillIds.some(x=>!card.card.skills.some(s=>s.id===x)))fail('SKILL_SELECTION');
      p.selection={id:id(),cardId:card.id,cardSha256:card.sha256,interfaceIndex:v.interfaceIndex,interface:selected,skillIds:[...new Set(v.skillIds)],extensions:[...extensions],reviewedAt:now(),note:text(v.note,'selection review',20000)};
      return{selectionId:p.selection.id};
    }
    if(action==='prepare_message'){
      if(!p.selection)fail('SELECT_AGENT_FIRST',undefined,409);
      if(p.messages.some(x=>x.native.message.messageId===v.normalized.message.messageId))fail('MESSAGE_ID_ALREADY_RETAINED','A native message ID already has reviewed input in this project.',409);
      const source=this.addSource(p,this.put(Buffer.from(canonical(v.normalized)),{role:'reviewed-message',mediaType:'application/json',filename:'message.json',operationId:v.requestId}));
      const record={id:id(),createdAt:now(),native:clone(v.normalized),sha256:source.sha256,sourceId:source.id,selection:clone(p.selection),note:text(v.note,'input review',20000),sendRequestId:null,adoptedTaskId:null};
      p.messages.push(record);return{messageId:record.id,nativeMessageId:record.native.message.messageId};
    }
    if(action==='review_result'){
      const observation=chosen(p.observations,v.observationId,'observation');
      if(!['accepted','needs_work','rejected'].includes(v.decision))fail('REVIEW_DECISION');
      const capture=v.captureId?chosen(p.artifactCaptures,v.captureId):[...p.artifactCaptures].reverse().find(x=>x.observationId===observation.id&&x.complete);
      if(v.decision==='accepted'&&!capture?.complete)fail('COMPLETE_ARTIFACTS_REQUIRED','Retain every output part before accepting this result.',409);
      if(capture&&capture.observationId!==observation.id)fail('CAPTURE_OBSERVATION_MISMATCH');
      const record={id:id(),createdAt:now(),observationId:observation.id,observationSha256:observation.sha256,captureId:capture?.id??null,decision:v.decision,note:text(v.note,'review note',30000)};p.reviews.push(record);return{reviewId:record.id};
    }
    if(action==='freeze_result'){
      const observation=chosen(p.observations,v.observationId),review=[...p.reviews].reverse().find(x=>x.observationId===observation.id);
      if(review?.decision!=='accepted')fail('ACCEPTED_REVIEW_REQUIRED',undefined,409);
      if(observation.kind!=='message'&&(observation.kind!=='task'||observation.value.status?.state!=='TASK_STATE_COMPLETED'))fail('COMPLETED_RESULT_REQUIRED','A paid result edition requires an original completed Task or Message response.',409);
      const capture=chosen(p.artifactCaptures,review.captureId);if(!capture.complete)fail('COMPLETE_ARTIFACTS_REQUIRED');
      const record={id:id(),createdAt:now(),title:text(v.title,'edition title',300),observationId:observation.id,observationSha256:observation.sha256,reviewId:review.id,captureId:capture.id,selection:clone(observation.selection),projectRevision:p.revision+1};
      p.editions.push(record);return{editionId:record.id};
    }
    if(action==='create_handoff'){if(p.operations.some(x=>['prepared','running'].includes(x.state)))fail('OPERATION_ACTIVE','Close the current local capture before freezing a whole workspace.',409);const h={id:id(),createdAt:now(),title:text(v.title,'handoff title',300),notes:text(v.notes??'','handoff notes',30000,{empty:true}),projectRevision:p.revision+1};p.handoffs.push(h);return{handoffId:h.id};}
    if(action==='prepare_publication'){
      const edition=chosen(p.editions,v.editionId,'result edition');
      const result=prepareA2APublication({workspace:this,project:p,edition,input:v});
      p.publications.push(result);return{publicationId:result.id,sha256:result.asset.sha256};
    }
    fail('UNKNOWN_ACTION','This action is not supported.',404);
  }
  prepareNetwork(p,action,v) {
    const connection=this.connection(p);
    if(action==='capture_card')return{connection};
    if(action==='capture_artifacts'){
      const observation=chosen(p.observations,v.observationId),parts=nativeOutputParts(observation);
      if(!parts.length)fail('NO_OUTPUT_PARTS','The selected observation contains no output parts.',409);
      return{connection,observation:clone(observation),parts,target:observation.id};
    }
    let selection=p.selection,params={},method,target=null,message=null;
    if(action==='send_message'||action==='adopt_task'){
      message=chosen(p.messages,v.messageId,'reviewed message');selection=message.selection;
      if(action==='send_message'){assertCommissioningSend(p,message.id);if(message.sendRequestId||message.adoptedTaskId)fail('MESSAGE_ALREADY_ATTEMPTED','Inspect or adopt the original task; a reviewed message is sent at most once.',409);params=clone(message.native);method=v.stream?'sendMessageStream':'sendMessage';}
      else{if(!message.sendRequestId)fail('MESSAGE_NOT_ATTEMPTED');text(v.note,'adoption review',20000);params={id:identifier(v.taskId,'taskId')};method='getTask';target=v.taskId;}
    }else if(action==='list_tasks'){method='listTasks';params={pageSize:integer(v.pageSize??100,'pageSize',1,100),...(v.contextId?{contextId:identifier(v.contextId,'contextId')}:{}),...(v.pageToken?{pageToken:text(v.pageToken,'pageToken',8192)}:{})};}
    else{target=identifier(v.taskId,'taskId');params={id:target};method=action==='get_task'?'getTask':action==='subscribe_task'?'resubscribeTask':'cancelTask';if(action==='cancel_task'){text(v.reason,'cancellation reason',20000);if(!p.observations.some(x=>x.kind==='task'&&x.value.id===target&&x.selection?.id===selection?.id))fail('TASK_NOT_RETAINED','Observe this exact task under the selected agent before cancellation.',409);}}
    if(!selection)fail('SELECT_AGENT_FIRST',undefined,409);
    const card=chosen(p.cards,selection.cardId,'Agent Card');selectInterface(card.card,selection.interfaceIndex,connection,selection.extensions);
    return{connection,selection:clone(selection),card:clone(card.card),params,method,target,message:message?clone(message):null};
  }
  wire(projectId,requestId,event) {
    const body=event.body;const value={...event};delete value.body;
    this.transaction(()=>this.append(projectId,'native_http',{requestId,phase:event.phase,wireId:event.wireId},p=>{
      const op=chosen(p.operations,requestId);
      if(body!==null&&body!==undefined){
        const source=this.addSource(p,this.put(body,{private:event.private===true,role:'native-http-'+event.phase,mediaType:event.phase==='request'?'application/json':event.headers?.['content-type']??'application/octet-stream',filename:requestId+'-'+event.wireId+'-'+event.phase+'.bin',operationId:requestId}));
        value.sourceId=source.id;value.sha256=source.sha256;value.bytes=source.bytes;op.sourceIds.push(source.id);
      }
      op.wire.push(clone(value));if(event.phase==='request')op.dispatchedAt??=event.at;
    }));
  }
  observation(projectId,requestId,event,selection) {
    let record;
    this.transaction(()=>this.append(projectId,'native_observation',{requestId,kind:event.kind},p=>{
      const op=chosen(p.operations,requestId),source=this.addSource(p,this.put(Buffer.from(canonical(event.value)),{role:'native-'+event.kind,mediaType:'application/json',filename:requestId+'-observation.json',operationId:requestId}));
      record={id:id(),createdAt:now(),operationId:requestId,kind:event.kind,value:clone(event.value),sha256:source.sha256,sourceId:source.id,sourceIds:[...new Set(op.sourceIds)],selection:clone(selection)};p.observations.push(record);op.observationIds.push(record.id);
    }));return record;
  }
  async runNetwork(action,v,captured,controller) {
    const duration=['sendMessageStream','resubscribeTask'].includes(captured.method)?captured.connection.streamMs:captured.connection.timeoutMs;
    const timer=setTimeout(()=>controller.abort(new Error('Local capture deadline')),duration);timer.unref?.();
    this.transaction(()=>{this.append(v.id,'operation_started',{requestId:v.requestId},p=>{chosen(p.operations,v.requestId).state='running';});this.db.prepare('UPDATE requests SET state=? WHERE id=?').run('running',v.requestId);});
    let result=null,error=null,terminal='complete';
    try{
      const options={connection:captured.connection,signal:controller.signal,fetchImpl:this.fetchImpl,onWire:event=>this.wire(v.id,v.requestId,event)};
      if(action==='capture_card'){
        const received=await captureAgentCard(options);let cardId;
        this.transaction(()=>this.append(v.id,'card_retained',{requestId:v.requestId},p=>{
          const source=this.addSource(p,this.put(received.bytes,{role:'agent-card',mediaType:'application/json',filename:'agent-card.json',operationId:v.requestId}));
          const card={id:id(),createdAt:now(),url:captured.connection.cardUrl,sha256:source.sha256,sourceId:source.id,card:received.card};p.cards.push(card);cardId=card.id;
        }));result={cardId};
      }else if(action==='capture_artifacts'){
        const files=[];let total=0;
        for(const item of captured.parts){
          controller.signal.throwIfAborted();const part=item.part;let bytes,observedType=null,httpCapture=null;
          if(Object.hasOwn(part,'text'))bytes=Buffer.from(part.text,'utf8');
          else if(Object.hasOwn(part,'raw'))bytes=decodeBase64(part.raw);
          else if(Object.hasOwn(part,'data'))bytes=Buffer.from(canonical(part.data));
          else if(part.url){const requestIndex=chosen(this.raw(v.id).operations,v.requestId).wire.length;const response=await fetchArtifact({...options,url:part.url});bytes=response.bytes;observedType=response.headers['content-type']??null;const wire=chosen(this.raw(v.id).operations,v.requestId).wire;httpCapture={requestIndex,responseIndex:wire.findIndex((event,index)=>index>=requestIndex&&event.phase==='response'),endIndex:wire.length-1};}
          else fail('ARTIFACT_PART_UNSUPPORTED');
          total+=bytes.length;if(bytes.length>LIMITS.artifactBytes||total>LIMITS.editionBytes)fail('ARTIFACT_LIMIT','The complete artifact population exceeds the selected retention limit.');
          let file;this.transaction(()=>this.append(v.id,'artifact_retained',{requestId:v.requestId,artifactId:item.artifactId,index:item.index},p=>{
            const source=this.addSource(p,this.put(bytes,{role:'artifact',mediaType:mediaType(part.mediaType??observedType,typeof part.text==='string'?'text/plain; charset=utf-8':Object.hasOwn(part,'data')?'application/json':'application/octet-stream'),filename:safeName(part.filename,(item.artifactId??'result')+'-'+item.index),operationId:v.requestId}));
            file={artifactId:item.artifactId,name:item.name,index:item.index,sourceId:source.id,sha256:source.sha256,bytes:source.bytes,filename:source.filename,mediaType:source.mediaType,declaredFilename:part.filename??null,declaredMediaType:part.mediaType??null,observedMediaType:observedType,url:part.url??null,httpCapture};
          }));files.push(file);
        }
        let captureId;
        this.transaction(()=>this.append(v.id,'artifacts_complete',{requestId:v.requestId},p=>{const record={id:id(),createdAt:now(),observationId:captured.observation.id,observationSha256:captured.observation.sha256,operationId:v.requestId,files,bytes:total,complete:files.length===captured.parts.length};p.artifactCaptures.push(record);captureId=record.id;}));result={captureId,files:files.length,bytes:total};
      }else{
        result=await executeA2A({...options,card:captured.card,selection:captured.selection,method:captured.method,params:captured.params,onEvent:event=>{this.observation(v.id,v.requestId,event,captured.selection);if(event.kind==='stream'&&event.value?.task)this.observation(v.id,v.requestId,{kind:'task',value:event.value.task},captured.selection);else if(event.kind==='stream'&&event.value?.message)this.observation(v.id,v.requestId,{kind:'message',value:event.value.message},captured.selection);}});
        if(action==='adopt_task'){
          if(result.kind!=='task'||result.value.id!==v.taskId)fail('ADOPTION_TASK_MISMATCH');
          const message=captured.message.native.message,remote=(result.value.history??[]).find(x=>x.messageId===message.messageId);
          if(!remote)fail('ADOPTION_UNPROVEN','The original task history does not contain the exact reviewed message.',409);
          const strip=value=>{const copy=clone(value);if(!message.contextId)delete copy.contextId;if(!message.taskId)delete copy.taskId;return copy;};
          if(canonical(strip(remote))!==canonical(strip(message)))fail('ADOPTION_UNPROVEN','The returned message content differs from the reviewed original.',409);
          this.transaction(()=>this.append(v.id,'task_adopted',{requestId:v.requestId,messageId:v.messageId,taskId:v.taskId,note:v.note},p=>{chosen(p.messages,v.messageId).adoptedTaskId=v.taskId;}));
          result={taskId:v.taskId,nativeMessageId:message.messageId,adopted:true};
        }else result={kind:result.kind,...(result.kind==='task'?{taskId:result.value.id,contextId:result.value.contextId,state:result.value.status?.state??null}:{}),...(result.kind==='message'?{nativeMessageId:result.value.messageId}:{}),...(result.kind==='task_list'?{nextPageToken:result.value.nextPageToken??'',complete:!result.value.nextPageToken}:{}),...(result.kind==='stream'?{events:result.events}:{}),runtime:result.runtime};
      }
    }catch(cause){error=publicError(cause);terminal=['send_message','cancel_task'].includes(action)?'unknown':controller.signal.aborted?'interrupted':'failed';}
    finally{clearTimeout(timer);}
    this.transaction(()=>{const p=this.append(v.id,'operation_finished',{requestId:v.requestId,state:terminal},draft=>{const op=chosen(draft.operations,v.requestId);op.state=terminal;op.finishedAt=now();op.result=result;op.error=error;});this.db.prepare('UPDATE requests SET state=?,result=?,error=?,revision=? WHERE id=?').run(terminal,result?canonical(result):null,error?canonical(error):null,p.revision,v.requestId);});
  }
  stop(requestId){const entry=this.active.get(requestId);if(!entry)return{requestId,active:false};entry.controller.abort(new Error('Operator closed local capture'));return{requestId,active:true,remoteCancellation:false};}
  exportPacket(projectId,options={}) {this.assertOpen();return encodePacket(makePacket(this,projectId,options));}
  exportResult(projectId,editionId,{includePrivate=false}={}) {this.assertOpen();return encodePacket(makeResultPacket(this,this.raw(projectId),editionId,{includePrivate}));}
  receivePacket(bytes,{requestId}) {this.assertOpen();return receiveIntoWorkspace(this,decodePacket(bytes),{requestId,packetSha256:sha(bytes)});}
  async close() {
    if(this.closed)return;for(const {controller}of this.active.values())controller.abort(new Error('Workspace closing'));
    await Promise.allSettled([...this.active.values()].map(x=>x.promise));this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');this.db.close();this.closed=true;await this.lease.close();
  }
}
