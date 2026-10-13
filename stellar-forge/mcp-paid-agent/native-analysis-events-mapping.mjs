// SPDX-License-Identifier: MIT
// Complete source-bound mapping receiving and attributed original native Review.
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {createRetainedDownload} from '../mcp-merchant-operator/retained-download.mjs';
import {initializationDirectory as directory,initializationBytes as bytes,
 optionalInitializationBytes as optionalBytes,retainInitializationFile as retainFile}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/initialization.mjs';
import {nativeEventConnection,readNativeAnalysisEventRecord} from './native-analysis-events-client.mjs';
import {EVENT_ID,EVENT_NAME,EVENT_HASH,EVENT_MAX_RECORD,EVENT_MAPPING_SOURCE_LIMIT,
 eventObject as object,eventNeed as need,eventCanonical,eventHash as sha}
 from './native-analysis-events-contract.mjs';
import {EVENT_MAPPING_REQUEST_SOURCE_LIMIT,EVENT_MAPPING_REQUEST_CHUNK_BYTES,EVENT_MAPPING_REQUEST_SOURCE_SCHEMA}
 from './native-analysis-events-mapping-request-source.mjs';
import {mappingSelectionFromComparison,mappingSourceSelectionHash,validateMappingSource,
 mappingSourceSummary} from './native-analysis-events-mapping-contract.mjs';
export const EVENT_MAPPING_CAPTURE='stellar-forge.analysis-event-mapping-capture.v1';
export const EVENT_MAPPING_REVIEW='stellar-forge.analysis-event-mapping-review.v1';
const ALIAS=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/,MAX=EVENT_MAPPING_SOURCE_LIMIT;
const REQUEST='mapping-capture-request.json',COMPARISON='original-comparison.json',DRAFT='original-draft.json';
const SOURCE='mapping-source.json',MANIFEST='mapping-source-index.json',PREFIX='native_analysis_mapping';
const REVIEW_REQUEST='mapping-review-request.json',WORKING='mapping-working.json';
const SOURCE_NAMES=['analysis-source.mjs','mapping-working.mjs','mapping-working-html.mjs','mapping-working-ui.mjs'];
const COLLEAGUE_NAMES=['mapping-review.mjs','mapping-review-ui.mjs'];
const COLLEAGUE_SCHEMA='stellar-forge.event-mapping-colleague-working.v1';
const SOURCE_BASE=new URL('../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/event-feed/',import.meta.url);
const encoded=v=>Buffer.from(eventCanonical(v)+'\n');
const decode=b=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
const text=b=>new TextDecoder('utf-8',{fatal:true}).decode(b);
const identity=b=>({bytes:b.length,sha256:sha(b)});
const same=(a,b)=>eventCanonical(a)===eventCanonical(b);
function chosen(options,review=false){
 need(typeof options.directory==='string'&&resolve(options.directory)!=='/'&&
  ALIAS.test(options.analysisWorkspace??'')&&EVENT_ID.test(options.expectedWorkspaceId??'')&&
  EVENT_NAME.test(options.programme??'')&&EVENT_ID.test(options.inputId??''),'MAPPING_IDENTITY_REQUIRED');
 if(review)need(EVENT_ID.test(options.actionId??'')&&EVENT_ID.test(options.operationId??''),'MAPPING_REVIEW_IDS_REQUIRED');
 return resolve(options.directory);
}
function checkContext(c,options){
 need(c?.workspace_id===options.expectedWorkspaceId&&c.programme===options.programme&&
  c.input_id===options.inputId,'ORIGINAL_MAPPING_CONTEXT_CHANGED');
 return mappingSelectionFromComparison(c);
}
function sourceIdentity(raw,expected){
 need(object(expected)&&Number.isSafeInteger(expected.bytes)&&expected.bytes>=1&&expected.bytes<=2*1024*1024&&
  EVENT_HASH.test(expected.sha256??'')&&same(identity(raw),expected),'RETAINED_MAPPING_RENDERER_CHANGED');
}
async function installed(name){
 const file=await open(fileURLToPath(new URL(name,SOURCE_BASE)),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const before=await file.stat();need(before.isFile()&&before.size>0&&before.size<=2*1024*1024,'INSTALLED_MAPPING_SOURCE_REQUIRED');
  const raw=await file.readFile(),after=await file.stat();
  need(raw.length===before.size&&after.size===before.size&&after.mtimeMs===before.mtimeMs&&
   after.ctimeMs===before.ctimeMs&&after.ino===before.ino&&after.dev===before.dev,'INSTALLED_MAPPING_SOURCE_CHANGED');
  text(raw);return raw;
 }finally{await file.close();}
}
async function sourceFiles(root,identities,{capture=false,from}={}){
 const folder=join(root,'renderer');await directory(folder,{create:capture});
 let names=identities?Object.keys(identities):[...SOURCE_NAMES,...COLLEAGUE_NAMES];
 if(!identities&&from){
  const capture=decode(await bytes(join(from,REQUEST),65536));names=Object.keys(capture.renderer||{});
 }
 need(SOURCE_NAMES.every(name=>names.includes(name))&&names.every(name=>[...SOURCE_NAMES,...COLLEAGUE_NAMES].includes(name))&&
  (!names.includes('mapping-review-ui.mjs')||names.includes('mapping-review.mjs')),'RETAINED_MAPPING_RENDERER_CHANGED');
 const result={};
 for(const name of names){
  let raw=await optionalBytes(join(folder,name),2*1024*1024);
  if(identities){need(raw!==null,'RETAINED_MAPPING_RENDERER_REQUIRED');sourceIdentity(raw,identities[name]);}
  else{
   const supplied=from?await bytes(join(from,'renderer',name),2*1024*1024):await installed(name);
   need(raw===null||raw.equals(supplied),'ORIGINAL_MAPPING_RENDERER_REQUIRED');raw=supplied;
  }
  result[name]=raw;
 }
 need(!identities||same(Object.keys(identities).sort(),Object.keys(result).sort()),'RETAINED_MAPPING_RENDERER_CHANGED');
 return result;
}
function runtime(sources,comparison){
 need(sha(sources['analysis-source.mjs'])===comparison.receiver.core_sha256,'ORIGINAL_MAPPING_PARSER_REQUIRED');
 const original=text(sources['mapping-working-html.mjs']);
 const body=original.replace(/^export\s+(?=(?:const|function|class)\b)/gm,'');
 need(!/^\s*(?:import|export)\s/m.test(body),'INSTALLED_MAPPING_COMPOSER_REQUIRED');
 const renderer=new Function(body+'\nreturn {createEventMappingWorkingRuntime,renderEventMappingWorking};')();
 const assets={modelSource:text(sources['mapping-working.mjs']),parserSource:text(sources['analysis-source.mjs']),
  controllerSource:text(sources['mapping-working-ui.mjs'])};
 const api=renderer.createEventMappingWorkingRuntime(assets);let reviewApi=null;
 if(sources['mapping-review.mjs']){
  const reviewBody=text(sources['mapping-review.mjs']).replace(/^export\s+(?=(?:const|function|class)\b)/gm,'');
  need(!/^\s*(?:import|export)\s/m.test(reviewBody),'INSTALLED_MAPPING_COLLEAGUE_MODEL_REQUIRED');
  const modelBody=assets.modelSource.replace(/^export\s+(?=(?:const|function|class)\b)/gm,'');
  const hashes=new Function(modelBody+'\nreturn {eventMappingHash,eventMappingBytes};')();
  const factory=new Function(reviewBody+'\nreturn createEventMappingReviewAPI;')();
  reviewApi=factory({workingAPI:api,...hashes});
  if(sources['mapping-review-ui.mjs'])Object.assign(assets,{reviewModelSource:text(sources['mapping-review.mjs']),reviewControllerSource:text(sources['mapping-review-ui.mjs'])});
 }
 return {api,reviewApi,html:working=>renderer.renderEventMappingWorking(working,assets)};
}
async function retainSources(root,sources){
 await directory(join(root,'renderer'),{create:true});
 for(const name of Object.keys(sources))await retainFile(join(root,'renderer',name),sources[name],{resume:true});
}
async function supplied(path,saved,limit,code){
 let raw=saved;
 if(path!==undefined){need(typeof path==='string',code);const selected=await bytes(resolve(path),limit);
  need(raw===null||raw.equals(selected),code);raw=selected;}
 need(raw!==null,code);return raw;
}
function captureRequest(options,comparisonRaw,draftRaw,sources){
 const comparison=decode(comparisonRaw),selection=checkContext(comparison,options);
 need(encoded(selection).length<=EVENT_MAPPING_REQUEST_SOURCE_LIMIT,'MAPPING_NATIVE_SOURCE_LIMIT');
 runtime(sources,comparison);
 const draft=decode(draftRaw);
 if(draft!==null){
  need(object(draft)&&same(Object.keys(draft).sort(),['fields','reviewer','note','decisions'].sort())&&
   Array.isArray(draft.fields)&&draft.fields.length<=100&&typeof draft.reviewer==='string'&&draft.reviewer.length<=240&&
   typeof draft.note==='string'&&draft.note.length<=8000&&object(draft.decisions)&&Object.keys(draft.decisions).length<=200,
   'MAPPING_DRAFT_REQUIRED');
  for(const field of draft.fields)need(object(field)&&same(Object.keys(field).sort(),['name','pointer'])&&
   typeof field.name==='string'&&field.name.length<=48&&typeof field.pointer==='string'&&field.pointer.length<=2000,'MAPPING_DRAFT_REQUIRED');
  for(const [name,reason]of Object.entries(draft.decisions))need(name.length<=48&&typeof reason==='string'&&reason.length<=4000,'MAPPING_DRAFT_REQUIRED');
 }
 return {schema:EVENT_MAPPING_CAPTURE,analysisWorkspace:options.analysisWorkspace,
  workspace_id:options.expectedWorkspaceId,selection,comparison:identity(comparisonRaw),draft:identity(draftRaw),
  renderer:Object.fromEntries(Object.keys(sources).map(name=>[name,identity(sources[name])]))};
}
async function readCapture(options){
 const root=chosen(options);await directory(root);
 const request=decode(await bytes(join(root,REQUEST),65536));
 const sources=await sourceFiles(root,request.renderer);
 const comparisonRaw=await bytes(join(root,COMPARISON),EVENT_MAX_RECORD),draftRaw=await bytes(join(root,DRAFT),4*1024*1024);
 need(same(request,captureRequest(options,comparisonRaw,draftRaw,sources)),'RETAINED_MAPPING_CAPTURE_CHANGED');
 if(options.comparisonPath!==undefined)await supplied(options.comparisonPath,comparisonRaw,EVENT_MAX_RECORD,'ORIGINAL_COMPARISON_REQUIRED');
 if(options.draftPath!==undefined)await supplied(options.draftPath,draftRaw,4*1024*1024,'ORIGINAL_DRAFT_REQUIRED');
 return {root,request,sources,comparison:decode(comparisonRaw),draft:decode(draftRaw)};
}
/** Retain complete original selection and installed reader before any provider call. */
export async function prepareNativeAnalysisEventMappingWorking(options={}){
 const root=chosen(options);await directory(root,{create:true});
 const prior=await optionalBytes(join(root,REQUEST),65536);
 if(prior!==null){const prepared=await readCapture(options);return captureResult(prepared,'PREPARED');}
 const comparisonRaw=await supplied(options.comparisonPath,await optionalBytes(join(root,COMPARISON),EVENT_MAX_RECORD),
  EVENT_MAX_RECORD,'ORIGINAL_COMPARISON_REQUIRED');
 const oldDraft=await optionalBytes(join(root,DRAFT),4*1024*1024);
 const draftRaw=options.draftPath!==undefined?await supplied(options.draftPath,oldDraft,4*1024*1024,'ORIGINAL_DRAFT_REQUIRED'):
  oldDraft??encoded(null);
 const sources=await sourceFiles(root,null,{capture:true});
 const request=captureRequest(options,comparisonRaw,draftRaw,sources);
 options.signal?.throwIfAborted();
 await retainSources(root,sources);
 await retainFile(join(root,COMPARISON),comparisonRaw,{resume:true});
 await retainFile(join(root,DRAFT),draftRaw,{resume:true});
 await retainFile(join(root,REQUEST),encoded(request),{resume:true});
 return captureResult({root,request},'PREPARED');
}
function captureResult(prepared,state,extra={}){
 return {schema:EVENT_MAPPING_CAPTURE,state,directory:prepared.root,
  analysisWorkspace:prepared.request.analysisWorkspace,workspace_id:prepared.request.workspace_id,
  programme:prepared.request.selection.programme,input_id:prepared.request.selection.input_id,
  selection_sha256:mappingSourceSelectionHash(prepared.request.selection),...extra};
}
function descriptor(value,prepared){
 need(object(value)&&value.schema==='stellar-forge.analysis-event-record.v1'&&value.kind==='mapping-source'&&
  value.workspace_id===prepared.request.workspace_id&&value.record_id===prepared.request.selection.input_id&&
  EVENT_HASH.test(value.sha256??'')&&Number.isSafeInteger(value.bytes)&&value.bytes>=1&&value.bytes<=MAX,
  'COMPLETE_MAPPING_RECORD_REQUIRED');
 return value;
}
function makeManifest(record){
 return {schema:'stellar-forge.analysis-event-mapping-source-index.v1',export_id:record.record_id,
  record,files:[{name:SOURCE,bytes:record.bytes,sha256:record.sha256}]};
}
function parseManifest(raw,id){
 const value=decode(raw),r=value?.record;
 need(value?.schema==='stellar-forge.analysis-event-mapping-source-index.v1'&&value.export_id===id&&
  r?.kind==='mapping-source'&&r.schema==='stellar-forge.analysis-event-record.v1'&&
  EVENT_ID.test(r.workspace_id??'')&&r.record_id===id&&EVENT_ID.test(id)&&
  EVENT_HASH.test(r.sha256??'')&&Number.isSafeInteger(r.bytes)&&r.bytes>=1&&r.bytes<=MAX&&
  same(value,makeManifest(r)),'MAPPING_SOURCE_INDEX_CHANGED');
 return value;
}
function adapter(client,record,alias,signal){
 const manifest=makeManifest(record),raw=encoded(manifest),digest=sha(raw);
 const indexFile={name:MANIFEST,...identity(raw)};
 return {endpoint:'urn:stellar-forge:analysis-event-mapping:'+record.workspace_id+':'+record.record_id+':'+record.sha256+':'+alias,
  async call(name,args,options={}){
   signal?.throwIfAborted();
   const {requestSignal,...nativeOptions}=options;
   need(requestSignal===undefined||nativeOptions.signal===undefined||requestSignal===nativeOptions.signal,'CALL_SIGNAL_CONFLICT');
   if(requestSignal!==undefined)nativeOptions.signal=requestSignal;
   if(nativeOptions.signal===undefined)nativeOptions.signal=signal;
   nativeOptions.signal?.throwIfAborted();
   need(args?.exportId===record.record_id,'MAPPING_SOURCE_SELECTION_CHANGED');
   if(name===PREFIX+'_manifest'){
    need(same(Object.keys(args),['exportId']),'DOWNLOAD_ARGUMENTS_INVALID');
    return {state:'MANIFEST_RETAINED',exportId:record.record_id,manifestFile:indexFile};
   }
   need(name===PREFIX+'_file'&&same(Object.keys(args).sort(),
    ['exportId','file','expectedManifestSha256','expectedSha256','offset','limit'].sort())&&
    args.expectedManifestSha256===digest&&Number.isSafeInteger(args.offset)&&args.offset>=0&&
    Number.isSafeInteger(args.limit)&&args.limit>=1&&args.limit<=65536,'MAPPING_DOWNLOAD_CHUNK_CHANGED');
   const file=args.file===MANIFEST?indexFile:args.file===SOURCE?manifest.files[0]:null;
   need(file&&file.sha256===args.expectedSha256&&args.offset<=file.bytes,'MAPPING_DOWNLOAD_FILE_CHANGED');
   const size=Math.min(args.limit,file.bytes-args.offset);let part;
   if(args.file===MANIFEST)part=raw.subarray(args.offset,args.offset+size);
   else{
    need(client,'MAPPING_DOWNLOAD_INCOMPLETE');
    const value=await client.call('event-record-file',{kind:record.kind,record_id:record.record_id,sha256:record.sha256,
     bytes:record.bytes,byteOffset:args.offset,maxBytes:args.limit},nativeOptions);
    signal?.throwIfAborted();nativeOptions.signal?.throwIfAborted();
    const f=value?.file;
    need(value?.workspace_id===record.workspace_id&&value.kind===record.kind&&value.record_id===record.record_id&&
     value.sha256===record.sha256&&f?.verifiedSavedFile===true&&f.sha256===file.sha256&&f.bytes===file.bytes&&
     f.byteOffset===args.offset&&f.returnedBytes===size&&f.encoding==='base64'&&
     f.nextByteOffset===(args.offset+size<file.bytes?args.offset+size:null),'MAPPING_DOWNLOAD_CHUNK_CHANGED');
    part=Buffer.from(f.data,'base64');need(part.length===size&&part.toString('base64')===f.data,'MAPPING_DOWNLOAD_CHUNK_CHANGED');
   }
   return {exportId:record.record_id,manifestSha256:digest,file,offset:args.offset,bytesRead:size,
    encoding:'base64',data:part.toString('base64'),nextOffset:args.offset+size<file.bytes?args.offset+size:null};
  }};
}
const transport=createRetainedDownload({manifestName:MANIFEST,parseManifest,maximumBytes:MAX,
 maximumManifestBytes:65536,maximumCheckpointBytes:65536,readLease:false,
 stateSchema:'stellar-forge.analysis-event-mapping-download-state.v1',resultSchema:EVENT_MAPPING_CAPTURE,
 toolPrefix:PREFIX,errorPrefix:'MCP_ANALYSIS_EVENT_MAPPING',clientName:'starforge-analysis-event-mapping',
 validateExportId:id=>need(EVENT_ID.test(id??''),'MAPPING_INPUT_REQUIRED'),
 describe:m=>({workspaceId:m.record.workspace_id,inputId:m.record.record_id,sourceSha256:m.record.sha256})});
async function verifyTransfer(prepared,record,options){
 const destination=join(prepared.root,'source-download'),manifest=encoded(makeManifest(record));
 return transport.lockedDownload(destination,async context=>{
  await transport.loadContext(context,manifest,record.record_id,adapter(null,record,prepared.request.analysisWorkspace).endpoint);
  options.signal?.throwIfAborted();context.lease.assertHeld();
  await transport.verifiedFile(join(destination,SOURCE),{name:SOURCE,bytes:record.bytes,sha256:record.sha256},options.signal);
  context.state.files[SOURCE]={bytes:record.bytes,sha256:record.sha256,complete:true};
  await transport.checkpoint(context);context.lease.assertHeld();
  await retainFile(join(destination,MANIFEST),manifest,{resume:true});
 });
}
async function finishCapture(prepared,record,options,{publish}){
 await verifyTransfer(prepared,record,options);
 const raw=await bytes(join(prepared.root,'source-download',SOURCE),MAX);
 need(same(identity(raw),{bytes:record.bytes,sha256:record.sha256}),'COMPLETE_MAPPING_SOURCE_CHANGED');
 const bundle=validateMappingSource(raw,prepared.request.selection,prepared.request.workspace_id);
 need(same(bundle.comparison,prepared.comparison),'ORIGINAL_COMPARISON_CHANGED');
 const reader=runtime(prepared.sources,prepared.comparison),working=reader.api.create(bundle,
  prepared.draft===null?{}:{draft:prepared.draft});
 const outputs={[WORKING]:Buffer.from(reader.api.serialize(working)),
  'mapping-working.html':Buffer.from(reader.html(working))};
 for(const side of ['previous','current'])for(const kind of ['ndjson','manifest']){
  const f=bundle.files[side][kind];outputs[side+'-'+(kind==='ndjson'?'events.ndjson':'manifest.json')]=Buffer.from(f.text);
 }
 const receipt={schema:EVENT_MAPPING_CAPTURE,state:'COMPLETE',request:prepared.request,record,
  outputs:Object.fromEntries(Object.entries(outputs).map(([name,b])=>[name,identity(b)]))};
 for(const [name,body]of Object.entries(outputs)){
  options.signal?.throwIfAborted();
  if(publish)await retainFile(join(prepared.root,name),body,{resume:true});
  else need((await bytes(join(prepared.root,name),MAX)).equals(body),'MAPPING_WORKING_OUTPUT_CHANGED');
 }
 if(publish)await retainFile(join(prepared.root,'mapping-capture-complete.json'),encoded(receipt),{resume:true});
 else need(same(decode(await bytes(join(prepared.root,'mapping-capture-complete.json'),65536)),receipt),'MAPPING_CAPTURE_RECEIPT_CHANGED');
 return captureResult(prepared,'COMPLETE',{record,outputs:receipt.outputs,workingFile:join(prepared.root,WORKING),
  editableFile:join(prepared.root,'mapping-working.html'),offline:true});
}
/** Resume the original immutable source transfer, then finish from the retained complete copy. */
export async function downloadNativeAnalysisEventMappingWorking(options={}){
 await prepareNativeAnalysisEventMappingWorking(options);
 const prepared=await readCapture(options);
 let selected=await optionalBytes(join(prepared.root,'mapping-source-record.json'),4096),record,client;
 if(selected===null){
  options.signal?.throwIfAborted();client=await nativeEventConnection(options);
  const selectedRequest=await receiveRequest(client,encoded(prepared.request.selection),prepared.request.workspace_id,options);
  const result=await client.call('event-mapping-source',{mapping_request_source:selectedRequest},{signal:options.signal,timeoutMs:options.timeoutMs});
  need(result?.selection_sha256===mappingSourceSelectionHash(prepared.request.selection)&&
   result.workspace_id===prepared.request.workspace_id&&result.programme===options.programme&&
   result.input_id===options.inputId,'MAPPING_SOURCE_SELECTION_CHANGED');
  record=descriptor(result.complete_record,prepared);
  await retainFile(join(prepared.root,'mapping-source-record.json'),encoded(record),{resume:true});
 }else record=descriptor(decode(selected),prepared);
 const destination=join(prepared.root,'source-download');
 await directory(destination,{create:true});
 // The final transfer index is published only after complete byte verification.
 const completed=await optionalBytes(join(destination,MANIFEST),65536);
 if(completed!==null)need(completed.equals(encoded(makeManifest(record))),'MAPPING_SOURCE_INDEX_CHANGED');
 else{
  client??=await nativeEventConnection(options);
  await transport.download({client:adapter(client,record,options.analysisWorkspace,options.signal),
   exportId:record.record_id,directory:destination,expectedManifestSha256:sha(encoded(makeManifest(record))),
   chunkSize:65536,signal:options.signal,onProgress:options.onProgress});
 }
 return finishCapture(prepared,record,options,{publish:true});
}
/** Validate complete source, all four original files, renderer and editable output with no host call. */
export async function reopenNativeAnalysisEventMappingWorking(options={}){
 const prepared=await readCapture(options),record=descriptor(decode(await bytes(join(prepared.root,'mapping-source-record.json'),4096)),prepared);
 return finishCapture(prepared,record,options,{publish:false});
}
function reviewBody(working,reader,options){
 const checked=reader.api.reopen(working),c=checked.comparison,state=reader.api.status(checked);
 checkContext(c,options);need(state.ready,'COMPLETE_MAPPING_DECISIONS_REQUIRED');
 const mapping_review={comparison_sha256:c.comparison_sha256,programme_revision:c.programme_revision,
  baseline_operation_id:c.baseline_operation_id,reviewer:checked.draft.reviewer,note:checked.draft.note,
  decisions:c.required_decisions.map(name=>({name,reason:checked.draft.decisions[name]}))};
 const request={programme:options.programme,id:options.actionId,operation_id:options.operationId,
  input_id:options.inputId,mapping:c.mapping,mapping_review};
 need(encoded(request).length<=EVENT_MAPPING_REQUEST_SOURCE_LIMIT,'MAPPING_NATIVE_REVIEW_LIMIT');
 return {checked,request};
}
function reviewRequest(options,workingRaw,captureRaw,sources){
 const original=decode(captureRaw),working=decode(workingRaw),c=original.original?.comparison;
 checkContext(c,options);
 const reader=runtime(sources,c);reader.api.reopen(original);
 const selected=working?.schema===COLLEAGUE_SCHEMA
  ?(need(reader.reviewApi,'ORIGINAL_MAPPING_COLLEAGUE_READER_REQUIRED'),reader.reviewApi.reopen(working).working):working;
 need(same(selected?.original,original.original),'ORIGINAL_MAPPING_CAPTURE_CHANGED');
 const result=reviewBody(selected,reader,options);
 return {schema:EVENT_MAPPING_REVIEW,analysisWorkspace:options.analysisWorkspace,workspace_id:options.expectedWorkspaceId,
  working:identity(workingRaw),capture:identity(captureRaw),
  renderer:Object.fromEntries(Object.keys(sources).map(name=>[name,identity(sources[name])])),request:result.request};
}
async function readReview(options){
 const root=chosen(options,true);await directory(root);
 const request=decode(await bytes(join(root,REVIEW_REQUEST),1024*1024+65536));
 const sources=await sourceFiles(root,request.renderer),workingRaw=await bytes(join(root,WORKING),MAX),
  captureRaw=await bytes(join(root,'original-capture-working.json'),MAX);
 need(same(request,reviewRequest(options,workingRaw,captureRaw,sources)),'RETAINED_MAPPING_REVIEW_CHANGED');
 if(options.workingPath!==undefined)await supplied(options.workingPath,workingRaw,MAX,'ORIGINAL_MAPPING_RETURN_REQUIRED');
 if(options.captureDirectory!==undefined){
  const capture=await reopenNativeAnalysisEventMappingWorking({...options,directory:options.captureDirectory});
  need((await bytes(capture.workingFile,MAX)).equals(captureRaw),'ORIGINAL_MAPPING_CAPTURE_CHANGED');
 }
 const returned=decode(workingRaw),reader=runtime(sources,decode(captureRaw).original.comparison);
 const working=returned.schema===COLLEAGUE_SCHEMA?reader.reviewApi.reopen(returned).working:returned;
 return {root,request,working,returned,sources};
}
function reviewResult(prepared,state,extra={}){
 return {schema:EVENT_MAPPING_REVIEW,state,directory:prepared.root,analysisWorkspace:prepared.request.analysisWorkspace,
  workspace_id:prepared.request.workspace_id,programme:prepared.request.request.programme,
  input_id:prepared.request.request.input_id,action_id:prepared.request.request.id,
  operation_id:prepared.request.request.operation_id,request:prepared.request.request,
  workingFile:join(prepared.root,WORKING),captureFile:join(prepared.root,'original-capture-working.json'),...extra};
}
/** Preserve full returned work and its exact original reader before creating the stable native review. */
export async function prepareNativeAnalysisEventMappingReview(options={}){
 const root=chosen(options,true);await directory(root,{create:true});
 if(await optionalBytes(join(root,REVIEW_REQUEST),1024*1024+65536)!==null)return reviewResult(await readReview(options),'PREPARED');
 need(typeof options.captureDirectory==='string','COMPLETE_MAPPING_CAPTURE_REQUIRED');
 const capture=await reopenNativeAnalysisEventMappingWorking({...options,directory:options.captureDirectory,
  comparisonPath:undefined,draftPath:undefined});
 const captureRaw=await bytes(capture.workingFile,MAX);
 const workingRaw=await supplied(options.workingPath,await optionalBytes(join(root,WORKING),MAX),MAX,'ORIGINAL_MAPPING_RETURN_REQUIRED');
 const sources=await sourceFiles(root,null,{capture:true,from:resolve(options.captureDirectory)});
 if(decode(workingRaw)?.schema===COLLEAGUE_SCHEMA&&!sources['mapping-review.mjs']){
  const retained=await optionalBytes(join(root,'renderer','mapping-review.mjs'),2*1024*1024);
  const selected=await installed('mapping-review.mjs');
  need(retained===null||retained.equals(selected),'ORIGINAL_MAPPING_COLLEAGUE_READER_REQUIRED');
  sources['mapping-review.mjs']=selected;
 }
 const request=reviewRequest(options,workingRaw,captureRaw,sources);
 options.signal?.throwIfAborted();
 await retainSources(root,sources);
 await retainFile(join(root,'original-capture-working.json'),captureRaw,{resume:true});
 await retainFile(join(root,WORKING),workingRaw,{resume:true});
 await retainFile(join(root,REVIEW_REQUEST),encoded(request),{resume:true});
 return reviewResult({root,request},'PREPARED');
}
async function receiveRequest(client,raw,workspace,options){
 need(raw.length>0&&raw.length<=EVENT_MAPPING_REQUEST_SOURCE_LIMIT,'MAPPING_NATIVE_REQUEST_LIMIT');
 const digest=sha(raw),selected={id:digest.slice(0,32),bytes:raw.length,sha256:digest};
 function status(value){
  need(value?.schema===EVENT_MAPPING_REQUEST_SOURCE_SCHEMA&&value.workspace_id===workspace&&
   value.id===selected.id&&value.bytes===selected.bytes&&value.sha256===selected.sha256&&
   value.chunk_bytes===EVENT_MAPPING_REQUEST_CHUNK_BYTES&&Number.isSafeInteger(value.received)&&
   value.received>=0&&value.received<=raw.length&&
   (value.received===raw.length||value.received%EVENT_MAPPING_REQUEST_CHUNK_BYTES===0)&&
   value.complete===(value.received===raw.length),'MAPPING_REQUEST_RECEIVING_CHANGED');
  return value;
 }
 options.signal?.throwIfAborted();
 let current=status(await client.call('event-mapping-request-create',selected,{signal:options.signal,timeoutMs:options.timeoutMs}));
 while(!current.complete){
  options.signal?.throwIfAborted();
  const offset=current.received,part=raw.subarray(offset,offset+EVENT_MAPPING_REQUEST_CHUNK_BYTES);
  current=status(await client.call('event-mapping-request-chunk',{id:selected.id,offset,
   base64:part.toString('base64'),sha256:sha(part)},{signal:options.signal,timeoutMs:options.timeoutMs}));
  need(current.received>=offset+part.length,'MAPPING_REQUEST_ACKNOWLEDGEMENT_CHANGED');
  await options.onProgress?.({kind:'mapping-request',id:selected.id,received:current.received,bytes:selected.bytes});
 }
 return selected;
}
function actionValue(value,prepared){
 const r=prepared.request.request,expected={action:'review',operation_id:r.operation_id,input_id:r.input_id,
  mapping:r.mapping,mapping_review:r.mapping_review};
 need(object(value)&&value.workspace_id===prepared.request.workspace_id&&value.programme===r.programme&&
  value.id===r.id&&['READY','RUNNING','COMPLETE','ERROR','INTERRUPTED'].includes(value.status)&&
  same(value.request,expected),'ORIGINAL_MAPPING_ACTION_CHANGED');
 if(value.mapping_review){
  const evidence=value.mapping_review;
  need(evidence.schema==='stellar-forge.event-mapping-review.v1'&&same(evidence.selection,r.mapping_review)&&
   same(evidence.comparison,prepared.working.comparison)&&typeof evidence.reviewed_at==='string',
   'ORIGINAL_MAPPING_EVIDENCE_CHANGED');
 }
 if(value.status==='COMPLETE')need(object(value.mapping_review),'COMPLETE_MAPPING_EVIDENCE_REQUIRED');
 return value;
}
async function receiveAction(options,prepared,client,summary){
 const selected=summary?.complete_record;
 need(selected?.kind==='action'&&selected.record_id===prepared.request.request.id&&
  selected.workspace_id===prepared.request.workspace_id,'MAPPING_ACTION_RECORD_REQUIRED');
 const full=await readNativeAnalysisEventRecord({...options,url:undefined,client,record:selected});
 const value=actionValue(decode(full.bytes),prepared),folder=join(prepared.root,'action-records');
 await directory(folder,{create:true});options.signal?.throwIfAborted();
 await retainFile(join(folder,selected.sha256+'.json'),full.bytes,{resume:true});
 await retainFile(join(folder,selected.sha256+'.record.json'),encoded(selected),{resume:true});
 return reviewResult(prepared,value.status,{record:selected,action:value});
}
/** Dispatch the prepared original Review; it does not Apply or deliver a workbook. */
export async function reviewNativeAnalysisEventMappingWorking(options={}){
 need(options.resume===undefined||typeof options.resume==='boolean','EXPLICIT_RESUME_REQUIRED');
 await prepareNativeAnalysisEventMappingReview(options);
 const prepared=await readReview({...options,captureDirectory:undefined,workingPath:undefined});
 options.signal?.throwIfAborted();const client=await nativeEventConnection(options);
 const overview=await client.call('event-overview',{limit:1,programme_limit:1},{signal:options.signal});
 need(overview.workspace_id===prepared.request.workspace_id,'ORIGINAL_WORKSPACE_CHANGED');
 const selectedRequest=await receiveRequest(client,encoded(prepared.request.request),prepared.request.workspace_id,options);
 const result=await client.call('event-review',{programme:options.programme,id:options.actionId,operation_id:options.operationId,
  mapping_request_source:selectedRequest,...(options.resume===undefined?{}:{resume:options.resume})},
  {signal:options.signal,timeoutMs:options.timeoutMs});
 return receiveAction(options,prepared,client,result);
}
/** Recover the exact saved action after an uncertain reply without another Review request. */
export async function receiveNativeAnalysisEventMappingReview(options={}){
 const prepared=await readReview(options),client=await nativeEventConnection(options);
 const result=await client.call('event-action',{id:prepared.request.request.id},{signal:options.signal,timeoutMs:options.timeoutMs});
 return receiveAction(options,prepared,client,result);
}
/** Independently reopen complete returned source and an explicitly selected immutable action snapshot. */
export async function reopenNativeAnalysisEventMappingReview(options={}){
 const prepared=await readReview(options);
 if(options.recordSha256===undefined)return reviewResult(prepared,'PREPARED',{offline:true});
 need(EVENT_HASH.test(options.recordSha256),'MAPPING_ACTION_DIGEST_REQUIRED');
 const folder=join(prepared.root,'action-records');await directory(folder);
 const selected=decode(await bytes(join(folder,options.recordSha256+'.record.json'),4096));
 need(selected?.schema==='stellar-forge.analysis-event-record.v1'&&selected.kind==='action'&&
  selected.workspace_id===prepared.request.workspace_id&&selected.record_id===options.actionId&&
  selected.sha256===options.recordSha256&&Number.isSafeInteger(selected.bytes)&&selected.bytes>0&&selected.bytes<=EVENT_MAX_RECORD,
  'MAPPING_ACTION_RECORD_CHANGED');
 const raw=await bytes(join(folder,selected.sha256+'.json'),EVENT_MAX_RECORD);
 need(raw.length===selected.bytes&&sha(raw)===selected.sha256,'MAPPING_ACTION_RECORD_CHANGED');
 return reviewResult(prepared,actionValue(decode(raw),prepared).status,{record:selected,action:decode(raw),offline:true});
}
