// SPDX-License-Identifier: MIT
/** Complete offline Tourism source edition joined to the original Installation writer. */
import {createHash} from 'node:crypto';
import {bindingTemplate,prepareInstallation,renderWorkorder} from './prepare-core.mjs';
import {parseRecovery,head,compare} from '../../../../services/tourism-series-workspace/portable.mjs';
export const SOURCE_SCHEMA='stellar-forge.tourism-installation-source.v1';
export const SELECTION_SCHEMA='stellar-forge.tourism-installation-selection.v1';
export const MAX_SOURCE=8*1024*1024,MAX_CASE=24*1024*1024;
export const GROUPS=['files','sources','registries','mappingHistory','corrections','analyses','reports','targetPlans','targetReturns'];
export const sha=raw=>createHash('sha256').update(raw).digest('hex');
export const need=(ok,message)=>{if(!ok)throw Error(message);};
export const copy=value=>JSON.parse(JSON.stringify(value));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const ordered=value=>Array.isArray(value)?value.map(ordered):object(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
export const same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
export const encoded=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const exact=(value,keys,label)=>need(object(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k)),'Retain complete '+label+' fields.');
export function inspectTourism(raw){
 need(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<=MAX_SOURCE,'Retain the complete original working JSON within the existing 8 MiB Operations source allowance. Keep larger full workspaces in their original custody; do not substitute summaries.');
 const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw),record=parseRecovery(text),ws=record.workspace;
 const input={bytes:raw.length,sha256:sha(raw)};
 const workspace={id:ws.id,title:ws.title,createdAt:ws.createdAt,revision:ws.revision,sha256:head(ws)};
 const inventory=[];
 for(const kind of GROUPS)for(const [index,value] of ws[kind].entries()){
  inventory.push({kind,index,id:value.id??null,sha256:sha(encoded(value)),
   title:value.title??value.filename??value.id??(kind+' '+(index+1)),
   rows:kind==='sources'?value.rows.length:null,bytes:kind==='files'||kind==='sources'?value.bytes:null});
 }
 return {schema:SOURCE_SCHEMA,input,workspace,record,inventory,
  observations:{originalFiles:ws.files.length,sourceSeries:ws.sources.length,sourceRows:ws.sources.reduce((n,s)=>n+s.rows.length,0),
   registryEditions:ws.registries.length,mappingEditions:ws.mappingHistory.length,corrections:ws.corrections.length,
   analyses:ws.analyses.length,reports:ws.reports.length,targetPlans:ws.targetPlans.length,targetReturns:ws.targetReturns.length,
   operations:ws.operations.length,unfinishedForms:Object.keys(record.drafts).length},
  originalBrowserCopyId:record.copyId??null};
}
function originalCase(seed,value){
 need(object(value?.program)&&Array.isArray(value.sources)&&value.program.id===seed.source?.caseId&&value.program.version===seed.source.version&&value.program.planId===seed.source.planId,
  'Use the complete same-version original Operations case and fresh Workshare seed.');
 need(value.sources.length<=200&&value.sources.reduce((n,s)=>n+s.bytes,0)<=MAX_CASE,'Retain the original complete 24 MiB / 200-file case source allowance.');
}
function attachment(value,id,file,label){
 const matches=value.sources.filter(s=>s.id===id);
 need(matches.length===1&&matches[0].sha256===file.sha256&&matches[0].bytes===file.bytes,'Attach the exact complete '+label+' to the original case.');
 return matches[0];
}
const reference=row=>({kind:row.kind,index:row.index,id:row.id,sha256:row.sha256});
export function tourismInstallationTemplate({raw,seed,caseValue,profile}){
 const source=inspectTourism(raw);originalCase(seed,caseValue);
 const matches=caseValue.sources.filter(row=>row.sha256===source.input.sha256&&row.bytes===source.input.bytes);
 return{selection:{schema:SELECTION_SCHEMA,workspace:copy(source.workspace),
  original:{sourceId:matches.length===1?matches[0].id:null,...source.input},
  editions:source.inventory.map(row=>({reference:reference(row),included:true,purpose:''}))},
  bindings:bindingTemplate(seed,profile),source};
}
export function validateSelection(source,selection){
 exact(selection,['schema','workspace','original','editions'],'Tourism selection');
 need(selection.schema===SELECTION_SCHEMA&&same(selection.workspace,source.workspace),'Select the exact original full Tourism workspace edition.');
 exact(selection.original,['sourceId','bytes','sha256'],'original workspace source');
 need(selection.original.bytes===source.input.bytes&&selection.original.sha256===source.input.sha256,'The complete original working JSON changed.');
 need(Array.isArray(selection.editions)&&selection.editions.length===source.inventory.length,'Include or exclude every original source, registry, mapping, correction, analysis, report and target edition explicitly.');
 const seen=new Set(),rows=[];
 for(const selected of selection.editions){
  exact(selected,['reference','included','purpose'],'edition choice');exact(selected.reference,['kind','index','id','sha256'],'edition reference');
  const r=selected.reference,key=r.kind+':'+r.index,original=source.inventory.find(row=>same(reference(row),r));
  need(original&&!seen.has(key),'Choose every exact original edition once.');
  need(typeof selected.included==='boolean'&&typeof selected.purpose==='string'&&selected.purpose.trim()&&selected.purpose.length<=4000,'Give each inclusion or exclusion its actual purpose or reason.');
  seen.add(key);rows.push({...copy(selected),title:original.title});
 }
 need(rows.some(row=>row.included&&['sources','reports','targetPlans','targetReturns'].includes(row.reference.kind)),'Select at least one complete useful source, report or target edition.');
 return rows;
}
export function prepareTourismInstallation({raw,seed,caseValue,profile,bindings,selectionRaw,selectionSourceId}){
 const source=inspectTourism(raw);originalCase(seed,caseValue);
 need(Buffer.isBuffer(selectionRaw)&&selectionRaw.length<=MAX_SOURCE,'Retain the complete selection JSON within the original source allowance.');
 const selection=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(selectionRaw));
 const rows=validateSelection(source,selection),original=attachment(caseValue,selection.original.sourceId,source.input,'Tourism working JSON');
 const selectedFile={sourceId:selectionSourceId,bytes:selectionRaw.length,sha256:sha(selectionRaw)};
 attachment(caseValue,selectionSourceId,selectedFile,'complete edition-selection JSON');
 const next=copy(bindings);need(object(next.source)&&object(next.receiving),'Keep the original full bindings template.');
 for(const field of ['source','receiving'])next[field].sourceIds=[...new Set([...(next[field].sourceIds??[]),original.id,selectionSourceId])];
 const prepared=prepareInstallation(seed,profile,next);
 need(prepared.document.workshare,'Use the complete original commercial Workshare seed.');
 need(prepared.document.source.mode==='SNAPSHOT','Retain this exact complete source snapshot.');
 const snapshot={schema:'stellar-forge.tourism-installation-editions.v1',workspace:source.workspace,originalCase:copy(seed.source),
  original:copy(selection.original),selectedEditionsSource:selectedFile,editions:rows,
  completeEdition:source.observations,originalBrowserCopyId:source.originalBrowserCopyId,
  scopeMeaning:'Choices describe customer work; every original edition, file, operation and unfinished form remains in the complete source. Historical reports and target returns retain their original facts and status.'};
 return{schema:'stellar-forge.tourism-installation-preparation.v1',source,snapshot,bindings:next,prepared,workorder:renderWorkorder(prepared)};
}
export function reopenTourism(originalRaw,currentRaw){
 const original=inspectTourism(originalRaw);
 // Received working JSON may grow to the original application's 128 MiB limit.
 const current=parseRecovery(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(currentRaw));
 const relationship=compare(current.workspace,original.record.workspace);
 need(['identical','incoming_ancestor'].includes(relationship),'The receiving workspace no longer contains this original source history; retain both branches independently.');
 return{original:original.workspace,current:{id:current.workspace.id,revision:current.workspace.revision,sha256:head(current.workspace)},relationship,
  laterOperations:current.workspace.revision-original.workspace.revision,
  unfinishedForms:Object.keys(current.drafts).length,copyId:current.copyId??null};
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const table=(heads,rows)=>'<div class="table"><table><thead><tr>'+heads.map(v=>'<th>'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
export function renderTourismSource(source,selection=null){
 need(source.schema===SOURCE_SCHEMA,'Use the complete original Tourism source inspection.');
 const choices=new Map((selection?.editions??[]).map(r=>[r.reference.kind+':'+r.reference.index,r]));
 const ws=source.record.workspace;
 const sections=GROUPS.map(kind=>'<section><h2>'+esc(kind.replace(/([A-Z])/g,' $1'))+'</h2>'+table(['Original edition','Recorded rows / bytes','Customer scope','Exact edition SHA-256'],source.inventory.filter(r=>r.kind===kind).map(r=>{
  const c=choices.get(r.kind+':'+r.index);
  return[r.title+' · '+r.id,[r.rows===null?null:r.rows+' rows',r.bytes===null?null:r.bytes+' bytes'].filter(Boolean).join(' / '),c?(c.included?'Included — ':'Excluded — ')+c.purpose:'Purpose to be recorded',r.sha256];
 }))+'</section>').join('');
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tourism source and installation</title><style>body{font:16px/1.5 system-ui,sans-serif;color:#222;background:#fff;margin:0}main{max-width:1140px;margin:auto;padding:32px}h1,h2{line-height:1.25}section{border-top:1px solid #bbb;margin-top:28px;padding-top:16px}nav{display:flex;flex-wrap:wrap;gap:14px}a{color:inherit}table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eee}.table{overflow:auto}p{overflow-wrap:anywhere}button{font:inherit;background:#eee;border:1px solid #888;padding:6px 12px;cursor:pointer}@media(max-width:600px){main{padding:16px}h1{font-size:25px}td,th{padding:6px}}@media print{nav{display:none}main{padding:0;max-width:none}.table{overflow:visible}table{font-size:10px}tr{break-inside:avoid}h2{break-after:avoid}}</style><main><h1>Tourism source and installation</h1><p>'+esc(ws.title)+' · revision '+esc(ws.revision)+' · '+esc(ws.id)+'</p><p>Full original working file '+esc(source.input.bytes)+' bytes. '+esc(source.observations.sourceRows)+' retained source rows; '+esc(source.observations.reports)+' frozen reports; '+esc(source.observations.targetReturns)+' original target returns. Complete source, calculation qualifications, residuals and unresolved findings remain available in the working application.</p><nav><a href="working/Tourism_Series_Workspace.html">Open complete working application</a><a href="Tourism_Original_Working.json" download>Original working JSON</a><a href="Tourism_Complete_Source_Report.json" download>Full source inspection</a><a href="Selected_Tourism_Editions.json" download>Editable scope</a><a href="Tourism_Complete_Working.zip" download>Complete working ZIP</a><button onclick="window.print()">Print</button></nav><p>Edition choices define proposed customer work. Excluded editions remain in the full source. Published values are not corrected by scope selection. Different geographic populations, periods, methods, units and target editions retain their original meanings. Named unfinished forms remain unfinished.</p>'+sections+'<section><h2>Original operation history</h2>'+table(['Revision','Operation','Kind','Original time','Original request SHA-256'],ws.operations.map(r=>[r.revision,r.id,r.kind,r.at,r.requestSha256]))+'<p>Complete original records and all binary files are in the linked original JSON and working ZIP. The working application opens every frozen report and exact source/target file.</p></section></main></html>';
}
