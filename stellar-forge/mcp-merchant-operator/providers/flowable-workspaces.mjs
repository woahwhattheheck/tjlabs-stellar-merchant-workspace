// MIT. Source-selected Flowable workspace merchant provider.
import { defineMerchantProvider,MERCHANT_PROVIDER_SCHEMA } from '../provider-contract.mjs';
import { flowableWorkspaceTools } from '../catalog/flowable-workspace.mjs';
export default defineMerchantProvider({
  schema:MERCHANT_PROVIDER_SCHEMA,id:'flowable-workspaces',family:'flowableWorkspaces',title:'Flowable process, case, decision, native job and commissioning operations',
  order:450,catalogOrder:450,configKey:'flowableWorkspaces',summary:true,dependencies:[],
  concurrentTools:['merchant_flowable_cancel_request','merchant_flowable_export_file_release'],shutdown:'provider',maxRequestBytes:128*1024*1024,
  configuration:{input:'flowableWorkspaceConnection',privateExports:true,
    read:async(value,{hostPath,base})=>(await import('../flowable-workspace.mjs')).readFlowableWorkspaceConfiguration(hostPath(value,base))},
  tools:flowableWorkspaceTools,
  instructions:[{prefix:'merchant_flowable_',order:190,text:
    'Use the declared Flowable workspace and its saved native process and DMN REST engine connections. '+
    'Capture complete deployments, versioned definitions, active processes, human tasks and full history. '+
    'Read original BPMN source and task state before preparing a release, process start, task action or migration. '+
    'For native task forms, capture the exact taskId, read its saved taskFormCapture revision and all original property metadata. '+
    'Prepare taskFormOperation with that captureId/captureRevision and selection {taskId,properties:[{id,value}]}; each value is an exact string or null, with omission represented by an absent row. '+
    'Preserve signed-long digits, Java date text/pattern, exact enum IDs and explicit boolean strings. Read-only and hidden fields are not submitted; a form key alone is not an external form schema. '+
    'Read required-property warnings and the full original source. Submit only through the separate saved review: successful native form submission completes the task. '+
    'A changed captured/current task or form produces STALE. Retain the old draft and capture the actual current source for a new explicit review. '+
    'An uncertain submission retains the original request; use its original result/reconciliation rather than another automatic POST. '+
    'Preserve original native JSON bodyText, including integer values, variable types and process identity. '+
    'Deploy one original BPMN resource or a complete native ZIP/BAR archive through the process connection. '+
    'Use the separately declared original DMN REST base for decision capture, release and evaluation. '+
    'A decision deployment retains one original DMN resource; use the native evaluation body decisionKey, tenantId, parentDeploymentId, typed inputVariables and disableHistory as supplied. '+
    'Read the captured native definition and its current selection before evaluating; the engine resolves its actual decision version. '+
    'Retain complete native results and historic execution audit detail with the same operation and source handover. '+
    'Use the original CMMN REST connection for case deployment, selected case and plan-item actions, human work and history. '+
    'Capture native executable, timer, suspended, dead-letter and history job queues through the original process REST connection. '+
    'Read the captured full job detail and exception availability, retain corrective notes, and prepare only an action exposed for that queue. '+
    'Timer reschedule preserves the exact dueDate string; native moves use the engine job type and configured retries. '+
    'An acknowledged move does not prove execution. Preserve UNKNOWN replies and reconcile the same saved job operation rather than preparing a replacement automatically. '+
    'Receive a complete commissioning programme with its original source bytes and ordered native steps. '+
    'Read current programme progress; prepare a ready step, inspect its returned original operation review and dispatch through that operation. '+
    'Recover a saved preparation through its original programme command and reconcile dispatched native work through its existing record. '+
    'Record the commissioning review against the complete current programme basis; full workspace handover retains every source, attempt and review. '+
    'Prepare each exact native request, read its saved review, and dispatch its record ID, expectedRevision and planSha256 using a stable requestId. '+
    'A migration uses the original target definition and activityMappings document with Flowable native validation. '+
    'Recover an interrupted reply by reading its saved operation and reconciling native current/history state. '+
    'Export complete source, saved revisions, native exchanges and journals; download the whole handover and read its retained file through EOF. '+
    'Large action results remain complete retained files with their exact manifest and source hashes. '+
    'Inspect a declared handover and adopt its returned record revision and manifest SHA into the receiving workspace.'}],
  initialize:options=>(import('../flowable-setup.mjs')).then(module=>module.initializeFlowableWorkspaceMerchant(options)),
  load:()=>import('../flowable-workspace.mjs'),
  create:(module,config,options)=>new module.MerchantFlowableWorkspaces(config,options.flowable),
});
