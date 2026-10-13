(function installGovHubPlaybook(){
'use strict';
let opened=null,draft=null;
const entries=()=>state.snapshot?.govhub?.editorial?.playbooks||[];
const pk=(kind,body,key=newKey())=>`<form data-form="playbook-${esc(kind)}" data-request-key="${esc(key)}">${body}</form>`;
const picked=(form,name)=>[...form.querySelectorAll(`[name="${CSS.escape(name)}"]:checked`)].map(n=>n.value);
const fieldset=(title,body,attributes='')=>`<fieldset ${attributes}><legend>${esc(title)}</legend>${body}</fieldset>`;
const sourceOptions=()=>fileOptions('Choose original inventory JSON',f=>f.filename.toLowerCase().endsWith('.json'));
function changesTable(changes){
 const rows=changes.map(c=>[esc(c.id),esc(c.field),`<code>${esc(JSON.stringify(c.before))}</code>`,`<code>${esc(JSON.stringify(c.after))}</code>`]);
 return table(['Selected item','Field','Original','Received'],rows);
}
function taskRow(t={}){
 const source=draft?.entity_id===state.params.id?draft:opened?.playbook;
 const types=source?.definition?.content_types||[];
 let body='<div class="form-grid">';
 body+=input('Task identifier','task_id',t.id||newKey(),'text',true)+input('Task name','task_name',t.name||'','text',true);
 body+=input('Reader goal','task_goal',t.goal||'','text',true)+input('Audience','task_audience',t.audience||'');
 body+=select('Content type','task_bundle',types.map(b=>[b.bundle,b.bundle]),t.bundle||types[0]?.bundle);
 body+=input('Responsible publisher','task_owner',t.owner||'','text',true)+input('Actual route','task_route',t.route||'','text',true);
 body+=input('Native content UUID, when selected','task_entity_uuid',t.entity_uuid||'')+'</div>';
 body+='<details><summary>Existing visitor binding</summary><div class="form-grid">';
 body+=input('Retained visitor set version','task_set_version',t.visitor_set_version_id||'');
 body+=input('Original journey identifier','task_journey',t.journey_id||'')+'</div></details>';
 body+=area('Task notes','task_notes',t.notes||'')+button('Remove task from this edition','playbook-remove-task');
 return fieldset(t.name||'Visitor task',body,'data-playbook-task');
}
function editorForm(version,native,isNew=false){
 const d=version.definition,bundles=new Map(native.bundles.map(b=>[b.id,b]));
 let body=`<input type="hidden" name="inventory_file_id" value="${esc(version.inventory.id)}"><div class="form-grid">`;
 body+=(isNew?input('Playbook identifier','playbook_id',version.entity_id,'text',true):`<input type="hidden" name="playbook_id" value="${esc(version.entity_id)}">`+definition([['Playbook identifier',esc(version.entity_id)]]))+input('Playbook name','label',d.label,'text',true);
 body+=input('Responsible publisher','owner',d.owner,'text',true)+'<input type="hidden" name="environment_id" value="'+esc(d.environment_id)+'">'+definition([['Native environment',esc(recordName('environments',d.environment_id))]]);
 body+=input('Selected source reference','source_reference',d.source_reference,'text',true)+input('Source commit, when selected','source_commit',d.source_commit)+'</div>';
 body+=checks('Original cutover cohorts','cohort_plan_ids',plans().map(p=>[p.id,p.name]),d.cohort_plan_ids);
 body+=area('Original content mapping IDs, one per line','content_mapping_ids',d.content_mapping_ids.join('\n'));
 for(const t of d.content_types){
  const original=bundles.get(t.bundle),chosen=new Map(t.fields.map(f=>[f.name,f]));
  let block='<div class="form-grid">'+input('Publishing owner','bundle_owner',t.owner,'text',true);
  block+=checks('Native editor roles','editor_role',native.roles.map(r=>[r.id,r.label]),t.editor_role_ids)+'</div>';
  const rows=(original?.fields||[]).filter(f=>!f.read_only||chosen.has(f.name)).map(f=>{
   const saved=chosen.get(f.name);
   return [
    `<input type="checkbox" aria-label="Include ${esc(f.label||f.name)}" data-include-field="${esc(f.name)}"${saved?' checked':''}>`,
    `<strong>${esc(f.label||f.name)}</strong><small>${esc(f.name)} · ${esc(f.type)}${f.required?' · required':''}</small>`,
    `<textarea aria-label="Instruction for ${esc(f.name)}" data-field-instruction="${esc(f.name)}">${esc(saved?.instruction||f.description||f.label||f.name)}</textarea>`,
    `<input aria-label="Source for ${esc(f.name)}" data-field-source="${esc(f.name)}" value="${esc(saved?.source_reference||'')}"><textarea aria-label="Notes for ${esc(f.name)}" data-field-notes="${esc(f.name)}">${esc(saved?.notes||'')}</textarea>`
   ];
  });
  block+=table(['Include','Native field','Publishing instruction','Source / note'],rows)+area('Content type notes','bundle_notes',t.notes);
  body+=fieldset(original?.label||t.bundle,block,`data-playbook-bundle="${esc(t.bundle)}"`);
 }
 body+='<h2>Visitor tasks and publishing responsibilities</h2><p>Use the actual reader goal and route. Create visitor journeys saves the full task population into the existing Visitor journeys workspace. Changing a linked task’s goal, audience, route or native content clears its earlier visitor binding in this new edition.</p>';
 body+='<div data-playbook-tasks>'+d.tasks.map(taskRow).join('')+'</div>'+button('Add visitor task','playbook-add-task');
 body+=area('Playbook notes','notes',d.notes)+area('Reason for this edition','change_note',isNew?'Initial selected publishing playbook':'',true);
 body+='<button class="primary">Save complete playbook</button>';
 return pk('save',body,version.request_key||newKey());
}
function gather(form){
 const v=values(form),source=draft?.entity_id===state.params.id?draft:opened.playbook;
 const def={label:v.label,owner:v.owner,environment_id:v.environment_id,source_reference:v.source_reference,
  source_commit:v.source_commit,notes:v.notes,cohort_plan_ids:picked(form,'cohort_plan_ids'),
  content_mapping_ids:v.content_mapping_ids.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),content_types:[],tasks:[]};
 for(const b of form.querySelectorAll('[data-playbook-bundle]')){
  const chosen=[...b.querySelectorAll('[data-include-field]:checked')].map(n=>n.dataset.includeField);
  def.content_types.push({bundle:b.dataset.playbookBundle,owner:b.querySelector('[name=bundle_owner]').value,
   editor_role_ids:picked(b,'editor_role'),notes:b.querySelector('[name=bundle_notes]').value,
   fields:chosen.map(name=>({name,instruction:b.querySelector(`[data-field-instruction="${CSS.escape(name)}"]`).value,
    source_reference:b.querySelector(`[data-field-source="${CSS.escape(name)}"]`).value,
    notes:b.querySelector(`[data-field-notes="${CSS.escape(name)}"]`).value}))});
 }
 for(const t of form.querySelectorAll('[data-playbook-task]')){
  const val=name=>t.querySelector(`[name="${name}"]`).value;
  def.tasks.push({id:val('task_id'),name:val('task_name'),goal:val('task_goal'),audience:val('task_audience'),
   owner:val('task_owner'),bundle:val('task_bundle'),route:val('task_route'),entity_uuid:val('task_entity_uuid'),
   visitor_set_version_id:val('task_set_version'),journey_id:val('task_journey'),notes:val('task_notes')});
 }
 return {playbook_id:v.playbook_id,inventory_file_id:v.inventory_file_id,definition:def,
  expected_revision:source.revision,change_note:v.change_note,request_key:form.dataset.requestKey};
}
function receivingForm(previous=null){
 const p=opened.playbook,d=p.definition;
 const inventoryChoices=new Map(sourceOptions().map(x=>[x[0],x]));
 if(previous&&!inventoryChoices.has(previous.inventory.id))inventoryChoices.set(previous.inventory.id,[previous.inventory.id,previous.inventory.filename]);
 const opsAvailable=(gov().operations||[]).filter(o=>o.environment_id===d.environment_id);
 const setVersions=p.bindings.visitor_sets||[];
 const visitor=(gov().visitor?.editions||[]).filter(e=>setVersions.some(s=>s.entity_id===e.set_id&&s.revision===e.set_revision));
 let body=previous?'<p data-receiving-context>Continuing the '+esc(previous.role)+' observation from '+esc(date(previous.created_at))+'. Saving preserves it and adds the next receiving observation.</p>':'<p data-receiving-context>Record a new observation of this release or restore.</p>';
 body+='<input type="hidden" name="continued_from" value="'+esc(previous?.id||'')+'">';
 body+='<div class="form-grid">'+select('Observation','role',['BASELINE','CANDIDATE','RESTORED'],previous?.role||'CANDIDATE');
 body+=select('Received original inventory','inventory_file_id',[...inventoryChoices.values()],previous?.inventory.id||'')+'</div>'+button('Compare received structure','playbook-compare');
 body+='<div id="playbook-structure">'+(previous?(previous.changes.length?changesTable(previous.changes):'<p>The selected native field, role, workflow and route definitions match.</p>'):empty('Choose the received inventory and compare its actual content model.'))+'</div>';
 const operationChoices=new Map(opsAvailable.map(o=>[o.id,[o.id,o.type+' · '+o.state+' · '+short(o.id)]]));
 for(const o of previous?.operations||[])if(!operationChoices.has(o.id))operationChoices.set(o.id,[o.id,o.type+' · '+o.state+' · '+short(o.id)]);
 const visitorChoices=new Map(visitor.map(e=>[e.id,[e.id,e.label+' · '+e.role+' · '+date(e.created_at)]]));
 for(const id of previous?.visitor_edition_ids||[])if(!visitorChoices.has(id))visitorChoices.set(id,[id,'Original observed edition · '+short(id)]);
 body+=checks('Original native operations','operation_ids',[...operationChoices.values()],previous?.operations.map(o=>o.id)||[]);
 body+=checks('Observed visitor editions','visitor_edition_ids',[...visitorChoices.values()],previous?.visitor_edition_ids||[]);
 for(const b of d.content_types){
  const saved=previous?.editors.find(e=>e.bundle===b.bundle),files=new Map(fileOptions('').filter(x=>x[0]).map(x=>[x[0],x]));
  for(const f of saved?.files||[])if(!files.has(f.id))files.set(f.id,[f.id,f.filename]);
  const selected=new Set((saved?.files||[]).map(f=>f.id));
  let block='<p>Responsible publisher: '+esc(b.owner)+'</p><div class="form-grid">';
  block+=select('Observed outcome','editor_decision',['PENDING','ACCEPT','RETURN'],saved?.decision||'PENDING');
  block+='<label>Original editor sources, if retained<select name="editor_file_ids" multiple size="4">'+[...files.values()].map(([id,label])=>'<option value="'+esc(id)+'"'+(selected.has(id)?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label></div>';
  block+=area('Actual editor outcome and correction','editor_reason',saved?.reason||'');
  body+=fieldset('Editor receiving · '+b.bundle,block,'data-playbook-editor="'+esc(b.bundle)+'"');
 }
 body+='<label class="check"><input type="checkbox" name="accept_changes"'+(previous?.accept_changes?' checked':'')+'>Accept the displayed structural changes for this observation</label>';
 body+=area('Reason for accepting structural changes','change_reason',previous?.change_reason||'')+area('Receiving note','reason',previous?.reason||'',true);
 body+='<button class="primary">Save editorial and visitor receiving</button>';
 return pk('receiving',body);
}
function receivingHistory(){
 if(!opened.receiving.length)return empty('No receiving observation has been saved.');
 return opened.receiving.map(r=>{
  let block=`<details class="playbook-observation"><summary>${esc(r.role)} · ${esc(r.summary.state)} · ${esc(date(r.created_at))}</summary><p>${esc(r.reason)}</p>`;
  block+=table(['Native operation','Observed state','Completed'],r.operations.map(o=>[link(o.type,'operation',{id:o.id}),esc(o.state),esc(date(o.actual_finished_at))]));
  block+=table(['Editor content type','Outcome','Recorded observation'],r.editors.map(e=>[esc(e.bundle),badge(e.decision),esc(e.reason)]));
  block+=table(['Visitor task','Outcome','Original edition','Receiving match'],r.visitor_tasks.map(t=>[esc(t.name),badge(t.status),t.edition_id?link('Open capture','visitor-edition',{id:t.edition_id}):'Pending',esc(t.binding?.message||(t.review?.decision==='RETURN'?'The visitor review returns this edition.':t.binding?.matched?'Selected task and receiving site match.':''))]));
  return block+changesTable(r.changes)+'<p>'+esc(r.change_reason)+'</p><button type="button" data-action="playbook-continue-receiving" data-receiving-id="'+esc(r.id)+'">Continue this observation</button></details>';
 }).join('');
}
async function renderPlaybook(){
 if(state.view==='playbooks'){
  let out=heading('Publishing playbooks','Connect native content fields, publishing responsibilities and reader tasks to each reviewed release.');
  const rows=entries().map(p=>[link(p.label,'playbook',{id:p.id}),esc(p.revision),esc(p.content_types),esc(p.tasks),
    badge(p.review?.decision||'Unreviewed'),esc(p.receiving.at(-1)?.summary.state||'Awaiting receiving')]);
  out+=card('Saved playbooks',table(['Playbook','Edition','Content types','Visitor tasks','Editorial review','Latest receiving'],rows));
  let body='<div class="form-grid">'+input('Stable playbook identifier','playbook_id','','text',true);
  body+=input('Playbook name','label','','text',true)+input('Responsible publisher','owner',state.user.name,'text',true);
  body+=select('Native environment','environment_id',refOptions('environments'))+select('Original native inventory','inventory_file_id',sourceOptions())+'</div>';
  body+='<p>Retain the JSON produced by the existing Drupal profile and the supplied inventory command in Original sources.</p><button class="primary">Prepare editable playbook</button>';
  out+=card('Prepare from original Drupal inventory',pk('prepare',body));main.innerHTML=out;return;
 }
 if(state.view==='playbook-edit'&&draft?.entity_id===state.params.id){
  const preparation=draft.preparation_changes?.length||draft.structure_changes?.length?card('Changes from the new native inventory','<ul>'+(draft.preparation_changes||[]).map(message=>'<li>'+esc(message)+'</li>').join('')+'</ul>'+changesTable(draft.structure_changes||[])):'';
  main.innerHTML=heading(draft.revision?'Prepare revised publishing edition':'Edit publishing playbook','Review the complete proposed fields, publishing responsibilities and named visitor tasks before saving.')+preparation+editorForm(draft,draft.native,draft.revision===0);return;
 }
 opened=await ops('playbook.definitions.get',{playbook_id:state.params.id,...(state.params.version?{version_id:state.params.version}:{})});
 const p=opened.playbook,d=p.definition;
 if(state.view==='playbook-edit'){
  main.innerHTML=heading('Edit '+d.label,'Saving creates another complete edition and preserves the previous operating decisions.')+editorForm(p,opened.inventory);return;
 }
 const currentReview=opened.reviews.at(-1);
 let out=heading(d.label,'Publishing responsibilities, reader tasks and release receiving.',link('Edit this playbook','playbook-edit',{id:p.entity_id},'button'));
 out+=card('Current edition',definition([['Publishing owner',esc(d.owner)],['Native environment',esc(recordName('environments',d.environment_id))],
  ['Edition',esc(p.revision)],['Editorial review',badge(currentReview?.decision||'Unreviewed')],
  ['Original inventory',link(opened.file.filename,'source',{id:opened.file.id})],['Source',esc(d.source_reference)]]));
 const types=d.content_types.map(b=>[esc(b.bundle),esc(b.owner),esc(b.editor_role_ids.join(', ')),
  b.fields.map(f=>'<p><strong>'+esc(f.name)+'</strong><br>'+esc(f.instruction)+'</p>').join('')||'—']);
 out+=card('Content and editors',table(['Content type','Owner','Native editor roles','Publishing fields'],types));
 const revise=pk('revise',select('New original native inventory','inventory_file_id',sourceOptions())+'<p>Prepare a revised edition on this environment. Existing field instructions, reader goals and publishing responsibilities carry forward for review.</p><button>Prepare revised edition</button>');
 out+=card('Update from a new native inventory',revise);
 const tasks=d.tasks.map(t=>['<strong>'+esc(t.name)+'</strong><p>'+esc(t.goal)+'</p>',esc(t.route),esc(t.owner),
  t.visitor_set_version_id?link(t.journey_id,'visitor-set',{id:p.bindings.visitor_sets.find(s=>s.id===t.visitor_set_version_id)?.entity_id||t.visitor_set_version_id}):'Ready to link']);
 let visitors=table(['Task / reader goal','Route','Publisher','Original visitor set'],tasks);
 visitors+=pk('link-visitors','<p>Create the complete task population in the existing Visitor journeys workspace. Earlier sets and captures remain in its history.</p><button>Create visitor journeys</button>');
 out+=card('Visitor tasks',visitors);
 const review=pk('review',select('Decision','decision',['ACCEPT','RETURN'],currentReview?.decision||'ACCEPT')+area('Review reason','reason','',true)+'<button>Save decision for this edition</button>');
 let exportBody=input('Handover name','name',d.label+' — publishing handover','text',true);
 exportBody+='<label class="check"><input type="checkbox" name="include_sources" checked>Include original source files</label><p>Includes this playbook, original native operations, content mappings, visitor editions and receiving decisions.</p><button>Create complete handover</button>';
 out+='<div class="grid">'+card('Editorial decision',review)+card('Complete handover',pk('export',exportBody))+'</div>';
 out+=card('Release and restore receiving','<div id="playbook-receiving">'+receivingForm()+'</div>')+card('Receiving history',receivingHistory());
 out+=card('Playbook editions',table(['Edition','Saved','Publishing owner','Change'],opened.versions.map(v=>[
  link(String(v.revision),'playbook',{id:v.entity_id,version:v.id}),esc(date(v.created_at)),esc(v.definition.owner),esc(v.change_note)])));
 main.innerHTML=out;
}
async function submit(form){
 const kind=form.dataset.form,v=values(form),key=form.dataset.requestKey;
 if(kind==='playbook-prepare'){
  const prepared=await ops('playbook.definitions.prepare',{environment_id:v.environment_id,inventory_file_id:v.inventory_file_id,label:v.label,owner:v.owner});
  draft={entity_id:v.playbook_id,revision:0,inventory:prepared.file,definition:prepared.definition,native:prepared.inventory,request_key:key};
  await go('playbook-edit',{id:v.playbook_id});return;
 }
 if(kind==='playbook-save'){
  const result=await ops('playbook.definitions.save',gather(form));draft=null;await reload();await go('playbook',{id:result.playbook.entity_id});
  notice(result.playbook.visitor_relink?.length?result.playbook.visitor_relink.length+' changed tasks need new visitor bindings. Choose Create visitor journeys for this edition.':'The complete publishing edition is saved.');return;
 }
 const p=opened.playbook;
 if(kind==='playbook-revise'){
  const prepared=await ops('playbook.definitions.prepare',{version_id:p.id,environment_id:p.definition.environment_id,inventory_file_id:v.inventory_file_id});
  draft={entity_id:prepared.entity_id,revision:prepared.revision,inventory:prepared.file,definition:prepared.definition,
   native:prepared.inventory,preparation_changes:prepared.preparation_changes,structure_changes:prepared.structure_changes,request_key:key};
  await go('playbook-edit',{id:prepared.entity_id});return;
 }
 if(kind==='playbook-review'){
  await ops('playbook.reviews.save',{version_id:p.id,version_sha256:p.sha256,expected_revision:opened.reviews.length,
   decision:v.decision,reason:v.reason,request_key:key});await refresh();notice('The editorial decision is saved.');return;
 }
 if(kind==='playbook-link-visitors'){
  const result=await ops('playbook.visitors.link',{version_id:p.id,request_key:key});
  await reload();await go('playbook',{id:result.playbook.entity_id});notice(result.sets.length+' original visitor sets are linked to the new playbook edition.');return;
 }
 if(kind==='playbook-receiving'){
  const editors=[...form.querySelectorAll('[data-playbook-editor]')].map(b=>({
   bundle:b.dataset.playbookEditor,decision:b.querySelector('[name=editor_decision]').value,
   reason:b.querySelector('[name=editor_reason]').value,file_ids:[...b.querySelector('[name=editor_file_ids]').selectedOptions].map(o=>o.value)}));
  await ops('playbook.receiving.save',{version_id:p.id,expected_revision:opened.receiving.length,role:v.role,continued_from:v.continued_from,
   inventory_file_id:v.inventory_file_id,operation_ids:picked(form,'operation_ids'),visitor_edition_ids:picked(form,'visitor_edition_ids'),
   editor_decisions:editors,accept_changes:form.elements.accept_changes.checked,change_reason:v.change_reason,reason:v.reason,request_key:key});
  await refresh();notice('The original receiving observation and editor decisions are saved.');return;
 }
 if(kind==='playbook-export'){
  const result=await ops('playbook.exports.create',{playbook_version_ids:[p.id],name:v.name,
   include_sources:form.elements.include_sources.checked,request_key:key});
  await reload();await go('export',{id:result.export.id});return;
 }
}
async function action(name,target){
 if(name==='playbook-continue-receiving'){
  const previous=opened.receiving.find(r=>r.id===target.dataset.receivingId);
  if(!previous)throw Error('Reopen the original receiving history before continuing.');
  const container=main.querySelector('#playbook-receiving');
  container.innerHTML=receivingForm(previous);container.scrollIntoView({block:'start'});
  container.querySelector('select').focus();return;
 }
 if(name==='playbook-add-task'){main.querySelector('[data-playbook-tasks]').insertAdjacentHTML('beforeend',taskRow());return;}
 if(name==='playbook-remove-task'){target.closest('[data-playbook-task]').remove();return;}
 if(name==='playbook-compare'){
  const form=target.closest('form'),inventory=form.elements.inventory_file_id.value;
  const result=await ops('playbook.inventories.compare',{version_id:opened.playbook.id,inventory_file_id:inventory});
  form.querySelector('#playbook-structure').innerHTML=result.changes.length?changesTable(result.changes):'<p>The selected native field, role, workflow and route definitions match.</p>';return;
 }
}
document.addEventListener('change',event=>{
 const form=event.target.closest('[data-form="playbook-receiving"]');
 if(form&&['inventory_file_id','role'].includes(event.target.name)){
  if(form.elements.continued_from.value){
   form.elements.continued_from.value='';
   for(const n of form.querySelectorAll('[name=operation_ids],[name=visitor_edition_ids]'))n.checked=false;
   for(const n of form.querySelectorAll('[name=editor_decision]'))n.value='PENDING';
   for(const n of form.querySelectorAll('[name=editor_reason]'))n.value='';
   for(const n of form.querySelectorAll('[name=editor_file_ids] option'))n.selected=false;
   form.elements.reason.value='';
  }
  form.elements.accept_changes.checked=false;form.elements.change_reason.value='';
  form.querySelector('[data-receiving-context]').textContent='Record the editor, native and visitor outcomes for this newly selected observation.';
  form.querySelector('#playbook-structure').innerHTML='<p>Compare this selected inventory before recording its receiving decision.</p>';
 }
});
window.GovHubPlaybook={render:renderPlaybook,submit,action,entries};
})();
