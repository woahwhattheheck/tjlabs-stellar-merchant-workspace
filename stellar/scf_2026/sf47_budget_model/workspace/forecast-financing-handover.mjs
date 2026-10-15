// MIT. Complete read-only handover of original native Forecast financing decisions.
import {zipWorkspace} from '../../../../stellar-forge/developer-site/dist/onboarding.mjs';
import {signature} from './forecast-workbook.mjs';
import {verifyFinancingState,financingMetrics,financingMoneyDelta,financingComparisonCurrent,financingSha,FINANCING_FILE_SCHEMA} from './forecast-financing.mjs';
import {decodeWorkbookBytes} from './source-workbooks.mjs';

export const FINANCING_HANDOVER_SCHEMA='stellar-forge.forecast-financing-handover.v1';
export const MAX_FINANCING_HANDOVER_BYTES=512*1024*1024;
const clone=v=>JSON.parse(JSON.stringify(v));
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const need=(v,m)=>{if(!v)throw Error(m);};
const utf8=v=>new TextEncoder().encode(v);
const json=v=>JSON.stringify(v,null,2)+'\n';
const compact=v=>JSON.stringify(v)+'\n';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ptr=k=>String(k).replaceAll('~','~0').replaceAll('/','~1');
const label=k=>k.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/\bUsd\b/g,'USD').replace(/\bId\b/g,'ID');
const show=v=>v===undefined?'Not supplied':v===null?'Unknown / not entered':v===false?'No':v===true?'Yes':typeof v==='object'?JSON.stringify(v):String(v);
const valueKind=v=>v===undefined?'ABSENT':v===null?'NULL':Array.isArray(v)?'ARRAY':typeof v==='object'?'OBJECT':typeof v==='string'?'TEXT':typeof v==='number'?'NUMBER':'BOOLEAN';
const decimal=/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const numericField=k=>/(?:Usd|Hours)$/.test(k);
function csvCell(v,numeric=false){let s=v===null||v===undefined?'':typeof v==='object'?JSON.stringify(v):String(v);const number=typeof v==='number'&&Number.isFinite(v)||numeric&&typeof v==='string'&&decimal.test(v);if(!number&&/^[ \t\r\n]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function numericCell(row,key){
  if(numericField(key))return true;
  if((key==='actual'||key==='limit')&&typeof row.measure==='string')return true;
  const leaf=typeof row.path==='string'?row.path.split('/').at(-1):'';
  if(key==='value')return row.kind==='NUMBER'||row.kind==='TEXT'&&numericField(leaf);
  if(key==='before'||key==='after')return row[key+'Kind']==='NUMBER'||row[key+'Kind']==='TEXT'&&numericField(leaf);
  return false;
}
function columns(rows,first=[]){return [...new Set([...first,...rows.flatMap(r=>plain(r)?Object.keys(r):['value'])])];}
function recordRows(rows){return rows.map(r=>plain(r)?r:{value:r});}
export function financingHandoverCsv(rows,headers=columns(recordRows(rows))){
  const rr=recordRows(rows);
  return '\uFEFF'+[headers.map(v=>csvCell(v)),...rr.map(r=>headers.map(k=>csvCell(own(r,k)?r[k]:null,numericCell(r,k))))].map(r=>r.join(',')).join('\r\n')+'\r\n';
}
export function financingHandoverFields(value){
  const rows=[];
  function walk(v,path){if(plain(v)&&Object.keys(v).length){for(const k of Object.keys(v))walk(v[k],path+'/'+ptr(k));}
    else if(Array.isArray(v)&&v.length){v.forEach((x,i)=>walk(x,path+'/'+i));}
    else rows.push({path:path||'/',kind:valueKind(v),value:v});}
  walk(value,'');return rows;
}
export function financingHandoverChanges(before,after){
  const rows=[];
  function walk(a,b,path,hasA=true,hasB=true){
    if(hasA===hasB&&signature(a)===signature(b))return;
    if(hasA&&hasB&&plain(a)&&plain(b)){for(const k of [...new Set([...Object.keys(a),...Object.keys(b)])].sort())walk(a[k],b[k],path+'/'+ptr(k),own(a,k),own(b,k));return;}
    rows.push({path:path||'/',beforeKind:hasA?valueKind(a):'ABSENT',before:hasA?a:null,afterKind:hasB?valueKind(b):'ABSENT',after:hasB?b:null});
  }walk(before,after,'');return rows;
}
function dataTable(rows,{headers=columns(recordRows(rows)),caption='',empty='No rows in this original selection.'}={}){
  const rr=recordRows(rows);
  if(!rr.length)return '<p class="empty">'+escape(empty)+'</p>';
  return '<div class="table-scroll" tabindex="0" role="region" aria-label="'+escape(caption||'Complete rows')+'"><table>'+
    (caption?'<caption>'+escape(caption)+' · '+rr.length+' rows</caption>':'')+'<thead><tr>'+headers.map(h=>'<th scope="col">'+escape(label(h))+'</th>').join('')+
    '</tr></thead><tbody>'+rr.map(row=>'<tr>'+headers.map(h=>'<td>'+escape(show(own(row,h)?row[h]:undefined))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function attributes(value){return dataTable(financingHandoverFields(value),{headers:['path','kind','value'],caption:'Exact retained fields'});}
const datasets=[
 ['dated-cash','Dated cash and effort','days'],
 ['cash-events','Original cash events','events'],
 ['remaining-work','Dated work','workDays'],
 ['package-estimates','Grant package estimates','packages'],
 ['unpaid-invoices','Original invoices and inclusion','invoices'],
 ['grant-receipts','Conditional grant receipts','grants'],
 ['customer-work','Customer scope, prices and obligations','commercial'],
 ['issues','Unresolved source and timing findings','issues']
];
function tablesFor(report){
  const tables=datasets.map(([key,title,field])=>({key,title,rows:report[field]||[]}));
  if(report.eventTiming){tables.push({key:'event-dependent-work',title:'Event-dependent work and missing dates',rows:report.eventTiming.projects||[]});
    tables.push({key:'event-dependent-receipts',title:'Event-dependent customer receipts',rows:(report.eventTiming.projects||[]).flatMap(p=>(p.receipts||[]).map(r=>({projectId:p.id,...r})))});}
  if(report.customerFunding?.enabled){tables.push({key:'customer-funding-daily',title:'Pooled cash, reserved customer money and available cash',rows:report.customerFunding.days||[]},
    {key:'customer-obligations',title:'Every customer reservation and remaining delivery obligation',rows:report.customerFunding.customerDays||[]});}
  if(report.bridgeFunding)for(const [key,title,field]of [['bridge-facilities','Named USD facilities and principal caps','facilities'],['bridge-events','Every explicit draw, repayment, interest and fee','events'],['bridge-principal','Outstanding principal progression','principalDays'],['bridge-financed-cash','Financed cash alongside the original cash curve','days'],['bridge-findings','Unresolved facility terms and schedule exceptions','issues']])tables.push({key,title,rows:report.bridgeFunding[field]||[]});
  return tables;
}
function assessmentRows(assessments){
  return assessments.flatMap(a=>a.report.rows.flatMap(row=>row.checks.map(check=>({
    assessmentId:a.id,assessmentName:a.criteria.name,createdAt:a.createdAt,comparisonId:a.comparisonId,
    optionId:row.optionId,option:row.name,result:row.status,shortlistWithinScope:row.shortlist,scopeGroup:row.scopeGroup,
    measure:check.label,actual:check.actual,limit:check.limit,checkResult:check.status,reason:check.reason,
    dominatedBy:row.dominatedBy,capacityBasisHours:row.nativeWeeklyCapacity,conditional:row.conditional
  }))));
}
function details(title,body,open=false){return '<details'+(open?' open':'')+'><summary>'+escape(title)+'</summary>'+body+'</details>';}
function sourceRows(comparison){return comparison.context.sources.map(m=>({...m,attachmentIncluded:comparison.attachments.some(a=>a.id===m.id)}));}
function localHtml(model,studyFile){
  const {study,selection,comparison,baseline,assessments,summary}=model;
  const optionSections=comparison.result.options.map((o,i)=>{
    const r=o.preview.report,changes=financingHandoverChanges(baseline.preview.inputs,o.preview.inputs),tables=tablesFor(r);
    const metadata={optionId:o.id,comparisonId:comparison.id,source:o.preview.source,inputSha256:o.inputSha256,previewSha256:o.preview.previewSha256,
      asOfDate:r.asOfDate,firstForecastDate:r.firstForecastDate,lastForecastDate:r.lastForecastDate,mode:r.mode,basis:r.basis,capacity:r.capacity,openingCash:r.openingCash,scenarios:r.scenarios,totals:r.totals,
      customerFunding:r.customerFunding?{enabled:r.customerFunding.enabled,summary:r.customerFunding.summary,basis:r.customerFunding.basis}:null,
      ...(r.bridgeFunding?{bridgeFunding:Object.fromEntries(Object.entries(r.bridgeFunding).filter(([k])=>!['facilities','events','principalDays','days','issues'].includes(k)))}:{}),
      eventTiming:r.eventTiming?Object.fromEntries(Object.entries(r.eventTiming).filter(([k])=>k!=='projects')):null,currencyValuation:r.currencyValuation??null};
    return '<section class="option" id="option-'+i+'" data-option="'+escape(o.id)+'"><h2>'+escape(o.name)+'</h2>'+
      '<p class="mono">'+escape(o.id)+' · preview '+escape(o.preview.previewSha256)+'</p>'+
      '<p>'+escape(r.basis)+'</p><p>'+escape(r.capacity?.distribution||'')+'</p>'+
      details('Assumption differences from '+baseline.name,dataTable(changes,{headers:['path','beforeKind','before','afterKind','after'],caption:'Every changed input',empty:'All normalized inputs match the reference option.'}),true)+
      details('Complete assumptions and calculation basis',attributes(metadata)+details('Every normalized input',attributes(o.preview.inputs)))+
      tables.map(t=>details(t.title,dataTable(t.rows,{caption:t.title}),t.key==='dated-cash')).join('')+
      details('Every original report field',attributes(r))+'</section>';
  }).join('');
  const studyBytes=compact(studyFile);
  const payload={study:studyBytes,studyFilename:study.id+'-complete.json',selection,manifest:model.manifest};
  const embedded=JSON.stringify(payload).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer">'+
  '<title>'+escape(study.title||'Financing decision')+' — complete handover</title><style>'+
  'html{color-scheme:light}*{box-sizing:border-box}body{font:15px/1.55 system-ui,sans-serif;color:#222;background:#fff;max-width:1450px;margin:0 auto;padding:32px;overflow-wrap:anywhere}h1{font-size:2rem;line-height:1.2}h2{font-size:1.5rem;margin-top:2rem}h3{font-size:1.15rem}a{color:#222;text-underline-offset:3px}p{max-width:100ch}header{border-bottom:3px solid #333;padding-bottom:20px}.toolbar{display:flex;gap:12px;align-items:end;flex-wrap:wrap;padding:16px 0}.toolbar label{display:grid;gap:4px}input,select,button{font:inherit;color:#222;background:#fff;border:1px solid #777;border-radius:3px;padding:8px;max-width:100%}button{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #555;outline-offset:3px}summary{font-weight:600;padding:12px 0;cursor:pointer}details{border-top:1px solid #bbb;padding:0 0 10px}caption{text-align:left;font-weight:600;padding:10px 0}.table-scroll{overflow:auto;max-width:100%;margin:8px 0 20px}table{border-collapse:collapse;min-width:640px;width:100%;font-size:13px}th,td{border:1px solid #aaa;vertical-align:top;text-align:left;padding:9px;min-width:12ch;max-width:44ch;overflow-wrap:anywhere;white-space:pre-wrap}th{background:#eee}tbody tr:nth-child(even){background:#fafafa}.mono{font-family:ui-monospace,monospace;font-size:12px}.note{border-left:4px solid #555;padding:12px 16px;background:#f5f5f5}.empty{color:#555;font-style:italic}.option{margin-top:28px}.option[hidden]{display:none}nav ul{padding-left:20px}footer{margin-top:40px;border-top:2px solid #555;padding-top:16px}.printing .option[hidden]{display:block}.printing tr[hidden]{display:table-row}@media(max-width:600px){body{padding:16px}h1{font-size:1.6rem}.toolbar>*{width:100%}}@media print{body{max-width:none;padding:0;font-size:10pt}.toolbar{display:none}.option[hidden]{display:block}tr[hidden]{display:table-row}.table-scroll{overflow:visible}table{min-width:0;font-size:8pt}th,td{padding:4px;min-width:0}h2,summary{break-after:avoid}tr{break-inside:avoid}a{color:#222}details{break-inside:auto}}'+
  '</style></head><body><header><p>Grant Operations · complete financing decision handover</p><h1>'+escape(study.title||'Financing options')+'</h1>'+
  '<p>'+escape(study.note)+'</p><p class="mono">Study '+escape(study.id)+' · revision '+study.revision+'<br>Comparison '+escape(comparison.id)+' · created '+escape(comparison.createdAt)+'<br>Case '+escape(comparison.result.source.programId)+' · version '+comparison.result.source.version+'<br>Native comparison SHA-256 '+escape(comparison.result.sha256)+'</p>'+
  '<p class="note"><strong>'+escape(selection.currentAtExport?'Matches the supplied case context at export':'Historical relative to the supplied case context')+'.</strong> All money measures use USD unless an original field explicitly identifies another currency. Dates retain their native meaning; timestamps identify exact recorded instants. Unknown, absent and explicit zero remain separate. Conditional receipts, staffing and delivery estimates remain assumptions until their original records establish them. Exported '+escape(selection.exportedAt)+'.</p></header>'+
  '<div class="toolbar"><label>Show an option<select id="option-filter"><option value="">All '+comparison.result.options.length+' options</option>'+comparison.result.options.map(o=>'<option value="'+escape(o.id)+'">'+escape(o.name)+'</option>').join('')+'</select></label><label>Find within complete tables<input id="row-filter" type="search" placeholder="Date, customer, field or value"></label><button id="clear-filters" type="button">Show all rows</button><button id="expand-all" type="button">Open all sections</button><button id="print-report" type="button">Print complete report</button><button id="download-study" type="button">Download complete editable study</button></div><p id="report-status" role="status" aria-live="polite">All original rows are included. Table filters only change this view.</p>'+
  '<h2>Compared options</h2><p>Reference: '+escape(baseline.name)+'. Changes are exact USD-cent differences from that selected reference. A smaller modeled amount only compares the stated scope and liabilities; Planning limits retains separate scope groups.</p>'+
  dataTable(summary,{caption:'Every original calculated option'})+
  '<h2>Planning limits and decisions</h2>'+
  (assessments.length?assessments.map(a=>details(a.criteria.name+' · '+a.createdAt+(a.id===selection.assessmentId?' · selected assessment':''),'<p>'+escape(a.criteria.note)+'</p><p>'+escape(a.report.basis)+'</p>'+attributes(a.criteria)+dataTable(assessmentRows([a]),{caption:'Every criterion and original result'})+details('Complete scope groups and original findings',attributes({scopeGroups:a.report.scopeGroups,rows:a.report.rows})),true)).join(''):'<p>No retained assessment belongs to this comparison. The original calculated options remain available without an inferred approval.</p>')+
  '<nav aria-label="Original option reports"><h2>Complete option reports</h2><ul>'+comparison.result.options.map((o,i)=>'<li><a href="#option-'+i+'">'+escape(o.name)+'</a></li>').join('')+'</ul></nav>'+optionSections+
  '<h2>Source and continuation</h2><p>The original case export carries native financial records. This handover carries the complete financing study, original comparison contexts and exact attached source bytes. Download the editable study and use Reopen study in its original Forecast or verified native-case descendant. The application validates the complete received file before adoption and requires a current native comparison before applying an option.</p>'+
  dataTable(sourceRows(comparison),{caption:'Every source in the selected original context'})+
  details('Complete retained study history',attributes({options:study.options,comparisons:study.comparisons.map(c=>({id:c.id,createdAt:c.createdAt,source:c.result.source,sha256:c.result.sha256,options:c.result.options.map(o=>({id:o.id,name:o.name}))})),adoptions:study.adoptions,sourceReceipts:study.sourceReceipts,decisionDraft:study.decision?.draft??null,earlierCriteria:study.decision?.draftHistory??[],pendingSource:study.pendingSource?{stage:study.pendingSource.stage,requestId:study.pendingSource.request.requestId}:null}))+
  '<footer><p><strong>Prepared by TokenJunkieLabs.</strong> Full original inputs, results, unknowns and histories are retained. Customer-fund reservations are planning restrictions; they do not establish a bank or legal restriction. No payment, award, invoice, customer acceptance or Forecast save is created by opening this report.</p><p class="mono">Selection SHA-256 '+escape(selection.sha256)+'</p></footer>'+
  '<script id="financing-handover-data" type="application/json">'+embedded+'</script><script>'+
  '(()=>{"use strict";const $=id=>document.getElementById(id),data=JSON.parse($("financing-handover-data").textContent);function status(s){$("report-status").textContent=s}function filter(){const id=$("option-filter").value,q=$("row-filter").value.toLowerCase();document.querySelectorAll(".option").forEach(s=>s.hidden=!!id&&s.dataset.option!==id);let shown=0,total=0;document.querySelectorAll("tbody tr").forEach(r=>{total++;r.hidden=!!q&&!r.textContent.toLowerCase().includes(q);if(!r.hidden)shown++});status(shown+" of "+total+" table rows match. All rows remain in this file and its complete study.")}$("option-filter").addEventListener("change",filter);$("row-filter").addEventListener("input",filter);$("clear-filters").addEventListener("click",()=>{$("option-filter").value="";$("row-filter").value="";filter()});$("expand-all").addEventListener("click",()=>document.querySelectorAll("details").forEach(x=>x.open=true));let earlier=[];function before(){earlier=[...document.querySelectorAll("details")].map(x=>[x,x.open]);document.querySelectorAll("details").forEach(x=>x.open=true);document.body.classList.add("printing")}function after(){for(const[x,open]of earlier)x.open=open;document.body.classList.remove("printing");earlier=[]}addEventListener("beforeprint",before);addEventListener("afterprint",after);$("print-report").addEventListener("click",()=>window.print());$("download-study").addEventListener("click",()=>{const u=URL.createObjectURL(new Blob([data.study],{type:"application/json"})),a=document.createElement("a");a.href=u;a.download=data.studyFilename;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);status("Downloaded the complete original editable study. Reopen it in the original Forecast application.")});})();'+
  '</script></body></html>\n';
}
export async function buildFinancingHandover(state,current,{comparisonId=state.selectedComparisonId,assessmentId=null,baselineId=state.baselineId,exportedAt=new Date().toISOString()}={}){
  need(typeof exportedAt==='string'&&Number.isFinite(Date.parse(exportedAt)),'Retain the actual handover time.');
  const study=await verifyFinancingState(state,current,{complete:true});
  const comparison=study.comparisons.find(c=>c.id===comparisonId);need(comparison,'Select a complete native comparison before exporting its handover.');
  const baseline=comparison.result.options.find(o=>o.id===baselineId)||comparison.result.options[0];need(baseline,'The original reference option is absent.');
  const assessments=(study.decision?.assessments||[]).filter(a=>a.comparisonId===comparison.id);
  if(assessmentId!==null)need(assessments.some(a=>a.id===assessmentId),'The selected assessment belongs to another native comparison.');
  const selection={schema:FINANCING_HANDOVER_SCHEMA,studyId:study.id,studyRevision:study.revision,studySha256:await financingSha(study),comparisonId:comparison.id,comparisonSha256:comparison.result.sha256,baselineId:baseline.id,assessmentId,source:clone(comparison.result.source),exportedAt,
    currentAtExport:financingComparisonCurrent({...study,selectedComparisonId:comparison.id},current)};
  selection.sha256=await financingSha(selection);
  const bm=financingMetrics(baseline.preview);
  const summary=comparison.result.options.map(o=>{const m=financingMetrics(o.preview),r=o.preview.report;return {optionId:o.id,option:o.name,asOfDate:r.asOfDate,firstForecastDate:r.firstForecastDate,lastForecastDate:r.lastForecastDate,
    grantRequiredStartingUsd:m.grantNeed,combinedRequiredStartingUsd:m.combinedNeed,combinedChangeFromReferenceUsd:financingMoneyDelta(bm.combinedNeed,m.combinedNeed),combinedExtraAfterOpeningUsd:m.combinedGap,combinedPeakDate:m.combinedPeak,endCashUsd:m.endBalance,
    customerProtectionEnabled:m.protectedEnabled,protectedRequiredStartingUsd:m.protectedNeed,protectedExtraAfterOpeningUsd:m.protectedGap,availableWeeklyHours:m.weeklyHours,peakWeeklyEquivalentHours:m.peakWeekly,overloadedDays:m.overloadedDays,
    undatedWorkHours:r.eventTiming?.undatedHours??'0',undatedDeliveryCostUsd:r.eventTiming? r.eventTiming.undatedDeliveryCostUsd : '0.00',datedCashValuationComplete:m.currencyComplete,issues:m.issueCount,...(m.bridgeEnabled?{bridgeEnabled:true,financedStartingUsd:m.financedNeed,financedGapUsd:m.financedGap,financedEndingCashUsd:m.financedEnd,endingPrincipalUsd:m.endingPrincipal,explicitDatedFinancingExpenseUsd:m.financingExpense,enteredCapDateFeasibility:m.bridgeFeasibility}: {})};});
  const file={schema:FINANCING_FILE_SCHEMA,sourceMode:'COMPLETE',exportedAt,study};
  const files=[],add=(path,content)=>files.push({path,content});
  add('study.json',compact(file));add('selection.json',json(selection));add('comparison.json',json(comparison));add('option-summary.csv',financingHandoverCsv(summary));add('assessments.json',json(assessments));add('planning-limits.csv',financingHandoverCsv(assessmentRows(assessments)));
  comparison.result.options.forEach((o,i)=>{const prefix='options/'+String(i+1).padStart(2,'0')+'/';
    add(prefix+'original-preview.json',json(o.preview));add(prefix+'complete-inputs.csv',financingHandoverCsv(financingHandoverFields(o.preview.inputs),['path','kind','value']));
    add(prefix+'complete-report-fields.csv',financingHandoverCsv(financingHandoverFields(o.preview.report),['path','kind','value']));
    add(prefix+'assumption-differences.csv',financingHandoverCsv(financingHandoverChanges(baseline.preview.inputs,o.preview.inputs),['path','beforeKind','before','afterKind','after']));
    for(const t of tablesFor(o.preview.report))add(prefix+t.key+'.csv',financingHandoverCsv(t.rows));
  });
  const sources=new Map(),sourceIndex=[];
  for(const c of study.comparisons)for(const a of c.attachments){const meta=c.context.sources.find(s=>s.id===a.id),path='sources/'+a.sha256+'.bin';if(!sources.has(a.sha256)){sources.set(a.sha256,true);add(path,decodeWorkbookBytes(a.dataBase64));}sourceIndex.push({comparisonId:c.id,path,...clone(meta)});}
  add('source-index.json',json(sourceIndex));
  add('README.txt','Financing decision handover\n\nOpen report.html to read all selected native options, every dated row, assumptions, reservations and assessments offline. Filters only change the view; Print complete report includes every option and row.\n\nOpen study.json with Reopen study in the original Forecast application or its verified direct native-case descendant. The complete study retains all original comparisons, context, exact source bytes, raw unfinished drafts, decisions and original pending requests. Source files are also in sources/, mapped by source-index.json. This is private operating information; share with the authorized recipient.\n\nThe original calculator is unchanged. All derived money columns are USD unless explicitly labeled otherwise. CSV empty cells mean absent/null; exact typed missing/null/empty-array/zero values are retained in complete-inputs.csv, complete-report-fields.csv and JSON. Finite numeric values and strict signed-decimal USD/hour and criterion fields stay numeric in CSV. Formula-like ordinary text is guarded; original JSON remains exact. Native assets and exchange evidence remain in the original reports.\n\nCustomer-fund reservations are planning restrictions. Conditional forecasts do not record actual payments, award acceptance or customer commitments. Selected limits assess only the finite entered options and their retained scopes. Recalculate against the current case before adoption.\n\nThe original full case archive remains the native financial handover. Prepared by TokenJunkieLabs.\n');
  const manifest={schema:FINANCING_HANDOVER_SCHEMA+'.manifest',selection,files:[]};
  for(const f of files){const b=typeof f.content==='string'?utf8(f.content):f.content;manifest.files.push({path:f.path,bytes:b.length,sha256:await financingSha(b)});}
  const model={study,comparison,baseline,assessments,selection,summary,manifest};
  const html=localHtml(model,file);add('report.html',html);manifest.files.push({path:'report.html',bytes:utf8(html).length,sha256:await financingSha(html)});
  add('manifest.json',json(manifest));
  const size=files.reduce((n,f)=>n+(typeof f.content==='string'?utf8(f.content).length:f.content.length),0);
  need(size<=MAX_FINANCING_HANDOVER_BYTES,'The complete handover exceeds 512 MiB. Preserve the original complete study; select a smaller separately named study for a readable handover. No rows were truncated.');
  const bytes=zipWorkspace(files);
  need(bytes.length<=MAX_FINANCING_HANDOVER_BYTES,'The complete archive exceeds 512 MiB. Preserve the original complete study; no rows were truncated.');
  return {selection,manifest,files,html,bytes,filename:study.id+'-'+comparison.id+'-handover.zip'};
}
