// MIT. Complete commissioning tools over the original workspace and native operation IDs.
import {operatingTools} from './operating-catalog.mjs';
import {MAX_RETAINED_CHUNK_BYTES} from '../../stellar-forge/mcp-merchant-operator/retained-file-contracts.mjs';
const alias={type:'string',pattern:'^[a-z][a-z0-9_-]{0,63}$'},id={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'};
const digest={type:'string',pattern:'^[a-f0-9]{64}$'},revision={type:'integer',minimum:0};
const text={type:'string',minLength:1,maxLength:2000},relative={type:'string',minLength:1,maxLength:2048};
const selected={workspace:alias},mutation={...selected,requestId:uuid,expectedRevision:revision};
const read={readOnly:true,idempotent:true},write={idempotent:true};
const operationInput={type:'object',additionalProperties:false,properties:{
 resumeOf:id,select:{type:'array',items:text,maxItems:100},exclude:{type:'array',items:text,maxItems:100},
 vars:{type:'object'},threads:{type:'integer',minimum:1,maximum:8},name:{type:'string',minLength:1,maxLength:100},
 expiresInHours:{type:'integer',minimum:1,maximum:720},skipCopyContent:{type:'boolean'},
 warehouseCredentials:{enum:['copy-upstream','profiles']},previewProjectUuid:uuid,startOperationId:id,projectUuid:uuid,
 severity:{enum:['error','warning']},only:{type:'array',items:{enum:['tables','charts','dashboards','apps']},minItems:1},
 applySpaceAccess:{type:'boolean'},chartPath:relative,limit:{type:'integer',minimum:1,maximum:5000},
 pageSize:{type:'integer',minimum:1,maximum:5000}
}};
export function lightdashTools(tool){return [
 ...operatingTools(tool),
 tool('merchant_lightdash_workspaces','List configured commissioning workspaces, host input aliases, stable workspace IDs and current browser ownership. No provider or workspace is opened.',{},[],read),
 tool('merchant_lightdash_open','Open the existing original commissioning workspace and its browser once. MCP and browser share the same SQLite, source editions, native operation map and shutdown lifetime.',selected,['workspace'],write),
 tool('merchant_lightdash_close','Drain this exact owned browser, MCP calls, native operations, packaging and retained reads before closing SQLite and releasing its workspace lease.',{...selected,instanceId:uuid},['workspace','instanceId'],{destructive:true,idempotent:true}),
 tool('merchant_lightdash_status','Read the complete current original workspace state and pending operation IDs. Does not refresh any provider job.',selected,['workspace'],read),
 tool('merchant_lightdash_inputs','List declared connection/source aliases, or inspect the complete source manifest and all original files for one input. Credentials and private paths are omitted.',{...selected,input:alias},['workspace'],read),
 tool('merchant_lightdash_configure','Select a host-declared private connection and source settings, or explicitly detach the current connection. Uses the original revision and saves the transport request before the native workspace mutation.',{...mutation,connection:{anyOf:[alias,{type:'null'}]},label:text},['workspace','requestId','expectedRevision','connection'],write),
 tool('merchant_lightdash_intake','Capture the complete declared original source into an immutable workspace edition with the SAME original operation ID. Verify its exact manifest before and after intake; no provider read occurs.',{...mutation,input:alias,expectedManifestSha256:digest,operationId:id,label:text,note:text},['workspace','requestId','expectedRevision','input','expectedManifestSha256','operationId'],write),
 tool('merchant_lightdash_manifest','Read the complete original edition or current selected draft inventory, including source paths, bytes and hashes.',{...selected,editionId:uuid,draft:{type:'boolean'},expectedDraftId:uuid},['workspace'],read),
 tool('merchant_lightdash_select','Select original baseline and working edition IDs with the current revision. Existing native plans retain their original editions.',{...mutation,baselineId:uuid,selectedId:uuid},['workspace','requestId','expectedRevision'],write),
 tool('merchant_lightdash_draft_create','Create a saved SQLite draft over an existing immutable original edition. No native dbt or Lightdash work runs.',{...mutation,editionId:uuid},['workspace','requestId','expectedRevision','editionId'],write),
 tool('merchant_lightdash_draft_select','Reopen one existing original draft by its ID without replacing other drafts.',{...mutation,draftId:uuid},['workspace','requestId','expectedRevision','draftId'],write),
 tool('merchant_lightdash_draft_edit','Save a complete original YAML/SQL/text file edit or removal against the selected draft, file hash and workspace revision. The original model owns the draft and source rules.',{...mutation,path:relative,content:{type:'string',maxLength:4194304},remove:{type:'boolean'},expectedFileSha256:{anyOf:[digest,{type:'null'}]},expectedDraftId:uuid},['workspace','requestId','expectedRevision','path','expectedDraftId'],write),
 tool('merchant_lightdash_seal','Seal the selected saved draft as a complete immutable original source edition, retaining the full base inventory and exact changes.',{...mutation,label:text,note:text,expectedDraftId:uuid},['workspace','requestId','expectedRevision','label','expectedDraftId'],write),
 tool('merchant_lightdash_compare','Compare the complete original baseline and candidate source inventories; return all changed files and their exact hashes.',{...selected,baselineId:uuid,candidateId:uuid},['workspace','baselineId','candidateId'],read),
 tool('merchant_lightdash_review','Save the explicit original source review, reviewer, note and decisions against the current revision. This is engineering review, not customer acceptance.',{...mutation,baselineId:uuid,candidateId:uuid,reviewedBy:text,note:text,decisions:{type:'array',maxItems:10000}},['workspace','requestId','expectedRevision','baselineId','candidateId','reviewedBy','note','decisions'],write),
 tool('merchant_lightdash_plan','Prepare an original dbt/Lightdash operation with an explicit edition, provider project/owned preview, exact native effects and runtime identity. Upload content is selected only from an original edition subdirectory or complete native download, never an arbitrary host path.',{
 ...selected,operationId:id,action:{enum:['inspect','run-chart','dbt-deps','dbt-build','compile','start-preview','stop-preview','validate','deploy','download','upload']},
 editionId:uuid,expectedRevision:revision,input:operationInput,
 content:{type:'object',additionalProperties:false,properties:{kind:{enum:['edition','download']},directory:relative,operationId:id,manifestSha256:digest},required:['kind']}
 },['workspace','operationId','action','editionId','expectedRevision'],{idempotent:true,openWorld:true}),
 tool('merchant_lightdash_operation','Read an original saved operation, exact input, native state and current pending flag. Does not dispatch or refresh the provider.',{...selected,operationId:id},['workspace','operationId'],read),
 tool('merchant_lightdash_execute','Execute the exact already saved original plan. Returns accepted state while its one original native lifetime runs. Lost responses are reconciled through operation/inspect; this call does not select a new plan.',{...selected,operationId:id,expectedRequestSha256:digest},['workspace','operationId','expectedRequestSha256'],{idempotent:true,openWorld:true,destructive:true}),
 tool('merchant_lightdash_inspect','Explicitly reconcile the SAME original native operation/job/query through its maintained inspection. Historical detached results remain retained when private native journals are absent; no mutation is replayed.',{...selected,operationId:id,expectedRequestSha256:digest},['workspace','operationId','expectedRequestSha256'],{idempotent:true,openWorld:true}),
 tool('merchant_lightdash_content','List original complete chart/dashboard/space downloads for one native operation. Returns original source-project, request and manifest hashes without private storage paths.',{...selected,operationId:id},['workspace','operationId'],read),
 tool('merchant_lightdash_handover_create','Durably select the original SQLite revision and full application source before accepting one handover UUID. Default output has native content and a detached connection; private diagnostics require host permission and explicit selection.',{...selected,handoverId:uuid,expectedRevision:revision,includeOperatorPrivate:{type:'boolean'}},['workspace','handoverId','expectedRevision'],write),
 tool('merchant_lightdash_handover_status','Read the original handover selection, complete result and current packaging state, without restarting it.',{...selected,handoverId:uuid},['workspace','handoverId'],read),
 tool('merchant_lightdash_handover_inspect','Inspect/adopt the complete original handover or complete staged archive using the SAME UUID and original selected revision.',{...selected,handoverId:uuid},['workspace','handoverId'],write),
 tool('merchant_lightdash_handover_resume','Continue the SAME original handover UUID and immutable selected SQLite basis. Never choose a newer workspace revision for a retained request.',{...selected,handoverId:uuid},['workspace','handoverId'],write),
 tool('merchant_lightdash_file_read','Receive one complete original source file, native artifact, handover ZIP or exact original handover request using the maintained retained readId/SHA256/byte-offset protocol. Default artifacts exclude operator-private files.',{
 ...selected,kind:{enum:['source','artifact','handover','handover-request']},editionId:uuid,draft:{type:'boolean'},expectedDraftId:uuid,path:relative,
 operationId:id,artifactId:id,handoverId:uuid,includeOperatorPrivate:{type:'boolean'},readId:uuid,expectedSha256:digest,
 offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}
 },['workspace','kind','offset','limit'],read),
 tool('merchant_lightdash_file_release','Release this original retained file-read handle after receiving or abandoning its complete bytes.',{...selected,readId:uuid},['workspace','readId'],write),
 tool('merchant_lightdash_request','Read the original transport request/result after a lost source-edit response. An uncertain original mutation is observed with the current native state, never repeated automatically.',{...selected,requestId:uuid},['workspace','requestId'],read)
];}
