'use strict';
window.GovHubVisitor = (() => {
  const data={snapshot:null,project:null,set:null,edition:null,capture:null,comparison:null,finding:null};
  const request=()=>crypto.randomUUID();
  const call=(name,value={})=>ops('visitor.'+name,value);
  const rows=(headers,content)=>table(headers,content);
  const badgeStatus=value=>'<span class="badge">'+esc(value)+'</span>';
  const json=(value)=>JSON.stringify(value,null,2);
  const parse=(value,label)=>{try{return JSON.parse(value);}catch{throw Error(label+' must contain valid JSON.');}};
  const commands=(title,body)=>'<details class="visitor-advanced"><summary>'+esc(title)+'</summary>'+body+'</details>';
  const command=(label,action,extra='')=>'<button type="button" data-visitor-action="'+esc(action)+'" '+extra+'>'+esc(label)+'</button>';
  const linkTo=(label,view,id)=>link(label,view,id?{id}:{}); 
  const projectOptions=()=>data.snapshot.projects.map(p=>[p.entity_id,p.label+' · '+p.base_url]);
  const editionOptions=()=>data.snapshot.editions.map(e=>[e.id,e.label+' · '+e.role+' · '+date(e.created_at)]);
  const freshForm=(kind,body)=>'<form data-form="visitor-'+kind+'" data-request-key="'+request()+'">'+body+'</form>';
  function nav(){return '<nav class="visitor-tabs" aria-label="Visitor workflow">'+link('Journeys','visitor')+link('New capture','visitor-capture-new')+link('Compare editions','visitor-compare')+link('Customer handover','visitor-handover')+'</nav>';}
  function page(title,description,body){main.innerHTML=nav()+heading(title,description)+body;}
  function outcomeTable(edition){
    return rows(['Visitor goal','Status','Steps'],edition.result.journeys.map(j=>[
      '<strong>'+esc(j.name)+'</strong><p>'+esc(j.goal)+'</p>',badgeStatus(j.status),
      j.steps.map(s=>'<div><strong>'+esc(s.label)+'</strong> '+badgeStatus(s.status)+'<p class="visitor-url">'+esc(s.url)+'</p>'+
        (s.error?'<p>'+esc(s.error.message)+'</p>':'')+
        '<details><summary>'+s.checks.length+' expected outcomes</summary>'+rows(['Outcome','Expected','Captured','Status'],s.checks.map(c=>[
          esc(c.kind),esc(typeof c.expected==='string'?c.expected:json(c.expected)),
          esc(typeof c.actual==='string'?c.actual:json(c.actual)),badgeStatus(c.status)
        ]))+'</details></div>').join('')
    ]));
  }
  function home(){
    page('Visitor journeys','Original pages, reviewed visitor goals, corrective work and customer handovers.',
      card('Projects',rows(['Project','Source','Revision',''],data.snapshot.projects.map(p=>[
        esc(p.label),'<span class="visitor-url">'+esc(p.base_url)+'</span>',String(p.revision),linkTo('Open','visitor-project',p.entity_id)
      ]))+'<div class="actions">'+link('Add project','visitor-project')+'</div>')+
      card('Saved visitor goals',rows(['Journey set','Project','Scope',''],data.snapshot.sets.map(s=>[
        esc(s.label),esc(s.project_id),s.journey_count+' journeys · revision '+s.revision,
        linkTo('Edit goals','visitor-set',s.entity_id)+' · '+link('Capture','visitor-capture-new',{set_id:s.entity_id})
      ]))+'<div class="actions">'+link('Add journey set','visitor-set')+'</div>')+
      card('Captured editions',rows(['Edition','Role','Outcomes',''],data.snapshot.editions.map(e=>[
        esc(e.label)+'<small class="visitor-block">'+date(e.created_at)+'</small>',esc(e.role),
        Object.entries(e.summary).filter(([,n])=>n).map(([k,n])=>n+' '+k).join(' · '),
        linkTo('Review','visitor-edition',e.id)
      ])))+
      card('Capture operations',rows(['Operation','Progress','State',''],data.snapshot.operations.slice(0,40).map(o=>[
        esc(o.id),o.progress.completed+' / '+o.progress.total,esc(o.state),linkTo('Open','visitor-capture',o.id)
      ])))+
      card('Corrective implementation',rows(['Work','Owner','State',''],data.snapshot.findings.map(f=>[
        esc(f.title),esc(f.owner),esc(f.status),linkTo('Original journey','visitor-edition',f.edition_id)
      ]))));
  }
  async function project(){
    data.project=state.params.id?(await call('projects.get',{entity_id:state.params.id})).project:null;
    const p=data.project,v=p?.value||{label:'',base_url:'https://',allowed_origins:[],timeout_seconds:30,max_page_bytes:2097152,search_result_class:'',header_environment:{},source_reference:'',notes:''};
    page(p?'Edit project':'Add project','The same saved site profile can capture a baseline or a later candidate.',
      card('Site and source',freshForm('project',
        input('Project identifier','entity_id',p?.entity_id||'','text',true)+input('Project name','label',v.label,'text',true)+
        input('Site base URL','base_url',v.base_url,'url',true)+
        area('Additional site origins','origins',v.allowed_origins.join('\n'),false,'One exact site origin per line. External reservation destinations can remain expected links.')+
        input('Original source reference','source_reference',v.source_reference,'text',true)+
        input('Search result container class','search_result_class',v.search_result_class,'text',false,'Use the class from the original search markup when the default Drupal result structure differs.')+
        area('Operating notes','notes',v.notes)+commands('Capture settings',
          input('Request timeout in seconds','timeout_seconds',v.timeout_seconds,'number',true)+
          input('Maximum original page bytes','max_page_bytes',v.max_page_bytes,'number',true)+
          area('Header environment bindings','header_environment',json(v.header_environment),false,'Maps exact origins to header names and environment variable names. Supply values at runtime.'))+
        area('Change note','change_note','','', 'Describe the source or target change.')+'<button class="primary">Save project</button>')));
    if(p)main.querySelector('[name=entity_id]').readOnly=true;
  }
  function stepEditor(s={},n=1){
    const e=s.expect||{},l=(e.links||[])[0]||{},r=(e.result_links||[])[0]||{},form=e.form||{};
    return '<fieldset data-visitor-step data-original="'+esc(json(s))+'"><legend>Journey step</legend><div class="visitor-columns">'+
      input('Step identifier','step_id',s.id||'step-'+n,'text',true)+input('Label','step_label',s.label||'','text',true)+'</div>'+
      input('Page or search URL','step_url',s.url||'/','text',true)+
      '<div class="visitor-columns">'+input('Expected page title contains','expected_title',e.title||'')+input('Expected heading contains','expected_heading',e.heading||'')+'</div>'+
      area('Expected page text contains','expected_text',e.text||'')+
      '<div class="visitor-columns">'+input('Expected link destination','link_url',l.url||'')+input('Expected link label contains','link_label',l.label||'')+'</div>'+
      '<div class="visitor-columns">'+input('Expected search result URL','result_url',r.url||'')+input('Maximum result rank','result_rank',r.max_rank||10,'number')+'</div>'+
      commands('Additional outcomes',
        input('Expected HTTP status','expected_status',(e.status||[]).join(','),'text',false,'Leave empty for supplied source files without origin status metadata.')+
        input('Expected form field name','form_field',form.field||'')+
        input('Expected form action','form_action',form.action||'')+
        input('Minimum captured search results','min_results',e.min_results??'','number')+
        area('Complete additional expectations','extra_expectations',json(Object.fromEntries(Object.entries(e).filter(([k])=>!['title','heading','text','status','form','min_results','links','result_links'].includes(k)))),'', 'Optional saved native outcome fields.')+
        area('Additional links','extra_links',json((e.links||[]).slice(1)))+
        area('Additional search results','extra_results',json((e.result_links||[]).slice(1))))+
      area('Step note','step_note',s.note||'')+command('Remove step','remove-step')+'</fieldset>';
  }
  function journeyEditor(j={},n=1){
    return '<fieldset class="visitor-journey" data-visitor-journey><legend>Visitor journey</legend><div class="visitor-columns">'+
      input('Journey identifier','journey_id',j.id||'journey-'+n,'text',true)+input('Journey name','journey_name',j.name||'','text',true)+'</div>'+
      area('What the visitor needs to accomplish','journey_goal',j.goal||'',true)+input('Audience','journey_audience',j.audience||'')+
      '<div data-visitor-steps>'+(j.steps||[{}]).map(stepEditor).join('')+'</div><div class="actions">'+
      command('Add step','add-step')+command('Remove journey','remove-journey')+'</div></fieldset>';
  }
  function readStep(node){
    const read=name=>node.querySelector('[name="'+name+'"]').value.trim();
    const old=parse(node.dataset.original||'{}','Original step');
    const expect=parse(read('extra_expectations')||'{}','Additional expectations');
    for(const [field,key]of[['expected_title','title'],['expected_heading','heading'],['expected_text','text']])if(read(field))expect[key]=read(field);
    if(read('expected_status'))expect.status=read('expected_status').split(',').map(v=>Number(v.trim()));
    const links=parse(read('extra_links')||'[]','Additional links');
    if(read('link_url')||read('link_label'))links.unshift({...(read('link_url')?{url:read('link_url')}:{}),...(read('link_label')?{label:read('link_label')}:{}),...((old.expect?.links||[])[0]?.origin?{origin:old.expect.links[0].origin}:{})});
    else if((old.expect?.links||[])[0]?.origin)links.unshift(old.expect.links[0]);
    if(links.length)expect.links=links;
    const results=parse(read('extra_results')||'[]','Additional search results');
    if(read('result_url'))results.unshift({url:read('result_url'),max_rank:Number(read('result_rank'))||10});
    else if((old.expect?.result_links||[])[0])results.unshift(old.expect.result_links[0]);
    if(results.length)expect.result_links=results;
    if(read('form_field'))expect.form={field:read('form_field'),method:old.expect?.form?.method||'get',...(read('form_action')?{action:read('form_action')}:{})};
    if(read('min_results')!=='')expect.min_results=Number(read('min_results'));
    return {id:read('step_id'),label:read('step_label'),url:read('step_url'),expect,note:read('step_note')};
  }
  async function set(){
    data.set=state.params.id?(await call('sets.get',{entity_id:state.params.id})).set:null;
    const s=data.set,v=s?.value||{label:'',journeys:[{}],source_reference:'',notes:''};
    page(s?'Edit saved visitor goals':'Add visitor goals','Keep stable journey identifiers so later captures and corrective work can be compared.',
      card('Journey definition',freshForm('set',
        input('Set identifier','entity_id',s?.entity_id||'','text',true)+input('Set name','label',v.label,'text',true)+
        select('Original site project','project_id',projectOptions(),s?.project_id)+
        input('Original scope reference','source_reference',v.source_reference,'text',true)+
        '<div data-visitor-journeys>'+v.journeys.map(journeyEditor).join('')+'</div>'+
        '<div class="actions">'+command('Add journey','add-journey')+'</div>'+
        area('Set notes','notes',v.notes)+area('Change note','change_note','',true)+
        '<button class="primary">Save complete journey set</button>')));
    if(s){main.querySelector('[name=entity_id]').readOnly=true;main.querySelector('[name=project_id]').disabled=true;}
  }
  async function captureNew(){
    const sets=data.snapshot.sets,selected=sets.find(x=>x.entity_id===state.params.set_id)||sets[0];
    page('Capture visitor journeys','Retain one original response per distinct page or query and reuse it across the selected visitor goals.',
      card('Capture scope',freshForm('capture',
        select('Saved journey set','set_id',sets.map(s=>[s.entity_id,s.label+' · revision '+s.revision]),selected?.entity_id)+
        select('Target site profile','project_id',projectOptions(),selected?.project_id)+
        input('Capture name','label','','text',true)+select('Edition role','role',['BASELINE','CANDIDATE','CORRECTION'],'BASELINE')+
        select('Original source','source_mode',[['HTTP','Capture original site responses'],['SUPPLIED_ORIGINAL','Import retained original page files']],'HTTP')+
        commands('Imported original source or explicit URL changes',
          area('Original source-file bindings','source_files','[]',false,'Each item: url, file_id, observed_at, acquisition. Origin status, final_url, redirects and content_type can be retained when available. Use Original sources to retain or upload the complete files.')+
          area('Explicit source-to-target URL overrides','url_overrides','{}',false,'The same relative site paths otherwise move to the selected target origin.'))+
        '<button class="primary">Start capture</button>')));
  }
  async function capture(){
    const value=await call('captures.get',{operation_id:state.params.id});data.capture=value;
    const o=value.operation;
    page('Visitor capture',o.visitor.label,
      card('Original operation',definition([['State',badgeStatus(o.state)],['Progress',esc(o.progress.completed+' / '+o.progress.total+' pages')],
        ['Journey set',esc(o.visitor.definition.entity_id+' · revision '+o.visitor.definition.revision)],
        ['Site',esc(o.visitor.project.value.base_url)],['Source method',esc(o.visitor.source_mode)],['Detail',esc(o.progress.detail)]])+
        (o.error?'<p class="callout">'+esc(o.error.message||json(o.error))+'</p>':'')+
        (o.result_edition_id?'<div class="actions">'+linkTo('Open retained edition','visitor-edition',o.result_edition_id)+'</div>':'')+
        (!['QUEUED','RUNNING','COMPLETE'].includes(o.state)?freshForm('resume',area('Reason for continuing','reason','Continue the same original page capture.',true)+'<button>Resume original operation</button>'):'')+
        (['QUEUED','RUNNING'].includes(o.state)?freshForm('cancel',area('Reason','reason','',true)+'<button>Stop remaining pages</button>'):''))+
      card('Captured source pages',rows(['URL','Original source','Outcome'],(o.checkpoint?.pages||[]).map(p=>[
        '<span class="visitor-url">'+esc(p.url)+'</span>',p.file_id?'<a href="/api/files/'+enc(p.file_id)+'">Download original page</a>':'—',
        p.error?esc(p.error.message):esc(p.status??'Retained source')+' · '+size(p.bytes)
      ])))+commands('Operation history','<pre>'+esc(json(value.events))+'</pre>'));
  }
  async function editionView(){
    data.edition=await call('editions.get',{edition_id:state.params.id});
    const {edition:e,reviews,findings,files}=data.edition;
    const unresolved=e.result.journeys.filter(j=>j.status!=='PASS');
    page(e.label,'Inspect the captured visitor outcomes, review exceptions and assign corrective implementation.',
      card('Captured edition',definition([['Role',esc(e.role)],['Capture state',esc(e.capture_status)],
        ['Site',esc(e.project.value.base_url)],['Definition',esc(e.set_id+' · revision '+e.set_revision)],
        ['Observed',esc(date(e.created_at))],['Source method',esc(e.source_mode)]])+
        '<div class="actions">'+linkTo('Original capture','visitor-capture',e.operation_id)+' '+link('Compare','visitor-compare',{after_id:e.id})+'</div>')+
      card('Visitor outcomes',outcomeTable(e))+
      card('Review',reviews.length?rows(['Revision','Decision','Reason','Reviewer'],reviews.map(r=>[
        String(r.revision),esc(r.decision),esc(r.reason),esc(r.author)+' · '+date(r.created_at)
      ])):'<p>Review this exact captured edition.</p>')+
      (['admin','reviewer'].includes(state.user.role)?card('Save review',freshForm('review',
        select('Decision','decision',[['ACCEPT','Accept the captured outcomes'],['RETURN','Return for implementation']],'RETURN')+
        area('Review decision and context','reason','',true)+
        unresolved.map(j=>'<label class="check"><input type="checkbox" name="exception" value="'+esc(j.id)+'">Accept the unresolved outcome for '+esc(j.name)+'</label>'+
          area('Reason for this exception','exception-'+j.id,'')).join('')+'<button class="primary">Save exact edition review</button>')):'')+
      card('Corrective implementation',rows(['Work','State','Owner',''],findings.map(f=>[
        esc(f.title),esc(f.status),esc(f.owner),command('Edit','edit-finding','data-id="'+esc(f.entity_id)+'"')
      ]))+'<div id="visitor-finding-editor">'+findingForm(null,e.id)+'</div>')+
      card('Original files',rows(['File','Bytes','Identity'],files.map(f=>[
        '<a href="/api/files/'+enc(f.id)+'">'+esc(f.filename)+'</a>',size(f.bytes),'<code>'+esc(f.sha256)+'</code>'
      ])))+
      commands('Complete saved definition and native result','<pre>'+esc(json({definition:e.definition,result:e.result,result_sha256:e.result_sha256}))+'</pre>'));
    data.finding=null;
  }
  function findingForm(f,editionId){
    const e=data.edition.edition;
    return freshForm('finding',
      input('Work identifier','entity_id',f?.entity_id||'','text',true)+input('Work title','title',f?.title||'','text',true)+
      select('Original visitor journey','journey_id',e.result.journeys.map(j=>[j.id,j.name]),f?.journey_id)+
      area('Implementation to make','action',f?.action||'',true)+input('Work owner','owner',f?.owner||'')+
      select('State','status',['OPEN','IN_PROGRESS','RESOLVED','EXPECTATION_CORRECTED','ACCEPTED_RISK'],f?.status||'OPEN')+
      select('Captured resolution edition','resolution_edition_id',[['','Choose when resolving'],...editionOptions()],f?.resolution_edition_id||'')+
      area('Implementation or decision note','note',f?.note||'')+'<button>Save corrective work</button>');
  }
  async function comparison(){
    let result=null;
    if(state.params.before_id&&state.params.after_id)result=await call('editions.compare',{before_id:state.params.before_id,after_id:state.params.after_id});
    data.comparison=result;
    page('Compare visitor editions','Compare complete saved outcomes while preserving changed criteria and source targets.',
      card('Selected editions',freshForm('compare',select('Baseline edition','before_id',editionOptions(),state.params.before_id)+
        select('Candidate edition','after_id',editionOptions(),state.params.after_id)+'<button class="primary">Compare retained editions</button>'))+
      (result?card('Comparison',definition([['Definition',result.definition_changed?'Changed criteria are shown per journey.':'The same saved visitor goals.'],
        ['Target',result.target_changed?'Different saved site profiles.':'The same saved site profile.'],
        ['Source bindings',result.binding_changed?'Changed query or page URL bindings.':'The same query and page URL bindings.'],
        ['Regressions',String(result.summary.regressions)],['Improvements',String(result.summary.improvements)]])+
        rows(['Journey','Baseline','Candidate','Comparison'],result.rows.map(r=>[
          esc(r.after?.name||r.before?.name||r.journey_id),badgeStatus(r.before?.status||'Absent'),badgeStatus(r.after?.status||'Absent'),
          esc(r.criteria_changed?'Criteria changed':r.regression?'Regression':r.improvement?'Improvement':r.change)
        ])))+card('Original source changes',rows(['Source URL','Baseline SHA-256','Candidate SHA-256'],result.source_changes.map(r=>[
          esc(r.url),'<code>'+esc(r.before||'Absent')+'</code>','<code>'+esc(r.after||'Absent')+'</code>'
        ]))):''));
  }
  function handover(){
    page('Customer handover','Export complete source editions, reviews and corrective history through the original GovHub handover.',
      card('Handover scope',freshForm('handover',input('Handover name','name','','text',true)+
        checks('Captured editions','edition_ids',editionOptions(),state.params.edition_id?[state.params.edition_id]:[])+
        '<label class="check"><input type="checkbox" name="include_sources" checked>Include the complete original page files</label>'+
        '<button class="primary">Create customer handover</button>'))+
      card('Editable workspace', '<p>Use Scope & backup to save the entire private operating workspace, including accounts, original captures, saved goals and review history.</p>'+link('Open backup controls','settings')));
  }
  async function render(){
    data.snapshot=await call('snapshot');
    if(state.view==='visitor-project')await project();
    else if(state.view==='visitor-set')await set();
    else if(state.view==='visitor-capture-new')await captureNew();
    else if(state.view==='visitor-capture')await capture();
    else if(state.view==='visitor-edition')await editionView();
    else if(state.view==='visitor-compare')await comparison();
    else if(state.view==='visitor-handover')handover();
    else home();
  }
  async function submit(form){
    const kind=form.dataset.form.slice(8),v=values(form),key=form.dataset.requestKey;
    if(kind==='project'){
      const origins=v.origins.split('\n').map(x=>x.trim()).filter(Boolean);
      if(!origins.length)origins.push(new URL(v.base_url).origin);
      const result=await call('projects.save',{entity_id:v.entity_id,expected_revision:data.project?.revision||0,request_key:key,
        change_note:v.change_note||'Project configuration saved',value:{label:v.label,base_url:v.base_url,allowed_origins:origins,
          source_reference:v.source_reference,notes:v.notes,search_result_class:v.search_result_class,
          timeout_seconds:Number(v.timeout_seconds),max_page_bytes:Number(v.max_page_bytes),header_environment:parse(v.header_environment||'{}','Header bindings')}});
      await reload();await go('visitor-project',{id:result.project.entity_id});notice('The project revision is saved.');
    }else if(kind==='set'){
      const journeys=[...form.querySelectorAll('[data-visitor-journey]')].map(node=>{
        const read=name=>node.querySelector('[name="'+name+'"]').value.trim();
        return {id:read('journey_id'),name:read('journey_name'),goal:read('journey_goal'),audience:read('journey_audience'),
          steps:[...node.querySelectorAll('[data-visitor-step]')].map(readStep)};
      });
      const result=await call('sets.save',{entity_id:v.entity_id,project_id:data.set?.project_id||v.project_id,
        expected_revision:data.set?.revision||0,request_key:key,change_note:v.change_note,
        value:{label:v.label,journeys,notes:v.notes,source_reference:v.source_reference}});
      await reload();await go('visitor-set',{id:result.set.entity_id});notice('The complete journey definition is saved.');
    }else if(kind==='capture'){
      const selected=data.snapshot.sets.find(s=>s.entity_id===v.set_id);
      if(!selected)throw Error('Choose a saved journey set.');
      const result=await call(v.source_mode==='SUPPLIED_ORIGINAL'?'captures.import':'captures.create',{
        set_id:selected.entity_id,expected_revision:selected.revision,project_id:v.project_id,label:v.label,role:v.role,
        request_key:key,url_overrides:parse(v.url_overrides||'{}','URL overrides'),
        ...(v.source_mode==='SUPPLIED_ORIGINAL'?{source_files:parse(v.source_files,'Original source bindings')}:{})});
      await reload();await go('visitor-capture',{id:result.operation.id});notice('The original worker has the complete capture.');
    }else if(kind==='resume'||kind==='cancel'){
      const o=data.capture.operation;
      await call('captures.'+kind,{operation_id:o.id,expected_revision:o.revision,request_key:key,reason:v.reason});
      await refresh();notice('The original capture state is saved.');
    }else if(kind==='review'){
      const e=data.edition.edition;
      await call('reviews.save',{edition_id:e.id,result_sha256:e.result_sha256,expected_revision:data.edition.reviews.length,
        decision:v.decision,reason:v.reason,request_key:key,
        exceptions:[...form.querySelectorAll('[name=exception]:checked')].map(c=>({journey_id:c.value,reason:v['exception-'+c.value]}))});
      await refresh();notice('The exact edition review is saved.');
    }else if(kind==='finding'){
      await call('findings.save',{...v,edition_id:data.edition.edition.id,expected_revision:data.finding?.revision||0,request_key:key});
      await refresh();notice('The corrective implementation and its original journey are retained.');
    }else if(kind==='compare'){
      await go('visitor-compare',{before_id:v.before_id,after_id:v.after_id});
    }else if(kind==='handover'){
      const result=await call('exports.create',{name:v.name,visitor_edition_ids:[...form.querySelectorAll('[name=edition_ids]:checked')].map(x=>x.value),
        include_sources:form.elements.include_sources.checked,request_key:key});
      await reload();await go('export',{id:result.export.id});notice('The complete customer handover is retained.');
    }
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-visitor-action]');
    if(!target)return;
    event.preventDefault();
    const action=target.dataset.visitorAction;
    if(action==='add-journey'){const p=main.querySelector('[data-visitor-journeys]');p.insertAdjacentHTML('beforeend',journeyEditor({},p.children.length+1));}
    else if(action==='remove-journey')target.closest('[data-visitor-journey]').remove();
    else if(action==='add-step'){const p=target.closest('[data-visitor-journey]').querySelector('[data-visitor-steps]');p.insertAdjacentHTML('beforeend',stepEditor({},p.children.length+1));}
    else if(action==='remove-step')target.closest('[data-visitor-step]').remove();
    else if(action==='edit-finding'){
      data.finding=data.edition.findings.find(f=>f.entity_id===target.dataset.id);
      main.querySelector('#visitor-finding-editor').innerHTML=findingForm(data.finding,data.edition.edition.id);
      main.querySelector('#visitor-finding-editor [name=entity_id]').readOnly=true;
      main.querySelector('#visitor-finding-editor').scrollIntoView({block:'start'});
    }
  });
  setInterval(()=>{
    if(state.view==='visitor-capture'&&state.user&&!state.busy&&['QUEUED','RUNNING'].includes(data.capture?.operation.state)&&!document.activeElement?.closest('form'))
      capture().catch(e=>notice(e.message,true));
  },2500);
  return {render,submit};
})();
