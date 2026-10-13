import {readSnapshot,reportHTML} from './maritime-analysis.mjs';
import {validateProject,analyzeProject,projectRowsCSV,projectHTML} from './maritime-project-analysis.mjs';

export const WORKSPACE_SCHEMA='econdb.project-workspace.v1';
const need=(condition,message)=>{if(!condition)throw new Error(message)};
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const object=(value,label)=>{need(value&&typeof value==='object'&&!Array.isArray(value),label+' must be an object');return value};
const allowed=(value,fields,label)=>{for(const key of Object.keys(value))need(fields.includes(key),label+': unsupported field '+key)};
const clone=value=>JSON.parse(JSON.stringify(value));
function checkBinding(binding){
 object(binding,'Analysis binding');allowed(binding,['analysis_sha256','project_sha256'],'Analysis binding');
 for(const key of ['analysis_sha256','project_sha256'])need(typeof binding[key]==='string'&&/^[a-f0-9]{64}$/.test(binding[key]),'Use the complete actual '+key);
 return {analysis_sha256:binding.analysis_sha256,project_sha256:binding.project_sha256};
}
function sourcePair(value,label){
 object(value,label);allowed(value,['raw','descriptor'],''+label);
 need(typeof value.raw==='string',label+' requires its complete original response text');
 object(value.descriptor,label+' source descriptor');
 return {raw:value.raw,descriptor:clone(value.descriptor),edition:readSnapshot(value.raw,value.descriptor)};
}
export function analyzeWorkspaceEntries(project,entries,binding){
 checkBinding(binding);object(project,'Project');allowed(project,['id','title'],'Project');
 need(Array.isArray(entries)&&entries.length>0&&entries.length<=48,'Choose between 1 and 48 complete project entries');
 const records=entries.map((entry,index)=>{
  object(entry,'Entry '+(index+1));
  allowed(entry,['id','title','current','previous','selection','before','after'],'Entry '+(index+1));
  return {id:entry.id,title:entry.title,current:entry.id+'/current',previous:entry.previous==null?null:entry.id+'/previous',selection:clone(entry.selection),before:entry.before==null?null:clone(entry.before),after:entry.after==null?null:clone(entry.after)};
 });
 const config=validateProject({schema:'econdb.maritime-project.v1',id:project.id,title:project.title,entries:records});
 const pairs=new Map();let retainedCells=0;
 for(let i=0;i<entries.length;i++){
  const entry=entries[i],current=sourcePair(entry.current,'Current source for entry '+(i+1));
  retainedCells+=current.edition.rows.length;
  need(retainedCells<=500000,'Project exceeds 500,000 current and previous source cells; receive smaller complete projects');
  const previous=entry.previous==null?null:sourcePair(entry.previous,'Previous source for entry '+(i+1));
  retainedCells+=previous?.edition.rows.length??0;
  need(retainedCells<=500000,'Project exceeds 500,000 current and previous source cells; receive smaller complete projects');
  pairs.set(entry.id,{current,previous});
 }
 const editions=new Map([...pairs].map(([id,pair])=>[id,{current:pair.current.edition,previous:pair.previous?.edition??null}]));
 return {config,pairs,editions,analysis:analyzeProject(config,editions)};
}
export function saveProjectWorkspace(project,entries,binding){
 const checked=analyzeWorkspaceEntries(project,entries,binding),sources=[],sourceIds=new Map();
 function retain(pair){
  if(!pair)return null;
  const descriptor=clone(pair.descriptor),key=JSON.stringify([descriptor,pair.raw]);
  if(sourceIds.has(key))return sourceIds.get(key);
  const id='source-'+(sources.length+1);sourceIds.set(key,id);sources.push({id,raw:pair.raw,descriptor});return id;
 }
 const records=checked.config.entries.map(entry=>{
  const pair=checked.pairs.get(entry.id);
  return {id:entry.id,title:entry.title,current:retain(pair.current),previous:retain(pair.previous),selection:entry.selection,before:entry.before,after:entry.after};
 });
 return {schema:WORKSPACE_SCHEMA,engine:checkBinding(binding),project:{id:checked.config.id,title:checked.config.title},sources,entries:records};
}
export function receiveProjectWorkspace(saved,binding){
 object(saved,'Saved project');allowed(saved,['schema','engine','project','sources','entries'],'Saved project');
 need(saved.schema===WORKSPACE_SCHEMA,'Unsupported project workspace schema');
 const expected=checkBinding(binding),actual=checkBinding(saved.engine);
 need(actual.analysis_sha256===expected.analysis_sha256&&actual.project_sha256===expected.project_sha256,'This project belongs to another analysis version. Reopen its accompanying workbench or receive its original source pairs for an explicit new project.');
 need(Array.isArray(saved.sources)&&saved.sources.length>0&&saved.sources.length<=96,'Saved project must contain 1 to 96 complete source pairs');
 need(Array.isArray(saved.entries)&&saved.entries.length>0&&saved.entries.length<=48,'Saved project must contain 1 to 48 entries');
 const sources=new Map(),used=new Set();
 for(const source of saved.sources){
  object(source,'Saved source');allowed(source,['id','raw','descriptor'],'Saved source');
  need(typeof source.id==='string'&&/^source-[1-9][0-9]{0,2}$/.test(source.id)&&!sources.has(source.id),'Invalid or repeated saved source ID');
  need(typeof source.raw==='string','Saved source must include its complete original text');object(source.descriptor,'Saved source descriptor');
  sources.set(source.id,{raw:source.raw,descriptor:source.descriptor});
 }
 function resolve(id,optional=false){
  if(optional&&id===null)return null;
  need(typeof id==='string'&&sources.has(id),'Missing complete source pair '+String(id));
  used.add(id);return sources.get(id);
 }
 const entries=saved.entries.map((entry,index)=>{
  object(entry,'Saved entry '+(index+1));allowed(entry,['id','title','current','previous','selection','before','after'],'Saved entry '+(index+1));
  need(own(entry,'previous'),'Saved entry must explicitly identify its previous source or null');
  return {id:entry.id,title:entry.title,current:resolve(entry.current),previous:resolve(entry.previous,true),selection:clone(entry.selection),before:entry.before==null?null:clone(entry.before),after:entry.after==null?null:clone(entry.after)};
 });
 need(used.size===sources.size,'Saved project contains unreferenced source pairs; receive only its complete declared project');
 const checked=analyzeWorkspaceEntries(saved.project,entries,expected);
 return {project:clone(saved.project),entries,...checked};
}
export function browserProjectReport(checked,binding){
 checkBinding(binding);
 need(checked?.analysis?.schema==='econdb.maritime-project-analysis.v1'&&checked.pairs instanceof Map,'Use the current complete project analysis');
 let html=projectHTML(checked.analysis,{engine_sha256:binding.analysis_sha256,project_engine_sha256:binding.project_sha256});
 // Directory-relative downloads belong to the native report. This browser export is a complete standalone report.
 html=html.replace(/<nav aria-label="Project files">[\s\S]*?<\/nav>/,'<p>Standalone report. Save the complete project workspace from the workbench to retain every original response and reopen the calculation. The separate CSV includes every selected source cell.</p>');
 html=html.replace(/<nav aria-label="[^"]* files">[\s\S]*?<\/nav>/g,'');
 const detail=checked.analysis.entries.map(entry=>{
  const edition=checked.pairs.get(entry.id)?.current.edition;
  need(edition,'Missing current source for detailed report '+entry.id);
  const individual=reportHTML({edition,period:entry.period,comparison:entry.comparison,editionComparison:entry.revisions,engine_sha256:binding.analysis_sha256});
  const match=individual.match(/<body>([\s\S]*)<\/body>/);need(match,'Detailed report has no body');
  const body=match[1].replace('<h1>Maritime period review</h1>','');
  const title=String(entry.title).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return '<section id="detail:'+entry.id+'"><h2>'+title+' · complete detail</h2>'+body+'</section>';
 }).join('');
 return html.replace('</style>','pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;padding:12px}.meta{display:grid;grid-template-columns:180px minmax(0,1fr);gap:6px 16px}.meta dd{margin:0;overflow-wrap:anywhere}@media(max-width:600px){.meta{grid-template-columns:1fr}.meta dd{margin-bottom:8px}}@media print{table{table-layout:fixed}th,td{overflow-wrap:anywhere}}</style>').replace('</body>',detail+'</body>');
}
export {projectRowsCSV};
