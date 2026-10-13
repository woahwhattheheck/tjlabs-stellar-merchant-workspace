// MIT. Original adoption exports shared by the native store and fixed handover inspector.
import {need,digest,jsonBytes} from '../../node/store.mjs';
const download=(report,filename,contentType,body)=>{
 const bytes=Buffer.isBuffer(body)?body:Buffer.from(body,'utf8');
 return{revision:report.revision,filename,contentType,bytes:bytes.length,sha256:digest(bytes),body:bytes};
};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function exportAdoptionReport(report,{format='json'}={}){
 need(['json','html'].includes(format),'ADOPTION_EXPORT_FORMAT_INVALID');
 const plan=report.plan;
 if(format==='json')return download(report,plan.id+'.json','application/json; charset=utf-8',jsonBytes(report));
  const rows=report.progress.mappings.map(m=>'<tr><td>'+escape(m.sourceKind)+'</td><td>'+escape(m.sourceVersionId)+
   '</td><td>'+escape(m.targetVersionId)+'</td><td>'+escape(m.mode)+'</td></tr>').join('');
  const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<title>Reviewed comparison adoption</title><style>body{font:16px/1.5 system-ui;margin:2rem auto;max-width:1000px;padding:0 1rem;color:#171717;background:#fff}'+
   'table{width:100%;border-collapse:collapse}td,th{padding:.5rem;text-align:left;border:1px solid #ccc;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><body>'+
   '<h1>'+escape(plan.case.definition.title)+'</h1><h2>Reviewed returned comparison</h2><p>Status: '+escape(report.status)+
   '. Native author revision '+report.revision+'. Accepted '+report.progress.completed+' of '+report.progress.total+' planned operations.</p>'+
   '<p>Accepting operator: '+escape(plan.request.actor.name)+' ('+escape(plan.request.actor.id)+'), '+escape(plan.request.reviewedAt)+
   '.</p><p>'+escape(plan.request.reviewNote)+'</p><p>The returned history, original measurements, reviewers and files remain their original source. This author-side adoption records new native operations; it does not rerun measurements or attribute the original work to the accepting operator.</p>'+
   '<p>Source '+escape(plan.source.id)+' / '+escape(plan.source.sha256)+' / '+plan.source.bytes+' bytes. Original protocol '+escape(plan.case.versionId)+
   '.</p><table><thead><tr><th>Record</th><th>Original version</th><th>Author version</th><th>Disposition</th></tr></thead><tbody>'+rows+
   '</tbody></table><h2>Complete source, plan, mappings and native receipts</h2><pre>'+escape(JSON.stringify(report,null,2))+'</pre></body></html>\n';
  return download(report,plan.id+'.html','text/html; charset=utf-8',html);
}
