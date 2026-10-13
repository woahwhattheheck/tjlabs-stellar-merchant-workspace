// MIT. Operator review of the exact original Flowable request and engine observations.
const ref=(role,reference,extra={})=>reference?{role,reference,...extra}:null;
const summary=state=>state?{
  connectionId:state.connectionId,observedAt:state.observedAt,
  ...Object.fromEntries(['definitions','deployments','processes','historicProcesses','tasks','historicTasks','activities','historicActivities','historicExecutions',
    'cases','planItems','variables','historicCases','historicPlanItems','historicVariables','milestones',
    'jobs','timerJobs','suspendedJobs','deadLetterJobs','historyJobs']
    .map(key=>[key,state.nativeState?.[key]??state[key]??[]])),
  ...(Object.hasOwn(state,'form')?{taskForm:{taskId:state.taskId,task:state.task,form:state.form,formStatus:state.formStatus,formObservation:state.formObservation,availability:state.availability,atomicSnapshot:state.atomicSnapshot}}:{}),
  resources:state.resources??[],exceptionObservations:state.exceptionObservations??[],
}:null;
const exchange=value=>value?{id:value.id,status:value.status,statusText:value.statusText,ok:value.ok,
  bodyBytes:value.bodyBytes,bodySha256:value.bodySha256,
  ...(value.bodyBytes<=1024*1024?{json:value.json,bodyText:value.json==null?value.bodyText:undefined}:{})}:null;
export function buildFlowableReview({record,value,plan,selection,before,preflight,after,validation,response,reconciliation}){
  return{schema:'stellar-forge.flowable-operation-review.v1',record,label:value.label,note:value.note,
    state:value.state,phase:value.phase,preparedAt:value.preparedAt,dispatchedAt:value.dispatchedAt,completedAt:value.completedAt,
    connection:{id:value.connectionId,alias:value.connection?.id,label:value.connection?.label,
      baseUrl:value.connection?.baseUrl,configurationSha256:value.configurationSha256},
    request:plan?{action:plan.action,method:plan.method,path:plan.path,query:plan.query,
      contentType:plan.contentType,bodyBytes:plan.bodyBytes,bodySha256:plan.bodySha256,planSha256:value.planSha256,
      ...(selection?.bodyText?.length<=1024*1024?{bodyText:selection.bodyText}:{}),
      ...(selection?.resource?{resource:{filename:selection.resource.filename,
        contentType:selection.resource.contentType,...value.sourceResource?.reference}}:{}),
      deploymentName:selection?.deploymentName,deploymentKey:selection?.deploymentKey,tenantId:selection?.tenantId,
      processInstanceId:selection?.processInstanceId,taskId:selection?.taskId,
      caseInstanceId:selection?.caseInstanceId,planItemInstanceId:selection?.planItemInstanceId,
      collection:selection?.collection,jobId:selection?.jobId,dueDate:selection?.dueDate,
      ...(selection?.properties?{properties:selection.properties,formSha256:plan.formSha256,formWarnings:plan.warnings??[]}:{}),
      mode:selection?.mode,singleResult:selection?.singleResult}:null,
    ...(value.formCapture?{formCapture:value.formCapture}:{}),
    before:summary(before),preflight:summary(preflight),after:summary(after),validation:exchange(validation),response:exchange(response),
    reconciliation:reconciliation??null,failure:value.failure??null,
    originals:[ref('Captured native task and form',value.formSource),ref('Original form capture journal',value.formCaptureJournal),
      ref('Frozen native request',value.plan),ref('Original request body',value.requestBody),
      ref('Original deployment resource',value.sourceResource?.reference,{filename:value.sourceResource?.filename}),
      ref('Native preimage',value.before),ref('Current native preflight',value.preflight),ref('Native migration validation',value.validation),
      ref('Native response',value.response),ref('Native readback',value.after),ref('Reconciliation',value.reconciliation),
      ref('Original operation journal',value.journal)].filter(Boolean)};
}
