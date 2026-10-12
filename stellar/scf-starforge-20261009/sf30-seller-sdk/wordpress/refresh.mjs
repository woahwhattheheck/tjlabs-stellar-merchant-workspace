// MIT. Reviewed WordPress refreshes over the original capture, edition and operation owners.
import { constants } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { sourceString, projectRecord } from '../sftp/formats.mjs';
import { encodeSftpDatasetRow } from '../sftp/publisher/plan.mjs';
import { csvLine } from '../postgres/publisher/plan.mjs';
import { normalizedRecord, validateProjection, datasetConfig, selectedRows, rowPosition, buildEdition } from './edition.mjs';
import { privateDirectory, readJson, readPrivate, immutableJson, exists, hashPrivate, syncDirectory, inventory } from './files.mjs';
import { id, hash, text, only, integer, identity, sha256, jsonBytes, clone, newId, fail } from './config.mjs';

export const REFRESH_ACTIONS=Object.freeze([
  'refresh.plan.save','refresh.run.start','refresh.run.advance','refresh.run.review','refresh.run.export',
]);
const PLAN_SCHEMA='stellar-forge.wordpress-refresh-plan.v1';
const RUN_SCHEMA='stellar-forge.wordpress-refresh-run.v1';
const REVIEW_SCHEMA='stellar-forge.wordpress-refresh-review.v1';
const EVENT_SCHEMA='stellar-forge.wordpress-refresh-event.v1';
const MAX_FILE=536870912, INDEX_BYTES=1048576, STRIDE=256, PREVIEW_BYTES=4194304;
const DATASET_KEYS=['name','filters','ranges','sorts','maxBytes','maxRows','maxCellChars','defaultLimit','maxLimit','maxPageBytes'];
const names=['review.json','changes.jsonl','changes.csv','changes.index.json'];
const select=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,clone(value[key])]));
const derived=(runId,purpose)=>{
  const bytes=createHash('sha256').update(runId+'\0'+purpose).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
  const value=bytes.toString('hex');return value.slice(0,8)+'-'+value.slice(8,12)+'-'+value.slice(12,16)+'-'+value.slice(16,20)+'-'+value.slice(20);
};
const add=(value,key,row)=>{
  const previous=value[key].find(item=>item.id===row.id);
  if(previous&&identity(previous)!==identity(row))fail('WORDPRESS_REFRESH_STATE_CHANGED','The original refresh record differs from its saved operation.',409,{key,id:row.id});
  if(!previous)value[key].push(row);
};
const metadata=edition=>({
  editionId:edition.id,mappingId:edition.mappingId,captureId:edition.captureId,captureSha256:edition.captureSha256,
  snapshot:edition.dataset.snapshot,intentSha256:edition.intentSha256,projectionHash:edition.projectionHash,
});
const jobSummary=value=>value?select(value,[
  'id','kind','status','active','revision','createdAt','updatedAt','recordCount','responseCount','responseBytes',
  'collectionIndex','page','nextRetryAt','error','findings',
]):null;

export function createWordPressRefresh({directory,stored,sourceRecord,sourceFor,mappingRecord,editionRecord,exportEdition}) {
  const path=(kind,recordId)=>join(directory,'refresh',kind,id(recordId)+'.json');
  const home=runId=>join(directory,'refresh','reviews',id(runId));
  const verified=new Map();
  async function record(kind,collection,recordId,current) {
    const value=current??await stored(),row=value[collection].find(item=>item.id===id(recordId));
    if(!row)fail('WORDPRESS_REFRESH_NOT_FOUND','Select an original saved refresh '+kind+'.',404);
    const raw=await readPrivate(path(kind,recordId),1048576);
    if(sha256(raw)!==row.fileSha256)fail('WORDPRESS_REFRESH_CHANGED','The original refresh record has changed.',409);
    return {...JSON.parse(raw),fileSha256:row.fileSha256};
  }
  async function plan(planId,current) {
    const value=await record('plans','refreshPlans',planId,current);
    if(value.schema!==PLAN_SCHEMA||value.id!==planId)fail('WORDPRESS_REFRESH_PLAN','Select the original refresh plan.',409);
    return value;
  }
  async function originalRun(runId,current) {
    const value=await record('runs','refreshRuns',runId,current);
    if(value.schema!==RUN_SCHEMA||value.id!==runId)fail('WORDPRESS_REFRESH_RUN','Select the original refresh run.',409);
    const original=await plan(value.planId,current);
    if(original.fileSha256!==value.planSha256||original.sourceId!==value.sourceId||original.sourceSha256!==value.sourceSha256)
      fail('WORDPRESS_REFRESH_PLAN_CHANGED','The run and original saved plan differ.',409);
    return {value,original};
  }
  async function savedEvent(row) {
    const raw=await readPrivate(path('events',row.id),1048576);
    if(sha256(raw)!==row.fileSha256)fail('WORDPRESS_REFRESH_EVENT_CHANGED','The retained refresh decision has changed.',409);
    const event=JSON.parse(raw);
    if(event.schema!==EVENT_SCHEMA||event.id!==row.id||event.runId!==row.runId)
      fail('WORDPRESS_REFRESH_EVENT_CHANGED','The retained refresh event belongs to another run.',409);
    return event;
  }
  async function event(operation,runId,kind,details={}) {
    const value={schema:EVENT_SCHEMA,id:operation.id,runId,kind,createdAt:operation.createdAt,...details},
      saved=await immutableJson(path('events',operation.id),value,1048576),
      row={...select(value,['id','runId','kind','createdAt','reviewSha256','editionId','exportId','decision','reviewer']),fileSha256:saved.sha256};
    return {value,row};
  }
  async function inspectJob(engine,jobId) {
    try{return await engine.inspect(jobId);}
    catch(error){if(error.code==='ENOENT')return null;throw error;}
  }
  async function report(run,{verifyFiles=false}={}) {
    const file=join(home(run.id),'review.json');
    if(!await exists(file))return null;
    const raw=await readPrivate(file,1048576),value=JSON.parse(raw),reviewSha256=sha256(raw);
    if(value.schema!==REVIEW_SCHEMA||value.runId!==run.id||value.planId!==run.planId||
       value.sourceId!==run.sourceId||value.sourceSha256!==run.sourceSha256||
       identity(value.baseline)!==identity(run.baseline)||value.candidate?.captureId!==run.captureId||
       !Array.isArray(value.files)||value.files.length!==3||
       value.files.some(member=>!names.includes(member.name)||member.name==='review.json')||
       new Set(value.files.map(member=>member.name)).size!==3)
      fail('WORDPRESS_REFRESH_REVIEW_CHANGED','The complete review differs from its original run.',409);
    for(const member of value.files){
      hash(member.sha256);integer(member.bytes,0,MAX_FILE,'the retained review member size');
      if(verifyFiles)await verifyFile(join(home(run.id),member.name),member);
    }
    return {...value,reviewSha256};
  }
  async function verifyFile(file,expected) {
    const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
    try {
      const value=await handle.stat({bigint:true});
      if(!value.isFile()||value.nlink!==1n||(value.mode&63n)!==0n||value.size!==BigInt(expected.bytes))
        fail('WORDPRESS_REFRESH_PRIVATE_FILE','Use the retained private comparison file.',409);
      const signature=[value.dev,value.ino,value.size,value.mtimeNs,value.ctimeNs].map(String).join(':');
      if(verified.get(file)!==signature+':'+expected.sha256){
        const digest=createHash('sha256');let bytes=0;
        for await(const chunk of handle.createReadStream({autoClose:false})){digest.update(chunk);bytes+=chunk.length;}
        const after=await handle.stat({bigint:true});
        if(bytes!==expected.bytes||digest.digest('hex')!==expected.sha256||
           after.size!==value.size||after.mtimeNs!==value.mtimeNs||after.ctimeNs!==value.ctimeNs)
          fail('WORDPRESS_REFRESH_REVIEW_CHANGED','The complete comparison member has changed.',409);
        verified.set(file,signature+':'+expected.sha256);
      }
    }finally{await handle.close();}
  }
  async function run(runId) {
    const current=await stored(),{value,original}=await originalRun(runId,current),engine=await sourceFor(value.sourceId);
    const discovery=await inspectJob(engine,value.discoveryId),capture=await inspectJob(engine,value.captureId),
      review=await report(value),events=[];
    for(const row of current.refreshEvents.filter(item=>item.runId===runId))events.push(await savedEvent(row));
    const chosen=events.find(item=>['approved','rejected'].includes(item.kind))??null,
      decision=chosen?select(chosen,['decision','reviewer','note','operationId','createdAt','editionId']):null,
      exports=events.filter(item=>item.kind==='exported').map(item=>current.exports.find(row=>row.id===item.exportId)).filter(Boolean);
    let stage=exports.length?'exported':chosen?.kind==='approved'?'approved':chosen?.kind==='rejected'?'rejected':
      review?'review_ready':capture?'capturing':'discovering';
    const selected=capture??discovery;
    if(!review&&!chosen&&selected?.status==='attention')stage='attention';
    let recovery=null;
    const pending=path('decisions',runId);
    if(!chosen&&await exists(pending)){
      const value=await readJson(pending,1048576);
      if(value.runId!==runId)fail('WORDPRESS_REFRESH_REVIEW_CHANGED','The saved review belongs to another run.',409);
      recovery={operationId:value.operationId,action:'refresh.run.review',expectedRevision:value.expectedRevision,input:value.input};
    }
    if(!recovery){
      for(const row of [...current.operations].reverse()){
        if(row.status==='complete'||!['refresh.run.review','refresh.run.export'].includes(row.action))continue;
        const retained=await readJson(join(directory,'operations',row.id+'.intent.json'),1048576);
        if(identity({action:retained.action,input:retained.input})!==row.intentSha256)
          fail('WORDPRESS_OPERATION_CHANGED','The original refresh continuation has changed.',409);
        if(retained.input.runId===runId){recovery={operationId:row.id,action:row.action,expectedRevision:retained.expectedRevision,input:retained.input};break;}
      }
    }
    return {run:value,plan:original,stage,jobs:{discovery:jobSummary(discovery),capture:jobSummary(capture)},review,decision,
      edition:chosen?.editionId?current.editions.find(item=>item.id===chosen.editionId)??null:null,exports,events,recovery,
      comparisonPending:capture?.status==='complete'&&!review};
  }
  async function finishData(temporary,final,expected) {
    if(await exists(final)){
      const previous=await hashPrivate(final,MAX_FILE);
      if(previous.hash!==expected.sha256||previous.bytes!==expected.bytes)
        fail('WORDPRESS_REFRESH_REVIEW_CHANGED','The saved comparison has different original source bytes.',409);
      await unlink(temporary);
    }else{await rename(temporary,final);await syncDirectory(home(expected.runId));}
  }
  async function prepareReview(value,original,signal) {
    const previous=await report(value,{verifyFiles:true});
    if(previous)return previous;
    const baseline=await editionRecord(value.baseline.editionId),engine=await sourceFor(value.sourceId),
      capture=await engine.completion(value.captureId),state=await engine.inspect(value.captureId);
    if(identity(metadata(baseline))!==identity(value.baseline)||baseline.sourceSha256!==value.sourceSha256)
      fail('WORDPRESS_REFRESH_BASELINE_CHANGED','The selected prior edition has changed.',409);
    if(capture.sourceSha256!==value.sourceSha256)fail('WORDPRESS_REFRESH_CAPTURE_CHANGED','The new native capture belongs to another source.',409);
    const projection=validateProjection(original.projection,capture),config=datasetConfig(projection,original.dataset),
      prior=(await readJson(join(baseline.directory,'records.json'),67108864)).records,
      left=new Map(prior.map(item=>[item.key,item])),chosen=await selectedRows(engine,value.captureId,projection);
    if(identity(prior)!==baseline.recordIndexSha256)fail('WORDPRESS_REFRESH_BASELINE_CHANGED','The original record index has changed.',409);
    await privateDirectory(home(value.id),true);
    const temporary=join(home(value.id),'.pending-refresh-'+newId()),jsonPath=temporary+'.jsonl',csvPath=temporary+'.csv',
      json=await open(jsonPath,'wx',0o600);
    let csv;
    const hashes={json:createHash('sha256'),csv:createHash('sha256')},sizes={json:0,csv:0},offsets=[];
    const summary={beforeRows:prior.length,afterRows:0,added:0,removed:0,changed:0,sourceChanged:0,projectionChanged:0,unchanged:0,changeCount:0};
    let candidateCsvBytes=Buffer.byteLength(csvLine(Object.keys(config.columns))),jsonReady=false,csvReady=false;
    if(candidateCsvBytes>config.maxBytes){await json.close();await unlink(jsonPath);fail('WORDPRESS_DATASET_BYTES','The original dataset header exceeds its selected byte ceiling.',413);}
    async function write(handle,key,bytes){
      bytes=Buffer.from(bytes);if(sizes[key]+bytes.length>MAX_FILE)fail('WORDPRESS_REFRESH_REPORT_BYTES','The complete comparison exceeds its retained-file ceiling.',413);
      await handle.writeFile(bytes);hashes[key].update(bytes);sizes[key]+=bytes.length;
    }
    async function change(key,before,after){
      const kind=!before?'added':!after?'removed':'changed',sourceChanged=!!before&&!!after&&before.nativeSha256!==after.nativeSha256,
        projectionChanged=!!before&&!!after&&before.projectedSha256!==after.projectedSha256;
      const row={index:summary.changeCount,key,kind,sourceChanged,projectionChanged,before:before??null,after:after??null};
      if(summary.changeCount%STRIDE===0)offsets.push({index:summary.changeCount,byte:sizes.json});
      await write(json,'json',JSON.stringify(row)+'\n');
      await write(csv,'csv',csvLine([row.index,key,kind,String(sourceChanged),String(projectionChanged),
        before?.nativeSha256??'',after?.nativeSha256??'',before?.projectedSha256??'',after?.projectedSha256??'',
        before?.responseSequence??'',before?.ordinal??'',after?.responseSequence??'',after?.ordinal??'']));
      summary[kind]++;if(sourceChanged)summary.sourceChanged++;if(projectionChanged)summary.projectionChanged++;summary.changeCount++;
    }
    try {
      csv=await open(csvPath,'wx',0o600);
      await write(csv,'csv',csvLine(['index','native_key','kind','source_changed','projection_changed','before_native_sha256','after_native_sha256',
        'before_projected_sha256','after_projected_sha256','before_response','before_ordinal','after_response','after_ordinal']));
      for await(const item of engine.records(value.captureId)){
        signal?.throwIfAborted();
        if(chosen.get(item.key)!==rowPosition(item))continue;
        if(summary.afterRows>=config.maxRows)fail('WORDPRESS_DATASET_ROWS','The refresh exceeds the original dataset row ceiling.',413);
        const projected=projectRecord(normalizedRecord(item,state.intent.input.discovery),{format:'json',mapping:projection.mapping});
        candidateCsvBytes+=Buffer.byteLength(encodeSftpDatasetRow(projected.row,config));
        if(candidateCsvBytes>config.maxBytes)fail('WORDPRESS_DATASET_BYTES','The refresh exceeds the original dataset byte ceiling.',413);
        const next={key:item.key,collection:item.collection,nativeId:item.nativeId,responseSequence:item.responseSequence,
          responseSha256:item.responseSha256,ordinal:item.ordinal,nativeSha256:sha256(sourceString(item.native)),
          projectedSha256:identity(projected.row)},before=left.get(item.key);
        if(!before||before.nativeSha256!==next.nativeSha256||before.projectedSha256!==next.projectedSha256)await change(item.key,before,next);
        else summary.unchanged++;
        left.delete(item.key);summary.afterRows++;
      }
      for(const item of left.values()){signal?.throwIfAborted();await change(item.key,item,null);}
      await json.sync();await csv.sync();
      jsonReady=true;csvReady=true;
    }finally{
      await json.close();await csv?.close();
      if(!jsonReady)await unlink(jsonPath).catch(()=>{});
      if(!csvReady)await unlink(csvPath).catch(()=>{});
    }
    const members=[
      {name:'changes.jsonl',bytes:sizes.json,sha256:hashes.json.digest('hex')},
      {name:'changes.csv',bytes:sizes.csv,sha256:hashes.csv.digest('hex')},
    ];
    await finishData(jsonPath,join(home(value.id),'changes.jsonl'),{...members[0],runId:value.id});
    await finishData(csvPath,join(home(value.id),'changes.csv'),{...members[1],runId:value.id});
    const index={schema:'stellar-forge.wordpress-refresh-index.v1',runId:value.id,changesSha256:members[0].sha256,
      records:summary.changeCount,stride:STRIDE,offsets},indexSaved=await immutableJson(join(home(value.id),'changes.index.json'),index,INDEX_BYTES);
    members.push({name:'changes.index.json',bytes:indexSaved.bytes,sha256:indexSaved.sha256});
    const review={schema:REVIEW_SCHEMA,runId:value.id,planId:original.id,workspaceId:(await stored()).id,
      sourceId:value.sourceId,sourceSha256:value.sourceSha256,runCreatedAt:value.createdAt,baseline:value.baseline,
      candidate:{captureId:value.captureId,captureSha256:capture.sha256,projectionHash:identity(projection),recordCount:summary.afterRows,
        csvBytes:candidateCsvBytes,completedAt:capture.completedAt,findings:clone(capture.findings),collections:clone(capture.collections)},
      summary,files:members};
    await immutableJson(join(home(value.id),'review.json'),review,1048576);
    return report(value,{verifyFiles:true});
  }
  async function changes(runId,{offset=0,limit=50,kind='all'}={}) {
    integer(offset,0,2000000,'the comparison offset');integer(limit,1,500,'the comparison count');
    if(!['all','added','removed','changed'].includes(kind))fail('WORDPRESS_REFRESH_CHANGE_KIND','Select all, added, removed or changed records.');
    const {value}=await originalRun(runId),review=await report(value);
    if(!review)fail('WORDPRESS_REFRESH_REVIEW_REQUIRED','Advance the completed native capture to prepare its comparison.',409);
    const member=review.files.find(item=>item.name==='changes.jsonl'),indexMember=review.files.find(item=>item.name==='changes.index.json');
    await verifyFile(join(home(runId),member.name),member);await verifyFile(join(home(runId),indexMember.name),indexMember);
    const index=await readJson(join(home(runId),indexMember.name),INDEX_BYTES);
    if(index.runId!==runId||index.changesSha256!==member.sha256||index.records!==review.summary.changeCount||!Array.isArray(index.offsets))
      fail('WORDPRESS_REFRESH_REVIEW_CHANGED','The retained comparison index has changed.',409);
    const start=index.offsets.filter(item=>item.index<=offset).at(-1)??{index:0,byte:0},rows=[];
    let nextOffset=null,expected=start.index;
    if(offset<index.records){
      const handle=await open(join(home(runId),member.name),constants.O_RDONLY|constants.O_NOFOLLOW);
      const stream=handle.createReadStream({autoClose:false,start:start.byte}),lines=createInterface({input:stream,crlfDelay:Infinity});
      try{
        for await(const line of lines){
          const item=JSON.parse(line);
          if(item.index!==expected++)fail('WORDPRESS_REFRESH_REVIEW_CHANGED','The original comparison sequence has changed.',409);
          if(item.index<offset)continue;
          if(kind==='all'||item.kind===kind)rows.push(item);
          if(rows.length===limit){nextOffset=item.index+1<index.records?item.index+1:null;break;}
        }
      }finally{lines.close();stream.destroy();await handle.close();}
    }
    return {runId,reviewSha256:review.reviewSha256,summary:review.summary,offset,limit,rows,nextOffset};
  }
  async function changedRecord(runId,key) {
    text(key,500,'the native WordPress record key');
    const {value,original}=await originalRun(runId),review=await report(value);
    if(!review)fail('WORDPRESS_REFRESH_REVIEW_REQUIRED','Prepare the complete comparison first.',409);
    const engine=await sourceFor(value.sourceId);let bytes=0,clipped=false;
    async function side(captureId,expectedCapture) {
      const capture=await engine.completion(captureId);
      if(capture.sha256!==expectedCapture)fail('WORDPRESS_REFRESH_CAPTURE_CHANGED','The retained native capture has changed.',409);
      const state=await engine.inspect(captureId),selected=await selectedRows(engine,captureId,original.projection);
      for await(const item of engine.records(captureId)){
        if(item.key!==key||selected.get(item.key)!==rowPosition(item))continue;
        const projected=projectRecord(normalizedRecord(item,state.intent.input.discovery),{format:'json',mapping:original.projection.mapping}),
          nativeJson=sourceString(item.native),projectedJson=sourceString(projected.row),
          nativeBytes=Buffer.byteLength(nativeJson),projectedBytes=Buffer.byteLength(projectedJson);
        const source={sourceId:value.sourceId,captureId,sequence:item.responseSequence,ordinal:item.ordinal,sha256:item.responseSha256},
          metadata={key:item.key,collection:item.collection,nativeId:item.nativeId,nativeSha256:sha256(nativeJson),projectedSha256:identity(projected.row)};
        if(bytes+nativeBytes+projectedBytes>PREVIEW_BYTES){clipped=true;return {nativeJson:null,projectedJson:null,nativeBytes,projectedBytes,nativeOmitted:true,source,metadata};}
        bytes+=nativeBytes+projectedBytes;return {nativeJson,projectedJson,nativeBytes,projectedBytes,source,metadata};
      }
      return null;
    }
    const before=await side(value.baseline.captureId,value.baseline.captureSha256),after=await side(value.captureId,review.candidate.captureSha256);
    if(!before&&!after)fail('WORDPRESS_REFRESH_RECORD_NOT_FOUND','Select a native record retained by this comparison.',404);
    return {runId,reviewSha256:review.reviewSha256,key,before,after,clipped};
  }
  async function download(runId,name) {
    if(!names.includes(name))fail('WORDPRESS_REFRESH_DOWNLOAD','Select an original complete review member.',404);
    const {value}=await originalRun(runId),review=await report(value);
    if(!review)fail('WORDPRESS_REFRESH_REVIEW_REQUIRED','Prepare the complete comparison first.',409);
    const file=join(home(runId),name),member=name==='review.json'?{sha256:review.reviewSha256,bytes:(await hashPrivate(file,1048576)).bytes}:
      review.files.find(item=>item.name===name);
    await verifyFile(file,member);
    const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
    return {handle,size:member.bytes,sha256:member.sha256,filename:'wordpress-refresh-'+runId+'-'+name,
      contentType:name.endsWith('.csv')?'text/csv; charset=utf-8':name.endsWith('.jsonl')?'application/x-ndjson':'application/json'};
  }
  async function resolveSourceId(action,input,current) {
    const value=current??await stored();let sourceId;
    if(action==='refresh.plan.save'){
      const edition=value.editions.find(row=>row.id===id(input.editionId));
      if(!edition)fail('WORDPRESS_EDITION_NOT_FOUND','Select a completed native edition.',404);
      sourceId=edition.sourceId;
    }else if(action==='refresh.run.start')sourceId=(await plan(id(input.planId),value)).sourceId;
    else if(['refresh.run.advance','refresh.run.review','refresh.run.export'].includes(action))
      sourceId=(await originalRun(id(input.runId),value)).value.sourceId;
    else fail('WORDPRESS_REFRESH_ACTION','Select an original refresh operation.',404);
    await sourceRecord(sourceId,value);
    return sourceId;
  }
  async function dispatch(action,input,operation,signal) {
    const current=await stored();
    if(action==='refresh.plan.save'){
      only(input,['editionId','expectedSnapshot','label','note','merchantId','productId','limits','previousPlanId'],'refresh plan');
      const edition=await editionRecord(id(input.editionId),current);
      if(edition.dataset.snapshot!==hash(input.expectedSnapshot))fail('WORDPRESS_REFRESH_EDITION_REVIEW','Select the displayed original edition snapshot.',409);
      const mapping=await mappingRecord(edition.mappingId,current),engine=await sourceFor(edition.sourceId),
        capture=await engine.inspect(edition.captureId),native=await readJson(join(edition.directory,'dataset.json'),65536),
        source=await sourceRecord(edition.sourceId,current),selection=clone(capture.intent.input.selection);
      if(!capture.complete||capture.complete.sha256!==edition.captureSha256||source.sourceSha256!==edition.sourceSha256)
        fail('WORDPRESS_REFRESH_BASELINE_CHANGED','The original source, capture and edition differ.',409);
      if(input.limits!==undefined){only(input.limits,['maxPages','maxRecords','maxBytes'],'refresh capture limits');Object.assign(selection,input.limits);}
      // Original capture.create validates these same native arguments on every fresh discovery.
      integer(selection.maxPages,1,100000,'the capture page ceiling');integer(selection.maxRecords,1,10000000,'the capture record ceiling');
      integer(selection.maxBytes,1024,4294967296,'the retained capture-byte ceiling');
      const merchant=input.merchantId?current.merchants.find(row=>row.id===id(input.merchantId)):null,
        product=input.productId?current.products.find(row=>row.id===id(input.productId)):null;
      if(input.merchantId&&!merchant||input.productId&&!product)fail('WORDPRESS_REFRESH_PRODUCT_SELECTION','Select saved original merchant terms and product.',404);
      if(input.previousPlanId)await plan(id(input.previousPlanId),current);
      const value={schema:PLAN_SCHEMA,id:operation.id,label:text(input.label,160,'the refresh plan label'),
        note:text(input.note??'',4000,'the plan note',true),createdAt:operation.createdAt,previousPlanId:input.previousPlanId??null,
        sourceId:edition.sourceId,sourceSha256:source.sourceSha256,baseline:metadata(edition),selection,
        projection:clone(mapping.projection),dataset:select(native,DATASET_KEYS),
        merchantId:merchant?.id??null,merchantIdentity:merchant?identity(merchant):null,productId:product?.id??null,productIdentity:product?identity(product):null};
      if(identity(value.projection)!==edition.projectionHash)fail('WORDPRESS_REFRESH_PROJECTION_CHANGED','The original reviewed projection has changed.',409);
      const saved=await immutableJson(path('plans',value.id),value,1048576),
        row={id:value.id,label:value.label,sourceId:value.sourceId,baselineEditionId:edition.id,baselineSnapshot:edition.dataset.snapshot,
          merchantId:value.merchantId,productId:value.productId,previousPlanId:value.previousPlanId,createdAt:value.createdAt,fileSha256:saved.sha256};
      return {result:{...value,fileSha256:saved.sha256},apply:state=>add(state,'refreshPlans',row)};
    }
    if(action==='refresh.run.start'){
      only(input,['planId','label','baselineEditionId'],'refresh run');
      const original=await plan(id(input.planId),current),baselineId=input.baselineEditionId??original.baseline.editionId;
      if(baselineId!==original.baseline.editionId){
        const predecessor=current.refreshRuns.find(row=>row.planId===original.id&&row.editionId===id(baselineId));
        if(!predecessor||!current.refreshEvents.some(row=>row.runId===predecessor.id&&row.kind==='approved'&&row.editionId===baselineId))
          fail('WORDPRESS_REFRESH_PREDECESSOR','Select the plan’s original edition or an approved successor from the same plan.',409);
      }
      const baseline=await editionRecord(baselineId,current);
      if(baseline.sourceSha256!==original.sourceSha256||baseline.projectionHash!==identity(original.projection))
        fail('WORDPRESS_REFRESH_PREDECESSOR','The original source and projection must match this saved plan.',409);
      const value={schema:RUN_SCHEMA,id:operation.id,planId:original.id,planSha256:original.fileSha256,
        label:text(input.label,160,'the refresh run label'),sourceId:original.sourceId,sourceSha256:original.sourceSha256,
        baseline:metadata(baseline),createdAt:operation.createdAt,discoveryId:derived(operation.id,'discovery'),captureId:derived(operation.id,'capture'),
        mappingId:derived(operation.id,'mapping'),editionId:derived(operation.id,'edition')},
        saved=await immutableJson(path('runs',value.id),value,1048576),
        engine=await sourceFor(value.sourceId);
      await engine.create({id:value.discoveryId,kind:'discovery'});const launched=engine.run(value.discoveryId),
        row={...select(value,['id','planId','label','sourceId','createdAt','discoveryId','captureId','mappingId','editionId']),baselineEditionId:baselineId,fileSha256:saved.sha256};
      return {result:{runId:value.id,sourceId:value.sourceId,jobId:value.discoveryId,stage:'discovering',...launched},apply:state=>add(state,'refreshRuns',row)};
    }
    if(!['refresh.run.advance','refresh.run.review','refresh.run.export'].includes(action))
      fail('WORDPRESS_REFRESH_ACTION','Select an original refresh operation.',404);
    const {value,original}=await originalRun(id(input.runId),current),engine=await sourceFor(value.sourceId);
    if(action==='refresh.run.advance'){
      only(input,['runId'],'refresh continuation');
      const decided=current.refreshEvents.find(row=>row.runId===value.id&&['approved','rejected'].includes(row.kind));
      if(decided)return {result:{runId:value.id,sourceId:value.sourceId,stage:decided.kind,...await run(value.id)}};
      await engine.create({id:value.discoveryId,kind:'discovery'});
      const discovery=await engine.inspect(value.discoveryId);
      if(discovery.status!=='complete'){
        const launched=engine.run(value.discoveryId);
        return {result:{runId:value.id,sourceId:value.sourceId,jobId:value.discoveryId,stage:'discovering',...launched}};
      }
      await engine.create({id:value.captureId,kind:'capture',discoveryId:value.discoveryId,selection:original.selection});
      const capture=await engine.inspect(value.captureId);
      if(capture.status!=='complete'){
        if(capture.error?.code==='WORDPRESS_CAPTURE_LIMIT')
          fail('WORDPRESS_REFRESH_CAPTURE_LIMIT','The saved source exceeded this run’s frozen limits. Save a plan with larger declared limits and start its new capture.',409,
            {runId:value.id,captureId:value.captureId,limits:original.selection,originalError:capture.error});
        const launched=engine.run(value.captureId);
        return {result:{runId:value.id,sourceId:value.sourceId,jobId:value.captureId,stage:'capturing',...launched}};
      }
      const review=await prepareReview(value,original,signal),
        saved=await event(operation,value.id,'review_ready',{reviewSha256:review.reviewSha256,captureSha256:review.candidate.captureSha256,summary:review.summary});
      return {result:{runId:value.id,sourceId:value.sourceId,stage:'review_ready',review},apply:state=>add(state,'refreshEvents',saved.row)};
    }
    if(action==='refresh.run.review'){
      only(input,['runId','expectedReviewSha256','expectedCaptureSha256','decision','reviewer','note'],'refresh review');
      const review=await report(value,{verifyFiles:true});
      if(!review||review.reviewSha256!==hash(input.expectedReviewSha256)||review.candidate.captureSha256!==hash(input.expectedCaptureSha256))
        fail('WORDPRESS_REFRESH_REVIEW_SELECTION','Review the displayed complete comparison and exact native capture.',409);
      if(!['approve','reject'].includes(input.decision))fail('WORDPRESS_REFRESH_DECISION','Explicitly approve or reject the successor.');
      const prior=current.refreshEvents.find(row=>row.runId===value.id&&['approved','rejected'].includes(row.kind));
      if(prior)fail('WORDPRESS_REFRESH_ALREADY_REVIEWED','This run already has a retained final decision. Open that decision or start the next original run.',409,{operationId:prior.id});
      const pending={schema:'stellar-forge.wordpress-refresh-decision.v1',runId:value.id,operationId:operation.id,
        createdAt:operation.createdAt,expectedRevision:operation.expectedRevision,input:clone(input),reviewSha256:review.reviewSha256,
        reviewer:text(input.reviewer,160,'the refresh reviewer'),note:text(input.note??'',4000,'the review note',true),decision:input.decision};
      await immutableJson(path('decisions',value.id),pending,1048576);
      if(input.decision==='reject'){
        const saved=await event(operation,value.id,'rejected',{operationId:operation.id,decision:'reject',reviewer:pending.reviewer,note:pending.note,reviewSha256:review.reviewSha256});
        return {result:{runId:value.id,sourceId:value.sourceId,stage:'rejected',decision:saved.value},apply:state=>add(state,'refreshEvents',saved.row)};
      }
      const capture=await engine.completion(value.captureId);
      if(capture.sha256!==review.candidate.captureSha256||identity(original.projection)!==review.candidate.projectionHash)
        fail('WORDPRESS_REFRESH_CAPTURE_CHANGED','The reviewed capture or projection has changed.',409);
      const mapping={id:value.mappingId,sourceId:value.sourceId,captureId:value.captureId,captureSha256:capture.sha256,
        projection:clone(original.projection),projectionHash:identity(original.projection),createdAt:operation.createdAt},
        mappingFile=await immutableJson(join(directory,'mappings',mapping.id+'.json'),mapping),
        edition=await buildEdition({source:engine,captureId:value.captureId,projection:original.projection,dataset:original.dataset,
          review:{reviewer:pending.reviewer,note:pending.note,decision:'approve',expectedCaptureSha256:capture.sha256,projectionHash:identity(original.projection)},
          destination:join(directory,'editions',value.editionId),signal});
      const editionRow={id:value.editionId,sourceId:value.sourceId,mappingId:value.mappingId,captureId:value.captureId,captureSha256:capture.sha256,
        snapshot:edition.dataset.snapshot,intentSha256:edition.intentSha256,name:edition.dataset.name??original.dataset.name,
        rowCount:edition.rowCount,csvBytes:edition.csvBytes,createdAt:operation.createdAt},
        saved=await event(operation,value.id,'approved',{operationId:operation.id,decision:'approve',reviewer:pending.reviewer,note:pending.note,
          reviewSha256:review.reviewSha256,editionId:value.editionId,snapshot:edition.dataset.snapshot});
      return {result:{runId:value.id,sourceId:value.sourceId,stage:'approved',edition:{...edition,id:value.editionId},decision:saved.value},
        apply:state=>{add(state,'mappings',{...mapping,fileSha256:mappingFile.sha256});add(state,'editions',editionRow);add(state,'refreshEvents',saved.row);}};
    }
    only(input,['runId','reviewer','note','merchantId','productId'],'refresh export');
    const approval=current.refreshEvents.find(row=>row.runId===value.id&&row.kind==='approved');
    if(!approval)fail('WORDPRESS_REFRESH_APPROVAL_REQUIRED','Approve the exact successor before exporting it.',409);
    const review=await report(value,{verifyFiles:true});
    if(review?.reviewSha256!==approval.reviewSha256)fail('WORDPRESS_REFRESH_REVIEW_CHANGED','The original approved comparison has changed.',409);
    const merchantId=input.merchantId??original.merchantId,productId=input.productId??original.productId;
    if(!merchantId)fail('WORDPRESS_REFRESH_MERCHANT_REQUIRED','Select the original merchant terms for this reviewed edition.',409);
    if(!input.merchantId&&(!current.merchants.some(row=>row.id===merchantId)||identity(current.merchants.find(row=>row.id===merchantId))!==original.merchantIdentity))
      fail('WORDPRESS_REFRESH_MERCHANT_CHANGED','The plan’s original merchant terms changed. Select the intended retained terms explicitly.',409);
    if(!input.productId&&productId&&(!current.products.some(row=>row.id===productId)||identity(current.products.find(row=>row.id===productId))!==original.productIdentity))
      fail('WORDPRESS_REFRESH_PRODUCT_CHANGED','The plan’s original product changed. Select the intended retained product explicitly.',409);
    const extra=new Set(['refresh/plans/'+original.id+'.json','refresh/runs/'+value.id+'.json','refresh/decisions/'+value.id+'.json']);
    for(const name of names)extra.add('refresh/reviews/'+value.id+'/'+name);
    for(const row of current.refreshEvents.filter(item=>item.runId===value.id))extra.add('refresh/events/'+row.id+'.json');
    const baseline=await editionRecord(value.baseline.editionId,current),baselineCapture=await engine.inspect(baseline.captureId);
    extra.add('mappings/'+baseline.mappingId+'.json');
    for(const file of await inventory(baseline.directory))extra.add('editions/'+baseline.id+'/'+file.path);
    for(const jobId of [baselineCapture.intent.input.discoveryId,baseline.captureId])
      for(const file of await inventory(join(directory,'cache',value.sourceSha256,'jobs',jobId)))
        extra.add('cache/'+value.sourceSha256+'/jobs/'+jobId+'/'+file.path);
    const refresh={planId:original.id,runId:value.id,reviewSha256:review.reviewSha256,baselineSnapshot:value.baseline.snapshot,
      candidateCaptureSha256:review.candidate.captureSha256};
    const exportFile=path('exports',operation.id);let selection;
    if(await exists(exportFile)){
      selection=await readJson(exportFile,1048576);
      if(selection.schema!=='stellar-forge.wordpress-refresh-export.v1'||selection.operationId!==operation.id||
         selection.runId!==value.id||selection.intentSha256!==operation.intentSha256||identity(selection.refresh)!==identity(refresh))
        fail('WORDPRESS_REFRESH_EXPORT_CHANGED','The retained export belongs to a different original refresh command.',409);
    }else{
      extra.add('refresh/exports/'+operation.id+'.json');
      selection={schema:'stellar-forge.wordpress-refresh-export.v1',operationId:operation.id,runId:value.id,intentSha256:operation.intentSha256,
        createdAt:operation.createdAt,sourceFiles:[...extra].sort(),refresh,input:{editionId:value.editionId,merchantId,
          ...(productId?{productId}:{productLabel:original.label}),reviewer:text(input.reviewer,160,'the export reviewer'),
          note:text(input.note??'',4000,'the export note',true)}};
      await immutableJson(exportFile,selection,1048576);
    }
    const exported=await exportEdition(selection.input,operation,current,{sourceFiles:selection.sourceFiles,refresh:selection.refresh}),
      saved=await event(operation,value.id,'exported',{exportId:exported.result.id,reviewSha256:review.reviewSha256,editionId:value.editionId,productId:exported.result.productId});
    return {result:{...exported.result,runId:value.id,sourceId:value.sourceId,stage:'exported',refresh},
      apply:state=>{exported.apply(state);add(state,'refreshEvents',saved.row);}};
  }
  return {plan,run,changes,record:changedRecord,download,dispatch,resolveSourceId};
}
