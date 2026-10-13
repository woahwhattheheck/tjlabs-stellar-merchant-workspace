// MIT. Metadata for the source-owned original SF30 dataset study operator.
import { MAX_RETAINED_CHUNK_BYTES } from '../retained-file-contracts.mjs';
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'};
const id={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const exportId={type:'string',pattern:'^([a-f0-9]{64}|study\\.[A-Za-z0-9][A-Za-z0-9_-]{7,79}\\.[1-9][0-9]{0,14})$'};
const title={type:'string',maxLength:160};
const time={type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$'};
const count=(minimum,maximum=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum,maximum});
const revision=count(1);
const fields=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const scoped={workspace:alias,workspaceId:uuid,instanceId:uuid};
const identity=['workspace','workspaceId','instanceId'];
const page={offset:count(0),limit:count(1,50)};
const read={readOnly:true,idempotent:true};
const change={idempotent:true};
const draft={type:'object',additionalProperties:true};
export function datasetStudyTools(tool) {
  const native=(suffix,description,properties={},required=[],hints=change)=>
    tool('merchant_dataset_study_'+suffix,description,{...scoped,...properties},[...identity,...required],hints);
  return [
    tool('merchant_dataset_study_list','List declared original dataset study workspaces and complete study import aliases. Opens no dataset.',page,[],read),
    tool('merchant_dataset_study_open','Open the declared native source and durable study store once. Returns the actual persistent workspaceId and current process instanceId used by subsequent operations.',{workspace:alias},['workspace'],change),
    tool('merchant_dataset_study_status','Read an opened workspace source summary, saved study page, borrowed browser and owned file reads. Without workspace, lists declared aliases.',{workspace:alias,...page},[],read),
    native('inspect','Inspect an exact saved study revision: working source fields and raw draft, compact editions, native storage history, or original successful rows. Explicit pages retain complete values; oversized entries are identified for whole study download.',{studyId:id,revision,section:{enum:['working','editions','history','rows']},...page},['studyId'],read),
    native('create','Create a source-bound study using the supplied original ID and operation time. Repeating the exact request recovers its original saved revision.',{studyId:id,title,at:time},['studyId','at']),
    native('save','Save unfinished title/draft and checkpoint from the exact expectedRevision. Raw invalid numeric/filter text remains editable. Repeat the same revision, changes and at after a lost response; native immutable save recovers the original operation.',{studyId:id,expectedRevision:revision,changes:fields({title,draft}),at:time,reason:{type:'string',maxLength:240}},['studyId','expectedRevision','changes','at']),
    native('import_inspect','Read and validate a host-declared complete study JSON file; return original file SHA256/byte count, source binding and edition count before importing.',{sourceImport:alias},['sourceImport'],read),
    native('import','Import the complete declared study pinned by SHA256. Preserve every edition, raw draft and successful page. Use expectedRevision:null for a new identity; optional targetId and at explicitly fork the imported file. Rebinding to the current source is a separate operation.',{sourceImport:alias,expectedSourceSha256:hash,expectedRevision:{anyOf:[revision,{type:'null'}]},targetId:id,title,at:time},['sourceImport','expectedSourceSha256','expectedRevision']),
    native('fork','Fork the exact selected native storage revision into targetId with the original at. Preserves all editions and the complete working state.',{studyId:id,revision,targetId:id,title,at:time},['studyId','revision','targetId','at']),
    native('restore','Restore a selected edition while preserving the current working draft in the same original study history.',{studyId:id,expectedRevision:revision,edition:count(1,200),at:time},['studyId','expectedRevision','edition','at']),
    native('rebind','Explicitly adopt the currently displayed source snapshot. Preserves the previous draft before adopting compatible fields and clears the old successful page.',{studyId:id,expectedRevision:revision,expectedSnapshot:hash,at:time},['studyId','expectedRevision','expectedSnapshot','at']),
    native('query','Execute the saved guided/raw query through the original native engine. Service queries pin the saved selected snapshot. Save its complete successful preview against expectedRevision and return a page of rows; an invalid query leaves the prior successful revision intact.',{studyId:id,expectedRevision:revision,at:time,...page},['studyId','expectedRevision','at']),
    native('export_start','Retain and run the whole result from the saved successful query, starting at its original first page. Pin snapshot and requestId; repeat that UUID to recover the same original job.',{studyId:id,expectedRevision:revision,requestId:uuid},['studyId','expectedRevision','requestId']),
    native('export_resume','Resume the same original full-result job and cursor chain. Previously retained pages remain intact.',{exportId:hash},['exportId']),
    native('exports','Inspect an original result status or page its saved result jobs. COMPLETE includes native output filenames and digests.',{studyId:id,exportId:hash,...page},[],read),
    native('manifest','Return the exact complete download-manifest.json descriptor for study.ID.revision or a completed native result ID. Result packages include original CSV, typed JSONL, study, native manifest, optional meanings and every retained page.',{exportId},['exportId'],read),
    native('file','Read an original immutable native file in verified byte ranges. Select a file and exact SHA256 from download-manifest.json. Resume with the same expectedManifestSha256, expectedSha256 and offset after restart; readId is process-owned. EOF releases its descriptor.',{exportId,file:{type:'string',maxLength:255},expectedManifestSha256:hash,expectedSha256:hash,readId:uuid,offset:count(0),limit:count(1,MAX_RETAINED_CHUNK_BYTES)},['exportId','file','expectedManifestSha256','expectedSha256'],read),
    native('file_release','Release an unfinished original file read while preserving every native saved file.',{exportId,readId:uuid},['exportId','readId']),
    native('browser_open','Open the industrial browser over this same source and study store. Existing native query, editing and complete-result workflows remain available.',{port:count(0,65535)}),
    native('browser_close','Close the borrowed browser listener while retaining the opened native source, study store and running result jobs.'),
    native('close','Drain accepted operations and close this original workspace, its borrowed browser and owned file descriptors. Whole studies and result pages remain durable.',{},[],{idempotent:true})
  ];
}
