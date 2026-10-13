// MIT. Complete original Econdb maritime projects joined to customer Installation and Workshare.
import {createHash} from 'node:crypto';
import {prepareInstallation,renderWorkorder} from './prepare-core.mjs';
import {commercialWorkshare,commercialMarkdown,commercialHtml} from './commercial-workshare-core.mjs';
import {validateProject,MAX_PROJECT_ENTRIES,MAX_PROJECT_CELLS} from '../econdb/maritime-project-analysis.mjs';

export const ECONDB_INSTALLATION_SCHEMA='stellar-forge.econdb-customer-installation.v1';
export const ECONDB_INSTALLATION_PROFILE='econdb-customer';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'ECONDB_INSTALLATION_INPUT'});};
export const parse=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const ordered=x=>Array.isArray(x)?x.map(ordered):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x;
export const same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
export const identity=(name,bytes,mediaType='application/octet-stream')=>({name,bytes:bytes.length,sha256:hash(bytes),mediaType});
export const ordinary=name=>typeof name==='string'&&name.length>0&&name.length<=4096&&!/^[\\/]|[\\:\x00-\x1f]/.test(name)&&name.split('/').every(p=>p&&p!=='.'&&p!=='..');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x);
const count=x=>Number.isSafeInteger(x)&&x>=0;
const text=x=>typeof x==='string'&&x.trim().length>0;
const iso=x=>text(x)&&Number.isFinite(Date.parse(x));
const sameIdentity=(a,b)=>a?.bytes===b?.bytes&&a?.sha256===b?.sha256;
function exact(row,label,{positive=false}={}){
 need(object(row)&&ordinary(row.name)&&count(row.bytes)&&(!positive||row.bytes>0)&&hex(row.sha256),'Retain the exact '+label+' file identity.');
 return row;
}
function fileList(rows,label,{empty=false}={}){
 need(Array.isArray(rows)&&(empty||rows.length>0),'Retain the complete '+label+' file list.');
 const found=new Map();
 for(const row of rows){exact(row,label);need(!found.has(row.name),'The '+label+' file list repeats '+row.name);found.set(row.name,row);}
 return found;
}
function integerFields(value,fields,label){
 need(object(value),'Retain the complete '+label+'.');
 for(const field of fields)need(count(value[field]),'Retain the original '+label+' '+field+' count.');
}
function sourceEdition(value,label){
 need(object(value)&&text(value.id)&&text(value.title)&&object(value.source)&&object(value.request),'Retain the complete original '+label+' edition identity.');
 need(hex(value.source.source_sha256)&&iso(value.source.captured_at)&&text(value.source.source_role),'Retain the original '+label+' source digest, capture time and source role.');
 need(value.request.locode===null||text(value.request.locode),'Preserve the original '+label+' port selection, including unassigned.');
 need(value.request.frequency===null||text(value.request.frequency),'Preserve the original '+label+' frequency, including undeclared.');
}

/** Validate the compact presentation against the identities checked by the original native receiver.
 * Complete archive and project bytes are verified by inspectOperatorTransfer and verifyProject upstream.
 */
export function validateEcondbInstallationSource(source){
 need(object(source)&&source.schema===ECONDB_INSTALLATION_SCHEMA+'.source','Select the complete original Econdb customer source inspection.');
 exact(source.archive,'whole Econdb workspace',{positive:true});
 exact(source.transferManifest,'original workspace transfer manifest',{positive:true});
 need(source.archive.name==='econdb-workspace.zip'&&source.transferManifest.name==='operator-transfer.json','Preserve the whole original Econdb workspace and its transfer manifest.');
 const workspace=source.workspace;
 need(object(workspace)&&uuid(workspace.id)&&count(workspace.revision)&&workspace.revision>0
  &&count(workspace.files)&&workspace.files>0&&count(workspace.totalBytes)&&workspace.totalBytes>0,
  'Retain the original complete workspace identity, revision and file population.');
 need(iso(source.observedAt),'Retain the actual source inspection time.');
 const project=source.project,record=project?.record;
 need(object(project)&&object(record)&&uuid(record.id)&&record.kind==='project'
  &&['project-build','project-import'].includes(record.action)
  &&count(record.revision)&&record.revision>0&&record.revision<=workspace.revision
  &&hex(record.requestSha256)&&iso(record.createdAt)&&text(record.title),
  'Retain the original saved project command and its revision.');
 need(record.directory==='artifacts/'+record.id&&object(record.artifactManifest)
  &&record.artifactManifest.path==='operations/'+record.id+'/artifact-manifest.json'&&hex(record.artifactManifest.sha256),
  'Retain the original project artifact inventory separately from its project manifest.');
 const config=validateProject(project.config);
 need(config.id===record.projectId&&config.title===record.title&&hex(project.inputSha256)
  &&project.inputSha256===record.inputSha256,'The selected project differs from its original input binding.');
 exact(project.manifest,'project manifest',{positive:true});exact(project.analysisFile,'project analysis',{positive:true});
 need(project.manifest.name==='project-manifest.json'&&project.analysisFile.name==='project-analysis.json',
  'Retain the original project manifest and complete analysis files.');
 const files=fileList(source.files,'selected Econdb project');
 for(const name of ['project-manifest.json','project-analysis.json','project-state.json','project.json',
  'browser-workspace.json','observations.csv','report.html','REOPEN.md'])
  need(files.has(name),'The complete project is missing '+name+'.');
 need(sameIdentity(files.get('project-manifest.json'),project.manifest)
  &&sameIdentity(files.get('project-analysis.json'),project.analysisFile),'The selected original project file identities disagree.');
 let projectBytes=0;
 for(const row of source.files)if(row.name!=='project-manifest.json'){
  projectBytes+=row.bytes;need(Number.isSafeInteger(projectBytes)&&projectBytes<=2*1024**3,
   'Keep the original complete project within its 2 GiB handover contract.');
 }
 need(Array.isArray(project.entries)&&project.entries.length===config.entries.length
  &&project.entries.length<=MAX_PROJECT_ENTRIES,'Retain every selected project entry.');
 const byId=new Map(project.entries.map(entry=>[entry?.id,entry]));
 need(byId.size===project.entries.length,'Keep each selected project entry once.');
 for(const selected of config.entries){
  const entry=byId.get(selected.id);
  need(object(entry)&&entry.title===selected.title&&same(entry.selection,selected.selection)
   &&same(entry.before??null,selected.before)&&same(entry.after??null,selected.after),
   'The retained source selection differs for project entry '+selected.id+'.');
  need(selected.current==='originals/'+selected.id+'/current'
   &&(selected.previous===null||selected.previous==='originals/'+selected.id+'/previous'),
   'Retain the original portable edition paths for '+selected.id+'.');
  need(Boolean(entry.previous)===Boolean(selected.previous),'The prior edition selection changed for '+selected.id+'.');
  for(const name of ['report.html','observations.csv','selected-period.json'])
   need(files.has('entries/'+selected.id+'/'+name),'Retain the complete original output '+selected.id+'/'+name+'.');
  for(const role of ['current','previous']){
   if(role==='previous'&&!entry.previous)continue;
   sourceEdition(entry[role],selected.id+' '+role);
   const base='originals/'+selected.id+'/'+role+'/';
   for(const name of ['response.json','descriptor.json','manifest.json'])
    need(files.has(base+name),'Retain the full original source member '+base+name+'.');
   need(files.get(base+'response.json').sha256===entry[role].source.source_sha256,
    'The original response differs from the selected '+role+' edition for '+selected.id+'.');
  }
  const stats=entry.summary;
  integerFields(stats,['selected_cells','observed_dates','source_issues','incomplete_comparison_series',
   'changed_cells','metadata_changes'],'entry '+selected.id+' summary');
  integerFields(stats.cell_states,['known','null','absent','unsupported_value'],'entry '+selected.id+' cell states');
  for(const key of ['expected_monthly_dates','missing_monthly_dates'])
   need(stats[key]===null||count(stats[key]),'Retain original inferred or undeclared coverage for '+selected.id+'.');
  need(stats.has_previous===Boolean(entry.previous)&&stats.has_period_comparison===Boolean(selected.before)
   &&typeof stats.empty==='boolean','The original entry summary selections changed.');
 }
 const summary=project.summary;
 integerFields(summary,['entries','unassigned_port_entries','distinct_source_editions','retained_cells','selected_cells',
  'unknown_cells','empty_entries','missing_monthly_labels','expected_monthly_coverage_not_inferred_entries',
  'frequency_undeclared_entries','partial_month_selection_entries','source_issues','incomplete_comparison_series',
  'changed_cells','metadata_changes'],'project summary');
 need(summary.entries===config.entries.length&&summary.retained_cells<=MAX_PROJECT_CELLS
  &&Array.isArray(summary.identified_ports)&&summary.identified_ports.every(text)
  &&Array.isArray(summary.source_roles)&&summary.source_roles.every(text)
  &&summary.cross_measure_total===null&&text(summary.cell_count_basis),
  'Retain the original project summary and separate measure populations.');
 return source;
}

export function econdbSourceSelection(source,reportIdentity){
 validateEcondbInstallationSource(source);need(!reportIdentity?.name||reportIdentity.name==='ECONDB_CUSTOMER_SOURCE.json','Retain the canonical customer source report name.');exact({...reportIdentity,name:'ECONDB_CUSTOMER_SOURCE.json'},'complete customer source report',{positive:true});
 const project=source.project;
 return {schema:ECONDB_INSTALLATION_SCHEMA+'.selection',workspace:clone(source.workspace),
  archive:clone(source.archive),transferManifest:clone(source.transferManifest),
  sourceReport:{name:'ECONDB_CUSTOMER_SOURCE.json',bytes:reportIdentity.bytes,sha256:reportIdentity.sha256},
  project:{record:clone(project.record),manifest:clone(project.manifest),analysisFile:clone(project.analysisFile),
   inputSha256:project.inputSha256,config:clone(project.config),summary:clone(project.summary),entries:clone(project.entries)},
  files:clone(source.files),observedAt:source.observedAt};
}

const md=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
 .replace(/\|/g,'\\|').replace(/\r?\n/g,' ');
const shown=value=>value===null||value===undefined?'Unassigned / undeclared':String(value);
const table=(headers,rows)=>'| '+headers.map(md).join(' | ')+' |\n| '+headers.map(()=> '---').join(' | ')+' |\n'+
 rows.map(row=>'| '+row.map(md).join(' | ')+' |').join('\n')+'\n';
function reportMarkdown(source,prepared){
 const p=source.project,s=p.summary;
 let result='# '+md(p.config.title)+' — customer delivery\n\n'+
  'Original commercial Workshare: '+md(prepared.workshareCaseId)+'. Selected Econdb project: '+md(p.config.id)+'.\n\n'+
  'Open delivery/files/report.html for the complete maritime report and entry detail. All selected observations are in delivery/files/observations.csv; exact decimal strings and source states remain in delivery/files/project-analysis.json. The complete workspace ZIP preserves every original source, saved request, result, project and history entry.\n\n'+
  '## Project overview\n\n'+table(['Original count','Value'],[
   ['Project entries',s.entries],['Identified ports',s.identified_ports.join(', ')||'None assigned'],
   ['Unassigned-port entries',s.unassigned_port_entries],['Source roles',s.source_roles.join(', ')],
   ['Retained source cells',s.retained_cells],['Selected source cells',s.selected_cells],
   ['Unknown source cells',s.unknown_cells],['Empty entry selections',s.empty_entries],
   ['Missing monthly labels',s.missing_monthly_labels],
   ['Entries with expected monthly coverage not inferred',s.expected_monthly_coverage_not_inferred_entries],
   ['Entries with undeclared frequency',s.frequency_undeclared_entries],
   ['Partial-month selections',s.partial_month_selection_entries],
   ['Source structure or coverage issues',s.source_issues],
   ['Incomplete period-comparison series',s.incomplete_comparison_series],
   ['Changed source cells',s.changed_cells],['Metadata or coverage changes',s.metadata_changes]])+
  '\n'+md(s.cell_count_basis)+' Values for different measures, populations and source roles remain in their respective reports.\n\n';
 for(const entry of p.entries){
  const current=entry.current,r=current.request,stats=entry.summary;
  result+='## '+md(entry.title)+'\n\n'+table(['Selected source field','Original value'],[
   ['Entry',entry.id],['Port',shown(r.locode)],['Measure',r.measure],['Population',r.population],
   ['Endpoint',r.kind],['Request query',JSON.stringify(r.query??{})],['Frequency',shown(r.frequency)],
   ['Source role',current.source.source_role],['Source edition',current.id],
   ['Captured',current.source.captured_at],['Original source URL',shown(current.source.original_url)],
   ['Current response SHA-256',current.source.source_sha256],
   ['Selected dates',entry.selection.from+' ≤ original Date < '+entry.selection.until],
   ['Previous edition',entry.previous?entry.previous.id:'None selected'],
   ['Before period',entry.before?entry.before.from+' ≤ original Date < '+entry.before.until:'None selected'],
   ['After period',entry.after?entry.after.from+' ≤ original Date < '+entry.after.until:'None selected']])+
   '\n'+table(['Known cells','Null cells','Absent cells','Unsupported source values','Selected cells'],
    [[stats.cell_states.known,stats.cell_states.null,stats.cell_states.absent,stats.cell_states.unsupported_value,stats.selected_cells]])+
   '\n'+table(['Original coverage / comparison field','Value'],[
    ['Observed source dates',stats.observed_dates],['Expected monthly dates',stats.expected_monthly_dates===null?'Not inferred':stats.expected_monthly_dates],
    ['Missing monthly labels',stats.missing_monthly_dates===null?'Not inferred':stats.missing_monthly_dates],
    ['Source issues',stats.source_issues],['Incomplete comparison series',stats.incomplete_comparison_series],
    ['Changed selected cells',stats.has_previous?stats.changed_cells:'No prior edition selected'],
    ['Metadata or coverage changes',stats.has_previous?stats.metadata_changes:'No prior edition selected']])+
   '\nOpen delivery/files/entries/'+entry.id+'/report.html and delivery/files/originals/'+entry.id+'/current/ for this entry\'s complete source and detailed results.\n\n';
 }
 result+='## Source and receiving identity\n\n'+table(['Original identity','Value'],[
  ['Workspace',source.workspace.id],['Workspace revision',source.workspace.revision],
  ['Complete workspace files',source.workspace.files],['Complete workspace bytes',source.workspace.totalBytes],
  ['Workspace ZIP SHA-256',source.archive.sha256],['Transfer manifest SHA-256',source.transferManifest.sha256],
  ['Project record',p.record.id],['Project record revision',p.record.revision],
  ['Original request SHA-256',p.record.requestSha256],['Project input SHA-256',p.inputSha256],
  ['Project manifest SHA-256',p.manifest.sha256],['Complete analysis SHA-256',p.analysisFile.sha256],
  ['Inspection time',source.observedAt]])+
  '\nThe project manifest, complete analysis, browser workspace, current and selected prior responses, descriptors, native source modules and reopening instructions accompany the delivery. The original raw decimal values, missing states, request parameters and half-open date windows remain source-owned.\n\n'+
  '## Complete customer handover\n\n'+
  'Use installation-input.json in Customer installations to preview and save this preparation against its original Workshare and operating case. Retain the full case export together with source/econdb-workspace.zip, source/operator-transfer.json, ECONDB_CUSTOMER_SOURCE.json, ECONDB_SOURCE_SELECTION.json and every delivery/files member. The independent receiver opens the complete case, receives the original Econdb workspace in a separate directory and reopens the selected project and its outputs.\n\n'+
  'Later source captures and analyses keep their original Econdb request identities and revisions. Customer changes use the current Installation and its existing editor. The original Workshare carries fees, phase effort, payment stages and support terms; the original customer case carries source-use authority, deployment selections and actual acceptance.\n';
 return result;
}

export function composeEcondbInstallation(seed,profile,bindings,source,commissioning,{attachments=[]}={}){
 validateEcondbInstallationSource(source);
 need(profile?.id===ECONDB_INSTALLATION_PROFILE&&bindings?.profile===profile.id,'Select the complete maintained Econdb customer profile.');
 fileList(attachments,'additional working',{empty:true});
 const chosen=clone(bindings);chosen.source??={};chosen.receiving??={};
 const p=source.project;
 if(!chosen.source.reference)chosen.source.reference='Econdb workspace '+source.workspace.id+' revision '+source.workspace.revision+
  '; project '+p.config.id+'; original record '+p.record.id+' revision '+p.record.revision+
  '; project input SHA-256 '+p.inputSha256+'; project manifest SHA-256 '+p.manifest.sha256+
  '; whole workspace ZIP SHA-256 '+source.archive.sha256+'.';
 if(!chosen.receiving.application)chosen.receiving.application=profile.receiving.application+
  ' Complete workspace: source/econdb-workspace.zip. Original selected project files: delivery/files/.';
 const prepared=prepareInstallation(seed,profile,chosen);
 need(text(bindings.workshareCaseId)&&prepared.document.workshare?.caseId===bindings.workshareCaseId,
  'Receive the complete original commercial Workshare seed.');
 const commercial=commercialWorkshare({seed,commissioning,profile});
 need(commercial.caseId===prepared.workshareCaseId,'Keep this project with its original commercial Workshare.');
 need(Buffer.byteLength(JSON.stringify(prepared.document))<=128*1024,'The complete native Installation document exceeds its original 128 KiB limit.');
 const annex={...clone(source),installationSelection:clone(prepared.source),workshareCaseId:prepared.workshareCaseId,
  originalInputs:{seed:'source/seed.json',bindings:'source/bindings.json',profile:'source/profile.json',commissioning:'source/commissioning.json'},
  attachments:clone(attachments)};
 return {prepared,derivedBindings:chosen,source:annex,sourceMarkdown:reportMarkdown(source,prepared),
  workorder:renderWorkorder(prepared),commercial,commercialMarkdown:commercialMarkdown(commercial),
  commercialHtml:commercialHtml(commercial)};
}
