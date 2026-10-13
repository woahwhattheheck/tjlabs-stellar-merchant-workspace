import {dateOnly,selectPeriod,comparePeriods,compareEditions} from './maritime-analysis.mjs';
export const PROJECT_VERSION='1.0.0';
export const MAX_PROJECT_ENTRIES=48;
export const MAX_PROJECT_CELLS=500000;
const need=(ok,message)=>{if(!ok)throw new Error(message)};
const object=(value,label)=>{need(value&&typeof value==='object'&&!Array.isArray(value),label+' must be an object');return value};
const allowed=(value,names,label)=>{for(const key of Object.keys(value))need(names.includes(key),label+': unsupported field '+key)};
const text=(value,label,max=300)=>{need(typeof value==='string'&&value.trim()&&value.length<=max,label+' must be nonempty text within '+max+' characters');return value};
const slug=(value,label)=>{need(typeof value==='string'&&/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value),label+' must be a lowercase file-safe identifier of at most 80 characters');return value};
function periodRange(value,label){
 object(value,label);allowed(value,['from','until'],label);
 const from=dateOnly(value.from),until=dateOnly(value.until);need(from<until,label+' must have from < until');
 return {from,until};
}
export function validateProject(config){
 object(config,'Project');allowed(config,['schema','id','title','entries'],'Project');
 need(config.schema==='econdb.maritime-project.v1','Unsupported project schema');
 const id=slug(config.id,'Project ID'),title=text(config.title,'Project title');
 need(Array.isArray(config.entries)&&config.entries.length>0&&config.entries.length<=MAX_PROJECT_ENTRIES,'Choose between 1 and '+MAX_PROJECT_ENTRIES+' project entries');
 const ids=new Set();
 const entries=config.entries.map((entry,index)=>{
  const label='Entry '+(index+1);object(entry,label);allowed(entry,['id','title','current','previous','selection','before','after'],label);
  const id=slug(entry.id,label+' ID');need(!ids.has(id),'Repeated project entry ID '+id);ids.add(id);
  const current=text(entry.current,label+' current edition directory',4096);
  const previous=entry.previous==null?null:text(entry.previous,label+' previous edition directory',4096);
  need(!current.includes('\0')&&!(previous??'').includes('\0'),'Edition paths cannot contain NUL');
  const before=entry.before==null?null:periodRange(entry.before,label+' earlier period');
  const after=entry.after==null?null:periodRange(entry.after,label+' later period');
  need(Boolean(before)===Boolean(after),label+' must supply both comparison periods together');
  return {id,title:text(entry.title,label+' title'),current,previous,selection:periodRange(entry.selection,label+' selection'),before,after};
 });
 return {schema:config.schema,id,title,entries};
}
function editionIdentity(edition){
 return {id:edition.id,title:edition.title,source:edition.source,request:edition.request};
}
export function analyzeProject(config,editions){
 const project=validateProject(config);need(editions instanceof Map,'Supply received editions in a Map keyed by project entry ID');
 let retainedCells=0;
 for(const entry of project.entries){
  const received=editions.get(entry.id);need(received?.current?.schema==='econdb.maritime-edition.v1','Missing received current edition for '+entry.id);
  need(Boolean(entry.previous)===Boolean(received.previous),'Previous edition selection does not match received source for '+entry.id);
  if(received.previous)need(received.previous.schema==='econdb.maritime-edition.v1','Invalid received previous edition for '+entry.id);
  retainedCells+=received.current.rows.length+(received.previous?.rows.length??0);
  need(retainedCells<=MAX_PROJECT_CELLS,'Project exceeds '+MAX_PROJECT_CELLS+' current and previous source cells; divide it into complete source-consistent projects');
 }
 const entries=project.entries.map(entry=>{
  const received=editions.get(entry.id),edition=received.current,period=selectPeriod(edition,entry.selection);
  const comparison=entry.before?comparePeriods(edition,entry.before,entry.after):null;
  const revisions=received.previous?compareEditions(received.previous,edition,entry.selection):null;
  const cellStates=Object.fromEntries(['known','null','absent','unsupported_value'].map(status=>[status,period.rows.filter(row=>row.status===status).length]));
  const incompleteSeries=comparison?comparison.comparisons.filter(row=>row.before.reasons.length||row.after.reasons.length).length:0;
  const changedCells=revisions?Object.entries(revisions.counts).filter(([kind])=>kind!=='unchanged').reduce((sum,[,count])=>sum+count,0):0;
  const summary={selected_cells:period.rows.length,cell_states:cellStates,observed_dates:period.dates.length,expected_monthly_dates:period.expected_dates?.length??null,missing_monthly_dates:period.missing_dates?.length??null,source_issues:period.issues.length,incomplete_comparison_series:incompleteSeries,changed_cells:changedCells,metadata_changes:revisions?.metadata_changes.length??0,has_previous:Boolean(received.previous),has_period_comparison:Boolean(comparison),empty:period.rows.length===0};
  return {id:entry.id,title:entry.title,current:editionIdentity(edition),previous:received.previous?editionIdentity(received.previous):null,period,comparison,revisions,summary};
 });
 const sourceIdentities=new Set(),ports=new Set(),sourceRoles=new Set();
 for(const entry of entries){
  for(const edition of [entry.current,entry.previous].filter(Boolean))sourceIdentities.add(JSON.stringify([edition.id,edition.source.source_sha256,edition.source.captured_at,edition.source.source_role,edition.request]));
  if(entry.current.request.locode!==null)ports.add(entry.current.request.locode);
  sourceRoles.add(entry.current.source.source_role);
 }
 const sum=field=>entries.reduce((total,entry)=>total+entry.summary[field],0);
 return {schema:'econdb.maritime-project-analysis.v1',version:PROJECT_VERSION,project:{id:project.id,title:project.title},entries,summary:{entries:entries.length,identified_ports:[...ports].sort(),unassigned_port_entries:entries.filter(entry=>entry.current.request.locode===null).length,distinct_source_editions:sourceIdentities.size,source_roles:[...sourceRoles].sort(),retained_cells:retainedCells,selected_cells:sum('selected_cells'),unknown_cells:entries.reduce((total,entry)=>total+entry.summary.cell_states.null+entry.summary.cell_states.absent+entry.summary.cell_states.unsupported_value,0),empty_entries:entries.filter(entry=>entry.summary.empty).length,missing_monthly_labels:sum('missing_monthly_dates'),expected_monthly_coverage_not_inferred_entries:entries.filter(entry=>entry.summary.expected_monthly_dates===null).length,frequency_undeclared_entries:entries.filter(entry=>entry.current.request.frequency===null).length,partial_month_selection_entries:entries.filter(entry=>entry.current.request.frequency==='monthly'&&entry.period.expected_dates===null).length,source_issues:sum('source_issues'),incomplete_comparison_series:sum('incomplete_comparison_series'),changed_cells:sum('changed_cells'),metadata_changes:sum('metadata_changes'),cell_count_basis:'Entry-level counts; repeated views of the same source are counted in each view.',cross_measure_total:null}};
}
function requireAnalysis(analysis){need(analysis?.schema==='econdb.maritime-project-analysis.v1'&&Array.isArray(analysis.entries),'Use a produced maritime project analysis')}
function csvCell(value){
 let s=value==null?'':String(value);
 if(/^[\s]*[=+@]/.test(s)||/^[\t\r\n]/.test(s)||(/^[\s]*-/.test(s)&&!/^\-\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(s)))s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
}
export function projectRowsCSV(analysis){
 requireAnalysis(analysis);
 const fields=['project_id','entry_id','entry_title','edition_id','source_role','captured_at','locode','endpoint','flow','operator','top','measure','population','frequency','selection_from','selection_until_exclusive','date','series','series_name','status','exact_value','source_lexeme','source_row','source_sha256'];
 const rows=[fields];
 for(const entry of analysis.entries){
  const period=entry.period,request=period.request,names=new Map(period.series.map(series=>[series.code,series.name]));
  for(const row of period.rows)rows.push([analysis.project.id,entry.id,entry.title,period.edition_id,period.source.source_role,period.source.captured_at,request.locode,request.kind,request.query?.flow,request.query?.operator,request.query?.top,request.measure,request.population,period.frequency,period.selection.from,period.selection.until,row.date,row.series,names.get(row.series),row.status,row.exact,row.source_lexeme,row.source_row,period.source.source_sha256]);
 }
 return rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function table(headers,rows){return '<div class="table" tabindex="0"><table><thead><tr>'+headers.map(value=>'<th scope="col">'+esc(value)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'}
function sourceDescription(entry){
 const r=entry.current.request;
 return [r.kind,r.query?.flow??'flow undeclared',r.query?.operator?'operator '+r.query.operator:'operator selection '+r.population,r.query?.top===undefined?'':'top '+r.query.top].filter(Boolean).join(' · ');
}
export function projectHTML(analysis,{engine_sha256=null,project_engine_sha256=null}={}){
 requireAnalysis(analysis);
 for(const digest of [engine_sha256,project_engine_sha256])need(digest===null||/^[a-f0-9]{64}$/.test(digest),'Use exact producing source SHA-256 values');
 const summary=analysis.summary;
 const links='<nav aria-label="Project files"><a href="observations.csv" download>All selected observations · CSV</a><a href="project-analysis.json" download>Complete analysis · JSON</a><a href="project.json" download>Native project configuration · JSON</a><a href="browser-workspace.json" download>Editable browser workspace · JSON</a><a href="REOPEN.md">Reopening instructions</a></nav>';
 const overview=table(['Entry','Port','Measure / selection','Selected cells','Unknown cells','Missing monthly labels','Cell revisions','Metadata changes'],analysis.entries.map(entry=>[entry.title,entry.current.request.locode??'Unassigned in issuer example',sourceDescription(entry),entry.summary.selected_cells,entry.summary.cell_states.null+entry.summary.cell_states.absent+entry.summary.cell_states.unsupported_value,entry.summary.missing_monthly_dates??'Not inferred',entry.revisions?entry.summary.changed_cells:'No prior edition selected',entry.revisions?entry.summary.metadata_changes:'No prior edition selected']));
 const details=analysis.entries.map(entry=>{
  const base='entries/'+entry.id+'/',original='originals/'+entry.id+'/',period=entry.period,r=entry.current.request,s=entry.summary;
  let controls='<nav aria-label="'+esc(entry.title)+' files"><a href="'+base+'report.html">Open detailed report</a><a href="'+base+'observations.csv" download>Selected observations · CSV</a><a href="'+base+'selected-period.json" download>Selected observations · JSON</a><a href="'+original+'current/response.json" download>Current original response</a><a href="'+original+'current/descriptor.json" download>Current source descriptor</a>';
  if(entry.comparison)controls+='<a href="'+base+'period-comparison.json" download>Period comparison · JSON</a>';
  if(entry.revisions)controls+='<a href="'+base+'edition-comparison.json" download>Source revisions · JSON</a><a href="'+original+'previous/response.json" download>Previous original response</a><a href="'+original+'previous/descriptor.json" download>Previous source descriptor</a>';
  controls+='</nav>';
  const dl=[['Port',r.locode??'Unassigned in issuer example'],['Measure',r.measure],['Endpoint / request',sourceDescription(entry)],['Population',r.population],['Source role',entry.current.source.source_role],['Current edition',entry.current.id+' · '+entry.current.source.captured_at],['Previous edition',entry.previous?entry.previous.id+' · '+entry.previous.source.captured_at:'None selected'],['Local selection',period.selection.from+' ≤ original Date < '+period.selection.until],['Source frequency',r.frequency??'Undeclared; source dates retained'],['Selected observed dates',period.dates.length?period.dates.join(', '):'No source dates in this selection'],['Expected monthly dates',period.expected_dates===null?'Not inferred for this frequency or partial-month selection':String(period.expected_dates.length)],['Missing monthly labels',period.missing_dates===null?'Not inferred':period.missing_dates.length?period.missing_dates.join(', '):'None'],['Original source',entry.current.source.original_url??'No observed request URL'],['Current source SHA-256',entry.current.source.source_sha256]];
  const notes=[];
  if(s.empty)notes.push('This local selection contains no observed source cells.');
  if(s.cell_states.null)notes.push(s.cell_states.null+' null source cells remain unknown.');
  if(s.cell_states.absent)notes.push(s.cell_states.absent+' absent source cells remain absent.');
  if(s.cell_states.unsupported_value)notes.push(s.cell_states.unsupported_value+' unsupported source values require source review.');
  if(s.source_issues)notes.push(s.source_issues+' source structure or coverage exceptions appear in the detailed report.');
  if(s.incomplete_comparison_series)notes.push(s.incomplete_comparison_series+' series have incomplete monthly comparison inputs.');
  if(entry.revisions)notes.push(s.changed_cells+' changed selected cells and '+s.metadata_changes+' metadata or coverage changes between the selected source editions.');
  return '<section id="'+entry.id+'"><h2>'+esc(entry.title)+'</h2>'+controls+'<dl>'+dl.map(([label,value])=>'<dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd>').join('')+'</dl>'+table(['Known cells','Null cells','Absent cells','Unsupported cells'],[['known','null','absent','unsupported_value'].map(state=>s.cell_states[state])])+(notes.length?'<ul>'+notes.map(note=>'<li>'+esc(note)+'</li>').join('')+'</ul>':'')+'</section>';
 }).join('');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>'+esc(analysis.project.title)+' — maritime project</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#202020;background:white;max-width:1200px;margin:30px auto;padding:0 22px}h1{font-size:28px;line-height:1.2}h2{font-size:21px}h1,h2,dd,li,p{overflow-wrap:anywhere}a{color:#222;text-underline-offset:3px}a:focus-visible,.table:focus-visible{outline:3px solid #333;outline-offset:3px}nav{display:flex;flex-wrap:wrap;gap:10px 20px;margin:16px 0}section{border-top:1px solid #aaa;margin-top:30px;padding-top:16px}dl{display:grid;grid-template-columns:180px minmax(0,1fr);gap:8px 18px}dt{font-weight:600}dd{margin:0}.table{max-width:100%;overflow:auto;margin:16px 0}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:left;vertical-align:top;padding:9px 12px;border-bottom:1px solid #ccc}th{background:#eee}.small{font-size:13px;color:#555}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin:20px 0}.metric{border:1px solid #bbb;padding:12px}.metric strong{display:block;font-size:24px}@media(max-width:600px){body{padding:0 12px;margin:18px auto}h1{font-size:25px}dl{grid-template-columns:1fr;gap:3px}dd{margin-bottom:10px}nav{display:grid;gap:12px}th,td{padding:7px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}@media print{body{max-width:none;margin:0;padding:0;font-size:10pt}nav{display:none}.table{overflow:visible}table{table-layout:fixed}th,td{overflow-wrap:anywhere;padding:5px}thead{display:table-header-group}tr{break-inside:avoid}section{break-before:auto}h2{break-after:avoid}}</style></head><body><h1>'+esc(analysis.project.title)+'</h1><p>Maritime project · '+esc(analysis.project.id)+'</p><p>Each entry retains its own source, port, request, measure and date selection. The overview counts source cells and review findings. Numeric capacity and container-volume observations remain in their individual reports and exports.</p>'+links+'<div class="metrics">'+[['Project entries',summary.entries],['Identified ports',summary.identified_ports.length],['Selected cells',summary.selected_cells],['Unknown cells',summary.unknown_cells]].map(([label,value])=>'<div class="metric"><strong>'+esc(value)+'</strong>'+esc(label)+'</div>').join('')+'</div><p class="small">'+esc(summary.cell_count_basis)+' Unassigned-port entries: '+esc(summary.unassigned_port_entries)+'. Source roles: '+esc(summary.source_roles.join(', '))+'. CSV is a human spreadsheet export; JSON retains exact decimal strings.</p><h2>Project overview</h2>'+overview+'<nav aria-label="Project entries">'+analysis.entries.map(entry=>'<a href="#'+entry.id+'">'+esc(entry.title)+'</a>').join('')+'</nav>'+details+'<section><h2>Analysis source</h2><dl><dt>Period engine SHA-256</dt><dd>'+esc(engine_sha256??'See accompanying source manifest')+'</dd><dt>Project engine SHA-256</dt><dd>'+esc(project_engine_sha256??'See accompanying source manifest')+'</dd></dl><p>Use the accompanying retained original responses and descriptors to continue the project. Date windows are applied locally to the original Date values. The original API request and data license remain controlling.</p></section></body></html>';
}
