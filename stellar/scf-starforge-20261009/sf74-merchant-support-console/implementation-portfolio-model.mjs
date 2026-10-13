// MIT. Shared projection, filters and complete operating report for original SF74 cases.
export const PORTFOLIO_SCHEMA='stellar-forge.implementation-portfolio.v1';
export const SELECTION_SCHEMA='stellar-forge.implementation-portfolio-selection.v1';
export const PREVIEW_SCHEMA='stellar-forge.implementation-portfolio-preview.v1';
export const RESULT_SCHEMA='stellar-forge.implementation-portfolio-result.v1';
export const MAX_SELECTION_BYTES=16*1024*1024;
export const MAX_REPORT_BYTES=64*1024*1024;
export const ATTENTION=Object.freeze(['all','overdue','unassigned','blocked','source_changes','receiving_stale','changes_required','technical_open','customer_open']);
export const STATUSES=Object.freeze(['planned','in_progress','ready','done','retired']);
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
export const copy=value=>JSON.parse(JSON.stringify(value));
export const fail=(message,code='INVALID_IMPLEMENTATION_PORTFOLIO',status=422)=>Object.assign(new Error(message),{code,status});
export function object(value,keys,label='input'){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||
    Object.keys(value).some(key=>!keys.includes(key)))throw fail('Unexpected '+label+' fields.');
  return value;
}
export function text(value,limit,label,{empty=true}={}){
  if(typeof value!=='string'||value.length>limit||!empty&&!value.trim()||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||decoder.decode(encoder.encode(value))!==value)
    throw fail('Use valid '+label+' of at most '+limit+' characters.');
  return value;
}
export function day(value,label='date',{empty=false}={}){
  text(value,10,label);
  if(empty&&value==='')return value;
  if(!/^\d{4}-\d\d-\d\d$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||
    new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw fail('Use a valid '+label+' in YYYY-MM-DD form.');
  return value;
}
export function canonical(value){
  if(value===null||typeof value!=='object'){
    const result=JSON.stringify(value);if(result===undefined||typeof value==='number'&&!Number.isFinite(value))throw fail('Unsupported JSON value.');
    return result;
  }
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
export async function digest(value){
  const bytes=value instanceof Uint8Array?value:encoder.encode(typeof value==='string'?value:canonical(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function byteLength(value){return encoder.encode(value).length;}
export function validateChanges(value){
  object(value,['owner','dueOn','status','notes'],'task changes');
  if(!Object.keys(value).length)throw fail('Select at least one operational field to change.');
  if(Object.hasOwn(value,'owner'))text(value.owner,200,'task owner');
  if(Object.hasOwn(value,'dueOn'))day(value.dueOn,'task due date',{empty:true});
  if(Object.hasOwn(value,'status')&&!STATUSES.includes(value.status))throw fail('Choose an original task status.');
  if(Object.hasOwn(value,'notes'))text(value.notes,64000,'work notes');
  return copy(value);
}
export function validateQuery(value={}){
  object(value,['q','owner','status','attention','dueOn','includeRetired'],'task query');
  const result={q:value.q??'',owner:value.owner??'',status:value.status??'',attention:value.attention??'all',
    dueOn:value.dueOn??'',includeRetired:value.includeRetired??false};
  text(result.q,1000,'task search');text(result.owner,200,'owner search');
  if(result.status&&!STATUSES.includes(result.status))throw fail('Choose an original task status.');
  if(!ATTENTION.includes(result.attention))throw fail('Choose a supported work filter.');
  day(result.dueOn,'task deadline',{empty:true});
  if(typeof result.includeRetired!=='boolean')throw fail('Choose whether retired tasks are included.');
  return result;
}
export function filterRow(row,value={}){
  const query=validateQuery(value),task=row.task;
  if(!query.includeRetired&&(task.retired||task.status==='retired'))return false;
  if(query.status&&task.status!==query.status)return false;
  if(query.owner&&!task.owner.toLowerCase().includes(query.owner.toLowerCase()))return false;
  if(query.dueOn&&(!task.dueOn||task.dueOn>query.dueOn))return false;
  if(query.attention!=='all'&&!row.flags[query.attention])return false;
  const needle=query.q.toLowerCase();
  return !needle||[row.caseName,row.merchant,row.caseOwner,row.planTitle,row.implementationOwner,row.receivingOwner,
    task.id,task.title,task.owner].join('\n').toLowerCase().includes(needle);
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const receiving=value=>!value?'No observation':value.outcome.replaceAll('_',' ')+(value.current?' · current subject':' · earlier subject')+' · '+value.actor+' · '+value.observedAt;
export function renderPortfolioReport(report){
  if(report?.schema!==PORTFOLIO_SCHEMA||!Array.isArray(report.rows)||!Array.isArray(report.caseSummaries))throw fail('Use a complete original portfolio report.');
  const rows=report.rows.map(row=>'<tr><td>'+esc(row.caseName)+'<br><small>'+esc(row.caseId)+'<br>'+esc(row.caseRevision)+'</small></td><td>'+esc(row.task.title)+'<br><small>'+esc(row.task.id)+'</small></td><td>'+esc(row.task.owner||'Unassigned')+'</td><td>'+esc(row.task.dueOn||'—')+'</td><td>'+esc(row.task.status)+'</td><td>'+esc(Object.entries(row.flags).filter(([,v])=>v).map(([k])=>k.replaceAll('_',' ')).join('; ')||'—')+'</td><td>'+esc(receiving(row.technical))+'</td><td>'+esc(receiving(row.customer))+'</td></tr>').join('');
  const sources=report.caseSummaries.map(row=>'<tr><td>'+esc(row.case.name)+'</td><td>'+esc(row.case.id)+'</td><td>'+esc(row.case.revision)+'</td><td>'+esc(row.summary?.tasks??0)+'</td><td>'+esc(row.summary?.receivingNeedsUpdate??0)+'</td></tr>').join('');
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Implementation operating report</title><style>html{color:#222;background:#fff;font:15px/1.5 system-ui}body{margin:clamp(.75rem,3vw,2rem);max-width:1800px;min-width:0}h1,h2{line-height:1.2;overflow-wrap:anywhere}p{overflow-wrap:anywhere}.table-scroll{max-width:100%;overflow:auto;border:1px solid #bbb;margin:1rem 0}.pan-note{font-size:.9rem;color:#555}table{border-collapse:collapse;width:100%;min-width:65rem}td,th{border:1px solid #bbb;padding:.6rem;vertical-align:top;text-align:left;overflow-wrap:anywhere;max-width:24rem}small,code{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%} @media print{body{margin:0;font-size:9pt}.table-scroll{overflow:visible;max-width:none;border:0}.pan-note{display:none}table{min-width:0;table-layout:fixed;font-size:8pt}td,th{padding:.25rem;max-width:none}thead{display:table-header-group}tr{break-inside:avoid}}</style><h1>Implementation operating report</h1><p>Captured '+esc(report.selection.capturedAt)+' · task dates assessed on '+esc(report.selection.asOf)+'. Each case uses its listed immutable saved revision; this is a sequence of original case-head observations, not a transaction across the entire workspace.</p><p>'+report.rows.length+' matching tasks across '+report.caseSummaries.length+' readable cases. Coverage: '+esc(report.coverage.complete?'complete selected case inventory':'incomplete — source failures are listed below')+'. Original task status, technical receiving and customer receiving remain distinct. Dependencies describe saved work; no scheduler or delivery acceptance is inferred.</p><h2>Selected work</h2><pre>'+esc(JSON.stringify(report.query,null,2))+'</pre><p class="pan-note">On a narrow screen, scroll the complete work table horizontally.</p><div class="table-scroll" role="region" aria-label="Complete selected work" tabindex="0"><table><thead><tr><th>Case / exact revision</th><th>Task</th><th>Owner</th><th>Due</th><th>Work status</th><th>Attention</th><th>Technical receiving</th><th>Customer receiving</th></tr></thead><tbody>'+rows+'</tbody></table></div><h2>Original case sources</h2><p class="pan-note">Scroll horizontally to read complete source identities.</p><div class="table-scroll" role="region" aria-label="Original case sources" tabindex="0"><table><thead><tr><th>Case</th><th>Original case ID</th><th>Saved revision</th><th>Active tasks</th><th>Stale receiving tasks</th></tr></thead><tbody>'+sources+'</tbody></table></div><h2>Unavailable sources</h2><pre>'+esc(JSON.stringify(report.coverage.unavailable,null,2))+'</pre><h2>Continue the original work</h2><p>Open the original Support application, select the named case and saved revision, and use Implementation for complete task definitions, materials and receiving history. Use Complete delivery to export and receive the full source-bearing case. This operating report contains task and source references; it does not replace the complete case package or its original files.</p><p>Selection SHA-256: <code>'+esc(report.selection.selectionSha256)+'</code></p></html>\n';
}
