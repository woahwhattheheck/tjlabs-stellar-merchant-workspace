// MIT. Restore provenance and explicit notification reconciliation for the original SF93 queue.
import {hash} from './incident-config.mjs';

export const RECOVERY_SCHEMA='stellar-forge.seller-incident-recovery.v1';
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const terminal=event=>['DELIVERED','EXHAUSTED','CANCELLED'].includes(event.status);
const ensure=(value,code)=>{if(!value)throw new Error('SF93_'+code);};
const instant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const text=(value,max)=>typeof value==='string'&&Buffer.byteLength(value)<=max&&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)&&Buffer.from(value).toString('utf8')===value;

export function validateRecoveryState(state) {
  if(state.recovery===undefined)return;
  const value=state.recovery;
  ensure(value&&value.schema===RECOVERY_SCHEMA&&ID.test(value.id??'')&&
    SHA.test(value.manifestSha256??'')&&SHA.test(value.sourceStateSha256??'')&&
    instant(value.receivedAt)&&typeof value.deliveryPaused==='boolean','RECOVERY_STATE_INVALID');
  if(value.reconciled!==null) {
    const row=value.reconciled;
    ensure(row&&ID.test(row.operationId??'')&&instant(row.at)&&text(row.by,160)&&row.by.trim()&&
      text(row.notes,2000)&&row.originalWriterStopped===true&&
      SHA.test(row.queueSha256??'')&&SHA.test(row.configHash??'')&&
      value.deliveryPaused===false,'RECOVERY_RECONCILIATION_INVALID');
  } else ensure(value.deliveryPaused===true,'RECOVERY_RECONCILIATION_REQUIRED');
  if(value.history!==undefined) {
    ensure(Array.isArray(value.history)&&value.history.length<=256,'RECOVERY_HISTORY_INVALID');
    const names=new Set();
    for(const row of value.history)ensure(row&&
      /^recovery\/(?:state|manifest|receipt)-[a-f0-9]{64}\.json$/.test(row.path??'')&&
      SHA.test(row.sha256??'')&&row.path.endsWith('-'+row.sha256+'.json')&&
      Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=32*1024*1024&&
      !names.has(row.path)&&names.add(row.path),'RECOVERY_HISTORY_INVALID');
  }
  for(const event of state.notifications)if(event.restoredFrom!==undefined) {
    const row=event.restoredFrom;
    ensure(row&&SHA.test(row.manifestSha256??'')&&
      ['PENDING','RETRY','IN_FLIGHT','PAUSED'].includes(row.status)&&
      Number.isSafeInteger(row.attempts)&&row.attempts>=0&&row.attempts<=event.attempts,
      'RECOVERY_EVENT_PROVENANCE_INVALID');
    if(row.inFlightUntil!==null)ensure(instant(row.inFlightUntil),'RECOVERY_EVENT_DEADLINE_INVALID');
  }
}

export function notificationQueueSha256(state) {
  return hash(JSON.stringify(state.notifications.map(event=>({
    id:event.id,incidentId:event.incidentId,status:event.status,attempts:event.attempts,
    attemptLimit:event.attemptLimit,attemptId:event.attemptId,inFlightUntil:event.inFlightUntil,
    nextAttemptAt:event.nextAttemptAt,bodyHash:event.bodyHash,binding:event.binding,
    notificationConfigHash:event.notificationConfigHash,providerReceipt:event.providerReceipt??null,
    restoredFrom:event.restoredFrom??null
  }))));
}

export function restoredIncidentState(original,{id,manifestSha256,sourceStateSha256,receivedAt}) {
  ensure(ID.test(id??'')&&SHA.test(manifestSha256??'')&&SHA.test(sourceStateSha256??'')&&
    instant(receivedAt),'RECOVERY_SELECTION_INVALID');
  ensure(Number.isSafeInteger(original.revision)&&original.revision<Number.MAX_SAFE_INTEGER,
    'RECOVERY_REVISION_LIMIT');
  const state=structuredClone(original);
  state.revision++;state.updatedAt=receivedAt;
  state.recovery={schema:RECOVERY_SCHEMA,id,manifestSha256,sourceStateSha256,receivedAt,
    deliveryPaused:true,reconciled:null,originalWorker:state.worker??null,
    previousRecovery:state.recovery?{id:state.recovery.id,manifestSha256:state.recovery.manifestSha256,
      receivedAt:state.recovery.receivedAt,reconciled:state.recovery.reconciled}:null};
  state.worker=null;
  // A restored observation is retained history, not a fresh consecutive poll.
  for(const merchant of Object.values(state.merchants)) {
    merchant.previous=null;
    for(const condition of Object.values(merchant.conditions??{})) {
      condition.goodStreak=0;condition.badStreak=0;
    }
  }
  for(const event of state.notifications) {
    if(terminal(event))continue;
    event.restoredFrom={manifestSha256,status:event.status,attempts:event.attempts,
      attemptId:event.attemptId??null,inFlightUntil:event.inFlightUntil??null,
      nextAttemptAt:event.nextAttemptAt??null,lastReason:event.lastReason??null};
    event.status='PAUSED';event.lastReason='RESTORED_NOTIFICATION_REQUIRES_REVIEW';
    // Keep original attempt IDs, deadlines and request bytes. No dispatch happens here.
  }
  for(const incident of state.incidents) {
    const latest=state.notifications.findLast(event=>event.incidentId===incident.id);
    if(latest)incident.notificationState=latest.status;
  }
  validateRecoveryState(state);
  return state;
}

export function recoveryView(state,now=Date.now()) {
  validateRecoveryState(state);
  if(!state.recovery)return null;
  const outstanding=state.notifications.filter(event=>!terminal(event));
  return {...structuredClone(state.recovery),configHash:state.configHash,
    configRevision:state.configRevision,queueSha256:notificationQueueSha256(state),
    notificationCounts:{total:state.notifications.length,
      delivered:state.notifications.filter(event=>event.status==='DELIVERED').length,
      unfinished:outstanding.length,paused:outstanding.filter(event=>event.status==='PAUSED').length},
    originalAttemptsWaiting:outstanding.filter(event=>event.restoredFrom?.inFlightUntil&&
      Date.parse(event.restoredFrom.inFlightUntil)>now).map(event=>({
        eventId:event.id,attempts:event.attempts,until:event.restoredFrom.inFlightUntil})),
    // Current transport bindings are deliberately exposed only through the original sanitized view.
    unfinished:outstanding.map(event=>({id:event.id,incidentId:event.incidentId,status:event.status,
      attempts:event.attempts,originalStatus:event.restoredFrom?.status??null,
      originalInFlightUntil:event.restoredFrom?.inFlightUntil??null,
      lastReason:event.lastReason,bodyHash:event.bodyHash,destinationId:event.binding?.id??null}))
  };
}

export function assertRecoveryDeliveryAllowed(state,event,now=Date.now()) {
  validateRecoveryState(state);
  ensure(!state.recovery?.deliveryPaused,'RECOVERY_RECONCILIATION_REQUIRED');
  ensure(!event?.restoredFrom?.inFlightUntil||Date.parse(event.restoredFrom.inFlightUntil)<=now,
    'RECOVERY_ORIGINAL_ATTEMPT_DEADLINE');
}

export function reconcileRecoveryState(state,input,now=Date.now()) {
  const {operationId,expectedRecoveryId,expectedManifestSha256,expectedQueueSha256,
    expectedConfigHash,originalWriterStopped,by,notes=''}=input??{};
  ensure(ID.test(operationId??'')&&ID.test(expectedRecoveryId??'')&&
    SHA.test(expectedManifestSha256??'')&&SHA.test(expectedQueueSha256??'')&&
    SHA.test(expectedConfigHash??'')&&text(by,160)&&by.trim()&&!/[\r\n\t]/.test(by)&&
    text(notes,2000)&&originalWriterStopped===true,'RECOVERY_RECONCILIATION_INPUT_INVALID');
  validateRecoveryState(state);
  const current=state.recovery;
  ensure(current&&current.id===expectedRecoveryId&&current.manifestSha256===expectedManifestSha256,
    'RECOVERY_SELECTION_CONFLICT');
  const request={operationId,by,notes,originalWriterStopped,queueSha256:expectedQueueSha256,
    configHash:expectedConfigHash};
  if(current.reconciled) {
    const {at,...saved}=current.reconciled;
    ensure(JSON.stringify(saved)===JSON.stringify(request),'RECOVERY_ALREADY_RECONCILED');
    return {...structuredClone(current.reconciled),reused:true};
  }
  ensure(state.configHash===expectedConfigHash&&notificationQueueSha256(state)===expectedQueueSha256,
    'RECOVERY_REVIEW_CHANGED');
  ensure(!recoveryView(state,now).originalAttemptsWaiting.length,'RECOVERY_ORIGINAL_ATTEMPT_DEADLINE');
  // Even events queued while delivery was held require their individual original retry operation.
  for(const event of state.notifications)if(['PENDING','RETRY','IN_FLIGHT'].includes(event.status)) {
    ensure(event.status!=='IN_FLIGHT','RECOVERY_LIVE_ATTEMPT_CONFLICT');
    event.status='PAUSED';event.lastReason='RECOVERY_NOTIFICATION_REQUIRES_OPERATOR_RETRY';
  }
  current.reconciled={...request,at:new Date(now).toISOString()};current.deliveryPaused=false;
  for(const incident of state.incidents) {
    const latest=state.notifications.findLast(event=>event.incidentId===incident.id);
    if(latest)incident.notificationState=latest.status;
  }
  validateRecoveryState(state);
  return {...structuredClone(current.reconciled),reused:false};
}
