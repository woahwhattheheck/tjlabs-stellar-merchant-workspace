// MIT. Source-owned supplier-account operating tools.
import { MAX_RETAINED_CHUNK_BYTES } from '../retained-file-contracts.mjs';
export const supplierAccountAlias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
export const supplierAccountHash={type:'string',pattern:'^[a-f0-9]{64}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'};
const revision={type:'integer',minimum:0},offset={type:'integer',minimum:0};
const note={type:'string',maxLength:4000};
const source={workspaceId:uuid,sourceSha256:supplierAccountHash,note};
const change={workspaceId:uuid,id:uuid,revision};
const account={type:'object',additionalProperties:false,
  properties:{alias:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{0,79}$'},
    directory:{type:'string',minLength:1,maxLength:4096},account:{type:'string',pattern:'^[A-Za-z0-9_-]{1,80}$'},
    apiKeyEnv:{type:['string','null'],pattern:'^(?:[A-Za-z_][A-Za-z0-9_]{0,127})?$'},
    requestsPerSecond:{type:'integer',minimum:1,maximum:1000},callsPerDay:{type:'integer',minimum:1,maximum:100000000}},
  required:['alias','directory','account','requestsPerSecond','callsPerDay']};
const assignment={type:'object',additionalProperties:false,
  properties:{binding:{type:'string',minLength:1,maxLength:4096},
    account:{type:['string','null'],maxLength:80}},required:['binding','account']};
const fields=value=>({workspace:supplierAccountAlias,...value});
const read={readOnly:true,idempotent:true};
const write={readOnly:false,idempotent:false};
const stable={readOnly:false,idempotent:true};
export function supplierAccountTools(tool){
  return[
    tool('merchant_supplier_account_status','List host-declared supplier-account workspaces and current native handle ownership.',{workspace:supplierAccountAlias},[],read),
    tool('merchant_supplier_account_open','Open the selected original account workspace and retain its workspaceId for subsequent writes.',fields({}),['workspace'],stable),
    tool('merchant_supplier_account_close','Drain accepted work and close this account handle and its retained file descriptors.',fields({}),['workspace'],stable),
    tool('merchant_supplier_account_inputs','List complete host-declared receiving backups with their exact byte lengths and SHA-256 values.',fields({}),['workspace'],read),
    tool('merchant_supplier_account_state','Read current upstream identity, account configuration and original ledger identities. Use history for complete paged reviews.',fields({}),['workspace'],read),
    tool('merchant_supplier_account_history','Read complete original change records in newest-first pages pinned to one history token; continue every nextOffset.',fields({offset,limit:{type:'integer',minimum:1,maximum:200},expectedToken:supplierAccountHash}),['workspace'],read),
    tool('merchant_supplier_account_change','Read one complete native review and current revision by its original change ID.',fields({id:uuid}),['workspace','id'],read),
    tool('merchant_supplier_account_proposal','Read the complete editable account array and binding assignments against the current original source SHA-256.',fields({}),['workspace'],read),
    tool('merchant_supplier_account_prepare','Prepare the complete account configuration and every binding assignment. The original planner retains ledger identities and creates an immutable review.',fields({...source,accounts:{type:'array',maxItems:64,items:account},assignments:{type:'array',items:assignment}}),['workspace','workspaceId','sourceSha256','accounts','assignments'],write),
    tool('merchant_supplier_account_prepare_restore','Prepare restoration of one applied change against the current source, preserving independent later changes.',fields({...source,id:uuid}),['workspace','workspaceId','id','sourceSha256'],write),
    tool('merchant_supplier_account_prepare_rebase','Continue the selected pending or conflicting review against the current source through the original rebase rules.',fields({...source,id:uuid}),['workspace','workspaceId','id','sourceSha256'],write),
    tool('merchant_supplier_account_apply','Save the exact reviewed revision and review SHA once through the original guarded source writer.',fields({...change,reviewSha256:supplierAccountHash}),['workspace','workspaceId','id','revision','reviewSha256'],stable),
    tool('merchant_supplier_account_recover','Recover the same interrupted save from its current native revision and original review SHA; retain its change ID.',fields({...change,reviewSha256:supplierAccountHash}),['workspace','workspaceId','id','revision','reviewSha256'],stable),
    tool('merchant_supplier_account_cancel','Cancel the selected prepared or conflicting change at its exact current revision.',fields(change),['workspace','workspaceId','id','revision'],write),
    tool('merchant_supplier_account_quota','Read the original shared supplier quota snapshots against current account membership.',fields({}),['workspace'],read),
    tool('merchant_supplier_account_export_report','Retain one complete native report under a caller-selected exportId. Repeating that ID returns the same immutable snapshot.',fields({workspaceId:uuid,exportId:supplierAccountAlias}),['workspace','workspaceId','exportId'],stable),
    tool('merchant_supplier_account_export_backup','Retain a complete native receiving backup, including source, reviews and events, under a stable exportId.',fields({workspaceId:uuid,exportId:supplierAccountAlias}),['workspace','workspaceId','exportId'],stable),
    tool('merchant_supplier_account_export_manifest','Inspect the complete immutable report or backup manifest and its SHA-256.',fields({exportId:supplierAccountAlias}),['workspace','exportId'],read),
    tool('merchant_supplier_account_export_file','Read original manifest or payload bytes with exact manifest/file hashes, readId and byte continuation.',fields({exportId:supplierAccountAlias,file:{type:'string',minLength:1,maxLength:240},
      expectedManifestSha256:supplierAccountHash,expectedSha256:supplierAccountHash,readId:{type:'string',minLength:1,maxLength:160},
      offset,limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}}),['workspace','exportId','file','expectedManifestSha256','expectedSha256'],read),
    tool('merchant_supplier_account_export_file_release','Release the original retained read handle for the selected export after an interrupted or completed download.',fields({exportId:supplierAccountAlias,readId:{type:'string',minLength:1,maxLength:160}}),['workspace','exportId','readId'],stable),
    tool('merchant_supplier_account_receive_workspace','Receive the exact host-selected native backup into a new/empty workspace, or replay the same backup preserving later receiving history. Reopens the original handle after receiving.',fields({workspaceId:uuid,inputId:supplierAccountAlias,expectedSha256:supplierAccountHash}),['workspace','workspaceId','inputId','expectedSha256'],stable)
  ];
}
