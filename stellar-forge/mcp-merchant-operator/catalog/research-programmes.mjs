// MIT. Complete original Research programme operations and streamed customer receiving.
import {MAX_RETAINED_CHUNK_BYTES} from '../retained-file-contracts.mjs';
export const RESEARCH_PROGRAMME_PREFIX='merchant_research_programme_';
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'};
const digest={type:'string',pattern:'^[a-f0-9]{64}$'};
const workspaceId={type:'string',pattern:'^research_[a-f0-9]{64}$'};
const stepId={type:'string',pattern:'^[a-z0-9][a-z0-9._-]{0,79}$'};
const fileName={type:'string',minLength:1,maxLength:4096};
const native={type:'object',additionalProperties:true};
const offset={type:'integer',minimum:0},limit={type:'integer',minimum:1,maximum:100};
const bytes={type:'integer',minimum:0,maximum:24128742234216};
const scope={workspace:alias,workspaceId};
const page={offset,limit,snapshot:digest};
const kinds=['CREATE','SUBMIT','APPLY','REPLAY','EXPORT','IMPORT','ARCHIVE','RECEIVE_REVIEW','RECEIVE'];
const file={kind:{type:'string',enum:['JOB','BUNDLE','ARCHIVE']},id:uuid,name:fileName,sha256:digest,bytes};
const read={readOnly:true,idempotent:true},write={idempotent:true};
export function researchProgrammeTools(tool){
 const define=(name,description,properties={},required=[],annotations=read)=>
  tool(RESEARCH_PROGRAMME_PREFIX+name,description,{...scope,...properties},['workspace','workspaceId',...required],annotations);
 return [
  tool(RESEARCH_PROGRAMME_PREFIX+'info',
   'Inspect the original programme desk on an attached Research application. Retain its exact workspaceId for every following programme operation. The application continues to own its listener and native jobs.',
   {workspace:alias},['workspace'],read),
  define('jobs','Page retained native programme jobs. Keep the snapshot across pages; after a lost reply inspect the original id before resuming it.',
   {...page,kind:{type:'string',enum:kinds}}),
  define('job','Read the original compact request, complete file descriptors, status and first-result summary. Retrieve job-input.json or result.json through file_info and retain to recover their complete bytes.',
   {id:uuid},['id']),
  define('resume','Continue this same original native job from its retained complete input. Preserve the id through interrupted prepare, save, transfer or receiving.',
   {id:uuid},['id'],write),
  define('state','Read the original retained programme header and page its steps. Preserve the returned page snapshot across pages and original programmeId; nativeSnapshot retains the underlying programme identity.',
   {programmeId:uuid,...page},['programmeId']),
  define('step','Read one original programme step and its exact request, native review/reply and retained full input descriptor.',
   {programmeId:uuid,stepId},['programmeId','stepId']),
  define('submit','Submit a complete original programme job: CREATE, SUBMIT, APPLY, REPLAY, EXPORT, IMPORT, ARCHIVE, RECEIVE_REVIEW or RECEIVE. Choose exactly one full inline input or host-declared programme-input file. id must equal the complete job id; source bytes and the exact input are retained before dispatch. SUBMIT preserves the native command, stepId and complete native value; APPLY/RECEIVE require the actual displayed review SHA.',
   {id:uuid,input:native,source:alias},['id'],write),
  define('receiving','Read the complete original destination receiving request, native case-transfer review and saved result. Keep this receiving id and its displayed review SHA through the original RECEIVE job.',
   {id:uuid},['id']),
  define('bundle','Inspect the complete native programme handover identity, selected case/dossier/delivery/publications and original member count. Use files for all paged members.',
   {id:uuid,manifestSha256:digest},['id','manifestSha256']),
  define('files','Page every original handover file without truncating the retained package. Keep the returned snapshot and manifest SHA across pages.',
   {id:uuid,...page},['id']),
  define('file_info','Read the exact complete original job or bundle file descriptor. JOB accepts job-input.json, request.json or result.json; BUNDLE accepts the exact native member name. ARCHIVE uses its completed native ARCHIVE job id.',
   {kind:file.kind,id:uuid,name:fileName},['kind','id']),
  define('retain','Retain one complete original job, bundle member or archive under the declared private Merchant export root. Supply its exact reviewed byte count and SHA; an existing complete file reopens before any donor request. The returned exportId drives paged inventory and range reads.',
   file,['kind','id','sha256','bytes'],write),
  define('retained','Page the complete durable retained programme-file inventory. Original file selection, source identity and complete bytes survive reattachment.',
   page),
  define('read','Read an original retained programme file through the existing immutable-descriptor reader. Base64 chunks carry the original complete hash and byte count. Continue with the same exportId/readId and offset, or reopen the same exportId after expiry.',
   {exportId:digest,readId:uuid,offset,limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}},
   ['exportId']),
  define('release','Release a temporary original programme file reader. Its complete retained file remains available.',
   {readId:uuid},['readId']),
  define('archive','Inspect complete archive identity from an original completed ARCHIVE job before transfer. Preserve manifestSha256, sha256 and bytes.',
   {id:uuid},['id']),
  define('upload','Inspect the destination original resumable upload. COMPLETE exposes the original verified archive path and hash; IMPORT uses this upload id.',
   {id:uuid},['id']),
  define('upload_source','Upload a host-declared programme-archive file through the original four-MiB resumable receiver. Keep operationId and uploadId unchanged; exact source selection is retained before dispatch, and completed destination upload reopens without its donor file.',
   {operationId:uuid,uploadId:uuid,source:alias,sha256:digest,bytes},['operationId','uploadId','source','sha256','bytes'],write),
  define('transfer','Transfer an exact completed native archive to another already attached Research workspace. Keep operationId/uploadId and both workspace identities, archiveId, bytes and SHA unchanged through retry. Both original attachments drain the accepted transfer before Stop; the COMPLETE destination upload feeds IMPORT and destination receiving review.',
   {operationId:uuid,archiveId:uuid,sha256:digest,bytes,manifestSha256:digest,
    destination:alias,destinationWorkspaceId:workspaceId,uploadId:uuid},
   ['operationId','archiveId','sha256','bytes','manifestSha256','destination','destinationWorkspaceId','uploadId'],write),
  define('transfer_status','Read the retained exact transfer or local-upload selection and completed result. A missing completion keeps the same operationId for continuation.',
   {operationId:uuid},['operationId']),
 ];
}
