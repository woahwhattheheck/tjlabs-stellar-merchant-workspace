'use strict';
window.GovHubPots = (() => {
  const projects = () => state.snapshot?.govhub?.pots?.projects || [];
  const call = (name, data) => ops('pots.' + name, data);
  const chosen = (form, name) => [...new FormData(form).getAll(name)];
  const download = (file, label) => '<a href="/api/files/' + enc(file.id) + '">' + esc(label || file.filename) + '</a>';
  const sourceTable = rows => table(['Revision', 'Original observation'], rows.map(([name, value]) => [esc(name), '<code>' + esc(value || '—') + '</code>']));
  const notes = items => items.length ? '<ul class="pots-observations">' + items.map(s => '<li>' + esc(s) + '</li>').join('') + '</ul>' : '<p>The received observations are complete for this context.</p>';
  let current = null, intake = null;

  function projectForm(project = {}) {
    const pinned = Boolean(project.id);
    const nativeFields = pinned ? definition([
      ['CircleCI project', '<code>' + esc(project.circle_project_id) + '</code>'],
      ['Pantheon site', '<code>' + esc(project.site_id) + '</code>'],
      ['Deployment environment', esc(project.target_environment)],
      ['Operating environment', link(recordName('environments', project.environment_id), 'record', {kind:'environments',id:project.environment_id})],
    ]) : input('CircleCI project UUID','circle_project_id','','text',true) +
      input('Pantheon site UUID','site_id','','text',true) +
      input('Pantheon environment','target_environment','','text',true,'Use the selected dev, test, live or multidev environment.') +
      select('Operating environment record','environment_id',refOptions('environments'));
    return '<form data-form="pots-project" data-request-key="' + newKey() + '">' +
      input('Project name','label',project.label||'','text',true) + nativeFields +
      select('Site record','workspace_site_id',refOptions('sites','Choose a site record'),project.workspace_site_id||'') +
      input('Delivery owner','owner',project.owner||state.user.name,'text',true) +
      area('Agreed scope and operating instruction','scope_reference',project.scope_reference||'',true) +
      select('Original scope document','scope_file_id',fileOptions('Choose a retained scope file'),project.scope_file_id||'') +
      area('Recovery instruction','recovery_instruction',project.recovery_instruction||'') +
      area('Project notes','notes',project.notes||'') + '<button class="primary">Save project scope</button></form>';
  }
  function editionsTable(editions) {
    return table(['Run edition','Received','Phase','Outcome','Jobs','Artifacts'], editions.slice().reverse().map(e => [
      link('Run ' + (e.run_number || short(e.run_id)), 'pots-run', {id:e.id}),
      esc(date(e.received_at)),badge(e.run_phase||'Unknown'),badge(e.run_outcome||'Pending'),
      esc(e.counts?.jobs||0),esc(e.counts?.artifacts||0),
    ]));
  }
  async function home() {
    main.innerHTML = heading('POTS delivery','Connect an original CircleCI build to its Pantheon deployment, content transition and recovery handover.',button('Refresh projects','refresh')) +
      card('Delivery projects',table(['Project','Pantheon environment','Owner','Received editions','Latest review'],projects().map(p => [
        link(p.label,'pots-project',{id:p.id}),esc(p.target_environment),esc(p.owner),esc(p.edition_count),esc(p.latest_review?.decision||'—'),
      ]))) + '<div class="grid wide"><div>' + card('Create a delivery project',projectForm()) +
      '</div><div>' + card('Receive the original operating work','<p>Save the selected native project and environment. Receive the original CircleCI run with its complete job output and POTS deployment capture, then connect the existing content and recovery operations.</p><p>Each new receiving becomes a saved edition. You can compare editions, review the selected target and export the complete project for another engineer.</p><div class="actions">' +
      link('Environment register','records',{kind:'environments'}) + link('Original source files','sources') + '</div>') + '</div></div>';
  }
  async function projectView() {
    const data=await call('projects.get',{project_id:state.params.id}), p=data.project;
    current=data;
    main.innerHTML='<div class="breadcrumbs">'+link('POTS delivery','pots')+'<span>'+esc(p.label)+'</span></div>'+
      heading(p.label,'Saved source runs and operating work for '+p.target_environment+'.',link('Receive a run','pots-receive',{id:p.id}))+
      card('Original run editions',editionsTable(data.editions))+
      '<div class="grid wide"><div>'+card('Operating work',linksView(data))+
      card('Connect existing work',linkForm(data))+
      card('Operating review',reviewForm(data))+'</div><div>'+
      card('Complete handover','<form data-form="pots-handover" data-request-key="'+newKey()+'">'+
        input('Handover name','name',p.label+' — complete delivery','text',true)+
        '<p>Include all saved project editions, source files, reviews and linked content and recovery work.</p><button class="primary">Create complete handover</button></form>')+
      card('Compare run editions','<form data-form="pots-compare">'+
        select('Earlier edition','before_id',[['','Choose an edition'],...data.editions.map(e=>[e.id,'Run '+(e.run_number||short(e.run_id))+' · '+date(e.received_at)])])+
        select('Later edition','after_id',[['','Choose an edition'],...data.editions.map(e=>[e.id,'Run '+(e.run_number||short(e.run_id))+' · '+date(e.received_at)])])+
        '<button>Compare saved editions</button></form>')+
      card('Project scope','<details><summary>Open and edit the agreed scope</summary>'+projectForm(p)+'</details>')+
      '</div></div>'+card('Saved reviews',table(['Reviewed','Edition','Decision','Operator','Review'],data.reviews.slice().reverse().map(r=>[
        esc(date(r.reviewed_at)),link(short(r.edition_id),'pots-run',{id:r.edition_id}),esc(r.decision),esc(r.author),esc(r.notes),
      ])));
  }
  function linksView(data) {
    const operationIds=[...new Set(data.links.flatMap(l=>l.operation_ids))];
    const familyIds=[...new Set(data.links.flatMap(l=>l.content_family_ids))];
    return table(['Work','Current state','Selected environment'],operationIds.map(id=>{
      const op=gov().operations?.find(o=>o.id===id);
      return [link((op?.type||'Operation')+' · '+short(id),'operation',{id}),badge(op?.state||'Retained'),esc(recordName('environments',op?.environment_id))];
    }).concat(familyIds.map(id=>{
      const f=contentFamilies().find(f=>f.id===id);
      return [link(f?.label||id,'content-family',{id}),'Content consolidation',esc(recordName('environments',f?.environment_id))];
    })))+data.links.map(l=>'<p class="muted">'+esc(date(l.created_at))+' · '+esc(l.reason)+'</p>').join('');
  }
  function linkForm(data) {
    return '<form data-form="pots-link" data-request-key="'+newKey()+'">'+
      select('Related run edition','edition_id',[['','Whole project'],...data.editions.map(e=>[e.id,'Run '+(e.run_number||short(e.run_id))+' · '+date(e.received_at)])])+
      checks('Native operating work','operation_ids',(gov().operations||[]).map(o=>[o.id,o.type+' · '+recordName('environments',o.environment_id)+' · '+o.state]))+
      checks('Content consolidations','content_family_ids',contentFamilies().map(f=>[f.id,f.label]))+
      area('How this work supports the selected project','reason','',true)+
      '<button>Connect operating work</button></form>';
  }
  function reviewForm(data) {
    return '<form data-form="pots-review" data-request-key="'+newKey()+'">'+
      select('Run edition','edition_id',[['','Choose a received edition'],...data.editions.map(e=>[e.id,'Run '+(e.run_number||short(e.run_id))+' · '+date(e.received_at)])])+
      select('Operating decision','decision',['Reviewed','Ready for handover','Needs work'],'Reviewed')+
      area('Deployment, content and recovery review','notes','',true,'Record the actual result and any remaining work for this edition.')+
      '<button>Save operating review</button></form>';
  }
  async function receiveView() {
    const data=await call('projects.get',{project_id:state.params.id});
    current=data;
    main.innerHTML='<div class="breadcrumbs">'+link('POTS delivery','pots')+link(data.project.label,'pots-project',{id:data.project.id})+'</div>'+
      heading('Receive an original run','Import the complete output directory from the native CircleCI collector.')+
      '<div class="grid wide"><div>'+card('Original receiving directory',
        '<form data-form="pots-receive" data-request-key="'+newKey()+'"><label>Completed receiving directory<input name="directory" type="file" webkitdirectory directory multiple required><small>Select the directory containing manifest.json and its objects directory.</small></label>'+
        '<p>Files up to128 MiB each can be received here. Use the installed receiving command for larger artifacts.</p>'+
        '<button class="primary">Receive complete run</button><p id="pots-upload-progress" role="status"></p></form>')+
      '</div><div>'+card('Native receiving command',
        '<p>The installed Python collector reads the existing CircleCI account, selected run, every workflow and job, all native artifacts and the job output streams. Keep its private token in the original environment variable.</p>'+
        '<pre class="pots-code">python3 -m pots.collector --output /ABS/NEW-RECEIVING receive --project-id '+esc(data.project.circle_project_id)+' --run-id ORIGINAL-RUN-UUID</pre>'+
        '<p>For an interrupted receiving, continue the same original directory and arguments. Use a new directory to observe a later edition of the run. The application’s POTS guide includes the complete CLI import and capture installation.</p>')+'</div></div>';
  }
  async function uploadDirectory(form) {
    const selected=[...form.elements.directory.files];
    const manifestCandidates=selected.filter(f=>f.name==='manifest.json'&&f.webkitRelativePath.split('/').length===2);
    if(manifestCandidates.length!==1)throw Error('Choose the original receiving root containing one manifest.json.');
    const originalManifest=manifestCandidates[0];
    if(originalManifest.size>32*1024**2)throw Error('The receiving manifest exceeds the32 MiB parsing limit.');
    const manifest=JSON.parse(await originalManifest.text());
    if(manifest.schema!=='govhub.pots.native-receiving/v1'||!Array.isArray(manifest.files))throw Error('Select a complete native POTS receiving manifest.');
    const prefix=originalManifest.webkitRelativePath.slice(0,-'manifest.json'.length);
    const local=new Map(selected.map(f=>[f.webkitRelativePath.slice(prefix.length),f]));
    const wanted=[{path:'manifest.json',file:originalManifest},...manifest.files.map(item=>({path:item.path,file:local.get(item.path),identity:item}))];
    for(const entry of wanted){
      if(!entry.file)throw Error('The original receiving directory is missing '+entry.path+'.');
      if(entry.file.size>128*1024**2)throw Error('Use the installed receiving command for the larger original file '+entry.path+'.');
      if(entry.identity&&entry.file.size!==entry.identity.bytes)throw Error('The original byte length differs for '+entry.path+'.');
    }
    const manifestBytes=await originalManifest.arrayBuffer();
    const manifestHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',manifestBytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    const identity=current.project.id+':'+manifestHash;
    if(intake?.identity!==identity)intake={identity,files:{},manifest_file_id:null,request_key:form.dataset.requestKey};
    const progress=main.querySelector('#pots-upload-progress');
    await reload();
    for(let index=0;index<wanted.length;index++){
      const entry=wanted[index],expectedHash=entry.identity?.sha256||manifestHash;
      progress.textContent='Receiving file '+(index+1)+' of '+wanted.length+': '+entry.path;
      let file=sourceFiles().find(f=>f.sha256===expectedHash&&f.bytes===entry.file.size);
      if(!file){
        const content_base64=await fileBase64(entry.file);
        file=await api('files',{filename:entry.file.name,content_base64,category:'Evidence',source_label:'POTS '+current.project.label+' · '+entry.path});
      }
      if(file.sha256!==expectedHash||file.bytes!==entry.file.size)throw Error('The received original file identity differs for '+entry.path+'.');
      if(entry.path==='manifest.json')intake.manifest_file_id=file.id;
      else intake.files[entry.path]=file.id;
    }
    progress.textContent='Reopening the complete native run and deployment context.';
    const result=await call('receive',{project_id:current.project.id,manifest_file_id:intake.manifest_file_id,files:intake.files,request_key:intake.request_key});
    intake=null;
    await reload();await go('pots-run',{id:result.edition.id});
    notice('The complete original run edition is saved.');
  }
  async function runView() {
    const data=await call('runs.get',{edition_id:state.params.id}),e=data.edition,p=data.project;
    current=data;
    const byPath=new Map(e.retained_files.map(f=>[f.native_path,f]));
    const tabs=[['overview','Deployment'],['jobs','Jobs'],['outputs','Output'],['artifacts','Artifacts']];
    const tab=state.params.tab||'overview';
    main.innerHTML='<div class="breadcrumbs">'+link('POTS delivery','pots')+link(p.label,'pots-project',{id:p.id})+'</div>'+
      heading('Run '+(e.run_number||short(e.run_id)),'Received '+date(e.received_at)+' · '+e.run_phase+' · '+(e.run_outcome||'Pending'),button('Refresh saved edition','refresh'))+
      '<nav class="pots-tabs" aria-label="Run views">'+tabs.map(([key,label])=>link(label,'pots-run',{id:e.id,tab:key},key===tab?'current':'')).join('')+'</nav>'+
      card('Original run',definition([['Native run UUID','<code>'+esc(e.run_id)+'</code>'],['Native project UUID','<code>'+esc(e.native_project_id)+'</code>'],['Receiving manifest',download(data.manifest,'manifest.json')],['Original files',esc(e.retained_files.length)],['Native log receiving',esc(e.include_logs?'Complete selected job output':'Omitted in this edition')]]));
    if(tab==='jobs'){
      main.innerHTML+=card('Original native jobs',table(['Job','Workflow','Type','Phase','Outcome','Finished'],e.jobs.map(j=>[
        esc(j.name)+'<small>'+esc(j.id)+'</small>',esc(j.workflow_id),esc(j.type),badge(j.phase||''),badge(j.outcome||'Pending'),esc(date(j.ended_at)),
      ])))+card('Failed native steps',table(['Job','Execution','Step','Exit code','Outcome'],e.jobs.flatMap(j=>j.failed_steps.map(s=>[
        esc(j.name),esc(s.execution),esc(s.name||s.num),esc(s.exit_code),esc(s.outcome),
      ]))));
    }else if(tab==='outputs'){
      main.innerHTML+=card('Original output streams',table(['Job','Execution','Step','Stream','Bytes','Read'],e.streams.map(s=>{
        const file=byPath.get(s.file.path),job=e.jobs.find(j=>j.id===s.job_id);
        return [esc(job?.name||s.job_id),esc(s.execution),esc(s.step_num),download(file,s.stream),esc(size(file.bytes)),
          button('Read output','pots-preview',{id:file.id})];
      })))+'<section id="pots-preview" aria-live="polite"></section>';
    }else if(tab==='artifacts'){
      main.innerHTML+=card('Original native artifacts',table(['Original path','Job','Execution','Bytes','Read'],e.artifacts.map(a=>{
        const file=byPath.get(a.file.path),job=e.jobs.find(j=>j.id===a.job_id);
        return [download(file,a.native_path),esc(job?.name||a.job_id),esc(a.execution),esc(size(file.bytes)),button('Inspect','pots-preview',{id:file.id})];
      })))+'<section id="pots-preview" aria-live="polite"></section>';
    }else{
      main.innerHTML+=card('Run observations',notes(data.assessment.observations))+
        data.assessment.contexts.map(c=>card(c.job_name+' · '+(c.environment||'Deployment context'),
          definition([['Observed target',esc((c.site_id||'—')+'.'+(c.environment||'—'))],['Captured',esc(date(c.captured_at))],['Native job',badge(c.job_phase||'')+' '+badge(c.job_outcome||'')],['Retained source files',esc(c.source_count)],['Retained native commands',esc(c.command_count)]])+
          sourceTable([['Triggering Git event',c.event_revision],['CI source revision',c.source_revision],['Actual checkout',c.checkout_revision],['Pantheon deployed code',c.deployed_commit]])+
          notes(c.issues)+'<p>'+download(byPath.get(c.file.path),'Original deployment context')+'</p>')).join('')+
        (data.assessment.context_errors.length?card('Capture receiving',table(['Artifact','Observation'],data.assessment.context_errors.map(x=>[esc(x.artifact_path),esc(x.message)]))):'')+
        card('Continue project work','<div class="actions">'+link('Project review and handover','pots-project',{id:p.id})+
          link('Open native operations','operations')+link('Open content consolidation','content')+'</div>');
    }
  }
  async function compareView() {
    const result=await call('runs.compare',{before_id:state.params.before_id,after_id:state.params.after_id});
    current=result;
    main.innerHTML='<div class="breadcrumbs">'+link('POTS delivery','pots')+link('Project','pots-project',{id:result.before.project_id})+'</div>'+
      heading('Compare run editions','Original job, deployment and artifact changes between the selected observations.')+
      card('Selected runs',definition([['Earlier',link(short(result.before.run_id),'pots-run',{id:result.before.id})+' · '+esc(date(result.before.received_at))],['Later',link(short(result.after.run_id),'pots-run',{id:result.after.id})+' · '+esc(date(result.after.received_at))]]))+
      ['jobs','contexts','artifacts'].map(kind=>card(kind[0].toUpperCase()+kind.slice(1),
        definition([['Added',esc(result[kind].added.length)],['Removed',esc(result[kind].removed.length)],['Changed',esc(result[kind].changed.length)]])+
        '<details><summary>Open original changes</summary><pre class="pots-code">'+esc(JSON.stringify(result[kind],null,2))+'</pre></details>')).join('');
  }
  async function render() {
    if(state.view==='pots-project')return projectView();
    if(state.view==='pots-receive')return receiveView();
    if(state.view==='pots-run')return runView();
    if(state.view==='pots-compare')return compareView();
    current=null;return home();
  }
  async function submit(form) {
    const kind=form.dataset.form,v=values(form);
    if(kind==='pots-receive')return uploadDirectory(form);
    if(kind==='pots-compare'){await go('pots-compare',{before_id:v.before_id,after_id:v.after_id});return;}
    if(kind==='pots-project'){
      const original=current?.project;
      const payload={...v,request_key:form.dataset.requestKey};
      if(original&&state.view==='pots-project'){
        for(const name of ['circle_project_id','site_id','target_environment','environment_id'])payload[name]=original[name];
        payload.project_id=original.id;payload.expected_revision=original.revision;
      }
      const result=await call('projects.save',payload);
      await reload();await go('pots-project',{id:result.project.id});notice('The project scope and original native target are saved.');return;
    }
    const projectId=current.project.id;
    if(kind==='pots-link'){
      await call('links.save',{...v,project_id:projectId,operation_ids:chosen(form,'operation_ids'),content_family_ids:chosen(form,'content_family_ids'),request_key:form.dataset.requestKey});
      await refresh();notice('The original operating work is connected to this project.');return;
    }
    if(kind==='pots-review'){
      await call('reviews.save',{...v,project_id:projectId,request_key:form.dataset.requestKey});
      await refresh();notice('The review is saved against the original run edition.');return;
    }
    if(kind==='pots-handover'){
      const result=await ops('exports.create',{name:v.name,pots_project_ids:[projectId],plan_ids:[],include_sources:true,request_key:form.dataset.requestKey});
      await reload();await go('export',{id:result.export.id});notice('The complete source-inclusive project handover is ready.');return;
    }
    throw Error('Choose an available POTS project action.');
  }
  async function action(name,target) {
    if(name!=='pots-preview')return;
    const result=await call('files.preview',{edition_id:current.edition.id,file_id:target.dataset.id});
    const container=main.querySelector('#pots-preview');
    container.innerHTML=card(result.file.filename,
      '<p>'+download(result.file,'Download complete original file')+' · '+esc(size(result.file.bytes))+'</p>'+
      (result.binary?'<p>This original binary file is available for download.</p>':
        '<pre class="pots-code">'+esc(result.text)+'</pre>')+
      (result.truncated?'<p>The preview shows the first256 KiB. The download contains the complete original file.</p>':''));
    container.scrollIntoView({block:'start'});
  }
  return Object.freeze({render,submit,action,projects});
})();
