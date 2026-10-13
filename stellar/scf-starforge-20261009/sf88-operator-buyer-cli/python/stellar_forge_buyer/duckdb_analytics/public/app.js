import {STATE_SCHEMA,MAX_STATE_BYTES,BrowserWorkspaces,validateSnapshot} from './workspaces.mjs';
const $=id=>document.getElementById(id);
const base='/api/analytics';
const state={identity:null,source:null,analysisSource:null,editions:[],nextEdition:null,analyses:[],workbooks:[],results:[],comparisons:[],reports:[],exports:[],operations:[],
 analysis:null,analysisExpected:0,analysisBaseline:null,workbookBaseline:null,review:null,reviewDefinition:null,result:null,resultKind:'results',resultOffset:0,
 workbook:null,workbookExpected:0,report:null,export:null,pending:{},busy:false,sourceValues:null,requestOffset:0,epoch:0,workbookEpoch:0,reads:{},receipts:{},browser:null,browserCatalog:[],draftStore:null,restoring:false,saveTimer:null,dirty:false,compareKeySource:null};
let capability=location.hash.slice(1);
try{if(capability)sessionStorage.setItem('stellar_duckdb_capability',capability);else capability=sessionStorage.getItem('stellar_duckdb_capability')||'';}catch{}
if(location.hash)history.replaceState(null,'',location.pathname);
$('original-link').href='/#'+capability;
const enc=value=>encodeURIComponent(String(value));
const json=value=>JSON.stringify(value,null,2);
const stable=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
const str=value=>value===null?'NULL':typeof value==='string'?value:JSON.stringify(value);
function node(tag,text,attrs={}){const value=document.createElement(tag);if(text!==undefined)value.textContent=String(text);for(const [key,item]of Object.entries(attrs)){if(key==='class')value.className=item;else if(key in value)value[key]=item;else value.setAttribute(key,item);}return value;}
function notice(message,error=false){$('notice').textContent=message;$('notice').hidden=!message;$('notice').classList.toggle('error',error);}
async function run(action){
 if(state.busy)return;
 const ids=['source-edition','analysis-select','analysis-revision','analysis-edition','workbook-select','workbook-revision','result-kind','result-select','browser-select','browser-revision','browser-file'];
 const controls=ids.map(id=>$(id)).filter(Boolean),disabled=controls.map(control=>control.disabled);
 state.busy=true;document.body.setAttribute('aria-busy','true');controls.forEach(control=>{control.disabled=true;});
 try{return await action();}catch(error){notice(error.message||String(error),true);throw error;}
 finally{controls.forEach((control,index)=>{control.disabled=disabled[index];});state.busy=false;document.body.removeAttribute('aria-busy');}
}
function on(id,event,action){$(id).addEventListener(event,e=>{if(event==='submit')e.preventDefault();run(()=>action(e)).catch(()=>{});});}
async function api(path,body,raw=false){
 if(!capability)throw Error('Open the original workspace private launch link.');
 const headers={'X-DuckDB-Capability':capability};if(state.identity)headers['X-DuckDB-Workspace-ID']=state.identity.workspace_id;
 if(body!==undefined)headers['Content-Type']='application/json';
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit'});
 if(!response.ok){let record;try{record=await response.json();}catch{}throw Object.assign(Error(record?.detail||record?.error||'Workspace response '+response.status),{status:response.status,code:record?.error});}
 return raw?response:response.json();
}
function show(name){for(const item of document.querySelectorAll('.screen'))item.hidden=item.id!=='screen-'+name;for(const item of document.querySelectorAll('[data-screen]'))item.setAttribute('aria-current',item.dataset.screen===name?'page':'false');try{sessionStorage.setItem('stellar_duckdb_analytics_screen',name);}catch{}}
document.querySelectorAll('[data-screen]').forEach(item=>item.addEventListener('click',()=>show(item.dataset.screen)));
function facts(target,rows){target.replaceChildren();for(const [label,value]of rows){if(value===undefined)continue;target.append(node('dt',label),node('dd',str(value)));}}
function grid(target,columns,rows){target.replaceChildren();const wrap=node('div',undefined,{class:'grid'}),table=node('table'),head=node('thead'),hr=node('tr'),body=node('tbody');for(const column of columns){const th=node('th',column.name);if(column.type)th.append(node('br'),node('small',column.type));hr.append(th);}head.append(hr);for(const row of rows){const tr=node('tr');for(const value of row)tr.append(node('td',str(value),{class:value===null?'null':''}));body.append(tr);}table.append(head,body);wrap.append(table);target.append(wrap);}
function select(element,rows,{empty='Choose…',value=x=>x.id,text=x=>x.title||x.name||x.id,keep=true}={}){const previous=keep?element.value:'';element.replaceChildren(node('option',empty,{value:''}));for(const row of rows)element.append(node('option',text(row),{value:value(row)}));if([...element.options].some(item=>item.value===previous))element.value=previous;}
function optionColumn(element,{empty='Choose field…'}={}){select(element,(state.analysisSource||state.source)?.columns||[],{empty,value:x=>x.name,text:x=>x.name+' · '+x.type});}
function field(label,control){const item=node('div');item.append(node('label',label),control);return item;}
function input(value='',type='text'){return node('input',undefined,{type,value});}
function choices(values,current){const control=node('select');for(const [value,label]of values.map(v=>Array.isArray(v)?v:[v,v]))control.append(node('option',label,{value}));if(current!==undefined)control.value=current;return control;}
function uuid(){return crypto.randomUUID().replaceAll('-','');}
function pendingKey(){return 'stellar_duckdb_analytics_pending:'+state.identity.workspace_id;}
async function retainPending(){for(const request of Object.values(state.pending))await state.draftStore.rememberRequest(request);}
async function finishRequest(request,result){
 state.receipts[request.request_id]={...request,state:'COMPLETE',result};
 delete state.pending[request.request_id];
 try{await state.draftStore.completeRequest(request,result);}catch(error){notice('The original operation completed. Its native receipt remains available; browser retention: '+error.message,true);}
 scheduleSnapshot();return result;
}
async function mutate(action,body,{exported=false}={}){
 const original={...structuredClone(body),...(exported?{}:{workspace_id:state.identity.workspace_id})};
 const route=exported?base+'/exports':base+'/'+action;
 const existing=Object.values(state.pending).find(item=>item.route===route&&stable(item.original)===stable(original));
 const request=existing||{request_id:uuid(),route,original,created_at:new Date().toISOString(),exported};
 state.pending[request.request_id]=request;
 await state.draftStore.rememberRequest(request);
 let result;
 try{result=await api(route,{...original,request_id:request.request_id});}
 catch(error){try{await state.draftStore.failedRequest(request,error);}catch{}scheduleSnapshot();throw error;}
 return finishRequest(request,result);
}
async function pages(kind){const output=[];let offset=0;while(offset!==null){const result=await api(base+'/'+kind+'?offset='+offset+'&limit=100');output.push(...result[kind]);offset=result.next_offset;}return output;}
function labelRecord(record){const identity=record.result_id||record.comparison_id||record.report_id||record.id;return (record.title||record.name||record.kind||'Report')+(record.revision?' · r'+record.revision:'')+(record.row_count!==undefined?' · '+record.row_count+' groups':'')+' · '+identity.slice(0,10);}
function fillCatalogs(){
 select($('analysis-select'),state.analyses,{text:labelRecord});select($('workbook-select'),state.workbooks,{text:labelRecord});
 select($('report-select'),state.reports,{value:x=>x.report_id,text:labelRecord});
 for(const id of ['compare-before','compare-after'])select($(id),state.results,{value:x=>x.result_id,text:labelRecord});
 fillResults();select($('export-select'),state.exports,{value:x=>x.export_id,text:x=>(x.created_at||'Export')+' · '+x.report_id.slice(0,10)});
 for(const item of document.querySelectorAll('.page-source'))fillPageSources(item);
}
function fillResults(){const kind=$('result-kind').value;select($('result-select'),state[kind],{value:x=>x.result_id||x.comparison_id,text:labelRecord});}
function fillEditions(){
 const rows=state.editions;
 for(const name of ['source-edition','analysis-edition'])select($(name),rows,{value:x=>x.edition_id,text:x=>'Edition '+x.sequence+' · '+x.row_count+' rows · '+x.edition_id.slice(0,16)});
}
async function refresh({initial=false}={}){
 const generation=nextRead('refresh'),identity=await api('/api/identity');
 if(state.identity&&state.identity.workspace_id!==identity.workspace_id)throw Error('The original workspace identity changed. Reopen its launch link.');
 if(!state.identity){
  state.identity=identity;state.draftStore=new BrowserWorkspaces(identity.workspace_id);
  state.browser={id:uuid(),revision:0,title:'Working analysis'};
  await state.draftStore.ready;
  let legacy={};try{legacy=JSON.parse(localStorage.getItem(pendingKey())||'{}');}catch{}
  for(const request of Object.values(legacy))await state.draftStore.rememberRequest(request);
  for(const record of await state.draftStore.originalRequests()){
   if(record.state==='COMPLETE')state.receipts[record.request.request_id]={...record.request,state:'COMPLETE',result:record.result};
   else state.pending[record.request.request_id]=record.request;
  }
 }
 const [counts,editions,analyses,workbooks,results,comparisons,reports,exports,operations,browsers]=await Promise.all([
  api(base+'/status'),api('/api/editions?limit=100'),pages('analyses'),pages('workbooks'),pages('results'),pages('comparisons'),pages('reports'),
  api('/api/catalog/exports?offset=0&limit=100'),api('/api/catalog/operations?offset=0&limit=100'),browserCatalog()]);
 if(!currentRead('refresh',generation))return counts;
 const map=new Map(state.editions.map(item=>[item.edition_id,item]));for(const item of editions.editions)map.set(item.edition_id,item);
 let exportRows=[...exports.exports],next=exports.next_offset;
 while(next!==null){const result=await api('/api/catalog/exports?offset='+next+'&limit=100');exportRows.push(...result.exports);next=result.next_offset;}
 let operationRows=[...operations.operations];next=operations.next_offset;
 while(next!==null){const result=await api('/api/catalog/operations?offset='+next+'&limit=100');operationRows.push(...result.operations);next=result.next_offset;}
 if(!currentRead('refresh',generation))return counts;
 Object.assign(state,{editions:[...map.values()].sort((a,b)=>b.sequence-a.sequence),nextEdition:editions.next_before,analyses,workbooks,results,comparisons,reports,browserCatalog:browsers,
  exports:exportRows.filter(item=>item.schema==='stellar-forge.duckdb-analytics.v1.export'),operations:operationRows.filter(item=>item.route===base+'/exports')});
 $('identity').textContent=identity.directory+'\n'+identity.workspace_id;
 $('counts').textContent=counts.analyses+' analyses · '+counts.results+' results · '+counts.workbooks+' workbooks · '+counts.reports+' reports';
 fillEditions();fillCatalogs();fillBrowserCatalog();$('more-editions').disabled=!state.nextEdition;
 if(initial&&state.editions.length){$('source-edition').value=state.editions[0].edition_id;await openSource(state.editions[0].edition_id);}
 await renderRequests();return counts;
}
async function openSource(id,{analysis=false}={}){
 if(!id)throw Error('Choose a source edition.');
 const generation=nextRead(analysis?'analysisSource':'source'),source=await api(base+'/sources/'+enc(id));
 if(!currentRead(analysis?'analysisSource':'source',generation))return null;
 if(analysis)state.analysisSource=source;
 state.source=source;
 if(!state.editions.some(item=>item.edition_id===id)){state.editions.push(source.edition);fillEditions();}
 $('source-edition').value=id;
 facts($('source-facts'),[['Edition',source.edition.edition_id],['Sequence',source.edition.sequence],['Original rows',source.edition.row_count],['Manifest',source.edition.manifest_sha256]]);
 const container=$('source-fields');container.replaceChildren();const table=node('table'),thead=node('thead'),tr=node('tr');
 for(const title of ['Original field','Native type','NULL rows','Distinct values',''])tr.append(node('th',title));thead.append(tr);const body=node('tbody');
 for(const column of source.columns){
  const row=node('tr');row.append(node('td',column.name),node('td',column.type),node('td',column.null_rows),node('td',column.distinct_non_null));
  const cell=node('td'),button=node('button','Review values');
  button.addEventListener('click',()=>run(()=>values(column.name,0,id)).catch(()=>{}));cell.append(button);row.append(cell);body.append(row);
 }
 table.append(thead,body);container.append(node('div',undefined,{class:'grid'}));container.firstChild.append(table);
 $('source-meanings').textContent=json(source.source_meanings);$('source-values').hidden=true;state.sourceValues=null;
 if(analysis){$('analysis-edition').value=id;optionColumn($('pivot-column'),{empty:'No pivot'});}
 scheduleSnapshot();return source;
}
async function values(column,offset,edition=state.source?.edition.edition_id){
 if(!edition||edition!==state.source?.edition.edition_id)throw Error('Open the selected original source first.');
 const generation=nextRead('sourceValues'),result=await api(base+'/sources/'+edition+'?column='+enc(column)+'&offset='+offset+'&limit=50');
 if(!currentRead('sourceValues',generation)||edition!==state.source?.edition.edition_id)return;
 state.sourceValues=result;$('source-values').hidden=false;$('values-title').textContent=column+' · '+result.type;
 grid($('values-grid'),[{name:'Original value',type:result.type},{name:'Rows',type:'BIGINT'}],result.values.map(item=>[item.value,item.rows]));
 pager($('values-pager'),result,()=>values(column,Math.max(0,offset-50),edition),()=>values(column,result.next_offset,edition));scheduleSnapshot();
}
function pager(target,record,previous,next){target.replaceChildren();const left=node('button','Previous',{disabled:record.offset===0}),right=node('button','Next',{disabled:record.next_offset===null});left.addEventListener('click',()=>run(previous).catch(()=>{}));right.addEventListener('click',()=>run(next).catch(()=>{}));target.append(left,node('span',record.total===0?'No rows':(record.offset+1)+'–'+Math.min(record.offset+record.limit,record.total)+' of '+record.total),right);}
function invalidate(){state.epoch++;state.review=null;state.reviewDefinition=null;$('save-analysis').disabled=true;$('analysis-review').hidden=true;$('run-analysis').disabled=true;scheduleSnapshot();}
function editorRow(container,title){const row=node('div',undefined,{class:'editor-row'}),header=node('header'),remove=node('button','Remove',{type:'button'});header.append(node('strong',title),remove);remove.addEventListener('click',()=>run(async()=>{row.inert=true;try{await checkpoint('Before removing an analysis field');row.remove();invalidate();}finally{row.inert=false;}}).catch(()=>{}));row.append(header);container.append(row);return row;}
function dimension(value={}){const row=editorRow($('dimensions'),'Dimension'),line=node('div',undefined,{class:'row'}),column=choices([]),name=input(value.name||''),grain=choices([['identity','Original value'],'day','week','month','quarter','year'],value.transform||'identity');optionColumn(column);column.value=value.column||'';column.className='dim-column';name.className='dim-name';grain.className='dim-grain';column.addEventListener('change',()=>{if(!name.value)name.value=column.value;});line.append(field('Source column',column),field('Output name',name),field('Calendar grouping',grain));row.append(line);}
function measure(value={}){const row=editorRow($('measures'),'Measure'),line=node('div',undefined,{class:'row'}),aggregate=choices([['count_rows','Count source rows'],['count','Count non-null values'],['count_distinct','Count distinct non-null values'],'sum','avg','min','max'],value.aggregate||'count_rows'),column=choices([]),name=input(value.name||'Rows'),nulls=choices([['exclude','Exclude NULL'],['zero','Use zero for NULL (SUM/AVG)']],value.nulls||'exclude');optionColumn(column);column.value=value.column||'';aggregate.className='measure-aggregate';column.className='measure-column';name.className='measure-name';nulls.className='measure-nulls';const update=()=>{column.disabled=aggregate.value==='count_rows';nulls.disabled=!['sum','avg'].includes(aggregate.value);if(nulls.disabled)nulls.value='exclude';};aggregate.addEventListener('change',update);update();line.append(field('Aggregate',aggregate),field('Source column',column),field('Output name',name),field('NULL rule',nulls));const note=input(value.note||'');note.className='measure-note';row.append(line,field('Interpretation or unit note',note));}
function filter(value={}){const row=editorRow($('filters'),'Filter'),line=node('div',undefined,{class:'row'}),column=choices([]),operator=choices(['eq','ne','lt','lte','gt','gte','in','not_in','between','is_null','not_null'],value.operator||'eq'),entry=input(value.values!==undefined?JSON.stringify(value.values):typedInput(value.value,value.column)),nulls=choices([['exclude','Exclude NULL'],['include','Include NULL']],value.nulls||'exclude');optionColumn(column);column.value=value.column||'';column.className='filter-column';operator.className='filter-operator';entry.className='filter-value';nulls.className='filter-nulls';const update=()=>{entry.disabled=['is_null','not_null'].includes(operator.value);};operator.addEventListener('change',update);update();line.append(field('Source column',column),field('Rule',operator),field('Typed value / JSON list',entry),field('NULL handling',nulls));row.append(line);}
function typedInput(value,column){if(value===undefined)return '';return state.analysisSource?.columns.find(item=>item.name===column)?.type==='JSON'?JSON.stringify(value):typeof value==='string'?value:JSON.stringify(value);}
function typed(value,column){const original=state.analysisSource?.columns.find(item=>item.name===column);if(!original)throw Error('Select the original source column.');if(original.type==='BOOLEAN'){if(value==='true')return true;if(value==='false')return false;throw Error('Boolean filter values are true or false.');}if(original.type==='JSON'){return JSON.parse(value);}return value;}
function pivotValue(value={}){const row=editorRow($('pivot-values'),'Selected pivot value'),line=node('div',undefined,{class:'row'}),entry=input(typedInput(value.value,$('pivot-column').value)),label=input(value.label||'');entry.className='pivot-value';label.className='pivot-label';line.append(field('Original typed value',entry),field('Column label',label));row.append(line);}
function definition(){
 if(!state.analysisSource||state.analysisSource.edition.edition_id!==$('analysis-edition').value)throw Error('Open and review the selected original source edition first.');
 const value={name:$('analysis-name').value,title:$('analysis-title').value,edition_id:$('analysis-edition').value,description:$('analysis-description').value,
 dimensions:[...$('dimensions').children].map(row=>({column:row.querySelector('.dim-column').value,name:row.querySelector('.dim-name').value,transform:row.querySelector('.dim-grain').value})),
 measures:[...$('measures').children].map(row=>{const aggregate=row.querySelector('.measure-aggregate').value;return {aggregate,name:row.querySelector('.measure-name').value,...(aggregate==='count_rows'?{}:{column:row.querySelector('.measure-column').value}),nulls:row.querySelector('.measure-nulls').value,note:row.querySelector('.measure-note').value};}),
 filters:[...$('filters').children].map(row=>{const column=row.querySelector('.filter-column').value,operator=row.querySelector('.filter-operator').value,raw=row.querySelector('.filter-value').value;return {column,operator,nulls:row.querySelector('.filter-nulls').value,...(['is_null','not_null'].includes(operator)?{}:['in','not_in','between'].includes(operator)?{values:JSON.parse(raw)}:{value:typed(raw,column)})};}),order:JSON.parse($('analysis-order').value||'[]')};
 if($('pivot-column').value)value.pivot={column:$('pivot-column').value,values:[...$('pivot-values').children].map(row=>({value:typed(row.querySelector('.pivot-value').value,$('pivot-column').value),label:row.querySelector('.pivot-label').value})),include_null:$('pivot-null').checked,include_other:$('pivot-other').checked,null_label:$('pivot-null-label').value,other_label:$('pivot-other-label').value};
 return value;
}
async function setDefinition(value){
 state.analysisBaseline=null;
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.edition_id!=='string'||!Array.isArray(value.dimensions)||!Array.isArray(value.measures))throw Error('Apply a complete definition object with its original edition, dimensions and measures.');
 if(!state.analysisSource||state.analysisSource.edition.edition_id!==value.edition_id)await openSource(value.edition_id,{analysis:true});
 $('analysis-name').value=value.name??'';$('analysis-title').value=value.title??'';$('analysis-edition').value=value.edition_id;$('analysis-description').value=value.description||'';
 for(const id of ['dimensions','measures','filters','pivot-values'])$(id).replaceChildren();
 value.dimensions.forEach(dimension);value.measures.forEach(measure);(value.filters||[]).forEach(filter);
 $('analysis-order').value=json(value.order||[]);$('pivot-column').value=value.pivot?.column||'';(value.pivot?.values||[]).forEach(pivotValue);
 $('pivot-null').checked=value.pivot?.include_null||false;$('pivot-other').checked=value.pivot?.include_other||false;
 $('pivot-null-label').value=value.pivot?.null_label||'Null';$('pivot-other-label').value=value.pivot?.other_label||'Other';$('analysis-json').value=json(value);invalidate();
}
async function openAnalysis(){
 const id=$('analysis-select').value,revision=$('analysis-revision').value;if(!id)throw Error('Choose a saved analysis.');
 await transition('Before opening another analysis',async()=>{
  const current=await api(base+'/analyses/'+id),selected=revision?await api(base+'/analyses/'+id+'?revision='+enc(revision)):current;
  await setDefinition(selected.definition);state.analysis=selected;state.analysisExpected=current.revision;state.analysisBaseline={id:selected.id,revision:selected.revision,definition:structuredClone(definition())};
  $('analysis-state').textContent='Opened revision '+selected.revision+' · saving creates a revision after current '+current.revision+'.';
  $('run-analysis').disabled=false;notice('Opened exact saved analysis revision '+selected.revision+'.');
 });
}
async function reviewAnalysis(){const value=definition(),epoch=state.epoch,result=await api(base+'/review',{definition:value});if(epoch!==state.epoch||stable(definition())!==stable(value))throw Error('The definition changed during native review. Review the current fields.');state.review=result;state.reviewDefinition=value;$('save-analysis').disabled=false;$('analysis-review').hidden=false;facts($('review-facts'),[['Original rows',result.source_row_count],['Rows after filters',result.filtered_row_count],['Native output fields',result.columns.length],['Preview',result.preview.truncated?'First 100 result rows':'All preview rows; complete execution is retained when run'],['Review',result.review_sha256]]);grid($('review-grid'),result.columns,result.preview.rows);$('review-json').textContent=json(result);notice('Native types, source meanings, filter rules and parameters reviewed.');}
async function saveAnalysis(){
 if(!state.review||stable(definition())!==stable(state.reviewDefinition))throw Error('Review the current definition before saving.');
 const epoch=state.epoch,submitted=structuredClone(state.reviewDefinition),reviewSha=state.review.review_sha256,expected=state.analysisExpected;
 await checkpoint('Submitted analysis revision');
 const saved=await mutate('analyses',{definition:submitted,expected_revision:expected,review_sha256:reviewSha});
 state.analysis=saved;state.analysisExpected=saved.revision;state.analysisBaseline={id:saved.id,revision:saved.revision,definition:submitted};
 const same=epoch===state.epoch&&canRunAnalysis();
 $('analysis-state').textContent='Saved revision '+saved.revision+(same?'':' · later edits remain in the current draft.');
 $('run-analysis').disabled=!same;await refreshAfterCompletion();$('analysis-select').value=saved.id;scheduleSnapshot();
 notice('Saved analytical definition revision '+saved.revision+(same?'.':'; the later draft is retained.'));
}
async function runAnalysis(){if(!state.analysis)throw Error('Save or open a retained analysis first.');if(!canRunAnalysis())throw Error('Save the current changes before running; the saved revision is the native input.');const result=await mutate('run',{analysis_id:state.analysis.id,revision:state.analysis.revision});await refresh();$('result-kind').value='results';fillResults();$('result-select').value=result.result_id;await openResult('results',result.result_id);show('results');notice('Retained the complete native result: '+result.row_count+' groups.');}
async function openResult(kind,id,offset=0){
 if(!id)throw Error('Choose a retained result.');
 const generation=nextRead('result'),[record,rows]=await Promise.all([api(base+'/'+kind+'/'+id),api(base+'/'+kind+'/'+id+'/rows?offset='+offset+'&limit=100')]);
 if(!currentRead('result',generation))return null;
 state.result=record;state.resultKind=kind;state.resultOffset=offset;$('result-kind').value=kind;fillResults();$('result-select').value=id;
 facts($('result-facts'),[['Result',id],['Retained groups',record.row_count],['Source editions',record.source_editions],['Created',record.created_at],['Typed result fingerprint',record.fingerprint.sha256]]);
 grid($('result-grid'),rows.columns,rows.rows);pager($('result-pager'),rows,()=>openResult(kind,id,Math.max(0,offset-100)),()=>openResult(kind,id,rows.next_offset));
 $('result-json').textContent=json(record);$('result-totals').replaceChildren();
 if(record.totals){$('result-totals').append(node('h3','All selected source rows'));const target=node('div');grid(target,record.totals.columns,[record.totals.values]);$('result-totals').append(target,node('p',record.totals.scope,{class:'hint'}));}
 if(record.summary)facts($('result-totals'),Object.entries(record.summary));scheduleSnapshot();return record;
}
async function compareKeys(selected){
 const id=$('compare-before').value,generation=nextRead('compareKeys');state.compareKeySource=null;$('compare-keys').replaceChildren();
 if(!id)return;
 const result=await api(base+'/results/'+id);
 if(!currentRead('compareKeys',generation)||$('compare-before').value!==id)return;
 for(const column of result.columns){
  const control=input(column.name,'checkbox');control.checked=selected?selected.includes(column.name):result.dimensions.some(item=>item.name===column.name);
  const label=node('label');label.append(control,node('span',column.name));$('compare-keys').append(label);
 }
 state.compareKeySource=id;scheduleSnapshot();
}
async function compareResults(){if(state.compareKeySource!==$('compare-before').value)throw Error('Open the selected earlier result keys before comparing.');const keys=[...$('compare-keys').querySelectorAll('input:checked')].map(item=>item.value);const result=await mutate('compare',{before_id:$('compare-before').value,after_id:$('compare-after').value,keys,title:$('compare-title').value});await refresh();$('result-kind').value='comparisons';fillResults();$('result-select').value=result.comparison_id;await openResult('comparisons',result.comparison_id);notice('Compared all native groups with exact missing-side and numeric-change rules.');}
function fillPageSources(control){const previous=control.value,all=[...state.results.map(item=>({...item,key:'result:'+item.result_id})),...state.comparisons.map(item=>({...item,key:'comparison:'+item.comparison_id}))];select(control,all,{value:item=>item.key,text:labelRecord});if(previous&&!all.some(item=>item.key===previous)){control.append(node('option',previous,{value:previous}));control.value=previous;}}
async function configurePage(row,value={}){
 const generation=(row._generation||0)+1;row._generation=generation;
 const kind=row.querySelector('.page-kind').value,container=row.querySelector('.page-data');container.replaceChildren();
 row._kind=kind;row._sourceReady=kind==='text';row._sourceId=null;
 if(kind==='text')return;
 const source=choices([]);source.className='page-source';fillPageSources(source);
 source.value=value.source_id?value.source_kind+':'+value.source_id:value.source||'';
 const fields=node('div'),line=node('div',undefined,{class:'row'});line.append(field('Retained result',source));container.append(line,fields);
 let selectedValue=structuredClone(value);
 const loadFields=async()=>{
  const serial=(row._fieldGeneration||0)+1;row._fieldGeneration=serial;const sourceKey=source.value;
  row._sourceReady=false;row._sourceId=null;fields.replaceChildren();
  if(!sourceKey){scheduleSnapshot();return;}
  const [sourceKind,id]=sourceKey.split(':'),record=await api(base+'/'+(sourceKind==='result'?'results':'comparisons')+'/'+id);
  if(!row.isConnected||row._generation!==generation||row._fieldGeneration!==serial||source.value!==sourceKey||row.querySelector('.page-kind').value!==kind)return;
  row._sourceRecord=record;row._sourceId=sourceKey;const checks=node('div',undefined,{class:'checklist'});
  for(const column of record.columns){
   const control=input(column.name,'checkbox');control.className='page-column';control.checked=!selectedValue.columns||selectedValue.columns.includes(column.name);
   const label=node('label');label.append(control,node('span',column.name));checks.append(label);
  }
  fields.append(field('Columns in complete report table',checks));
  if(kind!=='table'){
   const x=choices(record.columns.map(item=>item.name),selectedValue.x||record.dimensions?.[0]?.name||record.columns[0]?.name),y=node('div',undefined,{class:'checklist'}),limit=input(String(selectedValue.chart_limit??200),'number');
   x.className='page-x';limit.className='page-limit';limit.min=1;limit.max=2000;
   const roles=new Map((record.column_roles||[]).map(item=>[item.name,item.role]));
   for(const column of record.columns.filter(item=>/^(?:U?(?:TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT)|FLOAT|DOUBLE|DECIMAL\([0-9]+,[0-9]+\))$/.test(item.type)||roles.get(item.name)==='exact_decimal_change')){
    const control=input(column.name,'checkbox');control.className='page-y';control.checked=selectedValue.y?.includes(column.name)||false;const label=node('label');label.append(control,node('span',column.name));y.append(label);
   }
   fields.append(field('Horizontal dimension',x),field('Numeric series (up to eight)',y),field('Chart groups from retained order (complete table remains included)',limit));
  }
  row._sourceReady=true;scheduleSnapshot();
 };
 const reload=node('button','Load selected fields',{type:'button'});line.append(reload);
 reload.addEventListener('click',()=>run(async()=>{
  row.inert=true;try{await checkpoint('Before reopening the selected report fields');selectedValue=rawPage(row);await loadFields();invalidateWorkbook();}finally{row.inert=false;}
 }).catch(()=>{}));
 source.addEventListener('change',()=>{
  const wanted=source.value,prior=rawPage(row);prior.source=row._sourceId||'';
  source.value=prior.source;
  run(async()=>{row.inert=true;try{
   await archivePageBeforeChange(row,prior,'Before changing a report source');
   source.value=wanted;selectedValue={};invalidateWorkbook();await loadFields();
  }finally{row.inert=false;}}).catch(()=>{});
 });
 await loadFields();
}
async function workbookPage(value={kind:'table',title:'Result page'}){
 const row=node('div',undefined,{class:'page-editor'}),line=node('div',undefined,{class:'row'}),title=input(value.title||'Result page'),
  kind=choices([['table','Full table'],['bar','Bar chart and full table'],['line','Line chart and full table'],['text','Editorial notes']],value.kind||'table'),
  up=node('button','Move up',{type:'button'}),down=node('button','Move down',{type:'button'}),remove=node('button','Remove',{type:'button'});
 row.dataset.pageId=value.page_id||uuid();title.className='page-title';kind.className='page-kind';
 line.append(field('Page title',title),field('Page kind',kind),up,down,remove);
 const text=node('textarea',undefined,{value:value.text||'',class:'page-text'}),data=node('div',undefined,{class:'page-data'});
 row.append(line,field('Interpretation and notes',text),data);$('workbook-pages').append(row);
 const revise=async(title,action)=>{row.inert=true;try{await checkpoint(title);action();invalidateWorkbook();scheduleSnapshot();}finally{row.inert=false;}};
 up.addEventListener('click',()=>run(()=>revise('Before moving a report page',()=>{if(row.previousElementSibling)row.parentNode.insertBefore(row,row.previousElementSibling);})).catch(()=>{}));
 down.addEventListener('click',()=>run(()=>revise('Before moving a report page',()=>{if(row.nextElementSibling)row.parentNode.insertBefore(row.nextElementSibling,row);})).catch(()=>{}));
 remove.addEventListener('click',()=>run(()=>revise('Before removing a report page',()=>row.remove())).catch(()=>{}));
 kind.addEventListener('change',()=>{
  const selected=rawPage(row),previous={...selected,kind:row._kind||selected.kind};kind.value=previous.kind;
  run(async()=>{row.inert=true;try{
   await archivePageBeforeChange(row,previous,'Before changing a report page kind');
   kind.value=selected.kind;invalidateWorkbook();await configurePage(row,selected);
  }finally{row.inert=false;}}).catch(()=>{});
 });
 await configurePage(row,value);invalidateWorkbook();scheduleSnapshot();return row;
}
function workbookDefinition(){const value={name:$('workbook-name').value,title:$('workbook-title').value,description:$('workbook-description').value,author:$('workbook-author').value,pages:[...$('workbook-pages').children].map(row=>{const item={title:row.querySelector('.page-title').value,kind:row.querySelector('.page-kind').value,text:row.querySelector('.page-text').value};if(item.kind!=='text'){const source=row.querySelector('.page-source').value;if(!row._sourceReady||row._sourceId!==source)throw Error('Wait for the selected original report source fields to open.');if(!source)throw Error('Choose a retained result for every result page.');[item.source_kind,item.source_id]=source.split(':');item.columns=[...row.querySelectorAll('.page-column:checked')].map(column=>column.value);if(item.kind!=='table'){item.x=row.querySelector('.page-x').value;item.y=[...row.querySelectorAll('.page-y:checked')].map(column=>column.value);item.chart_limit=Number(row.querySelector('.page-limit').value);}}return item;})};return value;}
function invalidateWorkbook(){state.workbookEpoch++;$('publish-workbook').disabled=true;scheduleSnapshot();}
async function setWorkbook(value){state.workbookBaseline=null;$('workbook-name').value=value.name;$('workbook-title').value=value.title;$('workbook-description').value=value.description||'';$('workbook-author').value=value.author||'';$('workbook-pages').replaceChildren();for(const page of value.pages)await workbookPage(page);$('workbook-json').value=json(value);invalidateWorkbook();}
async function openWorkbook(){
 const id=$('workbook-select').value,revision=$('workbook-revision').value;if(!id)throw Error('Choose a saved workbook.');
 await transition('Before opening another workbook',async()=>{
  const current=await api(base+'/workbooks/'+id),selected=revision?await api(base+'/workbooks/'+id+'?revision='+enc(revision)):current;
  await setWorkbook(selected.definition);state.workbook=selected;state.workbookExpected=current.revision;state.workbookBaseline={id:selected.id,revision:selected.revision,definition:structuredClone(workbookDefinition())};
  $('workbook-state').textContent='Opened revision '+selected.revision+' · saving creates a revision after current '+current.revision+'.';$('publish-workbook').disabled=false;
 });
}
async function saveWorkbook(){
 const submitted=workbookDefinition(),epoch=state.workbookEpoch,expected=state.workbookExpected;await checkpoint('Submitted workbook revision');
 const saved=await mutate('workbooks',{definition:submitted,expected_revision:expected});state.workbook=saved;state.workbookExpected=saved.revision;state.workbookBaseline={id:saved.id,revision:saved.revision,definition:submitted};
 const same=epoch===state.workbookEpoch&&canPublishWorkbook();
 $('workbook-state').textContent='Saved workbook revision '+saved.revision+(same?'':' · later edits remain in the current draft.');
 $('publish-workbook').disabled=!same;await refreshAfterCompletion();$('workbook-select').value=saved.id;scheduleSnapshot();notice('Saved workbook revision '+saved.revision+'.');
}
async function publishWorkbook(){if(!canPublishWorkbook())throw Error('Save the current workbook pages before publishing.');const result=await mutate('publish',{workbook_id:state.workbook.id,revision:state.workbook.revision});await refresh();$('report-select').value=result.report_id;await openReport(result.report_id);show('reports');notice('Published the exact saved workbook revision.');}
async function openReport(id){if(!id)throw Error('Choose a published report.');const report=await api(base+'/reports/'+id);state.report=report;facts($('report-facts'),[['Title',report.definition.title],['Workbook revision',report.workbook_revision],['Report',report.report_id],['Published',report.created_at],['Source editions',report.source_editions]]);$('report-json').textContent=json(report);$('report-pages').replaceChildren();for(const [index,page]of report.definition.pages.entries()){const section=node('div',undefined,{class:'panel'});section.append(node('h3',(index+1)+' · '+page.title),node('p',page.text||''));if(page.kind!=='text'){const source=report.sources[page.source_kind+':'+page.source_id];section.append(node('p',page.kind+' · '+source.row_count+' full result rows · '+page.source_id,{class:'hint'}));const button=node('button','Open complete retained result');button.addEventListener('click',()=>run(async()=>{await openResult(page.source_kind==='result'?'results':'comparisons',page.source_id);show('results');}).catch(()=>{}));section.append(button);} $('report-pages').append(section);}return report;}
async function exportReport(){const id=$('report-select').value;if(!id)throw Error('Choose a published report.');notice('Preparing the complete native report, source application and warehouse package…');const browser=await saveBrowserWorkspace();const result=await mutate('exports',{report_id:id,browser_workspace:{id:browser.id,revision:browser.revision,state_sha256:browser.state_sha256}},{exported:true});await refresh();$('export-select').value=result.export_id;await openExport(result.export_id);notice('Complete customer package is ready.');}
async function download(exportId,file){const response=await api('/api/exports/'+enc(exportId)+'/file?name='+enc(file.name),undefined,true);const blob=await response.blob();if(blob.size!==file.bytes)throw Error('The original file size changed.');const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(item=>item.toString(16).padStart(2,'0')).join('');if(actual!==file.sha256)throw Error('The original file SHA-256 changed.');saveBlob(blob,file.name.split('/').at(-1));notice('Downloaded exact '+file.name+' · '+file.bytes+' bytes.');}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),link=node('a',undefined,{href:url,download:name});document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function openExport(id){if(!id)throw Error('Choose a completed package.');const record=await api('/api/exports/'+id);if(record.schema!=='stellar-forge.duckdb-analytics.v1.export'||record.state!=='COMPLETE'||record.workspace_id!==state.identity.workspace_id)throw Error('The original analytical package binding changed.');state.export=record;facts($('export-facts'),[['Export',record.export_id],['Captured report',record.report_id],['Files',record.files.length],['Manifest',record.manifest_sha256],['Complete download',record.archive?.name]]);const target=$('export-downloads');target.replaceChildren();const ordered=[...record.files].sort((a,b)=>(a.name==='analytical-workbook.zip'?-1:b.name==='analytical-workbook.zip'?1:a.name.localeCompare(b.name)));for(const file of ordered){const button=node('button',(file.name==='analytical-workbook.zip'?'Download whole customer package · ':'')+file.name+' · '+file.bytes.toLocaleString()+' bytes',{class:file.name==='analytical-workbook.zip'?'primary':''});button.addEventListener('click',()=>run(()=>download(id,file)).catch(()=>{}));target.append(button);}}

async function continueOriginal(request){
 const route=request.exported?'/api/requests/':base+'/requests/';
 let record;
 try{record=await api(route+request.request_id);}catch(error){if(error.status!==404&&error.code!=='DUCKDB_OPERATOR_LOCAL_FILE_UNAVAILABLE')throw error;}
 let result;
 if(record?.state==='COMPLETE')result=request.exported?await api('/api/exports/'+enc(record.export_id)):record.result;
 else if(record)result=await api(route+request.request_id+'/resume',request.exported?{}:{workspace_id:state.identity.workspace_id});
 else result=await api(request.route,{...request.original,request_id:request.request_id});
 await finishRequest(request,result);$('request-json').textContent=json({request,result});await refreshAfterCompletion();notice('Original retained operation completed.');
}
async function retainNativeRequest(record,exported=false){
 const original=record.body||record.original?.body||record.request?.body;
 if(!original||typeof original.request_id!=='string')throw Error('The complete original request body is unavailable.');
 const body={...original};delete body.request_id;
 const request={request_id:original.request_id,route:exported?base+'/exports':base+'/'+record.kind,original:body,exported,created_at:record.created_at};
 await state.draftStore.rememberRequest(request);
 if(record.state==='COMPLETE'){
  const result=exported?await api('/api/exports/'+enc(record.export_id)):record.result;
  await finishRequest(request,result);
 }else{state.pending[request.request_id]=request;scheduleSnapshot();}
 return request;
}
async function renderRequests(offset=state.requestOffset){
 const generation=nextRead('requests'),page=await api(base+'/operations?offset='+offset+'&limit=25');
 if(!currentRead('requests',generation))return;state.requestOffset=offset;
 const target=$('request-list');target.replaceChildren();
 const add=(target,item,exported=false)=>{
  const row=node('div',undefined,{class:'saved-item'}),detail=node('div');detail.append(node('strong',(item.kind||'Export')+' · '+item.state),node('p',item.request_id,{class:'mono'}));
  const read=node('button','Read original'),resume=node('button','Resume original',{disabled:item.state==='COMPLETE'});
  const prefix=exported?'/api/requests/':base+'/requests/';
  read.addEventListener('click',()=>run(async()=>{const record=await api(prefix+item.request_id);$('request-json').textContent=json(record);await retainNativeRequest(record,exported);notice('Retained the complete original request and its actual native state.');}).catch(()=>{}));
  resume.addEventListener('click',()=>run(async()=>{
   const record=await api(prefix+item.request_id),original=record.body||record.original?.body||record.request?.body;
   if(!original){const result=await api(prefix+item.request_id+'/resume',exported?{}:{workspace_id:state.identity.workspace_id});$('request-json').textContent=json(result);await refreshAfterCompletion();return;}
   const input={...original};delete input.request_id;
   const request={request_id:item.request_id,route:exported?base+'/exports':base+'/'+record.kind,original:input,exported,created_at:record.created_at};
   await state.draftStore.rememberRequest(request);await continueOriginal(request);
  }).catch(()=>{}));row.append(detail,read,resume);target.append(row);
 };
 page.operations.forEach(item=>add(target,item));
 pager($('request-pager'),page,()=>renderRequests(Math.max(0,offset-25)),()=>renderRequests(page.next_offset));
 const exported=$('export-request-list');exported.replaceChildren();state.operations.forEach(item=>add(exported,item,true));
 for(const pending of Object.values(state.pending)){
  if(page.operations.some(item=>item.request_id===pending.request_id)||state.operations.some(item=>item.request_id===pending.request_id))continue;
  const row=node('div',undefined,{class:'saved-item'}),detail=node('div');detail.append(node('strong','Retained original request'),node('p',pending.route+' · '+pending.request_id,{class:'mono'}));
  const resume=node('button','Read and continue original');resume.addEventListener('click',()=>run(()=>continueOriginal(pending)).catch(()=>{}));row.append(detail,resume);target.append(row);
 }
 if(!$('screen-browser').hidden)await renderBrowserHistory();
}
const formIds=['source-edition','analysis-select','analysis-revision','analysis-name','analysis-title','analysis-edition','analysis-description','pivot-column','pivot-null','pivot-other','pivot-null-label','pivot-other-label','analysis-order','analysis-json','result-kind','result-select','compare-before','compare-after','compare-title','workbook-select','workbook-revision','workbook-name','workbook-title','workbook-author','workbook-description','workbook-json','report-select','export-select'];
const rawRows={
 dimensions:[['column','.dim-column'],['name','.dim-name'],['transform','.dim-grain']],
 measures:[['aggregate','.measure-aggregate'],['column','.measure-column'],['name','.measure-name'],['nulls','.measure-nulls'],['note','.measure-note']],
 filters:[['column','.filter-column'],['operator','.filter-operator'],['raw','.filter-value'],['nulls','.filter-nulls']],
 pivots:[['value','.pivot-value'],['label','.pivot-label']]
};
const rowContainers={dimensions:'dimensions',measures:'measures',filters:'filters',pivots:'pivot-values'};
function nextRead(name){return state.reads[name]=(state.reads[name]||0)+1;}
function currentRead(name,value){return state.reads[name]===value;}
function controlValue(control){return control.type==='checkbox'?control.checked:control.value;}
function assignControl(control,value){
 if(!control)return;
 if(control.type==='checkbox'){control.checked=Boolean(value);return;}
 const text=String(value??'');
 if(control.tagName==='SELECT'&&text&&![...control.options].some(item=>item.value===text))control.append(node('option',text+' · retained',{value:text}));
 control.value=text;
}
function rawPage(row){
 return {page_id:row.dataset.pageId,title:row.querySelector('.page-title').value,kind:row.querySelector('.page-kind').value,text:row.querySelector('.page-text').value,
  source:row.querySelector('.page-source')?.value||'',columns:[...row.querySelectorAll('.page-column:checked')].map(item=>item.value),
  x:row.querySelector('.page-x')?.value||'',y:[...row.querySelectorAll('.page-y:checked')].map(item=>item.value),
  chart_limit:row.querySelector('.page-limit')?.value||'',fields_ready:row._sourceReady===true};
}
function snapshotMetadata(){return {browser:{...state.browser,title:$('browser-title')?.value||state.browser?.title||'Working analysis'}};}
function snapshot(){
 if(!state.identity)throw Error('Open the original warehouse first.');
 const form=Object.fromEntries(formIds.map(id=>[id,controlValue($(id))]));
 const rows=Object.fromEntries(Object.entries(rawRows).map(([kind,columns])=>[kind,[...$(rowContainers[kind]).children].map(row=>Object.fromEntries(columns.map(([name,selector])=>[name,row.querySelector(selector).value])))]));
 const keep=record=>record.route!=='/api/analytics/browser-workspaces';
 return {schema:STATE_SCHEMA,workspace_id:state.identity.workspace_id,form,rows,pages:[...$('workbook-pages').children].map(rawPage),
  context:{source_edition:state.source?.edition.edition_id||null,analysis_source_edition:state.analysisSource?.edition.edition_id||null,
   analysis:state.analysis,analysis_expected:state.analysisExpected,analysis_baseline:state.analysisBaseline,workbook:state.workbook,workbook_expected:state.workbookExpected,workbook_baseline:state.workbookBaseline,review:state.review,review_definition:state.reviewDefinition},
  selection:{screen:document.querySelector('[data-screen][aria-current="page"]')?.dataset.screen||'source',
   result:state.result?{id:state.result.result_id||state.result.comparison_id,kind:state.resultKind,offset:state.resultOffset}:null,
   source_values:state.sourceValues?{edition:state.sourceValues.edition_id,column:state.sourceValues.column,offset:state.sourceValues.offset}:null,
   compare_key_source:state.compareKeySource,compare_keys:[...$('compare-keys').querySelectorAll('input:checked')].map(item=>item.value),
   report_id:state.report?.report_id||null,export_id:state.export?.export_id||null,request_offset:state.requestOffset},
  pending:Object.fromEntries(Object.entries(state.pending).filter(([,value])=>keep(value))),
  receipts:Object.fromEntries(Object.entries(state.receipts).filter(([,value])=>keep(value))),updated_at:new Date().toISOString()};
}
function signature(value){const copy=structuredClone(value);delete copy.updated_at;return stable(copy);}
function assertSnapshot(value){
 const retained=validateSnapshot(value,state.identity.workspace_id);
 if(Object.keys(retained.form).some(id=>!formIds.includes(id))||formIds.some(id=>!(id in retained.form)))throw Error('Open this browser workspace with its matching complete application release.');
 for(const [kind,columns]of Object.entries(rawRows)){
  const names=columns.map(([name])=>name);
  for(const row of retained.rows[kind])if(!row||Object.keys(row).some(key=>!names.includes(key))||names.some(key=>typeof row[key]!=='string'))throw Error('The retained '+kind+' fields are incomplete.');
 }
 for(const page of retained.pages)if(!page||typeof page.page_id!=='string'||!['table','bar','line','text'].includes(page.kind)||!Array.isArray(page.columns)||!Array.isArray(page.y)||
  ['title','text','source','x','chart_limit'].some(key=>typeof page[key]!=='string')||page.columns.some(value=>typeof value!=='string')||page.y.some(value=>typeof value!=='string'))throw Error('The complete report page controls are invalid.');
 return retained;
}
function reportStorageError(error){$('browser-storage').textContent='Current draft remains open. Browser save: '+(error.message||String(error));$('browser-storage').classList.add('error');}
function scheduleSnapshot(){
 if(!state.draftStore||state.restoring)return;
 state.dirty=true;clearTimeout(state.saveTimer);
 state.saveTimer=setTimeout(()=>persistSnapshot().catch(reportStorageError),250);
}
async function persistSnapshot(){
 clearTimeout(state.saveTimer);state.saveTimer=null;
 if(!state.draftStore||state.restoring)return;
 const retained=snapshot();await state.draftStore.saveCurrent(retained,snapshotMetadata());
 $('browser-storage').textContent='Complete current draft saved in this browser.';$('browser-storage').classList.remove('error');
}
async function checkpoint(title){
 if(!state.draftStore||state.restoring)return null;
 const retained=snapshot(),record=await state.draftStore.checkpoint(retained,title,snapshotMetadata());
 await state.draftStore.saveCurrent(retained,snapshotMetadata());return record;
}
async function archivePageBeforeChange(row,previous,title){
 if(state.restoring||!state.draftStore)return;
 const retained=snapshot(),index=retained.pages.findIndex(page=>page.page_id===row.dataset.pageId);
 if(index>=0)retained.pages[index]=previous;
 await state.draftStore.checkpoint(retained,title,snapshotMetadata());
}
async function transition(title,action){
 if(state.restoring)return action();
 const oldInert=document.body.inert;document.body.inert=true;let previous;
 try{previous=await checkpoint(title);state.restoring=true;return await action();}
 catch(error){
  if(previous)try{await restoreSnapshot(previous.snapshot,previous.metadata);}catch(recovery){error.message+='; prior complete draft is retained in Browser workspace history: '+recovery.message;}
  throw error;
 }finally{state.restoring=false;document.body.inert=oldInert;scheduleSnapshot();}
}
function canRunAnalysis(){return state.analysis&&state.analysisBaseline?.id===state.analysis.id&&state.analysisBaseline.revision===state.analysis.revision&&matchesAnalysis(state.analysisBaseline.definition);}
function canPublishWorkbook(){return state.workbook&&state.workbookBaseline?.id===state.workbook.id&&state.workbookBaseline.revision===state.workbook.revision&&matchesWorkbook(state.workbookBaseline.definition);}
function matchesAnalysis(value){try{return stable(definition())===stable(value);}catch{return false;}}
function matchesWorkbook(value){try{return stable(workbookDefinition())===stable(value);}catch{return false;}}
async function refreshAfterCompletion(){try{await refresh();}catch(error){notice('The original operation completed. Refresh its retained result when the host responds: '+error.message,true);}}
async function browserCatalog(){
 const output=[];let offset=0;
 while(offset!==null){const page=await api(base+'/browser-workspaces?offset='+offset+'&limit=100');output.push(...page.workspaces);offset=page.next_offset;}
 return output;
}
function fillBrowserCatalog({adoptTitle=false}={}){
 if(!$('browser-select'))return;
 select($('browser-select'),state.browserCatalog,{text:item=>item.title+' · r'+item.revision+' · '+item.id.slice(0,12)});
 if(adoptTitle||$('browser-title').dataset.boundId!==state.browser?.id){$('browser-title').value=state.browser?.title||'Working analysis';$('browser-title').dataset.boundId=state.browser?.id||'';}
 $('browser-identity').textContent=state.browser?state.browser.id+' · saved revision '+state.browser.revision:'Choose a browser workspace.';
}
async function restoreSnapshot(value,metadata={}){
 const retained=assertSnapshot(value),context=retained.context;
 if(metadata.browser&&(!/^[a-f0-9]{32}$/.test(metadata.browser.id??'')||!Number.isSafeInteger(metadata.browser.revision)||
  metadata.browser.revision<0||typeof metadata.browser.title!=='string'))throw Error('The saved browser identity or revision is invalid.');
 state.result=null;state.resultOffset=0;state.report=null;state.export=null;state.sourceValues=null;
 for(const id of ['result-facts','result-grid','result-pager','result-totals','report-facts','report-pages','export-facts','export-downloads'])$(id).replaceChildren();
 for(const id of ['result-json','report-json'])$(id).textContent='';
 for(const kind of ['analysis','workbook'])if(context[kind]){
  const retainedRecord=context[kind],actual=await api(base+'/'+(kind==='analysis'?'analyses':'workbooks')+'/'+enc(retainedRecord.id)+'?revision='+enc(retainedRecord.revision));
  if(stable(actual)!==stable(retainedRecord))throw Error('The retained '+kind+' revision changed in this original warehouse.');
 }
 const sourceId=context.source_edition,analysisSourceId=context.analysis_source_edition;
 if(analysisSourceId)await openSource(analysisSourceId,{analysis:true});else state.analysisSource=null;
 if(sourceId&&sourceId!==analysisSourceId)await openSource(sourceId);
 if(!sourceId){state.source=null;$('source-facts').replaceChildren();$('source-fields').replaceChildren();$('source-meanings').textContent='';$('source-values').hidden=true;}
 for(const [kind,columns]of Object.entries(rawRows)){
  const container=$(rowContainers[kind]);container.replaceChildren();
  for(const value of retained.rows[kind]){
   ({dimensions:dimension,measures:measure,filters:filter,pivots:pivotValue})[kind]();
   const row=container.lastElementChild;
   for(const [name,selector]of columns)assignControl(row.querySelector(selector),value[name]);
   if(kind==='measures'){row.querySelector('.measure-column').disabled=value.aggregate==='count_rows';row.querySelector('.measure-nulls').disabled=!['sum','avg'].includes(value.aggregate);}
   if(kind==='filters')row.querySelector('.filter-value').disabled=['is_null','not_null'].includes(value.operator);
  }
 }
 $('workbook-pages').replaceChildren();
 for(const item of retained.pages){
  const value={...item};
  const row=await workbookPage(value);
  assignControl(row.querySelector('.page-title'),item.title);assignControl(row.querySelector('.page-text'),item.text);
  if(item.kind!=='text'){
   for(const control of row.querySelectorAll('.page-column'))control.checked=item.columns.includes(control.value);
   assignControl(row.querySelector('.page-x'),item.x);
   for(const control of row.querySelectorAll('.page-y'))control.checked=item.y.includes(control.value);
   assignControl(row.querySelector('.page-limit'),item.chart_limit);
   row._sourceReady=item.fields_ready===true;
  }
 }
 Object.assign(state,{analysis:context.analysis,analysisExpected:context.analysis_expected,analysisBaseline:context.analysis_baseline,workbook:context.workbook,workbookExpected:context.workbook_expected,workbookBaseline:context.workbook_baseline,review:context.review,reviewDefinition:context.review_definition});
 if(metadata.browser)state.browser=structuredClone(metadata.browser);
 for(const request of Object.values(retained.pending)){
  const existing=await state.draftStore.rememberRequest(request);
  if(existing.state==='COMPLETE')state.receipts[request.request_id]={...request,state:'COMPLETE',result:existing.result};
  else state.pending[request.request_id]=request;
 }
 for(const [id,receipt]of Object.entries(retained.receipts)){
  if(!receipt||receipt.request_id!==id||receipt.state!=='COMPLETE'||!receipt.original)throw Error('The retained completed request is incomplete.');
  await state.draftStore.completeRequest(receipt,receipt.result);
  state.receipts[id]=structuredClone(receipt);delete state.pending[id];
 }
 const selection=retained.selection;
 if(selection.result)await openResult(selection.result.kind,selection.result.id,selection.result.offset);
 if(selection.report_id)await openReport(selection.report_id);
 if(selection.export_id)await openExport(selection.export_id);
 for(const id of formIds)assignControl($(id),retained.form[id]);
 if(retained.form['compare-before']){await compareKeys(selection.compare_keys);state.compareKeySource=selection.compare_key_source===retained.form['compare-before']?selection.compare_key_source:null;}
 else{$('compare-keys').replaceChildren();state.compareKeySource=null;}
 if(selection.source_values&&selection.source_values.edition===state.source?.edition.edition_id)await values(selection.source_values.column,selection.source_values.offset,selection.source_values.edition);
 state.requestOffset=selection.request_offset||0;
 $('analysis-state').textContent=(state.analysis?'Retained analysis revision '+state.analysis.revision:'New analysis')+' · next save expects '+state.analysisExpected;
 $('workbook-state').textContent=(state.workbook?'Retained workbook revision '+state.workbook.revision:'New workbook')+' · next save expects '+state.workbookExpected;
 const reviewed=state.review&&state.reviewDefinition&&matchesAnalysis(state.reviewDefinition)&&state.review.workspace_id===state.identity.workspace_id&&state.review.edition_id===state.analysisSource?.edition.edition_id;
 $('analysis-review').hidden=!reviewed;$('save-analysis').disabled=!reviewed;
 if(reviewed){facts($('review-facts'),[['Original rows',state.review.source_row_count],['Rows after filters',state.review.filtered_row_count],['Review',state.review.review_sha256]]);grid($('review-grid'),state.review.columns,state.review.preview?.rows||[]);$('review-json').textContent=json(state.review);}
 // A retained inactive review remains readable in its original draft; saving requires the exact active match.
 $('run-analysis').disabled=!canRunAnalysis();
 $('publish-workbook').disabled=!canPublishWorkbook();
 // Matching helpers generate JSON for their native request; restore raw JSON editors afterwards.
 $('analysis-json').value=retained.form['analysis-json'];$('workbook-json').value=retained.form['workbook-json'];
 fillBrowserCatalog({adoptTitle:true});show(['source','analysis','results','workbook','reports','requests','browser'].includes(selection.screen)?selection.screen:'source');
}
async function saveBrowserWorkspace(){
 const title=$('browser-title').value,retained=snapshot(),submittedSignature=signature(retained),identity=state.browser.id,revision=state.browser.revision;
 await checkpoint('Submitted browser workspace');
 const record=await mutate('browser-workspaces',{id:identity,title,expected_revision:revision,state:retained});
 if(record.id!==identity||record.workspace_id!==state.identity.workspace_id||stable(record.state)!==stable(retained))throw Error('The saved browser workspace response changed its original input.');
 state.browser={id:record.id,revision:record.revision,title:record.title};
 try{state.browserCatalog=await browserCatalog();}catch(error){$('browser-storage').textContent='Saved original workspace; catalog refresh: '+error.message;}fillBrowserCatalog();$('browser-select').value=record.id;
 state.dirty=signature(snapshot())!==submittedSignature;try{await persistSnapshot();}catch(error){reportStorageError(error);}
 notice('Saved complete browser workspace revision '+record.revision+' in the original warehouse.');return record;
}
async function openBrowserWorkspace(){
 const id=$('browser-select').value,revision=$('browser-revision').value;if(!id)throw Error('Choose a saved browser workspace.');
 let record;
 await transition('Before reopening a saved browser workspace',async()=>{
  record=await api(base+'/browser-workspaces/'+id+(revision?'?revision='+enc(revision):''));
  await restoreSnapshot(record.state,{browser:{id:record.id,revision:record.revision,title:record.title}});
 });
 await renderBrowserHistory();notice('Reopened complete browser workspace revision '+record.revision+'.');
}
async function exportBrowserWorkspace(){
 const retained=snapshot(),packet={schema:'stellar-forge.duckdb-analytics.v1.browser-transfer',workspace_id:state.identity.workspace_id,browser:snapshotMetadata().browser,state:retained};
 await checkpoint('Exported complete browser workspace');
 saveBlob(new Blob([JSON.stringify(packet)+'\n'],{type:'application/json'}),'analytical-browser-workspace.json');
 notice('Downloaded the complete current browser workspace and original requests.');
}
async function importBrowserWorkspace(){
 const file=$('browser-file').files?.[0];if(!file)throw Error('Select the original browser workspace JSON.');
 if(file.size>MAX_STATE_BYTES+65536)throw Error('The browser workspace file exceeds the eight MiB state limit.');
 const before=signature(snapshot()),bytes=await file.arrayBuffer();
 if(bytes.byteLength>MAX_STATE_BYTES+65536)throw Error('The browser workspace file exceeds the eight MiB state limit.');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),packet=JSON.parse(text);
 const retained=assertSnapshot(packet.state||packet),metadata=packet.schema==='stellar-forge.duckdb-analytics.v1.browser-transfer'?{browser:packet.browser}:{};
 if(packet.workspace_id!==state.identity.workspace_id)throw Error('The imported workspace belongs to another original warehouse.');
 if($('browser-file').files?.[0]!==file||signature(snapshot())!==before)throw Error('The selected file or current draft changed while reading. The current selection is retained; choose Import again.');
 await transition('Before importing a complete browser workspace',()=>restoreSnapshot(retained,metadata));
 if($('browser-file').files?.[0]===file)$('browser-file').value='';
 await renderBrowserHistory();notice('Reopened the complete imported browser workspace in its original warehouse.');
}
async function renderBrowserHistory(){
 const target=$('browser-history');target.replaceChildren();
 const records=await state.draftStore.editions();
 for(const record of records){
  const row=node('div',undefined,{class:'saved-item'}),label=node('div');label.append(node('strong',record.title||'Retained browser edition'),node('p',record.created_at||record.updated_at,{class:'mono'}));
  const reopen=node('button','Reopen complete draft'),download=node('button','Download');
  reopen.addEventListener('click',()=>run(()=>transition('Before reopening another retained draft',()=>restoreSnapshot(record.snapshot,record.metadata))).catch(()=>{}));
  download.addEventListener('click',()=>saveBlob(new Blob([JSON.stringify({schema:'stellar-forge.duckdb-analytics.v1.browser-transfer',workspace_id:state.identity.workspace_id,browser:record.metadata?.browser,state:record.snapshot})+'\n'],{type:'application/json'}),'retained-analytical-draft.json'));
  row.append(label,reopen,download);target.append(row);
 }
 const requests=$('browser-originals');requests.replaceChildren();
 for(const record of await state.draftStore.originalRequests()){
  const row=node('div',undefined,{class:'saved-item'}),label=node('div');label.append(node('strong',record.request.route+' · '+record.state),node('p',record.request.request_id,{class:'mono'}));
  const read=node('button','Read complete request'),download=node('button','Download');
  read.addEventListener('click',()=>{$('browser-request-json').textContent=json(record);});
  download.addEventListener('click',()=>saveBlob(new Blob([JSON.stringify(record)+'\n'],{type:'application/json'}),'analytical-request-'+record.request.request_id+'.json'));
  row.append(label,read,download);requests.append(row);
 }
}


on('refresh','click',()=>refresh());
on('open-source','click',()=>transition('Before opening another source',()=>openSource($('source-edition').value)));
on('use-source','click',()=>transition('Before creating an analysis from this source',async()=>{
 if(!state.source||$('source-edition').value!==state.source.edition.edition_id)throw Error('Open the selected original edition first.');
 const edition=state.source.edition.edition_id;state.analysis=null;state.analysisExpected=0;
 await setDefinition({name:'SourceAnalysis',title:'Source analysis',edition_id:edition,dimensions:[],measures:[{name:'Rows',aggregate:'count_rows',nulls:'exclude'}],filters:[]});
 $('analysis-state').textContent='New definition · expected revision 0';show('analysis');
}));
on('more-editions','click',async()=>{
 if(!state.nextEdition)return;const page=await api('/api/editions?limit=100&before='+state.nextEdition),map=new Map(state.editions.map(item=>[item.edition_id,item]));
 for(const item of page.editions)map.set(item.edition_id,item);state.editions=[...map.values()].sort((a,b)=>b.sequence-a.sequence);state.nextEdition=page.next_before;fillEditions();$('more-editions').disabled=!state.nextEdition;
});
on('analysis-edition','change',async()=>{
 const selected=$('analysis-edition').value;if(!selected)throw Error('Choose an original source edition.');
 $('analysis-edition').value=state.analysisSource?.edition.edition_id||'';
 await transition('Before changing the analysis source',async()=>{
  const oldColumns=[...document.querySelectorAll('.dim-column,.measure-column,.filter-column')].map(control=>[control,control.value]),pivot=$('pivot-column').value;
  await openSource(selected,{analysis:true});
  for(const [control,value]of oldColumns){optionColumn(control);assignControl(control,value);}
  assignControl($('pivot-column'),pivot);state.analysisBaseline=null;invalidate();
 });
});
for(const [id,fn]of [['add-dimension',dimension],['add-measure',measure],['add-filter',filter],['add-pivot',pivotValue]])on(id,'click',()=>{fn();invalidate();});
$('analysis-form').addEventListener('input',event=>{if(event.target.id!=='analysis-json')invalidate();});
$('analysis-form').addEventListener('change',event=>{if(event.target.id!=='analysis-json')invalidate();});
on('analysis-form','submit',reviewAnalysis);on('save-analysis','click',saveAnalysis);on('run-analysis','click',runAnalysis);on('open-analysis','click',openAnalysis);
on('new-analysis','click',()=>transition('Before starting a new analysis',async()=>{
 const edition=state.source?.edition.edition_id||state.editions[0]?.edition_id;if(!edition)throw Error('Import an acquired source edition in the original workspace first.');
 state.analysis=null;state.analysisExpected=0;await setDefinition({name:'SourceAnalysis',title:'Source analysis',edition_id:edition,dimensions:[],measures:[{name:'Rows',aggregate:'count_rows',nulls:'exclude'}]});
 $('analysis-state').textContent='New definition · expected revision 0';
}));
on('apply-analysis-json','click',()=>{const value=JSON.parse($('analysis-json').value);return transition('Before applying the raw analysis definition',()=>setDefinition(value));});
on('refresh-analysis-json','click',async()=>{await checkpoint('Before replacing the raw analysis definition');$('analysis-json').value=json(definition());scheduleSnapshot();});
on('export-analysis-json','click',()=>saveBlob(new Blob([json(definition())+'\n'],{type:'application/json'}),$('analysis-name').value+'.json'));
on('result-kind','change',fillResults);on('open-result','click',()=>openResult($('result-kind').value,$('result-select').value));
$('compare-before').addEventListener('change',()=>{compareKeys().catch(error=>notice(error.message,true));});
on('compare-form','submit',compareResults);
on('add-result-page','click',async()=>{
 if(!state.result)throw Error('Open a retained result first.');
 await checkpoint('Before adding the selected result page');
 await workbookPage({kind:'table',title:state.result.title||state.result.definition?.title||'Result',source_kind:state.result.kind,source_id:state.result.result_id||state.result.comparison_id});show('workbook');
});
on('add-table-page','click',()=>workbookPage());on('add-text-page','click',()=>workbookPage({kind:'text',title:'Interpretation'}));
$('workbook-form').addEventListener('input',event=>{if(event.target.id!=='workbook-json')invalidateWorkbook();});
$('workbook-form').addEventListener('change',event=>{if(event.target.id!=='workbook-json')invalidateWorkbook();});
on('open-workbook','click',openWorkbook);
on('new-workbook','click',()=>transition('Before starting a new workbook',async()=>{state.workbook=null;state.workbookExpected=0;await setWorkbook({name:'SourceWorkbook',title:'Source analytical workbook',pages:[]});$('workbook-state').textContent='New workbook · expected revision 0';}));
on('workbook-form','submit',saveWorkbook);on('publish-workbook','click',publishWorkbook);
on('apply-workbook-json','click',()=>{const value=JSON.parse($('workbook-json').value);return transition('Before applying the raw workbook definition',()=>setWorkbook(value));});
on('refresh-workbook-json','click',async()=>{await checkpoint('Before replacing the raw workbook definition');$('workbook-json').value=json(workbookDefinition());scheduleSnapshot();});
on('open-report','click',()=>openReport($('report-select').value));on('export-report','click',exportReport);on('open-export','click',()=>openExport($('export-select').value));
on('save-browser','click',saveBrowserWorkspace);on('open-browser','click',openBrowserWorkspace);on('export-browser','click',exportBrowserWorkspace);on('import-browser','click',importBrowserWorkspace);
on('new-browser','click',async()=>{await checkpoint('Before saving this draft under a new workspace identity');state.browser={id:uuid(),revision:0,title:$('browser-title').value||'Working analysis'};fillBrowserCatalog({adoptTitle:true});await persistSnapshot();notice('The complete draft is ready to save as a new browser workspace.');});
on('refresh-browser','click',async()=>{state.browserCatalog=await browserCatalog();fillBrowserCatalog();await renderBrowserHistory();});
document.addEventListener('input',scheduleSnapshot);document.addEventListener('change',scheduleSnapshot);
document.querySelectorAll('[data-screen]').forEach(button=>button.addEventListener('click',()=>{scheduleSnapshot();if(button.dataset.screen==='browser')renderBrowserHistory().catch(reportStorageError);}));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persistSnapshot().catch(reportStorageError);});
run(async()=>{
 state.restoring=true;const oldInert=document.body.inert;document.body.inert=true;
 try{
  await refresh({initial:true});const retained=await state.draftStore.current();
  if(retained)await restoreSnapshot(retained.snapshot,retained.metadata);
  else{
   if(state.source){state.analysisSource=state.source;$('analysis-edition').value=state.source.edition.edition_id;optionColumn($('pivot-column'));}
   if(!state.analyses.length)measure();show('source');fillBrowserCatalog();
  }
 }finally{state.restoring=false;document.body.inert=oldInert;}
 await persistSnapshot();notice('Original workspace opened. Complete browser drafts and native requests are available.');
}).catch(()=>{});
