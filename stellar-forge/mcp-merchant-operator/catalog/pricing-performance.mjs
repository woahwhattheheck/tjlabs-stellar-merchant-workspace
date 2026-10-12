// MIT. Existing Pricing provider metadata for saved recorded-usage performance.
import {MAX_RETAINED_CHUNK_BYTES} from '../retained-file-contracts.mjs';
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const arbitrary={type:'object',additionalProperties:true};
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'};
const digest={type:'string',pattern:'^[a-f0-9]{64}$'};
const nullable=value=>({anyOf:[value,{type:'null'}]});
const label={type:'string',minLength:1,maxLength:100};
const monthly={type:'string',pattern:'^[1-9][0-9]*$',maxLength:16};
const base={workspace:alias};
const pagination={after:{type:'string',pattern:'^(0|[1-9][0-9]*)$'},limit:{type:'integer',minimum:1,maximum:100}};
const inputs=object({selectionRequestId:uuid,usageVersion:uuid,
  basis:{type:'string',enum:['HTTP_2XX','NATIVE_SUCCESS','INBOX_ACCEPTED','SERVICE_CONSUMED_REQUESTS','SERVICE_2XX']},
  optionId:nullable(digest),costEdition:nullable(uuid),costBasis:{type:'string',enum:['BILLED','QUOTED']},
  servicePeriodSourceId:nullable(digest)},['selectionRequestId','usageVersion','basis']);
const snapshot=object({name:{type:'string',minLength:1,maxLength:300},text:{type:'string',maxLength:48*1024*1024}});
const source=object({schema:{type:'string',enum:['stellar-forge.merchant-tariff-performance-source.v1']},
  id:digest,record:arbitrary,originals:arbitrary});
const selection={type:'object',properties:{schema:{type:'string',enum:['stellar-forge.merchant-tariff-selection.v1']},
  planId:uuid,comparisonId:digest,tariffReviewSha256:digest,selectionSha256:digest,sourceSelection:arbitrary,
  scenarioPlanInput:arbitrary,pricingInput:arbitrary},required:['schema','planId','comparisonId','tariffReviewSha256',
  'selectionSha256','sourceSelection','scenarioPlanInput','pricingInput'],additionalProperties:true};
const read={readOnly:true,idempotent:true};
const method=name=>'merchant_pricing_performance_'+name;
export const PERFORMANCE_MCP_OPERATIONS=Object.freeze({
  state:method('state'),sources:method('sources'),source:method('source'),servicePeriods:method('service_periods'),
  captureServicePeriod:method('capture_service_period'),preview:method('preview'),save:method('save'),
  list:method('list'),load:method('load'),capture:method('capture'),download:method('download'),
  inspect:method('inspect'),receive:method('receive'),proposal:method('proposal'),
  saveProposal:method('save_proposal'),commitProposal:method('commit_proposal')
});
export const performanceToolDefinitions=[
  [PERFORMANCE_MCP_OPERATIONS.state,'Read original saved Pricing sources, completed tariff selections, recorded performance and captured service periods through the existing opened Pricing alias.',base,['workspace'],read],
  [PERFORMANCE_MCP_OPERATIONS.sources,'Page the existing immutable Pricing source reviews. Retain original UUIDs and nextAfter; the native source picker does not recapture operations.',{...base,...pagination},['workspace'],read],
  [PERFORMANCE_MCP_OPERATIONS.source,'Read one complete original Pricing usage source, its actual observed period, HTTP/native option quantities and matching supplier editions.',{...base,version:uuid},['workspace','version'],read],
  [PERFORMANCE_MCP_OPERATIONS.servicePeriods,'Page retained original opening/closing service-period comparisons. Request counts and purchased service units remain distinct.',{...base,...pagination},['workspace'],read],
  [PERFORMANCE_MCP_OPERATIONS.captureServicePeriod,'Retain both complete original service snapshot texts under the same capture request UUID. The maintained service-period compiler validates their entitlement, allowance and request transitions.',{...base,requestId:uuid,label,opening:snapshot,closing:snapshot},['workspace','requestId','label','opening','closing'],{idempotent:true}],
  [PERFORMANCE_MCP_OPERATIONS.preview,'Calculate performance for an explicitly selected completed tariff quote and recorded usage version. Exact native option, supplier cost and service source selectors retain their separate original populations.',{...base,inputs},['workspace','inputs'],read],
  [PERFORMANCE_MCP_OPERATIONS.save,'Save the complete reviewed performance and every original source file. Preserve requestId, inputs and performanceSha256 across an interrupted save.',{...base,requestId:uuid,label,performanceSha256:digest,inputs},['workspace','requestId','label','performanceSha256','inputs'],{idempotent:true}],
  [PERFORMANCE_MCP_OPERATIONS.list,'Page immutable saved performance summaries using the returned nextAfter value.',{...base,...pagination},['workspace'],read],
  [PERFORMANCE_MCP_OPERATIONS.load,'Reopen a saved performance and its original proposal/native selection recovery requests. Preserve every original request UUID when continuing.',{...base,performanceId:uuid},['workspace','performanceId'],read],
  [PERFORMANCE_MCP_OPERATIONS.capture,'Capture all four complete performance exports in the existing retained-file workflow. Returns the source ID, native record, manifest and exact file hashes; use download for every original byte.',{...base,performanceId:uuid},['workspace','performanceId'],read],
  [PERFORMANCE_MCP_OPERATIONS.download,'Read SHA-pinned chunks from the complete captured performance source, JSON, HTML or CSV. Repeat the inspected manifest digest and returned readId/expectedSha256/nextOffset; original pricing_file_release closes a read.',{...base,performanceId:uuid,
    file:{type:'string',enum:['source.json','review.json','review.html','usage.csv','manifest.json']},
    expectedManifestSha256:digest,expectedSha256:digest,readId:uuid,
    offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}},
    ['workspace','performanceId','file','expectedManifestSha256'],read],
  [PERFORMANCE_MCP_OPERATIONS.inspect,'Read-only preflight of the complete portable performance envelope: recomputes its original source-bound calculations and retains complete original file descriptors.',{...base,source},['workspace','source'],read],
  [PERFORMANCE_MCP_OPERATIONS.receive,'Receive the fully inspected original performance envelope into the existing private Pricing workspace with unchanged source/request identities and original paired service sources.',{...base,source},['workspace','source'],{idempotent:true}],
  [PERFORMANCE_MCP_OPERATIONS.proposal,'Calculate a revised monthly tariff quote using an explicit positive proposedMonthlyRequests string and the original selected tariff Pricing source. Recorded-period quantity remains separately identified.',{...base,performanceId:uuid,proposedMonthlyRequests:monthly},['workspace','performanceId','proposedMonthlyRequests'],read],
  [PERFORMANCE_MCP_OPERATIONS.saveProposal,'Save the reviewed monthly proposal through the original tariff workspace, then return its full native commercial selection. Exact UUID replay recovers the saved plan before obtaining a current native selection.',{...base,performanceId:uuid,proposedMonthlyRequests:monthly,proposalSha256:digest,requestId:uuid,label},
    ['workspace','performanceId','proposedMonthlyRequests','proposalSha256','requestId','label'],{idempotent:true}],
  [PERFORMANCE_MCP_OPERATIONS.commitProposal,'Save the explicitly reviewed complete merchant terms through the original scenario and Pricing writers. Retain the exact full selection, proposal request and both native request UUIDs for recovery.',{...base,performanceId:uuid,proposalRequestId:uuid,selection,planRequestId:uuid,pricingRequestId:uuid},
    ['workspace','performanceId','proposalRequestId','selection','planRequestId','pricingRequestId'],{idempotent:true}]
];
export const performanceClientOperations=Object.freeze({
  'performance-state':PERFORMANCE_MCP_OPERATIONS.state,'performance-sources':PERFORMANCE_MCP_OPERATIONS.sources,
  'performance-source':PERFORMANCE_MCP_OPERATIONS.source,'performance-service-periods':PERFORMANCE_MCP_OPERATIONS.servicePeriods,
  'performance-capture-service':PERFORMANCE_MCP_OPERATIONS.captureServicePeriod,'performance-preview':PERFORMANCE_MCP_OPERATIONS.preview,
  'performance-save':PERFORMANCE_MCP_OPERATIONS.save,'performance-list':PERFORMANCE_MCP_OPERATIONS.list,
  'performance-load':PERFORMANCE_MCP_OPERATIONS.load,'performance-capture':PERFORMANCE_MCP_OPERATIONS.capture,
  'performance-download':PERFORMANCE_MCP_OPERATIONS.download,'performance-inspect':PERFORMANCE_MCP_OPERATIONS.inspect,
  'performance-receive':PERFORMANCE_MCP_OPERATIONS.receive,'performance-proposal':PERFORMANCE_MCP_OPERATIONS.proposal,
  'performance-save-proposal':PERFORMANCE_MCP_OPERATIONS.saveProposal,'performance-commit-proposal':PERFORMANCE_MCP_OPERATIONS.commitProposal
});
