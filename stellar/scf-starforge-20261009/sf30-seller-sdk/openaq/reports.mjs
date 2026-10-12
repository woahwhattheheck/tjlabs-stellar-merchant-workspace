// SPDX-License-Identifier: MIT
// Project reports use the exact retained series and named source reviews. No AQI or health classification is inferred.
import { bytes, identity } from '../postgres/publisher/files.mjs';
import { seriesSummary } from './projection.mjs';
import { SEMANTICS } from './contract.mjs';
export const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paragraph=v=>'<p>'+escapeHTML(v)+'</p>';
export function buildReport({id,createdAt,plan,captures,reviews,rows}){
 const series=seriesSummary(rows,{includeMean:plan.includeMean,excludeFlagged:plan.excludeFlagged});
 const result={schema:'stellar-forge.openaq-report.v1',id,createdAt,title:plan.title,purpose:plan.purpose,reviewer:plan.reviewer,note:plan.note,
  methods:{includeMean:plan.includeMean,excludeFlagged:plan.excludeFlagged,
   mean:'If selected, an unweighted arithmetic mean of retained numeric values in one capture/sensor/parameter/unit/granularity/interval. The exact coefficient, power and divisor are supplied; no binary-float decimal replaces source data.',
   flags:plan.excludeFlagged?'Source has_flags=true observations are excluded from numeric summaries, but every source row remains in the delivery. Unknown flags remain explicitly unknown.':'All reported numeric observations remain in numeric summaries; flagged and unknown-flag counts are shown separately.',
   coverage:SEMANTICS.coverage,comparison:'Series remain separate by capture, station, sensor, parameter, unit, original granularity and interval. Overlapping windows and source editions are not combined or deduplicated.'},
  sources:captures.map((c,i)=>({id:c.id,captureSha256:c.captureSha256,plan:c.plan,context:c.context,projection:c.projection,
   acquisition:c.receipts.map(r=>({url:r.url,sha256:r.sha256,bytes:r.bytes,acquiredAt:r.acquiredAt,headers:r.headers,archiveLocalDay:r.archiveLocalDay??null})),
   review:reviews[i]})),series,semantics:SEMANTICS};
 result.reportSha256=identity(result);return result;
}
export function reportHTML(report){
 const headings=['Capture / station / sensor','Parameter / unit','Source granularity / interval','Rows / numeric / missing','Flagged / unknown / negative','Minimum / maximum','Retained period ends (UTC)'];
 const table='<div class="table"><table><thead><tr>'+headings.map(x=>'<th>'+escapeHTML(x)+'</th>').join('')+'</tr></thead><tbody>'+report.series.map(r=>'<tr>'+
  ['<strong>'+escapeHTML(r.locationId+' / '+r.sensorId)+'</strong><br><small>'+escapeHTML(r.captureId)+'</small>',escapeHTML(r.parameter+' / '+r.unit),
   escapeHTML(r.resolution+' / '+(r.periodInterval||'not supplied')),escapeHTML(r.rows+' / '+r.numericRows+' / '+r.missingRows),escapeHTML(r.flaggedRows+' / '+r.unknownFlagRows+' / '+r.negativeRows),
   escapeHTML((r.minimum??'—')+' / '+(r.maximum??'—')),escapeHTML(r.firstPeriodEndUTC??'—')+'<br>'+escapeHTML(r.lastPeriodEndUTC??'—')].map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const exact=report.series.filter(x=>x.arithmeticMeanExact).map(r=>'<tr><td>'+escapeHTML(r.locationId+'/'+r.sensorId+' '+r.parameter+' '+r.unit)+'</td><td>'+escapeHTML(r.arithmeticMeanExact.coefficient+' ×10^'+r.arithmeticMeanExact.powerOfTen+' / '+r.arithmeticMeanExact.divisor)+'</td></tr>').join('');
 const sources=report.sources.map(s=>'<section><h3>'+escapeHTML(s.plan.label)+'</h3>'+paragraph(s.plan.purpose)+
  '<dl><dt>Capture</dt><dd>'+escapeHTML(s.id)+'</dd><dt>Metadata basis</dt><dd>'+escapeHTML(s.context.kind+' — '+(s.context.note??'Original API response'))+'</dd>'+
  '<dt>Location timezone</dt><dd>'+escapeHTML(s.context.location.timezone)+'</dd><dt>Review</dt><dd>'+escapeHTML(s.review.reviewer+' / '+s.review.decision)+'</dd>'+
  '<dt>Attribution</dt><dd>'+escapeHTML(s.review.attribution)+'</dd><dt>Applicable rights</dt><dd>'+escapeHTML(s.review.rightsBasis)+'</dd></dl>'+
  paragraph(s.review.note)+'<ul>'+s.review.rightsSources.map(url=>'<li><a href="'+escapeHTML(url)+'" rel="noreferrer">'+escapeHTML(url)+'</a></li>').join('')+'</ul>'+
  '<details><summary>Retained source editions and responses</summary><pre>'+escapeHTML(JSON.stringify(s.acquisition,null,2))+'</pre></details></section>').join('');
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>'+escapeHTML(report.title)+'</title><style>'+
  'body{font:15px/1.5 system-ui,sans-serif;color:#222;background:#fff;margin:0}main{max-width:1280px;padding:32px;margin:auto}h1{font-size:28px;line-height:1.2}h2{font-size:21px;border-bottom:1px solid #bbb;padding-bottom:8px}h3{font-size:18px}p{max-width:100ch}small{font-size:11px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccc;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eee}.table{overflow:auto}dt{font-weight:600}dd{margin:0 0 12px;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}a{color:#222}section{margin:24px 0;padding-top:12px;border-top:1px solid #ccc}@media print{main{padding:0}table{font-size:9px}tr{break-inside:avoid}h2,h3{break-after:avoid}details{display:block}summary{display:none}}'+
  '</style><main><p>OPENAQ · PROJECT SOURCE REPORT</p><h1>'+escapeHTML(report.title)+'</h1>'+paragraph(report.purpose)+
  paragraph('Prepared '+report.createdAt+' · Reviewed by '+report.reviewer)+'<h2>Station and period comparisons</h2>'+table+
  (exact?'<h3>Exact unweighted mean expressions</h3><table><thead><tr><th>Series</th><th>Exact arithmetic expression</th></tr></thead><tbody>'+exact+'</tbody></table>':'')+
  '<h2>Method and interpretation</h2>'+paragraph(report.note)+Object.values(report.methods).filter(v=>typeof v==='string').map(paragraph).join('')+
  '<h2>Original source meaning</h2>'+Object.values(report.semantics).map(paragraph).join('')+
  '<h2>Source reviews and attribution</h2>'+sources+'<footer>'+paragraph('Report '+report.id+' · '+report.reportSha256)+
  paragraph('The original dataset, source responses and machine-readable report accompany this document. Browser printing may be used for a local PDF; the saved HTML is the original report artifact.')+'</footer></main></html>';
}
export function reportFiles(report){return {'report.json':bytes(report),'report.html':Buffer.from(reportHTML(report))};}
