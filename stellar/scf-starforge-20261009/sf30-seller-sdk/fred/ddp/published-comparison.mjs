// MIT. Complete source-native current-publication comparison and disk-backed reports.
import { createWriteStream } from 'node:fs';
import { constants } from 'node:fs';
import { mkdir,writeFile,open,lstat,rename,readdir,unlink } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { once } from 'node:events';
import { createHash,randomUUID } from 'node:crypto';
import { finished } from 'node:stream/promises';
import { canonical,need,exactDifference,plain } from '../model.mjs';
import { withPrivateLock,atomicJson,readPrivateJson } from '../../routescan/quota.mjs';
import { inspectFredDdpPackage } from './package.mjs';
import { inspectFredDdpCrosswalk } from './crosswalk.mjs';
import { validateFredDdpMigrationPlan } from './migration.mjs';
import { fredDdpFileBytes,ddpDigest } from './files.mjs';
import { readFredDdpZip } from './zip.mjs';
import { normalizeFredDdpPeriod,inferredFredDdpPeriodRule,fredDdpObservationMissing,exactFredDdpScaledValue } from './periods.mjs';
import { readFredPublishedTarget,validateFredPublishedManifest } from './published-source.mjs';

const statuses=['EQUAL','DIFFERENT','BOTH_MISSING','MISSING_CHANGED','SOURCE_ONLY','TARGET_ONLY'];
const counts=()=>Object.fromEntries(statuses.map(status=>[status,0]));
const uint=value=>Number.isSafeInteger(value)&&value>=0;
const same=(a,b)=>canonical(a)===canonical(b);
const conflict=message=>need(false,message,'FRED_PUBLISHED_OUTPUT_CONFLICT',409);
const csvCell=value=>{const s=value===null||value===undefined?'':String(value);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function utf8Offsets(text){
  const points=[];let extra=0;
  for(let i=0;i<text.length;i++){
    const c=text.charCodeAt(i);if(c<=127)continue;
    if(c>=0xd800&&c<=0xdbff&&i+1<text.length){extra+=2;i++;}else extra+=c<=2047?1:2;
    points.push([i+1,extra]);
  }
  return offset=>{let a=0,b=points.length;while(a<b){const m=(a+b)>>>1;if(points[m][0]<=offset)a=m+1;else b=m;}return offset+(a?points[a-1][1]:0);};
}
async function sink(path){
  const stream=createWriteStream(path,{flags:'wx',mode:0o600}),hash=createHash('sha256');let bytes=0,failure=null;
  stream.on('error',error=>{failure=error;});
  const completion=finished(stream,{cleanup:true});completion.catch(()=>{});
  try{await once(stream,'open');}catch(error){await completion.catch(()=>{});throw error;}
  return {async write(text){
    if(failure)throw failure;need(!stream.destroyed&&!stream.writableEnded,'The complete report stream closed before its rows were written.');
    const b=Buffer.from(text),ready=stream.write(b);if(failure)throw failure;if(!ready)await once(stream,'drain');
    if(failure)throw failure;hash.update(b);bytes+=b.length;
  },async close(){stream.end();await completion;return {name:path.split('/').at(-1),bytes,sha256:hash.digest('hex')};},
    async abort(){stream.destroy();await completion.catch(()=>{});}};
}

function sourceContext({packageCapture,crosswalk,plan,manifest,directory}={}){
  const source=inspectFredDdpPackage(packageCapture),mapping=inspectFredDdpCrosswalk(crosswalk);
  validateFredDdpMigrationPlan(plan,{packageCapture,crosswalk});
  validateFredPublishedManifest(manifest);
  need(plan.summary.ready&&manifest.planId===plan.id&&manifest.packageId===source.id&&manifest.crosswalkId===mapping.id&&manifest.errors.length===0,'Receive this same complete source population and current target collection.');
  const targets=new Map(manifest.captures.map(capture=>[capture.seriesId,capture])),original=new Map(source.series.map(series=>[series.id,series]));
  const selected=plan.series.filter(series=>series.mappingStatus==='MAPPED'),expected=new Set(selected.map(series=>series.fredSeriesId));
  need(targets.size===expected.size&&[...expected].every(id=>targets.has(id)),'The complete current published target inventory differs from the original mapping.');
  return {packageCapture,crosswalk,plan,manifest,directory,source,mapping,targets,original,selected};
}
function targetMeaning(selected,capture){
  for(const [field,key] of [['expectedFredUnits','Units'],['expectedFredFrequency','Frequency'],['expectedFredSeasonalAdjustment','Seasonal Adjustment']])
    need(selected.binding[field]===null||selected.binding[field]===capture.metadata[key],
      'The original published '+key+' differs from the reviewed source meaning for '+selected.fredSeriesId+'.');
}
const retrievalRange=manifest=>{
  const times=manifest.captures.flatMap(c=>c.files.map(f=>f.retrievedAt)).sort((a,b)=>Date.parse(a)-Date.parse(b));
  return {from:times[0],through:times.at(-1)};
};
async function exactReportFile(outputDirectory,descriptor){
  need(plain(descriptor)&&uint(descriptor.bytes)&&/^[a-f0-9]{64}$/.test(descriptor.sha256),'The retained report file descriptor changed.');
  const file=await open(join(outputDirectory,descriptor.name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const info=await file.stat();need(info.isFile()&&info.size===descriptor.bytes,'The complete retained report file changed.');
    const digest=createHash('sha256');let bytes=0;
    for await(const chunk of file.createReadStream({autoClose:false})){digest.update(chunk);bytes+=chunk.length;}
    need(bytes===descriptor.bytes&&digest.digest('hex')===descriptor.sha256,'The complete retained report bytes changed.');
  }finally{await file.close();}
}
async function completedReport(outputDirectory,context){
  let report;try{report=await readPrivateJson(join(outputDirectory,'comparison.json'),64*1024*1024);}catch(error){if(error.code==='ENOENT')return null;throw error;}
  const {source,mapping,plan,manifest,selected,targets,directory}=context,{id,...core}=report;
  need(report.schema==='stellar-forge.fred-ddp-current-publication-comparison.v1'&&report.basis==='CURRENT_PUBLICATION_RETRIEVAL'&&
    id==='fred-current-publication-comparison-'+ddpDigest(core),'The completed comparison identity changed.');
  if(report.packageId!==source.id||report.packageSha256!==source.captureSha256||report.crosswalkId!==mapping.id||
    report.crosswalkSha256!==mapping.captureSha256||report.sourcePlanId!==plan.id)
    conflict('This completed output belongs to another source edition or reviewed plan; choose its own output directory.');
  need(same(report.sourceFile,source.source)&&same(report.originalMembers,source.files)&&same(report.sourceHeader,source.header.documents)&&
    report.sourceLocationBasis==='UTF8_BYTE_OFFSETS_END_EXCLUSIVE'&&report.differenceBasis==='TARGET_MINUS_SOURCE_AFTER_EXPLICIT_SCALES',
    'The completed report lost its exact original Board source context.');
  need(Array.isArray(report.series)&&report.series.length===selected.length,'The completed report series population changed.');
  const totals=counts();let sourceRows=0,rows=0;
  for(let index=0;index<selected.length;index++){
    const item=selected[index],saved=report.series[index],capture=targets.get(item.fredSeriesId),series=context.original.get(item.id);
    targetMeaning(item,capture);
    if(saved.sourceSeriesId!==item.id||saved.boardSeriesId!==series.boardSeriesId||saved.fredSeriesId!==item.fredSeriesId||
      saved.targetSourceId!==capture.id||!same(saved.targetFiles,capture.files)||!same(saved.targetMetadata,capture.metadata)||
      !same(saved.window,item.window)||saved.sourceScale!==item.binding.sourceScale||saved.targetScale!==item.binding.targetScale||
      saved.sourcePeriodRule!==item.binding.periodRule)
      conflict('The retained comparison belongs to another original target capture or reviewed source meaning.');
    need(saved.sourceObservationCount===item.sourceIndices.length&&saved.targetOriginalObservationCount===capture.observationCount&&
      uint(saved.targetSelectedObservationCount)&&saved.targetSelectedObservationCount<=capture.observationCount&&plain(saved.counts)&&
      plain(saved.sourceMissingCodes),'The retained original per-series observation counts changed.');
    let local=0;for(const status of statuses){need(uint(saved.counts[status]),'The completed comparison status counts changed.');totals[status]+=saved.counts[status];local+=saved.counts[status];}
    need(local-saved.counts.TARGET_ONLY===saved.sourceObservationCount&&
      local-saved.counts.SOURCE_ONLY===saved.targetSelectedObservationCount&&
      Object.values(saved.sourceMissingCodes).every(uint)&&Object.values(saved.sourceMissingCodes).reduce((sum,n)=>sum+n,0)<=saved.sourceObservationCount,
      'The complete retained observation population is inconsistent.');
    sourceRows+=saved.sourceObservationCount;rows+=local;
  }
  need(same(report.summary,{seriesCount:selected.length,sourceObservationCount:sourceRows,targetOriginalObservationCount:manifest.observationCount,
    rowCount:rows,counts:totals})&&same(report.targetRetrieval,retrievalRange(manifest)),'The completed report summary or retrieval population changed.');
  need(Array.isArray(report.files)&&same(report.files.map(file=>file.name),['observations.csv','observations.jsonl'])&&
    report.rowIndex?.stride===4096&&Array.isArray(report.rowIndex.rows)&&report.rowIndex.rows.length===Math.ceil(rows/4096),
    'The completed report must retain both full row files and the original row index.');
  for(let index=0;index<report.rowIndex.rows.length;index++){
    const point=report.rowIndex.rows[index];need(point.row===index*4096&&uint(point.byte)&&point.byte<report.files[1].bytes&&
      (index===0?point.byte===0:point.byte>report.rowIndex.rows[index-1].byte),'The retained complete report row index changed.');
  }
  for(const capture of manifest.captures)await readFredPublishedTarget(directory,capture);
  for(const file of report.files)await exactReportFile(outputDirectory,file);
  return report;
}

/** Reopen only a completed report whose entire source context and row bytes still match. */
export async function readFredDdpCurrentPublicationComparison(outputDirectory,context={}){
  return completedReport(resolve(outputDirectory),sourceContext(context));
}
async function retireIncomplete(outputDirectory){
  const names=(await readdir(outputDirectory)).filter(name=>['observations.csv','observations.jsonl','report.html'].includes(name)||name.startsWith('.report-'));
  if(!names.length)return;
  const destination=join(outputDirectory,'interrupted-'+Date.now()+'-'+randomUUID());await mkdir(destination,{mode:0o700});
  for(const name of names){const info=await lstat(join(outputDirectory,name));need(info.isFile()&&!info.isSymbolicLink(),'The incomplete report member changed.');await rename(join(outputDirectory,name),join(destination,name));}
}

export async function compareFredDdpCurrentPublication(options={}){
  const context=sourceContext(options),outputDirectory=resolve(options.outputDirectory);await mkdir(outputDirectory,{recursive:true,mode:0o700});
  const info=await lstat(outputDirectory);need(info.isDirectory()&&!info.isSymbolicLink(),'Select the original report directory.');
  return withPrivateLock(outputDirectory,'current-publication-comparison.lock',async()=>{
    const report=await completedReport(outputDirectory,context);
    if(report){await writeReportHtml(outputDirectory,report);if(options.onProgress)await options.onProgress({step:'comparison-reused',id:report.id,series:report.summary.seriesCount,rows:report.summary.rowCount});return report;}
    await retireIncomplete(outputDirectory);return buildComparison({...options,...context,outputDirectory});
  });
}

async function buildComparison({packageCapture,plan,manifest,directory,outputDirectory,onProgress,source,mapping,targets,original,selected}){
  const primary=fredDdpFileBytes(packageCapture.file),rawMembers=packageCapture.format==='board-sdmx-zip'?readFredDdpZip(primary):
    [{filename:packageCapture.file.name,bytes:primary,sha256:packageCapture.file.sha256}];
  for(const file of packageCapture.supplementalFiles??[])rawMembers.push({filename:file.name,bytes:fredDdpFileBytes(file),sha256:file.sha256});
  const members=new Map(rawMembers.map(member=>[member.filename,{...member,offset:utf8Offsets(member.bytes.toString('utf8'))}]));
  const selectedSeries=selected;let fullCsv,jsonl;
  try{
  fullCsv=await sink(join(outputDirectory,'observations.csv'));jsonl=await sink(join(outputDirectory,'observations.jsonl'));
  const columns=['index','source_series_id','board_series_id','fred_series_id','source_period','period_key','status','source_value','source_status','target_date','target_value','difference','source_file_sha256','source_byte_start','source_byte_end','target_file_sha256','target_byte_start','target_byte_end'];
  await fullCsv.write(columns.join(',')+'\n');
  const totals=counts(),seriesResults=[],index=[];let rows=0,jsonlBytes=0;
  const append=async row=>{
    row.index=rows++;totals[row.status]++;
    const line=JSON.stringify(row)+'\n';if(row.index%4096===0)index.push({row:row.index,byte:jsonlBytes});jsonlBytes+=Buffer.byteLength(line);
    await jsonl.write(line);await fullCsv.write(columns.map(column=>csvCell(row[column])).join(',')+'\n');
  };
  for(const selected of selectedSeries){
    const series=original.get(selected.id),target=await readFredPublishedTarget(directory,targets.get(selected.fredSeriesId));
    targetMeaning(selected,target.capture);
    const rule=inferredFredDdpPeriodRule({label:target.capture.metadata.Frequency}),targetOffset=utf8Offsets(target.csv.toString('utf8'));
    const targetRows=target.rows.map(row=>({...row,key:normalizeFredDdpPeriod(row.date,rule).key})).filter(row=>
      selected.window.start!==null&&selected.window.end!==null&&row.key>=selected.window.start&&row.key<=selected.window.end);
    const byPeriod=new Map();for(const row of targetRows){need(!byPeriod.has(row.key),'The native target period population must remain unique.');byPeriod.set(row.key,row);}
    const local=counts(),sourceMissingCodes={},matched=new Set(),sourcePeriods=new Set();
    const context={source_series_id:series.id,board_series_id:series.boardSeriesId,fred_series_id:selected.fredSeriesId};
    for(const sourceIndex of selected.sourceIndices){
      const observation=series.observations[sourceIndex],periodKey=normalizeFredDdpPeriod(observation.period,selected.binding.periodRule).key,after=byPeriod.get(periodKey);
      need(!sourcePeriods.has(periodKey),'The native source period population must remain unique after its reviewed calendar rule.');sourcePeriods.add(periodKey);
      const beforeMissing=fredDdpObservationMissing(observation.value,observation.status);if(beforeMissing)sourceMissingCodes[observation.status??'UNSPECIFIED']=(sourceMissingCodes[observation.status??'UNSPECIFIED']??0)+1;
      let status,difference=null;
      if(!after)status='SOURCE_ONLY';else{
        matched.add(after.index);
        if(beforeMissing&&after.missing)status='BOTH_MISSING';
        else if(beforeMissing!==after.missing)status='MISSING_CHANGED';
        else{const a=exactFredDdpScaledValue(observation.value,selected.binding.sourceScale),b=exactFredDdpScaledValue(after.value,selected.binding.targetScale);need(a!==null&&b!==null,'Retain supported original numeric strings.');difference=exactDifference(a,b);status=difference==='0'?'EQUAL':'DIFFERENT';}
      }
      local[status]++;const member=members.get(observation.location.filename);need(member,'Original XML observation member disappeared.');
      await append({...context,source_period:observation.period,period_key:periodKey,status,source_value:observation.value,source_status:observation.status,
        target_date:after?.date??null,target_value:after?.value??null,difference,
        source_file_sha256:member.sha256,source_byte_start:member.offset(observation.location.start),source_byte_end:member.offset(observation.location.end),
        target_file_sha256:target.observationsDescriptor.sha256,target_byte_start:after?targetOffset(after.location.start):null,target_byte_end:after?targetOffset(after.location.end):null});
    }
    for(const after of targetRows)if(!matched.has(after.index)){local.TARGET_ONLY++;await append({...context,source_period:null,period_key:after.key,status:'TARGET_ONLY',source_value:null,source_status:null,
      target_date:after.date,target_value:after.value,difference:null,source_file_sha256:null,source_byte_start:null,source_byte_end:null,
      target_file_sha256:target.observationsDescriptor.sha256,target_byte_start:targetOffset(after.location.start),target_byte_end:targetOffset(after.location.end)});}
    const result={sourceSeriesId:series.id,boardSeriesId:series.boardSeriesId,fredSeriesId:selected.fredSeriesId,title:series.title,
      sourceObservationCount:selected.sourceIndices.length,targetOriginalObservationCount:target.rows.length,targetSelectedObservationCount:targetRows.length,
      counts:local,sourceMissingCodes,sourceFrequency:series.frequency,targetFrequency:target.capture.metadata.Frequency,sourceUnits:series.unit,targetUnits:target.capture.metadata.Units,
      sourceMultiplier:series.multiplier,sourceScale:selected.binding.sourceScale,targetScale:selected.binding.targetScale,sourcePeriodRule:selected.binding.periodRule,targetPeriodRule:rule,
      targetSourceId:target.capture.id,targetFiles:target.capture.files,targetMetadata:target.capture.metadata,window:selected.window};
    seriesResults.push(result);if(onProgress)await onProgress({series:seriesResults.length,of:selectedSeries.length,rows,fredSeriesId:selected.fredSeriesId,counts:local});
  }
  const files=[await fullCsv.close(),await jsonl.close()];
  const core={schema:'stellar-forge.fred-ddp-current-publication-comparison.v1',basis:'CURRENT_PUBLICATION_RETRIEVAL',
    packageId:source.id,packageSha256:source.captureSha256,crosswalkId:mapping.id,crosswalkSha256:mapping.captureSha256,sourcePlanId:plan.id,
    sourceFile:source.source,originalMembers:source.files,sourceHeader:source.header.documents,
    series:seriesResults,summary:{seriesCount:seriesResults.length,sourceObservationCount:selectedSeries.reduce((sum,series)=>sum+series.sourceIndices.length,0),targetOriginalObservationCount:manifest.observationCount,rowCount:rows,counts:totals},
    targetRetrieval:retrievalRange(manifest),
    files,rowIndex:{stride:4096,rows:index},sourceLocationBasis:'UTF8_BYTE_OFFSETS_END_EXCLUSIVE',differenceBasis:'TARGET_MINUS_SOURCE_AFTER_EXPLICIT_SCALES'};
  const report={...core,id:'fred-current-publication-comparison-'+ddpDigest(core)};
  await writeReportHtml(outputDirectory,report);
  // The durable completion record is committed after both closed row files and
  // derived HTML. Interrupted attempts retain their exact bytes for continuation.
  await atomicJson(outputDirectory,'comparison.json',report,{exclusive:true});return report;
  }catch(error){await Promise.allSettled([fullCsv?.abort(),jsonl?.abort()]);throw error;}
}

async function writeReportHtml(outputDirectory,report){
  const seriesResults=report.series,totals=report.summary.counts;
  const labels={EQUAL:'Equal figures',DIFFERENT:'Different figures',BOTH_MISSING:'Unavailable in both',
    MISSING_CHANGED:'Availability differs',SOURCE_ONLY:'Board periods only',TARGET_ONLY:'FRED periods only'};
  const number=value=>value.toLocaleString('en-US');
  const missing=series=>Object.values(series.sourceMissingCodes).reduce((sum,count)=>sum+count,0);
  const unavailable=seriesResults.reduce((sum,series)=>sum+missing(series),0);
  // Without availability changes, every source missing observation is either
  // missing in both or source-only. This derives the exact original breakdown
  // without changing or recreating the retained full row files.
  const sourceOnlyMissing=totals.MISSING_CHANGED===0?unavailable-totals.BOTH_MISSING:null;
  const availability=sourceOnlyMissing!==null&&sourceOnlyMissing>=0&&sourceOnlyMissing<=totals.SOURCE_ONLY?
    '<p>'+number(sourceOnlyMissing)+' of the '+number(totals.SOURCE_ONLY)+' Board-only periods contain unavailable Board data.</p>':'';
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Published-data comparison</title><style>body{font:14px system-ui,sans-serif;color:#171717;background:#fafafa;margin:0}main{max-width:1500px;padding:28px;margin:auto}h1{font-size:24px;font-weight:600}p{line-height:1.5}input{font:inherit;border:1px solid #999;padding:9px;width:min(440px,90%);background:white}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{text-align:left;padding:9px;border-bottom:1px solid #ccc}th{background:#e8e8e8}tbody tr:nth-child(even){background:#f0f0f0}.number{text-align:right;font-variant-numeric:tabular-nums}.scroll{overflow:auto}a{color:inherit}small{color:#555}</style><main>
<h1>Published-data comparison</h1><p>${number(report.summary.seriesCount)} mapped source series · ${number(report.summary.sourceObservationCount)} original Board observations · ${number(report.summary.targetOriginalObservationCount)} retained FRED observations.</p>
<p>All selected original periods use the saved calendar rules, including daily, weekly, biweekly, monthly, quarterly, semiannual and annual representations. Original numeric strings, missing statuses and exact original-file byte ranges remain in every record. Target sources use the current publication collected ${escape(report.targetRetrieval.from)} through ${escape(report.targetRetrieval.through)}.</p>
<p>The Board statuses NA (Not available), ND (No data) and NC (Not calculable) retain their original values and compare as missing. ${number(unavailable)} selected Board observations are unavailable. Periods present in only one source describe coverage; figure differences and availability changes appear separately.</p>${availability}
<p><a href="observations.csv">Complete observations CSV</a> · <a href="observations.jsonl">Complete observations JSONL</a> · <a href="comparison.json">Report and source context JSON</a></p>
<div class="scroll"><table><thead><tr>${statuses.map(status=>'<th>'+escape(labels[status])+'</th>').join('')}</tr></thead><tbody><tr>${statuses.map(status=>'<td class="number">'+number(totals[status])+'</td>').join('')}</tr></tbody></table></div>
<p><input id="filter" placeholder="Find a Board series, FRED series or title" aria-label="Filter original series"></p>
<div class="scroll"><table id="series"><thead><tr><th>Board / FRED series</th><th>Original frequency</th><th>Board periods</th><th>Different figures</th><th>Availability differs</th><th>Board only</th><th>FRED only</th><th>Unavailable in both</th></tr></thead><tbody>${seriesResults.map(series=>'<tr><td><strong>'+escape(series.boardSeriesId)+'</strong><br><a href="https://fred.stlouisfed.org/data/'+encodeURIComponent(series.fredSeriesId)+'">'+escape(series.fredSeriesId)+'</a><br><small>'+escape(series.title)+'</small></td><td>'+escape(series.sourceFrequency.label??series.sourceFrequency.code)+'<br><small>'+escape(series.targetFrequency)+'</small></td><td class="number">'+number(series.sourceObservationCount)+'</td>'+['DIFFERENT','MISSING_CHANGED','SOURCE_ONLY','TARGET_ONLY','BOTH_MISSING'].map(status=>'<td class="number">'+number(series.counts[status])+'</td>').join('')+'</tr>').join('')}</tbody></table></div>
<p><small>Comparison ${escape(report.id)}. Difference is FRED minus Board after the saved exact scale factors. Source and target units, original missing codes and period conventions remain in the complete report.</small></p></main><script>document.querySelector("#filter").addEventListener("input",e=>{const q=e.target.value.toLowerCase();for(const row of document.querySelectorAll("#series tbody tr"))row.hidden=!row.textContent.toLowerCase().includes(q);});</script></html>`;
  const temporary=join(outputDirectory,'.report-'+randomUUID());
  try{await writeFile(temporary,html,{flag:'wx',mode:0o600});await rename(temporary,join(outputDirectory,'report.html'));}
  finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
