// SPDX-License-Identifier: MIT
import {identity,bytes,hash,need,sha,text,whole,stamp,inspectForecast,REPORT_SCHEMA,SOURCE_AUTHORITY,object} from './contract.mjs';
import {csvBytes} from '../stellar-expert/domain.mjs';
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export const COLUMNS=Object.freeze(['locationId','location','requestedLatitude','requestedLongitude','returnedLatitude','returnedLongitude',
  'timeZone','timeUnix','timeUtc','timeLocal','sourceOrdinal','field','value','valueType','csvEncoding','unitSystem','captureId','responseSha256','flagsSha256']);
function exactValue(exact,native){
  if(native===null)return{value:'null',valueType:'null'};
  if(typeof native==='number')return{value:exact,valueType:'number-token'};
  if(typeof native==='string')return{value:native,valueType:'string'};
  if(typeof native==='boolean')return{value:String(native),valueType:'boolean'};
  return{value:JSON.stringify(exact),valueType:Array.isArray(native)?'array-with-exact-number-tokens':'object-with-exact-number-tokens'};
}
function localTime(t,z){return new Intl.DateTimeFormat('en-CA',{timeZone:z,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'longOffset',hourCycle:'h23'}).format(t*1000);}
export async function buildReport({contractEdition,captures,loadObject,title,windowStart,createdAt,previousReportId=null}){
  text(title,'the named customer report',160);stamp(createdAt);
  whole(windowStart,'the original UTC window start in Unix seconds',0,253402127999);
  need(windowStart%3600===0,'PIRATE_REPORT_WINDOW','Choose an exact UTC hour for the 48-hour window.');
  if(previousReportId!==null)sha(previousReportId);
  const c=contractEdition.value,windowEnd=windowStart+48*3600;
  need(captures.length===c.locations.length,'PIRATE_REPORT_CAPTURE_COUNT','Select one complete original response for each contract location.');
  const rows=[],sources=[],coverage=[],ids=new Set();
  for(const location of c.locations){
    const capture=captures.find(x=>x.request.locationId===location.id);
    need(capture&&!ids.has(capture.id)&&capture.contractSha256===contractEdition.sha256&&capture.state==='COMPLETE'&&
      capture.status===200&&capture.bodyComplete,'PIRATE_REPORT_SOURCE','Use each complete forecast from this exact contract edition.',409);
    ids.add(capture.id);const raw=await loadObject(capture.body.sha256);
    need(raw.length===capture.body.bytes&&hash(raw)===capture.body.sha256,'PIRATE_REPORT_SOURCE_CHANGED','Original forecast bytes changed.',409);
    const {decoded,summary}=inspectForecast(raw,capture.request),seen=new Map(),selected=[];
    for(let i=0;i<decoded.native.hourly.data.length;i++){
      const native=decoded.native.hourly.data[i],exact=decoded.exact.hourly.data[i],t=native.time;
      if(t<windowStart||t>=windowEnd)continue;
      seen.set(t,(seen.get(t)??0)+1);selected.push(t);
      for(const field of Object.keys(native)){
        if(field==='time')continue;
        const value=exactValue(exact[field],native[field]);
        need(rows.length<250000,'PIRATE_REPORT_CAPACITY','The complete report exceeds the maintained 250,000-row dataset capacity; retain the full responses and choose another window.',413);
        rows.push({locationId:location.id,location:location.name,requestedLatitude:String(location.latitude),requestedLongitude:String(location.longitude),
          returnedLatitude:summary.returnedLatitude,returnedLongitude:summary.returnedLongitude,timeZone:summary.timeZone,
          timeUnix:exact.time,timeUtc:new Date(t*1000).toISOString(),timeLocal:localTime(t,summary.timeZone),sourceOrdinal:String(i),field,
          ...value,csvEncoding:value.valueType==='string'&&/^[\s]*[=+@\-\t\r]/.test(value.value)?'spreadsheet-literal-prefix':'original',
          unitSystem:summary.units,captureId:capture.id,responseSha256:capture.body.sha256,flagsSha256:summary.flagsSha256});
      }
    }
    const expected=Array.from({length:48},(_,i)=>windowStart+i*3600),missing=expected.filter(t=>!seen.has(t));
    coverage.push({locationId:location.id,selectedRecords:selected.length,uniqueHours:seen.size,expectedHours:48,
      missingHours:missing.map(String),duplicateHours:[...seen].filter(([,n])=>n>1).map(([t,n])=>({timeUnix:String(t),records:n})),
      nonHourlyTimes:selected.filter(t=>(t-windowStart)%3600!==0).map(String),complete:missing.length===0&&selected.length===48&&seen.size===48});
    sources.push({captureId:capture.id,request:capture.request,observedAt:capture.observedAt,startedAt:capture.startedAt,
      transport:capture.origin,body:capture.body,headers:capture.headers,usage:capture.usage,summary,
      allOriginalBlocks:Object.keys(decoded.native),sourceContractSha256:capture.contractSha256});
  }
  const body={schema:REPORT_SCHEMA,workspaceId:contractEdition.workspaceId,contractId:c.id,contractSha256:contractEdition.sha256,
    title,customer:c.customer,destination:c.destination,purpose:c.purpose,createdAt,previousReportId,
    window:{startUnix:String(windowStart),endUnix:String(windowEnd),startUtc:new Date(windowStart*1000).toISOString(),endUtc:new Date(windowEnd*1000).toISOString(),hours:48,semantics:'start inclusive, end exclusive'},
    units:c.units,schedule:c.schedule,sourceAuthority:SOURCE_AUTHORITY,coverage,sources,columns:[...COLUMNS],rows,
    semantics:{numbers:'Exact original number tokens are strings, with valueType=number-token; no conversion, rounding or inferred value is applied.',
      missing:'Missing fields and hours remain missing. Null and sentinel values are retained; no replacement or interpolation is performed.',
      forecast:'These are provider forecast values, not independently observed weather. Original currently, daily, alerts and all other blocks remain in each full source response.',
      units:'The original provider unit system and field name remain attached; no derived unit, hazard threshold or severity is inferred.',
      csv:'Negative number tokens stay numeric literals. A text beginning with a spreadsheet formula prefix receives one leading apostrophe only in CSV; csvEncoding identifies it. JSON and the complete original response retain the exact text.',
      delivery:'Preparing or receiving this report does not initiate a provider request, external message or payment.'}};
  return {...body,id:identity(body)};
}
export function inspectReport(report){
  need(object(report)&&report.schema===REPORT_SCHEMA&&sha(report.id)&&Array.isArray(report.rows)&&Array.isArray(report.sources),
    'PIRATE_REPORT_INVALID','Use the complete original report.');
  const {id,...body}=report;need(identity(body)===id,'PIRATE_REPORT_CHANGED','The saved report differs from its original edition.',409);return report;
}
export function compareReports(before,after){
  inspectReport(before);inspectReport(after);
  need(before.contractId===after.contractId&&before.units===after.units,'PIRATE_REPORT_COMPARISON_SCOPE','Compare editions for the same customer contract and explicit units.',409);
  const indexed=rows=>{const occurrences=new Map(),result=new Map();for(const row of rows){const base=JSON.stringify([row.locationId,row.timeUnix,row.field]),ordinal=occurrences.get(base)??0;occurrences.set(base,ordinal+1);result.set(JSON.stringify([row.locationId,row.timeUnix,row.field,ordinal]),row);}return result;};
  const left=indexed(before.rows),right=indexed(after.rows);
  const added=[],removed=[],changed=[];
  const meaningful=r=>({value:r.value,valueType:r.valueType,unitSystem:r.unitSystem,timeZone:r.timeZone,returnedLatitude:r.returnedLatitude,returnedLongitude:r.returnedLongitude});
  for(const[k,r]of right){if(!left.has(k))added.push(r);else if(identity(meaningful(left.get(k)))!==identity(meaningful(r)))changed.push({key:k,before:left.get(k),after:r});}
  for(const[k,r]of left)if(!right.has(k))removed.push(r);
  return{schema:'stellar-forge.pirate-weather-report-comparison.v1',beforeId:before.id,afterId:after.id,
    added,removed,changed,counts:{added:added.length,removed:removed.length,changed:changed.length},
    window:{before:before.window,after:after.window},note:'Forecasts compare their retained location, valid time and field; shifts in coverage are explicit.'};
}
export function reportFiles(report,review){
  inspectReport(report);need(review?.reportId===report.id&&review.disposition==='APPROVED','PIRATE_REVIEW_REQUIRED','Publish only the exact report with its named approved review.',409);
  const document={schema:'stellar-forge.pirate-weather-reviewed-report.v1',report,review};
  const csv=csvBytes(COLUMNS,report.rows.map(r=>({...r,value:r.csvEncoding==='spreadsheet-literal-prefix'?"'"+r.value:r.value})));
  const json=bytes(document),covered=report.coverage.filter(c=>c.complete).length;
  const body=report.rows.map(r=>'<tr>'+['location','timeUtc','timeLocal','field','value','valueType','unitSystem'].map(k=>'<td>'+esc(r[k])+'</td>').join('')+'</tr>').join('');
  const html=Buffer.from('<!doctype html>\n<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(report.title)+'</title>'+
    '<style>body{font:16px/1.5 system-ui;margin:0;background:#f3f3f3;color:#181818}main{max-width:1180px;margin:auto;padding:36px 20px}h1{font-size:2.3rem;line-height:1.15}h2{margin-top:2rem}article{background:white;border:1px solid #b5b5b5;padding:20px;margin:18px 0}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;padding:9px;border-bottom:1px solid #c8c8c8;overflow-wrap:anywhere}th{background:#e7e7e7}code,pre{white-space:pre-wrap;overflow-wrap:anywhere}.muted{color:#555}.label{display:inline-block;border:1px solid #888;padding:4px 12px}</style><main>'+
    '<p class="label">Reviewed forecast report</p><h1>'+esc(report.title)+'</h1><p>'+esc(report.customer)+' · '+esc(report.destination)+'</p><p>'+esc(report.purpose)+'</p>'+
    '<article><strong>'+esc(report.window.startUtc)+' through '+esc(report.window.endUtc)+'</strong><p>48-hour window · provider unit system '+esc(report.units)+' · '+report.rows.length+' field rows · '+covered+'/'+report.coverage.length+' locations with all expected hourly records.</p><p class="muted">Forecast edition '+esc(report.id)+'. Source responses and their original flags, usage headers and timestamps accompany this report.</p></article>'+
    '<h2>Review</h2><article><strong>'+esc(review.actor)+'</strong> · '+esc(review.at)+'<p>'+esc(review.note)+'</p><p>Decision: '+esc(review.disposition)+'</p></article>'+
    '<h2>Source coverage</h2>'+report.coverage.map(c=>'<article><strong>'+esc(c.locationId)+'</strong><p>'+c.uniqueHours+' unique hours; '+c.selectedRecords+' records.</p><p>Missing hours: '+esc(c.missingHours.join(', ')||'none')+'. Duplicate hours: '+esc(JSON.stringify(c.duplicateHours))+'.</p></article>').join('')+
    '<h2>Original forecast fields</h2><div class="scroll"><table><thead><tr>'+['Location','UTC time','Local time and offset','Field','Original value','Value type','Provider units'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div>'+
    '<h2>Provenance and interpretation</h2>'+Object.entries(report.semantics).map(([k,v])=>'<p><strong>'+esc(k)+':</strong> '+esc(v)+'</p>').join('')+
    report.sources.map(s=>'<article><strong>'+esc(s.request.locationId)+'</strong><p>Observed '+esc(s.observedAt)+' · original response SHA256 '+esc(s.body.sha256)+'</p><pre>'+esc(JSON.stringify({flags:s.summary.flags,usage:s.usage},null,2))+'</pre></article>').join('')+
    '<p><a href="https://pirateweather.net/">Weather data by Pirate Weather</a> · <a href="https://docs.pirateweather.net/en/latest/API/">Original source specification</a></p></main></html>\n');
  return [{name:'report.json',type:'application/json; charset=utf-8',bytes:json},{name:'report.csv',type:'text/csv; charset=utf-8',bytes:csv},{name:'report.html',type:'text/html; charset=utf-8',bytes:html}];
}
