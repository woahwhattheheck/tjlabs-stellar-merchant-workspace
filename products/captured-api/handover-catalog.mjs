// MIT. Metadata for the original captured product's complete handover operations.
export const HANDOVER_SHA=/^[a-f0-9]{64}$/;
export const HANDOVER_ALIAS=/^[a-z0-9][a-z0-9_-]{0,63}$/;
export const HANDOVER_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const HANDOVER_NAME=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const sha={type:'string',pattern:HANDOVER_SHA.source};
const alias={type:'string',pattern:HANDOVER_ALIAS.source};
const uuid={type:'string',pattern:HANDOVER_UUID.source};
const name={type:'string',pattern:HANDOVER_NAME.source};
const label={type:'string',minLength:1,maxLength:160};
const scope={workspace:alias,expectedProductId:sha};
const requiredScope=['workspace','expectedProductId'];
const page={offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}};
const snapshot={...page,expectedSnapshot:sha};
const read={readOnly:true,idempotent:true};
const write={idempotent:true};
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const sourceSelection=object({kind:{type:'string',enum:['capture','refresh']},id:sha,revision:sha},['kind','id']);
const names={type:'object',propertyNames:name,additionalProperties:name,maxProperties:1000};
const packageSelection=object({name,manifestSha256:sha});
const jobRequest={oneOf:[
  ...['PREPARE','INSPECT','REVIEW'].map(command=>object({
    id:uuid,command:{type:'string',enum:[command]},draftId:uuid,revision:sha,
  })),
  ...['PUBLISH','RECEIVE'].map(command=>object({
    id:uuid,command:{type:'string',enum:[command]},sourceJob:uuid,reviewSha256:sha,
  })),
  object({id:uuid,command:{type:'string',enum:['IMPORT']},uploadId:uuid}),
  object({id:uuid,command:{type:'string',enum:['REOPEN']},operationId:sha}),
]};
const archive={id:uuid,expectedSha256:sha,expectedBytes:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}};
const requiredArchive=['id','expectedSha256','expectedBytes'];

/** Catalog loading imports no browser, filesystem publisher or provider runtime. */
export function capturedHandoverTools(tool) {
  return [
    tool('merchant_handover_workspaces','List existing declared HAR workspace aliases for the captured product handover companion. Inspect info to select its original product identity.',{},[],read),
    tool('merchant_handover_info','Open the selected original captured product connection and read its product identity, project directory and active jobs. Repeat expectedProductId to bind a known product.',scope,['workspace'],read),
    tool('merchant_handover_inventory','Page the original saved merchant packages or captured/refresh sources. Keep the returned snapshot, package manifest hashes and source review revisions for a complete collection selection.',{...scope,view:{type:'string',enum:['summary','packages','sources']},...snapshot},requiredScope,read),
    tool('merchant_handover_drafts','Page the original saved outgoing and receiving drafts after browser or agent restart.',{...scope,kind:{type:'string',enum:['OUTGOING','RECEIVING']},...page},requiredScope,read),
    tool('merchant_handover_draft','Read an immutable saved draft edition, its complete form, or paged history/package/source/name rows. Form views preserve every original selection for a full edit.',{...scope,id:uuid,revision:sha,view:{type:'string',enum:['summary','form','history','packages','sources','names']},...snapshot},[...requiredScope,'id'],read),
    tool('merchant_handover_draft_create','Create or recover one original outgoing or receiving draft using the same retained UUID, kind and label.',{...scope,id:uuid,kind:{type:'string',enum:['OUTGOING','RECEIVING']},label},[...requiredScope,'id','kind','label'],write),
    tool('merchant_handover_selection_save','Save the complete outgoing selection against its exact draft revision. Supply every selected package with its native manifest hash and the original capture/refresh review selections; retain requestId for replay.',{...scope,id:uuid,requestId:uuid,expectedRevision:sha,label,
      packages:{type:'array',items:packageSelection,maxItems:1000},
      sources:{type:'array',items:sourceSelection,maxItems:1000}},
    [...requiredScope,'id','requestId','expectedRevision','label','packages','sources'],write),
    tool('merchant_handover_receiving_save','Save a complete receiving form from this workspace’s completed original IMPORT job and exact handover manifest. Uses the retained native collection directory and complete receiving-name map.',{...scope,id:uuid,requestId:uuid,expectedRevision:sha,label,importJob:uuid,expectedManifestSha256:sha,names},
    [...requiredScope,'id','requestId','expectedRevision','label','importJob','expectedManifestSha256','names'],write),
    tool('merchant_handover_jobs','Page retained original handover jobs, exact request hashes and current native completion after restart.',{...scope,...page},requiredScope,read),
    tool('merchant_handover_job','Read the original job request/status or page native receiving package/source/name results. Selection shows its complete retained draft form; document pages show the published collection.',{...scope,id:uuid,view:{type:'string',enum:['summary','selection','packages','sources','names']},...snapshot},[...requiredScope,'id'],read),
    tool('merchant_handover_job_start','Start or replay the exact native PREPARE, INSPECT, REVIEW, PUBLISH, IMPORT, RECEIVE or REOPEN request. Review before PUBLISH/RECEIVE and carry the returned exact review SHA; poll the saved ID.',{...scope,request:jobRequest},[...requiredScope,'request'],write),
    tool('merchant_handover_job_resume','Continue the same retained interrupted native job using its original UUID and request SHA. Completed original jobs return their original result.',{...scope,id:uuid,requestSha256:sha},[...requiredScope,'id','requestSha256'],write),
    tool('merchant_handover_document','Page complete original collection review/manifest packages, source histories and member files from a finished job. The native reader verifies its retained whole document SHA.',{...scope,id:uuid,view:{type:'string',enum:['summary','packages','sources','files']},...page},[...requiredScope,'id'],read),
    tool('merchant_handover_uploads','Page original receiving uploads, durable offsets and any interrupted exact chunk.',{...scope,...page},requiredScope,read),
    tool('merchant_handover_upload_status','Reopen one original upload by its retained UUID; COMPLETE includes the verified whole archive identity ready for native IMPORT.',{...scope,id:uuid},[...requiredScope,'id'],read),
    tool('merchant_handover_archive','Read the complete immutable archive identity from the original COMPLETE PUBLISH job. These original bytes carry every selected package, source and immutable review.',{...scope,...archive},[...requiredScope,...requiredArchive],read),
    tool('merchant_handover_archive_read','Read up to 64 KiB of the exact original archive through authenticated native Range streaming. Returns base64 bytes, offset, chunk SHA and nextOffset; use transfer for a complete collection.',{...scope,...archive,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:65536}},[...requiredScope,...requiredArchive],read),
    tool('merchant_handover_transfer','Stream the complete original published archive directly from another declared workspace into this receiving product. Retain uploadId and both product/file identities; identical replay resumes the native pending chunk and completes its whole-file hash before IMPORT.',{...scope,fromWorkspace:alias,fromProductId:sha,...archive,uploadId:uuid},
    [...requiredScope,'fromWorkspace','fromProductId',...requiredArchive,'uploadId'],write),
    tool('merchant_handover_received','Page original receiving operations after restart. Use REOPEN with the selected operationId to inspect native files, then merchant_har_load to open its saved merchant and exact captured source.',{...scope,...page},requiredScope,read),
  ];
}
export const CAPTURED_HANDOVER_TOOL_NAMES=Object.freeze(capturedHandoverTools(name=>name));
