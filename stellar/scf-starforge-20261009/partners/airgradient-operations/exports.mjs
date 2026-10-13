// SPDX-License-Identifier: MIT
import {join,dirname} from 'node:path';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {privateDirectory,readPrivate,publish} from '../open-meteo-operations/files.mjs';
import {need,encoded,sha,digest,MAX_PACKAGE} from './contract.mjs';
import {normalizeCapture,reportingBins} from './source.mjs';

const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>v===null||v===undefined?'—':Number(v).toLocaleString('en',{maximumFractionDigits:3});
function sourceLink(value){
 const name=typeof value?.name==='string'?value.name:'Source';if(typeof value?.url!=='string')return escape(name);
 try{const url=new URL(value.url);if(!['http:','https:'].includes(url.protocol))return escape(name);return '<a href="'+escape(url.href)+'" rel="noopener noreferrer">'+escape(name)+'</a>';}catch{return escape(name);}
}

function cell(v){if(v===null||v===undefined)return '';if(typeof v==='number'){need(Number.isFinite(v),'NONFINITE_CSV');return String(v);}let value=String(v);if(/^[\s]*[=+\-@]/.test(value))value="'"+value;return '"'+value.replaceAll('"','""')+'"';}
const csvRow=v=>v.map(cell).join(',')+'\r\n';
export function summaryCsv(report){
 const rows=[['source_type','location_id','location_key','location','measure','unit','period_start_utc','period_end_utc','bucket','expected_buckets','available_buckets','coverage','mean_of_returned_bucket_means','minimum_bucket_mean','maximum_bucket_mean','status','operator_threshold','threshold_buckets','baseline_mean','mean_change']];
 for(const r of report.rows)rows.push([r.sourceType,r.locationId,r.locationKey,r.label,r.measure,r.unit,report.period.start,report.period.end,report.period.bucket,r.expectedBuckets,r.availableBuckets,r.coverage,r.mean,r.minimum,r.maximum,r.status,r.threshold?r.threshold.operator+' '+r.threshold.value:null,r.thresholdBuckets,r.comparison?.baselineMean,r.comparison?.meanChange]);
 return Buffer.from(rows.map(csvRow).join(''));
}
function selectedSeries(report,handover){
 const plan=handover.plans.find(x=>x.id===report.planId),connection=handover.connections.find(x=>x.id===plan.connectionId),project=handover.projects.find(x=>x.id===plan.projectId);
 const selected=new Map(report.sources.map(c=>[c.id,c])),tasks=new Map(plan.tasks.map(x=>[x.key,x])),rows=[];
 for(const capture of handover.captures){const meta=selected.get(capture.metadata.id);if(!meta)continue;need(meta.sha256===capture.metadata.sha256,'EXPORT_SOURCE_CHANGED');
  const raw=Buffer.from(capture.rawBase64,'base64');need(raw.length===meta.bytes&&sha(raw)===meta.rawSha256,'EXPORT_SOURCE_BYTES_CHANGED');
  rows.push(...normalizeCapture(raw,tasks.get(meta.taskKey),connection,plan.period).series.filter(r=>project.value.measures.includes(r.measure)).map(r=>({...r,captureId:meta.id})));
 }
 rows.sort((a,b)=>a.locationKey.localeCompare(b.locationKey)||a.measure.localeCompare(b.measure)||a.utc.localeCompare(b.utc));
 need(rows.length===report.seriesRows&&digest(rows)===report.seriesSha256,'EXPORT_SERIES_CHANGED');return rows;
}
export function seriesCsv(report,handover){
 const retained=report.sources.some(c=>c.origin==='retained-source'),extra=retained?['source_origin','source_collection_id','source_path','retrieval_window_start','retrieval_window_end']:[];
 const rows=[csvRow(['source_type','location_id','location_key','location','measure','unit','provider_timestamp_utc','local_display','iana_timezone','reporting_bucket','value','original_value','returned_datapoints','capture_id','source_sha256','source_url','retrieved_at',...extra])];
 const byLocation=new Map(report.rows.map(r=>[r.locationKey,r])),captures=new Map(report.sources.map(c=>[c.id,c])),formatters=new Map();
 for(const row of selectedSeries(report,handover)){const location=byLocation.get(row.locationKey),capture=captures.get(row.captureId);
  if(!formatters.has(location.timezone))formatters.set(location.timezone,new Intl.DateTimeFormat('en-CA',{timeZone:location.timezone,dateStyle:'short',timeStyle:'long'}));
  rows.push(csvRow([row.sourceType,row.locationId,row.locationKey,location.label,row.measure,row.unit,row.utc,formatters.get(location.timezone).format(new Date(row.utc)),location.timezone,report.period.bucket,row.value,row.originalValue,row.sourceDatapoints,row.captureId,capture.rawSha256,capture.sourceUrl,capture.retrievedAt,...(retained?[capture.origin??'http',capture.sourceSetId,capture.sourcePath,capture.retrievalWindow?.not_before,capture.retrievalWindow?.not_after]:[])]));
 }return Buffer.from(rows.join(''));
}
export function reportHtml(report){
 const rows=report.rows.map(r=>'<tr><td>'+escape(r.label)+'<br><small>'+escape(r.sourceType+' · '+r.locationId)+'</small></td><td>'+escape(r.measurementLabel)+'<br><small>'+escape(r.unit)+'</small></td><td>'+number(r.mean)+'</td><td>'+number(r.minimum)+' / '+number(r.maximum)+'</td><td>'+r.availableBuckets+' / '+r.expectedBuckets+'<br>'+number(100*r.coverage)+'%</td><td>'+escape(r.status.replaceAll('_',' '))+'</td><td>'+(r.threshold?escape(r.threshold.operator==='gte'?'≥':'≤')+' '+number(r.threshold.value)+'<br>'+r.thresholdBuckets+' returned buckets<br><small>'+escape(r.threshold.purpose)+'</small>':'—')+'</td></tr>').join('');
 const comparisons=report.rows.filter(r=>r.comparison).map(r=>'<tr><td>'+escape(r.label)+' · '+escape(r.measurementLabel)+'</td><td>'+number(r.comparison.baselineMean)+'</td><td>'+number(r.mean)+'</td><td>'+number(r.comparison.meanChange)+' '+escape(r.unit)+'</td><td>'+number(r.comparison.baselineCoverage*100)+'% → '+number(r.coverage*100)+'%</td><td>'+escape(r.comparison.samePeriod?'Same UTC period':'Different UTC periods')+'<br>'+escape(r.comparison.sameThreshold?'Same operating rule':'Changed operating rule')+'<br>'+escape(r.comparison.sameConnection?'Same source connection':'Changed source connection')+'</td></tr>').join('');
 const metadata=Object.entries(report.locationMetadata).map(([id,v])=>{
  const licenses=Array.isArray(v.licenseDetails)?v.licenseDetails.map(sourceLink).join('; '):'',flat=Array.isArray(v.licenses)?v.licenses.join('; '):'';
  return '<tr><td>'+escape(id)+'<br>'+escape(v.locationName)+'</td><td>'+escape(v.ownerName??v.ownerId??'')+'</td><td>'+escape(v.provider)+'<br>'+(v.dataSourceDetail?sourceLink(v.dataSourceDetail):escape(v.dataSource))+'<br>'+escape(v.sensorType)+'</td><td>'+licenses+(licenses&&flat?'<br>':'')+escape(flat)+'</td><td>'+escape(v.timezone)+'<br>'+escape(v.latitude)+' / '+escape(v.longitude)+'</td></tr>';
 }).join('');
 const issues=report.issues.length?'<section><h2>Acquisition still to complete</h2><table><thead><tr><th>Selection</th><th>State</th><th>Source response</th></tr></thead><tbody>'+report.issues.map(v=>'<tr><td>'+escape(v.task)+'</td><td>'+escape(v.status)+'</td><td>'+escape(v.code)+'</td></tr>').join('')+'</tbody></table></section>':'';
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(report.title)+'</title><style>body{margin:0;background:#eee;color:#222;font:15px/1.55 system-ui,sans-serif}main{max-width:1100px;margin:24px auto;padding:32px;background:#fff}h1{font-size:28px;margin:0}h2{font-size:20px}section{border-top:1px solid #bbb;margin-top:26px;padding-top:12px}small,.sub{color:#555}.digest{font:11px/1.5 ui-monospace,monospace;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:13px}td,th{vertical-align:top;text-align:left;padding:9px;border-bottom:1px solid #ddd}th{background:#eee}a{color:inherit}@media(max-width:700px){main{margin:0;padding:16px}table{display:block;overflow:auto}}@media print{body,main{background:#fff;margin:0;padding:0}table{font-size:11px}section{break-inside:avoid}}</style></head><body><main>'+
  '<header><p class="sub">AIRGRADIENT CUSTOMER OPERATIONS</p><h1>'+escape(report.title)+'</h1><p>'+escape(report.organisation)+' · '+escape(report.owner)+'</p><p>'+escape(report.period.start)+' → '+escape(report.period.end)+'<br>'+escape(report.period.bucket)+' buckets · '+escape(report.period.convention)+'</p><p>'+escape(report.notes)+'</p><p class="digest">'+escape(report.id)+'<br>SHA-256 '+escape(report.sha256)+'</p></header>'+
  '<section><h2>Location report</h2><table><thead><tr><th>Location</th><th>Measure</th><th>Mean</th><th>Minimum / maximum</th><th>Populated reporting bins</th><th>Readiness</th><th>Operating criterion</th></tr></thead><tbody>'+rows+'</tbody></table><p>'+escape(report.interpretation)+'</p></section>'+
  (comparisons?'<section><h2>Changes from the prior edition</h2><p>Prior report: <span class="digest">'+escape(report.baselineReportId)+'</span></p><table><thead><tr><th>Location / measure</th><th>Prior mean</th><th>Current mean</th><th>Change</th><th>Coverage</th><th>Comparison context</th></tr></thead><tbody>'+comparisons+'</tbody></table></section>':'')+issues+
  '<section><h2>Source meaning and attribution</h2><p>'+escape(report.provenance.provider)+'<br>'+escape(report.provenance.sourceUrl)+'</p>'+(report.provenance.sourceSetId?'<p>'+escape(report.provenance.acquisition)+'</p><p class="digest">Source collection '+escape(report.provenance.sourceSetId)+'</p>':'')+
  '<ul>'+[...new Set(report.rows.map(r=>r.sourceMeaning))].map(v=>'<li>'+escape(v)+'</li>').join('')+'</ul>'+
  (metadata?'<table><thead><tr><th>Location</th><th>Contributor</th><th>Provider / source / sensor</th><th>Returned licences</th><th>Timezone / coordinates</th></tr></thead><tbody>'+metadata+'</tbody></table>':'')+
  '<p>'+escape(report.provenance.sourceSetId?'Each original source document, request URL, retained retrieval window and content digest travels in the complete original source collection.':'Each original response, request URL, acquisition time and content digest is retained in the editable package.')+' The series CSV preserves original values, original provider timestamps and a labelled local display. Zero remains zero; missing observations remain blank.</p></section>'+
  '<section><h2>Continue this installation</h2><p>Open editable.airgradient.json in AirGradient Customer Operations, receive the complete study, and select its saved project. Create the next period with this report as its baseline. Review the resulting source and coverage before committing the next edition.</p><p class="sub">Created '+escape(report.createdAt)+'</p></section></main></body></html>';
}
export function deliveryFiles(report,handover){
 need(handover.rootReportId===report.id,'HANDOVER_REPORT_CHANGED');
 const files=[{name:'report.json',bytes:encoded(report)},{name:'report.html',bytes:Buffer.from(reportHtml(report))},{name:'summary.csv',bytes:summaryCsv(report)},{name:'series.csv',bytes:seriesCsv(report,handover)},{name:'editable.airgradient.json',bytes:encoded(handover)}];
 for(const capture of handover.captures)files.push({name:'sources/'+capture.metadata.id+(capture.metadata.origin==='retained-source'||/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(capture.metadata.contentType)?'.json':'.response'),bytes:Buffer.from(capture.rawBase64,'base64')});
 for(const source of handover.sourceSets??[])files.push({name:'original-source-'+source.packetSha256+'.json',bytes:Buffer.from(source.rawBase64,'base64')});
 files.push({name:'OPERATE.md',bytes:Buffer.from('# AirGradient customer study\n\nOpen report.html for the selected edition. summary.csv contains the complete location comparison; series.csv contains every returned selected provider observation. Original response files are in sources/.\n\nReceive editable.airgradient.json in the installed AirGradient Customer Operations application. The receiver retains the frozen report, its baseline reports, original source definitions and bytes, project revisions and acquisition history. Select the received project, choose a later explicit UTC period, and use the current report as the next edition baseline. Host API tokens remain environment values on the receiving machine.\n\nCLI: airgradient-operations receive --workspace /absolute/private/workspace --input /absolute/private/editable.airgradient.json\n\nUse the same workspace for the later plan, acquire, review, commit and deliver operations. Reopening the exact accepted report or package reuses its retained identity.\n')});
 need(files.reduce((n,f)=>n+f.bytes.length,0)<=MAX_PACKAGE,'DELIVERY_TOO_LARGE');
 const manifest={schema:'stellar-forge.airgradient-delivery.v1',reportId:report.id,reportSha256:report.sha256,packageId:handover.id,packageSha256:handover.sha256,files:files.map(f=>({name:f.name,bytes:f.bytes.length,sha256:sha(f.bytes)}))};
 files.push({name:'manifest.json',bytes:encoded(manifest)});return files;
}
export async function publishDelivery(files,directory,report){
 await privateDirectory(directory,{create:true});const written=[];
 for(const file of files){need(/^(?:sources\/)?[A-Za-z0-9_.-]+$/.test(file.name),'INVALID_DELIVERY_PATH');const path=join(directory,file.name);await privateDirectory(dirname(path),{create:true});
  try{written.push(await publish(path,file.bytes));}
  catch(error){if(error.code!=='EEXIST')throw error;const existing=await readPrivate(path,MAX_PACKAGE);need(sha(existing)===sha(file.bytes),'DESTINATION_CONTAINS_DIFFERENT_EDITION');written.push({path,bytes:existing.length,sha256:sha(existing),status:'REOPENED'});}
 }
 return {directory,reportId:report.id,reportSha256:report.sha256,files:written,status:'DELIVERED'};
}
export async function reopenDelivery(delivery,report){
 need(delivery.reportId===report.id&&delivery.reportSha256===report.sha256&&Array.isArray(delivery.files)&&delivery.files.length>0,'DELIVERY_RECEIPT_CHANGED');
 await privateDirectory(delivery.directory);let manifestFound=false;
 for(const file of delivery.files){
  need(typeof file.path==='string'&&(dirname(file.path)===delivery.directory||dirname(file.path)===join(delivery.directory,'sources')),'DELIVERY_RECEIPT_PATH_CHANGED');
  const bytes=await readPrivate(file.path,MAX_PACKAGE);need(bytes.length===file.bytes&&sha(bytes)===file.sha256,'DELIVERY_FILES_CHANGED');
  if(file.path===join(delivery.directory,'manifest.json')){const manifest=JSON.parse(bytes.toString('utf8'));need(manifest.reportId===report.id&&manifest.reportSha256===report.sha256,'DELIVERY_REPORT_CHANGED');manifestFound=true;}
 }
 need(manifestFound,'DELIVERY_MANIFEST_MISSING');return delivery;
}
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=crc>>>1^(crc&1?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function zipBytes(files){
 need(Array.isArray(files)&&files.length>0&&files.length<=65534,'ZIP_ENTRY_LIMIT_EXCEEDED');
 const local=[],central=[];let offset=0;
 for(const file of files){const name=Buffer.from(file.name),compressed=deflateRawSync(file.bytes,{level:1}),crc=crc32(file.bytes),header=Buffer.alloc(30),entry=Buffer.alloc(46);
  header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(file.bytes.length,22);header.writeUInt16LE(name.length,26);
  entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(0x0314,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(8,10);entry.writeUInt16LE(33,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(compressed.length,20);entry.writeUInt32LE(file.bytes.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE((0o100600<<16)>>>0,38);entry.writeUInt32LE(offset,42);
  local.push(header,name,compressed);central.push(entry,name);offset+=header.length+name.length+compressed.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 const result=Buffer.concat([...local,directory,end]);need(result.length<=MAX_PACKAGE,'ZIP_TOO_LARGE');return result;
}

export function readDeliveryZip(input){
 need(Buffer.isBuffer(input)&&input.length<=MAX_PACKAGE&&input.length>=22,'INVALID_DELIVERY_ZIP');
 const tail=input.length-22;need(input.readUInt32LE(tail)===0x06054b50&&input.readUInt16LE(tail+20)===0&&input.readUInt16LE(tail+4)===0&&input.readUInt16LE(tail+6)===0,'ZIP_DIRECTORY_REQUIRED');
 const count=input.readUInt16LE(tail+10),start=input.readUInt32LE(tail+16),size=input.readUInt32LE(tail+12);
 need(count>0&&count<=65534&&count===input.readUInt16LE(tail+8)&&start+size===tail,'ZIP_DIRECTORY_CHANGED');
 let position=start,total=0,lastEnd=0;const files=new Map();
 for(let i=0;i<count;i++){
  need(position+46<=tail&&input.readUInt32LE(position)===0x02014b50,'ZIP_ENTRY_HEADER_CHANGED');
  const flags=input.readUInt16LE(position+8),method=input.readUInt16LE(position+10),crc=input.readUInt32LE(position+16),packed=input.readUInt32LE(position+20),length=input.readUInt32LE(position+24),
   nameLength=input.readUInt16LE(position+28),extra=input.readUInt16LE(position+30),comment=input.readUInt16LE(position+32),offset=input.readUInt32LE(position+42);
  need(flags===0&&method===8&&extra===0&&comment===0&&position+46+nameLength<=tail,'ZIP_ENTRY_UNSUPPORTED');
  const name=input.subarray(position+46,position+46+nameLength).toString('utf8');
  need(/^(?:sources\/)?[A-Za-z0-9_.-]+$/.test(name)&&!files.has(name)&&!name.split('/').some(x=>x==='.'||x==='..'),'ZIP_ENTRY_PATH_CHANGED');
  need((input.readUInt32LE(position+38)>>>16&0o170000)===0o100000,'ZIP_REGULAR_FILE_REQUIRED');
  total+=length;need(total<=MAX_PACKAGE&&offset===lastEnd&&offset+30<=start&&input.readUInt32LE(offset)===0x04034b50,'ZIP_ENTRY_RANGE_CHANGED');
  const localName=input.readUInt16LE(offset+26),localExtra=input.readUInt16LE(offset+28),dataStart=offset+30+localName+localExtra;
  need(localExtra===0&&localName===nameLength&&input.readUInt16LE(offset+6)===flags&&input.readUInt16LE(offset+8)===method&&input.readUInt32LE(offset+14)===crc&&input.readUInt32LE(offset+18)===packed&&input.readUInt32LE(offset+22)===length&&input.subarray(offset+30,dataStart).toString('utf8')===name&&dataStart+packed<=start,'ZIP_LOCAL_ENTRY_CHANGED');
  const bytes=inflateRawSync(input.subarray(dataStart,dataStart+packed),{maxOutputLength:Math.max(1,length)});
  need(bytes.length===length&&crc32(bytes)===crc,'ZIP_ENTRY_BYTES_CHANGED');files.set(name,bytes);lastEnd=dataStart+packed;position+=46+nameLength;
 }
 need(position===tail&&lastEnd===start&&files.has('manifest.json')&&files.has('editable.airgradient.json')&&files.has('report.json'),'ZIP_FILES_INCOMPLETE');
 const manifest=JSON.parse(files.get('manifest.json').toString('utf8'));need(manifest.schema==='stellar-forge.airgradient-delivery.v1'&&Array.isArray(manifest.files)&&manifest.files.length===files.size-1,'ZIP_MANIFEST_CHANGED');
 const named=new Set();for(const entry of manifest.files){const bytes=files.get(entry.name);need(entry.name!=='manifest.json'&&!named.has(entry.name)&&bytes&&bytes.length===entry.bytes&&sha(bytes)===entry.sha256,'ZIP_MANIFEST_FILE_CHANGED');named.add(entry.name);}
 const report=JSON.parse(files.get('report.json').toString('utf8')),handover=JSON.parse(files.get('editable.airgradient.json').toString('utf8'));
 need(report.id===manifest.reportId&&report.sha256===manifest.reportSha256&&handover.rootReportId===report.id&&handover.id===manifest.packageId&&handover.sha256===manifest.packageSha256&&handover.reports.some(x=>x.id===report.id&&x.sha256===report.sha256),'ZIP_REPORT_SELECTION_CHANGED');
 need(encoded(report).equals(encoded(handover.reports.find(x=>x.id===report.id))),'ZIP_FROZEN_REPORT_CHANGED');
 for(const source of handover.sourceSets??[]){const bytes=files.get('original-source-'+source.packetSha256+'.json');need(bytes&&bytes.length===source.packetBytes&&sha(bytes)===source.packetSha256&&bytes.equals(Buffer.from(source.rawBase64,'base64')),'ZIP_ORIGINAL_SOURCE_COLLECTION_CHANGED');}
 return files.get('editable.airgradient.json');
}
