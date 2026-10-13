// MIT. CanadaBuys metadata loads without opening a native workspace.
import { MAX_RETAINED_CHUNK_BYTES } from '../retained-file-contracts.mjs';
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const id={type:'string',minLength:1,maxLength:256},digest={type:'string',pattern:'^[a-f0-9]{64}$'};
const revision={type:'integer',minimum:0},offset={type:'integer',minimum:0},limit={type:'integer',minimum:1,maximum:500};
const selected={workspace:alias},scope={type:'string',enum:['all','shortlist','selected']};
const noticeIds={type:'array',maxItems:10000,uniqueItems:true,items:id};
const stream={type:'string',enum:['open-tenders','new-tenders','complete-tenders','awards','supply-arrangements']};
const bidderKind={type:'string',enum:['profile','evidence','requirement','decision']};
const recordRevision={type:'integer',minimum:1};
const read={readOnly:true,idempotent:true},mutation={idempotent:false};
export const definitions=[
 ['merchant_canadabuys_workspaces','List configured CanadaBuys workspace aliases and owned native services.',{},[],read],
 ['merchant_canadabuys_open','Open the saved original CanadaBuys workspace and its operator browser.',selected,['workspace'],{idempotent:true}],
 ['merchant_canadabuys_close','Drain and close the exact currently owned native workspace.',{...selected,instanceId:id},['workspace','instanceId'],mutation],
 ['merchant_canadabuys_status','Read current revision and a complete page of the selected collection; continue page.nextOffset.',{...selected,collection:{type:'string',enum:['notices','sources','sourceObservations','workshares','captures','publications','receivings']},offset,limit},['workspace'],read],
 ['merchant_canadabuys_notice','Read one complete notice, original source history, qualification, award/arrangement candidates and workshares.',{...selected,noticeId:id},['workspace','noticeId'],read],
 ['merchant_canadabuys_entries','Read retained original edition metadata for one notice in complete pages.',{...selected,noticeId:id,offset,limit},['workspace','noticeId'],read],
 ['merchant_canadabuys_entry','Read one full original bilingual CSV row and its immutable source identity.',{...selected,entryId:id,includeDocument:{type:'boolean'}},['workspace','entryId'],read],
 ['merchant_canadabuys_compare','Compare every original column in two exact source editions. includeValues retains full before/after values.',{...selected,beforeId:id,afterId:id,offset,limit,includeValues:{type:'boolean'}},['workspace','beforeId','afterId'],read],
 ['merchant_canadabuys_source','Read one original source and independent capture/import observations; includeBody returns complete UTF-8 CSV.',{...selected,sourceId:id,includeBody:{type:'boolean'}},['workspace','sourceId'],read],
 ['merchant_canadabuys_inputs','List configured source/package input aliases, or inspect exact bytes and SHA256 of one input.',{...selected,input:alias},['workspace'],read],
 ['merchant_canadabuys_import','Import a complete hash-pinned official CSV from the selected host input. Its stream may be declared in the input.',{...selected,input:alias,stream,expectedSha256:digest,expectedRevision:revision},['workspace','input','expectedSha256','expectedRevision'],mutation],
 ['merchant_canadabuys_capture','Fetch an entire official source, or resume the saved original captureId. New captures choose stream; supply current workspace revision.',{...selected,stream,captureId:id,expectedRevision:revision,url:{type:'string',maxLength:8192},label:{type:'string',maxLength:2048}},['workspace','expectedRevision'],{...mutation,openWorld:true}],
 ['merchant_canadabuys_capture_record','Read the saved original source response and resumption state.',{...selected,captureId:id},['workspace','captureId'],read],
 ['merchant_canadabuys_review','Save qualification and review using the selected notice review revision.',{...selected,noticeId:id,expectedRevision:revision,
   disposition:{type:'string',enum:['unreviewed','reviewing','pursue','passed']},owner:{type:'string',maxLength:32768},nextAction:{type:'string',maxLength:32768},
   note:{type:'string',maxLength:131072},shortlisted:{type:'boolean'},qualification:{type:'object'}},['workspace','noticeId','expectedRevision'],mutation],
 ['merchant_canadabuys_workshare','Read the complete current workshare and all original saved editions.',{...selected,workshareId:id},['workspace','workshareId'],read],
 ['merchant_canadabuys_workshare_create','Create a source-linked partner workshare with scope, deliverables, hours, integer-cent costs and milestones.',{...selected,expectedRevision:revision,record:{type:'object'}},['workspace','expectedRevision','record'],mutation],
 ['merchant_canadabuys_workshare_update','Save the next original workshare edition using its current revision; keep the original source binding.',{...selected,workshareId:id,expectedRevision:revision,record:{type:'object'}},['workspace','workshareId','expectedRevision','record'],mutation],
 ['merchant_canadabuys_qualify','Match explicit profile keywords, categories, commodity schemes and timing against retained actual fields; inspect match evidence.',{...selected,profile:{type:'object'},offset,limit},['workspace','profile'],read],
 ['merchant_canadabuys_bidder_status','Read saved company profiles, evidence, requirements and bid-decision counts.',selected,['workspace'],read],
 ['merchant_canadabuys_bidder_list','List a complete page of one saved bidder record kind; continue page.nextOffset.',{...selected,kind:bidderKind,noticeId:id,offset,limit},['workspace','kind'],read],
 ['merchant_canadabuys_bidder_record','Read the selected saved edition and optionally its full original history.',{...selected,kind:bidderKind,recordId:id,revision:recordRevision,history:{type:'boolean'}},['workspace','kind','recordId'],read],
 ['merchant_canadabuys_bidder_create','Save a company profile, source document, requirement or reviewed bid decision against current workspace revision. Evidence can consume a hash-pinned configured input.',{...selected,kind:bidderKind,record:{type:'object'},expectedRevision:revision,commandId:id,input:alias,expectedSha256:digest},['workspace','kind','record','expectedRevision'],mutation],
 ['merchant_canadabuys_bidder_update','Append the next record edition against its current revision, retaining original history. A decision freezes the selected current notice, profile, evidence and requirements.',{...selected,kind:bidderKind,recordId:id,record:{type:'object'},expectedRevision:recordRevision,commandId:id,input:alias,expectedSha256:digest},['workspace','kind','recordId','record','expectedRevision'],mutation],
 ['merchant_canadabuys_bidder_fit','Explain the saved capability profile against retained actual notices. Complete the result page before selecting a decision.',{...selected,profileId:id,profileRevision:recordRevision,noticeIds,offset,limit},['workspace','profileId'],read],
 ['merchant_canadabuys_bidder_assess','Read the exact current source/profile context and its requirement and evidence review issues before saving a human decision.',{...selected,noticeId:id,sourceEntryId:id,profileId:id,profileRevision:recordRevision,allowHistoricalEntry:{type:'boolean'}},['workspace','noticeId','sourceEntryId','profileId','profileRevision'],read],
 ['merchant_canadabuys_bidder_compare','Compare the saved decision context with current notice, profile, evidence and requirement editions.',{...selected,recordId:id},['workspace','recordId'],read],
 ['merchant_canadabuys_receive','Receive a hash-pinned complete original package, preserving local decisions and recording selected conflicts.',{...selected,input:alias,expectedSha256:digest,expectedRevision:revision},['workspace','input','expectedSha256','expectedRevision'],mutation],
 ['merchant_canadabuys_receiving','Read original receiving results and retained source/decision conflicts.',{...selected,packageId:digest},['workspace','packageId'],read],
 ['merchant_canadabuys_export','Retain a complete report, package, CSV, selected row, comparison, decision report or exact evidence document as a downloadable private file.',{...selected,expectedRevision:revision,
   format:{type:'string',enum:['json','csv','html','package','comparison','document','source','decision-json','decision-csv','decision-html','evidence']},scope,noticeIds,sourceId:id,entryId:id,beforeId:id,afterId:id,decisionId:id,evidenceId:id,recordRevision},['workspace','expectedRevision','format'],mutation],
 ['merchant_canadabuys_files','List original immutable export or merchant package files with exact lengths and SHA256.',{...selected,publicationId:id},['workspace','publicationId'],read],
 ['merchant_canadabuys_file_read','Receive an original listed file in exact hash-pinned Base64 chunks; continue readId and nextOffset.',{...selected,publicationId:id,file:{type:'string',minLength:1,maxLength:256},readId:id,expectedSha256:digest,offset,limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}},['workspace','publicationId','file','expectedSha256'],read],
 ['merchant_canadabuys_file_release','Release the original retained-file snapshot after its download.',{...selected,readId:id},['workspace','readId'],read],
 ['merchant_canadabuys_merchant_prepare','Freeze selected complete procurement, review and workshare packages into the existing SF30 dataset and merchant using host public payment terms.',{...selected,expectedRevision:revision,scope,noticeIds,name:{type:'string',minLength:1,maxLength:128}},['workspace','expectedRevision'],mutation],
 ['merchant_canadabuys_merchant_preview','Query the original immutable SF30 dataset. Values are strings; select where_notice_id or where_package_id and continue page.nextCursor unchanged.',{...selected,publicationId:id,query:{type:'object',additionalProperties:{type:'string'}}},['workspace','publicationId'],read],
 ['merchant_canadabuys_merchant_start','Start the exact prepared merchant through the maintained native SF30 service and host payment terms.',{...selected,publicationId:id},['workspace','publicationId'],mutation],
 ['merchant_canadabuys_merchant_stop','Stop the exact owned merchant instance and retain its original package.',{...selected,sellerInstanceId:id},['workspace','sellerInstanceId'],mutation],
 ['merchant_canadabuys_delivery_adopt','Verify and reconstruct complete packages from an existing finalized SF100 delivery, then receive original source and work through the native transaction.',{...selected,delivery:alias,expectedRevision:revision},['workspace','delivery','expectedRevision'],mutation],
];
export function canadabuysWorkspaceTools(tool){return definitions.map(definition=>tool(...definition));}
