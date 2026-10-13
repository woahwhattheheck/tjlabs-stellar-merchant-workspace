// MIT. Complete recovery receiving through the original merchant MCP owner.
// The caller supplies its existing product journal and owns both MCP lifetimes.
// call(name, arguments) returns the original decoded tool payload.
// reopenOperator() closes that owned operator, opens its same host configuration,
// and returns the new call function. This module creates no server or journal.
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const insist=(ok,message)=>{if(!ok)throw new Error('SUPPORT_MCP_RECOVERY: '+message);};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const incidentIdentity=row=>({id:row.id,merchantId:row.merchantId,kind:row.kind,status:row.status,
  revision:row.revision,beforeCapture:row.beforeCapture??null,afterCapture:row.afterCapture??null});
const notificationIdentity=row=>({id:row.id,incidentId:row.incidentId,attempts:row.attempts,
  bodyHash:row.bodyHash,attemptId:row.attemptId??null});
const sorted=(rows,select)=>rows.map(select).sort((a,b)=>a.id.localeCompare(b.id));
async function allRows(call,name,key,incidentSource){
  const rows=[];let offset=0,revision=null;
  for(;;){
    const page=await call(name,{incidentSource,offset,limit:100});
    insist(Number.isSafeInteger(page.directoryRevision),'original page revision is missing');
    if(revision===null)revision=page.directoryRevision;
    insist(page.directoryRevision===revision,'the selected original store changed while paging');
    insist(Array.isArray(page[key]),'the original page is incomplete');
    rows.push(...page[key]);
    if(page.nextOffset===null){
      insist(rows.length===page.total,'the complete original collection was not received');
      return {revision,rows};
    }
    insist(Number.isSafeInteger(page.nextOffset)&&page.nextOffset>offset,'the original page cursor did not advance');
    offset=page.nextOffset;
  }
}
async function readSelection(call,incidentSource){
  const profile=await call('merchant_support_profiles',{incidentSource});
  const incidents=await allRows(call,'merchant_incidents','incidents',incidentSource);
  const notifications=await allRows(call,'merchant_notifications','notifications',incidentSource);
  insist(incidents.revision===notifications.revision,'the source changed between original collections');
  return {revision:incidents.revision,configHash:profile.current.configHash,
    configRevision:profile.current.configRevision,configuration:profile.current.configuration,
    incidents:sorted(incidents.rows,incidentIdentity),notifications:sorted(notifications.rows,notificationIdentity)};
}

/**
 * Append to one existing native product journal. The source writer must already
 * be closed through its real owner before originalWriterStopped is supplied.
 * Every mutation request is checkpointed before dispatch and replayed unchanged.
 */
export async function runSupportMcpRecovery({
  call,reopenOperator,incidentSource,snapshotId,receiveId,reconcileId,by,notes='',
  originalWriterStopped,record,checkpoint,
}){
  insist(typeof call==='function'&&typeof reopenOperator==='function','supply the original current and reopened MCP call functions');
  insist(record&&typeof record==='object'&&!Array.isArray(record)&&typeof checkpoint==='function',
    'use a section of the existing native journal and its checkpoint writer');
  insist(typeof incidentSource==='string'&&incidentSource,'select the original configured incident source');
  for(const value of [snapshotId,receiveId,reconcileId])insist(typeof value==='string'&&ID.test(value),'retain original operation names of 1–96 characters');
  insist(originalWriterStopped===true,'finish the original writer through its owner before receiving reconciliation');
  const input={incidentSource,snapshotId,receiveId,reconcileId,by,notes,originalWriterStopped};
  if(record.input)insist(equal(record.input,input),'the original receiving selection changed');
  else record.input=input;
  const note=async phase=>{record.phase=phase;await checkpoint(record,phase);};
  const request=async(key,value)=>{
    record.requests??={};
    if(record.requests[key])insist(equal(record.requests[key],value),'the saved '+key+' request changed');
    else record.requests[key]=value;
    await note(key+' request retained');return record.requests[key];
  };
  try{
    record.state='RUNNING';await note('original recovery selection');
    const sources=await call('merchant_support_incident_sources',{});
    const source=sources.sources.find(row=>row.id===incidentSource);
    insist(source?.recovery?.enabled,'enable a private recovery directory on the existing host source');
    const overview=await call('merchant_support_recovery',{incidentSource,offset:0,limit:20});
    insist(overview.enabled&&overview.workspaceId===source.recovery.workspaceId,'the host recovery workspace changed');
    if(record.workspaceId)insist(record.workspaceId===overview.workspaceId,'the original recovery workspace was replaced');
    else record.workspaceId=overview.workspaceId;
    if(!record.before){
      record.before=await readSelection(call,incidentSource);
      insist(record.before.revision===overview.sourceRevision,'the original source changed before snapshot selection');
      await note('complete original incident and notification selection');
    }
    const snapshotRequest=await request('snapshot',{incidentSource,workspaceId:record.workspaceId,
      operationId:snapshotId,expectedRevision:record.before.revision});
    if(!record.snapshot){
      record.snapshot=await call('merchant_support_recovery_snapshot',snapshotRequest);
      await note('complete original pinned snapshot');
    }
    const inspected=await call('merchant_support_recovery_inspect',{incidentSource,workspaceId:record.workspaceId,
      snapshotName:snapshotId,expectedManifestSha256:record.snapshot.manifestSha256});
    insist(inspected.manifest.operationId===snapshotId&&inspected.manifest.stateRevision===record.before.revision,
      'the original snapshot state identity changed');
    insist(inspected.source.configHash===record.before.configHash,'the original snapshot configuration changed');
    record.snapshot=inspected;await note('all original snapshot members verified');

    const receiveRequest=await request('receive',{incidentSource,workspaceId:record.workspaceId,
      operationId:receiveId,snapshotName:snapshotId,expectedManifestSha256:record.snapshot.manifestSha256});
    record.received=await call('merchant_support_recovery_receive',receiveRequest);
    insist(record.received.receipt.operationId===receiveId&&
      record.received.receipt.manifestSha256===record.snapshot.manifestSha256,
      'the original receiving identity changed');
    await note('complete received original store');
    const openRequest=await request('open',{incidentSource,workspaceId:record.workspaceId,
      receiveName:receiveId,expectedManifestSha256:record.snapshot.manifestSha256});
    let opened=await call('merchant_support_recovery_open',openRequest);
    if(record.receivedSource)insist(record.receivedSource.id===opened.incidentSource.id,'the original received source ID changed');
    record.receivedSource=opened.incidentSource;record.reopen=opened.reopen;
    record.receivedWorkspaceId=opened.workspaceId;
    const receivedId=record.receivedSource.id;
    insist(opened.recovery.id===receiveId&&opened.recovery.manifestSha256===record.snapshot.manifestSha256,
      'the opened store lost its original recovery identity');
    const after=await readSelection(call,receivedId);
    insist(after.configHash===record.before.configHash&&after.configRevision===record.before.configRevision&&
      equal(after.configuration,record.before.configuration),'the received registration changed');
    insist(equal(after.incidents,record.before.incidents),'original incident or capture identities changed');
    insist(equal(after.notifications,record.before.notifications),'original notification or attempt identities changed');
    const ckanIds=after.configuration.merchants.filter(row=>row.ckan).map(row=>row.id).sort();
    const retainedCkan=(record.receivedSource.ckanWorkspaces??[]).map(row=>row.id).sort();
    insist(ckanIds.every(id=>retainedCkan.includes(id)),'the received source lost a named CKAN registration');
    record.receivedSelection={revision:after.revision,configHash:after.configHash,
      incidentIds:after.incidents.map(row=>row.id),notificationIds:after.notifications.map(row=>row.id),
      ckanSourceIds:ckanIds};
    if(after.incidents.length){
      const id=after.incidents[0].id;
      const view=await call('merchant_incident_view',{incidentSource:receivedId,id});
      insist(equal(incidentIdentity(view.incident),after.incidents.find(row=>row.id===id)),
        'the existing incident view selected different retained captures');
      record.incidentView={id,revision:view.incident.revision,routes:view.routes,captureProblems:view.captureProblems};
    }
    await note('received source uses existing profiles incidents and named CKAN selections');

    const current=await call('merchant_support_recovery',{incidentSource:receivedId,offset:0,limit:20});
    insist(current.workspaceId===record.receivedWorkspaceId&&current.recovery?.id===receiveId,
      'the received recovery workspace changed');
    let reconcileRequest=record.requests?.reconcile;
    if(!reconcileRequest){
      insist(current.recovery.originalAttemptsWaiting.length===0,'an original notification attempt has not reached its retained deadline');
      reconcileRequest={incidentSource:receivedId,workspaceId:record.receivedWorkspaceId,operationId:reconcileId,
        expectedRecoveryId:receiveId,expectedManifestSha256:record.snapshot.manifestSha256,
        expectedQueueSha256:current.recovery.queueSha256,expectedConfigHash:current.recovery.configHash,
        originalWriterStopped,by,notes};
    }
    reconcileRequest=await request('reconcile',reconcileRequest);
    record.reconciled=await call('merchant_support_recovery_reconcile',reconcileRequest);
    insist(record.reconciled.operationId===reconcileId,'the original reconciliation operation changed');
    const reconciled=await call('merchant_support_recovery',{incidentSource:receivedId,offset:0,limit:20});
    insist(reconciled.recovery.deliveryPaused===false&&
      reconciled.recovery.reconciled.operationId===reconcileId,'the original reconciliation was not retained');
    record.recovery=reconciled.recovery;await note('original queue and configuration reconciliation retained');

    // Replay receiving after the receiver changed its state. The original engine
    // must preserve that edit rather than rebuilding an initial received state.
    const replay=await call('merchant_support_recovery_receive',receiveRequest);
    insist(replay.reused===true&&replay.receipt.operationId===receiveId,'the original completed receive did not reopen');
    const preserved=await call('merchant_support_recovery',{incidentSource:receivedId,offset:0,limit:20});
    insist(preserved.recovery.reconciled.operationId===reconcileId,'completed receive replay replaced a receiver edit');
    await note('completed receive replay preserves receiver reconciliation');

    call=await reopenOperator();
    insist(typeof call==='function','the original operator did not return its reopened call function');
    opened=await call('merchant_support_recovery_open',record.reopen);
    insist(opened.incidentSource.id===receivedId&&opened.workspaceId===record.receivedWorkspaceId,
      'operator reopen changed the original received source identity');
    insist(opened.recovery.reconciled?.operationId===reconcileId&&opened.recovery.deliveryPaused===false,
      'operator reopen lost the original queue reconciliation');
    const reopened=await readSelection(call,receivedId);
    insist(equal(reopened.configuration,record.before.configuration)&&
      equal(reopened.incidents,record.before.incidents)&&equal(reopened.notifications,record.before.notifications),
      'the reopened original source changed its complete received selection');
    const listed=await call('merchant_support_incident_sources',{});
    insist(listed.sources.some(row=>row.id===receivedId),'the reopened received source is unavailable to existing tools');
    record.reopened={incidentSource:opened.incidentSource,workspaceId:opened.workspaceId,
      revision:reopened.revision,configHash:reopened.configHash,recovery:opened.recovery};
    record.state='COMPLETE';record.completedAt=new Date().toISOString();delete record.error;
    await note('complete original MCP recovery and independent operator reopen');
    return record;
  }catch(error){
    record.state='INTERRUPTED';record.error={code:error.code??null,message:String(error.message??error)};
    try{await note('original recovery continuation retained');}catch{}
    throw error;
  }
}
