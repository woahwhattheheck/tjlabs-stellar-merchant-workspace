// MIT. Source-owned tools attach to the existing Rumble application writer.
import {MAX_RETAINED_CHUNK_BYTES} from '../../../../../stellar-forge/mcp-merchant-operator/retained-file-contracts.mjs';
const id={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{1,95}$'};
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'};
const integer=(minimum=0,maximum=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum,maximum});
const text=(maxLength=1024,minLength=0)=>({type:'string',minLength,maxLength});
const read={readOnly:true,idempotent:true}, source={sourceInput:alias,expectedSourceSha256:hash};
export function rumbleWorkspaceTools(tool) {
  const scoped=properties=>({workspace:alias,...properties});
  return [
    tool('merchant_rumble_status','Inspect original configured customer workspaces and their declared inputs, or page the running saved source state.',
      scoped({offset:integer(),limit:integer(1,100),expectedRevision:integer()}),[],read),
    tool('merchant_rumble_connect','Attach to the Applications-owned original listener and authenticate its saved workspace identity.',
      scoped({expectedInstanceId:uuid}),['workspace'],{idempotent:true}),
    tool('merchant_rumble_disconnect','Release this exact client attachment. The existing Applications process retains ownership.',
      scoped({instanceId:uuid}),['workspace','instanceId'],{idempotent:true}),
    tool('merchant_rumble_browser','Open the original private customer browser for this attached instance.',scoped({}),['workspace'],read),
    tool('merchant_rumble_consumer','Read one saved customer book, retained edition history and reviewed publication state.',
      scoped({consumerId:id}),['workspace','consumerId'],read),
    tool('merchant_rumble_edition','Read one complete immutable customer edition with exact source prices and unavailable values.',
      scoped({consumerId:id,editionId:id}),['workspace','consumerId','editionId'],read),
    tool('merchant_rumble_save_consumer','Save the declared complete customer book at its reviewed SHA and current customer revision.',
      scoped({...source,consumerId:id,expectedRevision:integer()}),['workspace','sourceInput','expectedSourceSha256','consumerId','expectedRevision']),
    tool('merchant_rumble_create_edition','Evaluate exactly one retained source run against the saved customer book. Preserve operationId for an exact retry.',
      scoped({consumerId:id,expectedRevision:integer(),sourceRunId:id,operationId:id,name:text(160),note:text(2000)}),
      ['workspace','consumerId','expectedRevision','sourceRunId','operationId'],{idempotent:true}),
    tool('merchant_rumble_review_edition','Publish or reject one existing customer edition using its current customer revision.',
      scoped({consumerId:id,expectedRevision:integer(),editionId:id,decision:{type:'string',enum:['publish','reject']},reviewedBy:text(160,1),note:text(2000)}),
      ['workspace','consumerId','expectedRevision','editionId','decision','reviewedBy']),
    tool('merchant_rumble_configure','Save the declared provider/watchlist settings through the original configuration revision check.',
      scoped({...source,expectedRevision:integer()}),['workspace','sourceInput','expectedSourceSha256','expectedRevision']),
    tool('merchant_rumble_plan','Compile a declared original catalog, price, history or batch request without starting network work.',
      scoped({...source}),['workspace','sourceInput','expectedSourceSha256']),
    tool('merchant_rumble_get_plan','Read the entire retained request plan.',scoped({planId:id}),['workspace','planId'],read),
    tool('merchant_rumble_start','Start one original saved plan through the existing quota-aware provider request runner.',
      scoped({planId:id}),['workspace','planId'],{openWorld:true}),
    tool('merchant_rumble_pause','Pause the current original request runner and retain its exact continuation.',
      scoped({}),['workspace'],{idempotent:true}),
    tool('merchant_rumble_resume','Resume the original retained run with its existing provider attempts and quota state.',
      scoped({runId:id}),['workspace','runId'],{openWorld:true}),
    tool('merchant_rumble_result','Read one original retained response and its request/source identity.',
      scoped({runId:id,taskId:id}),['workspace','runId','taskId'],read),
    tool('merchant_rumble_export','Retain the complete original app/workspace or exact customer JSON/CSV for restartable SHA-bound file reads. Save operationId first; completed retries return the same retained bytes.',
      scoped({operationId:id,kind:{type:'string',enum:['workspace','values','csv']},consumerId:id,editionId:id,expectedRevision:integer()}),
      ['workspace','operationId','kind','expectedRevision'],{idempotent:true}),
    tool('merchant_rumble_exports','List retained complete customer exports.',
      scoped({offset:integer(),limit:integer(1,100)}),['workspace'],read),
    tool('merchant_rumble_file','Read the selected retained customer file with the maintained SHA-bound read protocol.',
      scoped({fileId:hash,readId:uuid,expectedSha256:hash,offset:integer(),limit:integer(1,MAX_RETAINED_CHUNK_BYTES)}),
      ['workspace','fileId'],read),
    tool('merchant_rumble_file_release','Release an unfinished file read while preserving the complete retained file.',
      scoped({readId:uuid}),['workspace','readId'],{idempotent:true}),
    tool('merchant_rumble_receive','Receive a declared complete original delivery into one declared new directory, retaining all source/customer/history files.',
      scoped({...source,destination:alias}),['workspace','sourceInput','expectedSourceSha256','destination'],{idempotent:true}),
    tool('merchant_rumble_received','Inspect the saved receiving record and stable customer workspace identity.',
      scoped({destination:alias}),['workspace','destination'],read),
    tool('merchant_rumble_wallet_receive','Adopt one published customer feed into the declared persistent wallet using the original exact-value receiver; older revisions cannot roll back its current edition.',
      scoped({consumerId:id,editionId:id,wallet:alias,expectedWalletSha256:{anyOf:[hash,{type:'null'}]}}),
      ['workspace','consumerId','wallet','expectedWalletSha256'],{idempotent:true}),
    tool('merchant_rumble_wallet','Read the current declared wallet view and received-edition identities.',
      scoped({wallet:alias}),['workspace','wallet'],read),
  ];
}
