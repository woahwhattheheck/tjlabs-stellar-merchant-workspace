// MIT. Immutable comparisons of complete results owned by the original query-studies workspace.
import {constants} from 'node:fs';
import {open,mkdir,lstat,readdir,link,unlink,readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
import {compareStudyRows,validateComparisonPlan,suggestComparisonFields,comparisonViewMatches,
 COMPARISON_SCHEMA,COMPARISON_KINDS,COMPARISON_INPUT_BYTES} from './dataset-study-comparison-core.mjs';

const MODE='LOCAL_OPERATOR_PREVIEW',MAX_FILE=256*1024*1024,MAX_META=8*1024*1024,MAX_PAGE=1024*1024;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,HASH=/^[a-f0-9]{64}$/;
const json=value=>Buffer.from(JSON.stringify(value)+'\n'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=(message,code='DATASET_STUDY_COMPARISON_INVALID',status=400)=>{throw Object.assign(new Error(message),{code,status});};
const need=(ok,...args)=>{if(!ok)fail(...args);};
const descriptor=(name,bytes)=>({name,bytes:bytes.length,sha256:sha(bytes)});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key))&&keys.every(key=>Object.hasOwn(value,key));
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const csv=value=>'"'+String(value??'').replaceAll('"','""')+'"';
function boundedKey(key){let truncated=false;const values=key.map(cell=>{if(typeof cell.value==='string'&&cell.value.length>256){truncated=true;return {...cell,value:cell.value.slice(0,256)+'…',originalChars:cell.value.length};}return clone(cell);});return {key:values,...(truncated?{keyTruncated:true}:{})};}
const itemNames=['request.json','comparison.json','rows.jsonl','changes.csv','review.html','baseline-manifest.json','target-manifest.json','baseline.jsonl','target.jsonl'];
function parse(bytes){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('A retained comparison file is not complete UTF-8 JSON.','DATASET_STUDY_COMPARISON_CORRUPT',409);}}
async function sync(path){const handle=await open(path,constants.O_RDONLY);try{await handle.sync();}finally{await handle.close();}}
async function privateDirectory(path){
 let made=false;try{await mkdir(path,{mode:0o700});made=true;}catch(error){if(error.code!=='EEXIST')throw error;}
 const info=await lstat(path);need(info.isDirectory()&&!info.isSymbolicLink()&&(process.platform==='win32'||!(info.mode&0o077)),
  'Keep the original comparison directory private and unchanged.','DATASET_STUDY_COMPARISON_CORRUPT',409);
 if(made){await sync(path);await sync(dirname(path));}return path;
}
async function file(path,maximum=MAX_FILE){
 const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const info=await handle.stat();need(info.isFile()&&info.size<=maximum&&(process.platform==='win32'||!(info.mode&0o077)),
  'The retained comparison file is not an original private regular file.','DATASET_STUDY_COMPARISON_CORRUPT',409);return handle;}
 catch(error){await handle.close();throw error;}
}
async function read(path,maximum=MAX_META){const handle=await file(path,maximum);try{const bytes=await handle.readFile();need(bytes.length<=maximum,'The complete comparison metadata exceeds its limit.','DATASET_STUDY_COMPARISON_CAPACITY',413);return bytes;}finally{await handle.close();}}
async function maybe(path,maximum=MAX_META){try{return await read(path,maximum);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function hashHandle(handle,maximum=MAX_FILE){
 const digest=createHash('sha256');let bytes=0;
 for await(const chunk of handle.createReadStream({start:0,autoClose:false})){bytes+=chunk.length;need(bytes<=maximum,'The complete comparison output exceeds 256 MiB.','DATASET_STUDY_COMPARISON_CAPACITY',413);digest.update(chunk);}
 return {bytes,sha256:digest.digest('hex')};
}
async function verify(path,item){
 const handle=await file(path,item.bytes);
 try{const actual=await hashHandle(handle,item.bytes);need(actual.bytes===item.bytes&&actual.sha256===item.sha256,
  'The original comparison output changed.','DATASET_STUDY_COMPARISON_CORRUPT',409);return handle;}
 catch(error){await handle.close();throw error;}
}
async function retain(path,produce){
 const temporary=join(dirname(path),'.pending-'+randomUUID()),handle=await open(temporary,'wx',0o600),digest=createHash('sha256');let count=0;
 try{
  await produce(async bytes=>{bytes=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);count+=bytes.length;need(count<=MAX_FILE,
   'A complete comparison output exceeds 256 MiB. Retain the original results and compare smaller complete results.','DATASET_STUDY_COMPARISON_CAPACITY',413);digest.update(bytes);await handle.writeFile(bytes);});
  await handle.sync();await handle.close();
  const item={name:path.slice(path.lastIndexOf('/')+1),bytes:count,sha256:digest.digest('hex')};
  try{await link(temporary,path);}catch(error){if(error.code!=='EEXIST')throw error;const prior=await verify(path,item);await prior.close();}
  await sync(dirname(path));return item;
 }finally{await handle.close().catch(()=>{});await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
async function immutable(path,bytes){return retain(path,write=>write(bytes));}
async function nativeBytes(opened,maximum=MAX_META){
 try{need(opened.bytes<=maximum,'The original result metadata exceeds its complete allowance.','DATASET_STUDY_COMPARISON_CAPACITY',413);
  const bytes=Buffer.alloc(opened.bytes);let position=0;
  while(position<bytes.length){const result=await opened.readonlyFileHandle.read(bytes,position,bytes.length-position,position);need(result.bytesRead>0,'The selected original result ended early.','DATASET_STUDY_COMPARISON_CORRUPT',409);position+=result.bytesRead;}
  need(sha(bytes)===opened.sha256,'The original result metadata changed.','DATASET_STUDY_COMPARISON_CORRUPT',409);return bytes;
 }finally{await opened.readonlyFileHandle.close();}
}
async function* lines(handle,{start=0,signal}={}){
 const stream=handle.createReadStream({start,autoClose:false}),reader=createInterface({input:stream,crlfDelay:Infinity});
 try{for await(const line of reader){signal?.();need(line.length>0,'The complete original JSONL contains an empty record.','DATASET_STUDY_COMPARISON_CORRUPT',409);yield parse(Buffer.from(line));}}
 finally{reader.close();stream.destroy();}
}
function reportHeader(request){
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(request.title||'Saved result comparison')+'</title><style>'+
 'html{color-scheme:only light}body{font:15px system-ui,sans-serif;color:#17202a;background:#fff;margin:0;padding:24px;max-width:1200px}h1,h2,h3{line-height:1.25}section{border:1px solid #b7bec5;padding:16px;margin:16px 0;background:#fff;color:#17202a}p{line-height:1.5}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f5f6;color:#17202a;padding:12px}table{border-collapse:collapse;width:100%;display:block;overflow:auto}th,td{text-align:left;vertical-align:top;border:1px solid #ccd1d6;padding:8px;background:#fff;color:#17202a}th{background:#edf0f2;color:#17202a}code{overflow-wrap:anywhere}.identity{overflow-wrap:anywhere}summary{cursor:pointer}@media(max-width:480px){body{padding:12px}section{padding:10px}}@media print{details{display:block}summary{font-weight:bold}section{break-inside:avoid}}</style><main><h1>'+escape(request.title||'Saved result comparison')+
 '</h1><p>Complete comparison of two saved local operator query results. Original typed records are retained; missing or repeated row keys remain explicit groups and are not paired by position.</p><p class="identity">Comparison '+escape(request.id)+' · '+escape(request.createdAt)+'</p>'+
 ['baseline','target'].map(side=>{const x=request[side];return '<section><h2>'+ (side==='baseline'?'Baseline result':'Target result')+'</h2><p>'+escape(x.title||x.studyId)+' · saved revision '+x.storageRevision+' · '+x.rows+' original rows</p><p class="identity">Result '+escape(x.id)+'<br>Snapshot '+escape(x.snapshot)+'<br>Original manifest SHA-256 '+escape(x.manifestSha256)+'</p><pre>'+escape(x.query)+'</pre></section>';}).join('')+
 '<section><h2>Explicit field mapping</h2><table><thead><tr><th>Baseline field</th><th>Target field</th><th>Row key</th></tr></thead><tbody>'+request.fields.map(f=>'<tr><td>'+escape(f.baseline??'(absent)')+'</td><td>'+escape(f.target??'(absent)')+'</td><td>'+(f.key?'Yes':'No')+'</td></tr>').join('')+'</tbody></table></section><h2>Every original key group</h2>';
}
function reportRow(row){
 return '<section><h3>Group '+(row.ordinal+1)+' · '+escape(row.kind)+(row.moved?' · position changed':'')+'</h3><pre>'+escape(JSON.stringify(row.key,null,2))+'</pre>'+
 (row.reasons.length?'<p>'+escape(row.reasons.join('; '))+'</p>':'')+
 ['baseline','target'].map(side=>'<h4>'+escape(side)+' · '+row[side].length+' original row'+(row[side].length===1?'':'s')+'</h4>'+row[side].map(r=>'<p>Original result row '+(r.ordinal+1)+'</p><pre>'+escape(JSON.stringify(r.values,null,2))+'</pre>').join('')).join('')+
 (row.changes.length?'<h4>Typed field changes</h4><pre>'+escape(JSON.stringify(row.changes,null,2))+'</pre>':'')+'</section>';
}

/** This is a subordinate store: inputs are only verified COMPLETE exports from
 * the original studies owner. It never invokes a source or dataset query. */
export async function openDatasetStudyComparisons({directory,workspaceId,exportStatus,openExportFile}){
 const root=await privateDirectory(join(directory,'comparisons')),running=new Map(),cache=new Map(),verified=new Map();
 let closed=false,workTail=Promise.resolve(),lastGroup=null;
 const engine={coreSha256:sha(await readFile(new URL('./dataset-study-comparison-core.mjs',import.meta.url))),nativeSha256:sha(await readFile(new URL(import.meta.url)))};
 const id=value=>{need(typeof value==='string'&&UUID.test(value),'Choose the original comparison request UUID.');return value;};
 const home=value=>join(root,id(value));
 async function selected(resultId){
  need(HASH.test(resultId??''),'Choose an original completed result identifier.');
  const {export:status}=await exportStatus(resultId);need(status.status==='COMPLETE','Finish the original full result before comparing it.','DATASET_STUDY_COMPARISON_INCOMPLETE',409);
  const opened=await openExportFile(resultId,'manifest.json'),manifestSha256=opened.sha256,bytes=await nativeBytes(opened),manifest=parse(bytes);
  need(manifest.schema==='stellar-forge.local-dataset-result-manifest.v1'&&manifest.mode===MODE&&manifest.id===resultId&&
   manifest.studyId===status.studyId&&manifest.storageRevision===status.storageRevision&&manifest.rows===status.rows&&
   Array.isArray(manifest.fields)&&Array.isArray(manifest.source?.dataset?.columns),
   'The completed original result manifest differs.','DATASET_STUDY_COMPARISON_CORRUPT',409);
  const columns=manifest.fields.map(name=>manifest.source.dataset.columns.find(column=>column.name===name));
  need(columns.every(Boolean),'The original selected field schema is incomplete.','DATASET_STUDY_COMPARISON_CORRUPT',409);
  const data=manifest.files.find(item=>item.name==='dataset.jsonl');
  need(data&&Number.isSafeInteger(data.bytes)&&HASH.test(data.sha256),'The complete typed result is missing.','DATASET_STUDY_COMPARISON_CORRUPT',409);
  return {value:{id:resultId,title:manifest.title,studyId:manifest.studyId,storageRevision:manifest.storageRevision,
   source:clone(manifest.source),snapshot:manifest.selectedSnapshot,query:manifest.query,rows:manifest.rows,columns:clone(columns),
   manifestSha256,manifestBytes:bytes.length,data:clone(data),files:clone(status.files)},bytes};
 }
 async function inspect({baselineId,targetId}){
  const baseline=await selected(baselineId),target=await selected(targetId);
  need(baseline.value.data.bytes+target.value.data.bytes<=COMPARISON_INPUT_BYTES,'The two complete typed inputs exceed the 128 MiB comparison allowance. Keep these results and choose smaller complete original queries.','DATASET_STUDY_COMPARISON_CAPACITY',413);
  return {workspaceId,baseline:baseline.value,target:target.value,fields:suggestComparisonFields({baselineColumns:baseline.value.columns,targetColumns:target.value.columns})};
 }
 function requestInput(input){
  need(exact(input,['id','title','baselineId','targetId','baselineSha256','targetSha256','fields']),'Retain the complete original comparison request.');
  id(input.id);need(typeof input.title==='string'&&input.title.length<=240,'Keep the comparison title within 240 characters.');
  need(HASH.test(input.baselineId??'')&&HASH.test(input.targetId??'')&&HASH.test(input.baselineSha256??'')&&HASH.test(input.targetSha256??''),'Select both completed result IDs and their reviewed original manifest hashes.');
  need(Array.isArray(input.fields)&&input.fields.length<=128,'Retain every explicit field mapping.');
  const bytes=json(input);need(bytes.length<=65536,'The complete field mapping exceeds 64 KiB.','DATASET_STUDY_COMPARISON_CAPACITY',413);return bytes;
 }
 async function load(value){
  id(value);if(cache.has(value))return cache.get(value);
  const requestBytes=await read(join(home(value),'request.json')),request=parse(requestBytes);
  need(request.schema==='stellar-forge.dataset-study-comparison-request.v1'&&request.id===value&&request.mode===MODE&&request.workspaceId===workspaceId&&
   request.inputSha256===sha(requestInput(request.input))&&request.input.id===value&&
   request.input.baselineId===request.baseline.id&&request.input.targetId===request.target.id&&
   request.input.baselineSha256===request.baseline.manifestSha256&&request.input.targetSha256===request.target.manifestSha256&&
   request.title===request.input.title&&equal(request.fields,request.input.fields),
   'The original retained comparison request differs.','DATASET_STUDY_COMPARISON_CORRUPT',409);
  const plan=validateComparisonPlan({baselineColumns:request.baseline.columns,targetColumns:request.target.columns,fields:request.fields});
  need(equal(plan,request.plan),'The saved comparison field mapping differs.','DATASET_STUDY_COMPARISON_CORRUPT',409);
  const state={request,requestBytes,complete:null,error:null};
  const completed=await maybe(join(home(value),'complete.json'));
  if(completed){
   const complete=parse(completed),metadataBytes=await read(join(home(value),'comparison.json')),metadata=parse(metadataBytes);
   need(complete.schema==='stellar-forge.dataset-study-comparison-complete.v1'&&complete.id===value&&complete.inputSha256===request.inputSha256&&
    metadata.schema===COMPARISON_SCHEMA&&metadata.id===value&&metadata.inputSha256===request.inputSha256&&
    metadata.sha256===sha(json({...metadata,sha256:undefined}))&&equal(metadata.baseline,request.baseline)&&equal(metadata.target,request.target)&&equal(metadata.plan,request.plan)&&
    Array.isArray(complete.files)&&complete.files.length===9&&new Set(complete.files.map(f=>f.name)).size===9&&
    complete.files.every(f=>itemNames.includes(f.name)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&f.bytes<=MAX_FILE&&HASH.test(f.sha256))&&
    complete.files.find(f=>f.name==='comparison.json')?.sha256===sha(metadataBytes),
    'The complete comparison does not match its original request.','DATASET_STUDY_COMPARISON_CORRUPT',409);
   state.complete={metadata,files:complete.files};
  }
  if(cache.has(value))return cache.get(value);cache.set(value,state);return state;
 }
 function description(state){
  const r=state.request;
  return {...(state.complete?clone(state.complete.metadata):{schema:COMPARISON_SCHEMA,id:r.id,title:r.title,createdAt:r.createdAt,
   inputSha256:r.inputSha256,baseline:clone(r.baseline),target:clone(r.target),plan:clone(r.plan),sha256:null,groups:0,counts:null,rowCounts:null,moved:0}),
   index:undefined,workspaceId,status:state.complete?'COMPLETE':running.has(r.id)?'RUNNING':state.error?'PAUSED':'READY',
   files:clone(state.complete?.files??[]),...(state.error?{error:clone(state.error)}:{})};
 }
 async function list(){
  const comparisons=[],warnings=[];
  for(const name of (await readdir(root)).filter(n=>UUID.test(n)).sort()){
   try{comparisons.push(description(await load(name)));}
   catch(error){if(error.code==='ENOENT')continue;warnings.push({id:name,code:error.code?.startsWith('DATASET_')?error.code:'DATASET_STUDY_COMPARISON_UNAVAILABLE',message:'This retained comparison could not be read; its original files remain in place.'});}
  }
  return {workspaceId,comparisons,warnings};
 }
 const stopped=()=>need(!closed,'The comparison owner stopped. Resume this same retained request after reopening.','DATASET_STUDY_COMPARISON_INTERRUPTED',409);
 async function originalHandle(resultId,name,expected){
  const opened=await openExportFile(resultId,name);
  if(opened.bytes!==expected.bytes||opened.sha256!==expected.sha256){await opened.readonlyFileHandle.close();fail('A selected original result changed.','DATASET_STUDY_COMPARISON_SOURCE_CHANGED',409);}
  return opened.readonlyFileHandle;
 }
 async function* originalRows(r,side){
  const selected=r[side],handle=await originalHandle(selected.id,'dataset.jsonl',selected.data);
  try{yield* lines(handle,{signal:stopped});}finally{await handle.close();}
 }
 async function rowsFile(state){
  const item=state.complete.files.find(f=>f.name==='rows.jsonl'),path=join(home(state.request.id),'rows.jsonl');
  const handle=await file(path,item.bytes);
  try{
   const stat=await handle.stat({bigint:true}),signature=['dev','ino','size','mtimeNs','ctimeNs'].map(k=>String(stat[k])).join('/');
   need(stat.size===BigInt(item.bytes),'The complete comparison row file changed.','DATASET_STUDY_COMPARISON_CORRUPT',409);
   if(verified.get(state.request.id)!==signature){
    const actual=await hashHandle(handle,item.bytes),after=await handle.stat({bigint:true});
    need(actual.bytes===item.bytes&&actual.sha256===item.sha256&&['dev','ino','size','mtimeNs','ctimeNs'].every(k=>stat[k]===after[k]),'The original comparison row bytes changed.','DATASET_STUDY_COMPARISON_CORRUPT',409);
    verified.set(state.request.id,signature);
   }
   return handle;
  }catch(error){await handle.close();throw error;}
 }
 async function run(value){
  const state=await load(value),r=state.request,path=home(value);if(state.complete)return;
  state.error=null;lastGroup=null;
  try{
   stopped();need(equal(r.engine,engine),'This pending comparison retains an earlier comparison engine. Reopen it with its original installed source to resume; completed comparisons stay available.','DATASET_STUDY_COMPARISON_ENGINE_CHANGED',409);
   for(const side of ['baseline','target']){
    const original=await selected(r[side].id);need(equal(original.value,r[side]),'The original selected result identity changed.','DATASET_STUDY_COMPARISON_SOURCE_CHANGED',409);
    await immutable(join(path,side+'-manifest.json'),original.bytes);
    const handle=await originalHandle(r[side].id,'dataset.jsonl',r[side].data);
    try{const copied=await retain(join(path,side+'.jsonl'),async write=>{for await(const chunk of handle.createReadStream({start:0,autoClose:false})){stopped();await write(chunk);}});need(copied.bytes===r[side].data.bytes&&copied.sha256===r[side].data.sha256,'The complete original typed input changed during retention.','DATASET_STUDY_COMPARISON_SOURCE_CHANGED',409);}
    finally{await handle.close();}
   }
   let summary=null,position=0;
   const anchors=Object.fromEntries(COMPARISON_KINDS.map(kind=>[kind,[]])),totals=Object.fromEntries(COMPARISON_KINDS.map(kind=>[kind,0]));
   const rowItem=await retain(join(path,'rows.jsonl'),async write=>{
    const baselineRows=originalRows(r,'baseline'),targetRows=originalRows(r,'target');
    try{
     for await(const event of compareStudyRows({baselineColumns:r.baseline.columns,targetColumns:r.target.columns,fields:r.fields,
       baselineRows,targetRows,expectedBaselineRows:r.baseline.rows,expectedTargetRows:r.target.rows})){
      stopped();
      if(event.type==='summary'){summary=event.summary;continue;}
      const row=event.row,bytes=json(row);
      for(const kind of COMPARISON_KINDS)if(comparisonViewMatches(row,kind)){if(totals[kind]%256===0)anchors[kind].push({index:totals[kind],ordinal:row.ordinal,offset:position});totals[kind]++;}
      await write(bytes);position+=bytes.length;
     }
    }finally{await baselineRows.return?.();await targetRows.return?.();}
   });
   need(summary?.complete&&summary.groups===totals.all,'The complete comparison ended without its final original totals.','DATASET_STUDY_COMPARISON_CORRUPT',409);
   const rowHandle=await verify(join(path,'rows.jsonl'),rowItem);
   let csvItem;
   try{csvItem=await retain(join(path,'changes.csv'),async write=>{
    await write(['group','kind','moved','key_json','side','source_ordinal','values_json','changes_json'].map(csv).join(',')+'\r\n');
    for await(const row of lines(rowHandle,{signal:stopped}))for(const side of ['baseline','target'])for(const original of row[side])
     await write([row.ordinal+1,row.kind,row.moved,JSON.stringify(row.key),side,original.ordinal+1,JSON.stringify(original.values),JSON.stringify(row.changes)].map(csv).join(',')+'\r\n');
   });}finally{await rowHandle.close();}
   const htmlHandle=await verify(join(path,'rows.jsonl'),rowItem);let htmlItem;
   try{htmlItem=await retain(join(path,'review.html'),async write=>{
    await write(reportHeader(r));for await(const row of lines(htmlHandle,{signal:stopped}))await write(reportRow(row));
    await write('<section><h2>Complete totals</h2><pre>'+escape(JSON.stringify(summary,null,2))+'</pre></section><p>CSV preserves original values as quoted text. JSONL retains exact scalar types and distinguishes null from missing fields. These saved comparisons do not activate or modify a dataset.</p></main></html>');
   });}finally{await htmlHandle.close();}
   const metadata={schema:COMPARISON_SCHEMA,mode:MODE,id:r.id,title:r.title,createdAt:r.createdAt,inputSha256:r.inputSha256,engine:r.engine,
    baseline:r.baseline,target:r.target,plan:r.plan,counts:summary.counts,rowCounts:summary.rowCounts,moved:summary.moved,groups:summary.groups,
    fieldCounts:summary.fieldCounts,inputBytes:summary.inputBytes,order:summary.order,index:{stride:256,anchors,totals},rows:rowItem};
   metadata.sha256=sha(json(metadata));const metadataBytes=json(metadata);need(metadataBytes.length<=MAX_META,'The complete comparison index exceeds 8 MiB.','DATASET_STUDY_COMPARISON_CAPACITY',413);
   await immutable(join(path,'comparison.json'),metadataBytes);
   const files=[descriptor('request.json',state.requestBytes),descriptor('comparison.json',metadataBytes),rowItem,csvItem,htmlItem];
   for(const side of ['baseline','target']){
    const retained=await read(join(path,side+'-manifest.json'));
    files.push(descriptor(side+'-manifest.json',retained),{name:side+'.jsonl',bytes:r[side].data.bytes,sha256:r[side].data.sha256});
   }
   need(files.reduce((sum,f)=>sum+f.bytes,0)<=1024*1024*1024,'The complete comparison package exceeds 1 GiB.','DATASET_STUDY_COMPARISON_CAPACITY',413);
   stopped();await immutable(join(path,'complete.json'),json({schema:'stellar-forge.dataset-study-comparison-complete.v1',id:r.id,inputSha256:r.inputSha256,files}));
   await sync(path);await sync(root);state.complete={metadata,files};
  }catch(error){state.error={code:error.code?.startsWith('DATASET_')?error.code:'DATASET_STUDY_COMPARISON_UNAVAILABLE',
   message:error.code?.startsWith('DATASET_')?error.message:'The saved comparison could not finish. Its original request and inputs are retained; resume this same comparison.'};}
 }
 function start(value){
  if(!running.has(value)){const promise=workTail.then(()=>run(value)).finally(()=>{if(running.get(value)===promise)running.delete(value);});running.set(value,promise);workTail=promise.catch(()=>{});}
 }
 async function page(state,{kind='all',offset=0,limit=25}={}){
  need(COMPARISON_KINDS.includes(kind)&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,'Choose an original view and a page of 1–100 groups.');
  const result={rows:[],offset,limit,kind,total:state.complete?.metadata.index.totals[kind]??0,nextOffset:null};
  if(!state.complete||offset>=result.total)return result;
  const anchor=state.complete.metadata.index.anchors[kind][Math.floor(offset/256)];
  need(anchor,'The retained comparison page index is incomplete.','DATASET_STUDY_COMPARISON_CORRUPT',409);
  let logical=anchor.index,ordinal=anchor.ordinal,size=0;const handle=await rowsFile(state);
  try{
   for await(const row of lines(handle,{start:anchor.offset})){
    need(row.ordinal===ordinal++,'The retained original comparison row order changed.','DATASET_STUDY_COMPARISON_CORRUPT',409);
    if(!comparisonViewMatches(row,kind))continue;
    if(logical++<offset)continue;
    const bytes=json(row).length;
    if(size+bytes>MAX_PAGE){
     if(!result.rows.length){lastGroup={id:state.request.id,signature:verified.get(state.request.id),row};result.rows.push({ordinal:row.ordinal,kind:row.kind,...boundedKey(row.key),reasons:row.reasons,moved:row.moved,
       baselineCount:row.baseline.length,targetCount:row.target.length,completeGroupBytes:bytes,wholeFileAvailable:true,
       message:'This complete key group is larger than the browser page. Open its original members or download the complete rows.jsonl.'});}
     else logical--;
     break;
    }
    result.rows.push(row);size+=bytes;if(result.rows.length===limit)break;
   }
  }finally{await handle.close();}
  result.nextOffset=logical<result.total?logical:null;return result;
 }
 async function readComparison({id:value,kind='all',offset=0,limit=25}){
  const state=await load(value);return {comparison:description(state),page:await page(state,{kind,offset,limit})};
 }
 async function members({id:value,ordinal,side,offset=0,limit=25}){
  need(Number.isSafeInteger(ordinal)&&ordinal>=0&&['baseline','target'].includes(side)&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,'Select an original group, side and member page.');
  const state=await load(value);need(state.complete&&ordinal<state.complete.metadata.groups,'Complete the selected comparison before opening a key group.','DATASET_STUDY_COMPARISON_INCOMPLETE',409);
  const anchor=state.complete.metadata.index.anchors.all[Math.floor(ordinal/256)],handle=await rowsFile(state);let expected=anchor.ordinal,row=null;
  try{
   if(lastGroup?.id===value&&lastGroup.signature===verified.get(value)&&lastGroup.row.ordinal===ordinal)row=lastGroup.row;
   else for await(const item of lines(handle,{start:anchor.offset})){
    need(item.ordinal===expected++,'The retained original comparison row order changed.','DATASET_STUDY_COMPARISON_CORRUPT',409);
    if(item.ordinal===ordinal){row=item;lastGroup={id:value,signature:verified.get(value),row};break;}
   }
  }finally{await handle.close();}
  need(row,'The retained comparison group was not found.','DATASET_STUDY_COMPARISON_CORRUPT',409);
  const values=[];let size=0,index=offset,oversized=null;
  while(index<row[side].length&&values.length<limit){const bytes=json(row[side][index]).length;if(size+bytes>MAX_PAGE){if(!values.length){oversized={index,bytes,wholeFileAvailable:true};index++;}break;}values.push(clone(row[side][index++]));size+=bytes;}
  return {comparisonId:value,comparisonSha256:state.complete.metadata.sha256,ordinal,kind:row.kind,...boundedKey(row.key),reasons:clone(row.reasons),
   side,rows:values,page:{offset,limit,total:row[side].length,nextOffset:index<row[side].length?index:null,...(oversized?{oversized}:{})}};
 }
 async function create(input){
  stopped();const bytes=requestInput(input),inputSha256=sha(bytes),path=home(input.id);
  const prior=await maybe(join(path,'request.json'));
  if(prior){
   const state=await load(input.id);need(state.request.inputSha256===inputSha256&&equal(state.request.input,input),
    'This comparison UUID already belongs to a different original request. Retain it and choose a new UUID for changed selections.','DATASET_STUDY_COMPARISON_CONFLICT',409);
   await sync(path);await sync(root);if(!state.complete)start(input.id);return readComparison({id:input.id});
  }
  const source=await inspect(input);need(source.baseline.manifestSha256===input.baselineSha256&&source.target.manifestSha256===input.targetSha256,
   'One selected original result manifest differs from the reviewed source. Inspect it before preparing another request.','DATASET_STUDY_COMPARISON_SOURCE_CHANGED',409);
  const plan=validateComparisonPlan({baselineColumns:source.baseline.columns,targetColumns:source.target.columns,fields:input.fields});
  const request={schema:'stellar-forge.dataset-study-comparison-request.v1',mode:MODE,workspaceId,id:input.id,title:input.title,createdAt:new Date().toISOString(),
   engine:clone(engine),input:clone(input),inputSha256,baseline:source.baseline,target:source.target,fields:clone(input.fields),plan};
  await privateDirectory(path);
  try{await immutable(join(path,'request.json'),json(request));}
  catch(error){if(error.code!=='DATASET_STUDY_COMPARISON_CORRUPT')throw error;const winner=await load(input.id);need(winner.request.inputSha256===inputSha256&&equal(winner.request.input,input),'A competing original request already owns this comparison UUID.','DATASET_STUDY_COMPARISON_CONFLICT',409);}
  await load(input.id);start(input.id);return readComparison({id:input.id});
 }
 async function resume(value){stopped();const state=await load(value);if(!state.complete)start(value);return readComparison({id:value});}
 async function openFile(value,name){
  need(itemNames.includes(name),'Choose an original comparison file.','DATASET_STUDY_FILE_NOT_FOUND',404);
  const state=await load(value);need(state.complete,'Finish the complete comparison before downloading its package.','DATASET_STUDY_COMPARISON_INCOMPLETE',409);
  const item=state.complete.files.find(f=>f.name===name),handle=await verify(join(home(value),name),item);
  return {readonlyFileHandle:handle,...item,type:name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.csv')?'text/csv; charset=utf-8':name.endsWith('.jsonl')?'application/x-ndjson; charset=utf-8':'application/json; charset=utf-8'};
 }
 return {inspect,list,create,read:readComparison,members,resume,openFile,wait:async value=>{id(value);await running.get(value);return readComparison({id:value});},
  close:async()=>{closed=true;await Promise.allSettled([...running.values()]);lastGroup=null;}};
}
