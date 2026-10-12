// MIT. Original saved service renewals through the configured support provider.
import {MAX_RETAINED_CHUNK_BYTES} from '../retained-file-contracts.mjs';

const uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'};
const documentId={type:'string',pattern:'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'};
const digest={type:'string',pattern:'^[a-f0-9]{64}$'};
const text=(maxLength,minLength=0)=>({type:'string',minLength,maxLength});
const integer=(minimum=0,maximum=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum,maximum});
const nullable=value=>({anyOf:[value,{type:'null'}]});
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const utc={type:'string',pattern:'^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z$'};
const date={type:'string',pattern:'^\\d{4}-\\d\\d-\\d\\d$'};
const windows={type:'array',maxItems:12,items:object({start:text(5),end:text(5)})};
const calendar=object({
  mode:{enum:['always','business']},timeZone:text(100),
  week:{type:'array',maxItems:7,items:object({day:integer(1,7),windows})},
  exceptions:{type:'array',maxItems:1000,items:object({date,windows})}
});
const targets={type:'array',minItems:1,maxItems:7,items:object({
  kind:{enum:['ENDPOINT_UNAVAILABLE','OBSERVER_INCOMPLETE','HTTP_5XX','DISCONNECTED',
    'DELIVERY_UNAVAILABLE','DELIVERY_BACKLOG','DELIVERY_EXHAUSTED']},
  responseMinutes:integer(1,527040),recoveryMinutes:integer(1,527040)
})};
const continuation=object({
  title:text(500),customer:text(500),owner:text(240),effectiveFrom:utc,
  effectiveUntil:nullable(utc),calendar,targets
},[]);
const sourceSelection={
  id:{...uuid,description:'Original renewal UUID; choose a new UUID for a new renewal.'},
  expectedRevision:{...nullable(integer(1)),description:'Current renewal edition, or null when creating a renewal.'},
  termsId:uuid,expectedTermsRevision:integer(1),expectedTermsSha256:digest
};
const boundRequest={
  requestId:{...uuid,description:'Optional retained request UUID; it must match the outer requestId on writes.'},
  expectedCaseRevision:{...digest,description:'Optional copy of the outer case expectedRevision; when supplied it must match exactly.'}
};
const proposal=object({
  ...sourceSelection,...boundRequest,continuation,
  owner:text(400,1),noticeDays:nullable(integer(0,3660)),noticeAt:nullable(utc),
  actor:text(240,1),note:text(8000),quoteId:nullable(documentId),
  quoteSha256:nullable(digest),expectedPreviewSha256:digest
},['id','expectedRevision','termsId','expectedTermsRevision','expectedTermsSha256','actor']);
const decision=object({
  id:uuid,expectedRevision:integer(1),...boundRequest,
  state:{enum:['accepted','declined','closed']},actor:text(240,1),observedAt:utc,
  reference:text(4096),note:text(8000),acceptanceId:nullable(documentId)
},['id','expectedRevision','state','actor','observedAt']);
const caseSelection={
  id:{...uuid,description:'Original saved case UUID.'},
  expectedRevision:{...digest,description:'Exact current case revision SHA, distinct from the renewal edition number.'}
};
const handoverSelection={id:uuid,revision:digest,renewalId:uuid};

export function serviceRenewalTools(tool){
  const read={readOnly:true,idempotent:true};
  return [
    tool('merchant_service_renewals_queue',
      'Read the complete original case portfolio as an explicitly dated renewal queue, including archived cases. Expiring agreements appear before any proposal exists. Returns full-portfolio summary, current page, unavailable cases and nextOffset; continue until nextOffset is null. Defaults to a 90-day horizon, 30-day notice and 50 rows.',
      {asOf:utc,through:utc,noticeDays:integer(0,3660),q:text(1000),includeClosed:{type:'boolean'},
        offset:integer(),limit:integer(1,200)},['asOf'],read),
    tool('merchant_service_renewals_read',
      'Open current or historical case renewals with complete original terms/history, eligible same-case quotations and customer responses. case.revision is the selected snapshot; case.currentRevision is the current head. Quote eligibleRenewalIds and acceptance latest flags guide the original continuation workflow.',
      {id:uuid,revision:digest},['id'],read),
    tool('merchant_service_renewals_preview',
      'Preview a continuation against the exact current case and original terms edition. A new renewal requires continuation.effectiveUntil, including explicit null for an open-ended term. The original service calendar, merchant binding and reviewed targets remain authoritative. Retain the resulting previewSha256 with the proposed input.',
      {...caseSelection,input:proposal},['id','expectedRevision','input'],read),
    tool('merchant_service_renewals_propose',
      'Retain or revise the reviewed continuation through the original case writer. Supply the exact case and terms guards, renewal edition and preview hash; retain the same outer requestId and complete body for lost-response replay. To attach a quote, select its exact ID/hash and current proposed terms edition, omitting continuation changes. A replacement after closure requires its own fresh proposed edition and matching quote.',
      {...caseSelection,requestId:uuid,input:proposal},['id','expectedRevision','requestId','input'],{idempotent:true}),
    tool('merchant_service_renewals_decide',
      'Record accepted, declined or closed on the original renewal. Acceptance requires the latest retained accepted response to the exact continuation quote and its original observedAt; it activates those same reviewed terms. Closing requires a nonempty note and preserves prior acceptance. Retain the exact outer requestId, case revision and complete input for recovery.',
      {...caseSelection,requestId:uuid,input:decision},['id','expectedRevision','requestId','input'],{idempotent:true}),
    tool('merchant_service_renewals_handover',
      'Return the complete validated renewal handover: selected immutable case revision, full original histories, distinct source/proposed/active terms, acceptedHead and exact quote/response materials. The sealed handover excludes the changing current case head. For large results use the revision-pinned handover_file reader to receive every original byte.',
      handoverSelection,['id','renewalId'],read),
    tool('merchant_service_renewals_handover_file',
      'Read a complete original renewal handover JSON in bounded base64 chunks at an exact saved case revision. Keep readId and expectedSha256 for continuation. After restart or expiry, omit readId and reopen that same selection, digest and byte offset. expectedSha256 pins complete file bytes; the JSON also carries its independent canonical handover seal.',
      {...handoverSelection,readId:uuid,expectedSha256:digest,offset:integer(),
        limit:integer(1,MAX_RETAINED_CHUNK_BYTES)},['id','revision','renewalId'],read),
    tool('merchant_service_renewals_file_reads',
      'Inspect this operator’s active retained renewal handover file reads for one original case. Returns read identities and remaining lifecycle state for completing or releasing the selected snapshot.',
      {id:uuid},['id'],read),
    tool('merchant_service_renewals_file_release',
      'Release one unfinished retained renewal handover file read owned by this operator and case. The original case revision and renewal history remain available for the same digest-pinned handover.',
      {id:uuid,readId:uuid},['id','readId'],{idempotent:true})
  ];
}
