// MIT. Metadata for ROZO finance in the original configured Accounting owner.
export const rozoNativeId={type:'string',minLength:1,maxLength:160,pattern:'^[A-Za-z0-9][A-Za-z0-9_.:-]*$'};
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const sha={type:'string',pattern:'^[0-9a-f]{64}$'}, uuid={type:'string',pattern:'^[0-9a-f-]{36}$'};
const string=maxLength=>({type:'string',minLength:1,maxLength});
const optional=maxLength=>({type:'string',maxLength});
const integer={type:'integer',minimum:0},version={type:'integer',minimum:1};
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const base={workspace:alias}, read={readOnly:true,idempotent:true}, write={idempotent:true};
const page={offset:integer,limit:{type:'integer',minimum:1,maximum:200}};
const request={...base,requestId:{...rozoNativeId,maxLength:128},expectedRevision:integer,actor:string(1000)};
const required=['workspace','requestId','expectedRevision','actor'];
const period=object({id:uuid,version});
const sourceIds={type:'array',items:rozoNativeId,minItems:1,maxItems:1000,uniqueItems:true};
const dataContext={type:'string',enum:['development','operational']};
const source={source:alias,sourceSha256:sha,name:string(300),provenance:string(6000),dataContext};
const selection={period,sourceIds,dataContext};
const allocation=object({amount:{type:'string',pattern:'^(0|[1-9][0-9]{0,99})$'},accountCode:string(160),
  costCenter:optional(160),project:optional(300),memo:optional(4000)},['amount','accountCode']);
const definition=(suffix,description,properties,fields,annotations=read)=>
 ['merchant_accounting_rozo_'+suffix,description,{...base,...properties},['workspace',...fields],annotations];
const mutation=(suffix,command,description,payload)=>definition(suffix,description,
 {...request,...payload},[...required.slice(1),...Object.keys(payload)],write);
export const rozoDefinitions=[
 definition('status','Inspect the original ROZO accounting revision, source editions, coding, close history and pending operation. Choose a paged view to inspect its full retained history.',
  {view:{type:'string',enum:['summary','sources','captures','rows','periods','closes','reviews','requests']},...page},[]),
 definition('source_preview','Review a SHA-pinned host-declared original ROZO report against this Accounting workspace. Page original movements before accepting the source.',
  {...source,...page},Object.keys(source)),
 definition('source_capture','Retain the exact configured ROZO report and reviewed preview in the original workspace. Preserve requestId, expectedRevision and previewSha256 for interrupted-request recovery.',
  {...request,...source,previewSha256:sha},[...required.slice(1),...Object.keys(source),'previewSha256'],write),
 mutation('source_review','source.review','Accept or reject one pending original source edition with the operator’s reason.',
  {captureId:rozoNativeId,decision:{type:'string',enum:['accept','reject']},reason:string(6000)}),
 mutation('coding_save','coding.save','Allocate the current original movement in exact native units, with an explicit recognition date and reviewed source basis.',
  {movementId:rozoNativeId,basisSha256:sha,expectedVersion:integer,recognitionDate:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},
   reason:string(6000),providerEvidenceAcknowledged:{type:'boolean',enum:[true]},allocations:{type:'array',items:allocation,minItems:1,maxItems:200}}),
 mutation('disposition_save','disposition.save','Carry or exclude one current unresolved or removed movement for a selected original period, preserving its reviewed basis and reason.',
  {period,movementId:rozoNativeId,basisSha256:sha,missing:{type:'boolean'},kind:{type:'string',enum:['carry_forward','exclude_from_period']},reason:string(6000)}),
 definition('period_save','Save a versioned period through the original Accounting period owner. Retain requestId; original period versions and native replay semantics survive interruption.',
  {...request,id:uuid,expectedVersion:version,name:string(160),from:string(80),until:string(80),note:optional(2000),select:{type:'boolean'}},
  [...required.slice(1),'name','from','until'],write),
 definition('period_preview','Review selected source editions, recognition dates, exact native totals and unresolved movements before retaining a period review.',
  {...selection,view:{type:'string',enum:['summary','issues','lines','excluded','outside','sourceCaptures']},...page},Object.keys(selection)),
 mutation('period_review','period.review','Retain the original period review with its exact preview context and operator note.',
  {...selection,contextSha256:sha,note:string(6000)}),
 mutation('period_close','period.close','Issue an original period source from a ready review and its unchanged context. The native owner retains its full accountant source and prior close chain.',
  {reviewId:rozoNativeId,contextSha256:sha,note:string(6000)}),
 mutation('period_reopen','period.reopen','Reopen the selected issued period for a correction, preserving the original close and explicit reason.',
  {closeId:rozoNativeId,reason:string(6000)}),
 definition('request','Read the original retained request’s pending or accepted result after an interrupted response.',{requestId:rozoNativeId},['requestId']),
 definition('resume','Resume the original prepared request by ID, using its retained full body and original workspace revision.',{requestId:rozoNativeId},['requestId'],write),
 definition('accountant_prepare','Review the complete issued ROZO close with the original Accountant; pin the close file SHA-256 returned by the finance owner.',
  {closeId:rozoNativeId,sourceSha256:sha},['closeId','sourceSha256']),
 definition('accountant_create','Create the original Accountant handoff from the reviewed issued ROZO close. Keep a stable handoff id; subsequent returns use the existing Accountant tools.',
  {closeId:rozoNativeId,sourceSha256:sha,id:uuid,name:string(160),actor:string(240),revision:version},
  ['closeId','sourceSha256','id','name','actor','revision'],write)
];
