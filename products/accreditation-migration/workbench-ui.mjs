import {definition,keyOf,blankRecord,typedCell,validateRecord,canonicalJSON,report,parseCSV,formLocations} from './workbench.mjs';
import {base64FromBytes,utf8Text,sha256Utf8} from './lib/data.mjs';
const $=id=>document.getElementById(id),area=$('work-area'),dialog=$('editor');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const encode=v=>esc(encodeURIComponent(v));
const human=v=>String(v).replace(/_/g,' ').replace(/^\w/,c=>c.toUpperCase());
const pretty=v=>typeof v==='object'?JSON.stringify(v,null,2):String(v??'');
const compact=v=>v===null||v===undefined?'—':typeof v==='object'?JSON.stringify(v):String(v);
const date=v=>v?String(v).replace('T',' ').replace('.000Z',' UTC').replace(/Z$/,' UTC'):'—';
const btn=(text,cmd,data='',primary=false)=>'<button type="button" data-cmd="'+cmd+'" '+data+(primary?' class="primary"':'')+'>'+esc(text)+'</button>';
const external=(url,title)=>/^(https?):\/\//.test(url||'')?'<a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">'+esc(title||url)+'</a>':esc(title||url);
const options=(values,selected)=>values.map(v=>{const value=typeof v==='object'?v.value:v,text=typeof v==='object'?v.label:human(v);return '<option value="'+esc(value)+'"'+(String(selected)===String(value)?' selected':'')+'>'+esc(text)+'</option>';}).join('');
const views=[['sources','Sources'],['accounts','Accounts and sites'],['accreditations','Accreditations and scope'],['assessments','Assessments and documents'],['billing','Billing'],['mapping','Target mapping'],['receiving','Receiving'],['handover','Handover']];
const groups={accounts:['issuer_account','facility'],accreditations:['accreditation','scope_item'],assessments:['assessment','document','participant','finding','issuer_decision'],billing:['fee_profile','charge_line']};
let state,session,view='sources',entity='issuer_account',query='',page=0,busy=false,editRevision=null,editEntity=null,editKey=null,importDraft=null,mappingEntity='source_edition',selectedRun=null,mappingDraft=null,mappingBaseRevision=null,mappingDirty=false,editOriginal=null,formDraft=null;
let feeDraft={purpose:'Published fee calculation',rounding:{decimal_places:2,mode:'half_even',scope:'invoice'},tax:null,lines:[{line_id:'line-1',profile_id:'AS14-2026-07',tariff_key:'AS14-2026-07:annual-main',quantity:'1',billing_account_key:'calculation',billing_period:'2026/27',invoice_key:'calculation'}]};
function notice(message,error){$('notice').hidden=!message;$('notice').innerHTML=esc(message||'')+(error?.details?'<details><summary>Details</summary><pre>'+esc(pretty(error.details))+'</pre></details>':'');}
function errorMessage(error){const target=dialog.open?$('editor-error'):$('notice');target.hidden=false;target.innerHTML='<strong>'+esc(error.message||error)+'</strong>'+(error.details?'<pre class="error-detail">'+esc(pretty(error.details))+'</pre>':'');}
async function api(path,body){const res=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'X-Workbench-Token':session.token,...body!==undefined?{'Content-Type':'application/json'}:{}},body:body===undefined?undefined:JSON.stringify(body)});const result=await res.json();if(!res.ok||result.error){const error=new Error(result.error?.message||'Application request failed.');error.code=result.error?.code;error.details=result.error?.details;throw error;}return result;}
async function action(payload,revision=state.project.revision){const result=await api('/api/action',{...payload,expected_revision:revision});state.project=result.project;state.report=report(result.project);render();return result.detail;}
async function download(path,name){const res=await fetch(path,{headers:{'X-Workbench-Token':session.token}});if(!res.ok){const r=await res.json();throw new Error(r.error?.message||'Download failed.');}saveBlob(await res.blob(),name);}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function saveJSON(value,name){saveBlob(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}),name);}
async function chooseFile(accept=''){return new Promise(resolve=>{const input=$('hidden-file');input.value='';input.accept=accept;input.onchange=()=>resolve(input.files[0]||null);input.oncancel=()=>resolve(null);input.click();});}
function modal(title,body){$('editor-title').textContent=title;$('editor-body').innerHTML=body;$('editor-error').hidden=true;if(!dialog.open)dialog.showModal();}
function close(){dialog.close();$('editor-body').innerHTML='';editKey=null;importDraft=null;formDraft=null;editOriginal=null;}
function panel(title,content,actions=''){return '<section class="panel"><div class="panel-heading"><h2>'+esc(title)+'</h2><div class="actions">'+actions+'</div></div>'+content+'</section>';}
function table(headers,rows){if(!rows.length)return '<div class="empty">No records in this selection.</div>';return '<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
function heading(title,description,actions=''){return '<div class="page-heading"><div><h1>'+esc(title)+'</h1><p class="muted wide-text">'+esc(description)+'</p></div><div class="actions">'+actions+'</div></div>';}
function stats(items){return '<div class="stats">'+items.map(([value,label])=>'<div class="stat"><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span></div>').join('')+'</div>';}
function sourceLink(id){const edition=state.project.records.source_edition.find(e=>e.source_edition_id===id);return edition?external(edition.source_url,edition.source_id+' · '+(edition.declared_issue||edition.source_edition_id)):esc(id);}
function sourceScreen(){
 const p=state.project;
 const editionRows=p.records.source_edition.map(e=>[esc(e.source_id),external(e.source_url,e.original_filename||e.source_edition_id)+'<span class="key">'+esc(e.source_edition_id)+'</span>',esc(e.declared_issue||'—'),esc(e.declared_date||'—'),esc(e.coverage),e.selected_for_current?'<span class="badge">Selected</span>':btn('Select edition','select-edition','data-id="'+encode(e.source_edition_id)+'"'),btn('Edit','edit-record','data-entity="source_edition" data-key="'+encode(keyOf(p,'source_edition',e))+'"')]);
 const fileRows=p.source_files.map(f=>[esc(f.path),Number(f.bytes).toLocaleString(),'<span class="mono small">'+esc(f.sha256)+'</span>',btn('Download original','download-source','data-id="'+encode(f.id)+'"')]);
 return heading('Sources','Import original files, retain every edition, and map the original rows into the saved project.',btn('Import CSV','import-csv','',true)+btn('Add original document','add-document'))+stats([[p.source_files.length,'Complete source files'],[p.records.source_edition.length,'Source editions'],[p.records.scope_item.length,'Selected transcribed scope rows'],[p.assets.length,'Original document assets']])+panel('Source editions',table(['Source','Original / edition','Issue','Declared date','Coverage','Selection',''],editionRows))+panel('Retained source files',table(['Original path','Bytes','SHA-256',''],fileRows));
}
const displayColumns={
issuer_account:['issuer_client_number','display_name','legal_party_id','source_edition_id'],facility:['published_label','issuer_account_key','site_kind','assessment_units'],
accreditation:['accreditation_number','standard_edition','inspection_classification','selected_scope_edition_id','publication_observation'],
scope_item:['scope_item_key','item_label','method_reference','conditions','source_page'],
assessment:['assessment_key','assessment_kind','planned_date','confirmed_date','status'],
document:['display_name','document_role','template_edition','visibility'],participant:['display_name','role','organisation_key'],finding:['finding_key','classification','description','agreed_due_date','status'],issuer_decision:['decision_key','decision_kind','issued_at','effective_at'],
fee_profile:['fee_profile_id','currency','tax_basis','publication_month'],charge_line:['charge_line_key','billing_account_key','quantity','currency','net_amount','tax_amount']
};
function entityTable(name){
 const p=state.project,columns=displayColumns[name]||definition(p,name).fields.slice(0,5).map(f=>f.name),all=p.records[name].filter(r=>!query||canonicalJSON(r).toLowerCase().includes(query.toLowerCase())),pageCount=Math.max(1,Math.ceil(all.length/30));page=Math.min(page,pageCount-1);
 const rows=all.slice(page*30,page*30+30).map(r=>[...columns.map(col=>col==='source_edition_id'||col==='selected_scope_edition_id'?sourceLink(r[col]):esc(compact(r[col]))),btn('Open / edit','edit-record','data-entity="'+name+'" data-key="'+encode(keyOf(p,name,r))+'"')+(name==='document'?btn('Original','download-document','data-key="'+encode(keyOf(p,name,r))+'"')+(r.original_filename.toLowerCase().endsWith('.docx')?btn('Read form controls','read-controls','data-key="'+encode(keyOf(p,name,r))+'"')+(r.content_control_map?btn('Fill template','fill-document','data-key="'+encode(keyOf(p,name,r))+'"'):''):''):'')]);
 return '<div class="filters"><input id="record-filter" type="search" placeholder="Find records in this table" aria-label="Find records" value="'+esc(query)+'"><span class="muted small">'+all.length+' records</span><div class="actions">'+btn('New '+human(name).toLowerCase(),'new-record','data-entity="'+name+'"')+btn('Import original CSV','import-csv','data-entity="'+name+'"')+'</div></div>'+table([...columns.map(human),''],rows)+'<div class="pager">'+btn('Previous','page-prev',''+(page===0?'disabled':''))+'<span>'+(page+1)+' / '+pageCount+'</span>'+btn('Next','page-next',page+1===pageCount?'disabled':'')+'</div>';
}
function tabs(names){return '<div class="tabs" role="tablist">'+names.map(n=>'<button type="button" role="tab" aria-selected="'+(n===entity)+'" data-cmd="entity-tab" data-entity="'+n+'">'+esc(human(n))+' · '+state.project.records[n].length+'</button>').join('')+'</div>';}
function changesPanel(){return panel('Published edition comparisons',state.project.source_reviews.map(r=>'<details><summary>'+esc(r.id.replaceAll('-',' '))+'</summary><p>'+esc(r.retained_decision)+'</p>'+table(['Field','Earlier observation','Later observation'],r.observations.map(o=>[esc(human(o.field)),esc(o.before??'—'),esc(o.after??o.value??'—')]))+(r.coverage?'<p class="small muted">'+esc(r.coverage)+'</p>':'')+'</details>').join(''));}
function accountScreen(){return heading('Accounts and sites','Keep original client keys, source-dated labels, legal identities, and site billing choices together.')+tabs(groups.accounts)+panel(human(entity),entityTable(entity));}
function accreditationScreen(){const t=state.project.transition;return heading('Accreditations and scope','Inspect each selected schedule, its full retained qualifiers, and the published standard transition.')+tabs(groups.accreditations)+panel(human(entity),entityTable(entity))+changesPanel()+panel('Standard transition', '<p>'+esc(t.from_standard)+' → '+esc(t.to_standard)+'</p>'+table(['Milestone','Published date','Applies to'],t.milestones.map(m=>[esc(human(m.kind)),esc(m.date),esc(m.selection)]))+'<p class="small muted">'+esc(t.grant_rule)+'</p>');}
function assessmentScreen(){return heading('Assessments and documents','Receive native cases, assignments, findings and complete original documents in the same project.',btn('Add original document','add-document','',true))+tabs(groups.assessments)+panel(human(entity),entityTable(entity))+panel('Published form sources',table(['Source','Form','Original'],state.project.form_register.map(f=>[esc(f.source_id),esc(f.published_title),external(f.original_url,'Open published original')])));}
function feeForm(){
 const profiles=state.project.records.fee_profile,tariffs=profiles.flatMap(p=>p.charge_rules.filter(t=>t.mode!=='cap').map(t=>({profile:p.fee_profile_id,...t})));
 const rows=feeDraft.lines.map((l,i)=>['<select data-fee-field="tariff_key" data-index="'+i+'" aria-label="Tariff">'+options(tariffs.map(t=>({value:t.tariff_key,label:t.profile+' · '+t.label})),l.tariff_key)+'</select>','<input data-fee-field="quantity" data-index="'+i+'" aria-label="Exact quantity" value="'+esc(l.quantity)+'">','<input data-fee-field="billing_account_key" data-index="'+i+'" aria-label="Billing account" value="'+esc(l.billing_account_key||'calculation')+'">','<input data-fee-field="billing_period" data-index="'+i+'" aria-label="Billing period" value="'+esc(l.billing_period||'2026/27')+'">','<input data-fee-field="original_amount" data-index="'+i+'" aria-label="Original actual cost" placeholder="Actual costs only" value="'+esc(l.original_amount||'')+'">',btn('Remove','remove-fee','data-index="'+i+'"')]);
 return '<div class="fees-input">'+table(['Published tariff','Quantity','Account / group','Period','Original actual cost',''],rows)+'</div><div class="actions">'+btn('Add charge','add-fee')+'</div><div class="fields"><div class="field"><label for="fee-tax">Tax rate, if selected</label><input id="fee-tax" placeholder="Leave empty for published net fees" value="'+esc(feeDraft.tax?.rate||'')+'"><small>Exact decimal rate, for example 0.15. The selected published rates exclude GST.</small></div><div class="field"><label for="fee-rounding">Rounding</label><select id="fee-rounding">'+options(['half_even','half_up','toward_zero'],feeDraft.rounding.mode)+'</select></div><div class="field"><label for="fee-scope">Rounding scope</label><select id="fee-scope">'+options(['invoice','line'],feeDraft.rounding.scope)+'</select></div><div class="field"><label for="fee-places">Decimal places</label><input id="fee-places" type="number" min="0" max="18" value="'+feeDraft.rounding.decimal_places+'"></div></div><div class="toolbar">'+btn('Calculate and save','calculate-fees','',true)+'</div>';
}
function billingScreen(){
 const p=state.project,last=p.fee_calculations.at(-1)?.result;
 const result=last?panel('Saved fee calculation',table(['Charge','Quantity / unit','Published rate','Exact net','Cap reduction','Rounded net','Tax'],last.lines.map(l=>[esc(l.label),esc(l.quantity+' '+l.quantity_unit),esc(l.rate??'Actual cost'),esc(l.exact_net),esc(l.cap_reduction),esc(l.rounded_net+' '+l.currency),esc(l.rounded_tax??'—')]))+table(['Group','Exact net','Rounded net','Rounded tax'],last.totals.map(t=>[esc(t.currency+' · '+t.tax_basis),esc(t.exact_net),esc(t.rounded_net),esc(t.rounded_tax??'—')]))+(last.cap_groups.length?'<details><summary>Recognition-cap allocation</summary><pre>'+esc(pretty(last.cap_groups))+'</pre></details>':'')):'';
 return heading('Billing','Calculate with the selected original tariff, exact quantities, explicit tax choices and recorded cap allocation.')+panel('Fee calculation',feeForm())+result+tabs(groups.billing)+panel(human(entity),entityTable(entity));
}
function mappingScreen(){
 const p=state.project,m=mappingDraft||p.mapping,e=m.entities.find(e=>e.canonical_entity===mappingEntity),native=m.target_schema?.tables.find(t=>t.table===e.native_table);
 const rows=definition(p,mappingEntity).fields.map(f=>{const b=e.field_overrides?.find(b=>b.canonical_field===f.name)||{native_field:null};
 return [esc(human(f.name))+'<span class="key">'+esc(f.type)+(f.required?' · required':'')+'</span>','<select data-map-field="'+f.name+'" data-map-property="native_field" aria-label="'+esc(human(f.name))+' native field">'+options([{value:'',label:'Select native field'},...(native?.columns||[]).map(c=>({value:c.name,label:c.name}))],b.native_field||'')+'</select>','<select data-map-field="'+f.name+'" data-map-property="blank_policy" aria-label="Blank policy">'+options(['preserve','clear','reject'],b.blank_policy||'preserve')+'</select>','<details><summary>Value representation</summary><div class="field"><label>Unit factor</label><input data-map-field="'+f.name+'" data-map-property="unit_factor" value="'+esc(b.unit_factor||'1')+'"></div><div class="field"><label>Date</label><select data-map-field="'+f.name+'" data-map-property="date_policy">'+options(['exact','utc'],b.date_policy||'exact')+'</select></div><div class="field"><label>Array</label><select data-map-field="'+f.name+'" data-map-property="array_policy">'+options(['order','set'],b.array_policy||'order')+'</select></div><div class="field"><label>Exact enum map (JSON object)</label><textarea data-map-field="'+f.name+'" data-map-property="enum_map">'+esc(JSON.stringify(b.enum_map||{}))+'</textarea></div></details>'];
 });
 return heading('Target mapping','Read the target’s actual schema, select original external keys and save every field binding as a mapping edition.',btn('Initialize or inspect SQLite target','describe-target','',true)+btn('Import target schema','import-schema'))+stats([[m.version,'Mapping edition'],[m.target_product||'Choose target','Receiving product'],[p.contract.entities.length,'Entities'],[p.contract.entities.reduce((n,e)=>n+e.fields.length,0),'Canonical fields']])+panel('Native field bindings','<div class="fields"><div class="field"><label for="mapping-entity">Canonical entity</label><select id="mapping-entity">'+options(p.contract.entities.map(e=>e.name),mappingEntity)+'</select></div><div class="field"><label for="mapping-table">Actual native table</label><select id="mapping-table">'+options([{value:'',label:'Select native table'},...(m.target_schema?.tables||[]).map(t=>({value:t.table,label:t.table}))],e.native_table||'')+'</select></div></div><p class="small muted">External key: '+esc(e.native_external_key||'Select the target table')+' · Environment: '+esc(m.target_environment_id||'Choose a receiving environment')+'</p><div class="mapping-table">'+table(['Canonical field','Native field','Blank value','Conversion'],rows)+'</div><div class="toolbar">'+btn('Download complete mapping','download-mapping')+btn('Save mapping edition','save-mapping','',true)+'</div>');
}
function currentRun(){return state.project.runs.find(r=>r.request_id===selectedRun)||state.project.runs.at(-1);}
function receivingScreen(){
 const p=state.project,run=currentRun(),summary=run?.reconciliation,jobs=state.jobs||[],active=jobs.find(j=>j.status==='running');
 const runList=table(['Prepared','Saved request','Source revision','State',''],[...p.runs].reverse().map(r=>[esc(date(r.prepared_at)),'<span class="mono small">'+esc(r.request_id)+'</span>',esc(r.project_revision),'<span class="badge">'+esc(r.status)+'</span>',btn('Open','select-run','data-id="'+encode(r.request_id)+'"')]));
 let content='';
 if(run){content=panel('Selected receiving request','<p class="mono small">'+esc(run.request_id)+'</p><p>Source revision '+esc(run.project_revision)+' · mapping edition '+esc(run.mapping_version)+' · '+Number(run.request_bytes).toLocaleString()+' request bytes</p>'+(active?'<p class="notice">'+esc(active.phase)+'</p>':'')+(run.native_error?'<p class="notice">'+esc(run.native_error.message)+'</p>':'')+'<div class="actions">'+btn(run.result?'Recover original result':'Run / recover saved request','run-native',active?'disabled':'',true)+btn('Read current target','extract-target',active?'disabled':'')+btn('Import target return','import-return')+btn('Download original request','download-request')+'</div>');
 if(summary)content+=stats([[summary.counts.matched_records+'/'+summary.counts.expected_records,'Records matched'],[summary.counts.matched_fields,'Mapped fields matched'],[summary.counts.assets,'Complete assets matched'],[summary.differences.length,'Differences to review']])+panel('Returned-record comparison',summary.differences.length?table(['Kind','Record / path','Field','Source value','Returned value',''],summary.differences.map(d=>[esc(human(d.kind)),esc(d.key||d.path||d.entity||''),esc(d.field||''),esc(compact(d.expected)),esc(compact(d.actual)),btn('Review','review-difference','data-id="'+encode(d.id)+'"')])):'<p>All selected records, mapped values, complete assets and original relationships match this target return.</p>')+(run.decisions.length?panel('Saved difference decisions',table(['Difference','Action','Reason','Reviewer'],run.decisions.map(d=>[esc(d.difference_id),esc(d.choice),esc(d.reason),esc(d.reviewer)]))):'');
 }
 return heading('Receiving','Save a complete request, receive it into the target, and compare the actual returned records and original assets.',btn('Prepare receiving request','prepare-receiving','',true))+content+panel('Saved requests',runList);
}
function handoverScreen(){
 const p=state.project,r=state.report;
 return heading('Handover','Export the complete editable project, application source, original files, target returns and saved review decisions.')+stats([[p.source_files.length,'Original source files'],[p.assets.length,'Document assets'],[p.runs.length,'Receiving requests'],[p.revision,'Saved project revision']])+panel('Download and reopen','<div class="download-list">'+btn('Complete application handover','download-handover','',true)+btn('Portable receiving utility','download-receiver')+btn('Saved project','download-project')+btn('Reopen saved project','reopen-project')+'</div><p>Download the complete handover and portable receiving utility. In a clean directory, run:</p><pre>node receive-handover.mjs --input accreditation-handover.json --output received\nnode received/application/cli.mjs serve --workspace received</pre><p class="muted">The receiving utility restores every included file. The application reopens the same source editions, mapping, original requests, returned data and saved decisions.</p>')+panel('Project contents',table(['Entity','Records','Fields'],p.contract.entities.map(e=>[esc(human(e.name)),p.records[e.name].length,e.fields.length])))+panel('Saved work history','<ul class="history">'+[...p.history].reverse().slice(0,60).map(h=>'<li><strong>Revision '+esc(h.revision)+' · '+esc(human(h.action))+'</strong><time>'+esc(date(h.at))+'</time>'+esc(h.reason||h.message||'')+'</li>').join('')+'</ul>');
}
function render(){
 if(!state)return;
 $('navigation').innerHTML=views.map(([key,title])=>'<button type="button" data-cmd="view" data-view="'+key+'" aria-current="'+(view===key?'page':'false')+'">'+esc(title)+'</button>').join('');
 $('project-label').textContent=state.project.title+' · '+state.project.project_id;
 $('save-state').textContent='Saved revision '+state.project.revision+' · '+date(state.project.updated_at);
 const screens={sources:sourceScreen,accounts:accountScreen,accreditations:accreditationScreen,assessments:assessmentScreen,billing:billingScreen,mapping:mappingScreen,receiving:receivingScreen,handover:handoverScreen};
 area.innerHTML=screens[view]();
}
function fieldEditor(f,value){
 const id='field-'+f.name,required=f.required?' <span class="required">(required)</span>':'';
 let input;
 if(f.type==='array'||f.type==='object')input='<textarea id="'+id+'" data-field="'+f.name+'" rows="3">'+esc(value===null?'':JSON.stringify(value,null,2))+'</textarea>';
 else if(f.type==='boolean')input='<select id="'+id+'" data-field="'+f.name+'">'+options([{value:'true',label:'True'},{value:'false',label:'False'}],String(value))+'</select>';
 else if(f.type==='enum'&&f.meaning.includes(' | '))input='<select id="'+id+'" data-field="'+f.name+'">'+options([{value:'',label:'Empty'},...f.meaning.split(' | ')],value||'')+'</select>';
 else input='<input id="'+id+'" data-field="'+f.name+'" value="'+esc(value??'')+'"'+(f.type==='date'?' type="date"':f.type==='month'?' type="month"':'')+'>';
 return '<div class="field'+(['array','object'].includes(f.type)?' wide':'')+'"><label for="'+id+'">'+esc(human(f.name))+required+'</label>'+input+'<small>'+esc(f.meaning)+'</small></div>';
}
function openRecord(name,key){
 const p=state.project,row=key?p.records[name].find(r=>keyOf(p,name,r)===key):blankRecord(p,name);if(!row)throw new Error('The original record is absent from this revision.');
 editRevision=p.revision;editEntity=name;editKey=key||null;editOriginal=structuredClone(row);
 modal((key?'Edit ':'New ')+human(name).toLowerCase(),'<form id="record-form"><div class="fields">'+definition(p,name).fields.filter(f=>name!=='document'||f.name!=='content_control_map').map(f=>fieldEditor(f,row[f.name])).join('')+'</div><div class="field"><label for="record-reason">Reason for this saved change</label><input id="record-reason" value="'+(key?'Operator correction':'Receive original record')+'"></div><div class="toolbar"><button type="submit" class="primary">Save record</button></div></form>'+(key&&p.provenance[name]?.[key]?'<details><summary>Original field provenance</summary><pre>'+esc(pretty(p.provenance[name][key]))+'</pre></details>':'')+(name==='document'&&row.content_control_map?'<section class="panel"><h3>Original Word form</h3><p>'+esc(pretty(row.content_control_map.counts))+'</p><div class="actions">'+btn('Download complete form map','download-form-map','data-key="'+encode(key)+'"')+btn('Fill original template','fill-document','data-key="'+encode(key)+'"',true)+'</div></section>':''));
}
function documentForm(){editRevision=state.project.revision;modal('Add original document','<form id="document-form"><div class="fields"><div class="field wide"><label for="document-file">Complete original file</label><input id="document-file" type="file" required></div>'+[['document-edition','Existing source edition ID, if attaching an original',''],['document-key','Logical document key',''],['document-role','Document role','application'],['document-source','Source URL or URN',''],['document-source-id','Original source ID',''],['document-template','Template edition','']].map(([id,label,value])=>'<div class="field"><label for="'+id+'">'+esc(label)+'</label><input id="'+id+'" value="'+esc(value)+'"></div>').join('')+'<div class="field"><label for="document-visibility">Access class</label><select id="document-visibility">'+options(['client_private','assessor_private','internal','public'],'client_private')+'</select></div><div class="field"><label for="document-accreditation">Accreditation association</label><select id="document-accreditation">'+options([{value:'',label:'No association'},...state.project.records.accreditation.map(a=>({value:a.issuer_programme_id,label:a.accreditation_number+' · '+a.standard_edition}))],'')+'</select></div></div><div class="toolbar"><button class="primary" type="submit">Receive complete original</button></div></form>');}

function selectedFormLocation(){return formDraft.locations.find(x=>x.id===$('fill-location').value);}
function fillSourceValue(){
 const entity=$('fill-source-entity')?.value,key=$('fill-source-record')?.value,field=$('fill-source-field')?.value;
 return state.project.records[entity]?.find(r=>keyOf(state.project,entity,r)===key)?.[field];
}
function renderFillSource(){
 const e=$('fill-source-entity').value,rows=state.project.records[e],field=definition(state.project,e).fields[0]?.name;
 $('fill-source-record').innerHTML=options(rows.map(r=>({value:keyOf(state.project,e,r),label:compact(r.display_name||r.published_label||r.accreditation_number||r[field]||keyOf(state.project,e,r)).slice(0,150)})),rows.length?keyOf(state.project,e,rows[0]):'');
 $('fill-source-field').innerHTML=options(definition(state.project,e).fields.map(f=>({value:f.name,label:human(f.name)+' · '+f.type})),field);
 $('fill-source-preview').textContent=pretty(fillSourceValue()).slice(0,3000);
}
function renderFillValue(){
 const location=selectedFormLocation(),mode=$('fill-value-kind').value,body=$('fill-value');
 $('fill-original-text').textContent=location.text;
 $('fill-original-location').textContent=location.part+' · '+location.locator;
 if(mode==='source'){
  body.innerHTML='<div class="fields"><div class="field"><label for="fill-source-entity">Saved source entity</label><select id="fill-source-entity">'+options(state.project.contract.entities.map(e=>e.name),'issuer_account')+'</select></div><div class="field"><label for="fill-source-record">Original source record</label><select id="fill-source-record"></select></div><div class="field"><label for="fill-source-field">Canonical source field</label><select id="fill-source-field"></select></div><div class="field"><label for="fill-source-blank">Empty source field</label><select id="fill-source-blank">'+options([{value:'reject',label:'Require an original value'},{value:'clear',label:'Use an explicit empty value'}],'reject')+'</select></div></div><pre id="fill-source-preview" class="source-value-preview"></pre>';renderFillSource();
 }else if(mode==='choice'){
  body.innerHTML='<div class="field"><label for="fill-choice">Original native choice</label><select id="fill-choice">'+options(location.choices.map(c=>({value:c.value,label:c.label})),location.choices[0]?.value)+'</select></div>';
 }else body.innerHTML='<div class="field"><label for="fill-text">Exact replacement text</label><textarea id="fill-text" rows="4">'+esc(location.text)+'</textarea></div>';
}
function selectFillLocation(){
 const location=selectedFormLocation();
 $('fill-value-kind').innerHTML=options([{value:'literal',label:'Explicit text'},{value:'source',label:'Saved source field'},...location.choices.length?[{value:'choice',label:'Original native choice'}]:[]],location.choices.length?'choice':'literal');renderFillValue();
}
function renderFillRows(){
 $('fill-rows').innerHTML=table(['Original location','Selected replacement',''],formDraft.bindings.map((b,i)=>{const location=formDraft.locations.find(l=>l.part===b.part&&l.locator===b.locator);return [esc(location.kind+' · '+location.label.slice(0,150)),esc(b.source?human(b.source.entity)+' / '+b.source.external_key+' / '+human(b.source.field):b.choice_value??b.text),btn('Remove','remove-fill-binding','data-index="'+i+'"')];}));
}
function openFill(key){
 const doc=state.project.records.document.find(d=>keyOf(state.project,'document',d)===key);if(!doc?.content_control_map)throw new Error('Read the original form controls first.');
 const locations=formLocations(doc.content_control_map);if(!locations.length)throw new Error('This original form contains no extracted editable locations.');
 formDraft={document_key:key,revision:state.project.revision,locations,bindings:[]};
 modal('Fill original template','<p>'+esc(doc.display_name)+' · '+esc(doc.template_edition||doc.original_filename)+'</p><p class="muted">Select the original control or field when it contains the value. Each saved selection keeps its original text, document edition and source record.</p><div class="field"><label for="fill-location">Original Word location</label><select id="fill-location">'+options(locations.map(l=>({value:l.id,label:human(l.kind)+' · '+l.label.slice(0,150)+' · '+l.locator})),locations[0].id)+'</select></div><p id="fill-original-location" class="small mono"></p><details open><summary>Original visible text</summary><pre id="fill-original-text" class="source-value-preview"></pre></details><div class="field"><label for="fill-value-kind">Replacement source</label><select id="fill-value-kind"></select></div><div id="fill-value"></div><div class="toolbar">'+btn('Add this field selection','add-fill-binding')+'</div><h3>Saved field selections</h3><div id="fill-rows"></div><div class="toolbar">'+btn('Create filled document','apply-fill','',true)+'</div>');
 selectFillLocation();renderFillRows();
}
function appendFillBinding(){
 const location=selectedFormLocation(),kind=$('fill-value-kind').value,binding={part:location.part,locator:location.locator,mode:kind==='choice'||kind==='source'&&location.choices.length?'choice':'text'};
 if(kind==='source'){
  const entity=$('fill-source-entity').value,external_key=$('fill-source-record').value,field=$('fill-source-field').value;if(!external_key)throw new Error('This entity has no saved original record. Choose another source.');
  binding.source={entity,external_key,field};binding.blank_policy=$('fill-source-blank').value;
 }else if(kind==='choice')binding.choice_value=$('fill-choice').value;
 else binding.text=$('fill-text').value;
 const i=formDraft.bindings.findIndex(b=>b.part===binding.part&&b.locator===binding.locator);if(i<0)formDraft.bindings.push(binding);else formDraft.bindings[i]=binding;renderFillRows();
}

function importForm(name){importDraft={entity:name||'issuer_account',revision:state.project.revision,preview:null,content:null,filename:null};modal('Import original CSV','<div class="fields"><div class="field"><label for="import-entity">Canonical entity</label><select id="import-entity">'+options(state.project.contract.entities.map(e=>e.name),importDraft.entity)+'</select></div><div class="field"><label for="import-file">Original UTF-8 CSV</label><input id="import-file" type="file" accept=".csv,.txt"></div><div class="field"><label for="import-source-url">Original source URL or URN</label><input id="import-source-url" placeholder="Uses a received-file URN when empty"></div><div class="field"><label for="import-source-id">Original source ID</label><input id="import-source-id"></div></div><div id="import-map"></div><div id="import-preview"></div><div class="toolbar">'+btn('Preview mapped records','preview-import')+btn('Import complete source','save-import','disabled',true)+'</div>');}
function renderImportMap(){
 if(!importDraft?.content)return;
 const columns=state.project.contract.entities.find(e=>e.name===importDraft.entity).fields;
 $('import-map').innerHTML=table(['Canonical field','Original column','Constant value','Blank cell'],columns.map(f=>[esc(human(f.name))+(f.required?' *':''),'<select data-import-field="'+f.name+'" data-import-property="source_column">'+options([{value:'',label:'No column'},...importDraft.columns.map(c=>({value:c,label:c}))],importDraft.columns.includes(f.name)?f.name:'')+'</select>','<input data-import-field="'+f.name+'" data-import-property="constant" placeholder="Optional constant" aria-label="'+esc(human(f.name))+' constant">','<select data-import-field="'+f.name+'" data-import-property="blank_policy">'+options(['preserve','clear','reject'],'preserve')+'</select>']));
}
function importInput(){
 if(!importDraft?.content)throw new Error('Choose the complete original CSV first.');const fields=[];
 for(const f of definition(state.project,importDraft.entity).fields){const col=$('import-map').querySelector('[data-import-field="'+f.name+'"][data-import-property="source_column"]').value,constant=$('import-map').querySelector('[data-import-field="'+f.name+'"][data-import-property="constant"]').value,blank=$('import-map').querySelector('[data-import-field="'+f.name+'"][data-import-property="blank_policy"]').value;if(col||constant!=='')fields.push({field:f.name,...constant!==''?{constant}:{source_column:col},blank_policy:blank});}
 return {entity:importDraft.entity,content:importDraft.content,filename:importDraft.filename,source_url:$('import-source-url').value||undefined,source_id:$('import-source-id').value||undefined,fields};
}
async function previewCSV(){const input=importInput(),preview=await api('/api/import/preview',input);importDraft.preview=preview;importDraft.preview_input=JSON.stringify(input);$('import-preview').innerHTML='<h3>Complete source preview</h3><p>'+preview.rows.length+' mapped records · '+preview.issues.length+' field issues</p>'+(preview.issues.length?table(['Row','Field','Issue'],preview.issues.map(i=>[esc(i.row),esc(i.field),esc(i.message)])):table(['Original row','Key','Change'],preview.rows.slice(0,20).map(r=>[r.row,esc(r.key),r.before?'Update existing original key':'New original key'])));dialog.querySelector('[data-cmd="save-import"]').disabled=preview.issues.length>0;}
function collectMapping(){
 const m=structuredClone(mappingDraft||state.project.mapping),e=m.entities.find(e=>e.canonical_entity===mappingEntity);e.native_table=$('mapping-table').value||null;const native=m.target_schema?.tables.find(t=>t.table===e.native_table);e.native_external_key=native?.external_key_field||null;
 e.field_overrides=definition(state.project,mappingEntity).fields.map(f=>{const get=property=>area.querySelector('[data-map-field="'+f.name+'"][data-map-property="'+property+'"]').value;return {canonical_field:f.name,native_field:get('native_field')||null,blank_policy:get('blank_policy'),unit_factor:get('unit_factor')||'1',date_policy:get('date_policy'),array_policy:get('array_policy'),enum_map:JSON.parse(get('enum_map')||'{}')};});return m;
}
function collectFees(){
 area.querySelectorAll('[data-fee-field]').forEach(input=>{const l=feeDraft.lines[Number(input.dataset.index)],field=input.dataset.feeField;l[field]=input.value;if(field==='tariff_key')l.profile_id=input.value.split(':')[0];});
 feeDraft.rounding.mode=$('fee-rounding').value;feeDraft.rounding.scope=$('fee-scope').value;feeDraft.rounding.decimal_places=Number($('fee-places').value);feeDraft.tax=$('fee-tax').value?{rate:$('fee-tax').value}:null;
}
async function handle(cmd,el){
 if(cmd==='view'){view=el.dataset.view;if(view==='mapping'&&!mappingDraft){mappingDraft=structuredClone(state.project.mapping);mappingBaseRevision=state.project.revision;}entity=groups[view]?.[0]||entity;page=0;query='';render();return;}
 if(cmd==='entity-tab'){entity=el.dataset.entity;page=0;query='';render();return;}
 if(cmd==='page-prev'||cmd==='page-next'){page+=cmd==='page-next'?1:-1;render();return;}
 if(cmd==='new-record'||cmd==='edit-record'){openRecord(el.dataset.entity,el.dataset.key?decodeURIComponent(el.dataset.key):null);return;}
 if(cmd==='import-csv'){importForm(el.dataset.entity);return;}
 if(cmd==='add-document'){documentForm();return;}
 if(cmd==='select-edition'){await action({type:'select_edition',source_edition_id:decodeURIComponent(el.dataset.id)});notice('Selected source edition saved.');return;}
 if(cmd==='download-source'){const f=state.project.source_files.find(f=>f.id===decodeURIComponent(el.dataset.id));await download('/api/export/source?id='+el.dataset.id,f.path.split('/').pop());return;}
 if(cmd==='download-document'){const d=state.project.records.document.find(d=>keyOf(state.project,'document',d)===decodeURIComponent(el.dataset.key));await download('/api/export/asset?path='+encodeURIComponent(d.asset_path),d.original_filename);return;}
 if(cmd==='read-controls'){const result=await api('/api/document/controls',{document_key:decodeURIComponent(el.dataset.key),expected_revision:state.project.revision});state.project=result.project;state.report=report(result.project);render();openRecord('document',decodeURIComponent(el.dataset.key));notice('Original form controls and tables saved.');return;}
 if(cmd==='download-form-map'){const doc=state.project.records.document.find(d=>keyOf(state.project,'document',d)===decodeURIComponent(el.dataset.key));saveJSON(doc.content_control_map,doc.original_filename+'.form-map.json');return;}
 if(cmd==='fill-document'){openFill(decodeURIComponent(el.dataset.key));return;}
 if(cmd==='add-fill-binding'){appendFillBinding();return;}
 if(cmd==='remove-fill-binding'){formDraft.bindings.splice(Number(el.dataset.index),1);renderFillRows();return;}
 if(cmd==='apply-fill'){
  if(!formDraft.bindings.length)throw new Error('Add the original field selections first.');
  const result=await api('/api/document/fill',{document_key:formDraft.document_key,expected_revision:formDraft.revision,bindings:formDraft.bindings});
  state.project=result.project;state.report=report(result.project);close();view='assessments';entity='document';render();notice('Filled document and original source selections saved. Use Original to download the new edition.');return;
 }
 if(cmd==='preview-import'){await previewCSV();return;}
 if(cmd==='save-import'){const input=importInput();if(importDraft.preview_input!==JSON.stringify(input))throw new Error('Preview the changed mapping before receiving it.');const d=await action({type:'import_csv',...input},importDraft.revision);close();notice(d.records+' original records received into the saved project.');return;}
 if(cmd==='describe-target'){const r=await api('/api/target/describe',{expected_revision:state.project.revision});state.project=r.project;state.report=report(r.project);mappingDraft=structuredClone(r.project.mapping);mappingBaseRevision=r.project.revision;mappingDirty=false;render();notice('Actual target tables and field bindings saved.');return;}
 if(cmd==='import-schema'){const file=await chooseFile('.json');if(file){const schema=JSON.parse(await file.text());await action({type:'bind_target',schema});mappingDraft=structuredClone(state.project.mapping);mappingBaseRevision=state.project.revision;mappingDirty=false;render();notice('Received target schema and mapping edition saved.');}return;}
 if(cmd==='save-mapping'){await action({type:'save_mapping',mapping:collectMapping()},mappingBaseRevision);mappingDraft=structuredClone(state.project.mapping);mappingBaseRevision=state.project.revision;mappingDirty=false;render();notice('Complete mapping edition saved.');return;}
 if(cmd==='download-mapping'){saveJSON(state.project.mapping,'target-mapping.json');return;}
 if(cmd==='add-fee'){collectFees();feeDraft.lines.push({line_id:'line-'+crypto.randomUUID(),profile_id:'AS14-2026-07',tariff_key:'AS14-2026-07:assessment-work',quantity:'1',billing_account_key:'calculation',billing_period:'2026/27',invoice_key:'calculation'});render();return;}
 if(cmd==='remove-fee'){collectFees();feeDraft.lines.splice(Number(el.dataset.index),1);render();return;}
 if(cmd==='calculate-fees'){collectFees();await action({type:'fee_calculation',input:feeDraft});notice('Exact fee calculation and allocation saved.');return;}
 if(cmd==='prepare-receiving'){const run=await action({type:'prepare_receiving'});selectedRun=run.request_id;render();notice('Complete original request saved.');return;}
 if(cmd==='select-run'){selectedRun=decodeURIComponent(el.dataset.id);render();return;}
 if(cmd==='run-native'){const run=currentRun();const r=await api('/api/receiving/run',{expected_revision:state.project.revision,request_id:run.request_id});state.project=r.project;state.report=report(r.project);state.jobs=[r.job];render();return;}
 if(cmd==='extract-target'){const r=await api('/api/target/extract',{request_id:currentRun().request_id});state.project=r.project;state.report=report(r.project);render();notice('Complete current target extract compared and saved.');return;}
 if(cmd==='import-return'){const file=await chooseFile('.json');if(file){await action({type:'receive_result',request_id:currentRun().request_id,result:JSON.parse(await file.text())});notice('Actual target return and complete comparison saved.');}return;}
 if(cmd==='download-request'){const r=currentRun();saveBlob(new Blob([r.request_text],{type:'application/json'}),r.request_id+'.json');return;}
 if(cmd==='review-difference'){
 const run=currentRun(),d=run.reconciliation.differences.find(d=>d.id===decodeURIComponent(el.dataset.id));editRevision=state.project.revision;
 modal('Review returned difference','<form id="difference-form" data-id="'+encode(d.id)+'" data-request="'+encode(run.request_id)+'"><p>'+esc(human(d.kind))+' · '+esc(d.key||d.path||'')+'</p><div class="comparison"><div><strong>Original selected value</strong><pre>'+esc(pretty(d.expected))+'</pre></div><div><strong>Returned value</strong><pre>'+esc(pretty(d.actual))+'</pre></div></div><div class="field"><label for="difference-choice">Review action</label><select id="difference-choice">'+options(state.project.receiving_contract.difference_review.choices,'keep difference visible')+'</select></div><div class="field"><label for="difference-reason">Concrete reason / correction</label><textarea id="difference-reason" required></textarea></div><div class="field"><label for="difference-reviewer">Reviewer</label><input id="difference-reviewer" required></div><div class="toolbar"><button class="primary" type="submit">Save review decision</button></div></form>');return;
 }
 if(cmd==='download-project'){await download('/api/export/project','accreditation-project.json');return;}
 if(cmd==='download-handover'){await download('/api/export/handover','accreditation-handover.json');notice('Complete application handover downloaded.');return;}
 if(cmd==='download-receiver'){const res=await fetch('./receive-handover.mjs');if(!res.ok)throw new Error('The portable receiving utility is unavailable.');saveBlob(await res.blob(),'receive-handover.mjs');return;}
 if(cmd==='reopen-project'){const file=await chooseFile('.json');if(file){const r=await api('/api/project/reopen',{expected_revision:state.project.revision,project:JSON.parse(await file.text())});state.project=r.project;state.report=report(r.project);render();notice('Complete saved project reopened.');}return;}
}
document.addEventListener('click',async event=>{const button=event.target.closest('[data-cmd]');if(!button||busy||button.disabled)return;const local=button.dataset.cmd;busy=true;button.disabled=true;try{await handle(local,button);}catch(error){errorMessage(error);}finally{busy=false;if(button.isConnected)button.disabled=false;}});
$('close-editor').addEventListener('click',close);
document.addEventListener('submit',async event=>{
 if(!['record-form','document-form','difference-form'].includes(event.target.id))return;event.preventDefault();if(busy)return;busy=true;const submit=event.target.querySelector('[type=submit]');submit.disabled=true;
 try{
 if(event.target.id==='record-form'){const value=editOriginal?structuredClone(editOriginal):blankRecord(state.project,editEntity);for(const f of definition(state.project,editEntity).fields){if(editEntity==='document'&&f.name==='content_control_map')continue;const raw=$('field-'+f.name).value;value[f.name]=typedCell(f,raw);}const issues=validateRecord(state.project,editEntity,value);if(issues.length){const e=new Error('Review the original field values.');e.details={issues};throw e;}await action({type:'save_record',entity:editEntity,record:value,old_key:editKey,reason:$('record-reason').value},editRevision);close();notice('Record and change history saved.');}
 else if(event.target.id==='document-form'){const file=$('document-file').files[0];if(!file)throw new Error('Choose the complete original document.');const input={type:'add_asset',filename:file.name,media_type:file.type||'application/octet-stream',base64:base64FromBytes(new Uint8Array(await file.arrayBuffer())),document_key:$('document-key').value||file.name,document_edition_id:$('document-edition').value||undefined,document_role:$('document-role').value,source_url:$('document-source').value||undefined,source_id:$('document-source-id').value||undefined,template_edition:$('document-template').value||null,visibility:$('document-visibility').value,accreditation_key:$('document-accreditation').value||null};await action(input,editRevision);close();notice('Complete original document and edition saved.');}
 else {await action({type:'review_difference',request_id:decodeURIComponent(event.target.dataset.request),difference_id:decodeURIComponent(event.target.dataset.id),choice:$('difference-choice').value,reason:$('difference-reason').value,reviewer:$('difference-reviewer').value},editRevision);close();notice('Difference review saved with its source and returned values.');}
 }catch(error){errorMessage(error);}finally{busy=false;if(submit.isConnected)submit.disabled=false;}
});
document.addEventListener('input',event=>{
 if(event.target.id==='record-filter'){query=event.target.value;page=0;const caret=event.target.selectionStart;render();const input=$('record-filter');input?.focus();input?.setSelectionRange(caret,caret);}
 if(event.target.matches('[data-fee-field]')||['fee-tax','fee-rounding','fee-scope','fee-places'].includes(event.target.id))collectFees();
 if(event.target.matches('[data-map-field]'))mappingDirty=true;
 if(event.target.matches('[data-import-field]')&&importDraft){importDraft.preview=null;const b=dialog.querySelector('[data-cmd="save-import"]');if(b)b.disabled=true;}
});
document.addEventListener('change',async event=>{
 try{
 if(event.target.id==='fill-location')selectFillLocation();
 if(event.target.id==='fill-value-kind')renderFillValue();
 if(event.target.id==='fill-source-entity')renderFillSource();
 if(event.target.id==='fill-source-record'||event.target.id==='fill-source-field')$('fill-source-preview').textContent=pretty(fillSourceValue()).slice(0,3000);
 if(event.target.id==='import-file'){const file=event.target.files[0];if(file){importDraft.content=utf8Text(new Uint8Array(await file.arrayBuffer()));importDraft.filename=file.name;importDraft.columns=parseCSV(importDraft.content).columns;renderImportMap();}}
 if(event.target.id==='import-entity'){importDraft.entity=event.target.value;renderImportMap();}
 if(event.target.id==='mapping-entity'){mappingDraft=collectMapping();mappingEntity=event.target.value;render();}
 if(event.target.id==='mapping-table'){mappingDraft=collectMapping();mappingDirty=true;const m=mappingDraft,e=m.entities.find(e=>e.canonical_entity===mappingEntity);e.native_table=event.target.value||null;const native=m.target_schema?.tables.find(t=>t.table===e.native_table);e.native_external_key=native?.external_key_field||null;e.field_overrides=definition(state.project,mappingEntity).fields.map(f=>({canonical_field:f.name,native_field:native?.columns.find(c=>c.canonical===f.name||c.name===f.name)?.name||null,blank_policy:'preserve',date_policy:'exact',array_policy:'order'}));render();}
 }catch(error){errorMessage(error);}
});
async function refresh(){if(busy||dialog.open||mappingDirty||document.activeElement?.matches('input,select,textarea'))return;try{const next=await api('/api/state');const changed=next.project.integrity.sha256!==state?.project.integrity.sha256||JSON.stringify(next.jobs)!==JSON.stringify(state?.jobs);state=next;if(changed)render();}catch(error){$('save-state').textContent=error.message;}}
session=await fetch('/api/session').then(r=>r.json());
try{state=await api('/api/state');render();setInterval(refresh,3000);}catch(error){errorMessage(error);}
