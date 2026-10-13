
(()=>{
 const api=PROJECT_WORKSPACE;
 const binding={analysis_sha256:ENGINE_ID,project_sha256:PROJECT_ENGINE_ID};
 const projectState={project:{id:'maritime-project',title:'Maritime reporting project'},entries:[],selected:null,checked:null,generation:0,busy:false,undo:null};
 const message=(value,error=false)=>{$('project-message').textContent=value;$('project-message').className=error?'notice error':'notice'};
 const clone=value=>JSON.parse(JSON.stringify(value));
 function hasDraftMeta(){return $('project-id').value!==projectState.project.id||$('project-title').value!==projectState.project.title}
 function meta(){return {id:$('project-id').value.trim(),title:$('project-title').value.trim()}}
 function currentEntry(id){
  if(!state.current||!state.period||!state.applied)throw new Error('Apply a valid source review above before adding or replacing a project entry.');
  const title=$('project-entry-title').value.trim();
  if(!title||title.length>300)throw new Error('Give this entry a descriptive title of at most 300 characters.');
  return {id,title,current:{raw:state.current.raw,descriptor:clone(state.current.descriptor)},previous:state.revisions?{raw:state.previous.raw,descriptor:clone(state.previous.descriptor)}:null,selection:clone(state.applied.selection),before:state.comparison?clone(state.applied.before):null,after:state.comparison?clone(state.applied.after):null};
 }
 function snapshot(){return {project:projectState.project,entries:projectState.entries,selected:projectState.selected,checked:projectState.checked};}
 function commit(project,entries,selected=null){
  const checked=api.analyzeWorkspaceEntries(project,entries,binding);
  projectState.undo=snapshot();projectState.project=clone(project);projectState.entries=clone(entries);projectState.selected=selected;projectState.checked=checked;
  $('project-id').value=project.id;$('project-title').value=project.title;
  render();
 }
 function attempt(action){try{action()}catch(error){message(error.message,true)}}
 function cancelPending(){projectState.generation++;projectState.busy=false}
 function nextId(){let n=1;while(projectState.entries.some(entry=>entry.id==='entry-'+n))n++;return 'entry-'+n}
 function refresh(){
  const ready=Boolean(state.current&&state.period&&state.applied);
  $('project-add').disabled=projectState.busy||!ready||projectState.entries.length>=48;
  $('project-replace').disabled=projectState.busy||!ready||!projectState.selected;
  $('project-rename').disabled=projectState.busy||!projectState.selected;
  $('project-remove').disabled=projectState.busy||!projectState.selected;
  $('project-up').disabled=projectState.busy||projectState.entries.findIndex(x=>x.id===projectState.selected)<=0;
  const index=projectState.entries.findIndex(x=>x.id===projectState.selected);
  $('project-down').disabled=projectState.busy||index<0||index>=projectState.entries.length-1;
  const exportable=Boolean(projectState.checked)&&!projectState.busy&&!hasDraftMeta();
  for(const id of ['project-save','project-csv','project-json','project-report'])$(id).disabled=!exportable;
  $('project-apply-meta').disabled=projectState.busy||!projectState.entries.length||!hasDraftMeta();
  $('project-open').disabled=projectState.busy;
  $('project-undo').disabled=projectState.busy||!projectState.undo;
 }
 function render(){
  const analysis=projectState.checked?.analysis;
  $('project-summary').innerHTML=analysis?'<div class="metrics"><div><strong>'+analysis.summary.entries+'</strong><span>project entries</span></div><div><strong>'+analysis.summary.identified_ports.length+'</strong><span>identified ports</span></div><div><strong>'+analysis.summary.selected_cells+'</strong><span>selected cells</span></div><div><strong>'+analysis.summary.unknown_cells+'</strong><span>null / absent / unsupported</span></div></div><p class="muted">Each entry keeps its own measure, source and period. '+esc(analysis.summary.cell_count_basis)+' Unassigned-port entries: '+analysis.summary.unassigned_port_entries+'.</p>':'<p class="muted">Your project is empty. Apply a source review above and add it here. Add other port/measure selections in the same way.</p>';
  $('project-entries').innerHTML=analysis?'<div class="table" tabindex="0" aria-label="Project entry table"><table><thead><tr><th scope="col">Entry</th><th scope="col">Port / measure</th><th scope="col">Applied period</th><th scope="col">Review</th><th scope="col">Edit</th></tr></thead><tbody>'+analysis.entries.map(entry=>'<tr'+(entry.id===projectState.selected?' class="selected-entry"':'')+'><td>'+esc(entry.title)+'<div class="muted">'+esc(entry.id)+'</div></td><td>'+esc(entry.current.request.locode??'Unassigned in issuer example')+'<div class="muted">'+esc(entry.current.request.measure)+'</div></td><td>'+esc(entry.period.selection.from)+' ≤ Date &lt; '+esc(entry.period.selection.until)+'</td><td>'+entry.summary.selected_cells+' cells · '+(entry.summary.cell_states.null+entry.summary.cell_states.absent+entry.summary.cell_states.unsupported_value)+' unknown<div class="muted">'+(entry.comparison?'Period comparison':'No period comparison')+' · '+(entry.revisions?'Prior edition selected':'One source edition')+'</div></td><td><button type="button" data-project-edit="'+esc(entry.id)+'" aria-label="Edit '+esc(entry.title)+'">'+(entry.id===projectState.selected?'Editing entry':'Edit entry')+'</button></td></tr>').join('')+'</tbody></table></div>':'';
  $('project-selected').textContent=projectState.selected?'Selected entry: '+projectState.selected+'. Change its title or adjust its source review above, then use the relevant update button.':'No project entry selected. Adding a review creates another independent entry.';
  refresh();
 }
 function openEntry(id){
  const entry=projectState.entries.find(value=>value.id===id);if(!entry)throw new Error('That project entry is no longer present.');
  const current=descriptorPair(entry.current.raw,entry.current.descriptor),previous=entry.previous?descriptorPair(entry.previous.raw,entry.previous.descriptor):null;
  cancelLoading();setCurrent(current,false,false);state.previous=previous;
  $('previous-label').textContent=previous?previous.edition.id+' · '+previous.descriptor.captured_at:'No previous edition selected.';
  $('from').value=entry.selection.from;$('until').value=entry.selection.until;
  for(const prefix of ['before','after'])for(const key of ['from','until'])$(prefix+'-'+key).value=entry[prefix]?.[key]??entry.selection[key];
  $('compare-toggle').checked=Boolean(entry.before);$('revision-toggle').checked=Boolean(previous);runReview();
  projectState.selected=id;$('project-entry-title').value=entry.title;render();
  message('Opened '+entry.title+' in the source review above. Project values change only when you replace this selected entry.');
 }
 $('project-add').onclick=()=>attempt(()=>{cancelPending();const entry=currentEntry(nextId());commit(meta(),[...projectState.entries,entry],entry.id);message('Added '+entry.title+'. Save the project workspace to retain this whole project.');});
 $('project-replace').onclick=()=>attempt(()=>{cancelPending();if(!projectState.selected)throw new Error('Choose an existing project entry first.');const entry=currentEntry(projectState.selected);commit(meta(),projectState.entries.map(value=>value.id===entry.id?entry:value),entry.id);message('Replaced '+entry.title+' with the applied source review.');});
 $('project-rename').onclick=()=>attempt(()=>{cancelPending();const title=$('project-entry-title').value.trim();if(!title||title.length>300)throw new Error('Use an entry title of 1 to 300 characters.');commit(meta(),projectState.entries.map(value=>value.id===projectState.selected?{...value,title}:value),projectState.selected);message('Updated the selected entry title. Its source and periods are unchanged.');});
 $('project-remove').onclick=()=>attempt(()=>{cancelPending();const entries=projectState.entries.filter(entry=>entry.id!==projectState.selected);if(!entries.length){projectState.undo=snapshot();projectState.entries=[];projectState.selected=null;projectState.checked=null;render();}else commit(meta(),entries);message('Removed the selected entry from this working project. Previously downloaded workspaces are unchanged.');});
 $('project-undo').onclick=()=>{cancelPending();if(!projectState.undo)return;const previous=projectState.undo;projectState.undo=null;Object.assign(projectState,previous);$('project-id').value=projectState.project.id;$('project-title').value=projectState.project.title;render();message('Restored the previous complete project.');};
 function move(direction){attempt(()=>{cancelPending();const entries=[...projectState.entries],index=entries.findIndex(entry=>entry.id===projectState.selected),target=index+direction;if(index<0||target<0||target>=entries.length)return;[entries[index],entries[target]]=[entries[target],entries[index]];commit(meta(),entries,projectState.selected);message('Project entry order updated.');});}
 $('project-up').onclick=()=>move(-1);$('project-down').onclick=()=>move(1);
 $('project-clear-selection').onclick=()=>{cancelPending();projectState.selected=null;render();message('Entry selection cleared. The next added review becomes another project entry.');};
 $('project-entries').onclick=event=>{const button=event.target.closest('[data-project-edit]');if(button)attempt(()=>{cancelPending();openEntry(button.dataset.projectEdit);});};
 $('project-apply-meta').onclick=()=>attempt(()=>{cancelPending();commit(meta(),projectState.entries,projectState.selected);message('Project name and identifier updated.');});
 for(const id of ['project-id','project-title'])$(id).oninput=()=>{cancelPending();refresh();if(hasDraftMeta())message('Apply the project name and identifier before downloading.');};
 $('project-save').onclick=()=>attempt(()=>download(projectState.project.id+'-workspace.json',plain(api.saveProjectWorkspace(projectState.project,projectState.entries,binding))));
 $('project-csv').onclick=()=>attempt(()=>download(projectState.project.id+'-observations.csv',api.projectRowsCSV(projectState.checked.analysis),'text/csv;charset=utf-8'));
 $('project-json').onclick=()=>attempt(()=>download(projectState.project.id+'-analysis.json',plain(projectState.checked.analysis)));
 $('project-report').onclick=()=>attempt(()=>download(projectState.project.id+'-report.html',api.browserProjectReport(projectState.checked,binding),'text/html;charset=utf-8'));
 $('project-workspace-file').onchange=()=>{cancelPending();refresh();message('Project file selected. Reopen it to replace this in-memory project; save the current project first if needed.');};
 $('project-open').onclick=async()=>{
  const generation=++projectState.generation;projectState.busy=true;refresh();message('Reading complete project source and checking its original responses…');
  try{
   const file=$('project-workspace-file').files[0];if(!file)throw new Error('Choose a saved project workspace.');
   if(file.size>256*1024*1024)throw new Error('Project workspace exceeds the 256 MiB browser receiving limit.');
   const text=await file.text();if(generation!==projectState.generation)return;
   const received=api.receiveProjectWorkspace(JSON.parse(text),binding);
   if(generation!==projectState.generation)return;
   projectState.undo=snapshot();projectState.project=received.project;projectState.entries=received.entries;projectState.selected=null;projectState.checked=received;
   $('project-id').value=received.project.id;$('project-title').value=received.project.title;render();
   message('Reopened all '+received.entries.length+' entries from their retained original source. Choose Edit entry to continue an individual review.');
  }catch(error){if(generation===projectState.generation)message(error.message+' The existing in-memory project is preserved.',true);}
  finally{if(generation===projectState.generation){projectState.busy=false;refresh();}}
 };
 projectRefresh=refresh;render();
})();
