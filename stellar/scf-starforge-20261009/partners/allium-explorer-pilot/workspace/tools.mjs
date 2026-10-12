// MIT. Typed operations over the original Allium workspace API.
import {MAX_RETAINED_CHUNK_BYTES} from '../../../../../stellar-forge/mcp-merchant-operator/retained-file-contracts.mjs';
const text=(maximum=96,minimum=1)=>({type:'string',minLength:minimum,maxLength:maximum});
const integer=(minimum=0,maximum=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum,maximum});
const choice=values=>({type:'string',enum:values});
const id={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{1,95}$'};
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'};
const nullableId={anyOf:[id,{type:'null'}]};
const note=text(1024,0), operationId=id, acquisitionId=id, revisionId=id;
const original=(method,description,properties={},required=[],annotations={})=>({method,description,properties,required,annotations});
export const ALLIUM_ACTIONS=Object.freeze({
  restore_product:original('restoreProduct','Restore an earlier original product as a new retained revision, using the current head and the same operation ID on continuation.',
    {operationId,expectedHead:id,revisionId,note},['operationId','expectedHead','revisionId'],{idempotent:true}),
  start_query:original('startQuery','Run the approved saved query through the original Allium transport. It retains the acquisition ID before submission. After a lost response, inspect that acquisition and recover its original run ID.',
    {operationId,revisionId,note},['operationId','revisionId'],{idempotent:true,openWorld:true}),
  resume_query:original('resumeQuery','Continue the original prepared acquisition. The source engine decides whether submission is safe or its actual run ID must be recovered.',
    {acquisitionId},['acquisitionId'],{openWorld:true}),
  collect_query:original('collectQuery','Collect the retained original provider run through its original cursor and limits.',
    {acquisitionId},['acquisitionId'],{openWorld:true}),
  recover_query:original('recoverQuery','Bind the actual Allium run ID to the existing original acquisition and collect it.',
    {acquisitionId,runId:text(240)},['acquisitionId','runId'],{openWorld:true}),
  query:original('query','Run a local typed preview against one complete retained acquisition. Exact decimal strings remain native source values.',
    {acquisitionId,query:text(8192,0)},['acquisitionId'],{readOnly:true,idempotent:true}),
  merchant_stop:original('stopMerchant','Drain the original merchant and publisher for the selected session.',
    {expectedSessionId:id},['expectedSessionId'],{idempotent:true}),
  refresh:original('refresh','Publish a retained acquisition through the original version store with its exact current snapshot and revision.',
    {acquisitionId,expectedSnapshot:hash,expectedRevision:integer()},['acquisitionId','expectedSnapshot','expectedRevision']),
  activate:original('activate','Activate an original retained snapshot using the native snapshot and revision checks.',
    {snapshot:hash,expectedSnapshot:hash,expectedRevision:integer()},['snapshot','expectedSnapshot','expectedRevision']),
  collect_versions:original('collectVersions','Run the original configured dataset retention collection. Only the source owner selects expired versions.'),
  publisher:original('openPublisher','Open the original publisher belonging to the running merchant session. Its browser retains candidate and buyer configuration workflows.'),
  stage_publisher:original('stageForPublisher','Stage the exact original acquisition and provenance in the original publisher, retaining its candidate and operation IDs.',
    {operationId,acquisitionId},['operationId','acquisitionId'],{idempotent:true}),
});
export function alliumWorkspaceTools(tool) {
  const scoped=properties=>({workspace:alias,...properties}), read={readOnly:true,idempotent:true};
  const input={sourceInput:alias,expectedSourceSha256:hash};
  const tools=[
    tool('merchant_allium_status','List configured original workspaces, reviewed inputs and merchant profiles, or read a connected workspace with paged original history.',
      scoped({offset:integer(),limit:integer(1,200),expectedRevision:integer()}),[],read),
    tool('merchant_allium_connect','Connect to the same original Allium instance launched by Applications and authenticate its stable workspace ID.',
      scoped({expectedInstanceId:uuid}),['workspace'],{idempotent:true}),
    tool('merchant_allium_disconnect','Release this attachment and its file reads for the exact instance. Applications owns the original server lifecycle.',
      scoped({instanceId:uuid}),['workspace','instanceId'],{idempotent:true}),
    tool('merchant_allium_browser','Open the private original browser for this connected workspace.',
      scoped({}),['workspace'],read),
    tool('merchant_allium_revision','Read an original saved product revision and its full query declaration.',
      scoped({revisionId}),['workspace','revisionId'],read),
    tool('merchant_allium_acquisition','Read an original acquisition, provider run identity, result provenance and native dataset.',
      scoped({acquisitionId}),['workspace','acquisitionId'],read),
    tool('merchant_allium_save_product','Save a complete host-declared product JSON file at its reviewed SHA through the original product compiler and head check.',
      scoped({operationId,expectedHead:id,...input,note}),['workspace','operationId','expectedHead','sourceInput','expectedSourceSha256'],{idempotent:true}),
    tool('merchant_allium_import_result','Import complete original result bytes from a host-declared file into the selected saved product revision.',
      scoped({operationId,revisionId,...input,note}),['workspace','operationId','revisionId','sourceInput','expectedSourceSha256'],{idempotent:true}),
    tool('merchant_allium_configure','Configure the native dataset merchant from a retained acquisition and host-reviewed origin, path, payment terms and retention profile.',
      scoped({operationId,acquisitionId,expectedConfigurationId:nullableId,profile:alias}),
      ['workspace','operationId','acquisitionId','expectedConfigurationId','profile'],{idempotent:true}),
    tool('merchant_allium_merchant_start','Start the original current merchant configuration with a host-reviewed launch profile. The original host owns seller and publisher shutdown.',
      scoped({expectedConfigurationId:id,profile:alias}),['workspace','expectedConfigurationId','profile'],{openWorld:true}),
    tool('merchant_allium_download','Retain an exact original acquisition file and its SHA for customer download and restartable chunk reads.',
      scoped({acquisitionId,kind:choice(['result','source','csv','dataset','run'])}),['workspace','acquisitionId','kind'],{idempotent:true}),
    tool('merchant_allium_export','Export the complete original workspace, stopping its merchant and publisher first. Retain operationId before calling; an exact completed retry reopens the same exported bytes.',
      scoped({operationId,expectedRevision:integer()}),['workspace','operationId','expectedRevision'],{idempotent:true}),
    tool('merchant_allium_exports','List complete retained customer exports and original acquisition downloads.',
      scoped({offset:integer(),limit:integer(1,200)}),['workspace'],read),
    tool('merchant_allium_file','Read a retained customer file in SHA-bound chunks. Continue its readId, expectedSha256 and nextOffset, or reopen the same retained file after restart.',
      scoped({fileId:hash,readId:uuid,expectedSha256:hash,offset:integer(),limit:integer(1,MAX_RETAINED_CHUNK_BYTES)}),
      ['workspace','fileId'],read),
    tool('merchant_allium_file_release','Release one unfinished retained file read. The complete customer file remains available.',
      scoped({readId:uuid}),['workspace','readId'],{idempotent:true}),
    tool('merchant_allium_receive','Receive one complete host-declared original workspace export into a declared new destination. The native importer verifies all files, retains history and rebinds the original publisher directory.',
      scoped({...input,destination:alias}),['workspace','sourceInput','expectedSourceSha256','destination'],{idempotent:true}),
    tool('merchant_allium_received','Inspect a declared receiving destination and its original import history before attaching it through Applications.',
      scoped({destination:alias}),['workspace','destination'],read),
  ];
  for(const [name,definition] of Object.entries(ALLIUM_ACTIONS))
    tools.push(tool('merchant_allium_'+name,definition.description,scoped(definition.properties),
      ['workspace',...definition.required],definition.annotations));
  return tools;
}
