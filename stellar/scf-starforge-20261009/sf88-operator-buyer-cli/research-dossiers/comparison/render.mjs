// MIT. Offline comparison views keep measurements, judgments and decisions distinct.
import {need,digest,jsonBytes} from '../../node/store.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty=value=>JSON.stringify(value,null,2);
function table(headers,rows){return'<table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(typeof v==='object'&&v!==null?pretty(v):v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}
function details(title,value){return'<details><summary>'+esc(title)+'</summary><pre>'+esc(pretty(value))+'</pre></details>';}
export function comparisonHtml(report){
 const c=report.case;
 return'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(c.definition.title)+'</title><style>body{font:16px/1.55 system-ui,sans-serif;color:#222;background:#fff;margin:2rem auto;max-width:1200px;padding:0 1rem}h1,h2{line-height:1.2}table{border-collapse:collapse;width:100%;margin:1rem 0;display:block;overflow:auto}td,th{border:1px solid #bbb;padding:.5rem;text-align:left;vertical-align:top;white-space:pre-wrap;min-width:6rem}th{background:#eee}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f4f4;padding:1rem}summary{cursor:pointer}small{overflow-wrap:anywhere}@media print{details{display:block}table{display:table;font-size:10px}body{max-width:none}}</style><main><h1>'+esc(c.definition.title)+'</h1><p>'+esc(c.definition.purpose)+'</p><p>'+esc(c.definition.scope)+'</p><small>Dossier '+esc(report.dossierId)+' · revision '+report.revision+' · case '+esc(c.id)+' · version '+esc(c.versionId)+'</small><h2>Interpretation</h2><ul>'+report.limitations.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><h2>Criterion protocol</h2>'+table(['ID','Criterion','Kind','Unit','Direction','Definition'],c.definition.criteria.map(x=>[x.id,x.label,x.kind,x.unit,x.direction,x.description]))+'<h2>Candidate versions</h2>'+table(['Candidate','Kind','Version','Saved identity','Configuration'],report.candidateEditions.map(x=>[x.definition.name,x.definition.kind,x.definition.version,x.versionId,x.definition.configuration]))+'<h2>Retained measurements</h2>'+table(['Candidate version','Run','Criterion','Value','Unit','Undefined reason','Cohort','Denominator','Status'],report.measurementRows.map(x=>[x.candidateVersionId,x.runId,x.criterionId,x.value,x.unit,x.undefinedReason,x.cohortRef,x.denominator,x.status]))+'<h2>Manual judgments</h2>'+table(['Saved version','Candidate version','Criterion','Judgment','Reviewer / time','Rationale'],report.judgmentRows.map(x=>[x.versionId,x.candidateVersionId,x.criterionId,x.value,x.reviewer+' / '+x.reviewedAt,x.rationale]))+'<h2>Explicit decisions</h2>'+report.decisions.map(d=>'<h3>'+esc(d.definition.title)+'</h3><p>'+esc(d.definition.recommendation)+'</p><p>'+esc(d.definition.rationale)+'</p><p>'+esc(d.definition.limitations)+'</p>'+details('Complete decision '+d.versionId,d)).join('')+'<h2>Original sources and run provenance</h2>'+details('Complete source edition references',report.sourceEditions)+report.runs.map(r=>details('Run '+r.definition.externalRunId+' / '+r.versionId,r)).join('')+'<h2>Full retained comparison history</h2><p>This offline report contains the complete selected report model below. Original raw run and artifact bytes travel in the dossier portable export and remain separately downloadable in the workspace.</p>'+details('Complete report model',report)+'</main></html>\n';
}
const csv=value=>{
 let s=typeof value==='object'&&value!==null?JSON.stringify(value):String(value??'');
 if(/^[=+@\t\r]/.test(s)||/^-[^0-9.]/.test(s))s="'"+s;
 return'"'+s.replaceAll('"','""')+'"';
};
export function exportComparison(report,{format='json'}={}){
 need(['json','html','csv'].includes(format),'COMPARISON_EXPORT_FORMAT_INVALID');
 let body,contentType;
 if(format==='json'){body=jsonBytes(report);contentType='application/json; charset=utf-8';}
 else if(format==='html'){body=Buffer.from(comparisonHtml(report));contentType='text/html; charset=utf-8';}
 else{
  const columns=['rowKind','caseId','caseVersionId','candidateVersionId','runId','versionId','criterionId','value','unit','undefinedReason','cohortRef','denominator','reviewer','reviewedAt','rationale'];
  const rows=[...report.measurementRows.map(x=>({...x,rowKind:'MEASUREMENT'})),...report.judgmentRows.map(x=>({...x,rowKind:'JUDGMENT'}))];
  body=Buffer.from([columns.map(csv).join(','),...rows.map(r=>columns.map(k=>csv(r[k])).join(','))].join('\r\n')+'\r\n');
  contentType='text/csv; charset=utf-8';
 }
 return{revision:report.revision,filename:report.case.id+'-'+report.case.versionId+'.comparison.'+format,contentType,body,sha256:digest(body),bytes:body.length};
}
